#Requires -Version 5.1
<#
.SYNOPSIS
    Desktop build script for Seaserver (Electron + Go sidecar) -- native Windows.
.DESCRIPTION
    Builds:
      - Standalone web server:  seanime.exe + web/
      - Electron desktop installer: seanime-denshi/dist/seanime-denshi-<version>_Windows_x64.exe
    Prerequisites: Go 1.23+, Node.js 18+, npm
    NSIS is bundled by electron-builder; no manual install needed.

    npm ci is skipped when package-lock.json is unchanged since the last successful
    install (hash marker stored in node_modules/.lockfile-hash).
.PARAMETER ForceInstall
    Run npm ci in both package directories even if package-lock.json is unchanged.
.EXAMPLE
    .\build-all-desktop.ps1 -ForceInstall
#>

param(
    [switch]$ForceInstall
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$StatsFile  = Join-Path $ScriptDir 'build-all-desktop-stats.json'
$WebDir     = Join-Path $ScriptDir 'seanime-web'
$DenshiDir  = Join-Path $ScriptDir 'seanime-denshi'

# -- Output helpers ----------------------------------------

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

# -- Step / command helpers --------------------------------

# Runs a numbered build step (optionally inside a directory), reports success with elapsed time.
function Invoke-BuildStep {
    param(
        [string]$Number,
        [string]$Title,
        [scriptblock]$Body,
        [string]$Dir
    )
    Step $Number $Title
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    if ($Dir) { Push-Location $Dir }
    try {
        & $Body
    } catch {
        Fail "Failed: $Title"
        throw
    } finally {
        if ($Dir) { Pop-Location }
    }
    $sw.Stop()
    Success "$Title ($([int]$sw.Elapsed.TotalSeconds)s)"
}

# Runs npm with the given args in the current directory, throwing on a non-zero exit code.
function Invoke-Npm {
    param([string[]]$Arguments)
    SubStep "Running npm $($Arguments -join ' ')..."
    npm @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm $($Arguments -join ' ') failed" }
}

# npm ci in the current directory, skipped when package-lock.json is unchanged since the
# last successful install (hash marker written into node_modules).
# Pass -ForceInstall to the script to reinstall regardless.
function Install-NpmDependencies {
    $lockFile = 'package-lock.json'
    $marker   = 'node_modules\.lockfile-hash'

    $hash = ''
    if (Test-Path $lockFile) { $hash = (Get-FileHash -Algorithm SHA256 -Path $lockFile).Hash }

    if ($ForceInstall) {
        SubStep '-ForceInstall set -- running npm ci regardless of lockfile state'
    } elseif ($hash -and (Test-Path $marker) -and ((Get-Content $marker -Raw).Trim() -eq $hash)) {
        SubStep 'package-lock.json unchanged since last install -- skipping npm ci (use -ForceInstall to override)'
        return
    }

    Invoke-Npm @('ci')
    if ($hash) { Set-Content -Path $marker -Value $hash -Encoding ASCII }
}

# Replaces $Destination with a fresh copy of $Source, verifying both ends.
function Copy-CleanDir {
    param([string]$Source, [string]$Destination, [string]$Label)
    if (-not (Test-Path $Source)) { throw "Missing build output: $Source" }
    SubStep "Refreshing $Label ($Source -> $Destination)..."
    if (Test-Path $Destination) { Remove-Item -Recurse -Force $Destination }
    Copy-Item -Recurse -Force $Source $Destination
    if (-not (Test-Path $Destination)) { throw "Copy failed: $Destination" }
    SubStep "$Label ready at $Destination"
}

function Assert-Command {
    param([string]$Name, [string]$FriendlyName)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail "$FriendlyName ($Name) not found."
        return $false
    }
    return $true
}

# -- Stats helpers -----------------------------------------

function Read-Stats {
    if (Test-Path $StatsFile) {
        try { return Get-Content -Path $StatsFile -Raw | ConvertFrom-Json } catch {}
    }
    return [pscustomobject]@{ total_runs = 0; successes = 0; last_duration_secs = 0 }
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

# -- Preflight ---------------------------------------------

$StartTime = Get-Date

BoxTitle 'Seaserver Denshi Build (Windows)'
Print-Stats

# Count this run up front so failed runs show up in the stats too
$stats = Read-Stats
$runNumber = $stats.total_runs + 1
Write-Stats -TotalRuns $runNumber -Successes $stats.successes -Duration $stats.last_duration_secs

Step '0.1' 'Environment check'
SubStep "Script dir: $ScriptDir"
SubStep "Node: $(try { node -v } catch { 'not found' })"
SubStep "npm:  $(try { npm -v } catch { 'not found' })"
SubStep "Go:   $(try { go version } catch { 'not found' })"

Step '0.2' 'Sanity checks'
foreach ($dir in @($WebDir, $DenshiDir)) {
    if (-not (Test-Path $dir)) { Fail "Missing directory: $(Split-Path -Leaf $dir)"; exit 1 }
}
foreach ($tool in @(@('node', 'Node.js'), @('npm', 'npm'), @('go', 'Go'))) {
    if (-not (Assert-Command $tool[0] $tool[1])) { exit 1 }
}
Success 'Required directories and tools present'

# -- 1. Frontend -------------------------------------------

Invoke-BuildStep '1.1' 'Frontend dependencies (seanime-web)' -Dir $WebDir {
    Install-NpmDependencies
}

Invoke-BuildStep '1.2' 'Frontend build (Electron/denshi variant)' -Dir $WebDir {
    Invoke-Npm @('run', 'build:denshi')
    if (-not (Test-Path 'out-denshi')) { throw 'Frontend build output missing (expected seanime-web/out-denshi/)' }
}

Invoke-BuildStep '2.1' 'Prepare denshi web output' {
    Copy-CleanDir (Join-Path $WebDir 'out-denshi') (Join-Path $DenshiDir 'web-denshi') 'denshi web output'
}

Invoke-BuildStep '3.1' 'Frontend build (web/standalone variant)' -Dir $WebDir {
    Invoke-Npm @('run', 'build')
    if (-not (Test-Path 'out')) { throw 'Frontend web build output missing (expected seanime-web/out/)' }
}

Invoke-BuildStep '3.2' 'Prepare standalone web output' {
    Copy-CleanDir (Join-Path $WebDir 'out') (Join-Path $ScriptDir 'web') 'standalone web output'
}

# -- 2. Go backend -----------------------------------------

Invoke-BuildStep '4.1' 'Go backend (Windows)' {
    SubStep 'go build -trimpath -ldflags="-s -w" -o seanime.exe .'
    go build -trimpath '-ldflags=-s -w' -o seanime.exe .
    if ($LASTEXITCODE -ne 0) { throw 'go build failed' }
    if (-not (Test-Path 'seanime.exe')) { throw 'seanime.exe missing after build' }
    SubStep 'Windows backend built: ./seanime.exe'
}

Invoke-BuildStep '4.2' 'Copy sidecar binary' {
    $binariesDir = Join-Path $DenshiDir 'binaries'
    $sidecarPath = Join-Path $binariesDir 'seanime-server-windows.exe'
    New-Item -ItemType Directory -Force -Path $binariesDir | Out-Null
    SubStep "Copying seanime.exe -> $sidecarPath"
    Copy-Item -Force (Join-Path $ScriptDir 'seanime.exe') $sidecarPath
    if (-not (Test-Path $sidecarPath)) { throw 'Sidecar copy failed' }
    SubStep "Sidecar placed at $sidecarPath"
}

# -- 3. Electron (electron-builder) build ------------------

Invoke-BuildStep '5.1' 'Denshi npm dependencies (seanime-denshi)' -Dir $DenshiDir {
    Install-NpmDependencies
}

Invoke-BuildStep '5.2' 'electron-builder (target: win x64)' -Dir $DenshiDir {
    Invoke-Npm @('run', 'build:win')
}

# -- Done --------------------------------------------------

$Duration = [int]((Get-Date) - $StartTime).TotalSeconds
Write-Stats -TotalRuns $runNumber -Successes ($stats.successes + 1) -Duration $Duration

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
