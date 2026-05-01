#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# safe-sync.sh — Git sync helper for multi-machine coordination
#
# Usage:
#   bash safe-sync.sh pull    # Stash → rebase → pop. Pings Telegram on conflict.
#   bash safe-sync.sh push    # Rebase → push. Pings Telegram on failure.
#   bash safe-sync.sh lock <project> <agent-type>   # Acquire project lock
#   bash safe-sync.sh unlock <project>              # Release project lock
#   bash safe-sync.sh check-lock <project>          # Exit 0 if unlocked, 1 if locked
#
# All agents should call this instead of raw git pull/push.
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/Avi-Claude}"
LOCKS_DIR="$REPO_DIR/Town-Hall/Scaffold/autodesk/locks"
MACHINE_ID_FILE="$HOME/.claude/machine-id"
TELEGRAM_CHAT_ID="6154387830"

cd "$REPO_DIR"

# Read machine identity
get_machine_name() {
    if [ -f "$MACHINE_ID_FILE" ]; then
        grep "^machine:" "$MACHINE_ID_FILE" | sed 's/machine: *//'
    else
        hostname -s
    fi
}

get_account() {
    if [ -f "$MACHINE_ID_FILE" ]; then
        grep "^account:" "$MACHINE_ID_FILE" | sed 's/account: *//'
    else
        echo "unknown"
    fi
}

notify_conflict() {
    local msg="$1"
    echo "⚠️  $msg"
    # Telegram notification would go here if we had CLI access
    # For now, log to file
    echo "$(date -Iseconds) CONFLICT: $msg" >> /tmp/autodesk-sync.log
}

case "${1:-help}" in
    pull)
        # Check for local changes
        if git diff --quiet && git diff --staged --quiet; then
            # Clean working tree — simple pull
            git pull --rebase origin main 2>&1 || {
                notify_conflict "git pull --rebase failed on $(get_machine_name). Manual intervention needed."
                exit 1
            }
        else
            # Dirty working tree — stash, pull, pop
            git stash push -m "safe-sync auto-stash $(date -Iseconds)" 2>&1
            git pull --rebase origin main 2>&1 || {
                notify_conflict "git pull --rebase failed on $(get_machine_name) after stash. Stash preserved."
                exit 1
            }
            git stash pop 2>&1 || {
                notify_conflict "Stash pop conflict on $(get_machine_name). Resolve manually: git stash show, git checkout --theirs/--ours"
                exit 1
            }
        fi
        echo "✅ Pull complete on $(get_machine_name)"
        ;;

    push)
        git pull --rebase origin main 2>&1 || {
            notify_conflict "Pre-push rebase failed on $(get_machine_name)."
            exit 1
        }
        git push origin main 2>&1 || {
            notify_conflict "Push failed on $(get_machine_name). Another machine may have pushed."
            exit 1
        }
        echo "✅ Push complete from $(get_machine_name)"
        ;;

    lock)
        PROJECT="${2:?Usage: safe-sync.sh lock <project> <agent-type>}"
        AGENT_TYPE="${3:-builder}"
        mkdir -p "$LOCKS_DIR"
        LOCK_FILE="$LOCKS_DIR/${PROJECT}.lock"

        # Check for existing lock
        if [ -f "$LOCK_FILE" ]; then
            LOCK_MACHINE=$(grep "^machine:" "$LOCK_FILE" | sed 's/machine: *//')
            LOCK_TIME=$(grep "^acquired:" "$LOCK_FILE" | sed 's/acquired: *//')

            # Check if lock is stale (2+ hours old)
            if [ -n "$LOCK_TIME" ]; then
                LOCK_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$LOCK_TIME" "+%s" 2>/dev/null || echo "0")
                NOW_EPOCH=$(date "+%s")
                AGE=$(( NOW_EPOCH - LOCK_EPOCH ))
                if [ "$AGE" -gt 7200 ]; then
                    echo "⚠️  Stale lock from $LOCK_MACHINE (${AGE}s old) — overriding"
                    rm "$LOCK_FILE"
                else
                    echo "🔒 LOCKED by $LOCK_MACHINE ($AGENT_TYPE) — acquired $LOCK_TIME"
                    exit 1
                fi
            fi
        fi

        # Acquire lock
        cat > "$LOCK_FILE" << EOF
machine: $(get_machine_name)
account: $(get_account)
agent: $AGENT_TYPE
acquired: $(date -Iseconds | cut -d+ -f1)
EOF
        git add "$LOCK_FILE" 2>/dev/null
        echo "🔓 Lock acquired: $PROJECT on $(get_machine_name)"
        ;;

    unlock)
        PROJECT="${2:?Usage: safe-sync.sh unlock <project>}"
        LOCK_FILE="$LOCKS_DIR/${PROJECT}.lock"
        if [ -f "$LOCK_FILE" ]; then
            rm "$LOCK_FILE"
            git add "$LOCKS_DIR/" 2>/dev/null
            echo "🔓 Lock released: $PROJECT"
        else
            echo "No lock found for $PROJECT"
        fi
        ;;

    check-lock)
        PROJECT="${2:?Usage: safe-sync.sh check-lock <project>}"
        LOCK_FILE="$LOCKS_DIR/${PROJECT}.lock"
        if [ -f "$LOCK_FILE" ]; then
            LOCK_MACHINE=$(grep "^machine:" "$LOCK_FILE" | sed 's/machine: *//')
            LOCK_TIME=$(grep "^acquired:" "$LOCK_FILE" | sed 's/acquired: *//')
            echo "🔒 LOCKED by $LOCK_MACHINE — since $LOCK_TIME"
            exit 1
        else
            echo "🔓 Unlocked"
            exit 0
        fi
        ;;

    *)
        echo "Usage: safe-sync.sh [pull|push|lock|unlock|check-lock] [args]"
        exit 1
        ;;
esac
