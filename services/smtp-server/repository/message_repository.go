package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"smtp-server/domain"
)

// MessageRepository handles message queue database operations
type MessageRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewMessageRepository creates a new message repository
func NewMessageRepository(db *pgxpool.Pool, logger *zap.Logger) *MessageRepository {
	return &MessageRepository{
		db:     db,
		logger: logger,
	}
}

// CreateMessage inserts a new message into the queue
func (r *MessageRepository) CreateMessage(ctx context.Context, msg *domain.Message) error {
	recipientsJSON, err := json.Marshal(msg.Recipients)
	if err != nil {
		return fmt.Errorf("marshal recipients: %w", err)
	}

	headersJSON, err := json.Marshal(msg.Headers)
	if err != nil {
		return fmt.Errorf("marshal headers: %w", err)
	}

	query := `
		INSERT INTO message_queue (
			id, organization_id, domain_id, from_address, recipients,
			subject, headers, body_size, raw_message_path, status,
			priority, retry_count, max_retries, next_retry_at,
			created_at, scheduled_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14,
			$15, $16
		)
	`

	_, err = r.db.Exec(ctx, query,
		msg.ID, msg.OrganizationID, msg.DomainID, msg.FromAddress, recipientsJSON,
		msg.Subject, headersJSON, msg.BodySize, msg.RawMessagePath, msg.Status,
		msg.Priority, msg.RetryCount, msg.MaxRetries, msg.NextRetryAt,
		msg.CreatedAt, msg.ScheduledAt,
	)
	if err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	return nil
}

// UpdateMessageStatus updates the status of a message
func (r *MessageRepository) UpdateMessageStatus(ctx context.Context, messageID string, status domain.MessageStatus) error {
	var deliveredAt, failedAt *time.Time
	now := time.Now()

	if status == domain.StatusDelivered {
		deliveredAt = &now
	} else if status == domain.StatusFailed || status == domain.StatusBounced {
		failedAt = &now
	}

	query := `
		UPDATE message_queue
		SET status = $2, delivered_at = COALESCE($3, delivered_at), failed_at = COALESCE($4, failed_at)
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query, messageID, status, deliveredAt, failedAt)
	if err != nil {
		return fmt.Errorf("update message status: %w", err)
	}

	return nil
}

// UpdateMessageRetry updates retry information for a message
func (r *MessageRepository) UpdateMessageRetry(ctx context.Context, messageID string, nextRetry time.Time, lastError string) error {
	query := `
		UPDATE message_queue
		SET retry_count = retry_count + 1,
			next_retry_at = $2,
			last_error = $3,
			status = $4
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query, messageID, nextRetry, lastError, domain.StatusPending)
	if err != nil {
		return fmt.Errorf("update message retry: %w", err)
	}

	return nil
}

// GetPendingMessages returns messages ready for delivery
func (r *MessageRepository) GetPendingMessages(ctx context.Context, limit int) ([]*domain.Message, error) {
	query := `
		SELECT 
			id, organization_id, domain_id, from_address, recipients,
			subject, headers, body_size, raw_message_path, status,
			priority, retry_count, max_retries, next_retry_at, last_error,
			created_at, scheduled_at, delivered_at, failed_at
		FROM message_queue
		WHERE status = $1
		  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
		  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
		ORDER BY priority DESC, created_at ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
	`

	rows, err := r.db.Query(ctx, query, domain.StatusPending, limit)
	if err != nil {
		return nil, fmt.Errorf("query pending messages: %w", err)
	}
	defer rows.Close()

	var messages []*domain.Message
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// GetPendingMessagesByDomain returns pending messages for a specific domain
func (r *MessageRepository) GetPendingMessagesByDomain(ctx context.Context, domainID string, limit int) ([]*domain.Message, error) {
	query := `
		SELECT 
			id, organization_id, domain_id, from_address, recipients,
			subject, headers, body_size, raw_message_path, status,
			priority, retry_count, max_retries, next_retry_at, last_error,
			created_at, scheduled_at, delivered_at, failed_at
		FROM message_queue
		WHERE domain_id = $1
		  AND status = $2
		  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
		  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
		ORDER BY priority DESC, created_at ASC
		LIMIT $3
		FOR UPDATE SKIP LOCKED
	`

	rows, err := r.db.Query(ctx, query, domainID, domain.StatusPending, limit)
	if err != nil {
		return nil, fmt.Errorf("query pending messages by domain: %w", err)
	}
	defer rows.Close()

	var messages []*domain.Message
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// GetMessage returns a message by ID
func (r *MessageRepository) GetMessage(ctx context.Context, messageID string) (*domain.Message, error) {
	query := `
		SELECT 
			id, organization_id, domain_id, from_address, recipients,
			subject, headers, body_size, raw_message_path, status,
			priority, retry_count, max_retries, next_retry_at, last_error,
			created_at, scheduled_at, delivered_at, failed_at
		FROM message_queue
		WHERE id = $1
	`

	row := r.db.QueryRow(ctx, query, messageID)
	msg, err := scanMessageRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query message: %w", err)
	}

	return msg, nil
}

// DeleteMessage removes a message from the queue
func (r *MessageRepository) DeleteMessage(ctx context.Context, messageID string) error {
	query := `DELETE FROM message_queue WHERE id = $1`
	_, err := r.db.Exec(ctx, query, messageID)
	if err != nil {
		return fmt.Errorf("delete message: %w", err)
	}
	return nil
}

// MarkMessageProcessing marks a message as being processed
func (r *MessageRepository) MarkMessageProcessing(ctx context.Context, messageID string) error {
	query := `UPDATE message_queue SET status = $2 WHERE id = $1`
	_, err := r.db.Exec(ctx, query, messageID, domain.StatusProcessing)
	if err != nil {
		return fmt.Errorf("mark message processing: %w", err)
	}
	return nil
}

// GetQueueStats returns queue statistics by domain
func (r *MessageRepository) GetQueueStats(ctx context.Context) (map[string]*QueueStats, error) {
	query := `
		SELECT 
			domain_id,
			COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
			COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
			COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
			COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
			COUNT(*) FILTER (WHERE status = 'bounced') as bounced_count
		FROM message_queue
		WHERE created_at > NOW() - INTERVAL '24 hours'
		GROUP BY domain_id
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query queue stats: %w", err)
	}
	defer rows.Close()

	stats := make(map[string]*QueueStats)
	for rows.Next() {
		var domainID string
		var s QueueStats
		err := rows.Scan(
			&domainID,
			&s.Pending, &s.Processing, &s.Delivered, &s.Failed, &s.Bounced,
		)
		if err != nil {
			return nil, fmt.Errorf("scan queue stats: %w", err)
		}
		stats[domainID] = &s
	}

	return stats, rows.Err()
}

// QueueStats holds queue statistics
type QueueStats struct {
	Pending    int64
	Processing int64
	Delivered  int64
	Failed     int64
	Bounced    int64
}

// CleanupOldMessages removes old delivered/failed messages
func (r *MessageRepository) CleanupOldMessages(ctx context.Context, olderThan time.Duration) (int64, error) {
	query := `
		DELETE FROM message_queue
		WHERE (status IN ('delivered', 'failed', 'bounced'))
		  AND created_at < $1
	`

	cutoff := time.Now().Add(-olderThan)
	result, err := r.db.Exec(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("cleanup old messages: %w", err)
	}

	return result.RowsAffected(), nil
}

// GetStuckMessages returns messages that have been processing too long
func (r *MessageRepository) GetStuckMessages(ctx context.Context, stuckDuration time.Duration) ([]*domain.Message, error) {
	query := `
		SELECT 
			id, organization_id, domain_id, from_address, recipients,
			subject, headers, body_size, raw_message_path, status,
			priority, retry_count, max_retries, next_retry_at, last_error,
			created_at, scheduled_at, delivered_at, failed_at
		FROM message_queue
		WHERE status = 'processing'
		  AND created_at < $1
	`

	cutoff := time.Now().Add(-stuckDuration)
	rows, err := r.db.Query(ctx, query, cutoff)
	if err != nil {
		return nil, fmt.Errorf("query stuck messages: %w", err)
	}
	defer rows.Close()

	var messages []*domain.Message
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// ResetStuckMessages resets stuck messages back to pending
func (r *MessageRepository) ResetStuckMessages(ctx context.Context, stuckDuration time.Duration) (int64, error) {
	query := `
		UPDATE message_queue
		SET status = 'pending', retry_count = retry_count + 1
		WHERE status = 'processing'
		  AND created_at < $1
	`

	cutoff := time.Now().Add(-stuckDuration)
	result, err := r.db.Exec(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("reset stuck messages: %w", err)
	}

	return result.RowsAffected(), nil
}

func scanMessage(rows pgx.Rows) (*domain.Message, error) {
	var msg domain.Message
	var recipientsJSON, headersJSON []byte
	var lastError *string
	var scheduledAt, deliveredAt, failedAt, nextRetryAt *time.Time

	err := rows.Scan(
		&msg.ID, &msg.OrganizationID, &msg.DomainID, &msg.FromAddress, &recipientsJSON,
		&msg.Subject, &headersJSON, &msg.BodySize, &msg.RawMessagePath, &msg.Status,
		&msg.Priority, &msg.RetryCount, &msg.MaxRetries, &nextRetryAt, &lastError,
		&msg.CreatedAt, &scheduledAt, &deliveredAt, &failedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(recipientsJSON, &msg.Recipients); err != nil {
		return nil, fmt.Errorf("unmarshal recipients: %w", err)
	}
	if err := json.Unmarshal(headersJSON, &msg.Headers); err != nil {
		return nil, fmt.Errorf("unmarshal headers: %w", err)
	}

	if lastError != nil {
		msg.LastError = *lastError
	}
	if scheduledAt != nil {
		msg.ScheduledAt = scheduledAt
	}
	if deliveredAt != nil {
		msg.DeliveredAt = deliveredAt
	}
	if failedAt != nil {
		msg.FailedAt = failedAt
	}
	if nextRetryAt != nil {
		msg.NextRetryAt = nextRetryAt
	}

	return &msg, nil
}

func scanMessageRow(row pgx.Row) (*domain.Message, error) {
	var msg domain.Message
	var recipientsJSON, headersJSON []byte
	var lastError *string
	var scheduledAt, deliveredAt, failedAt, nextRetryAt *time.Time

	err := row.Scan(
		&msg.ID, &msg.OrganizationID, &msg.DomainID, &msg.FromAddress, &recipientsJSON,
		&msg.Subject, &headersJSON, &msg.BodySize, &msg.RawMessagePath, &msg.Status,
		&msg.Priority, &msg.RetryCount, &msg.MaxRetries, &nextRetryAt, &lastError,
		&msg.CreatedAt, &scheduledAt, &deliveredAt, &failedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(recipientsJSON, &msg.Recipients); err != nil {
		return nil, fmt.Errorf("unmarshal recipients: %w", err)
	}
	if err := json.Unmarshal(headersJSON, &msg.Headers); err != nil {
		return nil, fmt.Errorf("unmarshal headers: %w", err)
	}

	if lastError != nil {
		msg.LastError = *lastError
	}
	if scheduledAt != nil {
		msg.ScheduledAt = scheduledAt
	}
	if deliveredAt != nil {
		msg.DeliveredAt = deliveredAt
	}
	if failedAt != nil {
		msg.FailedAt = failedAt
	}
	if nextRetryAt != nil {
		msg.NextRetryAt = nextRetryAt
	}

	return &msg, nil
}
