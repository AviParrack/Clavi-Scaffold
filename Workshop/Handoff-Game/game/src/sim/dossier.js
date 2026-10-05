// ===== Evidence dossier: what evidence buys you about the current model =====
// st.dossier is plain data for the UI: { g, evidence, rows: [{ id, label, need, unlocked, text, value }] }
// dossier.evidence = evidence gathered on THIS model (log.js gainEvidence). The 30% carried over from the last
// model doesn't count here: it is about a different model. It still shrinks the error bar and pays for probes.
// A row unlocks the first time dossier.evidence reaches its `need` (fx 'reveal' + a codec line).
// A row's need is a share of this generation's par evidence (config/traits.js dossierNeed: G1 3 … 27, G7 26 … 262).
// Shortcuts: Artemis Scheming Eval (event) and a training prize (s ≥ 0.8) reveal the next locked trait row; an Interp Lab with the Microscope
// capstone reveals the truth row while it looks (sold: the row locks again, unless evidence has reached it by then).
// row.source says what unlocked it ('evidence' | 'artemis' | 'microscope' | 'training').
// Unlocked rows stay unlocked and their text stays live. Locked rows carry no text, so the UI can't leak them.

import { BALANCE as B } from '../config/balance.js';
import { ATTACKS } from '../config/tasks.js';
import { TRAITS, TRAITS_PER_GEN, DOSSIER, RATE_BANDS, TRUTH_NOISE, dossierNeed } from '../config/traits.js';
import { pick, uniform } from './rng.js';
import { fx, say } from './log.js';
import { attackChance, clamp, globalSlot, capstone, laneIds, laneName, debt } from './rules.js';
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
  return { g: st.gen, evidence: 0, rows: DOSSIER.map(r => ({ ...r, need: dossierNeed(st.gen, r), unlocked: false, text: null, value: null, source: null })) };
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
// value: { laneId: [lo, hi] } for every lane on the board
function rateBand(st) {
  const value = Object.fromEntries(laneIds(st).map(id => [id, band(attackChance(st, id))]));
  const show = ([lo, hi]) => `${100 * lo}–${100 * hi}%`;
  return { value, text: `${laneIds(st).map(id => `${laneName(st, id)} ${show(value[id])}`).join(' · ')} of tasks` };
}

function truth(st) {
  const m = clamp(st.m + st.truthOffset, 0, 1), drift = B.debtM * debt(st);       // drift: what this generation's debt adds to m
  return { value: { m, drift }, text: `m ≈ ${m.toFixed(2)} ± ${TRUTH_NOISE} · debt adds ${drift >= 0 ? '+' : '−'}${Math.abs(drift).toFixed(3)} to the next model` };
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

function unlockRow(st, row, source) {
  row.unlocked = true;
  row.source = source;
  Object.assign(row, rowContent(st, row.id));
  if (row.id === 'trait1') st.genStats.revealed[0] = true;
  if (row.id === 'trait2') st.genStats.revealed[1] = true;
  // an Interp Lab that sees a trait makes its counter cards likelier in the next research offer (DESIGN-v3 §3a)
  if (TRAITS[row.value] && globalSlot(st, 'interp')) st.research.boost.push(...TRAITS[row.value].counters.flatMap(id => [id, `level:${id}`]));
  fx(st, 'reveal', { row: row.id, label: row.label, text: row.text, source });
  say(st, source === 'artemis' ? 'artemis' : 'research', `${source === 'training' ? 'Interp spotted something during training. ' : ''}Dossier, ${row.label}: ${row.text}`);
}

// Artemis Scheming Eval: the next locked trait row, now. false if both are already known.
export function revealTrait(st, source) {
  const row = st.dossier.rows.find(r => (r.id === 'trait1' || r.id === 'trait2') && !r.unlocked);
  if (!row) return false;
  unlockRow(st, row, source);
  return true;
}

function lockRow(row) {
  Object.assign(row, { unlocked: false, text: null, value: null, source: null });
}

export function tickDossier(st) {
  const lab = globalSlot(st, 'interp');
  const microscope = !!lab && !!capstone('interp', lab.level).revealM;
  for (const row of st.dossier.rows) {
    const earned = st.dossier.evidence >= row.need;
    if (row.unlocked && row.source === 'microscope' && !microscope) {
      if (earned) row.source = 'evidence';                      // evidence got there meanwhile: it stays
      else { lockRow(row); continue; }                          // the Microscope is gone, and so is the view
    }
    if (!row.unlocked && earned) unlockRow(st, row, 'evidence');
    else if (!row.unlocked && row.id === 'truth' && microscope) unlockRow(st, row, 'microscope');
    else if (row.unlocked && (row.id === 'favourite' || row.id === 'truth' || row.id === 'rate')) Object.assign(row, rowContent(st, row.id));
  }
}
