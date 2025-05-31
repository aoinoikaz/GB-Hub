# Try the correct endpoint
$updatePayload = @{
    movieQuotaLimit = 1
    movieQuotaDays = 30
    tvQuotaLimit = 1
    tvQuotaDays = 30
} | ConvertTo-Json

Write-Host "Using correct endpoint: POST /api/v1/user/59/settings/main" -ForegroundColor Yellow
Write-Host "Payload: $updatePayload" -ForegroundColor Cyan

$response = Invoke-RestMethod `
    -Uri "https://request-media.gondolabros.com/api/v1/user/59/settings/main" `
    -Method POST `
    -Headers @{
        "X-Api-Key" = "MTc0ODUzNjA0MzAzMjY1YmY4YmEyLWM5ZjctNGUxMC04MjJlLWUxYzBkYjc1NDUzNg=="
        "Content-Type" = "application/json"
    } `
    -Body $updatePayload

$response | ConvertTo-Json -Depth 10