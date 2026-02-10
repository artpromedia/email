package models

import (
	"time"

	"github.com/google/uuid"
)

// ============================================================
// API KEY RESPONSE (unique - not in api_key.go)
// ============================================================

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
// EMAIL ADDRESS AND SEND MODELS (unique - not in send.go)
// ============================================================

type EmailAddress struct {
	Email string `json:"email" validate:"required,email"`
	Name  string `json:"name,omitempty"`
}

type SendEmailRequest struct {
	From         EmailAddress      `json:"from" validate:"required"`
	To           []EmailAddress    `json:"to" validate:"required,min=1,max=1000"`
	CC           []EmailAddress    `json:"cc,omitempty"`
	BCC          []EmailAddress    `json:"bcc,omitempty"`
	ReplyTo      *EmailAddress     `json:"reply_to,omitempty"`
	Subject      string            `json:"subject" validate:"required,max=998"`
	TextBody     string            `json:"text_body,omitempty"`
	HTMLBody     string            `json:"html_body,omitempty"`
	TemplateID   *uuid.UUID        `json:"template_id,omitempty"`
	TemplateData map[string]any    `json:"template_data,omitempty"`
	Attachments  []Attachment      `json:"attachments,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
	Tags         []string          `json:"tags,omitempty"`
	Metadata     map[string]string `json:"metadata,omitempty"`
	TrackOpens   *bool             `json:"track_opens,omitempty"`
	TrackClicks  *bool             `json:"track_clicks,omitempty"`
	IPPool       string            `json:"ip_pool,omitempty"`
	SendAt       *time.Time        `json:"send_at,omitempty"` // Scheduled send
}

type SendEmailResponse struct {
	MessageID   uuid.UUID  `json:"message_id"`
	Status      string     `json:"status"`
	QueuedAt    time.Time  `json:"queued_at"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
}

type BatchSendEmailResponse struct {
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
// WEBHOOK RESPONSE (unique - not in webhook.go)
// ============================================================

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
// SUPPRESSION TYPE (unique - different from SuppressionReason in suppression.go)
// ============================================================

type SuppressionType string

const (
	SuppressionBounce      SuppressionType = "bounce"
	SuppressionUnsubscribe SuppressionType = "unsubscribe"
	SuppressionSpamReport  SuppressionType = "spam_report"
	SuppressionManual      SuppressionType = "manual"
)

type AddSuppressionRequest struct {
	Email  string `json:"email" validate:"required,email"`
	Reason string `json:"reason,omitempty"`
}

// ============================================================
// ANALYTICS OVERVIEW (unique - not in analytics.go)
// ============================================================

type AnalyticsOverview struct {
	Period         string  `json:"period"`
	TotalSent      int64   `json:"total_sent"`
	TotalDelivered int64   `json:"total_delivered"`
	TotalBounced   int64   `json:"total_bounced"`
	TotalOpened    int64   `json:"total_opened"`
	TotalClicked   int64   `json:"total_clicked"`
	DeliveryRate   float64 `json:"delivery_rate"`
	OpenRate       float64 `json:"open_rate"`
	ClickRate      float64 `json:"click_rate"`
	BounceRate     float64 `json:"bounce_rate"`
}

// TimeSeriesData is used for analytics time series
// Note: analytics.go has TimeSeriesDataPoint with similar structure
type TimeSeriesData struct {
	Timestamp time.Time `json:"timestamp"`
	Value     int64     `json:"value"`
}

// DeliveryStats represents delivery statistics with time series data
type DeliveryStats struct {
	Period    string           `json:"period"`
	Delivered []TimeSeriesData `json:"delivered"`
	Bounced   []TimeSeriesData `json:"bounced"`
	Deferred  []TimeSeriesData `json:"deferred"`
	Dropped   []TimeSeriesData `json:"dropped"`
}

// ============================================================
// ENGAGEMENT TIME SERIES (renamed from EngagementStats to avoid conflict)
// Used by service/analytics.go - analytics.go has different EngagementStats
// ============================================================

type EngagementTimeSeries struct {
	Period       string           `json:"period"`
	Opens        []TimeSeriesData `json:"opens"`
	Clicks       []TimeSeriesData `json:"clicks"`
	UniqueOpens  int64            `json:"unique_opens"`
	UniqueClicks int64            `json:"unique_clicks"`
	TopLinks     []LinkClickStats `json:"top_links"`
}

// LinkClickStats for time series engagement (renamed from LinkStats)
type LinkClickStats struct {
	URL    string `json:"url"`
	Clicks int64  `json:"clicks"`
}

// BounceTimeSeries for time series bounce data (renamed from BounceStats)
type BounceTimeSeries struct {
	Period     string           `json:"period"`
	HardBounce []TimeSeriesData `json:"hard_bounce"`
	SoftBounce []TimeSeriesData `json:"soft_bounce"`
	TopReasons []BounceReason   `json:"top_reasons"`
}

// BounceReason for bounce analysis
type BounceReason struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
}

// DomainDeliveryStats for domain-level delivery stats (renamed from DomainStats)
type DomainDeliveryStats struct {
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
