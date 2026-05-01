---
name: adversarial-prompt
description: "Red team a claim or document from 5 angles simultaneously. Use when the user says 'red team this', 'adversarial check', 'attack this argument', 'find the weaknesses', or '/adversarial-prompt'. Spawns 5 parallel agents each trying to break the argument from a different angle."
argument-hint: "[claim, argument, or document path]"
metadata:
  author: the user & Claude
  version: 0.1.0
---

# Adversarial Prompt

Red team a claim, argument, or document by attacking it from 5 independent angles simultaneously. Each angle is a fresh agent that can't see the others' work.

## The 5 Angles

Spawn 5 subagents in parallel, each with a different attack vector:

| # | Angle | Agent prompt |
|---|---|---|
| 1 | **Empirical** | "Find specific data, studies, or real-world examples that contradict or complicate this claim. Be concrete — cite numbers, dates, sources. Don't argue abstractly, find evidence." |
| 2 | **Logical** | "Find logical flaws, non-sequiturs, circular reasoning, false dichotomies, or unstated syllogisms in this argument. Be precise about which step in the reasoning fails and why." |
| 3 | **Methodological** | "Attack the methodology. How was this conclusion reached? What's the sample size, selection bias, confounders, measurement error, p-hacking risk, replication status? If this is theoretical, attack the model assumptions." |
| 4 | **Historical** | "Find historical analogies where similar reasoning or similar claims turned out to be wrong. What happened when people believed X before? What's the base rate of claims like this being correct?" |
| 5 | **Steelman opposition** | "Construct the single strongest possible argument AGAINST this claim, as if you were the world's best advocate for the opposing position. Use your strongest evidence, most rigorous reasoning, and most compelling framing." |

Each agent receives the full claim/document plus their angle-specific instructions. They work independently.

## Output

```markdown
# Adversarial Audit: [claim summary]

## Verdict
**Survives adversarial pressure?** [Yes — robust / Partially — weaknesses found / No — critical flaws]
**Weakest flank:** [which angle found the most damaging critique]

## Summary Table
| Angle | Finding severity | Key finding |
|---|---|---|
| Empirical | [none/minor/major/fatal] | [one-line] |
| Logical | [none/minor/major/fatal] | [one-line] |
| Methodological | [none/minor/major/fatal] | [one-line] |
| Historical | [none/minor/major/fatal] | [one-line] |
| Steelman opposition | [none/minor/major/fatal] | [one-line] |

## Detailed Reports
[each agent's full analysis]
```
