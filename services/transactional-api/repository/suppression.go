package repository

import (
	"context"
	"errors"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrSuppressionNotFound  = errors.New("suppression not found")
	ErrSuppressionExists    = errors.New("email already suppressed")
)

// SuppressionRepository handles database operations for suppression lists
type SuppressionRepository struct {
	pool *pgxpool.Pool
}

// NewSuppressionRepository creates a new SuppressionRepository
func NewSuppressionRepository(pool *pgxpool.Pool) *SuppressionRepository {
	return &SuppressionRepository{pool: pool}
}

// Create adds an email to the suppression list
func (r *SuppressionRepository) Create(ctx context.Context, suppression *models.Suppression) error {
	query := `
		INSERT INTO suppressions (
			id, domain_id, email, reason, bounce_class, description,
			original_error, source, message_id, expires_at, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (domain_id, email) DO NOTHING
	`

	result, err := r.pool.Exec(ctx, query,
		suppression.ID,
		suppression.DomainID,
		suppression.Email,
		suppression.Reason,
		suppression.BounceClass,
		suppression.Description,
		suppression.OriginalError,
		suppression.Source,
		suppression.MessageID,
		suppression.ExpiresAt,
		suppression.CreatedBy,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrSuppressionExists
	}

	return nil
}

// CreateBulk adds multiple emails to the suppression list
func (r *SuppressionRepository) CreateBulk(ctx context.Context, domainID uuid.UUID, emails []string, reason models.SuppressionReason, description string, createdBy *uuid.UUID) (*models.BulkSuppressionResponse, error) {
	response := &models.BulkSuppressionResponse{}

	for _, email := range emails {
		suppression := &models.Suppression{
			ID:          uuid.New(),
			DomainID:    domainID,
			Email:       email,
			Reason:      reason,
			Description: description,
			Source:      "api",
			CreatedBy:   createdBy,
		}

		err := r.Create(ctx, suppression)
		if errors.Is(err, ErrSuppressionExists) {
			response.Existing++
		} else if err != nil {
			response.Errors = append(response.Errors, email+": "+err.Error())
		} else {
			response.Added++
		}
	}

	return response, nil
}

// GetByEmail retrieves suppression status for a specific email
func (r *SuppressionRepository) GetByEmail(ctx context.Context, domainID uuid.UUID, email string) (*models.Suppression, error) {
	query := `
		SELECT id, domain_id, email, reason, bounce_class, description,
		       original_error, source, message_id, created_at, expires_at, created_by
		FROM suppressions
		WHERE domain_id = $1 AND email = $2
		  AND (expires_at IS NULL OR expires_at > NOW())
	`

	var s models.Suppression
	err := r.pool.QueryRow(ctx, query, domainID, email).Scan(
		&s.ID,
		&s.DomainID,
		&s.Email,
		&s.Reason,
		&s.BounceClass,
		&s.Description,
		&s.OriginalError,
		&s.Source,
		&s.MessageID,
		&s.CreatedAt,
		&s.ExpiresAt,
		&s.CreatedBy,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSuppressionNotFound
	}
	if err != nil {
		return nil, err
	}

	return &s, nil
}

// IsSuppressed checks if an email is suppressed
func (r *SuppressionRepository) IsSuppressed(ctx context.Context, domainID uuid.UUID, email string) (bool, *models.SuppressionStatus, error) {
	query := `
		SELECT reason, created_at, expires_at
		FROM suppressions
		WHERE domain_id = $1 AND email = $2
		  AND (expires_at IS NULL OR expires_at > NOW())
	`

	var status models.SuppressionStatus
	err := r.pool.QueryRow(ctx, query, domainID, email).Scan(
		&status.Reason,
		&status.Since,
		&status.ExpiresAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil, nil
	}
	if err != nil {
		return false, nil, err
	}

	status.Suppressed = true
	return true, &status, nil
}

// CheckMultiple checks suppression status for multiple emails
func (r *SuppressionRepository) CheckMultiple(ctx context.Context, domainID uuid.UUID, emails []string) (*models.CheckSuppressionResponse, error) {
	response := &models.CheckSuppressionResponse{
		Results: make(map[string]*models.SuppressionStatus),
	}

	query := `
		SELECT email, reason, created_at, expires_at
		FROM suppressions
		WHERE domain_id = $1 AND email = ANY($2)
		  AND (expires_at IS NULL OR expires_at > NOW())
	`

	rows, err := r.pool.Query(ctx, query, domainID, emails)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	suppressed := make(map[string]*models.SuppressionStatus)
	for rows.Next() {
		var email string
		var status models.SuppressionStatus
		err := rows.Scan(&email, &status.Reason, &status.Since, &status.ExpiresAt)
		if err != nil {
			return nil, err
		}
		status.Suppressed = true
		suppressed[email] = &status
	}

	// Build response with all emails
	for _, email := range emails {
		if status, ok := suppressed[email]; ok {
			response.Results[email] = status
		} else {
			response.Results[email] = &models.SuppressionStatus{Suppressed: false}
		}
	}

	return response, nil
}

// List retrieves suppressions with filtering and pagination
func (r *SuppressionRepository) List(ctx context.Context, query *models.SuppressionQuery) (*models.SuppressionListResponse, error) {
	baseQuery := `
		SELECT id, domain_id, email, reason, bounce_class, description,
		       original_error, source, message_id, created_at, expires_at, created_by
		FROM suppressions
		WHERE domain_id = $1
	`
	countQuery := `SELECT COUNT(*) FROM suppressions WHERE domain_id = $1`

	args := []any{query.DomainID}
	argIdx := 2

	if query.Reason != nil {
		baseQuery += " AND reason = $" + itoa(argIdx)
		countQuery += " AND reason = $" + itoa(argIdx)
		args = append(args, *query.Reason)
		argIdx++
	}

	if query.Email != "" {
		baseQuery += " AND email ILIKE $" + itoa(argIdx)
		countQuery += " AND email ILIKE $" + itoa(argIdx)
		args = append(args, "%"+query.Email+"%")
		argIdx++
	}

	if query.StartDate != nil {
		baseQuery += " AND created_at >= $" + itoa(argIdx)
		countQuery += " AND created_at >= $" + itoa(argIdx)
		args = append(args, *query.StartDate)
		argIdx++
	}

	if query.EndDate != nil {
		baseQuery += " AND created_at <= $" + itoa(argIdx)
		countQuery += " AND created_at <= $" + itoa(argIdx)
		args = append(args, *query.EndDate)
		argIdx++
	}

	// Get total count
	var total int64
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, err
	}

	// Add pagination
	baseQuery += " ORDER BY created_at DESC LIMIT $" + itoa(argIdx) + " OFFSET $" + itoa(argIdx+1)
	args = append(args, query.Limit, query.Offset)

	rows, err := r.pool.Query(ctx, baseQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suppressions []models.Suppression
	for rows.Next() {
		var s models.Suppression
		err := rows.Scan(
			&s.ID,
			&s.DomainID,
			&s.Email,
			&s.Reason,
			&s.BounceClass,
			&s.Description,
			&s.OriginalError,
			&s.Source,
			&s.MessageID,
			&s.CreatedAt,
			&s.ExpiresAt,
			&s.CreatedBy,
		)
		if err != nil {
			return nil, err
		}
		suppressions = append(suppressions, s)
	}

	return &models.SuppressionListResponse{
		Suppressions: suppressions,
		Total:        total,
		Limit:        query.Limit,
		Offset:       query.Offset,
		HasMore:      int64(query.Offset+len(suppressions)) < total,
	}, nil
}

// Delete removes an email from the suppression list
func (r *SuppressionRepository) Delete(ctx context.Context, domainID uuid.UUID, email string) error {
	query := `DELETE FROM suppressions WHERE domain_id = $1 AND email = $2`

	result, err := r.pool.Exec(ctx, query, domainID, email)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrSuppressionNotFound
	}

	return nil
}

// DeleteByID removes a suppression by ID
func (r *SuppressionRepository) DeleteByID(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM suppressions WHERE id = $1`

	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrSuppressionNotFound
	}

	return nil
}

// GetStats retrieves suppression statistics
func (r *SuppressionRepository) GetStats(ctx context.Context, domainID uuid.UUID) (*models.SuppressionStats, error) {
	query := `
		SELECT
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE reason = 'bounce') as bounces,
			COUNT(*) FILTER (WHERE reason = 'unsubscribe') as unsubscribes,
			COUNT(*) FILTER (WHERE reason = 'spam_complaint') as spam_complaints,
			COUNT(*) FILTER (WHERE reason = 'manual') as manual,
			COUNT(*) FILTER (WHERE reason = 'invalid') as invalid,
			COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24_hours,
			COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7_days,
			COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
		FROM suppressions
		WHERE domain_id = $1
		  AND (expires_at IS NULL OR expires_at > NOW())
	`

	var stats models.SuppressionStats
	err := r.pool.QueryRow(ctx, query, domainID).Scan(
		&stats.Total,
		&stats.Bounces,
		&stats.Unsubscribes,
		&stats.SpamComplaints,
		&stats.Manual,
		&stats.Invalid,
		&stats.Last24Hours,
		&stats.Last7Days,
		&stats.Last30Days,
	)
	if err != nil {
		return nil, err
	}

	return &stats, nil
}

// DeleteExpired removes expired suppressions
func (r *SuppressionRepository) DeleteExpired(ctx context.Context) (int64, error) {
	query := `
		DELETE FROM suppressions
		WHERE expires_at IS NOT NULL AND expires_at <= NOW()
	`

	result, err := r.pool.Exec(ctx, query)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected(), nil
}

// CreateUnsubscribeGroup creates a new unsubscribe group
func (r *SuppressionRepository) CreateUnsubscribeGroup(ctx context.Context, group *models.UnsubscribeGroup) error {
	query := `
		INSERT INTO unsubscribe_groups (id, domain_id, name, description, is_default)
		VALUES ($1, $2, $3, $4, $5)
	`

	_, err := r.pool.Exec(ctx, query,
		group.ID,
		group.DomainID,
		group.Name,
		group.Description,
		group.IsDefault,
	)

	return err
}

// GetUnsubscribeGroups retrieves unsubscribe groups for a domain
func (r *SuppressionRepository) GetUnsubscribeGroups(ctx context.Context, domainID uuid.UUID) ([]models.UnsubscribeGroup, error) {
	query := `
		SELECT id, domain_id, name, description, is_default, created_at, updated_at
		FROM unsubscribe_groups
		WHERE domain_id = $1
		ORDER BY name ASC
	`

	rows, err := r.pool.Query(ctx, query, domainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []models.UnsubscribeGroup
	for rows.Next() {
		var g models.UnsubscribeGroup
		err := rows.Scan(
			&g.ID,
			&g.DomainID,
			&g.Name,
			&g.Description,
			&g.IsDefault,
			&g.CreatedAt,
			&g.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}

	return groups, nil
}

// AddToGroup adds an email to an unsubscribe group
func (r *SuppressionRepository) AddToGroup(ctx context.Context, groupID uuid.UUID, email string) error {
	query := `
		INSERT INTO group_suppressions (id, group_id, email)
		VALUES ($1, $2, $3)
		ON CONFLICT (group_id, email) DO NOTHING
	`

	_, err := r.pool.Exec(ctx, query, uuid.New(), groupID, email)
	return err
}

// RemoveFromGroup removes an email from an unsubscribe group
func (r *SuppressionRepository) RemoveFromGroup(ctx context.Context, groupID uuid.UUID, email string) error {
	query := `DELETE FROM group_suppressions WHERE group_id = $1 AND email = $2`

	_, err := r.pool.Exec(ctx, query, groupID, email)
	return err
}

// IsInGroup checks if an email is in an unsubscribe group
func (r *SuppressionRepository) IsInGroup(ctx context.Context, groupID uuid.UUID, email string) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM group_suppressions WHERE group_id = $1 AND email = $2
		)
	`

	var exists bool
	err := r.pool.QueryRow(ctx, query, groupID, email).Scan(&exists)
	return exists, err
}
