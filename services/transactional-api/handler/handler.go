package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/artpromedia/email/services/transactional-api/middleware"
	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/service"
	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// Handler handles all HTTP requests for the transactional API
type Handler struct {
	apiKeyService      *service.APIKeyService
	senderService      *service.SenderService
	templateService    *service.TemplateService
	webhookService     *service.WebhookService
	suppressionService *service.SuppressionService
	trackingService    *service.TrackingService
	analyticsService   *service.AnalyticsService
	apiKeyMiddleware   *middleware.APIKeyMiddleware
	validator          *validator.Validate
	logger             zerolog.Logger
}

// NewHandler creates a new Handler
func NewHandler(
	apiKeyService *service.APIKeyService,
	senderService *service.SenderService,
	templateService *service.TemplateService,
	webhookService *service.WebhookService,
	suppressionService *service.SuppressionService,
	trackingService *service.TrackingService,
	analyticsService *service.AnalyticsService,
	apiKeyMiddleware *middleware.APIKeyMiddleware,
	logger zerolog.Logger,
) *Handler {
	return &Handler{
		apiKeyService:      apiKeyService,
		senderService:      senderService,
		templateService:    templateService,
		webhookService:     webhookService,
		suppressionService: suppressionService,
		trackingService:    trackingService,
		analyticsService:   analyticsService,
		apiKeyMiddleware:   apiKeyMiddleware,
		validator:          validator.New(),
		logger:             logger,
	}
}

// Router returns the HTTP router with all routes configured
func (h *Handler) Router() chi.Router {
	r := chi.NewRouter()

	// Public routes (no auth)
	r.Get("/health", h.healthCheck)
	r.Get("/ready", h.readinessCheck)

	// Tracking endpoints (no auth required, public access)
	r.Route("/t", func(r chi.Router) {
		r.Get("/o/{data}", h.trackOpen)     // Open tracking pixel
		r.Get("/c/{data}", h.trackClick)    // Click tracking redirect
	})

	// Unsubscribe endpoint
	r.Get("/unsubscribe", h.handleUnsubscribe)
	r.Post("/unsubscribe", h.handleUnsubscribe)

	// API routes (require authentication)
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(h.apiKeyMiddleware.Authenticate)
		r.Use(h.apiKeyMiddleware.RateLimit)

		// Send endpoints
		r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSend)).
			Post("/send", h.sendEmail)
		r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSend)).
			Post("/send/batch", h.sendBatch)

		// Message endpoints
		r.Route("/messages", func(r chi.Router) {
			r.Use(h.apiKeyMiddleware.RequireScope(models.ScopeRead))
			r.Get("/", h.listMessages)
			r.Get("/{id}", h.getMessage)
			r.Get("/{id}/timeline", h.getMessageTimeline)
		})

		// Template endpoints
		r.Route("/templates", func(r chi.Router) {
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates, models.ScopeRead)).
				Get("/", h.listTemplates)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates, models.ScopeRead)).
				Get("/{id}", h.getTemplate)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates)).
				Post("/", h.createTemplate)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates)).
				Put("/{id}", h.updateTemplate)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates)).
				Delete("/{id}", h.deleteTemplate)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates, models.ScopeRead)).
				Post("/{id}/render", h.renderTemplate)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates)).
				Post("/{id}/clone", h.cloneTemplate)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates, models.ScopeRead)).
				Get("/{id}/versions", h.getTemplateVersions)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeTemplates)).
				Post("/preview", h.previewTemplate)
		})

		// Webhook endpoints
		r.Route("/webhooks", func(r chi.Router) {
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks, models.ScopeRead)).
				Get("/", h.listWebhooks)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks, models.ScopeRead)).
				Get("/{id}", h.getWebhook)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks)).
				Post("/", h.createWebhook)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks)).
				Put("/{id}", h.updateWebhook)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks)).
				Delete("/{id}", h.deleteWebhook)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks)).
				Post("/{id}/test", h.testWebhook)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks)).
				Post("/{id}/rotate-secret", h.rotateWebhookSecret)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeWebhooks, models.ScopeRead)).
				Get("/{id}/deliveries", h.listWebhookDeliveries)
		})

		// Suppression endpoints
		r.Route("/suppressions", func(r chi.Router) {
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression, models.ScopeRead)).
				Get("/", h.listSuppressions)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression)).
				Post("/", h.addSuppression)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression)).
				Post("/bulk", h.addBulkSuppression)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression, models.ScopeRead)).
				Post("/check", h.checkSuppressions)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression, models.ScopeRead)).
				Get("/stats", h.getSuppressionStats)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression, models.ScopeRead)).
				Get("/{email}", h.getSuppression)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression)).
				Delete("/{email}", h.removeSuppression)
		})

		// Unsubscribe groups
		r.Route("/groups", func(r chi.Router) {
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression, models.ScopeRead)).
				Get("/", h.listUnsubscribeGroups)
			r.With(h.apiKeyMiddleware.RequireScope(models.ScopeSuppression)).
				Post("/", h.createUnsubscribeGroup)
		})

		// Analytics endpoints
		r.Route("/analytics", func(r chi.Router) {
			r.Use(h.apiKeyMiddleware.RequireScope(models.ScopeAnalytics, models.ScopeRead))
			r.Get("/overview", h.getAnalyticsOverview)
			r.Get("/timeseries", h.getAnalyticsTimeSeries)
			r.Get("/bounces", h.getAnalyticsBounces)
			r.Get("/categories", h.getAnalyticsByCategory)
			r.Get("/domains", h.getAnalyticsByDomain)
			r.Get("/geo", h.getAnalyticsGeo)
			r.Get("/devices", h.getAnalyticsDevices)
			r.Get("/links", h.getAnalyticsLinks)
			r.Get("/engagement", h.getAnalyticsEngagement)
			r.Get("/realtime", h.getAnalyticsRealtime)
			r.Get("/comparison", h.getAnalyticsComparison)
			r.Get("/reputation", h.getAnalyticsReputation)
		})

		// Events endpoint
		r.Route("/events", func(r chi.Router) {
			r.Use(h.apiKeyMiddleware.RequireScope(models.ScopeRead))
			r.Get("/", h.listEvents)
		})

		// API Key management (admin only)
		r.Route("/api-keys", func(r chi.Router) {
			r.Use(h.apiKeyMiddleware.RequireScope(models.ScopeAdmin))
			r.Get("/", h.listAPIKeys)
			r.Post("/", h.createAPIKey)
			r.Get("/{id}", h.getAPIKey)
			r.Put("/{id}", h.updateAPIKey)
			r.Delete("/{id}", h.revokeAPIKey)
			r.Post("/{id}/rotate", h.rotateAPIKey)
			r.Get("/{id}/usage", h.getAPIKeyUsage)
		})
	})

	return r
}

// Health check endpoints
func (h *Handler) healthCheck(w http.ResponseWriter, r *http.Request) {
	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

func (h *Handler) readinessCheck(w http.ResponseWriter, r *http.Request) {
	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "ready",
	})
}

// Response helpers
func (h *Handler) jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

func (h *Handler) errorResponse(w http.ResponseWriter, status int, code, message string) {
	h.jsonResponse(w, status, map[string]string{
		"error":   code,
		"message": message,
	})
}

func (h *Handler) validationError(w http.ResponseWriter, err error) {
	h.jsonResponse(w, http.StatusBadRequest, map[string]any{
		"error":   "validation_error",
		"message": "Request validation failed",
		"details": err.Error(),
	})
}

// Helper functions
func (h *Handler) getAPIKey(ctx middleware.APIKeyMiddleware) *models.APIKey {
	// Note: This would be obtained from context
	return nil
}

func (h *Handler) parseUUID(w http.ResponseWriter, r *http.Request, param string) (uuid.UUID, bool) {
	idStr := chi.URLParam(r, param)
	id, err := uuid.Parse(idStr)
	if err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_id", "Invalid UUID format")
		return uuid.Nil, false
	}
	return id, true
}

func (h *Handler) parseInt(r *http.Request, param string, defaultValue int) int {
	valueStr := r.URL.Query().Get(param)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func (h *Handler) parseBool(r *http.Request, param string, defaultValue bool) bool {
	valueStr := r.URL.Query().Get(param)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseBool(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}
