package service

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"net/smtp"
	"time"

	"calendar-service/config"
	"calendar-service/models"

	"go.uber.org/zap"
)

type NotificationService struct {
	config *config.Config
	logger *zap.Logger
}

func NewNotificationService(cfg *config.Config, logger *zap.Logger) *NotificationService {
	return &NotificationService{
		config: cfg,
		logger: logger,
	}
}

// SendInvitation sends calendar invitation to attendee
func (s *NotificationService) SendInvitation(ctx context.Context, event *models.Event, toEmail, toName string) error {
	ical := s.generateICalInvite(event, "REQUEST")

	subject := fmt.Sprintf("Invitation: %s", event.Title)
	body := s.buildInviteEmailBody(event, "invitation")

	return s.sendEmailWithICS(toEmail, toName, subject, body, ical)
}

// SendUpdate sends update notification to attendees
func (s *NotificationService) SendUpdate(ctx context.Context, event *models.Event, toEmail, toName string) error {
	ical := s.generateICalInvite(event, "REQUEST")

	subject := fmt.Sprintf("Updated: %s", event.Title)
	body := s.buildInviteEmailBody(event, "update")

	return s.sendEmailWithICS(toEmail, toName, subject, body, ical)
}

// SendCancellation sends cancellation notification to attendees
func (s *NotificationService) SendCancellation(ctx context.Context, event *models.Event, toEmail, toName string) error {
	ical := s.generateICalInvite(event, "CANCEL")

	subject := fmt.Sprintf("Cancelled: %s", event.Title)
	body := s.buildInviteEmailBody(event, "cancellation")

	return s.sendEmailWithICS(toEmail, toName, subject, body, ical)
}

// SendRSVPReply sends RSVP reply to organizer
func (s *NotificationService) SendRSVPReply(ctx context.Context, event *models.Event, attendeeEmail, status, comment string) error {
	// In a full implementation, get organizer email from event
	// For now, log it
	s.logger.Info("RSVP Reply",
		zap.String("event_id", event.ID.String()),
		zap.String("attendee", attendeeEmail),
		zap.String("status", status),
		zap.String("comment", comment))

	return nil
}

// SendReminder sends event reminder
func (s *NotificationService) SendReminder(ctx context.Context, ewr *models.EventWithReminder) error {
	var timeStr string
	if ewr.Minutes == 0 {
		timeStr = "now"
	} else if ewr.Minutes < 60 {
		timeStr = fmt.Sprintf("in %d minutes", ewr.Minutes)
	} else if ewr.Minutes < 1440 {
		timeStr = fmt.Sprintf("in %d hour(s)", ewr.Minutes/60)
	} else {
		timeStr = fmt.Sprintf("in %d day(s)", ewr.Minutes/1440)
	}

	subject := fmt.Sprintf("Reminder: %s (%s)", ewr.Title, timeStr)

	body := fmt.Sprintf(`
		<html>
		<body>
			<h2>Event Reminder</h2>
			<p>Your event <strong>%s</strong> starts %s.</p>
			<p>Start Time: %s</p>
		</body>
		</html>
	`, ewr.Title, timeStr, ewr.StartTime.Format(time.RFC1123))

	return s.sendEmail(ewr.Email, "", subject, body)
}

// generateICalInvite generates an iCalendar invitation
func (s *NotificationService) generateICalInvite(event *models.Event, method string) string {
	startStr := event.StartTime.UTC().Format("20060102T150405Z")
	endStr := event.EndTime.UTC().Format("20060102T150405Z")
	createdStr := event.CreatedAt.UTC().Format("20060102T150405Z")
	nowStr := time.Now().UTC().Format("20060102T150405Z")

	ical := fmt.Sprintf(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Enterprise Email//Calendar//EN
CALSCALE:GREGORIAN
METHOD:%s
BEGIN:VEVENT
UID:%s
DTSTAMP:%s
DTSTART:%s
DTEND:%s
SUMMARY:%s
DESCRIPTION:%s
LOCATION:%s
STATUS:%s
SEQUENCE:%d
CREATED:%s
LAST-MODIFIED:%s
END:VEVENT
END:VCALENDAR`,
		method,
		event.UID,
		nowStr,
		startStr,
		endStr,
		escapeICalText(event.Title),
		escapeICalText(event.Description),
		escapeICalText(event.Location),
		statusToICalStatus(event.Status),
		event.Sequence,
		createdStr,
		nowStr,
	)

	return ical
}

// buildInviteEmailBody builds HTML email body for invites
func (s *NotificationService) buildInviteEmailBody(event *models.Event, inviteType string) string {
	tmpl := `
<!DOCTYPE html>
<html>
<head>
	<style>
		body { font-family: Arial, sans-serif; }
		.container { max-width: 600px; margin: 0 auto; padding: 20px; }
		.header { background: #3b82f6; color: white; padding: 15px; border-radius: 8px 8px 0 0; }
		.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
		.event-details { margin: 15px 0; }
		.detail-row { margin: 8px 0; }
		.label { font-weight: bold; color: #64748b; }
		.buttons { margin-top: 20px; }
		.button { display: inline-block; padding: 10px 20px; margin: 5px; border-radius: 5px; text-decoration: none; color: white; }
		.accept { background: #22c55e; }
		.decline { background: #ef4444; }
		.tentative { background: #f59e0b; }
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h2>{{.HeaderText}}</h2>
		</div>
		<div class="content">
			<h3>{{.Event.Title}}</h3>
			<div class="event-details">
				<div class="detail-row">
					<span class="label">When:</span>
					{{.StartFormatted}} - {{.EndFormatted}}
				</div>
				{{if .Event.Location}}
				<div class="detail-row">
					<span class="label">Where:</span>
					{{.Event.Location}}
				</div>
				{{end}}
				{{if .Event.Description}}
				<div class="detail-row">
					<span class="label">Description:</span>
					<p>{{.Event.Description}}</p>
				</div>
				{{end}}
			</div>
			{{if eq .InviteType "invitation"}}
			<div class="buttons">
				<a href="{{.AcceptURL}}" class="button accept">Accept</a>
				<a href="{{.DeclineURL}}" class="button decline">Decline</a>
				<a href="{{.TentativeURL}}" class="button tentative">Maybe</a>
			</div>
			{{end}}
		</div>
	</div>
</body>
</html>`

	var headerText string
	switch inviteType {
	case "invitation":
		headerText = "📅 Calendar Invitation"
	case "update":
		headerText = "📅 Event Updated"
	case "cancellation":
		headerText = "❌ Event Cancelled"
	default:
		headerText = "📅 Calendar Event"
	}

	data := map[string]interface{}{
		"Event":          event,
		"HeaderText":     headerText,
		"InviteType":     inviteType,
		"StartFormatted": event.StartTime.Format("Monday, January 2, 2006 3:04 PM"),
		"EndFormatted":   event.EndTime.Format("3:04 PM"),
		"AcceptURL":      fmt.Sprintf("%s/rsvp/%s/accept", s.config.Server.PublicURL, event.ID),
		"DeclineURL":     fmt.Sprintf("%s/rsvp/%s/decline", s.config.Server.PublicURL, event.ID),
		"TentativeURL":   fmt.Sprintf("%s/rsvp/%s/tentative", s.config.Server.PublicURL, event.ID),
	}

	t, err := template.New("invite").Parse(tmpl)
	if err != nil {
		s.logger.Error("Failed to parse invite template", zap.Error(err))
		return ""
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		s.logger.Error("Failed to execute invite template", zap.Error(err))
		return ""
	}

	return buf.String()
}

// sendEmailWithICS sends an email with iCalendar attachment
func (s *NotificationService) sendEmailWithICS(toEmail, toName, subject, htmlBody, ical string) error {
	if s.config.SMTP.Host == "" {
		s.logger.Warn("SMTP not configured, skipping email",
			zap.String("to", toEmail),
			zap.String("subject", subject))
		return nil
	}

	boundary := "----=_NextPart_" + fmt.Sprintf("%d", time.Now().UnixNano())

	headers := fmt.Sprintf(`From: %s
To: %s
Subject: %s
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="%s"

--%s
Content-Type: text/html; charset="UTF-8"

%s

--%s
Content-Type: text/calendar; charset="UTF-8"; method=REQUEST
Content-Disposition: attachment; filename="invite.ics"

%s

--%s--`,
		s.config.Notifications.FromEmail,
		toEmail,
		subject,
		boundary,
		boundary,
		htmlBody,
		boundary,
		ical,
		boundary,
	)

	auth := smtp.PlainAuth("", s.config.SMTP.Username, s.config.SMTP.Password, s.config.SMTP.Host)
	addr := fmt.Sprintf("%s:%d", s.config.SMTP.Host, s.config.SMTP.Port)

	err := smtp.SendMail(addr, auth, s.config.Notifications.FromEmail, []string{toEmail}, []byte(headers))
	if err != nil {
		s.logger.Error("Failed to send email",
			zap.String("to", toEmail),
			zap.Error(err))
		return err
	}

	s.logger.Info("Email sent",
		zap.String("to", toEmail),
		zap.String("subject", subject))

	return nil
}

// sendEmail sends a simple HTML email
func (s *NotificationService) sendEmail(toEmail, toName, subject, htmlBody string) error {
	if s.config.SMTP.Host == "" {
		s.logger.Warn("SMTP not configured, skipping email",
			zap.String("to", toEmail))
		return nil
	}

	headers := fmt.Sprintf(`From: %s
To: %s
Subject: %s
MIME-Version: 1.0
Content-Type: text/html; charset="UTF-8"

%s`,
		s.config.Notifications.FromEmail,
		toEmail,
		subject,
		htmlBody,
	)

	auth := smtp.PlainAuth("", s.config.SMTP.Username, s.config.SMTP.Password, s.config.SMTP.Host)
	addr := fmt.Sprintf("%s:%d", s.config.SMTP.Host, s.config.SMTP.Port)

	return smtp.SendMail(addr, auth, s.config.Notifications.FromEmail, []string{toEmail}, []byte(headers))
}

// Helper functions

func escapeICalText(s string) string {
	// Escape special characters for iCalendar
	s = template.HTMLEscapeString(s)
	return s
}

func statusToICalStatus(status string) string {
	switch status {
	case "confirmed":
		return "CONFIRMED"
	case "tentative":
		return "TENTATIVE"
	case "cancelled":
		return "CANCELLED"
	default:
		return "CONFIRMED"
	}
}
