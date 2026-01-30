package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/enterprise-email/ai-assistant/analysis"
	"github.com/enterprise-email/ai-assistant/autoreply"
	"github.com/enterprise-email/ai-assistant/draft"
	"github.com/enterprise-email/ai-assistant/embedding"
	"github.com/enterprise-email/ai-assistant/priority"
	"github.com/enterprise-email/ai-assistant/provider"
	"github.com/enterprise-email/ai-assistant/ratelimit"
	"github.com/enterprise-email/ai-assistant/smartreply"
	"github.com/enterprise-email/ai-assistant/summarization"
)

// Handler handles all HTTP requests
type Handler struct {
	router        *provider.Router
	analysis      *analysis.Service
	embedding     *embedding.Service
	smartReply    *smartreply.Service
	autoReply     *autoreply.Service
	summarization *summarization.Service
	draftAssist   *draft.Service
	priority      *priority.Service
	rateLimiter   *ratelimit.Limiter
	logger        zerolog.Logger
}

// NewHandler creates a new handler instance
func NewHandler(
	router *provider.Router,
	analysisSvc *analysis.Service,
	embeddingSvc *embedding.Service,
	smartReplySvc *smartreply.Service,
	autoReplySvc *autoreply.Service,
	summarizationSvc *summarization.Service,
	draftSvc *draft.Service,
	prioritySvc *priority.Service,
	limiter *ratelimit.Limiter,
	logger zerolog.Logger,
) *Handler {
	return &Handler{
		router:        router,
		analysis:      analysisSvc,
		embedding:     embeddingSvc,
		smartReply:    smartReplySvc,
		autoReply:     autoReplySvc,
		summarization: summarizationSvc,
		draftAssist:   draftSvc,
		priority:      prioritySvc,
		rateLimiter:   limiter,
		logger:        logger.With().Str("component", "handler").Logger(),
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
		// Core AI endpoints
		r.Route("/ai", func(r chi.Router) {
			r.Post("/analyze", h.analyzeEmail)
			r.Post("/embeddings", h.generateEmbedding)
			r.Post("/embeddings/batch", h.generateEmbeddingBatch)

			// Smart Reply
			r.Post("/smart-reply", h.generateSmartReplies)

			// Auto-Reply Agent
			r.Route("/auto-reply", func(r chi.Router) {
				r.Post("/evaluate", h.evaluateAutoReply)
				r.Post("/generate", h.generateAutoReply)
				r.Post("/rules/validate", h.validateAutoReplyRule)
				r.Get("/stats/{userID}", h.getAutoReplyStats)
				r.Get("/audit/{userID}", h.getAutoReplyAuditLog)
			})

			// Summarization
			r.Route("/summarize", func(r chi.Router) {
				r.Post("/email", h.summarizeEmail)
				r.Post("/thread", h.summarizeThread)
				r.Post("/daily", h.generateDailySummary)
			})

			// Draft Assistant
			r.Route("/draft", func(r chi.Router) {
				r.Post("/suggest", h.getInlineSuggestion)
				r.Post("/help-me-write", h.helpMeWrite)
				r.Post("/adjust-tone", h.adjustTone)
				r.Post("/grammar-check", h.checkGrammar)
			})

			// Priority Detection
			r.Route("/priority", func(r chi.Router) {
				r.Post("/detect", h.detectPriority)
				r.Post("/detect/batch", h.detectPriorityBatch)
			})
		})

		// Usage and stats
		r.Get("/usage", h.getUsageStats)

		// Provider health
		r.Get("/providers/status", h.getProvidersStatus)

		// Cache management
		r.Delete("/cache/analysis/{emailID}", h.invalidateAnalysisCache)
		r.Delete("/cache/embeddings/{id}", h.invalidateEmbeddingCache)
		r.Delete("/cache/smart-reply/{emailID}", h.invalidateSmartReplyCache)
		r.Delete("/cache/summary/{type}/{id}", h.invalidateSummaryCache)
		r.Delete("/cache/priority/{emailID}", h.invalidatePriorityCache)
	})

	return r
}

// ============================================================
// HEALTH CHECKS
// ============================================================

func (h *Handler) healthCheck(w http.ResponseWriter, r *http.Request) {
	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":  "healthy",
		"service": "ai-assistant",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *Handler) readinessCheck(w http.ResponseWriter, r *http.Request) {
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

// ============================================================
// SMART REPLY HANDLERS
// ============================================================

func (h *Handler) generateSmartReplies(w http.ResponseWriter, r *http.Request) {
	var req smartreply.SmartReplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.EmailID == "" || req.Body == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id and body are required")
		return
	}

	if req.OrgID == "" || req.UserID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	// Check rate limit
	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, len(req.Body)/4); err != nil {
		return
	}

	result, err := h.smartReply.GenerateReplies(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Str("email_id", req.EmailID).Msg("Smart reply generation failed")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate replies: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// ============================================================
// AUTO-REPLY HANDLERS
// ============================================================

func (h *Handler) evaluateAutoReply(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email autoreply.EmailContext `json:"email"`
		Rules []autoreply.Rule       `json:"rules"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	result, err := h.autoReply.EvaluateRules(r.Context(), &req.Email, req.Rules)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to evaluate rules: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) generateAutoReply(w http.ResponseWriter, r *http.Request) {
	var req autoreply.GenerateReplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Rule == nil || req.Email == nil {
		h.errorResponse(w, http.StatusBadRequest, "rule and email are required")
		return
	}

	result, err := h.autoReply.GenerateReply(r.Context(), &req)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate reply: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) validateAutoReplyRule(w http.ResponseWriter, r *http.Request) {
	var rule autoreply.Rule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	errors := autoreply.ValidateRule(&rule)
	if len(errors) > 0 {
		h.jsonResponse(w, http.StatusBadRequest, map[string]interface{}{
			"valid":  false,
			"errors": errors,
		})
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"valid":  true,
		"errors": []string{},
	})
}

func (h *Handler) getAutoReplyStats(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if userID == "" {
		h.errorResponse(w, http.StatusBadRequest, "userID is required")
		return
	}

	stats, err := h.autoReply.GetDailyStats(r.Context(), userID)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get stats: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

func (h *Handler) getAutoReplyAuditLog(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if userID == "" {
		h.errorResponse(w, http.StatusBadRequest, "userID is required")
		return
	}

	// Parse pagination params
	limit := 50
	offset := 0
	// Could parse from query params

	entries, err := h.autoReply.GetAuditLog(r.Context(), userID, limit, offset)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get audit log: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
		"limit":   limit,
		"offset":  offset,
	})
}

// ============================================================
// SUMMARIZATION HANDLERS
// ============================================================

func (h *Handler) summarizeEmail(w http.ResponseWriter, r *http.Request) {
	var req summarization.EmailSummaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.EmailID == "" || req.Body == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id and body are required")
		return
	}

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, len(req.Body)/4); err != nil {
		return
	}

	result, err := h.summarization.SummarizeEmail(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Str("email_id", req.EmailID).Msg("Email summarization failed")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to summarize: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) summarizeThread(w http.ResponseWriter, r *http.Request) {
	var req summarization.ThreadSummaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.ThreadID == "" || len(req.Messages) == 0 {
		h.errorResponse(w, http.StatusBadRequest, "thread_id and messages are required")
		return
	}

	// Estimate tokens from all messages
	totalChars := 0
	for _, msg := range req.Messages {
		totalChars += len(msg.Body)
	}

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, totalChars/4); err != nil {
		return
	}

	result, err := h.summarization.SummarizeThread(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Str("thread_id", req.ThreadID).Msg("Thread summarization failed")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to summarize thread: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) generateDailySummary(w http.ResponseWriter, r *http.Request) {
	var req summarization.DailySummaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.UserID == "" || req.OrgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "user_id and org_id are required")
		return
	}

	// Estimate tokens
	totalChars := 0
	for _, email := range req.Emails {
		totalChars += len(email.Preview) + len(email.Subject)
	}

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, totalChars/4); err != nil {
		return
	}

	result, err := h.summarization.GenerateDailySummary(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Str("user_id", req.UserID).Msg("Daily summary generation failed")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate daily summary: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// ============================================================
// DRAFT ASSISTANT HANDLERS
// ============================================================

func (h *Handler) getInlineSuggestion(w http.ResponseWriter, r *http.Request) {
	var req draft.InlineSuggestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.CurrentText == "" {
		h.errorResponse(w, http.StatusBadRequest, "current_text is required")
		return
	}

	// Light rate limit for suggestions
	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, 50); err != nil {
		return
	}

	result, err := h.draftAssist.GetInlineSuggestion(r.Context(), &req)
	if err != nil {
		// Don't error on suggestion failure, just return empty
		h.jsonResponse(w, http.StatusOK, draft.InlineSuggestionResponse{
			Suggestion: "",
			Confidence: 0,
		})
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) helpMeWrite(w http.ResponseWriter, r *http.Request) {
	var req draft.HelpMeWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Prompt == "" {
		h.errorResponse(w, http.StatusBadRequest, "prompt is required")
		return
	}

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, 500); err != nil {
		return
	}

	result, err := h.draftAssist.HelpMeWrite(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Help me write failed")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate draft: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) adjustTone(w http.ResponseWriter, r *http.Request) {
	var req draft.ToneAdjustRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Text == "" || req.TargetTone == "" {
		h.errorResponse(w, http.StatusBadRequest, "text and target_tone are required")
		return
	}

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, len(req.Text)/4); err != nil {
		return
	}

	result, err := h.draftAssist.AdjustTone(r.Context(), &req)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to adjust tone: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) checkGrammar(w http.ResponseWriter, r *http.Request) {
	var req draft.GrammarCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.Text == "" {
		h.errorResponse(w, http.StatusBadRequest, "text is required")
		return
	}

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, len(req.Text)/4); err != nil {
		return
	}

	result, err := h.draftAssist.CheckGrammar(r.Context(), &req)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to check grammar: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// ============================================================
// PRIORITY DETECTION HANDLERS
// ============================================================

func (h *Handler) detectPriority(w http.ResponseWriter, r *http.Request) {
	var req priority.DetectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.EmailID == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id is required")
		return
	}

	result, err := h.priority.DetectPriority(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Str("email_id", req.EmailID).Msg("Priority detection failed")
		// Return default priority on error
		h.jsonResponse(w, http.StatusOK, priority.DetectionResponse{
			EmailID:   req.EmailID,
			Level:     priority.LevelNormal,
			Indicator: priority.IndicatorNormal,
			Score:     0.3,
		})
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) detectPriorityBatch(w http.ResponseWriter, r *http.Request) {
	var req priority.BatchDetectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if len(req.Emails) == 0 {
		h.errorResponse(w, http.StatusBadRequest, "emails array is required")
		return
	}

	result, err := h.priority.DetectPriorityBatch(r.Context(), &req)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to detect priorities: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// ============================================================
// EXISTING HANDLERS (Analysis, Embeddings, etc.)
// ============================================================

// AnalyzeRequest is the request body for email analysis
type AnalyzeRequest struct {
	EmailID        string   `json:"email_id"`
	Subject        string   `json:"subject"`
	Body           string   `json:"body"`
	FromAddress    string   `json:"from_address"`
	FromName       string   `json:"from_name"`
	ToAddresses    []string `json:"to_addresses"`
	CcAddresses    []string `json:"cc_addresses"`
	Date           string   `json:"date"`
	HasAttachments bool     `json:"has_attachments"`
	UserID         string   `json:"user_id"`
	OrgID          string   `json:"org_id"`
	UserName       string   `json:"user_name"`
	UserEmail      string   `json:"user_email"`
	ExtractActionItems bool `json:"extract_action_items"`
	DetectQuestions    bool `json:"detect_questions"`
	SkipCache          bool `json:"skip_cache"`
}

func (h *Handler) analyzeEmail(w http.ResponseWriter, r *http.Request) {
	var req AnalyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.EmailID == "" || req.Body == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id and body are required")
		return
	}

	if req.OrgID == "" || req.UserID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	estimatedTokens := (len(req.Body) + len(req.Subject)) / 4

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, estimatedTokens); err != nil {
		return
	}

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

	if !result.Cached {
		tokensUsed := estimatedTokens + len(result.Summary)/4
		h.rateLimiter.RecordUsage(r.Context(), req.OrgID, req.UserID, tokensUsed)
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

func (h *Handler) generateEmbedding(w http.ResponseWriter, r *http.Request) {
	var req EmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if req.ID == "" || req.Text == "" {
		h.errorResponse(w, http.StatusBadRequest, "id and text are required")
		return
	}

	if req.OrgID == "" || req.UserID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	estimatedTokens := len(req.Text) / 4
	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, estimatedTokens); err != nil {
		return
	}

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

	if !result.Cached {
		h.rateLimiter.RecordUsage(r.Context(), req.OrgID, req.UserID, estimatedTokens)
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// BatchEmbeddingRequest is the request body for batch embedding
type BatchEmbeddingRequest struct {
	Items  []EmbeddingRequest `json:"items"`
	OrgID  string             `json:"org_id"`
	UserID string             `json:"user_id"`
}

func (h *Handler) generateEmbeddingBatch(w http.ResponseWriter, r *http.Request) {
	var req BatchEmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if len(req.Items) == 0 {
		h.errorResponse(w, http.StatusBadRequest, "items array is required")
		return
	}

	if req.OrgID == "" || req.UserID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and user_id are required")
		return
	}

	totalTokens := 0
	for _, item := range req.Items {
		totalTokens += len(item.Text) / 4
	}

	if err := h.checkRateLimit(r.Context(), w, req.OrgID, req.UserID, totalTokens); err != nil {
		return
	}

	embItems := make([]embedding.EmbeddingRequest, len(req.Items))
	for i, item := range req.Items {
		embItems[i] = embedding.EmbeddingRequest{
			ID:     item.ID,
			Text:   item.Text,
			OrgID:  req.OrgID,
			UserID: req.UserID,
		}
	}

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

	tokensUsed := (result.TotalCount - result.CachedCount) * (totalTokens / len(req.Items))
	if tokensUsed > 0 {
		h.rateLimiter.RecordUsage(r.Context(), req.OrgID, req.UserID, tokensUsed)
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// ============================================================
// USAGE & PROVIDER STATS
// ============================================================

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

func (h *Handler) getProvidersStatus(w http.ResponseWriter, r *http.Request) {
	status := h.router.GetHealthStatus()
	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"providers": status,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// ============================================================
// CACHE INVALIDATION
// ============================================================

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

	h.jsonResponse(w, http.StatusOK, map[string]string{"status": "ok", "email_id": emailID})
}

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

	h.jsonResponse(w, http.StatusOK, map[string]string{"status": "ok", "id": id})
}

func (h *Handler) invalidateSmartReplyCache(w http.ResponseWriter, r *http.Request) {
	emailID := chi.URLParam(r, "emailID")
	if emailID == "" {
		h.errorResponse(w, http.StatusBadRequest, "emailID is required")
		return
	}

	if err := h.smartReply.InvalidateCache(r.Context(), emailID); err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to invalidate cache: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{"status": "ok", "email_id": emailID})
}

func (h *Handler) invalidateSummaryCache(w http.ResponseWriter, r *http.Request) {
	cacheType := chi.URLParam(r, "type") // "email" or "thread"
	id := chi.URLParam(r, "id")
	if id == "" {
		h.errorResponse(w, http.StatusBadRequest, "id is required")
		return
	}

	if err := h.summarization.InvalidateCache(r.Context(), cacheType, id); err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to invalidate cache: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{"status": "ok", "type": cacheType, "id": id})
}

func (h *Handler) invalidatePriorityCache(w http.ResponseWriter, r *http.Request) {
	emailID := chi.URLParam(r, "emailID")
	if emailID == "" {
		h.errorResponse(w, http.StatusBadRequest, "emailID is required")
		return
	}

	if err := h.priority.InvalidateCache(r.Context(), emailID); err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to invalidate cache: "+err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{"status": "ok", "email_id": emailID})
}

// ============================================================
// HELPERS
// ============================================================

func (h *Handler) checkRateLimit(ctx context.Context, w http.ResponseWriter, orgID, userID string, tokens int) error {
	limitResult, err := h.rateLimiter.CheckLimit(ctx, orgID, userID, tokens)
	if err != nil {
		h.logger.Warn().Err(err).Msg("Rate limit check failed")
		return nil // Don't block on rate limit errors
	}

	if limitResult != nil && !limitResult.Allowed {
		w.Header().Set("Retry-After", string(rune(limitResult.RetryAfter)))
		h.errorResponse(w, http.StatusTooManyRequests, limitResult.Message)
		return err
	}

	return nil
}

func (h *Handler) jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) errorResponse(w http.ResponseWriter, status int, message string) {
	h.jsonResponse(w, status, map[string]string{"error": message})
}
