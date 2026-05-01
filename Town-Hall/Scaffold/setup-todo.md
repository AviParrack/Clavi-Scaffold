# Setup Todo

*Live progress through the Setup Wizard. Type `/setup` to start or resume.*

*The wizard ticks these boxes as you go. You can also tick by hand if you've configured something outside the wizard — keep `setup-state.json` in sync if you do (the JSON is authoritative for the wizard).*

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` complete · `[/]` skipped

---

## ⭐ Phase A — Foundation (required, ~5 min)

- [ ] **A1** Choose theme (Town / Ship / Plain)
- [ ] **A2** Create folder structure + Finder colors (macOS)
- [ ] **A3** Pick automation lane (native cron / cloud routines / hybrid)
- [ ] **A4** Configure persistence (`cleanupPeriodDays`, `.gitignore` defaults)

## 🏛️ Phase B — Town Hall (recommended, ~10 min)

- [ ] **B1** Fill out `User.md` — identity, preferences, communication style
- [ ] **B1.5** Web-presence links (`Town-Hall/User/Web-Presence/links.md`)
- [ ] **B2** Scaffold tour: pick which custom skills to enable, install skill packs, review hooks + rules
- [ ] **B3** Auto-memory note (info-only — Claude's long-term observations live in `~/.claude/projects/<your-project-id>/memory/`)

## ⚓ Phase C — Harbor (recommended, ~10 min)

- [ ] **C1** Inbox + `/triage` flow walkthrough
- [ ] **C2** Dispatch agents (which scouts to run, when)
- [ ] **C3** Standing lists (`watchlist.md`, `wanted.md`)
- [ ] **C4** Morning briefing

## 🔨 Phase D — Workshop (~5 min)

- [ ] **D1** First project — try the bundled First Build Tutorial in `Workshop/Claudes-Projects/`
- [ ] **D2** Workshop guardrails review

## 📚 Phase E — Library (~5 min)

- [ ] **E1** Knowledge graph (PREMISES, KEY_FINDINGS, wiki, index, log)
- [ ] **E2** Memory logs (metadata, feedback, conversation transcripts)
- [ ] **E3** Memory synthesis (weekly pattern review)

## 🏛️🏔️ Phase F — Embassy + Crossroads (skip if not needed)

- [ ] **F1** Embassy — orgs you belong to (often empty; that's fine)
- [ ] **F2** Crossroads — whitelist external repos via `/crossroads-add`

## 🔌 Phase G — Integrations (each optional)

- [ ] **G1** Telegram (mobile bridge for inbox + briefings)
- [ ] **G2** Google Calendar
- [ ] **G3** Slack
- [ ] **G4** Gmail (email triage flow)
- [ ] **G5** QMD search (local markdown index)
- [ ] **G6** Import existing context (Obsidian, Notion, prior chats)

## ✅ Phase H — Verification (~5 min)

- [ ] **H1** Smoke tests (skill-list, CLAUDE.md import, hooks fire, etc.)
- [ ] **H2** First steps tour
- [ ] **H3** Replace the First Run block in `CLAUDE.md` with the one-liner

---

## You can stop anywhere

- Run `/setup` later to continue from any unticked phase.
- Jump to a specific phase: `/setup G3` opens the Slack integration directly.
- Many users never set up every module. **Skipping is fine.** Configure things as you grow into them.

## Re-running

`/setup` always reads `setup-state.json` first and shows you what's incomplete before doing anything. You can re-run any phase to reconfigure (e.g., change theme, add a new skill pack, swap automation lanes).
