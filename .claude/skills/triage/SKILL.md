---
description: "Triage inbox items: reduce, reflect, gate, integrate. Use when the user says 'triage', 'triage inbox', 'review inbox', 'what's in the inbox', or '/triage'."
---

# Triage — Gated Knowledge Integration

You are running the triage pipeline for the user's workspace. This is a **gated** system — you propose, the user decides. Never integrate research into the knowledge base without the user's explicit sign-off.

## Before anything else

1. Read `Library/Knowledge-Graph/PREMISES.md`. These are the user's worldview commitments. All analysis must be grounded in these premises.
2. Read `Harbor/Inbox/README.md` for the tier definitions.

## Pipeline

### Phase 1: RECORD (already done)

Items are already in `Harbor/Inbox/`. List what's pending triage:

```bash
ls Harbor/Inbox/*.md | grep -v README
```

If inbox is empty, tell the user and stop.

### Phase 1.5: Special inbox types (handle before the standard pipeline)

Some inbox items are not research to integrate — they're reports that need their own handler. Detect them by filename pattern and route accordingly:

| Pattern | Handler | What it is |
|---|---|---|
| `crossroads-YYYY-MM-DD.md` | See "Crossroads reports" below | Daily scan of whitelisted external repos |

For everything else, proceed to Phase 2.

#### Crossroads reports

A Crossroads scan report lists update proposals for one or more whitelisted external repos. Each section in the report corresponds to one repo with new commits, and each section ends with an action menu like `[install / pull-only / skip / view-diff]`.

**Workflow:**

1. **Read the full report.** It already contains Claude's value-prop summary per repo. Don't re-summarise — the work has been done.
2. **Present each repo's section to the user** in turn (or all at once if there are 3 or fewer). Lead with the repo name, the commit count, and the value-prop in 1-2 sentences. Don't ask the user to read the whole report — surface what's actionable.
3. **For each repo, ask the action question** (`install / pull-only / skip / view-diff`):
   - `install` — pull the submodule + add specified symlinks. If the report proposed specific skills to install, confirm them; if it just said "install," default to pulling and ask the user which skills (if any) to symlink.
   - `pull-only` — move the submodule pointer but don't add new symlinks. Useful for skill packs where existing symlinks should auto-update but no new skills are wanted.
   - `skip` — note the scan but don't pull. Mark the section in the inbox file as `**SKIPPED <date>**`.
   - `view-diff` — show the user the actual diff (`gh api repos/<owner>/<repo>/compare/<old>...<new>` or `cd Crossroads/<name> && git log --stat <old>..origin/HEAD`) and re-ask the action question.
4. **For each `install` or `pull-only`**, invoke `/crossroads-install <repo-name>` with the appropriate action. That skill handles: submodule pull, symlink creation, manifest update, install log, parent-repo commit.
5. **After all repo sections handled**, mark the inbox file as processed:
   - If everything was installed/pull-only/skipped (i.e., every section is now resolved), move the file to `Library/Archive/inbox/crossroads-YYYY-MM-DD.md` to preserve history without cluttering the inbox.
   - If any section was deferred, leave the file in place with deferred sections clearly marked.

Crossroads items are **not** integrated into the knowledge graph (no PREMISES update, no wiki page, no KEY_FINDINGS entry). They're infrastructure — the colour system doesn't apply.

### Phase 2: REDUCE (auto)

For each pending item:

1. **Read the full document.**
2. **Extract key claims** — what are the 3-5 most important assertions or findings?
3. **Check premise alignment** — does the research assume the user's premises (PREMISES.md), or does it operate from different assumptions? Flag any divergence explicitly:
   - "This analysis assumes no intelligence explosion"
   - "This treats space expansion as speculative rather than engineering-feasible"
   - "This critique comes from a utilitarian framework the user doesn't fully endorse"
4. **Tag confidence levels** — for each key claim, is it well-sourced, speculative, or somewhere between?
5. **Produce a reduction card** — a structured summary block.

### Phase 3: REFLECT (auto)

For each reduced item:

1. **Scan Workshop projects.** Read HANDOFF.md files and key documents across all active projects (check CLAUDE.md Active Projects table for the list). A finding may connect to multiple projects at once — note all of them.
2. **Identify connections** — which projects or files would be affected if this research were integrated? Be specific: name files, name claims that would change.
3. **Produce a connection map** — a list of "If integrated, this would affect X because Y." Separate research connections (knowledge graph, premises) from project connections (active workshops, drafts) so the user can see the research impact vs. the publishing impact.

### Phase 4: GATE (the user decides)

Present each item to the user in this format:

```
## [Item title]

**Source:** [research-sprint / manual / agent-proposal]
**Premise alignment:** [aligned / partially divergent / significantly divergent]
**Divergence notes:** [if any — be specific about which premises are violated]

### Key claims
1. [Claim] — confidence: [high/medium/low]
2. ...

### Connection map
- [Project/file] — [how it would be affected]
- ...

### Proposed: [🥇 Gold / 🟢 Green / 🟡 Yellow / 🔴 Red]
**Rationale:** [why this color]
```

Then ask the user:

> 🥇 Gold / 🟢 Green / 🟡 Yellow / 🔴 Red?

**Wait for the user's response.** Do not proceed without it.

### Phase 5: INTEGRATE (gated by color)

Based on the user's assigned color:

**🥇 Gold — Core (load-bearing knowledge, updates premises):**

1. **Update PREMISES.md.** Propose the specific addition or revision to `Library/Knowledge-Graph/PREMISES.md`. Show the diff. the user approves before committing.
2. **Add to KEY_FINDINGS.md.** Dated entry with: core claim, confidence level, source file, which premises it affects.
3. **Create wiki page** at `Library/Knowledge-Graph/wiki/{topic-slug}.md`:
   ```yaml
   ---
   topic: [topic]
   color: gold
   date: YYYY-MM-DD
   sources: [list of source files]
   related: [links to related wiki pages]
   projects: [Workshop projects this feeds]
   tags: [topic tags for discovery]
   ---
   ```
   Body = full synthesis: reasoning, evidence, conclusions, confidence levels. Must make sense to a reader with no other context. Cross-reference related wiki pages with `[[page-name]]` links.
4. **Update index.md.** Add the page to `Library/Knowledge-Graph/index.md` with one-line summary + project links.
5. **Update log.md.** Append ingest entry to `Library/Knowledge-Graph/log.md`.
6. **Cross-reference.** Read index.md for related wiki pages. Add bidirectional links (new→old, old→new). A single ingest might touch 5-15 pages.
7. **Link back to Workshop.** If this feeds an active Workshop project, update that project's HANDOFF.md with a "Wiki pages" reference: `Wiki: [[topic-slug]]`.
8. **Propose reweave edits** to connected Workshop files. Show diffs. the user reviews.
9. Move inbox item to relevant Workshop project folder.

**🟢 Green — Solid (worth compiling into knowledge):**

1. **Create wiki page** at `Library/Knowledge-Graph/wiki/{topic-slug}.md`:
   ```yaml
   ---
   topic: [topic]
   color: green
   date: YYYY-MM-DD
   sources: [list of source files]
   related: [links to related wiki pages]
   projects: [Workshop projects this feeds]
   tags: [topic tags]
   ---
   ```
   Body = standalone synthesis. May be shorter than Gold but still self-contained.
2. **Update index.md and log.md.**
3. **Cross-reference** related wiki pages (bidirectional).
4. **Link back to Workshop** — update relevant project HANDOFF.md with wiki reference.
5. **Add to KEY_FINDINGS.md** if the finding is significant enough (use judgment).
6. Move inbox item to relevant Workshop project folder.

**🟡 Yellow — Interesting but not now:**

- Move to `Library/Someday/` with topic tags in frontmatter.
- No wiki page. No cross-referencing.
- Available for future discovery via tags.

**🔴 Red — Discard:**

- Delete. Git preserves history.
- Add rejection reason in commit message so agents don't re-surface it.

### Phase 6: VERIFY (auto)

After all integrations:

1. Check that HANDOFF.md files for affected projects are up to date.
2. Check for contradictions — does the newly integrated content conflict with anything already in the knowledge base?
3. Report any issues to the user.

## Reverse flow: Workshop → Lab

When working in Workshop and a research gap or open question emerges, drop a note in `Harbor/Inbox/` with this frontmatter:

```yaml
---
source: workshop-feedback
date: [YYYY-MM-DD]
status: pending
tier: null
originating_project: [Workshop/<project-slug>/]
question: [the gap or question that needs research]
---
```

This closes the loop — Workshop identifies what needs investigating, Lab processes it.

---

## Key principles

- **You propose, the user decides.** Never skip the gate.
- **Premise alignment is the first filter.** If research doesn't take the user's premises seriously, flag it immediately — don't wait for the gate to mention it.
- **Be specific about what would change.** Vague claims like "this affects project X" are useless. Concrete claims like "this would change timeline T in Workshop/X/HANDOFF.md from 'within decades' to 'within years'" are useful.
- **the user is bandwidth-constrained.** Make the gate as efficient as possible. Lead with the tier recommendation and the most important claim. Don't bury the lead.
- **When in doubt, go Yellow.** It's cheap to promote something to Green later. It's expensive to undo a bad Gold integration.

## Scaling notes

As trust builds:
- Yellow items can auto-archive without review (the user opts in)
- Green items in well-understood domains can auto-integrate (the user opts in per-domain)
- Gold always requires the user's eyes. Always. It touches PREMISES.md.