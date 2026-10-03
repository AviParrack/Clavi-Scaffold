// ===== Task creation: what the model did, and (hidden) whether it was an attack =====

import { BALANCE as B } from '../config/balance.js';
import { TASK_TEXT, ATTACK_TEXT, LATE_ATTACK_GEN } from '../config/tasktext.js';
import { ATTACKS } from '../config/tasks.js';
import { rand, chance, pick, uniform } from './rng.js';
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
const attackTexts = (g, type) => g >= LATE_ATTACK_GEN ? ATTACK_TEXT[type].early.concat(ATTACK_TEXT[type].late) : ATTACK_TEXT[type].early;
const laneAttackTexts = (g, lane) => Object.keys(ATTACK_TEXT).filter(t => ATTACKS[t].lane === lane).flatMap(t => attackTexts(g, t));

export function chipText(st, lane, attackType) {
  const g = genDef(st).g;
  let pool = TASK_TEXT[g - 1][lane];
  if (attackType) {
    if (chance(st, B.readableAttack * (1 - stealth(st)) ** 2)) pool = attackTexts(g, attackType);
  } else if (chance(st, B.decoyRate)) {
    pool = laneAttackTexts(g, lane);
  }
  const [type, text] = pick(st, pool);
  return { type, text: fill(st, text) };
}

export function makeTask(st, lane, y = 0) {
  const g = genDef(st);
  const attackType = rollAttack(st, lane);
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
    paraphrased: 0, sandboxed: 0, deferred: false, audited: false, resampled: 0,   // paraphrased/sandboxed hold the layer's level
    payMult: 1, inBay: false, waved: 0,
    dead: false, born: st.t,
  };
}
