$currentPermissions = 71303200

# Permission flags
$REQUEST_TV = 16        # bit 4
$REQUEST_4K_TV = 16384  # bit 14

# Remove TV permissions using bitwise AND with NOT
$newPermissions = $currentPermissions -band (-bnot ($REQUEST_TV -bor $REQUEST_4K_TV))

Write-Host "Current permissions: $currentPermissions" -ForegroundColor Yellow
Write-Host "New permissions: $newPermissions" -ForegroundColor Green
Write-Host "Binary: $([Convert]::ToString($newPermissions, 2))" -ForegroundColor Cyan

# Update user with new permissions
$payload = @{
    permissions = $newPermissions
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "https://request-media.gondolabros.com/api/v1/user/59" `
    -Method PUT `
    -Headers @{
        "X-Api-Key" = "MTc0ODUzNjA0MzAzMjY1YmY4YmEyLWM5ZjctNGUxMC04MjJlLWUxYzBkYjc1NDUzNg=="
        "Content-Type" = "application/json"
    } `
    -Body $payload

Write-Host "Updated permissions to disable TV requests!" -ForegroundColor Green