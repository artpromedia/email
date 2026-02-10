package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/oonrumail/storage/models"
)

// Export handlers

type CreateExportJobRequest struct {
	OrgID              string   `json:"org_id"`
	DomainID           string   `json:"domain_id"`
	UserID             string   `json:"user_id,omitempty"`
	Format             string   `json:"format"` // mbox, pst, eml, json
	IncludeAttachments bool     `json:"include_attachments"`
	StartDate          string   `json:"start_date,omitempty"`
	EndDate            string   `json:"end_date,omitempty"`
	FolderTypes        []string `json:"folder_types,omitempty"`
	RequestedBy        string   `json:"requested_by"`
}

func (h *Handler) createExportJob(w http.ResponseWriter, r *http.Request) {
	var req CreateExportJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate format
	validFormats := map[string]models.ExportFormat{
		"mbox": models.ExportFormatMbox,
		"pst":  models.ExportFormatPST,
		"eml":  models.ExportFormatEML,
		"json": models.ExportFormatJSON,
	}
	format, ok := validFormats[req.Format]
	if !ok {
		h.errorResponse(w, http.StatusBadRequest, "Invalid export format")
		return
	}

	// Parse date range if provided
	var dateRange *models.DateRange
	if req.StartDate != "" && req.EndDate != "" {
		startDate, err := time.Parse("2006-01-02", req.StartDate)
		if err != nil {
			h.errorResponse(w, http.StatusBadRequest, "Invalid start_date format")
			return
		}
		endDate, err := time.Parse("2006-01-02", req.EndDate)
		if err != nil {
			h.errorResponse(w, http.StatusBadRequest, "Invalid end_date format")
			return
		}
		dateRange = &models.DateRange{From: startDate, To: endDate}
	}

	// Convert folder types
	var folderTypes []models.FolderType
	for _, ft := range req.FolderTypes {
		folderTypes = append(folderTypes, models.FolderType(ft))
	}

	jobReq := &models.CreateExportJobRequest{
		DomainID:           req.DomainID,
		UserID:             req.UserID,
		Format:             format,
		IncludeAttachments: req.IncludeAttachments,
		DateRange:          dateRange,
		FolderTypes:        folderTypes,
		RequestedBy:        req.RequestedBy,
	}

	job, err := h.export.CreateExportJob(r.Context(), req.OrgID, jobReq)
	if err != nil {
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

	downloadURL, _, err := h.export.GetDownloadURL(r.Context(), jobID)
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

	jobs, err := h.export.GetExportJobsForDomain(r.Context(), domainID)
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

type CreateDeletionJobRequestHandler struct {
	OrgID            string `json:"org_id"`
	DomainID         string `json:"domain_id"`
	UserID           string `json:"user_id,omitempty"`
	Reason           string `json:"reason"`
	ClearSearchIndex bool   `json:"clear_search_index"`
	RequestedBy      string `json:"requested_by"`
}

func (h *Handler) createDeletionJob(w http.ResponseWriter, r *http.Request) {
	var req CreateDeletionJobRequestHandler
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	jobReq := &models.CreateDeletionJobRequest{
		DomainID:         req.DomainID,
		UserID:           req.UserID,
		Reason:           req.Reason,
		ClearSearchIndex: req.ClearSearchIndex,
		RequestedBy:      req.RequestedBy,
	}

	job, err := h.deletion.CreateDeletionJob(r.Context(), req.OrgID, jobReq)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to create deletion job")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to create deletion job")
		return
	}

	h.jsonResponse(w, http.StatusAccepted, map[string]interface{}{
		"job_id":  job.ID,
		"status":  job.Status,
		"message": "Deletion job created",
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
