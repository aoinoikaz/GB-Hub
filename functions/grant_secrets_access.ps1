# Grant Cloud Functions access to Firebase secrets
# Run this script from the functions directory

$secrets = @(
    "EMBY_API_KEY",
    "PAYPAL_CLIENT_ID", 
    "PAYPAL_SECRET",
    "PAYPAL_API_BASE",
    "PAYPAL_CLIENT_ID_SANDBOX",
    "PAYPAL_SECRET_SANDBOX",
    "PAYPAL_API_BASE_SANDBOX"
)

Write-Host "Granting Cloud Functions access to secrets..." -ForegroundColor Green
Write-Host ""

# Get the current project ID
$projectId = & gcloud config get-value project 2>$null
if ($LASTEXITCODE -ne 0 -or -not $projectId) {
    Write-Host "Error: Unable to get current project ID" -ForegroundColor Red
    Write-Host "Make sure you're logged in with: gcloud auth login" -ForegroundColor Yellow
    exit 1
}

Write-Host "Current project: $projectId" -ForegroundColor Cyan
Write-Host ""

# Using the custom Cloud Functions runtime service account
$serviceAccount = "cloud-functions-runtime@${projectId}.iam.gserviceaccount.com"
Write-Host "Service Account: $serviceAccount" -ForegroundColor Cyan
Write-Host ""

foreach ($secret in $secrets) {
    Write-Host "Processing: $secret" -ForegroundColor Yellow
    
    # Check if secret exists
    $secretCheck = & gcloud secrets describe $secret 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Secret exists, granting access..." -ForegroundColor Gray
        
        # Grant access to the secret
        & gcloud secrets add-iam-policy-binding $secret `
            --member="serviceAccount:$serviceAccount" `
            --role="roles/secretmanager.secretAccessor" `
            --quiet
            
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Access granted successfully" -ForegroundColor Green
        } else {
            Write-Host "  Failed to grant access" -ForegroundColor Red
        }
    } else {
        Write-Host "  Secret does not exist" -ForegroundColor Red
        Write-Host "  Run setup_firebase_secrets.ps1 first to create this secret" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

Write-Host "Script completed!" -ForegroundColor Green
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')