# Crossroads — Design Doc

*The unified home for all external code we depend on: friends' repos, third-party skill collections, anything we'd otherwise install as a submodule. Single manifest, single update flow, single revert mechanism, single security audit surface.*

*Started: 2026-04-29 — design phase, not yet implemented.*

## Vision

Crossroads is the trust boundary between the world and the scaffold. Anything checked-in here is whitelisted code we've decided to depend on. The system around it does four jobs:

1. **Watch** — daily scout reads the remote of every whitelisted repo, surfaces what's changed.
2. **Summarise** — Claude reads the diff and writes a per-repo value prop ("here's what changed, here's why you might care, here's where it would slot"). Boring changes get one line and get skipped.
3. **Apply** — on approval, the submodule pointer moves and any symlinks update automatically. Every approved change is a commit in the parent repo, fully revertable.
4. **Audit** — periodic security scan of the whole Crossroads tree using `trailofbits-config` tooling. (Phase 2.)

The trust model is **option (a)**: the whitelist is the trust gate. Once a repo is on it, we trust whoever can push to it. New files don't trigger extra review beyond the normal scout summary.

## Folder Layout

```
Crossroads/
  CLAUDE.md              ← navigation index for this space
  Network.md             ← (existing) personal contacts
  repos.yaml             ← the manifest — every external repo we depend on
  log/                   ← scan reports, install events, reverts
  <source-name>/         ← one folder per submodule
    <whatever the repo contains>
```

Every external repo lives at `Crossroads/<source-name>/` as a git submodule. Flat layout, categorisation lives in the manifest (not the folder structure). This avoids the "should this be Crossroads/Friends/foo or Crossroads/Skills/foo" question — `repos.yaml` carries that metadata.

## Manifest Schema (`Crossroads/repos.yaml`)

```yaml
# Crossroads — trusted external repos
# Each entry is a whitelisted source. Adding here = trusting whoever can push there.

repos:
  - name: finn-skills
    url: https://github.com/finn-tan/finn-skills
    category: friend            # friend | skill-pack | infra | org
    description: "Finn's experimental skill collection"
    summary_depth: rich         # rich | titles  — how thorough the scout summary is
    scaffold_shape: clavi-town  # clavi-town | clavi-ship | foreign  (auto-detected on first scan; can be overridden)
    watch:                      # globs the scout pays special attention to
      - .claude/skills/**
      - .claude/rules/**
      - HANDOFF.md
    symlinks:                   # what we've installed from this repo
      - from: .claude/skills/red-team-doc/
        to: .claude/skills/finn-red-team-doc/
        installed_at: 2026-04-29
    last_scanned: 2026-04-29T07:00:00Z
    last_pulled_sha: abc123def
    pinned_sha: abc123def       # current submodule pointer; matches last_pulled_sha after approval
    notes: |
      Optional human notes about this repo, the relationship, or quirks.

  - name: gstack
    url: https://github.com/garrytan/gstack
    category: skill-pack
    description: "Engineering workflow skills (browse, review, ship, qa)"
    summary_depth: titles       # we trust gstack; we don't need a full narration per release
    scaffold_shape: foreign     # not a Clavi clone, just a skill collection
    watch:
      - skills/**
    last_pulled_sha: f7c5a7c
    pinned_sha: f7c5a7c
```

**Why YAML and not JSON:** humans edit this. The manifest is small (~5-30 entries even at scale). Comments matter. YAML wins.

## Slotting Logic

When a new repo is added, or a known repo gains a new file in a watched path, the scout proposes where it should slot. The proposal depends on `scaffold_shape`:

| Shape | Detection signal | Slotting behaviour |
|---|---|---|
| `clavi-town` | Has `Town-Hall/`, `Harbor/`, `Workshop/`, `Library/` folders | 1:1 — new files map to the same room in our scaffold (e.g. their `Workshop/foo/` → propose `Workshop/foo-friend/`) |
| `clavi-ship` | Has `Bridge/`, `Hangar Bay/`, `Engineering/`, `Databanks/` | Mapped via theme table to Town equivalents |
| `foreign` | None of the above | Heuristic: if it's mostly skills → `.claude/skills/<prefix>-<name>/`. If it's mostly markdown → propose Library. If it's a project → propose Workshop. Otherwise ask. |

Auto-detection runs on first scan and is cached in the manifest. Override by editing `scaffold_shape` manually.

## Skills

### `/crossroads-scan` — overnight scout (Phase 1)

Scheduled at **4:50 AM** (slots between network-scout at 4:40 and inbox-monitor at 5:00).

For each repo in `repos.yaml`:

1. Read remote refs via `gh api repos/<owner>/<repo>/commits` — no clone update yet, just inspect what's changed since `last_pulled_sha`.
2. If nothing new → skip silently.
3. If new commits exist:
   - Fetch the diff against `last_pulled_sha`.
   - For `summary_depth: rich`: Claude reads the diff and writes a value-prop block (what changed, why might the user care, slotting suggestion, action recommendation).
   - For `summary_depth: titles`: just commit titles + changed file count.
4. Write to `Harbor/Inbox/crossroads-YYYY-MM-DD.md`. Empty days produce no file.
5. Update `last_scanned` in the manifest. **Do not** update `last_pulled_sha` — that only moves on approval.

Output format (rich):

```markdown
# Crossroads scan — 2026-04-29

## finn-skills (3 new commits)

**Latest:** `red-team-doc skill: parallelize across 5 agents` (2 hours ago)

**What changed:**
- New skill `/red-team-doc` — runs 5 parallel adversarial agents against any markdown file
- Updated existing `/draft-it` to handle longer inputs
- Doc tweaks

**Why you might care:** `/red-team-doc` overlaps your `/adversarial-prompt` but more lightweight (single-file, no orchestration). Probably worth installing as a complement rather than replacement.

**Slot:** symlink `.claude/skills/red-team-doc/` → `.claude/skills/finn-red-team-doc/` (prefixed to avoid collision with future skill of same name)

**Action:** [install / pull-only / skip / view-diff]

## tom-research-utils (4 commits)

Internal refactors, no user-facing change. Skipping.
```

### `/crossroads-install` — approval handler (Phase 1)

Invoked from `/triage` when the user approves a Crossroads inbox item. (Triage is extended to recognise reports from `/crossroads-scan` and route them to install/skip/revert actions — unified with the rest of the inbox flow.) Steps:

1. `git submodule update --remote Crossroads/<name>` — moves the pinned SHA forward.
2. Apply any new symlinks specified in the action.
3. Update `repos.yaml`: bump `last_pulled_sha`, `pinned_sha`, append to `symlinks` list if new ones were added.
4. Append event to `Crossroads/log/installs.md` (timestamp, repo, SHA before, SHA after, reason).
5. `git add` everything in the parent repo and commit with a message like `Crossroads: pull finn-skills (3 commits, +1 skill)`.

Every approved update is therefore a single, named, revertable commit in the scaffold repo's history.

### `/crossroads-revert` — rollback (Phase 1.5)

`/crossroads-revert <repo-name>` rolls a single submodule back to its previous `pinned_sha`. Two flavours:

- **Soft revert:** checkout the previous SHA in the submodule, update manifest, commit. The history of installs is preserved in `log/installs.md`.
- **Hard revert:** `git revert` the parent-repo commit that bumped the submodule. Same outcome, recorded as a revert in git.

### `/crossroads-add` — onboarding a new repo (Phase 1)

`/crossroads-add <github-url>` walks through:

1. Fetch metadata (description, last commit, README excerpt).
2. Show the user the README + recent commits + estimated repo shape, ask for category + summary_depth + watch globs.
3. Ask: trust this source? (Reminder: option (a), once added it's fully trusted.)
4. On confirmation: `git submodule add <url> Crossroads/<name>`, append to `repos.yaml`, run an initial scan to populate `last_pulled_sha`, surface the first slotting proposal.

### `/crossroads-audit` — security scan (Phase 2)

Runs weekly. For each repo in Crossroads:

- Run `trailofbits-config` security checks against the repo's contents.
- Check for: hardcoded secrets, suspicious bash patterns in skills/hooks, unexpected network calls, dependency advisories.
- Report to `Harbor/Inbox/crossroads-audit-YYYY-MM-DD.md` with findings rated by severity.
- For high-severity findings, proactively notify (Telegram / morning briefing).

This is where the "automated cybersec health checker" lives. Future iteration: propose specific upgrades when a finding has a known fix.

## Update Lifecycle (the Finn example, end-to-end)

```
Day 0  User: /crossroads-add https://github.com/finn-tan/finn-skills
       → repo cloned to Crossroads/finn-skills/, registered in repos.yaml
       → initial scan, finds skill `red-team-doc`
       → User approves install → symlink at .claude/skills/finn-red-team-doc/
       → Scaffold commit: "Crossroads: add finn-skills + install red-team-doc"

Day 7  Finn pushes 3 commits to red-team-doc
Day 8  4:50 AM  /crossroads-scan runs, fetches remote refs (read-only)
                writes value-prop summary to Harbor/Inbox/crossroads-2026-05-06.md
       7:00 AM  morning-briefing surfaces it ("1 Crossroads update pending")
       User:    reviews, approves → /crossroads-install finn-skills
                → submodule pointer moves forward
                → symlinks pick up new content automatically (no rewatch needed)
                → Scaffold commit: "Crossroads: pull finn-skills (3 commits)"

Day 9  Skill misbehaves
       User: /crossroads-revert finn-skills
       → submodule rolls back to Day-8 SHA
       → Scaffold commit: "Crossroads: revert finn-skills"
```

The auto-flow-through-after-approval is the key UX: once the user approves a pull, all symlinks reflecting that submodule update without further action. They don't re-watch each version of each skill.

## Phase 1.5: Migrate Existing Submodules

Once the system is proven on 1-2 new repos, migrate the 5 existing ones from `Town-Hall/Scaffold/` into `Crossroads/`. This is the lift:

| Current path | New path |
|---|---|
| `Town-Hall/Scaffold/gstack/` | `Crossroads/gstack/` |
| `Town-Hall/Scaffold/claude-scientific-skills/` | `Crossroads/claude-scientific-skills/` |
| `Town-Hall/Scaffold/academic-research-skills/` | `Crossroads/academic-research-skills/` |
| `Town-Hall/Scaffold/<your-org-pack>/` | `Crossroads/<your-org-pack>/` |
| `Town-Hall/Scaffold/trailofbits-config/` | `Crossroads/trailofbits-config/` |

Migration steps per submodule:

1. Update path in `.gitmodules`
2. `git mv` the working copy
3. Update any symlinks under `.claude/skills/` that point into these (the `link-skills.sh` script and any hardcoded paths)
4. Add to `repos.yaml` with `category: skill-pack` (or `infra` for trailofbits)
5. Verify symlinks still resolve (`/health-check`)
6. Single commit per submodule, easy to revert if anything breaks

Total estimated effort: ~30 min once the manifest schema is settled, mostly mechanical.

## Default Seed Repos

When a new user runs `/setup` and reaches Phase F (Embassy + Crossroads), Crossroads is pre-populated with one default entry: **the public Clavi repo itself**. Rationale: every Clavi user is implicitly subscribed to upstream improvements — new skills, scaffold tweaks, hook refinements — and gets them surfaced via the same review-and-approve flow as any other repo. Distribution by inclusion, not by push.

Default seed config:

```yaml
- name: clavi-scaffold
  url: https://github.com/AviParrack/Clavi-Scaffold.git
  category: infra
  description: "The Clavi scaffold itself — upstream skills, hooks, and rules"
  summary_depth: rich
  scaffold_shape: clavi-town
  watch:
    - .claude/skills/**
    - .claude/rules/**
    - .claude/hooks/**
    - Town-Hall/Scaffold/**
  pinned_sha: <whatever the user cloned at>
  notes: |
    The upstream Clavi repo. Seeded by /setup. Trust this one — it's the
    scaffold you're using. Remove if you want to fork hard and stop tracking.
```

**Setup wizard integration:** Phase F asks: *"Subscribe to upstream Clavi updates? (Recommended — you'll get new skills and scaffold improvements surfaced for review without auto-installing.)"* Default = yes. Skipping just means the entry isn't added; the user can `/crossroads-add` it later.

**For the maintainer:** the upstream Clavi repo also seeds into the maintainer's *own* Crossroads. This means contributor PRs to the public repo, or pushes from another machine, surface as scout reports for review before being pulled locally. Same flow, different role.

## Resolved Decisions (2026-04-29)

- **Approve action lives in `/triage`** — unified with the rest of the inbox flow, no separate `/crossroads-review` skill.
- **Forking is out of scope** — if a user wants to fork an installed skill, their Claude can copy out and de-symlink. Don't engineer for it.
- **Non-GitHub sources deferred** — GitHub-only via `gh api` for v1.
- **Skills do the mechanical git work** — no separate scripts. The skill prose carries clear instructions; Claude follows them. Reduces moving parts.
- **Phase 1 test case: an existing submodule.** Pick one already mounted under `Town-Hall/Scaffold/` so the test simultaneously proves the migration step. Other submodules follow in Phase 1.5.

## Phasing Summary

**Phase 1 — build + first migration** (this round):
- `Crossroads/repos.yaml` schema + initial manifest
- `Crossroads/CLAUDE.md` navigation index
- `/crossroads-add` skill
- `/crossroads-scan` skill (rich scout, runs at 4:50 AM)
- `/crossroads-install` skill (approval handler, invoked from `/triage`)
- `/triage` extension: recognise Crossroads inbox reports, route to install/skip
- **Migrate one existing submodule from `Town-Hall/Scaffold/` → `Crossroads/`** as the end-to-end test
- Seed `clavi-scaffold` entry into the manifest (default for new users + watcher for the maintainer)

**Phase 1.5 — migrate remaining submodules:**
- Move the other 4: `gstack`, `claude-scientific-skills`, `academic-research-skills`, `trailofbits-config` from `Town-Hall/Scaffold/` → `Crossroads/`
- `/crossroads-revert` skill
- Update `link-skills.sh` and any hardcoded paths that point into the old locations

**Phase 2 — security:**
- `/crossroads-audit` weekly scout (uses `trailofbits-config` tooling)
- Auto-upgrade proposals for known-fix advisories
- Notification integration for high-severity findings

## Cross-References

- [Clavi-Scaffold-Guide.md](../../Clavi-Scaffold-Guide.md) — system map; the Crossroads I/O section is part of the consolidated guide
- [CLAVI-OVERHAUL-NOTES.md](CLAVI-OVERHAUL-NOTES.md) — Phase 6 follow-up; this design becomes a new line item there
- `.claude/skills/setup/SKILL.md` — Phase F covers Crossroads onboarding
- `.gitmodules` — current submodule registry; the source of truth for Phase 1.5 migration
