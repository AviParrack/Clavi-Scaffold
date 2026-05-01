# Embassy — Northeast

*Organizations you belong to. Each org gets its own subfolder. Their scaffolding, style guides, internal processes, and admin can live here without crowding your personal `Town-Hall/User/` space.*

## What goes here

- **One subfolder per org.** Common patterns:
  - `Embassy/[Org-Name]/` — the org's main folder
  - `Embassy/[Org-Name]/CLAUDE.md` — orientation for that org (style guide, voice, conventions)
  - `Embassy/[Org-Name]/admin/` — internal docs, contact lists, ongoing initiatives
  - `Embassy/[Org-Name]/style/` — formatting guides, brand assets, voice rules

## How embassies interact with the rest of the scaffold

- **Path-scoped rules** in `.claude/rules/` can target a specific org. E.g., a rule scoped to `Embassy/Org/**` makes Claude follow the 'Org' style only in that subtree.
- **Submodules:** if your org has its own skill collection or shared repo, register it via `Crossroads/repos.yaml` and symlink the relevant skills into `.claude/skills/`.
- **Workshop projects** that ship to a specific org cite the embassy folder for style/process; the actual project work happens in Workshop, not here.

## This folder is empty in a fresh clone

Add your orgs as you start working with them. Many users have just one (their employer or primary affiliation); others have several (research org + university + community group).

If you don't belong to any organizations, this folder can stay empty — the rest of the scaffold works fine without it.
