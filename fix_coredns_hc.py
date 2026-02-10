#!/usr/bin/env python3
"""Remove the healthcheck from CoreDNS in docker-compose.yml since
the scratch-based container has no shell or utilities."""
path = '/opt/oonrumail/app/docker-compose.yml'
with open(path, 'r') as f:
    content = f.read()

# Replace the CMD-SHELL true healthcheck with disable
content = content.replace(
    '    healthcheck:\n'
    '      test: ["CMD-SHELL", "true"]\n'
    '      interval: 30s\n'
    '      timeout: 5s\n'
    '      retries: 3\n'
    '      start_period: 5s\n'
    '    networks:\n'
    '      - email-network\n'
    '\n'
    '  # Adminer',

    '    healthcheck:\n'
    '      disable: true\n'
    '    networks:\n'
    '      - email-network\n'
    '\n'
    '  # Adminer'
)

with open(path, 'w') as f:
    f.write(content)
print("Disabled CoreDNS healthcheck (scratch image has no binaries)")
