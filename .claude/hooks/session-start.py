#!/usr/bin/env python3
"""SessionStart hook: inject context on startup and after compaction.

On startup: tells Claude which space it's in.
After compaction: re-injects the relevant HANDOFF.md so Claude picks up where it left off.
"""
import json
import sys
import os
import glob

def detect_space(cwd, project_dir):
    """Determine which space Claude is working in based on cwd."""
    rel = os.path.relpath(cwd, project_dir) if cwd and project_dir else ""
    if rel.startswith("Harbor"):
        return "Harbor (North) — intake + dispatch"
    elif rel.startswith("Town-Hall"):
        return "Town Hall (West) — identity + infrastructure"
    elif rel.startswith("Workshop"):
        # Try to detect which project
        parts = rel.split(os.sep)
        if len(parts) >= 2:
            return f"Workshop (East) — project: {parts[1]}"
        return "Workshop (East) — active work"
    elif rel.startswith("Library"):
        return "Library (South) — long-term memory"
    elif rel.startswith("Embassy"):
        return "Embassy (NE) — org spaces"
    elif rel.startswith("Crossroads"):
        return "Crossroads (NW) — personal network"
    return "Root"

def find_nearest_handoff(cwd, project_dir):
    """Walk up from cwd looking for HANDOFF.md."""
    current = cwd
    while current and current.startswith(project_dir):
        handoff = os.path.join(current, "HANDOFF.md")
        if os.path.exists(handoff):
            return handoff
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return None

def main():
    try:
        hook_input = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    cwd = hook_input.get("cwd", "")
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", cwd)
    session_type = hook_input.get("type", "startup")  # startup, resume, compact, clear

    context_parts = []

    # Always: identify which space we're in
    space = detect_space(cwd, project_dir)
    context_parts.append(f"**Current space:** {space}")

    # After compaction: re-inject HANDOFF.md
    if session_type == "compact":
        handoff = find_nearest_handoff(cwd, project_dir)
        if handoff:
            try:
                with open(handoff) as f:
                    content = f.read()[:3000]  # Cap at 3000 chars to stay lean
                rel_path = os.path.relpath(handoff, project_dir)
                context_parts.append(
                    f"**Re-injected after compaction** ({rel_path}):\n\n{content}"
                )
            except Exception:
                pass

    if context_parts:
        output = {"additionalContext": "\n\n".join(context_parts)}
        json.dump(output, sys.stdout)

    sys.exit(0)

if __name__ == "__main__":
    main()
