// Package testutil provides testing utilities for the AI assistant service
package testutil

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/oonrumail/ai-assistant/spam"
)

// ============================================================
// Mock LLM Provider
// ============================================================

// MockLLMProvider implements LLMProvider for testing
type MockLLMProvider struct {
	mu        sync.Mutex
	responses map[string]string // prompt prefix -> response
	calls     []string          // record of calls for assertions
	err       error             // injected error

	// Default response when no match found
	DefaultResponse string
	DefaultScore    float64
}

// NewMockLLMProvider creates a new mock LLM provider
func NewMockLLMProvider() *MockLLMProvider {
	return &MockLLMProvider{
		responses:       make(map[string]string),
		calls:           []string{},
		DefaultResponse: `{"spam_probability": 0.1, "reasoning": "Normal email"}`,
		DefaultScore:    0.1,
	}
}

// AddResponse adds a canned response for a prompt containing the given substring
func (m *MockLLMProvider) AddResponse(promptSubstring, response string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.responses[promptSubstring] = response
}

// SetError sets an error to be returned on the next Analyze call
func (m *MockLLMProvider) SetError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.err = err
}

// Analyze mocks the LLM analysis
func (m *MockLLMProvider) Analyze(ctx context.Context, prompt string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.calls = append(m.calls, prompt)

	if m.err != nil {
		err := m.err
		m.err = nil // reset after returning
		return "", err
	}

	for substring, response := range m.responses {
		if len(substring) > 0 && containsSubstring(prompt, substring) {
			return response, nil
		}
	}

	return m.DefaultResponse, nil
}

// GetCalls returns all prompts that were sent to the LLM
func (m *MockLLMProvider) GetCalls() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]string, len(m.calls))
	copy(result, m.calls)
	return result
}

// CallCount returns the number of calls made
func (m *MockLLMProvider) CallCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.calls)
}

// Reset clears all calls and errors
func (m *MockLLMProvider) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = []string{}
	m.err = nil
}

// ============================================================
// Mock ML Classifier
// ============================================================

// MockMLClassifier implements MLClassifier for testing
type MockMLClassifier struct {
	mu         sync.Mutex
	score      float64
	confidence float64
	err        error
	calls      []string // input texts
}

// NewMockMLClassifier creates a new mock ML classifier
func NewMockMLClassifier() *MockMLClassifier {
	return &MockMLClassifier{
		score:      0.1,
		confidence: 0.9,
	}
}

// SetResult sets the score and confidence to return
func (m *MockMLClassifier) SetResult(score, confidence float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.score = score
	m.confidence = confidence
}

// SetError sets an error to be returned
func (m *MockMLClassifier) SetError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.err = err
}

// Classify mocks the ML classification
func (m *MockMLClassifier) Classify(ctx context.Context, text string) (float64, float64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.calls = append(m.calls, text)

	if m.err != nil {
		err := m.err
		m.err = nil
		return 0, 0, err
	}

	return m.score, m.confidence, nil
}

// GetCalls returns all texts that were classified
func (m *MockMLClassifier) GetCalls() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]string, len(m.calls))
	copy(result, m.calls)
	return result
}

// CallCount returns the number of classification calls
func (m *MockMLClassifier) CallCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.calls)
}

// Reset clears all calls and errors
func (m *MockMLClassifier) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = []string{}
	m.err = nil
}

// ============================================================
// Mock Redis Client
// ============================================================

// MockRedisClient implements a mock Redis client for testing
type MockRedisClient struct {
	data  map[string]string
	lists map[string][]string
	sets  map[string]map[string]struct{}
	mu    sync.RWMutex
	err   error
}

// NewMockRedisClient creates a new mock Redis client
func NewMockRedisClient() *MockRedisClient {
	return &MockRedisClient{
		data:  make(map[string]string),
		lists: make(map[string][]string),
		sets:  make(map[string]map[string]struct{}),
	}
}

// SetError injects an error for the next operation
func (m *MockRedisClient) SetError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.err = err
}

// Get mocks redis GET
func (m *MockRedisClient) Get(ctx context.Context, key string) *redis.StringCmd {
	m.mu.RLock()
	defer m.mu.RUnlock()
	cmd := redis.NewStringCmd(ctx)
	if m.err != nil {
		cmd.SetErr(m.err)
		m.err = nil
		return cmd
	}
	if v, ok := m.data[key]; ok {
		cmd.SetVal(v)
	} else {
		cmd.SetErr(redis.Nil)
	}
	return cmd
}

// Set mocks redis SET
func (m *MockRedisClient) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) *redis.StatusCmd {
	m.mu.Lock()
	defer m.mu.Unlock()
	cmd := redis.NewStatusCmd(ctx)
	if m.err != nil {
		cmd.SetErr(m.err)
		m.err = nil
		return cmd
	}
	switch v := value.(type) {
	case string:
		m.data[key] = v
	case []byte:
		m.data[key] = string(v)
	default:
		b, _ := json.Marshal(v)
		m.data[key] = string(b)
	}
	cmd.SetVal("OK")
	return cmd
}

// Del mocks redis DEL
func (m *MockRedisClient) Del(ctx context.Context, keys ...string) *redis.IntCmd {
	m.mu.Lock()
	defer m.mu.Unlock()
	cmd := redis.NewIntCmd(ctx)
	var deleted int64
	for _, key := range keys {
		if _, ok := m.data[key]; ok {
			delete(m.data, key)
			deleted++
		}
	}
	cmd.SetVal(deleted)
	return cmd
}

// Exists mocks redis EXISTS
func (m *MockRedisClient) Exists(ctx context.Context, keys ...string) *redis.IntCmd {
	m.mu.RLock()
	defer m.mu.RUnlock()
	cmd := redis.NewIntCmd(ctx)
	var count int64
	for _, key := range keys {
		if _, ok := m.data[key]; ok {
			count++
		}
	}
	cmd.SetVal(count)
	return cmd
}

// SMembers mocks redis SMEMBERS
func (m *MockRedisClient) SMembers(ctx context.Context, key string) *redis.StringSliceCmd {
	m.mu.RLock()
	defer m.mu.RUnlock()
	cmd := redis.NewStringSliceCmd(ctx)
	if set, ok := m.sets[key]; ok {
		members := make([]string, 0, len(set))
		for member := range set {
			members = append(members, member)
		}
		cmd.SetVal(members)
	} else {
		cmd.SetVal([]string{})
	}
	return cmd
}

// SAdd mocks redis SADD
func (m *MockRedisClient) SAdd(ctx context.Context, key string, members ...interface{}) *redis.IntCmd {
	m.mu.Lock()
	defer m.mu.Unlock()
	cmd := redis.NewIntCmd(ctx)
	if m.sets[key] == nil {
		m.sets[key] = make(map[string]struct{})
	}
	var added int64
	for _, member := range members {
		s := fmt.Sprintf("%v", member)
		if _, exists := m.sets[key][s]; !exists {
			m.sets[key][s] = struct{}{}
			added++
		}
	}
	cmd.SetVal(added)
	return cmd
}

// SetData sets data directly in the mock store
func (m *MockRedisClient) SetData(key, value string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[key] = value
}

// GetData gets data directly from the mock store
func (m *MockRedisClient) GetData(key string) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.data[key]
	return v, ok
}

// ============================================================
// Test Fixtures
// ============================================================

// SpamCheckRequest fixtures

// NewHamRequest creates a typical non-spam email request for testing
func NewHamRequest() *spam.SpamCheckRequest {
	return &spam.SpamCheckRequest{
		EmailID:    "test-ham-001",
		OrgID:      "org-test-001",
		From:       spam.EmailAddress{Name: "John Smith", Address: "john@trusted-company.com"},
		To:         []spam.EmailAddress{{Name: "Jane Doe", Address: "jane@example.com"}},
		Subject:    "Quarterly Report Q4 2025",
		Body:       "Hi Jane,\n\nPlease find attached the quarterly report for Q4 2025.\n\nBest regards,\nJohn",
		Headers:    map[string]string{"Received": "from mail.trusted-company.com"},
		SenderIP:   "198.51.100.10",
		ReceivedAt: time.Now(),
	}
}

// NewSpamRequest creates a typical spam email request for testing
func NewSpamRequest() *spam.SpamCheckRequest {
	return &spam.SpamCheckRequest{
		EmailID:    "test-spam-001",
		OrgID:      "org-test-001",
		From:       spam.EmailAddress{Name: "WINNER NOTIFICATION", Address: "prize@freeprizes123.xyz"},
		To:         []spam.EmailAddress{{Name: "Lucky Winner", Address: "victim@example.com"}},
		Subject:    "URGENT!!! YOU HAVE WON $1,000,000 ACT NOW!!!",
		Body:       "CONGRATULATIONS!!! YOU HAVE BEEN SELECTED AS THE WINNER OF $1,000,000!!! CLICK HERE NOW TO CLAIM YOUR PRIZE!!! This is a LIMITED TIME OFFER - ACT IMMEDIATELY or you will LOSE your winnings!!! Send your bank details to claim.",
		HTMLBody:   `<html><body><h1>YOU WON!!!</h1><a href="http://192.168.1.1/claim">CLICK HERE</a></body></html>`,
		Headers:    map[string]string{},
		SenderIP:   "10.0.0.1",
		ReceivedAt: time.Now(),
	}
}

// NewPhishingRequest creates a phishing email request for testing
func NewPhishingRequest() *spam.SpamCheckRequest {
	return &spam.SpamCheckRequest{
		EmailID:    "test-phish-001",
		OrgID:      "org-test-001",
		From:       spam.EmailAddress{Name: "PayPal Security", Address: "security@paypa1-verify.com"},
		To:         []spam.EmailAddress{{Name: "User", Address: "user@example.com"}},
		Subject:    "Action Required: Verify Your Account",
		Body:       "Dear Customer,\n\nWe have detected unusual activity on your account. Please verify your identity by clicking the link below within 24 hours or your account will be suspended.\n\nhttp://paypa1-verify.com/login\n\nPayPal Security Team",
		Headers:    map[string]string{},
		SenderIP:   "10.0.0.2",
		ReceivedAt: time.Now(),
	}
}

// NewSuspiciousAttachmentRequest creates a request with suspicious attachments
func NewSuspiciousAttachmentRequest() *spam.SpamCheckRequest {
	return &spam.SpamCheckRequest{
		EmailID: "test-attach-001",
		OrgID:   "org-test-001",
		From:    spam.EmailAddress{Name: "Unknown", Address: "sender@unknown-domain.xyz"},
		To:      []spam.EmailAddress{{Name: "Target", Address: "target@example.com"}},
		Subject: "Invoice",
		Body:    "Please see attached invoice.",
		Attachments: []spam.Attachment{
			{Filename: "invoice.exe", ContentType: "application/x-msdownload", Size: 1024000},
		},
		Headers:    map[string]string{},
		SenderIP:   "10.0.0.3",
		ReceivedAt: time.Now(),
	}
}

// OrgSpamSettings fixtures

// NewDefaultOrgSettings creates default org spam settings for testing
func NewDefaultOrgSettings() *spam.OrgSpamSettings {
	return &spam.OrgSpamSettings{
		OrgID:            "org-test-001",
		Threshold:        spam.ThresholdMedium,
		QuarantineAction: "quarantine",
		BlockList:        []string{},
		AllowList:        []string{},
		EnableLLM:        false,
		NotifyAdmin:      true,
		UpdatedAt:        time.Now(),
	}
}

// NewStrictOrgSettings creates strict org spam settings for testing
func NewStrictOrgSettings() *spam.OrgSpamSettings {
	return &spam.OrgSpamSettings{
		OrgID:            "org-test-001",
		Threshold:        spam.ThresholdHigh,
		QuarantineAction: "delete",
		BlockList:        []string{"blocked@spam.com", "@spam-domain.com"},
		AllowList:        []string{"trusted@company.com", "@trusted-company.com"},
		EnableLLM:        true,
		NotifyAdmin:      true,
		UpdatedAt:        time.Now(),
	}
}

// NewPermissiveOrgSettings creates permissive org spam settings for testing
func NewPermissiveOrgSettings() *spam.OrgSpamSettings {
	return &spam.OrgSpamSettings{
		OrgID:            "org-test-001",
		Threshold:        spam.ThresholdLow,
		QuarantineAction: "spam_folder",
		BlockList:        []string{},
		AllowList:        []string{},
		EnableLLM:        false,
		NotifyAdmin:      false,
		UpdatedAt:        time.Now(),
	}
}

// ============================================================
// Helpers
// ============================================================

func containsSubstring(s, substr string) bool {
	return strings.Contains(s, substr)
}
