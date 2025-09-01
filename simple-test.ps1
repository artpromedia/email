$token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJkZW1vQGNlZXJpb24uY29tIiwibmFtZSI6IkRlbW8gVXNlciIsImlhdCI6MTY5MzQ0NDgwMCwiZXhwIjoxNjkzNDQ4NDAwLCJqdGkiOiJkZW1vLXRva2VuIn0.demo"
$messageId = "cmezoep9l000e9z5xjmrles4z"

Write-Host "Testing Compose Endpoint Implementation" -ForegroundColor Green

# Test Reply
Write-Host "Testing Reply..." -ForegroundColor Cyan
$replyBody = @{
    messageId = $messageId
    action = "reply"
    includeAttachments = $false
    inlineCidStrategy = "preserve"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/mail/compose/from-message" -Method POST -Headers @{ "Authorization" = $token; "Content-Type" = "application/json" } -Body $replyBody
    
    Write-Host "Reply successful!" -ForegroundColor Green
    Write-Host "Draft ID: $($response.draftId)" -ForegroundColor Yellow
    Write-Host "To: $($response.to -join ', ')" -ForegroundColor Yellow
    Write-Host "Subject: $($response.subject)" -ForegroundColor Yellow
} catch {
    Write-Host "Reply failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Testing Complete!" -ForegroundColor Green
