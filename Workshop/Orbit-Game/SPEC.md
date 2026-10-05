# Pocket Orbit v3 — module spec

*The contract between the core (written first) and the feature modules (built in parallel).
Read this whole file before writing a module. Core files are read-only for module authors.*

## The game in one breath

You are a cute alien prospector in a toon-shaded asteroid belt with **real orbital mechanics**.
Launch from Ceres, fly (thrusters with inertia, Kepler path preview), land on rocks, **hop out on EVA**,
dig with a **mining laser** (Worms / Noita style destructible terrain), haul ore and gems back to an
**orbital station**, sell, buy **upgrades** (engines with real Isp/thrust tradeoffs, fuels, tanks, suit,
guns), salvage **wrecks**, squish **space bugs**, fight **pirates**. Physicist owner: physics must be honest,
numbers shown must be real (Δv, TWR, Isp), jokes welcome, everything dummy-proof.

## Files and owners

| file | owner | notes |
|---|---|---|
| js/config.js | core | bodies, rubble, base ship stats (`CONFIG.ship`), items (`CONFIG.items`), sim |
| js/world.js | core | rails, gravity (with rail-frame tidal correction), `surfaceR` |
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

`g.t` sim seconds · `g.real` real seconds · `g.dev` dev mode · `g.w` world (`w.bodies`, `w.byId`, `w.rocks`)
`g.S` derived ship stats (copy of `CONFIG.ship` after every module's `stats` hook; **read stats here, never CONFIG.ship**)
`g.sh` ship `{x, y, vx, vy, ang, omega, fuel, xe, rcs, hull, cargoKg}`
`g.status` `'flying' | 'landed' | 'docked' | 'dead'` · `g.mode` `'ship' | 'eva'` (eva module sets it)
`g.landedOn` body · `g.land` `{lx, ly, nx, ny}` · `g.attach` dock (see `Game.dock`)
`g.money` · `g.cargo` `{item: qty}` (ship hold, mass counts) · `g.pack` `{item: qty}` (astronaut backpack)
`g.astro` `{on, x, y, vx, vy, ang, hp, hpMax, r}` astronaut (eva module drives it; others read it)
`g.mod[id]` your module's state (create it in `init`) · `g.ui` non-null while a DOM panel is open (sim pauses)
`g.ref` reference body · `g.orb` orbit elements vs `g.ref` · `g.pred` path preview · `g.nearDist` clearance
`g.navId` / `g.approach` nav target and closest approach · `g.done` finished jobs · `g.warp`, `g.warpMax`, `g.warpWhy`

Bodies: `ceres` (R 300, fixed), `dorito` (34, a 780), `kiwi` (52, a 1150), `seed` (11, Kiwi's moon, a 170),
`potato` = Big Potato (70, a 1750), `glimmer` (26, a 2350). Bodies ride circular rails and **never rotate**,
so body-local coordinates are just `world - bodyCentre`. `World.bodyState(g.w, b, t)` → `[x, y, vx, vy]`.
Rubble rocks (`w.rocks`) are on rails, no gravity. Stable parking orbits: Ceres any r > 320; Kiwi ~88 m
(rubble at 118-145, Seed at 170); Potato ~100 m (rubble 115-190); Glimmer ~55 m.

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
| `warpLimit(g)` | every frame | `null` or `{max, why, reset, toast}` |
| `frame(g, inp, dt, simDt)` | once per frame before physics (`simDt` = sim seconds this frame, 0 when paused) | |
| `step(g, dt)` | every physics step (dt = 1/240, up to 256 per frame at 64x). Keep it tiny. | |
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
  (→ pack), and scooped by the ship within radius + 1.2 m + `S.tractor` (→ hold). Items: see `CONFIG.items`.
  `p.kinematic = true` skips gravity, magnet and terrain for a pickup a module moves itself (collection still runs).
- Nav: `navTargets(g)`, `navTarget(g)`, `refresh(g)`.
- Jobs: `addGoals([{id, order, text, reward, test(g)}])`, `goal(g, id)` (pays `reward`, toasts, saves).
- Feedback: `popup(g, text, col, x, y, size)` → the popup (world-anchored comic word; within 60 m of a moon it rides along with it),
  `toast(g, text, col, key)` (big banner, queued),
  `burst(g, kind, x, y, n, {vx, vy, speed, dir, spread, life, col, size})` kinds `boom puff smoke dust spark flash ion` or any (dot),
  `log(g, msg)`, `g.shake` (0..1 screen shake).
- Save: `save(g)`, `wipeSave()`. Core saves money, cargo, pack, jobs, ship tanks, and each module's `save(g)`.
- Warp: `warpStep`, `setWarp`. Caps: thrusters → 1x (resets), ion burning → `S.warpBurnMax`, < 40 m from rock → 4x,
  impact < 20 s → 1x (resets), plus module `warpLimit`s.

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

**EVA** (eva.js): `EVA.isOut(g)`; everything else is in `g.mode`, `g.astro`, `g.pack`.

## Render.kit (in draw hooks)

`ctx, W, H, cam {x, y, zoom, rot, map, userZoom}, px() (1 screen px in m), toScreen(x, y), screenToWorld(sx, sy), screenAng(a)`
(world angle → canvas rotation for screen-space sprites), `viewRect(pad)`, `onScreen(sx, sy, m)`,
`toonBlob(out, cx, cy, R, rot, [base, shade, hi], lineW)`, `shapePath`, `tag(x, y, text, col)`, `outlinedText`,
`comicPanel(x, y, w, h, title)` → content y, `row(label, val, x, y, col)` (212 px wide), `bar(label, frac, x, y, col, rightText)`,
`roundRect`, `stackLeft(h, title)`, `stackRight(w, h, title)`, `fit(text, w)`, `fmtDist, fmtT, money`, `drawPickup`,
colours `INK #1b1433, PAPER #fff4dc, PAPER2 #ffe2b0, COL {good, warn, bad, pro, retro, tgt, dim, money}`, `LIGHT` (sun dir), `FONT` (Fredoka).

**Look:** toon / cel shading. Flat base + shadow band away from `LIGHT` (upper left) + small highlight + thick ink outline
(`INK`, ~2-3 screen px: use `lineWidth = 2.5 * kit.px()` in world space). Cute faces and eyes on things that live. Comic
words for impacts (`Game.popup`). Draw sprites in world space at true size, but give tiny things a minimum screen size so
they stay visible when zoomed out (`Math.max(size, 6 * kit.px())`). Ship is 9 m long; astronaut ~1.6 m tall.

## Keys (who owns what)

Core: **W** engine, **Shift** fine, **A/D** spin, **S** stop spin, **arrows** RCS nudge, **X** ion drive, **Tab** / click target,
**, .** warp, **P/Esc** pause, **R R** tow home (R after a crash), **T** next spawn (dev), **M** map, **+/- wheel** zoom.
Economy: **N** nuclear pulse (Orion), **Esc** closes the shop (consume it while `g.ui`), dev **K** +$5000.
Stations: **F** dock / open shop (interaction), **H** target the nearest station (again: cycle). Wrecks: **F** salvage (interaction).
EVA: **E** step out (landed) / board (near ship) (interaction). On foot (`g.mode === 'eva'`): **A/D** walk, **W or Space** jump, hold for
jetpack, **mouse** aim, **left mouse** mining laser (also hurts bugs/pirates), **F** interactions.
Combat: **Space** fire guns (ship mode only; read `inp.keys.has('Space')` in `frame`), left mouse fires the turret if fitted (consume in `onMouse` only then).

## Jobs (orders are the display order)

10 undock (stations) · 20 land_ceres (core) · 30 mine (eva: haul 40 kg of ore on foot) · 40 sell (economy) · 50 upgrade (economy) ·
60 kiwi, 62 seed (core) · 65 gem (eva) · 70 bug (mobs) · 75 wreck (wrecks) · 80 orion (economy) · 85 pirate (combat) ·
90 glimmer (core) · 99 rich (economy: bank $20,000). Rewards $50-$1000.

## Economy targets (for balance)

Start: $300, docked at Ceres Hub, stock Prospector (Δv 131 m/s, TWR 1.46 on Ceres, 300 kg hold).
A first Ceres ice run (3-5 min) nets ~$150-300. First upgrade within 1-2 runs (~$400-800).
Kiwi/Dorito iron & amber runs ~$400-900. Potato nickel/platinum + Glimmer void opals are the rich, dangerous end (pirates).
Mid-game engines ~$2-6k, NERVA/ion ~$8-12k, endgame total spend ~$40k. A death (tow) costs the cargo plus a fee (~$100-250).

Suggested engine table (economy owns final numbers; real-equivalent Isp = ve × 24 / 9.81):

| engine | thrust kN | mass t | fuels (ve m/s → Isp s) |
|---|---|---|---|
| Sparrow (stock) | 7 | 0 | methalox 150 (367), kerolox 138 (338) |
| Brick | 16 | +0.35 | kerolox 125 (306), hypergolic 130 (318) |
| Kestrel | 8 | +0.15 | hydrolox 190 (465), methalox 158 (387) |
| NERVA-chan (nuclear thermal) | 5 | +0.8 | liquid hydrogen 380 (930), ammonia 215 (526) |
| Whisper ion (cruise add-on, X) | 0.25 | +0.25 | xenon 1300 (3180), krypton 1500 (3670) — own tank, warp up to 16x while burning |

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
