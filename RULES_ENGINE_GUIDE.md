# Rules Engine Implementation

## Overview

The CEERION Rules Engine is a deterministic, observable system for automatically processing email messages based on user-defined conditions and actions. It provides a comprehensive solution for email automation with safety controls, metrics collection, and audit logging.

## Architecture

### Core Components

1. **Types & Schemas** (`src/services/rules/types.ts`)
   - Comprehensive Zod schemas for conditions and actions
   - Type-safe interfaces for all engine components
   - Validation for rule structure and parameters

2. **Condition Matcher** (`src/services/rules/matcher.ts`)
   - Text normalization with case-insensitive matching
   - Support for multiple operators (equals, contains, regex, etc.)
   - Diacritics removal for international text support

3. **Action Executor** (`src/services/rules/executor.ts`)
   - Idempotent action execution
   - Safety controls (stop-on-delete)
   - Dry-run mode for testing

4. **Main Engine** (`src/services/rules/engine.ts`)
   - Rule orchestration and batch processing
   - Metrics collection and performance tracking
   - Audit logging for compliance

5. **Metrics System** (`src/services/rules/metrics.ts`)
   - Performance tracking without external dependencies
   - Execution statistics and timing data

6. **API Routes** (`src/routes/rules.ts`)
   - Complete CRUD operations for rules
   - Background job management
   - Authentication and authorization

## Database Schema

### Core Tables

```sql
-- Rules table
model Rule {
  id          String    @id @default(cuid())
  userId      String
  name        String
  conditions  Json      // Array of Condition objects
  actions     Json      // Array of Action objects
  triggers    String[]  // When to run: ['on-receive', 'manual']
  priority    Int       @default(1)
  isEnabled   Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

-- Execution tracking
model RuleExecution {
  id          String    @id @default(cuid())
  ruleId      String
  messageId   String
  userId      String
  status      String    // 'success', 'failure', 'skipped'
  // ... additional fields
}

-- Audit logging
model RuleAuditLog {
  id          String    @id @default(cuid())
  ruleId      String?
  userId      String
  action      String    // 'created', 'updated', 'deleted', 'executed'
  // ... additional fields
}

-- Background jobs
model RuleJobQueue {
  id            String     @id @default(cuid())
  userId        String
  status        String     // 'pending', 'running', 'completed', 'failed'
  // ... additional fields
}
```

## Condition Types & Operators

### Text-based Conditions

- **from, to, cc, subject, body**: Support all text operators
  - `equals`: Exact match
  - `contains`: Substring match
  - `starts_with`: Prefix match
  - `ends_with`: Suffix match
  - `matches_regex`: Regular expression match

### Specialized Conditions

- **sender_domain**: Extract domain from sender email
- **has_attachments**: Boolean check for attachments
- **date_received**: Date comparisons (before, after, between)
- **priority**: Exact priority level match
- **folder**: Current folder location

### Example Condition

```json
{
  "id": "cond-1",
  "type": "subject",
  "operator": "contains",
  "value": "Invoice",
  "caseSensitive": false
}
```

## Action Types

### Message Management

- **move_to_folder**: Move message to specified folder
- **delete**: Move to trash (stops further action execution)
- **archive**: Move to archive folder

### Labeling

- **add_label**: Add label to message (creates if needed)
- **remove_label**: Remove label from message

### Status Updates

- **mark_as_read**: Mark message as read
- **mark_as_unread**: Mark message as unread
- **mark_as_important**: Flag as important
- **mark_as_spam**: Mark as spam

### Advanced Actions

- **forward_to**: Forward message to email address
- **auto_reply**: Send automatic reply
- **add_note**: Add note to message
- **set_priority**: Change message priority
- **snooze**: Snooze message until specified time
- **add_to_calendar**: Create calendar event

### Example Action

```json
{
  "id": "action-1",
  "type": "move_to_folder",
  "value": "finance"
}
```

## API Endpoints

### Rule Management

- `GET /api/rules` - List all rules for user
- `POST /api/rules` - Create new rule
- `PUT /api/rules/:id` - Update existing rule
- `DELETE /api/rules/:id` - Delete rule

### Rule Execution

- `POST /api/rules/run` - Run rules on existing mail (background job)
- `GET /api/rules/jobs/:jobId` - Get job status
- `GET /api/rules/metrics` - Get execution metrics

## Usage Examples

### 1. Auto-categorize Invoices

```json
{
  "name": "Invoice Processing",
  "conditions": [
    {
      "type": "subject",
      "operator": "contains",
      "value": "invoice",
      "caseSensitive": false
    }
  ],
  "actions": [
    {
      "type": "move_to_folder",
      "value": "finance"
    },
    {
      "type": "add_label",
      "value": "invoices"
    }
  ],
  "triggers": ["on-receive"],
  "priority": 1
}
```

### 2. Newsletter Management

```json
{
  "name": "Newsletter Filter",
  "conditions": [
    {
      "type": "body",
      "operator": "contains",
      "value": "unsubscribe",
      "caseSensitive": false
    }
  ],
  "actions": [
    {
      "type": "move_to_folder",
      "value": "newsletters"
    },
    {
      "type": "mark_as_read"
    }
  ],
  "triggers": ["on-receive"]
}
```

### 3. VIP Sender Rules

```json
{
  "name": "VIP Processing",
  "conditions": [
    {
      "type": "sender_domain",
      "operator": "equals",
      "value": "important-client.com",
      "caseSensitive": false
    }
  ],
  "actions": [
    {
      "type": "mark_as_important"
    },
    {
      "type": "add_label",
      "value": "vip"
    }
  ],
  "triggers": ["on-receive"],
  "priority": 10
}
```

## Testing

### Unit Tests

Run comprehensive unit tests covering all condition/action combinations:

```bash
cd apps/api
pnpm test
```

The test suite validates:

- All condition types with their supported operators
- Action execution with safety controls
- Idempotent behavior
- Dry-run functionality
- Error handling

### Integration Testing

Test with real database and message processing:

```bash
pnpm test:integration
```

## Performance & Safety

### Safety Controls

1. **Idempotent Actions**: No duplicate operations (e.g., moving to same folder)
2. **Stop-on-Delete**: Execution stops after delete action
3. **Dry-run Mode**: Test rules without making changes
4. **Rate Limiting**: Built-in processing limits

### Performance Features

1. **Batch Processing**: Process messages in configurable batches
2. **Priority Ordering**: Higher priority rules execute first
3. **Metrics Collection**: Track execution times and success rates
4. **Background Jobs**: Long-running operations don't block API

### Monitoring

- Execution metrics available via `/api/rules/metrics`
- Audit logs for all rule changes and executions
- Job status tracking for background operations

## Configuration

### Environment Variables

```env
# Rules engine batch size (default: 100)
RULES_ENGINE_BATCH_SIZE=100

# Processing delay between batches in ms (default: 10)
RULES_ENGINE_BATCH_DELAY=10
```

### Database Initialization

The rules engine requires the following database tables:

- Rule
- RuleExecution
- RuleAuditLog
- RuleJobQueue

Run migrations to create the required schema:

```bash
pnpx prisma migrate dev
```

## Troubleshooting

### Common Issues

1. **Rules not executing**: Check that `isEnabled: true` and triggers match
2. **Performance issues**: Reduce batch size or increase delay
3. **Condition not matching**: Verify case sensitivity and operator choice
4. **Actions failing**: Check logs in `RuleAuditLog` table

### Debug Mode

Enable detailed logging by setting the log level to debug in your Fastify configuration.

## Future Enhancements

1. **OR Logic**: Support for OR conditions in addition to AND
2. **Template Actions**: Reusable action templates
3. **Rule Templates**: Pre-built rules for common scenarios
4. **Machine Learning**: Suggested rules based on user behavior
5. **Advanced Scheduling**: Time-based rule activation

## Implementation Status

✅ **Completed**

- Complete rule schema with all condition/action types
- Core engine with condition matching and action execution
- Database schema and migrations
- API endpoints for CRUD operations
- Background job processing
- Comprehensive unit tests
- Safety controls and idempotent operations
- Metrics collection and audit logging

🔄 **In Progress**

- Integration tests with real database
- Performance optimization
- Enhanced error handling

📋 **Planned**

- Web UI for rule management
- Rule templates and sharing
- Advanced reporting and analytics
