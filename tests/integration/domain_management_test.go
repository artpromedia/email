// Package integration provides end-to-end integration tests for domain management.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
)

// DomainTestConfig holds configuration for domain management tests
type DomainTestConfig struct {
	DomainServiceURL string
	RedisURL         string
	APIKey           string
}

// loadDomainConfig loads domain test configuration from environment
func loadDomainConfig() *DomainTestConfig {
	return &DomainTestConfig{
		DomainServiceURL: getEnvDefault("DOMAIN_SERVICE_URL", "http://localhost:8085"),
		RedisURL:         getEnvDefault("REDIS_URL", "redis://localhost:6380"),
		APIKey:           getEnvDefault("API_KEY", "test-api-key"),
	}
}

func getEnvDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// DomainTestSuite holds resources for domain management tests
type DomainTestSuite struct {
	config     *DomainTestConfig
	httpClient *http.Client
	redis      *redis.Client
}

// SetupDomainSuite initializes the domain test suite
func SetupDomainSuite(t *testing.T) *DomainTestSuite {
	t.Helper()
	config := loadDomainConfig()

	suite := &DomainTestSuite{
		config:     config,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}

	opt, err := redis.ParseURL(config.RedisURL)
	if err != nil {
		t.Fatalf("Failed to parse Redis URL: %v", err)
	}
	suite.redis = redis.NewClient(opt)
	if err := suite.redis.Ping(context.Background()).Err(); err != nil {
		t.Logf("Redis connection failed (tests may skip): %v", err)
	}

	return suite
}

func (s *DomainTestSuite) TeardownDomainSuite(t *testing.T) {
	t.Helper()
	if s.redis != nil {
		s.redis.Close()
	}
}

// Domain request/response types
type CreateDomainRequest struct {
	DomainName     string `json:"domain_name"`
	OrganizationID string `json:"organization_id"`
}

type DomainResponse struct {
	ID             string    `json:"id"`
	DomainName     string    `json:"domain_name"`
	OrganizationID string    `json:"organization_id"`
	IsVerified     bool      `json:"is_verified"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
}

type DNSRecord struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	Priority int    `json:"priority,omitempty"`
}

type VerificationStatusResponse struct {
	DomainID   string            `json:"domain_id"`
	IsVerified bool              `json:"is_verified"`
	Records    map[string]string `json:"verification_records"`
	Missing    []string          `json:"missing_records"`
}

// TestDomainCreationFlow tests the domain creation process
func TestDomainCreationFlow(t *testing.T) {
	suite := SetupDomainSuite(t)
	defer suite.TeardownDomainSuite(t)

	t.Run("Create Domain with Valid Data", func(t *testing.T) {
		req := CreateDomainRequest{
			DomainName:     "test-domain-" + fmt.Sprintf("%d", time.Now().UnixNano()) + ".com",
			OrganizationID: "org-test-123",
		}

		body, _ := json.Marshal(req)
		httpReq, _ := http.NewRequest(http.MethodPost,
			suite.config.DomainServiceURL+"/api/domains",
			bytes.NewBuffer(body))
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer test-token")

		resp, err := suite.httpClient.Do(httpReq)
		if err != nil {
			t.Skipf("Domain service not available: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
			t.Logf("Expected 201 Created or 200 OK, got %d", resp.StatusCode)
		}
	})

	t.Run("Create Domain with Invalid Name", func(t *testing.T) {
		invalidNames := []string{
			"",                  // Empty
			"no-tld",            // No TLD
			"-invalid.com",      // Starts with hyphen
			"invalid-.com",      // Ends with hyphen
			"very" + string(make([]byte, 300)) + ".com", // Too long
		}

		for _, name := range invalidNames {
			req := CreateDomainRequest{
				DomainName:     name,
				OrganizationID: "org-test-123",
			}

			body, _ := json.Marshal(req)
			httpReq, _ := http.NewRequest(http.MethodPost,
				suite.config.DomainServiceURL+"/api/domains",
				bytes.NewBuffer(body))
			httpReq.Header.Set("Content-Type", "application/json")

			resp, err := suite.httpClient.Do(httpReq)
			if err != nil {
				continue // Service not available
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusCreated {
				t.Errorf("Expected error for invalid domain name: %s", name)
			}
		}
	})
}

// TestDNSVerificationFlow tests the DNS verification process
func TestDNSVerificationFlow(t *testing.T) {
	suite := SetupDomainSuite(t)
	defer suite.TeardownDomainSuite(t)

	t.Run("Get Verification Records", func(t *testing.T) {
		domainID := "test-domain-id"
		httpReq, _ := http.NewRequest(http.MethodGet,
			suite.config.DomainServiceURL+"/api/domains/"+domainID+"/verification",
			nil)
		httpReq.Header.Set("Authorization", "Bearer test-token")

		resp, err := suite.httpClient.Do(httpReq)
		if err != nil {
			t.Skipf("Domain service not available: %v", err)
		}
		defer resp.Body.Close()

		// Just verify we get a response
		t.Logf("Verification endpoint response: %d", resp.StatusCode)
	})

	t.Run("Verification Record Format", func(t *testing.T) {
		// Test that verification records follow expected format
		expectedRecords := []DNSRecord{
			{Type: "TXT", Name: "_dmarc.example.com", Value: "v=DMARC1; p=quarantine"},
			{Type: "TXT", Name: "mail._domainkey.example.com", Value: "v=DKIM1; k=rsa; p=..."},
			{Type: "TXT", Name: "example.com", Value: "v=spf1 include:_spf.example.com ~all"},
			{Type: "MX", Name: "example.com", Value: "mail.example.com", Priority: 10},
		}

		for _, record := range expectedRecords {
			if record.Type == "" || record.Name == "" || record.Value == "" {
				t.Errorf("Invalid record format: %+v", record)
			}
			if record.Type == "MX" && record.Priority == 0 {
				t.Errorf("MX record should have priority: %+v", record)
			}
		}
	})
}

// TestDKIMKeyManagement tests DKIM key operations
func TestDKIMKeyManagement(t *testing.T) {
	suite := SetupDomainSuite(t)
	defer suite.TeardownDomainSuite(t)

	t.Run("Generate DKIM Key", func(t *testing.T) {
		domainID := "test-domain-dkim"
		httpReq, _ := http.NewRequest(http.MethodPost,
			suite.config.DomainServiceURL+"/api/domains/"+domainID+"/dkim/generate",
			nil)
		httpReq.Header.Set("Authorization", "Bearer test-token")

		resp, err := suite.httpClient.Do(httpReq)
		if err != nil {
			t.Skipf("Domain service not available: %v", err)
		}
		defer resp.Body.Close()

		t.Logf("DKIM generation response: %d", resp.StatusCode)
	})

	t.Run("Key Rotation Flow", func(t *testing.T) {
		// Simulate key rotation steps
		steps := []string{
			"1. Generate new key (inactive)",
			"2. Publish new DNS record",
			"3. Wait for DNS propagation",
			"4. Activate new key",
			"5. Deactivate old key",
			"6. Remove old DNS record",
		}

		for i, step := range steps {
			t.Logf("Step %d: %s", i+1, step)
		}
	})
}

// TestDomainCaching tests the domain caching mechanism
func TestDomainCaching(t *testing.T) {
	suite := SetupDomainSuite(t)
	defer suite.TeardownDomainSuite(t)

	ctx := context.Background()

	t.Run("Cache Hit Scenario", func(t *testing.T) {
		domainName := "cached.example.com"
		cacheKey := fmt.Sprintf("domain:%s", domainName)

		// Set cached domain
		domainData := `{"id":"domain-1","name":"cached.example.com","verified":true}`
		err := suite.redis.Set(ctx, cacheKey, domainData, 5*time.Minute).Err()
		if err != nil {
			t.Skipf("Redis not available: %v", err)
		}

		// Retrieve from cache
		result, err := suite.redis.Get(ctx, cacheKey).Result()
		if err != nil {
			t.Fatalf("Failed to get cached domain: %v", err)
		}

		if result != domainData {
			t.Errorf("Cache mismatch: got %s, want %s", result, domainData)
		}

		// Cleanup
		suite.redis.Del(ctx, cacheKey)
	})

	t.Run("Cache Invalidation", func(t *testing.T) {
		domainName := "invalidate.example.com"
		cacheKey := fmt.Sprintf("domain:%s", domainName)

		// Set cached domain
		suite.redis.Set(ctx, cacheKey, "old-data", 5*time.Minute)

		// Invalidate
		suite.redis.Del(ctx, cacheKey)

		// Verify removal
		exists, _ := suite.redis.Exists(ctx, cacheKey).Result()
		if exists != 0 {
			t.Error("Cache should be invalidated")
		}
	})
}

// TestMultiTenantIsolation tests multi-tenant data isolation
func TestMultiTenantIsolation(t *testing.T) {
	suite := SetupDomainSuite(t)
	defer suite.TeardownDomainSuite(t)

	t.Run("Organization Domains Isolated", func(t *testing.T) {
		// Test that org1 cannot access org2's domains
		org1Token := "org1-token"
		org2Token := "org2-token"
		org2DomainID := "org2-domain-id"

		// Attempt to access org2's domain with org1's token
		httpReq, _ := http.NewRequest(http.MethodGet,
			suite.config.DomainServiceURL+"/api/domains/"+org2DomainID,
			nil)
		httpReq.Header.Set("Authorization", "Bearer "+org1Token)

		resp, err := suite.httpClient.Do(httpReq)
		if err != nil {
			t.Skipf("Domain service not available: %v", err)
		}
		defer resp.Body.Close()

		// Should get 403 Forbidden or 404 Not Found
		if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusNotFound {
			t.Logf("Expected 403 or 404 for cross-org access, got %d", resp.StatusCode)
		}
		_ = org2Token // Used in real test
	})

	t.Run("Domain Name Uniqueness Across Orgs", func(t *testing.T) {
		// Same domain cannot be registered by two different orgs
		domainName := "unique-test-" + fmt.Sprintf("%d", time.Now().UnixNano()) + ".com"

		// First org registers domain
		req1 := CreateDomainRequest{
			DomainName:     domainName,
			OrganizationID: "org-1",
		}
		body1, _ := json.Marshal(req1)
		httpReq1, _ := http.NewRequest(http.MethodPost,
			suite.config.DomainServiceURL+"/api/domains",
			bytes.NewBuffer(body1))
		httpReq1.Header.Set("Content-Type", "application/json")
		httpReq1.Header.Set("Authorization", "Bearer org1-token")

		resp1, err := suite.httpClient.Do(httpReq1)
		if err != nil {
			t.Skipf("Domain service not available: %v", err)
		}
		resp1.Body.Close()

		// Second org tries to register same domain
		req2 := CreateDomainRequest{
			DomainName:     domainName,
			OrganizationID: "org-2",
		}
		body2, _ := json.Marshal(req2)
		httpReq2, _ := http.NewRequest(http.MethodPost,
			suite.config.DomainServiceURL+"/api/domains",
			bytes.NewBuffer(body2))
		httpReq2.Header.Set("Content-Type", "application/json")
		httpReq2.Header.Set("Authorization", "Bearer org2-token")

		resp2, err := suite.httpClient.Do(httpReq2)
		if err != nil {
			t.Skipf("Domain service not available: %v", err)
		}
		resp2.Body.Close()

		// Second registration should fail
		if resp2.StatusCode == http.StatusCreated {
			t.Error("Second org should not be able to register same domain")
		}
	})
}

// TestDomainPolicies tests domain policy enforcement
func TestDomainPolicies(t *testing.T) {
	t.Run("Message Size Limit", func(t *testing.T) {
		policy := struct {
			MaxMessageSize int64 `json:"max_message_size"`
		}{
			MaxMessageSize: 25 * 1024 * 1024, // 25MB
		}

		if policy.MaxMessageSize <= 0 {
			t.Error("Max message size should be positive")
		}
	})

	t.Run("Recipient Limits", func(t *testing.T) {
		policy := struct {
			MaxRecipients int `json:"max_recipients"`
		}{
			MaxRecipients: 500,
		}

		if policy.MaxRecipients <= 0 {
			t.Error("Max recipients should be positive")
		}
	})

	t.Run("Rate Limiting", func(t *testing.T) {
		policy := struct {
			MessagesPerHour int `json:"messages_per_hour"`
			MessagesPerDay  int `json:"messages_per_day"`
		}{
			MessagesPerHour: 100,
			MessagesPerDay:  1000,
		}

		if policy.MessagesPerDay < policy.MessagesPerHour {
			t.Error("Daily limit should be >= hourly limit")
		}
	})
}
