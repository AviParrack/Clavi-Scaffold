# Report Writing Guide

Instructions for producing a polished, publication-ready Forethought report from research sprint materials. This guide is used when the user selects **full report mode** or asks to turn research notes into a finished report.

---

## Prerequisites

Before writing a full report, you should have:

1. A completed question tree from a wide-net research sprint (or equivalent structured research notes)
2. A clear thesis or central argument that emerged from the evidence
3. The Forethought style guide (`references/style-guide.md`) loaded for voice and formatting

---

## Report Structure

### Front Matter

Every report opens with:

1. **Title.** Evocative, specific, and under 15 words. Not generic ("An Analysis of X") but descriptive ("The Persuasion Machine: How AI Reshaped Political Influence").

2. **AI methodology note.** Always include this callout box at the top:

```html
<div style="background: #FFF5F0; border-left: 4px solid #E87040; padding: 1.2em 1.5em; margin: 1.5em 0; font-size: 0.92em;">
<strong>How this report was made.</strong> This is an experiment in AI-assisted research. The research sprint, evidence gathering, and initial drafting were performed by Claude (Anthropic) under the direction of Forethought researchers. All claims, judgments, and conclusions have been reviewed by the research team. Sources have been verified where possible -- claims that could not be independently verified are flagged. We believe this represents a new and productive mode of research, and we're transparent about the process so readers can calibrate accordingly.
</div>
```

3. **Feedback link.** Include a feedback callout immediately after the methodology note:

```html
<div style="background: #F0F7FF; border-left: 4px solid #4A90D9; padding: 1.2em 1.5em; margin: 1.5em 0; font-size: 0.92em;">
<strong>Help us improve.</strong> This report was produced using Forethought's automated research sprint. If you notice errors, dead links, outdated claims, or reasoning issues, please <a href="https://forms.gle/VTLjee7ECXSR6LHF8">let us know via this short form</a>. Your feedback directly improves our research process.
</div>
```

> **Note:** Replace `https://forms.gle/VTLjee7ECXSR6LHF8` with the current feedback form URL. If no URL is available, ask the user for one before publishing.

4. **Executive summary.** 3-5 bullet points covering the core argument, not a paragraph of prose. The reader should know the bottom line before scrolling.

5. **Table of contents.** With anchor links to each section.

### Body Sections

Structure the argument in 6-12 sections. Each section should:

- **Open with a section header** that's descriptive and evocative (see style guide)
- **Lead with the takeaway** -- the first paragraph of every section states the conclusion of that section in bold
- **Build the argument** with evidence, not assertion
- **Include at least one concrete data point** (number, date, named source)
- **End with a transition** that connects to the next section's argument

### Section Heading Format

Use HTML headings with Claude orange for main sections:

```html
<h2 style="color: #E87040;">1. The Landscape Has Changed</h2>
```

Sub-sections use standard markdown `###` headers.

### Closing Sections

Every report ends with:

1. **Key Uncertainties.** The 3-5 things most likely to change the analysis if new evidence emerges. Frame as cruxes.
2. **Recommendations** (if appropriate). Specific, actionable, addressed to named actors.
3. **Conclusion.** Short. Restate the core argument. End on the most important point.

---

## Formatting Rules

### Don't Bury the Lede

The single most important formatting rule. **Every paragraph opens with a bolded sentence stating the takeaway.** The reader should be able to skim only bolded sentences and reconstruct the full argument.

**Good:**
> **Platform moderation has reduced the reach of state-sponsored troll farms by an estimated 60-80% since 2016.** Meta's Coordinated Inauthentic Behaviour reports document the removal of over 200 networks since 2017...

**Bad:**
> Since 2017, Meta has published regular reports documenting the removal of networks engaged in coordinated inauthentic behaviour. These reports, which are part of a broader industry trend toward transparency, have documented over 200 network takedowns. According to analysis by the Stanford Internet Observatory, these removals, combined with algorithmic changes, have reduced the reach of state-sponsored troll farms by an estimated 60-80%.

### Numbers Over Vague Claims

Every quantitative assertion needs a specific number and a named source **cited inline at point of use**. See `.claude/rules/citation-standards.md` for the full standard. The key principle: a reader must be able to trace any single number or assertion to its source without reading surrounding text. This applies equally to executive summaries and distillations — condensing content does not exempt from citation. If a figure appears in the synthesis, it needs a source right there, not just in the underlying research notes.

### Tables

- **Column headers: 3-4 words max.** This prevents rendering issues in markdown viewers.
- Use abbreviations with a legend below the table.
- Include units in headers.
- Prefer narrow tables (3-5 columns). Wide tables break in most renderers.

**Good:**
| Actor | Est. Budget | Primary Channel | Detection Rate |
|-------|------------|----------------|---------------|

**Bad:**
| State Actor and Attribution | Estimated Annual Budget for Influence Operations | Primary Distribution Channel Used | Rate of Detection by Platform Moderation Systems |
|---|---|---|---|

### Callout Boxes

Two styles (see style guide for HTML):

1. **Grey box** (`#F7F7F7` background): Key insights, summaries, "bottom line" statements
2. **Orange-bordered box** (`#FFF5F0` background, `#E87040` left border): Warnings, caveats, methodology notes, feedback links

### Footnotes

Use markdown `[^n]` syntax. Footnotes are for:
- Source citations that would clutter the text
- Tangential detail that's interesting but not essential
- Methodological notes

**Important:** When assembling a report from multiple agent-drafted sections, renumber footnotes to be sequential across the entire document. Each agent will use its own numbering -- these must be reconciled.

### Links

- Verify every link via web fetch before finalising
- If a link is dead, either find the correct URL or remove the hyperlink and note "[link not verified]"
- Prefer linking to primary sources over secondary reporting
- For paywalled sources, note "(paywalled)" after the link

---

## Writing Process

### Step 1: Outline from Question Tree

Convert the question tree into a narrative outline. The question tree gives you the evidence and structure -- the outline gives you the argument flow. Not every question becomes a section. Group related questions. Identify the narrative arc.

### Step 2: Draft Sections in Parallel

Launch parallel agents for groups of 2-3 sections each. Each agent needs:
- The full outline (for context and transitions)
- The relevant research notes and question tree entries
- The style guide
- Clear instructions on voice, formatting, and epistemic standards

### Step 3: Assemble and Edit

After all sections are drafted:
1. Concatenate into a single document
2. Fix heading format consistency
3. Renumber footnotes sequentially
4. Check cross-references between sections
5. Verify all links
6. Read through for narrative flow and transitions

### Step 4: Verification Pass

Before delivery:
- Web-fetch every cited URL
- Cross-check the 5 most important factual claims with independent searches
- Flag any statistics older than 2 years on fast-moving topics
- Ensure every bold lede accurately summarises its paragraph
- Check that the executive summary matches the actual argument

---

## Tone Calibration

From the Forethought style guide: "Analytically rigorous, empirically grounded, appropriately alarmed but not alarmist."

### What This Means in Practice

- **Urgency without alarm.** "This is a serious problem that requires attention" -- not "democracy is collapsing."
- **Confidence without arrogance.** "Our assessment is X" -- not "obviously X" or "any reasonable person would agree."
- **Honesty without retreat.** "We don't know" when you don't know -- not "further research is needed" as a way to avoid making a call.
- **Specificity without jargon.** Name the thing precisely -- but explain it if the reader might not know the term.

### Voice Checklist

Before finalising, check:
- [ ] First person used where appropriate ("I think," "our assessment")
- [ ] Contractions used throughout (doesn't, won't, can't)
- [ ] No passive voice ("it was found that..." → "we found...")
- [ ] No unqualified jargon
- [ ] Em dashes used for asides (not parentheses for everything)
- [ ] Bold ledes on every paragraph
- [ ] Numbers instead of vague quantifiers

---

*This guide will be refined based on feedback from completed reports. Add worked examples from successful reports as they are produced.*
