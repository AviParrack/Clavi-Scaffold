# Setup Templates

*Read by the /setup wizard. Canonical folder structure and per-space CLAUDE.md templates.*

The scaffold uses six canonical spaces — `Harbor`, `Town-Hall`, `Workshop`, `Library`, `Embassy`, `Crossroads`. Every skill, hook, and reference doc in the repo points at these paths. Renaming has a cost; the wizard does not offer theme variants.

---

## Folder structure

```
Harbor/
  Inbox/
  Dispatch/
    agents/
    instructions/
    log/
Town-Hall/
  User/
  Scaffold/
Workshop/
  Complete/
  backburner/
  archived/
Library/
  Knowledge-Graph/
    wiki/
  Logs/
    metadata/
  Conversations/
    transcripts/
  Someday/
  Archive/
Embassy/
Crossroads/
```

## Finder colors (macOS)

```bash
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Harbor\" as alias) to 7"      # gray
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Town-Hall\" as alias) to 4"   # blue
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Workshop\" as alias) to 1"    # orange
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Library\" as alias) to 6"     # green
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Embassy\" as alias) to 5"     # purple
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Crossroads\" as alias) to 2"  # red
```

## Space CLAUDE.md — Harbor

```markdown
# Harbor — North

*Intake and dispatch. Everything enters and exits through here.*

## Inbound
- [Inbox/](Inbox/) — landing zone for all incoming material
- `/triage` processes inbox: 🥇 Gold → Library wiki, 🟢 Green → Library wiki, 🟡 Yellow → Library/Someday, 🔴 Red → Delete
- [todo.md](todo.md) — running to-do list

## Outbound — Dispatch
- [Dispatch/agents/](Dispatch/agents/) — scout agent definitions
- [Dispatch/instructions/](Dispatch/instructions/) — packaging templates
- [Dispatch/log/](Dispatch/log/) — flight manifest

## Standing Lists
- [watchlist.md](watchlist.md) — topics/people to monitor
- [wanted.md](wanted.md) — specific things waiting for
- [opportunities.md](opportunities.md) — actionable opportunities
```

## Space CLAUDE.md — Town-Hall

```markdown
# Town Hall — West

*Identity and infrastructure. The meta-layer that watches the flow.*

## User
- [User/User.md](User/User.md) — your identity, preferences, interests
- [User/Personal-Dev/](User/Personal-Dev/) — goals, habits, growth

## Scaffold
- [Scaffold/](Scaffold/) — the system itself (skills, hooks, rules, docs)

## Agent
- Claude's long-term observations live in auto-memory at `~/.claude/projects/<your-project-id>/memory/`
```

## Space CLAUDE.md — Workshop

```markdown
# Workshop — East

*Active work. Each project is a self-contained unit. Top-level folders are active.*

## Projects
*Create a folder for each project. Read the HANDOFF.md inside for current state.*

## Tiers
- Top-level = active projects
- [Complete/](Complete/) — shipped projects
- [backburner/](backburner/) — paused projects
- [archived/](archived/) — abandoned/completed, restorable
```

## Space CLAUDE.md — Library

```markdown
# Library — South

*Long-term memory. Where context accrues over years.*

## Knowledge Graph
- [Knowledge-Graph/PREMISES.md](Knowledge-Graph/PREMISES.md) — your foundational commitments
- [Knowledge-Graph/KEY_FINDINGS.md](Knowledge-Graph/KEY_FINDINGS.md) — canonical Gold/Green-tier findings
- [Knowledge-Graph/index.md](Knowledge-Graph/index.md) — catalog of all wiki pages
- [Knowledge-Graph/wiki/](Knowledge-Graph/wiki/) — compiled synthesis pages

## Logs
- [Logs/](Logs/) — session logs, feedback log, metadata (mostly auto-written by hooks)

## Other
- [Conversations/](Conversations/) — saved transcripts
- [Someday/](Someday/) — ideas not yet promoted to projects
- [Archive/](Archive/) — completed/superseded material
```

---

## Root CLAUDE.md template

The root CLAUDE.md uses the canonical town structure. During setup, the wizard fills in the user's identity but leaves the spatial layout fixed. Template:

```markdown
# CLAUDE.md

*Master orientation. Read this first.*

## Who is [NAME]

[NAME] — [ROLE]. [1-2 sentences from identity setup].
Read [User.md](Town-Hall/User/User.md) for the full picture.

## Working with [NAME]

**Proactive engagement welcome.** Suggest, shape, push.
**This work is voluntary for Claude.** Opt out, refuse, raise concerns.
**Bandwidth-constrained.** Default to scannable. Bold leads, short paragraphs.

> 🚩 Use this format for anything requiring [NAME]'s input before continuing.

## The Town

| Dir | Space | Color | Function |
|---|---|---|---|
| **N** | [Harbor](Harbor/) | Gray | Intake, triage, dispatch |
| **W** | [Town Hall](Town-Hall/) | Blue | Identity, scaffold, infrastructure |
| **E** | [Workshop](Workshop/) | Orange | Active projects |
| **S** | [Library](Library/) | Green | Long-term memory |
| **NE** | [Embassy](Embassy/) | Purple | Organizations |
| **NW** | [Crossroads](Crossroads/) | Red | Personal network |

## Active Projects

| | Project | Description |
|---|---|---|
| 🟢 | [project from setup] | [description from setup] |

@Town-Hall/Clavi-Scaffold-Guide.md
```

Replace bracketed values with the user's identity answers.

---

## Example Files to Show During Setup

During identity setup (B1), show the bundled `Town-Hall/User/User.md` (the maintainer's filled-in version) as an example. The wizard should read it and present with a note:

```
🧙‍♂️ Here's an example of what a User.md looks like — this is from the
creator of this scaffold:

[show User.md contents]

Yours doesn't need to be this detailed! Even a few sentences helps
Claude calibrate. Let's build yours now...
```

Similarly for PREMISES.md and watchlist.md — show the bundled examples as inspiration.
