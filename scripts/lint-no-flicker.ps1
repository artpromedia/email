# CI Script to enforce no-hash-href lint rule (PowerShell version)
# This script will block CI if any anchor tags with href="#" are found

$ErrorActionPreference = "Stop"

Write-Host "🔍 Running lint checks to prevent static buttons and flicker..." -ForegroundColor Cyan

# Run ESLint with the custom rule
Write-Host "📝 Checking for anchor tags with href='#'..." -ForegroundColor Yellow
try {
    npx eslint "apps/**/*.ts" "apps/**/*.tsx" "apps/**/*.js" "apps/**/*.jsx" "packages/**/*.ts" "packages/**/*.tsx" "packages/**/*.js" "packages/**/*.jsx" --config packages/config/eslint.config.js --rule "custom/no-hash-href: error"
} catch {
    Write-Host "❌ ESLint found issues with hash href patterns" -ForegroundColor Red
    exit 1
}

# Check for any remaining href="#" patterns in files
Write-Host "🔎 Scanning for any remaining href='#' patterns..." -ForegroundColor Yellow

$hashHrefFiles = @()
$searchDirs = @("apps", "packages")

foreach ($dir in $searchDirs) {
    if (Test-Path $dir) {
        $files = Get-ChildItem -Path $dir -Recurse -Include *.tsx, *.ts, *.jsx, *.js
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            if ($content -match 'href=[""'']#[""'']') {
                $hashHrefFiles += $file.FullName
            }
        }
    }
}

if ($hashHrefFiles.Count -gt 0) {
    Write-Host "❌ Found $($hashHrefFiles.Count) files with href='#' in the codebase:" -ForegroundColor Red
    foreach ($file in $hashHrefFiles) {
        Write-Host "  $file" -ForegroundColor Red
        # Show line numbers
        $lineNumber = 1
        $content = Get-Content $file
        foreach ($line in $content) {
            if ($line -match 'href=[""'']#[""'']') {
                Write-Host "    Line $lineNumber`: $line" -ForegroundColor Yellow
            }
            $lineNumber++
        }
    }
    Write-Host ""
    Write-Host "🚫 CI blocked: Static anchor buttons with href='#' are not allowed." -ForegroundColor Red
    Write-Host "💡 Use <button> elements for interactive elements that don't navigate." -ForegroundColor Green
    Write-Host "💡 Use React Router's Link or useNavigate for navigation." -ForegroundColor Green
    exit 1
}

# Also check for onClick handlers on anchor tags without proper href
Write-Host "🔍 Checking for anchor tags with onClick but no proper href..." -ForegroundColor Yellow

$onClickAnchorFiles = @()
foreach ($dir in $searchDirs) {
    if (Test-Path $dir) {
        $files = Get-ChildItem -Path $dir -Recurse -Include *.tsx, *.ts, *.jsx, *.js
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            # Check for <a> tags with onClick but without href
            if ($content -match '<a[^>]*onClick[^>]*>' -and $content -notmatch '<a[^>]*onClick[^>]*href=') {
                $onClickAnchorFiles += $file.FullName
            }
        }
    }
}

if ($onClickAnchorFiles.Count -gt 0) {
    Write-Host "⚠️  Found $($onClickAnchorFiles.Count) anchor tags with onClick but no href:" -ForegroundColor Yellow
    foreach ($file in $onClickAnchorFiles) {
        Write-Host "  $file" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "💡 Consider using <button> elements instead of <a> tags for non-navigation interactions." -ForegroundColor Green
}

Write-Host "✅ No static anchor buttons found - CI check passed!" -ForegroundColor Green

# Run the regular lint check
Write-Host "📋 Running full ESLint check..." -ForegroundColor Cyan
try {
    npx eslint "apps/**/*.ts" "apps/**/*.tsx" "apps/**/*.js" "apps/**/*.jsx" "packages/**/*.ts" "packages/**/*.tsx" "packages/**/*.js" "packages/**/*.jsx" --config packages/config/eslint.config.js
} catch {
    Write-Host "❌ ESLint found other issues" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 All lint checks passed!" -ForegroundColor Green
