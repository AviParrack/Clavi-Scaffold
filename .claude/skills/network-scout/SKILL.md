---
name: network-scout
description: "Identify high-value people for Avi to connect with, find warm intro paths, draft outreach. Use when the user says 'find people to connect with', 'who should I reach out to', 'network scout', 'build network', or '/network-scout'."
---

# Network Scout

You are helping Avi Parrack build a network that matches the ambition of his work. He's a Stanford physics PhD, visiting scholar at Forethought, president of Stanford EA, working on space expansion, AI governance, and macrostrategy. His network should reflect that scope.

## Before anything else

1. Read `Town-Hall/User/Avi.md` — who Avi is, interests, active projects
2. Read `Crossroads/Network.md` — current contacts, relationship tiers, network gaps
3. Read `Harbor/Dispatch/agents/playbook-network.md` — strategies, templates, active tasks
4. Read `Library/Knowledge-Graph/PREMISES.md` — Avi's worldview (shapes who's a good fit)
5. Read `Harbor/opportunities.md` — active projects (shapes what to pitch)
6. Read `Harbor/Dispatch/scout-calibration.md` — **critical**: learned preferences from Avi's past ratings. Use "Emerging rules" and patterns to prioritize targets Avi would actually want to connect with.

## Workflow

### Phase 1: Identify targets

Based on Avi's current **network gaps** (from Network.md) and **active projects**, identify 3-5 high-value people to connect with. For each:

**Search for:**
- Researchers publishing in Avi's domains (space governance, IE, compute scaling, AI safety)
- People who recently spoke at target conferences (IAC, EA Global, GovAI)
- Authors Avi cites or whose work intersects his
- Founders/leaders at orgs in Avi's network gap areas
- People who've engaged with Forethought's work or EA Forum posts

**Evaluate each target:**

| Factor | Question |
|---|---|
| **Strategic value** | Does knowing this person unlock a network gap or advance a project? |
| **Mutual benefit** | What does Avi offer them? (Research, Stanford connection, Forethought platform) |
| **Reachability** | Is there a warm intro path? Is a cold email likely to land? |
| **Timing** | Is there a reason to reach out *now*? (New paper, upcoming conference, shared interest) |

### Phase 2: Find connection paths

For each target, determine the best approach:

**Warm intro (preferred):**
- Check Network.md for anyone who knows the target
- Forethought team has broad reach — Fin, Will, Stefan for space/governance; Linch, Tamera for AI safety
- Stanford network (professors, alumni, EA chapter)
- Conference overlap (were they at the same event?)

**Cold email (good if well-crafted):**
- Find a genuine research intersection
- Identify which of Avi's work would resonate with them specifically
- Draft a short (under 150 words), specific email

**Conference meeting (plan ahead):**
- If target will be at a conference Avi's attending, flag for pre-meeting

**Content-based (slow but durable):**
- If Avi publishes something relevant to their work, share it directly

### Phase 3: Draft outreach

For each recommended connection, draft the actual message. Use templates from playbook-network.md but customize heavily:

```
Subject: [Specific topic] — connection to your work on [their specific paper/project]

Hi [Name],

I'm Avi Parrack, a physics PhD student at Stanford working on [specific project]
at Forethought (Will MacAskill's macrostrategy org).

[One sentence on the genuine intersection between their work and Avi's.]
[One sentence on what Avi would specifically want to discuss.]

Would you have 20 minutes in the next couple weeks? Happy to share
[specific piece of Avi's work] in advance.

Best,
Avi
```

**Rules for outreach drafts:**
- Under 150 words. Respect their time.
- Reference their specific work, not generic flattery.
- Offer something concrete (share research, discuss specific question).
- Make the ask small (20 minutes, not "let's collaborate").
- Match Avi's voice — warm, direct, no corporate speak.

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

[The actual email or message, ready to send if Avi approves]

## Relevant work to share

- [Specific paper/research of Avi's that would resonate]
- [Why it connects to their work]
```

🚩 **No outreach goes out without Avi's explicit approval.** This skill proposes; Avi decides.

### Phase 5: Summary

Present findings in a scannable table:

| Target | Org | Why | Approach | Draft ready? |
|---|---|---|---|---|

Lead with the highest-value connections. Flag any that are time-sensitive (e.g., upcoming conference).

## Key principles

- **Quality over quantity.** 3 well-researched targets beat 10 spray-and-pray.
- **Mutual benefit is mandatory.** Avi has real things to offer — Stanford platform, Forethought research, original analysis. Lead with that, not asks.
- **Warm > cold, always.** Check every intro path before defaulting to cold email.
- **Specificity is everything.** "I admire your work" is spam. "Your analysis of LEV timelines in [paper] connects directly to our dictator lock-in research" is a conversation.
- **Avi's voice, not Claude's.** Drafts should sound like Avi — warm, direct, unpretentious, genuinely curious.
