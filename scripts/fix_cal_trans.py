svc_path = '/opt/oonrumail/app/services/calendar/service/calendar.go'
with open(svc_path, 'r') as f:
    content = f.read()

# Revert Transparency fix - it's a plain string, not a pointer
content = content.replace(
    'if req.Transparency != nil && *req.Transparency != "" {\n\t\tevent.Transparency = *req.Transparency',
    'if req.Transparency != "" {\n\t\tevent.Transparency = req.Transparency'
)

with open(svc_path, 'w') as f:
    f.write(content)

print("Reverted Transparency to plain string handling")
