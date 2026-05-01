# Formatting Templates — Forethought Research Sprint Output

Use Forethought orange (`#E87040`) as the accent color throughout.

---

## Voice and Register

- **Write like a smart person explaining something to another smart person.** First person is fine. Contractions are fine. Punchy sentences are good. No academic register.
- **Don't bury the lede.** Every paragraph or bullet cluster should open with the key takeaway in bold. The reader should be able to skim bold text and get the full picture.
- **Numbers over vague claims.** Not "a lot of satellites" but "a fleet of 7,000+." Not "it could be expensive" but "$48.1B."
- **Em dashes for asides.** Use `--` liberally for parenthetical insertions and emphasis.
- **Honest about uncertainty.** "The honest answer is we don't know" is always better than false precision.

---

## HTML Templates

### Document Header (full reports)

```html
<div style="text-align: center; margin-bottom: 2em;">
<span style="font-size: 0.9em; letter-spacing: 0.15em; color: #E87040; text-transform: uppercase; font-weight: 600;">Claude-at-Forethought Automated Research Sprint</span>

# [Title]

### [Subtitle]

<span style="color: #666; font-size: 0.95em;">Forethought &middot; [Month Year]</span>
</div>
```

### Orange Callout Boxes (key insights, important findings, bottom-line summaries)

```html
<div style="background: #FFF5F0; border-left: 4px solid #E87040; padding: 1.2em 1.5em; margin: 1.5em 0;">

**Key insight in bold.** Explanation follows...

</div>
```

### Grey Callout Boxes (contextual information, data summaries, background)

```html
<div style="background: #F7F7F7; border: 1px solid #DDD; padding: 1.2em 1.5em; margin: 1.5em 0; border-radius: 4px;">

**The basics.** Background information...

</div>
```

### Section Headers

```html
<h2 style="color: #E87040;" id="section-slug">1. Section Title</h2>
<h3 style="color: #E87040;">1.1 Subsection Title</h3>
```

---

## Tables

- **Keep column headers to 3-4 words max.** Long headers cause rendering issues.
- Use abbreviations in headers with a legend below.
- Include units in headers where relevant.

---

## Sourcing and Attribution

**In-text hyperlinks** — embed source links directly in the prose where the claim is made:
```markdown
The [Tenet Media indictment](https://www.justice.gov/opa/pr/...) alleged that two employees of RT had funneled approximately $10 million...
```

**Footnotes** — use `[^1]` syntax for detailed source attributions. Place footnote definitions at the end of each section (not the end of the document). Footnotes provide the full citation, context, and caveats.

**Link verification** — every in-text hyperlink must be checked via web fetch before delivery. Dead links destroy credibility.

**Methodology/attribution box** — every full report should open with a styled callout (orange style) explaining:
- How the report was made (AI contribution vs human contribution)
- Sourcing approach (training data, web search, existing research files)
- What it is not (not a systematic review, etc.)
- Why traceability matters

---

## Table of Contents (full reports)

```markdown
**Contents**

1. [Section Title](#1-section-slug)
2. [Section Title](#2-section-slug)
...
```

---

## Mode-Specific Formatting

**Wide-net mode (research notes):** Bullet-point style. Dense, specific, source-attributed. Not prose. Confidence flags on each claim. Links embedded where available.

**Full report mode:** Narrative prose. Sections with `<h2>` and `<h3>` styled headers. Orange and grey callout boxes for emphasis. In-text hyperlinks and footnotes for sourcing. Table of contents. Methodology box. First person is fine. Should read like a magazine-quality analytical essay — punchy, opinionated, well-sourced.

**Deep dive mode:** Hybrid — structured like research notes but with prose explanations for complex arguments. Use callout boxes for key findings.
