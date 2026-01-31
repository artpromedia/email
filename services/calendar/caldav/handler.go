package caldav

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"calendar-service/models"
	"calendar-service/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// CalDAV handler implements RFC 4791 (CalDAV)
type CalDAVHandler struct {
	service *service.CalendarService
	logger  *zap.Logger
	domain  string
}

func NewCalDAVHandler(svc *service.CalendarService, logger *zap.Logger, domain string) *CalDAVHandler {
	return &CalDAVHandler{
		service: svc,
		logger:  logger,
		domain:  domain,
	}
}

// RegisterRoutes registers CalDAV routes
func (h *CalDAVHandler) RegisterRoutes(r chi.Router) {
	// WebDAV/CalDAV methods
	r.HandleFunc("/*", h.handleRequest)
}

func (h *CalDAVHandler) handleRequest(w http.ResponseWriter, r *http.Request) {
	h.logger.Debug("CalDAV request",
		zap.String("method", r.Method),
		zap.String("path", r.URL.Path))

	switch r.Method {
	case "OPTIONS":
		h.handleOptions(w, r)
	case "PROPFIND":
		h.handlePropfind(w, r)
	case "PROPPATCH":
		h.handleProppatch(w, r)
	case "REPORT":
		h.handleReport(w, r)
	case "MKCALENDAR":
		h.handleMkcalendar(w, r)
	case "GET":
		h.handleGet(w, r)
	case "PUT":
		h.handlePut(w, r)
	case "DELETE":
		h.handleDelete(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *CalDAVHandler) handleOptions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Allow", "OPTIONS, GET, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCALENDAR")
	w.Header().Set("DAV", "1, 2, calendar-access")
	w.WriteHeader(http.StatusOK)
}

// PROPFIND - Discover calendars and properties
func (h *CalDAVHandler) handlePropfind(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == uuid.Nil {
		h.sendUnauthorized(w)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/caldav")
	depth := r.Header.Get("Depth")
	if depth == "" {
		depth = "1"
	}

	// Parse request body
	body, _ := io.ReadAll(r.Body)

	h.logger.Debug("PROPFIND",
		zap.String("path", path),
		zap.String("depth", depth),
		zap.String("body", string(body)))

	// Route based on path
	if path == "/" || path == "" {
		// Principal discovery
		h.propfindPrincipal(w, r, userID)
	} else if strings.HasSuffix(path, "/calendars/") || strings.HasSuffix(path, "/calendars") {
		// Calendar home
		h.propfindCalendarHome(w, r, userID, depth)
	} else if strings.Contains(path, "/calendars/") {
		// Specific calendar
		h.propfindCalendar(w, r, userID, path, depth)
	} else {
		// User principal
		h.propfindUserPrincipal(w, r, userID)
	}
}

func (h *CalDAVHandler) propfindPrincipal(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	// Return principal-URL pointing to user's calendar home
	userEmail := r.Context().Value("user_email").(string)

	response := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/caldav/</D:href>
    <D:propstat>
      <D:prop>
        <D:current-user-principal>
          <D:href>/caldav/%s/</D:href>
        </D:current-user-principal>
        <D:principal-collection-set>
          <D:href>/caldav/</D:href>
        </D:principal-collection-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`, userEmail)

	h.sendMultistatus(w, response)
}

func (h *CalDAVHandler) propfindUserPrincipal(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	userEmail := r.Context().Value("user_email").(string)

	response := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/caldav/%s/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>
          <D:principal/>
        </D:resourcetype>
        <C:calendar-home-set>
          <D:href>/caldav/%s/calendars/</D:href>
        </C:calendar-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`, userEmail, userEmail)

	h.sendMultistatus(w, response)
}

func (h *CalDAVHandler) propfindCalendarHome(w http.ResponseWriter, r *http.Request, userID uuid.UUID, depth string) {
	userEmail := r.Context().Value("user_email").(string)

	calendars, err := h.service.ListCalendars(r.Context(), userID)
	if err != nil {
		h.logger.Error("Failed to list calendars", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	var responses strings.Builder
	responses.WriteString(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:response>
    <D:href>/caldav/%s/calendars/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>
          <D:collection/>
        </D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`, userEmail))

	if depth != "0" {
		for _, cal := range calendars {
			responses.WriteString(fmt.Sprintf(`
  <D:response>
    <D:href>/caldav/%s/calendars/%s/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>
          <D:collection/>
          <C:calendar/>
        </D:resourcetype>
        <D:displayname>%s</D:displayname>
        <A:calendar-color>%s</A:calendar-color>
        <C:calendar-timezone>%s</C:calendar-timezone>
        <D:getctag>%s</D:getctag>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`, userEmail, cal.ID, xmlEscape(cal.Name), cal.Color, cal.Timezone, cal.SyncToken))
		}
	}

	responses.WriteString(`
</D:multistatus>`)

	h.sendMultistatus(w, responses.String())
}

func (h *CalDAVHandler) propfindCalendar(w http.ResponseWriter, r *http.Request, userID uuid.UUID, path, depth string) {
	// Extract calendar ID from path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	calendarIDStr := parts[len(parts)-1]
	if calendarIDStr == "" && len(parts) > 1 {
		calendarIDStr = parts[len(parts)-2]
	}

	calendarID, err := uuid.Parse(calendarIDStr)
	if err != nil {
		http.Error(w, "Invalid calendar ID", http.StatusBadRequest)
		return
	}

	calendar, err := h.service.GetCalendar(r.Context(), userID, calendarID)
	if err != nil || calendar == nil {
		http.Error(w, "Calendar not found", http.StatusNotFound)
		return
	}

	userEmail := r.Context().Value("user_email").(string)

	var responses strings.Builder
	responses.WriteString(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:response>
    <D:href>/caldav/%s/calendars/%s/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>
          <D:collection/>
          <C:calendar/>
        </D:resourcetype>
        <D:displayname>%s</D:displayname>
        <A:calendar-color>%s</A:calendar-color>
        <D:getctag>%s</D:getctag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`, userEmail, calendarID, xmlEscape(calendar.Name), calendar.Color, calendar.SyncToken))

	// If depth > 0, include events
	if depth != "0" {
		start := time.Now().AddDate(-1, 0, 0)
		end := time.Now().AddDate(1, 0, 0)

		result, err := h.service.ListEvents(r.Context(), userID, &models.ListEventsRequest{
			CalendarID: calendarID,
			Start:      start,
			End:        end,
			Limit:      1000,
		})
		if err == nil && result != nil {
			for _, event := range result.Events {
				responses.WriteString(fmt.Sprintf(`
  <D:response>
    <D:href>/caldav/%s/calendars/%s/%s.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"%s"</D:getetag>
        <D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`, userEmail, calendarID, event.UID, event.ETag))
			}
		}
	}

	responses.WriteString(`
</D:multistatus>`)

	h.sendMultistatus(w, responses.String())
}

// REPORT - Query events
func (h *CalDAVHandler) handleReport(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == uuid.Nil {
		h.sendUnauthorized(w)
		return
	}

	body, _ := io.ReadAll(r.Body)

	h.logger.Debug("REPORT", zap.String("body", string(body)))

	// Determine report type
	if bytes.Contains(body, []byte("calendar-multiget")) {
		h.handleMultiget(w, r, userID, body)
	} else if bytes.Contains(body, []byte("calendar-query")) {
		h.handleCalendarQuery(w, r, userID, body)
	} else if bytes.Contains(body, []byte("sync-collection")) {
		h.handleSyncCollection(w, r, userID, body)
	} else {
		http.Error(w, "Unsupported report", http.StatusBadRequest)
	}
}

func (h *CalDAVHandler) handleMultiget(w http.ResponseWriter, r *http.Request, userID uuid.UUID, body []byte) {
	// Extract calendar ID and UIDs from request
	path := strings.TrimPrefix(r.URL.Path, "/caldav")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	calendarID, err := uuid.Parse(parts[2])
	if err != nil {
		http.Error(w, "Invalid calendar ID", http.StatusBadRequest)
		return
	}

	// Parse hrefs from body
	uids := extractHrefs(body)

	events, err := h.service.GetMultipleEventsByUID(r.Context(), calendarID, uids)
	if err != nil {
		h.logger.Error("Failed to get events", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	userEmail := r.Context().Value("user_email").(string)

	var responses strings.Builder
	responses.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">`)

	for _, event := range events {
		ical := eventToICal(event)
		responses.WriteString(fmt.Sprintf(`
  <D:response>
    <D:href>/caldav/%s/calendars/%s/%s.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"%s"</D:getetag>
        <C:calendar-data>%s</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`, userEmail, calendarID, event.UID, event.ETag, xmlEscape(ical)))
	}

	responses.WriteString(`
</D:multistatus>`)

	h.sendMultistatus(w, responses.String())
}

func (h *CalDAVHandler) handleCalendarQuery(w http.ResponseWriter, r *http.Request, userID uuid.UUID, body []byte) {
	// Extract calendar ID
	path := strings.TrimPrefix(r.URL.Path, "/caldav")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	calendarID, err := uuid.Parse(parts[2])
	if err != nil {
		http.Error(w, "Invalid calendar ID", http.StatusBadRequest)
		return
	}

	// Parse time range from body (simplified)
	start := time.Now().AddDate(-1, 0, 0)
	end := time.Now().AddDate(1, 0, 0)

	result, err := h.service.ListEvents(r.Context(), userID, &models.ListEventsRequest{
		CalendarID: calendarID,
		Start:      start,
		End:        end,
		Limit:      1000,
	})
	if err != nil {
		h.logger.Error("Failed to list events", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	userEmail := r.Context().Value("user_email").(string)

	var responses strings.Builder
	responses.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">`)

	for _, event := range result.Events {
		ical := eventToICal(event)
		responses.WriteString(fmt.Sprintf(`
  <D:response>
    <D:href>/caldav/%s/calendars/%s/%s.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"%s"</D:getetag>
        <C:calendar-data>%s</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`, userEmail, calendarID, event.UID, event.ETag, xmlEscape(ical)))
	}

	responses.WriteString(`
</D:multistatus>`)

	h.sendMultistatus(w, responses.String())
}

func (h *CalDAVHandler) handleSyncCollection(w http.ResponseWriter, r *http.Request, userID uuid.UUID, body []byte) {
	// Extract sync-token from body
	syncToken := extractSyncToken(body)

	path := strings.TrimPrefix(r.URL.Path, "/caldav")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	calendarID, err := uuid.Parse(parts[2])
	if err != nil {
		http.Error(w, "Invalid calendar ID", http.StatusBadRequest)
		return
	}

	events, newToken, err := h.service.GetSyncChanges(r.Context(), calendarID, syncToken)
	if err != nil {
		h.logger.Error("Failed to get sync changes", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	userEmail := r.Context().Value("user_email").(string)

	var responses strings.Builder
	responses.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">`)

	for _, event := range events {
		ical := eventToICal(event)
		responses.WriteString(fmt.Sprintf(`
  <D:response>
    <D:href>/caldav/%s/calendars/%s/%s.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"%s"</D:getetag>
        <C:calendar-data>%s</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`, userEmail, calendarID, event.UID, event.ETag, xmlEscape(ical)))
	}

	responses.WriteString(fmt.Sprintf(`
  <D:sync-token>%s</D:sync-token>
</D:multistatus>`, newToken))

	h.sendMultistatus(w, responses.String())
}

// MKCALENDAR - Create calendar
func (h *CalDAVHandler) handleMkcalendar(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == uuid.Nil {
		h.sendUnauthorized(w)
		return
	}

	// Parse display name from body
	body, _ := io.ReadAll(r.Body)
	displayName := extractDisplayName(body)
	if displayName == "" {
		displayName = "New Calendar"
	}

	calendar, err := h.service.CreateCalendar(r.Context(), userID, &models.CreateCalendarRequest{
		Name: displayName,
	})
	if err != nil {
		h.logger.Error("Failed to create calendar", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Location", fmt.Sprintf("/caldav/%s/calendars/%s/",
		r.Context().Value("user_email"), calendar.ID))
	w.WriteHeader(http.StatusCreated)
}

// GET - Get event as iCalendar
func (h *CalDAVHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == uuid.Nil {
		h.sendUnauthorized(w)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/caldav")
	parts := strings.Split(strings.Trim(path, "/"), "/")

	if len(parts) < 4 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	calendarID, err := uuid.Parse(parts[2])
	if err != nil {
		http.Error(w, "Invalid calendar ID", http.StatusBadRequest)
		return
	}

	uid := strings.TrimSuffix(parts[3], ".ics")

	event, err := h.service.GetEventByUID(r.Context(), calendarID, uid)
	if err != nil {
		h.logger.Error("Failed to get event", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if event == nil {
		http.Error(w, "Event not found", http.StatusNotFound)
		return
	}

	ical := eventToICal(event)

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("ETag", fmt.Sprintf(`"%s"`, event.ETag))
	w.Write([]byte(ical))
}

// PUT - Create/update event
func (h *CalDAVHandler) handlePut(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == uuid.Nil {
		h.sendUnauthorized(w)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/caldav")
	parts := strings.Split(strings.Trim(path, "/"), "/")

	if len(parts) < 4 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	calendarID, err := uuid.Parse(parts[2])
	if err != nil {
		http.Error(w, "Invalid calendar ID", http.StatusBadRequest)
		return
	}

	uid := strings.TrimSuffix(parts[3], ".ics")

	// Parse iCalendar body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	event, err := parseICal(string(body))
	if err != nil {
		h.logger.Error("Failed to parse iCalendar", zap.Error(err))
		http.Error(w, "Invalid iCalendar", http.StatusBadRequest)
		return
	}

	// Create or update
	if err := h.service.CreateOrUpdateEvent(r.Context(), userID, calendarID, uid, event); err != nil {
		h.logger.Error("Failed to save event", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// DELETE - Delete event
func (h *CalDAVHandler) handleDelete(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == uuid.Nil {
		h.sendUnauthorized(w)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/caldav")
	parts := strings.Split(strings.Trim(path, "/"), "/")

	if len(parts) < 4 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	calendarID, err := uuid.Parse(parts[2])
	if err != nil {
		http.Error(w, "Invalid calendar ID", http.StatusBadRequest)
		return
	}

	uid := strings.TrimSuffix(parts[3], ".ics")

	if err := h.service.DeleteEventByUID(r.Context(), calendarID, uid); err != nil {
		h.logger.Error("Failed to delete event", zap.Error(err))
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *CalDAVHandler) handleProppatch(w http.ResponseWriter, r *http.Request) {
	// Simplified PROPPATCH implementation
	w.WriteHeader(http.StatusOK)
}

// Helper functions

func (h *CalDAVHandler) sendMultistatus(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(http.StatusMultiStatus)
	w.Write([]byte(body))
}

func (h *CalDAVHandler) sendUnauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", `Basic realm="Calendar"`)
	http.Error(w, "Unauthorized", http.StatusUnauthorized)
}

func getUserIDFromContext(r *http.Request) uuid.UUID {
	if uid, ok := r.Context().Value("user_id").(uuid.UUID); ok {
		return uid
	}
	return uuid.Nil
}

func xmlEscape(s string) string {
	var buf bytes.Buffer
	xml.EscapeText(&buf, []byte(s))
	return buf.String()
}

func extractHrefs(body []byte) []string {
	// Simple extraction of hrefs from XML
	var uids []string
	s := string(body)
	for {
		start := strings.Index(s, "<D:href>")
		if start == -1 {
			break
		}
		s = s[start+8:]
		end := strings.Index(s, "</D:href>")
		if end == -1 {
			break
		}
		href := s[:end]
		// Extract UID from href
		if strings.HasSuffix(href, ".ics") {
			parts := strings.Split(href, "/")
			uid := strings.TrimSuffix(parts[len(parts)-1], ".ics")
			uids = append(uids, uid)
		}
		s = s[end:]
	}
	return uids
}

func extractSyncToken(body []byte) string {
	s := string(body)
	start := strings.Index(s, "<D:sync-token>")
	if start == -1 {
		return ""
	}
	s = s[start+14:]
	end := strings.Index(s, "</D:sync-token>")
	if end == -1 {
		return ""
	}
	return s[:end]
}

func extractDisplayName(body []byte) string {
	s := string(body)
	start := strings.Index(s, "<D:displayname>")
	if start == -1 {
		return ""
	}
	s = s[start+15:]
	end := strings.Index(s, "</D:displayname>")
	if end == -1 {
		return ""
	}
	return s[:end]
}

func eventToICal(event *models.Event) string {
	startStr := event.StartTime.UTC().Format("20060102T150405Z")
	endStr := event.EndTime.UTC().Format("20060102T150405Z")
	createdStr := event.CreatedAt.UTC().Format("20060102T150405Z")
	modifiedStr := event.UpdatedAt.UTC().Format("20060102T150405Z")

	var ical strings.Builder
	ical.WriteString("BEGIN:VCALENDAR\r\n")
	ical.WriteString("VERSION:2.0\r\n")
	ical.WriteString("PRODID:-//Enterprise Email//Calendar//EN\r\n")
	ical.WriteString("BEGIN:VEVENT\r\n")
	ical.WriteString(fmt.Sprintf("UID:%s\r\n", event.UID))
	ical.WriteString(fmt.Sprintf("DTSTAMP:%s\r\n", modifiedStr))
	ical.WriteString(fmt.Sprintf("DTSTART:%s\r\n", startStr))
	ical.WriteString(fmt.Sprintf("DTEND:%s\r\n", endStr))
	ical.WriteString(fmt.Sprintf("SUMMARY:%s\r\n", foldLine(event.Title)))
	if event.Description != "" {
		ical.WriteString(fmt.Sprintf("DESCRIPTION:%s\r\n", foldLine(event.Description)))
	}
	if event.Location != "" {
		ical.WriteString(fmt.Sprintf("LOCATION:%s\r\n", foldLine(event.Location)))
	}
	ical.WriteString(fmt.Sprintf("STATUS:%s\r\n", strings.ToUpper(event.Status)))
	ical.WriteString(fmt.Sprintf("SEQUENCE:%d\r\n", event.Sequence))
	ical.WriteString(fmt.Sprintf("CREATED:%s\r\n", createdStr))
	ical.WriteString(fmt.Sprintf("LAST-MODIFIED:%s\r\n", modifiedStr))

	if event.RecurrenceRule != "" {
		ical.WriteString(fmt.Sprintf("RRULE:%s\r\n", event.RecurrenceRule))
	}

	// Add attendees
	for _, att := range event.Attendees {
		partstat := strings.ToUpper(strings.ReplaceAll(att.Status, "-", ""))
		if partstat == "NEEDSACTION" {
			partstat = "NEEDS-ACTION"
		}
		ical.WriteString(fmt.Sprintf("ATTENDEE;PARTSTAT=%s;CN=%s:mailto:%s\r\n",
			partstat, att.Name, att.Email))
	}

	ical.WriteString("END:VEVENT\r\n")
	ical.WriteString("END:VCALENDAR\r\n")

	return ical.String()
}

func parseICal(ical string) (*models.Event, error) {
	event := &models.Event{}

	lines := strings.Split(ical, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "SUMMARY:") {
			event.Title = strings.TrimPrefix(line, "SUMMARY:")
		} else if strings.HasPrefix(line, "DESCRIPTION:") {
			event.Description = strings.TrimPrefix(line, "DESCRIPTION:")
		} else if strings.HasPrefix(line, "LOCATION:") {
			event.Location = strings.TrimPrefix(line, "LOCATION:")
		} else if strings.HasPrefix(line, "DTSTART") {
			event.StartTime = parseICalDateTime(line)
		} else if strings.HasPrefix(line, "DTEND") {
			event.EndTime = parseICalDateTime(line)
		} else if strings.HasPrefix(line, "RRULE:") {
			event.RecurrenceRule = strings.TrimPrefix(line, "RRULE:")
		} else if strings.HasPrefix(line, "STATUS:") {
			event.Status = strings.ToLower(strings.TrimPrefix(line, "STATUS:"))
		}
	}

	if event.Status == "" {
		event.Status = "confirmed"
	}
	if event.Visibility == "" {
		event.Visibility = "private"
	}
	if event.Transparency == "" {
		event.Transparency = "opaque"
	}

	return event, nil
}

func parseICalDateTime(line string) time.Time {
	// Extract value after colon
	idx := strings.LastIndex(line, ":")
	if idx == -1 {
		return time.Time{}
	}
	value := strings.TrimSpace(line[idx+1:])

	// Try various formats
	formats := []string{
		"20060102T150405Z",
		"20060102T150405",
		"20060102",
	}

	for _, format := range formats {
		t, err := time.Parse(format, value)
		if err == nil {
			return t
		}
	}

	return time.Time{}
}

func foldLine(s string) string {
	// iCalendar line folding (simplified)
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, ",", "\\,")
	return s
}
