# Pocket Orbit — HANDOFF

*2D asteroid-belt mining game with real orbital mechanics. Stage: v4 stage 1 (the Crumb Belt world rebuild) built, reviewed and fixed; stage 2 (haul, NPCs, Mochi's tunnels) designed, not yet built.*

## 🟡 v4 stage 2 (2026-10-06): integrated, not yet implemented

- **Binding contract:** [design/V4-CONTRACT.md](design/V4-CONTRACT.md), which covers ownership, APIs, S fields, keys, jobs, save, draw layers, tests and the e2e checklist. The design docs [lore](design/lore.md), [progression](design/progression.md) and [mochi](design/mochi.md) were edited to agree with it.
- **Lead first:** apply contract §8: script tags `haul, mochi, npcs` after combat.js, three stubs, three stub tests, and the test_core patch. Without that patch, Downtown fails 2 core tests; with it, a scratch copy ran 52/52.
- **Gotcha:** Downtown sits 3.2 m under the pad. The pad is **not** hardened; it gets an ice seam so the first dig still works.
- **Gotcha:** old globals (`EVA`, `Stations`…) exist even under `?mods=`, so check `g.mod[id]`. New modules return `undefined`, as econ does.
- Test loop gains `haul npcs mochi`.

## 🟢 v4 stage 1 (2026-10-06): the Crumb Belt

- **World:** the star Ember is the root at the origin (SIZZLE inside 3 R). Ceres is now **Mochi** (moons Dorito, Kiwi + Seed, two rubble rings) on a 30 km lane round Ember, with Pretzel, Waffle, Nugget and Crouton co-orbital; inner lane 24 km (Glimmer & co), outer lane 36.5 km (Big Potato & co). Seven epicycle swarms ride streams between the lanes. Every number is in [SPEC.md](SPEC.md) and in test_physics's INFO lines.
- **Δv tripled** (every game ve ×3, `ISP_SCALE` 8): stock Δv 394 m/s, Isp and TWR unchanged. Starter hop Hub → Pretzel → land → Hub flies on ~93 m/s in test_core.
- **Warp to 1024x** with an adaptive step far from everything. Review fixes: a frame can never jump past a warning (look-ahead caps; 1x arrives ~19-20 s before any impact at 20-60 fps), swept steps never tunnel through a rock, rock warnings are confirmed along the curved path, the belt preview tests every segment (no skipped asteroids) on half the steps, loose ore cannot fall through the ground at warp, the belt path is drawn in the target's lane-body frame (no Hub corkscrew), BURN (not BRAKE) on a star dive.
- **Honest limit, documented:** swarm rails ignore Mochi. Six swarms sit inside Mochi's Hill band, so a ship coasting in a swarm, or a rock taken off its rail in stage 2, is flung out at a Mochi pass. The `swarm` spawn uses the swarm furthest from Mochi.
- Save key `pocket-orbit-v4` (v3 saves are ignored).

## Run

```
cd Workshop/Orbit-Game/game && python3 -m http.server 8000     # open localhost:8000
?debug=1 / #debug   overlay + self-test      ?dev=1 / #dev   $50k, no save, T cycles spawns, K +$5000, J summons a pirate
?spawn=hub|outpost|rusts|pad|orbit|belt|kiwi|pretzel|potato|glimmer|swarm (or #kiwi)      ?seed=N      ?fresh=1 ignore save
?mods=eva,economy   load only those feature modules (debugging)
for t in physics core economy stations eva mobs wrecks combat haul npcs mochi; do node tests/test_$t.js | tail -1; done
python3 tools/bundle.py                                         # -> dist/pocket-orbit.html (the Artifact)
NODE_PATH=$(npm root -g) node tests/playtest.js /tmp/shots      # headless browser playtest of the whole loop
```

Playable link: https://claude.ai/artifact/PR6CVN4PZ19YbQmKM9KFdp (republish dist/pocket-orbit.html to keep the URL).

## The loop

Start docked at Mochi Hub (nose retrograde) → F shop → tap W to undock (soft 1.5 s start drops you toward Mochi) → fly (warp , . up to 1024x; M cycles flight, map, belt map) → land on a rock (first hop: Pretzel) → E step out →
walk / jump / jetpack → hold left mouse to laser ore and gems into the backpack → E board (pack → hold) →
sell at the Mochi pad kiosk (F: fuel, RCS, repair, ore at 0.8x) or dock at a station → buy engines, fuels, tanks, suit, guns, Orion units → salvage wrecks (F) →
squish bugs on Kiwi / Big Potato → fight pirates near Big Potato, Biscotti and Glimmer. The JOBS panel guides it.

## Architecture (v4)

Core = config, world, terrain, physics, game, render, main. Features plug in with `Game.register({id, ...hooks})`;
the contract is [SPEC.md](SPEC.md) (hooks, core API, cross-module APIs, keys, jobs).

| module | file(s) | what |
|---|---|---|
| economy | economy.js, shop.js | prices, upgrade catalog with honest mass, engine × fuel × tank tradeoffs, Orion (N), DOM comic shop |
| stations | stations.js | Mochi Hub (r 420, default spawn), Kiwi Outpost (95 m round Kiwi), Rust's (600 m round Big Potato); dock with F |
| eva | eva.js | alien astronaut: walk (step-up over 0.5 m grid ledges), jump, jetpack with orbit governor, mining laser, suit, scanner |
| mobs | mobs.js | Munchers (Kiwi), Tater Tanks (Potato), Nacho Nibblers (Dorito); lazy wake within 200 m |
| wrecks | wrecks.js | 5 orbital + 6 crashed derelicts, salvage by ship or on foot, crew-log codec, blueprints |
| combat | combat.js | pirates (4 personalities), ballistic guns, turret, bounties, safe zones (Hub 700 m, Rust's 260 m) |

- Terrain: per-body Uint8 grid, 0.5 m cells (space / dug / regolith / ice / iron / nickel / platinum) + buried gems.
- Gravity: all bodies pull, plus a rail-frame correction (local Hill-sphere body rides a rail; add its rail acceleration
  minus the pull it would really feel), blended over the outer 10 % of each Hill sphere. Ember (the root) is fixed: no correction.
- Popups within 60 m of a moon ride along with it; popups at one spot stack; long toasts and hints wrap.
- Gravity: point mass outside a body's deepest valley `b.Rc`, uniform core inside (g ∝ r); `World.phi` matches it.
- Save (`pocket-orbit-v4`): money, jobs, cargo, pack, tanks, module data, plus flight state (t, ship, landed spot,
  dock id) and dug cells / taken gems per body. Dead at save -> crash tow on load. `?fresh=1` / `?mods=` never write.

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
