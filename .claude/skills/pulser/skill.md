---
name: pulser
description: Launch the Session Pulser dashboard — visualizes all Claude Code session history with 3D terrain, activity heatmaps, treemaps, and embedded terminal resume. Use when the user says 'pulser', 'session dashboard', 'show my sessions', or '/pulser'.
user_invocable: true
---

# Session Pulser

Launch the Session Pulser dashboard for visualizing Claude Code session history.

## What it does

1. Regenerates `sessions-data.json` from `~/.claude/` session history
2. Starts the Express + WebSocket server on port 8092
3. Opens the dashboard in the browser

## Steps

1. Kill any existing pulser server:
```bash
pkill -f "node.*server.js.*8092" 2>/dev/null || true
```

2. Check if node_modules exist in `Town-Hall/Scaffold/session-pulser/`, install if not:
```bash
cd Town-Hall/Scaffold/session-pulser && [ ! -d node_modules ] && npm install
```

3. Regenerate session data:
```bash
cd Town-Hall/Scaffold/session-pulser && python3 generate-session-data.py
```

4. Start the server in the background:
```bash
cd Town-Hall/Scaffold/session-pulser && node server.js &
```

5. Wait 2 seconds, then open the dashboard:
```bash
sleep 2 && open http://localhost:8092/session-dashboard.html
```

6. Report the stats from the data generation (sessions, prompts, tokens, projects) and confirm the dashboard is running.

## Options

If the user says "pulser refresh" or "refresh pulser", just regenerate the data and hit the refresh endpoint — don't restart the server:
```bash
cd Town-Hall/Scaffold/session-pulser && python3 generate-session-data.py && curl -s -X POST http://localhost:8092/refresh-data
```

If the user says "pulser stop" or "stop pulser", kill the server:
```bash
pkill -f "node.*server.js.*8092" 2>/dev/null
```
