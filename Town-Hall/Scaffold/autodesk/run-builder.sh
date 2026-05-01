#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# run-builder.sh — Headless single-builder wrapper
#
# Invokes `claude -p` with the builder boot prompt for one project.
# Called by builder-manager.sh; can also be run manually.
#
# Usage:
#   run-builder.sh <project>
#
# Environment:
#   REPO_DIR — defaults to $PWD (override with: REPO_DIR=/path/to/scaffold)
#
# Output:
#   Logs to Harbor/Dispatch/log/builders/{date}-{time}-{project}.log
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT="${1:?Usage: run-builder.sh <project-slug>}"
REPO_DIR="${REPO_DIR:-$PWD}"
LOG_DIR="$REPO_DIR/Harbor/Dispatch/log/builders"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H-%M)
LOG_FILE="$LOG_DIR/${DATE}-${TIME}-${PROJECT}.log"

mkdir -p "$LOG_DIR"

# Cron has a minimal PATH; ensure claude is reachable.
# Override with CLAUDE_PATH env var, or edit this line to match your install.
export PATH="${CLAUDE_PATH:-$HOME/.claude/local}:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$REPO_DIR"

PROMPT="Read Town-Hall/Scaffold/autodesk/builder-boot.md and follow the boot sequence. Your assigned project is: ${PROJECT}. You are a Builder agent running headlessly via cron. Update the heartbeat file, make meaningful progress on the project, commit your changes, and exit cleanly. Do not wait for user input. If you hit a budget gate, lock conflict, or finish a meaningful unit of work, exit gracefully — the next scheduled cycle will pick up where you left off."

{
    echo "═══════════════════════════════════════════"
    echo "Builder: ${PROJECT}"
    echo "Started: $(date)"
    echo "Repo:    ${REPO_DIR}"
    echo "═══════════════════════════════════════════"
    set +e
    claude -p "$PROMPT"
    EXIT_CODE=$?
    set -e
    echo "═══════════════════════════════════════════"
    echo "Finished: $(date) — exit code: $EXIT_CODE"
    echo "═══════════════════════════════════════════"
} > "$LOG_FILE" 2>&1

exit ${EXIT_CODE:-0}
