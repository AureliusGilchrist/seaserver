#!/usr/bin/env bash
# Desktop build script for seaserver (Tauri + Go sidecar)
# Targets: Windows x86_64 cross-compiled from Linux
# Also produces the standalone web build (seanime_exe + web/)
#
# Prerequisites: Go 1.23+, Node.js 18+, npm, jq
# Auto-installs: Rust (rustup), mingw-w64, nsis, cargo-tauri

set -euo pipefail

export PATH=$PATH:/usr/local/go/bin:$HOME/.cargo/bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

STATS_FILE="$SCRIPT_DIR/build-all-stats.json"
TARGET_TRIPLE="x86_64-pc-windows-gnu"

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
if [[ ! -d "$SCRIPT_DIR/seanime-desktop" ]]; then
  fail "Missing directory: seanime-desktop"
  exit 1
fi

step "0.3" "Rust toolchain"
if ! type rustc &>/dev/null; then
  substep "Rust not found — installing via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  export PATH="$HOME/.cargo/bin:$PATH"
  success "Rust installed: $(rustc --version)"
else
  substep "Rust: $(rustc --version)"
fi

if ! type cargo &>/dev/null; then
  fail "cargo not found even after rustup install"
  exit 1
fi

step "0.4" "Windows cross-compile target"
if ! rustup target list --installed | grep -q "$TARGET_TRIPLE"; then
  substep "Adding Rust target $TARGET_TRIPLE..."
  rustup target add "$TARGET_TRIPLE"
  success "Target added"
else
  substep "Target $TARGET_TRIPLE already installed"
fi

step "0.5" "System dependencies (mingw-w64, nsis)"
NEED_INSTALL=()
if ! type x86_64-w64-mingw32-gcc &>/dev/null; then
  NEED_INSTALL+=("mingw64-gcc")
fi
if ! type makensis &>/dev/null; then
  NEED_INSTALL+=("nsis")
fi
if [[ ${#NEED_INSTALL[@]} -gt 0 ]]; then
  substep "Installing: ${NEED_INSTALL[*]}..."
  sudo dnf install -y "${NEED_INSTALL[@]}"
  success "System deps installed"
else
  substep "mingw-w64 and nsis already available"
fi

step "0.6" "cargo-tauri CLI"
if ! type cargo-tauri &>/dev/null; then
  substep "Installing tauri-cli..."
  cargo install tauri-cli
  success "tauri-cli installed"
else
  substep "cargo-tauri already installed"
fi

# ── 1. Frontend (desktop build) ──────────────────────────

step "1.1" "Frontend dependencies"
(
  cd seanime-web
  substep "Running npm ci..."
  npm ci
)
success "Dependencies installed"

step "1.2" "Frontend build (desktop variant)"
(
  cd seanime-web
  substep "Type-checking and bundling with desktop env..."
  npm run build:desktop
  substep "Checking build output (./out)..."
  [[ -d out ]] || { fail "Frontend build output missing (expected seanime-web/out/)"; exit 1; }
)
success "Frontend built (desktop)"

# ── 2. Copy web output ───────────────────────────────────

step "2.1" "Prepare desktop web output"
substep "Removing old ./web-desktop..."
rm -rf web-desktop
substep "Copying seanime-web/out → ./web-desktop..."
cp -r seanime-web/out web-desktop
[[ -d web-desktop ]] && success "Desktop web output ready at ./web-desktop"

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
SIDECAR_NAME="seanime-${TARGET_TRIPLE}.exe"
SIDECAR_PATH="seanime-desktop/src-tauri/binaries/$SIDECAR_NAME"
substep "Copying seanime.exe → $SIDECAR_PATH"
cp seanime.exe "$SIDECAR_PATH"
success "Sidecar placed at $SIDECAR_PATH"

# ── 5. Desktop (Tauri) build ─────────────────────────────

step "5.1" "Desktop npm dependencies"
(
  cd seanime-desktop
  substep "Running npm ci..."
  npm ci
)
success "Desktop dependencies installed"

step "5.2" "Tauri build (target: $TARGET_TRIPLE)"
(
  cd seanime-desktop/src-tauri
  substep "Running cargo tauri build --target $TARGET_TRIPLE..."
  cargo tauri build --target "$TARGET_TRIPLE"
)
success "Tauri desktop build complete"

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
printf "  ${BOLD}Sidecar:${RESET}     %s\n" "$SIDECAR_PATH"
printf "  ${BOLD}Installer:${RESET}   seanime-desktop/src-tauri/target/%s/release/bundle/\n" "$TARGET_TRIPLE"
divider
print_stats
divider
