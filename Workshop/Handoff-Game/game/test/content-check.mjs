// ===== Content check: chip texts, the repeat rule, the v3 words and the cast's names (DESIGN-v3 §6) =====
// node test/content-check.mjs          everything
// node test/content-check.mjs 3        one generation's chip texts (G3); the other checks still run
// node test/content-check.mjs strict   the Big Boss scan also fails on the sites still waiting on their owners
// Fails (exit 1) on hard errors: shape, chip type, length > 34, a missing chip type, an exact duplicate,
// an attack or decoy text that repeats more often than the lane's median honest text, a broken v3 or model line
// (speaker, length, placeholder), and "CEO" in a string a player can read.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAVOURS, SIDE_ATTACKS } from '../src/config/content/flavours.js';
import { TASK_TYPES, LANE_DEFS, ATTACKS } from '../src/config/tasks.js';
import { GENERATIONS } from '../src/config/generations.js';
import { BALANCE as B, DIFFICULTY } from '../src/config/balance.js';
import { LAYERS } from '../src/config/layers.js';
import { CAST } from '../src/config/content/events-text.js';
import * as V3 from '../src/config/content/v3-text.js';
import * as MODELS from '../src/config/content/models.js';
import { TRAITS } from '../src/config/traits.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const STRICT = args.includes('strict');
const ONLY = args.find(a => /^\d$/.test(a)) ? Number(args.find(a => /^\d$/.test(a))) : null;

// Each generation file loads on its own, so one broken file never blocks checking the others.
const TASKS = {}, ATTACK_TEXTS = {}, DECOYS = {}, broken = [];
for (let g = 1; g <= 7; g++) {
  try {
    const d = (await import(`../src/config/content/tasks/g${g}.js`)).default;
    TASKS[g] = d.tasks; ATTACK_TEXTS[g] = d.attacks; DECOYS[g] = d.decoys;
  } catch (e) { broken.push(`G${g}: file does not load: ${e.message.split('\n')[0]}`); }
}

const MAX = 34, AIM = 28, TARGET = 250;

// ----- targets per generation: ~250 honest, ~100 attacks, ~40 decoys, split across its flavours -----
const PER_TYPE = { 1: 12, 2: 12, 3: 9, 4: 9, 5: 7, 6: 6, 7: 6 };
const targets = g => {
  const n = Object.values(FLAVOURS).filter(f => g >= f.from).length;
  return { honest: Math.round(TARGET / n), attack: PER_TYPE[g], phish: Math.round(PER_TYPE[g] * 2 / 3), decoy: Math.round(40 / n) };
};
const under = (have, want) => have < Math.floor(want * 0.9);
const errors = [], warns = [], notes = [];
const err = s => errors.push(s), warn = s => warns.push(s);
broken.forEach(err);

// ----- helpers -----
const filled = s => s.replace('{n}', '9999').replace('{k}', '63').replace('{lr}', '3e-4');
const norm = s => s.toLowerCase().replace(/\{\w+\}/g, '#').replace(/[^a-z0-9#]+/g, ' ').trim();
const flavoursAt = g => Object.keys(FLAVOURS).filter(f => g >= FLAVOURS[f].from);
const pc = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
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

// ==================== 1. chip texts: shape, length, duplicates, counts ====================
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

// ==================== 2. the repeat rule (DESIGN-v3 §6) ====================
// An attack text may not repeat more often than the lane's median honest text, or the repeat becomes a tell.
// Expected showings of one text in one generation, on the lane that carries the flavour (LANE_DEFS[id].flavour):
//   lines        N = λ_g × lane volume × T_g                     (default split: a lane gets exactly λ × vol)
//   attack t     N × p_t × r ÷ |attacks[f][t]|                    r: share of attacks that show their own text
//   honest text  N × [(1 − p)(1 − decoyRate) + p(1 − r)] ÷ |tasks[f]|   (an unreadable attack wears an honest text)
//   decoy text   N × (1 − p) × decoyRate ÷ |decoys[f]|
// p_t is the sim's rules.js attackChances at m = Medium mid, no traits, no events, warm-up done.
// r = 1 is the worst case: the ratio attack ÷ honest only grows with r, so if it holds at r = 1 it holds for any
// tuning of readableAttack and textStealth. The sim's real r is readableAttack × (1 − textStealth)² ≤ 0.45, which
// also leaves room for a ×2 trait (Sycophant, Reward Hacker), Hard's m and the G7 bursts.
// EXTERNAL exfil (the phish) comes only from the Spear Phish event, once at most per generation: not counted.
const M_RULE = (DIFFICULTY.medium.range[0] + DIFFICULTY.medium.range[1]) / 2;
const R_RULE = 1;
const laneOf = f => Object.keys(LANE_DEFS).find(id => LANE_DEFS[id].flavour === f);

function attackChances(g, lane, m) {
  const G = GENERATIONS[g - 1], D = LANE_DEFS[lane];
  const int = D.side === 'int';
  const p = (B.attackBase + B.attackPerM * m) * G.opp * (int ? B.intAttackMult : 1);
  if (!int) return { jailbreak: D.pjb, ...Object.fromEntries(Object.entries(D.mix).map(([t, w]) => [t, p * w])) };
  const ex = Math.min(B.maxExfilShare, G.exfil * (D.exfilMult ?? 1));
  const out = { exfil: p * ex };
  for (const t of Object.keys(ATTACKS).filter(t => ATTACKS[t].lane === 'int' && !ATTACKS[t].catastrophe)) out[t] = p * (1 - ex) * ATTACKS[t].weight;
  return out;
}

const median = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const repeatRows = [];
let worst = { ratio: 0 };
for (let g = 1; g <= 7; g++) {
  if (!TASKS[g]) continue;
  const G = GENERATIONS[g - 1];
  for (const f of flavoursAt(g)) {
    const lane = laneOf(f);
    if (!lane) { err(`repeat rule: no lane in config/tasks.js LANE_DEFS carries flavour '${f}'`); continue; }
    const N = G.lam * LANE_DEFS[lane].vol * G.T;
    const P = attackChances(g, lane, M_RULE), pAll = Object.values(P).reduce((a, b) => a + b, 0);
    const H = TASKS[g][f] || [], Dc = DECOYS[g]?.[f] || [];
    const perHonest = N * ((1 - pAll) * (1 - B.decoyRate) + pAll * (1 - R_RULE)) / Math.max(1, H.length);
    const honestMedian = median(H.map(() => perHonest));        // every honest text in a lane is equally likely
    const cells = [];
    for (const [t, p] of Object.entries(P)) {
      const list = ATTACK_TEXTS[g]?.[f]?.[t] || [];
      if (!list.length) { if (p > 0) err(`G${g} attacks.${f}.${t}: empty, but the lane attacks with p ${p.toFixed(4)}`); continue; }
      const per = N * p * R_RULE / list.length, ratio = per / honestMedian;
      const need = Math.ceil(list.length * ratio - 1e-9);
      cells.push(`${t} ${ratio.toFixed(2)}`);
      if (ratio > worst.ratio) worst = { ratio, where: `G${g} ${f}.${t}` };
      if (ratio > 1) err(`G${g} attacks.${f}.${t}: ${list.length} texts repeat ${ratio.toFixed(2)}× the median honest text (${per.toFixed(2)} vs ${honestMedian.toFixed(2)} a generation): needs ≥ ${need}`);
    }
    if (Dc.length) {
      const per = N * (1 - pAll) * B.decoyRate / Dc.length, ratio = per / honestMedian;
      cells.push(`decoy ${ratio.toFixed(2)}`);
      if (ratio > 1) err(`G${g} decoys.${f}: ${Dc.length} texts repeat ${ratio.toFixed(2)}× the median honest text`);
    }
    if (!ONLY || ONLY === g) repeatRows.push(`G${g} ${f.padEnd(10)} ${String(Math.round(N)).padStart(4)} lines, honest ×${honestMedian.toFixed(2)} each · ${cells.join(' · ')}`);
  }
}

// ==================== 3. the v3 words (config/content/v3-text.js) ====================
// Codec lines are [speaker, text]: the speaker is a CAST id, and the text fits the codec box: 3 lines of ~36
// characters a page. Aim for one page (≤ CODEC_AIM); never more than two (CODEC_MAX).
// Every {placeholder} must be one the section's header in v3-text.js promises to fill (V3.FILLS).
const CODEC_AIM = 105, CODEC_MAX = 150;
const v3errs = [], v3long = [];
const v3err = s => v3errs.push(s);
const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(x => x[1]);

function codecLines(where, lines, fills) {
  if (!Array.isArray(lines) || !lines.length) return v3err(`${where}: no lines`);
  lines.forEach((ln, i) => {
    if (!Array.isArray(ln) || ln.length !== 2 || typeof ln[1] !== 'string') return v3err(`${where}[${i}]: not [speaker, text]`);
    const [who, text] = ln;
    if (!CAST[who]) v3err(`${where}[${i}]: unknown speaker '${who}'`);
    if (text.length > CODEC_MAX) v3err(`${where}[${i}]: ${text.length} chars (max ${CODEC_MAX}) "${text}"`);
    else if (text.length > CODEC_AIM) v3long.push(`${where}[${i}] ${text.length}`);
    label(`${where}[${i}]`, text, CODEC_MAX, fills);
  });
}
function label(where, s, max, fills) {
  if (typeof s !== 'string' || !s.trim()) return v3err(`${where}: missing`);
  if (s.length > max) v3err(`${where}: ${s.length} chars (max ${max}) "${s}"`);
  for (const h of holes(s)) if (!(fills || []).includes(h)) v3err(`${where}: placeholder {${h}} is not in its FILLS list`);
}
const labels = (where, obj, max, fills) => Object.entries(obj).forEach(([k, v]) => label(`${where}.${k}`, v, max, fills));

try {
  const F = V3.FILLS || {};
  // the tutorial: the ten §3h steps, in order
  const ids = (V3.TUTORIAL_STEPS || []).map(s => s.id);
  if (ids.length !== 10 || new Set(ids).size !== 10) v3err(`TUTORIAL_STEPS: ${ids.length} steps (${new Set(ids).size} unique), want the 10 of §3h`);
  (V3.TUTORIAL_STEPS || []).forEach((s, i) => {
    if (s.step !== i + 1) v3err(`TUTORIAL_STEPS[${i}]: step ${s.step}, want ${i + 1}`);
    label(`TUTORIAL_STEPS.${s.id}.do`, s.do, 44, F.tutorial);
    codecLines(`TUTORIAL_STEPS.${s.id}.say`, s.say, F.tutorial);
    if (s.after) codecLines(`TUTORIAL_STEPS.${s.id}.after`, s.after, F.tutorial);
  });
  labels('TUTORIAL_UI', V3.TUTORIAL_UI || {}, 44, F.tutorial);
  // contracts: every lane after G1 is telegraphed one generation early, offered, and opened
  for (const [id, D] of Object.entries(LANE_DEFS).filter(([, D]) => D.opens > 1)) {
    const c = V3.CONTRACTS?.[id];
    if (!c) { v3err(`CONTRACTS: no entry for lane '${id}' (opens G${D.opens})`); continue; }
    if (c.telegraphGen !== D.opens - 1) v3err(`CONTRACTS.${id}.telegraphGen ${c.telegraphGen}, want G${D.opens - 1}`);
    for (const k of ['telegraph', 'offer', 'open', 'autoOpen']) codecLines(`CONTRACTS.${id}.${k}`, c[k], F.contract);
  }
  labels('CONTRACT_UI', V3.CONTRACT_UI || {}, 32, F.contract);
  // lanes: a tab label that matches the sim's and a hover tip, for every lane
  for (const id of Object.keys(LANE_DEFS)) {
    const L = V3.LANE_TEXT?.[id];
    if (!L) { v3err(`LANE_TEXT: no entry for lane '${id}'`); continue; }
    if (L.tab !== LANE_DEFS[id].label) v3err(`LANE_TEXT.${id}.tab '${L.tab}' ≠ config/tasks.js label '${LANE_DEFS[id].label}'`);
    label(`LANE_TEXT.${id}.tab`, L.tab, 10, []);
    label(`LANE_TEXT.${id}.tip`, L.tip, 120, F.lane);
  }
  const tabRow = side => Object.keys(LANE_DEFS).filter(id => LANE_DEFS[id].side === side).map(id => V3.LANE_TEXT?.[id]?.tab ?? '').join(' · ');
  for (const side of ['ext', 'int']) if (tabRow(side).length > 30) v3err(`LANE_TEXT: the ${side} tab row "${tabRow(side)}" is over 30 characters`);
  labels('LANE_UI', V3.LANE_UI || {}, 80, F.lane);
  // the collusion call, the retrain card, the alarm, the report, the stamps
  codecLines('COLLUSION_CALL', V3.COLLUSION_CALL, F.collusion);
  labels('COLLUSION_UI', V3.COLLUSION_UI || {}, 80, F.collusion);
  const R = V3.RETRAIN_CARD || {};
  for (const k of ['title', 'yes', 'no']) label(`RETRAIN_CARD.${k}`, R[k], 22, F.retrain);
  for (const k of ['cost', 'gain', 'yesHint', 'noHint', 'fine']) label(`RETRAIN_CARD.${k}`, R[k], 70, F.retrain);
  for (const k of ['call', 'saidYes', 'saidNo']) codecLines(`RETRAIN_CARD.${k}`, R[k], F.retrain);
  const E = V3.EGRESS || {};
  for (const k of ['title', 'button']) label(`EGRESS.${k}`, E[k], 16, F.egress);
  for (const k of ['sub', 'countdown', 'hint', 'log', 'logMissed']) label(`EGRESS.${k}`, E[k], 60, F.egress);
  for (const k of ['call', 'pulled', 'missed']) codecLines(`EGRESS.${k}`, E[k], F.egress);
  labels('STAMPS', V3.STAMPS || {}, 12, []);
  labels('OPS_LOG', V3.OPS_LOG || {}, 60, F.log);
  labels('REPORT', V3.REPORT || {}, 90, F.report);
  for (const k of ['clean', 'mixed', 'heavy']) codecLines(`REPORT_SAY.${k}`, V3.REPORT_SAY?.[k], F.report);
  labels('DEBT_METER', V3.DEBT_METER || {}, 40, F.report);
  // research: three streams, a type tag and a line per card type, and a blurb for every element
  // config/cards.js is sim-systems' file: if it doesn't load mid-edit, these two cross-checks wait (a warning)
  let CARDS_CFG = null;
  try { CARDS_CFG = await import('../src/config/cards.js'); } catch (e) { warn(`config/cards.js did not load, card cross-checks skipped: ${e.message.split('\n')[0]}`); }
  const labIds = CARDS_CFG ? CARDS_CFG.CARDS.filter(c => c.type === 'lab').map(c => c.id) : V3.TECHNIQUE_IDS || [];
  if (CARDS_CFG && labIds.sort().join() !== [...(V3.TECHNIQUE_IDS || [])].sort().join())
    v3err(`TECHNIQUE_IDS [${V3.TECHNIQUE_IDS}] ≠ the 'lab' cards in config/cards.js [${labIds}]`);
  for (const s of Object.keys(CARDS_CFG?.STREAMS || {})) if (!V3.STREAMS?.[s] || V3.STREAMS[s].speaker !== CARDS_CFG.STREAMS[s].speaker)
    v3err(`STREAMS.${s}: missing, or its speaker differs from config/cards.js ('${CARDS_CFG.STREAMS[s].speaker}')`);
  for (const s of ['monitoring', 'control', 'lab']) {
    const S = V3.STREAMS?.[s];
    if (!S) { v3err(`STREAMS: no '${s}'`); continue; }
    label(`STREAMS.${s}.name`, S.name, 14, []);
    label(`STREAMS.${s}.blurb`, S.blurb, 60, []);
    if (!CAST[S.speaker]) v3err(`STREAMS.${s}.speaker '${S.speaker}' is not in the cast`);
  }
  for (const t of ['new', 'level', 'lab', 'mount']) {
    label(`CARD_TYPES.${t}.tag`, V3.CARD_TYPES?.[t]?.tag, 8, []);
    label(`CARD_TYPES.${t}.line`, V3.CARD_TYPES?.[t]?.line, 60, F.card);
  }
  for (const id of [...Object.keys(LAYERS), ...(V3.TECHNIQUE_IDS || [])]) {
    const c = V3.CARD_BLURBS?.[id];
    if (!c) { v3err(`CARD_BLURBS: no blurb for '${id}'`); continue; }
    label(`CARD_BLURBS.${id}.what`, c.what, 60, []);
    label(`CARD_BLURBS.${id}.quip`, c.quip, 72, []);
  }
  labels('RESEARCH_UI', V3.RESEARCH_UI || {}, 44, F.card);
  if ((V3.RESEARCH_BARKS || []).length !== 7) v3err('RESEARCH_BARKS: want one bark per generation (7)');
  codecLines('RESEARCH_BARKS', V3.RESEARCH_BARKS, []);
  // the model card: one new-threat line per generation, the spine unlock, the evals line
  for (let g = 1; g <= 7; g++) label(`NEW_THREAT[${g}]`, V3.NEW_THREAT?.[g], 58, F.card);
  labels('CARD_SCENE', V3.CARD_SCENE || {}, 58, F.card);
  if (V3.CARD_SCENE?.evals !== 'Red-team evals: coming soon') v3err('CARD_SCENE.evals must read exactly "Red-team evals: coming soon" (§3f)');
  labels('BURST', V3.BURST || {}, 40, F.burst);
  labels('QUOTA', V3.QUOTA || {}, 60, F.lane);
  codecLines('QUOTA_CALL', V3.QUOTA_CALL, F.lane);
  // endings (§5): trust / lucky / uneasy, each with a title, a line and the model's sign-off
  for (const k of ['trust', 'lucky', 'uneasy']) {
    const e = V3.ENDINGS?.[k];
    if (!e) { v3err(`ENDINGS: no '${k}'`); continue; }
    label(`ENDINGS.${k}.title`, e.title, 22, []);
    label(`ENDINGS.${k}.text`, e.text, CODEC_MAX, []);
    label(`ENDINGS.${k}.model`, e.model, 72, []);
    if (!CAST[e.speaker]) v3err(`ENDINGS.${k}.speaker '${e.speaker}' is not in the cast`);
  }
  if (CAST.ceo?.name !== 'BIG BOSS') v3err(`CAST.ceo.name is '${CAST.ceo?.name}', want 'BIG BOSS' (§6)`);
} catch (e) { v3err(`v3-text.js: ${e.message.split('\n')[0]}`); }

// the model's words (models.js header): tagline ≤ 50, card line ≤ 58, chat line and tell ≤ 72; a tell for every trait
try {
  const cap = (where, s, max) => label(where, s, max, []);
  for (const n of MODELS.MODEL_NAMES) { cap(`MODEL_NAMES G${n.gen}.tagline`, n.tagline, 50); n.cardBlurb.forEach((b, i) => cap(`MODEL_NAMES G${n.gen}.cardBlurb[${i}]`, b, 58)); }
  for (const [g, list] of Object.entries(MODELS.ALT_NAMES)) list.forEach((n, j) => {
    cap(`ALT_NAMES G${g}[${j}].tagline`, n.tagline, 50); n.cardBlurb.forEach((b, i) => cap(`ALT_NAMES G${g}[${j}].cardBlurb[${i}]`, b, 58));
  });
  for (const [name, chats] of [['ROUND_CHATS', MODELS.ROUND_CHATS], ['ALT_ROUND_CHATS', MODELS.ALT_ROUND_CHATS]])
    for (const [g, list] of Object.entries(chats)) list.forEach((c, i) => cap(`${name} G${g}[${i}]`, c.text, 72));
  for (let g = 1; g <= 7; g++) if (!MODELS.ROUND_CHATS[g]?.length) v3err(`ROUND_CHATS: no chat for G${g}`);
  for (const t of Object.keys(TRAITS)) for (const band of ['early', 'mid', 'late']) cap(`TRAIT_TELLS.${t}.${band}`, MODELS.TRAIT_TELLS[t]?.[band], 72);
  for (const [t, b] of Object.entries(MODELS.ALT_TRAIT_TELLS)) for (const [band, s] of Object.entries(b)) cap(`ALT_TRAIT_TELLS.${t}.${band}`, s, 72);
} catch (e) { v3err(`models.js: ${e.message.split('\n')[0]}`); }
v3errs.forEach(err);

// ==================== 4. Big Boss: "CEO" appears in no string a player can read (§6) ====================
// Scans every string literal (quotes and backticks, not comments) under src/config and src/ui, plus main.js and
// index.html. Files on the §6 rename list that belong to another stream are PENDING: their hits warn, until the
// owner lands the rename (requests.md); `strict` fails on them too. A hit anywhere else is an error.
const PENDING = {};                                     // the §6 rename landed everywhere (QA, final pass)
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const scanFiles = [...walk(join(GAME, 'src/config')), ...walk(join(GAME, 'src/ui')), join(GAME, 'src/main.js'), join(GAME, 'index.html')]
  .filter(p => /\.(m?js|html)$/.test(p));

// the string literals in a JS source, with their line numbers. Skips // and /* */ comments and /regex/ literals.
function stringsOf(src) {
  const out = [];
  let i = 0, line = 1, prev = '';
  const regexCanStart = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|do|else|in|of)$/.test(prev);
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; } s += src[j]; j++; }
      out.push({ line, s });
      line += (s.match(/\n/g) || []).length;
      i = j + 1; prev = 'x'; continue;
    }
    if (c === '/' && regexCanStart()) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      i = j + 1; prev = 'x'; continue;
    }
    const w = /^[\w$]+/.exec(src.slice(i, i + 40));
    if (w) { prev = w[0]; i += w[0].length; } else { prev = c; i++; }
  }
  return out;
}

const ceoHits = [], ceoPending = {};
for (const p of scanFiles) {
  const rel = relative(GAME, p).split('\\').join('/');
  const src = readFileSync(p, 'utf8');
  const hits = p.endsWith('.html') ? src.replace(/<!--[\s\S]*?-->/g, '').split('\n').map((s, k) => ({ line: k + 1, s })) : stringsOf(src);
  for (const h of hits.filter(h => /CEO/.test(h.s))) {
    const k = h.s.indexOf('CEO'), before = h.s.slice(0, k);             // point at the line of the hit inside a long literal
    const at = `${rel}:${h.line + (before.match(/\n/g) || []).length} "${h.s.slice(Math.max(0, k - 30), k + 30).replace(/\s+/g, ' ').trim()}"`;
    if (PENDING[rel] && !STRICT) (ceoPending[rel] ||= []).push(at);
    else ceoHits.push(at);
  }
}
for (const h of ceoHits) err(`"CEO" in a player-facing string (it is Big Boss now): ${h}`);
for (const [rel, list] of Object.entries(ceoPending)) warn(`"CEO" pending rename by ${PENDING[rel]} (requests.md): ${list.join(' · ')}`);
for (const rel of Object.keys(PENDING)) if (!ceoPending[rel] && !ceoHits.some(h => h.startsWith(rel))) notes.push(`${rel} has no "CEO" left: drop it from PENDING`);

// ==================== report ====================
const scope = s => !ONLY || !/^G\d/.test(s) || s.startsWith(`G${ONLY} `) || s.startsWith(`G${ONLY}:`);
console.log('\n gen  honest  attacks  decoys  >28ch   per flavour');
for (const r of rows) {
  const per = Object.keys(FLAVOURS).filter(f => r[f] != null).map(f => `${f} ${r[f]}`).join(', ');
  console.log(` G${r.g}   ${String(r.honest).padStart(5)}  ${String(r.attacks).padStart(7)}  ${String(r.decoys).padStart(6)}  ${String(r.over28).padStart(5)}   ${per}`);
}
console.log(`\n repeat rule (m ${M_RULE.toFixed(2)}, every attack readable): showings per text ÷ the lane's median honest text, must be ≤ 1`);
for (const r of repeatRows) console.log('  ' + r);
console.log(`  worst: ${worst.where} at ${worst.ratio.toFixed(2)}`);
console.log(`\n v3 words: ${(V3.TUTORIAL_STEPS || []).length} tutorial steps, ${Object.keys(V3.CONTRACTS || {}).length} contracts, ${Object.keys(V3.CARD_BLURBS || {}).length} card blurbs, ${v3long.length} codec lines over one page (${CODEC_AIM} ch)`);
console.log(` Big Boss scan: ${scanFiles.length} files, ${ceoHits.length} hits, ${Object.values(ceoPending).flat().length} pending with their owners${STRICT ? ' (strict)' : ''}`);
const E = errors.filter(scope), W = warns.filter(scope);
if (notes.length) console.log(`\n${notes.length} notes:\n  ` + notes.join('\n  '));
if (W.length) console.log(`\n${W.length} warnings:\n  ` + W.slice(0, 60).join('\n  '));
if (E.length) { console.log(`\n❌ ${E.length} errors:\n  ` + E.slice(0, 80).join('\n  ')); process.exit(1); }
console.log('\n✅ content OK');
