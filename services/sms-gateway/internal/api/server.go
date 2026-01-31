package api

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"

	"sms-gateway/internal/config"
	"sms-gateway/internal/otp"
	"sms-gateway/internal/providers"
	"sms-gateway/internal/ratelimit"
	"sms-gateway/internal/repository"
	"sms-gateway/internal/templates"
)

// contextKey is a custom type for context keys to avoid collisions
type contextKey string

const (
	// apiKeyContextKey is the context key for storing API key information
	apiKeyContextKey contextKey = "api_key"
	// userContextKey is the context key for storing user claims
	userContextKey contextKey = "user_claims"
)

// UserClaims represents authenticated user claims from JWT
type UserClaims struct {
	UserID         string `json:"user_id"`
	OrganizationID string `json:"organization_id"`
	Email          string `json:"email"`
	Role           string `json:"role"`
}

// APIKeyInfo represents validated API key information
type APIKeyInfo struct {
	KeyID          string
	OrganizationID string
	Scopes         []string
}

// Authentication errors
var (
	ErrInvalidAPIKey  = errors.New("invalid API key")
	ErrAPIKeyInactive = errors.New("API key is inactive")
	ErrAPIKeyExpired  = errors.New("API key has expired")
)

// Server represents the API server
type Server struct {
	config          *config.Config
	repo            *repository.Repository
	providerManager *providers.Manager
	otpService      *otp.Service
	rateLimiter     *ratelimit.Limiter
	templates       *templates.Engine
	logger          *zap.Logger
}

// NewServer creates a new API server
func NewServer(
	cfg *config.Config,
	repo *repository.Repository,
	pm *providers.Manager,
	otpSvc *otp.Service,
	rl *ratelimit.Limiter,
	te *templates.Engine,
	logger *zap.Logger,
) *Server {
	return &Server{
		config:          cfg,
		repo:            repo,
		providerManager: pm,
		otpService:      otpSvc,
		rateLimiter:     rl,
		templates:       te,
		logger:          logger,
	}
}

// Router returns the HTTP router
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(s.loggingMiddleware)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// CORS configuration - use configured allowed origins, never wildcard in production
	allowedOrigins := s.config.Auth.AllowedOrigins
	if len(allowedOrigins) == 0 {
		// Default to restrictive origins if not configured
		allowedOrigins = []string{"https://app.example.com", "https://admin.example.com"}
		s.logger.Warn("No CORS origins configured, using defaults. Set AUTH_ALLOWED_ORIGINS in production.")
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID", "X-RateLimit-Remaining", "X-RateLimit-Reset"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check (no auth)
	r.Get("/health", s.healthCheck)

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth middleware
		r.Use(s.authMiddleware)
		r.Use(s.rateLimitMiddleware)

		// SMS endpoints
		r.Route("/sms", func(r chi.Router) {
			r.Post("/send", s.sendSMS)
			r.Post("/send-bulk", s.sendBulkSMS)
			r.Get("/status/{messageId}", s.getMessageStatus)
			r.Get("/messages", s.listMessages)
		})

		// OTP endpoints
		r.Route("/otp", func(r chi.Router) {
			r.Post("/send", s.sendOTP)
			r.Post("/verify", s.verifyOTP)
			r.Post("/resend", s.resendOTP)
			r.Delete("/{requestId}", s.cancelOTP)
			r.Get("/{requestId}", s.getOTPStatus)
		})

		// Template endpoints
		r.Route("/templates", func(r chi.Router) {
			r.Get("/", s.listTemplates)
			r.Post("/", s.createTemplate)
			r.Get("/{templateId}", s.getTemplate)
			r.Put("/{templateId}", s.updateTemplate)
			r.Delete("/{templateId}", s.deleteTemplate)
		})

		// Provider endpoints
		r.Route("/providers", func(r chi.Router) {
			r.Get("/", s.listProviders)
			r.Get("/status", s.getProviderStatus)
			r.Get("/balance", s.getProviderBalance)
		})

		// Webhook endpoints (different auth)
		r.Route("/webhooks", func(r chi.Router) {
			r.Post("/twilio", s.handleTwilioWebhook)
			r.Post("/vonage", s.handleVonageWebhook)
		})

		// Analytics endpoints
		r.Route("/analytics", func(r chi.Router) {
			r.Get("/summary", s.getAnalyticsSummary)
			r.Get("/usage", s.getUsageStats)
		})
	})

	return r
}

// =============================================================================
// Middleware
// =============================================================================

func (s *Server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		defer func() {
			s.logger.Info("HTTP request",
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.Int("status", ww.Status()),
				zap.Int("bytes", ww.BytesWritten()),
				zap.Duration("duration", time.Since(start)),
				zap.String("request_id", middleware.GetReqID(r.Context())),
			)
		}()

		next.ServeHTTP(ww, r)
	})
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var ctx context.Context

		// Check for API key first
		apiKey := r.Header.Get("X-API-Key")
		if apiKey != "" {
			// Validate API key against repository
			keyInfo, err := s.validateAPIKey(r.Context(), apiKey)
			if err != nil {
				s.logger.Warn("Invalid API key", zap.Error(err))
				http.Error(w, `{"error":"unauthorized","message":"invalid API key"}`, http.StatusUnauthorized)
				return
			}
			ctx = context.WithValue(r.Context(), apiKeyContextKey, keyInfo)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// Check Authorization header for Bearer token
		auth := r.Header.Get("Authorization")
		if auth == "" {
			http.Error(w, `{"error":"unauthorized","message":"missing authentication - provide X-API-Key header or Authorization Bearer token"}`, http.StatusUnauthorized)
			return
		}

		// Validate JWT token
		tokenString := strings.TrimPrefix(auth, "Bearer ")
		if tokenString == auth {
			http.Error(w, `{"error":"unauthorized","message":"invalid authorization format - use Bearer token"}`, http.StatusUnauthorized)
			return
		}

		claims, err := s.validateJWT(tokenString)
		if err != nil {
			s.logger.Warn("Invalid JWT token", zap.Error(err))
			http.Error(w, `{"error":"unauthorized","message":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		ctx = context.WithValue(r.Context(), userContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// validateJWT validates a JWT token and returns the claims
func (s *Server) validateJWT(tokenString string) (*UserClaims, error) {
	if s.config.Auth.JWTSecret == "" {
		return nil, jwt.ErrTokenMalformed
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(s.config.Auth.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, jwt.ErrTokenInvalidClaims
	}

	// Extract and validate required claims
	userID, _ := claims["user_id"].(string)
	orgID, _ := claims["organization_id"].(string)
	email, _ := claims["email"].(string)
	role, _ := claims["role"].(string)

	if userID == "" || orgID == "" {
		return nil, jwt.ErrTokenInvalidClaims
	}

	return &UserClaims{
		UserID:         userID,
		OrganizationID: orgID,
		Email:          email,
		Role:           role,
	}, nil
}

// validateAPIKey validates an API key against the repository
func (s *Server) validateAPIKey(ctx context.Context, apiKey string) (*APIKeyInfo, error) {
	// Retrieve API key from repository
	keyRecord, err := s.repo.GetAPIKey(ctx, apiKey)
	if err != nil {
		return nil, err
	}

	// Use constant-time comparison to prevent timing attacks
	if subtle.ConstantTimeCompare([]byte(keyRecord.KeyHash), []byte(hashAPIKey(apiKey))) != 1 {
		return nil, ErrInvalidAPIKey
	}

	// Check if key is active and not expired
	if !keyRecord.IsActive {
		return nil, ErrAPIKeyInactive
	}

	if keyRecord.ExpiresAt != nil && time.Now().After(*keyRecord.ExpiresAt) {
		return nil, ErrAPIKeyExpired
	}

	return &APIKeyInfo{
		KeyID:          keyRecord.ID,
		OrganizationID: keyRecord.OrganizationID,
		Scopes:         keyRecord.Scopes,
	}, nil
}

// hashAPIKey creates a hash of the API key for comparison
func hashAPIKey(key string) string {
	// In production, use a proper hashing mechanism like SHA-256
	// This is a placeholder - the actual hash should match what's stored
	return key
}

func (s *Server) rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get rate limit key from authenticated context - NEVER use a default fallback
		var rateLimitKey string

		// Check for API key info in context (set by authMiddleware)
		if keyInfo, ok := r.Context().Value(apiKeyContextKey).(*APIKeyInfo); ok && keyInfo != nil {
			rateLimitKey = "apikey:" + keyInfo.KeyID
		} else if userClaims, ok := r.Context().Value(userContextKey).(*UserClaims); ok && userClaims != nil {
			// Use user ID for rate limiting JWT-authenticated requests
			rateLimitKey = "user:" + userClaims.UserID
		} else {
			// No valid authentication found - this should not happen if auth middleware ran
			s.logger.Error("Rate limit middleware called without valid authentication context")
			http.Error(w, `{"error":"unauthorized","message":"authentication required"}`, http.StatusUnauthorized)
			return
		}

		result, err := s.rateLimiter.CheckAPI(r.Context(), rateLimitKey)
		if err != nil {
			s.logger.Error("Rate limit check failed", zap.Error(err))
		}

		// Set rate limit headers
		w.Header().Set("X-RateLimit-Remaining", string(rune(result.Remaining)))
		w.Header().Set("X-RateLimit-Reset", result.ResetAt.UTC().Format(time.RFC3339))

		if !result.Allowed {
			w.Header().Set("Retry-After", string(rune(int(result.RetryAfter.Seconds()))))
			http.Error(w, `{"error":"rate_limit_exceeded","message":"too many requests"}`, http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// =============================================================================
// Health Check
// =============================================================================

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy","service":"sms-gateway"}`))
}
