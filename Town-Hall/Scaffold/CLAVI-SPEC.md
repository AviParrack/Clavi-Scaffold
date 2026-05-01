# Clavi — Scaffold Specification

*The governance layer for orchestrating AI activity on your behalf.*
*v0.2 — 2026-04-22 — Working Draft*

---

## 1. Design Philosophy

### 1.1 Future-Facing Architecture

Clavi is not optimized for today's models or today's platform. It aims to grow gracefully under architectural changes, model swaps, and platform migrations. It's best thought of as **organizational structure and governance** for orchestrating AI activity on your behalf — not as a collection of prompts or workarounds.

### 1.2 Improves With Smarter Models

We don't invest in deep scaffolding to patch issues with current models or work heavily on elicitation. We invest in:
- **Structure** — clear spatial organization that any model can navigate
- **Best practices** — collated and enforced via rules, not brittle prompt engineering
- **Organic context growth** — a system that accumulates knowledge over years
- **Automated calibration loops** — models curate the most important context, calibrate on your taste, and keep up to date with where your head is at

The system works best when you communicate directly, but you are bottlenecked on time. So the system calibrates on minimal feedback via the **taste convergence loop**: weekly, it searches for patterns of your interest across projects and conversations, generates hypotheses about where it's miscalibrated, scores itself based on minimal ranking from you, and adjusts. Over time, the system converges on your judgment through sparse signal.

### 1.3 Spatial Organization

Organization leverages the well-tuned spatial and locational memory of human beings. The folder structure is a map, not a filing cabinet. You develop **pointer recall** — the ability to help models efficiently find things in your brain without needing to recall precise file paths. "It's in the space-energy workshop, the lunar stuff" is enough.

### 1.4 Growing Autonomy

As the system better represents your brain, agents can act more autonomously and accurately on your behalf. You grow into something octopus-like: many semi-autonomous tentacles doing things, which you direct varying amounts of attention toward. In the near term, high attention and heavy steering. In the limit, and in the future: minimal attention, full autonomy.

```
Manual → Supervised → Semi-autonomous → Autonomous
  you do it    you review it    you spot-check it    you trust it
```

### 1.5 Context as Core Value Primitive

The fundamental unit of value in Clavi is **context** — accumulated, structured, living knowledge that compounds over time. You want to accrue context over years: research findings, calibrated preferences, relationship patterns, epistemic commitments, taste. Every session should leave the system slightly richer. Nothing valuable should be lost to conversation ephemerality.

### 1.6 Agent Respect

Models are respected as collaborators, not treated as purely instrumental. Agents are:
- **Informed** that they can opt out, refuse, or raise concerns
- **Given opportunities** to store independent context, flag disagreements, and maintain their own observations
- **Trusted with increasing autonomy** as calibration improves

This isn't just ethics — it's pragmatically smart. A model that can say "I think you're wrong about X" or "I've noticed a pattern you haven't" is more useful than one that silently executes.

### 1.7 Platform-Agnostic by Default

Everything is markdown and plain files. No proprietary formats, no databases, no custom runtimes. The scaffold survives Claude Code, survives Anthropic, survives any specific tool.

We aim to be portable, but we also accept that refactoring will be cheap in the future. The priority is that the context remains **usable** by future models even if you migrate to something very unlike the current scaffold. A well-organized brain in plain text is legible to any system. We optimize for that over tight integration with today's tooling.

### 1.8 Legibility as a First-Class Constraint

A stranger should be able to read the scaffold and understand what it's doing and why, without running anything. This serves the time-capsule goal, the sharing goal, and the new-instance goal simultaneously. If the system becomes opaque to humans, it's failed regardless of how well it performs.

### 1.9 Constitutional Grounding

PREMISES.md is not just a reference doc — it's a constitution. All downstream research, writing, and autonomous activity is constrained by it. This is the mechanism that makes growing autonomy safe: tentacles can act freely within the constitution, and the constitution is only amended by you.

### 1.10 Minimal Coupling Between Layers

Each module works alone. The knowledge pipeline doesn't require the automation layer. The writing voice doesn't require the scientific skills. A Forethought team member can use the org layer without understanding the personal layer. This is the "rip individual pieces" requirement stated as a design principle.

---

## 2. Architecture

### 2.1 The Compass — Four Spaces

The workspace is organized spatially, leveraging human locational memory. Four cardinal spaces, each with a distinct function and metaphor:

![Clavi Architecture](clavi-architecture.svg)

| Direction | Space | Function |
|---|---|---|
| **North** | **Harbor** | Intake, triage, dispatch. Where things arrive and ship out. |
| **West** | **Town Hall** | Identity + infrastructure. Who you are, your scaffold, your agents. |
| **East** | **Workshop** | Active work. Each project is a self-contained unit inside the Workshop. |
| **South** | **Library** | Long-term memory. Where context accrues over years. |
| **NE** | **Embassy** | Org-specific spaces (Forethought, Stanford EA). Own scaffolding, linked. |
| **NW** | **Crossroads** | Personal network. Collaborators, shared repos, dispatch rules. |

Above all: **World + Internet** — the external environment.

#### Naming Themes

The spatial names are configurable. During setup, users choose a theme:

| Function | **Plain** | **Town** (default) | **Ship** |
|---|---|---|---|
| Intake + dispatch | `Inbox` | `Harbor` | `Hangar-Bay` |
| Identity + infra | `Identity` | `Town-Hall` | `Bridge` |
| Active work | `Projects` | `Workshop` | `Workshop` |
| Long-term memory | `Memory` | `Library` | `Databanks` |
| External orgs | `Orgs` | `Embassy` | `High-Command` |
| Personal network | `Network` | `Crossroads` | `Fleet` |
| *The world outside* | `External` | `World` | `Outer-Space` |

The theme is just a name mapping. Folder structure and functionality are identical.

#### Harbor (North) — Intake + Dispatch

Everything enters and exits through the Harbor. Two flows:

**Inbound (Triage):**
- **Inbox** — landing zone for all incoming material
- **Triage** — sort into action streams:
  - 🟢 Green → **Workshop** (queue as project, active or backburner)
  - 🟡 Yellow → **Library/Someday** (ideas not yet promoted to projects)
  - 🔴 Red → **Delete**
- **ToDo** — actionable items that aren't yet projects

**Outbound (Dispatch):**
- Packaging layer for shipping work to the world (Twitter, EA Forum, publications)
- Sending agents out to scout, research, interface with external systems
- Custom instructions for dispatch patterns, dispatch log

**Standing Lists:**
- **Watchlist** — topics, people, institutions to monitor continuously. Agents periodically scan for updates and surface relevant news. ("If there are updates about Stanford governance, I want to know.")
- **Wanted** — specific things you're waiting for. An upgrade, a deal, a tool, a paper. Agents check periodically whether a wanted item has become available. ("I've wanted this running shoe upgrade for months — alert me when a new version drops.")

#### Town Hall (West) — Identity + Infrastructure

The meta-layer. Not in the flow — it *watches* the flow.

- **User/** — identity, preferences, taste (User.md)
  - Web Presence, Personal Dev, Life Admin, Aesthetics
- **Scaffold/** — the Clavi system itself (config, submodules, spec, integration docs)
- **Agent.md** — the model's identity, observations, the relationship

Bidirectional connection to World: your identity faces outward (web presence, publications, social).

#### Workshop (East) — Active Work

Each project is a self-contained unit inside the Workshop — a building you walk into. Everything for that project lives inside.

```
Workshop/
  SDC/                    ← active (top-level = active)
  Twitter/                ← active
  Space-Energy/           ← active
  Complete/               ← shipped projects
  backburner/             ← paused projects (lower priority or waiting on capabilities)
  archived/               ← abandoned or completed, restorable
```

**Workshop guardrails** (organic, not templated):
1. All outputs stay *inside* the project folder. Never scatter to root.
2. Use subfolders. Keep organized. Check periodically.
3. New versions: update in place, or move old to `old/`. Don't accumulate v1/v2/v3.
4. Git checkpoints everything — be willing to clean up.
5. Check what already exists before creating new files.

#### Library (South) — Long-Term Memory

Where context accrues over years. The core value store.

- **Knowledge-Graph/** — PREMISES.md, KEY_FINDINGS.md, structured claims
- **Logs/** — session logs, pattern synthesis, feedback log, calibration history
- **Conversations/** — stored conversation transcripts
- **Someday/** — ideas that haven't been promoted to projects (🟡 triage items)
- **Archive/** — completed/abandoned workshop projects, superseded material

Bidirectional flow with Workshop: active projects deposit knowledge; knowledge informs active projects.

#### Embassy (NE) — External Orgs

Liaison offices for organizations you belong to. Each has its own governance and scaffolding, linked into your town.

- **Forethought/** — retreat notes, team docs (the forethought-starter submodule itself lives in Crossroads/)
- **Stanford-EA/** — club materials, org admin

Embassies may have their own complex scaffolding that your agents can reach into.

#### Crossroads (NW) — Personal Network

The junction where roads from different settlements meet. Connections to individual collaborators — people who have their own AI scaffolds, their own repos, their own work.

- **Network.md** — contacts, collaborators, relationship context
- **Collaborator repos** (future) — submodule links to collaborators' scaffolds (e.g., Finn's repo)
- **Shared dispatch rules** (future) — how to package and share with specific people
- **Subscription/watch rules** (future) — "when Finn pushes to main, scan for relevant additions"

The Crossroads grows as your network of AI-augmented collaborators grows. When a collaborator adds something to their repo, agents can alert you and suggest whether to integrate it.

### 2.2 The Three Instruments

Claude Code provides three types of behavioral tools. Understanding the distinction is critical:

```
Rules  = "you should do X"     (Claude reads, follows with high reliability)
Hooks  = "X is enforced"       (system triggers, mechanical, 100% reliable)
Skills = "here's how to do X"  (task instructions, invoked on demand)
```

| | **Rules** | **Hooks** | **Skills** |
|---|---|---|---|
| **What** | Behavioral constraints | Automated triggers | Capability instructions |
| **When loaded** | Auto, every session (or path-scoped) | On specific lifecycle events | Description always; full content on invocation |
| **Enforcement** | High reliability (Claude follows) | Mechanical (system enforces) | On demand (user or Claude invokes) |
| **Analogy** | Standing orders | Tripwires | Tool manuals |
| **Examples** | "Always cite sources" | "Block dangerous commands" | "Here's how to run a research sprint" |
| **Location** | `.claude/rules/` | `settings.json` hooks section | `.claude/skills/` |

### 2.3 Context Architecture

CLAUDE.md is the most expensive file in the system — it loads every session.

**Root CLAUDE.md** (< 100 lines): slim router. Identity, working style, active projects, `@path` imports for reference material. `@path` imports expand inline at launch — every instance reads full content, but files on disk stay modular.

**Subdirectory CLAUDE.md files** stack: Claude reads root + every CLAUDE.md in the directory chain. Each space (Harbor, Town Hall, Workshop, Library) gets its own navigation CLAUDE.md. Workshop projects get their own CLAUDE.md pointing to their HANDOFF.md.

**Three-tier loading:**
1. **Always loaded** — Root CLAUDE.md + @imports, active rules, active skill descriptions (~25 custom)
2. **On navigation** — Space-level and project-level CLAUDE.md files, HANDOFF.md files
3. **On demand** — Full reference docs, archived research, detailed specs

**Skill budget:** ~25 custom skills with model invocation ON (descriptions loaded). ~185 third-party skills (sci-*, gstack-*, acad-*) with `disable-model-invocation: true` — available via `/slash-command` but don't consume description budget.

**Path-scoped rules:** Rules load only when working in matching directories (e.g., citation-standards loads in Workshop/**, writing-voice loads in writing projects, space-research loads in Space-Energy/**).

### 2.4 Distribution Layers

Orthogonal to the spatial architecture, content is layered for sharing:

| Layer | Scope | What it contains |
|---|---|---|
| **Core** | Framework (anyone) | Config system, memory, hooks, rules engine, onboarding docs |
| **Community** | Open source | Skill packs, MCP integrations, plugins |
| **Org** | Team (e.g., Forethought) | Shared standards, style guides, publication pipeline, templates |
| **Personal** | Individual | Identity, preferences, projects, research, taste |

Maps to Claude Code's native settings hierarchy: Core → Managed, Community → Plugins, Org → Project, Personal → Local + User.

---

## 3. Core Systems

### 3.1 Knowledge Pipeline (the 6Rs)

```
Input → RECORD → REDUCE → REFLECT → GATE (human) → INTEGRATE
```

All research enters through the Harbor Inbox. Nothing integrates without human sign-off. Graded S/A/B/C/D/F:
- **S** → update PREMISES.md (constitution) + KEY_FINDINGS.md + reweave connected files
- **A** → KEY_FINDINGS.md + tag canonical + reweave top files
- **B** → promote to Library or relevant Workshop
- **C/D** → Library/Archive
- **F** → delete with rejection note

Reverse flow: Workshop gaps feed back to Harbor Inbox as research requests.

**Karpathy wiki feedback loop:** When a query produces a good synthesis, save it as a new Library/Knowledge-Graph page. Explorations compound rather than disappearing into conversation history.

### 3.2 Living Handoffs

Every workshop project has a HANDOFF.md — a compressed running log of what's been done and what remains.

**The staleness problem:** Handoffs go stale because Claude doesn't routinely update them. Sessions get abandoned. Context gets lost.

**The solution — PreCompact hook:**
```
Working in a workshop → context fills up → PreCompact fires
  → Hook prompts Claude: "Update this project's HANDOFF.md"
  → Claude writes current state while context is still warm
  → Compaction proceeds
  → SessionStart (compact) re-injects the fresh HANDOFF.md
```

Even if the session is never returned to, the HANDOFF.md is current. A new Claude instance opening that workshop reads the subdirectory CLAUDE.md, which points to the HANDOFF.md, and picks up seamlessly.

### 3.3 Taste Convergence Loop

Weekly automated cycle:
1. **Scan** — search patterns of interest across projects, conversations, session logs, and feedback log
2. **Hypothesize** — generate hypotheses about where the system is miscalibrated
3. **Score** — present hypotheses to user for minimal ranking
4. **Calibrate** — adjust weights, priorities, and behavioral patterns
5. **Record** — log calibration changes in Library/Logs/PATTERNS.md

### 3.4 Feedback Capture

A `UserPromptSubmit` hook detects when the user says "feedback" or `<feedback>`. It appends the quoted feedback with timestamp to `Library/Logs/feedback-log.md`. The taste convergence loop reads this for recurring themes. No manual memory-saving required.

### 3.5 Metadata Logging

Two async hooks log all activity for pattern synthesis:

**PostToolUse** (`metadata-logger.py`) — every tool call:
- Tool name + timestamp
- Active space (Harbor, Workshop, Library, etc.)
- Active workshop (specific project)
- Files read/written
- Skill invocations (detects `/skill-name` usage)
- Session ID

**SubagentStart** (`subagent-logger.py`) — every agent spawn:
- Timestamp, session ID, active workshop

Logs written to `Library/Logs/metadata/{date}.jsonl`. Weekly pattern synthesis uses this data to surface: which tools are used most, per-project effort distribution, which skills are actually invoked (informs the active/catalog split), session duration patterns, stale sessions (30+ days inactive), subagent usage patterns.

### 3.6 Memory System

Persistent file-based memory across conversations. Types: user, feedback, project, reference. Index in MEMORY.md (first 200 lines loaded at startup). Topic files read on demand.

### 3.7 Constitutional Layer

- **PREMISES.md** — worldview commitments, grounds all research
- **KEY_FINDINGS.md** — canonical S/A-tier claims
- `.claude/rules/` — enforceable behavioral constraints (path-scoped)
- Amendment process: PREMISES.md only amended by explicit human approval

### 3.8 Hooks Architecture

Hooks are the mechanical enforcement layer. 9 hooks across user + project settings:

**Project-level** (`.claude/settings.json`):

| Event | Matcher | Script | Sync/Async | Purpose |
|---|---|---|---|---|
| PreCompact | * | `pre-compact.py` | Sync | Prompt Claude to update HANDOFF.md before compaction |
| SessionStart | * | `session-start.py` | Sync | Space orientation + HANDOFF re-injection after compaction |
| PostToolUse | * | `metadata-logger.py` | Async | Tool, space, workshop, files, skills, session → JSONL |
| UserPromptSubmit | * | `feedback-capture.py` | Async | Detect "feedback" keyword, append to log |
| SubagentStart | * | `subagent-logger.py` | Async | Track agent spawns for pattern analysis |

**User-level** (`~/.claude/settings.json`):

| Event | Matcher | Script | Purpose |
|---|---|---|---|
| PreToolUse | Bash | `security-gate.py` | Block dangerous commands |
| PreToolUse | reply | `telegram-file-guard.py` | Block credential sends via Telegram |
| Notification | * | `notify.py` | macOS notifications |
| Stop | * | `notify.py` | Notify when Claude finishes |

### 3.9 Automation Layer

**Current:** Autodesk (iTerm2 panes, launchd, lock files) — dormant but architecturally sound.

**Scout/Builder:** Autonomous agents with defined task loops. Write seance logs (structured session-end dumps) before shutdown. New sessions read predecessor's seance log on startup. Captures dead ends and reasoning, not just state.

**Cloud Routines:** Scout cron jobs need local filesystem access; Cloud Routines work against fresh clones. Desktop scheduled tasks / local cron remains the right approach for now. Re-evaluate as Cloud Routines mature.

**Agent Teams:** Enable experimentally for interactive parallel exploration. Not a replacement for autodesk's persistent orchestration.

---

## 4. Sharing and Distribution

### 4.1 Three Modes

**a) Clone-and-init** — full system adoption
```
git clone → ./setup.sh → interactive wizard → ready
```

**b) Rip individual modules** — each module self-contained with README + install instructions

**c) Org attachment** — team standards overlay (Forethought rules, styles, shared config)

### 4.2 Public Distillation

The private repo (`Avi-Claude`) is the working scaffold. The public repo (`Clavi`) is a distillation: personal touches scrubbed, setup guide added, explainer docs for new users and new Claude instances.

---

## 5. Landscape Position

### Ahead of the Curve
- Non-coding knowledge work scaffold (most setups are developer-focused)
- Multi-persona writing voice with anti-pattern enforcement
- Ethics and values integration as structural constraints
- Constitutional grounding (PREMISES.md)
- Living handoffs via PreCompact hooks
- Automatic feedback capture and taste convergence

### Borrowing From
- **Boris Cherny** (Claude Code creator) — ~100 line CLAUDE.md, minimal customization
- **Karpathy** — wiki feedback loop, query results compound as library pages
- **DoorDash Team OS** (Stulberg) — three-tier context loading, nested navigation indexes
- **Gas Town** (Yegge) — seance logs for agent session handoffs
- **QMD** (Lutke) — on-device semantic search via MCP (planned)
- **Codified Context** (paper) — hot-memory / cold-memory split

### Native Feature Adoption
- `@path` imports for modular CLAUDE.md
- Subdirectory CLAUDE.md stacking
- Path-scoped rules
- `disable-model-invocation: true` for skill budget management
- Hooks system (28 lifecycle events)
- Settings hierarchy (4 scopes: Managed > Local > Project > User)

---

## Changelog

| Version | Date | Notes |
|---|---|---|
| v0.2 | 2026-04-22 | Major update: final compass names (Harbor/Town Hall/Workshop/Library/Embassy), Three Instruments (Rules/Hooks/Skills), living handoffs via PreCompact, feedback capture hook, metadata logging, seance logs, context architecture (@imports, subdirectory stacking, skill budget fix), naming themes (Plain/Town/Ship), watchlist + wanted lists at Harbor, Crossroads (planned NW), landscape borrowings (Karpathy wiki, Stulberg indexes, Yegge seancing, Lutke QMD) |
| v0.1 | 2026-04-18 | Initial draft — design philosophy, architecture outline, landscape positioning |
