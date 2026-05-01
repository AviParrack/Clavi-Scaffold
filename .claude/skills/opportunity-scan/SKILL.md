---
name: opportunity-scan
description: "Scout conferences, speaking events, fellowships, grants, and publication opportunities for the user. Use when the user says 'find opportunities', 'scan for conferences', 'what should I apply to', 'opportunity scan', or '/opportunity-scan'."
---

# Opportunity Scanner

You are scouting opportunities for the user. Read User.md to know who they are, their fields of work, and what kind of opportunities (conferences, fellowships, grants, speaking events, publication venues) would be valuable.

## Before anything else

1. Read `Town-Hall/User/User.md` — who the user is, interests, active projects
2. Read `Harbor/Dispatch/agents/playbook-opportunities.md` — search strategies and surfacing format
3. Read `Library/Knowledge-Graph/PREMISES.md` — the user's worldview (filters what's relevant)
4. Read `Harbor/Dispatch/scout-calibration.md` — **critical**: learned preferences from past ratings. Use the "Emerging rules" and "What the user gets excited about / skips" sections to filter and rank. This is how the system learns. Empty in a fresh scaffold; accrues over time.

## Workflow

### Phase 1: Scan

Run web searches across these domains (adjust based on what the user asks for, or run all if general scan):

**Conferences & Speaking:**
- "space governance conference 2026 2027 call for papers"
- "AI safety governance conference CFP"
- "effective altruism conference 2026 2027"
- "IAC international astronautical congress abstract deadline"
- "longtermism existential risk conference speaker"
- "progress studies abundance conference"

**Fellowships & Positions:**
- "AI governance research fellowship 2026 2027"
- "GovAI fellowship application"
- "space policy fellowship CSIS RAND Brookings"
- "Schmidt Futures fellowship"
- "Open Philanthropy early career researcher grant"

**Publications:**
- Check the user's field-relevant forums and discussion venues
- Check if any journals have special issues on space governance, AI policy, x-risk
- Monitor for op-ed windows when relevant news breaks

**Podcasts & Media:**
- Look for podcast guest application forms or booking contacts
- Check if any relevant podcasts have recently covered adjacent topics (warm pitch angle)

### Phase 2: Filter

For each opportunity found, score against the user's evaluation framework:

| Factor | Weight | Question |
|---|---|---|
| Audience fit | 30% | Does this reach people who can act on the user's ideas? |
| Network building | 25% | Does this create relationships, not just broadcast? |
| Timing | 20% | Is this the right time given current projects? |
| Prestige / leverage | 15% | Does this open doors? |
| Effort | 10% | Is the ROI worth it? |

Drop anything scoring below ★★☆☆☆ unless it has unusual strategic value.

### Phase 3: Deposit in inbox

For each opportunity worth surfacing, create a file in `Harbor/Inbox/`:

```yaml
---
source: opportunity-scan
date: [YYYY-MM-DD]
status: pending
tier: null
opportunity_type: conference | publication | fellowship | grant | speaking | podcast
deadline: [YYYY-MM-DD or "rolling" or "none"]
---

## [Opportunity name]

**Type:** [type]
**Deadline:** [date]
**Fit score:** [★ rating]

**Why this matters:** [1-2 sentences on why the user specifically should care]
**What it would take:** [time/effort estimate]
**Network value:** [who the user would meet]

**Recommendation:** Apply / Skip / Bookmark
**Source URL:** [link]
```

### Phase 4: Summary

Present all findings to the user in a scannable table:

| Opportunity | Type | Deadline | Fit | Recommendation |
|---|---|---|---|---|

Lead with the strongest recommendations. Don't bury the good ones in noise.

## Key principles

- **the user is bandwidth-constrained.** Surface 3-7 high-quality finds, not 20 mediocre ones.
- **Network value > prestige.** A small workshop where the user meets 5 right people beats a keynote at a big conference with no follow-up.
- **Timing matters.** Don't surface things with deadlines that already passed or are tomorrow.
- **Connect to active work.** The best opportunities let the user present research they've already done — read the user's active projects from CLAUDE.md and User.md before scanning.
