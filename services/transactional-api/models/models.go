package models

import (
	"time"

	"github.com/google/uuid"
)

// ============================================================
// API KEY MODELS
// ============================================================

type APIKey struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	OrganizationID uuid.UUID  `json:"organization_id" db:"organization_id"`
	Name           string     `json:"name" db:"name"`
	KeyPrefix      string     `json:"key_prefix" db:"key_prefix"`
	KeyHash        string     `json:"-" db:"key_hash"`
	Scopes         []string   `json:"scopes" db:"scopes"`
	RateLimit      int        `json:"rate_limit" db:"rate_limit"`
	IsActive       bool       `json:"is_active" db:"is_active"`
	LastUsedAt     *time.Time `json:"last_used_at,omitempty" db:"last_used_at"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}

type CreateAPIKeyRequest struct {
	Name      string    `json:"name" validate:"required,min=1,max=100"`
	Scopes    []string  `json:"scopes" validate:"required,min=1"`
	RateLimit *int      `json:"rate_limit,omitempty"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
}

type APIKeyResponse struct {
	ID        uuid.UUID  `json:"id"`
	Name      string     `json:"name"`
	Key       string     `json:"key,omitempty"` // Only returned on creation
	KeyPrefix string     `json:"key_prefix"`
	Scopes    []string   `json:"scopes"`
	RateLimit int        `json:"rate_limit"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// ============================================================
// EMAIL MODELS
// ============================================================

type EmailAddress struct {
	Email string `json:"email" validate:"required,email"`
	Name  string `json:"name,omitempty"`
}

type Attachment struct {
	Filename    string `json:"filename" validate:"required"`
	Content     string `json:"content" validate:"required"` // Base64 encoded
	ContentType string `json:"content_type" validate:"required"`
	ContentID   string `json:"content_id,omitempty"` // For inline attachments
	Disposition string `json:"disposition,omitempty"` // attachment or inline
}

type SendEmailRequest struct {
	From        EmailAddress   `json:"from" validate:"required"`
	To          []EmailAddress `json:"to" validate:"required,min=1,max=1000"`
	CC          []EmailAddress `json:"cc,omitempty"`
	BCC         []EmailAddress `json:"bcc,omitempty"`
	ReplyTo     *EmailAddress  `json:"reply_to,omitempty"`
	Subject     string         `json:"subject" validate:"required,max=998"`
	TextBody    string         `json:"text_body,omitempty"`
	HTMLBody    string         `json:"html_body,omitempty"`
	TemplateID  *uuid.UUID     `json:"template_id,omitempty"`
	TemplateData map[string]any `json:"template_data,omitempty"`
	Attachments []Attachment   `json:"attachments,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Tags        []string       `json:"tags,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
	TrackOpens  *bool          `json:"track_opens,omitempty"`
	TrackClicks *bool          `json:"track_clicks,omitempty"`
	IPPool      string         `json:"ip_pool,omitempty"`
	SendAt      *time.Time     `json:"send_at,omitempty"` // Scheduled send
}

type BatchSendRequest struct {
	Messages []SendEmailRequest `json:"messages" validate:"required,min=1,max=1000"`
}

type SendEmailResponse struct {
	MessageID   uuid.UUID `json:"message_id"`
	Status      string    `json:"status"`
	QueuedAt    time.Time `json:"queued_at"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
}

type BatchSendResponse struct {
	Accepted int                 `json:"accepted"`
	Rejected int                 `json:"rejected"`
	Messages []SendEmailResponse `json:"messages"`
	Errors   []BatchError        `json:"errors,omitempty"`
}

type BatchError struct {
	Index   int    `json:"index"`
	Message string `json:"message"`
}

// ============================================================
// TEMPLATE MODELS
// ============================================================

type Template struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	OrganizationID uuid.UUID  `json:"organization_id" db:"organization_id"`
	Name           string     `json:"name" db:"name"`
	Description    string     `json:"description" db:"description"`
	Subject        string     `json:"subject" db:"subject"`
	TextBody       string     `json:"text_body" db:"text_body"`
	HTMLBody       string     `json:"html_body" db:"html_body"`
	Variables      []string   `json:"variables" db:"variables"`
	ActiveVersion  int        `json:"active_version" db:"active_version"`
	IsActive       bool       `json:"is_active" db:"is_active"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}

type TemplateVersion struct {
	ID         uuid.UUID `json:"id" db:"id"`
	TemplateID uuid.UUID `json:"template_id" db:"template_id"`
	Version    int       `json:"version" db:"version"`
	Subject    string    `json:"subject" db:"subject"`
	TextBody   string    `json:"text_body" db:"text_body"`
	HTMLBody   string    `json:"html_body" db:"html_body"`
	Variables  []string  `json:"variables" db:"variables"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	CreatedBy  uuid.UUID `json:"created_by" db:"created_by"`
}

type CreateTemplateRequest struct {
	Name        string `json:"name" validate:"required,min=1,max=100"`
	Description string `json:"description,omitempty"`
	Subject     string `json:"subject" validate:"required"`
	TextBody    string `json:"text_body,omitempty"`
	HTMLBody    string `json:"html_body,omitempty"`
}

type UpdateTemplateRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Subject     *string `json:"subject,omitempty"`
	TextBody    *string `json:"text_body,omitempty"`
	HTMLBody    *string `json:"html_body,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}

// ============================================================
// WEBHOOK MODELS
// ============================================================

type Webhook struct {
	ID             uuid.UUID `json:"id" db:"id"`
	OrganizationID uuid.UUID `json:"organization_id" db:"organization_id"`
	URL            string    `json:"url" db:"url"`
	Events         []string  `json:"events" db:"events"`
	IsActive       bool      `json:"is_active" db:"is_active"`
	Secret         string    `json:"-" db:"secret"`
	FailureCount   int       `json:"failure_count" db:"failure_count"`
	LastTriggered  *time.Time `json:"last_triggered,omitempty" db:"last_triggered"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

type CreateWebhookRequest struct {
	URL    string   `json:"url" validate:"required,url"`
	Events []string `json:"events" validate:"required,min=1"`
}

type UpdateWebhookRequest struct {
	URL      *string   `json:"url,omitempty"`
	Events   []string  `json:"events,omitempty"`
	IsActive *bool     `json:"is_active,omitempty"`
}

type WebhookResponse struct {
	ID            uuid.UUID  `json:"id"`
	URL           string     `json:"url"`
	Events        []string   `json:"events"`
	IsActive      bool       `json:"is_active"`
	Secret        string     `json:"secret,omitempty"` // Only on creation
	FailureCount  int        `json:"failure_count"`
	LastTriggered *time.Time `json:"last_triggered,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// ============================================================
// EVENT MODELS
// ============================================================

type EventType string

const (
	EventDelivered   EventType = "delivered"
	EventBounced     EventType = "bounced"
	EventDeferred    EventType = "deferred"
	EventDropped     EventType = "dropped"
	EventOpened      EventType = "opened"
	EventClicked     EventType = "clicked"
	EventUnsubscribed EventType = "unsubscribed"
	EventSpamReport  EventType = "spam_report"
)

type EmailEvent struct {
	ID             uuid.UUID   `json:"id" db:"id"`
	OrganizationID uuid.UUID   `json:"organization_id" db:"organization_id"`
	MessageID      uuid.UUID   `json:"message_id" db:"message_id"`
	EventType      EventType   `json:"event_type" db:"event_type"`
	Recipient      string      `json:"recipient" db:"recipient"`
	Timestamp      time.Time   `json:"timestamp" db:"timestamp"`
	Metadata       map[string]any `json:"metadata" db:"metadata"`
	UserAgent      string      `json:"user_agent,omitempty" db:"user_agent"`
	IPAddress      string      `json:"ip_address,omitempty" db:"ip_address"`
	URL            string      `json:"url,omitempty" db:"url"` // For click events
	BounceType     string      `json:"bounce_type,omitempty" db:"bounce_type"`
	BounceReason   string      `json:"bounce_reason,omitempty" db:"bounce_reason"`
}

type WebhookPayload struct {
	Event     EventType      `json:"event"`
	Timestamp time.Time      `json:"timestamp"`
	MessageID uuid.UUID      `json:"message_id"`
	Recipient string         `json:"recipient"`
	Data      map[string]any `json:"data"`
}

// ============================================================
// SUPPRESSION MODELS
// ============================================================

type SuppressionType string

const (
	SuppressionBounce      SuppressionType = "bounce"
	SuppressionUnsubscribe SuppressionType = "unsubscribe"
	SuppressionSpamReport  SuppressionType = "spam_report"
	SuppressionManual      SuppressionType = "manual"
)

type Suppression struct {
	ID             uuid.UUID       `json:"id" db:"id"`
	OrganizationID uuid.UUID       `json:"organization_id" db:"organization_id"`
	Email          string          `json:"email" db:"email"`
	Type           SuppressionType `json:"type" db:"type"`
	Reason         string          `json:"reason,omitempty" db:"reason"`
	CreatedAt      time.Time       `json:"created_at" db:"created_at"`
}

type AddSuppressionRequest struct {
	Email  string `json:"email" validate:"required,email"`
	Reason string `json:"reason,omitempty"`
}

// ============================================================
// ANALYTICS MODELS
// ============================================================

type AnalyticsOverview struct {
	Period        string `json:"period"`
	TotalSent     int64  `json:"total_sent"`
	TotalDelivered int64 `json:"total_delivered"`
	TotalBounced  int64  `json:"total_bounced"`
	TotalOpened   int64  `json:"total_opened"`
	TotalClicked  int64  `json:"total_clicked"`
	DeliveryRate  float64 `json:"delivery_rate"`
	OpenRate      float64 `json:"open_rate"`
	ClickRate     float64 `json:"click_rate"`
	BounceRate    float64 `json:"bounce_rate"`
}

type TimeSeriesData struct {
	Timestamp time.Time `json:"timestamp"`
	Value     int64     `json:"value"`
}

type DeliveryStats struct {
	Period     string           `json:"period"`
	Delivered  []TimeSeriesData `json:"delivered"`
	Bounced    []TimeSeriesData `json:"bounced"`
	Deferred   []TimeSeriesData `json:"deferred"`
	Dropped    []TimeSeriesData `json:"dropped"`
}

type EngagementStats struct {
	Period   string           `json:"period"`
	Opens    []TimeSeriesData `json:"opens"`
	Clicks   []TimeSeriesData `json:"clicks"`
	UniqueOpens  int64 `json:"unique_opens"`
	UniqueClicks int64 `json:"unique_clicks"`
	TopLinks []LinkStats `json:"top_links"`
}

type LinkStats struct {
	URL    string `json:"url"`
	Clicks int64  `json:"clicks"`
}

type BounceStats struct {
	Period     string           `json:"period"`
	HardBounce []TimeSeriesData `json:"hard_bounce"`
	SoftBounce []TimeSeriesData `json:"soft_bounce"`
	TopReasons []BounceReason   `json:"top_reasons"`
}

type BounceReason struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
}

type DomainStats struct {
	Domain       string  `json:"domain"`
	Sent         int64   `json:"sent"`
	Delivered    int64   `json:"delivered"`
	Bounced      int64   `json:"bounced"`
	DeliveryRate float64 `json:"delivery_rate"`
}

// ============================================================
// PAGINATION
// ============================================================

type PaginationParams struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}

type PaginatedResponse[T any] struct {
	Data       []T   `json:"data"`
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalCount int64 `json:"total_count"`
	TotalPages int   `json:"total_pages"`
}
