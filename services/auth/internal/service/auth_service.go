// Package service provides the core authentication business logic.
package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/repository"
	"github.com/artpromedia/email/services/auth/internal/token"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

// Common errors
var (
	ErrInvalidCredentials  = errors.New("invalid email or password")
	ErrAccountLocked       = errors.New("account is temporarily locked due to too many failed login attempts")
	ErrAccountDisabled     = errors.New("account has been disabled")
	ErrAccountPending      = errors.New("account is pending approval")
	ErrDomainNotFound      = errors.New("domain not found or not verified")
	ErrDomainNotVerified   = errors.New("domain is not verified")
	ErrEmailExists         = errors.New("email address already exists")
	ErrEmailNotFound       = errors.New("email address not found")
	ErrCannotRemovePrimary = errors.New("cannot remove primary email address")
	ErrEmailNotVerified    = errors.New("email address is not verified")
	ErrInvalidToken        = errors.New("invalid or expired token")
	ErrMFARequired         = errors.New("MFA verification required")
	ErrMFAInvalidCode      = errors.New("invalid MFA code")
	ErrSSOEnforced         = errors.New("password login is disabled for this domain, please use SSO")
	ErrPermissionDenied    = errors.New("permission denied")
	ErrSessionExpired      = errors.New("session has expired")
	ErrInvalidPassword     = errors.New("password does not meet requirements")
	ErrInvalidDomain       = errors.New("domain does not belong to your organization")
	ErrTokenReuse          = errors.New("refresh token has already been used - possible token theft detected")
)

// AuthService provides authentication operations.
type AuthService struct {
	repo          *repository.Repository
	tokenService  *token.Service
	config        *config.Config
	emailService  *EmailService
}

// NewAuthService creates a new AuthService.
func NewAuthService(repo *repository.Repository, tokenService *token.Service, cfg *config.Config) *AuthService {
	return &AuthService{
		repo:         repo,
		tokenService: tokenService,
		config:       cfg,
		emailService: NewEmailService(&cfg.Email),
	}
}

// RegisterParams holds parameters for user registration.
type RegisterParams struct {
	Email       string
	Password    string
	DisplayName string
	IPAddress   string
	UserAgent   string
}

// RegisterResult holds the result of user registration.
type RegisterResult struct {
	User         *models.User
	TokenPair    *token.TokenPair
	Organization *models.Organization
	Domain       *models.Domain
}

// Register creates a new user account.
func (s *AuthService) Register(ctx context.Context, params RegisterParams) (*RegisterResult, error) {
	// Extract domain from email
	parts := strings.Split(params.Email, "@")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid email format")
	}
	localPart := parts[0]
	domainName := parts[1]

	// Look up domain
	domain, err := s.repo.GetDomainByName(ctx, domainName)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, fmt.Errorf("%w: %s is not a registered organization domain", ErrDomainNotFound, domainName)
		}
		return nil, fmt.Errorf("failed to look up domain: %w", err)
	}

	// Check domain is verified and active
	if !domain.IsVerified {
		return nil, ErrDomainNotVerified
	}
	if !domain.IsActive {
		return nil, ErrDomainNotFound
	}

	// Get organization
	org, err := s.repo.GetOrganizationByID(ctx, domain.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get organization: %w", err)
	}
	if !org.IsActive {
		return nil, ErrDomainNotFound
	}

	// Check if email already exists
	exists, err := s.repo.CheckEmailExists(ctx, params.Email)
	if err != nil {
		return nil, fmt.Errorf("failed to check email: %w", err)
	}
	if exists {
		return nil, ErrEmailExists
	}

	// Validate password
	if err := s.validatePassword(params.Password, org.Settings.PasswordPolicy); err != nil {
		return nil, err
	}

	// Hash password
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(params.Password), s.config.Security.BcryptCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Generate verification token
	verificationToken := generateSecureToken()

	now := time.Now()
	userID := uuid.New()
	emailAddressID := uuid.New()
	mailboxID := uuid.New()

	// Create user
	user := &models.User{
		ID:             userID,
		OrganizationID: org.ID,
		DisplayName:    params.DisplayName,
		PasswordHash:   sql.NullString{String: string(passwordHash), Valid: true},
		Role:           "member",
		Status:         "active",
		Timezone:       "UTC",
		Locale:         "en-US",
		EmailVerified:  !s.config.Security.RequireEmailVerify,
		EmailVerificationToken: sql.NullString{
			String: verificationToken,
			Valid:  s.config.Security.RequireEmailVerify,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	// Create email address
	emailAddress := &models.UserEmailAddress{
		ID:           emailAddressID,
		UserID:       userID,
		DomainID:     domain.ID,
		EmailAddress: strings.ToLower(params.Email),
		LocalPart:    localPart,
		IsPrimary:    true,
		IsVerified:   !s.config.Security.RequireEmailVerify,
		VerificationToken: sql.NullString{
			String: verificationToken,
			Valid:  s.config.Security.RequireEmailVerify,
		},
		CreatedAt: now,
	}

	// Create mailbox
	mailbox := &models.Mailbox{
		ID:             mailboxID,
		UserID:         userID,
		EmailAddressID: emailAddressID,
		DomainEmail:    strings.ToLower(params.Email),
		DisplayName:    sql.NullString{String: params.DisplayName, Valid: true},
		QuotaBytes:     org.Settings.DefaultUserQuotaBytes,
		UsedBytes:      0,
		IsActive:       true,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	// Create user with email and mailbox in transaction
	if err := s.repo.CreateUser(ctx, user, emailAddress, mailbox); err != nil {
		if errors.Is(err, repository.ErrDuplicateEmail) {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Generate tokens
	tokenPair, err := s.generateTokensForUser(ctx, user, domain.ID, params.IPAddress, params.UserAgent)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Record login attempt
	s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, true, "", "registration")

	// Record audit log
	s.recordAuditLog(ctx, org.ID, &user.ID, "user.registered", "user", &user.ID, params.IPAddress, params.UserAgent, nil)

	return &RegisterResult{
		User:         user,
		TokenPair:    tokenPair,
		Organization: org,
		Domain:       domain,
	}, nil
}

// LoginParams holds parameters for user login.
type LoginParams struct {
	Email     string
	Password  string
	MFACode   string
	IPAddress string
	UserAgent string
}

// LoginResult holds the result of user login.
type LoginResult struct {
	User              *models.User
	TokenPair         *token.TokenPair
	Organization      *models.Organization
	MFARequired       bool
	MFAPendingToken   string
}

// Login authenticates a user.
func (s *AuthService) Login(ctx context.Context, params LoginParams) (*LoginResult, error) {
	// Extract domain from email for SSO check
	parts := strings.Split(params.Email, "@")
	if len(parts) != 2 {
		return nil, ErrInvalidCredentials
	}
	domainName := parts[1]

	// Look up domain for SSO config
	domain, err := s.repo.GetDomainByName(ctx, domainName)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Domain not found - still try to find user (might have email on different domain)
			domain = nil
		} else {
			return nil, fmt.Errorf("failed to look up domain: %w", err)
		}
	}

	// Check if SSO is enforced for this domain
	if domain != nil {
		ssoConfig, err := s.repo.GetSSOConfigByDomainID(ctx, domain.ID)
		if err == nil && ssoConfig.IsEnabled && ssoConfig.EnforceSSO {
			return nil, ErrSSOEnforced
		}
	}

	// Look up user by email (any of their addresses)
	user, err := s.repo.GetUserByEmail(ctx, params.Email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Don't reveal if user exists
			s.recordLoginAttempt(ctx, nil, params.Email, params.IPAddress, params.UserAgent, false, "user_not_found", "password")
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	// Check account status
	if user.Status == "suspended" || user.Status == "deleted" {
		s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, false, "account_disabled", "password")
		return nil, ErrAccountDisabled
	}
	if user.Status == "pending" {
		s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, false, "account_pending", "password")
		return nil, ErrAccountPending
	}

	// Check if account is locked
	if user.LockedUntil.Valid && user.LockedUntil.Time.After(time.Now()) {
		s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, false, "account_locked", "password")
		return nil, ErrAccountLocked
	}

	// Verify password
	if !user.PasswordHash.Valid {
		// No password set - must use SSO
		s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, false, "no_password", "password")
		return nil, ErrSSOEnforced
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(params.Password)); err != nil {
		// Update failed login attempts
		s.repo.UpdateUserLoginFailure(ctx, user.ID, s.config.Security.LockoutDuration, s.config.Security.MaxLoginAttempts)
		s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, false, "invalid_password", "password")
		return nil, ErrInvalidCredentials
	}

	// Check MFA
	if user.MFAEnabled {
		if params.MFACode == "" {
			// Return pending state - MFA required
			pendingToken := s.generateMFAPendingToken(user.ID)
			return &LoginResult{
				User:            user,
				MFARequired:     true,
				MFAPendingToken: pendingToken,
			}, nil
		}

		// Verify MFA code
		if !s.verifyMFACode(user, params.MFACode) {
			s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, false, "invalid_mfa", "mfa")
			return nil, ErrMFAInvalidCode
		}
	}

	// Get organization
	org, err := s.repo.GetOrganizationByID(ctx, user.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get organization: %w", err)
	}

	// Get primary domain for the user
	primaryEmail, err := s.repo.GetPrimaryEmailAddress(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get primary email: %w", err)
	}

	// Update login success
	s.repo.UpdateUserLoginSuccess(ctx, user.ID, params.IPAddress)

	// Generate tokens
	tokenPair, err := s.generateTokensForUser(ctx, user, primaryEmail.DomainID, params.IPAddress, params.UserAgent)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Record successful login
	s.recordLoginAttempt(ctx, &user.ID, params.Email, params.IPAddress, params.UserAgent, true, "", "password")
	s.recordAuditLog(ctx, org.ID, &user.ID, "user.login", "session", nil, params.IPAddress, params.UserAgent, nil)

	return &LoginResult{
		User:         user,
		TokenPair:    tokenPair,
		Organization: org,
	}, nil
}

// RefreshToken refreshes an access token with automatic token rotation.
// Implements refresh token rotation security pattern:
// - Each refresh token can only be used once
// - Using an already-used token indicates potential token theft
// - On token reuse detection, all user sessions are revoked for security
func (s *AuthService) RefreshToken(ctx context.Context, refreshToken, ipAddress, userAgent string) (*token.TokenPair, error) {
	// Validate refresh token
	claims, err := s.tokenService.ValidateRefreshToken(refreshToken)
	if err != nil {
		return nil, ErrInvalidToken
	}

	// Get user
	user, err := s.repo.GetUserByID(ctx, claims.UserID)
	if err != nil {
		return nil, ErrInvalidToken
	}

	// Check user status
	if user.Status != "active" {
		return nil, ErrAccountDisabled
	}

	// Get session by ID from the token claims
	session, err := s.repo.GetSessionByID(ctx, claims.SessionID)
	if err != nil {
		return nil, ErrSessionExpired
	}

	// Check if session was revoked
	if session.RevokedAt.Valid {
		return nil, ErrSessionExpired
	}

	if session.ExpiresAt.Before(time.Now()) {
		return nil, ErrSessionExpired
	}

	// CRITICAL: Token rotation security check
	// Verify the refresh token hash matches what's stored in the session
	// If it doesn't match, this token was already rotated (used previously)
	// This indicates potential token theft - revoke all sessions for security
	currentTokenHash := token.HashToken(refreshToken)
	if session.TokenHash != currentTokenHash {
		// Token reuse detected! This is a security event.
		// Revoke ALL user sessions to protect the account
		s.repo.RevokeAllUserSessions(ctx, user.ID, nil)

		// Record security audit event
		s.recordAuditLog(ctx, user.OrganizationID, &user.ID, "security.token_reuse_detected",
			"session", &session.ID, ipAddress, userAgent, map[string]string{
				"action": "all_sessions_revoked",
				"reason": "refresh_token_reuse_detected",
			})

		return nil, ErrTokenReuse
	}

	// Get primary email domain
	primaryEmail, err := s.repo.GetPrimaryEmailAddress(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get primary email: %w", err)
	}

	// Generate new token pair (includes new refresh token)
	tokenPair, err := s.generateTokenPairOnly(user, primaryEmail.DomainID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// ROTATE: Update session with new refresh token hash
	// This invalidates the old refresh token
	newTokenHash := token.HashToken(tokenPair.RefreshToken)
	newExpiresAt := time.Now().Add(s.tokenService.GetRefreshTokenExpiry())

	if err := s.repo.RotateSessionToken(ctx, session.ID, newTokenHash, newExpiresAt); err != nil {
		return nil, fmt.Errorf("failed to rotate token: %w", err)
	}

	// Record token refresh for audit
	s.recordAuditLog(ctx, user.OrganizationID, &user.ID, "token.refreshed",
		"session", &session.ID, ipAddress, userAgent, nil)

	return tokenPair, nil
}

// generateTokenPairOnly generates tokens without creating a session (for token rotation)
func (s *AuthService) generateTokenPairOnly(user *models.User, primaryDomainID uuid.UUID) (*token.TokenPair, error) {
	ctx := context.Background()

	// Get user's email addresses
	emails, err := s.repo.GetUserEmailAddresses(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get emails: %w", err)
	}

	// Get domain permissions
	perms, err := s.repo.GetUserDomainPermissions(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get permissions: %w", err)
	}

	// Get primary email
	var primaryEmail string
	for _, e := range emails {
		if e.IsPrimary {
			primaryEmail = e.EmailAddress
			break
		}
	}

	// Build domain list and roles
	domainIDs := make(map[uuid.UUID]bool)
	for _, e := range emails {
		domainIDs[e.DomainID] = true
	}

	var domains []uuid.UUID
	domainRoles := make(map[string]string)
	for domainID := range domainIDs {
		domains = append(domains, domainID)
		for _, p := range perms {
			if p.DomainID == domainID {
				if p.CanManage {
					domainRoles[domainID.String()] = "admin"
				} else {
					domainRoles[domainID.String()] = "member"
				}
				break
			}
		}
		if _, exists := domainRoles[domainID.String()]; !exists {
			domainRoles[domainID.String()] = "member"
		}
	}

	// Generate tokens (reuses existing session ID concept for token continuity)
	return s.tokenService.GenerateTokenPair(token.GenerateTokenParams{
		UserID:          user.ID,
		OrganizationID:  user.OrganizationID,
		PrimaryDomainID: primaryDomainID,
		Email:           primaryEmail,
		DisplayName:     user.DisplayName,
		Role:            user.Role,
		Domains:         domains,
		DomainRoles:     domainRoles,
		MFAVerified:     user.MFAEnabled,
	})
}

// Logout revokes the current session.
func (s *AuthService) Logout(ctx context.Context, sessionID uuid.UUID) error {
	return s.repo.RevokeSession(ctx, sessionID)
}

// LogoutAllSessions revokes all sessions for a user.
func (s *AuthService) LogoutAllSessions(ctx context.Context, userID uuid.UUID, exceptCurrentSession *uuid.UUID) error {
	return s.repo.RevokeAllUserSessions(ctx, userID, exceptCurrentSession)
}

// AddEmailParams holds parameters for adding an email address.
type AddEmailParams struct {
	UserID        uuid.UUID
	Email         string
	CreateMailbox bool
	IPAddress     string
	UserAgent     string
}

// AddEmail adds a new email address to a user account.
func (s *AuthService) AddEmail(ctx context.Context, params AddEmailParams) (*models.UserEmailAddress, error) {
	// Get user
	user, err := s.repo.GetUserByID(ctx, params.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	// Extract domain from email
	parts := strings.Split(params.Email, "@")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid email format")
	}
	localPart := parts[0]
	domainName := parts[1]

	// Look up domain
	domain, err := s.repo.GetDomainByName(ctx, domainName)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrDomainNotFound
		}
		return nil, fmt.Errorf("failed to look up domain: %w", err)
	}

	// Verify domain belongs to same organization
	if domain.OrganizationID != user.OrganizationID {
		return nil, ErrInvalidDomain
	}

	if !domain.IsVerified || !domain.IsActive {
		return nil, ErrDomainNotVerified
	}

	// Check if email already exists
	exists, err := s.repo.CheckEmailExists(ctx, params.Email)
	if err != nil {
		return nil, fmt.Errorf("failed to check email: %w", err)
	}
	if exists {
		return nil, ErrEmailExists
	}

	// Generate verification token
	verificationToken := generateSecureToken()

	now := time.Now()
	emailAddressID := uuid.New()

	// Create email address
	emailAddress := &models.UserEmailAddress{
		ID:           emailAddressID,
		UserID:       params.UserID,
		DomainID:     domain.ID,
		EmailAddress: strings.ToLower(params.Email),
		LocalPart:    localPart,
		IsPrimary:    false,
		IsVerified:   false,
		VerificationToken: sql.NullString{
			String: verificationToken,
			Valid:  true,
		},
		CreatedAt: now,
	}

	if err := s.repo.CreateEmailAddress(ctx, emailAddress); err != nil {
		if errors.Is(err, repository.ErrDuplicateEmail) {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("failed to create email address: %w", err)
	}

	// Create mailbox if requested
	if params.CreateMailbox {
		org, _ := s.repo.GetOrganizationByID(ctx, user.OrganizationID)
		mailbox := &models.Mailbox{
			ID:             uuid.New(),
			UserID:         params.UserID,
			EmailAddressID: emailAddressID,
			DomainEmail:    strings.ToLower(params.Email),
			DisplayName:    sql.NullString{String: user.DisplayName, Valid: true},
			QuotaBytes:     org.Settings.DefaultUserQuotaBytes,
			UsedBytes:      0,
			IsActive:       false, // Activated when email is verified
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		s.repo.CreateMailbox(ctx, mailbox)
	}

	// Record audit log
	s.recordAuditLog(ctx, user.OrganizationID, &user.ID, "email.added", "email_address", &emailAddressID, params.IPAddress, params.UserAgent, nil)

	// Send verification email
	if s.emailService != nil {
		if err := s.emailService.SendVerificationEmail(params.Email, user.DisplayName, verificationToken); err != nil {
			// Log error but don't fail the operation
			fmt.Printf("Failed to send verification email to %s: %v\n", params.Email, err)
		}
	}

	return emailAddress, nil
}

// VerifyEmail verifies an email address by token.
func (s *AuthService) VerifyEmail(ctx context.Context, verificationToken string) (*models.UserEmailAddress, error) {
	// Get email address by token
	email, err := s.repo.GetEmailAddressByToken(ctx, verificationToken)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidToken
		}
		return nil, fmt.Errorf("failed to get email: %w", err)
	}

	if email.IsVerified {
		return email, nil // Already verified
	}

	// Verify email
	if err := s.repo.VerifyEmailAddress(ctx, email.ID); err != nil {
		return nil, fmt.Errorf("failed to verify email: %w", err)
	}

	// Activate mailbox if exists
	mailbox, err := s.repo.GetMailboxByEmailAddressID(ctx, email.ID)
	if err == nil && mailbox != nil {
		// Mailbox exists, activate it
		// Note: In a full implementation, we'd have an UpdateMailbox method
	}

	// Get updated email
	email, _ = s.repo.GetUserEmailAddressByID(ctx, email.ID)

	// Get user for audit log
	user, _ := s.repo.GetUserByID(ctx, email.UserID)
	if user != nil {
		s.recordAuditLog(ctx, user.OrganizationID, &user.ID, "email.verified", "email_address", &email.ID, "", "", nil)
	}

	return email, nil
}

// DeleteEmail removes an email address from a user account.
func (s *AuthService) DeleteEmail(ctx context.Context, userID, emailID uuid.UUID, ipAddress, userAgent string) error {
	// Get email address
	email, err := s.repo.GetUserEmailAddressByID(ctx, emailID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrEmailNotFound
		}
		return fmt.Errorf("failed to get email: %w", err)
	}

	// Verify ownership
	if email.UserID != userID {
		return ErrPermissionDenied
	}

	// Cannot remove primary email
	if email.IsPrimary {
		return ErrCannotRemovePrimary
	}

	// Delete email
	if err := s.repo.DeleteEmailAddress(ctx, emailID); err != nil {
		return fmt.Errorf("failed to delete email: %w", err)
	}

	// Record audit log
	user, _ := s.repo.GetUserByID(ctx, userID)
	if user != nil {
		s.recordAuditLog(ctx, user.OrganizationID, &userID, "email.deleted", "email_address", &emailID, ipAddress, userAgent, nil)
	}

	return nil
}

// SetPrimaryEmail changes the primary email address.
func (s *AuthService) SetPrimaryEmail(ctx context.Context, userID, emailID uuid.UUID, ipAddress, userAgent string) error {
	// Get email address
	email, err := s.repo.GetUserEmailAddressByID(ctx, emailID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrEmailNotFound
		}
		return fmt.Errorf("failed to get email: %w", err)
	}

	// Verify ownership
	if email.UserID != userID {
		return ErrPermissionDenied
	}

	// Must be verified
	if !email.IsVerified {
		return ErrEmailNotVerified
	}

	// Set as primary
	if err := s.repo.SetPrimaryEmail(ctx, userID, emailID); err != nil {
		return fmt.Errorf("failed to set primary: %w", err)
	}

	// Record audit log
	user, _ := s.repo.GetUserByID(ctx, userID)
	if user != nil {
		s.recordAuditLog(ctx, user.OrganizationID, &userID, "email.primary_changed", "email_address", &emailID, ipAddress, userAgent, nil)
	}

	return nil
}

// GetUserWithContext retrieves a user with their email addresses and domain permissions.
func (s *AuthService) GetUserWithContext(ctx context.Context, userID uuid.UUID) (*models.UserResponse, error) {
	// Get user
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	// Get email addresses
	emails, err := s.repo.GetUserEmailAddresses(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get emails: %w", err)
	}

	// Get domain permissions
	perms, err := s.repo.GetUserDomainPermissions(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get permissions: %w", err)
	}

	// Get mailboxes to check which emails have mailboxes
	mailboxes, _ := s.repo.GetUserMailboxes(ctx, userID)
	mailboxByEmail := make(map[uuid.UUID]bool)
	for _, m := range mailboxes {
		mailboxByEmail[m.EmailAddressID] = true
	}

	// Build permission map
	permsByDomain := make(map[uuid.UUID]models.UserDomainPermission)
	for _, p := range perms {
		permsByDomain[p.DomainID] = p
	}

	// Get domains for the emails
	domainIDs := make(map[uuid.UUID]bool)
	for _, e := range emails {
		domainIDs[e.DomainID] = true
	}

	// Build email address responses
	var emailResponses []models.EmailAddressResponse
	for _, e := range emails {
		domain, _ := s.repo.GetDomainByID(ctx, e.DomainID)
		domainName := ""
		if domain != nil {
			domainName = domain.DomainName
		}
		emailResponses = append(emailResponses, models.EmailAddressResponse{
			ID:         e.ID,
			Email:      e.EmailAddress,
			DomainID:   e.DomainID,
			DomainName: domainName,
			IsPrimary:  e.IsPrimary,
			IsVerified: e.IsVerified,
			HasMailbox: mailboxByEmail[e.ID],
		})
	}

	// Build domain access responses
	var domainResponses []models.DomainAccessResponse
	for domainID := range domainIDs {
		domain, err := s.repo.GetDomainByID(ctx, domainID)
		if err != nil {
			continue
		}

		perm := permsByDomain[domainID]
		ssoConfig, _ := s.repo.GetSSOConfigByDomainID(ctx, domainID)

		domainResponses = append(domainResponses, models.DomainAccessResponse{
			ID:        domain.ID,
			Name:      domain.DomainName,
			IsPrimary: domain.IsPrimary,
			CanSend:   perm.CanSendAs,
			CanManage: perm.CanManage,
			HasSSO:    ssoConfig != nil && ssoConfig.IsEnabled,
		})
	}

	var avatarURL *string
	if user.AvatarURL.Valid {
		avatarURL = &user.AvatarURL.String
	}

	return &models.UserResponse{
		ID:             user.ID,
		OrganizationID: user.OrganizationID,
		DisplayName:    user.DisplayName,
		Role:           user.Role,
		Status:         user.Status,
		AvatarURL:      avatarURL,
		MFAEnabled:     user.MFAEnabled,
		EmailAddresses: emailResponses,
		Domains:        domainResponses,
		CreatedAt:      user.CreatedAt.Format(time.RFC3339),
	}, nil
}

// GetUserSessions retrieves all active sessions for a user.
func (s *AuthService) GetUserSessions(ctx context.Context, userID uuid.UUID, currentSessionID uuid.UUID) ([]models.SessionResponse, error) {
	sessions, err := s.repo.GetUserSessions(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get sessions: %w", err)
	}

	var responses []models.SessionResponse
	for _, session := range sessions {
		userAgent := ""
		if session.UserAgent.Valid {
			userAgent = session.UserAgent.String
		}
		ipAddress := ""
		if session.IPAddress.Valid {
			ipAddress = session.IPAddress.String
		}

		responses = append(responses, models.SessionResponse{
			ID:             session.ID,
			UserAgent:      userAgent,
			IPAddress:      ipAddress,
			LastActivityAt: session.LastActivityAt.Format(time.RFC3339),
			ExpiresAt:      session.ExpiresAt.Format(time.RFC3339),
			CreatedAt:      session.CreatedAt.Format(time.RFC3339),
			IsCurrent:      session.ID == currentSessionID,
		})
	}

	return responses, nil
}

// RevokeSession revokes a specific session.
func (s *AuthService) RevokeSession(ctx context.Context, userID, sessionID uuid.UUID, ipAddress, userAgent string) error {
	// Verify the session belongs to the user
	sessions, err := s.repo.GetUserSessions(ctx, userID)
	if err != nil {
		return fmt.Errorf("failed to get sessions: %w", err)
	}

	found := false
	for _, session := range sessions {
		if session.ID == sessionID {
			found = true
			break
		}
	}

	if !found {
		return ErrPermissionDenied
	}

	if err := s.repo.RevokeSession(ctx, sessionID); err != nil {
		return fmt.Errorf("failed to revoke session: %w", err)
	}

	// Record audit log
	user, _ := s.repo.GetUserByID(ctx, userID)
	if user != nil {
		s.recordAuditLog(ctx, user.OrganizationID, &userID, "session.revoked", "session", &sessionID, ipAddress, userAgent, nil)
	}

	return nil
}

// ============================================================
// HELPER METHODS
// ============================================================

func (s *AuthService) generateTokensForUser(ctx context.Context, user *models.User, primaryDomainID uuid.UUID, ipAddress, userAgent string) (*token.TokenPair, error) {
	// Get user's email addresses
	emails, err := s.repo.GetUserEmailAddresses(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get emails: %w", err)
	}

	// Get domain permissions
	perms, err := s.repo.GetUserDomainPermissions(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get permissions: %w", err)
	}

	// Get primary email
	var primaryEmail string
	for _, e := range emails {
		if e.IsPrimary {
			primaryEmail = e.EmailAddress
			break
		}
	}

	// Build domain list and roles
	domainIDs := make(map[uuid.UUID]bool)
	for _, e := range emails {
		domainIDs[e.DomainID] = true
	}

	var domains []uuid.UUID
	domainRoles := make(map[string]string)
	for domainID := range domainIDs {
		domains = append(domains, domainID)
		// Determine role for domain
		for _, p := range perms {
			if p.DomainID == domainID {
				if p.CanManage {
					domainRoles[domainID.String()] = "admin"
				} else {
					domainRoles[domainID.String()] = "member"
				}
				break
			}
		}
		if _, exists := domainRoles[domainID.String()]; !exists {
			domainRoles[domainID.String()] = "member"
		}
	}

	// Generate tokens
	tokenPair, err := s.tokenService.GenerateTokenPair(token.GenerateTokenParams{
		UserID:          user.ID,
		OrganizationID:  user.OrganizationID,
		PrimaryDomainID: primaryDomainID,
		Email:           primaryEmail,
		DisplayName:     user.DisplayName,
		Role:            user.Role,
		Domains:         domains,
		DomainRoles:     domainRoles,
		MFAVerified:     user.MFAEnabled,
	})
	if err != nil {
		return nil, err
	}

	// Create session
	session := &models.UserSession{
		ID:             tokenPair.SessionID,
		UserID:         user.ID,
		TokenHash:      token.HashToken(tokenPair.RefreshToken),
		UserAgent:      sql.NullString{String: userAgent, Valid: userAgent != ""},
		IPAddress:      sql.NullString{String: ipAddress, Valid: ipAddress != ""},
		LastActivityAt: time.Now(),
		ExpiresAt:      time.Now().Add(s.tokenService.GetRefreshTokenExpiry()),
		CreatedAt:      time.Now(),
	}

	if err := s.repo.CreateSession(ctx, session); err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	return tokenPair, nil
}

func (s *AuthService) validatePassword(password string, policy models.PasswordPolicy) error {
	if len(password) < policy.MinLength {
		return fmt.Errorf("%w: password must be at least %d characters", ErrInvalidPassword, policy.MinLength)
	}

	hasUpper := false
	hasLower := false
	hasNumber := false
	hasSpecial := false

	for _, c := range password {
		switch {
		case 'A' <= c && c <= 'Z':
			hasUpper = true
		case 'a' <= c && c <= 'z':
			hasLower = true
		case '0' <= c && c <= '9':
			hasNumber = true
		case strings.ContainsRune("!@#$%^&*()_+-=[]{}|;':\",./<>?", c):
			hasSpecial = true
		}
	}

	if policy.RequireUppercase && !hasUpper {
		return fmt.Errorf("%w: password must contain at least one uppercase letter", ErrInvalidPassword)
	}
	if policy.RequireLowercase && !hasLower {
		return fmt.Errorf("%w: password must contain at least one lowercase letter", ErrInvalidPassword)
	}
	if policy.RequireNumbers && !hasNumber {
		return fmt.Errorf("%w: password must contain at least one number", ErrInvalidPassword)
	}
	if policy.RequireSpecialChars && !hasSpecial {
		return fmt.Errorf("%w: password must contain at least one special character", ErrInvalidPassword)
	}

	return nil
}

func (s *AuthService) generateMFAPendingToken(userID uuid.UUID) string {
	// In a full implementation, this would generate a short-lived token
	// that can be used to complete MFA verification
	return base64.URLEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%d", userID.String(), time.Now().Unix())))
}

func (s *AuthService) verifyMFACode(user *models.User, code string) bool {
	// Verify TOTP code using the user's MFA secret
	if !user.MFASecret.Valid || user.MFASecret.String == "" {
		return false
	}

	// Validate the TOTP code
	// The totp.Validate function allows for time drift of +/- 1 period (30 seconds by default)
	valid := totp.Validate(code, user.MFASecret.String)
	return valid
}

func (s *AuthService) recordLoginAttempt(ctx context.Context, userID *uuid.UUID, email, ipAddress, userAgent string, success bool, failureReason, method string) {
	attempt := &models.LoginAttempt{
		ID:        uuid.New(),
		UserID:    userID,
		Email:     email,
		IPAddress: ipAddress,
		UserAgent: sql.NullString{String: userAgent, Valid: userAgent != ""},
		Success:   success,
		FailureReason: sql.NullString{
			String: failureReason,
			Valid:  failureReason != "",
		},
		Method:    method,
		CreatedAt: time.Now(),
	}
	s.repo.CreateLoginAttempt(ctx, attempt)
}

func (s *AuthService) recordAuditLog(ctx context.Context, orgID uuid.UUID, userID *uuid.UUID, action, resourceType string, resourceID *uuid.UUID, ipAddress, userAgent string, details interface{}) {
	var detailsJSON []byte
	if details != nil {
		detailsJSON, _ = json.MarshalIndent(details, "", "  ")
	}

	log := &models.AuditLog{
		ID:             uuid.New(),
		OrganizationID: orgID,
		UserID:         userID,
		Action:         action,
		ResourceType:   resourceType,
		ResourceID:     resourceID,
		Details:        detailsJSON,
		IPAddress:      sql.NullString{String: ipAddress, Valid: ipAddress != ""},
		UserAgent:      sql.NullString{String: userAgent, Valid: userAgent != ""},
		CreatedAt:      time.Now(),
	}
	s.repo.CreateAuditLog(ctx, log)
}

func generateSecureToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}
