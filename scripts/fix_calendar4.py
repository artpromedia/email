import os

bt = chr(96)

# Fix 1: Remove Transparency handling from calendar.go (field doesn't exist on UpdateEventRequest)
svc_path = '/opt/oonrumail/app/services/calendar/service/calendar.go'
with open(svc_path, 'r') as f:
    content = f.read()

content = content.replace(
    '\tif req.Transparency != "" {\n\t\tevent.Transparency = req.Transparency\n\t}\n',
    ''
)
print("Removed Transparency handling from UpdateEvent")

# Fix 2: FreeBusyResponse.Periods -> FreeBusy
content = content.replace('Periods:', 'FreeBusy:')
content = content.replace('fbr.Periods', 'fbr.FreeBusy')
print("Fixed FreeBusyResponse.Periods -> FreeBusy")

with open(svc_path, 'w') as f:
    f.write(content)

# Fix 3: notification.go issues
notif_path = '/opt/oonrumail/app/services/calendar/service/notification.go'
with open(notif_path, 'r') as f:
    content = f.read()

# Fix EventStatus as string - cast it
content = content.replace(
    'statusToICalStatus(event.Status)',
    'statusToICalStatus(string(event.Status))'
)
print("Fixed EventStatus cast in notification.go")

# Fix s.config.Server.PublicURL -> use a default or add to config
# Simplest: replace with a constructed URL or env var
content = content.replace('s.config.Server.PublicURL', 's.publicURL')
print("Changed config.Server.PublicURL references to s.publicURL")

# Fix s.config.SMTP -> s.config.Notification (since SMTP fields are in NotificationConfig)
content = content.replace('s.config.SMTP.Host', 's.config.Notification.SMTPHost')
content = content.replace('s.config.SMTP.Port', 's.config.Notification.SMTPPort')
content = content.replace('s.config.SMTP.From', 's.config.Notification.FromEmail')
print("Fixed s.config.SMTP -> s.config.Notification")

# Check if NotificationService has a publicURL field
if 'publicURL' not in content.split('type NotificationService struct')[1].split('}')[0] if 'type NotificationService struct' in content else True:
    # Add publicURL field to NotificationService struct
    content = content.replace(
        'type NotificationService struct {',
        'type NotificationService struct {\n\tpublicURL string'
    )
    print("Added publicURL field to NotificationService")

# Check/fix the constructor to set publicURL
if 'func NewNotificationService' in content:
    # Add publicURL initialization from env or default
    if 'publicURL' not in content.split('func NewNotificationService')[1].split('return')[0]:
        content = content.replace(
            'return &NotificationService{',
            'publicURL := os.Getenv("PUBLIC_URL")\n\tif publicURL == "" {\n\t\tpublicURL = "https://calendar.localhost"\n\t}\n\treturn &NotificationService{\n\t\tpublicURL: publicURL,'
        )
        # Add os import if missing
        if '"os"' not in content:
            content = content.replace('"bytes"', '"bytes"\n\t"os"')
        print("Added publicURL initialization")

with open(notif_path, 'w') as f:
    f.write(content)

# Fix 4: Add PublicURL to ServerConfig for forward compatibility
cfg_path = '/opt/oonrumail/app/services/calendar/config/config.go'
with open(cfg_path, 'r') as f:
    content = f.read()

if 'PublicURL' not in content:
    content = content.replace(
        'AllowedOrigins []string `yaml:"allowedOrigins"`',
        f'AllowedOrigins []string {bt}yaml:"allowedOrigins"{bt}\n\tPublicURL      string   {bt}yaml:"publicURL"{bt}'
    )
    print("Added PublicURL to ServerConfig")

with open(cfg_path, 'w') as f:
    f.write(content)

print("\nAll calendar fixes applied!")
