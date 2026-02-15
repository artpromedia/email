package queue

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"text/template"
	"time"

	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/domain"
)

// Worker processes messages from the queue
type Worker struct {
	id      int
	manager *Manager
	logger  *zap.Logger
}

// NewWorker creates a new queue worker
func NewWorker(id int, manager *Manager, logger *zap.Logger) *Worker {
	return &Worker{
		id:      id,
		manager: manager,
		logger:  logger,
	}
}

// Run starts the worker loop
func (w *Worker) Run(ctx context.Context) {
	w.logger.Info("Worker started")

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.logger.Info("Worker stopping")
			return
		case <-w.manager.stopChan:
			w.logger.Info("Worker stopping")
			return
		case <-ticker.C:
			w.processMessages(ctx)
		}
	}
}

func (w *Worker) processMessages(ctx context.Context) {
	// Get batch of pending messages
	messages, err := w.manager.GetPendingMessages(ctx, 10)
	if err != nil {
		w.logger.Error("Failed to get pending messages", zap.Error(err))
		return
	}

	for _, msg := range messages {
		select {
		case <-ctx.Done():
			return
		default:
			w.processMessage(ctx, msg)
		}
	}
}

func (w *Worker) processMessage(ctx context.Context, msg *domain.Message) {
	startTime := time.Now()

	w.logger.Debug("Processing message",
		zap.String("message_id", msg.ID),
		zap.String("from", msg.FromAddress),
		zap.Int("recipients", len(msg.Recipients)))

	// Mark as processing
	if err := w.manager.MarkProcessing(ctx, msg.ID); err != nil {
		w.logger.Error("Failed to mark message processing", zap.Error(err))
		return
	}

	// Determine if this is local or external delivery
	targetDomain := msg.Headers["X-Target-Domain"]
	if targetDomain == "" {
		// Local delivery - extract from first recipient
		if len(msg.Recipients) > 0 {
			parts := strings.Split(msg.Recipients[0], "@")
			if len(parts) == 2 {
				targetDomain = parts[1]
			}
		}
	}

	// Check if target is local
	localDomain := w.manager.domainCache.GetDomain(targetDomain)

	var err error
	if localDomain != nil {
		err = w.deliverLocal(ctx, msg, localDomain)
	} else {
		err = w.deliverExternal(ctx, msg, targetDomain)
	}

	duration := time.Since(startTime)

	if err != nil {
		w.logger.Warn("Message delivery failed",
			zap.String("message_id", msg.ID),
			zap.Error(err),
			zap.Duration("duration", duration))

		// Check if we should retry
		if msg.RetryCount < msg.MaxRetries {
			if err := w.manager.ScheduleRetry(ctx, msg, err.Error()); err != nil {
				w.logger.Error("Failed to schedule retry", zap.Error(err))
			}
		} else {
			// Max retries exceeded
			if err := w.manager.MarkFailed(ctx, msg); err != nil {
				w.logger.Error("Failed to mark message failed", zap.Error(err))
			}
			// Generate and queue bounce message
			if err := w.generateBounceMessage(ctx, msg, "Delivery failed after maximum retry attempts"); err != nil {
				w.logger.Error("Failed to generate bounce message", zap.Error(err))
			}
		}
	} else {
		// Mark as delivered
		if err := w.manager.UpdateMessageStatus(ctx, msg.ID, domain.StatusDelivered); err != nil {
			w.logger.Error("Failed to mark message delivered", zap.Error(err))
		}

		w.logger.Info("Message delivered",
			zap.String("message_id", msg.ID),
			zap.String("target", targetDomain),
			zap.Duration("duration", duration))

		// Clean up stored message data
		if msg.RawMessagePath != "" {
			if err := w.manager.DeleteMessageData(msg.RawMessagePath); err != nil {
				w.logger.Warn("Failed to delete message data", zap.Error(err))
			}
		}
	}
}

func (w *Worker) deliverLocal(ctx context.Context, msg *domain.Message, targetDomain *domain.Domain) error {
	// Read message data
	data, err := w.manager.GetMessageData(msg.RawMessagePath)
	if err != nil {
		return fmt.Errorf("read message data: %w", err)
	}

	w.logger.Debug("Local delivery starting",
		zap.String("message_id", msg.ID),
		zap.String("domain", targetDomain.Name),
		zap.Int("recipients", len(msg.Recipients)),
		zap.Int("size", len(data)))

	// Process each recipient
	var deliveryErrors []error
	for _, recipient := range msg.Recipients {
		if err := w.deliverToMailbox(ctx, msg, targetDomain, recipient, data); err != nil {
			w.logger.Warn("Failed to deliver to recipient",
				zap.String("recipient", recipient),
				zap.Error(err))
			deliveryErrors = append(deliveryErrors, fmt.Errorf("%s: %w", recipient, err))
		}
	}

	// If all deliveries failed, return error
	if len(deliveryErrors) == len(msg.Recipients) {
		return fmt.Errorf("delivery failed for all recipients")
	}

	// If some deliveries failed, we should generate partial bounce
	if len(deliveryErrors) > 0 {
		w.logger.Warn("Partial delivery failure",
			zap.String("message_id", msg.ID),
			zap.Int("failed", len(deliveryErrors)),
			zap.Int("total", len(msg.Recipients)))
	}

	return nil
}

// deliverToMailbox delivers a message to a single recipient's mailbox
func (w *Worker) deliverToMailbox(ctx context.Context, msg *domain.Message, targetDomain *domain.Domain, recipient string, data []byte) error {
	// Look up recipient (could be mailbox, alias, or distribution list)
	lookupResult, err := w.manager.LookupRecipient(ctx, recipient)
	if err != nil {
		return fmt.Errorf("lookup recipient: %w", err)
	}

	if !lookupResult.Found {
		// Check if catch-all is enabled
		if targetDomain.Policies != nil && targetDomain.Policies.CatchAllEnabled && targetDomain.Policies.CatchAllAddress != "" {
			// Redirect to catch-all
			lookupResult, err = w.manager.LookupRecipient(ctx, targetDomain.Policies.CatchAllAddress)
			if err != nil || !lookupResult.Found {
				return fmt.Errorf("recipient not found and catch-all failed")
			}
		} else if targetDomain.Policies != nil && targetDomain.Policies.RejectUnknownUsers {
			return fmt.Errorf("recipient not found: %s", recipient)
		} else {
			return fmt.Errorf("recipient not found: %s", recipient)
		}
	}

	// Handle different recipient types
	switch lookupResult.Type {
	case "mailbox":
		return w.storeInMailbox(ctx, msg, lookupResult.Mailbox, data)
	case "alias":
		// Recursively deliver to alias target
		return w.deliverToMailbox(ctx, msg, targetDomain, lookupResult.Alias.TargetEmail, data)
	case "distribution_list":
		// Deliver to all distribution list members
		for _, member := range lookupResult.DistributionList.Members {
			if err := w.deliverToMailbox(ctx, msg, targetDomain, member, data); err != nil {
				w.logger.Warn("Failed to deliver to DL member",
					zap.String("member", member),
					zap.Error(err))
			}
		}
		return nil
	default:
		return fmt.Errorf("unknown recipient type: %s", lookupResult.Type)
	}
}

// storeInMailbox stores a message in a user's mailbox with atomic quota enforcement
func (w *Worker) storeInMailbox(ctx context.Context, msg *domain.Message, mailbox *domain.Mailbox, data []byte) error {
	messageSize := int64(len(data))

	// Atomic quota check and update - prevents race conditions
	newUsedBytes, quotaBytes, err := w.manager.AtomicQuotaCheckAndUpdate(ctx, mailbox.ID, messageSize)
	if err != nil {
		if errors.Is(err, w.manager.ErrQuotaExceeded()) {
			// Record quota exceeded metric
			w.manager.RecordQuotaExceeded(mailbox.ID, mailbox.Email)
			return fmt.Errorf("mailbox quota exceeded: %d/%d bytes used", mailbox.UsedBytes, mailbox.QuotaBytes)
		}
		return fmt.Errorf("quota check failed: %w", err)
	}

	// Check for quota warning thresholds and send notifications if needed
	if quotaBytes > 0 {
		usagePercent := float64(newUsedBytes) / float64(quotaBytes) * 100
		w.checkQuotaWarnings(ctx, mailbox, usagePercent)
	}

	// Store message in mailbox storage
	storagePath := fmt.Sprintf("%s/%s/%s/INBOX/%s.eml",
		mailbox.OrganizationID,
		mailbox.DomainID,
		mailbox.ID,
		msg.ID,
	)

	if err := w.manager.StoreMailboxMessage(ctx, storagePath, data); err != nil {
		// Rollback quota update on storage failure
		if rollbackErr := w.manager.UpdateMailboxUsage(ctx, mailbox.ID, -messageSize); rollbackErr != nil {
			w.logger.Error("Failed to rollback quota update",
				zap.String("mailbox_id", mailbox.ID),
				zap.Error(rollbackErr))
		}
		return fmt.Errorf("store message: %w", err)
	}

	// Record message in mailbox messages table
	if err := w.manager.RecordMailboxMessage(ctx, mailbox.ID, msg, storagePath, messageSize); err != nil {
		w.logger.Warn("Failed to record mailbox message",
			zap.String("mailbox_id", mailbox.ID),
			zap.Error(err))
	}

	// Deliver to mail_messages table (web app UI) — best-effort
	if err := w.manager.DeliverToMailFolder(ctx, mailbox.ID, msg, data, storagePath); err != nil {
		w.logger.Warn("Failed to deliver to mail_messages",
			zap.String("mailbox_id", mailbox.ID),
			zap.Error(err))
	}

	// Record quota metrics
	w.manager.RecordQuotaUsage(mailbox.ID, mailbox.Email, newUsedBytes, quotaBytes)

	w.logger.Debug("Message stored in mailbox",
		zap.String("message_id", msg.ID),
		zap.String("mailbox", mailbox.Email),
		zap.Int64("size", messageSize),
		zap.Int64("used_bytes", newUsedBytes),
		zap.Int64("quota_bytes", quotaBytes))

	return nil
}

// checkQuotaWarnings checks if quota warning thresholds have been crossed
func (w *Worker) checkQuotaWarnings(ctx context.Context, mailbox *domain.Mailbox, usagePercent float64) {
	// Check each threshold and send warnings
	for _, threshold := range []struct {
		percent     float64
		description string
	}{
		{95, "95% - Critical"},
		{90, "90%"},
		{80, "80%"},
	} {
		if usagePercent >= threshold.percent {
			// Check if we've already sent this warning recently (within 24 hours)
			warningKey := fmt.Sprintf("quota_warning:%s:%.0f", mailbox.ID, threshold.percent)
			if !w.manager.HasRecentQuotaWarning(ctx, warningKey) {
				// Send quota warning email
				if err := w.manager.SendQuotaWarningEmail(ctx, mailbox, threshold.percent, threshold.description); err != nil {
					w.logger.Warn("Failed to send quota warning email",
						zap.String("mailbox", mailbox.Email),
						zap.Float64("threshold", threshold.percent),
						zap.Error(err))
				} else {
					// Mark warning as sent
					w.manager.MarkQuotaWarningSent(ctx, warningKey)
					w.logger.Info("Quota warning sent",
						zap.String("mailbox", mailbox.Email),
						zap.Float64("usage_percent", usagePercent),
						zap.String("threshold", threshold.description))
				}
			}
			// Only send the highest applicable warning
			break
		}
	}
}

func (w *Worker) deliverExternal(ctx context.Context, msg *domain.Message, targetDomain string) error {
	// Read message data
	data, err := w.manager.GetMessageData(msg.RawMessagePath)
	if err != nil {
		return fmt.Errorf("read message data: %w", err)
	}

	// Lookup MX records
	mxRecords, err := net.LookupMX(targetDomain)
	if err != nil {
		return fmt.Errorf("lookup MX for %s: %w", targetDomain, err)
	}

	if len(mxRecords) == 0 {
		return fmt.Errorf("no MX records for %s", targetDomain)
	}

	// Try MX hosts in priority order
	var lastErr error
	for _, mx := range mxRecords {
		host := strings.TrimSuffix(mx.Host, ".")
		err := w.deliverToHost(ctx, host, msg, data)
		if err == nil {
			return nil
		}
		lastErr = err
		w.logger.Debug("Failed to deliver to MX host",
			zap.String("host", host),
			zap.Error(err))
	}

	return fmt.Errorf("all MX hosts failed: %w", lastErr)
}

func (w *Worker) deliverToHost(ctx context.Context, host string, msg *domain.Message, data []byte) error {
	// Try port 25 with STARTTLS
	addr := fmt.Sprintf("%s:25", host)

	// Connect with timeout
	dialer := &net.Dialer{Timeout: 30 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", addr, err)
	}
	defer conn.Close()

	// Create SMTP client
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("create SMTP client: %w", err)
	}
	defer client.Close()

	// Say hello
	if err := client.Hello(w.manager.config.Server.Hostname); err != nil {
		return fmt.Errorf("HELO: %w", err)
	}

	// Try STARTTLS with TLS 1.3 preferred
	if ok, _ := client.Extension("STARTTLS"); ok {
		config := &tls.Config{
			ServerName: host,
			MinVersion: tls.VersionTLS12, // Allow TLS 1.2 for outbound compatibility
			CurvePreferences: []tls.CurveID{
				tls.X25519,
				tls.CurveP384,
				tls.CurveP256,
			},
		}
		if err := client.StartTLS(config); err != nil {
			w.logger.Debug("STARTTLS failed, continuing without TLS",
				zap.String("host", host),
				zap.Error(err))
		}
	}

	// Set sender
	if err := client.Mail(msg.FromAddress); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}

	// Set recipients
	for _, rcpt := range msg.Recipients {
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("RCPT TO %s: %w", rcpt, err)
		}
	}

	// Send data
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}

	if _, err := writer.Write(data); err != nil {
		return fmt.Errorf("write data: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("close data: %w", err)
	}

	// Quit
	if err := client.Quit(); err != nil {
		w.logger.Debug("QUIT failed", zap.Error(err))
	}

	return nil
}

// bounceTemplate is the template for bounce messages
var bounceTemplate = template.Must(template.New("bounce").Parse(`From: Mail Delivery System <MAILER-DAEMON@{{.LocalDomain}}>
To: {{.OriginalSender}}
Subject: Undelivered Mail Returned to Sender
Date: {{.Date}}
Message-ID: <{{.BounceID}}@{{.LocalDomain}}>
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status;
	boundary="{{.Boundary}}"

This is a MIME-encapsulated message.

--{{.Boundary}}
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 7bit

This is the mail system at host {{.LocalDomain}}.

I'm sorry to have to inform you that your message could not
be delivered to one or more recipients. It's attached below.

For further assistance, please send mail to postmaster.

If you do so, please include this problem report. You can
delete your own text from the attached returned message.

                   The mail system

{{range .FailedRecipients}}
<{{.Address}}>: {{.Reason}}
{{end}}

--{{.Boundary}}
Content-Type: message/delivery-status

Reporting-MTA: dns; {{.LocalDomain}}
Arrival-Date: {{.ArrivalDate}}

{{range .FailedRecipients}}
Final-Recipient: rfc822; {{.Address}}
Action: failed
Status: 5.0.0
Diagnostic-Code: smtp; {{.Reason}}
{{end}}

--{{.Boundary}}
Content-Type: message/rfc822
Content-Disposition: inline

{{.OriginalHeaders}}
--{{.Boundary}}--
`))

// bounceData holds the data for generating bounce messages
type bounceData struct {
	LocalDomain      string
	OriginalSender   string
	Date             string
	BounceID         string
	Boundary         string
	ArrivalDate      string
	FailedRecipients []failedRecipient
	OriginalHeaders  string
}

type failedRecipient struct {
	Address string
	Reason  string
}

// generateBounceMessage creates and queues a bounce message for a failed delivery
func (w *Worker) generateBounceMessage(ctx context.Context, msg *domain.Message, reason string) error {
	// Don't bounce bounces (null sender)
	if msg.FromAddress == "" || strings.HasPrefix(msg.FromAddress, "MAILER-DAEMON") {
		w.logger.Debug("Not bouncing a bounce message",
			zap.String("message_id", msg.ID))
		return nil
	}

	// Extract original headers from message
	originalHeaders := ""
	if msg.RawMessagePath != "" {
		data, err := w.manager.GetMessageData(msg.RawMessagePath)
		if err == nil {
			// Extract just headers (up to first blank line)
			if idx := bytes.Index(data, []byte("\r\n\r\n")); idx > 0 {
				originalHeaders = string(data[:idx])
			} else if idx := bytes.Index(data, []byte("\n\n")); idx > 0 {
				originalHeaders = string(data[:idx])
			}
		}
	}

	// Create bounce data
	now := time.Now()
	data := bounceData{
		LocalDomain:    w.manager.config.Server.Hostname,
		OriginalSender: msg.FromAddress,
		Date:           now.Format(time.RFC1123Z),
		BounceID:       fmt.Sprintf("bounce-%s-%d", msg.ID, now.UnixNano()),
		Boundary:       fmt.Sprintf("----=_Part_%d_%d", now.UnixNano(), now.Unix()),
		ArrivalDate:    msg.QueuedAt.Format(time.RFC1123Z),
		OriginalHeaders: originalHeaders,
	}

	// Add failed recipients
	for _, rcpt := range msg.Recipients {
		data.FailedRecipients = append(data.FailedRecipients, failedRecipient{
			Address: rcpt,
			Reason:  reason,
		})
	}

	// Render bounce message
	var buf bytes.Buffer
	if err := bounceTemplate.Execute(&buf, data); err != nil {
		return fmt.Errorf("render bounce template: %w", err)
	}

	// Create bounce message
	bounceMsg := &domain.Message{
		ID:             fmt.Sprintf("bounce-%s", msg.ID),
		OrganizationID: msg.OrganizationID,
		FromAddress:    "", // Null sender for bounces
		Recipients:     []string{msg.FromAddress},
		Headers: map[string]string{
			"X-Original-Message-ID": msg.ID,
			"X-Bounce-Reason":       reason,
		},
		Status:    domain.StatusQueued,
		QueuedAt:  now,
		MaxRetries: 3, // Fewer retries for bounces
	}

	// Store bounce message data
	bouncePath, err := w.manager.StoreMessage(ctx, buf.Bytes())
	if err != nil {
		return fmt.Errorf("store bounce message: %w", err)
	}
	bounceMsg.RawMessagePath = bouncePath

	// Queue the bounce
	if err := w.manager.Enqueue(ctx, bounceMsg); err != nil {
		return fmt.Errorf("enqueue bounce: %w", err)
	}

	w.logger.Info("Bounce message generated",
		zap.String("original_id", msg.ID),
		zap.String("bounce_id", bounceMsg.ID),
		zap.String("sender", msg.FromAddress))

	return nil
}
