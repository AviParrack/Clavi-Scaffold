---
name: memory-synthesis
description: "Weekly memory consolidation: resolve contradictions, merge duplicates, convert dates, promote feedback patterns, prune stale entries. Use when the user says 'memory synthesis', 'consolidate memory', 'clean up memories', 'dream', or '/memory-synthesis'. Also runs as a Sunday cron."
argument-hint: "[--dry-run] [--auto-apply] [--full-report]"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Memory Synthesis

The janitor + librarian for accumulated context. Reads all memory sources, cleans them up, surfaces patterns, and ensures the auto-loaded memory is current and non-contradictory.

**Runs weekly (Sundays) or on demand.**

## Why This Matters

Every Claude session reads MEMORY.md automatically. If memory entries are stale, contradictory, or cluttered, every future Claude instance inherits bad context. Memory-synthesis keeps this clean — it's hygiene for the scaffold's brain.

## Sources to Read

Read ALL of these before making any changes:

### 1. Auto-memory (loaded every session)
```
~/.claude/projects/<your-project-id>/memory/MEMORY.md  ← the index
~/.claude/projects/<your-project-id>/memory/*.md       ← all topic files
```

### 2. Feedback log (auto-captured by hook)
```
Library/Logs/feedback-log.md
```

### 3. Metadata logs (auto-captured by hook)
```
Library/Logs/metadata/  ← recent JSONL files (last 7 days)
```

### 4. Scout calibration
```
Harbor/Dispatch/scout-calibration.md
```

### 5. Existing patterns
```
Library/Logs/PATTERNS.md
```

## The Six Operations

### Operation 1: Convert Relative Dates (auto-apply)

Scan all memory files for relative date references. Convert to absolute dates based on the file's last-modified timestamp or any explicit date in the content.

| Before | After |
|---|---|
| "yesterday" | "2026-04-22" |
| "last week" | "week of 2026-04-14" |
| "recently" | "as of 2026-04-10" (use file modification date) |
| "a few days ago" | "around 2026-04-20" |

**Auto-apply:** Yes — this is always safe. No information is lost.

### Operation 2: Merge Duplicates (auto-apply)

Find memory entries that say the same thing in different words. Merge into one entry, keeping the most specific/recent version.

Example:
```
Entry A: "the user prefers short paragraphs"
Entry B: "Default to scannable: bold leads, short paragraphs"
→ Keep B (more specific), delete A, update MEMORY.md index
```

**Auto-apply:** Yes, if the entries are clearly saying the same thing. Flag if uncertain.

### Operation 3: Resolve Contradictions (flag for review)

Find memory entries that conflict with each other. Present both to the user with a recommendation.

Example:
```
Entry A (March 5): "the user wants more epistemic hedging"
Entry B (April 10): "the user said stop over-hedging"
→ FLAG: These contradict. Likely A is outdated. Recommend: keep B, archive A.
```

**Auto-apply:** No — present to the user. Contradictions often reflect genuine changes in preference, and only the user knows which is current.

### Operation 4: Prune Stale Entries (flag for review)

Find entries that reference:
- Projects that no longer exist or have been archived
- Old folder paths (Bridge/, Lab/, etc.)
- People/roles that may have changed
- Completed tasks still described as in-progress
- Anything older than 60 days that hasn't been validated

**Auto-apply:** Auto-fix old paths (Bridge/ → new paths). Flag everything else for review.

### Operation 5: Promote Feedback Patterns (flag for review)

Read `Library/Logs/feedback-log.md`. Look for recurring themes — the same feedback given 2+ times should probably become a memory entry or a rule.

Example:
```
Feedback log shows:
  2026-04-15: "feedback: stop summarizing at the end of responses"
  2026-04-18: "feedback: don't recap what you just did"
  2026-04-22: "feedback: the trailing summary is unnecessary"
→ PROMOTE: Create memory entry "feedback_no_trailing_summaries.md"
  and add to MEMORY.md index. Consider: should this be a .claude/rules/ file instead?
```

**Auto-apply:** No — present the pattern to the user. He decides if it becomes a memory, a rule, or is just situational.

### Operation 6: Lint Knowledge Graph (auto-apply safe, flag rest)

Scan the Knowledge Graph wiki for health:

1. **Index sync** — scan `Library/Knowledge-Graph/wiki/` for any .md files not listed in `Library/Knowledge-Graph/index.md`. Auto-add missing entries with topic and one-line summary extracted from the file's frontmatter/first paragraph.

2. **Orphan pages** — wiki pages with zero inbound cross-references from other pages. Flag for review (might need linking or might be standalone).

3. **Broken cross-references** — `[[page-name]]` links in wiki pages that point to pages that don't exist. Flag for review.

4. **Stale project links** — wiki pages with `projects:` frontmatter pointing to Workshop projects that no longer exist (archived or deleted). Auto-fix if the project moved to archived/; flag if deleted.

5. **Missing bidirectional links** — wiki page references a Workshop project but that project's HANDOFF.md doesn't link back. Flag for manual add.

**Auto-apply:** Index sync (adding missing pages to index.md). Everything else flagged.

### Operation 7: Surface Metadata Insights (report only)

Read the last 7 days of `Library/Logs/metadata/*.jsonl`. Report:
- Most-used tools (what does the workflow actually look like?)
- Most-active workshops (where is time being spent?)
- Most-invoked skills (which skills earn their keep?)
- Session count and average duration
- Any skills that are NEVER invoked (candidates for removal from active list)

**Auto-apply:** No — this is informational. Goes into PATTERNS.md.

## Workflow

### Step 1: Read all sources
Read everything listed above. Build a complete picture of current memory state.

### Step 2: Run operations 1-6
For each operation, track:
- What was found
- What was auto-applied
- What needs the user's review

### Step 3: Apply safe changes
Auto-apply operations 1 (dates), 2 (clear duplicates), and path fixes from 4 (stale paths).

### Step 4: Present review items
Show the user everything that needs approval:
```
## 🔍 Memory Synthesis — Items for Review

### Contradictions Found
1. [entry A] vs [entry B] → Recommend: [keep which]

### Stale Entries
1. [entry] — [why it seems stale] → Recommend: [archive/update/keep]

### Feedback Patterns to Promote
1. [pattern] (seen [N] times) → Recommend: [memory entry / rule / ignore]
```

Wait for the user's approval before applying flagged changes.

### Step 5: Write synthesis log
Append a dated entry to `Library/Logs/PATTERNS.md`:

```markdown
## Synthesis — YYYY-MM-DD

**Auto-applied:**
- [N] relative dates converted
- [N] duplicates merged
- [N] stale paths fixed

**Flagged for review:**
- [N] contradictions
- [N] stale entries
- [N] feedback patterns

**the user's decisions:**
- [what was approved/rejected]

**Metadata insights:**
- Top tools: [list]
- Most active workshops: [list]
- Top skills: [list]
- Sessions this week: [N]
- Never-invoked skills: [list]

**Recurring Wins:** [any new patterns added]
**Recurring Failures:** [any new patterns added]
**Proposed Patches:** [any skill/rule changes suggested]
```

### Step 6: Commit
```bash
git add -A
git commit -m "🧠 Memory synthesis — YYYY-MM-DD: [N] fixes, [N] flagged"
git push origin main
```

## Parameters

| Param | Default | Description |
|---|---|---|
| `--dry-run` | false | Report what would change without applying anything |
| `--auto-apply` | true | Apply safe changes automatically (dates, duplicates, paths) |
| `--full-report` | false | Include complete metadata analysis (verbose) |

## Schedule

**the user's personal config:** Sunday 10:00 AM via autodesk cron.

```
Cron: 0 10 * * 0
Prompt: "Run /memory-synthesis. Auto-apply safe changes. Present flagged items for review. Write synthesis log to PATTERNS.md. Commit and push."
```

## Notes

- This skill modifies memory files. That's intentional — it's the only skill authorized to do so automatically (for safe operations).
- The feedback-log → memory promotion pipeline is the mechanism that makes the user's corrections permanent without him having to manually save memories.
- Metadata insights are the empirical basis for skill budget decisions — if a skill is never invoked, it shouldn't be in the active set.
- The synthesis log in PATTERNS.md is the audit trail. If a memory was changed, you can trace when and why.
- For new users: this skill works with whatever memory exists. Empty memory = nothing to clean. It's safe from day one.
