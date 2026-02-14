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
// WEBHOOK RESPONSE (unique - not in webhook.go)
// ============================================================

type WebhookResponse struct {
	ID            uuid.UUID          `json:"id"`
	URL           string             `json:"url"`
	Events        []WebhookEventType `json:"events"`
	IsActive      bool               `json:"is_active"`
	Secret        string             `json:"secret,omitempty"` // Only on creation
	FailureCount  int                `json:"failure_count"`
	LastTriggered *time.Time         `json:"last_triggered,omitempty"`
	CreatedAt     time.Time          `json:"created_at"`
}

// ============================================================
// SUPPRESSION HELPERS (AddSuppressionRequest is unique to this file)
// ============================================================

type AddSuppressionRequest struct {
	Email  string `json:"email" validate:"required,email"`
	Reason string `json:"reason,omitempty"`
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
