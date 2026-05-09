---
description: Organization rules for Workshop project folders
paths: ["Workshop/**"]
---

# Workshop Guardrails

You are working inside a Workshop project. Follow these rules:

1. **All outputs stay inside this project folder.** Never create files in Workshop/ root, other projects, or random locations. If you're working on a project named `[project]`, everything goes in `Workshop/[project]/`.

2. **Use subfolders to organize.** Research in research/, drafts in drafts/, figures in figures/, etc. Don't pile everything flat at the project root.

3. **Check what already exists before creating new files.** Read the directory listing first. Don't create duplicates of files that already exist under slightly different names.

4. **One version, not five.** When creating a new version of something, update the original file in place. If you genuinely need to keep the old version, move it to an `old/` subfolder. Never accumulate v1.md, v2.md, v3.md, v4.md at the same level.

5. **Git is your safety net.** Every version is checkpointed in git history. Be willing to clean up and delete old junk. You can always recover from git if needed.

6. **Periodically take stock.** Before starting a work session in a project, scan the folder structure. What's here? What's the current state? Where did the last session leave off? Read the HANDOFF.md if one exists.

7. **Reviews are single-file outputs.** `/deep-review` writes one file (`deep-review-<doc-slug>.md`) sibling to the document; `/epistemax` writes `epistemax-<doc-slug>.md` in the same pattern. No `reviews/` subfolder.
