# Claude Code Session Dashboard

A sci-fi themed web dashboard that visualizes your [Claude Code](https://claude.com/claude-code) session history. Browse past sessions, see coding activity as a 3D topographic terrain, and resume any session directly from the browser.

## Setup

**Prerequisites:** Node.js 18+, Python 3.8+, Claude Code CLI installed (you need existing session data in `~/.claude/`).

```bash
npm install
python generate-session-data.py
node server.js
```

Open **http://localhost:8092/session-dashboard.html**

## Features

- **Session list** — Search, sort, and filter all your Claude Code sessions. Each card shows first and last prompts with a bracket notation, code change dot grids, and prompt count. Hover to expand and see intermediate prompts.
- **Click to resume** — Click any session to open an embedded terminal running `claude --resume <session-id>`. Ctrl+C copies selected text (or sends interrupt), Ctrl+V pastes.
- **3D activity terrain** — Token usage as a topographic landscape (hours x days). Smoothed contour lines, project-labeled peak markers, timeline scrubber to filter date range.
- **Activity heatmap** — Grid view of sessions/chars/files/tokens over day/week/month/all-time.
- **Projects panel** — Treemap and sparkline activity charts per project.
- **Config panel** — Click CFG (bottom-right) to switch fonts and change all theme colors live.
- **Draggable panels** — Resize any section by dragging the dividers between them.

## Updating Data

After new Claude Code sessions, regenerate:

```bash
python generate-session-data.py
```

The dashboard also auto-refreshes when you close an embedded terminal, and every 10 minutes while one is open.

## Custom Project Names

Projects auto-generate display names from folder paths (`my-cool-project` becomes "My Cool Project"). To customize, create `name_map.json`:

```json
{
  "my-project": "My Project",
  "work/big-app": "Big App"
}
```

Keys are relative paths from your home directory (after stripping prefixes like Documents/, Dropbox/).

## For Claude Code Agents

Read `CLAUDE.md` for full architectural documentation. Key entry points:

- **Data:** `generate-session-data.py` — extracts sessions from `~/.claude/`, outputs `sessions-data.json`
- **Dashboard:** `session-dashboard.html` — single file, all inline. `renderSessions()` for cards, `rebuildTerrain()` for 3D, `renderActivityGrid()` for heatmap
- **Server:** `server.js` — Express + WebSocket + node-pty on port 8092
- **Theme:** CSS `:root` variables — `--green`, `--red`, `--cyan`, `--section-padding`, `--mono`, `--sans`
