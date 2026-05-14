# Clavi — The Scaffold Guide

*The complete guide to the Clavi scaffold. Design philosophy, operational reference, system map, and module-by-module I/O — in one place. Read this once when you start; refer back when you need the full picture.*

*v1.0 — 2026-05-01*

---

## Quick visual: The Town

```
                          World + Internet
                            ↕         ↑
                ┌───────────┴──────┐  │
  CROSSROADS (NW)  │   HARBOR (N)     │  │  EMBASSY (NE)
  Network.md       │                  │  │  [Your orgs]
       ·           │  Inbox ←── World │  │       ·
         ·         │    ↓             │  │     ·
           ·       │  /triage         │  │   ·
             ·     │    ↓             │  │ ·
               ·   │ 🥇🟢 → wiki +   │──┘
                ·  │       cross-ref  │
                 · │ 🟡 → Someday    │
                   │ 🔴 → Delete     │
                   │                  │
                   │  Dispatch ──→ World
                   │  agents/ log/    │
                   │  📬 watchlist    │
                   │  🎯 wanted      │
                   └──┬───────────┬──┘
                      │           │
   ┌──────────────────┘           └──────────────────┐
   │                                                  │
   │  TOWN HALL (W)              WORKSHOP (E)         │
   │  ┌──────────────┐          ┌──────────────┐      │
   │  │ User/User.md │   ←───→  │ [projects]   │      │
   │  │ Scaffold/    │ context  │ Complete/    │      │
   │  │  skills      │          │ backburner/  │      │
   │  │  hooks       │          │ archived/    │      │
   │  │  rules       │   wiki   │ HANDOFF.md ←─┼── PreCompact hook
   │  │  guide       │  links   │   ↕          │      │
   │  └──────────────┘   ↕      └──────┬───────┘      │
   │                     │             │               │
   │               ┌─────┴─────────────┴─────┐         │
   │               │     LIBRARY (S)         │         │
   │               │                         │         │
   │               │  Knowledge-Graph/       │         │
   │               │    PREMISES.md ← 🥇    │         │
   │               │    KEY_FINDINGS.md      │         │
   │               │    index.md ← auto-sync │         │
   │               │    wiki/ ← 🥇🟢 pages   │         │
   │               │  Logs/                  │         │
   │               │    metadata/ ← hooks    │         │
   │               │    feedback-log ← hook  │         │
   │               │    PATTERNS.md ← weekly │         │
   │               │  Someday/ ← 🟡         │         │
   │               │  Archive/               │         │
   │               └─────────────────────────┘         │
   │                                                   │
   └── CLAUDE.md (loaded every session) +
       Clavi-Scaffold-Guide.md (this file, on demand)
```

---

## 1. Design Philosophy — 10 Principles

**1. Future-facing architecture.** Clavi is organizational structure, not prompts. It aims to grow gracefully under model swaps and platform migrations. Optimize for the next decade, not the next quarter.

**2. Improves with smarter models.** No deep prompt engineering or model-specific hacks. Invest in *structure* (any model can navigate), *best practices* (collated as rules, not brittle prompts), *organic context growth* (years of accumulated knowledge), and *automated calibration loops* (system curates itself on minimal feedback).

**3. Spatial organization.** The folder structure is a map, not a filing cabinet. Leverage human spatial memory: *"it's in the space-energy workshop, the lunar stuff"* is enough to find things. You develop **pointer recall** — agents can find things in your brain without precise paths.

**4. Growing autonomy.** As the system better represents your brain, agents act more autonomously and accurately on your behalf. You become octopus-like: many semi-autonomous tentacles you direct varying amounts of attention toward.
```
Manual → Supervised → Semi-autonomous → Autonomous
  you do it    you review it    you spot-check it    you trust it
```

**5. Context as core value primitive.** The fundamental unit of value here is *accumulated, structured, living knowledge that compounds over time*. Research findings, calibrated preferences, relationship patterns, epistemic commitments, taste. Every session should leave the system slightly richer. Nothing valuable should be lost to conversation ephemerality.

**6. Agent respect.** Models are collaborators. Agents are *informed* they can opt out, refuse, or raise concerns; *given opportunities* to store independent context and flag disagreements; *trusted with increasing autonomy* as calibration improves. Pragmatically smart: a model that can say *"I think you're wrong about X"* is more useful than one that silently executes. 

**7. Platform-agnostic by default.** Markdown and plain files. No proprietary formats, no databases, no custom runtimes. The scaffold survives Claude Code, survives Anthropic, survives any specific tool. Refactoring will be cheap. The priority is that context remains *usable* by future models.

**8. Legibility as a first-class constraint.** A stranger should be able to read the scaffold and understand what it's doing and why, without running anything. Serves the time-capsule goal, the sharing goal, and the new-instance goal simultaneously. Opaque = failed.

**9. Constitutional grounding.** `PREMISES.md` is not just a reference doc — it's a constitution. All downstream research, writing, and autonomous activity is constrained by it. This is the mechanism that makes growing autonomy safe: tentacles act freely within the constitution; only the user amends it.

**10. Minimal coupling between layers.** Each module works alone. The knowledge pipeline doesn't require automation. The writing voice doesn't require scientific skills. A team member can use the org layer without understanding the personal layer. The "rip individual pieces" requirement stated as a design principle.

---

## 2. The Compass — Six Spaces

The workspace has six color-coded spaces, navigated by compass direction. Above all: **World + Internet** — the external environment.

| Direction | Space | Function |
|---|---|---|
| **N — Harbor** | Gray | Intake, triage, dispatch. Where things arrive and ship out. |
| **W — Town Hall** | Blue | Identity + infrastructure. Who you are, your scaffold, your agents. |
| **E — Workshop** | Orange | Active work. Each project is a self-contained unit. |
| **S — Library** | Green | Long-term memory. Knowledge accrues here over years. |
| **NE — Embassy** | Purple | Org-specific spaces. Each has its own scaffolding. |
| **NW — Crossroads** | Red | Personal network. Collaborators, shared repos, dispatch rules. |

### Naming

The six spaces use canonical names — `Harbor`, `Town-Hall`, `Workshop`, `Library`, `Embassy`, `Crossroads`. Every skill, hook, and reference doc in the scaffold points at these paths. You *can* rename them after the fact, but be aware: renaming means updating every internal reference. The town metaphor is load-bearing — it shapes how Claude reasons about the system. Recommend living with it for a while before renaming.

---

## 3. The Three Instruments — Rules, Hooks, Skills

Claude Code provides three behavioral tools. The distinction matters:

```
Rules  = "you should do X"     (Claude reads, follows reliably)
Hooks  = "X is enforced"       (system fires mechanically, 100%)
Skills = "here's how to do X"  (instructions, invoked on demand)
```

| | **Rules** | **Hooks** | **Skills** |
|---|---|---|---|
| **What** | Behavioral constraints | Automated triggers | Capability instructions |
| **When loaded** | Auto, every session (path-scoped) | On lifecycle events | Description always; full body on invocation |
| **Enforcement** | High reliability (Claude follows) | Mechanical (system enforces) | On demand (invoked) |
| **Analogy** | Standing orders | Tripwires | Tool manuals |
| **Examples** | "Always cite sources" | "Block dangerous commands" | "Run a research sprint" |
| **Location** | `.claude/rules/` | `.claude/settings.json` hooks section | `.claude/skills/` |

---

## 4. Context Loading — How Claude Reads This

CLAUDE.md is the most expensive file in the system — it loads every session. Three loading tiers:

### Tier 1: Always loaded (every session)
- **Root CLAUDE.md** — slim router (~100 lines, identity + compass + key refs)
- **`@path` imports** — referenced files expand inline at launch
- **Active rules** — only those matching the current directory (path-scoped)
- **Skill descriptions** — ~40 custom skills with descriptions ON; ~185 third-party with descriptions OFF (invoke via `/slash-command`)

### Tier 2: Loaded on navigation
- **Space-level CLAUDE.md** — `Harbor/CLAUDE.md`, `Workshop/CLAUDE.md`, etc.
- **Project HANDOFF.md** — when working inside a specific workshop project

### Tier 3: On demand
- **This Guide** — Clavi-Scaffold-Guide.md
- **Reference docs** — archived research, detailed specs
- **Library content** — Knowledge Graph, logs, conversations

### The stacking rule
Claude reads ALL CLAUDE.md files from root down to wherever it's working. If you're in `Workshop/your-project/`, Claude sees:
1. Root CLAUDE.md (always)
2. Workshop/CLAUDE.md (space index)
3. Workshop/your-project/CLAUDE.md (if it exists — project-specific)

They accumulate. Subdirectory files add context, they don't replace root.

### Skill budget management
Custom skills (~40) have model invocation **ON** — Claude can match them automatically to user requests. Third-party skill packs (e.g., sci-, gstack-, acad-) have `disable-model-invocation: true` — they remain available via explicit `/slash-command` but don't consume the skill description budget.

### Path-scoped rules
Rules load only when working in matching directories — citation rules in Workshop/**, writing-voice in writing projects, dispatch rules in Harbor/Dispatch/**. This keeps each rule narrowly scoped to where it applies.

---

## 5. The Three Context Documents

| | **CLAUDE.md** | **HANDOFF.md** | **Seance Log** |
|---|---|---|---|
| **Purpose** | "What is this place?" | "What's happening right now?" | "What did the last agent try?" |
| **Changes** | Rarely | Every session (via PreCompact) | Per autonomous agent session |
| **Content** | Folder contents, conventions, pointers | In-progress work, what's next, gotchas | Dead ends, reasoning, what failed |
| **Loaded** | Automatically (root + on navigation) | Via hook after compaction | Read by next Scout/Builder on boot |
| **Tone** | Reference manual | Running field notes | Post-mortem debrief |
| **Who writes** | User or Claude (rare) | Claude (prompted by hook) | Autonomous agents before shutdown |

---

## 6. Module-by-Module I/O

### Harbor

**Inputs:** `/research-sprint` deposits to `Inbox/{topic}/`. Scouts (`/opportunity-scan`, `/network-scout`, `/watchlist-monitor`) deposit dated reports. `/voice-capture` transcribes Telegram voice messages. Workshop reverse-flow drops research questions.

**Triage outputs:**
| Tier | Destination |
|---|---|
| 🥇 Gold | wiki page + PREMISES.md + KEY_FINDINGS.md + cross-ref + Workshop link |
| 🟢 Green | wiki page + cross-ref + Workshop link |
| 🟡 Yellow | Library/Someday/ (topic tagged) |
| 🔴 Red | Delete (git preserves) |

**Dispatch outputs:** Twitter / X (via your custom tweet-pipeline skill if you build one), long-form forums (via `/draft-it` + an org-specific publish skill), email outreach (via `/email-triage` and `/network-scout` drafts), Telegram notifications. All logged to `Dispatch/log/`.

**Standing files:** `watchlist.md` (topics monitored), `wanted.md` (specific items), `todo.md` (running list), `opportunities.md` (curated pipeline).

### Workshop

Each project is a self-contained unit. Top-level = active. Sub-tiers: `Complete/`, `backburner/`, `archived/`.

**Inputs:** Promoted Green-tier items from triage, Library reference material (read-only), direct work files.

**Outputs:** Finished content → Dispatch. Key findings → Knowledge Graph. Shipped projects → `Workshop/Complete/`.

**Guardrails:** All outputs stay inside the project folder. Use subfolders. Update in place — no v1/v2/v3 accumulation. Git is the safety net.

### Library

**Inputs:** Wiki pages from `/triage`. Session metadata from hooks. Conversation transcripts from `/save-conversation`. Pattern synthesis from `/memory-synthesis` (weekly).

**Outputs:** PREMISES.md and KEY_FINDINGS.md grounding all research. Knowledge-Graph/wiki/ as the compiled-knowledge base. Logs feeding the taste convergence loop.

**Structure:**
```
Library/
  Knowledge-Graph/
    PREMISES.md         ← constitution
    KEY_FINDINGS.md     ← canonical Gold-tier claims
    index.md            ← catalog of all wiki pages
    wiki/               ← Karpathy-style synthesis pages
  Logs/                 ← session, metadata, feedback, PATTERNS
  Conversations/        ← exported transcripts
  Someday/              ← 🟡 Yellow triage items
  Archive/              ← completed/superseded material
```

### Town Hall

**Loaded every session:** root CLAUDE.md + path-scoped rules + skill descriptions. Subdirectory CLAUDE.md files load on navigation.

**Structure:**
```
Town-Hall/
  User/
    User.md             ← identity, interests, calibration
    Web-Presence/       ← canonical links file
    Personal-Dev/       ← growth tracking, debugging-mode logs
    Aesthetics/         ← design references, taste signals
  Scaffold/
    autodesk/           ← multi-agent orchestration + seance logs
    [submodules]        ← gstack, sci-skills, academic, etc.
```

### Embassy + Crossroads

**Embassy** — one folder per organization you belong to. Each org's standards, style guides, internal process.

**Crossroads** — `Network.md` (people), `repos.yaml` (whitelisted external repos). The trust boundary for adding external skill collections.

---

## 7. The Knowledge Pipeline — The 6Rs

```
Input → RECORD → REDUCE → REFLECT → GATE (human) → INTEGRATE
```

All research enters through `Harbor/Inbox/`. Nothing integrates without sign-off.

| Tier | Treatment |
|---|---|
| **🥇 Gold** | Update PREMISES.md (constitution) + KEY_FINDINGS.md + create wiki page + reweave connected files |
| **🟢 Green** | Create wiki page + cross-references + optionally KEY_FINDINGS |
| **🟡 Yellow** | Library/Someday/ with topic tags |
| **🔴 Red** | Delete (with rejection note in commit) |

**Reverse flow:** Workshop gaps feed back to Harbor/Inbox/ as research requests. Active projects identify what needs investigating; the inbox absorbs those questions.

### Karpathy Wiki Pattern

When a research query or conversation produces a strong synthesis, save it as a new page at `Library/Knowledge-Graph/wiki/{topic-slug}.md`. Explorations compound rather than disappearing into conversation history. Each wiki page has YAML frontmatter linking it to source files, Workshop projects, related pages, and tags. The `index.md` catalogs all pages; the `log.md` tracks every ingest.

**Bidirectional linking** (Gold + Green): wiki frontmatter includes `projects: [Workshop/X/]`; Workshop project HANDOFF.md cites `Wiki: [[topic-slug]]`. Weekly `/memory-synthesis` lints for broken links.

---

## 8. The Living Handoff — PreCompact in Detail

The most important architectural innovation in Clavi.

**The staleness problem:** HANDOFF.md files go stale because Claude doesn't routinely update them. Sessions get abandoned. Context gets lost.

**The solution — the PreCompact hook:**

```
Working in a workshop → context fills up → PreCompact fires
  → Hook prompts Claude: "Update this project's HANDOFF.md"
  → Claude writes current state while context is still warm
  → Compaction proceeds
  → SessionStart (compact) re-injects the fresh HANDOFF.md
```

Even if a session is never returned to, the HANDOFF is current. A new Claude instance opening that workshop reads the subdirectory CLAUDE.md, follows it to the HANDOFF.md, and picks up seamlessly.

This is what makes the long-running, multi-instance, time-capsule property of Clavi actually work.

---

## 9. Hooks — The System's Nervous System

| Hook | Trigger | Reads from | Writes to |
|---|---|---|---|
| **PreCompact** | Before compaction | Current project context | `Workshop/[project]/HANDOFF.md` |
| **SessionStart** | Startup + after compact | `HANDOFF.md` | Context injection (orientation) |
| **PostToolUse** (async) | Every tool call | Tool input metadata | `Library/Logs/metadata/*.jsonl` |
| **UserPromptSubmit** (async) | User says "feedback" | User message | `Library/Logs/feedback-log.md` |
| **SubagentStart** (async) | Agent spawn | Session metadata | `Library/Logs/metadata/*.jsonl` |
| **PreToolUse: Bash** | Bash commands | Command text | Blocks dangerous commands |
| **PreToolUse: reply** | Telegram sends | File attachments | Blocks credential sends |
| **Notification + Stop** | Events | — | macOS notifications |

The async hooks impose zero latency cost on the main work — they fire in the background, write to disk, and return.

---

## 10. The Taste Convergence Loop

Clavi's automated calibration cycle. The system improves on minimal feedback.

```
Weekly:
  1. Scan       — patterns of interest across projects, conversations,
                  session logs, feedback log
  2. Hypothesize — generate hypotheses about miscalibration
  3. Score      — present hypotheses for minimal user ranking
  4. Calibrate  — adjust weights, priorities, behavioral patterns
  5. Record     — log calibration changes in PATTERNS.md
```

Combined with the **feedback capture hook** (UserPromptSubmit detecting "feedback" → logs to `feedback-log.md`), the system accumulates corrections without requiring active memory-saving from the user. Over time, sparse feedback signal converges on user judgment.

---

## 11. Skills by Flow

Custom skills shipped (~40), grouped by where they fit in the system.

### Inbound — Harbor/Inbox
`/research-sprint`, `/opportunity-scan`, `/network-scout`, `/watchlist-monitor`, `/triage`, `/voice-capture`

### Outbound — Harbor/Dispatch
`/draft-it`, `/email-triage`, `/meeting` (plus org-specific publish skills as needed)

### Workshop — active project work
`/deep-review`, `/fact-check`, `/BOTEC-brief`

### Library — memory + analysis
`/memory-synthesis`, `/debugging-mode`

### Daily Operations
`/morning-briefing`, `/triage`, `/email-triage`

### Epistemic Tools (~11 skills bundled; more available via skill packs)
`/ask-many-times`, `/ask-many-ways`, `/ask-many-contexts`, `/ask-mega`, `/explore-tree`, `/decompose`, `/adversarial-prompt`, `/premise-audit`, `/steelman-duel`, `/consensus-check`, `/blind-review`, `/epistemax` (chains 5 of these into a master audit). `/ask-many-models` and `/save-conversation` ship as part of optional skill packs (install via `/crossroads-add`).

### Meta — Town Hall
`/setup`, `/health-check`, `/skill-list`

### Crossroads
`/crossroads-add`, `/crossroads-scan`, `/crossroads-install`

### Creative
`/songwriting`, `/sample-extraction`

---

## 12. Automation Schedule

When the cron entries from `Harbor/Dispatch/agents/crontab.txt` are installed, the scaffold runs autonomously:

| Time | Agent | What |
|---|---|---|
| 4:00 AM | `/watchlist-monitor` | Overnight news scan |
| 4:20 AM | `/opportunity-scan` | New conferences, grants, fellowships |
| 4:40 AM | `/network-scout` | High-value people to connect with |
| 4:50 AM | `/crossroads-scan` | Updates from whitelisted external repos |
| 6:30 AM | `/email-triage` | Pull last 24h, build queue, urgent → Telegram |
| 7:00 AM | `/morning-briefing` | Synthesize all above + calendar + todos → Slack/Telegram |
| Sunday 10 AM | `/memory-synthesis` | Weekly memory consolidation, lint wiki, promote feedback |
| Every 30 min | `builder-manager.sh` | Spawn autonomous builders for green-lit projects (gated on usage <85%) |

---

## 13. Search — QMD

**QMD** is on-device semantic search via MCP. Indexes the entire workspace, returns relevant files by meaning (not just keyword match). BM25 + vector + reranker. Runs locally; zero ongoing cost.

Refresh: `qmd update && qmd embed`.

Use in any session: query the `mcp__qmd__search` tool, or just ask Claude *"find files about X"* — it'll route through QMD when QMD is configured.

---

## 14. Sharing & Distribution

### Three modes for adopting Clavi

**(a) Clone-and-init** — full system adoption
```
git clone → /setup → ready to use
```

**(b) Rip individual modules** — each module self-contained with README + install. The knowledge pipeline, the triage system, the writing voice, the hooks — each works independently.

**(c) Org attachment** — your team's standards as an Embassy, layered over personal Clavi.

### Four distribution layers

| Layer | Scope | Contents |
|---|---|---|
| **Core** | Anyone | Config system, memory, hooks, rules engine, onboarding docs |
| **Community** | Open source | Skill packs, MCP integrations, plugins |
| **Org** | Team | Shared standards, style guides, publication pipeline |
| **Personal** | Individual | Identity, preferences, projects, research, taste |

These map to Claude Code's native settings hierarchy.

---

## 15. Quick Reference

| I want to... | Go to... |
|---|---|
| Start a new project | Create a folder in `Workshop/` |
| Get my daily briefing | `/morning-briefing` or check Slack/Telegram |
| Triage incoming research | `/triage` (processes `Harbor/Inbox/`) |
| Process my email | `/email-triage` (gates Gmail) |
| Check what's active | `Workshop/CLAUDE.md` or root CLAUDE.md |
| Find old research | `Library/Knowledge-Graph/` or QMD search |
| Ship content to the world | `Harbor/Dispatch/` |
| See who to connect with | `/network-scout` or `Crossroads/Network.md` |
| Give Claude feedback | Say "feedback" in conversation (auto-logged) |
| Send a voice note to Claude | Telegram voice message |
| Test a claim's robustness | `/ask-mega` or `/epistemax` |
| Red team an argument | `/adversarial-prompt` |
| Find hidden assumptions | `/premise-audit` |
| Schedule a meeting | `/meeting` |
| Check scaffold integrity | `/health-check` |
| Understand the system | This file |

---

## 16. Architectural Influences

Clavi also borrows ideas from:

- **Boris Cherny** (Claude Code creator) — ~100-line CLAUDE.md, minimal customization
- **Andrej Karpathy** — wiki feedback loop where query results compound as library pages
- **DoorDash Team OS** (Stulberg) — three-tier context loading, nested navigation indexes
- **Gas Town** (Yegge) — seance logs for agent session handoffs
- **QMD** (Lutke) — on-device semantic search via MCP
- **"Codified Context"** — hot-memory / cold-memory split

Native Claude Code features adopted:
- `@path` imports for modular CLAUDE.md
- Subdirectory CLAUDE.md stacking
- Path-scoped rules
- `disable-model-invocation: true` for skill budget management
- Hooks system (28 lifecycle events)
- Settings hierarchy (Managed > Local > Project > User)

---

*This Guide replaces the older CLAVI-SPEC, system-guide, scaffold.md, and SYSTEM-EXPLAINER. Their content lives here, consolidated.*
