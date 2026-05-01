---
name: BOTEC-brief
description: "Draft or revise a BOTEC brief — a structured technical analysis with tables, calculations, and formatted derivations. Use this skill when the user asks for a BOTEC, back-of-the-envelope calculation, technical brief, or structured analysis with tables. Do NOT use for Forethought publications — use forethought-style for voice and forethought-publish for workflow."
metadata:
  author: Avi Parrack
  version: 0.4.0
---

# BOTEC Brief

Takes material at any stage — raw notes, a spreadsheet summary, a messy draft, a near-final piece — and produces or refines a Forethought research post. The output should read like it was written by a small, sharp research team that respects the reader's intelligence and its own uncertainty.

**Iteration is first-class.** This skill is designed to be called multiple times on the same piece. First call might take notes to a draft. Second call takes the draft plus reviewer comments and produces a revision. Third call polishes. Each invocation should preserve what's working and fix what isn't, without defaulting to a rewrite.

The failure mode to watch for is **flattening into generic think-tank prose**. Forethought posts should have texture — surprise the reader with a finding, be honest about what's shaky, let the analysis breathe. The other failure mode is **breathlessness** — treating every finding as revolutionary. Calibration matters.

---

## Workflow

### Phase 0: Mode Detection and Setup

Determine the mode from context. Ask only what isn't already clear:

**Mode A — Notes to Draft**
- Input: raw notes, spreadsheet data, research sprint output, bullet points
- Output: a structured Forethought post draft
- Ask: What's the core claim? Who's the audience beyond the default? Any specific sections to emphasise or skip?

**Mode B — Draft Revision**
- Input: an existing draft, plus reviewer comments / feedback / a revision brief
- Output: the draft revised, with changes tracked via inline comments where non-obvious
- Ask: What specifically needs to change? What should be preserved? Any new material to integrate?

**Mode C — Polish**
- Input: a near-final draft
- Output: line-edited version with anti-pattern pass, fact-check flags, and a punch-up for readability
- Ask: Is this going to a specific reviewer or publication? Any deadline constraints on depth of edit?

**Content-type routing:** If the user asks specifically for an abstract, tweet thread, or Forum/Substack post, also consult the `forethought-style` skill — it has content-type-specific guidance (word counts, structure, tone) and real examples. This skill handles the workflow; `forethought-style` handles the format spec.

If the user is low-attention (short messages, vague instructions), default to the most likely mode and state assumptions at the top.

### Phase 1: Orientation

Read the following (skip if already loaded in this session):

1. **The existing draft** (if Mode B or C) — read in full before touching anything
2. **Reviewer comments / feedback** (if Mode B) — understand what's being asked
3. **Source material** — spreadsheets, appendices, research notes referenced by the draft
4. **`references/forethought-patterns.md`** — extracted Forethought style patterns, voice, register, and anti-patterns
5. **`references/formatting.md`** — HTML templates for headers, callout boxes, section styling
6. **`references/retreat-insights.md`** — what makes a Forethought hit (consult for Mode A especially)
7. **`forethought-style` skill** — the org-wide style guide (via Fin's forethought-starter). Has content-type-specific guidance for abstracts, tweet threads, and Forum/Substack posts. Read its `references/style-guide.md` for detailed patterns and `references/examples/` for 32 real Forethought pieces across content types.

For Mode A, also read:
- 2-3 relevant examples from `forethought-style/references/examples/` for voice calibration
- The source data (spreadsheet, research notes) to understand what's available

### Phase 2: Analysis

**Mode A (Notes to Draft):**
- Extract the core claim in one sentence
- Identify the 3-5 key findings or arguments that support it — rank by surprise value
- Map the evidence: what's strong, what's weak, what's missing
- Identify the right depth layering: what goes in the main text vs footnotes vs appendices
- Design the opening: which form of lead (exec summary / abstract / key takeaways) best fits this piece?
- Sketch the arc: where does the reader start, what do they learn in what order, where do they end up
- Plan visual variety: where do tables, callout boxes, scenario boxes, and diagrams go?

**Mode B (Draft Revision):**
- Read the draft against the feedback: what specifically is being asked to change?
- Identify what's working well (preserve this)
- Identify structural issues vs content issues vs line-level issues
- Flag any new material that needs to be integrated
- Check: is the lead buried? Does the opening deliver the core message?
- Check: is there enough visual variety? Where are the prose walls?

**Mode C (Polish):**
- Run the anti-pattern checklist (see Phase 4)
- Check every number against source data
- Flag any claims without sources
- Assess voice consistency across the piece
- Check visual variety and formatting

### Phase 3: Execution

**Structure**
- **Lead with the take.** Open with exec summary / abstract / key takeaways. The reader who stops after 200 words should update correctly.
- **Layered depth model:** Main text is accessible to a smart generalist. Footnotes handle technical details, caveats, and methodology. Appendices provide full derivations and data.
- **Callout boxes liberally** — use templates from `references/formatting.md`. Orange for key findings, grey for context/background.
- **Tables** for comparative data — short headers, substantial cells, legend below if needed.
- **Scenario/example boxes** — concrete illustrations that make abstract points visceral.
- **Figures** referenced with `<!-- FIGURE: filename.png — description -->` where they should go.
- **Every major section uses at least two different formats** (prose + bullets, or prose + table, or bullets + callout box, etc.)

**Argumentation**
- **Claim → evidence → confidence → what would change this.** This is the Forethought pattern.
- **Steelman the opposition.** Before dismissing a counterargument, present its strongest form.
- **Name the comparison explicitly.** "Compared to what?" is always the right question.
- **Flag what you don't know.** "We haven't found good public data on X" is a mark of quality.
- **Concrete first, then abstract.** Specific example or historical analogy → generalized principle.
- **End with concrete recommendations.** Use multi-stakeholder framing when different audiences need different actions.

**Prose**
- **Bold opening claim** — the first sentence earns the reader's attention. No throat-clearing.
- Lead paragraphs with the key finding. Don't bury the lede at any level.
- Mix sentence lengths. Punchy after dense creates rhythm.
- Specific numbers early and often.
- Contractions are fine. "We think" not "We believe that it is the case that."
- Cite inline with hyperlinks. Footnotes for longer attributions or technical detail.
- Italicize key concepts on first use, define inline, then use normally.

**Footnotes**
- Write as self-contained mini-arguments, not just citation strings
- Push all technical detail here: derivations, methodology, caveats, edge cases
- Main text must be fully comprehensible without footnotes
- `[^1]` syntax, definitions at end of each section

### Phase 4: Anti-Pattern Pass (Mandatory)

After writing or revising, run this checklist explicitly:

1. **Lead check** — is the most important/surprising finding in the first 200 words? If not, restructure.
2. **Visual variety** — any section with 4+ consecutive same-format paragraphs? Break up with bullets, tables, callout boxes.
3. **Mechanical transitions** — any "However," "Furthermore," "Moreover" openers? Cut or rework.
4. **Flattened affect** — is the register uniform? Surprising findings should feel surprising.
5. **Safety-speak** — any "it's important to consider" / "we should be mindful"? Delete.
6. **Generic AI patterns** — em-dash overuse, "at its core," "in many ways"? Fix.
7. **Over-hedging** — any sentences hedged into meaninglessness? Sharpen.
8. **Breathlessness** — any findings presented as more revolutionary than they are? Calibrate.
9. **Voice drift** — does it stay in "we" institutional voice? Any slips to personal essay mode?
10. **Depth layering** — is technical detail in footnotes/appendices, not the main text? Is the main text skimmable?
11. **Number check** — do key numbers match the source spreadsheet/appendices?
12. **Source check** — are claims attributed? Flag any `[citation needed]`.
13. **Skimmability test** — read only bold text, callout boxes, and table headers. Does the argument come through?

Report results to the user: categories flagged, fixes made, anything kept that deserves review.

### Phase 5: Delivery

Present the output with:

1. **Mode and scope** — "Mode B revision: addressed 4 reviewer comments, restructured the thermal section, added 12 footnotes"
2. **The draft/revision itself**
3. **Anti-pattern pass results** — brief
4. **One honest note** — what's still not quite right, in the writer's opinion
5. **Suggested next steps** — what the draft still needs

---

## Iteration Protocol

When called in Mode B (revision), follow this protocol:

1. **Read the full draft first.** Do not start editing from the top.
2. **Read all feedback/comments.** Understand the full scope of requested changes.
3. **Categorise changes:** structural (reorder, add/remove sections) vs. content (new material, corrections) vs. line-level (wording, clarity, tone).
4. **Preserve what's working.** Don't rewrite sections that aren't flagged. Voice consistency matters — if the existing draft has good Forethought voice, match it.
5. **Track non-obvious changes.** If you restructure a section or change a claim, note it with `<!-- REVISION: [what changed and why] -->` for the author's review.
6. **Don't inflate.** Revisions should not make the post longer unless new material is being added. Tighten where possible.

---

## Examples

### Example 1: Notes to draft (Mode A)

User says: "Turn the SDC spreadsheet analysis into a Forethought post"
Actions:
1. Detect Mode A. Read source spreadsheet and any existing research notes.
2. Read `references/forethought-patterns.md` and `references/retreat-insights.md`.
3. Extract core claim, rank findings by surprise value, plan structure.
4. Draft with exec summary, styled headers, callout boxes, footnotes.
5. Run anti-pattern pass.
Result: Full Forethought-style draft with orange/grey callouts, 30+ footnotes, methodology box, recommendations section.

### Example 2: Revision from reviewer comments (Mode B)

User says: "Will left comments on the AI Coups draft, here they are — please revise"
Actions:
1. Detect Mode B. Read full draft, then all reviewer comments.
2. Categorize changes: 2 structural, 3 content, 5 line-level.
3. Revise preserving existing voice. Track non-obvious changes with `<!-- REVISION -->` comments.
4. Run anti-pattern pass on revised sections.
Result: Revised draft with revision markers, anti-pattern report, list of changes made.

### Example 3: Final polish (Mode C)

User says: "This is nearly done, do a final pass"
Actions:
1. Detect Mode C. Read full draft.
2. Run anti-pattern checklist. Check numbers against sources. Flag unsourced claims.
3. Punch up readability: tighten sentences, improve transitions, verify visual variety.
Result: Polished draft with anti-pattern report and flagged items for author review.

---

## Troubleshooting

### Source data not available
If the user references a spreadsheet or appendix that can't be found:
1. Ask for the file path or ask them to paste key data inline
2. If proceeding without it, flag every claim that depends on it with `[data not verified — source not available]`

### Voice drifts to personal essay mode
Forethought voice is institutional "we," not Avi's personal voice. If you catch yourself writing first-person singular or reaching for cosmic zooms, stop and re-read `references/forethought-patterns.md` → Voice and Register.

### Draft is too long
Forethought posts should be as long as needed and no longer. If the draft exceeds the scope, push detail to footnotes and appendices. The main text should be skimmable.

### Conflicting feedback from multiple reviewers
Present the conflicts to the user explicitly. "Will says X, Max says Y — which direction?" Don't silently resolve conflicts.

---

## Common Pitfalls

- **Rewriting when revising.** Mode B should preserve and improve, not start over. Match the existing voice.
- **Losing the argument in the detail.** Every section should serve the central claim. If a section doesn't advance the argument, it belongs in an appendix or footnote.
- **Fake balance.** If the evidence points one way, say so. "On balance, we think X" is fine. Don't manufacture uncertainty to seem fair.
- **Forgetting the layered depth model.** Main text is for the argument. Footnotes are for the careful reader. Appendices are for the checker. Don't put appendix-level detail in the main text.
- **Treating all findings as equally surprising.** Calibrate the register to the actual surprise level. "Thermal management is 2-4% of total cost" genuinely surprised us — say so. "Chips are expensive" doesn't surprise anyone — don't oversell it.
- **Skipping the skimmability test.** If a reader can't get the full argument from bold text + callout boxes + tables alone, the piece isn't structured right.
- **Underusing footnotes.** 80-140+ footnotes is normal for Forethought. If your draft has fewer than 30 footnotes for a substantial piece, you're probably leaving technical detail in the main text that should be pushed down.
