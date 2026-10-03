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
node test/headless.mjs                     # all asserts (~15 s)
node test/headless.mjs test events         # one test by name (`test` alone lists them)
node test/headless.mjs run smart 3         # one verbose run: policy, seed
node test/headless.mjs balance smart       # win/loss table across difficulties + speed at G7 volume
node test/headless.mjs balance smart off   # same with BALANCE.rivalWinsRace = grace | instant | off
```

Asserts: detector TPR/FPR match config per read, read quality cuts flags to TPR·q, detectors run out of heads at G7 and upgrades help, no chip is ever held (pass-by track), same seed → same run, slot prices escalate and stop at 10, a full bay never stalls the lane, upgrades raise the catch rate as configured, the kill switch blocks unresolved flags, buying a mount mid-run never lets a chip skip one, the compute split moves income / R&D / evidence the right way and takes effect at once (junk inputs too), each generation spawns its configured chips/s, traits roll deterministically and do what they say, dossier rows unlock at exactly 5/12/25/40/60 evidence gathered on the current model, chip text and shape never prove a chip is an attack (decoys), no-layers loses before G4 on Medium, all-layers never wins and pays the safety tax in ≥ 4/5 seeds, money and evidence are conserved. Chunk 3: all 18 elements place where allowed (and nowhere else) with full elementStats, every element moves its metric in a seeded A/B run, each new capstone does what it says, the Red Team's measured rate brackets the true TPR·q, research draws offer two branches with a counter to a seen attack, every tech card changes its number, every one of the 31 events fires, applies its effect and its banner expires, event cooldowns / generation gates / one-choice-at-a-time hold in a stress run, the rival rule works in all three modes, every trait counter answers its trait, a Red Team tally follows the truth when it moves, an exfiltration foiled / contained / announced counts as seen, every event number comes from its effect, and reputation is conserved like money and evidence.

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
