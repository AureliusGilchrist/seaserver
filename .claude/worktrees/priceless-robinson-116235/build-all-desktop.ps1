#Requires -Version 5.1
<#
.SYNOPSIS
    Desktop build script for seaserver (Tauri + Go sidecar) -- native Windows.
.DESCRIPTION
    Builds:
      - Standalone web server:  seanime.exe + web/
      - Tauri desktop installer: seanime-desktop/src-tauri/target/<triple>/release/bundle/
    Prerequisites: Go 1.23+, Node.js 18+, npm
    Auto-installs: Rust (rustup-init), NSIS, cargo-tauri
#>

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$StatsFile = Join-Path $ScriptDir 'build-all-desktop-stats.json'
$TargetTriple = 'x86_64-pc-windows-msvc'

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

BoxTitle 'seaserver Desktop Build (Windows x86_64 MSVC)'
Print-Stats

# -- 0. Environment checks & auto-install -----------------

Step '0.1' 'Environment check'
SubStep "Script dir: $ScriptDir"
SubStep "Node: $(try { node -v } catch { 'not found' })"
SubStep "npm:  $(try { npm -v } catch { 'not found' })"
SubStep "Go:   $(try { go version } catch { 'not found' })"

Step '0.2' 'Sanity checks'
if (-not (Test-Path (Join-Path $ScriptDir 'seanime-web'))) {
    Fail 'Missing directory: seanime-web'; exit 1
}
if (-not (Test-Path (Join-Path $ScriptDir 'seanime-desktop'))) {
    Fail 'Missing directory: seanime-desktop'; exit 1
}
Success 'Required directories present'

Step '0.3' 'Rust toolchain'
if (-not (Assert-Command 'rustc' 'Rust compiler')) {
    SubStep 'Rust not found -- installing via rustup-init...'
    $rustupInit = Join-Path $env:TEMP 'rustup-init.exe'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $rustupInit -UseBasicParsing
    & $rustupInit -y --default-toolchain stable
    Remove-Item $rustupInit -ErrorAction SilentlyContinue

    # Refresh PATH for current session
    $cargoPath = Join-Path $env:USERPROFILE '.cargo\bin'
    if ($env:PATH -notlike "*$cargoPath*") {
        $env:PATH = "$cargoPath;$env:PATH"
    }

    if (-not (Assert-Command 'rustc' 'Rust compiler')) {
        Fail 'Rust installation failed'; exit 1
    }
    Success "Rust installed: $(rustc --version)"
} else {
    SubStep "Rust: $(rustc --version)"
}

if (-not (Assert-Command 'cargo' 'Cargo')) {
    Fail 'cargo not found even after rustup install'; exit 1
}

Step '0.4' 'Windows MSVC target'
$installedTargets = rustup target list --installed
if ($installedTargets -notcontains $TargetTriple) {
    SubStep "Adding Rust target $TargetTriple..."
    rustup target add $TargetTriple
    if ($LASTEXITCODE -ne 0) { Fail "Failed to add target $TargetTriple"; exit 1 }
    Success 'Target added'
} else {
    SubStep "Target $TargetTriple already installed"
}

Step '0.5' 'NSIS check'
if (-not (Assert-Command 'makensis' 'NSIS')) {
    SubStep 'NSIS not found -- attempting auto-install...'
    $installed = $false

    # Try winget first
    if (Get-Command 'winget' -ErrorAction SilentlyContinue) {
        SubStep 'Trying winget install NSIS.NSIS...'
        winget install --id NSIS.NSIS --accept-source-agreements --accept-package-agreements --silent 2>$null
        # Refresh PATH
        $nsisPath = Join-Path ${env:ProgramFiles(x86)} 'NSIS'
        if (Test-Path $nsisPath) {
            $env:PATH = "$nsisPath;$env:PATH"
        }
        if (Assert-Command 'makensis' 'NSIS') { $installed = $true; Success 'NSIS installed via winget' }
    }

    # Try chocolatey
    if (-not $installed -and (Get-Command 'choco' -ErrorAction SilentlyContinue)) {
        SubStep 'Trying choco install nsis...'
        choco install nsis -y 2>$null
        $nsisPath = Join-Path ${env:ProgramFiles(x86)} 'NSIS'
        if (Test-Path $nsisPath) {
            $env:PATH = "$nsisPath;$env:PATH"
        }
        if (Assert-Command 'makensis' 'NSIS') { $installed = $true; Success 'NSIS installed via chocolatey' }
    }

    if (-not $installed) {
        Warn 'NSIS not available -- Tauri may download it automatically during build'
    }
} else {
    SubStep 'NSIS already available'
}

Step '0.6' 'cargo-tauri CLI'
if (-not (Get-Command 'cargo-tauri' -ErrorAction SilentlyContinue)) {
    SubStep 'Installing tauri-cli...'
    cargo install tauri-cli
    if ($LASTEXITCODE -ne 0) { Fail 'Failed to install tauri-cli'; exit 1 }
    Success 'tauri-cli installed'
} else {
    SubStep 'cargo-tauri already installed'
}

# -- 1. Frontend (desktop build) --------------------------

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

Step '1.2' 'Frontend build (desktop variant)'
Invoke-StepCmd 'npm run build:desktop' {
    Push-Location (Join-Path $ScriptDir 'seanime-web')
    try {
        SubStep 'Type-checking and bundling with desktop env...'
        npm run build:desktop
        if ($LASTEXITCODE -ne 0) { throw 'build:desktop failed' }
        SubStep 'Checking build output (./out)...'
        if (-not (Test-Path 'out')) { throw 'Frontend build output missing (expected seanime-web/out/)' }
    } finally { Pop-Location }
}
Success 'Frontend built (desktop)'

# -- 2. Copy desktop web output ---------------------------

Step '2.1' 'Prepare desktop web output'
SubStep 'Removing old ./web-desktop...'
if (Test-Path (Join-Path $ScriptDir 'web-desktop')) {
    Remove-Item -Recurse -Force (Join-Path $ScriptDir 'web-desktop')
}
SubStep 'Copying seanime-web/out -> ./web-desktop...'
Copy-Item -Recurse -Force (Join-Path $ScriptDir 'seanime-web\out') (Join-Path $ScriptDir 'web-desktop')
if (Test-Path (Join-Path $ScriptDir 'web-desktop')) { Success 'Desktop web output ready at ./web-desktop' }

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
$SidecarName = "seanime-$TargetTriple.exe"
$SidecarPath = Join-Path $ScriptDir "seanime-desktop\src-tauri\binaries\$SidecarName"
SubStep "Copying seanime.exe -> $SidecarPath"
Copy-Item -Force (Join-Path $ScriptDir 'seanime.exe') $SidecarPath
if (Test-Path $SidecarPath) { Success "Sidecar placed at $SidecarPath" }

# -- 5. Desktop (Tauri) build -----------------------------

Step '5.1' 'Desktop npm dependencies'
Invoke-StepCmd 'npm ci (seanime-desktop)' {
    Push-Location (Join-Path $ScriptDir 'seanime-desktop')
    try {
        SubStep 'Running npm ci...'
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    } finally { Pop-Location }
}
Success 'Desktop dependencies installed'

Step '5.2' "Tauri build (target: $TargetTriple)"
Invoke-StepCmd 'cargo tauri build' {
    Push-Location (Join-Path $ScriptDir 'seanime-desktop\src-tauri')
    try {
        SubStep "Running cargo tauri build --target $TargetTriple..."
        cargo tauri build --target $TargetTriple
        if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed' }
    } finally { Pop-Location }
}
Success 'Tauri desktop build complete'

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
Write-Host "  $esc[1mSidecar:$esc[0m     seanime-desktop/src-tauri/binaries/$SidecarName"
Write-Host "  $esc[1mInstaller:$esc[0m   seanime-desktop/src-tauri/target/$TargetTriple/release/bundle/"
Divider
Print-Stats
Divider
