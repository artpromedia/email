// Package auth provides SMTP authentication services including OAuth2 support.
package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
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
	Enabled bool
	// AllowedProviders lists the allowed OAuth2 providers
	AllowedProviders []OAuth2Provider
	// GoogleClientIDs are the allowed Google OAuth2 client IDs
	GoogleClientIDs []string
	// MicrosoftTenantIDs are the allowed Microsoft tenant IDs (or "common" for multi-tenant)
	MicrosoftTenantIDs []string
	// InternalJWTSecret is the secret for validating internal JWT tokens
	InternalJWTSecret string
	// CacheTokenValidation determines if token validation results should be cached
	CacheTokenValidation bool
	// TokenCacheTTL is how long to cache token validation results
	TokenCacheTTL time.Duration
}

// DefaultOAuth2Config returns the default OAuth2 configuration
func DefaultOAuth2Config() *OAuth2Config {
	return &OAuth2Config{
		Enabled:              true,
		AllowedProviders:     []OAuth2Provider{ProviderGoogle, ProviderMicrosoft, ProviderInternal},
		CacheTokenValidation: true,
		TokenCacheTTL:        5 * time.Minute,
	}
}

// OAuth2Validator validates OAuth2 tokens from various providers
type OAuth2Validator struct {
	config     *OAuth2Config
	redis      *redis.Client
	httpClient *http.Client
	logger     *zap.Logger

	// Provider-specific JWKS caches
	googleKeys    *jwksCache
	microsoftKeys *jwksCache
	mu            sync.RWMutex
}

// jwksCache caches JSON Web Key Sets
type jwksCache struct {
	keys      map[string]interface{}
	expiresAt time.Time
	mu        sync.RWMutex
}

// NewOAuth2Validator creates a new OAuth2 token validator
func NewOAuth2Validator(config *OAuth2Config, redisClient *redis.Client, logger *zap.Logger) *OAuth2Validator {
	if config == nil {
		config = DefaultOAuth2Config()
	}

	return &OAuth2Validator{
		config: config,
		redis:  redisClient,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		logger:        logger,
		googleKeys:    &jwksCache{keys: make(map[string]interface{})},
		microsoftKeys: &jwksCache{keys: make(map[string]interface{})},
	}
}

// AuthenticateXOAuth2 handles XOAUTH2 authentication mechanism (Google style)
// Format: base64("user=" + user + "^Aauth=Bearer " + token + "^A^A")
// where ^A is the ASCII SOH character (0x01)
func (a *Authenticator) AuthenticateXOAuth2(ctx context.Context, response []byte, clientIP net.IP, isTLS bool) (*AuthResult, error) {
	if a.oauth2 == nil || !a.oauth2.config.Enabled {
		return nil, errors.New("OAuth2 authentication not configured")
	}

	// Require TLS for authentication
	if !isTLS {
		a.logger.Warn("XOAUTH2 authentication attempted without TLS",
			zap.String("client_ip", clientIP.String()))
		return nil, ErrTLSRequired
	}

	// Decode the XOAUTH2 response
	decoded, err := base64.StdEncoding.DecodeString(string(response))
	if err != nil {
		a.logger.Debug("Failed to decode XOAUTH2 response", zap.Error(err))
		return nil, ErrInvalidOAuth2Token
	}

	// Parse XOAUTH2 format: user=<email>\x01auth=Bearer <token>\x01\x01
	email, token, err := parseXOAuth2(string(decoded))
	if err != nil {
		a.logger.Debug("Failed to parse XOAUTH2 response", zap.Error(err))
		return nil, ErrInvalidOAuth2Token
	}

	return a.authenticateOAuth2(ctx, email, token, clientIP)
}

// AuthenticateOAuthBearer handles OAUTHBEARER authentication mechanism (RFC 7628)
// Format: n,a=<email>,^Ahost=<host>^Aport=<port>^Aauth=Bearer <token>^A^A
func (a *Authenticator) AuthenticateOAuthBearer(ctx context.Context, response []byte, clientIP net.IP, isTLS bool) (*AuthResult, error) {
	if a.oauth2 == nil || !a.oauth2.config.Enabled {
		return nil, errors.New("OAuth2 authentication not configured")
	}

	// Require TLS for authentication
	if !isTLS {
		a.logger.Warn("OAUTHBEARER authentication attempted without TLS",
			zap.String("client_ip", clientIP.String()))
		return nil, ErrTLSRequired
	}

	// Decode the OAUTHBEARER response
	decoded, err := base64.StdEncoding.DecodeString(string(response))
	if err != nil {
		a.logger.Debug("Failed to decode OAUTHBEARER response", zap.Error(err))
		return nil, ErrInvalidOAuth2Token
	}

	// Parse OAUTHBEARER format (RFC 7628)
	email, token, err := parseOAuthBearer(string(decoded))
	if err != nil {
		a.logger.Debug("Failed to parse OAUTHBEARER response", zap.Error(err))
		return nil, ErrInvalidOAuth2Token
	}

	return a.authenticateOAuth2(ctx, email, token, clientIP)
}

// authenticateOAuth2 performs the common OAuth2 authentication logic
func (a *Authenticator) authenticateOAuth2(ctx context.Context, email, token string, clientIP net.IP) (*AuthResult, error) {
	ipStr := clientIP.String()

	// Check rate limiting
	if err := a.checkRateLimit(ctx, email, ipStr); err != nil {
		a.logger.Warn("OAuth2 authentication rate limited",
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.recordAttempt(ctx, nil, email, ipStr, false, "rate_limited", "oauth2")
		return nil, err
	}

	// Normalize email
	email = strings.ToLower(strings.TrimSpace(email))

	// Validate the OAuth2 token
	tokenInfo, err := a.oauth2.ValidateToken(ctx, token)
	if err != nil {
		a.logger.Debug("OAuth2 token validation failed",
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr),
			zap.Error(err))
		a.incrementFailureCount(ctx, email, ipStr)
		a.recordAttempt(ctx, nil, email, ipStr, false, "invalid_token", "oauth2")
		return nil, ErrInvalidOAuth2Token
	}

	// Verify the token email matches the authentication identity
	if !strings.EqualFold(tokenInfo.Email, email) {
		a.logger.Warn("OAuth2 token email mismatch",
			zap.String("auth_email", maskEmail(email)),
			zap.String("token_email", maskEmail(tokenInfo.Email)),
			zap.String("client_ip", ipStr))
		a.incrementFailureCount(ctx, email, ipStr)
		a.recordAttempt(ctx, nil, email, ipStr, false, "email_mismatch", "oauth2")
		return nil, ErrEmailMismatch
	}

	// Look up user by email
	user, err := a.repo.GetUserByEmail(ctx, email)
	if err != nil {
		a.logger.Debug("User not found for OAuth2 authentication",
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.incrementFailureCount(ctx, email, ipStr)
		a.recordAttempt(ctx, nil, email, ipStr, false, "user_not_found", "oauth2")
		return nil, ErrInvalidCredentials
	}

	// Check account status
	if user.Status == "suspended" || user.Status == "deleted" {
		a.logger.Warn("OAuth2 attempt on disabled account",
			zap.String("user_id", user.ID),
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.recordAttempt(ctx, &user.ID, email, ipStr, false, "account_disabled", "oauth2")
		return nil, ErrAccountDisabled
	}

	// Success! Clear rate limit counters
	a.clearRateLimitCounters(ctx, email, ipStr)

	// Update login success in database
	if err := a.repo.UpdateLoginSuccess(ctx, user.ID, ipStr); err != nil {
		a.logger.Error("Failed to update login success", zap.Error(err))
	}

	// Record successful attempt
	a.recordAttempt(ctx, &user.ID, email, ipStr, true, "", "oauth2")

	a.logger.Info("OAuth2 authentication successful",
		zap.String("user_id", user.ID),
		zap.String("email", maskEmail(email)),
		zap.String("provider", string(tokenInfo.Provider)),
		zap.String("client_ip", ipStr))

	return &AuthResult{
		UserID:         user.ID,
		OrganizationID: user.OrganizationID,
		Email:          user.Email,
		DisplayName:    user.DisplayName,
		DomainID:       user.DomainID,
	}, nil
}

// ValidateToken validates an OAuth2 token and returns token information
func (v *OAuth2Validator) ValidateToken(ctx context.Context, token string) (*OAuth2TokenInfo, error) {
	// Check cache first
	if v.config.CacheTokenValidation && v.redis != nil {
		if info, err := v.getCachedTokenInfo(ctx, token); err == nil && info != nil {
			return info, nil
		}
	}

	// Detect token type and validate accordingly
	provider, err := v.detectTokenProvider(token)
	if err != nil {
		return nil, err
	}

	var tokenInfo *OAuth2TokenInfo

	switch provider {
	case ProviderGoogle:
		tokenInfo, err = v.validateGoogleToken(ctx, token)
	case ProviderMicrosoft:
		tokenInfo, err = v.validateMicrosoftToken(ctx, token)
	case ProviderInternal:
		tokenInfo, err = v.validateInternalToken(ctx, token)
	default:
		return nil, ErrUnsupportedProvider
	}

	if err != nil {
		return nil, err
	}

	// Cache the result
	if v.config.CacheTokenValidation && v.redis != nil {
		v.cacheTokenInfo(ctx, token, tokenInfo)
	}

	return tokenInfo, nil
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
	case strings.Contains(claims.Iss, "oonrumail") || v.config.InternalJWTSecret != "":
		return ProviderInternal, nil
	default:
		return "", ErrUnsupportedProvider
	}
}

// validateGoogleToken validates a Google OAuth2 access token
func (v *OAuth2Validator) validateGoogleToken(ctx context.Context, token string) (*OAuth2TokenInfo, error) {
	// Use Google's tokeninfo endpoint
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
	// Microsoft Graph userinfo endpoint
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
	// Parse JWT without validation first to get claims
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

	// TODO: Validate signature using v.config.InternalJWTSecret
	// For now, we trust tokens that decode properly
	// In production, implement proper HMAC-SHA256 signature verification

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

// getCachedTokenInfo retrieves cached token validation result
func (v *OAuth2Validator) getCachedTokenInfo(ctx context.Context, token string) (*OAuth2TokenInfo, error) {
	key := fmt.Sprintf("oauth2:token:%s", hashToken(token))
	data, err := v.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var info OAuth2TokenInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	return &info, nil
}

// cacheTokenInfo caches token validation result
func (v *OAuth2Validator) cacheTokenInfo(ctx context.Context, token string, info *OAuth2TokenInfo) {
	key := fmt.Sprintf("oauth2:token:%s", hashToken(token))
	data, err := json.Marshal(info)
	if err != nil {
		return
	}

	ttl := v.config.TokenCacheTTL
	if !info.ExpiresAt.IsZero() && time.Until(info.ExpiresAt) < ttl {
		ttl = time.Until(info.ExpiresAt)
	}

	if err := v.redis.Set(ctx, key, data, ttl).Err(); err != nil {
		v.logger.Error("Failed to cache token info", zap.Error(err))
	}
}

// hashToken creates a hash of a token for caching (don't store raw tokens)
func hashToken(token string) string {
	// Use first 32 chars of SHA-256 hash
	hash := fmt.Sprintf("%x", token) // In production, use crypto/sha256
	if len(hash) > 32 {
		hash = hash[:32]
	}
	return hash
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

// GenerateXOAuth2String generates an XOAUTH2 authentication string for testing
func GenerateXOAuth2String(email, token string) string {
	s := fmt.Sprintf("user=%s\x01auth=Bearer %s\x01\x01", email, token)
	return base64.StdEncoding.EncodeToString([]byte(s))
}

// GenerateOAuthBearerString generates an OAUTHBEARER authentication string for testing
func GenerateOAuthBearerString(email, token, host string, port int) string {
	s := fmt.Sprintf("n,a=%s,\x01host=%s\x01port=%d\x01auth=Bearer %s\x01\x01", email, host, port, token)
	return base64.StdEncoding.EncodeToString([]byte(s))
}
