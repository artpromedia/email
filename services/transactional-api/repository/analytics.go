package repository

import (
	"context"
	"time"

	"transactional-api/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsRepository handles database operations for analytics
type AnalyticsRepository struct {
	pool *pgxpool.Pool
}

// NewAnalyticsRepository creates a new AnalyticsRepository
func NewAnalyticsRepository(pool *pgxpool.Pool) *AnalyticsRepository {
	return &AnalyticsRepository{pool: pool}
}

// GetOverviewStats retrieves high-level email statistics
func (r *AnalyticsRepository) GetOverviewStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) (*models.OverviewStats, error) {
	query := `
		SELECT
			COALESCE(SUM(sent), 0) as total_sent,
			COALESCE(SUM(delivered), 0) as total_delivered,
			COALESCE(SUM(bounced), 0) as total_bounced,
			COALESCE(SUM(opened), 0) as total_opened,
			COALESCE(SUM(clicked), 0) as total_clicked,
			COALESCE(SUM(spam_reports), 0) as total_spam,
			COALESCE(SUM(unsubscribed), 0) as total_unsubscribed,
			COALESCE(SUM(unique_opened), 0) as unique_opens,
			COALESCE(SUM(unique_clicked), 0) as unique_clicks
		FROM daily_stats
		WHERE domain_id = $1 AND date >= $2 AND date <= $3
	`

	var stats models.OverviewStats
	err := r.pool.QueryRow(ctx, query, domainID, startDate, endDate).Scan(
		&stats.TotalSent,
		&stats.TotalDelivered,
		&stats.TotalBounced,
		&stats.TotalOpened,
		&stats.TotalClicked,
		&stats.TotalSpam,
		&stats.TotalUnsubscribed,
		&stats.UniqueOpens,
		&stats.UniqueClicks,
	)
	if err != nil {
		return nil, err
	}

	stats.StartDate = startDate
	stats.EndDate = endDate

	// Calculate rates
	if stats.TotalSent > 0 {
		stats.DeliveryRate = float64(stats.TotalDelivered) / float64(stats.TotalSent) * 100
		stats.BounceRate = float64(stats.TotalBounced) / float64(stats.TotalSent) * 100
		stats.SpamRate = float64(stats.TotalSpam) / float64(stats.TotalSent) * 100
		stats.UnsubscribeRate = float64(stats.TotalUnsubscribed) / float64(stats.TotalSent) * 100
	}

	if stats.TotalDelivered > 0 {
		stats.OpenRate = float64(stats.UniqueOpens) / float64(stats.TotalDelivered) * 100
		stats.ClickRate = float64(stats.UniqueClicks) / float64(stats.TotalDelivered) * 100
	}

	if stats.UniqueOpens > 0 {
		stats.ClickToOpenRate = float64(stats.UniqueClicks) / float64(stats.UniqueOpens) * 100
	}

	return &stats, nil
}

// GetTimeSeriesStats retrieves time-series statistics
func (r *AnalyticsRepository) GetTimeSeriesStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time, period models.AnalyticsPeriod) (*models.TimeSeriesStats, error) {
	var truncFunc string
	switch period {
	case models.AnalyticsPeriodHour:
		truncFunc = "hour"
	case models.AnalyticsPeriodDay:
		truncFunc = "day"
	case models.AnalyticsPeriodWeek:
		truncFunc = "week"
	case models.AnalyticsPeriodMonth:
		truncFunc = "month"
	default:
		truncFunc = "day"
	}

	query := `
		SELECT
			date_trunc($4, date::timestamp) as period,
			SUM(sent) as sent,
			SUM(delivered) as delivered,
			SUM(bounced) as bounced,
			SUM(opened) as opened,
			SUM(clicked) as clicked
		FROM daily_stats
		WHERE domain_id = $1 AND date >= $2 AND date <= $3
		GROUP BY date_trunc($4, date::timestamp)
		ORDER BY period ASC
	`

	rows, err := r.pool.Query(ctx, query, domainID, startDate, endDate, truncFunc)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := &models.TimeSeriesStats{
		Period:    period,
		StartDate: startDate,
		EndDate:   endDate,
	}

	for rows.Next() {
		var timestamp time.Time
		var sent, delivered, bounced, opened, clicked int64
		err := rows.Scan(&timestamp, &sent, &delivered, &bounced, &opened, &clicked)
		if err != nil {
			return nil, err
		}

		stats.Sent = append(stats.Sent, models.TimeSeriesDataPoint{Timestamp: timestamp, Value: sent})
		stats.Delivered = append(stats.Delivered, models.TimeSeriesDataPoint{Timestamp: timestamp, Value: delivered})
		stats.Bounced = append(stats.Bounced, models.TimeSeriesDataPoint{Timestamp: timestamp, Value: bounced})
		stats.Opened = append(stats.Opened, models.TimeSeriesDataPoint{Timestamp: timestamp, Value: opened})
		stats.Clicked = append(stats.Clicked, models.TimeSeriesDataPoint{Timestamp: timestamp, Value: clicked})
	}

	return stats, nil
}

// GetBounceStats retrieves bounce statistics
func (r *AnalyticsRepository) GetBounceStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) (*models.BounceStats, error) {
	// Total bounce stats
	totalQuery := `
		SELECT
			COALESCE(SUM(bounced), 0) as total,
			COALESCE(SUM(hard_bounced), 0) as hard,
			COALESCE(SUM(soft_bounced), 0) as soft,
			COALESCE(SUM(sent), 0) as total_sent
		FROM daily_stats
		WHERE domain_id = $1 AND date >= $2 AND date <= $3
	`

	var stats models.BounceStats
	var totalSent int64
	err := r.pool.QueryRow(ctx, totalQuery, domainID, startDate, endDate).Scan(
		&stats.Total,
		&stats.HardBounces,
		&stats.SoftBounces,
		&totalSent,
	)
	if err != nil {
		return nil, err
	}

	stats.BlockBounces = stats.Total - stats.HardBounces - stats.SoftBounces
	if totalSent > 0 {
		stats.BounceRate = float64(stats.Total) / float64(totalSent) * 100
	}

	// Bounce reasons from events
	reasonQuery := `
		SELECT bounce_code, COUNT(*) as count
		FROM email_events
		WHERE domain_id = $1
		  AND event_type = 'bounced'
		  AND timestamp >= $2
		  AND timestamp <= $3
		  AND bounce_code IS NOT NULL
		GROUP BY bounce_code
		ORDER BY count DESC
		LIMIT 10
	`

	rows, err := r.pool.Query(ctx, reasonQuery, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var reason models.BounceReasonStats
		err := rows.Scan(&reason.Reason, &reason.Count)
		if err != nil {
			return nil, err
		}
		stats.ByReason = append(stats.ByReason, reason)
	}

	return &stats, nil
}

// GetCategoryStats retrieves statistics grouped by category
func (r *AnalyticsRepository) GetCategoryStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) ([]models.CategoryStats, error) {
	query := `
		SELECT
			COALESCE(category, 'uncategorized') as category,
			COALESCE(SUM(sent), 0) as sent,
			COALESCE(SUM(delivered), 0) as delivered,
			COALESCE(SUM(bounced), 0) as bounced,
			COALESCE(SUM(opened), 0) as opened,
			COALESCE(SUM(clicked), 0) as clicked,
			COALESCE(SUM(unique_opened), 0) as unique_opens,
			COALESCE(SUM(unique_clicked), 0) as unique_clicks
		FROM daily_stats
		WHERE domain_id = $1 AND date >= $2 AND date <= $3
		GROUP BY category
		ORDER BY sent DESC
	`

	rows, err := r.pool.Query(ctx, query, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []models.CategoryStats
	for rows.Next() {
		var s models.CategoryStats
		err := rows.Scan(
			&s.Category,
			&s.Sent,
			&s.Delivered,
			&s.Bounced,
			&s.Opened,
			&s.Clicked,
			&s.UniqueOpens,
			&s.UniqueClicks,
		)
		if err != nil {
			return nil, err
		}

		// Calculate rates
		if s.Sent > 0 {
			s.DeliveryRate = float64(s.Delivered) / float64(s.Sent) * 100
		}
		if s.Delivered > 0 {
			s.OpenRate = float64(s.UniqueOpens) / float64(s.Delivered) * 100
			s.ClickRate = float64(s.UniqueClicks) / float64(s.Delivered) * 100
		}

		stats = append(stats, s)
	}

	return stats, nil
}

// GetDomainStats retrieves statistics grouped by recipient domain
func (r *AnalyticsRepository) GetDomainStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time, limit int) ([]models.DomainStats, error) {
	query := `
		SELECT
			split_part(recipient, '@', 2) as domain,
			COUNT(*) FILTER (WHERE event_type = 'delivered') as delivered,
			COUNT(*) FILTER (WHERE event_type = 'bounced') as bounced,
			COUNT(*) FILTER (WHERE event_type = 'opened') as opened,
			COUNT(*) FILTER (WHERE event_type = 'clicked') as clicked
		FROM email_events
		WHERE domain_id = $1 AND timestamp >= $2 AND timestamp <= $3
		GROUP BY split_part(recipient, '@', 2)
		ORDER BY delivered DESC
		LIMIT $4
	`

	rows, err := r.pool.Query(ctx, query, domainID, startDate, endDate, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []models.DomainStats
	for rows.Next() {
		var s models.DomainStats
		err := rows.Scan(&s.Domain, &s.Delivered, &s.Bounced, &s.Opened, &s.Clicked)
		if err != nil {
			return nil, err
		}
		s.Sent = s.Delivered + s.Bounced // Approximate
		stats = append(stats, s)
	}

	return stats, nil
}

// GetGeoStats retrieves geographic statistics
func (r *AnalyticsRepository) GetGeoStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time, limit int) ([]models.GeoStats, error) {
	query := `
		SELECT
			geo->>'country' as country,
			geo->>'country_code' as country_code,
			COUNT(*) FILTER (WHERE event_type = 'opened') as opens,
			COUNT(*) FILTER (WHERE event_type = 'clicked') as clicks
		FROM email_events
		WHERE domain_id = $1
		  AND timestamp >= $2
		  AND timestamp <= $3
		  AND geo IS NOT NULL
		  AND geo->>'country' IS NOT NULL
		GROUP BY geo->>'country', geo->>'country_code'
		ORDER BY opens DESC
		LIMIT $4
	`

	rows, err := r.pool.Query(ctx, query, domainID, startDate, endDate, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []models.GeoStats
	var totalOpens int64
	for rows.Next() {
		var s models.GeoStats
		err := rows.Scan(&s.Country, &s.CountryCode, &s.Opens, &s.Clicks)
		if err != nil {
			return nil, err
		}
		totalOpens += s.Opens
		stats = append(stats, s)
	}

	// Calculate percentages
	for i := range stats {
		if totalOpens > 0 {
			stats[i].Percentage = float64(stats[i].Opens) / float64(totalOpens) * 100
		}
	}

	return stats, nil
}

// GetDeviceStats retrieves device statistics
func (r *AnalyticsRepository) GetDeviceStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time) ([]models.DeviceStats, error) {
	query := `
		SELECT
			COALESCE(device->>'type', 'unknown') as device_type,
			COUNT(*) FILTER (WHERE event_type = 'opened') as opens,
			COUNT(*) FILTER (WHERE event_type = 'clicked') as clicks
		FROM email_events
		WHERE domain_id = $1
		  AND timestamp >= $2
		  AND timestamp <= $3
		  AND event_type IN ('opened', 'clicked')
		GROUP BY device->>'type'
		ORDER BY opens DESC
	`

	rows, err := r.pool.Query(ctx, query, domainID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []models.DeviceStats
	var totalOpens int64
	for rows.Next() {
		var s models.DeviceStats
		err := rows.Scan(&s.Type, &s.Opens, &s.Clicks)
		if err != nil {
			return nil, err
		}
		totalOpens += s.Opens
		stats = append(stats, s)
	}

	// Calculate percentages
	for i := range stats {
		if totalOpens > 0 {
			stats[i].Percentage = float64(stats[i].Opens) / float64(totalOpens) * 100
		}
	}

	return stats, nil
}

// GetLinkStats retrieves click statistics by link
func (r *AnalyticsRepository) GetLinkStats(ctx context.Context, domainID uuid.UUID, startDate, endDate time.Time, limit int) ([]models.LinkStats, error) {
	query := `
		SELECT
			url,
			COUNT(*) as total_clicks,
			COUNT(DISTINCT recipient) as unique_clicks
		FROM email_events
		WHERE domain_id = $1
		  AND event_type = 'clicked'
		  AND timestamp >= $2
		  AND timestamp <= $3
		  AND url IS NOT NULL
		GROUP BY url
		ORDER BY total_clicks DESC
		LIMIT $4
	`

	rows, err := r.pool.Query(ctx, query, domainID, startDate, endDate, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []models.LinkStats
	var totalClicks int64
	for rows.Next() {
		var s models.LinkStats
		err := rows.Scan(&s.URL, &s.TotalClicks, &s.UniqueClicks)
		if err != nil {
			return nil, err
		}
		totalClicks += s.TotalClicks
		stats = append(stats, s)
	}

	// Calculate percentages
	for i := range stats {
		if totalClicks > 0 {
			stats[i].Percentage = float64(stats[i].TotalClicks) / float64(totalClicks) * 100
		}
	}

	return stats, nil
}

// IncrementDailyStat increments a specific stat for today
func (r *AnalyticsRepository) IncrementDailyStat(ctx context.Context, domainID uuid.UUID, category string, stat string) error {
	// Use dynamic SQL safely
	validStats := map[string]bool{
		"sent": true, "delivered": true, "bounced": true, "hard_bounced": true,
		"soft_bounced": true, "opened": true, "unique_opened": true,
		"clicked": true, "unique_clicked": true, "spam_reports": true, "unsubscribed": true,
	}

	if !validStats[stat] {
		return nil // Silently ignore invalid stats
	}

	query := `
		INSERT INTO daily_stats (id, domain_id, date, category, ` + stat + `)
		VALUES ($1, $2, CURRENT_DATE, $3, 1)
		ON CONFLICT (domain_id, date, category)
		DO UPDATE SET ` + stat + ` = daily_stats.` + stat + ` + 1, updated_at = NOW()
	`

	_, err := r.pool.Exec(ctx, query, uuid.New(), domainID, category)
	return err
}

// GetRealTimeStats retrieves real-time statistics
func (r *AnalyticsRepository) GetRealTimeStats(ctx context.Context, domainID uuid.UUID) (*models.RealTimeStats, error) {
	query := `
		SELECT
			COUNT(*) FILTER (WHERE event_type = 'delivered' AND timestamp >= NOW() - INTERVAL '5 minutes') as delivered_5m,
			COUNT(*) FILTER (WHERE event_type = 'bounced' AND timestamp >= NOW() - INTERVAL '5 minutes') as bounced_5m
		FROM email_events
		WHERE domain_id = $1 AND timestamp >= NOW() - INTERVAL '5 minutes'
	`

	stats := &models.RealTimeStats{
		Timestamp: time.Now(),
	}

	err := r.pool.QueryRow(ctx, query, domainID).Scan(
		&stats.Last5Minutes.Delivered,
		&stats.Last5Minutes.Bounced,
	)
	if err != nil {
		return nil, err
	}

	// Count sent from messages table
	sentQuery := `
		SELECT COUNT(*)
		FROM messages
		WHERE domain_id = $1 AND queued_at >= NOW() - INTERVAL '5 minutes'
	`
	err = r.pool.QueryRow(ctx, sentQuery, domainID).Scan(&stats.Last5Minutes.Sent)
	if err != nil {
		return nil, err
	}

	// Calculate rates (per second average over 5 minutes)
	stats.EmailsPerSecond = float64(stats.Last5Minutes.Sent) / 300.0
	stats.DeliveriesPerSec = float64(stats.Last5Minutes.Delivered) / 300.0

	return stats, nil
}

// GetComparisonStats retrieves stats comparing two periods
func (r *AnalyticsRepository) GetComparisonStats(ctx context.Context, domainID uuid.UUID, currentStart, currentEnd, previousStart, previousEnd time.Time) (*models.ComparisonStats, error) {
	current, err := r.GetOverviewStats(ctx, domainID, currentStart, currentEnd)
	if err != nil {
		return nil, err
	}

	previous, err := r.GetOverviewStats(ctx, domainID, previousStart, previousEnd)
	if err != nil {
		return nil, err
	}

	comparison := &models.ComparisonStats{
		CurrentPeriod:  *current,
		PreviousPeriod: *previous,
	}

	// Calculate changes
	if previous.TotalSent > 0 {
		comparison.Changes.SentChange = float64(current.TotalSent-previous.TotalSent) / float64(previous.TotalSent) * 100
		comparison.Changes.DeliveredChange = float64(current.TotalDelivered-previous.TotalDelivered) / float64(previous.TotalDelivered) * 100
	}

	comparison.Changes.OpenRateChange = current.OpenRate - previous.OpenRate
	comparison.Changes.ClickRateChange = current.ClickRate - previous.ClickRate
	comparison.Changes.BounceRateChange = current.BounceRate - previous.BounceRate

	return comparison, nil
}
