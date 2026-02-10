package models

import (
	"time"

	"github.com/google/uuid"
)

// EventType defines the types of email events
type EventType string

const (
	EventTypeProcessed    EventType = "processed"
	EventTypeDelivered    EventType = "delivered"
	EventTypeBounced      EventType = "bounced"
	EventTypeDeferred     EventType = "deferred"
	EventTypeDropped      EventType = "dropped"
	EventTypeOpened       EventType = "opened"
	EventTypeClicked      EventType = "clicked"
	EventTypeSpamReport   EventType = "spam_report"
	EventTypeUnsubscribed EventType = "unsubscribed"
)

// Aliases for backward compatibility
const (
	EventProcessed    = EventTypeProcessed
	EventDelivered    = EventTypeDelivered
	EventBounced      = EventTypeBounced
	EventDeferred     = EventTypeDeferred
	EventDropped      = EventTypeDropped
	EventOpened       = EventTypeOpened
	EventClicked      = EventTypeClicked
	EventSpamReport   = EventTypeSpamReport
	EventUnsubscribed = EventTypeUnsubscribed
)

// EmailEvent represents an email delivery event
type EmailEvent struct {
	ID             uuid.UUID         `json:"id"`
	MessageID      uuid.UUID         `json:"message_id"`
	DomainID       uuid.UUID         `json:"domain_id"`
	OrganizationID uuid.UUID         `json:"organization_id"`
	EventType      EventType         `json:"event_type"`
	Recipient      string            `json:"recipient"`
	Timestamp      time.Time         `json:"timestamp"`
	Metadata       map[string]any    `json:"metadata,omitempty"`
	SMTPResponse   string            `json:"smtp_response,omitempty"`
	BounceType     string            `json:"bounce_type,omitempty"` // hard, soft, block
	BounceCode     string            `json:"bounce_code,omitempty"`
	BounceReason   string            `json:"bounce_reason,omitempty"`
	UserAgent      string            `json:"user_agent,omitempty"`
	IPAddress      string            `json:"ip_address,omitempty"`
	URL            string            `json:"url,omitempty"` // For click events
	Geo            *GeoLocation      `json:"geo,omitempty"`
	Device         *DeviceInfo       `json:"device,omitempty"`
	WebhookSent    bool              `json:"webhook_sent"`
	WebhookSentAt  *time.Time        `json:"webhook_sent_at,omitempty"`
	Categories     []string          `json:"categories,omitempty"`
	CustomArgs     map[string]string `json:"custom_args,omitempty"`
	CreatedAt      time.Time         `json:"created_at"`
}

// GeoLocation represents geographic information for an event
type GeoLocation struct {
	Country     string  `json:"country,omitempty"`
	CountryCode string  `json:"country_code,omitempty"`
	Region      string  `json:"region,omitempty"`
	City        string  `json:"city,omitempty"`
	PostalCode  string  `json:"postal_code,omitempty"`
	Latitude    float64 `json:"latitude,omitempty"`
	Longitude   float64 `json:"longitude,omitempty"`
	Timezone    string  `json:"timezone,omitempty"`
}

// DeviceInfo represents device information for open/click events
type DeviceInfo struct {
	Type          string `json:"type,omitempty"` // desktop, mobile, tablet
	OS            string `json:"os,omitempty"`
	OSVersion     string `json:"os_version,omitempty"`
	Browser       string `json:"browser,omitempty"`
	BrowserVersion string `json:"browser_version,omitempty"`
	DeviceName    string `json:"device_name,omitempty"`
	IsBot         bool   `json:"is_bot"`
}

// EventQuery represents query parameters for listing events
type EventQuery struct {
	DomainID   uuid.UUID  `json:"domain_id"`
	MessageID  *uuid.UUID `json:"message_id,omitempty"`
	EventType  *EventType `json:"event_type,omitempty"`
	Recipient  string     `json:"recipient,omitempty"`
	StartDate  *time.Time `json:"start_date,omitempty"`
	EndDate    *time.Time `json:"end_date,omitempty"`
	Categories []string   `json:"categories,omitempty"`
	Limit      int        `json:"limit"`
	Offset     int        `json:"offset"`
}

// EventListResponse represents a paginated list of events
type EventListResponse struct {
	Events  []EmailEvent `json:"events"`
	Total   int64        `json:"total"`
	Limit   int          `json:"limit"`
	Offset  int          `json:"offset"`
	HasMore bool         `json:"has_more"`
}

// TrackingPixelData contains data encoded in tracking pixel URLs
type TrackingPixelData struct {
	MessageID string `json:"m"`
	Recipient string `json:"r"`
	DomainID  string `json:"d"`
}

// TrackingLinkData contains data encoded in click tracking URLs
type TrackingLinkData struct {
	MessageID   string `json:"m"`
	Recipient   string `json:"r"`
	DomainID    string `json:"d"`
	OriginalURL string `json:"u"`
	LinkIndex   int    `json:"i"`
}

// CreateEventRequest is the request to create a new event
type CreateEventRequest struct {
	MessageID    uuid.UUID         `json:"message_id" validate:"required"`
	EventType    EventType         `json:"event_type" validate:"required,oneof=processed delivered bounced deferred dropped opened clicked spam_report unsubscribed"`
	Recipient    string            `json:"recipient" validate:"required,email"`
	Metadata     map[string]any    `json:"metadata,omitempty"`
	SMTPResponse string            `json:"smtp_response,omitempty"`
	BounceType   string            `json:"bounce_type,omitempty" validate:"omitempty,oneof=hard soft block"`
	BounceCode   string            `json:"bounce_code,omitempty"`
	UserAgent    string            `json:"user_agent,omitempty"`
	IPAddress    string            `json:"ip_address,omitempty"`
	URL          string            `json:"url,omitempty"`
}

// EventAggregation represents aggregated event statistics
type EventAggregation struct {
	EventType EventType `json:"event_type"`
	Count     int64     `json:"count"`
	Date      time.Time `json:"date,omitempty"`
}

// EventTimelineEntry represents an entry in an email's event timeline
type EventTimelineEntry struct {
	EventType EventType `json:"event_type"`
	Timestamp time.Time `json:"timestamp"`
	Details   string    `json:"details,omitempty"`
}

// GetMessageTimeline returns a timeline of events for a message
type MessageTimeline struct {
	MessageID uuid.UUID            `json:"message_id"`
	Status    MessageStatus        `json:"status"`
	Events    []EventTimelineEntry `json:"events"`
}
