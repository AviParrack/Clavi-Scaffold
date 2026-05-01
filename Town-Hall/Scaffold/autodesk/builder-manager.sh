#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# builder-manager.sh — Auto-spawn builders for green-lit projects
#
# Runs every 30 minutes via launchd. Checks:
#   1. Sync repo (safe-sync pull)
#   2. How many builders are active (YAML heartbeat status: building)
#   3. Are there stale builders (no heartbeat update in 30+ min)?
#   4. Are there green-lit projects without active builders?
#   5. Are projects locked by another machine?
#   6. If capacity available and work to do, spawn a new builder
#
# Max 2 builders at once to keep costs manageable.
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

MAX_BUILDERS="${MAX_BUILDERS:-2}"
STALE_THRESHOLD="${STALE_THRESHOLD:-1800}"  # 30 minutes in seconds
REPO_DIR="${REPO_DIR:-$PWD}"
AUTODESK_DIR="$REPO_DIR/Town-Hall/Scaffold/autodesk"
IDEAS_FILE="$REPO_DIR/Workshop/Claudes-Projects/IDEAS.md"
RUN_BUILDER="$AUTODESK_DIR/run-builder.sh"
SYNC_SCRIPT="$AUTODESK_DIR/safe-sync.sh"

cd "$REPO_DIR"

echo "[$(date)] ═══ Builder Manager ═══"

# ── Token budget gate ─────────────────────────────────────────────
# Refuse to spawn new builders if 5hr session usage is at or above threshold.
# Keeps autonomous work from consuming the daily budget the user might want to use.
USAGE_GATE_THRESHOLD="${USAGE_GATE_THRESHOLD:-85}"
if bash "$AUTODESK_DIR/check-usage.sh" gate "$USAGE_GATE_THRESHOLD" >/dev/null 2>&1; then
    echo "✅ Usage under ${USAGE_GATE_THRESHOLD}% — proceeding"
else
    echo "🛑 Usage at or above ${USAGE_GATE_THRESHOLD}% — skipping spawn this cycle"
    exit 0
fi

# ── Sync first ────────────────────────────────────────────────────
bash "$SYNC_SCRIPT" pull 2>&1 || echo "⚠️  Pull failed — continuing with local state"

# ── Parse heartbeat field (handles both YAML frontmatter + markdown bold labels) ──
# Tolerates empty results (no `set -e` blowup).
get_heartbeat_field() {
    local file="$1" field="$2"
    local val
    # Try YAML frontmatter first: between --- delimiters
    val=$(sed -n '/^---$/,/^---$/p' "$file" 2>/dev/null | grep "^${field}:" 2>/dev/null | sed "s/^${field}: *//" | head -1 || true)
    if [ -z "$val" ]; then
        # Fallback: markdown bold label like **Status:** building or **Project:** name
        local cap="$(echo "${field:0:1}" | tr '[:lower:]' '[:upper:]')${field:1}"
        val=$(grep -iE "^\*\*${cap}:\*\*" "$file" 2>/dev/null | sed -E "s/^\*\*[A-Za-z_]+:\*\*[[:space:]]*//" | head -1 || true)
    fi
    echo "$val"
}

# ── Count active builders + detect stale ones ─────────────────────
active=0
active_projects=()
stale_projects=()
NOW_EPOCH=$(date "+%s")

for hb in "$AUTODESK_DIR"/heartbeat-*.md; do
    [ -f "$hb" ] || continue

    status=$(get_heartbeat_field "$hb" "status")
    project=$(get_heartbeat_field "$hb" "project")
    last_updated=$(get_heartbeat_field "$hb" "last_updated")

    if [ "$status" = "building" ] || [ "$status" = "changes-requested" ]; then
        active=$((active + 1))
        active_projects+=("$project")

        # Check for staleness
        if [ -n "$last_updated" ]; then
            # Parse ISO timestamp
            HB_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$last_updated" "+%s" 2>/dev/null || echo "0")
            AGE=$(( NOW_EPOCH - HB_EPOCH ))
            if [ "$AGE" -gt "$STALE_THRESHOLD" ]; then
                echo "⚠️  STALE: $project — heartbeat $((AGE/60))min old (threshold: $((STALE_THRESHOLD/60))min)"
                stale_projects+=("$project")
                # Mark as stale but don't decrement active count yet
                # The builder may be rate-limited (frozen), not crashed
            fi
        fi
    fi
done

echo "Active builders: $active / $MAX_BUILDERS (${active_projects[*]:-none})"
[ ${#stale_projects[@]} -gt 0 ] && echo "Stale builders: ${stale_projects[*]}"

if [ "$active" -ge "$MAX_BUILDERS" ] && [ ${#stale_projects[@]} -eq 0 ]; then
    echo "At max capacity, no stale builders. Done."
    exit 0
fi

# ── Handle stale builders ─────────────────────────────────────────
# If a builder is stale, it's probably rate-limited (frozen).
# Don't kill it — just count its slot as available for respawn.
# The stale builder's lock will expire (2hr) and the new builder
# will pick up from the heartbeat.
effective_active=$((active - ${#stale_projects[@]}))
[ "$effective_active" -lt 0 ] && effective_active=0

# ── Find green-lit projects that need builders ─────────────────────
greenlit_projects=()

while IFS= read -r line; do
    spec=$(echo "$line" | sed -n 's/.*(\([^)]*PROJECT-SPEC[^)]*\)).*/\1/p' | head -1)
    [ -z "$spec" ] && continue
    slug=$(basename "$spec" | sed 's/-PROJECT-SPEC\.md$//')
    greenlit_projects+=("$slug")
done < <(grep -A50 "## Active — Green-lit" "$IDEAS_FILE" | grep "PROJECT-SPEC")

echo "Green-lit buildable projects: ${greenlit_projects[*]:-none}"

# ── Find projects that need builders (not active, not locked) ──────
needs_builder=()

for project in "${greenlit_projects[@]}"; do
    hb_file="$AUTODESK_DIR/heartbeat-${project}.md"

    # Check lock
    if ! bash "$SYNC_SCRIPT" check-lock "$project" &>/dev/null; then
        LOCK_MACHINE=$(grep "^machine:" "$AUTODESK_DIR/locks/${project}.lock" 2>/dev/null | sed 's/machine: *//')
        MACHINE_NAME=$(grep "^machine:" "$HOME/.claude/machine-id" 2>/dev/null | sed 's/machine: *//' || hostname -s)
        if [ "$LOCK_MACHINE" != "$MACHINE_NAME" ]; then
            echo "⏭  $project — locked by $LOCK_MACHINE, skipping"
            continue
        fi
        # Locked by us is fine — we're the ones working on it
    fi

    if [ ! -f "$hb_file" ]; then
        needs_builder+=("$project")
    else
        status=$(get_heartbeat_field "$hb_file" "status")
        # Statuses we skip (do NOT respawn): paused, complete, archived, plus the
        # "already active" set: building, awaiting-review, changes-requested.
        case "$status" in
            building|awaiting-review|changes-requested|paused|complete|archived) ;;
            *) needs_builder+=("$project") ;;
        esac
        # If stale + building, it needs a fresh builder
        for stale in "${stale_projects[@]:-}"; do
            if [ "$stale" = "$project" ] && [ "$status" = "building" ]; then
                needs_builder+=("$project")
                break
            fi
        done
    fi
done

echo "Projects needing builders: ${needs_builder[*]:-none}"

if [ ${#needs_builder[@]} -eq 0 ]; then
    echo "No projects need builders right now."
    exit 0
fi

# ── Spawn builders up to max ───────────────────────────────────────
slots=$((MAX_BUILDERS - effective_active))
[ "$slots" -lt 0 ] && slots=0

for i in $(seq 0 $((slots - 1))); do
    [ $i -ge ${#needs_builder[@]} ] && break

    project="${needs_builder[$i]}"
    if [ "${DRY_RUN:-0}" = "1" ]; then
        echo "🔬 [DRY_RUN] Would spawn builder for: $project"
    else
        echo "🚀 Spawning builder for: $project"
        # Run headless in background so manager exits promptly; builder writes its own log
        nohup bash "$RUN_BUILDER" "$project" >/dev/null 2>&1 &
        disown
    fi
done

# ── Push any lock changes ──────────────────────────────────────────
if git diff --name-only | grep -q "locks/"; then
    git add "$AUTODESK_DIR/locks/" 2>/dev/null
    git commit -m "Lock update: $(date -Iseconds)" 2>/dev/null
    bash "$SYNC_SCRIPT" push 2>&1 || true
fi

echo "[$(date)] Builder manager done."
