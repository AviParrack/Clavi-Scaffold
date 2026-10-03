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
- `?debug=1` truth overlay (true m, drift, live per-read catch / false alarm / unread, attack markers on chips) + buttons to skip gen, add money, fire any event. Keys: `N` skip gen, `$` money, `U` unlock all, `D` hide overlay.

Controls: click a card (or press 1-9), then an empty mount. Click a placed layer to toggle it. Right-click sells for 50%. Space pauses (you can still build). `F` fast-forward ×3, `M` mute.

## Test

```bash
cd Workshop/Handoff-Game/game
node test/headless.mjs                 # all asserts (~5 s)
node test/headless.mjs test passBy     # one test by name (`test` alone lists them)
node test/headless.mjs run smart 3     # one verbose run: policy, seed
node test/headless.mjs balance smart   # win/loss table across difficulties + speed at G7 volume
```

Asserts: detector TPR/FPR match config per read, read quality cuts flags to TPR·q, detectors run out of heads at G7 and upgrades help, no chip is ever held (pass-by track), same seed → same run, slot prices escalate and stop at 10, a full bay never stalls the lane, upgrades raise the catch rate as configured, the kill switch blocks unresolved flags, buying a mount mid-run never lets a chip skip one, the compute split moves income / R&D / evidence the right way and takes effect at once (junk inputs too), each generation spawns its configured chips/s, traits roll deterministically and do what they say, dossier rows unlock at exactly 5/12/25/40/60 evidence gathered on the current model, chip text and shape never prove a chip is an attack (decoys), no-layers loses before G4 on Medium, all-layers never wins and pays the safety tax in ≥ 4/5 seeds, money and evidence are conserved.

## Layout

```
game/
  index.html, style.css
  src/config/   balance, generations, layers, upgrades, traits, cards, events, tasks, tasktext   ← balancing = edit numbers here
  src/sim/      pure sim: createState, step(dt), actions, seeded RNG  ← no DOM
  src/render/   canvas playfield, effects, HUD, codec, portraits, audio, debug  ← only reads state
  src/main.js   loop + input
  test/headless.mjs
```

The sim emits append-only `fx` and `codec` logs; renderers keep their own cursor, so the sim never knows they exist. No images or audio files, ~120 KB total.
