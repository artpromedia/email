package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"domain-manager/domain"
	"domain-manager/repository"
	"domain-manager/service"
)

// DomainHandler handles domain-related HTTP requests
type DomainHandler struct {
	domainRepo   *repository.DomainRepository
	dkimRepo     *repository.DKIMKeyRepository
	brandingRepo *repository.BrandingRepository
	policiesRepo *repository.PoliciesRepository
	catchAllRepo *repository.CatchAllRepository
	statsRepo    *repository.StatsRepository
	dnsService   *service.DNSService
	dkimService  *service.DKIMService
	validator    *validator.Validate
	logger       *zap.Logger
}

// NewDomainHandler creates a new domain handler
func NewDomainHandler(
	domainRepo *repository.DomainRepository,
	dkimRepo *repository.DKIMKeyRepository,
	brandingRepo *repository.BrandingRepository,
	policiesRepo *repository.PoliciesRepository,
	catchAllRepo *repository.CatchAllRepository,
	statsRepo *repository.StatsRepository,
	dnsService *service.DNSService,
	dkimService *service.DKIMService,
	logger *zap.Logger,
) *DomainHandler {
	return &DomainHandler{
		domainRepo:   domainRepo,
		dkimRepo:     dkimRepo,
		brandingRepo: brandingRepo,
		policiesRepo: policiesRepo,
		catchAllRepo: catchAllRepo,
		statsRepo:    statsRepo,
		dnsService:   dnsService,
		dkimService:  dkimService,
		validator:    validator.New(),
		logger:       logger,
	}
}

// Request/Response types
type CreateDomainRequest struct {
	OrganizationID string `json:"organization_id" validate:"required,uuid"`
	DomainName     string `json:"domain_name" validate:"required,fqdn"`
	DisplayName    string `json:"display_name"`
	IsPrimary      bool   `json:"is_primary"`
}

type UpdateDomainRequest struct {
	DisplayName string `json:"display_name"`
	IsPrimary   bool   `json:"is_primary"`
}

type DomainResponse struct {
	*domain.Domain
	DNSRecords []domain.DNSRecord `json:"dns_records,omitempty"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// Routes registers domain routes
func (h *DomainHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Domain CRUD
	r.Post("/", h.CreateDomain)
	r.Get("/", h.ListDomains)
	r.Get("/{id}", h.GetDomain)
	r.Put("/{id}", h.UpdateDomain)
	r.Delete("/{id}", h.DeleteDomain)

	// Domain verification
	r.Post("/{id}/verify", h.VerifyDomain)
	r.Post("/{id}/check-dns", h.CheckDNS)

	// DKIM management
	r.Post("/{id}/dkim/generate", h.GenerateDKIMKey)
	r.Get("/{id}/dkim", h.ListDKIMKeys)
	r.Post("/{id}/dkim/{keyId}/activate", h.ActivateDKIMKey)
	r.Post("/{id}/dkim/{keyId}/rotate", h.RotateDKIMKey)
	r.Delete("/{id}/dkim/{keyId}", h.DeleteDKIMKey)

	// Branding
	r.Put("/{id}/branding", h.UpdateBranding)
	r.Get("/{id}/branding", h.GetBranding)

	// Policies
	r.Put("/{id}/policies", h.UpdatePolicies)
	r.Get("/{id}/policies", h.GetPolicies)

	// Catch-all
	r.Put("/{id}/catch-all", h.UpdateCatchAll)
	r.Get("/{id}/catch-all", h.GetCatchAll)

	// Stats
	r.Get("/{id}/stats", h.GetStats)

	return r
}

// CreateDomain creates a new domain
func (h *DomainHandler) CreateDomain(w http.ResponseWriter, r *http.Request) {
	var req CreateDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Validation failed", err.Error())
		return
	}

	// Check if domain already exists
	existing, err := h.domainRepo.GetByName(r.Context(), req.DomainName)
	if err != nil {
		h.logger.Error("Failed to check existing domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to create domain", "")
		return
	}
	if existing != nil {
		h.respondError(w, http.StatusConflict, "Domain already exists", "")
		return
	}

	// Generate verification token
	verificationToken := h.dnsService.GenerateVerificationToken(req.DomainName)

	now := time.Now()
	d := &domain.Domain{
		ID:                uuid.New().String(),
		OrganizationID:    req.OrganizationID,
		DomainName:        req.DomainName,
		DisplayName:       req.DisplayName,
		Status:            domain.StatusPending,
		IsPrimary:         req.IsPrimary,
		VerificationToken: verificationToken,
		MXVerified:        false,
		SPFVerified:       false,
		DKIMVerified:      false,
		DMARCVerified:     false,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	if d.DisplayName == "" {
		d.DisplayName = req.DomainName
	}

	if err := h.domainRepo.Create(r.Context(), d); err != nil {
		h.logger.Error("Failed to create domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to create domain", "")
		return
	}

	// Get required DNS records
	dnsRecords := h.dnsService.GetRequiredDNSRecords(d.DomainName, d.VerificationToken, "", "")

	resp := DomainResponse{
		Domain:     d,
		DNSRecords: dnsRecords,
	}

	h.respondJSON(w, http.StatusCreated, resp)
}

// ListDomains lists domains for an organization
func (h *DomainHandler) ListDomains(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("organization_id")
	if orgID == "" {
		h.respondError(w, http.StatusBadRequest, "organization_id is required", "")
		return
	}

	domains, err := h.domainRepo.ListByOrganization(r.Context(), orgID)
	if err != nil {
		h.logger.Error("Failed to list domains", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to list domains", "")
		return
	}

	h.respondJSON(w, http.StatusOK, domains)
}

// GetDomain returns a domain by ID
func (h *DomainHandler) GetDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), id)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	// Get active DKIM key for DNS records
	var dkimSelector, dkimPublicKey string
	keys, _ := h.dkimRepo.ListByDomain(r.Context(), d.ID)
	for _, k := range keys {
		if k.IsActive {
			dkimSelector = k.Selector
			dkimPublicKey = k.PublicKey
			break
		}
	}

	dnsRecords := h.dnsService.GetRequiredDNSRecords(d.DomainName, d.VerificationToken, dkimSelector, dkimPublicKey)

	resp := DomainResponse{
		Domain:     d,
		DNSRecords: dnsRecords,
	}

	h.respondJSON(w, http.StatusOK, resp)
}

// UpdateDomain updates a domain
func (h *DomainHandler) UpdateDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), id)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	var req UpdateDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	if req.DisplayName != "" {
		d.DisplayName = req.DisplayName
	}
	d.IsPrimary = req.IsPrimary
	d.UpdatedAt = time.Now()

	if err := h.domainRepo.Update(r.Context(), d); err != nil {
		h.logger.Error("Failed to update domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to update domain", "")
		return
	}

	h.respondJSON(w, http.StatusOK, d)
}

// DeleteDomain deletes a domain
func (h *DomainHandler) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), id)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	if d.IsPrimary {
		h.respondError(w, http.StatusBadRequest, "Cannot delete primary domain", "")
		return
	}

	if err := h.domainRepo.Delete(r.Context(), id); err != nil {
		h.logger.Error("Failed to delete domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to delete domain", "")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// VerifyDomain initiates domain verification
func (h *DomainHandler) VerifyDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), id)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	// Check verification TXT record
	verified := h.dnsService.VerifyDomain(r.Context(), d.DomainName, d.VerificationToken)

	if verified {
		now := time.Now()
		d.Status = domain.StatusVerified
		d.VerifiedAt = &now
		d.UpdatedAt = now

		if err := h.domainRepo.Update(r.Context(), d); err != nil {
			h.logger.Error("Failed to update domain status", zap.Error(err))
			h.respondError(w, http.StatusInternalServerError, "Failed to update domain", "")
			return
		}

		h.respondJSON(w, http.StatusOK, map[string]interface{}{
			"verified": true,
			"domain":   d,
		})
	} else {
		h.respondJSON(w, http.StatusOK, map[string]interface{}{
			"verified": false,
			"message":  "Domain verification failed. Please ensure the TXT record is configured correctly.",
		})
	}
}

// CheckDNS performs a comprehensive DNS check
func (h *DomainHandler) CheckDNS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	d, err := h.domainRepo.GetByID(r.Context(), id)
	if err != nil {
		h.logger.Error("Failed to get domain", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get domain", "")
		return
	}
	if d == nil {
		h.respondError(w, http.StatusNotFound, "Domain not found", "")
		return
	}

	// Get active DKIM key
	var dkimSelector, dkimPublicKey string
	keys, _ := h.dkimRepo.ListByDomain(r.Context(), d.ID)
	for _, k := range keys {
		if k.IsActive {
			dkimSelector = k.Selector
			dkimPublicKey = k.PublicKey
			break
		}
	}

	// Perform DNS check
	result := h.dnsService.CheckDNS(r.Context(), d.DomainName, d.VerificationToken, dkimSelector, dkimPublicKey)

	// Update domain DNS status
	now := time.Now()
	d.MXVerified = result.MXVerified
	d.SPFVerified = result.SPFVerified
	d.DKIMVerified = result.DKIMVerified
	d.DMARCVerified = result.DMARCVerified
	d.LastDNSCheck = &now
	d.UpdatedAt = now

	// Update overall status if all critical checks pass
	if result.MXVerified && result.SPFVerified {
		if d.Status == domain.StatusPending {
			d.Status = domain.StatusVerified
			d.VerifiedAt = &now
		}
	} else if d.Status == domain.StatusVerified {
		d.Status = domain.StatusFailed
	}

	if err := h.domainRepo.Update(r.Context(), d); err != nil {
		h.logger.Error("Failed to update domain DNS status", zap.Error(err))
	}

	h.respondJSON(w, http.StatusOK, result)
}

// Helper methods
func (h *DomainHandler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *DomainHandler) respondError(w http.ResponseWriter, status int, message, details string) {
	h.respondJSON(w, status, ErrorResponse{
		Error:   message,
		Message: details,
	})
}
