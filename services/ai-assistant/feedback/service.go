// Package feedback provides user feedback collection for spam/phishing training
package feedback

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// ============================================================
// TYPES
// ============================================================

// FeedbackType categorizes user feedback
type FeedbackType string

const (
	FeedbackSpam        FeedbackType = "spam"         // User marked as spam
	FeedbackNotSpam     FeedbackType = "not_spam"     // User marked as not spam
	FeedbackPhishing    FeedbackType = "phishing"     // User reported phishing
	FeedbackNotPhishing FeedbackType = "not_phishing" // User confirmed not phishing
	FeedbackSafe        FeedbackType = "safe"         // User marked as safe/trusted
)

// UserFeedback represents a single feedback submission
type UserFeedback struct {
	ID           string       `json:"id"`
	EmailID      string       `json:"email_id"`
	UserID       string       `json:"user_id"`
	OrgID        string       `json:"org_id"`
	Type         FeedbackType `json:"type"`
	SenderEmail  string       `json:"sender_email"`
	SenderDomain string       `json:"sender_domain"`

	// Original classification
	OriginalVerdict     string  `json:"original_verdict"`
	OriginalScore       float64 `json:"original_score"`

	// Additional details for phishing reports
	PhishingDetails *PhishingReport `json:"phishing_details,omitempty"`

	// Metadata
	CreatedAt    time.Time `json:"created_at"`
	IPAddress    string    `json:"ip_address,omitempty"`
	UserAgent    string    `json:"user_agent,omitempty"`

	// Processing status
	Processed    bool      `json:"processed"`
	ProcessedAt  *time.Time `json:"processed_at,omitempty"`
	IncludedInRetrain bool `json:"included_in_retrain"`
}

// PhishingReport contains detailed phishing report information
type PhishingReport struct {
	Category        PhishingCategory `json:"category"`
	Description     string           `json:"description"`
	SuspiciousURLs  []string         `json:"suspicious_urls,omitempty"`
	ImpersonatedBrand string         `json:"impersonated_brand,omitempty"`
	AdditionalNotes string           `json:"additional_notes,omitempty"`
}

// PhishingCategory categorizes phishing type
type PhishingCategory string

const (
	PhishCategoryBrandImpersonation PhishingCategory = "brand_impersonation"
	PhishCategoryCredentialHarvest  PhishingCategory = "credential_harvesting"
	PhishCategoryMalware           PhishingCategory = "malware_link"
	PhishCategoryFraud             PhishingCategory = "fraud"
	PhishCategoryScam              PhishingCategory = "scam"
	PhishCategoryOther             PhishingCategory = "other"
)

// FeedbackSubmission is the request to submit feedback
type FeedbackSubmission struct {
	EmailID       string           `json:"email_id"`
	UserID        string           `json:"user_id"`
	OrgID         string           `json:"org_id"`
	Type          FeedbackType     `json:"type"`
	SenderEmail   string           `json:"sender_email"`
	PhishDetails  *PhishingReport  `json:"phishing_details,omitempty"`
	OriginalVerdict string         `json:"original_verdict,omitempty"`
	OriginalScore float64          `json:"original_score,omitempty"`
}

// FeedbackStats contains aggregate feedback statistics
type FeedbackStats struct {
	OrgID              string    `json:"org_id"`
	Period             string    `json:"period"`
	TotalFeedback      int64     `json:"total_feedback"`
	SpamReports        int64     `json:"spam_reports"`
	NotSpamReports     int64     `json:"not_spam_reports"`
	PhishingReports    int64     `json:"phishing_reports"`
	SafeMarks          int64     `json:"safe_marks"`
	FalsePositiveRate  float64   `json:"false_positive_rate"`
	FalseNegativeRate  float64   `json:"false_negative_rate"`
	PendingProcessing  int64     `json:"pending_processing"`
	LastUpdated        time.Time `json:"last_updated"`
}

// TrainingBatch contains feedback data for model retraining
type TrainingBatch struct {
	BatchID      string         `json:"batch_id"`
	OrgID        string         `json:"org_id"`
	CreatedAt    time.Time      `json:"created_at"`
	Samples      []TrainingSample `json:"samples"`
	SampleCount  int            `json:"sample_count"`
	SpamCount    int            `json:"spam_count"`
	HamCount     int            `json:"ham_count"`
	PhishCount   int            `json:"phish_count"`
	Status       BatchStatus    `json:"status"`
	ProcessedAt  *time.Time     `json:"processed_at,omitempty"`
}

// TrainingSample represents a single training example
type TrainingSample struct {
	EmailID      string       `json:"email_id"`
	Subject      string       `json:"subject"`
	Body         string       `json:"body"`
	SenderEmail  string       `json:"sender_email"`
	Label        string       `json:"label"` // spam, ham, phishing
	Confidence   float64      `json:"confidence"` // How confident we are in label
	FeedbackType FeedbackType `json:"feedback_type"`
	UserID       string       `json:"user_id"`
	Timestamp    time.Time    `json:"timestamp"`
}

// BatchStatus represents training batch status
type BatchStatus string

const (
	BatchPending    BatchStatus = "pending"
	BatchProcessing BatchStatus = "processing"
	BatchCompleted  BatchStatus = "completed"
	BatchFailed     BatchStatus = "failed"
)

// ============================================================
// SERVICE
// ============================================================

// Service provides user feedback management
type Service struct {
	redis      *redis.Client
	logger     zerolog.Logger
	repService ReputationService

	// Configuration
	config FeedbackConfig
}

// ReputationService interface for updating sender reputation
type ReputationService interface {
	UpdateReputation(ctx context.Context, update *ReputationUpdate) error
}

// ReputationUpdate for interface
type ReputationUpdate struct {
	SenderEmail string    `json:"sender_email"`
	OrgID       string    `json:"org_id"`
	EventType   string    `json:"event_type"`
	Timestamp   time.Time `json:"timestamp"`
}

// FeedbackConfig contains service configuration
type FeedbackConfig struct {
	// Training batch settings
	MinBatchSize         int           `json:"min_batch_size"`
	MaxBatchSize         int           `json:"max_batch_size"`
	BatchInterval        time.Duration `json:"batch_interval"`

	// Retention
	FeedbackRetentionDays int          `json:"feedback_retention_days"`

	// Thresholds
	HighConfidenceThreshold float64    `json:"high_confidence_threshold"`
}

// NewService creates a new feedback service
func NewService(redis *redis.Client, logger zerolog.Logger, repService ReputationService) *Service {
	return &Service{
		redis:      redis,
		logger:     logger.With().Str("service", "feedback").Logger(),
		repService: repService,
		config:     defaultFeedbackConfig(),
	}
}

func defaultFeedbackConfig() FeedbackConfig {
	return FeedbackConfig{
		MinBatchSize:            100,
		MaxBatchSize:            10000,
		BatchInterval:           7 * 24 * time.Hour, // Weekly
		FeedbackRetentionDays:   90,
		HighConfidenceThreshold: 0.9,
	}
}

// ============================================================
// FEEDBACK OPERATIONS
// ============================================================

// SubmitFeedback records user feedback
func (s *Service) SubmitFeedback(ctx context.Context, submission *FeedbackSubmission) (*UserFeedback, error) {
	// Create feedback record
	feedback := &UserFeedback{
		ID:              generateFeedbackID(),
		EmailID:         submission.EmailID,
		UserID:          submission.UserID,
		OrgID:           submission.OrgID,
		Type:            submission.Type,
		SenderEmail:     submission.SenderEmail,
		SenderDomain:    extractDomain(submission.SenderEmail),
		OriginalVerdict: submission.OriginalVerdict,
		OriginalScore:   submission.OriginalScore,
		PhishingDetails: submission.PhishDetails,
		CreatedAt:       time.Now(),
		Processed:       false,
	}

	// Save feedback
	if err := s.saveFeedback(ctx, feedback); err != nil {
		return nil, fmt.Errorf("failed to save feedback: %w", err)
	}

	// Update sender reputation asynchronously
	if s.repService != nil {
		go s.updateReputationFromFeedback(ctx, feedback)
	}

	// Add to pending training queue
	if err := s.addToTrainingQueue(ctx, feedback); err != nil {
		s.logger.Warn().Err(err).Msg("Failed to add feedback to training queue")
	}

	// Log for audit
	s.logger.Info().
		Str("feedback_id", feedback.ID).
		Str("email_id", feedback.EmailID).
		Str("type", string(feedback.Type)).
		Str("user_id", feedback.UserID).
		Msg("Feedback submitted")

	return feedback, nil
}

// MarkAsSpam convenience method
func (s *Service) MarkAsSpam(ctx context.Context, emailID, userID, orgID, senderEmail string) (*UserFeedback, error) {
	return s.SubmitFeedback(ctx, &FeedbackSubmission{
		EmailID:     emailID,
		UserID:      userID,
		OrgID:       orgID,
		Type:        FeedbackSpam,
		SenderEmail: senderEmail,
	})
}

// MarkAsNotSpam convenience method
func (s *Service) MarkAsNotSpam(ctx context.Context, emailID, userID, orgID, senderEmail string) (*UserFeedback, error) {
	return s.SubmitFeedback(ctx, &FeedbackSubmission{
		EmailID:     emailID,
		UserID:      userID,
		OrgID:       orgID,
		Type:        FeedbackNotSpam,
		SenderEmail: senderEmail,
	})
}

// ReportPhishing submits a phishing report
func (s *Service) ReportPhishing(ctx context.Context, emailID, userID, orgID, senderEmail string, details *PhishingReport) (*UserFeedback, error) {
	return s.SubmitFeedback(ctx, &FeedbackSubmission{
		EmailID:      emailID,
		UserID:       userID,
		OrgID:        orgID,
		Type:         FeedbackPhishing,
		SenderEmail:  senderEmail,
		PhishDetails: details,
	})
}

// MarkAsSafe marks a sender as safe/trusted
func (s *Service) MarkAsSafe(ctx context.Context, emailID, userID, orgID, senderEmail string) (*UserFeedback, error) {
	return s.SubmitFeedback(ctx, &FeedbackSubmission{
		EmailID:     emailID,
		UserID:      userID,
		OrgID:       orgID,
		Type:        FeedbackSafe,
		SenderEmail: senderEmail,
	})
}

// GetFeedback retrieves feedback by ID
func (s *Service) GetFeedback(ctx context.Context, feedbackID string) (*UserFeedback, error) {
	cacheKey := fmt.Sprintf("feedback:%s", feedbackID)

	data, err := s.redis.Get(ctx, cacheKey).Bytes()
	if err != nil {
		return nil, fmt.Errorf("feedback not found")
	}

	var feedback UserFeedback
	if err := json.Unmarshal(data, &feedback); err != nil {
		return nil, err
	}

	return &feedback, nil
}

// GetFeedbackForEmail retrieves all feedback for an email
func (s *Service) GetFeedbackForEmail(ctx context.Context, emailID string) ([]*UserFeedback, error) {
	pattern := fmt.Sprintf("feedback:*:%s:*", emailID)
	return s.scanFeedback(ctx, pattern)
}

// GetFeedbackByUser retrieves feedback submitted by a user
func (s *Service) GetFeedbackByUser(ctx context.Context, userID string, limit int) ([]*UserFeedback, error) {
	pattern := fmt.Sprintf("feedback:%s:*", userID)
	feedback, err := s.scanFeedback(ctx, pattern)
	if err != nil {
		return nil, err
	}

	if limit > 0 && len(feedback) > limit {
		feedback = feedback[:limit]
	}

	return feedback, nil
}

// GetStats returns feedback statistics
func (s *Service) GetStats(ctx context.Context, orgID, period string) (*FeedbackStats, error) {
	cacheKey := fmt.Sprintf("feedback_stats:%s:%s", orgID, period)

	// Try cache
	data, err := s.redis.Get(ctx, cacheKey).Bytes()
	if err == nil {
		var stats FeedbackStats
		if json.Unmarshal(data, &stats) == nil {
			return &stats, nil
		}
	}

	// Calculate stats
	stats := &FeedbackStats{
		OrgID:       orgID,
		Period:      period,
		LastUpdated: time.Now(),
	}

	// Get time range
	var since time.Time
	switch period {
	case "7d":
		since = time.Now().AddDate(0, 0, -7)
	case "30d":
		since = time.Now().AddDate(0, 0, -30)
	case "90d":
		since = time.Now().AddDate(0, 0, -90)
	default:
		since = time.Now().AddDate(0, 0, -30)
	}

	// Scan feedback
	pattern := fmt.Sprintf("feedback:*:%s:*", orgID)
	feedback, err := s.scanFeedback(ctx, pattern)
	if err != nil {
		return nil, err
	}

	for _, fb := range feedback {
		if fb.CreatedAt.Before(since) {
			continue
		}

		stats.TotalFeedback++

		switch fb.Type {
		case FeedbackSpam:
			stats.SpamReports++
			// Check if this was originally marked as ham (false negative)
			if fb.OriginalVerdict == "ham" {
				stats.FalseNegativeRate++
			}
		case FeedbackNotSpam:
			stats.NotSpamReports++
			// Check if this was originally marked as spam (false positive)
			if fb.OriginalVerdict == "spam" {
				stats.FalsePositiveRate++
			}
		case FeedbackPhishing:
			stats.PhishingReports++
		case FeedbackSafe:
			stats.SafeMarks++
		}

		if !fb.Processed {
			stats.PendingProcessing++
		}
	}

	// Calculate rates
	if stats.SpamReports > 0 {
		stats.FalseNegativeRate = stats.FalseNegativeRate / float64(stats.SpamReports)
	}
	if stats.NotSpamReports > 0 {
		stats.FalsePositiveRate = stats.FalsePositiveRate / float64(stats.NotSpamReports)
	}

	// Cache
	statsData, _ := json.Marshal(stats)
	s.redis.Set(ctx, cacheKey, statsData, 5*time.Minute)

	return stats, nil
}

// ============================================================
// TRAINING BATCH OPERATIONS
// ============================================================

// CreateTrainingBatch creates a batch of training data
func (s *Service) CreateTrainingBatch(ctx context.Context, orgID string) (*TrainingBatch, error) {
	// Get pending feedback
	pendingKey := fmt.Sprintf("feedback_queue:%s", orgID)

	// Get items from queue
	items, err := s.redis.LRange(ctx, pendingKey, 0, int64(s.config.MaxBatchSize-1)).Result()
	if err != nil {
		return nil, err
	}

	if len(items) < s.config.MinBatchSize {
		return nil, fmt.Errorf("not enough samples for training batch (have %d, need %d)", len(items), s.config.MinBatchSize)
	}

	batch := &TrainingBatch{
		BatchID:   generateBatchID(),
		OrgID:     orgID,
		CreatedAt: time.Now(),
		Status:    BatchPending,
		Samples:   make([]TrainingSample, 0, len(items)),
	}

	// Process each feedback into training sample
	for _, item := range items {
		var fb UserFeedback
		if err := json.Unmarshal([]byte(item), &fb); err != nil {
			continue
		}

		// Get email content (would need email service in production)
		sample := TrainingSample{
			EmailID:      fb.EmailID,
			SenderEmail:  fb.SenderEmail,
			FeedbackType: fb.Type,
			UserID:       fb.UserID,
			Timestamp:    fb.CreatedAt,
		}

		// Determine label and confidence
		switch fb.Type {
		case FeedbackSpam:
			sample.Label = "spam"
			sample.Confidence = 0.8 // User-reported
			batch.SpamCount++
		case FeedbackNotSpam, FeedbackSafe:
			sample.Label = "ham"
			sample.Confidence = 0.8
			batch.HamCount++
		case FeedbackPhishing:
			sample.Label = "phishing"
			sample.Confidence = 0.9 // User explicitly reported
			batch.PhishCount++
		default:
			continue
		}

		batch.Samples = append(batch.Samples, sample)
		batch.SampleCount++
	}

	// Save batch
	batchKey := fmt.Sprintf("training_batch:%s", batch.BatchID)
	batchData, _ := json.Marshal(batch)
	s.redis.Set(ctx, batchKey, batchData, 30*24*time.Hour)

	// Clear processed items from queue
	s.redis.LTrim(ctx, pendingKey, int64(len(items)), -1)

	// Mark feedback as processed
	for _, fb := range batch.Samples {
		s.markFeedbackProcessed(ctx, fb.EmailID, fb.UserID)
	}

	s.logger.Info().
		Str("batch_id", batch.BatchID).
		Int("sample_count", batch.SampleCount).
		Msg("Training batch created")

	return batch, nil
}

// GetTrainingBatch retrieves a training batch
func (s *Service) GetTrainingBatch(ctx context.Context, batchID string) (*TrainingBatch, error) {
	batchKey := fmt.Sprintf("training_batch:%s", batchID)

	data, err := s.redis.Get(ctx, batchKey).Bytes()
	if err != nil {
		return nil, fmt.Errorf("batch not found")
	}

	var batch TrainingBatch
	if err := json.Unmarshal(data, &batch); err != nil {
		return nil, err
	}

	return &batch, nil
}

// ListTrainingBatches lists recent training batches
func (s *Service) ListTrainingBatches(ctx context.Context, orgID string, limit int) ([]*TrainingBatch, error) {
	pattern := fmt.Sprintf("training_batch:%s:*", orgID)

	var batches []*TrainingBatch
	var cursor uint64

	for {
		keys, newCursor, err := s.redis.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, err
		}

		for _, key := range keys {
			data, err := s.redis.Get(ctx, key).Bytes()
			if err != nil {
				continue
			}

			var batch TrainingBatch
			if json.Unmarshal(data, &batch) == nil {
				batches = append(batches, &batch)
			}
		}

		cursor = newCursor
		if cursor == 0 || (limit > 0 && len(batches) >= limit) {
			break
		}
	}

	return batches, nil
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

func (s *Service) saveFeedback(ctx context.Context, feedback *UserFeedback) error {
	// Primary key by feedback ID
	cacheKey := fmt.Sprintf("feedback:%s", feedback.ID)
	data, err := json.Marshal(feedback)
	if err != nil {
		return err
	}

	// Save with TTL
	ttl := time.Duration(s.config.FeedbackRetentionDays) * 24 * time.Hour
	if err := s.redis.Set(ctx, cacheKey, data, ttl).Err(); err != nil {
		return err
	}

	// Index by user
	userKey := fmt.Sprintf("feedback_user:%s", feedback.UserID)
	s.redis.SAdd(ctx, userKey, feedback.ID)
	s.redis.Expire(ctx, userKey, ttl)

	// Index by email
	emailKey := fmt.Sprintf("feedback_email:%s", feedback.EmailID)
	s.redis.SAdd(ctx, emailKey, feedback.ID)
	s.redis.Expire(ctx, emailKey, ttl)

	// Index by org
	orgKey := fmt.Sprintf("feedback_org:%s", feedback.OrgID)
	s.redis.SAdd(ctx, orgKey, feedback.ID)
	s.redis.Expire(ctx, orgKey, ttl)

	return nil
}

func (s *Service) scanFeedback(ctx context.Context, pattern string) ([]*UserFeedback, error) {
	var feedback []*UserFeedback
	var cursor uint64

	for {
		keys, newCursor, err := s.redis.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, err
		}

		for _, key := range keys {
			data, err := s.redis.Get(ctx, key).Bytes()
			if err != nil {
				continue
			}

			var fb UserFeedback
			if json.Unmarshal(data, &fb) == nil {
				feedback = append(feedback, &fb)
			}
		}

		cursor = newCursor
		if cursor == 0 {
			break
		}
	}

	return feedback, nil
}

func (s *Service) updateReputationFromFeedback(ctx context.Context, feedback *UserFeedback) {
	if s.repService == nil {
		return
	}

	var eventType string
	switch feedback.Type {
	case FeedbackSpam:
		eventType = "user_marked_spam"
	case FeedbackNotSpam, FeedbackSafe:
		eventType = "user_marked_safe"
	case FeedbackPhishing:
		eventType = "user_report_phishing"
	default:
		return
	}

	s.repService.UpdateReputation(ctx, &ReputationUpdate{
		SenderEmail: feedback.SenderEmail,
		OrgID:       feedback.OrgID,
		EventType:   eventType,
		Timestamp:   feedback.CreatedAt,
	})
}

func (s *Service) addToTrainingQueue(ctx context.Context, feedback *UserFeedback) error {
	queueKey := fmt.Sprintf("feedback_queue:%s", feedback.OrgID)
	data, err := json.Marshal(feedback)
	if err != nil {
		return err
	}

	return s.redis.RPush(ctx, queueKey, data).Err()
}

func (s *Service) markFeedbackProcessed(ctx context.Context, emailID, userID string) {
	// Find and update feedback
	pattern := fmt.Sprintf("feedback:*:%s:*", emailID)
	keys, _, _ := s.redis.Scan(ctx, 0, pattern, 10).Result()

	for _, key := range keys {
		data, err := s.redis.Get(ctx, key).Bytes()
		if err != nil {
			continue
		}

		var fb UserFeedback
		if json.Unmarshal(data, &fb) == nil && fb.UserID == userID {
			now := time.Now()
			fb.Processed = true
			fb.ProcessedAt = &now
			fb.IncludedInRetrain = true

			updated, _ := json.Marshal(fb)
			s.redis.Set(ctx, key, updated, 0)
		}
	}
}

func generateFeedbackID() string {
	return fmt.Sprintf("fb_%d_%d", time.Now().UnixNano(), time.Now().Nanosecond()%10000)
}

func generateBatchID() string {
	return fmt.Sprintf("batch_%d", time.Now().UnixNano())
}

func extractDomain(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) == 2 {
		return strings.ToLower(parts[1])
	}
	return ""
}

// strings import
import "strings"
