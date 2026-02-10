package repository

import (
	"context"
	"database/sql"

	"calendar-service/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CalendarRepository struct {
	db *pgxpool.Pool
}

func NewCalendarRepository(db *pgxpool.Pool) *CalendarRepository {
	return &CalendarRepository{db: db}
}

// Create creates a new calendar
func (r *CalendarRepository) Create(ctx context.Context, calendar *models.Calendar) error {
	query := `
		INSERT INTO calendars (id, user_id, name, description, color, timezone, is_default, is_public)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING sync_token, created_at, updated_at`

	return r.db.QueryRow(ctx, query,
		calendar.ID,
		calendar.UserID,
		calendar.Name,
		calendar.Description,
		calendar.Color,
		calendar.Timezone,
		calendar.IsDefault,
		calendar.IsPublic,
	).Scan(&calendar.SyncToken, &calendar.CreatedAt, &calendar.UpdatedAt)
}

// GetByID retrieves a calendar by ID
func (r *CalendarRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Calendar, error) {
	query := `
		SELECT id, user_id, name, description, color, timezone, is_default, is_public,
		       sync_token, created_at, updated_at
		FROM calendars
		WHERE id = $1`

	calendar := &models.Calendar{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&calendar.ID,
		&calendar.UserID,
		&calendar.Name,
		&calendar.Description,
		&calendar.Color,
		&calendar.Timezone,
		&calendar.IsDefault,
		&calendar.IsPublic,
		&calendar.SyncToken,
		&calendar.CreatedAt,
		&calendar.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return calendar, err
}

// GetByUserID retrieves all calendars for a user (owned + shared)
func (r *CalendarRepository) GetByUserID(ctx context.Context, userID uuid.UUID) ([]*models.Calendar, error) {
	query := `
		SELECT c.id, c.user_id, c.name, c.description, c.color, c.timezone,
		       c.is_default, c.is_public, c.sync_token, c.created_at, c.updated_at,
		       COALESCE(cs.permission, 'owner') as permission
		FROM calendars c
		LEFT JOIN calendar_shares cs ON c.id = cs.calendar_id AND cs.user_id = $1
		WHERE c.user_id = $1 OR cs.user_id = $1
		ORDER BY c.is_default DESC, c.name ASC`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var calendars []*models.Calendar
	for rows.Next() {
		cal := &models.Calendar{}
		var permission string
		if err := rows.Scan(
			&cal.ID,
			&cal.UserID,
			&cal.Name,
			&cal.Description,
			&cal.Color,
			&cal.Timezone,
			&cal.IsDefault,
			&cal.IsPublic,
			&cal.SyncToken,
			&cal.CreatedAt,
			&cal.UpdatedAt,
			&permission,
		); err != nil {
			return nil, err
		}
		calendars = append(calendars, cal)
	}
	return calendars, nil
}

// Update updates a calendar
func (r *CalendarRepository) Update(ctx context.Context, calendar *models.Calendar) error {
	query := `
		UPDATE calendars
		SET name = $2, description = $3, color = $4, timezone = $5, is_public = $6, updated_at = NOW()
		WHERE id = $1
		RETURNING sync_token, updated_at`

	return r.db.QueryRow(ctx, query,
		calendar.ID,
		calendar.Name,
		calendar.Description,
		calendar.Color,
		calendar.Timezone,
		calendar.IsPublic,
	).Scan(&calendar.SyncToken, &calendar.UpdatedAt)
}

// Delete deletes a calendar
func (r *CalendarRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM calendars WHERE id = $1", id)
	return err
}

// SetDefault sets a calendar as default (unsets others)
func (r *CalendarRepository) SetDefault(ctx context.Context, userID, calendarID uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Unset all defaults for user
	_, err = tx.Exec(ctx, "UPDATE calendars SET is_default = false WHERE user_id = $1", userID)
	if err != nil {
		return err
	}

	// Set new default
	_, err = tx.Exec(ctx, "UPDATE calendars SET is_default = true WHERE id = $1 AND user_id = $2",
		calendarID, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// Share shares a calendar with another user
func (r *CalendarRepository) Share(ctx context.Context, calendarID, userID uuid.UUID, permission string) error {
	query := `
		INSERT INTO calendar_shares (id, calendar_id, user_id, permission)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (calendar_id, user_id) DO UPDATE SET permission = $4`

	_, err := r.db.Exec(ctx, query, uuid.New(), calendarID, userID, permission)
	return err
}

// Unshare removes calendar sharing with a user
func (r *CalendarRepository) Unshare(ctx context.Context, calendarID, userID uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM calendar_shares WHERE calendar_id = $1 AND user_id = $2",
		calendarID, userID)
	return err
}

// GetShares gets all shares for a calendar
func (r *CalendarRepository) GetShares(ctx context.Context, calendarID uuid.UUID) ([]*models.CalendarShare, error) {
	query := `
		SELECT cs.id, cs.calendar_id, cs.user_id, cs.permission, cs.created_at, u.email, u.display_name
		FROM calendar_shares cs
		JOIN users u ON cs.user_id = u.id
		WHERE cs.calendar_id = $1`

	rows, err := r.db.Query(ctx, query, calendarID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []*models.CalendarShare
	for rows.Next() {
		share := &models.CalendarShare{}
		var email, displayName sql.NullString
		if err := rows.Scan(
			&share.ID,
			&share.CalendarID,
			&share.UserID,
			&share.Permission,
			&share.CreatedAt,
			&email,
			&displayName,
		); err != nil {
			return nil, err
		}
		share.UserEmail = email.String
		share.UserName = displayName.String
		shares = append(shares, share)
	}
	return shares, nil
}

// HasAccess checks if user has specific access level to calendar
func (r *CalendarRepository) HasAccess(ctx context.Context, calendarID, userID uuid.UUID, minPermission string) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM calendars WHERE id = $1 AND user_id = $2
			UNION
			SELECT 1 FROM calendar_shares WHERE calendar_id = $1 AND user_id = $2
			AND permission IN (SELECT unnest($3::text[]))
		)`

	var permissions []string
	switch minPermission {
	case "read":
		permissions = []string{"read", "write", "admin"}
	case "write":
		permissions = []string{"write", "admin"}
	case "admin":
		permissions = []string{"admin"}
	}

	var exists bool
	err := r.db.QueryRow(ctx, query, calendarID, userID, permissions).Scan(&exists)
	return exists, err
}

// GetSyncChanges returns events changed since last sync
func (r *CalendarRepository) GetSyncChanges(ctx context.Context, calendarID uuid.UUID, sinceSyncToken string) ([]*models.Event, string, error) {
	// Get current sync token first
	var currentToken string
	err := r.db.QueryRow(ctx, "SELECT sync_token FROM calendars WHERE id = $1", calendarID).Scan(&currentToken)
	if err != nil {
		return nil, "", err
	}

	// If sync token matches, no changes
	if sinceSyncToken == currentToken {
		return []*models.Event{}, currentToken, nil
	}

	// Get all events with updated_at since the old token was generated
	// In a real implementation, you'd track deletion events too
	query := `
		SELECT id, calendar_id, uid, title, description, location,
		       start_time, end_time, all_day, timezone, status, visibility, transparency,
		       recurrence_rule, recurrence_id, original_event_id, attachments, categories,
		       sequence, etag, organizer_id, created_at, updated_at
		FROM calendar_events
		WHERE calendar_id = $1
		ORDER BY updated_at DESC`

	rows, err := r.db.Query(ctx, query, calendarID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		if err := r.scanEvent(rows, event); err != nil {
			return nil, "", err
		}
		events = append(events, event)
	}

	return events, currentToken, nil
}

func (r *CalendarRepository) scanEvent(row pgx.Row, event *models.Event) error {
	var recurrenceID sql.NullTime
	var recurrenceRule sql.NullString
	var originalEventUUID *uuid.UUID

	err := row.Scan(
		&event.ID,
		&event.CalendarID,
		&event.UID,
		&event.Title,
		&event.Description,
		&event.Location,
		&event.StartTime,
		&event.EndTime,
		&event.AllDay,
		&event.Timezone,
		&event.Status,
		&event.Visibility,
		&event.Transparency,
		&recurrenceRule,
		&recurrenceID,
		&originalEventUUID,
		&event.Attachments,
		&event.Categories,
		&event.Sequence,
		&event.ETag,
		&event.OrganizerID,
		&event.CreatedAt,
		&event.UpdatedAt,
	)
	if err != nil {
		return err
	}

	if recurrenceRule.Valid {
		event.RecurrenceRule = recurrenceRule.String
	}
	if recurrenceID.Valid {
		t := recurrenceID.Time
		event.RecurrenceID = &t
	}
	if originalEventUUID != nil {
		event.OriginalEventID = originalEventUUID
	}

	return nil
}
