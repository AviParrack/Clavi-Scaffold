---
name: consensus-check
description: "Deeply investigate a single claim by independently searching for evidence FOR and AGAINST, then synthesize. Use when the user says 'is this actually true', 'consensus check', 'what does the evidence say', 'verify this claim deeply', or '/consensus-check'."
argument-hint: "[factual claim to investigate]"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Consensus Check

Takes a single claim and maps the full landscape of evidence and expert opinion around it. Two agents independently search for evidence — one FOR, one AGAINST — then a synthesis agent evaluates the evidence quality and identifies the consensus position.

**Key difference from /fact-check:** fact-check verifies many claims in a document quickly. consensus-check deeply investigates ONE claim and maps everything around it.

## Workflow

1. Spawn **Agent FOR** (with web search): "Find the strongest evidence SUPPORTING this claim. Cite specific studies, data, expert opinions. Rate each piece of evidence for quality."
2. Spawn **Agent AGAINST** (with web search): "Find the strongest evidence CONTRADICTING this claim. Cite specific studies, data, expert opinions. Rate each piece of evidence for quality."
3. Both run in parallel, independently.
4. Spawn **Synthesis agent**: reads both reports, evaluates evidence quality, identifies the consensus.

## Output

```markdown
# Consensus Check: [claim]

## Verdict
**Expert consensus:** [strong for / lean for / genuinely contested / lean against / strong against]
**Evidence quality:** [robust / moderate / weak / insufficient]
**Confidence in verdict:** [high/medium/low]

## Evidence Landscape
| Direction | Strong evidence | Moderate | Weak | Total |
|---|---|---|---|---|
| FOR | [N] | [N] | [N] | [N] |
| AGAINST | [N] | [N] | [N] | [N] |

## Key Evidence FOR
[each piece with source, quality rating, and why it matters]

## Key Evidence AGAINST
[each piece with source, quality rating, and why it matters]

## Synthesis
[Where does the weight of evidence actually fall? What's the quality gradient?
Is this a case where evidence is strong on both sides (genuine uncertainty)
or where one side has much better evidence?]
```
