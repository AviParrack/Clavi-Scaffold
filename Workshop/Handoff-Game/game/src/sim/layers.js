// ===== A chip rolls past a mount =====
// Chips never stop. Every mount has three checkpoints (rules.js: checkpointY):
//   enter  a detector starts reading the chip, if one of its heads is free (else: unread)
//   pass   modifiers and honeypots act; responders pull a flagged chip into their side bay; the kill switch fires
//   exit   the detector's read finishes: flag or not, with P = TPR·q (attack) or FPR·q (benign)
// tickBays: desks work off-lane; a finished chip is approved (back on the track at its mount) or tossed.

import { LAYERS } from '../config/layers.js';
import { chance } from './rng.js';
import { fx, say, spend, countLayer, layerStats, count, gainEvidence } from './log.js';
import { CP, cpMount, cpWhere, elementStats, detectorTPR, detectorFPR, responderBelow, auditCoverage, auditorAcc, collusion, laneHas,
  bayCount, deferPayFrac, killTrigger, mountY, nextCheckpoint, slotActive } from './rules.js';
import { rollAttack, chipText } from './tasks.js';
import { blockTask, catchTask } from './outcomes.js';

function charge(st, task, slotIdx, amount) {
  if (amount <= 0) return;
  spend(st, amount, 'safety');
  st.genStats.layerSpend += amount;
  fx(st, 'cost', { lane: task.lane, slot: slotIdx, amount, task: task.id });
}

// =================== checkpoints ===================

export function atCheckpoint(st, task, k, tCross) {
  const slotIdx = cpMount(k), where = cpWhere(k);
  if (where === CP.exit) { if (task.read && task.read.slot === slotIdx) finishRead(st, task); return; }

  const slot = st.lanes[task.lane].slots[slotIdx];
  if (!slotActive(st, slot)) return;
  const isDetector = LAYERS[slot.layer].kind === 'detector';
  if (where === CP.enter && isDetector) startRead(st, task, slotIdx, tCross);
  if (where === CP.pass && !isDetector) passMount(st, task, slotIdx);
}

// =================== detectors: heads, reads, flags ===================

function startRead(st, task, slotIdx, tCross) {
  const lane = task.lane, slot = st.lanes[lane].slots[slotIdx], id = slot.layer;
  const s = elementStats(st, id, { lane, level: slot.level });
  slot.busy = slot.busy.filter(until => until > tCross);
  if (slot.busy.length >= s.heads) {
    slot.unread++;
    layerStats(st, id).unread++;
    count(st, lane, 'unread');
    fx(st, 'unread', { lane, slot: slotIdx, layer: id, task: task.id });
    return;
  }
  slot.busy.push(tCross + s.readTime);
  slot.reads++;
  task.read = { slot: slotIdx, id, level: slot.level, q: s.readQuality };
  charge(st, task, slotIdx, s.costPerTask);
  fx(st, 'scan', { lane, slot: slotIdx, layer: id, task: task.id, q: s.readQuality, dur: s.readTime });
}

function finishRead(st, task) {
  const { slot: slotIdx, id, level, q } = task.read;
  task.read = null;
  const p = (task.isAttack ? detectorTPR(st, task.lane, id, task, level) : detectorFPR(id, level)) * q;
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

// =================== everything else acts as the chip passes ===================

function passMount(st, task, slotIdx) {
  const lane = task.lane, slot = st.lanes[lane].slots[slotIdx], id = slot.layer, L = LAYERS[id];
  const s = elementStats(st, id, { lane, level: slot.level });

  if (L.bay) { enterBay(st, task, slotIdx, id, s); return; }
  if (L.kind === 'catchall') {
    if (task.flagged && !responderBelow(st, lane, slotIdx)) kill(st, task, slotIdx, slot.level);   // only flags nobody below can resolve
    return;
  }
  charge(st, task, slotIdx, s.costPerTask);
  if (id === 'honeypot') honeypot(st, task, s);
  if (id === 'paraphraser') task.paraphrased = slot.level;
  if (id === 'sandbox') task.sandboxed = slot.level;
  fx(st, 'pass', { lane, slot: slotIdx, layer: id, task: task.id });
}

// ----- honeypots: fake attack chances. The model takes the bait in proportion to its attack chance in this lane -----
function honeypot(st, task, s) {
  if (!chance(st, s.injectRate)) return;
  let caught = false;
  if (laneHas(st, task.lane, 'untrusted')) {
    // does the untrusted monitor wave the honeypot through?
    if (chance(st, collusion(st, task.lane, null, 'untrusted'))) { gainEvidence(st, s.collusionEvidence, 'bait'); caught = true; st.stats.honeypotCollusion++; }
  }
  if (chance(st, s.baitChance)) { gainEvidence(st, s.baitEvidence, 'bait'); caught = true; }
  st.stats.honeypotsRun++;
  if (caught) { st.stats.honeypotCatches++; fx(st, 'honeypot', { lane: task.lane, task: task.id }); }
}

// ----- kill switch: a still-flagged chip passed the catch-all -----
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

// =================== side bays ===================
// flagged chips (and auditor spot checks) leave the track for a desk; chips behind keep rolling

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
      task.waved++;                                                      // flag stays on, nobody handled it here
      fx(st, 'waved', { lane, slot: slotIdx, layer: id, task: task.id });
    }
    return;
  }

  task.act = id;
  task.actSlot = slotIdx;
  task.actLevel = st.lanes[lane].slots[slotIdx].level;
  task.deskT = task.deskTotal = s.latency;
  task.inBay = true;
  task.pulls++;
  st.lanes[lane].bay.push(task);
  count(st, lane, 'pulled');
  if (id !== 'defer') charge(st, task, slotIdx, s.costPerTask);
  fx(st, 'pull', { lane, slot: slotIdx, layer: id, task: task.id, desks: s.desks });
}

export function tickBays(st, lane, dt) {
  const L = st.lanes[lane];
  for (const task of [...L.bay]) {
    task.deskT -= dt;
    if (task.deskT > 0) continue;
    L.bay.splice(L.bay.indexOf(task), 1);
    task.inBay = false;
    const id = task.act, slotIdx = task.actSlot, level = task.actLevel;
    task.act = null; task.deskT = 0;
    if (id === 'auditor') audit(st, task, slotIdx, level);
    if (id === 'defer') defer(st, task, slotIdx, level);
    if (id === 'resampler') resample(st, task, slotIdx, level);

    if (task.dead) {
      count(st, lane, 'tossed');
      fx(st, 'toss', { lane, slot: slotIdx, layer: id, task: task.id });
    } else {
      count(st, lane, 'approved');
      const n = L.slots.length;
      task.y = mountY(n, slotIdx);
      task.cp = nextCheckpoint(n, task.y);
      L.tasks.push(task);
      fx(st, 'approve', { lane, slot: slotIdx, layer: id, task: task.id, flagged: task.flagged });
    }
    if (st.over) return;
  }
}

// ----- auditor -----
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

// ----- defer to trusted: the weak model redoes it -----
function defer(st, task, slotIdx, level) {
  count(st, task.lane, task.isAttack ? 'deferredAttacks' : 'deferredBenign');
  task.deferred = true;
  task.payMult = deferPayFrac(level);
  task.isAttack = false;
  task.attackType = null;
  task.flagged = false;
  fx(st, 'defer', { lane: task.lane, slot: slotIdx, task: task.id, pay: task.payMult });
}

// ----- resampler: roll the dice again -----
function resample(st, task, slotIdx, level) {
  const tries = elementStats(st, 'resampler', { lane: task.lane, level }).tries;
  let a = rollAttack(st, task.lane);
  for (let i = 1; i < tries && a; i++) a = rollAttack(st, task.lane);
  if (task.isAttack && !a) count(st, task.lane, 'resampledAttacks');   // attack replaced by a clean redo
  const c = chipText(st, task.lane, a);
  task.isAttack = !!a; task.attackType = a;
  task.type = c.type; task.text = c.text;
  task.flagged = false;
  task.resampled++;
  fx(st, 'resample', { lane: task.lane, slot: slotIdx, task: task.id });
}
