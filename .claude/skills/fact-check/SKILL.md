---
name: fact-check
description: "Deep automated fact-checking for research documents. Use this skill when the user asks to 'fact-check', 'verify claims', 'check sources', 'verify this paper', or says '/fact-check'. Can run standalone or as a sub-skill of /deep-review. Spawns parallel agents for each section. Every verifiable claim is traced to primary sources, cross-referenced, and assessed for consensus vs. cherry-picking. Output is a structured report with severity ratings, source links, and Ctrl+F search snippets for every finding."
argument-hint: "[document path] [--section N] [--section-text 'raw text']"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Fact-Check

A deep, compute-intensive automated fact-checker. Treats every verifiable claim as a lead to investigate. The aspiration: match what a professional fact-checker would produce in a week of full-time work.

This skill can run **standalone** (`/fact-check path/to/doc.md`) or be invoked as a **sub-skill by `/deep-review`**, which passes individual sections.

---

## Epistemic Standards

All output follows the user's epistemic standards (see `.claude/rules/`). Key principles:
- Directional conviction with calibrated confidence
- Source hierarchy: peer-reviewed > government reports > investigative journalism > expert assessment > training data (flagged)
- Never fabricate a citation. "I could not verify this" is always acceptable.

---

## Execution Flow

### Phase 0: Intake

When invoked:

1. **Read the document** (or section, if passed a section by `/deep-review`).
2. **Check web access.** Fact-checking without web search is severely degraded. If denied:
   > "Web search is unavailable. Fact-checking quality will be significantly reduced — I can only check against training knowledge, which may be outdated. I strongly recommend granting web search permission."
3. If running standalone on a full document, **parse into sections** and spawn one fact-check agent per section (each reads the full document for context, then focuses on their assigned section). If invoked by `/deep-review` on a single section, run directly.

### Phase 1: Claim Extraction

Systematically extract every verifiable claim from the section. A "verifiable claim" is anything that could in principle be checked against an external source:

- **Empirical facts** — statistics, measurements, quantities, dates, events
- **Direct quotes** — attributed statements from named individuals or publications
- **Named results** — theorems, findings, named effects with specific properties
- **Attributions** — "X was first proposed by Y", "Z discovered that..."
- **Comparative claims** — "A is larger/faster/more common than B"
- **Causal claims** — "X causes Y", "X leads to Y" (check if the source actually supports causation vs. correlation)
- **Consensus claims** — "most experts agree", "the literature suggests" (verify this is actually the consensus)

For each claim, record:
- The claim as stated in the document
- **📍 Search snippet** — a short, distinctive phrase (5-15 words) from the exact location in the document that can be used with Ctrl+F to jump straight to it. Choose words that are unique enough to produce only one match.
- The type of claim (from the list above)

### Phase 2: Source Investigation (Per Claim)

For each extracted claim, conduct a thorough investigation. This is the compute-intensive core of the skill. **Do not rush this phase.** Each claim gets its own mini-investigation.

#### Step 1: Find the primary source
- If the document cites a source, **go to that source**. Web-fetch the URL or search for the paper/report by title.
- If the URL is dead, search for the source by title/author to find a working link.
- If no source is cited, search for the claim to find where it originates.

#### Step 2: Verify the claim against the source
- Does the source actually say what the document claims it says?
- Is the number/quote/finding accurately represented?
- Is it taken in context, or does the source say something more nuanced?
- **For quotes:** Compare exact wording. If the quote is inexact, provide the real quote with differences highlighted.
- **For numbers:** Check if the number appears in the source in the same context. Watch for unit errors, rounding issues, or numbers from different time periods.

#### Step 3: Multi-source triangulation
- Search for **3+ independent sources** that address the same claim.
- Do they agree? Partially agree? Contradict?
- If sources disagree, characterize the disagreement landscape: who says what, and what might explain the divergence (different methodology, different time period, different definition, etc.).

#### Step 4: Consensus vs. cherry-pick assessment
- Does the cited finding represent the **field's consensus**, a **minority view**, or a **contested claim**?
- If the document presents a minority view as consensus (or vice versa), flag this prominently.
- Look for meta-analyses, systematic reviews, or expert surveys that characterize the state of the field.

#### Step 5: Check for more recent data
- Is there more recent data that updates or supersedes the cited source?
- Has the finding been replicated, retracted, or revised?

### Phase 3: Verdict Assembly

For each claim, produce a structured finding:

```markdown
### Claim: [Brief description]

📍 **Search:** `"distinctive phrase from document for Ctrl+F"`

**Claim as stated:** "[exact text from document]"

**Verdict:** 🔴 Incorrect / 🟡 Partially accurate / 🟢 Verified / ⚪ Unverifiable

**What the source says:**
[Quote or summary from the actual source, with link]
Source: [Full citation with URL]

**Multi-source check:**
- [Source 2]: [agrees/disagrees/adds nuance] — [URL]
- [Source 3]: [agrees/disagrees/adds nuance] — [URL]

**Consensus assessment:** [Mainstream consensus / Minority view / Actively contested / Insufficient literature]

**If incorrect — proposed correction:**
> [Replacement text that would make the claim accurate]

**Confidence in this verdict:** [High / Medium / Low]
[Brief explanation of confidence level]
```

### Phase 4: Section Summary

After all claims are assessed, produce a section-level summary:

```markdown
## Section Fact-Check Summary: [Section Name]

**Claims checked:** N
**Breakdown:** 🔴 X incorrect | 🟡 Y partially accurate | 🟢 Z verified | ⚪ W unverifiable

### 🔴 Must-Fix Issues
[List the red findings with one-line summaries — these need immediate attention]

### 🟡 Should-Fix Issues
[List the yellow findings]

### Notable Findings
[Anything surprising — a claim that turned out to be more nuanced than presented, an interesting source disagreement, a finding that's technically correct but potentially misleading]
```

---

## Output Format

### When running standalone (full document)

Create a `fact-check/` directory alongside the document:

```
fact-check/
  00-INDEX.md              # Dashboard: severity rollup per section
  01-section-name.md       # Detailed findings for section 1
  02-section-name.md       # Detailed findings for section 2
  ...
```

The `00-INDEX.md` provides a quick-scan dashboard:

```markdown
# Fact-Check Report: [Document Title]
**Date:** [date]
**Document:** [path]
**Total claims checked:** N

## Severity Dashboard

| Section | 🔴 | 🟡 | 🟢 | ⚪ | Highest Severity |
|---|---|---|---|---|---|
| Introduction | 0 | 2 | 5 | 1 | 🟡 |
| Thermal Model | 1 | 1 | 8 | 0 | 🔴 |
| ...

## All 🔴 Issues (Must Fix)
[Collected from all sections, with section labels and search snippets]

## All 🟡 Issues (Should Fix)
[Collected from all sections]
```

### When invoked by /deep-review (single section)

Return the section findings directly. The `/deep-review` skill handles file creation and indexing.

---

## Execution Notes

- **Parallelism:** When running standalone on a full document, spawn one agent per section. Each agent reads the full document (for context on cross-references and definitions) but focuses fact-checking on their assigned section only.
- **Web search is essential.** Use it aggressively. Search for every claim, every source, every number. The compute cost is worth it.
- **Don't skip "obvious" claims.** Professional fact-checkers check everything, including things that seem obviously true. Sometimes those are wrong.
- **Quote accuracy matters.** Even minor misquotations should be flagged (as 🟡, not 🔴, if the meaning is preserved).
- **Link every source.** Every finding must include a clickable URL where possible. If the source is a book or paywalled paper, provide the DOI or most accessible link.
- **The 📍 Search snippet is mandatory.** Every single finding must include a distinctive Ctrl+F-able phrase. Pick a phrase that's unique in the document — test by mentally scanning whether it could match elsewhere.

---

## Common Pitfalls

- **Confirmation bias.** Don't just search for evidence that the claim is correct. Also search for evidence that it's wrong.
- **Source laundering.** Multiple sources may all trace back to the same original. Check if your "independent" sources are actually independent.
- **Outdated verification.** A claim may have been true when the source was published but is no longer true. Check for updates.
- **Context stripping.** A quote may be accurate but stripped of qualifying context. Flag this.
- **Number telephone.** A number may have been passed through several intermediary sources, each introducing small errors. Trace to the primary source.
