---
name: deep-review
description: "Deep paper review: editor, fact-checker, calculation auditor, red team, extensions, simulated readers — all parallel, output is a single comprehensive file. Use when the user asks to 'deep review', 'audit', 'review this paper', 'make this bulletproof', 'check this piece', or says '/deep-review' or '/audit'."
argument-hint: "[document path or claim] [--readers 'persona1; persona2'] [--skip-facts] [--skip-readers]"
metadata:
  author: Avi Parrack & Claude
  version: 1.0.0
---

# Deep Review

Make a paper bulletproof. This skill simulates a full editorial pipeline: professional editor, fact-checker, calculation auditor, red team, extensions analyst, and a panel of simulated readers — all running in parallel across every section of the document.

**Design philosophy:** Compute is cheap, the user's time is expensive. This skill is designed to be maximally thorough. A single run may take hours. That's fine. The goal is to catch everything so the user can triage from a structured dashboard rather than re-reading the paper five times.

**Output:** ONE comprehensive markdown file. No `reviews/` folder, no per-agent files — everything woven together for the reader.

---

## PDF Handling

If the input is a PDF:

1. Extract text once via `pdftotext -layout <path>.pdf <sibling>.txt` (preferred location: sibling `.txt`; if directory is read-only, fall back to `/tmp/<basename>.txt`).
2. All agents receive **both** paths in their prompt — the PDF (for figure/image inspection) and the `.txt` (for grep, line references, and reliable text).
3. **OCR caveat to flag for agents:** `pdftotext` may corrupt math symbols (`±`, `→`, `≤`), Greek letters, accented characters, ligatures, and table formatting. Anomalies should be sanity-checked against the PDF original. Tables are often the worst-affected — read the PDF directly when verifying tabular numbers.

For markdown / html / plain text inputs: no extraction needed.

---

## Output File

**ONE file**, always sibling to the document:

```
<doc-dir>/deep-review-<doc-slug>.md
```

- **`doc-slug`**: input filename without extension, lowercased, hyphens for spaces (e.g. `Eternity-in-six-hours.pdf` → `eternity-in-six-hours`).
- **Claim-based input** (no document): `<cwd>/deep-review-<claim-slug>.md` where slug = first 4–6 keywords of the claim, lowercased + hyphenated.
- **Existing file?** Append `-2` / `-3` etc. to the slug. Never overwrite.

No `reviews/` subfolder. No per-agent files. Everything goes in the single mega-file.

---

## Execution Flow

### Phase 0: Setup

1. **Read the full document.** Understand its structure, argument, and goals. (For PDFs: do the extraction in PDF Handling first.)

2. **Parse into sections.** Identify natural sections (by headers, or by logical breaks if unstructured). Record:
   - Section number and title
   - Line range or page range
   - One-line summary of what the section does

3. **Reader personas.** Determine who will read the piece:

   **If `--readers` provided:** use those personas.

   **If no readers specified, default + auto-pick** based on document topic:
   - **EA Forum / community skeptic** — looks for weak arguments, motivated reasoning, missing counterarguments
   - **Relevant domain expert** — auto-selected (be specific — not "an expert in space" but "a thermal engineer who's worked on satellite cooling systems" or "the head of ESA's in-orbit servicing program")
   - **Relevant powerful actor** — auto-selected (someone with decision-making power in the space)
   - **Informed lay reader** — smart, curious, no domain expertise; tests clarity and accessibility

   No interactive confirmation needed when `default` would clearly apply (autonomous / `/loop` / cron contexts).

4. **Stage agent outputs.** Pick one of:
   - **(a) In-memory**: agents return their full output as their response message; orchestrator concatenates. Best for short docs.
   - **(b) Staging files**: agents write to `/tmp/deep-review-<doc-slug>-staging/<agent>.md`; orchestrator reads all, weaves into the final mega-file, deletes staging. Best for long docs (>5K words of total agent output).

   Either way: no individual files in the document's directory.

### Phase 1: Spawn All Agents

Launch all agents in parallel. Every agent receives the **full document** (PDF + .txt) for context, plus their specific scope.

#### Section Agents (N, one per section)

Each section agent reads the full document, then focuses on their assigned section. They run all 5 passes and emit a single section block:

**Pass 1 — Editor**
- Prose quality, clarity, concision
- Style compliance (per any path-scoped writing-voice rules)
- Awkward phrasing, unclear antecedents, jargon without definition
- Paragraph-level flow and transitions
- Severity: 🔴 for genuinely confusing passages, 🟡 for style issues, 🟢 for minor polish

**Pass 2 — Calculation Audit**
- Re-derive every number in the section from stated inputs
- Check units and dimensional consistency
- Sanity-check orders of magnitude
- Flag unstated assumptions in calculations
- If a calculation is wrong, show the correct derivation
- Severity: 🔴 wrong, 🟡 unstated assumption / marginal rounding, 🟢 verified

**Pass 3 — Red Team**
- For each major claim, construct the **strongest possible objection** (steelman, not strawman)
- Assess whether the document adequately addresses or preempts it
- Identify load-bearing claims that are under-supported
- Severity: 🔴 unaddressed fatal objection, 🟡 should-acknowledge, 🟢 already handled

**Pass 4 — Extensions & Sensitivity**
- What obvious follow-on analysis is missing?
- For key parameters: what if they're 2×, 5×, or 10× off?
- Boundary conditions, edge cases, missing comparisons
- Severity: 🟡 would significantly strengthen, 🟢 nice-to-have

**Pass 5 — Comments**
- Typos, grammar, formatting
- Minor suggestions
- Positive notes — what works particularly well (reinforce, don't just criticize)
- All 🟢 unless genuinely important

**Per-finding format:**

Every finding includes a 📍 search snippet (verbatim ~10-word quote) so the reader can Ctrl+F to it.

**Calibration**: do not pre-suggest specific errors in section-agent prompts. Instructions like "verify this suspected typo" prejudice the audit. Frame as "identify any calculation inconsistencies" and let the agent find them.

#### Fact-Check Agents (1 per section, or 1 per chunk for short docs)

Invoke the `/fact-check` sub-skill. Each agent receives the full document plus their assigned section. See `.claude/skills/fact-check/SKILL.md` for the protocol. Outputs structured findings: ✅ verified / ⚠️ partial / ❌ wrong / 🤷 unverifiable, each with a primary-source link.

#### Global Agent (1)

Reads the full document and assesses document-level concerns no single section agent can see:
- **Narrative arc**: does the introduction promise what the conclusion delivers? Coherence of the build.
- **Structural issues**: section order, redundancy, gaps in flow.
- **Argument coherence**: pieces add up to the whole? Internal contradictions?
- **Framing**: does the framing serve the goals? Would a different framing be stronger?
- **Missing sections**: obvious section that should exist but doesn't.
- **Abstract/title accuracy**: does the abstract reflect content + conclusions?
- **Overall red team**: single strongest objection to central thesis.

#### Reader Agents (M, one per persona)

Each receives full document + persona description. Reacts in character, covering:
- **First impression** — headline takeaway, one-week-later memory
- **What works** — what's compelling from this persona's angle
- **What doesn't** — pushback, claims they'd challenge
- **What's missing** — what they'd want
- **Would they share it?** — and why or why not
- **Specific reactions** — passages that land or alienate

Reader agents speak in first-person. Steelman the paper's position when they can; honest about what doesn't land.

### Phase 2: Assemble the mega-file

Once all agents return, build the single output file in this structure:

```markdown
# Deep Review: [Document Title]

**Date:** [date]
**Document:** [path, clickable link]
**Sections reviewed:** N
**Reader personas:** [list]
**Total agents:** [count]
**Runtime:** [X minutes]

---

## Severity Dashboard

| Section | Editor | Calc | Facts | Red Team | Extensions |
|---|---|---|---|---|---|
| §1 ... | 🟢 | 🟡 1 | 🔴 2 | 🟢 | 🟡 1 |
...

## 🔴 Must-Fix Issues

[All red findings, every section, every pass. Cross-section. Each finding: section label, one-line summary, 📍 snippet. Sorted by severity then section.]

## 🟡 Should-Fix Issues

[All yellow findings, same shape.]

## Global Assessment

[2-3 paragraphs from the global agent: arc, structure, strongest overall objection.]

## Reader Reactions (Summary)

| Persona | Verdict | Would Share? | Top Concern |
|---|---|---|---|
...

[1 paragraph per persona summarizing key reactions.]

---

## Section Reviews

### §1 [Title]

[Full section-agent output: all 5 passes inline, severity tags, 📍 snippets.]

### §2 [Title]

...

---

## Fact-Checks

[Full fact-check agent output, organized by chunk. Each claim with verification status + source.]

---

## Reader Reactions (Full)

### EA Forum skeptic
[Full reader output.]

### [Domain expert]
...

---

## Convergence

[Optional but valuable: which findings did multiple passes / multiple readers flag? These are the most defensible critiques.]
```

**Single Write call.** No `reviews/` directory. If using staging files, delete the staging dir after the final file is written.

### Phase 3: Deliver

Present the file to the user with:
- Total findings by severity (e.g. "5 🔴 / 12 🟡 / 3 🟢-positive")
- The single most important issue
- Reader sentiment summary (positive / mixed / negative across personas)
- Suggested priority order for revisions

---

## Invocation Variants

```
/deep-review path/to/paper.md
```
Full battery: all passes, all sections, fact-check, default reader personas.

```
/deep-review paper.md --readers "Philip Johnston, CEO Star Cloud; thermal engineer with 20 yrs satellite experience; EA Forum power user skeptical of space"
```
Custom readers.

```
/deep-review paper.md --skip-facts
```
Faster: skip the fact-check sub-skill (use for early drafts where facts will change).

```
/deep-review paper.md --skip-readers
```
Skip reader personas.

```
/fact-check paper.md
```
Just the fact-check sub-skill, standalone.

---

## Execution Notes

- **Every agent reads the full document first**, then focuses on their section. Cross-references and defined terms need full context.
- **Maximize parallelism.** All section + fact-check + reader + global agents launch simultaneously. Phase 2 runs only after all return.
- **Be genuinely critical.** The skill exists to find problems. Praise where deserved, but the primary value is catching issues before publication.
- **Actionable findings only.** Every finding tells the user what to do: fix this calc, rewrite this paragraph, add this caveat, consider this objection. Vague "could be improved" is worthless.
- **The 📍 search snippet is mandatory** for every finding in every pass.
- **Positive findings matter too.** Each section review notes what works well — preserves strengths during revision.
- **Word-count guidance, not caps.** If a section needs 3000 words to be substantive, write 3000 words. Substance > brevity.

---

## Common Pitfalls

- **Going soft.** This skill exists to find problems. Don't pull punches to be polite. Be respectful but direct.
- **Missing the forest for the trees.** The global agent exists precisely to catch document-level issues. Make sure it actually addresses arc/structure, not just section-level concerns.
- **Shallow red-teaming.** "Some might disagree" is worthless. The red team pass identifies specific, named objections a smart critic would raise.
- **Generic reader personas.** Readers should react as specific people with specific expertise + priors, not vague archetypes. "A skeptic" is weak; "an EA Forum regular skeptical of space as a distraction from near-term AI risk" is strong.
- **Pre-suggesting errors in section prompts.** Don't write "verify this typo at line X" — agents will defer rather than independently checking. Frame as "find any errors in this section." Let agents discover.