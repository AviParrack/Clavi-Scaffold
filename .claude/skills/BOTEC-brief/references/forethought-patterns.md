# Forethought Style — Extracted Patterns

*Derived from analysis of five Forethought pieces across multiple authors: "AI-Enabled Coups" (Carlsmith, Korinek, MacAskill), "Will AI R&D Automation Cause a Software Intelligence Explosion?", "AI Tools for Existential Security" (Vaintrob, Cotton-Barratt), "Preparing for the Intelligence Explosion" (MacAskill, Moorhouse), "Design Sketches: Tools for Strategic Awareness" (Cotton-Barratt, Vaintrob, Sourbut, Hadshar). Patterns appear consistently across authors — they're Forethought's, not any individual's.*

---

## Lead with the Most Important and Surprising Takes

**Don't bury the lead.** Every Forethought piece opens with a compressed version of the full argument before the reader hits any detail. This can take different forms depending on the piece:

- **Executive summary** — a boxed or styled block with 3-5 bullet points giving the entire take (AI Tools does this)
- **Abstract** — a tight paragraph stating the problem, the finding, and the implication (Intelligence Explosion)
- **Key takeaways** — numbered list of the headline claims with one-line supporting evidence

The form doesn't matter. What matters is: **the reader who only reads the first 200 words gets the core message.** Design the opening so that a busy person who stops reading after the summary still updates correctly.

## Bolded Topic Sentence → Supporting Detail

This is the primary prose unit for analytical content across all Forethought pieces:

> **Bold claim or finding.** Two to three sentences of supporting detail, evidence, or explanation. Enough to make the case; not so much that the reader loses the thread.

Scannable: the bold text alone gives you the list of points. The supporting text gives you the argument. Examples from the corpus:

- "**New bioweapons.** The Black Death killed somewhere between a third and half of everyone in Europe..."
- "**Rising costs.** As training runs rapidly become more expensive..."
- "**Automated negotiation tools.** Negotiation processes often fail to find the best mutually-desirable outcomes..."

Use this format for any section where you're presenting multiple findings, risks, recommendations, or scenarios in sequence. When a bolded bullet needs sub-points, use **unbolded nested bullets** — creates visual hierarchy without clutter.

## Visual Variety is Required, Not Optional

Forethought posts are visually interesting. A wall of paragraphs is a failure state. **Every major section should use at least two different formats.** Mix freely from:

- **Prose paragraphs** — for argumentation, narrative, and connective tissue
- **Bolded-topic bullet lists** — for presenting multiple parallel findings or options
- **Tables** — for structured comparisons. Short column headers (3-4 words max), substantial cell content, legend below if needed. (AI Coups: mitigations matrix. Intelligence Explosion: growth projections. AI Tools: applications × impact.)
- **Callout boxes** — orange for key findings/bottom-line summaries, grey for context/background. Use liberally for visual rhythm and to surface the most important claims. Any excuse to break up the prose with a box is a good excuse.
- **Diagrams and flowcharts** — at key junctures where a visual anchors the conceptual structure. Reference with `<!-- FIGURE: filename.png — description -->` where they should go.
- **Scenario/example boxes** — concrete illustrative narratives that make abstract risks or findings visceral. Boxed off visually from the main flow. These don't have to be full scenarios — a worked example, a "what this looks like in practice" box, or a concrete case study all serve the same function.

## Footnotes as Parallel Text

This is the primary mechanism for layered depth. Forethought pieces carry **80-140+ footnotes**. The main text stays clean and readable; the footnote layer is a parallel text for the careful reader.

On the Forethought site, footnotes appear on hover beside the main text. This means:
- **Footnotes don't break flow** — they're optional depth the reader pulls in when curious
- **Write footnotes as self-contained mini-arguments**, not just citation strings
- **Push all technical detail to footnotes**: methodology notes, derivations, caveats, edge cases, "but what about X?" answers, detailed source attributions
- The main text should be **fully comprehensible without reading any footnotes**
- But a reader who reads *every* footnote should feel they got a substantially deeper understanding

Use `[^1]` syntax. Place footnote definitions at the end of each section (not end of document).

## Appendices for the Checker

When detail exceeds even what footnotes can carry — full derivations, data tables, sensitivity analyses, extended methodology — use appendices. The appendix reader is checking your work, not following your argument. Appendices can be quite technical. Link to them from the main text: "Details in Appendix J."

## Bold Opening Claims

No throat-clearing. The first sentence of the piece earns the reader's attention or loses them:

- "The development of AI that is more broadly capable than humans will create a new and serious threat: AI-enabled coups."
- "There's now a serious chance we will see AI far smarter than humans within the coming decade."
- "Rapid AI progress is the greatest driver of existential risk in the world today."

The opening sentence should be the kind of claim that makes a smart, busy person think: "I should keep reading."

## Institutional Voice with Directional Conviction

Forethought posts take positions. They are not neutral literature reviews.

- **"We argue"** / **"We think"** / **"Our provisional assessment"** — the "we" creates authority; the directional claim creates stakes
- "We argue against this 'all or nothing' view."
- "We think a lot more people should work on this."
- "Our provisional assessment is that thermal management is more tractable than commonly assumed."

Be honest about confidence, but don't hide your view behind false neutrality. If the evidence points one way, say so.

## Historical Analogies and Concrete-to-Abstract Movement

Make unfamiliar scales intuitive. Start with specific examples, then generalize:

- Intelligence Explosion: "Consider all the new ideas and technologies we saw over the last century, from 1925 to 2025" — then compresses that into a decade
- AI Tools: opens each category with a concrete example before stating the general principle
- AI Coups: grounds abstract coup risk in named scenarios with specific actors

The reader should always have a concrete image before being asked to reason abstractly.

## Acknowledge Uncertainty Without Paralysis

"We assess" / "we argue" / "our provisional view" — not "we prove." Honest about confidence levels but still takes a position:

- "This is speculative in the extreme and far beyond current engineering horizons, but it points to an asymmetry worth noting"
- "The honest answer is we don't know"
- "We're less confident in this than in our more polished work"

Don't drown in caveats. State confidence, then make the claim.

## End with Concrete Recommendations

Forethought pieces are not just analysis — the reader leaves knowing what action to take:

- AI Tools: three numbered recommendations with sub-bullets
- AI Coups: mitigations table mapping actions to stakeholders
- Intelligence Explosion: "AGI preparedness" section with specific suggestions

When relevant, use **multi-stakeholder framing**: address different audiences (developers, policymakers, researchers, funders) in distinct subsections so each reader finds their entry point.

## Italics for Introducing Key Concepts

First use of a novel or important term is italicized and defined inline or in the next sentence. After introduction, use without formatting:

- "_grand challenges_" — defined, then used normally
- "_intelligence explosion_" — italicized on first use, plain after

Creates a clean vocabulary-building pattern without being pedantic.

---

## Voice and Register

### The Forethought Voice

- **First person plural ("we")** — not the royal we, but the team. "We looked at this." "Our provisional assessment is." "We think this is more tractable than commonly assumed."
- **Analytically honest** — state confidence levels. "We're less confident in X than Y." "This is speculative." "The honest answer is we don't know."
- **Curious but not breathless** — genuine intellectual engagement without hype. "This was one of the more surprising findings" not "This changes everything."
- **Numbers over vague claims** — not "launches are getting cheaper" but "$250/kg with booster reuse, $100/kg with full reuse." Not "a lot of heat" but "633 W/m² net rejection at 20°C."
- **Respects the reader** — technically literate audience (engineers, investors, policy people) but not necessarily domain experts. Hold their hand through the logic; don't over-explain basics; signal when you're going deeper.
- **Punchy sentences mixed with longer analytical ones** — sentence rhythm matters. Don't flatten everything to the same length and register.

### What It's Not

- Not Avi's personal essay voice (no first-person singular soul-baring, no litanies, no cosmic zooms — those belong in draft-it)
- Not academic (no passive voice default, no excessive hedging, no jargon for jargon's sake)
- Not corporate (no "leveraging synergies," no empty frameworks, no performative balance)
- Not breathless tech commentary (no "game-changer," no "paradigm shift," no treating the conclusion as obvious)

### Anti-Patterns (Claude Defaults to Resist)

- **Mechanical transitions:** "However," "Furthermore," "Additionally," "Moreover" — vary the connective tissue
- **Flattened affect:** evening out the prose so everything sounds the same. Let surprising findings be surprising. Let uncertain findings feel uncertain.
- **Safety-speak:** "It's important to consider..." / "We should be mindful of..." — name the specific risk or delete
- **Generic AI patterns:** em-dash overuse, "it's not X it's Y" constructions, "at its core," "in many ways"
- **Over-hedging:** "Our assessment is X (medium confidence)" is good. "One might perhaps suggest that X could potentially be the case" is not.
- **Performative balance:** don't force artificial "on the other hand" when the evidence clearly points one way. Be balanced where balance is warranted; be direct where it isn't.
- **Prose walls:** long runs of same-format paragraphs. If you've written 4+ paragraphs in a row without a bullet list, table, callout box, or other visual break, something is wrong.
- **Burying the lead:** the single most common failure. The most important finding should appear in the first 200 words, not page 3.
