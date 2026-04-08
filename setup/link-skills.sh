#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# link-skills.sh — Wire submodule skills into .claude/skills/
#
# Run once after cloning (or after adding new submodules):
#   bash setup/link-skills.sh
#
# Creates symlinks with prefixed names so Claude Code discovers them
# as /gstack-browse, /sci-arxiv-database, /acad-deep-research, etc.
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/.claude/skills"

mkdir -p "$SKILLS_DIR"

linked=0
skipped=0

link_skill() {
    local source_dir="$1"
    local prefix="$2"
    local skill_name="$3"

    local target="$SKILLS_DIR/${prefix}${skill_name}"

    if [ -L "$target" ] || [ -d "$target" ]; then
        ((skipped++))
        return
    fi

    ln -s "$source_dir" "$target"
    ((linked++))
    echo "  ✅ ${prefix}${skill_name}"
}

echo ""
echo "🔗 Linking submodule skills into .claude/skills/"
echo "   Repo root: $REPO_ROOT"
echo ""

# ── gstack ──────────────────────────────────────────────────────
if [ -d "$REPO_ROOT/gstack" ]; then
    echo "── gstack (prefix: gstack-)"
    for skill_dir in "$REPO_ROOT"/gstack/*/; do
        if [ -f "$skill_dir/SKILL.md" ]; then
            skill_name="$(basename "$skill_dir")"
            # Skip the self-upgrade skill and root SKILL.md
            [[ "$skill_name" == "gstack-upgrade" ]] && continue
            link_skill "$skill_dir" "gstack-" "$skill_name"
        fi
    done
    echo ""
fi

# ── claude-scientific-skills ────────────────────────────────────
if [ -d "$REPO_ROOT/claude-scientific-skills/scientific-skills" ]; then
    echo "── claude-scientific-skills (prefix: sci-)"
    for skill_dir in "$REPO_ROOT"/claude-scientific-skills/scientific-skills/*/; do
        if [ -f "$skill_dir/SKILL.md" ]; then
            skill_name="$(basename "$skill_dir")"
            link_skill "$skill_dir" "sci-" "$skill_name"
        fi
    done
    echo ""
fi

# ── academic-research-skills ────────────────────────────────────
if [ -d "$REPO_ROOT/academic-research-skills" ]; then
    echo "── academic-research-skills (prefix: acad-)"
    for skill_dir in "$REPO_ROOT"/academic-research-skills/*/; do
        if [ -f "$skill_dir/SKILL.md" ]; then
            skill_name="$(basename "$skill_dir")"
            link_skill "$skill_dir" "acad-" "$skill_name"
        fi
    done
    echo ""
fi


# ── trailofbits-config ──────────────────────────────────────────
if [ -d "$REPO_ROOT/trailofbits-config/commands" ]; then
    echo "── trailofbits-config (prefix: tob-)"
    for cmd_file in "$REPO_ROOT"/trailofbits-config/commands/*.md; do
        if [ -f "$cmd_file" ]; then
            cmd_name="$(basename "$cmd_file" .md)"
            target="$SKILLS_DIR/tob-${cmd_name}"
            if [ ! -L "$target" ] && [ ! -f "$target" ]; then
                # Commands are single files, not dirs — symlink directly
                mkdir -p "$target"
                ln -sf "$cmd_file" "$target/SKILL.md"
                ((linked++))
                echo "  ✅ tob-${cmd_name}"
            else
                ((skipped++))
            fi
        fi
    done
    echo ""
fi

echo "Done. Linked $linked new skills ($skipped already existed)."
echo ""
echo "Native skills in .claude/skills/:"
for native in "$SKILLS_DIR"/*/; do
    if [ ! -L "${native%/}" ] && [ -f "$native/SKILL.md" ]; then
        echo "  📦 $(basename "$native")"
    fi
done
echo ""
