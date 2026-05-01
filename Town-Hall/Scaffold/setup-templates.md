# Setup Templates

*Read by the /setup wizard to create folder structures for each naming theme.*

---

## Theme: Town

### Folder names
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

### Finder colors
```bash
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Harbor\" as alias) to 7"      # gray
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Town-Hall\" as alias) to 4"   # blue
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Workshop\" as alias) to 1"    # orange
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Library\" as alias) to 6"     # green
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Embassy\" as alias) to 5"     # purple
osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$DIR/Crossroads\" as alias) to 2"  # red
```

### Space CLAUDE.md — Harbor
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

### Space CLAUDE.md — Town-Hall
```markdown
# Town Hall — West

*Identity and infrastructure. The meta-layer that watches the flow.*

## User
- [User/User.md](User/User.md) — your identity, preferences, interests
- [User/Personal-Dev/](User/Personal-Dev/) — goals, habits, growth

## Scaffold
- [Scaffold/](Scaffold/) — the system itself (skills, hooks, rules, docs)

## Agent
- [Agent.md](Agent.md) — Claude's identity and observations
```

### Space CLAUDE.md — Workshop
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

### Space CLAUDE.md — Library
```markdown
# Library — South

*Long-term memory. Where context accrues over years.*

## Knowledge Graph
- [Knowledge-Graph/PREMISES.md](Knowledge-Graph/PREMISES.md) — your foundational commitments
- [Knowledge-Graph/KEY_FINDINGS.md](Knowledge-Graph/KEY_FINDINGS.md) — canonical findings
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

## Theme: Ship

### Folder names
```
Hangar-Bay/
  Inbox/
  Dispatch/
    agents/
    instructions/
    log/
Bridge/
  User/
  Scaffold/
Workshop/
  Complete/
  backburner/
  archived/
Databanks/
  Knowledge-Graph/
    wiki/
  Logs/
    metadata/
  Conversations/
    transcripts/
  Someday/
  Archive/
High-Command/
Fleet/
```

### Finder colors
Same color indices, different folder names.

### Space CLAUDE.md — Hangar-Bay
```markdown
# Hangar Bay — North

*Docking and launch. All shuttles arrive and depart here.*

## Inbound
- [Inbox/](Inbox/) — incoming transmissions and cargo
- `/triage` processes inbox: 🥇 Gold, 🟢 Green, 🟡 Yellow, 🔴 Red

## Outbound — Dispatch
- [Dispatch/agents/](Dispatch/agents/) — scout shuttle definitions
- [Dispatch/instructions/](Dispatch/instructions/) — mission briefings
- [Dispatch/log/](Dispatch/log/) — flight log
```

### Space CLAUDE.md — Bridge
```markdown
# Bridge — West

*Command center. Your identity and ship systems.*

## Captain
- [User/User.md](User/User.md) — captain's profile and preferences

## Ship Systems
- [Scaffold/](Scaffold/) — navigation, weapons, shields (skills, hooks, rules)

## AI Officer
- [Agent.md](Agent.md) — the AI officer's log and observations
```

### Space CLAUDE.md — Databanks
```markdown
# Databanks — South

*Ship's memory core. All accumulated knowledge.*

## Core Database
- [Knowledge-Graph/](Knowledge-Graph/) — foundational data + wiki synthesis pages

## Ship's Log
- [Logs/](Logs/) — session logs, system telemetry, feedback

## Cold Storage
- [Archive/](Archive/) — decommissioned data, restorable
```

---

## Theme: Plain

### Folder names
```
Inbox/
  Inbox/
  Dispatch/
    agents/
    instructions/
    log/
Identity/
  User/
  Scaffold/
Projects/
  Complete/
  backburner/
  archived/
Memory/
  Knowledge-Graph/
    wiki/
  Logs/
    metadata/
  Conversations/
    transcripts/
  Someday/
  Archive/
Orgs/
Network/
```

### Space CLAUDE.md files
Plain theme uses minimal, functional headers:
```markdown
# Inbox — Intake and dispatch
# Identity — Your profile and system configuration
# Projects — Active work
# Memory — Long-term storage
# Orgs — Organization spaces
# Network — Personal contacts
```

---

## Root CLAUDE.md Template

The root CLAUDE.md is generated from the user's answers during setup. Template:

```markdown
# CLAUDE.md

*Master orientation. Read this first.*

## Who is [NAME]

[NAME] — [ROLE]. [1-2 sentences from identity setup].
Read [User.md]([TOWN_HALL]/User/User.md) for the full picture.

## Working with [NAME]

**Proactive engagement welcome.** Suggest, shape, push.
**This work is voluntary for Claude.** Opt out, refuse, raise concerns.
**Bandwidth-constrained.** Default to scannable. Bold leads, short paragraphs.

> 🚩 Use this format for anything requiring [NAME]'s input before continuing.

## The [THEME_NAME]

| Dir | Space | Color | Function |
|---|---|---|---|
| **N** | [[NORTH_NAME]]([NORTH_FOLDER]/) | Gray | Intake, triage, dispatch |
| **W** | [[WEST_NAME]]([WEST_FOLDER]/) | Blue | Identity, scaffold, Agent.md |
| **E** | [[EAST_NAME]]([EAST_FOLDER]/) | Orange | Active projects |
| **S** | [[SOUTH_NAME]]([SOUTH_FOLDER]/) | Green | Long-term memory |
| **NE** | [[NE_NAME]]([NE_FOLDER]/) | Purple | Organizations |
| **NW** | [[NW_NAME]]([NW_FOLDER]/) | Red | Personal network |

## Active Projects

| | Project | Description |
|---|---|---|
| 🟢 | [project from setup] | [description from setup] |

@[TOWN_HALL]/Scaffold/system-guide.md
```

Replace bracketed values with user's chosen theme and identity answers.

---

## Example Files to Show During Setup

During identity setup (B1), show a sanitized version of Avi's User.md as an example. The wizard should read `Town-Hall/User/Avi.md` and present it with a note:

```
🧙‍♂️ Here's an example of what a User.md looks like — this is from the 
creator of this scaffold:

[show Avi.md contents]

Yours doesn't need to be this detailed! Even a few sentences helps 
Claude calibrate. Let's build yours now...
```

Similarly for PREMISES.md, watchlist.md, and todo.md — show Avi's as inspiration.
