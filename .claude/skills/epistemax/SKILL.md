---
name: epistemax
description: "Full epistemic audit: chains adversarial-prompt + consensus-check + steelman-duel + premise-audit + blind-review into a single master report. Use when the user says 'epistemax', 'full epistemic audit', 'make this bulletproof epistemically', 'run the full battery', or '/epistemax'. The nuclear option for epistemic rigor."
argument-hint: "[document path or claim]"
metadata:
  author: the user & Claude
  version: 1.0.0
---

# Epistemax

The full epistemic battery. Runs 5 independent analyses on a document or claim in parallel, then weaves them into a single master report. This is the nuclear option — use it for anything being published, any major decision, or any claim you need to be maximally confident about.

**Cost:** ~$1-2 per run (5 parallel analyses + synthesis). Worth it for anything important.

**Output:** ONE comprehensive markdown file. The master report embeds every analysis in full — no separate per-analysis files.

---

## PDF Handling

If the input is a PDF:

1. Extract text once via `pdftotext -layout <path>.pdf <sibling>.txt` (preferred location: sibling `.txt`; if directory is read-only, fall back to `/tmp/<basename>.txt`).
2. All sub-analyses receive **both** paths — PDF (for figures / images) and `.txt` (for grep + reliable text + line refs).
3. **OCR caveat:** `pdftotext` may corrupt math symbols (`±`, `→`, `≤`), Greek letters, accented characters, ligatures, and table formatting. Anomalies should be sanity-checked against the PDF original. Tables are often the worst-affected.

For markdown / html / plain text inputs: no extraction needed.

---

## The 5 Analyses

All 5 run in parallel as independent subagents:

| # | Analysis | What it does |
|---|---|---|
| 1 | **Adversarial** | Red team from 5 angles (empirical, logical, methodological, historical, steelman opposition) |
| 2 | **Consensus** | Independent FOR and AGAINST evidence search + synthesis |
| 3 | **Steelman duel** | Best argument each side by agents who can't see each other + judge |
| 4 | **Premise audit** | Surface every hidden assumption, rate how load-bearing |
| 5 | **Blind review** | Strip identifying info, compare blinded vs unblinded evaluation |

Each analysis can either fan out further (calling its own sub-agents) or run as a single high-quality agent that does the equivalent work. Both are acceptable — pick based on document length and runtime budget.

---

## Output File

**ONE file**, always sibling to the document:

```
<doc-dir>/epistemax-<doc-slug>.md
```

- **`doc-slug`**: input filename without extension, lowercased, hyphens for spaces (e.g. `Eternity-in-six-hours.pdf` → `eternity-in-six-hours`).
- **Claim-based input** (no document): `<cwd>/epistemax-<claim-slug>.md` where slug = first 4–6 keywords of the claim, lowercased + hyphenated.
- **Existing file?** Append `-2` / `-3` etc. to the slug. Never overwrite.

No per-analysis files, no `reviews/` subfolder.

---

## Workflow

### Step 1: Read the input

Accept a document path or inline claim. If document, read it fully (do PDF extraction first if needed). For autonomous / `/loop` / cron contexts, default to whole-document scope. Otherwise confirm with user: "Audit the whole document, or focus on a specific claim?"

### Step 2: Launch all 5 analyses

Spawn 5 top-level subagents, each running one analysis. They operate independently — none can see the others' work. Each receives the full document/claim plus its analysis-specific instructions.

Optionally, agents can write to a staging directory (`/tmp/epistemax-<slug>-staging/`) instead of returning their full output as their response — useful for long analyses where context-window pressure matters.

### Step 3: Collect all results

Wait for all 5 to complete. Typically 2–10 minutes parallel wall clock depending on document length and rate limits.

### Step 4: Synthesis

A final synthesis pass reads all 5 reports and produces the master file. Synthesis priorities:

- **Convergence**: where do multiple analyses flag the same issue? These are the most defensible findings.
- **Surprises**: findings only one analysis caught — may be noise, may be genuine blind spots.
- **Cross-cuts**: an objection from Adversarial that maps to a fragile premise from Premise Audit, etc.
- **Verdict**: overall epistemic confidence (1-10), recommendation, single most important thing to address.

### Step 5: Write the single mega-file

Write everything to `<doc-dir>/epistemax-<doc-slug>.md` in this structure:

```markdown
# Epistemax Audit: [title]

**Date:** YYYY-MM-DD
**Document:** [path, clickable link]
**Analyses run:** 5 (adversarial, consensus, steelman, premises, blind review)
**Total agents:** [count]
**Runtime:** [X minutes]

---

## Verdict

**Overall epistemic confidence:** [1-10]
**Recommendation:** [publish as-is / revise section X / needs major rework / abandon]

**The single most important thing to address:**
[one paragraph — the finding that, if unaddressed, most undermines the work]

---

## Top Findings (cross-analysis)

| # | Finding | Flagged by | Severity | Action |
|---|---|---|---|---|
| 1 | [finding] | [which analyses] | 🔴 / 🟡 / 🟢 | [what to do] |
| 2 | ... | | | |

---

## Convergence Map

**Multiple analyses agree on (most reliable findings):**
- [issue + which analyses caught it]

**Single-analysis findings (may be noise, may be genuine blind spots):**
- [issue + which analysis]

---

## Analysis Summaries

### Adversarial (5-angle red team)
**Weakest flank:** [angle]
**Verdict:** [survives / partially / fails]
[2-3 paragraph summary]

### Consensus Check
**Expert consensus:** [for / contested / against]
**Evidence quality:** [robust / moderate / weak]
[2-3 paragraph summary]

### Steelman Duel
**Stronger side:** [FOR / AGAINST / inconclusive]
**The crux:** [key disagreement point]
[2-3 paragraph summary]

### Premise Audit
**Load-bearing assumptions:** [count]
**Danger zone (high-load + low-probability):** [count]
[2-3 paragraph summary]

### Blind Review
**Prestige bias detected?** [yes / no]
**Rating shift:** [Δ]
[2-3 paragraph summary]

---

## Full Reports

### 1. Adversarial Report
[complete output from adversarial-prompt analysis]

### 2. Consensus Report
[complete output from consensus-check analysis]

### 3. Steelman Report
[complete output from steelman-duel analysis]

### 4. Premise Report
[complete output from premise-audit analysis]

### 5. Blind Review Report
[complete output from blind-review analysis]
```

**Single Write call.** If you used a staging directory, delete it after the final file is written.

---

## Parameters

| Param | Default | Description |
|---|---|---|
| `--skip` | none | Skip specific analyses: `--skip blind-review,steelman-duel` |
| `--focus` | whole document | Focus on a specific claim within the document |

---

## Notes

- **The convergence map is the most valuable part** — issues flagged by multiple independent analyses are almost certainly real.
- **Individual analyses can also be run standalone** via their own skills (`/adversarial-prompt`, `/premise-audit`, `/consensus-check`, `/steelman-duel`, `/blind-review`).
- **The `--skip` flag** lets you run a lighter version if you don't need all 5 (e.g., skip blind-review for a claim without an author).
- **Pair with `/deep-review`** for a complete picture: epistemax interrogates the argument, deep-review interrogates the prose + calculations + facts + reader reactions. Run both in parallel — they don't overlap.
- **Word-count guidance, not caps.** If an analysis needs 3000 words to be substantive, write 3000 words. Substance > brevity.