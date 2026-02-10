package service

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"regexp"
	"strings"

	"transactional-api/models"
	"transactional-api/repository"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// TemplateService handles email template business logic
type TemplateService struct {
	repo   *repository.TemplateRepository
	logger zerolog.Logger
}

// NewTemplateService creates a new TemplateService
func NewTemplateService(repo *repository.TemplateRepository, logger zerolog.Logger) *TemplateService {
	return &TemplateService{
		repo:   repo,
		logger: logger,
	}
}

// Create creates a new email template
func (s *TemplateService) Create(ctx context.Context, domainID uuid.UUID, req *models.CreateTemplateRequest, createdBy uuid.UUID) (*models.Template, error) {
	// Validate template syntax
	if err := s.validateTemplate(req.Subject, req.HTMLContent, req.TextContent); err != nil {
		return nil, fmt.Errorf("template validation failed: %w", err)
	}

	// Extract variables from template
	variables := req.Variables
	if len(variables) == 0 {
		variables = s.extractVariables(req.Subject, req.HTMLContent, req.TextContent)
	}

	result, err := s.repo.Create(ctx, domainID, req)
	if err != nil {
		return nil, err
	}

	s.logger.Info().
		Str("template_id", result.ID.String()).
		Str("name", result.Name).
		Msg("Template created")

	return result, nil
}

// Get retrieves a template by ID
func (s *TemplateService) Get(ctx context.Context, id, domainID uuid.UUID) (*models.Template, error) {
	return s.repo.GetByID(ctx, id, domainID)
}

// GetByName retrieves a template by name within a domain (not yet implemented in repo)
func (s *TemplateService) GetByName(ctx context.Context, domainID uuid.UUID, name string) (*models.Template, error) {
	// Fallback: list and filter
	templates, _, err := s.repo.List(ctx, domainID, 100, 0)
	if err != nil {
		return nil, err
	}
	for _, t := range templates {
		if t.Name == name {
			return t, nil
		}
	}
	return nil, fmt.Errorf("template not found: %s", name)
}

// List retrieves templates with filtering
func (s *TemplateService) List(ctx context.Context, domainID uuid.UUID, query *models.TemplateQuery) (*models.TemplateListResponse, error) {
	query.DomainID = domainID
	if query.Limit <= 0 {
		query.Limit = 20
	}
	if query.Limit > 100 {
		query.Limit = 100
	}

	templates, total, err := s.repo.List(ctx, domainID, query.Limit, query.Offset)
	if err != nil {
		return nil, err
	}

	result := make([]models.Template, len(templates))
	for i, t := range templates {
		result[i] = *t
	}

	return &models.TemplateListResponse{
		Templates: result,
		Total:     total,
		Limit:     query.Limit,
		Offset:    query.Offset,
		HasMore:   int64(query.Offset+query.Limit) < total,
	}, nil
}

// Update updates an existing template
func (s *TemplateService) Update(ctx context.Context, id, domainID uuid.UUID, req *models.UpdateTemplateRequest, updatedBy uuid.UUID) error {
	// Validate template syntax if content changed
	subject := ""
	html := ""
	text := ""
	if req.Subject != nil {
		subject = *req.Subject
	}
	if req.HTMLContent != nil {
		html = *req.HTMLContent
	}
	if req.TextContent != nil {
		text = *req.TextContent
	}

	if subject != "" || html != "" || text != "" {
		if err := s.validateTemplate(subject, html, text); err != nil {
			return fmt.Errorf("template validation failed: %w", err)
		}
	}

	_, err := s.repo.Update(ctx, id, domainID, req)
	if err != nil {
		return err
	}

	s.logger.Info().
		Str("template_id", id.String()).
		Msg("Template updated")

	return nil
}

// Delete soft-deletes a template
func (s *TemplateService) Delete(ctx context.Context, id, domainID uuid.UUID) error {
	if err := s.repo.Delete(ctx, id, domainID); err != nil {
		return err
	}

	s.logger.Info().
		Str("template_id", id.String()).
		Msg("Template deleted")

	return nil
}

// Render renders a template with the provided substitutions
func (s *TemplateService) Render(ctx context.Context, templateID, domainID uuid.UUID, substitutions map[string]any) (*models.RenderTemplateResponse, error) {
	tmpl, err := s.repo.GetByID(ctx, templateID, domainID)
	if err != nil {
		return nil, err
	}

	// Apply default values for missing variables
	data := make(map[string]any)
	for _, v := range tmpl.Variables {
		if v.DefaultValue != nil {
			data[v.Name] = v.DefaultValue
		}
	}
	for k, v := range substitutions {
		data[k] = v
	}

	// Render subject
	subject, err := s.renderContent(tmpl.Subject, data)
	if err != nil {
		return nil, fmt.Errorf("failed to render subject: %w", err)
	}

	// Render HTML content
	html := ""
	if tmpl.HTMLContent != "" {
		html, err = s.renderContent(tmpl.HTMLContent, data)
		if err != nil {
			return nil, fmt.Errorf("failed to render HTML: %w", err)
		}
	}

	// Render text content
	text := ""
	if tmpl.TextContent != "" {
		text, err = s.renderContent(tmpl.TextContent, data)
		if err != nil {
			return nil, fmt.Errorf("failed to render text: %w", err)
		}
	}

	return &models.RenderTemplateResponse{
		Subject: subject,
		HTML:    html,
		Text:    text,
	}, nil
}

// Preview renders a template preview without saving
func (s *TemplateService) Preview(ctx context.Context, subject, htmlContent, textContent string, substitutions map[string]any) (*models.RenderTemplateResponse, error) {
	// Render subject
	renderedSubject, err := s.renderContent(subject, substitutions)
	if err != nil {
		return nil, fmt.Errorf("failed to render subject: %w", err)
	}

	// Render HTML content
	renderedHTML := ""
	if htmlContent != "" {
		renderedHTML, err = s.renderContent(htmlContent, substitutions)
		if err != nil {
			return nil, fmt.Errorf("failed to render HTML: %w", err)
		}
	}

	// Render text content
	renderedText := ""
	if textContent != "" {
		renderedText, err = s.renderContent(textContent, substitutions)
		if err != nil {
			return nil, fmt.Errorf("failed to render text: %w", err)
		}
	}

	return &models.RenderTemplateResponse{
		Subject: renderedSubject,
		HTML:    renderedHTML,
		Text:    renderedText,
	}, nil
}

// Clone creates a copy of an existing template
func (s *TemplateService) Clone(ctx context.Context, templateID uuid.UUID, newName string, createdBy uuid.UUID) (*models.Template, error) {
	// TODO: implement when repository supports cloning
	return nil, fmt.Errorf("template cloning not yet implemented")
}

// GetVersions retrieves version history for a template
func (s *TemplateService) GetVersions(ctx context.Context, templateID uuid.UUID) ([]models.TemplateVersion, error) {
	// TODO: implement when repository supports versioning
	return []models.TemplateVersion{}, nil
}

// RestoreVersion restores a previous version of a template
func (s *TemplateService) RestoreVersion(ctx context.Context, templateID uuid.UUID, version int, updatedBy uuid.UUID) error {
	// TODO: implement when repository supports versioning
	return fmt.Errorf("template version restore not yet implemented")
}

// validateTemplate validates template syntax
func (s *TemplateService) validateTemplate(subject, htmlContent, textContent string) error {
	// Try to parse templates to check for syntax errors
	if subject != "" {
		if _, err := template.New("subject").Parse(s.convertToGoTemplate(subject)); err != nil {
			return fmt.Errorf("invalid subject template: %w", err)
		}
	}

	if htmlContent != "" {
		if _, err := template.New("html").Parse(s.convertToGoTemplate(htmlContent)); err != nil {
			return fmt.Errorf("invalid HTML template: %w", err)
		}
	}

	if textContent != "" {
		if _, err := template.New("text").Parse(s.convertToGoTemplate(textContent)); err != nil {
			return fmt.Errorf("invalid text template: %w", err)
		}
	}

	return nil
}

// renderContent renders template content with data
func (s *TemplateService) renderContent(content string, data map[string]any) (string, error) {
	// Convert handlebars/mustache style to Go template
	goTemplate := s.convertToGoTemplate(content)

	tmpl, err := template.New("content").Parse(goTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// convertToGoTemplate converts handlebars/mustache style variables to Go template format
func (s *TemplateService) convertToGoTemplate(content string) string {
	// Convert {{variable}} to {{.variable}}
	re := regexp.MustCompile(`\{\{(\w+)\}\}`)
	return re.ReplaceAllString(content, "{{.$1}}")
}

// extractVariables extracts variable names from template content
func (s *TemplateService) extractVariables(subject, htmlContent, textContent string) []models.TemplateVariable {
	varMap := make(map[string]bool)

	// Extract from all content
	allContent := subject + " " + htmlContent + " " + textContent

	// Match {{variable}} or {variable}
	re := regexp.MustCompile(`\{\{?(\w+)\}?\}`)
	matches := re.FindAllStringSubmatch(allContent, -1)

	for _, match := range matches {
		if len(match) > 1 {
			varMap[match[1]] = true
		}
	}

	var variables []models.TemplateVariable
	for name := range varMap {
		variables = append(variables, models.TemplateVariable{
			Name:     name,
			Type:     "string",
			Required: !strings.Contains(htmlContent, "{{#if "+name) && !strings.Contains(textContent, "{{#if "+name),
		})
	}

	return variables
}

// CreateDefaultTemplates creates default templates for a domain
func (s *TemplateService) CreateDefaultTemplates(ctx context.Context, domainID, createdBy uuid.UUID) error {
	defaultTemplates := []models.CreateTemplateRequest{
		{
			Name:        "Welcome Email",
			Description: "Default welcome email template",
			Category:    "system",
			Subject:     "Welcome to {{company_name}}!",
			HTMLContent: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1>Welcome, {{name}}!</h1>
  <p>Thank you for joining {{company_name}}. We're excited to have you on board.</p>
  <p>If you have any questions, feel free to reach out to our support team.</p>
  <p>Best regards,<br>The {{company_name}} Team</p>
</body>
</html>`,
			TextContent: `Welcome, {{name}}!

Thank you for joining {{company_name}}. We're excited to have you on board.

If you have any questions, feel free to reach out to our support team.

Best regards,
The {{company_name}} Team`,
			Variables: []models.TemplateVariable{
				{Name: "name", Type: "string", Required: true},
				{Name: "company_name", Type: "string", Required: true},
			},
		},
		{
			Name:        "Password Reset",
			Description: "Password reset email template",
			Category:    "system",
			Subject:     "Reset your {{company_name}} password",
			HTMLContent: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1>Password Reset Request</h1>
  <p>Hi {{name}},</p>
  <p>We received a request to reset your password. Click the button below to create a new password:</p>
  <p style="text-align: center;">
    <a href="{{reset_url}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
  </p>
  <p>This link will expire in {{expiry_hours}} hours.</p>
  <p>If you didn't request this, you can safely ignore this email.</p>
  <p>Best regards,<br>The {{company_name}} Team</p>
</body>
</html>`,
			TextContent: `Password Reset Request

Hi {{name}},

We received a request to reset your password. Click the link below to create a new password:

{{reset_url}}

This link will expire in {{expiry_hours}} hours.

If you didn't request this, you can safely ignore this email.

Best regards,
The {{company_name}} Team`,
			Variables: []models.TemplateVariable{
				{Name: "name", Type: "string", Required: true},
				{Name: "reset_url", Type: "string", Required: true},
				{Name: "expiry_hours", Type: "number", Required: false, DefaultValue: "24"},
				{Name: "company_name", Type: "string", Required: true},
			},
		},
		{
			Name:        "Email Verification",
			Description: "Email verification template",
			Category:    "system",
			Subject:     "Verify your email address",
			HTMLContent: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1>Verify Your Email</h1>
  <p>Hi {{name}},</p>
  <p>Please verify your email address by clicking the button below:</p>
  <p style="text-align: center;">
    <a href="{{verification_url}}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
  </p>
  <p>If you didn't create an account, you can safely ignore this email.</p>
  <p>Best regards,<br>The {{company_name}} Team</p>
</body>
</html>`,
			TextContent: `Verify Your Email

Hi {{name}},

Please verify your email address by clicking the link below:

{{verification_url}}

If you didn't create an account, you can safely ignore this email.

Best regards,
The {{company_name}} Team`,
			Variables: []models.TemplateVariable{
				{Name: "name", Type: "string", Required: true},
				{Name: "verification_url", Type: "string", Required: true},
				{Name: "company_name", Type: "string", Required: true},
			},
		},
	}

	for _, req := range defaultTemplates {
		_, err := s.Create(ctx, domainID, &req, createdBy)
		if err != nil {
			// Ignore duplicate errors
			if !strings.Contains(err.Error(), "already exists") {
				s.logger.Warn().Err(err).Str("template", req.Name).Msg("Failed to create default template")
			}
		}
	}

	return nil
}
