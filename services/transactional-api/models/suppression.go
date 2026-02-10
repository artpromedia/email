package models

import (
	"time"

	"github.com/google/uuid"
)

// SuppressionReason defines why an email is suppressed
type SuppressionReason string

const (
	SuppressionReasonBounce        SuppressionReason = "bounce"
	SuppressionReasonUnsubscribe   SuppressionReason = "unsubscribe"
	SuppressionReasonSpamComplaint SuppressionReason = "spam_complaint"
	SuppressionReasonManual        SuppressionReason = "manual"
	SuppressionReasonInvalid       SuppressionReason = "invalid"
)

// BounceClassification defines the type of bounce
type BounceClassification string

const (
	BounceClassificationHard  BounceClassification = "hard"
	BounceClassificationSoft  BounceClassification = "soft"
	BounceClassificationBlock BounceClassification = "block"
)

// Suppression represents a suppressed email address
type Suppression struct {
	ID             uuid.UUID             `json:"id"`
	DomainID       uuid.UUID             `json:"domain_id"`
	OrganizationID uuid.UUID             `json:"organization_id"`
	Email          string                `json:"email"`
	Reason         SuppressionReason     `json:"reason"`
	Type           SuppressionType       `json:"type"`
	BounceClass    BounceClassification  `json:"bounce_class,omitempty"`
	Description    string                `json:"description,omitempty"`
	OriginalError  string                `json:"original_error,omitempty"`
	Source         string                `json:"source,omitempty"` // api, webhook, smtp
	MessageID      *uuid.UUID            `json:"message_id,omitempty"`
	CreatedAt      time.Time             `json:"created_at"`
	ExpiresAt      *time.Time            `json:"expires_at,omitempty"` // For soft bounces
	CreatedBy      *uuid.UUID            `json:"created_by,omitempty"` // For manual suppressions
}

// CreateSuppressionRequest is the request to add an email to the suppression list
type CreateSuppressionRequest struct {
	Email       string            `json:"email" validate:"required,email"`
	Reason      SuppressionReason `json:"reason" validate:"required,oneof=bounce unsubscribe spam_complaint manual invalid"`
	BounceClass BounceClassification `json:"bounce_class,omitempty" validate:"omitempty,oneof=hard soft block"`
	Description string            `json:"description,omitempty" validate:"max=500"`
	ExpiresAt   *time.Time        `json:"expires_at,omitempty"`
}

// BulkSuppressionRequest is the request to add multiple emails to the suppression list
type BulkSuppressionRequest struct {
	Emails      []string          `json:"emails" validate:"required,min=1,max=1000,dive,email"`
	Reason      SuppressionReason `json:"reason" validate:"required,oneof=bounce unsubscribe spam_complaint manual invalid"`
	Description string            `json:"description,omitempty" validate:"max=500"`
}

// BulkSuppressionResponse is the response from a bulk suppression request
type BulkSuppressionResponse struct {
	Added    int      `json:"added"`
	Existing int      `json:"existing"`
	Errors   []string `json:"errors,omitempty"`
}

// SuppressionQuery represents query parameters for listing suppressions
type SuppressionQuery struct {
	DomainID  uuid.UUID          `json:"domain_id"`
	Reason    *SuppressionReason `json:"reason,omitempty"`
	Email     string             `json:"email,omitempty"` // Partial match
	StartDate *time.Time         `json:"start_date,omitempty"`
	EndDate   *time.Time         `json:"end_date,omitempty"`
	Limit     int                `json:"limit"`
	Offset    int                `json:"offset"`
}

// SuppressionListResponse represents a paginated list of suppressions
type SuppressionListResponse struct {
	Suppressions []Suppression `json:"suppressions"`
	Total        int64         `json:"total"`
	Limit        int           `json:"limit"`
	Offset       int           `json:"offset"`
	HasMore      bool          `json:"has_more"`
}

// CheckSuppressionRequest is the request to check if emails are suppressed
type CheckSuppressionRequest struct {
	Emails []string `json:"emails" validate:"required,min=1,max=100,dive,email"`
}

// CheckSuppressionResponse is the response from checking suppressions
type CheckSuppressionResponse struct {
	Results map[string]*SuppressionStatus `json:"results"`
}

// SuppressionStatus represents the suppression status of a single email
type SuppressionStatus struct {
	Suppressed bool              `json:"suppressed"`
	Reason     SuppressionReason `json:"reason,omitempty"`
	Since      *time.Time        `json:"since,omitempty"`
	ExpiresAt  *time.Time        `json:"expires_at,omitempty"`
}

// SuppressionStats represents suppression statistics
type SuppressionStats struct {
	Total          int64 `json:"total"`
	Bounces        int64 `json:"bounces"`
	Unsubscribes   int64 `json:"unsubscribes"`
	SpamComplaints int64 `json:"spam_complaints"`
	Manual         int64 `json:"manual"`
	Invalid        int64 `json:"invalid"`
	Last24Hours    int64 `json:"last_24_hours"`
	Last7Days      int64 `json:"last_7_days"`
	Last30Days     int64 `json:"last_30_days"`
}

// UnsubscribeGroup represents a suppression/unsubscribe group
type UnsubscribeGroup struct {
	ID          uuid.UUID `json:"id"`
	DomainID    uuid.UUID `json:"domain_id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	IsDefault   bool      `json:"is_default"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CreateUnsubscribeGroupRequest is the request to create an unsubscribe group
type CreateUnsubscribeGroupRequest struct {
	Name        string `json:"name" validate:"required,min=1,max=100"`
	Description string `json:"description,omitempty" validate:"max=500"`
	IsDefault   bool   `json:"is_default,omitempty"`
}

// GroupSuppression represents an email's suppression in a specific group
type GroupSuppression struct {
	ID        uuid.UUID `json:"id"`
	GroupID   uuid.UUID `json:"group_id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// ImportSuppressionRequest is the request to import suppressions from CSV
type ImportSuppressionRequest struct {
	FileContent string            `json:"file_content" validate:"required"` // Base64 encoded CSV
	Reason      SuppressionReason `json:"reason" validate:"required,oneof=bounce unsubscribe spam_complaint manual invalid"`
	HasHeader   bool              `json:"has_header"`
	EmailColumn int               `json:"email_column"` // 0-indexed
}

// ImportSuppressionResponse is the response from importing suppressions
type ImportSuppressionResponse struct {
	Total    int      `json:"total"`
	Added    int      `json:"added"`
	Existing int      `json:"existing"`
	Invalid  int      `json:"invalid"`
	Errors   []string `json:"errors,omitempty"`
}

// ExportSuppressionRequest is the request to export suppressions
type ExportSuppressionRequest struct {
	DomainID  uuid.UUID          `json:"domain_id"`
	Reason    *SuppressionReason `json:"reason,omitempty"`
	StartDate *time.Time         `json:"start_date,omitempty"`
	EndDate   *time.Time         `json:"end_date,omitempty"`
	Format    string             `json:"format" validate:"oneof=csv json"` // csv or json
}

// SuppressionType is an alias for SuppressionReason for backward compatibility
type SuppressionType = SuppressionReason

const (
	SuppressionBounce      SuppressionType = "bounce"
	SuppressionUnsubscribe SuppressionType = "unsubscribe"
	SuppressionSpamReport  SuppressionType = "spam_report"
	SuppressionManual      SuppressionType = "manual"
)
