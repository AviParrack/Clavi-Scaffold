# Forethought HTML Formatting Templates

Use Forethought orange (`#E87040`) as the accent color throughout. This creates branded visual cohesion.

---

## Document Header

```html
<div style="text-align: center; margin-bottom: 2em;">
<span style="font-size: 0.9em; letter-spacing: 0.15em; color: #E87040; text-transform: uppercase; font-weight: 600;">Forethought Research Note</span>

# [Title]

### [Subtitle]

<span style="color: #666; font-size: 0.95em;">Forethought &middot; [Month Year]</span>
</div>
```

## Methodology/Attribution Box (required for all posts)

```html
<div style="background: #FFF5F0; border-left: 4px solid #E87040; padding: 1.2em 1.5em; margin: 1.5em 0; font-size: 0.92em;">

**How this was made.** [Brief description of methodology, AI contribution, sources used.]

**Sourcing note:** [How claims are attributed. What the reader can trust.]

</div>
```

## Orange Callout Boxes (key findings, bottom-line summaries)

```html
<div style="background: #FFF5F0; border-left: 4px solid #E87040; padding: 1.2em 1.5em; margin: 1.5em 0;">

**Key finding.** Explanation...

</div>
```

## Grey Callout Boxes (context, background, data summaries)

```html
<div style="background: #F7F7F7; border: 1px solid #DDD; padding: 1.2em 1.5em; margin: 1.5em 0; border-radius: 4px;">

**Context.** Background information...

</div>
```

## Section Headers

```html
<h2 style="color: #E87040;" id="section-slug">Section Title</h2>
```

Sub-sections use standard markdown `###` headers.

## Tables

- **Column headers: 3-4 words max.** Long headers cause rendering issues.
- Use abbreviations in headers with a legend below the table.
- Include units in headers where relevant.
- Prefer narrow tables (3-5 columns). Wide tables break in most renderers.

**Good:**
| Actor | Est. Budget | Primary Channel | Detection Rate |
|-------|------------|----------------|---------------|

**Bad:**
| State Actor and Attribution | Estimated Annual Budget for Influence Operations | Primary Distribution Channel Used | Rate of Detection by Platform Moderation Systems |
|---|---|---|---|

## Footnotes

- Use `[^1]` syntax
- Write as self-contained mini-arguments, not just citation strings
- Push all technical detail here: derivations, methodology, caveats, edge cases, "but what about X?"
- Main text must be fully comprehensible without footnotes
- A reader of every footnote should feel they got substantially deeper understanding
- Place definitions at end of each section (not end of document)

## Table of Contents (full reports)

```markdown
**Contents**

1. [Section Title](#1-section-slug)
2. [Section Title](#2-section-slug)
...
```

## Sourcing and Attribution

**In-text hyperlinks** — embed source links directly in prose:
```markdown
The [Tenet Media indictment](https://www.justice.gov/opa/pr/...) alleged that two employees of RT had funneled approximately $10 million...
```

**Footnotes for detailed attribution:**
```markdown
[^1]: United States v. Kalashnikov and Afanasyeva, Case No. 24-cr-299...
```

**Link verification** — every in-text hyperlink must be checked via web fetch before delivery. Dead links destroy credibility. If dead, find the correct URL or remove the hyperlink and note the source in a footnote without a link.
