package models

import (
	"time"

	"github.com/google/uuid"
)

// SendRequest represents a transactional email send request
// EmailAddress represents an email address with optional display name
type EmailAddress struct {
	Email string `json:"email" validate:"required,email"`
	Name  string `json:"name,omitempty"`
}

// SendEmailRequest represents a full email send request (used by batch/handler layer)
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
	SendAt       *time.Time        `json:"send_at,omitempty"`
}

// SendEmailResponse represents the response from sending an email
type SendEmailResponse struct {
	MessageID   uuid.UUID  `json:"message_id"`
	Status      string     `json:"status"`
	QueuedAt    time.Time  `json:"queued_at"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
}

// SendRequest represents a transactional email send request (simplified)
type SendRequest struct {
	From          string            `json:"from" validate:"required,email"`
	To            []string          `json:"to" validate:"required,min=1,max=1000,dive,email"`
	CC            []string          `json:"cc,omitempty" validate:"omitempty,max=100,dive,email"`
	BCC           []string          `json:"bcc,omitempty" validate:"omitempty,max=100,dive,email"`
	ReplyTo       string            `json:"reply_to,omitempty" validate:"omitempty,email"`
	Subject       string            `json:"subject" validate:"required_without=TemplateID,max=998"`
	HTML          string            `json:"html,omitempty" validate:"required_without_all=Text TemplateID,max=10485760"` // 10MB max
	Text          string            `json:"text,omitempty" validate:"max=10485760"`
	TemplateID    string            `json:"template_id,omitempty" validate:"omitempty,uuid"`
	Substitutions map[string]any    `json:"substitutions,omitempty"`
	Categories    []string          `json:"categories,omitempty" validate:"max=10,dive,max=100"`
	CustomArgs    map[string]string `json:"custom_args,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	Attachments   []Attachment      `json:"attachments,omitempty" validate:"max=10,dive"`
	SendAt        *time.Time        `json:"send_at,omitempty"`
	TrackOpens    *bool             `json:"track_opens,omitempty"`
	TrackClicks   *bool             `json:"track_clicks,omitempty"`
	ASMGroupID    *int              `json:"asm_group_id,omitempty"` // Suppression group
	IPPoolName    string            `json:"ip_pool_name,omitempty"`
	BatchID       string            `json:"batch_id,omitempty"`
}

// Attachment represents an email attachment
type Attachment struct {
	Filename    string `json:"filename" validate:"required,max=255"`
	Content     string `json:"content" validate:"required"` // Base64 encoded
	ContentType string `json:"content_type" validate:"required,max=255"`
	ContentID   string `json:"content_id,omitempty" validate:"max=255"` // For inline attachments
	Disposition string `json:"disposition,omitempty" validate:"omitempty,oneof=attachment inline"`
}

// SendResponse represents the response from a send request
type SendResponse struct {
	MessageID   string    `json:"message_id"`
	Status      string    `json:"status"`
	Accepted    []string  `json:"accepted,omitempty"`
	Rejected    []RejectedRecipient `json:"rejected,omitempty"`
	QueuedAt    time.Time `json:"queued_at"`
	EstimatedDelivery *time.Time `json:"estimated_delivery,omitempty"`
}

// RejectedRecipient represents a recipient that was rejected
type RejectedRecipient struct {
	Email  string `json:"email"`
	Reason string `json:"reason"`
	Code   string `json:"code"`
}

// Message represents a stored email message
type Message struct {
	ID            uuid.UUID         `json:"id"`
	DomainID      uuid.UUID         `json:"domain_id"`
	APIKeyID      uuid.UUID         `json:"api_key_id"`
	From          string            `json:"from"`
	To            []string          `json:"to"`
	CC            []string          `json:"cc,omitempty"`
	BCC           []string          `json:"bcc,omitempty"`
	ReplyTo       string            `json:"reply_to,omitempty"`
	Subject       string            `json:"subject"`
	HTML          string            `json:"html,omitempty"`
	Text          string            `json:"text,omitempty"`
	TemplateID    *uuid.UUID        `json:"template_id,omitempty"`
	Categories    []string          `json:"categories,omitempty"`
	CustomArgs    map[string]string `json:"custom_args,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	Status        MessageStatus     `json:"status"`
	TrackOpens    bool              `json:"track_opens"`
	TrackClicks   bool              `json:"track_clicks"`
	ScheduledAt   *time.Time        `json:"scheduled_at,omitempty"`
	QueuedAt      time.Time         `json:"queued_at"`
	SentAt        *time.Time        `json:"sent_at,omitempty"`
	DeliveredAt   *time.Time        `json:"delivered_at,omitempty"`
	OpenedAt      *time.Time        `json:"opened_at,omitempty"`
	ClickedAt     *time.Time        `json:"clicked_at,omitempty"`
	BouncedAt     *time.Time        `json:"bounced_at,omitempty"`
	BounceReason  string            `json:"bounce_reason,omitempty"`
	SMTPResponse  string            `json:"smtp_response,omitempty"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
}

// MessageStatus represents the status of an email message
type MessageStatus string

const (
	MessageStatusQueued     MessageStatus = "queued"
	MessageStatusScheduled  MessageStatus = "scheduled"
	MessageStatusSending    MessageStatus = "sending"
	MessageStatusSent       MessageStatus = "sent"
	MessageStatusDelivered  MessageStatus = "delivered"
	MessageStatusBounced    MessageStatus = "bounced"
	MessageStatusDeferred   MessageStatus = "deferred"
	MessageStatusDropped    MessageStatus = "dropped"
	MessageStatusFailed     MessageStatus = "failed"
)

// MessageQuery represents query parameters for listing messages
type MessageQuery struct {
	DomainID   uuid.UUID      `json:"domain_id"`
	APIKeyID   *uuid.UUID     `json:"api_key_id,omitempty"`
	Status     *MessageStatus `json:"status,omitempty"`
	Categories []string       `json:"categories,omitempty"`
	From       string         `json:"from,omitempty"`
	To         string         `json:"to,omitempty"`
	StartDate  *time.Time     `json:"start_date,omitempty"`
	EndDate    *time.Time     `json:"end_date,omitempty"`
	Limit      int            `json:"limit"`
	Offset     int            `json:"offset"`
}

// MessageListResponse represents a paginated list of messages
type MessageListResponse struct {
	Messages   []Message `json:"messages"`
	Total      int64     `json:"total"`
	Limit      int       `json:"limit"`
	Offset     int       `json:"offset"`
	HasMore    bool      `json:"has_more"`
}

// BatchSendRequest represents a batch send request
type BatchSendRequest struct {
	Messages []SendRequest `json:"messages" validate:"required,min=1,max=1000,dive"`
	BatchID  string        `json:"batch_id,omitempty"`
}

// BatchSendResponse represents the response from a batch send request
type BatchSendResponse struct {
	BatchID     string         `json:"batch_id"`
	TotalQueued int            `json:"total_queued"`
	Results     []SendResponse `json:"results"`
}

// BatchSendEmailResponse is an extended batch response with accept/reject counts
type BatchSendEmailResponse struct {
	Accepted int                 `json:"accepted"`
	Rejected int                 `json:"rejected"`
	Messages []SendEmailResponse `json:"messages"`
	Errors   []BatchError        `json:"errors,omitempty"`
}

// BatchError represents an error for a specific message in a batch
type BatchError struct {
	Index   int    `json:"index"`
	Message string `json:"message"`
}
