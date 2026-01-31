package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"transactional-api/models"
	"transactional-api/repository"
)

type AnalyticsService struct {
	eventRepo *repository.EventRepository
	emailRepo *repository.EmailRepository
	logger    *zap.Logger
}

func NewAnalyticsService(
	eventRepo *repository.EventRepository,
	emailRepo *repository.EmailRepository,
	logger *zap.Logger,
) *AnalyticsService {
	return &AnalyticsService{
		eventRepo: eventRepo,
		emailRepo: emailRepo,
		logger:    logger,
	}
}

func (s *AnalyticsService) GetOverview(ctx context.Context, orgID uuid.UUID, from, to time.Time) (*models.AnalyticsOverview, error) {
	// Get email stats
	emailStats, err := s.emailRepo.GetStats(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}

	// Get event stats
	eventStats, err := s.eventRepo.GetStats(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}

	overview := &models.AnalyticsOverview{
		Period:         formatPeriod(from, to),
		TotalSent:      emailStats.TotalSent,
		TotalDelivered: eventStats[models.EventDelivered],
		TotalBounced:   eventStats[models.EventBounced],
		TotalOpened:    eventStats[models.EventOpened],
		TotalClicked:   eventStats[models.EventClicked],
	}

	// Calculate rates
	if overview.TotalSent > 0 {
		overview.DeliveryRate = float64(overview.TotalDelivered) / float64(overview.TotalSent) * 100
		overview.BounceRate = float64(overview.TotalBounced) / float64(overview.TotalSent) * 100
	}
	if overview.TotalDelivered > 0 {
		overview.OpenRate = float64(overview.TotalOpened) / float64(overview.TotalDelivered) * 100
		overview.ClickRate = float64(overview.TotalClicked) / float64(overview.TotalDelivered) * 100
	}

	return overview, nil
}

func (s *AnalyticsService) GetDeliveryStats(ctx context.Context, orgID uuid.UUID, from, to time.Time, interval string) (*models.DeliveryStats, error) {
	delivered, err := s.eventRepo.GetTimeSeries(ctx, orgID, models.EventDelivered, from, to, interval)
	if err != nil {
		return nil, err
	}

	bounced, err := s.eventRepo.GetTimeSeries(ctx, orgID, models.EventBounced, from, to, interval)
	if err != nil {
		return nil, err
	}

	deferred, err := s.eventRepo.GetTimeSeries(ctx, orgID, models.EventDeferred, from, to, interval)
	if err != nil {
		return nil, err
	}

	dropped, err := s.eventRepo.GetTimeSeries(ctx, orgID, models.EventDropped, from, to, interval)
	if err != nil {
		return nil, err
	}

	return &models.DeliveryStats{
		Period:    formatPeriod(from, to),
		Delivered: delivered,
		Bounced:   bounced,
		Deferred:  deferred,
		Dropped:   dropped,
	}, nil
}

func (s *AnalyticsService) GetEngagementStats(ctx context.Context, orgID uuid.UUID, from, to time.Time, interval string) (*models.EngagementStats, error) {
	opens, err := s.eventRepo.GetTimeSeries(ctx, orgID, models.EventOpened, from, to, interval)
	if err != nil {
		return nil, err
	}

	clicks, err := s.eventRepo.GetTimeSeries(ctx, orgID, models.EventClicked, from, to, interval)
	if err != nil {
		return nil, err
	}

	uniqueOpens, err := s.eventRepo.GetUniqueCount(ctx, orgID, models.EventOpened, from, to)
	if err != nil {
		return nil, err
	}

	uniqueClicks, err := s.eventRepo.GetUniqueCount(ctx, orgID, models.EventClicked, from, to)
	if err != nil {
		return nil, err
	}

	topLinks, err := s.eventRepo.GetTopLinks(ctx, orgID, from, to, 10)
	if err != nil {
		return nil, err
	}

	return &models.EngagementStats{
		Period:       formatPeriod(from, to),
		Opens:        opens,
		Clicks:       clicks,
		UniqueOpens:  uniqueOpens,
		UniqueClicks: uniqueClicks,
		TopLinks:     topLinks,
	}, nil
}

func (s *AnalyticsService) GetBounceStats(ctx context.Context, orgID uuid.UUID, from, to time.Time, interval string) (*models.BounceStats, error) {
	// For simplicity, we'll use the general bounce time series
	// In production, you'd differentiate by bounce_type
	bounced, err := s.eventRepo.GetTimeSeries(ctx, orgID, models.EventBounced, from, to, interval)
	if err != nil {
		return nil, err
	}

	topReasons, err := s.eventRepo.GetBounceStats(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}

	return &models.BounceStats{
		Period:     formatPeriod(from, to),
		HardBounce: bounced, // Simplified - in production, filter by bounce_type
		SoftBounce: []models.TimeSeriesData{},
		TopReasons: topReasons,
	}, nil
}

func (s *AnalyticsService) GetDomainStats(ctx context.Context, orgID uuid.UUID, from, to time.Time, limit int) ([]models.DomainStats, error) {
	// This would require a more complex query joining emails and events
	// For now, return a placeholder
	return []models.DomainStats{}, nil
}

func formatPeriod(from, to time.Time) string {
	return from.Format("2006-01-02") + " to " + to.Format("2006-01-02")
}
