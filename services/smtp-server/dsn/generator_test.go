package dsn

import (
	"strings"
	"testing"
	"time"
)

func TestGenerator_Generate(t *testing.T) {
	g := NewGenerator("mail.example.com")

	tests := []struct {
		name           string
		opts           GenerateOptions
		expectSubject  string
		expectMIME     bool
		expectContains []string
	}{
		{
			name: "hard bounce DSN",
			opts: GenerateOptions{
				OriginalSender:    "sender@external.com",
				OriginalMessageID: "<original-123@external.com>",
				ArrivalDate:       time.Now().Add(-1 * time.Hour),
				Recipients: []RecipientStatus{
					{
						FinalRecipient: "unknown@example.com",
						Action:         ActionFailed,
						Status:         StatusBadDestMailbox.String(),
						BounceType:     BounceHard,
						DiagnosticCode: "550 5.1.1 User unknown",
						RemoteMTA:      "mail.example.com",
					},
				},
				OriginalHeaders: "From: sender@external.com\r\nTo: unknown@example.com\r\nSubject: Test",
			},
			expectSubject: "Undelivered Mail Returned to Sender",
			expectMIME:    true,
			expectContains: []string{
				"multipart/report",
				"delivery-status",
				"Final-Recipient: rfc822; unknown@example.com",
				"Action: failed",
				"Status: 5.1.1",
				"550 5.1.1 User unknown",
				"MAILER-DAEMON@mail.example.com",
			},
		},
		{
			name: "soft bounce (delayed) DSN",
			opts: GenerateOptions{
				OriginalSender:    "sender@external.com",
				OriginalMessageID: "<original-456@external.com>",
				ArrivalDate:       time.Now().Add(-30 * time.Minute),
				Recipients: []RecipientStatus{
					{
						FinalRecipient:  "busy@example.com",
						Action:          ActionDelayed,
						Status:          StatusTempMailboxFull.String(),
						BounceType:      BounceSoft,
						DiagnosticCode:  "452 4.2.2 Mailbox full",
						RemoteMTA:       "mail.example.com",
						LastAttemptDate: time.Now().Add(-5 * time.Minute),
					},
				},
				OriginalHeaders: "From: sender@external.com\r\nTo: busy@example.com\r\nSubject: Test",
			},
			expectSubject: "Delayed Mail (still being retried)",
			expectMIME:    true,
			expectContains: []string{
				"multipart/report",
				"Action: delayed",
				"Status: 4.2.2",
				"452 4.2.2 Mailbox full",
				"still being retried",
			},
		},
		{
			name: "multiple recipients",
			opts: GenerateOptions{
				OriginalSender:    "sender@external.com",
				OriginalMessageID: "<original-789@external.com>",
				ArrivalDate:       time.Now().Add(-2 * time.Hour),
				Recipients: []RecipientStatus{
					{
						FinalRecipient: "user1@example.com",
						Action:         ActionFailed,
						Status:         StatusBadDestMailbox.String(),
						DiagnosticCode: "550 User not found",
					},
					{
						FinalRecipient: "user2@example.com",
						Action:         ActionFailed,
						Status:         StatusMailboxFull.String(),
						DiagnosticCode: "552 Mailbox full",
					},
				},
				OriginalHeaders: "From: sender@external.com\r\nSubject: Test",
			},
			expectSubject: "Undelivered Mail Returned to Sender",
			expectContains: []string{
				"Final-Recipient: rfc822; user1@example.com",
				"Final-Recipient: rfc822; user2@example.com",
				"Status: 5.1.1",
				"Status: 5.2.2",
			},
		},
		{
			name: "with envelope ID",
			opts: GenerateOptions{
				OriginalSender:     "sender@external.com",
				OriginalMessageID:  "<original-abc@external.com>",
				OriginalEnvelopeID: "ENV123456",
				ArrivalDate:        time.Now(),
				Recipients: []RecipientStatus{
					{
						FinalRecipient: "test@example.com",
						Action:         ActionFailed,
						Status:         StatusBadDestMailbox.String(),
					},
				},
			},
			expectContains: []string{
				"Original-Envelope-ID: ENV123456",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := g.Generate(tt.opts)
			if err != nil {
				t.Fatalf("Generate failed: %v", err)
			}

			content := string(data)

			// Check subject
			if tt.expectSubject != "" && !strings.Contains(content, "Subject: "+tt.expectSubject) {
				t.Errorf("Expected subject '%s' not found in DSN", tt.expectSubject)
			}

			// Check MIME structure
			if tt.expectMIME && !strings.Contains(content, "MIME-Version: 1.0") {
				t.Error("Expected MIME-Version header not found")
			}

			// Check required content
			for _, expected := range tt.expectContains {
				if !strings.Contains(content, expected) {
					t.Errorf("Expected content '%s' not found in DSN:\n%s", expected, content)
				}
			}

			// Verify DSN structure
			if !strings.Contains(content, "Content-Type: multipart/report") {
				t.Error("DSN should have multipart/report content type")
			}
			if !strings.Contains(content, "message/delivery-status") {
				t.Error("DSN should contain message/delivery-status part")
			}
		})
	}
}

func TestClassifyStatus(t *testing.T) {
	tests := []struct {
		smtpCode    int
		message     string
		expectCode  StatusCode
		expectType  BounceType
	}{
		{550, "User unknown", StatusBadDestMailbox, BounceHard},
		{550, "Mailbox not found", StatusBadDestMailbox, BounceHard},
		{550, "Message rejected as spam", StatusSecurityRejection, BouncePolicy},
		{551, "User moved", StatusDestNoLongerAccept, BounceHard},
		{552, "Over quota", StatusMailboxFull, BounceHard},
		{552, "Message too large", StatusMessageTooLarge, BounceHard},
		{553, "Bad address syntax", StatusBadDestSyntax, BounceHard},
		{554, "Transaction failed", StatusSecurityRejection, BouncePolicy},
		{421, "Service unavailable", StatusTempSystemNotAccept, BounceSoft},
		{450, "Try again later", StatusTempMailboxUnavail, BounceSoft},
		{451, "Local error", StatusTempSystemFull, BounceSoft},
		{452, "Quota exceeded", StatusTempMailboxFull, BounceSoft},
		{500, "Unknown error", StatusCode{5, 0, 0}, BounceHard},
		{400, "Unknown temp error", StatusCode{4, 0, 0}, BounceSoft},
		{250, "OK", StatusSuccess, ""},
	}

	for _, tt := range tests {
		t.Run(tt.message, func(t *testing.T) {
			code, bounceType := ClassifyStatus(tt.smtpCode, tt.message)
			if code != tt.expectCode {
				t.Errorf("ClassifyStatus(%d, %s) code = %v, expected %v", tt.smtpCode, tt.message, code, tt.expectCode)
			}
			if bounceType != tt.expectType {
				t.Errorf("ClassifyStatus(%d, %s) type = %v, expected %v", tt.smtpCode, tt.message, bounceType, tt.expectType)
			}
		})
	}
}

func TestStatusCode_String(t *testing.T) {
	tests := []struct {
		code     StatusCode
		expected string
	}{
		{StatusBadDestMailbox, "5.1.1"},
		{StatusMailboxFull, "5.2.2"},
		{StatusTempMailboxFull, "4.2.2"},
		{StatusSuccess, "2.0.0"},
	}

	for _, tt := range tests {
		if got := tt.code.String(); got != tt.expected {
			t.Errorf("StatusCode.String() = %s, expected %s", got, tt.expected)
		}
	}
}

func TestStatusCode_Classification(t *testing.T) {
	t.Run("IsPermanent", func(t *testing.T) {
		if !StatusBadDestMailbox.IsPermanent() {
			t.Error("5.1.1 should be permanent")
		}
		if StatusTempMailboxFull.IsPermanent() {
			t.Error("4.2.2 should not be permanent")
		}
	})

	t.Run("IsTemporary", func(t *testing.T) {
		if !StatusTempMailboxFull.IsTemporary() {
			t.Error("4.2.2 should be temporary")
		}
		if StatusBadDestMailbox.IsTemporary() {
			t.Error("5.1.1 should not be temporary")
		}
	})

	t.Run("IsSuccess", func(t *testing.T) {
		if !StatusSuccess.IsSuccess() {
			t.Error("2.0.0 should be success")
		}
		if StatusBadDestMailbox.IsSuccess() {
			t.Error("5.1.1 should not be success")
		}
	})
}
