# HANDOFF

Browser tower defense about AI control. You run the safety team at a frontier lab: AI tasks roll down two lanes, a few are attacks, and you place and toggle safety layers while the models climb from Autocomplete to ASI. You never see the truth until the scorecard.

Spec: [SPEC.md](SPEC.md) · State + next steps: [HANDOFF.md](HANDOFF.md)

## Play

ES modules need a local server (browsers block them from `file://`):

```bash
cd Workshop/Handoff-Game/game
python3 -m http.server 8000
# open http://localhost:8000
```

- `?seed=N` reproducible run
- `?debug=1` truth overlay (true m, drift, live TPR/FPR, attack markers on chips) + buttons to skip gen, add money, fire any event. Keys: `N` skip gen, `$` money, `U` unlock all, `D` hide overlay.

Controls: click a card (or press 1-9), then an empty tier. Click a placed layer to toggle it. Right-click sells for 50%. Space pauses (you can still build). `F` fast-forward ×3, `M` mute.

## Test

```bash
cd Workshop/Handoff-Game/game
node test/headless.mjs                 # all asserts
node test/headless.mjs run smart 3     # one verbose run: policy, seed
node test/headless.mjs balance smart   # win/loss table across difficulties
```

Asserts: detector TPR/FPR match config, same seed → same run, no-layers loses before G4 on Medium, all-layers never wins and goes bankrupt or falls behind the rival in ≥ 4/5 seeds, money is conserved.

## Layout

```
game/
  index.html, style.css
  src/config/   balance, generations, layers, cards, events, tasks   ← balancing = edit numbers here
  src/sim/      pure sim: createState, step(dt), actions, seeded RNG  ← no DOM
  src/render/   canvas playfield, effects, HUD, codec, portraits, audio, debug  ← only reads state
  src/main.js   loop + input
  test/headless.mjs
```

The sim emits append-only `fx` and `codec` logs; renderers keep their own cursor, so the sim never knows they exist. No images or audio files, ~120 KB total.
