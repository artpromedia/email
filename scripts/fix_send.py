filepath = '/opt/oonrumail/app/services/transactional-api/handlers/send.go'

with open(filepath, 'r') as f:
    content = f.read()

# Remove the stray import line and the dummy struct/var lines around it
lines_to_remove = [
    'import "transactional-api/repository"',
    '// Import for repository',
    'type repository struct{}',
    'var _ = repository{}',
]

lines = content.split('\n')
cleaned = [l for l in lines if l.strip() not in lines_to_remove]
content = '\n'.join(cleaned)

# Add repository import to the top import block
content = content.replace(
    '\t"transactional-api/service"',
    '\t"transactional-api/repository"\n\t"transactional-api/service"'
)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed send.go imports")
