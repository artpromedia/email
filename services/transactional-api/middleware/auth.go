package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"transactional-api/config"
	"transactional-api/repository"
)

type contextKey string

const (
	ContextKeyAPIKey contextKey = "api_key"
	ContextKeyOrgID  contextKey = "organization_id"
)

// APIKeyAuth middleware validates API key from Authorization header or X-API-Key header
func APIKeyAuth(repo *repository.APIKeyRepository, logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract API key from header
			apiKey := extractAPIKey(r)
			if apiKey == "" {
				writeError(w, http.StatusUnauthorized, "API key is required")
				return
			}

			// Hash the key for lookup
			keyHash := hashAPIKey(apiKey)

			// Validate key
			key, err := repo.GetByHash(r.Context(), keyHash)
			if err != nil {
				logger.Debug("API key lookup failed", zap.Error(err))
				writeError(w, http.StatusUnauthorized, "Invalid API key")
				return
			}

			// Check if key is active
			if !key.IsActive {
				writeError(w, http.StatusUnauthorized, "API key is inactive")
				return
			}

			// Check expiration
			if key.ExpiresAt != nil && key.ExpiresAt.Before(time.Now()) {
				writeError(w, http.StatusUnauthorized, "API key has expired")
				return
			}

			// Update last used timestamp (async)
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				repo.UpdateLastUsed(ctx, key.ID)
			}()

			// Add key info to context
			ctx := context.WithValue(r.Context(), ContextKeyAPIKey, key)
			ctx = context.WithValue(ctx, ContextKeyOrgID, key.OrganizationID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RateLimit middleware applies rate limiting per API key
func RateLimit(redisClient *redis.Client, cfg config.RateLimitConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Context().Value(ContextKeyAPIKey)
			if key == nil {
				next.ServeHTTP(w, r)
				return
			}

			apiKey := key.(*repository.APIKeyResult)

			// Check rate limits
			ctx := r.Context()

			// Per-second limit
			secKey := fmt.Sprintf("ratelimit:%s:sec:%d", apiKey.ID, time.Now().Unix())
			secCount, _ := redisClient.Incr(ctx, secKey).Result()
			redisClient.Expire(ctx, secKey, 2*time.Second)

			if int(secCount) > cfg.RequestsPerSecond {
				w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", cfg.RequestsPerSecond))
				w.Header().Set("X-RateLimit-Remaining", "0")
				w.Header().Set("Retry-After", "1")
				writeError(w, http.StatusTooManyRequests, "Rate limit exceeded (per-second)")
				return
			}

			// Per-minute limit
			minKey := fmt.Sprintf("ratelimit:%s:min:%d", apiKey.ID, time.Now().Unix()/60)
			minCount, _ := redisClient.Incr(ctx, minKey).Result()
			redisClient.Expire(ctx, minKey, 2*time.Minute)

			if int(minCount) > cfg.RequestsPerMinute {
				w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", cfg.RequestsPerMinute))
				w.Header().Set("X-RateLimit-Remaining", "0")
				w.Header().Set("Retry-After", "60")
				writeError(w, http.StatusTooManyRequests, "Rate limit exceeded (per-minute)")
				return
			}

			// Per-hour limit
			hourKey := fmt.Sprintf("ratelimit:%s:hour:%d", apiKey.ID, time.Now().Unix()/3600)
			hourCount, _ := redisClient.Incr(ctx, hourKey).Result()
			redisClient.Expire(ctx, hourKey, 2*time.Hour)

			if int(hourCount) > cfg.RequestsPerHour {
				w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", cfg.RequestsPerHour))
				w.Header().Set("X-RateLimit-Remaining", "0")
				w.Header().Set("Retry-After", "3600")
				writeError(w, http.StatusTooManyRequests, "Rate limit exceeded (per-hour)")
				return
			}

			// Add rate limit headers
			w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", cfg.RequestsPerMinute))
			w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", cfg.RequestsPerMinute-int(minCount)))

			next.ServeHTTP(w, r)
		})
	}
}

func extractAPIKey(r *http.Request) string {
	// Check X-API-Key header first
	if key := r.Header.Get("X-API-Key"); key != "" {
		return key
	}

	// Check Authorization header (Bearer token)
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}

	return ""
}

func hashAPIKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":"%s"}`, message)
}
