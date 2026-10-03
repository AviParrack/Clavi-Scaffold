// ===== Derived numbers a player may know: the spec sheet, and what a compute split yields =====
// Built from state plus the sim's exported rules helpers, so the sim stays untouched. Never the hidden truth
// (design/UI-PLAN.md §6): no st.m, no traits, no collusion. elementStats().catch includes all three, so plates,
// hover cards and the upgrade panel show specCatch() instead.

import { LAYERS } from '../config/layers.js';
import { BALANCE as B } from '../config/balance.js';
import * as R from '../sim/rules.js';

const clamp01 = x => Math.max(0, Math.min(1, x));

// =================== spec sheet ===================

// catch per read: TPR after upgrades, research and events (not traits), × the generation's published stealth
// (user-only detectors skip it: stealth hides the model's attacks, not a user's jailbreak), × read quality.
export function specCatch(st, id, level = 1, lane = null) {
  const nominal = R.nominalTPR(st, id, level, lane) - R.traitTPRPlus(st, id);
  const types = LAYERS[id].catches;
  const stealth = types && types.every(R.userAttack) ? 1 : 1 - R.genDef(st).stealth / 2;
  return clamp01(nominal * stealth) * R.readQuality(st, R.elementLatency(st, id, level));
}

// auditor: coverage × accuracy. The AI-Assisted Audit capstone is capped by the model's honesty, which is hidden:
// the sheet shows the cap itself.
export function specAudit(st, level = 1) {
  const cap = R.capstone('auditor', level).honestyCap;
  return R.auditCoverage(st, R.bundle(st), level) * (cap || R.auditorAcc(st, level));
}

// =================== compute split → per-second yields ===================
// { cash, cashInt, rd, rdPct, evidence }: cash from EXTERNAL (Product), cashInt from INTERNAL, R&D and its % of
// this model's bar per second (Capabilities), evidence per second (Safety + the Interp Lab). Zero outside play.
// Mirrors sim.js step(): laneRate × pay × extValueMult, completeTask's R&D, safetyResearch and interpLab.

export function splitRates(st, split = st.split) {
  if (st.phase !== 'play') return { cash: 0, cashInt: 0, rd: 0, rdPct: 0, evidence: 0 };
  const total = R.compute(st);
  const ext = total * split.product * R.mod(st, 'extSpawn');
  const int = total * split.capabilities * R.mod(st, 'intSpawn');
  const lab = R.globalSlot(st, 'interp');
  const rd = int * R.rdLaneMult(st);
  return {
    cash: ext * B.extValue * R.chipWorth(st) * R.extValueMult(st),
    cashInt: int * B.intValue * R.chipWorth(st) * R.mod(st, 'income'),
    rd,
    rdPct: 100 * rd / Math.max(1, st.rdNeed),
    evidence: B.safetyEvidence * split.safety + (lab ? R.interpEvidence(lab.level) : 0),
  };
}
