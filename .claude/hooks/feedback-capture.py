#!/usr/bin/env python3
"""UserPromptSubmit hook: capture feedback for pattern synthesis.

When the user says "feedback", "<feedback>", or "I'm giving feedback",
append the content to Library/Logs/feedback-log.md with timestamp.
Weekly pattern synthesis reads this for recurring themes.
"""
import json
import sys
import os
import re
from datetime import datetime

TRIGGERS = [
    r'\bfeedback\b',
    r'<feedback>',
    r"i'm giving feedback",
    r"giving you feedback",
    r"here's feedback",
]

def main():
    try:
        hook_input = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    prompt = hook_input.get("prompt", "")
    if not prompt:
        sys.exit(0)

    # Check if any trigger matches
    prompt_lower = prompt.lower()
    is_feedback = any(re.search(pattern, prompt_lower) for pattern in TRIGGERS)

    if not is_feedback:
        sys.exit(0)

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not project_dir:
        sys.exit(0)

    log_path = os.path.join(project_dir, "Library", "Logs", "feedback-log.md")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    session_id = hook_input.get("session_id", "unknown")[:12]

    # Extract feedback content (strip the trigger word if at start)
    content = prompt.strip()

    entry = f"\n### {timestamp} (session: {session_id})\n\n{content}\n"

    try:
        # Create file with header if it doesn't exist
        if not os.path.exists(log_path):
            with open(log_path, "w") as f:
                f.write("# Feedback Log\n\n*Auto-captured by feedback-capture hook. Read by pattern synthesis weekly.*\n")

        with open(log_path, "a") as f:
            f.write(entry)
    except Exception:
        pass

    sys.exit(0)

if __name__ == "__main__":
    main()
