// Package models provides request and response DTOs.
package models

import (
	"time"

	"github.com/google/uuid"
)

// ============================================================
// AUTHENTICATION REQUESTS
// ============================================================

// RegisterRequest is the request body for user registration.
type RegisterRequest struct {
	Email       string `json:"email" validate:"required,email"`
	Password    string `json:"password" validate:"required,min=12"`
	DisplayName string `json:"name" validate:"required,min=1,max=255"`
}

// LoginRequest is the request body for user login.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
	MFACode  string `json:"mfa_code,omitempty" validate:"omitempty,len=6"`
}

// RefreshTokenRequest is the request body for token refresh.
type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

// AddEmailRequest is the request body for adding an email address.
type AddEmailRequest struct {
	Email           string `json:"email" validate:"required,email"`
	CreateMailbox   bool   `json:"create_mailbox"`
}

// ChangePrimaryEmailRequest changes the primary email address.
type ChangePrimaryEmailRequest struct {
	EmailID uuid.UUID `json:"email_id" validate:"required"`
}

// ForgotPasswordRequest initiates password reset.
type ForgotPasswordRequest struct {
	Email string `json:"email" validate:"required,email"`
}

// ResetPasswordRequest completes password reset.
type ResetPasswordRequest struct {
	Token       string `json:"token" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=12"`
}

// ChangePasswordRequest changes user password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=12"`
}

// EnableMFARequest enables MFA for user.
type EnableMFARequest struct {
	Code string `json:"code" validate:"required,len=6"`
}

// VerifyMFARequest verifies MFA code.
type VerifyMFARequest struct {
	Code string `json:"code" validate:"required,len=6"`
}

// ============================================================
// SSO REQUESTS
// ============================================================

// SSOConfigRequest configures SSO for a domain.
type SSOConfigRequest struct {
	Provider           string      `json:"provider" validate:"required,oneof=saml oidc"`
	SAMLConfig         *SAMLConfig `json:"saml_config,omitempty" validate:"required_if=Provider saml"`
	OIDCConfig         *OIDCConfig `json:"oidc_config,omitempty" validate:"required_if=Provider oidc"`
	AutoProvisionUsers bool        `json:"auto_provision_users"`
	DefaultRole        string      `json:"default_role" validate:"omitempty,oneof=admin member viewer"`
	EnforceSSO         bool        `json:"enforce_sso"`
}

// ============================================================
// AUTHENTICATION RESPONSES
// ============================================================

// AuthResponse is the response for successful authentication.
type AuthResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	TokenType    string       `json:"token_type"`
	ExpiresIn    int64        `json:"expires_in"`
	User         UserResponse `json:"user"`
}

// UserResponse is the user data in auth responses.
type UserResponse struct {
	ID             uuid.UUID             `json:"id"`
	OrganizationID uuid.UUID             `json:"organization_id"`
	Email          string                `json:"email,omitempty"`
	DisplayName    string                `json:"display_name"`
	Role           string                `json:"role"`
	Status         string                `json:"status"`
	AvatarURL      *string               `json:"avatar_url,omitempty"`
	MFAEnabled     bool                  `json:"mfa_enabled"`
	EmailAddresses []EmailAddressResponse `json:"email_addresses,omitempty"`
	Domains        []DomainAccessResponse `json:"domains,omitempty"`
	CreatedAt      interface{}           `json:"created_at"`
	UpdatedAt      interface{}           `json:"updated_at,omitempty"`
}

// EmailAddressResponse represents an email address in responses.
type EmailAddressResponse struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	DomainID     uuid.UUID `json:"domain_id"`
	DomainName   string    `json:"domain_name"`
	IsPrimary    bool      `json:"is_primary"`
	IsVerified   bool      `json:"is_verified"`
	HasMailbox   bool      `json:"has_mailbox"`
}

// DomainAccessResponse represents a domain the user can access.
type DomainAccessResponse struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	IsPrimary  bool      `json:"is_primary"`
	CanSend    bool      `json:"can_send"`
	CanManage  bool      `json:"can_manage"`
	HasSSO     bool      `json:"has_sso"`
}

// SSODiscoverResponse is the response for SSO discovery.
type SSODiscoverResponse struct {
	HasSSO        bool    `json:"has_sso"`
	Provider      string  `json:"provider,omitempty"`
	EnforceSSO    bool    `json:"enforce_sso"`
	SSOInitURL    string  `json:"sso_init_url,omitempty"`
	DomainID      *uuid.UUID `json:"domain_id,omitempty"`
	DomainName    string  `json:"domain_name,omitempty"`
}

// MFASetupResponse is the response for MFA setup initiation.
type MFASetupResponse struct {
	Secret      string   `json:"secret"`
	QRCodeURL   string   `json:"qr_code_url"`
	BackupCodes []string `json:"backup_codes"`
}

// SessionResponse represents a user session.
type SessionResponse struct {
	ID             uuid.UUID `json:"id"`
	UserAgent      string    `json:"user_agent,omitempty"`
	IPAddress      string    `json:"ip_address,omitempty"`
	LastActivityAt string    `json:"last_activity_at"`
	ExpiresAt      string    `json:"expires_at"`
	CreatedAt      string    `json:"created_at"`
	IsCurrent      bool      `json:"is_current"`
}

// ============================================================
// ADMIN RESPONSES
// ============================================================

// SSOConfigResponse is the response for SSO configuration.
type SSOConfigResponse struct {
	ID                 uuid.UUID   `json:"id"`
	DomainID           uuid.UUID   `json:"domain_id"`
	Provider           string      `json:"provider"`
	IsEnabled          bool        `json:"is_enabled"`
	EnforceSSO         bool        `json:"enforce_sso"`
	AutoProvisionUsers bool        `json:"auto_provision_users"`
	DefaultRole        string      `json:"default_role"`
	SAMLConfig         *SAMLConfig `json:"saml_config,omitempty"`
	OIDCConfig         *OIDCConfigResponse `json:"oidc_config,omitempty"`
	CreatedAt          string      `json:"created_at"`
	UpdatedAt          string      `json:"updated_at"`
}

// OIDCConfigResponse is OIDC config with secret redacted.
type OIDCConfigResponse struct {
	Issuer           string            `json:"issuer"`
	ClientID         string            `json:"client_id"`
	HasClientSecret  bool              `json:"has_client_secret"`
	Scopes           []string          `json:"scopes"`
	AuthorizationURL *string           `json:"authorization_url,omitempty"`
	TokenURL         *string           `json:"token_url,omitempty"`
	UserInfoURL      *string           `json:"userinfo_url,omitempty"`
	AttributeMapping map[string]string `json:"attribute_mapping"`
}

// ============================================================
// ERROR RESPONSES
// ============================================================

// ErrorResponse is the standard error response.
type ErrorResponse struct {
	Error   string            `json:"error"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
	Code    string            `json:"code,omitempty"`
}

// ValidationError represents a validation error.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrorResponse is the response for validation errors.
type ValidationErrorResponse struct {
	Error   string            `json:"error"`
	Message string            `json:"message"`
	Errors  []ValidationError `json:"errors"`
}

// ValidationErrorDetail represents a validation error detail.
type ValidationErrorDetail struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ============================================================
// MFA REQUESTS
// ============================================================

// MFAVerifyRequest is the request for MFA verification during login.
type MFAVerifyRequest struct {
	MFAToken string `json:"mfa_token" validate:"required"`
	Code     string `json:"code" validate:"required,len=6"`
}

// DisableMFARequest is the request to disable MFA.
type DisableMFARequest struct {
	Password string `json:"password" validate:"required"`
	Code     string `json:"code" validate:"required,len=6"`
}

// RegenerateBackupCodesRequest is the request to regenerate backup codes.
type RegenerateBackupCodesRequest struct {
	Password string `json:"password" validate:"required"`
}

// ============================================================
// PROFILE REQUESTS
// ============================================================

// UpdateProfileRequest is the request to update user profile.
type UpdateProfileRequest struct {
	DisplayName string  `json:"display_name" validate:"omitempty,min=1,max=255"`
	AvatarURL   *string `json:"avatar_url" validate:"omitempty,url"`
	Timezone    string  `json:"timezone" validate:"omitempty"`
	Locale      string  `json:"locale" validate:"omitempty"`
}

// ============================================================
// SSO REQUESTS
// ============================================================

// SSOInitiateRequest is the request to initiate SSO login.
type SSOInitiateRequest struct {
	Email       string `json:"email" validate:"required,email"`
	RedirectURL string `json:"redirect_url" validate:"omitempty,url"`
}

// SSOInitiateResponse is the response for SSO initiation.
type SSOInitiateResponse struct {
	RedirectURL string `json:"redirect_url"`
	Provider    string `json:"provider"`
}

// ============================================================
// ORGANIZATION REQUESTS/RESPONSES
// ============================================================

// CreateOrganizationRequest is the request to create an organization.
type CreateOrganizationRequest struct {
	Name string `json:"name" validate:"required,min=1,max=255"`
	Slug string `json:"slug" validate:"omitempty,min=1,max=100"`
}

// UpdateOrganizationRequest is the request to update an organization.
type UpdateOrganizationRequest struct {
	Name string `json:"name" validate:"omitempty,min=1,max=255"`
	Slug string `json:"slug" validate:"omitempty,min=1,max=100"`
}

// OrganizationResponse is the organization response.
type OrganizationResponse struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	Plan      string    `json:"plan"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// MemberResponse is the response for an organization member.
type MemberResponse struct {
	UserID   uuid.UUID `json:"user_id"`
	Email    string    `json:"email"`
	Name     string    `json:"name"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

// AddMemberRequest is the request to add a member.
type AddMemberRequest struct {
	Email string `json:"email" validate:"required,email"`
	Role  string `json:"role" validate:"required,oneof=admin member viewer"`
}

// UpdateMemberRoleRequest is the request to update a member's role.
type UpdateMemberRoleRequest struct {
	Role string `json:"role" validate:"required,oneof=admin member viewer owner"`
}

// ============================================================
// DOMAIN REQUESTS/RESPONSES
// ============================================================

// CreateDomainRequest is the request to create a domain.
type CreateDomainRequest struct {
	OrganizationID uuid.UUID `json:"organization_id" validate:"required"`
	DomainName     string    `json:"domain_name" validate:"required,fqdn"`
}

// UpdateDomainRequest is the request to update a domain.
type UpdateDomainRequest struct {
	IsDefault *bool `json:"is_default"`
}

// DomainResponse is the domain response.
type DomainResponse struct {
	ID                 uuid.UUID `json:"id"`
	OrganizationID     uuid.UUID `json:"organization_id"`
	DomainName         string    `json:"domain_name"`
	Status             string    `json:"status"`
	VerificationStatus string    `json:"verification_status"`
	VerificationToken  string    `json:"verification_token,omitempty"`
	VerificationMethod string    `json:"verification_method,omitempty"`
	IsDefault          bool      `json:"is_default"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// DomainVerificationResponse is the response for domain verification.
type DomainVerificationResponse struct {
	DomainID     uuid.UUID `json:"domain_id"`
	DomainName   string    `json:"domain_name"`
	Verified     bool      `json:"verified"`
	Status       string    `json:"status"`
	Token        string    `json:"token,omitempty"`
	Errors       []string  `json:"errors,omitempty"`
	Instructions string    `json:"instructions,omitempty"`
}

// DomainUserResponse is the response for a domain user.
type DomainUserResponse struct {
	UserID           uuid.UUID `json:"user_id"`
	Email            string    `json:"email"`
	Name             string    `json:"name"`
	CanSendAs        bool      `json:"can_send_as"`
	CanManage        bool      `json:"can_manage"`
	CanViewAnalytics bool      `json:"can_view_analytics"`
	CanManageUsers   bool      `json:"can_manage_users"`
	GrantedAt        time.Time `json:"granted_at"`
}

// AddDomainUserRequest is the request to add a user to a domain.
type AddDomainUserRequest struct {
	Email            string `json:"email" validate:"required,email"`
	CanSendAs        bool   `json:"can_send_as"`
	CanManage        bool   `json:"can_manage"`
	CanViewAnalytics bool   `json:"can_view_analytics"`
	CanManageUsers   bool   `json:"can_manage_users"`
}

// UpdateDomainPermissionsRequest is the request to update domain permissions.
type UpdateDomainPermissionsRequest struct {
	CanSendAs        *bool `json:"can_send_as"`
	CanManage        *bool `json:"can_manage"`
	CanViewAnalytics *bool `json:"can_view_analytics"`
	CanManageUsers   *bool `json:"can_manage_users"`
}

// ============================================================
// USER MANAGEMENT REQUESTS/RESPONSES
// ============================================================

// AdminUpdateUserRequest is the admin request to update a user.
type AdminUpdateUserRequest struct {
	DisplayName string `json:"display_name" validate:"omitempty,min=1,max=255"`
	Status      string `json:"status" validate:"omitempty,oneof=active suspended"`
	Role        string `json:"role" validate:"omitempty,oneof=admin member viewer"`
}

// SuspendUserRequest is the request to suspend a user.
type SuspendUserRequest struct {
	Reason string `json:"reason" validate:"omitempty,max=500"`
}

// PaginatedUsersResponse is a paginated list of users.
type PaginatedUsersResponse struct {
	Users []*UserResponse `json:"users"`
	Total int             `json:"total"`
	Page  int             `json:"page"`
	Limit int             `json:"limit"`
}

// ============================================================
// SSO TEST RESPONSE
// ============================================================

// SSOTestResponse is the response for SSO configuration test.
type SSOTestResponse struct {
	Success bool              `json:"success"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// OrganizationMember represents an organization membership.
type OrganizationMember struct {
	OrganizationID uuid.UUID `json:"organization_id"`
	UserID         uuid.UUID `json:"user_id"`
	Role           string    `json:"role"`
	JoinedAt       time.Time `json:"joined_at"`
}
