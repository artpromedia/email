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
)

// AdminHandler handles admin-related HTTP requests.
type AdminHandler struct {
	adminService *service.AdminService
	validate     *validator.Validate
}

// NewAdminHandler creates a new AdminHandler.
func NewAdminHandler(adminService *service.AdminService) *AdminHandler {
	return &AdminHandler{
		adminService: adminService,
		validate:     validator.New(validator.WithRequiredStructEnabled()),
	}
}

// RegisterRoutes registers the admin handler routes.
func (h *AdminHandler) RegisterRoutes(r chi.Router, authMiddleware *middleware.AuthMiddleware) {
	r.Use(authMiddleware.Authenticate)

	// Organization management
	r.Route("/organizations", func(r chi.Router) {
		r.Use(middleware.RequireOrganizationAdmin())

		r.Get("/", h.ListOrganizations)
		r.Post("/", h.CreateOrganization)
		r.Get("/{orgId}", h.GetOrganization)
		r.Put("/{orgId}", h.UpdateOrganization)
		r.Delete("/{orgId}", h.DeleteOrganization)
		r.Get("/{orgId}/members", h.ListOrganizationMembers)
		r.Post("/{orgId}/members", h.AddOrganizationMember)
		r.Delete("/{orgId}/members/{userId}", h.RemoveOrganizationMember)
		r.Put("/{orgId}/members/{userId}/role", h.UpdateMemberRole)
	})

	// Domain management
	r.Route("/domains", func(r chi.Router) {
		r.Get("/", h.ListDomains)
		r.Post("/", h.CreateDomain)
		r.Get("/{domainId}", h.GetDomain)

		// Domain admin routes
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireDomainAccess("domainId"))
			r.Use(middleware.RequireDomainAdmin())

			r.Put("/{domainId}", h.UpdateDomain)
			r.Delete("/{domainId}", h.DeleteDomain)
			r.Post("/{domainId}/verify", h.VerifyDomain)
			r.Get("/{domainId}/verification-status", h.GetDomainVerificationStatus)

			// Domain user management
			r.Get("/{domainId}/users", h.ListDomainUsers)
			r.Post("/{domainId}/users", h.AddDomainUser)
			r.Delete("/{domainId}/users/{userId}", h.RemoveDomainUser)
			r.Put("/{domainId}/users/{userId}/permissions", h.UpdateDomainUserPermissions)
		})
	})

	// User management (org admin)
	r.Route("/users", func(r chi.Router) {
		r.Use(middleware.RequireOrganizationAdmin())

		r.Get("/", h.ListUsers)
		r.Get("/{userId}", h.GetUser)
		r.Put("/{userId}", h.UpdateUser)
		r.Delete("/{userId}", h.DeleteUser)
		r.Post("/{userId}/suspend", h.SuspendUser)
		r.Post("/{userId}/unsuspend", h.UnsuspendUser)
		r.Post("/{userId}/reset-password", h.AdminResetPassword)
	})
}

// Organization handlers

// ListOrganizations lists organizations for the current user.
// GET /api/admin/organizations
func (h *AdminHandler) ListOrganizations(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	orgs, err := h.adminService.ListOrganizations(r.Context(), claims.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, orgs)
}

// CreateOrganization creates a new organization.
// POST /api/admin/organizations
func (h *AdminHandler) CreateOrganization(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.CreateOrganizationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	org, err := h.adminService.CreateOrganization(r.Context(), &req, claims.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, org)
}

// GetOrganization gets an organization by ID.
// GET /api/admin/organizations/{orgId}
func (h *AdminHandler) GetOrganization(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid organization ID")
		return
	}

	org, err := h.adminService.GetOrganization(r.Context(), orgID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, org)
}

// UpdateOrganization updates an organization.
// PUT /api/admin/organizations/{orgId}
func (h *AdminHandler) UpdateOrganization(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid organization ID")
		return
	}

	var req models.UpdateOrganizationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	org, err := h.adminService.UpdateOrganization(r.Context(), orgID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, org)
}

// DeleteOrganization deletes an organization.
// DELETE /api/admin/organizations/{orgId}
func (h *AdminHandler) DeleteOrganization(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid organization ID")
		return
	}

	err = h.adminService.DeleteOrganization(r.Context(), orgID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListOrganizationMembers lists members of an organization.
// GET /api/admin/organizations/{orgId}/members
func (h *AdminHandler) ListOrganizationMembers(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid organization ID")
		return
	}

	members, err := h.adminService.ListOrganizationMembers(r.Context(), orgID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, members)
}

// AddOrganizationMember adds a member to an organization.
// POST /api/admin/organizations/{orgId}/members
func (h *AdminHandler) AddOrganizationMember(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid organization ID")
		return
	}

	var req models.AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	member, err := h.adminService.AddOrganizationMember(r.Context(), orgID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, member)
}

// RemoveOrganizationMember removes a member from an organization.
// DELETE /api/admin/organizations/{orgId}/members/{userId}
func (h *AdminHandler) RemoveOrganizationMember(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid organization ID")
		return
	}

	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	err = h.adminService.RemoveOrganizationMember(r.Context(), orgID, userID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UpdateMemberRole updates a member's role in an organization.
// PUT /api/admin/organizations/{orgId}/members/{userId}/role
func (h *AdminHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid organization ID")
		return
	}

	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	var req models.UpdateMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	err = h.adminService.UpdateMemberRole(r.Context(), orgID, userID, req.Role)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Role updated successfully",
	})
}

// Domain handlers

// ListDomains lists domains for the current user.
// GET /api/admin/domains
func (h *AdminHandler) ListDomains(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	domains, err := h.adminService.ListDomains(r.Context(), claims.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, domains)
}

// CreateDomain creates a new domain.
// POST /api/admin/domains
func (h *AdminHandler) CreateDomain(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.CreateDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	domain, err := h.adminService.CreateDomain(r.Context(), &req, claims.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, domain)
}

// GetDomain gets a domain by ID.
// GET /api/admin/domains/{domainId}
func (h *AdminHandler) GetDomain(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	domain, err := h.adminService.GetDomain(r.Context(), domainID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, domain)
}

// UpdateDomain updates a domain.
// PUT /api/admin/domains/{domainId}
func (h *AdminHandler) UpdateDomain(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	var req models.UpdateDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	domain, err := h.adminService.UpdateDomain(r.Context(), domainID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, domain)
}

// DeleteDomain deletes a domain.
// DELETE /api/admin/domains/{domainId}
func (h *AdminHandler) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	err = h.adminService.DeleteDomain(r.Context(), domainID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// VerifyDomain initiates domain verification.
// POST /api/admin/domains/{domainId}/verify
func (h *AdminHandler) VerifyDomain(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	result, err := h.adminService.VerifyDomain(r.Context(), domainID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// GetDomainVerificationStatus gets domain verification status.
// GET /api/admin/domains/{domainId}/verification-status
func (h *AdminHandler) GetDomainVerificationStatus(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	status, err := h.adminService.GetDomainVerificationStatus(r.Context(), domainID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, status)
}

// ListDomainUsers lists users with access to a domain.
// GET /api/admin/domains/{domainId}/users
func (h *AdminHandler) ListDomainUsers(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	users, err := h.adminService.ListDomainUsers(r.Context(), domainID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, users)
}

// AddDomainUser adds a user to a domain.
// POST /api/admin/domains/{domainId}/users
func (h *AdminHandler) AddDomainUser(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	var req models.AddDomainUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	user, err := h.adminService.AddDomainUser(r.Context(), domainID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, user)
}

// RemoveDomainUser removes a user from a domain.
// DELETE /api/admin/domains/{domainId}/users/{userId}
func (h *AdminHandler) RemoveDomainUser(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	err = h.adminService.RemoveDomainUser(r.Context(), domainID, userID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UpdateDomainUserPermissions updates a user's permissions on a domain.
// PUT /api/admin/domains/{domainId}/users/{userId}/permissions
func (h *AdminHandler) UpdateDomainUserPermissions(w http.ResponseWriter, r *http.Request) {
	domainIDStr := chi.URLParam(r, "domainId")
	domainID, err := uuid.Parse(domainIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid domain ID")
		return
	}

	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	var req models.UpdateDomainPermissionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	err = h.adminService.UpdateDomainUserPermissions(r.Context(), domainID, userID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Permissions updated successfully",
	})
}

// User handlers

// ListUsers lists users in the organization.
// GET /api/admin/users
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	// Parse query parameters
	query := r.URL.Query().Get("q")
	page := parseIntQuery(r, "page", 1)
	limit := parseIntQuery(r, "limit", 20)

	users, err := h.adminService.ListUsers(r.Context(), claims.OrganizationID, query, page, limit)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, users)
}

// GetUser gets a user by ID.
// GET /api/admin/users/{userId}
func (h *AdminHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	user, err := h.adminService.GetUser(r.Context(), userID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// UpdateUser updates a user.
// PUT /api/admin/users/{userId}
func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	var req models.AdminUpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	user, err := h.adminService.UpdateUser(r.Context(), userID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// DeleteUser deletes a user.
// DELETE /api/admin/users/{userId}
func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	err = h.adminService.DeleteUser(r.Context(), userID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// SuspendUser suspends a user.
// POST /api/admin/users/{userId}/suspend
func (h *AdminHandler) SuspendUser(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	var req models.SuspendUserRequest
	json.NewDecoder(r.Body).Decode(&req)

	err = h.adminService.SuspendUser(r.Context(), userID, req.Reason)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "User suspended successfully",
	})
}

// UnsuspendUser unsuspends a user.
// POST /api/admin/users/{userId}/unsuspend
func (h *AdminHandler) UnsuspendUser(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	err = h.adminService.UnsuspendUser(r.Context(), userID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "User unsuspended successfully",
	})
}

// AdminResetPassword resets a user's password (admin action).
// POST /api/admin/users/{userId}/reset-password
func (h *AdminHandler) AdminResetPassword(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid user ID")
		return
	}

	err = h.adminService.AdminResetPassword(r.Context(), userID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Password reset email sent",
	})
}

// Helper function to parse integer query parameters
func parseIntQuery(r *http.Request, key string, defaultValue int) int {
	value := r.URL.Query().Get(key)
	if value == "" {
		return defaultValue
	}

	var result int
	err := json.Unmarshal([]byte(value), &result)
	if err != nil {
		return defaultValue
	}
	return result
}
