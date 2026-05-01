---
name: premise-audit
description: "Surface every hidden assumption in an argument and rate how load-bearing each is. Use when the user says 'what am I assuming', 'premise audit', 'hidden assumptions', 'check my assumptions', or '/premise-audit'. Finds the invisible scaffolding under any argument."
argument-hint: "[argument, claim, or document path]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Premise Audit

Find every implicit assumption in an argument or document. For each, rate how likely it is to be true, how much the conclusion depends on it, and what happens if it's wrong.

## Workflow

1. Read the input carefully
2. List every explicit premise (stated assumptions)
3. List every IMPLICIT premise (unstated assumptions the argument requires)
4. For each premise, assess three dimensions
5. Identify the most load-bearing assumptions
6. Flag any premises that conflict with PREMISES.md (if in scaffold context)

## Output

```markdown
# Premise Audit: [argument summary]

## Most Load-Bearing Assumptions (top 5)

| # | Assumption | P(true) | Dependence | If wrong? |
|---|---|---|---|---|
| 1 | [assumption] | [0-100%] | [critical/high/medium/low] | [what breaks] |
| 2 | ... | | | |

## Full Premise List

### Explicit Premises (stated)
| # | Premise | P(true) | Dependence | Notes |
|---|---|---|---|---|
| E1 | [stated assumption] | [%] | [level] | [any issues] |

### Implicit Premises (unstated)
| # | Premise | P(true) | Dependence | If wrong? |
|---|---|---|---|---|
| I1 | [hidden assumption] | [%] | [level] | [consequence] |

## Risk Matrix
**High dependence + low P(true) = danger zone:**
[list any premises in this quadrant — these are the argument's Achilles heels]

## Recommendations
[which assumptions should be investigated, stated explicitly, or hedged against]
```

## Notes
- The implicit premises are the valuable output. Anyone can list what's stated. The skill is finding what's NOT stated.
- "Dependence" means: if this premise is false, does the conclusion still hold? Critical = conclusion collapses. Low = conclusion is slightly weakened.
- P(true) is the auditor's calibrated estimate, not a literature review. Flag low-confidence estimates.
