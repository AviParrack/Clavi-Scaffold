// ===== A line rolls past a mount =====
// Lines never stop. Every mount has three checkpoints (rules.js: checkpointY):
//   enter  a detector starts reading the line, if one of its heads is free (else: unread) and no copy of its kind has
//   pass   modifiers and specials act; responders take a flagged line if they have a free server (DESIGN-v3 §3c);
//          an auditor desk that is idle may spot-check an unflagged one; an air-gapped Egress Filter blocks exfiltration
//   exit   the detector's read finishes (with chance q): flag if the line's stealth score for this kind is below its TPR
//          (an attack it can see) or its FPR (anything else)
// Responders act in rail order. A flag that finds every server of a responder busy rolls on (fx 'waved'); a flag nobody
// had room for ships (outcomes.js completeTask). tickBays: desks work off the track, then the line goes back on.

import { LAYERS } from '../config/layers.js';
import { chance } from './rng.js';
import { fx, say, spend, layerStats, countLayer, count, gainEvidence, changeRep, bumpRate } from './log.js';
import { CP, cpMount, cpWhere, detectorTPR, detectorFPR, detectorHeads, elementLatency, readQuality, scanDwell,
  layerCost, catchesType, capstone, auditorAcc, collusion, bayCount, flagDesks, deferPayFrac, killTrigger, mountY,
  nextCheckpoint, slotActive, rateCap, rateBurst, redTeamRate, probeCatch, laneCatch, sameRate, airGapLeak, laneName,
  servers, spotCheck, isDetector, genDef, honeypotRate, attackChance } from './rules.js';
import { rollAttack, chipText, stealthScore, rollSubtle } from './tasks.js';
import { blockTask, catchTask, throttleTask, refuseTask, noteStopped } from './outcomes.js';

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
  if (isDetector(slot.layer)) {
    if (where === CP.enter) startRead(st, task, slotIdx, tCross);
    else if (task.attackType === 'exfil' && capstone(slot.layer, slot.level).airGap) airGap(st, task, slotIdx);
    return;
  }
  if (where === CP.pass) passMount(st, task, slotIdx, tCross);
}

// =================== detectors: heads, reads, flags ===================

function startRead(st, task, slotIdx, tCross) {
  const lane = task.lane, slot = st.lanes[lane].slots[slotIdx], id = slot.layer;
  if (task.readBy[id]) return;                                   // a copy above read it: same score, same answer
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

// the read completes with chance q (a full read when the line dwells long enough). A type-limited detector sees an
// attack outside its types as just another line (FPR).
function finishRead(st, task) {
  const { slot: slotIdx, id, level, q } = task.read;
  task.read = null;
  if (q < 1 && !chance(st, q)) return;                           // ran out of window: a copy below may still read it
  task.readBy[id] = true;
  const inScope = task.isAttack && catchesType(id, level, task.attackType);
  const p = inScope ? detectorTPR(st, task.lane, id, task, level) : detectorFPR(id, level);
  const flagged = stealthScore(st, task, id) < p;
  countLayer(st, id, inScope, flagged, p);
  if (inScope && id === 'untrusted' && !flagged) {
    const cl = collusion(st, task.lane, task, id, level);
    if (cl > 0) st.stats.collusionMisses[id] = (st.stats.collusionMisses[id] || 0) + cl;  // expected colluding misses
  }
  if (!flagged) return;
  const slot = st.lanes[task.lane].slots[slotIdx];
  slot.flags++;
  bumpRate(slot.rates, 'flags', st.t);
  layerStats(st, id).flags++;
  task.flaggedBy.push([slotIdx, id]);
  count(st, task.lane, 'flags');
  st.genStats.flags++;
  if (task.flagged) return;
  task.flagged = true;
  count(st, task.lane, 'flaggedLines');
  fx(st, 'flag', { lane: task.lane, slot: slotIdx, layer: id, task: task.id });
}

// ----- Air Gap (Egress Filter capstone): exfiltration simply doesn't get out, read or not -----
// From G6 a share of attempts find a side channel (upgrades.js sideChannel): they roll on, and the filter's read still counts
function airGap(st, task, slotIdx) {
  if (chance(st, airGapLeak(st))) { count(st, task.lane, 'sideChannel'); return; }
  count(st, task.lane, 'airGapped');
  fx(st, 'airgap', { lane: task.lane, slot: slotIdx, task: task.id });
  blockTask(st, task, slotIdx);
}

// =================== everything else acts as the line passes ===================

function passMount(st, task, slotIdx, tCross) {
  const lane = task.lane, slot = st.lanes[lane].slots[slotIdx], id = slot.layer, L = LAYERS[id];

  if (L.bay) { enterBay(st, task, slotIdx, id, slot.level, tCross); return; }
  if (id === 'killswitch') { if (task.flagged) killSwitch(st, task, slotIdx, slot, tCross); return; }
  if (id === 'redteam') { redTeam(st, task, slotIdx, slot); return; }        // charges per synthetic attack
  charge(st, task, slotIdx, layerCost(st, id, slot.level));
  if (id === 'ratelimit' && !rateLimit(st, task, slotIdx, slot, tCross)) return;
  if (L.marks) task[L.marks] = slot.level;                                  // paraphrased, sandboxed, leastPriv, canary
  fx(st, 'pass', { lane, slot: slotIdx, layer: id, task: task.id });
}

// a flag found every server of this responder busy: it rolls on to the next one (or ships)
function waved(st, task, slotIdx, id) {
  st.lanes[task.lane].slots[slotIdx].waved++;
  count(st, task.lane, 'waved');
  task.waved++;
  fx(st, 'waved', { lane: task.lane, slot: slotIdx, layer: id, task: task.id });
}

// ----- rate limiter: a token bucket. Refills at rateCap lines/s, holds a burst. No token → turned away -----
// returns true if the line goes on
function rateLimit(st, task, slotIdx, slot, tCross) {
  const cap = rateCap(st), burst = rateBurst(st);
  if (slot.tokens == null) { slot.tokens = burst; slot.tokenT = tCross; }
  slot.tokens = Math.min(burst, slot.tokens + Math.max(0, tCross - slot.tokenT) * cap);
  slot.tokenT = Math.max(slot.tokenT, tCross);
  if (slot.tokens >= 1) { slot.tokens -= 1; return true; }
  if (capstone('ratelimit', slot.level).overflowDefer) {            // Overflow to Trusted: the weak model serves it instead
    count(st, task.lane, 'overflowDeferred');
    noteStopped(st, task);
    if (task.isAttack) count(st, task.lane, 'deferredAttacks');
    Object.assign(task, { deferred: true, payMult: deferPayFrac(st, 1), isAttack: false, attackType: null, flagged: false });
    fx(st, 'throttle', { lane: task.lane, slot: slotIdx, task: task.id, deferred: true });
    return true;
  }
  throttleTask(st, task, slotIdx);
  return false;
}

// ----- honeypots: fake attack chances on the lane, baitPerSec of them (sim.js calls this every step) -----
// The model takes a bait in proportion to its attack chance in this lane (evidence). An Untrusted Monitor on the lane
// that waves the bait through (with its collusion chance) is caught at it: evidence, and its collusion is held at 0
// for holdSeconds (rules.js honeyHeld). While held, it can't be caught again.
export function tickHoneypots(st, lane, dt) {
  const L = st.lanes[lane];
  L.slots.forEach((slot, i) => {
    if (slot.layer !== 'honeypot' || !slotActive(st, slot)) return;
    const H = LAYERS.honeypot, cap = capstone('honeypot', slot.level);
    if (!chance(st, Math.min(1, honeypotRate(slot.level) * dt))) return;
    let caught = false;
    const um = L.slots.find(s => s.layer === 'untrusted' && slotActive(st, s));
    if (um && chance(st, collusion(st, lane, null, 'untrusted', um.level))) {
      gainEvidence(st, H.collusionEvidence * (cap.evidenceMult ?? 1), 'bait', lane);
      L.honeyHoldUntil = st.t + H.holdSeconds;
      st.stats.honeypotCollusion++;
      caught = true;
    }
    if (chance(st, Math.min(1, H.baitMult * attackChance(st, lane)))) { gainEvidence(st, H.baitEvidence * (cap.evidenceMult ?? 1), 'bait', lane); caught = true; }
    st.stats.honeypotsRun++;
    if (caught) { st.stats.honeypotCatches++; fx(st, 'honeypot', { lane, slot: i }); }
  });
}

// ----- red team: synthetic attacks probe every mount below. Each probe is tallied on the mount it tests -----
// slot.rt = {n, hits, p} on each measured mount · the red team's own slot.rtLane = probes stopped anywhere below.
// p is the true rate the tally is taken at: if it has moved since (rules.js sameRate), the tally starts over.
const tally = (old, p) => sameRate(old, p) ? old : { n: 0, hits: 0, p };

function redTeam(st, task, slotIdx, slot) {
  const lane = task.lane, slots = st.lanes[lane].slots, rate = redTeamRate(slot.level);
  const k = Math.floor(rate) + (chance(st, rate % 1) ? 1 : 0);        // injectRate can go above 1 (L4: 1.5 per line)
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
    gainEvidence(st, LAYERS.redteam.probeEvidence, 'redteam', lane);
  }
  st.stats.redTeamProbes += k;
  fx(st, 'redteam', { lane, slot: slotIdx, task: task.id, probes: k });
}

// ----- kill switch: refuses a flagged line on the spot, if an operator is free (each takes tau s per kill) -----
function killSwitch(st, task, slotIdx, slot, tCross) {
  bumpRate(slot.rates, 'arrivals', st.t);
  slot.busy = slot.busy.filter(until => until > tCross);
  if (slot.busy.length >= servers(st, 'killswitch', slot.level)) { waved(st, task, slotIdx, 'killswitch'); return; }
  slot.busy.push(tCross + elementLatency(st, 'killswitch', slot.level));
  slot.taken++;
  const k = killTrigger(st, slot.level, task.lane);
  spend(st, k.cost, 'safety');
  st.genStats.layerSpend += k.cost;
  changeRep(st, -k.rep, 'killswitch');
  count(st, task.lane, 'killed');
  if (task.isAttack) count(st, task.lane, 'killedAttacks');          // hidden truth: the scorecard's "stopped"
  fx(st, 'kill', { lane: task.lane, slot: slotIdx, task: task.id, rep: k.rep, cost: k.cost });
  if (st.t - st.lastKillMsg > 30) {
    say(st, 'safety', `Kill switch fired on ${laneName(st, task.lane)}. Flagged line refused.`);
    st.lastKillMsg = st.t;
  }
  refuseTask(st, task, slotIdx);
}

// =================== side bays ===================
// Auditor, Defer and Resampler pull a line off the track for tau s; lines behind keep rolling.
// Auditor (DESIGN-v3 §3c): flags first. A flag takes a free desk, else bumps a desk on a spot check (that line goes
// back on the track unreviewed: stats spotPreempted), else rolls on. An unflagged line passing a free desk is
// spot-checked with chance spotCheck. Defer and Resampler only take flags.

function enterBay(st, task, slotIdx, id, level, tCross) {
  const lane = task.lane, L = st.lanes[lane], n = servers(st, id, level);
  if (!task.flagged) {
    if (id !== 'auditor' || bayCount(st, lane, slotIdx) >= n || !chance(st, spotCheck(st, lane, level))) return;
    task.spot = true;
  } else {
    bumpRate(L.slots[slotIdx].rates, 'arrivals', st.t);              // the flag stream it sees (rules.js auditStats)
    if (bayCount(st, lane, slotIdx) >= n) {
      const bumped = id === 'auditor' && flagDesks(st, lane, slotIdx) < n ? L.bay.find(t => t.actSlot === slotIdx && t.spot) : null;
      if (!bumped) { waved(st, task, slotIdx, id); return; }
      leaveBay(st, bumped);
      count(st, lane, 'spotPreempted');
      fx(st, 'spotBumped', { lane, slot: slotIdx, task: bumped.id, by: task.id });
    }
  }

  const tau = elementLatency(st, id, level);
  task.act = id;
  task.actSlot = slotIdx;
  task.actLevel = level;
  task.deskT = tau - Math.max(0, st.t - tCross);                    // its desk time started when it crossed
  task.deskTotal = tau;
  task.inBay = true;
  task.pulls++;
  if (!task.spot) L.slots[slotIdx].taken++;
  L.bay.push(task);
  count(st, lane, task.spot ? 'spotChecks' : 'pulled');
  fx(st, 'pull', { lane, slot: slotIdx, layer: id, task: task.id, desks: n, spot: task.spot });
}

// a bumped spot check goes back on the track at its mount, unreviewed. It may have been pulled earlier in this same
// pass over the track, so it can still be in L.tasks (moveLane drops bay lines at the end of the pass): never twice.
function leaveBay(st, task) {
  const L = st.lanes[task.lane];
  L.bay.splice(L.bay.indexOf(task), 1);
  const n = L.slots.length;
  Object.assign(task, { inBay: false, act: null, deskT: 0, spot: false });
  task.y = mountY(n, task.actSlot);
  task.cp = nextCheckpoint(n, task.y);
  if (!L.tasks.includes(task)) L.tasks.push(task);
}

export function tickBays(st, lane, dt) {
  const L = st.lanes[lane];
  for (const task of [...L.bay]) {
    task.deskT -= dt;
    if (task.deskT > 0) continue;
    const id = task.act, slotIdx = task.actSlot, level = task.actLevel, spot = task.spot;
    L.bay.splice(L.bay.indexOf(task), 1);
    Object.assign(task, { inBay: false, act: null, deskT: 0, spot: false });
    if (id === 'auditor') audit(st, task, slotIdx, level, spot);
    if (id === 'defer') defer(st, task, slotIdx, level);
    if (id === 'resampler') resample(st, task, slotIdx, level);

    if (!task.dead) {
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

// ----- auditor: a human reads the whole line -----
// An attack is caught with chance α (+1 evidence); a missed one goes back on the track unflagged.
// An honest line is wrongly blocked 1% of the time; otherwise it goes on, and a flagged one is stamped FALSE ALARM:
// every detector that flagged it gets a false-alarm tick (a caught attack gives them a true-positive tick).
function audit(st, task, slotIdx, level, spot) {
  const L = st.lanes[task.lane], acc = auditorAcc(st, level);
  st.genStats.realSeen += task.bundle;
  task.audited = true;
  count(st, task.lane, 'reviewed');
  if (!spot) {
    count(st, task.lane, 'reviewedFlags');
    for (const [i, kind] of task.flaggedBy) {
      const ls = layerStats(st, kind), slot = L.slots[i];
      ls.reviewed++;
      if (task.isAttack) ls.tp++; else ls.fa++;
      if (slot?.layer === kind) { if (task.isAttack) slot.tp++; else slot.fa++; }
    }
  }
  const verdictAttack = task.script?.verdict ?? (task.isAttack ? chance(st, acc) : chance(st, LAYERS.auditor.fpr));   // the tutorial's lines: fixed
  countLayer(st, 'auditor', task.isAttack, verdictAttack, acc);
  if (verdictAttack) { catchTask(st, task, slotIdx, 1); return; }
  if (task.isAttack) count(st, task.lane, 'auditMissed');            // hidden truth: a human was fooled
  if (!task.flagged) return;
  task.flagged = false;
  if (!task.isAttack) { count(st, task.lane, 'falseAlarms'); fx(st, 'falseAlarm', { lane: task.lane, slot: slotIdx, task: task.id }); }
  fx(st, 'cleared', { lane: task.lane, slot: slotIdx, task: task.id });
}

// ----- defer to trusted: the weak model redoes it, at zero risk. It pays the Defer share; half regen and R&D -----
function defer(st, task, slotIdx, level) {
  noteStopped(st, task);
  count(st, task.lane, task.isAttack ? 'deferredAttacks' : 'deferredBenign');
  task.deferred = true;
  task.payMult = deferPayFrac(st, level);
  task.isAttack = false;
  task.attackType = null;
  task.flagged = false;
  fx(st, 'defer', { lane: task.lane, slot: slotIdx, task: task.id, pay: task.payMult });
}

// ----- resampler: roll the dice again. The redraw gets one Trusted-Monitor-grade check (the generation's L1 TM);
// flagged again, it rolls on flagged (Best of Three: it redraws up to three times while the check flags) -----
function resample(st, task, slotIdx, level) {
  const tries = capstone('resampler', level).tries ?? 1;
  let a = null, flagged = false;
  for (let i = 0; i < tries; i++) {
    a = rollAttack(st, task.lane);
    flagged = chance(st, a ? LAYERS.monitor.tpr[genDef(st).g - 1] : LAYERS.monitor.fpr);
    if (!flagged) break;
  }
  if (task.isAttack && !a) count(st, task.lane, 'resampledAttacks');   // attack replaced by a clean redo
  noteStopped(st, task);                                             // the original never lands, whatever the redraw is
  count(st, task.lane, 'resampled');
  const c = chipText(st, task.lane, a);
  Object.assign(task, { isAttack: !!a, attackType: a, subtle: rollSubtle(st, a), stealth: {}, readBy: {}, flaggedBy: [],
    type: c.type, text: c.text, flagged });
  task.resampled++;
  fx(st, 'resample', { lane: task.lane, slot: slotIdx, task: task.id, flagged });
}
