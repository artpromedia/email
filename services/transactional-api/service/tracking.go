package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"transactional-api/config"
	"transactional-api/models"
	"transactional-api/repository"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// TrackingService handles open and click tracking
type TrackingService struct {
	config         *config.Config
	eventRepo      *repository.EventRepository
	messageRepo    *repository.MessageRepository
	analyticsRepo  *repository.AnalyticsRepository
	webhookService *WebhookService
	logger         zerolog.Logger
}

// NewTrackingService creates a new TrackingService
func NewTrackingService(
	cfg *config.Config,
	eventRepo *repository.EventRepository,
	messageRepo *repository.MessageRepository,
	analyticsRepo *repository.AnalyticsRepository,
	webhookService *WebhookService,
	logger zerolog.Logger,
) *TrackingService {
	return &TrackingService{
		config:         cfg,
		eventRepo:      eventRepo,
		messageRepo:    messageRepo,
		analyticsRepo:  analyticsRepo,
		webhookService: webhookService,
		logger:         logger,
	}
}

// AddTrackingPixel adds an invisible tracking pixel to HTML content
func (s *TrackingService) AddTrackingPixel(html, messageID, domainID string) string {
	if !s.config.Tracking.EnableOpen {
		return html
	}

	// Encode tracking data
	data := &models.TrackingPixelData{
		MessageID: messageID,
		DomainID:  domainID,
	}
	encoded := encodeTrackingData(data)

	// Build tracking URL
	trackingURL := fmt.Sprintf("%s%s/%s",
		s.config.Tracking.TrackingHost,
		s.config.Tracking.PixelPath,
		encoded,
	)

	// Add tracking pixel before closing body tag
	pixel := fmt.Sprintf(`<img src="%s" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`, trackingURL)

	// Try to insert before </body>
	if strings.Contains(strings.ToLower(html), "</body>") {
		re := regexp.MustCompile(`(?i)(</body>)`)
		return re.ReplaceAllString(html, pixel+"$1")
	}

	// Otherwise append at the end
	return html + pixel
}

// RewriteLinks rewrites links for click tracking
func (s *TrackingService) RewriteLinks(html, messageID, domainID string) string {
	if !s.config.Tracking.EnableClick {
		return html
	}

	// Find all href attributes
	re := regexp.MustCompile(`(?i)href=["']([^"']+)["']`)

	linkIndex := 0
	return re.ReplaceAllStringFunc(html, func(match string) string {
		// Extract URL
		urlMatch := re.FindStringSubmatch(match)
		if len(urlMatch) < 2 {
			return match
		}

		originalURL := urlMatch[1]

		// Skip mailto, tel, and anchor links
		if strings.HasPrefix(strings.ToLower(originalURL), "mailto:") ||
			strings.HasPrefix(strings.ToLower(originalURL), "tel:") ||
			strings.HasPrefix(originalURL, "#") ||
			strings.HasPrefix(originalURL, "javascript:") {
			return match
		}

		// Skip unsubscribe links
		if strings.Contains(strings.ToLower(originalURL), "unsubscribe") {
			return match
		}

		// Encode tracking data
		data := &models.TrackingLinkData{
			MessageID:   messageID,
			DomainID:    domainID,
			OriginalURL: originalURL,
			LinkIndex:   linkIndex,
		}
		encoded := encodeTrackingData(data)
		linkIndex++

		// Build tracking URL
		trackingURL := fmt.Sprintf("%s%s/%s",
			s.config.Tracking.TrackingHost,
			s.config.Tracking.ClickPath,
			encoded,
		)

		return fmt.Sprintf(`href="%s"`, trackingURL)
	})
}

// RecordOpen records an email open event
func (s *TrackingService) RecordOpen(ctx context.Context, data *models.TrackingPixelData, userAgent, ipAddress string) error {
	messageID, err := uuid.Parse(data.MessageID)
	if err != nil {
		return fmt.Errorf("invalid message ID: %w", err)
	}

	domainID, err := uuid.Parse(data.DomainID)
	if err != nil {
		return fmt.Errorf("invalid domain ID: %w", err)
	}

	// Get message to get recipient and categories
	msg, err := s.messageRepo.GetByID(ctx, messageID)
	if err != nil {
		return fmt.Errorf("failed to get message: %w", err)
	}

	// Parse device info
	device := parseDeviceInfo(userAgent)

	// Create event
	event := &models.EmailEvent{
		ID:         uuid.New(),
		MessageID:  messageID,
		DomainID:   domainID,
		EventType:  models.EventTypeOpened,
		Recipient:  msg.To[0], // First recipient
		Timestamp:  time.Now(),
		UserAgent:  userAgent,
		IPAddress:  ipAddress,
		Device:     device,
		Categories: msg.Categories,
		CustomArgs: msg.CustomArgs,
		CreatedAt:  time.Now(),
	}

	if err := s.eventRepo.Create(ctx, event); err != nil {
		return fmt.Errorf("failed to create event: %w", err)
	}

	// Update message
	s.messageRepo.MarkOpened(ctx, messageID)

	// Update analytics
	category := ""
	if len(msg.Categories) > 0 {
		category = msg.Categories[0]
	}
	s.analyticsRepo.IncrementDailyStat(ctx, domainID, category, "opened")
	s.analyticsRepo.IncrementDailyStat(ctx, domainID, category, "unique_opened")

	// Trigger webhooks
	go s.webhookService.DispatchEvent(context.Background(), event.DomainID, event)

	s.logger.Debug().
		Str("message_id", messageID.String()).
		Str("user_agent", userAgent).
		Msg("Open tracked")

	return nil
}

// RecordClick records a link click event
func (s *TrackingService) RecordClick(ctx context.Context, data *models.TrackingLinkData, userAgent, ipAddress string) (string, error) {
	messageID, err := uuid.Parse(data.MessageID)
	if err != nil {
		return data.OriginalURL, fmt.Errorf("invalid message ID: %w", err)
	}

	domainID, err := uuid.Parse(data.DomainID)
	if err != nil {
		return data.OriginalURL, fmt.Errorf("invalid domain ID: %w", err)
	}

	// Get message to get recipient and categories
	msg, err := s.messageRepo.GetByID(ctx, messageID)
	if err != nil {
		return data.OriginalURL, fmt.Errorf("failed to get message: %w", err)
	}

	// Parse device info
	device := parseDeviceInfo(userAgent)

	// Create event
	event := &models.EmailEvent{
		ID:         uuid.New(),
		MessageID:  messageID,
		DomainID:   domainID,
		EventType:  models.EventTypeClicked,
		Recipient:  msg.To[0], // First recipient
		Timestamp:  time.Now(),
		UserAgent:  userAgent,
		IPAddress:  ipAddress,
		URL:        data.OriginalURL,
		Device:     device,
		Categories: msg.Categories,
		CustomArgs: msg.CustomArgs,
		CreatedAt:  time.Now(),
	}

	if err := s.eventRepo.Create(ctx, event); err != nil {
		return data.OriginalURL, fmt.Errorf("failed to create event: %w", err)
	}

	// Update message
	s.messageRepo.MarkClicked(ctx, messageID)

	// Update analytics
	category := ""
	if len(msg.Categories) > 0 {
		category = msg.Categories[0]
	}
	s.analyticsRepo.IncrementDailyStat(ctx, domainID, category, "clicked")
	s.analyticsRepo.IncrementDailyStat(ctx, domainID, category, "unique_clicked")

	// Trigger webhooks
	go s.webhookService.DispatchEvent(context.Background(), event.DomainID, event)

	s.logger.Debug().
		Str("message_id", messageID.String()).
		Str("url", data.OriginalURL).
		Msg("Click tracked")

	return data.OriginalURL, nil
}

// DecodePixelData decodes tracking pixel data from URL
func DecodePixelData(encoded string) (*models.TrackingPixelData, error) {
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}

	var pixelData models.TrackingPixelData
	if err := json.Unmarshal(data, &pixelData); err != nil {
		return nil, err
	}

	return &pixelData, nil
}

// DecodeLinkData decodes tracking link data from URL
func DecodeLinkData(encoded string) (*models.TrackingLinkData, error) {
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}

	var linkData models.TrackingLinkData
	if err := json.Unmarshal(data, &linkData); err != nil {
		return nil, err
	}

	return &linkData, nil
}

// encodeTrackingData encodes tracking data for URL
func encodeTrackingData(data any) string {
	jsonData, _ := json.Marshal(data)
	return base64.RawURLEncoding.EncodeToString(jsonData)
}

// parseDeviceInfo parses user agent to extract device info
func parseDeviceInfo(userAgent string) *models.DeviceInfo {
	if userAgent == "" {
		return nil
	}

	ua := strings.ToLower(userAgent)
	device := &models.DeviceInfo{}

	// Detect device type
	if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") || strings.Contains(ua, "iphone") {
		device.Type = "mobile"
	} else if strings.Contains(ua, "tablet") || strings.Contains(ua, "ipad") {
		device.Type = "tablet"
	} else {
		device.Type = "desktop"
	}

	// Detect OS
	if strings.Contains(ua, "windows") {
		device.OS = "Windows"
	} else if strings.Contains(ua, "macintosh") || strings.Contains(ua, "mac os") {
		device.OS = "macOS"
	} else if strings.Contains(ua, "linux") {
		device.OS = "Linux"
	} else if strings.Contains(ua, "android") {
		device.OS = "Android"
	} else if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		device.OS = "iOS"
	}

	// Detect browser
	if strings.Contains(ua, "chrome") && !strings.Contains(ua, "edg") {
		device.Browser = "Chrome"
	} else if strings.Contains(ua, "firefox") {
		device.Browser = "Firefox"
	} else if strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome") {
		device.Browser = "Safari"
	} else if strings.Contains(ua, "edg") {
		device.Browser = "Edge"
	} else if strings.Contains(ua, "msie") || strings.Contains(ua, "trident") {
		device.Browser = "Internet Explorer"
	}

	// Detect bots
	if strings.Contains(ua, "bot") || strings.Contains(ua, "crawler") ||
		strings.Contains(ua, "spider") || strings.Contains(ua, "googlebot") {
		device.IsBot = true
	}

	return device
}

// TrackingPixel returns the 1x1 transparent GIF pixel
func TrackingPixel() []byte {
	// 1x1 transparent GIF
	return []byte{
		0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
		0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
		0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
		0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
		0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
		0x01, 0x00, 0x3b,
	}
}

// BuildUnsubscribeURL builds an unsubscribe URL for a message
func (s *TrackingService) BuildUnsubscribeURL(messageID, domainID, recipient string) string {
	data := url.Values{}
	data.Set("m", messageID)
	data.Set("d", domainID)
	data.Set("e", recipient)

	return fmt.Sprintf("%s/unsubscribe?%s",
		s.config.Tracking.TrackingURL,
		data.Encode(),
	)
}
