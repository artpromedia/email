bt = chr(96)
fp = '/opt/oonrumail/app/services/calendar/config/config.go'
with open(fp) as f:
    content = f.read()

# Remove the mangled lines first
lines = content.split('\n')
cleaned = [l for l in lines if 'yaml:\\"username\\"' not in l and 'yaml:\\"password\\"' not in l and 'yaml:\\' not in l]
content = '\n'.join(cleaned)

# Add Username and Password properly
old = f'\tReminderLookAhead int {bt}yaml:"reminderLookAhead"{bt} // Minutes to look ahead for reminders'
new = f'\tReminderLookAhead int    {bt}yaml:"reminderLookAhead"{bt} // Minutes to look ahead for reminders\n\tUsername          string {bt}yaml:"username"{bt}\n\tPassword          string {bt}yaml:"password"{bt}'
content = content.replace(old, new)

# Also fix PublicURL if its backticks got mangled
if 'yaml:\\"publicURL\\"' in content or "yaml:\\'publicURL\\'" in content:
    content = content.replace('yaml:\\"publicURL\\"', f'yaml:"publicURL"')

with open(fp, 'w') as f:
    f.write(content)

print("Fixed config.go backticks and added Username/Password")
