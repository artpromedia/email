import os
import glob

base = '/opt/oonrumail/app/services/ai-assistant'
files = glob.glob(os.path.join(base, '**', '*.go'), recursive=True)

count = 0
for fpath in files:
    with open(fpath, 'r') as f:
        content = f.read()

    # Fix the mangled replacement: ', " )' -> ', "")'
    if ', " )' in content:
        content = content.replace(', " )', ', "")')
        with open(fpath, 'w') as f:
            f.write(content)
        count += 1
        print(f"Fixed {fpath}")

print(f"\nFixed {count} files")
