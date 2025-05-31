# Get current user first to preserve all fields
$user = Invoke-RestMethod `
    -Uri "https://request-media.gondolabros.com/api/v1/user/59" `
    -Method GET `
    -Headers @{ "X-Api-Key" = "MTc0ODUzNjA0MzAzMjY1YmY4YmEyLWM5ZjctNGUxMC04MjJlLWUxYzBkYjc1NDUzNg==" }

# Send FULL object (Fallenbagel said we must send complete object)
$updatePayload = @{
    username = $user.username
    email = $user.email  # Required - either their email or jellyfin username
    discordId = $user.settings.discordId
    locale = $user.settings.locale
    discoverRegion = $user.settings.discoverRegion
    streamingRegion = $user.settings.streamingRegion
    originalLanguage = $user.settings.originalLanguage
    movieQuotaLimit = 1
    movieQuotaDays = 30
    tvQuotaLimit = $null     # Test null for "no TV allowed"
    tvQuotaDays = $null
    watchlistSyncMovies = $user.settings.watchlistSyncMovies
    watchlistSyncTv = $user.settings.watchlistSyncTv
} | ConvertTo-Json

Write-Host "Testing with NULL for TV quotas:" -ForegroundColor Yellow
Write-Host "Payload: $updatePayload" -ForegroundColor Cyan

$response = Invoke-RestMethod `
    -Uri "https://request-media.gondolabros.com/api/v1/user/59/settings/main" `
    -Method POST `
    -Headers @{
        "X-Api-Key" = "MTc0ODUzNjA0MzAzMjY1YmY4YmEyLWM5ZjctNGUxMC04MjJlLWUxYzBkYjc1NDUzNg=="
        "Content-Type" = "application/json"
    } `
    -Body $updatePayload

Write-Host "`nResult - TV Quota: $($response.tvQuotaLimit), Days: $($response.tvQuotaDays)" -ForegroundColor Green