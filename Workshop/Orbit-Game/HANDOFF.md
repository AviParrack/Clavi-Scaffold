# Pocket Orbit — HANDOFF

*2D asteroid-belt mining flight game with real orbital mechanics. Current stage: flight controls sandbox.*

## Run

```
cd Workshop/Orbit-Game/game && python3 -m http.server 8000     # open localhost:8000
?debug=1 or #debug        state overlay + console self-test
?spawn=pad|orbit|belt|kiwi (or #belt etc.)   starting spot; T cycles it in game
?seed=N                   rubble layout
node tests/test_physics.js                                       # physics unit tests (16)
python3 tools/bundle.py                                          # -> dist/pocket-orbit.html (one file, for the Artifact)
NODE_PATH=$(npm root -g) node tests/playtest.js shots            # headless keyboard flight + screenshots (7 checks)
```

Playable link: https://claude.ai/artifact/PR6CVN4PZ19YbQmKM9KFdp

## Controls

W main engine · Shift fine throttle (15%) · A/D fire rotation thrusters (spin builds up and stays) · S thrusters cancel spin ·
arrow keys RCS translate (nudge) · `,` `.` warp (1x while firing, max 4x within 60 m of rock) · M map · wheel / + / - zoom · R restart · T next spawn.

## World (game/js/config.js)

| body | R | g | orbit | Hill radius |
|---|---|---|---|---|
| Ceres (fixed) | 300 m | 2.0 | — | ∞ |
| Dorito | 34 m | 2.0 | 780 m around Ceres, 323 s | 127 m |
| Kiwi | 52 m | 2.0 | 1150 m around Ceres, 578 s | 248 m |
| Seed (Kiwi's moon) | 11 m | 0.3 | 150 m around Kiwi | 20 m |

Rubble: 170 rocks orbiting Ceres at 470-630 m, 18 around Kiwi at 72-100 m. They move on Kepler rails, have no gravity, and bounce the ship.

Ship "Prospector": 1 t dry + 1.4 t fuel, ve 150 m/s, 7 kN (2.9 m/s² full, 0.44 fine, TWR 1.46 on Ceres), Δv 131 m/s.
RCS: 2.4 rad/s² torque, 0.4 m/s² translate, 30 units of monoprop. Hull 100, bumps cost 6 per m/s, landing < 2.5 m/s, destroyed > 7 m/s.

## Physics

- Bodies ride analytic circular rails (nested: Seed around Kiwi around Ceres). Ship feels gravity from all of them.
- Leapfrog (KDK) at dt = 1/240 s. RCS torque integrates spin (omega) so rotation has inertia.
- Path preview integrates the ship forward with engines off (same gravity), drawn in the frame of the
  reference body (smallest Hill sphere containing the ship). Matches the real sim to 2 cm over 120 s.
- Ap/Pe markers come from min/max distance along that predicted path, so they always sit on the drawn line.
- Low orbits around Dorito and Kiwi wobble from Ceres tides (tests check they stay bound); expect to trim them.

## Notes

- v1 (tiny planet "Pebble") had prograde/retro auto-hold. Avi saw the rocket "hang in place" while raising an orbit.
  Not reproduced; the likely cause was the retro hold, which turns a held burn into a velocity-nulling hover.
  v2 drops auto-hold entirely and draws any thrown error on screen instead of freezing.
- Look: toon shading (flat light/shadow bands, ink outlines, comic HUD), Sun from the upper left.

## Next (not started)

Docking, mining, refuelling, upgrades, missions, more rock types, sound.
