#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# check-usage.sh — Query Claude Max plan usage percentage
#
# NOTE: OAuth token is managed internally by Claude Code and not
# easily accessible from shell. This script tries two methods:
#   1. Direct OAuth endpoint (if credentials file exists)
#   2. Fallback: parse ccusage output for recent token burn rate
#
# Usage:
#   bash check-usage.sh              # Print full JSON
#   bash check-usage.sh session      # Print 5hr session % only (e.g. "73")
#   bash check-usage.sh weekly       # Print 7-day weekly % only
#   bash check-usage.sh gate [N]     # Exit 0 if session < N%, exit 1 if >= N%
#                                    # Default gate: 85%
#
# For agents INSIDE a Claude session: just ask Claude to check /usage
# or run the ccusage statusline. This script is for external callers.
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

CREDS_FILE="$HOME/.claude/.credentials.json"
KEYCHAIN_SVC="Claude Code-credentials"
MODE="${1:-full}"
GATE_THRESHOLD="${2:-85}"

# Read OAuth token from either the file (Linux / older macOS Claude Code)
# or the macOS Keychain (current Claude Code on macOS).
TOKEN=""

if [ -f "$CREDS_FILE" ]; then
    TOKEN=$(jq -r '.claudeAiOauth.accessToken' "$CREDS_FILE" 2>/dev/null)
fi

if { [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; } && command -v security >/dev/null 2>&1; then
    KC_JSON=$(security find-generic-password -s "$KEYCHAIN_SVC" -w 2>/dev/null || true)
    if [ -n "$KC_JSON" ]; then
        TOKEN=$(echo "$KC_JSON" | jq -r '.claudeAiOauth.accessToken' 2>/dev/null)
    fi
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "ERROR: Could not find OAuth token in $CREDS_FILE or Keychain ($KEYCHAIN_SVC)" >&2
    exit 2
fi

USAGE_JSON=$(curl -s "https://api.anthropic.com/api/oauth/usage" \
    -H "Authorization: Bearer $TOKEN" \
    -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null)

if [ -z "$USAGE_JSON" ] || echo "$USAGE_JSON" | jq -e '.error' &>/dev/null; then
    echo "ERROR: Failed to fetch usage data" >&2
    exit 2
fi

case "$MODE" in
    full)
        echo "$USAGE_JSON" | jq .
        ;;
    session)
        echo "$USAGE_JSON" | jq -r '.five_hour.utilization // 0' | sed 's/%.*//' | cut -d'.' -f1
        ;;
    weekly)
        echo "$USAGE_JSON" | jq -r '.seven_day.utilization // 0' | sed 's/%.*//' | cut -d'.' -f1
        ;;
    gate)
        SESSION_PCT=$(echo "$USAGE_JSON" | jq -r '.five_hour.utilization // 0' | sed 's/%.*//' | cut -d'.' -f1)
        if [ "$SESSION_PCT" -ge "$GATE_THRESHOLD" ]; then
            echo "THROTTLED: Session usage at ${SESSION_PCT}% (threshold: ${GATE_THRESHOLD}%)"
            exit 1
        else
            echo "OK: Session usage at ${SESSION_PCT}% (threshold: ${GATE_THRESHOLD}%)"
            exit 0
        fi
        ;;
    *)
        echo "Usage: check-usage.sh [full|session|weekly|gate [threshold]]" >&2
        exit 1
        ;;
esac
