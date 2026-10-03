// ===== Derived quantities. Pure reads of state + config, no mutation. =====

import { BALANCE as B } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { LAYERS } from '../config/layers.js';

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

// ----- prices -----
export function layerCost(st, id) {
  let c = LAYERS[id].cost * bundle(st) * mod(st, 'cost');
  if (id === 'monitor' && st.upgrades.monitor_ensemble) c *= 1.5;
  return c;
}
export const buyPrice = (st, id) => LAYERS[id].buy * bundle(st);
export const researchPrice = st => B.researchBase * Math.pow(B.researchMult, st.researchCount) * bundle(st);

// ----- attacks -----
export const attackRate = st => B.attackBase + B.attackPerM * st.m;
export const stealthFactor = st => 1 - genDef(st).stealth / 2;

export function collusion(st, lane, task, id) {
  let c = 0;
  if (id === 'untrusted') c = Math.min(LAYERS.untrusted.collusionMax, LAYERS.untrusted.collusionPerM * st.m);
  if (id === 'monitor' && st.upgrades.promote_model) c = Math.min(LAYERS.untrusted.collusionMax, LAYERS.untrusted.collusionPerM * st.promotedM);
  if (task && task.paraphrased) c *= LAYERS.paraphraser.collusionMult;
  if (laneHas(st, lane, 'honeypot')) c *= LAYERS.honeypot.collusionMult;
  return c;
}

export function probeBaseTPR(st) {
  const L = LAYERS.probe;
  return Math.max(L.minTPR, L.tpr - L.decayPerGen * (st.gen - st.probe.trainedGen) - st.probe.shift);
}

export function monitorBaseTPR(st) {
  const base = st.upgrades.promote_model ? GENERATIONS[0].tmTPR : genDef(st).tmTPR;
  return Math.min(0.99, base + (st.upgrades.monitor_ensemble ? 0.10 : 0));
}

// chance a detector flags a real attack (task may be null for a lane-level estimate)
export function detectorTPR(st, lane, id, task = null) {
  let p = id === 'probe' ? probeBaseTPR(st) : id === 'monitor' ? monitorBaseTPR(st) : LAYERS[id].tpr;
  return clamp(p * stealthFactor(st) * (1 - collusion(st, lane, task, id)), 0, 1);
}

// ----- auditing -----
export const auditorCap = st => B.auditorCapacity * (st.upgrades.ai_auditing ? 10 : 1) * mod(st, 'auditorCap');
export const auditorAcc = st => st.upgrades.ai_auditing ? Math.min(0.95, 1 - st.m) : genDef(st).auditAcc;
export const auditCoverage = (st, b) => Math.min(1, auditorCap(st) / b);

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
