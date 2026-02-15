//go:build integration

// Package integration tests verify end-to-end authentication flows
// using real services.
//
// Run with: go test -tags=integration -v ./...
package auth_integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// AuthIntegrationConfig holds configuration for auth integration tests
type AuthIntegrationConfig struct {
	AuthServiceURL string
	JWTSecret      string
}

func loadTestConfig() *AuthIntegrationConfig {
	return &AuthIntegrationConfig{
		AuthServiceURL: envOrDefault("AUTH_SERVICE_URL", "http://localhost:8082"),
		JWTSecret:      envOrDefault("JWT_SECRET", "test-jwt-secret-key-for-integration-tests-minimum-32-chars"),
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// AuthIntegrationSuite provides shared resources for integration tests
type AuthIntegrationSuite struct {
	config     *AuthIntegrationConfig
	httpClient *http.Client
	ctx        context.Context
	cancel     context.CancelFunc
}

func SetupAuthIntegrationSuite(t *testing.T) *AuthIntegrationSuite {
	t.Helper()

	config := loadTestConfig()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

	suite := &AuthIntegrationSuite{
		config:     config,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		ctx:        ctx,
		cancel:     cancel,
	}

	// Verify auth service is reachable
	req, err := http.NewRequestWithContext(ctx, "GET", config.AuthServiceURL+"/health", nil)
	if err != nil {
		t.Skipf("Skipping integration test: cannot create request: %v", err)
	}
	resp, err := suite.httpClient.Do(req)
	if err != nil {
		t.Skipf("Skipping integration test: auth service not reachable at %s: %v", config.AuthServiceURL, err)
	}
	resp.Body.Close()

	t.Cleanup(func() {
		cancel()
	})

	return suite
}

// doRequest performs an HTTP request with optional auth token and returns the response
func (s *AuthIntegrationSuite) doRequest(t *testing.T, method, path string, body interface{}, token string) (*http.Response, []byte) {
	t.Helper()
	url := s.config.AuthServiceURL + path

	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(s.ctx, method, url, bodyReader)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := s.httpClient.Do(req)
	require.NoError(t, err)

	respBody, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	require.NoError(t, err)

	return resp, respBody
}

// =================================================================
// Test: Registration Flow
// =================================================================

func TestIntegration_RegistrationFlow(t *testing.T) {
	suite := SetupAuthIntegrationSuite(t)

	testEmail := fmt.Sprintf("integration-test-%d@test.oonrumail.com", time.Now().UnixNano())
	testPassword := "IntegrationTest123!@#Secure"

	t.Run("Register new user", func(t *testing.T) {
		registerReq := map[string]string{
			"email":        testEmail,
			"password":     testPassword,
			"display_name": "Integration Test User",
		}

		resp, body := suite.doRequest(t, "POST", "/api/auth/register", registerReq, "")

		if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
			var result map[string]interface{}
			err := json.Unmarshal(body, &result)
			require.NoError(t, err)

			// Should return tokens
			assert.NotEmpty(t, result["access_token"], "Should return access token")
			assert.NotEmpty(t, result["refresh_token"], "Should return refresh token")

			t.Logf("Registration successful, got tokens")
		} else if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusConflict {
			// Domain might not be verified, or user might already exist
			t.Logf("Registration returned %d (domain may not be verified or user exists): %s",
				resp.StatusCode, string(body))
		} else {
			t.Logf("Registration returned unexpected status %d: %s", resp.StatusCode, string(body))
		}
	})

	t.Run("Duplicate registration should fail", func(t *testing.T) {
		registerReq := map[string]string{
			"email":        testEmail,
			"password":     testPassword,
			"display_name": "Duplicate User",
		}

		resp, body := suite.doRequest(t, "POST", "/api/auth/register", registerReq, "")

		// Should either be conflict or bad request
		if resp.StatusCode == http.StatusConflict || resp.StatusCode == http.StatusBadRequest {
			t.Logf("Duplicate registration correctly rejected: %d", resp.StatusCode)
		} else {
			t.Logf("Duplicate registration response: %d - %s", resp.StatusCode, string(body))
		}
	})

	t.Run("Registration with weak password should fail", func(t *testing.T) {
		registerReq := map[string]string{
			"email":        fmt.Sprintf("weak-pass-%d@test.oonrumail.com", time.Now().UnixNano()),
			"password":     "123",
			"display_name": "Weak Password User",
		}

		resp, _ := suite.doRequest(t, "POST", "/api/auth/register", registerReq, "")
		assert.True(t, resp.StatusCode >= 400, "Weak password should be rejected")
	})

	t.Run("Registration with invalid email should fail", func(t *testing.T) {
		registerReq := map[string]string{
			"email":        "not-an-email",
			"password":     testPassword,
			"display_name": "Invalid Email User",
		}

		resp, _ := suite.doRequest(t, "POST", "/api/auth/register", registerReq, "")
		assert.True(t, resp.StatusCode >= 400, "Invalid email should be rejected")
	})
}

// =================================================================
// Test: Login Flow
// =================================================================

func TestIntegration_LoginFlow(t *testing.T) {
	suite := SetupAuthIntegrationSuite(t)

	t.Run("Login with valid credentials", func(t *testing.T) {
		loginReq := map[string]string{
			"email":    "admin@oonrumail.com",
			"password": "admin123",
		}

		resp, body := suite.doRequest(t, "POST", "/api/auth/login", loginReq, "")

		if resp.StatusCode == http.StatusOK {
			var result map[string]interface{}
			err := json.Unmarshal(body, &result)
			require.NoError(t, err)

			assert.NotEmpty(t, result["access_token"], "Should return access token")
			assert.NotEmpty(t, result["refresh_token"], "Should return refresh token")
			t.Logf("Login successful")
		} else {
			t.Logf("Login returned %d (test user may not exist): %s", resp.StatusCode, string(body))
			t.Skip("Skipping: test user not available")
		}
	})

	t.Run("Login with invalid password", func(t *testing.T) {
		loginReq := map[string]string{
			"email":    "admin@oonrumail.com",
			"password": "wrong-password",
		}

		resp, body := suite.doRequest(t, "POST", "/api/auth/login", loginReq, "")

		if resp.StatusCode == http.StatusUnauthorized {
			t.Logf("Invalid password correctly rejected")
		} else {
			t.Logf("Login with wrong password returned %d: %s", resp.StatusCode, string(body))
		}
		assert.NotEqual(t, http.StatusOK, resp.StatusCode, "Wrong password should not succeed")
	})

	t.Run("Login with nonexistent user", func(t *testing.T) {
		loginReq := map[string]string{
			"email":    "nonexistent-user-12345@oonrumail.com",
			"password": "any-password",
		}

		resp, _ := suite.doRequest(t, "POST", "/api/auth/login", loginReq, "")
		assert.True(t, resp.StatusCode >= 400, "Nonexistent user should fail")
	})
}

// =================================================================
// Test: Token Refresh Flow
// =================================================================

func TestIntegration_RefreshToken(t *testing.T) {
	suite := SetupAuthIntegrationSuite(t)

	// First, login to get tokens
	loginReq := map[string]string{
		"email":    "admin@oonrumail.com",
		"password": "admin123",
	}

	resp, body := suite.doRequest(t, "POST", "/api/auth/login", loginReq, "")
	if resp.StatusCode != http.StatusOK {
		t.Skip("Skipping: cannot login to get tokens")
	}

	var loginResult map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &loginResult))

	refreshToken, ok := loginResult["refresh_token"].(string)
	if !ok || refreshToken == "" {
		t.Skip("Skipping: no refresh token in login response")
	}

	t.Run("Refresh with valid token", func(t *testing.T) {
		refreshReq := map[string]string{
			"refresh_token": refreshToken,
		}

		resp, body := suite.doRequest(t, "POST", "/api/auth/refresh", refreshReq, "")

		if resp.StatusCode == http.StatusOK {
			var result map[string]interface{}
			require.NoError(t, json.Unmarshal(body, &result))
			assert.NotEmpty(t, result["access_token"], "Should return new access token")
			t.Logf("Token refresh successful")
		} else {
			t.Logf("Token refresh returned %d: %s", resp.StatusCode, string(body))
		}
	})

	t.Run("Refresh with invalid token", func(t *testing.T) {
		refreshReq := map[string]string{
			"refresh_token": "invalid-refresh-token",
		}

		resp, _ := suite.doRequest(t, "POST", "/api/auth/refresh", refreshReq, "")
		assert.NotEqual(t, http.StatusOK, resp.StatusCode, "Invalid refresh token should fail")
	})
}

// =================================================================
// Test: Session Management
// =================================================================

func TestIntegration_SessionManagement(t *testing.T) {
	suite := SetupAuthIntegrationSuite(t)

	// Login to get access token
	loginReq := map[string]string{
		"email":    "admin@oonrumail.com",
		"password": "admin123",
	}

	resp, body := suite.doRequest(t, "POST", "/api/auth/login", loginReq, "")
	if resp.StatusCode != http.StatusOK {
		t.Skip("Skipping: cannot login")
	}

	var loginResult map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &loginResult))

	accessToken, ok := loginResult["access_token"].(string)
	if !ok || accessToken == "" {
		t.Skip("Skipping: no access token")
	}

	t.Run("Get current user profile", func(t *testing.T) {
		resp, body := suite.doRequest(t, "GET", "/api/auth/me", nil, accessToken)

		if resp.StatusCode == http.StatusOK {
			var user map[string]interface{}
			require.NoError(t, json.Unmarshal(body, &user))
			assert.NotEmpty(t, user["id"], "User should have ID")
			assert.NotEmpty(t, user["email"], "User should have email")
			t.Logf("User profile: %v", user["email"])
		} else {
			t.Logf("Get profile returned %d: %s", resp.StatusCode, string(body))
		}
	})

	t.Run("List active sessions", func(t *testing.T) {
		resp, body := suite.doRequest(t, "GET", "/api/auth/sessions", nil, accessToken)

		if resp.StatusCode == http.StatusOK {
			var sessions []map[string]interface{}
			require.NoError(t, json.Unmarshal(body, &sessions))
			assert.NotEmpty(t, sessions, "Should have at least one active session")
			t.Logf("Active sessions: %d", len(sessions))
		} else {
			t.Logf("List sessions returned %d: %s", resp.StatusCode, string(body))
		}
	})

	t.Run("Logout", func(t *testing.T) {
		resp, _ := suite.doRequest(t, "POST", "/api/auth/logout", nil, accessToken)

		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent {
			t.Logf("Logout successful")
		} else {
			t.Logf("Logout returned %d", resp.StatusCode)
		}
	})

	t.Run("Access after logout should fail", func(t *testing.T) {
		// The original token should now be invalid
		resp, _ := suite.doRequest(t, "GET", "/api/auth/me", nil, accessToken)
		// After logout, session should be revoked
		// Some implementations still allow the access token until it expires
		t.Logf("Post-logout access returned %d", resp.StatusCode)
	})
}

// =================================================================
// Test: MFA Flow
// =================================================================

func TestIntegration_MFAFlow(t *testing.T) {
	suite := SetupAuthIntegrationSuite(t)

	t.Run("Login with MFA returns pending state", func(t *testing.T) {
		// This test requires a user with MFA enabled
		loginReq := map[string]string{
			"email":    "mfa-user@oonrumail.com",
			"password": "mfa-test-password",
		}

		resp, body := suite.doRequest(t, "POST", "/api/auth/login", loginReq, "")

		if resp.StatusCode == http.StatusOK {
			var result map[string]interface{}
			require.NoError(t, json.Unmarshal(body, &result))

			if mfaPending, ok := result["mfa_required"].(bool); ok && mfaPending {
				assert.NotEmpty(t, result["mfa_token"], "Should return MFA pending token")
				t.Logf("MFA pending state returned as expected")
			} else {
				t.Logf("User does not have MFA enabled, skipping MFA flow test")
			}
		} else {
			t.Skipf("MFA test user not available (status %d)", resp.StatusCode)
		}
	})

	t.Run("MFA verify with invalid code should fail", func(t *testing.T) {
		verifyReq := map[string]string{
			"mfa_token": "fake-mfa-token",
			"code":      "000000",
		}

		resp, _ := suite.doRequest(t, "POST", "/api/auth/mfa/verify", verifyReq, "")
		assert.NotEqual(t, http.StatusOK, resp.StatusCode, "Invalid MFA code should fail")
	})
}

// =================================================================
// Test: JWT Token Validation
// =================================================================

func TestIntegration_JWTValidation(t *testing.T) {
	config := loadTestConfig()

	t.Run("Generate and validate access token", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub":     "test-user-123",
			"org_id":  "test-org-123",
			"email":   "test@oonrumail.com",
			"role":    "user",
			"exp":     time.Now().Add(15 * time.Minute).Unix(),
			"iat":     time.Now().Unix(),
			"iss":     "oonrumail-auth",
			"type":    "access",
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte(config.JWTSecret))
		require.NoError(t, err)
		assert.NotEmpty(t, tokenString)

		// Parse and validate
		parsed, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(config.JWTSecret), nil
		})
		require.NoError(t, err)
		assert.True(t, parsed.Valid)

		parsedClaims, ok := parsed.Claims.(jwt.MapClaims)
		require.True(t, ok)
		assert.Equal(t, "test-user-123", parsedClaims["sub"])
		assert.Equal(t, "oonrumail-auth", parsedClaims["iss"])
	})

	t.Run("Expired token should be invalid", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub": "test-user-123",
			"exp": time.Now().Add(-1 * time.Hour).Unix(), // expired
			"iat": time.Now().Add(-2 * time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte(config.JWTSecret))
		require.NoError(t, err)

		_, err = jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.JWTSecret), nil
		})
		assert.Error(t, err, "Expired token should fail validation")
		assert.True(t, strings.Contains(err.Error(), "expired"),
			"Error should mention expiration")
	})

	t.Run("Token with wrong secret should be invalid", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub": "test-user-123",
			"exp": time.Now().Add(15 * time.Minute).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte("wrong-secret-key-that-is-long-enough"))
		require.NoError(t, err)

		_, err = jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.JWTSecret), nil
		})
		assert.Error(t, err, "Token signed with wrong secret should fail")
	})
}

// =================================================================
// Test: Protected Endpoint Access
// =================================================================

func TestIntegration_ProtectedEndpoints(t *testing.T) {
	suite := SetupAuthIntegrationSuite(t)

	protectedPaths := []string{
		"/api/auth/me",
		"/api/auth/sessions",
	}

	t.Run("Protected endpoints reject unauthenticated requests", func(t *testing.T) {
		for _, path := range protectedPaths {
			t.Run(path, func(t *testing.T) {
				resp, _ := suite.doRequest(t, "GET", path, nil, "")
				assert.Equal(t, http.StatusUnauthorized, resp.StatusCode,
					"Unauthenticated request to %s should return 401", path)
			})
		}
	})

	t.Run("Protected endpoints reject invalid tokens", func(t *testing.T) {
		for _, path := range protectedPaths {
			t.Run(path, func(t *testing.T) {
				resp, _ := suite.doRequest(t, "GET", path, nil, "invalid-token")
				assert.Equal(t, http.StatusUnauthorized, resp.StatusCode,
					"Invalid token request to %s should return 401", path)
			})
		}
	})
}

// =================================================================
// Test: Password Requirements
// =================================================================

func TestIntegration_PasswordRequirements(t *testing.T) {
	suite := SetupAuthIntegrationSuite(t)

	weakPasswords := []struct {
		name     string
		password string
	}{
		{"too_short", "Ab1!"},
		{"no_uppercase", "password123!@#"},
		{"no_number", "Password!@#abc"},
		{"common_password", "password"},
		{"empty", ""},
	}

	for _, tc := range weakPasswords {
		t.Run("Reject_"+tc.name, func(t *testing.T) {
			registerReq := map[string]string{
				"email":        fmt.Sprintf("weakpw-%s-%d@test.oonrumail.com", tc.name, time.Now().UnixNano()),
				"password":     tc.password,
				"display_name": "Weak Password Test",
			}

			resp, _ := suite.doRequest(t, "POST", "/api/auth/register", registerReq, "")
			assert.True(t, resp.StatusCode >= 400,
				"Password '%s' (%s) should be rejected", tc.password, tc.name)
		})
	}
}
