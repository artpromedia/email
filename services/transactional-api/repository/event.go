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
	ErrEventNotFound = errors.New("event not found")
)

// EventRepository handles database operations for email events
type EventRepository struct {
	pool *pgxpool.Pool
}

// NewEventRepository creates a new EventRepository
func NewEventRepository(pool *pgxpool.Pool) *EventRepository {
	return &EventRepository{pool: pool}
}

// Create creates a new email event
func (r *EventRepository) Create(ctx context.Context, event *models.EmailEvent) error {
	query := `
		INSERT INTO email_events (
			id, message_id, domain_id, event_type, recipient, timestamp,
			metadata, smtp_response, bounce_type, bounce_code, user_agent,
			ip_address, url, geo, device, categories, custom_args
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	`

	_, err := r.pool.Exec(ctx, query,
		event.ID,
		event.MessageID,
		event.DomainID,
		event.EventType,
		event.Recipient,
		event.Timestamp,
		event.Metadata,
		event.SMTPResponse,
		event.BounceType,
		event.BounceCode,
		event.UserAgent,
		event.IPAddress,
		event.URL,
		event.Geo,
		event.Device,
		event.Categories,
		event.CustomArgs,
	)

	return err
}

// GetByID retrieves an event by ID
func (r *EventRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.EmailEvent, error) {
	query := `
		SELECT id, message_id, domain_id, event_type, recipient, timestamp,
		       metadata, smtp_response, bounce_type, bounce_code, user_agent,
		       ip_address, url, geo, device, webhook_sent, webhook_sent_at,
		       categories, custom_args, created_at
		FROM email_events
		WHERE id = $1
	`

	var e models.EmailEvent
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&e.ID,
		&e.MessageID,
		&e.DomainID,
		&e.EventType,
		&e.Recipient,
		&e.Timestamp,
		&e.Metadata,
		&e.SMTPResponse,
		&e.BounceType,
		&e.BounceCode,
		&e.UserAgent,
		&e.IPAddress,
		&e.URL,
		&e.Geo,
		&e.Device,
		&e.WebhookSent,
		&e.WebhookSentAt,
		&e.Categories,
		&e.CustomArgs,
		&e.CreatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}

	return &e, nil
}

// List retrieves events with filtering and pagination
func (r *EventRepository) List(ctx context.Context, query *models.EventQuery) (*models.EventListResponse, error) {
	baseQuery := `
		SELECT id, message_id, domain_id, event_type, recipient, timestamp,
		       metadata, smtp_response, bounce_type, bounce_code, user_agent,
		       ip_address, url, geo, device, webhook_sent, webhook_sent_at,
		       categories, custom_args, created_at
		FROM email_events
		WHERE domain_id = $1
	`
	countQuery := `SELECT COUNT(*) FROM email_events WHERE domain_id = $1`

	args := []any{query.DomainID}
	argIdx := 2

	if query.MessageID != nil {
		baseQuery += " AND message_id = $" + itoa(argIdx)
		countQuery += " AND message_id = $" + itoa(argIdx)
		args = append(args, *query.MessageID)
		argIdx++
	}

	if query.EventType != nil {
		baseQuery += " AND event_type = $" + itoa(argIdx)
		countQuery += " AND event_type = $" + itoa(argIdx)
		args = append(args, *query.EventType)
		argIdx++
	}

	if query.Recipient != "" {
		baseQuery += " AND recipient = $" + itoa(argIdx)
		countQuery += " AND recipient = $" + itoa(argIdx)
		args = append(args, query.Recipient)
		argIdx++
	}

	if len(query.Categories) > 0 {
		baseQuery += " AND categories && $" + itoa(argIdx)
		countQuery += " AND categories && $" + itoa(argIdx)
		args = append(args, query.Categories)
		argIdx++
	}

	if query.StartDate != nil {
		baseQuery += " AND timestamp >= $" + itoa(argIdx)
		countQuery += " AND timestamp >= $" + itoa(argIdx)
		args = append(args, *query.StartDate)
		argIdx++
	}

	if query.EndDate != nil {
		baseQuery += " AND timestamp <= $" + itoa(argIdx)
		countQuery += " AND timestamp <= $" + itoa(argIdx)
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
	baseQuery += " ORDER BY timestamp DESC LIMIT $" + itoa(argIdx) + " OFFSET $" + itoa(argIdx+1)
	args = append(args, query.Limit, query.Offset)

	rows, err := r.pool.Query(ctx, baseQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.EmailEvent
	for rows.Next() {
		var e models.EmailEvent
		err := rows.Scan(
			&e.ID,
			&e.MessageID,
			&e.DomainID,
			&e.EventType,
			&e.Recipient,
			&e.Timestamp,
			&e.Metadata,
			&e.SMTPResponse,
			&e.BounceType,
			&e.BounceCode,
			&e.UserAgent,
			&e.IPAddress,
			&e.URL,
			&e.Geo,
			&e.Device,
			&e.WebhookSent,
			&e.WebhookSentAt,
			&e.Categories,
			&e.CustomArgs,
			&e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return &models.EventListResponse{
		Events:  events,
		Total:   total,
		Limit:   query.Limit,
		Offset:  query.Offset,
		HasMore: int64(query.Offset+len(events)) < total,
	}, nil
}

// MarkWebhookSent marks an event as having its webhook sent
func (r *EventRepository) MarkWebhookSent(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE email_events
		SET webhook_sent = true, webhook_sent_at = NOW()
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// GetUnsentWebhookEvents retrieves events that haven't had their webhooks sent
func (r *EventRepository) GetUnsentWebhookEvents(ctx context.Context, limit int) ([]models.EmailEvent, error) {
	query := `
		SELECT id, message_id, domain_id, event_type, recipient, timestamp,
		       metadata, smtp_response, bounce_type, bounce_code, user_agent,
		       ip_address, url, geo, device, webhook_sent, webhook_sent_at,
		       categories, custom_args, created_at
		FROM email_events
		WHERE webhook_sent = false
		ORDER BY timestamp ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`

	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.EmailEvent
	for rows.Next() {
		var e models.EmailEvent
		err := rows.Scan(
			&e.ID,
			&e.MessageID,
			&e.DomainID,
			&e.EventType,
			&e.Recipient,
			&e.Timestamp,
			&e.Metadata,
			&e.SMTPResponse,
			&e.BounceType,
			&e.BounceCode,
			&e.UserAgent,
			&e.IPAddress,
			&e.URL,
			&e.Geo,
			&e.Device,
			&e.WebhookSent,
			&e.WebhookSentAt,
			&e.Categories,
			&e.CustomArgs,
			&e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return events, nil
}

// GetEventsByMessage retrieves all events for a specific message
func (r *EventRepository) GetEventsByMessage(ctx context.Context, messageID uuid.UUID) ([]models.EmailEvent, error) {
	query := `
		SELECT id, message_id, domain_id, event_type, recipient, timestamp,
		       metadata, smtp_response, bounce_type, bounce_code, user_agent,
		       ip_address, url, geo, device, webhook_sent, webhook_sent_at,
		       categories, custom_args, created_at
		FROM email_events
		WHERE message_id = $1
		ORDER BY timestamp ASC
	`

	rows, err := r.pool.Query(ctx, query, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.EmailEvent
	for rows.Next() {
		var e models.EmailEvent
		err := rows.Scan(
			&e.ID,
			&e.MessageID,
			&e.DomainID,
			&e.EventType,
			&e.Recipient,
			&e.Timestamp,
			&e.Metadata,
			&e.SMTPResponse,
			&e.BounceType,
			&e.BounceCode,
			&e.UserAgent,
			&e.IPAddress,
			&e.URL,
			&e.Geo,
			&e.Device,
			&e.WebhookSent,
			&e.WebhookSentAt,
			&e.Categories,
			&e.CustomArgs,
			&e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return events, nil
}

// CountByType counts events by type within a time range
func (r *EventRepository) CountByType(ctx context.Context, domainID uuid.UUID, eventType models.EventType, startDate, endDate interface{}) (int64, error) {
	query := `
		SELECT COUNT(*)
		FROM email_events
		WHERE domain_id = $1 AND event_type = $2 AND timestamp >= $3 AND timestamp <= $4
	`

	var count int64
	err := r.pool.QueryRow(ctx, query, domainID, eventType, startDate, endDate).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

// GetAggregatedCounts retrieves aggregated event counts by type
func (r *EventRepository) GetAggregatedCounts(ctx context.Context, domainID uuid.UUID, startDate, endDate interface{}) ([]models.EventAggregation, error) {
	query := `
		SELECT event_type, COUNT(*) as count
		FROM email_events
		WHERE domain_id = $1 AND timestamp >= $2 AND timestamp <= $3
		GROUP BY event_type
	`

	rows, err := r.pool.Query(ctx, query, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var aggregations []models.EventAggregation
	for rows.Next() {
		var a models.EventAggregation
		err := rows.Scan(&a.EventType, &a.Count)
		if err != nil {
			return nil, err
		}
		aggregations = append(aggregations, a)
	}

	return aggregations, nil
}

// DeleteOldEvents removes events older than the retention period
func (r *EventRepository) DeleteOldEvents(ctx context.Context, retentionDays int) (int64, error) {
	query := `
		DELETE FROM email_events
		WHERE created_at < NOW() - INTERVAL '1 day' * $1
	`

	result, err := r.pool.Exec(ctx, query, retentionDays)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected(), nil
}
