package repository

import (
	"context"
	"database/sql"
	"time"

	"calendar-service/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EventRepository struct {
	db *pgxpool.Pool
}

func NewEventRepository(db *pgxpool.Pool) *EventRepository {
	return &EventRepository{db: db}
}

// Create creates a new event
func (r *EventRepository) Create(ctx context.Context, event *models.Event) error {
	query := `
		INSERT INTO calendar_events (
			id, calendar_id, uid, title, description, location,
			start_time, end_time, all_day, timezone, status, visibility, transparency,
			recurrence_rule, recurrence_id, original_event_id, attachments, categories,
			organizer_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		RETURNING etag, sequence, created_at, updated_at`

	return r.db.QueryRow(ctx, query,
		event.ID,
		event.CalendarID,
		event.UID,
		event.Title,
		event.Description,
		event.Location,
		event.StartTime,
		event.EndTime,
		event.AllDay,
		event.Timezone,
		event.Status,
		event.Visibility,
		event.Transparency,
		sql.NullString{String: event.RecurrenceRule, Valid: event.RecurrenceRule != ""},
		event.RecurrenceID,
		event.OriginalEventID,
		event.Attachments,
		event.Categories,
		event.OrganizerID,
	).Scan(&event.ETag, &event.Sequence, &event.CreatedAt, &event.UpdatedAt)
}

// GetByID retrieves an event by ID
func (r *EventRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Event, error) {
	query := `
		SELECT id, calendar_id, uid, title, description, location,
		       start_time, end_time, all_day, timezone, status, visibility, transparency,
		       recurrence_rule, recurrence_id, original_event_id, attachments, categories,
		       sequence, etag, organizer_id, created_at, updated_at
		FROM calendar_events
		WHERE id = $1`

	event := &models.Event{}
	err := r.scanEvent(r.db.QueryRow(ctx, query, id), event)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return event, err
}

// GetByUID retrieves an event by iCalendar UID in a calendar
func (r *EventRepository) GetByUID(ctx context.Context, calendarID uuid.UUID, uid string) (*models.Event, error) {
	query := `
		SELECT id, calendar_id, uid, title, description, location,
		       start_time, end_time, all_day, timezone, status, visibility, transparency,
		       recurrence_rule, recurrence_id, original_event_id, attachments, categories,
		       sequence, etag, organizer_id, created_at, updated_at
		FROM calendar_events
		WHERE calendar_id = $1 AND uid = $2`

	event := &models.Event{}
	err := r.scanEvent(r.db.QueryRow(ctx, query, calendarID, uid), event)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return event, err
}

// List lists events in a calendar within a time range
func (r *EventRepository) List(ctx context.Context, calendarID uuid.UUID, startTime, endTime time.Time, limit, offset int) ([]*models.Event, int, error) {
	// Count total
	countQuery := `
		SELECT COUNT(*) FROM calendar_events
		WHERE calendar_id = $1 AND start_time < $3 AND end_time > $2`

	var total int
	if err := r.db.QueryRow(ctx, countQuery, calendarID, startTime, endTime).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Get events (including recurring event instances)
	query := `
		SELECT id, calendar_id, uid, title, description, location,
		       start_time, end_time, all_day, timezone, status, visibility, transparency,
		       recurrence_rule, recurrence_id, original_event_id, attachments, categories,
		       sequence, etag, organizer_id, created_at, updated_at
		FROM calendar_events
		WHERE calendar_id = $1 AND start_time < $4 AND end_time > $3
		ORDER BY start_time ASC
		LIMIT $5 OFFSET $6`

	rows, err := r.db.Query(ctx, query, calendarID, startTime, endTime, endTime, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		if err := r.scanEventRows(rows, event); err != nil {
			return nil, 0, err
		}
		events = append(events, event)
	}

	return events, total, nil
}

// ListForUser lists events across all calendars for a user
func (r *EventRepository) ListForUser(ctx context.Context, userID uuid.UUID, startTime, endTime time.Time, limit, offset int) ([]*models.Event, error) {
	query := `
		SELECT e.id, e.calendar_id, e.uid, e.title, e.description, e.location,
		       e.start_time, e.end_time, e.all_day, e.timezone, e.status, e.visibility, e.transparency,
		       e.recurrence_rule, e.recurrence_id, e.original_event_id, e.attachments, e.categories,
		       e.sequence, e.etag, e.organizer_id, e.created_at, e.updated_at
		FROM calendar_events e
		JOIN calendars c ON e.calendar_id = c.id
		LEFT JOIN calendar_shares cs ON c.id = cs.calendar_id AND cs.user_id = $1
		WHERE (c.user_id = $1 OR cs.user_id = $1)
		  AND e.start_time < $4 AND e.end_time > $3
		ORDER BY e.start_time ASC
		LIMIT $5 OFFSET $6`

	rows, err := r.db.Query(ctx, query, userID, startTime, endTime, endTime, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		if err := r.scanEventRows(rows, event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, nil
}

// Search searches events by title/description
func (r *EventRepository) Search(ctx context.Context, userID uuid.UUID, query string, startTime, endTime time.Time) ([]*models.Event, error) {
	sqlQuery := `
		SELECT e.id, e.calendar_id, e.uid, e.title, e.description, e.location,
		       e.start_time, e.end_time, e.all_day, e.timezone, e.status, e.visibility, e.transparency,
		       e.recurrence_rule, e.recurrence_id, e.original_event_id, e.attachments, e.categories,
		       e.sequence, e.etag, e.organizer_id, e.created_at, e.updated_at
		FROM calendar_events e
		JOIN calendars c ON e.calendar_id = c.id
		LEFT JOIN calendar_shares cs ON c.id = cs.calendar_id AND cs.user_id = $1
		WHERE (c.user_id = $1 OR cs.user_id = $1)
		  AND e.start_time < $5 AND e.end_time > $4
		  AND (e.title ILIKE $2 OR e.description ILIKE $3 OR e.location ILIKE $2)
		ORDER BY e.start_time ASC
		LIMIT 100`

	searchPattern := "%" + query + "%"
	rows, err := r.db.Query(ctx, sqlQuery, userID, searchPattern, searchPattern, startTime, endTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		if err := r.scanEventRows(rows, event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, nil
}

// Update updates an event
func (r *EventRepository) Update(ctx context.Context, event *models.Event) error {
	query := `
		UPDATE calendar_events
		SET title = $2, description = $3, location = $4,
		    start_time = $5, end_time = $6, all_day = $7, timezone = $8,
		    status = $9, visibility = $10, transparency = $11,
		    recurrence_rule = $12, attachments = $13, categories = $14
		WHERE id = $1
		RETURNING etag, sequence, updated_at`

	return r.db.QueryRow(ctx, query,
		event.ID,
		event.Title,
		event.Description,
		event.Location,
		event.StartTime,
		event.EndTime,
		event.AllDay,
		event.Timezone,
		event.Status,
		event.Visibility,
		event.Transparency,
		sql.NullString{String: event.RecurrenceRule, Valid: event.RecurrenceRule != ""},
		event.Attachments,
		event.Categories,
	).Scan(&event.ETag, &event.Sequence, &event.UpdatedAt)
}

// Delete deletes an event
func (r *EventRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM calendar_events WHERE id = $1", id)
	return err
}

// DeleteByUID deletes an event by UID
func (r *EventRepository) DeleteByUID(ctx context.Context, calendarID uuid.UUID, uid string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM calendar_events WHERE calendar_id = $1 AND uid = $2",
		calendarID, uid)
	return err
}

// GetRecurringInstances gets all instances/exceptions of a recurring event
func (r *EventRepository) GetRecurringInstances(ctx context.Context, originalEventID uuid.UUID) ([]*models.Event, error) {
	query := `
		SELECT id, calendar_id, uid, title, description, location,
		       start_time, end_time, all_day, timezone, status, visibility, transparency,
		       recurrence_rule, recurrence_id, original_event_id, attachments, categories,
		       sequence, etag, organizer_id, created_at, updated_at
		FROM calendar_events
		WHERE original_event_id = $1
		ORDER BY start_time ASC`

	rows, err := r.db.Query(ctx, query, originalEventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		if err := r.scanEventRows(rows, event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, nil
}

// CreateException creates an exception instance for a recurring event
func (r *EventRepository) CreateException(ctx context.Context, event *models.Event, originalEventID uuid.UUID, recurrenceID time.Time) error {
	event.OriginalEventID = &originalEventID
	event.RecurrenceID = &recurrenceID
	return r.Create(ctx, event)
}

// GetFreeBusy gets free/busy periods for users
func (r *EventRepository) GetFreeBusy(ctx context.Context, userIDs []uuid.UUID, startTime, endTime time.Time) ([]*models.FreeBusyPeriod, error) {
	query := `
		SELECT e.organizer_id, e.start_time, e.end_time, e.transparency, e.status
		FROM calendar_events e
		JOIN calendars c ON e.calendar_id = c.id
		WHERE c.user_id = ANY($1)
		  AND e.start_time < $3 AND e.end_time > $2
		  AND e.transparency = 'opaque'
		  AND e.status != 'cancelled'
		ORDER BY e.start_time ASC`

	rows, err := r.db.Query(ctx, query, userIDs, startTime, endTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var periods []*models.FreeBusyPeriod
	for rows.Next() {
		var userID uuid.UUID
		var start, end time.Time
		var transparency, status string

		if err := rows.Scan(&userID, &start, &end, &transparency, &status); err != nil {
			return nil, err
		}

		fbType := "busy"
		if status == "tentative" {
			fbType = "busy-tentative"
		}

		periods = append(periods, &models.FreeBusyPeriod{
			UserID: userID,
			Start:  start,
			End:    end,
			Type:   fbType,
		})
	}

	return periods, nil
}

// GetUpcomingEvents gets upcoming events with reminders that need to be triggered
func (r *EventRepository) GetUpcomingReminders(ctx context.Context, windowMinutes int) ([]*models.EventWithReminder, error) {
	query := `
		SELECT e.id, e.calendar_id, e.title, e.start_time, e.organizer_id,
		       r.id, r.method, r.minutes, u.email
		FROM event_reminders r
		JOIN calendar_events e ON r.event_id = e.id
		JOIN users u ON e.organizer_id = u.id
		WHERE r.triggered = false
		  AND r.trigger_time <= NOW() + ($1 || ' minutes')::interval
		  AND r.trigger_time > NOW()
		ORDER BY r.trigger_time ASC`

	rows, err := r.db.Query(ctx, query, windowMinutes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reminders []*models.EventWithReminder
	for rows.Next() {
		ewr := &models.EventWithReminder{}
		if err := rows.Scan(
			&ewr.EventID,
			&ewr.CalendarID,
			&ewr.Title,
			&ewr.StartTime,
			&ewr.OrganizerID,
			&ewr.ReminderID,
			&ewr.Method,
			&ewr.Minutes,
			&ewr.Email,
		); err != nil {
			return nil, err
		}
		reminders = append(reminders, ewr)
	}

	return reminders, nil
}

// MarkReminderTriggered marks a reminder as sent
func (r *EventRepository) MarkReminderTriggered(ctx context.Context, reminderID uuid.UUID) error {
	_, err := r.db.Exec(ctx, "UPDATE event_reminders SET triggered = true WHERE id = $1", reminderID)
	return err
}

// GetMultipleByUIDs retrieves multiple events by UIDs (for calendar-multiget)
func (r *EventRepository) GetMultipleByUIDs(ctx context.Context, calendarID uuid.UUID, uids []string) ([]*models.Event, error) {
	query := `
		SELECT id, calendar_id, uid, title, description, location,
		       start_time, end_time, all_day, timezone, status, visibility, transparency,
		       recurrence_rule, recurrence_id, original_event_id, attachments, categories,
		       sequence, etag, organizer_id, created_at, updated_at
		FROM calendar_events
		WHERE calendar_id = $1 AND uid = ANY($2)`

	rows, err := r.db.Query(ctx, query, calendarID, uids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		if err := r.scanEventRows(rows, event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, nil
}

func (r *EventRepository) scanEvent(row pgx.Row, event *models.Event) error {
	var recurrenceID sql.NullTime
	var recurrenceRule sql.NullString
	var originalEventID *uuid.UUID

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
		&originalEventID,
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
	event.OriginalEventID = originalEventID

	return nil
}

func (r *EventRepository) scanEventRows(rows pgx.Rows, event *models.Event) error {
	var recurrenceID sql.NullTime
	var recurrenceRule sql.NullString
	var originalEventID *uuid.UUID

	err := rows.Scan(
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
		&originalEventID,
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
	event.OriginalEventID = originalEventID

	return nil
}
