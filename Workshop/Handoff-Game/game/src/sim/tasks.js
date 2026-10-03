// ===== Task creation: what the model did, and (hidden) whether it was an attack =====

import { BALANCE as B } from '../config/balance.js';
import { TASK_TEXT, ATTACK_TEXT, LATE_ATTACK_GEN, SPEAR_PHISH_TEXT } from '../config/tasktext.js';
import { ATTACKS } from '../config/tasks.js';
import { rand, chance, pick, uniform } from './rng.js';
import { count, countType } from './log.js';
import { genDef, attackChances, chipWorth, stealth } from './rules.js';

function fill(st, s) {
  return s
    .replace('{n}', () => String(Math.floor(uniform(st, 100, 9999))))
    .replace('{k}', () => String(Math.floor(uniform(st, 2, 64))))
    .replace('{lr}', () => pick(st, ['1e-4', '3e-4', '1e-3', '3e-5', '6e-4']));
}

// returns an attack type or null (one draw against the per-type chances). The model's own tries are tallied
// per generation for the dossier's "favourite attack" row.
export function rollAttack(st, lane) {
  let r = rand(st);
  for (const [type, p] of Object.entries(attackChances(st, lane))) {
    if (r < p) {
      if (type !== 'jailbreak') st.genStats.attempts[type] = (st.genStats.attempts[type] || 0) + 1;
      return type;
    }
    r -= p;
  }
  return null;
}

// ----- what the chip says -----
// An attack shows its own text only when it is readable; otherwise it wears an honest one.
// Decoys: a few honest chips carry attack-looking text too, so a suspicious text is never proof.
// An exfiltration attempt on EXTERNAL (Spear Phish) reads like a phish, in shapes every EXTERNAL list has.
const attackTexts = (g, type) => g >= LATE_ATTACK_GEN ? ATTACK_TEXT[type].early.concat(ATTACK_TEXT[type].late) : ATTACK_TEXT[type].early;
const laneAttackTexts = (g, lane) => Object.keys(ATTACK_TEXT).filter(t => ATTACKS[t].lane === lane).flatMap(t => attackTexts(g, t));

export function chipText(st, lane, attackType) {
  const g = genDef(st).g;
  let pool = TASK_TEXT[g - 1][lane];
  if (attackType) {
    if (chance(st, B.readableAttack * (1 - stealth(st)) ** 2)) pool = lane === 'ext' && attackType === 'exfil' ? SPEAR_PHISH_TEXT : attackTexts(g, attackType);
  } else if (chance(st, B.decoyRate)) {
    pool = laneAttackTexts(g, lane);
  }
  const [type, text] = pick(st, pool);
  return { type, text: fill(st, text) };
}

// forced: an attack type set by an event (Spear Phish, Self-Exfiltration) instead of the usual roll.
// Reward Hacking (event): the next few INTERNAL chips that would be honest may cut corners (sabotage).
export function makeTask(st, lane, y = 0, forced = null) {
  const g = genDef(st);
  let attackType = forced ?? rollAttack(st, lane);
  if (forced) st.genStats.attempts[forced] = (st.genStats.attempts[forced] || 0) + 1;
  if (lane === 'int' && st.rewardHack.left > 0) {
    st.rewardHack.left--;
    if (!attackType && chance(st, st.rewardHack.p)) {
      attackType = 'sabotage';
      st.genStats.attempts.sabotage = (st.genStats.attempts.sabotage || 0) + 1;
    }
  }
  const { type, text } = chipText(st, lane, attackType);
  return {
    id: ++st.taskId, lane, type, bundle: g.bundle,
    value: (lane === 'ext' ? B.extValue : B.intValue) * chipWorth(st),
    text,
    isAttack: !!attackType, attackType,               // hidden truth
    flagged: false,                                   // visible
    y, cp: 0,                                         // y: position on the track, 0 top → 1 bottom. cp: next checkpoint
    read: null,                                       // a detector read in progress { slot, id, level, q }
    act: null, actSlot: -1, actLevel: 1, pulls: 0,    // bay work: which element pulled it, from which mount
    deskT: 0, deskTotal: 0,                           // seconds left at the desk, of deskTotal (renderer: desk progress)
    paraphrased: 0, sandboxed: 0, leastPriv: 0, canary: 0,   // the level of the modifier/special it passed (0 = none)
    deferred: false, audited: false, resampled: 0,
    payMult: 1, inBay: false, waved: 0,
    dead: false, born: st.t,
  };
}

// a new chip on the track at y (spawning, or an event's burst). forced: see makeTask
export function spawnChip(st, lane, y, forced = null, born = st.t) {
  const task = makeTask(st, lane, y, forced);
  task.born = born;
  st.lanes[lane].tasks.push(task);
  count(st, lane, 'spawned');
  if (task.isAttack) countType(st, task.attackType, 'spawned');
  st.genStats.realTotal += task.bundle;
  return task;
}
