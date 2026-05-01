---
name: blind-review
description: "Strip identifying information from a document before evaluating it, then compare blinded vs unblinded assessments to detect prestige bias. Use when the user says 'blind review', 'remove bias', 'evaluate without knowing who wrote it', or '/blind-review'."
argument-hint: "[document path]"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Blind Review

Simulates double-blind peer review. Strips all identifying information from a document, evaluates it blindly, then compares with an unblinded evaluation to detect prestige bias.

## Workflow

1. **Strip:** Remove author names, institution names, grant numbers, self-citations, acknowledgments, any identifying metadata. Replace with [AUTHOR], [INSTITUTION], etc.
2. **Blind evaluation:** Subagent reads ONLY the stripped document. Evaluates: quality of argument, evidence, methodology, clarity, novelty. Rates 1-10 on each dimension.
3. **Unblinded evaluation:** Separate subagent reads the ORIGINAL document with all identifying info intact. Same evaluation dimensions.
4. **Compare:** Did knowing the author/institution change the ratings? By how much? In which direction?

## Output

```markdown
# Blind Review: [document]

## Bias Detection
**Prestige bias detected?** [Yes/No]
**Rating shift:** [blinded score] → [unblinded score] (Δ = [difference])
**Direction:** [inflated by prestige / deflated by prestige / no change]

## Comparison
| Dimension | Blind rating | Unblind rating | Δ | Bias? |
|---|---|---|---|---|
| Argument quality | [1-10] | [1-10] | [+/-] | [yes/no] |
| Evidence | [1-10] | [1-10] | [+/-] | [yes/no] |
| Methodology | [1-10] | [1-10] | [+/-] | [yes/no] |
| Clarity | [1-10] | [1-10] | [+/-] | [yes/no] |
| Novelty | [1-10] | [1-10] | [+/-] | [yes/no] |

## Blind Evaluation (full)
[the blinded agent's complete assessment]

## Unblinded Evaluation (full)
[the unblinded agent's complete assessment]

## What Identifying Info Was Found and Stripped
[list everything that was removed]
```
