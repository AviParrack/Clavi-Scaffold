# Pocket Orbit v4: Mochi (tunnels, Downtown, outposts)

*Design doc for the **mochi** implementer (`terrain.js` and a new `mochi.js`). Also read by **econ** (shop objects), **eva** (walking, air, the lift), **aliens** (where NPCs stand), **look** (props, lights, map marks) and **ship** (landing on plinths).*
*Every number here was measured or computed with the real code, not guessed. Prototypes ran the real `terrain.js` and `eva.js` in Node through `tests/harness.js`, and the real renderer in chromium for 15 screenshots. Scratch scripts are in `/tmp/claude-0/v4-mochi/` (`town.js`, `proto.js`, `gates3.js`, `props.js`, `bench.js`, `sites.js`, `hops.js`). Reference code is in [Appendix A](#appendix-a-reference-code-data-carve-plinth-lift-spots) and [Appendix B](#appendix-b-reference-code-prop-art).*

> **Integrated by [V4-CONTRACT.md](V4-CONTRACT.md)** (binding for stage 2). Changed here: the main pad is **not** hardened (it sat on the Pantry roof and left no ore for the first dig); the carver lays an **ice seam** under the pad instead (§4.3 step 4, Appendix A). Script order is `… combat, haul, mochi, npcs, render`, and carvers register only when the module is active. Fries call `EVA.topUp(g, false)`. Aliens places the shop keepers as named extras (contract §5.2). Verified in a scratch copy with Appendix A wrapped as a module and the town carved: core 52/52 (after the contract's test_core patch; 50/52 without it), physics 45/45, and the v3 playtest's pad-mining check passes (40 kg of ice).

---

## 0. TL;DR: what to build

- **Downtown**: a small town carved into Mochi at build time, straight under the launch pad. It has 3 floors, 8 named chambers, 3 streets, a stair, a lift and a skylight, with the unlined **Old Workings** below them. It is fully deterministic: the same seed always gives the same town. The carve runs once at load and takes under 0.1 s.
- **Murk-stone** (`wall`): a new unbreakable material. It lines every town passage, so lasers, bombs and crashing rocks cannot break into or out of Downtown. A `fixed` flag in `Terrain.dig` makes this work. Without the flag, a hardness of Infinity still breaks after 255 calls; I measured 38 lining cells lost in 260 digs.
- **The Clunk Lift** is a real lift. Its deck is a 1-cell-thick row of `deck` cells that `mochi.js` rewrites half a metre at a time, and the astronaut rides it with the unchanged `eva.js` physics: 0 airborne frames, 0 damage, 3 m/s. Gates (more cells) close the shaft on every floor where the car is not.
- **Spots for aliens**: `Mochi.spots(g)` returns 18 standing places. It uses every lore role id unchanged (`pad`, `outpost-ice`, `outpost-iron`, `market`, `canteen`, `gallery`, `cellar`, `archive`, `skylight`) and adds `guild`, `shrine`, `workings`, `lift`, `guide`, `pump9`, `pitstop`, `forge`, `brinepit`.
- **Three surface outposts** on 50 m Murk-stone plinths, all west of the pad and each a longer hop than the last: **Frostbite Flats** (ice, Foreman Okra), **Clank Rig** (iron, repairs), **Pump 9** (cheapest fuel in the system, next to the Lithobraker). **Rock Garden** is a stretch goal.
- **Three belt outposts** on 24 m slabs, built from the same code on other rocks: **Pretzel Pit Stop** (fuel, the pirate-free starter hop), **Annie's Forge** on Waffle (cheap repairs), **The Brine Pit** on Pickle (Mad Marge's black market).
- **Every shop** is opened with `Econ.openShop(g, {id, name, kind, keeper, blurb, buy, tabs, fuelMult, repairMult})`. Econ needs no change.
- **Small terrain.js patches**: a carver registry, `fixed` materials, zone-aware save, warm backwall colours in town, darker crater rims, `CACHE_MAX` raised to 320, and one shared ImageData.

---

## 1. Mochi: identity and the lore hook

Mochi was Ceres in v3. Ceres belongs to our asteroid belt and this is an alien system, so it was renamed (Avi's v3 feedback). Mochi is round, pinkish-white (`#e9cfe0`) and looks squishy. It is not squishy; Pilot Gus can confirm, or rather his crater can.

**Why it is the capital** (all from the v4 config):
- It is the biggest body in the Crumb Belt: R 300 m, g 2 m/s². Its Hill sphere is 4.0 km, the only one big enough to keep a station (Mochi Hub, 420 m) and three moons (Dorito, Kiwi, Seed).
- It is full of ice: 90 ice blobs at 1-14 m depth and 45 iron blobs at 2-16 m, with salt gems.
- It is where everyone lives:
  - The **Murk** dug it first and call it **Home-Under**.
  - The **Pipkins** built the Hub, the pad and the kiosk, then moved into the Murk's tunnels and put up signs.
  - The **Oggles** cook. The Survey **Bots** keep the archive. The **Crustlings** were in the walls before anyone: "I am... the wall" (Grandpa Gneiss).

**The town is called Downtown** because it is down. The first sign you see, at the top of the West Stair, says `DOWNTOWN ↓` and is correct. The rest are a running joke from lore: "We dug the first tunnels. The Pipkins put up the signs. **The signs are wrong.**" (Mumble). Some Pipkin signs point the wrong way. Each wrong one has a Murk touch-dot plaque under it that is right, and a translator reveals it (section 7).

**Physics easter eggs** (both true in the game's own gravity model):
- **You weigh 16% less in the Cellar.** Inside the deepest valley, `World` uses a uniform core, so g ∝ r (the shell theorem). A sign in the Cellar says `YOU WEIGH 16% LESS DOWN HERE. NEWTON SAYS HI.` Jumps are higher too (section 2).
- **High noon in the Skylight.** Mochi does not spin, so Ember crosses its sky once per lap: 1 day = 6,491 s = 108 min. Once per day Ember stands straight over the Skylight's shaft and a sunbeam falls onto Sizzy's telescope for about 3.7 minutes (section 6.4). This sets up UNIT-7's line "1 DAY = 108 MINUTES".

---

## 2. The numbers

**Mochi**: μ = 180,000 m³/s², R 300, deepest valley Rc = 295.63. The pad is at θ = π/2, surface r ≈ 297.2. At the surface: v_circ 24.5 m/s, v_esc 34.6 m/s.

**Gravity by depth.** Outside Rc, g = μ/r². Inside Rc, g = μ·r/Rc³. The jump apex is JUMP_V²/2g with JUMP_V = 3.

| level | r (m) | depth under the pad | g (m/s²) | vs the pad | jump apex (m) |
|---|---|---|---|---|---|
| Pad (surface) | 297.2 | 0 | 2.038 | 0 | 2.21 |
| F1 Main Street | 284 | 13.2 | 1.979 | -2.9% | 2.27 |
| F2 Low Street | 266 | 31.2 | 1.853 | -9.1% | 2.43 |
| F3 The Cellar | 246 | 51.2 | 1.714 | **-15.9%** | 2.63 |
| Old Workings (deepest cave) | 214 | 83 (floor 86.4) | 1.491 | -26.8% | 3.02 |

**Falls.** Inside Downtown, the longest drop you can step off is the Skylight hole: 13 m from the surface to the Skylight floor. You land at 7.0-7.5 m/s, under eva's FALL_HURT of 8 m/s, so the Skylight doubles as an express way in (measured). A fall down the lift shaft from the surface to the Cellar would be 51 m, about 14 m/s, which is why the shaft has gates.

**Hops to the outposts.** These are minimum-energy ballistic hops between two surface points of a sphere: v² = (μ/R)·2 sin(φ/2)/(1 + sin(φ/2)). They are ideal (no gravity loss). Flight time and angle come from integrating the hop.

| outpost | θ | arc from the pad | hop speed | one way (launch + land) | flight time, launch angle |
|---|---|---|---|---|---|
| Rock Garden (stretch) | 1.951 | 113 m west | 13.8 m/s | 28 m/s, or walk it | 12 s, 40° |
| Frostbite Flats | 2.471 | 267 m west | 19.1 m/s | 38 m/s | 21 s, 32° |
| Clank Rig | -2.940 | 527 m west | 22.9 m/s | 46 m/s | 32 s, 20° |
| Pump 9 | -1.740 | 883 m west | 24.5 m/s (orbital!) | 49 m/s | 38 s, 2° |

Pump 9 is almost at the antipode, so getting there means flying half of a skim orbit. The stock Prospector carries 394 m/s in v4 (progression §1), so even Pump 9 and back (98 m/s ideal) is a quarter of a tank. Note the irony, which is intended and worth a Sizzy line: hopping across Mochi's surface (38-49 m/s) costs **ten times** more than a transfer between lanes (2-4 m/s). Small worlds are expensive to walk around and cheap to leave.

---

## 3. Downtown: the layout

### 3.1 Coordinates (use these everywhere)

- **x** is metres **east** of the pad, measured along the floor arc of radius r. East means the clockwise direction, the screen-right side of the pad when the pad is at the top. Its angle is `θ = π/2 − x / r`.
- **r** is the floor radius. Floors are **level**: a floor has constant r, so it is perpendicular to local up everywhere.
- **Prop frame**: `translate(r cosθ, r sinθ); rotate(θ − π/2)`. In this frame +x is east and +y is local up, in metres. The world transform is y-up, so text needs `scale(k, −k)`.

### 3.2 Cross-section (not to scale; Downtown is about 155 m wide and 90 m deep)

```
 x:  -66    -44  -35        -13.5    0    14  19-23   25   41 46    66 71  77 84
r297 ~~~~~~~~\West\~~~~~~~~~~~[======= PAD =======]~[LIFT]~~~~~~~~~~~~~~~~~~~~~~(sky)~~
               \Stair\                               |  |                       ||
r284  F1         \____\[  THE PANTRY  ]==Main=Street=|##|=[NOODLE]=[DIG HALL]=[SKYLIGHT]
                                                     |  |
r266  F2 [SHRINE][======== ECHO GALLERY ========]=Low=Street=|  |=[QUIET NOOK]
                                                     |  |
r246  F3                 [===== THE CELLAR =====]=Cellar=Row=|  |
                        /Old Workings ramp                   (## = lift deck, | = shaft)
r236                 __/
r232-214     (o)  (o)  (o)  (o)  (o)    <- Old Workings: 5 unlined caves, diggable walls
```

### 3.3 Zone tables

**Floors.** F1 r 284, F2 r 266, F3 r 246. Streets are 3.5 m tall.

**Streets** (flat-roofed passages; everything above r is clear up to r + h; all air):

| id | name | floor r | x range (m) | θ range | clear h | length |
|---|---|---|---|---|---|---|
| `main` | Main Street | 284 | -13.5 .. 84 | 1.6183 .. 1.2750 | 3.5 | 97.5 |
| `low` | Low Street | 266 | -64 .. 38 | 1.8114 .. 1.4279 | 3.5 | 102 |
| `deep` | Cellar Row | 246 | -30 .. 17.4 | 1.6927 .. 1.5001 | 3.5 | 47.4 |

**Rooms.** A room is a vault on a flat floor with a superellipse roof: `r − rf ≤ h·(1 − u^p)^(1/p)`, where u = |Δθ| / half-width. A high p gives a boxy hall; p = 2 gives a dome.

| id | name | lore role | floor r | x range | θ range | h | p | air | top r |
|---|---|---|---|---|---|---|---|---|---|
| `pantry` | The Pantry | `market` | 284 | -13.5 .. 14 | 1.6183 .. 1.5215 | 9 | 4 | yes | 293 |
| `noodle` | The Noodle Hole | `canteen` | 284 | 25 .. 41 | 1.4828 .. 1.4264 | 6 | 4 | yes | 290 |
| `dighall` | The Dig Hall | `guild` | 284 | 46 .. 66 | 1.4088 .. 1.3384 | 7.5 | 3 | yes | 291.5 |
| `skylight` | The Skylight | `skylight` | 284 | 71 .. 84 | 1.3208 .. 1.2750 | 7 | 2.5 | **no** | 291 |
| `shrine` | The Crumb Shrine | `shrine` | 266 | -64 .. -48 | 1.8114 .. 1.7512 | 10 | 2 | yes | 276 |
| `gallery` | Echo Gallery | `gallery` | 266 | -50 .. 8 | 1.7588 .. 1.5407 | 5.5 | 8 | yes | 271.5 |
| `nook` | The Quiet Nook | `archive` | 266 | 24 .. 38 | 1.4806 .. 1.4279 | 5 | 4 | yes | 271 |
| `cellar` | The Cellar | `cellar` | 246 | -30 .. 12 | 1.6927 .. 1.5220 | 7 | 3 | yes | 253 |

**Ramps.** The floor radius is linear in θ. A slope of 0.5 or less walks as stairs.

| id | name | top end (x, r) | bottom end (x, r) | slope | length | air | lined |
|---|---|---|---|---|---|---|---|
| `weststair` | West Stair | (-44, 297.6), θ 1.7186 | (-13.5, 284), θ 1.6183 | 0.446 | 33.4 m | no | yes |
| `workings0` | Old Workings | (-30, 246), θ 1.6927 | (-52, 236), θ 1.7911 | 0.455 | 24.2 m | no | **no** |

**Shafts.** A shaft is a vertical slot `|Δθ|·r ≤ w/2`.

| id | θ | x at F1 / surface | width | r range | what |
|---|---|---|---|---|---|
| `lift` | 1.5001 (= π/2 − 21/297.2) | 20.07 / 21.00 | 4.0 | 245.5 .. 301.5 | the Clunk Lift (deck 3.5 m wide) |
| `skyhole` | 1.2979 (= π/2 − 77.5/284) | 77.5 / 81.1 | 3.0 | 289 .. 302 | the Skylight's hole to the sky |

**Old Workings caves.** Wobbly ellipses: `u² + v² ≤ (1 + 0.18 sin(5·atan2(v, u) + x))²`. They are unlined and dark, the miners' bit. Their walls are ordinary regolith and ore, so you can dig here.

| x | r | rx | ry | θ |
|---|---|---|---|---|
| -58 | 232 | 7 | 3.5 | 1.8208 |
| -66 | 226 | 6 | 3 | 1.8628 |
| -55 | 222 | 8 | 3 | 1.8185 |
| -44 | 217 | 6 | 2.8 | 1.7736 |
| -62 | 214 | 5 | 3.2 | 1.8605 |

### 3.4 Entrances

1. **The West Stair.** Its mouth is a slot in the surface at x -44 .. -35, 30 m west of the pad. It walks down at slope 0.446 into the west end of the Pantry, through an airlock prop at x -14.5. It is the walk-in way and needs no machinery.
2. **The Clunk Lift.** The lift house straddles x 18.5 .. 23.5 east of the pad. Its stops are Surface (297.5), Main Street, Low Street and The Cellar.
3. **The Skylight hole.** A 3 m hole at x ≈ 81 east (surface arc). Jump in and you land 13 m down at about 7.2 m/s, which does no damage. It is a one-way express; there is no ladder out, so walk or ride back.

### 3.5 Sizes checked against the 0.5 m cells and eva.js

| eva number | value | Downtown rule | check |
|---|---|---|---|
| head top above the feet | 1.58 m | streets 3.5 m clear, rooms 5-10 m | 1.9 m of headroom in streets; a jump in a street bumps the ceiling harmlessly |
| STEP_H auto step-up | 0.6 m | level floors become 0.5 m cell staircases where the arc crosses rows | 0.5 < 0.6, measured walkable both ways |
| ramps | | slope ≤ 0.5 | West Stair 0.446 and Workings 0.455, walked down and up |
| SNAP ground follow | 0.55 m | the lift deck moves in 0.5 m steps | 0.5 < 0.55: the walker never leaves the deck (0 airborne frames) |
| body width | 0.9 m (2 × FOOT_R) | shaft 4 m, deck 3.5 m | plenty |
| tether FAR_WARN / FAR_MAX | 120 / 150 m from the hull | farthest carved cell from a Prospector parked on the pad | **114.1 m** (Old Workings): the whole town works with no eva change |
| O2 | 150 s | the longest walk, surface to the Skylight | 40 s |

**The 2D rule** (for anyone adding chambers later): the game is a cross-section, so a walkable route cannot double back over itself without a ramp or a lift. Every stacked pair of passages needs its own 3.5 m of clearance plus at least 1 m of rock between them, because the lining is 1 m on each side. Downtown uses the lift for vertical travel and keeps ramps for the two ends.

### 3.6 Measured walks and rides (real eva.js, seed 7)

| route | time | damage |
|---|---|---|
| surface, down the West Stair, the Pantry, Main Street to the Skylight (x -52 → 80) | 40.1 s | none |
| the same, back and up the stair | 41.4 s | none |
| Low Street end to end (Shrine → Gallery → across the lift deck → Nook), each way | ~31 s | none |
| Cellar Row → the Cellar → down the Old Workings ramp | 19.6 s | none |
| the Old Workings ramp back up into the Cellar | 17.3 s | none |
| lift Surface → Main Street / Main → Low / Low → Cellar / Cellar → Surface (3 m/s) | 6.5 / 8.0 / 8.7 / 19.1 s | none; 0, 0, 0 and 1 airborne frames |

---

## 4. Carving it

### 4.1 New materials (append to `MATS`; existing ids do not move)

| id | col [base, shade, hi] | use |
|---|---|---|
| `wall` (Murk-stone) | `#a99cc8 #6f6496 #d9d0f2` | town lining, lift gates, the lift-house roof |
| `slab` (pad concrete) | `#cfc6b8 #8f8577 #f2ece2` | outpost plinths and belt slabs (the main pad stays regolith, see §4.3) |
| `deck` (lift steel) | `#ffd166 #c9961f #fff3c4` | the lift car's floor |

Each is `{ id, hard: Infinity, kg: 0, fixed: true, col }`. The bake already draws any `m > REG` with `MATS[m].col`, including the speckle highlight and the ink edge against regolith, so they look like toon stone with no bake change. The screenshots confirm that the lilac lining reads as carved Murk-stone. `fixed` means:
- `dig` skips the cell (no wear, no break).
- `restore` never turns it into DUG.
- It is still solid for `collideCircle` and `raycast`, so lasers stop on it.

### 4.2 Zones: one byte per cell

`T.zone = new Uint8Array(N*N)`: 0 is rock, otherwise it is an index + 1 into `T.zones = [{ id, name, kind, air, lit, rf }]`. It costs 1.56 MB, on Mochi only. Every carved cell is tagged. The zone byte drives:
- the HUD label "You are in: The Pantry" (one array read under the astronaut);
- `Mochi.airAt(g, x, y)` (section 6.1);
- warm backwall colours in the bake for lined (`lit`) zones;
- the save: carved cells are part of the build and must **not** go into the snapshot. The lift deck and gates are also rewritten at runtime, and a restore that turned them into DUG would leave a hole in the lift.

### 4.3 The carve algorithm

The carve runs **once, inside `build()`**, after ores and gems and before `has` is computed. It uses no random numbers, so other bodies and the ore layout are unaffected and the town is identical on every load.

1. **Region loop.** Each primitive gives a polar box (θ0..θ1, r0..r1). Turn it into a cell bounding box, then for each cell compute (r, θ) and run the primitive's test. Cells that pass become DUG and get the zone tag.
   - **Street**: `rf ≤ r ≤ rf + h` inside the θ range.
   - **Room**: superellipse vault on the floor rf.
   - **Ramp**: `rf(θ) = ra + s·(rb − ra)` with `s = (θ − θa)/(θb − θa)`; then `rf ≤ r ≤ rf + h`.
   - **Shaft**: `|Δθ|·r ≤ w/2`.
   - **Cave**: wobbly ellipse in (arc, r) space.
2. **Lining.** Every solid cell within 2 cells (`di² + dj² ≤ 5`) of a cell in a *lined* zone becomes `wall`. That is the 1 m Murk-stone skin. Caves and the Workings ramp are unlined.
3. **Lift house.** The roof is `wall` cells at r 301.5 .. 302 over |off| ≤ 2.5 m. The gates are added at runtime (section 5).
4. **Main pad: an ice seam, not a slab.** *(Contract §9 #4.)* The Pantry's vault top is 3.2 m under the pad, so hardening the pad 3 m deep turned v3's first-dig spot into stone: the playtest's ore search right after E on the pad found 0 ore cells (15 in v3), and the mine job's first laser would CLINK. The lining already stops any crater 3.2 m down, so the pad stays diggable. Instead, every regolith cell within ±8 m of θ = π/2 and 0.5-2.5 m under the surface becomes `ice` (`seam()` in Appendix A): 128 cells, 640 kg, about what v3 had there (108 ore cells). The shape does not change. Measured in the scratch copy: the nearest ice is 1.5 m under the astronaut after E, and the v3 playtest's laser fills the pack (40 kg).
5. **Gems.** Drop any gem whose cell is now DUG (zone) or `fixed`, so no free salt lies about in the streets.
6. **`has`.** Recompute it for every chunk with the existing `chunkHasContent`. The prototype first set every chunk to has = 1 and dirty; that thrashed the 220-chunk cache and the town never drew. Lesson learned.
7. **Log** once: `mochi carve: 8499 dug (2125 m2), 2794 lined, 20 zones, 205 content chunks, 32 ms`.

Carved cells by kind, counting each cell for the first primitive that dug it (streets go first): street 3,474; room 2,330; cave 1,265; shaft 778; ramp 652 (total 8,499). The lining is 2,794 cells and the pad's ice seam 128. These numbers come from running Appendix A as written.

### 4.4 terrain.js patches (exact)

```js
// ---------------- carvers ----------------
const CARVERS = {};                                   // bodyId -> [fn(T, b)]
function addCarver(id, fn) { (CARVERS[id] = CARVERS[id] || []).push(fn); }

// in build(), after the gems block, before the has loop:
for (const fn of CARVERS[b.id] || []) fn(T, b);

// MATS: append
{ id: 'wall', hard: Infinity, kg: 0, fixed: true, col: ['#a99cc8', '#6f6496', '#d9d0f2'] },
{ id: 'slab', hard: Infinity, kg: 0, fixed: true, col: ['#cfc6b8', '#8f8577', '#f2ece2'] },
{ id: 'deck', hard: Infinity, kg: 0, fixed: true, col: ['#ffd166', '#c9961f', '#fff3c4'] },

// dig(): skip fixed cells (count them so eva can say CLINK)
if (m < REG) return;
const M = MATS[m]; if (M.fixed) { out.fixed = (out.fixed || 0) + 1; return; }

// scan(): carved cells are part of the build, never saved
const Z = T.zone;
if (G[k] !== DUG || (Z && Z[k])) continue;
const k0 = k; while (k + 1 < G.length && G[k + 1] === DUG && !(Z && Z[k + 1])) k++;

// restore(): never undo the build
if (G[k] < REG || MATS[G[k]].fixed || (T.zone && T.zone[k])) continue;

// bake(): warm lamplit backwall inside lined zones (T.townBack set by the carver)
if (sol < 0.5) {
  const zi = T.zone ? T.zone[Math.min(N - 1, Math.max(0, Math.round(v))) * N + Math.min(N - 1, Math.max(0, Math.round(u)))] : 0;
  const lit = zi && T.zones[zi - 1].lit, bk = lit ? T.townBack : back, bk2 = lit ? T.townBack2 : back2;
  col = sol > 0.28 ? INK_RGB : sol > 0.14 ? bk2 : bk;
}
// bake(): darker exposed crater rims (progression ask): after the ore/ink block
if (!col && dug && sol < 0.9) { col = INK_RGB; al = 110; }

// cache: Mochi alone has 205+ content chunks; 220 thrashes when it fills the screen
const CACHE_MAX = 320;
// bake(): one shared ImageData instead of one per cache entry (halves the cache memory)
let IMG = null;  // in bake: IMG = IMG || e.c2.createImageData(S, S); ... e.c2.putImageData(IMG, 0, 0);

// export
addCarver, CARVERS,
```

The town colours are `T.townBack = [94, 71, 99]` and `T.townBack2 = [122, 95, 122]`, a warm lamplit plum. They were checked in screenshots against the cold cave `back` that the Old Workings keep.

---

## 5. The Clunk Lift

**Why a real lift.** In a cross-section, a vertical town needs vertical travel. A teleport would break the toy-physics promise. A deck made of terrain cells needs **no eva change**: eva's own collide push-out and its 0.55 m ground snap carry the astronaut, which I verified with the real `eva.js`.

### 5.1 How it works

- **State**: `{ r, target, v, q, cells, gates, orig }`. Here `r` is the deck-top radius (float), `q = round(r / 0.5)·0.5` is the drawn and solid position, and `cells` are the current deck cells.
- **Motion** (`step`, 240 Hz): a trapezoid with vmax **3 m/s** and acc **1.5 m/s²**, `want = sign(d)·min(vmax, √(2·acc·|d|))`. When q changes, the old deck cells revert to DUG and the new ones (r in [q − 0.5, q), |off| ≤ 1.75 m, about 8 cells) become `deck`. The touched chunk is marked dirty. That rewrite is the **CLUNK**, every 0.5 m.
- **Gates.** On every stop where the deck is not parked, a 0.5 m column at each shaft edge (2.0 < |off| ≤ 2.5) becomes `wall`. On streets it spans r ∈ [f, f + 3.5); at the top it spans [296.5, 301.5), which forms the lift-house sides. The original value of each cell is kept in a Map and put back when the gate opens. The gates sit in the street, just **outside** the shaft. My first version put them inside the shaft; that made a ledge, and the rider caught on it at 3 m/s and was dropped at r 269.5 (measured, then fixed).
- **Auto-call (dummy-proof).** If the lift is idle for 3 s and the astronaut is in Downtown on a stop's floor, or on the surface within 8 m of the lift house, but not on the deck, it goes to that floor. Main Street is split by the shaft, so this keeps the bridge there by the time you walk up.
- **Riding.** You are "on the deck" when grounded with the feet within 1.75 m of the shaft axis and within 1 m of q. While on it:
  - **F**: next stop downward, or Surface from the Cellar.
  - **1-4**: go to that stop. These are consumed in `onKey` only while you are on the deck.
  - At a landing next to the shaft: **F** = Call the lift.
- **Popups.** `CLUNK!` on arrival, a small `ka-chunk` every 4 m, and the lift-house lamp turns green when the car is up.
- **Sleep.** When nobody is within 150 m of Downtown, `step` does nothing. The lift is not saved: it resets to the Surface stop. The `tunnels` spawn sets it to Main Street.

### 5.2 Stops and times (t = d/v + v/a for d ≥ 6 m, which matches the measurements)

| key | stop | deck r | from Surface | from Main St | from Low St | from Cellar |
|---|---|---|---|---|---|---|
| 1 | Surface | 297.5 | | 6.5 s | 12.5 s | 19.1 s |
| 2 | Main Street | 284 | 6.5 s | | 8.0 s | 14.7 s |
| 3 | Low Street | 266 | 12.5 s | 8.0 s | | 8.7 s |
| 4 | The Cellar | 246 | 19.1 s | 14.7 s | 8.7 s | |

Verified with the real eva at 3 m/s, both with the prototype and with Appendix A's code as written: 0 HP lost on any ride, at most 1 airborne frame (at the top arrival), feet within 0.12 m of the deck top on arrival. Walking into a closed gate stops you 0.9 m short of the shaft, on the surface and on Main Street. A jump at a closed gate does not get over it: the gate is 5 m tall at the top and the 0.5 m roof caps it. The 2 m/s, 1 m/s² variant also passes everything, at F3 → F1 21.0 s.

### 5.3 HUD

While you are on the deck or within 5 m of a landing, draw a small `kit.stackRight` panel titled `CLUNK LIFT`. It shows four rows (`1 Surface · 2 Main Street · 3 Low Street · 4 The Cellar`), with the car's stop in mint, the target blinking, and the speed `▼ 2.8 m/s`. Operator Clunk (an Oggle, who stands at the `lift` spot) gets the joke: the lift is named after him, or he after it. Nobody remembers which.

---

## 6. Air, light and look

### 6.1 Air

The Pantry, the Noodle Hole, the Dig Hall, the Shrine, Echo Gallery, the Quiet Nook, the Cellar and all three streets are pressurised (`air: true`). The stair, the shaft, the Skylight (it has a hole in the roof) and the Old Workings are not.
- **MVP**: air is a flag only. NPC spots carry it, so Pipkins, Murk and Oggles go helmetless indoors (lore). The astronaut keeps the helmet on. Because the farthest carved cell is 114 m from the parked ship, the tether and O2 already work.
- **Ask eva (optional, feature-detected)**: `if (typeof Mochi !== 'undefined' && Mochi.airAt(g, A.x, A.y)) { m.o2 = Math.min(g.S.o2, m.o2 + 10 * simDt); /* skip FAR_WARN */ }`. That is one line. `airAt` is a single zone-byte read.

### 6.2 The backwall and the lining

- Lined zones use the warm backwall (plum `[94,71,99]` / `[122,95,122]`). The lining's ink edge draws a crisp tunnel outline at every zoom of 0.9 px/m and up.
- From the ship at 2-4 px/m, Downtown reads as an **ant farm** under the pad (screenshot 11): lilac outlines, the lift shaft, three streets and the dark Workings.
- The Old Workings keep the body's cold cave colour on purpose. The contrast says "you left town".

### 6.3 Props (toon recipe, drawn in the floor frame, only at zoom ≥ 1.2 px/m and inside the view)

**The recipe** (every prop): fill the path in the **shade** colour, clip, shift by the key light × k and fill the **base** colour, add an optional **highlight** blob, then stroke with ink `#1b1433` at 2.5 px. Indoors the key light is fixed at L = (-0.55, 0.83), upper left in the prop frame, because the lamps light the town. Outdoors (outposts) use `kit.LIGHT`, and at night (`dot(up, LIGHT) < 0.1`) portholes and edge lights glow. Text uses Fredoka 700 at `scale(k, −k)`. The helper is in Appendix B.

| prop | size (m) | look | animation |
|---|---|---|---|
| `lamp` | shade 0.64 wide, hung from a ceiling at height h | orange cone shade, cream bulb, warm radial glow r 3.2 (`255,214,140`, a 0.42) | slow sway ±0.04 rad |
| `stall` | 3.0 × 2.85 | wood counter, two posts, scalloped two-colour awning, 3-4 goods (ore/gem dots), sign plate (English or glyphs) | none |
| `sign` | post 1.8, board 2.4 × 0.75 | yellow board, ink text, orange arrow | none |
| `plaque` | 1.2 × 0.5, on the wall under a sign | lilac stone, raised touch-dots from `Npcs.script('murk', word)` (feature-detected; fallback dots) | none |
| `mapBoard` | 2.6 × 1.8 on two legs | cream board, the town's cross-section in ink, a pulsing red YOU ARE HERE dot | dot pulse |
| `door` | round, R 0.95 | Pipkin round door, blue planks, brass knob, porthole window | none |
| `crates`, `pipe`, `beam`, `cart` | 1-6 | wood crates; a lilac ceiling pipe with brackets; a timber frame; a tipped mine cart on a rail with ore lumps | none |
| `noodle` | counter 6 × 1.1, neon at +3.6 | orange counter, four pink stools, **neon noodle bowl with chopsticks**, `NOODLE HOLE` | neon flicker `0.75 + 0.25 sin 7t sin 3.1t` |
| `liftHouse` | 5.4 × 4.2 + roof 1.2 | lilac walls (they are the gate cells, drawn over), orange roof, `LIFT ↓` plate, red/green lamp | lamp green when the car is up |
| `cage` | 3.5 × 2.5 | yellow rails and roof, hatched mesh, two cables to the top, a little lamp | moves with the deck (draw at q) |
| `airlock` | 0.7 × 3.5 | hazard-striped frame across the street, `AIR` label, mint/indigo light | light blinks 1.4 s |
| `scope` | tripod 1.4, tube 2.4 | blue telescope pointed up the skyhole, brass eyepiece | none |
| `idol` | boulder 3.2 × 2.9 | the **Elder Crumb**: a sleepy lumpy boulder face with four candles | candle flicker |
| `drape` | 6-9 wide | Cellar swags in plum, a violet lantern | lantern sway |
| `drip` | sign 3.0 | `MIND THE DRIP` sign with a falling drop | drop falls every 1.4 s |

**Placement** (x m east of the pad, floor r; from the prototype that was screenshotted):

| where | props |
|---|---|
| surface | sign `DOWNTOWN ↓` at x -48 (arrow pointing east into the stair); mapBoard -46; liftHouse 21 |
| West Stair foot | airlock -14.5 (F1) |
| The Pantry (F1) | lamps -10 (h 7.0), -3 (8.6), 4 (8.6), 11 (6.6); stall `GEMS` -8; glyph stall -1.5; round door 4.5; stall `SNACKS` 9.5; pipe -12..13 at 8.2; crates 15.5; mapBoard -11 |
| Main Street | sign `NOODLES ←` at 18 (**wrong**, plaque under it); sign `DIG HALL →` 44; sign `SKYLIGHT →` 68 |
| The Noodle Hole | noodle 33; lamps 28, 38 (h 5.6) |
| The Dig Hall | lamps 52, 60 (h 7); a rack of drills (stretch) |
| The Skylight | scope 76; the noon beam (6.4) |
| Low Street (F2) | idol -56 with lamps -52, -60 (h 8); gallery lamps -40, -25, -10 (h 5.3); sign `CELLAR ↑` 14 (**wrong**, plaque); sign `SHRINE ←` -46 |
| The Cellar (F3) | drapes -12 (w 9), -24 (w 6); sign `YOU WEIGH 16% LESS DOWN HERE` -2; sign `EXIT ↓` 15 (**wrong**: down is the Workings; plaque) |
| Old Workings | beam (-36, 243.5); drip (-40, 241); cart (-46, 239.6) |

### 6.4 The Skylight's noon beam

Ember's direction seen from Mochi turns once per lap. It points along the skyhole (θ 1.2979) first at **t = 4,586 s**, then every **6,491 s**. The skyhole is 3 m wide and about 10 m deep, so the beam fits through for about **±110 s** (≈ ±0.106 rad of Ember angle). Draw a soft yellow trapezoid from the surface hole to the Skylight floor, with alpha ∝ 1 − |Δ|/0.106, plus dust motes. Stretch: Sizzy says "Noon! Look up." when you are in the room at noon.

```js
const sun = Math.atan2(-by, -bx);                  // Mochi -> Ember (Ember at the origin), body centre (bx, by)
const d = Math.atan2(Math.sin(sun - 1.2979), Math.cos(sun - 1.2979));
const beam = Math.max(0, 1 - Math.abs(d) / 0.106);
```

---

## 7. Finding your way

- **Signposts** (6.3). They are Pipkin, so they are in English. Three are wrong on purpose: `NOODLES ←` (they are east), `CELLAR ↑` (it is down) and `EXIT ↓` (down is the Old Workings). Under each wrong sign is a Murk `plaque` in touch-dots that is right: "noodles east", "down. obviously.", "the old workings. do not." With a translator (`Npcs.readable(g, 'murk', word)`, feature-detected), F at a plaque pops the English. Without one, it pops `~ bumpy dots ~`.
- **Map boards.** There are two: the West Stair head (-46, surface) and the Pantry (-11, F1). **F** toggles a screen overlay drawn from the zone tables: each zone as a filled polygon in (x, depth), the lift with the car's position, and a pulsing **YOU ARE HERE** dot. Any walk key or F closes it. It does not pause. About 40 lines of code.
- **You are in.** A small pill at the top centre in EVA: `The Pantry · air` (mint) or `Old Workings · no air` (amber). It is one zone-byte read per frame.
- **Guide.** The `guide` spot at the West Stair head (x -50). Ask aliens to place one Pipkin extra there named **Tansy**, with the line "Downtown's down the stair. Lift's by the pad. The signs are wrong." Fallback without npcs.js: the same text as a hint when you are within 6 m.
- **Hints** (priority 30): first landing on the pad: `Downtown is under your feet: the West Stair (44 m west) or the Clunk Lift (21 m east).` Standing in the Skylight: `Ember crosses this hole once a day (108 min). Next noon in 41 min.`
- **Nav targets** (Tab): Downtown (the stair mouth), plus the outposts on the body you are near (within 3 km of the ship), plus whichever outpost is already targeted.

---

## 8. Spots for aliens: `Mochi.spots(g)`

This is lore's contract unchanged: `[{ id, name, body, lx, ly, ux, uy, w, air }]` in body-local metres. (lx, ly) is the floor point and (ux, uy) is local up. The **role ids are exactly lore's**, so no ROLE map is needed. NPCs stand along the floor tangent at spacing `min(2.2, w / n)` and are each snapped with a short raycast along −up. My own standability check (floor solid below, feet and head clear) flagged some spots as "feet blocked". That is a check artifact: the cell staircase can sit up to 0.5 m above rf. The lore raycast snap handles it, so keep the snap.

| id | name | x | r | θ | lx | ly | w | air | who (lore) |
|---|---|---|---|---|---|---|---|---|---|
| `pad` | Mochi launch pad | -15 | 297.2 | 1.6213 | -14.99 | 296.82 | 6 | no | Pip, Mumble |
| `guide` | West Stair head | -50 | 297.4 | 1.7389 | -49.76 | 293.21 | 4 | no | Tansy (extra) |
| `market` | The Pantry | 0 | 284 | 1.5708 | 0.00 | 284.00 | 20 | yes | Chive + 6 extras |
| `lift` | Clunk Lift, Main Street landing | 15.5 | 284 | 1.5162 | 15.49 | 283.58 | 3 | yes | Clunk (Oggle extra) |
| `canteen` | The Noodle Hole | 33 | 284 | 1.4546 | 32.93 | 282.08 | 12 | yes | Cookie Grubb + 3 |
| `guild` | The Dig Hall | 56 | 284 | 1.3736 | 55.64 | 278.50 | 16 | yes | Sorrel (keeper) |
| `skylight` | The Skylight | 76 | 284 | 1.3032 | 75.10 | 273.89 | 8 | no | Sizzy |
| `shrine` | The Crumb Shrine | -56 | 266 | 1.7813 | -55.59 | 260.13 | 10 | yes | Crustling extras (stretch) |
| `gallery` | Echo Gallery | -25 | 266 | 1.6648 | -24.96 | 264.83 | 40 | yes | Grandpa Gneiss |
| `archive` | The Quiet Nook | 31 | 266 | 1.4543 | 30.93 | 264.20 | 10 | yes | UNIT-7 |
| `cellar` | The Cellar | -9 | 246 | 1.6074 | -9.00 | 245.84 | 30 | yes | Velvet + 3 Murk |
| `workings` | Old Workings | -52 | 236 | 1.7911 | -51.58 | 230.29 | 4 | no | (stretch: a lost miner) |
| `outpost-ice` | Frostbite Flats | -13.2 on the plinth | 302 | | -244.54 | 177.21 | 1.8 | no | Foreman Okra |
| `outpost-iron` | Clank Rig | -13.2 | 302.5 | | -293.45 | -73.44 | 1.8 | no | Bonk (keeper) + bots |
| `pump9` | Pump 9 | -13.2 | 303.5 | | -38.05 | -301.11 | 1.8 | no | Nozzle (keeper) |
| `pitstop` | Pretzel Pit Stop (`body: 'pretzel'`) | -6.5 | 41 | | -40.72 | -4.78 | 1.8 | no | Twist (keeper) |
| `forge` | Annie's Forge (`body: 'waffle'`) | -6.5 | 52.5 | | 45.46 | 26.26 | 1.8 | no | Anvil Annie |
| `brinepit` | The Brine Pit (`body: 'pickle'`) | -6.5 | 50.5 | | 27.76 | 42.18 | 1.8 | no | Mad Marge |

- Outpost x values are metres along the plinth top from the pad centre, in the prop frame. The up vectors are, for example, Frostbite (-0.8097, 0.5868), Clank (-0.9701, -0.2428), Pump 9 (-0.1254, -0.9921). Compute them in code; Appendix A has `spots()`.
- **Asks to aliens**:
  - Move Annie to `{ spot: 'forge' }` and Marge to `{ spot: 'brinepit' }`, keeping their current `{ body, th }` as the fallback. Their lore angles are 10 m and 15 m from the slabs.
  - Keep keeper names out of the random extras' name pools: Parsnip, Sorrel, Tansy, Clunk, Bonk.
- The `pad` spot at x -15 is clear of every frame on the pad (the Leviathan's radius 11 reaches x -11), the mast (+9..10.6) and the stair mouth (-44..-35).

---

## 9. Mochi surface outposts

**Common template** (a 50 m plinth, the prop frame at the plinth centre, x along the top):
- **Plinth** (Appendix A `plinth()`): find the highest surface point across ±25 m; set `rp = ceil((top + 0.25)/0.5)·0.5`; fill `slab` from rp down to 2 m below the lowest point; clear everything solid above rp. The top is dead flat at rp. Ships land on it with the normal terrain collision (verified: the Prospector on Frostbite, screenshot 13).
- **Pad**: x -12..12, 24 m: it fits every frame up to the Leviathan (radius 11). It has `padMarks`: yellow dashes along the edge and two mint edge lights that blink at night.
- **Shop dome** at x -18 (R 3.8, x -21.8..-14.2). It has portholes (blue by day, warm yellow at night), an orange counter on the pad side, a mint awning and a name plate. The keeper stands at x -13.2.
- **Business prop** east at x +17, a tank at +21.5, and a two-post price sign at x -24.

| | **Frostbite Flats** | **Clank Rig** | **Pump 9** | Rock Garden (stretch) |
|---|---|---|---|---|
| role / lore id | `outpost-ice` | `outpost-iron` | `pump9` | `rockgarden` |
| θ | 2.471 (π/2 + 0.9) | -2.940 | -1.740 | 1.951 (π/2 + 0.38) |
| from the pad | 267 m west, hop 19.1 m/s | 527 m west, hop 22.9 | 883 m west, hop 24.5 | 113 m west, walkable |
| surface over the plinth | 301.2-301.4 | 301.4-301.8 | 302.9-303.0 | 297.2-298.0 |
| plinth top rp / depth | 302.0 / 2.8 m | 302.5 / 3.1 m | 303.5 / 2.6 m | none (a yard of boulders) |
| why here | ice 515 cells within 40 m (Mochi mean 309) | **richest iron on Mochi**: 251 cells (mean 67) | **richest ice on Mochi**: 762 cells; 118 m from the Lithobraker's crater | next to the pad, as progression asks |
| keeper | Foreman Okra (Pipkin, hardhat) | Bonk (Oggle smith) + SKID (bot) | Nozzle (Oggle, one eye, a fuel-hose scarf) | Granny Granite (Crustling) |
| business prop | blue `derrick` (h 9) bobbing into the ice, `H₂O` tank | rust-orange derrick, an anvil, scrap heap | three fuel `tank`s (`CH₄`, `O₂`, `9`), a hose arch | parked boulders with chalk prices |
| sign | `ICE 1.1×` | `REPAIRS ¾ PRICE` | `CHEAPEST FUEL IN THE BELT*` (small print: `*on Mochi`) | `NO NAPPING ON THE STOCK` |
| blurb gag | "Safety first. And second. Mining comes about fourth." | "Iron in, bolts out. Bonk hits things for money now." | "There were never pumps 1 to 8. Nozzle just liked the number." | "...the rocks... are resting." |

**Why these numbers** (economy guard rails): ice is $0.80/kg, so 1.1× is $0.08/kg over the Hub. The reward is convenience, not an exploit: Kiwi Outpost still pays 1.6× for ice. Clank's repairs at 0.75× are the cheapest in the system, beating Rust's 0.85×. Pump 9's fuel at 0.9× is the only fuel below Hub price, and it is the farthest hop on Mochi. None of them sells parts; the Hub keeps that.

---

## 10. Belt outposts (the same plinth code on other rocks, 24 m slabs)

`Terrain.addCarver(bodyId, (T, b) => plinth(T, b, th, 24, SLAB))`: the same function, smaller. A 24 m slab gives a 17 m pad (x -8.5..8.5), which fits up to the Bulk Barge (radius 8.5). The Leviathan fits with its toes over the props, which is fine because props do not collide.

| | **Pretzel Pit Stop** | **Annie's Forge** | **The Brine Pit** |
|---|---|---|---|
| body | Pretzel (Mochi lane, rail phase +0.18: **5.4 km ahead** of Mochi) | Waffle (Mochi lane, phase -0.20: **6.0 km behind**) | Pickle (outer lane a 36.5 km, phase -0.6; Hohmann from the Mochi lane 2.71 m/s) |
| body numbers | R 40, g 0.9, v_esc 8.49, v_circ 6.00 | R 55, g 1.1, v_esc 11.0, v_circ 7.78 | R 45, g 1.0, v_esc 9.49, v_circ 6.71 |
| θ (flattest 24 m near the lore NPC) | 3.10 (Halite lives at 1.0, round the back) | 0.40 (Annie's lore spot 0.6 is 10 m away) | 0.86 (Marge's lore spot 1.2 is 15 m away) |
| surface span / rp / slab depth | 39.0-40.7 / 41 / 4.0 m | 49.9-52.1 / 52.5 / 4.6 m | 43.4-49.9 / 50.5 / **9.1 m**: the slab stands on a stone pillar like a jar lid |
| kind / keeper | outpost / Twist (Pipkin, pretzel-knot antenna) | outpost / Anvil Annie (Oggle, goggles) | **black** / Mad Marge (Oggle, tricorn) |
| props | a fuel `tank` (`FUEL`), a kettle, a deck chair | an anvil + glowing forge (orange glow r 2), a quench barrel | a shack of scrap with a skull-and-fries flag, pickle-barrel stools, a neon `BRINE` sign |
| hook | the starter hop: combat keeps Pretzel pirate-free | the cheapest repairs off Mochi | neutral ground: "Pirates don't shoot at the Brine Pit. Marge would make them pay for the paint." |

**Stretch belt sites** (computed, flat): **Survey Camp 5** on Macaron (θ 1.08, flatness 0.5 m over 24 m, rp 34; the bots' map table; INTERN-5 nearby) and **The Map Room** on Crouton (θ -1.52, rp 35.5; Nodey's Orbiloon chart room, F shows the lanes). Biscotti is a pirate zone, so it gets no outpost. Basalt stays a hermit.

**Stretch easter eggs**:
- **Waffle's square holes.** Annie says "Waffle has square holes. Nobody knows why. I blame the Murk." Carve six 2 × 2 m square pits, 1.5 m deep, at θ 0.2-0.7 with the same `region()` and a polar-box test. They are lined in Murk-stone. She was right.
- **The Brine Pit's pit.** A 12 m lined chamber under the slab: Marge's back room, reached by a short ramp.

---

## 11. Interactions and shops

**F** prompts (`interactions(g)`). Nearest wins; ship prompts are only shown while landed.

| where | text | act |
|---|---|---|
| ship landed on an outpost plinth (arc ≤ 14 m from its centre) | `Open Frostbite Flats (Foreman Okra)` | `Econ.openShop(g, ST.frostbite)` |
| EVA within 3 m of an outpost counter | the same | the same |
| EVA at the Pantry's GEMS stall | `Sell at the Pantry (Parsnip)` | `Econ.openShop(g, ST.pantry)` |
| EVA at the Dig Hall counter | `Dig Hall: suits and the guild till (Sorrel)` | `Econ.openShop(g, ST.dighall)` |
| EVA at the Noodle Hole counter | `Fries! Fix your suit and refill your air ($5)` | `g.money -= 5; EVA.topUp(g, false)` (HP and O2; eva owns that state) (refused under $5: "Grubb: no money, no fries. House rules.") |
| EVA at a map board | `Read the map` | toggle the overlay |
| EVA at a plaque | `Feel the dots` | translated popup, or `~ bumpy dots ~` |
| EVA on the lift deck | `Lift: going down to Low Street` (next stop) | set target |
| EVA at a landing, car elsewhere | `Call the lift` | set target |

**Shop objects** (econ's `openShop` normalises them; `'*'` is the fallback multiplier and `0` refuses):

```js
const ST = {
  pantry:    { id: 'pantry', name: 'The Pantry', kind: 'outpost', keeper: 'Parsnip', tabs: ['sell'],
               buy: { salt: 1.1, amber: 1.1, opal: 1.1, voidopal: 1.1, '*': 0.8 },
               blurb: 'Gems at a dime over Hub price, everything else a bit under. No fuel down here: open flames and tunnels.' },
  dighall:   { id: 'dighall', name: 'The Dig Hall', kind: 'outpost', keeper: 'Sorrel', tabs: ['suit', 'sell'],
               buy: { ice: 0.95, iron: 0.95, nickel: 0.95, platinum: 0.95, '*': 0.7 },
               blurb: 'The diggers\' guild. Suits, lights, jetpacks. Guild rate for ore: a nickel under the Hub, no lift up.' },
  frostbite: { id: 'frostbite', name: 'Frostbite Flats', kind: 'outpost', keeper: 'Foreman Okra', tabs: ['services', 'sell'],
               buy: { ice: 1.1, iron: 0.7, nickel: 0.7, platinum: 0.7, '*': 0.6 }, fuelMult: 1.1, repairMult: 1.2,
               blurb: 'Okra\'s ice camp, 267 m west of the pad on the best ice field near town. Ice pays 1.1x, no trip to orbit.' },
  clank:     { id: 'clank', name: 'Clank Rig', kind: 'outpost', keeper: 'Bonk', tabs: ['services', 'sell'],
               buy: { iron: 1.1, nickel: 1.1, platinum: 0.9, scrap: 1.1, ice: 0.5, '*': 0.6 }, fuelMult: 1.3, repairMult: 0.75,
               blurb: 'Round the back of Mochi on the richest iron. Repairs at three quarters price. Bonk hits things for money now.' },
  pump9:     { id: 'pump9', name: 'Pump 9', kind: 'outpost', keeper: 'Nozzle', tabs: ['services', 'sell'],
               buy: { ice: 1.0, '*': 0 }, fuelMult: 0.9, repairMult: 1.3,
               blurb: 'Mochi\'s far side. We crack the richest ice on the rock into fuel and sell it cheapest. There were never pumps 1 to 8.' },
  pitstop:   { id: 'pitstop', name: 'Pretzel Pit Stop', kind: 'outpost', keeper: 'Twist', tabs: ['services', 'sell'],
               buy: { ice: 0.9, '*': 0.6 }, fuelMult: 1.15, repairMult: 1.3,
               blurb: 'First stop out of Mochi, 5.4 km up the lane. Fuel, a kettle, no pirates. Old Halite lives round the back. Do not laser him.' },
  forge:     { id: 'forge', name: "Annie's Forge", kind: 'outpost', keeper: 'Anvil Annie', tabs: ['services', 'sell'],
               buy: { iron: 1.15, nickel: 1.2, scrap: 1.2, '*': 0.5 }, fuelMult: 1.4, repairMult: 0.7,
               blurb: 'Forty years a pirate, now a smith. Cheapest patch-ups in the belt. Mind your fingers, the anvil bites.' },
  brinepit:  { id: 'brinepit', name: 'The Brine Pit', kind: 'black', keeper: 'Mad Marge', tabs: ['services', 'sell', 'weapons'],
               buy: { salt: 1.2, amber: 1.2, opal: 1.25, voidopal: 1.25, parts: 1.4, core: 1.5, scrap: 1.2, '*': 0.6 }, fuelMult: 1.6, repairMult: 1.0,
               blurb: 'The Free Company\'s clubhouse on Pickle. No names, no receipts, no shooting: Marge charges for paint.' },
};
```

Notes for econ (no change needed): `kind: 'black'` makes the Brine Pit sell Orion units in its weapons tab, as at Rust's. The Dig Hall's `suit` tab makes it the third suit vendor after the Hub and Kiwi, the only one you can walk to. If econ wants it narrower, a stretch `only: ['sprint1', ...]` filter would do it.

---

## 12. Module shape (`mochi.js`)

```
// ======================================================================
//  MOCHI  —  Downtown (tunnels carved at build), the Clunk Lift, outposts on
//  Mochi and the belt, spots for NPCs, signs, map boards.
//  API: Mochi.spots(g), airAt(g, x, y), zoneAt(g, x, y), outposts(g), TOWN, ST
// ======================================================================
```

Blocks, each behind a `// ---------------- name ----------------` divider: data (floors, zones, outposts, shops, props), carve, plinth, lift, spots, interactions, nav + hints, props (art), HUD (label, lift panel, map), register.

- **Registration**: `Game.register(mod); if (!Game.mods.includes(mod)) return undefined;` first, then `Terrain.addCarver('mochi', carveTown)` plus one carver per outpost body, at **script load**, before any `Terrain.of`. So `?mods=` without mochi gets v3 Mochi. The lead adds the script tag; the order is `… combat, haul, mochi, npcs, render` (mochi after eva so its `step` runs after eva's; npcs after mochi so NPC sprites draw over the props).
- **Hooks**:
  - `init`: `g.mod.mochi = { lift, map: false, seen: {} }`.
  - `step`: the lift only.
  - `frame`: auto-call, zone label, noon beam.
  - `interactions`, `navTargets`, `hint`.
  - `onKey`: 1-4 on the deck; F is handled through `interactions`.
  - `drawWorld`: props, cage, beam.
  - `drawHUD`: label, lift panel, map.
  - `save`/`load`: `seen` only; the lift resets.
  - `ready`: log.
- **Spawn**: `Game.addSpawn('tunnels', 'Downtown (the Pantry)', place)`. It lands the ship on the pad, steps out (`EVA.stepOut`, feature-detected) and puts the astronaut on the Pantry floor at x 0, r 285 with the lift parked at Main Street. URL: `?mods=economy,eva,mochi&spawn=tunnels`.
- **Job**: `{ id: 'downtown', order: 34, text: 'Ride the Clunk Lift down to the Cellar', reward: 75, test: (g) => zoneIdUnderAstro(g) === 'cellar' }`.
- **Logs** (debug output at each step):
  - `mochi carve: 8499 dug ...`
  - `mochi plinth frostbite rp 302 cells 3120`
  - `mochi lift f1 -> f3 (38 m, 14.7 s)`
  - `mochi spots: 18 (12 mochi, 3 outposts, 3 belt)`
  - `mochi shop frostbite opened`
- **Without the other modules**: no eva means no lift riding, but the carve, plinths, spots and ship shops still work. No econ means no shop (the prompt hides). No npcs means the guide hint falls back to text.

---

## 13. Performance

| item | cost | note |
|---|---|---|
| Mochi grid | N = 1248, so 1,557,504 cells: grid + wear 3.1 MB | unchanged |
| zone array | +1.56 MB (Mochi only) | belt slabs need no zones |
| carve | once, at the first `Terrain.of(mochi)`, on top of the existing 70-136 ms build: 17-65 ms for the prototype, 54-87 ms for Appendix A as written (it also lays the pad's ice seam) | 8,499 dug + 2,794 lined; the lining pass scans the whole grid once |
| `has` recompute | ~10 ms | all chunks, once |
| content chunks | 158 before the carve, **205 after**, 207 with one plinth (~212 with all three) | the old `CACHE_MAX` of 220 is too tight: with Mochi filling the screen at 0.9-1.2 px/m, any extra digging thrashes (6 re-bakes a frame, forever) |
| bake cache | each entry is a 146² canvas (85 KB) **plus its own ImageData (85 KB)** | today 220 × 170 KB = 37 MB; with one shared ImageData and `CACHE_MAX` 320 it is **27 MB**: more chunks for less memory |
| lift | ~8 deck cells rewritten every 0.5 m (6 times a second at 3 m/s), 1-2 chunks re-baked | well under BAKES_PER_FRAME 6 |
| `dig` r 6 (crashing rocks) | **0.049 ms** a call (measured, 200 calls) | progression's "stay fast up to r 6": fine |
| snapshot `scan` | 7 ms when dirty (unchanged); the zone skip keeps saves at the player's own digs | without the skip, the town alone is 333 runs / 3.5 KB in every save |
| props | ~45 draws when the camera is in town, culled by view, only at zoom ≥ 1.2 | cheap |

---

## 14. MVP / stretch

**MVP (one session):**
1. terrain.js patches (4.4).
2. Downtown: the full layout as tabled, the lining, the pad's ice seam, the zone array, the town backwall.
3. The Clunk Lift with gates, auto-call, F / 1-4, popups and the HUD panel.
4. `Mochi.spots(g)` (all 18) and `airAt`.
5. Props: lamp, stall, sign, plaque (with a dots fallback), door, noodle, liftHouse, cage, airlock, idol, drape, scope, the drip sign, and the outpost set (dome, derrick, tank, padMarks, twoPostSign).
6. The three Mochi outposts with their shops, and the three belt slabs with their shops (props minimal: dome + sign).
7. Interactions: the shops, fries, map boards (the overlay), lift.
8. Zone label, hints, nav targets, the `tunnels` spawn, the `downtown` job.
9. Tests (section 15) and screenshots.

**Stretch (rough priority):**
1. The Skylight noon beam (6.4) and Sizzy's noon line.
2. The Rock Garden: parked boulders from haul (progression's ask), with Granny Granite's prices.
3. eva's air refill (6.1). (The `CLINK!` popup on `out.fixed` is now eva MVP: contract §2.4.)
4. The Brine Pit's back room and Waffle's square holes.
5. Survey Camp 5 and the Map Room.
6. Repeatable Dig Hall guild contracts ("40 kg of ice from the Old Workings", $60) and rent-a-drill.
7. Cave bugs in the Old Workings, once mobs.js has an owner.
8. Tuesday: the Noodle Hole full of off-duty pirates (lore stretch 10). Mochi only needs to expose `Mochi.spots` with `canteen` w 12 to fit them.

---

## 15. Tests (`tests/test_mochi.js`, `H.load({ only: 'economy,eva,mochi' })`)

Print `PASS/FAIL name info` and exit non-zero on failure. Every assertion below has a matching prototype in `/tmp/claude-0/v4-mochi/`.

1. **Carve**: two fresh builds give identical grids (hash the Uint8Array). Dug cells are over 8,000 and lined cells over 2,500. `T.zones` has every table id. No gem sits in a zone or fixed cell. Log the stats.
2. **Unbreakable**: 300 calls of `Terrain.dig(T, …, 6, 99)` on the Pantry roof leave every `wall` and `slab` cell intact and the zone cells untouched (prototype without `fixed`: 38 lost). **Pad seam**: no `slab` within 12 m of the pad; 128 ice cells 0.5-2.5 m under it; a dig there yields ice and stops at the lining.
3. **Save**: a fresh game's snapshot is `null`. After one dig in the Old Workings, the runs contain no zone cell. A restore onto a fresh build reproduces the dig and does not disturb the deck or gates.
4. **Walk** (real eva): surface x -52 → West Stair → Pantry → Main Street → Skylight in under 45 s with no HP loss, and back up in under 45 s.
5. **Lift**: rides Surface → Main → Low → Cellar → Surface each finish within 0.3 s of `d/v + v/a`, with no HP loss, ≤ 2 airborne frames, and feet within 0.4 m of the stop.
6. **Gates**: with the car at the Cellar, walking east stops short of the shaft edge: before x 19.0 on the surface (measured 18.11) and before 18.07 on Main Street (measured 17.11). With the car at Main Street, you walk across to x > 24.
7. **Auto-call**: put the astronaut on Low Street with the car at the Surface; within 3 s + 12.5 s the car is at Low Street.
8. **Spots**: 18 spots; ids unique; every lore role present; each has solid ground within 1 m below along −up (raycast) and clear space 1.6 m above.
9. **Outposts**: each plinth top is flat (all top cells at rp). `Game.landAt(g, mochi, θ)` then 5 s of steps keeps the ship landed with 0 damage. F opens the right shop (spy on `Econ.openShop`). The same on Pretzel, Waffle and Pickle.
10. **Spawn**: `?spawn=tunnels` puts the astronaut in zone `pantry`, grounded within 1 s, the lift at Main Street.
11. **Job**: riding to the Cellar completes `downtown` (+$75).
12. **Isolation**: `only: 'mochi'` (no eva or econ) builds, carves and steps 600 frames without throwing.

Screenshots (scratch dir): the ship view at 2-4 px/m (the ant farm), the Pantry, the Noodle Hole, the Skylight, the Shrine and Gallery, the lift between floors, the Cellar, the Old Workings, the lift house, Frostbite with the ship on the pad, Frostbite at night.

---

## 16. Asks to other implementers (all optional, all feature-detected)

| who | ask |
|---|---|
| **eva** | (1) Mochi loads after eva (lead's script order). (2) Optional: refill O2 and skip FAR_WARN when `Mochi.airAt(g, x, y)` (one line). (3) **MVP (contract):** `CLINK!` when `dig` returns `fixed > 0`. (4) `EVA.topUp(g, false)` for the fries. Nothing else: the lift uses the existing collide and snap. |
| **econ** | Nothing required. The shop objects (section 11) use `buy`, `'*'`, `tabs`, `fuelMult`, `repairMult`, `kind`. Stretch: an `only` filter for the Dig Hall's suit tab. |
| **aliens** | Read `Mochi.spots(g)`; the role ids match lore exactly. Move Annie to `spot: 'forge'` and Marge to `spot: 'brinepit'` (keep the fallbacks). Place one Pipkin extra **Tansy** at `guide` and one Oggle extra **Clunk** at `lift`. Reserve the keeper names Parsnip, Sorrel, Tansy, Clunk, Bonk, Nozzle, Twist. Optional: `Npcs.script('murk', word, w, h)` for plaques and `Npcs.readable` for the reveal (already in the API). |
| **look** | Nothing required. Optional: map labels from `Mochi.outposts(g)` → `[{ id, name, body, lx, ly, col }]` (a small dome icon) and the town as a dot under the pad. |
| **ship** | Nothing: plinths and slabs are ordinary solid cells, and landing on them was verified. |
| **progression** | Answered: `dig` at r 6 is 0.049 ms; the pad is **not** hardened (contract §9 #4: the lining caps any crater at 3.2 m, and an ice seam keeps the first dig); crater rims get the ink band (4.4); the Rock Garden site is θ 1.951 (stretch). |

---

## Appendix A: reference code (data, carve, plinth, lift, spots)

Cleaned from `/tmp/claude-0/v4-mochi/town.js` and `gates3.js`. The block below was then extracted from this doc and run **as written** (`checkA.js`) against the real terrain.js and eva.js. Results: carve 8,499 / 2,794; plinth tops 302 / 302.5 / 303.5 / 41 / 52.5 / 50.5; the 18 spots match the table in section 8; lift rides 6.5 / 14.7 / 19.1 s with 0 airborne frames. The test supplied only `ST` names and a no-op `touch`.

```js
// ---------------- data ----------------
const TH0 = Math.PI / 2, thAt = (x, r) => TH0 - x / r;      // x = metres east of the pad along radius r
const F1 = 284, F2 = 266, F3 = 246, ST_H = 3.5, TOP = 297.5, ROOF = 301.5;
const LIFT = { th: thAt(21, 297.2), w: 4.0, deck: 3.5, vmax: 3, acc: 1.5,
  stops: [{ id: 'top', name: 'Surface', r: TOP }, { id: 'f1', name: 'Main Street', r: F1 },
          { id: 'f2', name: 'Low Street', r: F2 }, { id: 'f3', name: 'The Cellar', r: F3 }] };
const STREETS = [
  { id: 'main', name: 'Main Street', r: F1, x0: -13.5, x1: 84,   h: ST_H, air: true },
  { id: 'low',  name: 'Low Street',  r: F2, x0: -64,   x1: 38,   h: ST_H, air: true },
  { id: 'deep', name: 'Cellar Row',  r: F3, x0: -30,   x1: 17.4, h: ST_H, air: true },
];
const ROOMS = [
  { id: 'pantry',   name: 'The Pantry',       r: F1, x0: -13.5, x1: 14,  h: 9,   p: 4,   air: true },
  { id: 'noodle',   name: 'The Noodle Hole',  r: F1, x0: 25,    x1: 41,  h: 6,   p: 4,   air: true },
  { id: 'dighall',  name: 'The Dig Hall',     r: F1, x0: 46,    x1: 66,  h: 7.5, p: 3,   air: true },
  { id: 'skylight', name: 'The Skylight',     r: F1, x0: 71,    x1: 84,  h: 7,   p: 2.5, air: false },
  { id: 'shrine',   name: 'The Crumb Shrine', r: F2, x0: -64,   x1: -48, h: 10,  p: 2,   air: true },
  { id: 'gallery',  name: 'Echo Gallery',     r: F2, x0: -50,   x1: 8,   h: 5.5, p: 8,   air: true },
  { id: 'nook',     name: 'The Quiet Nook',   r: F2, x0: 24,    x1: 38,  h: 5,   p: 4,   air: true },
  { id: 'cellar',   name: 'The Cellar',       r: F3, x0: -30,   x1: 12,  h: 7,   p: 3,   air: true },
];
const RAMPS = [
  { id: 'weststair', name: 'West Stair',   a: [-44, 297.6], b: [-13.5, F1], h: 3.5, air: false },
  { id: 'workings0', name: 'Old Workings', a: [-30, F3],    b: [-52, 236],  h: 3.2, air: false, unlined: true },
];
const SHAFTS = [
  { id: 'lift',    name: 'Clunk Lift', th: LIFT.th,         w: LIFT.w, r0: F3 - 0.5, r1: ROOF, air: false },
  { id: 'skyhole', name: 'Skylight',   th: thAt(77.5, F1), w: 3.0,    r0: F1 + 5,   r1: 302,  air: false },
];
const CAVES = [
  { x: -58, r: 232, rx: 7, ry: 3.5 }, { x: -66, r: 226, rx: 6, ry: 3 }, { x: -55, r: 222, rx: 8, ry: 3 },
  { x: -44, r: 217, rx: 6, ry: 2.8 }, { x: -62, r: 214, rx: 5, ry: 3.2 },
];

// ---------------- carve ----------------
function carveTown(T, b) {
  const t0 = Date.now(), CELL = Terrain.CELL, N = T.N, G = T.grid, { REG, DUG } = Terrain;
  const WALL = Terrain.MAT_ID.wall, SLAB = Terrain.MAT_ID.slab;
  const zone = T.zone = new Uint8Array(N * N), ZONES = T.zones = [];
  const st = { carved: 0, lined: 0, kinds: {} };
  const dth = (a, c) => Math.atan2(Math.sin(a - c), Math.cos(a - c));
  const addZone = (o, kind) => { ZONES.push({ id: o.id, name: o.name, kind, air: !!o.air, lit: !o.unlined, rf: o.r }); return ZONES.length; };
  function region(th0, th1, r0, r1, test, z) {                 // cells in a polar box (no angle wrap near the pad)
    const xs = [], ys = [];
    for (const th of [th0, (th0 + th1) / 2, th1]) for (const r of [r0, r1]) { xs.push(r * Math.cos(th)); ys.push(r * Math.sin(th)); }
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - 1 + T.half) / CELL)), i1 = Math.min(N - 1, Math.floor((Math.max(...xs) + 1 + T.half) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - 1 + T.half) / CELL)), j1 = Math.min(N - 1, Math.floor((Math.max(...ys) + 1 + T.half) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -T.half + (i + 0.5) * CELL, y = -T.half + (j + 0.5) * CELL, k = j * N + i;
      if (!test(Math.hypot(x, y), Math.atan2(y, x))) continue;
      if (G[k] >= REG) { st.carved++; st.kinds[ZONES[z - 1].kind] = (st.kinds[ZONES[z - 1].kind] || 0) + 1; }
      if (G[k] >= REG || G[k] === DUG) { G[k] = DUG; zone[k] = z; }
    }
  }
  for (const s of STREETS) {
    const z = addZone(s, 'street'), ta = thAt(s.x0, s.r), tb = thAt(s.x1, s.r), hi = Math.max(ta, tb), lo = Math.min(ta, tb);
    region(hi, lo, s.r, s.r + s.h, (r, th) => th <= hi && th >= lo && r >= s.r && r <= s.r + s.h, z);
  }
  for (const q of ROOMS) {
    const z = addZone(q, 'room'), ta = thAt(q.x0, q.r), tb = thAt(q.x1, q.r), tc = (ta + tb) / 2, hw = Math.abs(ta - tb) / 2;
    region(ta, tb, q.r, q.r + q.h, (r, th) => {
      const u = Math.abs(dth(th, tc)) / hw; if (u > 1 || r < q.r) return false;
      return r - q.r <= q.h * Math.pow(1 - Math.pow(u, q.p), 1 / q.p);
    }, z);
  }
  for (const q of RAMPS) {
    const z = addZone(q, 'ramp'), ta = thAt(q.a[0], q.a[1]), tb = thAt(q.b[0], q.b[1]);
    region(ta, tb, Math.min(q.a[1], q.b[1]), Math.max(q.a[1], q.b[1]) + q.h, (r, th) => {
      const s = (th - ta) / (tb - ta); if (s < 0 || s > 1) return false;
      const rf = q.a[1] + s * (q.b[1] - q.a[1]); return r >= rf && r <= rf + q.h;
    }, z);
  }
  for (const q of SHAFTS) {
    const z = addZone(q, 'shaft');
    region(q.th + q.w / q.r0, q.th - q.w / q.r0, q.r0, q.r1, (r, th) => Math.abs(dth(th, q.th)) * r <= q.w / 2 && r >= q.r0 && r <= q.r1, z);
  }
  for (const c of CAVES) {
    const z = addZone({ id: 'workings', name: 'Old Workings', unlined: true, r: c.r }, 'cave'), tc = thAt(c.x, c.r);
    region(tc + c.rx / c.r, tc - c.rx / c.r, c.r - c.ry, c.r + c.ry, (r, th) => {
      const u = dth(th, tc) * c.r / c.rx, v = (r - c.r) / c.ry, wob = 1 + 0.18 * Math.sin(5 * Math.atan2(v, u) + c.x);
      return u * u + v * v <= wob * wob;
    }, z);
  }
  // -------- lining: solid cells within 2 cells of a lined zone become Murk-stone --------
  const FIX = Terrain.MATS.map((m) => !!m.fixed);
  for (let k = 0; k < G.length; k++) {
    const z = zone[k]; if (!z || !ZONES[z - 1].lit) continue;
    const i = k % N, j = (k - i) / N;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      if (di * di + dj * dj > 5) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const kk = jj * N + ii; if (G[kk] >= REG && !FIX[G[kk]]) { G[kk] = WALL; st.lined++; }
    }
  }
  // -------- lift-house roof, the pad's ice seam (contract §9 #4: no slab under the pad) --------
  liftCells(T, ROOF, ROOF + 0.5, (o) => o <= LIFT.w / 2 + 0.5).forEach((k) => { G[k] = WALL; });
  seam(T, b, TH0, 16, 0.5, 2.5, Terrain.MAT_ID.ice);
  T.gems = T.gems.filter((gm) => { const k = Terrain.index(T, gm.lx, gm.ly); return k >= 0 && !zone[k] && !Terrain.MATS[G[k]].fixed; });
  T.townBack = [94, 71, 99]; T.townBack2 = [122, 95, 122];
  st.ms = Date.now() - t0;
  return st;                                                   // the caller logs it after has is recomputed
}

// regolith cells within w/2 of angle th and d0..d1 under the surface become `mat` (shape unchanged): the first-dig seam
function seam(T, b, th, w, d0, d1, mat) {
  const rs = World.surfaceR(b, th);
  Terrain.forCells(T, (rs - d1 / 2) * Math.cos(th), (rs - d1 / 2) * Math.sin(th), w / 2 + d1, (k) => {
    const [r, off] = polarOff(T, k, th), rr = World.surfaceR(b, th - off / rs);
    if (Math.abs(off) <= w / 2 && r < rr - d0 && r > rr - d1 && T.grid[k] === Terrain.REG) T.grid[k] = mat;
  });
}
function polarOff(T, k, th) {                                  // -> [r, arc offset from angle th (+ = clockwise/east)]
  const i = k % T.N, j = (k - i) / T.N, x = -T.half + (i + 0.5) * Terrain.CELL, y = -T.half + (j + 0.5) * Terrain.CELL;
  const r = Math.hypot(x, y), a = Math.atan2(y, x);
  return [r, -Math.atan2(Math.sin(a - th), Math.cos(a - th)) * r];
}

// ---------------- plinth: a dead-flat landing top at radius rp, `slab` down to 2 m under the lowest ground ----------------
function plinth(T, b, th, w, mat) {
  const hw = w / 2, rs = World.surfaceR(b, th); let top = 0, low = 1e9;
  for (let s = -hw; s <= hw; s += 0.25) { const r = World.surfaceR(b, th - s / rs); top = Math.max(top, r); low = Math.min(low, r); }
  const rp = Math.ceil((top + 0.25) / Terrain.CELL) * Terrain.CELL; let n = 0;
  Terrain.forCells(T, rp * Math.cos(th), rp * Math.sin(th), hw + rp - low + 3, (k) => {
    const [r, off] = polarOff(T, k, th); if (Math.abs(off) > hw) return;
    if (r < rp && r > low - 2) { T.grid[k] = mat; n++; } else if (r >= rp && T.grid[k] >= Terrain.REG) T.grid[k] = Terrain.DUG;
  });
  return { rp, cells: n, top, low };
}

// ---------------- lift ----------------
function liftCells(T, r0, r1, test) {                          // cells of the shaft column with r0 <= r < r1 and test(|off|)
  const out = [], th = LIFT.th, rm = (r0 + r1) / 2;
  Terrain.forCells(T, rm * Math.cos(th), rm * Math.sin(th), (r1 - r0) / 2 + LIFT.w, (k) => {
    const [r, off] = polarOff(T, k, th); if (r >= r0 && r < r1 && test(Math.abs(off))) out.push(k);
  });
  return out;
}
function placeDeck(T, L, rTop) {
  const q = Math.round(rTop / Terrain.CELL) * Terrain.CELL; if (L.q === q) return false;
  for (const k of L.cells) T.grid[k] = Terrain.DUG;
  L.cells = liftCells(T, q - Terrain.CELL, q, (o) => o <= LIFT.deck / 2);
  for (const k of L.cells) T.grid[k] = Terrain.MAT_ID.deck;
  L.q = q; touch(T, L.cells); return true;                     // touch = mark the cells' chunks dirty
}
function setGate(T, L, f, closed) {
  if (L.gates[f] === closed) return; L.gates[f] = closed;
  const [r0, r1] = f === TOP ? [296.5, ROOF] : [f, f + ST_H];
  const ks = liftCells(T, r0, r1, (o) => o > LIFT.w / 2 && o <= LIFT.w / 2 + 0.5);
  for (const k of ks) {
    if (closed) { if (!L.orig.has(k)) L.orig.set(k, T.grid[k]); T.grid[k] = Terrain.MAT_ID.wall; }
    else T.grid[k] = L.orig.get(k) ?? T.grid[k];
  }
  touch(T, ks);
}
function stepLift(g, L, dt) {
  const T = g.w.byId.mochi.ter; if (!T || !T.zone || L.sleep) return;
  const d = L.target - L.r, want = Math.sign(d) * Math.min(LIFT.vmax, Math.sqrt(2 * LIFT.acc * Math.abs(d)));
  L.v += Math.max(-LIFT.acc * dt, Math.min(LIFT.acc * dt, want - L.v));
  if (Math.abs(d) < 0.01 && Math.abs(L.v) < 0.05) { if (L.v) L.arrived = true; L.v = 0; L.r = L.target; }
  L.r += L.v * dt;
  placeDeck(T, L, L.r);
  for (const s of LIFT.stops) setGate(T, L, s.r, !(L.v === 0 && Math.abs(L.r - s.r) < 0.01));
}
// L = { r: TOP, target: TOP, v: 0, q: null, cells: [], gates: {}, orig: new Map() }

// ---------------- spots ----------------
const SPOTS = [ // [id, name, x, r, w, air]  (x east of the pad along r)
  ['pad', 'Mochi launch pad', -15, 297.2, 6, false], ['guide', 'West Stair head', -50, 297.4, 4, false],
  ['market', 'The Pantry', 0, F1, 20, true], ['lift', 'Clunk Lift', 15.5, F1, 3, true],
  ['canteen', 'The Noodle Hole', 33, F1, 12, true], ['guild', 'The Dig Hall', 56, F1, 16, true],
  ['skylight', 'The Skylight', 76, F1, 8, false], ['shrine', 'The Crumb Shrine', -56, F2, 10, true],
  ['gallery', 'Echo Gallery', -25, F2, 40, true], ['archive', 'The Quiet Nook', 31, F2, 10, true],
  ['cellar', 'The Cellar', -9, F3, 30, true], ['workings', 'Old Workings', -52, 236, 4, false],
];
const OUTPOSTS = [ // id, role, body, th, plinth width, keeper spot x, shop
  { id: 'frostbite', role: 'outpost-ice',  body: 'mochi',   th: TH0 + 0.9, w: 50, kx: -13.2 },
  { id: 'clank',     role: 'outpost-iron', body: 'mochi',   th: -2.94,     w: 50, kx: -13.2 },
  { id: 'pump9',     role: 'pump9',        body: 'mochi',   th: -1.74,     w: 50, kx: -13.2 },
  { id: 'pitstop',   role: 'pitstop',      body: 'pretzel', th: 3.10,      w: 24, kx: -6.5 },
  { id: 'forge',     role: 'forge',        body: 'waffle',  th: 0.40,      w: 24, kx: -6.5 },
  { id: 'brinepit',  role: 'brinepit',     body: 'pickle',  th: 0.86,      w: 24, kx: -6.5 },
];
function spots(g) {
  const out = SPOTS.map(([id, name, x, r, w, air]) => { const th = thAt(x, r);
    return { id, name, body: 'mochi', lx: r * Math.cos(th), ly: r * Math.sin(th), ux: Math.cos(th), uy: Math.sin(th), w, air }; });
  for (const o of OUTPOSTS) {
    const b = g.w.byId[o.body]; if (!b) continue;
    if (o.rp == null) Terrain.of(b);                           // building the body runs its carver, which sets o.rp = plinth(...).rp
    const rp = o.rp, th = o.th - o.kx / rp;
    out.push({ id: o.role, name: ST[o.id].name, body: o.body, lx: rp * Math.cos(th), ly: rp * Math.sin(th), ux: Math.cos(th), uy: Math.sin(th), w: 1.8, air: false });
  }
  return out;
}
```

**Sign convention check.** The x of a spot is east, which is −θ. `polarOff` returns + for clockwise, so a prop at plinth x +17 is at `th − 17/rp`. That is the same frame as `rotate(th − π/2)`.

---

## Appendix B: reference code (prop art)

From `/tmp/claude-0/v4-mochi/props.js`, which was screenshotted in the real renderer (Pantry, Noodle Hole, Skylight, Shrine, Cellar, Workings, lift house, Frostbite by day and with the ship).

```js
// ---------------- toon helpers (prop frame: metres, +y up; px = metres per screen pixel) ----------------
const INK = '#1b1433', FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif', L = [-0.55, 0.83];
function toon(c, path, [base, shade, hi], k, lw, hiFn) {    // shade fill, base shifted toward the light, highlight, ink
  path(); c.fillStyle = shade; c.fill();
  c.save(); path(); c.clip(); c.translate(L[0] * k, L[1] * k); path(); c.fillStyle = base; c.fill();
  if (hiFn && hi) { c.translate(-L[0] * k, -L[1] * k); c.fillStyle = hi; hiFn(); }
  c.restore(); path(); c.strokeStyle = INK; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke();
}
function text(c, s, x, y, size, col, outline = 0) {          // y-up world: flip the text
  c.save(); c.translate(x, y); c.scale(size / 20, -size / 20); c.font = `700 20px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (outline) { c.lineWidth = outline * 20 / size; c.strokeStyle = INK; c.strokeText(s, 0, 0); }
  c.fillStyle = col; c.fillText(s, 0, 0); c.restore();
}
function at(c, bx, by, x, r, fn) { const th = Math.PI / 2 - x / r; c.save(); c.translate(bx + r * Math.cos(th), by + r * Math.sin(th)); c.rotate(th - Math.PI / 2); fn(); c.restore(); }

// ---------------- the Noodle Hole (the one everyone screenshots) ----------------
P.noodle = (c) => {
  box(c, -3, 0, 6, 1.1, 0.12, ['#ff9f43', '#c25f1c', '#ffd8a6']);                 // counter
  box(c, -3.15, 1.1, 6.3, 0.18, 0.06, ['#fff4dc', '#d9c7a8', '#ffffff']);          // counter top
  for (const sx of [-2.2, -0.8, 0.6, 2.0]) stool(c, sx);                          // pink stools
  const fl = 0.75 + 0.25 * Math.sin(now * 7) * Math.sin(now * 3.1);               // neon flicker
  c.save(); c.translate(0, 3.6); glow(c, 0, 0, 2.6, '255,120,180', 0.35 * fl);
  c.lineCap = 'round'; c.lineWidth = 0.14; c.strokeStyle = `rgba(255,150,200,${fl})`;
  c.beginPath(); c.arc(0, 0, 1.0, Math.PI, 2 * Math.PI, true); c.stroke();          // bowl
  c.beginPath(); c.moveTo(-1.1, 0); c.lineTo(1.1, 0); c.stroke();
  for (const nx of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(nx, 0.05); c.quadraticCurveTo(nx + 0.25, 0.5, nx - 0.1, 0.9); c.stroke(); }  // noodles
  c.strokeStyle = `rgba(255,214,102,${fl})`; c.beginPath(); c.moveTo(0.7, 1.2); c.lineTo(-0.1, 0.1); c.moveTo(0.95, 1.1); c.lineTo(0.15, 0.05); c.stroke();  // chopsticks
  c.restore();
  text(c, 'NOODLE HOLE', 0, 2.2, 0.42, '#ff9ec7', 0.06);
};
```

The other props follow the same pattern (the table in 6.3 gives sizes and colours). The full prototype is 243 lines and can be lifted almost directly. Swap its fake `glyphs()` for `Npcs.script` when it exists.

*Easter egg for whoever reads this far: the lift deck is 3.5 m wide because that is exactly one Pantry lamp-to-lamp spacing minus a Noodle Hole stool. It isn't, really. But Clunk says it is, and nobody argues with Clunk.*
