package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"domain-manager/domain"
)

// DKIM Request types
type GenerateDKIMRequest struct {
	Selector string `json:"selector"`
}

type RotateDKIMRequest struct {
	NewSelector string `json:"new_selector"`
}

// GenerateDKIMKey generates a new DKIM key for a domain
func (h *DomainHandler) GenerateDKIMKey(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	var req GenerateDKIMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Use default selector
		req.Selector = ""
	}

	// Generate DKIM key pair
	key, err := h.dkimService.GenerateKeyPair(domainID, req.Selector)
	if err != nil {
		h.logger.Error("Failed to generate DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to generate DKIM key", "")
		return
	}

	// Save key to database
	if err := h.dkimRepo.Create(r.Context(), key); err != nil {
		h.logger.Error("Failed to save DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to save DKIM key", "")
		return
	}

	// Return public representation
	publicKey := h.dkimService.ToPublic(key, d.DomainName)
	h.respondJSON(w, http.StatusCreated, publicKey)
}

// ListDKIMKeys lists all DKIM keys for a domain
func (h *DomainHandler) ListDKIMKeys(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	keys, err := h.dkimRepo.ListByDomain(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to list DKIM keys", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to list DKIM keys", "")
		return
	}

	// Convert to public representations
	var publicKeys []interface{}
	for _, key := range keys {
		publicKeys = append(publicKeys, h.dkimService.ToPublic(key, d.DomainName))
	}

	h.respondJSON(w, http.StatusOK, publicKeys)
}

// ActivateDKIMKey activates a DKIM key
func (h *DomainHandler) ActivateDKIMKey(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")
	keyID := chi.URLParam(r, "keyId")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	key, err := h.dkimRepo.GetByID(r.Context(), keyID)
	if err != nil {
		h.logger.Error("Failed to get DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get DKIM key", "")
		return
	}
	if key == nil || key.DomainID != domainID {
		h.respondError(w, http.StatusNotFound, "DKIM key not found", "")
		return
	}

	// Deactivate all other keys for this domain
	if err := h.dkimRepo.DeactivateAllForDomain(r.Context(), domainID); err != nil {
		h.logger.Error("Failed to deactivate existing keys", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to activate DKIM key", "")
		return
	}

	// Activate this key
	if err := h.dkimRepo.Activate(r.Context(), keyID); err != nil {
		h.logger.Error("Failed to activate DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to activate DKIM key", "")
		return
	}

	// Update domain DKIM status
	d.DKIMVerified = false // Will be true after DNS check
	d.UpdatedAt = time.Now()
	h.domainRepo.Update(r.Context(), d)

	// Refresh key from database
	key, _ = h.dkimRepo.GetByID(r.Context(), keyID)
	publicKey := h.dkimService.ToPublic(key, d.DomainName)

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":    "DKIM key activated. Please update your DNS records.",
		"key":        publicKey,
		"dns_record": publicKey.DNSRecord,
	})
}

// RotateDKIMKey rotates a DKIM key
func (h *DomainHandler) RotateDKIMKey(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")
	keyID := chi.URLParam(r, "keyId")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	currentKey, err := h.dkimRepo.GetByID(r.Context(), keyID)
	if err != nil {
		h.logger.Error("Failed to get DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get DKIM key", "")
		return
	}
	if currentKey == nil || currentKey.DomainID != domainID {
		h.respondError(w, http.StatusNotFound, "DKIM key not found", "")
		return
	}

	var req RotateDKIMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.NewSelector = ""
	}

	// Generate new key with new selector
	newSelector := req.NewSelector
	if newSelector == "" {
		// Generate a time-based selector
		newSelector = time.Now().Format("200601")
	}

	newKey, err := h.dkimService.GenerateKeyPair(domainID, newSelector)
	if err != nil {
		h.logger.Error("Failed to generate new DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to rotate DKIM key", "")
		return
	}

	// Validate rotation
	if err := h.dkimService.ValidateKeyRotation(currentKey, newKey); err != nil {
		h.respondError(w, http.StatusBadRequest, "Cannot rotate key", err.Error())
		return
	}

	// Save new key
	if err := h.dkimRepo.Create(r.Context(), newKey); err != nil {
		h.logger.Error("Failed to save new DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to rotate DKIM key", "")
		return
	}

	// Mark old key as rotated
	if err := h.dkimRepo.MarkRotated(r.Context(), keyID); err != nil {
		h.logger.Error("Failed to mark old key as rotated", zap.Error(err))
	}

	// Activate new key
	if err := h.dkimRepo.Activate(r.Context(), newKey.ID); err != nil {
		h.logger.Error("Failed to activate new DKIM key", zap.Error(err))
	}

	newPublicKey := h.dkimService.ToPublic(newKey, d.DomainName)
	oldPublicKey := h.dkimService.ToPublic(currentKey, d.DomainName)

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":        "DKIM key rotated. Please update your DNS records.",
		"new_key":        newPublicKey,
		"old_key":        oldPublicKey,
		"new_dns_record": newPublicKey.DNSRecord,
	})
}

// DeleteDKIMKey deletes a DKIM key
func (h *DomainHandler) DeleteDKIMKey(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")
	keyID := chi.URLParam(r, "keyId")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	key, err := h.dkimRepo.GetByID(r.Context(), keyID)
	if err != nil {
		h.logger.Error("Failed to get DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get DKIM key", "")
		return
	}
	if key == nil || key.DomainID != domainID {
		h.respondError(w, http.StatusNotFound, "DKIM key not found", "")
		return
	}

	if key.IsActive {
		h.respondError(w, http.StatusBadRequest, "Cannot delete active DKIM key", "Deactivate or rotate the key first")
		return
	}

	if err := h.dkimRepo.Delete(r.Context(), keyID); err != nil {
		h.logger.Error("Failed to delete DKIM key", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to delete DKIM key", "")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Branding handlers

type UpdateBrandingRequest struct {
	LogoURL            *string `json:"logo_url"`
	FaviconURL         *string `json:"favicon_url"`
	PrimaryColor       string  `json:"primary_color"`
	LoginBackgroundURL *string `json:"login_background_url"`
	EmailHeaderHTML    *string `json:"email_header_html"`
	EmailFooterHTML    *string `json:"email_footer_html"`
}

// UpdateBranding updates domain branding
func (h *DomainHandler) UpdateBranding(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	var req UpdateBrandingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	// Get existing branding or create new
	branding, _ := h.brandingRepo.GetByDomainID(r.Context(), domainID)
	if branding == nil {
		branding = &domain.Branding{
			ID:       uuid.New().String(),
			DomainID: domainID,
		}
	}

	branding.LogoURL = req.LogoURL
	branding.FaviconURL = req.FaviconURL
	branding.PrimaryColor = req.PrimaryColor
	branding.LoginBackgroundURL = req.LoginBackgroundURL
	branding.EmailHeaderHTML = req.EmailHeaderHTML
	branding.EmailFooterHTML = req.EmailFooterHTML
	branding.UpdatedAt = time.Now()

	if err := h.brandingRepo.Upsert(r.Context(), branding); err != nil {
		h.logger.Error("Failed to update branding", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to update branding", "")
		return
	}

	h.respondJSON(w, http.StatusOK, branding)
}

// GetBranding returns domain branding
func (h *DomainHandler) GetBranding(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	branding, err := h.brandingRepo.GetByDomainID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get branding", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get branding", "")
		return
	}
	if branding == nil {
		branding = &domain.Branding{
			DomainID: domainID,
		}
	}

	h.respondJSON(w, http.StatusOK, branding)
}

// Policies handlers

type UpdatePoliciesRequest struct {
	MaxMessageSizeBytes      int64                    `json:"max_message_size_bytes"`
	MaxRecipientsPerMessage  int                      `json:"max_recipients_per_message"`
	MaxMessagesPerDayPerUser int                      `json:"max_messages_per_day_per_user"`
	RequireTLSOutbound       bool                     `json:"require_tls_outbound"`
	AllowedRecipientDomains  []string                 `json:"allowed_recipient_domains"`
	BlockedRecipientDomains  []string                 `json:"blocked_recipient_domains"`
	AutoBCCAddress           *string                  `json:"auto_bcc_address"`
	DefaultSignatureEnforced bool                     `json:"default_signature_enforced"`
	AttachmentPolicy         *domain.AttachmentPolicy `json:"attachment_policy"`
}

// UpdatePolicies updates domain policies
func (h *DomainHandler) UpdatePolicies(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	var req UpdatePoliciesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	// Get existing policies or create new
	policies, _ := h.policiesRepo.GetByDomainID(r.Context(), domainID)
	if policies == nil {
		policies = &domain.Policies{
			ID:       uuid.New().String(),
			DomainID: domainID,
		}
	}

	policies.MaxMessageSizeBytes = req.MaxMessageSizeBytes
	policies.MaxRecipientsPerMessage = req.MaxRecipientsPerMessage
	policies.MaxMessagesPerDayPerUser = req.MaxMessagesPerDayPerUser
	policies.RequireTLSOutbound = req.RequireTLSOutbound
	policies.AllowedRecipientDomains = req.AllowedRecipientDomains
	policies.BlockedRecipientDomains = req.BlockedRecipientDomains
	policies.AutoBCCAddress = req.AutoBCCAddress
	policies.DefaultSignatureEnforced = req.DefaultSignatureEnforced
	policies.AttachmentPolicy = req.AttachmentPolicy
	policies.UpdatedAt = time.Now()

	if err := h.policiesRepo.Upsert(r.Context(), policies); err != nil {
		h.logger.Error("Failed to update policies", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to update policies", "")
		return
	}

	h.respondJSON(w, http.StatusOK, policies)
}

// GetPolicies returns domain policies
func (h *DomainHandler) GetPolicies(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	policies, err := h.policiesRepo.GetByDomainID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get policies", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get policies", "")
		return
	}
	if policies == nil {
		// Return default policies
		policies = &domain.Policies{
			DomainID:                 domainID,
			MaxMessageSizeBytes:      25 * 1024 * 1024, // 25MB
			MaxRecipientsPerMessage:  100,
			MaxMessagesPerDayPerUser: 1000,
		}
	}

	h.respondJSON(w, http.StatusOK, policies)
}

// Catch-all handlers

type UpdateCatchAllRequest struct {
	Enabled   bool    `json:"enabled"`
	Action    string  `json:"action" validate:"omitempty,oneof=deliver forward reject"`
	DeliverTo *string `json:"deliver_to"`
	ForwardTo *string `json:"forward_to"`
}

// UpdateCatchAll updates catch-all configuration
func (h *DomainHandler) UpdateCatchAll(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	var req UpdateCatchAllRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	// Validate action
	action := domain.CatchAllAction(req.Action)
	if req.Action != "" && action != domain.CatchAllDeliver && action != domain.CatchAllForward && action != domain.CatchAllReject {
		h.respondError(w, http.StatusBadRequest, "Invalid action", "Action must be one of: deliver, forward, reject")
		return
	}

	// Get existing config or create new
	config, _ := h.catchAllRepo.GetByDomainID(r.Context(), domainID)
	if config == nil {
		config = &domain.CatchAllConfig{
			ID:       uuid.New().String(),
			DomainID: domainID,
		}
	}

	config.Enabled = req.Enabled
	config.Action = action
	config.DeliverTo = req.DeliverTo
	config.ForwardTo = req.ForwardTo
	config.UpdatedAt = time.Now()

	if err := h.catchAllRepo.Upsert(r.Context(), config); err != nil {
		h.logger.Error("Failed to update catch-all config", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to update catch-all configuration", "")
		return
	}

	h.respondJSON(w, http.StatusOK, config)
}

// GetCatchAll returns catch-all configuration
func (h *DomainHandler) GetCatchAll(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	config, err := h.catchAllRepo.GetByDomainID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get catch-all config", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get catch-all configuration", "")
		return
	}
	if config == nil {
		config = &domain.CatchAllConfig{
			DomainID: domainID,
			Enabled:  false,
			Action:   domain.CatchAllReject,
		}
	}

	h.respondJSON(w, http.StatusOK, config)
}

// GetStats returns domain statistics
func (h *DomainHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	stats, err := h.statsRepo.GetDomainStats(r.Context(), domainID)
	if err != nil {
		h.logger.Error("Failed to get domain stats", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain statistics", "")
		return
	}

	h.respondJSON(w, http.StatusOK, stats)
}
