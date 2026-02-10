package smtp

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/dkim"
	"github.com/oonrumail/smtp-server/dmarc"
	"github.com/oonrumail/smtp-server/domain"
	"github.com/oonrumail/smtp-server/spf"
)

// processMessage handles the incoming message data
func (s *Session) processMessage(r io.Reader) error {
	ctx := context.Background()
	startTime := time.Now()

	// Read message data
	var buf bytes.Buffer
	size, err := io.Copy(&buf, r)
	if err != nil {
		return &SMTPError{
			Code:    451,
			Message: "Error reading message data",
		}
	}

	messageData := buf.Bytes()

	// Parse message headers
	msg, err := mail.ReadMessage(bytes.NewReader(messageData))
	if err != nil {
		s.logger.Warn("Failed to parse message", zap.Error(err))
		return &SMTPError{
			Code:    550,
			Message: "Invalid message format",
		}
	}

	// Extract headers
	subject := msg.Header.Get("Subject")
	messageID := msg.Header.Get("Message-ID")
	if messageID == "" {
		messageID = fmt.Sprintf("<%s@%s>", uuid.New().String(), s.backend.server.config.Server.Hostname)
	}

	s.logger.Info("Processing message",
		zap.String("message_id", messageID),
		zap.String("from", s.from),
		zap.Strings("recipients", s.recipients),
		zap.String("subject", subject),
		zap.Int64("size", size))

	// Determine if this is an internal/trusted relay (skip inbound auth checks)
	isTrustedRelay := s.authenticated || s.isTrustedNetwork()

	// For incoming messages (not authenticated and not from trusted network), perform SPF/DKIM/DMARC checks
	if !isTrustedRelay {
		result, err := s.performAuthChecks(ctx, messageData)
		if err != nil {
			s.logger.Error("Auth checks failed", zap.Error(err))
		}

		// Handle DMARC policy
		if result != nil && !result.Pass {
			switch result.Disposition {
			case "reject":
				s.backend.server.metrics.MessagesRejected.WithLabelValues(s.fromDomain, "dmarc_reject").Inc()
				return &SMTPError{
					Code:    550,
					Message: "Message rejected due to DMARC policy",
				}
			case "quarantine":
				// Mark for quarantine - continue processing
				s.logger.Info("Message quarantined due to DMARC policy",
					zap.String("message_id", messageID))
			}
		}

		// Add Authentication-Results header
		authResults := s.buildAuthResultsHeader(result)
		messageData = prependHeader(messageData, "Authentication-Results", authResults)
	}

	// For outbound messages (authenticated or from trusted network), sign with DKIM
	if isTrustedRelay {
		fromDomain := s.backend.server.domainCache.GetDomain(s.fromDomain)
		if fromDomain != nil && fromDomain.DKIMVerified {
			signedData, err := s.backend.server.dkimSigner.SignMessage(s.fromDomain, messageData, nil)
			if err != nil {
				s.logger.Warn("Failed to sign message with DKIM", zap.Error(err))
			} else {
				messageData = signedData
			}
		}
	}

	// Determine routing for each recipient
	var localRecipients []string
	var externalRecipients []string

	for _, rcpt := range s.recipients {
		rcptDomain := extractDomain(rcpt)
		if s.backend.server.domainCache.GetDomain(rcptDomain) != nil {
			localRecipients = append(localRecipients, rcpt)
		} else {
			externalRecipients = append(externalRecipients, rcpt)
		}
	}

	// Create messages for queue
	if len(localRecipients) > 0 {
		if err := s.queueLocalDelivery(ctx, messageID, messageData, localRecipients, subject); err != nil {
			s.logger.Error("Failed to queue local delivery", zap.Error(err))
			return &SMTPError{
				Code:    451,
				Message: "Temporary error queueing message",
			}
		}
	}

	if len(externalRecipients) > 0 {
		if err := s.queueExternalDelivery(ctx, messageID, messageData, externalRecipients, subject); err != nil {
			s.logger.Error("Failed to queue external delivery", zap.Error(err))
			return &SMTPError{
				Code:    451,
				Message: "Temporary error queueing message",
			}
		}
	}

	duration := time.Since(startTime)
	s.backend.server.metrics.DeliveryDuration.WithLabelValues(s.fromDomain, "accept").Observe(duration.Seconds())
	s.backend.server.metrics.MessageSize.WithLabelValues(s.fromDomain).Observe(float64(size))

	s.logger.Info("Message accepted",
		zap.String("message_id", messageID),
		zap.Int("local_recipients", len(localRecipients)),
		zap.Int("external_recipients", len(externalRecipients)),
		zap.Duration("duration", duration))

	return nil
}

func (s *Session) performAuthChecks(ctx context.Context, messageData []byte) (*AuthCheckResult, error) {
	result := &AuthCheckResult{}

	// SPF check
	spfResult := s.backend.server.spfValidator.Check(ctx, s.clientIP, s.fromDomain, s.fromDomain)
	result.SPFResult = spfResult.Result
	s.backend.server.metrics.SPFResults.WithLabelValues(s.fromDomain, string(spfResult.Result)).Inc()

	// DKIM check
	dkimResults, err := s.backend.server.dkimVerifier.VerifyMessage(messageData)
	if err != nil {
		s.logger.Warn("DKIM verification error", zap.Error(err))
	}
	result.DKIMResults = dkimResults

	dkimValid := false
	for _, dr := range dkimResults {
		if dr.Valid {
			dkimValid = true
			s.backend.server.metrics.DKIMResults.WithLabelValues(s.fromDomain, "pass").Inc()
		} else {
			s.backend.server.metrics.DKIMResults.WithLabelValues(s.fromDomain, "fail").Inc()
		}
	}
	result.DKIMValid = dkimValid

	// DMARC check
	dmarcResult := s.backend.server.dmarcValidator.Check(ctx, s.fromDomain, s.clientIP, messageData)
	result.DMARCResult = dmarcResult
	s.backend.server.metrics.DMARCResults.WithLabelValues(s.fromDomain, string(dmarcResult.Policy)).Inc()

	result.Pass = dmarcResult.Pass
	result.Disposition = dmarcResult.Disposition

	s.logger.Debug("Auth checks completed",
		zap.String("spf", string(spfResult.Result)),
		zap.Bool("dkim_valid", dkimValid),
		zap.Bool("dmarc_pass", dmarcResult.Pass),
		zap.String("disposition", dmarcResult.Disposition))

	return result, nil
}

func (s *Session) buildAuthResultsHeader(result *AuthCheckResult) string {
	hostname := s.backend.server.config.Server.Hostname
	var parts []string
	parts = append(parts, hostname)

	if result != nil {
		// SPF result
		spfPart := fmt.Sprintf("spf=%s smtp.mailfrom=%s", result.SPFResult, s.from)
		parts = append(parts, spfPart)

		// DKIM result
		for _, dr := range result.DKIMResults {
			dkimResult := "fail"
			if dr.Valid {
				dkimResult = "pass"
			}
			dkimPart := fmt.Sprintf("dkim=%s header.d=%s header.s=%s", dkimResult, dr.Domain, dr.Selector)
			parts = append(parts, dkimPart)
		}

		// DMARC result
		if result.DMARCResult != nil {
			dmarcResult := "fail"
			if result.DMARCResult.Pass {
				dmarcResult = "pass"
			}
			dmarcPart := fmt.Sprintf("dmarc=%s header.from=%s", dmarcResult, s.fromDomain)
			parts = append(parts, dmarcPart)
		}
	}

	return strings.Join(parts, "; ")
}

func (s *Session) queueLocalDelivery(ctx context.Context, messageID string, data []byte, recipients []string, subject string) error {
	// Group recipients by domain
	byDomain := make(map[string][]string)
	for _, rcpt := range recipients {
		domainName := extractDomain(rcpt)
		byDomain[domainName] = append(byDomain[domainName], rcpt)
	}

	for domainName, rcpts := range byDomain {
		d := s.backend.server.domainCache.GetDomain(domainName)
		if d == nil {
			continue
		}

		// Store message data
		msgPath, err := s.backend.server.queueManager.StoreMessage(ctx, data)
		if err != nil {
			return fmt.Errorf("store message: %w", err)
		}

		// Create queue message
		msg := &domain.Message{
			ID:             uuid.New().String(),
			OrganizationID: d.OrganizationID,
			DomainID:       d.ID,
			FromAddress:    s.from,
			Recipients:     rcpts,
			Subject:        subject,
			Headers:        extractHeaders(data),
			BodySize:       int64(len(data)),
			RawMessagePath: msgPath,
			Status:         domain.StatusPending,
			Priority:       1,
			MaxRetries:     s.backend.server.config.Queue.MaxRetries,
			CreatedAt:      time.Now(),
		}

		if err := s.backend.server.queueManager.Enqueue(ctx, msg); err != nil {
			return fmt.Errorf("enqueue message: %w", err)
		}

		s.logger.Debug("Queued local delivery",
			zap.String("message_id", messageID),
			zap.String("domain", domainName),
			zap.Int("recipients", len(rcpts)))
	}

	return nil
}

func (s *Session) queueExternalDelivery(ctx context.Context, messageID string, data []byte, recipients []string, subject string) error {
	// Group recipients by domain for efficient delivery
	byDomain := make(map[string][]string)
	for _, rcpt := range recipients {
		domainName := extractDomain(rcpt)
		byDomain[domainName] = append(byDomain[domainName], rcpt)
	}

	fromDomain := s.backend.server.domainCache.GetDomain(s.fromDomain)
	if fromDomain == nil {
		return fmt.Errorf("sender domain not found: %s", s.fromDomain)
	}

	for targetDomain, rcpts := range byDomain {
		// Store message data
		msgPath, err := s.backend.server.queueManager.StoreMessage(ctx, data)
		if err != nil {
			return fmt.Errorf("store message: %w", err)
		}

		// Create queue message for external delivery
		msg := &domain.Message{
			ID:             uuid.New().String(),
			OrganizationID: fromDomain.OrganizationID,
			DomainID:       fromDomain.ID,
			FromAddress:    s.from,
			Recipients:     rcpts,
			Subject:        subject,
			Headers:        extractHeaders(data),
			BodySize:       int64(len(data)),
			RawMessagePath: msgPath,
			Status:         domain.StatusPending,
			Priority:       1,
			MaxRetries:     s.backend.server.config.Queue.MaxRetries,
			CreatedAt:      time.Now(),
		}

		// Store target domain in headers for routing
		msg.Headers["X-Target-Domain"] = targetDomain

		if err := s.backend.server.queueManager.Enqueue(ctx, msg); err != nil {
			return fmt.Errorf("enqueue message: %w", err)
		}

		s.backend.server.metrics.MessagesSent.WithLabelValues(s.fromDomain).Inc()

		s.logger.Debug("Queued external delivery",
			zap.String("message_id", messageID),
			zap.String("target_domain", targetDomain),
			zap.Int("recipients", len(rcpts)))
	}

	return nil
}

// AuthCheckResult holds the results of SPF/DKIM/DMARC checks
type AuthCheckResult struct {
	SPFResult    spf.Result
	DKIMResults  []*dkim.VerificationResult
	DKIMValid    bool
	DMARCResult  *dmarc.CheckResult
	Pass         bool
	Disposition  string
}

// SMTPError represents an SMTP error response
type SMTPError struct {
	Code    int
	Message string
}

func (e *SMTPError) Error() string {
	return fmt.Sprintf("%d %s", e.Code, e.Message)
}

// prependHeader prepends a header to the message
func prependHeader(data []byte, name, value string) []byte {
	header := fmt.Sprintf("%s: %s\r\n", name, value)
	return append([]byte(header), data...)
}

// extractHeaders extracts common headers from message data
func extractHeaders(data []byte) map[string]string {
	headers := make(map[string]string)

	msg, err := mail.ReadMessage(bytes.NewReader(data))
	if err != nil {
		return headers
	}

	// Extract key headers
	for _, h := range []string{"From", "To", "Cc", "Subject", "Date", "Message-ID", "Reply-To"} {
		if v := msg.Header.Get(h); v != "" {
			headers[h] = v
		}
	}

	return headers
}
