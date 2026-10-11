# JARVIS 2.0 - Native Desktop Application Launcher
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "   JARVIS 2.0 -- Autonomous Desktop Application      " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Start Ollama
$ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
if (Test-Path $ollamaPath) {
    Write-Host "[1/3] Ensuring Ollama daemon is active..." -ForegroundColor Gray
    Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
}

# 2. Start Backend Daemon
Write-Host "[2/3] Starting JARVIS Core Runtime Daemon..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "dist/cli/bin.js start" -WorkingDirectory $scriptDir -WindowStyle Minimized

Start-Sleep -Seconds 2

# 3. Start UI Dev Engine
Write-Host "[3/3] Starting Studio Engine..." -ForegroundColor Green
$uiDir = Join-Path $scriptDir "ui"
Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory $uiDir -WindowStyle Minimized

Start-Sleep -Seconds 3

# 4. Launch Native Desktop App Window
Write-Host "Launching JARVIS Native Desktop Window..." -ForegroundColor Cyan
Start-Process -FilePath "npx.cmd" -ArgumentList "electron ." -WorkingDirectory $uiDir

Write-Host "`nJARVIS Native Desktop App is running." -ForegroundColor Green
