#Requires -Version 5.1
<#
.SYNOPSIS
    Desktop build script for seaserver (Electron + Go sidecar) -- native Windows.
.DESCRIPTION
    Builds:
      - Standalone web server:  seanime.exe + web/
      - Electron desktop installer: seanime-denshi/dist/seanime-denshi-<version>_Windows_x64.exe
    Prerequisites: Go 1.23+, Node.js 18+, npm
    NSIS is bundled by electron-builder; no manual install needed.
#>

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$StatsFile = Join-Path $ScriptDir 'build-all-desktop-stats.json'

# -- Helpers -----------------------------------------------

$esc = [char]27
$symCheck  = [char]0x2713
$symCross  = [char]0x2715
$symBullet = [char]0x2022

$dividerLine = ('-' * 44)

function Divider   { Write-Host "$esc[2m$dividerLine$esc[0m" }
function BoxTitle  { param([string]$t) Divider; Write-Host "$esc[1m$t$esc[0m"; Divider }
function Step      { param([string]$n,[string]$msg) Write-Host "$esc[34m$esc[1m[$n]$esc[0m $msg" }
function SubStep   { param([string]$msg) Write-Host "$esc[36m  $symBullet$esc[0m $msg" }
function Success   { param([string]$msg) Write-Host "$esc[32m$symCheck$esc[0m $msg" }
function Warn      { param([string]$msg) Write-Host "$esc[33m!$esc[0m $msg" }
function Fail      { param([string]$msg) Write-Host "$esc[31m$symCross$esc[0m $msg" }

function Invoke-StepCmd {
    param([string]$Description, [scriptblock]$Command)
    try { & $Command } catch {
        Fail "Failed: $Description"
        throw
    }
}

# -- Stats helpers -----------------------------------------

function Init-Stats {
    if (-not (Test-Path $StatsFile)) {
        @{ total_runs = 0; successes = 0; last_duration_secs = 0 } |
            ConvertTo-Json | Set-Content -Path $StatsFile -Encoding UTF8
    }
}

function Read-Stats {
    Get-Content -Path $StatsFile -Raw | ConvertFrom-Json
}

function Write-Stats {
    param([int]$TotalRuns, [int]$Successes, [int]$Duration)
    @{ total_runs = $TotalRuns; successes = $Successes; last_duration_secs = $Duration } |
        ConvertTo-Json | Set-Content -Path $StatsFile -Encoding UTF8
}

function Print-Stats {
    $s = Read-Stats
    Write-Host "$esc[35mStats:$esc[0m total runs: $esc[1m$($s.total_runs)$esc[0m | successes: $esc[1m$($s.successes)$esc[0m | last duration: $esc[1m$($s.last_duration_secs)s$esc[0m"
}

function Assert-Command {
    param([string]$Name, [string]$FriendlyName)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail "$FriendlyName ($Name) not found."
        return $false
    }
    return $true
}

# -- Preflight ---------------------------------------------

Init-Stats
$StartTime = Get-Date

BoxTitle 'Seaserver Denshi Build (Windows)'
Print-Stats

# -- 0. Environment checks --------------------------------

Step '0.1' 'Environment check'
SubStep "Script dir: $ScriptDir"
SubStep "Node: $(try { node -v } catch { 'not found' })"
SubStep "npm:  $(try { npm -v } catch { 'not found' })"
SubStep "Go:   $(try { go version } catch { 'not found' })"

Step '0.2' 'Sanity checks'
if (-not (Test-Path (Join-Path $ScriptDir 'seanime-web'))) {
    Fail 'Missing directory: seanime-web'; exit 1
}
if (-not (Test-Path (Join-Path $ScriptDir 'seanime-denshi'))) {
    Fail 'Missing directory: seanime-denshi'; exit 1
}
if (-not (Assert-Command 'node' 'Node.js'))  { exit 1 }
if (-not (Assert-Command 'npm' 'npm'))       { exit 1 }
if (-not (Assert-Command 'go' 'Go'))         { exit 1 }
Success 'Required directories and tools present'

# -- 1. Frontend (Electron variant) -----------------------

Step '1.1' 'Frontend dependencies'
Invoke-StepCmd 'npm ci (seanime-web)' {
    Push-Location (Join-Path $ScriptDir 'seanime-web')
    try {
        SubStep 'Running npm ci...'
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    } finally { Pop-Location }
}
Success 'Dependencies installed'

Step '1.2' 'Frontend build (Electron/denshi variant)'
Invoke-StepCmd 'npm run build:denshi' {
    Push-Location (Join-Path $ScriptDir 'seanime-web')
    try {
        SubStep 'Type-checking and bundling with denshi env...'
        npm run build:denshi
        if ($LASTEXITCODE -ne 0) { throw 'build:denshi failed' }
        SubStep 'Checking build output (./out-denshi)...'
        if (-not (Test-Path 'out-denshi')) { throw 'Frontend build output missing (expected seanime-web/out-denshi/)' }
    } finally { Pop-Location }
}
Success 'Frontend built (denshi)'

# -- 2. Copy denshi web output ----------------------------

Step '2.1' 'Prepare denshi web output'
$DenshiWebDir = Join-Path $ScriptDir 'seanime-denshi\web-denshi'
SubStep "Removing old $DenshiWebDir..."
if (Test-Path $DenshiWebDir) {
    Remove-Item -Recurse -Force $DenshiWebDir
}
SubStep 'Copying seanime-web/out-denshi -> seanime-denshi/web-denshi...'
Copy-Item -Recurse -Force (Join-Path $ScriptDir 'seanime-web\out-denshi') $DenshiWebDir
if (Test-Path $DenshiWebDir) { Success "Denshi web output ready at $DenshiWebDir" }

# -- 3. Standalone web build ------------------------------

Step '3.1' 'Frontend build (web/standalone variant)'
Invoke-StepCmd 'npm run build (web)' {
    Push-Location (Join-Path $ScriptDir 'seanime-web')
    try {
        SubStep 'Building web variant...'
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'build failed' }
        if (-not (Test-Path 'out')) { throw 'Frontend web build output missing' }
    } finally { Pop-Location }
}
Success 'Frontend built (web)'

Step '3.2' 'Prepare standalone web output'
SubStep 'Removing old ./web...'
if (Test-Path (Join-Path $ScriptDir 'web')) {
    Remove-Item -Recurse -Force (Join-Path $ScriptDir 'web')
}
SubStep 'Copying seanime-web/out -> ./web...'
Copy-Item -Recurse -Force (Join-Path $ScriptDir 'seanime-web\out') (Join-Path $ScriptDir 'web')
if (Test-Path (Join-Path $ScriptDir 'web')) { Success 'Standalone web output ready at ./web' }

# -- 4. Go backend ----------------------------------------

Step '4.1' 'Go backend (Windows)'
SubStep 'Building seanime.exe for Windows...'
go build -trimpath '-ldflags=-s -w' -o seanime.exe .
if ($LASTEXITCODE -ne 0) { Fail 'Go build failed'; exit 1 }
if (Test-Path 'seanime.exe') { Success 'Windows backend built: ./seanime.exe' }

Step '4.2' 'Copy sidecar binary'
$BinariesDir = Join-Path $ScriptDir 'seanime-denshi\binaries'
$SidecarPath = Join-Path $BinariesDir 'seanime-server-windows.exe'
if (-not (Test-Path $BinariesDir)) {
    New-Item -ItemType Directory -Force -Path $BinariesDir | Out-Null
}
SubStep "Copying seanime.exe -> $SidecarPath"
Copy-Item -Force (Join-Path $ScriptDir 'seanime.exe') $SidecarPath
if (Test-Path $SidecarPath) { Success "Sidecar placed at $SidecarPath" }

# -- 5. Electron (electron-builder) build -----------------

Step '5.1' 'Denshi npm dependencies'
Invoke-StepCmd 'npm ci (seanime-denshi)' {
    Push-Location (Join-Path $ScriptDir 'seanime-denshi')
    try {
        SubStep 'Running npm ci...'
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    } finally { Pop-Location }
}
Success 'Denshi dependencies installed'

Step '5.2' 'electron-builder (target: win x64)'
Invoke-StepCmd 'npm run build:win' {
    Push-Location (Join-Path $ScriptDir 'seanime-denshi')
    try {
        SubStep 'Running electron-builder build --win --x64...'
        npm run build:win
        if ($LASTEXITCODE -ne 0) { throw 'electron-builder build failed' }
    } finally { Pop-Location }
}
Success 'Electron desktop build complete'

# -- Done -------------------------------------------------

$EndTime = Get-Date
$Duration = [int]($EndTime - $StartTime).TotalSeconds

$stats = Read-Stats
$newTotal = $stats.total_runs + 1
$newSuccesses = $stats.successes + 1
Write-Stats -TotalRuns $newTotal -Successes $newSuccesses -Duration $Duration

BoxTitle 'Desktop build complete'
Write-Host "$esc[32m$esc[1mAll steps finished successfully.$esc[0m Duration: $esc[1m${Duration}s$esc[0m"
Divider
Write-Host 'Outputs:'
Write-Host "  $esc[1mStandalone:$esc[0m  ./seanime.exe + ./web/"
Write-Host "  $esc[1mSidecar:$esc[0m     seanime-denshi/binaries/seanime-server-windows.exe"
Write-Host "  $esc[1mInstaller:$esc[0m   seanime-denshi/dist/ (NSIS .exe + unpacked)"
Divider
Print-Stats
Divider
