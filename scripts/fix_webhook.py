import sys

filepath = '/opt/oonrumail/app/services/transactional-api/service/webhook.go'

with open(filepath, 'r') as f:
    lines = f.readlines()

# Fix 1: Lines 141-158 (0-indexed: 140-157)
# The old payload construction + bounce if-block
new_block_1 = [
    '\tpayload := &models.WebhookPayload{\n',
    '\t\tEvent:      models.WebhookEventType(event.EventType),\n',
    '\t\tTimestamp:   event.Timestamp,\n',
    '\t\tMessageID:   event.MessageID.String(),\n',
    '\t\tRecipient:   event.Recipient,\n',
    '\t\tUserAgent:   event.UserAgent,\n',
    '\t\tIPAddress:   event.IPAddress,\n',
    '\t\tURL:         event.URL,\n',
    '\t\tBounceType:  event.BounceType,\n',
    '\t\tBounceCode:  event.BounceReason,\n',
    '\t}\n',
    '\n',
]

# Replace lines 140 through 157 (0-indexed, exclusive end)
lines[140:158] = new_block_1

# Fix 2: Find testPayload construction (line numbers shifted after fix 1)
for i, line in enumerate(lines):
    if 'testPayload := &models.WebhookPayload{' in line:
        # Find the closing brace of this struct literal
        j = i + 1
        brace_depth = 1
        while j < len(lines):
            for ch in lines[j]:
                if ch == '{':
                    brace_depth += 1
                elif ch == '}':
                    brace_depth -= 1
            if brace_depth == 0:
                break
            j += 1
        j += 1  # include the closing brace line
        new_block_2 = [
            '\ttestPayload := &models.WebhookPayload{\n',
            '\t\tEvent:     "test",\n',
            '\t\tTimestamp: time.Now(),\n',
            '\t\tMessageID: uuid.New().String(),\n',
            '\t\tRecipient: "test@example.com",\n',
            '\t\tReason:    "This is a test webhook delivery",\n',
            '\t}\n',
        ]
        lines[i:j] = new_block_2
        print(f"Fixed testPayload at lines {i+1}-{j}")
        break

with open(filepath, 'w') as f:
    f.writelines(lines)

print("Done - both payload constructions fixed")
