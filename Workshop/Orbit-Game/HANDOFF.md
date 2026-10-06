# Pocket Orbit — HANDOFF

*2D asteroid-belt mining game with real orbital mechanics. Stage: v4 (the Crumb Belt, the upgrade ladder to a fusion beast, aliens, tethered EVA, Downtown Mochi) built, reviewed and fixed.*

## 🟢 v4 (2026-10-06): what Avi asked for, and where it lives

| ask | built | where |
|---|---|---|
| triple the starting fuel | Δv ×3 (every ve ×3, `ISP_SCALE` 8): stock 394 m/s, Isp and TWR unchanged | config.js, economy.js |
| a great asteroid belt, moonless rocks drifting | star Ember at the origin; Mochi lane 30 km (Pretzel, Waffle, Nugget, Crouton co-orbital), inner lane 24 km (Glimmer & co), outer 36.5 km (Big Potato & co); 7 epicycle swarms; warp to 1024x | config.js, world.js, game.js |
| rename Ceres | **Mochi** (its moons Dorito, Kiwi, Seed stay) | everywhere |
| dinky → fusion beast, haul and break asteroids | frames Prospector → Mule → Hauler → Barge → Leviathan; engines to the Sunflower D-He3 torch; side pods + dash; tow gear, crack charges, the Crusher | economy.js, shop.js, haul.js, physics.js, render.js |
| dev mode, ∞ money, shop anywhere | `?dev=1` / `#dev` / type d-u-c-k: ∞ money, O = Debug Duck shop, U top-up, I ∞ toggle, `?build=beast` | economy.js, shop.js, main.js |
| aliens, races, NPCs, translator | six races, 28 named NPCs + crowds, glyph scripts that morph into English with the Universal Translator, favours | npcs.js, stations.js |
| EVA anytime on a tether, laser, bombs, side thrusters, sprint, roll, exoskeleton | E steps out tethered when flying or docked; laser chips rocks; B / right-click bombs; Shift sprint; C roll; suit tiers to Mecha-Pip | eva.js |
| Mochi tunnels, NPCs, outposts | Downtown under the pad (9 rooms, Clunk Lift 1-4, map boards), 3 surface + 3 belt outposts | mochi.js, terrain.js |

- **Contract:** [design/V4-CONTRACT.md](design/V4-CONTRACT.md) (ownership, APIs, S fields, keys, jobs, save, draw layers, e2e checklist). Design docs: [lore](design/lore.md), [progression](design/progression.md), [mochi](design/mochi.md).
- **Reviews done:** new player (no dev), the whole ladder with real keys, systems (save round trips, module isolation, 656k fuzzed frames: 0 throws, 0 NaN), Avi-lens critic. All high/med findings fixed (see v4 status below).
- **Gotchas:** old globals (`EVA`, `Stations`…) exist even under `?mods=`, so check `g.mod[id]`; new modules return `undefined` when filtered. Downtown sits 3.2 m under the pad, which is not hardened: an ice seam keeps the first dig working. Econ buys can return `{ok:false, why:'lift'}` (pass `{confirm:true}`). Swarm rails ignore Mochi, and a rock taken off its rail feels real gravity, so it gets perturbed at Mochi passes (honest).

## 🟢 v4 stage 1 (2026-10-06): the Crumb Belt

- **World:** the star Ember is the root at the origin (SIZZLE inside 3 R). Every number is in [SPEC.md](SPEC.md) and in test_physics's INFO lines.
- **Warp to 1024x** with an adaptive step far from everything: look-ahead caps (1x arrives ~19-20 s before any impact at 20-60 fps), swept steps never tunnel through a rock, rock warnings confirmed along the curved path, belt preview tests every segment, the belt path drawn in the target's lane-body frame.
- Save key `pocket-orbit-v4` (v3 saves are ignored).

## Run

```
cd Workshop/Orbit-Game/game && python3 -m http.server 8000     # open localhost:8000
?debug=1 / #debug   overlay + self-test      ?dev=1 / #dev / type d-u-c-k   ∞ money, no save, O Debug Duck shop, U top-up, I ∞ toggle, T spawns, K +$5000, J pirate, L translator
?build=mule|hauler|barge|beast   preset ship      ?xlate=0..3 translator level      ?inf=0|1
?spawn=hub|outpost|rusts|pad|orbit|belt|kiwi|pretzel|potato|glimmer|swarm|tunnels (or #kiwi)      ?seed=N      ?fresh=1 ignore save
?mods=eva,economy   load only those feature modules (debugging)
for t in physics core economy stations eva mobs wrecks combat haul npcs mochi; do node tests/test_$t.js | tail -1; done
python3 tools/bundle.py                                         # -> dist/pocket-orbit.html (the Artifact)
NODE_PATH=$(npm root -g) node tests/playtest.js /tmp/shots      # headless browser playtest of the whole loop
```

Playable link: https://claude.ai/artifact/PR6CVN4PZ19YbQmKM9KFdp (republish dist/pocket-orbit.html to keep the URL).

## The loop

Start docked at Mochi Hub → F shop → tap W in the undock window (the pad is auto-targeted) → land on Mochi's pad → E step out →
walk Downtown (West Stair, the Pantry market, Clunk Lift 1-4, the Cellar), talk to aliens (F; glyphs until you buy a translator) →
laser ore and gems → E board → sell at the pad kiosk, an outpost or a station → buy upgrades (frames, engines, side pods, tow gear,
charges, suit tiers, bombs, roll, sprint, tethers, translator) → fly the belt (warp up to 1024x; M cycles flight, map, belt map) →
hop to Pretzel, Kiwi's bugs, wrecks, pirates (Biscotti, Potato, Glimmer) → grapple swarm rocks (G), tow, crack (B), sell whole at the
Crusher → climb to the Leviathan + Sunflower torch. E while coasting = tethered spacewalk. The JOBS panel and FAVOURS panel guide it.

## Architecture (v4)

Core = config, world, terrain, physics, game, render, main. Features plug in with `Game.register({id, ...hooks})`;
the contract is [SPEC.md](SPEC.md) (hooks, core API, cross-module APIs, keys, jobs).

| module | file(s) | what |
|---|---|---|
| economy | economy.js, shop.js | prices, frames, engines to fusion, side pods, tow gear, charges, suit line, lift guard, dev mode (Debug Duck), Orion (N), DOM comic shop |
| stations | stations.js | Mochi Hub (r 420, default spawn), Kiwi Outpost (95 m round Kiwi), Rust's (600 m round Big Potato); alien keepers; dock with F |
| eva | eva.js | Pipkin astronaut: walk, jump, jetpack, tethered spacewalk, laser (terrain and rocks), sprint, roll, bombs, suit tiers to Mecha-Pip |
| mobs | mobs.js | Munchers (Kiwi), Tater Tanks (Potato), Nacho Nibblers (Dorito); lazy wake within 200 m |
| wrecks | wrecks.js | 5 orbital + 6 crashed derelicts, salvage by ship or on foot, crew-log codec, blueprints |
| combat | combat.js | pirates (4 personalities), ballistic guns, turret, bounties, safe zones (Hub 700 m, Rust's 260 m) |
| haul | haul.js | grapple / tow / reel (G Q Z), crack charges (B), free rocks with real gravity, the Crusher, whole-rock sales |
| mochi | mochi.js (+ terrain.js carvers) | Downtown under the pad, Clunk Lift, air zones, props, map boards, 6 outposts, `Mochi.spots` |
| npcs | npcs.js | six races, 28 named NPCs + crowds, glyph scripts, speech bubbles, Universal Translator, favours |

- Terrain: per-body Uint8 grid, 0.5 m cells (space / dug / regolith / ice / iron / nickel / platinum, plus fixed wall / slab / deck) + buried gems + zone bytes (Downtown).
- Gravity: all bodies pull, plus a rail-frame correction (local Hill-sphere body rides a rail; add its rail acceleration
  minus the pull it would really feel), blended over the outer 10 % of each Hill sphere. Ember (the root) is fixed: no correction.
- Popups within 60 m of a moon ride along with it; popups at one spot stack; long toasts and hints wrap.
- Gravity: point mass outside a body's deepest valley `b.Rc`, uniform core inside (g ∝ r); `World.phi` matches it.
- Save (`pocket-orbit-v4`): money, jobs, cargo, pack, tanks, module data, plus flight state (t, ship, landed spot,
  dock id) and dug cells / taken gems per body. Dead at save -> crash tow on load. `?fresh=1` / `?mods=` never write.

## v4 status

✅ Built by six parallel module owners against the contract, then four integration reviews (new player, ladder, systems, critic)
and three fixers. Suites: physics 53, core 75, economy 198, stations 104, eva 138, mobs 58, wrecks 136, combat 99, haul 51,
npcs 71, mochi 61 (1,044 checks); playtest 43/43 (includes the contract §7.3 end-to-end list). Fuzz: 656k random-input frames, 0 throws.
Key review fixes: pad landing guidance (undock window, `mochi:pad` nav target, land_mochi pays within 60 m of the pad); a lift
guard in the shop (frames/engines/fuels/charges that cannot lift off Mochi are sold as a bundle or need a second confirm click);
the Clunk Lift carries riders; air in the lift shaft and West Stair; tow contacts no longer pump the ship (per-rock damage
cooldown, braced rope, free rocks bounce or crack on rail rocks); canted exhaust while towing (cos 0.3 thrust loss, split plumes);
no impact alarm while climbing under thrust; Tab puts buyers first while towing, Shift+Tab steps back; pirates aim with a 0.8 s
sight lag so the dash dodges; bombs land within ~0.6 m of the cursor with a 0.6 s throw gap; rookie tow fees ($40 + $8/km,
never over 1/4 of your cash); frame time ~3x better at the Hub and pad (cached sky, NPC/prop bitmaps, LOD).
Open (honest): a no-input coast from the swarm spawn orbit is unstable (Dorito scatters it; a crossing rock can kick a tow);
brawler pirates at 36 m are still hard to dodge (fight them); the trajectory predictor still runs every frame; the mobs
"CPU stays cool" timing check can fail when the machine is loaded (passes alone); Mochi's town geometry is per-world module
state (only the last-touched world is current); the "predictor every frame" perf item is not done; the Rock Garden, guild
contracts, rent-a-drill, the Lantern station and Mk III translator are stretch.

## v4 stage 1 status

✅ world rebuilt and reviewed (physics, play, code lenses); every high/med finding fixed. Suites: physics 46, core 60,
economy 102, stations 97, eva 62, mobs 57, wrecks 135, combat 98 (657 checks); playtest 23/23. The V4-CONTRACT §8.3
test_core patch anchors are unchanged (its "52/52" and "645 checks" counts are now 60 and 657).
Open: belt-map labels skip a spot when all four places collide (module icons such as skulls are drawn later and can
still overlap a name); Rust's rail is not tidally exact (a free mass beside it wobbles ~13 %); the starter-trip autopilot
in test_core sets attitude by fiat (fuel and engine honest); the pirate hunt test is seed-sensitive (checked on seeds 7 and 2).

## v3 status

✅ all modules built and published (artifact version 3); suites: physics 16, core 45, economy 100, stations 74, eva 62,
mobs 57, wrecks 132, combat 97; playtest 23/23. Reviews done: lifecycle, physics/perf, integration (all high/med fixed).
✅ new-player UX pass: safe undock, pad kiosk, docking coach (closing-speed profile, wrong-way and too-fast hints),
⊗ BRAKE marker, wrapped hints, edge-arrow layout (kit.edgeArrow), rock/wreck hit-course warnings, RCS reaction wheel,
warp caps by time-to-contact. Suites now: core 49, economy 102, stations 96, wrecks 134 (others as above).
Open: Kiwi Outpost docking by following hints works 7/10 (Kiwi's small near zone); kiosk shop subtitle says
"outpost quartermaster"; untargeted wreck labels are drawn by wrecks.js and can still sit under panels.
Known, not fixed: gravity jumps a little at Hill-sphere edges (frame correction switches; blend across a shell);
engines can only be swapped at the Hub (by design for now, text says so). (The Hill-edge jump is fixed in v4: blended shell.)

## Gotchas

- `World` etc. are global consts; Node tests load scripts with `vm.runInThisContext` (tests/harness.js), not require.
- Playtests must use `?spawn=` (hash-only navigation does not reload). Google Fonts fails in the sandbox (ignore).
- The bundle has no doctype (the artifact host adds one), so a file:// test page runs in quirks mode: tables do not
  inherit colour. Set colours on tables explicitly (shop.js does).
- Kiwi's Hill sphere is small (248 m): prograde orbits beyond ~0.4 of it go chaotic. Park at ~88 m.
- Mochi's Hill sphere is 4 km, but Dorito (780 m) and Kiwi (1150 m) scatter prograde orbits beyond the inner ring out of it
  within about an hour. Park at 320-450 m (the Hub is at 420); retrograde orbits to ~3 km stay bound but wander.
- Rust's rides a rail 600 m round Big Potato (well inside its 1.9 km Hill sphere); the rail is not tidally exact, so a free
  mass beside it wobbles ~13 %. Dorito's L4 wreck has an autopilot because Kiwi kicks things loose there.
- Swarm rails ignore Mochi (see SPEC "Rails are a fiction near Mochi passes"): free bodies leave their swarm at a Mochi pass.
- Big warps: one 1024x frame covers up to 51 s of sim. Anything a module checks once per frame must either chunk `simDt`
  (mobs) or return a `{within: s}` warp cap (wrecks) so the frame stops short of its threshold.
- The hub sits at r 420, just inside the 470–630 m belt; teleports radially out from the hub can land in a rock.
- Keep `dist/pocket-orbit.html` as the publish path so the artifact URL stays the same.
