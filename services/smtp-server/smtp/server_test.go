package smtp

import (
	"testing"
)

func TestExtractDomain(t *testing.T) {
	tests := []struct {
		name     string
		email    string
		expected string
	}{
		{
			name:     "valid email",
			email:    "user@example.com",
			expected: "example.com",
		},
		{
			name:     "valid email with subdomain",
			email:    "user@mail.example.com",
			expected: "mail.example.com",
		},
		{
			name:     "uppercase domain",
			email:    "user@EXAMPLE.COM",
			expected: "example.com",
		},
		{
			name:     "mixed case domain",
			email:    "user@ExAmPlE.CoM",
			expected: "example.com",
		},
		{
			name:     "invalid email - no at symbol",
			email:    "userexample.com",
			expected: "",
		},
		{
			name:     "invalid email - multiple at symbols",
			email:    "user@domain@example.com",
			expected: "",
		},
		{
			name:     "invalid email - empty string",
			email:    "",
			expected: "",
		},
		{
			name:     "invalid email - only at symbol",
			email:    "@",
			expected: "",
		},
		{
			name:     "email with plus addressing",
			email:    "user+tag@example.com",
			expected: "example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractDomain(tt.email)
			if result != tt.expected {
				t.Errorf("extractDomain(%q) = %q, want %q", tt.email, result, tt.expected)
			}
		})
	}
}

func TestSession_Reset(t *testing.T) {
	session := &Session{
		from:             "sender@example.com",
		fromDomain:       "example.com",
		recipients:       []string{"rcpt1@example.com", "rcpt2@example.com"},
		recipientDomains: map[string]bool{"example.com": true},
	}

	session.Reset()

	if session.from != "" {
		t.Errorf("Reset() did not clear from, got %q", session.from)
	}
	if session.fromDomain != "" {
		t.Errorf("Reset() did not clear fromDomain, got %q", session.fromDomain)
	}
	if session.recipients != nil {
		t.Errorf("Reset() did not clear recipients, got %v", session.recipients)
	}
	if session.recipientDomains == nil {
		t.Error("Reset() should initialize recipientDomains to empty map, not nil")
	}
	if len(session.recipientDomains) != 0 {
		t.Errorf("Reset() did not clear recipientDomains, got %v", session.recipientDomains)
	}
}

func TestSession_AuthMechanisms(t *testing.T) {
	session := &Session{}
	mechanisms := session.AuthMechanisms()

	expected := []string{"PLAIN", "LOGIN"}
	if len(mechanisms) != len(expected) {
		t.Fatalf("AuthMechanisms() returned %d mechanisms, want %d", len(mechanisms), len(expected))
	}

	for i, mech := range mechanisms {
		if mech != expected[i] {
			t.Errorf("AuthMechanisms()[%d] = %q, want %q", i, mech, expected[i])
		}
	}
}

func TestMetrics_NewMetrics(t *testing.T) {
	metrics := NewMetrics()

	if metrics == nil {
		t.Fatal("NewMetrics() returned nil")
	}

	// Verify all metrics are initialized
	if metrics.ConnectionsTotal == nil {
		t.Error("ConnectionsTotal metric not initialized")
	}
	if metrics.ConnectionsActive == nil {
		t.Error("ConnectionsActive metric not initialized")
	}
	if metrics.SessionDuration == nil {
		t.Error("SessionDuration metric not initialized")
	}
	if metrics.MessagesReceived == nil {
		t.Error("MessagesReceived metric not initialized")
	}
	if metrics.MessagesSent == nil {
		t.Error("MessagesSent metric not initialized")
	}
	if metrics.MessagesRejected == nil {
		t.Error("MessagesRejected metric not initialized")
	}
	if metrics.MessageSize == nil {
		t.Error("MessageSize metric not initialized")
	}
	if metrics.DeliveryDuration == nil {
		t.Error("DeliveryDuration metric not initialized")
	}
	if metrics.SPFResults == nil {
		t.Error("SPFResults metric not initialized")
	}
	if metrics.DKIMResults == nil {
		t.Error("DKIMResults metric not initialized")
	}
	if metrics.DMARCResults == nil {
		t.Error("DMARCResults metric not initialized")
	}
	if metrics.QueueSize == nil {
		t.Error("QueueSize metric not initialized")
	}
}

func TestMetrics_Increment(t *testing.T) {
	metrics := NewMetrics()

	// Test that metrics can be incremented without panicking
	t.Run("ConnectionsTotal", func(t *testing.T) {
		defer func() {
			if r := recover(); r != nil {
				t.Errorf("ConnectionsTotal.Inc() panicked: %v", r)
			}
		}()
		metrics.ConnectionsTotal.Inc()
	})

	t.Run("ConnectionsActive", func(t *testing.T) {
		defer func() {
			if r := recover(); r != nil {
				t.Errorf("ConnectionsActive operations panicked: %v", r)
			}
		}()
		metrics.ConnectionsActive.Inc()
		metrics.ConnectionsActive.Dec()
	})

	t.Run("MessagesReceived", func(t *testing.T) {
		defer func() {
			if r := recover(); r != nil {
				t.Errorf("MessagesReceived.Inc() panicked: %v", r)
			}
		}()
		metrics.MessagesReceived.WithLabelValues("example.com").Inc()
	})

	t.Run("SPFResults", func(t *testing.T) {
		defer func() {
			if r := recover(); r != nil {
				t.Errorf("SPFResults.Inc() panicked: %v", r)
			}
		}()
		metrics.SPFResults.WithLabelValues("example.com", "pass").Inc()
	})
}
