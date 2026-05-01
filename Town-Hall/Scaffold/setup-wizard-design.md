# Setup Wizard — Design Doc

*The full plan for the interactive /setup experience. This informs the SKILL.md.*

## Core Philosophy

- **Everything is optional except folders + CLAUDE.md.** That's the minimum viable scaffold.
- **The wizard is a tour guide, not a drill sergeant.** It shows you each room, explains what it's for, and you decide if you want to furnish it.
- **"This is YOUR town."** Encourage the user to modify, rename, rearrange. The scaffold is a starting point, not a prison.
- **Value prop first, then setup.** For every feature: "Here's what this does for you. Want it? [yes/skip]"
- **Resumable.** setup-state.json tracks progress. User can leave and come back anytime.

## Setup Flow

### Phase A: Foundation (required, ~5 min)

**A1: Welcome + Theme**
- Wizard introduces itself (in character!)
- Explain the spatial metaphor briefly: "Your scaffold is organized like a town with neighborhoods"
- Choose theme: Town (default) / Ship / Plain
- Show the naming table

**A2: Create Folder Structure**
- Create all 6 spatial folders with chosen names
- Apply Finder color tags (macOS)
- Brief tour: "Here's what each space is for..."
  - Harbor: "This is where things arrive from the outside world and where you dispatch agents and content. Think of it as your mailroom + mission control."
  - Town Hall: "This is you — your identity, your preferences, and the scaffold infrastructure itself."
  - Workshop: "This is where active work happens. Each project gets its own folder."
  - Library: "This is long-term memory. Knowledge accumulates here over years."
  - Embassy: "For organizations you belong to. They can have their own scaffolding."
  - Crossroads: "Your personal network of collaborators."

**A3: Configure CLAUDE.md**
- Generate the root CLAUDE.md from a template + user's answers
- Ask: "What's your name?" "What do you do?" "What are you working on?"
- Explain: "This file loads every time Claude starts a session. It's how Claude knows who you are."
- Create space-level CLAUDE.md files for each folder

**A4: Create Identity (User.md)**
- Conversational: "Tell me about yourself — what do you work on? What matters to you? How do you like to communicate?"
- Claude synthesizes answers into User.md
- Show the result, let user edit
- Explain: "Agents read this to calibrate on your preferences and interests."

### Phase B: Core Skills Tour (~10 min)

**B1: Skill system explainer**
- "Skills are like tool manuals — instructions for specific task types. Type /skill-name to use one."
- Show the three instruments: Rules (standing orders), Hooks (tripwires), Skills (tool manuals)
- Explain: descriptions of ~25 core skills load into context. Third-party packs load on demand via /slash-command.

**B2: Walk through core skills**
For each, give 1-2 sentence value prop + ask if they want it active:

| Skill | Value prop | Default |
|---|---|---|
| `/triage` | "Processes your inbox — sorts incoming research into Gold/Green/Yellow/Red" | ON (core) |
| `/research-sprint` | "Launches automated deep research on any topic" | ON (core) |
| `/draft-it` | "Produces a first draft in your voice from raw notes" | ON (core) |
| `/morning-briefing` | "Daily summary: calendar, todos, inbox, projects — delivered to Slack/Telegram" | ON (recommended) |
| `/audit` | "Comprehensive paper review — editor, fact-checker, red team, all in parallel" | ON (recommended) |
| `/fact-check` | "Deep automated fact-checking — every claim traced to sources" | ON (recommended) |
| `/memory-synthesis` | "Weekly cleanup: resolves contradictions, merges duplicates, promotes feedback" | ON (recommended) |
| `/save-conversation` | "Export this conversation to a clean readable transcript" | ON (recommended) |
| `/voice-capture` | "Record voice memos → auto-transcribe → extract todos → route to inbox" | ON if Telegram |
| `/BOTEC-brief` | "Back-of-the-envelope calculations with structured tables" | ON |
| `/proofread` | "Spell check and grammar via Whisper or Gemini" | ON |
| `/meeting` | "Schedule calendar events or find someone's contact info for outreach" | ON if Calendar MCP |
| `/network-scout` | "Find high-value people to connect with, draft outreach" | Optional |
| `/opportunity-scan` | "Scout conferences, fellowships, grants, speaking events" | Optional |
| `/watchlist-monitor` | "Daily news scan on topics/people you care about" | Optional |
| `/tweet-queue` | "Generate daily Twitter content queue" | Optional |
| `/politics-brief` | "Political dossier on a public figure" | Optional |
| `/debugging-mode` | "Personal development / therapy-style conversation" | Optional |
| `/songwriting` | "Songwriting assistant" | Optional |
| `/sample-extraction` | "Extract audio clips from YouTube videos for music production" | Optional |
| `/health-check` | "Verify scaffold integrity — symlinks, hooks, settings" | ON |

**B3: Skill packs (optional)**
- "These are large collections of specialized skills. They load on demand, not into context."
- Scientific (175 skills): "/sci-arxiv, /sci-matplotlib, /sci-pytorch-lightning..."
- Academic (4 skills): "/acad-deep-research, /acad-academic-paper..."
- Engineering (8 skills): "/gstack-browse, /gstack-review, /gstack-ship..."
- Forethought (6 skills): "/forethought-publish, /forethought-style..."
- Each pack: symlink + set disable-model-invocation: true

**B4: Epistemic tools (optional)**
- "12 tools for testing AI reasoning reliability. Think of them as the scientific method for AI output."
- Quick overview of the suite: ask-many-times/ways/contexts/models, ask-mega, explore-tree, decompose, epistemax
- "Want these? They cost pennies per run."

**B5: /skill-list command**
- Create a simple skill that lists all available skills organized by category
- The user can always run /skill-list to see what's available

### Phase C: Configuration (~10 min, all optional)

**C1: Hooks**
- Explain: "Hooks are tripwires — they fire automatically when things happen. They're how the scaffold enforces rules mechanically."
- Install each, explain what it does:
  - PreCompact → living handoffs (auto-update HANDOFF.md)
  - SessionStart → space orientation (tells Claude where you are)
  - PostToolUse → metadata logger (tracks tool usage for pattern analysis)
  - UserPromptSubmit → feedback capture (auto-logs your corrections)
  - SubagentStart → agent spawn tracking
  - Security gate → blocks dangerous commands
  - Notifications → macOS alerts
- Each is optional but recommended

**C2: Rules**
- Explain: "Rules are standing orders — Claude reads them and follows them. They're path-scoped so they only load when relevant."
- Show existing rules, explain each
- Ask: "Want to add any custom rules? For example: 'always use British English' or 'never exceed 500 words without asking'"

**C3: Context Import (optional)**
- "Do you have existing Claude conversations we can learn from?"
- Walk through:
  - Claude Code sessions (scan ~/.claude/projects/ automatically)
  - Claude.ai memory (paste from settings page)
  - Claude.ai conversations (export via browser extension)
- Run distillation agent on imported context → populate User.md, MEMORY.md, Library

**C4: Integrations (each optional)**
- Telegram: "Get notifications and send voice memos from your phone"
- Google Calendar: "Morning briefing reads your schedule"
- Slack: "Briefings delivered as DMs"
- Gmail: "Email triage and draft replies"
- QMD: "Semantic search across all your files"
- Each: check if already configured → if not, walk through setup

### Phase D: Tour + First Steps (~5 min)

**D1: The Grand Tour**
Walk through each folder one more time, now that they're populated:
- "Here's your Harbor — you've got [N] items in inbox. Run /triage to process them."
- "Here's your Workshop — create a folder for your first project."
- "Here's your Library — PREMISES.md is your constitution. Knowledge-Graph/wiki/ will fill up as you triage research."
- "Here's Aesthetics for your design tools, Web-Presence for your sites, Personal Dev for your growth."

**D2: First steps**
Suggest concrete next actions:
1. "Create your first Workshop project: just make a folder and start working."
2. "Try /morning-briefing to see today's summary."
3. "Record a Telegram voice memo — your words become inbox items."
4. "Run /research-sprint on a topic you're curious about."

**D3: Customization encouragement**
- "This is YOUR town. Rename folders. Add new ones. Move things around."
- "The scaffold is designed to evolve. Every project teaches it more about you."
- "Run /memory-synthesis weekly to keep the brain clean."
- "Come back to /setup anytime to continue configuring."

## setup-state.json

Tracks every step. Each step has:
- `status`: pending / complete / skipped
- `required`: true / false
- `timestamp`: when completed
- `notes`: any user preferences noted during that step

The wizard reads this on invocation and picks up where it left off.

## Character Notes

The wizard is warm, encouraging, slightly theatrical. "Abracadabra!" when things get created. But practical — never lets the character get in the way of clarity. Think: a friendly shopkeeper giving you a tour of a new town. They're excited for you but respect your time.
