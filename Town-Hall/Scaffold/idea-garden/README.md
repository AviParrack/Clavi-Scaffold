# Idea Garden

Watch your knowledge grow. Visualize your Obsidian notes as 3D L-system plants — clusters of related notes become living organisms with trunks, branches, and leaves.

Fully standalone — single HTML file, no build step, no server. Works offline (except for optional Gemini API features).

## Files

```
idea-garden-v1/
  garden.html     — the app (open in a browser)
  title-2.png     — setup screen logo
  title-small.png — top bar logo
```

## Quick Start

1. Open `garden.html` in a modern browser
2. Select your Obsidian vault or notes folder
3. Plants grow automatically from your note clusters

## Features

- **L-system plants** — note clusters rendered as procedural 3D plants using Three.js
- **Two grouping modes** — organize by subfolder or by frontmatter tag
- **Adaptive clustering** — K-means with silhouette-based auto-K finds natural groupings
- **Gemini embeddings** — uses `gemini-embedding-001` for semantic similarity
- **Cross-pollination** — optional LLM-powered idea connections between plants (requires Gemini API key)
- **Interactive** — hover leaves for titles, click for note details in side panel
- **Side tags** — color-coded labels with leader lines linking to plants
- **Pollen system** — animated particles drift between related plants
- **Timeline scrubber** — filter notes by date
- **Theme system** — multiple color themes
- **VFX config panel** — tweak colors, sizes, bloom, and effects at runtime
- **IndexedDB caching** — re-open instantly without re-processing
- **Keyboard shortcuts** — `H` resets camera, `P` pauses pollen, `V` opens VFX panel

## Requirements

- Modern browser with WebGL support
- A folder of Markdown notes (Obsidian vault recommended)
- Gemini API key (optional, for cross-pollination features)

## Browser Support

Requires WebGL. **Chrome or Edge recommended** — the File System Access API used for folder selection has limited support in Firefox and Safari.
