// Package service provides tests for MFA (Multi-Factor Authentication) functionality.
package service

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/testutil"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

func TestAuthService_EnableMFA(t *testing.T) {
	tests := []struct {
		name        string
		setupRepo   func(*testutil.MockRepository) uuid.UUID
		expectError bool
	}{
		{
			name: "successfully enable MFA",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = false
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: false,
		},
		{
			name: "fails for non-existent user",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				return uuid.New() // Non-existent user
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
				MFA: config.MFAConfig{
					Issuer:     "TestApp",
					TOTPDigits: 6,
					TOTPPeriod: 30,
				},
			}

			userID := tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			result, err := service.EnableMFA(ctx, userID)

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if result == nil {
					t.Error("Expected result but got nil")
				}
				if result != nil && result.Secret == "" {
					t.Error("Expected MFA secret in result")
				}
				if result != nil && result.QRCodeURL == "" {
					t.Error("Expected QR code URL in result")
				}
				if result != nil && len(result.RecoveryCodes) == 0 {
					t.Error("Expected recovery codes in result")
				}
			}
		})
	}
}

func TestAuthService_VerifyMFA(t *testing.T) {
	// Generate a valid TOTP secret for testing
	key, _ := totp.Generate(totp.GenerateOpts{
		Issuer:      "TestApp",
		AccountName: "test@example.com",
	})
	validSecret := key.Secret()

	tests := []struct {
		name        string
		mfaCode     string
		setupRepo   func(*testutil.MockRepository) (uuid.UUID, string)
		expectError bool
	}{
		{
			name: "successfully verify valid MFA code",
			setupRepo: func(repo *testutil.MockRepository) (uuid.UUID, string) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = false
				fixtures.User.MFASecret = sql.NullString{String: validSecret, Valid: true}
				fixtures.SetupMockRepo(repo)

				// Generate valid TOTP code
				code, _ := totp.GenerateCode(validSecret, time.Now())
				return fixtures.User.ID, code
			},
			expectError: false,
		},
		{
			name:    "fails with invalid MFA code",
			mfaCode: "000000",
			setupRepo: func(repo *testutil.MockRepository) (uuid.UUID, string) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = false
				fixtures.User.MFASecret = sql.NullString{String: validSecret, Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID, "000000"
			},
			expectError: true,
		},
		{
			name: "fails for non-existent user",
			setupRepo: func(repo *testutil.MockRepository) (uuid.UUID, string) {
				return uuid.New(), "123456"
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
				MFA: config.MFAConfig{
					Issuer:     "TestApp",
					TOTPDigits: 6,
					TOTPPeriod: 30,
				},
			}

			userID, code := tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			err := service.VerifyAndEnableMFA(ctx, userID, code)

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

func TestAuthService_DisableMFA(t *testing.T) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("Password123!"), 10)

	tests := []struct {
		name        string
		password    string
		setupRepo   func(*testutil.MockRepository) uuid.UUID
		expectError bool
	}{
		{
			name:     "successfully disable MFA with correct password",
			password: "Password123!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = true
				fixtures.User.MFASecret = sql.NullString{String: "JBSWY3DPEHPK3PXP", Valid: true}
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: false,
		},
		{
			name:     "fails with incorrect password",
			password: "WrongPassword!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = true
				fixtures.User.MFASecret = sql.NullString{String: "JBSWY3DPEHPK3PXP", Valid: true}
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: true,
		},
		{
			name:     "fails when MFA not enabled",
			password: "Password123!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = false
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
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
			err := service.DisableMFA(ctx, userID, tt.password, "192.168.1.1", "TestAgent")

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

func TestAuthService_VerifyRecoveryCode(t *testing.T) {
	tests := []struct {
		name         string
		recoveryCode string
		setupRepo    func(*testutil.MockRepository) uuid.UUID
		expectError  bool
	}{
		{
			name:         "successfully verify valid recovery code",
			recoveryCode: "ABC12-DEF34",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = true
				fixtures.User.MFARecoveryCodes = models.StringArray{"ABC12-DEF34", "GHI56-JKL78"}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: false,
		},
		{
			name:         "fails with invalid recovery code",
			recoveryCode: "INVALID-CODE",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = true
				fixtures.User.MFARecoveryCodes = models.StringArray{"ABC12-DEF34", "GHI56-JKL78"}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: true,
		},
		{
			name:         "fails when recovery codes exhausted",
			recoveryCode: "ABC12-DEF34",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = true
				fixtures.User.MFARecoveryCodes = models.StringArray{} // Empty
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
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
			err := service.VerifyRecoveryCode(ctx, userID, tt.recoveryCode)

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

func TestAuthService_RegenerateMFARecoveryCodes(t *testing.T) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("Password123!"), 10)

	tests := []struct {
		name        string
		password    string
		setupRepo   func(*testutil.MockRepository) uuid.UUID
		expectError bool
		expectCodes int
	}{
		{
			name:     "successfully regenerate recovery codes",
			password: "Password123!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = true
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: false,
			expectCodes: 10,
		},
		{
			name:     "fails with incorrect password",
			password: "WrongPassword!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = true
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: true,
		},
		{
			name:     "fails when MFA not enabled",
			password: "Password123!",
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.MFAEnabled = false
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
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
				MFA:      config.MFAConfig{RecoveryCodesCount: 10},
			}

			userID := tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			codes, err := service.RegenerateRecoveryCodes(ctx, userID, tt.password, "192.168.1.1", "TestAgent")

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if len(codes) != tt.expectCodes {
					t.Errorf("Expected %d recovery codes, got %d", tt.expectCodes, len(codes))
				}
			}
		})
	}
}
