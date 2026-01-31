package ratelimit

import (
	"context"
	"fmt"
	"sync"
	"time"

	"sms-gateway/internal/config"
	"sms-gateway/internal/repository"
)

// Limiter handles rate limiting for SMS requests
type Limiter struct {
	config config.RateLimitConfig
	repo   *repository.Repository
	local  map[string]*bucket
	mu     sync.Mutex
}

type bucket struct {
	count     int
	resetAt   time.Time
}

// LimitType represents the type of rate limit
type LimitType string

const (
	LimitTypeMinute LimitType = "minute"
	LimitTypeHour   LimitType = "hour"
	LimitTypeDay    LimitType = "day"
)

// Result represents the result of a rate limit check
type Result struct {
	Allowed    bool
	Remaining  int
	ResetAt    time.Time
	RetryAfter time.Duration
}

// New creates a new rate limiter
func New(cfg config.RateLimitConfig, repo *repository.Repository) *Limiter {
	return &Limiter{
		config: cfg,
		repo:   repo,
		local:  make(map[string]*bucket),
	}
}

// Check checks if a request is allowed for a given key
func (l *Limiter) Check(ctx context.Context, key string, limitType LimitType) (*Result, error) {
	if !l.config.Enabled {
		return &Result{Allowed: true, Remaining: -1}, nil
	}

	limit := l.getLimit(limitType, false)
	window := l.getWindow(limitType)

	return l.checkLimit(ctx, key, limit, window)
}

// CheckOTP checks rate limits specifically for OTP requests
func (l *Limiter) CheckOTP(ctx context.Context, userID, phoneNumber string) (*Result, error) {
	if !l.config.Enabled {
		return &Result{Allowed: true, Remaining: -1}, nil
	}

	// Check user rate limit per minute
	key := fmt.Sprintf("otp:user:%s:minute", userID)
	result, err := l.checkLimit(ctx, key, l.config.OTPPerMinute, time.Minute)
	if err != nil || !result.Allowed {
		return result, err
	}

	// Check user rate limit per hour
	key = fmt.Sprintf("otp:user:%s:hour", userID)
	result, err = l.checkLimit(ctx, key, l.config.OTPPerHour, time.Hour)
	if err != nil || !result.Allowed {
		return result, err
	}

	// Check phone number rate limit per day
	key = fmt.Sprintf("otp:phone:%s:day", phoneNumber)
	result, err = l.checkLimit(ctx, key, l.config.OTPPerPhonePerDay, 24*time.Hour)
	if err != nil || !result.Allowed {
		return result, err
	}

	return &Result{Allowed: true, Remaining: -1}, nil
}

// CheckAPI checks rate limits for API requests
func (l *Limiter) CheckAPI(ctx context.Context, apiKey string) (*Result, error) {
	if !l.config.Enabled {
		return &Result{Allowed: true, Remaining: -1}, nil
	}

	// Check per minute
	key := fmt.Sprintf("api:%s:minute", apiKey)
	result, err := l.checkLimit(ctx, key, l.config.DefaultPerMinute, time.Minute)
	if err != nil || !result.Allowed {
		return result, err
	}

	// Check per hour
	key = fmt.Sprintf("api:%s:hour", apiKey)
	result, err = l.checkLimit(ctx, key, l.config.DefaultPerHour, time.Hour)
	if err != nil || !result.Allowed {
		return result, err
	}

	// Check per day
	key = fmt.Sprintf("api:%s:day", apiKey)
	return l.checkLimit(ctx, key, l.config.DefaultPerDay, 24*time.Hour)
}

func (l *Limiter) checkLimit(ctx context.Context, key string, limit int, window time.Duration) (*Result, error) {
	// Try Redis first if available
	if l.repo != nil {
		count, resetAt, err := l.repo.IncrementRateLimit(ctx, key, window)
		if err == nil {
			remaining := limit - count
			if remaining < 0 {
				remaining = 0
			}
			return &Result{
				Allowed:    count <= limit,
				Remaining:  remaining,
				ResetAt:    resetAt,
				RetryAfter: time.Until(resetAt),
			}, nil
		}
	}

	// Fall back to local rate limiting
	return l.checkLocalLimit(key, limit, window), nil
}

func (l *Limiter) checkLocalLimit(key string, limit int, window time.Duration) *Result {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	b, ok := l.local[key]

	if !ok || now.After(b.resetAt) {
		b = &bucket{
			count:   0,
			resetAt: now.Add(window),
		}
		l.local[key] = b
	}

	b.count++

	remaining := limit - b.count
	if remaining < 0 {
		remaining = 0
	}

	return &Result{
		Allowed:    b.count <= limit,
		Remaining:  remaining,
		ResetAt:    b.resetAt,
		RetryAfter: time.Until(b.resetAt),
	}
}

func (l *Limiter) getLimit(limitType LimitType, isOTP bool) int {
	if isOTP {
		switch limitType {
		case LimitTypeMinute:
			return l.config.OTPPerMinute
		case LimitTypeHour:
			return l.config.OTPPerHour
		default:
			return l.config.OTPPerPhonePerDay
		}
	}

	switch limitType {
	case LimitTypeMinute:
		return l.config.DefaultPerMinute
	case LimitTypeHour:
		return l.config.DefaultPerHour
	default:
		return l.config.DefaultPerDay
	}
}

func (l *Limiter) getWindow(limitType LimitType) time.Duration {
	switch limitType {
	case LimitTypeMinute:
		return time.Minute
	case LimitTypeHour:
		return time.Hour
	default:
		return 24 * time.Hour
	}
}

// Reset resets the rate limit for a key
func (l *Limiter) Reset(ctx context.Context, key string) error {
	l.mu.Lock()
	delete(l.local, key)
	l.mu.Unlock()

	if l.repo != nil {
		return l.repo.ResetRateLimit(ctx, key)
	}
	return nil
}

// GetUsage returns current usage for a key
func (l *Limiter) GetUsage(ctx context.Context, key string) (int, error) {
	if l.repo != nil {
		return l.repo.GetRateLimitCount(ctx, key)
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if b, ok := l.local[key]; ok && time.Now().Before(b.resetAt) {
		return b.count, nil
	}
	return 0, nil
}

// Cleanup removes expired local buckets
func (l *Limiter) Cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	for key, b := range l.local {
		if now.After(b.resetAt) {
			delete(l.local, key)
		}
	}
}
