svc_path = '/opt/oonrumail/app/services/calendar/service/calendar.go'
with open(svc_path, 'r') as f:
    content = f.read()

# Fix pointer type comparisons in UpdateEvent method
replacements = [
    # Title: *string
    ('if req.Title != "" && req.Title != event.Title {\n\t\tevent.Title = req.Title',
     'if req.Title != nil && *req.Title != event.Title {\n\t\tevent.Title = *req.Title'),
    # StartTime: *time.Time
    ('if !req.StartTime.IsZero() && !req.StartTime.Equal(event.StartTime) {\n\t\tevent.StartTime = req.StartTime',
     'if req.StartTime != nil && !req.StartTime.IsZero() && !req.StartTime.Equal(event.StartTime) {\n\t\tevent.StartTime = *req.StartTime'),
    # EndTime: *time.Time
    ('if !req.EndTime.IsZero() && !req.EndTime.Equal(event.EndTime) {\n\t\tevent.EndTime = req.EndTime',
     'if req.EndTime != nil && !req.EndTime.IsZero() && !req.EndTime.Equal(event.EndTime) {\n\t\tevent.EndTime = *req.EndTime'),
    # Timezone: *string
    ('if req.Timezone != "" {\n\t\tevent.Timezone = req.Timezone',
     'if req.Timezone != nil && *req.Timezone != "" {\n\t\tevent.Timezone = *req.Timezone'),
    # Status: *EventStatus
    ('if req.Status != "" {\n\t\tevent.Status = req.Status',
     'if req.Status != nil && *req.Status != "" {\n\t\tevent.Status = *req.Status'),
    # Visibility: *string
    ('if req.Visibility != "" {\n\t\tevent.Visibility = req.Visibility',
     'if req.Visibility != nil && *req.Visibility != "" {\n\t\tevent.Visibility = *req.Visibility'),
    # Transparency: *string (may or may not have this issue)
    ('if req.Transparency != "" {\n\t\tevent.Transparency = req.Transparency',
     'if req.Transparency != nil && *req.Transparency != "" {\n\t\tevent.Transparency = *req.Transparency'),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f"Fixed: {old[:40]}...")

# Also fix the ReplaceForEvent call - it receives []CreateReminderRequest but probably expects []*Reminder
# Let's check: convert req.Reminders for the replace call
old_replace = 'if err := s.reminderRepo.ReplaceForEvent(ctx, eventID, req.Reminders); err != nil {'
if old_replace in content:
    new_replace = '''newReminders := make([]*models.Reminder, len(req.Reminders))
\t\t\tfor i, r := range req.Reminders {
\t\t\t\tnewReminders[i] = &models.Reminder{
\t\t\t\t\tID:      uuid.New(),
\t\t\t\t\tEventID: eventID,
\t\t\t\t\tMethod:  r.Method,
\t\t\t\t\tMinutes: r.Minutes,
\t\t\t\t}
\t\t\t}
\t\t\tif err := s.reminderRepo.ReplaceForEvent(ctx, eventID, newReminders); err != nil {'''
    content = content.replace(old_replace, new_replace)
    print("Fixed ReplaceForEvent reminder conversion")

with open(svc_path, 'w') as f:
    f.write(content)

print("\nAll pointer fixes applied!")
