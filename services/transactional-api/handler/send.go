package handler

import (
	"encoding/json"
	"net/http"

	"github.com/artpromedia/email/services/transactional-api/middleware"
	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/go-chi/chi/v5"
)

// sendEmail handles POST /api/v1/send
func (h *Handler) sendEmail(w http.ResponseWriter, r *http.Request) {
	var req models.SendRequest
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

	resp, err := h.senderService.Send(r.Context(), &req, apiKey)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to send email")
		h.errorResponse(w, http.StatusInternalServerError, "send_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusAccepted, resp)
}

// sendBatch handles POST /api/v1/send/batch
func (h *Handler) sendBatch(w http.ResponseWriter, r *http.Request) {
	var req models.BatchSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "invalid_json", "Invalid JSON in request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.validationError(w, err)
		return
	}

	if len(req.Messages) > 1000 {
		h.errorResponse(w, http.StatusBadRequest, "too_many_messages", "Maximum 1000 messages per batch")
		return
	}

	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	resp, err := h.senderService.SendBatch(r.Context(), &req, apiKey)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to send batch")
		h.errorResponse(w, http.StatusInternalServerError, "batch_failed", err.Error())
		return
	}

	h.jsonResponse(w, http.StatusAccepted, resp)
}

// listMessages handles GET /api/v1/messages
func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	query := &models.MessageQuery{
		DomainID: apiKey.DomainID,
		Limit:    h.parseInt(r, "limit", 20),
		Offset:   h.parseInt(r, "offset", 0),
	}

	// Parse optional filters
	if status := r.URL.Query().Get("status"); status != "" {
		s := models.MessageStatus(status)
		query.Status = &s
	}

	if from := r.URL.Query().Get("from"); from != "" {
		query.From = from
	}

	if to := r.URL.Query().Get("to"); to != "" {
		query.To = to
	}

	resp, err := h.senderService.ListMessages(r.Context(), query)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to list messages")
		h.errorResponse(w, http.StatusInternalServerError, "list_failed", "Failed to list messages")
		return
	}

	h.jsonResponse(w, http.StatusOK, resp)
}

// getMessage handles GET /api/v1/messages/{id}
func (h *Handler) getMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	msg, err := h.senderService.GetMessage(r.Context(), id)
	if err != nil {
		if err == repository.ErrMessageNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Message not found")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to get message")
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get message")
		return
	}

	// Verify domain access
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey != nil && msg.DomainID != apiKey.DomainID {
		h.errorResponse(w, http.StatusForbidden, "forbidden", "Access denied")
		return
	}

	h.jsonResponse(w, http.StatusOK, msg)
}

// getMessageTimeline handles GET /api/v1/messages/{id}/timeline
func (h *Handler) getMessageTimeline(w http.ResponseWriter, r *http.Request) {
	id, ok := h.parseUUID(w, r, "id")
	if !ok {
		return
	}

	timeline, err := h.senderService.GetMessageTimeline(r.Context(), id)
	if err != nil {
		if err == repository.ErrMessageNotFound {
			h.errorResponse(w, http.StatusNotFound, "not_found", "Message not found")
			return
		}
		h.logger.Error().Err(err).Msg("Failed to get message timeline")
		h.errorResponse(w, http.StatusInternalServerError, "get_failed", "Failed to get timeline")
		return
	}

	h.jsonResponse(w, http.StatusOK, timeline)
}

// listEvents handles GET /api/v1/events
func (h *Handler) listEvents(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	// For now, return empty - events are returned through message timeline
	h.jsonResponse(w, http.StatusOK, map[string]any{
		"events":  []any{},
		"total":   0,
		"limit":   h.parseInt(r, "limit", 20),
		"offset":  h.parseInt(r, "offset", 0),
		"has_more": false,
	})
}

// handleUnsubscribe handles unsubscribe requests
func (h *Handler) handleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	messageID := r.URL.Query().Get("m")
	domainID := r.URL.Query().Get("d")
	email := r.URL.Query().Get("e")

	if email == "" {
		h.errorResponse(w, http.StatusBadRequest, "missing_email", "Email parameter required")
		return
	}

	// Parse domain ID
	var domainUUID *uuid.UUID
	if domainID != "" {
		d, err := uuid.Parse(domainID)
		if err == nil {
			domainUUID = &d
		}
	}

	// Parse message ID
	var msgUUID *uuid.UUID
	if messageID != "" {
		m, err := uuid.Parse(messageID)
		if err == nil {
			msgUUID = &m
		}
	}

	// Process unsubscribe
	if domainUUID != nil {
		err := h.suppressionService.ProcessUnsubscribe(r.Context(), *domainUUID, email, msgUUID)
		if err != nil {
			h.logger.Error().Err(err).Str("email", email).Msg("Failed to process unsubscribe")
		}
	}

	// Return success page
	w.Header().Set("Content-Type", "text/html")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<title>Unsubscribed</title>
	<style>
		body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
		h1 { color: #28a745; }
		p { color: #666; }
	</style>
</head>
<body>
	<h1>Successfully Unsubscribed</h1>
	<p>You have been removed from our mailing list.</p>
	<p>If this was a mistake, please contact support.</p>
</body>
</html>`))
}
