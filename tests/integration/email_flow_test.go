// Package integration provides end-to-end integration tests for the email platform.
// These tests verify the complete email flow: send -> deliver -> receive.
package integration

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	_ "github.com/lib/pq"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// TestConfig holds configuration for integration tests
type TestConfig struct {
	DatabaseURL   string
	RedisURL      string
	MinioEndpoint string
	MinioAccess   string
	MinioSecret   string
	MinioBucket   string
	MinioUseSSL   bool
	SMTPHost      string
	SMTPPort      string
	MailpitAPI    string
}

// loadConfig loads test configuration from environment variables
func loadConfig() *TestConfig {
	return &TestConfig{
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://test_user:test_password@localhost:5433/email_test?sslmode=disable"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6380"),
		MinioEndpoint: getEnv("MINIO_ENDPOINT", "localhost:9002"),
		MinioAccess:   getEnv("MINIO_ACCESS_KEY", "test_access_key"),
		MinioSecret:   getEnv("MINIO_SECRET_KEY", "test_secret_key"),
		MinioBucket:   getEnv("MINIO_BUCKET", "test-attachments"),
		MinioUseSSL:   getEnv("MINIO_USE_SSL", "false") == "true",
		SMTPHost:      getEnv("SMTP_HOST", "localhost"),
		SMTPPort:      getEnv("SMTP_PORT", "1026"),
		MailpitAPI:    getEnv("MAILPIT_API", "http://localhost:8026"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// TestSuite holds shared resources for integration tests
type TestSuite struct {
	config      *TestConfig
	db          *sql.DB
	redis       *redis.Client
	minio       *minio.Client
	httpClient  *http.Client
}

// SetupSuite initializes the test suite with all required connections
func SetupSuite(t *testing.T) *TestSuite {
	t.Helper()
	config := loadConfig()

	suite := &TestSuite{
		config:     config,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}

	// Connect to PostgreSQL
	db, err := sql.Open("postgres", config.DatabaseURL)
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Fatalf("Failed to ping database: %v", err)
	}
	suite.db = db

	// Connect to Redis
	opt, err := redis.ParseURL(config.RedisURL)
	if err != nil {
		t.Fatalf("Failed to parse Redis URL: %v", err)
	}
	suite.redis = redis.NewClient(opt)
	if err := suite.redis.Ping(context.Background()).Err(); err != nil {
		t.Fatalf("Failed to connect to Redis: %v", err)
	}

	// Connect to MinIO
	minioClient, err := minio.New(config.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(config.MinioAccess, config.MinioSecret, ""),
		Secure: config.MinioUseSSL,
	})
	if err != nil {
		t.Fatalf("Failed to connect to MinIO: %v", err)
	}
	suite.minio = minioClient

	// Initialize test bucket
	ctx := context.Background()
	exists, err := minioClient.BucketExists(ctx, config.MinioBucket)
	if err != nil {
		t.Fatalf("Failed to check bucket existence: %v", err)
	}
	if !exists {
		if err := minioClient.MakeBucket(ctx, config.MinioBucket, minio.MakeBucketOptions{}); err != nil {
			t.Fatalf("Failed to create test bucket: %v", err)
		}
	}

	return suite
}

// TeardownSuite cleans up all resources
func (s *TestSuite) TeardownSuite(t *testing.T) {
	t.Helper()
	if s.db != nil {
		s.db.Close()
	}
	if s.redis != nil {
		s.redis.Close()
	}
}

// clearMailpit removes all messages from Mailpit
func (s *TestSuite) clearMailpit(t *testing.T) {
	t.Helper()
	req, err := http.NewRequest("DELETE", s.config.MailpitAPI+"/api/v1/messages", nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		t.Fatalf("Failed to clear Mailpit: %v", err)
	}
	defer resp.Body.Close()
}

// getMailpitMessages retrieves all messages from Mailpit
func (s *TestSuite) getMailpitMessages(t *testing.T) []MailpitMessage {
	t.Helper()
	resp, err := s.httpClient.Get(s.config.MailpitAPI + "/api/v1/messages")
	if err != nil {
		t.Fatalf("Failed to get Mailpit messages: %v", err)
	}
	defer resp.Body.Close()

	var result MailpitResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode Mailpit response: %v", err)
	}
	return result.Messages
}

// waitForMailpitMessage waits for a message to appear in Mailpit
func (s *TestSuite) waitForMailpitMessage(t *testing.T, timeout time.Duration, subject string) *MailpitMessage {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		messages := s.getMailpitMessages(t)
		for _, msg := range messages {
			if strings.Contains(msg.Subject, subject) {
				return &msg
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Fatalf("Timeout waiting for message with subject: %s", subject)
	return nil
}

// MailpitResponse represents the Mailpit API response
type MailpitResponse struct {
	Total    int              `json:"total"`
	Messages []MailpitMessage `json:"messages"`
}

// MailpitMessage represents a message in Mailpit
type MailpitMessage struct {
	ID      string            `json:"ID"`
	From    MailpitAddress    `json:"From"`
	To      []MailpitAddress  `json:"To"`
	Subject string            `json:"Subject"`
	Date    time.Time         `json:"Date"`
	Size    int               `json:"Size"`
	Read    bool              `json:"Read"`
}

// MailpitAddress represents an email address in Mailpit
type MailpitAddress struct {
	Name    string `json:"Name"`
	Address string `json:"Address"`
}

// TestEmailSendReceiveFlow tests the complete email send and receive flow
func TestEmailSendReceiveFlow(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	// Clear any existing messages
	suite.clearMailpit(t)

	t.Run("Basic Email Send", func(t *testing.T) {
		// Send a test email via SMTP
		from := "sender@test.example.com"
		to := []string{"recipient@test.example.com"}
		subject := "Integration Test - Basic Email"
		body := "This is a test email sent from integration tests."

		msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
			from, strings.Join(to, ", "), subject, body)

		addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
		err := smtp.SendMail(addr, nil, from, to, []byte(msg))
		if err != nil {
			t.Fatalf("Failed to send email: %v", err)
		}

		// Wait for message to appear in Mailpit
		received := suite.waitForMailpitMessage(t, 10*time.Second, subject)
		if received == nil {
			t.Fatal("Email was not received")
		}

		// Verify message content
		if received.From.Address != from {
			t.Errorf("From address mismatch: got %s, want %s", received.From.Address, from)
		}
		if len(received.To) != 1 || received.To[0].Address != to[0] {
			t.Errorf("To address mismatch: got %v, want %v", received.To, to)
		}
	})

	t.Run("Email with HTML Content", func(t *testing.T) {
		suite.clearMailpit(t)

		from := "sender@test.example.com"
		to := []string{"recipient@test.example.com"}
		subject := "Integration Test - HTML Email"
		htmlBody := `<html><body><h1>Hello</h1><p>This is an <strong>HTML</strong> email.</p></body></html>`

		msg := fmt.Sprintf(
			"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
			from, strings.Join(to, ", "), subject, htmlBody)

		addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
		err := smtp.SendMail(addr, nil, from, to, []byte(msg))
		if err != nil {
			t.Fatalf("Failed to send HTML email: %v", err)
		}

		received := suite.waitForMailpitMessage(t, 10*time.Second, subject)
		if received == nil {
			t.Fatal("HTML email was not received")
		}
	})

	t.Run("Email with Multiple Recipients", func(t *testing.T) {
		suite.clearMailpit(t)

		from := "sender@test.example.com"
		to := []string{
			"recipient1@test.example.com",
			"recipient2@test.example.com",
			"recipient3@test.example.com",
		}
		subject := "Integration Test - Multiple Recipients"
		body := "This email has multiple recipients."

		msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
			from, strings.Join(to, ", "), subject, body)

		addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
		err := smtp.SendMail(addr, nil, from, to, []byte(msg))
		if err != nil {
			t.Fatalf("Failed to send email to multiple recipients: %v", err)
		}

		received := suite.waitForMailpitMessage(t, 10*time.Second, subject)
		if received == nil {
			t.Fatal("Multi-recipient email was not received")
		}
	})

	t.Run("Large Email Body", func(t *testing.T) {
		suite.clearMailpit(t)

		from := "sender@test.example.com"
		to := []string{"recipient@test.example.com"}
		subject := "Integration Test - Large Body"

		// Create a 1MB body
		largeBody := strings.Repeat("X", 1024*1024)

		msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
			from, strings.Join(to, ", "), subject, largeBody)

		addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
		err := smtp.SendMail(addr, nil, from, to, []byte(msg))
		if err != nil {
			t.Fatalf("Failed to send large email: %v", err)
		}

		received := suite.waitForMailpitMessage(t, 30*time.Second, subject)
		if received == nil {
			t.Fatal("Large email was not received")
		}

		// Verify size is approximately correct (header overhead adds some bytes)
		if received.Size < 1024*1024 {
			t.Errorf("Email size too small: got %d, want at least %d", received.Size, 1024*1024)
		}
	})
}

// TestDatabaseIntegration tests database connectivity and operations
func TestDatabaseIntegration(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	t.Run("Database Connection", func(t *testing.T) {
		err := suite.db.Ping()
		if err != nil {
			t.Fatalf("Database ping failed: %v", err)
		}
	})

	t.Run("Database Query", func(t *testing.T) {
		var result int
		err := suite.db.QueryRow("SELECT 1").Scan(&result)
		if err != nil {
			t.Fatalf("Database query failed: %v", err)
		}
		if result != 1 {
			t.Errorf("Unexpected query result: got %d, want 1", result)
		}
	})

	t.Run("Database Version", func(t *testing.T) {
		var version string
		err := suite.db.QueryRow("SELECT version()").Scan(&version)
		if err != nil {
			t.Fatalf("Failed to get database version: %v", err)
		}
		if !strings.Contains(version, "PostgreSQL") {
			t.Errorf("Unexpected database version: %s", version)
		}
		t.Logf("Database version: %s", version)
	})
}

// TestRedisIntegration tests Redis connectivity and operations
func TestRedisIntegration(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	ctx := context.Background()

	t.Run("Redis Connection", func(t *testing.T) {
		err := suite.redis.Ping(ctx).Err()
		if err != nil {
			t.Fatalf("Redis ping failed: %v", err)
		}
	})

	t.Run("Redis Set/Get", func(t *testing.T) {
		key := "integration_test_key"
		value := "integration_test_value"

		err := suite.redis.Set(ctx, key, value, time.Minute).Err()
		if err != nil {
			t.Fatalf("Redis SET failed: %v", err)
		}

		result, err := suite.redis.Get(ctx, key).Result()
		if err != nil {
			t.Fatalf("Redis GET failed: %v", err)
		}
		if result != value {
			t.Errorf("Redis value mismatch: got %s, want %s", result, value)
		}

		// Cleanup
		suite.redis.Del(ctx, key)
	})

	t.Run("Redis Rate Limiting Simulation", func(t *testing.T) {
		key := "ratelimit:test:192.168.1.1"

		// Simulate rate limiting by incrementing a counter
		for i := 0; i < 5; i++ {
			count, err := suite.redis.Incr(ctx, key).Result()
			if err != nil {
				t.Fatalf("Redis INCR failed: %v", err)
			}
			if count != int64(i+1) {
				t.Errorf("Unexpected count: got %d, want %d", count, i+1)
			}
		}

		// Set expiry
		suite.redis.Expire(ctx, key, time.Minute)

		// Cleanup
		suite.redis.Del(ctx, key)
	})
}

// TestMinIOIntegration tests MinIO/S3 connectivity and operations
func TestMinIOIntegration(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	ctx := context.Background()

	t.Run("MinIO Connection", func(t *testing.T) {
		_, err := suite.minio.ListBuckets(ctx)
		if err != nil {
			t.Fatalf("MinIO list buckets failed: %v", err)
		}
	})

	t.Run("MinIO Upload/Download", func(t *testing.T) {
		objectName := "test-attachment.txt"
		content := "This is a test attachment content."

		// Upload
		reader := bytes.NewReader([]byte(content))
		_, err := suite.minio.PutObject(ctx, suite.config.MinioBucket, objectName, reader, int64(len(content)), minio.PutObjectOptions{
			ContentType: "text/plain",
		})
		if err != nil {
			t.Fatalf("MinIO upload failed: %v", err)
		}

		// Download
		obj, err := suite.minio.GetObject(ctx, suite.config.MinioBucket, objectName, minio.GetObjectOptions{})
		if err != nil {
			t.Fatalf("MinIO download failed: %v", err)
		}
		defer obj.Close()

		downloaded, err := io.ReadAll(obj)
		if err != nil {
			t.Fatalf("Failed to read downloaded object: %v", err)
		}

		if string(downloaded) != content {
			t.Errorf("Content mismatch: got %s, want %s", string(downloaded), content)
		}

		// Cleanup
		suite.minio.RemoveObject(ctx, suite.config.MinioBucket, objectName, minio.RemoveObjectOptions{})
	})

	t.Run("MinIO Large File Upload", func(t *testing.T) {
		objectName := "large-attachment.bin"
		// Create a 10MB file
		content := make([]byte, 10*1024*1024)
		for i := range content {
			content[i] = byte(i % 256)
		}

		reader := bytes.NewReader(content)
		_, err := suite.minio.PutObject(ctx, suite.config.MinioBucket, objectName, reader, int64(len(content)), minio.PutObjectOptions{
			ContentType: "application/octet-stream",
		})
		if err != nil {
			t.Fatalf("MinIO large file upload failed: %v", err)
		}

		// Verify size
		stat, err := suite.minio.StatObject(ctx, suite.config.MinioBucket, objectName, minio.StatObjectOptions{})
		if err != nil {
			t.Fatalf("MinIO stat failed: %v", err)
		}
		if stat.Size != int64(len(content)) {
			t.Errorf("Size mismatch: got %d, want %d", stat.Size, len(content))
		}

		// Cleanup
		suite.minio.RemoveObject(ctx, suite.config.MinioBucket, objectName, minio.RemoveObjectOptions{})
	})
}

// TestConcurrentEmailSending tests concurrent email sending
func TestConcurrentEmailSending(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	suite.clearMailpit(t)

	const numEmails = 10
	errChan := make(chan error, numEmails)

	// Send emails concurrently
	for i := 0; i < numEmails; i++ {
		go func(index int) {
			from := "sender@test.example.com"
			to := []string{fmt.Sprintf("recipient%d@test.example.com", index)}
			subject := fmt.Sprintf("Concurrent Test Email %d", index)
			body := fmt.Sprintf("This is concurrent test email number %d", index)

			msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
				from, strings.Join(to, ", "), subject, body)

			addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
			errChan <- smtp.SendMail(addr, nil, from, to, []byte(msg))
		}(i)
	}

	// Collect results
	var errors []error
	for i := 0; i < numEmails; i++ {
		if err := <-errChan; err != nil {
			errors = append(errors, err)
		}
	}

	if len(errors) > 0 {
		t.Errorf("Some emails failed to send: %v", errors)
	}

	// Wait for all messages to arrive
	time.Sleep(5 * time.Second)

	messages := suite.getMailpitMessages(t)
	if len(messages) < numEmails {
		t.Errorf("Not all emails were received: got %d, want %d", len(messages), numEmails)
	}
}

// TestEmailWithAttachment tests email delivery with MIME attachments
func TestEmailWithAttachment(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	suite.clearMailpit(t)

	from := "sender@test.example.com"
	to := []string{"recipient@test.example.com"}
	subject := "Integration Test - Email with Attachment"

	// Create multipart message with attachment
	boundary := "----=_Part_0_123456789.123456789"
	msg := fmt.Sprintf(`From: %s
To: %s
Subject: %s
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="%s"

--%s
Content-Type: text/plain; charset=UTF-8

This email has an attachment.

--%s
Content-Type: text/plain; name="test.txt"
Content-Disposition: attachment; filename="test.txt"
Content-Transfer-Encoding: base64

VGhpcyBpcyBhIHRlc3QgYXR0YWNobWVudCBmaWxlLg==

--%s--
`, from, strings.Join(to, ", "), subject, boundary, boundary, boundary, boundary)

	// Convert \n to \r\n for SMTP
	msg = strings.ReplaceAll(msg, "\n", "\r\n")

	addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
	err := smtp.SendMail(addr, nil, from, to, []byte(msg))
	if err != nil {
		t.Fatalf("Failed to send email with attachment: %v", err)
	}

	received := suite.waitForMailpitMessage(t, 10*time.Second, subject)
	if received == nil {
		t.Fatal("Email with attachment was not received")
	}
}

// TestEmailDeliveryFailure tests handling of invalid recipients
func TestEmailDeliveryFailure(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	t.Run("Invalid Sender Format", func(t *testing.T) {
		from := "invalid-email-format"
		to := []string{"recipient@test.example.com"}
		subject := "Test - Invalid Sender"
		body := "This should fail."

		msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
			from, strings.Join(to, ", "), subject, body)

		addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
		err := smtp.SendMail(addr, nil, from, to, []byte(msg))
		// Note: Some SMTP servers accept any format, this tests the behavior
		t.Logf("Invalid sender result: %v", err)
	})

	t.Run("Empty Recipients", func(t *testing.T) {
		from := "sender@test.example.com"
		to := []string{}
		subject := "Test - No Recipients"
		body := "This should fail."

		msg := fmt.Sprintf("From: %s\r\nSubject: %s\r\n\r\n%s",
			from, subject, body)

		addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
		err := smtp.SendMail(addr, nil, from, to, []byte(msg))
		if err == nil {
			t.Error("Expected error when sending to empty recipients")
		}
	})
}

// TestEmailHeaders tests that important headers are preserved
func TestEmailHeaders(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	suite.clearMailpit(t)

	from := "sender@test.example.com"
	to := []string{"recipient@test.example.com"}
	subject := "Integration Test - Header Preservation"
	messageID := "<test-message-id-12345@test.example.com>"

	msg := fmt.Sprintf(`From: %s
To: %s
Subject: %s
Message-ID: %s
Date: Mon, 01 Jan 2024 00:00:00 +0000
X-Custom-Header: CustomValue123
Reply-To: reply@test.example.com
Cc: cc@test.example.com

Test body with various headers.
`, from, strings.Join(to, ", "), subject, messageID)

	// Convert \n to \r\n for SMTP
	msg = strings.ReplaceAll(msg, "\n", "\r\n")

	addr := fmt.Sprintf("%s:%s", suite.config.SMTPHost, suite.config.SMTPPort)
	err := smtp.SendMail(addr, nil, from, to, []byte(msg))
	if err != nil {
		t.Fatalf("Failed to send email with headers: %v", err)
	}

	received := suite.waitForMailpitMessage(t, 10*time.Second, subject)
	if received == nil {
		t.Fatal("Email with headers was not received")
	}

	// Verify basic headers are present
	if received.From.Address != from {
		t.Errorf("From header mismatch: got %s, want %s", received.From.Address, from)
	}
	if received.Subject != subject {
		t.Errorf("Subject header mismatch: got %s, want %s", received.Subject, subject)
	}
}

// TestRateLimiting tests that rate limiting works correctly
func TestRateLimiting(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	ctx := context.Background()

	// Simulate rate limiting by tracking sends per sender
	senderKey := "ratelimit:smtp:sender@test.example.com"

	// Clear any existing rate limit data
	suite.redis.Del(ctx, senderKey)

	// Simulate hitting rate limit
	const limit = 100
	for i := 0; i < limit; i++ {
		count, err := suite.redis.Incr(ctx, senderKey).Result()
		if err != nil {
			t.Fatalf("Redis INCR failed: %v", err)
		}
		if count > int64(limit) {
			t.Logf("Rate limit would be exceeded at count %d", count)
		}
	}

	// Verify count reached limit
	count, err := suite.redis.Get(ctx, senderKey).Int64()
	if err != nil {
		t.Fatalf("Redis GET failed: %v", err)
	}
	if count != int64(limit) {
		t.Errorf("Rate limit count mismatch: got %d, want %d", count, limit)
	}

	// Cleanup
	suite.redis.Del(ctx, senderKey)
}

// TestEmailQueuePersistence tests that emails are persisted in queue
func TestEmailQueuePersistence(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	ctx := context.Background()

	// Test queue persistence using Redis list
	queueKey := "email:queue:outbound"

	// Clear queue
	suite.redis.Del(ctx, queueKey)

	// Add test messages to queue
	testMessages := []string{
		`{"id":"msg1","from":"a@test.com","to":["b@test.com"],"subject":"Test 1"}`,
		`{"id":"msg2","from":"c@test.com","to":["d@test.com"],"subject":"Test 2"}`,
		`{"id":"msg3","from":"e@test.com","to":["f@test.com"],"subject":"Test 3"}`,
	}

	for _, msg := range testMessages {
		err := suite.redis.RPush(ctx, queueKey, msg).Err()
		if err != nil {
			t.Fatalf("Failed to push to queue: %v", err)
		}
	}

	// Verify queue length
	length, err := suite.redis.LLen(ctx, queueKey).Result()
	if err != nil {
		t.Fatalf("Failed to get queue length: %v", err)
	}
	if length != int64(len(testMessages)) {
		t.Errorf("Queue length mismatch: got %d, want %d", length, len(testMessages))
	}

	// Process queue (LPOP simulates worker)
	for i := 0; i < len(testMessages); i++ {
		msg, err := suite.redis.LPop(ctx, queueKey).Result()
		if err != nil {
			t.Fatalf("Failed to pop from queue: %v", err)
		}
		if msg != testMessages[i] {
			t.Errorf("Queue message mismatch at position %d", i)
		}
	}

	// Verify queue is empty
	length, _ = suite.redis.LLen(ctx, queueKey).Result()
	if length != 0 {
		t.Errorf("Queue should be empty after processing, got length %d", length)
	}
}

// TestSessionManagement tests session creation and validation
func TestSessionManagement(t *testing.T) {
	suite := SetupSuite(t)
	defer suite.TeardownSuite(t)

	ctx := context.Background()

	t.Run("Create Session", func(t *testing.T) {
		sessionKey := "session:test-session-id-123"
		sessionData := `{"user_id":"user123","email":"test@example.com","created_at":"2024-01-01T00:00:00Z"}`

		err := suite.redis.Set(ctx, sessionKey, sessionData, 30*time.Minute).Err()
		if err != nil {
			t.Fatalf("Failed to create session: %v", err)
		}

		// Verify session exists
		result, err := suite.redis.Get(ctx, sessionKey).Result()
		if err != nil {
			t.Fatalf("Failed to get session: %v", err)
		}
		if result != sessionData {
			t.Errorf("Session data mismatch")
		}

		// Cleanup
		suite.redis.Del(ctx, sessionKey)
	})

	t.Run("Session Expiration", func(t *testing.T) {
		sessionKey := "session:expiring-session"
		sessionData := `{"user_id":"user456"}`

		// Create session with very short TTL
		err := suite.redis.Set(ctx, sessionKey, sessionData, 1*time.Second).Err()
		if err != nil {
			t.Fatalf("Failed to create expiring session: %v", err)
		}

		// Wait for expiration
		time.Sleep(2 * time.Second)

		// Verify session expired
		_, err = suite.redis.Get(ctx, sessionKey).Result()
		if err != redis.Nil {
			t.Error("Session should have expired")
		}
	})

	t.Run("Refresh Token Storage", func(t *testing.T) {
		tokenKey := "refresh_token:user123:token-hash-abc"
		tokenData := `{"session_id":"sess123","created_at":"2024-01-01T00:00:00Z","rotated":false}`

		err := suite.redis.Set(ctx, tokenKey, tokenData, 7*24*time.Hour).Err()
		if err != nil {
			t.Fatalf("Failed to store refresh token: %v", err)
		}

		// Verify token exists
		exists, err := suite.redis.Exists(ctx, tokenKey).Result()
		if err != nil {
			t.Fatalf("Failed to check token existence: %v", err)
		}
		if exists != 1 {
			t.Error("Refresh token should exist")
		}

		// Simulate token rotation (delete old, create new)
		newTokenKey := "refresh_token:user123:token-hash-xyz"
		newTokenData := `{"session_id":"sess123","created_at":"2024-01-01T00:00:00Z","rotated":true}`

		pipe := suite.redis.Pipeline()
		pipe.Del(ctx, tokenKey)
		pipe.Set(ctx, newTokenKey, newTokenData, 7*24*time.Hour)
		_, err = pipe.Exec(ctx)
		if err != nil {
			t.Fatalf("Failed to rotate token: %v", err)
		}

		// Verify old token is gone
		exists, _ = suite.redis.Exists(ctx, tokenKey).Result()
		if exists != 0 {
			t.Error("Old refresh token should be deleted after rotation")
		}

		// Verify new token exists
		exists, _ = suite.redis.Exists(ctx, newTokenKey).Result()
		if exists != 1 {
			t.Error("New refresh token should exist after rotation")
		}

		// Cleanup
		suite.redis.Del(ctx, newTokenKey)
	})
}
