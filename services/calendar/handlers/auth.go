package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type AuthMiddleware struct {
	authServiceURL string
	logger         *zap.Logger
	httpClient     *http.Client
}

func NewAuthMiddleware(authServiceURL string, logger *zap.Logger) *AuthMiddleware {
	return &AuthMiddleware{
		authServiceURL: authServiceURL,
		logger:         logger,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
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
	req, err := http.NewRequest("GET", m.authServiceURL+"/api/auth/me", nil)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("auth service request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return uuid.Nil, "", fmt.Errorf("auth service returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return uuid.Nil, "", fmt.Errorf("decode response: %w", err)
	}

	userID, err := uuid.Parse(result.ID)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("parse user ID: %w", err)
	}

	return userID, result.Email, nil
}

// validateBasicAuth validates username/password with auth service
func (m *AuthMiddleware) validateBasicAuth(username, password string) (uuid.UUID, string, error) {
	loginBody := fmt.Sprintf(`{"email":"%s","password":"%s"}`, username, password)
	req, err := http.NewRequest("POST", m.authServiceURL+"/api/auth/login", strings.NewReader(loginBody))
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("auth service request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return uuid.Nil, "", fmt.Errorf("invalid credentials")
	}

	var result struct {
		User struct {
			ID    string `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return uuid.Nil, "", fmt.Errorf("decode response: %w", err)
	}

	userID, err := uuid.Parse(result.User.ID)
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("parse user ID: %w", err)
	}

	return userID, result.User.Email, nil
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
