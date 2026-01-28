package queue

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"go.uber.org/zap"

	"smtp-server/domain"
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
			// TODO: Generate bounce message
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

	// For local delivery, we would store in the mailbox storage
	// This is a placeholder for the actual mailbox delivery implementation
	w.logger.Debug("Local delivery",
		zap.String("message_id", msg.ID),
		zap.String("domain", targetDomain.Name),
		zap.Int("recipients", len(msg.Recipients)),
		zap.Int("size", len(data)))

	// TODO: Implement actual mailbox storage
	// For each recipient:
	// 1. Resolve aliases/distribution lists
	// 2. Check mailbox quota
	// 3. Store in mailbox
	// 4. Update mailbox storage used
	// 5. Trigger notifications (if enabled)

	return nil
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

	// Try STARTTLS
	if ok, _ := client.Extension("STARTTLS"); ok {
		config := &tls.Config{
			ServerName: host,
			MinVersion: tls.VersionTLS12,
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
