---
name: morning-briefing
description: "Generate a daily briefing: calendar, active projects, todo, inbox, opportunities, and optionally email. Use when the user says 'morning briefing', 'what's my day', 'daily summary', 'brief me', or '/morning-briefing'."
argument-hint: "[--no-calendar] [--no-email] [--telegram]"
metadata:
  author: Avi Parrack & Claude
  version: 0.1.0
---

# Morning Briefing

Your daily chief-of-staff brief. Reads all live data sources and produces a scannable summary you can review in under 5 minutes.

## Data Sources

Read these in order. **Skip gracefully** if any source is unavailable (MCP not connected, file doesn't exist, etc.) — never fail the whole briefing because one source is missing.

### 1. Calendar (if Google Calendar MCP available)

```
List events for today and tomorrow.
```

Format as:
```
📅 TODAY (Thursday Apr 24)
  18:00  Coffee Social Stanford (Spilker Engineering)
  
📅 TOMORROW (Friday Apr 25)
  [events or "clear"]
```

If calendar MCP is not available, skip with: `📅 Calendar: not connected`

### 2. Todo List

Read `Harbor/todo.md`. Surface:
- Top 5 items by priority score
- Any items marked urgent (⚡)
- Any stale items (added 30+ days ago, not completed)

### 3. Inbox Status

Count files in `Harbor/Inbox/`:
```bash
ls Harbor/Inbox/*.md | grep -v README | wc -l
```

Report: "[N] items pending triage" + list the 3 most recent by filename (date is in the name).

### 4. Overnight Scout Reports

Check if any of these exist for today or yesterday:
- `Harbor/Inbox/opportunity-scan-YYYY-MM-DD.md`
- `Harbor/Inbox/network-scout-YYYY-MM-DD.md`
- `Harbor/Inbox/watchlist-YYYY-MM-DD.md`

If found, read the first 10 lines of each and surface the highlights.

### 5. Active Projects

Read `Workshop/CLAUDE.md` for the active projects table. For each, check if a HANDOFF.md exists and read the first line (current status).

### 6. Approaching Deadlines

Read `Harbor/opportunities.md`. Flag anything with a deadline in the next 7 days.

### 7. Email Digest

If a recent `Harbor/Inbox/email-triage-{date}.md` queue file exists (today's, or yesterday's if today's hasn't run yet), read it and surface the digest:

- **Urgent count** with senders + subjects (from 🔴 section)
- **Action count** with senders + subjects, condensed (from 🟠 section)
- **FYI count** (just the number, no detail)
- **Drafts awaiting send** in Gmail (count from queue file, or query Gmail MCP `list_drafts` if available)

Format:
```
📧 Email — {N} action, {M} FYI{, K urgent if any}
  🔴 {sender}: {subject}                   (only if urgent)
  🟠 {sender}: {subject}
  🟠 {sender}: {subject}
  + {N-2} more action items
  ✏️ {K} drafts awaiting send
  → /email-triage to engage
```

If no recent triage queue file exists, run `/email-triage` first (or invoke its logic inline) so the briefing has something to surface. The briefing is the consumer; email-triage is the producer.

If Gmail MCP is not available, skip with: `📧 Email: not connected`

### 8. Pattern Nudge (weekly)

If today is Monday, read `Library/Logs/PATTERNS.md` and surface the most recent pattern or calibration note.

## Output Format

```markdown
# ☀️ Morning Briefing — [Day, Month Date]

## Schedule
[calendar events]

## Priority Actions
1. [top todo item]
2. [second]
3. [third]
[+ N more in Harbor/todo.md]

## Inbox
[N] items pending triage. Recent: [list 3 most recent]
[any overnight scout highlights]

## Active Projects
| Project | Status |
|---|---|
| [name] | [HANDOFF first line or "no handoff"] |

## Deadlines This Week
[any approaching deadlines from opportunities.md]

## Email
[unread count + any urgent flags, or "not connected"]

## 🔮 Pattern Nudge (Mondays only)
[latest pattern/calibration insight]
```

## Delivery

After generating the briefing, deliver it through ALL available channels:

### 1. Full report → file
Save the complete markdown briefing to:
```
Harbor/Dispatch/log/briefing-YYYY-MM-DD.md
```

### 2. Telegram → condensed headlines
Send via Telegram MCP (`mcp__plugin_telegram_telegram__reply`). Keep under 500 chars:
```
☀️ Morning Brief — Apr 24

📅 18:00 Coffee Social Stanford
📋 Top todo: [item]
📬 3 items in inbox
⚡ [any urgent flags]
📊 5 active projects
```

### 3. Slack → full report DM
Send the full briefing as a Slack DM to Avi:
```
mcp__claude_ai_Slack__slack_send_message
  channel_id: "U0AC12ZAAV6"  (Avi's Slack user ID)
  message: [full briefing markdown]
```
If the briefing exceeds 5000 chars (Slack limit), split into headline message + thread reply with details.

### 4. Commit + push
Git add and commit the briefing file so it syncs to both machines:
```bash
git add Harbor/Dispatch/log/briefing-YYYY-MM-DD.md
git commit -m "☀️ Morning briefing — YYYY-MM-DD"
git push origin main
```

## Avi's Personal Schedule (Mac Mini)

**Scouts (overnight, results ready for briefing):**

| Agent | Time | What |
|---|---|---|
| Watchlist monitor | 4:00 AM | Scan overnight news |
| Opportunity scan | 4:20 AM | Find new opportunities |
| Network scout | 4:40 AM | Identify connection targets |

**Briefing:** 7:00 AM — reads scout results + all other sources, delivers to Telegram + Slack + file.

**Setup on Mac Mini:** Update scout cron times in `Town-Hall/Scaffold/autodesk/scout-boot.md` and register a new cron for the briefing:
```
Cron: 0 7 * * *
Prompt: "Run /morning-briefing. Deliver via all channels (file + Telegram + Slack). Commit and push."
```

## Parameters

| Param | Default | Description |
|---|---|---|
| `--no-calendar` | false | Skip calendar check |
| `--no-email` | false | Skip email check |
| `--no-telegram` | false | Skip Telegram delivery |
| `--no-slack` | false | Skip Slack delivery |
| `--quiet` | false | File only, no messaging |

## Notes

- The briefing is **read-only** — it never modifies any files except the log output. Pure synthesis.
- If a data source fails or isn't available, skip it gracefully and note it in the output. A partial briefing is better than no briefing.
- If a delivery channel fails (Slack down, Telegram not connected), log the failure but don't block other channels.
- The 5-minute scan constraint is sacred. If the output is longer than one screen, it's too long. Bold the most important items. Lead with what needs action today.
- For other users: the delivery channels and schedule are personal config. The skill itself is generic — it reads whatever data sources exist and delivers through whatever channels are available.
