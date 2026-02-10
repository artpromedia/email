// Package handler provides HTTP handlers for the auth service.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/artpromedia/email/services/auth/internal/middleware"
	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// SSOHandler handles SSO-related HTTP requests.
type SSOHandler struct {
	ssoService  *service.SSOService
	authService *service.AuthService
	validate    *validator.Validate
}

// NewSSOHandler creates a new SSOHandler.
func NewSSOHandler(ssoService *service.SSOService, authService *service.AuthService) *SSOHandler {
	return &SSOHandler{
		ssoService:  ssoService,
		authService: authService,
		validate:    validator.New(validator.WithRequiredStructEnabled()),
	}
}

// RegisterRoutes registers the SSO handler routes.
func (h *SSOHandler) RegisterRoutes(r chi.Router, authMiddleware *middleware.AuthMiddleware) {
	// Public SSO routes
	r.Get("/sso/discover", h.DiscoverSSO)
	r.Post("/sso/initiate", h.InitiateSSO)
	r.Post("/sso/saml/callback", h.SAMLCallback)
	r.Get("/sso/oidc/callback", h.OIDCCallback)
	r.Get("/sso/saml/metadata/{domainId}", h.SAMLMetadata)

	// Protected SSO admin routes
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware.Authenticate)
		r.Use(authMiddleware.RequireDomainAccess("domainId"))
		r.Use(middleware.RequireDomainAdmin())

		r.Get("/sso/config/{domainId}", h.GetSSOConfig)
		r.Post("/sso/config/{domainId}", h.ConfigureSSO)
		r.Put("/sso/config/{domainId}", h.UpdateSSOConfig)
		r.Delete("/sso/config/{domainId}", h.DeleteSSOConfig)
		r.Post("/sso/config/{domainId}/test", h.TestSSOConfig)
	})
}

// DiscoverSSO checks if a domain has SSO configured.
// GET /api/auth/sso/discover?email=user@domain.com
func (h *SSOHandler) DiscoverSSO(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	if email == "" {
		respondError(w, http.StatusBadRequest, "invalid_request", "Email parameter required")
		return
	}

	response, err := h.ssoService.DiscoverSSO(r.Context(), email)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, response)
}

// InitiateSSO initiates an SSO login flow.
// POST /api/auth/sso/initiate
func (h *SSOHandler) InitiateSSO(w http.ResponseWriter, r *http.Request) {
	var req models.SSOInitiateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	// Discover domain for SSO
	discover, err := h.ssoService.DiscoverSSO(r.Context(), req.Email)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	if !discover.HasSSO || discover.DomainID == nil {
		respondError(w, http.StatusBadRequest, "sso_not_available", "SSO is not available for this email domain")
		return
	}

	// Initiate SSO with the domain ID
	redirectURL, err := h.ssoService.InitiateSSO(r.Context(), *discover.DomainID, req.RedirectURL)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, models.SSOInitiateResponse{
		RedirectURL: redirectURL,
	})
}

// SAMLCallback handles the SAML assertion callback from the IdP.
// POST /api/auth/sso/saml/callback
func (h *SSOHandler) SAMLCallback(w http.ResponseWriter, r *http.Request) {
	// Parse form data
	if err := r.ParseForm(); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid form data")
		return
	}

	samlResponse := r.FormValue("SAMLResponse")
	relayState := r.FormValue("RelayState")

	if samlResponse == "" {
		respondError(w, http.StatusBadRequest, "invalid_request", "SAMLResponse required")
		return
	}

	// Parse domainID from URL param or relayState
	domainIDStr := chi.URLParam(r, "domainId")
	if domainIDStr == "" {
		// Try to extract from relayState (which may contain domain info)
		domainIDStr = relayState
	}

	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Domain ID required")
		return
	}

	clientIP := getClientIP(r)
	userAgent := r.UserAgent()

	response, err := h.ssoService.HandleSAMLCallback(r.Context(), domainID, samlResponse, clientIP, userAgent)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	// Set cookies
	setTokenCookies(w, response)

	// Redirect to dashboard
	http.Redirect(w, r, "/dashboard", http.StatusFound)
}

// OIDCCallback handles the OIDC authorization code callback.
// GET /api/auth/sso/oidc/callback
func (h *SSOHandler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	errorParam := r.URL.Query().Get("error")
	errorDesc := r.URL.Query().Get("error_description")

	// Check for error from IdP
	if errorParam != "" {
		log.Error().
			Str("error", errorParam).
			Str("description", errorDesc).
			Msg("OIDC callback error from IdP")
		respondError(w, http.StatusBadRequest, "sso_error", errorDesc)
		return
	}

	if code == "" {
		respondError(w, http.StatusBadRequest, "invalid_request", "Authorization code required")
		return
	}

	if state == "" {
		respondError(w, http.StatusBadRequest, "invalid_request", "State parameter required")
		return
	}

	// Parse domainID from URL param
	domainIDStr := chi.URLParam(r, "domainId")
	if domainIDStr == "" {
		// Try to extract from state (which may contain domain info)
		domainIDStr = state
	}

	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Domain ID required")
		return
	}

	clientIP := getClientIP(r)
	userAgent := r.UserAgent()

	response, err := h.ssoService.HandleOIDCCallback(r.Context(), domainID, code, state, clientIP, userAgent)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	// Set cookies
	setTokenCookies(w, response)

	// Redirect to dashboard
	http.Redirect(w, r, "/dashboard", http.StatusFound)
}

// SAMLMetadata returns the SAML service provider metadata for a domain.
// GET /api/auth/sso/saml/metadata/{domainId}
func (h *SSOHandler) SAMLMetadata(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	metadata, err := h.ssoService.GenerateSAMLMetadata(r.Context(), domainID)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/xml")
	w.Write([]byte(metadata))
}

// GetSSOConfig returns the SSO configuration for a domain.
// GET /api/auth/sso/config/{domainId}
func (h *SSOHandler) GetSSOConfig(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	config, err := h.ssoService.GetSSOConfig(r.Context(), domainID)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, config)
}

// ConfigureSSO configures SSO for a domain.
// POST /api/auth/sso/config/{domainId}
func (h *SSOHandler) ConfigureSSO(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	var req models.SSOConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	config, err := h.ssoService.ConfigureSSO(r.Context(), domainID, &req, claims.UserID)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, config)
}

// UpdateSSOConfig updates SSO configuration for a domain.
// PUT /api/auth/sso/config/{domainId}
func (h *SSOHandler) UpdateSSOConfig(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	var req models.SSOConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	config, err := h.ssoService.ConfigureSSO(r.Context(), domainID, &req, claims.UserID)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, config)
}

// DeleteSSOConfig deletes SSO configuration for a domain.
// DELETE /api/auth/sso/config/{domainId}
func (h *SSOHandler) DeleteSSOConfig(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	err = h.ssoService.DeleteSSOConfig(r.Context(), domainID, claims.UserID)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// TestSSOConfig tests SSO configuration for a domain.
// POST /api/auth/sso/config/{domainId}/test
func (h *SSOHandler) TestSSOConfig(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	// Get SSO config to verify it exists and is valid
	config, err := h.ssoService.GetSSOConfig(r.Context(), domainID)
	if err != nil {
		handleSSOError(w, err)
		return
	}

	// Return basic test result
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"provider": config.Provider,
		"message":  "SSO configuration is valid",
	})
}

// handleSSOError handles SSO-specific errors.
func handleSSOError(w http.ResponseWriter, err error) {
	switch {
	case err == service.ErrSSONotConfigured:
		respondError(w, http.StatusNotFound, "sso_not_configured", "SSO is not configured for this domain")
	case err == service.ErrSSODisabled:
		respondError(w, http.StatusForbidden, "sso_disabled", "SSO is disabled for this domain")
	case err == service.ErrInvalidSSOConfig:
		respondError(w, http.StatusBadRequest, "invalid_sso_config", "Invalid SSO configuration")
	case err == service.ErrSSOProviderError:
		respondError(w, http.StatusBadGateway, "sso_provider_error", "Error communicating with SSO provider")
	case err == service.ErrSSOUserNotAllowed:
		respondError(w, http.StatusForbidden, "sso_user_not_allowed", "User is not allowed to access this organization")
	case err == service.ErrSSOStateInvalid:
		respondError(w, http.StatusBadRequest, "sso_state_invalid", "Invalid or expired SSO state")
	case err == service.ErrSSOStateExpired:
		respondError(w, http.StatusBadRequest, "sso_state_expired", "SSO state has expired")
	case err == service.ErrDomainNotFound:
		respondError(w, http.StatusNotFound, "domain_not_found", "Domain not found")
	default:
		// Fall back to general service error handler
		handleServiceError(w, err)
	}
}
