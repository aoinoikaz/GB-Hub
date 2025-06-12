# Gondola Bros Hub - Cloud Functions Deployment Script
# Using Google Secret Manager - No hardcoded credentials needed!

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ID = "gondola-bros-hub"
$REGION = "us-central1"
$RUNTIME = "nodejs22"
$SOURCE_DIR = "C:\GitHub\GB-Hub\functions"
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

# List of HTTP functions to deploy
$httpFunctions = @(
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
    "checkUsername",
    "toggleAutoRenew",
    "getJellyseerrQuotas",
    "verifySignup",
    "initiate2FA"
)

# List of scheduled functions
$scheduledFunctions = @(
    "processAutoRenewals"
)

# Common deployment parameters for HTTP functions
$httpParams = @(
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
#$httpParams += "--set-env-vars=PAYPAL_SANDBOX=true"

$totalFunctions = $httpFunctions.Count + $scheduledFunctions.Count

Write-ColorOutput Yellow "`n=========================================="
Write-ColorOutput Yellow "Starting deployment of Cloud Functions to GCP"
Write-ColorOutput Yellow "=========================================="
Write-ColorOutput Cyan "Project: $PROJECT_ID"
Write-ColorOutput Cyan "Region: $REGION"
Write-ColorOutput Cyan "Runtime: $RUNTIME"
Write-ColorOutput Cyan "HTTP functions to deploy: $($httpFunctions.Count)"
Write-ColorOutput Cyan "Scheduled functions to deploy: $($scheduledFunctions.Count)"
Write-ColorOutput Cyan "Total functions to deploy: $totalFunctions`n"

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

# Deploy HTTP functions
Write-ColorOutput Yellow "`nDeploying HTTP Functions..."
Write-ColorOutput Yellow "=========================="
foreach ($func in $httpFunctions) {
    Write-ColorOutput Yellow "Deploying $func..."
    
    try {
        $deployCommand = "gcloud functions deploy $func " + ($httpParams -join " ")
        
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

# Deploy scheduled functions
Write-ColorOutput Yellow "`nDeploying Scheduled Functions..."
Write-ColorOutput Yellow "================================"
foreach ($func in $scheduledFunctions) {
    Write-ColorOutput Yellow "Deploying $func (scheduled function)..."
    
    try {
        # First deploy as HTTP function
        $deployCommand = "gcloud functions deploy $func " + ($httpParams -join " ")
        
        # Execute the deployment
        Invoke-Expression $deployCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput Green "$func deployed successfully!`n"
            $successCount++
            
            # Now create or update the scheduler job
            Write-ColorOutput Cyan "Setting up Cloud Scheduler job..."
            $schedulerName = "$func-schedule"
            
            # Check if scheduler job exists
            $checkScheduler = "gcloud scheduler jobs describe $schedulerName --location=$REGION --project=$PROJECT_ID 2>&1"
            $schedulerExists = Invoke-Expression $checkScheduler
            
            if ($LASTEXITCODE -ne 0) {
                # Create new scheduler job
                Write-ColorOutput Yellow "Creating new scheduler job..."
                $createSchedulerCommand = @"
gcloud scheduler jobs create http $schedulerName ``
    --location=$REGION ``
    --schedule="0 0 * * *" ``
    --uri="https://$REGION-$PROJECT_ID.cloudfunctions.net/$func" ``
    --http-method=GET ``
    --project=$PROJECT_ID ``
    --time-zone="UTC" ``
    --description="Runs $func daily at midnight UTC"
"@
                Invoke-Expression $createSchedulerCommand
                
                if ($LASTEXITCODE -eq 0) {
                    Write-ColorOutput Green "Scheduler job created successfully!`n"
                } else {
                    Write-ColorOutput Red "Failed to create scheduler job!`n"
                }
            } else {
                Write-ColorOutput Green "Scheduler job already exists.`n"
                
                # Update the existing job to ensure it has correct settings
                Write-ColorOutput Cyan "Updating scheduler job configuration..."
                $updateSchedulerCommand = @"
gcloud scheduler jobs update http $schedulerName ``
    --location=$REGION ``
    --schedule="0 0 * * *" ``
    --uri="https://$REGION-$PROJECT_ID.cloudfunctions.net/$func" ``
    --http-method=GET ``
    --project=$PROJECT_ID ``
    --time-zone="UTC" ``
    --description="Runs $func daily at midnight UTC"
"@
                Invoke-Expression $updateSchedulerCommand
                
                if ($LASTEXITCODE -eq 0) {
                    Write-ColorOutput Green "Scheduler job updated successfully!`n"
                }
            }
        }
        else {
            throw "Function deployment failed with exit code $LASTEXITCODE"
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
Write-ColorOutput Green "Successfully deployed: $successCount/$totalFunctions functions"

if ($failedFunctions.Count -gt 0) {
    Write-ColorOutput Red "`nFailed functions:"
    foreach ($failed in $failedFunctions) {
        Write-ColorOutput Red "   - $failed"
    }
    
    Write-ColorOutput Yellow "`nTo retry failed functions individually, run:"
    foreach ($failed in $failedFunctions) {
        Write-ColorOutput Cyan "gcloud functions deploy $failed $($httpParams -join ' ')"
    }
}

# Additional helpful commands
Write-ColorOutput Yellow "`nUseful commands:"
Write-ColorOutput Cyan "- View logs: gcloud functions logs read --project=$PROJECT_ID"
Write-ColorOutput Cyan "- Check function status: gcloud functions list --project=$PROJECT_ID"
Write-ColorOutput Cyan "- Test a function: gcloud functions call FUNCTION_NAME --project=$PROJECT_ID"
Write-ColorOutput Cyan "- Check scheduler jobs: gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID"
Write-ColorOutput Cyan "- Run scheduled job manually: gcloud scheduler jobs run processAutoRenewals-schedule --location=$REGION --project=$PROJECT_ID"

Write-ColorOutput Green "`nDeployment script completed!"

Read-Host -Prompt "`nPress Enter to exit"