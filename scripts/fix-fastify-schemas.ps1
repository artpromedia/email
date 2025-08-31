# Fix Fastify Schema Validation Issues
# Removes Zod schemas while preserving OpenAPI tags and summaries

$filePath = "C:\Users\ofema\CNI\apps\api\src\routes\admin\policies.ts"
$content = Get-Content $filePath -Raw

# Remove all schema validation but preserve tags and summaries
$content = $content -replace '(?s)schema:\s*\{[^}]*body:\s*[^,}]+,?\s*([^}]*)\}', 'schema: { $1 }'
$content = $content -replace '(?s)schema:\s*\{[^}]*params:\s*[^,}]+,?\s*([^}]*)\}', 'schema: { $1 }'  
$content = $content -replace '(?s)schema:\s*\{[^}]*response:\s*\{[^}]+\},?\s*([^}]*)\}', 'schema: { $1 }'

# Clean up empty schema objects but preserve tags/summaries
$content = $content -replace 'schema:\s*\{\s*,', 'schema: {'
$content = $content -replace 'schema:\s*\{\s*\}', 'schema: { tags: ["Admin", "Policies"] }'

Set-Content $filePath $content -Encoding UTF8

Write-Host "Fixed schema validation in policies.ts"
