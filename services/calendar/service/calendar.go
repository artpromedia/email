package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"calendar-service/models"
	"calendar-service/repository"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type CalendarService struct {
	calendarRepo *repository.CalendarRepository
	eventRepo    *repository.EventRepository
	attendeeRepo *repository.AttendeeRepository
	reminderRepo *repository.ReminderRepository
	notification *NotificationService
	logger       *zap.Logger
}

func NewCalendarService(
	calendarRepo *repository.CalendarRepository,
	eventRepo *repository.EventRepository,
	attendeeRepo *repository.AttendeeRepository,
	reminderRepo *repository.ReminderRepository,
	notification *NotificationService,
	logger *zap.Logger,
) *CalendarService {
	return &CalendarService{
		calendarRepo: calendarRepo,
		eventRepo:    eventRepo,
		attendeeRepo: attendeeRepo,
		reminderRepo: reminderRepo,
		notification: notification,
		logger:       logger,
	}
}

// Calendar operations

func (s *CalendarService) CreateCalendar(ctx context.Context, userID uuid.UUID, req *models.CreateCalendarRequest) (*models.Calendar, error) {
	calendar := &models.Calendar{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        req.Name,
		Description: req.Description,
		Color:       req.Color,
		Timezone:    req.Timezone,
		IsPublic:    req.IsPublic,
	}

	if calendar.Color == "" {
		calendar.Color = "#3b82f6"
	}
	if calendar.Timezone == "" {
		calendar.Timezone = "UTC"
	}

	if err := s.calendarRepo.Create(ctx, calendar); err != nil {
		return nil, fmt.Errorf("create calendar: %w", err)
	}

	s.logger.Info("Calendar created",
		zap.String("calendar_id", calendar.ID.String()),
		zap.String("user_id", userID.String()))

	return calendar, nil
}

func (s *CalendarService) GetCalendar(ctx context.Context, userID, calendarID uuid.UUID) (*models.Calendar, error) {
	calendar, err := s.calendarRepo.GetByID(ctx, calendarID)
	if err != nil {
		return nil, err
	}
	if calendar == nil {
		return nil, nil
	}

	// Check access
	hasAccess, err := s.calendarRepo.HasAccess(ctx, calendarID, userID, "read")
	if err != nil {
		return nil, err
	}
	if !hasAccess && !calendar.IsPublic {
		return nil, fmt.Errorf("access denied")
	}

	return calendar, nil
}

func (s *CalendarService) ListCalendars(ctx context.Context, userID uuid.UUID) ([]*models.Calendar, error) {
	return s.calendarRepo.GetByUserID(ctx, userID)
}

func (s *CalendarService) UpdateCalendar(ctx context.Context, userID, calendarID uuid.UUID, req *models.UpdateCalendarRequest) (*models.Calendar, error) {
	calendar, err := s.calendarRepo.GetByID(ctx, calendarID)
	if err != nil {
		return nil, err
	}
	if calendar == nil {
		return nil, fmt.Errorf("calendar not found")
	}

	// Check ownership
	if calendar.UserID != userID {
		hasAccess, err := s.calendarRepo.HasAccess(ctx, calendarID, userID, "admin")
		if err != nil || !hasAccess {
			return nil, fmt.Errorf("access denied")
		}
	}

	// Apply updates
	if req.Name != "" {
		calendar.Name = req.Name
	}
	if req.Description != nil {
		calendar.Description = *req.Description
	}
	if req.Color != "" {
		calendar.Color = req.Color
	}
	if req.Timezone != "" {
		calendar.Timezone = req.Timezone
	}
	if req.IsPublic != nil {
		calendar.IsPublic = *req.IsPublic
	}

	if err := s.calendarRepo.Update(ctx, calendar); err != nil {
		return nil, fmt.Errorf("update calendar: %w", err)
	}

	return calendar, nil
}

func (s *CalendarService) DeleteCalendar(ctx context.Context, userID, calendarID uuid.UUID) error {
	calendar, err := s.calendarRepo.GetByID(ctx, calendarID)
	if err != nil {
		return err
	}
	if calendar == nil {
		return fmt.Errorf("calendar not found")
	}

	// Only owner can delete
	if calendar.UserID != userID {
		return fmt.Errorf("access denied")
	}

	// Can't delete default calendar
	if calendar.IsDefault {
		return fmt.Errorf("cannot delete default calendar")
	}

	return s.calendarRepo.Delete(ctx, calendarID)
}

func (s *CalendarService) ShareCalendar(ctx context.Context, ownerID, calendarID, targetUserID uuid.UUID, permission string) error {
	calendar, err := s.calendarRepo.GetByID(ctx, calendarID)
	if err != nil {
		return err
	}
	if calendar == nil {
		return fmt.Errorf("calendar not found")
	}

	// Only owner can share
	if calendar.UserID != ownerID {
		return fmt.Errorf("access denied")
	}

	// Validate permission
	if permission != "read" && permission != "write" && permission != "admin" {
		return fmt.Errorf("invalid permission: %s", permission)
	}

	return s.calendarRepo.Share(ctx, calendarID, targetUserID, permission)
}

func (s *CalendarService) UnshareCalendar(ctx context.Context, ownerID, calendarID, targetUserID uuid.UUID) error {
	calendar, err := s.calendarRepo.GetByID(ctx, calendarID)
	if err != nil {
		return err
	}
	if calendar == nil {
		return fmt.Errorf("calendar not found")
	}

	if calendar.UserID != ownerID {
		return fmt.Errorf("access denied")
	}

	return s.calendarRepo.Unshare(ctx, calendarID, targetUserID)
}

// Event operations

func (s *CalendarService) CreateEvent(ctx context.Context, userID uuid.UUID, req *models.CreateEventRequest) (*models.Event, error) {
	// Verify calendar access
	hasAccess, err := s.calendarRepo.HasAccess(ctx, req.CalendarID, userID, "write")
	if err != nil {
		return nil, err
	}
	if !hasAccess {
		return nil, fmt.Errorf("access denied to calendar")
	}

	event := &models.Event{
		ID:             uuid.New(),
		CalendarID:     req.CalendarID,
		UID:            fmt.Sprintf("%s@calendar.local", uuid.New().String()),
		Title:          req.Title,
		Description:    req.Description,
		Location:       req.Location,
		StartTime:      req.StartTime,
		EndTime:        req.EndTime,
		AllDay:         req.AllDay,
		Timezone:       req.Timezone,
		Status:         "confirmed",
		Visibility:     req.Visibility,
		Transparency:   req.Transparency,
		RecurrenceRule: req.RecurrenceRule,
		Attachments:    req.Attachments,
		Categories:     req.Categories,
		OrganizerID:    userID,
	}

	if event.Timezone == "" {
		event.Timezone = "UTC"
	}
	if event.Visibility == "" {
		event.Visibility = "private"
	}
	if event.Transparency == "" {
		event.Transparency = "opaque"
	}

	// Create event
	if err := s.eventRepo.Create(ctx, event); err != nil {
		return nil, fmt.Errorf("create event: %w", err)
	}

	// Add reminders
	if len(req.Reminders) > 0 {
		if err := s.reminderRepo.BulkCreate(ctx, event.ID, req.Reminders); err != nil {
			s.logger.Error("Failed to create reminders", zap.Error(err))
		}
	}

	// Add attendees and send invitations
	if len(req.Attendees) > 0 {
		if err := s.attendeeRepo.BulkCreate(ctx, event.ID, req.Attendees); err != nil {
			s.logger.Error("Failed to add attendees", zap.Error(err))
		} else {
			// Send invitation emails
			for _, a := range req.Attendees {
				go s.notification.SendInvitation(context.Background(), event, a.Email, a.Name)
			}
		}
	}

	// Load attendees and reminders
	event.Attendees, _ = s.attendeeRepo.GetByEventID(ctx, event.ID)
	event.Reminders, _ = s.reminderRepo.GetByEventID(ctx, event.ID)

	s.logger.Info("Event created",
		zap.String("event_id", event.ID.String()),
		zap.String("title", event.Title))

	return event, nil
}

func (s *CalendarService) GetEvent(ctx context.Context, userID, eventID uuid.UUID) (*models.Event, error) {
	event, err := s.eventRepo.GetByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event == nil {
		return nil, nil
	}

	// Check calendar access
	hasAccess, err := s.calendarRepo.HasAccess(ctx, event.CalendarID, userID, "read")
	if err != nil {
		return nil, err
	}
	if !hasAccess {
		return nil, fmt.Errorf("access denied")
	}

	// Load related data
	event.Attendees, _ = s.attendeeRepo.GetByEventID(ctx, eventID)
	event.Reminders, _ = s.reminderRepo.GetByEventID(ctx, eventID)

	return event, nil
}

func (s *CalendarService) ListEvents(ctx context.Context, userID uuid.UUID, req *models.ListEventsRequest) (*models.EventListResponse, error) {
	var events []*models.Event
	var total int
	var err error

	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}

	if req.CalendarID != uuid.Nil {
		// Check access
		hasAccess, err := s.calendarRepo.HasAccess(ctx, req.CalendarID, userID, "read")
		if err != nil || !hasAccess {
			return nil, fmt.Errorf("access denied")
		}
		events, total, err = s.eventRepo.List(ctx, req.CalendarID, req.Start, req.End, limit, req.Offset)
	} else {
		events, err = s.eventRepo.ListForUser(ctx, userID, req.Start, req.End, limit, req.Offset)
		total = len(events) // Simplified for user-wide query
	}

	if err != nil {
		return nil, err
	}

	// Load attendees for each event
	for _, e := range events {
		e.Attendees, _ = s.attendeeRepo.GetByEventID(ctx, e.ID)
		e.Reminders, _ = s.reminderRepo.GetByEventID(ctx, e.ID)
	}

	return &models.EventListResponse{
		Events: events,
		Total:  total,
		Limit:  limit,
		Offset: req.Offset,
	}, nil
}

func (s *CalendarService) SearchEvents(ctx context.Context, userID uuid.UUID, query string, start, end time.Time) ([]*models.Event, error) {
	events, err := s.eventRepo.Search(ctx, userID, query, start, end)
	if err != nil {
		return nil, err
	}

	for _, e := range events {
		e.Attendees, _ = s.attendeeRepo.GetByEventID(ctx, e.ID)
	}

	return events, nil
}

func (s *CalendarService) UpdateEvent(ctx context.Context, userID, eventID uuid.UUID, req *models.UpdateEventRequest) (*models.Event, error) {
	event, err := s.eventRepo.GetByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if event == nil {
		return nil, fmt.Errorf("event not found")
	}

	// Check write access
	hasAccess, err := s.calendarRepo.HasAccess(ctx, event.CalendarID, userID, "write")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied")
	}

	// Track if we need to send updates
	needsUpdate := false
	oldAttendees, _ := s.attendeeRepo.GetByEventID(ctx, eventID)

	// Apply updates
	if req.Title != "" && req.Title != event.Title {
		event.Title = req.Title
		needsUpdate = true
	}
	if req.Description != nil {
		event.Description = *req.Description
		needsUpdate = true
	}
	if req.Location != nil {
		event.Location = *req.Location
		needsUpdate = true
	}
	if !req.StartTime.IsZero() && !req.StartTime.Equal(event.StartTime) {
		event.StartTime = req.StartTime
		needsUpdate = true
	}
	if !req.EndTime.IsZero() && !req.EndTime.Equal(event.EndTime) {
		event.EndTime = req.EndTime
		needsUpdate = true
	}
	if req.AllDay != nil {
		event.AllDay = *req.AllDay
	}
	if req.Timezone != "" {
		event.Timezone = req.Timezone
	}
	if req.Status != "" {
		event.Status = req.Status
		needsUpdate = true
	}
	if req.Visibility != "" {
		event.Visibility = req.Visibility
	}
	if req.Transparency != "" {
		event.Transparency = req.Transparency
	}
	if req.RecurrenceRule != nil {
		event.RecurrenceRule = *req.RecurrenceRule
	}

	// Update event
	if err := s.eventRepo.Update(ctx, event); err != nil {
		return nil, fmt.Errorf("update event: %w", err)
	}

	// Update reminders if provided
	if req.Reminders != nil {
		if err := s.reminderRepo.ReplaceForEvent(ctx, eventID, req.Reminders); err != nil {
			s.logger.Error("Failed to update reminders", zap.Error(err))
		}
	}

	// Send update notifications to attendees
	if needsUpdate && len(oldAttendees) > 0 {
		for _, a := range oldAttendees {
			go s.notification.SendUpdate(context.Background(), event, a.Email, a.Name)
		}
	}

	// Reload data
	event.Attendees, _ = s.attendeeRepo.GetByEventID(ctx, eventID)
	event.Reminders, _ = s.reminderRepo.GetByEventID(ctx, eventID)

	return event, nil
}

func (s *CalendarService) DeleteEvent(ctx context.Context, userID, eventID uuid.UUID, notifyAttendees bool) error {
	event, err := s.eventRepo.GetByID(ctx, eventID)
	if err != nil {
		return err
	}
	if event == nil {
		return fmt.Errorf("event not found")
	}

	// Check access
	hasAccess, err := s.calendarRepo.HasAccess(ctx, event.CalendarID, userID, "write")
	if err != nil || !hasAccess {
		return fmt.Errorf("access denied")
	}

	// Get attendees before deletion
	attendees, _ := s.attendeeRepo.GetByEventID(ctx, eventID)

	// Delete event (cascade deletes attendees and reminders)
	if err := s.eventRepo.Delete(ctx, eventID); err != nil {
		return fmt.Errorf("delete event: %w", err)
	}

	// Send cancellation notifications
	if notifyAttendees && len(attendees) > 0 {
		for _, a := range attendees {
			go s.notification.SendCancellation(context.Background(), event, a.Email, a.Name)
		}
	}

	s.logger.Info("Event deleted",
		zap.String("event_id", eventID.String()))

	return nil
}

// RSVP operations

func (s *CalendarService) RespondToEvent(ctx context.Context, userID uuid.UUID, eventID uuid.UUID, email, status, comment string) error {
	event, err := s.eventRepo.GetByID(ctx, eventID)
	if err != nil {
		return err
	}
	if event == nil {
		return fmt.Errorf("event not found")
	}

	// Validate status
	validStatuses := []string{"accepted", "declined", "tentative"}
	valid := false
	for _, s := range validStatuses {
		if status == s {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("invalid status: %s", status)
	}

	// Update attendee status
	if err := s.attendeeRepo.UpdateStatusByEmail(ctx, eventID, email, status); err != nil {
		return fmt.Errorf("update attendee status: %w", err)
	}

	// Notify organizer
	go s.notification.SendRSVPReply(context.Background(), event, email, status, comment)

	s.logger.Info("RSVP response",
		zap.String("event_id", eventID.String()),
		zap.String("email", email),
		zap.String("status", status))

	return nil
}

// Free/Busy operations

func (s *CalendarService) GetFreeBusy(ctx context.Context, userIDs []uuid.UUID, start, end time.Time) ([]*models.FreeBusyResponse, error) {
	periods, err := s.eventRepo.GetFreeBusy(ctx, userIDs, start, end)
	if err != nil {
		return nil, err
	}

	// Group by user
	userPeriods := make(map[uuid.UUID][]*models.FreeBusyPeriod)
	for _, p := range periods {
		userPeriods[p.UserID] = append(userPeriods[p.UserID], p)
	}

	var response []*models.FreeBusyResponse
	for _, uid := range userIDs {
		fbr := &models.FreeBusyResponse{
			UserID:  uid,
			Periods: userPeriods[uid],
		}
		if fbr.Periods == nil {
			fbr.Periods = []*models.FreeBusyPeriod{}
		}
		response = append(response, fbr)
	}

	return response, nil
}

// Sync operations (for CalDAV)

func (s *CalendarService) GetSyncChanges(ctx context.Context, calendarID uuid.UUID, syncToken string) ([]*models.Event, string, error) {
	return s.calendarRepo.GetSyncChanges(ctx, calendarID, syncToken)
}

func (s *CalendarService) GetEventByUID(ctx context.Context, calendarID uuid.UUID, uid string) (*models.Event, error) {
	event, err := s.eventRepo.GetByUID(ctx, calendarID, uid)
	if err != nil {
		return nil, err
	}
	if event != nil {
		event.Attendees, _ = s.attendeeRepo.GetByEventID(ctx, event.ID)
		event.Reminders, _ = s.reminderRepo.GetByEventID(ctx, event.ID)
	}
	return event, nil
}

func (s *CalendarService) GetMultipleEventsByUID(ctx context.Context, calendarID uuid.UUID, uids []string) ([]*models.Event, error) {
	events, err := s.eventRepo.GetMultipleByUIDs(ctx, calendarID, uids)
	if err != nil {
		return nil, err
	}
	for _, e := range events {
		e.Attendees, _ = s.attendeeRepo.GetByEventID(ctx, e.ID)
		e.Reminders, _ = s.reminderRepo.GetByEventID(ctx, e.ID)
	}
	return events, nil
}

// CreateOrUpdateEvent upserts an event by UID (for CalDAV PUT)
func (s *CalendarService) CreateOrUpdateEvent(ctx context.Context, userID, calendarID uuid.UUID, uid string, event *models.Event) error {
	existing, err := s.eventRepo.GetByUID(ctx, calendarID, uid)
	if err != nil {
		return err
	}

	if existing != nil {
		// Update
		event.ID = existing.ID
		event.CalendarID = calendarID
		event.UID = uid
		return s.eventRepo.Update(ctx, event)
	}

	// Create
	event.ID = uuid.New()
	event.CalendarID = calendarID
	event.UID = uid
	event.OrganizerID = userID
	return s.eventRepo.Create(ctx, event)
}

// DeleteEventByUID deletes an event by UID (for CalDAV DELETE)
func (s *CalendarService) DeleteEventByUID(ctx context.Context, calendarID uuid.UUID, uid string) error {
	return s.eventRepo.DeleteByUID(ctx, calendarID, uid)
}
