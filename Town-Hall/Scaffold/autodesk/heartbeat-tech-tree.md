---
project: tech-tree
status: building
version: v5.2
iteration: 5
machine: laptop
started: 2026-04-09
last_updated: 2026-05-01T01:25:00
---

# Builder Heartbeat: tech-tree

**Project:** Tech Tree — Fire to Dyson
**Active file:** `Workshop/backburner/Tech-Tree/v2.html` (~4,333 lines)
**Nodes:** 2,230 (2,201 historical + 29 speculative future) | **Edges:** ~2,829

## Done (cumulative)
- [x] v1: 214 nodes, 259 edges, D3 renderer with zoom/pan/search/fog-of-war
- [x] v2: CE-style rewrite — Canvas 2D, minimap, dark chrome, 2,230 nodes
- [x] v3: full info cards, era bands, Y-flipped (future up)
- [x] v4: 5 layout modes, search dimming, image thumbnails
- [x] v5.0: horizontal time everywhere, Promethean fire palette, 8 polygon shapes, drop shadow float, light/dark, ignition cascade, walk-mode camera
- [x] v5.1: radial bugfix, Tech.png fire-tinted fallback, ignition perf optimisations
- [x] **v5.2 (this session): interactive Time Scrubber strip**
  - Fire-gradient horizontal strip pinned above footer (full width minus 24px)
  - Log-scaled density histogram of node count per time bin (240 bins, 5-tap smoothing) — modern explosion no longer crushes prehistory
  - Click or drag anywhere to jump camera to that year (no animation while dragging — instant scrub feel)
  - Triangle handle on top edge tracks current camera-center year
  - Secondary playhead (gold) shows `S.playYear` during active play mode
  - "You Are Here" dashed line at present (`CURRENT_YEAR`)
  - Era boundary tick lines + year markers (-1M, -100k, -10k, -1k, 0, 1k, 1.5k, 1800, 1900, 1950, 2000, 2050, 2100)
  - Hover tooltip shows year above the strip
  - `T` key toggles visibility (default visible); state in `S.scrubVisible`
  - Touch support for trackpad/phone (touchstart/move/end)
  - Light-mode aware (rebalanced gradient + bar tint)
  - Density precomputed once at init (`buildScrubDensity()`) — not recomputed per frame; only the dpr-aware canvas redraw fires inside `render()`

## Current
- [ ] Awaiting first visual verification — open `v2.html` in browser, confirm strip renders correctly at the bottom and drag-scrub feels right at all timeline scales (esp. the prehistory stretches)

## Next
- [ ] Path highlighting polish (click → dependency chain) — already partially exists via walk mode; could add a "lit ancestor lineage" persistent state
- [ ] Verify future projections against IE research
- [ ] Spatial index for hover (currently O(N) per mouse move at 2,230 nodes)
- [ ] Smooth column-header transitions when bin-mode changes
- [ ] Possibly: era-tinted scrubber background bands (one tint per era) instead of monolithic gradient — more legible

## Blockers
- None — ready for Avi to look at v5.2 and react

## Version History
| Version | Date | What changed | Commits |
|---|---|---|---|
| v1.0 | 2026-04-08 | D3 / 214 nodes | (early) |
| v2.0 | 2026-04-09 | Canvas2D / 2,230 nodes / minimap / fog | (early) |
| v5.0 | 2026-04-15 | Horizontal time, fire palette, shapes, light mode, ignition cascade | (Workshop sprint commit 21cb09e) |
| v5.1 | 2026-04-18 | Radial fix + Tech.png fallback + ignition perf | (Workshop sprint commit 21cb09e) |
| v5.2 | 2026-05-01 | Interactive time scrubber (~286 lines) | this session |

## Feedback Log
| Date | Source | Feedback | Hypothesis |
|---|---|---|---|
| 2026-04-09 | Avi | "pretty beautiful — 4 polish issues" (timeline label dim, max zoom-out, category bleed, LOD smoothness) | These are likely subsumed by v5's horizontal-time + fire palette + shape coding rework; needs re-eval after v5.2 |
| 2026-05-01 | Self | Adding scrubber felt like the cleanest extension because the "play" infra (playMode/playYear/playHighlight, `xToYear`/`yearToX`) was already in place — it became wiring, not invention | When existing primitives line up, lean on them; only build new substrate when the gap is real |

## Milestones sent to Avi
- 2026-04-09 v2 demo shown — "pretty beautiful" — 4 polish issues noted
- 2026-04-15/18 v5.0/v5.1 shipped (no formal review yet)
- 2026-05-01 v5.2 — not pinged this session (autonomous run; will accumulate to next visible review)
