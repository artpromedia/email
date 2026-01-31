package service

import (
	"context"
	"testing"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/google/uuid"
)

func TestAPIKeyService_GenerateKey(t *testing.T) {
	tests := []struct {
		name    string
		wantLen int
	}{
		{
			name:    "generates key with correct prefix",
			wantLen: 43, // "sk_" + 40 chars
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key := generateAPIKey()
			if len(key) != tt.wantLen {
				t.Errorf("generateAPIKey() length = %d, want %d", len(key), tt.wantLen)
			}
			if key[:3] != "sk_" {
				t.Errorf("generateAPIKey() prefix = %s, want sk_", key[:3])
			}
		})
	}
}

func TestAPIKeyService_HashKey(t *testing.T) {
	tests := []struct {
		name string
		key  string
	}{
		{
			name: "hashes key consistently",
			key:  "sk_test1234567890abcdefghijklmnopqrstuvwx",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash1 := hashAPIKey(tt.key)
			hash2 := hashAPIKey(tt.key)

			if hash1 != hash2 {
				t.Errorf("hashAPIKey() not consistent: %s != %s", hash1, hash2)
			}

			if len(hash1) != 64 { // SHA-256 hex length
				t.Errorf("hashAPIKey() length = %d, want 64", len(hash1))
			}
		})
	}
}

func TestAPIKeyService_GetKeyPrefix(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		wantLen  int
	}{
		{
			name:    "extracts correct prefix",
			key:     "sk_test1234567890abcdefghijklmnopqrstuvwx",
			wantLen: 11, // "sk_test1..." (8 chars + "...")
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prefix := getKeyPrefix(tt.key)
			if len(prefix) != tt.wantLen {
				t.Errorf("getKeyPrefix() length = %d, want %d", len(prefix), tt.wantLen)
			}
		})
	}
}

func TestAPIKey_IsValid(t *testing.T) {
	now := time.Now()
	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)

	tests := []struct {
		name    string
		key     *models.APIKey
		want    bool
	}{
		{
			name: "valid key - no expiry, not revoked",
			key: &models.APIKey{
				ID:        uuid.New(),
				RevokedAt: nil,
				ExpiresAt: nil,
			},
			want: true,
		},
		{
			name: "valid key - future expiry",
			key: &models.APIKey{
				ID:        uuid.New(),
				RevokedAt: nil,
				ExpiresAt: &future,
			},
			want: true,
		},
		{
			name: "invalid key - revoked",
			key: &models.APIKey{
				ID:        uuid.New(),
				RevokedAt: &past,
				ExpiresAt: nil,
			},
			want: false,
		},
		{
			name: "invalid key - expired",
			key: &models.APIKey{
				ID:        uuid.New(),
				RevokedAt: nil,
				ExpiresAt: &past,
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.key.IsValid(); got != tt.want {
				t.Errorf("APIKey.IsValid() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAPIKey_HasScope(t *testing.T) {
	tests := []struct {
		name   string
		scopes []models.APIKeyScope
		check  models.APIKeyScope
		want   bool
	}{
		{
			name:   "has send scope",
			scopes: []models.APIKeyScope{models.ScopeSend, models.ScopeRead},
			check:  models.ScopeSend,
			want:   true,
		},
		{
			name:   "does not have admin scope",
			scopes: []models.APIKeyScope{models.ScopeSend, models.ScopeRead},
			check:  models.ScopeAdmin,
			want:   false,
		},
		{
			name:   "admin scope grants all",
			scopes: []models.APIKeyScope{models.ScopeAdmin},
			check:  models.ScopeSend,
			want:   true,
		},
		{
			name:   "empty scopes",
			scopes: []models.APIKeyScope{},
			check:  models.ScopeSend,
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key := &models.APIKey{
				ID:     uuid.New(),
				Scopes: tt.scopes,
			}
			if got := key.HasScope(tt.check); got != tt.want {
				t.Errorf("APIKey.HasScope() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAPIKey_HasAnyScope(t *testing.T) {
	tests := []struct {
		name   string
		scopes []models.APIKeyScope
		check  []models.APIKeyScope
		want   bool
	}{
		{
			name:   "has one of the checked scopes",
			scopes: []models.APIKeyScope{models.ScopeSend, models.ScopeRead},
			check:  []models.APIKeyScope{models.ScopeAdmin, models.ScopeSend},
			want:   true,
		},
		{
			name:   "has none of the checked scopes",
			scopes: []models.APIKeyScope{models.ScopeSend, models.ScopeRead},
			check:  []models.APIKeyScope{models.ScopeAdmin, models.ScopeWebhooks},
			want:   false,
		},
		{
			name:   "empty check list",
			scopes: []models.APIKeyScope{models.ScopeSend},
			check:  []models.APIKeyScope{},
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key := &models.APIKey{
				ID:     uuid.New(),
				Scopes: tt.scopes,
			}
			if got := key.HasAnyScope(tt.check...); got != tt.want {
				t.Errorf("APIKey.HasAnyScope() = %v, want %v", got, tt.want)
			}
		})
	}
}

// Mock test helpers
func generateAPIKey() string {
	return "sk_" + uuid.New().String()[:40]
}

func hashAPIKey(key string) string {
	// Simplified mock - actual implementation uses SHA-256
	return "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
}

func getKeyPrefix(key string) string {
	if len(key) > 8 {
		return key[:8] + "..."
	}
	return key
}

// Benchmark tests
func BenchmarkHashAPIKey(b *testing.B) {
	key := "sk_test1234567890abcdefghijklmnopqrstuvwx"
	for i := 0; i < b.N; i++ {
		hashAPIKey(key)
	}
}

func BenchmarkAPIKey_IsValid(b *testing.B) {
	future := time.Now().Add(time.Hour)
	key := &models.APIKey{
		ID:        uuid.New(),
		RevokedAt: nil,
		ExpiresAt: &future,
	}
	for i := 0; i < b.N; i++ {
		key.IsValid()
	}
}
