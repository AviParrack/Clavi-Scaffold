#!/usr/bin/env python3
"""SubagentStart async hook: log when subagents are spawned.

Tracks: what subagents are launched, what they're for, which project they serve.
Feeds into pattern synthesis — how often do you use parallel agents, for what?
"""
import json
import sys
import os
from datetime import datetime

def get_log_path(project_dir):
    log_dir = os.path.join(project_dir, "Library", "Logs", "metadata")
    os.makedirs(log_dir, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    return os.path.join(log_dir, f"{date_str}.jsonl")

def detect_workshop(cwd, project_dir):
    rel = os.path.relpath(cwd, project_dir) if cwd and project_dir else ""
    if rel.startswith("Workshop"):
        parts = rel.split(os.sep)
        if len(parts) >= 2 and parts[1] not in ("finished", "backburner", "archived"):
            return parts[1]
    return None

def main():
    try:
        hook_input = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not project_dir:
        sys.exit(0)

    cwd = hook_input.get("cwd", "")
    session_id = hook_input.get("session_id", "unknown")

    entry = {
        "ts": datetime.now().isoformat(),
        "tool": "SubagentStart",
        "session": session_id[:12],
        "workshop": detect_workshop(cwd, project_dir),
    }

    entry = {k: v for k, v in entry.items() if v is not None}

    try:
        log_path = get_log_path(project_dir)
        with open(log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass

    sys.exit(0)

if __name__ == "__main__":
    main()
