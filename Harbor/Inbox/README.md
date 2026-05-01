# Inbox

Landing zone for research output, brainstorms, and captures pending triage.

**Nothing here is integrated.** Items sit here until Avi reviews and assigns a tier (S/A/B/C/D/F) via `/triage`. After triage, items are either promoted to the right project folder, archived, or rejected.

## How items arrive

- Research sprints (`/research-sprint`) deposit output here
- Manual drops — anything Avi or Claude wants to process later
- Agent-generated proposals (connection maps, reweave suggestions)

## File naming convention

```
YYYY-MM-DD-short-description.md
```

Each file should have frontmatter:

```yaml
---
source: research-sprint | manual | agent-proposal
date: 2026-04-08
status: pending | triaged | promoted | archived | rejected
tier: null  # assigned during triage: S/A/B/C/D/F
related_projects: []
---
```

## Triage ratings

| Tier | Meaning | What happens |
|---|---|---|
| **S** | Shattering — changes priors, must propagate | Full reweave. Avi reviews each proposed update. May update PREMISES.md. |
| **A** | Significant — important finding | Targeted integration into relevant projects. Avi spot-checks. |
| **B** | Good — worth keeping and referencing | Promote to project folder. Update handoffs. No reweave. |
| **C** | Context — useful background | Archive with tags. Discoverable but passive. |
| **D** | Low value — not wrong, just not useful | Archive minimally. |
| **F** | Reject — wrong premises, bad analysis | Archive with rejection note. Prevents re-surfacing. |
