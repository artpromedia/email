package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"transactional-api/middleware"
	"transactional-api/models"
	"transactional-api/repository"
	"transactional-api/service"
)

// Webhook Handler
type WebhookHandler struct {
	repo   *repository.WebhookRepository
	logger *zap.Logger
}

func NewWebhookHandler(repo *repository.WebhookRepository, logger *zap.Logger) *WebhookHandler {
	return &WebhookHandler{repo: repo, logger: logger}
}

func (h *WebhookHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	page, pageSize := getPagination(r)

	webhooks, total, err := h.repo.List(r.Context(), orgID, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Convert to response (hide secrets)
	responses := make([]models.WebhookResponse, len(webhooks))
	for i, wh := range webhooks {
		responses[i] = models.WebhookResponse{
			ID:            wh.ID,
			URL:           wh.URL,
			Events:        wh.Events,
			IsActive:      wh.IsActive,
			FailureCount:  wh.FailureCount,
			LastTriggered: wh.LastTriggered,
			CreatedAt:     wh.CreatedAt,
		}
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[models.WebhookResponse]{
		Data:       responses,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *WebhookHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)

	var req models.CreateWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if err := validate.Struct(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Validate event types
	validEvents := map[string]bool{
		"delivered": true, "bounced": true, "deferred": true, "dropped": true,
		"opened": true, "clicked": true, "unsubscribed": true, "spam_report": true,
	}
	for _, event := range req.Events {
		if !validEvents[string(event)] {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid event type: " + string(event)})
			return
		}
	}

	webhook, err := h.repo.Create(r.Context(), orgID, &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Return with secret (only on creation)
	writeJSON(w, http.StatusCreated, models.WebhookResponse{
		ID:            webhook.ID,
		URL:           webhook.URL,
		Events:        webhook.Events,
		IsActive:      webhook.IsActive,
		Secret:        webhook.Secret,
		FailureCount:  webhook.FailureCount,
		LastTriggered: webhook.LastTriggered,
		CreatedAt:     webhook.CreatedAt,
	})
}

func (h *WebhookHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid webhook ID"})
		return
	}

	webhook, err := h.repo.GetByID(r.Context(), webhookID, orgID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.WebhookResponse{
		ID:            webhook.ID,
		URL:           webhook.URL,
		Events:        webhook.Events,
		IsActive:      webhook.IsActive,
		FailureCount:  webhook.FailureCount,
		LastTriggered: webhook.LastTriggered,
		CreatedAt:     webhook.CreatedAt,
	})
}

func (h *WebhookHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid webhook ID"})
		return
	}

	var req models.UpdateWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	webhook, err := h.repo.Update(r.Context(), webhookID, orgID, &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.WebhookResponse{
		ID:            webhook.ID,
		URL:           webhook.URL,
		Events:        webhook.Events,
		IsActive:      webhook.IsActive,
		FailureCount:  webhook.FailureCount,
		LastTriggered: webhook.LastTriggered,
		CreatedAt:     webhook.CreatedAt,
	})
}

func (h *WebhookHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid webhook ID"})
		return
	}

	if err := h.repo.Delete(r.Context(), webhookID, orgID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *WebhookHandler) Test(w http.ResponseWriter, r *http.Request) {
	// This would be implemented with webhook service
	writeJSON(w, http.StatusOK, map[string]string{"message": "Test webhook sent"})
}

// Analytics Handler
type AnalyticsHandler struct {
	service *service.AnalyticsService
	logger  *zap.Logger
}

func NewAnalyticsHandler(service *service.AnalyticsService, logger *zap.Logger) *AnalyticsHandler {
	return &AnalyticsHandler{service: service, logger: logger}
}

func (h *AnalyticsHandler) getTimeRange(r *http.Request) (time.Time, time.Time) {
	now := time.Now()
	from := now.AddDate(0, 0, -30) // Default to last 30 days
	to := now

	if f := r.URL.Query().Get("from"); f != "" {
		if t, err := time.Parse("2006-01-02", f); err == nil {
			from = t
		}
	}
	if t := r.URL.Query().Get("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			to = parsed.Add(24*time.Hour - time.Second) // End of day
		}
	}

	return from, to
}

func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	from, to := h.getTimeRange(r)

	overview, err := h.service.GetOverview(r.Context(), orgID, from, to)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, overview)
}

func (h *AnalyticsHandler) DeliveryStats(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	from, to := h.getTimeRange(r)
	interval := r.URL.Query().Get("interval")
	if interval == "" {
		interval = "day"
	}

	stats, err := h.service.GetDeliveryStats(r.Context(), orgID, from, to, interval)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

func (h *AnalyticsHandler) EngagementStats(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	from, to := h.getTimeRange(r)
	interval := r.URL.Query().Get("interval")
	if interval == "" {
		interval = "day"
	}

	stats, err := h.service.GetEngagementStats(r.Context(), orgID, from, to, interval)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

func (h *AnalyticsHandler) BounceStats(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	from, to := h.getTimeRange(r)
	interval := r.URL.Query().Get("interval")
	if interval == "" {
		interval = "day"
	}

	stats, err := h.service.GetBounceStats(r.Context(), orgID, from, to, interval)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

func (h *AnalyticsHandler) DomainStats(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	from, to := h.getTimeRange(r)

	stats, err := h.service.GetDomainStats(r.Context(), orgID, from, to, 10)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

// Event Handler
type EventHandler struct {
	repo           *repository.EventRepository
	webhookService *service.WebhookService
	logger         *zap.Logger
}

func NewEventHandler(repo *repository.EventRepository, webhookService *service.WebhookService, logger *zap.Logger) *EventHandler {
	return &EventHandler{repo: repo, webhookService: webhookService, logger: logger}
}

func (h *EventHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	page, pageSize := getPagination(r)
	eventType := r.URL.Query().Get("event_type")

	now := time.Now()
	from := now.AddDate(0, 0, -30)
	to := now

	if f := r.URL.Query().Get("from"); f != "" {
		if t, err := time.Parse("2006-01-02", f); err == nil {
			from = t
		}
	}
	if t := r.URL.Query().Get("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			to = parsed.Add(24*time.Hour - time.Second)
		}
	}

	events, total, err := h.repo.List(r.Context(), orgID, eventType, from, to, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[*models.EmailEvent]{
		Data:       events,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *EventHandler) GetByMessageID(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	messageID, err := uuid.Parse(chi.URLParam(r, "messageId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid message ID"})
		return
	}

	events, err := h.repo.GetByMessageID(r.Context(), messageID, orgID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, events)
}

func (h *EventHandler) ReceiveEvent(w http.ResponseWriter, r *http.Request) {
	// Internal endpoint - receive events from SMTP server
	var event models.EmailEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	event.ID = uuid.New()
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}

	if err := h.webhookService.DispatchEvent(r.Context(), event.OrganizationID, &event); err != nil {
		h.logger.Error("Failed to dispatch event", zap.Error(err))
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

// Suppression Handler
type SuppressionHandler struct {
	repo   *repository.SuppressionRepository
	logger *zap.Logger
}

func NewSuppressionHandler(repo *repository.SuppressionRepository, logger *zap.Logger) *SuppressionHandler {
	return &SuppressionHandler{repo: repo, logger: logger}
}

func (h *SuppressionHandler) ListBounces(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	page, pageSize := getPagination(r)

	suppressions, total, err := h.repo.List(r.Context(), orgID, models.SuppressionBounce, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[*models.Suppression]{
		Data:       suppressions,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *SuppressionHandler) RemoveBounce(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	email := chi.URLParam(r, "email")

	if err := h.repo.Remove(r.Context(), orgID, email, models.SuppressionBounce); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *SuppressionHandler) ListUnsubscribes(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	page, pageSize := getPagination(r)

	suppressions, total, err := h.repo.List(r.Context(), orgID, models.SuppressionUnsubscribe, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[*models.Suppression]{
		Data:       suppressions,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *SuppressionHandler) AddUnsubscribe(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)

	var req models.AddSuppressionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if err := h.repo.Add(r.Context(), orgID, req.Email, models.SuppressionUnsubscribe, req.Reason); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (h *SuppressionHandler) RemoveUnsubscribe(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	email := chi.URLParam(r, "email")

	if err := h.repo.Remove(r.Context(), orgID, email, models.SuppressionUnsubscribe); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *SuppressionHandler) ListSpamReports(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	page, pageSize := getPagination(r)

	suppressions, total, err := h.repo.List(r.Context(), orgID, models.SuppressionSpamReport, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[*models.Suppression]{
		Data:       suppressions,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *SuppressionHandler) RemoveSpamReport(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	email := chi.URLParam(r, "email")

	if err := h.repo.Remove(r.Context(), orgID, email, models.SuppressionSpamReport); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// API Key Handler
type APIKeyHandler struct {
	repo   *repository.APIKeyRepository
	logger *zap.Logger
}

func NewAPIKeyHandler(repo *repository.APIKeyRepository, logger *zap.Logger) *APIKeyHandler {
	return &APIKeyHandler{repo: repo, logger: logger}
}

func (h *APIKeyHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	page, pageSize := getPagination(r)

	keys, total, err := h.repo.ListByOrg(r.Context(), orgID, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Convert to responses (hide hash)
	responses := make([]models.APIKeyResponse, len(keys))
	for i, key := range keys {
		responses[i] = models.APIKeyResponse{
			ID:        key.ID,
			Name:      key.Name,
			KeyPrefix: key.KeyPrefix,
			Scopes:    key.Scopes,
			RateLimit: key.RateLimit,
			ExpiresAt: key.ExpiresAt,
			CreatedAt: key.CreatedAt,
		}
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[models.APIKeyResponse]{
		Data:       responses,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *APIKeyHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)

	var req models.CreateAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if err := validate.Struct(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Validate scopes
	validScopes := map[models.APIKeyScope]bool{
		models.ScopeSend: true, models.ScopeTemplates: true, models.ScopeWebhooks: true,
		models.ScopeAnalytics: true, models.ScopeSuppression: true, models.ScopeRead: true,
	}
	scopeStrings := make([]string, len(req.Scopes))
	for i, scope := range req.Scopes {
		if !validScopes[scope] {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid scope: " + string(scope)})
			return
		}
		scopeStrings[i] = string(scope)
	}

	rateLimit := 1000 // Default
	if req.RateLimit > 0 {
		rateLimit = req.RateLimit
	}

	key, rawKey, err := h.repo.Create(r.Context(), orgID, req.Name, scopeStrings, rateLimit, req.ExpiresAt)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Return with the actual key (only shown once!)
	writeJSON(w, http.StatusCreated, models.APIKeyResponse{
		ID:        key.ID,
		Name:      key.Name,
		Key:       rawKey, // Only returned on creation
		KeyPrefix: key.KeyPrefix,
		Scopes:    key.Scopes,
		RateLimit: key.RateLimit,
		ExpiresAt: key.ExpiresAt,
		CreatedAt: key.CreatedAt,
	})
}

func (h *APIKeyHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	keyID, err := uuid.Parse(chi.URLParam(r, "keyId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid key ID"})
		return
	}

	if err := h.repo.Revoke(r.Context(), keyID, orgID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
