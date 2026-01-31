package providers

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Common errors
var (
	ErrNoProvidersAvailable = errors.New("no SMS providers available")
	ErrProviderNotFound     = errors.New("provider not found")
	ErrInvalidPhoneNumber   = errors.New("invalid phone number")
	ErrMessageTooLong       = errors.New("message exceeds maximum length")
	ErrDeliveryFailed       = errors.New("message delivery failed")
	ErrRateLimited          = errors.New("rate limit exceeded")
	ErrInsufficientBalance  = errors.New("insufficient account balance")
)

// MessageType represents the type of SMS message
type MessageType string

const (
	MessageTypeTransactional MessageType = "transactional"
	MessageTypePromotional   MessageType = "promotional"
	MessageTypeOTP           MessageType = "otp"
)

// DeliveryStatus represents the delivery status of a message
type DeliveryStatus string

const (
	DeliveryStatusPending   DeliveryStatus = "pending"
	DeliveryStatusQueued    DeliveryStatus = "queued"
	DeliveryStatusSent      DeliveryStatus = "sent"
	DeliveryStatusDelivered DeliveryStatus = "delivered"
	DeliveryStatusFailed    DeliveryStatus = "failed"
	DeliveryStatusExpired   DeliveryStatus = "expired"
	DeliveryStatusRejected  DeliveryStatus = "rejected"
	DeliveryStatusUnknown   DeliveryStatus = "unknown"
)

// SendRequest represents an SMS send request
type SendRequest struct {
	To          string            `json:"to"`
	From        string            `json:"from,omitempty"`
	Message     string            `json:"message"`
	MessageType MessageType       `json:"message_type"`
	ScheduledAt *time.Time        `json:"scheduled_at,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
	CallbackURL string            `json:"callback_url,omitempty"`
	ValidityPeriod int            `json:"validity_period,omitempty"` // seconds
}

// SendResponse represents the response from sending an SMS
type SendResponse struct {
	MessageID      string         `json:"message_id"`
	ProviderID     string         `json:"provider_id"`
	Provider       string         `json:"provider"`
	Status         DeliveryStatus `json:"status"`
	StatusMessage  string         `json:"status_message,omitempty"`
	SegmentCount   int            `json:"segment_count"`
	Cost           float64        `json:"cost,omitempty"`
	Currency       string         `json:"currency,omitempty"`
	SentAt         time.Time      `json:"sent_at"`
}

// DeliveryReport represents a delivery status callback
type DeliveryReport struct {
	MessageID     string         `json:"message_id"`
	ProviderID    string         `json:"provider_id"`
	Provider      string         `json:"provider"`
	Status        DeliveryStatus `json:"status"`
	StatusCode    string         `json:"status_code,omitempty"`
	StatusMessage string         `json:"status_message,omitempty"`
	DeliveredAt   *time.Time     `json:"delivered_at,omitempty"`
	ErrorCode     string         `json:"error_code,omitempty"`
	ErrorMessage  string         `json:"error_message,omitempty"`
}

// BalanceInfo represents account balance information
type BalanceInfo struct {
	Provider string  `json:"provider"`
	Balance  float64 `json:"balance"`
	Currency string  `json:"currency"`
}

// Provider defines the interface for SMS providers
type Provider interface {
	// Name returns the provider name
	Name() string

	// Send sends an SMS message
	Send(ctx context.Context, req *SendRequest) (*SendResponse, error)

	// SendBulk sends multiple SMS messages
	SendBulk(ctx context.Context, requests []*SendRequest) ([]*SendResponse, error)

	// GetStatus retrieves the delivery status of a message
	GetStatus(ctx context.Context, messageID string) (*DeliveryReport, error)

	// GetBalance retrieves the account balance
	GetBalance(ctx context.Context) (*BalanceInfo, error)

	// ValidatePhoneNumber validates a phone number format
	ValidatePhoneNumber(phoneNumber string) (string, error)

	// ParseWebhook parses a delivery status webhook
	ParseWebhook(payload []byte) (*DeliveryReport, error)

	// IsHealthy checks if the provider is operational
	IsHealthy(ctx context.Context) bool

	// MaxMessageLength returns the maximum message length
	MaxMessageLength() int

	// SupportsScheduling returns if scheduling is supported
	SupportsScheduling() bool
}

// ProviderEntry holds a provider with its priority
type ProviderEntry struct {
	Provider Provider
	Priority int
	Healthy  bool
	LastCheck time.Time
}

// Manager manages multiple SMS providers with failover
type Manager struct {
	providers map[string]*ProviderEntry
	sorted    []*ProviderEntry
	mu        sync.RWMutex
	logger    *zap.Logger
}

// NewManager creates a new provider manager
func NewManager(logger *zap.Logger) *Manager {
	m := &Manager{
		providers: make(map[string]*ProviderEntry),
		logger:    logger,
	}

	// Start health check goroutine
	go m.healthCheckLoop()

	return m
}

// Register adds a provider to the manager
func (m *Manager) Register(name string, provider Provider, priority int) {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry := &ProviderEntry{
		Provider:  provider,
		Priority:  priority,
		Healthy:   true,
		LastCheck: time.Now(),
	}

	m.providers[name] = entry
	m.rebuildSortedList()
}

// Unregister removes a provider from the manager
func (m *Manager) Unregister(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.providers, name)
	m.rebuildSortedList()
}

// Get returns a specific provider by name
func (m *Manager) Get(name string) (Provider, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	entry, ok := m.providers[name]
	if !ok {
		return nil, ErrProviderNotFound
	}

	return entry.Provider, nil
}

// GetBest returns the best available provider
func (m *Manager) GetBest() (Provider, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, entry := range m.sorted {
		if entry.Healthy {
			return entry.Provider, nil
		}
	}

	return nil, ErrNoProvidersAvailable
}

// Send sends a message using the best available provider with failover
func (m *Manager) Send(ctx context.Context, req *SendRequest) (*SendResponse, error) {
	m.mu.RLock()
	providers := make([]*ProviderEntry, len(m.sorted))
	copy(providers, m.sorted)
	m.mu.RUnlock()

	var lastErr error
	for _, entry := range providers {
		if !entry.Healthy {
			continue
		}

		resp, err := entry.Provider.Send(ctx, req)
		if err == nil {
			return resp, nil
		}

		lastErr = err
		m.logger.Warn("Provider send failed, trying next",
			zap.String("provider", entry.Provider.Name()),
			zap.Error(err),
		)

		// Mark as unhealthy for temporary issues
		m.markUnhealthy(entry.Provider.Name())
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, ErrNoProvidersAvailable
}

// SendWithProvider sends using a specific provider
func (m *Manager) SendWithProvider(ctx context.Context, providerName string, req *SendRequest) (*SendResponse, error) {
	provider, err := m.Get(providerName)
	if err != nil {
		return nil, err
	}

	return provider.Send(ctx, req)
}

// ListProviders returns all registered providers
func (m *Manager) ListProviders() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	names := make([]string, 0, len(m.providers))
	for name := range m.providers {
		names = append(names, name)
	}
	return names
}

// GetProviderStatus returns status of all providers
func (m *Manager) GetProviderStatus() map[string]bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	status := make(map[string]bool)
	for name, entry := range m.providers {
		status[name] = entry.Healthy
	}
	return status
}

func (m *Manager) rebuildSortedList() {
	m.sorted = make([]*ProviderEntry, 0, len(m.providers))
	for _, entry := range m.providers {
		m.sorted = append(m.sorted, entry)
	}

	sort.Slice(m.sorted, func(i, j int) bool {
		return m.sorted[i].Priority < m.sorted[j].Priority
	})
}

func (m *Manager) markUnhealthy(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if entry, ok := m.providers[name]; ok {
		entry.Healthy = false
		entry.LastCheck = time.Now()
	}
}

func (m *Manager) healthCheckLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		m.checkAllProviders()
	}
}

func (m *Manager) checkAllProviders() {
	m.mu.Lock()
	providers := make(map[string]*ProviderEntry)
	for k, v := range m.providers {
		providers[k] = v
	}
	m.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for name, entry := range providers {
		healthy := entry.Provider.IsHealthy(ctx)

		m.mu.Lock()
		if e, ok := m.providers[name]; ok {
			e.Healthy = healthy
			e.LastCheck = time.Now()
		}
		m.mu.Unlock()

		if !healthy {
			m.logger.Warn("Provider health check failed",
				zap.String("provider", name),
			)
		}
	}
}
