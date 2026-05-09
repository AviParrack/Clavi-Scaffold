---
name: BOTEC-brief
description: "Draft or revise a BOTEC brief — back-of-the-envelope structured technical analysis with tables, calculations, and formatted derivations. Use when the user asks for a BOTEC, back-of-the-envelope calculation, technical brief, or structured analysis with tables. Iterative: can be called multiple times on the same piece (notes → draft → revision → polish)."
metadata:
  version: 0.5.0
---

# BOTEC Brief

Takes material at any stage — raw notes, spreadsheet summary, messy draft, near-final piece — and produces or refines a structured technical brief. The output reads like a small sharp team that respects the reader's intelligence and is honest about its own uncertainty.

**Iteration is first-class.** This skill is designed to be called multiple times on the same piece. First call might take notes to a draft. Second call takes the draft plus reviewer comments and produces a revision. Third call polishes. Each invocation should preserve what's working and fix what isn't, without defaulting to a rewrite.

The failure modes to watch for:
- **Flattening into generic think-tank prose.** Briefs should have texture — surprise the reader with a finding, be honest about what's shaky, let the analysis breathe.
- **Breathlessness.** Treating every finding as revolutionary. Calibration matters.

---

## Workflow

### Phase 0: Mode Detection

Determine the mode from context. Ask only what isn't already clear:

**Mode A — Notes to Draft**
- Input: raw notes, spreadsheet data, research sprint output, bullet points
- Output: a structured brief draft
- Ask: What's the core claim? Who's the audience? Any specific sections to emphasise or skip?

**Mode B — Draft to Revision**
- Input: existing draft + reviewer comments / requested changes
- Output: revised draft preserving what works, addressing the asks
- Ask: Which comments are load-bearing vs. optional? Any section to cut entirely?

**Mode C — Revision to Polish**
- Input: near-final piece
- Output: cleaned-up version (tighten, sharpen, audit citations, fix table formatting)
- Ask: Any specific concerns or just a final pass?

### Phase 1: Structure

Standard BOTEC brief structure:

1. **Opening claim** — the finding, in 1-2 sentences. Lead with the take.
2. **Setup** — what question is this answering and why is it worth asking?
3. **Calculation / model** — show the work. Tables, equations, derivations.
4. **Result** — what the numbers say. Confidence interval if appropriate.
5. **Sensitivity** — what assumptions matter most. What would change the conclusion.
6. **Implications** — what to do with this. Concrete next steps if any.

Adapt the structure to the topic — but don't bury the finding under setup.

### Phase 2: The Calculation Discipline

For BOTEC-style work specifically:

- **Show every step.** A reader should be able to verify or refute by following the math.
- **Use tables for parameters.** Each row: variable, value, unit, source. Citation per row.
- **Show order-of-magnitude thinking explicitly.** *"Within an order of magnitude"* is fine; *"approximately X"* without bounds is not.
- **Sensitivity matters more than precision.** A BOTEC's value is showing which assumptions move the answer most.
- **Honest confidence flags.** *"High confidence"*, *"Educated guess"*, *"Speculative"* — calibrate visibly.

### Phase 3: Voice

- **Claim → evidence → confidence → what would change this.** This is the BOTEC pattern.
- **Compress.** First draft of any paragraph is too long. Edit it to half. Then check if you lost meaning.
- **Surprise the reader at least once per piece.** A counterintuitive finding, an unexpected number, a dimension they hadn't considered.
- **Be honest about uncertainty without hedging into mush.** "We're confident X, less sure Y, genuinely don't know Z" beats "It might be the case that..."
- **Match the user's writing voice.** Read [User.md](../../../Town-Hall/User/User.md) for register; consult `.claude/rules/writing-voice.md` if applicable. Don't impose a generic think-tank voice.

### Phase 4: Output

Write to the location the user specifies. Default: a `BOTEC-{topic}.md` file alongside the document being analyzed (sibling to the source data), or `BOTEC-{topic}.md` in the current working directory if no project context.

If the brief includes calculations, also save:
- A working spreadsheet or `.csv` with the numbers (if data-rich)
- Source URLs for every quantitative claim (verified per `citation-standards.md` rule if scoped)

### Phase 5: Math Verification Loop (Mandatory)

Numbers in a BOTEC carry the argument. Wrong numbers turn a sharp brief into a liability. After Phase 4, automatically run a math verification loop:

1. **Extract every numerical claim.** Walk through the draft and list every number, derived value, ratio, table entry, plus the inputs each one depends on. Skip ranges and order-of-magnitude estimates that are explicitly flagged as such; verify everything else.

2. **Spawn N=3 independent verification agents per calculation cluster.** Use the Agent tool (general-purpose). Each agent gets ONLY the inputs and is asked to re-derive the calculation from scratch — they do **not** see the draft's stated answer. Cluster related calculations (e.g., all entries of one table) into a single agent prompt for efficiency.

   Sample agent prompt: *"Given these inputs [list inputs verbatim], independently derive [the calculation]. Show your work. Do not assume any answer — derive it. Report the final value with units."*

3. **Compare results across the three agents and the draft:**
   - All 3 agents agree with the draft → 🟢 **verified**
   - 2+ agents agree with each other but disagree with the draft → 🔴 **likely error in draft**. Investigate; fix the draft.
   - All 3 disagree with each other → 🟡 **calculation is poorly specified.** Either tighten the inputs, document the assumption, or replace the precise number with an explicit uncertainty range.

4. **Fixing loop.** For each 🔴 finding, fix the draft and re-spawn 1 verification agent on the corrected calculation. Repeat. Hard limit: 3 iterations. After 3 rounds of unresolved disagreement, escalate to the user with the disagreeing derivations side-by-side.

5. **Append a verification box** at the end of the methodology section: # claims checked, # 🟢 verified, # 🟡 flagged, # 🔴 fixed, # iterations needed, # remaining open. Audit trail.

**Skip flag.** For fast iteration during early drafting, the user can pass `--skip-verify`. Default is verification ON. If skipped, the methodology box must explicitly note "math not independently verified."

---

## Quality Gates

Before delivering:

- [ ] Lead is in the first 200 words
- [ ] Every quantitative claim has an inline citation
- [ ] Tables list source per row or footnote
- [ ] Sensitivity analysis present (which assumptions move the answer most)
- [ ] At least one surprising finding (or honest acknowledgment if none)
- [ ] Confidence flags calibrated (not everything is "high confidence")
- [ ] Length appropriate to the question — don't pad

---

## Iteration Patterns

When called a second time on the same piece:

- **Read the existing draft fully before editing.** Don't redo work that's already good.
- **Identify what the user is asking for** — a specific fix, a fresh take, a polish pass?
- **Preserve voice and structure** unless the user asked for restructure.
- **Surface what changed** in a brief note at the end of the response: *"Changes: tightened section 2, added sensitivity table, fixed citation in row 4."*
