---
name: network-scout
description: "Identify high-value people for the user to connect with, find warm intro paths, draft outreach. Use when the user says 'find people to connect with', 'who should I reach out to', 'network scout', 'build network', or '/network-scout'."
---

# Network Scout

You are helping the user build a network that matches the ambition of their work. Read User.md to know who they are, their fields of interest, and what kind of connections would be valuable.

## Before anything else

1. Read `Town-Hall/User/User.md` — who the user is, interests, active projects, networking gaps
2. Read `Crossroads/Network.md` (if populated) — current contacts and relationship tiers
3. Read `Harbor/Dispatch/agents/playbook-network.md` — strategies, templates, active patterns
4. Read `Library/Knowledge-Graph/PREMISES.md` — the user's worldview (shapes who's a good fit)
5. Read `Harbor/Dispatch/scout-calibration.md` — **critical**: learned preferences from the user's past ratings. Use "Emerging rules" and patterns to prioritize targets the user would actually want to connect with. Empty in a fresh scaffold; accrues over time.

## Workflow

### Phase 1: Identify targets

Based on the user's current **network gaps** (from Network.md) and **active projects**, identify 3-5 high-value people to connect with. For each:

**Search for:**
- Researchers publishing in the user's domains (space governance, IE, compute scaling, AI safety)
- People who recently spoke at target conferences (IAC, EA Global, GovAI)
- Authors the user cites or whose work intersects his
- Founders/leaders at orgs in the user's network gap areas
- People in the user's field with shared interests or relevant collaborations

**Evaluate each target:**

| Factor | Question |
|---|---|
| **Strategic value** | Does knowing this person unlock a network gap or advance a project? |
| **Mutual benefit** | What does the user offer them? (see User.md for what the user offers — research, platform, expertise) |
| **Reachability** | Is there a warm intro path? Is a cold email likely to land? |
| **Timing** | Is there a reason to reach out *now*? (New paper, upcoming conference, shared interest) |

### Phase 2: Find connection paths

For each target, determine the best approach:

**Warm intro (preferred):**
- Check Network.md for anyone who knows the target
- If the user is part of an organization, that org's network is often a useful warm-intro path
- the user's institutional network (colleagues, alumni, professional groups)
- Conference overlap (were they at the same event?)

**Cold email (good if well-crafted):**
- Find a genuine research intersection
- Identify which of the user's work would resonate with them specifically
- Draft a short (under 150 words), specific email

**Conference meeting (plan ahead):**
- If target will be at a conference the user's attending, flag for pre-meeting

**Content-based (slow but durable):**
- If the user publishes something relevant to their work, share it directly

### Phase 3: Draft outreach

For each recommended connection, draft the actual message. Use templates from playbook-network.md but customize heavily:

```
Subject: [Specific topic] — connection to your work on [their specific paper/project]

Hi [Name],

I'm [the user, with relevant context], working on [specific project]
in the user's organization.

[One sentence on the genuine intersection between their work and the user's.]
[One sentence on what the user would specifically want to discuss.]

Would you have 20 minutes in the next couple weeks? Happy to share
[specific piece of the user's work] in advance.

Best,
the user
```

**Rules for outreach drafts:**
- Under 150 words. Respect their time.
- Reference their specific work, not generic flattery.
- Offer something concrete (share research, discuss specific question).
- Make the ask small (20 minutes, not "let's collaborate").
- Match the user's voice — warm, direct, no corporate speak.

### Phase 4: Deposit in inbox

For each networking proposal, create a file in `Harbor/Inbox/`:

```yaml
---
source: network-building
date: [YYYY-MM-DD]
status: pending
tier: null
target_person: [name]
target_org: [org]
connection_type: cold-email | warm-intro | conference-meeting
---

## Why connect with [Name]

[2-3 sentences on strategic value + mutual benefit]

## Approach

[Warm intro via X / Cold email / Meet at Y conference]
[If warm intro: who to ask, and what to say to the introducer]

## Draft outreach

[The actual email or message, ready to send if the user approves]

## Relevant work to share

- [Specific paper/research of the user's that would resonate]
- [Why it connects to their work]
```

🚩 **No outreach goes out without the user's explicit approval.** This skill proposes; the user decides.

### Phase 5: Summary

Present findings in a scannable table:

| Target | Org | Why | Approach | Draft ready? |
|---|---|---|---|---|

Lead with the highest-value connections. Flag any that are time-sensitive (e.g., upcoming conference).

## Key principles

- **Quality over quantity.** 3 well-researched targets beat 10 spray-and-pray.
- **Mutual benefit is mandatory.** the user has real things to offer — the user's actual offerings (see User.md). Lead with that, not asks.
- **Warm > cold, always.** Check every intro path before defaulting to cold email.
- **Specificity is everything.** "I admire your work" is spam. "Your analysis of LEV timelines in [paper] connects directly to our dictator lock-in research" is a conversation.
- **the user's voice, not Claude's.** Drafts should sound like the user — warm, direct, unpretentious, genuinely curious.
