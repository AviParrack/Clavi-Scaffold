---
name: draft-it
description: "Produce a first draft in Avi's voice from raw input. Use this skill when the user asks to 'draft', 'write up', 'turn into a post', 'write a first draft', or says '/draft-it'. Also use when given raw notes, rough thoughts, or a research sprint output with a request to write something from it. Do NOT trigger for research tasks — use research-sprint for those. Do NOT use for Forethought institutional voice — use forethought-post for that."
argument-hint: "[topic or file path]"
metadata:
  author: Avi Parrack
  version: 0.2.0
---

# Draft-It

Takes raw material — notes, rough thoughts, a transcript, a research sprint, anything — and produces a first draft in Avi's voice. This is not a polishing tool. It is a *drafting* tool: it takes something that doesn't yet exist as prose and makes it exist. The output should sound like Avi wrote it on a sharp day.

The default failure mode is prioritizing *content* before internalizing *voice*. This produces prose that carries the right ideas in the wrong register. This skill inverts that order: voice is loaded before content is touched.

**The output should pass this test:** could the careful reader mistake this for something Avi actually wrote? If yes, the draft worked.

### Forethought Epistemic Standards (Always Apply)

Draft-it uses Avi's personal voice (first-person singular), NOT Forethought institutional "we." However, Forethought's epistemic and structural standards are the baseline for all drafts:

- **Anti-patterns:** `Crossroads/forethought-starter/skills/forethought-style/references/forethought-patterns.md` — reject mechanical transitions, safety-speak, over-hedging, flattened affect, prose walls, burying the lead
- **What makes a hit:** `Crossroads/forethought-starter/skills/forethought-post/references/retreat-insights.md` — missile test (nugget-y payload + intellectual heft + real-world push), cognitive-tool test
- **Visual variety:** mix prose, quotes, asides; never 4+ paragraphs same format
- **Lead with the take** — the reader should know the core insight within the first 200 words

When drafting for Forethought publication specifically, switch to forethought-post instead. See `.claude/rules/forethought-default.md` for the full Forethought style overlay.

---

## Workflow

### Phase 0: Setup and Input Intake

When invoked, clarify the following (ask only what isn't already clear from context):

1. **What's the raw material?**
   - Inline notes or thoughts (pasted in the message)
   - A file path to read
   - Output from a research sprint (specify which folder)
   - "I'll describe it now" — proceed to listen

2. **What format is this?**
   - Long-form essay (3000–8000 words) — flagship piece, full voice
   - Short post (500–1500 words) — single idea, tighter
   - Section or passage — not a full piece; just a chunk
   - Twitter thread — if so, use research-sprint's thread-format conventions instead

3. **Any specific angle, thesis, or emotional register to hit?**
   - What's the core argument or insight?
   - What should the reader *feel* at the end, not just *know*?
   - Any specific moves to include or avoid?

4. **What to do with the output?**
   - Save to `Blog/Outputs/[slug].md` (default)
   - Return inline only
   - Both

If the user is in a low-attention session (short message, typos, vague), minimize questions. Make reasonable assumptions and surface them at the top of the draft as a brief note.

---

### Phase 1: Style Ingestion (Do This Before Touching the Content)

**This phase is mandatory. Do not skip or compress it.**

Read the following files in full, in this order:

1. **`Town-Hall/User/Avi.md`** — who Avi is, what he cares about, communication preferences. Internalize the person before the style.
2. **`Blog/02-style/README.md`** — the full style guide. This is the primary document.
2. **`CLAUDE.md` → Writing Voice section** — quick reference and anti-patterns specific to Claude's defaults.
3. **`Blog/03-audience/README.md`** → The Mechanism of Change, Target Summary, and Key Messaging Frame.
4. **`references/voice-primer.md`** — consolidated voice breakdown: Sagan/Carlsmith/Ord/Palmer composition, anti-patterns, emotional register, audience.

After reading, internally consolidate the voice before writing a single word. The voice-primer has the full breakdown. Only begin drafting when this consolidation is complete.

---

### Phase 2: Content Analysis

Read and understand the raw material. Extract:

- **The core argument or insight** — one sentence, the thing the whole piece hangs on
- **Key evidence, examples, or moves** — what does the piece need to establish for the argument to land?
- **The emotional arc** — where does it start, where does it go, where does it end? What should the reader feel at each stage?
- **Structural options** — two or three ways this could be organized; pick the one that serves the argument and arc best, note why

Do not begin drafting until this is clear. If the raw material is unclear on the core argument, note this and either ask Avi or make a stated assumption.

---

### Phase 3: Drafting

Now write. The following are operating principles, not guidelines:

**Voice:**
- First person is fine and usually right. Let Avi's soul be visible.
- Sentence rhythm matters. Mix long and short. Let the prose breathe.
- The litany technique (Sagan) is available when accumulation serves the argument — use it; don't overuse it.
- The concrete-to-cosmic zoom (Carlsmith) is Avi's move: from mundane specifics to vast stakes and back.
- Facts before philosophy (Ord): ground the argument in the world before making philosophical claims.
- `{concept1}/{concept2}` notation for moments of genuine conceptual overlap or ambiguity — not decoration.
- Trust the reader. Assume well-read, assume curious, don't over-explain.

**Structure:**
- Essays are journeys, not reports. The reader should feel pulled forward.
- If lists are needed, use the prose-leading-into-**bolded-item** format from the style guide. Default to prose.
- Openings matter more than closings. Don't bury the insight that earns the reader's attention.
- If the piece has a strong structural move (self-mirroring, ARG trail seeding, surprise turn), flag it with a comment so Avi notices it.

**Sourcing (if relevant):**
- If the raw material includes claims that need support, either include them from the material or flag `[citation needed]` inline. Don't fabricate.
- For pieces drawing on research sprints: cite specific findings from the sprint files.

**For long-form essays:** include a header note with the HTML styling from `references/voice-primer.md` audience section if this is for the blog. Use the Forethought accent color conventions from the research-sprint formatting templates if it's a Forethought piece (but prefer forethought-post skill for those).

---

### Phase 4: Anti-Pattern Pass (Mandatory)

After drafting, run a pass against this checklist. **This pass must be explicit** — not silent self-editing, but a named review that surfaces specific issues.

Go sentence by sentence through the draft and flag:

**Mechanical transitions**
- Does any sentence open with "However," "Furthermore," "Additionally," "Moreover," "Nevertheless," "In conclusion"? Cut or rework.

**Flattened affect**
- Is the emotional intensity uniform when the argument calls for variation? Find the places that should be punchy and make them punchy. Find the places that should be quiet and let them be quiet.

**Safety-speak**
- Any vague cautions: "It's important to consider..." / "We should be mindful of..." / "It's worth noting that..."? Name the specific risk or cut the sentence.

**Bullet-point defaulting**
- Are there bulleted lists that would be warmer as prose? Convert unless the list is genuinely the right form.

**Direct pastiche**
- Any phrasing that sounds lifted from Sagan, Carlsmith, or Ord? Inspired by is fine. Recognizable imitation is not. Check the most vivid sentences.

**Generic AI patterns**
- Overuse of em-dash as an aside. "It's not X, it's Y" constructions. "At its core," "in many ways," "one might argue." Delete or rework each instance.

**Emotional register check**
- What should the reader *feel* at the end? Read the last paragraph. Does it land that feeling? If not, revise it.

After the pass, report to Avi:
- Number of flagged items and which categories
- Any that were borderline (kept but worth reviewing)
- One honest observation about what's working and one about what's still not quite right

---

### Phase 5: Delivery

Present the draft with:

1. **A one-line summary** of the core move the piece makes
2. **The draft itself**
3. **Anti-pattern pass results** — brief list of what was caught and fixed; anything kept that Avi should consciously review
4. **One honest note** — the thing that's still not quite right, in the writer's opinion. Not false modesty. Actual diagnosis.
5. **Suggested slug** and output path: `Blog/Outputs/[slug].md`

Ask Avi: save to file? Continue working on it? What feedback?

---

## Self-Interrogation Questions

Before delivering, Claude should answer these internally (not necessarily share unless they reveal something):

- If I didn't know this was AI-written, would I suspect it? Why or why not?
- What's the sentence I'm least confident in? Why?
- Where did I reach for a default (structure, phrasing, move) instead of making the choice that serves this specific piece?
- Does the voice stay consistent across the full draft, or does it slip in certain sections?
- Did I write from Avi's perspective, or did I write about Avi's perspective?
- Would this piece embarrass the EA home base, or impress them?
- If the primary target (a Big Tech CEO, a senior AI engineer) read this, would it land?

---

## Output Conventions

**File naming:** `Blog/Outputs/[YYYY-MM-DD]-[slug].md`

**File header:**
```markdown
# [Title]
*Draft — [date] | Input: [brief description of source material]*

---
```

**Easter eggs:** if there's a natural opportunity for one — a self-mirroring structure, an ARG trail character, a buried reference — pitch it in a note at the end of the file. Don't insert without flagging.

---

## Examples

### Example 1: Research sprint to essay

User says: "Turn the digital minds research sprint into a blog post"
Actions:
1. Read research sprint files in the specified folder.
2. Read style files and `references/voice-primer.md` (Phase 1).
3. Extract core argument, plan emotional arc, choose structure.
4. Draft in Avi's voice — first person, varied rhythm, concrete-to-cosmic zoom.
5. Anti-pattern pass. Report results.
Result: 4,000-word essay in Avi's voice, saved to `Blog/Outputs/[date]-digital-minds.md`, with anti-pattern report and honest assessment.

### Example 2: Quick post from rough notes

User says: "Here are some thoughts on why EA needs to engage more with the abundance movement, draft something short"
Actions:
1. Detect: short post (500–1500 words), inline input.
2. Minimal questions (user is low-attention: short message).
3. Style ingestion, content analysis, draft.
4. Anti-pattern pass.
Result: ~1,000-word post, assumptions stated at top, anti-pattern report.

### Example 3: Section draft for a larger piece

User says: "Write the opening section for the space expansion essay — should hook with the cosmic stakes"
Actions:
1. Detect: section/passage, specific emotional register requested.
2. Style ingestion, focus on opening craft.
3. Draft with strong opening move — concrete image before cosmic zoom.
4. Anti-pattern pass on the section.
Result: ~500-word opening section with notes on how it connects to the rest of the piece.

---

## Troubleshooting

### Style guide files not found
If `Blog/02-style/README.md` or `Blog/03-audience/README.md` don't exist or are empty:
1. Fall back to `references/voice-primer.md` as the primary voice reference
2. Fall back to `CLAUDE.md` → Writing Voice section
3. Note the missing files to Avi — they may need to be created or the paths may have changed

### Voice slips mid-draft
Long drafts (3000+ words) are most vulnerable to voice drift. If you notice the voice flattening or becoming more generic in later sections, re-read `references/voice-primer.md` before continuing. The anti-pattern pass should catch this, but prevention is better.

### Raw material is too thin
If the input doesn't contain enough for a full draft, say so. "This gives me enough for a ~500-word piece but not the 3000-word essay — can you provide more on X and Y?" is better than padding.

### Unclear whether this should be draft-it or forethought-post
If the input seems like Forethought institutional work (research analysis, "we" voice, multiple authors), suggest forethought-post instead. If it's personal essay / blog voice / first-person-singular, this is the right skill.

---

## Common Pitfalls

- **Starting with structure, not voice.** Outline first if needed, but don't let the outline constrain the prose. The essay finds its shape as it goes.
- **Mistaking information transfer for writing.** The goal isn't to convey Avi's notes — it's to create something that moves the reader.
- **Over-hedging on behalf of Avi.** Avi's voice is not excessively hedged. "Our assessment is X (medium confidence)" — not "one might perhaps suggest that X could be the case."
- **Losing the argument in the atmosphere.** Avi's style has genuine emotional range, but the argument must remain load-bearing throughout.
- **Forgetting the reader's situation.** The people reading this are busy, smart, skeptical, and in important rooms. Don't waste their time. Don't preach.
