# Fix Enhanced Compose Implementation Markdown

$content = Get-Content "c:\Users\ofema\CNI\ENHANCED_COMPOSE_IMPLEMENTATION.md" -Raw

# Fix headings - add blank lines around them
$content = $content -replace '(?m)^(## Overview)$', "`n`$1`n"
$content = $content -replace '(?m)^(#### 1\. Frontend Hooks)$', "`n`$1`n"
$content = $content -replace '(?m)^(#### 2\. UI Components)$', "`n`$1`n"
$content = $content -replace '(?m)^(#### 3\. Backend API)$', "`n`$1`n"
$content = $content -replace '(?m)^(#### 4\. SDK Client)$', "`n`$1`n"
$content = $content -replace '(?m)^(#### 5\. Code Quality & Testing)$', "`n`$1`n"
$content = $content -replace '(?m)^(### File Upload Flow)$', "`n`$1`n"
$content = $content -replace '(?m)^(### Virus Scanning)$', "`n`$1`n"
$content = $content -replace '(?m)^(### State Management)$', "`n`$1`n"
$content = $content -replace '(?m)^(### ✅ Core Functionality)$', "`n`$1`n"
$content = $content -replace '(?m)^(### ✅ Advanced Features)$', "`n`$1`n"
$content = $content -replace '(?m)^(### ✅ User Experience)$', "`n`$1`n"

# Fix lists - add blank lines around them
$content = $content -replace '(?m)^(-\s\*\*)', "`n`$1"
$content = $content -replace '(?m)^(1\.\s\*\*)', "`n`$1"
$content = $content -replace '(?m)^(- \[x\])', "`n`$1"

# Add language to code blocks
$content = $content -replace '(?m)^```$', '```text'

# Fix fenced code blocks - add blank lines
$content = $content -replace '(?m)^(```sql)$', "`n`$1"
$content = $content -replace '(?m)^(```bash)$', "`n`$1"

# Save the fixed content
$content | Set-Content "c:\Users\ofema\CNI\ENHANCED_COMPOSE_IMPLEMENTATION.md" -NoNewline

Write-Host "Fixed markdown lint issues in ENHANCED_COMPOSE_IMPLEMENTATION.md"
