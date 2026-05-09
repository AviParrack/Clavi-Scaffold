---
description: Inline citation requirements for all research output
paths: ["Workshop/**", "Library/**", "Harbor/Inbox/**"]
---

# Citation Standards — All Research Output

This rule applies to ALL skills that produce research, analysis, or synthesis: research-sprint, acad-deep-research, acad-academic-paper, acad-academic-pipeline, sci-* skills, fact-check, deep-review, and any freeform research or distillation work.

## The Core Rule

**Every factual claim, statistic, figure, ratio, date, or quantitative assertion must have an inline citation immediately following it.** No exceptions for "well-known" facts. No batching citations at the end of a paragraph. No "Sources: [list]" at section end without inline attribution.

## Inline Citation Format

Use parenthetical format with **hyperlinks required for all citable sources**. The default format is `([Source Name](URL), Year)`. For books without a URL, use `(Author, *Title*, Year)` — but still search for a publicly accessible URL (publisher page, Google Books, JSTOR, DOI) and include it if found. Bare `(Source, Year)` without a hyperlink is acceptable ONLY when no URL exists (e.g., classified reports, private correspondence, in-person interviews).

### Examples

**Good:**
> China's manufacturing value-added reached $4.66 trillion in 2023 ([World Bank](https://data.worldbank.org/indicator/NV.IND.MANF.CD?locations=CN)), exceeding the combined output of the US, Japan, and Germany (CSIS ChinaPower, 2024). The PLAN fleet reached approximately 370 ships (DoD China Military Power Report, 2024, p. 92), growing at a rate of 10-14 major combatants per year (IISS Military Balance, 2025).

**Bad:**
> China's manufacturing value-added reached $4.66 trillion in 2023, exceeding the combined output of the US, Japan, and Germany. The PLAN fleet reached approximately 370 ships, growing at a rate of 10-14 major combatants per year.
>
> *Sources: World Bank, CSIS, DoD, IISS*

The bad example fails because a reader cannot trace which source supports which claim.

## Rules for Different Output Types

### Raw Research Notes (agent outputs, sprint facets)
- Every data point gets `(Source, Year)` or `([Source](URL))` inline
- Confidence flags still required alongside citations
- "Training knowledge" claims must be flagged as `[unverified — training data]`

### Distillations and Synthesis Reports
- Same inline citation standard as raw notes — distillation does NOT mean citation can be dropped
- When synthesizing across multiple sources, cite each: "estimates range from $400B (SIPRI, 2025) to $600B (RAND, 2024)"
- Tables must cite sources per-row or per-cell where figures come from different sources, or cite in a table footnote keyed to specific cells
- Executive summaries may use lighter citation (source name only) but must still attribute every number

### Full Reports / Publications
- Full bibliographic references in a References section at the end
- Inline citations link to the reference list
- Every URL verified via web fetch before delivery

## What Counts as a Claim Requiring Citation

- Any number, percentage, ratio, dollar amount, date, or count
- Any named finding ("CSIS wargames show...")
- Any attributed assessment ("DoD assesses...")
- Any ranking or comparison ("China is the world's largest...")
- Characterizations of another party's views ("The restraint school argues...")
- Trend claims ("has grown at 7-10% annually since 2005")

## What Does NOT Require Citation

- Logical inferences explicitly flagged as the author's analysis
- Structural statements ("This section covers...")
- Direct observations from data already cited in the same paragraph
- Common mathematical operations on cited figures

## For Agent Prompts

When launching research agents, include this instruction:
> "Cite every factual claim inline with (Source, Year) or ([Source](URL)). Do not batch citations at section end. A reader must be able to trace any single number or assertion to its source without reading surrounding text."

## Verification

Before delivering any research output, verify:
1. Every number has an inline citation
2. Every table has per-row or footnoted sourcing
3. No "Sources: [list]" blocks exist without corresponding inline citations
4. No uncited statistics appear in executive summaries or distillations