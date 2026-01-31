package handler

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/artpromedia/email/services/transactional-api/middleware"
	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/go-chi/chi/v5"
)

// listSuppressions handles GET /api/v1/suppressions
func (h *Handler) listSuppressions(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	query := &models.SuppressionQuery{
		DomainID: apiKey.DomainID,
		Limit:    h.parseInt(r, "limit", 20),
		Offset:   h.parseInt(r, "offset", 0),
		Email:    r.URL.Query().Get("email"),
	}

	if reason := r.URL.Query().Get("reason"); reason != "" {
		r := models.SuppressionReason(reason)
		query.Reason = &r
	}

	resp, err := h.suppressionService.List(r.Context(), query)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to list suppressions")
		h.errorResponse(w, http.StatusInternalServerError, "list_failed", "Failed to list suppressions")
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// getSuppression handles GET /api/v1/suppressions/{email}
func (h *Handler) getSuppression(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	email, err := url.PathUnescape(chi.URLParam(r, "email"))
	if err != nil || email == "" {
		h.errorResponse(w, http.StatusBadRequest, "invalid_email", "Invalid email parameter")
		return
	}

	suppression, err := h.suppressionService.Get(r.Context(), apiKey.DomainID, email)
	if err != nil {
		if err == repository.ErrSuppressionNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Email not found in suppression list")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to get suppression")
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get suppression")
		return
	}

	h.jsonResponse(w, http.StatusOK, suppression)
}

// addSuppression handles POST /api/v1/suppressions
func (h *Handler) addSuppression(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSuppressionRequest
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

	suppression, err := h.suppressionService.Add(r.Context(), apiKey.DomainID, &req, &apiKey.CreatedBy)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to add suppression")
		h.errorResponse(w, http.StatusInternalServerError, "add_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusCreated, suppression)
}

// addBulkSuppression handles POST /api/v1/suppressions/bulk
func (h *Handler) addBulkSuppression(w http.ResponseWriter, r *http.Request) {
	var req models.BulkSuppressionRequest
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

	resp, err := h.suppressionService.AddBulk(r.Context(), apiKey.DomainID, &req, &apiKey.CreatedBy)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to add bulk suppression")
		h.errorResponse(w, http.StatusInternalServerError, "add_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// checkSuppressions handles POST /api/v1/suppressions/check
func (h *Handler) checkSuppressions(w http.ResponseWriter, r *http.Request) {
	var req models.CheckSuppressionRequest
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

	resp, err := h.suppressionService.CheckMultiple(r.Context(), apiKey.DomainID, req.Emails)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to check suppressions")
		h.errorResponse(w, http.StatusInternalServerError, "check_failed", "Failed to check suppressions")
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// removeSuppression handles DELETE /api/v1/suppressions/{email}
func (h *Handler) removeSuppression(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	email, err := url.PathUnescape(chi.URLParam(r, "email"))
	if err != nil || email == "" {
		h.errorResponse(w, http.StatusBadRequest, "invalid_email", "Invalid email parameter")
		return
	}

	err = h.suppressionService.Remove(r.Context(), apiKey.DomainID, email)
	if err != nil {
		if err == repository.ErrSuppressionNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Email not found in suppression list")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to remove suppression")
		h.errorResponse(w, http.StatusInternalServerError, "remove_failed", "Failed to remove suppression")
		return
	}

	h.jsonResponse(w, http.StatusNoContent, nil)
}

// getSuppressionStats handles GET /api/v1/suppressions/stats
func (h *Handler) getSuppressionStats(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	stats, err := h.suppressionService.GetStats(r.Context(), apiKey.DomainID)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get suppression stats")
		h.errorResponse(w, http.StatusInternalServerError, "stats_failed", "Failed to get statistics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// listUnsubscribeGroups handles GET /api/v1/groups
func (h *Handler) listUnsubscribeGroups(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	groups, err := h.suppressionService.GetGroups(r.Context(), apiKey.DomainID)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to list unsubscribe groups")
		h.errorResponse(w, http.StatusInternalServerError, "list_failed", "Failed to list groups")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"groups": groups,
	})
}

// createUnsubscribeGroup handles POST /api/v1/groups
func (h *Handler) createUnsubscribeGroup(w http.ResponseWriter, r *http.Request) {
	var req models.CreateUnsubscribeGroupRequest
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

	group, err := h.suppressionService.CreateGroup(r.Context(), apiKey.DomainID, &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to create unsubscribe group")
		h.errorResponse(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusCreated, group)
}
