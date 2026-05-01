---
name: crossroads-add
description: "Whitelist a new external GitHub repo into Crossroads as a trusted source. Use when Avi says 'crossroads add <url>', 'whitelist this repo', 'add this to crossroads', or '/crossroads-add'. Adding to the whitelist = trusting whoever can push to that repo."
---

# Crossroads — Add Repo

You are onboarding a new external repo into the Crossroads trust boundary. Adding it = whitelisting. Once added, future updates flow through `/crossroads-scan` → `/triage` → `/crossroads-install`.

## Before anything else

1. Read `Crossroads/repos.yaml` — current manifest. You'll be appending to it.
2. Read `Town-Hall/Scaffold/crossroads-design.md` if you need refresher on the model.

## Inputs

The user provides a GitHub URL. Examples:
- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `git@github.com:owner/repo.git`

Extract `<owner>/<repo>` from any of these.

## Workflow

### Phase 1: Fetch and present metadata

Run these in parallel:

```bash
gh api repos/<owner>/<repo>                                          # repo metadata
gh api repos/<owner>/<repo>/commits/HEAD                             # latest commit
gh api repos/<owner>/<repo>/commits --jq '.[:5] | .[] | {sha,date:.commit.author.date,msg:.commit.message}' --raw-output  # recent 5 commits
gh api repos/<owner>/<repo>/contents -q '.[].path'                   # top-level files/dirs
gh api repos/<owner>/<repo>/readme -q '.content' | base64 -d | head -100   # README excerpt
```

Show Avi:
- Repo name + description + star count + last activity
- README excerpt (first ~80 lines)
- Last 5 commit titles with dates
- Top-level file/folder layout

### Phase 2: Detect scaffold shape

Inspect the file/folder layout for these signatures:

| Shape | Signal |
|---|---|
| `clavi-town` | Has all four of: `Town-Hall/`, `Harbor/`, `Workshop/`, `Library/` |
| `clavi-ship` | Has all four of: `Bridge/`, `Hangar Bay/`, `Engineering/`, `Databanks/` |
| `foreign` | None of the above |

For `foreign`, also note what's predominant: skill collection (`.claude/skills/` or top-level `skills/`), markdown notes, full project, etc.

### Phase 3: Ask Avi the four questions

Format as scannable questions, not a wall of prose. Include defaults:

> **Category:** how should this slot in the manifest?
> - `friend` — individual collaborator's repo
> - `skill-pack` — third-party skill collection (gstack-style)
> - `infra` — scaffold infrastructure (clavi-scaffold, trailofbits-config)
> - `org` — organisation's repo
>
> **Summary depth:** `rich` (Claude reads each diff and writes a value-prop) or `titles` (just commit titles + file counts). Default: `rich` for friend/org, `titles` for skill-pack/infra.
>
> **Watch globs:** which paths should the scout pay special attention to? Defaults by detected shape:
> - clavi-* → `.claude/skills/**`, `.claude/rules/**`, `.claude/hooks/**`, `Town-Hall/Scaffold/**`
> - foreign skill-pack → `skills/**`, `agents/**`, `commands/**`
> - foreign other → `**` (everything) — tweak after first scan
>
> **Trust confirmation:** "Adding this means trusting whoever can push to `<owner>/<repo>`. Confirmed?"

### Phase 4: Add submodule and register

After confirmation:

```bash
git submodule add <url> Crossroads/<repo-name>
```

Then append a new entry to `Crossroads/repos.yaml` with:
- `name: <repo-name>` (just the repo part of the URL, lowercased)
- All the answers from Phase 3
- `scaffold_shape:` from Phase 2 detection
- `last_scanned: null`
- `last_pulled_sha:` and `pinned_sha:` set to current submodule HEAD (`cd Crossroads/<name> && git rev-parse HEAD`)
- `symlinks: []` (populate after Phase 5)
- `notes:` brief — date added, why, anything Avi mentioned

### Phase 5: Initial slotting scan

Look at what's actually in the new submodule. Surface install proposals:

```bash
# Skills
find Crossroads/<name>/skills -name SKILL.md -maxdepth 3 2>/dev/null
find Crossroads/<name>/.claude/skills -name SKILL.md -maxdepth 3 2>/dev/null
# Agents
find Crossroads/<name>/agents -name "*.md" 2>/dev/null
find Crossroads/<name>/.claude/agents -name "*.md" 2>/dev/null
# Rules
find Crossroads/<name>/.claude/rules -name "*.md" 2>/dev/null
```

For each found skill/agent/rule, propose a slot:

> Found `skills/red-team-doc/SKILL.md` (read first 30 lines for context).
> **Slot:** symlink to `.claude/skills/<name>-red-team-doc/` (prefixed to avoid collision).
> Install? [yes / skip / different name]

For repos shaped `clavi-town`, suggest installing skills *without* a name prefix when there's no collision (since the scaffold is structurally compatible). For `foreign` repos, default to prefixing with the repo name to avoid namespace clashes.

### Phase 6: Apply approved installs and finalise

For each `yes`:
- Create the symlink: `ln -s ../../Crossroads/<repo-name>/<source-path> .claude/skills/<target-name>` (use relative paths from `.claude/skills/` — `../../Crossroads/...`)
- Append to that repo's `symlinks:` list in `repos.yaml`

Append to `Crossroads/log/installs.md` (create the directory + file if needed):

```markdown
## <YYYY-MM-DD HH:MM> — added <repo-name>

- URL: <url>
- Initial SHA: <sha>
- Symlinks installed: <N>
  - <list>
- Notes: <whatever Avi said>
```

Commit to the parent repo:

```bash
git add .gitmodules Crossroads/<name> Crossroads/repos.yaml Crossroads/log/installs.md .claude/skills .claude/agents
git commit -m "Crossroads: add <repo-name> + install <N> skill(s)"
```

(Do NOT push. Avi commits/pushes on their own cadence.)

### Phase 7: Confirm

Tell Avi: repo is registered, N skills installed, scout will check it on next overnight run (4:50 AM). Note any open questions or unfamiliar files in the repo that Avi might want to look at manually.
