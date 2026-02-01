// Package service provides tests for token management functionality.
package service

import (
	"context"
	"testing"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/testutil"
	"github.com/google/uuid"
)

func TestAuthService_RevokeToken(t *testing.T) {
	tests := []struct {
		name        string
		setupRepo   func(*testutil.MockRepository, *testutil.MockTokenService) (uuid.UUID, string)
		expectError bool
	}{
		{
			name: "successfully revoke valid token",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) (uuid.UUID, string) {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				sessionID := uuid.New()
				token := "valid-access-token"
				tokenService.ValidAccessTokens[token] = &testutil.AccessClaims{
					UserID:    fixtures.User.ID,
					SessionID: sessionID,
				}

				repo.AddSession(&models.UserSession{
					ID:        sessionID,
					UserID:    fixtures.User.ID,
					ExpiresAt: time.Now().Add(24 * time.Hour),
				})

				return fixtures.User.ID, token
			},
			expectError: false,
		},
		{
			name: "fails with invalid token",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) (uuid.UUID, string) {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID, "invalid-token"
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

			userID, token := tt.setupRepo(repo, tokenService)

			service := NewAuthService(repo, tokenService, cfg)
			err := service.RevokeToken(ctx, userID, token)

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

func TestAuthService_TokenRefreshWithRotation(t *testing.T) {
	tests := []struct {
		name        string
		setupRepo   func(*testutil.MockRepository, *testutil.MockTokenService) string
		expectError bool
		errorType   error
	}{
		{
			name: "successful token refresh with rotation",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				refreshToken := "valid-refresh-token"
				sessionID := uuid.New()
				tokenService.ValidRefreshTokens[refreshToken] = &testutil.RefreshClaims{
					UserID:    fixtures.User.ID,
					SessionID: sessionID,
				}

				repo.AddSession(&models.UserSession{
					ID:             sessionID,
					UserID:         fixtures.User.ID,
					TokenHash:      "hashed-token",
					ExpiresAt:      time.Now().Add(24 * time.Hour),
					LastActivityAt: time.Now(),
				})

				return refreshToken
			},
			expectError: false,
		},
		{
			name: "detects refresh token reuse (replay attack)",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				refreshToken := "reused-refresh-token"
				sessionID := uuid.New()
				tokenService.ValidRefreshTokens[refreshToken] = &testutil.RefreshClaims{
					UserID:    fixtures.User.ID,
					SessionID: sessionID,
				}

				// Session marked as token already rotated
				repo.AddSession(&models.UserSession{
					ID:             sessionID,
					UserID:         fixtures.User.ID,
					TokenHash:      "different-hash", // Token was already rotated
					ExpiresAt:      time.Now().Add(24 * time.Hour),
					LastActivityAt: time.Now(),
					TokenRotatedAt: &time.Time{}, // Mark as rotated
				})

				return refreshToken
			},
			expectError: true,
			errorType:   ErrTokenReuse,
		},
		{
			name: "fails with revoked session",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				refreshToken := "revoked-session-token"
				sessionID := uuid.New()
				tokenService.ValidRefreshTokens[refreshToken] = &testutil.RefreshClaims{
					UserID:    fixtures.User.ID,
					SessionID: sessionID,
				}

				// No session in repo - means it was revoked
				return refreshToken
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{
				Security: config.SecurityConfig{BcryptCost: 10},
				Token: config.TokenConfig{
					EnableRotation: true,
				},
			}

			refreshToken := tt.setupRepo(repo, tokenService)

			service := NewAuthService(repo, tokenService, cfg)
			result, err := service.RefreshToken(ctx, refreshToken, "192.168.1.1", "TestAgent")

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if result == nil {
					t.Error("Expected token pair but got nil")
				}
				if result != nil && result.AccessToken == "" {
					t.Error("Expected access token in result")
				}
				if result != nil && result.RefreshToken == "" {
					t.Error("Expected refresh token in result (rotation)")
				}
			}
		})
	}
}

func TestAuthService_ValidateAccessToken(t *testing.T) {
	tests := []struct {
		name        string
		setupRepo   func(*testutil.MockRepository, *testutil.MockTokenService) string
		expectError bool
	}{
		{
			name: "successfully validate valid access token",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				sessionID := uuid.New()
				token := "valid-access-token"
				tokenService.ValidAccessTokens[token] = &testutil.AccessClaims{
					UserID:    fixtures.User.ID,
					SessionID: sessionID,
					DomainID:  fixtures.Domain.ID,
				}

				repo.AddSession(&models.UserSession{
					ID:        sessionID,
					UserID:    fixtures.User.ID,
					ExpiresAt: time.Now().Add(24 * time.Hour),
				})

				return token
			},
			expectError: false,
		},
		{
			name: "fails with expired access token",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				token := "expired-access-token"
				tokenService.ExpiredTokens[token] = true

				return token
			},
			expectError: true,
		},
		{
			name: "fails with revoked session",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				sessionID := uuid.New()
				token := "valid-token-revoked-session"
				tokenService.ValidAccessTokens[token] = &testutil.AccessClaims{
					UserID:    fixtures.User.ID,
					SessionID: sessionID,
				}

				// Session is revoked (not in repo)
				return token
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

			accessToken := tt.setupRepo(repo, tokenService)

			service := NewAuthService(repo, tokenService, cfg)
			claims, err := service.ValidateAccessToken(ctx, accessToken)

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if claims == nil {
					t.Error("Expected claims but got nil")
				}
			}
		})
	}
}

func TestAuthService_GetActiveSessions(t *testing.T) {
	tests := []struct {
		name           string
		setupRepo      func(*testutil.MockRepository) uuid.UUID
		expectError    bool
		expectedCount  int
	}{
		{
			name: "returns all active sessions",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				// Add multiple sessions
				for i := 0; i < 3; i++ {
					repo.AddSession(&models.UserSession{
						ID:             uuid.New(),
						UserID:         fixtures.User.ID,
						IPAddress:      "192.168.1.1",
						UserAgent:      "TestAgent/1.0",
						ExpiresAt:      time.Now().Add(24 * time.Hour),
						LastActivityAt: time.Now(),
					})
				}

				return fixtures.User.ID
			},
			expectError:   false,
			expectedCount: 3,
		},
		{
			name: "excludes expired sessions",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				// Active session
				repo.AddSession(&models.UserSession{
					ID:        uuid.New(),
					UserID:    fixtures.User.ID,
					ExpiresAt: time.Now().Add(24 * time.Hour),
				})

				// Expired session
				repo.AddSession(&models.UserSession{
					ID:        uuid.New(),
					UserID:    fixtures.User.ID,
					ExpiresAt: time.Now().Add(-1 * time.Hour),
				})

				return fixtures.User.ID
			},
			expectError:   false,
			expectedCount: 1,
		},
		{
			name: "returns empty for user with no sessions",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError:   false,
			expectedCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

			userID := tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			sessions, err := service.GetActiveSessions(ctx, userID)

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if len(sessions) != tt.expectedCount {
					t.Errorf("Expected %d sessions, got %d", tt.expectedCount, len(sessions))
				}
			}
		})
	}
}

func TestAuthService_RevokeAllSessions(t *testing.T) {
	t.Run("revokes all sessions except current", func(t *testing.T) {
		ctx := context.Background()
		repo := testutil.NewMockRepository()
		tokenService := testutil.NewMockTokenService()
		cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

		fixtures := testutil.NewTestFixtures()
		fixtures.SetupMockRepo(repo)

		currentSessionID := uuid.New()

		// Add multiple sessions
		for i := 0; i < 5; i++ {
			sessionID := uuid.New()
			if i == 0 {
				sessionID = currentSessionID
			}
			repo.AddSession(&models.UserSession{
				ID:        sessionID,
				UserID:    fixtures.User.ID,
				ExpiresAt: time.Now().Add(24 * time.Hour),
			})
		}

		service := NewAuthService(repo, tokenService, cfg)
		err := service.RevokeAllSessions(ctx, fixtures.User.ID, &currentSessionID, "192.168.1.1", "TestAgent")

		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}

		// Verify only current session remains
		sessions, _ := repo.GetUserSessions(ctx, fixtures.User.ID)
		if len(sessions) != 1 {
			t.Errorf("Expected 1 session remaining, got %d", len(sessions))
		}
	})

	t.Run("revokes all sessions when no current session", func(t *testing.T) {
		ctx := context.Background()
		repo := testutil.NewMockRepository()
		tokenService := testutil.NewMockTokenService()
		cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

		fixtures := testutil.NewTestFixtures()
		fixtures.SetupMockRepo(repo)

		// Add multiple sessions
		for i := 0; i < 5; i++ {
			repo.AddSession(&models.UserSession{
				ID:        uuid.New(),
				UserID:    fixtures.User.ID,
				ExpiresAt: time.Now().Add(24 * time.Hour),
			})
		}

		service := NewAuthService(repo, tokenService, cfg)
		err := service.RevokeAllSessions(ctx, fixtures.User.ID, nil, "192.168.1.1", "TestAgent")

		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}

		// Verify all sessions removed
		sessions, _ := repo.GetUserSessions(ctx, fixtures.User.ID)
		if len(sessions) != 0 {
			t.Errorf("Expected 0 sessions remaining, got %d", len(sessions))
		}
	})
}
