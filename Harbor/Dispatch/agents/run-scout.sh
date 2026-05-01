#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# run-scout.sh — Headless wrapper for any /scout-* skill
#
# Invokes `claude -p "/<skill>"` with cron-safe environment and
# captures output to a per-run log.
#
# Usage:
#   run-scout.sh <skill-name>
#
# Examples:
#   run-scout.sh watchlist-monitor
#   run-scout.sh email-triage
#   run-scout.sh morning-briefing
#
# Environment:
#   REPO_DIR — defaults to $HOME/Avi-Claude
#
# Output:
#   Logs to Harbor/Dispatch/log/scouts/{date}-{time}-{skill}.log
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

SCOUT="${1:?Usage: run-scout.sh <skill-name>}"
REPO_DIR="${REPO_DIR:-$HOME/Avi-Claude}"
LOG_DIR="$REPO_DIR/Harbor/Dispatch/log/scouts"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H-%M)
LOG_FILE="$LOG_DIR/${DATE}-${TIME}-${SCOUT}.log"

mkdir -p "$LOG_DIR"

# Cron's PATH is minimal; ensure claude is reachable
export PATH="/Users/aviparrack/anaconda3/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$REPO_DIR"

{
    echo "═══════════════════════════════════════════"
    echo "Scout: /${SCOUT}"
    echo "Started: $(date)"
    echo "Repo:    ${REPO_DIR}"
    echo "═══════════════════════════════════════════"
    set +e
    claude -p "/${SCOUT}"
    EXIT_CODE=$?
    set -e
    echo "═══════════════════════════════════════════"
    echo "Finished: $(date) — exit code: $EXIT_CODE"
    echo "═══════════════════════════════════════════"
} > "$LOG_FILE" 2>&1

exit ${EXIT_CODE:-0}
