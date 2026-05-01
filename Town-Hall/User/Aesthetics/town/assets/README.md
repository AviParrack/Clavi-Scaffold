# Claude Town — Asset Overrides

Drop PNGs here to override procedural sprites. The loader in `index.html`
(see `EXTERNAL_MANIFEST`) maps manifest keys to paths. Add an entry and drop
the PNG; the game will use it instead of the procedural fallback.

## Manifest keys

| Key           | Purpose                         | Procedural fallback dimensions |
|---------------|---------------------------------|-------------------------------:|
| `grass`       | ground tile                     | 64×32                          |
| `path`        | ground tile                     | 64×32                          |
| `water`       | ground tile (animated)          | 64×32                          |
| `stone`       | ground tile                     | 64×32                          |
| `sand`        | ground tile                     | 64×32                          |
| `plank`       | floor tile                      | 64×32                          |
| `tree`        | prop                            | 64×96 (anchor bottom-center)   |
| `fountain`    | prop (animated)                 | 128×96                         |
| `computer`    | library terminal (interactive)  | 36×44                          |
| `forge`       | workshop (animated)             | 44×56                          |

## Recommended open packs (CC0)

- **Kenney — Isometric Tiles** — https://kenney.nl/assets/isometric-tiles
- **Kenney — Isometric City** — https://kenney.nl/assets/isometric-city
- **Kenney — Isometric Buildings** — https://kenney.nl/assets/isometric-buildings-1
- **Kenney — Isometric Miniature Dungeon** — https://kenney.nl/assets/isometric-miniature-dungeon

All Kenney assets are CC0 (public domain) — free for any use.

## Adding an asset

1. Download a pack and drop the PNG files you want into `town/assets/`.
2. Open `index.html`, find `EXTERNAL_MANIFEST` near the top of the script.
3. Uncomment the matching line and point it at your file, e.g.:

   ```js
   const EXTERNAL_MANIFEST = {
     grass: 'assets/kenney/grass_iso.png',
     tree:  'assets/kenney/tree_pine.png',
   };
   ```

4. Reload. The corner badge changes from `procedural` to `ext:N loaded`.

## Notes for replacing character sprites

Characters use a 4-direction × 4-frame grid. If you drop in an LPC-style
sheet, adjust `makeCharacter` to blit frames from the sheet instead of
drawing procedurally. The direction order used here is: `0=SE, 1=SW, 2=NW, 3=NE`.
