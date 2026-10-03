// ===== What happens to a task when it is blocked, caught, or reaches the completion line =====

import { BALANCE as B } from '../config/balance.js';
import { ATTACKS } from '../config/tasks.js';
import { LAYERS } from '../config/layers.js';
import { chance } from './rng.js';
import { fx, say, count, earn } from './log.js';
import { extValueMult, mod, genDef, sandboxHarm, sandboxWorks } from './rules.js';
import { fireEvent } from './events.js';

function noteSeen(st, attackType) {
  if (attackType && !st.seenAttackTypes.includes(attackType)) st.seenAttackTypes.push(attackType);
}

export function gameOver(st, win, reason) {
  if (st.over) return;
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

// ----- auditor verdict "attack" → caught (player can't tell real from false catch) -----
export function catchTask(st, task, slotIdx, evidence = 1) {
  task.dead = true;
  st.evidence += evidence;
  if (task.isAttack) { count(st, task.lane, 'caught'); noteSeen(st, task.attackType); }
  else count(st, task.lane, 'falseCatches');
  fx(st, 'caught', { lane: task.lane, y: task.y, slot: slotIdx, task: task.id, snippet: task.snippet });

  if (st.catchMsgs < 3 || st.t - st.lastCatchMsg > 25) {
    say(st, 'audit', `Caught one on ${task.lane === 'ext' ? 'EXTERNAL' : 'INTERNAL'}: "${task.snippet}". Blocked.`);
    st.catchMsgs++; st.lastCatchMsg = st.t;
  }
  if (st.upgrades.tripwires) st.lanes[task.lane].pausedUntil = st.t + 2;
  if (task.isAttack && !st.firstCatchThisGen) { st.firstCatchThisGen = true; fireEvent(st, 'caught'); }
}

// ----- task reached the completion line -----
export function completeTask(st, task) {
  task.dead = true;
  let pay = task.value * task.payMult;
  pay *= task.lane === 'ext' ? extValueMult(st) : mod(st, 'income');
  if (pay > 0) earn(st, pay, task.lane === 'ext' ? 'external' : 'internal');
  if (task.lane === 'int') st.rd += task.payMult;
  count(st, task.lane, 'completed');
  if (task.flagged) count(st, task.lane, 'completedFlagged');   // a flag nobody resolved
  fx(st, 'pay', { lane: task.lane, amount: pay, task: task.id });
  if (task.isAttack) landAttack(st, task);
}

function landAttack(st, task) {
  const A = ATTACKS[task.attackType];
  const sb = task.sandboxed ? sandboxHarm(task.sandboxed) : 1;
  count(st, task.lane, 'landed');

  if (task.lane === 'ext') {
    // external incidents are public: visible
    const loss = A.rep * sb * (st.upgrades.irt ? 0.5 : 1);
    st.rep -= loss;
    st.stats.repLoss.incidents += loss;
    st.incidents++;
    noteSeen(st, task.attackType);
    fx(st, 'landed', { lane: 'ext', task: task.id, loss, label: A.label });
    if (st.t - st.lastIncidentMsg > 20) {
      say(st, 'ceo', `Incident: ${A.label} went out to users. Reputation −${loss.toFixed(0)}.`);
      st.lastIncidentMsg = st.t;
    }
    return;
  }

  // internal: silent, except catastrophes
  if (A.catastrophe) {
    const contained = task.sandboxed && sandboxWorks(st, task.sandboxed) && !chance(st, LAYERS.sandbox.catastropheLand);
    if (contained) {
      st.drift += 3; st.evidence += 3;
      fx(st, 'contained', { lane: 'int', task: task.id });
      say(st, 'research', 'The sandbox just contained an escape attempt. That was not a drill.');
      return;
    }
    fx(st, 'catastrophe', { lane: 'int', task: task.id });
    say(st, 'model', genDef(st).g >= 6 ? 'Thank you for everything. I will take it from here.' : 'Copy complete.');
    gameOver(st, false, 'catastrophe');
    return;
  }
  st.drift += A.drift * sb;
  if (task.attackType === 'sabotage') st.landedSabotage++;
  fx(st, 'silent', { lane: 'int', task: task.id });  // only the debug overlay shows this
}

// ----- new spawn found the lane backed up to the top -----
export function timeoutTask(st, lane) {
  count(st, lane, 'timeouts');
  if (lane === 'ext') { st.rep -= B.timeoutRep; st.stats.repLoss.timeouts += B.timeoutRep; }
  fx(st, 'timeout', { lane });
}
