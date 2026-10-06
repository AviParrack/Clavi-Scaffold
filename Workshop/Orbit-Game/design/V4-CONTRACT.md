# Pocket Orbit v4: stage-2 contract (binding)

*Integrator · 2026-10-06 · supersedes [lore.md](lore.md), [progression.md](progression.md), [mochi.md](mochi.md) and SPEC.md wherever they disagree.*
*The three docs were edited in place to agree with this file; each has a "Integrated by V4-CONTRACT" note at the top.*

**Precedence:** this file > design docs > SPEC.md (v3) > code comments. A design doc still owns its own numbers, art and lines unless this file changes them.

---

## 0. Rules for every implementer

| # | rule |
|---|---|
| 1 | **Never edit a file you do not own** (§1). Need a change in someone else's file? Feature-detect around it and list the exact patch under "Asks" in your final report. |
| 2 | Never touch git (no commit, push, checkout, stash, reset). |
| 3 | Scratch scripts and screenshots go in `/tmp/claude-0/v4-<role>/`, never in the repo. Never run `playwright install` (chromium is preinstalled). |
| 4 | Keep your files **loadable at all times**: other implementers run the full suite against the shared tree. |
| 5 | Every module must work under `?mods=` / `ORBIT_ONLY` with any subset of the others (§2.1 idiom). Readers default every new `g.S` field with `??` (§3). |
| 6 | New modules keep their constants in their own file. Style: `// ---------------- name ----------------` dividers, few comments, `Game.log` at every state change (never per step). |
| 7 | Before you finish, run the **whole** suite (§7.1), not only your own tests. Report `N passed, M failed` per file. |

## 1. File ownership

| role | owns (write) | new files |
|---|---|---|
| **econ** | economy.js, shop.js, tests/test_economy.js | |
| **ship** | physics.js, game.js, tests/test_haul.js; edits to tests/test_core.js and tests/test_physics.js for its own changes | **haul.js** |
| **eva** | eva.js, tests/test_eva.js | |
| **aliens** | stations.js, tests/test_stations.js, tests/test_npcs.js | **npcs.js** |
| **mochi** | terrain.js, tests/test_mochi.js | **mochi.js** |
| **look** | render.js, main.js, index.html (styling only), tests/playtest.js | |
| **lead** | config.js, world.js, mobs.js, wrecks.js, combat.js (frozen), index.html script tags, SPEC.md, HANDOFF.md | stubs (§8) |

## 2. Load order, globals and APIs

**Script order** (lead patch, §8): `config, world, terrain, physics, game, economy, shop, stations, eva, mobs, wrecks, combat, haul, mochi, npcs, render, main`.
Why: mochi after eva (the lift's `step` runs after eva's); npcs after mochi, so NPC sprites draw over mochi's props in `drawWorld`; haul before both.

### 2.1 Feature detection (one idiom, everywhere)

```js
const on = (g, id) => !!(g.mod && g.mod[id]);                          // module active (its init ran)
if (typeof Haul !== 'undefined' && Haul && Haul.free) list = Haul.free(g);   // new globals are undefined when filtered
if (typeof EVA !== 'undefined' && on(g, 'eva') && EVA.topUp) EVA.topUp(g, true);   // old globals exist even when filtered
```

New modules follow econ's pattern: `Game.register(mod); if (!Game.mods.includes(mod)) return undefined;`. **Mochi registers its carvers only after that check**, so `?mods=eva` gets v3 Mochi.

### 2.2 Core additions (game.js / physics.js, owner **ship**)

| item | exact shape | readers |
|---|---|---|
| `g.opts` | `Game.create` stores a shallow copy of its opts: `{ dev, fresh, noSave, build, inf, xlate }` | econ (`build`, `inf`), npcs (`xlate`) |
| `ctrl.side`, `ctrl.dash` | `readShipCtrl` adds `side` (−1..1) and `dash` (bool). With `(S.sideThrust ?? 0) > 0`: ←/→ → `side`, Shift+←/→ → old `left`. Without pods: exactly v3. Double-tap ←/→ within 0.25 s starts a dash if `g.t ≥ g.dash.readyAt` | physics |
| `Physics.step(sh, ctrl, t, dt, w, S)` | side force `side × S.sideThrust × (dash ? S.dashBoost : 1)` kN along the lateral axis; burns `sh.fuel` at F / S.sideVe (kN/(m/s) = t/s) | |
| `g.fired.side`, `g.dash` | `g.fired.side` = last side command (−1..1); `g.dash = { until, readyAt }` | look (puffs, dash ring) |
| hook **`burnWarp(g) → number`** | when the main engine fires and `max(burnWarp) > 1`, warp may stay at `min(that, S.warpBurnMax ?? 16)` instead of resetting to 1x; steps stay `SIM.dt`. Side pods and dashes still cap at 1x | haul provides |
| `hurtAstro(g, dmg, word)` | returns early while `g.t < (g.astro.invUntil ?? 0)` (popup `MISS!`); damage × `(1 − (g.S.suitArmor ?? 0))` | eva sets `invUntil` |
| step size and rock TTC | include `Haul.free(g)` rocks (feature-detected) next to rail rocks | |
| `Game.mods` | already exported; used for the register check | all new modules |

### 2.3 Haul (haul.js, owner **ship**)

| API | returns | used by |
|---|---|---|
| `Haul.TYPES` | `{ gravel, slush, clank, sparkle }` each `{ rho, perT, ore, Q, hard, gemP, gem, rMax, col: [base, shade, hi] }` (progression §3.2, §11.3) | look |
| `Haul.typeOf(g, rk)` | `'gravel' \| 'slush' \| 'clank' \| 'sparkle'`, deterministic `hash(seed, rk.id, region)`; rail or free | look |
| `Haul.known(g, rk)` | bool: eyes 60 m, `S.scanner` 1 → 300 m, 2 → on screen, grappled → always | look |
| `Haul.info(g, rk)` | `{ type, m, oreKg, value, gem }` (m in t, value $ at the Hub) | look, eva HUD (optional) |
| `Haul.free(g)` | live array of free rocks `{ id, type, r, m, oreKg, gem, x, y, vx, vy, ang, spin, out, tone }` | ship core, eva, look |
| `Haul.rayRocks(g, x0, y0, x1, y1)` | `{ rock, x, y, d } \| null` (rail and free) | eva laser |
| `Haul.chip(g, rock, power, dt, toward)` | kg removed; spawns 5 kg chunks flying to `toward = [x, y]` | eva laser |
| `Haul.blast(g, x, y, E)` | `{ cracked }` (E in J) | eva bombs |
| `Haul.towInfo(g)` | `null \| { id, x, y, r, m, len, tension, type }` | look (tow camera) |
| `Haul.sellPoints(g)` | `[{ id, name, x, y, vx, vy, r, mult(type) }]`: Crusher + `Stations.list(g)` via `st.state(t) → [x, y, vx, vy]`; multipliers live in haul's own `BUY` table keyed by station id | |
| `Haul.devRock(g, type, r)` | spawns a free rock `3r + S.radius` ahead of the nose, velocity matched | econ dev tab |
| `Haul.CRUSHER` | `{ id: 'crusher', a: 30000, dph: 0.30, r: 25 }` (phase relative to Mochi) | |

Rail rocks retire only through haul: `rk.gone = true` (core, combat and render already skip gone rocks); haul's `load` re-applies its `gone` list.

### 2.4 Other cross-module APIs

| global (owner) | API (exact) | notes |
|---|---|---|
| `EVA` (eva) | `EVA.isTethered(g) → bool` | `g.mode === 'eva'` covers both on foot and tethered |
| | `EVA.topUp(g, all = true)` | all: HP, O2, jet fuel, bombs, roll cooldown. `false`: HP + O2 only (mochi's fries) |
| | `EVA.canStepOut(g)` now true when flying or docked under progression §5.1 rules | |
| | `g.mod.eva.beam = { x0, y0, x1, y1 } \| null` stays readable | npcs laser pokes (stretch) |
| `Econ` (econ) | `isInf(g)`, `charges(g) → { crack1, crack2, crack3 }`, `spendCharge(g, id) → bool`, `applyBuild(g, id) → bool`, `topUp(g)`, `frameOf(g)`, `equipFrame(g, id) → bool`, `FRAMES`, `BUILDS`, `DEV_SHOP`, plus every v3 export | `openShop(g, station)` also takes `kind: 'dev'` |
| `Stations` (aliens) | unchanged API. Dock zone radius `DOCK_R + max(0, (g.S.radius ?? 4) − 4)`; `hub`, `outpost`, `rusts` tabs gain `'haul'` | keepers talk through `Npcs.say` when present |
| `Npcs` (aliens) | `list(g)`, `say(g, who, text, mood)`, `drawSprite(ctx, race, look, st)`, `script(race, word, w, h)`, `readable(g, race, word) → bool`, `translator(g) → 0..3`, `RACES`, `DEFS` | `translator(g)` = `g.opts.xlate` if set, else dev L override, else `g.S.translator ?? 0` |
| `Mochi` (mochi) | `spots(g) → [{ id, name, body, lx, ly, ux, uy, w, air }]`, `airAt(g, x, y) → bool`, `zoneAt(g, x, y) → zone \| null`, `outposts(g) → [{ id, name, body, lx, ly, col }]`, `TOWN`, `ST` | 18 spot ids, §5 |
| `Terrain` (mochi) | `addCarver(bodyId, fn(T, b))`, `CARVERS`; mats `wall 7`, `slab 8`, `deck 9` (`fixed: true`); `dig()` result gains `fixed` (count of fixed cells hit) | eva shows `CLINK!` when `fixed > 0` |
| `Render` (look) | `Render.drawRockAt(g, rk, x, y, ang)`: one rock painter for rail and free rocks, colours from `Haul.TYPES` when the type is known (`rk.type` or `Haul.known`), else v3 `ROCK_COLS` | haul draws free rocks through it; fallback `kit.toonBlob` |

## 3. Item ids → `g.S` fields

**Default owner:** econ's `stats` hook sets every field below on every recalc, including stock values. CONFIG.ship is **not** patched; it keeps owning the v3 fields. Every reader writes `g.S.x ?? <default>` with the default in this table, so a run without econ behaves like stock.

### 3.1 Items

| ids | tab · line | price | sets |
|---|---|---|---|
| `mule` `hauler` `barge` `leviathan` | ship · frame | $2,500 / 8,000 / 18,000 / 40,000 | `frameId` and the frame row (progression §2.1); equip only at Mochi Hub or the dev shop |
| `bulldog` `nervasama` `pocketsun` `sunflower` | ship · engine | $5,000 / 18,000 / 38,000 / 70,000 | `engine`, `thrust` (or `thrustBy[fuel]`), mount 2 / 3 / 4 / 5 |
| `dd` `dhe3` `augment` | fuel (Hub only) | $150 / 600 / 30 per t | `fuelId`; density 0.17 / 0.12 / 0.8 t/m³ |
| `side1` `side2` `side3` | ship · side | $350 / 1,200 / 3,500 | `sideThrust` 1.8 / 4.5 / 8.0 kN × k; `dashBoost` 0 / 4 / 5; `dashCd` 0 / 1.5 / 1.0 s |
| `tow1` … `tow4` | haul · tow | $450 / 2,000 / 7,500 / 22,000 | `towMax` 80 / 800 / 6,000 / 40,000 t; `cableLen` 25 / 40 / 60 / 90 m; `reelV` 0.6 / 1.0 / 1.5 / 2.5 m/s; `towTier` = min(owned, frame `towTierMax`) |
| `crack1` `crack2` `crack3` | haul · charge (consumable) | $60 / 350 / 2,000 each | not S: `Econ.charges(g)`, max 6 / 4 / 2, TNT 5 / 50 / 500 kg; each adds 0.008 / 0.06 / 0.6 t to `dry` |
| `suit1` … `suit4` | suit · suit | $250 / 800 / 3,500 / 9,000 | `suitTier` 1-4; `suitHp` 150 / 220 / 300 / 420; `suitArmor` 0 / 0.10 / 0.15 / 0.25; `suitMass` 5 / 20 / 60 / 140 kg; `walkMult` 1 / 1 / 1.25 / 1.4; `jumpMult` 1 / 1 / 1.2 / 1.35; carry +0 / 0 / 40 / 90 kg onto `packCap`; `fallSafe` 8 / 9 / 11 / 15 m/s |
| `sprint1` `sprint2` | suit · sprint | $250 / 900 | `sprint` 1.6 / 2.2 |
| `roll1` `roll2` | suit · roll | $400 / 1,400 | `roll` 1 / 2; `rollDist` 3.0 / 4.5 m; `rollT` 0.45 / 0.40 s; `rollIframes` 0.30 / 0.35 s; `rollCd` 1.2 / 0.8 s; `rollAir` 0 / 3 m/s |
| `bomb1` `bomb2` `bomb3` | suit · bomb | $600 / 1,800 / 4,500 | `bombs` 2 / 3 / 4; `bombDmg` 30 / 50 / 80; `bombR` 1.8 / 2.4 / 3.2 m; **`bombDig` 1.6 / 2.3 / 3.4 m**; `bombE` 0.50 / 1.51 / 5.02 MJ (J in S); `bombKg` 0.5 / 1 / 2; `bombCd` 8 / 6 / 4.5 s; `bombFuse` 1.8 / 1.6 / 1.4 s; `bombV` 6 / 8 / 10 m/s; `bombSticky` 0 / 0 / 1 |
| `tether1` … `tether3` | suit · tether | $300 / 900 / 2,200 | `tetherLen` 60 / 100 / 160 m; `reelA` 1.5 / 2.5 / 4.0 m/s |
| `pack3` `o2c` `jet3` `laser4` | suit · existing lines | $1,800 / 1,800 / 2,400 / 7,500 | `packCap` 160; `o2` 1,200; `jet` 7.0 + `jetFuel` 18; `laserPower` 6.5 + `laserRange` 16 + `laserDps` 85 |
| `xlate1` `xlate2` | suit · xlate | $400 / 1,800 | `translator` 1 / 2 (sold wherever a `suit` tab is: Hub, Kiwi Outpost, the Dig Hall) |

### 3.2 New S fields

| field | unit | default (`??`) | readers |
|---|---|---|---|
| `frameId`, `frameName` | id, text | `'prospector'`, `'Prospector'` | look (drawShip), shop |
| `mount`, `k`, `turnMult`, `towTierMax` | –, ×, ×, tier | 1, 1, 1, 2 | econ, shop |
| `sideThrust`, `sideVe` | kN, m/s | 0, `min(0.85·ve, 900)` | ship (game, physics), look |
| `dashBoost`, `dashT`, `dashCd` | ×, s, s | 0, 0.4, 0 | ship |
| `towTier`, `towMax`, `cableLen`, `reelV` | 0-4, t, m, m/s | 0, 0, 0, 0 | haul, look (claw), shop |
| `suitTier`, `suitArmor`, `suitMass` | 0-4, 0-1, kg | 0, 0, 0 | eva; `suitArmor` also core `hurtAstro` |
| `walkMult`, `jumpMult`, `fallSafe` | ×, ×, m/s | 1, 1, 8 | eva |
| `sprint` | × | 1 | eva |
| `roll`, `rollDist`, `rollT`, `rollIframes`, `rollCd`, `rollAir` | tier, m, s, s, s, m/s | 0, 0, 0.45, 0, 1.2, 0 | eva |
| `bombs`, `bombDmg`, `bombR`, `bombDig`, `bombE`, `bombKg`, `bombCd`, `bombFuse`, `bombV`, `bombSticky` | n, HP, m, m, J, kg, s, s, m/s, 0/1 | 0, 0, 0, 0, 0, 0.5, 8, 1.8, 6, 0 | eva (passes `bombE` to `Haul.blast`) |
| `tetherLen`, `reelA` | m, m/s | 30, 1.0 | eva |
| `translator` | 0-2 | 0 | npcs (`Npcs.translator`), eva (helmet gadget) |

Frame-aware v3 fields (`dry`, `tankVol`, `fuel`, `cargoCap`, `hull`, `rotAccel`, `length`, `radius`, `name`, `thrust`) keep their names and meanings; `S.engine` stays the engine id (**not** `engineId`).

## 4. Keys (complete; mode-aware)

Modes: **ship** = `g.mode === 'ship'` (flying, landed or docked); **foot** = `g.mode === 'eva'` and not tethered; **tether** = `EVA.isTethered(g)`. Order of handling: main.js (M, +/−, wheel) → module `onKey` in script order (econ eats everything while the shop is open) → prompts (E, F) → core.

| key | ship | foot | tether | dev only | owner |
|---|---|---|---|---|---|
| W | main engine (Shift: fine) | jump / hold: jetpack | jet up (screen) | | core / eva |
| A / D | rotate | walk | jet left / right (screen) | | core / eva |
| S | kill rotation | jet down | jet down (screen) | | core / eva |
| ↑ / ↓ | RCS fwd / back | jump / crouch | | | core / eva |
| ← / → | side pods if `sideThrust > 0`, else RCS (v3) | walk | | | ship / eva |
| Shift + ← / → | RCS translate (only when pods are owned) | | | | ship |
| double-tap ← / → | dash (side2+) | | | | ship |
| Shift | fine throttle with W | **sprint** | | | core / eva |
| Space | guns | jump | | | combat / eva |
| E | step out (tethered unless landed) | board | board within `BOARD_R` | | eva |
| F | prompts: dock, shops, salvage, **sell rock**, outpost shops | prompts: talk, rummage, shops, fries, map board, plaque, lift | prompts: talk (station visitors) | | prompt owners |
| G | grapple / release | | | | haul |
| Q | reel tow in | | winch tether in (hold) | | haul / eva |
| Z | pay tow out | | | | haul |
| B | plant crack charge | throw bomb at cursor | throw bomb at cursor | | haul / eva |
| C | | dive roll | dive roll (roll2: air dash) | | eva |
| LMB | turret (if fitted) | laser | laser | | combat / eva |
| RMB | | hold: bomb arc, release: throw | same | | eva (polls `inp.mouse.right` in `frame`; main.js never sends button 2 to `onMouse`) |
| 1-4 | | Clunk Lift stops, **only on the lift deck** | | | mochi |
| N / X / H | Orion / ion / hail | | | | econ / core / stations |
| Tab · , . · P Esc · R | nav · warp · pause · tow | same | same | | core |
| M · + − · wheel | map · zoom · zoom | same | same | | look (main.js) |
| K · T · J | | | | +$5,000 · spawn · pirate | econ · core · combat |
| O · U · I | | | | Debug Duck shop · top-up · ∞ toggle | econ |
| L | | | | cycle translator | aliens |

Free: V (keep for a stretch photo mode), Y, 5-9.

## 5. Jobs, spots, save fields and hooks

### 5.1 Jobs (JOBS panel shows the first 5 undone)

| order | id | owner | reward | | order | id | owner | reward |
|---|---|---|---|---|---|---|---|---|
| 10 | undock | stations | v3 | | 65 | gem | eva | v3 |
| 20 | land_mochi | core | v3 | | **68** | **bomb** | eva | $150 |
| 30 | mine | eva | v3 | | 70 | bug | mobs | v3 |
| **33** | **meet** | npcs | $50 | | 75 | wreck | wrecks | v3 |
| **34** | **downtown** | mochi | $75 | | **77** | **haul** | haul | $250 |
| 40 | sell | econ | v3 | | **78** | **crack** | haul | $200 |
| 50 | upgrade | econ | v3 | | 80 | orion | econ | v3 |
| 55 | pretzel | core | v3 | | 85 | pirate | combat | v3 |
| **57** | **spacewalk** | eva | $100 (was 55: collided with `pretzel`) | | 90 | glimmer | core | v3 |
| 60 | kiwi | core | v3 | | **92** | **frame** | econ | $500 |
| 62 | seed | core | v3 | | **97** | **whale** | haul | $5,000 |
| | | | | | **98** | **fusion** | econ | $2,000 |
| | | | | | 99 | rich | econ | v3 |
| | | | | | **100** | **tycoon** | econ | $1 (outside dev only) |

### 5.2 Mochi spots ↔ NPCs (role ids are lore's; mochi's table wins for positions)

| spot | named NPC (aliens) | named extra (aliens, MVP) | crowd extras MVP |
|---|---|---|---|
| `pad` | Pip (k 0), Mumble (k 1) | | |
| `guide` | | Tansy (Pipkin) | |
| `market` | Chive | Parsnip (Pipkin, the GEMS stall) | 6 |
| `lift` | | Clunk (Oggle) | |
| `canteen` | Cookie Grubb | | 3 |
| `guild` | | Sorrel (Pipkin) | |
| `skylight` · `gallery` · `archive` · `cellar` | Sizzy · Grandpa Gneiss · UNIT-7 · Velvet | | cellar 3 |
| `outpost-ice` | Foreman Okra | | |
| `outpost-iron` · `pump9` · `pitstop` | | Bonk (Oggle) · Nozzle (Oggle) · Twist (Pipkin) | |
| `forge` | Anvil Annie (fallback `{ body: 'waffle', th: 0.6 }`) | | |
| `brinepit` | **Mad Marge, now MVP** (keeper of an MVP shop; fallback `{ body: 'pickle', th: 1.2 }`; her `union` favour stays stretch) | | |
| `shrine` · `workings` | stretch | | |

Reserved names (never in random pools): Parsnip, Sorrel, Tansy, Clunk, Bonk, Nozzle, Twist, Gristle, Granny Granite.

### 5.3 Save (key stays `pocket-orbit-v4`, `v: 4`; every `load` is defensive and ignores unknown ids)

| module | saves | not saved |
|---|---|---|
| econ | `owned, engine, frame, fuelOf, ionFuel, orion, charges, stats` | `inf`, open shop (dev never saves anyway) |
| haul | `{ v: 1, gone: [ids], chipped: { id: oreKg }, free: [rocks], tow: { id, len } \| null, nextId, stats: { towed, tonnes, cracked, sold, whale } }` | rope impulse, tension, planted charges (a pending charge is lost) |
| eva | v3 fields + `stats: { spacewalks, maxTether, bombs, rolls }` | tether, bombs in flight, cooldowns (a mid-EVA save loads aboard, as v3) |
| npcs | `met, line, fav, favData, heard` (heard capped at 400) | bubbles, bark clocks |
| mochi | `seen` | lift (resets to Surface; `tunnels` spawn parks it at Main Street) |
| core | v3 | `g.opts`, `g.dash` |

### 5.4 Hooks per module (new or changed)

| module | hooks |
|---|---|
| ship (game.js) | provides `burnWarp`; `readShipCtrl` / `applyWarpCaps` / `hurtAstro` / `stepSize` changes (§2.2) |
| haul | `init, load, save, ready, step` (rope, free rocks, after eva's tether), `frame` (fuses, dock-while-towing sale/release), `warpLimit` (64x coasting with a rock), `burnWarp` (16 when towing and system accel < 0.3 m/s²), `onKey` (G Q Z B in ship mode), `interactions` (F sell, `dist: 0` while towing), `navTargets` (crusher), `hint`, `hudRows` (TOW), `died`/`respawn` (release), `drawWorld`, `drawWorldTop` |
| eva | adds `step` (tether solve), `frame` (RMB poll, sprint, roll, bombs), `camera` (tether fit), `shipCtrl` (`kill` while out), `warpLimit` 1x, `onKey` (Shift C B Q while out), `hudRows`/`drawHUD` (TETHER, BOMBS, ROLL) |
| econ | `stats` (§3), `frame` (∞ pin), `onKey` (O U I), goals |
| aliens | npcs: `init, load, save, ready, frame, interactions, hint, onKey (L), drawWorld, drawScreen, drawHUD`; stations: v3 hooks, `say` via `Npcs.say` |
| mochi | `init, load, save, ready, step (lift), frame, interactions, navTargets, hint, onKey (1-4), drawWorld, drawHUD`; spawn `tunnels` |
| look | no hooks (render/main are not modules); reads the APIs above |

## 6. Draw layers

| render.js order | content | owner |
|---|---|---|
| space, lanes, trail, path | v3 | look |
| rail rocks | `Render.drawRockAt` (type colours via `Haul`) | look |
| bodies + terrain bake | Murk-stone, slab, deck mats; warm town backwall; ink crater rims | look + terrain (mochi) |
| pickups | v3 | look |
| `drawWorld` (script order) | econ (pad depot) → stations (stations, keeper race touches, visitors via `Npcs.drawSprite`) → eva (scanner pings) → mobs → wrecks → combat → **haul** (free rocks via `Render.drawRockAt`, charges, the Crusher) → **mochi** (props, signs, lift cage, outposts) → **npcs** (NPC sprites, over the props) | as listed |
| particles, body labels | v3 | look |
| ship | 5 frame painters by `S.frameId`, nozzles by `S.engine`, plumes by fuel family, side pods and dash | look |
| `drawWorldTop` | eva (tether line, astronaut with suit tier / sprint / roll / bandolier / translator gadget, beam, bombs in flight) → mobs → combat → haul (cable and claw over the hull) | as listed |
| popups | v3 | look |
| `drawScreen` | speech and radio bubbles (npcs), shop (econ), v3 others | as listed |
| HUD + `drawHUD` | MONEY shows `∞` when `Econ.isInf(g)` (look); SUIT panel rows (eva); TOW rows (haul); lift panel, zone pill, map board (mochi); FAVOURS (npcs) | as listed |

## 7. Tests

### 7.1 Commands (from `Workshop/Orbit-Game`)

```bash
for t in physics core economy stations eva mobs wrecks combat haul npcs mochi; do node tests/test_$t.js | tail -1; done
python3 tools/bundle.py && NODE_PATH=$(npm root -g) node tests/playtest.js /tmp/claude-0/v4-<role>/shots
```

### 7.2 What each implementer adds

| role | file | must assert (each prints PASS/FAIL, exits non-zero on failure) |
|---|---|---|
| econ | test_economy.js | frame swap scales dry, tank, hold, hull per progression §2.1; Mule Δv 424 ± 1, TWR 1.80 ± 0.01; Beast (D-He3) Δv 4,065 ± 5, TWR 1.56 ± 0.01; `canBuy` → `frame` for a Sunflower on a Prospector; mount auto-swap on downgrade; NERVA-chan on ammonia 10.6 kN; JET POWER row = ½·T·ve·8 (Sunflower D-He3 40 GW); every §3.1 id sets its fields; stock S has every §3.2 field at its default; dev: ∞ pin keeps money ≥ 1e9 after a buy, `isInf`, `dev K adds $5000` still passes; `?build=beast` via `g.opts`; save round-trips frame and charges |
| ship | test_haul.js, test_physics.js, test_core.js | gravel r 4 = 509 t, $1,019; rope conserves momentum and CoM to 1e-9 over 1,000 steps; Cracker on 500 t gravel: 2-5 fragments, Σm = M, net p ≈ 0, KE = 0.03 E ± 1%; E < Q·M does not crack; sale pays oreKg × price × mult; 10 kg chipped then sold pays exactly 10 kg less; free rocks save/load; a rock hitting Mochi digs a crater and drops pickups; side pods burn main fuel at F / sideVe, Mule dash Δv 1.80 ± 0.05; `burnWarp` lets a towing burn run 16x and still caps a normal burn at 1x; `hurtAstro` respects `invUntil` and armor; `g.opts` kept |
| eva | test_eva.js | E while flying steps out tethered; distance ≤ `tetherLen` + 0.05 m; Q brings you within `BOARD_R`; boarding transfers momentum (Δv = m_A(v_A − v_S)/(m_S + m_A)); docked step-out works; roll i-frames block a bite; bomb charges refill one at a time; throw speed capped at 0.9 × escape on Seed (2.31 m/s); recoil −m_b·v/m_A; bomb digs ≥ 1 cell and calls `Haul.blast` when haul is on; `EVA.topUp(g, false)` refills HP and O2 only; works with `only: 'eva'` |
| aliens | test_npcs.js, test_stations.js | lore §12 tests 1-8, with `meet` at 33 and 5 MVP favours; keeper/named extras placed at the §5.2 spots when mochi is on; Big-ship dock radius 21 m for the Leviathan; `hub`/`outpost`/`rusts` tabs include `haul`; `only: 'npcs'` runs 600 frames without throwing |
| mochi | test_mochi.js | mochi §15 tests 1-12 (test 2 now: no `wall`/`slab`/`deck` cell lost after 300 digs; the main pad is **not** slab, the ice seam under it yields ice); `only: 'mochi'` and `only: 'eva'` (no carve) both run clean |
| look | playtest.js | v3 checks stay green; add the §7.3 items that are automatable, each skipped with `SKIP` (not FAIL) when its module is missing |

### 7.3 End-to-end integration checklist (lead runs after merge; look automates what it can)

| # | do | pass when |
|---|---|---|
| 1 | **Dev: buy everything.** `?dev=1&fresh=1`, press O → Debug Duck → Dev tab → *Max everything* | `S.frameId === 'leviathan'`, `S.engine === 'sunflower'`, every line at max, charges full; Leviathan + Sunflower drawn; MONEY reads ∞; no module error; U refills; `?dev=1&build=beast` gives the same |
| 2 | **Tethered EVA from orbit.** `?dev=1&spawn=orbit`, E | `mode === 'eva'`, `EVA.isTethered`; WASD jets in screen directions; distance never > `tetherLen`; warp 1x; Q reels to `BOARD_R`, E boards; ship held attitude (`kill`) and coasted |
| 3 | **Grapple and crack a swarm rock, then sell it.** `?dev=1&build=hauler&spawn=swarm`; U (`Econ.topUp` sets every charge to its max); G a rock; B a charge | latch toast with type/mass/value; rope taut; charge: rope cut, 5 s fuse, 2-5 fragments, seam pickups; G a fragment; at a buyer (or put ship + rock 30 m from the Crusher at matched velocity) F sells: money up by the shown value, `haul` and `crack` jobs paid |
| 4 | **NPC before and after the translator.** `?dev=1&spawn=pad`, E, walk to Mumble (x −15), F; then L (or buy `xlate2` via O), F again | first bubble in Murk glyphs with tint/icon/name; `meet` paid; after: the glyphs morph into English within 1.2 s; the hint and FAVOURS panel are English both times |
| 5 | **Walk Mochi's tunnels.** `?spawn=pad`: West Stair → Pantry → Clunk Lift (1-4) → Cellar; also `?spawn=tunnels` | zone pill names each place; lift rides with 0 HP lost; `downtown` paid at the Cellar; laser on Murk-stone gives `CLINK!` and no cells; NPCs stand on floors, not in walls |
| 6 | **Land at a surface outpost.** From the pad, hop to Frostbite Flats (267 m west, ~19 m/s each way) | lands on the plinth with 0 damage; F opens *Frostbite Flats (Foreman Okra)*; ice sells at 1.1×; Okra stands by the dome |

## 8. Lead patches before stage 2 (exact)

**8.1 `game/index.html`**, after `<script src="js/combat.js"></script>`:

```html
<script src="js/haul.js"></script>
<script src="js/mochi.js"></script>
<script src="js/npcs.js"></script>
```

**8.2 Stubs.** `game/js/haul.js` (repeat for `mochi.js` / `Mochi` / `'mochi'` / mochi, and `npcs.js` / `Npcs` / `'npcs'` / aliens):

```js
// ======================================================================
//  HAUL  —  stub. Stage-2 owner: ship. Contract: design/V4-CONTRACT.md
// ======================================================================
const Haul = (() => {
  const mod = { id: 'haul' };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;
  return undefined;                                   // the owner returns the API here
})();

if (typeof module !== 'undefined') module.exports = Haul;
```

`tests/test_haul.js`, `tests/test_npcs.js`, `tests/test_mochi.js`: one line each, `console.log('0 passed, 0 failed');`.

**8.3 `tests/test_core.js`** (verified on scratch copies of the tree at 10:40: 52/52 on today's game, and 52/52 with mochi.md Appendix A's town and ice seam carved, where unpatched it fails 2. With the town carved the whole suite (645 checks) and the playtest (23/23) stay green):

After `const WMAX = ...;` add:

```js
const built = (T, x, y) => { const k = Terrain.index(T, x, y); return k >= 0 && (!!(T.zone && T.zone[k]) || !!Terrain.MATS[T.grid[k]].fixed); };
```

In "grid matches the drawn outline", replace the two `if (Terrain.solid(...))` lines with:

```js
    const xi = (R - 0.6) * Math.cos(th), yi = (R - 0.6) * Math.sin(th), xo = (R + 0.6) * Math.cos(th), yo = (R + 0.6) * Math.sin(th);
    if (Terrain.solid(T, xi, yi) || built(T, xi, yi)) inside++;                // v4: carved town and plinths are built on purpose
    if (!Terrain.solid(T, xo, yo) || built(T, xo, yo)) outside++;
```

Replace the "ship falls when the ground under it is dug away" block body with:

```js
  const g = fresh('pad'), b = g.w.byId.mochi, TH = Math.PI / 2 - 0.6;  // v4: off the pad, east of Downtown
  Game.landAt(g, b, TH); H.run(g, 10, {});
  const ux = Math.cos(TH), uy = Math.sin(TH), up = () => { const [bx, by] = World.bodyState(g.w, b, g.t); return (g.sh.x - bx) * ux + (g.sh.y - by) * uy; };
  const h0 = up();
  for (let i = 0; i < 40; i++) Game.dig(g, b, g.sh.x - (g.S.radius + 0.5) * ux, g.sh.y - (g.S.radius + 0.5) * uy, 3.5, 5);
  H.run(g, 30, {});
  check('ship falls when the ground under it is dug away', g.status === 'flying' || up() < h0 - 0.1, `${g.status} ${(h0 - up()).toFixed(2)} m down`);
  H.run(g, 240, {});
  check('...and settles lower in the hole', g.status === 'landed' && up() < World.surfaceR(b, TH) + g.S.radius - 0.5, `${g.status} at local r ${up().toFixed(1)}`);
```

**8.4** No patches to config.js, world.js, mobs.js, wrecks.js or combat.js. **8.5** SPEC.md and HANDOFF.md: add the §7.1 test loop and a pointer to this file.

## 9. Conflicts resolved (what changed in the docs)

| # | conflict | resolution |
|---|---|---|
| 1 | `spacewalk` order 55 = core `pretzel` 55 | spacewalk → **57** |
| 2 | progression `Eva.topUp`, `S.engineId` | **`EVA.topUp(g, all)`**, **`S.engine`** |
| 3 | progression asked aliens for station x/y fields and Crusher keeper/portrait | haul reads `Stations.list(g)` + `st.state(t)` and owns its `BUY` table; Crusher keeper Gristle, Crusher shop and chomp → **stretch** |
| 4 | progression: pad hardened (`slab`); mochi delivered it | **dropped.** Downtown's Pantry sits 3.2 m under the pad; with the slab the v3 first-dig at the pad found 0 ore cells (15 before) and the playtest's mining check would fail. The Murk-stone lining already stops any crater 3.2 m down. The carver instead lays an **ice seam** 0.5-2.5 m deep across ±8 m of the pad (scratch probe: 71 ice cells, nearest 1.5 m under the astronaut) |
| 5 | JET POWER = ½·T·ve with game ve: 8× below the Isp the shop prints | shown P = **½·T·ve·ISP_SCALE**: Sunflower 40 / 20 / 40 GW, Pocket Sun 12 / 6 / 12 GW, NERVA-sama 184 MW, NERVA-chan 27 MW. T = 2P/ve is ratio-invariant, so every thrust stays |
| 6 | Suit bomb crater radius 1.6 / 2.9 / 3.8 m for 1 : 3 : 10 energy | crater r ∝ E^⅓: **1.6 / 2.3 / 3.4 m** |
| 7 | Tether yank "Mecha-Pip with a full pouch moves the stock ship 0.30 m/s" assumed a 265 kg astronaut | 85 + 140 + 250 kg = 475 kg → **0.50 m/s** (Mule 0.14) |
| 8 | Script order: lore "npcs after combat", mochi "after eva", props would cover NPCs | **combat, haul, mochi, npcs, render** |
| 9 | Dev ∞: "buy does not subtract" special case | econ's `frame` pins `g.money = max(g.money, 1e9)` while ∞ is on; buys subtract normally; `canBuy` never says broke by construction |
| 10 | Fries: mochi counter wrote `g.mod.eva` directly; lore's `noodles` favour also healed | mochi calls `EVA.topUp(g, false)`; the favour is a plain hand-in |
| 11 | Mochi's shop keepers (Parsnip, Sorrel, Bonk, Nozzle, Twist) and Tansy/Clunk had no sprites; Marge was stretch but keeps an MVP shop | aliens places them as **named extras**; Marge → MVP NPC; names reserved |
| 12 | RMB never reaches `onMouse` (main.js sets `pressed` for button 0 only) | eva polls `inp.mouse.right` in `frame` |
| 13 | Tethered-EVA and tow cameras | eva's `camera` hook (fit astronaut + ship, `Render.kit` W/H, else 800 px); look reads `Haul.towInfo` in the flight camera |
| 14 | Progression said digits and the wheel were free | wheel = zoom (main.js); 1-4 = Clunk Lift on the deck |
| 15 | Two rock painters (render for rail, haul for free) | one: `Render.drawRockAt` (look), colours from `Haul.TYPES` |
| 16 | Feature detection: old globals exist even when filtered | active check is `g.mod[id]` (§2.1) |

## 10. Scope cuts (moved to stretch)

| role | cut |
|---|---|
| ship | free–free collisions; per-tier claw art (MVP: one harpoon claw for every tier); Big Hug arms; 60 s ghost trail; cable tension flash; Crusher conveyor, smokestack, chomp, shop and keeper; flinging rocks at pirates; Chorus ion |
| econ | Chorus; per-station stock (Rust's charges ×0.8); frame silhouettes on cards |
| eva | Thunder Pucks sticking to bugs and pirates (MVP: terrain and rocks); pip mood colours; ground-pound; magnetic boots; 4x tethered warp; air refill in Downtown |
| aliens | `hiback` favour (5 MVP favours: salt, noodles, shiny, forge, drawer); laser pokes; The Lantern; race portraits (`Npcs.portraitSVG`) |
| mochi | pad hardening (replaced, §9 #4); noon beam; Rock Garden; Survey Camp 5 / Map Room; Waffle's holes; Brine Pit back room |
| look | Leviathan radiator glow; per-fuel plumes (MVP: chemical, NTR, fusion, afterburner); golden duck; touch buttons for G/B; ship HOLD light while you are out |
