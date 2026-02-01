// Package service provides tests for password reset functionality.
package service

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/artpromedia/email/services/auth/internal/testutil"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func TestAuthService_RequestPasswordReset(t *testing.T) {
	tests := []struct {
		name        string
		email       string
		setupRepo   func(*testutil.MockRepository)
		expectError bool
	}{
		{
			name:  "successfully request password reset",
			email: "testuser@example.com",
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
			},
			expectError: false,
		},
		{
			name:  "silent success for non-existent email (security)",
			email: "nonexistent@example.com",
			setupRepo: func(repo *testutil.MockRepository) {
				// No user setup - email doesn't exist
			},
			// Should NOT return error to prevent email enumeration
			expectError: false,
		},
		{
			name:  "silent success for disabled account (security)",
			email: "disabled@example.com",
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.Status = "suspended"
				fixtures.SetupMockRepo(repo)
			},
			// Should NOT return error to prevent account enumeration
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{
				Security: config.SecurityConfig{
					BcryptCost:         10,
					PasswordResetExpiry: 24 * time.Hour,
				},
				Email: config.EmailConfig{
					FromAddress: "noreply@example.com",
					FromName:    "Test App",
				},
			}

			tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			err := service.RequestPasswordReset(ctx, tt.email, "192.168.1.1", "TestAgent")

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

func TestAuthService_ResetPassword(t *testing.T) {
	tests := []struct {
		name        string
		token       string
		newPassword string
		setupRepo   func(*testutil.MockRepository) string
		expectError bool
		errorType   error
	}{
		{
			name:        "successfully reset password",
			newPassword: "NewSecurePassword123!",
			setupRepo: func(repo *testutil.MockRepository) string {
				fixtures := testutil.NewTestFixtures()
				token := "valid-reset-token"
				fixtures.User.PasswordResetToken = sql.NullString{String: token, Valid: true}
				fixtures.User.PasswordResetExpiry = sql.NullTime{
					Time:  time.Now().Add(1 * time.Hour),
					Valid: true,
				}
				fixtures.SetupMockRepo(repo)
				return token
			},
			expectError: false,
		},
		{
			name:        "fails with expired token",
			newPassword: "NewSecurePassword123!",
			setupRepo: func(repo *testutil.MockRepository) string {
				fixtures := testutil.NewTestFixtures()
				token := "expired-reset-token"
				fixtures.User.PasswordResetToken = sql.NullString{String: token, Valid: true}
				fixtures.User.PasswordResetExpiry = sql.NullTime{
					Time:  time.Now().Add(-1 * time.Hour), // Expired
					Valid: true,
				}
				fixtures.SetupMockRepo(repo)
				return token
			},
			expectError: true,
			errorType:   ErrInvalidToken,
		},
		{
			name:        "fails with invalid token",
			token:       "invalid-token",
			newPassword: "NewSecurePassword123!",
			setupRepo: func(repo *testutil.MockRepository) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
				return "invalid-token"
			},
			expectError: true,
			errorType:   ErrInvalidToken,
		},
		{
			name:        "fails with weak password",
			newPassword: "weak",
			setupRepo: func(repo *testutil.MockRepository) string {
				fixtures := testutil.NewTestFixtures()
				token := "valid-reset-token"
				fixtures.User.PasswordResetToken = sql.NullString{String: token, Valid: true}
				fixtures.User.PasswordResetExpiry = sql.NullTime{
					Time:  time.Now().Add(1 * time.Hour),
					Valid: true,
				}
				fixtures.SetupMockRepo(repo)
				return token
			},
			expectError: true,
			errorType:   ErrInvalidPassword,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{
				Security: config.SecurityConfig{
					BcryptCost: 10,
				},
			}

			resetToken := tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			err := service.ResetPassword(ctx, resetToken, tt.newPassword, "192.168.1.1", "TestAgent")

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

func TestAuthService_ChangePassword(t *testing.T) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("OldPassword123!"), 10)

	tests := []struct {
		name        string
		oldPassword string
		newPassword string
		setupRepo   func(*testutil.MockRepository) uuid.UUID
		expectError bool
		errorType   error
	}{
		{
			name:        "successfully change password",
			oldPassword: "OldPassword123!",
			newPassword: "NewSecurePassword456!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: false,
		},
		{
			name:        "fails with incorrect old password",
			oldPassword: "WrongPassword!",
			newPassword: "NewSecurePassword456!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: true,
			errorType:   ErrInvalidCredentials,
		},
		{
			name:        "fails when new password is same as old",
			oldPassword: "OldPassword123!",
			newPassword: "OldPassword123!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: true,
		},
		{
			name:        "fails with weak new password",
			oldPassword: "OldPassword123!",
			newPassword: "123",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: true,
			errorType:   ErrInvalidPassword,
		},
		{
			name:        "fails for non-existent user",
			oldPassword: "OldPassword123!",
			newPassword: "NewSecurePassword456!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				return uuid.New()
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

			userID := tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			err := service.ChangePassword(ctx, userID, tt.oldPassword, tt.newPassword, "192.168.1.1", "TestAgent")

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

func TestAuthService_PasswordHistory(t *testing.T) {
	// Test that password history is enforced
	hashedPassword1, _ := bcrypt.GenerateFromPassword([]byte("OldPassword123!"), 10)
	hashedPassword2, _ := bcrypt.GenerateFromPassword([]byte("PreviousPassword456!"), 10)

	t.Run("prevents reuse of recent passwords", func(t *testing.T) {
		ctx := context.Background()
		repo := testutil.NewMockRepository()
		tokenService := testutil.NewMockTokenService()
		cfg := &config.Config{
			Security: config.SecurityConfig{
				BcryptCost:           10,
				PasswordHistoryCount: 5,
			},
		}

		fixtures := testutil.NewTestFixtures()
		fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword1), Valid: true}
		fixtures.User.PasswordHistory = []string{string(hashedPassword1), string(hashedPassword2)}
		fixtures.SetupMockRepo(repo)

		service := NewAuthService(repo, tokenService, cfg)

		// Try to reuse old password - should fail
		err := service.ChangePassword(ctx, fixtures.User.ID, "OldPassword123!", "PreviousPassword456!", "192.168.1.1", "TestAgent")
		if err == nil {
			t.Error("Expected error when reusing password from history")
		}

		// New unique password should succeed
		err = service.ChangePassword(ctx, fixtures.User.ID, "OldPassword123!", "CompletelyNewPassword789!", "192.168.1.1", "TestAgent")
		if err != nil {
			t.Errorf("Unexpected error with unique password: %v", err)
		}
	})
}

func TestAuthService_PasswordExpiry(t *testing.T) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("CurrentPassword123!"), 10)

	t.Run("flags expired password", func(t *testing.T) {
		ctx := context.Background()
		repo := testutil.NewMockRepository()
		tokenService := testutil.NewMockTokenService()
		cfg := &config.Config{
			Security: config.SecurityConfig{
				BcryptCost:     10,
				PasswordMaxAge: 90 * 24 * time.Hour, // 90 days
			},
		}

		fixtures := testutil.NewTestFixtures()
		fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
		fixtures.User.PasswordChangedAt = sql.NullTime{
			Time:  time.Now().Add(-100 * 24 * time.Hour), // 100 days ago
			Valid: true,
		}
		fixtures.SetupMockRepo(repo)

		service := NewAuthService(repo, tokenService, cfg)

		// Login should succeed but flag password as expired
		result, err := service.Login(ctx, LoginParams{
			Email:     "testuser@example.com",
			Password:  "CurrentPassword123!",
			IPAddress: "192.168.1.1",
		})

		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		if result == nil {
			t.Fatal("Expected result but got nil")
		}
		if !result.PasswordExpired {
			t.Error("Expected password to be flagged as expired")
		}
	})
}
