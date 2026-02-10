package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type contextKey string

const (
	userContextKey contextKey = "user"
)

// UserClaims represents JWT claims
type UserClaims struct {
	UserID         uuid.UUID `json:"user_id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get token from header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			s.respondError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			s.respondError(w, http.StatusUnauthorized, "invalid authorization format")
			return
		}

		// Parse and validate token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(s.cfg.Auth.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			s.respondError(w, http.StatusUnauthorized, "invalid token")
			return
		}

		// Extract claims
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			s.respondError(w, http.StatusUnauthorized, "invalid claims")
			return
		}

		// Helper to safely get string claim (supports both "sub"/"user_id" and "org_id"/"organization_id")
		getStringClaim := func(keys ...string) string {
			for _, key := range keys {
				if val, ok := claims[key]; ok {
					if str, ok := val.(string); ok {
						return str
					}
				}
			}
			return ""
		}

		// Parse user ID (auth service uses "sub", some use "user_id")
		userIDStr := getStringClaim("sub", "user_id")
		if userIDStr == "" {
			s.respondError(w, http.StatusUnauthorized, "missing user id claim")
			return
		}
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			s.respondError(w, http.StatusUnauthorized, "invalid user id")
			return
		}

		// Parse organization ID (auth service uses "org_id", some use "organization_id")
		orgIDStr := getStringClaim("org_id", "organization_id")
		if orgIDStr == "" {
			s.respondError(w, http.StatusUnauthorized, "missing organization id claim")
			return
		}
		orgID, err := uuid.Parse(orgIDStr)
		if err != nil {
			s.respondError(w, http.StatusUnauthorized, "invalid organization id")
			return
		}

		user := &UserClaims{
			UserID:         userID,
			OrganizationID: orgID,
			Email:          getStringClaim("email"),
			Role:           getStringClaim("role"),
		}

		// Add user to context
		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) getUserFromContext(r *http.Request) *UserClaims {
	user, ok := r.Context().Value(userContextKey).(*UserClaims)
	if !ok {
		return nil
	}
	return user
}

func (s *Server) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			s.logger.Error("Failed to encode response", zap.Error(err))
		}
	}
}

func (s *Server) respondError(w http.ResponseWriter, status int, message string) {
	s.respondJSON(w, status, map[string]string{"error": message})
}
