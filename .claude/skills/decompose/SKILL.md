---
name: decompose
description: "Break a complex question into answerable sub-questions, recursively, until each leaf is a single search/calculation/lookup. Use when the user says 'decompose this', 'break this down', 'how would we answer this', 'research plan for', or '/decompose'. Produces a question tree + action plan that feeds into /research-sprint."
argument-hint: "[complex question or file path] [--max-depth 3] [--output-dir path]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Decompose

Take a hard, fuzzy, or complex question and recursively decompose it into sub-questions until each leaf is approximately at the level where a single Google search, calculation, or focused lookup could answer it.

**Use case:** Research planning. Before launching a `/research-sprint`, decompose the question first. The sprint agents get clearer, more tractable sub-questions instead of one giant fuzzy prompt. Dramatically improves thoroughness.

## Workflow

### Step 1: Understand the question

Read the input. If it's a file, read the file. Restate the question back to the user in one crisp sentence to confirm understanding.

### Step 2: First decomposition

Break the question into 3-7 sub-questions. For each, ask: "Could a single focused search/calculation answer this?" If yes, it's a leaf. If no, it needs further decomposition.

### Step 3: Recursive decomposition

For each non-leaf sub-question, decompose again. Continue until every leaf meets one of these criteria:

| Leaf criterion | Example |
|---|---|
| **Single web search** | "What is the current US federal R&D budget?" |
| **Single calculation** | "What is 4.5% of global GDP?" |
| **Specific data lookup** | "What does IPCC AR6 say about X?" |
| **Known database query** | "What is the FRED time series for X?" |
| **Well-scoped expert question** | "What do structural engineers say about X?" |

**Stop conditions:**
- Leaf is answerable by one focused action
- Max depth reached (default 3)
- Further decomposition adds no clarity

### Step 4: Tag each leaf

Every leaf gets an action tag:

| Tag | Meaning | Tool to use |
|---|---|---|
| `SEARCH` | Web search can answer | `/research-sprint` or `WebSearch` |
| `CALC` | Needs a calculation or BOTEC | `/BOTEC-brief` or manual |
| `LOOKUP` | Specific data source exists | API, database, or specific URL |
| `EXPERT` | Needs human domain expertise | Flag for Avi or collaborator |
| `SPECULATIVE` | No definitive answer exists | Flag as genuine uncertainty |
| `META` | About the question itself (framing, scope) | Resolve before researching |

### Step 5: Generate research plan

Convert the tagged tree into an executable plan:

```markdown
## Research Plan

### Phase 1: Quick wins (LOOKUP + CALC)
These can be answered immediately:
1. [leaf] → [specific action]
2. [leaf] → [specific action]

### Phase 2: Web research (SEARCH)
Launch as /research-sprint facets:
1. [leaf] → search query: "[suggested query]"
2. [leaf] → search query: "[suggested query]"

### Phase 3: Expert consultation (EXPERT)
Need human input:
1. [leaf] → ask [who] about [what]

### Phase 4: Synthesis
Once phases 1-3 complete, synthesize answers bottom-up through the tree.

### Unresolvable (SPECULATIVE)
These have no definitive answer — flag as uncertainty in final output:
1. [leaf] — [why it's speculative]
```

### Step 6: Output

```markdown
# Decompose: [question]

**Date:** YYYY-MM-DD
**Original question:** [exact question]
**Depth:** [max depth reached]
**Leaves:** [total leaf count] ([N] SEARCH, [N] CALC, [N] LOOKUP, [N] EXPERT, [N] SPECULATIVE)

---

## Question Tree

### [Root question]

#### 1. [Sub-question]
  - 1.1 [Sub-sub-question] `SEARCH` → "[suggested query]"
  - 1.2 [Sub-sub-question] `CALC` → [what to calculate]
  - 1.3 [Sub-sub-question] `LOOKUP` → [specific source]

#### 2. [Sub-question]
  - 2.1 [Sub-sub-question] `SEARCH` → "[suggested query]"
  - 2.2 [Sub-sub-question] `EXPERT` → ask [who]
    - 2.2.1 [Sub-sub-sub-question] `SPECULATIVE` — [why uncertain]

#### 3. [Sub-question] `SEARCH` → "[suggested query]"
  (leaf — no further decomposition needed)

[...etc]

---

## Research Plan

[Phase 1-4 as above]

---

## Dependency Map

[Which sub-questions depend on answers to other sub-questions?
Draw the critical path — what must be answered first?]
```

## Parameters

| Param | Default | Description |
|---|---|---|
| `--max-depth` | 3 | Maximum recursion depth |
| `--output-dir` | Current project or Harbor/Inbox/ | Where to save |

## Notes

- The decomposition itself is cheap (~5-15K tokens). The value is in making downstream research dramatically more focused.
- Each leaf's suggested search query should be specific enough to paste directly into a search engine.
- The dependency map matters — some leaves can't be answered until others are resolved first.
- This skill pairs naturally with `/research-sprint`: decompose first, then hand the SEARCH leaves to a sprint as individual facets.
- For very broad questions, the first decomposition might produce 7+ sub-questions. That's fine — breadth at depth 1, focus at depth 2+.
