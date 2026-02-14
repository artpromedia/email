package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestParseXOAuth2(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantEmail string
		wantToken string
		wantErr   bool
	}{
		{
			name:      "valid XOAUTH2 string",
			input:     "user=test@example.com\x01auth=Bearer ya29.token123\x01\x01",
			wantEmail: "test@example.com",
			wantToken: "ya29.token123",
			wantErr:   false,
		},
		{
			name:    "missing user",
			input:   "auth=Bearer token123\x01\x01",
			wantErr: true,
		},
		{
			name:    "missing token",
			input:   "user=test@example.com\x01\x01",
			wantErr: true,
		},
		{
			name:    "empty string",
			input:   "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			email, token, err := parseXOAuth2(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantEmail, email)
			assert.Equal(t, tt.wantToken, token)
		})
	}
}

func TestParseOAuthBearer(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantEmail string
		wantToken string
		wantErr   bool
	}{
		{
			name:      "valid OAUTHBEARER string",
			input:     "n,a=test@example.com,\x01host=mail.example.com\x01port=993\x01auth=Bearer eyJtoken\x01\x01",
			wantEmail: "test@example.com",
			wantToken: "eyJtoken",
			wantErr:   false,
		},
		{
			name:    "missing authzid",
			input:   "n,,\x01auth=Bearer token\x01\x01",
			wantErr: true,
		},
		{
			name:    "missing token",
			input:   "n,a=test@example.com,\x01\x01",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			email, token, err := parseOAuthBearer(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantEmail, email)
			assert.Equal(t, tt.wantToken, token)
		})
	}
}

func TestGenerateXOAuth2String(t *testing.T) {
	email := "user@example.com"
	token := "ya29.testtoken"

	result := GenerateXOAuth2String(email, token)

	// Decode and verify
	decoded, err := base64.StdEncoding.DecodeString(result)
	require.NoError(t, err)

	parsedEmail, parsedToken, err := parseXOAuth2(string(decoded))
	require.NoError(t, err)
	assert.Equal(t, email, parsedEmail)
	assert.Equal(t, token, parsedToken)
}

func TestGenerateOAuthBearerString(t *testing.T) {
	email := "user@example.com"
	token := "ya29.testtoken"
	host := "mail.example.com"
	port := 993

	result := GenerateOAuthBearerString(email, token, host, port)

	// Decode and verify
	decoded, err := base64.StdEncoding.DecodeString(result)
	require.NoError(t, err)

	parsedEmail, parsedToken, err := parseOAuthBearer(string(decoded))
	require.NoError(t, err)
	assert.Equal(t, email, parsedEmail)
	assert.Equal(t, token, parsedToken)
}

func TestOAuth2ValidatorDetectProvider(t *testing.T) {
	logger := zap.NewNop()
	validator := NewOAuth2Validator(DefaultOAuth2Config(), nil, logger)

	tests := []struct {
		name         string
		token        string
		wantProvider OAuth2Provider
		wantErr      bool
	}{
		{
			name:         "Google JWT",
			token:        createTestJWT("https://accounts.google.com", "test@gmail.com"),
			wantProvider: ProviderGoogle,
		},
		{
			name:         "Microsoft JWT",
			token:        createTestJWT("https://login.microsoftonline.com/common/v2.0", "test@outlook.com"),
			wantProvider: ProviderMicrosoft,
		},
		{
			name:         "Internal JWT",
			token:        createTestJWT("https://oonrumail.com", "test@company.com"),
			wantProvider: ProviderInternal,
		},
		{
			name:         "Opaque token (fallback to Google)",
			token:        "ya29.some-opaque-token",
			wantProvider: ProviderGoogle,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider, err := validator.detectTokenProvider(tt.token)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantProvider, provider)
		})
	}
}

func TestOAuth2ValidatorValidateGoogleToken(t *testing.T) {
	// Create mock Google tokeninfo server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("access_token")

		if token == "valid_token" {
			json.NewEncoder(w).Encode(map[string]string{
				"aud":            "test-client-id.apps.googleusercontent.com",
				"azp":            "test-client-id.apps.googleusercontent.com",
				"sub":            "123456789",
				"email":          "user@gmail.com",
				"email_verified": "true",
				"expires_in":     "3600",
				"scope":          "email profile",
			})
			return
		}

		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	// Note: In a real test, we'd need to override the Google endpoint URL
	// For now, this test demonstrates the structure
	t.Skip("Requires mocking Google OAuth2 endpoint URL")
}

func TestOAuth2ValidatorValidateMicrosoftToken(t *testing.T) {
	// Create mock Microsoft Graph server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")

		if auth == "Bearer valid_token" {
			json.NewEncoder(w).Encode(map[string]string{
				"id":                "user-id-123",
				"userPrincipalName": "user@contoso.com",
				"mail":              "user@contoso.com",
				"displayName":       "Test User",
			})
			return
		}

		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	// Note: In a real test, we'd need to override the Microsoft endpoint URL
	t.Skip("Requires mocking Microsoft Graph endpoint URL")
}

func TestOAuth2ValidatorValidateInternalToken(t *testing.T) {
	logger := zap.NewNop()
	config := DefaultOAuth2Config()
	config.InternalJWTSecret = "test-secret"
	validator := NewOAuth2Validator(config, nil, logger)

	// Create a test internal token
	claims := map[string]interface{}{
		"sub":   "user-123",
		"email": "user@internal.com",
		"exp":   time.Now().Add(time.Hour).Unix(),
		"iss":   "https://oonrumail.com",
		"aud":   "smtp-server",
	}

	token := createTestJWTWithClaims(claims)

	info, err := validator.validateInternalToken(context.Background(), token)
	require.NoError(t, err)
	assert.Equal(t, "user@internal.com", info.Email)
	assert.Equal(t, "user-123", info.Subject)
	assert.Equal(t, ProviderInternal, info.Provider)
}

func TestOAuth2ValidatorExpiredInternalToken(t *testing.T) {
	logger := zap.NewNop()
	config := DefaultOAuth2Config()
	config.InternalJWTSecret = "test-secret"
	validator := NewOAuth2Validator(config, nil, logger)

	// Create an expired token
	claims := map[string]interface{}{
		"sub":   "user-123",
		"email": "user@internal.com",
		"exp":   time.Now().Add(-time.Hour).Unix(), // Expired
		"iss":   "https://oonrumail.com",
	}

	token := createTestJWTWithClaims(claims)

	_, err := validator.validateInternalToken(context.Background(), token)
	assert.ErrorIs(t, err, ErrOAuth2TokenExpired)
}

func TestAuthenticatorSupportsOAuth2(t *testing.T) {
	logger := zap.NewNop()

	t.Run("without OAuth2", func(t *testing.T) {
		auth := NewAuthenticator(nil, nil, logger, nil)
		assert.False(t, auth.SupportsOAuth2())
	})

	t.Run("with OAuth2 disabled", func(t *testing.T) {
		config := DefaultOAuth2Config()
		config.Enabled = false
		auth := NewAuthenticatorWithOAuth2(nil, nil, logger, nil, config)
		assert.False(t, auth.SupportsOAuth2())
	})

	t.Run("with OAuth2 enabled", func(t *testing.T) {
		config := DefaultOAuth2Config()
		config.Enabled = true
		auth := NewAuthenticatorWithOAuth2(nil, nil, logger, nil, config)
		assert.True(t, auth.SupportsOAuth2())
	})
}

func TestGetSupportedMechanisms(t *testing.T) {
	logger := zap.NewNop()

	t.Run("without OAuth2", func(t *testing.T) {
		auth := NewAuthenticator(nil, nil, logger, nil)
		mechanisms := auth.GetSupportedMechanisms()
		assert.Contains(t, mechanisms, "PLAIN")
		assert.Contains(t, mechanisms, "LOGIN")
		assert.NotContains(t, mechanisms, "XOAUTH2")
		assert.NotContains(t, mechanisms, "OAUTHBEARER")
	})

	t.Run("with OAuth2", func(t *testing.T) {
		config := DefaultOAuth2Config()
		auth := NewAuthenticatorWithOAuth2(nil, nil, logger, nil, config)
		mechanisms := auth.GetSupportedMechanisms()
		assert.Contains(t, mechanisms, "PLAIN")
		assert.Contains(t, mechanisms, "LOGIN")
		assert.Contains(t, mechanisms, "XOAUTH2")
		assert.Contains(t, mechanisms, "OAUTHBEARER")
	})
}

// Helper function to create a test JWT
func createTestJWT(issuer, email string) string {
	claims := map[string]interface{}{
		"iss":   issuer,
		"sub":   "123456",
		"email": email,
		"exp":   time.Now().Add(time.Hour).Unix(),
	}
	return createTestJWTWithClaims(claims)
}

func createTestJWTWithClaims(claims map[string]interface{}) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

	claimsJSON, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(claimsJSON)

	// In a real implementation, this would be a proper signature
	signature := base64.RawURLEncoding.EncodeToString([]byte("test-signature"))

	return header + "." + payload + "." + signature
}

// MockRedis is a mock Redis client for testing
type MockRedis struct {
	*redis.Client
	data map[string][]byte
}

func (m *MockRedis) Get(ctx context.Context, key string) *redis.StringCmd {
	cmd := redis.NewStringCmd(ctx)
	if data, ok := m.data[key]; ok {
		cmd.SetVal(string(data))
	} else {
		cmd.SetErr(redis.Nil)
	}
	return cmd
}

func (m *MockRedis) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) *redis.StatusCmd {
	cmd := redis.NewStatusCmd(ctx)
	if v, ok := value.([]byte); ok {
		m.data[key] = v
	}
	return cmd
}
