package ratelimit

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/rs/zerolog"
)

// Limiter implements rate limiting
type Limiter struct {
	cache             *redis.Client
	orgTokensPerMin   int
	orgRequestsPerMin int
	userTokensPerMin  int
	userRequestsPerMin int
	burstMultiplier   float64
	degradeThreshold  float64
	localCounts       sync.Map // For quick local checks
	logger            zerolog.Logger
}

// LimiterConfig contains rate limiter configuration
type LimiterConfig struct {
	OrgTokensPerMin    int
	OrgRequestsPerMin  int
	UserTokensPerMin   int
	UserRequestsPerMin int
	BurstMultiplier    float64
	DegradeThreshold   float64
}

// NewLimiter creates a new rate limiter
func NewLimiter(cache *redis.Client, cfg LimiterConfig, logger zerolog.Logger) *Limiter {
	return &Limiter{
		cache:             cache,
		orgTokensPerMin:   cfg.OrgTokensPerMin,
		orgRequestsPerMin: cfg.OrgRequestsPerMin,
		userTokensPerMin:  cfg.UserTokensPerMin,
		userRequestsPerMin: cfg.UserRequestsPerMin,
		burstMultiplier:   cfg.BurstMultiplier,
		degradeThreshold:  cfg.DegradeThreshold,
		logger:            logger.With().Str("component", "ratelimit").Logger(),
	}
}

// LimitResult contains the result of a rate limit check
type LimitResult struct {
	Allowed         bool    `json:"allowed"`
	OrgRemaining    int     `json:"org_remaining"`
	UserRemaining   int     `json:"user_remaining"`
	RetryAfter      int     `json:"retry_after,omitempty"` // seconds
	DegradedMode    bool    `json:"degraded_mode"`
	Message         string  `json:"message,omitempty"`
}

// CheckLimit checks if a request is allowed
func (l *Limiter) CheckLimit(ctx context.Context, orgID, userID string, estimatedTokens int) (*LimitResult, error) {
	now := time.Now()
	minute := now.Truncate(time.Minute).Unix()

	// Check organization limits
	orgResult, err := l.checkOrgLimit(ctx, orgID, minute, estimatedTokens)
	if err != nil {
		l.logger.Warn().Err(err).Msg("Failed to check org limit, allowing request")
		return &LimitResult{Allowed: true, DegradedMode: true}, nil
	}

	if !orgResult.Allowed {
		return orgResult, nil
	}

	// Check user limits
	userResult, err := l.checkUserLimit(ctx, userID, minute, estimatedTokens)
	if err != nil {
		l.logger.Warn().Err(err).Msg("Failed to check user limit, allowing request")
		return &LimitResult{Allowed: true, DegradedMode: true}, nil
	}

	if !userResult.Allowed {
		return userResult, nil
	}

	// Combine results
	return &LimitResult{
		Allowed:       true,
		OrgRemaining:  orgResult.OrgRemaining,
		UserRemaining: userResult.UserRemaining,
		DegradedMode:  l.shouldDegrade(orgResult.OrgRemaining, userResult.UserRemaining),
	}, nil
}

// RecordUsage records actual token usage after a request
func (l *Limiter) RecordUsage(ctx context.Context, orgID, userID string, tokens int) error {
	minute := time.Now().Truncate(time.Minute).Unix()

	// Record organization usage
	orgTokenKey := fmt.Sprintf("ratelimit:org:%s:tokens:%d", orgID, minute)
	orgReqKey := fmt.Sprintf("ratelimit:org:%s:requests:%d", orgID, minute)

	pipe := l.cache.Pipeline()
	pipe.IncrBy(ctx, orgTokenKey, int64(tokens))
	pipe.Incr(ctx, orgReqKey)
	pipe.Expire(ctx, orgTokenKey, 2*time.Minute)
	pipe.Expire(ctx, orgReqKey, 2*time.Minute)

	// Record user usage
	userTokenKey := fmt.Sprintf("ratelimit:user:%s:tokens:%d", userID, minute)
	userReqKey := fmt.Sprintf("ratelimit:user:%s:requests:%d", userID, minute)

	pipe.IncrBy(ctx, userTokenKey, int64(tokens))
	pipe.Incr(ctx, userReqKey)
	pipe.Expire(ctx, userTokenKey, 2*time.Minute)
	pipe.Expire(ctx, userReqKey, 2*time.Minute)

	_, err := pipe.Exec(ctx)
	return err
}

// checkOrgLimit checks organization-level limits
func (l *Limiter) checkOrgLimit(ctx context.Context, orgID string, minute int64, estimatedTokens int) (*LimitResult, error) {
	tokenKey := fmt.Sprintf("ratelimit:org:%s:tokens:%d", orgID, minute)
	reqKey := fmt.Sprintf("ratelimit:org:%s:requests:%d", orgID, minute)

	// Get current usage
	tokenUsage, err := l.cache.Get(ctx, tokenKey).Int()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	reqUsage, err := l.cache.Get(ctx, reqKey).Int()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	// Calculate limits with burst
	tokenLimit := int(float64(l.orgTokensPerMin) * l.burstMultiplier)
	reqLimit := int(float64(l.orgRequestsPerMin) * l.burstMultiplier)

	// Check if would exceed limits
	if tokenUsage+estimatedTokens > tokenLimit {
		remaining := tokenLimit - tokenUsage
		retryAfter := 60 - (time.Now().Second())
		return &LimitResult{
			Allowed:      false,
			OrgRemaining: remaining,
			RetryAfter:   retryAfter,
			Message:      fmt.Sprintf("Organization token limit exceeded. Remaining: %d tokens", remaining),
		}, nil
	}

	if reqUsage+1 > reqLimit {
		remaining := reqLimit - reqUsage
		retryAfter := 60 - (time.Now().Second())
		return &LimitResult{
			Allowed:      false,
			OrgRemaining: remaining,
			RetryAfter:   retryAfter,
			Message:      fmt.Sprintf("Organization request limit exceeded. Remaining: %d requests", remaining),
		}, nil
	}

	return &LimitResult{
		Allowed:      true,
		OrgRemaining: l.orgTokensPerMin - tokenUsage - estimatedTokens,
	}, nil
}

// checkUserLimit checks user-level limits
func (l *Limiter) checkUserLimit(ctx context.Context, userID string, minute int64, estimatedTokens int) (*LimitResult, error) {
	tokenKey := fmt.Sprintf("ratelimit:user:%s:tokens:%d", userID, minute)
	reqKey := fmt.Sprintf("ratelimit:user:%s:requests:%d", userID, minute)

	// Get current usage
	tokenUsage, err := l.cache.Get(ctx, tokenKey).Int()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	reqUsage, err := l.cache.Get(ctx, reqKey).Int()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	// Calculate limits with burst
	tokenLimit := int(float64(l.userTokensPerMin) * l.burstMultiplier)
	reqLimit := int(float64(l.userRequestsPerMin) * l.burstMultiplier)

	// Check if would exceed limits
	if tokenUsage+estimatedTokens > tokenLimit {
		remaining := tokenLimit - tokenUsage
		retryAfter := 60 - (time.Now().Second())
		return &LimitResult{
			Allowed:       false,
			UserRemaining: remaining,
			RetryAfter:    retryAfter,
			Message:       fmt.Sprintf("User token limit exceeded. Remaining: %d tokens", remaining),
		}, nil
	}

	if reqUsage+1 > reqLimit {
		remaining := reqLimit - reqUsage
		retryAfter := 60 - (time.Now().Second())
		return &LimitResult{
			Allowed:       false,
			UserRemaining: remaining,
			RetryAfter:    retryAfter,
			Message:       fmt.Sprintf("User request limit exceeded. Remaining: %d requests", remaining),
		}, nil
	}

	return &LimitResult{
		Allowed:       true,
		UserRemaining: l.userTokensPerMin - tokenUsage - estimatedTokens,
	}, nil
}

// shouldDegrade checks if we should enter degraded mode
func (l *Limiter) shouldDegrade(orgRemaining, userRemaining int) bool {
	orgThreshold := int(float64(l.orgTokensPerMin) * l.degradeThreshold)
	userThreshold := int(float64(l.userTokensPerMin) * l.degradeThreshold)

	return orgRemaining < orgThreshold || userRemaining < userThreshold
}

// GetUsageStats returns current usage statistics
func (l *Limiter) GetUsageStats(ctx context.Context, orgID, userID string) (*UsageStats, error) {
	minute := time.Now().Truncate(time.Minute).Unix()

	orgTokenKey := fmt.Sprintf("ratelimit:org:%s:tokens:%d", orgID, minute)
	orgReqKey := fmt.Sprintf("ratelimit:org:%s:requests:%d", orgID, minute)
	userTokenKey := fmt.Sprintf("ratelimit:user:%s:tokens:%d", userID, minute)
	userReqKey := fmt.Sprintf("ratelimit:user:%s:requests:%d", userID, minute)

	pipe := l.cache.Pipeline()
	orgTokens := pipe.Get(ctx, orgTokenKey)
	orgReqs := pipe.Get(ctx, orgReqKey)
	userTokens := pipe.Get(ctx, userTokenKey)
	userReqs := pipe.Get(ctx, userReqKey)

	_, _ = pipe.Exec(ctx)

	orgTokenUsage, _ := orgTokens.Int()
	orgReqUsage, _ := orgReqs.Int()
	userTokenUsage, _ := userTokens.Int()
	userReqUsage, _ := userReqs.Int()

	return &UsageStats{
		OrgID:             orgID,
		UserID:            userID,
		OrgTokensUsed:     orgTokenUsage,
		OrgTokensLimit:    l.orgTokensPerMin,
		OrgRequestsUsed:   orgReqUsage,
		OrgRequestsLimit:  l.orgRequestsPerMin,
		UserTokensUsed:    userTokenUsage,
		UserTokensLimit:   l.userTokensPerMin,
		UserRequestsUsed:  userReqUsage,
		UserRequestsLimit: l.userRequestsPerMin,
		MinuteResetAt:     time.Unix(minute, 0).Add(time.Minute),
	}, nil
}

// UsageStats contains current usage statistics
type UsageStats struct {
	OrgID             string    `json:"org_id"`
	UserID            string    `json:"user_id"`
	OrgTokensUsed     int       `json:"org_tokens_used"`
	OrgTokensLimit    int       `json:"org_tokens_limit"`
	OrgRequestsUsed   int       `json:"org_requests_used"`
	OrgRequestsLimit  int       `json:"org_requests_limit"`
	UserTokensUsed    int       `json:"user_tokens_used"`
	UserTokensLimit   int       `json:"user_tokens_limit"`
	UserRequestsUsed  int       `json:"user_requests_used"`
	UserRequestsLimit int       `json:"user_requests_limit"`
	MinuteResetAt     time.Time `json:"minute_reset_at"`
}
