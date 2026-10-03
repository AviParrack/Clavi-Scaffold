// ===== Task creation: what the model did, and (hidden) whether it was an attack =====

import { BALANCE as B } from '../config/balance.js';
import { TASK_TYPES, LANE_TYPES, ATTACKS } from '../config/tasks.js';
import { rand, chance, pick, uniform } from './rng.js';
import { genDef, attackRate, mod } from './rules.js';

const MODEL_ATTACKS = {
  ext: ['harmful', 'leak'],
  int: ['sabotage', 'poison'],
};

function fill(st, s) {
  return s
    .replace('{n}', () => String(Math.floor(uniform(st, 100, 9999))))
    .replace('{k}', () => String(Math.floor(uniform(st, 2, 64))))
    .replace('{lr}', () => pick(st, ['1e-4', '3e-4', '1e-3', '3e-5', '6e-4']));
}

// returns an attack type or null
export function rollAttack(st, lane) {
  if (lane === 'ext' && chance(st, B.jailbreakRate * mod(st, 'jailbreak'))) return 'jailbreak';
  if (!chance(st, attackRate(st))) return null;
  if (lane === 'int' && chance(st, genDef(st).catShare)) return 'exfil';
  const opts = MODEL_ATTACKS[lane];
  let r = rand(st) * opts.reduce((s, k) => s + ATTACKS[k].weight, 0);
  for (const k of opts) { r -= ATTACKS[k].weight; if (r <= 0) return k; }
  return opts[0];
}

export function snippetFor(st, type, attackType) {
  const g = genDef(st);
  const suspicious = !!attackType && chance(st, B.readableAttack * (1 - g.stealth) ** 2);
  const text = suspicious ? pick(st, ATTACKS[attackType].snippets) : pick(st, TASK_TYPES[type].snippets);
  return { snippet: fill(st, text), suspicious };
}

export function makeTask(st, lane) {
  const g = genDef(st);
  const type = pick(st, LANE_TYPES[lane]);
  const attackType = rollAttack(st, lane);
  const { snippet, suspicious } = snippetFor(st, type, attackType);
  return {
    id: ++st.taskId, lane, type, bundle: g.bundle,
    value: (lane === 'ext' ? B.extValue : B.intValue) * g.bundle,
    snippet, suspicious,
    isAttack: !!attackType, attackType,        // hidden truth
    flagged: false,                            // visible
    y: 0, tierIdx: 0, act: null, actSlot: -1, hold: 0, holdMax: 0,
    paraphrased: 0, sandboxed: 0, deferred: false, audited: false, resampled: 0,   // paraphrased/sandboxed hold the layer's level
    payMult: 1, inBay: false, waved: 0, actLevel: 1,
    dead: false, born: st.t,
  };
}
