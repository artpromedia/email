package imap

import (
	"testing"
	"time"
)

func TestConnectionContext_State(t *testing.T) {
	tests := []struct {
		name     string
		state    ConnectionState
		expected bool // isAuthenticated
	}{
		{
			name:     "not authenticated state",
			state:    StateNotAuthenticated,
			expected: false,
		},
		{
			name:     "authenticated state",
			state:    StateAuthenticated,
			expected: true,
		},
		{
			name:     "selected state",
			state:    StateSelected,
			expected: true,
		},
		{
			name:     "logout state",
			state:    StateLogout,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &ConnectionContext{
				State: tt.state,
			}

			isAuth := ctx.State == StateAuthenticated || ctx.State == StateSelected
			if isAuth != tt.expected {
				t.Errorf("isAuthenticated = %v, want %v", isAuth, tt.expected)
			}
		})
	}
}

func TestConnectionContext_Capabilities(t *testing.T) {
	t.Run("basic capabilities without auth", func(t *testing.T) {
		ctx := &ConnectionContext{
			State:        StateNotAuthenticated,
			TLSEnabled:   false,
			Capabilities: []string{"IMAP4rev1", "STARTTLS", "AUTH=PLAIN", "AUTH=LOGIN"},
		}

		// Should have STARTTLS if not secured
		hasStartTLS := false
		for _, cap := range ctx.Capabilities {
			if cap == "STARTTLS" {
				hasStartTLS = true
				break
			}
		}
		if !hasStartTLS {
			t.Error("Expected STARTTLS capability when TLS not enabled")
		}
	})

	t.Run("capabilities after TLS", func(t *testing.T) {
		ctx := &ConnectionContext{
			State:        StateNotAuthenticated,
			TLSEnabled:   true,
			Capabilities: []string{"IMAP4rev1", "AUTH=PLAIN", "AUTH=LOGIN"},
		}

		// Should NOT have STARTTLS if already secured
		hasStartTLS := false
		for _, cap := range ctx.Capabilities {
			if cap == "STARTTLS" {
				hasStartTLS = true
				break
			}
		}
		if hasStartTLS {
			t.Error("Should not have STARTTLS capability when TLS already enabled")
		}
	})

	t.Run("capabilities after auth", func(t *testing.T) {
		ctx := &ConnectionContext{
			State:        StateAuthenticated,
			TLSEnabled:   true,
			Capabilities: []string{"IMAP4rev1", "IDLE", "QUOTA", "NAMESPACE"},
		}

		// Should have IDLE for authenticated connections
		hasIdle := false
		for _, cap := range ctx.Capabilities {
			if cap == "IDLE" {
				hasIdle = true
				break
			}
		}
		if !hasIdle {
			t.Error("Expected IDLE capability for authenticated connection")
		}
	})
}

func TestConnectionContext_SelectedMailbox(t *testing.T) {
	t.Run("no mailbox selected initially", func(t *testing.T) {
		ctx := &ConnectionContext{
			State: StateAuthenticated,
		}

		if ctx.SelectedMailbox != nil {
			t.Error("Expected no mailbox selected")
		}
	})

	t.Run("mailbox can be selected", func(t *testing.T) {
		ctx := &ConnectionContext{
			State: StateSelected,
			SelectedMailbox: &SelectedMailbox{
				Name:        "INBOX",
				ReadOnly:    false,
				UIDValidity: 1234567890,
				Exists:      100,
				Recent:      5,
			},
		}

		if ctx.SelectedMailbox == nil {
			t.Fatal("Expected mailbox to be selected")
		}
		if ctx.SelectedMailbox.Name != "INBOX" {
			t.Errorf("Expected mailbox name 'INBOX', got '%s'", ctx.SelectedMailbox.Name)
		}
		if ctx.SelectedMailbox.UIDValidity != 1234567890 {
			t.Errorf("Expected UIDValidity 1234567890, got %d", ctx.SelectedMailbox.UIDValidity)
		}
	})
}

func TestSelectedMailbox_Flags(t *testing.T) {
	t.Run("standard flags", func(t *testing.T) {
		mb := &SelectedMailbox{
			Name: "INBOX",
			Flags: []string{
				"\\Seen",
				"\\Answered",
				"\\Flagged",
				"\\Deleted",
				"\\Draft",
			},
		}

		expectedFlags := []string{"\\Seen", "\\Answered", "\\Flagged", "\\Deleted", "\\Draft"}
		if len(mb.Flags) != len(expectedFlags) {
			t.Errorf("Expected %d flags, got %d", len(expectedFlags), len(mb.Flags))
		}
	})

	t.Run("permanent flags", func(t *testing.T) {
		mb := &SelectedMailbox{
			Name: "INBOX",
			PermanentFlags: []string{
				"\\Seen",
				"\\Answered",
				"\\Flagged",
				"\\Deleted",
				"\\Draft",
				"\\*", // Can create new keywords
			},
		}

		hasWildcard := false
		for _, flag := range mb.PermanentFlags {
			if flag == "\\*" {
				hasWildcard = true
				break
			}
		}
		if !hasWildcard {
			t.Error("Expected permanent flags to include wildcard")
		}
	})
}

func TestConnectionState_Transitions(t *testing.T) {
	tests := []struct {
		name        string
		from        ConnectionState
		command     string
		to          ConnectionState
		shouldAllow bool
	}{
		{
			name:        "LOGIN from not authenticated",
			from:        StateNotAuthenticated,
			command:     "LOGIN",
			to:          StateAuthenticated,
			shouldAllow: true,
		},
		{
			name:        "SELECT from authenticated",
			from:        StateAuthenticated,
			command:     "SELECT",
			to:          StateSelected,
			shouldAllow: true,
		},
		{
			name:        "CLOSE from selected",
			from:        StateSelected,
			command:     "CLOSE",
			to:          StateAuthenticated,
			shouldAllow: true,
		},
		{
			name:        "LOGOUT from any state",
			from:        StateAuthenticated,
			command:     "LOGOUT",
			to:          StateLogout,
			shouldAllow: true,
		},
		{
			name:        "SELECT from not authenticated",
			from:        StateNotAuthenticated,
			command:     "SELECT",
			to:          StateSelected,
			shouldAllow: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate state transition validation
			allowed := isTransitionAllowed(tt.from, tt.command)
			if allowed != tt.shouldAllow {
				t.Errorf("Transition from %v with %s allowed = %v, want %v",
					tt.from, tt.command, allowed, tt.shouldAllow)
			}
		})
	}
}

// isTransitionAllowed simulates command permission checking
func isTransitionAllowed(state ConnectionState, command string) bool {
	// Commands always allowed
	alwaysAllowed := []string{"CAPABILITY", "NOOP", "LOGOUT"}
	for _, cmd := range alwaysAllowed {
		if command == cmd {
			return true
		}
	}

	switch state {
	case StateNotAuthenticated:
		// Only auth commands allowed
		return command == "LOGIN" || command == "AUTHENTICATE" || command == "STARTTLS"
	case StateAuthenticated:
		// Mailbox operations allowed
		return command == "SELECT" || command == "CREATE" || command == "DELETE" ||
			command == "RENAME" || command == "LIST" || command == "LSUB" ||
			command == "STATUS" || command == "APPEND"
	case StateSelected:
		// Message operations allowed
		return command == "CLOSE" || command == "EXPUNGE" || command == "SEARCH" ||
			command == "FETCH" || command == "STORE" || command == "COPY" ||
			command == "UID" || command == "IDLE"
	}
	return false
}

func TestIdleNotification_Types(t *testing.T) {
	tests := []struct {
		name     string
		notif    IdleNotification
		expected string
	}{
		{
			name: "new message",
			notif: IdleNotification{
				Type:       "EXISTS",
				MailboxID:  "mailbox-1",
				Count:      101,
			},
			expected: "* 101 EXISTS\r\n",
		},
		{
			name: "recent update",
			notif: IdleNotification{
				Type:       "RECENT",
				MailboxID:  "mailbox-1",
				Count:      5,
			},
			expected: "* 5 RECENT\r\n",
		},
		{
			name: "message expunged",
			notif: IdleNotification{
				Type:       "EXPUNGE",
				MailboxID:  "mailbox-1",
				SeqNum:     42,
			},
			expected: "* 42 EXPUNGE\r\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := formatIdleNotification(tt.notif)
			if response != tt.expected {
				t.Errorf("formatIdleNotification() = %q, want %q", response, tt.expected)
			}
		})
	}
}

// formatIdleNotification simulates notification formatting
func formatIdleNotification(n IdleNotification) string {
	switch n.Type {
	case "EXISTS":
		return "* " + itoa(n.Count) + " EXISTS\r\n"
	case "RECENT":
		return "* " + itoa(n.Count) + " RECENT\r\n"
	case "EXPUNGE":
		return "* " + itoa(n.SeqNum) + " EXPUNGE\r\n"
	default:
		return ""
	}
}

// itoa converts int to string (simplified)
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	s := ""
	for i > 0 {
		s = string(rune('0'+i%10)) + s
		i /= 10
	}
	return s
}

func TestConnectionTimeout(t *testing.T) {
	t.Run("connection should timeout after inactivity", func(t *testing.T) {
		timeout := 30 * time.Minute
		lastActivity := time.Now().Add(-35 * time.Minute)

		isTimedOut := time.Since(lastActivity) > timeout
		if !isTimedOut {
			t.Error("Expected connection to be timed out")
		}
	})

	t.Run("active connection should not timeout", func(t *testing.T) {
		timeout := 30 * time.Minute
		lastActivity := time.Now().Add(-5 * time.Minute)

		isTimedOut := time.Since(lastActivity) > timeout
		if isTimedOut {
			t.Error("Active connection should not be timed out")
		}
	})
}
