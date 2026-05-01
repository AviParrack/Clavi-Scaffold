# Clavi Overhaul — Running Notes

*Living doc. Captures decisions, open questions, and progress from the overhaul conversation. Read this to resume context.*
*Started: 2026-04-18 | Last updated: 2026-04-22*

---

## Decisions Made

### Naming (final)
- **Town Hall** (West) — identity, personal spaces, scaffold
- **Harbor** (North) — intake, filtering, routing, dispatch
- **Workshop** (East) — active work, projects
- **Library** (South) — long-term memory
- **Embassy** (Northeast, top-level) — org-specific folders (Forethought, Stanford EA)
- **Crossroads** (Northwest, top-level) — personal network, collaborator repos, shared dispatch
- Above all: **World + Internet**

### Lab Is Dissolved
- Lab ceases to exist as a space
- Active research with output goals → Workshop (as projects)
- Reference material, accumulated knowledge → Library
- Inbox/intake → Harbor
- If unclear which, ask Avi for classification

### Workshop Structure
- Each project is a self-contained "workshop" — a building you walk into
- Everything for that project lives inside: research reports, BOTECs, drafts, iterations, plots
- **Nesting resolves the status question:**

```
Workshop/
  SDC/                      ← active (top-level = active)
  Twitter/                  ← active
  space-energy-IE/          ← active
  backburner/
    Blog/                   ← paused, will return
    Lighthouse-dashboard/   ← waiting on capabilities
  archived/
    Movements/              ← completed or abandoned, restorable
```

- Active projects live at root of Workshop/
- Back burner and archived are nested subdirectories
- Moving a project between tiers = moving its folder
- **Completed content:** final shipped versions aggregated somewhere (TBD — maybe a `shipped/` section or within each workshop)
- After a project fully ships and wraps, the whole workshop archives to `Workshop/archived/`
- Songs is a workshop

### Triage Colors (for new incoming items)
- 🟢 Green → queue as project (active or back burner in Workshop)
- 🟡 Yellow → Someday (Library — vague ideas, not yet projects)
- 🔴 Red → delete

### Harbor — Bidirectional Filter

**Inbound: Triage**
- Current triage skill, research intake, filtering, routing
- Well-developed, works well

**Outbound: Dispatch**
- Packaging layer for shipping work to the world
- Twitter summaries, EA Forum cross-posts, distribution tasks
- Also: sending agents out to scout, research, etc.
- Stores: custom instructions for dispatch tasks, dispatch log
- Skills to be built for common dispatch patterns

**Physical structure:**
```
Harbor/
  Inbox/              ← landing zone
  Triage/             ← inbound processing (or just the /triage skill acting on Inbox)
  Dispatch/           ← outbound packaging + agent deployment
    instructions/     ← format guides, recipient lists, templates
    log/              ← record of what was dispatched when
```

**Skill architecture decision:** Skills stay in `.claude/skills/` (native discovery). Contextual instructions and templates live spatially in Harbor/Dispatch/instructions/. Skills *reference* the contextual files. This way Claude finds tools natively, humans find context spatially.

### Town Hall Contents
- User/ (User.md, personal identity)
  - Web Presence
  - Personal Dev
  - Life Admin
  - Aesthetics
- Scaffold/ (Clavi system itself — config, rules, docs, submodules)
- Agent.md (single file — Claude's identity, observations, the relationship)

### Agents — Ephemeral, Not Persistent
- No persistent named agents. Agents are ephemeral — spun up for a task, given skills, dissolved.
- "Get a skeptical agent to look this over" = ad hoc, not a stored persona.
- One Agent.md for the base Claude relationship (replaces current Bridge/Claude/ contents).
- Skills handle capability differentiation; Agent.md handles the ongoing relationship.

### ToDo System
- MASTER_TODO.md not working well
- Vision: V1 — `/morning-briefing` skill (calendar + active workshops + running todo + daily summary)
- Write spec and todo item during this overhaul, build it during the all-nighter or as a follow-up
- Eventually V2: auto-adding from email, calendar-aware scheduling

### Embassy — Top Level
```
Embassy/
  Forethought/        ← links to forethought-starter submodule + local admin
  Stanford-EA/
```
Top-level, northeast. Their own scaffolding, eventually reachable from Clavi. Forethought getting its own complex scaffold (Finn + Avi building).

### Library Internal Structure
```
Library/
  Knowledge-Graph/    ← PREMISES.md, KEY_FINDINGS.md, structured claims
  Logs/               ← session logs, pattern synthesis, calibration
  Conversations/      ← stored chat transcripts
  Someday/            ← vague ideas that aren't projects yet (🟡 yellow-light items)
  Archive/            ← completed/abandoned projects, superseded material
```

- **Someday** ≠ backburner workshops. Someday = ideas/items that haven't been promoted to project status. Backburner = defined projects that are paused.
- **Archive** holds whole archived workshop folders + any reference material
- **Delete** is an action, not a location — things get deleted, not filed

### Smaller Items
- `lib/` = JS vendor libs for knowledge graph viz. Absorb into relevant workshop.
- `Public-Repo/` = defer until scaffold stable. Then distill: scaffold minus personal, plus setup guide.
- `Lab/Project-Ideas/` → filter through triage → Workshop queue or Someday
- `Workshop/Songs/` → `Workshop/Songs/` (a workshop)

---

## Resolved (round 2)

### Workshop Internal Organization
- **Organic, not templated.** Projects vary too much for a rigid skeleton.
- **Guardrails instead of templates:**
  1. All outputs for a project stay *inside* that project's folder. Never scatter to root.
  2. Use subfolders. Keep things organized. Check periodically.
  3. When creating a new version: update the original file in place, OR archive the old version to an `old/` subfolder. Don't accumulate v1/v2/v3/v4 at the same level.
  4. Git checkpoints everything — be willing to clean up and delete old junk.
  5. Claude should periodically take stock of what already exists in a workshop before creating new files.

### Shipped/Finished Content
- **`Workshop/Complete/`** — when an active project ships, move it here.
- Workshop/ root shows only currently active projects.
- Three sub-tiers visible when you open Workshop/:
  - Individual project folders (= active)
  - `Complete/`
  - `backburner/`
  - `archived/`

### Lab Content Classification
| Current | Decision |
|---|---|
| `Lab/Space-Energy/` | → `Workshop/Space-Energy/` (active) |
| `Lab/AI-Agents/` | → `Workshop/AI-Agents/` (active) |
| `Lab/Compute/` | → `Workshop/Compute/` (active) |
| `Lab/Governance/` | → `Workshop/Governance/` (active) |
| `Lab/Movements/` | → `Workshop/archived/Movements/` (was 📦) |
| `Lab/Forethought-Admin/` | → `Embassy/Forethought/` |
| `Lab/Project-Ideas/` | → triage → Someday or Workshop |

### Migration Strategy
Avi's plan:
1. Push everything
2. Wait for Mac Mini upload
3. Pull to sync both machines
4. Checkpoint
5. **Pre-migration research phase (~30-60 min):** deep crawl of Anthropic docs (skills guide, best practices, settings, hooks, everything) + Twitter for advanced usage patterns. Verify we're aligned with best practices and not missing low-hanging fruit.
6. Write migration plan
7. Execute: create new folders → migrate files → update references → test

## Research Phase Decisions (2026-04-22)

### Skill Budget Fix (CRITICAL)
- We are **8.5x over** the skill description token budget (68,517 chars vs ~8,000 budget)
- **Fix:** Add `disable-model-invocation: true` to ALL third-party skills (sci-*, gstack-*, acad-*)
- Keep model invocation ON for custom skills (~25) that are integral to the scaffold
- These third-party skills remain available via `/slash-command` — they just don't consume description budget

### CLAUDE.md Architecture
- Use `@path` imports to keep root CLAUDE.md under 100 lines while importing reference material
- `@path` references expand inline at launch — every instance reads full content, but files stay modular
- **Subdirectory CLAUDE.md files stack** — Claude reads root + every CLAUDE.md in the directory chain to the file it's working on
- Each space (Harbor, Town Hall, Workshop, Library) gets its own navigation CLAUDE.md

### Path-Scoped Rules
- citation-standards.md → scope to Workshop/** and Library/**
- writing-voice.md → scope to Workshop/** (writing projects)
- space-research.md → scope to Workshop/Space-Energy/**
- New dispatch rules → scope to Harbor/Dispatch/**

### Hooks to Add During Migration
1. **PreCompact** — prompt Claude to update the current project's HANDOFF.md before compaction
2. **SessionStart (compact matcher)** — re-inject HANDOFF.md and key context after compaction
3. **SessionStart (startup matcher)** — inject which space you're in + active workshop context
4. **PostToolUse (async)** — metadata logger: tool name, timestamp, active workshop, files touched, skill invocations, session ID
5. **UserPromptSubmit** — feedback capture: when user says "feedback" or `<feedback>`, append the quoted feedback to `Library/Logs/feedback-log.md` for pattern synthesis

### Agent Teams — Hybrid Approach
- Enable experimentally for interactive Desk sessions (parallel exploration)
- Keep autodesk for cron-driven Scout/Builder (Agent Teams has no scheduling)
- Wait for session resumption before deeper adoption
- Future: use Agent Teams *inside* Builder for parallelizable subtasks

### QMD — Follow-Up (Not This Migration)
- On-device semantic search via MCP. High value for parallel agents + cold-start orientation.
- ~15 min setup, entirely local, zero ongoing cost. Use HTTP daemon mode.
- Schedule as a follow-up after spatial migration is stable.

### Living Handoffs (replaces static HANDOFF.md)
- Each workshop's subdirectory CLAUDE.md points to its HANDOFF.md
- HANDOFF.md is a **compressed running log**: what's been done, what remains, key decisions, gotchas
- **PreCompact hook** prompts Claude to update the HANDOFF before compaction happens
- This solves the staleness problem: handoffs get updated automatically whenever context is about to be lost
- For interactive sessions: Avi often leaves conversations open for weeks. The PreCompact trigger ensures that whenever Claude is about to lose context, it writes down what it knows first.
- For autonomous sessions (Scout/Builder): still use seance logs (structured session-end dump) via boot doc instructions

### Session Staleness Detection
- The metadata logger tracks session IDs + timestamps
- Weekly `/memory-synthesis` or `/pattern-synthesis` flags sessions with no activity for 30+ days
- Stale sessions' HANDOFF.md files are still valid (because PreCompact updated them) — the session can die, the handoff survives

### Feedback Capture Hook
- **UserPromptSubmit hook** checks if user message contains "feedback", `<feedback>`, or "I'm giving feedback"
- Extracts the feedback content and appends to `Library/Logs/feedback-log.md` with timestamp
- Weekly pattern synthesis skill reads feedback-log.md for recurring themes
- This replaces the current pattern of manually saving feedback memories — it's automatic and comprehensive

### Memory-Synthesis Automation
- Rename concept from `/dream` to `/memory-synthesis`
- Periodic consolidation: resolve contradictions, convert relative dates, merge duplicates
- Run as cron/scheduled task (weekly, alongside pattern synthesis)

### Karpathy Wiki Feedback Loop
- When a query produces a good synthesis, save it as a new Library page
- Explorations compound rather than disappearing into conversation history
- Integrate with 6R pipeline: promoted queries → Library/Knowledge-Graph/

## Resolved (from earlier rounds)

### Repo Name
- Keep `Avi-Claude` as private repo. `Clavi` is the public distillation.

### Miscellaneous Root Items
- `.gstack/` → fold into Town-Hall/Scaffold/ if possible
- `Bridge/SCAFFOLD-GUIDE.md` → absorb useful bits into CLAVI-SPEC.md, retire
- `Bridge/Claude/PATTERNS.md` → Library/Logs/PATTERNS.md

### Submodule Paths
Git submodules have hardcoded paths. Moving `Bridge/Scaffold/gstack/` to `Town-Hall/Scaffold/gstack/` means updating `.gitmodules`. Same for all 5 submodules. Not hard, just needs care.

---

## Final Folder Structure (DEFINITIVE)

```
Avi-Claude/                         (repo root, private)
├── CLAUDE.md                       ← slim router, < 100 lines, @imports
├── README.md                       ← public-facing
│
├── .claude/                        ← native Claude Code config (hidden)
│   ├── settings.json               ← permissions, hooks
│   ├── settings.local.json         ← machine-specific overrides
│   ├── rules/                      ← behavioral constraints (path-scoped)
│   │   ├── citation-standards.md   ← paths: Workshop/**
│   │   ├── commit-style.md         ← global
│   │   ├── forethought-default.md  ← paths: Workshop/**
│   │   ├── research-premises.md    ← global
│   │   ├── space-research.md       ← paths: Workshop/Space-Energy/**
│   │   ├── writing-voice.md        ← paths: Workshop/**
│   │   └── dispatch.md             ← paths: Harbor/Dispatch/** (NEW)
│   ├── skills/                     ← all skills (native discovery)
│   │   ├── [~25 custom skills]     ← model-invocation ON
│   │   └── [~185 third-party]      ← disable-model-invocation: true
│   ├── agents/
│   │   └── style-reviewer.md
│   └── projects/                   ← auto-memory lives here
│       └── -Users-aviparrack-Avi-Claude/
│           └── memory/
│
├── Harbor/                         N O R T H — intake + dispatch
│   ├── CLAUDE.md                   ← navigation index for this space
│   ├── Inbox/                      ← landing zone (from Lab/inbox/)
│   ├── Dispatch/                   ← outbound packaging + agent deployment
│   │   ├── instructions/           ← format guides, templates
│   │   └── log/                    ← record of dispatches
│   ├── watchlist.md                ← topics/people/institutions to monitor (NEW)
│   ├── wanted.md                   ← specific things waiting for (NEW)
│   └── todo.md                     ← running to-do list (from MASTER_TODO.md)
│
├── Town-Hall/                      W E S T — identity + infrastructure
│   ├── CLAUDE.md                   ← navigation index for this space
│   ├── User/                       ← identity, preferences, taste
│   │   ├── User.md                 ← (from Bridge/Avi/Avi.md)
│   │   ├── Web-Presence/           ← (from Workshop/Websites/)
│   │   ├── Personal-Dev/           ← (from Bridge/Avi/Personal Dev/)
│   │   ├── Life-Admin/             ← (NEW, placeholder)
│   │   └── Aesthetics/             ← (from Workshop/Aesthetics/)
│   ├── Scaffold/                   ← the Clavi system itself
│   │   ├── CLAVI-SPEC.md
│   │   ├── CLAVI-OVERHAUL-NOTES.md
│   │   ├── clavi-architecture.svg
│   │   ├── autodesk/               ← multi-agent orchestration
│   │   │   ├── seance-logs/        ← structured session handoffs (NEW)
│   │   │   └── [existing autodesk files]
│   │   ├── gstack/                 ← submodule
│   │   ├── claude-scientific-skills/ ← submodule
│   │   ├── academic-research-skills/ ← submodule
│   │   ├── forethought-starter/    ← submodule
│   │   ├── trailofbits-config/     ← submodule
│   │   └── [other scaffold infra]
│   └── Agent.md                    ← (from Bridge/Claude/ — unified)
│
├── Workshop/                       E A S T — active work
│   ├── CLAUDE.md                   ← navigation index for this space
│   │                               ← TOP-LEVEL = ACTIVE PROJECTS:
│   ├── SDC/                        ← (from Workshop/Space/SDC/)
│   ├── Twitter/                    ← (from Workshop/Twitter/)
│   ├── Space-Energy/               ← (from Lab/Space-Energy/)
│   ├── AI-Agents/                  ← (from Lab/AI-Agents/)
│   ├── Compute/                    ← (from Lab/Compute/)
│   ├── Governance/                 ← (from Lab/Governance/)
│   ├── AI-Character/               ← (from Workshop/AI-Character/)
│   ├── Songs/                      ← (from Workshop/Songs/)
│   ├── Complete/                   ← shipped projects
│   ├── backburner/                 ← paused projects
│   │   ├── Blog/                   ← (from Workshop/Blog/)
│   │   ├── Lighthouse/             ← (from Workshop/Lighthouse/)
│   │   └── Websites/               ← pointer only; bulk in Town-Hall/User/
│   └── archived/                   ← abandoned/completed, restorable
│       └── Movements/              ← (from Lab/Movements/)
│
├── Library/                        S O U T H — long-term memory
│   ├── CLAUDE.md                   ← navigation index for this space
│   ├── Knowledge-Graph/
│   │   ├── PREMISES.md             ← (from Bridge/PREMISES.md)
│   │   └── KEY_FINDINGS.md         ← (from Bridge/KEY_FINDINGS.md)
│   ├── Logs/
│   │   ├── avi-log.md              ← (from Bridge/Avi/avi-log.md)
│   │   ├── claude-log.md           ← (from Bridge/Claude/claude-log.md)
│   │   ├── PATTERNS.md             ← (from Bridge/Claude/PATTERNS.md)
│   │   └── feedback-log.md         ← auto-captured feedback (NEW)
│   ├── Conversations/              ← stored transcripts
│   ├── Someday/                    ← 🟡 ideas not yet projects
│   │   └── [from Lab/Project-Ideas/ after triage]
│   └── Archive/                    ← completed/superseded material
│       └── [from Lab/Archive/]
│
├── Embassy/                        N O R T H E A S T — external orgs
│   ├── Forethought/                ← (from Lab/Forethought-Admin/ + submodule link)
│   └── Stanford-EA/                ← (from Workshop/Stanford-EA/)
│
└── Crossroads/                     N O R T H W E S T — personal network
    └── Network.md                  ← (from Town-Hall/User/Network.md)
```

---

## Master Plan — Scaffold v2 Overhaul

*Full step-by-step plan. Steps marked with session target (today vs follow-up).*

### Phase 0: Planning (DONE)

| # | Step | Status | Notes |
|---|---|---|---|
| 0.1 | Checkpoint current state | ✅ | tag: `scaffold-overhaul-checkpoint-2026-04-18` |
| 0.2 | Design philosophy (10 principles) | ✅ | In CLAVI-SPEC.md |
| 0.3 | Compass architecture (4 spaces) | ✅ | Harbor / Town Hall / Workshop / Library |
| 0.4 | SVG diagram | ✅ | Needs name update to final names |
| 0.5 | Landscape research (top 10 scaffolds) | ✅ | everything-claude-code, Ruflo, DoorDash, Karpathy, etc. |
| 0.6 | Current scaffold audit (211 skills) | ✅ | All healthy, automation dormant |
| 0.7 | CLAVI-SPEC.md v0.1 | ✅ | Philosophy + architecture skeleton |
| 0.8 | Resolve all design questions | ✅ | Naming, nesting, Lab dissolution, Dispatch, Orgs, Library |
| 0.9 | Anthropic docs deep crawl | ✅ | Skill budget crisis, @imports, hooks, path-scoped rules |
| 0.10 | Twitter/engineer research | ✅ | Karpathy wiki, Boris 100-line CLAUDE.md, seancing, QMD |
| 0.11 | Hooks deep dive | ✅ | 28 events, 4 types, practical examples |
| 0.12 | Agent Teams / QMD / Seancing explainers | ✅ | Hybrid approach, follow-up, lightweight version |

### Phase 1: Pre-Migration Setup (TODAY)

| # | Step | Status | Notes |
|---|---|---|---|
| 1.1 | Update CLAVI-SPEC.md to v0.2 | 🔲 | Incorporate all decisions + research findings |
| 1.2 | Update SVG diagram with final names | 🔲 | Town Hall, Harbor, Workshop, Dispatch |
| 1.3 | Finalize folder structure | 🔲 | Review proposed tree one more time |
| 1.4 | Sync + checkpoint | 🔲 | Push, pull Mac Mini, fresh checkpoint |
| 1.5 | Write detailed file migration map | 🔲 | Every current path → new path |

### Phase 2: Spatial Migration (TODAY)

| # | Step | Status | Notes |
|---|---|---|---|
| 2.1 | Create new top-level folders | 🔲 | Harbor/, Town-Hall/, Workshop/, Library/, Embassy/ |
| 2.2 | Move Bridge/ → Town-Hall/ | 🔲 | Avi/ → User/, Claude/ → Agent.md, Scaffold/ stays |
| 2.3 | Move Lab/ → Workshop/ + Library/ | 🔲 | Active topics → Workshop, Movements → archived, Forethought-Admin → Embassy |
| 2.4 | Move Workshop/ → Workshop/ | 🔲 | Rename + reorganize (active/backburner/archived) |
| 2.5 | Create Harbor/ structure | 🔲 | Inbox/ (from Lab/inbox), Dispatch/, todo.md |
| 2.6 | Create Library/ structure | 🔲 | Knowledge-Graph/, Logs/, Conversations/, Someday/, Archive/ |
| 2.7 | Create Embassy/ structure | 🔲 | Forethought/, Stanford-EA/ |
| 2.8 | Move PREMISES.md, KEY_FINDINGS.md → Library/Knowledge-Graph/ | 🔲 | |
| 2.9 | Move logs → Library/Logs/ | 🔲 | avi-log, claude-log, PATTERNS.md |
| 2.10 | Absorb lib/ into relevant workshop | 🔲 | JS vendor libs for knowledge graph viz |
| 2.11 | Clean up empty old directories | 🔲 | Remove Bridge/, Lab/, Workshop/ after migration |
| 2.12 | Update .gitmodules for new submodule paths | 🔲 | 5 submodules to re-path |
| 2.13 | Verify all symlinks still resolve | 🔲 | 191 skill symlinks |

### Phase 3: Context Optimization (TODAY)

| # | Step | Status | Notes |
|---|---|---|---|
| 3.1 | Rewrite CLAUDE.md (< 100 lines, @imports) | 🔲 | Identity + working style + active projects + @imports |
| 3.2 | Create imported reference files | 🔲 | folder-map.md, collaboration-patterns.md, etc. |
| 3.3 | Write subdirectory CLAUDE.md per space | 🔲 | Harbor/, Town-Hall/, Workshop/, Library/ navigation indexes |
| 3.4 | Add `disable-model-invocation: true` to ~185 skills | 🔲 | All sci-*, gstack-*, acad-* |
| 3.5 | Path-scope rules files | 🔲 | citation-standards, writing-voice, space-research |
| 3.6 | Create Dispatch rules | 🔲 | Standing packaging standards for outbound content |

### Phase 4: Infrastructure (TODAY if time, else follow-up)

| # | Step | Status | Notes |
|---|---|---|---|
| 4.1 | Add hook: PreCompact — auto-update HANDOFF.md | 🔲 | Prompts Claude to update project handoff before compaction |
| 4.2 | Add hook: SessionStart (compact) — context re-injection | 🔲 | Re-inject HANDOFF.md + key context after compaction |
| 4.3 | Add hook: SessionStart (startup) — space orientation | 🔲 | Inject which space you're in, active workshop context |
| 4.4 | Add hook: PostToolUse (async) — metadata logger | 🔲 | Tool, timestamp, workshop, files, skills, session ID |
| 4.5 | Add hook: UserPromptSubmit — feedback capture | 🔲 | Detect "feedback" keyword, append to Library/Logs/feedback-log.md |
| 4.6 | Build seance log template (YAML) | 🔲 | For autonomous agents (Scout/Builder) |
| 4.7 | Update Scout/Builder boot docs with seance protocol | 🔲 | Write before shutdown, read on startup |

### Phase 5: Testing + Commit (TODAY)

| # | Step | Status | Notes |
|---|---|---|---|
| 5.1 | Smoke test: all symlinks resolve | 🔲 | Run after each phase, not just at end |
| 5.2 | Smoke test: CLAUDE.md loads correctly with @imports | 🔲 | |
| 5.3 | Smoke test: subdirectory CLAUDE.md files load on navigation | 🔲 | |
| 5.4 | Smoke test: skill invocations still work | 🔲 | Test 3-5 custom skills + 2-3 /sci- slash-commands |
| 5.5 | Smoke test: hooks fire correctly | 🔲 | |
| 5.6 | Smoke test: all internal references/links resolve | 🔲 | Grep for old paths (Bridge/, Lab/, Workshop/) |
| 5.7 | Update all HANDOFF.md files with new paths | 🔲 | |
| 5.8 | Write system explainer (for Avi, future Claudes, Forethought team) | 🔲 | How it all fits together — the onboarding doc |
| 5.9 | Commit + push | 🔲 | |

### Phase 6: Follow-Up (LATER)

**Skills & Automation:**

| # | Step | Status | Notes |
|---|---|---|---|
| 6.1 | Build /morning-briefing skill | ✅ | Calendar + todo + inbox + scouts + Slack DM + Telegram + file. Overnight scout schedule (4-5am). |
| 6.2 | Build /memory-synthesis automation | ✅ | Weekly Sunday 10am. 6 operations: dates, duplicates, contradictions, stale, feedback→memory, metadata insights. |
| 6.3 | Karpathy wiki feedback loop | ✅ | wiki/, index.md, log.md. Triage creates wiki pages on Gold/Green. Bidirectional Workshop↔Library linking. New color system (Gold/Green/Yellow/Red). |
| 6.4 | Dispatch integration for tweet-queue + publish | ⏸️ DEFERRED | Waiting for Finn collab on Forethought org scaffold. Infrastructure ready (Dispatch/log). |
| 6.5 | Create HANDOFF.md for 6 active Workshop projects | ✅ | Covered by PreCompact hook — auto-creates on first compaction in each project. |

**Infrastructure:**

| # | Step | Status | Notes |
|---|---|---|---|
| 6.6 | Set up QMD (on-device semantic search) | ✅ | 3,042 files indexed, 20,860 chunks embedded. MCP server configured. Setup instructions in /setup wizard. |
| 6.7 | Enable Agent Teams experimentally | ⏸️ DEFERRED | Immature — no session resumption, one team per session. Revisit when it matures. Autodesk covers the use case. |
| 6.8 | Autodesk overhaul (separate project) | 🔲 | Evaluate Agent Teams hybrid, update boot docs |
| 6.9 | Make visualization tools dynamic | 🔲 | knowledge-graph, garden, pulser: discover structure from filesystem, not hardcoded |

**Voice I/O Pipeline:**

| # | Step | Status | Notes |
|---|---|---|---|
| 6.10 | Install superwhisper (desk dictation) | ✅ | Already using it. SuperWhisper > WhisperFlow for terminal/Claude Code. |
| 6.11 | Set up macOS TTS pipe | ✅ | Jamie Premium voice @ 220 wpm. `say -v "Jamie (Premium)" -r 220` |
| 6.12 | Order JOTO waterproof pouch (shower capture) | 🔲 | ~$8 — [Amazon link](https://www.amazon.com/JOTO-Universal-Waterproof-Cellphone-Samsung/dp/B00LBK7OSY) |
| 6.13 | Portable mic for jogging | ⏸️ RECONSIDERED | Skipping throat mic. Phone voice memos + voice-capture skill covers the use case. |
| 6.14 | Voice capture pipeline (voice memos → transcribe → inbox) | ✅ | /voice-capture skill. iCloud sync → Parakeet MLX → extract todos/ideas/feedback → Harbor/Inbox. |
| 6.15 | Wire TTS into notification hooks | ⏸️ SKIPPED | Not needed. Jamie Premium TTS available via `say` for manual use. |

**Email Integration:**

| # | Step | Status | Notes |
|---|---|---|---|
| 6.16 | Universal email forwarding → gmail | ✅ | Done 2026-04-30 |
| 6.17 | Gmail MCP auth fix | ✅ | Resolved 2026-04-30 |
| 6.18 | Claude email triage + draft replies | ✅ | `/email-triage` skill, gated approval pattern, Telegram for urgent |
| 6.19 | Daily email digest | ✅ | Folded into morning-briefing Section 7 (reads email-triage queue file) |

**Epistemic Tools:**

| # | Step | Status | Notes |
|---|---|---|---|
| 6.20 | Package epistemic skills as shareable module | 🔲 | 12 skills: ask-mega, explore-tree, decompose, epistemax (chains 5 sub-skills), plus 4 ask-many-* |
| 6.21 | Write epistemic tools README + examples | 🔲 | Usage guide, demo outputs, cost estimates |
| 6.22 | Demo epistemax on a real Forethought draft | 🔲 | Proof of concept for Matt |
| 6.23 | Test all 12 skills end-to-end | 🔲 | Verify agent spawning, output formats, edge cases |

**Packaging & Distribution:**

| # | Step | Status | Notes |
|---|---|---|---|
| 6.24 | Public Clavi distillation | 🔲 | Strip personal, add setup guide, push to public repo |
| 6.25 | Forethought org scaffold packaging | 🔲 | With Finn — Embassy/Forethought/ as distributable module |
| 6.26 | Flesh out /setup wizard (all 10 steps) | 🔲 | After scaffold stable and tested |

---

## Key Files
- [CLAVI-SPEC.md](CLAVI-SPEC.md) — the spec document
- [clavi-architecture.svg](clavi-architecture.svg) — compass diagram
- [system-guide.md](system-guide.md) — @imported by CLAUDE.md every session
- [voice-io-pipeline.md](voice-io-pipeline.md) — voice I/O + email integration plan
- [../../scaffold.md](../../scaffold.md) — root-level ground truth for all I/O flows
- [../../SYSTEM-EXPLAINER.md](../../SYSTEM-EXPLAINER.md) — onboarding doc for new users/Claudes
- Checkpoint tags: `scaffold-overhaul-checkpoint-2026-04-18`, `pre-migration-checkpoint-2026-04-22`
