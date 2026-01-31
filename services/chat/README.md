# Chat Service

Internal team communication service with Slack-like features for the Enterprise Email Platform.

## Features

- **Real-time Messaging**: WebSocket-based instant messaging
- **Channels**: Public and private channels for team collaboration
- **Direct Messages**: One-on-one private conversations
- **Threads**: Reply to messages to create threaded conversations
- **Reactions**: Emoji reactions on messages
- **File Sharing**: Upload and share files in conversations
- **Typing Indicators**: See when others are typing
- **Presence**: Online/away/DND status for team members
- **Message Search**: Full-text search across messages
- **Pinned Messages**: Pin important messages in channels
- **Read Receipts**: Track unread messages and mark as read

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Chat Service                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   REST API  │  │  WebSocket  │  │   Metrics   │         │
│  │   :8086     │  │    Hub      │  │    :9094    │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
│         │                │                                  │
│         ▼                ▼                                  │
│  ┌─────────────────────────────────────────────┐           │
│  │              Repository Layer               │           │
│  └─────────────────────────────────────────────┘           │
│         │                │                                  │
│         ▼                ▼                                  │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │  PostgreSQL │  │    Redis    │                          │
│  │  (Messages) │  │  (Presence) │                          │
│  └─────────────┘  └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Channels

| Method | Endpoint                               | Description                  |
| ------ | -------------------------------------- | ---------------------------- |
| GET    | `/api/v1/channels`                     | List all accessible channels |
| POST   | `/api/v1/channels`                     | Create a new channel         |
| GET    | `/api/v1/channels/joined`              | List joined channels         |
| GET    | `/api/v1/channels/:id`                 | Get channel details          |
| PUT    | `/api/v1/channels/:id`                 | Update channel               |
| DELETE | `/api/v1/channels/:id`                 | Delete channel               |
| POST   | `/api/v1/channels/:id/join`            | Join a channel               |
| POST   | `/api/v1/channels/:id/leave`           | Leave a channel              |
| GET    | `/api/v1/channels/:id/members`         | List channel members         |
| POST   | `/api/v1/channels/:id/members`         | Add member to channel        |
| DELETE | `/api/v1/channels/:id/members/:userId` | Remove member                |
| POST   | `/api/v1/channels/:id/read`            | Mark channel as read         |

### Messages

| Method | Endpoint                               | Description              |
| ------ | -------------------------------------- | ------------------------ |
| GET    | `/api/v1/channels/:id/messages`        | List messages in channel |
| POST   | `/api/v1/channels/:id/messages`        | Send message to channel  |
| GET    | `/api/v1/channels/:id/messages/pinned` | Get pinned messages      |
| GET    | `/api/v1/messages/:id`                 | Get message details      |
| PUT    | `/api/v1/messages/:id`                 | Edit message             |
| DELETE | `/api/v1/messages/:id`                 | Delete message           |
| POST   | `/api/v1/messages/:id/pin`             | Pin message              |
| DELETE | `/api/v1/messages/:id/pin`             | Unpin message            |
| GET    | `/api/v1/messages/:id/thread`          | Get thread replies       |
| POST   | `/api/v1/messages/:id/thread`          | Reply to thread          |

### Reactions

| Method | Endpoint                                | Description     |
| ------ | --------------------------------------- | --------------- |
| POST   | `/api/v1/messages/:id/reactions`        | Add reaction    |
| DELETE | `/api/v1/messages/:id/reactions/:emoji` | Remove reaction |

### Direct Messages

| Method | Endpoint             | Description           |
| ------ | -------------------- | --------------------- |
| POST   | `/api/v1/dm`         | Start DM conversation |
| GET    | `/api/v1/dm/:userId` | Get DM with user      |

### Users & Presence

| Method | Endpoint                 | Description             |
| ------ | ------------------------ | ----------------------- |
| GET    | `/api/v1/users`          | List organization users |
| GET    | `/api/v1/users/:id`      | Get user details        |
| GET    | `/api/v1/users/presence` | Get online users        |
| PUT    | `/api/v1/users/status`   | Update your status      |

### Search

| Method | Endpoint                 | Description     |
| ------ | ------------------------ | --------------- |
| GET    | `/api/v1/search?q=query` | Search messages |

### File Upload

| Method | Endpoint         | Description            |
| ------ | ---------------- | ---------------------- |
| POST   | `/api/v1/upload` | Upload file attachment |

## WebSocket Events

Connect to WebSocket: `ws://localhost:8086/ws?token=<jwt-token>`

### Client → Server Events

```json
// Subscribe to channel
{ "type": "subscribe", "channel_id": "uuid" }

// Unsubscribe from channel
{ "type": "unsubscribe", "channel_id": "uuid" }

// Send typing indicator
{ "type": "typing", "channel_id": "uuid", "payload": { "is_typing": true } }

// Ping (keep-alive)
{ "type": "ping" }
```

### Server → Client Events

```json
// New message
{
  "type": "message",
  "channel_id": "uuid",
  "payload": { /* message object */ },
  "timestamp": "2024-01-15T10:30:00Z"
}

// Message updated
{
  "type": "message_update",
  "channel_id": "uuid",
  "payload": { /* updated message */ },
  "timestamp": "2024-01-15T10:30:00Z"
}

// Message deleted
{
  "type": "message_delete",
  "channel_id": "uuid",
  "payload": { "id": "message-uuid" },
  "timestamp": "2024-01-15T10:30:00Z"
}

// Typing indicator
{
  "type": "typing",
  "channel_id": "uuid",
  "payload": { "user_id": "uuid", "is_typing": true },
  "timestamp": "2024-01-15T10:30:00Z"
}

// Presence update
{
  "type": "presence",
  "payload": { "user_id": "uuid", "status": "online" },
  "timestamp": "2024-01-15T10:30:00Z"
}

// Reaction added/removed
{
  "type": "reaction",
  "channel_id": "uuid",
  "payload": { "message_id": "uuid", "emoji": "👍", "action": "add" },
  "timestamp": "2024-01-15T10:30:00Z"
}

// Pong response
{ "type": "pong", "timestamp": "2024-01-15T10:30:00Z" }
```

## Configuration

Environment variables:

| Variable            | Description                              | Default                 |
| ------------------- | ---------------------------------------- | ----------------------- |
| `CHAT_PORT`         | HTTP server port                         | `8086`                  |
| `LOG_LEVEL`         | Logging level (debug, info, warn, error) | `info`                  |
| `DATABASE_URL`      | PostgreSQL connection URL                | Required                |
| `REDIS_ADDR`        | Redis address                            | `localhost:6379`        |
| `REDIS_PASSWORD`    | Redis password                           | Optional                |
| `JWT_SECRET`        | JWT signing secret                       | Required                |
| `AUTH_SERVICE_URL`  | Auth service URL                         | `http://localhost:8080` |
| `S3_ENDPOINT`       | MinIO/S3 endpoint                        | `http://localhost:9000` |
| `S3_ACCESS_KEY`     | S3 access key                            | Required                |
| `S3_SECRET_KEY`     | S3 secret key                            | Required                |
| `CHAT_BUCKET`       | S3 bucket for files                      | `chat-files`            |
| `CHAT_METRICS_PORT` | Prometheus metrics port                  | `9094`                  |

## Development

### Prerequisites

- Go 1.22+
- PostgreSQL 16+
- Redis 7+
- MinIO or S3-compatible storage

### Running Locally

```bash
# Start dependencies
docker-compose up -d postgres redis minio

# Run migrations
psql $DATABASE_URL < ../database/src/migrations/006_create_chat_tables.sql

# Run the service
go run main.go -config config.yaml
```

### Running Tests

```bash
# Unit tests
go test ./...

# With coverage
go test -cover ./...

# Integration tests (requires running database)
go test -v -tags=integration ./...
```

### Building

```bash
# Build binary
go build -o chat ./main.go

# Build Docker image
docker build -t chat-service .
```

## Database Schema

See
[migrations/006_create_chat_tables.sql](../../packages/database/src/migrations/006_create_chat_tables.sql)

### Tables

- `chat_channels` - Channels (public, private, direct)
- `chat_channel_members` - Channel membership
- `chat_messages` - Messages with threading support
- `chat_attachments` - File attachments
- `chat_reactions` - Emoji reactions
- `chat_notifications` - User notifications

## Metrics

Prometheus metrics available at `:9094/metrics`:

- `chat_websocket_connections` - Active WebSocket connections
- `chat_messages_sent_total` - Total messages sent
- `chat_messages_by_channel` - Messages per channel
- `chat_api_requests_total` - API request count
- `chat_api_request_duration_seconds` - API request latency

## Security

- All API endpoints require JWT authentication
- WebSocket connections authenticated via token query parameter
- Channel access controlled by membership
- Private channels require invitation
- Direct messages limited to 2 participants
- File uploads validated and virus-scanned
- Rate limiting on message sending

## Roadmap

- [ ] Message formatting (Markdown, code blocks)
- [ ] @mentions with notifications
- [ ] Channel-specific settings
- [ ] Message scheduling
- [ ] Message reminders
- [ ] Integrations (GitHub, Jira, etc.)
- [ ] Voice/video calls (WebRTC)
- [ ] Screen sharing
- [ ] Bots and automation
