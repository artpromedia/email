// Package service provides email sending functionality.
package service

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"fmt"
	"net/smtp"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
)

// EmailService handles email sending operations.
type EmailService struct {
	config *config.EmailConfig
}

// NewEmailService creates a new EmailService.
func NewEmailService(cfg *config.EmailConfig) *EmailService {
	return &EmailService{
		config: cfg,
	}
}

// EmailParams holds parameters for sending an email.
type EmailParams struct {
	To       []string
	Subject  string
	HTMLBody string
	TextBody string
}

// Send sends an email.
func (s *EmailService) Send(params EmailParams) error {
	if s.config.SMTPHost == "" {
		// If SMTP is not configured, log and return (useful for development)
		fmt.Printf("Email not sent (SMTP not configured): To=%v Subject=%s\n", params.To, params.Subject)
		return nil
	}

	// Prepare headers
	msgID := generateMessageID(s.config.FromAddress)
	headers := make(map[string]string)
	headers["From"] = fmt.Sprintf("%s <%s>", s.config.FromName, s.config.FromAddress)
	headers["To"] = strings.Join(params.To, ", ")
	headers["Subject"] = params.Subject
	headers["Date"] = time.Now().Format(time.RFC1123Z)
	headers["Message-ID"] = msgID
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"

	// Build message
	var msg bytes.Buffer
	for k, v := range headers {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")
	msg.WriteString(params.HTMLBody)

	// Connect to SMTP server
	addr := fmt.Sprintf("%s:%d", s.config.SMTPHost, s.config.SMTPPort)

	var auth smtp.Auth
	if s.config.SMTPUser != "" {
		auth = smtp.PlainAuth("", s.config.SMTPUser, s.config.SMTPPassword, s.config.SMTPHost)
	}

	// For TLS connections (port 465)
	if s.config.SMTPPort == 465 {
		return s.sendTLS(addr, auth, params.To, msg.Bytes())
	}

	// For STARTTLS connections (port 587) or internal relay (port 25)
	// Use custom client to handle self-signed certs on internal Docker network
	return s.sendSTARTTLS(addr, auth, params.To, msg.Bytes())
}

func (s *EmailService) sendSTARTTLS(addr string, auth smtp.Auth, to []string, msg []byte) error {
	client, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server %s: %w", addr, err)
	}
	defer client.Close()

	// Send EHLO
	if err := client.Hello("localhost"); err != nil {
		return fmt.Errorf("SMTP HELLO failed: %w", err)
	}

	// Try STARTTLS if available (skip cert verification for internal relay)
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{
			ServerName:         s.config.SMTPHost,
			InsecureSkipVerify: true, // Internal Docker network relay
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			// Log but continue without TLS for internal connections
			fmt.Printf("STARTTLS failed (continuing without TLS): %v\n", err)
		}
	}

	// Auth if credentials provided
	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP auth failed: %w", err)
		}
	}

	// Set sender
	if err := client.Mail(s.config.FromAddress); err != nil {
		return fmt.Errorf("SMTP MAIL FROM failed: %w", err)
	}

	// Set recipients
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("SMTP RCPT TO <%s> failed: %w", rcpt, err)
		}
	}

	// Send message body
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA failed: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("failed to close data writer: %w", err)
	}

	return client.Quit()
}

func (s *EmailService) sendTLS(addr string, auth smtp.Auth, to []string, msg []byte) error {
	// Connect with TLS
	tlsConfig := &tls.Config{
		ServerName: s.config.SMTPHost,
	}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.config.SMTPHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP auth failed: %w", err)
		}
	}

	if err := client.Mail(s.config.FromAddress); err != nil {
		return fmt.Errorf("SMTP MAIL failed: %w", err)
	}

	for _, addr := range to {
		if err := client.Rcpt(addr); err != nil {
			return fmt.Errorf("SMTP RCPT failed: %w", err)
		}
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA failed: %w", err)
	}

	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}

	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close writer: %w", err)
	}

	return client.Quit()
}

// SendVerificationEmail sends an email verification link.
func (s *EmailService) SendVerificationEmail(to, displayName, verificationToken string) error {
	verificationURL := fmt.Sprintf("%s?token=%s", s.config.VerificationURL, verificationToken)

	htmlBody := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%%, #764ba2 100%%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Email Verification</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p>Hi %s,</p>
        <p>Thank you for registering! Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="%s" style="background: #667eea; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="background: #e9e9e9; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 14px;">%s</p>
        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
    </div>
</body>
</html>
`, displayName, verificationURL, verificationURL)

	return s.Send(EmailParams{
		To:       []string{to},
		Subject:  "Verify Your Email Address",
		HTMLBody: htmlBody,
	})
}

// SendPasswordResetEmail sends a password reset link.
func (s *EmailService) SendPasswordResetEmail(to, displayName, resetToken string, resetURL string) error {
	fullResetURL := fmt.Sprintf("%s?token=%s", resetURL, resetToken)

	htmlBody := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset Your Password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f093fb 0%%, #f5576c 100%%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Password Reset</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p>Hi %s,</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="%s" style="background: #f5576c; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="background: #e9e9e9; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 14px;">%s</p>
        <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
    </div>
</body>
</html>
`, displayName, fullResetURL, fullResetURL)

	return s.Send(EmailParams{
		To:       []string{to},
		Subject:  "Reset Your Password",
		HTMLBody: htmlBody,
	})
}

// SendWelcomeEmail sends a welcome email after registration.
func (s *EmailService) SendWelcomeEmail(to, displayName, orgName string) error {
	htmlBody := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Welcome!</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #11998e 0%%, #38ef7d 100%%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Welcome to %s!</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p>Hi %s,</p>
        <p>Welcome to your new email account! Your account has been successfully set up and you're ready to start using our email service.</p>
        <p>Here are some things you can do:</p>
        <ul>
            <li>Set up email clients on your devices</li>
            <li>Configure your email signature</li>
            <li>Enable two-factor authentication for added security</li>
            <li>Explore our AI-powered features</li>
        </ul>
        <p>If you have any questions, our support team is here to help.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">This is an automated message. Please do not reply directly to this email.</p>
    </div>
</body>
</html>
`, orgName, displayName)

	return s.Send(EmailParams{
		To:       []string{to},
		Subject:  fmt.Sprintf("Welcome to %s!", orgName),
		HTMLBody: htmlBody,
	})
}

// generateMessageID creates a unique Message-ID for email headers.
func generateMessageID(fromAddress string) string {
	b := make([]byte, 16)
	rand.Read(b)
	domain := "oonrumail.com"
	parts := strings.Split(fromAddress, "@")
	if len(parts) == 2 {
		domain = parts[1]
	}
	return fmt.Sprintf("<%x.%x@%s>", b[:8], time.Now().UnixNano(), domain)
}
