package handler

import (
	"encoding/json"
	"net/http"

	"transactional-api/middleware"
	"transactional-api/models"
	"transactional-api/repository"
)

// listAPIKeys handles GET /api/v1/api-keys
func (h *Handler) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	includeRevoked := h.parseBool(r, "include_revoked", false)
	limit := h.parseInt(r, "limit", 20)
	offset := h.parseInt(r, "offset", 0)

	keys, total, err := h.apiKeyService.List(r.Context(), apiKey.DomainID, includeRevoked, limit, offset)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to list API keys")
		h.errorResponse(w, http.StatusInternalServerError, "list_failed", "Failed to list API keys")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"api_keys": keys,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// createAPIKey handles POST /api/v1/api-keys
func (h *Handler) createAPIKey(w http.ResponseWriter, r *http.Request) {
	var req models.CreateAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.validationError(w, err)
		return
	}

	currentKey := middleware.GetAPIKey(r.Context())
	if currentKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Override domain_id with the current key's domain
	req.DomainID = currentKey.DomainID

	resp, err := h.apiKeyService.Create(r.Context(), &req, currentKey.CreatedBy)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to create API key")
		h.errorResponse(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusCreated, resp)
}

// getAPIKey handles GET /api/v1/api-keys/{id}
func (h *Handler) getAPIKeyByID(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	key, err := h.apiKeyService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrAPIKeyNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "API key not found")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to get API key")
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get API key")
		return
	}

	// Verify domain access
	currentKey := middleware.GetAPIKey(r.Context())
	if currentKey != nil && key.DomainID != currentKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	h.jsonResponse(w, http.StatusOK, key)
}

// This fixes the duplicate getAPIKey function
func (h *Handler) getAPIKeyHandler(w http.ResponseWriter, r *http.Request) {
	h.getAPIKeyByID(w, r)
}

// updateAPIKey handles PUT /api/v1/api-keys/{id}
func (h *Handler) updateAPIKey(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	var req models.UpdateAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.validationError(w, err)
		return
	}

	currentKey := middleware.GetAPIKey(r.Context())
	if currentKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	key, err := h.apiKeyService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrAPIKeyNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "API key not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get API key")
		return
	}

	if key.DomainID != currentKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	err = h.apiKeyService.Update(r.Context(), id, &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to update API key")
		h.errorResponse(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}

	// Get updated key
	updated, _ := h.apiKeyService.Get(r.Context(), id)
	h.jsonResponse(w, http.StatusOK, updated)
}

// revokeAPIKey handles DELETE /api/v1/api-keys/{id}
func (h *Handler) revokeAPIKey(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	currentKey := middleware.GetAPIKey(r.Context())
	if currentKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Prevent self-revocation
	if id == currentKey.ID {
		h.errorResponse(w, http.StatusBadRequest, "self_revoke", "Cannot revoke the API key being used")
		return
	}

	// Verify ownership
	key, err := h.apiKeyService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrAPIKeyNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "API key not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get API key")
		return
	}

	if key.DomainID != currentKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	err = h.apiKeyService.Revoke(r.Context(), id)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to revoke API key")
		h.errorResponse(w, http.StatusInternalServerError, "revoke_failed", "Failed to revoke API key")
		return
	}

	h.jsonResponse(w, http.StatusNoContent, nil)
}

// rotateAPIKey handles POST /api/v1/api-keys/{id}/rotate
func (h *Handler) rotateAPIKey(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	currentKey := middleware.GetAPIKey(r.Context())
	if currentKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	key, err := h.apiKeyService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrAPIKeyNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "API key not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get API key")
		return
	}

	if key.DomainID != currentKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	resp, err := h.apiKeyService.Rotate(r.Context(), id)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to rotate API key")
		h.errorResponse(w, http.StatusInternalServerError, "rotate_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// getAPIKeyUsage handles GET /api/v1/api-keys/{id}/usage
func (h *Handler) getAPIKeyUsage(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	currentKey := middleware.GetAPIKey(r.Context())
	if currentKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// Verify ownership
	key, err := h.apiKeyService.Get(r.Context(), id)
	if err != nil {
		if err == repository.ErrAPIKeyNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "API key not found")
			return
		}
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get API key")
		return
	}

	if key.DomainID != currentKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	days := h.parseInt(r, "days", 30)
	usage, err := h.apiKeyService.GetUsage(r.Context(), id, days)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get API key usage")
		h.errorResponse(w, http.StatusInternalServerError, "usage_failed", "Failed to get usage")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"key_id": id,
		"days":   days,
		"usage":  usage,
	})
}
