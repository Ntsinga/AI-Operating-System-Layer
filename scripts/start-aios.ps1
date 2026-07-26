param(
    [switch]$BuildOnly,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$mobileRoot = Join-Path $projectRoot 'mobile'
$pythonPath = Join-Path $backendRoot '.venv\Scripts\python.exe'
$legacyAndroidPackages = @(
    'com.ntsinga.mobile',
    'com.ntsinga.aios',
    'com.aios',
    'com.elijahntsinga.aios'
)

function Get-ConnectedAndroidDevices {
    $adb = Get-Command adb -ErrorAction SilentlyContinue
    if (-not $adb) { return @() }
    $lines = & adb devices | Select-Object -Skip 1
    return @($lines | Where-Object { $_ -match "`tdevice$" } | ForEach-Object { ($_ -split "`t")[0] })
}

function Remove-LegacyAndroidPackages {
    $devices = Get-ConnectedAndroidDevices
    if ($devices.Count -eq 0) {
        Write-Host 'No connected Android device found for legacy package cleanup.'
        return
    }

    foreach ($device in $devices) {
        foreach ($packageName in $legacyAndroidPackages) {
            $installed = & adb -s $device shell pm list packages $packageName
            if ($installed -match "package:$([regex]::Escape($packageName))") {
                Write-Host "Removing legacy package $packageName from $device..."
                & adb -s $device uninstall $packageName | Out-Host
            }
        }
    }
}

if (-not (Test-Path $pythonPath)) {
    throw "Backend virtualenv not found: $pythonPath"
}

$existing = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
    $backendProcess = Start-Process -FilePath $pythonPath `
        -ArgumentList '-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8000' `
        -WorkingDirectory $backendRoot -WindowStyle Hidden -PassThru
    Write-Host "Backend started (PID $($backendProcess.Id))."
} else {
    Write-Host "Backend already listening (PID $($existing.OwningProcess))."
}

$healthy = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/health' -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            Write-Host "Backend healthy: $($response.Content)"
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $healthy) {
    throw 'Backend did not become healthy on http://127.0.0.1:8000/health.'
}

if ($BuildOnly -or $SkipBuild) {
    if ($SkipBuild) { Write-Host 'Android build skipped.' }
    exit 0
}

Remove-LegacyAndroidPackages

Push-Location $mobileRoot
try {
    $env:NODE_ENV = 'development'
    npm run android
    if ($LASTEXITCODE -ne 0) { throw "Android build/launch failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

