package gsm

import (
	"context"
	"errors"
	"time"

	"go.uber.org/zap"

	"sms-gateway/internal/providers"
)

// =============================================================================
// GSM Modem Provider - NOT IMPLEMENTED
// =============================================================================
//
// This provider is a placeholder for future GSM modem integration.
// GSM modems allow sending SMS via physical hardware (SIM card + modem).
//
// STATUS: UNSUPPORTED
//
// Reasons for non-implementation:
// 1. Requires physical hardware (GSM modem + SIM card)
// 2. Limited scalability (one modem = one number)
// 3. Carrier rate limits apply to SIM cards
// 4. Not suitable for cloud/containerized deployments
// 5. Maintenance overhead for hardware management
//
// For production SMS delivery, use cloud providers:
//   - Twilio (recommended)
//   - Vonage
//
// GSM modems may be suitable for:
//   - IoT devices with local SMS requirements
//   - Offline/air-gapped environments
//   - Development/testing with real carrier networks
//
// To implement GSM in the future, consider these libraries:
//   - github.com/tarm/serial
//   - go.bug.st/serial
//
// =============================================================================

// Error constants for GSM provider
var (
	ErrGSMNotSupported     = errors.New("GSM modem provider is not supported. Use Twilio or Vonage providers instead")
	ErrGSMRequiresHardware = errors.New("GSM modem requires physical hardware and is not suitable for cloud deployments")
)

// Provider implements the SMS provider interface for GSM modems (placeholder)
type Provider struct {
	devicePath string
	baudRate   int
	pin        string
	logger     *zap.Logger
	connected  bool
}

// Config holds GSM modem configuration
type Config struct {
	DevicePath string // e.g., "/dev/ttyUSB0" or "COM3"
	BaudRate   int    // e.g., 115200
	PIN        string // SIM card PIN
}

// New creates a new GSM modem provider (logs warning about unsupported status)
func New(cfg Config, logger *zap.Logger) *Provider {
	logger.Warn("GSM modem provider is not implemented and will return errors for all operations",
		zap.String("provider", "gsm"),
		zap.String("reason", "Requires physical hardware not available in cloud deployments"),
		zap.String("recommendation", "Use Twilio or Vonage providers instead"),
	)

	return &Provider{
		devicePath: cfg.DevicePath,
		baudRate:   cfg.BaudRate,
		pin:        cfg.PIN,
		logger:     logger,
		connected:  false,
	}
}

// Name returns the provider name
func (p *Provider) Name() string {
	return "gsm"
}

// IsSupported returns false - GSM is not implemented
func (p *Provider) IsSupported() bool {
	return false
}

// Connect returns an error - GSM is not supported
func (p *Provider) Connect(ctx context.Context) error {
	p.logger.Error("Attempted to connect to unsupported GSM modem provider")
	return ErrGSMNotSupported
}

// Disconnect is a no-op for unsupported provider
func (p *Provider) Disconnect() error {
	return nil
}

// Send returns an error - GSM is not supported
func (p *Provider) Send(ctx context.Context, req *providers.SendRequest) (*providers.SendResponse, error) {
	p.logger.Error("Attempted to send SMS via unsupported GSM modem provider",
		zap.String("to", req.To),
	)

	return &providers.SendResponse{
		Provider:      p.Name(),
		Status:        providers.DeliveryStatusFailed,
		StatusMessage: ErrGSMNotSupported.Error(),
		SentAt:        time.Now(),
	}, ErrGSMNotSupported
}

// SendBulk returns errors for all messages - GSM is not supported
func (p *Provider) SendBulk(ctx context.Context, requests []*providers.SendRequest) ([]*providers.SendResponse, error) {
	responses := make([]*providers.SendResponse, len(requests))

	for i := range requests {
		responses[i] = &providers.SendResponse{
			Provider:      p.Name(),
			Status:        providers.DeliveryStatusFailed,
			StatusMessage: ErrGSMNotSupported.Error(),
			SentAt:        time.Now(),
		}
	}

	return responses, ErrGSMNotSupported
}

// GetStatus returns an error - GSM is not supported
func (p *Provider) GetStatus(ctx context.Context, messageID string) (*providers.DeliveryReport, error) {
	return &providers.DeliveryReport{
		MessageID:     messageID,
		Provider:      p.Name(),
		Status:        providers.DeliveryStatusFailed,
		StatusMessage: ErrGSMNotSupported.Error(),
	}, ErrGSMNotSupported
}

// GetBalance returns an error - GSM is not supported
func (p *Provider) GetBalance(ctx context.Context) (*providers.BalanceInfo, error) {
	return nil, ErrGSMNotSupported
}

// ValidatePhoneNumber - delegates to basic validation (for informational purposes only)
func (p *Provider) ValidatePhoneNumber(phoneNumber string) (string, error) {
	if len(phoneNumber) < 7 {
		return "", providers.ErrInvalidPhoneNumber
	}
	return phoneNumber, nil
}

// ParseWebhook returns an error - GSM is not supported
func (p *Provider) ParseWebhook(payload []byte) (*providers.DeliveryReport, error) {
	return nil, ErrGSMNotSupported
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

// GetSignalStrength returns an error - GSM is not supported
func (p *Provider) GetSignalStrength(ctx context.Context) (int, error) {
	return -1, ErrGSMNotSupported
}

// GetNetworkInfo returns an error - GSM is not supported
func (p *Provider) GetNetworkInfo(ctx context.Context) (string, error) {
	return "", ErrGSMNotSupported
}

// =============================================================================
// Future Implementation Notes
// =============================================================================
//
// If GSM modem support is required in the future, implement the following:
//
// 1. Serial Port Setup:
//    - Open serial port: /dev/ttyUSB0 (Linux) or COM3 (Windows)
//    - Configure: 8 data bits, no parity, 1 stop bit
//    - Typical baud rates: 9600, 19200, 115200
//    - Handle DTR/RTS flow control
//
// 2. AT Command Initialization:
//    AT            - Test connection (expect "OK")
//    ATE0          - Disable echo
//    AT+CPIN?      - Check SIM status (READY, SIM PIN, etc.)
//    AT+CPIN="1234" - Enter PIN if required
//    AT+CMGF=1     - Set text mode (or 0 for PDU mode)
//    AT+CSCA?      - Get SMS center number
//    AT+CREG?      - Check network registration
//
// 3. Sending SMS (Text Mode):
//    AT+CMGF=1
//    AT+CMGS="+1234567890"
//    > Hello World<Ctrl+Z>
//    +CMGS: 123    - Message reference number
//
// 4. Sending SMS (PDU Mode for Unicode):
//    AT+CMGF=0
//    AT+CMGS=<pdu_length>
//    > <pdu_hex><Ctrl+Z>
//
// 5. Delivery Reports:
//    AT+CNMI=2,1,0,1,0  - Enable delivery notifications
//    +CDS: <length>     - Delivery status report
//    +CDSI: <index>     - Status report stored at index
//
// 6. Error Handling:
//    +CMS ERROR: 500 - Unknown error
//    +CMS ERROR: 301 - SMS service reserved
//    +CMS ERROR: 304 - Invalid PDU parameter
//
// Example dependencies:
//   go get github.com/tarm/serial
//   go get go.bug.st/serial
//
// =============================================================================
