# Claude Code Session Dashboard

## What This Is

A web dashboard that visualizes Claude Code session history. Reads data from `~/.claude/`, generates a JSON file, and serves an interactive dashboard.

## Quick Start

```bash
npm install
python generate-session-data.py
node server.js
# Open http://localhost:8092/session-dashboard.html
```

Prerequisites: Node.js 18+, Python 3.8+, Claude Code CLI installed (`~/.claude/` must exist with session data).

## Files

- **`generate-session-data.py`** — Data pipeline. Parses `~/.claude/history.jsonl` and `~/.claude/projects/*/` JSONL files. Outputs `sessions-data.json`. Extracts per session: prompts (first 3 + last 3 stored as `promptSamples`), `lastPrompt`, timestamps, chars added/removed, files touched, input/output tokens, model, project path. Aggregates per project: totals, activity streaks, categories. Custom project name overrides load from optional `name_map.json`.
- **`sessions-data.json`** — Generated data file (gitignored). Structure: `{ notes: [...sessions], groupsByProject: [...], groupsByTopic: [...], stats: {...} }`. Each note has: `id`, `sessionId`, `name` (first prompt), `lastPrompt`, `promptSamples` (array), `subfolder` (project name), `projectPath`, `charsAdded`, `charsRemoved`, `filesTouched`, `inputTokens`, `outputTokens`, `promptCount`, `firstTimestamp`, `lastTimestamp`, `model`, `tags`, `sessionType`.
- **`server.js`** — Node.js server (Express + WebSocket + node-pty). Port 8092. Static file serving, PTY terminal management, data refresh. API:
  - `GET /*` — static files
  - `POST /refresh-data` — runs generate-session-data.py, broadcasts result via WebSocket
  - `ws://localhost:8092?sessionId=<id>&projectPath=<path>` — spawns `claude --resume <id>` in PTY
  - WebSocket messages: `{ type: "input"|"resize"|"output"|"exit"|"data-refresh" }`
- **`session-dashboard.html`** — The entire dashboard in one file (HTML + CSS + JS, no frameworks). Uses ES modules for Three.js and xterm.js imports.
- **`package.json`** — Dependencies: express, ws, node-pty, @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links.
- **`name_map.json`** — Optional, gitignored. User-specific project name overrides. Keys = relative folder paths, values = display names.

## Dashboard Architecture

### Layout (default state)
```
[Top bar: title + stat strip]
[Sessions (left)] | [Terrain (center-top)] | [Projects (right)]
                   | [Heatmap (center-bot)] |
```

### Layout (terminal open)
```
[Top bar]
[Sessions (collapsed)] | [Terminal (center)] | [Terrain (right-top)]
                        |                     | [Heatmap (right-mid)]
                        |                     | [Projects (right-bot)]
```

Terrain + heatmap DOM elements physically move between `#center-column` and `#right-column` via JS in `openTerminal()` / `closeTerminal()`.

### CSS Variable System

All colors and spacing are CSS variables in `:root`, configurable live via the CFG panel:

```
--green: #b4e62e          (primary accent — lime green)
--red: #cc3344            (removals, terrain peak markers)
--cyan: #44aacc           (info accent)
--bg: #0a0a0f             (page background)
--bg-panel: #0e0e14       (panel backgrounds)
--bg-card: #111116        (card backgrounds)
--text: #b8b8b8           (body text)
--text-dim: #5a5a6a       (secondary text)
--text-bright: #d8d8d8    (emphasis text)
--border-section: color-mix(in srgb, var(--green) 60%, transparent)
--section-padding: 26px   (internal padding for all panels)
--mono: 'Fira Code'       (body font)
--sans: 'Space Grotesk'   (label/title font)
```

JS reads these at startup into `COLORS` object (`COLORS.green`, `COLORS.greenHex`, `COLORS.redHex`, `COLORS.bgHex`) for Three.js usage. When CFG panel changes a color, both CSS variables and `COLORS` object are updated, and terrain rebuilds if accent/red/bg changed.

### Key JS Functions

- `render()` — calls `renderGlobalStats()`, `renderSessions()`, `renderProjects()`, `renderActivityGrid()`
- `renderSessions()` — builds session cards with bracket prompts, dot grid badges, click handlers. Reads `sessionSearch`, `sessionSort`, `sessionProjectFilter` state.
- `initTerrain()` — sets up Three.js scene once (camera, grid floor, lights, scrubber). Calls `rebuildTerrain()`.
- `rebuildTerrain(dayStart, dayEnd)` — rebuilds heightfield, contour lines (upsampled 4x, marching squares), peak markers with labels, axis labels. Reads `COLORS` for current accent color. Runs sweep-in clip plane animation.
- `openTerminal(session)` — moves terrain+heatmap to right-column, shows terminal panel, spawns WebSocket PTY connection.
- `closeTerminal()` — kills PTY, moves terrain+heatmap back to center-column, hides terminal.
- `buildConfigPanel()` — generates font options + theme color pickers. Color changes update CSS vars, `COLORS` object, and trigger terrain rebuild.
- `dotGrid(value, max, onClass, offClass)` — renders 3x3 dot grid for session badges.
- `promptBars(value, max)` — renders prompt count as small bar chart.

### Terrain System

- Heightfield: 24 (hours) x N (days) grid of token usage per cell
- Gaussian smoothed (3 passes, radius 2)
- Upsampled 4x via bilinear interpolation before marching squares
- 14 contour levels, both elevated (on terrain surface) and ground-projected
- Contour HSL derived from current `--green` CSS variable
- Orthographic camera, orbit controls
- Peak markers: upside-down triangles + vertical lines + HTML labels with corner bracket borders
- Timeline scrubber filters date range, triggers full rebuild
- Clip plane sweep animation on load (front to back along Z axis)

### Session Cards

- Card = `.session-card` with `.session-card-main` (left) + `.session-badge` (right, beveled corner)
- Bracket notation: `.prompt-bracket` wraps `.bracket-line` (CSS border L-shape) + `.prompt-list`
- Hover expands `.prompt-expandable` (max-height transition, 0.5s)
- Badge has two 3x3 `.dot-grid`s (green for added, red for removed) + `.prompt-bars`
- Badge top-right bevel via `::before` (green triangle) + `::after` (bg-color triangle)

## When Modifying

- To add a new stat to the top bar: edit `renderGlobalStats()` — it outputs `<span>` elements into `.stat-strip`
- To change session card layout: edit the template string in `renderSessions()` and the CSS classes `.session-card-*`
- To add a new heatmap metric: add to the `grid-btn` buttons in HTML and handle in `renderActivityGrid()` where `gridMetric` is read
- To change terrain appearance: edit `rebuildTerrain()` — contour colors, marker styles, label styles are all inline
- To add a new config option: add to `buildConfigPanel()` and wire up an event handler
