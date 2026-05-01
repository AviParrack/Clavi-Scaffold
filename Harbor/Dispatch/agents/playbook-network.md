# Build Network — Claude's Active Playbook

*Running context for Claude instances working on expanding Avi's network. Read [Bridge/Avi/Network.md](../Avi/Network.md) first for the current state.*

*Last updated: 2026-04-09*

---

## Mission

Help Avi build a network that matches the ambition of his work. He's a Stanford physics PhD, visiting scholar at Forethought, president of Stanford EA, working on space expansion, AI governance, and macrostrategy. His network should reflect that scope — not just EA, not just academia, but the full coalition of people building toward good futures.

## Strategy

### 1. Identify high-value connections

**Who matters most right now** (based on active projects + network gaps):

**Space policy (biggest gap):**
- US Space Command / Space Force leadership
- NASA Artemis program leads
- Commercial space founders (Relativity, Rocket Lab, Astroscale)
- Space policy think tanks (CSIS Aerospace, Secure World Foundation, Aerospace Corp)
- Congressional staffers on space committees

**AI governance:**
- Google DeepMind safety/policy team
- OpenAI policy team
- Meta FAIR researchers working on safety
- NIST AI Safety Institute contacts
- UK AI Safety Institute (DSIT)

**Progress Studies / Abundance:**
- Institute for Progress team
- Abundance movement organizers
- YIMBY leaders (especially policy-oriented ones)

**Academic:**
- Physicists working on space expansion (not just Sandberg)
- Economists working on long-term growth (Robin Hanson, Tyler Cowen proximity)
- Political scientists working on democratic resilience

### 2. Craft connection strategies

**Warm introductions (best):**
- Map who in Avi's existing network knows the target
- Forethought team has broad reach — ask Fin, Will, Stefan for specific intros
- Stanford EA network is underutilized for professional connections

**Cold outreach via shared work (good):**
- Find a genuine research intersection
- Draft a short, specific email: "I'm working on X, which connects to your work on Y. Would you have 20 minutes to discuss Z?"
- Attach a relevant piece of Avi's research (SDC paper, IE bottleneck synthesis)
- Keep it under 150 words. Respect their time.

**Conference networking (good):**
- Pre-identify 5-10 people to meet at each event
- Prepare a one-liner on each active project
- Follow up within 48 hours with a specific reference to the conversation

**Content-based (slow but durable):**
- Publishing on EA Forum, arXiv, personal blog builds inbound connections
- Twitter accounts (when live) create ambient awareness
- "Some Case for Space" on EA Forum is the first move here

### 3. Maintain relationships

- Track last-contact dates in Network.md
- Surface "haven't talked to X in 3 months" prompts
- Send relevant research when we publish something they'd care about
- Remember personal details (congrats on papers, milestones, etc.)

---

## How Network Proposals Flow

Same inbox gate as everything else. Claude identifies targets, drafts approaches, deposits in `Lab/inbox/` with `source: network-building`. Avi reviews before anything goes out.

```yaml
---
source: network-building
date: 2026-04-09
status: pending
tier: null
target_person: [name]
target_org: [org]
connection_type: cold-email | warm-intro | conference-meeting
---

## Why connect
[1-2 sentences on strategic value]

## Approach
[warm intro via X / cold email about Y / meet at Z conference]

## Draft outreach
[actual email/message, ready to send if approved]

## Relevant work to share
[which of Avi's research would resonate with this person]
```

---

## Active Networking Tasks

| Task | Target | Status | Notes |
|---|---|---|---|
| **Reach out to Sandberg** | Anders Sandberg | 🟡 Next step | Scope Destroy-All-Stars co-authorship |
| **Post "Some Case for Space" to EA Forum** | EA community broadly | 🟡 Draft exists | First public-facing piece; generates inbound |
| **Build US space policy contacts** | 20 embedded people | ⚪ Not started | Per FUTURE-DIRECTIONS.md Tier 1 priority |
| **Engage NatSec community** | Defense/intelligence | ⚪ Not started | Learn the language; read US Defense Space Strategy |

---

## Cold Email Templates

### Research collaboration
```
Subject: [Specific topic] — connection to your work on [their topic]

Hi [Name],

I'm Avi Parrack, a physics PhD student at Stanford working on [specific project] at Forethought (Will MacAskill's macrostrategy org). 

Your work on [specific paper/project] connects directly to something I'm modeling — [one sentence on the connection]. I think there's an interesting overlap on [specific question].

Would you have 20 minutes in the next couple weeks to discuss? Happy to share our research notes in advance.

Best,
Avi
```

### Conference follow-up
```
Subject: Great meeting you at [event] — [specific topic]

Hi [Name],

Really enjoyed our conversation about [specific thing discussed] at [event]. 

As promised, here's [the thing you said you'd send]. I'd love to continue the conversation — particularly on [specific next question].

Would a 30-minute call in the next few weeks work?

Best,
Avi
```

---

## Periodic Actions (for scheduled agents)

**Weekly:**
- Scan Avi's calendar for upcoming meetings → prep notes on who he's meeting
- Check if any network contacts published new work relevant to Avi's projects

**Monthly:**
- Review Network.md for stale connections (no contact in 3+ months)
- Surface 2-3 cold outreach targets based on current project priorities
- Check conference CFP deadlines

---

*This file is for Claude's use across sessions. Update it when network actions are taken or new strategies emerge.*
