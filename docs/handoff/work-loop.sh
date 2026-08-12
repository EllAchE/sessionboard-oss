#!/usr/bin/env bash
# Runs `work-loop.md` on a loop. Each iteration is a fresh session, so context never accumulates
# across a long run and PROGRESS.md is the only memory between them.
set -uo pipefail

LOOP_DIR="$HOME/cicero-loop"
mkdir -p "$LOOP_DIR/logs"

# 21:00 America/Los_Angeles == 04:00 UTC the next day. An hour of headroom before the 22:00 PT
# deadline, so a half-finished iteration can never be what gets submitted.
STOP_AT=$(date -u -d "2026-08-13 04:00:00" +%s)

i=1
while :; do
  if [ "$(date -u +%s)" -ge "$STOP_AT" ]; then
    echo "$(date -u "+%F %T") stopping: within an hour of the deadline" | tee -a "$LOOP_DIR/loop.log"
    break
  fi

  log="$LOOP_DIR/logs/iter-$(printf "%03d" "$i").log"
  echo "$(date -u "+%F %T") starting iteration $i -> $log" | tee -a "$LOOP_DIR/loop.log"

  cd "$HOME/cicero" || exit 1
  timeout 3600 claude --dangerously-skip-permissions -p "$(cat "$LOOP_DIR/HANDOFF.md")

---
You are iteration $i. It is $(date -u "+%F %T") UTC. The deadline is 2026-08-12 22:00 America/Los_Angeles.
Read ~/cicero-loop/PROGRESS.md before doing anything, and append to it before you finish." >"$log" 2>&1

  echo "$(date -u "+%F %T") iteration $i exited $?" | tee -a "$LOOP_DIR/loop.log"
  i=$((i + 1))
  sleep 20
done
