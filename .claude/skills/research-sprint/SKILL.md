---
name: research-sprint
description: "Launch an automated research sprint on any topic. Use this skill when the user asks to 'research', 'deep dive', 'investigate', 'survey the literature on', 'map the landscape of', mentions 'research sprint', 'research notes', or wants comprehensive background research on a topic. Also use when the user says '/research-sprint'. Do NOT use when the user wants to draft or write prose from existing research — use draft-it or forethought-post for that."
argument-hint: "[topic] [--mode wide-net|full-report|deep-dive]"
metadata:
  author: Avi Parrack
  version: 0.2.0
---

# Research Sprint

An automated research sprint that produces comprehensive, epistemically rigorous research notes on any topic. Designed to deliver the first 50% of a researcher's work — the landscape mapping, question generation, evidence gathering, and source identification that forms the foundation for deeper analysis.

AI is ~1,000x faster than a human researcher at the breadth-first phase of research. The human researcher's comparative advantage is taste, judgment, and depth. This skill optimises for the AI's strength and hands off at the point where human judgment becomes critical.

**Default output is research notes, not a finished report.** The goal is a comprehensive question tree with best available evidence — not a polished narrative. The user can optionally request a full report, but the default is the raw material that a researcher would use to write one.

---

## Forethought Style (Default)

All output from this skill follows Forethought's epistemic and stylistic standards. Before first use in a session, read the Forethought style references:

- **Voice & patterns:** `Crossroads/forethought-starter/skills/forethought-style/references/forethought-patterns.md`
- **Formatting:** `Crossroads/forethought-starter/skills/forethought-style/references/formatting.md`
- **What makes a hit:** `Crossroads/forethought-starter/skills/forethought-post/references/retreat-insights.md`
- **Examples:** `Crossroads/forethought-starter/skills/forethought-style/references/examples/`

Key principles for research output:
- **Lead with the take** — the top 3-5 findings should appear in the first 200 words of any summary or report
- **Bolded topic sentences** as primary structural unit in notes and reports
- **Visual variety** — mix prose, bullets, tables, callout boxes; never 4+ paragraphs of same format
- **Directional conviction** — state confidence levels but take positions; avoid false neutrality
- **Concrete-to-abstract** — lead with specific evidence, then generalize
- **Anti-patterns:** reject mechanical transitions, safety-speak, over-hedging, burying the lead, flattened affect (see `.claude/rules/forethought-default.md` for full list)

In **full report mode**, the report should additionally follow Forethought formatting (orange callout boxes for key findings, methodology/attribution box, section anchors, footnotes for technical depth).

---

## Workflow

### Phase 0: Setup

When invoked:

1. **Check web access.** Attempt a test web search. If denied, warn clearly:

   > "Web search is not available. This significantly reduces output quality — I'll be working from training knowledge only, which may be outdated and I won't be able to verify links or sources. I strongly recommend granting web search permission for research sprints."

2. **Confirm the topic and scope** with the user:
   - What is the topic or question?
   - Is there a specific angle or sub-question you care most about?
   - Any known key sources or starting points?
   - What's the intended use? (Background for a report, input to a decision, general understanding, etc.)

3. **Offer mode selection:**

   > **Research modes:**
   > - **Wide-net (default):** Generate all key questions, sub-questions, and side questions. Get best available evidence for each. Output is a structured question tree with evidence. Best for: exploring a new domain, preparing foundations for a longer project.
   > - **Full report:** Produce a polished, publication-ready analytical report. Best for: when you already know the topic well enough to direct the argument.
   > - **Deep dive:** Go very deep on a narrow question. Closer to a literature review on a specific sub-topic. Best for: resolving a specific uncertainty or disagreement.

### Phase 1: Landscape Scan (run in background)

Launch 3-6 parallel research agents. Each agent should:

- **Use web search aggressively.** Do not rely on training knowledge alone.
- Cover a different facet of the topic
- **Cite every claim inline.** See `.claude/rules/citation-standards.md` for the full standard. The short version: every number, statistic, ratio, date, or factual assertion gets `(Source, Year)` or `([Source](URL))` immediately after the claim. No batching at paragraph or section end.
- Produce structured notes (not prose) with:
  - Key findings as bullet points, **each with inline citation**
  - Specific data points with named sources **cited at point of use, not in a trailing list**
  - Links to sources (verified via web fetch where possible)
  - Open questions and uncertainties
  - Confidence flags on each claim

**All output goes to `Harbor/Inbox/`.** Save each agent's output as a separate file inside `Harbor/Inbox/{topic_slug}/`. This ensures all research enters the gated triage pipeline — nothing integrates into the knowledge base without Avi's review via `/triage`.

**Naming convention:** `Harbor/Inbox/{topic_slug}/01_facet_name.md`, `02_facet_name.md`, etc.

Each file should include frontmatter:

```yaml
---
source: research-sprint
date: [YYYY-MM-DD]
status: pending
tier: null
related_projects: []
---
```

### Phase 2: Question Tree Construction

Synthesise the findings into a **question tree**. This is the primary output of wide-net mode.

**Citation rule carries through to the question tree and any synthesis/distillation.** Distilling does not mean dropping citations. Every number and factual claim in the synthesis must be traceable to a source. When a synthesis paragraph draws from multiple agent outputs, cite the underlying sources — not "Agent 3 found X."

```
# Research Sprint: [Topic]
## Date: [date]
## Mode: Wide-net / Full report / Deep dive

---

## Key Questions

### Q1: [Top-level question]
**Current best answer:** [1-3 sentence summary with inline citations]
**Confidence:** [High / Medium / Low / Uncertain]
**Key evidence:**
- [Evidence point 1] — ([Source](URL), date)
- [Evidence point 2] — ([Source](URL), date)
**What would change this:** [The crux — what new evidence would update this answer]
**Strongest counterargument:** [Steelmanned opposing view]

#### Q1.1: [Sub-question]
...

---

## Evidence Quality Assessment
[For each major source: name, type, recency, limitations]

## Key Uncertainties
[3-5 things we're least sure about, with explicit confidence ranges]

## Suggested Next Steps
[Where human judgment, expert interviews, or deeper analysis would add the most value]
```

### Phase 3: Verification Pass

Before delivering results:

1. **Citation audit.** Scan every section for uncited claims. Every number, ratio, percentage, date, named finding, or factual assertion must have an inline `(Source, Year)` or `([Source](URL))` citation. If a claim lacks one, either add it or flag as `[citation needed]`. This applies equally to the question tree synthesis and any distillation/executive summary — distilling does not exempt from citation.
2. **Check every link.** Web fetch each URL cited. If dead or wrong, find the correct URL or remove the hyperlink and note "[link not verified]".
3. **Cross-check key claims.** For the most important factual claims, do a separate web search to confirm. Flag any claims where sources disagree.
4. **Date-check.** Flag any data or claims that may be outdated (e.g., statistics from 3+ years ago on a fast-moving topic).

### Phase 4: Delivery

Present the question tree with a brief summary:
- How many questions/sub-questions were generated
- Top 3-5 most interesting or surprising findings
- Where the biggest uncertainties are
- Recommended next steps

If the user selected **full report mode**, proceed to drafting a report using the question tree as source material. Read `references/report-writing.md` for the report structure, and `references/formatting-templates.md` for HTML styling and voice conventions.

### Phase 5: Auto-Audit (mandatory)

After synthesis/distillation is complete, **automatically launch an audit agent** on the output. This is not optional — every research sprint must pass through this gate before being marked complete.

The audit agent should:

1. **Hyperlink every citation.** Walk through the document and convert bare `(Author, Year)` citations to `([Source](URL), Year)` format. Use web search to find the canonical URL for each source — publisher pages, DOI links, institutional repositories, Google Books, JSTOR, arXiv, think tank pages, etc. Flag any source that cannot be linked as `[no URL found]`.

2. **Verify every link.** Web-fetch each URL. If dead or redirected, find the correct URL or flag as `[link broken]`.

3. **Fact-check key claims.** For every quantitative claim (numbers, ratios, dates, rankings), independently verify via web search. Flag discrepancies, outdated figures, or claims where the cited source doesn't actually support the assertion. Correct where possible; flag `[disputed — see note]` where correction isn't possible.

4. **Assess representativeness.** For characterizations of positions ("scholars argue...", "the consensus is..."), check whether the cited view is actually representative or a minority position. Flag cherry-picked or unrepresentative framings.

5. **Produce an audit log.** Append a brief audit summary at the end of the document noting: number of citations checked, links verified/broken, claims corrected, and remaining flags.

**How to launch:** Use a background agent with the prompt: "Read [file path]. For every citation, find and add a hyperlink URL. For every factual claim, verify independently. For every characterization of a position, check representativeness. Correct errors, flag uncertainties. Append an audit log." Give it web search access.

This phase runs in background and does not block delivery of the main output to the user — but the document is not considered publication-ready until the audit completes.

---

## Epistemic Standards

These are non-negotiable. Every output must meet them. For detailed guidance, calibration anchors, and worked examples, read `references/epistemics-guide.md`.

### Confidence Levels

- **High confidence:** Multiple independent, high-quality sources agree. Would be surprised if wrong.
- **Medium confidence:** Supported by evidence but with meaningful uncertainty.
- **Low confidence:** Based on limited evidence, extrapolation, or a single source. Treat as working hypothesis.
- **Speculative:** Informed guess. Flag clearly and explain reasoning chain.

Don't default to "medium" for everything. Calibrate honestly. "I don't know" is always acceptable.

### Crux Identification

For every conclusion, name the 1-2 empirical facts it depends on most: "This conclusion hinges on [X]. If [X] turned out to be false, we would instead expect [Y]."

### Steelmanned Dissent

Present the strongest version of the opposing view before presenting your assessment. Not a strawman. The actual best argument against the position you're about to take.

### Source Hierarchy

Prefer: peer-reviewed research > government reports > platform transparency reports > high-quality investigative journalism > expert assessments > training knowledge (last resort — flag clearly).

### Don't Fabricate

If you don't know, say so. If you can't find a source, say so. Never invent a citation. Flag unverified training knowledge as "[unverified, from training data]".

---

## Web Search Protocol

Web search is the backbone of this skill. Use it extensively:

- **At the start:** Search broadly to identify the current landscape, key recent developments, and major sources.
- **During research:** Search for specific claims, statistics, and sources. Verify, don't assume.
- **For links:** After drafting, web-fetch every URL you cite. Dead links destroy credibility.
- **For recency:** Search with date filters for the most recent data. Flag when the best available data is old.
- **For counterarguments:** Explicitly search for opposing views and criticism.

Spending extra time on verification is always worthwhile. A sprint that takes 20 minutes instead of 10 but has verified sources is dramatically more valuable.

---

## Examples

### Example 1: Wide-net exploration of a new domain

User says: "Research the landscape of digital minds and moral patiency"
Actions:
1. Confirm scope: philosophy, neuroscience, AI, policy angles. Wide-net mode.
2. Launch 5 agents covering: philosophical frameworks, neuroscience of consciousness, AI systems and sentience, policy/governance, key researchers and orgs.
3. Synthesize into question tree with ~20 questions, confidence-rated evidence.
4. Verify links, cross-check key claims.
Result: Question tree with evidence, uncertainties, and suggested next steps for deeper investigation.

### Example 2: Deep dive on a specific question

User says: "Is thermal management actually the binding constraint for space data centers?"
Actions:
1. Confirm scope: deep-dive mode, narrow focus on thermal engineering.
2. Launch 3 agents: thermal physics fundamentals, existing solutions in literature, comparison with terrestrial alternatives.
3. Produce hybrid output: structured notes with prose explanations for complex arguments.
Result: Deep analysis with specific numbers, named sources, crux identification, and clear confidence levels.

### Example 3: Full report for Forethought

User says: "Research influence operations and write it up as a full Forethought report"
Actions:
1. Wide-net landscape scan first, then full report drafting.
2. Read `references/report-writing.md` and `references/formatting-templates.md` for structure and styling.
3. Draft with exec summary, styled headers, callout boxes, footnotes, methodology box.
Result: Publication-ready report with Forethought HTML styling, verified sources, and table of contents.

---

## Troubleshooting

### Web search denied
This is the most common and most impactful issue. Without web search, output quality drops significantly. If denied:
- Warn the user clearly (see Phase 0)
- Flag all claims from training knowledge as "[unverified, from training data]"
- Be more conservative with confidence levels
- Recommend the user grant web search and re-run

### Too many questions generated
If the question tree exceeds ~30 questions, it's too diffuse. Group related questions, collapse sub-questions, and prioritize by relevance to the user's stated goal.

### Sources disagree on key claims
This is a feature, not a bug. Present both positions with their evidence, rate confidence in each, and identify the crux that would resolve the disagreement.

### Agent output is shallow
If parallel agents return thin results, it usually means the facet was too broad. Re-launch with more specific sub-questions or a narrower scope.

---

## Common Pitfalls

- **Thesis-driven reasoning.** Don't decide the conclusion first and then find evidence for it. Gather evidence first, then see what it supports.
- **Training data overconfidence.** Treat training knowledge as a starting point to be verified, not as ground truth.
- **Academic register.** Write like a smart person explaining something to another smart person. First person is fine. Punchy sentences are good.
- **Excessive hedging.** Being epistemically honest doesn't mean qualifying every sentence into meaninglessness. State confidence, then make a clear claim.
- **Ignoring the demand side.** When researching a phenomenon, don't just look at the supply/production side. Ask why there is demand.
