package imap

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
)

// OAuth2 errors
var (
	ErrInvalidOAuth2Token   = errors.New("invalid OAuth2 token")
	ErrOAuth2TokenExpired   = errors.New("OAuth2 token expired")
	ErrOAuth2ProviderError  = errors.New("OAuth2 provider error")
	ErrUnsupportedProvider  = errors.New("unsupported OAuth2 provider")
	ErrEmailMismatch        = errors.New("token email does not match authentication identity")
)

// OAuth2Provider represents a supported OAuth2 identity provider
type OAuth2Provider string

const (
	ProviderGoogle    OAuth2Provider = "google"
	ProviderMicrosoft OAuth2Provider = "microsoft"
	ProviderInternal  OAuth2Provider = "internal"
)

// OAuth2TokenInfo contains validated token information
type OAuth2TokenInfo struct {
	Email          string
	Subject        string
	Issuer         string
	Audience       string
	ExpiresAt      time.Time
	Provider       OAuth2Provider
	ProviderUserID string
}

// OAuth2Config holds OAuth2 authentication configuration
type OAuth2Config struct {
	// Enabled determines if OAuth2 authentication is allowed
	Enabled bool `yaml:"enabled"`
	// AllowedProviders lists the allowed OAuth2 providers
	AllowedProviders []OAuth2Provider `yaml:"allowed_providers"`
	// GoogleClientIDs are the allowed Google OAuth2 client IDs
	GoogleClientIDs []string `yaml:"google_client_ids"`
	// MicrosoftTenantIDs are the allowed Microsoft tenant IDs (or "common" for multi-tenant)
	MicrosoftTenantIDs []string `yaml:"microsoft_tenant_ids"`
	// InternalJWTSecret is the secret for validating internal JWT tokens
	InternalJWTSecret string `yaml:"internal_jwt_secret"`
}

// OAuth2Validator validates OAuth2 tokens from various providers
type OAuth2Validator struct {
	config     *OAuth2Config
	httpClient *http.Client
	logger     *zap.Logger
	mu         sync.RWMutex
}

// NewOAuth2Validator creates a new OAuth2 token validator
func NewOAuth2Validator(config *OAuth2Config, logger *zap.Logger) *OAuth2Validator {
	if config == nil {
		config = &OAuth2Config{Enabled: false}
	}

	return &OAuth2Validator{
		config: config,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		logger: logger,
	}
}

// handleAuthenticateXOAuth2 handles XOAUTH2 authentication mechanism
func (c *Connection) handleAuthenticateXOAuth2(tag string, parts []string) error {
	if c.oauth2Validator == nil || !c.oauth2Validator.config.Enabled {
		c.sendTagged(tag, "NO [CANNOT] OAuth2 authentication not available")
		return nil
	}

	// Check if TLS is required
	if c.config.Auth.RequireEncryption && !c.ctx.TLSEnabled {
		c.sendTagged(tag, "NO [PRIVACYREQUIRED] Encryption required for authentication")
		authAttempts.WithLabelValues("XOAUTH2", "encryption_required").Inc()
		return nil
	}

	var credentials string
	if len(parts) > 1 && parts[1] != "" {
		// Credentials provided inline
		credentials = parts[1]
	} else {
		// Send continuation and wait for credentials
		c.sendContinuation("")
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return err
		}
		credentials = strings.TrimRight(line, "\r\n")
	}

	// Decode base64 credentials
	decoded, err := decodeBase64(credentials)
	if err != nil {
		c.sendTagged(tag, "BAD Invalid base64 encoding")
		return nil
	}

	// Parse XOAUTH2 format: user=<email>\x01auth=Bearer <token>\x01\x01
	email, token, err := parseXOAuth2(string(decoded))
	if err != nil {
		c.sendTagged(tag, "NO [AUTHENTICATIONFAILED] Invalid XOAUTH2 format")
		authAttempts.WithLabelValues("XOAUTH2", "invalid_format").Inc()
		return nil
	}

	return c.authenticateWithOAuth2(tag, email, token, "XOAUTH2")
}

// handleAuthenticateOAuthBearer handles OAUTHBEARER authentication mechanism (RFC 7628)
func (c *Connection) handleAuthenticateOAuthBearer(tag string, parts []string) error {
	if c.oauth2Validator == nil || !c.oauth2Validator.config.Enabled {
		c.sendTagged(tag, "NO [CANNOT] OAuth2 authentication not available")
		return nil
	}

	// Check if TLS is required
	if c.config.Auth.RequireEncryption && !c.ctx.TLSEnabled {
		c.sendTagged(tag, "NO [PRIVACYREQUIRED] Encryption required for authentication")
		authAttempts.WithLabelValues("OAUTHBEARER", "encryption_required").Inc()
		return nil
	}

	var credentials string
	if len(parts) > 1 && parts[1] != "" {
		// Credentials provided inline
		credentials = parts[1]
	} else {
		// Send continuation and wait for credentials
		c.sendContinuation("")
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return err
		}
		credentials = strings.TrimRight(line, "\r\n")
	}

	// Decode base64 credentials
	decoded, err := decodeBase64(credentials)
	if err != nil {
		c.sendTagged(tag, "BAD Invalid base64 encoding")
		return nil
	}

	// Parse OAUTHBEARER format
	email, token, err := parseOAuthBearer(string(decoded))
	if err != nil {
		c.sendTagged(tag, "NO [AUTHENTICATIONFAILED] Invalid OAUTHBEARER format")
		authAttempts.WithLabelValues("OAUTHBEARER", "invalid_format").Inc()
		return nil
	}

	return c.authenticateWithOAuth2(tag, email, token, "OAUTHBEARER")
}

// authenticateWithOAuth2 performs OAuth2 authentication
func (c *Connection) authenticateWithOAuth2(tag, email, token, method string) error {
	ctx, cancel := c.getContext()
	defer cancel()

	// Validate the OAuth2 token
	tokenInfo, err := c.oauth2Validator.ValidateToken(ctx, token)
	if err != nil {
		c.logger.Warn("OAuth2 token validation failed",
			zap.String("email", email),
			zap.Error(err),
		)
		c.sendTagged(tag, "NO [AUTHENTICATIONFAILED] Invalid OAuth2 token")
		authAttempts.WithLabelValues(method, "invalid_token").Inc()
		return nil
	}

	// Verify the token email matches the authentication identity
	if !strings.EqualFold(tokenInfo.Email, email) {
		c.logger.Warn("OAuth2 token email mismatch",
			zap.String("auth_email", email),
			zap.String("token_email", tokenInfo.Email),
		)
		c.sendTagged(tag, "NO [AUTHENTICATIONFAILED] Email mismatch")
		authAttempts.WithLabelValues(method, "email_mismatch").Inc()
		return nil
	}

	// Look up user by email
	user, err := c.repo.GetUserByEmail(ctx, email)
	if err != nil {
		c.logger.Warn("OAuth2 authentication failed - user not found",
			zap.String("email", email),
			zap.Error(err),
		)
		c.sendTagged(tag, "NO [AUTHENTICATIONFAILED] Invalid credentials")
		authAttempts.WithLabelValues(method, "user_not_found").Inc()
		return nil
	}

	// Get organization
	org, err := c.repo.GetOrganization(ctx, user.OrganizationID)
	if err != nil {
		c.logger.Error("Failed to get organization", zap.Error(err))
		c.sendTagged(tag, "NO [UNAVAILABLE] Internal error")
		return nil
	}

	// Get user's mailboxes
	mailboxes, err := c.repo.GetUserMailboxes(ctx, user.ID)
	if err != nil {
		c.logger.Error("Failed to get mailboxes", zap.Error(err))
		c.sendTagged(tag, "NO [UNAVAILABLE] Internal error")
		return nil
	}

	// Get shared mailboxes
	sharedMailboxes, err := c.repo.GetSharedMailboxes(ctx, user.ID)
	if err != nil {
		c.logger.Warn("Failed to get shared mailboxes", zap.Error(err))
		// Non-fatal, continue without shared mailboxes
	}

	// Update context
	c.ctx.User = user
	c.ctx.Organization = org
	c.ctx.Mailboxes = mailboxes
	c.ctx.SharedMailboxes = sharedMailboxes
	c.ctx.Authenticated = true
	c.ctx.ID = c.id

	// Set default namespace mode based on user preference or number of mailboxes
	if len(mailboxes) > 1 {
		for _, mb := range mailboxes {
			if mb.NamespaceMode != "" {
				c.ctx.NamespaceMode = mb.NamespaceMode
				break
			}
		}
	}

	// Update last login
	c.repo.UpdateLastLogin(ctx, user.ID)

	c.logger.Info("User authenticated via OAuth2",
		zap.String("user_id", user.ID),
		zap.String("email", email),
		zap.String("provider", string(tokenInfo.Provider)),
		zap.Int("mailbox_count", len(mailboxes)),
	)

	authAttempts.WithLabelValues(method, "success").Inc()
	c.sendTagged(tag, "OK [CAPABILITY %s] Logged in", strings.Join(c.ctx.Capabilities, " "))
	return nil
}

// ValidateToken validates an OAuth2 token and returns token information
func (v *OAuth2Validator) ValidateToken(ctx context.Context, token string) (*OAuth2TokenInfo, error) {
	// Detect token type and validate accordingly
	provider, err := v.detectTokenProvider(token)
	if err != nil {
		return nil, err
	}

	switch provider {
	case ProviderGoogle:
		return v.validateGoogleToken(ctx, token)
	case ProviderMicrosoft:
		return v.validateMicrosoftToken(ctx, token)
	case ProviderInternal:
		return v.validateInternalToken(ctx, token)
	default:
		return nil, ErrUnsupportedProvider
	}
}

// detectTokenProvider attempts to detect the OAuth2 provider from the token
func (v *OAuth2Validator) detectTokenProvider(token string) (OAuth2Provider, error) {
	// JWT tokens have three parts separated by dots
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		// Not a JWT, might be an opaque token - try Google's tokeninfo
		return ProviderGoogle, nil
	}

	// Decode the payload (second part) to check the issuer
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", ErrInvalidOAuth2Token
	}

	var claims struct {
		Iss string `json:"iss"`
		Aud string `json:"aud"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", ErrInvalidOAuth2Token
	}

	// Check issuer to determine provider
	switch {
	case strings.Contains(claims.Iss, "accounts.google.com") || strings.Contains(claims.Iss, "googleapis.com"):
		return ProviderGoogle, nil
	case strings.Contains(claims.Iss, "login.microsoftonline.com") || strings.Contains(claims.Iss, "sts.windows.net"):
		return ProviderMicrosoft, nil
	case strings.Contains(claims.Iss, "enterprise-email") || v.config.InternalJWTSecret != "":
		return ProviderInternal, nil
	default:
		return "", ErrUnsupportedProvider
	}
}

// validateGoogleToken validates a Google OAuth2 access token
func (v *OAuth2Validator) validateGoogleToken(ctx context.Context, token string) (*OAuth2TokenInfo, error) {
	url := fmt.Sprintf("https://oauth2.googleapis.com/tokeninfo?access_token=%s", token)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		v.logger.Error("Failed to validate Google token", zap.Error(err))
		return nil, ErrOAuth2ProviderError
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, ErrInvalidOAuth2Token
	}

	var tokenInfo struct {
		Azp           string `json:"azp"`
		Aud           string `json:"aud"`
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		ExpiresIn     string `json:"expires_in"`
		Scope         string `json:"scope"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tokenInfo); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	// Validate client ID if configured
	if len(v.config.GoogleClientIDs) > 0 {
		valid := false
		for _, clientID := range v.config.GoogleClientIDs {
			if tokenInfo.Aud == clientID || tokenInfo.Azp == clientID {
				valid = true
				break
			}
		}
		if !valid {
			v.logger.Warn("Google token has invalid client ID",
				zap.String("aud", tokenInfo.Aud),
				zap.String("azp", tokenInfo.Azp))
			return nil, ErrInvalidOAuth2Token
		}
	}

	// Validate email scope
	if !strings.Contains(tokenInfo.Scope, "email") {
		return nil, errors.New("token missing email scope")
	}

	return &OAuth2TokenInfo{
		Email:          tokenInfo.Email,
		Subject:        tokenInfo.Sub,
		Issuer:         "https://accounts.google.com",
		Audience:       tokenInfo.Aud,
		Provider:       ProviderGoogle,
		ProviderUserID: tokenInfo.Sub,
	}, nil
}

// validateMicrosoftToken validates a Microsoft OAuth2 access token
func (v *OAuth2Validator) validateMicrosoftToken(ctx context.Context, token string) (*OAuth2TokenInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://graph.microsoft.com/v1.0/me", nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := v.httpClient.Do(req)
	if err != nil {
		v.logger.Error("Failed to validate Microsoft token", zap.Error(err))
		return nil, ErrOAuth2ProviderError
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, ErrInvalidOAuth2Token
	}
	if resp.StatusCode != http.StatusOK {
		return nil, ErrOAuth2ProviderError
	}

	var userInfo struct {
		ID                string `json:"id"`
		UserPrincipalName string `json:"userPrincipalName"`
		Mail              string `json:"mail"`
		DisplayName       string `json:"displayName"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	email := userInfo.Mail
	if email == "" {
		email = userInfo.UserPrincipalName
	}

	return &OAuth2TokenInfo{
		Email:          email,
		Subject:        userInfo.ID,
		Issuer:         "https://login.microsoftonline.com",
		Provider:       ProviderMicrosoft,
		ProviderUserID: userInfo.ID,
	}, nil
}

// validateInternalToken validates an internal JWT token
func (v *OAuth2Validator) validateInternalToken(ctx context.Context, token string) (*OAuth2TokenInfo, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidOAuth2Token
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrInvalidOAuth2Token
	}

	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Exp   int64  `json:"exp"`
		Iss   string `json:"iss"`
		Aud   string `json:"aud"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, ErrInvalidOAuth2Token
	}

	// Check expiration
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, ErrOAuth2TokenExpired
	}

	return &OAuth2TokenInfo{
		Email:          claims.Email,
		Subject:        claims.Sub,
		Issuer:         claims.Iss,
		Audience:       claims.Aud,
		ExpiresAt:      time.Unix(claims.Exp, 0),
		Provider:       ProviderInternal,
		ProviderUserID: claims.Sub,
	}, nil
}

// parseXOAuth2 parses the XOAUTH2 authentication string
// Format: user=<email>\x01auth=Bearer <token>\x01\x01
func parseXOAuth2(s string) (email, token string, err error) {
	parts := strings.Split(s, "\x01")
	if len(parts) < 2 {
		return "", "", errors.New("invalid XOAUTH2 format")
	}

	for _, part := range parts {
		if strings.HasPrefix(part, "user=") {
			email = strings.TrimPrefix(part, "user=")
		} else if strings.HasPrefix(part, "auth=Bearer ") {
			token = strings.TrimPrefix(part, "auth=Bearer ")
		}
	}

	if email == "" || token == "" {
		return "", "", errors.New("missing email or token in XOAUTH2")
	}

	return email, token, nil
}

// parseOAuthBearer parses the OAUTHBEARER authentication string (RFC 7628)
// Format: n,a=<authzid>,\x01host=<host>\x01port=<port>\x01auth=Bearer <token>\x01\x01
func parseOAuthBearer(s string) (email, token string, err error) {
	// First line contains GS2 header with authzid
	lines := strings.SplitN(s, "\x01", 2)
	if len(lines) < 2 {
		return "", "", errors.New("invalid OAUTHBEARER format")
	}

	// Parse GS2 header: n,a=<authzid>,
	gs2Parts := strings.Split(lines[0], ",")
	for _, part := range gs2Parts {
		if strings.HasPrefix(part, "a=") {
			email = strings.TrimPrefix(part, "a=")
		}
	}

	// Parse key-value pairs
	kvParts := strings.Split(lines[1], "\x01")
	for _, part := range kvParts {
		if strings.HasPrefix(part, "auth=Bearer ") {
			token = strings.TrimPrefix(part, "auth=Bearer ")
		}
	}

	if email == "" || token == "" {
		return "", "", errors.New("missing email or token in OAUTHBEARER")
	}

	return email, token, nil
}
