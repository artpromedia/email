$token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJkZW1vQGNlZXJpb24uY29tIiwibmFtZSI6IkRlbW8gVXNlciIsImlhdCI6MTY5MzQ0NDgwMCwiZXhwIjoxNjkzNDQ4NDAwLCJqdGkiOiJkZW1vLXRva2VuIn0.demo"
$messageId = "cmezoep9l000e9z5xjmrles4z"  # Known message ID from previous tests

Write-Host "🧪 Testing Compose Endpoint Implementation" -ForegroundColor Green

# Test Reply
Write-Host "`n📧 Testing Reply..." -ForegroundColor Cyan
$replyBody = @{
    messageId = $messageId
    action = "reply"
    includeAttachments = $false
    inlineCidStrategy = "preserve"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/mail/compose/from-message" `
        -Method POST `
        -Headers @{ "Authorization" = $token; "Content-Type" = "application/json" } `
        -Body $replyBody
    
    Write-Host "✅ Reply successful!" -ForegroundColor Green
    Write-Host "Draft ID: $($response.draftId)" -ForegroundColor Yellow
    Write-Host "To: $($response.to -join ', ')" -ForegroundColor Yellow
    Write-Host "Subject: $($response.subject)" -ForegroundColor Yellow
    Write-Host "HTML Body Length: $($response.bodyHtml.Length) chars" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Reply failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Reply All
Write-Host "`n📧 Testing Reply All..." -ForegroundColor Cyan
$replyAllBody = @{
    messageId = $messageId
    action = "replyAll"
    includeAttachments = $false
    inlineCidStrategy = "preserve"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/mail/compose/from-message" `
        -Method POST `
        -Headers @{ "Authorization" = $token; "Content-Type" = "application/json" } `
        -Body $replyAllBody
    
    Write-Host "✅ Reply All successful!" -ForegroundColor Green
    Write-Host "Draft ID: $($response.draftId)" -ForegroundColor Yellow
    Write-Host "To: $($response.to -join ', ')" -ForegroundColor Yellow
    Write-Host "CC: $($response.cc -join ', ')" -ForegroundColor Yellow
    Write-Host "Subject: $($response.subject)" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Reply All failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Forward
Write-Host "`n📧 Testing Forward..." -ForegroundColor Cyan
$forwardBody = @{
    messageId = $messageId
    action = "forward"
    includeAttachments = $true
    inlineCidStrategy = "preserve"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/mail/compose/from-message" `
        -Method POST `
        -Headers @{ "Authorization" = $token; "Content-Type" = "application/json" } `
        -Body $forwardBody
    
    Write-Host "✅ Forward successful!" -ForegroundColor Green
    Write-Host "Draft ID: $($response.draftId)" -ForegroundColor Yellow
    Write-Host "Subject: $($response.subject)" -ForegroundColor Yellow
    Write-Host "Attachments Size Exceeded: $($response.attachmentsSizeExceeded)" -ForegroundColor Yellow
    Write-Host "HTML Body Length: $($response.bodyHtml.Length) chars" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Forward failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTesting Complete!" -ForegroundColor Green
