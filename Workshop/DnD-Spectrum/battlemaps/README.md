# Spectrum battlemaps

Maps are layout files in Python. The grid is exact by construction.

**House style: watercolor** (canonized by Avi, 2026-10-03). Washes, hand-inked walls, paper grain, Viridis-leaning palette. `clean` remains available.

```
pip install numpy pillow scipy
python3 pearl_tier.py        # -> out/  (watercolor + clean)
```

Each style writes a gridless VTT PNG, a gridded PNG, a GM PNG (key + A.. / 1.. coordinates), and a letter PDF at 1 inch per square.

| File | What |
|---|---|
| `bm.py` | Engine: floors, walls, doors, props, grid, exports, `check_grid` |
| `wc.py` | Watercolor style: washes, ink, finishing pass |
| `pearl_tier.py` | First map. Lore on it is placeholder, not canon |
| `airship.py` | The Whispering Web, upper + lower deck, traced on Avi's original ship map (same grid). GM-only marks go in `m.gm_extra` |

New map: copy `pearl_tier.py`, change `build()` and `KEY`. Coordinates are in 5 ft squares, x east, y south. Ground setting details in `/mnt/project-files/Spectrum/Palette-Gazetteer.pdf` (built from Avi's own sources).
