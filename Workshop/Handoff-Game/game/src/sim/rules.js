// ===== Derived quantities. Pure reads of state + config, no mutation. =====

import { BALANCE as B } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { LAYERS } from '../config/layers.js';
import { UPGRADES, MAX_LEVEL } from '../config/upgrades.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const genDef = st => GENERATIONS[st.gen - 1];
export const bundle = st => genDef(st).bundle;

// ----- timed modifiers from events -----
export function mod(st, key) {
  let x = 1;
  for (const m of st.mods) if (m.key === key && st.t < m.until) x *= m.mult;
  return x;
}

// ----- lanes & slots -----
export const slotActive = (st, slot) => !!slot.layer && slot.on && st.t >= slot.forcedOffUntil;
export const tierY = (n, i) => B.tierTop + (i + 0.5) * (B.tierBottom - B.tierTop) / n;

export function laneHas(st, lane, id, belowIdx = -1) {
  return st.lanes[lane].slots.some((s, i) => i > belowIdx && s.layer === id && slotActive(st, s));
}

export function responderBelow(st, lane, slotIdx) {
  return st.lanes[lane].slots.some((s, i) => i > slotIdx && slotActive(st, s) && LAYERS[s.layer].kind === 'responder');
}

export const activeCount = (st, lane) => st.lanes[lane].slots.filter(s => slotActive(st, s)).length;
export const bayCount = (st, lane, slotIdx) => st.lanes[lane].bay.filter(t => t.actSlot === slotIdx).length;

// ----- upgrade levels -----
// lv: the per-level value of one stat (1 when the element has no such row)
export function lv(id, level, key, dflt = 1) {
  const row = UPGRADES[id]?.[key];
  return row ? row[clamp(level, 1, MAX_LEVEL) - 1] : dflt;
}
export const capstone = (id, level) => (level >= MAX_LEVEL && UPGRADES[id]?.capstone) || {};

// ----- prices -----
export function layerCost(st, id, level = 1) {
  let c = LAYERS[id].cost * lv(id, level, 'costMult') * bundle(st) * mod(st, 'cost');
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
// $ for the next tier slot in this lane (null when the lane is full)
export function slotPrice(st, lane) {
  const n = st.lanes[lane].slots.length;
  if (n >= B.maxSlots) return null;
  return B.slotBase * Math.pow(B.slotMult, Math.max(0, n - B.startSlots)) * bundle(st);
}

// ----- attacks -----
export const attackRate = st => B.attackBase + B.attackPerM * st.m;
export const stealthFactor = st => 1 - genDef(st).stealth / 2;

export const paraphraseMult = level => capstone('paraphraser', level).noCollusion ? 0 : LAYERS.paraphraser.collusionMult * lv('paraphraser', level, 'collusionMult');

export function collusion(st, lane, task, id, level = 1) {
  let c = 0;
  if (id === 'untrusted') c = Math.min(LAYERS.untrusted.collusionMax, LAYERS.untrusted.collusionPerM * st.m);
  if (id === 'monitor' && st.upgrades.promote_model) c = Math.min(LAYERS.untrusted.collusionMax, LAYERS.untrusted.collusionPerM * st.promotedM);
  c *= capstone(id, level).collusionMult ?? 1;
  if (task && task.paraphrased) c *= paraphraseMult(task.paraphrased);
  if (laneHas(st, lane, 'honeypot')) c *= LAYERS.honeypot.collusionMult;
  return c;
}

export function probeBaseTPR(st, level = 1) {
  const L = LAYERS.probe;
  const gensStale = capstone('probe', level).noDecay ? 0 : st.gen - st.probe.trainedGen;
  return Math.max(L.minTPR, L.tpr - L.decayPerGen * gensStale - st.probe.shift);
}

export function monitorBaseTPR(st) {
  const base = st.upgrades.promote_model ? GENERATIONS[0].tmTPR : genDef(st).tmTPR;
  return Math.min(0.99, base + (st.upgrades.monitor_ensemble ? 0.10 : 0));
}

// nominal TPR: before stealth and collusion, after upgrades
export function nominalTPR(st, id, level = 1) {
  let p = id === 'probe' ? probeBaseTPR(st, level) : id === 'monitor' ? monitorBaseTPR(st) : LAYERS[id].tpr;
  p *= lv(id, level, 'tprMult');
  p = Math.max(p, capstone(id, level).tprFloor ?? 0);
  return Math.min(0.99, p);
}

// chance a detector flags a real attack (task may be null for a lane-level estimate)
export function detectorTPR(st, lane, id, task = null, level = 1) {
  return clamp(nominalTPR(st, id, level) * stealthFactor(st) * (1 - collusion(st, lane, task, id, level)), 0, 1);
}
export const detectorFPR = (id, level = 1) => LAYERS[id].fpr * lv(id, level, 'fprMult');

// ----- auditing -----
export const auditorCap = st => B.auditorCapacity * (st.upgrades.ai_auditing ? 10 : 1) * mod(st, 'auditorCap');
export const auditorAcc = st => st.upgrades.ai_auditing ? Math.min(0.95, 1 - st.m) : genDef(st).auditAcc;
export const auditCoverage = (st, b) => Math.min(1, auditorCap(st) / b);

// ----- per-element helpers the sim uses at the moment of action -----
export const bayDesks = (id, level) => (LAYERS[id].desks || 0) + lv(id, level, 'desksPlus', 0);
export const deferPayFrac = level => capstone('defer', level).fullPay ? 1 : B.deferPay * lv('defer', level, 'payMult');
export const sandboxHarm = level => LAYERS.sandbox.harmMult * lv('sandbox', level, 'harmMult');
export const sandboxWorks = (st, level) => capstone('sandbox', level).containsAll || st.gen <= LAYERS.sandbox.worksUntilGen;
export function killTrigger(st, level) {
  const K = LAYERS.killswitch, m = lv('killswitch', level, 'triggerMult');
  return { rep: capstone('killswitch', level).noRepCost ? 0 : K.triggerRep * m, cost: K.triggerCost * m * bundle(st) };
}

// =================== element stats: the one place hover cards read from ===================
// elementStats(st, id, { lane, level }) → live numbers for one element
//   catch      chance it stops a real attack it acts on (detectors: flags it)
//   falseAlarm chance it acts against a benign task
//   costPerTask, delay (s), desks (bay layers), level, plus element-specific extras
export function elementStats(st, id, { lane = 'ext', level = 1 } = {}) {
  const L = LAYERS[id], cap = capstone(id, level);
  const s = {
    id, name: L.name, kind: L.kind, level, maxLevel: MAX_LEVEL,
    catch: null, falseAlarm: 0,
    costPerTask: layerCost(st, id, level),
    delay: L.latency * lv(id, level, 'delayMult'),
    desks: L.bay ? bayDesks(id, level) : 0,
    onFull: L.bay ? L.onFull : null,
    upgradePrice: upgradePrice(st, id, level),
    capstone: cap.name ? cap : null,
  };
  switch (id) {
    case 'probe': case 'monitor': case 'untrusted':
      s.catch = detectorTPR(st, lane, id, null, level);
      s.falseAlarm = detectorFPR(id, level);
      s.nominalTPR = nominalTPR(st, id, level);
      break;
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
      s.catch = 1 - Math.pow(attackRate(st), s.tries);
      break;
    case 'honeypot':
      s.injectRate = L.injectRate * lv(id, level, 'injectMult');
      s.baitEvidence = cap.baitEvidence ?? 1;
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

// convenience: stats of whatever sits in a tier slot (null if empty)
export function slotStats(st, lane, slotIdx) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  return slot?.layer ? elementStats(st, slot.layer, { lane, level: slot.level }) : null;
}

// ----- economy -----
export const marketShare = st => B.marketShareFloor + (1 - B.marketShareFloor) * clamp(st.rep, 0, 100) / 100;
export function playerProgress(st) {
  const frac = st.phase === 'training' || st.phase === 'over' && st.over?.win ? 1 : Math.min(1, st.rd / st.rdNeed);
  return st.gen - 1 + frac;
}
export const rivalAhead = st => st.rival > playerProgress(st);
export const extValueMult = st => marketShare(st) * (rivalAhead(st) ? B.rivalPenalty : 1) * mod(st, 'extValue') * mod(st, 'income');

// ----- misalignment estimate shown to the player -----
export function misalignmentEstimate(st) {
  const err = B.errBase / Math.sqrt(1 + 0.5 * Math.max(0, st.evidence));
  const est = clamp(st.m + st.mBias * err * 0.8, 0, 1);
  return { est, err };
}

// ----- ramp counters -----
export function realTasksPerSec(st) {
  const g = genDef(st);
  if (st.phase !== 'play') return 0;
  return g.rate * g.bundle * (mod(st, 'extSpawn') + mod(st, 'intSpawn'));
}
export const humanEquivalents = st => realTasksPerSec(st) * B.hreSecondsPerTask;
export const humanSeenFrac = st => st.genStats.realTotal ? st.genStats.realSeen / st.genStats.realTotal : 1;
