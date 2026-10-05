# Pocket Orbit — HANDOFF

*2D asteroid-belt mining game with real orbital mechanics. Stage: v3 (economy loop) in progress.*

## Run

```
cd Workshop/Orbit-Game/game && python3 -m http.server 8000     # open localhost:8000
?debug=1 / #debug   overlay + self-test      ?dev=1 / #dev   $50k, no save, T cycles spawns
?spawn=hub|pad|orbit|belt|kiwi|potato|glimmer (or #kiwi)      ?seed=N      ?fresh=1 ignore save
?mods=eva,economy   load only those feature modules (debugging)
node tests/test_physics.js && node tests/test_core.js          # 16 + 35 checks
python3 tools/bundle.py                                         # -> dist/pocket-orbit.html (the Artifact)
NODE_PATH=$(npm root -g) node tests/playtest.js shots           # headless browser playtest
```

Playable link: https://claude.ai/artifact/PR6CVN4PZ19YbQmKM9KFdp (republish dist/pocket-orbit.html to keep the URL).

## Architecture (v3)

Core = config, world, terrain, physics, game, render, main. Features plug in with `Game.register({id, ...hooks})`:
economy+shop, stations, eva, mobs, wrecks, combat. The contract is [SPEC.md](SPEC.md).

- Terrain: per-body Uint8 grid, 0.5 m cells (space / dug / regolith / ice / iron / nickel / platinum) + buried gems.
  Ship lands on the grid; digging under it drops it. Overlay baked per 12 m chunk, drawn over the vector toon body.
- Gravity: all bodies pull, plus a rail-frame correction (the local Hill-sphere body rides a rail, so we add its rail
  acceleration minus the pull it would really feel). Small-body orbits now see true tides only (Kiwi 85 m: ±5 m, was ±20).
- Warp 1-64x with caps (thrusters, rocks < 40 m, impact < 20 s, ion burn, module caps). DOM warp bar bottom right.
- Nav target (Tab / click): brackets, closest-approach ghosts on the path, target-relative pro/retro markers within 300 m.

## v3 status

✅ core refactor (tests green). 🟡 feature modules being built in parallel (see SPEC.md owners). Then integrate,
playtest, adversarial review, publish, push to PR #4.

## Gotchas

- `World` etc. are global consts; Node tests load scripts with `vm.runInThisContext` (tests/harness.js), not require.
- Playtests must use `?spawn=` (hash-only navigation does not reload). Google Fonts fails in the sandbox (ignore).
- Kiwi's Hill sphere is small (248 m): prograde orbits beyond ~0.4 of it go chaotic. Park at ~88 m.
- Keep `dist/pocket-orbit.html` as the publish path so the artifact URL stays the same.
