package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"transactional-api/models"
)

type EmailRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

func NewEmailRepository(db *pgxpool.Pool, logger *zap.Logger) *EmailRepository {
	return &EmailRepository{db: db, logger: logger}
}

type TransactionalEmail struct {
	ID             uuid.UUID
	OrganizationID uuid.UUID
	MessageID      string
	FromEmail      string
	FromName       string
	ToEmails       []string
	CCEmails       []string
	BCCEmails      []string
	Subject        string
	TextBody       string
	HTMLBody       string
	Headers        map[string]string
	Tags           []string
	Metadata       map[string]string
	TemplateID     *uuid.UUID
	IPPool         string
	Status         string
	TrackOpens     bool
	TrackClicks    bool
	ScheduledAt    *time.Time
	SentAt         *time.Time
	CreatedAt      time.Time
}

func (r *EmailRepository) Create(ctx context.Context, email *TransactionalEmail) error {
	headersJSON, _ := json.Marshal(email.Headers)
	metadataJSON, _ := json.Marshal(email.Metadata)

	query := `
		INSERT INTO transactional_emails (
			id, organization_id, message_id, from_email, from_name, to_emails, cc_emails, bcc_emails,
			subject, text_body, html_body, headers, tags, metadata, template_id, ip_pool,
			status, track_opens, track_clicks, scheduled_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
	`

	_, err := r.db.Exec(ctx, query,
		email.ID, email.OrganizationID, email.MessageID, email.FromEmail, email.FromName,
		email.ToEmails, email.CCEmails, email.BCCEmails, email.Subject, email.TextBody, email.HTMLBody,
		headersJSON, email.Tags, metadataJSON, email.TemplateID, email.IPPool,
		email.Status, email.TrackOpens, email.TrackClicks, email.ScheduledAt, email.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert transactional email: %w", err)
	}

	return nil
}

func (r *EmailRepository) GetByID(ctx context.Context, id, orgID uuid.UUID) (*TransactionalEmail, error) {
	query := `
		SELECT id, organization_id, message_id, from_email, from_name, to_emails, cc_emails, bcc_emails,
			subject, text_body, html_body, headers, tags, metadata, template_id, ip_pool,
			status, track_opens, track_clicks, scheduled_at, sent_at, created_at
		FROM transactional_emails
		WHERE id = $1 AND organization_id = $2
	`

	email := &TransactionalEmail{}
	var headersJSON, metadataJSON []byte

	err := r.db.QueryRow(ctx, query, id, orgID).Scan(
		&email.ID, &email.OrganizationID, &email.MessageID, &email.FromEmail, &email.FromName,
		&email.ToEmails, &email.CCEmails, &email.BCCEmails, &email.Subject, &email.TextBody, &email.HTMLBody,
		&headersJSON, &email.Tags, &metadataJSON, &email.TemplateID, &email.IPPool,
		&email.Status, &email.TrackOpens, &email.TrackClicks, &email.ScheduledAt, &email.SentAt, &email.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("email not found")
	}
	if err != nil {
		return nil, fmt.Errorf("query email: %w", err)
	}

	json.Unmarshal(headersJSON, &email.Headers)
	json.Unmarshal(metadataJSON, &email.Metadata)

	return email, nil
}

func (r *EmailRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string, sentAt *time.Time) error {
	query := `UPDATE transactional_emails SET status = $1, sent_at = $2, updated_at = $3 WHERE id = $4`
	_, err := r.db.Exec(ctx, query, status, sentAt, time.Now(), id)
	return err
}

func (r *EmailRepository) GetStats(ctx context.Context, orgID uuid.UUID, from, to time.Time) (*models.AnalyticsOverview, error) {
	query := `
		SELECT
			COUNT(*) as total_sent,
			COUNT(*) FILTER (WHERE status = 'delivered') as total_delivered,
			COUNT(*) FILTER (WHERE status = 'bounced') as total_bounced
		FROM transactional_emails
		WHERE organization_id = $1 AND created_at BETWEEN $2 AND $3
	`

	stats := &models.AnalyticsOverview{}
	err := r.db.QueryRow(ctx, query, orgID, from, to).Scan(
		&stats.TotalSent, &stats.TotalDelivered, &stats.TotalBounced,
	)
	if err != nil {
		return nil, fmt.Errorf("query stats: %w", err)
	}

	if stats.TotalSent > 0 {
		stats.DeliveryRate = float64(stats.TotalDelivered) / float64(stats.TotalSent) * 100
		stats.BounceRate = float64(stats.TotalBounced) / float64(stats.TotalSent) * 100
	}

	return stats, nil
}

func (r *EmailRepository) GetScheduledEmails(ctx context.Context, before time.Time, limit int) ([]*TransactionalEmail, error) {
	query := `
		SELECT id, organization_id, message_id, from_email, from_name, to_emails, cc_emails, bcc_emails,
			subject, text_body, html_body, headers, tags, metadata, template_id, ip_pool,
			status, track_opens, track_clicks, scheduled_at, sent_at, created_at
		FROM transactional_emails
		WHERE status = 'scheduled' AND scheduled_at <= $1
		ORDER BY scheduled_at ASC
		LIMIT $2
	`

	rows, err := r.db.Query(ctx, query, before, limit)
	if err != nil {
		return nil, fmt.Errorf("query scheduled emails: %w", err)
	}
	defer rows.Close()

	var emails []*TransactionalEmail
	for rows.Next() {
		email := &TransactionalEmail{}
		var headersJSON, metadataJSON []byte

		if err := rows.Scan(
			&email.ID, &email.OrganizationID, &email.MessageID, &email.FromEmail, &email.FromName,
			&email.ToEmails, &email.CCEmails, &email.BCCEmails, &email.Subject, &email.TextBody, &email.HTMLBody,
			&headersJSON, &email.Tags, &metadataJSON, &email.TemplateID, &email.IPPool,
			&email.Status, &email.TrackOpens, &email.TrackClicks, &email.ScheduledAt, &email.SentAt, &email.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan email: %w", err)
		}

		json.Unmarshal(headersJSON, &email.Headers)
		json.Unmarshal(metadataJSON, &email.Metadata)
		emails = append(emails, email)
	}

	return emails, nil
}
