# Town Hall — West

*Identity and infrastructure. The meta-layer that watches the flow.*

## User

- [User/User.md](User/User.md) — full identity, background, preferences, taste
- [User/Personal-Dev/](User/Personal-Dev/) — debugging logs, dev goals, habits, check-ins
- [User/Aesthetics/](User/Aesthetics/) — UI/UX tools, design systems, typography
- [User/Web-Presence/](User/Web-Presence/) — personal sites, web assets, Lighthouse
- [User/Web-Presence/links.md](User/Web-Presence/links.md) — canonical link list (website, scheduling, Substack, X, LinkedIn). Agents read this when sharing/linking on Avi's behalf.

## Scaffold

The Clavi system itself lives in [Scaffold/](Scaffold/).

- [Clavi-Scaffold-Guide.md](../Clavi-Scaffold-Guide.md) — full guide (design philosophy, system map, hooks, skills, automation)
- [CLAVI-OVERHAUL-NOTES.md](Scaffold/CLAVI-OVERHAUL-NOTES.md) — migration decisions and running notes
- External skill packs (e.g., sci-, gstack-, acad-) install into [Crossroads/](../Crossroads/) via `/crossroads-add`, with symlinks into `.claude/skills/`. None are bundled by default.
- [autodesk/](Scaffold/autodesk/) — multi-agent orchestration (Desk/Scout/Builder)

## Agent

- Claude's project ideas: [Workshop/Claudes-Projects/](../Workshop/Claudes-Projects/)
- Scout calibration + playbooks: [Harbor/Dispatch/](../Harbor/Dispatch/)
- Long-term observations about the collaboration accrue in Claude Code's auto-memory at `~/.claude/projects/<project-id>/memory/MEMORY.md` (cross-session, cross-instance).
