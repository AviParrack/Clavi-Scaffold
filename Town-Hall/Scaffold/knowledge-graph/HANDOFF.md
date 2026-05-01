# Knowledge Graph — HANDOFF

**Status:** building (iteration 4 complete)
**Last session:** 2026-04-10
**Session cost:** ~$8 cumulative

## Current State

Working 3D interactive knowledge graph. Three.js + bloom + force layout + starfield. **797 nodes, 555 edges.**

**Full variant system now live:**

| Link Variants (L key) | Description |
|---|---|
| `straight` | Simple line segments (default) |
| `arcs` | Quadratic bezier curves, 16 segments each |
| `glow` | Same arc geometry, overbright colors for bloom |
| `chain` | Animated double sinusoid — two strands with π offset + rungs |
| `particles` | No lines, just brighter/larger flow particles |

| Hierarchy Variants (E key) | Description |
|---|---|
| `thin` | Low-opacity line segments (default, 0.35) |
| `dotted` | LineDashedMaterial with dash/gap |
| `gradient` | Vertex colors: bright at parent, fading toward child |

**Edge metadata in graph_data.json:** `cross_space`, `bidirectional`, `link_type` (inline/frontmatter/mixed).

## Key Files

| File | Lines | What |
|---|---|---|
| `graph_template.html` | ~2246 | The entire 3D renderer |
| `graph_builder.py` | ~300 | Walks workspace, builds JSON with edge metadata |
| `graph_render.py` | ~42 | Template + JSON → final HTML |

## What's Next

- Visual differentiation for cross-space / bidirectional edges within variants
- Final quality pass + review request

## Gotchas

- Chain variant stores per-edge animation data in `chainEdgeData[]` — `startIdx` is the vertex offset
- All variant geometries pre-built at startup; `syncLinkVariant()` / `syncHierVariant()` toggle visibility
- `updateVisibility()` iterates ALL variants to update hidden positions (y=-999 trick)
- `validHierEdges` (filtered) used everywhere instead of raw `hierarchyEdges`
- Dotted material needs `computeLineDistances()` after position updates
