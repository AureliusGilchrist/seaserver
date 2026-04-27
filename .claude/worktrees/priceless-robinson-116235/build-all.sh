#!/usr/bin/env bash
# Build script for Animechanica / seanime
# Frontend: tsgo (type-check) + rsbuild (bundle) → out/
# Backend:  go build with trimpath + stripped symbols
#
# Prerequisites: Go 1.23+, Node.js 18+, npm, jq

set -euo pipefail

export PATH=$PATH:/usr/local/go/bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

STATS_FILE="$SCRIPT_DIR/build-all-stats.json"

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

box_title "Animechanica Build"
print_stats

step "0.1" "Environment check"
substep "Script dir: $SCRIPT_DIR"
substep "Node: $(node -v 2>/dev/null || echo 'not found')"
substep "npm:  $(npm -v 2>/dev/null || echo 'not found')"
substep "Go:   $(go version 2>/dev/null || echo 'not found')"

step "0.2" "Sanity checks"
if ! command -v jq >/dev/null; then
  fail "jq is required for stats. Install jq and rerun."
  exit 1
fi
if [[ ! -d "$SCRIPT_DIR/seanime-web" ]]; then
  fail "Missing directory: seanime-web"
  exit 1
fi

# ── 1. Frontend ──────────────────────────────────────────

step "1.1" "Frontend dependencies"
(
  cd seanime-web
  substep "Running npm ci..."
  npm ci
)
success "Dependencies installed"

step "1.2" "Frontend build (tsgo + rsbuild)"
(
  cd seanime-web
  substep "Type-checking and bundling..."
  npm run build
  substep "Checking build output (./out)..."
  [[ -d out ]] || { fail "Frontend build output missing (expected seanime-web/out/)"; exit 1; }
)
success "Frontend built"

# ── 2. Copy web output ───────────────────────────────────

step "2.1" "Prepare web output"
substep "Removing old ./web..."
rm -rf web
substep "Copying seanime-web/out → ./web..."
cp -r seanime-web/out web
[[ -d web ]] && success "Web output ready at ./web"

# ── 3. Go backend ────────────────────────────────────────

step "3.1" "Go backend build"
substep "Running go build -trimpath -ldflags=\"-s -w\" -o seanime_exe ."
go build -trimpath -ldflags="-s -w" -o seanime_exe .
[[ -x seanime_exe ]] && success "Backend built: ./seanime_exe"

# ── Done ─────────────────────────────────────────────────

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

TOTAL_RUNS=$(( $(read_stat "total_runs") + 1 ))
SUCCESSES=$(( $(read_stat "successes") + 1 ))
write_stats "$TOTAL_RUNS" "$SUCCESSES" "$DURATION"

box_title "Build complete"
printf "${GREEN}${BOLD}All steps finished successfully.${RESET} Duration: ${BOLD}%ss${RESET}\n" "$DURATION"
printf "Run ${BOLD}./seanime_exe${RESET} to start the server.\n"
print_stats
divider
