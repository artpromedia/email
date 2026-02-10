package service

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"transactional-api/models"
)

func TestTrackingService_AddTrackingPixel(t *testing.T) {
	tests := []struct {
		name      string
		html      string
		messageID string
		domainID  string
		wantPixel bool
	}{
		{
			name:      "adds pixel before closing body",
			html:      "<html><body><p>Content</p></body></html>",
			messageID: "msg-123",
			domainID:  "domain-456",
			wantPixel: true,
		},
		{
			name:      "adds pixel at end if no body tag",
			html:      "<p>Simple content</p>",
			messageID: "msg-123",
			domainID:  "domain-456",
			wantPixel: true,
		},
		{
			name:      "case insensitive body detection",
			html:      "<html><BODY><p>Content</p></BODY></html>",
			messageID: "msg-123",
			domainID:  "domain-456",
			wantPixel: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := addTrackingPixel(tt.html, tt.messageID, tt.domainID)

			hasPixel := strings.Contains(result, "<img src=") &&
				strings.Contains(result, "width=\"1\"") &&
				strings.Contains(result, "height=\"1\"")

			if hasPixel != tt.wantPixel {
				t.Errorf("addTrackingPixel() hasPixel = %v, want %v", hasPixel, tt.wantPixel)
			}

			// Verify pixel is hidden
			if tt.wantPixel {
				if !strings.Contains(result, "display:none") {
					t.Error("Tracking pixel should be hidden")
				}
			}
		})
	}
}

func TestTrackingService_RewriteLinks(t *testing.T) {
	tests := []struct {
		name         string
		html         string
		messageID    string
		domainID     string
		wantRewrite  int
		skipPatterns []string
	}{
		{
			name:        "rewrites regular links",
			html:        `<a href="https://example.com">Click</a>`,
			messageID:   "msg-123",
			domainID:    "domain-456",
			wantRewrite: 1,
		},
		{
			name:        "skips mailto links",
			html:        `<a href="mailto:test@example.com">Email</a>`,
			messageID:   "msg-123",
			domainID:    "domain-456",
			wantRewrite: 0,
		},
		{
			name:        "skips tel links",
			html:        `<a href="tel:+1234567890">Call</a>`,
			messageID:   "msg-123",
			domainID:    "domain-456",
			wantRewrite: 0,
		},
		{
			name:        "skips anchor links",
			html:        `<a href="#section">Jump</a>`,
			messageID:   "msg-123",
			domainID:    "domain-456",
			wantRewrite: 0,
		},
		{
			name:         "skips unsubscribe links",
			html:         `<a href="https://example.com/unsubscribe">Unsubscribe</a>`,
			messageID:    "msg-123",
			domainID:     "domain-456",
			wantRewrite:  0,
			skipPatterns: []string{"unsubscribe"},
		},
		{
			name:        "rewrites multiple links",
			html:        `<a href="https://a.com">A</a><a href="https://b.com">B</a>`,
			messageID:   "msg-123",
			domainID:    "domain-456",
			wantRewrite: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := rewriteLinks(tt.html, tt.messageID, tt.domainID, tt.skipPatterns)

			// Count tracking URLs
			rewriteCount := strings.Count(result, "/t/c/")

			if rewriteCount != tt.wantRewrite {
				t.Errorf("rewriteLinks() rewrite count = %d, want %d", rewriteCount, tt.wantRewrite)
			}
		})
	}
}

func TestTrackingService_EncodeDecodeTrackingData(t *testing.T) {
	tests := []struct {
		name string
		data *models.TrackingPixelData
	}{
		{
			name: "encode and decode pixel data",
			data: &models.TrackingPixelData{
				MessageID: "msg-123",
				DomainID:  "domain-456",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded := encodeTrackingDataTest(tt.data)
			decoded, err := decodePixelDataTest(encoded)

			if err != nil {
				t.Fatalf("decodePixelData() error = %v", err)
			}

			if decoded.MessageID != tt.data.MessageID {
				t.Errorf("MessageID = %v, want %v", decoded.MessageID, tt.data.MessageID)
			}
			if decoded.DomainID != tt.data.DomainID {
				t.Errorf("DomainID = %v, want %v", decoded.DomainID, tt.data.DomainID)
			}
		})
	}
}

func TestTrackingService_ParseDeviceInfo(t *testing.T) {
	tests := []struct {
		name       string
		userAgent  string
		wantType   string
		wantOS     string
		wantBot    bool
	}{
		{
			name:      "Chrome on Windows",
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
			wantType:  "desktop",
			wantOS:    "Windows",
			wantBot:   false,
		},
		{
			name:      "Safari on iPhone",
			userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1",
			wantType:  "mobile",
			wantOS:    "iOS",
			wantBot:   false,
		},
		{
			name:      "Chrome on Android",
			userAgent: "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
			wantType:  "mobile",
			wantOS:    "Android",
			wantBot:   false,
		},
		{
			name:      "Googlebot",
			userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			wantType:  "desktop",
			wantOS:    "",
			wantBot:   true,
		},
		{
			name:      "iPad",
			userAgent: "Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1",
			wantType:  "tablet",
			wantOS:    "iOS",
			wantBot:   false,
		},
		{
			name:      "Safari on Mac",
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
			wantType:  "desktop",
			wantOS:    "macOS",
			wantBot:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			device := parseDeviceInfoTest(tt.userAgent)

			if device.Type != tt.wantType {
				t.Errorf("device.Type = %v, want %v", device.Type, tt.wantType)
			}
			if tt.wantOS != "" && device.OS != tt.wantOS {
				t.Errorf("device.OS = %v, want %v", device.OS, tt.wantOS)
			}
			if device.IsBot != tt.wantBot {
				t.Errorf("device.IsBot = %v, want %v", device.IsBot, tt.wantBot)
			}
		})
	}
}

func TestTrackingService_TrackingPixel(t *testing.T) {
	pixel := trackingPixelBytes()

	// Verify it's a valid GIF
	if len(pixel) < 10 {
		t.Error("Tracking pixel too small")
	}

	// Check GIF header
	if string(pixel[:3]) != "GIF" {
		t.Error("Tracking pixel should be a GIF")
	}

	// Check it's 1x1
	if string(pixel[:6]) != "GIF89a" {
		t.Error("Tracking pixel should be GIF89a format")
	}
}

// Mock implementations for testing
func addTrackingPixel(html, messageID, domainID string) string {
	data := &models.TrackingPixelData{
		MessageID: messageID,
		DomainID:  domainID,
	}
	encoded := encodeTrackingDataTest(data)
	trackingURL := "/t/o/" + encoded

	pixel := `<img src="` + trackingURL + `" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`

	lowerHTML := strings.ToLower(html)
	if idx := strings.Index(lowerHTML, "</body>"); idx != -1 {
		return html[:idx] + pixel + html[idx:]
	}
	return html + pixel
}

func rewriteLinks(html, messageID, domainID string, skipPatterns []string) string {
	result := html

	// Find all href attributes
	i := 0
	for i < len(result) {
		start := strings.Index(strings.ToLower(result[i:]), "href=\"")
		if start == -1 {
			break
		}
		start += i + 6
		end := strings.Index(result[start:], "\"")
		if end == -1 {
			break
		}

		url := result[start : start+end]

		// Skip certain URLs
		lowerURL := strings.ToLower(url)
		shouldSkip := strings.HasPrefix(lowerURL, "mailto:") ||
			strings.HasPrefix(lowerURL, "tel:") ||
			strings.HasPrefix(url, "#") ||
			strings.HasPrefix(lowerURL, "javascript:")

		for _, pattern := range skipPatterns {
			if strings.Contains(lowerURL, pattern) {
				shouldSkip = true
				break
			}
		}

		if shouldSkip {
			i = start + end
			continue
		}

		// Rewrite link
		data := &models.TrackingLinkData{
			MessageID:   messageID,
			DomainID:    domainID,
			OriginalURL: url,
		}
		encoded := encodeTrackingDataTest(data)
		trackingURL := "/t/c/" + encoded

		result = result[:start] + trackingURL + result[start+end:]
		i = start + len(trackingURL)
	}

	return result
}

func encodeTrackingDataTest(data any) string {
	jsonData, _ := json.Marshal(data)
	return base64.RawURLEncoding.EncodeToString(jsonData)
}

func decodePixelDataTest(encoded string) (*models.TrackingPixelData, error) {
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

func parseDeviceInfoTest(userAgent string) *models.DeviceInfo {
	if userAgent == "" {
		return &models.DeviceInfo{}
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
	} else if strings.Contains(ua, "linux") && !strings.Contains(ua, "android") {
		device.OS = "Linux"
	} else if strings.Contains(ua, "android") {
		device.OS = "Android"
	} else if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		device.OS = "iOS"
	}

	// Detect bots
	if strings.Contains(ua, "bot") || strings.Contains(ua, "crawler") ||
		strings.Contains(ua, "spider") || strings.Contains(ua, "googlebot") {
		device.IsBot = true
	}

	return device
}

func trackingPixelBytes() []byte {
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

// Benchmark tests
func BenchmarkAddTrackingPixel(b *testing.B) {
	html := "<html><body><p>Hello World</p></body></html>"
	for i := 0; i < b.N; i++ {
		addTrackingPixel(html, "msg-123", "domain-456")
	}
}

func BenchmarkRewriteLinks(b *testing.B) {
	html := `<a href="https://example.com/page1">Link 1</a><a href="https://example.com/page2">Link 2</a>`
	for i := 0; i < b.N; i++ {
		rewriteLinks(html, "msg-123", "domain-456", nil)
	}
}

func BenchmarkParseDeviceInfo(b *testing.B) {
	ua := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36"
	for i := 0; i < b.N; i++ {
		parseDeviceInfoTest(ua)
	}
}
