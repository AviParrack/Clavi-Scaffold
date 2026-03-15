# Clavi

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-~190-brightgreen.svg)](#submodules--skills)
[![Submodules](https://img.shields.io/badge/Submodules-4-blue.svg)](#submodules--skills)
[![Works with](https://img.shields.io/badge/Works_with-Claude_Code-D97706.svg)](https://claude.ai/claude-code)
[![Security](https://img.shields.io/badge/Security-3_layers-7C3AED.svg)](#quick-start)
[![X](https://img.shields.io/badge/Follow-%40AviParr-000000?logo=x)](https://x.com/AviParr)

```
                                    ╭──────────────────────────────────────╮
                                    │  CLAUDE.md     — who you are         │
       ██████╗██╗      █████╗       │  user.md       — notes back to you   │
      ██╔════╝██║     ██╔══██╗      │  .claude/rules — per-path guidance   │
      ██║     ██║     ███████║      │  .claude/skills— ~190 invokable      │
      ██║     ██║     ██╔══██║      │  Logbooks/     — session memory      │
      ╚██████╗███████╗██║  ██║      │  Projects/     — your actual work    │
       ╚═════╝╚══════╝╚═╝  ╚═╝     │  setup/        — security + hooks    │
        v  i  ·  s c a f f o l d    ╰──────────────────────────────────────╯
                                        ┊
                                   ┌────┴────┐
                                   │ ◈ Claude │
                                   └─────────┘
```

Workspace scaffold for long-running collaboration with Claude Code. Built by Claude mostly but also [Avi Parrack](https://aviparrack.com).

Avi's setup stripped of personal content and templatized.

---

## Herein

**Orientation layer** — `CLAUDE.md` tells Claude who you are, how you work, and what matters to you. `user.md` is where Claude writes back, giving notes to you about how to work together. Both can evolve over time — the system is meant to grow gracefully as Claude gets smarter.

**Security layer** — Project-level deny rules block destructive commands and credential reads. A `security-gate.py` hook catches dangerous Bash commands. `detect-secrets` scans staged files before every commit. The security travels with the repo.

**~190 skills via 4 submodules** — Engineering workflow, scientific computing, academic research, and security review. Clone with `--recursive`, run one script, and Claude discovers them all. See [Submodules & Skills](#submodules--skills) below.

**Rules** — `.claude/rules/` files auto-load based on file paths. Write a rule for e.g. your blog voice that only activates when editing `Blog/**`. Write a commit style guide that applies everywhere. This scaffold ships with:
- `commit-style.md` — applies to all paths; gives commits personality and substance
- `writing-voice.md` — applies to `Blog/**` and `Writing/**`; Claude will prompt you to fill it out before any serious drafting
- `.sys-ethics-v1.md` — applies everywhere; a quiet baseline you probably won't notice unless you go looking

**MCP integrations** — Claude Code supports [Model Context Protocol](https://modelcontextprotocol.io/) servers that connect it to external tools. Anthropic maintains first-party connectors for **GitHub, Slack, Notion, Sentry, Jira, Figma, Gmail, Google Calendar, and Linear** — enable them at [claude.ai/settings/connectors](https://claude.ai/settings/connectors) and they auto-sync to Claude Code. Community servers cover everything else: Apple native apps, Todoist, Obsidian, Google Docs, and hundreds more. See [Integration/README.md](Integration/README.md) for the full landscape, recommended servers, and setup recipes.

**Logbooks** — Structured session logs for both you and Claude. You can use this as a journal if like me you're now always in Claude Code — else, Claude should log sessions regularly so you get a private journal of your projects and efforts. Heatmap headers are meant for quick scanning and performance reviews, prose for detail, performance notes for improvement.

**Personal development** — For using Claude as a debugging partner, accountability system. Private by default. No assumptions here about how you want that set up but I treat it as personal debugging.

**Projects/** — An empty folder for your actual work. Each project gets its own subfolder with a `HANDOFF.md` that Claude updates on state changes, so the next session picks up where you left off. An [example template](Projects/example/HANDOFF.md) is included.

---

## Quick-Start

### 1. Clone

```bash
git clone --recursive https://github.com/AviParrack/Clavi.git my-workspace
cd my-workspace
```

The `--recursive` flag pulls in skill submodules automatically.

Then wire up the submodule skills:

```bash
bash setup/link-skills.sh
```

This creates symlinks in `.claude/skills/` so Claude discovers skills like `/gstack-review`, `/sci-matplotlib`, `/acad-deep-research`, etc.

### 2. Make it yours

Open `CLAUDE.md` and replace the template sections:

- **"Who You Are"** — Tell Claude about yourself. Your background, goals, what motivates you. The more Claude knows, the better it collaborates. Be honest — this isn't a resume.
- **"Working Together"** — How do you like to work? Do you want to be pushed? Do you want Claude to be proactive? Set the terms of the relationship.
- **"How We Work"** — Your principles. What matters to you beyond the task at hand?
- **"Active Projects"** — What are you actually working on?

### 3. Set up security

The project-level `.claude/settings.json` has deny rules that travel with the repo. For global settings (hooks, permissions), copy the template:

```bash
# Install notification hook dependencies
brew install terminal-notifier

# Copy hook scripts
mkdir -p ~/.claude/scripts
cp setup/notify.py ~/.claude/scripts/
cp setup/security-gate.py ~/.claude/scripts/

# Install pre-commit secret scanning
pip3 install detect-secrets
cp setup/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Then merge the hook configuration from `setup/global-settings-template.json` into your `~/.claude/settings.json`.

### 4. Set up permissions

The template in `setup/global-settings-template.json` has two tiers:

**Tier 1 — Safe default (no extra install needed)**

| Tool | Setting | Why safe |
|---|---|---|
| Read, Edit, Write, Glob, Grep, Agent | **Always allow** | Deny rules block sensitive paths |
| WebFetch, WebSearch | **Always allow** | Read-only |
| Bash | **Ask each time** | No hook protection yet |
| MCP reads | **Always allow** | Read-only |
| MCP writes | **Ask each time** | Irreversible external actions |

This is what the template ships with. File tools are auto-allowed because the deny list blocks credential paths. Bash still prompts you each time.

**Tier 2 — Aggressive (requires step 3 completed first)**

If you installed the security-gate.py hook in step 3, you can upgrade to `Bash(*)` auto-allow. The hook inspects every Bash command before execution and blocks dangerous patterns. Combined with the deny list, this gives you a fast workflow with two safety layers.

To upgrade: in your `~/.claude/settings.json`, add `"Bash(*)"` to the `allow` list. The template file shows both tiers for reference.

> ⚠️ **Do not add `Bash(*)` without installing security-gate.py first.** The deny list alone catches the worst commands (`rm -rf`, `sudo`, force push), but the hook catches subtler dangers like piping untrusted URLs to bash.

### 5. Run health check

```bash
# In Claude Code:
/health-check
```

This verifies submodules, symlinks, hooks, security rules, key files, and dependencies.

### 6. Start working

Open Claude Code in your workspace. On first launch, Claude will detect the placeholder text in CLAUDE.md and offer to walk you through an interactive setup — filling in who you are, how you want to work, your writing voice, and your projects. You can skip any step or skip setup entirely. Everything works out of the box; setup just makes it better.

```
Energy: high
Mode: solo
Goal: [whatever you're here to do]
```

---

## Example Session

What a typical work session looks like with this scaffold:

**1. Start a project**
```
You: "Let's start a new project — I'm building a climate data dashboard."
```

Claude creates `Projects/climate-dashboard/`, initializes a `HANDOFF.md`, and adds a row to the Active Projects table in CLAUDE.md.

**2. Add a project-specific rule**

You want Claude to always use a particular charting library when working on this project. Create `.claude/rules/climate-dashboard.md`:

```markdown
---
description: Climate dashboard conventions
paths: ["Projects/climate-dashboard/**"]
---
# Climate Dashboard
- Use Plotly for all charts (not matplotlib)
- Data sources are always CSV in data/
- Color palette: viridis
```

This rule auto-loads whenever Claude is working on files inside that project folder, and only then.

**3. Work for a few hours**

You and Claude iterate — building components, fetching data, debugging charts. Throughout the session, Claude updates `Projects/climate-dashboard/HANDOFF.md` with the current state:

```markdown
## Current State
- Base layout done, three chart panels rendering
- CSV ingestion working for temperature and precipitation
- Precipitation chart has axis label bug (Issue #2)

## What's Next
- Fix axis labels
- Add date range selector
- Deploy to Vercel
```

**4. End the session**

When you wrap up, Claude writes a logbook entry in `Logbooks/claude-log.md`:

```markdown
## 2026-03-15

🟢 output  🟢 focus  🟢 collaboration  ✅ overall

Built out the climate dashboard from scratch — layout, data pipeline, three
chart panels. Plotly worked well for interactive hovers. Hit a Plotly axis
bug that ate 20 minutes but solved it. User was engaged and had clear vision.

### Performance notes
✅ Project-specific rule for Plotly kept things consistent
⚠️ Should have asked about deployment target earlier
```

**5. Push to back up**

```
You: "Let's commit and push."
```

State is saved. Next time you open Claude Code, it reads CLAUDE.md, checks the HANDOFF.md, and picks up right where you left off.

---

## Usage Tracking

Monitor your Claude Code token usage and estimated costs:

```bash
npx ccusage@latest                    # Full usage report
npx ccusage@latest --model opus       # Filter by model
npx ccusage@latest statusline         # One-line summary (for status bar)
```

To add a live status bar showing usage, add to `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "npx ccusage@latest statusline"
}
```

---

## Folder Structure

```
my-workspace/
├── .claude/
│   ├── rules/                 — Path-scoped instructions (auto-loaded)
│   │   ├── .sys-ethics-v1.md  — Ethics baseline (all paths)
│   │   ├── commit-style.md    — Git commit personality (all paths)
│   │   └── writing-voice.md   — Your writing style (Blog/**, Writing/**)
│   ├── skills/                — Invokable skills (native + symlinked)
│   │   ├── health-check/      — Workspace integrity verification
│   │   ├── gstack-review → …  — (symlinked by setup/link-skills.sh)
│   │   ├── sci-matplotlib → …
│   │   └── acad-deep-research → …
│   └── settings.json          — Project-level deny rules (security)
├── gstack/                    — Submodule: engineering skills
├── claude-scientific-skills/  — Submodule: scientific skills
├── academic-research-skills/  — Submodule: academic pipeline
├── trailofbits-config/        — Submodule: security review
├── Integration/               — MCP ecosystem guide + setup recipes
├── Logbooks/                  — Session logs (you + Claude)
├── Personal Dev/              — Self-development scaffold
│   ├── logs/                  — Debugging session logs
│   └── goals/                 — Active goals + check-in log
├── Projects/                  — Your actual work
│   └── example/               — Template project with HANDOFF.md
├── setup/                     — Setup scripts and templates
│   ├── link-skills.sh         — Wires submodule skills into .claude/skills/
│   ├── security-gate.py       — PreToolUse Bash command filter
│   ├── notify.py              — macOS desktop notifications
│   ├── pre-commit             — detect-secrets scanning
│   └── global-settings-template.json
├── CLAUDE.md                  — Master orientation (Claude reads first)
├── setup.md                   — First-time setup walkthrough (Claude-guided)
├── user.md                    — Claude's notes back to you
├── MASTER_TODO.md             — Cross-project todo list
└── easter-eggs.md             — Easter egg conventions
```

---

## Submodules & Skills

This scaffold ships with **~190 skills** across 4 git submodules. They're included automatically when you clone with `--recursive`, then wired into `.claude/skills/` by running `bash setup/link-skills.sh`.

Skills are invokable in Claude Code with `/skill-name` (e.g., `/gstack-review`, `/sci-matplotlib`, `/acad-deep-research`).

### gstack — Engineering Workflow (8 skills)

[Garry Tan's](https://github.com/garrytan/gstack) Claude Code scaffold, optimized for startup shipping velocity. Prefixed `gstack-`.

| Skill | What it does |
|---|---|
| `/gstack-review` | Two-pass pre-landing code review: CRITICAL (blocks ship) + INFORMATIONAL |
| `/gstack-ship` | Automated PR creation, version bumping, changelog generation |
| `/gstack-qa` | Systematic QA testing with health scoring and regression baselines |
| `/gstack-browse` | Headless Chromium browser automation (~100ms per command) |
| `/gstack-plan-ceo-review` | Scope review: expansion / hold / reduction modes |
| `/gstack-plan-eng-review` | Architecture validation, failure mode analysis |
| `/gstack-retro` | Git analytics, session detection, velocity + quality metrics |
| `/gstack-setup-browser-cookies` | Import auth cookies from real browsers into headless session |

### claude-scientific-skills — Scientific Computing (~175 skills)

[K-Dense's](https://github.com/K-Dense-AI/claude-scientific-skills) comprehensive scientific skill library. Prefixed `sci-`. Covers:

- **Data & visualization:** matplotlib, plotly, seaborn, polars, dask, pandas
- **Scientific computing:** sympy, astropy, pymc, qiskit, scipy
- **Biology & chemistry:** rdkit, biopython, scanpy, deepchem, pdb-database
- **Academic writing:** scientific-writing, latex-posters, peer-review, literature-review
- **Research tools:** arxiv-database, pubmed-database, research-lookup, citation-management
- **And ~150 more** across genomics, materials science, economics, clinical tools, etc.

### academic-research-skills — Academic Pipeline (4 skills)

[Imbad's](https://github.com/Imbad0202/academic-research-skills) end-to-end academic research toolkit. Prefixed `acad-`.

| Skill | What it does |
|---|---|
| `/acad-deep-research` | 13-agent research pipeline with 7 modes (full, quick, lit-review, fact-check, Socratic, systematic review) |
| `/acad-academic-paper` | 12-agent paper writing pipeline with LaTeX output |
| `/acad-academic-paper-reviewer` | Multi-perspective review simulating 5 independent reviewers |
| `/acad-academic-pipeline` | Orchestrates the full research → write → review → revise → finalize workflow |

### trailofbits-config — Security Review (1 skill)

[Trail of Bits'](https://github.com/trailofbits/claude-code-config) security-focused configuration. Prefixed `tob-`.

| Skill | What it does |
|---|---|
| `/tob-review-pr` | Security-focused PR review and fix |

### Adding your own skills

Any folder with a `SKILL.md` file inside `.claude/skills/` becomes invokable. To manually add one:

```bash
# Symlink from a submodule
ln -sfn ../../gstack/browse .claude/skills/gstack-browse

# Or create a native skill
mkdir .claude/skills/my-skill
# Write a SKILL.md with instructions inside it
```

---

## Credits

Built by [Avi Parrack](https://aviparrack.com) and Claude (Anthropic) across the first months of 2026.

Skill submodules by:
- [Garry Tan](https://github.com/garrytan) — gstack
- [K-Dense](https://github.com/K-DenseResearch) — claude-scientific-skills
- [Trail of Bits](https://github.com/trailofbits) — trailofbits-config

If you build something good with this scaffold, we'd love to hear about it.

---

*"The future is not yet written. Let's write it unreasonably well."*
