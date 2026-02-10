import os

# Fix 1: Add WebhookResponse and PaginatedResponse to models
webhook_path = '/opt/oonrumail/app/services/transactional-api/models/webhook.go'

with open(webhook_path, 'r') as f:
    content = f.read()

# Add WebhookResponse after the closing of Webhook struct if not already present
if 'WebhookResponse' not in content:
    # Append at end of file
    addition = '''

// WebhookResponse is the API response for a webhook
type WebhookResponse struct {
	ID            uuid.UUID          `json:"id"`
	URL           string             `json:"url"`
	Events        []WebhookEventType `json:"events"`
	IsActive      bool               `json:"is_active"`
	Secret        string             `json:"secret,omitempty"`
	FailureCount  int                `json:"failure_count"`
	LastTriggered *time.Time         `json:"last_triggered,omitempty"`
	CreatedAt     time.Time          `json:"created_at"`
}
'''
    content += addition
    with open(webhook_path, 'w') as f:
        f.write(content)
    print("Added WebhookResponse to webhook.go")
else:
    print("WebhookResponse already exists")

# Fix 2: Add PaginatedResponse as a generic type
# Check if it exists in any model file
models_dir = '/opt/oonrumail/app/services/transactional-api/models'
found = False
for fname in os.listdir(models_dir):
    if fname.endswith('.go'):
        fpath = os.path.join(models_dir, fname)
        with open(fpath, 'r') as f:
            if 'PaginatedResponse' in f.read():
                print(f"PaginatedResponse already exists in {fname}")
                found = True
                break

if not found:
    # Add to a new file
    paginated_content = '''package models

// PaginatedResponse is a generic paginated response
type PaginatedResponse[T any] struct {
	Data       []T   `json:"data"`
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalCount int64 `json:"total_count"`
	TotalPages int   `json:"total_pages"`
}
'''
    paginated_path = os.path.join(models_dir, 'pagination.go')
    with open(paginated_path, 'w') as f:
        f.write(paginated_content)
    print("Created pagination.go with PaginatedResponse")

# Fix 3: Fix the WebhookEventType as string map key in handlers/other.go
handler_path = '/opt/oonrumail/app/services/transactional-api/handlers/other.go'
with open(handler_path, 'r') as f:
    content = f.read()

# The issue: validEvents is map[string]bool, but event is WebhookEventType
# Fix: cast event to string in both the map lookup and the string concat
content = content.replace(
    'if !validEvents[event] {',
    'if !validEvents[string(event)] {'
)
content = content.replace(
    '"Invalid event type: " + event',
    '"Invalid event type: " + string(event)'
)

with open(handler_path, 'w') as f:
    f.write(content)
print("Fixed WebhookEventType as string in handlers/other.go")

print("\nAll fixes applied!")
