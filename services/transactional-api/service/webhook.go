package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/artpromedia/email/services/transactional-api/config"
	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// WebhookService handles webhook business logic
type WebhookService struct {
	config       *config.Config
	webhookRepo  *repository.WebhookRepository
	eventRepo    *repository.EventRepository
	httpClient   *http.Client
	logger       zerolog.Logger
}

// NewWebhookService creates a new WebhookService
func NewWebhookService(
	cfg *config.Config,
	webhookRepo *repository.WebhookRepository,
	eventRepo *repository.EventRepository,
	logger zerolog.Logger,
) *WebhookService {
	return &WebhookService{
		config:      cfg,
		webhookRepo: webhookRepo,
		eventRepo:   eventRepo,
		httpClient: &http.Client{
			Timeout: cfg.Webhook.Timeout,
		},
		logger: logger,
	}
}

// Create creates a new webhook configuration
func (s *WebhookService) Create(ctx context.Context, domainID uuid.UUID, req *models.CreateWebhookRequest) (*models.Webhook, error) {
	// Generate secret for HMAC signature
	secret, err := generateSecret()
	if err != nil {
		return nil, fmt.Errorf("failed to generate secret: %w", err)
	}

	secretPrefix := secret[:8] + "..."

	active := true
	if req.Active != nil {
		active = *req.Active
	}

	// Default retry policy
	retryPolicy := req.RetryPolicy
	if retryPolicy == nil {
		retryPolicy = &models.RetryPolicy{
			MaxRetries:      s.config.Webhook.MaxRetries,
			RetryInterval:   s.config.Webhook.RetryInterval,
			BackoffMultiplier: 2.0,
			MaxInterval:     time.Hour,
		}
	}

	webhook := &models.Webhook{
		ID:           uuid.New(),
		DomainID:     domainID,
		URL:          req.URL,
		Events:       req.Events,
		Secret:       secret,
		SecretPrefix: secretPrefix,
		Active:       active,
		Description:  req.Description,
		Headers:      req.Headers,
		RetryPolicy:  retryPolicy,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := s.webhookRepo.Create(ctx, webhook); err != nil {
		return nil, err
	}

	s.logger.Info().
		Str("webhook_id", webhook.ID.String()).
		Str("url", webhook.URL).
		Msg("Webhook created")

	return webhook, nil
}

// Get retrieves a webhook by ID
func (s *WebhookService) Get(ctx context.Context, id uuid.UUID) (*models.Webhook, error) {
	return s.webhookRepo.GetByID(ctx, id)
}

// List retrieves all webhooks for a domain
func (s *WebhookService) List(ctx context.Context, domainID uuid.UUID) (*models.WebhookListResponse, error) {
	return s.webhookRepo.List(ctx, domainID)
}

// Update updates a webhook configuration
func (s *WebhookService) Update(ctx context.Context, id uuid.UUID, req *models.UpdateWebhookRequest) error {
	if err := s.webhookRepo.Update(ctx, id, req); err != nil {
		return err
	}

	s.logger.Info().
		Str("webhook_id", id.String()).
		Msg("Webhook updated")

	return nil
}

// Delete removes a webhook configuration
func (s *WebhookService) Delete(ctx context.Context, id uuid.UUID) error {
	if err := s.webhookRepo.Delete(ctx, id); err != nil {
		return err
	}

	s.logger.Info().
		Str("webhook_id", id.String()).
		Msg("Webhook deleted")

	return nil
}

// RotateSecret generates a new secret for a webhook
func (s *WebhookService) RotateSecret(ctx context.Context, id uuid.UUID) (*models.RotateWebhookSecretResponse, error) {
	secret, err := generateSecret()
	if err != nil {
		return nil, fmt.Errorf("failed to generate secret: %w", err)
	}

	secretPrefix := secret[:8] + "..."

	if err := s.webhookRepo.UpdateSecret(ctx, id, secret, secretPrefix); err != nil {
		return nil, err
	}

	s.logger.Info().
		Str("webhook_id", id.String()).
		Msg("Webhook secret rotated")

	return &models.RotateWebhookSecretResponse{
		Secret:       secret,
		SecretPrefix: secretPrefix,
	}, nil
}

// Test sends a test event to a webhook
func (s *WebhookService) Test(ctx context.Context, id uuid.UUID, eventType models.WebhookEventType) (*models.TestWebhookResponse, error) {
	webhook, err := s.webhookRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Create test payload
	payload := &models.WebhookPayload{
		Event:     eventType,
		Timestamp: time.Now(),
		MessageID: "test-message-" + uuid.New().String(),
		Recipient: "test@example.com",
		Categories: []string{"test"},
		CustomArgs: map[string]string{"test": "true"},
	}

	// Send test webhook
	start := time.Now()
	resp, err := s.sendWebhook(ctx, webhook, payload)
	duration := time.Since(start)

	if err != nil {
		return &models.TestWebhookResponse{
			Success:  false,
			Error:    err.Error(),
			Duration: duration.String(),
		}, nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	return &models.TestWebhookResponse{
		Success:      resp.StatusCode >= 200 && resp.StatusCode < 300,
		ResponseCode: resp.StatusCode,
		ResponseBody: string(body),
		Duration:     duration.String(),
	}, nil
}

// ListDeliveries retrieves webhook delivery history
func (s *WebhookService) ListDeliveries(ctx context.Context, query *models.WebhookDeliveryQuery) (*models.WebhookDeliveryListResponse, error) {
	if query.Limit <= 0 {
		query.Limit = 20
	}
	if query.Limit > 100 {
		query.Limit = 100
	}

	return s.webhookRepo.ListDeliveries(ctx, query)
}

// TriggerEvent triggers webhooks for an email event
func (s *WebhookService) TriggerEvent(ctx context.Context, event *models.EmailEvent) error {
	// Get webhooks configured for this event type
	eventType := models.WebhookEventType(event.EventType)
	webhooks, err := s.webhookRepo.GetActiveWebhooksForEvent(ctx, event.DomainID, eventType)
	if err != nil {
		return err
	}

	if len(webhooks) == 0 {
		return nil
	}

	// Create payload
	payload := &models.WebhookPayload{
		Event:        eventType,
		Timestamp:    event.Timestamp,
		MessageID:    event.MessageID.String(),
		Recipient:    event.Recipient,
		Categories:   event.Categories,
		CustomArgs:   event.CustomArgs,
		SMTPResponse: event.SMTPResponse,
		BounceType:   event.BounceType,
		BounceCode:   event.BounceCode,
		UserAgent:    event.UserAgent,
		IPAddress:    event.IPAddress,
		URL:          event.URL,
	}

	// Send to each webhook
	for _, webhook := range webhooks {
		go s.deliverWebhook(context.Background(), &webhook, event.ID, payload)
	}

	// Mark event as webhook sent
	s.eventRepo.MarkWebhookSent(ctx, event.ID)

	return nil
}

// deliverWebhook sends a webhook with retry logic
func (s *WebhookService) deliverWebhook(ctx context.Context, webhook *models.Webhook, eventID uuid.UUID, payload *models.WebhookPayload) {
	maxRetries := s.config.Webhook.MaxRetries
	if webhook.RetryPolicy != nil {
		maxRetries = webhook.RetryPolicy.MaxRetries
	}

	for attempt := 1; attempt <= maxRetries; attempt++ {
		start := time.Now()
		resp, err := s.sendWebhook(ctx, webhook, payload)
		duration := time.Since(start)

		delivery := &models.WebhookDelivery{
			ID:            uuid.New(),
			WebhookID:     webhook.ID,
			EventID:       eventID,
			Event:         payload.Event,
			URL:           webhook.URL,
			AttemptNumber: attempt,
			Duration:      duration,
			CreatedAt:     time.Now(),
		}

		// Capture request body for debugging
		requestBody, _ := json.Marshal(payload)
		delivery.RequestBody = string(requestBody)

		if err != nil {
			delivery.Success = false
			delivery.Error = err.Error()
			s.webhookRepo.CreateDelivery(ctx, delivery)
			s.webhookRepo.RecordFailure(ctx, webhook.ID, err.Error())

			s.logger.Warn().
				Err(err).
				Str("webhook_id", webhook.ID.String()).
				Int("attempt", attempt).
				Msg("Webhook delivery failed")

			// Calculate backoff
			backoff := s.config.Webhook.RetryInterval
			if webhook.RetryPolicy != nil {
				backoff = webhook.RetryPolicy.RetryInterval
				for i := 1; i < attempt; i++ {
					backoff = time.Duration(float64(backoff) * webhook.RetryPolicy.BackoffMultiplier)
					if webhook.RetryPolicy.MaxInterval > 0 && backoff > webhook.RetryPolicy.MaxInterval {
						backoff = webhook.RetryPolicy.MaxInterval
					}
				}
			}

			time.Sleep(backoff)
			continue
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		delivery.ResponseCode = resp.StatusCode
		delivery.ResponseBody = string(body)
		delivery.Success = resp.StatusCode >= 200 && resp.StatusCode < 300

		s.webhookRepo.CreateDelivery(ctx, delivery)

		if delivery.Success {
			s.webhookRepo.RecordSuccess(ctx, webhook.ID)
			s.logger.Debug().
				Str("webhook_id", webhook.ID.String()).
				Str("event", string(payload.Event)).
				Msg("Webhook delivered successfully")
			return
		}

		// Non-2xx response, retry
		s.webhookRepo.RecordFailure(ctx, webhook.ID, fmt.Sprintf("HTTP %d", resp.StatusCode))

		s.logger.Warn().
			Str("webhook_id", webhook.ID.String()).
			Int("status_code", resp.StatusCode).
			Int("attempt", attempt).
			Msg("Webhook received non-2xx response")
	}

	s.logger.Error().
		Str("webhook_id", webhook.ID.String()).
		Int("max_retries", maxRetries).
		Msg("Webhook delivery failed after all retries")
}

// sendWebhook sends a single webhook request
func (s *WebhookService) sendWebhook(ctx context.Context, webhook *models.Webhook, payload *models.WebhookPayload) (*http.Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhook.URL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "TransactionalAPI-Webhook/1.0")

	// Add HMAC signature
	if webhook.Secret != "" {
		signature := computeHMAC(body, webhook.Secret)
		req.Header.Set("X-Webhook-Signature", "sha256="+signature)
	}

	// Add timestamp
	timestamp := time.Now().Unix()
	req.Header.Set("X-Webhook-Timestamp", fmt.Sprintf("%d", timestamp))

	// Add custom headers
	for key, value := range webhook.Headers {
		req.Header.Set(key, value)
	}

	return s.httpClient.Do(req)
}

// ProcessPendingEvents processes events that haven't had webhooks sent
func (s *WebhookService) ProcessPendingEvents(ctx context.Context) error {
	events, err := s.eventRepo.GetUnsentWebhookEvents(ctx, 100)
	if err != nil {
		return err
	}

	for _, event := range events {
		if err := s.TriggerEvent(ctx, &event); err != nil {
			s.logger.Error().Err(err).Str("event_id", event.ID.String()).Msg("Failed to trigger webhook")
		}
	}

	return nil
}

// RetryFailedDeliveries retries failed webhook deliveries
func (s *WebhookService) RetryFailedDeliveries(ctx context.Context) error {
	deliveries, err := s.webhookRepo.GetPendingDeliveries(ctx, s.config.Webhook.MaxRetries, 100)
	if err != nil {
		return err
	}

	for _, delivery := range deliveries {
		webhook, err := s.webhookRepo.GetByID(ctx, delivery.WebhookID)
		if err != nil {
			continue
		}

		event, err := s.eventRepo.GetByID(ctx, delivery.EventID)
		if err != nil {
			continue
		}

		payload := &models.WebhookPayload{
			Event:        delivery.Event,
			Timestamp:    event.Timestamp,
			MessageID:    event.MessageID.String(),
			Recipient:    event.Recipient,
			Categories:   event.Categories,
			CustomArgs:   event.CustomArgs,
		}

		go s.deliverWebhook(context.Background(), webhook, delivery.EventID, payload)
	}

	return nil
}

// generateSecret generates a random secret for webhook signing
func generateSecret() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// computeHMAC computes HMAC-SHA256 signature
func computeHMAC(data []byte, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// VerifySignature verifies a webhook signature
func VerifySignature(payload []byte, signature, secret string) bool {
	expected := "sha256=" + computeHMAC(payload, secret)
	return hmac.Equal([]byte(expected), []byte(signature))
}
