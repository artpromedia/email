package handler

import (
	"encoding/json"
	"net/http"

	"transactional-api/middleware"
	"transactional-api/models"
	"transactional-api/repository"
)

// listWebhooks handles GET /api/v1/webhooks
func (h *Handler) listWebhooks(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	resp, err := h.webhookService.List(r.Context(), apiKey.DomainID)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to list webhooks")
		h.errorResponse(w, http.StatusInternalServerError, "list_failed", "Failed to list webhooks")
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// getWebhook handles GET /api/v1/webhooks/{id}
func (h *Handler) getWebhook(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	webhook, err := h.webhookService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrWebhookNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Webhook not found")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to get webhook")
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get webhook")
		return
	}

	// Verify domain access
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey != nil && webhook.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	h.jsonResponse(w, http.StatusOK, webhook)
}

// createWebhook handles POST /api/v1/webhooks
func (h *Handler) createWebhook(w http.ResponseWriter, r *http.Request) {
	var req models.CreateWebhookRequest
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

	webhook, err := h.webhookService.Create(r.Context(), apiKey.DomainID, &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to create webhook")
		h.errorResponse(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusCreated, webhook)
}

// updateWebhook handles PUT /api/v1/webhooks/{id}
func (h *Handler) updateWebhook(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	var req models.UpdateWebhookRequest
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
	webhook, err := h.webhookService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrWebhookNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Webhook not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get webhook")
		return
	}

	if webhook.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	err = h.webhookService.Update(r.Context(), id, &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to update webhook")
		h.errorResponse(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}

	// Get updated webhook
	updated, _ := h.webhookService.Get(r.Context(), id)
	h.jsonResponse(w, http.StatusOK, updated)
}

// deleteWebhook handles DELETE /api/v1/webhooks/{id}
func (h *Handler) deleteWebhook(w http.ResponseWriter, r *http.Request) {
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
	webhook, err := h.webhookService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrWebhookNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Webhook not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get webhook")
		return
	}

	if webhook.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	err = h.webhookService.Delete(r.Context(), id)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to delete webhook")
		h.errorResponse(w, http.StatusInternalServerError, "delete_failed", "Failed to delete webhook")
		return
	}

	h.jsonResponse(w, http.StatusNoContent, nil)
}

// testWebhook handles POST /api/v1/webhooks/{id}/test
func (h *Handler) testWebhook(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	var req models.TestWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Default to delivered event if no body
		req.EventType = models.WebhookEventDelivered
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	webhook, err := h.webhookService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrWebhookNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Webhook not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get webhook")
		return
	}

	if webhook.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	resp, err := h.webhookService.Test(r.Context(), id, req.EventType)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to test webhook")
		h.errorResponse(w, http.StatusInternalServerError, "test_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// rotateWebhookSecret handles POST /api/v1/webhooks/{id}/rotate-secret
func (h *Handler) rotateWebhookSecret(w http.ResponseWriter, r *http.Request) {
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
	webhook, err := h.webhookService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrWebhookNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Webhook not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get webhook")
		return
	}

	if webhook.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	resp, err := h.webhookService.RotateSecret(r.Context(), id)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to rotate webhook secret")
		h.errorResponse(w, http.StatusInternalServerError, "rotate_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// listWebhookDeliveries handles GET /api/v1/webhooks/{id}/deliveries
func (h *Handler) listWebhookDeliveries(w http.ResponseWriter, r *http.Request) {
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
	webhook, err := h.webhookService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrWebhookNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Webhook not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get webhook")
		return
	}

	if webhook.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	query := &models.WebhookDeliveryQuery{
		WebhookID: id,
		Limit:     h.parseInt(r, "limit", 20),
		Offset:    h.parseInt(r, "offset", 0),
	}

	if successStr := r.URL.Query().Get("success"); successStr != "" {
		success := h.parseBool(r, "success", true)
		query.Success = &success
	}

	resp, err := h.webhookService.ListDeliveries(r.Context(), query)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to list webhook deliveries")
		h.errorResponse(w, http.StatusInternalServerError, "list_failed", "Failed to list deliveries")
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}
