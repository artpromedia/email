# Contacts Service

CardDAV-compatible contacts service for the Enterprise Email platform, providing ZOHO/Google
Contacts parity.

## Features

- **CardDAV Support (RFC 6352)** - Compatible with Apple Contacts, Thunderbird, Evolution, etc.
- **Contact Management** - Full CRUD with rich contact fields
- **Contact Groups** - Organize contacts into groups/labels
- **Address Books** - Multiple address books per user with sharing
- **vCard Import/Export** - Full vCard 3.0/4.0 support
- **Duplicate Detection** - Find and merge duplicate contacts
- **Photo Support** - Contact photos with storage

## Quick Start

```bash
# Start the service
docker-compose up contacts

# Or run directly
go run main.go -config config.yaml
```

## CardDAV Endpoints

The service implements CardDAV (RFC 6352) for native contacts client compatibility:

```
Base URL: https://contacts.yourdomain.com/carddav/

/carddav/                          - Principal discovery
/carddav/{user}/                   - User principal
/carddav/{user}/addressbooks/      - Address book home
/carddav/{user}/addressbooks/{id}  - Individual address book
```

### Supported CardDAV Methods

- `PROPFIND` - Discover address books and properties
- `PROPPATCH` - Update address book properties
- `MKCOL` - Create new address book
- `REPORT` - Query contacts (addressbook-query, addressbook-multiget, sync-collection)
- `GET/PUT/DELETE` - Individual contact CRUD

### Client Configuration

**Apple Contacts (macOS/iOS)**

1. System Preferences → Internet Accounts → Add Other Account → CardDAV
2. Account Type: Manual
3. Username: your@email.com
4. Password: your-password
5. Server: contacts.yourdomain.com

**Thunderbird**

1. Install CardBook addon
2. Address Book → New Address Book → Remote
3. Type: CardDAV
4. URL: https://contacts.yourdomain.com/carddav/{user}/addressbooks/

## REST API

### Address Books

```bash
# List address books
GET /api/v1/addressbooks

# Create address book
POST /api/v1/addressbooks
{
  "name": "Work Contacts",
  "description": "Professional contacts"
}

# Update address book
PUT /api/v1/addressbooks/{id}

# Delete address book
DELETE /api/v1/addressbooks/{id}

# Share address book
POST /api/v1/addressbooks/{id}/share
{
  "user_id": "uuid",
  "permission": "write"
}
```

### Contacts

```bash
# List contacts
GET /api/v1/contacts?address_book_id={id}&q=search&limit=100

# Create contact
POST /api/v1/contacts
{
  "address_book_id": "uuid",
  "first_name": "John",
  "last_name": "Doe",
  "company": "Acme Inc",
  "job_title": "Software Engineer",
  "emails": [
    {"type": "work", "email": "john@acme.com", "primary": true},
    {"type": "home", "email": "john@personal.com"}
  ],
  "phones": [
    {"type": "mobile", "number": "+1-555-0123", "primary": true}
  ],
  "addresses": [
    {
      "type": "work",
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postal_code": "94102",
      "country": "USA"
    }
  ],
  "birthday": "1990-01-15",
  "notes": "Met at conference",
  "starred": true,
  "groups": ["uuid1", "uuid2"]
}

# Update contact
PUT /api/v1/contacts/{id}

# Delete contact
DELETE /api/v1/contacts/{id}

# Search contacts
GET /api/v1/contacts/search?q=john

# Upload photo
POST /api/v1/contacts/{id}/photo
Content-Type: multipart/form-data

# Import contacts
POST /api/v1/contacts/import
{
  "address_book_id": "uuid",
  "format": "vcard",
  "data": "BEGIN:VCARD..."
}

# Export contacts
GET /api/v1/contacts/export?address_book_id={id}&format=vcard
```

### Groups

```bash
# List groups
GET /api/v1/groups?address_book_id={id}

# Create group
POST /api/v1/groups
{
  "address_book_id": "uuid",
  "name": "VIP Clients",
  "color": "#ef4444"
}

# Add contacts to group
POST /api/v1/groups/{id}/contacts
{
  "contact_ids": ["uuid1", "uuid2"]
}

# Remove contact from group
DELETE /api/v1/groups/{id}/contacts/{contactId}
```

### Duplicate Management

```bash
# Find duplicates
GET /api/v1/contacts/duplicates

# Merge contacts
POST /api/v1/contacts/merge
{
  "primary_id": "uuid-to-keep",
  "merge_ids": ["uuid-to-merge-1", "uuid-to-merge-2"]
}
```

## Contact Fields

| Field             | Description               |
| ----------------- | ------------------------- |
| `prefix`          | Mr., Mrs., Dr., etc.      |
| `first_name`      | Given name                |
| `middle_name`     | Middle name               |
| `last_name`       | Family name               |
| `suffix`          | Jr., Sr., III, etc.       |
| `nickname`        | Nickname                  |
| `company`         | Organization              |
| `department`      | Department                |
| `job_title`       | Title/Position            |
| `emails[]`        | Email addresses with type |
| `phones[]`        | Phone numbers with type   |
| `addresses[]`     | Physical addresses        |
| `urls[]`          | Websites                  |
| `ims[]`           | Instant messaging         |
| `birthday`        | Date of birth             |
| `anniversary`     | Anniversary date          |
| `notes`           | Free-form notes           |
| `categories[]`    | Tags/labels               |
| `custom_fields{}` | Custom key-value pairs    |
| `starred`         | Favorites flag            |

## Import/Export Formats

- **vCard 3.0** - Most compatible
- **vCard 4.0** - Full Unicode support
- **CSV** - Google Contacts format (coming soon)

## Configuration

Environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `PHOTO_STORAGE_PATH`: Path for contact photos
- `DOMAIN`: Your contacts domain

## Architecture

```
┌─────────────┐     ┌──────────────────┐
│  CardDAV    │────▶│                  │
│  Clients    │     │  Contacts        │
└─────────────┘     │  Service         │
                    │                  │
┌─────────────┐     │  ┌────────────┐  │     ┌─────────────┐
│  Web App    │────▶│  │ PostgreSQL │  │────▶│ Photo Store │
└─────────────┘     │  └────────────┘  │     └─────────────┘
                    └──────────────────┘
```
