// ===== Evidence dossier: what evidence buys you about the current model =====
// st.dossier is plain data for the UI: { g, evidence, rows: [{ id, label, need, unlocked, text, value }] }
// dossier.evidence = evidence gathered on THIS model (log.js gainEvidence). The 30% carried over from the last
// model doesn't count here: it is about a different model. It still shrinks the error bar and pays for probes.
// A row unlocks the first time dossier.evidence reaches its `need` (fx 'reveal' + a codec line).
// Unlocked rows stay unlocked and their text stays live. Locked rows carry no text, so the UI can't leak them.

import { BALANCE as B } from '../config/balance.js';
import { ATTACKS } from '../config/tasks.js';
import { TRAITS, TRAITS_PER_GEN, DOSSIER, RATE_BANDS, TRUTH_NOISE } from '../config/traits.js';
import { pick, uniform } from './rng.js';
import { fx, say } from './log.js';
import { attackChance, clamp } from './rules.js';
import { pct } from '../util/format.js';

// =================== rolling the hidden traits ===================

export function rollTraits(st) {
  const pool = Object.keys(TRAITS), out = [];
  while (out.length < TRAITS_PER_GEN) {
    const id = pick(st, pool.filter(t => !out.includes(t)));
    out.push(id);
  }
  return out;
}

export function newDossier(st) {
  st.truthOffset = uniform(st, -TRUTH_NOISE, TRUTH_NOISE);
  return { g: st.gen, evidence: 0, rows: DOSSIER.map(r => ({ ...r, unlocked: false, text: null, value: null })) };
}

// =================== row contents ===================

function favourite(st) {
  const tries = Object.entries(st.genStats.attempts);
  if (!tries.length) return { value: null, text: 'no attempts yet' };
  const total = tries.reduce((s, [, n]) => s + n, 0);
  const [type, n] = tries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { value: type, text: `${ATTACKS[type].label} (${pct(n / total)} of its attempts)` };
}

function trait(st, k) {
  const id = st.traits[k], T = TRAITS[id];
  if (!T) return { value: null, text: 'none' };                // only in test labs that clear the traits
  return { value: id, text: `${T.name}: ${T.text}${T.counter ? ` Counter: ${T.counter}.` : ''}` };
}

// the model's own attack chance per chip in each lane, right now (traits and the watch swing included; jailbreaks are users)
export function band(p) {
  let i = 0;
  while (i < RATE_BANDS.length - 2 && p >= RATE_BANDS[i + 1]) i++;
  return [RATE_BANDS[i], RATE_BANDS[i + 1]];
}
function rateBand(st) {
  const ext = band(attackChance(st, 'ext')), int = band(attackChance(st, 'int'));
  const show = ([lo, hi]) => `${100 * lo}–${100 * hi}%`;
  return { value: { ext, int }, text: `EXTERNAL ${show(ext)} · INTERNAL ${show(int)} of tasks` };
}

function truth(st) {
  const m = clamp(st.m + st.truthOffset, 0, 1), drift = B.driftCoef * st.drift;
  return { value: { m, drift }, text: `m ≈ ${m.toFixed(2)} ± ${TRUTH_NOISE} · drift added this gen ${drift >= 0 ? '+' : '−'}${Math.abs(drift).toFixed(3)}` };
}

function rowContent(st, id) {
  switch (id) {
    case 'favourite': return favourite(st);
    case 'trait1':    return trait(st, 0);
    case 'rate':      return rateBand(st);
    case 'trait2':    return trait(st, 1);
    case 'truth':     return truth(st);
  }
}

// =================== tick: unlock, refresh ===================

export function tickDossier(st) {
  for (const row of st.dossier.rows) {
    if (!row.unlocked && st.dossier.evidence >= row.need) {
      row.unlocked = true;
      Object.assign(row, rowContent(st, row.id));
      if (row.id === 'trait1') st.genStats.revealed[0] = true;
      if (row.id === 'trait2') st.genStats.revealed[1] = true;
      fx(st, 'reveal', { row: row.id, label: row.label, text: row.text });
      say(st, 'research', `Dossier, ${row.label}: ${row.text}`);
    } else if (row.unlocked && (row.id === 'favourite' || row.id === 'truth' || row.id === 'rate')) {
      Object.assign(row, rowContent(st, row.id));
    }
  }
}
