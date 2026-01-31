package middleware

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
)

// RequestLogger returns a logger middleware for HTTP requests
func RequestLogger(logger zerolog.Logger) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			defer func() {
				// Get API key info if present
				var apiKeyPrefix string
				if key := GetAPIKey(r.Context()); key != nil {
					apiKeyPrefix = key.KeyPrefix
				}

				duration := time.Since(start)

				logger.Info().
					Str("method", r.Method).
					Str("path", r.URL.Path).
					Int("status", ww.Status()).
					Int("bytes", ww.BytesWritten()).
					Dur("duration", duration).
					Str("ip", r.RemoteAddr).
					Str("user_agent", r.UserAgent()).
					Str("request_id", middleware.GetReqID(r.Context())).
					Str("api_key", apiKeyPrefix).
					Msg("request completed")
			}()

			next.ServeHTTP(ww, r)
		})
	}
}

// RecoveryLogger returns a recovery middleware that logs panics
func RecoveryLogger(logger zerolog.Logger) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					logger.Error().
						Interface("error", err).
						Str("method", r.Method).
						Str("path", r.URL.Path).
						Str("request_id", middleware.GetReqID(r.Context())).
						Msg("panic recovered")

					http.Error(w, `{"error":"internal_error","message":"Internal server error"}`,
						http.StatusInternalServerError)
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}
