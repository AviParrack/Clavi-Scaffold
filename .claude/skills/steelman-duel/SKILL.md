---
name: steelman-duel
description: "Generate the strongest possible argument for EACH side of a debate, by separate agents who can't see each other. Use when the user says 'steelman both sides', 'steelman duel', 'best arguments for and against', 'debate this', or '/steelman-duel'."
argument-hint: "[debate topic or claim]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Steelman Duel

Spawn two agents, each tasked with building the absolute strongest case for one side of a debate. They can't see each other's work. A third judge agent evaluates which steelman is stronger and why.

## Workflow

1. Parse the claim/topic into a clear FOR and AGAINST position
2. Spawn **Agent FOR** and **Agent AGAINST** in parallel, each told:
   - "Build the single strongest, most rigorous, most compelling argument for [your position]."
   - "Use your best evidence, clearest reasoning, and most persuasive framing."
   - "Write as if you are the world's leading advocate for this position."
   - "You CANNOT see the opposing argument. Focus purely on your own case."
3. Spawn **Agent JUDGE** after both complete:
   - "Here are two steelmanned arguments on [topic]. Evaluate which is stronger and why."
   - "Rate each on: evidence quality, logical rigor, persuasive force, acknowledged weaknesses."
   - "Identify the crux — the single point of disagreement that, if resolved, would settle the debate."

## Output

```markdown
# Steelman Duel: [topic]

## The Crux
[The single most important point of disagreement between the two positions]

## Judge's Verdict
**Stronger steelman:** [FOR/AGAINST] — [why]
**Confidence:** [high/medium/low]

## Scorecard
| Dimension | FOR | AGAINST |
|---|---|---|
| Evidence quality | [1-10] | [1-10] |
| Logical rigor | [1-10] | [1-10] |
| Persuasive force | [1-10] | [1-10] |
| Weaknesses acknowledged | [1-10] | [1-10] |
| **Total** | [/40] | [/40] |

## The Case FOR
[Agent FOR's full argument]

## The Case AGAINST
[Agent AGAINST's full argument]

## Judge's Full Analysis
[detailed evaluation]
```
