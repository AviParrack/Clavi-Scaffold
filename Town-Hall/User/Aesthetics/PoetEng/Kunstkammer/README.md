# Kunstkammer

A single HTML page that turns any folder into a cabinet of curiosities. Drop a collection of files and see them all — images, text, markdown, PDFs, audio, video — arranged and alive in one view.

Named after the *Kunstkammer* (/ˈkʊnst.kamər/, "art chamber") — the 16th-century rooms where scholars compressed the entire world into a single space.

Fully standalone — no dependencies, no build step, no network requests. Nothing leaves your machine.

## Files

```
Kunstkammer/
  index.html    — open this in a browser
  kunstkammer.css  — styles
  kunstkammer.js   — runtime
  assets/       — fonts and hero image
```

## Usage

Open `index.html` in any browser. Drop a folder into the right panel (or click **Browse** to select one). Your files appear as a grid of hoverable cells.

- **Images** show thumbnails with color-aware sorting
- **Text and Markdown** show inline snippets, rendered on click
- **PDFs, video, audio** preview in the left panel

## Controls

| Control | Effect |
|---------|--------|
| **Stable / Chaotic** | Toggle between uniform grid and treemap layout |
| **Name / Type / Size** | Sort files by property |
| **Hue / Bright** | Sort images by average color (appears when images are present) |
| Click sort button again | Reverse sort order |
| Click any cell | Open file in the left viewer panel |
| Drag the purple divider | Resize viewer / grid split |

## Browser Notes

- **Firefox**: Full drag-and-drop support from any context
- **Chrome / Edge**: Folder drag-and-drop works when served from HTTP. When opened as a local file (`file://`), use the Browse button instead (browser security restriction)
- Works offline, works from `file://`, works from any HTTP server

## License

Personal use only. See LICENSE file for details.
