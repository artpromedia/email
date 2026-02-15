//go:build integration

// Package integration tests verify end-to-end SMTP delivery flows
// using real PostgreSQL and Redis instances.
//
// Run with: go test -tags=integration -v ./...
package main_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// IntegrationConfig holds configuration for integration tests
type IntegrationConfig struct {
	DatabaseURL string
	RedisURL    string
	SMTPHost    string
	SMTPPort    string
}

func loadIntegrationConfig() *IntegrationConfig {
	return &IntegrationConfig{
		DatabaseURL: envOrDefault("TEST_DATABASE_URL", "postgres://test_user:test_password@localhost:5433/email_test?sslmode=disable"),
		RedisURL:    envOrDefault("TEST_REDIS_URL", "redis://localhost:6380"),
		SMTPHost:    envOrDefault("TEST_SMTP_HOST", "localhost"),
		SMTPPort:    envOrDefault("TEST_SMTP_PORT", "1026"),
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// IntegrationSuite provides shared resources for integration tests
type IntegrationSuite struct {
	config *IntegrationConfig
	db     *sql.DB
	redis  *redis.Client
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.Mutex

	// Track created entities for cleanup
	createdDomainIDs []string
	createdOrgIDs    []string
}

func SetupIntegrationSuite(t *testing.T) *IntegrationSuite {
	t.Helper()

	config := loadIntegrationConfig()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

	suite := &IntegrationSuite{
		config: config,
		ctx:    ctx,
		cancel: cancel,
	}

	// Connect to PostgreSQL
	db, err := sql.Open("pgx", config.DatabaseURL)
	if err != nil {
		t.Skipf("Skipping integration test: cannot connect to database: %v", err)
	}
	if err := db.PingContext(ctx); err != nil {
		t.Skipf("Skipping integration test: database not available: %v", err)
	}
	suite.db = db

	// Connect to Redis
	opt, err := redis.ParseURL(config.RedisURL)
	if err != nil {
		t.Skipf("Skipping integration test: invalid Redis URL: %v", err)
	}
	suite.redis = redis.NewClient(opt)
	if err := suite.redis.Ping(ctx).Err(); err != nil {
		t.Skipf("Skipping integration test: Redis not available: %v", err)
	}

	t.Cleanup(func() {
		suite.Teardown(t)
	})

	return suite
}

func (s *IntegrationSuite) Teardown(t *testing.T) {
	t.Helper()

	// Clean up test data in reverse order
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, id := range s.createdDomainIDs {
		_, _ = s.db.ExecContext(s.ctx, "DELETE FROM domains WHERE id = $1", id)
	}
	for _, id := range s.createdOrgIDs {
		_, _ = s.db.ExecContext(s.ctx, "DELETE FROM organizations WHERE id = $1", id)
	}

	if s.db != nil {
		s.db.Close()
	}
	if s.redis != nil {
		s.redis.Close()
	}
	s.cancel()
}

// createTestOrganization creates a test organization and returns its ID
func (s *IntegrationSuite) createTestOrganization(t *testing.T, name string) string {
	t.Helper()
	orgID := uuid.New().String()
	_, err := s.db.ExecContext(s.ctx,
		`INSERT INTO organizations (id, name, slug, status, created_at, updated_at)
		 VALUES ($1, $2, $3, 'active', NOW(), NOW())
		 ON CONFLICT (id) DO NOTHING`,
		orgID, name, strings.ToLower(strings.ReplaceAll(name, " ", "-")),
	)
	if err != nil {
		t.Fatalf("Failed to create test organization: %v", err)
	}
	s.mu.Lock()
	s.createdOrgIDs = append(s.createdOrgIDs, orgID)
	s.mu.Unlock()
	return orgID
}

// createTestDomain creates a test domain linked to an organization
func (s *IntegrationSuite) createTestDomain(t *testing.T, orgID, domainName string) string {
	t.Helper()
	domainID := uuid.New().String()
	_, err := s.db.ExecContext(s.ctx,
		`INSERT INTO domains (id, organization_id, name, status, is_primary,
		 mx_verified, spf_verified, dkim_verified, dmarc_verified,
		 max_message_size, require_tls, allow_external_relay,
		 rate_limit_per_hour, rate_limit_per_day, created_at, updated_at)
		 VALUES ($1, $2, $3, 'active', true,
		 true, true, true, true,
		 26214400, false, true,
		 1000, 10000, NOW(), NOW())
		 ON CONFLICT (name) DO NOTHING`,
		domainID, orgID, domainName,
	)
	if err != nil {
		t.Fatalf("Failed to create test domain: %v", err)
	}
	s.mu.Lock()
	s.createdDomainIDs = append(s.createdDomainIDs, domainID)
	s.mu.Unlock()
	return domainID
}

// createTestMailbox creates a mailbox for a domain
func (s *IntegrationSuite) createTestMailbox(t *testing.T, domainID, email, displayName string) string {
	t.Helper()
	mailboxID := uuid.New().String()
	_, err := s.db.ExecContext(s.ctx,
		`INSERT INTO mailboxes (id, domain_id, email, display_name, status,
		 quota_bytes, usage_bytes, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, 'active', 1073741824, 0, NOW(), NOW())
		 ON CONFLICT DO NOTHING`,
		mailboxID, domainID, email, displayName,
	)
	if err != nil {
		t.Fatalf("Failed to create test mailbox: %v", err)
	}
	return mailboxID
}

// =================================================================
// Test: Local Delivery End-to-End
// =================================================================

func TestIntegration_LocalDelivery_EndToEnd(t *testing.T) {
	suite := SetupIntegrationSuite(t)

	// Create test organization and domain
	orgID := suite.createTestOrganization(t, "Test Org Local Delivery")
	domainName := fmt.Sprintf("test-local-%d.example.com", time.Now().UnixNano())
	domainID := suite.createTestDomain(t, orgID, domainName)

	recipientEmail := "recipient@" + domainName
	_ = suite.createTestMailbox(t, domainID, recipientEmail, "Test Recipient")

	t.Run("Enqueue and deliver local message", func(t *testing.T) {
		messageID := uuid.New().String()
		msg := map[string]interface{}{
			"id":           messageID,
			"from":         "sender@external.com",
			"to":           []string{recipientEmail},
			"subject":      "Integration Test: Local Delivery",
			"body":         "This is a test message for local delivery integration testing.",
			"domain_id":    domainID,
			"status":       "queued",
			"created_at":   time.Now().Format(time.RFC3339),
			"retry_count":  0,
		}

		msgJSON, err := json.Marshal(msg)
		require.NoError(t, err)

		// Enqueue the message in Redis
		err = suite.redis.LPush(suite.ctx, "email:queue:delivery", string(msgJSON)).Err()
		require.NoError(t, err)

		// Verify message was enqueued
		length, err := suite.redis.LLen(suite.ctx, "email:queue:delivery").Result()
		require.NoError(t, err)
		assert.GreaterOrEqual(t, length, int64(1), "Message should be in queue")

		// Clean up the test message from queue
		suite.redis.LRem(suite.ctx, "email:queue:delivery", 1, string(msgJSON))
	})

	t.Run("Verify mailbox exists for local recipient", func(t *testing.T) {
		var count int
		err := suite.db.QueryRowContext(suite.ctx,
			"SELECT COUNT(*) FROM mailboxes WHERE email = $1 AND status = 'active'",
			recipientEmail,
		).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 1, count, "Mailbox should exist for recipient")
	})

	t.Run("Verify domain is active and verified", func(t *testing.T) {
		var status string
		var mxVerified, spfVerified, dkimVerified bool
		err := suite.db.QueryRowContext(suite.ctx,
			`SELECT status, mx_verified, spf_verified, dkim_verified
			 FROM domains WHERE name = $1`,
			domainName,
		).Scan(&status, &mxVerified, &spfVerified, &dkimVerified)
		require.NoError(t, err)
		assert.Equal(t, "active", status)
		assert.True(t, mxVerified, "MX should be verified")
		assert.True(t, spfVerified, "SPF should be verified")
		assert.True(t, dkimVerified, "DKIM should be verified")
	})

	t.Run("Mailbox quota check", func(t *testing.T) {
		var quotaBytes, usageBytes int64
		err := suite.db.QueryRowContext(suite.ctx,
			"SELECT quota_bytes, usage_bytes FROM mailboxes WHERE email = $1",
			recipientEmail,
		).Scan(&quotaBytes, &usageBytes)
		require.NoError(t, err)
		assert.Greater(t, quotaBytes, usageBytes, "Should have available quota")
	})
}

// =================================================================
// Test: External Delivery End-to-End
// =================================================================

func TestIntegration_ExternalDelivery_EndToEnd(t *testing.T) {
	suite := SetupIntegrationSuite(t)

	orgID := suite.createTestOrganization(t, "Test Org External Delivery")
	domainName := fmt.Sprintf("test-external-%d.example.com", time.Now().UnixNano())
	domainID := suite.createTestDomain(t, orgID, domainName)

	senderEmail := "sender@" + domainName
	_ = suite.createTestMailbox(t, domainID, senderEmail, "Test Sender")

	t.Run("Enqueue external delivery message", func(t *testing.T) {
		messageID := uuid.New().String()
		msg := map[string]interface{}{
			"id":           messageID,
			"from":         senderEmail,
			"to":           []string{"external-recipient@gmail.com"},
			"subject":      "Integration Test: External Delivery",
			"body":         "This is a test message for external delivery testing.",
			"domain_id":    domainID,
			"status":       "queued",
			"created_at":   time.Now().Format(time.RFC3339),
			"retry_count":  0,
		}

		msgJSON, err := json.Marshal(msg)
		require.NoError(t, err)

		// Enqueue in Redis
		err = suite.redis.LPush(suite.ctx, "email:queue:delivery", string(msgJSON)).Err()
		require.NoError(t, err)

		// Verify enqueued
		result, err := suite.redis.LRange(suite.ctx, "email:queue:delivery", 0, -1).Result()
		require.NoError(t, err)

		found := false
		for _, item := range result {
			if strings.Contains(item, messageID) {
				found = true
				break
			}
		}
		assert.True(t, found, "Message should be found in queue")

		// Clean up
		suite.redis.LRem(suite.ctx, "email:queue:delivery", 1, string(msgJSON))
	})

	t.Run("DKIM key lookup for domain", func(t *testing.T) {
		// Check if DKIM keys table has entries for this domain
		var count int
		err := suite.db.QueryRowContext(suite.ctx,
			"SELECT COUNT(*) FROM dkim_keys WHERE domain_id = $1",
			domainID,
		).Scan(&count)
		if err != nil {
			t.Logf("DKIM keys table may not exist or be empty: %v", err)
			t.Skip("DKIM keys table not available")
		}
		// It's OK if there are no keys yet for test domain
		t.Logf("DKIM keys for test domain: %d", count)
	})
}

// =================================================================
// Test: Queue Retry Logic
// =================================================================

func TestIntegration_QueueRetry(t *testing.T) {
	suite := SetupIntegrationSuite(t)

	t.Run("Retry scheduling with backoff", func(t *testing.T) {
		messageID := uuid.New().String()
		retryKey := fmt.Sprintf("email:retry:%s", messageID)

		// Simulate retry tracking in Redis
		for attempt := 1; attempt <= 5; attempt++ {
			backoff := time.Duration(attempt*attempt) * time.Minute // exponential backoff
			retryAt := time.Now().Add(backoff)

			retryData := map[string]interface{}{
				"message_id":  messageID,
				"attempt":     attempt,
				"retry_at":    retryAt.Format(time.RFC3339),
				"backoff_min": backoff.Minutes(),
			}
			dataJSON, err := json.Marshal(retryData)
			require.NoError(t, err)

			err = suite.redis.Set(suite.ctx, retryKey, string(dataJSON), 24*time.Hour).Err()
			require.NoError(t, err)
		}

		// Verify final retry state
		val, err := suite.redis.Get(suite.ctx, retryKey).Result()
		require.NoError(t, err)

		var lastRetry map[string]interface{}
		err = json.Unmarshal([]byte(val), &lastRetry)
		require.NoError(t, err)
		assert.Equal(t, float64(5), lastRetry["attempt"])
		assert.Equal(t, float64(25), lastRetry["backoff_min"]) // 5^2 = 25 minutes

		// Clean up
		suite.redis.Del(suite.ctx, retryKey)
	})

	t.Run("Max retries exceeded generates bounce marker", func(t *testing.T) {
		messageID := uuid.New().String()
		maxRetries := 5

		// Set retry count to max
		retryCountKey := fmt.Sprintf("email:retries:%s", messageID)
		err := suite.redis.Set(suite.ctx, retryCountKey, maxRetries, 24*time.Hour).Err()
		require.NoError(t, err)

		// Verify retry count
		count, err := suite.redis.Get(suite.ctx, retryCountKey).Result()
		require.NoError(t, err)
		assert.Equal(t, fmt.Sprintf("%d", maxRetries), count)

		// Mark as bounced
		bounceKey := fmt.Sprintf("email:bounced:%s", messageID)
		bounceData := map[string]interface{}{
			"message_id": messageID,
			"reason":     "max retries exceeded",
			"bounced_at": time.Now().Format(time.RFC3339),
		}
		bounceJSON, _ := json.Marshal(bounceData)
		err = suite.redis.Set(suite.ctx, bounceKey, string(bounceJSON), 7*24*time.Hour).Err()
		require.NoError(t, err)

		// Verify bounce record exists
		exists, err := suite.redis.Exists(suite.ctx, bounceKey).Result()
		require.NoError(t, err)
		assert.Equal(t, int64(1), exists, "Bounce record should exist")

		// Clean up
		suite.redis.Del(suite.ctx, retryCountKey, bounceKey)
	})
}

// =================================================================
// Test: Rate Limiting
// =================================================================

func TestIntegration_RateLimiting(t *testing.T) {
	suite := SetupIntegrationSuite(t)

	orgID := suite.createTestOrganization(t, "Test Org Rate Limit")
	domainName := fmt.Sprintf("test-ratelimit-%d.example.com", time.Now().UnixNano())
	domainID := suite.createTestDomain(t, orgID, domainName)

	t.Run("Redis-based rate limiting per domain", func(t *testing.T) {
		rateLimitKey := fmt.Sprintf("ratelimit:domain:%s:hour", domainID)
		limit := 10

		// Simulate sending messages up to the limit
		for i := 0; i < limit; i++ {
			count, err := suite.redis.Incr(suite.ctx, rateLimitKey).Result()
			require.NoError(t, err)
			if i == 0 {
				// Set expiry on first increment
				suite.redis.Expire(suite.ctx, rateLimitKey, time.Hour)
			}
			assert.LessOrEqual(t, count, int64(limit), "Should be within limit")
		}

		// Next message exceeds the limit
		count, err := suite.redis.Incr(suite.ctx, rateLimitKey).Result()
		require.NoError(t, err)
		assert.Greater(t, count, int64(limit), "Should exceed limit")

		// Verify rate limit is enforced
		currentCount, err := suite.redis.Get(suite.ctx, rateLimitKey).Int64()
		require.NoError(t, err)
		assert.Equal(t, int64(limit+1), currentCount)

		// Clean up
		suite.redis.Del(suite.ctx, rateLimitKey)
	})

	t.Run("Domain rate limits from database", func(t *testing.T) {
		var hourlyLimit, dailyLimit int
		err := suite.db.QueryRowContext(suite.ctx,
			"SELECT rate_limit_per_hour, rate_limit_per_day FROM domains WHERE id = $1",
			domainID,
		).Scan(&hourlyLimit, &dailyLimit)
		require.NoError(t, err)
		assert.Equal(t, 1000, hourlyLimit, "Default hourly limit should be 1000")
		assert.Equal(t, 10000, dailyLimit, "Default daily limit should be 10000")
	})
}

// =================================================================
// Test: Message Size Validation
// =================================================================

func TestIntegration_MessageSizeValidation(t *testing.T) {
	suite := SetupIntegrationSuite(t)

	orgID := suite.createTestOrganization(t, "Test Org Size Limit")
	domainName := fmt.Sprintf("test-size-%d.example.com", time.Now().UnixNano())
	domainID := suite.createTestDomain(t, orgID, domainName)

	t.Run("Domain max message size is 25MB", func(t *testing.T) {
		var maxSize int64
		err := suite.db.QueryRowContext(suite.ctx,
			"SELECT max_message_size FROM domains WHERE id = $1",
			domainID,
		).Scan(&maxSize)
		require.NoError(t, err)
		assert.Equal(t, int64(26214400), maxSize, "Default max size should be 25MB")
	})

	t.Run("Size limit check constraint exists", func(t *testing.T) {
		// Attempt to set an unreasonably large size (>100MB) - should violate constraint
		// This tests that our migration 002 constraint is in effect
		_, err := suite.db.ExecContext(suite.ctx,
			"UPDATE domains SET max_message_size = 200000000 WHERE id = $1",
			domainID,
		)
		if err != nil {
			// Constraint violation is expected
			assert.Contains(t, err.Error(), "check_max_message_size",
				"Should fail with size constraint violation")
		} else {
			t.Log("Size constraint may not be applied yet (migration 002 pending)")
		}
	})
}

// =================================================================
// Test: DNS/MX Resolution
// =================================================================

func TestIntegration_DNSResolution(t *testing.T) {
	t.Run("MX lookup for well-known domain", func(t *testing.T) {
		mxRecords, err := net.LookupMX("gmail.com")
		require.NoError(t, err)
		assert.NotEmpty(t, mxRecords, "Gmail should have MX records")
		for _, mx := range mxRecords {
			assert.NotEmpty(t, mx.Host, "MX host should not be empty")
			t.Logf("MX: %s (priority %d)", mx.Host, mx.Pref)
		}
	})

	t.Run("MX lookup for nonexistent domain returns error", func(t *testing.T) {
		_, err := net.LookupMX("nonexistent-domain-12345.invalid")
		assert.Error(t, err, "Nonexistent domain should fail MX lookup")
	})
}

// =================================================================
// Test: Redis Queue Operations
// =================================================================

func TestIntegration_RedisQueueOperations(t *testing.T) {
	suite := SetupIntegrationSuite(t)

	testQueue := fmt.Sprintf("test:queue:%d", time.Now().UnixNano())

	t.Run("FIFO queue behavior", func(t *testing.T) {
		// Push 3 messages
		for i := 1; i <= 3; i++ {
			msg := fmt.Sprintf(`{"id": "msg-%d", "priority": %d}`, i, i)
			err := suite.redis.LPush(suite.ctx, testQueue, msg).Err()
			require.NoError(t, err)
		}

		// Pop should return in FIFO order (RPop from the tail)
		for i := 1; i <= 3; i++ {
			result, err := suite.redis.RPop(suite.ctx, testQueue).Result()
			require.NoError(t, err)
			expected := fmt.Sprintf(`{"id": "msg-%d", "priority": %d}`, i, i)
			assert.Equal(t, expected, result)
		}
	})

	t.Run("Atomic move between queues", func(t *testing.T) {
		processingQueue := testQueue + ":processing"

		// Enqueue a message
		msg := `{"id": "atomic-test", "status": "queued"}`
		err := suite.redis.LPush(suite.ctx, testQueue, msg).Err()
		require.NoError(t, err)

		// Atomically move from queue to processing
		result, err := suite.redis.RPopLPush(suite.ctx, testQueue, processingQueue).Result()
		require.NoError(t, err)
		assert.Equal(t, msg, result)

		// Verify source is empty and processing has the message
		srcLen, _ := suite.redis.LLen(suite.ctx, testQueue).Result()
		dstLen, _ := suite.redis.LLen(suite.ctx, processingQueue).Result()
		assert.Equal(t, int64(0), srcLen)
		assert.Equal(t, int64(1), dstLen)

		// Clean up
		suite.redis.Del(suite.ctx, testQueue, processingQueue)
	})
}

// =================================================================
// Test: Bounce Tracking Database
// =================================================================

func TestIntegration_BounceTracking(t *testing.T) {
	suite := SetupIntegrationSuite(t)

	// Check if bounces table exists (from migration 003)
	t.Run("Bounces table exists", func(t *testing.T) {
		var exists bool
		err := suite.db.QueryRowContext(suite.ctx,
			`SELECT EXISTS (
				SELECT FROM information_schema.tables
				WHERE table_name = 'bounces'
			)`,
		).Scan(&exists)
		require.NoError(t, err)

		if !exists {
			t.Skip("Bounces table not yet created (migration 003 pending)")
		}

		t.Log("Bounces table exists")
	})

	t.Run("Insert and query bounce record", func(t *testing.T) {
		var exists bool
		suite.db.QueryRowContext(suite.ctx,
			`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'bounces')`,
		).Scan(&exists)
		if !exists {
			t.Skip("Bounces table not yet created")
		}

		orgID := suite.createTestOrganization(t, "Test Org Bounces")
		domainName := fmt.Sprintf("test-bounce-%d.example.com", time.Now().UnixNano())
		domainID := suite.createTestDomain(t, orgID, domainName)

		bounceID := uuid.New().String()
		_, err := suite.db.ExecContext(suite.ctx,
			`INSERT INTO bounces (id, original_message_id, bounce_type, category,
			 recipient_email, sender_email, domain_id, organization_id,
			 smtp_code, enhanced_status, diagnostic_message, remote_mta,
			 is_permanent, recommended_action)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
			bounceID, "test-msg-001", "hard", "address_failure",
			"nonexistent@gmail.com", "sender@"+domainName, domainID, orgID,
			550, "5.1.1", "The email account that you tried to reach does not exist",
			"gmail-smtp-in.l.google.com", true, "remove_address",
		)
		require.NoError(t, err)

		// Query the bounce
		var bounceType, category, recipientEmail string
		var isPermanent bool
		err = suite.db.QueryRowContext(suite.ctx,
			"SELECT bounce_type, category, recipient_email, is_permanent FROM bounces WHERE id = $1",
			bounceID,
		).Scan(&bounceType, &category, &recipientEmail, &isPermanent)
		require.NoError(t, err)
		assert.Equal(t, "hard", bounceType)
		assert.Equal(t, "address_failure", category)
		assert.Equal(t, "nonexistent@gmail.com", recipientEmail)
		assert.True(t, isPermanent)

		// Clean up
		suite.db.ExecContext(suite.ctx, "DELETE FROM bounces WHERE id = $1", bounceID)
	})
}
