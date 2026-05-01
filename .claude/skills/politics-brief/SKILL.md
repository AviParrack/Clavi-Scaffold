---
name: politics-brief
description: "Create a verified brief on a public figure — profile, worldview, psychology, and quotes — with every quote traced to a primary source. Use when the user asks to 'brief me on', 'profile', 'dossier on', or says '/politics-brief [name]'. The user provides the lens of analysis (e.g., 'from a corporate-governance angle', 'as a potential collaborator', 'from a science-policy angle')."
argument-hint: "[person name] [optional: --lens \"<framing the user wants\">]"
metadata:
  version: 0.1.0
---

# Politics Brief

Produces a verified brief on a public figure. The output is a tight, shareable document — not an academic profile.

**The lens is whatever the user specifies.** This skill doesn't bake in a stance. The user names the angle ("evaluate as a potential collaborator", "from a science-policy perspective", "from a corporate-governance angle", "neutral civic profile"), and the brief is calibrated to that lens. If no lens is given, ask before researching.

**The critical constraint: no unverified quotes.** Misquoting destroys credibility and makes the brief unshareable. Every quote must be verified against a primary source and linked. If you can't verify it, drop it. This is the single most important quality gate.

---

## Workflow

### Stage 1: Clarify the Lens

If the user didn't specify, ask: *"From what angle should I evaluate them? Examples: as a potential collaborator, from a corporate-governance perspective, from a policy-impact angle, as a civic profile, etc."*

Once the lens is clear, decide which dimensions matter most. A tech founder evaluated as a potential collaborator needs different emphasis than a politician profiled for policy impact.

### Stage 2: Research the Subject

Launch a thorough research sweep. **Prioritize sources in this order:**

1. **Interview transcripts and long-form podcast appearances.** This is where people reveal themselves most honestly — not in prepared statements, op-eds, or press releases. Unscripted, long-form conversation is the richest signal for psychology. Common venues:
   - Major podcasts (look up which ones the subject has been on)
   - Conference speeches and Q&A sessions
   - Congressional testimony (if applicable)
   - University lectures or talks
   - Long-form public conversations

2. **Primary texts by the subject.** Essays, books, blog posts, social-media posts, manifestos. Their own words in their own medium.

3. **Public records.** Financial disclosures, government filings, court records, donation databases — wherever publicly accessible.

4. **Long-form profiles in major publications.** These often contain direct quotes from extended interviews.

5. **Network mapping.** Who do they fund, mentor, employ, co-author with, invest in? Public collaborations and affiliations.

**Collect more than you'll use.** Aim for 30-50+ candidate quotes. You'll distill to 8-15 in the final brief.

### Stage 3: Verify Every Quote

**Mandatory and non-negotiable.** For every quote that will appear in the final brief:

1. Fetch the primary source URL (the actual publication, transcript, or video page).
2. Confirm the exact wording against the source.
3. If exact wording can't be confirmed from a primary source, either note it's confirmed across multiple reputable secondary sources with links, OR drop it entirely.
4. Note any important context that changes how the quote reads (was it a joke? was it in response to a specific question? was it later retracted?).

**Common traps:**
- Quotes widely attributed but with no traceable primary source
- Paraphrases or composites circulated as exact wording
- Quotes taken from one context (a hypothetical, a book review, a character's dialogue) and presented as the subject's own view
- Interview quotes where the question matters as much as the answer

### Stage 4: Distill into the Brief

Output two files, both in `Workshop/[project]/dossiers/` (or wherever the user specifies):

#### File 1: `[name].md` — The shareable brief

```
# [NAME] — Brief

[Optional: 1-2 sentence hook or context-setter]

## Profile

| Table: Born, Background, Current role, Net worth (if relevant + sourced),
  Education, Citizenships |

**Current activities:** Companies, roles, stakes, public appointments. With sources.

**Network position:** Allies, frequent collaborators, mentors / mentees, board seats.

## Worldview Synthesis

**The arc in one sentence:** [Capture trajectory — who they were → who they became → where they're heading]

**Phase 1-N:** Chronological arc in phases. One paragraph each. Focus on shifts in
worldview, not just career moves. What changed and why?

**Key influences:** Intellectual lineage, mentors, formative experiences, ideological
roots. Name the thinkers and movements. Trace the connections.

**Psychology:** Behavioral patterns, drives, temperament. What motivates them at the
deepest level? What are they afraid of? What do they want? How do they handle
conflict, criticism, exposure?

**Key contradictions (if any):** Where stated values and actions diverge. Be specific.

**Assessment (per requested lens):** Net assessment from the angle the user requested.
Specific reasons. Calibrate — not everyone fits the maximum of any axis. Say what
you actually think, with evidence.
```

#### File 2: `[name]-raw.md` — Full research backing

All quotes collected (30-50+), full source list, detailed biographical timeline, extended network mapping, anything that didn't make the cut for the brief but supports the analysis. Internal reference, not shareable.

---

## Quote Section

After the brief body, include a `## Quotes` section:

- Lead with the most psychologically revealing quote — not the most famous
- Organize thematically (themes depend on the requested lens)
- Every quote has: exact text, source name, date, and clickable link
- Let quotes speak for themselves — analysis belongs in the brief body, not next to quotes

**Selection criteria:**
- Psychologically revealing > policy-stating
- Unscripted > prepared
- Specific > generic
- Surprising > expected
- Fair: include quotes showing genuine intellectual seriousness, generosity, or moral seriousness where they exist

---

## Quality Gates

Before finalizing:

- [ ] Every quote has a linked primary or clearly-attributed secondary source
- [ ] No quote is taken out of context in a way that changes its meaning
- [ ] Assessment is calibrated to the requested lens — not artificially polarized
- [ ] Key contradictions (if cited) are concrete with evidence
- [ ] Worldview arc captures genuine evolution, not just a chronological list
- [ ] Positive qualities and genuine intellectual contributions are acknowledged where they exist
- [ ] Brief body is ~1 page; quotes are ~1 page — ruthlessly compress
- [ ] Someone skeptical of the requested lens would still find the brief factually accurate
