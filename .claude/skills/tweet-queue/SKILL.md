---
name: tweet-queue
description: "Generate the daily Twitter queue for Avi's personal account and/or the Parker pseudonymous account. Use this skill when the user asks to 'generate tweets', 'tweet queue', 'what should I tweet', 'Twitter queue', 'morning tweets', or says '/tweet-queue'. Produces a daily queue file with original tweets, reply suggestions, and thread ideas for each account. Can also be invoked for a single account: '/tweet-queue avi' or '/tweet-queue parker'."
argument-hint: "[avi|parker|both] [topic]"
metadata:
  author: Avi Parrack
  version: 0.1.0
---

# Tweet Queue

Generates the daily Twitter content queue for one or both accounts. The output is a scannable queue file that Avi can review in under 10 minutes — pick the tweets he likes, copy them to Typefully or post directly, and move on.

**The 10-minute constraint is sacred.** If the queue takes longer than 10 minutes to review, it's too long or too hard to scan. Bold the best picks. Lead with "today's top 3." Make it effortless.

---

## Workflow

### Phase 0: Setup

1. **Determine which accounts.** Default: both. If the user specifies "avi" or "parker," generate for that account only.
2. **Check if today's queue file exists.** If it does, ask: "There's already a queue for today. Append, replace, or skip?"
3. **Check for user context.** Did Avi mention a specific topic, event, or news item? If so, prioritize it. If not, proceed with defaults.
4. **Low-attention detection.** If Avi's message is short/vague, minimize questions. Generate with reasonable defaults and surface assumptions at the top.

---

### Phase 1: Voice Ingestion

**Load identity and voice.** This is mandatory — do not generate tweets without loading these first.

- **Always read first:** `Town-Hall/User/Avi.md` — who Avi is, interests, active projects, communication preferences
- For **Avi's account:** Read `Twitter/accounts/avi/VOICE.md`
- For **Parker's account:** Read `Twitter/accounts/parker/VOICE.md`
- Also read `Twitter/content-sources.md` to know what material is available.

Internalize the voice before writing a single tweet. The most common failure mode is tweets that carry the right idea in the wrong register.

---

### Phase 2: Content Mining

Gather raw material for tweets. Sources, in priority order:

1. **User-provided context.** If Avi mentioned a topic or event, start there.
2. **Web search** (if available). Search for today's AI/space/governance news. Draft timely takes. This is the highest-engagement content.
3. **Recent workspace activity.** Run `git log --oneline -15` to see what Avi's been working on. Fresh research = fresh tweets.
4. **Content sources map.** Read `Twitter/content-sources.md`. Pick 2–3 sources with untapped tweet potential.
5. **Backlog.** Read `Twitter/accounts/[account]/queue/backlog.md` for evergreen tweets ready to deploy.
6. **Posted log.** Skim `Twitter/accounts/[account]/posted/` for the current month to avoid repeating themes.

For **reply suggestions:**
- Read `Twitter/monitoring/watch-accounts.md` for target accounts.
- Web-search recent tweets from 3–5 Tier 1 accounts.
- Draft replies to the most reply-worthy tweets.

---

### Phase 3: Generation

For **each account**, generate:

#### Original Tweets (2–3)
Mix of content types:
- **Factoid/insight** from research — a striking number, a reframe, a physics intuition
- **Take** on current discourse — something happening in AI/space/policy right now
- **Observation** — something Avi noticed, thought about, or found surprising

#### Reply Suggestions (1–2)
- Identify the specific tweet to reply to (include the text or a summary)
- Draft the reply
- Note why this is a good reply opportunity

#### Thread Idea (1 per week, not daily)
- Hook tweet (the one that makes people click)
- 2-sentence outline of the thread
- Estimated length (number of tweets)
- Source material reference

---

### Phase 4: Anti-Pattern Pass

Run every generated tweet through the account-specific anti-patterns:

**Universal checks:**
- [ ] Does it sound like ChatGPT? (Single most important check. Read it aloud. Would a human tweet this?)
- [ ] Is it hedged into meaninglessness? (Commit to the take or cut it.)
- [ ] Would a real person actually post this? (The cringe test.)
- [ ] Is it under 280 characters? (If over, compress — don't just trim.)

**Avi-specific checks:**
- [ ] Any "However," "Furthermore," "Additionally"? (Delete.)
- [ ] Any "It's important to consider..." / "It's worth noting..."? (Delete.)
- [ ] Any "It's not X, it's Y" constructions? (Rework.)
- [ ] Does it sound like an academic paper abstract? (Humanize.)

**Parker-specific checks:**
- [ ] Is it preachy? (Parker inspires, doesn't lecture.)
- [ ] Is it condescending? (Never "well actually.")
- [ ] Could it be traced to Avi? (No Stanford, no Forethought, no physics jargon, no EA insider language.)
- [ ] Does it have the upbeat energy? (If it reads flat, punch it up.)
- [ ] Is the optimism grounded? (Parker takes risks seriously — the hope comes from seeing the path through.)

---

### Phase 5: Delivery

#### Queue File Format

Save to `Twitter/accounts/[account]/queue/YYYY-MM-DD.md`:

```markdown
# [Account] Queue — YYYY-MM-DD

## 🏆 Today's Top 3
1. [Tweet X] — [one-line reason]
2. [Tweet Y] — [one-line reason]
3. [Reply Z] — [one-line reason]

---

## Original Tweets

### Tweet 1 — [type: factoid / take / observation]
> [The actual tweet text]

**Source:** [file path or "original" or "web: headline"]
**Context:** [1 line — why this tweet, why today]
- [ ] Post  ✏️ Edit  ❌ Skip

---

### Tweet 2 — [type]
> [tweet text]

**Source:** ...
**Context:** ...
- [ ] Post  ✏️ Edit  ❌ Skip

---

[etc.]

## Reply Suggestions

### Reply 1
**Replying to:** @handle — "[summary or quote of their tweet]"
> [Parker/Avi's reply]

**Why this reply:** [1 line]
- [ ] Post  ✏️ Edit  ❌ Skip

---

## Thread Idea (if applicable)

### [Thread topic]
**Hook tweet:**
> [The first tweet of the thread]

**Outline:** [2-3 sentences]
**Length:** ~X tweets
**Source:** [file reference]
**Priority:** Draft this week? [yes/no]

---

## Backlog Additions
*New evergreen tweets generated today that aren't time-sensitive:*

> [tweet text]
> [tweet text]

---

*Generated: [timestamp] | Anti-pattern pass: ✅*
```

#### Presentation to Avi

After saving the file, present a summary:

```
📋 **Twitter Queue — [date]**

**Avi:** [count] tweets, [count] replies
**Parker:** [count] tweets, [count] replies

🏆 Top picks:
1. [Avi] "[first 60 chars of tweet]..."
2. [Parker] "[first 60 chars of tweet]..."
3. [best reply] → @handle

Queue files: [link to avi queue] · [link to parker queue]
```

Keep it scannable. Avi should be able to decide "yes, run with these" in 30 seconds.

---

## Backlog Management

When generating tweets that aren't time-sensitive, add them to `Twitter/accounts/[account]/queue/backlog.md` instead of the daily queue. Backlog tweets are deployed on slow news days or when the daily queue is thin.

**Backlog format:**
```markdown
## [topic cluster]

> [tweet text]
> Added: YYYY-MM-DD | Source: [ref]

> [tweet text]
> Added: YYYY-MM-DD | Source: [ref]
```

---

## Thread Drafting

When Avi approves a thread idea, draft the full thread. Save to `Twitter/accounts/[account]/threads/[slug].md`:

```markdown
# [Thread Title]
*Draft — [date] | Account: [avi/parker] | Source: [ref]*

---

**1/** [Hook tweet — this is the most important tweet. It must make people stop scrolling.]

**2/** [Setup — why this matters]

**3–N/** [Core argument, one idea per tweet]

**N+1/** [The turn — connection to bigger picture]

**N+2/** [Landing — what the reader takes away]

---

*Notes: [anything about the thread — easter eggs, voice notes, concerns]*
```

---

## Weekly Review Integration

On Sundays (or when asked), generate a weekly review instead of a daily queue. Read the week's `posted/` entries and the queue files. Produce:

1. **What performed best** (from Avi's notes in posted/ files)
2. **What got cut** and whether the cuts were right
3. **Voice calibration** — any drift?
4. **Strategy adjustments** for next week
5. **Backlog maintenance** — prune stale items, surface strong ones

---

## Troubleshooting

### No web access
Without web search, the queue skews toward evergreen content from workspace files. Note this to Avi: "No web access today — queue is workspace-sourced. Consider adding a timely take manually."

### Workspace hasn't changed
If git log shows no recent activity and content sources are already mined, lean harder on:
- Backlog deployment
- Reply suggestions (these are always fresh if web search is available)
- Prompting Avi: "What's on your mind today? Give me a sentence and I'll tweet it."

### Voice drift between accounts
If generating for both accounts in one session, draft all Avi tweets first, then reset voice by re-reading Parker's VOICE.md before drafting Parker tweets. The voices must stay sharply distinct.

---

## Examples

### Example 1: Standard daily queue
User: "/tweet-queue"
→ Load both voice guides. Web search for today's AI news. Mine workspace. Generate 2-3 tweets + 1-2 replies per account. Save queue files. Present summary.

### Example 2: Single account, specific topic
User: "/tweet-queue parker — there's a big AI safety paper drop today from Anthropic"
→ Load Parker voice only. Web search for the Anthropic paper. Draft 3 Parker tweets reacting to it. Draft 1 reply to Anthropic's announcement tweet. Save queue.

### Example 3: Low-attention mode
User: "tweets"
→ Detect low attention. Load both voices. Generate with defaults. Present only the top 3 picks inline. Save full queues to files.

---

*The queue is the bridge between Claude's research depth and Avi's 10-minute time budget. Make it effortless.*
