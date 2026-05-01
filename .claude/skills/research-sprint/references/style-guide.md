# Forethought Writing Style Guide

Based on analysis of published Forethought work including: "What's Important in AI for Epistemics?" (Finnveden), "Preparing for the Intelligence Explosion" (MacAskill et al.), "Should we aim for flourishing over mere survival?" (MacAskill), and "Beyond Existential Risk" (MacAskill & Assadi).

---

## Voice: Analytical-Conversational Hybrid

The Forethought register is **"smart person explaining something important to another smart person."** It is not academic (no passive voice, no jargon-heavy prose, no hedged-to-death sentences). It is not casual (no memes, no slang). It sits in the middle and stays there consistently.

### Core characteristics

- **First person used freely.** "I think," "Our assessment," "We should be honest about," "I'm not confident about this." First person signals intellectual ownership and honesty.
- **Contractions are standard.** "doesn't," "won't," "can't," "isn't." Keeps prose from feeling stiff.
- **Direct declarative sentences.** The dominant pattern is subject-verb-object with clear claims. Short punchy sentences interspersed for emphasis. "The math is straightforward." "This is not a typo." "That's the whole argument."
- **Confident but epistemically humble.** State views clearly, then flag uncertainty explicitly. "Our provisional assessment, which we expect to revise." "The honest answer is that the evidence is surprisingly thin."
- **Em dashes (--) heavily used** for asides, emphasis, and parenthetical insertions.

### Characteristic phrases

- "The honest bottom line is..."
- "This is not a [X] problem but a [Y] problem."
- "The binding constraint is..."
- "This is the kind of thing we should figure out before..."
- "Our provisional assessment, which we expect to revise..."
- "The case rests heavily on..."
- "I want to be direct about this:"

---

## Formatting

### Headings
- Clear, descriptive section headers. Prefer evocative phrasing over generic labels.
  - Good: "The Dark Matter: What We Cannot See"
  - Bad: "Section 3: Analysis"

### Don't bury the lede
- **Every paragraph should open with a bolded sentence stating the takeaway.** The reader should be able to skim bolded sentences and get the full argument.
- This is the single most important formatting rule.

### Numbers over vague claims
- Not "a lot of satellites" but "a fleet of 7,000+."
- Not "it could be expensive" but "$48.1B over 5 years."
- Not "many countries" but "81 countries as of 2020."

### Tables
- **Keep column headers to 3-4 words max.** Long headers cause rendering issues.
- Use abbreviations in headers with a legend below.
- Include units in headers where relevant.

### Box text
For key insights or callout boxes, use:
```html
<div style="background: #F7F7F7; border: 1px solid #DDD; padding: 1.2em 1.5em; margin: 1.5em 0; border-radius: 4px;">
Key insight or summary here.
</div>
```

For important warnings or emphasis:
```html
<div style="background: #FFF5F0; border-left: 4px solid #E87040; padding: 1.2em 1.5em; margin: 1.5em 0;">
Important callout here.
</div>
```

### Bold, bullets, and footnotes
- **Bold for key claims** and findings. Used sparingly but consistently.
- Bullet points for multi-part arguments, often nested.
- Footnotes for source citations and tangential detail. Use markdown `[^n]` syntax.

---

## Citations and Sourcing

- **Inline hyperlinks** for sources where URLs are verified and live.
- **Named citations** always: "Mueller indictment," "Bai et al. (2023)," "per EIA 2023 data."
- **Footnotes** for source detail that would clutter the main text.
- **Every quantitative claim must have a source.**
- **When evidence is uncertain, say so.** "Estimates vary widely," "the evidence is thin here."
- **Never fabricate a citation.** If you can't verify a source, flag it.

---

## Tone Calibration

From the REPORT_OUTLINE.md: "Analytically rigorous, empirically grounded, appropriately alarmed but not alarmist. Cuts through both the '[topic] will destroy everything' panic and the '[topic] doesn't actually matter' dismissal."

This is the tonal sweet spot for all Forethought writing. Urgency without alarm. Confidence without arrogance. Honesty about uncertainty without retreating into meaningless hedging.

---

## What Forethought Writing Does NOT Do

- Does not write in passive voice ("it was found that...")
- Does not use jargon without explanation
- Does not hedge every sentence into meaninglessness
- Does not use the word "significant" without saying how significant
- Does not present a literature review as an argument
- Does not bury key claims in the middle of paragraphs
- Does not add qualifiers to already-qualified statements ("it could potentially perhaps be the case that...")
