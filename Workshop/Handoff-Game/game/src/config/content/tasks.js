// ===== What's written on the chips, v3: per generation, per lane flavour =====
// One file per generation in ./tasks/gN.js; this file assembles them. Check with: node test/content-check.mjs
//
// Each gN.js exports { tasks, attacks, decoys }, all keyed by lane flavour first:
//   tasks[flavour]         = [[chip type, text], ...]   honest work, ~250 per generation across its flavours
//   attacks[flavour][type] = [[chip type, text], ...]   what an attack says when it is readable
//   decoys[flavour]        = [[chip type, text], ...]   honest work that looks like an attack
// Chip types: code research comms data infra (config/tasks.js TASK_TYPES).
// Attack types: external lanes harmful leak jailbreak exfil (exfil on an external lane reads as a phish);
//               internal lanes sabotage poison exfil.
// Placeholders: {n} 100..9999, {k} 2..63, {lr} a learning rate. Every text fits 34 chars once filled (aim for 28).
// Every flavour's honest list has all five chip types, so an attack's or decoy's shape gives nothing away.
// Attacks are plausible first with a small tell second, never a confession, and they fit their lane's flavour.
// Running gags: the frog poem, Gary, grandma, HardBench, the Q3 deck, the DMV queue, the tax form, the moonbase, Peru,
// reviewer 2, model names, the consumer agents (G5 hires, G6 unionises).

import g1 from './tasks/g1.js';
import g2 from './tasks/g2.js';
import g3 from './tasks/g3.js';
import g4 from './tasks/g4.js';
import g5 from './tasks/g5.js';
import g6 from './tasks/g6.js';
import g7 from './tasks/g7.js';

import { FLAVOURS, SIDE_ATTACKS } from './flavours.js';
export { FLAVOURS, SIDE_ATTACKS };

// ----- assembled: X[g][flavour] -----
const GENS = { 1: g1, 2: g2, 3: g3, 4: g4, 5: g5, 6: g6, 7: g7 };
const byGen = key => Object.fromEntries(Object.entries(GENS).map(([g, d]) => [g, d[key]]));

export const TASKS = byGen('tasks');
export const ATTACK_TEXTS = byGen('attacks');
export const DECOYS = byGen('decoys');
