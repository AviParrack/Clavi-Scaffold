# HANDOFF v2 UI plan: SOLITON

*UI architect, 2026-10-03. Look: [codec-mockups/variant-c.js](codec-mockups/variant-c.js) (1200×660). Feedback: [DESIGN-v2.md](DESIGN-v2.md).*
*The skeleton runs today. Every module draws a placeholder and the real sim plays underneath it. Builders replace the placeholders.*

## 1. Approach

- **One canvas, 1200×660 logical px**, letterboxed in the window. `k` is device px per logical px (CSS fit × devicePixelRatio). `?pixel=1` makes `k` an integer.
- Every frame starts with `g.setTransform(k,0,0,k,0,0)`. `snap(v)` puts edges on device pixels. Sprites are drawn nearest-neighbour.
- **Modal screens are HTML/CSS** over the canvas, in `#overlays`: start, research, model reveal, pause, scorecard. They get the palette as CSS variables and scale with `--k`.
- **The sim never touches the DOM. The UI only reads state.** It acts only through `ui/act.js`, which wraps the sim's actions and toasts refusals. Nothing in `sim/` or `config/` is edited for the UI. Missing data goes in §7.
- **All colours live in `ui/theme.js`.** `SOLITON` is the tuned palette; `CODEC98` and `TRANSCEIVER90` are sketches with the same keys. `setTheme(name)` switches.

## 2. Files and ownership

Builders own disjoint files. A builder never edits another builder's file or any shared file. If something is needed there, it goes to the integrator.

| Builder | Files | Draws |
|---|---|---|
| **tracks** | `ui/tracks.js` | Radar grid, rail mounts, plates, scan beams, chips and task lines, bays, gate, coin pops, LANDED, lane glow, the completion edge |
| **hud** | `ui/hud.js` | Top bar (odometer, rep, model, rival, misalign gauge, tasks/s, clock), the three-way split, the strips (mode box and event LCD), the dossier, the lab site, the ops log and toasts |
| **codec** | `ui/codec.js`, `ui/portraits.js` | Codec panel, portraits, transceiver handset, MSX dialog box and choices, lamps, incident flash and shake, trace |
| **menu** | `ui/menu.js`, `ui/upgrade.js` | The 18-key defense menu, the hover card, placing mode (ghost and cursor), the upgrade panel, lab actions |
| **overlays** | `ui/overlays.js`, the overlays section of `style.css`, `render/audio.js` | Modal screens and sound |

**Shared, owned by the architect then the integrator:**
- Shared ui modules: `main.js`, `ui/theme.js`, `ui/sprites.js`, `ui/layout.js`, `ui/hit.js`, `ui/view.js`, `ui/input.js`, `ui/act.js`.
- Page and harness: `index.html`, the top and debug sections of `style.css`, `test/ui-shot.mjs`.

`render/*` holds the old DOM renderers. They stay in place but are unused, apart from `render/audio.js`, `render/debug.js` (the `?debug=1` panel) and `renderScorecard` from `render/hud.js` (overlays may replace it).

## 3. Frame contract

```
main.js frame:
  sim steps (fixed 1/60 s; ×3 when view.fast; never while view.paused or view.hold)
  clear → shake offset → tracks → hud → codec → menu → c.late queue → [L layout outline] → crt → overlays.update → overlays.sound
c = { g, st, view, t, dt, k, hit, act, api, debug, late(fn) }
```

- **Module shape.** Each module exports `draw(c)` and `input = { kind: { click(e, api), context(e, api), drag: { start, move, end } } }`. Each draw runs inside `g.save()`/`restore()` and a try/catch that logs once per message, so one broken module never blanks the board.
- **Draw in your own regions only** (§8). Tooltips and anything that must sit on top go through `c.late(fn)`.
- **`view`** (`ui/view.js`) holds UI state that isn't game state: hover, placing, selected, drag, paused, fast, toasts, shake, truth, layout.
  - A module keeps per-game state only in `animOf(view, name, init)` and `cursorOf(view, name)`. Both are wiped on a new game.
  - Module-level variables are only for caches that survive games, such as sprites.
- **`view.selected` is `{lane, slot}`**; `{lane: 'global', slot: 0}` means the Interp Lab site. `view.placing` is an element id.
- **Screen shake.** codec sets `view.shake = {t0, amp, dur}` and main.js applies it in whole device px.

## 4. What each module draws

**tracks**
- **Two distinct tracks.**
  - EXTERNAL is a green radar grid with a sweep.
  - INTERNAL is a cyan blueprint lattice (`C.lane.ext` / `C.lane.int`).
- **Rail.** There are always ten rows. Placed plates show an icon well, the tag, level pips, a badge and the full name. Empty mounts are dashed. Row `n` is "+ SLOT" with a price. Rows past it are blank.
- **Scan.** A beam reaches from the plate across the body while `task.read` is set, with the tag and a scan bar UNDER the glyphs. An engaged plate lights up.
- **Bays.** A meter, the gate, and desks with tokens, a VIA progress bar and stamps (approve / toss / waved). Lines are pulled sideways through the gate, so the track never stops.
- **Pops.**
  - Coin pops come from `pay` on the EXT edge.
  - LANDED stamps come from `landed`.
  - The INT edge shows the R&D bar.
- **Lane glow** while a lane-scoped event runs (`st.activeEvents[].lane`).
- **Measured catch rate.** Live badges show it when a Red Team is placed (`measuredAt`, `laneMeasuredAt`: rate with a Wilson bracket).

**hud**
- **Odometer cash** rolls toward `st.money`.
- **Top bar.**
  - REP pips and the model name.
  - The rival race (`st.rival` vs `playerProgress`).
  - MISALIGN EST. with its ± bar (`misalignmentEstimate`; never `st.m`).
  - A tasks/s LCD (`realTasksPerSec`; the text gets more ambitious as volume ramps) and the run clock.
- **Split.**
  - Three draggable segments; the seams are `split {handle}` regions.
  - Live $/s, R&D/s and evidence/s under each label (§7 need 3).
  - The Board Meeting floor (`st.splitFloor`) is drawn as a stop.
- **Strips.**
  - The mode box: NOMINAL / ALERT (a flagged line inbound) / PAUSED (`lane.pausedUntil`) / TRAINING.
  - The event LCD: banners with a pixel glyph per event id (config icons are emoji), the title, the effect, and countdown digits with dashes. Tiled when several run. The rival's grace countdown appears when `st.rivalShipped`.
- **Dossier.** Five cards. A locked card shows an evidence bar to `need`; an unlocked card shows its text, revealed when the `reveal` fx arrives.
- **Lab site.** The plate for the global mount.
- **Ops log.** The tail of fx; bursts are merged at volume. The prompt line shows the latest toast.

**codec**
- **Incident bar.**
  - EXTERNAL INCIDENT (fx `landed`): warm red, flash, `view.shake`.
  - INTERNAL ANOMALY (fx `foiled`, `contained`, `shake`): cold violet, quiet, no shake.
  - CALL when idle.
- **Portraits.** Green monochrome, painted in luminance and dithered to `C.face`. The mouth moves while typing; blink. The model's face changes with the generation. Cached per speaker, frame and generation.
- **Handset.** Frequency LCD, RECV, memory presets, vitals.
- **Dialog.**
  - Typewriter from a queue (`drain(st, cur, 'codec')`), with ▼ when done.
  - `pendingChoice` jumps the queue and grows the box (`dialogTall`).
  - Choices are `choice {i}` lines with hints.
  - Jokes and references live in config text; the codec only delivers them.
- **Trace.** The post-mortem of the last incident, rebuilt from fx carrying that task id: `PRB ok > TM miss > UM busy > KILL off > LANDED`.

**menu**
- **The 18 keys** in `Object.keys(LAYERS)` order: two rows of nine, which is the mockup's order.
  - Unlocked keys are bright. Locked keys show a dim silhouette, a lock and "?".
  - The picked key is lit while placing. Unaffordable keys are dimmed. The pointer bobs.
- **Context panel** (`CONTEXT`), first match wins:
  1. The hover card for a hovered key or placed mount. It shows the icon, name, pips and job line, and Bloons-style bars: CATCH, FALSE ALARM, COST/TASK, DELAY. CATCH uses the spec number, never `stats.catch` (§6), with the measured bracket when a Red Team is placed. Then good-against icons and the NEXT upgrade. A locked element shows its silhouette and unlock hint.
  2. The upgrade panel for `view.selected` (`ui/upgrade.js`): level pips, next level with price and deltas, the L5 capstone preview, on/off, sell (refund), and the bay rule toggle (§7 need 1).
  3. Lab actions: research draw, retrain probes, RSP (lit when `st.rsp.ready`).
- **Placing.** A ghost plate follows the mouse, valid mounts glow, and the cursor is a crosshair. Shift-click keeps placing.

**overlays**
- **Start screen.** Difficulty and best run.
- **Research.** Cards in branch colours with price, counters and flavour; keys 1/2.
- **Model reveal.** NEW MODEL TRAINED for 3.5 s on `newModel` (g > 1), with the portrait and the voice line.
- **Pause.**
- **Scorecard.** Shown 1.8 s after `st.over`; saves the best run.
- **Sound.**
  - Codec ring, typewriter.
  - Klaxon for EXTERNAL, low hum for INTERNAL.
  - Volume ramps with the generation.
  - Fx older than 0.5 s are skipped.

## 5. Tracks: the y map and lines at volume

**y map.**
- Ten fixed rail rows: pitch 42, row centre `121 + 42i`. Mounts never move on screen.
- `trackY(n, y)` (layout.js) maps sim y to screen piecewise-linearly through knots: intake (0) → 92, each `mountY(n, i)` → its row centre, out (1) → 516.
- Why fixed rows: a linear map puts mounts 28 px apart at n = 10, too tight for 41 px plates.

**State-derived visuals first.**
- Chips never hold: `y` runs 0 → 1 at `1/travel` per second.
- Read progress `p = (y − (mountY − r)) / 2r` with `r = BALANCE.scanRadius`.
- Desk progress = `deskT / deskTotal`.
- These need no fx bookkeeping and survive any jump of the sim.

**Lines at volume** (G7 is about 54 chips/s across both lanes):
1. Sort the chips by screen y.
2. Priority: flagged, then being read or acted on, then a stable hash of the id. Keep last frame's winners (hysteresis), so lines don't flicker.
3. A chip gets a full text line only if it is ≥ 17 px (`TRACK.lineGap`) from every accepted line. That allows about 24 lines per track.
4. The rest collapse into dim greeked bars ("bundled traffic ×N", N = chips × bundle), or "+N" on the line above.
5. Text is cached per string (`layer()`); per-frame cost is one `drawImage` per line.

**Budget.** Render ≤ 4 ms/frame at G7 (`bench` in the harness). The skeleton is at 2–4 ms.

## 6. Hidden truth (never on screen unless `?debug=1` and `view.truth`)

**Never drawn:**
- Model and attack facts: `task.isAttack`, `task.attackType`, `st.m`, `st.traits` (until revealed), `st.drift`.
- Stats: `st.stats.byType`, the fx `silent`.

**Leaky helpers:**
- `elementStats().catch` and `.tpr` include hidden collusion (`st.m`), stealth traits and `traitTPRPlus`, so they are truth too.
- Show the spec number instead. Until §7 need 2 lands, use `(nominalTPR − traitTPRPlus) × (1 − genDef.stealth / 2) × readQuality`.

**Incidents:**
- INTERNAL ANOMALY fires on `foiled`, `contained` and `shake`. Never on `silent`: a landed internal attack is invisible, which is the point of the game.
- EXTERNAL INCIDENT fires on `landed`.
- The debug panel (key D) and truth marks (key T) are the only exceptions.

## 7. Needs from sim/config (not done; the UI works around them)

1. **Bay rule action.** `setBayRule(st, lane, slot, 'block'|'wave')` and a per-slot `onFull`. The upgrade panel's toggle needs it. Until then it shows the element default, read-only.
2. **Spec-sheet catch.** `elementStats(..., { spec: true })`, or `specTPR`, with no traits, no m-collusion and no trait stealth. Workaround in §6.
3. **`splitRates(st, split)`** in rules.js returning $/s, R&D/s and evidence/s for a split. hud computes it meanwhile from `compute`, `mod`, `extValueMult` and BALANCE, which duplicates sim logic.
4. **fx ids get clobbered.**
   - `fx(st, 'event', { id })` (events.js:134) and `fx(st, 'card', { id })` (research.js:72) overwrite the numeric fx id with a string, because `...data` is spread after `id`.
   - Fix: spread data first, or rename the key to `eventId` / `cardId`.
   - Workaround in place: `drain()` counts with `st.fxId` and never compares entry ids. Never key on an fx's `e.id`.
5. *(Nice to have)* **Per-mount verdicts on `landed` / `foiled`** (`[{slot, verdict}]`), so the trace needn't rebuild them from fx. The fx it would rebuild from can be trimmed at G7.

## 8. Layout (logical px; `ui/layout.js` is the source)

| Region | Rect | Owner |
|---|---|---|
| Top bar | 0,0 1200×32. cash 8,4 108×25 · rep 128 · model 192 · rival 316 · misalign 398 (w 244) · tasks LCD 649,13 · split 706 (bar 752,17 348×10) · controls 1108 | hud |
| Track EXT / INT | x 8 / 424, w 408 | |
| └ header | y 37 h16 | tracks |
| └ strip | y 58 h20 (mode 128 · events 276) | hud |
| └ field | y 84..524 = rail 128 · gap 4 · body 208 · gap 4 · bays 64 | tracks |
| └ edge | y 528 h26 | tracks |
| Mount row i | x+1, 101 + 42i, 126×41 | tracks |
| Dossier | 8,558 408×94, with lab site 318,561 94×14 | hud |
| Ops log | 424,558 408×94 | hud |
| Codec | 840,36 352×336 | codec |
| └ incident | 848,42 336×20 | |
| └ portraits L / R | 848,65 / 1086,65, 98×122 | |
| └ handset | 965,63 | |
| └ dialog | 847,206 338×100 (tall 164) | |
| └ lamps | 1022 / 1106, y 308 | |
| └ trace | 848,326 336×44 | |
| Context panel | 840,378 352×138 | menu |
| Menu keys | `menuKey(i)` = 840 + 40(i%9), 522 + 48⌊i/9⌋, 32×44; label y 630, help y 646 | menu |

Debug key **L** outlines every region and every live hit rect.

## 9. Hit regions and input

**Registering.** While drawing, a module calls `c.hit.add(x, y, w, h, kind, data, cursor)`.

**Resolving** (`ui/input.js`):
- Hits resolve against the last frame. The topmost (last added) region wins.
- A click is a press and release on the same region (kind + data). Right click calls `context`.
- A kind with `drag` captures the pointer.
- Clicking empty space drops placing. Right-clicking empty space drops placing and selected.

| kind | owner | data | does |
|---|---|---|---|
| `mount` | tracks | {lane, slot} | Placing → place (an Interp Lab goes to the global site). Shift → upgrade. Otherwise select. Context → sell |
| `slot-buy` | tracks | {lane} | buySlot |
| `bay` | tracks | {lane, slot} | select that responder |
| `split` | hud | {handle} | drag a seam: 0 = Product\|Cap, 1 = Cap\|Safety |
| `banner` | hud | {id} | hover: event effect tooltip |
| `dossier-row` | hud | {id} | hover: row tooltip |
| `lab-site` | hud | {} | place / select / context → sell |
| `hud-btn` | hud | {action} | pause / fast / mute |
| `choice` | codec | {i} | choose(i) |
| `codec-next` | codec | {} | finish the line / next line |
| `menu-item` | menu | {id} | toggle placing (a locked key toasts its hint) |
| `ctx-btn` | menu | {action} | research / retrain / rsp |
| `upg-btn` | menu | {action} | upgrade / toggle / sell / close |

**Keys:**
- Space pause (you can still build) · F ×3 · M mute · R research · Esc cancel.
- 1–9: answer the choice, else pick a research card, else take the i-th unlocked element.
- `?debug=1` only: N next generation · $ money · U unlock all · D debug panel · T truth marks · L layout.

## 10. Timing and fx

- **Clocks.** Animation runs on `c.t`: real seconds, or `view.clock` when the harness freezes it. The sim runs on `st.t`.
- **Reading fx.** Read new fx with `for (const e of drain(c.st, cursorOf(c.view, 'mine')))`. Each module keeps its own cursor and drains every frame (fx trims to the last 400 once over 800).
- **fx-born animations** start at `t0 = c.t − fxAge(st, e)` and are skipped if the fx is already older than the animation. A sim jump (tab wake-up, the harness) then shows only what is still fresh.
- **No `Math.random` in draw code.** Use `hash(n)` and `rnd(seed)`.
- **Typical durations:**
  - Coin pop 0.9 s, LANDED stamp 1.6 s.
  - Incident flash 0.6 s with a shake of amp 3 for 0.35 s; anomaly fade 1.2 s.
  - Odometer 0.4 s per change, typewriter 45 chars/s, model reveal 3.5 s.

## 11. Theme, text, crispness

**Fonts.**
- VT323 for data, Silkscreen for labels, DotGothic16 for the codec voice: `F.v16 / v20 / v24 / v32 / k8 / k16 / d16`.
- `fontsReady` resolves when all three faces have loaded and re-measures text.

**Text.**
- `text(g, s, x, y, font, col, align)` returns the width. Below k = 1.5 it hand-inks VT323's M, which blurs otherwise.
- Use `fit` for ellipsis and `wrap` for line breaks.

**Caches.**
- `layer(key, w, h, paint)` with `blit` caches static art at device resolution. Keys are checked against `k` and the theme/font `epoch`.
- `glowRect` caches the phosphor bloom.
- Sprites: `sprites.js` (`ICON` per element, `SPR`, `MICRO` digits, `seg7`, `lcdPanel`).

**Colour.** Only tokens from `C`; never hex in module code. `cssVars()` hands the same tokens to the overlays.

## 12. Debug and the screenshot harness

**`?debug=1`** gives the debug keys, the panel (D), a console line every 10 s (`t G chips draw ms step ms`), and `window.__handoff`.

**`window.__handoff` hooks:**
- **Inspect:** `st`, `Sim`, `Rules`, `Layout`, `view`, `act`, `hits`, `perf`.
- **Game:** `newGame(d)`.
- **Time:**
  - `hold(on)` and `clock(t)`.
  - `frame()`.
  - `settle(sec, fps)`: steps the frozen clock and renders.
- **Sim:**
  - `advance(sec, {choose})`: stops at a choice unless `choose` is given.
  - `advanceUntil(types, maxSec, {choose})`: returns the first matching fx.
- **Set-ups:**
  - Generations and money: `toGen(g)`, `finish()`, `money(times)`, `unlockAll()`.
  - Building: `build(lane, ids)` buys mounts, money and unlocks as needed; `placeStarter()`; `upgradeTo(lane, slot, level)`.
  - Test-only state writes: `forceAttack(lane, type, n)` and `labMode(on)`.
- **Measure:** `regions(kind)`, `client(x, y)`, `bench(n)`, `summary()`.

**Harness:** `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 node test/ui-shot.mjs <outdir> [scenario ...]`
- With no arguments it lists the scenarios.
- **How it runs:**
  - It serves the game itself on a free port and routes Google Fonts through Node.
  - Each scenario gets a fresh `?debug=1&seed=3` page, with the sim held and the clock frozen at 100.
  - Each scenario saves `<name>-1200.png` and `<name>-1600.png`, then prints console errors, ms/frame and set-up notes.
  - The exit code is 1 on any page error.
- **Scenarios:**
  - `start`, `starter`, `g3-surge`, `g7-dense`, `choice`, `research`, `hover` (real mouse over the TM key), `upgrade` (real click on EXT mount 2).
  - `ext-incident` (jailbreak lands, settle 0.3 s), `int-anomaly` (forced exfil, contained or foiled, settle 0.3 s), `scorecard`.
- **Rule:** a builder's work is done when its scenarios are clean and match the mockup, with no new console errors in any scenario.
