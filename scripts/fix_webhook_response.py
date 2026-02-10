filepath = '/opt/oonrumail/app/services/transactional-api/models/webhook.go'

with open(filepath, 'r') as f:
    lines = f.readlines()

# Remove the mangled WebhookResponse that was just appended
# Find where the bad one starts
start_idx = None
for i, line in enumerate(lines):
    if '// WebhookResponse is the API response' in line:
        start_idx = i
        break

if start_idx is not None:
    lines = lines[:start_idx]

bt = chr(96)  # backtick

webhook_response = f"""
// WebhookResponse is the API response for a webhook
type WebhookResponse struct {{
\tID            uuid.UUID          {bt}json:"id"{bt}
\tURL           string             {bt}json:"url"{bt}
\tEvents        []WebhookEventType {bt}json:"events"{bt}
\tIsActive      bool               {bt}json:"is_active"{bt}
\tSecret        string             {bt}json:"secret,omitempty"{bt}
\tFailureCount  int                {bt}json:"failure_count"{bt}
\tLastTriggered *time.Time         {bt}json:"last_triggered,omitempty"{bt}
\tCreatedAt     time.Time          {bt}json:"created_at"{bt}
}}
"""

with open(filepath, 'w') as f:
    f.writelines(lines)
    f.write(webhook_response)

print("Added WebhookResponse with proper formatting")
