fp = '/opt/oonrumail/app/services/calendar/models/models.go'
with open(fp) as f:
    lines = f.readlines()

# Find and remove duplicate Reminders line (keep the first one)
seen_reminders = False
new_lines = []
for line in lines:
    if 'Reminders' in line and '[]Reminder' in line:
        if seen_reminders:
            continue  # Skip duplicate
        seen_reminders = True
    new_lines.append(line)

with open(fp, 'w') as f:
    f.writelines(new_lines)
print('Removed duplicate Reminders field')
