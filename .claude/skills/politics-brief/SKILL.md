---
name: politics-brief
description: "Create a political dossier/brief on a public figure. Use when the user asks to 'brief me on', 'profile', 'dossier on', 'political profile of', or says '/politics-brief [name]'. Produces a tight 2-page brief (profile + worldview + psychology + quotes) with every quote verified and linked to primary source. The lens is explicitly democratic: is this person a threat to or ally of democratic governance and human flourishing?"
argument-hint: "[person name]"
metadata:
  author: Avi Parrack
  version: 0.1.0
---

# Politics Brief

Produces a verified political dossier on a public figure. The output is a tight, shareable brief — not an academic profile. It reads like an intelligence product for someone who cares about democracy, virtue in leadership, and the long-term future of civilization.

**The lens is not neutral.** The question driving every brief is: *Is this person a threat to or ally of democratic governance and human flourishing?* This doesn't mean unfair — it means directed. Include genuine intellectual seriousness, moral concern, and positive qualities where they exist. But don't pretend the exercise is academic.

**The critical constraint: no unverified quotes.** Misquoting someone destroys credibility and makes the brief unshareable. Every quote must be verified against a primary source and linked. If you can't verify it, drop it. This is the single most important quality gate.

---

## Workflow

### Stage 1: Load Strategic Context

Read `Politics/GAMEPLAN-V2.md` to understand the strategic framing. The brief should be informed by:
- The coalition map (who is allied with whom, where are the fracture lines)
- The threat model (authoritarian consolidation, AI surveillance, dark money, influence operations)
- The virtue selection framework (character as binding constraint at speed)
- The power maps (who holds power and how they coordinate)

This context determines what dimensions of the subject matter most. A tech billionaire needs different emphasis than a political operative or an intellectual.

### Stage 2: Research the Subject

Launch a thorough research sweep. **Prioritize sources in this order:**

1. **Interview transcripts and long-form podcast appearances.** This is where people reveal themselves most honestly — not in prepared statements, op-eds, or press releases. Unscripted, long-form conversation is the richest signal for psychology. Search specifically for:
   - Joe Rogan, Lex Fridman, Tyler Cowen (Conversations with Tyler), All-In Podcast
   - Conference speeches and Q&A sessions
   - Congressional testimony
   - University lectures or talks

2. **Primary texts by the subject.** Essays, books, blog posts, tweets, manifestos. Their own words in their own medium.

3. **Financial disclosures and public records.** OpenSecrets for donations. SEC filings for company stakes. Government contracts databases. Court records where relevant.

4. **Long-form profiles in major publications.** New Yorker, Atlantic, Bloomberg, NYT, Washington Post — these often contain direct quotes from extended interviews.

5. **Network mapping.** Who do they fund, mentor, employ, co-author with, invest in? Who are their protégés? What boards do they sit on? What conferences do they keynote?

**Collect more than you'll use.** Aim for 30-50+ candidate quotes. You'll distill to 8-15 in the final brief.

### Stage 3: Verify Every Quote

**This is mandatory and non-negotiable.** For every quote that will appear in the final brief:

1. Fetch the primary source URL (the actual publication, transcript, or video page)
2. Confirm the exact wording against the source
3. If exact wording can't be confirmed from a primary source, either:
   - Note it's confirmed across multiple reputable secondary sources with links, OR
   - Drop it entirely
4. Note any important context that changes how the quote reads (was it a joke? was it in response to a specific question? was it later retracted?)

**Common traps:**
- Quotes that are widely attributed but have no traceable primary source
- Quotes that are paraphrases or composites circulated as exact wording
- Quotes taken from one context (a hypothetical, a book review, a character's dialogue) and presented as the subject's own view
- Interview quotes where the question matters as much as the answer (e.g. "Why can't we be elves?" was the interviewer's question, not Thiel's)

### Stage 4: Distill into the Brief

Two files, both in `Politics/dossiers/`:

#### File 1: `[name].md` — The shareable brief

**Section 1 — Brief (~1 page)**

Structure:

```
# [NAME] — Brief

[Optional: 1-2 sentence hook or media reference if useful]

## Profile

| table with: Born, Net worth (sourced), Education, Citizenships, Religion |
| — only include Orientation if politically relevant to the assessment |

**Key assets:** Companies, stakes, valuations, government contracts. Dollar figures with sources.

**Political influence:** Protégés, allies, spending, appointments, network position. Named relationships with dollar amounts.

**Total political spending:** Documented figure with OpenSecrets or equivalent link.

## Worldview Synthesis

**The arc in one sentence:** [Capture the trajectory — who they were → who they became → where they're heading]

**Phase 1-N:** Chronological arc in phases. One paragraph each. Focus on shifts in worldview, not just career moves. What changed and why?

**Key influences:** Intellectual lineage, mentors, formative experiences, ideological roots. Name the thinkers and movements. Trace the connections.

**Psychology:** Behavioral patterns, drives, temperament. What motivates them at the deepest level? What are they afraid of? What do they want? How do they handle conflict, criticism, exposure?

**Key contradictions:** Where stated values and actions diverge. Be specific and concrete.

**How concerning?:** / **Assessment:** Net assessment. Specific reasons. This is where the democratic lens is most explicit. Calibrate: not everyone is a 10/10 threat. Some people are complicated allies. Some are irrelevant. Say what you actually think.
```

**Section 2 — Misc. Quotes (~1 page)**

```
## Misc. Quotes

[Lead with the most psychologically revealing quote — not the most famous]

[Organize thematically: On democracy, On power, On [subject-specific themes]]

[Every quote has: exact text, source name, date, and clickable link]

[Let quotes speak for themselves — analysis belongs in the brief body, not next to quotes]
```

**Selection criteria for quotes:**
- Psychologically revealing > policy-stating
- Unscripted > prepared
- Specific > generic
- Surprising > expected
- Fair: include quotes showing genuine intellectual seriousness or moral concern where they exist

#### File 2: `[name]-raw.md` — Full research backing

All quotes collected (30-50+), full source list, detailed biographical timeline, extended network mapping, anything that didn't make the cut for the brief but supports the analysis. This is the internal reference, not shareable.

---

## Quality Gates

Before finalizing, check:

- [ ] Every quote has a linked primary or clearly-attributed secondary source
- [ ] No quote is taken out of context in a way that changes its meaning
- [ ] The "How concerning?" assessment is calibrated — not everything is maximum alarm. In fact the environment is polarized and we must have high rigor and cut through the noise to see the truth 
- [ ] Key contradictions are concrete (not just "says X but does Y" — what specifically?)
- [ ] The worldview arc captures genuine evolution, not just a list of bad things they've said
- [ ] Positive qualities and genuine intellectual contributions are acknowledged where they exist
- [ ] The brief is ~1 page and the quotes are ~1 page — ruthlessly compress
- [ ] Someone skeptical of your framing would still find the brief factually accurate

---

## Reference Example

See `Politics/dossiers/peter-thiel.md` for the template this skill is based on, and `Politics/dossiers/peter-thiel-raw.md` for the backing research format.

See `Politics/GAMEPLAN-V2.md` for the strategic context that frames all briefs.
