# Production Readiness - Prompt Sprints

## Critical Blocker Resolution Plan

Based on the QA assessment, these are focused prompt sprints to address each critical blocker. Copy and paste each sprint prompt to Claude Code to implement the fix.

---

## 🔴 SPRINT 1: Test Infrastructure Setup (Foundation)

**Priority:** CRITICAL - Must be done first
**Estimated Scope:** ~500 lines of test infrastructure

### Sprint 1A: Go Test Infrastructure

```
Set up Go testing infrastructure for the email platform services.

Tasks:
1. Create test utilities in services/smtp-server/testutil/testutil.go:
   - Mock Redis client interface
   - Mock database interface
   - Test fixtures for Message, Domain, Mailbox types
   - Helper functions for creating test contexts

2. Create test utilities in services/auth/internal/testutil/testutil.go:
   - Mock repository interface
   - Mock token service
   - Test fixtures for User, Organization, Domain models
   - Helper for creating authenticated test contexts

3. Create test utilities in services/ai-assistant/testutil/testutil.go:
   - Mock LLM provider interface
   - Mock ML classifier interface
   - Mock Redis client
   - Test fixtures for SpamCheckRequest, OrgSpamSettings

4. Add test dependencies to go.mod files:
   - github.com/stretchr/testify
   - github.com/DATA-DOG/go-sqlmock (for database mocking)
   - github.com/go-redis/redismock/v9 (for Redis mocking)

Do not write actual tests yet - just the infrastructure and mocks.
```

### Sprint 1B: TypeScript Test Infrastructure

```
Set up TypeScript/Jest testing infrastructure for the web application.

Tasks:
1. Install test dependencies in apps/web/package.json:
   - jest
   - @testing-library/react
   - @testing-library/jest-dom
   - @types/jest
   - jest-environment-jsdom

2. Create apps/web/jest.config.js with Next.js configuration

3. Create apps/web/src/test-utils/index.tsx:
   - Custom render function with providers (theme, auth context)
   - Mock fetch utilities
   - Mock Next.js router
   - Common test fixtures

4. Add test script to package.json: "test": "jest"

Do not write actual tests yet - just the infrastructure.
```

---

## 🔴 SPRINT 2: Core Service Unit Tests

**Priority:** CRITICAL
**Estimated Scope:** ~1500 lines of tests

### Sprint 2A: SMTP Queue Worker Tests

```
Create comprehensive unit tests for the SMTP queue worker (services/smtp-server/queue/worker.go).

File to create: services/smtp-server/queue/worker_test.go

Test cases to implement:

1. TestWorker_ProcessMessage_LocalDelivery
   - Test successful local delivery to a mailbox
   - Test delivery with quota check passing
   - Test delivery when quota exceeded (should error)
   - Test delivery to alias (recursive delivery)
   - Test delivery to distribution list (multi-recipient)

2. TestWorker_ProcessMessage_ExternalDelivery
   - Test successful external delivery via SMTP
   - Test MX lookup failure handling
   - Test connection timeout handling
   - Test STARTTLS upgrade success and failure

3. TestWorker_ProcessMessage_RetryLogic
   - Test retry scheduling when delivery fails
   - Test max retries exceeded triggers bounce
   - Test bounce message not generated for bounce messages (null sender)

4. TestWorker_GenerateBounceMessage
   - Test bounce message format compliance with RFC 3464
   - Test bounce message contains original headers
   - Test bounce message has correct MIME structure

5. TestWorker_DeliverToMailbox
   - Test recipient lookup (mailbox, alias, distribution list)
   - Test catch-all handling when recipient not found
   - Test reject unknown users policy

Use table-driven tests where appropriate. Mock the Manager interface.
```

### Sprint 2B: Auth Service Tests

```
Create comprehensive unit tests for the auth service (services/auth/internal/service/auth_service.go).

File to create: services/auth/internal/service/auth_service_test.go

Test cases to implement:

1. TestAuthService_Register
   - Test successful user registration
   - Test registration with unverified domain (should fail)
   - Test registration with existing email (should fail)
   - Test password validation against org policy
   - Test mailbox creation during registration

2. TestAuthService_Login
   - Test successful login with valid credentials
   - Test login with invalid password
   - Test login with locked account
   - Test login with disabled account
   - Test login with SSO enforced domain (should fail)
   - Test login with MFA required (returns pending state)
   - Test login with valid MFA code

3. TestAuthService_RefreshToken
   - Test successful token refresh
   - Test refresh with expired token
   - Test refresh with revoked session
   - Test refresh with disabled user

4. TestAuthService_MFA
   - Test TOTP code validation
   - Test MFA pending token generation

5. TestAuthService_EmailManagement
   - Test adding email to user
   - Test email verification
   - Test setting primary email
   - Test deleting email (non-primary)
   - Test cannot delete primary email

Use mockery or manual mocks for repository and token service.
```

### Sprint 2C: Spam Detection Service Tests

```
Create comprehensive unit tests for the spam detection service (services/ai-assistant/spam/service.go).

File to create: services/ai-assistant/spam/service_test.go

Test cases to implement:

1. TestSpamService_CheckSpam_AllowBlockLists
   - Test sender on allow list returns ham immediately
   - Test sender on block list returns spam immediately
   - Test domain-level allow/block list matching

2. TestSpamService_QuickLayer
   - Test IP reputation scoring from DNSBL
   - Test IP blacklist hit adds to score
   - Test SPF fail/softfail scoring
   - Test DKIM missing/fail scoring
   - Test DMARC fail scoring
   - Test domain blacklist hit

3. TestSpamService_RulesLayer
   - Test spam keyword detection and scoring
   - Test urgency pattern matching
   - Test suspicious URL detection (shorteners, IP-based, bad TLDs)
   - Test excessive capitalization detection
   - Test suspicious attachment detection (.exe, .scr, etc.)
   - Test display name mismatch (brand spoofing)
   - Test minimal body with attachments

4. TestSpamService_MLLayer
   - Test ML classifier invocation
   - Test graceful handling when ML not configured
   - Test classification error handling

5. TestSpamService_LLMLayer
   - Test LLM invocation for uncertain scores
   - Test LLM skipped when score is definitive
   - Test LLM prompt construction
   - Test LLM response parsing

6. TestSpamService_VerdictDetermination
   - Test threshold calculations for low/medium/high settings
   - Test verdict mapping (ham, spam, suspicious, quarantine)
   - Test confidence calculation from layer agreement

7. TestSpamService_HelperFunctions
   - Test extractDomain
   - Test extractURLs
   - Test isIPBasedURL
   - Test calculateCapsRatio
   - Test isSuspiciousAttachment
   - Test reverseIP

Use table-driven tests. Include edge cases like empty strings, malformed input.
```

---

## 🔴 SPRINT 3: Integration Tests

**Priority:** CRITICAL
**Estimated Scope:** ~800 lines of tests

### Sprint 3A: SMTP Delivery Integration Tests

```
Create integration tests for end-to-end SMTP delivery flow.

File to create: services/smtp-server/integration_test.go

Prerequisites:
- Use testcontainers-go for PostgreSQL and Redis
- Create test fixtures in services/smtp-server/testdata/

Test cases:

1. TestIntegration_LocalDelivery_EndToEnd
   - Set up test domain, mailbox, user
   - Enqueue a message for local delivery
   - Verify message appears in mailbox storage
   - Verify mailbox usage updated
   - Verify message recorded in messages table

2. TestIntegration_ExternalDelivery_EndToEnd
   - Set up test domain with DKIM key
   - Enqueue message for external delivery
   - Use mock SMTP server to receive
   - Verify DKIM signature present
   - Verify proper SMTP protocol followed

3. TestIntegration_QueueRetry
   - Enqueue message with unreachable destination
   - Verify retry scheduled with backoff
   - Simulate continued failures
   - Verify bounce generated after max retries

4. TestIntegration_RateLimiting
   - Configure rate limit for domain
   - Send messages up to limit
   - Verify messages beyond limit are queued/delayed

Build tag: //go:build integration
```

### Sprint 3B: Auth Flow Integration Tests

```
Create integration tests for authentication flows.

File to create: services/auth/integration_test.go

Prerequisites:
- Use testcontainers-go for PostgreSQL
- Seed test organization and domain

Test cases:

1. TestIntegration_RegistrationFlow
   - Register new user
   - Verify user in database
   - Verify email address created
   - Verify mailbox created
   - Verify tokens returned and valid

2. TestIntegration_LoginFlow
   - Create test user with known password
   - Login with correct credentials
   - Verify session created
   - Verify tokens work for API access

3. TestIntegration_MFAFlow
   - Create user with MFA enabled
   - Attempt login, get MFA pending
   - Submit valid TOTP code
   - Verify full access granted

4. TestIntegration_SessionManagement
   - Login from multiple devices
   - List sessions
   - Revoke specific session
   - Verify revoked session cannot refresh

Build tag: //go:build integration
```

---

## 🟠 SPRINT 4: Fix Size Limit Mismatches

**Priority:** HIGH
**Estimated Scope:** ~50 lines of changes

```
Fix the message size limit mismatches across the platform.

Current state (MISMATCHED):
- SMTP config default: 52428800 (50MB) in services/smtp-server/config/config.go:153
- Database schema default: 26214400 (25MB) in services/smtp-server/migrations/001_initial_schema.sql:15

Tasks:

1. Standardize on 25MB as the default limit (matches Gmail/industry standard):
   - Update services/smtp-server/config/config.go line 153:
     Change MaxMessageSize from 52428800 to 26214400

2. Add configuration validation to ensure consistency:
   - In services/smtp-server/config/config.go, add a Validate() method that:
     - Warns if MaxMessageSize exceeds 50MB (unusual)
     - Errors if MaxMessageSize exceeds 100MB (unreasonable)

3. Update the SMTP server to enforce size limit during DATA phase:
   - In services/smtp-server/smtp/server.go (or equivalent), verify size limit
     is checked when receiving message data, not just in config

4. Add size limit to API documentation:
   - Document that per-domain limits can override the server default
   - Document that max_message_size in domains table takes precedence

5. Create a migration to update any domains with inconsistent limits:
   - File: services/smtp-server/migrations/002_fix_size_limits.sql
   - Update domains where max_message_size > 26214400 to use the new default
     (only if they still have the old default of 50MB)

Verify the fix by checking all places where message size is validated.
```

---

## 🟠 SPRINT 5: Redis-Based Rate Limiting

**Priority:** HIGH
**Estimated Scope:** ~200 lines of changes

```
Migrate rate limiting from in-memory Map to Redis for horizontal scaling.

Current state: apps/web/src/middleware.ts uses an in-memory Map (line 14)

Tasks:

1. Create a Redis rate limiter utility:
   File: packages/utils/src/rate-limiter.ts

   Implement sliding window rate limiting using Redis:
   - Use MULTI/EXEC for atomic operations
   - Key format: ratelimit:{identifier}:{window}
   - Store: count and window expiry
   - Support configurable windows and limits

   Interface:
   ```typescript
   interface RateLimiter {
     check(identifier: string, limit: number, windowMs: number): Promise<{
       allowed: boolean;
       remaining: number;
       resetAt: number;
     }>;
   }
   ```

2. Create Redis client singleton:
   File: packages/utils/src/redis.ts
   - Use ioredis package
   - Configure from environment: REDIS_URL or REDIS_HOST/PORT
   - Connection pooling
   - Graceful error handling (fallback to allow if Redis down)

3. Update middleware to use Redis rate limiter:
   File: apps/web/src/middleware.ts
   - Import the new rate limiter
   - Replace Map-based logic with Redis calls
   - Keep the in-memory Map as fallback if Redis unavailable
   - Add X-RateLimit-Remaining and X-RateLimit-Reset headers

4. Add rate limiter tests:
   File: packages/utils/src/rate-limiter.test.ts
   - Test normal rate limiting flow
   - Test window expiry
   - Test concurrent requests
   - Test Redis failure fallback

5. Update docker-compose.yml to ensure Redis is available for web app

6. Add environment variables to .env.example:
   - REDIS_URL=redis://localhost:6379
   - RATE_LIMIT_REDIS_ENABLED=true
```

---

## 🟠 SPRINT 6: Enhanced Bounce Handling (DSN)

**Priority:** MEDIUM
**Estimated Scope:** ~300 lines of changes

```
Enhance bounce handling to be fully RFC 3461-3464 compliant.

Current state: Basic bounce in services/smtp-server/queue/worker.go (lines 386-537)

Tasks:

1. Create DSN (Delivery Status Notification) types:
   File: services/smtp-server/dsn/types.go

   ```go
   type BounceType string
   const (
       BounceHard   BounceType = "hard"   // Permanent failure
       BounceSoft   BounceType = "soft"   // Temporary failure
       BouncePolicy BounceType = "policy" // Policy rejection
   )

   type DSNReport struct {
       ReportingMTA    string
       ArrivalDate     time.Time
       FinalRecipients []RecipientStatus
       OriginalMessage []byte
   }

   type RecipientStatus struct {
       FinalRecipient string
       Action         string // failed, delayed, delivered, relayed, expanded
       Status         string // X.Y.Z format per RFC 3463
       DiagnosticCode string
       RemoteMTA      string
   }
   ```

2. Create DSN generator:
   File: services/smtp-server/dsn/generator.go

   - Generate proper multipart/report MIME structure
   - Include message/delivery-status part
   - Include original message headers (or full message if small)
   - Proper RFC 3464 status codes

3. Classify bounce types:
   File: services/smtp-server/dsn/classifier.go

   Classify SMTP errors into bounce types:
   - 5xx = hard bounce
   - 4xx = soft bounce
   - Specific codes: 550 = mailbox not found, 552 = quota exceeded, etc.

4. Update worker to use new DSN system:
   File: services/smtp-server/queue/worker.go

   - Replace bounceTemplate with DSN generator
   - Track bounce type for analytics
   - Don't bounce soft failures immediately (retry first)

5. Add bounce tracking to database:
   File: services/smtp-server/migrations/003_bounce_tracking.sql

   ```sql
   CREATE TABLE bounces (
       id UUID PRIMARY KEY,
       original_message_id VARCHAR(255),
       bounce_type VARCHAR(20),
       recipient_email VARCHAR(255),
       status_code VARCHAR(10),
       diagnostic_message TEXT,
       remote_mta VARCHAR(255),
       created_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE INDEX idx_bounces_recipient ON bounces(recipient_email);
   ```

6. Add tests for DSN generation:
   File: services/smtp-server/dsn/generator_test.go
   - Verify RFC 3464 compliance
   - Test all bounce types
   - Test status code formatting
```

---

## 🟢 SPRINT 7: Frontend Component Tests

**Priority:** MEDIUM
**Estimated Scope:** ~600 lines of tests

```
Create unit tests for critical frontend components.

Prerequisites: Sprint 1B completed (test infrastructure)

Files to create:

1. apps/web/src/middleware.test.ts
   - Test rate limiting logic
   - Test security header application
   - Test CSRF validation
   - Test path matching

2. apps/web/src/components/mail/compose/EmailCompose.test.tsx
   - Test form rendering
   - Test recipient input handling
   - Test attachment handling
   - Test draft saving
   - Test send submission

3. apps/web/src/components/mail/MailSidebar.test.tsx
   - Test folder rendering
   - Test unread counts
   - Test folder selection
   - Test domain filtering

4. apps/web/src/app/api/ route handler tests
   - Test authentication checks
   - Test request validation
   - Test error responses

Focus on user-facing components that handle email composition and navigation.
```

---

## Execution Order

1. **Sprint 1A + 1B** (Test Infrastructure) - Do first, enables all other sprints
2. **Sprint 4** (Size Limits) - Quick win, low risk
3. **Sprint 2A** (Worker Tests) - Critical path testing
4. **Sprint 2B** (Auth Tests) - Security-critical testing
5. **Sprint 2C** (Spam Tests) - Important for deliverability
6. **Sprint 5** (Redis Rate Limiting) - Scaling requirement
7. **Sprint 3A + 3B** (Integration Tests) - Validate full flows
8. **Sprint 6** (DSN/Bounces) - RFC compliance
9. **Sprint 7** (Frontend Tests) - UI reliability

---

## Post-Sprint Verification

After completing sprints, run:

```bash
# Go tests
cd services/smtp-server && go test ./... -v -cover
cd services/auth && go test ./... -v -cover
cd services/ai-assistant && go test ./... -v -cover

# Integration tests
go test ./... -tags=integration -v

# TypeScript tests
cd apps/web && pnpm test --coverage

# Check coverage thresholds
# Target: 50% minimum for critical services
```

---

## Notes

- **Spam filtering EXISTS** - The QA assessment incorrectly stated spam filtering is absent. A comprehensive 4-layer system exists in `services/ai-assistant/spam/service.go` (1014 lines). It just needs tests.

- **Size limit mismatch confirmed** - SMTP config says 50MB, DB schema says 25MB. Sprint 4 fixes this.

- **Rate limiting is in-memory** - The middleware uses a JavaScript Map. Sprint 5 moves this to Redis.

- **Auth service is comprehensive** - 990 lines covering registration, login, MFA, sessions. Just needs tests.
