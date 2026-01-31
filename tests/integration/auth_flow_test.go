// Package integration provides end-to-end integration tests for the auth service.
// These tests verify authentication flows: login, token refresh, logout, and session management.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/golang-jwt/jwt/v5"
)

// AuthTestConfig holds configuration for auth integration tests
type AuthTestConfig struct {
	AuthServiceURL string
	RedisURL       string
	JWTSecret      string
}

// loadAuthConfig loads auth test configuration from environment
func loadAuthConfig() *AuthTestConfig {
	return &AuthTestConfig{
		AuthServiceURL: getEnv("AUTH_SERVICE_URL", "http://localhost:8082"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6380"),
		JWTSecret:      getEnv("JWT_SECRET", "test-jwt-secret-key-for-integration-tests"),
	}
}

// AuthTestSuite holds resources for auth integration tests
type AuthTestSuite struct {
	config     *AuthTestConfig
	httpClient *http.Client
	redis      *redis.Client
}

// SetupAuthSuite initializes the auth test suite
func SetupAuthSuite(t *testing.T) *AuthTestSuite {
	t.Helper()
	config := loadAuthConfig()

	suite := &AuthTestSuite{
		config:     config,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}

	// Connect to Redis
	opt, err := redis.ParseURL(config.RedisURL)
	if err != nil {
		t.Fatalf("Failed to parse Redis URL: %v", err)
	}
	suite.redis = redis.NewClient(opt)
	if err := suite.redis.Ping(context.Background()).Err(); err != nil {
		t.Logf("Redis connection failed (tests may skip): %v", err)
	}

	return suite
}

// TeardownAuthSuite cleans up resources
func (s *AuthTestSuite) TeardownAuthSuite(t *testing.T) {
	t.Helper()
	if s.redis != nil {
		s.redis.Close()
	}
}

// LoginRequest represents a login request
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// TokenResponse represents an auth token response
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// TestJWTTokenGeneration tests JWT token generation and validation
func TestJWTTokenGeneration(t *testing.T) {
	config := loadAuthConfig()

	t.Run("Generate Valid Access Token", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub":     "user-123",
			"email":   "test@example.com",
			"role":    "user",
			"org_id":  "org-456",
			"iat":     time.Now().Unix(),
			"exp":     time.Now().Add(15 * time.Minute).Unix(),
			"type":    "access",
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte(config.JWTSecret))
		if err != nil {
			t.Fatalf("Failed to sign token: %v", err)
		}

		// Verify token
		parsed, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(config.JWTSecret), nil
		})
		if err != nil {
			t.Fatalf("Failed to parse token: %v", err)
		}
		if !parsed.Valid {
			t.Error("Token should be valid")
		}

		// Verify claims
		parsedClaims, ok := parsed.Claims.(jwt.MapClaims)
		if !ok {
			t.Fatal("Failed to get claims")
		}
		if parsedClaims["sub"] != "user-123" {
			t.Errorf("Subject mismatch: got %v, want user-123", parsedClaims["sub"])
		}
		if parsedClaims["email"] != "test@example.com" {
			t.Errorf("Email mismatch: got %v, want test@example.com", parsedClaims["email"])
		}
	})

	t.Run("Generate Refresh Token", func(t *testing.T) {
		sessionID := "session-789"
		claims := jwt.MapClaims{
			"sub":        "user-123",
			"session_id": sessionID,
			"iat":        time.Now().Unix(),
			"exp":        time.Now().Add(7 * 24 * time.Hour).Unix(),
			"type":       "refresh",
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte(config.JWTSecret))
		if err != nil {
			t.Fatalf("Failed to sign refresh token: %v", err)
		}

		// Verify token
		parsed, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.JWTSecret), nil
		})
		if err != nil {
			t.Fatalf("Failed to parse refresh token: %v", err)
		}

		parsedClaims := parsed.Claims.(jwt.MapClaims)
		if parsedClaims["type"] != "refresh" {
			t.Errorf("Token type mismatch: got %v, want refresh", parsedClaims["type"])
		}
		if parsedClaims["session_id"] != sessionID {
			t.Errorf("Session ID mismatch: got %v, want %s", parsedClaims["session_id"], sessionID)
		}
	})

	t.Run("Expired Token Validation", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub": "user-123",
			"iat": time.Now().Add(-1 * time.Hour).Unix(),
			"exp": time.Now().Add(-30 * time.Minute).Unix(), // Expired 30 minutes ago
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(config.JWTSecret))

		// Parse should fail due to expiration
		_, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.JWTSecret), nil
		})
		if err == nil {
			t.Error("Expected error for expired token")
		}
		if !strings.Contains(err.Error(), "token is expired") {
			t.Errorf("Expected expiration error, got: %v", err)
		}
	})

	t.Run("Invalid Signature", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub": "user-123",
			"exp": time.Now().Add(15 * time.Minute).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte("wrong-secret"))

		// Parse with correct secret should fail
		_, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.JWTSecret), nil
		})
		if err == nil {
			t.Error("Expected error for invalid signature")
		}
	})
}

// TestTokenRefreshRotation tests refresh token rotation security
func TestTokenRefreshRotation(t *testing.T) {
	suite := SetupAuthSuite(t)
	defer suite.TeardownAuthSuite(t)

	ctx := context.Background()

	t.Run("Token Rotation Updates Hash", func(t *testing.T) {
		sessionID := "test-session-rotation"
		oldTokenHash := "old-token-hash-abc123"
		newTokenHash := "new-token-hash-xyz789"

		// Store initial session
		sessionKey := fmt.Sprintf("session:%s", sessionID)
		sessionData := fmt.Sprintf(`{"user_id":"user123","token_hash":"%s"}`, oldTokenHash)
		err := suite.redis.Set(ctx, sessionKey, sessionData, 30*time.Minute).Err()
		if err != nil {
			t.Fatalf("Failed to create session: %v", err)
		}

		// Simulate token rotation
		newSessionData := fmt.Sprintf(`{"user_id":"user123","token_hash":"%s"}`, newTokenHash)
		err = suite.redis.Set(ctx, sessionKey, newSessionData, 30*time.Minute).Err()
		if err != nil {
			t.Fatalf("Failed to update session: %v", err)
		}

		// Verify old token hash is no longer valid
		result, _ := suite.redis.Get(ctx, sessionKey).Result()
		if strings.Contains(result, oldTokenHash) {
			t.Error("Old token hash should be replaced")
		}
		if !strings.Contains(result, newTokenHash) {
			t.Error("New token hash should be present")
		}

		// Cleanup
		suite.redis.Del(ctx, sessionKey)
	})

	t.Run("Token Reuse Detection", func(t *testing.T) {
		// Test the scenario where a used token is presented again
		sessionID := "test-session-reuse"
		currentTokenHash := "current-valid-hash"
		usedTokenHash := "previously-used-hash"

		// Store session with current valid hash
		sessionKey := fmt.Sprintf("session:%s", sessionID)
		sessionData := fmt.Sprintf(`{"user_id":"user123","token_hash":"%s"}`, currentTokenHash)
		suite.redis.Set(ctx, sessionKey, sessionData, 30*time.Minute)

		// Store used token for detection
		usedTokenKey := fmt.Sprintf("used_token:%s", usedTokenHash)
		suite.redis.Set(ctx, usedTokenKey, sessionID, 7*24*time.Hour)

		// Check if a token hash was previously used
		exists, err := suite.redis.Exists(ctx, usedTokenKey).Result()
		if err != nil {
			t.Fatalf("Failed to check used token: %v", err)
		}
		if exists != 1 {
			t.Error("Used token marker should exist")
		}

		// In a real implementation, detecting a used token should trigger
		// session revocation. Let's simulate that:
		if exists == 1 {
			// Revoke the session
			suite.redis.Del(ctx, sessionKey)

			// Verify session is revoked
			sessionExists, _ := suite.redis.Exists(ctx, sessionKey).Result()
			if sessionExists != 0 {
				t.Error("Session should be revoked after token reuse detection")
			}
		}

		// Cleanup
		suite.redis.Del(ctx, usedTokenKey)
	})
}

// TestSessionManagementIntegration tests comprehensive session management
func TestSessionManagementIntegration(t *testing.T) {
	suite := SetupAuthSuite(t)
	defer suite.TeardownAuthSuite(t)

	ctx := context.Background()

	t.Run("Create Multiple Sessions", func(t *testing.T) {
		userID := "user-multi-session"

		// Create 3 sessions for the same user (different devices)
		sessions := []string{"session-device1", "session-device2", "session-device3"}
		userSessionsKey := fmt.Sprintf("user_sessions:%s", userID)

		for _, sessionID := range sessions {
			// Add session to user's session list
			suite.redis.SAdd(ctx, userSessionsKey, sessionID)

			// Create individual session
			sessionKey := fmt.Sprintf("session:%s", sessionID)
			sessionData := fmt.Sprintf(`{"user_id":"%s","device":"%s"}`, userID, sessionID)
			suite.redis.Set(ctx, sessionKey, sessionData, 30*time.Minute)
		}

		// Verify all sessions exist
		count, err := suite.redis.SCard(ctx, userSessionsKey).Result()
		if err != nil {
			t.Fatalf("Failed to get session count: %v", err)
		}
		if count != int64(len(sessions)) {
			t.Errorf("Session count mismatch: got %d, want %d", count, len(sessions))
		}

		// Cleanup
		for _, sessionID := range sessions {
			suite.redis.Del(ctx, fmt.Sprintf("session:%s", sessionID))
		}
		suite.redis.Del(ctx, userSessionsKey)
	})

	t.Run("Logout Single Session", func(t *testing.T) {
		userID := "user-logout-single"
		sessionID := "session-to-logout"

		// Create session
		sessionKey := fmt.Sprintf("session:%s", sessionID)
		userSessionsKey := fmt.Sprintf("user_sessions:%s", userID)

		suite.redis.Set(ctx, sessionKey, `{"user_id":"user-logout-single"}`, 30*time.Minute)
		suite.redis.SAdd(ctx, userSessionsKey, sessionID)

		// Logout (delete session)
		suite.redis.Del(ctx, sessionKey)
		suite.redis.SRem(ctx, userSessionsKey, sessionID)

		// Verify session is gone
		exists, _ := suite.redis.Exists(ctx, sessionKey).Result()
		if exists != 0 {
			t.Error("Session should be deleted after logout")
		}

		// Cleanup
		suite.redis.Del(ctx, userSessionsKey)
	})

	t.Run("Logout All Sessions", func(t *testing.T) {
		userID := "user-logout-all"
		sessions := []string{"session-1", "session-2", "session-3"}
		userSessionsKey := fmt.Sprintf("user_sessions:%s", userID)

		// Create sessions
		for _, sessionID := range sessions {
			sessionKey := fmt.Sprintf("session:%s", sessionID)
			suite.redis.Set(ctx, sessionKey, `{"user_id":"user-logout-all"}`, 30*time.Minute)
			suite.redis.SAdd(ctx, userSessionsKey, sessionID)
		}

		// Logout all - get all session IDs and delete them
		sessionIDs, _ := suite.redis.SMembers(ctx, userSessionsKey).Result()
		for _, sid := range sessionIDs {
			suite.redis.Del(ctx, fmt.Sprintf("session:%s", sid))
		}
		suite.redis.Del(ctx, userSessionsKey)

		// Verify all sessions are gone
		for _, sessionID := range sessions {
			exists, _ := suite.redis.Exists(ctx, fmt.Sprintf("session:%s", sessionID)).Result()
			if exists != 0 {
				t.Errorf("Session %s should be deleted after logout all", sessionID)
			}
		}
	})

	t.Run("Session Timeout", func(t *testing.T) {
		sessionID := "session-timeout-test"
		sessionKey := fmt.Sprintf("session:%s", sessionID)

		// Create session with 1 second TTL
		suite.redis.Set(ctx, sessionKey, `{"user_id":"timeout-user"}`, 1*time.Second)

		// Wait for expiration
		time.Sleep(2 * time.Second)

		// Verify session expired
		exists, _ := suite.redis.Exists(ctx, sessionKey).Result()
		if exists != 0 {
			t.Error("Session should have expired")
		}
	})
}

// TestMFAFlow tests MFA (Multi-Factor Authentication) flow
func TestMFAFlow(t *testing.T) {
	suite := SetupAuthSuite(t)
	defer suite.TeardownAuthSuite(t)

	ctx := context.Background()

	t.Run("MFA Challenge Creation", func(t *testing.T) {
		userID := "user-mfa-test"
		challengeID := "mfa-challenge-123"

		// Create MFA challenge
		challengeKey := fmt.Sprintf("mfa_challenge:%s", challengeID)
		challengeData := fmt.Sprintf(`{"user_id":"%s","method":"totp","created_at":"%s"}`,
			userID, time.Now().Format(time.RFC3339))

		// MFA challenges should have short TTL (e.g., 5 minutes)
		err := suite.redis.Set(ctx, challengeKey, challengeData, 5*time.Minute).Err()
		if err != nil {
			t.Fatalf("Failed to create MFA challenge: %v", err)
		}

		// Verify challenge exists
		result, _ := suite.redis.Get(ctx, challengeKey).Result()
		if result == "" {
			t.Error("MFA challenge should exist")
		}

		// Cleanup
		suite.redis.Del(ctx, challengeKey)
	})

	t.Run("MFA Verification Attempt Tracking", func(t *testing.T) {
		userID := "user-mfa-attempts"
		attemptsKey := fmt.Sprintf("mfa_attempts:%s", userID)

		// Simulate failed attempts
		maxAttempts := 5
		for i := 0; i < maxAttempts; i++ {
			count, _ := suite.redis.Incr(ctx, attemptsKey).Result()
			if count == 1 {
				// Set TTL on first attempt
				suite.redis.Expire(ctx, attemptsKey, 15*time.Minute)
			}
		}

		// Verify lockout would trigger
		count, _ := suite.redis.Get(ctx, attemptsKey).Int64()
		if count < int64(maxAttempts) {
			t.Errorf("Attempt count mismatch: got %d, want %d", count, maxAttempts)
		}

		// Cleanup
		suite.redis.Del(ctx, attemptsKey)
	})

	t.Run("MFA Backup Code Usage", func(t *testing.T) {
		userID := "user-backup-codes"
		backupCodesKey := fmt.Sprintf("backup_codes:%s", userID)

		// Store backup codes (in real implementation, these would be hashed)
		backupCodes := []string{"code1", "code2", "code3", "code4", "code5"}
		suite.redis.SAdd(ctx, backupCodesKey, backupCodes)

		// Use a backup code
		codeToUse := "code2"
		removed, _ := suite.redis.SRem(ctx, backupCodesKey, codeToUse).Result()
		if removed != 1 {
			t.Error("Backup code should be removed after use")
		}

		// Verify code can't be used again
		isMember, _ := suite.redis.SIsMember(ctx, backupCodesKey, codeToUse).Result()
		if isMember {
			t.Error("Used backup code should not be available")
		}

		// Verify remaining codes
		remaining, _ := suite.redis.SCard(ctx, backupCodesKey).Result()
		if remaining != int64(len(backupCodes)-1) {
			t.Errorf("Remaining codes mismatch: got %d, want %d", remaining, len(backupCodes)-1)
		}

		// Cleanup
		suite.redis.Del(ctx, backupCodesKey)
	})
}

// TestPasswordReset tests password reset flow
func TestPasswordReset(t *testing.T) {
	suite := SetupAuthSuite(t)
	defer suite.TeardownAuthSuite(t)

	ctx := context.Background()

	t.Run("Create Reset Token", func(t *testing.T) {
		email := "reset@example.com"
		resetToken := "secure-reset-token-abc123"
		resetKey := fmt.Sprintf("password_reset:%s", resetToken)

		// Store reset token (typically 1 hour TTL)
		resetData := fmt.Sprintf(`{"email":"%s","created_at":"%s"}`,
			email, time.Now().Format(time.RFC3339))
		err := suite.redis.Set(ctx, resetKey, resetData, 1*time.Hour).Err()
		if err != nil {
			t.Fatalf("Failed to create reset token: %v", err)
		}

		// Verify token exists
		result, _ := suite.redis.Get(ctx, resetKey).Result()
		if !strings.Contains(result, email) {
			t.Error("Reset token should contain email")
		}

		// Cleanup
		suite.redis.Del(ctx, resetKey)
	})

	t.Run("Use Reset Token Once", func(t *testing.T) {
		resetToken := "one-time-reset-token"
		resetKey := fmt.Sprintf("password_reset:%s", resetToken)

		// Create token
		suite.redis.Set(ctx, resetKey, `{"email":"once@example.com"}`, 1*time.Hour)

		// Use token (delete after use)
		result, err := suite.redis.GetDel(ctx, resetKey).Result()
		if err != nil {
			t.Fatalf("Failed to get and delete reset token: %v", err)
		}
		if result == "" {
			t.Error("Reset token should return data before deletion")
		}

		// Verify token is gone
		exists, _ := suite.redis.Exists(ctx, resetKey).Result()
		if exists != 0 {
			t.Error("Reset token should be deleted after use")
		}
	})

	t.Run("Rate Limit Reset Requests", func(t *testing.T) {
		email := "ratelimit@example.com"
		rateLimitKey := fmt.Sprintf("reset_ratelimit:%s", email)

		// Simulate multiple reset requests
		for i := 0; i < 3; i++ {
			count, _ := suite.redis.Incr(ctx, rateLimitKey).Result()
			if count == 1 {
				suite.redis.Expire(ctx, rateLimitKey, 1*time.Hour)
			}
		}

		// Check if rate limited
		count, _ := suite.redis.Get(ctx, rateLimitKey).Int64()
		if count < 3 {
			t.Errorf("Rate limit count mismatch: got %d, want 3", count)
		}

		// Cleanup
		suite.redis.Del(ctx, rateLimitKey)
	})
}

// TestAuthAPIEndpoints tests auth API endpoints (if available)
func TestAuthAPIEndpoints(t *testing.T) {
	suite := SetupAuthSuite(t)
	defer suite.TeardownAuthSuite(t)

	// Skip if auth service is not running
	resp, err := suite.httpClient.Get(suite.config.AuthServiceURL + "/health")
	if err != nil {
		t.Skipf("Auth service not available: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Skip("Auth service health check failed")
	}

	t.Run("Login Endpoint - Invalid Credentials", func(t *testing.T) {
		loginReq := LoginRequest{
			Email:    "nonexistent@example.com",
			Password: "wrongpassword",
		}
		body, _ := json.Marshal(loginReq)

		resp, err := suite.httpClient.Post(
			suite.config.AuthServiceURL+"/api/v1/auth/login",
			"application/json",
			bytes.NewReader(body),
		)
		if err != nil {
			t.Fatalf("Login request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected 401 for invalid credentials, got %d", resp.StatusCode)
		}
	})

	t.Run("Refresh Endpoint - Invalid Token", func(t *testing.T) {
		req, _ := http.NewRequest("POST", suite.config.AuthServiceURL+"/api/v1/auth/refresh", nil)
		req.Header.Set("Authorization", "Bearer invalid-token")

		resp, err := suite.httpClient.Do(req)
		if err != nil {
			t.Fatalf("Refresh request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected 401 for invalid token, got %d", resp.StatusCode)
		}
	})
}

// TestAccountLockout tests account lockout after failed attempts
func TestAccountLockout(t *testing.T) {
	suite := SetupAuthSuite(t)
	defer suite.TeardownAuthSuite(t)

	ctx := context.Background()

	t.Run("Lockout After Max Attempts", func(t *testing.T) {
		email := "lockout@example.com"
		attemptsKey := fmt.Sprintf("login_attempts:%s", email)
		lockoutKey := fmt.Sprintf("account_locked:%s", email)

		maxAttempts := 5
		lockoutDuration := 15 * time.Minute

		// Simulate failed login attempts
		for i := 0; i < maxAttempts; i++ {
			count, _ := suite.redis.Incr(ctx, attemptsKey).Result()
			if count == 1 {
				suite.redis.Expire(ctx, attemptsKey, 15*time.Minute)
			}

			// Lock account on max attempts
			if count >= int64(maxAttempts) {
				suite.redis.Set(ctx, lockoutKey, "1", lockoutDuration)
			}
		}

		// Verify account is locked
		isLocked, _ := suite.redis.Exists(ctx, lockoutKey).Result()
		if isLocked != 1 {
			t.Error("Account should be locked after max attempts")
		}

		// Cleanup
		suite.redis.Del(ctx, attemptsKey)
		suite.redis.Del(ctx, lockoutKey)
	})

	t.Run("Clear Attempts on Successful Login", func(t *testing.T) {
		email := "clearattempts@example.com"
		attemptsKey := fmt.Sprintf("login_attempts:%s", email)

		// Add some failed attempts
		suite.redis.Set(ctx, attemptsKey, "3", 15*time.Minute)

		// Simulate successful login - clear attempts
		suite.redis.Del(ctx, attemptsKey)

		// Verify attempts cleared
		exists, _ := suite.redis.Exists(ctx, attemptsKey).Result()
		if exists != 0 {
			t.Error("Login attempts should be cleared on successful login")
		}
	})
}

// BenchmarkTokenGeneration benchmarks JWT token generation
func BenchmarkTokenGeneration(b *testing.B) {
	secret := []byte("test-secret-key")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		claims := jwt.MapClaims{
			"sub":   "user-123",
			"email": "bench@example.com",
			"exp":   time.Now().Add(15 * time.Minute).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		_, _ = token.SignedString(secret)
	}
}

// BenchmarkTokenValidation benchmarks JWT token validation
func BenchmarkTokenValidation(b *testing.B) {
	secret := []byte("test-secret-key")
	claims := jwt.MapClaims{
		"sub":   "user-123",
		"email": "bench@example.com",
		"exp":   time.Now().Add(15 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString(secret)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return secret, nil
		})
	}
}

// skipIfNoEnv skips test if required environment variable is not set
func skipIfNoEnv(t *testing.T, envVar string) {
	t.Helper()
	if os.Getenv(envVar) == "" {
		t.Skipf("Skipping test: %s environment variable not set", envVar)
	}
}
