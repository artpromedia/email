package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"domain-manager/repository"
)

// PublicHandler handles public domain-related HTTP requests
type PublicHandler struct {
	domainRepo   *repository.DomainRepository
	brandingRepo *repository.BrandingRepository
	logger       *zap.Logger
}

// NewPublicHandler creates a new public handler
func NewPublicHandler(
	domainRepo *repository.DomainRepository,
	brandingRepo *repository.BrandingRepository,
	logger *zap.Logger,
) *PublicHandler {
	return &PublicHandler{
		domainRepo:   domainRepo,
		brandingRepo: brandingRepo,
		logger:       logger,
	}
}

// Routes registers public routes
func (h *PublicHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Public branding endpoint (for login pages, etc.)
	r.Get("/{domainName}/branding", h.GetBrandingByDomainName)

	return r
}

// GetBrandingByDomainName returns branding for a domain by its name
func (h *PublicHandler) GetBrandingByDomainName(w http.ResponseWriter, r *http.Request) {
	domainName := chi.URLParam(r, "domainName")

	branding, err := h.brandingRepo.GetByDomainName(r.Context(), domainName)
	if err != nil {
		h.logger.Error("Failed to get branding", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "Failed to get branding", "")
		return
	}
	if branding == nil {
		// Return empty branding (use defaults on client)
		h.respondJSON(w, http.StatusOK, map[string]interface{}{
			"domain_name":   domainName,
			"logo_url":      "",
			"favicon_url":   "",
			"primary_color": "",
		})
		return
	}

	h.respondJSON(w, http.StatusOK, branding)
}

// Helper methods
func (h *PublicHandler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *PublicHandler) respondError(w http.ResponseWriter, status int, message, details string) {
	h.respondJSON(w, status, ErrorResponse{
		Error:   message,
		Message: details,
	})
}
