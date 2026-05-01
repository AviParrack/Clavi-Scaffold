#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# attach.sh — On-demand iTerm visibility for active autodesk builders
#
# Opens an iTerm window with one tail pane per active builder log,
# plus a heartbeat status pane. Detach by closing the window — builders
# keep working in the background.
#
# Usage:
#   attach.sh             # iTerm window (local Mac only)
#   attach.sh --tmux      # tmux session named 'autodesk' (good for SSH)
#
# Detection: a builder is "active" if its heartbeat-*.md file shows
# status: building or status: changes-requested.
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/Avi-Claude}"
AUTODESK_DIR="$REPO_DIR/Town-Hall/Scaffold/autodesk"
LOG_DIR="$REPO_DIR/Harbor/Dispatch/log/builders"
MODE="${1:-iterm}"

# ── Find active builders ──────────────────────────────────────────
declare -a ACTIVE_PROJECTS=()
declare -a ACTIVE_LOGS=()

for hb in "$AUTODESK_DIR"/heartbeat-*.md; do
    [ -f "$hb" ] || continue
    status=$(sed -n '/^---$/,/^---$/p' "$hb" 2>/dev/null | grep "^status:" | sed 's/status: *//' | head -1)
    if [ "$status" = "building" ] || [ "$status" = "changes-requested" ]; then
        project=$(basename "$hb" .md | sed 's/^heartbeat-//')
        # Most recent log for this project
        latest=$(ls -t "$LOG_DIR"/*-"${project}".log 2>/dev/null | head -1 || echo "")
        if [ -n "$latest" ]; then
            ACTIVE_PROJECTS+=("$project")
            ACTIVE_LOGS+=("$latest")
        fi
    fi
done

if [ ${#ACTIVE_PROJECTS[@]} -eq 0 ]; then
    echo "No active builders. Heartbeat files showing status: building or changes-requested:"
    grep -l "^status: building\|^status: changes-requested" "$AUTODESK_DIR"/heartbeat-*.md 2>/dev/null || echo "  (none)"
    exit 0
fi

echo "Active builders: ${ACTIVE_PROJECTS[*]}"

# ── tmux mode ─────────────────────────────────────────────────────
if [ "$MODE" = "--tmux" ] || [ "$MODE" = "tmux" ]; then
    SESSION="autodesk"
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "Attaching to existing tmux session '$SESSION'..."
        exec tmux attach -t "$SESSION"
    fi
    echo "Creating tmux session '$SESSION'..."
    tmux new-session -d -s "$SESSION" -n "heartbeats" \
        "watch -n 5 \"grep -E '^(project|status|last_updated):' $AUTODESK_DIR/heartbeat-*.md\""
    for i in "${!ACTIVE_PROJECTS[@]}"; do
        proj="${ACTIVE_PROJECTS[$i]}"
        log="${ACTIVE_LOGS[$i]}"
        tmux new-window -t "$SESSION" -n "$proj" "tail -f '$log'"
    done
    exec tmux attach -t "$SESSION"
fi

# ── iTerm mode (default) ──────────────────────────────────────────
# Build one heartbeat pane + one tail pane per active builder
HEARTBEAT_CMD="watch -n 5 \\\"grep -E '^(project|status|last_updated):' $AUTODESK_DIR/heartbeat-*.md\\\""

# Compose the AppleScript dynamically
TAIL_PANES=""
for i in "${!ACTIVE_PROJECTS[@]}"; do
    proj="${ACTIVE_PROJECTS[$i]}"
    log="${ACTIVE_LOGS[$i]}"
    TAIL_PANES+="
        tell current session of current tab
            set newSession to (split horizontally with default profile)
            tell newSession
                set name to \"📜 ${proj}\"
                write text \"tail -f '${log}'\"
            end tell
        end tell"
done

osascript <<APPLESCRIPT
tell application "iTerm2"
    activate
    create window with default profile
    tell current window
        tell current session of current tab
            set name to "🫀 heartbeats"
            write text "${HEARTBEAT_CMD}"
        end tell
        ${TAIL_PANES}
    end tell
end tell
APPLESCRIPT

echo "Detach: close the iTerm window. Builders keep running."
