---
name: epistemax
description: "Full epistemic audit: chains adversarial-prompt + consensus-check + steelman-duel + premise-audit + blind-review into a master report. Use when the user says 'epistemax', 'full epistemic audit', 'make this bulletproof epistemically', 'run the full battery', or '/epistemax'. The nuclear option for epistemic rigor."
argument-hint: "[document path or claim]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Epistemax

The full epistemic battery. Runs 5 independent analyses on a document or claim in parallel, then synthesizes them into a master audit report. This is the nuclear option — use it for anything being published, any major decision, or any claim you need to be maximally confident about.

**Cost:** ~$1-2 per run (5 parallel analyses + synthesis). Worth it for anything important.

## The 5 Analyses

All 5 run in parallel as independent subagents:

| # | Analysis | What it does | Agents |
|---|---|---|---|
| 1 | **Adversarial** | Red team from 5 angles (empirical, logical, methodological, historical, steelman opposition) | 5 |
| 2 | **Consensus** | Independent FOR and AGAINST evidence search + synthesis | 3 |
| 3 | **Steelman duel** | Best argument each side by agents who can't see each other + judge | 3 |
| 4 | **Premise audit** | Surface every hidden assumption, rate how load-bearing | 1 |
| 5 | **Blind review** | Strip identifying info, compare blinded vs unblinded evaluation | 2 |

**Total agents: ~14** (running in parallel batches)

## Workflow

### Step 1: Read the input

Accept a document path or inline claim. If document, read it fully. Confirm scope with user: "Audit the whole document, or focus on a specific claim?"

### Step 2: Launch all 5 analyses

Spawn 5 top-level subagents, each running one analysis. They operate independently — none can see the others' work.

Each subagent receives the full document/claim plus its analysis-specific instructions (as defined in the individual skill SKILL.md files).

### Step 3: Collect all results

Wait for all 5 to complete. This may take 2-5 minutes depending on document length and rate limits.

### Step 4: Synthesis

A final synthesis agent reads ALL 5 reports and produces the master audit:

**Synthesis agent prompt:**
```
You are the synthesis agent for an Epistemax audit. You have received 5 independent
epistemic analyses of the same document/claim:

1. Adversarial (5-angle red team)
2. Consensus check (FOR vs AGAINST evidence)
3. Steelman duel (best arguments each side)
4. Premise audit (hidden assumptions)
5. Blind review (prestige bias check)

Your job:
- Identify the most important findings across all 5 analyses
- Look for convergence: where do multiple analyses flag the same issue?
- Look for surprises: findings that only one analysis caught
- Produce an overall epistemic confidence score (1-10)
- Recommend: publish as-is / revise / major rework / abandon
- Identify the single most important thing the author should address
```

### Step 5: Output

Save to `reviews/epistemax-YYYY-MM-DD.md` inside the current Workshop project (or output dir):

```markdown
# Epistemax Audit: [title]

**Date:** YYYY-MM-DD
**Document:** [path or inline claim]
**Analyses run:** 5 (adversarial, consensus, steelman, premises, blind review)
**Total agents:** ~14
**Runtime:** [X minutes]

---

## Verdict

**Overall epistemic confidence:** [1-10]
**Recommendation:** [publish as-is / revise section X / needs major rework / abandon]

**The single most important thing to address:**
[one paragraph — the finding that, if unaddressed, most undermines the work]

## Top Findings (cross-analysis)

| # | Finding | Flagged by | Severity | Action |
|---|---|---|---|---|
| 1 | [finding] | [which analyses] | [critical/high/medium/low] | [what to do] |
| 2 | ... | | | |
| 3 | ... | | | |

## Convergence Map

**Multiple analyses agree on:**
[issues flagged by 2+ independent analyses — these are the most reliable findings]

**Single-analysis findings:**
[issues only one analysis caught — may be noise, may be genuine blind spots]

## Analysis Summaries

### Adversarial (5-angle red team)
**Weakest flank:** [angle]
**Verdict:** [survives / partially / fails]
[2-3 paragraph summary]

### Consensus Check
**Expert consensus:** [for/contested/against]
**Evidence quality:** [robust/moderate/weak]
[2-3 paragraph summary]

### Steelman Duel
**Stronger side:** [FOR/AGAINST]
**The crux:** [key disagreement point]
[2-3 paragraph summary]

### Premise Audit
**Load-bearing assumptions:** [count]
**Danger zone (high-dependence + low-probability):** [count]
[2-3 paragraph summary]

### Blind Review
**Prestige bias detected?** [yes/no]
**Rating shift:** [Δ]
[2-3 paragraph summary]

---

## Full Reports

### 1. Adversarial Report
[complete output from adversarial-prompt]

### 2. Consensus Report
[complete output from consensus-check]

### 3. Steelman Report
[complete output from steelman-duel]

### 4. Premise Report
[complete output from premise-audit]

### 5. Blind Review Report
[complete output from blind-review]
```

## Parameters

| Param | Default | Description |
|---|---|---|
| `--skip` | none | Skip specific analyses: `--skip blind-review,steelman-duel` |
| `--focus` | whole document | Focus on specific claim within document |
| `--output-dir` | Current project `reviews/` | Where to save |

## Notes

- This is compute-heavy but still cheap (~$1-2). For any Forethought publication, running epistemax should be standard practice.
- The convergence map is the most valuable part — issues flagged by multiple independent analyses are almost certainly real.
- Individual analyses can also be run standalone via their own skills (`/adversarial-prompt`, `/premise-audit`, etc.)
- The `--skip` flag lets you run a lighter version if you don't need all 5 (e.g., skip blind-review for a claim without an author).
- Output goes to `reviews/` subfolder per Workshop guardrails rule.
