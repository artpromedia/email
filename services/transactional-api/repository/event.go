package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"transactional-api/models"
)

type EventRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

func NewEventRepository(db *pgxpool.Pool, logger *zap.Logger) *EventRepository {
	return &EventRepository{db: db, logger: logger}
}

func (r *EventRepository) Create(ctx context.Context, event *models.EmailEvent) error {
	metadataJSON, _ := json.Marshal(event.Metadata)

	query := `
		INSERT INTO email_events (id, organization_id, message_id, event_type, recipient, timestamp, metadata, user_agent, ip_address, url, bounce_type, bounce_reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	_, err := r.db.Exec(ctx, query,
		event.ID, event.OrganizationID, event.MessageID, event.EventType,
		event.Recipient, event.Timestamp, metadataJSON, event.UserAgent,
		event.IPAddress, event.URL, event.BounceType, event.BounceReason,
	)
	if err != nil {
		return fmt.Errorf("insert event: %w", err)
	}

	return nil
}

func (r *EventRepository) GetByMessageID(ctx context.Context, messageID, orgID uuid.UUID) ([]*models.EmailEvent, error) {
	query := `
		SELECT id, organization_id, message_id, event_type, recipient, timestamp, metadata, user_agent, ip_address, url, bounce_type, bounce_reason
		FROM email_events
		WHERE message_id = $1 AND organization_id = $2
		ORDER BY timestamp ASC
	`

	rows, err := r.db.Query(ctx, query, messageID, orgID)
	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	var events []*models.EmailEvent
	for rows.Next() {
		event := &models.EmailEvent{}
		var metadataJSON []byte

		if err := rows.Scan(
			&event.ID, &event.OrganizationID, &event.MessageID, &event.EventType,
			&event.Recipient, &event.Timestamp, &metadataJSON, &event.UserAgent,
			&event.IPAddress, &event.URL, &event.BounceType, &event.BounceReason,
		); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}

		json.Unmarshal(metadataJSON, &event.Metadata)
		events = append(events, event)
	}

	return events, nil
}

func (r *EventRepository) List(ctx context.Context, orgID uuid.UUID, eventType string, from, to time.Time, limit, offset int) ([]*models.EmailEvent, int64, error) {
	// Build query with optional event type filter
	countQuery := `
		SELECT COUNT(*) FROM email_events
		WHERE organization_id = $1 AND timestamp BETWEEN $2 AND $3
	`
	query := `
		SELECT id, organization_id, message_id, event_type, recipient, timestamp, metadata, user_agent, ip_address, url, bounce_type, bounce_reason
		FROM email_events
		WHERE organization_id = $1 AND timestamp BETWEEN $2 AND $3
	`
	args := []interface{}{orgID, from, to}

	if eventType != "" {
		countQuery += ` AND event_type = $4`
		query += ` AND event_type = $4`
		args = append(args, eventType)
	}

	query += ` ORDER BY timestamp DESC LIMIT $` + fmt.Sprintf("%d", len(args)+1) + ` OFFSET $` + fmt.Sprintf("%d", len(args)+2)

	var total int64
	if eventType != "" {
		err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
		if err != nil {
			return nil, 0, fmt.Errorf("count events: %w", err)
		}
	} else {
		err := r.db.QueryRow(ctx, countQuery, orgID, from, to).Scan(&total)
		if err != nil {
			return nil, 0, fmt.Errorf("count events: %w", err)
		}
	}

	args = append(args, limit, offset)
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	var events []*models.EmailEvent
	for rows.Next() {
		event := &models.EmailEvent{}
		var metadataJSON []byte

		if err := rows.Scan(
			&event.ID, &event.OrganizationID, &event.MessageID, &event.EventType,
			&event.Recipient, &event.Timestamp, &metadataJSON, &event.UserAgent,
			&event.IPAddress, &event.URL, &event.BounceType, &event.BounceReason,
		); err != nil {
			return nil, 0, fmt.Errorf("scan event: %w", err)
		}

		json.Unmarshal(metadataJSON, &event.Metadata)
		events = append(events, event)
	}

	return events, total, nil
}

func (r *EventRepository) GetStats(ctx context.Context, orgID uuid.UUID, from, to time.Time) (map[models.EventType]int64, error) {
	query := `
		SELECT event_type, COUNT(*) as count
		FROM email_events
		WHERE organization_id = $1 AND timestamp BETWEEN $2 AND $3
		GROUP BY event_type
	`

	rows, err := r.db.Query(ctx, query, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query event stats: %w", err)
	}
	defer rows.Close()

	stats := make(map[models.EventType]int64)
	for rows.Next() {
		var eventType models.EventType
		var count int64
		if err := rows.Scan(&eventType, &count); err != nil {
			return nil, fmt.Errorf("scan stat: %w", err)
		}
		stats[eventType] = count
	}

	return stats, nil
}

func (r *EventRepository) GetTimeSeries(ctx context.Context, orgID uuid.UUID, eventType models.EventType, from, to time.Time, interval string) ([]models.TimeSeriesData, error) {
	// interval can be "hour", "day", "week", "month"
	var truncFunc string
	switch interval {
	case "hour":
		truncFunc = "hour"
	case "day":
		truncFunc = "day"
	case "week":
		truncFunc = "week"
	case "month":
		truncFunc = "month"
	default:
		truncFunc = "day"
	}

	query := fmt.Sprintf(`
		SELECT date_trunc('%s', timestamp) as ts, COUNT(*) as count
		FROM email_events
		WHERE organization_id = $1 AND event_type = $2 AND timestamp BETWEEN $3 AND $4
		GROUP BY ts
		ORDER BY ts ASC
	`, truncFunc)

	rows, err := r.db.Query(ctx, query, orgID, eventType, from, to)
	if err != nil {
		return nil, fmt.Errorf("query time series: %w", err)
	}
	defer rows.Close()

	var data []models.TimeSeriesData
	for rows.Next() {
		var ts time.Time
		var count int64
		if err := rows.Scan(&ts, &count); err != nil {
			return nil, fmt.Errorf("scan time series: %w", err)
		}
		data = append(data, models.TimeSeriesData{Timestamp: ts, Value: count})
	}

	return data, nil
}

func (r *EventRepository) GetBounceStats(ctx context.Context, orgID uuid.UUID, from, to time.Time) ([]models.BounceReason, error) {
	query := `
		SELECT COALESCE(bounce_reason, 'unknown') as reason, COUNT(*) as count
		FROM email_events
		WHERE organization_id = $1 AND event_type = 'bounced' AND timestamp BETWEEN $2 AND $3
		GROUP BY reason
		ORDER BY count DESC
		LIMIT 10
	`

	rows, err := r.db.Query(ctx, query, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query bounce stats: %w", err)
	}
	defer rows.Close()

	var reasons []models.BounceReason
	for rows.Next() {
		var reason models.BounceReason
		if err := rows.Scan(&reason.Reason, &reason.Count); err != nil {
			return nil, fmt.Errorf("scan bounce reason: %w", err)
		}
		reasons = append(reasons, reason)
	}

	return reasons, nil
}

func (r *EventRepository) GetTopLinks(ctx context.Context, orgID uuid.UUID, from, to time.Time, limit int) ([]models.LinkStats, error) {
	query := `
		SELECT url, COUNT(*) as clicks
		FROM email_events
		WHERE organization_id = $1 AND event_type = 'clicked' AND timestamp BETWEEN $2 AND $3 AND url IS NOT NULL AND url != ''
		GROUP BY url
		ORDER BY clicks DESC
		LIMIT $4
	`

	rows, err := r.db.Query(ctx, query, orgID, from, to, limit)
	if err != nil {
		return nil, fmt.Errorf("query top links: %w", err)
	}
	defer rows.Close()

	var links []models.LinkStats
	for rows.Next() {
		var link models.LinkStats
		if err := rows.Scan(&link.URL, &link.Clicks); err != nil {
			return nil, fmt.Errorf("scan link: %w", err)
		}
		links = append(links, link)
	}

	return links, nil
}

func (r *EventRepository) GetUniqueCount(ctx context.Context, orgID uuid.UUID, eventType models.EventType, from, to time.Time) (int64, error) {
	query := `
		SELECT COUNT(DISTINCT message_id)
		FROM email_events
		WHERE organization_id = $1 AND event_type = $2 AND timestamp BETWEEN $3 AND $4
	`

	var count int64
	if err := r.db.QueryRow(ctx, query, orgID, eventType, from, to).Scan(&count); err != nil {
		return 0, fmt.Errorf("count unique: %w", err)
	}

	return count, nil
}
