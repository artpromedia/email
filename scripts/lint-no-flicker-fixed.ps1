# CI Script to enforce no-hash-href lint rule (PowerShell version)
# This script will block CI if any anchor tags with href="#" are found

$ErrorActionPreference = "Stop"

# Change to the admin app directory
Set-Location "apps\admin"

Write-Host "Running lint checks to prevent static buttons and flicker..." -ForegroundColor Cyan

# Check for any href="#" patterns in admin files
Write-Host "Scanning for href='#' patterns in admin app..." -ForegroundColor Yellow

$hashHrefFiles = @()
$files = Get-ChildItem -Path "src" -Recurse -Include *.tsx, *.ts, *.jsx, *.js

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -and $content -match 'href=[""'']#[""'']') {
        $hashHrefFiles += $file.FullName
    }
}

if ($hashHrefFiles.Count -gt 0) {
    Write-Host "Found $($hashHrefFiles.Count) files with href='#' in the admin app:" -ForegroundColor Red
    foreach ($file in $hashHrefFiles) {
        Write-Host "  $file" -ForegroundColor Red
        # Show line numbers
        $lineNumber = 1
        $content = Get-Content $file -ErrorAction SilentlyContinue
        if ($content) {
            foreach ($line in $content) {
                if ($line -match 'href=[""'']#[""'']') {
                    Write-Host "    Line $lineNumber : $line" -ForegroundColor Yellow
                }
                $lineNumber++
            }
        }
    }
    Write-Host ""
    Write-Host "CI BLOCKED: Static anchor buttons with href='#' are not allowed." -ForegroundColor Red
    Write-Host "Use <button> elements for interactive elements that don't navigate." -ForegroundColor Green
    Write-Host "Use React Router's Link or useNavigate for navigation." -ForegroundColor Green
    Set-Location "..\.."
    exit 1
}

# Check for onClick handlers on anchor tags without proper href
Write-Host "Checking for anchor tags with onClick but no proper href..." -ForegroundColor Yellow

$onClickAnchorFiles = @()
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        # Check for <a> tags with onClick but without href
        if ($content -match '<a[^>]*onClick[^>]*>' -and $content -notmatch '<a[^>]*onClick[^>]*href=') {
            $onClickAnchorFiles += $file.FullName
        }
    }
}

if ($onClickAnchorFiles.Count -gt 0) {
    Write-Host "Found $($onClickAnchorFiles.Count) anchor tags with onClick but no href:" -ForegroundColor Yellow
    foreach ($file in $onClickAnchorFiles) {
        Write-Host "  $file" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Consider using <button> elements instead of <a> tags for non-navigation interactions." -ForegroundColor Green
}

Write-Host "No static anchor buttons found - CI check passed!" -ForegroundColor Green

# Run ESLint on admin files
Write-Host "Running ESLint on admin files..." -ForegroundColor Cyan
try {
    npx eslint "src/**/*.{ts,tsx,js,jsx}" --max-warnings 0
    Write-Host "ESLint check passed!" -ForegroundColor Green
} catch {
    Write-Host "ESLint found issues" -ForegroundColor Red
    Set-Location "..\.."
    exit 1
}

# Return to root directory
Set-Location "..\.."

Write-Host "All lint checks passed successfully!" -ForegroundColor Green
