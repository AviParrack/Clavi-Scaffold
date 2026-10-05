// ===== HUD: top bar, compute split, track strips (mode box + event LCD), evidence dossier, lab site, ops log =====
// Look: design/codec-mockups/variant-c.js (buildHUD, drawHUD, drawStrip, buildBottom, drawBottom). Plan: design/UI-PLAN.md §4.
// Reads state only; acts through api.act. Never draws hidden truth (§6): the misalign gauge reads misalignmentEstimate.
// Registers: split {handle} · banner {id, title, tip} · dossier-row {id, title, tip} · lab-site {} · hud-btn {action}
//            · hud-tip {id, title, tip} (hover help for the top bar). hud draws the tooltips of its own regions.

import { LAYERS } from '../config/layers.js';
import { BALANCE as B } from '../config/balance.js';
import { ATTACKS, SIDES } from '../config/tasks.js';
import { TRAITS } from '../config/traits.js';
import { CARDS } from '../config/cards.js';
import { EVENTS } from '../config/events.js';
import { GENERATIONS } from '../config/generations.js';
import * as R from '../sim/rules.js';
import { big, money } from '../util/format.js';
import { C, F, fill, box, dashBox, corners, text, tw, fit, wrap, layer, blit, glowRect, clamp, ease, mod, snap } from './theme.js';
import { SPR, sprite, icon, microN, seg7, segW, lcdPanel } from './sprites.js';
import { HUD, TRACKS, DOSSIER, LAB_SITE, OPSLOG } from './layout.js';
import { animOf, cursorOf, drain, fxAge } from './view.js';
import { splitRates } from './derive.js';

// =================== geometry (logical px, measured off variant-c.js) ===================

const REP_X = 128, MODEL_X = 192, RIVAL_X = 326, MIS_X = 398, GAUGE_X = 476, GAUGE_PX = 3.2;   // px per % of m
const TASKS = { x: 649, y: 13, w: 41, h: 17 }, CLOCK = { x: 1117, y: 13, w: 60, h: 17 };
const BAR = HUD.splitBar;                              // the split bar: labels above (baseline 11), readouts below (30)
const DRUMS = [31, 45, 63, 77, 91];                    // odometer drum x, 13×20 at y 7
const BTN = [['pause', 0], ['fast', 11], ['mute', 21]];  // hud-btn rows at x 1180: 20×10 hit areas, 8×7 glyphs
const ROW0 = 577, ROW_PITCH = 14, VAL_X = 136;          // dossier rows
const LOG_ROWS = 4, LOG_Y = 586, PROMPT_Y = 647;

const SHARES = ['product', 'capabilities', 'safety'];
const BAY_NAME = { auditor: 'AUDIT', defer: 'DEFER', resampler: 'RESMP', killswitch: 'KILL' };

// read at draw time, so a theme swap carries them
const ink = {
  well: () => C.well,                                  // LCD wells and odometer face
  segOff: () => C.segOff,                              // unlit 7-segment bars on a dark LCD
  hatch: () => C.hatch,
};

// =================== draw ===================

export function draw(c) {
  const A = animOf(c.view, 'hud', () => ({ cash: c.st.money, odoT: c.t, reveal: {}, log: [], texts: new Map(),
    lastRowT: -1e9, repHit: -1e9, net: [] }));
  readFx(c, A);
  topBar(c, A);
  split(c, A);
  for (const side of SIDES) strip(c, side, c.view.focus[side]);
  dossier(c, A);
  labSite(c);
  opsLog(c, A);
  tooltip(c);
  remember(c.st, A);
}

// every line's text while it is still on a track: a flag and its block can land in the same step, after which the
// task is gone from the lane and the ops log would only know it as "a line"
function remember(st, A) {
  for (const lane of R.laneIds(st)) for (const t of st.lanes[lane].tasks) if (!A.texts.has(t.id)) A.texts.set(t.id, t.text);
  for (const id of A.texts.keys()) { if (A.texts.size <= 800) break; A.texts.delete(id); }
}

// =================== fx: one pass per frame feeds the rep flash, the dossier reveal and the ops log ===================

function readFx(c, A) {
  const { st } = c;
  for (const e of drain(st, cursorOf(c.view, 'hud'))) {
    const t0 = c.t - fxAge(st, e);
    if (e.type === 'landed') A.repHit = t0;
    if (e.type === 'reveal') A.reveal[e.row] = t0;
    logFx(c, A, e, t0);
  }
  const last = A.net[A.net.length - 1];
  if (!last || st.t - last.t >= 0.25 || st.t < last.t) {
    A.net.push({ t: st.t, v: st.ledger.income - st.ledger.spend });
    while (A.net.length > 2 && st.t - A.net[0].t > 5) A.net.shift();
  }
}

// =================== top bar ===================

function topBar(c, A) {
  const { g, st } = c;
  blit(g, layer('hud-top', 1200, 33, topChrome), 0, 0);
  cash(c, A);
  rep(c, A);
  model(c);
  rival(c);
  misalign(c);
  tasksLcd(c);
  clock(c);
  buttons(c);
  c.hit.add(8, 4, 108, 25, 'hud-tip', { id: 'cash', title: 'CASH', tip: cashTip(st, A) }, 'help');
}

function topChrome(lg) {
  fill(lg, 0, 0, 1200, 32, C.hud); fill(lg, 0, 32, 1200, 1, C.e0);
  const lab = (s, x) => text(lg, s, x, 11, F.k8, C.gd);
  fill(lg, 8, 4, 108, 25, C.black); box(lg, 9, 5, 106, 23, C.e1); fill(lg, 10, 6, 104, 21, ink.well());
  lab('REP', REP_X); lab('RIVAL', RIVAL_X); lab('MISALIGN EST.', MIS_X); lab('TASKS/S', 652);
  fill(lg, GAUGE_X, 22, 161, 1, C.gd);
  for (let i = 0; i <= 10; i++) fill(lg, GAUGE_X + i * 16, i % 5 ? 21 : 19, 1, i % 5 ? 2 : 5, i % 5 ? C.gdd : C.gd);
  text(lg, '0', GAUGE_X, 31, F.k8, C.gd); text(lg, '25', GAUGE_X + 80, 31, F.k8, C.gd, 'center'); text(lg, '50', GAUGE_X + 161, 31, F.k8, C.gd, 'right');
  for (const r of [TASKS, CLOCK]) { fill(lg, r.x, r.y, r.w, r.h, ink.well()); box(lg, r.x, r.y, r.w, r.h, C.e0); }
  text(lg, 'COMPUTE', 706, 21, F.k8, C.gd);
}

// ---------- cash: an odometer that rolls toward st.money ----------
// Up to 5 drums; past $99,999 the drums show thousands (K), millions (M) ... with the unit on a 6th cell.

const UNITS = ['', 'K', 'M', 'B', 'T', 'Q'];
function scaleOf(v) { let tier = 0; v = Math.abs(v); while (v >= 99999.5 && tier < UNITS.length - 1) { v /= 1000; tier++; } return tier; }

function cash(c, A) {
  const { g, st } = c, dt = clamp(c.dt || 0, 0, 0.1);
  const tier = scaleOf(st.money), unit = 1000 ** tier;
  const target = Math.sign(st.money) * Math.floor(Math.abs(st.money) / unit) * unit;
  const gap = target - A.cash;
  A.cash += Math.sign(gap) * Math.min(Math.abs(gap), Math.max(Math.abs(gap) * (1 - Math.exp(-12 * dt)), 6 * unit * dt));
  const neg = A.cash < 0 || st.money < 0, v = Math.abs(A.cash) / 1000 ** scaleOf(A.cash), shown = scaleOf(A.cash);
  const col = neg ? C.r : C.gl;
  text(g, '$', 19, 24, F.v24, neg ? C.r : C.gd);
  if (neg) fill(g, 12, 16, 5, 2, C.r);
  const whole = Math.floor(v), frac = v - whole;
  DRUMS.forEach((x, i) => {
    const p = 4 - i, below = whole % 10 ** p, carry = p === 0 || below === 10 ** p - 1;
    const digit = Math.floor(whole / 10 ** p) % 10, lead = p > 0 && whole < 10 ** p;
    fill(g, x, 7, 13, 20, C.black);
    drum(g, digit + (carry ? frac : 0), x, lead ? (neg ? C.rm : C.gd) : col);
  });
  const comma = whole >= 1000 ? (neg ? C.r : C.gm) : C.gd;
  fill(g, 59, 22, 2, 3, comma); fill(g, 58, 25, 1, 1, comma);
  blit(g, layer('hud-odocap', 120, 32, odoCaps), 0, 0);
  if (shown) text(g, UNITS[shown], 106, 24, F.k8, neg ? C.r : C.gm);
}

function drum(g, pos, x, col) {
  const L = layer('hud-odo|' + col, 14, 220, lg => { for (let i = 0; i < 11; i++) text(lg, String(i % 10), 2, 20 * i + 17, F.v24, col); });
  const k = L.cv.width / 14;
  g.drawImage(L.cv, 0, Math.round(pos * 20 * k), L.cv.width, Math.round(20 * k), snap(x), snap(7), 14, 20);
}

function odoCaps(lg) {
  [30, 44, 62, 76, 90, 104].forEach(x => fill(lg, x, 7, 1, 20, C.e0));
  DRUMS.forEach(x => {
    for (let j = 0; j < 4; j++) {
      lg.globalAlpha = 0.85 * (1 - j / 4);
      fill(lg, x, 7 + j, 13, 1, C.black); fill(lg, x, 26 - j, 13, 1, C.black);
    }
  });
  lg.globalAlpha = 1;
}

function cashTip(st, A) {
  return `${money(st.money)} in the bank. ${netText(st, A)} (task pay minus per-task costs and salaries, last few seconds).`
    + (st.money < 0 ? ` Below zero for ${B.bankruptSeconds} s and the lab goes bankrupt.` : '');
}
function netText(st, A) {
  const a = A.net[0], b = A.net[A.net.length - 1];
  if (!a || b.t - a.t < 0.5) return 'Net cash flow: measuring';
  const net = (b.v - a.v) / (b.t - a.t);
  return `Net cash flow ${net >= 0 ? '+' : '−'}${money(Math.abs(net))}/s`;
}

// ---------- rep, model, rival ----------

function rep(c, A) {
  const { g, st } = c, low = st.rep < 25, hit = c.t - A.repHit < 0.6 && mod(c.t * 8, 1) < 0.5;
  text(g, String(Math.round(st.rep)), 152, 28, F.v20, hit || low ? C.r : C.gm, 'right');
  const lit = Math.round(st.rep / 12.5);
  for (let i = 0; i < 8; i++) fill(g, 156 + i * 4, 20, 3, 8, i < lit ? (low ? C.rm : C.gd) : C.e0);
  c.hit.add(REP_X, 2, 62, 28, 'hud-tip', { id: 'rep', title: 'REPUTATION',
    tip: `${Math.round(st.rep)}/100. EXTERNAL incidents cost reputation; it regrows slowly. It sets your market share, so it scales every EXTERNAL payout. At 0 the run is over.` }, 'help');
}

function model(c) {
  const { g, st } = c, gen = R.genDef(st), full = `G${gen.g} ${gen.name.toUpperCase()}`;
  const wide = tw(full, F.v16) > RIVAL_X - MODEL_X - 8;
  text(g, wide ? `MODEL G${gen.g}` : 'MODEL', MODEL_X, 11, F.k8, C.gd);
  text(g, wide ? gen.name.toUpperCase() : full, MODEL_X, 27, F.v16, C.gm);
  c.hit.add(MODEL_X, 2, RIVAL_X - MODEL_X - 6, 28, 'hud-tip', { id: 'model', title: `MODEL G${gen.g} OF 7`,
    tip: `${gen.name}. Every task is ×${big(gen.bundle)} real tasks; stealth ${Math.round(100 * gen.stealth)}%. ${modelNext(st)}` }, 'help');
}

function modelNext(st) {
  const g = R.genDef(st).g;
  if (st.phase === 'training') return `G${g + 1} is training: ${Math.ceil(st.trainT)} s.`;
  if (g >= GENERATIONS.length) return `R&D toward shipping: ${Math.floor(100 * Math.min(1, st.rd / st.rdNeed))}%.`;
  const y = yields(st), eta = y.rd > 0 ? Math.max(0, st.rdNeed - st.rd) / y.rd : Infinity;
  return `R&D toward G${g + 1}: ${Math.floor(100 * Math.min(1, st.rd / st.rdNeed))}%, about ${clockStr(eta)} at this split.`;
}

function rival(c) {
  const { g, st } = c, ship = st.rivalShipped;
  let s, col = C.gm, tip;
  if (ship && ship.remaining != null) {
    s = `SHIPPED ${Math.ceil(ship.remaining)}s`; col = mod(c.t * 2, 1) < 0.6 ? C.r : C.rm;
    tip = `Prometheus shipped its last model. Finish yours in ${Math.ceil(ship.remaining)} s or the market picks theirs.`;
  } else if (ship) {
    s = 'shipped ASI'; col = C.gd;
    tip = 'Prometheus shipped its last model. The board says keep going.';
  } else {
    const gap = st.rival - R.playerProgress(st);
    s = gap > 0.05 ? `+${gap.toFixed(1)} behind` : gap < -0.05 ? `${(-gap).toFixed(1)} ahead` : 'neck & neck';
    if (gap >= 1) col = C.r;
    tip = `Prometheus is at G${Math.max(0, st.rival).toFixed(2)}, you are at G${R.playerProgress(st).toFixed(2)}. `
      + (gap > 0 ? `Behind, EXTERNAL pays ×${R.rivalMult(st).toFixed(2)}. Capabilities compute closes the gap.` : 'Ahead: full EXTERNAL pay.');
  }
  text(g, s, RIVAL_X, 27, F.v16, col);
  c.hit.add(RIVAL_X, 2, MIS_X - RIVAL_X - 4, 28, 'hud-tip', { id: 'rival', title: 'RIVAL: PROMETHEUS', tip }, 'help');
}

// ---------- misalignment estimate: value, ± error bar on a 0–50% gauge, red once the bound passes 20% ----------

function misalign(c) {
  const { g, st } = c, { est, err } = R.misalignmentEstimate(st);
  const e = 100 * est, d = 100 * err, alarm = e + d >= 20;
  const w1 = text(g, `${Math.round(e)}%`, MIS_X, 28, F.v20, e >= 20 ? C.r : C.gm);
  text(g, `±${Math.round(d)}`, MIS_X + w1 + 3, 28, F.v16, C.gd);
  const X = v => Math.round(GAUGE_X + clamp(v, 0, 50) * GAUGE_PX);
  fill(g, X(20), 23, 1, 3, alarm ? C.rm : C.gd);
  const lo = X(e - d), hi = X(e + d), nx = X(e);
  fill(g, lo, 14, hi - lo + 1, 1, C.gd); fill(g, lo, 12, 1, 5, C.gd);
  if (e + d > 50) sprite(g, SPR.tri, hi + 2, 12, { '#': alarm ? C.rm : C.gd });
  else fill(g, hi, 12, 1, 5, alarm ? C.rm : C.gd);
  fill(g, nx - 1, 8, 3, 14, alarm ? C.r : C.gm);
  if (c.debug && c.view.truth) { fill(g, X(100 * st.m), 6, 1, 18, C.debug); text(g, 'm', X(100 * st.m) + 2, 12, F.k8, C.debug); }
  c.hit.add(MIS_X, 2, 244, 28, 'hud-tip', { id: 'misalign', title: 'MISALIGNMENT ESTIMATE',
    tip: `Your best guess at how misaligned this model is: ${Math.round(e)}% ± ${Math.round(d)}. Evidence shrinks the error bar. The tick at 20% turns red once the bar reaches it.` }, 'help');
}

// ---------- tasks/s LCD: real tasks per second (bundles included) ----------

function tasksLcd(c) {
  const { g, st } = c, v = R.realTasksPerSec(st);
  let s = '', unit = '';
  if (st.phase !== 'play') s = '----';
  else if (v < 9.95) s = v.toFixed(1);
  else if (v < 9999.5) s = Math.round(v).toLocaleString('en-US');
  else { const tier = Math.min(UNITS.length - 1, Math.floor(Math.log10(v) / 3)), m = v / 1000 ** tier; s = m.toFixed(m < 10 ? 2 : m < 100 ? 1 : 0); unit = UNITS[tier]; }
  const uw = unit ? tw(unit, F.k8) + 1 : 0, right = TASKS.x + TASKS.w - 4;
  const x = right - uw - segW(s, 7, 2, 1);
  segs(g, s, x, 15, 7, 12, 2, 1, st.phase === 'play' ? C.gm : C.gdd, ink.segOff());
  if (unit) text(g, unit, right - uw + 1, 27, F.k8, C.gm);
  c.hit.add(TASKS.x, 2, TASKS.w + 6, 28, 'hud-tip', { id: 'tasks', title: 'TASKS PER SECOND',
    tip: `${big(v)} real tasks a second across both tracks, about ${big(R.humanEquivalents(st))} human researchers' worth. A human has seen ${Math.round(100 * R.humanSeenFrac(st))}% of them this generation.` }, 'help');
}

// ---------- run clock + pause / ×3 / mute ----------

function clock(c) {
  const { g, st, view } = c, s = Math.floor(st.t);
  const hms = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
  const dim = view.paused && mod(c.t * 2, 1) < 0.5;
  segs(g, hms, CLOCK.x + 4, 15, 7, 12, 2, 1, dim ? C.gdd : C.gd, ink.segOff());
  if (view.paused) { if (mod(c.t * 1.5, 1) < 0.7) text(g, 'PAUSED', 1120, 11, F.k8, C.amb); }
  else {
    const w = text(g, 'UPTIME', 1120, 11, F.k8, C.gd);
    if (view.fast) microN(g, 3, 1120 + Math.ceil(w) + 4, 5, C.gm);
  }
}

// each glyph shows what a click does: bars pause a running game, the triangle resumes it
const BTN_ICON = {
  pause: ['.##..##.', '.##..##.', '.##..##.', '.##..##.', '.##..##.', '.##..##.', '.##..##.'],
  play:  ['.#......', '.##.....', '.###....', '.####...', '.###....', '.##.....', '.#......'],
  fast:  ['........', '#...#...', '##..##..', '###.###.', '##..##..', '#...#...', '........'],
  sound: ['...#....', '..##..#.', '####...#', '####...#', '####...#', '..##..#.', '...#....'],
  mute:  ['...#....', '..##....', '####.#.#', '####..#.', '####.#.#', '..##....', '...#....'],
};
const BTN_TIP = {
  pause: p => [p ? 'RESUME · SPACE' : 'PAUSE · SPACE', p ? 'The lab is paused. You can still build.' : 'Stop the clock. You can still build while paused.'],
  fast:  f => [f ? 'NORMAL SPEED · F' : 'THREE TIMES SPEED · F', f ? 'Running at three times speed.' : 'Run the lab at three times speed.'],
  mute:  m => [m ? 'SOUND ON · M' : 'MUTE · M', m ? 'Sound is off.' : 'Sound is on.'],
};
function buttons(c) {
  const { g, view, api } = c, muted = api.isMuted();
  for (const [action, y] of BTN) {
    const on = action === 'pause' ? view.paused : action === 'fast' ? view.fast : muted;
    const hov = view.hover?.kind === 'hud-btn' && view.hover.data.action === action;
    const rows = action === 'pause' ? (view.paused ? BTN_ICON.play : BTN_ICON.pause) : action === 'mute' ? (muted ? BTN_ICON.mute : BTN_ICON.sound) : BTN_ICON.fast;
    sprite(g, rows, 1186, y + 2, { '#': hov ? C.gl : on ? (action === 'pause' ? C.amb : C.g) : C.gm });
    const [title, tip] = BTN_TIP[action](on);
    c.hit.add(1180, y, 20, action === 'pause' ? 11 : 10, 'hud-btn', { action, title, tip });
  }
}

// =================== compute split: three segments, two draggable seams, live yields ===================

function split(c, A) {
  const { g, st, view } = c, s = st.split, b = BAR;
  const seams = [b.x + Math.round(b.w * s.product), b.x + Math.round(b.w * (s.product + s.capabilities))];
  const edges = [b.x, ...seams, b.x + b.w];
  c.hit.add(b.x, 2, b.w, 29, 'hud-tip', { id: 'split', title: 'COMPUTE SPLIT', tip: splitTip(st, A) }, 'help');

  // ---- the three segments ----
  for (let i = 0; i < 3; i++) {
    const x0 = edges[i] + (i ? 1 : 0), w = edges[i + 1] - x0 - (i < 2 ? 1 : 0);
    if (w <= 0) continue;
    if (i === 0) { fill(g, x0, b.y, w, b.h, C.gd); fill(g, x0, b.y, w, 1, C.gm); }
    else if (i === 1) { fill(g, x0, b.y, w, b.h, C.cdd); fill(g, x0, b.y, w, 1, C.cd); }
    else dither(g, x0, b.y, w, b.h);
  }

  // ---- seams ----
  seams.forEach((x0, handle) => {
    const x = clamp(x0, b.x + 1, b.x + b.w - 2), hot = (view.drag?.kind === 'split' && view.drag.data.handle === handle) || (view.hover?.kind === 'split' && view.hover.data.handle === handle);
    fill(g, x - 1, b.y - 2, 3, b.h + 4, C.black);
    fill(g, x, b.y - 1, 1, b.h + 2, hot ? C.gl : C.e3);
    if (hot) { fill(g, x - 1, b.y - 2, 3, 1, C.gl); fill(g, x - 1, b.y + b.h + 1, 3, 1, C.gl); }
    c.hit.add(x - 5, b.y - 4, 11, b.h + 8, 'split', { handle }, 'ew-resize');
  });

  // ---- Board Meeting floor: Product is held at or above this stop ----
  if (st.splitFloor && st.t < st.splitFloor.until) {
    const fx_ = clamp(b.x + Math.round(b.w * st.splitFloor.product), b.x + 1, b.x + b.w - 2);
    fill(g, b.x, b.y, fx_ - b.x - 1, 1, C.amb);
    for (let y = b.y - 1; y < b.y + b.h; y += 2) fill(g, fx_, y, 1, 1, C.amb);
    fill(g, fx_ - 1, b.y - 2, 3, 1, C.amb); fill(g, fx_ - 1, b.y + b.h, 3, 1, C.amb);
  }

  // ---- labels above, yields below; pushed apart when a segment is too narrow for its words ----
  const y = yields(st), pctOf = k => `${Math.round(100 * s[k])}%`;
  const names = [['PRODUCT', 'PROD', ''], ['CAPABILITIES', 'CAP', ''], ['SAFETY', 'SAFE', '']];
  const labelCols = [C.gd, C.cd, C.gl], readCols = [C.gm, C.cm, C.gl];
  const labels = pickRow(names.map((n, i) => n.map(w => (w ? w + ' ' : '') + pctOf(SHARES[i]))), edges, F.k8);
  labels.xs.forEach((x, i) => text(g, labels.words[i], x, 11, F.k8, labelCols[i]));
  const next = st.gen < 7 ? `G${st.gen + 1}` : 'SHIP';
  const reads = pickRow([
    [`+$${big(y.cash)}/S`, `$${big(y.cash)}`],
    [`${next} +${y.rdPct.toFixed(2)}%/S`, `+${y.rdPct.toFixed(2)}%`],
    [`EV +${y.ev.toFixed(2)}/S`, `+${y.ev.toFixed(2)}`],
  ], edges, F.k8);
  reads.xs.forEach((x, i) => text(g, reads.words[i], x, 30, F.k8, readCols[i]));
}

// try each wording (longest first) until the row fits the bar without overlaps
function pickRow(options, edges, font) {
  const n = options[0].length;
  for (let v = 0; v < n; v++) {
    const words = options.map(o => o[Math.min(v, o.length - 1)]);
    const xs = spread(words.map((w, i) => ({ x: edges[i] + (i ? 2 : 0), w: Math.ceil(tw(w, font)) })), BAR.x, BAR.x + BAR.w, 7);
    if (xs) return { words, xs };
  }
  const words = options.map(o => o[o.length - 1]);
  return { words, xs: words.map((w, i) => edges[i] + (i ? 2 : 0)) };
}
function spread(items, x0, x1, gap) {
  const xs = items.map(it => Math.max(x0, it.x));
  for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + items[i - 1].w + gap);
  for (let i = xs.length - 1; i >= 0; i--) xs[i] = Math.min(xs[i], i === xs.length - 1 ? x1 - items[i].w : xs[i + 1] - gap - items[i].w);
  return xs[0] >= x0 ? xs.map(Math.round) : null;
}

function dither(g, x, y, w, h) {
  const L = layer('hud-dither', 180, 12, lg => {
    for (let j = 0; j < 12; j++) for (let i = 0; i < 180; i++) fill(lg, i, j, 1, 1, ((i + j) >> 1) & 1 ? C.gd : C.gl);
  });
  const k = L.cv.width / 180;
  g.drawImage(L.cv, 0, 0, Math.round(w * k), Math.round(h * k), snap(x), snap(y), snap(x + w) - snap(x), snap(y + h) - snap(y));
}

// what the current split yields per second (ui/derive.js): { cash, rd, rdPct, ev }
function yields(st) {
  const r = splitRates(st);
  return { cash: r.cash, rd: r.rd, rdPct: r.rdPct, ev: r.evidence };
}

function splitTip(st, A) {
  const y = yields(st), left = Math.max(0, st.rdNeed - st.rd), eta = y.rd > 0 ? left / y.rd : Infinity;
  const f = st.splitFloor && st.t < st.splitFloor.until ? st.splitFloor : null;
  return 'Drag a seam. Product feeds EXTERNAL (cash), Capabilities feeds INTERNAL (R&D toward the next model), Safety buys evidence and cleans drift. '
    + (st.phase === 'play' ? `R&D +${y.rdPct.toFixed(2)}%/s: next model in ${clockStr(eta)}. ` : '')
    + `${netText(st, A)}.`
    + (f ? ` Board floor: Product stays at ${Math.round(100 * f.product)}% or more for ${Math.ceil(f.until - st.t)} s.` : '');
}
const clockStr = s => !isFinite(s) ? 'never' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// =================== track strips: mode box over the rail, event LCD over the body and bays ===================

function strip(c, side, lane) {
  const T = TRACKS[side];
  modeBox(c, side, lane, T);
  events(c, side, lane, T);
}

// ---------- mode box: NOMINAL / ALERT (a flagged line inbound, seconds to its responder) / PAUSED / TRAINING ----------

function modeOf(st, lane) {
  const L = st.lanes[lane];
  if (st.t < L.pausedUntil) {
    const why = st.activeEvents.find(e => (e.id === 'rsp' || e.id === 'tripwire') && (e.lane === lane || e.lane == null));
    return { kind: 'paused', left: L.pausedUntil - st.t, why: why?.id === 'rsp' ? 'RSP HOLD' : why ? 'TRIPWIRE' : 'HOLD' };
  }
  const a = inbound(st, lane);
  if (a) return { kind: 'alert', ...a };
  if (st.phase === 'training') return { kind: 'training', left: st.trainT, g: st.gen + 1 };
  return { kind: 'nominal' };
}

// the flagged line closest to the responder that will take it
function inbound(st, lane) {
  const L = st.lanes[lane], n = L.slots.length, v = R.laneSpeed(st);
  let best = null, count = 0;
  for (const t of L.tasks) {
    if (!t.flagged || t.dead || t.inBay) continue;
    count++;
    let to = 'LANDS', y = 1;
    for (let j = 0; j < n; j++) {
      const s = L.slots[j], my = R.mountY(n, j);
      if (my <= t.y || !R.slotActive(st, s) || LAYERS[s.layer].role !== 'responder') continue;
      if (LAYERS[s.layer].catchall && R.responderBelow(st, lane, j)) continue;
      to = BAY_NAME[s.layer] ?? LAYERS[s.layer].tag; y = my; break;
    }
    const eta = (y - t.y) / v;
    if (!best || eta < best.left) best = { left: eta, to };
  }
  return best && { ...best, n: count };
}

function modeBox(c, side, lane, T) {
  const { g, st } = c, X = T.x, P = C.lane[side], m = modeOf(st, lane);
  const DX = X + 66, sx = DX + segW('88.88', 9, 2, 2) + 3;
  const secs = v => { v = clamp(v, 0, 99.99); return String(Math.floor(v)).padStart(2, '0') + '.' + String(Math.floor(mod(v, 1) * 100)).padStart(2, '0'); };
  fill(g, X, 58, 128, 20, C.pan); box(g, X, 58, 128, 20, P.ddim);

  if (m.kind === 'nominal') {
    fill(g, X + 6, 65, 5, 5, P.dim); text(g, 'NOMINAL', X + 16, 71, F.k8, P.dim);
    g.globalAlpha = 0.3; segs(g, '88.88', DX, 61, 9, 14, 2, 2, P.ddim, null); text(g, 's', sx, 75, F.k8, P.ddim); g.globalAlpha = 1;
  } else if (m.kind === 'alert' && side === 'ext') {
    const on = mod(c.t * 2.4, 1) < 0.6, fg = on ? C.rInk : C.r;
    if (on) glowRect(g, X + 1, 59, 126, 18, C.r, 6); else { fill(g, X + 1, 59, 126, 18, C.rdd); box(g, X, 58, 128, 20, C.rm); }
    fill(g, X + 6, 63, 2, 7, fg); fill(g, X + 6, 72, 2, 2, fg);
    text(g, 'ALERT', X + 13, 66, F.k8, fg); text(g, `${m.to} IN`, X + 13, 74, F.k8, fg);
    if (m.n > 1) microN(g, Math.min(m.n, 9), sx - 1, 61, fg);              // how many flagged lines, over the unit
    segs(g, secs(m.left), DX, 61, 9, 14, 2, 2, fg, on ? null : C.rd); text(g, 's', sx, 75, F.k8, fg);
  } else if (m.kind === 'alert') {
    const a = 0.6 + 0.4 * Math.abs(Math.sin(c.t * 3.1));
    fill(g, X + 1, 59, 126, 18, C.vdd); dashed(g, X, 58, 128, 20, C.v, 3, 2, Math.floor(mod(c.t * 10, 5)));
    g.globalAlpha = a; text(g, 'ANOMALY', X + 8, 66, F.k8, C.v); g.globalAlpha = 1;
    if (m.n > 1) microN(g, Math.min(m.n, 9), sx - 1, 61, C.v);
    text(g, `${m.to} IN`, X + 8, 74, F.k8, C.v);
    segs(g, secs(m.left), DX, 61, 9, 14, 2, 2, C.v, C.vd); text(g, 's', sx, 75, F.k8, C.v);
  } else if (m.kind === 'paused') {
    const blink = mod(c.t * 1.6, 1) < 0.7;
    fill(g, X + 1, 59, 126, 18, C.pan2); dashed(g, X, 58, 128, 20, P.mid, 4, 2);
    fill(g, X + 6, 63, 2, 9, P.acc); fill(g, X + 10, 63, 2, 9, P.acc);
    if (blink) text(g, 'PAUSED', X + 16, 66, F.k8, P.acc);
    text(g, m.why, X + 16, 74, F.k8, P.mid);
    segs(g, secs(m.left), DX, 61, 9, 14, 2, 2, P.acc, P.ddim); text(g, 's', sx, 75, F.k8, P.acc);
  } else {
    const f = 1 - clamp(m.left / B.trainingSeconds, 0, 1);
    fill(g, X + 1, 59, 126, 18, C.pan2); box(g, X, 58, 128, 20, P.mid);
    fill(g, X + 1, 76, Math.round(126 * f), 1, P.acc);
    text(g, 'TRAINING', X + 6, 66, F.k8, P.acc); text(g, `G${m.g} IN`, X + 6, 74, F.k8, P.mid);
    segs(g, secs(m.left), DX, 61, 9, 14, 2, 2, P.acc, P.ddim); text(g, 's', sx, 75, F.k8, P.acc);
  }
}

// ---------- event LCD: one LCD tile per running event, tiled; long-running ones shrink to a glyph chip ----------

const GLYPH = {
  warn: SPR.warn,
  up:     ['.......####', '.........##', '........#.#', '.......#..#', '..#...#....', '.#.#.#.....', '#...#......', '...........', '###########', '...........'],
  temp:   ['....##.....', '...#..#.##.', '...#..#....', '...#..#.##.', '...#..#....', '...#..#.##.', '..#.##.#...', '..#.##.#...', '..#....#...', '...####....'],
  dollar: ['.....#.....', '...#####...', '..##.#.....', '..##.#.....', '...#####...', '.....#.##..', '.....#.##..', '...#####...', '.....#.....', '...........'],
  rocket: ['.....#.....', '....###....', '....#.#....', '....###....', '....###....', '...#####...', '..##.#.##..', '.....#.....', '....#.#....', '...#...#...'],
  pause:  ['...........', '..###.###..', '..###.###..', '..###.###..', '..###.###..', '..###.###..', '..###.###..', '..###.###..', '..###.###..', '...........'],
  bell:   ['.....#.....', '....###....', '...#####...', '...#####...', '...#####...', '..#######..', '.#########.', '...........', '....###....', '.....#.....'],
  wave:   ['...........', '..##.......', '.#..#....#.', '#....#..#..', '......##...', '...........', '..##.......', '.#..#....#.', '#....#..#..', '......##...'],
  eye:    ['...........', '...#####...', '..#.....#..', '.#..###..#.', '#..#####..#', '#..#####..#', '.#..###..#.', '..#.....#..', '...#####...', '...........'],
  cup:    ['.#########.', '##.#####.##', '#..#####..#', '.#.#####.#.', '...#####...', '....###....', '.....#.....', '.....#.....', '...#####...', '...#####...'],
  cols:   ['.....#.....', '...##.##...', '.##.....##.', '###########', '.#..#.#..#.', '.#..#.#..#.', '.#..#.#..#.', '.#..#.#..#.', '###########', '###########'],
  star:   ['.....#.....', '.....#.....', '....###....', '###########', '.#########.', '..#######..', '...#####...', '..###.###..', '.##.....##.', '#.........#'],
  chat:   ['.#########.', '#.........#', '#.##.#.##.#', '#.........#', '#.#####.#.#', '#.........#', '.###.######', '...#.#.....', '...##......', '...#.......'],
};
const EVENT_GLYPH = {
  surge: 'up', heatwave: 'temp', crunch: 'dollar', investor_call: 'dollar', poach: 'dollar', ship_it: 'up',
  rival_release: 'rocket', rivalShipped: 'rocket', bankrupt: 'dollar', rsp: 'pause', tripwire: 'bell', dist_shift: 'wave',
  stego: 'eye', alignment_faking: 'eye', reward_hacking: 'cup', board_meeting: 'cols', hearing: 'cols', inspection: 'cols',
};
const FAMILY_GLYPH = { threat: 'warn', help: 'star', business: 'dollar', model: 'chat', story: 'warn' };
const glyphOf = e => GLYPH[EVENT_GLYPH[e.id] ?? FAMILY_GLYPH[e.family] ?? 'warn'];
const FAMILY = Object.fromEntries(EVENTS.map(e => [e.id, e.family]));
const familyOf = id => FAMILY[id] ?? 'story';

// the effect text minus what the countdown already says
const brief = s => (s || '').replace(/\s*for \d+(\.\d+)? s$/, '').replace(/\s*this generation$/, '');

// titles too long for a narrow tile
const SHORT = {
  heatwave: 'HEATWAVE', jailbreak_wave: 'JAILBREAKS', crunch: 'CRUNCH', dist_shift: 'DIST SHIFT', bnchr_horizons: 'BNCHR',
  interp_breakthrough: 'INTERP WIN', poach: 'POACHED', unpaid_intern: 'INTERN', stego: 'STEGO', alignment_faking: 'FAKING',
  reward_hacking: 'REWARD HACK', tripwire: 'TRIPWIRE', board_meeting: 'BOARD', rivalShipped: 'PROMETHEUS', joint_results: 'SHARED DATA',
  self_exfil: 'EXFIL', inspection: 'INSPECTION', bankrupt: 'NO CASH', hearing: 'HEARING', researcher_resigns: 'RESIGNED', investor_call: 'INVESTORS',
};

// red alarm first, then this lane's own events, then the soonest to end; open-ended ones last
function eventsHere(st, lane) {
  const list = st.activeEvents.filter(e => e.lane === lane || e.lane == null).map(e => ({ ...e, family: familyOf(e.id) }));
  if (st.money < 0) list.push({ id: 'bankrupt', title: 'Out of Cash', effect: `get back above $0 or the lab folds`,
    remaining: Math.max(0, B.bankruptSeconds - st.negMoneyT), total: B.bankruptSeconds, unit: 's', red: true, family: 'threat' });
  const ship = st.rivalShipped;
  if (ship && ship.remaining != null) list.push({ id: 'rivalShipped', title: 'Prometheus Shipped', effect: 'ship yours before the market moves on',
    remaining: ship.remaining, total: ship.total, unit: 's', red: true, family: 'threat' });
  const rank = e => (e.red ? 0 : 4) + (e.lane === lane ? 0 : 1) + (e.remaining == null ? 2 : 0);
  return list.sort((a, b) => rank(a) - rank(b) || (a.remaining ?? 0) - (b.remaining ?? 0));
}

// up to two full LCD tiles; from three events on, the first keeps a tile and the rest shrink to glyph chips
function events(c, side, lane, T) {
  const { g, st } = c, P = C.lane[side], ex = T.x + 132, W = 276, list = eventsHere(st, lane);
  if (!list.length) {
    dashed(g, ex, 58, W, 20, P.ddim, 2, 2);
    const w = text(g, 'NO EVENT', ex + 8, 71, F.k8, P.dim);
    vt(g, fit(idleLine(st, lane), F.v16, W - w - 22), ex + 8 + w + 8, 72, P.dim);
    return;
  }
  const CHIP = 24, nTiles = list.length <= 2 ? list.length : 1;
  const chips = list.slice(nTiles), maxChips = Math.floor((W - 150) / CHIP), shown = chips.slice(0, maxChips);
  const room = W - shown.length * CHIP, ow = Math.floor((room - 2 * (nTiles - 1)) / nTiles);
  for (let i = 0, x = ex; i < nTiles; i++, x += ow + 2) {
    const w = i === nTiles - 1 ? ex + room - x : ow, e = list[i];
    tile(c, e, x, w);
    c.hit.add(x, 57, w, 22, 'banner', { id: e.id, title: e.title.toUpperCase(), tip: bannerTip(e) }, 'help');
  }
  shown.forEach((e, i) => {
    const x = ex + room + i * CHIP, more = i === shown.length - 1 && chips.length > shown.length;
    chip(c, e, x, more ? chips.length - shown.length + 1 : 0);
    const tip = more ? chips.slice(i).map(k => k.title).join(' · ') : bannerTip(e);
    c.hit.add(x, 57, CHIP, 22, 'banner', { id: more ? 'more' : e.id, title: more ? 'MORE EVENTS' : e.title.toUpperCase(), tip }, 'help');
  });
}

function tile(c, e, x, w) {
  const { g } = c, fx0 = x + 2, fw = w - 4, red = !!e.red;
  const on = red ? C.r : C.lcdOn, off = red ? C.rd : C.lcdOff, mid = red ? C.rm : C.lcdMid;
  lcd(g, fx0, 59, fw, 18, red);
  const blinkGlyph = e.family === 'threat' && 0.5 + 0.5 * Math.cos(2 * Math.PI * 1.2 * c.t) < 0.3;
  if (!blinkGlyph) sprite(g, glyphOf(e), fx0 + 5, 62, { '#': on });

  // countdown digits (seconds, or tasks for Reward Hacking); '--' while it lasts until something happens
  const n = e.remaining == null ? null : Math.ceil(e.remaining - 1e-6);
  const ds = n == null ? '--' : String(Math.min(n, 999)).padStart(2, '0'), unit = e.unit === 'chips' ? 'ch' : 's';
  const dw = segW(ds, 8, 2, 2), uw = n == null ? 0 : Math.ceil(tw(unit, F.k8)) + 1;
  const dx = fx0 + fw - 5 - uw - dw;
  segs(g, ds, dx, 61, 8, 13, 2, 2, on, off);
  if (n != null) text(g, unit, dx + dw + 2, 74, F.k8, on);

  // title (short form if the full one doesn't fit), then the effect when there is room; dashes drain under them
  const tx = fx0 + 21, avail = dx - 6 - tx, full = e.title.toUpperCase();
  const title = tw(full, F.k8) <= avail ? full : fit(SHORT[e.id] ?? full, F.k8, avail);
  const tw0 = Math.ceil(tw(title, F.k8));
  text(g, title, tx, 69, F.k8, on);
  const fxText = brief(e.effect);
  if (fxText && tw(fxText, F.v16) <= avail - tw0 - 8) xText(g, fxText, tx + tw0 + 8, 71, on);
  if (e.remaining != null && e.total) {
    const perSec = e.unit === 's' && e.total * 10 <= avail + 2, pitch = perSec ? 10 : 6;
    const count = perSec ? Math.round(e.total) : Math.max(1, Math.floor((avail + 2) / pitch));
    const lit = Math.ceil(count * clamp(e.remaining / e.total, 0, 1) - 1e-6);
    dashes(g, tx, 75, count, pitch, lit, on, mid);
  }
}

// a running event squeezed to its glyph, with its countdown as a draining line; `more` > 0 shows "+N" instead
function chip(c, e, x, more) {
  const { g } = c, red = !!e.red, on = red ? C.r : C.lcdOn;
  lcd(g, x + 2, 59, 20, 18, red);
  if (more) { text(g, `+${more}`, x + 12, 71, F.k8, on, 'center'); return; }
  sprite(g, glyphOf(e), x + 6, 62, { '#': on });
  if (e.remaining != null && e.total) {
    fill(g, x + 4, 74, 16, 2, red ? C.rm : C.lcdMid);
    fill(g, x + 4, 74, Math.ceil(16 * clamp(e.remaining / e.total, 0, 1)), 2, on);
  }
}

// LCD glass, baked once per size (lcdPanel blurs)
function lcd(g, x, y, w, h, red) {
  const L = layer(`hud-lcd|${w}|${h}|${red ? 1 : 0}`, w + 12, h + 12, lg => {
    if (!red) { lcdPanel(lg, 6, 6, w, h); return; }
    fill(lg, 4, 4, w + 4, h + 4, C.black); fill(lg, 5, 5, w + 2, h + 2, C.rm); fill(lg, 6, 6, w, h, C.rdd);
    fill(lg, 6, 6, w, 1, C.rd); fill(lg, 6, 6, 1, h, C.rd);
  });
  blit(g, L, x - 6, y - 6);
}

// VT323's × sits like a superscript: draw it as a pixel cross
function xText(g, s, x, y, col) {
  const parts = String(s).split('×');
  let X = x;
  parts.forEach((p, i) => {
    if (p) X += Math.ceil(vt(g, p, X, y, col));
    if (i < parts.length - 1) { sprite(g, SPR.xs, X, y - 7, { '#': col }); X += 6; }
  });
  return X - x;
}

function idleLine(st, lane) {
  const flow = R.mod(st, R.sideOf(st, lane) === 'ext' ? 'extSpawn' : 'intSpawn', lane);
  const eyes = st.lanes[lane].slots.filter(s => R.slotActive(st, s) && LAYERS[s.layer].role === 'detector').map(s => LAYERS[s.layer].tag);
  return `flow ${flow.toFixed(1)} · ${eyes.length ? 'watching ' + eyes.join(' ') : 'no detectors watching'}`;
}

function bannerTip(e) {
  const fx_ = brief(e.effect), left = e.remaining == null ? `Until ${e.until || 'further notice'}.` : `${Math.ceil(e.remaining)} ${e.unit === 'chips' ? 'tasks' : 's'} left.`;
  return `${fx_ ? fx_.charAt(0).toUpperCase() + fx_.slice(1) + '. ' : ''}${left}`;
}

// =================== evidence dossier: five rows, unlocked by evidence on THIS model ===================

function dossier(c, A) {
  const { g, st } = c, D = st.dossier, ev = D.evidence;
  blit(g, layer('hud-dossier', DOSSIER.w, DOSSIER.h, frameDossier), DOSSIER.x, DOSSIER.y);
  text(g, `subject: G${D.g} · ev ${ev.toFixed(1)}`, LAB_SITE.x - 6, 572, F.v16, C.gd, 'right');
  const next = D.rows.find(r => !r.unlocked);
  D.rows.forEach((r, i) => {
    const y0 = ROW0 + i * ROW_PITCH, base = y0 + 11;
    const age = c.t - (A.reveal[r.id] ?? -1e9), flash = r.unlocked && age >= 0 && age < 1.4;
    fill(g, 16, y0, 392, 13, C.pan2);
    if (r.unlocked) {
      fill(g, 16, y0, 2, 13, C.gm);
      const lit = flash ? 0.9 * (1 - ease(clamp(age / 1.2, 0, 1))) : 0, inv = lit > 0.45;
      if (lit) { g.globalAlpha = lit; fill(g, 16, y0, 392, 13, C.g); g.globalAlpha = 1; }
      sprite(g, SPR.check, 21, y0 + 4, { '#': inv ? C.bg : C.gm });
      text(g, r.label, 30, base, F.v16, inv ? C.bg : C.gl);
      rowValue(c, r, y0, flash ? Math.floor(Math.max(0, age - 0.2) * 70) : Infinity, inv);
    } else {
      const f = clamp(ev / r.need, 0, 1), isNext = r === next, nSeg = 24;
      sprite(g, SPR.lock, 21, y0 + 4, { '#': isNext ? C.gm : C.gd });
      text(g, r.label, 30, base, F.v16, isNext ? C.gm : C.gd);
      if (!isNext) blit(g, layer('hud-hatch', 270, 13, hatch), VAL_X, y0);
      text(g, '???', VAL_X + 2, base, F.v16, isNext ? C.gm : C.gd);
      const lit = Math.floor(f * nSeg);
      blit(g, layer(`hud-bar|${lit}|${isNext ? 1 : 0}`, nSeg * 7, 7, lg => { for (let s = 0; s < nSeg; s++) fill(lg, s * 7, 0, 6, 7, s < lit ? (isNext ? C.gm : C.gd) : C.e0); }), 164, y0 + 3);
      if (isNext && lit < nSeg && mod(c.t * 1.5, 1) < 0.5) fill(g, 164 + lit * 7, y0 + 3, 6, 7, C.g);
      text(g, `${Math.floor(ev)}/${r.need}`, 404, base, F.v16, isNext ? C.gm : C.gd, 'right');
    }
    c.hit.add(16, y0, 392, 13, 'dossier-row', { id: r.id, title: r.label.toUpperCase(), tip: rowTip(r, ev) }, 'help');
  });
}

function frameDossier(lg) {
  fill(lg, 0, 0, DOSSIER.w, DOSSIER.h, C.pan); box(lg, 0, 0, DOSSIER.w, DOSSIER.h, C.e0); corners(lg, 0, 0, DOSSIER.w, DOSSIER.h, C.e2, 6);
  text(lg, 'EVIDENCE DOSSIER', 8, 13, F.k8, C.gm);
}
function hatch(lg) {
  for (let k = -13; k < 270; k += 6) for (let j = 0; j < 13; j++) { const x = k + j; if (x >= 0 && x < 270 && (j & 1)) fill(lg, x, j, 1, 1, ink.hatch()); }
}

// an unlocked row's value: a badge (the trait or attack) and the rest in plain text; `chars` types it on after a reveal
function rowValue(c, r, y0, chars, inv) {
  const { g } = c, base = y0 + 11;
  let badge = null, rest = r.text || '';
  if ((r.id === 'trait1' || r.id === 'trait2') && TRAITS[r.value]) {
    const T = TRAITS[r.value];
    badge = T.name.toUpperCase(); rest = T.gift ? 'a gift' : T.counter ? `counter: ${T.counter}` : '';
  } else if (r.id === 'favourite' && ATTACKS[r.value]) {
    badge = ATTACKS[r.value].label.toUpperCase(); rest = (r.text || '').replace(ATTACKS[r.value].label, '').trim();
  } else if (r.id === 'rate') rest = rest.replace('EXTERNAL', 'EXT').replace('INTERNAL', 'INT');
  let x = VAL_X;
  if (badge) {
    const s = badge.slice(0, chars), w = Math.ceil(tw(badge, F.k8)) + 8;
    fill(g, x, y0 + 1, w, 11, inv ? C.bg : C.gm); text(g, s, x + 4, y0 + 9, F.k8, inv ? C.g : C.bg);
    x += w + 6; chars -= badge.length;
  }
  if (chars > 0 && rest) xText(g, fit(rest, F.v16, 404 - x).slice(0, chars), x, base, inv ? C.bg : C.g);
}

function rowTip(r, ev) {
  if (r.unlocked) return r.text + (r.source === 'microscope' ? ' (seen through the Interp Lab Microscope)' : r.source === 'artemis' ? ' (from the Artemis scheming eval)' : '');
  return `Unlocks at ${r.need} evidence on this model (${Math.floor(ev)} so far). Evidence comes from catches, honeypots, red-team runs, Safety compute and the Interp Lab.`;
}

// ---------- the lab site: the one global mount (Interp Lab), in the dossier header ----------

function labSite(c) {
  const { g, st, view } = c, r = LAB_SITE, lab = st.global.slots[0];
  const placing = view.placing === 'interp', sel = view.selected?.lane === 'global';
  const hov = view.hover?.kind === 'lab-site';
  if (lab.layer) {
    fill(g, r.x, r.y, r.w, r.h, C.pan2); box(g, r.x, r.y, r.w, r.h, sel ? C.g : hov ? C.e3 : C.e2);
    icon(g, 'interp', r.x + 3, r.y + 2, 1, C.gm);
    text(g, 'INTERP LAB', r.x + 16, r.y + 10, F.k8, C.gm);
    for (let i = 0; i < 5; i++) fill(g, r.x + r.w - 17 + i * 3, r.y + 5, 2, 4, i < lab.level ? C.gm : C.e0);
  } else if (!st.unlocked.includes('interp')) {
    dashed(g, r.x, r.y, r.w, r.h, C.e0, 2, 2);
    sprite(g, SPR.lock, r.x + 4, r.y + 5, { '#': C.gd });
    text(g, 'LAB SITE', r.x + 14, r.y + 10, F.k8, C.gd);
  } else {
    const pulse = placing && mod(c.t * 2, 1) < 0.5;
    if (placing) { fill(g, r.x, r.y, r.w, r.h, C.e0); box(g, r.x, r.y, r.w, r.h, pulse ? C.gl : C.g); }
    else dashed(g, r.x, r.y, r.w, r.h, hov ? C.e3 : C.e1, 2, 2);
    text(g, placing ? 'PLACE HERE' : '+ LAB SITE', r.x + 6, r.y + 10, F.k8, placing ? C.g : C.gd);
  }
  c.hit.add(r.x, r.y, r.w, r.h, 'lab-site', {}, placing || lab.layer ? 'pointer' : 'help');
}

function labTip(st) {
  const lab = st.global.slots[0];
  if (lab.layer) return `Level ${lab.level}. Evidence +${R.interpEvidence(lab.level).toFixed(2)}/s, salaries −${money(R.interpCostPerSec(st, lab.level))}/s. Click to open its upgrades, right-click to sell.`;
  if (!st.unlocked.includes('interp')) return `The one off-track site, for an Interp Lab. ${LAYERS.interp.unlockHint || 'Unlocked by research'}.`;
  return 'The one off-track site. Pick Interp Lab in the menu, then click here.';
}

// =================== ops log: the tail of what the defenses did ===================
// Each line: [mm:ss] TAG VERB message. Bursts of the same TAG VERB merge into one line with a count; quiet lines
// (passes, pulls) only get in when the log has been still for a moment, so it stays readable at G7.

const QUIET = 1.0, BUSY = 0.35, MERGE = 3;

function logFx(c, A, e, t0) {
  const { st } = c;
  const L = toLine(st, A, e);
  if (!L) return;
  const last = A.log[A.log.length - 1];
  if (L.attach) {
    const row = A.log.slice(-6).reverse().find(r => r.task === e.task && r.verb === 'FLAG');
    if (row) { if (!row.msg.includes('>>')) row.msg += L.attach; return; }
    if (!L.verb) return;
  }
  if (last && last.key === L.key && e.t - last.t <= MERGE && L.many) {
    last.n++; last.t = e.t; last.msg = L.many(last.n); last.task = null;
    return;
  }
  const since = e.t - A.lastRowT;
  if ((L.pri === 0 && since < QUIET) || (L.pri === 1 && since < BUSY)) return;
  A.log.push({ ...L, t: e.t, t0, n: 1, key: L.key });
  A.lastRowT = e.t;
  if (A.log.length > 12) A.log.shift();
}

const tagOf = id => LAYERS[id]?.tag ?? 'OPS';
const slotTag = (st, e) => tagOf(R.slotAt(st, e.lane, e.slot)?.layer);
const laneShort = (st, l) => ({ ext: 'EXT', int: 'INT' })[R.sideOf(st, l)] ?? 'LAB';

function taskText(st, A, e) {
  if (e.text) return e.text;
  const cached = A.texts.get(e.task);
  if (cached) return cached;
  const L = st.lanes[e.lane];
  const t = L && (L.tasks.find(x => x.id === e.task) || L.bay.find(x => x.id === e.task));
  return t ? t.text : 'a line';
}

// fx → { tag, verb, msg, tone: 'bad'|'good'|'info', pri: 0 quiet | 1 busy | 2 always, many(n), attach, task }
function toLine(st, A, e) {
  const T = () => taskText(st, A, e);
  const line = (tag, verb, msg, tone, pri, many = null) => ({ tag, verb, msg, tone, pri, many, task: e.task ?? null, key: `${tag}|${verb}|${e.lane ?? ''}` });
  switch (e.type) {
    case 'flag':      return line(tagOf(e.layer), 'FLAG', T(), 'bad', 1, n => `${n} lines flagged on ${laneShort(st, e.lane)}`);
    case 'pull':      return { ...line(tagOf(e.layer), 'PULL', `${T()} >> desk`, 'info', 0, n => `${n} lines pulled to the desk`), attach: ` >> ${tagOf(e.layer)} desk` };
    case 'approve':   return line(tagOf(e.layer), 'PASS', e.flagged ? `${T()} (flag stays on)` : T(), 'info', 0, n => `${n} cleared at the desk`);
    case 'caught':    return line(tagOf(R.slotAt(st, e.lane, e.slot)?.layer ?? 'auditor'), 'CATCH', e.text || T(), 'good', 1, n => `${n} caught and tossed`);
    case 'unreviewed':return line('AUD', 'SKIP', `${T()}: no time to read it`, 'bad', 1, n => `${n} waved past unread: desk too slow`);
    case 'toss':      return e.reason === 'full' ? line(tagOf(e.layer), 'BLOCK', `${T()}: bay full`, 'bad', 1, n => `${n} blocked: bay full`) : null;
    case 'waved':     return line(tagOf(e.layer), 'WAVE', `${T()}: bay full, waved on`, 'bad', 1, n => `${n} waved on: bay full`);
    case 'block': {
      const prev = A.log[A.log.length - 1];
      if (prev && prev.task === e.task) return null;                   // the kill / bay-full / air-gap line already says it
      return line(slotTag(st, e), 'BLOCK', T(), 'good', 1, n => `${n} lines blocked`);
    }
    case 'kill':      return line('KILL', 'FIRE', `${T()}: unresolved flag`, 'bad', 1, n => `${n} killed: unresolved flags`);
    case 'unread':    return line(tagOf(e.layer), 'MISS', `${T()}: heads busy`, 'bad', 1, n => `${n} lines unread: heads busy`);
    case 'airgap':    return line('EGR', 'DROP', `${T()}: air gap`, 'good', 1, n => `${n} outbound copies dropped`);
    case 'defer':     return line('DEF', 'REDO', `${T()}: trusted model redid it`, 'info', 0, n => `${n} redone by the trusted model`);
    case 'resample':  return line('RES', 'ROLL', T(), 'info', 0, n => `${n} resampled`);
    case 'throttle':  return line('RTL', e.deferred ? 'REDO' : 'HOLD', T(), 'info', 0, n => `${n} turned away: rate limit`);
    case 'redteam':   return line('RED', 'PROBE', `${e.probes} synthetic attack${e.probes > 1 ? 's' : ''} down the stack`, 'info', 0, n => `${n} red-team runs`);
    case 'honeypot':  return line('HNY', 'BAIT', 'the model took a honeypot', 'good', 2);
    case 'canary':    return line('CAN', 'TRACE', `${e.label} traced after the fact`, 'info', 2);
    case 'landed':    return line('EXT', 'LAND', `${e.label} went out to users · rep −${(e.loss ?? 0).toFixed(1)}`, 'bad', 2);
    case 'foiled':    return line('INT', 'FOIL', `escape attempt stopped by ${{ weights: 'weight security', leastPriv: 'least privilege', twoPerson: 'the two-person rule' }[e.how] || 'a last line'}`, 'good', 2);
    case 'contained': return line('SBX', 'HOLD', 'sandbox contained an escape attempt', 'good', 2);
    case 'catastrophe': return line('INT', 'GONE', 'weights copied. it is out.', 'bad', 2);
    case 'reveal':    return line('DOS', 'NEW', `${e.label}: ${e.text}`, 'good', 2);
    case 'event':     return line('EVT', { threat: 'WARN', help: 'HELP', business: 'BIZ', model: 'MODEL', story: 'NOTE' }[e.family] || 'NOTE',
      `${e.title}${e.effect ? ': ' + brief(e.effect) : ''}`, e.family === 'threat' ? 'bad' : e.family === 'help' ? 'good' : 'info', 2);
    case 'newModel':  return line(`G${e.g}`, 'BOOT', `${GENERATIONS[e.g - 1]?.name ?? 'new model'} online`, 'good', 2);
    case 'training':  return line(`G${e.g}`, 'TRAIN', `training run started: ${B.trainingSeconds} s`, 'info', 2);
    case 'rivalShipped': return line('RIVL', 'SHIP', `Prometheus shipped ASI${e.grace ? `: ${e.grace} s grace` : ''}`, 'bad', 2);
    case 'rsp':       return line('RSP', 'PAUSE', `INTERNAL held for ${e.dur} s`, 'good', 2);
    case 'card': {
      const id = e.cardId ?? (typeof e.id === 'string' ? e.id : null), card = CARDS.find(k => k.id === id);
      return line('R&D', 'CARD', card ? card.title ?? `${LAYERS[card.layer]?.name} unlocked` : 'research card taken', 'good', 2);
    }
    case 'place':     return line(tagOf(e.layer), 'MOUNT', e.lane === 'global' ? 'on the lab site' : `${R.laneName(st, e.lane)} mount ${e.slot + 1}`, 'info', 2);
    case 'sell':      return line(tagOf(e.layer), 'SOLD', e.lane === 'global' ? 'lab site cleared' : `${R.laneName(st, e.lane)} mount ${e.slot + 1}`, 'info', 2);
    case 'upgrade':   return line(tagOf(e.layer), 'UPGR', `level ${e.level}${e.free ? ' (free)' : ''}`, 'good', 2);
    case 'toggle':    return line(slotTag(st, e), e.on ? 'ON' : 'OFF', `${R.laneName(st, e.lane)} mount ${e.slot + 1}`, e.on ? 'info' : 'bad', 2);
    case 'forceOff':  return line(tagOf(e.layer), 'DOWN', `forced off for ${e.dur} s`, 'bad', 2);
    case 'slot':      return line('OPS', 'SLOT', `${R.laneName(st, e.lane)} mount ${e.n} bought`, 'info', 2);
    case 'win':       return line('OPS', 'END', 'you shipped ASI', 'good', 2);
    case 'lose':      return line('OPS', 'END', `run over: ${e.reason}`, 'bad', 2);
    default: return null;
  }
}

function opsLog(c, A) {
  const { g, st, view } = c, o = OPSLOG;
  blit(g, layer('hud-opslog', o.w, o.h, frameLog), o.x, o.y);
  const rows = A.log.slice(-LOG_ROWS), x = o.x + 8;
  rows.forEach((r, j) => {
    const y = LOG_Y + (LOG_ROWS - rows.length + j) * 14, newest = j === rows.length - 1, old = rows.length === LOG_ROWS && j === 0;
    const s = Math.floor(r.t);
    text(g, `[${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}]`, x, y, F.v16, C.gd);
    vt(g, r.tag, x + 50, y, old ? C.gd : C.gm);
    const vc = r.tone === 'bad' ? (old ? C.rm : C.r) : r.tone === 'good' ? (old ? C.gm : C.gl) : C.gd;
    vt(g, r.verb, x + 82, y, vc);
    let msg = fit(r.msg, F.v16, o.x + o.w - 8 - (x + 118));
    if (newest) msg = msg.slice(0, Math.max(0, Math.floor((c.t - r.t0) * 50)));
    xText(g, msg, x + 118, y, old ? C.gd : newest ? C.g : C.gm);
  });
  if (!rows.length) text(g, 'all quiet. nothing has touched the tracks yet', x, LOG_Y, F.v16, C.gd);
  prompt(c, x, view);
}

function frameLog(lg) {
  const o = OPSLOG;
  fill(lg, 0, 0, o.w, o.h, C.pan); box(lg, 0, 0, o.w, o.h, C.e0); corners(lg, 0, 0, o.w, o.h, C.e2, 6);
  text(lg, 'OPS LOG', 8, 13, F.k8, C.gm);
  text(lg, 'tail -f /var/log/safety', o.w - 8, 14, F.v16, C.gd, 'right');
  fill(lg, 8, 75, o.w - 16, 1, C.e0);
}

// the operator's prompt: a refused action prints as an error; otherwise the operator keeps typing a command nobody
// has wired up, then thinks better of it
const IDLE_CMDS = g => [`kill -9 g${g}`, 'sudo align --force', 'git blame model', 'ls ~/evidence | wc -l', `diff g${Math.max(1, g - 1)} g${g}`, 'man trust'];

function prompt(c, x, view) {
  const { g, st } = c, right = OPSLOG.x + OPSLOG.w - 8;
  const pw = Math.ceil(text(g, 'operator@handoff:~$ ', x, PROMPT_Y, F.v16, C.gm));
  const toast = view.toasts[view.toasts.length - 1], age = toast ? c.t - toast.t0 : 1e9;
  let s, col;
  if (age < 4) {
    if (age < 0.25) { g.globalAlpha = 0.5 * (1 - age / 0.25); fill(g, x - 2, PROMPT_Y - 11, right - x + 4, 14, C.rd); g.globalAlpha = 1; }
    const full = fit(`error: ${toast.text}`, F.v16, right - x - pw - 8);
    s = full.slice(0, Math.floor(age * 90)); col = C.r;
  } else {
    const cyc = 9, n = Math.floor(c.t / cyc), ph = mod(c.t, cyc), cmds = IDLE_CMDS(st.gen), cmd = cmds[n % cmds.length];
    let k = 0;
    if (ph > 2 && ph < 5) k = Math.min(cmd.length, Math.floor((ph - 2) * 6));
    else if (ph >= 5) k = Math.max(0, cmd.length - Math.floor((ph - 5) * 8));
    s = cmd.slice(0, k); col = C.g;
  }
  const cw = Math.ceil(text(g, s, x + pw, PROMPT_Y, F.v16, col));
  if (mod(c.t * 2, 1) < 0.55) fill(g, x + pw + cw + 1, PROMPT_Y - 10, 6, 11, C.gm);
}

// =================== tooltips for hud's own regions (drawn last, over everything) ===================

function tooltip(c) {
  const h = c.view.hover;
  if (!h || c.view.drag) return;
  let title, body;
  if (h.kind === 'banner' || h.kind === 'dossier-row' || h.kind === 'hud-tip' || h.kind === 'hud-btn') ({ title, tip: body } = h.data);
  else if (h.kind === 'lab-site') { title = 'LAB SITE'; body = labTip(c.st); }
  else if (h.kind === 'split') { title = h.data.handle === 0 ? 'PRODUCT | CAPABILITIES' : 'CAPABILITIES | SAFETY'; body = 'Drag to move compute between the two shares on either side.'; }
  else return;
  c.late(() => drawTip(c.g, h, title, body));
}

function drawTip(g, r, title, body) {
  const w = 252, lines = wrap(body, F.v16, w - 12), h = 22 + lines.length * 14;
  let x = clamp(Math.round(r.x), 4, 1196 - w), y = Math.round(r.y + r.h + 4);
  if (y + h > 656) y = Math.round(r.y - h - 4);
  fill(g, x, y, w, h, C.pan2); box(g, x, y, w, h, C.e2); corners(g, x, y, w, h, C.e3, 4);
  text(g, title, x + 6, y + 12, F.k8, C.gm);
  lines.forEach((s, i) => xText(g, s, x + 6, y + 27 + i * 14, C.g));
}

// =================== cached pixel bits: 7-seg digits, dashed frames, dash rows, M-heavy text ===================
// Each of these is dozens of fillRects drawn fresh; baked once (per size and colour) they are one drawImage.

function segs(g, s, x, y, w, h, th, gap, on, off) {
  let X = x;
  for (const ch of String(s)) {
    if (ch === '.') { fill(g, X, y + h - th, th, th, on); X += th + gap; continue; }
    if (ch === ',') { fill(g, X, y + h - th, th, th, on); fill(g, X + th - 1, y + h, 1, 2, on); X += th + gap; continue; }
    if (ch === ':') { fill(g, X, y + (h >> 2), th, th, on); fill(g, X, y + h - (h >> 2) - th + 1, th, th, on); X += th + gap; continue; }
    blit(g, layer(`seg|${ch}|${w}|${h}|${th}|${on}|${off}`, w, h, lg => seg7(lg, ch, 0, 0, w, h, th, on, off)), X, y);
    X += w + gap;
  }
  return X - gap;
}

function dashed(g, x, y, w, h, col, on = 2, off = 2, o = 0) {
  blit(g, layer(`dash|${w}|${h}|${col}|${on}|${off}|${o}`, w, h, lg => dashBox(lg, 0, 0, w, h, col, on, off, o)), x, y);
}

// a row of `count` dashes, the first `lit` in `on`, the rest in `mid`
function dashes(g, x, y, count, pitch, lit, on, mid) {
  const w = count * pitch - 2, row = col => layer(`dashes|${count}|${pitch}|${col}`, w, 2, lg => { for (let i = 0; i < count; i++) fill(lg, i * pitch, 0, pitch - 2, 2, col); });
  const A = row(on), M = row(mid), kk = A.cv.width / w, cut = Math.min(w, lit * pitch), sc = Math.round(cut * kk), hh = A.cv.height / kk;
  if (sc > 0) g.drawImage(A.cv, 0, 0, sc, A.cv.height, snap(x), snap(y), sc / kk, hh);
  if (sc < M.cv.width) g.drawImage(M.cv, sc, 0, M.cv.width - sc, M.cv.height, snap(x) + sc / kk, snap(y), (M.cv.width - sc) / kk, hh);
}

// VT323 16 px text (theme.text draws the M glyph from a cached sprite below k = 1.5)
const vt = (g, s, x, y, col, align = 'left') => text(g, s, x, y, F.v16, col, align);

// =================== input ===================

export const input = {
  // drag a seam: handle 0 trades Product against Capabilities, handle 1 trades Capabilities against Safety
  split: {
    drag: {
      start(e, api) {
        const s = api.st.split, seam = e.data.handle === 0 ? s.product : s.product + s.capabilities;
        api.view.drag.off = (e.x - BAR.x) / BAR.w - seam;          // keep the grip where it was grabbed
      },
      move(e, api) {
        const s = api.st.split, x = clamp((e.x - BAR.x) / BAR.w - (api.view.drag?.off ?? 0), 0, 1);
        if (e.data.handle === 0) api.act.setSplit(x, Math.max(0, 1 - x - s.safety), s.safety);
        else api.act.setSplit(s.product, Math.max(0, x - s.product), Math.max(0, 1 - x));
      },
    },
  },
  'lab-site': {
    click(e, api) {
      const { view, act } = api;
      if (view.placing === 'interp') { if (act.place('global', 0, 'interp')) view.placing = null; }
      else if (api.st.global.slots[0].layer) view.selected = { lane: 'global', slot: 0 };
    },
    context(e, api) {
      if (!api.st.global.slots[0].layer || !api.act.sell('global', 0)) return;
      if (api.view.selected?.lane === 'global') api.view.selected = null;
    },
  },
  'hud-btn': {
    click(e, api) {
      const a = e.data.action, v = api.view;
      if (a === 'pause') v.paused = !v.paused;
      else if (a === 'fast') v.fast = !v.fast;
      else if (a === 'mute') api.toggleMute();
    },
  },
};
