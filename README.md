# Clavi

*A spatial scaffold for working with Claude over time. Six color-coded "spaces" with distinct functions, ~40 custom skills, headless autonomous builders, an inbox-driven research pipeline, and an interactive setup wizard.*

This is the public version of [Avi Parrack](https://aviparrack.com/)'s actual scaffold — lightly scrubbed of private content (emails, scheduling links, internal research) while preserving the real config as inspiration. It's meant as **inspiration first, template second**: fork it, run `/setup`, customize, make it yours.

---

## Quickstart

```bash
git clone https://github.com/AviParrack/Clavi.git
cd Clavi
claude   # opens an interactive Claude Code session
```

Then say: *"Run /setup."*

The Setup Wizard will walk you through naming your spaces, picking a theme (Town / Ship / Plain), wiring scouts, choosing automation lane (cloud routines vs. local cron), and setting up your identity and integrations. 15-30 minutes end-to-end; everything is optional except creating the folders.

After setup, queue your first build:

```bash
claude   # interactive
```

> *Let's do the First Build Tutorial.*

Claude will ask you about yourself, propose 2-3 directions, build you a custom webpage, and open it in your browser. Your scaffold's hello-world.

---

## What's here

```
Clavi/
├── .claude/                Skills, hooks, rules, agents — the engine
├── Harbor/                 N — intake (Inbox), dispatch (scouts/playbooks)
├── Town-Hall/              W — identity (User.md, links.md), scaffold infra
├── Workshop/               E — active projects, Claude's autonomous builds
├── Library/                S — long-term memory, premises, wiki
├── Embassy/                NE — organizations you belong to
├── Crossroads/             NW — personal network, collaborator repos
├── CLAUDE.md                  Master orientation (loaded every session)
└── Clavi-Scaffold-Guide.md    Full guide: design, system map, I/O, hooks, automation
```

Each space has a CLAUDE.md that orients you when you navigate into it. Read [Clavi-Scaffold-Guide.md](Clavi-Scaffold-Guide.md) for the full design philosophy + system map.

---

## What makes Clavi different

**1. Spatial, not hierarchical.** Six rooms with distinct purposes. You navigate by compass direction. Files don't get lost because there's a *place* for everything.

**2. Inbox-first knowledge integration.** Research lands in `Harbor/Inbox/`, gets gated by you via `/triage`, and only Gold/Green-tier findings ever reach the canonical knowledge base. Nothing accumulates unless you've signed off.

**3. Autonomous builders that respect you.** The `autodesk` system spawns headless Claude agents to work on green-lit projects in `Workshop/Claudes-Projects/`. Token-budget gated, lock-coordinated across machines, with on-demand visibility (`attach.sh`). You get out of the loop without losing the loop.

**4. Real config as inspiration.** Most templates ship empty. This one ships with a real example of each space populated, so you can see what good looks like before you fill in your own. Fork and edit.

**5. Two automation lanes.** New users pick their lane in setup:
   - **Cloud lane** (default for laptops): scheduled scouts run as Anthropic cloud routines, deliver via Slack DM
   - **Native lane** (for Mac Minis or always-on machines): cron + Telegram, two-way

---

## The First Build Tutorial

The single green-lit project in `Workshop/Claudes-Projects/IDEAS.md` is a tutorial. When you run it, Claude:

1. Has a brief conversation with you about your interests + taste
2. Proposes 2-3 directions for a personalized webpage
3. Builds the one you pick (real HTML/CSS/JS in `Workshop/First-Build-Tutorial/`)
4. Opens it in your browser

It's not the webpage that matters. It's the moment Claude does something *for you* and you feel what the system can be.

[See the spec](Workshop/Claudes-Projects/first-build-tutorial-PROJECT-SPEC.md).

---

## Skills

~40 custom skills ship in `.claude/skills/` (41 at last count). Highlights:

- `/triage` — gate research into your knowledge base
- `/research-sprint` — launch deep research on any topic
- `/draft-it` — turn raw notes into a first draft in your voice
- `/email-triage` — classify email, surface urgent via Telegram, draft replies on approval
- `/morning-briefing` — daily summary delivered to Slack/Telegram
- `/audit` — full paper review (editor + fact-checker + red team)
- `/memory-synthesis` — weekly memory consolidation
- `/voice-capture` — voice memos → transcribe → todos → inbox
- `/setup` — the Setup Wizard
- `/health-check` — verify scaffold integrity

Run `/skill-list` to see them all.

Skill packs (e.g., sci-, gstack-, acad-) are external dependencies — install them via `/crossroads-add` after initial setup.

---

## Autonomous building

If you wire the cron entries from `Harbor/Dispatch/agents/crontab.txt`, your scaffold runs scouts overnight and lets the `builder-manager` spawn agents to work on your green-lit projects every 30 min — gated on usage staying under 85% of your 5-hour Anthropic budget.

```bash
crontab Harbor/Dispatch/agents/crontab.txt
```

Then to watch builders work:

```bash
bash Town-Hall/Scaffold/autodesk/attach.sh           # iTerm splits
bash Town-Hall/Scaffold/autodesk/attach.sh --tmux    # tmux for SSH
```

Builders write progress to heartbeat files; commit + push real code; release locks on exit. The cron *is* the loop.

---

## Status

This is a working scaffold being actively used. It is opinionated, partial, and continually evolving. PRs and issues welcome on patterns that would broaden the appeal beyond a single user; please don't expect a "general productivity tool" — the design assumes a knowledge worker doing long-horizon research.

License: see [LICENSE](LICENSE).

---

## Credits

[Avi Parrack](https://aviparrack.com/) and Claude (Anthropic). Built collaboratively across many sessions in 2025-2026.

Issues + PRs welcome on this GitHub repo.

Architecture inspired by Karpathy's wiki pattern, lean CLAUDE.md philosophy from the broader Claude Code community, Chris Blattman's [public scaffold](https://github.com/chrisblattman/claudeblattman), and a lot of trial and error.
