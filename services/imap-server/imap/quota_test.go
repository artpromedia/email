package imap

import (
	"testing"
)

func TestParseQuotaLimits(t *testing.T) {
	tests := []struct {
		name     string
		args     string
		expected map[string]int64
	}{
		{
			name:     "storage only",
			args:     `"user" (STORAGE 1000000)`,
			expected: map[string]int64{"STORAGE": 1000000},
		},
		{
			name:     "storage and message",
			args:     `"user" (STORAGE 1000000 MESSAGE 10000)`,
			expected: map[string]int64{"STORAGE": 1000000, "MESSAGE": 10000},
		},
		{
			name:     "empty parentheses",
			args:     `"user" ()`,
			expected: map[string]int64{},
		},
		{
			name:     "no parentheses",
			args:     `"user"`,
			expected: map[string]int64{},
		},
		{
			name:     "lowercase resource type",
			args:     `"user" (storage 500000)`,
			expected: map[string]int64{"STORAGE": 500000},
		},
		{
			name:     "multiple resources",
			args:     `"domain" (STORAGE 10000000 MESSAGE 50000)`,
			expected: map[string]int64{"STORAGE": 10000000, "MESSAGE": 50000},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseQuotaLimits(tt.args)
			if len(result) != len(tt.expected) {
				t.Fatalf("parseQuotaLimits(%q) returned %d items, want %d",
					tt.args, len(result), len(tt.expected))
			}
			for key, expectedVal := range tt.expected {
				if result[key] != expectedVal {
					t.Errorf("parseQuotaLimits(%q)[%q] = %d, want %d",
						tt.args, key, result[key], expectedVal)
				}
			}
		})
	}
}

func TestQuotaWarning_Fields(t *testing.T) {
	warning := QuotaWarning{
		MailboxID:    "mailbox-123",
		MailboxName:  "user@example.com",
		ResourceType: "STORAGE",
		UsagePercent: 95,
		Used:         950000000,
		Limit:        1000000000,
	}

	if warning.MailboxID != "mailbox-123" {
		t.Errorf("MailboxID = %q, want %q", warning.MailboxID, "mailbox-123")
	}
	if warning.MailboxName != "user@example.com" {
		t.Errorf("MailboxName = %q, want %q", warning.MailboxName, "user@example.com")
	}
	if warning.ResourceType != "STORAGE" {
		t.Errorf("ResourceType = %q, want %q", warning.ResourceType, "STORAGE")
	}
	if warning.UsagePercent != 95 {
		t.Errorf("UsagePercent = %d, want %d", warning.UsagePercent, 95)
	}
	if warning.Used != 950000000 {
		t.Errorf("Used = %d, want %d", warning.Used, 950000000)
	}
	if warning.Limit != 1000000000 {
		t.Errorf("Limit = %d, want %d", warning.Limit, 1000000000)
	}
}

func TestQuota_Fields(t *testing.T) {
	quota := Quota{
		MailboxID:    "mailbox-123",
		DomainName:   "example.com",
		ResourceName: "STORAGE",
		Usage:        500000,
		Limit:        1000000,
	}

	if quota.MailboxID != "mailbox-123" {
		t.Errorf("MailboxID = %q, want %q", quota.MailboxID, "mailbox-123")
	}
	if quota.DomainName != "example.com" {
		t.Errorf("DomainName = %q, want %q", quota.DomainName, "example.com")
	}
	if quota.ResourceName != "STORAGE" {
		t.Errorf("ResourceName = %q, want %q", quota.ResourceName, "STORAGE")
	}
	if quota.Usage != 500000 {
		t.Errorf("Usage = %d, want %d", quota.Usage, 500000)
	}
	if quota.Limit != 1000000 {
		t.Errorf("Limit = %d, want %d", quota.Limit, 1000000)
	}

	// Test usage percentage calculation
	usagePercent := int((quota.Usage * 100) / quota.Limit)
	if usagePercent != 50 {
		t.Errorf("Usage percentage = %d%%, want 50%%", usagePercent)
	}
}
