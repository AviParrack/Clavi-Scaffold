# Harbor — North

*Intake and dispatch. Everything enters and exits through here.*

## Inbound

- [Inbox/](Inbox/) — landing zone for all incoming material. Research sprints deposit here.
- `/triage` skill processes inbox items: 🥇 Gold / 🟢 Green → wiki + cross-ref, 🟡 → Library/Someday, 🔴 → Delete.

## Outbound — Dispatch (mission control)

- [Dispatch/README.md](Dispatch/README.md) — full Dispatch documentation
- [Dispatch/agents/](Dispatch/agents/) — agent definitions (who does what, operating instructions)
- [Dispatch/instructions/](Dispatch/instructions/) — format templates, packaging standards
- [Dispatch/log/](Dispatch/log/) — flight manifest (who was sent, when, what mission, what returned)
- [Dispatch/agents/crontab.txt](Dispatch/agents/crontab.txt) — canonical schedule for all scouts + builder-manager

Active agents (per default crontab): watchlist-monitor (4:00 AM), opportunity-scan (4:20), network-scout (4:40), crossroads-scan (4:50), email-triage (6:30), morning-briefing (7:00). On demand: research-sprint, draft-it.

## Standing Lists

- [watchlist.md](watchlist.md) — topics, people, institutions to monitor. The watchlist-monitor scout reads this.
- [wanted.md](wanted.md) — specific things waiting for. Agents check availability periodically.
