# Pocket Orbit — HANDOFF

*2D rocket game with real orbital mechanics on a tiny cute planet ("Pebble"). Starter mechanics only.*

## Run

```
cd Workshop/Orbit-Game/game && python3 -m http.server 8000     # open localhost:8000
?debug=1  (or #debug)  -> state/energy overlay + console self-test
?seed=N                 -> scenery layout
node tests/test_physics.js                                       # physics unit tests
python3 tools/bundle.py                                          # -> dist/pocket-orbit.html (one file)
NODE_PATH=$(npm root -g) node tests/playtest.js shots            # headless keyboard flight + screenshots
```

Playable link: https://claude.ai/artifact/PR6CVN4PZ19YbQmKM9KFdp

## Controls

W/↑/Space thrust · Shift fine throttle (20%) · A/D rotate · Q hold prograde · E hold retrograde ·
`,` `.` time warp (forced 1x while burning, max 4x in air) · M map · wheel zoom · R restart.

## Physics

- Point-mass Newtonian gravity, mu = g0 R^2. Leapfrog (KDK) at dt = 1/240 s: symplectic, energy drift ~1e-13 over 10 orbits.
- Thrust with mass flow mdot = T/ve, so delta-v follows Tsiolkovsky exactly (tested to 1e-3).
- Exponential atmosphere with drag, faded to zero at 120 m.
- Orbit preview from Kepler elements (e-vector, semi-latus rectum), Ap/Pe markers, time-to-Ap/Pe from mean anomaly.
- No planet rotation yet.

## Game-scaled numbers (game/js/config.js)

| | value |
|---|---|
| Pebble radius / surface g | 1000 m / 4 m/s² |
| circular speed at 250 m | 56.6 m/s, period ~2.5 min |
| surface escape speed | 89.4 m/s |
| Mk1 Pip: dry / fuel / ve / thrust | 1 t / 3 t / 125 m/s / 28 kN |
| liftoff TWR / full delta-v / full burn | 1.75 / 173 m/s / 13.4 s |

Keyboard bot reaches a 120+ m orbit in ~22 s with ~70 m/s left; enough for the 1500 m boost, circularizing, or escape, but not all of them.

## Flight school goals

Lift off · reach space · orbit (Pe > 120) · Ap > 1500 · circularize high (e < 0.05, Pe > 1200) · escape (bonus) · land under 6 m/s after orbiting.

## Next (not started)

Upgrades (tanks, engines, ve), missions across a map (moons, stations), planet rotation, staging, maneuver-node planner, sound.
