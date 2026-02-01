package smpp

import (
	"context"
	"errors"
	"time"

	"go.uber.org/zap"

	"sms-gateway/internal/providers"
)

// =============================================================================
// SMPP Provider - NOT IMPLEMENTED
// =============================================================================
//
// This provider is a placeholder for future direct SMPP integration.
// SMPP (Short Message Peer-to-Peer) protocol allows direct connection to
// carrier networks/SMS centers (SMSCs).
//
// STATUS: UNSUPPORTED
//
// Reasons for non-implementation:
// 1. SMPP requires carrier agreements and dedicated connections
// 2. Production SMPP setup needs significant infrastructure
// 3. Cloud-based providers (Twilio, Vonage) offer better reliability
// 4. Limited demand for direct SMPP in modern applications
//
// To implement SMPP in the future, consider these libraries:
//   - github.com/fiorix/go-smpp
//   - github.com/ajankovic/smpp
//
// =============================================================================

// Error constants for SMPP provider
var (
	ErrSMPPNotSupported   = errors.New("SMPP provider is not supported. Use Twilio or Vonage providers instead")
	ErrSMPPRequiresCarrier = errors.New("SMPP requires carrier agreement and dedicated infrastructure")
)

// Provider implements the SMS provider interface for SMPP (placeholder)
type Provider struct {
	host       string
	port       int
	systemID   string
	password   string
	systemType string
	logger     *zap.Logger
	connected  bool
}

// Config holds SMPP configuration
type Config struct {
	Host       string
	Port       int
	SystemID   string
	Password   string
	SystemType string
}

// New creates a new SMPP provider (logs warning about unsupported status)
func New(cfg Config, logger *zap.Logger) *Provider {
	logger.Warn("SMPP provider is not implemented and will return errors for all operations",
		zap.String("provider", "smpp"),
		zap.String("recommendation", "Use Twilio or Vonage providers instead"),
	)

	return &Provider{
		host:       cfg.Host,
		port:       cfg.Port,
		systemID:   cfg.SystemID,
		password:   cfg.Password,
		systemType: cfg.SystemType,
		logger:     logger,
		connected:  false,
	}
}

// Name returns the provider name
func (p *Provider) Name() string {
	return "smpp"
}

// IsSupported returns false - SMPP is not implemented
func (p *Provider) IsSupported() bool {
	return false
}

// Connect returns an error - SMPP is not supported
func (p *Provider) Connect(ctx context.Context) error {
	p.logger.Error("Attempted to connect to unsupported SMPP provider")
	return ErrSMPPNotSupported
}

// Disconnect is a no-op for unsupported provider
func (p *Provider) Disconnect() error {
	return nil
}

// Send returns an error - SMPP is not supported
func (p *Provider) Send(ctx context.Context, req *providers.SendRequest) (*providers.SendResponse, error) {
	p.logger.Error("Attempted to send SMS via unsupported SMPP provider",
		zap.String("to", req.To),
	)

	return &providers.SendResponse{
		Provider:      p.Name(),
		Status:        providers.DeliveryStatusFailed,
		StatusMessage: ErrSMPPNotSupported.Error(),
		SentAt:        time.Now(),
	}, ErrSMPPNotSupported
}

// SendBulk returns errors for all messages - SMPP is not supported
func (p *Provider) SendBulk(ctx context.Context, requests []*providers.SendRequest) ([]*providers.SendResponse, error) {
	responses := make([]*providers.SendResponse, len(requests))

	for i := range requests {
		responses[i] = &providers.SendResponse{
			Provider:      p.Name(),
			Status:        providers.DeliveryStatusFailed,
			StatusMessage: ErrSMPPNotSupported.Error(),
			SentAt:        time.Now(),
		}
	}

	return responses, ErrSMPPNotSupported
}

// GetStatus returns an error - SMPP is not supported
func (p *Provider) GetStatus(ctx context.Context, messageID string) (*providers.DeliveryReport, error) {
	return &providers.DeliveryReport{
		MessageID:     messageID,
		Provider:      p.Name(),
		Status:        providers.DeliveryStatusFailed,
		StatusMessage: ErrSMPPNotSupported.Error(),
	}, ErrSMPPNotSupported
}

// GetBalance returns an error - SMPP is not supported
func (p *Provider) GetBalance(ctx context.Context) (*providers.BalanceInfo, error) {
	return nil, ErrSMPPNotSupported
}

// ValidatePhoneNumber - delegates to basic validation (for informational purposes only)
func (p *Provider) ValidatePhoneNumber(phoneNumber string) (string, error) {
	if len(phoneNumber) < 7 {
		return "", providers.ErrInvalidPhoneNumber
	}
	return phoneNumber, nil
}

// ParseWebhook returns an error - SMPP is not supported
func (p *Provider) ParseWebhook(payload []byte) (*providers.DeliveryReport, error) {
	return nil, ErrSMPPNotSupported
}

// IsHealthy always returns false for unsupported provider
func (p *Provider) IsHealthy(ctx context.Context) bool {
	return false
}

// MaxMessageLength returns standard SMS length
func (p *Provider) MaxMessageLength() int {
	return 160
}

// SupportsScheduling returns false for unsupported provider
func (p *Provider) SupportsScheduling() bool {
	return false
}

// =============================================================================
// Future Implementation Notes
// =============================================================================
//
// If SMPP support is required in the future, implement the following:
//
// 1. Connection Management:
//    - Bind as transceiver for send/receive
//    - Implement enquire_link keepalive (every 30s)
//    - Handle unbind for graceful disconnect
//    - Implement automatic reconnection with exponential backoff
//
// 2. Message Sending (submit_sm):
//    - Set source_addr (sender ID)
//    - Set dest_addr (recipient)
//    - Set short_message (content)
//    - Handle UDH for multipart messages
//    - Support GSM7 and UCS2 encodings
//
// 3. Delivery Reports (deliver_sm):
//    - Parse stat field: DELIVRD, EXPIRED, DELETED, UNDELIV, ACCEPTD, etc.
//    - Map SMPP status to our DeliveryStatus enum
//    - Handle err field for error codes
//
// 4. Multipart Messages (UDH):
//    - Split messages > 160 chars (or > 70 for Unicode)
//    - Add User Data Header with reference and part numbers
//    - Concatenation: UDHI flag + UDH (6 bytes)
//
// 5. Throughput & Reliability:
//    - Implement windowing for async submit_sm
//    - Track message_id from submit_sm_resp
//    - Handle throttling (ESME_RTHROTTLED)
//
// Example dependencies:
//   go get github.com/fiorix/go-smpp
//   go get github.com/ajankovic/smpp
// =============================================================================
