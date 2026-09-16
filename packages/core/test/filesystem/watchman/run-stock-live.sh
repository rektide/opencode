#!/usr/bin/env bash
set -euo pipefail

binary=${1:?usage: run-stock-live.sh /path/to/watchman}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
core=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
created=
if [[ -z ${OPENCODE_TEST_WATCHMAN_STATE_DIR:-} ]]; then
  base=$(mktemp -d "${TMPDIR:-/tmp}/opencode-watchman-live.XXXXXX")
  created=1
else
  base=$OPENCODE_TEST_WATCHMAN_STATE_DIR
  mkdir -p "$base"
fi
socket=$base/sock
marker=$base/restart-ready
daemon_pid=
test_pid=

cleanup() {
  if [[ -n $daemon_pid ]]; then
    kill "$daemon_pid" 2>/dev/null || true
    wait "$daemon_pid" 2>/dev/null || true
  fi
  if [[ -n $test_pid ]]; then
    kill "$test_pid" 2>/dev/null || true
    wait "$test_pid" 2>/dev/null || true
  fi
  rm -f "$socket"
  if [[ -n $created ]]; then rm -rf "$base"; fi
}
trap cleanup EXIT

nice_value=$(ps -o ni= -p $$ | tr -d ' ')
printf '{"min_acceptable_nice_value": %s}\n' "$nice_value" > "$base/config.json"

start_daemon() {
  local output=$1
  rm -f "$socket" "$base/state" "$base/pid"
  WATCHMAN_CONFIG_FILE="$base/config.json" "$binary" \
    --foreground \
    --unix-listener-path="$socket" \
    --statefile="$base/state" \
    --logfile="$base/watchman.log" \
    --pidfile="$base/pid" \
    --no-save-state >"$output" 2>&1 &
  daemon_pid=$!
  for _ in {1..200}; do
    if [[ -S $socket ]]; then return; fi
    if ! kill -0 "$daemon_pid" 2>/dev/null; then
      cat "$output" >&2
      return 1
    fi
    sleep 0.05
  done
  echo "private Watchman socket did not become ready" >&2
  return 1
}

stop_daemon() {
  kill "$daemon_pid" 2>/dev/null || true
  wait "$daemon_pid" 2>/dev/null || true
  daemon_pid=
  rm -f "$socket"
}

rm -f "$marker"
start_daemon "$base/watchman-1.log"
(
  cd "$core"
  OPENCODE_TEST_WATCHMAN_SOCK="$socket" \
    OPENCODE_TEST_WATCHMAN_RESTART_MARKER="$marker" \
    bun test "$script_dir/directory.test.ts"
) >"$base/test.log" 2>&1 &
test_pid=$!

for _ in {1..400}; do
  if [[ -f $marker ]]; then break; fi
  if ! kill -0 "$test_pid" 2>/dev/null; then
    cat "$base/test.log"
    exit 1
  fi
  sleep 0.05
done
[[ -f $marker ]]

stop_daemon
start_daemon "$base/watchman-2.log"
wait "$test_pid"
test_pid=
cat "$base/test.log"
