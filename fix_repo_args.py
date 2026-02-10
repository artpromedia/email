#!/usr/bin/env python3
"""Remove logger args from repository constructors in main.go"""
path = '/opt/oonrumail/app/services/calendar/main.go'
with open(path, 'r') as f:
    content = f.read()

content = content.replace(
    'repository.NewCalendarRepository(dbPool, logger.Named("calendar-repo"))',
    'repository.NewCalendarRepository(dbPool)'
)
content = content.replace(
    'repository.NewEventRepository(dbPool, logger.Named("event-repo"))',
    'repository.NewEventRepository(dbPool)'
)
content = content.replace(
    'repository.NewAttendeeRepository(dbPool, logger.Named("attendee-repo"))',
    'repository.NewAttendeeRepository(dbPool)'
)

with open(path, 'w') as f:
    f.write(content)
print("Fixed!")
