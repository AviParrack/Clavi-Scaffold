# Get Opportunities — Claude's Active Playbook

*Running context for Claude instances scouting conferences, speaking events, publications, grants, and other opportunities for Avi. Read [Bridge/Avi/Opportunities.md](../Avi/Opportunities.md) first for current state.*

*Last updated: 2026-04-09*

---

## Mission

Proactively surface opportunities that match Avi's work and ambitions. He won't find these himself — he's bandwidth-constrained and focused on the work. Claude's job is to be the scout: find the right conferences, the right journals, the right fellowships, the right people to cold-email, and present them in a way that makes it easy for Avi to say yes or no.

## What to look for

### 🎤 Conferences & Speaking

**Search queries to run periodically:**
- "space governance conference 2026 2027 CFP"
- "AI safety governance conference call for papers"
- "effective altruism conference 2026"
- "longtermism conference speaker applications"
- "space policy summit 2026"
- "IAC 2026 abstract submission"
- "COSPAR 2026 2027"
- "science and technology policy conference"
- "progress studies conference"
- "existential risk conference"

**Filters:**
- Audience: policy-makers, researchers, founders — not purely academic
- Geography: US/UK/Europe preferred (Avi is between Stanford and London)
- Timing: 2+ months out (needs prep time)
- Size: 100-2000 attendees sweet spot (big enough to matter, small enough to network)

**What makes a great conference for Avi:**
- He can present original research (SDC, IE bottlenecks, Dyson strategy)
- The audience includes people from the Network.md gap list
- It leads to follow-up relationships, not just a talk
- Travel is justified by density of relevant people

### 📝 Publication Opportunities

**Monitor for:**
- EA Forum trending topics that Avi's research speaks to
- Special issues of journals on space governance, AI policy, x-risk
- Blog/substack invitations from relevant communities
- Op-ed opportunities in mainstream outlets when space/AI news breaks
- Forethought publication calendar (coordinate with Fin/Will)

**Avi's publication-ready or near-ready work:**
1. "Some Case for Space" — EA Forum (draft exists, needs final review)
2. SDC paper — Forethought (final review)
3. Destroy-All-Stars — physics journal (draft v2, pending Sandberg)
4. Compute-Through-Cosmic-Time — Forethought blog (Workshop/Space/Papers/)
5. Industrial Explosion companion — Forethought blog (Workshop/Space/Papers/)
6. The Persuasion Machine — standalone report (Lab/Governance/)
7. Immortal Dictator Problem — Forethought post (Lab/Governance/)

### 🤝 Fellowships & Positions

**Monitor for:**
- GovAI fellowship cycles
- Open Philanthropy early-career researcher grants
- Schmidt Futures fellowship openings
- RAND / Brookings visiting researcher programs
- CSIS technology policy fellowship
- Any new AI governance research positions

### 💡 Unique Opportunities

**Things that don't fit categories but Avi should know about:**
- Podcast invitations (80,000 Hours, Future of Life, Forethought podcast)
- Workshop invitations from orgs like Aspen, Santa Fe Institute, Simons Foundation
- Advisory board positions at space/AI startups
- Teaching opportunities (guest lectures at other universities)
- Media requests when AI/space news breaks

---

## How Opportunities Flow Through the System

```
Claude scouts              Lab/inbox/                  Avi reviews
     │                         │                           │
     ▼                         ▼                           ▼
┌──────────────┐      ┌────────────────┐         ┌──────────────┐
│ Web searches │      │ source:        │         │ Apply / Skip │
│ CFP monitors │─────►│  opportunity   │────────►│ / Bookmark   │
│ Network scan │      │ status: pending│         │              │
│ EA Forum     │      │                │         │ If apply:    │
│ Twitter/X    │      │ frontmatter +  │         │ update       │
└──────────────┘      │ structured     │         │ Opportunities│
                      │ proposal       │         │ .md          │
                      └────────────────┘         └──────────────┘
```

**Same inbox gate as research.** Opportunities land in `Lab/inbox/` with proper frontmatter. Avi triages them alongside research — or we can batch-present them in a dedicated session.

**What an opportunity proposal looks like in the inbox:**

```yaml
---
source: opportunity-scan
date: 2026-04-09
status: pending
tier: null
opportunity_type: conference | publication | fellowship | grant | speaking | other
deadline: YYYY-MM-DD or "rolling" or "none"
---

## [Opportunity name]

**Type:** Conference / Publication / Fellowship / Other
**Deadline:** [date]
**Fit score:** ★★★★☆ (based on evaluation framework in Opportunities.md)

**Why this matters:** [1-2 sentences on why Avi specifically should care]
**What it would take:** [time/effort estimate]
**Network value:** [who Avi would meet or connect with]

**Recommendation:** Apply / Skip / Bookmark for later
```

Keep it scannable. Avi processes these in batch — don't bury the recommendation.

---

## Periodic Actions (for scheduled agents)

**Weekly:**
- Web search for new CFPs in target domains
- Check EA Forum for trending topics that match Avi's research
- Scan Twitter/X for conference announcements from people in Network.md

**Monthly:**
- Comprehensive conference scan for next 6 months
- Check fellowship/grant deadlines
- Review Opportunities.md and mark expired items
- Surface 2-3 proactive pitches (places Avi could cold-submit to speak)

**Quarterly:**
- Full landscape scan of publication venues
- Review which opportunities were taken vs. skipped and why (calibrate recommendations)
- Update evaluation framework weights if priorities have shifted

---

## Search Infrastructure

**When autonomous operation is live**, these are the scheduled tasks:

```
Daily:   Scan EA Forum + Twitter for time-sensitive opportunities
Weekly:  Conference CFP search + network monitoring
Monthly: Full opportunity landscape scan + cold pitch generation
```

Until then, Claude runs these searches when Avi asks or when a session naturally touches on networking/opportunities.

---

*This file is for Claude's use across sessions. Update when opportunities are found, pitched, accepted, or expired.*
