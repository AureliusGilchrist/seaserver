#!/usr/bin/env bash
# Desktop build script for seaserver (Electron/denshi + Go sidecar)
# Targets: Windows x86_64 cross-compiled from Linux
# Also produces the standalone web build (seanime_exe + web/)
#
# Prerequisites: Go 1.23+, Node.js 18+, npm, jq
# NSIS is bundled by electron-builder; nothing to install manually.
#
# This mirrors build-all-desktop.ps1. The desktop app is Electron
# (seanime-denshi) — the old Tauri path (seanime-desktop/src-tauri) is gone.

set -euo pipefail

export PATH=$PATH:/usr/local/go/bin:$HOME/.cargo/bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

STATS_FILE="$SCRIPT_DIR/build-all-stats.json"
DENSHI_DIR="$SCRIPT_DIR/seanime-denshi"

# Colors
BOLD="\033[1m"; DIM="\033[2m"; RESET="\033[0m"
RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"; BLUE="\033[34m"; MAGENTA="\033[35m"; CYAN="\033[36m"

divider() { printf "${DIM}%s${RESET}\n" "────────────────────────────────────────────"; }
box_title() { divider; printf "${BOLD}${1}${RESET}\n"; divider; }
step() { printf "${BLUE}${BOLD}[%s]${RESET} %s\n" "$1" "$2"; }
substep() { printf "${CYAN}  •${RESET} %s\n" "$1"; }
success() { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}!${RESET} %s\n" "$1"; }
fail() { printf "${RED}✕${RESET} %s\n" "$1"; }

# Stats helpers
init_stats() {
  if [[ ! -f "$STATS_FILE" ]]; then
    printf '{"total_runs":0,"successes":0,"last_duration_secs":0}\n' > "$STATS_FILE"
  fi
}
read_stat() { jq -r ".$1" "$STATS_FILE"; }
write_stats() { jq \
  --argjson total "$1" \
  --argjson success "$2" \
  --argjson duration "$3" \
  '.total_runs=$total | .successes=$success | .last_duration_secs=$duration' \
  "$STATS_FILE" > "$STATS_FILE.tmp" && mv "$STATS_FILE.tmp" "$STATS_FILE"; }
print_stats() {
  local total success duration
  total=$(read_stat "total_runs")
  success=$(read_stat "successes")
  duration=$(read_stat "last_duration_secs")
  printf "${MAGENTA}Stats:${RESET} total runs: ${BOLD}%s${RESET} | successes: ${BOLD}%s${RESET} | last duration: ${BOLD}%ss${RESET}\n" "$total" "$success" "$duration"
}

# Preflight
init_stats
START_TIME=$(date +%s)

box_title "seaserver Desktop Build (Windows x86_64)"
print_stats

# ── 0. Environment checks & auto-install ─────────────────

step "0.1" "Environment check"
substep "Script dir: $SCRIPT_DIR"
substep "Node: $(node -v 2>/dev/null || echo 'not found')"
substep "npm:  $(npm -v 2>/dev/null || echo 'not found')"
substep "Go:   $(go version 2>/dev/null || echo 'not found')"

step "0.2" "Sanity checks"
if ! type jq &>/dev/null; then
  fail "jq is required for stats. Install jq and rerun."
  exit 1
fi
if [[ ! -d "$SCRIPT_DIR/seanime-web" ]]; then
  fail "Missing directory: seanime-web"
  exit 1
fi
if [[ ! -d "$DENSHI_DIR" ]]; then
  fail "Missing directory: seanime-denshi"
  exit 1
fi

# No Rust, mingw-w64, NSIS or tauri-cli steps here any more: the desktop app is
# Electron. electron-builder ships its own NSIS, and the Go sidecar is built
# with CGO_ENABLED=0, so there is no cross-compiler to install either.

# ── 1. Frontend (desktop build) ──────────────────────────

step "1.1" "Frontend dependencies"
(
  cd seanime-web
  substep "Running npm ci..."
  npm ci
)
success "Dependencies installed"

step "1.2" "Frontend build (Electron/denshi variant)"
(
  cd seanime-web
  substep "Type-checking and bundling with denshi env..."
  npm run build:denshi
  substep "Checking build output (./out-denshi)..."
  [[ -d out-denshi ]] || { fail "Frontend build output missing (expected seanime-web/out-denshi/)"; exit 1; }
)
success "Frontend built (denshi)"

# ── 2. Copy web output ───────────────────────────────────

step "2.1" "Prepare denshi web output"
substep "Removing old seanime-denshi/web-denshi..."
rm -rf "$DENSHI_DIR/web-denshi"
substep "Copying seanime-web/out-denshi → seanime-denshi/web-denshi..."
cp -r seanime-web/out-denshi "$DENSHI_DIR/web-denshi"
[[ -d "$DENSHI_DIR/web-denshi" ]] && success "Denshi web output ready at seanime-denshi/web-denshi"

# ── 3. Also build standalone web output ──────────────────

step "3.1" "Frontend build (web/standalone variant)"
(
  cd seanime-web
  substep "Building web variant..."
  npm run build
  [[ -d out ]] || { fail "Frontend web build output missing"; exit 1; }
)
success "Frontend built (web)"

step "3.2" "Prepare standalone web output"
substep "Removing old ./web..."
rm -rf web
substep "Copying seanime-web/out → ./web..."
cp -r seanime-web/out web
[[ -d web ]] && success "Standalone web output ready at ./web"

# ── 4. Go backend ────────────────────────────────────────

step "4.1" "Go backend (Linux standalone)"
substep "Building seanime_exe for Linux..."
go build -trimpath -ldflags="-s -w" -o seanime_exe .
[[ -x seanime_exe ]] && success "Linux backend built: ./seanime_exe"

step "4.2" "Go backend (Windows sidecar)"
substep "Cross-compiling for Windows (CGO_ENABLED=0)..."
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o seanime.exe .
[[ -f seanime.exe ]] && success "Windows backend built: ./seanime.exe"

step "4.3" "Copy sidecar binary"
SIDECAR_PATH="$DENSHI_DIR/binaries/seanime-server-windows.exe"
substep "Copying seanime.exe → $SIDECAR_PATH"
# git does not track empty directories, so binaries/ is absent on a fresh
# clone and cp will not create the parent.
mkdir -p "$(dirname "$SIDECAR_PATH")"
cp seanime.exe "$SIDECAR_PATH"
success "Sidecar placed at $SIDECAR_PATH"

# ── 5. Desktop (Electron) build ──────────────────────────

step "5.1" "Denshi npm dependencies"
(
  cd "$DENSHI_DIR"
  substep "Running npm ci..."
  npm ci
)
success "Denshi dependencies installed"

step "5.2" "Release locks on previous build output"
# electron-builder runs rcedit to stamp icon and version strings into the
# packaged exe, rewriting resources in place. That fails with "Unable to commit
# changes" if anything still holds the file — usually a previous build's app
# left running. Clearing it up front keeps the build deterministic.
for proc in "Seaserver Denshi" seanime-server-windows seanime; do
  if pgrep -f "$proc" >/dev/null 2>&1; then
    substep "Stopping running process: $proc"
    pkill -f "$proc" 2>/dev/null || true
  fi
done
if [[ -d "$DENSHI_DIR/dist/win-unpacked" ]]; then
  substep "Removing previous dist/win-unpacked"
  rm -rf "$DENSHI_DIR/dist/win-unpacked" 2>/dev/null \
    || warn "Could not fully remove it; electron-builder will overwrite in place"
fi

step "5.3" "electron-builder (target: win x64)"
(
  cd "$DENSHI_DIR"
  substep "Running npm run build:win..."
  npm run build:win
)
success "Electron desktop build complete"

# ── Done ─────────────────────────────────────────────────

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

TOTAL_RUNS=$(( $(read_stat "total_runs") + 1 ))
SUCCESSES=$(( $(read_stat "successes") + 1 ))
write_stats "$TOTAL_RUNS" "$SUCCESSES" "$DURATION"

box_title "Desktop build complete"
printf "${GREEN}${BOLD}All steps finished successfully.${RESET} Duration: ${BOLD}%ss${RESET}\n" "$DURATION"
divider
printf "Outputs:\n"
printf "  ${BOLD}Standalone:${RESET}  ./seanime_exe + ./web/\n"
printf "  ${BOLD}Sidecar:${RESET}     seanime-denshi/binaries/seanime-server-windows.exe\n"
printf "  ${BOLD}Installer:${RESET}   seanime-denshi/dist/ (NSIS .exe + unpacked)\n"
divider
print_stats
divider
