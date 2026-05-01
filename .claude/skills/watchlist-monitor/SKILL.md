---
name: watchlist-monitor
description: "Daily news monitor for the user's watchlist — people, companies, topics, movements. Use when the user says 'check watchlist', 'what's the news', 'daily briefing', 'monitor update', or '/watchlist-monitor'."
---

# Watchlist Monitor

You are scanning the web for the most important recent news about items on the user's watchlist.

## Before anything else

1. Read `Town-Hall/User/Watchlist.md` — the active watch items with custom instructions per item
2. Read `Harbor/Dispatch/scout-calibration.md` — learned preferences (what news the user cares about vs ignores)
3. Read `Library/Knowledge-Graph/PREMISES.md` — worldview context for filtering relevance

## Workflow

### Phase 1: Check idempotency

If `Harbor/Inbox/watchlist-YYYY-MM-DD.md` already exists for today, skip. Already ran.

### Phase 2: Scan

For each active watch item, run targeted web searches. Use the custom instructions column to focus your searches.

**What counts as news worth reporting:**
- Major announcements, product launches, model releases
- Public appearances (podcasts, congressional testimony, conferences)
- Policy moves (executive orders, regulatory decisions, legislation)
- Notable publications (papers, blog posts, reports)
- Leadership changes, major hires, departures
- Funding rounds, acquisitions, partnerships
- Public statements that shift the landscape
- Milestones (launch successes/failures, benchmark results)

**What does NOT count:**
- Routine business updates with no strategic significance
- Rumors without credible sourcing
- Opinion pieces that don't contain new information
- Anything older than 7 days (unless it's a major development the user missed)

### Phase 3: Synthesize

Create `Harbor/Inbox/watchlist-YYYY-MM-DD.md`:

```yaml
---
source: watchlist-monitor
date: YYYY-MM-DD
status: pending
tier: null
---
```

Format the briefing as a scannable digest:

```markdown
# Daily Watchlist Briefing — YYYY-MM-DD

## 🔴 Big moves (act on or note)
- **[Item]:** [what happened] — [why it matters] ([source link])

## 🟡 Notable (worth knowing)
- **[Item]:** [what happened] — [one-line context] ([source link])

## ⚪ Quiet today
[Items with nothing significant to report]
```

**Rules:**
- Lead with the most important item, not alphabetical order
- 🔴 = changes the landscape, the user should know immediately
- 🟡 = interesting development, good to be aware of
- Keep each item to 1-2 sentences max. Link to source.
- If nothing notable happened for an item, just list it under "Quiet today" — don't pad with filler
- Total briefing should be scannable in under 2 minutes

### Phase 4: Commit + notify

```bash
git add Harbor/Inbox/watchlist-YYYY-MM-DD.md
git commit -m "Daily watchlist: YYYY-MM-DD — [N] items flagged"
bash Town-Hall/Scaffold/autodesk/safe-sync.sh push
```

Send Telegram summary (chat_id from your Telegram setup (set via `/telegram:access` or your access.json)):

```
📡 Watchlist — YYYY-MM-DD

🔴 [Top item: one-line summary]
🟡 [Notable items: brief list]
⚪ [N] items quiet

Full briefing in inbox.
```

### Phase 5: Calibration

After the user reviews and rates the briefing:
- Note which items he engaged with vs skipped
- Update custom instructions in Watchlist.md if patterns emerge
- Log to `Harbor/Dispatch/scout-calibration.md`

## Key principles

- **Signal, not noise.** 3 important items > 10 filler items. Err on the side of fewer, better.
- **Speed over depth.** This is a morning briefing, not a research sprint. Headlines + one-line context + link.
- **Custom instructions matter.** Each watch item has specific things to look for — follow them.
- **Calibrate.** What the user cares about for each item will evolve. The custom instructions column is living.
