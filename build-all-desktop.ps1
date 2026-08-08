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
.PARAMETER Launch
    Start the freshly packaged app (dist\win-unpacked) when the build succeeds.
.PARAMETER Install
    Run the freshly built NSIS installer to update the installed copy of Denshi.

    THE TRAP THIS EXISTS FOR: a packaged Denshi carries its own copy of both halves of the
    app -- resources\binaries\seanime-server-windows.exe and the web-denshi bundle -- so an
    installed copy keeps serving the build it was installed from. Building does not touch it.
    Testing in a browser hits the standalone seanime.exe instead, which the build *does*
    refresh, so the two disagree and the desktop app looks broken in ways the browser never
    reproduces. Nothing about it looks like a stale build, because the build succeeded.
.EXAMPLE
    .\build-all-desktop.ps1 -ForceInstall
.EXAMPLE
    .\build-all-desktop.ps1 -Launch
.EXAMPLE
    .\build-all-desktop.ps1 -Install
#>

param(
    [switch]$ForceInstall,
    [switch]$Launch,
    [switch]$Install
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

# -- Installed-copy helpers --------------------------------

# Version electron-builder is packaging, read from the same package.json it builds from.
function Get-BuiltVersion {
    $pkg = Join-Path $DenshiDir 'package.json'
    if (-not (Test-Path $pkg)) { return '' }
    try { return (Get-Content -Path $pkg -Raw | ConvertFrom-Json).version } catch { return '' }
}

# The installed Denshi, or $null. Matched on DisplayName rather than a registry key name so it
# keeps working regardless of how electron-builder names the uninstall entry.
function Get-InstalledDenshi {
    $roots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($r in $roots) {
        try {
            $hit = Get-ItemProperty $r -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -eq 'Seaserver Denshi' } |
                Select-Object -First 1
            if ($hit) { return $hit }
        } catch { }
    }
    return $null
}

# The installer this run produced.
function Get-BuiltInstallerPath {
    $version = Get-BuiltVersion
    if (-not $version) { return '' }
    $path = Join-Path $DenshiDir ("dist\seanime-denshi-{0}_Windows_x64.exe" -f $version)
    if (Test-Path $path) { return $path }
    return ''
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

Invoke-BuildStep '5.2' 'Release locks on previous build output' -Dir $DenshiDir {
    # electron-builder runs rcedit to stamp the icon and version strings into the packaged
    # exe, rewriting its resources in place. That write fails with
    #   Fatal error: Unable to commit changes
    # whenever something still holds a handle on the file - most often a Seaserver Denshi
    # left running from a previous session, or a scanner that grabbed the exe moments after
    # the asar integrity step wrote it. electron-builder retries and usually wins the race,
    # but clearing the two common causes up front keeps the build quiet and deterministic.
    foreach ($procName in @('Seaserver Denshi', 'seanime-server-windows', 'seanime')) {
        $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            Write-Host "  Stopping running process: $($p.Name) (pid $($p.Id))"
            try { $p.Kill(); $p.WaitForExit(5000) } catch { }
        }
    }

    $unpacked = Join-Path $DenshiDir 'dist\win-unpacked'
    if (Test-Path $unpacked) {
        Write-Host '  Removing previous dist\win-unpacked'
        try { Remove-Item -Recurse -Force $unpacked -ErrorAction Stop } catch {
            Write-Host "  Could not fully remove it ($($_.Exception.Message)); electron-builder will overwrite in place"
        }
    }
}

Invoke-BuildStep '5.3' 'electron-builder (target: win x64)' -Dir $DenshiDir {
    Invoke-Npm @('run', 'build:win')
}

# The packaged app embeds its own server, so "the build succeeded" is not the same as "the app
# contains what was just built". Step 5.2 may have failed to remove win-unpacked and said so
# without failing, leaving electron-builder to overwrite in place -- which is exactly how a
# package ends up carrying a server binary from an earlier run. Compare them and refuse to
# report success on a stale package.
Invoke-BuildStep '5.4' 'Verify packaged sidecar matches this build' {
    $built    = Join-Path $ScriptDir 'seanime.exe'
    $packaged = Join-Path $DenshiDir 'dist\win-unpacked\resources\binaries\seanime-server-windows.exe'

    if (-not (Test-Path $packaged)) { throw "Packaged sidecar missing: $packaged" }

    $builtHash    = (Get-FileHash -Algorithm SHA256 -Path $built).Hash
    $packagedHash = (Get-FileHash -Algorithm SHA256 -Path $packaged).Hash

    if ($builtHash -ne $packagedHash) {
        Fail 'The packaged app contains a different server binary than this build produced.'
        SubStep "built:    $builtHash"
        SubStep "packaged: $packagedHash"
        throw 'Packaged sidecar does not match seanime.exe -- the app would run an older server'
    }
    SubStep "Packaged sidecar matches seanime.exe ($($builtHash.Substring(0,12))...)"
}

# -- 4. Installed copy -------------------------------------

# Building leaves an installed Denshi untouched. Reconcile the two, or at minimum say plainly
# that they differ, so a build is never mistaken for a deployed build.
$builtVersion = Get-BuiltVersion
$installer    = Get-BuiltInstallerPath
$installed    = Get-InstalledDenshi

if ($Install) {
    Invoke-BuildStep '6.1' 'Update the installed copy' {
        if (-not $installer) { throw 'Built installer not found in seanime-denshi\dist' }
        SubStep "Running $installer (silent, per-machine -- expect an elevation prompt)"
        # perMachine installs write outside the user profile, so this needs elevation. /S is the
        # NSIS silent switch; the assisted installer honours it.
        $p = Start-Process -FilePath $installer -ArgumentList '/S' -Verb RunAs -Wait -PassThru
        if ($p.ExitCode -ne 0) { throw "Installer exited with code $($p.ExitCode)" }
        SubStep 'Installed copy updated'
    }
    $installed = Get-InstalledDenshi
}

# -- Done --------------------------------------------------

$Duration = [int]((Get-Date) - $StartTime).TotalSeconds
Write-Stats -TotalRuns $runNumber -Successes ($stats.successes + 1) -Duration $Duration

BoxTitle 'Desktop build complete'
Write-Host "$esc[32m$esc[1mAll steps finished successfully.$esc[0m Duration: $esc[1m${Duration}s$esc[0m"
Divider
Write-Host 'Outputs:'
Write-Host "  $esc[1mStandalone:$esc[0m  ./seanime.exe + ./web/  $esc[2m(what a browser talks to)$esc[0m"
Write-Host "  $esc[1mSidecar:$esc[0m     seanime-denshi/binaries/seanime-server-windows.exe"
Write-Host "  $esc[1mFresh app:$esc[0m   seanime-denshi/dist/win-unpacked/Seaserver Denshi.exe"
Write-Host "  $esc[1mInstaller:$esc[0m   seanime-denshi/dist/ (NSIS .exe)"
Divider

# The whole point of this block: a successful build says nothing about what Denshi will run.
if ($installed) {
    $installedVersion = $installed.DisplayVersion
    if ($installedVersion -eq $builtVersion) {
        Success "Installed Denshi is $installedVersion, matching this build"
    } else {
        Warn "Installed Denshi is $installedVersion but this build is $builtVersion."
        Write-Host '  An installed Denshi bundles its own server and frontend, so it will keep'
        Write-Host '  running the build it was installed from. Browser testing hits the standalone'
        Write-Host '  server instead, which is why the two can disagree.'
        Write-Host "  Update it:  $esc[1m.\build-all-desktop.ps1 -Install$esc[0m"
        Write-Host "  Or run this build without installing:  $esc[1m.\build-all-desktop.ps1 -Launch$esc[0m"
    }
} else {
    SubStep 'No installed Denshi found -- run the installer, or use -Launch to run this build directly.'
}

# Two servers on one database is its own class of confusion: each process keeps its own caches,
# so they disagree about state that is otherwise shared. Worth naming while the build is fresh.
$standalone = Get-Process -Name 'seanime' -ErrorAction SilentlyContinue
if ($standalone) {
    Warn 'A standalone seanime.exe is running.'
    Write-Host '  Denshi starts its own server, so launching it now means two servers against the'
    Write-Host '  same database, each with its own in-memory caches. Stop one before testing.'
}

Divider
Print-Stats
Divider

if ($Launch) {
    $app = Join-Path $DenshiDir 'dist\win-unpacked\Seaserver Denshi.exe'
    if (Test-Path $app) {
        SubStep "Launching $app"
        Start-Process -FilePath $app
    } else {
        Warn "Cannot launch -- not found: $app"
    }
}
