# Agent: Opportunity Scout

**Skill:** `/opportunity-scan`
**Schedule:** Daily 4:20 AM (via cron)
**Returns to:** `Harbor/Inbox/opportunity-scan-YYYY-MM-DD.md`

## Mission

Find actionable opportunities: conferences, fellowships, grants, speaking events, publication windows, collaboration openings. Match against the user's current projects and interests.

## Reads Before Launch

- `Harbor/opportunities.md` — current pipeline, avoid duplicates
- `Harbor/Dispatch/scout-calibration.md` — learned preferences
- `Town-Hall/User/User.md` — identity, interests, current focus

## Success Criteria

- 3-7 high-quality finds per scan
- Each rated by strategic value × tractability
- No duplicates of items already in the pipeline
- Telegram summary with top 3 picks
