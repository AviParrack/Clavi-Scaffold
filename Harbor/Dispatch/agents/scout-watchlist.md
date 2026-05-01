# Agent: Watchlist Monitor

**Skill:** `/watchlist-monitor`
**Schedule:** Daily (via autodesk cron)
**Returns to:** `Harbor/Inbox/watchlist-YYYY-MM-DD.md`

## Mission

Scan the web for updates on everything in `Harbor/watchlist.md`. Surface important news, announcements, public appearances, and developments.

## Reads Before Launch

- `Harbor/watchlist.md` — the active watch items
- `Harbor/Dispatch/scout-calibration.md` — learned preferences

## Success Criteria

- Checks every item on the watchlist
- Only surfaces genuinely important updates (not noise)
- Telegram summary of anything actionable
- Idempotent: skips if today's file already exists
