package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/oonrumail/storage/models"
)

// Quota handlers

func (h *Handler) getQuota(w http.ResponseWriter, r *http.Request) {
	quotaID := chi.URLParam(r, "quotaID")
	level := r.URL.Query().Get("level")
	entityID := r.URL.Query().Get("entity_id")

	var quota *models.Quota
	var err error

	// If quotaID is provided, use it; otherwise use level and entityID
	if quotaID != "" {
		// Get by level and ID
		switch level {
		case "organization":
			quota, err = h.quota.GetOrganizationQuota(r.Context(), quotaID)
		case "domain":
			quota, err = h.quota.GetDomainQuota(r.Context(), quotaID)
		case "user":
			quota, err = h.quota.GetUserQuota(r.Context(), quotaID)
		case "mailbox":
			quota, err = h.quota.GetMailboxQuota(r.Context(), quotaID)
		default:
			h.errorResponse(w, http.StatusBadRequest, "Invalid quota level")
			return
		}
	} else if entityID != "" {
		switch level {
		case "organization":
			quota, err = h.quota.GetOrganizationQuota(r.Context(), entityID)
		case "domain":
			quota, err = h.quota.GetDomainQuota(r.Context(), entityID)
		case "user":
			quota, err = h.quota.GetUserQuota(r.Context(), entityID)
		case "mailbox":
			quota, err = h.quota.GetMailboxQuota(r.Context(), entityID)
		default:
			h.errorResponse(w, http.StatusBadRequest, "Invalid quota level")
			return
		}
	} else {
		h.errorResponse(w, http.StatusBadRequest, "quota_id or entity_id with level is required")
		return
	}

	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get quota")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get quota")
		return
	}

	h.jsonResponse(w, http.StatusOK, quota)
}

type CreateQuotaRequestHandler struct {
	Level        string `json:"level"`
	EntityID     string `json:"entity_id"`
	ParentID     string `json:"parent_id,omitempty"`
	TotalBytes   int64  `json:"total_bytes"`
	SoftLimitPct int    `json:"soft_limit_pct,omitempty"`
	HardLimitPct int    `json:"hard_limit_pct,omitempty"`
}

func (h *Handler) updateQuota(w http.ResponseWriter, r *http.Request) {
	quotaID := chi.URLParam(r, "quotaID")

	var req models.UpdateQuotaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	quota, err := h.quota.UpdateQuota(r.Context(), quotaID, &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to update quota")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to update quota")
		return
	}

	h.jsonResponse(w, http.StatusOK, quota)
}

func (h *Handler) checkQuota(w http.ResponseWriter, r *http.Request) {
	mailboxID := r.URL.Query().Get("mailbox_id")
	domainID := r.URL.Query().Get("domain_id")
	sizeStr := r.URL.Query().Get("size")

	size, _ := strconv.ParseInt(sizeStr, 10, 64)

	var result *models.QuotaCheckResult
	var err error

	if mailboxID != "" {
		result, err = h.quota.CheckQuota(r.Context(), mailboxID, size)
	} else if domainID != "" {
		result, err = h.quota.CheckDomainQuota(r.Context(), domainID, size)
	} else {
		h.errorResponse(w, http.StatusBadRequest, "mailbox_id or domain_id is required")
		return
	}

	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to check quota")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to check quota")
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

func (h *Handler) getQuotaUsage(w http.ResponseWriter, r *http.Request) {
	mailboxID := r.URL.Query().Get("mailbox_id")
	domainID := r.URL.Query().Get("domain_id")

	var info *models.QuotaInfo
	var err error

	if mailboxID != "" {
		info, err = h.quota.GetQuotaInfo(r.Context(), mailboxID)
	} else if domainID != "" {
		info, err = h.quota.GetDomainQuotaInfo(r.Context(), domainID)
	} else {
		h.errorResponse(w, http.StatusBadRequest, "mailbox_id or domain_id is required")
		return
	}

	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get quota usage")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get usage")
		return
	}

	h.jsonResponse(w, http.StatusOK, info)
}

// Retention handlers

type CreateRetentionPolicyRequestHandler struct {
	DomainID       string   `json:"domain_id"`
	FolderType     string   `json:"folder_type"`
	FolderID       string   `json:"folder_id,omitempty"`
	RetentionDays  int      `json:"retention_days"`
	Action         string   `json:"action"` // delete, archive
	Enabled        bool     `json:"enabled"`
	Priority       int      `json:"priority,omitempty"`
	ExcludeStarred bool     `json:"exclude_starred,omitempty"`
	ExcludeLabels  []string `json:"exclude_labels,omitempty"`
}

func (h *Handler) createRetentionPolicy(w http.ResponseWriter, r *http.Request) {
	var req CreateRetentionPolicyRequestHandler
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	policyReq := &models.CreateRetentionPolicyRequest{
		DomainID:       req.DomainID,
		FolderType:     models.FolderType(req.FolderType),
		FolderID:       req.FolderID,
		RetentionDays:  req.RetentionDays,
		Action:         models.RetentionAction(req.Action),
		Enabled:        req.Enabled,
		Priority:       req.Priority,
		ExcludeStarred: req.ExcludeStarred,
		ExcludeLabels:  req.ExcludeLabels,
	}

	policy, err := h.retention.CreatePolicy(r.Context(), policyReq)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to create retention policy")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to create policy")
		return
	}

	h.jsonResponse(w, http.StatusCreated, policy)
}

func (h *Handler) getRetentionPolicy(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "domainID")

	policy, err := h.retention.GetPolicy(r.Context(), domainID)
	if err != nil {
		h.logger.Error().Err(err).Str("domain_id", domainID).Msg("Policy not found")
		h.errorResponse(w, http.StatusNotFound, "Policy not found")
		return
	}

	h.jsonResponse(w, http.StatusOK, policy)
}

func (h *Handler) updateRetentionPolicy(w http.ResponseWriter, r *http.Request) {
	policyID := chi.URLParam(r, "policyID")

	var req models.UpdateRetentionPolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	policy, err := h.retention.UpdatePolicy(r.Context(), policyID, &req)
	if err != nil {
		h.logger.Error().Err(err).Str("policy_id", policyID).Msg("Failed to update policy")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to update policy")
		return
	}

	h.jsonResponse(w, http.StatusOK, policy)
}

func (h *Handler) deleteRetentionPolicy(w http.ResponseWriter, r *http.Request) {
	policyID := chi.URLParam(r, "policyID")

	if err := h.retention.DeletePolicy(r.Context(), policyID); err != nil {
		h.logger.Error().Err(err).Str("policy_id", policyID).Msg("Failed to delete policy")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to delete policy")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

// Legal hold handlers

type CreateLegalHoldRequest struct {
	OrgID       string     `json:"org_id"`
	DomainID    string     `json:"domain_id,omitempty"`
	UserID      string     `json:"user_id,omitempty"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	StartDate   string     `json:"start_date"`
	EndDate     string     `json:"end_date,omitempty"`
	Keywords    []string   `json:"keywords,omitempty"`
	CreatedBy   string     `json:"created_by"`
}

func (h *Handler) createLegalHold(w http.ResponseWriter, r *http.Request) {
	var req CreateLegalHoldRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid start_date format")
		return
	}

	var endDate *time.Time
	if req.EndDate != "" {
		parsed, err := time.Parse("2006-01-02", req.EndDate)
		if err != nil {
			h.errorResponse(w, http.StatusBadRequest, "Invalid end_date format")
			return
		}
		endDate = &parsed
	}

	hold := &models.LegalHold{
		OrgID:       req.OrgID,
		DomainID:    req.DomainID,
		UserID:      req.UserID,
		Name:        req.Name,
		Description: req.Description,
		StartDate:   startDate,
		EndDate:     endDate,
		Keywords:    req.Keywords,
		Active:      true,
		CreatedBy:   req.CreatedBy,
	}

	if err := h.retention.CreateLegalHold(r.Context(), hold); err != nil {
		h.logger.Error().Err(err).Msg("Failed to create legal hold")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to create legal hold")
		return
	}

	h.jsonResponse(w, http.StatusCreated, hold)
}

func (h *Handler) releaseLegalHold(w http.ResponseWriter, r *http.Request) {
	holdID := chi.URLParam(r, "holdID")

	if err := h.retention.ReleaseLegalHold(r.Context(), holdID); err != nil {
		h.logger.Error().Err(err).Str("hold_id", holdID).Msg("Failed to release legal hold")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to release legal hold")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "released",
	})
}

func (h *Handler) getDomainLegalHolds(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")

	holds, err := h.retention.GetLegalHolds(r.Context(), orgID)
	if err != nil {
		h.logger.Error().Err(err).Str("org_id", orgID).Msg("Failed to get legal holds")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get legal holds")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"holds": holds,
		"count": len(holds),
	})
}
