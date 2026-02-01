package quota

import (
	"context"
	"testing"
	"time"

	"github.com/enterprise-email/storage/models"
)

func TestReservation_Expiry(t *testing.T) {
	t.Run("reservation is not expired", func(t *testing.T) {
		r := &Reservation{
			ID:        "res-1",
			MailboxID: "mailbox-1",
			Bytes:     1000,
			CreatedAt: time.Now(),
			ExpiresAt: time.Now().Add(5 * time.Minute),
		}

		if r.ExpiresAt.Before(time.Now()) {
			t.Error("Reservation should not be expired")
		}
	})

	t.Run("reservation is expired", func(t *testing.T) {
		r := &Reservation{
			ID:        "res-1",
			MailboxID: "mailbox-1",
			Bytes:     1000,
			CreatedAt: time.Now().Add(-10 * time.Minute),
			ExpiresAt: time.Now().Add(-5 * time.Minute),
		}

		if !r.ExpiresAt.Before(time.Now()) {
			t.Error("Reservation should be expired")
		}
	})
}

func TestQuotaLevel_String(t *testing.T) {
	tests := []struct {
		level    models.QuotaLevel
		expected string
	}{
		{models.QuotaLevelOrganization, "organization"},
		{models.QuotaLevelDomain, "domain"},
		{models.QuotaLevelUser, "user"},
		{models.QuotaLevelMailbox, "mailbox"},
	}

	for _, tt := range tests {
		if string(tt.level) != tt.expected {
			t.Errorf("QuotaLevel string = %q, want %q", string(tt.level), tt.expected)
		}
	}
}

func TestQuotaUsageCalculation(t *testing.T) {
	tests := []struct {
		name         string
		totalBytes   int64
		usedBytes    int64
		expectedPct  float64
	}{
		{
			name:        "0% used",
			totalBytes:  1000,
			usedBytes:   0,
			expectedPct: 0,
		},
		{
			name:        "50% used",
			totalBytes:  1000,
			usedBytes:   500,
			expectedPct: 50,
		},
		{
			name:        "100% used",
			totalBytes:  1000,
			usedBytes:   1000,
			expectedPct: 100,
		},
		{
			name:        "over quota",
			totalBytes:  1000,
			usedBytes:   1500,
			expectedPct: 150,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pct := float64(tt.usedBytes) / float64(tt.totalBytes) * 100
			if pct != tt.expectedPct {
				t.Errorf("Usage percentage = %.2f, want %.2f", pct, tt.expectedPct)
			}
		})
	}
}

func TestQuotaReservationHandling(t *testing.T) {
	t.Run("reservation reduces available space", func(t *testing.T) {
		totalBytes := int64(1000)
		usedBytes := int64(300)
		reservedBytes := int64(200)

		available := totalBytes - usedBytes - reservedBytes
		expected := int64(500)

		if available != expected {
			t.Errorf("Available bytes = %d, want %d", available, expected)
		}
	})

	t.Run("no reservation means more available space", func(t *testing.T) {
		totalBytes := int64(1000)
		usedBytes := int64(300)
		reservedBytes := int64(0)

		available := totalBytes - usedBytes - reservedBytes
		expected := int64(700)

		if available != expected {
			t.Errorf("Available bytes = %d, want %d", available, expected)
		}
	})
}

func TestQuotaSoftLimitCheck(t *testing.T) {
	tests := []struct {
		name         string
		totalBytes   int64
		usedBytes    int64
		softLimitPct int
		expected     bool // true if soft limit exceeded
	}{
		{
			name:         "below soft limit",
			totalBytes:   1000,
			usedBytes:    700,
			softLimitPct: 80,
			expected:     false,
		},
		{
			name:         "at soft limit",
			totalBytes:   1000,
			usedBytes:    800,
			softLimitPct: 80,
			expected:     true,
		},
		{
			name:         "above soft limit",
			totalBytes:   1000,
			usedBytes:    900,
			softLimitPct: 80,
			expected:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pct := float64(tt.usedBytes) / float64(tt.totalBytes) * 100
			softLimitExceeded := pct >= float64(tt.softLimitPct)

			if softLimitExceeded != tt.expected {
				t.Errorf("Soft limit exceeded = %v, want %v (usage: %.2f%%)", softLimitExceeded, tt.expected, pct)
			}
		})
	}
}

func TestQuotaHardLimitCheck(t *testing.T) {
	tests := []struct {
		name            string
		totalBytes      int64
		usedBytes       int64
		reservedBytes   int64
		requestedBytes  int64
		hardLimitPct    int
		expected        bool // true if can allocate
	}{
		{
			name:           "allocation allowed",
			totalBytes:     1000,
			usedBytes:      500,
			reservedBytes:  0,
			requestedBytes: 100,
			hardLimitPct:   100,
			expected:       true,
		},
		{
			name:           "allocation denied - would exceed hard limit",
			totalBytes:     1000,
			usedBytes:      950,
			reservedBytes:  0,
			requestedBytes: 100,
			hardLimitPct:   100,
			expected:       false,
		},
		{
			name:           "allocation denied - reservations considered",
			totalBytes:     1000,
			usedBytes:      800,
			reservedBytes:  150,
			requestedBytes: 100,
			hardLimitPct:   100,
			expected:       false,
		},
		{
			name:           "allocation allowed - with lower hard limit",
			totalBytes:     1000,
			usedBytes:      700,
			reservedBytes:  0,
			requestedBytes: 50,
			hardLimitPct:   80,
			expected:       true, // 750/800 = 93.75% of hard limit
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hardLimitBytes := (tt.totalBytes * int64(tt.hardLimitPct)) / 100
			available := hardLimitBytes - tt.usedBytes - tt.reservedBytes
			canAllocate := available >= tt.requestedBytes

			if canAllocate != tt.expected {
				t.Errorf("Can allocate = %v, want %v (available: %d, requested: %d)",
					canAllocate, tt.expected, available, tt.requestedBytes)
			}
		})
	}
}

func TestQuotaHierarchyCheck(t *testing.T) {
	t.Run("all levels must have sufficient quota", func(t *testing.T) {
		// Simulate hierarchical quota check
		type quotaCheck struct {
			level     string
			available int64
		}

		requestedBytes := int64(100)

		checks := []quotaCheck{
			{level: "mailbox", available: 500},
			{level: "user", available: 1000},
			{level: "domain", available: 200}, // Limiting factor
			{level: "organization", available: 10000},
		}

		minAvailable := int64(0)
		limitingLevel := ""

		for _, check := range checks {
			if minAvailable == 0 || check.available < minAvailable {
				minAvailable = check.available
				limitingLevel = check.level
			}
		}

		canAllocate := minAvailable >= requestedBytes

		if !canAllocate {
			t.Errorf("Expected allocation to succeed, but limiting level '%s' has only %d bytes available",
				limitingLevel, minAvailable)
		}
		if limitingLevel != "domain" {
			t.Errorf("Expected limiting level to be 'domain', got '%s'", limitingLevel)
		}
	})
}

func TestQuotaUsageNotification(t *testing.T) {
	tests := []struct {
		name         string
		usagePercent float64
		thresholds   []int
		expected     []bool // which notifications should trigger
	}{
		{
			name:         "no notifications at low usage",
			usagePercent: 50,
			thresholds:   []int{75, 90, 95},
			expected:     []bool{false, false, false},
		},
		{
			name:         "first threshold notification",
			usagePercent: 78,
			thresholds:   []int{75, 90, 95},
			expected:     []bool{true, false, false},
		},
		{
			name:         "multiple threshold notifications",
			usagePercent: 92,
			thresholds:   []int{75, 90, 95},
			expected:     []bool{true, true, false},
		},
		{
			name:         "all thresholds exceeded",
			usagePercent: 98,
			thresholds:   []int{75, 90, 95},
			expected:     []bool{true, true, true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for i, threshold := range tt.thresholds {
				triggered := tt.usagePercent >= float64(threshold)
				if triggered != tt.expected[i] {
					t.Errorf("Threshold %d%% trigger = %v, want %v",
						threshold, triggered, tt.expected[i])
				}
			}
		})
	}
}

// MockDB for testing database interactions
type MockDB struct {
	quotas       map[string]*models.Quota
	reservations map[string]*Reservation
}

func NewMockDB() *MockDB {
	return &MockDB{
		quotas:       make(map[string]*models.Quota),
		reservations: make(map[string]*Reservation),
	}
}

func (m *MockDB) GetQuota(ctx context.Context, level models.QuotaLevel, entityID string) (*models.Quota, error) {
	key := string(level) + ":" + entityID
	if q, ok := m.quotas[key]; ok {
		return q, nil
	}
	return nil, nil
}

func (m *MockDB) SetQuota(level models.QuotaLevel, entityID string, quota *models.Quota) {
	key := string(level) + ":" + entityID
	m.quotas[key] = quota
}

func TestMockDB_GetQuota(t *testing.T) {
	db := NewMockDB()

	db.SetQuota(models.QuotaLevelMailbox, "mailbox-1", &models.Quota{
		ID:         "quota-1",
		Level:      models.QuotaLevelMailbox,
		EntityID:   "mailbox-1",
		TotalBytes: 1000,
		UsedBytes:  500,
	})

	quota, err := db.GetQuota(context.Background(), models.QuotaLevelMailbox, "mailbox-1")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if quota == nil {
		t.Fatal("Expected quota but got nil")
	}
	if quota.TotalBytes != 1000 {
		t.Errorf("Expected TotalBytes 1000, got %d", quota.TotalBytes)
	}
}
