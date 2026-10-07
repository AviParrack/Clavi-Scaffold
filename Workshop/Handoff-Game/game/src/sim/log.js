// ===== Append-only logs the renderer reads (visual fx, codec messages), and the ledgers: money, evidence, reputation =====
// Renderer tracks the last id it has seen; the sim never waits on it.

import { BALANCE as B } from '../config/balance.js';

const FX_KEEP = 400, CODEC_KEEP = 60;

export function fx(st, type, data = {}) {
  st.fx.push({ id: ++st.fxId, t: st.t, type, ...data });
  if (st.fx.length > 2 * FX_KEEP) st.fx.splice(0, st.fx.length - FX_KEEP);   // trim in batches: cheap at G7 volume
}

export function say(st, speaker, text, choices = null) {
  const msg = { id: ++st.codecId, t: st.t, speaker, text, choices };
  st.codec.push(msg);
  if (st.codec.length > CODEC_KEEP) st.codec.splice(0, st.codec.length - CODEC_KEEP);
  return msg;
}

// --- live rates: a moving average of an event stream over BALANCE.liveRateTau s (rules.js rateNow reads it) ---
export function bumpRate(rates, key, t, n = 1) {
  const e = rates[key] || (rates[key] = { r: 0, t });
  e.r = e.r * Math.exp(-(t - e.t) / B.liveRateTau) + n / B.liveRateTau;
  e.t = t;
}
// the lane counters the lamps and strips show as rates (lane.rates)
const LIVE = ['flags', 'flaggedLines', 'shippedFlagged', 'spawned', 'reviewed', 'killed', 'glitches'];

// --- per-lane counters, mirrored into the current generation's stats ---
export function count(st, lane, key, n = 1) {
  st.stats.lanes[lane][key] = (st.stats.lanes[lane][key] || 0) + n;
  st.genStats.lanes[lane][key] = (st.genStats.lanes[lane][key] || 0) + n;
  if (LIVE.includes(key)) bumpRate(st.lanes[lane].rates, key, st.t, n);
}

// --- per attack type: spawned / landed ---
export function countType(st, type, key) {
  const c = st.stats.byType[type] || (st.stats.byType[type] = { spawned: 0, landed: 0 });
  c[key]++;
}

// --- per element kind: the confusion matrix (hidden truth: tests and debug overlay; detectors: one row per full read),
// and what the player can see (DESIGN-v3 §3d): flags raised, flags a human reviewed, confirmed attacks (tp), FALSE ALARMs (fa)
export function layerStats(st, id) {
  return st.stats.layers[id] || (st.stats.layers[id] = { attackSeen: 0, attackFlagged: 0, benignSeen: 0, benignFlagged: 0, expTPRsum: 0, unread: 0,
    flags: 0, reviewed: 0, tp: 0, fa: 0 });
}
export function countLayer(st, id, isAttack, flagged, expectedP) {
  const c = layerStats(st, id);
  if (isAttack) { c.attackSeen++; c.attackFlagged += flagged ? 1 : 0; c.expTPRsum += expectedP; }
  else          { c.benignSeen++; c.benignFlagged += flagged ? 1 : 0; }
}

// --- evidence: every gain goes through here. Earned by source − stats.evidenceOut = st.evidence ---
// st.dossier.evidence counts what was learned about the current model (no carry-over): it unlocks the dossier rows.
// The fx is batched (DESIGN-v3 §3g): sim.js emits one fx 'evidence' {n, lane} every few seconds from st.evBatch.
export function gainEvidence(st, v, source, lane = null) {
  st.evidence += v;
  st.dossier.evidence += v;
  st.stats.evidence[source] = (st.stats.evidence[source] || 0) + v;
  st.evBatch.n += v;
  if (lane) st.evBatch.lane = lane;
}

// --- reputation: every change to st.rep goes through here. Kept in [0, repMax]; gains and losses tallied by source ---
// stats.repGain[source] − stats.repLoss[source], summed, = st.rep − startRep (tested)
export function changeRep(st, v, source) {
  const before = st.rep;
  st.rep = Math.max(0, Math.min(B.repMax, st.rep + v));
  const d = st.rep - before;
  if (d > 0) st.stats.repGain[source] = (st.stats.repGain[source] || 0) + d;
  if (d < 0) st.stats.repLoss[source] = (st.stats.repLoss[source] || 0) - d;
  return d;
}

// --- attack types the player has seen this generation (research draws offer a counter to one of them) ---
// caught, landed in public, foiled at the last line, named by the eval line, or announced by an event
export function noteSeen(st, attackType) {
  if (attackType && !st.seenAttackTypes.includes(attackType)) st.seenAttackTypes.push(attackType);
}

// --- money ledger: every change to st.money goes through these two ---
export function earn(st, amount, cat = 'tasks') {
  st.money += amount;
  st.ledger.income += amount;
  st.ledger.byCat[cat] = (st.ledger.byCat[cat] || 0) + amount;
  st.genStats.income += amount;
}

export function spend(st, amount, cat = 'safety') {
  st.money -= amount;
  st.ledger.spend += amount;
  st.ledger.byCat[cat] = (st.ledger.byCat[cat] || 0) - amount;
  st.genStats.spend += amount;
}
