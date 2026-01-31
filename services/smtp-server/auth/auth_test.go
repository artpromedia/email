package auth

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// MockRepository implements Repository for testing
type MockRepository struct {
	users          map[string]*User
	loginAttempts  []LoginAttemptParams
	failureCounts  map[string]int
	successUpdates []string
}

func NewMockRepository() *MockRepository {
	return &MockRepository{
		users:          make(map[string]*User),
		loginAttempts:  make([]LoginAttemptParams, 0),
		failureCounts:  make(map[string]int),
		successUpdates: make([]string, 0),
	}
}

func (m *MockRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	user, ok := m.users[email]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (m *MockRepository) UpdateLoginFailure(ctx context.Context, userID string) error {
	m.failureCounts[userID]++
	return nil
}

func (m *MockRepository) UpdateLoginSuccess(ctx context.Context, userID string, ipAddress string) error {
	m.successUpdates = append(m.successUpdates, userID)
	return nil
}

func (m *MockRepository) RecordLoginAttempt(ctx context.Context, params LoginAttemptParams) error {
	m.loginAttempts = append(m.loginAttempts, params)
	return nil
}

func (m *MockRepository) AddUser(email string, user *User) {
	m.users[email] = user
}

func hashPassword(password string) string {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	return string(hash)
}

func TestAuthenticatePlain_Success(t *testing.T) {
	// Setup
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("Failed to start miniredis: %v", err)
	}
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	repo.AddUser("test@example.com", &User{
		ID:             "user-123",
		OrganizationID: "org-456",
		Email:          "test@example.com",
		DisplayName:    "Test User",
		PasswordHash:   hashPassword("correct-password"),
		Status:         "active",
		DomainID:       "domain-789",
	})

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())

	// Test PLAIN auth: \x00username\x00password
	response := []byte("\x00test@example.com\x00correct-password")
	clientIP := net.ParseIP("192.168.1.1")

	result, err := auth.AuthenticatePlain(context.Background(), response, clientIP, true)

	// Verify
	if err != nil {
		t.Fatalf("Expected success, got error: %v", err)
	}
	if result.UserID != "user-123" {
		t.Errorf("Expected UserID 'user-123', got '%s'", result.UserID)
	}
	if result.OrganizationID != "org-456" {
		t.Errorf("Expected OrganizationID 'org-456', got '%s'", result.OrganizationID)
	}

	// Verify login attempt was recorded
	if len(repo.loginAttempts) != 1 {
		t.Fatalf("Expected 1 login attempt, got %d", len(repo.loginAttempts))
	}
	if !repo.loginAttempts[0].Success {
		t.Error("Expected successful login attempt")
	}
}

func TestAuthenticatePlain_InvalidPassword(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	repo.AddUser("test@example.com", &User{
		ID:           "user-123",
		Email:        "test@example.com",
		PasswordHash: hashPassword("correct-password"),
		Status:       "active",
	})

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())

	response := []byte("\x00test@example.com\x00wrong-password")
	clientIP := net.ParseIP("192.168.1.1")

	_, err := auth.AuthenticatePlain(context.Background(), response, clientIP, true)

	// Verify
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("Expected ErrInvalidCredentials, got: %v", err)
	}

	// Verify failure was recorded
	if len(repo.loginAttempts) != 1 {
		t.Fatalf("Expected 1 login attempt, got %d", len(repo.loginAttempts))
	}
	if repo.loginAttempts[0].Success {
		t.Error("Expected failed login attempt")
	}
	if repo.loginAttempts[0].FailReason != "invalid_password" {
		t.Errorf("Expected fail reason 'invalid_password', got '%s'", repo.loginAttempts[0].FailReason)
	}
}

func TestAuthenticatePlain_UserNotFound(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())

	response := []byte("\x00nonexistent@example.com\x00password")
	clientIP := net.ParseIP("192.168.1.1")

	_, err := auth.AuthenticatePlain(context.Background(), response, clientIP, true)

	// Verify
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("Expected ErrInvalidCredentials, got: %v", err)
	}
}

func TestAuthenticatePlain_TLSRequired(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())

	response := []byte("\x00test@example.com\x00password")
	clientIP := net.ParseIP("192.168.1.1")

	// Call without TLS
	_, err := auth.AuthenticatePlain(context.Background(), response, clientIP, false)

	// Verify
	if !errors.Is(err, ErrTLSRequired) {
		t.Errorf("Expected ErrTLSRequired, got: %v", err)
	}
}

func TestAuthenticatePlain_AccountLocked(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	lockedUntil := time.Now().Add(15 * time.Minute)
	repo.AddUser("locked@example.com", &User{
		ID:           "user-123",
		Email:        "locked@example.com",
		PasswordHash: hashPassword("password"),
		Status:       "active",
		LockedUntil:  &lockedUntil,
	})

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())

	response := []byte("\x00locked@example.com\x00password")
	clientIP := net.ParseIP("192.168.1.1")

	_, err := auth.AuthenticatePlain(context.Background(), response, clientIP, true)

	// Verify
	if !errors.Is(err, ErrAccountLocked) {
		t.Errorf("Expected ErrAccountLocked, got: %v", err)
	}
}

func TestAuthenticatePlain_AccountDisabled(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	repo.AddUser("disabled@example.com", &User{
		ID:           "user-123",
		Email:        "disabled@example.com",
		PasswordHash: hashPassword("password"),
		Status:       "suspended",
	})

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())

	response := []byte("\x00disabled@example.com\x00password")
	clientIP := net.ParseIP("192.168.1.1")

	_, err := auth.AuthenticatePlain(context.Background(), response, clientIP, true)

	// Verify
	if !errors.Is(err, ErrAccountDisabled) {
		t.Errorf("Expected ErrAccountDisabled, got: %v", err)
	}
}

func TestAuthenticatePlain_RateLimited(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	config := &Config{
		MaxFailedAttempts: 3,
		LockoutDuration:   15 * time.Minute,
		RateLimitWindow:   15 * time.Minute,
	}

	repo.AddUser("test@example.com", &User{
		ID:           "user-123",
		Email:        "test@example.com",
		PasswordHash: hashPassword("correct-password"),
		Status:       "active",
	})

	auth := NewAuthenticator(repo, redisClient, logger, config)
	clientIP := net.ParseIP("192.168.1.1")

	// Fail 3 times to trigger rate limit
	for i := 0; i < 3; i++ {
		response := []byte("\x00test@example.com\x00wrong-password")
		auth.AuthenticatePlain(context.Background(), response, clientIP, true)
	}

	// Fourth attempt should be rate limited
	response := []byte("\x00test@example.com\x00correct-password")
	_, err := auth.AuthenticatePlain(context.Background(), response, clientIP, true)

	// Verify
	if !errors.Is(err, ErrRateLimited) {
		t.Errorf("Expected ErrRateLimited, got: %v", err)
	}
}

func TestAuthenticateLoginStep_Success(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	repo.AddUser("test@example.com", &User{
		ID:             "user-123",
		OrganizationID: "org-456",
		Email:          "test@example.com",
		DisplayName:    "Test User",
		PasswordHash:   hashPassword("password123"),
		Status:         "active",
	})

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())
	clientIP := net.ParseIP("192.168.1.1")

	state := &LoginAuthState{
		Step:     0,
		ClientIP: clientIP,
		IsTLS:    true,
	}

	// Step 1: Send username
	result, challenge, err := auth.AuthenticateLoginStep(context.Background(), state, []byte("test@example.com"))
	if err != nil {
		t.Fatalf("Step 1 failed: %v", err)
	}
	if result != nil {
		t.Error("Expected no result after step 1")
	}
	if challenge == nil {
		t.Error("Expected password challenge after step 1")
	}

	// Step 2: Send password
	result, challenge, err = auth.AuthenticateLoginStep(context.Background(), state, []byte("password123"))
	if err != nil {
		t.Fatalf("Step 2 failed: %v", err)
	}
	if result == nil {
		t.Fatal("Expected result after step 2")
	}
	if result.UserID != "user-123" {
		t.Errorf("Expected UserID 'user-123', got '%s'", result.UserID)
	}
	if challenge != nil {
		t.Error("Expected no challenge after step 2")
	}
}

func TestAuthenticateLoginStep_TLSRequired(t *testing.T) {
	// Setup
	mr, _ := miniredis.Run()
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	logger := zap.NewNop()
	repo := NewMockRepository()

	auth := NewAuthenticator(repo, redisClient, logger, DefaultConfig())
	clientIP := net.ParseIP("192.168.1.1")

	state := &LoginAuthState{
		Step:     0,
		ClientIP: clientIP,
		IsTLS:    false, // No TLS
	}

	_, _, err := auth.AuthenticateLoginStep(context.Background(), state, []byte("test@example.com"))

	if !errors.Is(err, ErrTLSRequired) {
		t.Errorf("Expected ErrTLSRequired, got: %v", err)
	}
}

func TestMaskEmail(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"john.doe@example.com", "j***e@example.com"},
		{"ab@example.com", "**@example.com"},
		{"a@example.com", "**@example.com"},
		{"invalid", "***"},
		{"", "***"},
	}

	for _, tt := range tests {
		result := maskEmail(tt.input)
		if result != tt.expected {
			t.Errorf("maskEmail(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}
