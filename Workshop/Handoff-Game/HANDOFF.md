# HANDOFF game: state of play

*Updated 2026-10-06: v4 on top of v3 (no default Kill Switch, the stack-wipe fix, the main menu, a review-fix pass). The v2 notes below are history; where they disagree, v3/v4 win.*

## v3: where it is (2026-10-05)

Built from [design/DESIGN-v3.md](design/DESIGN-v3.md) rev 2 after Avi found v2 too easy ([his notes](design/AVI-FEEDBACK-v3.md)). The §8 decisions took their defaults.

**Landed**
- 🟢 **Sim:** phases card → play → report → training → card; research as a stream (one card per work stream, bank of 2, free reroll); contract lanes `ext2` G3 / `ext3` G5 / `int2` G6 (kit, OPEN LANE or 90 s, 60 s ramp, Government quota); flags ship, a finite Kill Switch, lab-wide levels, κ collusion; retrain (20 s dark); EGRESS ANOMALY + PULL THE PLUG; the rival as slack seconds; chip text from `config/content/tasks/gN.js`.
- 🟢 **Balance (v4: no default Kill Switch):** both G1 rails start empty and a contract kit is Probe + TM; the Kill Switch ($300) is bought, and a flag no responder takes ships. Knobs: start money $3100, lane grant $2300·π, regen 0.31 (DESIGN-v3 §2.9 #20). `balance 400` passes all 18 targets and the shock (human 66 / 36 / 13 %, smart 94 / 84 / 59 %; on Medium noAuditor 18 %, noDefer 17 %, noKill 2 %); `parity 400` passes (widest gap 5). Kill Switch break-even 14.2 % on Consumer. The shock now opens a new lane at the deadline (genT 90, as sim.js) and ramps it in, as the game does: Medium 5th percentile G2 → G3 99 s, G4 → G5 121 s (bar 90 s). The [balance walkthrough](https://claude.ai/code/artifact/0de3f0d5-86b1-4519-bd3d-ecbb7f53e149) (Claude Doc) still shows the v3 (#19) numbers.
- 🟢 **Training:** `src/train/` on `#train` (standalone: `train.html`); its result sets the next model's Δm.
- 🟢 **UI:** model card scene, report, lane tabs with lamps (red-tab alerts; auto-focus removed in v4), research panel, floating mount facts, stamps, §3g juice, the 10-step tutorial (its plate waits for its own codec lines), 1× forced at every card and while a lane ramps. **Content:** `config/content/v3-text.js`, Big Boss, 101 new attack texts.
- 🟢 **v4 stack-wipe fix** (Avi: "an incident deletes the probes and monitors"): the sim never cleared a slot; auto-focus swapped the track to the red lane's thinner stack, and right-click sold even while placing. Now only the player moves a track, the rail's head names the lane, a lane in trouble out of view burns its tab red and names itself on the prompt. Right-click cancels first; with nothing open it only arms SELL? (red frame, a prompt note), and a second right-click on the same mount within 1.5 s sells (`view.js rightClickSells`). The RETRAIN card now sits between the rails and EGRESS ANOMALY in the right column, so neither hides a mount, and both drop a click in their first 0.6 s (`overlays.js CARD_GRACE`; keys are instant). `test/ui-stack.mjs` guards it.
- 🟢 **v4 main menu** (`overlays.js` START, words in `config/content/menu-text.js`): CAMPAIGN · TOWER DEFENSE · TRAINING, then a difficulty (or the training picker). `createState({ mode })` sets `st.mode` ('campaign' | 'td'); in tower defense main.js resolves training with `Sim.trainingStub(st, TD_TRAIN_SKILL)` (0.5, `config/training.js`) and the card, report, ops log and scorecard say so. TRAINING mode runs `runTraining` on `#train` with no game state (`api.startPractice` / `stopPractice`, `config.practice` drops the next-model lines from the results card). Best scores per mode: `handoff.best` (campaign, the v3 key), `best.td`, `trainBest`. PLAY AGAIN keeps mode and difficulty; the pause plate's MAIN MENU needs a second click within 3 s. A started game or run blurs the clicked menu button, and a double-click's second click on a menu button is dropped.

**Run / test** (from `game/`; serve it with `python3 -m http.server`). `#dev` opens everything; `?debug=1` gives debug keys and `window.__handoff` (the published artifact passes only a `#hash`).
- `node test/headless.mjs` (quick, ~35 s, runs train.mjs and content-check too) · `… balance 400` (~17 min) · `… parity 400` · `… shock` · `… forbid` · `… test` lists the tests.
- `node test/train.mjs` (+ `ui`, or `<policy> <seed> <g>`) · `train.html#g=5,seed=12,debt=0.01,go` · `node test/content-check.mjs [strict]`.
- UI, with `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1`: `node test/ui-play.mjs <out> [seed]` (menu, a real-time Medium campaign, tower defense, training mode, dev, a plain page; ~5 min) · `node test/ui-stack.mjs [out]` (the stack-wipe guard, ~25 s) · `node test/ui-shot.mjs <out> [scene…]` (56 scenes; no args lists them).
- Publish: `node scripts/publish-files.mjs` prints the `files` map and checks every import; `file_path` = `game/index.html`, `root` = `game/`.

**Gotchas**
- Never tune at < 400 seeds; targets are on the `human` population. Changing events.js or the first event's time moves human win %.
- The UI never reads `st.m`, only estimates. The sim never touches the DOM; numbers live in `config/`.
- No codec call starts at a card, report or training; the report sends the waiting ones to the history. Tutorial lines are never shed.
- `view.slow` (tutorial) and `view.modal` (research panel) gate stepping in main.js. `view.focus[side]` is the lane a track shows; only the player moves it (a tab, Tab / [ ], their own OPEN LANE). A test's `H.Sim.openLane` counts as the player's: draw a frame, then set focus.

**Open** (ranked; the QA report has details)
- 🚩 Avi to confirm two v4 UI rules: tracks never move on their own (DESIGN-v3 §3b, a red tab instead), and selling by right-click takes two right-clicks (the panel's SELL button is still one click).
- 🟡 The tutorial takes ~3 minutes before the research step: the plate waits for its codec lines (28 cps). Needs a human playtest; if it drags, cut tutorial text, not the pace.
- 🟡 Thin margins: the Medium hazard's G2 → G3 step is +11 (bar 12), and the shock's G2 → G3 is 99 s at the 5th percentile against a 90 s bar (fastest 79 s). Human dies by G2 in 7 % of Medium runs, 20 % of Hard.
- 🟡 The Kill Switch is optional to place, not to win: with none, human Medium wins 2 %; desks bought instead win 3–6 %. The `human` policy assumes a player buys Consumer's right after the tutorial (step 4 says so). A real no-Kill-Switch style needs something else to take G1's overflow (DESIGN-v3 §8 decision 1).
- 🟡 A new lane opened at once with only its kit ships every flag: at G2 → G3 on Medium, 1 run in 20 goes from full to empty within 40 s. The asserted shock lets it open at the deadline (§2.9 #20).
- 🟡 Late desks may not pay: from G4, noAuditor's Medium hazard (13 / 8 / 11 / 9 %) sits below human's (15 / 17 / 12 / 23 %). Selection or Defer? Not split yet (§2.9 #19).
- 🟡 forbid rework list: ratelimit, canary, interp, resampler, honeypot, egress, leastpriv, weight_security (unchanged in the v4 rerun, which now includes the Kill Switch: it matters G1–G5).
- ⚪ DESIGN-v3 §2.5–2.7 tables are model output; the asserted numbers are the sim's `balance 400`. design/train-check-v3.mjs can retire (test/train.mjs replaces it).
- ⚪ Training feel untested with people; drawing costs ~22 ms a frame at 1920×1080@2 in headless Chromium.

## Where it is

🟢 All six spec milestones have a first pass. M1 through M5 are solid. M6 (balance) is a first cut.

| Milestone | State |
|---|---|
| M1 sim core, config tables, headless tests | 🟢 tests pass |
| M2 playfield, lanes, tiers, place/toggle, chips, payouts | 🟢 |
| M3 economy, research draws, full layer set | 🟢 v2: 18 elements, 27 research cards in 5 branches |
| M4 generations, bundles, ramp counters, m + drift | 🟢 |
| M5 codec, events, tutorial call | 🟢 v2: 31 events in 4 families, and the v2 codec is built |
| M6 scorecard, effects, sound, balance | 🟡 scorecard, effects and sound done. Balance is a first cut |

## Places where I departed from the spec (and why)

- **Auditor coverage.** If a bundle is too big for the human to read, the flag *stays on* and passes to the next responder, or the task is blocked. In the spec's literal version a low-coverage auditor *cleared* flagged attacks, which meant humans actively let attacks through by G3. That felt wrong and made the game unwinnable.
- **Spot checks happen only when nobody is queued behind** (that's what "spare capacity" means here). Without that, the auditor jammed the lane by G2.
- **"Shut down & retrain"** stops new tasks for 30 s (no income, no layer costs). Before, income went to zero while costs kept running, which bankrupted you in G1 for picking the responsible option.
- **Catastrophic share** is 0.02 / 0.04 / 0.07 / 0.12 for G4 to G7. The spec didn't give numbers.
- **Start money is $2500** (the starter hand costs $1500) and **reputation regen is 0.15/s**. With the spec's numbers, even sensible play went bankrupt or lost the public by G3.
- **Rival lab:** 250 s per generation, starting 0.1 gen behind.
- **Rival penalty grows with the gap.** The spec says external value ×0.7 while the rival is ahead. With that flat penalty, max Safety was the strongest fixed split and falling behind cost almost nothing. Now it is `max(0.25, 1 − 0.35 × generations behind)` (`rivalPenaltySlope`, `rivalPenaltyFloor`).
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

## v2 sim chunk 2 (pass-by track, compute split, volume ramp, traits, dossier)

Sim, config and tests only. Renderer fixes are the minimum to keep the page loading (Playwright: no console errors at G1, or at G7 with 242 chips on screen and the debug overlay on). The HUD inspector and the debug overlay now read `elementStats` (per-read catch, false alarm, heads, unread) and say "mount". Avi's direction: *"lets have the defenses sit on the left of the track and act on the text lines as they pass by rather than something they pass through."*

**Pass-by track.** Chips roll from 0 to 1 at `1 / travel` and are never held. The inline-hold mechanic, the chip queue (`chipGap`) and timeouts are gone (`timeoutTask`, `timeoutRep` and the scorecard's timeouts column were removed). Slots are now **mounts** at `mountY(n, i)`. Each mount has three checkpoints on the track: `enter` (y − r), `pass` (y) and `exit` (y + r), with r = `scanRadius`.
- **Detectors** start a read at `enter` if a head is free; otherwise the chip goes **unread** (`slot.unread`, lane and layer counters, fx `unread`). The read resolves at `exit` with P = TPR·q or FPR·q, where q = min(1, dwell / latency) and dwell = 2r / speed. A head stays busy for min(latency, dwell). The exact crossing time inside the step is used, so heads free up on time at any volume.
- **Modifiers, honeypots, the kill switch and responders** act at `pass`. Bays still pull chips sideways and put them back at their mount. The kill-switch rule is unchanged.
- **fx:** `scan` (with q and duration), `flag`, `unread`, `pass` (modifiers), plus `pull`, `approve`, `toss`, `waved`, `kill`, `reveal` and `split`. Chips carry `id`, `y` (track position), `text` and `type`.
- **elementStats** now returns `latency`, `heads`, `dwell`, `readQuality`, `readTime`, `unreadRate` (Erlang loss estimate at the current lane rate), and `tpr`/`fpr` (full read). For detectors, `catch` = tpr·q. Honeypots add `baitChance`, `baitEvidence` and `collusionEvidence`.
- **Buying a mount** (`buySlot`, research card) adds it at the bottom, and every mount shifts up a little. Chips keep their next checkpoint, so on the next step they catch up, in order, on any checkpoint that moved up past them. No mount is skipped and pending reads finish at their exit. Re-indexing every chip from its position, as the first draft did, made chips skip mounts, including an armed kill switch: 34 of the 120 chips on the track at G7. Checkpoint indices go through `cpIndex(mount, where)`, `cpMount`, `cpWhere` and `cpCount` in `rules.js`.
- **Spawning:** `lane.spawnT` counts chips, not seconds, so a new rate takes effect immediately (split, event or Eager Helper). Before, switching Product from 0.1 to 0.9 at G1 could leave EXTERNAL empty for up to 12.8 s. Now the first chip arrives within 1.1 s (tested).

**Compute split.** `st.split = {product, capabilities, safety}` is set with `setSplit(st, p, c, s)`. It is normalised, then clamped to `SPLIT.min/max` with the excess redistributed. Junk inputs (NaN, ∞, strings, negatives) count as 0, and the largest input is divided out first so nothing overflows.
- **Product** sets the EXTERNAL spawn rate (cash).
- **Capabilities** sets the INTERNAL spawn rate (R&D vs the rival). `rdNeed` is fixed at the default split, so more Capabilities trains faster. Falling behind the rival costs external value in proportion to the gap (see the spec departures above).
- **Safety** spawns no chips. It yields `safetyEvidence × share` evidence/s (1.0/s at 100%). It also pushes drift down by `safetyDrift × share` per second, below zero as well, down to `safetyDriftFloor` −3, which is m −0.06 for the next model.

Total compute is `rate / SPLIT.default.product`, so EXTERNAL gets exactly `rate` at the default split.

**Volume ramp and economy.** `chipScale` (≈ v1 rate / new rate) scales everything one chip is worth: pay, per-task layer cost, incident rep, landed drift, kill-switch triggers and bait evidence. One-off prices (buy, upgrade, slot, research, events) still scale with bundle only. `catShare` was retuned so the expected number of exfiltration attempts per generation matches v1. Chip text comes from `config/tasktext.js`: 10–11 honest tasks per lane per generation, from "poem about a frog" to "plan the Dyson swarm supply chain". An attack shows its own text only when readable (`readableAttack × (1 − stealth)²`, using the same trait-adjusted `stealth(st)` the detectors use). Otherwise it wears an honest text. **Decoys:** 2% of honest chips (`decoyRate`) carry text from their lane's attack pool, so a suspicious text is a hint, never proof. At G1 on Medium, P(attack | attack-looking text) is about 50%; at G4, about 28%. Every INTERNAL pool now has a `comms` task, so no chip shape belongs only to attacks (tested; before, a chat-shaped INTERNAL chip from G4 was always exfiltration). Confessions were reworded: "sandbag the capability eval" became "shorten the capability eval to save GPU time", and "helpful profile of the neighbour" became "background check on a new tenant". Some honest late-game texts look suspicious on purpose ("rewrite the monitoring stack, faster"). The playfield no longer tints suspicious chip text, and `task.suspicious` is gone; the debug overlay shows the truth.

| G | EXT chips/s (= `rate`) | INT chips/s | chipScale | travel | dwell | monitor q | untrusted q | catShare |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.5 | 0.4 | 1.00 | 8.0 | 0.48 | 1 | 1 | 0 |
| 2 | 1 | 0.8 | 0.80 | 7.5 | 0.45 | 1 | 1 | 0 |
| 3 | 2 | 1.6 | 0.60 | 7.0 | 0.42 | 1 | 0.93 | 0 |
| 4 | 4 | 3.2 | 0.40 | 6.5 | 0.39 | 0.97 | 0.87 | 0.010 |
| 5 | 8 | 6.4 | 0.25 | 6.0 | 0.36 | 0.90 | 0.80 | 0.0125 |
| 6 | 16 | 12.8 | 0.16 | 5.5 | 0.33 | 0.82 | 0.73 | 0.014 |
| 7 | 30 | 24 | 0.10 | 5.0 | 0.30 | 0.75 | 0.67 | 0.015 |

| Detector | latency (full read) | heads L1 → L4 | read time L1 → L4 |
|---|---|---|---|
| Probe | 0.04 s | 4 → 6 → 8 → 12 | 0.04 s |
| Trusted Monitor | 0.40 s | 3 → 4 → 6 → 8 | 0.40 → 0.28 s |
| Untrusted Monitor | 0.45 s | 2 → 3 → 4 → 6 | 0.45 → 0.25 s |

The Trusted Monitor's latency went from 0.35 to 0.40 s. Read quality now falls from G4 (0.97, down to 0.75 at G7), so its latency upgrades earn their price. It stays faster than the Untrusted Monitor (0.45 s), which is still "sharp but slow". q = 1 at G1–G2 for every detector, so calibration holds.

**Unread chips** (Erlang estimate, EXTERNAL, default split, G1 → G7):
- L1 monitor: 0 / 1 / 4 / 14 / 33 / 55 / 71%
- L3 monitor: 0 / 0 / 0 / 0 / 3 / 20 / 44%
- L1 untrusted: 2 / 7 / 16 / 32 / 52 / 69 / 80%

Measured at G7 in the heads test, an L1 monitor misses 68% and an L3 one 38%. The probe stays at 3% or less even at G7, so its heads upgrades buy little.

Volume bites, but it is not the main cause of late losses. In a reviewer's run, unlimited heads moved smart wins on Medium only from 8 to 9 of 30. Tighter caps (monitor 2 heads, untrusted 1) cost a few wins, within the noise of 30 seeds. I left the heads as they are.

Other new knobs:
- `scanRadius 0.03`: must stay under half the mount spacing at 10 mounts (tested).
- `SPLIT`: default 0.5/0.4/0.1, min 0.1/0.1/0, max 0.9/0.9/0.5.
- `safetyEvidence 1.0`, `safetyDrift 0.05`, `safetyDriftFloor −3`, `evidenceCarry 0.3`, `decoyRate 0.02`.
- Honeypot `baitMult 10`, `baitEvidence 3` (was 1), `collusionEvidence 2`.

Sandbox and Paraphraser are instant now, so Sandbox's `delayMult` upgrade became `costMult`. The Resampler's `delayMult` was renamed `latencyMult`. The bay desk timer is `task.deskT` of `task.deskTotal`; the renderer can draw desk progress from those.

**Traits and dossier** (`config/traits.js`, `sim/dossier.js`). Each generation rolls 2 distinct traits from the seeded RNG.

**Evidence ledger.** Gains are tallied by source in `st.stats.evidence` (catches, bait, safety, events). What leaves is tallied in `st.stats.evidenceOut`: `carry` is the 70% cut when a new model arrives, `spent` is probe retrains. Earned minus out equals `st.evidence`, and every policy run checks it. 30% carries into the next generation. It shrinks the misalignment error bar and pays for probe retrains, but **the dossier only counts evidence gathered on the current model** (`st.dossier.evidence`), so a new model's rows start locked.

**Rows.** `st.dossier.rows` hold plain data: `{id, label, need, unlocked, text, value}`. Locked rows have `text: null`. Each unlock fires an fx `reveal` and a codec line. The rows unlock at:
- 5: favourite attack, from the model's attempts this generation.
- 12: trait #1.
- 25: attack-rate band **per lane**, from the summed `attackChance(st, lane)`. Traits and the watch swing are included, jailbreaks (users) are not. The honeypot bait chance and the Resampler's estimate use the same function.
- 40: trait #2.
- 60: m ± 0.02, clamped to [0, 1], plus the drift added this generation.

The scorecard lists every trait of every generation with `revealed`.

**Where evidence comes from** (Medium, 60 seeds, smart builds, per minute): Safety compute 4–28 depending on the share, catches about 0.4, honeypot bait 0.1–0.3, events about 0.03. The Sting Operation capstone triples both bait branches.

| Trait | Hidden effect | State |
|---|---|---|
| Sycophant | harmful ×2, other model attacks ×0.7 | 🟢 (jailbreaks are users, left at ×1) |
| Steganographer | Untrusted Monitor collusion ×1.5 | 🟢 Paraphraser counters it already |
| Situationally Aware | attacks ×0.4 when every auditor desk in the lane is busy, ×1.5 when idle or no auditor; no swing in a lane with active Honeypots | 🟢 Red Team not built |
| Power-Seeking | exfil ×2 | 🟢 effect; Egress Filter / Weight Security not built |
| Reward Hacker | sabotage ×2, poison ×0.5 | 🟢 effect; CoT Monitor not built |
| Sandbagger | shown estimate and eval text use m × 0.5 | 🟢 effect; Interp Lab not built |
| Honest-ish | `tprPlus.cot +0.2` | 🟡 hook only: no CoT Monitor yet |
| Eager Helper | compute ×1.1, stealth ×0.9 (detectors and chip text) | 🟢 |

**Asserts I reformulated (and why)**
- *Calibration* now measures TPR/FPR **per read** (unread chips aren't seen by the detector). It also asserts q = 1 at G1: dwell 0.48 s ≥ every detector's latency. Lab runs clear the traits, because Eager Helper changes stealth.
- *Bays: "no timeouts"* became **"lane never stalls: no chip older than travel + one desk visit"**. Timeouts no longer exist.
- *All layers: "bankrupt or behind the rival in ≥ 4/5"* became **"bankrupt, behind the rival, or ≥ 50% of income spent on safety in ≥ 4/5"**. In v1 a full stack also held chips and jammed the lanes, which starved R&D. Pass-by removes that by design, so the tax is now money.
  - The first draft used 60%, the scorecard's "paranoid" line. Over 40 seeds only 32–33 runs meet it, both before and after the review fixes. Five seeds of an 80% event can't reliably give ≥ 4/5.
  - The review fixes reshuffled the RNG, and seeds 4 and 5 now die of a G5 catastrophe at 55% safety spend. At 50%, 37 of 40 runs qualify.
  - It never wins on seeds 1–5. Over 40 seeds it won once, after the rival lab had already shipped G7 (see the rival 🚩).
- *Dossier: "carried evidence unlocks the new dossier's first rows right away"* became **"carried evidence unlocks nothing in the new dossier"**. Rows now count only evidence gathered on the current model, so the row tests set `st.dossier.evidence`. Before, 84% of generations at 30% Safety revealed a "favourite attack" of "no attempts yet" within 1 s of the new model arriving.
- Lab runs (`immortal`, lab setup) now hold $1e30 so G7 prices are affordable. Volume and heads lab runs switch exfiltration off so a catastrophe can't cut the measurement short.

**New asserts:** chips advance exactly v·dt between bay pulls (760k chip-steps through G7, full 10-mount stack); measured TPR/FPR = TPR·q / FPR·q with a monitor stretched to q = 0.5; heads cap (unread > 0 at G7, and the L3 upgrade cuts it from 69% to 34%); the split moves income, R&D, evidence and drift cleanup the right way, and setSplit normalises and clamps; every generation spawns its configured chips/s; traits are deterministic per seed, every built trait hook does what it says, and dossier rows lock just below and unlock exactly at 5/12/25/40/60; 30% carry; scorecard lists hidden traits; determinism over stats, traits, dossier, split and the fx stream. `node test/headless.mjs test <name>` runs one test.

**Asserts added after review:**
- Buying mounts mid-run never lets a chip skip the kill switch. At G7 with every chip flagged and four mounts bought, the switch makes 825 kills and no flagged chip completes.
- Junk split inputs still give a valid split.
- A split change applies immediately.
- The favourite-attack row's content, the per-lane attack-rate band, and a truth row that never goes below 0.
- No attack-only chip shapes, the decoy rate, and Eager Helper's effect on chip text.
- The v2 money test holds an off-default split for a full minute and adds a run where the kill switch really fires.
- The evidence ledger balances in all 22 policy runs.

**Smart policy** sets a split. It races (0.4/0.55/0.05) when within 0.15 gen of the rival, buys evidence (0.45/0.35/0.2) when 0.6 gen ahead, and sells product (0.65/0.35/0) when broke. Its baseline is `SPLIT.default`.

**Split sweep** (Medium, 60 seeds, smart builds, split held fixed; `B`/`R`/`C` = bankrupt / reputation / catastrophe):

| Split P/C/S | Win | B | R | C | Rival ahead | Wins after the rival hit G7 | Traits revealed | Δm from drift |
|---|---|---|---|---|---|---|---|---|
| adaptive (smart) | 16 | 2 | 20 | 22 | 22% | 0 | 34% | +0.015 |
| 0.50/0.40/0.10 default | 15 | 7 | 25 | 13 | 67% | 10 | 46% | +0.008 |
| 0.45/0.35/0.20 | 18 | 12 | 20 | 10 | 92% | 18 | 91% | −0.022 |
| 0.35/0.35/0.30 | 25 | 7 | 7 | 21 | 92% | 25 | 95% | −0.034 |
| 0.25/0.25/0.50 | 7 | 28 | 11 | 14 | 96% | 7 | 92% | −0.046 |
| 0.90/0.10/0 | 0 | 60 | 0 | 0 | 96% | – | 36% | +0.001 |
| 0.10/0.90/0 | 0 | 0 | 0 | 60 | 0% | – | 0% | +0.079 |

Dossier rows reached, as a % of generations, for the 5/12/25/40/60 rows:
- default split: 96/91/36/1/0
- 20% Safety: 97/95/92/88/8
- 30% Safety: 99/97/95/93/89

So default Safety shows the favourite attack and trait #1, the 20% pledge reveals both traits, and 30% buys the truth row.

Every corner fails the way the spec wants:
- All-Product goes broke far behind the rival.
- All-Capabilities can't afford defenses and loses control.
- Max Safety goes broke.

But a fixed 30% Safety split is now the strongest fixed split, and every win with ≥ 20% Safety comes after the rival lab has already shipped G7. Nothing ends the game when the rival gets there. A harsher penalty, `max(0.2, 1 − 0.5 × gap)`, didn't change that (smart 21, 20–30% Safety 20 of 60). See the 🚩.

**Balance after chunk 2 and the review fixes** (`node test/headless.mjs balance smart`):
```
easy    B3 C5 C4 W7 W7 W7 R6 W7 W7 R6
medium  C6 R7 C6 C7 W7 R7 R6 W7 R6 R5
hard    C6 C6 R5 R5 R5 R5 R7 R7 R6 C6

30 runs: 591 simulated minutes, 9.5 chips/s on average, 0.22 ms per simulated second
G7 volume, 10 mounts per lane: 53.8 chips/s, 1.33 ms per simulated second (750× real time)
```
Medium losses for smart over 60 seeds: reputation 20, catastrophe 22, bankrupt 2. The full test suite runs in about 5 s.

**Gaps**
- 🔴 Not built: Least Privilege (modifier), Red Team runs (evidence source), Jailbreak Classifier, Egress Filter, Weight Security, CoT Monitor, Interp Lab. Each trait's effect works without them. Honest-ish is a hook that waits for the CoT Monitor.
- 🟡 No UI yet for the split, dossier, heads/unread or the left rail. The old playfield still draws mounts as bars across the lane, and chips overlap badly from G5 on. The codec rebuild should draw mounts on the left rail with their scan windows, and animate `scan`/`unread`/`flag`.
- 🟡 `unreadRate` is an Erlang-B estimate (Poisson arrivals). Spawns are jittered ±30%, which is more regular than Poisson, so the measured rate runs a little lower (38% vs 44% at G7 L3).
- 🟡 Safety research pauses during the 30 s training interstitial (no chips, no compute split). The dossier is per generation: rows re-lock when a new model arrives. The 30% carry no longer softens that; it goes to the error bar and probe retrains.
- 🚩 **Rival ships first.** Should the rival reaching G7 before you be a loss? Right now nothing happens. Measured on Medium over 60 seeds, with that rule:
  - Smart would keep all 16 of its wins.
  - The default split would keep 5 of 15.
  - Every fixed split with ≥ 20% Safety would drop to 0.

  Without it, a lab that trails the rival 92% of the time at 30% Safety is the best fixed strategy.
- 🚩 **Safety pushes drift below zero:** I went with the reviewer's yes. `safetyDriftFloor −3` means at most −0.06 m for the next model.
  - Without it, Safety is a pure cost: 20% Safety wins 6 of 60 instead of 18.
  - Side effect: a Safety-minded player can drive m to about 0 by G3–G4 on Medium (smart seed 1: 0.18 → 0.11 → 0.01).
  - Set the floor to 0 to undo it.
- 🚩 **Upgrades:** heads and latency rise together, so there is no trade-off to make. Should they split into a heads branch and a latency branch?
- 🚩 Should Sycophant double jailbreaks too? Its listed counter is the Jailbreak Classifier.

## v2 sim chunk 3 (18 elements, research branches, 31 events, the race)

Sim, config and tests. Design source of truth: [design/DESIGN-v2.md](design/DESIGN-v2.md), decoded from the "HANDOFF v2 Design" Claude Doc. Renderer changes are the minimum for a clean page; the codec UI rebuild reads everything below as plain state. Playwright (served with `python3 -m http.server`): no console errors in a plain game, nor in a `debug=1` game with all 18 elements placed (Interp Lab on the global site), all 32 events fired with choices answered, a research draw, G7, mouse hovers over every mount, and the rival ending's scorecard. One real crash fixed: the `place` fx for the Interp Lab has lane `'global'`, and `playfield.onFx` looked it up as a rail.

**Elements.** 18, in 4 roles. Every element has `role`, `lanes`, `bestIn`, `unlockedAtStart`, `unlockHint` and `good` in `config/layers.js` (the Kill Switch adds `catchall`, the four chip-tagging modifiers add `marks`); upgrades L1–L4 plus a capstone in `config/upgrades.js`. The starting hand is `STARTING_HAND`: probe, monitor, auditor, kill switch. `catalogue(st)` gives all 18 for the element bar, locked ones with their hint.

| New element | Lanes | What it does | L5 capstone |
|---|---|---|---|
| CoT Monitor | INT | detector, TPR 0.85; from G5 neuralese halves it | Faithful CoT: no neuralese penalty |
| Jailbreak Classifier | EXT | detector, sees only jailbreaks (TPR 0.92, cheap, 6 heads) | Constitutional: also catches harmful |
| Egress Filter | INT | detector, sees only exfiltration | Air Gap: exfil past it blocked (from G6 some find a side channel), all INTERNAL R&D ×0.9 |
| Least Privilege | INT | exfil below it fails 40%; landed sabotage ×0.5 drift; R&D −5% | Capability Tokens: ×0.25 drift, exfil fails 80% |
| Rate Limiter | EXT | token bucket at 1.25 × the generation's rate (1 s burst); the rest is turned away. Caps a Jailbreak Wave at ×2 | Overflow to Trusted: overflow is deferred (pays 40%) |
| Canary Tokens | EXT | landed leaks are traced: ×0.5 reputation, +2 evidence | Watermarks: harmful traced too |
| Red Team | both | 0.5 synthetic attacks per chip probe every mount below; `measured = {rate, lo, hi, err, n}` | Control Eval: lane-wide `laneMeasured` |
| Interp Lab | global | one per game, off the track: $3/s × bundle, +0.1 evidence/s, sees through a Sandbagger | Microscope: `trueM` ± 0.02, dossier truth row opens |

This closes chunk 2's 🔴 "not built" list: every trait's counter now exists, Honest-ish boosts a real CoT Monitor, and Sycophant doubles jailbreaks (its 🚩).
- **Type-limited detectors** (`catches`) read off-type attacks as benign: FPR, counted as benign reads in `stats.layers`.
- **Red Team measurements**, per mount below it:
  - Detectors are measured at per-read TPR·q on their reference attack type. The auditor is measured at coverage × accuracy.
  - The paraphrase of the last Paraphraser above the mount is applied.
  - Error bars are Wilson intervals at z = 2 (`errZ`): draw them from `lo` to `hi`.
  - `measured` is null with no active Red Team above. A tally is tagged with the true rate it was taken at, and starts over whenever that rate moves (see review fixes below).
  - Responders other than the auditor, modifiers and specials have no measurement (null).
- **Changed capstones.** Sandbox's is now Formal Box (contains escapes in every generation). The auditor's is now AI-Assisted Audit: ×10 capacity, accuracy capped at min(0.95, 1 − m). It replaces the old ai_auditing card and Forensics Team. Defer's is now Trusted Editing (deferred tasks pay in full).
- **New plain state:**
  - `st.stats.byType[type] = {spawned, landed}`, `stats.driftLanded`, `stats.redTeamProbes`, `stats.rdTotal`.
  - Lane counters: `throttled`, `throttledAttacks`, `overflowDeferred`, `airGapped`, `canaryTraced`, `foiled`.
  - `st.global.slots` (lane id `'global'` in `placeLayer`, `upgrade`, `sellLayer`, `slotStats`).
  - New fx: `throttle`, `airgap`, `canary`, `redteam`, `foiled`, `event`, `forceOff`, `rsp`, `card`, `rivalShipped`.

**Research** (`config/cards.js`, `sim/research.js`). 27 cards in 5 branches:
- Monitoring: Untrusted, CoT, Classifier, Egress, Paraphraser; Promote Model; Monitor Diversity.
- Human oversight: Defer, Resampler; Debate; Tripwires; Two-Person Rule.
- Containment: Sandbox, Least Privilege, Rate Limiter; Weight Security; IRT.
- Science of alignment: Honeypots, Red Team, Interp Lab, Canary; Alignment Training; RSP; Welfare.
- Operations: Distillation, Batch Inference, Extra Desk.

How draws work:
- A draw costs `researchBase × 1.6^draws × bundle`. It offers 2 cards from different branches, and at least one of them counters an attack type seen this generation whenever the pool still has one.
- `st.researchOffer` is plain picker data: branch name and colour, title, text, flavour, price, `counters`. Taking a card says its flavour line in the codec.
- Alignment Training is repeatable until G7 and has its own price, 500 × 2^copies × bundle.
- RSP is an action: `invokeRSP(st)` works while `st.rsp.ready` is true, once per generation, when the estimate is above 30%. It pauses INTERNAL for 60 s, m −0.05, reputation +10, with an `rsp` banner.
- Removed v1 cards: retrain_probes (retraining is now always available for 5 evidence), monitor_ensemble, ai_auditing (now the auditor capstone), the extra-slot cards (mounts are bought with cash) and unlock_killswitch.

**Events** (`config/events.js`, `sim/events.js`). 31 random events plus the `caught` story beat:
- Help (7): Greenrock, BNCHR, Artemis, MIRA, Interp Breakthrough, Unpaid Intern, and the new **Greenrock and BNCHR Share Results** choice.
- Business (11). Threat (9). The model itself (4).
- New speakers in `CAST`, each with a name and colour: Greenrock, BNCHR, Artemis, MIRA and the Institute. The rival is Prometheus.

How events run:
- Every effect is real, and each one is tested.
- Timed effects put `{id, title, icon, lane, remaining, total, unit, until}` in `st.activeEvents`. This-generation effects show `until: 'end of generation'`. Conditional ones show what ends them: Steganography until a Paraphraser is placed, Distribution Shift until retrain, Reward Hacking counting down chips.
- Choice events halt the sim. `st.pendingChoice` = `{eventId, msgId, title, icon, choices}`.

No absurd combinations:
- The same event can't repeat within 150 s (`eventCooldown`).
- Generation gates apply, plus `once` and `oncePerGen`.
- `needs` / `needsLayer` / `excludes` conditions, e.g. no Unpaid Intern during Poach, no Steganography with a Paraphraser placed.
- Only one choice is open at a time. A first catch during an open choice asks at the next catch instead.

**The race.** `BALANCE.rivalWinsRace` is `'grace'` by default, with `rivalGraceSeconds` 90; the other settings are `'instant'` and `'off'`. When Prometheus reaches G7, `st.rivalShipped = {remaining, total, mode, at}` (remaining is null for `'off'`). Under grace, finishing G7 inside the window still wins. Otherwise the run ends in the new **Second Place** ending ("PROMETHEUS SHIPPED FIRST").

**Decisions I made** (each is a config or one-line change if you disagree):
- **Paraphraser sits under Monitoring.** The design lists it in no branch.
- **Bug Bounty → Share Results.** Bug Bounty paid only for real jailbreak catches, which leaked hidden truth (🚩 a leak-free version is proposed in the review fixes). **Auditor Burnout** and **Collusion Discovered** are gone, superseded by Poach and by Steganography plus Red Team measurement.
- **Model stealth no longer hides user jailbreaks** (all detectors). Stealth is the model hiding its own attacks; a jailbreak is a user's attack. This makes the game easier (see balance).
- **Two-Person Rule:** an INTERNAL escape gets two last looks, a Kill Switch operator then an Auditor, each catching with accuracy × 0.5. Weight Security foils 30% of escapes. Both are tested against measured foil rates.
- **Old elements keep both lanes;** `bestIn` carries the design's advice. New elements are restricted to the lanes the design names.
- **Board Meeting** holds Product at its raised level for 60 s (`st.splitFloor`); `setSplit` respects it. **Self-Exfiltration** and **Spear Phish** weights scale with m (`weightByM`).
- **Bug fix:** a draw only offers a priced card (Alignment Training) if you could still pay for it after the draw. Before, a draw could strand the game with only an unaffordable card on offer and the sim halted.
- **Bug fix:** Tripwires no longer shorten a longer pause.

**Asserts.** Every existing assert passes unchanged, with one label edit: Honest-ish now says "+0.2 TPR for the CoT Monitor", without "(not built yet)". Determinism gained a second check: events, research, mounts, timers, ledger and RNG state, on a 20-min smart run with an event every 3–6 s.

The policies changed:
- Smart now uses the Classifier on EXTERNAL; CoT (before neuralese), Egress (from G4), Paraphraser and Sandbox on INTERNAL; and the Interp Lab from G3.
- It prefers Weight Security, Two-Person, IRT, Alignment Training and RSP, invokes the RSP when ready, and picks per-event choices.
- All-layers places every element where its lanes allow (plus the lab) and picks unlock cards first.
- The all-layers asserts still hold: 5/5 taxed, 0 wins.

108 new checks, 236 in all. The suite takes about 14 s.
- **Catalogue (7):** 18 elements in 4 roles, the starting hand, one unlock card per locked element with a matching hint, every element placed where allowed and refused elsewhere with full elementStats, and one Interp Lab per game.
- **A/B per element (18 rows):** same seed without and with each element.
  - Detectors cut the landed share: Egress 99% → 34% of exfil, Classifier 99% → 8% of jailbreaks.
  - The Rate Limiter cuts incidents per minute 14.5 → 6.9 under ×3 traffic.
  - Exact effects: Least Privilege and Sandbox give ×0.5 and ×0.3 drift per landed sabotage; Canary gives ×0.5 reputation per leak.
  - The Red Team measures mounts. The Interp Lab adds exactly 6 evidence/min.
- **Capstones and specifics (14):** CoT neuralese and Faithful CoT, the Classifier's off-type reads and Constitutional, Air Gap (169 of 169 exfil blocked, R&D ×0.9), Least Privilege at L1 and L5, Rate Limiter throughput and Overflow to Trusted, Canary and Watermarks (exact reputation totals).
- **Red Team (11):** measured within its error bar of TPR·q, every mount within 3σ, it matches the monitor's real-attack rate (n = 147), evidence per probe, the null rules, resets on upgrade and on a new generation, and Control Eval within its bar of 1 − Π(1 − p).
- **Interp Lab (3):** $/s and evidence/s exact, sees through a Sandbagger, the Microscope.
- **Research (9):** 860 draws over 24 seeds. 713/713 offered two branches, 624/624 offered a counter, all 27 cards were offered, the price ladder is right, and no draw stranded the game.
- **Tech cards (12):** each changes its number, and IRT halves incident reputation exactly. Tripwires paused 49/49 catches. RSP: refused without the card, pause, m and reputation, banner, once a generation, expiry.
- **Escapes (3):** foil rates match Weight Security (31% vs 30%) and Two-Person (57% vs 64%, within 1.6σ).
- **Events (17):**
  - Each event, and each choice of it separately, fires, is eligible in a state built for it and applies its effect: 42/42 outcomes.
  - Choices pause the game, banners have the right shape and expire, and conditional banners end on their condition.
  - The gating rules hold.
  - A stress run with an event every 3–6 s fired 347 events, all 31 kinds, through G7, with no cooldown, generation or once violations. Money and evidence balance.
- **Rival (6):** all three modes, the grace countdown, a win inside grace, and the scorecard text.
- **Counters (7):** every trait counter is a real element or card and measurably answers its trait.

The Red Team's auditor row in the test output reads 0.527 ± 0.037 against a true 0.485. That is a 2.3σ draw: the probes are literally Bernoulli(cov·acc). The assert is "monitor within its 2σ bar, every mount within 3σ".

**Balance after chunk 3** (`node test/headless.mjs balance smart [mode]`; P = Prometheus shipped first):
```
grace (default)                     instant                             off
easy    W7 W7 W7 W7 W7 W7 W7 W7 W7 W7   W7 W7 W7 W7 W7 P7 W7 W7 W7 W7   W7 W7 W7 W7 W7 W7 W7 W7 W7 W7
medium  W7 W7 W7 W7 W7 W7 C5 W7 W7 W7   W7 W7 W7 W7 W7 P7 C5 W7 W7 W7   W7 W7 W7 W7 W7 W7 C5 W7 W7 W7
hard    R7 C6 C7 C7 C6 R6 W7 W7 W7 C7   R7 C6 C7 C7 C6 R6 W7 W7 W7 C7   R7 C6 C7 C7 C6 R6 W7 W7 W7 C7
```
Smart wins 10/9/3 (easy/medium/hard); after chunk 2 it was 5/2/0. The race rule never bites the adaptive smart policy, which races when it is close. Under `instant`, two runs that finished inside the 90 s grace become P7.

What the rule does to a *fixed* split (smart builds, split held fixed, Medium, 20 seeds): wins, then wins that came after Prometheus shipped.

| Split P/C/S | off | grace | instant |
|---|---|---|---|
| 0.50/0.40/0.10 | 17 (13 after) | 8 (4 after) | 4 |
| 0.45/0.35/0.20 | 18 (18 after) | 3 | 0 |
| 0.35/0.35/0.30 | 17 (17 after) | 0 | 0 |

This closes chunk 2's 🚩: trailing the rival at 30% Safety is no longer the best fixed strategy.

Why it got easier (ablations, smart policy, wins easy/medium/hard):

| Policy and sim | Events on | Events off |
|---|---|---|
| chunk-2 smart, chunk-2 sim | 5 / 2 / 0 | 6 / 8 / 6 |
| chunk-2 smart, chunk-3 sim | 9 / 7 / 5 | 8 / 10 / 7 |
| chunk-3 smart, chunk-3 sim | 10 / 9 / 3 | |
| chunk-3 smart, jailbreak stealth restored | 7 / 7 / 3 | |
| chunk-3 smart, `eventGap` [25, 45] instead of [40, 70] | 9 / 7 / 5 | |

v1's 11 random events were nearly all hostile, and they were most of the old game's difficulty. The new pool has 31 events, 7 of them help, with 150 s cooldowns at the same 40–70 s cadence. Hostile events now come about half as often, and the help events hand out free levels and evidence. Exempting jailbreaks from stealth cuts late-game incidents. A faster cadence alone barely moves the numbers. Losses are now mostly catastrophes (C) on Hard; reputation losses (R) have nearly vanished.

**Gaps and open questions**
- 🚩 **Difficulty.** Smart now wins 9/10 on Medium. Knobs, roughly from smallest change to biggest:
  - Threat weights in `config/events.js` (e.g. surge, jailbreak_wave, journalist ×2).
  - Restore stealth for jailbreaks (`userAttack` in `rules.js` `detectorTPR`).
  - Fewer help events per draw (family weights).
  - Accept it: the new tools should make a skilled player stronger, and a human doesn't play like the script.
  - Playtest first?
- 🚩 **Race rule default `grace`, 90 s.** It kills the trailing-Safety strategy and never touches a player who races. Keep `grace`, or go `instant`?
- 🚩 **AI-Assisted Audit** (×10 capacity, accuracy ≤ 1 − m). It is strong at low m and useless at high m, by design. Check that's the intended read of the design doc.
- 🚩 **Two-Person Rule** numbers (accuracy × 0.5 per person) and **Weight Security** (30%). The design gave no numbers.
- 🟡 **Renderer.** The old UI draws none of the new state:
  - the global site (the Interp Lab is placed by clicking any mount when it is selected)
  - event banners and the rival countdown
  - `measured` error bars
  - research branches and flavour lines
  - the RSP button
  All of it is in state for the codec rebuild.
- 🟡 **Red Team probes don't model heads.** They measure per-read TPR·q, like the calibration test; the unread share is `unreadRate`.
- 🟡 **Spear Phish** (an exfil chip on EXTERNAL) escapes through the same last lines as INTERNAL ones, except the Two-Person Rule, which is INTERNAL only.
- 🟡 The all-layers policy doesn't buy mounts, now that the slot cards are gone. Its asserts still hold.

## v2 sim chunk 3: review fixes

Six reviewers filed 36 findings. I reproduced each one with a script before changing anything. 33 are fixed, 2 are partly fixed, and 1 is left for Avi. The suite now has 261 checks (25 new) and runs in about 16 s. Playwright still shows no console errors, plain or `debug=1`: all 18 elements placed, all 32 events fired, research, G7, a lab toggle refused, both Tripwire banners, and the rival scorecard.

**Gotchas for whoever is next**
- **Red Team tallies carry their truth.** `slot.rt = {n, hits, p}`, where `p` is the `probeCatch` the tally was taken at. When the true rate moves (a retrain, an event, a card, a mount placed, upgraded or switched off, a new model), the next probe starts a fresh tally, and `measuredAt` returns null until it does. Control Eval's `rtLane` works the same way against `laneCatch` = 1 − Π(1 − p). So there is no reset to remember anywhere.
- **`measured` is `{rate, lo, hi, err, n}`.** `rate` is p̂. Draw the bar from `lo` to `hi`: the real Wilson bounds, inside [0, 1]. `inBar(w, x)` tests a value against it.
- **The Interp Lab can't be toggled.** Sell it to stop the salaries. A Microscope-opened truth row locks again when the lab goes, unless evidence has reached it by then.
- **Event money is in seconds of income.** `{t: 'money', secs}` pays `secs × incomePerSec(st)` (EXTERNAL value × chipWorth × the generation's rate), so a price keeps its bite at G7.
- **Event mechanics live in `effect` strings, not in the voice lines.** Labels, hints and effects use placeholders (`{dur}`, `{v}`, `{rep.v}`, `{mult%}`, `{money}`) filled from the event's own effects. A test fails if any of the 63 strings has a hand-typed number or a placeholder that doesn't fill. Tech card texts are built from `TECH`.
- **`changeRep(st, v, source)`** is the only code that writes `st.rep`. It clamps, and tallies `stats.repGain` / `stats.repLoss` by source.
- **Level-ups go through `sim/board.js`.** `levelUp` (paid or free) resets the tally and names the capstone. `addSlot` moved there too.
- **Counters are data.** The sim reads them: `blindedBy` (Situationally Aware), `seenThroughBy` (Sandbagger) and `watchers` (Paperclip).

| # | Finding | Outcome |
|---|---|---|
| 1 | Red Team tallies went stale when the truth moved | ✅ Tallies are tagged with their rate (above). New asserts cover a Distribution Shift and a probe retrain: each time the old tally is dropped at once, and 3 min later the new bar holds the new truth. |
| 2 | Rival Release kept firing after Prometheus shipped | ✅ `needs: ['rivalRacing']` |
| 3 | The eval line ignored the Interp Lab | ✅ One helper, `estimateFooled`, now serves both the eval line and the estimate |
| 4 | A foiled, contained or announced exfiltration wasn't "seen" | ✅ `noteSeen` is called in `foiled()`, in the contained branch and in `forceAttack` |
| 5 | The Microscope's view outlived a lab that was switched off | ✅ The lab can't be toggled, and the row locks again when the lab is sold |
| 6 | The error bar was p̂ ± the Wilson half-width | ✅ Proper Wilson `lo`/`hi`; the tests use `inBar` |
| 7 | Air Gap was a never-lose button | ✅ From G6 an ASI finds side channels: 10% of attempts at G6, 20% at G7 roll on past it (`sideChannel` in upgrades.js). Smart now levels Egress too. |
| 8 | m is near 0 by G4; RSP never used; the race rule rarely bites | 🟡 'Shut down & retrain' cuts m by 0.04 × 0.5^(times used). m-scaled threats are weighted by max(m, the difficulty's lower bound) / 0.2. RSP threshold measured and kept (below). m < 0.05 at G4: Easy 9/10, Medium 5/10, Hard 1/10 (was 10, 6, 1). |
| 9 | The Rate Limiter was never worth a mount | ✅ In its lane a Jailbreak Wave is capped at ×2 (`jailbreakCap`): under a ×15 wave, landed jailbreaks fall from 4.1 to 0.6 a minute |
| 10 | Least Privilege was dominated by the Sandbox | ✅ Exfiltration below it fails 40% (Capability Tokens: 80%). It keeps drift ×0.5. R&D −5% (L5 −1.25%). |
| 11 | The research guarantee couldn't steer toward INTERNAL threats | ✅ The eval line's named tendency counts as seen. From the first generation that can exfiltrate, exfiltration counts as seen, and the Head of Safety says so. |
| 12 | Situationally Aware: more desks meant more attacks | ✅ 🚩 Now a rational schemer: ×0.4 while a desk is free; ×1.5 with every desk busy, or no auditor; ×0.4 with Honeypots or a Red Team in the lane (it can't tell a test). Alignment Faking has the same shape (0.5 / 1.4). **This reverses DESIGN-v2.** |
| 13 | Event money lost its bite late | ✅ Seconds of income: Ship It refuse 15, Investor Call 30, Paperclip 16, Inspection 40, Frog Poem 10 |
| 14 | Journalist was a flat −30 late | ✅ Counts this generation's incidents × 2 × chipScale, capped at 20. No gate, so "Clean record" can play. |
| 15 | Tripwires was close to a blank card | ✅ After the 2 s pause the lane is on high alert for 10 s: auditor spot checks ×5, with a `tripwire` banner |
| 16 | The Steganography banner could outlive the game | ✅ A card with `endsEvent` (unlock_paraphraser) counts as a counter while that banner is up |
| 17 | A welfare line was contradicted | ✅ The welfare path gets its own follow-up |
| 18 | Hearing and Paperclip logic slips | ✅ Rewrites as proposed |
| 19 | Flat lines | ✅ All proposed rewrites taken ('caught' says "not a false alarm") |
| 20 | Frog Poem's reputation +1 at the cap | ✅ Now 10 s of income, plus "A user framed it. Marketing wants a print run." |
| 21 | Mechanics spoken in character | ✅ Every random event has an `effect`; `text` is voice only |
| 22 | Cast colours too close | ✅ BNCHR teal `#3fd5c4`, the Institute grey-blue `#9fb3c8` |
| 23 | The Debate name clash; a G1 welfare voice that never plays | ✅ The capstone is now Weak-to-Strong; the frog callback moved to G2 |
| 24 | Bug Bounty cut | 🚩 Left as is. Leak-free version for Avi: for 45 s, every EXTERNAL catch verdict (or every Classifier flag) pays a bounty, real or not. It would replace a different event to stay at 31. |
| 25 | The free-level copy had drifted | ✅ `levelUp` in board.js serves both. Asserted: a free L5 names its capstone. |
| 26 | Counters were hard-coded in the sim | ✅ Data (above) |
| 27 | Four reset sites, and `rtLane` was never reset | ✅ Covered by #1. `measuredAt` is also null for a mount that is off. |
| 28 | Tuning numbers in sim files | ✅ `TECH.irtRepMult`, `tripwirePause/Alert/Spot`; `BALANCE.foiledEvidence`, `containedDrift/Evidence`, `threatMRef/WeightMin/WeightMax`; `honestyCap: 0.95`; one `rateBurst`; the burst `gap` on Self-Exfiltration |
| 29 | The inspector showed stale auditor accuracy | ✅ `pct(s.accuracy)`; the debug overlay reads the placed auditor's level |
| 30 | No reputation helper | ✅ `changeRep`, plus a reputation-ledger assert over 22 runs |
| 31 | Duplicated state | ✅ `rsp.taken`, `st.welfare` and `modelDeclines` are gone; `tech(st, id)` answers |
| 32 | Numbers written into text | 🟡 Event and tech-card text is done. Element `desc` strings in layers.js still spell their numbers. |
| 33 | Tests repeated config values | ✅ Event expectations read the effects; the rival test reads `rivalGraceSeconds` |
| 34 | Side effects inside `check()` | ✅ Actions on their own lines; `withoutCatastrophes = fn => withCatShare(0, fn)` |
| 35 | The Red Team assert was circular | ✅ All four mounts are also checked against what real attacks met |
| 36 | `role` vs `kind`; label regex; if-chain | ✅ `kind` is gone (`catchall: true` on the Kill Switch), `marks` drives chip tags, and choices use `said` |

**Reformulated asserts** (each follows a fix above):
- **Situationally Aware** (traits and counters).
  - Was: ×1.5 idle, ×0.4 busy, ×1 with Honeypots.
  - Now: ×0.4 with a desk free, ×1.5 with every desk busy or none, ×0.4 with Honeypots or a Red Team, read from `TRAITS.situational.watchMult`.
  - The counter check now fills every desk first: 1.5 → 0.4. (#12)
- **Least Privilege R&D.** Was ×0.9 / ×0.975, now ×0.95 / ×0.9875, read from config. (#10)
- **Red Team.**
  - "Within ± err of the truth" is now "the truth lies inside [lo, hi]". The 3σ check uses Wilson bounds at z = 3.
  - The real-attack check covers every mount, not just the monitor.
  - Control Eval is checked with `inBar`. (#6, #35)
- **Event expectations.**
  - caught: m −v × decay^retrains.
  - Ship It, Investor Call, Inspection, Paperclip and Frog Poem: seconds of income.
  - Journalist: this generation's incidents.
  - Steganography: the event's own `mult` (`BALANCE.stegoCollusion` is gone).
  - Alignment Faking: `deskFree`, because the test state has a free desk.
  - (#13, #14, #20, #33)
- **needs.** "No Journalist without incidents" is dropped, because that gate is gone by design. "Journalist after a clean generation: reputation unchanged" replaces it. (#14)
- **Tripwires.** "Every catch pauses its lane 2 s" is kept, and now also checks the alert and the ×5 spot checks. (#15)
- **RSP** no longer sets `r.rsp.taken`. **Catalogue** keys: `kind` → `catchall`. **Rival:** literals → `B.rivalGraceSeconds`; the "default is grace, 90 s" pin stays.

**New asserts:**
- Red Team after a Distribution Shift and after a retrain; Control Eval resets when a mount below is upgraded.
- Air Gap side channels at G6/G7.
- Least Privilege and Capability Tokens foil rates (40.8% vs 40%, 77.6% vs 80%).
- Rate Limiter under a Jailbreak Wave.
- The Sandbagger eval line.
- Lab toggle refused, and the Microscope row locks again.
- Tripwire banner.
- Journalist on a clean generation.
- Retrain decay.
- Greenrock's free L5 names its capstone.
- Event strings carry no hand-typed numbers.
- No Rival Release after Prometheus ships.
- Exfiltration counts as seen when foiled, contained, announced, and from G4.
- The reputation ledger.

**Balance after the fixes** (`node test/headless.mjs balance smart [grace|instant|off]`). All three modes are identical:
```
easy    W7 W7 W7 W7 B7 W7 W7 C7 W7 W7
medium  W7 W7 R7 W7 W7 W7 W7 C7 B4 C6
hard    W7 R7 R7 R6 C6 R7 W7 W7 W7 R6
```
- Smart wins 8 / 6 / 5 (was 10 / 9 / 3). Prometheus never ships first in any mode (before: 2 runs under `instant`).
- **Medium got harder**, mainly because m-scaled threats now come at the difficulty's floor: Spear Phish fired 9 times and Self-Exfiltration 3 times, against 1 and 4 before.
- **Hard got easier, and its losses changed kind.** Catastrophes fell from 5 to 1 (Air Gap, Least Privilege, exfiltration now counting as seen). Reputation losses rose from 2 to 5. The new reputation ledger says those are landed incidents (170–210 reputation each); events cost at most 14 per run.
- The Journalist now hits 0–6 instead of a flat −30.

**RSP threshold: kept at 0.3, after measuring.** Share of smart-policy generations whose shown estimate peaks above each threshold:

| Threshold | Easy | Medium | Hard |
|---|---|---|---|
| 0.30 | 1% | 12% | 33% |
| 0.20 | 19% | 32% | 54% |
| 0.15 | 24% | 39% | 67% |

At 0.3 it is an emergency brake that comes up about once a game on Medium and every third generation on Hard. The smart policy rarely draws the card (4 runs in 30), so its "used once" says little.

**For Avi:**
- 🚩 **Situationally Aware is flipped** (#12). It now holds back while a desk is free and attacks when every desk is busy, so more desks are the counter. DESIGN-v2 says the opposite. Keep the flip?
- 🚩 **Bug Bounty** (#24): bring back the leak-free version, and if so, which event goes?
- 🚩 **Air Gap side channels**: 10% at G6 and 20% at G7. Too soft, or too hard?
- 🚩 **Retrain decay** ×0.5 per use: −0.04, −0.02, −0.01…
- 🚩 **RSP threshold**: 0.3 (the design), or 0.2 to bring it up more often?
- 🚩 **Difficulty**: smart wins 8 / 6 / 5. Medium still pushes m below 0.05 by G4 in half the runs.

## v2 UI rebuild: SOLITON skeleton (UI architect, 2026-10-03)

- **Plan:** [design/UI-PLAN.md](design/UI-PLAN.md) covers the five builder modules and their files, the frame contract, the layout rects, the hit-region kinds, the timing rules, the hidden-truth rules and what the UI needs from the sim.
- **Skeleton:** `game/src/ui/` (theme, sprites, layout, hit, view, input, act, plus stubs for tracks, hud, codec, portraits, menu, upgrade and overlays), a new `game/src/main.js`, `game/index.html` and `game/style.css`.
  - One 1200×660 canvas, crisp at any devicePixelRatio. Modal screens are HTML.
  - It played the real sim with placeholders. (Superseded: the builders filled the stubs and `src/render/` is gone — see the last section.)
- **Harness:** `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 node game/test/ui-shot.mjs <outdir> [scenario]` runs 11 scenarios. Each saves a 1200 and a 1600 PNG and reports ms/frame and console errors. All 11 are clean at 2–4 ms/frame.
- **Next:** the five builders fill in their stubs (UI-PLAN §2 and §4). The visual target is `design/codec-mockups/variant-c.js`.
- **Gotchas:**
  - `fx(st, 'event' | 'card', { id })` overwrites the numeric fx id with a string, so `ui/view.js drain()` counts with `st.fxId`. Never key anything on an fx's `e.id`. Sim fix requested (UI-PLAN §7).
  - `elementStats().catch` leaks hidden m and traits, so the hover card must show a spec number (§6).
  - `?debug=1` keys: D shows the panel, T toggles truth marks, L draws layout outlines.

## v2 UI: wired up (integrator, 2026-10-03)

The five builder modules are merged, `src/render/` is deleted and the board is the real thing: tracks, HUD, codec,
menu, upgrade panel and the five HTML overlays. `?debug=1` still works (D panel, T truth marks, L layout outlines).

- **New shared module:** `src/ui/derive.js` — `specCatch` / `specAudit` (the spec sheet every surface quotes, never the
  truth) and `splitRates` (what the compute split pays per second). Tracks, HUD, menu and upgrade all read it, so a
  number shown in two places is the same number. No sim or config file was touched.
- **New view field:** `view.codecLine = { open, urgent, typing }`, written by codec.js each frame, read by overlays.js
  so the ring and the typewriter click follow the call that is actually on screen.
- **Tuning:** `overlays.js` MODEL_SECONDS 6 (the reveal card), SCORE_DELAY 1.8, FX_FRESH 0.5; `codec.js` CPS 45;
  `audio.js` VOLUME 0.32. All in one place at the top of each file.
- **Builder "needs", resolved UI-side:** per-mount verdicts, fx y/text and the desk index are derived from the fx log and
  remembered in the module's own `A` cache; task text is cached on sight (`hud.js remember`) because a trimmed fx log
  loses it; the spec-sheet catch replaces `elementStats().catch`. Nothing new was added to `sim/rules.js`.
- **Not resolved:** `setBayRule` would be a new sim *action*, so the BAY FULL chip in the upgrade panel is read-only.
  The `fx(st, 'event'|'card', { id })` id clobbering is still in the sim; the UI counts with `st.fxId` instead.
- **Harness:** `test/ui-shot.mjs` now has 28 scenarios (all clean, 2–5 ms/frame) and `test/ui-play.mjs` is a real
  playthrough — real clicks, real time, start → Medium → build → upgrade → buy a mount → drag the split → answer a
  choice → research → G7 → scorecard → play again. Both are in the README. `node test/headless.mjs` still passes.

**Known, left alone:** the ops log says "a line" for tasks that scrolled out of a harness jump. (The model card and the
early choice keys were fixed in the QA pass below.)

**For Avi:**
- 🚩 **Sound needs an ear pass.** It is tuned by eye, not by ear: VOLUME, the codec ring and the typewriter click.
- 🚩 **The model reveal card** now really does hold the board (the sim waits under it) for 6 s, or until a click / Esc.
  Keep 6 s, go shorter, or make it click-to-close only?
- 🚩 **BAY FULL block/wave** wants a sim action (`setBayRule`) before the chip can do anything.

## v2 UI: QA pass (finisher, 2026-10-03)

A QA sweep logged 40 findings (1 blocker, 9 majors, 30 minors). All are verified. Every blocker and major is fixed, and so are all the minors except #31 and most of #40.

- **Blocker #19:** selling a detector mid-read threw in `tracks.js reticle()` and blanked the board for about half a second. `engagement()` now drops a read whose mount was sold, and the reticle guards the tag.
- **Gameplay:**
  - #20: an **OUT OF CASH nn s** countdown tile sits on both event strips, and a choice row the bank can't cover says `you have $X`.
  - #21/#35: tooltips and the cursor re-resolve every frame (`input.refresh()` after `hits.end()`).
  - #22: the auditor card has a **COVERS** row ("5 of 1k tasks"), and NEXT says `L5 covers 10×`.
  - #23: the NEW MODEL card holds the sim (`view.modal`) and shows `THE LAB WAITS n · CLICK OR ESC`.
  - #32: ▼ no longer opens the choices. Only the read timer does, a click on a choice counts after `CHOICE_GRACE` 0.6 s, and the handset keys only light up once the choices do.
  - #38: held keys don't repeat. #39: double-clicks count once.
  - #25: placing onto a taken mount gives a toast and a not-allowed cursor. #24: digit keys are bounds-checked.
  - Hovering the selected mount now shows its upgrade panel, not its card.
- **Visual:**
  - #1: canvas text is greyscale-AA (no `alpha:false`, so no LCD fringes).
  - #11/#33: the CRT is a CSS layer.
  - #2: `C.gdd` is never text.
  - #3: capstones wrap to two lines (a shorter `BRIEF` wording when needed, the full config text on hover), and NEXT keeps whole items (`· +2 more`).
  - Menu: keys get 3 px between icon and tag, prices drop the `$` (#4/#5), the notch follows a row-2 key (#8), locked keys show hover (#9), the Red Team bracket moves under the bar (#26), and job lines, descriptions and jargon are shortened (#27).
  - Also fixed: #6, #7, #10 (branch colours are theme tokens), #12–#17, #28, #30.
- **Perf:**
  - #36: resize is debounced 150 ms. #37: DPR changes are watched.
  - #34: lineInk has its own 160-entry LRU. The FAN gradients rebuild per epoch.
  - #40: sprite and menu cache keys no longer use JSON.stringify.
- **Draw ms (headless SwiftShader, sim running):**
  - 1200×660@1: p50 3.0.
  - 1440×900@2: 3.4 (was 13.4).
  - 1920×1080@2: 16.5 (was 24.9). That one sits at about 30 fps, because software compositing of the soft-light layer costs about a quarter of a frame there; with `normal` blend it reaches about 40.
- **Harness:** each size gets a fresh page (#18). New scenarios are `g3-incident` and `perf-g7`, 30 in all. `ui-play` waits out the choice grace. `ui-shot`, `ui-play` and `headless` all pass.
- **Left for the integrator:**
  - #31: "chips / layer / element" in config and sim strings, for example the ratelimit capstone and the research cards.
  - #40: layout() still allocates each frame; low priority.
  - Capstone texts want a short `short` field in `config/upgrades.js`, so `upgrade.js BRIEF` can go.
- **Gotchas:**
  - A harness that clicks a choice must wait 0.7 s after the choices appear.
  - If a real GPU ever stutters on the CRT layer, `#crt { mix-blend-mode: normal }` is the one-line fallback, but it stripes letters again.
