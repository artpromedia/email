filepath = '/opt/oonrumail/app/services/ai-assistant/embedding/service.go'

with open(filepath, 'r') as f:
    lines = f.readlines()

# Fix 1: Move embeddingItem struct to package level
# Find the local type definition (inside the function body)
# Remove it from inside the function and add it after the last top-level type

# Find the local definition
local_start = None
local_end = None
for i, line in enumerate(lines):
    if '\ttype embeddingItem struct {' in line:
        local_start = i
    if local_start is not None and local_end is None and line.strip() == '}':
        local_end = i + 1
        break

if local_start is not None and local_end is not None:
    # Remove the local definition (and blank line after it if any)
    if local_end < len(lines) and lines[local_end].strip() == '':
        local_end += 1
    del lines[local_start:local_end]
    print(f"Removed local embeddingItem definition from lines {local_start+1}-{local_end}")

# Find a good place to insert the package-level definition
# After the last type...struct before the first func
insert_idx = None
for i, line in enumerate(lines):
    if line.startswith('type ') and 'struct' in line:
        # Find the end of this struct
        j = i + 1
        while j < len(lines) and not (lines[j].startswith('}') and (j+1 >= len(lines) or lines[j+1].strip() == '' or lines[j+1].startswith('/'))):
            j += 1
        insert_idx = j + 1
    if line.startswith('func '):
        break

if insert_idx is not None:
    pkg_struct = [
        '\n',
        'type embeddingItem struct {\n',
        '\tindex       int\n',
        '\trequest     EmbeddingRequest\n',
        '\tcontentHash string\n',
        '\tcacheKey    string\n',
        '}\n',
    ]
    lines[insert_idx:insert_idx] = pkg_struct
    print(f"Added package-level embeddingItem at line {insert_idx+1}")

# Fix 2: Fix provider variable shadowing package name
# In processSingleBatch, the variable 'provider' shadows the import 'provider'
# Change: provider, err := s.router.GetEmbeddingProvider(ctx)
# to: embProvider, err := s.router.GetEmbeddingProvider(ctx)
# And fix all references to the variable

content = ''.join(lines)

# Rename the provider variable in processSingleBatch
# Find the function and do targeted replacements
import re

# The function processSingleBatch uses 'provider' as variable name
# Replace within that function scope
old = 'provider, err := s.router.GetEmbeddingProvider(ctx)'
new = 'embProvider, err := s.router.GetEmbeddingProvider(ctx)'
content = content.replace(old, new)

# Fix references within that function
# provider.GenerateEmbeddingBatch -> embProvider.GenerateEmbeddingBatch
content = content.replace('provider.GenerateEmbeddingBatch', 'embProvider.GenerateEmbeddingBatch')

# Fix the type references: &provider.EmbeddingBatchRequest -> this is a type from the provider package
# The issue is that 'provider' (variable) shadows 'provider' (package)
# Since we renamed the variable, the package reference will work again
# But we need to check if EmbeddingBatchRequest and RequestMetadata exist in the provider package

# For now, fix the syntax - use the package name correctly
# batchReq := &provider.EmbeddingBatchRequest{...} - this references the provider PACKAGE type
# Since we renamed the variable, this should work IF the types exist

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed embedding/service.go")

# Fix 3: Remove unused encoding/json import from autoreply/service.go
autoreply_path = '/opt/oonrumail/app/services/ai-assistant/autoreply/service.go'
with open(autoreply_path, 'r') as f:
    content = f.read()

content = content.replace('\t"encoding/json"\n', '')

with open(autoreply_path, 'w') as f:
    f.write(content)

print("Removed unused encoding/json import from autoreply/service.go")
print("\nAll fixes applied!")
