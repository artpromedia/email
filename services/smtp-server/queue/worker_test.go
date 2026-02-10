package queue

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/oonrumail/smtp-server/config"
	"github.com/oonrumail/smtp-server/domain"
	"github.com/oonrumail/smtp-server/testutil"

	"go.uber.org/zap"
)

// TestWorker_ProcessMessage_LocalDelivery tests local message delivery
func TestWorker_ProcessMessage_LocalDelivery(t *testing.T) {
	tests := []struct {
		name           string
		message        *domain.Message
		mailbox        *domain.Mailbox
		targetDomain   *domain.Domain
		expectDelivery bool
		expectError    bool
	}{
		{
			name: "successful local delivery",
			message: &domain.Message{
				ID:             "msg-1",
				OrganizationID: "org-1",
				FromAddress:    "sender@external.com",
				Recipients:     []string{"user1@example.com"},
				Subject:        "Test Message",
				Status:         domain.StatusQueued,
				QueuedAt:       time.Now(),
				MaxRetries:     5,
			},
			mailbox: &domain.Mailbox{
				ID:             "mailbox-1",
				Email:          "user1@example.com",
				QuotaBytes:     10737418240,
				UsedBytes:      0,
				IsActive:       true,
				OrganizationID: "org-1",
				DomainID:       "domain-1",
			},
			targetDomain: &domain.Domain{
				ID:       "domain-1",
				Name:     "example.com",
				Status:   domain.DomainStatusVerified,
				Policies: domain.DefaultPolicies(),
			},
			expectDelivery: true,
			expectError:    false,
		},
		{
			name: "delivery fails when quota exceeded",
			message: &domain.Message{
				ID:             "msg-2",
				OrganizationID: "org-1",
				FromAddress:    "sender@external.com",
				Recipients:     []string{"user2@example.com"},
				Subject:        "Large Message",
				Status:         domain.StatusQueued,
				QueuedAt:       time.Now(),
				MaxRetries:     5,
			},
			mailbox: &domain.Mailbox{
				ID:             "mailbox-2",
				Email:          "user2@example.com",
				QuotaBytes:     1000,        // 1KB quota
				UsedBytes:      999,         // Almost full
				IsActive:       true,
				OrganizationID: "org-1",
				DomainID:       "domain-1",
			},
			targetDomain: &domain.Domain{
				ID:       "domain-1",
				Name:     "example.com",
				Status:   domain.DomainStatusVerified,
				Policies: domain.DefaultPolicies(),
			},
			expectDelivery: false,
			expectError:    true,
		},
		{
			name: "delivery fails for unknown recipient",
			message: &domain.Message{
				ID:             "msg-3",
				OrganizationID: "org-1",
				FromAddress:    "sender@external.com",
				Recipients:     []string{"unknown@example.com"},
				Subject:        "Test Message",
				Status:         domain.StatusQueued,
				QueuedAt:       time.Now(),
				MaxRetries:     5,
			},
			mailbox: nil, // No mailbox for this recipient
			targetDomain: &domain.Domain{
				ID:     "domain-1",
				Name:   "example.com",
				Status: domain.DomainStatusVerified,
				Policies: &domain.DomainPolicies{
					RejectUnknownUsers: true,
				},
			},
			expectDelivery: false,
			expectError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			tmpDir := t.TempDir()
			cfg := &config.Config{
				Server: config.ServerConfig{
					Hostname: "mail.example.com",
				},
				Queue: config.QueueConfig{
					StoragePath:   tmpDir,
					Workers:       1,
					RetryAttempts: 5,
					RetryDelay:    5 * time.Minute,
					MaxRetryDelay: 6 * time.Hour,
				},
			}

			mockRepo := testutil.NewMockMessageRepository()
			mockDomainCache := testutil.NewMockDomainProvider()
			logger := testutil.TestLogger()

			// Add domain to cache
			mockDomainCache.AddDomain(tt.targetDomain)

			// Add mailbox if provided
			if tt.mailbox != nil {
				mockRepo.AddMailbox(tt.mailbox)
			}

			// Create message data file
			messageData := []byte("From: sender@external.com\r\nTo: " + tt.message.Recipients[0] + "\r\nSubject: Test\r\n\r\nTest body")
			msgPath := filepath.Join(tmpDir, "test.eml")
			if err := os.WriteFile(msgPath, messageData, 0644); err != nil {
				t.Fatalf("Failed to write test message: %v", err)
			}
			tt.message.RawMessagePath = msgPath

			// Create manager with mocks
			manager := &Manager{
				config:       cfg,
				msgRepo:      mockRepo,
				domainCache:  mockDomainCache,
				logger:       logger,
				rateLimiters: make(map[string]*RateLimiter),
			}

			// Create worker
			worker := NewWorker(0, manager, logger.Named("worker"))

			// Execute delivery
			err := worker.deliverLocal(ctx, tt.message, tt.targetDomain)

			// Verify results
			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
			}
			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

// TestWorker_DeliverToMailbox tests delivery to different recipient types
func TestWorker_DeliverToMailbox(t *testing.T) {
	tests := []struct {
		name          string
		recipient     string
		setupRepo     func(*testutil.MockMessageRepository)
		setupDomain   *domain.Domain
		expectSuccess bool
	}{
		{
			name:      "deliver to mailbox",
			recipient: "user@example.com",
			setupRepo: func(repo *testutil.MockMessageRepository) {
				repo.AddMailbox(&domain.Mailbox{
					ID:             "mb-1",
					Email:          "user@example.com",
					IsActive:       true,
					QuotaBytes:     10737418240,
					UsedBytes:      0,
					OrganizationID: "org-1",
					DomainID:       "domain-1",
				})
			},
			setupDomain: &domain.Domain{
				ID:       "domain-1",
				Name:     "example.com",
				Policies: domain.DefaultPolicies(),
			},
			expectSuccess: true,
		},
		{
			name:      "deliver to alias",
			recipient: "alias@example.com",
			setupRepo: func(repo *testutil.MockMessageRepository) {
				repo.AddAlias(&domain.Alias{
					ID:          "alias-1",
					SourceEmail: "alias@example.com",
					TargetEmail: "realuser@example.com",
					IsActive:    true,
				})
				repo.AddMailbox(&domain.Mailbox{
					ID:             "mb-1",
					Email:          "realuser@example.com",
					IsActive:       true,
					QuotaBytes:     10737418240,
					UsedBytes:      0,
					OrganizationID: "org-1",
					DomainID:       "domain-1",
				})
			},
			setupDomain: &domain.Domain{
				ID:       "domain-1",
				Name:     "example.com",
				Policies: domain.DefaultPolicies(),
			},
			expectSuccess: true,
		},
		{
			name:      "deliver to distribution list",
			recipient: "team@example.com",
			setupRepo: func(repo *testutil.MockMessageRepository) {
				repo.AddDistributionList(&domain.DistributionList{
					ID:       "dl-1",
					Email:    "team@example.com",
					Members:  []string{"member1@example.com", "member2@example.com"},
					IsActive: true,
				})
				repo.AddMailbox(&domain.Mailbox{
					ID:         "mb-1",
					Email:      "member1@example.com",
					IsActive:   true,
					QuotaBytes: 10737418240,
				})
				repo.AddMailbox(&domain.Mailbox{
					ID:         "mb-2",
					Email:      "member2@example.com",
					IsActive:   true,
					QuotaBytes: 10737418240,
				})
			},
			setupDomain: &domain.Domain{
				ID:       "domain-1",
				Name:     "example.com",
				Policies: domain.DefaultPolicies(),
			},
			expectSuccess: true,
		},
		{
			name:      "catch-all enabled",
			recipient: "unknown@example.com",
			setupRepo: func(repo *testutil.MockMessageRepository) {
				repo.AddMailbox(&domain.Mailbox{
					ID:         "mb-catchall",
					Email:      "catchall@example.com",
					IsActive:   true,
					QuotaBytes: 10737418240,
				})
			},
			setupDomain: &domain.Domain{
				ID:   "domain-1",
				Name: "example.com",
				Policies: &domain.DomainPolicies{
					CatchAllEnabled: true,
					CatchAllAddress: "catchall@example.com",
				},
			},
			expectSuccess: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			tmpDir := t.TempDir()
			cfg := &config.Config{
				Server: config.ServerConfig{Hostname: "mail.example.com"},
				Queue: config.QueueConfig{
					StoragePath: tmpDir,
				},
			}

			mockRepo := testutil.NewMockMessageRepository()
			mockDomainCache := testutil.NewMockDomainProvider()
			logger := testutil.TestLogger()

			tt.setupRepo(mockRepo)
			mockDomainCache.AddDomain(tt.setupDomain)

			manager := &Manager{
				config:       cfg,
				msgRepo:      mockRepo,
				domainCache:  mockDomainCache,
				logger:       logger,
				rateLimiters: make(map[string]*RateLimiter),
			}

			worker := NewWorker(0, manager, logger.Named("worker"))

			msg := &domain.Message{
				ID:          "test-msg",
				FromAddress: "sender@external.com",
				Recipients:  []string{tt.recipient},
			}
			data := []byte("From: sender@external.com\r\nTo: " + tt.recipient + "\r\nSubject: Test\r\n\r\nBody")

			err := worker.deliverToMailbox(ctx, msg, tt.setupDomain, tt.recipient, data)

			if tt.expectSuccess && err != nil {
				t.Errorf("Expected success but got error: %v", err)
			}
			if !tt.expectSuccess && err == nil {
				t.Error("Expected error but got success")
			}
		})
	}
}

// TestWorker_GenerateBounceMessage tests bounce message generation
func TestWorker_GenerateBounceMessage(t *testing.T) {
	tests := []struct {
		name           string
		message        *domain.Message
		reason         string
		expectBounce   bool
		expectNoBounce bool // For bounces of bounces
	}{
		{
			name: "generates bounce for failed delivery",
			message: &domain.Message{
				ID:          "msg-1",
				FromAddress: "sender@external.com",
				Recipients:  []string{"recipient@example.com"},
				Subject:     "Original Message",
				QueuedAt:    time.Now(),
			},
			reason:       "Mailbox not found",
			expectBounce: true,
		},
		{
			name: "does not bounce a bounce (null sender)",
			message: &domain.Message{
				ID:          "bounce-1",
				FromAddress: "", // Null sender
				Recipients:  []string{"original-sender@external.com"},
				Subject:     "Delivery Status Notification",
				QueuedAt:    time.Now(),
			},
			reason:         "Secondary failure",
			expectNoBounce: true,
		},
		{
			name: "does not bounce MAILER-DAEMON",
			message: &domain.Message{
				ID:          "bounce-2",
				FromAddress: "MAILER-DAEMON@mail.example.com",
				Recipients:  []string{"original-sender@external.com"},
				Subject:     "Delivery Status Notification",
				QueuedAt:    time.Now(),
			},
			reason:         "Secondary failure",
			expectNoBounce: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			tmpDir := t.TempDir()
			cfg := &config.Config{
				Server: config.ServerConfig{Hostname: "mail.example.com"},
				Queue: config.QueueConfig{
					StoragePath: tmpDir,
				},
			}

			mockRepo := testutil.NewMockMessageRepository()
			logger := testutil.TestLogger()

			var enqueuedBounce *domain.Message
			mockRepo.OnCreateMessage = func(msg *domain.Message) error {
				enqueuedBounce = msg
				return nil
			}

			manager := &Manager{
				config:       cfg,
				msgRepo:      mockRepo,
				logger:       logger,
				rateLimiters: make(map[string]*RateLimiter),
			}

			worker := NewWorker(0, manager, logger.Named("worker"))

			// Write original message data
			if tt.message.RawMessagePath == "" {
				msgPath := filepath.Join(tmpDir, "original.eml")
				os.WriteFile(msgPath, []byte("Subject: Test\r\n\r\nBody"), 0644)
				tt.message.RawMessagePath = msgPath
			}

			err := worker.generateBounceMessage(ctx, tt.message, tt.reason)

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}

			if tt.expectBounce && enqueuedBounce == nil {
				t.Error("Expected bounce message to be enqueued but none was")
			}
			if tt.expectNoBounce && enqueuedBounce != nil {
				t.Error("Expected no bounce but one was enqueued")
			}

			if enqueuedBounce != nil {
				// Verify bounce message structure
				if enqueuedBounce.FromAddress != "" {
					t.Error("Bounce message should have null sender")
				}
				if len(enqueuedBounce.Recipients) != 1 || enqueuedBounce.Recipients[0] != tt.message.FromAddress {
					t.Error("Bounce should be sent to original sender")
				}
			}
		})
	}
}

// TestWorker_RetryLogic tests the retry scheduling logic
func TestWorker_RetryLogic(t *testing.T) {
	tests := []struct {
		name              string
		retryCount        int
		maxRetries        int
		expectRetry       bool
		expectBounce      bool
		expectMinDelay    time.Duration
	}{
		{
			name:           "first retry",
			retryCount:     0,
			maxRetries:     5,
			expectRetry:    true,
			expectBounce:   false,
			expectMinDelay: 5 * time.Minute, // Base delay
		},
		{
			name:           "second retry with exponential backoff",
			retryCount:     1,
			maxRetries:     5,
			expectRetry:    true,
			expectBounce:   false,
			expectMinDelay: 10 * time.Minute, // 2x base
		},
		{
			name:           "max retries exceeded",
			retryCount:     5,
			maxRetries:     5,
			expectRetry:    false,
			expectBounce:   true,
			expectMinDelay: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			tmpDir := t.TempDir()
			cfg := &config.Config{
				Server: config.ServerConfig{Hostname: "mail.example.com"},
				Queue: config.QueueConfig{
					StoragePath:   tmpDir,
					RetryDelay:    5 * time.Minute,
					MaxRetryDelay: 6 * time.Hour,
				},
			}

			mockRepo := testutil.NewMockMessageRepository()
			logger := testutil.TestLogger()

			var retryScheduled bool
			var scheduledTime time.Time
			mockRepo.OnUpdateMessageRetry = func(id string, nextRetry time.Time, lastError string) error {
				retryScheduled = true
				scheduledTime = nextRetry
				return nil
			}

			var markedFailed bool
			mockRepo.OnUpdateMessageStatus = func(id string, status domain.MessageStatus) error {
				if status == domain.StatusFailed {
					markedFailed = true
				}
				return nil
			}

			manager := &Manager{
				config:       cfg,
				msgRepo:      mockRepo,
				logger:       logger,
				rateLimiters: make(map[string]*RateLimiter),
			}

			msg := &domain.Message{
				ID:          "test-msg",
				FromAddress: "sender@example.com",
				Recipients:  []string{"recipient@external.com"},
				RetryCount:  tt.retryCount,
				MaxRetries:  tt.maxRetries,
				QueuedAt:    time.Now(),
			}

			// Write message data for potential bounce
			msgPath := filepath.Join(tmpDir, "test.eml")
			os.WriteFile(msgPath, []byte("Subject: Test\r\n\r\nBody"), 0644)
			msg.RawMessagePath = msgPath

			if tt.expectRetry {
				err := manager.ScheduleRetry(ctx, msg, "Test error")
				if err != nil {
					t.Errorf("Unexpected error scheduling retry: %v", err)
				}
				if !retryScheduled {
					t.Error("Expected retry to be scheduled")
				}
				if tt.expectMinDelay > 0 {
					expectedMin := time.Now().Add(tt.expectMinDelay)
					if scheduledTime.Before(expectedMin.Add(-time.Second)) {
						t.Errorf("Retry scheduled too early: got %v, expected at least %v", scheduledTime, expectedMin)
					}
				}
			}

			if tt.expectBounce {
				err := manager.MarkFailed(ctx, msg)
				if err != nil {
					t.Errorf("Unexpected error marking failed: %v", err)
				}
				if !markedFailed {
					t.Error("Expected message to be marked as failed")
				}
			}
		})
	}
}

// TestWorker_StoreInMailbox tests mailbox storage with quota checks
func TestWorker_StoreInMailbox(t *testing.T) {
	tests := []struct {
		name        string
		mailbox     *domain.Mailbox
		dataSize    int
		expectError bool
		errorMsg    string
	}{
		{
			name: "successful storage with room",
			mailbox: &domain.Mailbox{
				ID:             "mb-1",
				Email:          "user@example.com",
				QuotaBytes:     10000,
				UsedBytes:      1000,
				OrganizationID: "org-1",
				DomainID:       "domain-1",
			},
			dataSize:    500,
			expectError: false,
		},
		{
			name: "storage fails when quota exceeded",
			mailbox: &domain.Mailbox{
				ID:             "mb-2",
				Email:          "full@example.com",
				QuotaBytes:     1000,
				UsedBytes:      999,
				OrganizationID: "org-1",
				DomainID:       "domain-1",
			},
			dataSize:    500,
			expectError: true,
			errorMsg:    "quota exceeded",
		},
		{
			name: "storage succeeds when quota is unlimited (0)",
			mailbox: &domain.Mailbox{
				ID:             "mb-3",
				Email:          "unlimited@example.com",
				QuotaBytes:     0, // Unlimited
				UsedBytes:      1000000000,
				OrganizationID: "org-1",
				DomainID:       "domain-1",
			},
			dataSize:    500,
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			tmpDir := t.TempDir()
			cfg := &config.Config{
				Server: config.ServerConfig{Hostname: "mail.example.com"},
				Queue: config.QueueConfig{
					StoragePath: tmpDir,
				},
			}

			mockRepo := testutil.NewMockMessageRepository()
			logger := testutil.TestLogger()

			manager := &Manager{
				config:       cfg,
				msgRepo:      mockRepo,
				logger:       logger,
				rateLimiters: make(map[string]*RateLimiter),
			}

			worker := NewWorker(0, manager, logger.Named("worker"))

			msg := &domain.Message{
				ID:          "test-msg",
				FromAddress: "sender@example.com",
			}

			data := bytes.Repeat([]byte("x"), tt.dataSize)

			err := worker.storeInMailbox(ctx, msg, tt.mailbox, data)

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				} else if tt.errorMsg != "" && !contains(err.Error(), tt.errorMsg) {
					t.Errorf("Expected error containing '%s', got: %v", tt.errorMsg, err)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

// Helper function
func contains(s, substr string) bool {
	return bytes.Contains([]byte(s), []byte(substr))
}
