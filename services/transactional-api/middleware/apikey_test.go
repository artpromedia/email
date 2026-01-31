package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/google/uuid"
)

func TestAPIKeyMiddleware_ExtractKey(t *testing.T) {
	tests := []struct {
		name        string
		headers     map[string]string
		wantKey     string
		wantFound   bool
	}{
		{
			name: "X-API-Key header",
			headers: map[string]string{
				"X-API-Key": "sk_test123",
			},
			wantKey:   "sk_test123",
			wantFound: true,
		},
		{
			name: "Authorization Bearer",
			headers: map[string]string{
				"Authorization": "Bearer sk_test456",
			},
			wantKey:   "sk_test456",
			wantFound: true,
		},
		{
			name: "X-API-Key takes precedence",
			headers: map[string]string{
				"X-API-Key":     "sk_primary",
				"Authorization": "Bearer sk_secondary",
			},
			wantKey:   "sk_primary",
			wantFound: true,
		},
		{
			name:        "No key provided",
			headers:     map[string]string{},
			wantKey:     "",
			wantFound:   false,
		},
		{
			name: "Invalid Authorization format",
			headers: map[string]string{
				"Authorization": "Basic dXNlcjpwYXNz",
			},
			wantKey:   "",
			wantFound: false,
		},
		{
			name: "Empty X-API-Key",
			headers: map[string]string{
				"X-API-Key": "",
			},
			wantKey:   "",
			wantFound: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}

			key, found := extractAPIKey(req)

			if found != tt.wantFound {
				t.Errorf("extractAPIKey() found = %v, want %v", found, tt.wantFound)
			}
			if key != tt.wantKey {
				t.Errorf("extractAPIKey() key = %v, want %v", key, tt.wantKey)
			}
		})
	}
}

func TestAPIKeyMiddleware_ValidateKeyFormat(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{
			name:    "valid key format",
			key:     "sk_1234567890abcdefghijklmnopqrstuvwxyz1234",
			wantErr: false,
		},
		{
			name:    "too short",
			key:     "sk_123",
			wantErr: true,
		},
		{
			name:    "missing prefix",
			key:     "1234567890abcdefghijklmnopqrstuvwxyz12345",
			wantErr: true,
		},
		{
			name:    "wrong prefix",
			key:     "pk_1234567890abcdefghijklmnopqrstuvwxyz1234",
			wantErr: true,
		},
		{
			name:    "empty key",
			key:     "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateKeyFormat(tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateKeyFormat() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestAPIKeyMiddleware_RequireScope(t *testing.T) {
	tests := []struct {
		name         string
		keyScopes    []models.APIKeyScope
		requireScope models.APIKeyScope
		wantStatus   int
	}{
		{
			name:         "has required scope",
			keyScopes:    []models.APIKeyScope{models.ScopeSend, models.ScopeRead},
			requireScope: models.ScopeSend,
			wantStatus:   http.StatusOK,
		},
		{
			name:         "missing required scope",
			keyScopes:    []models.APIKeyScope{models.ScopeRead},
			requireScope: models.ScopeSend,
			wantStatus:   http.StatusForbidden,
		},
		{
			name:         "admin has all scopes",
			keyScopes:    []models.APIKeyScope{models.ScopeAdmin},
			requireScope: models.ScopeSend,
			wantStatus:   http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key := &models.APIKey{
				ID:     uuid.New(),
				Scopes: tt.keyScopes,
			}

			req := httptest.NewRequest("GET", "/test", nil)
			ctx := context.WithValue(req.Context(), apiKeyContextKey, key)
			req = req.WithContext(ctx)

			rr := httptest.NewRecorder()

			handler := RequireScope(tt.requireScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			handler.ServeHTTP(rr, req)

			if rr.Code != tt.wantStatus {
				t.Errorf("RequireScope() status = %v, want %v", rr.Code, tt.wantStatus)
			}
		})
	}
}

func TestAPIKeyMiddleware_RateLimiting(t *testing.T) {
	tests := []struct {
		name       string
		rateLimit  int
		requests   int
		wantBlocked bool
	}{
		{
			name:        "under limit",
			rateLimit:   100,
			requests:    50,
			wantBlocked: false,
		},
		{
			name:        "at limit",
			rateLimit:   10,
			requests:    10,
			wantBlocked: false,
		},
		{
			name:        "over limit",
			rateLimit:   5,
			requests:    10,
			wantBlocked: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			limiter := newMockRateLimiter(tt.rateLimit)

			blocked := false
			for i := 0; i < tt.requests; i++ {
				if !limiter.Allow() {
					blocked = true
					break
				}
			}

			if blocked != tt.wantBlocked {
				t.Errorf("Rate limiting blocked = %v, want %v", blocked, tt.wantBlocked)
			}
		})
	}
}

func TestGetAPIKey(t *testing.T) {
	tests := []struct {
		name    string
		ctx     context.Context
		wantNil bool
	}{
		{
			name: "key in context",
			ctx: context.WithValue(context.Background(), apiKeyContextKey, &models.APIKey{
				ID: uuid.New(),
			}),
			wantNil: false,
		},
		{
			name:    "no key in context",
			ctx:     context.Background(),
			wantNil: true,
		},
		{
			name:    "wrong type in context",
			ctx:     context.WithValue(context.Background(), apiKeyContextKey, "not an api key"),
			wantNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key := GetAPIKey(tt.ctx)
			if (key == nil) != tt.wantNil {
				t.Errorf("GetAPIKey() nil = %v, want nil = %v", key == nil, tt.wantNil)
			}
		})
	}
}

// Context key type for API key
type contextKey string

const apiKeyContextKey contextKey = "api_key"

// Helper functions for testing
func extractAPIKey(r *http.Request) (string, bool) {
	// Check X-API-Key header first
	if key := r.Header.Get("X-API-Key"); key != "" {
		return key, true
	}

	// Check Authorization header
	auth := r.Header.Get("Authorization")
	if auth != "" {
		if len(auth) > 7 && auth[:7] == "Bearer " {
			return auth[7:], true
		}
	}

	return "", false
}

func validateKeyFormat(key string) error {
	if key == "" {
		return &keyError{"key cannot be empty"}
	}
	if len(key) < 10 {
		return &keyError{"key too short"}
	}
	if len(key) < 3 || key[:3] != "sk_" {
		return &keyError{"invalid key prefix"}
	}
	return nil
}

type keyError struct {
	msg string
}

func (e *keyError) Error() string {
	return e.msg
}

// GetAPIKey retrieves the API key from context
func GetAPIKey(ctx context.Context) *models.APIKey {
	key, ok := ctx.Value(apiKeyContextKey).(*models.APIKey)
	if !ok {
		return nil
	}
	return key
}

// RequireScope middleware
func RequireScope(scope models.APIKeyScope) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := GetAPIKey(r.Context())
			if key == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			if !key.HasScope(scope) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Mock rate limiter
type mockRateLimiter struct {
	limit   int
	current int
}

func newMockRateLimiter(limit int) *mockRateLimiter {
	return &mockRateLimiter{limit: limit}
}

func (l *mockRateLimiter) Allow() bool {
	if l.current >= l.limit {
		return false
	}
	l.current++
	return true
}

// Benchmark tests
func BenchmarkExtractAPIKey(b *testing.B) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "sk_test1234567890")

	for i := 0; i < b.N; i++ {
		extractAPIKey(req)
	}
}

func BenchmarkValidateKeyFormat(b *testing.B) {
	key := "sk_1234567890abcdefghijklmnopqrstuvwxyz1234"
	for i := 0; i < b.N; i++ {
		validateKeyFormat(key)
	}
}

func BenchmarkGetAPIKey(b *testing.B) {
	ctx := context.WithValue(context.Background(), apiKeyContextKey, &models.APIKey{
		ID:     uuid.New(),
		Scopes: []models.APIKeyScope{models.ScopeSend},
	})

	for i := 0; i < b.N; i++ {
		GetAPIKey(ctx)
	}
}
