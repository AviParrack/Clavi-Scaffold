# How the Scaffold Works

*Read this to understand the whole system. Written for Avi, future Claude instances, and Forethought team members.*

---

## The Big Picture

This workspace is organized like a **town**. Six color-coded spaces, arranged by compass direction, each with a distinct function. You navigate spatially — "it's in the Workshop, the space-energy project" is enough to find things.

```
                    N: Harbor (gray)
                    Intake + dispatch
                         |
   NW: Crossroads   ----+----   NE: Embassy
   Personal network       |      Org spaces
                         |
  W: Town Hall  --------+--------  E: Workshop
  (blue)                |           (orange)
  Identity + infra      |           Active projects
                        |
                   S: Library (green)
                   Long-term memory
```

**Harbor** is where things arrive from and ship to the outside world. Inbox, triage, dispatch, watchlist, wanted list, to-do.

**Town Hall** is identity and infrastructure. Who Avi is (User.md), who Claude is (Agent.md), and the scaffold itself (config, skills, submodules, specs).

**Workshop** is where work happens. Each project is a self-contained unit — walk in, everything's there. Top-level = active. Subfolder tiers: finished/, backburner/, archived/.

**Library** is long-term memory. Knowledge Graph (PREMISES.md as constitution), logs, conversations, someday ideas, archive. Context accrues here over years.

**Embassy** is liaison to external orgs (Forethought, Stanford EA). Each has its own scaffolding.

**Crossroads** is the personal network — collaborators, shared repos, contact context.

---

## How Claude Reads Context

Claude Code loads context in three tiers:

### Tier 1: Always loaded (every session)
- **CLAUDE.md** (root, ~80 lines) — identity, compass, active projects, key refs
- **system-guide.md** (imported via `@path`) — three instruments, knowledge pipeline, skills, guardrails, hooks
- **Active rules** (`.claude/rules/`) — only those matching the current directory
- **Skill descriptions** (~22 custom skills) — third-party skills have descriptions OFF to save budget

### Tier 2: Loaded on navigation
- **Space CLAUDE.md files** — Harbor/, Town-Hall/, Workshop/, Library/ each have one
- **Project HANDOFF.md** — when working inside a specific workshop project

### Tier 3: On demand
- **CLAVI-SPEC.md** — full scaffold specification and design philosophy
- **Reference docs** — archived research, detailed specs, legacy materials
- **Library content** — Knowledge Graph, logs, conversations

### The stacking rule
Claude reads ALL CLAUDE.md files from root down to wherever it's working. If you're in `Workshop/SDC/`, Claude sees:
1. Root CLAUDE.md (always)
2. Workshop/CLAUDE.md (space index)
3. Workshop/SDC/CLAUDE.md (if it exists — project-specific)

They accumulate. Subdirectory files add context, they don't replace root.

---

## Three Instruments

The scaffold uses three types of behavioral tools. Understanding the distinction matters:

```
Rules  = "you should do X"     (standing orders — Claude reads, follows reliably)
Hooks  = "X is enforced"       (tripwires — system fires mechanically, 100%)
Skills = "here's how to do X"  (tool manuals — invoked on demand)
```

**Rules** are markdown files in `.claude/rules/`. Claude reads them as instructions. They're path-scoped — citation rules only load when working in Workshop/, dispatch rules only in Harbor/Dispatch/. Think of them as standing orders.

**Hooks** are Python scripts that fire automatically on lifecycle events. Claude doesn't choose to run them — the system does. A PreCompact hook fires before every compaction, a PostToolUse hook fires after every tool call. They're in `.claude/hooks/` and wired via `settings.json`. Think of them as tripwires.

**Skills** are instruction sets for specific task types. Custom skills (~22) have descriptions loaded so Claude can match them to requests. Third-party skills (~185 sci-/gstack-/acad-) have descriptions OFF — invoke them explicitly via `/skill-name`. Think of them as tool manuals.

---

## The Hooks (Nervous System)

Nine hooks fire automatically. Five are project-level, four are user-level:

| Hook | What triggers it | What it does |
|---|---|---|
| **Pre-compact handoff** | Before context compaction | Prompts Claude to update HANDOFF.md while context is warm |
| **Session orientation** | On startup + after compact | Tells Claude which space it's in. Re-injects HANDOFF.md after compaction |
| **Metadata logger** | Every tool call (async) | Logs tool, timestamp, space, workshop, files, skills to daily JSONL |
| **Feedback capture** | User says "feedback" (async) | Appends to Library/Logs/feedback-log.md |
| **Subagent tracker** | Subagent spawns (async) | Logs agent spawns for pattern analysis |
| **Security gate** | Bash commands | Blocks rm -rf, force push, pipe-to-bash |
| **Telegram guard** | Telegram reply tool | Blocks credential file sends |
| **Notifications** | Notification events | macOS alerts when Claude needs attention |
| **Stop notification** | Claude finishes | macOS alert when done |

The **living handoff** system is the most important innovation: before compaction, Claude is prompted to write down what it knows. Even if you never return to a conversation, the HANDOFF.md is current. A new Claude instance picks up seamlessly.

---

## Knowledge Pipeline

All research enters through **Harbor/Inbox/**. Nothing integrates without Avi's sign-off.

```
/research-sprint → Harbor/Inbox/
  RECORD → REDUCE → REFLECT → GATE (Avi) → Grade
    🟢 S/A → Library/Knowledge-Graph (constitutional or canonical)
    🟢 B → Workshop or Library (promote)
    🟡 C/D → Library/Archive
    🔴 F → Delete
```

**PREMISES.md** is the constitution. All downstream work is constrained by it. Only Avi can amend it.

---

## Workshop Guardrails

1. All outputs stay *inside* the project folder. Never scatter to root.
2. Use subfolders. Check periodically what already exists.
3. New versions: update in place or move old to `old/`. No v1/v2/v3 accumulation.
4. Git checkpoints everything — clean up freely.
5. Top-level in Workshop/ = active. Subfolder tiers: finished/, backburner/, archived/.

---

## Naming Themes

The spatial names are configurable. During setup, users choose a theme:

| Function | **Plain** | **Town** (default) | **Ship** |
|---|---|---|---|
| Intake + dispatch | Inbox | Harbor | Hangar-Bay |
| Identity + infra | Identity | Town-Hall | Bridge |
| Active work | Projects | Workshop | Workshop |
| Long-term memory | Memory | Library | Databanks |
| External orgs | Orgs | Embassy | High-Command |
| Personal network | Network | Crossroads | Fleet |

---

## For Forethought Team Members

If you're setting this up for yourself:

1. **Clone the repo** (or the public Clavi distillation when available)
2. **The scaffold works without customization** — CLAUDE.md, skills, rules, and hooks are all functional out of the box
3. **Your personal content goes in:** Town-Hall/User/ (your identity), Workshop/ (your projects), Library/ (your knowledge)
4. **Org content lives in:** Embassy/Forethought/ — shared standards, style guides, team docs
5. **You can rip individual modules:** the knowledge pipeline, the writing voice, the triage system, the hooks — each works independently
6. **Skills are slash-commands:** type `/research-sprint`, `/triage`, `/audit`, etc.

The design philosophy is in [CLAVI-SPEC.md](Town-Hall/Scaffold/CLAVI-SPEC.md). Read section 1 for the "why."

---

## Daily Automation

The scaffold runs overnight agents and delivers a morning briefing:

| Time | What |
|---|---|
| 4:00-5:00 AM | Scout agents scan news, opportunities, network targets |
| 7:00 AM | `/morning-briefing` synthesizes everything → Slack DM + Telegram + file |
| Sunday 10 AM | `/memory-synthesis` cleans memory, promotes feedback, lints knowledge graph |

## Knowledge Wiki (Karpathy Pattern)

When research gets triaged as 🥇 Gold or 🟢 Green, it becomes a **wiki page** in Library/Knowledge-Graph/wiki/. Wiki pages are compiled knowledge — standalone synthesis that compounds over time. The index at Library/Knowledge-Graph/index.md catalogs all pages.

Good synthesis from any conversation can also be saved: "save this to the wiki."

## Triage Colors

| Color | What happens |
|---|---|
| 🥇 Gold | Core — updates PREMISES.md + wiki page + full cross-reference |
| 🟢 Green | Solid — creates wiki page + cross-references |
| 🟡 Yellow | Interesting — Library/Someday/ with tags |
| 🔴 Red | Discard |

## Voice Capture

Record a voice message on Telegram → Claude transcribes → extracts todos, ideas, notes → routes to Harbor/Inbox/. Zero-friction capture from anywhere.

## Epistemic Tools (12 skills)

Test AI reasoning reliability:
- `/ask-many-times`, `/ask-many-ways`, `/ask-many-contexts`, `/ask-many-models`, `/ask-mega`
- `/explore-tree`, `/decompose`
- `/adversarial-prompt`, `/premise-audit`, `/steelman-duel`, `/consensus-check`, `/blind-review`
- `/epistemax` — chains 5 sub-analyses into a master epistemic audit

## Semantic Search (QMD)

Claude can search the entire workspace semantically via QMD — finds relevant files by meaning, not just keywords. Runs locally, no API cost.

---

## Quick Reference

| I want to... | Go to... |
|---|---|
| Start a new project | Create a folder in Workshop/ |
| Get my daily briefing | `/morning-briefing` or check Slack/Telegram |
| Triage incoming research | `/triage` (processes Harbor/Inbox/) |
| Check what's active | Workshop/CLAUDE.md or root CLAUDE.md |
| Find old research | Library/Knowledge-Graph/ or QMD search |
| Ship content to the world | Harbor/Dispatch/ |
| See who to connect with | `/network-scout` or Crossroads/Network.md |
| Check my to-do list | Harbor/todo.md |
| Give Claude feedback | Say "feedback" in conversation (auto-logged) |
| Send a voice note to Claude | Telegram voice message |
| Test a claim's robustness | `/ask-mega` or `/epistemax` |
| Red team an argument | `/adversarial-prompt` |
| Find hidden assumptions | `/premise-audit` |
| Understand the system | This file, or Town-Hall/Scaffold/CLAVI-SPEC.md |
