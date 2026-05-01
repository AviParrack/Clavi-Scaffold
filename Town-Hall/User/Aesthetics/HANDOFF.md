## Aesthetics

*A growing library of aesthetic context — UI/UX tools, art references, design systems, typography, color, layout. Drawn on when building websites, extensions, visualizations, publications, or anything with a visual surface.*

### Current State
- **New section**, initialized 2026-04-08
- First entry: Pretext (Cheng Lou) — DOM-free text measurement for custom layouts

### What's Here

| Tool/Resource | What it does | Status |
|---|---|---|
| [Pretext](https://github.com/chenglou/pretext) | Pure JS text measurement & multiline layout without DOM reflow. Supports all languages. `npm install @chenglou/pretext` | ⚪ Bookmarked, not yet integrated |
| [Calculating Empires](https://calculatingempires.net/) | Kate Crawford & Vladan Joler — massive deep-zoom canvas mapping tech & power since 1500. OpenLayers + tile pyramid. Minimap nav bar, monochrome aesthetic. Ars Electronica prize winner. | 🟢 Active reference for Tech Tree |
| [Historical Tech Tree](https://www.historicaltechtree.com/) | Etienne Fortier-Dubois — ~1,890 nodes, ~2,192 edges. Next.js + HTML divs + SVG curves. [MIT repo](https://github.com/etiennefd/hhr-tech-tree). Data from Airtable. | 🟢 Active reference for Tech Tree |
| [heerich.js](https://meodai.github.io/heerich/) | Voxel-to-SVG engine inspired by architect Erwin Heerich. Boolean ops (union/subtract/intersect) on voxel grids → crisp vector output. Isometric/orthographic projection, hatching, pen-plotter friendly. Mass-vs-void sculptural aesthetic. | ⚪ Bookmarked |
| [poline](https://github.com/meodai/poline) | Esoteric palette generator — HSL interpolation in cartesian space. Algorithmic color relationships, not manual picks. 1.2k stars. | ⚪ Bookmarked |
| [rampensau](https://github.com/meodai/rampensau) | Color palette generation via hue cycling + easing functions. Systematic color exploration. | ⚪ Bookmarked |
| [RYBitten](https://github.com/meodai/RYBitten) | Pseudo-RYB color mixing based on Johannes Itten's color wheel — bridges digital color with painter's logic. | ⚪ Bookmarked |
| [color-names](https://github.com/meodai/color-names) | Massive handpicked color name collection (2.9k stars). Semantic color terminology for interfaces. | ⚪ Bookmarked |
| [Framer Shader Presets](https://x.com/stfnco/status/2044768025786695971) | Nick Stepuk (@stfnco) — 10 advanced Framer shader presets for websites. Deep-dive on pushing Framer's shader system, glorious visual effects. | ⚪ Bookmarked |
| [Mount Inc — paint-to-explore navigation](https://x.com/aurelien_gz/status/2047049673538465940) | @mount_inc — instead of scrolling, you *paint* over a canvas to reveal and navigate content. Flagged by Aurelien Gasse as "the most innovative navigation I've seen in a while." Same studio built the Mother's Day page featured on threejs.org homepage ([Diego Ramos reply](https://x.com/zdiegoramos/status/2047053942987583953)). Good reference for cursor-as-tool UX, WebGL-driven exploration, replacing linear scroll with spatial reveal. | ⚪ Bookmarked |

### What's Next
- Build out references: color systems, type scales, layout grids, animation patterns
- Evaluate for the user's personal sites and any org-branded surfaces they maintain
- Collect UI/UX patterns that work well with Claude-generated interfaces

### Design Philosophy (to develop)
- Accessible by default (WCAG AA minimum)
- Works without JavaScript where possible
- Typography-first — get the text right, everything else follows
- Outputs should feel warm, rigorous, and slightly surprising
