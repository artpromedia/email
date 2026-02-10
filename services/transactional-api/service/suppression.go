package service

import (
"context"
"time"

"transactional-api/models"
"transactional-api/repository"
"github.com/google/uuid"
"github.com/rs/zerolog"
)

// SuppressionService handles suppression list business logic
type SuppressionService struct {
repo   *repository.SuppressionRepository
logger zerolog.Logger
}

// NewSuppressionService creates a new SuppressionService
func NewSuppressionService(repo *repository.SuppressionRepository, logger zerolog.Logger) *SuppressionService {
return &SuppressionService{
repo:   repo,
logger: logger,
}
}

// Add adds an email to the suppression list
func (s *SuppressionService) Add(ctx context.Context, domainID uuid.UUID, req *models.CreateSuppressionRequest, createdBy *uuid.UUID) (*models.Suppression, error) {
suppressionType := reasonToType(req.Reason)

if err := s.repo.Add(ctx, domainID, req.Email, suppressionType, string(req.Reason)); err != nil {
return nil, err
}

suppression := &models.Suppression{
ID:          uuid.New(),
DomainID:    domainID,
Email:       req.Email,
Reason:      req.Reason,
Type:        suppressionType,
BounceClass: req.BounceClass,
Description: req.Description,
Source:      "api",
ExpiresAt:   req.ExpiresAt,
CreatedAt:   time.Now(),
CreatedBy:   createdBy,
}

s.logger.Info().
Str("email", req.Email).
Str("reason", string(req.Reason)).
Msg("Email added to suppression list")

return suppression, nil
}

// AddBulk adds multiple emails to the suppression list
func (s *SuppressionService) AddBulk(ctx context.Context, domainID uuid.UUID, req *models.BulkSuppressionRequest, createdBy *uuid.UUID) (*models.BulkSuppressionResponse, error) {
suppressionType := reasonToType(req.Reason)

added, err := s.repo.BulkAdd(ctx, domainID, req.Emails, suppressionType, string(req.Reason))
if err != nil {
return nil, err
}

resp := &models.BulkSuppressionResponse{
Added:    added,
Existing: len(req.Emails) - added,
}

s.logger.Info().
Int("added", resp.Added).
Int("existing", resp.Existing).
Str("reason", string(req.Reason)).
Msg("Bulk suppression completed")

return resp, nil
}

// Get retrieves suppression status for an email
func (s *SuppressionService) Get(ctx context.Context, domainID uuid.UUID, email string) (*models.Suppression, error) {
suppressions, err := s.repo.GetAllForEmail(ctx, domainID, email)
if err != nil {
return nil, err
}
if len(suppressions) == 0 {
return nil, nil
}
return suppressions[0], nil
}

// Check checks if an email is suppressed
func (s *SuppressionService) Check(ctx context.Context, domainID uuid.UUID, email string) (bool, *models.SuppressionStatus, error) {
suppressed, suppressionType, err := s.repo.Exists(ctx, domainID, email)
if err != nil {
return false, nil, err
}
if !suppressed {
return false, nil, nil
}
return true, &models.SuppressionStatus{
Suppressed: true,
Reason:     models.SuppressionReason(suppressionType),
}, nil
}

// CheckMultiple checks suppression status for multiple emails
func (s *SuppressionService) CheckMultiple(ctx context.Context, domainID uuid.UUID, emails []string) (*models.CheckSuppressionResponse, error) {
results := make(map[string]*models.SuppressionStatus, len(emails))
for _, email := range emails {
suppressed, suppressionType, err := s.repo.Exists(ctx, domainID, email)
if err != nil {
s.logger.Warn().Err(err).Str("email", email).Msg("Failed to check suppression")
continue
}
if suppressed {
results[email] = &models.SuppressionStatus{
Suppressed: true,
Reason:     models.SuppressionReason(suppressionType),
}
} else {
results[email] = &models.SuppressionStatus{Suppressed: false}
}
}
return &models.CheckSuppressionResponse{Results: results}, nil
}

// List retrieves suppressions with filtering
func (s *SuppressionService) List(ctx context.Context, query *models.SuppressionQuery) (*models.SuppressionListResponse, error) {
if query.Limit <= 0 {
query.Limit = 20
}
if query.Limit > 100 {
query.Limit = 100
}

suppressionType := models.SuppressionType("bounce")
if query.Reason != nil {
suppressionType = models.SuppressionType(*query.Reason)
}

suppressions, total, err := s.repo.List(ctx, query.DomainID, suppressionType, query.Limit, query.Offset)
if err != nil {
return nil, err
}

result := make([]models.Suppression, len(suppressions))
for i, sup := range suppressions {
result[i] = *sup
}

return &models.SuppressionListResponse{
Suppressions: result,
Total:        total,
Limit:        query.Limit,
Offset:       query.Offset,
HasMore:      int64(query.Offset+query.Limit) < total,
}, nil
}

// Remove removes an email from the suppression list
func (s *SuppressionService) Remove(ctx context.Context, domainID uuid.UUID, email string, suppressionType models.SuppressionType) error {
if err := s.repo.Remove(ctx, domainID, email, suppressionType); err != nil {
return err
}

s.logger.Info().
Str("email", email).
Msg("Email removed from suppression list")

return nil
}

// GetStats retrieves suppression statistics
func (s *SuppressionService) GetStats(ctx context.Context, domainID uuid.UUID) (*models.SuppressionStats, error) {
stats := &models.SuppressionStats{}

types := []models.SuppressionType{"bounce", "unsubscribe", "spam_complaint", "manual", "invalid"}
for _, t := range types {
_, total, err := s.repo.List(ctx, domainID, t, 1, 0)
if err != nil {
continue
}
stats.Total += total
switch t {
case "bounce":
stats.Bounces = total
case "unsubscribe":
stats.Unsubscribes = total
case "spam_complaint":
stats.SpamComplaints = total
case "manual":
stats.Manual = total
case "invalid":
stats.Invalid = total
}
}

return stats, nil
}

// ProcessBounce processes a bounce event and adds to suppression
func (s *SuppressionService) ProcessBounce(ctx context.Context, domainID uuid.UUID, email, bounceType, bounceCode, smtpResponse string, messageID *uuid.UUID) error {
reason := "bounce: " + bounceType + " " + smtpResponse

if err := s.repo.Add(ctx, domainID, email, "bounce", reason); err != nil {
return err
}

s.logger.Info().
Str("email", email).
Str("bounce_type", bounceType).
Msg("Bounce processed and added to suppression")

return nil
}

// ProcessSpamComplaint processes a spam complaint and adds to suppression
func (s *SuppressionService) ProcessSpamComplaint(ctx context.Context, domainID uuid.UUID, email string, messageID *uuid.UUID) error {
if err := s.repo.Add(ctx, domainID, email, "spam_complaint", "spam complaint"); err != nil {
return err
}

s.logger.Info().
Str("email", email).
Msg("Spam complaint processed and added to suppression")

return nil
}

// ProcessUnsubscribe processes an unsubscribe request
func (s *SuppressionService) ProcessUnsubscribe(ctx context.Context, domainID uuid.UUID, email string, messageID *uuid.UUID) error {
if err := s.repo.Add(ctx, domainID, email, "unsubscribe", "user unsubscribed"); err != nil {
return err
}

s.logger.Info().
Str("email", email).
Msg("Unsubscribe processed and added to suppression")

return nil
}

// reasonToType converts a SuppressionReason to SuppressionType
func reasonToType(reason models.SuppressionReason) models.SuppressionType {
switch reason {
case models.SuppressionReasonBounce:
return "bounce"
case models.SuppressionReasonUnsubscribe:
return "unsubscribe"
case models.SuppressionReasonSpamComplaint:
return "spam_complaint"
case models.SuppressionReasonManual:
return "manual"
case models.SuppressionReasonInvalid:
return "invalid"
default:
return models.SuppressionType(reason)
}
}
