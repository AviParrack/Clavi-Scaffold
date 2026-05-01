# Library — South

*Long-term memory. Where context accrues over years. Organized by topic.*

*Research found by agents, material from the internet, reference documents, and processed knowledge all land here. The Library grows organically — when agents or research sprints produce reference material that isn't tied to a specific active project, it belongs here.*

## Knowledge Graph

The foundation + compiled knowledge. Constitutional docs amend only with the user's approval.

- [PREMISES.md](Knowledge-Graph/PREMISES.md) — worldview commitments, grounds all research
- [KEY_FINDINGS.md](Knowledge-Graph/KEY_FINDINGS.md) — canonical S/A-tier claims
- [index.md](Knowledge-Graph/index.md) — catalog of all wiki pages (read this first when searching for knowledge)
- [log.md](Knowledge-Graph/log.md) — chronological record of every ingest and synthesis
- [wiki/](Knowledge-Graph/wiki/) — standalone synthesis pages. Compiled knowledge on topics, cross-referenced. Created by /triage (S/A items) or manually when conversations produce good synthesis.

## Topic Collections

Reference material organized by research area. Grows organically as agents bring back findings — when scouts or research sprints produce material that isn't tied to a specific Workshop project, it accrues here.

*Empty in a fresh clone. Topic folders appear as you research — name them after the topics you accrue knowledge on. (No fixed schema.)*

## Conversations

Saved conversation transcripts. See [Conversations/README.md](Conversations/README.md) for details.

- `transcripts/` — exported conversations via `/save-conversation`

## Logs

System logs + pattern analysis. Mostly written by hooks and automated skills — see [Logs/README.md](Logs/README.md) for full details.

- `PATTERNS.md` — weekly pattern synthesis output (from `/memory-synthesis`)
- `feedback-log.md` — auto-captured feedback (UserPromptSubmit hook)
- `metadata/*.jsonl` — daily tool-usage logs (PostToolUse + SubagentStart hooks)
- *(Per-user session logs are gitignored — they're machine-specific.)*

## Someday

Ideas that haven't been promoted to Workshop projects yet. 🟡 triage items land here. See [Someday/README.md](Someday/README.md) for details.

## Archive

Completed, superseded, or historical material. Restorable if needed. See [Archive/README.md](Archive/README.md) for details.
