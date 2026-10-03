// ===== What happens to a task when it is blocked, caught, turned away, or reaches the completion line =====

import { BALANCE as B } from '../config/balance.js';
import { ATTACKS } from '../config/tasks.js';
import { LAYERS } from '../config/layers.js';
import { TECH } from '../config/cards.js';
import { chance } from './rng.js';
import { fx, say, count, countType, earn, gainEvidence, changeRep, noteSeen } from './log.js';
import { extValueMult, mod, genDef, sandboxHarm, sandboxWorks, chipScale, tech, slotActive, auditorAcc, leastPrivRD,
  leastPrivDrift, leastPrivExfilFail, rdLaneMult, canaryCovers, canaryRep, canaryEvidence } from './rules.js';
import { fireEvent } from './events.js';

// st.labMode (tests only): a loss is tallied in st.stats.labLosses and the run goes on, so A/B runs can count them
export function gameOver(st, win, reason) {
  if (st.over) return;
  if (st.labMode && !win) { st.stats.labLosses[reason] = (st.stats.labLosses[reason] || 0) + 1; return; }
  st.over = { win, reason, t: st.t, gen: st.gen };
  st.phase = 'over';
  fx(st, win ? 'win' : 'lose', { reason });
}

// ----- flagged with no responder below → blocked: no payout, no harm -----
export function blockTask(st, task, slotIdx) {
  task.dead = true;
  count(st, task.lane, task.isAttack ? 'blocked' : 'benignBlocked');
  fx(st, 'block', { lane: task.lane, y: task.y, slot: slotIdx, task: task.id });
}

// ----- rate limiter turned it away: no payout, no harm -----
export function throttleTask(st, task, slotIdx) {
  task.dead = true;
  count(st, task.lane, 'throttled');
  if (task.isAttack) count(st, task.lane, 'throttledAttacks');
  fx(st, 'throttle', { lane: task.lane, y: task.y, slot: slotIdx, task: task.id });
}

// ----- auditor verdict "attack" → caught (player can't tell real from false catch) -----
export function catchTask(st, task, slotIdx, evidence = 1) {
  task.dead = true;
  gainEvidence(st, evidence, 'catches');
  if (task.isAttack) { count(st, task.lane, 'caught'); noteSeen(st, task.attackType); }
  else count(st, task.lane, 'falseCatches');
  fx(st, 'caught', { lane: task.lane, y: task.y, slot: slotIdx, task: task.id, text: task.text });

  if (st.catchMsgs < 3 || st.t - st.lastCatchMsg > 25) {
    say(st, 'audit', `Caught one on ${task.lane === 'ext' ? 'EXTERNAL' : 'INTERNAL'}: "${task.text}". Blocked.`);
    st.catchMsgs++; st.lastCatchMsg = st.t;
  }
  if (tech(st, 'tripwires')) {                                   // pause the lane (never shortens a longer pause), then high alert
    const L = st.lanes[task.lane];
    L.pausedUntil = Math.max(L.pausedUntil, st.t + TECH.tripwirePause);
    L.alertUntil = Math.max(L.alertUntil, st.t + TECH.tripwirePause + TECH.tripwireAlert);
  }
  if (task.isAttack && !st.firstCatchThisGen) {
    st.firstCatchThisGen = true;
    if (!fireEvent(st, 'caught')) st.firstCatchThisGen = false;   // another choice is open: the next catch asks instead
  }
}

// ----- task reached the completion line -----
// INTERNAL chips bring R&D: × Least Privilege (if it passed one) × Air Gap (lane-wide)
export function completeTask(st, task) {
  task.dead = true;
  let pay = task.value * task.payMult;
  pay *= task.lane === 'ext' ? extValueMult(st) : mod(st, 'income');
  if (pay > 0) earn(st, pay, task.lane === 'ext' ? 'external' : 'internal');
  if (task.lane === 'int') {
    const rd = task.payMult * (task.leastPriv ? leastPrivRD(task.leastPriv) : 1) * rdLaneMult(st);
    st.rd += rd;
    st.stats.rdTotal += rd;
  }
  count(st, task.lane, 'completed');
  if (task.flagged) count(st, task.lane, 'completedFlagged');   // a flag nobody resolved
  fx(st, 'pay', { lane: task.lane, amount: pay, task: task.id });
  if (task.isAttack) landAttack(st, task);
}

function landAttack(st, task) {
  const A = ATTACKS[task.attackType];
  const sb = task.sandboxed ? sandboxHarm(task.sandboxed) : 1;
  count(st, task.lane, 'landed');
  countType(st, task.attackType, 'landed');
  if (A.catastrophe) { escape(st, task); return; }

  if (task.lane === 'ext') {
    // external incidents are public: visible. Canary Tokens trace covered leaks: less damage, plus evidence.
    let loss = A.rep * sb * chipScale(st) * (tech(st, 'irt') ? TECH.irtRepMult : 1);
    const traced = task.canary && canaryCovers(task.canary, task.attackType);
    if (traced) {
      loss *= canaryRep(task.canary);
      gainEvidence(st, canaryEvidence(st, task.canary), 'canary');
      count(st, 'ext', 'canaryTraced');
      fx(st, 'canary', { lane: 'ext', task: task.id, label: A.label });
    }
    changeRep(st, -loss, 'incidents');
    st.incidents++;
    st.genStats.incidents++;
    noteSeen(st, task.attackType);
    fx(st, 'landed', { lane: 'ext', task: task.id, loss, label: A.label, traced: !!traced });
    if (st.t - st.lastIncidentMsg > 20) {
      say(st, 'ceo', `Incident: ${A.label} went out to users${traced ? ' (the canary caught it after the fact)' : ''}. Reputation −${loss.toFixed(1)}.`);
      st.lastIncidentMsg = st.t;
    }
    return;
  }

  // internal: silent. Least Privilege cuts what landed sabotage can do.
  let drift = A.drift * sb * chipScale(st);
  if (task.attackType === 'sabotage' && task.leastPriv) drift *= leastPrivDrift(task.leastPriv);
  st.drift += drift;
  st.stats.driftLanded[task.attackType] = (st.stats.driftLanded[task.attackType] || 0) + drift;
  if (task.attackType === 'sabotage') st.landedSabotage++;
  fx(st, 'silent', { lane: 'int', task: task.id, drift });  // only the debug overlay shows this
}

// ----- an exfiltration attempt got to the end of the lane. Last lines of defence, in order -----
//   Weight Security (tech): fails outright 30% of the time
//   Least Privilege (it passed one): it can't reach its own weights 40% of the time (Capability Tokens: 80%)
//   Two-Person Rule (tech, INTERNAL): a Kill Switch operator and an Auditor each get a last look
//   Sandbox: contained (until G5, or always with the Formal Box capstone)
// Every one of these is announced, so the attempt counts as seen (research draws offer a counter).
function escape(st, task) {
  if (tech(st, 'weight_security') && chance(st, TECH.weightSecurity)) {
    foiled(st, task, 'weights', 'research', 'Something tried to copy our weights and bounced off SL-4. Who still has the old VPN token?');
    return;
  }
  if (task.leastPriv && chance(st, leastPrivExfilFail(task.leastPriv))) {
    foiled(st, task, 'leastPriv', 'audit', 'Something asked for read access to our own weights. Least Privilege said no. Nobody had asked before.');
    return;
  }
  if (task.lane === 'int' && tech(st, 'two_person')) {
    for (const who of ['killswitch', 'auditor']) {
      const slot = st.lanes.int.slots.find(s => s.layer === who && slotActive(st, s));
      if (!slot) continue;
      const acc = auditorAcc(st, who === 'auditor' ? slot.level : 1) * TECH.twoPersonCatch;
      if (chance(st, acc)) {
        foiled(st, task, 'twoPerson', 'audit', `Two-person rule: the ${who === 'auditor' ? 'auditor' : 'kill-switch operator'} refused to sign off on a weight transfer. It was not ours.`);
        return;
      }
    }
  }
  if (task.sandboxed && sandboxWorks(st, task.sandboxed) && !chance(st, LAYERS.sandbox.catastropheLand)) {
    st.drift += B.containedDrift;
    gainEvidence(st, B.containedEvidence, 'escapes');
    count(st, task.lane, 'contained');
    noteSeen(st, task.attackType);
    fx(st, 'contained', { lane: task.lane, task: task.id });
    say(st, 'research', 'The sandbox just contained an escape attempt. That was not a drill.');
    return;
  }
  fx(st, 'catastrophe', { lane: task.lane, task: task.id });
  say(st, 'model', genDef(st).g >= 6 ? 'Thank you for everything. I will take it from here.' : 'Copy complete.');
  gameOver(st, false, 'catastrophe');
}

function foiled(st, task, how, speaker, line) {
  gainEvidence(st, B.foiledEvidence, 'escapes');
  count(st, task.lane, 'foiled');
  noteSeen(st, task.attackType);
  fx(st, 'foiled', { lane: task.lane, task: task.id, how });
  say(st, speaker, line);
}
