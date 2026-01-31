package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"go.uber.org/zap"

	"sms-gateway/internal/config"
	"sms-gateway/internal/otp"
	"sms-gateway/internal/providers"
	"sms-gateway/internal/ratelimit"
	"sms-gateway/internal/repository"
	"sms-gateway/internal/templates"
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

	// CORS configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key"},
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
		// Check for API key
		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" {
			// Check Authorization header for Bearer token
			auth := r.Header.Get("Authorization")
			if auth == "" {
				http.Error(w, `{"error":"unauthorized","message":"missing authentication"}`, http.StatusUnauthorized)
				return
			}
			// TODO: Validate JWT token
		} else {
			// Validate API key
			// TODO: Implement API key validation
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get API key or user ID for rate limiting
		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" {
			apiKey = "default"
		}

		result, err := s.rateLimiter.CheckAPI(r.Context(), apiKey)
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
