package models

// TrackingPixelData represents data encoded in a tracking pixel URL
type TrackingPixelData struct {
	MessageID string `json:"m"`
	DomainID  string `json:"d"`
}

// TrackingLinkData represents data encoded in a tracking link URL
type TrackingLinkData struct {
	MessageID   string `json:"m"`
	DomainID    string `json:"d"`
	OriginalURL string `json:"u"`
	LinkIndex   int    `json:"i"`
}

// DeviceInfo represents parsed device information from user agent
type DeviceInfo struct {
	Type     string `json:"type"`    // desktop, mobile, tablet
	OS       string `json:"os"`      // Windows, macOS, Linux, Android, iOS
	Browser  string `json:"browser"` // Chrome, Firefox, Safari, Edge
	IsBot    bool   `json:"is_bot"`
}

// GeoInfo represents geographic information from IP lookup
type GeoInfo struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	Region      string  `json:"region"`
	City        string  `json:"city"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Timezone    string  `json:"timezone"`
}

// MessageTimeline represents the event timeline for a message
type MessageTimeline struct {
	MessageID interface{} `json:"message_id"`
	Status    interface{} `json:"status"`
	Events    []EventTimelineEntry `json:"events"`
}

// EventTimelineEntry represents a single event in the timeline
type EventTimelineEntry struct {
	EventType string      `json:"event_type"`
	Timestamp interface{} `json:"timestamp"`
	Details   string      `json:"details,omitempty"`
}
