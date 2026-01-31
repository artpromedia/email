package repository

import (
	"context"
	"errors"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrTemplateNotFound      = errors.New("template not found")
	ErrTemplateNameExists    = errors.New("template name already exists")
)

// TemplateRepository handles database operations for email templates
type TemplateRepository struct {
	pool *pgxpool.Pool
}

// NewTemplateRepository creates a new TemplateRepository
func NewTemplateRepository(pool *pgxpool.Pool) *TemplateRepository {
	return &TemplateRepository{pool: pool}
}

// Create creates a new email template
func (r *TemplateRepository) Create(ctx context.Context, template *models.Template) error {
	query := `
		INSERT INTO email_templates (
			id, domain_id, name, description, subject, html_content, text_content,
			variables, version, active, category, tags, metadata, created_by, updated_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	`

	_, err := r.pool.Exec(ctx, query,
		template.ID,
		template.DomainID,
		template.Name,
		template.Description,
		template.Subject,
		template.HTMLContent,
		template.TextContent,
		template.Variables,
		template.Version,
		template.Active,
		template.Category,
		template.Tags,
		template.Metadata,
		template.CreatedBy,
		template.UpdatedBy,
	)

	if err != nil && isDuplicateKeyError(err) {
		return ErrTemplateNameExists
	}

	return err
}

// GetByID retrieves a template by ID
func (r *TemplateRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Template, error) {
	query := `
		SELECT id, domain_id, name, description, subject, html_content, text_content,
		       variables, version, active, category, tags, metadata, thumbnail_url,
		       created_at, updated_at, created_by, updated_by
		FROM email_templates
		WHERE id = $1
	`

	var t models.Template
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&t.ID,
		&t.DomainID,
		&t.Name,
		&t.Description,
		&t.Subject,
		&t.HTMLContent,
		&t.TextContent,
		&t.Variables,
		&t.Version,
		&t.Active,
		&t.Category,
		&t.Tags,
		&t.Metadata,
		&t.ThumbnailURL,
		&t.CreatedAt,
		&t.UpdatedAt,
		&t.CreatedBy,
		&t.UpdatedBy,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTemplateNotFound
	}
	if err != nil {
		return nil, err
	}

	return &t, nil
}

// GetByName retrieves a template by name within a domain
func (r *TemplateRepository) GetByName(ctx context.Context, domainID uuid.UUID, name string) (*models.Template, error) {
	query := `
		SELECT id, domain_id, name, description, subject, html_content, text_content,
		       variables, version, active, category, tags, metadata, thumbnail_url,
		       created_at, updated_at, created_by, updated_by
		FROM email_templates
		WHERE domain_id = $1 AND name = $2 AND active = true
	`

	var t models.Template
	err := r.pool.QueryRow(ctx, query, domainID, name).Scan(
		&t.ID,
		&t.DomainID,
		&t.Name,
		&t.Description,
		&t.Subject,
		&t.HTMLContent,
		&t.TextContent,
		&t.Variables,
		&t.Version,
		&t.Active,
		&t.Category,
		&t.Tags,
		&t.Metadata,
		&t.ThumbnailURL,
		&t.CreatedAt,
		&t.UpdatedAt,
		&t.CreatedBy,
		&t.UpdatedBy,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTemplateNotFound
	}
	if err != nil {
		return nil, err
	}

	return &t, nil
}

// List retrieves templates with filtering and pagination
func (r *TemplateRepository) List(ctx context.Context, query *models.TemplateQuery) (*models.TemplateListResponse, error) {
	// Build query with filters
	baseQuery := `
		SELECT id, domain_id, name, description, subject, html_content, text_content,
		       variables, version, active, category, tags, metadata, thumbnail_url,
		       created_at, updated_at, created_by, updated_by
		FROM email_templates
		WHERE domain_id = $1
	`
	countQuery := `SELECT COUNT(*) FROM email_templates WHERE domain_id = $1`

	args := []any{query.DomainID}
	argCount := 1

	if query.Category != "" {
		argCount++
		baseQuery += " AND category = $" + string(rune('0'+argCount))
		countQuery += " AND category = $" + string(rune('0'+argCount))
		args = append(args, query.Category)
	}

	if query.Active != nil {
		argCount++
		baseQuery += " AND active = $" + string(rune('0'+argCount))
		countQuery += " AND active = $" + string(rune('0'+argCount))
		args = append(args, *query.Active)
	}

	if len(query.Tags) > 0 {
		argCount++
		baseQuery += " AND tags && $" + string(rune('0'+argCount))
		countQuery += " AND tags && $" + string(rune('0'+argCount))
		args = append(args, query.Tags)
	}

	if query.Search != "" {
		argCount++
		searchPattern := "%" + query.Search + "%"
		baseQuery += " AND (name ILIKE $" + string(rune('0'+argCount)) + " OR description ILIKE $" + string(rune('0'+argCount)) + ")"
		countQuery += " AND (name ILIKE $" + string(rune('0'+argCount)) + " OR description ILIKE $" + string(rune('0'+argCount)) + ")"
		args = append(args, searchPattern)
	}

	// Get total count
	var total int64
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, err
	}

	// Add pagination
	baseQuery += " ORDER BY created_at DESC LIMIT $" + string(rune('0'+argCount+1)) + " OFFSET $" + string(rune('0'+argCount+2))
	args = append(args, query.Limit, query.Offset)

	rows, err := r.pool.Query(ctx, baseQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []models.Template
	for rows.Next() {
		var t models.Template
		err := rows.Scan(
			&t.ID,
			&t.DomainID,
			&t.Name,
			&t.Description,
			&t.Subject,
			&t.HTMLContent,
			&t.TextContent,
			&t.Variables,
			&t.Version,
			&t.Active,
			&t.Category,
			&t.Tags,
			&t.Metadata,
			&t.ThumbnailURL,
			&t.CreatedAt,
			&t.UpdatedAt,
			&t.CreatedBy,
			&t.UpdatedBy,
		)
		if err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}

	return &models.TemplateListResponse{
		Templates: templates,
		Total:     total,
		Limit:     query.Limit,
		Offset:    query.Offset,
		HasMore:   int64(query.Offset+len(templates)) < total,
	}, nil
}

// Update updates an existing template
func (r *TemplateRepository) Update(ctx context.Context, id uuid.UUID, req *models.UpdateTemplateRequest, updatedBy uuid.UUID) error {
	// First get current template to save version
	current, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Start transaction
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Save current version to history
	versionQuery := `
		INSERT INTO template_versions (
			template_id, version, subject, html_content, text_content,
			variables, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = tx.Exec(ctx, versionQuery,
		current.ID,
		current.Version,
		current.Subject,
		current.HTMLContent,
		current.TextContent,
		current.Variables,
		current.UpdatedBy,
	)
	if err != nil {
		return err
	}

	// Update template
	updateQuery := `
		UPDATE email_templates
		SET name = COALESCE($2, name),
		    description = COALESCE($3, description),
		    subject = COALESCE($4, subject),
		    html_content = COALESCE($5, html_content),
		    text_content = COALESCE($6, text_content),
		    variables = COALESCE($7, variables),
		    category = COALESCE($8, category),
		    tags = COALESCE($9, tags),
		    metadata = COALESCE($10, metadata),
		    active = COALESCE($11, active),
		    version = version + 1,
		    updated_by = $12
		WHERE id = $1
	`

	var varsArg, tagsArg any
	if req.Variables != nil {
		varsArg = req.Variables
	}
	if req.Tags != nil {
		tagsArg = req.Tags
	}

	_, err = tx.Exec(ctx, updateQuery,
		id,
		req.Name,
		req.Description,
		req.Subject,
		req.HTMLContent,
		req.TextContent,
		varsArg,
		req.Category,
		tagsArg,
		req.Metadata,
		req.Active,
		updatedBy,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// Delete soft-deletes a template by setting active to false
func (r *TemplateRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE email_templates SET active = false WHERE id = $1`

	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrTemplateNotFound
	}

	return nil
}

// HardDelete permanently removes a template
func (r *TemplateRepository) HardDelete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM email_templates WHERE id = $1`

	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrTemplateNotFound
	}

	return nil
}

// GetVersions retrieves version history for a template
func (r *TemplateRepository) GetVersions(ctx context.Context, templateID uuid.UUID) ([]models.TemplateVersion, error) {
	query := `
		SELECT id, template_id, version, subject, html_content, text_content,
		       variables, created_at, created_by, change_note
		FROM template_versions
		WHERE template_id = $1
		ORDER BY version DESC
	`

	rows, err := r.pool.Query(ctx, query, templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var versions []models.TemplateVersion
	for rows.Next() {
		var v models.TemplateVersion
		err := rows.Scan(
			&v.ID,
			&v.TemplateID,
			&v.Version,
			&v.Subject,
			&v.HTMLContent,
			&v.TextContent,
			&v.Variables,
			&v.CreatedAt,
			&v.CreatedBy,
			&v.ChangeNote,
		)
		if err != nil {
			return nil, err
		}
		versions = append(versions, v)
	}

	return versions, nil
}

// RestoreVersion restores a previous version of a template
func (r *TemplateRepository) RestoreVersion(ctx context.Context, templateID uuid.UUID, version int, updatedBy uuid.UUID) error {
	// Get the version to restore
	query := `
		SELECT subject, html_content, text_content, variables
		FROM template_versions
		WHERE template_id = $1 AND version = $2
	`

	var subject, htmlContent, textContent string
	var variables []models.TemplateVariable

	err := r.pool.QueryRow(ctx, query, templateID, version).Scan(
		&subject,
		&htmlContent,
		&textContent,
		&variables,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrTemplateNotFound
	}
	if err != nil {
		return err
	}

	// Update the template with the restored version
	req := &models.UpdateTemplateRequest{
		Subject:     &subject,
		HTMLContent: &htmlContent,
		TextContent: &textContent,
		Variables:   variables,
	}

	return r.Update(ctx, templateID, req, updatedBy)
}

// Clone creates a copy of an existing template
func (r *TemplateRepository) Clone(ctx context.Context, templateID uuid.UUID, newName string, createdBy uuid.UUID) (*models.Template, error) {
	original, err := r.GetByID(ctx, templateID)
	if err != nil {
		return nil, err
	}

	newTemplate := &models.Template{
		ID:          uuid.New(),
		DomainID:    original.DomainID,
		Name:        newName,
		Description: original.Description,
		Subject:     original.Subject,
		HTMLContent: original.HTMLContent,
		TextContent: original.TextContent,
		Variables:   original.Variables,
		Version:     1,
		Active:      true,
		Category:    original.Category,
		Tags:        original.Tags,
		Metadata:    original.Metadata,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		CreatedBy:   createdBy,
		UpdatedBy:   createdBy,
	}

	if err := r.Create(ctx, newTemplate); err != nil {
		return nil, err
	}

	return newTemplate, nil
}

// helper function to check for duplicate key errors
func isDuplicateKeyError(err error) bool {
	return err != nil && (errors.Is(err, pgx.ErrNoRows) == false) &&
		(err.Error() == "ERROR: duplicate key value violates unique constraint" ||
			len(err.Error()) > 0 && err.Error()[:5] == "ERROR")
}
