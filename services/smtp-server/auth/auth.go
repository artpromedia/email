// Package auth provides SMTP authentication services.
package auth

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// Common errors
var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrRateLimited        = errors.New("too many failed attempts")
	ErrTLSRequired        = errors.New("TLS connection required for authentication")
	ErrAccountLocked      = errors.New("account is locked")
	ErrAccountDisabled    = errors.New("account is disabled")
	ErrNoPassword         = errors.New("no password set for account")
)

// AuthResult contains the result of a successful authentication
type AuthResult struct {
	UserID         string
	OrganizationID string
	Email          string
	DisplayName    string
	DomainID       string
}

// User represents a user for authentication
type User struct {
	ID             string
	OrganizationID string
	Email          string
	DisplayName    string
	PasswordHash   string
	Status         string
	DomainID       string
	LockedUntil    *time.Time
}

// Repository interface for user authentication data
type Repository interface {
	// GetUserByEmail retrieves a user by any of their email addresses
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	// UpdateLoginFailure records a failed login attempt
	UpdateLoginFailure(ctx context.Context, userID string) error
	// UpdateLoginSuccess records a successful login
	UpdateLoginSuccess(ctx context.Context, userID string, ipAddress string) error
	// RecordLoginAttempt records a login attempt for audit
	RecordLoginAttempt(ctx context.Context, params LoginAttemptParams) error
}

// LoginAttemptParams holds parameters for recording a login attempt
type LoginAttemptParams struct {
	UserID     *string
	Email      string
	IPAddress  string
	Success    bool
	FailReason string
	Method     string
}

// Config holds authentication configuration
type Config struct {
	MaxFailedAttempts int           // Maximum failed attempts before lockout
	LockoutDuration   time.Duration // How long to lock out after max failures
	RateLimitWindow   time.Duration // Window for rate limiting (e.g., 15 minutes)
}

// DefaultConfig returns the default auth configuration
func DefaultConfig() *Config {
	return &Config{
		MaxFailedAttempts: 5,
		LockoutDuration:   15 * time.Minute,
		RateLimitWindow:   15 * time.Minute,
	}
}

// Authenticator handles SMTP authentication
type Authenticator struct {
	repo   Repository
	redis  *redis.Client
	config *Config
	logger *zap.Logger
}

// NewAuthenticator creates a new SMTP authenticator
func NewAuthenticator(repo Repository, redisClient *redis.Client, logger *zap.Logger, config *Config) *Authenticator {
	if config == nil {
		config = DefaultConfig()
	}
	return &Authenticator{
		repo:   repo,
		redis:  redisClient,
		config: config,
		logger: logger,
	}
}

// AuthenticatePlain handles PLAIN authentication mechanism (RFC 4616)
// Format: authorization-id NUL authentication-id NUL password
// For SMTP, authorization-id is typically empty or same as authentication-id
func (a *Authenticator) AuthenticatePlain(ctx context.Context, response []byte, clientIP net.IP, isTLS bool) (*AuthResult, error) {
	// Require TLS for authentication
	if !isTLS {
		a.logger.Warn("Authentication attempted without TLS",
			zap.String("client_ip", clientIP.String()))
		return nil, ErrTLSRequired
	}

	// Parse PLAIN response: [authzid] NUL authcid NUL passwd
	parts := strings.Split(string(response), "\x00")
	if len(parts) != 3 {
		return nil, ErrInvalidCredentials
	}

	// authzid (authorization identity) is typically empty for SMTP
	// authcid (authentication identity) is the email
	// passwd is the password
	email := parts[1]
	password := parts[2]

	if email == "" || password == "" {
		return nil, ErrInvalidCredentials
	}

	return a.authenticate(ctx, email, password, clientIP)
}

// AuthenticateLogin handles LOGIN authentication mechanism
// This is a multi-step process: server prompts for username, then password
type LoginAuthState struct {
	Step     int    // 0 = waiting for username, 1 = waiting for password
	Username string
	ClientIP net.IP
	IsTLS    bool
}

// AuthenticateLoginStep processes a step of the LOGIN authentication
func (a *Authenticator) AuthenticateLoginStep(ctx context.Context, state *LoginAuthState, response []byte) (*AuthResult, []byte, error) {
	// Require TLS for authentication
	if !state.IsTLS {
		a.logger.Warn("LOGIN authentication attempted without TLS",
			zap.String("client_ip", state.ClientIP.String()))
		return nil, nil, ErrTLSRequired
	}

	switch state.Step {
	case 0:
		// Received username (base64 encoded in the protocol, but go-smtp decodes it)
		state.Username = string(response)
		if state.Username == "" {
			return nil, nil, ErrInvalidCredentials
		}
		state.Step = 1
		// Return prompt for password (base64 encoded "Password:")
		return nil, []byte("UGFzc3dvcmQ6"), nil // "Password:" in base64

	case 1:
		// Received password
		password := string(response)
		if password == "" {
			return nil, nil, ErrInvalidCredentials
		}
		result, err := a.authenticate(ctx, state.Username, password, state.ClientIP)
		if err != nil {
			return nil, nil, err
		}
		return result, nil, nil

	default:
		return nil, nil, ErrInvalidCredentials
	}
}

// authenticate performs the actual authentication
func (a *Authenticator) authenticate(ctx context.Context, email, password string, clientIP net.IP) (*AuthResult, error) {
	ipStr := clientIP.String()

	// Check rate limiting first
	if err := a.checkRateLimit(ctx, email, ipStr); err != nil {
		a.logger.Warn("Authentication rate limited",
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.recordAttempt(ctx, nil, email, ipStr, false, "rate_limited", "smtp")
		return nil, err
	}

	// Normalize email
	email = strings.ToLower(strings.TrimSpace(email))

	// Look up user by email
	user, err := a.repo.GetUserByEmail(ctx, email)
	if err != nil {
		a.logger.Debug("User not found for authentication",
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.incrementFailureCount(ctx, email, ipStr)
		a.recordAttempt(ctx, nil, email, ipStr, false, "user_not_found", "smtp")
		return nil, ErrInvalidCredentials
	}

	// Check account status
	if user.Status == "suspended" || user.Status == "deleted" {
		a.logger.Warn("Authentication attempt on disabled account",
			zap.String("user_id", user.ID),
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.recordAttempt(ctx, &user.ID, email, ipStr, false, "account_disabled", "smtp")
		return nil, ErrAccountDisabled
	}

	if user.Status == "pending" {
		a.logger.Warn("Authentication attempt on pending account",
			zap.String("user_id", user.ID),
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.recordAttempt(ctx, &user.ID, email, ipStr, false, "account_pending", "smtp")
		return nil, ErrAccountDisabled
	}

	// Check if account is locked
	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		a.logger.Warn("Authentication attempt on locked account",
			zap.String("user_id", user.ID),
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr),
			zap.Time("locked_until", *user.LockedUntil))
		a.recordAttempt(ctx, &user.ID, email, ipStr, false, "account_locked", "smtp")
		return nil, ErrAccountLocked
	}

	// Check if user has a password
	if user.PasswordHash == "" {
		a.logger.Warn("Authentication attempt on account without password",
			zap.String("user_id", user.ID),
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.recordAttempt(ctx, &user.ID, email, ipStr, false, "no_password", "smtp")
		return nil, ErrNoPassword
	}

	// Verify password using bcrypt
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		a.logger.Debug("Invalid password",
			zap.String("user_id", user.ID),
			zap.String("email", maskEmail(email)),
			zap.String("client_ip", ipStr))
		a.incrementFailureCount(ctx, email, ipStr)
		if err := a.repo.UpdateLoginFailure(ctx, user.ID); err != nil {
			a.logger.Error("Failed to update login failure", zap.Error(err))
		}
		a.recordAttempt(ctx, &user.ID, email, ipStr, false, "invalid_password", "smtp")
		return nil, ErrInvalidCredentials
	}

	// Success! Clear rate limit counters
	a.clearRateLimitCounters(ctx, email, ipStr)

	// Update login success in database
	if err := a.repo.UpdateLoginSuccess(ctx, user.ID, ipStr); err != nil {
		a.logger.Error("Failed to update login success", zap.Error(err))
	}

	// Record successful attempt
	a.recordAttempt(ctx, &user.ID, email, ipStr, true, "", "smtp")

	a.logger.Info("SMTP authentication successful",
		zap.String("user_id", user.ID),
		zap.String("email", maskEmail(email)),
		zap.String("client_ip", ipStr))

	return &AuthResult{
		UserID:         user.ID,
		OrganizationID: user.OrganizationID,
		Email:          user.Email,
		DisplayName:    user.DisplayName,
		DomainID:       user.DomainID,
	}, nil
}

// checkRateLimit checks if the email or IP is rate limited
func (a *Authenticator) checkRateLimit(ctx context.Context, email, ipStr string) error {
	if a.redis == nil {
		return nil // Skip rate limiting if Redis not available
	}

	// Check email-based rate limit
	emailKey := fmt.Sprintf("smtp:auth:fail:email:%s", email)
	emailCount, err := a.redis.Get(ctx, emailKey).Int()
	if err != nil && !errors.Is(err, redis.Nil) {
		a.logger.Error("Failed to check email rate limit", zap.Error(err))
	}
	if emailCount >= a.config.MaxFailedAttempts {
		return ErrRateLimited
	}

	// Check IP-based rate limit
	ipKey := fmt.Sprintf("smtp:auth:fail:ip:%s", ipStr)
	ipCount, err := a.redis.Get(ctx, ipKey).Int()
	if err != nil && !errors.Is(err, redis.Nil) {
		a.logger.Error("Failed to check IP rate limit", zap.Error(err))
	}
	if ipCount >= a.config.MaxFailedAttempts*3 { // More lenient for IPs (NAT scenarios)
		return ErrRateLimited
	}

	return nil
}

// incrementFailureCount increments the failure counters
func (a *Authenticator) incrementFailureCount(ctx context.Context, email, ipStr string) {
	if a.redis == nil {
		return
	}

	emailKey := fmt.Sprintf("smtp:auth:fail:email:%s", email)
	ipKey := fmt.Sprintf("smtp:auth:fail:ip:%s", ipStr)

	pipe := a.redis.Pipeline()
	pipe.Incr(ctx, emailKey)
	pipe.Expire(ctx, emailKey, a.config.LockoutDuration)
	pipe.Incr(ctx, ipKey)
	pipe.Expire(ctx, ipKey, a.config.LockoutDuration)

	if _, err := pipe.Exec(ctx); err != nil {
		a.logger.Error("Failed to increment failure counters", zap.Error(err))
	}
}

// clearRateLimitCounters clears rate limit counters on successful auth
func (a *Authenticator) clearRateLimitCounters(ctx context.Context, email, ipStr string) {
	if a.redis == nil {
		return
	}

	emailKey := fmt.Sprintf("smtp:auth:fail:email:%s", email)
	ipKey := fmt.Sprintf("smtp:auth:fail:ip:%s", ipStr)

	if err := a.redis.Del(ctx, emailKey, ipKey).Err(); err != nil {
		a.logger.Error("Failed to clear rate limit counters", zap.Error(err))
	}
}

// recordAttempt records a login attempt for audit purposes
func (a *Authenticator) recordAttempt(ctx context.Context, userID *string, email, ipStr string, success bool, failReason, method string) {
	if err := a.repo.RecordLoginAttempt(ctx, LoginAttemptParams{
		UserID:     userID,
		Email:      email,
		IPAddress:  ipStr,
		Success:    success,
		FailReason: failReason,
		Method:     method,
	}); err != nil {
		a.logger.Error("Failed to record login attempt", zap.Error(err))
	}
}

// maskEmail masks an email address for logging (privacy)
func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return "***"
	}
	local := parts[0]
	domain := parts[1]
	if len(local) <= 2 {
		return "**@" + domain
	}
	return local[:1] + "***" + local[len(local)-1:] + "@" + domain
}

// DecodeBase64 decodes a base64 string (for auth responses)
func DecodeBase64(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}

// EncodeBase64 encodes bytes to base64 (for auth challenges)
func EncodeBase64(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}

// ConstantTimeCompare performs constant-time string comparison
func ConstantTimeCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
