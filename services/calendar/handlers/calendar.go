package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"calendar-service/models"
	"calendar-service/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type CalendarHandler struct {
	service *service.CalendarService
	logger  *zap.Logger
}

func NewCalendarHandler(svc *service.CalendarService, logger *zap.Logger) *CalendarHandler {
	return &CalendarHandler{
		service: svc,
		logger:  logger,
	}
}

// getUserID extracts user ID from request context (set by auth middleware)
func getUserID(r *http.Request) uuid.UUID {
	if uid, ok := r.Context().Value("user_id").(uuid.UUID); ok {
		return uid
	}
	return uuid.Nil
}

// respondJSON sends JSON response
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

// respondError sends error response
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// Calendar handlers

func (h *CalendarHandler) ListCalendars(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	calendars, err := h.service.ListCalendars(r.Context(), userID)
	if err != nil {
		h.logger.Error("Failed to list calendars", zap.Error(err))
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, calendars)
}

func (h *CalendarHandler) CreateCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req models.CreateCalendarRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}

	calendar, err := h.service.CreateCalendar(r.Context(), userID, &req)
	if err != nil {
		h.logger.Error("Failed to create calendar", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, calendar)
}

func (h *CalendarHandler) GetCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	calendarID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid calendar id")
		return
	}

	calendar, err := h.service.GetCalendar(r.Context(), userID, calendarID)
	if err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		h.logger.Error("Failed to get calendar", zap.Error(err))
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if calendar == nil {
		respondError(w, http.StatusNotFound, "calendar not found")
		return
	}

	respondJSON(w, http.StatusOK, calendar)
}

func (h *CalendarHandler) UpdateCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	calendarID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid calendar id")
		return
	}

	var req models.UpdateCalendarRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	calendar, err := h.service.UpdateCalendar(r.Context(), userID, calendarID, &req)
	if err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		if err.Error() == "calendar not found" {
			respondError(w, http.StatusNotFound, "calendar not found")
			return
		}
		h.logger.Error("Failed to update calendar", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, calendar)
}

func (h *CalendarHandler) DeleteCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	calendarID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid calendar id")
		return
	}

	if err := h.service.DeleteCalendar(r.Context(), userID, calendarID); err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		if err.Error() == "calendar not found" {
			respondError(w, http.StatusNotFound, "calendar not found")
			return
		}
		if err.Error() == "cannot delete default calendar" {
			respondError(w, http.StatusBadRequest, "cannot delete default calendar")
			return
		}
		h.logger.Error("Failed to delete calendar", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *CalendarHandler) ShareCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	calendarID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid calendar id")
		return
	}

	var req models.ShareCalendarRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	targetUserID := req.UserID

	if err := h.service.ShareCalendar(r.Context(), userID, calendarID, targetUserID, req.Permission); err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		h.logger.Error("Failed to share calendar", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "shared"})
}

func (h *CalendarHandler) UnshareCalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	calendarID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid calendar id")
		return
	}

	targetUserID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	if err := h.service.UnshareCalendar(r.Context(), userID, calendarID, targetUserID); err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		h.logger.Error("Failed to unshare calendar", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Event handlers

func (h *CalendarHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	req := models.ListEventsRequest{
		Limit:  100,
		Offset: 0,
	}

	// Parse calendar_id
	if calIDStr := r.URL.Query().Get("calendar_id"); calIDStr != "" {
		calID, err := uuid.Parse(calIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid calendar_id")
			return
		}
		req.CalendarID = calID
	}

	// Parse time range
	if startStr := r.URL.Query().Get("start"); startStr != "" {
		start, err := time.Parse(time.RFC3339, startStr)
		if err != nil {
			// Try date-only format
			start, err = time.Parse("2006-01-02", startStr)
			if err != nil {
				respondError(w, http.StatusBadRequest, "invalid start date")
				return
			}
		}
		req.Start = start
	} else {
		req.Start = time.Now().AddDate(0, -1, 0) // Default: 1 month ago
	}

	if endStr := r.URL.Query().Get("end"); endStr != "" {
		end, err := time.Parse(time.RFC3339, endStr)
		if err != nil {
			end, err = time.Parse("2006-01-02", endStr)
			if err != nil {
				respondError(w, http.StatusBadRequest, "invalid end date")
				return
			}
			end = end.Add(24 * time.Hour) // Include full day
		}
		req.End = end
	} else {
		req.End = time.Now().AddDate(0, 1, 0) // Default: 1 month ahead
	}

	// Parse pagination
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		limit, _ := strconv.Atoi(limitStr)
		if limit > 0 && limit <= 500 {
			req.Limit = limit
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		offset, _ := strconv.Atoi(offsetStr)
		if offset >= 0 {
			req.Offset = offset
		}
	}

	result, err := h.service.ListEvents(r.Context(), userID, &req)
	if err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		h.logger.Error("Failed to list events", zap.Error(err))
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

func (h *CalendarHandler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req models.CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validation
	if req.CalendarID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "calendar_id is required")
		return
	}
	if req.Title == "" {
		respondError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.StartTime.IsZero() || req.EndTime.IsZero() {
		respondError(w, http.StatusBadRequest, "start_time and end_time are required")
		return
	}
	if req.EndTime.Before(req.StartTime) {
		respondError(w, http.StatusBadRequest, "end_time must be after start_time")
		return
	}

	event, err := h.service.CreateEvent(r.Context(), userID, &req)
	if err != nil {
		if err.Error() == "access denied to calendar" {
			respondError(w, http.StatusForbidden, "access denied to calendar")
			return
		}
		h.logger.Error("Failed to create event", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, event)
}

func (h *CalendarHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	event, err := h.service.GetEvent(r.Context(), userID, eventID)
	if err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		h.logger.Error("Failed to get event", zap.Error(err))
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if event == nil {
		respondError(w, http.StatusNotFound, "event not found")
		return
	}

	respondJSON(w, http.StatusOK, event)
}

func (h *CalendarHandler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var req models.UpdateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	event, err := h.service.UpdateEvent(r.Context(), userID, eventID, &req)
	if err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		if err.Error() == "event not found" {
			respondError(w, http.StatusNotFound, "event not found")
			return
		}
		h.logger.Error("Failed to update event", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, event)
}

func (h *CalendarHandler) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	notifyAttendees := r.URL.Query().Get("notify") != "false"

	if err := h.service.DeleteEvent(r.Context(), userID, eventID, notifyAttendees); err != nil {
		if err.Error() == "access denied" {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
		if err.Error() == "event not found" {
			respondError(w, http.StatusNotFound, "event not found")
			return
		}
		h.logger.Error("Failed to delete event", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *CalendarHandler) RespondToEvent(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var req models.RSVPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Status == "" {
		respondError(w, http.StatusBadRequest, "status is required")
		return
	}

	// Get user's email from context (in real implementation)
	email := r.Context().Value("user_email").(string)

	if err := h.service.RespondToEvent(r.Context(), userID, eventID, email, req.Status, req.Comment); err != nil {
		h.logger.Error("Failed to respond to event", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

func (h *CalendarHandler) SearchEvents(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		respondError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	var start, end time.Time
	if startStr := r.URL.Query().Get("start"); startStr != "" {
		start, _ = time.Parse("2006-01-02", startStr)
	} else {
		start = time.Now().AddDate(-1, 0, 0)
	}
	if endStr := r.URL.Query().Get("end"); endStr != "" {
		end, _ = time.Parse("2006-01-02", endStr)
	} else {
		end = time.Now().AddDate(1, 0, 0)
	}

	events, err := h.service.SearchEvents(r.Context(), userID, query, start, end)
	if err != nil {
		h.logger.Error("Failed to search events", zap.Error(err))
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, events)
}

func (h *CalendarHandler) GetFreeBusy(w http.ResponseWriter, r *http.Request) {
	usersStr := r.URL.Query().Get("users")
	if usersStr == "" {
		respondError(w, http.StatusBadRequest, "users parameter is required")
		return
	}

	var userIDs []uuid.UUID
	for _, idStr := range splitAndTrim(usersStr, ",") {
		id, err := uuid.Parse(idStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid user id: "+idStr)
			return
		}
		userIDs = append(userIDs, id)
	}

	var start, end time.Time
	if startStr := r.URL.Query().Get("start"); startStr != "" {
		start, _ = time.Parse(time.RFC3339, startStr)
		if start.IsZero() {
			start, _ = time.Parse("2006-01-02", startStr)
		}
	} else {
		start = time.Now()
	}
	if endStr := r.URL.Query().Get("end"); endStr != "" {
		end, _ = time.Parse(time.RFC3339, endStr)
		if end.IsZero() {
			end, _ = time.Parse("2006-01-02", endStr)
		}
	} else {
		end = time.Now().Add(24 * time.Hour)
	}

	result, err := h.service.GetFreeBusy(r.Context(), userIDs, start, end)
	if err != nil {
		h.logger.Error("Failed to get free/busy", zap.Error(err))
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

func splitAndTrim(s, sep string) []string {
	var result []string
	for _, part := range splitString(s, sep) {
		trimmed := trimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func splitString(s, sep string) []string {
	result := []string{}
	start := 0
	for i := 0; i <= len(s)-len(sep); i++ {
		if s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
