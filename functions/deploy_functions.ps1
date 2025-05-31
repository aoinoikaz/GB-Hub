# Gondola Bros Hub - Cloud Functions Deployment Script
# Using Google Secret Manager - No hardcoded credentials needed!

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ID = "gondola-bros-hub"
$REGION = "us-central1"
$RUNTIME = "nodejs22"
$SOURCE_DIR = "C:\repos\gbhub\functions"
$SERVICE_ACCOUNT = "cloud-functions-runtime@gondola-bros-hub.iam.gserviceaccount.com"
$BUILD_SERVICE_ACCOUNT = "projects/gondola-bros-hub/serviceAccounts/cloud-functions-build@gondola-bros-hub.iam.gserviceaccount.com"

# Color output functions
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

# List of all functions to deploy
$functions = @(
    "createPaypalOrder",
    "processTokenPurchase",
    "createTipOrder",
    "processTip",
    "processTokenTrade",
    "processSubscription",
    "checkSubscriptionStatus",
    "setupUserAccount",
    "syncEmbyPassword",
    "activateEmbyAccount",
    "uploadProfileImage",
    "checkUsername"
    "cancelScheduledDowngrade"
)

# Common deployment parameters
$commonParams = @(
    "--region=$REGION",
    "--runtime=$RUNTIME",
    "--trigger-http",
    "--source=$SOURCE_DIR",
    "--service-account=$SERVICE_ACCOUNT",
    "--build-service-account=$BUILD_SERVICE_ACCOUNT",
    "--project=$PROJECT_ID",
    "--allow-unauthenticated",
    "--set-env-vars=GCLOUD_PROJECT=$PROJECT_ID"
)

# Optional: Set PayPal sandbox mode (uncomment if needed)
$commonParams += "--set-env-vars=PAYPAL_SANDBOX=true"

Write-ColorOutput Yellow "`n=========================================="
Write-ColorOutput Yellow "Starting deployment of Cloud Functions to GCP"
Write-ColorOutput Yellow "=========================================="
Write-ColorOutput Cyan "Project: $PROJECT_ID"
Write-ColorOutput Cyan "Region: $REGION"
Write-ColorOutput Cyan "Runtime: $RUNTIME"
Write-ColorOutput Cyan "Total functions to deploy: $($functions.Count)`n"

# Build the functions first
Write-ColorOutput Yellow "Building functions..."
Push-Location $SOURCE_DIR
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed!"
    }
    Write-ColorOutput Green "Build successful!`n"
}
catch {
    Write-ColorOutput Red "Build failed: $_"
    Pop-Location
    exit 1
}
Pop-Location

# Deploy each function
$successCount = 0
$failedFunctions = @()

foreach ($func in $functions) {
    Write-ColorOutput Yellow "Deploying $func..."
    
    try {
        $deployCommand = "gcloud functions deploy $func " + ($commonParams -join " ")
        
        # Execute the deployment
        Invoke-Expression $deployCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput Green "$func deployed successfully!`n"
            $successCount++
        }
        else {
            throw "Deployment failed with exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-ColorOutput Red "Failed to deploy $func : $_`n"
        $failedFunctions += $func
    }
}

# Summary
Write-ColorOutput Yellow "`n=========================================="
Write-ColorOutput Yellow "Deployment Summary"
Write-ColorOutput Yellow "=========================================="
Write-ColorOutput Green "Successfully deployed: $successCount/$($functions.Count) functions"

if ($failedFunctions.Count -gt 0) {
    Write-ColorOutput Red "`nFailed functions:"
    foreach ($failed in $failedFunctions) {
        Write-ColorOutput Red "   - $failed"
    }
    
    Write-ColorOutput Yellow "`nTo retry failed functions individually, run:"
    foreach ($failed in $failedFunctions) {
        Write-ColorOutput Cyan "gcloud functions deploy $failed $($commonParams -join ' ')"
    }
}

# Additional helpful commands
Write-ColorOutput Yellow "`nUseful commands:"
Write-ColorOutput Cyan "- View logs: gcloud functions logs read --project=$PROJECT_ID"
Write-ColorOutput Cyan "- Check function status: gcloud functions list --project=$PROJECT_ID"
Write-ColorOutput Cyan "- Test a function: gcloud functions call FUNCTION_NAME --project=$PROJECT_ID"

Write-ColorOutput Green "`nDeployment script completed!"
Read-Host -Prompt "`nPress Enter to exit"