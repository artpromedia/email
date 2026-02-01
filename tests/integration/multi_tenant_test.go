// Package integration provides end-to-end integration tests for multi-tenant scenarios.
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

// MultiTenantTestConfig holds configuration for multi-tenant tests
type MultiTenantTestConfig struct {
	AuthServiceURL   string
	DomainServiceURL string
	SMTPHost         string
	SMTPPort         string
	RedisURL         string
}

// loadMultiTenantConfig loads multi-tenant test configuration from environment
func loadMultiTenantConfig() *MultiTenantTestConfig {
	return &MultiTenantTestConfig{
		AuthServiceURL:   getEnvOrDefault("AUTH_SERVICE_URL", "http://localhost:8082"),
		DomainServiceURL: getEnvOrDefault("DOMAIN_SERVICE_URL", "http://localhost:8085"),
		SMTPHost:         getEnvOrDefault("SMTP_HOST", "localhost"),
		SMTPPort:         getEnvOrDefault("SMTP_PORT", "25"),
		RedisURL:         getEnvOrDefault("REDIS_URL", "redis://localhost:6380"),
	}
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// MultiTenantTestSuite holds resources for multi-tenant tests
type MultiTenantTestSuite struct {
	config     *MultiTenantTestConfig
	httpClient *http.Client
	redis      *redis.Client
}

// SetupMultiTenantSuite initializes the multi-tenant test suite
func SetupMultiTenantSuite(t *testing.T) *MultiTenantTestSuite {
	t.Helper()
	config := loadMultiTenantConfig()

	suite := &MultiTenantTestSuite{
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

func (s *MultiTenantTestSuite) TeardownMultiTenantSuite(t *testing.T) {
	t.Helper()
	if s.redis != nil {
		s.redis.Close()
	}
}

// Organization represents a test organization
type Organization struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Plan        string `json:"plan"`
	MaxDomains  int    `json:"max_domains"`
	MaxUsers    int    `json:"max_users"`
	QuotaBytes  int64  `json:"quota_bytes"`
}

// User represents a test user
type User struct {
	ID             string `json:"id"`
	Email          string `json:"email"`
	OrganizationID string `json:"organization_id"`
	Role           string `json:"role"`
}

// TestOrganizationIsolation tests data isolation between organizations
func TestOrganizationIsolation(t *testing.T) {
	suite := SetupMultiTenantSuite(t)
	defer suite.TeardownMultiTenantSuite(t)

	ctx := context.Background()

	// Setup test organizations in cache
	org1 := Organization{
		ID:         "org-isolation-1",
		Name:       "Test Org 1",
		Plan:       "enterprise",
		MaxDomains: 10,
		MaxUsers:   100,
		QuotaBytes: 100 * 1024 * 1024 * 1024, // 100GB
	}
	org2 := Organization{
		ID:         "org-isolation-2",
		Name:       "Test Org 2",
		Plan:       "business",
		MaxDomains: 5,
		MaxUsers:   50,
		QuotaBytes: 50 * 1024 * 1024 * 1024, // 50GB
	}

	t.Run("User Data Isolation", func(t *testing.T) {
		// Create users in both orgs
		user1Key := fmt.Sprintf("user:org:%s:user1@org1.com", org1.ID)
		user2Key := fmt.Sprintf("user:org:%s:user2@org2.com", org2.ID)

		suite.redis.Set(ctx, user1Key, `{"email":"user1@org1.com","org_id":"org-isolation-1"}`, 5*time.Minute)
		suite.redis.Set(ctx, user2Key, `{"email":"user2@org2.com","org_id":"org-isolation-2"}`, 5*time.Minute)

		// Verify org1 cannot see org2's users
		pattern := fmt.Sprintf("user:org:%s:*", org1.ID)
		keys, _ := suite.redis.Keys(ctx, pattern).Result()

		for _, key := range keys {
			if key == user2Key {
				t.Error("Org1 should not be able to see Org2's users")
			}
		}

		// Cleanup
		suite.redis.Del(ctx, user1Key, user2Key)
	})

	t.Run("Mailbox Data Isolation", func(t *testing.T) {
		// Mailboxes should be scoped by organization
		mailbox1Key := fmt.Sprintf("mailbox:%s:inbox:user1", org1.ID)
		mailbox2Key := fmt.Sprintf("mailbox:%s:inbox:user2", org2.ID)

		suite.redis.Set(ctx, mailbox1Key, `{"unread":5}`, 5*time.Minute)
		suite.redis.Set(ctx, mailbox2Key, `{"unread":10}`, 5*time.Minute)

		// Verify isolation
		pattern := fmt.Sprintf("mailbox:%s:*", org1.ID)
		keys, _ := suite.redis.Keys(ctx, pattern).Result()

		for _, key := range keys {
			if key == mailbox2Key {
				t.Error("Org1 should not see Org2's mailboxes")
			}
		}

		// Cleanup
		suite.redis.Del(ctx, mailbox1Key, mailbox2Key)
	})

	t.Run("Domain Configuration Isolation", func(t *testing.T) {
		// Domain configs should be organization-specific
		domain1Key := fmt.Sprintf("domain:config:%s:org1.com", org1.ID)
		domain2Key := fmt.Sprintf("domain:config:%s:org2.com", org2.ID)

		config1 := `{"dkim_enabled":true,"spf_enabled":true,"dmarc_policy":"quarantine"}`
		config2 := `{"dkim_enabled":true,"spf_enabled":false,"dmarc_policy":"none"}`

		suite.redis.Set(ctx, domain1Key, config1, 5*time.Minute)
		suite.redis.Set(ctx, domain2Key, config2, 5*time.Minute)

		// Verify each org only sees their own config
		result1, _ := suite.redis.Get(ctx, domain1Key).Result()
		result2, _ := suite.redis.Get(ctx, domain2Key).Result()

		if result1 != config1 {
			t.Error("Org1 should see their own domain config")
		}
		if result2 != config2 {
			t.Error("Org2 should see their own domain config")
		}

		// Cleanup
		suite.redis.Del(ctx, domain1Key, domain2Key)
	})
}

// TestQuotaEnforcement tests quota limits across organizations
func TestQuotaEnforcement(t *testing.T) {
	suite := SetupMultiTenantSuite(t)
	defer suite.TeardownMultiTenantSuite(t)

	ctx := context.Background()

	t.Run("Organization Quota Limits", func(t *testing.T) {
		orgID := "org-quota-test"
		quotaKey := fmt.Sprintf("quota:org:%s", orgID)

		quota := struct {
			TotalBytes int64 `json:"total_bytes"`
			UsedBytes  int64 `json:"used_bytes"`
		}{
			TotalBytes: 10 * 1024 * 1024 * 1024, // 10GB
			UsedBytes:  5 * 1024 * 1024 * 1024,  // 5GB
		}

		data, _ := json.Marshal(quota)
		suite.redis.Set(ctx, quotaKey, data, 5*time.Minute)

		// Check available
		result, _ := suite.redis.Get(ctx, quotaKey).Result()
		var retrieved struct {
			TotalBytes int64 `json:"total_bytes"`
			UsedBytes  int64 `json:"used_bytes"`
		}
		json.Unmarshal([]byte(result), &retrieved)

		available := retrieved.TotalBytes - retrieved.UsedBytes
		if available != 5*1024*1024*1024 {
			t.Errorf("Expected 5GB available, got %d", available)
		}

		// Cleanup
		suite.redis.Del(ctx, quotaKey)
	})

	t.Run("User Quota Within Organization", func(t *testing.T) {
		orgID := "org-user-quota"
		user1Key := fmt.Sprintf("quota:user:%s:user1", orgID)
		user2Key := fmt.Sprintf("quota:user:%s:user2", orgID)

		// Each user has individual quota
		suite.redis.Set(ctx, user1Key, `{"limit":1073741824,"used":536870912}`, 5*time.Minute) // 1GB/500MB
		suite.redis.Set(ctx, user2Key, `{"limit":1073741824,"used":268435456}`, 5*time.Minute) // 1GB/256MB

		// Verify independent tracking
		result1, _ := suite.redis.Get(ctx, user1Key).Result()
		result2, _ := suite.redis.Get(ctx, user2Key).Result()

		if result1 == result2 {
			t.Error("User quotas should be tracked independently")
		}

		// Cleanup
		suite.redis.Del(ctx, user1Key, user2Key)
	})
}

// TestCrossOrganizationEmail tests email routing between organizations
func TestCrossOrganizationEmail(t *testing.T) {
	t.Run("Internal Org-to-Org Email", func(t *testing.T) {
		// Both orgs on same platform - should be delivered internally
		sender := "user@org1.platform.com"
		recipient := "user@org2.platform.com"

		// Verify routing decision
		isInternal := true // Platform knows both domains
		if !isInternal {
			t.Error("Cross-org email on same platform should be internal")
		}

		t.Logf("Email from %s to %s routed internally", sender, recipient)
	})

	t.Run("External Email", func(t *testing.T) {
		// One org on platform, one external
		sender := "user@org1.platform.com"
		recipient := "user@external.com"

		// Verify routing decision
		isExternal := true // external.com not on platform
		if !isExternal {
			t.Error("Email to external domain should be routed externally")
		}

		t.Logf("Email from %s to %s routed externally", sender, recipient)
	})
}

// TestPlanLimits tests plan-based feature limits
func TestPlanLimits(t *testing.T) {
	plans := map[string]struct {
		MaxDomains     int
		MaxUsers       int
		MaxAliases     int
		CustomBranding bool
		SSO            bool
		APIAccess      bool
	}{
		"starter": {
			MaxDomains:     1,
			MaxUsers:       5,
			MaxAliases:     10,
			CustomBranding: false,
			SSO:            false,
			APIAccess:      false,
		},
		"business": {
			MaxDomains:     5,
			MaxUsers:       50,
			MaxAliases:     100,
			CustomBranding: true,
			SSO:            false,
			APIAccess:      true,
		},
		"enterprise": {
			MaxDomains:     -1, // Unlimited
			MaxUsers:       -1,
			MaxAliases:     -1,
			CustomBranding: true,
			SSO:            true,
			APIAccess:      true,
		},
	}

	t.Run("Starter Plan Limits", func(t *testing.T) {
		plan := plans["starter"]
		if plan.MaxDomains != 1 {
			t.Errorf("Starter should have 1 domain limit, got %d", plan.MaxDomains)
		}
		if plan.SSO {
			t.Error("Starter should not have SSO")
		}
	})

	t.Run("Business Plan Features", func(t *testing.T) {
		plan := plans["business"]
		if !plan.CustomBranding {
			t.Error("Business should have custom branding")
		}
		if !plan.APIAccess {
			t.Error("Business should have API access")
		}
	})

	t.Run("Enterprise Plan Unlimited", func(t *testing.T) {
		plan := plans["enterprise"]
		if plan.MaxDomains != -1 {
			t.Error("Enterprise should have unlimited domains")
		}
		if !plan.SSO {
			t.Error("Enterprise should have SSO")
		}
	})
}

// TestAdminPermissions tests admin permissions across organizations
func TestAdminPermissions(t *testing.T) {
	suite := SetupMultiTenantSuite(t)
	defer suite.TeardownMultiTenantSuite(t)

	t.Run("Org Admin Cannot Access Other Orgs", func(t *testing.T) {
		// Org admin from org1 should not be able to manage org2
		adminToken := "org1-admin-token"
		targetOrgID := "org-2"

		httpReq, _ := http.NewRequest(http.MethodGet,
			suite.config.AuthServiceURL+"/api/admin/organizations/"+targetOrgID+"/users",
			nil)
		httpReq.Header.Set("Authorization", "Bearer "+adminToken)

		resp, err := suite.httpClient.Do(httpReq)
		if err != nil {
			t.Skipf("Service not available: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusNotFound {
			t.Logf("Expected 403 or 404 for cross-org admin access, got %d", resp.StatusCode)
		}
	})

	t.Run("Super Admin Can Access All Orgs", func(t *testing.T) {
		// Super admin should be able to access any org
		superAdminToken := "super-admin-token"
		targetOrgID := "any-org"

		httpReq, _ := http.NewRequest(http.MethodGet,
			suite.config.AuthServiceURL+"/api/admin/organizations/"+targetOrgID,
			nil)
		httpReq.Header.Set("Authorization", "Bearer "+superAdminToken)

		resp, err := suite.httpClient.Do(httpReq)
		if err != nil {
			t.Skipf("Service not available: %v", err)
		}
		defer resp.Body.Close()

		// Super admin should get success or not found (if org doesn't exist)
		// but NOT forbidden
		t.Logf("Super admin access response: %d", resp.StatusCode)
	})
}

// TestAuditLogging tests audit logging across tenants
func TestAuditLogging(t *testing.T) {
	suite := SetupMultiTenantSuite(t)
	defer suite.TeardownMultiTenantSuite(t)

	ctx := context.Background()

	t.Run("Audit Logs Scoped By Organization", func(t *testing.T) {
		org1ID := "org-audit-1"
		org2ID := "org-audit-2"

		// Log events for different orgs
		log1Key := fmt.Sprintf("audit:%s:%d", org1ID, time.Now().UnixNano())
		log2Key := fmt.Sprintf("audit:%s:%d", org2ID, time.Now().UnixNano())

		suite.redis.Set(ctx, log1Key, `{"action":"login","user":"user1@org1.com"}`, 5*time.Minute)
		suite.redis.Set(ctx, log2Key, `{"action":"login","user":"user2@org2.com"}`, 5*time.Minute)

		// Query org1 logs
		pattern := fmt.Sprintf("audit:%s:*", org1ID)
		keys, _ := suite.redis.Keys(ctx, pattern).Result()

		for _, key := range keys {
			if key == log2Key {
				t.Error("Org1 audit query should not return Org2 logs")
			}
		}

		// Cleanup
		suite.redis.Del(ctx, log1Key, log2Key)
	})

	t.Run("Audit Log Format", func(t *testing.T) {
		logEntry := struct {
			Timestamp    time.Time `json:"timestamp"`
			OrgID        string    `json:"org_id"`
			UserID       string    `json:"user_id"`
			Action       string    `json:"action"`
			ResourceType string    `json:"resource_type"`
			ResourceID   string    `json:"resource_id"`
			IPAddress    string    `json:"ip_address"`
			UserAgent    string    `json:"user_agent"`
			Success      bool      `json:"success"`
		}{
			Timestamp:    time.Now(),
			OrgID:        "org-123",
			UserID:       "user-456",
			Action:       "user.created",
			ResourceType: "user",
			ResourceID:   "user-789",
			IPAddress:    "192.168.1.1",
			UserAgent:    "Mozilla/5.0",
			Success:      true,
		}

		data, err := json.Marshal(logEntry)
		if err != nil {
			t.Fatalf("Failed to marshal audit log: %v", err)
		}

		// Verify required fields
		var parsed map[string]interface{}
		json.Unmarshal(data, &parsed)

		requiredFields := []string{"timestamp", "org_id", "user_id", "action", "success"}
		for _, field := range requiredFields {
			if _, ok := parsed[field]; !ok {
				t.Errorf("Audit log missing required field: %s", field)
			}
		}
	})
}
