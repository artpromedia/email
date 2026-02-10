#!/usr/bin/env python3
"""Fix transactional-api config.yaml to listen on port 8085 (matching compose)."""
path = '/opt/oonrumail/app/services/transactional-api/config.yaml'
with open(path, 'r') as f:
    content = f.read()

# Change addr from :8080 to use PORT env var
content = content.replace('addr: ":8080"', 'addr: ":${PORT}"')

with open(path, 'w') as f:
    f.write(content)
print("Fixed!")
