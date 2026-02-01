package imap

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestParseXOAuth2IMAP(t *testing.T) {
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
			name:      "Gmail-style token",
			input:     "user=user@gmail.com\x01auth=Bearer ya29.a0AfH6SMBToken\x01\x01",
			wantEmail: "user@gmail.com",
			wantToken: "ya29.a0AfH6SMBToken",
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
		{
			name:    "wrong format",
			input:   "username=test@example.com&token=abc",
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

func TestParseOAuthBearerIMAP(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantEmail string
		wantToken string
		wantErr   bool
	}{
		{
			name:      "valid OAUTHBEARER string with host and port",
			input:     "n,a=test@example.com,\x01host=mail.example.com\x01port=993\x01auth=Bearer eyJtoken\x01\x01",
			wantEmail: "test@example.com",
			wantToken: "eyJtoken",
			wantErr:   false,
		},
		{
			name:      "valid OAUTHBEARER string minimal",
			input:     "n,a=user@domain.com,\x01auth=Bearer jwt-token-here\x01\x01",
			wantEmail: "user@domain.com",
			wantToken: "jwt-token-here",
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
		{
			name:    "empty string",
			input:   "",
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

func TestOAuth2ValidatorDetectProviderIMAP(t *testing.T) {
	logger := zap.NewNop()
	validator := NewOAuth2Validator(&OAuth2Config{Enabled: true}, logger)

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
			token:        createTestJWT("https://enterprise-email.com", "test@company.com"),
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

func TestOAuth2ValidatorValidateInternalTokenIMAP(t *testing.T) {
	logger := zap.NewNop()
	config := &OAuth2Config{
		Enabled:           true,
		InternalJWTSecret: "test-secret",
	}
	validator := NewOAuth2Validator(config, logger)

	t.Run("valid internal token", func(t *testing.T) {
		claims := map[string]interface{}{
			"sub":   "user-123",
			"email": "user@internal.com",
			"exp":   time.Now().Add(time.Hour).Unix(),
			"iss":   "https://enterprise-email.com",
			"aud":   "imap-server",
		}

		token := createTestJWTWithClaims(claims)

		info, err := validator.validateInternalToken(t.Context(), token)
		require.NoError(t, err)
		assert.Equal(t, "user@internal.com", info.Email)
		assert.Equal(t, "user-123", info.Subject)
		assert.Equal(t, ProviderInternal, info.Provider)
	})

	t.Run("expired internal token", func(t *testing.T) {
		claims := map[string]interface{}{
			"sub":   "user-123",
			"email": "user@internal.com",
			"exp":   time.Now().Add(-time.Hour).Unix(), // Expired
			"iss":   "https://enterprise-email.com",
		}

		token := createTestJWTWithClaims(claims)

		_, err := validator.validateInternalToken(t.Context(), token)
		assert.ErrorIs(t, err, ErrOAuth2TokenExpired)
	})

	t.Run("invalid token format", func(t *testing.T) {
		_, err := validator.validateInternalToken(t.Context(), "not-a-jwt")
		assert.ErrorIs(t, err, ErrInvalidOAuth2Token)
	})
}

func TestOAuth2ConfigValidation(t *testing.T) {
	t.Run("disabled config", func(t *testing.T) {
		config := &OAuth2Config{Enabled: false}
		validator := NewOAuth2Validator(config, zap.NewNop())
		assert.False(t, validator.config.Enabled)
	})

	t.Run("enabled with providers", func(t *testing.T) {
		config := &OAuth2Config{
			Enabled:          true,
			AllowedProviders: []OAuth2Provider{ProviderGoogle, ProviderMicrosoft},
			GoogleClientIDs:  []string{"123.apps.googleusercontent.com"},
		}
		validator := NewOAuth2Validator(config, zap.NewNop())
		assert.True(t, validator.config.Enabled)
		assert.Len(t, validator.config.AllowedProviders, 2)
		assert.Len(t, validator.config.GoogleClientIDs, 1)
	})
}

func TestServerOAuth2Support(t *testing.T) {
	t.Run("server without OAuth2", func(t *testing.T) {
		s := &Server{}
		assert.False(t, s.SupportsOAuth2())
	})

	t.Run("server with disabled OAuth2", func(t *testing.T) {
		s := &Server{
			logger: zap.NewNop(),
		}
		s.SetOAuth2Config(&OAuth2Config{Enabled: false})
		assert.False(t, s.SupportsOAuth2())
	})

	t.Run("server with enabled OAuth2", func(t *testing.T) {
		s := &Server{
			logger: zap.NewNop(),
		}
		s.SetOAuth2Config(&OAuth2Config{
			Enabled:          true,
			AllowedProviders: []OAuth2Provider{ProviderGoogle},
		})
		assert.True(t, s.SupportsOAuth2())
	})
}

func TestCapabilitiesWithOAuth2(t *testing.T) {
	logger := zap.NewNop()

	t.Run("capabilities without OAuth2", func(t *testing.T) {
		s := &Server{
			config: &config.Config{
				IMAP: config.IMAPConfig{
					Capabilities: []string{"IMAP4rev1"},
				},
			},
			logger: logger,
		}

		caps := s.getCapabilities(true)
		assert.Contains(t, caps, "IMAP4rev1")
		assert.NotContains(t, caps, "AUTH=XOAUTH2")
		assert.NotContains(t, caps, "AUTH=OAUTHBEARER")
	})

	t.Run("capabilities with OAuth2", func(t *testing.T) {
		s := &Server{
			config: &config.Config{
				IMAP: config.IMAPConfig{
					Capabilities: []string{"IMAP4rev1"},
				},
			},
			logger:          logger,
			oauth2Validator: NewOAuth2Validator(&OAuth2Config{Enabled: true}, logger),
		}

		caps := s.getCapabilities(true)
		assert.Contains(t, caps, "IMAP4rev1")
		assert.Contains(t, caps, "AUTH=XOAUTH2")
		assert.Contains(t, caps, "AUTH=OAUTHBEARER")
	})
}

// Helper functions

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
