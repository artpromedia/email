package handler

import (
	"net/http"

	"transactional-api/service"
	"github.com/go-chi/chi/v5"
)

// trackOpen handles GET /t/o/{data} - tracking pixel for opens
func (h *Handler) trackOpen(w http.ResponseWriter, r *http.Request) {
	encodedData := chi.URLParam(r, "data")
	if encodedData == "" {
		// Still return pixel to not break email rendering
		h.serveTrackingPixel(w)
		return
	}

	// Decode tracking data
	data, err := service.DecodePixelData(encodedData)
	if err != nil {
		h.logger.Debug().Err(err).Msg("Failed to decode tracking pixel data")
		h.serveTrackingPixel(w)
		return
	}

	// Get user agent and IP
	userAgent := r.Header.Get("User-Agent")
	ipAddress := getClientIP(r)

	// Record the open (async)
	go func() {
		if err := h.trackingService.RecordOpen(r.Context(), data, userAgent, ipAddress); err != nil {
			h.logger.Error().Err(err).Msg("Failed to record open")
		}
	}()

	h.serveTrackingPixel(w)
}

// trackClick handles GET /t/c/{data} - redirect for click tracking
func (h *Handler) trackClick(w http.ResponseWriter, r *http.Request) {
	encodedData := chi.URLParam(r, "data")
	if encodedData == "" {
		h.errorResponse(w, http.StatusBadRequest, "invalid_request", "Missing tracking data")
		return
	}

	// Decode tracking data
	data, err := service.DecodeLinkData(encodedData)
	if err != nil {
		h.logger.Debug().Err(err).Msg("Failed to decode tracking link data")
		h.errorResponse(w, http.StatusBadRequest, "invalid_request", "Invalid tracking data")
		return
	}

	// Get user agent and IP
	userAgent := r.Header.Get("User-Agent")
	ipAddress := getClientIP(r)

	// Record the click (async)
	go func() {
		if _, err := h.trackingService.RecordClick(r.Context(), data, userAgent, ipAddress); err != nil {
			h.logger.Error().Err(err).Msg("Failed to record click")
		}
	}()

	// Redirect to original URL
	http.Redirect(w, r, data.OriginalURL, http.StatusFound)
}

// serveTrackingPixel serves a 1x1 transparent GIF
func (h *Handler) serveTrackingPixel(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.WriteHeader(http.StatusOK)
	w.Write(service.TrackingPixel())
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first (for proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	return r.RemoteAddr
}
