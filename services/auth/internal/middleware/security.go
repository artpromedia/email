package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// SecurityHeaders adds security-related HTTP headers to responses.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Prevent MIME type sniffing
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Prevent clickjacking
		w.Header().Set("X-Frame-Options", "DENY")
		// Enable browser XSS protection
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		// Control referrer information
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// Enforce HTTPS
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		// Restrict permissions
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// Content Security Policy for API
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		// Prevent caching of auth responses
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, private")
		w.Header().Set("Pragma", "no-cache")

		next.ServeHTTP(w, r)
	})
}

// RequestSizeLimiter limits the size of request bodies.
func RequestSizeLimiter(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > maxBytes {
				http.Error(w, `{"error":"request_too_large","message":"request body exceeds maximum size"}`, http.StatusRequestEntityTooLarge)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// SimpleRateLimiter implements a basic in-memory rate limiter using token bucket.
// For production with multiple instances, use Redis-based rate limiting.
type SimpleRateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int           // requests per window
	window   time.Duration // window duration
}

type visitor struct {
	count    int
	lastSeen time.Time
}

// NewSimpleRateLimiter creates a rate limiter.
func NewSimpleRateLimiter(rate int, window time.Duration) *SimpleRateLimiter {
	rl := &SimpleRateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		window:   window,
	}
	// Cleanup stale entries every minute
	go rl.cleanup()
	return rl
}

func (rl *SimpleRateLimiter) cleanup() {
	for {
		time.Sleep(time.Minute)
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.lastSeen) > rl.window*2 {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// RateLimit returns an HTTP middleware that rate limits by client IP.
func (rl *SimpleRateLimiter) RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		// Use X-Real-IP if behind proxy
		if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
			ip = realIP
		}

		rl.mu.Lock()
		v, exists := rl.visitors[ip]
		if !exists {
			rl.visitors[ip] = &visitor{count: 1, lastSeen: time.Now()}
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		// Reset counter if window has passed
		if time.Since(v.lastSeen) > rl.window {
			v.count = 1
			v.lastSeen = time.Now()
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		v.count++
		v.lastSeen = time.Now()

		if v.count > rl.rate {
			rl.mu.Unlock()
			log.Warn().Str("ip", ip).Int("count", v.count).Msg("Rate limit exceeded")
			w.Header().Set("Retry-After", "60")
			http.Error(w, `{"error":"rate_limited","message":"too many requests"}`, http.StatusTooManyRequests)
			return
		}

		rl.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}

// StrictRateLimit creates a stricter rate limiter for sensitive endpoints like login/register.
func StrictRateLimit(requestsPerMinute int) func(http.Handler) http.Handler {
	rl := NewSimpleRateLimiter(requestsPerMinute, time.Minute)
	return rl.RateLimit
}
