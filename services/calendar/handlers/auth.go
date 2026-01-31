package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type AuthMiddleware struct {
	authServiceURL string
	logger         *zap.Logger
}

func NewAuthMiddleware(authServiceURL string, logger *zap.Logger) *AuthMiddleware {
	return &AuthMiddleware{
		authServiceURL: authServiceURL,
		logger:         logger,
	}
}

// Authenticate validates JWT token and sets user context
func (m *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			// Check for CalDAV basic auth
			username, password, ok := r.BasicAuth()
			if ok {
				// Validate with auth service
				userID, email, err := m.validateBasicAuth(username, password)
				if err != nil {
					w.Header().Set("WWW-Authenticate", `Basic realm="Calendar"`)
					http.Error(w, "Unauthorized", http.StatusUnauthorized)
					return
				}
				ctx := context.WithValue(r.Context(), "user_id", userID)
				ctx = context.WithValue(ctx, "user_email", email)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			respondError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		// Extract Bearer token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			respondError(w, http.StatusUnauthorized, "invalid authorization header")
			return
		}
		token := parts[1]

		// Validate token with auth service
		userID, email, err := m.validateToken(token)
		if err != nil {
			m.logger.Error("Token validation failed", zap.Error(err))
			respondError(w, http.StatusUnauthorized, "invalid token")
			return
		}

		// Set user info in context
		ctx := context.WithValue(r.Context(), "user_id", userID)
		ctx = context.WithValue(ctx, "user_email", email)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// validateToken validates JWT with auth service
func (m *AuthMiddleware) validateToken(token string) (uuid.UUID, string, error) {
	// In production, call auth service to validate token
	// For now, implement a simple JWT parsing (in real implementation, use proper JWT library)

	// Mock implementation for development
	// In production: call auth service's /api/v1/auth/validate endpoint

	// Placeholder - return mock user
	// This should be replaced with actual auth service call
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	email := "user@example.com"

	return userID, email, nil
}

// validateBasicAuth validates username/password with auth service
func (m *AuthMiddleware) validateBasicAuth(username, password string) (uuid.UUID, string, error) {
	// In production, call auth service to validate credentials
	// For CalDAV clients that don't support OAuth

	// Placeholder - return mock user
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	return userID, username, nil
}

// OptionalAuth allows unauthenticated requests but sets user if token present
func (m *AuthMiddleware) OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			next.ServeHTTP(w, r)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			userID, email, err := m.validateToken(parts[1])
			if err == nil {
				ctx := context.WithValue(r.Context(), "user_id", userID)
				ctx = context.WithValue(ctx, "user_email", email)
				r = r.WithContext(ctx)
			}
		}

		next.ServeHTTP(w, r)
	})
}
