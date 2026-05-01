---
name: audit
description: "Comprehensive paper review: editor, fact-checker, calculation auditor, red team, extensions, and simulated readers — all in parallel. Use this skill when the user asks to 'audit', 'review this paper', 'make this bulletproof', 'check this piece', or says '/audit'. Spawns parallel agents per section plus global and reader agents. Output is a structured reviews/ folder with severity-rated findings and a quick-scan index."
argument-hint: "[document path] [--readers 'persona1; persona2'] [--skip-facts] [--skip-readers]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Audit

Make a paper bulletproof. This skill simulates a full editorial pipeline: professional editor, fact-checker, calculation auditor, red team, extensions analyst, and a panel of simulated readers — all running in parallel across every section of the document.

**Design philosophy:** Compute is cheap, Avi's time is expensive. This skill is designed to be maximally thorough. A single run may take hours. That's fine. The goal is to catch everything so Avi can triage from a structured dashboard rather than re-reading the paper five times.

---

## Forethought Standards

All output follows Forethought's epistemic and stylistic standards (see `.claude/rules/forethought-default.md`). Findings should be direct, calibrated, and actionable. No safety-speak, no over-hedging, no burying the lead.

---

## Execution Flow

### Phase 0: Setup

When invoked:

1. **Read the full document.** Understand its structure, argument, and goals.

2. **Parse into sections.** Identify the document's natural sections (by headers, or by logical breaks if unstructured). Record:
   - Section number and title
   - Line range (approximate)
   - A one-line summary of what the section does

3. **Reader personas.** Determine who will read the piece:

   **If `--readers` is provided:** Use those personas.

   **If no readers specified:** Ask the user:
   > 🚩 **Who should read this piece?** I'll simulate reader reactions from specific personas. You can specify people by name and role (e.g., "Philip Johnston, CEO of Star Cloud" or "skeptical EA Forum commenter") or just say **"default"** and I'll use:
   > - **EA Forum skeptic** — looks for weak arguments, motivated reasoning, and missing counterarguments
   > - **Relevant domain expert** — [auto-selected based on paper topic]
   > - **Relevant powerful actor** — [auto-selected: someone with decision-making power in the space]
   > - **Informed lay reader** — smart, curious, no domain expertise; tests clarity and accessibility

   If the user says "default" or equivalent, populate the expert and powerful actor personas based on the document's topic. Be specific — not "an expert in space" but "a thermal engineer who's worked on satellite cooling systems" or "the head of ESA's in-orbit servicing program."

4. **Create the output directory.** Create `reviews/` as a sibling to the document (or inside the document's directory if it's in a project folder).

### Phase 1: Spawn All Agents

Launch all agents in parallel. Every agent receives the **full document** for context, plus specific instructions for their scope.

#### Section Agents (N agents, one per section)

Each section agent reads the full document, then focuses on their assigned section. They run the following passes and produce a single output file per section:

**Pass 1: Editor**
- Prose quality, clarity, concision
- Forethought style compliance (if applicable)
- Awkward phrasing, unclear antecedents, jargon without definition
- Paragraph-level flow and transitions
- Severity: 🔴 for genuinely confusing passages, 🟡 for style issues, 🟢 for minor polish

**Pass 2: Calculation Audit**
- Re-derive every number in the section from stated inputs
- Check units and dimensional consistency
- Sanity-check orders of magnitude (does this number pass the smell test?)
- Flag unstated assumptions in calculations
- If a calculation is wrong, show the correct derivation
- Severity: 🔴 for wrong results, 🟡 for unstated assumptions or marginal rounding, 🟢 for verified

**Pass 3: Red Team**
- For each major claim or argument in the section, construct the **strongest possible objection**
- Steelman, not strawman — the objection should be one a smart, informed critic would actually make
- Assess whether the document adequately addresses or preempts the objection
- Identify any claims that are load-bearing but under-supported
- Severity: 🔴 for unaddressed fatal objections, 🟡 for objections the paper should acknowledge, 🟢 for objections the paper already handles well

**Pass 4: Extensions & Sensitivity**
- What obvious follow-on analysis is missing?
- For key parameters: what happens if they're 2x, 5x, or 10x off?
- Are there boundary conditions or edge cases not considered?
- Are there natural comparisons or benchmarks not mentioned?
- Severity: 🟡 for extensions that would significantly strengthen the piece, 🟢 for nice-to-haves

**Pass 5: Comments**
- Typos, grammar, formatting issues
- Minor suggestions that don't fit the above categories
- Positive notes — things that work particularly well (reinforce, don't just criticize)
- All 🟢 unless genuinely important

**Output format for each section file:**

```markdown
# Section Review: [Section Title]

**Reviewer:** Section Agent [N]
**Scope:** Lines ~X-Y
**Overall assessment:** [1-2 sentence summary. What's the section's biggest strength and biggest weakness?]

## Editor
[Findings with severity tags]

## Calculation Audit
[Findings with severity tags, showing work for re-derivations]

## Red Team
[Objections with severity tags]

## Extensions & Sensitivity
[Suggestions with severity tags]

## Comments
[Minor notes]
```

#### Fact-Check Agents (N agents, one per section)

Invoke the `/fact-check` sub-skill for each section. Each agent receives the full document plus their assigned section. See the [fact-check skill](../fact-check/SKILL.md) for the detailed protocol.

Output: one `XX-section-name-facts.md` file per section.

#### Global Agent (1 agent)

Reads the full document and assesses document-level concerns that no single section agent can see:

- **Narrative arc:** Does the introduction promise what the conclusion delivers? Does the argument build coherently?
- **Structural issues:** Are sections in the right order? Is anything redundant? Are there gaps in the logical flow?
- **Argument coherence:** Do the pieces add up to a convincing whole? Are there internal contradictions?
- **Framing:** Is the piece framed in a way that serves its goals? Would a different framing be stronger?
- **Missing sections:** Is there an obvious section that should exist but doesn't?
- **Abstract/title accuracy:** Does the abstract accurately reflect the paper's content and conclusions?
- **Overall red team:** What is the single strongest objection to the paper's central thesis?

Output: `00-global.md`

#### Reader Agents (M agents, one per persona)

Each reader agent receives the full document plus their persona description. They read and react **in character**, covering:

- **First impression:** What's the headline takeaway? What would they remember a week later?
- **What works:** What's compelling or persuasive from their perspective?
- **What doesn't:** Where do they push back? What claims would they challenge?
- **What's missing:** What would they want to see that isn't there?
- **Would they share it?** If this were a blog post, would they share it with their network? Why or why not?
- **Specific reactions:** React to particular passages, claims, or framings that would land with or alienate this persona.

Output: `readers/persona-name.md`

### Phase 2: Collect & Index

Once all agents complete:

1. **Collect all outputs** into the `reviews/` directory:
   ```
   reviews/
     00-INDEX.md
     00-global.md
     01-introduction.md
     01-introduction-facts.md
     02-thermal-model.md
     02-thermal-model-facts.md
     ...
     readers/
       ea-forum-skeptic.md
       thermal-engineer.md
       ...
   ```

2. **Build the index** (`00-INDEX.md`):

```markdown
# Audit Report: [Document Title]

**Date:** [date]
**Document:** [path, as clickable link]
**Sections reviewed:** N
**Reader personas:** [list]

---

## Severity Dashboard

| Section | Editor | Calc | Facts | Red Team | Extensions |
|---|---|---|---|---|---|
| Introduction | 🟢 | — | 🟡 2 | 🟢 | 🟢 |
| Thermal Model | 🟡 1 | 🔴 1 | 🔴 2 | 🟡 1 | 🟡 1 |
| Cost Analysis | 🟢 | 🟡 1 | 🟢 | 🔴 1 | 🟢 |
| ... | | | | | |

*Numbers indicate count of findings at that severity level. Blank = no findings. Dash = not applicable.*

## 🔴 Must-Fix Issues

[All red findings from all sections and all passes, with section labels, one-line summaries, and 📍 search snippets. Sorted by pass type.]

## 🟡 Should-Fix Issues

[All yellow findings, same format.]

## Global Assessment

[2-3 paragraph summary from the global agent: narrative arc, structural issues, strongest overall objection.]

## Reader Reactions (Summary)

| Persona | Verdict | Would Share? | Top Concern |
|---|---|---|---|
| EA Forum skeptic | Mixed | No | [one-line] |
| Thermal engineer | Positive | Yes | [one-line] |
| ... | | | |

[One paragraph per persona summarizing their key reactions, with links to full reader files.]

## Files

[List of all review files with clickable links]
```

### Phase 3: Deliver

Present the index to the user with a brief summary:
- Total findings by severity
- The single most important issue found
- Whether reader personas were generally positive, mixed, or negative
- Suggested priority order for addressing findings

---

## Invocation Variants

### Full audit (default)
```
/audit Space/SDC/paper.md
```
Runs everything: all passes, all sections, fact-check, readers.

### With specific readers
```
/audit Space/SDC/paper.md --readers "Philip Johnston, CEO Star Cloud; thermal engineer with 20 years satellite experience; EA Forum power user who's skeptical of space"
```

### Skip fact-check (faster)
```
/audit Space/SDC/paper.md --skip-facts
```
Skips the fact-check sub-skill. Useful for early drafts where the facts will change.

### Skip readers (faster)
```
/audit Space/SDC/paper.md --skip-readers
```
Skips simulated reader personas.

### Fact-check only
```
/fact-check Space/SDC/paper.md
```
Just the fact-check sub-skill, standalone.

---

## Execution Notes

- **Every agent reads the full document first**, then focuses on their section. This ensures cross-references, defined terms, and context are understood.
- **Maximize parallelism.** All section agents, fact-check agents, reader agents, and the global agent should launch simultaneously. The index is built only after all complete.
- **Be genuinely critical.** The purpose of this skill is to find problems. Praise where deserved, but the primary value is in catching issues before publication.
- **Actionable findings only.** Every finding should tell Avi what to do: fix this calculation, rewrite this paragraph, add this caveat, consider this objection. Vague "this could be improved" is worthless.
- **The 📍 search snippet is mandatory** for every finding in every pass (not just fact-check). Avi needs to Ctrl+F to the exact location.
- **Positive findings matter too.** Each section review should note what works well, not just what's broken. This helps Avi preserve strengths during revision.

---

## Common Pitfalls

- **Going soft.** This skill exists to find problems. Don't pull punches to be polite. Be respectful but direct.
- **Missing the forest for the trees.** The global agent exists precisely because section agents can't see structural issues. Make sure the global agent actually addresses narrative arc, not just section-level concerns.
- **Shallow red-teaming.** "Some might disagree" is not a red team finding. The red team pass should identify specific, named objections that a smart critic would raise, and assess whether the paper addresses them.
- **Generic reader personas.** Reader agents should react as specific people with specific expertise and priors, not as vague archetypes. "A skeptic" is weak; "an EA Forum regular who thinks space is a distraction from near-term AI risk" is strong.
