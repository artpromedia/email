package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"html"
	"net"
	"net/smtp"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"transactional-api/config"
	"transactional-api/models"
	"transactional-api/repository"
)

type EmailService struct {
	cfg             *config.Config
	emailRepo       *repository.EmailRepository
	templateRepo    *repository.TemplateRepository
	suppressionRepo *repository.SuppressionRepository
	redis           *redis.Client
	logger          *zap.Logger
	smtpPool        chan *smtpConn
}

type smtpConn struct {
	client  *smtp.Client
	created time.Time
}

func NewEmailService(
	cfg *config.Config,
	emailRepo *repository.EmailRepository,
	templateRepo *repository.TemplateRepository,
	suppressionRepo *repository.SuppressionRepository,
	redis *redis.Client,
	logger *zap.Logger,
) *EmailService {
	s := &EmailService{
		cfg:             cfg,
		emailRepo:       emailRepo,
		templateRepo:    templateRepo,
		suppressionRepo: suppressionRepo,
		redis:           redis,
		logger:          logger,
		smtpPool:        make(chan *smtpConn, cfg.SMTP.PoolSize),
	}

	// Pre-populate connection pool
	for i := 0; i < cfg.SMTP.PoolSize; i++ {
		s.smtpPool <- nil // Will be lazily initialized
	}

	return s
}

func (s *EmailService) Send(ctx context.Context, orgID uuid.UUID, req *models.SendEmailRequest) (*models.SendEmailResponse, error) {
	// Generate message ID
	messageID := uuid.New()

	// Check suppressions for all recipients
	filteredTo, droppedTo := s.filterSuppressed(ctx, orgID, req.To)
	if len(filteredTo) == 0 {
		return nil, fmt.Errorf("all recipients are suppressed")
	}
	if len(droppedTo) > 0 {
		s.logger.Info("Dropped suppressed recipients",
			zap.Int("dropped", len(droppedTo)),
			zap.Strings("emails", droppedTo))
	}

	// Resolve template if provided
	var subject, textBody, htmlBody string
	if req.TemplateID != nil {
		template, err := s.templateRepo.GetByID(ctx, *req.TemplateID, orgID)
		if err != nil {
			return nil, fmt.Errorf("template not found: %w", err)
		}
		subject, textBody, htmlBody, err = s.templateRepo.RenderTemplate(template, req.TemplateData)
		if err != nil {
			return nil, fmt.Errorf("render template: %w", err)
		}
	} else {
		subject = req.Subject
		textBody = req.TextBody
		htmlBody = req.HTMLBody
	}

	// Apply tracking if enabled
	trackOpens := s.cfg.Tracking.EnableOpen
	trackClicks := s.cfg.Tracking.EnableClick
	if req.TrackOpens != nil {
		trackOpens = *req.TrackOpens
	}
	if req.TrackClicks != nil {
		trackClicks = *req.TrackClicks
	}

	if trackOpens && htmlBody != "" {
		htmlBody = s.injectOpenTracking(htmlBody, messageID)
	}
	if trackClicks && htmlBody != "" {
		htmlBody = s.injectClickTracking(htmlBody, messageID)
	}

	// Build email
	toEmails := make([]string, len(filteredTo))
	for i, addr := range filteredTo {
		toEmails[i] = addr.Email
	}

	email := &repository.TransactionalEmail{
		ID:             messageID,
		OrganizationID: orgID,
		MessageID:      messageID.String(),
		FromEmail:      req.From.Email,
		FromName:       req.From.Name,
		ToEmails:       toEmails,
		Subject:        subject,
		TextBody:       textBody,
		HTMLBody:       htmlBody,
		Headers:        req.Headers,
		Tags:           req.Tags,
		Metadata:       req.Metadata,
		TemplateID:     req.TemplateID,
		IPPool:         req.IPPool,
		TrackOpens:     trackOpens,
		TrackClicks:    trackClicks,
		CreatedAt:      time.Now(),
	}

	// Handle CC/BCC
	if len(req.CC) > 0 {
		email.CCEmails = make([]string, len(req.CC))
		for i, addr := range req.CC {
			email.CCEmails[i] = addr.Email
		}
	}
	if len(req.BCC) > 0 {
		email.BCCEmails = make([]string, len(req.BCC))
		for i, addr := range req.BCC {
			email.BCCEmails[i] = addr.Email
		}
	}

	// Check for scheduled send
	if req.SendAt != nil && req.SendAt.After(time.Now()) {
		email.Status = "scheduled"
		email.ScheduledAt = req.SendAt
		if err := s.emailRepo.Create(ctx, email); err != nil {
			return nil, fmt.Errorf("save scheduled email: %w", err)
		}
		return &models.SendEmailResponse{
			MessageID:   messageID,
			Status:      "scheduled",
			QueuedAt:    time.Now(),
			ScheduledAt: req.SendAt,
		}, nil
	}

	// Send immediately
	email.Status = "queued"
	if err := s.emailRepo.Create(ctx, email); err != nil {
		return nil, fmt.Errorf("save email: %w", err)
	}

	// Send via SMTP (async)
	go s.sendViaSMTP(context.Background(), email, req)

	return &models.SendEmailResponse{
		MessageID: messageID,
		Status:    "queued",
		QueuedAt:  time.Now(),
	}, nil
}

func (s *EmailService) SendBatch(ctx context.Context, orgID uuid.UUID, req *models.BatchSendRequest) (*models.BatchSendEmailResponse, error) {
	response := &models.BatchSendEmailResponse{
		Messages: make([]models.SendEmailResponse, 0, len(req.Messages)),
		Errors:   make([]models.BatchError, 0),
	}

	var wg sync.WaitGroup
	var mu sync.Mutex

	// Process in parallel with limited concurrency
	semaphore := make(chan struct{}, 10)

	for i, msg := range req.Messages {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(idx int, m models.SendRequest) {
			defer wg.Done()
			defer func() { <-semaphore }()

			sendReq := &models.SendEmailRequest{
				Subject:  m.Subject,
				TextBody: m.Text,
				HTMLBody: m.HTML,
			}

			result, err := s.Send(ctx, orgID, sendReq)
			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				response.Rejected++
				response.Errors = append(response.Errors, models.BatchError{
					Index:   idx,
					Message: err.Error(),
				})
			} else {
				response.Accepted++
				response.Messages = append(response.Messages, *result)
			}
		}(i, msg)
	}

	wg.Wait()
	return response, nil
}

func (s *EmailService) filterSuppressed(ctx context.Context, orgID uuid.UUID, recipients []models.EmailAddress) ([]models.EmailAddress, []string) {
	var filtered []models.EmailAddress
	var dropped []string

	for _, addr := range recipients {
		suppressed, _, err := s.suppressionRepo.Exists(ctx, orgID, addr.Email)
		if err != nil || !suppressed {
			filtered = append(filtered, addr)
		} else {
			dropped = append(dropped, addr.Email)
		}
	}

	return filtered, dropped
}

func (s *EmailService) sendViaSMTP(ctx context.Context, email *repository.TransactionalEmail, req *models.SendEmailRequest) {
	// Get connection from pool
	conn := <-s.smtpPool
	defer func() { s.smtpPool <- conn }()

	// Build MIME message
	msg := s.buildMIMEMessage(email, req)

	// Collect all recipients
	var allRecipients []string
	allRecipients = append(allRecipients, email.ToEmails...)
	allRecipients = append(allRecipients, email.CCEmails...)
	allRecipients = append(allRecipients, email.BCCEmails...)

	// Attempt send with retries
	var lastErr error
	for attempt := 0; attempt < s.cfg.SMTP.RetryCount; attempt++ {
		// Get or create connection
		if conn == nil || conn.client == nil || time.Since(conn.created) > 5*time.Minute {
			client, err := s.createSMTPConnection()
			if err != nil {
				lastErr = err
				time.Sleep(time.Duration(attempt+1) * time.Second)
				continue
			}
			conn = &smtpConn{client: client, created: time.Now()}
		}

		// Send email
		if err := conn.client.Mail(email.FromEmail); err != nil {
			conn.client.Close()
			conn = nil
			lastErr = err
			continue
		}

		for _, rcpt := range allRecipients {
			if err := conn.client.Rcpt(rcpt); err != nil {
				conn.client.Reset()
				lastErr = err
				continue
			}
		}

		w, err := conn.client.Data()
		if err != nil {
			conn.client.Reset()
			lastErr = err
			continue
		}

		_, err = w.Write(msg)
		if err != nil {
			w.Close()
			lastErr = err
			continue
		}

		if err := w.Close(); err != nil {
			lastErr = err
			continue
		}

		// Success!
		now := time.Now()
		s.emailRepo.UpdateStatus(ctx, email.ID, "sent", &now)
		s.logger.Info("Email sent successfully",
			zap.String("message_id", email.MessageID),
			zap.Int("recipients", len(allRecipients)))
		return
	}

	// All retries failed
	s.emailRepo.UpdateStatus(ctx, email.ID, "failed", nil)
	s.logger.Error("Failed to send email after retries",
		zap.String("message_id", email.MessageID),
		zap.Error(lastErr))
}

func (s *EmailService) createSMTPConnection() (*smtp.Client, error) {
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTP.Host, s.cfg.SMTP.Port)

	tlsConfig := &tls.Config{
		ServerName:         s.cfg.SMTP.Host,
		InsecureSkipVerify: s.cfg.SMTP.InsecureSkipVerify,
	}

	var conn net.Conn
	var err error

	if s.cfg.SMTP.TLS {
		conn, err = tls.Dial("tcp", addr, tlsConfig)
	} else {
		conn, err = net.Dial("tcp", addr)
	}
	if err != nil {
		return nil, fmt.Errorf("dial SMTP: %w", err)
	}

	client, err := smtp.NewClient(conn, s.cfg.SMTP.Host)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("create SMTP client: %w", err)
	}

	// STARTTLS if not already TLS
	if !s.cfg.SMTP.TLS {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(tlsConfig); err != nil {
				s.logger.Warn("STARTTLS failed", zap.Error(err))
			}
		}
	}

	return client, nil
}

func (s *EmailService) buildMIMEMessage(email *repository.TransactionalEmail, req *models.SendEmailRequest) []byte {
	var buf bytes.Buffer
	boundary := fmt.Sprintf("----=_Part_%s", uuid.New().String()[:8])

	// Headers
	buf.WriteString(fmt.Sprintf("From: %s <%s>\r\n", email.FromName, email.FromEmail))
	buf.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(email.ToEmails, ", ")))
	if len(email.CCEmails) > 0 {
		buf.WriteString(fmt.Sprintf("Cc: %s\r\n", strings.Join(email.CCEmails, ", ")))
	}
	buf.WriteString(fmt.Sprintf("Subject: %s\r\n", email.Subject))
	buf.WriteString(fmt.Sprintf("Message-ID: <%s@transactional.mail>\r\n", email.MessageID))
	buf.WriteString("MIME-Version: 1.0\r\n")

	// Custom headers
	for k, v := range email.Headers {
		buf.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}

	// Reply-To
	if req.ReplyTo != nil {
		buf.WriteString(fmt.Sprintf("Reply-To: %s <%s>\r\n", req.ReplyTo.Name, req.ReplyTo.Email))
	}

	// Check if we have attachments
	hasAttachments := len(req.Attachments) > 0

	if hasAttachments {
		mixedBoundary := fmt.Sprintf("----=_Mixed_%s", uuid.New().String()[:8])
		buf.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n", mixedBoundary))

		// Start body part
		buf.WriteString(fmt.Sprintf("--%s\r\n", mixedBoundary))
		buf.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", boundary))
	} else {
		buf.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", boundary))
	}

	// Text part
	if email.TextBody != "" {
		buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		buf.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		buf.WriteString(email.TextBody)
		buf.WriteString("\r\n")
	}

	// HTML part
	if email.HTMLBody != "" {
		buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		buf.WriteString(email.HTMLBody)
		buf.WriteString("\r\n")
	}

	buf.WriteString(fmt.Sprintf("--%s--\r\n", boundary))

	// Attachments
	if hasAttachments {
		mixedBoundary := fmt.Sprintf("----=_Mixed_%s", uuid.New().String()[:8])
		for _, att := range req.Attachments {
			buf.WriteString(fmt.Sprintf("--%s\r\n", mixedBoundary))
			buf.WriteString(fmt.Sprintf("Content-Type: %s; name=\"%s\"\r\n", att.ContentType, att.Filename))
			buf.WriteString("Content-Transfer-Encoding: base64\r\n")

			disposition := "attachment"
			if att.Disposition == "inline" {
				disposition = "inline"
			}
			buf.WriteString(fmt.Sprintf("Content-Disposition: %s; filename=\"%s\"\r\n", disposition, att.Filename))

			if att.ContentID != "" {
				buf.WriteString(fmt.Sprintf("Content-ID: <%s>\r\n", att.ContentID))
			}

			buf.WriteString("\r\n")
			buf.WriteString(att.Content)
			buf.WriteString("\r\n")
		}
		buf.WriteString(fmt.Sprintf("--%s--\r\n", mixedBoundary))
	}

	return buf.Bytes()
}

func (s *EmailService) injectOpenTracking(htmlBody string, messageID uuid.UUID) string {
	// Inject tracking pixel before </body>
	pixelURL := fmt.Sprintf("%s%s/%s.gif", s.cfg.Tracking.TrackingHost, s.cfg.Tracking.PixelPath, messageID)
	pixel := fmt.Sprintf(`<img src="%s" width="1" height="1" style="display:none" alt="" />`, pixelURL)

	if strings.Contains(htmlBody, "</body>") {
		return strings.Replace(htmlBody, "</body>", pixel+"</body>", 1)
	}
	return htmlBody + pixel
}

func (s *EmailService) injectClickTracking(htmlBody string, messageID uuid.UUID) string {
	// Replace all links with tracked versions
	re := regexp.MustCompile(`href="(https?://[^"]+)"`)
	return re.ReplaceAllStringFunc(htmlBody, func(match string) string {
		url := match[6 : len(match)-1] // Extract URL from href="URL"
		trackedURL := fmt.Sprintf("%s%s/%s?url=%s",
			s.cfg.Tracking.TrackingHost,
			s.cfg.Tracking.ClickPath,
			messageID,
			base64.URLEncoding.EncodeToString([]byte(url)))
		return fmt.Sprintf(`href="%s"`, html.EscapeString(trackedURL))
	})
}

func (s *EmailService) ProcessScheduledEmails(ctx context.Context) error {
	emails, err := s.emailRepo.GetScheduledEmails(ctx, time.Now(), 100)
	if err != nil {
		return fmt.Errorf("get scheduled emails: %w", err)
	}

	for _, email := range emails {
		req := &models.SendEmailRequest{
			From: models.EmailAddress{Email: email.FromEmail, Name: email.FromName},
		}
		go s.sendViaSMTP(ctx, email, req)
	}

	return nil
}
