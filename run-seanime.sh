#!/usr/bin/env bash
# run-seanime.sh — keeps the server running and records every crash.
#
#   ./run-seanime.sh [server flags...]     (use this instead of ./seanime_exe)
#
# Every start — the first one and every restart after a crash — runs ./build-all.sh first, so the
# server always runs what is in the checkout. (build-all.sh skips the frontend when it is unchanged,
# so this is mostly the Go build.) If the build fails, the failure is logged and the previous
# ./seanime_exe is started instead; with no binary at all it retries the build after a delay.
#
# When the server dies on its own (a Go panic, a fatal error, killed by the OOM killer), a crash
# report is written and the server is started again. A clean exit (status 0: Ctrl+C, SIGTERM, a
# shutdown from the app) stops the restarter too. Self-updates on Linux replace the process in place
# (same PID), so they are not seen as crashes.
#
# Crash reports go to ONE place:
#
#   $HOME/.config/Seanime/crashes/                 (override with SEANIME_CRASH_DIR)
#     crashes.log                                  one line per crash: time, exit status, version, uptime, report file
#     crash-YYYYMMDD-HHMMSS.log                    full report: status, the panic / stderr output,
#                                                  and the tail of the server's own log file
#     last-build.log                               output of the most recent build
#     build-failed-YYYYMMDD-HHMMSS.log             output of a build that failed (also listed in crashes.log)
#
# The newest 100 reports are kept. Other settings (environment variables):
#   SEANIME_EXE           server binary            (default: ./seanime_exe next to this script)
#   SEANIME_LOG_DIR       server's log folder      (default: $HOME/.config/Seanime/logs)
#   SEANIME_BUILD_SCRIPT  build run before each start (default: ./build-all.sh next to this script)
#   SEANIME_SKIP_BUILD=1  start without building
#   SEANIME_RESTART_DELAY seconds before restart   (default: 5; 60 after 5 crashes within 10 minutes)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXE="${SEANIME_EXE:-$SCRIPT_DIR/seanime_exe}"
CRASH_DIR="${SEANIME_CRASH_DIR:-$HOME/.config/Seanime/crashes}"
LOG_DIR="${SEANIME_LOG_DIR:-$HOME/.config/Seanime/logs}"
DELAY="${SEANIME_RESTART_DELAY:-5}"
BUILD_SCRIPT="${SEANIME_BUILD_SCRIPT:-$SCRIPT_DIR/build-all.sh}"
SKIP_BUILD="${SEANIME_SKIP_BUILD:-0}"
KEEP_REPORTS=100
STDERR_TAIL_LINES=3000
LOG_TAIL_LINES=300

mkdir -p "$CRASH_DIR" || { echo "run-seanime: cannot create $CRASH_DIR" >&2; exit 1; }
STDERR_FILE="$CRASH_DIR/.current-stderr"

note() { printf '[run-seanime %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }

version() {
	sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/versions.json" 2>/dev/null | head -n1
}

describe_status() {
	local code=$1
	if (( code > 128 )); then
		local sig
		sig=$(kill -l $((code - 128)) 2>/dev/null || echo "?")
		echo "killed by signal SIG$sig (exit $code)"
	elif (( code == 2 )) && grep -q '^panic: \|^fatal error: ' "$STDERR_FILE" 2>/dev/null; then
		echo "Go panic (exit 2)"
	else
		echo "exit $code"
	fi
}

stopping=0
child=0
on_signal() {
	stopping=1
	note "stop requested — stopping the server"
	(( child > 0 )) && kill -TERM "$child" 2>/dev/null
}
trap on_signal INT TERM HUP

crash_times=()

# Runs the build, showing its output and keeping it in last-build.log. Returns the build's status.
build() {
	local log="$CRASH_DIR/last-build.log"
	note "building with $BUILD_SCRIPT"
	local started=$(date +%s)
	bash "$BUILD_SCRIPT" > >(tee "$log") 2>&1 &
	child=$!
	local code
	while :; do
		wait "$child"; code=$?
		kill -0 "$child" 2>/dev/null || break
	done
	child=0
	sleep 0.2
	(( stopping )) && return "$code"
	if (( code == 0 )); then
		note "build finished in $(( $(date +%s) - started ))s"
		return 0
	fi
	local stamp=$(date '+%Y%m%d-%H%M%S')
	cp "$log" "$CRASH_DIR/build-failed-$stamp.log"
	printf '%s	build failed (exit %s)	version=%s	-	%s	%s
' 		"$(date '+%Y-%m-%d %H:%M:%S')" "$code" "$(version)" "build-failed-$stamp.log" 		"$(grep -v '^[[:space:]]*$' "$log" | tail -n1 | cut -c1-200)" >> "$CRASH_DIR/crashes.log"
	ls -t "$CRASH_DIR"/build-failed-*.log 2>/dev/null | tail -n +$((KEEP_REPORTS + 1)) | while IFS= read -r old; do rm -f -- "$old"; done
	note "build FAILED (exit $code) — log: $CRASH_DIR/build-failed-$stamp.log"
	return "$code"
}

# Sleeps, but wakes up for a stop request. Exits the script if one came in.
pause() {
	sleep "$1" &
	wait $! 2>/dev/null
	if (( stopping )); then
		note "stop requested — not restarting"
		exit 0
	fi
}

while :; do
	if [[ "$SKIP_BUILD" != "1" ]]; then
		build
		build_code=$?
		if (( stopping )); then
			note "stop requested during the build — not starting"
			exit 0
		fi
		if (( build_code != 0 )); then
			if [[ -x "$EXE" ]]; then
				note "starting the previous build of $EXE instead"
			else
				note "no server binary to fall back on — retrying the build in 60s"
				pause 60
				continue
			fi
		fi
	fi

	if [[ ! -x "$EXE" ]]; then
		note "server binary not found or not executable: $EXE"
		exit 1
	fi

	: > "$STDERR_FILE"
	started=$(date +%s)
	ver=$(version)
	note "starting $EXE ${*:-} (version ${ver:-unknown})"

	# stdout (the normal logs) passes straight through; stderr is shown and also kept for the report.
	"$EXE" "$@" 2> >(tee -a "$STDERR_FILE" >&2) &
	child=$!
	# `wait` returns early when a trapped signal arrives; keep waiting until the server is really gone.
	while :; do
		wait "$child"; code=$?
		kill -0 "$child" 2>/dev/null || break
	done
	child=0
	sleep 0.2 # let tee flush the last of stderr

	if (( stopping )); then
		note "server stopped (exit $code)"
		exit 0
	fi
	if (( code == 0 )); then
		note "server exited cleanly — not restarting"
		exit 0
	fi

	now=$(date +%s)
	uptime=$((now - started))
	status=$(describe_status "$code")
	stamp=$(date '+%Y%m%d-%H%M%S')
	report="$CRASH_DIR/crash-$stamp.log"

	{
		echo "Seanime crash report"
		echo "time:     $(date '+%Y-%m-%d %H:%M:%S %z')"
		echo "status:   $status"
		echo "version:  ${ver:-unknown}"
		echo "uptime:   ${uptime}s"
		echo "binary:   $EXE"
		echo "args:     ${*:-}"
		echo "host:     $(hostname 2>/dev/null)"
		echo
		echo "===== server stderr (panic / fatal output), last $STDERR_TAIL_LINES lines ====="
		tail -n "$STDERR_TAIL_LINES" "$STDERR_FILE" 2>/dev/null
		latest_log=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -n1)
		if [[ -n "$latest_log" ]]; then
			echo
			echo "===== last $LOG_TAIL_LINES lines of $latest_log ====="
			tail -n "$LOG_TAIL_LINES" "$latest_log"
		fi
	} > "$report" 2>&1

	first_line=$(grep -m1 '^panic: \|^fatal error: ' "$STDERR_FILE" 2>/dev/null | cut -c1-200)
	printf '%s\t%s\tversion=%s\tuptime=%ss\t%s\t%s\n' \
		"$(date '+%Y-%m-%d %H:%M:%S')" "$status" "${ver:-unknown}" "$uptime" "$(basename "$report")" "${first_line:-}" \
		>> "$CRASH_DIR/crashes.log"
	note "server crashed: $status — report: $report"

	# Keep only the newest reports.
	ls -t "$CRASH_DIR"/crash-*.log 2>/dev/null | tail -n +$((KEEP_REPORTS + 1)) | while IFS= read -r old; do rm -f -- "$old"; done

	# Crash loop: 5 crashes within 10 minutes → wait a minute between restarts instead.
	recent=()
	for t in "${crash_times[@]+"${crash_times[@]}"}" "$now"; do
		(( now - t < 600 )) && recent+=("$t")
	done
	crash_times=("${recent[@]}")
	wait_for=$DELAY
	if (( ${#crash_times[@]} >= 5 )); then
		wait_for=60
		note "${#crash_times[@]} crashes in the last 10 minutes — waiting ${wait_for}s before restarting"
	else
		note "restarting in ${wait_for}s"
	fi
	pause "$wait_for"
done
