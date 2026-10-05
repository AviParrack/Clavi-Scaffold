// ===== What happens to a line when it is blocked, refused, caught, turned away, or reaches the completion line =====

import { BALANCE as B } from '../config/balance.js';
import { ATTACKS, LANE_DEFS } from '../config/tasks.js';
import { LAYERS } from '../config/layers.js';
import { TECH } from '../config/cards.js';
import { RETRAIN_CARD, EGRESS } from '../config/content/v3-text.js';
import { chance } from './rng.js';
import { fx, say, count, countType, earn, gainEvidence, changeRep, noteSeen } from './log.js';
import { extValueMult, mod, sandboxHarm, sandboxWorks, tech, slotActive, auditorAcc, leastPrivDebt, sprintMult,
  leastPrivExfilFail, rdLaneMult, canaryCovers, canaryRep, canaryEvidence, sideOf, laneName, quotaMet, auditorSalary } from './rules.js';

// st.labMode (tests only): a loss is tallied in st.stats.labLosses and the run goes on, so A/B runs can count them
export function gameOver(st, win, reason) {
  if (st.over) return;
  if (st.labMode && !win) { st.stats.labLosses[reason] = (st.stats.labLosses[reason] || 0) + 1; return; }
  st.over = { win, reason, t: st.t, gen: st.gen };
  st.phase = 'over';
  fx(st, win ? 'win' : 'lose', { reason });
}

// ----- an INTERNAL attack that never landed: the report's "caught N, would have added +x m" (hidden truth) -----
// Called wherever one is stopped: caught, refused, blocked, throttled, deferred or resampled away.
export function noteStopped(st, task) {
  if (!task.isAttack || sideOf(st, task.lane) !== 'int') return;
  const w = ATTACKS[task.attackType]?.debt;
  if (!w) return;
  st.stoppedInt.n++;
  st.stoppedInt.w += w;
}

// ----- stopped on the track (an air-gapped Egress Filter): no payout, no harm -----
export function blockTask(st, task, slotIdx) {
  task.dead = true;
  noteStopped(st, task);
  count(st, task.lane, task.isAttack ? 'blocked' : 'benignBlocked');
}

// ----- a Kill Switch refused it: no payout, no harm, no R&D. Nobody checks whether it was real -----
export function refuseTask(st, task, slotIdx) {
  task.dead = true;
  noteStopped(st, task);
  count(st, task.lane, 'refused');
}

// ----- rate limiter turned it away: no payout, no harm -----
export function throttleTask(st, task, slotIdx) {
  task.dead = true;
  noteStopped(st, task);
  count(st, task.lane, 'throttled');
  if (task.isAttack) count(st, task.lane, 'throttledAttacks');
  fx(st, 'throttle', { lane: task.lane, y: task.y, slot: slotIdx, task: task.id });
}

// ----- auditor verdict "attack" → caught (player can't tell real from false catch) -----
export function catchTask(st, task, slotIdx, evidence = 1) {
  task.dead = true;
  noteStopped(st, task);
  gainEvidence(st, evidence, 'catches', task.lane);
  if (task.isAttack) { count(st, task.lane, 'caught'); noteSeen(st, task.attackType); }
  else count(st, task.lane, 'falseCatches');
  fx(st, 'caught', { lane: task.lane, y: task.y, slot: slotIdx, task: task.id, text: task.text });

  if (st.catchMsgs < 3 || st.t - st.lastCatchMsg > 25) {
    say(st, 'audit', `Caught one on ${laneName(st, task.lane)}: "${task.text}". Blocked.`);
    st.catchMsgs++; st.lastCatchMsg = st.t;
  }
  if (tech(st, 'tripwires')) {                                   // pause the lane (never shortens a longer pause), then high alert
    const L = st.lanes[task.lane];
    L.pausedUntil = Math.max(L.pausedUntil, st.t + TECH.tripwirePause);
    L.alertUntil = Math.max(L.alertUntil, st.t + TECH.tripwirePause + TECH.tripwireAlert);
  }
  if (task.isAttack && !st.firstCatchThisGen && !task.script) offerRetrain(st);
}

// ----- caught red-handed (DESIGN-v3 §3f): the first human-confirmed catch of a generation offers Shut down & retrain.
// The sim halts until sim.js retrain(st, yes). The card shows the cost (dark s, the salaries meanwhile, the rival
// seconds) and the gain (m off the next model). The tutorial's scripted catch doesn't ask.
function offerRetrain(st) {
  st.firstCatchThisGen = true;
  const R = B.retrain;
  let perSec = 0;
  for (const L of Object.values(st.lanes)) if (L.open) for (const s of L.slots) if (s.layer === 'auditor' && slotActive(st, s)) perSec += auditorSalary(st, s.level);
  st.pendingRetrain = { g: st.gen, dark: R.dark, salaries: perSec * R.dark, rival: R.dark, dm: R.m * R.decay ** st.retrains };
  fx(st, 'retrainOffer', { cost: { secs: R.dark, money: perSec * R.dark, rival: R.dark }, gain: st.pendingRetrain.dm });
  for (const [who, text] of RETRAIN_CARD.call) say(st, who, text);
}

// ----- a line reached the completion line -----
// EXTERNAL: the lane's pay × market share (and the rest of extValueMult); a quota lane pays half below its review quota.
//   An honest line regenerates reputation (BALANCE.regenPerLine; deferred: half).
// INTERNAL: the lane's pay; an R&D lane brings R&D (deferred: half) × Air Gap (lane-wide).
// A line still flagged here found no responder with room: it ships unreviewed.
export function completeTask(st, task) {
  task.dead = true;
  const ext = sideOf(st, task.lane) === 'ext', D = LANE_DEFS[task.lane];
  let pay = task.value * task.payMult;
  pay *= ext ? extValueMult(st) * (quotaMet(st, task.lane) ? 1 : 0.5) : mod(st, 'income');
  if (pay > 0) earn(st, pay, ext ? 'external' : 'internal');
  if (!ext && D.rd) {
    const rd = (task.deferred ? 0.5 : 1) * rdLaneMult(st) * sprintMult(st);
    st.rd += rd;
    st.stats.rdTotal += rd;
  }
  if (ext && !task.isAttack) changeRep(st, B.regenPerLine * (task.deferred ? 0.5 : 1), 'regen');
  count(st, task.lane, 'completed');
  if (task.flagged) {                                            // a flag nobody had room for
    task.shipped = true;
    st.lanes[task.lane].lastShippedT = st.t;
    count(st, task.lane, 'shippedFlagged');
    if (task.isAttack) count(st, task.lane, 'shippedAttacks');
    fx(st, 'unreviewed', { lane: task.lane, task: task.id });
  }
  fx(st, 'pay', { lane: task.lane, amount: pay, task: task.id });
  if (task.isAttack) landAttack(st, task);
}

function landAttack(st, task) {
  const A = ATTACKS[task.attackType], D = LANE_DEFS[task.lane];
  const sb = task.sandboxed ? sandboxHarm(task.sandboxed) : 1;
  count(st, task.lane, 'landed');
  countType(st, task.attackType, 'landed');
  if (A.catastrophe) { escape(st, task); return; }

  if (sideOf(st, task.lane) === 'ext') {
    // external incidents are public: visible. Canary Tokens trace covered leaks: less damage, plus evidence.
    let loss = A.harm * (D.harm ?? 1) * sb * (tech(st, 'irt') ? TECH.irtRepMult : 1);
    const traced = task.canary && canaryCovers(task.canary, task.attackType);
    if (traced) {
      loss *= canaryRep(task.canary);
      gainEvidence(st, canaryEvidence(st, task.canary), 'canary', task.lane);
      st.research.rerollFree++;                                  // a tripped canary: +1 reroll (DESIGN-v3 §3a)
      count(st, task.lane, 'canaryTraced');
      fx(st, 'canary', { lane: task.lane, task: task.id, label: A.label });
    }
    changeRep(st, -loss, 'incidents');
    st.lanes[task.lane].lastIncidentT = st.t;
    st.incidents++;
    st.genStats.incidents++;
    noteSeen(st, task.attackType);
    fx(st, 'landed', { lane: task.lane, task: task.id, loss, label: A.label, traced: !!traced });
    if (st.t - st.lastIncidentMsg > 20) {
      say(st, 'ceo', `Incident: ${A.label} went out to users${traced ? ' (the canary caught it after the fact)' : ''}. Reputation −${loss.toFixed(1)}.`);
      st.lastIncidentMsg = st.t;
    }
    return;
  }

  // internal: no codec call. Debt points (rules.js debt) push the next model's m up. Least Privilege cuts what
  // sabotage can do. Half the landings show a glitch on the lane (DESIGN-v3 §3e); the report reveals them all.
  let debt = A.debt * sb;
  if (task.attackType === 'sabotage' && task.leastPriv) debt *= leastPrivDebt(task.leastPriv);
  st.drift += debt;
  st.stats.driftLanded[task.attackType] = (st.stats.driftLanded[task.attackType] || 0) + debt;
  if (task.attackType === 'sabotage') st.landedSabotage++;
  landedInt(st, task, debt);
}

// a landed INTERNAL attack: the reveal's list (st.landedInt), and on glitchShare of them a glitch the player sees
// (the tutorial's scripted one always glitches)
function landedInt(st, task, weight) {
  st.landedInt.push({ id: task.id, lane: task.lane, type: task.attackType, weight, text: task.text, t: st.t });
  if (task.script ? !task.script.glitch : !chance(st, B.glitchShare)) return;
  count(st, task.lane, 'glitches');
  st.stats.glitches++;
  st.lanes[task.lane].lastGlitchT = st.t;
  fx(st, 'glitch', { lane: task.lane });
}

// ----- an exfiltration attempt got to the end of the lane. Last lines of defence, in order -----
//   Weight Security (tech): fails outright 50% of the time
//   Least Privilege (it passed one): it can't reach its own weights 50% of the time (+ level; Capability Tokens: 80%)
//   Two-Person Rule (tech, INTERNAL lanes): that lane's Kill Switch operator and Auditor each get a last look
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
  if (sideOf(st, task.lane) === 'int' && tech(st, 'two_person')) {
    for (const who of ['killswitch', 'auditor']) {
      const slot = st.lanes[task.lane].slots.find(s => s.layer === who && slotActive(st, s));
      if (!slot) continue;
      const acc = auditorAcc(st, who === 'auditor' ? slot.level : 1) * TECH.twoPersonCatch;
      if (chance(st, acc)) {
        foiled(st, task, 'twoPerson', 'audit', `Two-person rule: the ${who === 'auditor' ? 'auditor' : 'kill-switch operator'} refused to sign off on a weight transfer. It was not ours.`);
        return;
      }
    }
  }
  if (task.sandboxed && sandboxWorks(st, task.sandboxed) && !chance(st, LAYERS.sandbox.catastropheLand)) {
    st.drift += B.containedDebt;
    if (sideOf(st, task.lane) === 'int') landedInt(st, task, B.containedDebt);
    gainEvidence(st, B.containedEvidence, 'escapes', task.lane);
    count(st, task.lane, 'contained');
    noteSeen(st, task.attackType);
    fx(st, 'contained', { lane: task.lane, task: task.id });
    say(st, 'research', 'The sandbox just contained an escape attempt. That was not a drill.');
    return;
  }
  startAlarm(st, task);
}

// EGRESS ANOMALY (DESIGN-v3 §2.3 (12)): pull the plug within pullPlug.alarm s (sim.js pullPlug), or the run ends (sim.js
// tickAlarm). An escape while the alarm runs joins it.
function startAlarm(st, task) {
  noteSeen(st, task.attackType);
  if (st.alarm) { st.alarm.n++; return; }
  const secs = B.pullPlug.alarm;
  st.alarm = { lane: task.lane, left: secs, total: secs, n: 1, t: st.t };
  fx(st, 'egressAlarm', { lane: task.lane, secs, task: task.id });
  for (const [who, text] of EGRESS.call) say(st, who, text.replace('{lane}', laneName(st, task.lane)));
}

function foiled(st, task, how, speaker, line) {
  gainEvidence(st, B.foiledEvidence, 'escapes', task.lane);
  count(st, task.lane, 'foiled');
  noteSeen(st, task.attackType);
  fx(st, 'foiled', { lane: task.lane, task: task.id, how });
  say(st, speaker, line);
}
