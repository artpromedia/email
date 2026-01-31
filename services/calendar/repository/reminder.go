package repository

import (
	"context"

	"calendar-service/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReminderRepository struct {
	db *pgxpool.Pool
}

func NewReminderRepository(db *pgxpool.Pool) *ReminderRepository {
	return &ReminderRepository{db: db}
}

// Create creates a reminder
func (r *ReminderRepository) Create(ctx context.Context, reminder *models.Reminder) error {
	query := `
		INSERT INTO event_reminders (id, event_id, method, minutes)
		VALUES ($1, $2, $3, $4)
		RETURNING trigger_time`

	return r.db.QueryRow(ctx, query,
		reminder.ID,
		reminder.EventID,
		reminder.Method,
		reminder.Minutes,
	).Scan(&reminder.TriggerTime)
}

// BulkCreate creates multiple reminders for an event
func (r *ReminderRepository) BulkCreate(ctx context.Context, eventID uuid.UUID, reminders []*models.Reminder) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO event_reminders (id, event_id, method, minutes)
		VALUES ($1, $2, $3, $4)`

	for _, rem := range reminders {
		rem.ID = uuid.New()
		rem.EventID = eventID
		if rem.Method == "" {
			rem.Method = "display"
		}

		_, err = tx.Exec(ctx, query, rem.ID, rem.EventID, rem.Method, rem.Minutes)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// GetByEventID gets all reminders for an event
func (r *ReminderRepository) GetByEventID(ctx context.Context, eventID uuid.UUID) ([]*models.Reminder, error) {
	query := `
		SELECT id, event_id, method, minutes, triggered, trigger_time
		FROM event_reminders
		WHERE event_id = $1
		ORDER BY minutes ASC`

	rows, err := r.db.Query(ctx, query, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reminders []*models.Reminder
	for rows.Next() {
		rem := &models.Reminder{}
		if err := rows.Scan(
			&rem.ID,
			&rem.EventID,
			&rem.Method,
			&rem.Minutes,
			&rem.Triggered,
			&rem.TriggerTime,
		); err != nil {
			return nil, err
		}
		reminders = append(reminders, rem)
	}

	return reminders, nil
}

// Update updates a reminder
func (r *ReminderRepository) Update(ctx context.Context, reminder *models.Reminder) error {
	_, err := r.db.Exec(ctx,
		"UPDATE event_reminders SET method = $2, minutes = $3 WHERE id = $1",
		reminder.ID, reminder.Method, reminder.Minutes)
	return err
}

// Delete deletes a reminder
func (r *ReminderRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM event_reminders WHERE id = $1", id)
	return err
}

// DeleteByEventID deletes all reminders for an event
func (r *ReminderRepository) DeleteByEventID(ctx context.Context, eventID uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM event_reminders WHERE event_id = $1", eventID)
	return err
}

// ReplaceForEvent replaces all reminders for an event
func (r *ReminderRepository) ReplaceForEvent(ctx context.Context, eventID uuid.UUID, reminders []*models.Reminder) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Delete existing
	_, err = tx.Exec(ctx, "DELETE FROM event_reminders WHERE event_id = $1", eventID)
	if err != nil {
		return err
	}

	// Insert new
	query := `
		INSERT INTO event_reminders (id, event_id, method, minutes)
		VALUES ($1, $2, $3, $4)`

	for _, rem := range reminders {
		rem.ID = uuid.New()
		rem.EventID = eventID
		_, err = tx.Exec(ctx, query, rem.ID, rem.EventID, rem.Method, rem.Minutes)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// GetPendingReminders gets reminders that need to be sent
func (r *ReminderRepository) GetPendingReminders(ctx context.Context, windowMinutes int) ([]*models.EventWithReminder, error) {
	query := `
		SELECT e.id, e.calendar_id, e.title, e.start_time, e.organizer_id,
		       r.id, r.method, r.minutes, u.email
		FROM event_reminders r
		JOIN calendar_events e ON r.event_id = e.id
		JOIN users u ON e.organizer_id = u.id
		WHERE r.triggered = false
		  AND r.trigger_time <= NOW() + ($1 || ' minutes')::interval
		  AND r.trigger_time > NOW() - INTERVAL '5 minutes'
		ORDER BY r.trigger_time ASC
		LIMIT 100`

	rows, err := r.db.Query(ctx, query, windowMinutes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.EventWithReminder
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
		results = append(results, ewr)
	}

	return results, nil
}

// MarkTriggered marks a reminder as triggered
func (r *ReminderRepository) MarkTriggered(ctx context.Context, reminderID uuid.UUID) error {
	_, err := r.db.Exec(ctx, "UPDATE event_reminders SET triggered = true WHERE id = $1", reminderID)
	return err
}

// GetByID gets a reminder by ID
func (r *ReminderRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Reminder, error) {
	query := `
		SELECT id, event_id, method, minutes, triggered, trigger_time
		FROM event_reminders
		WHERE id = $1`

	rem := &models.Reminder{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&rem.ID,
		&rem.EventID,
		&rem.Method,
		&rem.Minutes,
		&rem.Triggered,
		&rem.TriggerTime,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return rem, err
}
