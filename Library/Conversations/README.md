# Conversations

*Saved conversation transcripts. Use `/save-conversation` to export the current session here as clean markdown.*

## Subfolders

- `transcripts/` — exported sessions, named by date + topic
- `calibration-sessions/` — historical sessions used for tuning Claude's behavior

## Why save conversations

Three reasons worth keeping a transcript:

1. **A decision got made** — record the reasoning so future-you (or future-Claude) doesn't have to re-derive it
2. **A process worked well** — the conversation itself is the artifact, worth referencing for similar future work
3. **An idea emerged** that you want to revisit but isn't yet a project — Library/Someday/ is also fine for these

Most sessions are *not* worth saving. The `/pulser` skill visualizes session activity if you want to find one in the index later — by default Claude Code retains ~99999 days of session history at `~/.claude/projects/<project-id>/`.

This folder is empty in a fresh clone.
