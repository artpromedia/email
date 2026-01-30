// Package reputation provides sender reputation tracking and scoring
package reputation

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// ============================================================
// TYPES
// ============================================================

// SenderReputation contains reputation data for a sender
type SenderReputation struct {
	// Identity
	SenderID     string `json:"sender_id"`      // Hash of email address
	Email        string `json:"email"`          // Sender email
	Domain       string `json:"domain"`         // Sender domain
	OrgID        string `json:"org_id"`         // Organization receiving emails

	// Counters
	TotalEmails    int64 `json:"total_emails"`
	SpamCount      int64 `json:"spam_count"`
	PhishingCount  int64 `json:"phishing_count"`
	HamCount       int64 `json:"ham_count"`       // Confirmed legitimate
	BounceCount    int64 `json:"bounce_count"`

	// User feedback
	UserSpamReports    int64 `json:"user_spam_reports"`
	UserSafeReports    int64 `json:"user_safe_reports"`
	UserPhishingReports int64 `json:"user_phishing_reports"`

	// Engagement metrics
	OpenCount      int64 `json:"open_count"`
	ReplyCount     int64 `json:"reply_count"`
	ClickCount     int64 `json:"click_count"`
	UnsubCount     int64 `json:"unsub_count"`

	// Computed scores
	ReputationScore float64   `json:"reputation_score"` // 0.0-1.0, higher = better
	TrustLevel      TrustLevel `json:"trust_level"`
	RiskLevel       RiskLevel  `json:"risk_level"`

	// Metadata
	FirstSeen    time.Time `json:"first_seen"`
	LastSeen     time.Time `json:"last_seen"`
	LastUpdated  time.Time `json:"last_updated"`

	// Trend
	ScoreHistory []ScorePoint `json:"score_history,omitempty"`
}

// TrustLevel categorizes sender trust
type TrustLevel string

const (
	TrustVIP       TrustLevel = "vip"        // Manually trusted
	TrustTrusted   TrustLevel = "trusted"    // High reputation
	TrustNeutral   TrustLevel = "neutral"    // Unknown/new sender
	TrustSuspicious TrustLevel = "suspicious" // Some negative signals
	TrustUntrusted TrustLevel = "untrusted"  // Bad reputation
	TrustBlocked   TrustLevel = "blocked"    // Manually blocked
)

// RiskLevel indicates spam/phishing risk
type RiskLevel string

const (
	RiskNone    RiskLevel = "none"
	RiskLow     RiskLevel = "low"
	RiskMedium  RiskLevel = "medium"
	RiskHigh    RiskLevel = "high"
	RiskCritical RiskLevel = "critical"
)

// ScorePoint represents a historical reputation score
type ScorePoint struct {
	Score     float64   `json:"score"`
	Timestamp time.Time `json:"timestamp"`
}

// ReputationUpdate contains data for updating reputation
type ReputationUpdate struct {
	SenderEmail string          `json:"sender_email"`
	OrgID       string          `json:"org_id"`
	EventType   ReputationEvent `json:"event_type"`
	EmailID     string          `json:"email_id,omitempty"`
	SpamScore   float64         `json:"spam_score,omitempty"`
	PhishScore  float64         `json:"phish_score,omitempty"`
	Timestamp   time.Time       `json:"timestamp"`
}

// ReputationEvent types
type ReputationEvent string

const (
	EventEmailReceived   ReputationEvent = "email_received"
	EventSpamDetected    ReputationEvent = "spam_detected"
	EventPhishingDetected ReputationEvent = "phishing_detected"
	EventUserMarkedSpam  ReputationEvent = "user_marked_spam"
	EventUserMarkedSafe  ReputationEvent = "user_marked_safe"
	EventUserReportPhish ReputationEvent = "user_report_phishing"
	EventEmailOpened     ReputationEvent = "email_opened"
	EventEmailReplied    ReputationEvent = "email_replied"
	EventLinkClicked     ReputationEvent = "link_clicked"
	EventUnsubscribed    ReputationEvent = "unsubscribed"
	EventBounced         ReputationEvent = "bounced"
)

// DomainReputation contains aggregated domain-level reputation
type DomainReputation struct {
	Domain          string    `json:"domain"`
	OrgID           string    `json:"org_id"`
	TotalSenders    int64     `json:"total_senders"`
	TotalEmails     int64     `json:"total_emails"`
	SpamRate        float64   `json:"spam_rate"`
	PhishRate       float64   `json:"phish_rate"`
	ReputationScore float64   `json:"reputation_score"`
	LastUpdated     time.Time `json:"last_updated"`
}

// ReputationQuery for fetching reputation data
type ReputationQuery struct {
	OrgID      string     `json:"org_id"`
	Email      string     `json:"email,omitempty"`
	Domain     string     `json:"domain,omitempty"`
	TrustLevel TrustLevel `json:"trust_level,omitempty"`
	RiskLevel  RiskLevel  `json:"risk_level,omitempty"`
	MinScore   float64    `json:"min_score,omitempty"`
	MaxScore   float64    `json:"max_score,omitempty"`
	Limit      int        `json:"limit,omitempty"`
	Offset     int        `json:"offset,omitempty"`
}

// ReputationStats contains aggregate statistics
type ReputationStats struct {
	OrgID             string  `json:"org_id"`
	TotalSenders      int64   `json:"total_senders"`
	TrustedSenders    int64   `json:"trusted_senders"`
	SuspiciousSenders int64   `json:"suspicious_senders"`
	BlockedSenders    int64   `json:"blocked_senders"`
	AvgReputation     float64 `json:"avg_reputation"`
	SpamRate          float64 `json:"spam_rate"`
	PhishRate         float64 `json:"phish_rate"`
	Period            string  `json:"period"` // 7d, 30d, 90d
}

// ============================================================
// SERVICE
// ============================================================

// Service provides sender reputation management
type Service struct {
	redis   *redis.Client
	logger  zerolog.Logger

	// In-memory cache for hot senders
	cache     sync.Map
	cacheSize int

	// Configuration
	config ReputationConfig
}

// ReputationConfig contains service configuration
type ReputationConfig struct {
	// Score weights
	SpamWeight         float64 `json:"spam_weight"`
	PhishingWeight     float64 `json:"phishing_weight"`
	UserReportWeight   float64 `json:"user_report_weight"`
	EngagementWeight   float64 `json:"engagement_weight"`

	// Decay settings
	ScoreDecayDays     int     `json:"score_decay_days"`
	DecayRate          float64 `json:"decay_rate"`

	// Thresholds
	TrustedThreshold   float64 `json:"trusted_threshold"`
	SuspiciousThreshold float64 `json:"suspicious_threshold"`
	UntrustedThreshold float64 `json:"untrusted_threshold"`

	// Cache
	CacheTTL           time.Duration `json:"cache_ttl"`
	HistoryRetention   int           `json:"history_retention_days"`
}

// NewService creates a new reputation service
func NewService(redis *redis.Client, logger zerolog.Logger) *Service {
	return &Service{
		redis:  redis,
		logger: logger.With().Str("service", "reputation").Logger(),
		config: defaultConfig(),
	}
}

func defaultConfig() ReputationConfig {
	return ReputationConfig{
		SpamWeight:          0.3,
		PhishingWeight:      0.4,
		UserReportWeight:    0.2,
		EngagementWeight:    0.1,
		ScoreDecayDays:      30,
		DecayRate:           0.95,
		TrustedThreshold:    0.8,
		SuspiciousThreshold: 0.5,
		UntrustedThreshold:  0.3,
		CacheTTL:            5 * time.Minute,
		HistoryRetention:    90,
	}
}

// ============================================================
// REPUTATION OPERATIONS
// ============================================================

// GetReputation retrieves reputation for a sender
func (s *Service) GetReputation(ctx context.Context, email, orgID string) (*SenderReputation, error) {
	senderID := generateSenderID(email, orgID)

	// Check in-memory cache
	if cached, ok := s.cache.Load(senderID); ok {
		return cached.(*SenderReputation), nil
	}

	// Check Redis
	cacheKey := fmt.Sprintf("reputation:%s", senderID)
	data, err := s.redis.Get(ctx, cacheKey).Bytes()
	if err == nil {
		var rep SenderReputation
		if json.Unmarshal(data, &rep) == nil {
			s.cache.Store(senderID, &rep)
			return &rep, nil
		}
	}

	// Return new sender with neutral reputation
	return s.newSenderReputation(email, orgID), nil
}

// UpdateReputation updates sender reputation based on an event
func (s *Service) UpdateReputation(ctx context.Context, update *ReputationUpdate) (*SenderReputation, error) {
	rep, err := s.GetReputation(ctx, update.SenderEmail, update.OrgID)
	if err != nil {
		return nil, fmt.Errorf("failed to get reputation: %w", err)
	}

	// Update counters based on event type
	now := time.Now()
	rep.LastSeen = now
	rep.LastUpdated = now

	switch update.EventType {
	case EventEmailReceived:
		rep.TotalEmails++

	case EventSpamDetected:
		rep.SpamCount++
		rep.TotalEmails++

	case EventPhishingDetected:
		rep.PhishingCount++
		rep.TotalEmails++

	case EventUserMarkedSpam:
		rep.UserSpamReports++

	case EventUserMarkedSafe:
		rep.UserSafeReports++
		rep.HamCount++

	case EventUserReportPhish:
		rep.UserPhishingReports++

	case EventEmailOpened:
		rep.OpenCount++

	case EventEmailReplied:
		rep.ReplyCount++

	case EventLinkClicked:
		rep.ClickCount++

	case EventUnsubscribed:
		rep.UnsubCount++

	case EventBounced:
		rep.BounceCount++
	}

	// Recalculate score
	s.recalculateScore(rep)

	// Update trust and risk levels
	rep.TrustLevel = s.determineTrustLevel(rep)
	rep.RiskLevel = s.determineRiskLevel(rep)

	// Add to score history
	rep.ScoreHistory = append(rep.ScoreHistory, ScorePoint{
		Score:     rep.ReputationScore,
		Timestamp: now,
	})

	// Trim history to retention period
	cutoff := now.AddDate(0, 0, -s.config.HistoryRetention)
	var trimmed []ScorePoint
	for _, sp := range rep.ScoreHistory {
		if sp.Timestamp.After(cutoff) {
			trimmed = append(trimmed, sp)
		}
	}
	rep.ScoreHistory = trimmed

	// Save to Redis
	if err := s.saveReputation(ctx, rep); err != nil {
		return nil, fmt.Errorf("failed to save reputation: %w", err)
	}

	// Update domain reputation
	go s.updateDomainReputation(context.Background(), rep.Domain, update.OrgID)

	s.logger.Debug().
		Str("email", update.SenderEmail).
		Str("event", string(update.EventType)).
		Float64("score", rep.ReputationScore).
		Msg("Reputation updated")

	return rep, nil
}

// BulkUpdateReputation updates multiple senders
func (s *Service) BulkUpdateReputation(ctx context.Context, updates []*ReputationUpdate) error {
	for _, update := range updates {
		if _, err := s.UpdateReputation(ctx, update); err != nil {
			s.logger.Error().Err(err).Str("email", update.SenderEmail).Msg("Failed to update reputation")
		}
	}
	return nil
}

// SetTrustLevel manually sets trust level (VIP or blocked)
func (s *Service) SetTrustLevel(ctx context.Context, email, orgID string, level TrustLevel) error {
	rep, err := s.GetReputation(ctx, email, orgID)
	if err != nil {
		return err
	}

	rep.TrustLevel = level
	rep.LastUpdated = time.Now()

	// Adjust score based on manual override
	switch level {
	case TrustVIP:
		rep.ReputationScore = 1.0
	case TrustBlocked:
		rep.ReputationScore = 0.0
	}

	return s.saveReputation(ctx, rep)
}

// GetDomainReputation retrieves aggregated domain reputation
func (s *Service) GetDomainReputation(ctx context.Context, domain, orgID string) (*DomainReputation, error) {
	cacheKey := fmt.Sprintf("domain_rep:%s:%s", domain, orgID)

	data, err := s.redis.Get(ctx, cacheKey).Bytes()
	if err == nil {
		var rep DomainReputation
		if json.Unmarshal(data, &rep) == nil {
			return &rep, nil
		}
	}

	// Return new domain with neutral reputation
	return &DomainReputation{
		Domain:          domain,
		OrgID:           orgID,
		ReputationScore: 0.5,
		LastUpdated:     time.Now(),
	}, nil
}

// QueryReputation searches for senders matching criteria
func (s *Service) QueryReputation(ctx context.Context, query *ReputationQuery) ([]*SenderReputation, int64, error) {
	// Build Redis search pattern
	pattern := fmt.Sprintf("reputation:*:%s", query.OrgID)

	var results []*SenderReputation
	var cursor uint64
	var total int64

	for {
		keys, newCursor, err := s.redis.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, 0, err
		}

		for _, key := range keys {
			data, err := s.redis.Get(ctx, key).Bytes()
			if err != nil {
				continue
			}

			var rep SenderReputation
			if err := json.Unmarshal(data, &rep); err != nil {
				continue
			}

			// Apply filters
			if query.Email != "" && rep.Email != query.Email {
				continue
			}
			if query.Domain != "" && rep.Domain != query.Domain {
				continue
			}
			if query.TrustLevel != "" && rep.TrustLevel != query.TrustLevel {
				continue
			}
			if query.RiskLevel != "" && rep.RiskLevel != query.RiskLevel {
				continue
			}
			if query.MinScore > 0 && rep.ReputationScore < query.MinScore {
				continue
			}
			if query.MaxScore > 0 && rep.ReputationScore > query.MaxScore {
				continue
			}

			total++

			// Apply pagination
			if query.Offset > 0 && total <= int64(query.Offset) {
				continue
			}
			if query.Limit > 0 && len(results) >= query.Limit {
				continue
			}

			results = append(results, &rep)
		}

		cursor = newCursor
		if cursor == 0 {
			break
		}
	}

	return results, total, nil
}

// GetStats returns aggregate statistics for an organization
func (s *Service) GetStats(ctx context.Context, orgID string, period string) (*ReputationStats, error) {
	cacheKey := fmt.Sprintf("reputation_stats:%s:%s", orgID, period)

	// Try cache first
	data, err := s.redis.Get(ctx, cacheKey).Bytes()
	if err == nil {
		var stats ReputationStats
		if json.Unmarshal(data, &stats) == nil {
			return &stats, nil
		}
	}

	// Calculate stats
	stats := &ReputationStats{
		OrgID:  orgID,
		Period: period,
	}

	// Query all senders for this org
	reps, total, err := s.QueryReputation(ctx, &ReputationQuery{OrgID: orgID})
	if err != nil {
		return nil, err
	}

	stats.TotalSenders = total

	var scoreSum float64
	var spamTotal, phishTotal, emailTotal int64

	for _, rep := range reps {
		scoreSum += rep.ReputationScore
		spamTotal += rep.SpamCount
		phishTotal += rep.PhishingCount
		emailTotal += rep.TotalEmails

		switch rep.TrustLevel {
		case TrustTrusted, TrustVIP:
			stats.TrustedSenders++
		case TrustSuspicious, TrustUntrusted:
			stats.SuspiciousSenders++
		case TrustBlocked:
			stats.BlockedSenders++
		}
	}

	if len(reps) > 0 {
		stats.AvgReputation = scoreSum / float64(len(reps))
	}
	if emailTotal > 0 {
		stats.SpamRate = float64(spamTotal) / float64(emailTotal)
		stats.PhishRate = float64(phishTotal) / float64(emailTotal)
	}

	// Cache for 5 minutes
	statsData, _ := json.Marshal(stats)
	s.redis.Set(ctx, cacheKey, statsData, 5*time.Minute)

	return stats, nil
}

// ============================================================
// SCORE CALCULATION
// ============================================================

func (s *Service) recalculateScore(rep *SenderReputation) {
	if rep.TotalEmails == 0 {
		rep.ReputationScore = 0.5 // Neutral for new senders
		return
	}

	// Base score starts at 0.5 (neutral)
	score := 0.5

	// Spam factor (negative)
	if rep.TotalEmails > 0 {
		spamRate := float64(rep.SpamCount) / float64(rep.TotalEmails)
		score -= spamRate * s.config.SpamWeight
	}

	// Phishing factor (heavily negative)
	if rep.TotalEmails > 0 {
		phishRate := float64(rep.PhishingCount) / float64(rep.TotalEmails)
		score -= phishRate * s.config.PhishingWeight
	}

	// User reports factor
	totalReports := rep.UserSpamReports + rep.UserSafeReports + rep.UserPhishingReports
	if totalReports > 0 {
		reportFactor := (float64(rep.UserSafeReports) - float64(rep.UserSpamReports+rep.UserPhishingReports*2)) / float64(totalReports)
		score += reportFactor * s.config.UserReportWeight
	}

	// Engagement factor (positive)
	if rep.TotalEmails > 0 {
		engagementRate := float64(rep.OpenCount+rep.ReplyCount) / float64(rep.TotalEmails)
		score += engagementRate * s.config.EngagementWeight * 0.5
	}

	// Apply age decay for inactive senders
	if rep.LastSeen.Before(time.Now().AddDate(0, 0, -s.config.ScoreDecayDays)) {
		daysSinceLastSeen := int(time.Since(rep.LastSeen).Hours() / 24)
		decayFactor := math.Pow(s.config.DecayRate, float64(daysSinceLastSeen-s.config.ScoreDecayDays))

		// Decay towards neutral (0.5)
		if score > 0.5 {
			score = 0.5 + (score-0.5)*decayFactor
		} else {
			score = 0.5 - (0.5-score)*decayFactor
		}
	}

	// Clamp to [0, 1]
	if score < 0 {
		score = 0
	} else if score > 1 {
		score = 1
	}

	rep.ReputationScore = score
}

func (s *Service) determineTrustLevel(rep *SenderReputation) TrustLevel {
	// Manual overrides take precedence
	if rep.TrustLevel == TrustVIP || rep.TrustLevel == TrustBlocked {
		return rep.TrustLevel
	}

	if rep.ReputationScore >= s.config.TrustedThreshold {
		return TrustTrusted
	} else if rep.ReputationScore >= s.config.SuspiciousThreshold {
		return TrustNeutral
	} else if rep.ReputationScore >= s.config.UntrustedThreshold {
		return TrustSuspicious
	}
	return TrustUntrusted
}

func (s *Service) determineRiskLevel(rep *SenderReputation) RiskLevel {
	// Calculate risk based on spam/phishing history
	if rep.TotalEmails == 0 {
		return RiskNone
	}

	spamRate := float64(rep.SpamCount) / float64(rep.TotalEmails)
	phishRate := float64(rep.PhishingCount) / float64(rep.TotalEmails)

	// Phishing is more serious
	combinedRisk := spamRate + phishRate*2

	if combinedRisk >= 0.5 || rep.PhishingCount > 0 {
		return RiskCritical
	} else if combinedRisk >= 0.3 {
		return RiskHigh
	} else if combinedRisk >= 0.1 {
		return RiskMedium
	} else if combinedRisk > 0 {
		return RiskLow
	}
	return RiskNone
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

func (s *Service) newSenderReputation(email, orgID string) *SenderReputation {
	domain := extractDomain(email)
	now := time.Now()

	return &SenderReputation{
		SenderID:        generateSenderID(email, orgID),
		Email:           email,
		Domain:          domain,
		OrgID:           orgID,
		ReputationScore: 0.5, // Neutral starting score
		TrustLevel:      TrustNeutral,
		RiskLevel:       RiskNone,
		FirstSeen:       now,
		LastSeen:        now,
		LastUpdated:     now,
	}
}

func (s *Service) saveReputation(ctx context.Context, rep *SenderReputation) error {
	cacheKey := fmt.Sprintf("reputation:%s", rep.SenderID)

	data, err := json.Marshal(rep)
	if err != nil {
		return err
	}

	// Save to Redis with TTL
	if err := s.redis.Set(ctx, cacheKey, data, 30*24*time.Hour).Err(); err != nil {
		return err
	}

	// Update in-memory cache
	s.cache.Store(rep.SenderID, rep)

	return nil
}

func (s *Service) updateDomainReputation(ctx context.Context, domain, orgID string) {
	// Aggregate all sender reputations for this domain
	reps, _, err := s.QueryReputation(ctx, &ReputationQuery{
		OrgID:  orgID,
		Domain: domain,
	})
	if err != nil {
		s.logger.Error().Err(err).Str("domain", domain).Msg("Failed to query domain senders")
		return
	}

	if len(reps) == 0 {
		return
	}

	domainRep := &DomainReputation{
		Domain:       domain,
		OrgID:        orgID,
		TotalSenders: int64(len(reps)),
		LastUpdated:  time.Now(),
	}

	var scoreSum float64
	var spamTotal, phishTotal, emailTotal int64

	for _, rep := range reps {
		scoreSum += rep.ReputationScore
		spamTotal += rep.SpamCount
		phishTotal += rep.PhishingCount
		emailTotal += rep.TotalEmails
	}

	domainRep.TotalEmails = emailTotal
	domainRep.ReputationScore = scoreSum / float64(len(reps))

	if emailTotal > 0 {
		domainRep.SpamRate = float64(spamTotal) / float64(emailTotal)
		domainRep.PhishRate = float64(phishTotal) / float64(emailTotal)
	}

	// Save domain reputation
	cacheKey := fmt.Sprintf("domain_rep:%s:%s", domain, orgID)
	data, _ := json.Marshal(domainRep)
	s.redis.Set(ctx, cacheKey, data, 24*time.Hour)
}

func generateSenderID(email, orgID string) string {
	return fmt.Sprintf("%x:%s", hashEmail(email), orgID)
}

func hashEmail(email string) uint32 {
	var h uint32
	for _, c := range email {
		h = h*31 + uint32(c)
	}
	return h
}

func extractDomain(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) == 2 {
		return strings.ToLower(parts[1])
	}
	return ""
}

// ============================================================
// EXPORTED UTILITIES
// ============================================================

// QuickCheck performs a fast reputation lookup (for SMTP time)
func (s *Service) QuickCheck(ctx context.Context, email, orgID string) (score float64, risk RiskLevel, err error) {
	rep, err := s.GetReputation(ctx, email, orgID)
	if err != nil {
		return 0.5, RiskNone, err
	}
	return rep.ReputationScore, rep.RiskLevel, nil
}

// IsVIP checks if sender is marked as VIP
func (s *Service) IsVIP(ctx context.Context, email, orgID string) (bool, error) {
	rep, err := s.GetReputation(ctx, email, orgID)
	if err != nil {
		return false, err
	}
	return rep.TrustLevel == TrustVIP, nil
}

// IsBlocked checks if sender is blocked
func (s *Service) IsBlocked(ctx context.Context, email, orgID string) (bool, error) {
	rep, err := s.GetReputation(ctx, email, orgID)
	if err != nil {
		return false, err
	}
	return rep.TrustLevel == TrustBlocked, nil
}

// strings is already imported at top, adding explicit import note
import "strings"
