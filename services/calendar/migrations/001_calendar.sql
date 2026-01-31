-- Calendar Service Database Schema
-- Migration: 001_calendar.sql

-- Calendars
CREATE TABLE IF NOT EXISTS calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_public BOOLEAN NOT NULL DEFAULT false,
    sync_token VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendars_user ON calendars(user_id);
CREATE UNIQUE INDEX idx_calendars_default ON calendars(user_id, is_default) WHERE is_default = true;

-- Calendar sharing
CREATE TABLE IF NOT EXISTS calendar_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(10) NOT NULL DEFAULT 'read', -- read, write, admin
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(calendar_id, user_id)
);

CREATE INDEX idx_calendar_shares_calendar ON calendar_shares(calendar_id);
CREATE INDEX idx_calendar_shares_user ON calendar_shares(user_id);

-- Events
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    uid VARCHAR(255) NOT NULL, -- iCalendar UID
    title VARCHAR(200) NOT NULL,
    description TEXT,
    location TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT false,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed', -- tentative, confirmed, cancelled
    visibility VARCHAR(20) NOT NULL DEFAULT 'private', -- public, private, confidential
    transparency VARCHAR(20) NOT NULL DEFAULT 'opaque', -- opaque, transparent
    recurrence_rule TEXT, -- RRULE string
    recurrence_id TIMESTAMP WITH TIME ZONE, -- For exceptions
    original_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
    attachments TEXT[] DEFAULT '{}',
    categories TEXT[] DEFAULT '{}',
    sequence INTEGER NOT NULL DEFAULT 0,
    etag VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    organizer_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(calendar_id, uid)
);

CREATE INDEX idx_events_calendar ON calendar_events(calendar_id);
CREATE INDEX idx_events_time ON calendar_events(calendar_id, start_time, end_time);
CREATE INDEX idx_events_uid ON calendar_events(uid);
CREATE INDEX idx_events_organizer ON calendar_events(organizer_id);
CREATE INDEX idx_events_recurrence ON calendar_events(original_event_id) WHERE original_event_id IS NOT NULL;

-- Event reminders
CREATE TABLE IF NOT EXISTS event_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL DEFAULT 'display', -- email, display, audio
    minutes INTEGER NOT NULL DEFAULT 15,
    triggered BOOLEAN NOT NULL DEFAULT false,
    trigger_time TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_reminders_event ON event_reminders(event_id);
CREATE INDEX idx_reminders_pending ON event_reminders(triggered, trigger_time) WHERE triggered = false;

-- Event attendees
CREATE TABLE IF NOT EXISTS event_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'req-participant', -- chair, req-participant, opt-participant, non-participant
    status VARCHAR(20) NOT NULL DEFAULT 'needs-action', -- needs-action, accepted, declined, tentative, delegated
    rsvp BOOLEAN NOT NULL DEFAULT true,
    response_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attendees_event ON event_attendees(event_id);
CREATE INDEX idx_attendees_user ON event_attendees(user_id);
CREATE INDEX idx_attendees_email ON event_attendees(email);

-- Free/busy cache (for performance)
CREATE TABLE IF NOT EXISTS freebusy_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'busy', -- free, busy, busy-tentative, busy-unavailable
    event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_freebusy_user ON freebusy_cache(user_id);
CREATE INDEX idx_freebusy_time ON freebusy_cache(user_id, start_time, end_time);

-- Create default calendar trigger
CREATE OR REPLACE FUNCTION create_default_calendar()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO calendars (user_id, name, is_default, timezone)
    VALUES (NEW.id, 'Personal', true, COALESCE(NEW.timezone, 'UTC'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Uncomment to auto-create default calendar for new users
-- CREATE TRIGGER create_user_calendar AFTER INSERT ON users
--     FOR EACH ROW EXECUTE FUNCTION create_default_calendar();

-- Update sync_token on calendar changes
CREATE OR REPLACE FUNCTION update_calendar_sync_token()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE calendars SET sync_token = gen_random_uuid()::text, updated_at = NOW()
    WHERE id = COALESCE(NEW.calendar_id, OLD.calendar_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sync_token_on_event_change
AFTER INSERT OR UPDATE OR DELETE ON calendar_events
FOR EACH ROW EXECUTE FUNCTION update_calendar_sync_token();

-- Update etag on event changes
CREATE OR REPLACE FUNCTION update_event_etag()
RETURNS TRIGGER AS $$
BEGIN
    NEW.etag = gen_random_uuid()::text;
    NEW.updated_at = NOW();
    NEW.sequence = OLD.sequence + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_etag_on_event_update
BEFORE UPDATE ON calendar_events
FOR EACH ROW EXECUTE FUNCTION update_event_etag();

-- Calculate reminder trigger times
CREATE OR REPLACE FUNCTION calculate_reminder_trigger()
RETURNS TRIGGER AS $$
BEGIN
    SELECT e.start_time - (NEW.minutes || ' minutes')::interval
    INTO NEW.trigger_time
    FROM calendar_events e
    WHERE e.id = NEW.event_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_reminder_time
BEFORE INSERT OR UPDATE ON event_reminders
FOR EACH ROW EXECUTE FUNCTION calculate_reminder_trigger();
