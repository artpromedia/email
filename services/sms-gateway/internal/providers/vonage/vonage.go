package vonage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"go.uber.org/zap"

	"sms-gateway/internal/providers"
)

const (
	vonageAPIURL     = "https://rest.nexmo.com/sms/json"
	vonageMessagesAPI = "https://api.nexmo.com/v1/messages"
	maxMessageLength = 1600
)

// Provider implements the SMS provider interface for Vonage
type Provider struct {
	apiKey        string
	apiSecret     string
	fromNumber    string
	applicationID string
	privateKey    string
	client        *http.Client
	logger        *zap.Logger
}

// VonageSMSRequest represents the SMS API request
type VonageSMSRequest struct {
	APIKey    string `json:"api_key"`
	APISecret string `json:"api_secret"`
	From      string `json:"from"`
	To        string `json:"to"`
	Text      string `json:"text"`
	Type      string `json:"type,omitempty"`
	StatusReportReq string `json:"status-report-req,omitempty"`
	Callback  string `json:"callback,omitempty"`
}

// VonageSMSResponse represents the SMS API response
type VonageSMSResponse struct {
	MessageCount string          `json:"message-count"`
	Messages     []VonageMessage `json:"messages"`
}

// VonageMessage represents a single message in the response
type VonageMessage struct {
	To               string `json:"to"`
	MessageID        string `json:"message-id"`
	Status           string `json:"status"`
	RemainingBalance string `json:"remaining-balance"`
	MessagePrice     string `json:"message-price"`
	Network          string `json:"network"`
	ErrorText        string `json:"error-text,omitempty"`
}

// VonageWebhook represents a delivery receipt webhook
type VonageWebhook struct {
	MSISDN           string `json:"msisdn"`
	To               string `json:"to"`
	NetworkCode      string `json:"network-code"`
	MessageID        string `json:"messageId"`
	Price            string `json:"price"`
	Status           string `json:"status"`
	SCTS             string `json:"scts"`
	ErrCode          string `json:"err-code"`
	MessageTimestamp string `json:"message-timestamp"`
}

// New creates a new Vonage provider
func New(apiKey, apiSecret, fromNumber, applicationID, privateKey string, logger *zap.Logger) *Provider {
	return &Provider{
		apiKey:        apiKey,
		apiSecret:     apiSecret,
		fromNumber:    fromNumber,
		applicationID: applicationID,
		privateKey:    privateKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// Name returns the provider name
func (p *Provider) Name() string {
	return "vonage"
}

// Send sends an SMS message via Vonage
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

	// Remove + from phone number for Vonage
	to = strings.TrimPrefix(to, "+")

	from := req.From
	if from == "" {
		from = p.fromNumber
	}

	// Build request
	smsReq := VonageSMSRequest{
		APIKey:    p.apiKey,
		APISecret: p.apiSecret,
		From:      from,
		To:        to,
		Text:      req.Message,
	}

	// Request delivery receipt
	if req.CallbackURL != "" {
		smsReq.StatusReportReq = "1"
		smsReq.Callback = req.CallbackURL
	}

	jsonData, err := json.Marshal(smsReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", vonageAPIURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var smsResp VonageSMSResponse
	if err := json.Unmarshal(body, &smsResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if len(smsResp.Messages) == 0 {
		return nil, fmt.Errorf("no messages in response")
	}

	msg := smsResp.Messages[0]

	// Check for errors
	if msg.Status != "0" {
		return nil, fmt.Errorf("vonage error: %s", msg.ErrorText)
	}

	return &providers.SendResponse{
		MessageID:     msg.MessageID,
		ProviderID:    msg.MessageID,
		Provider:      p.Name(),
		Status:        providers.DeliveryStatusQueued,
		StatusMessage: "Message sent",
		SegmentCount:  1,
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
	// Vonage doesn't have a direct status API for SMS
	// Status is typically received via webhook
	return &providers.DeliveryReport{
		MessageID:     messageID,
		ProviderID:    messageID,
		Provider:      p.Name(),
		Status:        providers.DeliveryStatusUnknown,
		StatusMessage: "Status available via webhook only",
	}, nil
}

// GetBalance retrieves the account balance
func (p *Provider) GetBalance(ctx context.Context) (*providers.BalanceInfo, error) {
	url := fmt.Sprintf("https://rest.nexmo.com/account/get-balance?api_key=%s&api_secret=%s",
		p.apiKey, p.apiSecret)

	httpReq, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("vonage request failed with status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var balanceResp struct {
		Value float64 `json:"value"`
	}
	if err := json.Unmarshal(body, &balanceResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &providers.BalanceInfo{
		Provider: p.Name(),
		Balance:  balanceResp.Value,
		Currency: "EUR",
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

// ParseWebhook parses a Vonage delivery receipt webhook
func (p *Provider) ParseWebhook(payload []byte) (*providers.DeliveryReport, error) {
	var webhook VonageWebhook
	if err := json.Unmarshal(payload, &webhook); err != nil {
		return nil, fmt.Errorf("failed to parse webhook: %w", err)
	}

	if webhook.MessageID == "" {
		return nil, fmt.Errorf("missing messageId in webhook")
	}

	report := &providers.DeliveryReport{
		MessageID:     webhook.MessageID,
		ProviderID:    webhook.MessageID,
		Provider:      p.Name(),
		Status:        mapVonageStatus(webhook.Status),
		StatusMessage: webhook.Status,
		ErrorCode:     webhook.ErrCode,
	}

	return report, nil
}

// IsHealthy checks if the provider is operational
func (p *Provider) IsHealthy(ctx context.Context) bool {
	_, err := p.GetBalance(ctx)
	return err == nil
}

// MaxMessageLength returns the maximum message length
func (p *Provider) MaxMessageLength() int {
	return maxMessageLength
}

// SupportsScheduling returns if scheduling is supported
func (p *Provider) SupportsScheduling() bool {
	return false
}

// mapVonageStatus maps Vonage status to our standard status
func mapVonageStatus(status string) providers.DeliveryStatus {
	switch strings.ToLower(status) {
	case "submitted", "buffered":
		return providers.DeliveryStatusQueued
	case "delivered":
		return providers.DeliveryStatusDelivered
	case "expired":
		return providers.DeliveryStatusExpired
	case "failed", "rejected":
		return providers.DeliveryStatusFailed
	case "accepted":
		return providers.DeliveryStatusSent
	default:
		return providers.DeliveryStatusUnknown
	}
}
