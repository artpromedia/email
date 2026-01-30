package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/enterprise-email/ai-assistant/analysis"
	"github.com/enterprise-email/ai-assistant/embedding"
	"github.com/enterprise-email/ai-assistant/provider"
	"github.com/enterprise-email/ai-assistant/ratelimit"
)

// Handler handles all HTTP requests
type Handler struct {
	router      *provider.Router
	analysis    *analysis.Service
	embedding   *embedding.Service
	rateLimiter *ratelimit.Limiter
	logger      zerolog.Logger
}

// NewHandler creates a new handler instance
func NewHandler(
	router *provider.Router,
	analysisSvc *analysis.Service,
	embeddingSvc *embedding.Service,
	limiter *ratelimit.Limiter,
	logger zerolog.Logger,
) *Handler {
	return &Handler{
		router:      router,
		analysis:    analysisSvc,
		embedding:   embeddingSvc,
		rateLimiter: limiter,
		logger:      logger.With().Str("component", "handler").Logger(),
	}
}

// Routes returns the HTTP router
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Health check
	r.Get("/health", h.healthCheck)
	r.Get("/health/ready", h.readinessCheck)

	// API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Analysis endpoints
		r.Route("/ai", func(r chi.Router) {
			r.Post("/analyze", h.analyzeEmail)
			r.Post("/embeddings", h.generateEmbedding)
			r.Post("/embeddings/batch", h.generateEmbeddingBatch)
		})

		// Usage and stats
		r.Get("/usage", h.getUsageStats)

		// Provider health
		r.Get("/providers/status", h.getProvidersStatus)

		// Cache management
		r.Delete("/cache/analysis/{emailID}", h.invalidateAnalysisCache)
		r.Delete("/cache/embeddings/{id}", h.invalidateEmbeddingCache)
	})

	return r
}

// healthCheck handles health check requests
func (h *Handler) healthCheck(w http.ResponseWriter, r *http.Request) {
	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":  "healthy",
		"service": "ai-assistant",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

// readinessCheck handles readiness check requests
func (h *Handler) readinessCheck(w http.ResponseWriter, r *http.Request) {
	// Check if at least one provider is available
	status := h.router.GetHealthStatus()
	hasProvider := false
	for _, healthy := range status {
		if healthy {
			hasProvider = true
			break
		}
	}

	if !hasProvider {
		h.errorResponse(w, http.StatusServiceUnavailable, "No AI providers available")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":    "ready",
		"providers": status,
	})
}

// AnalyzeRequest is the request body for email analysis
type AnalyzeRequest struct {
	// Email content
	EmailID        string   `json:"email_id"`
	Subject        string   `json:"subject"`
	Body           string   `json:"body"`
	FromAddress    string   `json:"from_address"`
	FromName       string   `json:"from_name"`
	ToAddresses    []string `json:"to_addresses"`
	CcAddresses    []string `json:"cc_addresses"`
	Date           string   `json:"date"`
	HasAttachments bool     `json:"has_attachments"`

	// User context
	UserID    string `json:"user_id"`
	OrgID     string `json:"org_id"`
	UserName  string `json:"user_name"`
	UserEmail string `json:"user_email"`

	// Options
	ExtractActionItems bool `json:"extract_action_items"`
	DetectQuestions    bool `json:"detect_questions"`
	SkipCache          bool `json:"skip_cache"`
}

// analyzeEmail handles email analysis requests
func (h *Handler) analyzeEmail(w http.ResponseWriter, r *http.Request) {
	var req AnalyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	// Validate required fields
	if req.EmailID == "" || req.Body == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id and body are required")
		return
	}

	if req.OrgID == "" || req.UserID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	// Estimate tokens (rough estimate: 1 token ≈ 4 chars)
	estimatedTokens := (len(req.Body) + len(req.Subject)) / 4

	// Check rate limit
	limitResult, err := h.rateLimiter.CheckLimit(r.Context(), req.OrgID, req.UserID, estimatedTokens)
	if err != nil {
		h.logger.Warn().Err(err).Msg("Rate limit check failed")
	}

	if limitResult != nil && !limitResult.Allowed {
		w.Header().Set("Retry-After", string(rune(limitResult.RetryAfter)))
		h.errorResponse(w, http.StatusTooManyRequests, limitResult.Message)
		return
	}

	// Perform analysis
	analysisReq := &analysis.AnalysisRequest{
		EmailID:            req.EmailID,
		Subject:            req.Subject,
		Body:               req.Body,
		FromAddress:        req.FromAddress,
		FromName:           req.FromName,
		ToAddresses:        req.ToAddresses,
		CcAddresses:        req.CcAddresses,
		Date:               req.Date,
		HasAttachments:     req.HasAttachments,
		UserID:             req.UserID,
		OrgID:              req.OrgID,
		UserName:           req.UserName,
		UserEmail:          req.UserEmail,
		ExtractActionItems: req.ExtractActionItems,
		DetectQuestions:    req.DetectQuestions,
		SkipCache:          req.SkipCache,
	}

	result, err := h.analysis.Analyze(r.Context(), analysisReq)
	if err != nil {
		// Never block email delivery on AI failure
		h.logger.Error().Err(err).Str("email_id", req.EmailID).Msg("Analysis failed")
		h.jsonResponse(w, http.StatusOK, map[string]interface{}{
			"error":     err.Error(),
			"fallback":  true,
			"email_id":  req.EmailID,
			"summary":   "Analysis temporarily unavailable",
			"sentiment": "neutral",
			"priority":  0.5,
		})
		return
	}

	// Record usage if not cached
	if !result.Cached {
		// Rough token estimation for recording
		tokensUsed := estimatedTokens + len(result.Summary)/4
		if err := h.rateLimiter.RecordUsage(r.Context(), req.OrgID, req.UserID, tokensUsed); err != nil {
			h.logger.Warn().Err(err).Msg("Failed to record usage")
		}
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// EmbeddingRequest is the request body for embedding generation
type EmbeddingRequest struct {
	ID     string `json:"id"`
	Text   string `json:"text"`
	OrgID  string `json:"org_id"`
	UserID string `json:"user_id"`
}

// generateEmbedding handles single embedding requests
func (h *Handler) generateEmbedding(w http.ResponseWriter, r *http.Request) {
	var req EmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	// Validate
	if req.ID == "" || req.Text == "" {
		h.errorResponse(w, http.StatusBadRequest, "id and text are required")
		return
	}

	if req.OrgID == "" || req.UserID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	// Check rate limit
	estimatedTokens := len(req.Text) / 4
	limitResult, err := h.rateLimiter.CheckLimit(r.Context(), req.OrgID, req.UserID, estimatedTokens)
	if err != nil {
		h.logger.Warn().Err(err).Msg("Rate limit check failed")
	}

	if limitResult != nil && !limitResult.Allowed {
		w.Header().Set("Retry-After", string(rune(limitResult.RetryAfter)))
		h.errorResponse(w, http.StatusTooManyRequests, limitResult.Message)
		return
	}

	// Generate embedding
	embReq := &embedding.EmbeddingRequest{
		ID:     req.ID,
		Text:   req.Text,
		OrgID:  req.OrgID,
		UserID: req.UserID,
	}

	result, err := h.embedding.Generate(r.Context(), embReq)
	if err != nil {
		h.logger.Error().Err(err).Str("id", req.ID).Msg("Embedding generation failed")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate embedding: "+err.Error())
		return
	}

	// Record usage if not cached
	if !result.Cached {
		if err := h.rateLimiter.RecordUsage(r.Context(), req.OrgID, req.UserID, estimatedTokens); err != nil {
			h.logger.Warn().Err(err).Msg("Failed to record usage")
		}
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// BatchEmbeddingRequest is the request body for batch embedding
type BatchEmbeddingRequest struct {
	Items  []EmbeddingRequest `json:"items"`
	OrgID  string             `json:"org_id"`
	UserID string             `json:"user_id"`
}

// generateEmbeddingBatch handles batch embedding requests
func (h *Handler) generateEmbeddingBatch(w http.ResponseWriter, r *http.Request) {
	var req BatchEmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	// Validate
	if len(req.Items) == 0 {
		h.errorResponse(w, http.StatusBadRequest, "items array is required")
		return
	}

	if req.OrgID == "" || req.UserID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	// Estimate total tokens
	totalTokens := 0
	for _, item := range req.Items {
		totalTokens += len(item.Text) / 4
	}

	// Check rate limit
	limitResult, err := h.rateLimiter.CheckLimit(r.Context(), req.OrgID, req.UserID, totalTokens)
	if err != nil {
		h.logger.Warn().Err(err).Msg("Rate limit check failed")
	}

	if limitResult != nil && !limitResult.Allowed {
		w.Header().Set("Retry-After", string(rune(limitResult.RetryAfter)))
		h.errorResponse(w, http.StatusTooManyRequests, limitResult.Message)
		return
	}

	// Convert request items
	embItems := make([]embedding.EmbeddingRequest, len(req.Items))
	for i, item := range req.Items {
		embItems[i] = embedding.EmbeddingRequest{
			ID:     item.ID,
			Text:   item.Text,
			OrgID:  req.OrgID,
			UserID: req.UserID,
		}
	}

	// Generate embeddings
	batchReq := &embedding.BatchEmbeddingRequest{
		Items:  embItems,
		OrgID:  req.OrgID,
		UserID: req.UserID,
	}

	result, err := h.embedding.GenerateBatch(r.Context(), batchReq)
	if err != nil {
		h.logger.Error().Err(err).Msg("Batch embedding generation failed")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate embeddings: "+err.Error())
		return
	}

	// Record usage for non-cached items
	tokensUsed := (result.TotalCount - result.CachedCount) * (totalTokens / len(req.Items))
	if tokensUsed > 0 {
		if err := h.rateLimiter.RecordUsage(r.Context(), req.OrgID, req.UserID, tokensUsed); err != nil {
			h.logger.Warn().Err(err).Msg("Failed to record usage")
		}
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// getUsageStats returns current usage statistics
func (h *Handler) getUsageStats(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	userID := r.URL.Query().Get("user_id")

	if orgID == "" || userID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	stats, err := h.rateLimiter.GetUsageStats(r.Context(), orgID, userID)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get usage stats: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// getProvidersStatus returns the health status of all providers
func (h *Handler) getProvidersStatus(w http.ResponseWriter, r *http.Request) {
	status := h.router.GetHealthStatus()
	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"providers": status,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// invalidateAnalysisCache invalidates cached analysis for an email
func (h *Handler) invalidateAnalysisCache(w http.ResponseWriter, r *http.Request) {
	emailID := chi.URLParam(r, "emailID")
	if emailID == "" {
		h.errorResponse(w, http.StatusBadRequest, "emailID is required")
		return
	}

	if err := h.analysis.InvalidateCache(r.Context(), emailID); err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to invalidate cache: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status":   "ok",
		"email_id": emailID,
	})
}

// invalidateEmbeddingCache invalidates cached embeddings for an ID
func (h *Handler) invalidateEmbeddingCache(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.errorResponse(w, http.StatusBadRequest, "id is required")
		return
	}

	if err := h.embedding.InvalidateCache(r.Context(), id); err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to invalidate cache: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "ok",
		"id":     id,
	})
}

// Helper methods

func (h *Handler) jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) errorResponse(w http.ResponseWriter, status int, message string) {
	h.jsonResponse(w, status, map[string]string{
		"error": message,
	})
}
