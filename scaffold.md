# scaffold.md

*Ground truth for all connections, I/O flows, and system integration. Maps how every module connects to every other module. Read this to understand the full plumbing.*

*v0.4 — 2026-04-25*

---

## System Map

```
                              World + Internet
                                ↕         ↑
                    ┌───────────┴──────┐  │
  CROSSROADS (NW)  │   HARBOR (N)     │  │  EMBASSY (NE)
  Network.md       │                  │  │  Forethought/
       ·           │  Inbox ←── World │  │  Stanford-EA/
         ·         │    ↓             │  │       ·
           ·       │  /triage         │  │     ·
             ·     │    ↓             │  │   ·
               ·   │ 🥇🟢 → wiki +   │  │ ·
                ·  │       cross-ref  │  │
                 · │ 🟡 → Someday    │──┘
                   │ 🔴 → Delete     │
                   │                  │
                   │  Dispatch ──→ World
                   │  agents/ log/    │
                   │  📬 watchlist    │
                   │  🎯 wanted      │
                   │  📋 todo        │
                   └──┬───────────┬──┘
                      │           │
   ┌──────────────────┘           └──────────────────┐
   │                                                  │
   │  TOWN HALL (W)              WORKSHOP (E)         │
   │  ┌──────────────┐          ┌──────────────┐      │
   │  │ User/Avi.md  │   ←───→  │ [projects]   │      │
   │  │ Agent.md     │ context  │ Complete/     │      │
   │  │ Scaffold/    │          │ backburner/   │      │
   │  │  skills      │          │ archived/     │      │
   │  │  hooks       │          │              │      │
   │  │  rules       │   wiki   │ HANDOFF.md ←─┼── PreCompact hook
   │  │  system-guide│  links   │   ↕          │      │
   │  └──────────────┘   ↕      └──────┬───────┘      │
   │                     │             │               │
   │               ┌─────┴─────────────┴─────┐         │
   │               │     LIBRARY (S)         │         │
   │               │                         │         │
   │               │  Knowledge-Graph/       │         │
   │               │    PREMISES.md ← 🥇     │         │
   │               │    KEY_FINDINGS.md      │         │
   │               │    index.md ← auto-sync │         │
   │               │    wiki/ ← 🥇🟢 pages   │         │
   │               │  Logs/                  │         │
   │               │    metadata/ ← hooks    │         │
   │               │    feedback-log ← hook  │         │
   │               │    PATTERNS.md ← weekly │         │
   │               │  Someday/ ← 🟡          │         │
   │               │  Archive/               │         │
   │               └─────────────────────────┘         │
   │                                                   │
   └── CLAUDE.md (@import system-guide) loads every session
       Rules path-scoped, hooks mechanical, skills on demand
```

**Automated flows:**
```
Overnight (Mac Mini):
  4:00 AM  Watchlist → Harbor/Inbox/
  4:20 AM  Opportunity scan → Harbor/Inbox/
  4:40 AM  Network scout → Harbor/Inbox/
  7:00 AM  /morning-briefing → Slack + Telegram + file

Weekly (Sunday):
  10:00 AM /memory-synthesis → clean memory + lint wiki index + PATTERNS.md

On every tool call:  PostToolUse hook → Library/Logs/metadata/
On "feedback":       UserPromptSubmit hook → Library/Logs/feedback-log.md
Before compaction:   PreCompact hook → Workshop/[project]/HANDOFF.md
On session start:    SessionStart hook → injects space orientation
```

---

## Module-by-Module I/O

### Harbor

**Inputs:**
| Source | What arrives | How |
|---|---|---|
| `/research-sprint` | Research notes | Deposited to `Harbor/Inbox/{topic}/` |
| `/opportunity-scan` (scout) | Opportunity reports | Deposited to `Harbor/Inbox/opportunity-scan-YYYY-MM-DD.md` |
| `/network-scout` (scout) | Networking proposals | Deposited to `Harbor/Inbox/network-scout-YYYY-MM-DD.md` |
| `/watchlist-monitor` (scout) | News alerts | Deposited to `Harbor/Inbox/watchlist-YYYY-MM-DD.md` |
| Manual | Anything Avi drops in | Placed directly in `Harbor/Inbox/` |
| Workshop (reverse flow) | Research gaps, questions | Deposited to `Harbor/Inbox/` with source: workshop-feedback |
| `/voice-capture` | Transcribed voice memos | Telegram voice messages → transcribe → `Harbor/Inbox/voice-memo-*.md` |

**Outputs (via Triage):**
| Destination | Condition | What happens |
|---|---|---|
| Library/Knowledge-Graph/wiki/ + Workshop | 🥇 Gold — core knowledge | Wiki page + PREMISES.md + KEY_FINDINGS.md + cross-ref + Workshop link |
| Library/Knowledge-Graph/wiki/ + Workshop | 🟢 Green — solid knowledge | Wiki page + cross-ref + Workshop link |
| Library/Someday/ | 🟡 Yellow — interesting but not now | Stored with topic tags |
| Delete | 🔴 Red — not useful | Removed (git preserves) |

**Outputs (via Dispatch):**
| Destination | What ships | How |
|---|---|---|
| Twitter | Tweet queue, threads | `/tweet-queue` → Typefully or direct post |
| EA Forum | Cross-posts, research notes | `/forethought-publish` (future: `/lesswrong-and-ea-forum`) |
| Email/outreach | Networking messages | `/network-scout` draft outreach |
| Telegram | Notifications, summaries | Scout agents notify via Telegram MCP |
| Web | Blog posts, papers | `/forethought-publish` |

**Internal files:**
| File | Purpose | Updated by |
|---|---|---|
| `todo.md` | Running to-do list | Avi + Claude manually |
| `watchlist.md` | Topics/people/institutions to monitor | `/watchlist-monitor` reads; Avi edits |
| `wanted.md` | Specific items waiting for | Avi edits; agents check periodically |
| `opportunities.md` | Actionable opportunities pipeline | `/opportunity-scan` deposits; Avi curates |

**Dispatch (mission control):**
| Component | Purpose |
|---|---|
| `Dispatch/agents/` | Agent definitions + playbooks (scout-opportunity, scout-network, scout-watchlist) |
| `Dispatch/scout-calibration.md` | Learned preferences from Avi's past ratings (colocated with scouts) |
| `Dispatch/instructions/` | Format templates, recipient rules, packaging standards |
| `Dispatch/log/` | Flight manifest — who was sent, when, what mission, what returned |

---

### Workshop

**Inputs:**
| Source | What arrives | How |
|---|---|---|
| Harbor/Triage | 🟢 Green items promoted to projects | Moved by `/triage` or manually |
| Direct work | Files created during project work | Claude + Avi working in project folders |
| Library | Reference material, prior research | Read/linked, not moved |

**Outputs:**
| Destination | What ships | How |
|---|---|---|
| Harbor/Dispatch | Finished content ready for distribution | Project Review → package via Dispatch |
| Library/Knowledge-Graph | Key findings from research projects | Manual or via 6R pipeline |
| Library/Logs | Session logs, metadata | Automatic (hooks) |
| Workshop/Complete | Shipped projects | Move whole project folder |
| Workshop/archived | Abandoned/paused projects | Move whole project folder |
| World | Published papers, posts, tweets | Via Harbor/Dispatch |

**Internal structure:**
```
Workshop/
  [project]/            ← active (top-level)
    HANDOFF.md          ← living handoff, auto-updated before compaction
    CLAUDE.md           ← project-specific context (optional)
    [organic subfolders]
  Complete/             ← shipped projects
  backburner/           ← paused projects
  archived/             ← abandoned/completed, restorable
```

---

### Library

**Inputs:**
| Source | What arrives | How |
|---|---|---|
| Harbor/Triage (🥇 Gold) | Wiki page + PREMISES + KEY_FINDINGS | Created by `/triage` → Library/Knowledge-Graph/wiki/ |
| Harbor/Triage (🟢 Green) | Wiki page + cross-references | Created by `/triage` → Library/Knowledge-Graph/wiki/ |
| Harbor/Triage (🟡 Yellow) | Someday ideas | Moved by `/triage` → Library/Someday/ |
| Hooks | Session metadata, feedback | Automatic (PostToolUse, UserPromptSubmit, SubagentStart) |
| `/save-conversation` | Conversation transcripts | Manual invocation → Library/Conversations/ |
| `/memory-synthesis` | Cleaned memory + synthesis log | Weekly Sunday → memory files + Library/Logs/PATTERNS.md |
| `/pattern-synthesis` | Weekly pattern analysis | Cron/manual → Library/Logs/PATTERNS.md |

**Outputs:**
| Destination | What's read | How |
|---|---|---|
| Workshop | PREMISES.md, KEY_FINDINGS.md, prior research | Claude reads when working on projects |
| Harbor/Triage | PREMISES.md (grounds triage decisions) | `/triage` reads at start |
| Taste convergence loop | Logs, feedback, metadata | `/pattern-synthesis` reads weekly |

**Internal structure:**
```
Library/
  Knowledge-Graph/
    PREMISES.md         ← constitution (amend only with Avi's approval)
    KEY_FINDINGS.md     ← canonical Gold-tier claims
    index.md            ← catalog of all wiki pages (read first when searching)
    log.md              ← chronological ingest/query record
    wiki/               ← compiled synthesis pages (Karpathy pattern, compounds over time)
  Space-Energy/         ← topic collection: strategy notes, reference material
  Governance/           ← topic collection: political dossiers, old drafts
  Business/             ← topic collection: Seed plan, corporate structures
  Logs/
    avi-log.md          ← session log
    claude-log.md       ← session log
    PATTERNS.md         ← weekly pattern synthesis output
    feedback-log.md     ← auto-captured (UserPromptSubmit hook)
    metadata/           ← daily JSONL tool usage logs (PostToolUse + SubagentStart hooks)
  Conversations/
    transcripts/        ← exported via /save-conversation (YAML frontmatter + *Avi:*/*Claude:* format)
    calibration-sessions/ ← historical Claude calibration transcripts
  Someday/              ← 🟡 Yellow triage items, ideas not yet projects
  Archive/              ← completed/superseded material, old scouts
```
*New topic folders created organically as agents bring back material.*

---

### Town Hall

**Inputs:**
| Source | What arrives | How |
|---|---|---|
| User | Identity updates, preference changes | Avi edits User.md |
| Claude | Observations, relationship notes | Claude updates Agent.md |
| Setup wizard | Initial configuration | `/setup` skill |

**Outputs:**
| Destination | What's read | How |
|---|---|---|
| Every session | CLAUDE.md + system-guide.md (@import) | Auto-loaded at startup |
| Every space | Subdirectory CLAUDE.md files | Loaded on navigation |
| Scout agents | Agent.md, scout-calibration.md, playbooks | Read at boot |
| All work | Rules (.claude/rules/) | Auto-loaded, path-scoped |

**Internal structure:**
```
Town-Hall/
  User/
    Avi.md              ← full identity, interests, calibration (agents read this)
    instructions-for-avi.md ← Claude's notes FOR Avi (Avi reads this)
    Personal-Dev/       ← debugging logs, goals, habits
    Aesthetics/         ← UI/UX, design systems
    Web-Presence/       ← websites
    Life-Admin/
  Scaffold/
    CLAVI-SPEC.md       ← full specification
    system-guide.md     ← @imported by CLAUDE.md every session
    knowledge-graph/    ← interactive workspace visualization
    autodesk/           ← multi-agent orchestration + seance logs
    [submodules]        ← gstack, sci-skills, academic, forethought, tob
    voice-io-pipeline.md ← planned voice I/O + email integration
  Agent.md              ← Claude's identity, observations
```

---

### Embassy

**Inputs/Outputs:**
| Flow | What | How |
|---|---|---|
| Forethought → us | Shared standards, style guides, team updates | Submodule link + local admin docs |
| Us → Forethought | Published research, contributions | Via Harbor/Dispatch |
| Stanford EA → us | Club materials, org admin | Direct files |
| Us → Stanford EA | Event planning, content | Direct files |

---

### Crossroads

**Inputs/Outputs:**
| Flow | What | How |
|---|---|---|
| Collaborator repos | Updates, new research | (Future) submodule watch + alerts |
| Us → collaborators | Shared dispatch, research | (Future) custom dispatch rules |
| Network.md | Contact context, relationship notes | Manual updates |

---

## Three Context Documents

| | CLAUDE.md | HANDOFF.md | Seance Log |
|---|---|---|---|
| **Purpose** | "What is this place?" | "What's happening right now?" | "What did the last agent try?" |
| **Changes** | Rarely | Every session (via PreCompact hook) | Per autonomous agent session |
| **Content** | Folder contents, conventions, pointers | In progress, what's next, gotchas | Dead ends, reasoning, what failed |
| **Loaded** | Automatically on navigation | Via hook after compaction | Read by next Scout/Builder on boot |
| **Who writes** | Avi or Claude (rare) | Claude (prompted by hook) | Autonomous agents before shutdown |

## Three Instruments

```
Rules  = "you should do X"     (standing orders — .claude/rules/, path-scoped)
Hooks  = "X is enforced"       (tripwires — settings.json, mechanical)
Skills = "here's how to do X"  (tool manuals — .claude/skills/, on demand)
```

## Triage Routing (Color System)

```
Harbor/Inbox/ → /triage reads PREMISES.md → proposes color → Avi decides
  🥇 Gold → PREMISES.md + KEY_FINDINGS.md + wiki page + cross-ref + reweave + Workshop link
  🟢 Green → wiki page + cross-ref + Workshop link + optionally KEY_FINDINGS
  🟡 Yellow → Library/Someday/ (topic tagged, no wiki page)
  🔴 Red → Delete (git preserves history)
```

**Bidirectional linking (Gold + Green):**
- Wiki page frontmatter includes `projects: [Workshop/project/]`
- Workshop project HANDOFF.md includes `Wiki: [[topic-slug]]`
- index.md tracks all pages + project associations
- memory-synthesis lint checks for broken links weekly

## Hooks — System Nervous System

| Hook | Trigger | Reads from | Writes to |
|---|---|---|---|
| PreCompact | Before compaction | Current project context | Workshop/[project]/HANDOFF.md |
| SessionStart | Startup + after compact | Workshop/[project]/HANDOFF.md | Context injection |
| PostToolUse (async) | Every tool call | Tool input metadata | Library/Logs/metadata/*.jsonl |
| UserPromptSubmit (async) | User says "feedback" | User message | Library/Logs/feedback-log.md |
| SubagentStart (async) | Agent spawn | Session metadata | Library/Logs/metadata/*.jsonl |
| PreToolUse: Bash | Bash commands | Command text | Blocks dangerous commands |
| PreToolUse: reply | Telegram sends | File attachments | Blocks credential sends |
| Notification + Stop | Events | — | macOS notifications |

## Skills — By Flow

### Inbound (Harbor/Inbox)
- `/research-sprint` → Harbor/Inbox/{topic}/
- `/opportunity-scan` → Harbor/Inbox/opportunity-scan-*.md
- `/network-scout` → Harbor/Inbox/network-scout-*.md
- `/watchlist-monitor` → Harbor/Inbox/watchlist-*.md
- `/triage` processes Harbor/Inbox/ → routes to Workshop/Library/Delete

### Outbound (Harbor/Dispatch)
- `/tweet-queue` → generates Twitter content
- `/forethought-publish` → publication pipeline
- `/forethought-diagrams` → branded figures
- `/draft-it` → first drafts in Avi's voice

### Workshop (active project work)
- `/audit` → reviews/ subfolder in active project
- `/fact-check` → reviews/ subfolder in active project
- `/BOTEC-brief` → output in active project
- `/proofread` → edits in place
- `/forethought-style` → style checking

### Library (memory + analysis)
- `/save-conversation` → Library/Conversations/
- `/memory-synthesis` → cleans memory files + Library/Logs/PATTERNS.md (weekly Sunday)
- `/pattern-synthesis` → Library/Logs/PATTERNS.md
- `/debugging-mode` → interactive, references Library context

### Daily Operations
- `/morning-briefing` → reads calendar + todo + inbox + scouts + projects → Slack DM + Telegram + file (daily 7am)
- `/voice-capture` → Telegram voice messages or audio files → transcribe → extract todos/ideas → Harbor/Inbox/

### Epistemic Tools
- `/ask-many-times` (10 instances), `/ask-many-ways` (10 framings + 10 sycophancy), `/ask-many-contexts` (scaffold vs vanilla vs zero)
- `/ask-many-models` (GPT + Claude + Gemini + Grok), `/ask-mega` (50 identical + 50 variant + 10 leading = 110 total)
- `/explore-tree` (recursive branching from any input), `/decompose` (hard Q → answerable sub-Qs)
- `/adversarial-prompt`, `/premise-audit`, `/steelman-duel`, `/consensus-check`, `/blind-review`
- `/epistemax` → chains all 5 above into master epistemic audit

### Meta (Town Hall)
- `/setup` → configures entire scaffold (interactive wizard)
- `/health-check` → verifies integrity

### Creative (Workshop/Songs)
- `/songwriting` → Workshop/Songs/
- `/sample-extraction` → Workshop/Songs/samples/

## Automated Schedules (Mac Mini)

| Time | Agent | What |
|---|---|---|
| 3:30 AM | git pull | Sync files from laptop |
| 3:35 AM | qmd update + embed | Refresh semantic search index |
| 4:00 AM | Watchlist monitor | Scan overnight news |
| 4:20 AM | Opportunity scan | Find new opportunities |
| 4:40 AM | Network scout | Identify connection targets |
| 5:00 AM | Inbox monitor | Count pending items |
| 7:00 AM | Morning briefing | Synthesize all → Slack + Telegram + file |
| Sunday 10 AM | Memory synthesis | Clean memory, promote feedback, lint knowledge graph |

## Search Infrastructure

**QMD** (on-device semantic search): 3,042 files indexed, 20,860 chunks embedded. BM25 + vector + reranker. MCP server at `qmd mcp`. Incremental updates via `qmd update && qmd embed`.

---

## Changelog

| Version | Date | Notes |
|---|---|---|
| v0.4 | 2026-04-25 | Wiring audit: triage outputs updated to Gold/Green/Yellow/Red, voice-capture as Harbor input, memory-synthesis as Library input, wiki layer in Library structure, Workshop/Complete (was finished), all cross-references verified |
| v0.3 | 2026-04-25 | Phase 6 additions: morning briefing, memory synthesis, wiki system (Gold/Green/Yellow/Red), epistemic tools (12 skills), voice capture, QMD, automated schedules, dispatch templates |
| v0.2 | 2026-04-23 | Post-overhaul update: Three Context Documents, Three Instruments, triage routing detail, Dispatch mission control, Library topic collections, Town-Hall corrected structure, Avi.md naming, colocated calibration |
| v0.1 | 2026-04-23 | Initial creation — full module I/O map, hooks, skills by flow |
