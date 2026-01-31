package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"transactional-api/middleware"
	"transactional-api/models"
	"transactional-api/service"
)

var validate = validator.New()

type SendHandler struct {
	emailService *service.EmailService
	logger       *zap.Logger
}

func NewSendHandler(emailService *service.EmailService, logger *zap.Logger) *SendHandler {
	return &SendHandler{
		emailService: emailService,
		logger:       logger,
	}
}

func (h *SendHandler) Send(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)

	var req models.SendEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if err := validate.Struct(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Validate that we have content
	if req.TextBody == "" && req.HTMLBody == "" && req.TemplateID == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Must provide text_body, html_body, or template_id"})
		return
	}

	result, err := h.emailService.Send(r.Context(), orgID, &req)
	if err != nil {
		h.logger.Error("Failed to send email", zap.Error(err))
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusAccepted, result)
}

func (h *SendHandler) SendBatch(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)

	var req models.BatchSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if err := validate.Struct(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if len(req.Messages) > 1000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Batch size exceeds maximum of 1000"})
		return
	}

	result, err := h.emailService.SendBatch(r.Context(), orgID, &req)
	if err != nil {
		h.logger.Error("Failed to send batch", zap.Error(err))
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusAccepted, result)
}

// Template Handler
type TemplateHandler struct {
	repo   *repository.TemplateRepository
	logger *zap.Logger
}

func NewTemplateHandler(repo *repository.TemplateRepository, logger *zap.Logger) *TemplateHandler {
	return &TemplateHandler{repo: repo, logger: logger}
}

func (h *TemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	page, pageSize := getPagination(r)

	templates, total, err := h.repo.List(r.Context(), orgID, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[*models.Template]{
		Data:       templates,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *TemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)

	var req models.CreateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if err := validate.Struct(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	template, err := h.repo.Create(r.Context(), orgID, &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, template)
}

func (h *TemplateHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	templateID, err := uuid.Parse(chi.URLParam(r, "templateId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid template ID"})
		return
	}

	template, err := h.repo.GetByID(r.Context(), templateID, orgID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, template)
}

func (h *TemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	templateID, err := uuid.Parse(chi.URLParam(r, "templateId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid template ID"})
		return
	}

	var req models.UpdateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	template, err := h.repo.Update(r.Context(), templateID, orgID, &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, template)
}

func (h *TemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	templateID, err := uuid.Parse(chi.URLParam(r, "templateId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid template ID"})
		return
	}

	if err := h.repo.Delete(r.Context(), templateID, orgID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *TemplateHandler) ListVersions(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	templateID, err := uuid.Parse(chi.URLParam(r, "templateId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid template ID"})
		return
	}
	page, pageSize := getPagination(r)

	versions, total, err := h.repo.ListVersions(r.Context(), templateID, orgID, pageSize, (page-1)*pageSize)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.PaginatedResponse[*models.TemplateVersion]{
		Data:       versions,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
		TotalPages: int((total + int64(pageSize) - 1) / int64(pageSize)),
	})
}

func (h *TemplateHandler) CreateVersion(w http.ResponseWriter, r *http.Request) {
	orgID := r.Context().Value(middleware.ContextKeyOrgID).(uuid.UUID)
	templateID, err := uuid.Parse(chi.URLParam(r, "templateId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid template ID"})
		return
	}

	var req models.CreateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	version, err := h.repo.CreateVersion(r.Context(), templateID, orgID, &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, version)
}

// Helper functions
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func getPagination(r *http.Request) (int, int) {
	page := 1
	pageSize := 20

	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := r.URL.Query().Get("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 && v <= 100 {
			pageSize = v
		}
	}

	return page, pageSize
}

// Import for repository
type repository struct{}

var _ = repository{}

import "transactional-api/repository"
