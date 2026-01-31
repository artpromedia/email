// Package testutil provides testing utilities for the auth service
package testutil

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/repository"
	"github.com/artpromedia/email/services/auth/internal/token"
	"github.com/google/uuid"
)

// MockRepository implements repository.Repository for testing
type MockRepository struct {
	users          map[uuid.UUID]*models.User
	emailAddresses map[uuid.UUID]*models.UserEmailAddress
	emailsByEmail  map[string]*models.UserEmailAddress
	organizations  map[uuid.UUID]*models.Organization
	domains        map[uuid.UUID]*models.Domain
	domainsByName  map[string]*models.Domain
	sessions       map[uuid.UUID]*models.UserSession
	ssoConfigs     map[uuid.UUID]*models.SSOConfig
	mailboxes      map[uuid.UUID]*models.Mailbox
	permissions    map[uuid.UUID][]models.UserDomainPermission
	loginAttempts  []*models.LoginAttempt
	auditLogs      []*models.AuditLog
	mu             sync.RWMutex

	// Error injection for testing error paths
	CreateUserError             error
	GetUserByEmailError         error
	GetUserByIDError            error
	UpdateUserLoginFailureError error
}

// NewMockRepository creates a new mock repository
func NewMockRepository() *MockRepository {
	return &MockRepository{
		users:          make(map[uuid.UUID]*models.User),
		emailAddresses: make(map[uuid.UUID]*models.UserEmailAddress),
		emailsByEmail:  make(map[string]*models.UserEmailAddress),
		organizations:  make(map[uuid.UUID]*models.Organization),
		domains:        make(map[uuid.UUID]*models.Domain),
		domainsByName:  make(map[string]*models.Domain),
		sessions:       make(map[uuid.UUID]*models.UserSession),
		ssoConfigs:     make(map[uuid.UUID]*models.SSOConfig),
		mailboxes:      make(map[uuid.UUID]*models.Mailbox),
		permissions:    make(map[uuid.UUID][]models.UserDomainPermission),
		loginAttempts:  []*models.LoginAttempt{},
		auditLogs:      []*models.AuditLog{},
	}
}

// AddUser adds a user to the mock repository
func (m *MockRepository) AddUser(user *models.User) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.users[user.ID] = user
}

// AddOrganization adds an organization to the mock repository
func (m *MockRepository) AddOrganization(org *models.Organization) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.organizations[org.ID] = org
}

// AddDomain adds a domain to the mock repository
func (m *MockRepository) AddDomain(domain *models.Domain) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.domains[domain.ID] = domain
	m.domainsByName[domain.DomainName] = domain
}

// AddEmailAddress adds an email address to the mock repository
func (m *MockRepository) AddEmailAddress(email *models.UserEmailAddress) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emailAddresses[email.ID] = email
	m.emailsByEmail[email.EmailAddress] = email
}

// AddSession adds a session to the mock repository
func (m *MockRepository) AddSession(session *models.UserSession) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[session.ID] = session
}

// AddSSOConfig adds an SSO config to the mock repository
func (m *MockRepository) AddSSOConfig(config *models.SSOConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ssoConfigs[config.DomainID] = config
}

// GetDomainByName returns a domain by name
func (m *MockRepository) GetDomainByName(ctx context.Context, name string) (*models.Domain, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if domain, ok := m.domainsByName[name]; ok {
		return domain, nil
	}
	return nil, repository.ErrNotFound
}

// GetDomainByID returns a domain by ID
func (m *MockRepository) GetDomainByID(ctx context.Context, id uuid.UUID) (*models.Domain, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if domain, ok := m.domains[id]; ok {
		return domain, nil
	}
	return nil, repository.ErrNotFound
}

// GetOrganizationByID returns an organization by ID
func (m *MockRepository) GetOrganizationByID(ctx context.Context, id uuid.UUID) (*models.Organization, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if org, ok := m.organizations[id]; ok {
		return org, nil
	}
	return nil, repository.ErrNotFound
}

// CheckEmailExists checks if an email exists
func (m *MockRepository) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, exists := m.emailsByEmail[email]
	return exists, nil
}

// GetUserByEmail returns a user by email
func (m *MockRepository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	if m.GetUserByEmailError != nil {
		return nil, m.GetUserByEmailError
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	if emailAddr, ok := m.emailsByEmail[email]; ok {
		if user, ok := m.users[emailAddr.UserID]; ok {
			return user, nil
		}
	}
	return nil, repository.ErrNotFound
}

// GetUserByID returns a user by ID
func (m *MockRepository) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	if m.GetUserByIDError != nil {
		return nil, m.GetUserByIDError
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	if user, ok := m.users[id]; ok {
		return user, nil
	}
	return nil, repository.ErrNotFound
}

// CreateUser creates a user with email and mailbox
func (m *MockRepository) CreateUser(ctx context.Context, user *models.User, email *models.UserEmailAddress, mailbox *models.Mailbox) error {
	if m.CreateUserError != nil {
		return m.CreateUserError
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.users[user.ID] = user
	m.emailAddresses[email.ID] = email
	m.emailsByEmail[email.EmailAddress] = email
	if mailbox != nil {
		m.mailboxes[mailbox.ID] = mailbox
	}
	return nil
}

// UpdateUserLoginFailure updates failed login count
func (m *MockRepository) UpdateUserLoginFailure(ctx context.Context, userID uuid.UUID, lockoutDuration time.Duration, maxAttempts int) error {
	if m.UpdateUserLoginFailureError != nil {
		return m.UpdateUserLoginFailureError
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if user, ok := m.users[userID]; ok {
		user.FailedLoginAttempts++
		if user.FailedLoginAttempts >= maxAttempts {
			lockUntil := time.Now().Add(lockoutDuration)
			user.LockedUntil = sql.NullTime{Time: lockUntil, Valid: true}
		}
	}
	return nil
}

// UpdateUserLoginSuccess updates successful login
func (m *MockRepository) UpdateUserLoginSuccess(ctx context.Context, userID uuid.UUID, ipAddress string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if user, ok := m.users[userID]; ok {
		user.FailedLoginAttempts = 0
		user.LockedUntil = sql.NullTime{}
		now := time.Now()
		user.LastLoginAt = sql.NullTime{Time: now, Valid: true}
		user.LastLoginIP = sql.NullString{String: ipAddress, Valid: true}
	}
	return nil
}

// GetSSOConfigByDomainID returns SSO config for a domain
func (m *MockRepository) GetSSOConfigByDomainID(ctx context.Context, domainID uuid.UUID) (*models.SSOConfig, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if config, ok := m.ssoConfigs[domainID]; ok {
		return config, nil
	}
	return nil, repository.ErrNotFound
}

// GetPrimaryEmailAddress returns the primary email for a user
func (m *MockRepository) GetPrimaryEmailAddress(ctx context.Context, userID uuid.UUID) (*models.UserEmailAddress, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, email := range m.emailAddresses {
		if email.UserID == userID && email.IsPrimary {
			return email, nil
		}
	}
	return nil, repository.ErrNotFound
}

// GetUserEmailAddresses returns all email addresses for a user
func (m *MockRepository) GetUserEmailAddresses(ctx context.Context, userID uuid.UUID) ([]models.UserEmailAddress, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var result []models.UserEmailAddress
	for _, email := range m.emailAddresses {
		if email.UserID == userID {
			result = append(result, *email)
		}
	}
	return result, nil
}

// GetUserDomainPermissions returns domain permissions for a user
func (m *MockRepository) GetUserDomainPermissions(ctx context.Context, userID uuid.UUID) ([]models.UserDomainPermission, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if perms, ok := m.permissions[userID]; ok {
		return perms, nil
	}
	return []models.UserDomainPermission{}, nil
}

// CreateSession creates a new session
func (m *MockRepository) CreateSession(ctx context.Context, session *models.UserSession) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[session.ID] = session
	return nil
}

// GetSessionByTokenHash returns a session by token hash
func (m *MockRepository) GetSessionByTokenHash(ctx context.Context, tokenHash string) (*models.UserSession, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, session := range m.sessions {
		if session.TokenHash == tokenHash {
			return session, nil
		}
	}
	return nil, repository.ErrNotFound
}

// GetUserSessions returns all sessions for a user
func (m *MockRepository) GetUserSessions(ctx context.Context, userID uuid.UUID) ([]models.UserSession, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var result []models.UserSession
	for _, session := range m.sessions {
		if session.UserID == userID {
			result = append(result, *session)
		}
	}
	return result, nil
}

// RevokeSession revokes a session
func (m *MockRepository) RevokeSession(ctx context.Context, sessionID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, sessionID)
	return nil
}

// RevokeAllUserSessions revokes all sessions for a user
func (m *MockRepository) RevokeAllUserSessions(ctx context.Context, userID uuid.UUID, exceptCurrentSession *uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, session := range m.sessions {
		if session.UserID == userID {
			if exceptCurrentSession != nil && id == *exceptCurrentSession {
				continue
			}
			delete(m.sessions, id)
		}
	}
	return nil
}

// UpdateSessionActivity updates session last activity
func (m *MockRepository) UpdateSessionActivity(ctx context.Context, sessionID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if session, ok := m.sessions[sessionID]; ok {
		session.LastActivityAt = time.Now()
	}
	return nil
}

// CreateLoginAttempt records a login attempt
func (m *MockRepository) CreateLoginAttempt(ctx context.Context, attempt *models.LoginAttempt) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loginAttempts = append(m.loginAttempts, attempt)
	return nil
}

// CreateAuditLog creates an audit log entry
func (m *MockRepository) CreateAuditLog(ctx context.Context, log *models.AuditLog) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.auditLogs = append(m.auditLogs, log)
	return nil
}

// CreateEmailAddress creates an email address
func (m *MockRepository) CreateEmailAddress(ctx context.Context, email *models.UserEmailAddress) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.emailsByEmail[email.EmailAddress]; exists {
		return repository.ErrDuplicateEmail
	}
	m.emailAddresses[email.ID] = email
	m.emailsByEmail[email.EmailAddress] = email
	return nil
}

// GetEmailAddressByToken returns email address by verification token
func (m *MockRepository) GetEmailAddressByToken(ctx context.Context, token string) (*models.UserEmailAddress, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, email := range m.emailAddresses {
		if email.VerificationToken.Valid && email.VerificationToken.String == token {
			return email, nil
		}
	}
	return nil, repository.ErrNotFound
}

// VerifyEmailAddress marks an email as verified
func (m *MockRepository) VerifyEmailAddress(ctx context.Context, emailID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if email, ok := m.emailAddresses[emailID]; ok {
		email.IsVerified = true
		email.VerificationToken = sql.NullString{}
	}
	return nil
}

// GetUserEmailAddressByID returns an email address by ID
func (m *MockRepository) GetUserEmailAddressByID(ctx context.Context, id uuid.UUID) (*models.UserEmailAddress, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if email, ok := m.emailAddresses[id]; ok {
		return email, nil
	}
	return nil, repository.ErrNotFound
}

// DeleteEmailAddress deletes an email address
func (m *MockRepository) DeleteEmailAddress(ctx context.Context, emailID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if email, ok := m.emailAddresses[emailID]; ok {
		delete(m.emailsByEmail, email.EmailAddress)
		delete(m.emailAddresses, emailID)
	}
	return nil
}

// SetPrimaryEmail sets an email as primary
func (m *MockRepository) SetPrimaryEmail(ctx context.Context, userID, emailID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, email := range m.emailAddresses {
		if email.UserID == userID {
			email.IsPrimary = email.ID == emailID
		}
	}
	return nil
}

// GetMailboxByEmailAddressID returns mailbox by email address ID
func (m *MockRepository) GetMailboxByEmailAddressID(ctx context.Context, emailAddressID uuid.UUID) (*models.Mailbox, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, mailbox := range m.mailboxes {
		if mailbox.EmailAddressID == emailAddressID {
			return mailbox, nil
		}
	}
	return nil, repository.ErrNotFound
}

// GetUserMailboxes returns all mailboxes for a user
func (m *MockRepository) GetUserMailboxes(ctx context.Context, userID uuid.UUID) ([]models.Mailbox, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var result []models.Mailbox
	for _, mailbox := range m.mailboxes {
		if mailbox.UserID == userID {
			result = append(result, *mailbox)
		}
	}
	return result, nil
}

// CreateMailbox creates a mailbox
func (m *MockRepository) CreateMailbox(ctx context.Context, mailbox *models.Mailbox) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mailboxes[mailbox.ID] = mailbox
	return nil
}

// GetLoginAttempts returns recorded login attempts (for testing)
func (m *MockRepository) GetLoginAttempts() []*models.LoginAttempt {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.loginAttempts
}

// GetAuditLogs returns recorded audit logs (for testing)
func (m *MockRepository) GetAuditLogs() []*models.AuditLog {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.auditLogs
}

// MockTokenService implements token.Service for testing
type MockTokenService struct {
	ValidAccessTokens  map[string]*token.Claims
	ValidRefreshTokens map[string]*token.RefreshClaims
	GenerateError      error
	ValidateError      error
	RefreshExpiry      time.Duration
}

// NewMockTokenService creates a new mock token service
func NewMockTokenService() *MockTokenService {
	return &MockTokenService{
		ValidAccessTokens:  make(map[string]*token.Claims),
		ValidRefreshTokens: make(map[string]*token.RefreshClaims),
		RefreshExpiry:      24 * time.Hour,
	}
}

// GenerateTokenPair generates a mock token pair
func (m *MockTokenService) GenerateTokenPair(params token.GenerateTokenParams) (*token.TokenPair, error) {
	if m.GenerateError != nil {
		return nil, m.GenerateError
	}

	sessionID := uuid.New()
	accessToken := "test-access-" + uuid.New().String()
	refreshToken := "test-refresh-" + uuid.New().String()

	m.ValidAccessTokens[accessToken] = &token.Claims{
		UserID:         params.UserID,
		OrganizationID: params.OrganizationID,
		Email:          params.Email,
		Role:           params.Role,
	}

	m.ValidRefreshTokens[refreshToken] = &token.RefreshClaims{
		UserID:    params.UserID,
		SessionID: sessionID,
	}

	return &token.TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		SessionID:    sessionID,
		ExpiresIn:    3600,
	}, nil
}

// ValidateAccessToken validates an access token
func (m *MockTokenService) ValidateAccessToken(tokenStr string) (*token.Claims, error) {
	if m.ValidateError != nil {
		return nil, m.ValidateError
	}
	if claims, ok := m.ValidAccessTokens[tokenStr]; ok {
		return claims, nil
	}
	return nil, token.ErrInvalidToken
}

// ValidateRefreshToken validates a refresh token
func (m *MockTokenService) ValidateRefreshToken(tokenStr string) (*token.RefreshClaims, error) {
	if m.ValidateError != nil {
		return nil, m.ValidateError
	}
	if claims, ok := m.ValidRefreshTokens[tokenStr]; ok {
		return claims, nil
	}
	return nil, token.ErrInvalidToken
}

// GetRefreshTokenExpiry returns the refresh token expiry
func (m *MockTokenService) GetRefreshTokenExpiry() time.Duration {
	return m.RefreshExpiry
}

// TestFixtures provides common test data
type TestFixtures struct {
	Organization *models.Organization
	Domain       *models.Domain
	User         *models.User
	EmailAddress *models.UserEmailAddress
}

// NewTestFixtures creates standard test fixtures
func NewTestFixtures() *TestFixtures {
	orgID := uuid.New()
	domainID := uuid.New()
	userID := uuid.New()
	emailID := uuid.New()
	now := time.Now()

	return &TestFixtures{
		Organization: &models.Organization{
			ID:       orgID,
			Name:     "Test Organization",
			Slug:     "test-org",
			IsActive: true,
			Settings: models.OrganizationSettings{
				DefaultUserQuotaBytes: 10737418240,
				PasswordPolicy: models.PasswordPolicy{
					MinLength:            8,
					RequireUppercase:     true,
					RequireLowercase:     true,
					RequireNumbers:       true,
					RequireSpecialChars:  false,
				},
			},
			CreatedAt: now,
			UpdatedAt: now,
		},
		Domain: &models.Domain{
			ID:             domainID,
			OrganizationID: orgID,
			DomainName:     "example.com",
			IsVerified:     true,
			IsActive:       true,
			IsPrimary:      true,
			CreatedAt:      now,
		},
		User: &models.User{
			ID:             userID,
			OrganizationID: orgID,
			DisplayName:    "Test User",
			PasswordHash:   sql.NullString{String: "$2a$10$hashedpassword", Valid: true},
			Role:           "member",
			Status:         "active",
			MFAEnabled:     false,
			EmailVerified:  true,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		EmailAddress: &models.UserEmailAddress{
			ID:           emailID,
			UserID:       userID,
			DomainID:     domainID,
			EmailAddress: "testuser@example.com",
			LocalPart:    "testuser",
			IsPrimary:    true,
			IsVerified:   true,
			CreatedAt:    now,
		},
	}
}

// SetupMockRepo populates a mock repository with test fixtures
func (f *TestFixtures) SetupMockRepo(repo *MockRepository) {
	repo.AddOrganization(f.Organization)
	repo.AddDomain(f.Domain)
	repo.AddUser(f.User)
	repo.AddEmailAddress(f.EmailAddress)
}
