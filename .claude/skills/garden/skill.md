---
name: garden
description: Launch the Idea Garden — visualize workspace notes as 3D L-system plants. Note clusters become living organisms with trunks, branches, and leaves. Six-space color coding (Harbor=gray, Town-Hall=blue, Workshop=orange, Library=green, Embassy=purple, Crossroads=red). Use when the user says 'garden', 'idea garden', 'show knowledge plants', or '/garden'.
user_invocable: true
---

# Idea Garden

Visualize workspace notes as 3D L-system plants.

## Steps

1. Kill any existing garden server:
```bash
lsof -ti:8094 2>/dev/null | xargs kill 2>/dev/null || true
```

2. Regenerate the graph data (if stale) and garden data:
```bash
cd Workshop/Aesthetics/knowledge-graph && python3 graph_builder.py
cd Town-Hall/Scaffold/idea-garden && python3 generate-garden-data.py
```

3. Start the HTTP server:
```bash
cd Town-Hall/Scaffold/idea-garden && python3 -m http.server 8094 --bind 127.0.0.1 &
```

4. Open in browser:
```bash
sleep 1 && open http://localhost:8094/garden.html
```

5. Tell the user to click **LOAD WORKSPACE** to visualize their notes as plants.

## Usage tips to share

- Click **LOAD WORKSPACE** on the setup screen
- **Hover** leaves to see note titles
- **Click** leaves to see note details in the side panel
- **H** resets camera, **V** opens VFX panel to tweak colors/bloom/sizes
- **Timeline scrubber** at the bottom filters by date
- Color coding: Harbor=gray, Town-Hall=blue, Workshop=orange, Library=green, Embassy=purple, Crossroads=red
- Canonical findings glow in the scaffold accent color

## Options

If the user says "garden stop", kill the server:
```bash
lsof -ti:8094 2>/dev/null | xargs kill 2>/dev/null || true
```
