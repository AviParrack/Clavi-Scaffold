# Public-Repo Review TODO

*Files Avi should eyeball before the public push, plus generic items needing follow-up.*

*Generated: 2026-05-01.*

---

## High priority — review before push

### Files I sanitized (real content swapped to template)

- [ ] **`Harbor/watchlist.md`** — was Avi's actual watchlist with named individuals + threat-landscape items. Replaced with generic example structure. Verify the rewrite reads cleanly as inspiration.
- [ ] **`Harbor/Dispatch/scout-calibration.md`** — was Avi's accumulated calibration with named networking targets. Now empty template. Confirm OK.
- [ ] **`Library/Knowledge-Graph/PREMISES.md`** — was Avi's worldview commitments. Now template with one example premise + anti-pattern list. Confirm the structure communicates the *idea* of premises clearly.
- [ ] **`Library/Knowledge-Graph/KEY_FINDINGS.md`** — was populated with Avi's S/A-tier findings. Now empty template. Confirm OK.
- [ ] **`.claude/settings.json`** — kept your `bypassPermissions` defaultMode. **This is a permissive default for a public repo.** Consider changing to `"ask"` so new users opt in to permission bypass after auditing.

### Files I left mostly intact (light review needed)

- [ ] **`Town-Hall/User/Avi.md`** — kept your real bio + interests + how-you-work as inspiration. Two lines flagged for your call:
  - *"Has been homeless. Has seen friends die."* — powerful but very personal. Keep, edit, or remove?
  - References to `Avis-Life-Public.md` and `Avis-Life.md` — neither exists in Public-Repo. Keep refs as illustrative or remove?
  - References `Crossroads/Network.md` — that file is now `Network.md.example` template. Update link or remove section.
- [ ] **`CLAUDE.md` (root)** — kept as inspiration per your call. Has your real intro, real active-projects list (which references projects NOT in Public-Repo: SDC, Forethought-Space-Dynamics, AI-Character, Twitter, etc.). The links will be broken in the public version. Decide: prune the project list, leave broken with a "yours go here" note, or rewrite the section.
- [ ] **`SYSTEM-EXPLAINER.md`** — last touched April 22. Verify it's accurate to the current scaffold (skill counts, structure, etc.).
- [ ] **`scaffold.md`** — root I/O map. Verify it's up to date with current scaffold structure (six spaces, current skills, current automation).
- [ ] **`Town-Hall/CLAUDE.md`** — references Avi by name. Decide: keep as your inspiration (current state) or generic-ify.
- [ ] **`.claude/rules/forethought-default.md`** — defaults all research to Forethought voice. For a public scaffold this is too specific. Either rename + de-Forethought it, or document that users should disable this rule unless they're at Forethought.
- [ ] **`Library/CLAUDE.md`** — may reference topic collections (Space-Energy, Governance, Business) that aren't shipped. Review.

---

## Medium priority

- [ ] **`Aesthetics/`** is 158MB of personal mood-board imagery. This ships with the public repo. Decide if that's intended or if a slim version with sample images + .md notes is better.
- [ ] **`Town-Hall/User/Personal-Dev/`** and **`Life Admin/`** are now empty folders. Add a README.md template explaining what goes there?
- [ ] **`Library/Logs/`, `Conversations/`, `Someday/`, `Archive/`** are empty. README.md templates explaining what each is for?
- [ ] **`Embassy/`** has only `CLAUDE.md`. Review whether the orientation file makes sense without any actual orgs to point to.
- [ ] **`Crossroads/repos.yaml`** — write a sample whitelist showing the format with non-personal entries (or just retain the `clavi-scaffold` upstream entry as the only one).
- [ ] **`Crossroads/Network.md`** — does not exist in Public-Repo. Add `Network.md.example` template?

---

## Low priority

- [ ] **Symlinks for skill packs**: 196 symlinks were stripped. The submodule references should be re-established via `repos.yaml` so users can opt-in to `/crossroads-add` for sci-/gstack-/acad-/forethought- skill packs.
- [ ] **`.gitignore`**: copied from private repo. May reference paths that don't exist in public version — review.
- [ ] **`.claude/agents/`** is empty (style-reviewer was a symlink and got pruned). Either include a real agent file or remove the empty folder.
- [ ] **Hooks paths** in `settings.json` use `$CLAUDE_PROJECT_DIR` which is portable. Confirm hook scripts in `.claude/hooks/` are also portable (no per-machine paths).
- [ ] **macOS-specific bits** (`open` command in run-builder, AppleScript in attach.sh): document that Linux users may need to adapt or contribute Linux equivalents.

---

## Nice-to-have additions before public push

- [ ] A `CONTRIBUTING.md` for users who want to suggest improvements
- [ ] A `CHANGELOG.md` for tracking scaffold version history
- [ ] A short demo GIF or screenshot of the First Build Tutorial in action
- [ ] A `docs/` folder with the architecture diagram (clavi-architecture.svg) and any walkthrough materials

---

## Process notes

This Public-Repo was built by:
1. Wiping everything but `.git/` and `LICENSE`
2. Copying public-ready files from the live private scaffold
3. Stripping ~196 symlinks pointing to submodules outside the repo
4. Stripping per-user auto-memory + machine-specific settings
5. Sanitizing or templating the files flagged above
6. Writing fresh: README, IDEAS, tutorial spec, Dyson wiki, PREMISES + KEY_FINDINGS templates, this TODO

Anything I touched is in this TODO. Anything I copied verbatim from the private scaffold is *not* in this TODO — those should be safe-by-construction (skills, hooks, rules, infrastructure) but spot-check if anything feels off.
