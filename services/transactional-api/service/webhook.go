package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"transactional-api/models"
	"transactional-api/repository"
)

type WebhookService struct {
	webhookRepo *repository.WebhookRepository
	eventRepo   *repository.EventRepository
	redis       *redis.Client
	logger      *zap.Logger
	httpClient  *http.Client
	dispatchCh  chan *webhookDispatch
	wg          sync.WaitGroup
}

type webhookDispatch struct {
	Webhook *models.Webhook
	Payload *models.WebhookPayload
	Attempt int
}

func NewWebhookService(
	webhookRepo *repository.WebhookRepository,
	eventRepo *repository.EventRepository,
	redis *redis.Client,
	logger *zap.Logger,
) *WebhookService {
	return &WebhookService{
		webhookRepo: webhookRepo,
		eventRepo:   eventRepo,
		redis:       redis,
		logger:      logger,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		dispatchCh: make(chan *webhookDispatch, 10000),
	}
}

func (s *WebhookService) StartDispatcher(ctx context.Context) {
	// Start worker pool
	for i := 0; i < 10; i++ {
		s.wg.Add(1)
		go s.dispatchWorker(ctx)
	}

	// Start retry processor
	go s.retryProcessor(ctx)
}

func (s *WebhookService) dispatchWorker(ctx context.Context) {
	defer s.wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case dispatch := <-s.dispatchCh:
			s.deliverWebhook(ctx, dispatch)
		}
	}
}

func (s *WebhookService) retryProcessor(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.processRetries(ctx)
		}
	}
}

func (s *WebhookService) processRetries(ctx context.Context) {
	// Get failed webhooks from Redis and retry
	keys, err := s.redis.Keys(ctx, "webhook:retry:*").Result()
	if err != nil {
		s.logger.Error("Failed to get retry keys", zap.Error(err))
		return
	}

	for _, key := range keys {
		data, err := s.redis.Get(ctx, key).Bytes()
		if err != nil {
			continue
		}

		var dispatch webhookDispatch
		if err := json.Unmarshal(data, &dispatch); err != nil {
			s.redis.Del(ctx, key)
			continue
		}

		// Check if max retries exceeded
		if dispatch.Attempt >= 5 {
			s.redis.Del(ctx, key)
			continue
		}

		// Re-queue for delivery
		dispatch.Attempt++
		s.dispatchCh <- &dispatch
		s.redis.Del(ctx, key)
	}
}

func (s *WebhookService) DispatchEvent(ctx context.Context, orgID uuid.UUID, event *models.EmailEvent) error {
	// Store the event
	if err := s.eventRepo.Create(ctx, event); err != nil {
		return fmt.Errorf("store event: %w", err)
	}

	// Get webhooks subscribed to this event type
	webhooks, err := s.webhookRepo.GetByEvent(ctx, orgID, string(event.EventType))
	if err != nil {
		return fmt.Errorf("get webhooks: %w", err)
	}

	// Create payload
	payload := &models.WebhookPayload{
		Event:     event.EventType,
		Timestamp: event.Timestamp,
		MessageID: event.MessageID,
		Recipient: event.Recipient,
		Data: map[string]any{
			"event_id":   event.ID.String(),
			"user_agent": event.UserAgent,
			"ip_address": event.IPAddress,
			"url":        event.URL,
			"metadata":   event.Metadata,
		},
	}

	if event.BounceType != "" {
		payload.Data["bounce_type"] = event.BounceType
		payload.Data["bounce_reason"] = event.BounceReason
	}

	// Queue for dispatch
	for _, webhook := range webhooks {
		s.dispatchCh <- &webhookDispatch{
			Webhook: webhook,
			Payload: payload,
			Attempt: 1,
		}
	}

	return nil
}

func (s *WebhookService) deliverWebhook(ctx context.Context, dispatch *webhookDispatch) {
	// Build request body
	body, err := json.Marshal(dispatch.Payload)
	if err != nil {
		s.logger.Error("Failed to marshal webhook payload", zap.Error(err))
		return
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, dispatch.Webhook.URL, bytes.NewReader(body))
	if err != nil {
		s.logger.Error("Failed to create webhook request", zap.Error(err))
		return
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Enterprise-Email-Webhooks/1.0")
	req.Header.Set("X-Webhook-ID", dispatch.Webhook.ID.String())
	req.Header.Set("X-Webhook-Timestamp", fmt.Sprintf("%d", time.Now().Unix()))

	// Sign the payload
	signature := s.signPayload(body, dispatch.Webhook.Secret)
	req.Header.Set("X-Webhook-Signature", signature)

	// Send request
	resp, err := s.httpClient.Do(req)
	if err != nil {
		s.handleDeliveryFailure(ctx, dispatch, err)
		return
	}
	defer resp.Body.Close()

	// Check response
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// Success
		s.webhookRepo.ResetFailureCount(ctx, dispatch.Webhook.ID)
		s.logger.Debug("Webhook delivered successfully",
			zap.String("webhook_id", dispatch.Webhook.ID.String()),
			zap.String("event", string(dispatch.Payload.Event)))
	} else {
		// HTTP error
		s.handleDeliveryFailure(ctx, dispatch, fmt.Errorf("HTTP %d", resp.StatusCode))
	}
}

func (s *WebhookService) handleDeliveryFailure(ctx context.Context, dispatch *webhookDispatch, err error) {
	s.logger.Warn("Webhook delivery failed",
		zap.String("webhook_id", dispatch.Webhook.ID.String()),
		zap.Int("attempt", dispatch.Attempt),
		zap.Error(err))

	s.webhookRepo.IncrementFailureCount(ctx, dispatch.Webhook.ID)

	// Schedule retry if under max attempts
	if dispatch.Attempt < 5 {
		retryKey := fmt.Sprintf("webhook:retry:%s:%s", dispatch.Webhook.ID, dispatch.Payload.MessageID)
		data, _ := json.Marshal(dispatch)

		// Exponential backoff: 1min, 5min, 15min, 30min, 1hr
		delays := []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute, 30 * time.Minute, time.Hour}
		delay := delays[dispatch.Attempt-1]

		s.redis.Set(ctx, retryKey, data, delay)
	}
}

func (s *WebhookService) signPayload(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func (s *WebhookService) TestWebhook(ctx context.Context, webhook *models.Webhook) error {
	testPayload := &models.WebhookPayload{
		Event:     "test",
		Timestamp: time.Now(),
		MessageID: uuid.New(),
		Recipient: "test@example.com",
		Data: map[string]any{
			"message": "This is a test webhook delivery",
		},
	}

	body, _ := json.Marshal(testPayload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhook.URL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Enterprise-Email-Webhooks/1.0")
	req.Header.Set("X-Webhook-ID", webhook.ID.String())
	req.Header.Set("X-Webhook-Timestamp", fmt.Sprintf("%d", time.Now().Unix()))
	req.Header.Set("X-Webhook-Signature", s.signPayload(body, webhook.Secret))

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned HTTP %d", resp.StatusCode)
	}

	return nil
}
