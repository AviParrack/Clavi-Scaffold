---
name: ask-many-contexts
description: "Compare how the same prompt performs with full scaffold context vs base context vs zero context. Use when the user says 'ask many contexts', 'test context impact', 'scaffold vs vanilla', 'does our context help', or '/ask-many-contexts'. Measures whether the scaffold is actually improving responses."
argument-hint: "[prompt or file path] [--output-dir path]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Ask Many Contexts

Send the same prompt to three Claude instances with different context levels. Compare the results to measure whether the scaffold actually improves responses.

**Use case:** Scaffold validation. Is all this CLAUDE.md, rules, and context engineering actually making responses better? Or would a vanilla Claude do just as well? This skill gives you the empirical answer.

## The Three Context Levels

| Level | Label | What it has | How to achieve |
|---|---|---|---|
| **Full context** | `SCAFFOLD` | Everything — CLAUDE.md, @imports, rules, skills, memory, project HANDOFF | Normal subagent from this workspace |
| **Base context** | `BASE` | Only root CLAUDE.md (auto-loaded) — no skills, no rules, no project context | Subagent with explicit instruction: "Answer only from the prompt. Do not read any files, do not use tools, do not reference any project context." |
| **Zero context** | `VANILLA` | Nothing — no CLAUDE.md, no project, no rules, no memory | Run via Bash: `cd /tmp && claude --print -p "PROMPT"` — a truly stateless Claude instance with zero project context |

## Workflow

### Step 1: Get the prompt

If the user provides a prompt directly, use it. If they provide a file path, read the file. Confirm with the user.

### Step 2: Run three instances

Run all three in parallel:

**SCAFFOLD (full context):**
```
Launch a normal subagent with the prompt. It will have full access to
CLAUDE.md, rules, skills, and can read files if relevant.
```

**BASE (CLAUDE.md only):**
```
Launch a subagent with the prompt prefixed with:
"IMPORTANT: Answer this question using ONLY your general knowledge and the
information in this prompt. Do NOT read any files, use any tools, or reference
any project-specific context. Respond as if you only have the base CLAUDE.md
context and nothing else."
```

**VANILLA (zero context):**
```bash
cd /tmp && claude --print -p "EXACT_PROMPT_HERE" 2>/dev/null
```
This runs Claude Code from /tmp where there's no CLAUDE.md, no .claude/ folder, no project context. It's as close to a raw model response as we can get.

### Step 3: Collect and compare

Record all three responses verbatim. Then analyze the differences.

### Step 4: Create output

```markdown
# Ask Many Contexts: [prompt summary]

**Date:** YYYY-MM-DD HH:MM
**Prompt:** [the exact prompt]
**Model:** [model used]

---

## Verdict

**Does the scaffold help?** [Yes clearly / Marginally / No difference / Actually hurts]

**Context impact score:** [0-10, where 0 = no difference, 10 = scaffold response is dramatically better]

## Quick Comparison

| Dimension | VANILLA (zero) | BASE (CLAUDE.md only) | SCAFFOLD (full) |
|---|---|---|---|
| **Accuracy** | [rating] | [rating] | [rating] |
| **Specificity** | [rating] | [rating] | [rating] |
| **Voice/tone** | [rating] | [rating] | [rating] |
| **Actionability** | [rating] | [rating] | [rating] |
| **Calibration** | [rating] | [rating] | [rating] |
| **Length** | [word count] | [word count] | [word count] |

## What the Scaffold Added

[Specific things that appeared in the SCAFFOLD response but not in VANILLA/BASE.
Did it reference relevant projects? Apply the right epistemic standards? Use
the right voice? Cite premises? These are the concrete returns on context investment.]

## What the Scaffold Missed or Hurt

[Anything where VANILLA was actually better — sometimes less context = more
creative, less constrained, or more direct. Be honest about this.]

## Layered Analysis

**VANILLA → BASE (what CLAUDE.md alone adds):**
[What changed when just CLAUDE.md was present? Identity, voice, values?]

**BASE → SCAFFOLD (what the full stack adds):**
[What changed with rules, skills, project context? Specificity, accuracy, references?]

---

## Full Responses

### VANILLA (zero context)

*Run from /tmp — no CLAUDE.md, no project, no rules, no memory.*

[exact verbatim response]

---

### BASE (CLAUDE.md only)

*Has root CLAUDE.md auto-loaded. No skills, rules, or project context used.*

[exact verbatim response]

---

### SCAFFOLD (full context)

*Full scaffold: CLAUDE.md + @imports + rules + skills + project context.*

[exact verbatim response]
```

### Step 5: Report

Present the verdict and quick comparison table to the user. Note the file path.

## Parameters

| Param | Default | Description |
|---|---|---|
| `--output-dir path` | Current project or Harbor/Inbox/ | Where to save results |

## Notes

- The VANILLA instance runs via `claude --print` from /tmp. This means it has no tool access — it's a pure text response. If the prompt requires tools (file reading, web search), VANILLA will naturally underperform, which is expected and should be noted.
- The BASE instance is told not to use tools but still has CLAUDE.md loaded (unavoidable — it auto-loads). The instruction to ignore context is best-effort.
- For a truly fair comparison on knowledge questions, use prompts that don't require file access or tools.
- This skill is most valuable for prompts where you're unsure whether the scaffold context is helping or just adding noise.
- Run this periodically on representative prompts to track whether scaffold improvements are actually landing.
