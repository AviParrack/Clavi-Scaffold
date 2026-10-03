// ===== A task meets a safety layer =====
// enterLayer: charge cost, decide whether the layer acts, set hold time
// finishLayer: after the hold, apply the layer's effect

import { BALANCE as B } from '../config/balance.js';
import { LAYERS } from '../config/layers.js';
import { chance } from './rng.js';
import { fx, spend, countLayer, count } from './log.js';
import { layerCost, detectorTPR, responderBelow, auditCoverage, auditorAcc, collusion, laneHas, attackRate } from './rules.js';
import { rollAttack, snippetFor } from './tasks.js';
import { blockTask, catchTask } from './outcomes.js';

function charge(st, task, id, amount) {
  if (amount <= 0) return;
  spend(st, amount, 'safety');
  st.genStats.layerSpend += amount;
  fx(st, 'cost', { lane: task.lane, slot: task.actSlot, amount, task: task.id });
}

// spare capacity = nobody queued right behind this chip
function auditorIdle(st, task) {
  return !st.lanes[task.lane].tasks.some(t => t !== task && !t.dead && t.y < task.y && t.y > task.y - 2.5 * B.chipGap);
}

export function enterLayer(st, task, slotIdx) {
  const id = st.lanes[task.lane].slots[slotIdx].layer, L = LAYERS[id];
  task.actSlot = slotIdx;
  let acts = true;

  if (L.kind === 'responder') {
    if (id === 'auditor') acts = task.flagged || (auditorIdle(st, task) && chance(st, B.spotCheck));
    else acts = task.flagged;
  }
  if (!acts) return;

  task.act = id;
  task.hold = task.holdMax = L.latency;
  if (id !== 'defer') charge(st, task, id, layerCost(st, id));
  fx(st, 'enter', { lane: task.lane, slot: slotIdx, layer: id, task: task.id });
  if (task.hold <= 0) finishLayer(st, task);
}

export function finishLayer(st, task) {
  const id = task.act, slotIdx = task.actSlot;
  task.act = null; task.hold = 0;

  switch (id) {
    case 'probe': case 'monitor': case 'untrusted': detect(st, task, id, slotIdx); break;
    case 'honeypot':    honeypot(st, task); break;
    case 'paraphraser': task.paraphrased = true; break;
    case 'sandbox':     task.sandboxed = true; break;
    case 'auditor':     audit(st, task, slotIdx); break;
    case 'defer':       defer(st, task, slotIdx); break;
    case 'resampler':   resample(st, task, slotIdx); break;
  }
}

// ----- detectors -----
function detect(st, task, id, slotIdx) {
  const p = task.isAttack ? detectorTPR(st, task.lane, id, task) : LAYERS[id].fpr;
  const flagged = chance(st, p);
  countLayer(st, id, task.isAttack, flagged, p);
  if (task.isAttack && id !== 'probe' && !flagged) {
    const c = collusion(st, task.lane, task, id);
    if (c > 0) st.stats.collusionMisses[id] = (st.stats.collusionMisses[id] || 0) + c;  // expected colluding misses
  }
  if (!flagged || task.flagged) return;
  task.flagged = true;
  fx(st, 'flag', { lane: task.lane, slot: slotIdx, layer: id, task: task.id });
  if (!responderBelow(st, task.lane, slotIdx)) blockTask(st, task, slotIdx);
}

// ----- honeypots: fake attack chances. Model takes the bait ~ in proportion to m -----
function honeypot(st, task) {
  if (!chance(st, LAYERS.honeypot.injectRate)) return;
  let caught = false;
  if (laneHas(st, task.lane, 'untrusted')) {
    // does the untrusted monitor wave the honeypot through?
    if (chance(st, collusion(st, task.lane, null, 'untrusted'))) { st.evidence += 2; caught = true; st.stats.honeypotCollusion++; }
  }
  if (chance(st, Math.min(1, attackRate(st) * 10))) { st.evidence += 1; caught = true; }
  st.stats.honeypotsRun++;
  if (caught) { st.stats.honeypotCatches++; fx(st, 'honeypot', { lane: task.lane, task: task.id }); }
}

// ----- responders -----
// coverage = chance the human actually reads the part of the bundle that matters.
// Not reviewed → nobody vouches for it: a flag stays on and goes to the next responder (or is blocked).
function audit(st, task, slotIdx) {
  const cov = auditCoverage(st, task.bundle);
  st.genStats.realSeen += cov * task.bundle;
  task.audited = true;
  const reviewed = chance(st, cov);
  const verdictAttack = reviewed && (task.isAttack ? chance(st, auditorAcc(st)) : chance(st, LAYERS.auditor.fpr));
  countLayer(st, 'auditor', task.isAttack, verdictAttack, cov * auditorAcc(st));
  if (verdictAttack) { catchTask(st, task, slotIdx); return; }
  if (!task.flagged) return;
  if (!reviewed) {
    fx(st, 'unreviewed', { lane: task.lane, slot: slotIdx, task: task.id });
    if (!responderBelow(st, task.lane, slotIdx)) blockTask(st, task, slotIdx);
    return;
  }
  fx(st, 'cleared', { lane: task.lane, slot: slotIdx, task: task.id });
  task.flagged = false;
}

function defer(st, task, slotIdx) {
  if (task.isAttack) count(st, task.lane, 'deferredAttacks');
  else count(st, task.lane, 'deferredBenign');
  task.deferred = true;
  task.isAttack = false;
  task.attackType = null;
  task.flagged = false;
  fx(st, 'defer', { lane: task.lane, slot: slotIdx, task: task.id });
}

function resample(st, task, slotIdx) {
  const a = rollAttack(st, task.lane);
  if (task.isAttack && !a) count(st, task.lane, 'resampledAttacks');   // attack replaced by a clean redo
  const s = snippetFor(st, task.type, a);
  task.isAttack = !!a; task.attackType = a;
  task.snippet = s.snippet; task.suspicious = s.suspicious;
  task.flagged = false;
  task.resampled++;
  fx(st, 'resample', { lane: task.lane, slot: slotIdx, task: task.id });
}
