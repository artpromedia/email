#!/usr/bin/env python3
"""Fix docker-compose.yml to connect transactional-api and calendar directly to postgres."""
path = '/opt/oonrumail/app/docker-compose.yml'
with open(path, 'r') as f:
    lines = f.readlines()

# Fix lines 614 and 657 (1-indexed, so 613 and 656 in 0-indexed)
for idx in [613, 656]:
    if idx < len(lines) and 'pgbouncer' in lines[idx] and 'sslmode=require' in lines[idx]:
        lines[idx] = lines[idx].replace('pgbouncer', 'postgres').replace('sslmode=require', 'sslmode=disable')
        print(f"Fixed line {idx+1}: {lines[idx].strip()}")

with open(path, 'w') as f:
    f.writelines(lines)
print("Done!")
