package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"sms-gateway/internal/otp"
	"sms-gateway/internal/providers"
	"sms-gateway/internal/repository"
	"sms-gateway/internal/templates"
)

// =============================================================================
// Request/Response Types
// =============================================================================

// SendSMSRequest represents an SMS send request
type SendSMSRequest struct {
	To          string            `json:"to"`
	From        string            `json:"from,omitempty"`
	Message     string            `json:"message"`
	TemplateID  string            `json:"template_id,omitempty"`
	Variables   map[string]string `json:"variables,omitempty"`
	Provider    string            `json:"provider,omitempty"`
	ScheduledAt *time.Time        `json:"scheduled_at,omitempty"`
	CallbackURL string            `json:"callback_url,omitempty"`
}

// SendSMSResponse represents the response from sending an SMS
type SendSMSResponse struct {
	MessageID    string `json:"message_id"`
	Status       string `json:"status"`
	Provider     string `json:"provider"`
	SegmentCount int    `json:"segment_count"`
	Cost         float64 `json:"cost,omitempty"`
}

// SendBulkSMSRequest represents a bulk SMS send request
type SendBulkSMSRequest struct {
	Messages []SendSMSRequest `json:"messages"`
}

// SendBulkSMSResponse represents the response from bulk SMS
type SendBulkSMSResponse struct {
	Results []SendSMSResponse `json:"results"`
	Total   int               `json:"total"`
	Success int               `json:"success"`
	Failed  int               `json:"failed"`
}

// OTPRequest represents an OTP request
type OTPRequest struct {
	PhoneNumber string            `json:"phone_number"`
	Purpose     string            `json:"purpose"`
	TemplateID  string            `json:"template_id,omitempty"`
	Variables   map[string]string `json:"variables,omitempty"`
}

// OTPVerifyRequest represents an OTP verification request
type OTPVerifyRequest struct {
	RequestID   string `json:"request_id,omitempty"`
	PhoneNumber string `json:"phone_number"`
	Code        string `json:"code"`
	Purpose     string `json:"purpose,omitempty"`
}

// APIResponse represents a generic API response
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *APIError   `json:"error,omitempty"`
}

// APIError represents an API error
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// =============================================================================
// SMS Handlers
// =============================================================================

func (s *Server) sendSMS(w http.ResponseWriter, r *http.Request) {
	var req SendSMSRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	// Validate request
	if req.To == "" {
		s.sendError(w, http.StatusBadRequest, "missing_to", "Recipient phone number is required")
		return
	}
	if req.Message == "" && req.TemplateID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_message", "Message or template ID is required")
		return
	}

	// Render template if provided
	message := req.Message
	if req.TemplateID != "" {
		var err error
		message, err = s.templates.RenderTransactional(r.Context(), req.TemplateID, "", req.Variables)
		if err != nil {
			s.sendError(w, http.StatusBadRequest, "template_error", err.Error())
			return
		}
	}

	// Build provider request
	providerReq := &providers.SendRequest{
		To:          req.To,
		From:        req.From,
		Message:     message,
		MessageType: providers.MessageTypeTransactional,
		ScheduledAt: req.ScheduledAt,
		CallbackURL: req.CallbackURL,
	}

	// Send via provider
	var resp *providers.SendResponse
	var err error

	if req.Provider != "" {
		resp, err = s.providerManager.SendWithProvider(r.Context(), req.Provider, providerReq)
	} else {
		resp, err = s.providerManager.Send(r.Context(), providerReq)
	}

	if err != nil {
		s.logger.Error("Failed to send SMS", zap.Error(err))
		s.sendError(w, http.StatusInternalServerError, "send_failed", err.Error())
		return
	}

	// Save to database
	msg := &repository.SMSMessage{
		Provider:     resp.Provider,
		ProviderID:   resp.ProviderID,
		FromNumber:   req.From,
		ToNumber:     req.To,
		Message:      message,
		MessageType:  string(providers.MessageTypeTransactional),
		Status:       string(resp.Status),
		SegmentCount: resp.SegmentCount,
		SentAt:       &resp.SentAt,
	}
	msgID, _ := s.repo.CreateMessage(r.Context(), msg)

	s.sendSuccess(w, http.StatusOK, SendSMSResponse{
		MessageID:    msgID,
		Status:       string(resp.Status),
		Provider:     resp.Provider,
		SegmentCount: resp.SegmentCount,
		Cost:         resp.Cost,
	})
}

func (s *Server) sendBulkSMS(w http.ResponseWriter, r *http.Request) {
	var req SendBulkSMSRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if len(req.Messages) == 0 {
		s.sendError(w, http.StatusBadRequest, "missing_messages", "At least one message is required")
		return
	}

	results := make([]SendSMSResponse, len(req.Messages))
	success := 0
	failed := 0

	for i, msg := range req.Messages {
		message := msg.Message
		if msg.TemplateID != "" {
			var err error
			message, err = s.templates.RenderTransactional(r.Context(), msg.TemplateID, "", msg.Variables)
			if err != nil {
				results[i] = SendSMSResponse{Status: "failed"}
				failed++
				continue
			}
		}

		providerReq := &providers.SendRequest{
			To:          msg.To,
			From:        msg.From,
			Message:     message,
			MessageType: providers.MessageTypeTransactional,
		}

		resp, err := s.providerManager.Send(r.Context(), providerReq)
		if err != nil {
			results[i] = SendSMSResponse{Status: "failed"}
			failed++
			continue
		}

		results[i] = SendSMSResponse{
			MessageID:    resp.MessageID,
			Status:       string(resp.Status),
			Provider:     resp.Provider,
			SegmentCount: resp.SegmentCount,
		}
		success++
	}

	s.sendSuccess(w, http.StatusOK, SendBulkSMSResponse{
		Results: results,
		Total:   len(req.Messages),
		Success: success,
		Failed:  failed,
	})
}

func (s *Server) getMessageStatus(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "messageId")
	if messageID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_message_id", "Message ID is required")
		return
	}

	msg, err := s.repo.GetMessage(r.Context(), messageID)
	if err != nil {
		s.sendError(w, http.StatusNotFound, "not_found", "Message not found")
		return
	}

	s.sendSuccess(w, http.StatusOK, msg)
}

func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	// Get pagination params
	limit := 50
	offset := 0

	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	// Get organization ID from auth context
	orgID := s.getOrganizationID(r)

	messages, total, err := s.repo.ListMessages(r.Context(), orgID, limit, offset)
	if err != nil {
		s.sendError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}

	s.sendSuccess(w, http.StatusOK, map[string]interface{}{
		"messages": messages,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// =============================================================================
// OTP Handlers
// =============================================================================

func (s *Server) sendOTP(w http.ResponseWriter, r *http.Request) {
	var req OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if req.PhoneNumber == "" {
		s.sendError(w, http.StatusBadRequest, "missing_phone", "Phone number is required")
		return
	}

	purpose := otp.Purpose(req.Purpose)
	if purpose == "" {
		purpose = otp.PurposeVerification
	}

	// Check OTP rate limits
	result, err := s.rateLimiter.CheckOTP(r.Context(), "", req.PhoneNumber)
	if err != nil {
		s.logger.Error("Rate limit check failed", zap.Error(err))
	}
	if !result.Allowed {
		s.sendError(w, http.StatusTooManyRequests, "rate_limited", "Too many OTP requests")
		return
	}

	otpReq := &otp.SendRequest{
		PhoneNumber: req.PhoneNumber,
		Purpose:     purpose,
		TemplateID:  req.TemplateID,
		Variables:   req.Variables,
		IPAddress:   r.RemoteAddr,
		UserAgent:   r.UserAgent(),
	}

	resp, err := s.otpService.Send(r.Context(), otpReq)
	if err != nil {
		if err == otp.ErrResendCooldown {
			s.sendError(w, http.StatusTooManyRequests, "cooldown", "Please wait before requesting a new OTP")
			return
		}
		s.logger.Error("Failed to send OTP", zap.Error(err))
		s.sendError(w, http.StatusInternalServerError, "otp_failed", "Failed to send OTP")
		return
	}

	s.sendSuccess(w, http.StatusOK, resp)
}

func (s *Server) verifyOTP(w http.ResponseWriter, r *http.Request) {
	var req OTPVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if req.Code == "" {
		s.sendError(w, http.StatusBadRequest, "missing_code", "OTP code is required")
		return
	}
	if req.PhoneNumber == "" && req.RequestID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_identifier", "Phone number or request ID is required")
		return
	}

	verifyReq := &otp.VerifyRequest{
		RequestID:   req.RequestID,
		PhoneNumber: req.PhoneNumber,
		Code:        req.Code,
		Purpose:     otp.Purpose(req.Purpose),
		IPAddress:   r.RemoteAddr,
		UserAgent:   r.UserAgent(),
	}

	resp, err := s.otpService.Verify(r.Context(), verifyReq)
	if err != nil {
		switch err {
		case otp.ErrOTPNotFound:
			s.sendError(w, http.StatusNotFound, "not_found", "OTP not found or expired")
		case otp.ErrOTPExpired:
			s.sendError(w, http.StatusGone, "expired", "OTP has expired")
		case otp.ErrOTPMaxAttempts:
			s.sendError(w, http.StatusTooManyRequests, "max_attempts", "Maximum verification attempts exceeded")
		case otp.ErrOTPInvalid:
			s.sendSuccess(w, http.StatusOK, resp) // Return validation result
		case otp.ErrOTPAlreadyUsed:
			s.sendError(w, http.StatusConflict, "already_used", "OTP has already been used")
		default:
			s.sendError(w, http.StatusInternalServerError, "verify_failed", "Verification failed")
		}
		return
	}

	s.sendSuccess(w, http.StatusOK, resp)
}

func (s *Server) resendOTP(w http.ResponseWriter, r *http.Request) {
	var req OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	// Same as sendOTP - creates a new OTP
	s.sendOTP(w, r)
}

func (s *Server) cancelOTP(w http.ResponseWriter, r *http.Request) {
	requestID := chi.URLParam(r, "requestId")
	if requestID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_request_id", "Request ID is required")
		return
	}

	if err := s.otpService.Cancel(r.Context(), requestID); err != nil {
		s.sendError(w, http.StatusInternalServerError, "cancel_failed", "Failed to cancel OTP")
		return
	}

	s.sendSuccess(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

func (s *Server) getOTPStatus(w http.ResponseWriter, r *http.Request) {
	requestID := chi.URLParam(r, "requestId")
	if requestID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_request_id", "Request ID is required")
		return
	}

	record, err := s.otpService.GetStatus(r.Context(), requestID)
	if err != nil {
		s.sendError(w, http.StatusNotFound, "not_found", "OTP not found")
		return
	}

	// Don't expose the actual code
	s.sendSuccess(w, http.StatusOK, map[string]interface{}{
		"request_id":    record.ID,
		"purpose":       record.Purpose,
		"verified":      record.Verified,
		"attempts":      record.Attempts,
		"max_attempts":  record.MaxAttempts,
		"expires_at":    record.ExpiresAt,
		"created_at":    record.CreatedAt,
	})
}

// =============================================================================
// Template Handlers
// =============================================================================

func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request) {
	templateType := r.URL.Query().Get("type")
	orgID := s.getOrganizationID(r)

	tpls, err := s.templates.ListTemplates(r.Context(), orgID, templateType)
	if err != nil {
		s.sendError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}

	s.sendSuccess(w, http.StatusOK, tpls)
}

func (s *Server) createTemplate(w http.ResponseWriter, r *http.Request) {
	var req templates.Template
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	if err := s.templates.CreateTemplate(r.Context(), &req); err != nil {
		s.sendError(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}

	s.sendSuccess(w, http.StatusCreated, req)
}

func (s *Server) getTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "templateId")
	if templateID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_template_id", "Template ID is required")
		return
	}

	tpl, err := s.templates.GetTemplate(r.Context(), templateID)
	if err != nil {
		s.sendError(w, http.StatusNotFound, "not_found", "Template not found")
		return
	}

	s.sendSuccess(w, http.StatusOK, tpl)
}

func (s *Server) updateTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "templateId")
	if templateID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_template_id", "Template ID is required")
		return
	}

	var req templates.Template
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	req.ID = templateID
	if err := s.templates.UpdateTemplate(r.Context(), &req); err != nil {
		s.sendError(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}

	s.sendSuccess(w, http.StatusOK, req)
}

func (s *Server) deleteTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "templateId")
	if templateID == "" {
		s.sendError(w, http.StatusBadRequest, "missing_template_id", "Template ID is required")
		return
	}

	if err := s.templates.DeleteTemplate(r.Context(), templateID); err != nil {
		s.sendError(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}

	s.sendSuccess(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// =============================================================================
// Provider Handlers
// =============================================================================

func (s *Server) listProviders(w http.ResponseWriter, r *http.Request) {
	names := s.providerManager.ListProviders()
	s.sendSuccess(w, http.StatusOK, names)
}

func (s *Server) getProviderStatus(w http.ResponseWriter, r *http.Request) {
	status := s.providerManager.GetProviderStatus()
	s.sendSuccess(w, http.StatusOK, status)
}

func (s *Server) getProviderBalance(w http.ResponseWriter, r *http.Request) {
	providerName := r.URL.Query().Get("provider")

	if providerName != "" {
		provider, err := s.providerManager.Get(providerName)
		if err != nil {
			s.sendError(w, http.StatusNotFound, "not_found", "Provider not found")
			return
		}

		balance, err := provider.GetBalance(r.Context())
		if err != nil {
			s.sendError(w, http.StatusInternalServerError, "balance_failed", err.Error())
			return
		}

		s.sendSuccess(w, http.StatusOK, balance)
		return
	}

	// Get balance from all providers
	balances := make([]interface{}, 0)
	for _, name := range s.providerManager.ListProviders() {
		provider, _ := s.providerManager.Get(name)
		if balance, err := provider.GetBalance(r.Context()); err == nil {
			balances = append(balances, balance)
		}
	}

	s.sendSuccess(w, http.StatusOK, balances)
}

// =============================================================================
// Webhook Handlers
// =============================================================================

func (s *Server) handleTwilioWebhook(w http.ResponseWriter, r *http.Request) {
	body := make([]byte, r.ContentLength)
	r.Body.Read(body)

	provider, err := s.providerManager.Get("twilio")
	if err != nil {
		s.logger.Error("Twilio provider not found")
		w.WriteHeader(http.StatusOK)
		return
	}

	report, err := provider.ParseWebhook(body)
	if err != nil {
		s.logger.Error("Failed to parse Twilio webhook", zap.Error(err))
		w.WriteHeader(http.StatusOK)
		return
	}

	// Update message status
	msg, err := s.repo.GetMessageByProviderID(r.Context(), "twilio", report.ProviderID)
	if err == nil && msg != nil {
		s.repo.UpdateMessageStatus(r.Context(), msg.ID, string(report.Status), report.ErrorCode, report.ErrorMessage, report.DeliveredAt)
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleVonageWebhook(w http.ResponseWriter, r *http.Request) {
	body := make([]byte, r.ContentLength)
	r.Body.Read(body)

	provider, err := s.providerManager.Get("vonage")
	if err != nil {
		s.logger.Error("Vonage provider not found")
		w.WriteHeader(http.StatusOK)
		return
	}

	report, err := provider.ParseWebhook(body)
	if err != nil {
		s.logger.Error("Failed to parse Vonage webhook", zap.Error(err))
		w.WriteHeader(http.StatusOK)
		return
	}

	// Update message status
	msg, err := s.repo.GetMessageByProviderID(r.Context(), "vonage", report.ProviderID)
	if err == nil && msg != nil {
		s.repo.UpdateMessageStatus(r.Context(), msg.ID, string(report.Status), report.ErrorCode, report.ErrorMessage, report.DeliveredAt)
	}

	w.WriteHeader(http.StatusOK)
}

// =============================================================================
// Analytics Handlers
// =============================================================================

func (s *Server) getAnalyticsSummary(w http.ResponseWriter, r *http.Request) {
	orgID := s.getOrganizationID(r)

	// Get analytics from repository
	summary, err := s.repo.GetAnalyticsSummary(r.Context(), orgID)
	if err != nil {
		s.logger.Error("Failed to get analytics summary", zap.Error(err))
		// Return zeros on error rather than failing
		s.sendSuccess(w, http.StatusOK, map[string]interface{}{
			"total_sent":      0,
			"total_delivered": 0,
			"total_failed":    0,
			"delivery_rate":   0.0,
		})
		return
	}

	// Calculate delivery rate
	var deliveryRate float64
	if summary.TotalSent > 0 {
		deliveryRate = float64(summary.TotalDelivered) / float64(summary.TotalSent) * 100
	}

	s.sendSuccess(w, http.StatusOK, map[string]interface{}{
		"total_sent":      summary.TotalSent,
		"total_delivered": summary.TotalDelivered,
		"total_failed":    summary.TotalFailed,
		"delivery_rate":   deliveryRate,
	})
}

func (s *Server) getUsageStats(w http.ResponseWriter, r *http.Request) {
	orgID := s.getOrganizationID(r)

	// Get usage stats from repository
	stats, err := s.repo.GetUsageStats(r.Context(), orgID)
	if err != nil {
		s.logger.Error("Failed to get usage stats", zap.Error(err))
		// Return zeros on error rather than failing
		s.sendSuccess(w, http.StatusOK, map[string]interface{}{
			"messages_today": 0,
			"messages_week":  0,
			"messages_month": 0,
		})
		return
	}

	s.sendSuccess(w, http.StatusOK, map[string]interface{}{
		"messages_today": stats.Today,
		"messages_week":  stats.Week,
		"messages_month": stats.Month,
	})
}

// =============================================================================
// Response Helpers
// =============================================================================

func (s *Server) sendSuccess(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    data,
	})
}

func (s *Server) sendError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{
		Success: false,
		Error: &APIError{
			Code:    code,
			Message: message,
		},
	})
}

// =============================================================================
// Context Helpers
// =============================================================================

// getOrganizationID extracts the organization ID from the request context
func (s *Server) getOrganizationID(r *http.Request) string {
	// Check for API key context first
	if keyInfo, ok := r.Context().Value(apiKeyContextKey).(*APIKeyInfo); ok && keyInfo != nil {
		return keyInfo.OrganizationID
	}
	// Check for user claims context
	if userClaims, ok := r.Context().Value(userContextKey).(*UserClaims); ok && userClaims != nil {
		return userClaims.OrganizationID
	}
	return ""
}

// getUserID extracts the user ID from the request context
func (s *Server) getUserID(r *http.Request) string {
	if userClaims, ok := r.Context().Value(userContextKey).(*UserClaims); ok && userClaims != nil {
		return userClaims.UserID
	}
	return ""
}
