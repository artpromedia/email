import os

bt = chr(96)

# Fix 1: Add Attendees and Reminders fields to Event struct
models_path = '/opt/oonrumail/app/services/calendar/models/models.go'
with open(models_path, 'r') as f:
    content = f.read()

# Add Attendees and Reminders to Event struct (non-DB fields)
# Find the end of the Event struct
if 'Attendees' not in content.split('type Event struct')[1].split('}')[0] if 'type Event struct' in content else True:
    # Find a good place - after RecurrenceID or the last field before the closing brace
    # Let me add right before the closing } of Event struct
    lines = content.split('\n')
    in_event = False
    event_end = None
    for i, line in enumerate(lines):
        if 'type Event struct {' in line:
            in_event = True
        if in_event and line.strip() == '}':
            event_end = i
            in_event = False
            break

    if event_end is not None:
        # Check if fields already exist
        event_block = '\n'.join(lines[:event_end])
        if 'Attendees' not in event_block:
            new_fields = [
                f'\tAttendees       []*Attendee {bt}json:"attendees,omitempty" db:"-"{bt}',
                f'\tReminders       []Reminder  {bt}json:"reminders,omitempty" db:"-"{bt}',
            ]
            for j, field in enumerate(new_fields):
                lines.insert(event_end + j, field)
            content = '\n'.join(lines)
            print("Added Attendees and Reminders fields to Event struct")

# Fix 2: Add Total, Limit, Offset to EventListResponse or fix service to use existing fields
# EventListResponse has: Events, TotalCount, HasMore
# Service uses: Total, Limit, Offset
# Fix: Change service to use TotalCount and HasMore instead
# Actually easier to add the missing fields to EventListResponse

if 'type EventListResponse struct' in content:
    old_resp = '''type EventListResponse struct {
\tEvents     []*Event `json:"events"`
\tTotalCount int      `json:"total_count"`
\tHasMore    bool     `json:"has_more"`
}'''
    new_resp = f'''type EventListResponse struct {{
\tEvents     []*Event {bt}json:"events"{bt}
\tTotalCount int      {bt}json:"total_count"{bt}
\tTotal      int      {bt}json:"total"{bt}
\tLimit      int      {bt}json:"limit"{bt}
\tOffset     int      {bt}json:"offset"{bt}
\tHasMore    bool     {bt}json:"has_more"{bt}
}}'''
    content = content.replace(old_resp, new_resp)
    print("Added Total, Limit, Offset fields to EventListResponse")

with open(models_path, 'w') as f:
    f.write(content)

# Fix 3: Fix service/calendar.go type mismatches
svc_path = '/opt/oonrumail/app/services/calendar/service/calendar.go'
with open(svc_path, 'r') as f:
    content = f.read()

# Fix BulkCreate calls - convert CreateReminderRequest to *Reminder
# The simplest fix: change BulkCreate to accept the request types
# But we don't control the repo. Instead, convert in the service.

# Fix reminder BulkCreate: req.Reminders is []models.CreateReminderRequest, repo wants []*models.Reminder
old_reminder = 'if err := s.reminderRepo.BulkCreate(ctx, event.ID, req.Reminders); err != nil {'
new_reminder = '''reminders := make([]*models.Reminder, len(req.Reminders))
\t\tfor i, r := range req.Reminders {
\t\t\treminders[i] = &models.Reminder{
\t\t\t\tID:       uuid.New(),
\t\t\t\tEventID:  event.ID,
\t\t\t\tAction:   r.Action,
\t\t\t\tTrigger:  r.Trigger,
\t\t\t\tDuration: r.Duration,
\t\t\t}
\t\t}
\t\tif err := s.reminderRepo.BulkCreate(ctx, event.ID, reminders); err != nil {'''
content = content.replace(old_reminder, new_reminder)

# Fix attendee BulkCreate: req.Attendees is []models.CreateAttendeeRequest, repo wants []*models.Attendee
old_attendee = 'if err := s.attendeeRepo.BulkCreate(ctx, event.ID, req.Attendees); err != nil {'
new_attendee = '''attendees := make([]*models.Attendee, len(req.Attendees))
\t\t\tfor i, a := range req.Attendees {
\t\t\t\tattendees[i] = &models.Attendee{
\t\t\t\t\tID:      uuid.New(),
\t\t\t\t\tEventID: event.ID,
\t\t\t\t\tEmail:   a.Email,
\t\t\t\t\tName:    a.Name,
\t\t\t\t\tRole:    a.Role,
\t\t\t\t\tStatus:  "needs-action",
\t\t\t\t}
\t\t\t}
\t\t\tif err := s.attendeeRepo.BulkCreate(ctx, event.ID, attendees); err != nil {'''
content = content.replace(old_attendee, new_attendee)

# Fix []*models.Reminder vs []models.Reminder
# GetByEventID returns []*models.Reminder but event.Reminders is []models.Reminder
# Since we added Reminders as []Reminder to Event, let's change assignment
# Actually we need to dereference - simpler to make Event.Reminders []*Reminder
# Let's just not assign directly, convert instead
# Actually even simpler: just change the helper function call
# Let me just fix by creating small conversion

# For the Reminders assignment, wrap with conversion
content = content.replace(
    'event.Reminders, _ = s.reminderRepo.GetByEventID(ctx, event.ID)',
    'if rems, err := s.reminderRepo.GetByEventID(ctx, event.ID); err == nil {\n\t\tfor _, r := range rems {\n\t\t\tevent.Reminders = append(event.Reminders, *r)\n\t\t}\n\t}'
)
content = content.replace(
    'event.Reminders, _ = s.reminderRepo.GetByEventID(ctx, eventID)',
    'if rems, err := s.reminderRepo.GetByEventID(ctx, eventID); err == nil {\n\t\tfor _, r := range rems {\n\t\t\tevent.Reminders = append(event.Reminders, *r)\n\t\t}\n\t}'
)
content = content.replace(
    'e.Reminders, _ = s.reminderRepo.GetByEventID(ctx, e.ID)',
    'if rems, err := s.reminderRepo.GetByEventID(ctx, e.ID); err == nil {\n\t\t\tfor _, r := range rems {\n\t\t\t\te.Reminders = append(e.Reminders, *r)\n\t\t\t}\n\t\t}'
)

with open(svc_path, 'w') as f:
    f.write(content)

print("Fixed service/calendar.go type mismatches")

# Check if uuid is imported in the service
with open(svc_path, 'r') as f:
    content = f.read()
if '"github.com/google/uuid"' not in content:
    content = content.replace('"fmt"', '"fmt"\n\n\t"github.com/google/uuid"')
    with open(svc_path, 'w') as f:
        f.write(content)
    print("Added uuid import to service/calendar.go")

print("\nAll calendar fixes applied!")
