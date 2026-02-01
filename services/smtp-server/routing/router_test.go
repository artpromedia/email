package routing

import (
	"context"
	"testing"

	"smtp-server/domain"

	"go.uber.org/zap"
)

// MockDomainProvider implements DomainProvider for testing
type MockDomainProvider struct {
	domains       map[string]*domain.Domain
	routingRules  map[string][]*domain.RoutingRule
	internalOrgs  map[string][]string // orgID -> list of internal domain names
}

func NewMockDomainProvider() *MockDomainProvider {
	return &MockDomainProvider{
		domains:      make(map[string]*domain.Domain),
		routingRules: make(map[string][]*domain.RoutingRule),
		internalOrgs: make(map[string][]string),
	}
}

func (m *MockDomainProvider) GetDomain(name string) *domain.Domain {
	return m.domains[name]
}

func (m *MockDomainProvider) GetDomainByID(id string) *domain.Domain {
	for _, d := range m.domains {
		if d.ID == id {
			return d
		}
	}
	return nil
}

func (m *MockDomainProvider) GetRoutingRules(ctx context.Context, domainID string) ([]*domain.RoutingRule, error) {
	return m.routingRules[domainID], nil
}

func (m *MockDomainProvider) IsDomainInternal(orgID, domainName string) bool {
	for _, d := range m.internalOrgs[orgID] {
		if d == domainName {
			return true
		}
	}
	return false
}

func (m *MockDomainProvider) AddDomain(d *domain.Domain) {
	m.domains[d.Name] = d
}

func (m *MockDomainProvider) AddRoutingRule(domainID string, rule *domain.RoutingRule) {
	m.routingRules[domainID] = append(m.routingRules[domainID], rule)
}

func (m *MockDomainProvider) SetInternalDomains(orgID string, domains []string) {
	m.internalOrgs[orgID] = domains
}

func TestRouter_Route_InternalDelivery(t *testing.T) {
	logger := zap.NewNop()
	provider := NewMockDomainProvider()

	provider.AddDomain(&domain.Domain{
		ID:     "domain-1",
		Name:   "example.com",
		Status: domain.DomainStatusVerified,
	})
	provider.SetInternalDomains("org-1", []string{"example.com"})

	router := NewRouter(provider, logger)

	msg := &MessageContext{
		From:     "sender@external.com",
		To:       []string{"user@example.com"},
		Subject:  "Test Message",
		DomainID: "domain-1",
		OrgID:    "org-1",
	}

	results, err := router.Route(context.Background(), msg)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	if results[0].Action != ActionDeliver {
		t.Errorf("Expected ActionDeliver, got %s", results[0].Action)
	}
}

func TestRouter_Route_ExternalDelivery(t *testing.T) {
	logger := zap.NewNop()
	provider := NewMockDomainProvider()

	provider.AddDomain(&domain.Domain{
		ID:     "domain-1",
		Name:   "example.com",
		Status: domain.DomainStatusVerified,
	})
	provider.SetInternalDomains("org-1", []string{"example.com"})

	router := NewRouter(provider, logger)

	msg := &MessageContext{
		From:     "user@example.com",
		To:       []string{"external@other.com"},
		Subject:  "Test Message",
		DomainID: "domain-1",
		OrgID:    "org-1",
	}

	results, err := router.Route(context.Background(), msg)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	if results[0].Action != ActionForward {
		t.Errorf("Expected ActionForward, got %s", results[0].Action)
	}
	if len(results[0].Targets) == 0 {
		t.Error("Expected targets for forward action")
	}
}

func TestRouter_Route_MultipleRecipients(t *testing.T) {
	logger := zap.NewNop()
	provider := NewMockDomainProvider()

	provider.AddDomain(&domain.Domain{
		ID:     "domain-1",
		Name:   "example.com",
		Status: domain.DomainStatusVerified,
	})
	provider.SetInternalDomains("org-1", []string{"example.com"})

	router := NewRouter(provider, logger)

	msg := &MessageContext{
		From:     "sender@external.com",
		To:       []string{"user1@example.com", "user2@example.com", "external@other.com"},
		Subject:  "Test Message",
		DomainID: "domain-1",
		OrgID:    "org-1",
	}

	results, err := router.Route(context.Background(), msg)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("Expected 3 results, got %d", len(results))
	}

	// Check internal deliveries
	internalCount := 0
	externalCount := 0
	for _, r := range results {
		if r.Action == ActionDeliver {
			internalCount++
		} else if r.Action == ActionForward {
			externalCount++
		}
	}
	if internalCount != 2 {
		t.Errorf("Expected 2 internal deliveries, got %d", internalCount)
	}
	if externalCount != 1 {
		t.Errorf("Expected 1 external delivery, got %d", externalCount)
	}
}

func TestRouter_Route_WithForwardingRule(t *testing.T) {
	logger := zap.NewNop()
	provider := NewMockDomainProvider()

	provider.AddDomain(&domain.Domain{
		ID:     "domain-1",
		Name:   "example.com",
		Status: domain.DomainStatusVerified,
	})

	// Add forwarding rule
	provider.AddRoutingRule("domain-1", &domain.RoutingRule{
		ID:       "rule-1",
		DomainID: "domain-1",
		Name:     "Forward all to admin",
		Priority: 1,
		Conditions: domain.RuleConditions{
			RecipientPattern: "forward@example.com",
		},
		Actions: domain.RuleActions{
			Action:  "forward",
			Targets: []string{"admin@example.com"},
		},
	})

	router := NewRouter(provider, logger)

	msg := &MessageContext{
		From:     "sender@external.com",
		To:       []string{"forward@example.com"},
		Subject:  "Test Message",
		DomainID: "domain-1",
		OrgID:    "org-1",
	}

	results, err := router.Route(context.Background(), msg)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	if results[0].Action != ActionForward {
		t.Errorf("Expected ActionForward, got %s", results[0].Action)
	}
	if results[0].MatchedRule == nil {
		t.Error("Expected matched rule to be set")
	}
	if results[0].MatchedRule.Name != "Forward all to admin" {
		t.Errorf("Expected rule name 'Forward all to admin', got '%s'", results[0].MatchedRule.Name)
	}
}

func TestRouter_Route_WithRejectRule(t *testing.T) {
	logger := zap.NewNop()
	provider := NewMockDomainProvider()

	provider.AddDomain(&domain.Domain{
		ID:     "domain-1",
		Name:   "example.com",
		Status: domain.DomainStatusVerified,
	})

	// Add reject rule for spam
	provider.AddRoutingRule("domain-1", &domain.RoutingRule{
		ID:       "rule-2",
		DomainID: "domain-1",
		Name:     "Reject spam senders",
		Priority: 1,
		Conditions: domain.RuleConditions{
			SenderPattern: "*@spam.com",
		},
		Actions: domain.RuleActions{
			Action:        "reject",
			RejectMessage: "Messages from this domain are not accepted",
		},
	})

	router := NewRouter(provider, logger)

	msg := &MessageContext{
		From:     "spammer@spam.com",
		To:       []string{"user@example.com"},
		Subject:  "Buy now!",
		DomainID: "domain-1",
		OrgID:    "org-1",
	}

	results, err := router.Route(context.Background(), msg)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	if results[0].Action != ActionReject {
		t.Errorf("Expected ActionReject, got %s", results[0].Action)
	}
	if results[0].RejectMessage == "" {
		t.Error("Expected reject message to be set")
	}
}

func TestRouter_Route_WithQuarantineRule(t *testing.T) {
	logger := zap.NewNop()
	provider := NewMockDomainProvider()

	provider.AddDomain(&domain.Domain{
		ID:     "domain-1",
		Name:   "example.com",
		Status: domain.DomainStatusVerified,
	})

	// Add quarantine rule for large attachments
	provider.AddRoutingRule("domain-1", &domain.RoutingRule{
		ID:       "rule-3",
		DomainID: "domain-1",
		Name:     "Quarantine large attachments",
		Priority: 1,
		Conditions: domain.RuleConditions{
			HasAttachment: true,
			MaxSize:       5 * 1024 * 1024, // 5MB
		},
		Actions: domain.RuleActions{
			Action:           "quarantine",
			QuarantineReason: "Large attachment requires review",
		},
	})

	router := NewRouter(provider, logger)

	msg := &MessageContext{
		From:          "sender@external.com",
		To:            []string{"user@example.com"},
		Subject:       "Large file attached",
		HasAttachment: true,
		Size:          10 * 1024 * 1024, // 10MB
		DomainID:      "domain-1",
		OrgID:         "org-1",
	}

	results, err := router.Route(context.Background(), msg)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	if results[0].Action != ActionQuarantine {
		t.Errorf("Expected ActionQuarantine, got %s", results[0].Action)
	}
	if results[0].QuarantineReason == "" {
		t.Error("Expected quarantine reason to be set")
	}
}

func TestRouter_Route_RulePriority(t *testing.T) {
	logger := zap.NewNop()
	provider := NewMockDomainProvider()

	provider.AddDomain(&domain.Domain{
		ID:     "domain-1",
		Name:   "example.com",
		Status: domain.DomainStatusVerified,
	})

	// Add low priority rule
	provider.AddRoutingRule("domain-1", &domain.RoutingRule{
		ID:       "rule-low",
		DomainID: "domain-1",
		Name:     "Forward to backup",
		Priority: 10,
		Conditions: domain.RuleConditions{
			RecipientPattern: "test@example.com",
		},
		Actions: domain.RuleActions{
			Action:  "forward",
			Targets: []string{"backup@example.com"},
		},
	})

	// Add high priority rule (should take precedence)
	provider.AddRoutingRule("domain-1", &domain.RoutingRule{
		ID:       "rule-high",
		DomainID: "domain-1",
		Name:     "Reject test",
		Priority: 1,
		Conditions: domain.RuleConditions{
			RecipientPattern: "test@example.com",
		},
		Actions: domain.RuleActions{
			Action:        "reject",
			RejectMessage: "Testing",
		},
	})

	router := NewRouter(provider, logger)

	msg := &MessageContext{
		From:     "sender@external.com",
		To:       []string{"test@example.com"},
		Subject:  "Test",
		DomainID: "domain-1",
		OrgID:    "org-1",
	}

	results, err := router.Route(context.Background(), msg)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	// Higher priority reject rule should take precedence
	if results[0].Action != ActionReject {
		t.Errorf("Expected ActionReject (high priority), got %s", results[0].Action)
	}
}

func TestExtractDomain(t *testing.T) {
	tests := []struct {
		email    string
		expected string
	}{
		{"user@example.com", "example.com"},
		{"user@sub.example.com", "sub.example.com"},
		{"user@EXAMPLE.COM", "example.com"},
		{"user", ""},
		{"", ""},
	}

	for _, tt := range tests {
		result := extractDomain(tt.email)
		if result != tt.expected {
			t.Errorf("extractDomain(%q) = %q, want %q", tt.email, result, tt.expected)
		}
	}
}

func TestMatchPattern(t *testing.T) {
	tests := []struct {
		pattern  string
		value    string
		expected bool
	}{
		{"*@example.com", "user@example.com", true},
		{"*@example.com", "user@other.com", false},
		{"admin*@example.com", "admin@example.com", true},
		{"admin*@example.com", "admin.user@example.com", true},
		{"admin*@example.com", "user@example.com", false},
		{"user@example.com", "user@example.com", true},
		{"user@example.com", "other@example.com", false},
		{"*", "anything", true},
		{"", "anything", false},
	}

	for _, tt := range tests {
		result := matchPattern(tt.pattern, tt.value)
		if result != tt.expected {
			t.Errorf("matchPattern(%q, %q) = %v, want %v", tt.pattern, tt.value, result, tt.expected)
		}
	}
}
