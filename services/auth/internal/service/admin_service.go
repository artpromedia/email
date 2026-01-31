// Package service provides business logic for the auth service.
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/artpromedia/email/services/auth/internal/repository"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// AdminService handles admin operations.
type AdminService struct {
	repo         *repository.Repository
	redis        *redis.Client
	config       *config.Config
	emailService *EmailService
}

// NewAdminService creates a new AdminService.
func NewAdminService(repo *repository.Repository, redis *redis.Client, cfg *config.Config) *AdminService {
	return &AdminService{
		repo:         repo,
		redis:        redis,
		config:       cfg,
		emailService: NewEmailService(&cfg.Email),
	}
}

// Admin errors
var (
	ErrOrganizationNotFound   = errors.New("organization not found")
	ErrOrganizationExists     = errors.New("organization already exists")
	ErrDomainExists           = errors.New("domain already exists")
	ErrMemberNotFound         = errors.New("member not found")
	ErrCannotRemoveOwner      = errors.New("cannot remove organization owner")
	ErrInvalidRole            = errors.New("invalid role")
	ErrDomainVerificationFailed = errors.New("domain verification failed")
)

// Organization methods

// ListOrganizations lists organizations the user has access to.
func (s *AdminService) ListOrganizations(ctx context.Context, userID uuid.UUID) ([]*models.OrganizationResponse, error) {
	orgs, err := s.repo.GetOrganizationsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list organizations: %w", err)
	}

	var responses []*models.OrganizationResponse
	for _, org := range orgs {
		responses = append(responses, &models.OrganizationResponse{
			ID:          org.ID,
			Name:        org.Name,
			Slug:        org.Slug,
			Plan:        org.Plan,
			Status:      org.Status,
			CreatedAt:   org.CreatedAt,
			UpdatedAt:   org.UpdatedAt,
		})
	}

	return responses, nil
}

// CreateOrganization creates a new organization.
func (s *AdminService) CreateOrganization(ctx context.Context, req *models.CreateOrganizationRequest, ownerID uuid.UUID) (*models.OrganizationResponse, error) {
	// Generate slug from name if not provided
	slug := req.Slug
	if slug == "" {
		slug = generateSlug(req.Name)
	}

	// Check if slug exists
	existing, _ := s.repo.GetOrganizationBySlug(ctx, slug)
	if existing != nil {
		return nil, ErrOrganizationExists
	}

	org := &models.Organization{
		ID:        uuid.New(),
		Name:      req.Name,
		Slug:      slug,
		OwnerID:   ownerID,
		Plan:      "free", // Default plan
		Status:    "active",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Create organization settings
	settings := &models.OrganizationSettings{
		ID:                  uuid.New(),
		OrganizationID:      org.ID,
		RequireMFA:          false,
		AllowedEmailDomains: nil,
		SessionDuration:     int(24 * time.Hour / time.Second),
		MaxLoginAttempts:    5,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	err := s.repo.CreateOrganization(ctx, org, settings)
	if err != nil {
		return nil, fmt.Errorf("failed to create organization: %w", err)
	}

	// Add owner as admin member
	membership := &models.OrganizationMember{
		OrganizationID: org.ID,
		UserID:         ownerID,
		Role:           "owner",
		JoinedAt:       time.Now(),
	}

	err = s.repo.CreateOrganizationMember(ctx, membership)
	if err != nil {
		log.Error().Err(err).Msg("Failed to add owner as member")
	}

	return &models.OrganizationResponse{
		ID:        org.ID,
		Name:      org.Name,
		Slug:      org.Slug,
		Plan:      org.Plan,
		Status:    org.Status,
		CreatedAt: org.CreatedAt,
		UpdatedAt: org.UpdatedAt,
	}, nil
}

// GetOrganization gets an organization by ID.
func (s *AdminService) GetOrganization(ctx context.Context, orgID uuid.UUID) (*models.OrganizationResponse, error) {
	org, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return nil, ErrOrganizationNotFound
	}

	return &models.OrganizationResponse{
		ID:        org.ID,
		Name:      org.Name,
		Slug:      org.Slug,
		Plan:      org.Plan,
		Status:    org.Status,
		CreatedAt: org.CreatedAt,
		UpdatedAt: org.UpdatedAt,
	}, nil
}

// UpdateOrganization updates an organization.
func (s *AdminService) UpdateOrganization(ctx context.Context, orgID uuid.UUID, req *models.UpdateOrganizationRequest) (*models.OrganizationResponse, error) {
	org, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return nil, ErrOrganizationNotFound
	}

	if req.Name != "" {
		org.Name = req.Name
	}
	if req.Slug != "" {
		// Check if new slug is available
		existing, _ := s.repo.GetOrganizationBySlug(ctx, req.Slug)
		if existing != nil && existing.ID != orgID {
			return nil, ErrOrganizationExists
		}
		org.Slug = req.Slug
	}

	org.UpdatedAt = time.Now()

	err = s.repo.UpdateOrganization(ctx, org)
	if err != nil {
		return nil, fmt.Errorf("failed to update organization: %w", err)
	}

	return &models.OrganizationResponse{
		ID:        org.ID,
		Name:      org.Name,
		Slug:      org.Slug,
		Plan:      org.Plan,
		Status:    org.Status,
		CreatedAt: org.CreatedAt,
		UpdatedAt: org.UpdatedAt,
	}, nil
}

// DeleteOrganization deletes an organization.
func (s *AdminService) DeleteOrganization(ctx context.Context, orgID uuid.UUID) error {
	org, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return ErrOrganizationNotFound
	}

	// Soft delete by setting status to deleted
	org.Status = "deleted"
	org.UpdatedAt = time.Now()

	return s.repo.UpdateOrganization(ctx, org)
}

// ListOrganizationMembers lists members of an organization.
func (s *AdminService) ListOrganizationMembers(ctx context.Context, orgID uuid.UUID) ([]*models.MemberResponse, error) {
	members, err := s.repo.GetOrganizationMembers(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to list members: %w", err)
	}

	var responses []*models.MemberResponse
	for _, m := range members {
		user, err := s.repo.GetUserByID(ctx, m.UserID)
		if err != nil {
			continue
		}

		responses = append(responses, &models.MemberResponse{
			UserID:    m.UserID,
			Email:     user.Email,
			Name:      user.DisplayName,
			Role:      m.Role,
			JoinedAt:  m.JoinedAt,
		})
	}

	return responses, nil
}

// AddOrganizationMember adds a member to an organization.
func (s *AdminService) AddOrganizationMember(ctx context.Context, orgID uuid.UUID, req *models.AddMemberRequest) (*models.MemberResponse, error) {
	// Find user by email
	user, err := s.repo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, ErrUserNotFound
	}

	// Check if already a member
	existing, _ := s.repo.GetOrganizationMember(ctx, orgID, user.ID)
	if existing != nil {
		return nil, errors.New("user is already a member")
	}

	// Validate role
	if !isValidRole(req.Role) {
		return nil, ErrInvalidRole
	}

	membership := &models.OrganizationMember{
		OrganizationID: orgID,
		UserID:         user.ID,
		Role:           req.Role,
		JoinedAt:       time.Now(),
	}

	err = s.repo.CreateOrganizationMember(ctx, membership)
	if err != nil {
		return nil, fmt.Errorf("failed to add member: %w", err)
	}

	return &models.MemberResponse{
		UserID:   user.ID,
		Email:    user.Email,
		Name:     user.DisplayName,
		Role:     req.Role,
		JoinedAt: membership.JoinedAt,
	}, nil
}

// RemoveOrganizationMember removes a member from an organization.
func (s *AdminService) RemoveOrganizationMember(ctx context.Context, orgID uuid.UUID, userID uuid.UUID) error {
	// Check if user is owner
	org, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return ErrOrganizationNotFound
	}

	if org.OwnerID == userID {
		return ErrCannotRemoveOwner
	}

	return s.repo.DeleteOrganizationMember(ctx, orgID, userID)
}

// UpdateMemberRole updates a member's role.
func (s *AdminService) UpdateMemberRole(ctx context.Context, orgID uuid.UUID, userID uuid.UUID, role string) error {
	// Validate role
	if !isValidRole(role) {
		return ErrInvalidRole
	}

	// Check if user is owner (can't change owner role)
	org, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return ErrOrganizationNotFound
	}

	if org.OwnerID == userID && role != "owner" {
		return errors.New("cannot change owner's role")
	}

	return s.repo.UpdateOrganizationMemberRole(ctx, orgID, userID, role)
}

// Domain methods

// ListDomains lists domains the user has access to.
func (s *AdminService) ListDomains(ctx context.Context, userID uuid.UUID) ([]*models.DomainResponse, error) {
	domains, err := s.repo.GetDomainsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list domains: %w", err)
	}

	var responses []*models.DomainResponse
	for _, d := range domains {
		responses = append(responses, &models.DomainResponse{
			ID:               d.ID,
			OrganizationID:   d.OrganizationID,
			DomainName:       d.DomainName,
			Status:           d.Status,
			VerificationStatus: d.VerificationStatus,
			IsDefault:        d.IsDefault,
			CreatedAt:        d.CreatedAt,
			UpdatedAt:        d.UpdatedAt,
		})
	}

	return responses, nil
}

// CreateDomain creates a new domain.
func (s *AdminService) CreateDomain(ctx context.Context, req *models.CreateDomainRequest, userID uuid.UUID) (*models.DomainResponse, error) {
	// Check if domain already exists
	existing, _ := s.repo.GetDomainByName(ctx, req.DomainName)
	if existing != nil {
		return nil, ErrDomainExists
	}

	// Generate verification token
	verificationToken := generateVerificationToken()

	domain := &models.Domain{
		ID:                   uuid.New(),
		OrganizationID:       req.OrganizationID,
		DomainName:           strings.ToLower(req.DomainName),
		Status:               "pending",
		VerificationStatus:   "unverified",
		VerificationToken:    verificationToken,
		VerificationMethod:   "dns_txt",
		IsDefault:            false,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	// Create domain settings
	settings := &models.DomainSettings{
		ID:                uuid.New(),
		DomainID:          domain.ID,
		CatchAllEnabled:   false,
		AutoCreateMailbox: false,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	err := s.repo.CreateDomain(ctx, domain, settings)
	if err != nil {
		return nil, fmt.Errorf("failed to create domain: %w", err)
	}

	// Grant the creating user admin access
	perm := &models.UserDomainPermission{
		ID:               uuid.New(),
		UserID:           userID,
		DomainID:         domain.ID,
		CanSendAs:        true,
		CanManage:        true,
		CanViewAnalytics: true,
		CanManageUsers:   true,
		GrantedAt:        time.Now(),
	}

	_ = s.repo.CreateUserDomainPermission(ctx, perm)

	return &models.DomainResponse{
		ID:                  domain.ID,
		OrganizationID:      domain.OrganizationID,
		DomainName:          domain.DomainName,
		Status:              domain.Status,
		VerificationStatus:  domain.VerificationStatus,
		VerificationToken:   domain.VerificationToken,
		VerificationMethod:  domain.VerificationMethod,
		IsDefault:           domain.IsDefault,
		CreatedAt:           domain.CreatedAt,
		UpdatedAt:           domain.UpdatedAt,
	}, nil
}

// GetDomain gets a domain by ID.
func (s *AdminService) GetDomain(ctx context.Context, domainID uuid.UUID) (*models.DomainResponse, error) {
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return nil, ErrDomainNotFound
	}

	return &models.DomainResponse{
		ID:                  domain.ID,
		OrganizationID:      domain.OrganizationID,
		DomainName:          domain.DomainName,
		Status:              domain.Status,
		VerificationStatus:  domain.VerificationStatus,
		VerificationToken:   domain.VerificationToken,
		VerificationMethod:  domain.VerificationMethod,
		IsDefault:           domain.IsDefault,
		CreatedAt:           domain.CreatedAt,
		UpdatedAt:           domain.UpdatedAt,
	}, nil
}

// UpdateDomain updates a domain.
func (s *AdminService) UpdateDomain(ctx context.Context, domainID uuid.UUID, req *models.UpdateDomainRequest) (*models.DomainResponse, error) {
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return nil, ErrDomainNotFound
	}

	if req.IsDefault != nil {
		domain.IsDefault = *req.IsDefault
	}

	domain.UpdatedAt = time.Now()

	err = s.repo.UpdateDomain(ctx, domain)
	if err != nil {
		return nil, fmt.Errorf("failed to update domain: %w", err)
	}

	return &models.DomainResponse{
		ID:                  domain.ID,
		OrganizationID:      domain.OrganizationID,
		DomainName:          domain.DomainName,
		Status:              domain.Status,
		VerificationStatus:  domain.VerificationStatus,
		IsDefault:           domain.IsDefault,
		CreatedAt:           domain.CreatedAt,
		UpdatedAt:           domain.UpdatedAt,
	}, nil
}

// DeleteDomain deletes a domain.
func (s *AdminService) DeleteDomain(ctx context.Context, domainID uuid.UUID) error {
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return ErrDomainNotFound
	}

	// Soft delete
	domain.Status = "deleted"
	domain.UpdatedAt = time.Now()

	return s.repo.UpdateDomain(ctx, domain)
}

// VerifyDomain verifies domain ownership.
func (s *AdminService) VerifyDomain(ctx context.Context, domainID uuid.UUID) (*models.DomainVerificationResponse, error) {
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return nil, ErrDomainNotFound
	}

	// Perform DNS verification
	verified := false
	var verificationErrors []string

	switch domain.VerificationMethod {
	case "dns_txt":
		verified, verificationErrors = verifyDNSTXT(domain.DomainName, domain.VerificationToken)
	case "dns_cname":
		verified, verificationErrors = verifyDNSCNAME(domain.DomainName, domain.VerificationToken)
	default:
		verified, verificationErrors = verifyDNSTXT(domain.DomainName, domain.VerificationToken)
	}

	if verified {
		domain.VerificationStatus = "verified"
		domain.Status = "active"
		domain.VerifiedAt = timePtr(time.Now())
	} else {
		domain.VerificationStatus = "failed"
	}

	domain.UpdatedAt = time.Now()
	_ = s.repo.UpdateDomain(ctx, domain)

	return &models.DomainVerificationResponse{
		DomainID:   domain.ID,
		DomainName: domain.DomainName,
		Verified:   verified,
		Status:     domain.VerificationStatus,
		Errors:     verificationErrors,
		Instructions: getDNSInstructions(domain.DomainName, domain.VerificationToken, domain.VerificationMethod),
	}, nil
}

// GetDomainVerificationStatus gets domain verification status.
func (s *AdminService) GetDomainVerificationStatus(ctx context.Context, domainID uuid.UUID) (*models.DomainVerificationResponse, error) {
	domain, err := s.repo.GetDomainByID(ctx, domainID)
	if err != nil {
		return nil, ErrDomainNotFound
	}

	return &models.DomainVerificationResponse{
		DomainID:     domain.ID,
		DomainName:   domain.DomainName,
		Verified:     domain.VerificationStatus == "verified",
		Status:       domain.VerificationStatus,
		Token:        domain.VerificationToken,
		Instructions: getDNSInstructions(domain.DomainName, domain.VerificationToken, domain.VerificationMethod),
	}, nil
}

// ListDomainUsers lists users with access to a domain.
func (s *AdminService) ListDomainUsers(ctx context.Context, domainID uuid.UUID) ([]*models.DomainUserResponse, error) {
	permissions, err := s.repo.GetDomainPermissions(ctx, domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to list domain users: %w", err)
	}

	var responses []*models.DomainUserResponse
	for _, p := range permissions {
		user, err := s.repo.GetUserByID(ctx, p.UserID)
		if err != nil {
			continue
		}

		responses = append(responses, &models.DomainUserResponse{
			UserID:           p.UserID,
			Email:            user.Email,
			Name:             user.DisplayName,
			CanSendAs:        p.CanSendAs,
			CanManage:        p.CanManage,
			CanViewAnalytics: p.CanViewAnalytics,
			CanManageUsers:   p.CanManageUsers,
			GrantedAt:        p.GrantedAt,
		})
	}

	return responses, nil
}

// AddDomainUser adds a user to a domain with permissions.
func (s *AdminService) AddDomainUser(ctx context.Context, domainID uuid.UUID, req *models.AddDomainUserRequest) (*models.DomainUserResponse, error) {
	// Find user by email
	user, err := s.repo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, ErrUserNotFound
	}

	// Check if user already has access
	existing, _ := s.repo.GetUserDomainPermission(ctx, user.ID, domainID)
	if existing != nil {
		return nil, errors.New("user already has access to this domain")
	}

	perm := &models.UserDomainPermission{
		ID:               uuid.New(),
		UserID:           user.ID,
		DomainID:         domainID,
		CanSendAs:        req.CanSendAs,
		CanManage:        req.CanManage,
		CanViewAnalytics: req.CanViewAnalytics,
		CanManageUsers:   req.CanManageUsers,
		GrantedAt:        time.Now(),
	}

	err = s.repo.CreateUserDomainPermission(ctx, perm)
	if err != nil {
		return nil, fmt.Errorf("failed to add domain user: %w", err)
	}

	return &models.DomainUserResponse{
		UserID:           user.ID,
		Email:            user.Email,
		Name:             user.DisplayName,
		CanSendAs:        perm.CanSendAs,
		CanManage:        perm.CanManage,
		CanViewAnalytics: perm.CanViewAnalytics,
		CanManageUsers:   perm.CanManageUsers,
		GrantedAt:        perm.GrantedAt,
	}, nil
}

// RemoveDomainUser removes a user from a domain.
func (s *AdminService) RemoveDomainUser(ctx context.Context, domainID uuid.UUID, userID uuid.UUID) error {
	return s.repo.DeleteUserDomainPermission(ctx, userID, domainID)
}

// UpdateDomainUserPermissions updates a user's domain permissions.
func (s *AdminService) UpdateDomainUserPermissions(ctx context.Context, domainID uuid.UUID, userID uuid.UUID, req *models.UpdateDomainPermissionsRequest) error {
	perm, err := s.repo.GetUserDomainPermission(ctx, userID, domainID)
	if err != nil {
		return ErrUserNotFound
	}

	if req.CanSendAs != nil {
		perm.CanSendAs = *req.CanSendAs
	}
	if req.CanManage != nil {
		perm.CanManage = *req.CanManage
	}
	if req.CanViewAnalytics != nil {
		perm.CanViewAnalytics = *req.CanViewAnalytics
	}
	if req.CanManageUsers != nil {
		perm.CanManageUsers = *req.CanManageUsers
	}

	return s.repo.UpdateUserDomainPermission(ctx, perm)
}

// User management methods

// ListUsers lists users in an organization.
func (s *AdminService) ListUsers(ctx context.Context, orgID uuid.UUID, query string, page, limit int) (*models.PaginatedUsersResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	offset := (page - 1) * limit

	users, total, err := s.repo.ListOrganizationUsers(ctx, orgID, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}

	var userResponses []*models.UserResponse
	for _, u := range users {
		userResponses = append(userResponses, &models.UserResponse{
			ID:          u.ID,
			Email:       u.Email,
			DisplayName: u.DisplayName,
			Status:      u.Status,
			Role:        u.OrganizationRole,
			MFAEnabled:  u.MFAEnabled,
			CreatedAt:   u.CreatedAt,
			UpdatedAt:   u.UpdatedAt,
		})
	}

	return &models.PaginatedUsersResponse{
		Users: userResponses,
		Total: total,
		Page:  page,
		Limit: limit,
	}, nil
}

// GetUser gets a user by ID.
func (s *AdminService) GetUser(ctx context.Context, userID uuid.UUID) (*models.UserResponse, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, ErrUserNotFound
	}

	return &models.UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Status:      user.Status,
		Role:        user.OrganizationRole,
		MFAEnabled:  user.MFAEnabled,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}, nil
}

// UpdateUser updates a user (admin action).
func (s *AdminService) UpdateUser(ctx context.Context, userID uuid.UUID, req *models.AdminUpdateUserRequest) (*models.UserResponse, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, ErrUserNotFound
	}

	if req.DisplayName != "" {
		user.DisplayName = req.DisplayName
	}
	if req.Status != "" {
		user.Status = req.Status
	}
	if req.Role != "" {
		user.OrganizationRole = req.Role
	}

	user.UpdatedAt = time.Now()

	err = s.repo.UpdateUser(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	return &models.UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Status:      user.Status,
		Role:        user.OrganizationRole,
		MFAEnabled:  user.MFAEnabled,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}, nil
}

// DeleteUser deletes a user.
func (s *AdminService) DeleteUser(ctx context.Context, userID uuid.UUID) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return ErrUserNotFound
	}

	// Soft delete
	user.Status = "deleted"
	user.UpdatedAt = time.Now()

	return s.repo.UpdateUser(ctx, user)
}

// SuspendUser suspends a user.
func (s *AdminService) SuspendUser(ctx context.Context, userID uuid.UUID, reason string) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return ErrUserNotFound
	}

	user.Status = "suspended"
	user.SuspendedAt = timePtr(time.Now())
	user.SuspendReason = reason
	user.UpdatedAt = time.Now()

	return s.repo.UpdateUser(ctx, user)
}

// UnsuspendUser unsuspends a user.
func (s *AdminService) UnsuspendUser(ctx context.Context, userID uuid.UUID) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return ErrUserNotFound
	}

	user.Status = "active"
	user.SuspendedAt = nil
	user.SuspendReason = ""
	user.UpdatedAt = time.Now()

	return s.repo.UpdateUser(ctx, user)
}

// AdminResetPassword triggers a password reset for a user.
func (s *AdminService) AdminResetPassword(ctx context.Context, userID uuid.UUID) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return ErrUserNotFound
	}

	// Generate reset token
	resetToken := generateVerificationToken()
	hashedToken := hashToken(resetToken)

	// Store in Redis
	key := fmt.Sprintf("password_reset:%s", hashedToken)
	err = s.redis.Set(ctx, key, user.ID.String(), 24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to store reset token: %w", err)
	}

	// TODO: Send password reset email
	// Send password reset email
	resetURL := s.config.Email.VerificationURL // Should be a separate password reset URL in production
	resetURL = strings.Replace(resetURL, "/verify-email", "/reset-password", 1)
	if s.emailService != nil {
		if err := s.emailService.SendPasswordResetEmail(user.Email, user.DisplayName, resetToken, resetURL); err != nil {
			log.Error().Err(err).
				Str("user_id", user.ID.String()).
				Str("email", user.Email).
				Msg("Failed to send password reset email")
			// Continue anyway - token is stored
		}
	}

	log.Info().
		Str("user_id", user.ID.String()).
		Str("email", user.Email).
		Msg("Password reset triggered by admin")

	return nil
}

// Helper functions

func isValidRole(role string) bool {
	validRoles := []string{"owner", "admin", "member", "viewer"}
	for _, r := range validRoles {
		if r == role {
			return true
		}
	}
	return false
}

func generateSlug(name string) string {
	slug := strings.ToLower(name)
	slug = strings.ReplaceAll(slug, " ", "-")
	// Remove non-alphanumeric characters except hyphens
	var result strings.Builder
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func generateVerificationToken() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func hashToken(token string) string {
	// Simple hash for lookup - in production use proper crypto
	bytes := make([]byte, 16)
	copy(bytes, token)
	return hex.EncodeToString(bytes)
}

func timePtr(t time.Time) *time.Time {
	return &t
}

func verifyDNSTXT(domain string, expectedToken string) (bool, []string) {
	var errors []string

	// Look for TXT record at _email-verify.domain.com
	txtRecords, err := net.LookupTXT(fmt.Sprintf("_email-verify.%s", domain))
	if err != nil {
		errors = append(errors, fmt.Sprintf("Failed to lookup TXT record: %v", err))
		return false, errors
	}

	expectedValue := fmt.Sprintf("email-verify=%s", expectedToken)
	for _, record := range txtRecords {
		if record == expectedValue {
			return true, nil
		}
	}

	errors = append(errors, "TXT record not found or doesn't match expected value")
	return false, errors
}

func verifyDNSCNAME(domain string, expectedToken string) (bool, []string) {
	var errors []string

	// Look for CNAME record
	cname, err := net.LookupCNAME(fmt.Sprintf("_email-verify.%s", domain))
	if err != nil {
		errors = append(errors, fmt.Sprintf("Failed to lookup CNAME record: %v", err))
		return false, errors
	}

	expectedCNAME := fmt.Sprintf("%s.verify.email.example.com.", expectedToken)
	if cname == expectedCNAME {
		return true, nil
	}

	errors = append(errors, "CNAME record not found or doesn't match expected value")
	return false, errors
}

func getDNSInstructions(domain, token, method string) string {
	switch method {
	case "dns_txt":
		return fmt.Sprintf(
			"Add a TXT record to your DNS:\n"+
				"Host: _email-verify.%s\n"+
				"Value: email-verify=%s",
			domain, token)
	case "dns_cname":
		return fmt.Sprintf(
			"Add a CNAME record to your DNS:\n"+
				"Host: _email-verify.%s\n"+
				"Points to: %s.verify.email.example.com",
			domain, token)
	default:
		return fmt.Sprintf(
			"Add a TXT record to your DNS:\n"+
				"Host: _email-verify.%s\n"+
				"Value: email-verify=%s",
			domain, token)
	}
}
