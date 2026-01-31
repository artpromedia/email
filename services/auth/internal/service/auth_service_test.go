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
	"golang.org/x/crypto/bcrypt"
)

func TestAuthService_Register(t *testing.T) {
	tests := []struct {
		name        string
		params      RegisterParams
		setupRepo   func(*testutil.MockRepository)
		expectError bool
		errorType   error
	}{
		{
			name: "successful registration",
			params: RegisterParams{
				Email:       "newuser@example.com",
				Password:    "SecurePass123!",
				DisplayName: "New User",
				IPAddress:   "192.168.1.1",
				UserAgent:   "TestAgent/1.0",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				repo.AddOrganization(fixtures.Organization)
				repo.AddDomain(fixtures.Domain)
			},
			expectError: false,
		},
		{
			name: "registration fails with unverified domain",
			params: RegisterParams{
				Email:       "user@unverified.com",
				Password:    "SecurePass123!",
				DisplayName: "Test User",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				repo.AddOrganization(fixtures.Organization)
				unverifiedDomain := &models.Domain{
					ID:             uuid.New(),
					OrganizationID: fixtures.Organization.ID,
					DomainName:     "unverified.com",
					IsVerified:     false,
					IsActive:       true,
				}
				repo.AddDomain(unverifiedDomain)
			},
			expectError: true,
			errorType:   ErrDomainNotVerified,
		},
		{
			name: "registration fails with existing email",
			params: RegisterParams{
				Email:       "testuser@example.com",
				Password:    "SecurePass123!",
				DisplayName: "Duplicate User",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
			},
			expectError: true,
			errorType:   ErrEmailExists,
		},
		{
			name: "registration fails with weak password",
			params: RegisterParams{
				Email:       "newuser@example.com",
				Password:    "weak", // Too short
				DisplayName: "New User",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				repo.AddOrganization(fixtures.Organization)
				repo.AddDomain(fixtures.Domain)
			},
			expectError: true,
			errorType:   ErrInvalidPassword,
		},
		{
			name: "registration fails with unknown domain",
			params: RegisterParams{
				Email:       "user@unknown.com",
				Password:    "SecurePass123!",
				DisplayName: "Test User",
			},
			setupRepo:   func(repo *testutil.MockRepository) {},
			expectError: true,
			errorType:   ErrDomainNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{
				Security: config.SecurityConfig{
					BcryptCost:        10,
					MaxLoginAttempts:  5,
					LockoutDuration:   15 * time.Minute,
					RequireEmailVerify: false,
				},
			}

			tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			result, err := service.Register(ctx, tt.params)

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
				if result != nil && result.User == nil {
					t.Error("Expected user in result")
				}
				if result != nil && result.TokenPair == nil {
					t.Error("Expected token pair in result")
				}
			}
		})
	}
}

func TestAuthService_Login(t *testing.T) {
	// Create a properly hashed password for testing
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("CorrectPassword123!"), 10)

	tests := []struct {
		name        string
		params      LoginParams
		setupRepo   func(*testutil.MockRepository)
		expectError bool
		errorType   error
		expectMFA   bool
	}{
		{
			name: "successful login",
			params: LoginParams{
				Email:     "testuser@example.com",
				Password:  "CorrectPassword123!",
				IPAddress: "192.168.1.1",
				UserAgent: "TestAgent/1.0",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
			},
			expectError: false,
		},
		{
			name: "login fails with invalid password",
			params: LoginParams{
				Email:     "testuser@example.com",
				Password:  "WrongPassword!",
				IPAddress: "192.168.1.1",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
			},
			expectError: true,
			errorType:   ErrInvalidCredentials,
		},
		{
			name: "login fails with locked account",
			params: LoginParams{
				Email:     "testuser@example.com",
				Password:  "CorrectPassword123!",
				IPAddress: "192.168.1.1",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.User.LockedUntil = sql.NullTime{Time: time.Now().Add(1 * time.Hour), Valid: true}
				fixtures.SetupMockRepo(repo)
			},
			expectError: true,
			errorType:   ErrAccountLocked,
		},
		{
			name: "login fails with disabled account",
			params: LoginParams{
				Email:     "testuser@example.com",
				Password:  "CorrectPassword123!",
				IPAddress: "192.168.1.1",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.User.Status = "suspended"
				fixtures.SetupMockRepo(repo)
			},
			expectError: true,
			errorType:   ErrAccountDisabled,
		},
		{
			name: "login fails with SSO enforced",
			params: LoginParams{
				Email:     "testuser@example.com",
				Password:  "CorrectPassword123!",
				IPAddress: "192.168.1.1",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.SetupMockRepo(repo)
				repo.AddSSOConfig(&models.SSOConfig{
					DomainID:   fixtures.Domain.ID,
					IsEnabled:  true,
					EnforceSSO: true,
				})
			},
			expectError: true,
			errorType:   ErrSSOEnforced,
		},
		{
			name: "login requires MFA",
			params: LoginParams{
				Email:     "testuser@example.com",
				Password:  "CorrectPassword123!",
				MFACode:   "", // No MFA code provided
				IPAddress: "192.168.1.1",
			},
			setupRepo: func(repo *testutil.MockRepository) {
				fixtures := testutil.NewTestFixtures()
				fixtures.User.PasswordHash = sql.NullString{String: string(hashedPassword), Valid: true}
				fixtures.User.MFAEnabled = true
				fixtures.User.MFASecret = sql.NullString{String: "JBSWY3DPEHPK3PXP", Valid: true}
				fixtures.SetupMockRepo(repo)
			},
			expectError: false,
			expectMFA:   true,
		},
		{
			name: "login fails for unknown user",
			params: LoginParams{
				Email:     "unknown@example.com",
				Password:  "SomePassword123!",
				IPAddress: "192.168.1.1",
			},
			setupRepo:   func(repo *testutil.MockRepository) {},
			expectError: true,
			errorType:   ErrInvalidCredentials,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{
				Security: config.SecurityConfig{
					BcryptCost:       10,
					MaxLoginAttempts: 5,
					LockoutDuration:  15 * time.Minute,
				},
			}

			tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			result, err := service.Login(ctx, tt.params)

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
				if tt.expectMFA && result != nil && !result.MFARequired {
					t.Error("Expected MFA to be required")
				}
				if !tt.expectMFA && result != nil && result.MFARequired {
					t.Error("MFA should not be required")
				}
			}
		})
	}
}

func TestAuthService_RefreshToken(t *testing.T) {
	tests := []struct {
		name           string
		setupRepo      func(*testutil.MockRepository, *testutil.MockTokenService) string
		expectError    bool
	}{
		{
			name: "successful token refresh",
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
			name: "refresh fails with expired session",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				refreshToken := "expired-refresh-token"
				sessionID := uuid.New()
				tokenService.ValidRefreshTokens[refreshToken] = &testutil.RefreshClaims{
					UserID:    fixtures.User.ID,
					SessionID: sessionID,
				}

				repo.AddSession(&models.UserSession{
					ID:             sessionID,
					UserID:         fixtures.User.ID,
					TokenHash:      "hashed-token",
					ExpiresAt:      time.Now().Add(-1 * time.Hour), // Expired
					LastActivityAt: time.Now(),
				})

				return refreshToken
			},
			expectError: true,
		},
		{
			name: "refresh fails with invalid token",
			setupRepo: func(repo *testutil.MockRepository, tokenService *testutil.MockTokenService) string {
				return "invalid-token"
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
				Security: config.SecurityConfig{
					BcryptCost: 10,
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
			}
		})
	}
}

func TestAuthService_AddEmail(t *testing.T) {
	tests := []struct {
		name        string
		params      AddEmailParams
		setupRepo   func(*testutil.MockRepository) uuid.UUID
		expectError bool
	}{
		{
			name: "successfully add email",
			params: AddEmailParams{
				Email:         "newemail@example.com",
				CreateMailbox: true,
				IPAddress:     "192.168.1.1",
			},
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID
			},
			expectError: false,
		},
		{
			name: "fails with different org domain",
			params: AddEmailParams{
				Email:         "user@otherdomain.com",
				CreateMailbox: true,
			},
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
				// Add a domain from different org
				otherOrg := &models.Organization{
					ID:       uuid.New(),
					Name:     "Other Org",
					IsActive: true,
				}
				repo.AddOrganization(otherOrg)
				repo.AddDomain(&models.Domain{
					ID:             uuid.New(),
					OrganizationID: otherOrg.ID,
					DomainName:     "otherdomain.com",
					IsVerified:     true,
					IsActive:       true,
				})
				return fixtures.User.ID
			},
			expectError: true,
		},
		{
			name: "fails with existing email",
			params: AddEmailParams{
				Email:         "testuser@example.com",
				CreateMailbox: true,
			},
			setupRepo: func(repo *testutil.MockRepository) uuid.UUID {
				fixtures := testutil.NewTestFixtures()
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
			}

			userID := tt.setupRepo(repo)
			tt.params.UserID = userID

			service := NewAuthService(repo, tokenService, cfg)
			result, err := service.AddEmail(ctx, tt.params)

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if result == nil {
					t.Error("Expected email address but got nil")
				}
			}
		})
	}
}

func TestAuthService_DeleteEmail(t *testing.T) {
	tests := []struct {
		name        string
		setupRepo   func(*testutil.MockRepository) (uuid.UUID, uuid.UUID)
		expectError bool
		errorType   error
	}{
		{
			name: "successfully delete non-primary email",
			setupRepo: func(repo *testutil.MockRepository) (uuid.UUID, uuid.UUID) {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)

				// Add a secondary email
				secondaryEmail := &models.UserEmailAddress{
					ID:           uuid.New(),
					UserID:       fixtures.User.ID,
					DomainID:     fixtures.Domain.ID,
					EmailAddress: "secondary@example.com",
					IsPrimary:    false,
					IsVerified:   true,
				}
				repo.AddEmailAddress(secondaryEmail)

				return fixtures.User.ID, secondaryEmail.ID
			},
			expectError: false,
		},
		{
			name: "fails to delete primary email",
			setupRepo: func(repo *testutil.MockRepository) (uuid.UUID, uuid.UUID) {
				fixtures := testutil.NewTestFixtures()
				fixtures.SetupMockRepo(repo)
				return fixtures.User.ID, fixtures.EmailAddress.ID
			},
			expectError: true,
			errorType:   ErrCannotRemovePrimary,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{
				Security: config.SecurityConfig{BcryptCost: 10},
			}

			userID, emailID := tt.setupRepo(repo)

			service := NewAuthService(repo, tokenService, cfg)
			err := service.DeleteEmail(ctx, userID, emailID, "192.168.1.1", "TestAgent")

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

func TestAuthService_SessionManagement(t *testing.T) {
	t.Run("logout revokes session", func(t *testing.T) {
		ctx := context.Background()
		repo := testutil.NewMockRepository()
		tokenService := testutil.NewMockTokenService()
		cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

		sessionID := uuid.New()
		repo.AddSession(&models.UserSession{
			ID:        sessionID,
			UserID:    uuid.New(),
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		service := NewAuthService(repo, tokenService, cfg)
		err := service.Logout(ctx, sessionID)

		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
	})

	t.Run("logout all sessions", func(t *testing.T) {
		ctx := context.Background()
		repo := testutil.NewMockRepository()
		tokenService := testutil.NewMockTokenService()
		cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

		userID := uuid.New()
		currentSession := uuid.New()

		// Add multiple sessions
		for i := 0; i < 5; i++ {
			sessionID := uuid.New()
			if i == 0 {
				sessionID = currentSession
			}
			repo.AddSession(&models.UserSession{
				ID:        sessionID,
				UserID:    userID,
				ExpiresAt: time.Now().Add(24 * time.Hour),
			})
		}

		service := NewAuthService(repo, tokenService, cfg)
		err := service.LogoutAllSessions(ctx, userID, &currentSession)

		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}

		// Verify current session still exists
		sessions, _ := repo.GetUserSessions(ctx, userID)
		if len(sessions) != 1 {
			t.Errorf("Expected 1 session (current), got %d", len(sessions))
		}
	})
}

func TestAuthService_PasswordValidation(t *testing.T) {
	tests := []struct {
		name     string
		password string
		policy   models.PasswordPolicy
		valid    bool
	}{
		{
			name:     "valid password meets all requirements",
			password: "SecurePass123!",
			policy: models.PasswordPolicy{
				MinLength:           8,
				RequireUppercase:    true,
				RequireLowercase:    true,
				RequireNumbers:      true,
				RequireSpecialChars: true,
			},
			valid: true,
		},
		{
			name:     "fails minimum length",
			password: "Short1!",
			policy: models.PasswordPolicy{
				MinLength: 8,
			},
			valid: false,
		},
		{
			name:     "fails uppercase requirement",
			password: "lowercase123!",
			policy: models.PasswordPolicy{
				MinLength:        8,
				RequireUppercase: true,
			},
			valid: false,
		},
		{
			name:     "fails number requirement",
			password: "NoNumbersHere!",
			policy: models.PasswordPolicy{
				MinLength:      8,
				RequireNumbers: true,
			},
			valid: false,
		},
		{
			name:     "fails special char requirement",
			password: "NoSpecialChars123",
			policy: models.PasswordPolicy{
				MinLength:           8,
				RequireSpecialChars: true,
			},
			valid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := testutil.NewMockRepository()
			tokenService := testutil.NewMockTokenService()
			cfg := &config.Config{Security: config.SecurityConfig{BcryptCost: 10}}

			service := NewAuthService(repo, tokenService, cfg)
			err := service.validatePassword(tt.password, tt.policy)

			if tt.valid && err != nil {
				t.Errorf("Expected password to be valid, got error: %v", err)
			}
			if !tt.valid && err == nil {
				t.Error("Expected password to be invalid, got no error")
			}
		})
	}
}
