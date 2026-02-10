package handler

import (
	"encoding/json"
	"net/http"

	"transactional-api/middleware"
	"transactional-api/models"
	"transactional-api/repository"
)

// listTemplates handles GET /api/v1/templates
func (h *Handler) listTemplates(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	query := &models.TemplateQuery{
		DomainID: apiKey.DomainID,
		Limit:    h.parseInt(r, "limit", 20),
		Offset:   h.parseInt(r, "offset", 0),
		Category: r.URL.Query().Get("category"),
		Search:   r.URL.Query().Get("search"),
	}

	if activeStr := r.URL.Query().Get("active"); activeStr != "" {
		active := h.parseBool(r, "active", true)
		query.Active = &active
	}

	resp, err := h.templateService.List(r.Context(), apiKey.DomainID, query)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to list templates")
		h.errorResponse(w, http.StatusInternalServerError, "list_failed", "Failed to list templates")
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// getTemplate handles GET /api/v1/templates/{id}
func (h *Handler) getTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	tmpl, err := h.templateService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrTemplateNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Template not found")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to get template")
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get template")
		return
	}

	// Verify domain access
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey != nil && tmpl.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	h.jsonResponse(w, http.StatusOK, tmpl)
}

// createTemplate handles POST /api/v1/templates
func (h *Handler) createTemplate(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.validationError(w, err)
		return
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	tmpl, err := h.templateService.Create(r.Context(), apiKey.DomainID, &req, apiKey.CreatedBy)
	if err != nil {
		if err == repository.ErrTemplateNameExists {
			h.errorResponse(w, http.StatusConflict, "name_exists", "Template with this name already exists")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to create template")
		h.errorResponse(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusCreated, tmpl)
}

// updateTemplate handles PUT /api/v1/templates/{id}
func (h *Handler) updateTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	var req models.UpdateTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.validationError(w, err)
		return
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	tmpl, err := h.templateService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrTemplateNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Template not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get template")
		return
	}

	if tmpl.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	err = h.templateService.Update(r.Context(), id, &req, apiKey.CreatedBy)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to update template")
		h.errorResponse(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}

	// Get updated template
	updated, _ := h.templateService.Get(r.Context(), id)
	h.jsonResponse(w, http.StatusOK, updated)
}

// deleteTemplate handles DELETE /api/v1/templates/{id}
func (h *Handler) deleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	tmpl, err := h.templateService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrTemplateNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Template not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get template")
		return
	}

	if tmpl.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	err = h.templateService.Delete(r.Context(), id)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to delete template")
		h.errorResponse(w, http.StatusInternalServerError, "delete_failed", "Failed to delete template")
		return
	}

	h.jsonResponse(w, http.StatusNoContent, nil)
}

// renderTemplate handles POST /api/v1/templates/{id}/render
func (h *Handler) renderTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	var req struct {
		Substitutions map[string]any `json:"substitutions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	tmpl, err := h.templateService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrTemplateNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Template not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get template")
		return
	}

	if tmpl.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	rendered, err := h.templateService.Render(r.Context(), id, req.Substitutions)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to render template")
		h.errorResponse(w, http.StatusInternalServerError, "render_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, rendered)
}

// cloneTemplate handles POST /api/v1/templates/{id}/clone
func (h *Handler) cloneTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	var req models.CloneTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.validationError(w, err)
		return
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	tmpl, err := h.templateService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrTemplateNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Template not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get template")
		return
	}

	if tmpl.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	cloned, err := h.templateService.Clone(r.Context(), id, req.Name, apiKey.CreatedBy)
	if err != nil {
		if err == repository.ErrTemplateNameExists {
			h.errorResponse(w, http.StatusConflict, "name_exists", "Template with this name already exists")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to clone template")
		h.errorResponse(w, http.StatusInternalServerError, "clone_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusCreated, cloned)
}

// getTemplateVersions handles GET /api/v1/templates/{id}/versions
func (h *Handler) getTemplateVersions(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	tmpl, err := h.templateService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrTemplateNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Template not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get template")
		return
	}

	if tmpl.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	versions, err := h.templateService.GetVersions(r.Context(), id)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get template versions")
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get versions")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"versions": versions,
	})
}

// previewTemplate handles POST /api/v1/templates/preview
func (h *Handler) previewTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Subject       string         `json:"subject"`
		HTMLContent   string         `json:"html_content"`
		TextContent   string         `json:"text_content"`
		Substitutions map[string]any `json:"substitutions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	rendered, err := h.templateService.Preview(r.Context(), req.Subject, req.HTMLContent, req.TextContent, req.Substitutions)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to preview template")
		h.errorResponse(w, http.StatusBadRequest, "preview_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, rendered)
}
