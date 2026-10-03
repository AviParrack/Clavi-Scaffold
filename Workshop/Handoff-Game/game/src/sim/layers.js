// ===== A task meets a safety layer =====
// enterLayer:  charge cost, decide whether the layer acts, then either
//              hold the chip in the tier (inline layers) or pull it into a side bay (bay layers)
// finishLayer: after the hold / desk time, apply the layer's effect
// tickBays:    desks work off-lane; a finished chip is approved (back below its tier) or tossed

import { LAYERS } from '../config/layers.js';
import { chance } from './rng.js';
import { fx, say, spend, countLayer, count } from './log.js';
import { elementStats, detectorTPR, detectorFPR, responderBelow, auditCoverage, auditorAcc, collusion, laneHas, attackRate, bayCount, deferPayFrac, killTrigger, tierY } from './rules.js';
import { rollAttack, snippetFor } from './tasks.js';
import { blockTask, catchTask } from './outcomes.js';

function charge(st, task, amount) {
  if (amount <= 0) return;
  spend(st, amount, 'safety');
  st.genStats.layerSpend += amount;
  fx(st, 'cost', { lane: task.lane, slot: task.actSlot, amount, task: task.id });
}

// =================== entering a tier ===================

export function enterLayer(st, task, slotIdx) {
  const slot = st.lanes[task.lane].slots[slotIdx], id = slot.layer, L = LAYERS[id];
  const s = elementStats(st, id, { lane: task.lane, level: slot.level });
  task.actSlot = slotIdx;
  task.actLevel = slot.level;

  if (L.bay) { enterBay(st, task, slotIdx, id, s); return; }
  if (L.kind === 'responder' && !task.flagged) return;
  if (L.kind === 'catchall' && !(task.flagged && !responderBelow(st, task.lane, slotIdx))) return;   // only flags nobody below can resolve

  task.act = id;
  task.hold = task.holdMax = s.delay;
  charge(st, task, s.costPerTask);
  fx(st, 'enter', { lane: task.lane, slot: slotIdx, layer: id, task: task.id });
  if (task.hold <= 0) finishLayer(st, task);
}

// ----- side bay: flagged chips (and auditor spot checks) leave the lane for a desk -----
function enterBay(st, task, slotIdx, id, s) {
  const lane = task.lane;
  const free = bayCount(st, lane, slotIdx) < s.desks;

  if (!task.flagged) {
    if (!(free && s.spotCheck > 0 && chance(st, s.spotCheck))) return;   // spot check only with a free desk
  } else if (!free) {
    count(st, lane, 'bayFull');
    if (s.onFull === 'block') {
      count(st, lane, 'tossed');
      fx(st, 'toss', { lane, slot: slotIdx, layer: id, task: task.id, reason: 'full' });
      blockTask(st, task, slotIdx);
    } else {
      count(st, lane, 'waved');
      task.waved = (task.waved || 0) + 1;                                // flag stays on, nobody handled it here
      fx(st, 'waved', { lane, slot: slotIdx, layer: id, task: task.id });
    }
    return;
  }

  task.act = id;
  task.hold = task.holdMax = s.delay;
  task.inBay = true;
  st.lanes[lane].bay.push(task);
  count(st, lane, 'pulled');
  if (id !== 'defer') charge(st, task, s.costPerTask);
  fx(st, 'pull', { lane, slot: slotIdx, layer: id, task: task.id, desks: s.desks });
}

export function tickBays(st, lane, dt) {
  const L = st.lanes[lane];
  for (const task of [...L.bay]) {
    task.hold -= dt;
    if (task.hold > 0) continue;
    L.bay.splice(L.bay.indexOf(task), 1);
    task.inBay = false;
    const id = task.act, slotIdx = task.actSlot;
    finishLayer(st, task);

    if (task.dead) {
      count(st, lane, 'tossed');
      fx(st, 'toss', { lane, slot: slotIdx, layer: id, task: task.id });
    } else {
      count(st, lane, 'approved');
      task.y = tierY(L.slots.length, slotIdx);
      task.tierIdx = slotIdx + 1;
      L.tasks.push(task);
      fx(st, 'approve', { lane, slot: slotIdx, layer: id, task: task.id, flagged: task.flagged });
    }
    if (st.over) return;
  }
}

// =================== finishing ===================

export function finishLayer(st, task) {
  const id = task.act, slotIdx = task.actSlot, level = task.actLevel || 1;
  task.act = null; task.hold = 0;

  switch (id) {
    case 'probe': case 'monitor': case 'untrusted': detect(st, task, id, slotIdx, level); break;
    case 'honeypot':    honeypot(st, task, level); break;
    case 'paraphraser': task.paraphrased = level; break;
    case 'sandbox':     task.sandboxed = level; break;
    case 'auditor':     audit(st, task, slotIdx, level); break;
    case 'defer':       defer(st, task, slotIdx, level); break;
    case 'resampler':   resample(st, task, slotIdx, level); break;
    case 'killswitch':  kill(st, task, slotIdx, level); break;
  }
}

// ----- detectors -----
function detect(st, task, id, slotIdx, level) {
  const p = task.isAttack ? detectorTPR(st, task.lane, id, task, level) : detectorFPR(id, level);
  const flagged = chance(st, p);
  countLayer(st, id, task.isAttack, flagged, p);
  if (task.isAttack && id !== 'probe' && !flagged) {
    const c = collusion(st, task.lane, task, id, level);
    if (c > 0) st.stats.collusionMisses[id] = (st.stats.collusionMisses[id] || 0) + c;  // expected colluding misses
  }
  if (!flagged || task.flagged) return;
  task.flagged = true;
  fx(st, 'flag', { lane: task.lane, slot: slotIdx, layer: id, task: task.id });
  if (!responderBelow(st, task.lane, slotIdx)) blockTask(st, task, slotIdx);
}

// ----- honeypots: fake attack chances. Model takes the bait ~ in proportion to m -----
function honeypot(st, task, level) {
  const s = elementStats(st, 'honeypot', { lane: task.lane, level });
  if (!chance(st, s.injectRate)) return;
  let caught = false;
  if (laneHas(st, task.lane, 'untrusted')) {
    // does the untrusted monitor wave the honeypot through?
    if (chance(st, collusion(st, task.lane, null, 'untrusted'))) { st.evidence += 2; caught = true; st.stats.honeypotCollusion++; }
  }
  if (chance(st, Math.min(1, attackRate(st) * 10))) { st.evidence += s.baitEvidence; caught = true; }
  st.stats.honeypotsRun++;
  if (caught) { st.stats.honeypotCatches++; fx(st, 'honeypot', { lane: task.lane, task: task.id }); }
}

// ----- responders -----
// coverage = chance the human actually reads the part of the bundle that matters.
// Not reviewed → nobody vouches for it: a flag stays on and goes to the next responder (or is blocked).
function audit(st, task, slotIdx, level) {
  const s = elementStats(st, 'auditor', { lane: task.lane, level });
  const cov = auditCoverage(st, task.bundle);
  st.genStats.realSeen += cov * task.bundle;
  task.audited = true;
  const reviewed = chance(st, cov);
  const verdictAttack = reviewed && (task.isAttack ? chance(st, auditorAcc(st)) : chance(st, LAYERS.auditor.fpr));
  countLayer(st, 'auditor', task.isAttack, verdictAttack, cov * auditorAcc(st));
  if (verdictAttack) { catchTask(st, task, slotIdx, s.catchEvidence); return; }
  if (!task.flagged) return;
  if (!reviewed) {
    fx(st, 'unreviewed', { lane: task.lane, slot: slotIdx, task: task.id });
    if (!responderBelow(st, task.lane, slotIdx)) blockTask(st, task, slotIdx);
    return;
  }
  fx(st, 'cleared', { lane: task.lane, slot: slotIdx, task: task.id });
  task.flagged = false;
}

function defer(st, task, slotIdx, level) {
  if (task.isAttack) count(st, task.lane, 'deferredAttacks');
  else count(st, task.lane, 'deferredBenign');
  task.deferred = true;
  task.payMult = deferPayFrac(level);
  task.isAttack = false;
  task.attackType = null;
  task.flagged = false;
  fx(st, 'defer', { lane: task.lane, slot: slotIdx, task: task.id, pay: task.payMult });
}

function resample(st, task, slotIdx, level) {
  const tries = elementStats(st, 'resampler', { lane: task.lane, level }).tries;
  let a = rollAttack(st, task.lane);
  for (let i = 1; i < tries && a; i++) a = rollAttack(st, task.lane);
  if (task.isAttack && !a) count(st, task.lane, 'resampledAttacks');   // attack replaced by a clean redo
  const s = snippetFor(st, task.type, a);
  task.isAttack = !!a; task.attackType = a;
  task.snippet = s.snippet; task.suspicious = s.suspicious;
  task.flagged = false;
  task.resampled++;
  fx(st, 'resample', { lane: task.lane, slot: slotIdx, task: task.id });
}

// ----- kill switch: a still-flagged chip reached the catch-all -----
function kill(st, task, slotIdx, level) {
  const k = killTrigger(st, level);
  spend(st, k.cost, 'safety');
  st.genStats.layerSpend += k.cost;
  st.rep -= k.rep;
  st.stats.repLoss.killswitch += k.rep;
  count(st, task.lane, 'killed');
  fx(st, 'kill', { lane: task.lane, slot: slotIdx, task: task.id, rep: k.rep, cost: k.cost });
  if (st.t - st.lastKillMsg > 30) {
    say(st, 'safety', `Kill switch fired on ${task.lane === 'ext' ? 'EXTERNAL' : 'INTERNAL'}. Unresolved flag, task killed.`);
    st.lastKillMsg = st.t;
  }
  blockTask(st, task, slotIdx);
}
