package service

import (
	"context"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// AnalyticsService handles analytics business logic
type AnalyticsService struct {
	repo   *repository.AnalyticsRepository
	logger zerolog.Logger
}

// NewAnalyticsService creates a new AnalyticsService
func NewAnalyticsService(repo *repository.AnalyticsRepository, logger zerolog.Logger) *AnalyticsService {
	return &AnalyticsService{
		repo:   repo,
		logger: logger,
	}
}

// GetOverview retrieves high-level email statistics
func (s *AnalyticsService) GetOverview(ctx context.Context, req *models.AnalyticsRequest) (*models.OverviewStats, error) {
	return s.repo.GetOverviewStats(ctx, req.DomainID, req.StartDate, req.EndDate)
}

// GetTimeSeries retrieves time-series statistics
func (s *AnalyticsService) GetTimeSeries(ctx context.Context, req *models.AnalyticsRequest) (*models.TimeSeriesStats, error) {
	return s.repo.GetTimeSeriesStats(ctx, req.DomainID, req.StartDate, req.EndDate, req.Period)
}

// GetBounces retrieves bounce statistics
func (s *AnalyticsService) GetBounces(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) (*models.BounceStats, error) {
	return s.repo.GetBounceStats(ctx, domainID, startDate, endDate)
}

// GetByCategory retrieves statistics grouped by category
func (s *AnalyticsService) GetByCategory(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) ([]models.CategoryStats, error) {
	return s.repo.GetCategoryStats(ctx, domainID, startDate, endDate)
}

// GetByDomain retrieves statistics grouped by recipient domain
func (s *AnalyticsService) GetByDomain(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time, limit int) ([]models.DomainStats, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	return s.repo.GetDomainStats(ctx, domainID, startDate, endDate, limit)
}

// GetGeoDistribution retrieves geographic statistics
func (s *AnalyticsService) GetGeoDistribution(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time, limit int) ([]models.GeoStats, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	return s.repo.GetGeoStats(ctx, domainID, startDate, endDate, limit)
}

// GetDeviceBreakdown retrieves device statistics
func (s *AnalyticsService) GetDeviceBreakdown(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) ([]models.DeviceStats, error) {
	return s.repo.GetDeviceStats(ctx, domainID, startDate, endDate)
}

// GetLinkPerformance retrieves click statistics by link
func (s *AnalyticsService) GetLinkPerformance(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time, limit int) ([]models.LinkStats, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	return s.repo.GetLinkStats(ctx, domainID, startDate, endDate, limit)
}

// GetEngagement retrieves overall engagement statistics
func (s *AnalyticsService) GetEngagement(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) (*models.EngagementStats, error) {
	overview, err := s.repo.GetOverviewStats(ctx, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}

	categories, err := s.repo.GetCategoryStats(ctx, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}

	domains, err := s.repo.GetDomainStats(ctx, domainID, startDate, endDate, 10)
	if err != nil {
		return nil, err
	}

	links, err := s.repo.GetLinkStats(ctx, domainID, startDate, endDate, 10)
	if err != nil {
		return nil, err
	}

	geo, err := s.repo.GetGeoStats(ctx, domainID, startDate, endDate, 10)
	if err != nil {
		return nil, err
	}

	devices, err := s.repo.GetDeviceStats(ctx, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}

	// Calculate engagement score (simple algorithm)
	score := calculateEngagementScore(overview)

	return &models.EngagementStats{
		Period:          startDate.Format("2006-01-02") + " to " + endDate.Format("2006-01-02"),
		OverallScore:    score,
		OpenRate:        overview.OpenRate,
		ClickRate:       overview.ClickRate,
		TopCategories:   categories,
		TopDomains:      domains,
		TopLinks:        links,
		GeoDistribution: geo,
		DeviceBreakdown: devices,
	}, nil
}

// GetRealTime retrieves real-time statistics
func (s *AnalyticsService) GetRealTime(ctx context.Context, domainID uuid.UUID) (*models.RealTimeStats, error) {
	return s.repo.GetRealTimeStats(ctx, domainID)
}

// GetComparison retrieves comparison statistics between two periods
func (s *AnalyticsService) GetComparison(ctx context.Context, domainID uuid.UUID, currentStart, currentEnd time.Time) (*models.ComparisonStats, error) {
	// Calculate previous period of same length
	periodLength := currentEnd.Sub(currentStart)
	previousEnd := currentStart.Add(-time.Second)
	previousStart := previousEnd.Add(-periodLength)

	return s.repo.GetComparisonStats(ctx, domainID, currentStart, currentEnd, previousStart, previousEnd)
}

// GetReputation retrieves sender reputation statistics
func (s *AnalyticsService) GetReputation(ctx context.Context, domainID uuid.UUID) (*models.ReputationStats, error) {
	// Get last 30 days stats
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -30)

	overview, err := s.repo.GetOverviewStats(ctx, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}

	// Get previous 30 days for trend
	prevEndDate := startDate.Add(-time.Second)
	prevStartDate := prevEndDate.AddDate(0, 0, -30)

	prevOverview, err := s.repo.GetOverviewStats(ctx, domainID, prevStartDate, prevEndDate)
	if err != nil {
		return nil, err
	}

	// Calculate reputation score
	score := calculateReputationScore(overview)

	// Determine trend
	prevScore := calculateReputationScore(prevOverview)
	var trend string
	if score > prevScore+2 {
		trend = "up"
	} else if score < prevScore-2 {
		trend = "down"
	} else {
		trend = "stable"
	}

	// Generate recommendations
	recommendations := generateRecommendations(overview)

	return &models.ReputationStats{
		Score:           score,
		TrendDirection:  trend,
		BounceRate:      overview.BounceRate,
		SpamRate:        overview.SpamRate,
		UnsubscribeRate: overview.UnsubscribeRate,
		Recommendations: recommendations,
		LastUpdated:     time.Now(),
	}, nil
}

// IncrementStat increments a specific stat
func (s *AnalyticsService) IncrementStat(ctx context.Context, domainID uuid.UUID, category, stat string) error {
	return s.repo.IncrementDailyStat(ctx, domainID, category, stat)
}

// calculateEngagementScore calculates an engagement score from 0-100
func calculateEngagementScore(stats *models.OverviewStats) float64 {
	if stats == nil || stats.TotalSent == 0 {
		return 0
	}

	// Weight factors
	deliveryWeight := 0.30
	openWeight := 0.35
	clickWeight := 0.25
	bounceWeight := 0.05
	spamWeight := 0.05

	// Normalize rates (ideal values)
	deliveryScore := min(stats.DeliveryRate/95*100, 100) * deliveryWeight
	openScore := min(stats.OpenRate/25*100, 100) * openWeight
	clickScore := min(stats.ClickRate/5*100, 100) * clickWeight
	bounceScore := max(100-stats.BounceRate*10, 0) * bounceWeight
	spamScore := max(100-stats.SpamRate*100, 0) * spamWeight

	return deliveryScore + openScore + clickScore + bounceScore + spamScore
}

// calculateReputationScore calculates a reputation score from 0-100
func calculateReputationScore(stats *models.OverviewStats) float64 {
	if stats == nil || stats.TotalSent == 0 {
		return 50 // Default neutral score
	}

	score := 100.0

	// Deduct for bounces (up to 30 points)
	score -= min(stats.BounceRate*3, 30)

	// Deduct for spam (up to 40 points)
	score -= min(stats.SpamRate*40, 40)

	// Deduct for unsubscribes (up to 10 points)
	score -= min(stats.UnsubscribeRate*10, 10)

	// Bonus for good engagement (up to 20 points)
	if stats.OpenRate > 20 {
		score += min((stats.OpenRate-20)*0.5, 10)
	}
	if stats.ClickRate > 2 {
		score += min((stats.ClickRate-2)*2, 10)
	}

	return max(min(score, 100), 0)
}

// generateRecommendations generates improvement recommendations
func generateRecommendations(stats *models.OverviewStats) []string {
	var recommendations []string

	if stats.BounceRate > 5 {
		recommendations = append(recommendations,
			"Your bounce rate is above 5%. Consider cleaning your email list and removing invalid addresses.")
	}

	if stats.SpamRate > 0.1 {
		recommendations = append(recommendations,
			"You're receiving spam complaints. Review your content and ensure recipients have opted in.")
	}

	if stats.OpenRate < 15 {
		recommendations = append(recommendations,
			"Your open rate is below average. Try improving subject lines and sending at optimal times.")
	}

	if stats.ClickRate < 2 {
		recommendations = append(recommendations,
			"Your click rate could be improved. Use clear call-to-actions and relevant content.")
	}

	if stats.UnsubscribeRate > 1 {
		recommendations = append(recommendations,
			"High unsubscribe rate detected. Consider segmenting your audience and personalizing content.")
	}

	if len(recommendations) == 0 {
		recommendations = append(recommendations,
			"Your email performance looks good! Keep up the great work.")
	}

	return recommendations
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
