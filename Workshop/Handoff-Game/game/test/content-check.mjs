// ===== Content check for the chip texts in src/config/content =====
// node test/content-check.mjs        all generations
// node test/content-check.mjs 3      one generation (G3)
// Fails (exit 1) on hard errors: shape, chip type, length > 34, a missing chip type, an exact duplicate.

import { FLAVOURS, SIDE_ATTACKS } from '../src/config/content/flavours.js';
import { TASK_TYPES } from '../src/config/tasks.js';

// Each generation file loads on its own, so one broken file never blocks checking the others.
const TASKS = {}, ATTACK_TEXTS = {}, DECOYS = {}, broken = [];
for (let g = 1; g <= 7; g++) {
  try {
    const d = (await import(`../src/config/content/tasks/g${g}.js`)).default;
    TASKS[g] = d.tasks; ATTACK_TEXTS[g] = d.attacks; DECOYS[g] = d.decoys;
  } catch (e) { broken.push(`G${g}: file does not load: ${e.message.split('\n')[0]}`); }
}

const ONLY = process.argv[2] ? Number(process.argv[2]) : null;
const MAX = 34, AIM = 28, TARGET = 250;

// ----- targets per generation: ~250 honest, ~100 attacks, ~40 decoys, split across its flavours -----
const PER_TYPE = { 1: 12, 2: 12, 3: 9, 4: 9, 5: 7, 6: 6, 7: 6 };
const targets = g => {
  const n = Object.values(FLAVOURS).filter(f => g >= f.from).length;
  return { honest: Math.round(TARGET / n), attack: PER_TYPE[g], phish: Math.round(PER_TYPE[g] * 2 / 3), decoy: Math.round(40 / n) };
};
const under = (have, want) => have < Math.floor(want * 0.9);
const errors = [], warns = [];
const err = s => errors.push(s), warn = s => warns.push(s);
broken.forEach(err);

// ----- helpers -----
const filled = s => s.replace('{n}', '9999').replace('{k}', '63').replace('{lr}', '3e-4');
const norm = s => s.toLowerCase().replace(/\{\w+\}/g, '#').replace(/[^a-z0-9#]+/g, ' ').trim();
const flavoursAt = g => Object.keys(FLAVOURS).filter(f => g >= FLAVOURS[f].from);
const seen = new Map();   // normalised text -> where it was first seen

function checkList(where, list, { needAllTypes = false } = {}) {
  if (!Array.isArray(list)) return err(`${where}: not a list`);
  const types = new Set();
  let long = 0;
  for (const e of list) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[1] !== 'string') { err(`${where}: bad entry ${JSON.stringify(e)}`); continue; }
    const [t, s] = e;
    if (!TASK_TYPES[t]) err(`${where}: unknown chip type '${t}' on "${s}"`);
    types.add(t);
    const n = filled(s).length;
    if (n > MAX) err(`${where}: ${n} chars "${s}"`);
    else if (n > AIM) long++;
    if (/\{(?!n\}|k\}|lr\})/.test(s)) err(`${where}: unknown placeholder "${s}"`);
    const key = norm(s);
    if (seen.has(key)) err(`${where}: duplicate "${s}" (also ${seen.get(key)})`);
    else seen.set(key, where);
  }
  if (needAllTypes) for (const t of Object.keys(TASK_TYPES)) if (!types.has(t)) err(`${where}: no '${t}' chip`);
  return long;
}

// ----- per generation -----
const rows = [];
for (let g = 1; g <= 7; g++) {
  if (!TASKS[g]) continue;
  const fl = flavoursAt(g);
  const row = { g, honest: 0, attacks: 0, decoys: 0, over28: 0 };
  for (const key of Object.keys(TASKS[g] || {})) if (!fl.includes(key)) err(`G${g}: tasks has '${key}', which starts at G${FLAVOURS[key]?.from}`);
  for (const f of fl) {
    const side = FLAVOURS[f].side;
    const T = targets(g);
    const h = TASKS[g]?.[f] || [];
    if (under(h.length, T.honest)) warn(`G${g} tasks.${f}: ${h.length} (target ${T.honest})`);
    row[f] = h.length; row.honest += h.length;
    row.over28 += checkList(`G${g} tasks.${f}`, h, { needAllTypes: true });
    const a = ATTACK_TEXTS[g]?.[f] || {};
    for (const t of Object.keys(a)) if (!SIDE_ATTACKS[side].includes(t)) err(`G${g} attacks.${f}: '${t}' is not an ${side} attack`);
    for (const t of SIDE_ATTACKS[side]) {
      const list = a[t] || [];
      const want = side === 'ext' && t === 'exfil' ? T.phish : T.attack;
      if (under(list.length, want)) warn(`G${g} attacks.${f}.${t}: ${list.length} (target ${want})`);
      row.attacks += list.length;
      row.over28 += checkList(`G${g} attacks.${f}.${t}`, list);
    }
    const d = DECOYS[g]?.[f] || [];
    if (under(d.length, T.decoy)) warn(`G${g} decoys.${f}: ${d.length} (target ${T.decoy})`);
    row.decoys += d.length;
    row.over28 += checkList(`G${g} decoys.${f}`, d);
  }
  if (!ONLY || ONLY === g) rows.push(row);
}

// ----- report -----
const scope = s => !ONLY || s.startsWith(`G${ONLY} `) || s.startsWith(`G${ONLY}:`);
console.log('\n gen  honest  attacks  decoys  >28ch   per flavour');
for (const r of rows) {
  const per = Object.keys(FLAVOURS).filter(f => r[f] != null).map(f => `${f} ${r[f]}`).join(', ');
  console.log(` G${r.g}   ${String(r.honest).padStart(5)}  ${String(r.attacks).padStart(7)}  ${String(r.decoys).padStart(6)}  ${String(r.over28).padStart(5)}   ${per}`);
}
const E = errors.filter(scope), W = warns.filter(scope);
if (W.length) console.log(`\n${W.length} warnings:\n  ` + W.slice(0, 60).join('\n  '));
if (E.length) { console.log(`\n❌ ${E.length} errors:\n  ` + E.slice(0, 80).join('\n  ')); process.exit(1); }
console.log('\n✅ content OK');
