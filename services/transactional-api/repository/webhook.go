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
	ErrWebhookNotFound = errors.New("webhook not found")
)

// WebhookRepository handles database operations for webhooks
type WebhookRepository struct {
	pool *pgxpool.Pool
}

// NewWebhookRepository creates a new WebhookRepository
func NewWebhookRepository(pool *pgxpool.Pool) *WebhookRepository {
	return &WebhookRepository{pool: pool}
}

// Create creates a new webhook configuration
func (r *WebhookRepository) Create(ctx context.Context, webhook *models.Webhook) error {
	query := `
		INSERT INTO webhooks (
			id, domain_id, url, events, secret, secret_prefix,
			active, description, headers, retry_policy
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	_, err := r.pool.Exec(ctx, query,
		webhook.ID,
		webhook.DomainID,
		webhook.URL,
		webhook.Events,
		webhook.Secret,
		webhook.SecretPrefix,
		webhook.Active,
		webhook.Description,
		webhook.Headers,
		webhook.RetryPolicy,
	)

	return err
}

// GetByID retrieves a webhook by ID
func (r *WebhookRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Webhook, error) {
	query := `
		SELECT id, domain_id, url, events, secret, secret_prefix, active, description,
		       headers, retry_policy, created_at, updated_at, last_triggered_at,
		       failure_count, last_error
		FROM webhooks
		WHERE id = $1
	`

	var w models.Webhook
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&w.ID,
		&w.DomainID,
		&w.URL,
		&w.Events,
		&w.Secret,
		&w.SecretPrefix,
		&w.Active,
		&w.Description,
		&w.Headers,
		&w.RetryPolicy,
		&w.CreatedAt,
		&w.UpdatedAt,
		&w.LastTriggeredAt,
		&w.FailureCount,
		&w.LastError,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWebhookNotFound
	}
	if err != nil {
		return nil, err
	}

	return &w, nil
}

// List retrieves all webhooks for a domain
func (r *WebhookRepository) List(ctx context.Context, domainID uuid.UUID) (*models.WebhookListResponse, error) {
	query := `
		SELECT id, domain_id, url, events, secret_prefix, active, description,
		       headers, retry_policy, created_at, updated_at, last_triggered_at,
		       failure_count, last_error
		FROM webhooks
		WHERE domain_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.pool.Query(ctx, query, domainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var webhooks []models.Webhook
	for rows.Next() {
		var w models.Webhook
		err := rows.Scan(
			&w.ID,
			&w.DomainID,
			&w.URL,
			&w.Events,
			&w.SecretPrefix,
			&w.Active,
			&w.Description,
			&w.Headers,
			&w.RetryPolicy,
			&w.CreatedAt,
			&w.UpdatedAt,
			&w.LastTriggeredAt,
			&w.FailureCount,
			&w.LastError,
		)
		if err != nil {
			return nil, err
		}
		webhooks = append(webhooks, w)
	}

	return &models.WebhookListResponse{
		Webhooks: webhooks,
		Total:    int64(len(webhooks)),
	}, nil
}

// GetActiveWebhooksForEvent retrieves active webhooks configured for a specific event type
func (r *WebhookRepository) GetActiveWebhooksForEvent(ctx context.Context, domainID uuid.UUID, eventType models.WebhookEventType) ([]models.Webhook, error) {
	query := `
		SELECT id, domain_id, url, events, secret, secret_prefix, active, description,
		       headers, retry_policy, created_at, updated_at, last_triggered_at,
		       failure_count, last_error
		FROM webhooks
		WHERE domain_id = $1 AND active = true AND $2 = ANY(events)
	`

	rows, err := r.pool.Query(ctx, query, domainID, eventType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var webhooks []models.Webhook
	for rows.Next() {
		var w models.Webhook
		err := rows.Scan(
			&w.ID,
			&w.DomainID,
			&w.URL,
			&w.Events,
			&w.Secret,
			&w.SecretPrefix,
			&w.Active,
			&w.Description,
			&w.Headers,
			&w.RetryPolicy,
			&w.CreatedAt,
			&w.UpdatedAt,
			&w.LastTriggeredAt,
			&w.FailureCount,
			&w.LastError,
		)
		if err != nil {
			return nil, err
		}
		webhooks = append(webhooks, w)
	}

	return webhooks, nil
}

// Update updates a webhook configuration
func (r *WebhookRepository) Update(ctx context.Context, id uuid.UUID, req *models.UpdateWebhookRequest) error {
	query := `
		UPDATE webhooks
		SET url = COALESCE($2, url),
		    events = COALESCE($3, events),
		    description = COALESCE($4, description),
		    headers = COALESCE($5, headers),
		    retry_policy = COALESCE($6, retry_policy),
		    active = COALESCE($7, active)
		WHERE id = $1
	`

	var eventsArg any
	if req.Events != nil {
		eventsArg = req.Events
	}

	result, err := r.pool.Exec(ctx, query,
		id,
		req.URL,
		eventsArg,
		req.Description,
		req.Headers,
		req.RetryPolicy,
		req.Active,
	)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrWebhookNotFound
	}

	return nil
}

// Delete removes a webhook configuration
func (r *WebhookRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM webhooks WHERE id = $1`

	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrWebhookNotFound
	}

	return nil
}

// UpdateSecret updates the webhook secret
func (r *WebhookRepository) UpdateSecret(ctx context.Context, id uuid.UUID, secret, secretPrefix string) error {
	query := `
		UPDATE webhooks
		SET secret = $2, secret_prefix = $3
		WHERE id = $1
	`

	result, err := r.pool.Exec(ctx, query, id, secret, secretPrefix)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrWebhookNotFound
	}

	return nil
}

// RecordSuccess records a successful webhook delivery
func (r *WebhookRepository) RecordSuccess(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE webhooks
		SET last_triggered_at = NOW(), failure_count = 0, last_error = NULL
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// RecordFailure records a failed webhook delivery
func (r *WebhookRepository) RecordFailure(ctx context.Context, id uuid.UUID, errMsg string) error {
	query := `
		UPDATE webhooks
		SET last_triggered_at = NOW(), failure_count = failure_count + 1, last_error = $2
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id, errMsg)
	return err
}

// CreateDelivery creates a webhook delivery record
func (r *WebhookRepository) CreateDelivery(ctx context.Context, delivery *models.WebhookDelivery) error {
	query := `
		INSERT INTO webhook_deliveries (
			id, webhook_id, event_id, event_type, url, request_body,
			response_code, response_body, success, error, attempt_number, duration_ms
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	_, err := r.pool.Exec(ctx, query,
		delivery.ID,
		delivery.WebhookID,
		delivery.EventID,
		delivery.Event,
		delivery.URL,
		delivery.RequestBody,
		delivery.ResponseCode,
		delivery.ResponseBody,
		delivery.Success,
		delivery.Error,
		delivery.AttemptNumber,
		delivery.Duration.Milliseconds(),
	)

	return err
}

// ListDeliveries retrieves webhook delivery history
func (r *WebhookRepository) ListDeliveries(ctx context.Context, query *models.WebhookDeliveryQuery) (*models.WebhookDeliveryListResponse, error) {
	baseQuery := `
		SELECT id, webhook_id, event_id, event_type, url, request_body,
		       response_code, response_body, success, error, attempt_number,
		       duration_ms, created_at
		FROM webhook_deliveries
		WHERE webhook_id = $1
	`
	countQuery := `SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = $1`

	args := []any{query.WebhookID}
	argIdx := 2

	if query.Success != nil {
		baseQuery += " AND success = $" + itoa(argIdx)
		countQuery += " AND success = $" + itoa(argIdx)
		args = append(args, *query.Success)
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

	var deliveries []models.WebhookDelivery
	for rows.Next() {
		var d models.WebhookDelivery
		var durationMs int64
		err := rows.Scan(
			&d.ID,
			&d.WebhookID,
			&d.EventID,
			&d.Event,
			&d.URL,
			&d.RequestBody,
			&d.ResponseCode,
			&d.ResponseBody,
			&d.Success,
			&d.Error,
			&d.AttemptNumber,
			&durationMs,
			&d.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		d.Duration = time.Duration(durationMs) * time.Millisecond
		deliveries = append(deliveries, d)
	}

	return &models.WebhookDeliveryListResponse{
		Deliveries: deliveries,
		Total:      total,
		Limit:      query.Limit,
		Offset:     query.Offset,
		HasMore:    int64(query.Offset+len(deliveries)) < total,
	}, nil
}

// GetPendingDeliveries retrieves failed deliveries that should be retried
func (r *WebhookRepository) GetPendingDeliveries(ctx context.Context, maxAttempts int, limit int) ([]models.WebhookDelivery, error) {
	query := `
		SELECT wd.id, wd.webhook_id, wd.event_id, wd.event_type, wd.url, wd.request_body,
		       wd.response_code, wd.response_body, wd.success, wd.error, wd.attempt_number,
		       wd.duration_ms, wd.created_at
		FROM webhook_deliveries wd
		JOIN webhooks w ON wd.webhook_id = w.id
		WHERE wd.success = false
		  AND wd.attempt_number < $1
		  AND w.active = true
		ORDER BY wd.created_at ASC
		LIMIT $2
	`

	rows, err := r.pool.Query(ctx, query, maxAttempts, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deliveries []models.WebhookDelivery
	for rows.Next() {
		var d models.WebhookDelivery
		var durationMs int64
		err := rows.Scan(
			&d.ID,
			&d.WebhookID,
			&d.EventID,
			&d.Event,
			&d.URL,
			&d.RequestBody,
			&d.ResponseCode,
			&d.ResponseBody,
			&d.Success,
			&d.Error,
			&d.AttemptNumber,
			&durationMs,
			&d.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		d.Duration = time.Duration(durationMs) * time.Millisecond
		deliveries = append(deliveries, d)
	}

	return deliveries, nil
}
