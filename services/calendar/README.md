# Calendar Service

CalDAV-compatible calendar service for the Enterprise Email platform, providing ZOHO/Google Calendar
parity.

## Features

- **CalDAV Support (RFC 4791)** - Compatible with Apple Calendar, Thunderbird, Evolution, etc.
- **Event Management** - Create, update, delete events with full recurrence support
- **Attendees & Invitations** - Send invites, track RSVPs (iTIP/iMIP)
- **Reminders** - Email and push notifications before events
- **Calendar Sharing** - Share calendars with read/write/admin permissions
- **Free/Busy Queries** - Check availability across users
- **Recurring Events** - Full RRULE support with exception handling

## Quick Start

```bash
# Start the service
docker-compose up calendar

# Or run directly
go run main.go -config config.yaml
```

## CalDAV Endpoints

The service implements CalDAV (RFC 4791) for native calendar client compatibility:

```
Base URL: https://calendar.yourdomain.com/caldav/

/caldav/                      - Principal discovery
/caldav/{user}/               - User principal
/caldav/{user}/calendars/     - Calendar home
/caldav/{user}/calendars/{id} - Individual calendar
```

### Supported CalDAV Methods

- `PROPFIND` - Discover calendars and properties
- `PROPPATCH` - Update calendar properties
- `MKCALENDAR` - Create new calendar
- `REPORT` - Query events (calendar-query, calendar-multiget, sync-collection)
- `GET/PUT/DELETE` - Individual event CRUD

### Client Configuration

**Apple Calendar (macOS/iOS)**

1. System Preferences → Internet Accounts → Add Other Account → CalDAV
2. Account Type: Manual
3. Username: your@email.com
4. Password: your-password
5. Server: calendar.yourdomain.com

**Thunderbird**

1. Calendar → New Calendar → On the Network
2. Format: CalDAV
3. Location: https://calendar.yourdomain.com/caldav/{user}/calendars/

## REST API

### Calendars

```bash
# List calendars
GET /api/v1/calendars

# Create calendar
POST /api/v1/calendars
{
  "name": "Work",
  "color": "#3b82f6",
  "timezone": "America/New_York"
}

# Update calendar
PUT /api/v1/calendars/{id}

# Delete calendar
DELETE /api/v1/calendars/{id}

# Share calendar
POST /api/v1/calendars/{id}/share
{
  "user_id": "uuid",
  "permission": "write"
}
```

### Events

```bash
# List events
GET /api/v1/events?calendar_id={id}&start=2026-01-01&end=2026-01-31

# Create event
POST /api/v1/events
{
  "calendar_id": "uuid",
  "title": "Team Meeting",
  "description": "Weekly sync",
  "start_time": "2026-01-31T10:00:00Z",
  "end_time": "2026-01-31T11:00:00Z",
  "timezone": "America/New_York",
  "location": "Conference Room A",
  "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
  "reminders": [
    {"method": "email", "minutes": 60},
    {"method": "display", "minutes": 15}
  ],
  "attendees": [
    {"email": "colleague@company.com", "name": "John", "role": "req-participant"}
  ]
}

# Update event
PUT /api/v1/events/{id}

# Delete event
DELETE /api/v1/events/{id}

# RSVP to invitation
POST /api/v1/events/{id}/respond
{
  "status": "accepted",
  "comment": "Looking forward to it!"
}

# Search events
GET /api/v1/events/search?q=meeting&start=2026-01-01

# Free/busy query
GET /api/v1/events/freebusy?users=uuid1,uuid2&start=2026-01-31&end=2026-02-01
```

## Recurrence Rules (RRULE)

Supports RFC 5545 recurrence rules:

```
FREQ=DAILY                           # Every day
FREQ=WEEKLY;BYDAY=MO,WE,FR           # Mon, Wed, Fri
FREQ=MONTHLY;BYMONTHDAY=15           # 15th of each month
FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1   # Every Jan 1st
FREQ=WEEKLY;COUNT=10                  # 10 occurrences
FREQ=DAILY;UNTIL=20261231T235959Z    # Until date
```

## Invitation Flow

1. **Organizer creates event** with attendees
2. **System sends iTIP INVITE** emails
3. **Attendees respond** (accept/decline/tentative)
4. **System sends iTIP REPLY** to organizer
5. **Organizer updates** → System sends iTIP UPDATE
6. **Organizer cancels** → System sends iTIP CANCEL

## Configuration

Environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `SMTP_HOST`: SMTP server for notifications
- `DOMAIN`: Your email domain

## Architecture

```
┌─────────────┐     ┌──────────────────┐
│  CalDAV     │────▶│                  │
│  Clients    │     │  Calendar        │
└─────────────┘     │  Service         │
                    │                  │
┌─────────────┐     │  ┌────────────┐  │     ┌─────────────┐
│  Web App    │────▶│  │ PostgreSQL │  │────▶│ SMTP Server │
└─────────────┘     │  └────────────┘  │     └─────────────┘
                    └──────────────────┘
```
