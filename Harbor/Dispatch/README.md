# Dispatch — Outbound Mission Control

*Where agents get their orders and report back. The flight manifest of every mission sent to the world.*

## Structure

```
Dispatch/
  README.md             ← you are here
  agents/               ← agent definitions (who does what, how)
  instructions/         ← packaging templates, format guides, recipient rules
  log/                  ← flight manifest (who was sent, when, what returned)
```

## Agents

Dispatch agents are outbound workers. They go into the world, do a job, and bring results back to `Harbor/Inbox/`. Each agent has a definition file in `agents/` describing its mission, capabilities, and operating instructions.

| Agent | Skill | Mission | Schedule |
|---|---|---|---|
| **Opportunity Scout** | `/opportunity-scan` | Find conferences, fellowships, grants, speaking events | Daily 9:07 AM |
| **Network Scout** | `/network-scout` | Identify high-value people to connect with | Daily 9:23 AM |
| **Watchlist Monitor** | `/watchlist-monitor` | Scan for news about watched topics/people | Daily (see watchlist.md) |
| **Research Sprint** | `/research-sprint` | Deep research on any topic | On demand |
| **Tweet Queue** | `/tweet-queue` | Generate daily Twitter content | On demand |
| **Publisher** | `/forethought-publish` | Package research for EA Forum, blog, etc. | On demand |

## Instructions

Format guides and packaging templates live in `instructions/`. When dispatching content to a platform, Claude reads the relevant template:

- `instructions/twitter.md` — character limits, thread format, tone
- `instructions/ea-forum.md` — formatting, cross-post conventions
- `instructions/blog.md` — Forethought blog post format
- `instructions/outreach.md` — cold email/message templates

*(Create these as dispatch patterns stabilize)*

## Log

Every dispatch creates an entry in `log/`. The log is the flight manifest:

```markdown
## YYYY-MM-DD — [Agent Name] — [Mission Summary]

**Dispatched:** HH:MM
**Agent:** /skill-name
**Mission:** [what was asked]
**Returned:** [what landed in Inbox, or what was published]
**Status:** completed | pending | failed
**Inbox item:** Harbor/Inbox/[filename] (if applicable)
```

This lets you ask "what have my agents been doing?" and get a clear answer.

## Launching a Dispatch

To send an agent out:
1. Invoke the relevant skill (`/research-sprint`, `/opportunity-scan`, etc.)
2. The skill does its work and deposits results in `Harbor/Inbox/`
3. Claude logs the dispatch in `Dispatch/log/`

To package content for distribution:
1. Invoke `/tweet-queue`, `/forethought-publish`, or `/draft-it`
2. Read the relevant template from `instructions/`
3. Claude logs the dispatch in `Dispatch/log/`
