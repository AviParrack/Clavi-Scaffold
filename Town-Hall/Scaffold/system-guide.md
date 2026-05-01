# System Guide

*Imported by CLAUDE.md via @path. Loaded every session. Keep this concise and operational.*

## Three Instruments

```
Rules  = "you should do X"     (standing orders — Claude reads, follows reliably)
Hooks  = "X is enforced"       (tripwires — system fires mechanically, 100% reliable)
Skills = "here's how to do X"  (tool manuals — invoked on demand via /slash-command)
```

Rules live in `.claude/rules/` (path-scoped). Hooks in `settings.json`. Skills in `.claude/skills/`.

## Active Hooks

These fire automatically — you don't invoke them, the system does.

| Hook | Event | What it does |
|---|---|---|
| **Pre-compact handoff** | PreCompact | Prompts you to update the project's HANDOFF.md before compaction. Write down what you know while context is warm. |
| **Session orientation** | SessionStart | Tells you which space you're in. After compaction, re-injects the relevant HANDOFF.md. |
| **Metadata logger** | PostToolUse (async) | Logs every tool call: tool, timestamp, space, workshop, files, skill invocations, session ID. Feeds pattern synthesis. |
| **Feedback capture** | UserPromptSubmit (async) | When Avi says "feedback", auto-appends to `Library/Logs/feedback-log.md`. |
| **Subagent tracker** | SubagentStart (async) | Logs when subagents are spawned for pattern analysis. |
| **Security gate** | PreToolUse: Bash | Blocks dangerous commands (rm -rf, force push, pipe-to-bash). User-level. |
| **Telegram guard** | PreToolUse: reply | Blocks sending credential files via Telegram. User-level. |
| **Notifications** | Notification + Stop | macOS notifications when Claude needs attention or finishes. User-level. |

Metadata logs: `Library/Logs/metadata/{date}.jsonl`. Feedback log: `Library/Logs/feedback-log.md`.

## Knowledge Pipeline (6Rs)

All research enters through [Harbor/Inbox/](../../Harbor/Inbox/). Nothing integrates without Avi's sign-off.

```
/research-sprint → Harbor/Inbox/
  RECORD → REDUCE → REFLECT → GATE (Avi) → S/A/B/C/D/F
    S → update PREMISES.md + KEY_FINDINGS.md + reweave connected files
    A → KEY_FINDINGS.md + tag canonical
    B → promote to Workshop or Library
    C/D → Library/Archive
    F → delete with rejection note
```

Workshop gaps feed back to Harbor/Inbox/ as research requests.

## Knowledge Wiki (Karpathy pattern)

When a research query or conversation produces a genuinely good synthesis — a clear explanation of a topic, a well-reasoned analysis, a useful comparison — save it as a wiki page at `Library/Knowledge-Graph/wiki/{topic-slug}.md`. This makes explorations compound rather than disappearing into conversation history.

**When to create a wiki page:**
- `/triage` promotes an S or A tier item (automatic — built into the skill)
- A conversation produces synthesis worth keeping (manual — Avi says "save this to the wiki" or Claude suggests it)
- A `/research-sprint` produces a strong distillation

**After creating a page:** update `Library/Knowledge-Graph/index.md` (add the page) and `Library/Knowledge-Graph/log.md` (append the event). Cross-reference related existing wiki pages in both directions.

## Three Context Documents

| | CLAUDE.md | HANDOFF.md | Seance Log |
|---|---|---|---|
| **Purpose** | "What is this place?" | "What's happening right now?" | "What did the last agent try?" |
| **Changes** | Rarely (structure changes) | Every session (state changes) | Per autonomous agent session |
| **Content** | What this folder contains, conventions, key file pointers | What's in progress, what's next, gotchas | Dead ends, reasoning, what worked/failed |
| **Loaded** | Automatically on navigation | Via hook after compaction, or manually | Read by next Scout/Builder on boot |
| **Tone** | Reference manual | Running field notes | Post-mortem debrief |
| **Who writes** | Avi or Claude (rare) | Claude (prompted by PreCompact hook) | Autonomous agents before shutdown |

**CLAUDE.md** — one per space and optionally per project. Loads automatically. Static orientation.

**HANDOFF.md** — one per active project. Under 30 lines. Structure: current state / key decisions / what's next / gotchas. **Updated automatically before compaction via PreCompact hook** — so even abandoned sessions leave current handoffs. If no HANDOFF.md exists, the hook prompts Claude to create one.

**Seance logs** — for autonomous agents only (Scout/Builder). Written before shutdown, read on boot. YAML format at `Town-Hall/Scaffold/autodesk/seance-logs/`. Captures dead ends and reasoning that HANDOFF.md doesn't.

## Skills (~210 total)

~25 custom skills with model invocation ON (always in context). ~185 third-party (sci-*, gstack-*, acad-*) with model invocation OFF — invoke via `/slash-command`.

Key custom skills: `/research-sprint`, `/draft-it`, `/tweet-queue`, `/triage`, `/audit`, `/fact-check`, `/meeting`, `/network-scout`, `/opportunity-scan`, `/watchlist-monitor`, `/BOTEC-brief`, `/forethought-post`, `/health-check`, `/debugging-mode`.

## Workshop Guardrails

1. All outputs stay *inside* the project folder. Never scatter to root.
2. Use subfolders. Keep organized. Check periodically.
3. New versions: update in place, or move old to `old/`. No v1/v2/v3 accumulation.
4. Git checkpoints everything — be willing to clean up.
5. Take stock of what already exists before creating new files.

## Triage Colors

- 🥇 Gold → Core knowledge. Updates PREMISES.md + KEY_FINDINGS.md + creates wiki page + full cross-reference
- 🟢 Green → Solid knowledge. Creates wiki page + cross-references + links to Workshop projects
- 🟡 Yellow → Interesting but not now. Library/Someday/ with topic tags
- 🔴 Red → Discard. Delete (git preserves history)

## Writing Voice

~40% Sagan, ~40% Carlsmith, ~20% Ord + Avi. Full guide in `.claude/rules/writing-voice.md` (path-scoped to Workshop). Anti-patterns: mechanical transitions, safety-speak, over-hedging, em-dash overuse, prose walls, burying the lead.
