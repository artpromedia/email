#!/usr/bin/env python3
"""Fix config.yaml files to use plain ${VAR} without :- defaults that Go's os.ExpandEnv doesn't support.
Replace ${VAR:-default} with ${VAR} since Docker Compose always provides the env vars."""
import re

def fix_config_yaml(path):
    with open(path, 'r') as f:
        content = f.read()

    # Replace ${VAR:-default} with ${VAR}
    # Pattern: ${VARNAME:-anything_until_closing_brace}
    # Need to handle nested braces and URLs carefully
    fixed = re.sub(r'\$\{([A-Za-z_][A-Za-z0-9_]*):-[^}]*\}', r'${\1}', content)

    with open(path, 'w') as f:
        f.write(fixed)

    changes = content != fixed
    print(f"{'Fixed' if changes else 'No changes needed for'} {path}")

fix_config_yaml('/opt/oonrumail/app/services/calendar/config.yaml')
fix_config_yaml('/opt/oonrumail/app/services/transactional-api/config.yaml')
print("Done!")
