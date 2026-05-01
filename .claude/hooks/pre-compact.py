#!/usr/bin/env python3
"""PreCompact hook: remind Claude to update the project HANDOFF.md before compaction.

This solves the handoff staleness problem. When context is about to be compacted,
Claude is prompted to write down what it knows while the full context is still warm.
Even if the session is never returned to, the HANDOFF.md survives.
"""
import json
import sys
import os

def main():
    try:
        hook_input = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    cwd = hook_input.get("cwd", "")
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", cwd)

    # Check if we're inside a Workshop project
    workshop_dir = os.path.join(project_dir, "Workshop")
    relative_cwd = os.path.relpath(cwd, project_dir) if cwd else ""

    context_parts = []

    # Remind Claude to update or create HANDOFF.md
    context_parts.append(
        "**Before compaction:** If you've been working on a project, update (or create) its "
        "HANDOFF.md with: (1) what was accomplished this session, (2) what remains, "
        "(3) any gotchas or decisions made. Keep it under 30 lines. "
        "If no HANDOFF.md exists yet, create one now. "
        "This is your handoff to the next Claude instance."
    )

    if context_parts:
        output = {"additionalContext": "\n\n".join(context_parts)}
        json.dump(output, sys.stdout)

    sys.exit(0)

if __name__ == "__main__":
    main()
