# AI Assistant Service

Enterprise email AI assistant service providing email analysis, smart replies, and semantic search capabilities.

## Features

- **Email Analysis** (`POST /api/v1/ai/analyze`)
  - Summary generation
  - Sentiment detection (positive/neutral/negative/mixed)
  - Priority scoring (0.0 - 1.0)
  - Intent classification
  - Action item extraction
  - Question detection
  - Response requirement analysis

- **Embedding Generation** (`POST /api/v1/ai/embeddings`)
  - Vector embeddings for semantic search
  - 1536-dimension vectors (OpenAI ada-002 compatible)
  - Content-hash based caching
  - Batch processing support

- **Multi-Provider Support**
  - OpenAI (GPT-4, GPT-3.5, ada-002)
  - Anthropic (Claude 3)
  - Ollama (local models)
  - Automatic failover and retry
  - Provider health monitoring

## Configuration

Environment variables:

```bash
# Server
PORT=8090
ENVIRONMENT=development

# Redis (required for caching)
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenAI
OPENAI_ENABLED=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002

# Anthropic (optional)
ANTHROPIC_ENABLED=false
ANTHROPIC_API_KEY=sk-ant-...

# Ollama (optional, for local models)
OLLAMA_ENABLED=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Rate Limiting
RATE_LIMIT_ORG_TOKENS_PER_MIN=100000
RATE_LIMIT_USER_TOKENS_PER_MIN=10000
```

## API Endpoints

### Health Check
```
GET /health
GET /health/ready
```

### Email Analysis
```
POST /api/v1/ai/analyze
Content-Type: application/json

{
  "email_id": "uuid",
  "subject": "Meeting Tomorrow",
  "body": "Hi, can we reschedule our meeting to 3pm?",
  "from_address": "sender@example.com",
  "from_name": "John Doe",
  "to_addresses": ["recipient@example.com"],
  "date": "2024-01-15T10:00:00Z",
  "user_id": "uuid",
  "org_id": "uuid",
  "user_name": "Jane Smith",
  "user_email": "recipient@example.com",
  "extract_action_items": true,
  "detect_questions": true
}
```

Response:
```json
{
  "summary": "John Doe is requesting to reschedule a meeting to 3pm tomorrow.",
  "sentiment": "neutral",
  "priority": 0.6,
  "intent": "scheduling",
  "category": "meeting",
  "action_items": [
    {
      "id": "1",
      "description": "Respond to meeting reschedule request",
      "priority": "medium"
    }
  ],
  "questions_asked": ["can we reschedule our meeting to 3pm?"],
  "requires_response": true,
  "model": "gpt-4-turbo-preview",
  "provider": "openai",
  "cached": false,
  "latency_ms": 1234
}
```

### Generate Embedding
```
POST /api/v1/ai/embeddings
Content-Type: application/json

{
  "id": "email-uuid",
  "text": "Email content to embed...",
  "org_id": "uuid",
  "user_id": "uuid"
}
```

### Batch Embeddings
```
POST /api/v1/ai/embeddings/batch
Content-Type: application/json

{
  "items": [
    {"id": "email-1", "text": "First email..."},
    {"id": "email-2", "text": "Second email..."}
  ],
  "org_id": "uuid",
  "user_id": "uuid"
}
```

### Usage Statistics
```
GET /api/v1/usage?org_id=uuid&user_id=uuid
```

### Provider Status
```
GET /api/v1/providers/status
```

## Rate Limiting

- Per-organization: 100,000 tokens/min, 1,000 requests/min
- Per-user: 10,000 tokens/min, 100 requests/min
- Burst allowance: 1.5x limit
- Graceful degradation at 80% capacity

## Caching Strategy

- **Analysis**: 24-hour TTL by content hash
- **Embeddings**: 7-day TTL (stable content)
- Cache invalidation on email update via:
  - `DELETE /api/v1/cache/analysis/{emailID}`
  - `DELETE /api/v1/cache/embeddings/{id}`

## Error Handling

The service implements:
- Automatic retry with exponential backoff
- Provider failover (OpenAI → Anthropic → Ollama)
- **Never blocks email delivery on AI failure**
- Returns graceful fallback responses when AI is unavailable

## Docker

```bash
# Build
docker build -t ai-assistant .

# Run
docker run -p 8090:8090 \
  -e OPENAI_API_KEY=sk-... \
  -e REDIS_HOST=redis \
  ai-assistant
```

## Metrics

Prometheus metrics available at `/metrics`:
- `ai_requests_total` - Total AI requests by provider/feature
- `ai_request_duration_seconds` - Request latency histogram
- `ai_tokens_used_total` - Token usage by provider
- `ai_cache_hits_total` - Cache hit rate
- `ai_provider_health` - Provider availability gauge
