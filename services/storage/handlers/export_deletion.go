package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/oonrumail/storage/models"
)

// Export handlers

type CreateExportJobRequest struct {
	DomainID    string   `json:"domain_id"`
	Format      string   `json:"format"` // mbox, pst, eml, json
	UserIDs     []string `json:"user_ids,omitempty"`
	MailboxIDs  []string `json:"mailbox_ids,omitempty"`
	StartDate   string   `json:"start_date,omitempty"`
	EndDate     string   `json:"end_date,omitempty"`
	Query       string   `json:"query,omitempty"`
	Compress    bool     `json:"compress"`
	Encrypt     bool     `json:"encrypt"`
	PublicKey   string   `json:"public_key,omitempty"`
	RequestedBy string   `json:"requested_by"`
	Reason      string   `json:"reason"`
}

func (h *Handler) createExportJob(w http.ResponseWriter, r *http.Request) {
	var req CreateExportJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate format
	validFormats := map[string]bool{
		"mbox": true,
		"pst":  true,
		"eml":  true,
		"json": true,
	}
	if !validFormats[req.Format] {
		h.errorResponse(w, http.StatusBadRequest, "Invalid export format")
		return
	}

	job := &models.ExportJob{
		DomainID:    req.DomainID,
		Format:      req.Format,
		UserIDs:     req.UserIDs,
		MailboxIDs:  req.MailboxIDs,
		Query:       req.Query,
		Compress:    req.Compress,
		Encrypt:     req.Encrypt,
		PublicKey:   req.PublicKey,
		RequestedBy: req.RequestedBy,
		Reason:      req.Reason,
	}

	if err := h.export.CreateExportJob(r.Context(), job); err != nil {
		h.logger.Error().Err(err).Msg("Failed to create export job")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to create export job")
		return
	}

	h.jsonResponse(w, http.StatusAccepted, map[string]interface{}{
		"job_id":  job.ID,
		"status":  job.Status,
		"message": "Export job created and queued for processing",
	})
}

func (h *Handler) getExportJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")

	job, err := h.export.GetExportJob(r.Context(), jobID)
	if err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("Export job not found")
		h.errorResponse(w, http.StatusNotFound, "Export job not found")
		return
	}

	h.jsonResponse(w, http.StatusOK, job)
}

func (h *Handler) downloadExport(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")

	job, err := h.export.GetExportJob(r.Context(), jobID)
	if err != nil {
		h.errorResponse(w, http.StatusNotFound, "Export job not found")
		return
	}

	if job.Status != models.ExportStatusCompleted {
		h.errorResponse(w, http.StatusBadRequest, "Export not completed")
		return
	}

	downloadURL, err := h.export.GetDownloadURL(r.Context(), jobID)
	if err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("Failed to get download URL")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get download URL")
		return
	}

	// Redirect to presigned URL
	http.Redirect(w, r, downloadURL, http.StatusTemporaryRedirect)
}

func (h *Handler) cancelExportJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")

	if err := h.export.CancelExportJob(r.Context(), jobID); err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("Failed to cancel export job")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to cancel export job")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "cancelled",
		"job_id": jobID,
	})
}

func (h *Handler) listDomainExports(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "domainID")

	jobs, err := h.export.ListExportJobs(r.Context(), domainID)
	if err != nil {
		h.logger.Error().Err(err).Str("domain_id", domainID).Msg("Failed to list export jobs")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to list exports")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"jobs":  jobs,
		"count": len(jobs),
	})
}

// Deletion handlers

type CreateDeletionJobRequest struct {
	DomainID         string   `json:"domain_id"`
	Type             string   `json:"type"` // domain, user, mailbox, selective
	UserID           string   `json:"user_id,omitempty"`
	MailboxID        string   `json:"mailbox_id,omitempty"`
	MessageIDs       []string `json:"message_ids,omitempty"`
	Reason           string   `json:"reason"`
	ComplianceType   string   `json:"compliance_type"` // gdpr, retention, legal, manual
	RequestedBy      string   `json:"requested_by"`
	RequiresApproval bool     `json:"requires_approval"`
	ScheduledFor     string   `json:"scheduled_for,omitempty"`
}

func (h *Handler) createDeletionJob(w http.ResponseWriter, r *http.Request) {
	var req CreateDeletionJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	job := &models.DeletionJob{
		DomainID:         req.DomainID,
		Type:             req.Type,
		UserID:           req.UserID,
		MailboxID:        req.MailboxID,
		MessageIDs:       req.MessageIDs,
		Reason:           req.Reason,
		ComplianceType:   req.ComplianceType,
		RequestedBy:      req.RequestedBy,
		RequiresApproval: req.RequiresApproval,
	}

	if err := h.deletion.CreateDeletionJob(r.Context(), job); err != nil {
		h.logger.Error().Err(err).Msg("Failed to create deletion job")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to create deletion job")
		return
	}

	h.jsonResponse(w, http.StatusAccepted, map[string]interface{}{
		"job_id":            job.ID,
		"status":            job.Status,
		"requires_approval": job.RequiresApproval,
		"message":           "Deletion job created",
	})
}

func (h *Handler) getDeletionJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")

	job, err := h.deletion.GetDeletionJob(r.Context(), jobID)
	if err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("Deletion job not found")
		h.errorResponse(w, http.StatusNotFound, "Deletion job not found")
		return
	}

	h.jsonResponse(w, http.StatusOK, job)
}

type ApproveDeletionRequest struct {
	ApprovedBy string `json:"approved_by"`
	Comment    string `json:"comment,omitempty"`
}

func (h *Handler) approveDeletionJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")

	var req ApproveDeletionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.deletion.ApproveDeletionJob(r.Context(), jobID, req.ApprovedBy); err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("Failed to approve deletion job")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to approve deletion job")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status":  "approved",
		"job_id":  jobID,
		"message": "Deletion job approved and queued for processing",
	})
}

func (h *Handler) cancelDeletionJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")

	if err := h.deletion.CancelDeletionJob(r.Context(), jobID); err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("Failed to cancel deletion job")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to cancel deletion job")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "cancelled",
		"job_id": jobID,
	})
}

func (h *Handler) getDeletionAuditLog(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")

	logs, err := h.deletion.GetDeletionAuditLog(r.Context(), jobID)
	if err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("Failed to get audit log")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get audit log")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"audit_log": logs,
		"count":     len(logs),
	})
}

// Deduplication stats handler
func (h *Handler) getDeduplicationStats(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")

	stats, err := h.dedup.GetStats(r.Context(), orgID)
	if err != nil {
		h.logger.Error().Err(err).Str("org_id", orgID).Msg("Failed to get dedup stats")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get stats")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}
