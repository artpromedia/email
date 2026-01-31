package models

import (
	"time"

	"github.com/google/uuid"
)

// WebhookEventType defines the types of events that can trigger webhooks
type WebhookEventType string

const (
	WebhookEventDelivered    WebhookEventType = "delivered"
	WebhookEventBounced      WebhookEventType = "bounced"
	WebhookEventDeferred     WebhookEventType = "deferred"
	WebhookEventDropped      WebhookEventType = "dropped"
	WebhookEventOpened       WebhookEventType = "opened"
	WebhookEventClicked      WebhookEventType = "clicked"
	WebhookEventSpamReport   WebhookEventType = "spam_report"
	WebhookEventUnsubscribed WebhookEventType = "unsubscribed"
	WebhookEventProcessed    WebhookEventType = "processed"
)

// Webhook represents a webhook configuration
type Webhook struct {
	ID           uuid.UUID          `json:"id"`
	DomainID     uuid.UUID          `json:"domain_id"`
	URL          string             `json:"url"`
	Events       []WebhookEventType `json:"events"`
	Secret       string             `json:"-"` // For HMAC signature verification
	SecretPrefix string             `json:"secret_prefix,omitempty"` // First 8 chars
	Active       bool               `json:"active"`
	Description  string             `json:"description,omitempty"`
	Headers      map[string]string  `json:"headers,omitempty"` // Custom headers to send
	RetryPolicy  *RetryPolicy       `json:"retry_policy,omitempty"`
	CreatedAt    time.Time          `json:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"`
	LastTriggeredAt *time.Time      `json:"last_triggered_at,omitempty"`
	FailureCount int                `json:"failure_count"`
	LastError    string             `json:"last_error,omitempty"`
}

// RetryPolicy defines the retry behavior for failed webhook deliveries
type RetryPolicy struct {
	MaxRetries      int           `json:"max_retries"`      // Default: 5
	RetryInterval   time.Duration `json:"retry_interval"`   // Initial interval
	BackoffMultiplier float64     `json:"backoff_multiplier"` // Exponential backoff
	MaxInterval     time.Duration `json:"max_interval"`     // Max wait between retries
}

// CreateWebhookRequest is the request to create a new webhook
type CreateWebhookRequest struct {
	URL         string             `json:"url" validate:"required,url,max=500"`
	Events      []WebhookEventType `json:"events" validate:"required,min=1,dive,oneof=delivered bounced deferred dropped opened clicked spam_report unsubscribed processed"`
	Description string             `json:"description,omitempty" validate:"max=500"`
	Headers     map[string]string  `json:"headers,omitempty"`
	RetryPolicy *RetryPolicy       `json:"retry_policy,omitempty"`
	Active      *bool              `json:"active,omitempty"`
}

// UpdateWebhookRequest is the request to update a webhook
type UpdateWebhookRequest struct {
	URL         *string            `json:"url,omitempty" validate:"omitempty,url,max=500"`
	Events      []WebhookEventType `json:"events,omitempty" validate:"omitempty,min=1,dive,oneof=delivered bounced deferred dropped opened clicked spam_report unsubscribed processed"`
	Description *string            `json:"description,omitempty" validate:"omitempty,max=500"`
	Headers     map[string]string  `json:"headers,omitempty"`
	RetryPolicy *RetryPolicy       `json:"retry_policy,omitempty"`
	Active      *bool              `json:"active,omitempty"`
}

// WebhookListResponse represents a paginated list of webhooks
type WebhookListResponse struct {
	Webhooks []Webhook `json:"webhooks"`
	Total    int64     `json:"total"`
}

// WebhookPayload represents the payload sent to webhook endpoints
type WebhookPayload struct {
	Event       WebhookEventType  `json:"event"`
	Timestamp   time.Time         `json:"timestamp"`
	MessageID   string            `json:"message_id"`
	Recipient   string            `json:"recipient"`
	Categories  []string          `json:"categories,omitempty"`
	CustomArgs  map[string]string `json:"custom_args,omitempty"`
	SMTPResponse string           `json:"smtp_response,omitempty"`
	BounceType  string            `json:"bounce_type,omitempty"` // hard, soft
	BounceCode  string            `json:"bounce_code,omitempty"`
	UserAgent   string            `json:"user_agent,omitempty"` // For opens/clicks
	IPAddress   string            `json:"ip_address,omitempty"`
	URL         string            `json:"url,omitempty"` // For clicks
	Reason      string            `json:"reason,omitempty"`
}

// WebhookDelivery represents a webhook delivery attempt
type WebhookDelivery struct {
	ID           uuid.UUID        `json:"id"`
	WebhookID    uuid.UUID        `json:"webhook_id"`
	EventID      uuid.UUID        `json:"event_id"`
	Event        WebhookEventType `json:"event"`
	URL          string           `json:"url"`
	RequestBody  string           `json:"request_body,omitempty"`
	ResponseCode int              `json:"response_code,omitempty"`
	ResponseBody string           `json:"response_body,omitempty"`
	Success      bool             `json:"success"`
	Error        string           `json:"error,omitempty"`
	AttemptNumber int             `json:"attempt_number"`
	Duration     time.Duration    `json:"duration"`
	CreatedAt    time.Time        `json:"created_at"`
}

// WebhookDeliveryQuery represents query parameters for listing webhook deliveries
type WebhookDeliveryQuery struct {
	WebhookID uuid.UUID  `json:"webhook_id"`
	Success   *bool      `json:"success,omitempty"`
	StartDate *time.Time `json:"start_date,omitempty"`
	EndDate   *time.Time `json:"end_date,omitempty"`
	Limit     int        `json:"limit"`
	Offset    int        `json:"offset"`
}

// WebhookDeliveryListResponse represents a paginated list of webhook deliveries
type WebhookDeliveryListResponse struct {
	Deliveries []WebhookDelivery `json:"deliveries"`
	Total      int64             `json:"total"`
	Limit      int               `json:"limit"`
	Offset     int               `json:"offset"`
	HasMore    bool              `json:"has_more"`
}

// TestWebhookRequest is the request to test a webhook
type TestWebhookRequest struct {
	EventType WebhookEventType `json:"event_type" validate:"required,oneof=delivered bounced deferred dropped opened clicked spam_report unsubscribed processed"`
}

// TestWebhookResponse is the response from testing a webhook
type TestWebhookResponse struct {
	Success      bool   `json:"success"`
	ResponseCode int    `json:"response_code"`
	ResponseBody string `json:"response_body,omitempty"`
	Error        string `json:"error,omitempty"`
	Duration     string `json:"duration"`
}

// RotateWebhookSecretResponse is the response when rotating a webhook secret
type RotateWebhookSecretResponse struct {
	Secret       string `json:"secret"` // New secret, only shown once
	SecretPrefix string `json:"secret_prefix"`
}
