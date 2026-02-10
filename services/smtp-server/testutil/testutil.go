// Package testutil provides testing utilities for the SMTP server
package testutil

import (
	"context"
	"sync"
	"time"

	"github.com/oonrumail/smtp-server/domain"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// MockRedisClient implements a mock Redis client for testing
type MockRedisClient struct {
	data  map[string]interface{}
	lists map[string][]string
	mu    sync.RWMutex
}

// NewMockRedisClient creates a new mock Redis client
func NewMockRedisClient() *MockRedisClient {
	return &MockRedisClient{
		data:  make(map[string]interface{}),
		lists: make(map[string][]string),
	}
}

// Get mocks redis GET
func (m *MockRedisClient) Get(ctx context.Context, key string) *redis.StringCmd {
	m.mu.RLock()
	defer m.mu.RUnlock()
	cmd := redis.NewStringCmd(ctx)
	if v, ok := m.data[key]; ok {
		if s, ok := v.(string); ok {
			cmd.SetVal(s)
		}
	} else {
		cmd.SetErr(redis.Nil)
	}
	return cmd
}

// Set mocks redis SET
func (m *MockRedisClient) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) *redis.StatusCmd {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[key] = value
	cmd := redis.NewStatusCmd(ctx)
	cmd.SetVal("OK")
	return cmd
}

// LPush mocks redis LPUSH
func (m *MockRedisClient) LPush(ctx context.Context, key string, values ...interface{}) *redis.IntCmd {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, v := range values {
		if s, ok := v.(string); ok {
			m.lists[key] = append([]string{s}, m.lists[key]...)
		}
	}
	cmd := redis.NewIntCmd(ctx)
	cmd.SetVal(int64(len(m.lists[key])))
	return cmd
}

// MockDomainProvider implements DomainProvider for testing
type MockDomainProvider struct {
	domains   map[string]*domain.Domain
	domainsID map[string]*domain.Domain
	mu        sync.RWMutex
}

// NewMockDomainProvider creates a new mock domain provider
func NewMockDomainProvider() *MockDomainProvider {
	return &MockDomainProvider{
		domains:   make(map[string]*domain.Domain),
		domainsID: make(map[string]*domain.Domain),
	}
}

// AddDomain adds a domain to the mock provider
func (m *MockDomainProvider) AddDomain(d *domain.Domain) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.domains[d.Name] = d
	m.domainsID[d.ID] = d
}

// GetDomain returns a domain by name
func (m *MockDomainProvider) GetDomain(name string) *domain.Domain {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.domains[name]
}

// GetDomainByID returns a domain by ID
func (m *MockDomainProvider) GetDomainByID(id string) *domain.Domain {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.domainsID[id]
}

// MockMessageRepository implements message repository for testing
type MockMessageRepository struct {
	messages  map[string]*domain.Message
	mailboxes map[string]*domain.Mailbox
	aliases   map[string]*domain.Alias
	dls       map[string]*domain.DistributionList
	mu        sync.RWMutex

	// Callbacks for verification
	OnCreateMessage         func(*domain.Message) error
	OnUpdateMessageStatus   func(string, domain.MessageStatus) error
	OnUpdateMessageRetry    func(string, time.Time, string) error
	OnMarkMessageProcessing func(string) error
}

// NewMockMessageRepository creates a new mock message repository
func NewMockMessageRepository() *MockMessageRepository {
	return &MockMessageRepository{
		messages:  make(map[string]*domain.Message),
		mailboxes: make(map[string]*domain.Mailbox),
		aliases:   make(map[string]*domain.Alias),
		dls:       make(map[string]*domain.DistributionList),
	}
}

// AddMessage adds a message to the mock repository
func (m *MockMessageRepository) AddMessage(msg *domain.Message) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages[msg.ID] = msg
}

// AddMailbox adds a mailbox to the mock repository
func (m *MockMessageRepository) AddMailbox(mailbox *domain.Mailbox) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mailboxes[mailbox.Email] = mailbox
}

// AddAlias adds an alias to the mock repository
func (m *MockMessageRepository) AddAlias(alias *domain.Alias) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.aliases[alias.SourceEmail] = alias
}

// AddDistributionList adds a distribution list to the mock repository
func (m *MockMessageRepository) AddDistributionList(dl *domain.DistributionList) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dls[dl.Email] = dl
}

// CreateMessage mocks creating a message
func (m *MockMessageRepository) CreateMessage(ctx context.Context, msg *domain.Message) error {
	if m.OnCreateMessage != nil {
		return m.OnCreateMessage(msg)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages[msg.ID] = msg
	return nil
}

// GetPendingMessages returns pending messages
func (m *MockMessageRepository) GetPendingMessages(ctx context.Context, limit int) ([]*domain.Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var result []*domain.Message
	for _, msg := range m.messages {
		if msg.Status == domain.StatusQueued {
			result = append(result, msg)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

// GetPendingMessagesByDomain returns pending messages for a domain
func (m *MockMessageRepository) GetPendingMessagesByDomain(ctx context.Context, domainID string, limit int) ([]*domain.Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var result []*domain.Message
	for _, msg := range m.messages {
		if msg.Status == domain.StatusQueued && msg.DomainID == domainID {
			result = append(result, msg)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

// UpdateMessageStatus updates message status
func (m *MockMessageRepository) UpdateMessageStatus(ctx context.Context, messageID string, status domain.MessageStatus) error {
	if m.OnUpdateMessageStatus != nil {
		return m.OnUpdateMessageStatus(messageID, status)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if msg, ok := m.messages[messageID]; ok {
		msg.Status = status
	}
	return nil
}

// UpdateMessageRetry updates retry info
func (m *MockMessageRepository) UpdateMessageRetry(ctx context.Context, messageID string, nextRetry time.Time, lastError string) error {
	if m.OnUpdateMessageRetry != nil {
		return m.OnUpdateMessageRetry(messageID, nextRetry, lastError)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if msg, ok := m.messages[messageID]; ok {
		msg.NextRetryAt = &nextRetry
		msg.LastError = lastError
		msg.RetryCount++
	}
	return nil
}

// MarkMessageProcessing marks a message as processing
func (m *MockMessageRepository) MarkMessageProcessing(ctx context.Context, messageID string) error {
	if m.OnMarkMessageProcessing != nil {
		return m.OnMarkMessageProcessing(messageID)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if msg, ok := m.messages[messageID]; ok {
		msg.Status = domain.StatusProcessing
	}
	return nil
}

// GetMailboxByEmail returns a mailbox by email
func (m *MockMessageRepository) GetMailboxByEmail(ctx context.Context, email string) (*domain.Mailbox, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if mailbox, ok := m.mailboxes[email]; ok {
		return mailbox, nil
	}
	return nil, nil
}

// GetAliasBySource returns an alias by source email
func (m *MockMessageRepository) GetAliasBySource(ctx context.Context, email string) (*domain.Alias, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if alias, ok := m.aliases[email]; ok {
		return alias, nil
	}
	return nil, nil
}

// GetDistributionListByEmail returns a DL by email
func (m *MockMessageRepository) GetDistributionListByEmail(ctx context.Context, email string) (*domain.DistributionList, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if dl, ok := m.dls[email]; ok {
		return dl, nil
	}
	return nil, nil
}

// UpdateMailboxUsage updates mailbox usage
func (m *MockMessageRepository) UpdateMailboxUsage(ctx context.Context, mailboxID string, additionalBytes int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, mailbox := range m.mailboxes {
		if mailbox.ID == mailboxID {
			mailbox.UsedBytes += additionalBytes
			break
		}
	}
	return nil
}

// RecordMailboxMessage records a message in a mailbox
func (m *MockMessageRepository) RecordMailboxMessage(ctx context.Context, mailboxID string, msg *domain.Message, storagePath string, size int64) error {
	return nil
}

// CleanupOldMessages cleans up old messages
func (m *MockMessageRepository) CleanupOldMessages(ctx context.Context, maxAge time.Duration) (int64, error) {
	return 0, nil
}

// ResetStuckMessages resets stuck messages
func (m *MockMessageRepository) ResetStuckMessages(ctx context.Context, stuckDuration time.Duration) (int64, error) {
	return 0, nil
}

// TestFixtures provides common test fixtures
type TestFixtures struct {
	Domains  []*domain.Domain
	Mailboxes []*domain.Mailbox
	Messages []*domain.Message
}

// NewTestFixtures creates a new set of test fixtures
func NewTestFixtures() *TestFixtures {
	now := time.Now()

	domains := []*domain.Domain{
		{
			ID:             "domain-1",
			OrganizationID: "org-1",
			Name:           "example.com",
			Status:         domain.DomainStatusVerified,
			IsPrimary:      true,
			MXVerified:     true,
			SPFVerified:    true,
			DKIMVerified:   true,
			DMARCVerified:  true,
			Policies:       domain.DefaultPolicies(),
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		{
			ID:             "domain-2",
			OrganizationID: "org-1",
			Name:           "test.com",
			Status:         domain.DomainStatusVerified,
			IsPrimary:      false,
			MXVerified:     true,
			SPFVerified:    true,
			DKIMVerified:   true,
			DMARCVerified:  true,
			Policies:       domain.DefaultPolicies(),
			CreatedAt:      now,
			UpdatedAt:      now,
		},
	}

	mailboxes := []*domain.Mailbox{
		{
			ID:             "mailbox-1",
			UserID:         "user-1",
			DomainID:       "domain-1",
			OrganizationID: "org-1",
			Email:          "user1@example.com",
			LocalPart:      "user1",
			Domain:         "example.com",
			DisplayName:    "User One",
			QuotaBytes:     10737418240, // 10GB
			UsedBytes:      1073741824,  // 1GB
			IsActive:       true,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		{
			ID:             "mailbox-2",
			UserID:         "user-2",
			DomainID:       "domain-1",
			OrganizationID: "org-1",
			Email:          "user2@example.com",
			LocalPart:      "user2",
			Domain:         "example.com",
			DisplayName:    "User Two",
			QuotaBytes:     10737418240,
			UsedBytes:      0,
			IsActive:       true,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
	}

	messages := []*domain.Message{
		{
			ID:             "msg-1",
			OrganizationID: "org-1",
			DomainID:       "domain-1",
			FromAddress:    "sender@external.com",
			Recipients:     []string{"user1@example.com"},
			Subject:        "Test Message",
			Headers:        map[string]string{"Message-ID": "<test-1@external.com>"},
			Status:         domain.StatusQueued,
			QueuedAt:       now,
			MaxRetries:     5,
		},
		{
			ID:             "msg-2",
			OrganizationID: "org-1",
			DomainID:       "domain-1",
			FromAddress:    "user1@example.com",
			Recipients:     []string{"recipient@external.com"},
			Subject:        "Outgoing Test",
			Headers:        map[string]string{"Message-ID": "<test-2@example.com>"},
			Status:         domain.StatusQueued,
			QueuedAt:       now,
			MaxRetries:     5,
		},
	}

	return &TestFixtures{
		Domains:  domains,
		Mailboxes: mailboxes,
		Messages: messages,
	}
}

// TestLogger returns a logger for testing
func TestLogger() *zap.Logger {
	config := zap.NewDevelopmentConfig()
	config.Level = zap.NewAtomicLevelAt(zap.WarnLevel)
	logger, _ := config.Build()
	return logger
}

// TestContext returns a context for testing with timeout
func TestContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}
