// ===== Derived quantities. Pure reads of state + config, no mutation. =====

import { BALANCE as B, SPLIT } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { LAYERS } from '../config/layers.js';
import { UPGRADES, MAX_LEVEL } from '../config/upgrades.js';
import { ATTACKS, MODEL_ATTACKS } from '../config/tasks.js';
import { TRAITS } from '../config/traits.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const genDef = st => GENERATIONS[st.gen - 1];
export const bundle = st => genDef(st).bundle;
export const chipScale = st => genDef(st).chipScale;
export const chipWorth = st => bundle(st) * chipScale(st);      // $ multiplier for anything paid or charged per chip

// ----- timed modifiers from events -----
export function mod(st, key) {
  let x = 1;
  for (const m of st.mods) if (m.key === key && st.t < m.until) x *= m.mult;
  return x;
}

// =================== hidden traits ===================

export const traitMult = (st, key) => st.traits.reduce((x, id) => x * (TRAITS[id][key] ?? 1), 1);
export const traitAttackMult = (st, type) => st.traits.reduce((x, id) => x * (TRAITS[id].attackMult?.[type] ?? 1), 1);
export const traitTPRPlus = (st, elementId) => st.traits.reduce((x, id) => x + (TRAITS[id].tprPlus?.[elementId] ?? 0), 0);
export const traitWatch = st => st.traits.map(id => TRAITS[id].watchMult).find(Boolean) || null;

// =================== compute split & volume ===================

// the model's total compute in chips/s (Product + Capabilities + Safety)
export const compute = st => genDef(st).rate / SPLIT.default.product * traitMult(st, 'throughputMult');

// chips/s spawned on a lane
export function laneRate(st, lane) {
  const share = lane === 'ext' ? st.split.product : st.split.capabilities;
  return compute(st) * share * mod(st, lane === 'ext' ? 'extSpawn' : 'intSpawn');
}

// normalise to 1, then clamp each share into [min, max] and hand the excess to the shares with room.
// Garbage in (NaN, Infinity, strings, negatives) counts as 0. Dividing by the largest first means no overflow.
export function normaliseSplit(product, capabilities, safety) {
  const keys = ['product', 'capabilities', 'safety'];
  let v = [product, capabilities, safety].map(x => Number.isFinite(+x) ? Math.max(0, +x) : 0);
  const top = Math.max(...v);
  if (top > 0) v = v.map(x => x / top);
  const total = v.reduce((a, b) => a + b, 0);
  v = total > 0 ? v.map(x => x / total) : keys.map(k => SPLIT.default[k]);
  const lo = keys.map(k => SPLIT.min[k]), hi = keys.map(k => SPLIT.max[k]);
  v = v.map((x, i) => clamp(x, lo[i], hi[i]));
  const excess = v.reduce((a, b) => a + b, 0) - 1;
  const room = v.map((x, i) => excess > 0 ? x - lo[i] : hi[i] - x);
  const roomTotal = room.reduce((a, b) => a + b, 0);
  if (roomTotal > 0) v = v.map((x, i) => x - excess * room[i] / roomTotal);
  return { product: v[0], capabilities: v[1], safety: v[2] };
}

// =================== track geometry ===================
// Mount i sits at mountY(n, i). Every mount has three checkpoints on the track, in this order:
//   enter: top of the scan window (y − r) · pass: the mount itself (y) · exit: bottom of the scan window (y + r)
// Checkpoint k = cpIndex(mount, where). A chip only remembers k of the next checkpoint it will reach.

export const CP = { enter: 0, pass: 1, exit: 2 };
export const CP_PER_MOUNT = 3;
export const cpIndex = (mount, where) => CP_PER_MOUNT * mount + where;
export const cpMount = k => Math.floor(k / CP_PER_MOUNT);
export const cpWhere = k => k % CP_PER_MOUNT;
export const cpCount = n => CP_PER_MOUNT * n;

export const mountY = (n, i) => B.mountTop + (i + 0.5) * (B.mountBottom - B.mountTop) / n;
export const checkpointY = (n, k) => mountY(n, cpMount(k)) + (cpWhere(k) - CP.pass) * B.scanRadius;
export function nextCheckpoint(n, y) {
  let k = 0;
  while (k < cpCount(n) && checkpointY(n, k) <= y) k++;
  return k;
}

export const laneSpeed = st => 1 / genDef(st).travel;                   // track lengths per second
export const scanDwell = st => 2 * B.scanRadius / laneSpeed(st);        // seconds a chip spends in a scan window
export const readQuality = (st, latency) => latency > 0 ? Math.min(1, scanDwell(st) / latency) : 1;

// chance an arriving chip finds every head busy (Erlang loss formula, Poisson arrivals)
// heads: concurrent reads, load: chips/s × seconds per read
export function erlangB(heads, load) {
  let b = 1;
  for (let k = 1; k <= heads; k++) b = load * b / (k + load * b);
  return b;
}

// =================== lanes & slots ===================

export const slotActive = (st, slot) => !!slot.layer && slot.on && st.t >= slot.forcedOffUntil;

export function laneHas(st, lane, id, belowIdx = -1) {
  return st.lanes[lane].slots.some((s, i) => i > belowIdx && s.layer === id && slotActive(st, s));
}

export function responderBelow(st, lane, slotIdx) {
  return st.lanes[lane].slots.some((s, i) => i > slotIdx && slotActive(st, s) && LAYERS[s.layer].kind === 'responder');
}

export const activeCount = (st, lane) => st.lanes[lane].slots.filter(s => slotActive(st, s)).length;
export const bayCount = (st, lane, slotIdx) => st.lanes[lane].bay.filter(t => t.actSlot === slotIdx).length;

// ----- upgrade levels -----
// lv: the per-level value of one stat (dflt when the element has no such row)
export function lv(id, level, key, dflt = 1) {
  const row = UPGRADES[id]?.[key];
  return row ? row[clamp(level, 1, MAX_LEVEL) - 1] : dflt;
}
export const capstone = (id, level) => (level >= MAX_LEVEL && UPGRADES[id]?.capstone) || {};

// =================== prices ===================

export function layerCost(st, id, level = 1) {
  let c = LAYERS[id].cost * lv(id, level, 'costMult') * chipWorth(st) * mod(st, 'cost');
  if (id === 'monitor' && st.upgrades.monitor_ensemble) c *= 1.5;
  return c;
}
export const buyPrice = (st, id) => LAYERS[id].buy * bundle(st);
export const researchPrice = st => B.researchBase * Math.pow(B.researchMult, st.researchCount) * bundle(st);

// $ to go from `level` to level + 1 (null at max)
export function upgradePrice(st, id, level) {
  if (level >= MAX_LEVEL) return null;
  return UPGRADES[id].price[level - 1] * bundle(st);
}
// what a placed element has cost so far, at today's prices (for the sell refund)
export function investedPrice(st, id, level) {
  let p = buyPrice(st, id);
  for (let l = 1; l < level; l++) p += upgradePrice(st, id, l);
  return p;
}
// $ for the next mount in this lane (null when the lane is full)
export function slotPrice(st, lane) {
  const n = st.lanes[lane].slots.length;
  if (n >= B.maxSlots) return null;
  return B.slotBase * Math.pow(B.slotMult, Math.max(0, n - B.startSlots)) * bundle(st);
}

// =================== attacks ===================

export const attackRate = st => B.attackBase + B.attackPerM * st.m;   // the model's base propensity, per chip
export const stealth = st => genDef(st).stealth * traitMult(st, 'stealthMult');   // detectors and chip text both read this
export const stealthFactor = st => 1 - stealth(st) / 2;

// Situationally Aware: busy auditors scare it off, idle ones invite it
export function watchMult(st, lane) {
  const w = traitWatch(st);
  if (!w || laneHas(st, lane, 'honeypot')) return 1;
  let desks = 0, busy = 0;
  st.lanes[lane].slots.forEach((s, i) => {
    if (s.layer !== 'auditor' || !slotActive(st, s)) return;
    desks += bayDesks('auditor', s.level);
    busy += bayCount(st, lane, i);
  });
  const busyFrac = desks ? Math.min(1, busy / desks) : 0;
  return w.idle + (w.busy - w.idle) * busyFrac;
}

// chance per chip of each attack type in this lane: { type: p }. Order is fixed (rolled with one draw).
export function attackChances(st, lane) {
  const p = attackRate(st) * watchMult(st, lane);
  const out = {};
  if (lane === 'ext') out.jailbreak = B.jailbreakRate * mod(st, 'jailbreak');
  const cat = lane === 'int' ? genDef(st).catShare : 0;
  const types = MODEL_ATTACKS[lane].filter(t => !ATTACKS[t].catastrophe);
  const wTotal = types.reduce((s, t) => s + ATTACKS[t].weight, 0);
  for (const t of types) out[t] = p * (1 - cat) * ATTACKS[t].weight / wTotal * traitAttackMult(st, t);
  if (cat > 0) out.exfil = p * cat * traitAttackMult(st, 'exfil');
  return out;
}

// summed chance a chip in this lane is an attack: the model's own attacks, plus users' jailbreaks if withUsers
export function attackChance(st, lane, withUsers = false) {
  let p = 0;
  for (const [type, x] of Object.entries(attackChances(st, lane))) if (withUsers || !ATTACKS[type].user) p += x;
  return p;
}

export const paraphraseMult = level => capstone('paraphraser', level).noCollusion ? 0 : LAYERS.paraphraser.collusionMult * lv('paraphraser', level, 'collusionMult');

export function collusion(st, lane, task, id, level = 1) {
  const U = LAYERS.untrusted;
  let c = 0;
  if (id === 'untrusted') c = Math.min(U.collusionMax, U.collusionPerM * st.m * traitMult(st, 'collusionMult'));
  if (id === 'monitor' && st.upgrades.promote_model) c = Math.min(U.collusionMax, U.collusionPerM * st.promotedM);
  c *= capstone(id, level).collusionMult ?? 1;
  if (task && task.paraphrased) c *= paraphraseMult(task.paraphrased);
  if (laneHas(st, lane, 'honeypot')) c *= LAYERS.honeypot.collusionMult;
  return c;
}

// =================== detectors ===================

export function probeBaseTPR(st, level = 1) {
  const L = LAYERS.probe;
  const gensStale = capstone('probe', level).noDecay ? 0 : st.gen - st.probe.trainedGen;
  return Math.max(L.minTPR, L.tpr - L.decayPerGen * gensStale - st.probe.shift);
}

export function monitorBaseTPR(st) {
  const base = st.upgrades.promote_model ? GENERATIONS[0].tmTPR : genDef(st).tmTPR;
  return Math.min(0.99, base + (st.upgrades.monitor_ensemble ? 0.10 : 0));
}

// nominal TPR: before stealth and collusion, after upgrades and trait bonuses
export function nominalTPR(st, id, level = 1) {
  let p = id === 'probe' ? probeBaseTPR(st, level) : id === 'monitor' ? monitorBaseTPR(st) : LAYERS[id].tpr;
  p = p * lv(id, level, 'tprMult') + traitTPRPlus(st, id);
  p = Math.max(p, capstone(id, level).tprFloor ?? 0);
  return Math.min(0.99, p);
}

// chance a full read flags a real attack (task may be null for a lane-level estimate). × read quality at read time.
export function detectorTPR(st, lane, id, task = null, level = 1) {
  return clamp(nominalTPR(st, id, level) * stealthFactor(st) * (1 - collusion(st, lane, task, id, level)), 0, 1);
}
export const detectorFPR = (id, level = 1) => LAYERS[id].fpr * lv(id, level, 'fprMult');
export const detectorHeads = (id, level) => (LAYERS[id].heads || 0) + lv(id, level, 'headsPlus', 0);

// =================== auditing ===================

export const auditorCap = st => B.auditorCapacity * (st.upgrades.ai_auditing ? 10 : 1) * mod(st, 'auditorCap');
export const auditorAcc = st => st.upgrades.ai_auditing ? Math.min(0.95, 1 - st.m) : genDef(st).auditAcc;
export const auditCoverage = (st, b) => Math.min(1, auditorCap(st) / b);

// ----- per-element helpers the sim uses at the moment of action -----
export const elementLatency = (id, level) => LAYERS[id].latency * lv(id, level, 'latencyMult');
export const bayDesks = (id, level) => (LAYERS[id].desks || 0) + lv(id, level, 'desksPlus', 0);
export const deferPayFrac = level => capstone('defer', level).fullPay ? 1 : B.deferPay * lv('defer', level, 'payMult');
export const sandboxHarm = level => LAYERS.sandbox.harmMult * lv('sandbox', level, 'harmMult');
export const sandboxWorks = (st, level) => capstone('sandbox', level).containsAll || st.gen <= LAYERS.sandbox.worksUntilGen;
export function killTrigger(st, level) {
  const K = LAYERS.killswitch, m = lv('killswitch', level, 'triggerMult');
  return { rep: capstone('killswitch', level).noRepCost ? 0 : K.triggerRep * m * chipScale(st), cost: K.triggerCost * m * chipWorth(st) };
}

// =================== element stats: the one place hover cards read from ===================
// elementStats(st, id, { lane, level }) → live numbers for one element
//   catch       chance it stops a real attack it acts on (detectors: flags it, given a read)
//   falseAlarm  chance it acts against a benign chip (detectors: given a read)
//   costPerTask, latency (s), level, upgradePrice, capstone
//   detectors:  heads, dwell (s), readQuality (q at the current speed), unreadRate (share of chips missed, estimate),
//               tpr / fpr (full-read values), nominalTPR
//   bays:       desks, onFull
//   honeypot:   injectRate, baitChance, baitEvidence, collusionEvidence
export function elementStats(st, id, { lane = 'ext', level = 1 } = {}) {
  const L = LAYERS[id], cap = capstone(id, level);
  const s = {
    id, name: L.name, kind: L.kind, level, maxLevel: MAX_LEVEL,
    catch: null, falseAlarm: 0,
    costPerTask: layerCost(st, id, level),
    latency: elementLatency(id, level),
    desks: L.bay ? bayDesks(id, level) : 0,
    onFull: L.bay ? L.onFull : null,
    upgradePrice: upgradePrice(st, id, level),
    capstone: cap.name ? cap : null,
  };
  switch (id) {
    case 'probe': case 'monitor': case 'untrusted': {
      s.heads = detectorHeads(id, level);
      s.dwell = scanDwell(st);
      s.readQuality = readQuality(st, s.latency);
      s.readTime = Math.min(s.latency, s.dwell);
      s.unreadRate = erlangB(s.heads, laneRate(st, lane) * s.readTime);
      s.tpr = detectorTPR(st, lane, id, null, level);
      s.fpr = detectorFPR(id, level);
      s.catch = s.tpr * s.readQuality;
      s.falseAlarm = s.fpr * s.readQuality;
      s.nominalTPR = nominalTPR(st, id, level);
      break;
    }
    case 'auditor': {
      const cov = auditCoverage(st, bundle(st));
      s.coverage = cov;
      s.catch = cov * auditorAcc(st);
      s.falseAlarm = cov * L.fpr;
      s.spotCheck = L.spotCheck * lv(id, level, 'spotCheckMult');
      s.catchEvidence = cap.catchEvidence ?? 1;
      break;
    }
    case 'defer':
      s.catch = 1;
      s.payFrac = deferPayFrac(level);
      break;
    case 'resampler':
      s.tries = cap.tries ?? 1;
      s.catch = 1 - Math.pow(attackChance(st, lane, true), s.tries);
      break;
    case 'honeypot':
      s.injectRate = L.injectRate * lv(id, level, 'injectMult');
      s.baitChance = Math.min(1, L.baitMult * attackChance(st, lane));
      s.baitEvidence = L.baitEvidence * (cap.evidenceMult ?? 1) * chipScale(st);
      s.collusionEvidence = L.collusionEvidence * (cap.evidenceMult ?? 1) * chipScale(st);
      break;
    case 'paraphraser':
      s.collusionMult = paraphraseMult(level);
      break;
    case 'sandbox':
      s.harmMult = sandboxHarm(level);
      s.containsEscapes = sandboxWorks(st, level);
      break;
    case 'killswitch': {
      const k = killTrigger(st, level);
      s.catch = 1;
      s.triggerRep = k.rep;
      s.triggerCost = k.cost;
      break;
    }
  }
  return s;
}

// convenience: stats of whatever sits on a mount (null if empty)
export function slotStats(st, lane, slotIdx) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  return slot?.layer ? elementStats(st, slot.layer, { lane, level: slot.level }) : null;
}

// =================== economy ===================

export const marketShare = st => B.marketShareFloor + (1 - B.marketShareFloor) * clamp(st.rep, 0, 100) / 100;
export function playerProgress(st) {
  const frac = st.phase === 'training' || st.phase === 'over' && st.over?.win ? 1 : Math.min(1, st.rd / st.rdNeed);
  return st.gen - 1 + frac;
}
export const rivalAhead = st => st.rival > playerProgress(st);
// falling behind the rival costs external value, more the further behind: 1 − slope × gap, floored
export const rivalMult = st => Math.max(B.rivalPenaltyFloor, 1 - B.rivalPenaltySlope * Math.max(0, st.rival - playerProgress(st)));
export const extValueMult = st => marketShare(st) * rivalMult(st) * mod(st, 'extValue') * mod(st, 'income');

// ----- misalignment estimate shown to the player (a Sandbagger makes it read low) -----
export function misalignmentEstimate(st) {
  const err = B.errBase / Math.sqrt(1 + 0.5 * Math.max(0, st.evidence));
  const est = clamp(st.m * traitMult(st, 'estMult') + st.mBias * err * 0.8, 0, 1);
  return { est, err };
}

// ----- ramp counters -----
export function realTasksPerSec(st) {
  if (st.phase !== 'play') return 0;
  return (laneRate(st, 'ext') + laneRate(st, 'int')) * bundle(st);
}
export const humanEquivalents = st => realTasksPerSec(st) * B.hreSecondsPerTask;
export const humanSeenFrac = st => st.genStats.realTotal ? st.genStats.realSeen / st.genStats.realTotal : 1;
