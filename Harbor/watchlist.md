# Watchlist

*People, companies, topics, and movements you want monitored. The `/watchlist-monitor` scout reads this and scans the web for big moves, announcements, public appearances, and news on each item.*

*This file is yours to fill. The entries below are illustrative examples — replace them with what you actually care about.*

---

## Active Watch Items

| # | Item | Type | Why watching | Custom instructions |
|---|---|---|---|---|
| 1 | **Frontier AI Labs** (e.g., Anthropic, OpenAI, Google DeepMind) | Companies | Tracking AI capabilities + safety trajectory | Focus on: model releases, safety publications, policy positions, hiring, partnerships |
| 2 | **A specific researcher you follow** | Person | Their work shapes your field | Focus on: new papers, talks, podcasts, social posts on substantive topics |
| 3 | **A topic in your field** (e.g., space launch cadence, protein folding, model interpretability) | Topic | Active research interest | Focus on: breakthroughs, benchmarks, contrarian takes |
| 4 | **An organization you care about** | Org | You want to know when they publish | Focus on: blog posts, papers, podcast episodes, media mentions |
| 5 | **A topic you're worried about** | Topic | Threat-landscape monitoring | Focus on: emerging signals, escalations, key players |

*Replace these with your own watch items. The scout takes them at face value.*

---

## Retired / Paused

| Item | Why removed | Date |
|---|---|---|
| *(none yet)* | | |

---

## How to add/remove

Tell Claude: *"Add X to the watchlist"* or *"Remove X from the watchlist"* — this file gets updated and the daily monitor picks it up automatically.

Each item can have **custom instructions** that evolve based on calibration — if you consistently skip certain types of news for an item, the custom instructions get refined. The scout learns what you actually want to know about each watched thing.

## Reading the daily output

The watchlist scout deposits to `Harbor/Inbox/watchlist-YYYY-MM-DD.md` with a 🔴 big-moves / 🟡 notable / ⚪ quiet structure. Run `/triage` to process those items.
