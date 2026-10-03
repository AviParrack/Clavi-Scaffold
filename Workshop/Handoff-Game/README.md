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
- `?pixel=1` whole-number scale only (crisper, smaller board)
- `?debug=1` debug keys plus the truth panel (true m, drift, live per-read catch / false alarm / unread) and truth marks on chips

## Controls

| | |
|---|---|
| click a menu key (bottom right), then a mount | place an element |
| `1`–`9` | take the n-th unlocked element · or answer a codec choice · or keep a research card |
| click a mount | open its panel: turn off, upgrade, sell, buy a mount |
| shift + click a mount | upgrade it in place |
| right-click a mount | sell it (50% back) |
| drag a seam in the COMPUTE bar (top right) | move the split between product, R&D and safety |
| `Space` | pause (you can still build) |
| `F` | ×3 speed |
| `R` | research draw: two cards, keep one |
| `M` | mute |
| `Esc` / right-click nothing | cancel what you were placing or had selected |
| the three buttons right of UPTIME | pause, ×3, mute (hover for the key; each icon shows what a click does) |

Held keys don't repeat, and a double-click on a menu key or on `+ SLOT` counts once. Codec choices take a click only
after they have been up for 0.6 s (keys `1`–`9` are instant), so hurrying a call with ▼ never answers it. The NEW
MODEL card holds the board until it closes (6 s, a click or `Esc`). Hover anything for its numbers: tooltips follow
the live state even when the mouse is still.

`?debug=1` adds: `N` next generation · `$` money · `U` unlock everything · `D` the truth panel · `T` truth marks on chips · `L` layout outlines.

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

The UI has two Playwright harnesses (they need `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1`
so the headless browser can get the fonts, and `PLAYWRIGHT=` if playwright lives somewhere else):

```bash
node test/ui-shot.mjs                      # list the 30 scenarios
node test/ui-shot.mjs /tmp/shots           # every scenario at 1200×660 and 1600×900, + ms/frame
node test/ui-shot.mjs /tmp/shots g7-dense  # just one
node test/ui-shot.mjs /tmp/shots perf-g7   # G7 at 1920×1080@2 with the sim running: draw p50/p95 and fps
node test/ui-play.mjs /tmp/play 11         # a real playthrough: real clicks, real time, seed 11
```

`ui-shot` freezes the clock and sets each scenario up through `window.__handoff` on a fresh page per size, so both
PNGs show the same moment and are reproducible.
`ui-play` plays a whole run start → scorecard through the mouse and keyboard and exits 1 if any step or any page
script fails.

## Layout

```
game/
  index.html, style.css
  src/config/   balance, generations, layers, upgrades, traits, cards, events, tasks, tasktext   ← balancing = edit numbers here
  src/sim/      pure sim: createState, step(dt), actions, seeded RNG  ← no DOM
  src/ui/       the v2 look: theme, layout, tracks, hud, codec, menu, upgrade, overlays, portraits,
                sprites, derive, audio, input, hit, view, act, debug  ← only reads state, acts through sim actions
  src/main.js   loop + input + the ?debug=1 harness
  test/headless.mjs   test/ui-shot.mjs   test/ui-play.mjs
```

One 1200×660 canvas plus five HTML overlays (start, research, new model, pause, scorecard). The CRT scanlines and
vignette are a CSS layer (`#crt`, `mix-blend-mode: soft-light`) over the canvas, so they cost the canvas nothing and
barely touch bright letters. The sim emits append-only
`fx` and `codec` logs; UI modules keep their own cursor, so the sim never knows they exist. No images or audio files
(portraits and sprites are drawn in code, sound is WebAudio), ~200 KB total.
