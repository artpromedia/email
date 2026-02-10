package handler

import (
	"net/http"
	"time"

	"transactional-api/middleware"
	"transactional-api/models"
)

// getAnalyticsOverview handles GET /api/v1/analytics/overview
func (h *Handler) getAnalyticsOverview(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)

	req := &models.AnalyticsRequest{
		DomainID:  apiKey.DomainID,
		StartDate: startDate,
		EndDate:   endDate,
	}

	stats, err := h.analyticsService.GetOverview(r.Context(), req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get analytics overview")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// getAnalyticsTimeSeries handles GET /api/v1/analytics/timeseries
func (h *Handler) getAnalyticsTimeSeries(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)
	period := models.AnalyticsPeriod(r.URL.Query().Get("period"))
	if period == "" {
		period = models.AnalyticsPeriodDay
	}

	req := &models.AnalyticsRequest{
		DomainID:  apiKey.DomainID,
		StartDate: startDate,
		EndDate:   endDate,
		Period:    period,
	}

	stats, err := h.analyticsService.GetTimeSeries(r.Context(), req)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get timeseries analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// getAnalyticsBounces handles GET /api/v1/analytics/bounces
func (h *Handler) getAnalyticsBounces(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)

	stats, err := h.analyticsService.GetBounces(r.Context(), apiKey.DomainID, startDate, endDate)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get bounce analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// getAnalyticsByCategory handles GET /api/v1/analytics/categories
func (h *Handler) getAnalyticsByCategory(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)

	stats, err := h.analyticsService.GetByCategory(r.Context(), apiKey.DomainID, startDate, endDate)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get category analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"categories": stats,
	})
}

// getAnalyticsByDomain handles GET /api/v1/analytics/domains
func (h *Handler) getAnalyticsByDomain(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)
	limit := h.parseInt(r, "limit", 20)

	stats, err := h.analyticsService.GetByDomain(r.Context(), apiKey.DomainID, startDate, endDate, limit)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get domain analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"domains": stats,
	})
}

// getAnalyticsGeo handles GET /api/v1/analytics/geo
func (h *Handler) getAnalyticsGeo(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)
	limit := h.parseInt(r, "limit", 20)

	stats, err := h.analyticsService.GetGeoDistribution(r.Context(), apiKey.DomainID, startDate, endDate, limit)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get geo analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"geo_distribution": stats,
	})
}

// getAnalyticsDevices handles GET /api/v1/analytics/devices
func (h *Handler) getAnalyticsDevices(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)

	stats, err := h.analyticsService.GetDeviceBreakdown(r.Context(), apiKey.DomainID, startDate, endDate)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get device analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"devices": stats,
	})
}

// getAnalyticsLinks handles GET /api/v1/analytics/links
func (h *Handler) getAnalyticsLinks(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)
	limit := h.parseInt(r, "limit", 20)

	stats, err := h.analyticsService.GetLinkPerformance(r.Context(), apiKey.DomainID, startDate, endDate, limit)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get link analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, map[string]any{
		"links": stats,
	})
}

// getAnalyticsEngagement handles GET /api/v1/analytics/engagement
func (h *Handler) getAnalyticsEngagement(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)

	stats, err := h.analyticsService.GetEngagement(r.Context(), apiKey.DomainID, startDate, endDate)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get engagement analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// getAnalyticsRealtime handles GET /api/v1/analytics/realtime
func (h *Handler) getAnalyticsRealtime(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	stats, err := h.analyticsService.GetRealTime(r.Context(), apiKey.DomainID)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get realtime analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// getAnalyticsComparison handles GET /api/v1/analytics/comparison
func (h *Handler) getAnalyticsComparison(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	startDate, endDate := h.parseDateRange(r)

	stats, err := h.analyticsService.GetComparison(r.Context(), apiKey.DomainID, startDate, endDate)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get comparison analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// getAnalyticsReputation handles GET /api/v1/analytics/reputation
func (h *Handler) getAnalyticsReputation(w http.ResponseWriter, r *http.Request) {
	apiKey := middleware.GetAPIKey(r.Context())
	if apiKey == nil {
		h.errorResponse(w, http.StatusUnauthorized, "unauthorized", "API key required")
		return
	}

	stats, err := h.analyticsService.GetReputation(r.Context(), apiKey.DomainID)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to get reputation analytics")
		h.errorResponse(w, http.StatusInternalServerError, "analytics_failed", "Failed to get analytics")
		return
	}

	h.jsonResponse(w, http.StatusOK, stats)
}

// parseDateRange parses start_date and end_date from query parameters
func (h *Handler) parseDateRange(r *http.Request) (time.Time, time.Time) {
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -30) // Default to last 30 days

	if startStr := r.URL.Query().Get("start_date"); startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil {
			startDate = t
		}
	}

	if endStr := r.URL.Query().Get("end_date"); endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil {
			endDate = t.Add(24*time.Hour - time.Second) // End of day
		}
	}

	return startDate, endDate
}
