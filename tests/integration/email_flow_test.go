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
