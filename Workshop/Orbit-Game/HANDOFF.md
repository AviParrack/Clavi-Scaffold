# Pocket Orbit — HANDOFF

*2D asteroid-belt mining game with real orbital mechanics. Stage: v3 (the economy loop) published; new-player polish next.*

## Run

```
cd Workshop/Orbit-Game/game && python3 -m http.server 8000     # open localhost:8000
?debug=1 / #debug   overlay + self-test      ?dev=1 / #dev   $50k, no save, T cycles spawns, K +$5000, J summons a pirate
?spawn=hub|outpost|rusts|pad|orbit|belt|kiwi|potato|glimmer (or #kiwi)      ?seed=N      ?fresh=1 ignore save
?mods=eva,economy   load only those feature modules (debugging)
for t in physics core economy stations eva mobs wrecks combat; do node tests/test_$t.js | tail -1; done
python3 tools/bundle.py                                         # -> dist/pocket-orbit.html (the Artifact)
NODE_PATH=$(npm root -g) node tests/playtest.js /tmp/shots      # headless browser playtest of the whole loop
```

Playable link: https://claude.ai/artifact/PR6CVN4PZ19YbQmKM9KFdp (republish dist/pocket-orbit.html to keep the URL).

## The loop

Start docked at Ceres Hub → F shop → W undock → fly (warp , . up to 64x) → land on a rock → E step out →
walk / jump / jetpack → hold left mouse to laser ore and gems into the backpack → E board (pack → hold) →
dock at a station and sell → buy engines, fuels, tanks, suit, guns, Orion units → salvage wrecks (F) →
squish bugs on Kiwi / Big Potato → fight pirates near Big Potato, the outer ring and Glimmer. The JOBS panel guides it.

## Architecture (v3)

Core = config, world, terrain, physics, game, render, main. Features plug in with `Game.register({id, ...hooks})`;
the contract is [SPEC.md](SPEC.md) (hooks, core API, cross-module APIs, keys, jobs).

| module | file(s) | what |
|---|---|---|
| economy | economy.js, shop.js | prices, upgrade catalog with honest mass, engine × fuel × tank tradeoffs, Orion (N), DOM comic shop |
| stations | stations.js | Ceres Hub (r 420, default spawn), Kiwi Outpost (95 m round Kiwi), Rust's at Potato's L5; dock with F |
| eva | eva.js | alien astronaut: walk (step-up over 0.5 m grid ledges), jump, jetpack with orbit governor, mining laser, suit, scanner |
| mobs | mobs.js | Munchers (Kiwi), Tater Tanks (Potato), Nacho Nibblers (Dorito); lazy wake within 200 m |
| wrecks | wrecks.js | 5 orbital + 6 crashed derelicts, salvage by ship or on foot, crew-log codec, blueprints |
| combat | combat.js | pirates (4 personalities), ballistic guns, turret, bounties, safe zones (Hub 700 m, Rust's 260 m) |

- Terrain: per-body Uint8 grid, 0.5 m cells (space / dug / regolith / ice / iron / nickel / platinum) + buried gems.
- Gravity: all bodies pull, plus a rail-frame correction (local Hill-sphere body rides a rail; add its rail acceleration
  minus the pull it would really feel). Small-body orbits see true tides only.
- Popups within 60 m of a moon ride along with it; popups at one spot stack; long toasts and hints wrap.
- Gravity: point mass outside a body's deepest valley `b.Rc`, uniform core inside (g ∝ r); `World.phi` matches it.
- Save (`pocket-orbit-v3`): money, jobs, cargo, pack, tanks, module data, plus flight state (t, ship, landed spot,
  dock id) and dug cells / taken gems per body. Dead at save -> crash tow on load. `?fresh=1` / `?mods=` never write.

## v3 status

✅ all modules built and published (artifact version 3); suites: physics 16, core 45, economy 100, stations 74, eva 62,
mobs 57, wrecks 132, combat 97; playtest 23/23. Reviews done: lifecycle, physics/perf, integration (all high/med fixed).
🟡 new-player UX review findings pending.
Known, not fixed: gravity jumps a little at Hill-sphere edges (frame correction switches; blend across a shell);
engines can only be swapped at Ceres Hub (by design for now, text says so).

## Gotchas

- `World` etc. are global consts; Node tests load scripts with `vm.runInThisContext` (tests/harness.js), not require.
- Playtests must use `?spawn=` (hash-only navigation does not reload). Google Fonts fails in the sandbox (ignore).
- The bundle has no doctype (the artifact host adds one), so a file:// test page runs in quirks mode: tables do not
  inherit colour. Set colours on tables explicitly (shop.js does).
- Kiwi's Hill sphere is small (248 m): prograde orbits beyond ~0.4 of it go chaotic. Park at ~88 m.
- Rust's L5 is not a true Trojan: Potato is 5.7% of the pair (past Routh's 3.85%) and Kiwi passes ~600 m from L5 every
  ~1230 s; a free particle there drifts km in minutes even with a lighter Potato (checked). The station rides a rail and
  its blurb says so. Dorito's L4 wreck has an autopilot for the same Kiwi reason.
- The hub sits at r 420, just inside the 470–630 m belt; teleports radially out from the hub can land in a rock.
- Keep `dist/pocket-orbit.html` as the publish path so the artifact URL stays the same.
