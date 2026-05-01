---
name: explore-tree
description: "Recursive branching exploration from any input — a word, question, or document. Use when the user says 'explore tree', 'branch out from', 'brainstorm directions', 'map the space of', or '/explore-tree'. Produces a tree of explored territory with a summary of most promising branches."
argument-hint: "[seed — any text] [--depth 2] [--branch 10,5] [--intention 'free association']"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Explore Tree

Takes any input — a single letter, a word, a question, a paragraph, a whole document — and recursively branches outward, exploring the possibility space. Each branch is explored by a fresh agent. Produces a mapped tree of territory.

## On Invocation — Understand the User's Intent

Before spawning any agents, ask the user three questions (use AskUserQuestion):

1. **"What should I explore?"** — confirm the seed input
2. **"What's the intention?"** — this shapes how every agent branches:
   - `free association` — go wherever is interesting (default)
   - `problem-solving` — branches are approaches/solutions
   - `taxonomy` — branches are categories/classifications
   - `brainstorm` — branches are creative ideas
   - `analysis` — branches are dimensions/factors/considerations
   - `devil's advocate` — branches are counterarguments/risks/failure modes
   - Or any custom instruction from the user
3. **"Any constraints?"** — domain restrictions, things to avoid, focus areas

## The Key Design Rule: What Propagates

**The seed rule does NOT propagate down the tree.**

Example with seed `A`:
```
A → ant, arithmetic, aurora, architecture...
  ant → queen, colony, farm, leafcutter, fire ant...     ← explores "ant", NOT "more A-words"
  arithmetic → algebra, abacus, mental math...            ← explores "arithmetic", NOT "more A-words"
```

**What DOES propagate:**
- The user's **intention** (free association, problem-solving, etc.)
- The user's **constraints** (stay in domain X, avoid Y)

**What each parent passes to its children:**
- Its own topic (the branch name)
- The intention + constraints
- NOT the full ancestry chain (that would over-constrain deeper levels)

## Workflow

### Step 1: Gather intent (as above)

### Step 2: Root brainstorm

Generate N branches from the seed (default 10, max 20). For each branch:
- A short label (2-5 words)
- A one-line description of the direction

Present to user for optional pruning: "Here are 10 directions. Want to remove any, or shall I explore all?"

### Step 3: Spawn agents for depth 1

For each branch, spawn a subagent with this prompt:

```
You are exploring the concept of "[branch label]" with the intention of 
[user's intention]. Constraints: [user's constraints].

1. Write a 1-2 paragraph exploration of this topic.
2. Then brainstorm [M] further sub-directions worth exploring. For each,
   give a short label and one-line description.

Do NOT reference the original seed "[root seed]" — you are exploring 
[branch label] on its own terms.
```

### Step 4: Recurse (if depth > 1)

For each sub-direction returned by depth-1 agents, spawn depth-2 agents with the same pattern. The prompt references only their immediate parent, not the root.

**Branch factor reduction:** Default reduces at each level to prevent explosion:
- Depth 1: 10 branches (from user's seed)
- Depth 2: 5 per branch (from each depth-1 agent)  
- Depth 3: 3 per branch (from each depth-2 agent)

### Step 5: Collect and synthesize

Wait for all agents. Build the tree. Then write a summary:

### Step 6: Output

```markdown
# Explore Tree: [seed]

**Date:** YYYY-MM-DD
**Seed:** [the input]
**Intention:** [user's stated intention]
**Constraints:** [any constraints]
**Depth:** [actual depth reached]
**Total branches explored:** [count]
**Total agents spawned:** [count]

---

## Top 10 Most Promising Branches

1. **[full path: root → branch → sub-branch]** — [why this is interesting/promising]
2. ...
[Ranked by novelty, relevance to intention, and potential for further exploration]

## Unexpected Connections

[Any surprising links between branches that wouldn't have been obvious from the seed]

---

## The Tree

### 1. [Branch label]

[1-2 paragraph exploration]

#### 1.1 [Sub-branch]
[exploration]

#### 1.2 [Sub-branch]
[exploration]

##### 1.2.1 [Sub-sub-branch] (depth 3)
[exploration]

### 2. [Branch label]

[1-2 paragraph exploration]

#### 2.1 [Sub-branch]
[exploration]

[...etc for all branches]
```

## Caps and Safeguards

| Parameter | Default | Max | Notes |
|---|---|---|---|
| Depth | 2 | 3 | Depth 3 gets expensive fast |
| Branches (depth 1) | 10 | 20 | User's seed → N directions |
| Branches (depth 2) | 5 | 10 | Each depth-1 → M sub-directions |
| Branches (depth 3) | 3 | 5 | Each depth-2 → K sub-sub-directions |
| Total agents | calculated | 250 | Hard cap. Auto-reduce branching if exceeded |

**Token estimate by configuration:**
| Config | Agents | Est. tokens | Est. cost |
|---|---|---|---|
| depth=1, branch=10 | 10 | ~50K | ~$0.30 |
| depth=2, branch=10,5 | 60 | ~300K | ~$2.00 |
| depth=2, branch=20,5 | 120 | ~600K | ~$4.00 |
| depth=3, branch=10,5,3 | 210 | ~1M | ~$7.00 |

## Parameters

| Param | Default | Description |
|---|---|---|
| `--depth N` | 2 | How many levels to recurse |
| `--branch N,M,K` | 10,5,3 | Branch factor at each depth level |
| `--intention` | "free association" | Exploration mode (see list above) |
| `--output-dir` | Current project or Harbor/Inbox/ | Where to save |

## Notes

- The explore-tree is NOT a search tool — it's a mapping tool. It maps possibility space, not facts.
- The "Top 10" summary is the most valuable output. The full tree is reference material.
- Works surprisingly well with very short seeds. Single words or even letters produce rich trees.
- For problem-solving intention, the tree naturally produces an option space that can feed into decision-making.
- For research topics, pairs well with `/decompose` (which breaks down a question) — explore-tree maps the *territory* while decompose maps the *question*.
