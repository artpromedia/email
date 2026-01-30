// Package handlers provides HTTP handlers for threat protection
package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
)

// ============================================================
// HANDLER SETUP
// ============================================================

// ThreatHandlers contains all threat protection HTTP handlers
type ThreatHandlers struct {
	spam       SpamService
	phishing   PhishingService
	reputation ReputationService
	feedback   FeedbackService
	logger     zerolog.Logger
}

// Service interfaces
type SpamService interface {
	CheckSpam(ctx context.Context, req *SpamCheckRequest) (*SpamCheckResponse, error)
	GetOrgSettings(ctx context.Context, orgID string) (*OrgSpamSettings, error)
	UpdateOrgSettings(ctx context.Context, settings *OrgSpamSettings) error
}

type PhishingService interface {
	CheckPhishing(ctx context.Context, req *PhishingCheckRequest) (*PhishingCheckResponse, error)
}

type ReputationService interface {
	GetReputation(ctx context.Context, email, orgID string) (*SenderReputation, error)
	UpdateReputation(ctx context.Context, update *ReputationUpdate) (*SenderReputation, error)
	SetTrustLevel(ctx context.Context, email, orgID string, level TrustLevel) error
	QueryReputation(ctx context.Context, query *ReputationQuery) ([]*SenderReputation, int64, error)
	GetStats(ctx context.Context, orgID, period string) (*ReputationStats, error)
	GetDomainReputation(ctx context.Context, domain, orgID string) (*DomainReputation, error)
}

type FeedbackService interface {
	SubmitFeedback(ctx context.Context, submission *FeedbackSubmission) (*UserFeedback, error)
	MarkAsSpam(ctx context.Context, emailID, userID, orgID, senderEmail string) (*UserFeedback, error)
	MarkAsNotSpam(ctx context.Context, emailID, userID, orgID, senderEmail string) (*UserFeedback, error)
	ReportPhishing(ctx context.Context, emailID, userID, orgID, senderEmail string, details *PhishingReport) (*UserFeedback, error)
	MarkAsSafe(ctx context.Context, emailID, userID, orgID, senderEmail string) (*UserFeedback, error)
	GetStats(ctx context.Context, orgID, period string) (*FeedbackStats, error)
	CreateTrainingBatch(ctx context.Context, orgID string) (*TrainingBatch, error)
	ListTrainingBatches(ctx context.Context, orgID string, limit int) ([]*TrainingBatch, error)
}

// Context key for imports
import "context"

// NewThreatHandlers creates new threat protection handlers
func NewThreatHandlers(
	spam SpamService,
	phishing PhishingService,
	reputation ReputationService,
	feedback FeedbackService,
	logger zerolog.Logger,
) *ThreatHandlers {
	return &ThreatHandlers{
		spam:       spam,
		phishing:   phishing,
		reputation: reputation,
		feedback:   feedback,
		logger:     logger.With().Str("handlers", "threat").Logger(),
	}
}

// RegisterRoutes registers all threat protection routes
func (h *ThreatHandlers) RegisterRoutes(r chi.Router) {
	r.Route("/api/v1/threat", func(r chi.Router) {
		// Spam detection
		r.Post("/spam/check", h.CheckSpam)
		r.Get("/spam/settings/{orgID}", h.GetSpamSettings)
		r.Put("/spam/settings/{orgID}", h.UpdateSpamSettings)

		// Phishing detection
		r.Post("/phishing/check", h.CheckPhishing)

		// Sender reputation
		r.Get("/reputation/{orgID}/{email}", h.GetReputation)
		r.Get("/reputation/{orgID}", h.QueryReputation)
		r.Post("/reputation/{orgID}/{email}/trust", h.SetTrustLevel)
		r.Get("/reputation/{orgID}/stats", h.GetReputationStats)
		r.Get("/reputation/{orgID}/domain/{domain}", h.GetDomainReputation)

		// User feedback
		r.Post("/feedback", h.SubmitFeedback)
		r.Post("/feedback/spam", h.MarkAsSpam)
		r.Post("/feedback/not-spam", h.MarkAsNotSpam)
		r.Post("/feedback/phishing", h.ReportPhishing)
		r.Post("/feedback/safe", h.MarkAsSafe)
		r.Get("/feedback/stats/{orgID}", h.GetFeedbackStats)

		// Training
		r.Post("/training/batch/{orgID}", h.CreateTrainingBatch)
		r.Get("/training/batches/{orgID}", h.ListTrainingBatches)

		// Admin dashboard
		r.Get("/dashboard/{orgID}", h.GetThreatDashboard)
	})
}

// ============================================================
// REQUEST/RESPONSE TYPES
// ============================================================

// SpamCheckRequest for HTTP
type SpamCheckRequest struct {
	EmailID     string            `json:"email_id"`
	OrgID       string            `json:"org_id"`
	From        EmailAddress      `json:"from"`
	To          []EmailAddress    `json:"to"`
	Subject     string            `json:"subject"`
	Body        string            `json:"body"`
	HTMLBody    string            `json:"html_body,omitempty"`
	Headers     map[string]string `json:"headers"`
	SenderIP    string            `json:"sender_ip"`
	Attachments []Attachment      `json:"attachments,omitempty"`
}

type EmailAddress struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

type Attachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

type SpamCheckResponse struct {
	EmailID         string        `json:"email_id"`
	Verdict         string        `json:"verdict"`
	Score           float64       `json:"score"`
	Confidence      float64       `json:"confidence"`
	SuggestedAction string        `json:"suggested_action"`
	Factors         []SpamFactor  `json:"factors"`
	ProcessingTime  time.Duration `json:"processing_time"`
}

type SpamFactor struct {
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Weight      float64 `json:"weight"`
}

type OrgSpamSettings struct {
	OrgID            string   `json:"org_id"`
	Threshold        string   `json:"threshold"`
	QuarantineAction string   `json:"quarantine_action"`
	BlockList        []string `json:"block_list"`
	AllowList        []string `json:"allow_list"`
	EnableLLM        bool     `json:"enable_llm"`
	NotifyAdmin      bool     `json:"notify_admin"`
}

// PhishingCheckRequest for HTTP
type PhishingCheckRequest struct {
	EmailID  string            `json:"email_id"`
	OrgID    string            `json:"org_id"`
	From     EmailAddress      `json:"from"`
	ReplyTo  *EmailAddress     `json:"reply_to,omitempty"`
	Subject  string            `json:"subject"`
	Body     string            `json:"body"`
	HTMLBody string            `json:"html_body,omitempty"`
	Headers  map[string]string `json:"headers"`
	URLs     []string          `json:"urls,omitempty"`
}

type PhishingCheckResponse struct {
	EmailID         string            `json:"email_id"`
	Verdict         string            `json:"verdict"`
	Score           float64           `json:"score"`
	Confidence      float64           `json:"confidence"`
	Threats         []ThreatIndicator `json:"threats"`
	BrandTargeted   string            `json:"brand_targeted,omitempty"`
	SuggestedAction string            `json:"suggested_action"`
}

type ThreatIndicator struct {
	Type        string  `json:"type"`
	Severity    string  `json:"severity"`
	Description string  `json:"description"`
	Evidence    string  `json:"evidence,omitempty"`
	Score       float64 `json:"score"`
}

// SenderReputation for HTTP
type SenderReputation struct {
	Email           string    `json:"email"`
	Domain          string    `json:"domain"`
	OrgID           string    `json:"org_id"`
	TotalEmails     int64     `json:"total_emails"`
	SpamCount       int64     `json:"spam_count"`
	PhishingCount   int64     `json:"phishing_count"`
	ReputationScore float64   `json:"reputation_score"`
	TrustLevel      string    `json:"trust_level"`
	RiskLevel       string    `json:"risk_level"`
	FirstSeen       time.Time `json:"first_seen"`
	LastSeen        time.Time `json:"last_seen"`
}

type TrustLevel string

type ReputationQuery struct {
	OrgID      string  `json:"org_id"`
	Email      string  `json:"email,omitempty"`
	Domain     string  `json:"domain,omitempty"`
	TrustLevel string  `json:"trust_level,omitempty"`
	RiskLevel  string  `json:"risk_level,omitempty"`
	MinScore   float64 `json:"min_score,omitempty"`
	MaxScore   float64 `json:"max_score,omitempty"`
	Limit      int     `json:"limit,omitempty"`
	Offset     int     `json:"offset,omitempty"`
}

type ReputationUpdate struct {
	SenderEmail string    `json:"sender_email"`
	OrgID       string    `json:"org_id"`
	EventType   string    `json:"event_type"`
	Timestamp   time.Time `json:"timestamp"`
}

type ReputationStats struct {
	OrgID             string  `json:"org_id"`
	TotalSenders      int64   `json:"total_senders"`
	TrustedSenders    int64   `json:"trusted_senders"`
	SuspiciousSenders int64   `json:"suspicious_senders"`
	BlockedSenders    int64   `json:"blocked_senders"`
	AvgReputation     float64 `json:"avg_reputation"`
	SpamRate          float64 `json:"spam_rate"`
	PhishRate         float64 `json:"phish_rate"`
	Period            string  `json:"period"`
}

type DomainReputation struct {
	Domain          string  `json:"domain"`
	OrgID           string  `json:"org_id"`
	TotalSenders    int64   `json:"total_senders"`
	TotalEmails     int64   `json:"total_emails"`
	SpamRate        float64 `json:"spam_rate"`
	PhishRate       float64 `json:"phish_rate"`
	ReputationScore float64 `json:"reputation_score"`
}

// FeedbackSubmission for HTTP
type FeedbackSubmission struct {
	EmailID         string          `json:"email_id"`
	UserID          string          `json:"user_id"`
	OrgID           string          `json:"org_id"`
	Type            string          `json:"type"`
	SenderEmail     string          `json:"sender_email"`
	OriginalVerdict string          `json:"original_verdict,omitempty"`
	OriginalScore   float64         `json:"original_score,omitempty"`
	PhishDetails    *PhishingReport `json:"phishing_details,omitempty"`
}

type PhishingReport struct {
	Category          string   `json:"category"`
	Description       string   `json:"description"`
	SuspiciousURLs    []string `json:"suspicious_urls,omitempty"`
	ImpersonatedBrand string   `json:"impersonated_brand,omitempty"`
	AdditionalNotes   string   `json:"additional_notes,omitempty"`
}

type UserFeedback struct {
	ID              string    `json:"id"`
	EmailID         string    `json:"email_id"`
	UserID          string    `json:"user_id"`
	OrgID           string    `json:"org_id"`
	Type            string    `json:"type"`
	SenderEmail     string    `json:"sender_email"`
	CreatedAt       time.Time `json:"created_at"`
	Processed       bool      `json:"processed"`
}

type FeedbackStats struct {
	OrgID             string  `json:"org_id"`
	TotalFeedback     int64   `json:"total_feedback"`
	SpamReports       int64   `json:"spam_reports"`
	NotSpamReports    int64   `json:"not_spam_reports"`
	PhishingReports   int64   `json:"phishing_reports"`
	FalsePositiveRate float64 `json:"false_positive_rate"`
	FalseNegativeRate float64 `json:"false_negative_rate"`
	Period            string  `json:"period"`
}

type TrainingBatch struct {
	BatchID     string    `json:"batch_id"`
	OrgID       string    `json:"org_id"`
	CreatedAt   time.Time `json:"created_at"`
	SampleCount int       `json:"sample_count"`
	SpamCount   int       `json:"spam_count"`
	HamCount    int       `json:"ham_count"`
	PhishCount  int       `json:"phish_count"`
	Status      string    `json:"status"`
}

// ThreatDashboard for admin view
type ThreatDashboard struct {
	OrgID           string            `json:"org_id"`
	Period          string            `json:"period"`
	SpamStats       SpamDashboardStats `json:"spam_stats"`
	PhishingStats   PhishingDashboardStats `json:"phishing_stats"`
	ReputationStats ReputationStats   `json:"reputation_stats"`
	FeedbackStats   FeedbackStats     `json:"feedback_stats"`
	RecentThreats   []RecentThreat    `json:"recent_threats"`
	TopBlockedSenders []BlockedSender `json:"top_blocked_senders"`
	TrendData       TrendData         `json:"trend_data"`
}

type SpamDashboardStats struct {
	TotalChecked    int64   `json:"total_checked"`
	SpamDetected    int64   `json:"spam_detected"`
	SpamRate        float64 `json:"spam_rate"`
	Quarantined     int64   `json:"quarantined"`
	Blocked         int64   `json:"blocked"`
}

type PhishingDashboardStats struct {
	TotalChecked     int64   `json:"total_checked"`
	PhishingDetected int64   `json:"phishing_detected"`
	PhishingRate     float64 `json:"phishing_rate"`
	BrandsTargeted   int     `json:"brands_targeted"`
	HighSeverity     int64   `json:"high_severity"`
}

type RecentThreat struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"` // spam, phishing
	Severity    string    `json:"severity"`
	Subject     string    `json:"subject"`
	SenderEmail string    `json:"sender_email"`
	DetectedAt  time.Time `json:"detected_at"`
	Action      string    `json:"action"`
}

type BlockedSender struct {
	Email       string  `json:"email"`
	Domain      string  `json:"domain"`
	BlockCount  int64   `json:"block_count"`
	Reason      string  `json:"reason"`
	Reputation  float64 `json:"reputation"`
}

type TrendData struct {
	Labels     []string  `json:"labels"`
	SpamCounts []int64   `json:"spam_counts"`
	PhishCounts []int64  `json:"phish_counts"`
	HamCounts  []int64   `json:"ham_counts"`
}

// ============================================================
// SPAM HANDLERS
// ============================================================

// CheckSpam handles POST /api/v1/threat/spam/check
func (h *ThreatHandlers) CheckSpam(w http.ResponseWriter, r *http.Request) {
	var req SpamCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.EmailID == "" || req.OrgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id and org_id are required")
		return
	}

	result, err := h.spam.CheckSpam(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Spam check failed")
		h.errorResponse(w, http.StatusInternalServerError, "Spam check failed")
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// GetSpamSettings handles GET /api/v1/threat/spam/settings/{orgID}
func (h *ThreatHandlers) GetSpamSettings(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	if orgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id is required")
		return
	}

	settings, err := h.spam.GetOrgSettings(r.Context(), orgID)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get settings")
		return
	}

	h.jsonResponse(w, http.StatusOK, settings)
}

// UpdateSpamSettings handles PUT /api/v1/threat/spam/settings/{orgID}
func (h *ThreatHandlers) UpdateSpamSettings(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")

	var settings OrgSpamSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	settings.OrgID = orgID

	if err := h.spam.UpdateOrgSettings(r.Context(), &settings); err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to update settings")
		return
	}

	h.jsonResponse(w, http.StatusOK, settings)
}

// ============================================================
// PHISHING HANDLERS
// ============================================================

// CheckPhishing handles POST /api/v1/threat/phishing/check
func (h *ThreatHandlers) CheckPhishing(w http.ResponseWriter, r *http.Request) {
	var req PhishingCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.EmailID == "" || req.OrgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id and org_id are required")
		return
	}

	result, err := h.phishing.CheckPhishing(r.Context(), &req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Phishing check failed")
		h.errorResponse(w, http.StatusInternalServerError, "Phishing check failed")
		return
	}

	h.jsonResponse(w, http.StatusOK, result)
}

// ============================================================
// REPUTATION HANDLERS
// ============================================================

// GetReputation handles GET /api/v1/threat/reputation/{orgID}/{email}
func (h *ThreatHandlers) GetReputation(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	email := chi.URLParam(r, "email")

	if orgID == "" || email == "" {
		h.errorResponse(w, http.StatusBadRequest, "org_id and email are required")
		return
	}

	rep, err := h.reputation.GetReputation(r.Context(), email, orgID)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get reputation")
		return
	}

	h.jsonResponse(w, http.StatusOK, rep)
}

// QueryReputation handles GET /api/v1/threat/reputation/{orgID}
func (h *ThreatHandlers) QueryReputation(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")

	query := &ReputationQuery{
		OrgID:      orgID,
		Email:      r.URL.Query().Get("email"),
		Domain:     r.URL.Query().Get("domain"),
		TrustLevel: r.URL.Query().Get("trust_level"),
		RiskLevel:  r.URL.Query().Get("risk_level"),
	}

	results, total, err := h.reputation.QueryReputation(r.Context(), query)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to query reputation")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]interface{}{
		"results": results,
		"total":   total,
	})
}

// SetTrustLevel handles POST /api/v1/threat/reputation/{orgID}/{email}/trust
func (h *ThreatHandlers) SetTrustLevel(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	email := chi.URLParam(r, "email")

	var req struct {
		TrustLevel string `json:"trust_level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.reputation.SetTrustLevel(r.Context(), email, orgID, TrustLevel(req.TrustLevel)); err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to set trust level")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]string{"status": "updated"})
}

// GetReputationStats handles GET /api/v1/threat/reputation/{orgID}/stats
func (h *ThreatHandlers) GetReputationStats(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "30d"
	}

	stats, err := h.reputation.GetStats(r.Context(), orgID, period)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get stats")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// GetDomainReputation handles GET /api/v1/threat/reputation/{orgID}/domain/{domain}
func (h *ThreatHandlers) GetDomainReputation(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	domain := chi.URLParam(r, "domain")

	rep, err := h.reputation.GetDomainReputation(r.Context(), domain, orgID)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get domain reputation")
		return
	}

	h.jsonResponse(w, http.StatusOK, rep)
}

// ============================================================
// FEEDBACK HANDLERS
// ============================================================

// SubmitFeedback handles POST /api/v1/threat/feedback
func (h *ThreatHandlers) SubmitFeedback(w http.ResponseWriter, r *http.Request) {
	var req FeedbackSubmission
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.EmailID == "" || req.UserID == "" || req.OrgID == "" {
		h.errorResponse(w, http.StatusBadRequest, "email_id, user_id, and org_id are required")
		return
	}

	feedback, err := h.feedback.SubmitFeedback(r.Context(), &req)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to submit feedback")
		return
	}

	h.jsonResponse(w, http.StatusOK, feedback)
}

// MarkAsSpam handles POST /api/v1/threat/feedback/spam
func (h *ThreatHandlers) MarkAsSpam(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmailID     string `json:"email_id"`
		UserID      string `json:"user_id"`
		OrgID       string `json:"org_id"`
		SenderEmail string `json:"sender_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	feedback, err := h.feedback.MarkAsSpam(r.Context(), req.EmailID, req.UserID, req.OrgID, req.SenderEmail)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to mark as spam")
		return
	}

	h.jsonResponse(w, http.StatusOK, feedback)
}

// MarkAsNotSpam handles POST /api/v1/threat/feedback/not-spam
func (h *ThreatHandlers) MarkAsNotSpam(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmailID     string `json:"email_id"`
		UserID      string `json:"user_id"`
		OrgID       string `json:"org_id"`
		SenderEmail string `json:"sender_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	feedback, err := h.feedback.MarkAsNotSpam(r.Context(), req.EmailID, req.UserID, req.OrgID, req.SenderEmail)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to mark as not spam")
		return
	}

	h.jsonResponse(w, http.StatusOK, feedback)
}

// ReportPhishing handles POST /api/v1/threat/feedback/phishing
func (h *ThreatHandlers) ReportPhishing(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmailID     string          `json:"email_id"`
		UserID      string          `json:"user_id"`
		OrgID       string          `json:"org_id"`
		SenderEmail string          `json:"sender_email"`
		Details     *PhishingReport `json:"details"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	feedback, err := h.feedback.ReportPhishing(r.Context(), req.EmailID, req.UserID, req.OrgID, req.SenderEmail, req.Details)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to report phishing")
		return
	}

	h.jsonResponse(w, http.StatusOK, feedback)
}

// MarkAsSafe handles POST /api/v1/threat/feedback/safe
func (h *ThreatHandlers) MarkAsSafe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmailID     string `json:"email_id"`
		UserID      string `json:"user_id"`
		OrgID       string `json:"org_id"`
		SenderEmail string `json:"sender_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	feedback, err := h.feedback.MarkAsSafe(r.Context(), req.EmailID, req.UserID, req.OrgID, req.SenderEmail)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to mark as safe")
		return
	}

	h.jsonResponse(w, http.StatusOK, feedback)
}

// GetFeedbackStats handles GET /api/v1/threat/feedback/stats/{orgID}
func (h *ThreatHandlers) GetFeedbackStats(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "30d"
	}

	stats, err := h.feedback.GetStats(r.Context(), orgID, period)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to get feedback stats")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// ============================================================
// TRAINING HANDLERS
// ============================================================

// CreateTrainingBatch handles POST /api/v1/threat/training/batch/{orgID}
func (h *ThreatHandlers) CreateTrainingBatch(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")

	batch, err := h.feedback.CreateTrainingBatch(r.Context(), orgID)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.jsonResponse(w, http.StatusOK, batch)
}

// ListTrainingBatches handles GET /api/v1/threat/training/batches/{orgID}
func (h *ThreatHandlers) ListTrainingBatches(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")

	batches, err := h.feedback.ListTrainingBatches(r.Context(), orgID, 20)
	if err != nil {
		h.errorResponse(w, http.StatusInternalServerError, "Failed to list batches")
		return
	}

	h.jsonResponse(w, http.StatusOK, batches)
}

// ============================================================
// DASHBOARD HANDLER
// ============================================================

// GetThreatDashboard handles GET /api/v1/threat/dashboard/{orgID}
func (h *ThreatHandlers) GetThreatDashboard(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "30d"
	}

	// Aggregate data from all services
	repStats, _ := h.reputation.GetStats(r.Context(), orgID, period)
	fbStats, _ := h.feedback.GetStats(r.Context(), orgID, period)

	// Build dashboard response
	dashboard := &ThreatDashboard{
		OrgID:  orgID,
		Period: period,
		SpamStats: SpamDashboardStats{
			// Would be populated from actual metrics
		},
		PhishingStats: PhishingDashboardStats{
			// Would be populated from actual metrics
		},
		RecentThreats: []RecentThreat{
			// Would be populated from recent detections
		},
		TopBlockedSenders: []BlockedSender{
			// Would be populated from reputation data
		},
		TrendData: TrendData{
			Labels: generateDateLabels(period),
		},
	}

	if repStats != nil {
		dashboard.ReputationStats = *repStats
	}
	if fbStats != nil {
		dashboard.FeedbackStats = *fbStats
	}

	h.jsonResponse(w, http.StatusOK, dashboard)
}

// ============================================================
// HELPER METHODS
// ============================================================

func (h *ThreatHandlers) jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *ThreatHandlers) errorResponse(w http.ResponseWriter, status int, message string) {
	h.jsonResponse(w, status, map[string]string{"error": message})
}

func generateDateLabels(period string) []string {
	var days int
	switch period {
	case "7d":
		days = 7
	case "30d":
		days = 30
	case "90d":
		days = 90
	default:
		days = 30
	}

	labels := make([]string, days)
	now := time.Now()
	for i := days - 1; i >= 0; i-- {
		labels[days-1-i] = now.AddDate(0, 0, -i).Format("Jan 2")
	}
	return labels
}
