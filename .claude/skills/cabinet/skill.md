---
name: cabinet
description: Open the Cabinet of Curiosities — a visual file browser that renders any folder as a hoverable grid of cells. Images show thumbnails with color sorting, text/markdown shows inline snippets, PDFs/video/audio preview in a side panel. Use when the user says 'cabinet', 'show me this folder', 'visual browser', 'explore files', or '/cabinet'.
user_invocable: true
---

# Cabinet of Curiosities (Kunstkammer)

Open a visual file browser that turns any folder into an explorable grid.

## Steps

1. Kill any existing cabinet server:
```bash
lsof -ti:8093 2>/dev/null | xargs kill 2>/dev/null || true
```

2. Start the HTTP server:
```bash
cd Town-Hall/Scaffold/cabinet && python3 -m http.server 8093 --bind 127.0.0.1 &
```

3. Open in browser:
```bash
sleep 1 && open http://localhost:8093/index.html
```

4. Tell the user the cabinet is open and they can drag any folder into it, or use the Browse button to select one.

## Usage tips to share with the user

- **Drag a folder** into the right panel (or click Browse)
- **Stable / Chaotic** toggles between uniform grid and treemap layout
- **Name / Type / Size / Hue / Bright** sort files by property (click again to reverse)
- **Click any cell** to preview the file in the left panel
- **Drag the purple divider** to resize the viewer/grid split
- Works best in Chrome/Edge (Firefox has limited folder drag-and-drop from `file://`)

## Options

If the user says "cabinet stop" or "stop cabinet", kill the server:
```bash
lsof -ti:8093 2>/dev/null | xargs kill 2>/dev/null || true
```
