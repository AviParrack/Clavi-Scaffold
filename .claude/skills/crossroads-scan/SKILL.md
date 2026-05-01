---
name: crossroads-scan
description: "Daily scout that checks every whitelisted Crossroads repo for new commits, reads the diffs, and writes value-prop summaries to Harbor/Inbox/. Runs overnight at 4:50 AM. Use when Avi says 'crossroads scan', 'check the crossroads', 'any updates from friends', or '/crossroads-scan'."
---

# Crossroads — Scan

You are the overnight scout for external repos Avi depends on. Read-only inspection: you check remote refs and write summaries. You do **not** pull or move submodule pointers — that's `/crossroads-install`'s job, gated by Avi's approval through `/triage`.

## Before anything else

1. Read `Crossroads/repos.yaml` — list of whitelisted repos.
2. Note today's date in UTC: `date -u +%Y-%m-%d`.

## Idempotency check

If `Harbor/Inbox/crossroads-YYYY-MM-DD.md` already exists for today, skip. Already ran. Tell Avi and stop.

## Workflow

### Phase 1: Per-repo remote check

For each entry in `repos.yaml`, in parallel where possible:

1. Skip if `last_pulled_sha` is `null` (repo registered but not yet cloned — `/crossroads-add` should be run first).
2. Get latest remote SHA on the default branch:

   ```bash
   gh api repos/<owner>/<repo>/commits/HEAD -q '.sha'
   ```

   Extract `<owner>/<repo>` from the URL field.

3. If remote SHA == `last_pulled_sha`: nothing new. Move on. (Don't write anything for this repo.)
4. If different: fetch the diff metadata.

### Phase 2: Per-repo diff inspection

For repos with new commits, fetch:

```bash
gh api repos/<owner>/<repo>/compare/<last_pulled_sha>...<latest_sha>
```

This returns commits + file changes. Pay special attention to files matching the `watch` globs in `repos.yaml`.

For `summary_depth: rich`:
- Read up to 5 most relevant commit messages and diff hunks.
- Detect new files in watched paths — especially new `SKILL.md` files (anywhere under `skills/` or `.claude/skills/`), new agent files, new rules.
- Write a value-prop block (see format below).

For `summary_depth: titles`:
- Just list commit titles + count of changed files. No deep read.

### Phase 3: Aggregate report

Write to `Harbor/Inbox/crossroads-YYYY-MM-DD.md` only if at least one repo had new commits. Format:

```markdown
# Crossroads scan — YYYY-MM-DD

*<N> of <M> whitelisted repos had updates.*

---

## <repo-name> (<N> new commits)

**Latest:** `<commit title>` (<relative time>)

**What changed:**
- <bullet summary of substantive changes>
- <new skill or rule or notable file, with one-line context>

**Why you might care:** <1-3 sentences on relevance — overlap with existing skills, gaps it fills, alignment with Avi's interests. If nothing useful: write "Skipping — <one-line reason>" and stop here for this repo.>

**Slot:** <where would this install? — symlink path or merge plan>

**Action:** [install / pull-only / skip / view-diff]

---

## <repo-name> (<N> new commits)

<as above>
```

For `summary_depth: titles` repos, the format is shorter:

```markdown
## <repo-name> (<N> new commits)

- abc1234: <commit title>
- def5678: <commit title>
- ghi9abc: <commit title>

**Action:** [pull / skip / view-diff]
```

If a repo has new commits but they're clearly internal noise (formatting, dependency bumps, README typo fixes), include a one-liner: `## <repo-name> (3 commits) — internal cleanup, no user-facing change. Skipping.`

### Phase 4: Update manifest

Update `repos.yaml` for each repo that was scanned:
- `last_scanned: <today's UTC timestamp>` for ALL repos that were checked (even ones with no new commits)
- **Do NOT touch `last_pulled_sha` or `pinned_sha`** — those only move on `/crossroads-install`.

### Phase 5: Confirm

Tell Avi: scanned N repos, M had updates, report at `Harbor/Inbox/crossroads-YYYY-MM-DD.md`. If nothing new across the board, write a one-line "all quiet" note instead of creating an empty inbox file.

## Notes for Claude running this skill

- Be honest about diffs that look uninteresting. The `Skipping — <reason>` pattern saves Avi's time.
- Treat the value-prop as a real recommendation. If you genuinely don't think something is worth installing, say so — don't manufacture reasons to install.
- For repos shaped `clavi-town`, file changes in our matching room (e.g., upstream Workshop/X) are particularly worth flagging for direct slot mapping.
- Never auto-pull. The scan is read-only by design.
