# Inbox

Landing zone for research output, brainstorms, and captures pending triage.

**Nothing here is integrated.** Items sit here until you review them and assign a tier (🥇 Gold / 🟢 Green / 🟡 Yellow / 🔴 Red) via `/triage`. After triage, items are either promoted to permanent knowledge, parked for later, or discarded.

## How items arrive

- Research sprints (`/research-sprint`) deposit output here
- Manual drops — anything you or Claude wants to process later
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
tier: null  # assigned during triage: gold / green / yellow / red
related_projects: []
---
```

## Triage tiers

| Tier | Meaning | What happens |
|---|---|---|
| 🥇 **Gold** | Core knowledge — changes priors, must propagate | Updates `PREMISES.md` + `KEY_FINDINGS.md` + creates wiki page + reweaves connected files. You review each proposed update. |
| 🟢 **Green** | Solid — worth compiling into knowledge | Creates a wiki page + cross-references. Optional `KEY_FINDINGS.md` entry. Links into relevant Workshop projects. |
| 🟡 **Yellow** | Interesting but not now | Moves to `Library/Someday/` with topic tags. Discoverable but passive. |
| 🔴 **Red** | Discard | Delete (git preserves history) with a rejection note in the commit message. |

Default to Yellow when uncertain. It's cheap to promote later; expensive to undo a bad Gold integration.
