package repository

import (
	"context"
	"time"

	"calendar-service/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AttendeeRepository struct {
	db *pgxpool.Pool
}

func NewAttendeeRepository(db *pgxpool.Pool) *AttendeeRepository {
	return &AttendeeRepository{db: db}
}

// Create adds an attendee to an event
func (r *AttendeeRepository) Create(ctx context.Context, attendee *models.Attendee) error {
	query := `
		INSERT INTO event_attendees (id, event_id, user_id, email, name, role, status, rsvp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING created_at`

	return r.db.QueryRow(ctx, query,
		attendee.ID,
		attendee.EventID,
		attendee.UserID,
		attendee.Email,
		attendee.Name,
		attendee.Role,
		attendee.Status,
		attendee.RSVP,
	).Scan(&attendee.CreatedAt)
}

// BulkCreate adds multiple attendees
func (r *AttendeeRepository) BulkCreate(ctx context.Context, eventID uuid.UUID, attendees []*models.Attendee) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO event_attendees (id, event_id, user_id, email, name, role, status, rsvp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	for _, a := range attendees {
		a.ID = uuid.New()
		a.EventID = eventID
		if a.Status == "" {
			a.Status = "needs-action"
		}
		if a.Role == "" {
			a.Role = "req-participant"
		}

		_, err = tx.Exec(ctx, query,
			a.ID, a.EventID, a.UserID, a.Email, a.Name, a.Role, a.Status, a.RSVP)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// GetByEventID gets all attendees for an event
func (r *AttendeeRepository) GetByEventID(ctx context.Context, eventID uuid.UUID) ([]*models.Attendee, error) {
	query := `
		SELECT id, event_id, user_id, email, name, role, status, rsvp, response_at, created_at
		FROM event_attendees
		WHERE event_id = $1
		ORDER BY role, email`

	rows, err := r.db.Query(ctx, query, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var attendees []*models.Attendee
	for rows.Next() {
		a := &models.Attendee{}
		if err := rows.Scan(
			&a.ID,
			&a.EventID,
			&a.UserID,
			&a.Email,
			&a.Name,
			&a.Role,
			&a.Status,
			&a.RSVP,
			&a.ResponseAt,
			&a.CreatedAt,
		); err != nil {
			return nil, err
		}
		attendees = append(attendees, a)
	}

	return attendees, nil
}

// GetByEmail gets an attendee by email for an event
func (r *AttendeeRepository) GetByEmail(ctx context.Context, eventID uuid.UUID, email string) (*models.Attendee, error) {
	query := `
		SELECT id, event_id, user_id, email, name, role, status, rsvp, response_at, created_at
		FROM event_attendees
		WHERE event_id = $1 AND email = $2`

	a := &models.Attendee{}
	err := r.db.QueryRow(ctx, query, eventID, email).Scan(
		&a.ID,
		&a.EventID,
		&a.UserID,
		&a.Email,
		&a.Name,
		&a.Role,
		&a.Status,
		&a.RSVP,
		&a.ResponseAt,
		&a.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return a, err
}

// UpdateStatus updates an attendee's RSVP status
func (r *AttendeeRepository) UpdateStatus(ctx context.Context, attendeeID uuid.UUID, status string) error {
	_, err := r.db.Exec(ctx,
		"UPDATE event_attendees SET status = $2, response_at = $3 WHERE id = $1",
		attendeeID, status, time.Now())
	return err
}

// UpdateByEmail updates attendee status by email
func (r *AttendeeRepository) UpdateStatusByEmail(ctx context.Context, eventID uuid.UUID, email, status string) error {
	_, err := r.db.Exec(ctx,
		"UPDATE event_attendees SET status = $3, response_at = $4 WHERE event_id = $1 AND email = $2",
		eventID, email, status, time.Now())
	return err
}

// Delete removes an attendee
func (r *AttendeeRepository) Delete(ctx context.Context, attendeeID uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM event_attendees WHERE id = $1", attendeeID)
	return err
}

// DeleteByEventID removes all attendees for an event
func (r *AttendeeRepository) DeleteByEventID(ctx context.Context, eventID uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM event_attendees WHERE event_id = $1", eventID)
	return err
}

// DeleteByEmail removes an attendee by email
func (r *AttendeeRepository) DeleteByEmail(ctx context.Context, eventID uuid.UUID, email string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM event_attendees WHERE event_id = $1 AND email = $2",
		eventID, email)
	return err
}

// GetEventsForAttendee gets events where user is an attendee
func (r *AttendeeRepository) GetEventsForAttendee(ctx context.Context, email string, startTime, endTime time.Time) ([]*models.Event, error) {
	query := `
		SELECT e.id, e.calendar_id, e.uid, e.title, e.description, e.location,
		       e.start_time, e.end_time, e.all_day, e.timezone, e.status, e.visibility, e.transparency,
		       e.recurrence_rule, e.recurrence_id, e.original_event_id, e.attachments, e.categories,
		       e.sequence, e.etag, e.organizer_id, e.created_at, e.updated_at
		FROM calendar_events e
		JOIN event_attendees a ON e.id = a.event_id
		WHERE a.email = $1
		  AND e.start_time < $3 AND e.end_time > $2
		  AND a.status != 'declined'
		ORDER BY e.start_time ASC`

	rows, err := r.db.Query(ctx, query, email, startTime, endTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		// Same scan logic as EventRepository
		if err := scanEventRow(rows, event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, nil
}

// GetPendingInvites gets events where user hasn't responded yet
func (r *AttendeeRepository) GetPendingInvites(ctx context.Context, email string) ([]*models.Event, error) {
	query := `
		SELECT e.id, e.calendar_id, e.uid, e.title, e.description, e.location,
		       e.start_time, e.end_time, e.all_day, e.timezone, e.status, e.visibility, e.transparency,
		       e.recurrence_rule, e.recurrence_id, e.original_event_id, e.attachments, e.categories,
		       e.sequence, e.etag, e.organizer_id, e.created_at, e.updated_at
		FROM calendar_events e
		JOIN event_attendees a ON e.id = a.event_id
		WHERE a.email = $1 AND a.status = 'needs-action' AND e.start_time > NOW()
		ORDER BY e.start_time ASC`

	rows, err := r.db.Query(ctx, query, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		if err := scanEventRow(rows, event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, nil
}

// Helper to scan event rows
func scanEventRow(rows pgx.Rows, event *models.Event) error {
	return rows.Scan(
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
		&event.RecurrenceRule,
		&event.RecurrenceID,
		&event.OriginalEventID,
		&event.Attachments,
		&event.Categories,
		&event.Sequence,
		&event.ETag,
		&event.OrganizerID,
		&event.CreatedAt,
		&event.UpdatedAt,
	)
}
