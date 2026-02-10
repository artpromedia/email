import os

bt = chr(96)

# Fix 1: Add AddSuppressionRequest to suppression.go
supp_path = '/opt/oonrumail/app/services/transactional-api/models/suppression.go'
with open(supp_path, 'r') as f:
    content = f.read()

if 'AddSuppressionRequest' not in content:
    content += f"""

// AddSuppressionRequest is the request to add a suppression entry
type AddSuppressionRequest struct {{
\tEmail  string {bt}json:"email" validate:"required,email"{bt}
\tReason string {bt}json:"reason,omitempty"{bt}
}}
"""
    with open(supp_path, 'w') as f:
        f.write(content)
    print("Added AddSuppressionRequest to suppression.go")
else:
    print("AddSuppressionRequest already exists")

# Fix 2: Add APIKeyResponse to api_key.go
apikey_path = '/opt/oonrumail/app/services/transactional-api/models/api_key.go'
with open(apikey_path, 'r') as f:
    content = f.read()

if 'type APIKeyResponse struct' not in content:
    content += f"""

// APIKeyResponse is the API response for an API key
type APIKeyResponse struct {{
\tID        uuid.UUID    {bt}json:"id"{bt}
\tName      string       {bt}json:"name"{bt}
\tKey       string       {bt}json:"key,omitempty"{bt}
\tKeyPrefix string       {bt}json:"key_prefix"{bt}
\tScopes    []APIKeyScope {bt}json:"scopes"{bt}
\tRateLimit int          {bt}json:"rate_limit"{bt}
\tExpiresAt *time.Time   {bt}json:"expires_at,omitempty"{bt}
\tCreatedAt time.Time    {bt}json:"created_at"{bt}
}}
"""
    with open(apikey_path, 'w') as f:
        f.write(content)
    print("Added APIKeyResponse to api_key.go")
else:
    print("APIKeyResponse already exists")

# Fix 3: Fix handlers/other.go type issues
handler_path = '/opt/oonrumail/app/services/transactional-api/handlers/other.go'
with open(handler_path, 'r') as f:
    content = f.read()

# Fix scope validation - cast APIKeyScope to string for map lookup
content = content.replace(
    'if !validScopes[scope] {',
    'if !validScopes[string(scope)] {'
)
content = content.replace(
    '"Invalid scope: " + scope',
    '"Invalid scope: " + string(scope)'
)

# Fix RateLimit - change from pointer to value comparison
content = content.replace(
    'if req.RateLimit != nil {\n\t\trateLimit = *req.RateLimit\n\t}',
    'if req.RateLimit > 0 {\n\t\trateLimit = req.RateLimit\n\t}'
)

# Fix req.Scopes []APIKeyScope -> []string conversion for repo.Create
# The repo.Create expects []string but req.Scopes is []APIKeyScope
# We need to convert, or change the repo call
# Easiest: convert scopes to []string before passing
old_create = 'key, rawKey, err := h.repo.Create(r.Context(), orgID, req.Name, req.Scopes, rateLimit, req.ExpiresAt)'
new_create = '''scopeStrings := make([]string, len(req.Scopes))
\tfor i, s := range req.Scopes {
\t\tscopeStrings[i] = string(s)
\t}

\tkey, rawKey, err := h.repo.Create(r.Context(), orgID, req.Name, scopeStrings, rateLimit, req.ExpiresAt)'''
content = content.replace(old_create, new_create)

with open(handler_path, 'w') as f:
    f.write(content)
print("Fixed handlers/other.go type issues")

print("\nAll fixes applied!")
