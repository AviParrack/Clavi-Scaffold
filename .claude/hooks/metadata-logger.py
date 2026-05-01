#!/usr/bin/env python3
"""PostToolUse async hook: log tool usage metadata for pattern synthesis.

Captures: tool name, timestamp, active space, active workshop, files touched,
skill invocations, session ID.

Runs async — zero latency cost.
Weekly pattern synthesis reads these logs for:
  - Which tools are used most
  - Per-project effort distribution
  - Which skills are actually invoked (informs active/catalog split)
  - Session duration patterns
  - Stale sessions (30+ days inactive)
  - Which files get touched most
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

def detect_space(cwd, project_dir):
    """Determine which space Claude is working in."""
    rel = os.path.relpath(cwd, project_dir) if cwd and project_dir else ""
    for space in ("Harbor", "Town-Hall", "Workshop", "Library", "Embassy", "Crossroads"):
        if rel.startswith(space):
            return space
    return "root"

def detect_workshop(cwd, project_dir):
    """Detect which Workshop project is active."""
    rel = os.path.relpath(cwd, project_dir) if cwd and project_dir else ""
    if rel.startswith("Workshop"):
        parts = rel.split(os.sep)
        if len(parts) >= 2 and parts[1] not in ("finished", "backburner", "archived"):
            return parts[1]
    return None

def detect_skill(tool_name, tool_input):
    """Detect if this is a skill invocation."""
    if tool_name == "Skill":
        return tool_input.get("skill", None)
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
    tool_name = hook_input.get("tool_name", "unknown")
    tool_input = hook_input.get("tool_input", {})
    session_id = hook_input.get("session_id", "unknown")

    # Extract file paths from tool input
    files_touched = []
    for key in ("file_path", "path", "pattern", "file"):
        if key in tool_input and tool_input[key]:
            files_touched.append(str(tool_input[key]))

    # Capture Bash command (truncated to keep logs reasonable)
    bash_cmd = None
    if tool_name == "Bash":
        cmd = tool_input.get("command")
        if cmd:
            bash_cmd = str(cmd)[:500]

    # Detect skill invocation
    skill = detect_skill(tool_name, tool_input)

    entry = {
        "ts": datetime.now().isoformat(),
        "tool": tool_name,
        "session": session_id[:12],
        "space": detect_space(cwd, project_dir),
        "workshop": detect_workshop(cwd, project_dir),
        "files": files_touched if files_touched else None,
        "skill": skill,
        "cmd": bash_cmd,
    }

    # Remove None values for compact logs
    entry = {k: v for k, v in entry.items() if v is not None}

    try:
        log_path = get_log_path(project_dir)
        with open(log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass  # Fail silently — logging should never block work

    sys.exit(0)

if __name__ == "__main__":
    main()
