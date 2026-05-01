---
name: ask-many-times
description: "Send the same prompt to 10 fresh Claude instances and compare their responses. Use when the user says 'ask many times', 'test this prompt', 'how consistent is this', 'run this 10 times', or '/ask-many-times'. Reveals how stable/reliable a response is — where models converge vs diverge on the same input."
argument-hint: "[prompt or file path] [--count N] [--output-dir path]"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Ask Many Times

Send the same prompt to N fresh Claude instances (default 10). Each instance is a clean subagent with no shared context between them. Transcribe their exact responses, then produce a distillation and summary table.

**Use case:** Testing prompt reliability. Do 10 independent Claudes converge on the same answer, or do they diverge? Where is the response stable vs noisy?

## Workflow

### Step 1: Get the prompt

If the user provides a prompt directly, use it. If they provide a file path, read the file as the prompt. Confirm the prompt with the user before launching.

### Step 2: Launch N fresh instances

Spawn N subagents (default 10) in parallel. Each gets the identical prompt with NO additional context — they should be as independent as possible.

```
For each instance i = 1..N:
  Launch Agent with:
    prompt: "[the exact user prompt]"
    description: "Instance {i} of {N}"
```

**Important:** Do NOT include any preamble, system context, or framing. The subagent gets the raw prompt exactly as written. This ensures each response is independent.

### Step 3: Collect responses

Wait for all instances to complete. Record each response verbatim.

### Step 4: Create output

Create a results file in the specified output directory (default: current Workshop project, or Harbor/Inbox/ if no active project):

```markdown
# Ask Many Times: [prompt summary]

**Date:** YYYY-MM-DD HH:MM
**Prompt:** [the exact prompt]
**Instances:** N
**Model:** [model used]

---

## Distillation

**Convergence:** [high/medium/low] — [1-2 sentence summary of how much the responses agree]

**Core consensus:** [What most/all instances agreed on]

**Key divergences:** [Where responses differed significantly]

**Surprising outliers:** [Any instance that produced something notably different]

## Summary Table

| # | Key claim/answer | Confidence | Unique insight | Length |
|---|---|---|---|---|
| 1 | [main point of response 1] | [high/med/low agreement with others] | [anything only this instance said] | [word count] |
| 2 | ... | ... | ... | ... |
| ... | | | | |

## Convergence Analysis

- **Fully converged (all N agree):** [list points]
- **Mostly converged (7+ agree):** [list points]  
- **Split (4-6 agree):** [list points]
- **Divergent (≤3 agree):** [list points]

---

## Full Responses

### Instance 1

[exact verbatim response]

---

### Instance 2

[exact verbatim response]

---

[...etc for all N instances]
```

### Step 5: Report

Present the distillation and summary table to the user. Note the file path where full results are saved.

## Parameters

| Param | Default | Description |
|---|---|---|
| `--count N` | 10 | Number of instances to spawn |
| `--output-dir path` | Current project or Harbor/Inbox/ | Where to save results |

## Notes

- All instances run in parallel for speed.
- Each instance is a fresh subagent — no shared memory, no conversation history between them.
- The distillation should be honest about convergence. If responses are noisy, say so — that's the finding.
- Word count per response helps spot instances that phoned it in vs gave thorough answers.
