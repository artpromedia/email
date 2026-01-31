# Sprint Prompts for Production Readiness Fixes

**Created:** January 31, 2026
**Purpose:** Actionable prompts organized by sprint for fixing all production readiness gaps
**Total Estimated Duration:** 6-8 weeks

---

## Sprint 1: Critical Security Fixes (Week 1-2)

### PROMPT 1.1: Fix SMTP Authentication Bypass

```
TASK: Implement proper SMTP authentication in the SMTP server

CONTEXT:
- File: services/smtp-server/smtp/server.go (lines 304-316)
- Current state: The SMTP server accepts ANY credentials for authentication
- This is a critical security vulnerability that would allow anyone to send emails through our system

REQUIREMENTS:
1. Integrate with the auth service to validate credentials
2. Support both LOGIN and PLAIN authentication mechanisms over TLS
3. Validate the user exists and password is correct using bcrypt/Argon2id comparison
4. Set proper session.userID and session.orgID from the authenticated user
5. Implement rate limiting for failed authentication attempts (5 attempts, then 15-minute lockout)
6. Log all authentication attempts (success and failure) with IP address
7. Ensure authentication only works over TLS connections (reject AUTH on non-TLS)
8. Support authentication with any email address associated with the user account

ACCEPTANCE CRITERIA:
- [ ] Invalid credentials return 535 Authentication failed
- [ ] Valid credentials return 235 Authentication successful
- [ ] User ID and Org ID are correctly populated in session
- [ ] Failed attempts are rate-limited
- [ ] All auth attempts are logged
- [ ] AUTH command rejected if TLS not established
- [ ] Unit tests cover all authentication scenarios
- [ ] Integration test validates end-to-end auth flow

REFERENCES:
- Auth service: services/auth/internal/service/auth_service.go
- User schema: packages/database/src/schema/users.ts
- RFC 4954 (SMTP AUTH extension)
```

---

### PROMPT 1.2: Implement Real DKIM Verification

```
TASK: Replace placeholder DKIM verification with actual DNS-based signature validation

CONTEXT:
- File: services/smtp-server/dkim/dkim.go (lines 342-419)
- Current state: VerifyMessage() returns result.Valid = true without actually verifying
- This allows spoofed emails to appear as "DKIM verified"

REQUIREMENTS:
1. Implement DNS TXT record lookup for DKIM public keys
   - Query: {selector}._domainkey.{domain}
   - Parse the DKIM record format (v=DKIM1; k=rsa; p=...)
2. Verify the signature using the retrieved public key
   - Reconstruct the signed header data using canonicalization
   - Verify RSA-SHA256 signature against the reconstructed data
   - Verify body hash matches
3. Handle DNS lookup failures gracefully (tempfail vs permfail)
4. Implement caching for DNS lookups (TTL-based, max 1 hour)
5. Support multiple DKIM signatures (return results for each)
6. Return detailed verification results:
   - Valid/Invalid/TempFail/PermFail
   - Reason for failure
   - Selector and domain verified

ACCEPTANCE CRITERIA:
- [ ] Valid DKIM signatures return Valid=true
- [ ] Invalid signatures return Valid=false with specific error
- [ ] DNS failures return appropriate tempfail/permfail
- [ ] Public key cache reduces DNS queries
- [ ] Expired signatures (x= tag) are rejected
- [ ] Unit tests with mock DNS responses
- [ ] Integration test with real DKIM-signed emails

REFERENCES:
- RFC 6376 (DKIM Signatures)
- Go DNS library: github.com/miekg/dns
- Existing signing code in same file for canonicalization reference
```

---

### PROMPT 1.3: Implement Real DMARC Validation

```
TASK: Replace simplified DMARC placeholder with full DMARC policy enforcement

CONTEXT:
- File: services/smtp-server/dmarc/dmarc.go (line 385 and surrounding code)
- Current state: DMARC validation is a "simplified placeholder"
- Need full RFC 7489 compliance for email security

REQUIREMENTS:
1. Implement DMARC record lookup
   - Query: _dmarc.{domain} TXT record
   - Parse all DMARC tags (v, p, sp, rua, ruf, adkim, aspf, pct, fo, rf, ri)
2. Implement identifier alignment checking
   - Check if From domain aligns with SPF authenticated domain
   - Check if From domain aligns with DKIM d= domain
   - Support both relaxed and strict alignment modes
3. Apply DMARC policy based on SPF/DKIM results
   - none: accept and report
   - quarantine: mark as spam
   - reject: reject the message
4. Implement percentage sampling (pct tag)
5. Generate aggregate reports (rua) - can be async/background job
6. Generate forensic reports (ruf) for failures - can be async/background job
7. Handle subdomain policies (sp tag)
8. Cache DMARC records (TTL-based)

ACCEPTANCE CRITERIA:
- [ ] DMARC records are correctly parsed
- [ ] Alignment checks work for both strict and relaxed modes
- [ ] Policy is correctly applied (none/quarantine/reject)
- [ ] Percentage sampling respects pct tag
- [ ] DMARC-None header added to passing emails
- [ ] Failed emails include DMARC failure reason
- [ ] Unit tests for all policy scenarios
- [ ] Integration test with real DMARC-protected domains

REFERENCES:
- RFC 7489 (DMARC)
- Existing SPF implementation: services/smtp-server/spf/spf.go
- Existing DKIM implementation: services/smtp-server/dkim/dkim.go
```

---

### PROMPT 1.4: Fix SPF Validation Completeness

```
TASK: Audit and complete SPF validation implementation

CONTEXT:
- File: services/smtp-server/spf/spf.go
- Need to ensure full RFC 7208 compliance

REQUIREMENTS:
1. Verify all SPF mechanisms are implemented:
   - all, include, a, mx, ptr, ip4, ip6, exists
2. Verify all SPF modifiers are handled:
   - redirect, exp
3. Implement proper DNS lookup limits (max 10 DNS lookups)
4. Handle void lookups correctly
5. Implement proper result codes: None, Neutral, Pass, Fail, SoftFail, TempError, PermError
6. Add SPF result to Authentication-Results header
7. Cache SPF records appropriately

ACCEPTANCE CRITERIA:
- [ ] All SPF mechanisms work correctly
- [ ] DNS lookup limit prevents DoS
- [ ] Proper error handling for DNS failures
- [ ] Results match reference SPF implementations
- [ ] Unit tests for each mechanism type
- [ ] Integration tests with real SPF records

REFERENCES:
- RFC 7208 (SPF)
- Test cases: https://www.openspf.org/Test_Suite
```

---

## Sprint 2: Authentication & Authorization (Week 2-3)

### PROMPT 2.1: Implement SSO/SAML Properly

```
TASK: Complete the SSO/SAML implementation that is currently placeholder code

CONTEXT:
- File: services/auth/internal/service/sso_service.go (lines 723-735)
- Current state: SAML assertion parsing is marked as "placeholder"
- Enterprise customers need working SSO

REQUIREMENTS:
1. Implement SAML 2.0 assertion parsing
   - Parse and validate XML signature
   - Extract user attributes (email, name, groups)
   - Validate assertion conditions (NotBefore, NotOnOrAfter, Audience)
   - Handle encrypted assertions
2. Implement SAML response validation
   - Verify signature using IdP certificate
   - Check InResponseTo matches our request
   - Validate Destination URL
3. Implement proper session creation after successful SSO
4. Support SAML attribute mapping configuration per domain
5. Implement Single Logout (SLO) - both IdP and SP initiated
6. Generate proper SAML metadata for IdP configuration
7. Support NameID formats (email, persistent, transient)

ACCEPTANCE CRITERIA:
- [ ] SAML login flow works end-to-end
- [ ] Assertions are properly validated
- [ ] User attributes are correctly extracted
- [ ] Session is created with correct user context
- [ ] SLO terminates sessions correctly
- [ ] Metadata endpoint returns valid SAML metadata
- [ ] Integration tests with mock IdP (e.g., SimpleSAMLphp)

REFERENCES:
- SAML 2.0 Core specification
- Go SAML library: github.com/crewjam/saml
- Existing SSO handler: services/auth/internal/handler/sso_handler.go
```

---

### PROMPT 2.2: Implement Admin Password Reset Email

```
TASK: Implement the missing admin password reset email functionality

CONTEXT:
- File: services/auth/internal/service/admin_service.go (line 784)
- Current state: TODO comment, no email is sent

REQUIREMENTS:
1. Generate secure password reset token (crypto random, 32+ bytes)
2. Store token hash in database with expiration (1 hour)
3. Send password reset email to user
   - Use existing SMTP service or transactional API
   - Include reset link with token
   - Include security warning about not sharing link
4. Implement reset endpoint that validates token and allows password change
5. Invalidate token after use
6. Log all password reset activities in audit log
7. Rate limit reset requests per email address (max 3 per hour)

ACCEPTANCE CRITERIA:
- [ ] Admin can trigger password reset for any user
- [ ] User receives email with working reset link
- [ ] Token expires after 1 hour
- [ ] Token is single-use
- [ ] New password must meet password policy
- [ ] Audit log captures the event
- [ ] Rate limiting prevents abuse
- [ ] Unit tests for reset flow

REFERENCES:
- Email templates location: apps/web/src/emails/ (if exists)
- Transactional API: services/transactional-api/
- Password policy: packages/config/src/env.ts
```

---

### PROMPT 2.3: Implement Redis-Based Rate Limiting

```
TASK: Replace InMemoryRateLimiter with Redis-based implementation for production

CONTEXT:
- File: apps/web/src/middleware.ts (line 25)
- Current state: InMemoryRateLimiter doesn't work across instances
- Need distributed rate limiting for horizontal scaling

REQUIREMENTS:
1. Create RedisRateLimiter class in packages/utils
2. Implement sliding window rate limiting algorithm
3. Use Redis MULTI/EXEC for atomic operations
4. Support different rate limit tiers:
   - Auth endpoints: 5 requests/minute
   - API endpoints: 100 requests/minute
   - General routes: 300 requests/minute
5. Include proper key prefixing for multi-tenant isolation
6. Implement graceful degradation if Redis is unavailable
7. Add Retry-After header in 429 responses
8. Support rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)

ACCEPTANCE CRITERIA:
- [ ] Rate limiting works across multiple app instances
- [ ] Sliding window algorithm prevents burst abuse
- [ ] Redis connection failures don't crash the app
- [ ] Rate limit headers are included in responses
- [ ] Different endpoints have appropriate limits
- [ ] Unit tests with Redis mock
- [ ] Load test validates distributed behavior

REFERENCES:
- Existing rate limiter: packages/utils/src/rate-limiter.ts
- Redis config: packages/config/src/env.ts
- Middleware: apps/web/src/middleware.ts
```

---

## Sprint 3: Email Security & Compliance (Week 3-4)

### PROMPT 3.1: Implement Virus Scanning Integration

```
TASK: Integrate ClamAV virus scanning for email attachments

CONTEXT:
- Schema has virus_scan_status field but no scanning implementation
- All attachments currently remain in "pending" status
- Required for enterprise email security

REQUIREMENTS:
1. Set up ClamAV daemon in Docker Compose
2. Create virus scanning service in services/storage or new service
3. Scan attachments on upload before storing
4. Update virus_scan_status field: pending -> scanning -> clean/infected/error
5. Quarantine infected files (move to separate bucket, notify admin)
6. Block delivery of emails with infected attachments
7. Support async scanning for large files
8. Implement scanning queue with retry logic
9. Add admin notification for detected viruses
10. Create Grafana dashboard for virus scan metrics

ACCEPTANCE CRITERIA:
- [ ] ClamAV runs in Docker environment
- [ ] All attachments are scanned before storage
- [ ] Infected files are quarantined
- [ ] Clean files are marked as such
- [ ] Scan errors are logged and retried
- [ ] Admin receives alerts for infections
- [ ] Performance: <5 second scan time for 10MB files
- [ ] Unit tests with EICAR test file

REFERENCES:
- ClamAV Docker: clamav/clamav
- Go ClamAV client: github.com/dutchcoders/go-clamd
- Attachment schema: packages/database/src/schema/emails.ts
- Storage service: services/storage/
```

---

### PROMPT 3.2: Implement OpenSearch Email Indexing

```
TASK: Implement full-text email search using OpenSearch

CONTEXT:
- OpenSearch is in docker-compose but no indexing code exists
- Users cannot search email content effectively
- Gmail/Outlook have excellent search - we need parity

REQUIREMENTS:
1. Create email indexing service (can be in storage service or new)
2. Define OpenSearch index mapping for emails:
   - subject, body_text, body_html (analyzed text)
   - from, to, cc (keyword + text)
   - attachments.filename (text)
   - date, folder, labels (filterable)
   - organization_id, mailbox_id (for access control)
3. Index emails on:
   - New email received
   - Email moved/labeled
   - Email deleted (remove from index)
4. Implement search API endpoint:
   - Full-text search across subject and body
   - Filter by folder, label, date range, has:attachment
   - Support Gmail-style search operators (from:, to:, subject:, etc.)
   - Pagination with cursor-based approach
5. Implement access control (users can only search their own emails)
6. Handle bulk re-indexing for existing emails
7. Implement search suggestions/autocomplete

ACCEPTANCE CRITERIA:
- [ ] Emails are indexed within 5 seconds of receipt
- [ ] Search returns relevant results ranked by relevance
- [ ] Gmail-style operators work (from:, to:, subject:, has:attachment)
- [ ] Date range filtering works
- [ ] Results respect user permissions
- [ ] Search response time <500ms for typical queries
- [ ] Re-indexing job can process existing emails
- [ ] Unit tests for indexing and search logic

REFERENCES:
- OpenSearch config: docker-compose.yml
- Email schema: packages/database/src/schema/emails.ts
- Go OpenSearch client: github.com/opensearch-project/opensearch-go
```

---

### PROMPT 3.3: Fix Email Threading Algorithm

```
TASK: Improve email threading to match Gmail/Outlook behavior

CONTEXT:
- Current threading uses basic References header matching
- Gmail and Outlook use more sophisticated algorithms
- Users expect consistent conversation grouping

REQUIREMENTS:
1. Implement multi-factor threading:
   - Message-ID / In-Reply-To / References matching (current)
   - Subject normalization (remove Re:, Fwd:, [tags])
   - Participant overlap detection
   - Time-based proximity (messages within 30 days)
2. Handle edge cases:
   - Duplicate Message-IDs (rare but possible)
   - Missing References header
   - Reply to forwarded message
   - Cross-mailbox threads (sent + received)
3. Implement thread merging when new evidence links threads
4. Implement thread splitting for divergent conversations
5. Update thread metadata when messages added/removed:
   - participant list
   - message count
   - last message timestamp
   - snippet from latest message

ACCEPTANCE CRITERIA:
- [ ] Replies are correctly grouped with original message
- [ ] Forwarded messages start new threads (configurable)
- [ ] Subject changes can optionally split threads
- [ ] Thread metadata stays accurate
- [ ] Performance: threading decision <10ms per message
- [ ] Unit tests for all threading scenarios
- [ ] Comparison tests against Gmail threading behavior

REFERENCES:
- Email schema: packages/database/src/schema/emails.ts
- Thread schema: packages/database/src/schema/emails.ts (threads table)
- Gmail threading: https://support.google.com/mail/answer/5900
```

---

## Sprint 4: Infrastructure & Reliability (Week 4-5)

### PROMPT 4.1: Fix Quota Enforcement Race Condition

```
TASK: Implement atomic quota enforcement to prevent race conditions

CONTEXT:
- File: services/smtp-server/queue/worker.go (lines 242-244)
- Current state: Non-atomic read-then-write allows concurrent deliveries to exceed quota
- Could cause storage overruns and billing issues

REQUIREMENTS:
1. Implement atomic quota check and update using database transaction
2. Use SELECT FOR UPDATE or equivalent locking
3. Alternative: Use Redis WATCH/MULTI for distributed locking
4. Handle concurrent delivery attempts gracefully
5. Return appropriate error when quota exceeded
6. Implement quota warning emails at 80%, 90%, 95% thresholds
7. Add quota metrics to Prometheus

IMPLEMENTATION OPTIONS:
Option A - Database Transaction:
```go
tx.Exec("UPDATE mailboxes SET used_bytes = used_bytes + $1
         WHERE id = $2 AND (quota_bytes = 0 OR used_bytes + $1 <= quota_bytes)
         RETURNING used_bytes")
```

Option B - Redis Distributed Lock:
```go
// Use Redis WATCH on quota key
// MULTI: check + increment
// EXEC: atomic operation
```

ACCEPTANCE CRITERIA:
- [ ] Concurrent deliveries don't exceed quota
- [ ] Quota check is atomic with update
- [ ] Clear error message when quota exceeded
- [ ] Warning emails sent at thresholds
- [ ] Metrics exposed for monitoring
- [ ] Load test with 100 concurrent deliveries
- [ ] Unit tests for race condition scenarios

REFERENCES:
- Queue worker: services/smtp-server/queue/worker.go
- Mailbox schema: packages/database/src/schema/mailboxes.ts
```

---

### PROMPT 4.2: Fix IMAP IDLE Notification Dropping

```
TASK: Prevent IDLE notifications from being silently dropped

CONTEXT:
- File: services/imap-server/imap/server.go (lines 361-366)
- Current state: Full channel causes notifications to be skipped
- Users may not see new emails in real-time

REQUIREMENTS:
1. Increase channel buffer size appropriately
2. Implement notification coalescing (batch rapid updates)
3. Add metrics for dropped notifications
4. Implement reconnection hint when too many drops
5. Consider using Redis Pub/Sub for cross-instance notifications
6. Add watchdog to detect stuck IDLE connections
7. Implement graceful IDLE timeout and re-establishment

ACCEPTANCE CRITERIA:
- [ ] Notifications are not silently dropped
- [ ] Rapid updates are coalesced efficiently
- [ ] Metrics track notification delivery success rate
- [ ] Cross-instance notifications work (if using Redis)
- [ ] Stuck connections are cleaned up
- [ ] Load test with 1000 concurrent IDLE connections
- [ ] Unit tests for notification scenarios

REFERENCES:
- IMAP server: services/imap-server/imap/server.go
- IMAP IDLE: services/imap-server/imap/idle.go
- RFC 2177 (IMAP IDLE)
```

---

### PROMPT 4.3: Implement Database Table Partitioning

```
TASK: Implement table partitioning for large tables to ensure long-term scalability

CONTEXT:
- emails table will grow indefinitely
- Query performance will degrade over time
- Need partitioning strategy before production

REQUIREMENTS:
1. Partition emails table by created_at (monthly partitions)
2. Partition audit_logs table by timestamp (monthly)
3. Partition email_logs table if exists (monthly)
4. Create partition management script:
   - Automatically create future partitions (3 months ahead)
   - Optionally archive/drop old partitions based on retention policy
5. Migrate existing data to partitioned structure
6. Update indexes for partition-aware queries
7. Test query performance with partitioned tables

IMPLEMENTATION:
```sql
-- Convert emails to partitioned table
CREATE TABLE emails_new (
    LIKE emails INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE emails_2026_01 PARTITION OF emails_new
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

ACCEPTANCE CRITERIA:
- [ ] Partitioned tables created with correct structure
- [ ] Existing data migrated successfully
- [ ] Partition creation automated
- [ ] Query performance maintained or improved
- [ ] Old partition archival/deletion works
- [ ] Runbook for partition management
- [ ] Load test queries across partition boundaries

REFERENCES:
- PostgreSQL partitioning docs
- Email schema: packages/database/src/schema/emails.ts
- Drizzle migration: packages/database/drizzle.config.ts
```

---

### PROMPT 4.4: Implement Database Replication

```
TASK: Set up PostgreSQL primary-replica replication for high availability

CONTEXT:
- Currently single PostgreSQL instance
- No failover capability
- Need HA for production SLA

REQUIREMENTS:
1. Configure streaming replication with Patroni
2. Set up HAProxy for connection routing
3. Configure automatic failover
4. Implement read replica routing for read-heavy queries
5. Set up replication monitoring and alerting
6. Document manual failover procedure
7. Test failover scenarios

IMPLEMENTATION:
- Use existing infrastructure/postgresql/docker-compose.ha.yml as base
- Configure Patroni for consensus-based leader election
- Set up etcd cluster for distributed consensus
- Configure HAProxy health checks

ACCEPTANCE CRITERIA:
- [ ] Primary-replica replication working
- [ ] Automatic failover completes in <30 seconds
- [ ] Read queries can be routed to replica
- [ ] Replication lag monitoring in place
- [ ] Alerting for replication issues
- [ ] Manual failover documented and tested
- [ ] Recovery from total cluster failure documented

REFERENCES:
- HA config: infrastructure/postgresql/docker-compose.ha.yml
- Patroni config: infrastructure/postgresql/patroni.yml
- HAProxy config: infrastructure/postgresql/haproxy.cfg
```

---

## Sprint 5: Testing & Quality (Week 5-6)

### PROMPT 5.1: Implement Core Unit Tests

```
TASK: Achieve 70% unit test coverage for core services

CONTEXT:
- Current test coverage is inadequate
- Many critical services have no tests
- Need comprehensive test suite before production

REQUIREMENTS:
1. Auth Service Tests (services/auth/):
   - User registration validation
   - Login flow (success, failure, lockout)
   - Password reset flow
   - 2FA enable/verify/disable
   - Token refresh and revocation
   - Session management

2. SMTP Server Tests (services/smtp-server/):
   - SMTP command handling
   - Authentication flow
   - Rate limiting
   - DKIM signing
   - SPF/DKIM/DMARC validation
   - Bounce generation
   - Queue worker processing

3. IMAP Server Tests (services/imap-server/):
   - IMAP command parsing
   - Mailbox operations
   - Message fetch/store
   - IDLE notifications
   - Quota enforcement
   - Multi-domain access

4. Domain Manager Tests (services/domain-manager/):
   - Domain creation/verification
   - DNS record generation
   - DKIM key rotation
   - Domain settings management

5. Storage Service Tests (services/storage/):
   - Attachment upload/download
   - Quota tracking
   - Deduplication
   - Presigned URL generation

ACCEPTANCE CRITERIA:
- [ ] 70% line coverage for each service
- [ ] All critical paths have tests
- [ ] Edge cases and error paths covered
- [ ] Tests run in CI pipeline
- [ ] Test execution time <5 minutes
- [ ] Mock external dependencies (DB, Redis, S3)

REFERENCES:
- Existing tests: services/*/internal/**/*_test.go
- Go testing: testing package + testify
- Mocks: go-sqlmock, redismock
```

---

### PROMPT 5.2: Implement Integration Tests

```
TASK: Create comprehensive integration test suite

CONTEXT:
- Some integration tests exist in tests/integration/
- Need to cover critical user flows end-to-end
- Tests should run against real services in Docker

REQUIREMENTS:
1. Authentication Flows:
   - Register -> Verify Email -> Login -> Use API
   - Login -> Enable 2FA -> Login with 2FA
   - Password reset flow
   - SSO login flow

2. Email Flows:
   - Send email via SMTP -> Receive in recipient inbox
   - Send email via API -> Track delivery status
   - Receive external email -> View in IMAP
   - Reply to email -> Thread correctly grouped

3. Domain Management:
   - Add domain -> Verify DNS -> Enable for users
   - Generate DKIM -> Verify signing works
   - Configure domain settings

4. Multi-tenant Scenarios:
   - User A cannot access User B's emails
   - Organization isolation
   - Domain isolation

5. Calendar/Contacts:
   - CardDAV contact sync
   - CalDAV calendar sync

ACCEPTANCE CRITERIA:
- [ ] All critical user journeys tested
- [ ] Tests run in isolated Docker environment
- [ ] Test data is cleaned up after each run
- [ ] Tests complete in <10 minutes
- [ ] CI/CD integration with test reports
- [ ] Flaky test detection and handling

REFERENCES:
- Existing tests: tests/integration/
- Docker compose for tests: tests/integration/docker-compose.test.yml
- Test runner: tests/integration/run-tests.sh
```

---

### PROMPT 5.3: Implement E2E Tests

```
TASK: Create end-to-end tests for web application

CONTEXT:
- Need to test actual user experience in browser
- Validate UI functionality works correctly
- Catch regressions in user-facing features

REQUIREMENTS:
1. Authentication E2E:
   - Login page renders correctly
   - Login with valid credentials succeeds
   - Login with invalid credentials shows error
   - 2FA prompt appears when enabled
   - Logout clears session

2. Email Client E2E:
   - Inbox loads and displays emails
   - Email composition and sending
   - Reply/Forward functionality
   - Search works correctly
   - Folder navigation
   - Email actions (star, archive, delete)

3. Settings E2E:
   - Profile update
   - Password change
   - 2FA setup
   - Email signature configuration

4. Admin Dashboard E2E:
   - User management
   - Domain management
   - Analytics display

ACCEPTANCE CRITERIA:
- [ ] Critical user flows have E2E coverage
- [ ] Tests run in CI with headless browser
- [ ] Screenshots captured on failure
- [ ] Tests complete in <15 minutes
- [ ] Cross-browser testing (Chrome, Firefox)
- [ ] Mobile viewport testing

REFERENCES:
- Playwright config: apps/web/playwright.config.ts
- Existing E2E: apps/web/e2e/
```

---

### PROMPT 5.4: Implement Load Testing

```
TASK: Create comprehensive load testing suite

CONTEXT:
- Need to validate performance under production load
- Identify bottlenecks before they affect users
- Establish performance baselines

REQUIREMENTS:
1. SMTP Load Tests:
   - 100 concurrent connections sending emails
   - 1000 emails/minute sustained throughput
   - Connection timeout under load

2. IMAP Load Tests:
   - 1000 concurrent IDLE connections
   - Rapid mailbox switching
   - Large mailbox (10,000+ emails) performance

3. API Load Tests:
   - 500 requests/second to email list endpoint
   - Search query performance
   - File upload performance

4. Database Load Tests:
   - Concurrent read/write operations
   - Query performance under load
   - Connection pool saturation

5. Combined Scenario:
   - Simulate 1000 active users
   - Mix of email send, receive, search, organize
   - Sustained for 30 minutes

ACCEPTANCE CRITERIA:
- [ ] SMTP handles 100 concurrent connections
- [ ] IMAP handles 1000 IDLE connections
- [ ] API p95 latency <500ms under load
- [ ] No memory leaks during extended tests
- [ ] Error rate <0.1% under normal load
- [ ] Graceful degradation under overload
- [ ] Performance report generated

REFERENCES:
- k6 scripts: tests/load/
- Load test runner: tests/load/run-load-tests.sh
```

---

## Sprint 6: Operational Readiness (Week 6-7)

### PROMPT 6.1: Fix CSP and Environment Configuration

```
TASK: Make Content Security Policy and other configs environment-aware

CONTEXT:
- File: apps/web/src/middleware.ts (line 96)
- Current state: Hardcoded "yourdomain.com" in CSP
- Need environment-based configuration

REQUIREMENTS:
1. Move CSP domains to environment variables
2. Create CSP configuration object with environment support
3. Support multiple domains in CSP directives
4. Add nonce-based script loading for inline scripts
5. Implement CSP report-uri endpoint for violation logging
6. Make all hardcoded URLs environment-configurable
7. Validate CSP configuration at startup

ACCEPTANCE CRITERIA:
- [ ] CSP uses environment variables for domains
- [ ] CSP violations are logged
- [ ] Inline scripts use nonces
- [ ] Configuration validated at startup
- [ ] Different CSP for development vs production
- [ ] Documentation for CSP configuration

REFERENCES:
- Middleware: apps/web/src/middleware.ts
- Environment config: packages/config/src/env.ts
```

---

### PROMPT 6.2: Implement SMS Provider Stubs

```
TASK: Implement SMPP and GSM modem SMS providers or mark as unsupported

CONTEXT:
- Files: services/sms-gateway/internal/providers/smpp/ and gsm/
- Current state: Multiple TODO comments, providers don't work
- Need working providers or clear "not implemented" errors

REQUIREMENTS:
Option A - Implement Providers:
1. SMPP Provider:
   - Implement SMPP 3.4 protocol
   - Connect to SMSC
   - Submit SM PDU for sending
   - Handle delivery receipts

2. GSM Modem Provider:
   - Serial port communication
   - AT command interface
   - SMS PDU mode support
   - Signal strength monitoring

Option B - Mark as Unsupported:
1. Return clear error: "SMPP provider not implemented"
2. Remove from provider selection
3. Document as "planned for future release"
4. Add feature flag to hide in UI

ACCEPTANCE CRITERIA:
- [ ] Providers either work or return clear errors
- [ ] No silent failures
- [ ] Documentation updated
- [ ] UI doesn't show unsupported providers

REFERENCES:
- SMPP: services/sms-gateway/internal/providers/smpp/smpp.go
- GSM: services/sms-gateway/internal/providers/gsm/gsm.go
- SMPP library: github.com/fiorix/go-smpp
```

---

### PROMPT 6.3: Complete API Documentation

```
TASK: Generate comprehensive OpenAPI/Swagger documentation

CONTEXT:
- APIs exist but no formal documentation
- Developers need reference for integration
- Required for enterprise customers

REQUIREMENTS:
1. Add OpenAPI annotations to all API endpoints
2. Generate Swagger UI documentation
3. Include authentication requirements
4. Document request/response schemas
5. Add example requests and responses
6. Document error codes and meanings
7. Version the API documentation
8. Host documentation at /api/docs

SERVICES TO DOCUMENT:
- Auth API (services/auth/)
- Domain Manager API (services/domain-manager/)
- Transactional API (services/transactional-api/)
- Storage API (services/storage/)
- AI Assistant API (services/ai-assistant/)
- SMS Gateway API (services/sms-gateway/)

ACCEPTANCE CRITERIA:
- [ ] All public endpoints documented
- [ ] Swagger UI accessible at /api/docs
- [ ] Authentication flows documented
- [ ] Request/response examples provided
- [ ] Error codes documented
- [ ] API versioning documented
- [ ] SDK generation tested (Go, TypeScript, Python)

REFERENCES:
- Swag for Go: github.com/swaggo/swag
- OpenAPI 3.0 specification
```

---

### PROMPT 6.4: Security Penetration Testing Preparation

```
TASK: Prepare for and document security penetration testing

CONTEXT:
- Security testing infrastructure exists (tests/security/)
- Need comprehensive security assessment before production
- Document findings and remediation

REQUIREMENTS:
1. Pre-test Preparation:
   - Set up isolated test environment
   - Create test accounts with various roles
   - Document all endpoints and attack surfaces
   - Prepare test credentials

2. Automated Security Testing:
   - Run OWASP ZAP full scan
   - Run Trivy container scan
   - Run dependency vulnerability scan
   - Run Nuclei API security scan

3. Manual Testing Areas:
   - Authentication bypass attempts
   - Authorization boundary testing
   - Input validation (XSS, SQLi, Command injection)
   - Session management
   - CSRF protection
   - API rate limiting
   - Email header injection
   - Attachment upload security

4. Documentation:
   - Security testing report template
   - Finding severity classification
   - Remediation tracking
   - Retest verification

ACCEPTANCE CRITERIA:
- [ ] All automated scans complete without critical findings
- [ ] Manual testing checklist completed
- [ ] All critical/high findings remediated
- [ ] Security report generated
- [ ] Remediation verified by retest
- [ ] Sign-off from security reviewer

REFERENCES:
- Security tests: tests/security/
- ZAP scripts: tests/security/zap-scripts/
- OWASP Testing Guide
```

---

## Sprint 7: Final Hardening (Week 7-8)

### PROMPT 7.1: Production Checklist Verification

```
TASK: Verify all production readiness items are complete

CONTEXT:
- Multiple sprints of fixes complete
- Need final verification before go-live
- Document any remaining gaps

REQUIREMENTS:
1. Security Verification:
   - [ ] SMTP authentication working
   - [ ] DKIM verification working
   - [ ] DMARC validation working
   - [ ] SSO/SAML working
   - [ ] Rate limiting distributed
   - [ ] Virus scanning integrated
   - [ ] All secrets in secrets manager

2. Infrastructure Verification:
   - [ ] Database replication working
   - [ ] Table partitioning active
   - [ ] Backup/restore tested
   - [ ] Monitoring dashboards working
   - [ ] Alerting configured
   - [ ] Log aggregation working

3. Testing Verification:
   - [ ] Unit test coverage >70%
   - [ ] Integration tests passing
   - [ ] E2E tests passing
   - [ ] Load tests meet targets
   - [ ] Security scan clean

4. Documentation Verification:
   - [ ] API documentation complete
   - [ ] Runbooks updated
   - [ ] Architecture diagrams current
   - [ ] Incident response documented

ACCEPTANCE CRITERIA:
- [ ] All checklist items verified
- [ ] Any gaps documented with timeline
- [ ] Sign-off from engineering lead
- [ ] Sign-off from security lead
- [ ] Sign-off from operations lead

REFERENCES:
- PRODUCTION_READINESS_ASSESSMENT.md
- docs/DEPLOYMENT_RUNBOOK.md
```

---

### PROMPT 7.2: Staged Rollout Execution

```
TASK: Execute staged production rollout

CONTEXT:
- All fixes complete and verified
- Ready for controlled production deployment
- Need careful monitoring during rollout

REQUIREMENTS:
1. Phase 1 - Internal Alpha (Week 1):
   - Deploy to production environment
   - 10-20 internal users only
   - 24/7 monitoring by engineering
   - Daily standup to review issues

2. Phase 2 - Closed Beta (Week 2-3):
   - Expand to 100 trusted external users
   - Enable single domain only
   - Collect feedback via support channel
   - Fix any issues found

3. Phase 3 - Limited Production (Week 4-5):
   - Expand to 1,000 users
   - Enable 2-3 domains
   - Monitor performance metrics
   - Verify SLA targets met

4. Phase 4 - General Availability (Week 6+):
   - Full multi-domain enabled
   - Auto-scaling configured
   - Full disaster recovery tested
   - 99.9% SLA commitment active

ROLLBACK CRITERIA:
- Error rate >1%
- p95 latency >1s
- Email delivery rate <98%
- Security incident detected

ACCEPTANCE CRITERIA:
- [ ] Each phase completed successfully
- [ ] No critical issues in any phase
- [ ] Performance meets SLA targets
- [ ] User feedback addressed
- [ ] Rollback procedure tested
- [ ] GA announcement ready

REFERENCES:
- Deployment runbook: docs/DEPLOYMENT_RUNBOOK.md
- Monitoring dashboards: infrastructure/monitoring/
- Rollback procedures: docs/DEPLOYMENT_RUNBOOK.md#rollback
```

---

## Summary: Sprint Schedule

| Sprint | Focus | Duration | Key Deliverables |
|--------|-------|----------|------------------|
| Sprint 1 | Critical Security | Week 1-2 | SMTP auth, DKIM/DMARC/SPF verification |
| Sprint 2 | Auth & Authorization | Week 2-3 | SSO, Password reset, Redis rate limiting |
| Sprint 3 | Email Security | Week 3-4 | Virus scanning, Search, Threading |
| Sprint 4 | Infrastructure | Week 4-5 | Quota fix, IDLE fix, Partitioning, Replication |
| Sprint 5 | Testing | Week 5-6 | Unit tests, Integration tests, E2E, Load tests |
| Sprint 6 | Operations | Week 6-7 | CSP fix, API docs, Security testing |
| Sprint 7 | Final Hardening | Week 7-8 | Verification, Staged rollout |

---

## How to Use These Prompts

1. **Copy the relevant prompt** into your development workflow
2. **Assign to developer/team** with appropriate skills
3. **Track progress** against acceptance criteria
4. **Code review** against requirements
5. **QA verification** before marking complete
6. **Update PRODUCTION_READINESS_ASSESSMENT.md** after each sprint

---

**Document Version:** 1.0
**Created:** January 31, 2026
**Author:** QA Engineering Team
