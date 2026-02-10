package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/oonrumail/storage/models"
	"github.com/oonrumail/storage/storage"
)

// Handler handles all HTTP requests
type Handler struct {
	storage      storage.DomainStorageService
	quota        storage.QuotaService
	retention    storage.RetentionService
	export       storage.ExportService
	deletion     storage.DeletionService
	dedup        storage.DeduplicationService
	logger       zerolog.Logger
}

// NewHandler creates a new handler instance
func NewHandler(
	storageSvc storage.DomainStorageService,
	quotaSvc storage.QuotaService,
	retentionSvc storage.RetentionService,
	exportSvc storage.ExportService,
	deletionSvc storage.DeletionService,
	dedupSvc storage.DeduplicationService,
	logger zerolog.Logger,
) *Handler {
	return &Handler{
		storage:   storageSvc,
		quota:     quotaSvc,
		retention: retentionSvc,
		export:    exportSvc,
		deletion:  deletionSvc,
		dedup:     dedupSvc,
		logger:    logger.With().Str("component", "handler").Logger(),
	}
}

// Router returns the HTTP router
func (h *Handler) Router() chi.Router {
	r := chi.NewRouter()

	// Health check
	r.Get("/health", h.healthCheck)

	// Storage routes
	r.Route("/api/v1", func(r chi.Router) {
		// Message operations
		r.Route("/messages", func(r chi.Router) {
			r.Post("/", h.storeMessage)
			r.Get("/{messageID}", h.getMessage)
			r.Delete("/{messageID}", h.deleteMessage)
			r.Get("/{messageID}/presigned", h.getMessagePresignedURL)
		})

		// Attachment operations
		r.Route("/attachments", func(r chi.Router) {
			r.Post("/", h.storeAttachment)
			r.Get("/{attachmentID}", h.getAttachment)
			r.Delete("/{attachmentID}", h.deleteAttachment)
			r.Get("/{attachmentID}/presigned", h.getAttachmentPresignedURL)
			r.Get("/message/{messageID}", h.getMessageAttachments)
		})

		// Cross-domain operations
		r.Route("/domains", func(r chi.Router) {
			r.Post("/copy", h.copyBetweenDomains)
			r.Post("/move", h.moveBetweenDomains)
		})

		// Quota operations
		r.Route("/quotas", func(r chi.Router) {
			r.Get("/", h.getQuota)
			r.Put("/", h.updateQuota)
			r.Get("/check", h.checkQuota)
			r.Get("/usage", h.getQuotaUsage)
		})

		// Retention policy operations
		r.Route("/retention", func(r chi.Router) {
			r.Post("/policies", h.createRetentionPolicy)
			r.Get("/policies/{domainID}", h.getRetentionPolicy)
			r.Put("/policies/{policyID}", h.updateRetentionPolicy)
			r.Delete("/policies/{policyID}", h.deleteRetentionPolicy)

			// Legal holds
			r.Post("/holds", h.createLegalHold)
			r.Delete("/holds/{holdID}", h.releaseLegalHold)
			r.Get("/holds/domain/{domainID}", h.getDomainLegalHolds)
		})

		// Export operations
		r.Route("/exports", func(r chi.Router) {
			r.Post("/", h.createExportJob)
			r.Get("/{jobID}", h.getExportJob)
			r.Get("/{jobID}/download", h.downloadExport)
			r.Delete("/{jobID}", h.cancelExportJob)
			r.Get("/domain/{domainID}", h.listDomainExports)
		})

		// Deletion operations
		r.Route("/deletions", func(r chi.Router) {
			r.Post("/", h.createDeletionJob)
			r.Get("/{jobID}", h.getDeletionJob)
			r.Post("/{jobID}/approve", h.approveDeletionJob)
			r.Delete("/{jobID}", h.cancelDeletionJob)
			r.Get("/audit/{jobID}", h.getDeletionAuditLog)
		})

		// Deduplication stats
		r.Route("/dedup", func(r chi.Router) {
			r.Get("/stats/{orgID}", h.getDeduplicationStats)
		})
	})

	return r
}

// Health check handler
func (h *Handler) healthCheck(w http.ResponseWriter, r *http.Request) {
	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "healthy",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

// Message handlers
type StoreMessageRequest struct {
	OrgID     string `json:"org_id"`
	DomainID  string `json:"domain_id"`
	UserID    string `json:"user_id"`
	MailboxID string `json:"mailbox_id"`
	MessageID string `json:"message_id"`
}

func (h *Handler) storeMessage(w http.ResponseWriter, r *http.Request) {
	var req StoreMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Generate presigned upload URL for the client
	key := models.StorageKey{
		OrgID:     req.OrgID,
		DomainID:  req.DomainID,
		UserID:    req.UserID,
		Type:      models.StorageTypeMessage,
		MessageID: req.MessageID,
	}

	uploadURL, err := h.storage.GetPresignedUploadURL(r.Context(), key.String(), "message/rfc822", 15*time.Minute)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to generate upload URL")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate upload URL")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"upload_url":  uploadURL,
		"storage_key": key.String(),
		"expires_in":  "15m",
	})
}

func (h *Handler) getMessage(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "messageID")
	orgID := r.URL.Query().Get("org_id")
	domainID := r.URL.Query().Get("domain_id")
	userID := r.URL.Query().Get("user_id")

	key := models.StorageKey{
		OrgID:     orgID,
		DomainID:  domainID,
		UserID:    userID,
		Type:      models.StorageTypeMessage,
		MessageID: messageID,
	}

	reader, metadata, err := h.storage.GetMessage(r.Context(), orgID, domainID, userID, messageID)
	if err != nil {
		h.logger.Error().Err(err).Str("key", key.String()).Msg("Failed to get message")
		h.errorResponse(w, http.StatusNotFound, "Message not found")
		return
	}
	defer reader.Close()

	// Set headers
	w.Header().Set("Content-Type", "message/rfc822")
	w.Header().Set("Content-Length", strconv.FormatInt(metadata.Size, 10))
	w.Header().Set("X-Storage-Key", key.String())

	w.WriteHeader(http.StatusOK)
	io.Copy(w, reader)
}

func (h *Handler) deleteMessage(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "messageID")
	orgID := r.URL.Query().Get("org_id")
	domainID := r.URL.Query().Get("domain_id")
	userID := r.URL.Query().Get("user_id")

	key := models.StorageKey{
		OrgID:     orgID,
		DomainID:  domainID,
		UserID:    userID,
		Type:      models.StorageTypeMessage,
		MessageID: messageID,
	}

	if err := h.storage.DeleteMessage(r.Context(), orgID, domainID, userID, messageID); err != nil {
		h.logger.Error().Err(err).Str("key", key.String()).Msg("Failed to delete message")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to delete message")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status":  "deleted",
		"message": messageID,
	})
}

func (h *Handler) getMessagePresignedURL(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "messageID")
	orgID := r.URL.Query().Get("org_id")
	domainID := r.URL.Query().Get("domain_id")
	userID := r.URL.Query().Get("user_id")
	expiryStr := r.URL.Query().Get("expiry")

	expiry := 15 * time.Minute
	if expiryStr != "" {
		if parsed, err := time.ParseDuration(expiryStr); err == nil {
			expiry = parsed
		}
	}

	key := models.StorageKey{
		OrgID:     orgID,
		DomainID:  domainID,
		UserID:    userID,
		Type:      models.StorageTypeMessage,
		MessageID: messageID,
	}

	url, err := h.storage.GetPresignedDownloadURL(r.Context(), key.String(), expiry)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to generate presigned URL")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate URL")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"download_url": url,
		"expires_in":   expiry.String(),
	})
}

// Attachment handlers
type StoreAttachmentRequest struct {
	OrgID       string `json:"org_id"`
	DomainID    string `json:"domain_id"`
	UserID      string `json:"user_id"`
	MailboxID   string `json:"mailbox_id"`
	MessageID   string `json:"message_id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	ContentHash string `json:"content_hash"`
}

func (h *Handler) storeAttachment(w http.ResponseWriter, r *http.Request) {
	var req StoreAttachmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Check for duplicate
	result, err := h.dedup.CheckDuplicate(r.Context(), req.OrgID, req.ContentHash)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to check duplicate")
		h.errorResponse(w, http.StatusInternalServerError, "Deduplication check failed")
		return
	}

	if result.IsDuplicate && result.Existing != nil {
		// Return existing attachment info
		h.jsonResponse(w, http.StatusOK, map[string]interface{}{
			"status":       "deduplicated",
			"dedup_id":     result.Existing.ID,
			"storage_key":  result.Existing.StorageKey,
			"space_saved":  result.SpaceSaved,
			"upload_url":   nil,
		})
		return
	}

	// Generate upload URL for new attachment
	attachmentKey := models.NewAttachmentKey(req.OrgID, req.DomainID, req.UserID, req.Filename)

	uploadURL, err := h.storage.GetPresignedUploadURL(r.Context(), attachmentKey.String(), req.ContentType, 15*time.Minute)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to generate upload URL")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate upload URL")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":      "new",
		"upload_url":  uploadURL,
		"storage_key": attachmentKey.String(),
		"expires_in":  "15m",
	})
}

func (h *Handler) getAttachment(w http.ResponseWriter, r *http.Request) {
	attachmentID := chi.URLParam(r, "attachmentID")

	dedup, ref, err := h.dedup.GetByReference(r.Context(), attachmentID)
	if err != nil {
		h.logger.Error().Err(err).Str("id", attachmentID).Msg("Failed to get attachment")
		h.errorResponse(w, http.StatusNotFound, "Attachment not found")
		return
	}

	reader, _, err := h.storage.Get(r.Context(), dedup.StorageKey)
	if err != nil {
		h.logger.Error().Err(err).Str("key", dedup.StorageKey).Msg("Failed to get attachment data")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to retrieve attachment")
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", ref.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(ref.Size, 10))
	w.Header().Set("Content-Disposition", "attachment; filename=\""+ref.Filename+"\"")
	w.WriteHeader(http.StatusOK)
	io.Copy(w, reader)
}

func (h *Handler) deleteAttachment(w http.ResponseWriter, r *http.Request) {
	attachmentID := chi.URLParam(r, "attachmentID")

	if err := h.dedup.RemoveReference(r.Context(), attachmentID); err != nil {
		h.logger.Error().Err(err).Str("id", attachmentID).Msg("Failed to delete attachment")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to delete attachment")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "deleted",
		"id":     attachmentID,
	})
}

func (h *Handler) getAttachmentPresignedURL(w http.ResponseWriter, r *http.Request) {
	attachmentID := chi.URLParam(r, "attachmentID")
	expiryStr := r.URL.Query().Get("expiry")

	expiry := 15 * time.Minute
	if expiryStr != "" {
		if parsed, err := time.ParseDuration(expiryStr); err == nil {
			expiry = parsed
		}
	}

	dedup, ref, err := h.dedup.GetByReference(r.Context(), attachmentID)
	if err != nil {
		h.errorResponse(w, http.StatusNotFound, "Attachment not found")
		return
	}

	url, err := h.storage.GetPresignedDownloadURL(r.Context(), dedup.StorageKey, expiry)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to generate URL")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"download_url": url,
		"filename":     ref.Filename,
		"content_type": ref.ContentType,
		"expires_in":   expiry.String(),
	})
}

func (h *Handler) getMessageAttachments(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "messageID")

	refs, err := h.dedup.GetReferencesForMessage(r.Context(), messageID)
	if err != nil {
		h.logger.Error().Err(err).Str("message_id", messageID).Msg("Failed to get attachments")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get attachments")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"attachments": refs,
		"count":       len(refs),
	})
}

// Cross-domain handlers
type CopyBetweenDomainsRequest struct {
	SourceOrgID    string   `json:"source_org_id"`
	SourceDomainID string   `json:"source_domain_id"`
	TargetOrgID    string   `json:"target_org_id"`
	TargetDomainID string   `json:"target_domain_id"`
	TargetUserID   string   `json:"target_user_id"`
	Keys           []string `json:"keys"`
}

func (h *Handler) copyBetweenDomains(w http.ResponseWriter, r *http.Request) {
	var req CopyBetweenDomainsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	for _, key := range req.Keys {
		copyReq := &models.CopyRequest{
			SourceOrgID:    req.SourceOrgID,
			SourceDomainID: req.SourceDomainID,
			SourceKey:      key,
			DestOrgID:      req.TargetOrgID,
			DestDomainID:   req.TargetDomainID,
			DestUserID:     req.TargetUserID,
		}
		if err := h.storage.CopyBetweenDomains(r.Context(), copyReq); err != nil {
			h.logger.Error().Err(err).Str("key", key).Msg("Failed to copy between domains")
			h.errorResponse(w, http.StatusInternalServerError, "Copy failed")
			return
		}
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status": "copied",
		"count":  len(req.Keys),
	})
}

func (h *Handler) moveBetweenDomains(w http.ResponseWriter, r *http.Request) {
	var req CopyBetweenDomainsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	for _, key := range req.Keys {
		moveReq := &models.MoveRequest{
			CopyRequest: models.CopyRequest{
				SourceOrgID:    req.SourceOrgID,
				SourceDomainID: req.SourceDomainID,
				SourceKey:      key,
				DestOrgID:      req.TargetOrgID,
				DestDomainID:   req.TargetDomainID,
				DestUserID:     req.TargetUserID,
			},
			DeleteSource: true,
		}
		if err := h.storage.MoveBetweenDomains(r.Context(), moveReq); err != nil {
			h.logger.Error().Err(err).Str("key", key).Msg("Failed to move between domains")
			h.errorResponse(w, http.StatusInternalServerError, "Move failed")
			return
		}
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status": "moved",
		"count":  len(req.Keys),
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
