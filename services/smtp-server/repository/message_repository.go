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

	"github.com/oonrumail/smtp-server/domain"
)

// Repository errors
var (
	ErrQuotaExceeded = errors.New("mailbox quota exceeded")
)

// QuotaStatus represents the quota status for a mailbox
type QuotaStatus struct {
	MailboxID    string
	Email        string
	UsedBytes    int64
	QuotaBytes   int64
	UsagePercent float64
}

// QuotaThreshold represents a quota warning threshold
type QuotaThreshold struct {
	Percent     float64
	Description string
}

// QuotaThresholds defines the warning thresholds for quota notifications
var QuotaThresholds = []QuotaThreshold{
	{Percent: 80, Description: "80% usage"},
	{Percent: 90, Description: "90% usage"},
	{Percent: 95, Description: "95% usage - critical"},
}

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

// GetMailboxByEmail returns a mailbox by email address
func (r *MessageRepository) GetMailboxByEmail(ctx context.Context, email string) (*domain.Mailbox, error) {
	query := `
		SELECT
			id, user_id, domain_id, organization_id, email, local_part, domain,
			display_name, status, quota_bytes, used_bytes, is_active,
			created_at, updated_at
		FROM mailboxes
		WHERE email = $1 AND is_active = true
	`

	var mb domain.Mailbox
	err := r.db.QueryRow(ctx, query, email).Scan(
		&mb.ID, &mb.UserID, &mb.DomainID, &mb.OrganizationID, &mb.Email, &mb.LocalPart, &mb.Domain,
		&mb.DisplayName, &mb.Status, &mb.QuotaBytes, &mb.UsedBytes, &mb.IsActive,
		&mb.CreatedAt, &mb.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query mailbox: %w", err)
	}

	return &mb, nil
}

// GetAliasBySource returns an alias by source email
func (r *MessageRepository) GetAliasBySource(ctx context.Context, email string) (*domain.Alias, error) {
	query := `
		SELECT id, domain_id, organization_id, source_email, target_email, is_active, created_at
		FROM aliases
		WHERE source_email = $1 AND is_active = true
		LIMIT 1
	`

	var alias domain.Alias
	err := r.db.QueryRow(ctx, query, email).Scan(
		&alias.ID, &alias.DomainID, &alias.OrganizationID, &alias.SourceEmail,
		&alias.TargetEmail, &alias.IsActive, &alias.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query alias: %w", err)
	}

	return &alias, nil
}

// GetDistributionListByEmail returns a distribution list by email
func (r *MessageRepository) GetDistributionListByEmail(ctx context.Context, email string) (*domain.DistributionList, error) {
	query := `
		SELECT id, domain_id, organization_id, email, name, description, members, allow_external, is_active, created_at
		FROM distribution_lists
		WHERE email = $1 AND is_active = true
	`

	var dl domain.DistributionList
	var membersJSON []byte
	err := r.db.QueryRow(ctx, query, email).Scan(
		&dl.ID, &dl.DomainID, &dl.OrganizationID, &dl.Email, &dl.Name, &dl.Description,
		&membersJSON, &dl.AllowExternal, &dl.IsActive, &dl.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query distribution list: %w", err)
	}

	if err := json.Unmarshal(membersJSON, &dl.Members); err != nil {
		return nil, fmt.Errorf("unmarshal members: %w", err)
	}

	return &dl, nil
}

// UpdateMailboxUsage updates the storage used by a mailbox
func (r *MessageRepository) UpdateMailboxUsage(ctx context.Context, mailboxID string, additionalBytes int64) error {
	query := `
		UPDATE mailboxes
		SET used_bytes = used_bytes + $2, updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query, mailboxID, additionalBytes)
	if err != nil {
		return fmt.Errorf("update mailbox usage: %w", err)
	}

	return nil
}

// AtomicQuotaCheckAndUpdate performs an atomic quota check and update.
// Returns:
// - newUsedBytes: the new total used bytes after the update
// - quotaBytes: the mailbox quota limit (0 = unlimited)
// - error: ErrQuotaExceeded if quota would be exceeded, or other error
func (r *MessageRepository) AtomicQuotaCheckAndUpdate(ctx context.Context, mailboxID string, additionalBytes int64) (newUsedBytes, quotaBytes int64, err error) {
	// Use a single atomic UPDATE with RETURNING to prevent race conditions
	// The WHERE clause ensures quota is not exceeded
	query := `
		UPDATE mailboxes
		SET used_bytes = used_bytes + $2, updated_at = NOW()
		WHERE id = $1
			AND (quota_bytes = 0 OR used_bytes + $2 <= quota_bytes)
		RETURNING used_bytes, quota_bytes
	`

	err = r.db.QueryRow(ctx, query, mailboxID, additionalBytes).Scan(&newUsedBytes, &quotaBytes)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Either mailbox doesn't exist or quota would be exceeded
			// Fetch current values to determine which
			var currentUsed, quota int64
			fetchQuery := `SELECT used_bytes, quota_bytes FROM mailboxes WHERE id = $1`
			fetchErr := r.db.QueryRow(ctx, fetchQuery, mailboxID).Scan(&currentUsed, &quota)
			if fetchErr != nil {
				if errors.Is(fetchErr, pgx.ErrNoRows) {
					return 0, 0, fmt.Errorf("mailbox not found: %s", mailboxID)
				}
				return 0, 0, fmt.Errorf("fetch mailbox: %w", fetchErr)
			}
			// Mailbox exists, so quota was exceeded
			return currentUsed, quota, ErrQuotaExceeded
		}
		return 0, 0, fmt.Errorf("update mailbox usage: %w", err)
	}

	return newUsedBytes, quotaBytes, nil
}

// GetMailboxQuotaStatus returns the current quota status for a mailbox.
func (r *MessageRepository) GetMailboxQuotaStatus(ctx context.Context, mailboxID string) (*QuotaStatus, error) {
	query := `
		SELECT id, email_address, used_bytes, quota_bytes,
		       CASE WHEN quota_bytes > 0 THEN (used_bytes::float / quota_bytes::float * 100) ELSE 0 END as usage_percent
		FROM mailboxes
		WHERE id = $1
	`

	var status QuotaStatus
	err := r.db.QueryRow(ctx, query, mailboxID).Scan(
		&status.MailboxID, &status.Email, &status.UsedBytes, &status.QuotaBytes, &status.UsagePercent,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("mailbox not found: %s", mailboxID)
		}
		return nil, fmt.Errorf("get quota status: %w", err)
	}

	return &status, nil
}

// GetMailboxesNearQuota returns mailboxes that have exceeded the given usage percentage threshold.
func (r *MessageRepository) GetMailboxesNearQuota(ctx context.Context, thresholdPercent float64) ([]*QuotaStatus, error) {
	query := `
		SELECT id, email_address, used_bytes, quota_bytes,
		       (used_bytes::float / quota_bytes::float * 100) as usage_percent
		FROM mailboxes
		WHERE quota_bytes > 0
			AND (used_bytes::float / quota_bytes::float * 100) >= $1
		ORDER BY usage_percent DESC
	`

	rows, err := r.db.Query(ctx, query, thresholdPercent)
	if err != nil {
		return nil, fmt.Errorf("query mailboxes near quota: %w", err)
	}
	defer rows.Close()

	var statuses []*QuotaStatus
	for rows.Next() {
		var status QuotaStatus
		if err := rows.Scan(&status.MailboxID, &status.Email, &status.UsedBytes, &status.QuotaBytes, &status.UsagePercent); err != nil {
			return nil, fmt.Errorf("scan quota status: %w", err)
		}
		statuses = append(statuses, &status)
	}

	return statuses, rows.Err()
}

// RecordMailboxMessage records a message in the mailbox messages table
func (r *MessageRepository) RecordMailboxMessage(ctx context.Context, mailboxID string, msg *domain.Message, storagePath string, size int64) error {
	query := `
		INSERT INTO mailbox_messages (
			id, mailbox_id, message_id, folder, storage_path,
			from_address, subject, size, received_at, is_read, is_flagged, created_at
		) VALUES (
			gen_random_uuid(), $1, $2, 'INBOX', $3,
			$4, $5, $6, NOW(), false, false, NOW()
		)
	`

	_, err := r.db.Exec(ctx, query,
		mailboxID, msg.ID, storagePath,
		msg.FromAddress, msg.Subject, size,
	)
	if err != nil {
		return fmt.Errorf("record mailbox message: %w", err)
	}

	return nil
}

// GetMailboxOwnerEmail returns the email address of the user who owns the mailbox.
func (r *MessageRepository) GetMailboxOwnerEmail(ctx context.Context, mailboxID string) (string, error) {
	query := `
		SELECT u.email
		FROM mailboxes m
		JOIN users u ON m.user_id = u.id
		WHERE m.id = $1
	`

	var email string
	err := r.db.QueryRow(ctx, query, mailboxID).Scan(&email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", fmt.Errorf("mailbox owner not found: %s", mailboxID)
		}
		return "", fmt.Errorf("get mailbox owner: %w", err)
	}

	return email, nil
}
