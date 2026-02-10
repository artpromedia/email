#!/usr/bin/env python3
"""Fix the last 5 calendar build errors."""
import sys

def fix_handlers_calendar():
    path = '/opt/oonrumail/app/services/calendar/handlers/calendar.go'
    with open(path, 'r') as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # Fix 1: Line ~200 - uuid.Parse(req.UserID) where req.UserID is already uuid.UUID
        # Replace the uuid.Parse block with direct assignment
        if 'targetUserID, err := uuid.Parse(req.UserID)' in line:
            # Replace with direct assignment (no parsing needed)
            indent = '\t\t'
            new_lines.append(indent + 'targetUserID := req.UserID\n')
            # Skip the next 4 lines (err check block): if err != nil { ... return ... }
            i += 1
            while i < len(lines) and 'if err := h.service.ShareCalendar' not in lines[i]:
                i += 1
            # Don't skip the ShareCalendar line itself
            continue

        # Fix 2: Line ~468 - models.RSVPRequest -> models.RespondRequest
        if 'models.RSVPRequest' in line:
            line = line.replace('models.RSVPRequest', 'models.RespondRequest')

        new_lines.append(line)
        i += 1

    with open(path, 'w') as f:
        f.writelines(new_lines)
    print(f"Fixed {path}")


def fix_caldav_handler():
    path = '/opt/oonrumail/app/services/calendar/caldav/handler.go'
    with open(path, 'r') as f:
        content = f.read()

    # Fix 3: strings.ToUpper(event.Status) -> strings.ToUpper(string(event.Status))
    content = content.replace(
        'strings.ToUpper(event.Status)',
        'strings.ToUpper(string(event.Status))'
    )

    # Fix 4: strings.ReplaceAll(att.Status, ...) -> strings.ReplaceAll(string(att.Status), ...)
    # The line is: partstat := strings.ToUpper(strings.ReplaceAll(att.Status, "-", ""))
    content = content.replace(
        'strings.ReplaceAll(att.Status,',
        'strings.ReplaceAll(string(att.Status),'
    )

    # Fix 5: event.Status = strings.ToLower(...) -> event.Status = models.EventStatus(strings.ToLower(...))
    # The line is: event.Status = strings.ToLower(strings.TrimPrefix(line, "STATUS:"))
    content = content.replace(
        'event.Status = strings.ToLower(strings.TrimPrefix(line, "STATUS:"))',
        'event.Status = models.EventStatus(strings.ToLower(strings.TrimPrefix(line, "STATUS:")))'
    )

    # Also fix the default assignment: event.Status = "confirmed" -> event.Status = models.EventStatus("confirmed")
    # But only the bare assignment, not the one we just fixed
    content = content.replace(
        'event.Status = "confirmed"',
        'event.Status = models.EventStatus("confirmed")'
    )

    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")


if __name__ == '__main__':
    fix_handlers_calendar()
    fix_caldav_handler()
    print("All fixes applied!")
