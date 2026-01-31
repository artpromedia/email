package twilio

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"go.uber.org/zap"

	"sms-gateway/internal/providers"
)

const (
	twilioAPIURL       = "https://api.twilio.com/2010-04-01"
	maxMessageLength   = 1600
	maxSegmentLength   = 160
	maxUnicodeSegment  = 70
)

// Provider implements the SMS provider interface for Twilio
type Provider struct {
	accountSID          string
	authToken           string
	fromNumber          string
	messagingServiceSID string
	client              *http.Client
	logger              *zap.Logger
}

// TwilioMessage represents a Twilio message response
type TwilioMessage struct {
	SID         string  `json:"sid"`
	AccountSID  string  `json:"account_sid"`
	To          string  `json:"to"`
	From        string  `json:"from"`
	Body        string  `json:"body"`
	Status      string  `json:"status"`
	NumSegments string  `json:"num_segments"`
	Price       string  `json:"price"`
	PriceUnit   string  `json:"price_unit"`
	ErrorCode   *string `json:"error_code"`
	ErrorMessage *string `json:"error_message"`
	DateCreated string  `json:"date_created"`
	DateSent    string  `json:"date_sent"`
	DateUpdated string  `json:"date_updated"`
}

// TwilioBalance represents account balance
type TwilioBalance struct {
	Balance     string `json:"balance"`
	Currency    string `json:"currency"`
}

// TwilioError represents an API error
type TwilioError struct {
	Code     int    `json:"code"`
	Message  string `json:"message"`
	MoreInfo string `json:"more_info"`
	Status   int    `json:"status"`
}

// New creates a new Twilio provider
func New(accountSID, authToken, fromNumber, messagingServiceSID string, logger *zap.Logger) *Provider {
	return &Provider{
		accountSID:          accountSID,
		authToken:           authToken,
		fromNumber:          fromNumber,
		messagingServiceSID: messagingServiceSID,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// Name returns the provider name
func (p *Provider) Name() string {
	return "twilio"
}

// Send sends an SMS message via Twilio
func (p *Provider) Send(ctx context.Context, req *providers.SendRequest) (*providers.SendResponse, error) {
	// Validate phone number
	to, err := p.ValidatePhoneNumber(req.To)
	if err != nil {
		return nil, err
	}

	// Check message length
	if len(req.Message) > maxMessageLength {
		return nil, providers.ErrMessageTooLong
	}

	// Build request
	data := url.Values{}
	data.Set("To", to)
	data.Set("Body", req.Message)

	// Use messaging service if available, otherwise use from number
	if p.messagingServiceSID != "" {
		data.Set("MessagingServiceSid", p.messagingServiceSID)
	} else {
		from := req.From
		if from == "" {
			from = p.fromNumber
		}
		data.Set("From", from)
	}

	// Add callback URL if provided
	if req.CallbackURL != "" {
		data.Set("StatusCallback", req.CallbackURL)
	}

	// Schedule message if requested
	if req.ScheduledAt != nil && p.messagingServiceSID != "" {
		data.Set("ScheduleType", "fixed")
		data.Set("SendAt", req.ScheduledAt.UTC().Format(time.RFC3339))
	}

	// Make API request
	apiURL := fmt.Sprintf("%s/Accounts/%s/Messages.json", twilioAPIURL, p.accountSID)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.SetBasicAuth(p.accountSID, p.authToken)
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check for errors
	if resp.StatusCode >= 400 {
		var twilioErr TwilioError
		if err := json.Unmarshal(body, &twilioErr); err == nil {
			return nil, fmt.Errorf("twilio error %d: %s", twilioErr.Code, twilioErr.Message)
		}
		return nil, fmt.Errorf("twilio request failed with status %d", resp.StatusCode)
	}

	// Parse response
	var msg TwilioMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Calculate segments
	segments := 1
	if msg.NumSegments != "" {
		fmt.Sscanf(msg.NumSegments, "%d", &segments)
	}

	return &providers.SendResponse{
		MessageID:     msg.SID,
		ProviderID:    msg.SID,
		Provider:      p.Name(),
		Status:        mapTwilioStatus(msg.Status),
		StatusMessage: msg.Status,
		SegmentCount:  segments,
		SentAt:        time.Now(),
	}, nil
}

// SendBulk sends multiple SMS messages
func (p *Provider) SendBulk(ctx context.Context, requests []*providers.SendRequest) ([]*providers.SendResponse, error) {
	responses := make([]*providers.SendResponse, len(requests))

	for i, req := range requests {
		resp, err := p.Send(ctx, req)
		if err != nil {
			responses[i] = &providers.SendResponse{
				Provider:      p.Name(),
				Status:        providers.DeliveryStatusFailed,
				StatusMessage: err.Error(),
				SentAt:        time.Now(),
			}
		} else {
			responses[i] = resp
		}
	}

	return responses, nil
}

// GetStatus retrieves the delivery status of a message
func (p *Provider) GetStatus(ctx context.Context, messageID string) (*providers.DeliveryReport, error) {
	apiURL := fmt.Sprintf("%s/Accounts/%s/Messages/%s.json", twilioAPIURL, p.accountSID, messageID)

	httpReq, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.SetBasicAuth(p.accountSID, p.authToken)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("twilio request failed with status %d", resp.StatusCode)
	}

	var msg TwilioMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	report := &providers.DeliveryReport{
		MessageID:     messageID,
		ProviderID:    msg.SID,
		Provider:      p.Name(),
		Status:        mapTwilioStatus(msg.Status),
		StatusMessage: msg.Status,
	}

	if msg.ErrorCode != nil {
		report.ErrorCode = *msg.ErrorCode
	}
	if msg.ErrorMessage != nil {
		report.ErrorMessage = *msg.ErrorMessage
	}

	return report, nil
}

// GetBalance retrieves the account balance
func (p *Provider) GetBalance(ctx context.Context) (*providers.BalanceInfo, error) {
	apiURL := fmt.Sprintf("%s/Accounts/%s/Balance.json", twilioAPIURL, p.accountSID)

	httpReq, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.SetBasicAuth(p.accountSID, p.authToken)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("twilio request failed with status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var balance TwilioBalance
	if err := json.Unmarshal(body, &balance); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	var bal float64
	fmt.Sscanf(balance.Balance, "%f", &bal)

	return &providers.BalanceInfo{
		Provider: p.Name(),
		Balance:  bal,
		Currency: balance.Currency,
	}, nil
}

// ValidatePhoneNumber validates and formats a phone number
func (p *Provider) ValidatePhoneNumber(phoneNumber string) (string, error) {
	// Remove all non-digit characters except leading +
	cleaned := regexp.MustCompile(`[^\d+]`).ReplaceAllString(phoneNumber, "")

	// Ensure it starts with +
	if !strings.HasPrefix(cleaned, "+") {
		cleaned = "+" + cleaned
	}

	// Basic E.164 validation
	e164Regex := regexp.MustCompile(`^\+[1-9]\d{6,14}$`)
	if !e164Regex.MatchString(cleaned) {
		return "", providers.ErrInvalidPhoneNumber
	}

	return cleaned, nil
}

// ParseWebhook parses a Twilio status callback webhook
func (p *Provider) ParseWebhook(payload []byte) (*providers.DeliveryReport, error) {
	values, err := url.ParseQuery(string(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to parse webhook: %w", err)
	}

	messageSID := values.Get("MessageSid")
	if messageSID == "" {
		return nil, errors.New("missing MessageSid in webhook")
	}

	report := &providers.DeliveryReport{
		MessageID:     messageSID,
		ProviderID:    messageSID,
		Provider:      p.Name(),
		Status:        mapTwilioStatus(values.Get("MessageStatus")),
		StatusMessage: values.Get("MessageStatus"),
		ErrorCode:     values.Get("ErrorCode"),
		ErrorMessage:  values.Get("ErrorMessage"),
	}

	return report, nil
}

// IsHealthy checks if the provider is operational
func (p *Provider) IsHealthy(ctx context.Context) bool {
	// Simple health check - try to fetch account info
	apiURL := fmt.Sprintf("%s/Accounts/%s.json", twilioAPIURL, p.accountSID)

	httpReq, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return false
	}

	httpReq.SetBasicAuth(p.accountSID, p.authToken)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// MaxMessageLength returns the maximum message length
func (p *Provider) MaxMessageLength() int {
	return maxMessageLength
}

// SupportsScheduling returns if scheduling is supported
func (p *Provider) SupportsScheduling() bool {
	return p.messagingServiceSID != ""
}

// mapTwilioStatus maps Twilio status to our standard status
func mapTwilioStatus(status string) providers.DeliveryStatus {
	switch strings.ToLower(status) {
	case "accepted", "queued", "sending":
		return providers.DeliveryStatusQueued
	case "sent":
		return providers.DeliveryStatusSent
	case "delivered":
		return providers.DeliveryStatusDelivered
	case "undelivered", "failed":
		return providers.DeliveryStatusFailed
	case "canceled":
		return providers.DeliveryStatusExpired
	default:
		return providers.DeliveryStatusUnknown
	}
}
