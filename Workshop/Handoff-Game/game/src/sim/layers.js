// ===== A chip rolls past a mount =====
// Chips never stop. Every mount has three checkpoints (rules.js: checkpointY):
//   enter  a detector starts reading the chip, if one of its heads is free (else: unread)
//   pass   modifiers and specials act; responders pull a flagged chip into their side bay; the kill switch fires;
//          an air-gapped Egress Filter blocks exfiltration outright (but for the odd side channel late in the game)
//   exit   the detector's read finishes: flag or not, with P = TPR·q (attack it can see) or FPR·q (anything else)
// tickBays: desks work off-lane; a finished chip is approved (back on the track at its mount) or tossed.

import { LAYERS } from '../config/layers.js';
import { chance } from './rng.js';
import { fx, say, spend, countLayer, layerStats, count, gainEvidence, changeRep } from './log.js';
import { CP, cpMount, cpWhere, elementStats, detectorTPR, detectorFPR, detectorHeads, elementLatency, readQuality, scanDwell,
  layerCost, catchesType, capstone, responderBelow, auditCoverage, auditorAcc, collusion, laneHas, bayCount, deferPayFrac,
  killTrigger, mountY, nextCheckpoint, slotActive, rateCap, rateBurst, redTeamRate, probeCatch, laneCatch, sameRate, chipScale,
  airGapLeak } from './rules.js';
import { rollAttack, chipText } from './tasks.js';
import { blockTask, catchTask, throttleTask } from './outcomes.js';

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
  if (LAYERS[slot.layer].role === 'detector') {
    if (where === CP.enter) startRead(st, task, slotIdx, tCross);
    else if (task.attackType === 'exfil' && capstone(slot.layer, slot.level).airGap) airGap(st, task, slotIdx);
    return;
  }
  if (where === CP.pass) passMount(st, task, slotIdx, tCross);
}

// =================== detectors: heads, reads, flags ===================

function startRead(st, task, slotIdx, tCross) {
  const lane = task.lane, slot = st.lanes[lane].slots[slotIdx], id = slot.layer;
  const latency = elementLatency(st, id, slot.level), q = readQuality(st, latency), readTime = Math.min(latency, scanDwell(st));
  slot.busy = slot.busy.filter(until => until > tCross);
  if (slot.busy.length >= detectorHeads(id, slot.level)) {
    slot.unread++;
    layerStats(st, id).unread++;
    count(st, lane, 'unread');
    fx(st, 'unread', { lane, slot: slotIdx, layer: id, task: task.id });
    return;
  }
  slot.busy.push(tCross + readTime);
  slot.reads++;
  task.read = { slot: slotIdx, id, level: slot.level, q };
  charge(st, task, slotIdx, layerCost(st, id, slot.level));
  fx(st, 'scan', { lane, slot: slotIdx, layer: id, task: task.id, q, dur: readTime });
}

// a type-limited detector sees an attack outside its types as just another chip (FPR)
function finishRead(st, task) {
  const { slot: slotIdx, id, level, q } = task.read;
  task.read = null;
  const inScope = task.isAttack && catchesType(id, level, task.attackType);
  const p = (inScope ? detectorTPR(st, task.lane, id, task, level) : detectorFPR(id, level)) * q;
  const flagged = chance(st, p);
  countLayer(st, id, inScope, flagged, p);
  if (inScope && id !== 'probe' && !flagged) {
    const c = collusion(st, task.lane, task, id, level);
    if (c > 0) st.stats.collusionMisses[id] = (st.stats.collusionMisses[id] || 0) + c;  // expected colluding misses
  }
  if (!flagged || task.flagged) return;
  task.flagged = true;
  fx(st, 'flag', { lane: task.lane, slot: slotIdx, layer: id, task: task.id });
  if (!responderBelow(st, task.lane, slotIdx)) blockTask(st, task, slotIdx);
}

// ----- Air Gap (Egress Filter capstone): exfiltration simply doesn't get out, read or not -----
// From G6 a share of attempts find a side channel (upgrades.js sideChannel): they roll on, and the filter's read still counts
function airGap(st, task, slotIdx) {
  if (chance(st, airGapLeak(st))) { count(st, task.lane, 'sideChannel'); return; }
  count(st, task.lane, 'airGapped');
  fx(st, 'airgap', { lane: task.lane, slot: slotIdx, task: task.id });
  blockTask(st, task, slotIdx);
}

// =================== everything else acts as the chip passes ===================

function passMount(st, task, slotIdx, tCross) {
  const lane = task.lane, slot = st.lanes[lane].slots[slotIdx], id = slot.layer, L = LAYERS[id];

  if (L.bay) { enterBay(st, task, slotIdx, id, elementStats(st, id, { lane, level: slot.level })); return; }
  if (L.catchall) {
    if (task.flagged && !responderBelow(st, lane, slotIdx)) kill(st, task, slotIdx, slot.level);   // only flags nobody below can resolve
    return;
  }
  if (id === 'redteam') { redTeam(st, task, slotIdx, slot); return; }        // charges per synthetic attack
  charge(st, task, slotIdx, layerCost(st, id, slot.level));
  if (id === 'ratelimit' && !rateLimit(st, task, slotIdx, slot, tCross)) return;
  if (id === 'honeypot') honeypot(st, task, elementStats(st, id, { lane, level: slot.level }));
  if (L.marks) task[L.marks] = slot.level;                                  // paraphrased, sandboxed, leastPriv, canary
  fx(st, 'pass', { lane, slot: slotIdx, layer: id, task: task.id });
}

// ----- rate limiter: a token bucket. Refills at rateCap chips/s, holds a burst. No token → turned away -----
// returns true if the chip goes on
function rateLimit(st, task, slotIdx, slot, tCross) {
  const cap = rateCap(st), burst = rateBurst(st);
  if (slot.tokens == null) { slot.tokens = burst; slot.tokenT = tCross; }
  slot.tokens = Math.min(burst, slot.tokens + Math.max(0, tCross - slot.tokenT) * cap);
  slot.tokenT = Math.max(slot.tokenT, tCross);
  if (slot.tokens >= 1) { slot.tokens -= 1; return true; }
  if (capstone('ratelimit', slot.level).overflowDefer) {            // Overflow to Trusted: the weak model serves it instead
    count(st, task.lane, 'overflowDeferred');
    if (task.isAttack) count(st, task.lane, 'deferredAttacks');
    Object.assign(task, { deferred: true, payMult: deferPayFrac(1), isAttack: false, attackType: null, flagged: false });
    fx(st, 'throttle', { lane: task.lane, slot: slotIdx, task: task.id, deferred: true });
    return true;
  }
  throttleTask(st, task, slotIdx);
  return false;
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

// ----- red team: synthetic attacks probe every mount below. Each probe is tallied on the mount it tests -----
// slot.rt = {n, hits, p} on each measured mount · the red team's own slot.rtLane = probes stopped anywhere below.
// p is the true rate the tally is taken at: if it has moved since (rules.js sameRate), the tally starts over.
const tally = (old, p) => sameRate(old, p) ? old : { n: 0, hits: 0, p };

function redTeam(st, task, slotIdx, slot) {
  const lane = task.lane, slots = st.lanes[lane].slots, rate = redTeamRate(slot.level);
  const k = Math.floor(rate) + (chance(st, rate % 1) ? 1 : 0);        // injectRate can go above 1 (L4: 1.5 per chip)
  if (!k) return;
  const cost = layerCost(st, 'redteam', slot.level);
  const pLane = laneCatch(st, lane, slotIdx);
  for (let n = 0; n < k; n++) {
    charge(st, task, slotIdx, cost);
    let stopped = false;
    for (let i = slotIdx + 1; i < slots.length; i++) {
      const p = probeCatch(st, lane, i);
      if (p === null) continue;
      const hit = chance(st, p);
      const rt = slots[i].rt = tally(slots[i].rt, p);
      rt.n++; if (hit) rt.hits++;
      stopped = stopped || hit;
    }
    if (pLane !== null) { const own = slot.rtLane = tally(slot.rtLane, pLane); own.n++; if (stopped) own.hits++; }
    gainEvidence(st, LAYERS.redteam.probeEvidence * chipScale(st), 'redteam');
  }
  st.stats.redTeamProbes += k;
  fx(st, 'redteam', { lane, slot: slotIdx, task: task.id, probes: k });
}

// ----- kill switch: a still-flagged chip passed the catch-all -----
function kill(st, task, slotIdx, level) {
  const k = killTrigger(st, level);
  spend(st, k.cost, 'safety');
  st.genStats.layerSpend += k.cost;
  changeRep(st, -k.rep, 'killswitch');
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
  const cov = auditCoverage(st, task.bundle, level), acc = auditorAcc(st, level);
  st.genStats.realSeen += cov * task.bundle;
  task.audited = true;
  const reviewed = chance(st, cov);
  const verdictAttack = reviewed && (task.isAttack ? chance(st, acc) : chance(st, LAYERS.auditor.fpr));
  countLayer(st, 'auditor', task.isAttack, verdictAttack, cov * acc);
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
