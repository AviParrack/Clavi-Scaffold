# HANDOFF game: state of play

*Updated 2026-10-03.*

## Where it is

🟢 All six spec milestones have a first pass. M1 through M5 are solid. M6 (balance) is a first cut.

| Milestone | State |
|---|---|
| M1 sim core, config tables, headless tests | 🟢 tests pass |
| M2 playfield, lanes, tiers, place/toggle, chips, payouts | 🟢 |
| M3 economy, research draws, full layer set | 🟢 all 9 layers, 14 cards |
| M4 generations, bundles, ramp counters, m + drift | 🟢 |
| M5 codec, events, tutorial call | 🟢 12 events, 6-line G1 tutorial |
| M6 scorecard, effects, sound, balance | 🟡 scorecard, effects and sound done. Balance is a first cut |

## Places where I departed from the spec (and why)

- **Auditor coverage.** If a bundle is too big for the human to read, the flag *stays on* and passes to the next responder, or the task is blocked. In the spec's literal version a low-coverage auditor *cleared* flagged attacks, which meant humans actively let attacks through by G3. That felt wrong and made the game unwinnable.
- **Spot checks happen only when nobody is queued behind** (that's what "spare capacity" means here). Without that, the auditor jammed the lane by G2.
- **"Shut down & retrain"** stops new tasks for 30 s (no income, no layer costs). Before, income went to zero while costs kept running, which bankrupted you in G1 for picking the responsible option.
- **Catastrophic share** is 0.02 / 0.04 / 0.07 / 0.12 for G4 to G7. The spec didn't give numbers.
- **Start money is $2500** (the starter hand costs $1500) and **reputation regen is 0.15/s**. With the spec's numbers, even sensible play went bankrupt or lost the public by G3.
- **Rival lab:** 250 s per generation, starting 0.1 gen behind.
- **All-layers assertion:** the spec says this policy "goes bankrupt or falls behind the rival". One seed out of five instead dies of a catastrophe at G4 while ahead of the rival. The test now asserts it never wins, and that it goes bankrupt or falls behind in at least 4 of 5 seeds.

## Balance snapshot (`node test/headless.mjs balance smart`)

The scripted "smart" policy uses cheap detectors and swaps humans for Defer once bundles grow. It does not toggle anything.

```
easy    C5 W7 C5 B7 R5 C7 C6 R6 C6 R6
medium  C5 C6 B2 C5 B4 B5 C6 R6 C7 B5
hard    C4 R5 R4 R4 R4 R4 R4 C6 B6 R6
```
W = win, C = catastrophe, R = reputation, B = bankrupt; the number is the generation reached. A human who toggles layers and reads the codec should do better. The knobs that matter most:
`BALANCE.repRegen`, `startMoney`, `rivalSecondsPerGen`, `driftCoef` and `GENERATIONS[].catShare`.

## Next

- 🚩 Playtest by hand and retune. Questions for Avi: should Medium be winnable on a first serious try?
- Spec open questions are still open: should internal tasks pay cash, is a board-confidence meter needed, should lanes split into sub-lanes, and is mobile in scope? (Currently internal tasks pay $20 and the game is desktop only.)
- Training and Evals phases are stubs in `src/sim/phases.js` (`trainingPhase`, `evalPhase`).

## v2 (in progress, 2026-10-03)

Avi's v2 feedback asked for a deep stack, distinct lanes, visible events with timers, icon menu with locked previews and hover cards, upgrades, an evidence dossier, a compute split, task volume as the main ramp, incident flashes on the codec, and a bigger art direction.

- Design doc: "HANDOFF v2 Design" (Claude Doc) with the 31 events, 18 elements, research branches, upgrade levels and evidence thresholds.
- Visual directions mockup: https://claude.ai/artifact/LsTKsM1Wu8fwcQKiCweG9S (Control Room, Blueprint, Transit Map, Riso Zine). 🚩 Waiting on Avi's pick.
- Build order: deep stack (6 to 10 tiers) and side bays, then upgrades L1 to L5, the compute split, the evidence dossier, the element catalogue, then the UI (icon bar, hover cards, event banners, incident flashes), then the volume ramp and the new events.

## v2 sim changes (chunk 1: stack, bays, kill switch, upgrades)

Sim, config and tests only. Renderers got two one-line fixes (auditor desk reads `lane.bay`, defer label shows the real pay); no UI for the new actions yet.

- **Deep stack.** Lanes start with 6 slots, buy more up to 10 with `buySlot(lane)`. Price `slotBase × slotMult^(extra slots)` × bundle: $600 → $960 → $1536 → $2458 at G1. Research "extra slot" cards still work and count toward the escalation.
- **Side bays.** Auditor, Defer and Resampler no longer hold the chip in the tier. A flagged chip (or an auditor spot check) is pulled into `lane.bay`, a desk works on it for `latency` s, then it is **approved** (back on the lane just below that tier) or **tossed** (blocked/caught). Bay full → `onFull` in `config/layers.js`: auditor `block`, defer and resampler `wave`. fx: `pull`, `approve`, `toss`, `waved`. Spot checks now happen only when a desk is free (replaces the "nobody queued behind" rule).
- **Waved means the flag stays on.** The spec said "the flag is dropped". I read that as "this responder drops the ball": the chip keeps its red flag and rolls on, so a responder further down or the Kill Switch can still get it. Without either, it completes flagged (counted as `completedFlagged`). Swapping to "flag cleared" is one line in `enterBay` (`sim/layers.js`).
- **Kill Switch** (`killswitch`, kind `catchall`, in the starting hand). It kills any chip that is still flagged when it arrives *and has no active responder below*. That condition makes it a true catch-all wherever it is placed: put it mid-stack and it leaves flags to the auditor below. Each trigger costs `triggerRep` rep and `triggerCost` × bundle. There is an unlock card in `cards.js` for the catalogue, but it never draws because the switch starts unlocked.
- **Upgrades L1 to L5.** `config/upgrades.js` has one table per element: `price` (L1→2 … L4→5) and per-level arrays (`tprMult`, `fprMult`, `desksPlus`, `spotCheckMult`, `delayMult`, ...). L5 keeps the L4 numbers and adds a capstone flag. Action `upgrade(lane, tier)`. Slots store `level`. Selling refunds 50% of buy price plus upgrades.
- **One stats function.** `elementStats(st, id, { lane, level })` in `rules.js` returns `catch, falseAlarm, costPerTask, delay, desks, onFull, level, upgradePrice, capstone` plus element extras. `slotStats(st, lane, i)` wraps it for a placed tier. The sim reads desks, delay, cost, spot check, inject rate and the kill price from the same function.
- **Detector auto-block kept.** A flagged chip with no responder below is still blocked on the spot (v1 rule and tutorial line). The Kill Switch covers the flags that slip past a responder: waved chips, an auditor that couldn't read the bundle, a responder switched off by Ship It.

**Tests.** All the old asserts pass unchanged. The all-layers policy now also places the Kill Switch. The smart policy puts responder plus kill switch in the bottom two tiers, upgrades when it has 4× the price and buys internal slots from G3. New asserts: slot escalation and the cap at 10, bays never stall (no timeouts, every chip accounted for, bay ≤ desks, wave and block both exercised), upgrades raise measured TPR to the L3 config value, kill switch kills every unresolved flag (and leaves them alone above a responder), money conserved with slots, upgrades and sells. The defer bay test stretches Defer's desk time to 4 s inside the test, because G1 traffic can't fill two 0.5 s desks.

**Balance after chunk 1** (`node test/headless.mjs balance smart`):
```
easy    R6 W7 W7 R7 W7 C5 R7 C7 W7 R6
medium  B5 C4 R7 C5 C5 R6 R7 C7 C6 R5
hard    C5 C4 R6 R6 R5 C4 B2 W7 C4 B5
```
Runs last longer than in v1 (bays stop the auditor jamming the lane). Big external timeout counts in late generations come from inline detector holds (monitor 0.3 s) and Demand Surge. That was already true in v1, and the internal lane has fewer timeouts now.
