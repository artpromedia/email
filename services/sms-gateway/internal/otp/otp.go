package otp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"go.uber.org/zap"

	"sms-gateway/internal/config"
	"sms-gateway/internal/providers"
	"sms-gateway/internal/repository"
	"sms-gateway/internal/templates"
)

// Common errors
var (
	ErrOTPNotFound       = errors.New("OTP not found or expired")
	ErrOTPExpired        = errors.New("OTP has expired")
	ErrOTPMaxAttempts    = errors.New("maximum verification attempts exceeded")
	ErrOTPInvalid        = errors.New("invalid OTP code")
	ErrOTPAlreadyUsed    = errors.New("OTP has already been used")
	ErrResendCooldown    = errors.New("please wait before requesting a new OTP")
)

// Purpose represents the purpose of an OTP
type Purpose string

const (
	PurposeLogin          Purpose = "login"
	PurposeRegistration   Purpose = "registration"
	PurposePasswordReset  Purpose = "password_reset"
	PurposeVerification   Purpose = "verification"
	PurposeTransaction    Purpose = "transaction"
	PurposeTwoFactor      Purpose = "2fa"
)

// SendRequest represents an OTP send request
type SendRequest struct {
	PhoneNumber   string            `json:"phone_number"`
	Purpose       Purpose           `json:"purpose"`
	UserID        string            `json:"user_id,omitempty"`
	OrganizationID string           `json:"organization_id,omitempty"`
	TemplateID    string            `json:"template_id,omitempty"`
	Variables     map[string]string `json:"variables,omitempty"`
	IPAddress     string            `json:"ip_address,omitempty"`
	UserAgent     string            `json:"user_agent,omitempty"`
}

// SendResponse represents the response from sending an OTP
type SendResponse struct {
	RequestID    string    `json:"request_id"`
	ExpiresAt    time.Time `json:"expires_at"`
	ResendAfter  time.Time `json:"resend_after"`
	AttemptsLeft int       `json:"attempts_left"`
}

// VerifyRequest represents an OTP verification request
type VerifyRequest struct {
	RequestID   string `json:"request_id"`
	PhoneNumber string `json:"phone_number"`
	Code        string `json:"code"`
	Purpose     Purpose `json:"purpose,omitempty"`
	IPAddress   string `json:"ip_address,omitempty"`
	UserAgent   string `json:"user_agent,omitempty"`
}

// VerifyResponse represents the response from verifying an OTP
type VerifyResponse struct {
	Valid        bool   `json:"valid"`
	UserID       string `json:"user_id,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
}

// OTPRecord represents a stored OTP
type OTPRecord struct {
	ID             string    `db:"id"`
	PhoneNumber    string    `db:"phone_number"`
	Code           string    `db:"code"` // Stored as SHA-256 hash, never plaintext
	Purpose        Purpose   `db:"purpose"`
	UserID         string    `db:"user_id"`
	OrganizationID string    `db:"organization_id"`
	MessageID      string    `db:"message_id"`
	Attempts       int       `db:"attempts"`
	MaxAttempts    int       `db:"max_attempts"`
	Verified       bool      `db:"verified"`
	ExpiresAt      time.Time `db:"expires_at"`
	VerifiedAt     *time.Time `db:"verified_at"`
	CreatedAt      time.Time `db:"created_at"`
	IPAddress      string    `db:"ip_address"`
	UserAgent      string    `db:"user_agent"`
}

// hashOTPCode creates a SHA-256 hash of the OTP code for secure storage
func hashOTPCode(code string) string {
	hash := sha256.Sum256([]byte(code))
	return hex.EncodeToString(hash[:])
}

// Service handles OTP generation and verification
type Service struct {
	config          config.OTPConfig
	repo            *repository.Repository
	providerManager *providers.Manager
	templates       *templates.Engine
	logger          *zap.Logger
}

// New creates a new OTP service
func New(cfg config.OTPConfig, repo *repository.Repository, pm *providers.Manager, te *templates.Engine, logger *zap.Logger) *Service {
	return &Service{
		config:          cfg,
		repo:            repo,
		providerManager: pm,
		templates:       te,
		logger:          logger,
	}
}

// Send generates and sends an OTP
func (s *Service) Send(ctx context.Context, req *SendRequest) (*SendResponse, error) {
	// Check for recent OTP requests (cooldown)
	lastOTP, err := s.repo.GetLastOTP(ctx, req.PhoneNumber, string(req.Purpose))
	if err == nil && lastOTP != nil {
		cooldownEnd := lastOTP.CreatedAt.Add(s.config.ResendCooldown)
		if time.Now().Before(cooldownEnd) {
			return nil, ErrResendCooldown
		}
	}

	// Generate OTP code
	code, err := s.generateCode()
	if err != nil {
		return nil, fmt.Errorf("failed to generate OTP: %w", err)
	}

	// Create OTP record - store hashed code, never plaintext
	expiresAt := time.Now().Add(time.Duration(s.config.ExpiryMinutes) * time.Minute)

	// Normalize case for consistent hashing if not case-sensitive
	codeToHash := code
	if !s.config.CaseSensitive {
		codeToHash = strings.ToUpper(code)
	}

	record := &OTPRecord{
		PhoneNumber:    req.PhoneNumber,
		Code:           hashOTPCode(codeToHash), // Hash the code before storage
		Purpose:        req.Purpose,
		UserID:         req.UserID,
		OrganizationID: req.OrganizationID,
		MaxAttempts:    s.config.MaxAttempts,
		ExpiresAt:      expiresAt,
		IPAddress:      req.IPAddress,
		UserAgent:      req.UserAgent,
	}

	// Render message template
	message, err := s.templates.RenderOTP(ctx, req.TemplateID, req.Purpose, code, req.Variables)
	if err != nil {
		return nil, fmt.Errorf("failed to render template: %w", err)
	}

	// Send SMS
	smsReq := &providers.SendRequest{
		To:          req.PhoneNumber,
		Message:     message,
		MessageType: providers.MessageTypeOTP,
	}

	smsResp, err := s.providerManager.Send(ctx, smsReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send OTP: %w", err)
	}

	record.MessageID = smsResp.MessageID

	// Save OTP record
	id, err := s.repo.CreateOTP(ctx, record)
	if err != nil {
		return nil, fmt.Errorf("failed to save OTP: %w", err)
	}

	s.logger.Info("OTP sent successfully",
		zap.String("request_id", id),
		zap.String("purpose", string(req.Purpose)),
		zap.String("message_id", smsResp.MessageID),
	)

	return &SendResponse{
		RequestID:    id,
		ExpiresAt:    expiresAt,
		ResendAfter:  time.Now().Add(s.config.ResendCooldown),
		AttemptsLeft: s.config.MaxAttempts,
	}, nil
}

// Verify verifies an OTP code
func (s *Service) Verify(ctx context.Context, req *VerifyRequest) (*VerifyResponse, error) {
	// Get OTP record
	var record *OTPRecord
	var err error

	if req.RequestID != "" {
		record, err = s.repo.GetOTPByID(ctx, req.RequestID)
	} else {
		record, err = s.repo.GetActiveOTP(ctx, req.PhoneNumber, string(req.Purpose))
	}

	if err != nil || record == nil {
		return &VerifyResponse{Valid: false, ErrorMessage: "OTP not found"}, ErrOTPNotFound
	}

	// Check if already verified
	if record.Verified {
		return &VerifyResponse{Valid: false, ErrorMessage: "OTP already used"}, ErrOTPAlreadyUsed
	}

	// Check expiry
	if time.Now().After(record.ExpiresAt) {
		return &VerifyResponse{Valid: false, ErrorMessage: "OTP expired"}, ErrOTPExpired
	}

	// Check max attempts
	if record.Attempts >= record.MaxAttempts {
		return &VerifyResponse{Valid: false, ErrorMessage: "Maximum attempts exceeded"}, ErrOTPMaxAttempts
	}

	// Increment attempt counter
	if err := s.repo.IncrementOTPAttempts(ctx, record.ID); err != nil {
		s.logger.Error("Failed to increment OTP attempts", zap.Error(err))
	}

	// Verify code
	valid := s.verifyCode(record.Code, req.Code)
	if !valid {
		attemptsLeft := record.MaxAttempts - record.Attempts - 1
		s.logger.Info("OTP verification failed",
			zap.String("request_id", record.ID),
			zap.Int("attempts_left", attemptsLeft),
		)
		return &VerifyResponse{
			Valid:        false,
			ErrorMessage: fmt.Sprintf("Invalid OTP. %d attempts remaining", attemptsLeft),
		}, ErrOTPInvalid
	}

	// Mark as verified
	if err := s.repo.MarkOTPVerified(ctx, record.ID); err != nil {
		s.logger.Error("Failed to mark OTP as verified", zap.Error(err))
	}

	s.logger.Info("OTP verified successfully",
		zap.String("request_id", record.ID),
		zap.String("purpose", string(record.Purpose)),
	)

	return &VerifyResponse{
		Valid:  true,
		UserID: record.UserID,
	}, nil
}

// generateCode generates a secure random OTP code
func (s *Service) generateCode() (string, error) {
	length := s.config.Length
	if length == 0 {
		length = 6
	}

	if s.config.Alphanumeric {
		return s.generateAlphanumericCode(length)
	}
	return s.generateNumericCode(length)
}

func (s *Service) generateNumericCode(length int) (string, error) {
	code := make([]byte, length)
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		code[i] = byte('0' + n.Int64())
	}
	return string(code), nil
}

func (s *Service) generateAlphanumericCode(length int) (string, error) {
	chars := "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ" // Excluding I and O to avoid confusion
	code := make([]byte, length)
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", err
		}
		code[i] = chars[n.Int64()]
	}
	return string(code), nil
}

// verifyCode compares the stored hash with the hash of the provided code
// using constant-time comparison to prevent timing attacks
func (s *Service) verifyCode(storedHash, providedCode string) bool {
	// Normalize case if not case-sensitive
	if !s.config.CaseSensitive {
		providedCode = strings.ToUpper(providedCode)
	}

	// Hash the provided code for comparison
	providedHash := hashOTPCode(providedCode)

	// Use constant-time comparison to prevent timing attacks
	return subtle.ConstantTimeCompare([]byte(storedHash), []byte(providedHash)) == 1
}

// Cancel cancels an active OTP
func (s *Service) Cancel(ctx context.Context, requestID string) error {
	return s.repo.CancelOTP(ctx, requestID)
}

// GetStatus returns the status of an OTP request
func (s *Service) GetStatus(ctx context.Context, requestID string) (*OTPRecord, error) {
	return s.repo.GetOTPByID(ctx, requestID)
}
