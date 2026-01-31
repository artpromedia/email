package models

import (
	"time"

	"github.com/google/uuid"
)

// Calendar represents a user's calendar
type Calendar struct {
	ID          uuid.UUID `json:"id" db:"id"`
	UserID      uuid.UUID `json:"user_id" db:"user_id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	Color       string    `json:"color" db:"color"`
	Timezone    string    `json:"timezone" db:"timezone"`
	IsDefault   bool      `json:"is_default" db:"is_default"`
	IsPublic    bool      `json:"is_public" db:"is_public"`
	SyncToken   string    `json:"sync_token" db:"sync_token"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// CalendarShare represents calendar sharing with another user
type CalendarShare struct {
	ID         uuid.UUID `json:"id" db:"id"`
	CalendarID uuid.UUID `json:"calendar_id" db:"calendar_id"`
	UserID     uuid.UUID `json:"user_id" db:"user_id"`
	Permission string    `json:"permission" db:"permission"` // read, write, admin
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

// Event represents a calendar event
type Event struct {
	ID              uuid.UUID   `json:"id" db:"id"`
	CalendarID      uuid.UUID   `json:"calendar_id" db:"calendar_id"`
	UID             string      `json:"uid" db:"uid"` // iCalendar UID
	Title           string      `json:"title" db:"title"`
	Description     string      `json:"description" db:"description"`
	Location        string      `json:"location" db:"location"`
	StartTime       time.Time   `json:"start_time" db:"start_time"`
	EndTime         time.Time   `json:"end_time" db:"end_time"`
	AllDay          bool        `json:"all_day" db:"all_day"`
	Timezone        string      `json:"timezone" db:"timezone"`
	Status          EventStatus `json:"status" db:"status"`
	Visibility      string      `json:"visibility" db:"visibility"` // public, private, confidential
	Transparency    string      `json:"transparency" db:"transparency"` // opaque, transparent
	RecurrenceRule  string      `json:"recurrence_rule" db:"recurrence_rule"` // RRULE
	RecurrenceID    *time.Time  `json:"recurrence_id" db:"recurrence_id"`
	OriginalEventID *uuid.UUID  `json:"original_event_id" db:"original_event_id"`
	Reminders       []Reminder  `json:"reminders" db:"-"`
	Attachments     []string    `json:"attachments" db:"attachments"`
	Categories      []string    `json:"categories" db:"categories"`
	Sequence        int         `json:"sequence" db:"sequence"` // For iTIP updates
	ETag            string      `json:"etag" db:"etag"`
	OrganizerID     uuid.UUID   `json:"organizer_id" db:"organizer_id"`
	CreatedAt       time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at" db:"updated_at"`
}

type EventStatus string

const (
	EventStatusTentative EventStatus = "tentative"
	EventStatusConfirmed EventStatus = "confirmed"
	EventStatusCancelled EventStatus = "cancelled"
)

// Reminder for an event
type Reminder struct {
	ID        uuid.UUID `json:"id" db:"id"`
	EventID   uuid.UUID `json:"event_id" db:"event_id"`
	Method    string    `json:"method" db:"method"` // email, display, audio
	Minutes   int       `json:"minutes" db:"minutes"` // Minutes before event
	Triggered bool      `json:"triggered" db:"triggered"`
}

// Attendee represents an event attendee
type Attendee struct {
	ID         uuid.UUID      `json:"id" db:"id"`
	EventID    uuid.UUID      `json:"event_id" db:"event_id"`
	UserID     *uuid.UUID     `json:"user_id" db:"user_id"` // Null for external attendees
	Email      string         `json:"email" db:"email"`
	Name       string         `json:"name" db:"name"`
	Role       AttendeeRole   `json:"role" db:"role"`
	Status     AttendeeStatus `json:"status" db:"status"`
	RSVP       bool           `json:"rsvp" db:"rsvp"`
	ResponseAt *time.Time     `json:"response_at" db:"response_at"`
}

type AttendeeRole string

const (
	RoleChair         AttendeeRole = "chair"
	RoleRequired      AttendeeRole = "req-participant"
	RoleOptional      AttendeeRole = "opt-participant"
	RoleNonParticipant AttendeeRole = "non-participant"
)

type AttendeeStatus string

const (
	StatusNeedsAction AttendeeStatus = "needs-action"
	StatusAccepted    AttendeeStatus = "accepted"
	StatusDeclined    AttendeeStatus = "declined"
	StatusTentative   AttendeeStatus = "tentative"
	StatusDelegated   AttendeeStatus = "delegated"
)

// FreeBusy represents a free/busy time slot
type FreeBusy struct {
	Start  time.Time `json:"start"`
	End    time.Time `json:"end"`
	Status string    `json:"status"` // free, busy, busy-tentative, busy-unavailable
}

// CreateCalendarRequest represents a request to create a calendar
type CreateCalendarRequest struct {
	Name        string `json:"name" validate:"required,min=1,max=100"`
	Description string `json:"description"`
	Color       string `json:"color" validate:"required,hexcolor"`
	Timezone    string `json:"timezone" validate:"required,timezone"`
	IsPublic    bool   `json:"is_public"`
}

// UpdateCalendarRequest represents a request to update a calendar
type UpdateCalendarRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Color       *string `json:"color"`
	Timezone    *string `json:"timezone"`
	IsPublic    *bool   `json:"is_public"`
}

// CreateEventRequest represents a request to create an event
type CreateEventRequest struct {
	CalendarID     uuid.UUID           `json:"calendar_id" validate:"required"`
	Title          string              `json:"title" validate:"required,min=1,max=200"`
	Description    string              `json:"description"`
	Location       string              `json:"location"`
	StartTime      time.Time           `json:"start_time" validate:"required"`
	EndTime        time.Time           `json:"end_time" validate:"required,gtfield=StartTime"`
	AllDay         bool                `json:"all_day"`
	Timezone       string              `json:"timezone"`
	Visibility     string              `json:"visibility"`
	RecurrenceRule string              `json:"recurrence_rule"`
	Reminders      []CreateReminderRequest `json:"reminders"`
	Attendees      []CreateAttendeeRequest `json:"attendees"`
	Categories     []string            `json:"categories"`
}

type CreateReminderRequest struct {
	Method  string `json:"method" validate:"required,oneof=email display audio"`
	Minutes int    `json:"minutes" validate:"required,min=0,max=40320"` // Max 4 weeks
}

type CreateAttendeeRequest struct {
	Email string       `json:"email" validate:"required,email"`
	Name  string       `json:"name"`
	Role  AttendeeRole `json:"role"`
	RSVP  bool         `json:"rsvp"`
}

// UpdateEventRequest represents a request to update an event
type UpdateEventRequest struct {
	Title          *string              `json:"title"`
	Description    *string              `json:"description"`
	Location       *string              `json:"location"`
	StartTime      *time.Time           `json:"start_time"`
	EndTime        *time.Time           `json:"end_time"`
	AllDay         *bool                `json:"all_day"`
	Timezone       *string              `json:"timezone"`
	Status         *EventStatus         `json:"status"`
	Visibility     *string              `json:"visibility"`
	RecurrenceRule *string              `json:"recurrence_rule"`
	Reminders      []CreateReminderRequest `json:"reminders,omitempty"`
}

// RespondRequest represents an RSVP response
type RespondRequest struct {
	Status  AttendeeStatus `json:"status" validate:"required,oneof=accepted declined tentative"`
	Comment string         `json:"comment"`
}

// ShareCalendarRequest represents a request to share a calendar
type ShareCalendarRequest struct {
	UserID     uuid.UUID `json:"user_id" validate:"required"`
	Permission string    `json:"permission" validate:"required,oneof=read write admin"`
}

// FreeBusyRequest represents a free/busy query
type FreeBusyRequest struct {
	Users []uuid.UUID `json:"users" validate:"required,min=1"`
	Start time.Time   `json:"start" validate:"required"`
	End   time.Time   `json:"end" validate:"required,gtfield=Start"`
}

type FreeBusyResponse struct {
	UserID   uuid.UUID  `json:"user_id"`
	FreeBusy []FreeBusy `json:"freebusy"`
}
