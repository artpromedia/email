package templates

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"sync"
	"text/template"

	"go.uber.org/zap"

	"sms-gateway/internal/repository"
)

// Template represents a message template
type Template struct {
	ID             string            `json:"id" db:"id"`
	Name           string            `json:"name" db:"name"`
	OrganizationID string            `json:"organization_id" db:"organization_id"`
	Type           string            `json:"type" db:"type"`   // otp, transactional, promotional
	Purpose        string            `json:"purpose" db:"purpose"` // login, registration, etc.
	Content        string            `json:"content" db:"content"`
	Variables      []string          `json:"variables" db:"variables"`
	IsDefault      bool              `json:"is_default" db:"is_default"`
	IsActive       bool              `json:"is_active" db:"is_active"`
	Language       string            `json:"language" db:"language"`
}

// Default OTP templates
var defaultOTPTemplates = map[string]string{
	"login":          "Your login code is {{.Code}}. Valid for {{.ExpiryMinutes}} minutes. Don't share this code.",
	"registration":   "Welcome! Your verification code is {{.Code}}. Valid for {{.ExpiryMinutes}} minutes.",
	"password_reset": "Your password reset code is {{.Code}}. Valid for {{.ExpiryMinutes}} minutes. If you didn't request this, ignore this message.",
	"verification":   "Your verification code is {{.Code}}. Valid for {{.ExpiryMinutes}} minutes.",
	"transaction":    "Your transaction code is {{.Code}}. Valid for {{.ExpiryMinutes}} minutes. Never share this code.",
	"2fa":            "Your two-factor authentication code is {{.Code}}. Valid for {{.ExpiryMinutes}} minutes.",
	"default":        "Your verification code is {{.Code}}. Valid for {{.ExpiryMinutes}} minutes.",
}

// Default transactional templates
var defaultTransactionalTemplates = map[string]string{
	"welcome":        "Welcome to {{.AppName}}! Your account has been created successfully.",
	"password_changed": "Your password was changed on {{.DateTime}}. If you didn't do this, contact support immediately.",
	"login_alert":    "New login detected from {{.Location}} using {{.Device}} on {{.DateTime}}.",
	"account_locked": "Your account has been locked due to multiple failed login attempts. Reset your password to unlock.",
}

// Engine handles message template rendering
type Engine struct {
	repo      *repository.Repository
	logger    *zap.Logger
	cache     map[string]*template.Template
	cacheMu   sync.RWMutex
}

// New creates a new template engine
func New(repo *repository.Repository, logger *zap.Logger) *Engine {
	return &Engine{
		repo:   repo,
		logger: logger,
		cache:  make(map[string]*template.Template),
	}
}

// RenderOTP renders an OTP message
func (e *Engine) RenderOTP(ctx context.Context, templateID string, purpose string, code string, vars map[string]string) (string, error) {
	var templateContent string

	// Try to get custom template from database
	if templateID != "" {
		t, err := e.repo.GetTemplate(ctx, templateID)
		if err == nil && t != nil && t.IsActive {
			templateContent = t.Content
		}
	}

	// Fall back to default template
	if templateContent == "" {
		var ok bool
		templateContent, ok = defaultOTPTemplates[purpose]
		if !ok {
			templateContent = defaultOTPTemplates["default"]
		}
	}

	// Prepare variables
	data := map[string]interface{}{
		"Code":          code,
		"ExpiryMinutes": 5,
	}

	// Add custom variables
	for k, v := range vars {
		data[k] = v
	}

	return e.render(templateContent, data)
}

// RenderTransactional renders a transactional message
func (e *Engine) RenderTransactional(ctx context.Context, templateID string, templateName string, vars map[string]string) (string, error) {
	var templateContent string

	// Try to get custom template from database
	if templateID != "" {
		t, err := e.repo.GetTemplate(ctx, templateID)
		if err == nil && t != nil && t.IsActive {
			templateContent = t.Content
		}
	}

	// Fall back to default template
	if templateContent == "" {
		var ok bool
		templateContent, ok = defaultTransactionalTemplates[templateName]
		if !ok {
			return "", fmt.Errorf("template not found: %s", templateName)
		}
	}

	// Convert vars to interface map
	data := make(map[string]interface{})
	for k, v := range vars {
		data[k] = v
	}

	return e.render(templateContent, data)
}

// Render renders a custom template
func (e *Engine) Render(ctx context.Context, content string, vars map[string]string) (string, error) {
	data := make(map[string]interface{})
	for k, v := range vars {
		data[k] = v
	}
	return e.render(content, data)
}

func (e *Engine) render(templateContent string, data map[string]interface{}) (string, error) {
	// Check cache
	cacheKey := e.getCacheKey(templateContent)

	e.cacheMu.RLock()
	tmpl, ok := e.cache[cacheKey]
	e.cacheMu.RUnlock()

	if !ok {
		var err error
		tmpl, err = template.New("sms").Parse(templateContent)
		if err != nil {
			return "", fmt.Errorf("failed to parse template: %w", err)
		}

		e.cacheMu.Lock()
		e.cache[cacheKey] = tmpl
		e.cacheMu.Unlock()
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to execute template: %w", err)
	}

	return buf.String(), nil
}

func (e *Engine) getCacheKey(content string) string {
	// Use first 100 chars as cache key (simple approach)
	if len(content) > 100 {
		return content[:100]
	}
	return content
}

// CreateTemplate creates a new template
func (e *Engine) CreateTemplate(ctx context.Context, t *Template) error {
	// Validate template syntax
	if _, err := template.New("validate").Parse(t.Content); err != nil {
		return fmt.Errorf("invalid template syntax: %w", err)
	}

	// Extract variables
	t.Variables = extractVariables(t.Content)

	return e.repo.CreateTemplate(ctx, t)
}

// UpdateTemplate updates an existing template
func (e *Engine) UpdateTemplate(ctx context.Context, t *Template) error {
	// Validate template syntax
	if _, err := template.New("validate").Parse(t.Content); err != nil {
		return fmt.Errorf("invalid template syntax: %w", err)
	}

	// Extract variables
	t.Variables = extractVariables(t.Content)

	// Clear cache
	e.cacheMu.Lock()
	delete(e.cache, e.getCacheKey(t.Content))
	e.cacheMu.Unlock()

	return e.repo.UpdateTemplate(ctx, t)
}

// GetTemplate retrieves a template by ID
func (e *Engine) GetTemplate(ctx context.Context, id string) (*repository.Template, error) {
	return e.repo.GetTemplate(ctx, id)
}

// ListTemplates lists all templates for an organization
func (e *Engine) ListTemplates(ctx context.Context, organizationID string, templateType string) ([]*repository.Template, error) {
	return e.repo.ListTemplates(ctx, organizationID, templateType)
}

// DeleteTemplate deletes a template
func (e *Engine) DeleteTemplate(ctx context.Context, id string) error {
	return e.repo.DeleteTemplate(ctx, id)
}

// extractVariables extracts template variable names from content
func extractVariables(content string) []string {
	var vars []string
	seen := make(map[string]bool)

	// Simple regex-like approach to find {{.VarName}}
	parts := strings.Split(content, "{{")
	for _, part := range parts[1:] { // Skip first part
		if idx := strings.Index(part, "}}"); idx > 0 {
			varPart := strings.TrimSpace(part[:idx])
			if strings.HasPrefix(varPart, ".") {
				varName := strings.TrimPrefix(varPart, ".")
				// Handle conditional syntax like "if .Var"
				varName = strings.Fields(varName)[0]
				if !seen[varName] {
					vars = append(vars, varName)
					seen[varName] = true
				}
			}
		}
	}

	return vars
}
