filepath = '/opt/oonrumail/app/services/ai-assistant/handlers/threat.go'

with open(filepath, 'r') as f:
    content = f.read()

# Remove the stray import and any surrounding comment
lines_to_remove = [
    '// Context key for imports',
    'import "context"',
]

lines = content.split('\n')
cleaned = [l for l in lines if l.strip() not in lines_to_remove]
content = '\n'.join(cleaned)

# Add context to the top import block
content = content.replace(
    '"encoding/json"',
    '"context"\n\t"encoding/json"'
)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed threat.go imports")
