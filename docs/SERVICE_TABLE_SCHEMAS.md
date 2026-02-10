# Service Table Schemas — Contacts, Calendar, Chat

Extracted from the Go services on the production server at
`/opt/oonrumail/app/services/{contacts,calendar,chat}/`.

**Source files examined:**

- `contacts/migrations/001_contacts.sql` (authoritative)
- `contacts/repository/addressbook.go`, `contact.go`, `group.go`
- `contacts/models/models.go`
- `calendar/migrations/001_calendar.sql` (authoritative)
- `calendar/repository/calendar.go`, `event.go`, `attendee.go`, `reminder.go`
- `chat/internal/repository/repository.go` (no migration file — schema inferred from queries +
  models)
- `chat/internal/models/models.go`

> **Note:** All three services reference the `users` table (via FK or JOINs). The chat service also
> references `organization_members`. These tables are owned by the **auth** service and must already
> exist.

---

## 1. Contacts Service — 5 Tables

### 1.1 `address_books`

```sql
CREATE TABLE IF NOT EXISTS address_books (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    sync_token      VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_address_books_user ON address_books(user_id);
CREATE UNIQUE INDEX idx_address_books_default ON address_books(user_id, is_default) WHERE is_default = true;
```

**FK:** `user_id → users(id) ON DELETE CASCADE` **Unique constraints:** Partial unique on
`(user_id, is_default) WHERE is_default = true`

---

### 1.2 `address_book_shares`

```sql
CREATE TABLE IF NOT EXISTS address_book_shares (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission      VARCHAR(10) NOT NULL DEFAULT 'read',  -- read, write, admin
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(address_book_id, user_id)
);

CREATE INDEX idx_ab_shares_book ON address_book_shares(address_book_id);
CREATE INDEX idx_ab_shares_user ON address_book_shares(user_id);
```

**FK:** `address_book_id → address_books(id) ON DELETE CASCADE`,
`user_id → users(id) ON DELETE CASCADE` **Unique:** `(address_book_id, user_id)`

---

### 1.3 `contacts`

```sql
CREATE TABLE IF NOT EXISTS contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
    uid             VARCHAR(255) NOT NULL,        -- vCard UID

    -- Name
    prefix          VARCHAR(20),
    first_name      VARCHAR(100),
    middle_name     VARCHAR(100),
    last_name       VARCHAR(100),
    suffix          VARCHAR(20),
    nickname        VARCHAR(100),
    display_name    VARCHAR(255) NOT NULL,

    -- Organization
    company         VARCHAR(200),
    department      VARCHAR(200),
    job_title       VARCHAR(200),

    -- Contact details (stored as JSONB)
    emails          JSONB DEFAULT '[]',
    phones          JSONB DEFAULT '[]',
    addresses       JSONB DEFAULT '[]',
    urls            JSONB DEFAULT '[]',
    ims             JSONB DEFAULT '[]',

    -- Personal
    birthday        DATE,
    anniversary     DATE,
    notes           TEXT,

    -- Photo
    photo_url       TEXT,
    photo_data      BYTEA,

    -- Categories
    categories      TEXT[] DEFAULT '{}',

    -- Custom fields
    custom_fields   JSONB DEFAULT '{}',

    -- Metadata
    starred         BOOLEAN NOT NULL DEFAULT false,
    etag            VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(address_book_id, uid)
);

CREATE INDEX idx_contacts_address_book ON contacts(address_book_id);
CREATE INDEX idx_contacts_uid ON contacts(uid);
CREATE INDEX idx_contacts_display_name ON contacts(display_name);
CREATE INDEX idx_contacts_starred ON contacts(starred) WHERE starred = true;
CREATE INDEX idx_contacts_emails ON contacts USING GIN(emails jsonb_path_ops);
CREATE INDEX idx_contacts_phones ON contacts USING GIN(phones jsonb_path_ops);
CREATE INDEX idx_contacts_search ON contacts USING GIN(
    to_tsvector('english',
        COALESCE(first_name, '') || ' ' ||
        COALESCE(last_name, '') || ' ' ||
        COALESCE(company, '') || ' ' ||
        COALESCE(nickname, '')
    )
);
```

**FK:** `address_book_id → address_books(id) ON DELETE CASCADE` **Unique:** `(address_book_id, uid)`

---

### 1.4 `contact_groups`

```sql
CREATE TABLE IF NOT EXISTS contact_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    color           VARCHAR(7),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_groups_book ON contact_groups(address_book_id);
```

**FK:** `address_book_id → address_books(id) ON DELETE CASCADE`

---

### 1.5 `contact_group_members`

```sql
CREATE TABLE IF NOT EXISTS contact_group_members (
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contact_id, group_id)
);

CREATE INDEX idx_cgm_contact ON contact_group_members(contact_id);
CREATE INDEX idx_cgm_group ON contact_group_members(group_id);
```

**FK:** `contact_id → contacts(id) ON DELETE CASCADE`,
`group_id → contact_groups(id) ON DELETE CASCADE` **PK:** `(contact_id, group_id)` — composite

---

### Contacts Triggers

```sql
-- Update sync_token on address_books when contacts change
CREATE OR REPLACE FUNCTION update_address_book_sync_token()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE address_books SET sync_token = gen_random_uuid()::text, updated_at = NOW()
    WHERE id = COALESCE(NEW.address_book_id, OLD.address_book_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sync_token_on_contact_change
AFTER INSERT OR UPDATE OR DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_address_book_sync_token();

-- Update etag & display_name on contact update
CREATE OR REPLACE FUNCTION update_contact_etag()
RETURNS TRIGGER AS $$
BEGIN
    NEW.etag = gen_random_uuid()::text;
    NEW.updated_at = NOW();
    IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
        NEW.display_name = TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name));
        IF NEW.display_name = '' AND NEW.company IS NOT NULL THEN
            NEW.display_name = NEW.company;
        END IF;
        IF NEW.display_name = '' THEN
            NEW.display_name = 'No Name';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_etag_on_contact_update
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_contact_etag();

-- Auto-generate display_name on insert
CREATE OR REPLACE FUNCTION generate_contact_display_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
        NEW.display_name = TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name));
        IF NEW.display_name = '' AND NEW.company IS NOT NULL THEN
            NEW.display_name = NEW.company;
        END IF;
        IF NEW.display_name = '' THEN
            NEW.display_name = 'No Name';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_display_name_on_insert
BEFORE INSERT ON contacts
FOR EACH ROW EXECUTE FUNCTION generate_contact_display_name();
```

---

## 2. Calendar Service — 6 Tables

### 2.1 `calendars`

```sql
CREATE TABLE IF NOT EXISTS calendars (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    color       VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
    timezone    VARCHAR(50) NOT NULL DEFAULT 'UTC',
    is_default  BOOLEAN NOT NULL DEFAULT false,
    is_public   BOOLEAN NOT NULL DEFAULT false,
    sync_token  VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendars_user ON calendars(user_id);
CREATE UNIQUE INDEX idx_calendars_default ON calendars(user_id, is_default) WHERE is_default = true;
```

**FK:** `user_id → users(id) ON DELETE CASCADE` **Unique:** Partial unique on
`(user_id, is_default) WHERE is_default = true`

---

### 2.2 `calendar_shares`

```sql
CREATE TABLE IF NOT EXISTS calendar_shares (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  VARCHAR(10) NOT NULL DEFAULT 'read',  -- read, write, admin
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(calendar_id, user_id)
);

CREATE INDEX idx_calendar_shares_calendar ON calendar_shares(calendar_id);
CREATE INDEX idx_calendar_shares_user ON calendar_shares(user_id);
```

**FK:** `calendar_id → calendars(id) ON DELETE CASCADE`, `user_id → users(id) ON DELETE CASCADE`
**Unique:** `(calendar_id, user_id)`

---

### 2.3 `calendar_events`

```sql
CREATE TABLE IF NOT EXISTS calendar_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id       UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    uid               VARCHAR(255) NOT NULL,             -- iCalendar UID
    title             VARCHAR(200) NOT NULL,
    description       TEXT,
    location          TEXT,
    start_time        TIMESTAMPTZ NOT NULL,
    end_time          TIMESTAMPTZ NOT NULL,
    all_day           BOOLEAN NOT NULL DEFAULT false,
    timezone          VARCHAR(50) NOT NULL DEFAULT 'UTC',
    status            VARCHAR(20) NOT NULL DEFAULT 'confirmed',    -- tentative, confirmed, cancelled
    visibility        VARCHAR(20) NOT NULL DEFAULT 'private',      -- public, private, confidential
    transparency      VARCHAR(20) NOT NULL DEFAULT 'opaque',       -- opaque, transparent
    recurrence_rule   TEXT,                               -- RRULE string
    recurrence_id     TIMESTAMPTZ,                        -- For exceptions
    original_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
    attachments       TEXT[] DEFAULT '{}',
    categories        TEXT[] DEFAULT '{}',
    sequence          INTEGER NOT NULL DEFAULT 0,
    etag              VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    organizer_id      UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(calendar_id, uid)
);

CREATE INDEX idx_events_calendar ON calendar_events(calendar_id);
CREATE INDEX idx_events_time ON calendar_events(calendar_id, start_time, end_time);
CREATE INDEX idx_events_uid ON calendar_events(uid);
CREATE INDEX idx_events_organizer ON calendar_events(organizer_id);
CREATE INDEX idx_events_recurrence ON calendar_events(original_event_id) WHERE original_event_id IS NOT NULL;
```

**FK:** `calendar_id → calendars(id) ON DELETE CASCADE`,
`original_event_id → calendar_events(id) ON DELETE CASCADE` (self-ref), `organizer_id → users(id)`
**Unique:** `(calendar_id, uid)`

---

### 2.4 `event_reminders`

```sql
CREATE TABLE IF NOT EXISTS event_reminders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    method       VARCHAR(20) NOT NULL DEFAULT 'display',  -- email, display, audio
    minutes      INTEGER NOT NULL DEFAULT 15,
    triggered    BOOLEAN NOT NULL DEFAULT false,
    trigger_time TIMESTAMPTZ
);

CREATE INDEX idx_reminders_event ON event_reminders(event_id);
CREATE INDEX idx_reminders_pending ON event_reminders(triggered, trigger_time) WHERE triggered = false;
```

**FK:** `event_id → calendar_events(id) ON DELETE CASCADE`

---

### 2.5 `event_attendees`

```sql
CREATE TABLE IF NOT EXISTS event_attendees (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    email       VARCHAR(255) NOT NULL,
    name        VARCHAR(255),
    role        VARCHAR(20) NOT NULL DEFAULT 'req-participant',  -- chair, req-participant, opt-participant, non-participant
    status      VARCHAR(20) NOT NULL DEFAULT 'needs-action',     -- needs-action, accepted, declined, tentative, delegated
    rsvp        BOOLEAN NOT NULL DEFAULT true,
    response_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attendees_event ON event_attendees(event_id);
CREATE INDEX idx_attendees_user ON event_attendees(user_id);
CREATE INDEX idx_attendees_email ON event_attendees(email);
```

**FK:** `event_id → calendar_events(id) ON DELETE CASCADE`, `user_id → users(id) ON DELETE SET NULL`

---

### 2.6 `freebusy_cache`

```sql
CREATE TABLE IF NOT EXISTS freebusy_cache (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time   TIMESTAMPTZ NOT NULL,
    status     VARCHAR(20) NOT NULL DEFAULT 'busy',  -- free, busy, busy-tentative, busy-unavailable
    event_id   UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_freebusy_user ON freebusy_cache(user_id);
CREATE INDEX idx_freebusy_time ON freebusy_cache(user_id, start_time, end_time);
```

**FK:** `user_id → users(id) ON DELETE CASCADE`, `event_id → calendar_events(id) ON DELETE CASCADE`

---

### Calendar Triggers

```sql
-- Update sync_token on calendar when events change
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

-- Update etag & bump sequence on event update
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

-- Calculate reminder trigger_time from event start_time
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
```

---

## 3. Chat Service — 5 Tables (no migration file — inferred from Go code)

The chat service has **no** `migrations/*.sql` file. All schemas below are reconstructed from the
SQL queries in `repository.go` and the struct definitions in `models.go`.

### 3.1 `chat_channels`

```sql
CREATE TABLE IF NOT EXISTS chat_channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,                        -- FK to organizations table (auth service)
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    type            VARCHAR(20) NOT NULL DEFAULT 'public', -- public, private, direct
    topic           TEXT,
    is_archived     BOOLEAN NOT NULL DEFAULT false,
    created_by      UUID NOT NULL,                         -- FK to users(id)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_channels_org ON chat_channels(organization_id);
CREATE INDEX idx_chat_channels_slug ON chat_channels(organization_id, slug);
CREATE INDEX idx_chat_channels_type ON chat_channels(type);
```

**Referenced columns in queries:** `id`, `organization_id`, `name`, `slug`, `description`, `type`,
`topic`, `is_archived`, `created_by`, `created_at`, `updated_at` **Implicit FK:** `organization_id`
(organizations), `created_by` (users)

---

### 3.2 `chat_channel_members`

```sql
CREATE TABLE IF NOT EXISTS chat_channel_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',  -- owner, admin, member
    last_read_at    TIMESTAMPTZ,
    last_read_msg_id UUID,
    is_muted        BOOLEAN NOT NULL DEFAULT false,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_chat_members_channel ON chat_channel_members(channel_id);
CREATE INDEX idx_chat_members_user ON chat_channel_members(user_id);
```

**FK:** `channel_id → chat_channels(id) ON DELETE CASCADE`, `user_id → users(id) ON DELETE CASCADE`
**Unique:** `(channel_id, user_id)` — enforced by `ON CONFLICT (channel_id, user_id) DO NOTHING` in
Go code **Columns from model:** `id`, `channel_id`, `user_id`, `role`, `last_read_at`,
`last_read_msg_id`, `is_muted`, `joined_at`

---

### 3.3 `chat_messages`

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id   UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id    UUID REFERENCES chat_messages(id) ON DELETE CASCADE,  -- thread parent (self-referential)
    content      TEXT NOT NULL,
    content_type VARCHAR(20) NOT NULL DEFAULT 'text',  -- text, markdown, system
    is_edited    BOOLEAN NOT NULL DEFAULT false,
    is_pinned    BOOLEAN NOT NULL DEFAULT false,
    is_deleted   BOOLEAN NOT NULL DEFAULT false,       -- soft delete
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX idx_chat_messages_channel_time ON chat_messages(channel_id, created_at);
CREATE INDEX idx_chat_messages_parent ON chat_messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_chat_messages_pinned ON chat_messages(channel_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_chat_messages_search ON chat_messages USING GIN(to_tsvector('english', content));
```

**FK:** `channel_id → chat_channels(id) ON DELETE CASCADE`, `user_id → users(id)`,
`parent_id → chat_messages(id) ON DELETE CASCADE` (self-ref) **Columns from INSERT/SELECT:** `id`,
`channel_id`, `user_id`, `parent_id`, `content`, `content_type`, `is_edited`, `is_pinned`,
`is_deleted`, `metadata`, `created_at`, `updated_at`

---

### 3.4 `chat_reactions`

```sql
CREATE TABLE IF NOT EXISTS chat_reactions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_chat_reactions_message ON chat_reactions(message_id);
CREATE INDEX idx_chat_reactions_user ON chat_reactions(user_id);
```

**FK:** `message_id → chat_messages(id) ON DELETE CASCADE`, `user_id → users(id)` **Unique:**
`(message_id, user_id, emoji)` — enforced by `ON CONFLICT (message_id, user_id, emoji) DO NOTHING`
in Go code

---

### 3.5 `chat_attachments`

```sql
CREATE TABLE IF NOT EXISTS chat_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id    UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    file_name     VARCHAR(255) NOT NULL,
    file_size     BIGINT NOT NULL,
    content_type  VARCHAR(100) NOT NULL,
    storage_path  TEXT NOT NULL,
    url           TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_attachments_message ON chat_attachments(message_id);
```

**FK:** `message_id → chat_messages(id) ON DELETE CASCADE`

---

## External Table Dependencies (owned by auth service)

All three services JOIN against these auth-service tables:

### `users` (referenced by all 3 services)

Columns accessed in queries:

- `id` (UUID, PK)
- `email` (VARCHAR)
- `display_name` (VARCHAR)
- `avatar_url` (TEXT) — chat service
- `status` (VARCHAR) — chat service (online, away, dnd, offline)
- `status_text` (TEXT) — chat service
- `last_seen_at` (TIMESTAMPTZ) — chat service
- `timezone` (VARCHAR) — calendar trigger

### `organization_members` (referenced by chat service only)

Columns accessed in queries:

- `user_id` (UUID, FK to users)
- `organization_id` (UUID, FK to organizations)

---

## Summary Table

| Service  | Table                   | Columns | FKs                                                                                      |
| -------- | ----------------------- | ------- | ---------------------------------------------------------------------------------------- |
| Contacts | `address_books`         | 8       | `user_id → users`                                                                        |
| Contacts | `address_book_shares`   | 5       | `address_book_id → address_books`, `user_id → users`                                     |
| Contacts | `contacts`              | 26      | `address_book_id → address_books`                                                        |
| Contacts | `contact_groups`        | 7       | `address_book_id → address_books`                                                        |
| Contacts | `contact_group_members` | 3       | `contact_id → contacts`, `group_id → contact_groups`                                     |
| Calendar | `calendars`             | 11      | `user_id → users`                                                                        |
| Calendar | `calendar_shares`       | 5       | `calendar_id → calendars`, `user_id → users`                                             |
| Calendar | `calendar_events`       | 23      | `calendar_id → calendars`, `organizer_id → users`, `original_event_id → calendar_events` |
| Calendar | `event_reminders`       | 6       | `event_id → calendar_events`                                                             |
| Calendar | `event_attendees`       | 10      | `event_id → calendar_events`, `user_id → users`                                          |
| Calendar | `freebusy_cache`        | 6       | `user_id → users`, `event_id → calendar_events`                                          |
| Chat     | `chat_channels`         | 11      | `organization_id` (implicit), `created_by` (implicit)                                    |
| Chat     | `chat_channel_members`  | 8       | `channel_id → chat_channels`, `user_id → users`                                          |
| Chat     | `chat_messages`         | 12      | `channel_id → chat_channels`, `user_id → users`, `parent_id → chat_messages`             |
| Chat     | `chat_reactions`        | 5       | `message_id → chat_messages`, `user_id → users`                                          |
| Chat     | `chat_attachments`      | 9       | `message_id → chat_messages`                                                             |

**Total: 16 tables** (5 contacts + 6 calendar + 5 chat)
