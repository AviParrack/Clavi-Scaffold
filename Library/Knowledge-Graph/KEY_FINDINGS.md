# KEY FINDINGS

*Canonical S/A-tier claims. Load-bearing beliefs that have passed the Gold or A tier gate via `/triage`. These are referenced across the system — research builds on them, analysis cites them.*

*This file starts empty. Your first Gold-tier triage will populate it.*

---

## How findings get here

Findings reach this file via the `/triage` pipeline:

1. Research deposits in `Harbor/Inbox/`
2. `/triage` analyzes premise alignment + connection map
3. The user assigns a tier (🥇 Gold / 🟢 Green / 🟡 Yellow / 🔴 Red)
4. **🥇 Gold** items update PREMISES.md AND get a KEY_FINDINGS entry AND get a wiki page
5. **🟢 Green** items get a wiki page; KEY_FINDINGS entry only if significant

Once a finding is here, it's treated as canonical until explicitly retired.

## Findings

*(empty — your first /triage Gold or A tier promotion populates this)*

### Format for entries

```markdown
## [YYYY-MM-DD] [Topic title]

**Tier:** S | A
**Source:** [path to source file in Library/Knowledge-Graph/wiki/ or Workshop project]
**Affects premises:** [which PREMISES.md commitments this strengthens or revises]
**Confidence:** high | medium | uncertain-but-load-bearing

**Claim:** [The finding itself, in 1-2 sentences.]

**Why load-bearing:** [What this finding now lets you assume in downstream analysis.]

**Connections:** [Links to related wiki pages and Workshop projects this finding feeds.]
```

---

## Retired findings

*(when a finding turns out to be wrong, move it here with a note explaining what changed)*
