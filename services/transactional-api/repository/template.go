package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"transactional-api/models"
)

type TemplateRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

func NewTemplateRepository(db *pgxpool.Pool, logger *zap.Logger) *TemplateRepository {
	return &TemplateRepository{db: db, logger: logger}
}

func (r *TemplateRepository) Create(ctx context.Context, orgID uuid.UUID, req *models.CreateTemplateRequest) (*models.Template, error) {
	id := uuid.New()
	now := time.Now()

	// Extract variables from template
	variables := extractTemplateVariables(req.Subject + req.TextBody + req.HTMLBody)

	query := `
		INSERT INTO email_templates (id, organization_id, name, description, subject, text_body, html_body, variables, active_version, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, true, $9, $9)
		RETURNING id, organization_id, name, description, subject, text_body, html_body, variables, active_version, is_active, created_at, updated_at
	`

	template := &models.Template{}
	err := r.db.QueryRow(ctx, query, id, orgID, req.Name, req.Description, req.Subject, req.TextBody, req.HTMLBody, variables, now).Scan(
		&template.ID, &template.OrganizationID, &template.Name, &template.Description,
		&template.Subject, &template.TextBody, &template.HTMLBody, &template.Variables,
		&template.ActiveVersion, &template.IsActive, &template.CreatedAt, &template.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert template: %w", err)
	}

	// Create initial version
	versionQuery := `
		INSERT INTO email_template_versions (id, template_id, version, subject, text_body, html_body, variables, created_at, created_by)
		VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8)
	`
	_, err = r.db.Exec(ctx, versionQuery, uuid.New(), id, req.Subject, req.TextBody, req.HTMLBody, variables, now, orgID)
	if err != nil {
		return nil, fmt.Errorf("insert template version: %w", err)
	}

	return template, nil
}

func (r *TemplateRepository) GetByID(ctx context.Context, id, orgID uuid.UUID) (*models.Template, error) {
	query := `
		SELECT id, organization_id, name, description, subject, text_body, html_body, variables, active_version, is_active, created_at, updated_at
		FROM email_templates
		WHERE id = $1 AND organization_id = $2
	`

	template := &models.Template{}
	err := r.db.QueryRow(ctx, query, id, orgID).Scan(
		&template.ID, &template.OrganizationID, &template.Name, &template.Description,
		&template.Subject, &template.TextBody, &template.HTMLBody, &template.Variables,
		&template.ActiveVersion, &template.IsActive, &template.CreatedAt, &template.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("template not found")
	}
	if err != nil {
		return nil, fmt.Errorf("query template: %w", err)
	}

	return template, nil
}

func (r *TemplateRepository) List(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*models.Template, int64, error) {
	countQuery := `SELECT COUNT(*) FROM email_templates WHERE organization_id = $1`
	var total int64
	if err := r.db.QueryRow(ctx, countQuery, orgID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count templates: %w", err)
	}

	query := `
		SELECT id, organization_id, name, description, subject, text_body, html_body, variables, active_version, is_active, created_at, updated_at
		FROM email_templates
		WHERE organization_id = $1
		ORDER BY name ASC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, orgID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query templates: %w", err)
	}
	defer rows.Close()

	var templates []*models.Template
	for rows.Next() {
		template := &models.Template{}
		if err := rows.Scan(
			&template.ID, &template.OrganizationID, &template.Name, &template.Description,
			&template.Subject, &template.TextBody, &template.HTMLBody, &template.Variables,
			&template.ActiveVersion, &template.IsActive, &template.CreatedAt, &template.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan template: %w", err)
		}
		templates = append(templates, template)
	}

	return templates, total, nil
}

func (r *TemplateRepository) Update(ctx context.Context, id, orgID uuid.UUID, req *models.UpdateTemplateRequest) (*models.Template, error) {
	// Build dynamic update query
	updates := []string{}
	args := []interface{}{}
	argCount := 1

	if req.Name != nil {
		updates = append(updates, fmt.Sprintf("name = $%d", argCount))
		args = append(args, *req.Name)
		argCount++
	}
	if req.Description != nil {
		updates = append(updates, fmt.Sprintf("description = $%d", argCount))
		args = append(args, *req.Description)
		argCount++
	}
	if req.Subject != nil {
		updates = append(updates, fmt.Sprintf("subject = $%d", argCount))
		args = append(args, *req.Subject)
		argCount++
	}
	if req.TextBody != nil {
		updates = append(updates, fmt.Sprintf("text_body = $%d", argCount))
		args = append(args, *req.TextBody)
		argCount++
	}
	if req.HTMLBody != nil {
		updates = append(updates, fmt.Sprintf("html_body = $%d", argCount))
		args = append(args, *req.HTMLBody)
		argCount++
	}
	if req.IsActive != nil {
		updates = append(updates, fmt.Sprintf("is_active = $%d", argCount))
		args = append(args, *req.IsActive)
		argCount++
	}

	if len(updates) == 0 {
		return r.GetByID(ctx, id, orgID)
	}

	// Re-extract variables if content changed
	if req.Subject != nil || req.TextBody != nil || req.HTMLBody != nil {
		existing, err := r.GetByID(ctx, id, orgID)
		if err != nil {
			return nil, err
		}
		subject := existing.Subject
		if req.Subject != nil {
			subject = *req.Subject
		}
		textBody := existing.TextBody
		if req.TextBody != nil {
			textBody = *req.TextBody
		}
		htmlBody := existing.HTMLBody
		if req.HTMLBody != nil {
			htmlBody = *req.HTMLBody
		}
		variables := extractTemplateVariables(subject + textBody + htmlBody)
		updates = append(updates, fmt.Sprintf("variables = $%d", argCount))
		args = append(args, variables)
		argCount++
	}

	updates = append(updates, fmt.Sprintf("updated_at = $%d", argCount))
	args = append(args, time.Now())
	argCount++

	args = append(args, id, orgID)

	query := fmt.Sprintf(`
		UPDATE email_templates
		SET %s
		WHERE id = $%d AND organization_id = $%d
	`, joinStrings(updates, ", "), argCount, argCount+1)

	_, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("update template: %w", err)
	}

	return r.GetByID(ctx, id, orgID)
}

func (r *TemplateRepository) Delete(ctx context.Context, id, orgID uuid.UUID) error {
	query := `DELETE FROM email_templates WHERE id = $1 AND organization_id = $2`
	result, err := r.db.Exec(ctx, query, id, orgID)
	if err != nil {
		return fmt.Errorf("delete template: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("template not found")
	}
	return nil
}

func (r *TemplateRepository) ListVersions(ctx context.Context, templateID, orgID uuid.UUID, limit, offset int) ([]*models.TemplateVersion, int64, error) {
	// First verify template belongs to org
	checkQuery := `SELECT 1 FROM email_templates WHERE id = $1 AND organization_id = $2`
	var exists int
	if err := r.db.QueryRow(ctx, checkQuery, templateID, orgID).Scan(&exists); err != nil {
		if err == pgx.ErrNoRows {
			return nil, 0, fmt.Errorf("template not found")
		}
		return nil, 0, err
	}

	countQuery := `SELECT COUNT(*) FROM email_template_versions WHERE template_id = $1`
	var total int64
	if err := r.db.QueryRow(ctx, countQuery, templateID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count versions: %w", err)
	}

	query := `
		SELECT id, template_id, version, subject, text_body, html_body, variables, created_at, created_by
		FROM email_template_versions
		WHERE template_id = $1
		ORDER BY version DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, templateID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query versions: %w", err)
	}
	defer rows.Close()

	var versions []*models.TemplateVersion
	for rows.Next() {
		version := &models.TemplateVersion{}
		if err := rows.Scan(
			&version.ID, &version.TemplateID, &version.Version,
			&version.Subject, &version.TextBody, &version.HTMLBody,
			&version.Variables, &version.CreatedAt, &version.CreatedBy,
		); err != nil {
			return nil, 0, fmt.Errorf("scan version: %w", err)
		}
		versions = append(versions, version)
	}

	return versions, total, nil
}

func (r *TemplateRepository) CreateVersion(ctx context.Context, templateID, orgID uuid.UUID, req *models.CreateTemplateRequest) (*models.TemplateVersion, error) {
	// Get current template and verify ownership
	template, err := r.GetByID(ctx, templateID, orgID)
	if err != nil {
		return nil, err
	}

	// Get next version number
	var maxVersion int
	versionQuery := `SELECT COALESCE(MAX(version), 0) FROM email_template_versions WHERE template_id = $1`
	if err := r.db.QueryRow(ctx, versionQuery, templateID).Scan(&maxVersion); err != nil {
		return nil, fmt.Errorf("get max version: %w", err)
	}
	newVersion := maxVersion + 1

	// Extract variables
	variables := extractTemplateVariables(req.Subject + req.TextBody + req.HTMLBody)

	// Insert new version
	id := uuid.New()
	now := time.Now()

	insertQuery := `
		INSERT INTO email_template_versions (id, template_id, version, subject, text_body, html_body, variables, created_at, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, template_id, version, subject, text_body, html_body, variables, created_at, created_by
	`

	version := &models.TemplateVersion{}
	err = r.db.QueryRow(ctx, insertQuery, id, templateID, newVersion, req.Subject, req.TextBody, req.HTMLBody, variables, now, template.OrganizationID).Scan(
		&version.ID, &version.TemplateID, &version.Version,
		&version.Subject, &version.TextBody, &version.HTMLBody,
		&version.Variables, &version.CreatedAt, &version.CreatedBy,
	)
	if err != nil {
		return nil, fmt.Errorf("insert version: %w", err)
	}

	// Update template with new version content
	updateQuery := `
		UPDATE email_templates
		SET subject = $1, text_body = $2, html_body = $3, variables = $4, active_version = $5, updated_at = $6
		WHERE id = $7
	`
	_, err = r.db.Exec(ctx, updateQuery, req.Subject, req.TextBody, req.HTMLBody, variables, newVersion, now, templateID)
	if err != nil {
		return nil, fmt.Errorf("update template: %w", err)
	}

	return version, nil
}

// RenderTemplate applies variable substitution to a template
func (r *TemplateRepository) RenderTemplate(template *models.Template, data map[string]interface{}) (subject, textBody, htmlBody string, err error) {
	subject = template.Subject
	textBody = template.TextBody
	htmlBody = template.HTMLBody

	for key, value := range data {
		strValue := fmt.Sprintf("%v", value)
		placeholder := "{{" + key + "}}"
		subject = replaceAll(subject, placeholder, strValue)
		textBody = replaceAll(textBody, placeholder, strValue)
		htmlBody = replaceAll(htmlBody, placeholder, strValue)
	}

	return subject, textBody, htmlBody, nil
}

// extractTemplateVariables finds all {{variable}} placeholders in the template
func extractTemplateVariables(content string) []string {
	re := regexp.MustCompile(`\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}`)
	matches := re.FindAllStringSubmatch(content, -1)

	seen := make(map[string]bool)
	var variables []string
	for _, match := range matches {
		if len(match) > 1 && !seen[match[1]] {
			seen[match[1]] = true
			variables = append(variables, match[1])
		}
	}
	return variables
}

func replaceAll(s, old, new string) string {
	for {
		if idx := indexOf(s, old); idx >= 0 {
			s = s[:idx] + new + s[idx+len(old):]
		} else {
			break
		}
	}
	return s
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}

// JSON helper for metadata
func toJSON(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}
