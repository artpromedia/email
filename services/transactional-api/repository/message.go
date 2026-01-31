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
	ErrMessageNotFound = errors.New("message not found")
)

// MessageRepository handles database operations for email messages
type MessageRepository struct {
	pool *pgxpool.Pool
}

// NewMessageRepository creates a new MessageRepository
func NewMessageRepository(pool *pgxpool.Pool) *MessageRepository {
	return &MessageRepository{pool: pool}
}

// Create creates a new email message record
func (r *MessageRepository) Create(ctx context.Context, msg *models.Message) error {
	query := `
		INSERT INTO messages (
			id, domain_id, api_key_id, message_id, from_address, to_addresses,
			cc_addresses, bcc_addresses, reply_to, subject, html_content, text_content,
			template_id, categories, custom_args, headers, status, track_opens, track_clicks,
			scheduled_at, queued_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
		)
	`

	_, err := r.pool.Exec(ctx, query,
		msg.ID,
		msg.DomainID,
		msg.APIKeyID,
		msg.ID.String(), // Use UUID as message_id
		msg.From,
		msg.To,
		msg.CC,
		msg.BCC,
		msg.ReplyTo,
		msg.Subject,
		msg.HTML,
		msg.Text,
		msg.TemplateID,
		msg.Categories,
		msg.CustomArgs,
		msg.Headers,
		msg.Status,
		msg.TrackOpens,
		msg.TrackClicks,
		msg.ScheduledAt,
		msg.QueuedAt,
	)

	return err
}

// GetByID retrieves a message by ID
func (r *MessageRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Message, error) {
	query := `
		SELECT id, domain_id, api_key_id, message_id, from_address, to_addresses,
		       cc_addresses, bcc_addresses, reply_to, subject, html_content, text_content,
		       template_id, categories, custom_args, headers, status, track_opens, track_clicks,
		       scheduled_at, queued_at, sent_at, delivered_at, opened_at, clicked_at,
		       bounced_at, bounce_reason, smtp_response, created_at, updated_at
		FROM messages
		WHERE id = $1
	`

	var msg models.Message
	var messageID string
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&msg.ID,
		&msg.DomainID,
		&msg.APIKeyID,
		&messageID,
		&msg.From,
		&msg.To,
		&msg.CC,
		&msg.BCC,
		&msg.ReplyTo,
		&msg.Subject,
		&msg.HTML,
		&msg.Text,
		&msg.TemplateID,
		&msg.Categories,
		&msg.CustomArgs,
		&msg.Headers,
		&msg.Status,
		&msg.TrackOpens,
		&msg.TrackClicks,
		&msg.ScheduledAt,
		&msg.QueuedAt,
		&msg.SentAt,
		&msg.DeliveredAt,
		&msg.OpenedAt,
		&msg.ClickedAt,
		&msg.BouncedAt,
		&msg.BounceReason,
		&msg.SMTPResponse,
		&msg.CreatedAt,
		&msg.UpdatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMessageNotFound
	}
	if err != nil {
		return nil, err
	}

	return &msg, nil
}

// List retrieves messages with filtering and pagination
func (r *MessageRepository) List(ctx context.Context, query *models.MessageQuery) (*models.MessageListResponse, error) {
	baseQuery := `
		SELECT id, domain_id, api_key_id, message_id, from_address, to_addresses,
		       cc_addresses, bcc_addresses, reply_to, subject, html_content, text_content,
		       template_id, categories, custom_args, headers, status, track_opens, track_clicks,
		       scheduled_at, queued_at, sent_at, delivered_at, opened_at, clicked_at,
		       bounced_at, bounce_reason, smtp_response, created_at, updated_at
		FROM messages
		WHERE domain_id = $1
	`
	countQuery := `SELECT COUNT(*) FROM messages WHERE domain_id = $1`

	args := []any{query.DomainID}
	argIdx := 2

	if query.APIKeyID != nil {
		baseQuery += " AND api_key_id = $" + itoa(argIdx)
		countQuery += " AND api_key_id = $" + itoa(argIdx)
		args = append(args, *query.APIKeyID)
		argIdx++
	}

	if query.Status != nil {
		baseQuery += " AND status = $" + itoa(argIdx)
		countQuery += " AND status = $" + itoa(argIdx)
		args = append(args, *query.Status)
		argIdx++
	}

	if query.From != "" {
		baseQuery += " AND from_address ILIKE $" + itoa(argIdx)
		countQuery += " AND from_address ILIKE $" + itoa(argIdx)
		args = append(args, "%"+query.From+"%")
		argIdx++
	}

	if query.To != "" {
		baseQuery += " AND $" + itoa(argIdx) + " = ANY(to_addresses)"
		countQuery += " AND $" + itoa(argIdx) + " = ANY(to_addresses)"
		args = append(args, query.To)
		argIdx++
	}

	if len(query.Categories) > 0 {
		baseQuery += " AND categories && $" + itoa(argIdx)
		countQuery += " AND categories && $" + itoa(argIdx)
		args = append(args, query.Categories)
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

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		var messageID string
		err := rows.Scan(
			&msg.ID,
			&msg.DomainID,
			&msg.APIKeyID,
			&messageID,
			&msg.From,
			&msg.To,
			&msg.CC,
			&msg.BCC,
			&msg.ReplyTo,
			&msg.Subject,
			&msg.HTML,
			&msg.Text,
			&msg.TemplateID,
			&msg.Categories,
			&msg.CustomArgs,
			&msg.Headers,
			&msg.Status,
			&msg.TrackOpens,
			&msg.TrackClicks,
			&msg.ScheduledAt,
			&msg.QueuedAt,
			&msg.SentAt,
			&msg.DeliveredAt,
			&msg.OpenedAt,
			&msg.ClickedAt,
			&msg.BouncedAt,
			&msg.BounceReason,
			&msg.SMTPResponse,
			&msg.CreatedAt,
			&msg.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	return &models.MessageListResponse{
		Messages: messages,
		Total:    total,
		Limit:    query.Limit,
		Offset:   query.Offset,
		HasMore:  int64(query.Offset+len(messages)) < total,
	}, nil
}

// UpdateStatus updates the status of a message
func (r *MessageRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status models.MessageStatus, smtpResponse string) error {
	query := `
		UPDATE messages
		SET status = $2, smtp_response = COALESCE($3, smtp_response)
		WHERE id = $1
	`

	result, err := r.pool.Exec(ctx, query, id, status, smtpResponse)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrMessageNotFound
	}

	return nil
}

// MarkSent marks a message as sent
func (r *MessageRepository) MarkSent(ctx context.Context, id uuid.UUID, smtpResponse string) error {
	query := `
		UPDATE messages
		SET status = 'sent', sent_at = NOW(), smtp_response = $2
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id, smtpResponse)
	return err
}

// MarkDelivered marks a message as delivered
func (r *MessageRepository) MarkDelivered(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE messages
		SET status = 'delivered', delivered_at = NOW()
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// MarkBounced marks a message as bounced
func (r *MessageRepository) MarkBounced(ctx context.Context, id uuid.UUID, bounceReason string) error {
	query := `
		UPDATE messages
		SET status = 'bounced', bounced_at = NOW(), bounce_reason = $2
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id, bounceReason)
	return err
}

// MarkOpened marks a message as opened
func (r *MessageRepository) MarkOpened(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE messages
		SET opened_at = COALESCE(opened_at, NOW())
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// MarkClicked marks a message as clicked
func (r *MessageRepository) MarkClicked(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE messages
		SET clicked_at = COALESCE(clicked_at, NOW())
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// GetScheduledMessages retrieves messages scheduled for delivery
func (r *MessageRepository) GetScheduledMessages(ctx context.Context, limit int) ([]models.Message, error) {
	query := `
		SELECT id, domain_id, api_key_id, message_id, from_address, to_addresses,
		       cc_addresses, bcc_addresses, reply_to, subject, html_content, text_content,
		       template_id, categories, custom_args, headers, status, track_opens, track_clicks,
		       scheduled_at, queued_at, sent_at, delivered_at, opened_at, clicked_at,
		       bounced_at, bounce_reason, smtp_response, created_at, updated_at
		FROM messages
		WHERE status = 'scheduled' AND scheduled_at <= NOW()
		ORDER BY scheduled_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`

	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		var messageID string
		err := rows.Scan(
			&msg.ID,
			&msg.DomainID,
			&msg.APIKeyID,
			&messageID,
			&msg.From,
			&msg.To,
			&msg.CC,
			&msg.BCC,
			&msg.ReplyTo,
			&msg.Subject,
			&msg.HTML,
			&msg.Text,
			&msg.TemplateID,
			&msg.Categories,
			&msg.CustomArgs,
			&msg.Headers,
			&msg.Status,
			&msg.TrackOpens,
			&msg.TrackClicks,
			&msg.ScheduledAt,
			&msg.QueuedAt,
			&msg.SentAt,
			&msg.DeliveredAt,
			&msg.OpenedAt,
			&msg.ClickedAt,
			&msg.BouncedAt,
			&msg.BounceReason,
			&msg.SMTPResponse,
			&msg.CreatedAt,
			&msg.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	return messages, nil
}

// DeleteOldMessages removes messages older than the retention period
func (r *MessageRepository) DeleteOldMessages(ctx context.Context, retentionDays int) (int64, error) {
	query := `
		DELETE FROM messages
		WHERE created_at < NOW() - INTERVAL '1 day' * $1
	`

	result, err := r.pool.Exec(ctx, query, retentionDays)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected(), nil
}

// GetMessageTimeline retrieves the event timeline for a message
func (r *MessageRepository) GetMessageTimeline(ctx context.Context, messageID uuid.UUID) (*models.MessageTimeline, error) {
	msg, err := r.GetByID(ctx, messageID)
	if err != nil {
		return nil, err
	}

	eventsQuery := `
		SELECT event_type, timestamp, smtp_response
		FROM email_events
		WHERE message_id = $1
		ORDER BY timestamp ASC
	`

	rows, err := r.pool.Query(ctx, eventsQuery, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.EventTimelineEntry
	for rows.Next() {
		var e models.EventTimelineEntry
		var smtpResponse *string
		err := rows.Scan(&e.EventType, &e.Timestamp, &smtpResponse)
		if err != nil {
			return nil, err
		}
		if smtpResponse != nil {
			e.Details = *smtpResponse
		}
		events = append(events, e)
	}

	return &models.MessageTimeline{
		MessageID: messageID,
		Status:    msg.Status,
		Events:    events,
	}, nil
}

func itoa(i int) string {
	return string(rune('0' + i))
}
