// ===== Sim core: public API =====
//   createState(opts)  → state
//   step(state, dt)    → advances time (no-op while game over or a choice is pending)
//   actions below      → the only way the UI changes state
// The renderer only reads state.

import { BALANCE as B } from '../config/balance.js';
import { LAYERS } from '../config/layers.js';
import { GENERATIONS } from '../config/generations.js';
import { createState } from './state.js';
import { makeTask } from './tasks.js';
import { enterLayer, finishLayer } from './layers.js';
import { completeTask, timeoutTask, gameOver } from './outcomes.js';
import { tickEvents, fireEvent, choose } from './events.js';
import { drawResearch, pickResearch, retrainProbes, addSlot } from './research.js';
import { startGeneration, closeGenStats } from './phases.js';
import { uniform } from './rng.js';
import { spend, earn, fx } from './log.js';
import { genDef, mod, slotActive, tierY, buyPrice } from './rules.js';

export { createState, fireEvent, choose, drawResearch, pickResearch, retrainProbes };

export const isHalted = st => !!(st.over || st.pendingChoice || st.pendingResearch);

// =================== step ===================

export function step(st, dt) {
  if (isHalted(st)) return;
  st.t += dt;
  st.mods = st.mods.filter(m => st.t < m.until);

  st.rival += dt / B.rivalSecondsPerGen;
  st.rep = Math.min(B.repMax, st.rep + B.repRegen * dt);

  for (const lane of ['ext', 'int']) {
    spawnLane(st, lane, dt);
    moveLane(st, lane, dt);
    if (st.over) return;
  }

  tickPhase(st, dt);
  tickEvents(st);
  checkLoss(st, dt);
}

// =================== spawning ===================

function spawnLane(st, lane, dt) {
  const L = st.lanes[lane];
  if (st.phase !== 'play' || st.t < L.pausedUntil) return;
  L.spawnT -= dt;
  if (L.spawnT > 0) return;

  const rate = genDef(st).rate * mod(st, lane === 'ext' ? 'extSpawn' : 'intSpawn');
  L.spawnT += (1 / rate) * uniform(st, 1 - B.spawnJitter / 2, 1 + B.spawnJitter / 2);

  st.genStats.realTotal += genDef(st).bundle;
  const topBlocked = L.tasks.some(t => t.y < B.chipGap);
  if (topBlocked) { timeoutTask(st, lane); return; }
  L.tasks.push(makeTask(st, lane));
  // (spawn count lives in lane stats)
  st.stats.lanes[lane].spawned = (st.stats.lanes[lane].spawned || 0) + 1;
}

// =================== movement through tiers ===================
// Chips roll down at constant speed, stop at active layers for their latency,
// and can't overlap: a held chip backs up everything above it (visible queue).

function moveLane(st, lane, dt) {
  const L = st.lanes[lane];
  if (st.t < L.pausedUntil) return;
  const n = L.slots.length, speed = 1 / genDef(st).travel;
  L.tasks.sort((a, b) => b.y - a.y);

  let aheadY = Infinity;
  for (const task of L.tasks) {
    if (task.dead) continue;

    // --- held by a layer ---
    if (task.act) {
      task.hold -= dt;
      if (task.hold <= 0) finishLayer(st, task);
      if (st.over) return;
      if (task.act || task.dead) { if (!task.dead) aheadY = task.y; continue; }
    }

    // --- roll forward, stopping at tiers ---
    const target = Math.min(task.y + speed * dt, aheadY - B.chipGap);
    while (task.tierIdx < n && !task.act && !task.dead) {
      const ty = tierY(n, task.tierIdx);
      if (target < ty) break;
      task.y = ty;
      const slotIdx = task.tierIdx++;
      if (slotActive(st, L.slots[slotIdx])) enterLayer(st, task, slotIdx);
      if (st.over) return;
    }
    if (!task.act && !task.dead) task.y = Math.max(task.y, target);

    // --- completion line ---
    if (!task.act && !task.dead && task.y >= 1) {
      completeTask(st, task);
      if (st.over) return;
    }
    if (!task.dead) aheadY = task.y;
  }
  L.tasks = L.tasks.filter(t => !t.dead);
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

export function placeLayer(st, lane, slotIdx, id) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  if (!slot) return { ok: false, msg: 'no such slot' };
  if (slot.layer) return { ok: false, msg: 'slot taken' };
  if (!st.unlocked.includes(id)) return { ok: false, msg: 'not unlocked' };
  const price = buyPrice(st, id);
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  spend(st, price, 'safety');
  st.genStats.layerSpend += price;
  Object.assign(slot, { layer: id, on: true, forcedOffUntil: 0 });
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
  earn(st, buyPrice(st, slot.layer) * B.sellRefund, 'refund');
  fx(st, 'sell', { lane, slot: slotIdx, layer: slot.layer });
  slot.layer = null;
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
