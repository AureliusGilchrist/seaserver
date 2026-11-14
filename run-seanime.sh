#!/usr/bin/env bash
# run-seanime.sh — keeps the server running, rebuilds it, and records every crash.
#
#   ./run-seanime.sh [server flags...]     (use this instead of ./seanime_exe)
#
# Building: every time the server is started — when this script starts, and after every crash — it
# runs ./build-all.sh. The build runs WHILE the current ./seanime_exe keeps serving, so clients can
# connect the whole time; when the build finishes, the server is restarted into the new binary
# (a few seconds of downtime). A failed build is logged and the running server is left alone. Only
# when there is no ./seanime_exe at all does the server wait for the build.
#
# Crashes: when the server dies on its own (a Go panic, a fatal error, killed by the OOM killer), a
# crash report is written, the server is started again straight away from the binary that is there,
# and a new build starts in the background. A clean exit (status 0: Ctrl+C, SIGTERM, a shutdown from
# the app) stops the restarter too. Self-updates on Linux replace the process in place (same PID),
# so they are not seen as crashes.
#
# Everything is logged to ONE place:
#
#   $HOME/.config/Seanime/crashes/                 (override with SEANIME_CRASH_DIR)
#     crashes.log                                  one line per crash or failed build
#     crash-YYYYMMDD-HHMMSS.log                    full crash report: status, the panic / stderr
#                                                  output, and the tail of the server's own log file
#     last-build.log                               output of the most recent build
#     build-failed-YYYYMMDD-HHMMSS.log             output of a build that failed
#
# The newest 100 of each kind of report are kept. Settings (environment variables):
#   SEANIME_EXE           server binary            (default: ./seanime_exe next to this script)
#   SEANIME_LOG_DIR       server's log folder      (default: $HOME/.config/Seanime/logs)
#   SEANIME_BUILD_SCRIPT  build script             (default: ./build-all.sh next to this script)
#   SEANIME_SKIP_BUILD=1  never build
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
BUILD_LOG="$CRASH_DIR/last-build.log"

note() { printf '[run-seanime %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }

version() {
	sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/versions.json" 2>/dev/null | head -n1
}

# Identifies the binary on disk, so a build that wrote a new one can be told from one that did not.
binary_id() {
	stat -c '%i:%Y:%s' "$EXE" 2>/dev/null || stat -f '%i:%m:%z' "$EXE" 2>/dev/null || echo none
}

prune() { # prune <glob prefix>
	ls -t "$CRASH_DIR"/"$1"*.log 2>/dev/null | tail -n +$((KEEP_REPORTS + 1)) | while IFS= read -r old; do rm -f -- "$old"; done
}

alive() { (( $1 > 0 )) && kill -0 "$1" 2>/dev/null; }

# Collects a finished child's exit status.
reap() { # reap <pid> → sets $reaped
	wait "$1" 2>/dev/null; reaped=$?
	while kill -0 "$1" 2>/dev/null; do wait "$1" 2>/dev/null; reaped=$?; done
}

stopping=0
on_signal() { stopping=1; }
trap on_signal INT TERM HUP

# ── server ────────────────────────────────────────────────────────────────

server=0
server_started=0
server_version=""

start_server() {
	if [[ ! -x "$EXE" ]]; then
		note "server binary not found or not executable: $EXE"
		return 1
	fi
	: > "$STDERR_FILE"
	server_started=$(date +%s)
	server_version=$(version)
	note "starting $EXE ${SERVER_ARGS[*]:-} (version ${server_version:-unknown})"
	# stdout (the normal logs) passes straight through; stderr is shown and also kept for the report.
	"$EXE" "${SERVER_ARGS[@]+"${SERVER_ARGS[@]}"}" 2> >(tee -a "$STDERR_FILE" >&2) &
	server=$!
}

stop_server() {
	alive "$server" || { server=0; return; }
	kill -TERM "$server" 2>/dev/null
	local i
	for ((i = 0; i < 300; i++)); do # up to 30s for a clean shutdown
		alive "$server" || break
		sleep 0.1
	done
	if alive "$server"; then
		note "server did not stop within 30s — killing it"
		kill -KILL "$server" 2>/dev/null
	fi
	reap "$server"
	server=0
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

write_crash_report() { # write_crash_report <exit code>
	local code=$1 now uptime status stamp report latest_log first_line
	now=$(date +%s)
	uptime=$((now - server_started))
	status=$(describe_status "$code")
	stamp=$(date '+%Y%m%d-%H%M%S')
	report="$CRASH_DIR/crash-$stamp.log"
	{
		echo "Seanime crash report"
		echo "time:     $(date '+%Y-%m-%d %H:%M:%S %z')"
		echo "status:   $status"
		echo "version:  ${server_version:-unknown}"
		echo "uptime:   ${uptime}s"
		echo "binary:   $EXE"
		echo "args:     ${SERVER_ARGS[*]:-}"
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
		"$(date '+%Y-%m-%d %H:%M:%S')" "$status" "${server_version:-unknown}" "$uptime" "$(basename "$report")" "${first_line:-}" \
		>> "$CRASH_DIR/crashes.log"
	prune crash-
	note "server crashed: $status — report: $report"
}

# ── build ─────────────────────────────────────────────────────────────────

builder=0
build_started=0
build_binary_before=""

start_build() {
	[[ "$SKIP_BUILD" == "1" ]] && return
	alive "$builder" && return # one build at a time
	build_started=$(date +%s)
	build_binary_before=$(binary_id)
	note "building with $BUILD_SCRIPT$(alive "$server" && echo ' (the server keeps running meanwhile)')"
	# Its own process group (setsid), so stopping the build stops npm / go under it too.
	local launcher=()
	command -v setsid >/dev/null 2>&1 && launcher=(setsid)
	"${launcher[@]+"${launcher[@]}"}" bash "$BUILD_SCRIPT" > >(tee "$BUILD_LOG" | sed -u 's/^/[build] /') 2>&1 < /dev/null &
	builder=$!
}

stop_build() {
	alive "$builder" || { builder=0; return; }
	note "stopping the build"
	kill -TERM -- "-$builder" 2>/dev/null || kill -TERM "$builder" 2>/dev/null
	reap "$builder"
	builder=0
}

# Called once the build has exited. Returns 0 when there is a new binary to switch to.
finish_build() {
	reap "$builder"
	local code=$reaped
	builder=0
	sleep 0.2 # let the log flush
	if (( code != 0 )); then
		local stamp
		stamp=$(date '+%Y%m%d-%H%M%S')
		cp "$BUILD_LOG" "$CRASH_DIR/build-failed-$stamp.log"
		printf '%s\tbuild failed (exit %s)\tversion=%s\t-\t%s\t%s\n' \
			"$(date '+%Y-%m-%d %H:%M:%S')" "$code" "$(version)" "build-failed-$stamp.log" \
			"$(grep -v '^[[:space:]]*$' "$BUILD_LOG" | tail -n1 | cut -c1-200)" >> "$CRASH_DIR/crashes.log"
		prune build-failed-
		note "build FAILED (exit $code) — log: $CRASH_DIR/build-failed-$stamp.log"
		return 1
	fi
	note "build finished in $(( $(date +%s) - build_started ))s"
	if [[ "$(binary_id)" == "$build_binary_before" ]]; then
		note "the build did not produce a new binary — keeping the running server"
		return 1
	fi
	return 0
}

# ── main loop ─────────────────────────────────────────────────────────────

SERVER_ARGS=("$@")
crash_times=()
restart_at=0 # when >0: the server is down after a crash and comes back at this time

shutdown() {
	note "stop requested — stopping"
	stop_build
	stop_server
	note "stopped"
	exit 0
}

if [[ -x "$EXE" ]]; then
	start_server
	start_build
else
	note "no server binary yet — building it first"
	start_build
fi

while :; do
	(( stopping )) && shutdown

	# The server exited. (Checked before the build, so a crash in the same second as a finished
	# build is still reported.)
	if (( server > 0 )) && ! alive "$server"; then
		reap "$server"
		code=$reaped
		server=0
		sleep 0.2 # let tee flush the last of stderr
		(( stopping )) && shutdown
		if (( code == 0 )); then
			note "server exited cleanly — not restarting"
			stop_build
			exit 0
		fi
		write_crash_report "$code"

		now=$(date +%s)
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
		restart_at=$((now + wait_for))
	fi

	# The build finished.
	if (( builder > 0 )) && ! alive "$builder"; then
		if finish_build; then
			if alive "$server"; then
				note "new build ready (version $(version)) — restarting the server into it"
				stop_server
			fi
			restart_at=0
			start_server
		elif ! alive "$server" && (( restart_at == 0 )); then
			if [[ -x "$EXE" ]]; then
				note "starting the previous build of $EXE instead"
				start_server
			else
				note "no server binary to fall back on — retrying the build in 60s"
				restart_at=$(( $(date +%s) + 60 )) # handled below: the retry also starts a build
			fi
		fi
	fi

	# Time to bring the server back after a crash (or to retry a build that left no binary).
	if (( restart_at > 0 && $(date +%s) >= restart_at )); then
		restart_at=0
		if [[ -x "$EXE" ]]; then
			start_server
		fi
		start_build
	fi

	sleep 1
done
