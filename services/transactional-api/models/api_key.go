package models

import (
	"time"

	"github.com/google/uuid"
)

// APIKeyScope defines the permissions for an API key
type APIKeyScope string

const (
	ScopeSend       APIKeyScope = "send"
	ScopeRead       APIKeyScope = "read"
	ScopeAdmin      APIKeyScope = "admin"
	ScopeTemplates  APIKeyScope = "templates"
	ScopeWebhooks   APIKeyScope = "webhooks"
	ScopeAnalytics  APIKeyScope = "analytics"
	ScopeSuppression APIKeyScope = "suppression"
)

// APIKey represents an API key for authentication
type APIKey struct {
	ID         uuid.UUID     `json:"id"`
	DomainID   uuid.UUID     `json:"domain_id"`
	KeyHash    string        `json:"-"` // SHA-256 hash, never exposed
	KeyPrefix  string        `json:"key_prefix"` // First 8 chars for identification
	Name       string        `json:"name"`
	Scopes     []APIKeyScope `json:"scopes"`
	RateLimit  int           `json:"rate_limit"` // Per minute
	DailyLimit int           `json:"daily_limit"`
	LastUsedAt *time.Time    `json:"last_used_at,omitempty"`
	ExpiresAt  *time.Time    `json:"expires_at,omitempty"`
	CreatedAt  time.Time     `json:"created_at"`
	RevokedAt  *time.Time    `json:"revoked_at,omitempty"`
	CreatedBy  uuid.UUID     `json:"created_by"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// CreateAPIKeyRequest is the request to create a new API key
type CreateAPIKeyRequest struct {
	DomainID   uuid.UUID     `json:"domain_id" validate:"required"`
	Name       string        `json:"name" validate:"required,min=1,max=100"`
	Scopes     []APIKeyScope `json:"scopes" validate:"required,min=1,dive,oneof=send read admin templates webhooks analytics suppression"`
	RateLimit  int           `json:"rate_limit" validate:"omitempty,min=1,max=100000"`
	DailyLimit int           `json:"daily_limit" validate:"omitempty,min=1,max=1000000"`
	ExpiresAt  *time.Time    `json:"expires_at,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// CreateAPIKeyResponse is the response when creating a new API key
type CreateAPIKeyResponse struct {
	APIKey   *APIKey `json:"api_key"`
	PlainKey string  `json:"key"` // Only returned once on creation
}

// UpdateAPIKeyRequest is the request to update an API key
type UpdateAPIKeyRequest struct {
	Name       *string        `json:"name,omitempty" validate:"omitempty,min=1,max=100"`
	Scopes     []APIKeyScope  `json:"scopes,omitempty" validate:"omitempty,min=1,dive,oneof=send read admin templates webhooks analytics suppression"`
	RateLimit  *int           `json:"rate_limit,omitempty" validate:"omitempty,min=1,max=100000"`
	DailyLimit *int           `json:"daily_limit,omitempty" validate:"omitempty,min=1,max=1000000"`
	ExpiresAt  *time.Time     `json:"expires_at,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// ListAPIKeysRequest is the request to list API keys
type ListAPIKeysRequest struct {
	DomainID     uuid.UUID `json:"domain_id"`
	IncludeRevoked bool    `json:"include_revoked"`
	Limit        int       `json:"limit"`
	Offset       int       `json:"offset"`
}

// APIKeyUsage tracks usage statistics for an API key
type APIKeyUsage struct {
	KeyID          uuid.UUID `json:"key_id"`
	Date           time.Time `json:"date"`
	RequestCount   int64     `json:"request_count"`
	EmailsSent     int64     `json:"emails_sent"`
	EmailsDelivered int64    `json:"emails_delivered"`
	EmailsBounced  int64     `json:"emails_bounced"`
	LastRequestAt  time.Time `json:"last_request_at"`
}

// IsValid checks if the API key is valid (not expired, not revoked)
func (k *APIKey) IsValid() bool {
	if k.RevokedAt != nil {
		return false
	}
	if k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now()) {
		return false
	}
	return true
}

// HasScope checks if the API key has the specified scope
func (k *APIKey) HasScope(scope APIKeyScope) bool {
	for _, s := range k.Scopes {
		if s == scope || s == ScopeAdmin {
			return true
		}
	}
	return false
}

// HasAnyScope checks if the API key has any of the specified scopes
func (k *APIKey) HasAnyScope(scopes ...APIKeyScope) bool {
	for _, scope := range scopes {
		if k.HasScope(scope) {
			return true
		}
	}
	return false
}
