// Package service provides SSO-related business logic.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/repository"
	"github.com/artpromedia/email/services/auth/internal/token"
	"github.com/google/uuid"
)

// SSOService provides SSO operations.
type SSOService struct {
	repo         *repository.Repository
	tokenService *token.Service
	authService  *AuthService
	config       *config.Config
}

// NewSSOService creates a new SSOService.
func NewSSOService(repo *repository.Repository, tokenService *token.Service, authService *AuthService, cfg *config.Config) *SSOService {
	return &SSOService{
		repo:         repo,
		tokenService: tokenService,
		authService:  authService,
		config:       cfg,
	}
}

// DiscoverSSO checks if a domain has SSO configured.
func (s *SSOService) DiscoverSSO(ctx context.Context, email string) (*models.SSODiscoverResponse, error) {
	// Extract domain from email
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return &models.SSODiscoverResponse{HasSSO: false}, nil
	}
	domainName := parts[1]

	// Look up domain
	domain, err := s.repo.GetDomainByName(ctx, domainName)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return &models.SSODiscoverResponse{HasSSO: false}, nil
		}
		return nil, fmt.Errorf("failed to look up domain: %w", err)
	}

	// Check SSO config
	ssoConfig, err := s.repo.GetSSOConfigByDomainID(ctx, domain.ID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return &models.SSODiscoverResponse{
				HasSSO:     false,
				DomainID:   &domain.ID,
				DomainName: domain.DomainName,
			}, nil
		}
		return nil, fmt.Errorf("failed to get SSO config: %w", err)
	}

	if !ssoConfig.IsEnabled {
		return &models.SSODiscoverResponse{
			HasSSO:     false,
			DomainID:   &domain.ID,
			DomainName: domain.DomainName,
		}, nil
	}

	// Build SSO init URL
	ssoInitURL := fmt.Sprintf("%s/api/auth/sso/%s/login", s.config.SSO.BaseURL, domain.ID.String())

	return &models.SSODiscoverResponse{
		HasSSO:     true,
		Provider:   ssoConfig.Provider,
		EnforceSSO: ssoConfig.EnforceSSO,
		SSOInitURL: ssoInitURL,
		DomainID:   &domain.ID,
		DomainName: domain.DomainName,
	}, nil
}

// InitiateSSO starts the SSO flow for a domain.
func (s *SSOService) InitiateSSO(ctx context.Context, domainID uuid.UUID, redirectURL string) (string, error) {
	// Get domain
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return "", fmt.Errorf("failed to get domain: %w", err)
	}

	// Get SSO config
	ssoConfig, err := s.repo.GetSSOConfigByDomainID(ctx, domainID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return "", errors.New("SSO not configured for this domain")
		}
		return "", fmt.Errorf("failed to get SSO config: %w", err)
	}

	if !ssoConfig.IsEnabled {
		return "", errors.New("SSO is disabled for this domain")
	}

	// Generate state parameter for CSRF protection
	state := generateSecureToken()

	// Store state in Redis or session store
	// TODO: Implement state storage

	switch ssoConfig.Provider {
	case "saml":
		return s.initiateSAMLLogin(domain, ssoConfig, state, redirectURL)
	case "oidc":
		return s.initiateOIDCLogin(domain, ssoConfig, state, redirectURL)
	default:
		return "", fmt.Errorf("unsupported SSO provider: %s", ssoConfig.Provider)
	}
}

// HandleSAMLCallback processes SAML assertion callback.
func (s *SSOService) HandleSAMLCallback(ctx context.Context, domainID uuid.UUID, samlResponse string, ipAddress, userAgent string) (*token.TokenPair, error) {
	// Get domain
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get domain: %w", err)
	}

	// Get SSO config
	ssoConfig, err := s.repo.GetSSOConfigByDomainID(ctx, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get SSO config: %w", err)
	}

	if ssoConfig.Provider != "saml" || ssoConfig.SAMLConfig == nil {
		return nil, errors.New("SAML not configured for this domain")
	}

	// Parse and validate SAML response
	// In production, use a proper SAML library like crewjam/saml
	attributes, err := s.parseSAMLResponse(ssoConfig.SAMLConfig, samlResponse)
	if err != nil {
		return nil, fmt.Errorf("failed to parse SAML response: %w", err)
	}

	// Extract user info from attributes
	email := s.extractAttribute(attributes, ssoConfig.SAMLConfig.AttributeMapping, "email")
	nameID := s.extractAttribute(attributes, ssoConfig.SAMLConfig.AttributeMapping, "nameID")
	displayName := s.extractAttribute(attributes, ssoConfig.SAMLConfig.AttributeMapping, "displayName")

	if email == "" && nameID != "" {
		email = nameID // Use nameID as email if email not provided
	}

	if email == "" {
		return nil, errors.New("email not found in SAML response")
	}

	// Process SSO login
	return s.processSSOLogin(ctx, domain, ssoConfig, nameID, email, displayName, attributes, ipAddress, userAgent)
}

// HandleOIDCCallback processes OIDC authorization code callback.
func (s *SSOService) HandleOIDCCallback(ctx context.Context, domainID uuid.UUID, code, state string, ipAddress, userAgent string) (*token.TokenPair, error) {
	// Get domain
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get domain: %w", err)
	}

	// Get SSO config
	ssoConfig, err := s.repo.GetSSOConfigByDomainID(ctx, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get SSO config: %w", err)
	}

	if ssoConfig.Provider != "oidc" || ssoConfig.OIDCConfig == nil {
		return nil, errors.New("OIDC not configured for this domain")
	}

	// TODO: Verify state parameter

	// Exchange code for tokens
	userInfo, err := s.exchangeOIDCCode(ssoConfig.OIDCConfig, code)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange OIDC code: %w", err)
	}

	// Extract user info
	sub := userInfo["sub"].(string)
	email := s.extractOIDCAttribute(userInfo, ssoConfig.OIDCConfig.AttributeMapping, "email")
	displayName := s.extractOIDCAttribute(userInfo, ssoConfig.OIDCConfig.AttributeMapping, "name")

	if email == "" {
		return nil, errors.New("email not found in OIDC response")
	}

	// Convert userInfo to JSON for storage
	rawAttrs, _ := json.Marshal(userInfo)

	// Process SSO login
	return s.processSSOLogin(ctx, domain, ssoConfig, sub, email, displayName, rawAttrs, ipAddress, userAgent)
}

// ConfigureSSO configures SSO for a domain.
func (s *SSOService) ConfigureSSO(ctx context.Context, domainID uuid.UUID, req *models.SSOConfigRequest, userID uuid.UUID) (*models.SSOConfig, error) {
	// Verify domain exists
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get domain: %w", err)
	}

	// Verify user has permission to manage domain
	perm, err := s.repo.GetUserDomainPermission(ctx, userID, domainID)
	if err != nil {
		return nil, ErrPermissionDenied
	}
	if !perm.CanManage {
		return nil, ErrPermissionDenied
	}

	now := time.Now()

	// Check if config already exists
	existingConfig, err := s.repo.GetSSOConfigByDomainID(ctx, domainID)
	var configID uuid.UUID
	if err == nil && existingConfig != nil {
		configID = existingConfig.ID
	} else {
		configID = uuid.New()
	}

	config := &models.SSOConfig{
		ID:                 configID,
		DomainID:           domainID,
		Provider:           req.Provider,
		IsEnabled:          true,
		EnforceSSO:         req.EnforceSSO,
		AutoProvisionUsers: req.AutoProvisionUsers,
		DefaultRole:        req.DefaultRole,
		SAMLConfig:         req.SAMLConfig,
		OIDCConfig:         req.OIDCConfig,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if config.DefaultRole == "" {
		config.DefaultRole = "member"
	}

	if err := s.repo.UpsertSSOConfig(ctx, config); err != nil {
		return nil, fmt.Errorf("failed to save SSO config: %w", err)
	}

	// Get user for audit log
	user, _ := s.repo.GetUserByID(ctx, userID)
	if user != nil {
		s.authService.recordAuditLog(ctx, domain.OrganizationID, &userID, "sso.configured", "domain", &domainID, "", "", map[string]string{
			"provider": req.Provider,
		})
	}

	return config, nil
}

// GetSSOConfig retrieves SSO configuration for a domain.
func (s *SSOService) GetSSOConfig(ctx context.Context, domainID uuid.UUID) (*models.SSOConfigResponse, error) {
	config, err := s.repo.GetSSOConfigByDomainID(ctx, domainID)
	if err != nil {
		return nil, err
	}

	response := &models.SSOConfigResponse{
		ID:                 config.ID,
		DomainID:           config.DomainID,
		Provider:           config.Provider,
		IsEnabled:          config.IsEnabled,
		EnforceSSO:         config.EnforceSSO,
		AutoProvisionUsers: config.AutoProvisionUsers,
		DefaultRole:        config.DefaultRole,
		SAMLConfig:         config.SAMLConfig,
		CreatedAt:          config.CreatedAt.Format(time.RFC3339),
		UpdatedAt:          config.UpdatedAt.Format(time.RFC3339),
	}

	// Redact OIDC client secret
	if config.OIDCConfig != nil {
		response.OIDCConfig = &models.OIDCConfigResponse{
			Issuer:           config.OIDCConfig.Issuer,
			ClientID:         config.OIDCConfig.ClientID,
			HasClientSecret:  config.OIDCConfig.ClientSecret != "",
			Scopes:           config.OIDCConfig.Scopes,
			AuthorizationURL: config.OIDCConfig.AuthorizationURL,
			TokenURL:         config.OIDCConfig.TokenURL,
			UserInfoURL:      config.OIDCConfig.UserInfoURL,
			AttributeMapping: config.OIDCConfig.AttributeMapping,
		}
	}

	return response, nil
}

// DeleteSSOConfig removes SSO configuration for a domain.
func (s *SSOService) DeleteSSOConfig(ctx context.Context, domainID, userID uuid.UUID) error {
	// Verify user has permission
	perm, err := s.repo.GetUserDomainPermission(ctx, userID, domainID)
	if err != nil {
		return ErrPermissionDenied
	}
	if !perm.CanManage {
		return ErrPermissionDenied
	}

	// Get existing config
	config, err := s.repo.GetSSOConfigByDomainID(ctx, domainID)
	if err != nil {
		return err
	}

	// Disable SSO config (we don't delete, just disable)
	config.IsEnabled = false
	config.EnforceSSO = false
	config.UpdatedAt = time.Now()

	if err := s.repo.UpsertSSOConfig(ctx, config); err != nil {
		return fmt.Errorf("failed to disable SSO config: %w", err)
	}

	return nil
}

// ============================================================
// HELPER METHODS
// ============================================================

func (s *SSOService) processSSOLogin(ctx context.Context, domain *models.Domain, ssoConfig *models.SSOConfig, providerUserID, email, displayName string, rawAttrs interface{}, ipAddress, userAgent string) (*token.TokenPair, error) {
	// Check if SSO identity exists
	identity, err := s.repo.GetSSOIdentity(ctx, domain.ID, providerUserID)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, fmt.Errorf("failed to check SSO identity: %w", err)
	}

	var user *models.User

	if identity != nil {
		// Existing SSO identity - get user
		user, err = s.repo.GetUserByID(ctx, identity.UserID)
		if err != nil {
			return nil, fmt.Errorf("failed to get user: %w", err)
		}

		// Update SSO identity
		var rawJSON json.RawMessage
		switch v := rawAttrs.(type) {
		case []byte:
			rawJSON = v
		case json.RawMessage:
			rawJSON = v
		default:
			rawJSON, _ = json.Marshal(v)
		}
		s.repo.UpdateSSOIdentityLogin(ctx, identity.ID, rawJSON)
	} else {
		// Check if user exists by email
		user, err = s.repo.GetUserByEmail(ctx, email)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, fmt.Errorf("failed to check user: %w", err)
		}

		if user != nil {
			// Link SSO identity to existing user
			identity = &models.SSOIdentity{
				ID:             uuid.New(),
				UserID:         user.ID,
				DomainID:       domain.ID,
				Provider:       ssoConfig.Provider,
				ProviderUserID: providerUserID,
				Email:          email,
				CreatedAt:      time.Now(),
				UpdatedAt:      time.Now(),
			}
			switch v := rawAttrs.(type) {
			case []byte:
				identity.RawAttributes = v
			case json.RawMessage:
				identity.RawAttributes = v
			default:
				identity.RawAttributes, _ = json.Marshal(v)
			}

			if err := s.repo.CreateSSOIdentity(ctx, identity); err != nil {
				return nil, fmt.Errorf("failed to create SSO identity: %w", err)
			}
		} else if ssoConfig.AutoProvisionUsers {
			// Auto-provision new user
			user, err = s.provisionSSOUser(ctx, domain, ssoConfig, providerUserID, email, displayName, rawAttrs)
			if err != nil {
				return nil, fmt.Errorf("failed to provision user: %w", err)
			}
		} else {
			return nil, errors.New("user not found and auto-provisioning is disabled")
		}
	}

	// Check user status
	if user.Status != "active" {
		return nil, ErrAccountDisabled
	}

	// Update login time
	s.repo.UpdateUserLoginSuccess(ctx, user.ID, ipAddress)

	// Generate tokens
	primaryEmail, _ := s.repo.GetPrimaryEmailAddress(ctx, user.ID)
	primaryDomainID := domain.ID
	if primaryEmail != nil {
		primaryDomainID = primaryEmail.DomainID
	}

	tokenPair, err := s.generateTokensForSSOUser(ctx, user, primaryDomainID, ipAddress, userAgent)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Record login
	s.authService.recordLoginAttempt(ctx, &user.ID, email, ipAddress, userAgent, true, "", "sso_"+ssoConfig.Provider)

	// Get org for audit log
	org, _ := s.repo.GetOrganizationByID(ctx, domain.OrganizationID)
	if org != nil {
		s.authService.recordAuditLog(ctx, org.ID, &user.ID, "user.sso_login", "session", nil, ipAddress, userAgent, map[string]string{
			"provider": ssoConfig.Provider,
		})
	}

	return tokenPair, nil
}

func (s *SSOService) provisionSSOUser(ctx context.Context, domain *models.Domain, ssoConfig *models.SSOConfig, providerUserID, email, displayName string, rawAttrs interface{}) (*models.User, error) {
	// Extract local part from email
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid email format")
	}
	localPart := parts[0]

	// Get organization for quota
	org, err := s.repo.GetOrganizationByID(ctx, domain.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get organization: %w", err)
	}

	now := time.Now()
	userID := uuid.New()
	emailAddressID := uuid.New()
	mailboxID := uuid.New()

	// Create user (no password - SSO only)
	user := &models.User{
		ID:             userID,
		OrganizationID: org.ID,
		ExternalID:     sql.NullString{String: providerUserID, Valid: true},
		DisplayName:    displayName,
		Role:           ssoConfig.DefaultRole,
		Status:         "active",
		Timezone:       "UTC",
		Locale:         "en-US",
		EmailVerified:  true, // SSO emails are considered verified
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	// Create email address
	emailAddress := &models.UserEmailAddress{
		ID:           emailAddressID,
		UserID:       userID,
		DomainID:     domain.ID,
		EmailAddress: strings.ToLower(email),
		LocalPart:    localPart,
		IsPrimary:    true,
		IsVerified:   true,
		VerifiedAt:   sql.NullTime{Time: now, Valid: true},
		CreatedAt:    now,
	}

	// Create mailbox
	mailbox := &models.Mailbox{
		ID:             mailboxID,
		UserID:         userID,
		EmailAddressID: emailAddressID,
		DomainEmail:    strings.ToLower(email),
		DisplayName:    sql.NullString{String: displayName, Valid: true},
		QuotaBytes:     org.Settings.DefaultUserQuotaBytes,
		UsedBytes:      0,
		IsActive:       true,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	// Create user with email and mailbox
	if err := s.repo.CreateUser(ctx, user, emailAddress, mailbox); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Create SSO identity
	identity := &models.SSOIdentity{
		ID:             uuid.New(),
		UserID:         userID,
		DomainID:       domain.ID,
		Provider:       ssoConfig.Provider,
		ProviderUserID: providerUserID,
		Email:          email,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	switch v := rawAttrs.(type) {
	case []byte:
		identity.RawAttributes = v
	case json.RawMessage:
		identity.RawAttributes = v
	default:
		identity.RawAttributes, _ = json.Marshal(v)
	}

	if err := s.repo.CreateSSOIdentity(ctx, identity); err != nil {
		// User was created, log warning but don't fail
		// In production, you'd want to handle this more gracefully
	}

	return user, nil
}

func (s *SSOService) generateTokensForSSOUser(ctx context.Context, user *models.User, primaryDomainID uuid.UUID, ipAddress, userAgent string) (*token.TokenPair, error) {
	// Get user's email addresses
	emails, _ := s.repo.GetUserEmailAddresses(ctx, user.ID)

	// Get domain permissions
	perms, _ := s.repo.GetUserDomainPermissions(ctx, user.ID)

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
		MFAVerified:     true, // SSO login is considered MFA verified
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

func (s *SSOService) initiateSAMLLogin(domain *models.Domain, ssoConfig *models.SSOConfig, state, redirectURL string) (string, error) {
	if ssoConfig.SAMLConfig == nil {
		return "", errors.New("SAML configuration is missing")
	}

	// In production, use crewjam/saml library
	// This is a simplified example that returns the IdP SSO URL
	ssoURL := ssoConfig.SAMLConfig.IDPSSOURL
	if ssoURL == "" {
		return "", errors.New("IdP SSO URL not configured")
	}

	// Build SAML AuthnRequest URL
	// In production, this would include a properly signed AuthnRequest
	callbackURL := fmt.Sprintf("%s/api/auth/sso/%s/saml/callback", s.config.SSO.BaseURL, domain.ID.String())
	authURL := fmt.Sprintf("%s?SAMLRequest=...&RelayState=%s", ssoURL, state)

	// Note: In production, generate proper SAML AuthnRequest
	_ = callbackURL

	return authURL, nil
}

func (s *SSOService) initiateOIDCLogin(domain *models.Domain, ssoConfig *models.SSOConfig, state, redirectURL string) (string, error) {
	if ssoConfig.OIDCConfig == nil {
		return "", errors.New("OIDC configuration is missing")
	}

	// Get authorization URL
	authURL := ""
	if ssoConfig.OIDCConfig.AuthorizationURL != nil {
		authURL = *ssoConfig.OIDCConfig.AuthorizationURL
	} else {
		// Use discovery to get authorization endpoint
		authURL = fmt.Sprintf("%s/authorize", ssoConfig.OIDCConfig.Issuer)
	}

	// Build callback URL
	callbackURL := fmt.Sprintf("%s/api/auth/sso/%s/oidc/callback", s.config.SSO.BaseURL, domain.ID.String())

	// Build scopes
	scopes := "openid email profile"
	if len(ssoConfig.OIDCConfig.Scopes) > 0 {
		scopes = strings.Join(ssoConfig.OIDCConfig.Scopes, " ")
	}

	// Build authorization URL
	authURLWithParams := fmt.Sprintf("%s?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&state=%s",
		authURL,
		ssoConfig.OIDCConfig.ClientID,
		callbackURL,
		scopes,
		state,
	)

	return authURLWithParams, nil
}

func (s *SSOService) parseSAMLResponse(config *models.SAMLConfig, samlResponse string) (map[string]interface{}, error) {
	// In production, use crewjam/saml library to parse and validate
	// This is a placeholder that would parse the actual SAML response
	attributes := make(map[string]interface{})

	// Parse SAML response XML and extract attributes
	// Validate signature using config.Certificate
	// Extract NameID and attributes

	return attributes, nil
}

func (s *SSOService) exchangeOIDCCode(config *models.OIDCConfig, code string) (map[string]interface{}, error) {
	// In production, use golang.org/x/oauth2 library
	// This is a placeholder that would:
	// 1. Exchange code for access token at token endpoint
	// 2. Fetch user info from userinfo endpoint
	// 3. Return user info claims

	userInfo := make(map[string]interface{})

	// Token exchange would happen here
	// userInfo would be populated from ID token or userinfo endpoint

	return userInfo, nil
}

func (s *SSOService) extractAttribute(attrs map[string]interface{}, mapping map[string]string, key string) string {
	// Check if there's a mapping for this key
	attrName := key
	if mapping != nil {
		if mapped, ok := mapping[key]; ok {
			attrName = mapped
		}
	}

	if val, ok := attrs[attrName]; ok {
		switch v := val.(type) {
		case string:
			return v
		case []string:
			if len(v) > 0 {
				return v[0]
			}
		case []interface{}:
			if len(v) > 0 {
				if s, ok := v[0].(string); ok {
					return s
				}
			}
		}
	}
	return ""
}

func (s *SSOService) extractOIDCAttribute(claims map[string]interface{}, mapping map[string]string, key string) string {
	// Check if there's a mapping for this key
	attrName := key
	if mapping != nil {
		if mapped, ok := mapping[key]; ok {
			attrName = mapped
		}
	}

	if val, ok := claims[attrName]; ok {
		if s, ok := val.(string); ok {
			return s
		}
	}
	return ""
}
