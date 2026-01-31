package models

import (
	"time"

	"github.com/google/uuid"
)

// Template represents an email template
type Template struct {
	ID           uuid.UUID          `json:"id"`
	DomainID     uuid.UUID          `json:"domain_id"`
	Name         string             `json:"name"`
	Description  string             `json:"description,omitempty"`
	Subject      string             `json:"subject"`
	HTMLContent  string             `json:"html_content,omitempty"`
	TextContent  string             `json:"text_content,omitempty"`
	Variables    []TemplateVariable `json:"variables,omitempty"`
	Version      int                `json:"version"`
	Active       bool               `json:"active"`
	Category     string             `json:"category,omitempty"`
	Tags         []string           `json:"tags,omitempty"`
	Metadata     map[string]any     `json:"metadata,omitempty"`
	ThumbnailURL string             `json:"thumbnail_url,omitempty"`
	CreatedAt    time.Time          `json:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"`
	CreatedBy    uuid.UUID          `json:"created_by"`
	UpdatedBy    uuid.UUID          `json:"updated_by"`
}

// TemplateVariable represents a variable used in a template
type TemplateVariable struct {
	Name         string `json:"name"`
	Description  string `json:"description,omitempty"`
	Type         string `json:"type,omitempty"` // string, number, date, array, object
	Required     bool   `json:"required"`
	DefaultValue any    `json:"default_value,omitempty"`
	Example      any    `json:"example,omitempty"`
}

// CreateTemplateRequest is the request to create a new template
type CreateTemplateRequest struct {
	Name        string             `json:"name" validate:"required,min=1,max=100"`
	Description string             `json:"description,omitempty" validate:"max=500"`
	Subject     string             `json:"subject" validate:"required,max=998"`
	HTMLContent string             `json:"html_content,omitempty" validate:"max=10485760"` // 10MB
	TextContent string             `json:"text_content,omitempty" validate:"max=1048576"`  // 1MB
	Variables   []TemplateVariable `json:"variables,omitempty"`
	Category    string             `json:"category,omitempty" validate:"max=100"`
	Tags        []string           `json:"tags,omitempty" validate:"max=10,dive,max=50"`
	Metadata    map[string]any     `json:"metadata,omitempty"`
	Active      *bool              `json:"active,omitempty"`
}

// UpdateTemplateRequest is the request to update a template
type UpdateTemplateRequest struct {
	Name        *string            `json:"name,omitempty" validate:"omitempty,min=1,max=100"`
	Description *string            `json:"description,omitempty" validate:"omitempty,max=500"`
	Subject     *string            `json:"subject,omitempty" validate:"omitempty,max=998"`
	HTMLContent *string            `json:"html_content,omitempty" validate:"omitempty,max=10485760"`
	TextContent *string            `json:"text_content,omitempty" validate:"omitempty,max=1048576"`
	Variables   []TemplateVariable `json:"variables,omitempty"`
	Category    *string            `json:"category,omitempty" validate:"omitempty,max=100"`
	Tags        []string           `json:"tags,omitempty" validate:"max=10,dive,max=50"`
	Metadata    map[string]any     `json:"metadata,omitempty"`
	Active      *bool              `json:"active,omitempty"`
}

// TemplateQuery represents query parameters for listing templates
type TemplateQuery struct {
	DomainID uuid.UUID `json:"domain_id"`
	Category string    `json:"category,omitempty"`
	Tags     []string  `json:"tags,omitempty"`
	Active   *bool     `json:"active,omitempty"`
	Search   string    `json:"search,omitempty"`
	Limit    int       `json:"limit"`
	Offset   int       `json:"offset"`
}

// TemplateListResponse represents a paginated list of templates
type TemplateListResponse struct {
	Templates []Template `json:"templates"`
	Total     int64      `json:"total"`
	Limit     int        `json:"limit"`
	Offset    int        `json:"offset"`
	HasMore   bool       `json:"has_more"`
}

// RenderTemplateRequest is the request to render a template preview
type RenderTemplateRequest struct {
	TemplateID    uuid.UUID      `json:"template_id" validate:"required"`
	Substitutions map[string]any `json:"substitutions"`
}

// RenderTemplateResponse is the response from rendering a template
type RenderTemplateResponse struct {
	Subject string `json:"subject"`
	HTML    string `json:"html,omitempty"`
	Text    string `json:"text,omitempty"`
}

// TemplateVersion represents a historical version of a template
type TemplateVersion struct {
	ID          uuid.UUID `json:"id"`
	TemplateID  uuid.UUID `json:"template_id"`
	Version     int       `json:"version"`
	Subject     string    `json:"subject"`
	HTMLContent string    `json:"html_content,omitempty"`
	TextContent string    `json:"text_content,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	CreatedBy   uuid.UUID `json:"created_by"`
	ChangeNote  string    `json:"change_note,omitempty"`
}

// DefaultTemplates provides built-in template types
type DefaultTemplateType string

const (
	DefaultTemplateWelcome         DefaultTemplateType = "welcome"
	DefaultTemplatePasswordReset   DefaultTemplateType = "password_reset"
	DefaultTemplateEmailVerify     DefaultTemplateType = "email_verification"
	DefaultTemplateOrderConfirm    DefaultTemplateType = "order_confirmation"
	DefaultTemplateShippingNotify  DefaultTemplateType = "shipping_notification"
	DefaultTemplateInvoice         DefaultTemplateType = "invoice"
	DefaultTemplateSubscription    DefaultTemplateType = "subscription"
	DefaultTemplateAccountActivity DefaultTemplateType = "account_activity"
)

// CloneTemplateRequest is the request to clone an existing template
type CloneTemplateRequest struct {
	Name        string `json:"name" validate:"required,min=1,max=100"`
	Description string `json:"description,omitempty"`
}
