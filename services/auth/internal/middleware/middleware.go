// Package middleware provides HTTP middleware for authentication and authorization.
package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/repository"
	"github.com/artpromedia/email/services/auth/internal/token"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// Context keys for request context
type contextKey string

const (
	// UserContextKey is the context key for the authenticated user claims.
	UserContextKey contextKey = "user"
	// DomainContextKey is the context key for the current domain context.
	DomainContextKey contextKey = "domain"
	// RequestIDContextKey is the context key for the request ID.
	RequestIDContextKey contextKey = "request_id"
)

// AuthMiddleware handles JWT authentication.
type AuthMiddleware struct {
	tokenService *token.Service
	repo         *repository.Repository
}

// NewAuthMiddleware creates a new AuthMiddleware.
func NewAuthMiddleware(tokenService *token.Service, repo *repository.Repository) *AuthMiddleware {
	return &AuthMiddleware{
		tokenService: tokenService,
		repo:         repo,
	}
}

// Authenticate validates the JWT token and adds claims to the request context.
func (m *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"unauthorized","message":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		// Expect "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			http.Error(w, `{"error":"unauthorized","message":"invalid authorization header format"}`, http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Validate token
		claims, err := m.tokenService.ValidateAccessToken(tokenString)
		if err != nil {
			log.Debug().Err(err).Msg("Token validation failed")
			if err == token.ErrExpiredToken {
				http.Error(w, `{"error":"token_expired","message":"access token has expired"}`, http.StatusUnauthorized)
			} else {
				http.Error(w, `{"error":"unauthorized","message":"invalid access token"}`, http.StatusUnauthorized)
			}
			return
		}

		// Add claims to context
		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// OptionalAuth attempts to authenticate but allows unauthenticated requests.
func (m *AuthMiddleware) OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			next.ServeHTTP(w, r)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			next.ServeHTTP(w, r)
			return
		}

		tokenString := parts[1]
		claims, err := m.tokenService.ValidateAccessToken(tokenString)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole validates that the user has the required role.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetUserClaims(r.Context())
			if claims == nil {
				http.Error(w, `{"error":"unauthorized","message":"authentication required"}`, http.StatusUnauthorized)
				return
			}

			for _, role := range roles {
				if claims.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, `{"error":"forbidden","message":"insufficient permissions"}`, http.StatusForbidden)
		})
	}
}

// RequireOrganizationAdmin validates that the user is an organization admin.
func RequireOrganizationAdmin() func(http.Handler) http.Handler {
	return RequireRole("admin", "owner")
}

// DomainContext holds domain context information.
type DomainContext struct {
	DomainID     uuid.UUID
	DomainName   string
	CanSend      bool
	CanManage    bool
	CanViewStats bool
	CanManageUsers bool
}

// RequireDomainAccess validates that the user has access to a domain.
// The domain ID is extracted from URL parameters, query string, or header.
func (m *AuthMiddleware) RequireDomainAccess(paramName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetUserClaims(r.Context())
			if claims == nil {
				http.Error(w, `{"error":"unauthorized","message":"authentication required"}`, http.StatusUnauthorized)
				return
			}

			// Extract domain ID from request
			domainIDStr := r.URL.Query().Get(paramName)
			if domainIDStr == "" {
				domainIDStr = r.Header.Get("X-Domain-ID")
			}
			if domainIDStr == "" {
				// Try to get from URL path (chi router)
				domainIDStr = r.PathValue(paramName)
			}

			if domainIDStr == "" {
				http.Error(w, `{"error":"bad_request","message":"domain ID required"}`, http.StatusBadRequest)
				return
			}

			domainID, err := uuid.Parse(domainIDStr)
			if err != nil {
				http.Error(w, `{"error":"bad_request","message":"invalid domain ID"}`, http.StatusBadRequest)
				return
			}

			// Check if user has access to this domain
			hasAccess := false
			for _, d := range claims.Domains {
				if d == domainID {
					hasAccess = true
					break
				}
			}

			if !hasAccess {
				http.Error(w, `{"error":"forbidden","message":"no access to this domain"}`, http.StatusForbidden)
				return
			}

			// Get domain permissions
			perm, err := m.repo.GetUserDomainPermission(r.Context(), claims.UserID, domainID)
			if err != nil {
				http.Error(w, `{"error":"forbidden","message":"no access to this domain"}`, http.StatusForbidden)
				return
			}

			// Get domain info
			domain, err := m.repo.GetDomainByID(r.Context(), domainID)
			if err != nil {
				http.Error(w, `{"error":"not_found","message":"domain not found"}`, http.StatusNotFound)
				return
			}

			// Add domain context
			domainCtx := &DomainContext{
				DomainID:       domainID,
				DomainName:     domain.DomainName,
				CanSend:        perm.CanSendAs,
				CanManage:      perm.CanManage,
				CanViewStats:   perm.CanViewAnalytics,
				CanManageUsers: perm.CanManageUsers,
			}

			ctx := context.WithValue(r.Context(), DomainContextKey, domainCtx)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireDomainPermission validates a specific domain permission.
func RequireDomainPermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			domainCtx := GetDomainContext(r.Context())
			if domainCtx == nil {
				http.Error(w, `{"error":"bad_request","message":"domain context required"}`, http.StatusBadRequest)
				return
			}

			hasPermission := false
			switch permission {
			case "send":
				hasPermission = domainCtx.CanSend
			case "manage":
				hasPermission = domainCtx.CanManage
			case "view_stats", "view_analytics":
				hasPermission = domainCtx.CanViewStats
			case "manage_users":
				hasPermission = domainCtx.CanManageUsers
			default:
				hasPermission = false
			}

			if !hasPermission {
				http.Error(w, `{"error":"forbidden","message":"insufficient domain permissions"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequireDomainAdmin validates that the user is a domain admin.
func RequireDomainAdmin() func(http.Handler) http.Handler {
	return RequireDomainPermission("manage")
}

// GetUserClaims extracts user claims from the request context.
func GetUserClaims(ctx context.Context) *token.Claims {
	if claims, ok := ctx.Value(UserContextKey).(*token.Claims); ok {
		return claims
	}
	return nil
}

// GetDomainContext extracts domain context from the request context.
func GetDomainContext(ctx context.Context) *DomainContext {
	if domainCtx, ok := ctx.Value(DomainContextKey).(*DomainContext); ok {
		return domainCtx
	}
	return nil
}

// GetRequestID extracts request ID from the request context.
func GetRequestID(ctx context.Context) string {
	if requestID, ok := ctx.Value(RequestIDContextKey).(string); ok {
		return requestID
	}
	return ""
}

// RequestID adds a unique request ID to each request.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}

		ctx := context.WithValue(r.Context(), RequestIDContextKey, requestID)
		w.Header().Set("X-Request-ID", requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Logger logs request information.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap response writer to capture status code
		ww := &responseWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(ww, r)

		duration := time.Since(start)
		requestID := GetRequestID(r.Context())

		log.Info().
			Str("request_id", requestID).
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", ww.status).
			Dur("duration", duration).
			Str("ip", getClientIP(r)).
			Msg("HTTP request")
	})
}

// responseWriter wraps http.ResponseWriter to capture status code.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (w *responseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// getClientIP extracts the client IP from the request.
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}
