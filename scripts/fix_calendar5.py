import os

bt = chr(96)

# Fix 1: Remove unused strings import from calendar.go
svc_path = '/opt/oonrumail/app/services/calendar/service/calendar.go'
with open(svc_path, 'r') as f:
    content = f.read()

content = content.replace('\t"strings"\n', '')
print("Removed unused strings import")

# Fix 2: Convert []*FreeBusyPeriod to []FreeBusy in the FreeBusy response building
# Replace the assignment that puts FreeBusyPeriod into FreeBusy field
old_freebusy = '''fbr := &models.FreeBusyResponse{
\t\t\tUserID:  uid,
\t\t\tFreeBusy: userPeriods[uid],
\t\t}
\t\tif fbr.FreeBusy == nil {
\t\t\tfbr.FreeBusy = []*models.FreeBusyPeriod{}
\t\t}'''

new_freebusy = '''var freeBusySlots []models.FreeBusy
\t\tfor _, p := range userPeriods[uid] {
\t\t\tfreeBusySlots = append(freeBusySlots, models.FreeBusy{
\t\t\t\tStart:  p.Start,
\t\t\t\tEnd:    p.End,
\t\t\t\tStatus: p.Status,
\t\t\t})
\t\t}
\t\tfbr := &models.FreeBusyResponse{
\t\t\tUserID:   uid,
\t\t\tFreeBusy: freeBusySlots,
\t\t}'''

content = content.replace(old_freebusy, new_freebusy)
print("Fixed FreeBusy type conversion")

with open(svc_path, 'w') as f:
    f.write(content)

# Fix 3: notification.go - s.config.Notifications -> s.config.Notification, more SMTP refs
notif_path = '/opt/oonrumail/app/services/calendar/service/notification.go'
with open(notif_path, 'r') as f:
    content = f.read()

# Fix all references
content = content.replace('s.config.Notifications', 's.config.Notification')
content = content.replace('s.config.SMTP.Host', 's.config.Notification.SMTPHost')
content = content.replace('s.config.SMTP.Port', 's.config.Notification.SMTPPort')
content = content.replace('s.config.SMTP.From', 's.config.Notification.FromEmail')
content = content.replace('s.config.SMTP', 's.config.Notification')  # Catch any remaining
print("Fixed notification.go config references")

with open(notif_path, 'w') as f:
    f.write(content)

print("\nAll fixes applied!")
