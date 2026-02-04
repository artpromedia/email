package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/oonrumail/storage/models"
)

// Quota handlers

type GetQuotaRequest struct {
	OrgID     string `json:"org_id"`
	DomainID  string `json:"domain_id,omitempty"`
	UserID    string `json:"user_id,omitempty"`
	MailboxID string `json:"mailbox_id,omitempty"`
}

func (h *Handler) getQuota(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	domainID := r.URL.Query().Get("domain_id")
	userID := r.URL.Query().Get("user_id")
	mailboxID := r.URL.Query().Get("mailbox_id")

	if orgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id is required")
		return
	}

	quota, err := h.quota.GetQuota(r.Context(), orgID, domainID, userID, mailboxID)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get quota")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get quota")
		return
	}

	h.jsonResponse(w, http.StatusOK, quota)
}

type UpdateQuotaRequest struct {
	OrgID      string `json:"org_id"`
	DomainID   string `json:"domain_id,omitempty"`
	UserID     string `json:"user_id,omitempty"`
	MailboxID  string `json:"mailbox_id,omitempty"`
	SoftLimit  int64  `json:"soft_limit"`
	HardLimit  int64  `json:"hard_limit"`
	MaxObjects int64  `json:"max_objects"`
}

func (h *Handler) updateQuota(w http.ResponseWriter, r *http.Request) {
	var req UpdateQuotaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	quota := &models.Quota{
		OrgID:      req.OrgID,
		DomainID:   req.DomainID,
		UserID:     req.UserID,
		MailboxID:  req.MailboxID,
		SoftLimit:  req.SoftLimit,
		HardLimit:  req.HardLimit,
		MaxObjects: req.MaxObjects,
	}

	if err := h.quota.SetQuota(r.Context(), quota); err != nil {
		h.logger.Error().Err(err).Msg("Failed to update quota")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to update quota")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "updated",
	})
}

func (h *Handler) checkQuota(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	domainID := r.URL.Query().Get("domain_id")
	userID := r.URL.Query().Get("user_id")
	mailboxID := r.URL.Query().Get("mailbox_id")
	sizeStr := r.URL.Query().Get("size")

	if orgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id is required")
		return
	}

	size, _ := strconv.ParseInt(sizeStr, 10, 64)

	allowed, reason, err := h.quota.CheckQuota(r.Context(), orgID, domainID, userID, mailboxID, size)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to check quota")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to check quota")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"allowed": allowed,
		"reason":  reason,
	})
}

func (h *Handler) getQuotaUsage(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	domainID := r.URL.Query().Get("domain_id")
	userID := r.URL.Query().Get("user_id")
	mailboxID := r.URL.Query().Get("mailbox_id")

	if orgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id is required")
		return
	}

	usage, err := h.quota.GetUsage(r.Context(), orgID, domainID, userID, mailboxID)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get quota usage")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get usage")
		return
	}

	h.jsonResponse(w, http.StatusOK, usage)
}

// Retention handlers

type CreateRetentionPolicyRequest struct {
	DomainID        string `json:"domain_id"`
	Name            string `json:"name"`
	RetentionDays   int    `json:"retention_days"`
	DeletedDays     int    `json:"deleted_days"`
	ArchiveAfter    int    `json:"archive_after_days"`
	ArchiveTier     string `json:"archive_tier"`
	ComplianceMode  bool   `json:"compliance_mode"`
	MinRetention    int    `json:"min_retention_days"`
	Immutable       bool   `json:"immutable"`
	AutoApply       bool   `json:"auto_apply"`
	ApplyToExisting bool   `json:"apply_to_existing"`
}

func (h *Handler) createRetentionPolicy(w http.ResponseWriter, r *http.Request) {
	var req CreateRetentionPolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	policy := &models.RetentionPolicy{
		DomainID:           req.DomainID,
		Name:               req.Name,
		RetentionDays:      req.RetentionDays,
		DeletedItemDays:    req.DeletedDays,
		ArchiveAfterDays:   req.ArchiveAfter,
		ArchiveTier:        req.ArchiveTier,
		ComplianceMode:     req.ComplianceMode,
		MinRetentionDays:   req.MinRetention,
		Immutable:          req.Immutable,
		AutoApply:          req.AutoApply,
		ApplyToExisting:    req.ApplyToExisting,
	}

	if err := h.retention.CreatePolicy(r.Context(), policy); err != nil {
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

	var policy models.RetentionPolicy
	if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	policy.ID = policyID

	if err := h.retention.UpdatePolicy(r.Context(), &policy); err != nil {
		h.logger.Error().Err(err).Str("policy_id", policyID).Msg("Failed to update policy")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to update policy")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "updated",
	})
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
	DomainID    string   `json:"domain_id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	CaseID      string   `json:"case_id"`
	Custodians  []string `json:"custodians"`
	Query       string   `json:"query"`
	CreatedBy   string   `json:"created_by"`
}

func (h *Handler) createLegalHold(w http.ResponseWriter, r *http.Request) {
	var req CreateLegalHoldRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	hold := &models.LegalHold{
		DomainID:    req.DomainID,
		Name:        req.Name,
		Description: req.Description,
		CaseID:      req.CaseID,
		Custodians:  req.Custodians,
		Query:       req.Query,
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
	releasedBy := r.URL.Query().Get("released_by")

	if err := h.retention.ReleaseLegalHold(r.Context(), holdID, releasedBy); err != nil {
		h.logger.Error().Err(err).Str("hold_id", holdID).Msg("Failed to release legal hold")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to release legal hold")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{
		"status": "released",
	})
}

func (h *Handler) getDomainLegalHolds(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "domainID")

	holds, err := h.retention.GetActiveLegalHolds(r.Context(), domainID)
	if err != nil {
		h.logger.Error().Err(err).Str("domain_id", domainID).Msg("Failed to get legal holds")
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get legal holds")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"holds": holds,
		"count": len(holds),
	})
}
