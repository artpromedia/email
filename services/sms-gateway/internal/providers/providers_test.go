package providers

import (
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestProviderManager(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	// Test empty manager
	t.Run("empty manager returns error", func(t *testing.T) {
		_, err := manager.GetBest()
		if err != ErrNoProvidersAvailable {
			t.Errorf("expected ErrNoProvidersAvailable, got %v", err)
		}
	})

	// Register mock providers
	mock1 := &MockProvider{name: "mock1", healthy: true}
	mock2 := &MockProvider{name: "mock2", healthy: true}

	manager.Register("mock1", mock1, 1)
	manager.Register("mock2", mock2, 2)

	t.Run("list providers", func(t *testing.T) {
		providers := manager.ListProviders()
		if len(providers) != 2 {
			t.Errorf("expected 2 providers, got %d", len(providers))
		}
	})

	t.Run("get specific provider", func(t *testing.T) {
		p, err := manager.Get("mock1")
		if err != nil {
			t.Fatalf("Get failed: %v", err)
		}
		if p.Name() != "mock1" {
			t.Errorf("expected mock1, got %s", p.Name())
		}
	})

	t.Run("get best provider returns highest priority", func(t *testing.T) {
		p, err := manager.GetBest()
		if err != nil {
			t.Fatalf("GetBest failed: %v", err)
		}
		if p.Name() != "mock1" {
			t.Errorf("expected mock1 (priority 1), got %s", p.Name())
		}
	})

	t.Run("get non-existent provider", func(t *testing.T) {
		_, err := manager.Get("nonexistent")
		if err != ErrProviderNotFound {
			t.Errorf("expected ErrProviderNotFound, got %v", err)
		}
	})

	t.Run("provider status", func(t *testing.T) {
		status := manager.GetProviderStatus()
		if !status["mock1"] || !status["mock2"] {
			t.Errorf("expected all providers healthy")
		}
	})

	t.Run("unregister provider", func(t *testing.T) {
		manager.Unregister("mock2")
		providers := manager.ListProviders()
		if len(providers) != 1 {
			t.Errorf("expected 1 provider after unregister, got %d", len(providers))
		}
	})
}

func TestDeliveryStatusMapping(t *testing.T) {
	tests := []struct {
		status   DeliveryStatus
		expected string
	}{
		{DeliveryStatusPending, "pending"},
		{DeliveryStatusQueued, "queued"},
		{DeliveryStatusSent, "sent"},
		{DeliveryStatusDelivered, "delivered"},
		{DeliveryStatusFailed, "failed"},
		{DeliveryStatusExpired, "expired"},
		{DeliveryStatusRejected, "rejected"},
		{DeliveryStatusUnknown, "unknown"},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			if string(tt.status) != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, string(tt.status))
			}
		})
	}
}

func TestMessageTypeConstants(t *testing.T) {
	tests := []struct {
		msgType  MessageType
		expected string
	}{
		{MessageTypeTransactional, "transactional"},
		{MessageTypePromotional, "promotional"},
		{MessageTypeOTP, "otp"},
	}

	for _, tt := range tests {
		t.Run(string(tt.msgType), func(t *testing.T) {
			if string(tt.msgType) != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, string(tt.msgType))
			}
		})
	}
}

// MockProvider implements Provider interface for testing
type MockProvider struct {
	name    string
	healthy bool
	sendErr error
}

func (m *MockProvider) Name() string {
	return m.name
}

func (m *MockProvider) Send(ctx context.Context, req *SendRequest) (*SendResponse, error) {
	if m.sendErr != nil {
		return nil, m.sendErr
	}
	return &SendResponse{
		MessageID:    "mock-msg-id",
		ProviderID:   "mock-provider-id",
		Provider:     m.name,
		Status:       DeliveryStatusQueued,
		SegmentCount: 1,
		SentAt:       time.Now(),
	}, nil
}

func (m *MockProvider) SendBulk(ctx context.Context, requests []*SendRequest) ([]*SendResponse, error) {
	responses := make([]*SendResponse, len(requests))
	for i := range requests {
		resp, _ := m.Send(ctx, requests[i])
		responses[i] = resp
	}
	return responses, nil
}

func (m *MockProvider) GetStatus(ctx context.Context, messageID string) (*DeliveryReport, error) {
	return &DeliveryReport{
		MessageID: messageID,
		Provider:  m.name,
		Status:    DeliveryStatusDelivered,
	}, nil
}

func (m *MockProvider) GetBalance(ctx context.Context) (*BalanceInfo, error) {
	return &BalanceInfo{
		Provider: m.name,
		Balance:  100.00,
		Currency: "USD",
	}, nil
}

func (m *MockProvider) ValidatePhoneNumber(phoneNumber string) (string, error) {
	if len(phoneNumber) < 7 {
		return "", ErrInvalidPhoneNumber
	}
	return phoneNumber, nil
}

func (m *MockProvider) ParseWebhook(payload []byte) (*DeliveryReport, error) {
	return nil, nil
}

func (m *MockProvider) IsHealthy(ctx context.Context) bool {
	return m.healthy
}

func (m *MockProvider) MaxMessageLength() int {
	return 1600
}

func (m *MockProvider) SupportsScheduling() bool {
	return true
}

import "context"
