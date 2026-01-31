package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/smtp"
	"strings"
	"time"

	"github.com/artpromedia/email/services/transactional-api/config"
	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// SenderService handles email sending business logic
type SenderService struct {
	config           *config.Config
	messageRepo      *repository.MessageRepository
	suppressionRepo  *repository.SuppressionRepository
	templateService  *TemplateService
	trackingService  *TrackingService
	analyticsRepo    *repository.AnalyticsRepository
	redis            *redis.Client
	logger           zerolog.Logger
}

// NewSenderService creates a new SenderService
func NewSenderService(
	cfg *config.Config,
	messageRepo *repository.MessageRepository,
	suppressionRepo *repository.SuppressionRepository,
	templateService *TemplateService,
	trackingService *TrackingService,
	analyticsRepo *repository.AnalyticsRepository,
	redisClient *redis.Client,
	logger zerolog.Logger,
) *SenderService {
	return &SenderService{
		config:          cfg,
		messageRepo:     messageRepo,
		suppressionRepo: suppressionRepo,
		templateService: templateService,
		trackingService: trackingService,
		analyticsRepo:   analyticsRepo,
		redis:           redisClient,
		logger:          logger,
	}
}

// Send sends a transactional email
func (s *SenderService) Send(ctx context.Context, req *models.SendRequest, apiKey *models.APIKey) (*models.SendResponse, error) {
	// Validate request
	if err := s.validateRequest(req); err != nil {
		return nil, err
	}

	// Check suppression list
	accepted, rejected := s.filterSuppressedRecipients(ctx, apiKey.DomainID, req.To)

	if len(accepted) == 0 {
		return &models.SendResponse{
			MessageID: "",
			Status:    "rejected",
			Rejected:  rejected,
			QueuedAt:  time.Now(),
		}, nil
	}

	// Render template if provided
	var subject, html, text string
	if req.TemplateID != "" {
		templateID, err := uuid.Parse(req.TemplateID)
		if err != nil {
			return nil, fmt.Errorf("invalid template_id: %w", err)
		}

		rendered, err := s.templateService.Render(ctx, templateID, req.Substitutions)
		if err != nil {
			return nil, fmt.Errorf("failed to render template: %w", err)
		}

		subject = rendered.Subject
		html = rendered.HTML
		text = rendered.Text
	} else {
		subject = req.Subject
		html = req.HTML
		text = req.Text
	}

	// Apply variable substitution to subject/content
	if len(req.Substitutions) > 0 {
		subject = applySubstitutions(subject, req.Substitutions)
		html = applySubstitutions(html, req.Substitutions)
		text = applySubstitutions(text, req.Substitutions)
	}

	// Create message record
	messageID := uuid.New()
	var templateID *uuid.UUID
	if req.TemplateID != "" {
		tid, _ := uuid.Parse(req.TemplateID)
		templateID = &tid
	}

	// Determine tracking settings
	trackOpens := s.config.Tracking.Enabled
	trackClicks := s.config.Tracking.Enabled
	if req.TrackOpens != nil {
		trackOpens = *req.TrackOpens
	}
	if req.TrackClicks != nil {
		trackClicks = *req.TrackClicks
	}

	// Add tracking pixel and rewrite links if enabled
	if trackOpens && html != "" {
		html = s.trackingService.AddTrackingPixel(html, messageID.String(), apiKey.DomainID.String())
	}
	if trackClicks && html != "" {
		html = s.trackingService.RewriteLinks(html, messageID.String(), apiKey.DomainID.String())
	}

	// Determine status based on scheduling
	status := models.MessageStatusQueued
	if req.SendAt != nil && req.SendAt.After(time.Now()) {
		status = models.MessageStatusScheduled
	}

	message := &models.Message{
		ID:          messageID,
		DomainID:    apiKey.DomainID,
		APIKeyID:    apiKey.ID,
		From:        req.From,
		To:          accepted,
		CC:          req.CC,
		BCC:         req.BCC,
		ReplyTo:     req.ReplyTo,
		Subject:     subject,
		HTML:        html,
		Text:        text,
		TemplateID:  templateID,
		Categories:  req.Categories,
		CustomArgs:  req.CustomArgs,
		Headers:     req.Headers,
		Status:      status,
		TrackOpens:  trackOpens,
		TrackClicks: trackClicks,
		ScheduledAt: req.SendAt,
		QueuedAt:    time.Now(),
	}

	// Save message to database
	if err := s.messageRepo.Create(ctx, message); err != nil {
		return nil, fmt.Errorf("failed to save message: %w", err)
	}

	// Queue for delivery (or schedule)
	if status == models.MessageStatusQueued {
		if err := s.queueForDelivery(ctx, message); err != nil {
			s.logger.Error().Err(err).Str("message_id", messageID.String()).Msg("Failed to queue message")
			// Don't fail the request, message is saved and can be retried
		}
	}

	// Update analytics
	category := ""
	if len(req.Categories) > 0 {
		category = req.Categories[0]
	}
	go s.analyticsRepo.IncrementDailyStat(context.Background(), apiKey.DomainID, category, "sent")

	s.logger.Info().
		Str("message_id", messageID.String()).
		Str("from", req.From).
		Int("recipients", len(accepted)).
		Str("status", string(status)).
		Msg("Email queued for delivery")

	return &models.SendResponse{
		MessageID: messageID.String(),
		Status:    string(status),
		Accepted:  accepted,
		Rejected:  rejected,
		QueuedAt:  message.QueuedAt,
	}, nil
}

// SendBatch sends multiple emails in a batch
func (s *SenderService) SendBatch(ctx context.Context, req *models.BatchSendRequest, apiKey *models.APIKey) (*models.BatchSendResponse, error) {
	batchID := req.BatchID
	if batchID == "" {
		batchID = uuid.New().String()
	}

	var results []models.SendResponse
	totalQueued := 0

	for _, sendReq := range req.Messages {
		resp, err := s.Send(ctx, &sendReq, apiKey)
		if err != nil {
			results = append(results, models.SendResponse{
				Status: "failed",
				Rejected: []models.RejectedRecipient{{
					Email:  strings.Join(sendReq.To, ", "),
					Reason: err.Error(),
					Code:   "send_failed",
				}},
			})
			continue
		}
		results = append(results, *resp)
		if resp.Status == "queued" || resp.Status == "scheduled" {
			totalQueued++
		}
	}

	return &models.BatchSendResponse{
		BatchID:     batchID,
		TotalQueued: totalQueued,
		Results:     results,
	}, nil
}

// GetMessage retrieves a message by ID
func (s *SenderService) GetMessage(ctx context.Context, id uuid.UUID) (*models.Message, error) {
	return s.messageRepo.GetByID(ctx, id)
}

// ListMessages retrieves messages with filtering
func (s *SenderService) ListMessages(ctx context.Context, query *models.MessageQuery) (*models.MessageListResponse, error) {
	if query.Limit <= 0 {
		query.Limit = 20
	}
	if query.Limit > 100 {
		query.Limit = 100
	}

	return s.messageRepo.List(ctx, query)
}

// GetMessageTimeline retrieves the event timeline for a message
func (s *SenderService) GetMessageTimeline(ctx context.Context, messageID uuid.UUID) (*models.MessageTimeline, error) {
	return s.messageRepo.GetMessageTimeline(ctx, messageID)
}

// validateRequest validates a send request
func (s *SenderService) validateRequest(req *models.SendRequest) error {
	if req.From == "" {
		return fmt.Errorf("from address is required")
	}
	if len(req.To) == 0 {
		return fmt.Errorf("at least one recipient is required")
	}
	if req.Subject == "" && req.TemplateID == "" {
		return fmt.Errorf("subject is required when not using a template")
	}
	if req.HTML == "" && req.Text == "" && req.TemplateID == "" {
		return fmt.Errorf("either html, text, or template_id is required")
	}
	return nil
}

// filterSuppressedRecipients filters out suppressed email addresses
func (s *SenderService) filterSuppressedRecipients(ctx context.Context, domainID uuid.UUID, recipients []string) ([]string, []models.RejectedRecipient) {
	var accepted []string
	var rejected []models.RejectedRecipient

	// Check all recipients against suppression list
	checkResp, err := s.suppressionRepo.CheckMultiple(ctx, domainID, recipients)
	if err != nil {
		s.logger.Warn().Err(err).Msg("Failed to check suppression list, accepting all recipients")
		return recipients, nil
	}

	for _, email := range recipients {
		status, ok := checkResp.Results[email]
		if ok && status.Suppressed {
			rejected = append(rejected, models.RejectedRecipient{
				Email:  email,
				Reason: string(status.Reason),
				Code:   "suppressed",
			})
		} else {
			accepted = append(accepted, email)
		}
	}

	return accepted, rejected
}

// queueForDelivery adds a message to the delivery queue
func (s *SenderService) queueForDelivery(ctx context.Context, message *models.Message) error {
	// Serialize message for queue
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	// Add to Redis queue
	queueKey := "email:queue:pending"
	return s.redis.RPush(ctx, queueKey, data).Err()
}

// ProcessQueue processes messages from the delivery queue
func (s *SenderService) ProcessQueue(ctx context.Context) error {
	queueKey := "email:queue:pending"
	processingKey := "email:queue:processing"

	// Move message from pending to processing
	data, err := s.redis.BRPopLPush(ctx, queueKey, processingKey, 30*time.Second).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil // No messages in queue
		}
		return err
	}

	var message models.Message
	if err := json.Unmarshal(data, &message); err != nil {
		return err
	}

	// Send the email
	err = s.deliverEmail(ctx, &message)
	if err != nil {
		s.logger.Error().Err(err).Str("message_id", message.ID.String()).Msg("Failed to deliver email")

		// Update message status
		s.messageRepo.UpdateStatus(ctx, message.ID, models.MessageStatusFailed, err.Error())

		// Move to dead letter queue after max retries
		s.redis.LRem(ctx, processingKey, 1, data)
		return err
	}

	// Remove from processing queue
	s.redis.LRem(ctx, processingKey, 1, data)

	return nil
}

// deliverEmail sends an email via SMTP
func (s *SenderService) deliverEmail(ctx context.Context, message *models.Message) error {
	// Update status to sending
	s.messageRepo.UpdateStatus(ctx, message.ID, models.MessageStatusSending, "")

	// Build email message
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("From: %s\r\n", message.From))
	buf.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(message.To, ", ")))
	if message.ReplyTo != "" {
		buf.WriteString(fmt.Sprintf("Reply-To: %s\r\n", message.ReplyTo))
	}
	buf.WriteString(fmt.Sprintf("Subject: %s\r\n", message.Subject))
	buf.WriteString(fmt.Sprintf("Message-ID: <%s@%s>\r\n", message.ID.String(), s.config.SMTP.FromDomain))
	buf.WriteString("MIME-Version: 1.0\r\n")

	// Add custom headers
	for key, value := range message.Headers {
		buf.WriteString(fmt.Sprintf("%s: %s\r\n", key, value))
	}

	// Multipart message
	if message.HTML != "" && message.Text != "" {
		boundary := "boundary-" + message.ID.String()
		buf.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=%s\r\n\r\n", boundary))

		// Text part
		buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		buf.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
		buf.WriteString(message.Text)
		buf.WriteString("\r\n")

		// HTML part
		buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		buf.WriteString("Content-Type: text/html; charset=utf-8\r\n\r\n")
		buf.WriteString(message.HTML)
		buf.WriteString("\r\n")

		buf.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	} else if message.HTML != "" {
		buf.WriteString("Content-Type: text/html; charset=utf-8\r\n\r\n")
		buf.WriteString(message.HTML)
	} else {
		buf.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
		buf.WriteString(message.Text)
	}

	// Connect to SMTP server
	addr := fmt.Sprintf("%s:%d", s.config.SMTP.Host, s.config.SMTP.Port)

	var auth smtp.Auth
	if s.config.SMTP.Username != "" {
		auth = smtp.PlainAuth("", s.config.SMTP.Username, s.config.SMTP.Password, s.config.SMTP.Host)
	}

	// Send email
	allRecipients := append(message.To, message.CC...)
	allRecipients = append(allRecipients, message.BCC...)

	err := smtp.SendMail(addr, auth, message.From, allRecipients, buf.Bytes())
	if err != nil {
		s.messageRepo.MarkBounced(ctx, message.ID, err.Error())
		return err
	}

	// Mark as sent
	s.messageRepo.MarkSent(ctx, message.ID, "250 OK")

	s.logger.Info().
		Str("message_id", message.ID.String()).
		Int("recipients", len(allRecipients)).
		Msg("Email delivered")

	return nil
}

// ProcessScheduledMessages processes messages scheduled for delivery
func (s *SenderService) ProcessScheduledMessages(ctx context.Context) error {
	messages, err := s.messageRepo.GetScheduledMessages(ctx, 100)
	if err != nil {
		return err
	}

	for _, msg := range messages {
		// Queue for delivery
		if err := s.queueForDelivery(ctx, &msg); err != nil {
			s.logger.Error().Err(err).Str("message_id", msg.ID.String()).Msg("Failed to queue scheduled message")
			continue
		}

		// Update status
		s.messageRepo.UpdateStatus(ctx, msg.ID, models.MessageStatusQueued, "")
	}

	return nil
}

// applySubstitutions replaces variables in content
func applySubstitutions(content string, substitutions map[string]any) string {
	result := content
	for key, value := range substitutions {
		placeholder := "{{" + key + "}}"
		result = strings.ReplaceAll(result, placeholder, fmt.Sprint(value))

		// Also support {key} format
		placeholder = "{" + key + "}"
		result = strings.ReplaceAll(result, placeholder, fmt.Sprint(value))
	}
	return result
}
