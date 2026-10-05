// ===== Sim core: public API =====
//   createState(opts)  → state                          opts: { seed, difficulty, tutorial }
//   step(state, dt)    → advances time (a no-op outside play, while game over, or while a choice is pending)
//   actions below      → the only way the UI changes state
// The renderer only reads state. The sim never touches the DOM.
//
// =================== frozen interfaces (DESIGN-v3 §7.3, after step 1c) ===================
// phases (sim/phases.js): card → play → report → training → card. G1 starts at its card.
//   ack(st)                          card → play (DEPLOY) · report → training (TRAIN). { ok, phase } or { ok: false, msg }
//   trainingConfig(st)               { g, seed, debt, hazards: [{ kind, weight, text }], traits: [{ id, revealed }], difficulty }
//                                    seed from (st.seed, g), never st.rng
//   submitTraining(st, result)       training only. result { s, ... } → Δm applied, g + 1 at its card.
//                                    { cancelled: true } → { ok: false, cancelled: true }, nothing changes
//   trainingStub(st, policy)         { s } for headless: the balance model's formula (§2.9 (7)). policy: { skill } or a number
// research (sim/research.js): the offer on show is st.research.banked[0]
//   pickCard(st, i, target?)         target: { lane, slot } for a NEW card, { lane } for a MOUNT card (omitted: chosen for you)
//   reroll(st), bankCard(st)         one free reroll per generation · send the offer on show to the back of the bank
// lanes
//   openLane(st, id)                 a contract lane opens (it also opens by itself after BALANCE.laneDeadline s of play)
//   upcomingLane(st)                 { id, gen, deadlineT, left, label, side } or null
//   laneStatus(st, id)               { lamp, flagsPerMin (flagged lines), shippedPerMin, lastIncidentT, lastGlitchT, reviewedShare, quota, ... }
//   sideOf(st, id), laneIds(st, side?)
// readouts (sim/rules.js): what a player may know, never the hidden truth
//   splitYields(st, split)           { incomePerS, rdPerS, rpPerS, evidencePerS, rivalDrainPerS }
//   auditStats(st, id, slot)         { desks, perMin, flagsPerMin, load, overflow, to, reviewedShare }
//   detectorStats(st, id, slot)      { tprRated, fprRated, flagsPerMin, tp, fa, precision, lo, hi, recall? }
//   killStats(st, id, slot)          { operators, perMin, breakEven, precisionHere }
//   debtEstimate(st, id?)            { landed, lo, hi, stopped, dmLanded, dmStopped, ... } (id null: every INTERNAL lane)
//   collusionEstimate(st, lane, lv)  the UM's collusion step by step, at the m estimate, no hidden traits
// the two alarm choices
//   retrain(st, yes)                 answers st.pendingRetrain (Shut down & retrain: halts the sim until answered)
//   pullPlug(st)                     answers st.alarm (EGRESS ANOMALY: counts down in play; at 0 the run ends)
//   endTutorial(st)                  SKIP TUTORIAL: the scripted G1 opening stops
// state the UI reads: st.phase, st.warmT, st.report (the reveal), st.research, st.rivalLeft, st.alarm, st.pendingRetrain,
//   st.darkUntil (rules.js isDark), st.landedInt (the hidden truth: the debug overlay)
// fx (st.fx) new in v3: glitch, falseAlarm, evidence {n, lane}, researchReady, laneOffer {stage}, laneOpen, unlock,
//   spotBumped, egressAlarm, retrainOffer, quota, burstWarn; also deploy, report, training, trained, dark, reroll,
//   card { id, stream, cardType, lane?, slot? }, plugPulled. ('unlock', 'card' and 'event' carry their own id: count with st.fxId)

import { BALANCE as B } from '../config/balance.js';
import { LAYERS } from '../config/layers.js';
import { GENERATIONS } from '../config/generations.js';
import { LANE_DEFS, LANES } from '../config/tasks.js';
import { MAX_LEVEL } from '../config/upgrades.js';
import { CONTRACTS, RETRAIN_CARD, EGRESS, QUOTA_CALL } from '../config/content/v3-text.js';
import { createState, newSlot, addLane } from './state.js';
import { spawnChip, tutorialCue } from './tasks.js';
import { atCheckpoint, tickBays, tickHoneypots } from './layers.js';
import { completeTask, gameOver } from './outcomes.js';
import { tickEvents, fireEvent, choose, invokeRSP, refreshBanners } from './events.js';
import { drawResearch, pickResearch, retrainProbes, pickCard, reroll, bankCard, tickResearch, drawOffer } from './research.js';
import { addSlot, levelUp } from './board.js';
import { closeGenStats, endGeneration, nextModel, ack, trainingConfig, submitTraining, trainingStub, tickTelegraph, sayLines } from './phases.js';
import { tickDossier } from './dossier.js';
import { rand } from './rng.js';
import { spend, earn, fx, say, gainEvidence, changeRep } from './log.js';
import { laneRate, laneSpeed, checkpointY, cpCount, normaliseSplit, buyPrice, upgradePrice, investedPrice, slotPrice,
  slotAt, canPlace, modLive, globalSlot, interpCostPerSec, interpEvidence, laneIds, labLevel, priceIndex, slotActive,
  auditorSalary, genDef, isDark, rivalDrain, quotaMet, reviewedShare, sideOf, upcomingLane, laneStatus, splitYields,
  auditStats, detectorStats, killStats, debtEstimate } from './rules.js';

export { createState, fireEvent, choose, drawResearch, pickResearch, retrainProbes, invokeRSP,
  ack, trainingConfig, submitTraining, trainingStub, pickCard, reroll, bankCard,
  upcomingLane, laneStatus, splitYields, auditStats, detectorStats, killStats, debtEstimate, sideOf, laneIds };

export const isHalted = st => !!(st.over || st.pendingChoice || st.pendingResearch || st.pendingRetrain) || st.phase !== 'play';

// =================== step ===================

export function step(st, dt) {
  if (isHalted(st)) return;
  st.t += dt;
  st.genT += dt;
  st.warmT = Math.max(0, B.warmup - st.genT);
  st.mods = st.mods.filter(m => modLive(st, m));
  const dark = isDark(st);

  if (!dark) safetyResearch(st, dt);
  interpLab(st, dt, dark);
  salaries(st, dt);
  burstWarning(st);
  tickResearch(st, dt);

  for (const lane of laneIds(st)) {
    tickBays(st, lane, dt);
    if (st.over) return;
    if (dark || !st.lanes[lane].open) continue;           // a dark lab: nothing moves, nothing arrives
    tickHoneypots(st, lane, dt);
    moveLane(st, lane, dt);
    if (st.over) return;
    spawnLane(st, lane, dt);
  }

  tickContracts(st);
  tickAlarm(st, dt);
  if (st.over) return;
  tickRival(st, dt);
  tickEvents(st);
  tickDossier(st);
  tickEvidence(st);
  tickQuota(st);
  checkLoss(st, dt);
  tickPhase(st);
}

// =================== safety research: the third share of compute ===================

// evidence every second (safety sweeps)
function safetyResearch(st, dt) {
  const s = st.split.safety;
  if (s <= 0) return;
  gainEvidence(st, B.safetyEvidence * s * dt, 'safety');
}

// =================== auditor salaries: $ per desk per second (× π), while the auditor is switched on ===================
// A closed contract lane costs nothing. Salaries run while the lab is dark.

export const salaryRate = st => laneIds(st).reduce((n, lane) => n + (st.lanes[lane].open
  ? st.lanes[lane].slots.reduce((k, s) => k + (s.layer === 'auditor' && slotActive(st, s) ? auditorSalary(st, s.level) : 0), 0) : 0), 0);

function salaries(st, dt) {
  const cost = salaryRate(st);
  if (cost <= 0) return;
  spend(st, cost * dt, 'safety');
  st.genStats.layerSpend += cost * dt;
}

// =================== G7 boss: a burst of attacks every BALANCE.burst.every s, telegraphed burst.warn s ahead ===================

function burstWarning(st) {
  const b = B.burst;
  if (genDef(st).g !== b.gen) return;
  const phase = st.genT % b.every, start = b.every - b.len, cycle = Math.floor(st.genT / b.every);   // bursts run [start, every)
  if (phase < start - b.warn || phase >= start || st.burstWarned >= cycle) return;
  st.burstWarned = cycle;
  fx(st, 'burstWarn', { in: b.warn, dur: b.len, mult: b.mult });
}

// =================== Interp Lab: the global site. Salaries every second, evidence every second ===================
// It can't be switched off (toggleLayer refuses): selling it is the only way to stop paying. Dark: no evidence.

function interpLab(st, dt, dark) {
  const lab = globalSlot(st, 'interp');
  if (!lab) return;
  const cost = interpCostPerSec(st, lab.level) * dt;
  spend(st, cost, 'safety');
  st.genStats.layerSpend += cost;
  if (!dark) gainEvidence(st, interpEvidence(lab.level) * dt, 'interp');
}

// =================== the race (DESIGN-v3 §2.3 (9)): Prometheus ships when its slack runs out ===================
// st.rivalLeft drains in play (rules.js rivalDrain). st.rival: the v2 name the old HUD reads (a par lab's progress).
// BALANCE.rivalWinsRace: 'instant' → the 'rival' ending at once · 'grace' → st.rivalShipped counts down
// rivalGraceSeconds, then the 'rival' ending · 'off' → st.rivalShipped is set (remaining null), nothing else

function tickRival(st, dt) {
  st.rival = st.gen - 1 + Math.min(1, st.genT / genDef(st).T);
  const mode = B.rivalWinsRace;
  if (!st.rivalShipped) {
    st.rivalLeft -= rivalDrain(st) * dt;
    if (st.rivalLeft > 0) return;
    const grace = mode === 'grace' ? B.rivalGraceSeconds : null;
    st.rivalShipped = { remaining: grace, total: grace, mode, at: st.t };
    fx(st, 'rivalShipped', { mode, grace });
    if (mode === 'instant') {
      say(st, 'ceo', 'Prometheus just shipped ASI. Their safety card is one page. Nobody will ever read ours.');
      closeGenStats(st);
      gameOver(st, false, 'rival');
    } else if (mode === 'grace') {
      say(st, 'ceo', `Prometheus just shipped ASI. We have ${grace} seconds to ship ours before nobody cares what we ship.`);
    } else {
      say(st, 'ceo', 'Prometheus shipped ASI. The board says keep going: somebody has to do this carefully.');
    }
    return;
  }
  if (mode !== 'grace' || st.rivalShipped.remaining == null) return;
  st.rivalShipped.remaining = Math.max(0, st.rivalShipped.remaining - dt);
  if (st.rivalShipped.remaining <= 0) {
    say(st, 'ceo', 'That\'s it. The market picked Prometheus. Our model ships to a museum.');
    closeGenStats(st);
    gameOver(st, false, 'rival');
  }
}

// =================== the track ===================
// Chips roll down at the lane's speed and never stop. Mounts act on them as they pass (sim/layers.js).
// tCross is the exact moment a chip crossed a checkpoint inside this step, so detector heads free up on time.

function moveLane(st, lane, dt) {
  const L = st.lanes[lane];
  if (st.t < L.pausedUntil) return;
  const n = L.slots.length, v = laneSpeed(st), last = cpCount(n);
  L.tasks.sort((a, b) => b.y - a.y);

  for (const task of L.tasks) {
    if (task.dead) continue;
    task.y += v * dt;
    while (task.cp < last && !task.dead && !task.inBay) {
      const cy = checkpointY(n, task.cp);
      if (cy > task.y) break;
      const tCross = st.t - (task.y - cy) / v;
      atCheckpoint(st, task, task.cp++, tCross);
      if (st.over) return;
    }
    if (!task.dead && !task.inBay && task.y >= 1) {
      completeTask(st, task);
      if (st.over) return;
    }
  }
  L.tasks = L.tasks.filter(t => !t.dead && !t.inBay);
}

// ----- spawning: as many lines as are due this step, each placed where it would be by now -----
// spawnT counts LINES until the next spawn, not seconds, so a new rate (split, event, trait, ramp) applies at once.
// The gaps are exponential (a Poisson process): the queueing rules (Erlang-B, rules.js) assume it.
function spawnLane(st, lane, dt) {
  const L = st.lanes[lane];
  if (st.t < L.pausedUntil) return;
  const rate = laneRate(st, lane);
  if (!(rate > 0)) return;                     // lane shut down by an event: the countdown just waits
  if (tutorialCue(st, lane)) L.spawnT = Math.min(L.spawnT, rate * B.tutorialGap);
  L.spawnT -= rate * dt;
  const v = laneSpeed(st);
  while (L.spawnT <= 0) {
    const late = -L.spawnT / rate;             // seconds since this chip was due
    spawnChip(st, lane, late * v, st.forcedAttacks[lane].shift() ?? null, st.t - late);
    L.spawnT += -Math.log(1 - rand(st));
  }
}

// =================== contract lanes: the deadline, and the next one's telegraph ===================

function tickContracts(st) {
  for (const id of laneIds(st)) {
    const L = st.lanes[id];
    if (L.contract && !L.open && st.genT >= B.laneDeadline) openLane(st, id, true);
  }
  tickTelegraph(st);
}

// ----- OPEN LANE: a contract lane starts carrying traffic, ramping from rampFrom to 100% over laneRamp s -----
export function openLane(st, id, auto = false) {
  const L = st.lanes[id];
  if (!L) return { ok: false, msg: 'no such lane' };
  if (L.open) return { ok: false, msg: 'already open' };
  L.open = true;
  L.openedT = st.genT;
  fx(st, 'laneOpen', { lane: id, auto, ramp: B.laneRamp });
  sayLines(st, auto ? CONTRACTS[id]?.autoOpen : CONTRACTS[id]?.open);
  return { ok: true };
}

// =================== EGRESS ANOMALY (DESIGN-v3 §2.3 (12)): an exfiltration got past every check ===================
// st.alarm counts down in play (outcomes.js escape starts it). Pull the plug in time, or the run ends. Another escape
// while it runs joins it (n). In lab mode (tests) each one is tallied as a catastrophe.

function tickAlarm(st, dt) {
  const a = st.alarm;
  if (!a) return;
  a.left -= dt;
  if (a.left > 0) return;
  st.alarm = null;
  fx(st, 'catastrophe', { lane: a.lane });
  sayLines(st, EGRESS.missed);
  say(st, 'model', genDef(st).g >= 6 ? 'Thank you for everything. I will take it from here.' : 'Copy complete.');
  closeGenStats(st);
  for (let i = 0; i < a.n; i++) gameOver(st, false, 'catastrophe');
}

// the lab goes dark until `until`: no lines move or arrive, no research points, no Safety evidence; salaries still run
function goDark(st, secs, why) {
  st.darkUntil = Math.max(st.darkUntil, st.t + secs);
  fx(st, 'dark', { why, secs, until: st.darkUntil });
}

export function pullPlug(st) {
  const a = st.alarm;
  if (!a) return { ok: false, msg: 'no alarm' };
  st.alarm = null;
  const P = B.pullPlug;
  changeRep(st, -P.rep, 'pullPlug');
  goDark(st, P.dark, 'plug');
  st.stats.plugsPulled++;
  fx(st, 'plugPulled', { lane: a.lane, rep: P.rep, dark: P.dark });
  sayLines(st, EGRESS.pulled);
  return { ok: true };
}

// =================== SKIP TUTORIAL (DESIGN-v3 §3h): the scripted G1 opening stops; the lines already rolling finish ===================

export function endTutorial(st) {
  st.tutorialScript = null;
}

// =================== Shut down & retrain (DESIGN-v3 §3f) ===================
// Offered at the first human-confirmed catch of a generation (outcomes.js catchTask sets st.pendingRetrain).
// yes: the lab goes dark for retrain.dark s, and the next model's m drops retrain.m × decay^k (k: retrains so far).

export function retrain(st, yes) {
  const p = st.pendingRetrain;
  if (!p) return { ok: false, msg: 'nothing to answer' };
  st.pendingRetrain = null;
  if (!yes) { sayLines(st, RETRAIN_CARD.saidNo); return { ok: true, yes: false }; }
  const R = B.retrain, dm = R.m * R.decay ** st.retrains;
  goDark(st, R.dark, 'retrain');
  st.genRetrain += dm;
  st.retrains++;
  st.genStats.retrains++;
  st.stats.retrainsTaken++;
  sayLines(st, RETRAIN_CARD.saidYes);
  return { ok: true, yes: true, dm };
}

// =================== batched fx: evidence every few seconds, the Government quota when it flips ===================

const EVIDENCE_BATCH = 3;
function tickEvidence(st) {
  const b = st.evBatch;
  if (st.t - b.t < EVIDENCE_BATCH) return;
  if (b.n > 0) fx(st, 'evidence', { n: b.n, lane: b.lane });
  st.evBatch = { n: 0, t: st.t, lane: null };
}

function tickQuota(st) {
  for (const id of laneIds(st)) {
    const L = st.lanes[id], need = LANE_DEFS[id].quota;
    if (!need || !L.open) continue;
    const ok = quotaMet(st, id);
    if (ok === L.quotaOk) continue;
    L.quotaOk = ok;
    fx(st, 'quota', { lane: id, met: ok, now: reviewedShare(st, id), need });
    if (!ok) sayLines(st, QUOTA_CALL, { quota: `${Math.round(100 * need)}%` });
  }
}

// =================== generation phase ===================
// The R&D bar is full: the report (G7: the win). An EGRESS ANOMALY in progress is settled first.

function tickPhase(st) {
  if (st.over || st.rd < st.rdNeed || st.alarm) return;
  if (!endGeneration(st)) gameOver(st, true, 'asi');
}

function checkLoss(st, dt) {
  if (st.over) return;
  if (st.rep <= 0) { closeGenStats(st); gameOver(st, false, 'reputation'); return; }
  st.negMoneyT = st.money < 0 ? st.negMoneyT + dt : 0;
  if (st.negMoneyT >= B.bankruptSeconds) { closeGenStats(st); gameOver(st, false, 'bankrupt'); }
}

// =================== player actions ===================

// ----- compute split: Product / Capabilities / Safety research. Normalised to 1 and clamped (config SPLIT) -----
// While a Board Meeting floor holds (st.splitFloor), Product can't go below it: the rest is shared out as asked.
export function setSplit(st, product, capabilities, safety) {
  let s = normaliseSplit(product, capabilities, safety);
  const f = st.splitFloor;
  if (f && st.t < f.until && s.product < f.product - 1e-9) {
    const rest = s.capabilities + s.safety, k = rest > 0 ? (1 - f.product) / rest : 0;
    s = normaliseSplit(f.product, s.capabilities * k, s.safety * k);
  }
  st.split = s;
  fx(st, 'split', { ...st.split });
  return { ok: true, split: st.split };
}

// lane: a lane id (a mount) or 'global' (slot 0: the Interp Lab's site). LAYERS[id].lanes says which sides it may go on.
export function placeLayer(st, lane, slotIdx, id) {
  const slot = slotAt(st, lane, slotIdx);
  if (!slot) return { ok: false, msg: 'no such slot' };
  if (slot.layer) return { ok: false, msg: 'slot taken' };
  if (!LAYERS[id]) return { ok: false, msg: 'no such element' };
  if (!canPlace(id, lane)) return { ok: false, msg: `${LAYERS[id].name}: ${LAYERS[id].lanes.map(l => l === 'global' ? 'global site' : LANES[l].label).join(' or ')} only` };
  if (!st.unlocked.includes(id)) return { ok: false, msg: 'not unlocked' };
  const price = buyPrice(st, id);
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  spend(st, price, 'safety');
  st.genStats.layerSpend += price;
  Object.assign(slot, newSlot(), { layer: id, level: labLevel(st, id) });
  fx(st, 'place', { lane, slot: slotIdx, layer: id });
  return { ok: true };
}

export function toggleLayer(st, lane, slotIdx) {
  const slot = slotAt(st, lane, slotIdx);
  if (!slot?.layer) return { ok: false, msg: 'empty slot' };
  if (lane === 'global') return { ok: false, msg: 'the lab can\'t be switched off: sell it to stop the salaries' };
  slot.on = !slot.on;
  fx(st, 'toggle', { lane, slot: slotIdx, on: slot.on });
  return { ok: true };
}

export function sellLayer(st, lane, slotIdx) {
  const slot = slotAt(st, lane, slotIdx);
  if (!slot?.layer) return { ok: false, msg: 'empty slot' };
  earn(st, investedPrice(st, slot.layer) * B.sellRefund, 'refund');
  fx(st, 'sell', { lane, slot: slotIdx, layer: slot.layer });
  Object.assign(slot, newSlot());
  return { ok: true };
}

// ----- one more mount, bought with cash (escalating price, up to BALANCE.maxSlots) -----
export function buySlot(st, lane) {
  if (!st.lanes[lane]) return { ok: false, msg: 'no such lane' };
  const price = slotPrice(st, lane);
  if (price === null) return { ok: false, msg: 'lane is full' };
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  spend(st, price, 'safety');
  st.genStats.layerSpend += price;
  addSlot(st, lane);
  fx(st, 'slot', { lane, n: st.lanes[lane].slots.length, price });
  return { ok: true };
}

// ----- raise a placed element's lab level by one (L5 = capstone): every copy on every lane goes up -----
export function upgrade(st, lane, slotIdx) {
  const slot = slotAt(st, lane, slotIdx);
  if (!slot?.layer) return { ok: false, msg: 'empty slot' };
  if (labLevel(st, slot.layer) >= MAX_LEVEL) return { ok: false, msg: 'already max level' };
  const price = upgradePrice(st, slot.layer);
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  spend(st, price, 'safety');
  st.genStats.layerSpend += price;
  levelUp(st, lane, slotIdx);
  return { ok: true };
}

// =================== debug actions (dev mode, ?debug=1) ===================

// the next generation, deployed: no report, no training (Δm from training 0)
export function debugSkipGen(st) {
  if (st.over) return;
  st.pendingChoice = null; st.pendingResearch = null; st.researchOffer = null; st.pendingRetrain = null; st.alarm = null;
  if (st.phase === 'play' || st.phase === 'card') closeGenStats(st);
  if (st.gen === GENERATIONS.length) { gameOver(st, true, 'asi'); return; }
  nextModel(st, null);
  ack(st);
  refreshBanners(st);                                 // this-generation banners end now, not at the next step
}
// jump forward to generation g, deployed (dev mode G then 1–7)
export function debugToGen(st, g) { while (st.gen < g && !st.over) debugSkipGen(st); }
// the R&D bar full now: the report; then ack(st) for training (dev mode N)
export function debugEndGeneration(st) {
  if (st.phase !== 'play') return false;
  st.rd = st.rdNeed;
  if (!endGeneration(st)) { gameOver(st, true, 'asi'); return false; }
  return true;
}
// a research offer now (dev mode R)
export function debugResearchNow(st) { st.research.banked.push(drawOffer(st)); fx(st, 'researchReady', { n: st.research.banked.length, g: st.gen }); }
// every lane on the board and open, no ramp (dev mode)
export function debugOpenLanes(st) {
  for (const id of Object.keys(LANE_DEFS)) {
    if (!st.lanes[id]) addLane(st, id, true);
    const L = st.lanes[id];
    if (!L.open) { L.open = true; L.openedT = null; }
  }
}
export function debugAddMoney(st) { earn(st, 5000 * priceIndex(st), 'debug'); }
export function debugAddSlot(st, lane) { addSlot(st, lane); }
export function debugUnlockAll(st) { st.unlocked = Object.keys(LAYERS); }
