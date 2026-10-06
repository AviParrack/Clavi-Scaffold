# Pocket Orbit v4 — module spec

*The contract between the core (written first) and the feature modules (built in parallel).
Read this whole file before writing a module. Core files are read-only for module authors.*

> **v4 stage 2:** [design/V4-CONTRACT.md](design/V4-CONTRACT.md) is binding and wins over this file where they differ (new modules haul, mochi, npcs; new S fields, keys, jobs).
> Test loop: `for t in physics core economy stations eva mobs wrecks combat haul npcs mochi; do node tests/test_$t.js | tail -1; done`
> **Added after the contract (integration fixes):** `Econ.buy/equip/setFuel/swapFrame` may return `{ok:false, why:'lift'}` (pass `{confirm:true}`),
> `Econ.buyBundle`, `Econ.safeFill`, `Econ.liftNow`, `Econ.towKm`; `EVA.airHint`, `EVA.surfaceCap`, `EVA.THROW_CD`; `Mochi.nearestAir`, `Mochi.noon`,
> nav target id `mochi:pad`; `Game.knock`, `Game.freshBump`, `Game.braced`; `Haul.CANT` (0.3 rad exhaust cant while towing; `g.fired.cant`), `Haul.NOSE_V`;
> Shift+Tab steps nav targets back; dev mode also toggles by typing d-u-c-k (localStorage, `?dev=0` overrides).

## The game in one breath

You are a cute alien prospector in a toon-shaded asteroid belt with **real orbital mechanics**.
Launch from Mochi in the Crumb Belt round the star Ember, fly (thrusters with inertia, Kepler path preview), land on rocks, **hop out on EVA**,
dig with a **mining laser** (Worms / Noita style destructible terrain), haul ore and gems back to an
**orbital station**, sell, buy **upgrades** (engines with real Isp/thrust tradeoffs, fuels, tanks, suit,
guns), salvage **wrecks**, squish **space bugs**, fight **pirates**. Physicist owner: physics must be honest,
numbers shown must be real (Δv, TWR, Isp), jokes welcome, everything dummy-proof.

## Files and owners

| file | owner | notes |
|---|---|---|
| js/config.js | core | bodies, rubble, base ship stats (`CONFIG.ship`), items (`CONFIG.items`), sim |
| js/world.js | core | star root, rails, epicycle rubble swarms, gravity (Hill-sphere frame correction), `surfaceR` |
| js/terrain.js | core | per-body dig grid, collide/raycast/dig, baked overlay |
| js/physics.js | core | ship step (main engine, ion drive, RCS), predict, orbit elements |
| js/game.js | core | registry, flight, landing on grid, docking hold, warp, pickups, damage, nav, goals, save, hints |
| js/render.js | core | camera (rotation for EVA), bodies, ship, HUD, `Render.kit` |
| js/main.js, index.html | core | input, URL params, DOM warp bar, loop |
| js/economy.js, js/shop.js | **economy** | money rules, prices, upgrade catalog, stats hook, Orion, DOM shop |
| js/stations.js | **stations** | orbital stations, docking, hub spawn, station art, station chatter |
| js/eva.js | **eva** | astronaut, walking/jetpack, mining laser, suit, boarding, EVA camera |
| js/mobs.js | **mobs** | space bugs on Kiwi / Big Potato, AI, bites, jelly drops |
| js/wrecks.js | **wrecks** | derelicts (orbital + crashed), salvage, loot, crew logs |
| js/combat.js | **combat** | pirates, bullets, ship guns, pirate zone, bounties |
| tests/test_<id>.js | each module | Node tests via tests/harness.js |

**Never edit a file you do not own.** If the core needs a change, write it under *Core requests* in your
final report (what, why, the exact patch if small). Work around it meanwhile (feature-detect, fallback).

## Code style (Avi's preferences)

Plain JS, no build step, no libraries, no network, no image files. One IIFE per file that ends with
`Game.register({...})` and, if other modules need it, exposes one global (`const Econ = (() => {...})();`).
Must load in Node with no DOM: create DOM only inside hooks, guarded by `typeof document !== 'undefined'`.
Blocks separated by `// ---------------- name ----------------` dividers, short functions, minimal comments,
readable names. Units: metres, seconds, tonnes (ship), kg (cargo), dollars. Log notable events with
`Game.log(g, msg)` (shows as `[orbit] ...` in the console) so tests and humans can follow along.

## Core state (g)

`g.t` sim seconds · `g.real` real seconds · `g.dev` dev mode · `g.w` world (`w.bodies`, `w.byId`, `w.rocks`, `w.swarms`, `w.root`)
`g.S` derived ship stats (copy of `CONFIG.ship` after every module's `stats` hook; **read stats here, never CONFIG.ship**)
`g.sh` ship `{x, y, vx, vy, ang, omega, fuel, xe, rcs, hull, cargoKg}`
`g.status` `'flying' | 'landed' | 'docked' | 'dead'` · `g.mode` `'ship' | 'eva'` (eva module sets it)
`g.landedOn` body · `g.land` `{lx, ly, nx, ny}` · `g.attach` dock (see `Game.dock`)
`g.money` · `g.cargo` `{item: qty}` (ship hold, mass counts) · `g.pack` `{item: qty}` (astronaut backpack)
`g.astro` `{on, x, y, vx, vy, ang, hp, hpMax, r}` astronaut (eva module drives it; others read it)
`g.mod[id]` your module's state (create it in `init`) · `g.ui` non-null while a DOM panel is open (sim pauses)
`g.ref` reference body · `g.orb` orbit elements vs `g.ref` · `g.pred` path preview · `g.nearDist` clearance ·
`g.rockTTC` seconds until the ship touches the first rubble rock on a hit course (found by straight-line closest approach,
confirmed along the curved path preview beyond 2 s; tracked within 400 m or `Game.LOOK_T` ≈ 76 s; Infinity if none; the preview ignores rubble)
`g.navId` / `g.approach` nav target and closest approach · `g.done` finished jobs · `g.warp`, `g.warpMax`, `g.warpWhy`
`g.frame` `{id, name, body, state(t)}` the frame the path preview is drawn in (the ref body; out in the belt, where the ref is
the star, the nav target's lane body (Mochi for the Hub, Kiwi, a wreck round Mochi...; lane bodies, swarms and Ember as
themselves), else the nearest lane body) · `g.starR` distance to the nearest star in its radii ·
`g.stepDt` / `g.stepsLastFrame` the physics step used last frame · `g.rockCand` rubble rocks checked per step after the cull

Bodies (v4, the Crumb Belt; `CONFIG.bodies`, numbers in tests/test_physics.js's INFO lines):

| lane / host | bodies (R m) | a | period | Hill radius m |
|---|---|---|---|---|
| root | `ember` Ember, the star (R 1200, mu 2.53e7, `star: true`, no terrain, SIZZLE at 3 R) | 0 | fixed | ∞ |
| inner lane | `glimmer` 26, `gumdrop` 28, `macaron` 32, `truffle` 24 | 24.0 km | 4644 s | 529, 523, 571, 472 |
| Mochi's lane | `mochi` 300 (home, 29.0 m/s), `pretzel` 40, `waffle` 55, `nugget` 30, `crouton` 35 | 30.0 km | 6491 s | 4001, 800, 1058, 635, 732 |
| outer lane | `potato` Big Potato 70, `tatertot` 30, `pickle` 45, `biscotti` 38 | 36.5 km | 8711 s | 1904, 773, 1091, 941 |
| Mochi's moons | `dorito` 34 (a 780), `kiwi` 52 (a 1150) | | 323 s, 578 s | 127, 248 |
| Kiwi's moon | `seed` 11 (a 170) | | 189 s | 22 |

Bodies in one lane share a, so they never drift; lanes are further apart than the Hill radii, so nothing sails through Mochi's
moons. Bodies ride circular Kepler rails round `b.par` (`w.root` = Ember has `par` null) and **never rotate**, so body-local
coordinates are just `world - bodyCentre`. **Nothing sits at the origin except the star**: always work relative to a body
(`World.bodyState(g.w, b, t)` → `[x, y, vx, vy, ax, ay]`, `World.states(w, t)[b.idx]` the same for all). `b.tidx` is the index
among non-star bodies (terrain and nest seeds use it, so Mochi/Dorito/Kiwi/Seed keep their v3 shapes).
Gravity is point-mass outside each body's deepest valley `b.Rc` and a uniform core inside it (g ∝ r); `World.phi(b, r)` is
the matching potential. `World.gravity(w, x, y, t)` = the sum of every pull plus the frame correction of the smallest Hill
sphere containing the point (minus the host's own acceleration, so moons' rails stay honest); none for the root, and the
term fades in smoothly over the outer 10 % of a Hill sphere (`World.SHELL`). `World.refBody(w, x, y, t)` is that body.
Stable parking orbits: Mochi prograde r 320-450 m (under the inner ring at 470-630 m; the Hub is at 420). Further out, Dorito
(780 m) and Kiwi (1150 m) scatter prograde orbits out of Mochi's Hill sphere within about an hour (checked at 700-3000 m);
retrograde ones to ~3 km stay bound but wander by hundreds of metres. Kiwi ~88 m; Potato ~100 m; Pretzel ~75 m; Glimmer ~55 m.

**Rubble** (`w.rocks`, on rails, no gravity): `{id, host, a, phase, n, r, e, mph, ae, swarm, gone, vmax, out, spin, tone}`.
Ring rocks circle their host; belt rocks are epicycles round Ember (`a` shared within a swarm, so swarms never shear; they
breathe by `ae` up to ~130 m). 7 swarms (`w.swarms` = `[{id, name, host, a, lam, arc, ecc, n, rocks}]`, 770 rocks) +
Mochi/Kiwi/Potato rings = 1058 rocks, the biggest 15 m. `rk.id` is stable for a seed; set `rk.gone = true` to remove a
rock (skipped by collisions, the cull, warp checks and drawing). `World.rockState(w, rk, t)`, `World.swarmState(w, sw, t)` (centre).
**Rails are a fiction near Mochi passes.** Six of the seven swarms (all but The Sprinkles) sit 3.0-3.5 km from Mochi's lane, inside
Mochi's 4 km Hill band, and even at 4.4 km Mochi pulls a quarter as hard as Ember when it passes (every ~9 game hours per swarm).
The rails ignore that; a free body does not. So a ship coasting with a swarm, or a rock a module takes off its rail (stage 2
hauling), is flung out of its swarm at the next Mochi pass (km in an hour). That is honest physics, not a bug. The streams
cannot all clear Mochi's Hill band without moving the outer lane (the gap there is ~100 m), and the stage-2 numbers use
these a's, so they stay. The `swarm` spawn picks the swarm furthest round the belt from Mochi.

## Hooks (all optional; every hook gets `g` first)

| hook | when | return |
|---|---|---|
| `init(g)` | new game, before stats/ship/spawn | create `g.mod[id]` |
| `load(g, data)` | after init, if a save exists | restore from your `save` output |
| `stats(g, S)` | `Game.recalc(g)` | mutate S (upgrades) |
| `ready(g)` | after the ship is placed | |
| `respawn(g, why)` | after a crash / tow (`why` = 'crash'/'tow') | fees, cleanup |
| `died(g, why)` | ship destroyed | |
| `onKey(g, code)` | key pressed (e.code, no repeats) | `true` = consumed |
| `onMouse(g, m)` | mouse pressed/released; `m = {x, y, sx, sy, px, down, pressed, released, button, right}` | `true` = consumed |
| `shipCtrl(g, ctrl, inp)` | before physics | mutate `ctrl {main, ion, rot, kill, fwd, left}` |
| `warpLimit(g)` | every frame | `null`, `{max, why, reset, toast}`, or `{within: s, why}` (this frame may cover at most s sim seconds) |
| `frame(g, inp, dt, simDt)` | once per frame before physics (`simDt` = sim seconds this frame, 0 when paused) | |
| `step(g, dt)` | every physics step (dt = 1/240 near anything, up to 0.5 s far out at big warps; up to 256 per frame). Keep it tiny. | |
| `after(g, inp, dt, simDt)` | once per frame after physics | |
| `interactions(g)` | every frame | `[{key: 'KeyF', text, dist, act(g), col}]` (nearest per key wins, shown as a prompt) |
| `targets(g)` | damage & raycasts | `[{id, team, x, y, r, name, hit(g, dmg, kind, src)}]`, teams `'player'/'pirate'/'bug'` |
| `navTargets(g)` | Tab / click targeting | `[{id, name, col, r, state(t) → [x, y, vx, vy]}]` |
| `camera(g)` | every frame | `null` or `{x, y, zoom, rot, snap}` (zoom in px/m before user zoom; rot so local up = screen up: `atan2(uy, ux) - π/2`) |
| `hint(g)` | every frame | string (priority 50) or `{text, pri}`; impact warning is 80 |
| `controls(g)` | every frame | controls line string, or null |
| `hudRows(g)` | ship panel | `[{label, val, col}]` |
| `drawWorld(g, kit)` | world transform active (metres, **y up**), after bodies/pickups, before the ship | |
| `drawWorldTop(g, kit)` | world transform, after the ship (astronaut, beams) | |
| `drawScreen(g, kit)` | screen px, before HUD | |
| `drawHUD(g, kit)` | screen px, HUD layer; use `kit.stackLeft(h, title)` / `kit.stackRight(w, h, title)` for panels | |
| `goal(g, id)` | a job finished | |
| `save(g)` | periodic + on goal/dock | JSON-able data |

Errors thrown in hooks are caught, shown in a red bar, and the game keeps running (tests run strict and throw).

## Core API (Game.*)

- Flight: `dock(g, {name, state(t), ang, pushDir(g), onRelease(g)})` pins the ship (status 'docked'); thrusting releases.
  `release(g, push)`, `impulse(g, dvx, dvy)` (lifts off ground/dock), `landAt(g, body, th)`, `circularAround(g, b, r, th)`,
  `addSpawn(id, name, place(g))` (stations adds `'hub'`, which becomes the default spawn), `respawn(g, why)`, `recalc(g)`.
- Damage: `hurtShip(g, dmg, word)`, `hurtAstro(g, dmg, word)`, `healShip`, `die(g, why)`,
  `dealDamage(g, {x, y, r, dmg, kind, team, falloff, dig})` (area; skips `team`), `targets(g)`,
  `raycast(g, x, y, dx, dy, len, {team, skip, terrain, targets})` → `{t, x, y, target, body, mat}` or null.
- Terrain: `nearestBody(g, x, y)` → `{b, lx, ly, d, alt, bx, by, bvx, bvy, ux, uy}` (u = local up),
  `dig(g, body, x, y, r, power, {collect, toward: [x, y]})` (frees gems as pickups; `collect` pops ore out as
  5 kg chunks that fly `toward`), plus raw `Terrain.of(b)`, `Terrain.collideCircle(T, lx, ly, r)` → `{nx, ny, depth}`,
  `Terrain.raycast`, `Terrain.solid(T, lx, ly)`, `Terrain.mat`. Hardness: regolith 1, ice 1.4, iron 2.2, nickel 2.8, platinum 3.6
  (a cell breaks after `hardness` dig units). Gems: `Terrain.of(b).gems` = `[{type, lx, ly, state: 'buried'|'loose'|'taken', seen}]`;
  set `seen = true` to draw a buried gem (scanner).
- Goods: `addCargo(g, item, qty)` → added, `removeCargo`, `addPack`, `unloadPack(g)` (pack → hold), `kgOf(bag)`,
  `spawnPickup(g, {x, y, vx, vy, item, qty})`. Pickups fall, settle, get magnetised to the astronaut within 3 m
  (→ pack; gems may overfill it by 4 kg), and scooped by the ship within radius + 1.2 m + `S.tractor` (→ hold, not while
  the astronaut is out). Items: see `CONFIG.items`.
  `p.kinematic = true` skips gravity, magnet and terrain for a pickup a module moves itself (collection still runs).
- Nav: `navTargets(g)`, `navTarget(g)`, `refresh(g)`.
  `pathTouch(g, state, reach, tEnd)` → the sim time the path preview first comes within `reach` of a moving thing
  (`state(t)` → `[x, y, ...]`), `null` if not before `tEnd`, `undefined` if the preview ends first. `Game.LOOK_T` (~76 s): how far
  ahead anything a one-frame jump could reach must be tracked (20 s warning + one 1024x frame at 20 fps + 5 s).
- Jobs: `addGoals([{id, order, text, reward, test(g)}])`, `goal(g, id)` (pays `reward`, toasts, saves).
- Feedback: `popup(g, text, col, x, y, size)` → the popup (world-anchored comic word; within 60 m of a moon it rides along with it),
  `toast(g, text, col, key)` (big banner, queued),
  `burst(g, kind, x, y, n, {vx, vy, speed, dir, spread, life, col, size})` kinds `boom puff smoke dust spark flash ion` or any (dot),
  `log(g, msg)`, `g.shake` (0..1 screen shake).
- Save: `save(g)`, `wipeSave()`. Core saves money, cargo, pack, jobs, ship tanks, each module's `save(g)`, the flight
  state (`t`, ship, status, landed spot, dock station id; restored only for the same seed and no `?spawn=`) and per-body
  dug cells and taken gems (`Terrain.snapshot/restore`). Dead at save time means the crash tow happens on load.
  `Game.create(seed, spawn, {fresh, noSave})`: `fresh` skips reading the save, `noSave` never writes (?fresh=1, ?mods=).
  Saves run every 30 s, on jobs, on death and on respawn. The `respawn` hook gets `(g, why, oldTanks)`.
- Warp: `warpStep`, `setWarp`. Warps 1, 2, 4 ... 1024 (`CONFIG.sim.warps`; read the max from there). Caps: thrusters → 1x
  (resets), ion burning → `S.warpBurnMax`, a rock closing within 20 s or anything within 8 m → 4x, a rock within 5 s → 1x
  (resets), impact < 20 s → 1x (resets), plus module `warpLimit`s. **Look-ahead:** a 1024x frame covers up to 51 s
  (frames are clamped to 1/20 s real), so one frame may never jump past a warning: warp is also capped so the frame ends
  0.95 × 20 s short of a predicted impact (0.95 × 20 s, then 0.95 × 5 s, short of a rock on a hit course), and 20 s short of the end
  of the path preview; module caps of the form `{within: s}` work the same way (wrecks use it). So 1x always arrives
  ~19-20 s before an impact, at any frame rate. At most 256 physics steps per frame. Above 256 × 1/240 s
  of sim per frame the step grows (adaptive, internal `stepSize`): at most `dtMax` 0.5 s, `dynFrac` 0.02 of every body's
  sqrt(r³/mu), `gapFrac` 0.2 of clearance / closing speed to every surface and rock, and (swept) never longer than a
  closing, reachable rock's hit radius / relative speed, so no step jumps a rock. Engines, EVA and anything close keep
  1/240 s; docked and landed holds are exact at any step (they take big steps at big warps, so `step` hooks see dt up to
  ~0.4 s while docked or landed). Loose pickups substep by height (1/60 s near the ground), so they never fall through
  it at any warp. Rubble is culled per frame (internal `rockCull`, swept bounds; bit-identical to checking every rock;
  `Game.cullRocks = false` turns it off for tests). Modules with per-frame work should chunk big `simDt`s themselves
  (mobs ticks homes in ≤ 1.2 s chunks).
- Star: within `SIM.starWarn` 6 radii a hint warns; within `starKill` 3 radii the ship dies (SIZZLE). Paths into the star are impacts.
- Path preview: near a body, 1500 steps over ~an orbit (60-600 s); out in the belt, `predictBelt` 4000 s in `predictBeltSteps`
  1500 steps. Impacts are tested along every segment (closest approach of the straight relative motion), so a 2.7 s step
  cannot skip a 48 m asteroid. `Physics.segEntry(ax, ay, bx, by, reach)` is that test (fraction of the step, or -1).
- RCS: an empty tank leaves a reaction wheel at 15 % torque (no propellant). Rock and wreck hits are capped at 45 hull.

## Cross-module APIs (feature-detect: `typeof Econ !== 'undefined'`; every module must still work when the others are off)

**Econ** (economy.js)
- `Econ.openShop(g, station)` opens the DOM station panel and sets `g.ui = 'shop'` (sim pauses); closing sets `g.ui = null`.
  `station = {id, name, kind: 'hub'|'outpost'|'black', keeper, blurb, buy: {item: priceMult}, tabs: ['services', 'sell', 'ship', 'suit', 'weapons'], fuelMult}`.
- `Econ.closeShop(g)`, `Econ.sellPrice(g, item, station)` → $/unit, `Econ.sellAll(g, station)` → $ earned,
  `Econ.refuel(g, station)` / `Econ.repair(g, station)` → $ spent (partial when broke).
- `Econ.grant(g, upgradeId)` installs an upgrade for free (wreck blueprints) → its name, or null if owned/unknown.
  `Econ.randomBlueprint(g, rand)` → an upgrade id the player does not own (or null). `Econ.CATALOG` = `[{id, name, cat, price, desc}]`.
- Without Econ: stations refuel and repair for free and there is no shop.
- Also exported (as built): `buy, canBuy, priceOf, equip, setFuel, setIonFuel, bestFuel, firePulse, previewS, metrics, twrOn,
  quote, restockRcs, sell, holdValue, hubStation, ENGINES, FUELS, ION_FUELS, ORION, PAD_DEPOT`. Station fields it reads:
  `buy {item | kind | '*': mult, 0 = refuses}`, `fuelMult, repairMult, priceMult, tabs, kind, keeper, blurb`.
  The stats hook sets `S.engine, engineName, fuelId, fuelDens, tankVol, ionFuelId, orionCount, massParts`.

**Stations** (stations.js): `Stations.list(g)` → `[{id, name, kind, r, state(t)}]`, `Stations.dockedAt(g)` → station or null,
`Stations.byId, dock(g, id, instant), pirateFree(g, x, y)` (260 m bubble around Rust's), `portInfo`. Spawns `hub` (default), `outpost`, `rusts`.
Mochi Hub orbits Mochi at 420 m, Kiwi Outpost Kiwi at 95 m, Rust's orbits Big Potato at 600 m (well inside its Hill sphere).
Core spawns: `pad`, `orbit`, `belt` (Mochi's ring), `kiwi`, `pretzel`, `potato`, `glimmer`, `swarm` (inside the belt swarm furthest from Mochi).

**Combat** pirate zones: Glimmer, Big Potato, Biscotti (none on the Mochi → Pretzel hop).

**EVA** (eva.js): `EVA.isOut(g)`; everything else is in `g.mode`, `g.astro`, `g.pack`.

## Render.kit (in draw hooks)

`ctx, W, H, cam {x, y, zoom, rot, map, userZoom}, px() (1 screen px in m), toScreen(x, y), screenToWorld(sx, sy), screenAng(a)`
(world angle → canvas rotation for screen-space sprites), `viewRect(pad)`, `onScreen(sx, sy, m)`,
`toonBlob(out, cx, cy, R, rot, [base, shade, hi], lineW)`, `shapePath`, `tag(x, y, text, col)`, `outlinedText`,
`comicPanel(x, y, w, h, title)` → content y, `row(label, val, x, y, col)` (212 px wide), `bar(label, frac, x, y, col, rightText)`,
`roundRect`, `stackLeft(h, title)`, `stackRight(w, h, title)`, `fit(text, w)`, `wrapText(text, w, sep = ' ', even = true)` → lines,
`edgeArrow(key, x, y, text, col, fill)` (off-screen arrow, laid out by the core clear of panels and other labels; the nav
target gets one automatically), `fmtDist, fmtT, money`, `drawPickup`,
colours `INK #1b1433, PAPER #fff4dc, PAPER2 #ffe2b0, COL {good, warn, bad, pro, retro, tgt, dim, money}`, `LIGHT` (sun dir), `FONT` (Fredoka).

**Markers and hint words:** the ⊗ is the **BRAKE** marker (teal: target-retrograde within 300 m of the nav target;
pink: orbital retrograde when an impact is predicted). Hints always say "point the nose at the ⊗ BRAKE marker".
On a dive into a star the ⊗ gets no label; the prograde marker is labelled **BURN** instead (braking only steepens the dive).

**Look:** toon / cel shading. Flat base + shadow band away from `LIGHT` (upper left) + small highlight + thick ink outline
(`INK`, ~2-3 screen px: use `lineWidth = 2.5 * kit.px()` in world space). Cute faces and eyes on things that live. Comic
words for impacts (`Game.popup`). Draw sprites in world space at true size, but give tiny things a minimum screen size so
they stay visible when zoomed out (`Math.max(size, 6 * kit.px())`). Ship is 9 m long; astronaut ~1.6 m tall.

## Keys (who owns what)

Core: **W** engine, **Shift** fine, **A/D** spin, **S** stop spin, **arrows** RCS nudge, **X** ion drive, **Tab** / click target,
**, .** warp, **P/Esc** pause, **R R** tow home (R after a crash), **T** next spawn (dev), **M** cycles flight → map → belt map, **+/- wheel** zoom.
Economy: **N** nuclear pulse (Orion), **Esc** closes the shop (consume it while `g.ui`), dev **K** +$5000.
Stations: **F** dock / open shop (interaction), **H** target the nearest station (again: cycle). Wrecks: **F** salvage (interaction).
EVA: **E** step out (landed) / board (near ship) (interaction). On foot (`g.mode === 'eva'`): **A/D** walk, **W or Space** jump, hold for
jetpack, **mouse** aim, **left mouse** mining laser (also hurts bugs/pirates), **F** interactions.
Combat: **Space** fire guns (ship mode only; read `inp.keys.has('Space')` in `frame`), left mouse fires the turret if fitted (consume in `onMouse` only then).

## Jobs (orders are the display order)

10 undock (stations) · 20 land_mochi (core) · 30 mine (eva: haul 40 kg of ore on foot) · 40 sell (economy) · 50 upgrade (economy) ·
55 pretzel (core, $150: the first hop across the belt) · 60 kiwi, 62 seed (core) · 65 gem (eva) · 70 bug (mobs) · 75 wreck (wrecks) · 80 orion (economy) · 85 pirate (combat) ·
90 glimmer (core) · 99 rich (economy: bank $20,000). Rewards $50-$1000.

## Economy targets (for balance)

Start: $300, docked at Mochi Hub, stock Prospector (Δv 394 m/s, TWR 1.46 on Mochi, 300 kg hold). Saves: `pocket-orbit-v4`.
The starter trip Hub → Pretzel → land → Hub is doable with the stock tank (tests/test_core.js flies it on ~93 m/s, 24 %).
A first Mochi ice run (3-5 min) nets ~$150-300. First upgrade within 1-2 runs (~$400-800).
Kiwi/Dorito iron & amber runs ~$400-900. Potato nickel/platinum + Glimmer void opals are the rich, dangerous end (pirates).
Mid-game engines ~$2-6k, NERVA/ion ~$8-12k, endgame total spend ~$40k. A death (tow) costs the cargo plus a fee (~$100-250).

Engine table as built (v4 tripled every game ve and set `CONFIG.ISP_SCALE` = 8, so Isp and TWR are unchanged and Δv triples; real-equivalent Isp = ve × 8 / 9.81):

| engine | thrust kN | mass t | fuels (ve m/s → Isp s) |
|---|---|---|---|
| Sparrow (stock) | 7 | 0 | methalox 450 (367), kerolox 414 (338) |
| Brick | 16 | +0.35 | kerolox 375 (306), hypergolic 390 (318) |
| Kestrel | 8 | +0.12 | hydrolox 570 (465), methalox 474 (387) |
| NERVA-chan (nuclear thermal) | 6 | +0.55 | liquid hydrogen 1140 (930), ammonia 645 (526) |
| Whisper ion (cruise add-on, X) | 0.25 | +0.25 | xenon 3900 (3180), krypton 4500 (3670) — own tank, warp up to 16x while burning |

Fuel density changes how many tonnes a tank holds (tank volume × density): methalox 1.0, kerolox 1.2, hypergolic 1.3,
hydrolox 0.45, liquid hydrogen 0.22, ammonia 0.8. Base tank volume 1.4.

## Testing (required)

- `node tests/test_<id>.js` using `const H = require('./harness'); H.load({ only: 'economy,<id>' })` (strict: hook errors throw).
  `H.run(g, frames, {keys: [...], pressed: [...], mouse})` drives the game; `Game.create(7, spawn, {fresh: true})` makes a game.
  Print `PASS/FAIL name  info` lines and exit non-zero on failure. Also run `node tests/test_core.js` and `node tests/test_physics.js`
  to make sure nothing else broke.
- Look at it: serve `python3 -m http.server <your port> --directory game` and drive it with Playwright
  (`NODE_PATH=$(npm root -g) node your_script.js`; chromium is preinstalled, never run `playwright install`).
  URL: `http://localhost:<port>/?mods=economy,<id>&dev=1&fresh=1&spawn=<id>` (`?debug=1` adds the overlay).
  `window.ORBIT.game` is the live state; `ORBIT.Game`, `ORBIT.Terrain` etc. are exposed. Take screenshots and **look at them**.
  Google Fonts fails in the sandbox: ignore "Failed to load resource" console errors. Keep screenshots and scripts out of the repo
  (use your scratch dir).
- Never touch git (no commits, no pushes). Do not post messages anywhere.
