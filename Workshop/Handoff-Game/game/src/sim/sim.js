// ===== Sim core: public API =====
//   createState(opts)  → state
//   step(state, dt)    → advances time (no-op while game over or a choice is pending)
//   actions below      → the only way the UI changes state
// The renderer only reads state.

import { BALANCE as B } from '../config/balance.js';
import { LAYERS } from '../config/layers.js';
import { GENERATIONS } from '../config/generations.js';
import { createState, newSlot } from './state.js';
import { makeTask } from './tasks.js';
import { atCheckpoint, tickBays } from './layers.js';
import { completeTask, gameOver } from './outcomes.js';
import { tickEvents, fireEvent, choose } from './events.js';
import { drawResearch, pickResearch, retrainProbes, addSlot } from './research.js';
import { startGeneration, closeGenStats } from './phases.js';
import { tickDossier } from './dossier.js';
import { uniform } from './rng.js';
import { spend, earn, fx, say, gainEvidence, count } from './log.js';
import { genDef, laneRate, laneSpeed, checkpointY, cpCount, normaliseSplit, buyPrice, upgradePrice, investedPrice, slotPrice, capstone } from './rules.js';
import { MAX_LEVEL } from '../config/upgrades.js';

export { createState, fireEvent, choose, drawResearch, pickResearch, retrainProbes };

export const LANE_IDS = ['ext', 'int'];
export const isHalted = st => !!(st.over || st.pendingChoice || st.pendingResearch);

// =================== step ===================

export function step(st, dt) {
  if (isHalted(st)) return;
  st.t += dt;
  st.mods = st.mods.filter(m => st.t < m.until);

  st.rival += dt / B.rivalSecondsPerGen;
  st.rep = Math.min(B.repMax, st.rep + B.repRegen * dt);
  safetyResearch(st, dt);

  for (const lane of LANE_IDS) {
    tickBays(st, lane, dt);
    if (st.over) return;
    moveLane(st, lane, dt);
    if (st.over) return;
    spawnLane(st, lane, dt);
  }

  tickPhase(st, dt);
  tickEvents(st);
  tickDossier(st);
  checkLoss(st, dt);
}

// =================== safety research: the third share of compute ===================

// evidence every second, and drift pushed down (below 0 too, to safetyDriftFloor: the next model comes out better)
function safetyResearch(st, dt) {
  if (st.phase !== 'play') return;
  const s = st.split.safety;
  if (s <= 0) return;
  gainEvidence(st, B.safetyEvidence * s * dt, 'safety');
  const cleaned = Math.max(0, Math.min(B.safetyDrift * s * dt, st.drift - B.safetyDriftFloor));
  st.drift -= cleaned;
  st.stats.driftCleaned += cleaned;
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

// ----- spawning: as many chips as are due this step, each placed where it would be by now -----
// spawnT counts CHIPS until the next spawn, not seconds, so a new rate (split, event, trait) applies at once
function spawnLane(st, lane, dt) {
  const L = st.lanes[lane];
  if (st.phase !== 'play' || st.t < L.pausedUntil) return;
  const rate = laneRate(st, lane);
  if (!(rate > 0)) return;                     // lane shut down by an event: the countdown just waits
  L.spawnT -= rate * dt;
  const v = laneSpeed(st);
  while (L.spawnT <= 0) {
    const late = -L.spawnT / rate;             // seconds since this chip was due
    const task = makeTask(st, lane, late * v);
    task.born = st.t - late;
    L.tasks.push(task);
    count(st, lane, 'spawned');
    st.genStats.realTotal += task.bundle;
    L.spawnT += uniform(st, 1 - B.spawnJitter / 2, 1 + B.spawnJitter / 2);
  }
}

// =================== generation phase ===================

function tickPhase(st, dt) {
  if (st.phase === 'play' && st.rd >= st.rdNeed) {
    if (st.gen === GENERATIONS.length) { closeGenStats(st); gameOver(st, true, 'asi'); return; }
    st.phase = 'training';
    st.trainT = B.trainingSeconds;
    fx(st, 'training', { g: st.gen + 1 });
  } else if (st.phase === 'training') {
    st.trainT -= dt;
    if (st.trainT <= 0) startGeneration(st, st.gen + 1);
  }
}

function checkLoss(st, dt) {
  if (st.over) return;
  if (st.rep <= 0) { st.rep = 0; closeGenStats(st); gameOver(st, false, 'reputation'); return; }
  st.negMoneyT = st.money < 0 ? st.negMoneyT + dt : 0;
  if (st.negMoneyT >= B.bankruptSeconds) { closeGenStats(st); gameOver(st, false, 'bankrupt'); }
}

// =================== player actions ===================

// ----- compute split: Product / Capabilities / Safety research. Normalised to 1 and clamped (config SPLIT) -----
export function setSplit(st, product, capabilities, safety) {
  st.split = normaliseSplit(product, capabilities, safety);
  fx(st, 'split', { ...st.split });
  return { ok: true, split: st.split };
}

export function placeLayer(st, lane, slotIdx, id) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  if (!slot) return { ok: false, msg: 'no such slot' };
  if (slot.layer) return { ok: false, msg: 'slot taken' };
  if (!st.unlocked.includes(id)) return { ok: false, msg: 'not unlocked' };
  const price = buyPrice(st, id);
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  spend(st, price, 'safety');
  st.genStats.layerSpend += price;
  Object.assign(slot, newSlot(), { layer: id });
  fx(st, 'place', { lane, slot: slotIdx, layer: id });
  return { ok: true };
}

export function toggleLayer(st, lane, slotIdx) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  if (!slot?.layer) return { ok: false, msg: 'empty slot' };
  slot.on = !slot.on;
  fx(st, 'toggle', { lane, slot: slotIdx, on: slot.on });
  return { ok: true };
}

export function sellLayer(st, lane, slotIdx) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  if (!slot?.layer) return { ok: false, msg: 'empty slot' };
  earn(st, investedPrice(st, slot.layer, slot.level) * B.sellRefund, 'refund');
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

// ----- raise a placed element one level (L5 = capstone) -----
export function upgrade(st, lane, slotIdx) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  if (!slot?.layer) return { ok: false, msg: 'empty slot' };
  if (slot.level >= MAX_LEVEL) return { ok: false, msg: 'already max level' };
  const price = upgradePrice(st, slot.layer, slot.level);
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  spend(st, price, 'safety');
  st.genStats.layerSpend += price;
  slot.level++;
  fx(st, 'upgrade', { lane, slot: slotIdx, layer: slot.layer, level: slot.level });
  const cap = capstone(slot.layer, slot.level);
  if (cap.name) say(st, 'research', `${LAYERS[slot.layer].name} capstone: ${cap.name}. ${cap.text}`);
  return { ok: true };
}

// =================== debug actions (?debug=1) ===================

export function debugSkipGen(st) {
  if (st.over) return;
  st.pendingChoice = null; st.pendingResearch = null;
  if (st.gen === GENERATIONS.length) { closeGenStats(st); gameOver(st, true, 'asi'); return; }
  startGeneration(st, st.gen + 1);
}
export function debugAddMoney(st) { earn(st, 5000 * genDef(st).bundle, 'debug'); }
export function debugAddSlot(st, lane) { addSlot(st, lane); }
export function debugUnlockAll(st) { st.unlocked = Object.keys(LAYERS); }
