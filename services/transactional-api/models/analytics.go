package models

import (
	"time"

	"github.com/google/uuid"
)

// AnalyticsPeriod defines the time period for analytics
type AnalyticsPeriod string

const (
	AnalyticsPeriodHour  AnalyticsPeriod = "hour"
	AnalyticsPeriodDay   AnalyticsPeriod = "day"
	AnalyticsPeriodWeek  AnalyticsPeriod = "week"
	AnalyticsPeriodMonth AnalyticsPeriod = "month"
)

// AnalyticsRequest represents a request for analytics data
type AnalyticsRequest struct {
	DomainID   uuid.UUID        `json:"domain_id"`
	StartDate  time.Time        `json:"start_date" validate:"required"`
	EndDate    time.Time        `json:"end_date" validate:"required,gtfield=StartDate"`
	Period     AnalyticsPeriod  `json:"period" validate:"required,oneof=hour day week month"`
	Categories []string         `json:"categories,omitempty"`
	APIKeyID   *uuid.UUID       `json:"api_key_id,omitempty"`
}

// OverviewStats represents high-level email statistics
type OverviewStats struct {
	Period    string    `json:"period"`
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`

	// Totals
	TotalSent       int64   `json:"total_sent"`
	TotalDelivered  int64   `json:"total_delivered"`
	TotalBounced    int64   `json:"total_bounced"`
	TotalOpened     int64   `json:"total_opened"`
	TotalClicked    int64   `json:"total_clicked"`
	TotalSpam       int64   `json:"total_spam"`
	TotalUnsubscribed int64 `json:"total_unsubscribed"`

	// Rates (percentages)
	DeliveryRate    float64 `json:"delivery_rate"`
	BounceRate      float64 `json:"bounce_rate"`
	OpenRate        float64 `json:"open_rate"`
	ClickRate       float64 `json:"click_rate"`
	SpamRate        float64 `json:"spam_rate"`
	UnsubscribeRate float64 `json:"unsubscribe_rate"`

	// Unique counts
	UniqueOpens  int64 `json:"unique_opens"`
	UniqueClicks int64 `json:"unique_clicks"`

	// Click to open rate (unique clicks / unique opens)
	ClickToOpenRate float64 `json:"click_to_open_rate"`
}

// TimeSeriesDataPoint represents a single data point in a time series
type TimeSeriesDataPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     int64     `json:"value"`
}

// TimeSeriesStats represents time series statistics
type TimeSeriesStats struct {
	Period    AnalyticsPeriod       `json:"period"`
	StartDate time.Time             `json:"start_date"`
	EndDate   time.Time             `json:"end_date"`
	Sent      []TimeSeriesDataPoint `json:"sent"`
	Delivered []TimeSeriesDataPoint `json:"delivered"`
	Bounced   []TimeSeriesDataPoint `json:"bounced"`
	Opened    []TimeSeriesDataPoint `json:"opened"`
	Clicked   []TimeSeriesDataPoint `json:"clicked"`
}

// BounceStats represents bounce statistics
type BounceStats struct {
	Total          int64               `json:"total"`
	HardBounces    int64               `json:"hard_bounces"`
	SoftBounces    int64               `json:"soft_bounces"`
	BlockBounces   int64               `json:"block_bounces"`
	BounceRate     float64             `json:"bounce_rate"`
	ByReason       []BounceReasonStats `json:"by_reason,omitempty"`
	ByDomain       []DomainStats       `json:"by_domain,omitempty"`
}

// BounceReasonStats represents bounce statistics by reason
type BounceReasonStats struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
}

// DomainStats represents statistics for a specific domain
type DomainStats struct {
	Domain    string  `json:"domain"`
	Sent      int64   `json:"sent"`
	Delivered int64   `json:"delivered"`
	Bounced   int64   `json:"bounced"`
	Opened    int64   `json:"opened"`
	Clicked   int64   `json:"clicked"`
	Rate      float64 `json:"rate,omitempty"`
}

// CategoryStats represents statistics for a specific category
type CategoryStats struct {
	Category        string  `json:"category"`
	Sent            int64   `json:"sent"`
	Delivered       int64   `json:"delivered"`
	Bounced         int64   `json:"bounced"`
	Opened          int64   `json:"opened"`
	Clicked         int64   `json:"clicked"`
	UniqueOpens     int64   `json:"unique_opens"`
	UniqueClicks    int64   `json:"unique_clicks"`
	DeliveryRate    float64 `json:"delivery_rate"`
	OpenRate        float64 `json:"open_rate"`
	ClickRate       float64 `json:"click_rate"`
}

// GeoStats represents geographic statistics
type GeoStats struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	Opens       int64   `json:"opens"`
	Clicks      int64   `json:"clicks"`
	Percentage  float64 `json:"percentage"`
}

// DeviceStats represents device statistics
type DeviceStats struct {
	Type       string  `json:"type"` // desktop, mobile, tablet
	Opens      int64   `json:"opens"`
	Clicks     int64   `json:"clicks"`
	Percentage float64 `json:"percentage"`
}

// MailClientStats represents email client statistics
type MailClientStats struct {
	Client     string  `json:"client"`
	Opens      int64   `json:"opens"`
	Percentage float64 `json:"percentage"`
}

// LinkStats represents click statistics for a specific link
type LinkStats struct {
	URL           string  `json:"url"`
	Clicks        int64   `json:"clicks"`
	TotalClicks   int64   `json:"total_clicks"`
	UniqueClicks  int64   `json:"unique_clicks"`
	Percentage    float64 `json:"percentage"`
}

// EngagementStats represents overall engagement statistics
type EngagementStats struct {
	Period           string           `json:"period"`
	OverallScore     float64          `json:"overall_score"` // 0-100
	OpenRate         float64          `json:"open_rate"`
	ClickRate        float64          `json:"click_rate"`
	Opens            []TimeSeriesData `json:"opens,omitempty"`
	Clicks           []TimeSeriesData `json:"clicks,omitempty"`
	UniqueOpens      int64            `json:"unique_opens"`
	UniqueClicks     int64            `json:"unique_clicks"`
	TopCategories    []CategoryStats  `json:"top_categories"`
	TopDomains       []DomainStats    `json:"top_domains"`
	TopLinks         []LinkStats      `json:"top_links"`
	GeoDistribution  []GeoStats       `json:"geo_distribution"`
	DeviceBreakdown  []DeviceStats    `json:"device_breakdown"`
	MailClients      []MailClientStats `json:"mail_clients"`
}

// ReputationStats represents sender reputation statistics
type ReputationStats struct {
	Score           float64   `json:"score"` // 0-100
	TrendDirection  string    `json:"trend_direction"` // up, down, stable
	BounceRate      float64   `json:"bounce_rate"`
	SpamRate        float64   `json:"spam_rate"`
	UnsubscribeRate float64   `json:"unsubscribe_rate"`
	Recommendations []string  `json:"recommendations,omitempty"`
	LastUpdated     time.Time `json:"last_updated"`
}

// ExportAnalyticsRequest is the request to export analytics data
type ExportAnalyticsRequest struct {
	DomainID   uuid.UUID       `json:"domain_id"`
	StartDate  time.Time       `json:"start_date" validate:"required"`
	EndDate    time.Time       `json:"end_date" validate:"required"`
	ReportType string          `json:"report_type" validate:"required,oneof=overview timeseries bounces categories engagement"`
	Format     string          `json:"format" validate:"required,oneof=csv json pdf"`
	Categories []string        `json:"categories,omitempty"`
}

// ExportAnalyticsResponse is the response from exporting analytics
type ExportAnalyticsResponse struct {
	ExportID    uuid.UUID `json:"export_id"`
	Status      string    `json:"status"` // pending, processing, completed, failed
	DownloadURL string    `json:"download_url,omitempty"`
	ExpiresAt   time.Time `json:"expires_at,omitempty"`
}

// RealTimeStats represents real-time statistics
type RealTimeStats struct {
	Timestamp        time.Time `json:"timestamp"`
	EmailsPerSecond  float64   `json:"emails_per_second"`
	DeliveriesPerSec float64   `json:"deliveries_per_second"`
	QueueSize        int64     `json:"queue_size"`
	ActiveWorkers    int       `json:"active_workers"`
	Last5Minutes     struct {
		Sent      int64 `json:"sent"`
		Delivered int64 `json:"delivered"`
		Bounced   int64 `json:"bounced"`
	} `json:"last_5_minutes"`
}

// ComparisonStats represents comparison between two periods
type ComparisonStats struct {
	CurrentPeriod  OverviewStats `json:"current_period"`
	PreviousPeriod OverviewStats `json:"previous_period"`
	Changes        struct {
		SentChange         float64 `json:"sent_change"`
		DeliveredChange    float64 `json:"delivered_change"`
		OpenRateChange     float64 `json:"open_rate_change"`
		ClickRateChange    float64 `json:"click_rate_change"`
		BounceRateChange   float64 `json:"bounce_rate_change"`
	} `json:"changes"`
}

// AnalyticsOverview represents high-level analytics summary
type AnalyticsOverview struct {
	Period         string  `json:"period"`
	TotalSent      int64   `json:"total_sent"`
	TotalDelivered int64   `json:"total_delivered"`
	TotalBounced   int64   `json:"total_bounced"`
	TotalOpened    int64   `json:"total_opened"`
	TotalClicked   int64   `json:"total_clicked"`
	DeliveryRate   float64 `json:"delivery_rate"`
	OpenRate       float64 `json:"open_rate"`
	ClickRate      float64 `json:"click_rate"`
	BounceRate     float64 `json:"bounce_rate"`
}

// TimeSeriesData represents a time-stamped value
type TimeSeriesData struct {
	Timestamp time.Time `json:"timestamp"`
	Value     int64     `json:"value"`
}

// BounceReason represents a bounce reason with count
type BounceReason struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
}

// DeliveryStats represents delivery time-series statistics
type DeliveryStats struct {
	Period    string           `json:"period"`
	Delivered []TimeSeriesData `json:"delivered"`
	Bounced   []TimeSeriesData `json:"bounced"`
	Deferred  []TimeSeriesData `json:"deferred"`
	Dropped   []TimeSeriesData `json:"dropped"`
}
