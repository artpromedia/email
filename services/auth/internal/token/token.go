// Package token provides JWT token generation and validation.
package token

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Common errors
var (
	ErrInvalidToken       = errors.New("invalid token")
	ErrExpiredToken       = errors.New("token has expired")
	ErrInvalidClaims      = errors.New("invalid token claims")
	ErrTokenNotYetValid   = errors.New("token is not yet valid")
)

// Claims represents JWT token claims with multi-domain support.
type Claims struct {
	jwt.RegisteredClaims
	UserID          uuid.UUID            `json:"sub"`
	OrganizationID  uuid.UUID            `json:"org_id"`
	PrimaryDomainID uuid.UUID            `json:"primary_domain_id"`
	Email           string               `json:"email"`
	DisplayName     string               `json:"name"`
	Role            string               `json:"role"`
	Domains         []uuid.UUID          `json:"domains"`
	DomainRoles     map[string]string    `json:"domain_roles"`
	SessionID       uuid.UUID            `json:"session_id"`
	MFAVerified     bool                 `json:"mfa_verified,omitempty"`
}

// RefreshClaims represents refresh token claims.
type RefreshClaims struct {
	jwt.RegisteredClaims
	UserID    uuid.UUID `json:"sub"`
	SessionID uuid.UUID `json:"session_id"`
	TokenType string    `json:"type"`
}

// Service handles JWT token operations.
type Service struct {
	secretKey          []byte
	accessTokenExpiry  time.Duration
	refreshTokenExpiry time.Duration
	issuer             string
	audience           string
}

// NewService creates a new token service.
func NewService(cfg *config.JWTConfig) *Service {
	return &Service{
		secretKey:          []byte(cfg.SecretKey),
		accessTokenExpiry:  cfg.AccessTokenExpiry,
		refreshTokenExpiry: cfg.RefreshTokenExpiry,
		issuer:             cfg.Issuer,
		audience:           cfg.Audience,
	}
}

// TokenPair represents an access/refresh token pair.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
	SessionID    uuid.UUID
}

// GenerateTokenParams holds parameters for token generation.
type GenerateTokenParams struct {
	UserID          uuid.UUID
	OrganizationID  uuid.UUID
	PrimaryDomainID uuid.UUID
	Email           string
	DisplayName     string
	Role            string
	Domains         []uuid.UUID
	DomainRoles     map[string]string
	MFAVerified     bool
}

// GenerateTokenPair creates a new access/refresh token pair.
func (s *Service) GenerateTokenPair(params GenerateTokenParams) (*TokenPair, error) {
	sessionID := uuid.New()
	now := time.Now()

	// Generate access token
	accessClaims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Audience:  jwt.ClaimStrings{s.audience},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTokenExpiry)),
			ID:        uuid.New().String(),
		},
		UserID:          params.UserID,
		OrganizationID:  params.OrganizationID,
		PrimaryDomainID: params.PrimaryDomainID,
		Email:           params.Email,
		DisplayName:     params.DisplayName,
		Role:            params.Role,
		Domains:         params.Domains,
		DomainRoles:     params.DomainRoles,
		SessionID:       sessionID,
		MFAVerified:     params.MFAVerified,
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessTokenString, err := accessToken.SignedString(s.secretKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign access token: %w", err)
	}

	// Generate refresh token
	refreshClaims := RefreshClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Audience:  jwt.ClaimStrings{s.audience},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.refreshTokenExpiry)),
			ID:        uuid.New().String(),
		},
		UserID:    params.UserID,
		SessionID: sessionID,
		TokenType: "refresh",
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshTokenString, err := refreshToken.SignedString(s.secretKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessTokenString,
		RefreshToken: refreshTokenString,
		ExpiresIn:    int64(s.accessTokenExpiry.Seconds()),
		SessionID:    sessionID,
	}, nil
}

// ValidateAccessToken validates an access token and returns its claims.
func (s *Service) ValidateAccessToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.secretKey, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidClaims
	}

	return claims, nil
}

// ValidateRefreshToken validates a refresh token and returns its claims.
func (s *Service) ValidateRefreshToken(tokenString string) (*RefreshClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &RefreshClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.secretKey, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	claims, ok := token.Claims.(*RefreshClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidClaims
	}

	if claims.TokenType != "refresh" {
		return nil, ErrInvalidClaims
	}

	return claims, nil
}

// HashToken creates a SHA256 hash of a token for secure storage.
func HashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// GetAccessTokenExpiry returns the access token expiry duration.
func (s *Service) GetAccessTokenExpiry() time.Duration {
	return s.accessTokenExpiry
}

// GetRefreshTokenExpiry returns the refresh token expiry duration.
func (s *Service) GetRefreshTokenExpiry() time.Duration {
	return s.refreshTokenExpiry
}
