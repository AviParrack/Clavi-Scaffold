---
project: knowledge-graph
status: paused
last_updated: 2026-05-01T00:20:00
note: "Marked paused 2026-05-01 during autodesk migration. Heartbeat predates the headless infrastructure; status was 'building' but no active session existed. Resume by setting status to 'building' and the next builder-manager tick will respawn. Or mark 'complete' if v4 work is shippable as-is."
---

# Builder Heartbeat: knowledge-graph

**Project:** Knowledge Graph — Interactive 3D Workspace Visualization
**Status:** paused (was building — see YAML frontmatter)
**Iteration:** 4
**Session cost:** ~$8

## Done
- [x] Read project spec + prior prototype
- [x] Assessed existing work: 439 nodes, 554 edges
- [x] v2: Starfield background, edge flow particles, hub rings, nebula halos, hover tooltip, screenshot (P key)
- [x] v3: Full 3D force layout (was 2D+jitter), collision avoidance, grid removed, color-coded edges
- [x] Search glow (pulse matching, dim non-matching), double-click zoom, watermark
- [x] Deterministic hierarchical layout (Fibonacci sphere placement, local repulsion only)
- [x] Folder nodes: wireframe icosahedra at folder seeds, sized by depth level
- [x] Hierarchy edges: parent→child folder lines (separate from file-to-file links)
- [x] Rename: "edges" → "links" (file connections), new "edges" = folder hierarchy lines
- [x] Separate toggles: L key/button for links, E key/button for edges
- [x] Polyhedra by file size: tetra (<50 lines) → octa → dodeca → icosa → sphere (1k+)
- [x] All file types scanned (797 nodes: .py, .png, .pdf, .html, .svg, .docx, etc.)
- [x] File type filter with toggle/filter dual mode
- [x] Folder click highlights all descendants
- [x] Fixed NaN bug: folder nodes missing vx/vy/vz → force sim produced NaN positions
- [x] Bumped subfolder radii [180, 75, 35, 16] — less overlap
- [x] Reduced hierarchy edge opacity to 0.35
- [x] **Link variant system**: 5 variants built — straight, arcs (bezier), glow (bloom-bright arcs), chain (animated double sinusoid), particles (flow-only)
- [x] **Hierarchy edge variants**: 3 variants — thin (default), dotted (dashed material), gradient (bright→fading)
- [x] L key cycles link variants, E key cycles hierarchy variants; Shift+L/E toggles off
- [x] UI buttons show current variant name, click to cycle
- [x] Chain animation: per-frame sine displacement, two strands with π offset, rungs at crossings
- [x] Particles mode: bigger/brighter/faster flow particles as primary visual
- [x] All variant geometries pre-built at startup, visibility synced
- [x] updateVisibility() updates ALL variant geometries (not just active)
- [x] Intro animation fades all variant materials
- [x] Edge metadata: cross_space, bidirectional, link_type in graph_builder.py (36 bidirectional, 2 cross-space)

## Current
- [ ] Visual polish pass: verify all variants render cleanly
- [ ] Consider cross-space/bidirectional visual differentiation within variants

## Next
- [ ] Final quality pass against spec success criteria
- [ ] Review request

## Blockers
- None

## Milestones sent to Avi
- v3 demo with folder nodes + hierarchy edges (Avi approved, said "holy hell soooo cool")
- Variant system brainstorm approved — Avi wants all 5 link + 3 edge variants built
- v10: full variant system implemented — 5 link + 3 edge variants, chain animation, edge metadata
