---
name: crossroads-install
description: "Apply an approved Crossroads update — pull the submodule, install/update symlinks, log the event, commit. Invoked by /triage when the user approves an item from a Crossroads scan report. Use when the user says 'install crossroads <repo>', 'pull <repo>', 'apply that update', or '/crossroads-install <repo>'."
---

# Crossroads — Install

You are the approval handler for Crossroads updates. the user has already reviewed a scan report and decided to apply something — your job is to make the changes mechanically and record everything.

## Before anything else

1. Read `Crossroads/repos.yaml` — find the entry for the named repo.
2. Read the relevant scan report in `Harbor/Inbox/crossroads-*.md` if it's still there — that's the context for what's being approved.

## Inputs

The invoker (the user or `/triage`) provides:
- `<repo-name>` — required. Must match a name in `repos.yaml`.
- `<action>` — one of:
  - `pull` — just move the submodule pointer; don't install new symlinks
  - `install <skill-name>` (repeatable) — pull + symlink the named skill(s) into `.claude/skills/`
  - `install-all` — pull + auto-detect new SKILL.md files in watched paths and propose symlinks for each (still confirms before symlinking)

If the action isn't clear, ask the user which they want.

## Workflow

### Phase 1: Pull the submodule

```bash
cd Crossroads/<repo-name>
git fetch origin
NEW_SHA=$(git rev-parse origin/HEAD)
OLD_SHA=$(git rev-parse HEAD)
git checkout origin/HEAD       # or the default branch — `gh api repos/<owner>/<repo> -q .default_branch`
cd ../..
```

If `OLD_SHA == NEW_SHA`: nothing to pull (probably the scan was stale). Tell the user and stop.

### Phase 2: Apply symlink changes

For each `install <skill-name>` action:

1. Verify the source exists: `ls Crossroads/<repo-name>/skills/<skill-name>/SKILL.md` (or `.claude/skills/<skill-name>/SKILL.md` depending on the repo's layout — check both)
2. Determine target name. Check for collisions: if `.claude/skills/<skill-name>/` already exists, prefix with `<repo-name>-` to disambiguate. Confirm with the user before overwriting anything.
3. Create the symlink:

   ```bash
   ln -s ../../Crossroads/<repo-name>/skills/<skill-name> .claude/skills/<target-name>
   ```

   Use relative paths so the link survives clones.

4. Append the symlink record to the repo's `symlinks:` list in `repos.yaml`.

For `install-all`: scan the diff (or just the current state of watched paths) for new `SKILL.md` files; for each, propose a slot and ask the user for confirmation per skill. Don't blindly install everything.

### Phase 3: Update manifest

In `repos.yaml` for this repo:
- `last_pulled_sha: <NEW_SHA>`
- `pinned_sha: <NEW_SHA>`
- `last_scanned: <current UTC timestamp>`
- Append any new symlinks to the `symlinks:` list

### Phase 4: Log the event

Append to `Crossroads/log/installs.md` (create if doesn't exist):

```markdown
## <YYYY-MM-DD HH:MM> — pulled <repo-name>

- SHA: <OLD_SHA> → <NEW_SHA>
- Action: <pull | install <skills> | install-all>
- Symlinks added: <list, or "none">
- Inbox source: Harbor/Inbox/crossroads-<scan-date>.md
- Notes: <anything notable from the diff or the user's reasoning>
```

### Phase 5: Commit to parent repo

```bash
git add .gitmodules Crossroads/<repo-name> Crossroads/repos.yaml Crossroads/log/installs.md .claude/skills .claude/agents
git status   # show the user what's staged
```

Then create a single commit with a descriptive message:

```bash
git commit -m "Crossroads: pull <repo-name> (<N> commits, +<M> skill(s))"
```

For pull-only: `Crossroads: pull <repo-name> (<N> commits)`.

Do NOT push. the user pushes on their own cadence.

### Phase 6: Mark inbox item handled

If a corresponding `Harbor/Inbox/crossroads-<date>.md` exists and this completes the actions for that report, either:
- Move the report to `Library/Archive/inbox/` (preserve history), or
- Annotate the relevant section with `**INSTALLED <date>**` so future triage doesn't re-surface it.

Use whichever pattern `/triage` uses for handled items — check `Harbor/Inbox/README.md` for convention.

### Phase 7: Confirm

Tell the user:
- Pulled `<repo-name>`: `<short-old-sha>` → `<short-new-sha>` (`<N>` commits)
- Installed: `<list of skills>` or "no new skills"
- Symlinks resolve: yes/no (run `ls -L` test on new ones)
- Commit: `<short-sha>` (point them to it for review/revert)

If anything failed mid-flow (symlink collision the user didn't confirm, manifest write error, etc.), DO NOT commit — leave the working tree dirty so the user can inspect, and report what's broken.

## Reverting

To roll back, the simplest method is `git revert <commit-sha>` on the commit this skill produced — that undoes the submodule pointer move, the manifest changes, and any symlinks in one go. (`/crossroads-revert` skill formalises this in Phase 1.5.)
