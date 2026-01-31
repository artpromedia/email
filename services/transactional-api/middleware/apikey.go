package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/artpromedia/email/services/transactional-api/models"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

type contextKey string

const (
	APIKeyContextKey contextKey = "api_key"
	DomainIDContextKey contextKey = "domain_id"
)

// APIKeyMiddleware handles API key authentication
type APIKeyMiddleware struct {
	repo   *repository.APIKeyRepository
	redis  *redis.Client
	logger zerolog.Logger
}

// NewAPIKeyMiddleware creates a new APIKeyMiddleware
func NewAPIKeyMiddleware(repo *repository.APIKeyRepository, redisClient *redis.Client, logger zerolog.Logger) *APIKeyMiddleware {
	return &APIKeyMiddleware{
		repo:   repo,
		redis:  redisClient,
		logger: logger,
	}
}

// Authenticate validates the API key and adds it to context
func (m *APIKeyMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract API key from header
		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" {
			// Also check Authorization header for Bearer token format
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				apiKey = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if apiKey == "" {
			m.errorResponse(w, http.StatusUnauthorized, "missing_api_key", "API key is required")
			return
		}

		// Hash the key for lookup
		keyHash := repository.HashAPIKey(apiKey)

		// Try to get from cache first
		cachedKey, err := m.getCachedKey(r.Context(), keyHash)
		if err != nil {
			m.logger.Warn().Err(err).Msg("Failed to get cached API key")
		}

		var key *models.APIKey
		if cachedKey != nil {
			key = cachedKey
		} else {
			// Lookup in database
			key, err = m.repo.GetByHash(r.Context(), keyHash)
			if err != nil {
				if err == repository.ErrAPIKeyNotFound {
					m.errorResponse(w, http.StatusUnauthorized, "invalid_api_key", "Invalid API key")
					return
				}
				m.logger.Error().Err(err).Msg("Failed to lookup API key")
				m.errorResponse(w, http.StatusInternalServerError, "internal_error", "Internal server error")
				return
			}

			// Cache the key
			if err := m.cacheKey(r.Context(), keyHash, key); err != nil {
				m.logger.Warn().Err(err).Msg("Failed to cache API key")
			}
		}

		// Validate key
		if !key.IsValid() {
			if key.RevokedAt != nil {
				m.errorResponse(w, http.StatusUnauthorized, "api_key_revoked", "API key has been revoked")
				return
			}
			if key.ExpiresAt != nil && key.ExpiresAt.Before(time.Now()) {
				m.errorResponse(w, http.StatusUnauthorized, "api_key_expired", "API key has expired")
				return
			}
		}

		// Update last used (async)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = m.repo.UpdateLastUsed(ctx, key.ID)
		}()

		// Add to context
		ctx := context.WithValue(r.Context(), APIKeyContextKey, key)
		ctx = context.WithValue(ctx, DomainIDContextKey, key.DomainID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireScope creates middleware that requires specific API key scopes
func (m *APIKeyMiddleware) RequireScope(scopes ...models.APIKeyScope) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := GetAPIKey(r.Context())
			if key == nil {
				m.errorResponse(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
				return
			}

			if !key.HasAnyScope(scopes...) {
				m.errorResponse(w, http.StatusForbidden, "insufficient_scope",
					"API key does not have required scope")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RateLimit applies rate limiting based on API key configuration
func (m *APIKeyMiddleware) RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := GetAPIKey(r.Context())
		if key == nil {
			next.ServeHTTP(w, r)
			return
		}

		// Check minute rate limit
		minuteKey := "ratelimit:minute:" + key.ID.String()
		count, err := m.redis.Incr(r.Context(), minuteKey).Result()
		if err != nil {
			m.logger.Warn().Err(err).Msg("Failed to increment rate limit counter")
			next.ServeHTTP(w, r)
			return
		}

		if count == 1 {
			m.redis.Expire(r.Context(), minuteKey, time.Minute)
		}

		if count > int64(key.RateLimit) {
			w.Header().Set("X-RateLimit-Limit", itoa(key.RateLimit))
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.Header().Set("Retry-After", "60")
			m.errorResponse(w, http.StatusTooManyRequests, "rate_limit_exceeded",
				"Rate limit exceeded. Please wait before making more requests.")
			return
		}

		// Check daily limit
		dayKey := "ratelimit:day:" + key.ID.String()
		dayCount, err := m.redis.Incr(r.Context(), dayKey).Result()
		if err != nil {
			m.logger.Warn().Err(err).Msg("Failed to increment daily rate limit counter")
		} else {
			if dayCount == 1 {
				// Set expiry to end of day
				now := time.Now()
				endOfDay := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
				m.redis.ExpireAt(r.Context(), dayKey, endOfDay)
			}

			if dayCount > int64(key.DailyLimit) {
				w.Header().Set("X-RateLimit-Daily-Limit", itoa(key.DailyLimit))
				w.Header().Set("X-RateLimit-Daily-Remaining", "0")
				m.errorResponse(w, http.StatusTooManyRequests, "daily_limit_exceeded",
					"Daily request limit exceeded. Limit resets at midnight UTC.")
				return
			}
		}

		// Add rate limit headers
		w.Header().Set("X-RateLimit-Limit", itoa(key.RateLimit))
		w.Header().Set("X-RateLimit-Remaining", itoa(key.RateLimit-int(count)))

		next.ServeHTTP(w, r)
	})
}

// getCachedKey retrieves an API key from Redis cache
func (m *APIKeyMiddleware) getCachedKey(ctx context.Context, keyHash string) (*models.APIKey, error) {
	if m.redis == nil {
		return nil, nil
	}

	data, err := m.redis.Get(ctx, "apikey:"+keyHash).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, err
	}

	var key models.APIKey
	if err := json.Unmarshal(data, &key); err != nil {
		return nil, err
	}

	return &key, nil
}

// cacheKey stores an API key in Redis cache
func (m *APIKeyMiddleware) cacheKey(ctx context.Context, keyHash string, key *models.APIKey) error {
	if m.redis == nil {
		return nil
	}

	data, err := json.Marshal(key)
	if err != nil {
		return err
	}

	return m.redis.Set(ctx, "apikey:"+keyHash, data, 5*time.Minute).Err()
}

// GetAPIKey retrieves the API key from context
func GetAPIKey(ctx context.Context) *models.APIKey {
	if key, ok := ctx.Value(APIKeyContextKey).(*models.APIKey); ok {
		return key
	}
	return nil
}

// GetDomainID retrieves the domain ID from context
func GetDomainID(ctx context.Context) string {
	if key := GetAPIKey(ctx); key != nil {
		return key.DomainID.String()
	}
	return ""
}

func (m *APIKeyMiddleware) errorResponse(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}

func itoa(i int) string {
	if i < 10 {
		return string(rune('0' + i))
	}
	return strings.TrimLeft(strings.Replace(string(rune(i)), "", "", -1), "")
}

// InvalidateCache removes a cached API key
func (m *APIKeyMiddleware) InvalidateCache(ctx context.Context, keyHash string) error {
	if m.redis == nil {
		return nil
	}
	return m.redis.Del(ctx, "apikey:"+keyHash).Err()
}
