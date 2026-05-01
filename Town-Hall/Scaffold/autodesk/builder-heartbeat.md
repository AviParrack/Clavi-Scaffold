# Builder Heartbeat (template)

*Each active builder writes its state here. The builder-manager reads heartbeats to decide what to spawn next.*
*One file per project — copy this template to `heartbeat-<project-slug>.md` when starting a new build.*

**Project:** [project name]
**Status:** [building | paused | changes-requested | complete | archived]
**Iteration:** [N]
**Session cost:** [~$X cumulative]

## Done
- [x] [completed item]

## Current
- [ ] [what's actively being worked on]

## Next
- [ ] [next steps in priority order]

## Blockers
- [anything waiting on the user, or technical blockers]

## Feedback log
| Date | Source | Quote / summary | Hypothesis for next iteration |
|------|--------|------------------|-------------------------------|
| YYYY-MM-DD | user review | "..." | what to change and why |

## Milestones sent
- (timeline of what was sent to the user for review and the response)
