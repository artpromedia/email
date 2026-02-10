svc_path = '/opt/oonrumail/app/services/calendar/service/calendar.go'
with open(svc_path, 'r') as f:
    content = f.read()

# Fix: The Reminder conversion used wrong field names (Action, Trigger, Duration)
# Actual fields are: Method, Minutes
content = content.replace(
    '''reminders[i] = &models.Reminder{
\t\t\t\tID:       uuid.New(),
\t\t\t\tEventID:  event.ID,
\t\t\t\tAction:   r.Action,
\t\t\t\tTrigger:  r.Trigger,
\t\t\t\tDuration: r.Duration,
\t\t\t}''',
    '''reminders[i] = &models.Reminder{
\t\t\t\tID:       uuid.New(),
\t\t\t\tEventID:  event.ID,
\t\t\t\tMethod:   r.Method,
\t\t\t\tMinutes:  r.Minutes,
\t\t\t}'''
)

with open(svc_path, 'w') as f:
    f.write(content)

print("Fixed Reminder field names")
