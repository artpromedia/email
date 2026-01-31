package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"transactional-api/models"
)

type WebhookRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

func NewWebhookRepository(db *pgxpool.Pool, logger *zap.Logger) *WebhookRepository {
	return &WebhookRepository{db: db, logger: logger}
}

func (r *WebhookRepository) generateSecret() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (r *WebhookRepository) Create(ctx context.Context, orgID uuid.UUID, req *models.CreateWebhookRequest) (*models.Webhook, error) {
	id := uuid.New()
	now := time.Now()
	secret := r.generateSecret()

	query := `
		INSERT INTO webhooks (id, organization_id, url, events, is_active, secret, failure_count, created_at, updated_at)
		VALUES ($1, $2, $3, $4, true, $5, 0, $6, $6)
		RETURNING id, organization_id, url, events, is_active, secret, failure_count, last_triggered, created_at, updated_at
	`

	webhook := &models.Webhook{}
	err := r.db.QueryRow(ctx, query, id, orgID, req.URL, req.Events, secret, now).Scan(
		&webhook.ID, &webhook.OrganizationID, &webhook.URL, &webhook.Events,
		&webhook.IsActive, &webhook.Secret, &webhook.FailureCount, &webhook.LastTriggered,
		&webhook.CreatedAt, &webhook.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert webhook: %w", err)
	}

	return webhook, nil
}

func (r *WebhookRepository) GetByID(ctx context.Context, id, orgID uuid.UUID) (*models.Webhook, error) {
	query := `
		SELECT id, organization_id, url, events, is_active, secret, failure_count, last_triggered, created_at, updated_at
		FROM webhooks
		WHERE id = $1 AND organization_id = $2
	`

	webhook := &models.Webhook{}
	err := r.db.QueryRow(ctx, query, id, orgID).Scan(
		&webhook.ID, &webhook.OrganizationID, &webhook.URL, &webhook.Events,
		&webhook.IsActive, &webhook.Secret, &webhook.FailureCount, &webhook.LastTriggered,
		&webhook.CreatedAt, &webhook.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("webhook not found")
	}
	if err != nil {
		return nil, fmt.Errorf("query webhook: %w", err)
	}

	return webhook, nil
}

func (r *WebhookRepository) List(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*models.Webhook, int64, error) {
	countQuery := `SELECT COUNT(*) FROM webhooks WHERE organization_id = $1`
	var total int64
	if err := r.db.QueryRow(ctx, countQuery, orgID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count webhooks: %w", err)
	}

	query := `
		SELECT id, organization_id, url, events, is_active, secret, failure_count, last_triggered, created_at, updated_at
		FROM webhooks
		WHERE organization_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, orgID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query webhooks: %w", err)
	}
	defer rows.Close()

	var webhooks []*models.Webhook
	for rows.Next() {
		webhook := &models.Webhook{}
		if err := rows.Scan(
			&webhook.ID, &webhook.OrganizationID, &webhook.URL, &webhook.Events,
			&webhook.IsActive, &webhook.Secret, &webhook.FailureCount, &webhook.LastTriggered,
			&webhook.CreatedAt, &webhook.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan webhook: %w", err)
		}
		webhooks = append(webhooks, webhook)
	}

	return webhooks, total, nil
}

func (r *WebhookRepository) Update(ctx context.Context, id, orgID uuid.UUID, req *models.UpdateWebhookRequest) (*models.Webhook, error) {
	updates := []string{}
	args := []interface{}{}
	argCount := 1

	if req.URL != nil {
		updates = append(updates, fmt.Sprintf("url = $%d", argCount))
		args = append(args, *req.URL)
		argCount++
	}
	if req.Events != nil {
		updates = append(updates, fmt.Sprintf("events = $%d", argCount))
		args = append(args, req.Events)
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

	updates = append(updates, fmt.Sprintf("updated_at = $%d", argCount))
	args = append(args, time.Now())
	argCount++

	args = append(args, id, orgID)

	query := fmt.Sprintf(`
		UPDATE webhooks
		SET %s
		WHERE id = $%d AND organization_id = $%d
	`, joinStrings(updates, ", "), argCount, argCount+1)

	_, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("update webhook: %w", err)
	}

	return r.GetByID(ctx, id, orgID)
}

func (r *WebhookRepository) Delete(ctx context.Context, id, orgID uuid.UUID) error {
	query := `DELETE FROM webhooks WHERE id = $1 AND organization_id = $2`
	result, err := r.db.Exec(ctx, query, id, orgID)
	if err != nil {
		return fmt.Errorf("delete webhook: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("webhook not found")
	}
	return nil
}

func (r *WebhookRepository) GetByEvent(ctx context.Context, orgID uuid.UUID, eventType string) ([]*models.Webhook, error) {
	query := `
		SELECT id, organization_id, url, events, is_active, secret, failure_count, last_triggered, created_at, updated_at
		FROM webhooks
		WHERE organization_id = $1 AND is_active = true AND $2 = ANY(events)
	`

	rows, err := r.db.Query(ctx, query, orgID, eventType)
	if err != nil {
		return nil, fmt.Errorf("query webhooks by event: %w", err)
	}
	defer rows.Close()

	var webhooks []*models.Webhook
	for rows.Next() {
		webhook := &models.Webhook{}
		if err := rows.Scan(
			&webhook.ID, &webhook.OrganizationID, &webhook.URL, &webhook.Events,
			&webhook.IsActive, &webhook.Secret, &webhook.FailureCount, &webhook.LastTriggered,
			&webhook.CreatedAt, &webhook.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan webhook: %w", err)
		}
		webhooks = append(webhooks, webhook)
	}

	return webhooks, nil
}

func (r *WebhookRepository) IncrementFailureCount(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE webhooks SET failure_count = failure_count + 1, updated_at = $1 WHERE id = $2`
	_, err := r.db.Exec(ctx, query, time.Now(), id)
	return err
}

func (r *WebhookRepository) ResetFailureCount(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE webhooks SET failure_count = 0, last_triggered = $1, updated_at = $1 WHERE id = $2`
	_, err := r.db.Exec(ctx, query, time.Now(), id)
	return err
}
