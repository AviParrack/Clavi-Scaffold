# Logs

*System logs and pattern analysis. Mostly written by hooks and automated skills — you rarely edit these by hand.*

## What lives here

- **`avi-log.md` / `claude-log.md`** — your session log (replace `avi-` with your username) and Claude's session log. Note from sessions, observations, decisions.
- **`PATTERNS.md`** — weekly pattern synthesis output. The `/memory-synthesis` skill writes here.
- **`feedback-log.md`** — auto-captured feedback. The UserPromptSubmit hook detects when you say "feedback" and appends here.
- **`metadata/YYYY-MM-DD.jsonl`** — daily JSONL tool-usage logs. Written by the PostToolUse + SubagentStart hooks.

## Read patterns

- `/memory-synthesis` reads `feedback-log.md` weekly to promote recurring corrections to permanent memory.
- `/morning-briefing` (Mondays) surfaces the latest entry from `PATTERNS.md`.
- Pattern synthesis agents read `metadata/*.jsonl` for tool-usage trends.
- Future Claudes can grep these for context across sessions.

This folder is empty in a fresh clone — runtime logs accrue as you work.
