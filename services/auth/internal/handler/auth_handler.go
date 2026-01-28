// Package handler provides HTTP handlers for the auth service.
package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/middleware"
	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// AuthHandler handles authentication-related HTTP requests.
type AuthHandler struct {
	authService *service.AuthService
	validate    *validator.Validate
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		validate:    validator.New(validator.WithRequiredStructEnabled()),
	}
}

// RegisterRoutes registers the auth handler routes.
func (h *AuthHandler) RegisterRoutes(r chi.Router, authMiddleware *middleware.AuthMiddleware) {
	// Public routes
	r.Post("/register", h.Register)
	r.Post("/login", h.Login)
	r.Post("/refresh", h.RefreshToken)
	r.Post("/mfa/verify", h.VerifyMFA)
	r.Get("/verify-email/{token}", h.VerifyEmail)
	r.Post("/forgot-password", h.ForgotPassword)
	r.Post("/reset-password", h.ResetPassword)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware.Authenticate)

		// Email management
		r.Post("/email", h.AddEmail)
		r.Delete("/email/{emailId}", h.DeleteEmail)
		r.Put("/email/{emailId}/primary", h.SetPrimaryEmail)
		r.Post("/email/{emailId}/resend-verification", h.ResendEmailVerification)

		// Profile
		r.Get("/me", h.GetCurrentUser)
		r.Put("/me", h.UpdateProfile)
		r.Put("/me/password", h.ChangePassword)

		// Sessions
		r.Get("/sessions", h.GetSessions)
		r.Delete("/sessions/{sessionId}", h.RevokeSession)
		r.Delete("/sessions", h.RevokeAllSessions)

		// MFA management
		r.Post("/mfa/enable", h.EnableMFA)
		r.Post("/mfa/disable", h.DisableMFA)
		r.Get("/mfa/backup-codes", h.GetBackupCodes)
		r.Post("/mfa/backup-codes/regenerate", h.RegenerateBackupCodes)

		// Logout
		r.Post("/logout", h.Logout)
	})
}

// Register handles user registration.
// POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	// Extract client info
	clientIP := getClientIP(r)
	userAgent := r.UserAgent()

	response, err := h.authService.Register(r.Context(), &req, clientIP, userAgent)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, response)
}

// Login handles user login.
// POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	// Extract client info
	clientIP := getClientIP(r)
	userAgent := r.UserAgent()

	response, err := h.authService.Login(r.Context(), &req, clientIP, userAgent)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	// Set cookies for tokens (in addition to response body)
	setTokenCookies(w, response)

	respondJSON(w, http.StatusOK, response)
}

// RefreshToken handles token refresh.
// POST /api/auth/refresh
func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req models.RefreshTokenRequest
	
	// Try to get refresh token from cookie first
	if cookie, err := r.Cookie("refresh_token"); err == nil {
		req.RefreshToken = cookie.Value
	}

	// Override with body if provided
	if r.Body != nil {
		var bodyReq models.RefreshTokenRequest
		if err := json.NewDecoder(r.Body).Decode(&bodyReq); err == nil && bodyReq.RefreshToken != "" {
			req.RefreshToken = bodyReq.RefreshToken
		}
	}

	if req.RefreshToken == "" {
		respondError(w, http.StatusBadRequest, "invalid_request", "Refresh token required")
		return
	}

	// Extract client info
	clientIP := getClientIP(r)
	userAgent := r.UserAgent()

	response, err := h.authService.RefreshToken(r.Context(), req.RefreshToken, clientIP, userAgent)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	setTokenCookies(w, response)
	respondJSON(w, http.StatusOK, response)
}

// VerifyMFA handles MFA verification during login.
// POST /api/auth/mfa/verify
func (h *AuthHandler) VerifyMFA(w http.ResponseWriter, r *http.Request) {
	var req models.MFAVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	clientIP := getClientIP(r)
	userAgent := r.UserAgent()

	response, err := h.authService.VerifyMFA(r.Context(), &req, clientIP, userAgent)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	setTokenCookies(w, response)
	respondJSON(w, http.StatusOK, response)
}

// AddEmail handles adding a new email address.
// POST /api/auth/email
func (h *AuthHandler) AddEmail(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.AddEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	email, err := h.authService.AddEmail(r.Context(), claims.UserID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, email)
}

// VerifyEmail handles email verification.
// GET /api/auth/verify-email/{token}
func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		respondError(w, http.StatusBadRequest, "invalid_request", "Verification token required")
		return
	}

	err := h.authService.VerifyEmail(r.Context(), token)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Email verified successfully",
	})
}

// DeleteEmail handles email address removal.
// DELETE /api/auth/email/{emailId}
func (h *AuthHandler) DeleteEmail(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	emailIDStr := chi.URLParam(r, "emailId")
	emailID, err := uuid.Parse(emailIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid email ID")
		return
	}

	err = h.authService.DeleteEmail(r.Context(), claims.UserID, emailID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// SetPrimaryEmail handles setting a primary email.
// PUT /api/auth/email/{emailId}/primary
func (h *AuthHandler) SetPrimaryEmail(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	emailIDStr := chi.URLParam(r, "emailId")
	emailID, err := uuid.Parse(emailIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid email ID")
		return
	}

	err = h.authService.SetPrimaryEmail(r.Context(), claims.UserID, emailID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Primary email updated successfully",
	})
}

// ResendEmailVerification resends verification email.
// POST /api/auth/email/{emailId}/resend-verification
func (h *AuthHandler) ResendEmailVerification(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	emailIDStr := chi.URLParam(r, "emailId")
	emailID, err := uuid.Parse(emailIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid email ID")
		return
	}

	err = h.authService.ResendVerificationEmail(r.Context(), claims.UserID, emailID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Verification email sent",
	})
}

// GetCurrentUser returns the current authenticated user.
// GET /api/auth/me
func (h *AuthHandler) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	user, err := h.authService.GetUserWithContext(r.Context(), claims.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// UpdateProfile updates the user's profile.
// PUT /api/auth/me
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	user, err := h.authService.UpdateProfile(r.Context(), claims.UserID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// ChangePassword handles password change.
// PUT /api/auth/me/password
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	err := h.authService.ChangePassword(r.Context(), claims.UserID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Password changed successfully",
	})
}

// ForgotPassword handles password reset request.
// POST /api/auth/forgot-password
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req models.ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	// Always return success to prevent email enumeration
	_ = h.authService.ForgotPassword(r.Context(), req.Email)

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "If the email exists, a password reset link has been sent",
	})
}

// ResetPassword handles password reset.
// POST /api/auth/reset-password
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req models.ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	err := h.authService.ResetPassword(r.Context(), &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Password reset successfully",
	})
}

// GetSessions returns all active sessions for the user.
// GET /api/auth/sessions
func (h *AuthHandler) GetSessions(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	sessions, err := h.authService.GetUserSessions(r.Context(), claims.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, sessions)
}

// RevokeSession revokes a specific session.
// DELETE /api/auth/sessions/{sessionId}
func (h *AuthHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid session ID")
		return
	}

	err = h.authService.RevokeSession(r.Context(), claims.UserID, sessionID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// RevokeAllSessions revokes all sessions except the current one.
// DELETE /api/auth/sessions
func (h *AuthHandler) RevokeAllSessions(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	// Get current session ID from token
	currentSessionID := claims.SessionID

	err := h.authService.RevokeAllSessions(r.Context(), claims.UserID, currentSessionID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "All other sessions revoked",
	})
}

// EnableMFA enables MFA for the user.
// POST /api/auth/mfa/enable
func (h *AuthHandler) EnableMFA(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.EnableMFARequest
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&req)
	}

	response, err := h.authService.EnableMFA(r.Context(), claims.UserID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, response)
}

// DisableMFA disables MFA for the user.
// POST /api/auth/mfa/disable
func (h *AuthHandler) DisableMFA(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.DisableMFARequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := h.validate.Struct(req); err != nil {
		respondValidationError(w, err)
		return
	}

	err := h.authService.DisableMFA(r.Context(), claims.UserID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "MFA disabled successfully",
	})
}

// GetBackupCodes returns MFA backup codes.
// GET /api/auth/mfa/backup-codes
func (h *AuthHandler) GetBackupCodes(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	codes, err := h.authService.GetBackupCodes(r.Context(), claims.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string][]string{
		"backup_codes": codes,
	})
}

// RegenerateBackupCodes regenerates MFA backup codes.
// POST /api/auth/mfa/backup-codes/regenerate
func (h *AuthHandler) RegenerateBackupCodes(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var req models.RegenerateBackupCodesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	codes, err := h.authService.RegenerateBackupCodes(r.Context(), claims.UserID, &req)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string][]string{
		"backup_codes": codes,
	})
}

// Logout handles user logout.
// POST /api/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	// Revoke current session
	if claims.SessionID != uuid.Nil {
		if err := h.authService.RevokeSession(r.Context(), claims.UserID, claims.SessionID); err != nil {
			log.Error().Err(err).Msg("Failed to revoke session on logout")
		}
	}

	// Clear cookies
	clearTokenCookies(w)

	w.WriteHeader(http.StatusNoContent)
}

// Helper functions

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Error().Err(err).Msg("Failed to encode response")
		}
	}
}

func respondError(w http.ResponseWriter, status int, code string, message string) {
	respondJSON(w, status, models.ErrorResponse{
		Error:   code,
		Message: message,
	})
}

func respondValidationError(w http.ResponseWriter, err error) {
	var details []models.ValidationErrorDetail
	if validationErrors, ok := err.(validator.ValidationErrors); ok {
		for _, e := range validationErrors {
			details = append(details, models.ValidationErrorDetail{
				Field:   e.Field(),
				Message: formatValidationError(e),
			})
		}
	}

	respondJSON(w, http.StatusBadRequest, models.ErrorResponse{
		Error:   "validation_error",
		Message: "Validation failed",
		Details: details,
	})
}

func formatValidationError(e validator.FieldError) string {
	switch e.Tag() {
	case "required":
		return "This field is required"
	case "email":
		return "Must be a valid email address"
	case "min":
		return "Value is too short"
	case "max":
		return "Value is too long"
	case "uuid":
		return "Must be a valid UUID"
	case "url":
		return "Must be a valid URL"
	default:
		return "Invalid value"
	}
}

func handleServiceError(w http.ResponseWriter, err error) {
	switch {
	case err == service.ErrUserNotFound:
		respondError(w, http.StatusNotFound, "user_not_found", "User not found")
	case err == service.ErrInvalidCredentials:
		respondError(w, http.StatusUnauthorized, "invalid_credentials", "Invalid email or password")
	case err == service.ErrEmailAlreadyExists:
		respondError(w, http.StatusConflict, "email_exists", "Email address already in use")
	case err == service.ErrEmailNotVerified:
		respondError(w, http.StatusForbidden, "email_not_verified", "Email address not verified")
	case err == service.ErrInvalidToken:
		respondError(w, http.StatusUnauthorized, "invalid_token", "Invalid or expired token")
	case err == service.ErrMFARequired:
		respondError(w, http.StatusForbidden, "mfa_required", "MFA verification required")
	case err == service.ErrAccountLocked:
		respondError(w, http.StatusForbidden, "account_locked", "Account is locked due to too many failed attempts")
	case err == service.ErrDomainNotFound:
		respondError(w, http.StatusNotFound, "domain_not_found", "Domain not found")
	case err == service.ErrDomainAccessDenied:
		respondError(w, http.StatusForbidden, "domain_access_denied", "You don't have access to this domain")
	case err == service.ErrSessionNotFound:
		respondError(w, http.StatusNotFound, "session_not_found", "Session not found")
	case err == service.ErrPasswordTooWeak:
		respondError(w, http.StatusBadRequest, "password_too_weak", "Password does not meet security requirements")
	case err == service.ErrCannotDeletePrimaryEmail:
		respondError(w, http.StatusBadRequest, "cannot_delete_primary", "Cannot delete primary email address")
	case err == service.ErrSSORequired:
		respondError(w, http.StatusForbidden, "sso_required", "This domain requires SSO login")
	default:
		log.Error().Err(err).Msg("Unhandled service error")
		respondError(w, http.StatusInternalServerError, "internal_error", "An internal error occurred")
	}
}

func setTokenCookies(w http.ResponseWriter, response *models.AuthResponse) {
	// Set access token cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    response.AccessToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(15 * time.Minute / time.Second), // 15 minutes
	})

	// Set refresh token cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    response.RefreshToken,
		Path:     "/api/auth/refresh",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(7 * 24 * time.Hour / time.Second), // 7 days
	})
}

func clearTokenCookies(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/auth/refresh",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}
