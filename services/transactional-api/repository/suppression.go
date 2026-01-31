package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"transactional-api/models"
)

type SuppressionRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

func NewSuppressionRepository(db *pgxpool.Pool, logger *zap.Logger) *SuppressionRepository {
	return &SuppressionRepository{db: db, logger: logger}
}

func (r *SuppressionRepository) Add(ctx context.Context, orgID uuid.UUID, email string, suppressionType models.SuppressionType, reason string) error {
	query := `
		INSERT INTO suppressions (id, organization_id, email, type, reason, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (organization_id, email, type) DO UPDATE SET reason = $5, created_at = $6
	`

	_, err := r.db.Exec(ctx, query, uuid.New(), orgID, email, suppressionType, reason, time.Now())
	if err != nil {
		return fmt.Errorf("insert suppression: %w", err)
	}

	return nil
}

func (r *SuppressionRepository) Remove(ctx context.Context, orgID uuid.UUID, email string, suppressionType models.SuppressionType) error {
	query := `DELETE FROM suppressions WHERE organization_id = $1 AND email = $2 AND type = $3`
	result, err := r.db.Exec(ctx, query, orgID, email, suppressionType)
	if err != nil {
		return fmt.Errorf("delete suppression: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("suppression not found")
	}
	return nil
}

func (r *SuppressionRepository) Exists(ctx context.Context, orgID uuid.UUID, email string) (bool, models.SuppressionType, error) {
	query := `SELECT type FROM suppressions WHERE organization_id = $1 AND email = $2 LIMIT 1`

	var suppressionType models.SuppressionType
	err := r.db.QueryRow(ctx, query, orgID, email).Scan(&suppressionType)
	if err == pgx.ErrNoRows {
		return false, "", nil
	}
	if err != nil {
		return false, "", fmt.Errorf("check suppression: %w", err)
	}

	return true, suppressionType, nil
}

func (r *SuppressionRepository) List(ctx context.Context, orgID uuid.UUID, suppressionType models.SuppressionType, limit, offset int) ([]*models.Suppression, int64, error) {
	countQuery := `SELECT COUNT(*) FROM suppressions WHERE organization_id = $1 AND type = $2`
	var total int64
	if err := r.db.QueryRow(ctx, countQuery, orgID, suppressionType).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count suppressions: %w", err)
	}

	query := `
		SELECT id, organization_id, email, type, reason, created_at
		FROM suppressions
		WHERE organization_id = $1 AND type = $2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.db.Query(ctx, query, orgID, suppressionType, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query suppressions: %w", err)
	}
	defer rows.Close()

	var suppressions []*models.Suppression
	for rows.Next() {
		suppression := &models.Suppression{}
		if err := rows.Scan(
			&suppression.ID, &suppression.OrganizationID, &suppression.Email,
			&suppression.Type, &suppression.Reason, &suppression.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan suppression: %w", err)
		}
		suppressions = append(suppressions, suppression)
	}

	return suppressions, total, nil
}

func (r *SuppressionRepository) GetAllForEmail(ctx context.Context, orgID uuid.UUID, email string) ([]*models.Suppression, error) {
	query := `
		SELECT id, organization_id, email, type, reason, created_at
		FROM suppressions
		WHERE organization_id = $1 AND email = $2
	`

	rows, err := r.db.Query(ctx, query, orgID, email)
	if err != nil {
		return nil, fmt.Errorf("query suppressions: %w", err)
	}
	defer rows.Close()

	var suppressions []*models.Suppression
	for rows.Next() {
		suppression := &models.Suppression{}
		if err := rows.Scan(
			&suppression.ID, &suppression.OrganizationID, &suppression.Email,
			&suppression.Type, &suppression.Reason, &suppression.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan suppression: %w", err)
		}
		suppressions = append(suppressions, suppression)
	}

	return suppressions, nil
}

func (r *SuppressionRepository) BulkAdd(ctx context.Context, orgID uuid.UUID, emails []string, suppressionType models.SuppressionType, reason string) (int, error) {
	batch := &pgx.Batch{}
	now := time.Now()

	for _, email := range emails {
		batch.Queue(`
			INSERT INTO suppressions (id, organization_id, email, type, reason, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (organization_id, email, type) DO NOTHING
		`, uuid.New(), orgID, email, suppressionType, reason, now)
	}

	results := r.db.SendBatch(ctx, batch)
	defer results.Close()

	var inserted int
	for range emails {
		result, err := results.Exec()
		if err != nil {
			continue
		}
		if result.RowsAffected() > 0 {
			inserted++
		}
	}

	return inserted, nil
}

func (r *SuppressionRepository) BulkRemove(ctx context.Context, orgID uuid.UUID, emails []string, suppressionType models.SuppressionType) (int, error) {
	batch := &pgx.Batch{}

	for _, email := range emails {
		batch.Queue(`DELETE FROM suppressions WHERE organization_id = $1 AND email = $2 AND type = $3`, orgID, email, suppressionType)
	}

	results := r.db.SendBatch(ctx, batch)
	defer results.Close()

	var removed int
	for range emails {
		result, err := results.Exec()
		if err != nil {
			continue
		}
		removed += int(result.RowsAffected())
	}

	return removed, nil
}
