// ===== Tracks: both lanes. Rail plates, scope body, task lines, beams, side bays, completion edge =====
// Spec: design/UI-PLAN.md §5 and design/codec-mockups/variant-c.js (buildTrack, drawTrack, engage, chip, filler).
// Positions come from state (task.y, task.read, slot.busy, lane.bay, deskT). Pops, stamps and strikes come from fx.
// Text is never drawn over: sweeps, washes and read heads sit under the glyphs, two lines never share a row, and
// anything that would land on a line (alert pop, hung tag) is only drawn where the rows are free.
// Each track draws the lane view.focus picks for its side; colours, geometry and art go by side (TRACKS, C.lane).
// The header is the side's tab row (DESIGN-v3 §3b): one tab per lane with its lamp (laneStatus), a telegraphed contract
// as a ghost tab. An unfocused lane whose lamp turns red takes its track (at most once every AUTO_GAP s, never while a
// tab click pins the track). A closed contract lane shows its kit, OPEN LANE and the deadline.
// Juice (DESIGN-v3 §3g): caught red-handed (desk flash, stamp), a contract's tab slides in at DEPLOY, G7 burst lamps.
// Registers: mount {lane, slot} · slot-buy {lane} · bay {lane, slot} · lane-tab {side, id, tip} · lane-open {id}
//            · line {lane, id, text}   (lane = lane id)

import { LAYERS } from '../config/layers.js';
import { SIDES } from '../config/tasks.js';
import { LANE_UI, CONTRACT_UI, STAMPS, DEBT_METER, BURST, RESEARCH_UI, RETRAIN_CARD } from '../config/content/v3-text.js';
import { BALANCE as B } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import * as R from '../sim/rules.js';
import { money, pct, tpl } from '../util/format.js';
import { C, F, k, epoch, fill, box, dashH, dashBox, corners, text, tw, fit, blit, hash, clamp, lerp, ease, mod, strobe, calm } from './theme.js';
import { SPR, MICRO, sprite, icon } from './sprites.js';
import { TRACK, TRACKS, rowCentre, mountRect, trackY } from './layout.js';
import { animOf, cursorOf, drain, fxAge, focusLane, AUTO_GAP } from './view.js';
import { laneTab, laneTip } from './derive.js';
import { sheet } from './upgrade.js';
import * as tutorial from './tutorial.js';

// =================== geometry and timing ===================

const FT = TRACK.top, FB = TRACK.bottom, HOOD = TRACK.hood, BODY = TRACK.bodyW, MT = TRACK.rowTop, PITCH = TRACK.pitch;
const ROWS = TRACK.rows, GAP = TRACK.lineGap, EDGE_Y = 528;
const DEBT_MIN_LINES = 20;          // the debt meter shows its 90% range from this many INTERNAL lines on
const CW = 6;                         // VT323 16 is monospace: 6 px a character
const ASC = 13;                       // a cached line: logical px from its top to its baseline

// seconds
const T = {
  flag: 1.4, unread: 1.2, dead: 0.9, ghost: 0.6, slide: 0.35, stamp: 1.6, pop: 0.9, landed: 1.6, anomaly: 1.2,
  plate: 0.6, back: 0.4, dock: 1.0, lineIn: 0.15, spark: 0.4,
  falseAlarm: 0.8, glitch: 0.3, unrev: 1.4, tabFlash: 1.2, red: 2.4, arrive: 3, slideIn: 0.5,
};

// what a placed element does to a line beside it (the engage look) and what its badge says when it has no catch rate
const KIND = {
  probe: 'det', monitor: 'det', untrusted: 'det', cot: 'det', classifier: 'det', egress: 'det',
  auditor: 'bay', defer: 'bay', resampler: 'bay', killswitch: 'kill',
  paraphraser: 'par', sandbox: 'sbx', leastpriv: 'lp', ratelimit: 'env', honeypot: 'env', canary: 'env', redteam: 'env',
};
const WORD = { defer: 'BAY', resampler: 'BAY', killswitch: 'ARM', paraphraser: 'MOD', sandbox: 'ENV', leastpriv: 'ENV',
  ratelimit: 'CAP', honeypot: 'BAIT', canary: 'TRAP', redteam: 'TEST' };
const PLATE_NAME = { classifier: 'JB Classifier' };    // names longer than a plate (the hover card has the full one)
const BAY_NAME = { auditor: 'AUDIT', defer: 'DEFER', resampler: 'RESAMPLE' };
const BAY_REV = { auditor: 'REV', defer: 'REDO', resampler: 'ROLL' };
const STAMP = { approve: 'CLEARED', falseAlarm: STAMPS.falseAlarm, redo: 'REDONE', roll: 'REROLLED', pass: 'FLAG ON', caught: STAMPS.caught };
const STRIKE = { kill: `REFUSED ${STAMPS.refused}`, throttle: 'TURNED AWAY', airgap: 'AIR GAP', caught: STAMPS.caught };

const laneGeo = side => {
  const T0 = TRACKS[side], bx = T0.body.x;
  return { X: T0.x, bx, by: T0.bays.x, tx: bx + TRACK.textInset, ex: bx + BODY - 6 };
};

// =================== per-game animation state (view.anim.tracks) ===================

const laneAnim = () => ({
  winners: new Set(), shownAt: new Map(), last: new Map(),     // last frame's full lines: id → { text, flagged }
  dead: [],                                                     // struck or pulled lines, still flowing: see addDead()
  flags: new Map(), unread: new Map(), back: new Map(), via: new Map(), verdict: new Map(),
  plates: [], missed: null, pops: [], sparks: [], incident: null, anomaly: null,
  tokens: [], docks: {}, desks: {}, stamps: {}, lastStamp: {}, chipStamps: new Map(), glitch: null, unrev: [], meterT: -1e9, red: null,
});
// lanes: lane id → laneAnim() · tabs: lane id → { flash, lamp } (every lane, focused or not) · burst: the G7 warning
const animState = c => animOf(c.view, 'tracks', () => ({ lanes: {}, pruneAt: 0, tabs: {}, burst: null }));
const laneAnimOf = (A, lane) => A.lanes[lane] || (A.lanes[lane] = laneAnim());

// =================== caches ===================
// At G7 a frame holds ~35 lines, 20 plates and 20 beams, so nearly everything is a cached image blitted on whole device
// pixels: one drawImage is far cheaper than the rects and fillText calls it stands for.
// art(): small images painted once per scale / theme. aligned(): big layers painted on the board's own device-pixel
// grid (so a hood or a plate blitted back lands exactly where it was drawn). ink() / lineInk() / say(): cached text.

const ART = new Map();
function art(key, w, h, paint, sig = '') {
  const id = k + '|' + epoch + '|' + sig;
  let a = ART.get(key);
  if (!a || a.id !== id) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const lg = cv.getContext('2d');
    lg.setTransform(k, 0, 0, k, 0, 0); lg.imageSmoothingEnabled = false;
    paint(lg);
    a = { id, cv, w, h };
    if (ART.size > 1200) ART.clear();
    ART.set(key, a);
  }
  return a;
}

const ALIGNED = new Map();
function aligned(key, sig, x, y, w, h, paint) {
  const id = sig + '|' + k + '|' + epoch;
  let a = ALIGNED.get(key);
  if (!a || a.id !== id) {
    const ox = Math.floor(x * k), oy = Math.floor(y * k);
    const cv = a?.cv || document.createElement('canvas');
    cv.width = Math.ceil((x + w) * k) - ox; cv.height = Math.ceil((y + h) * k) - oy;
    const lg = cv.getContext('2d');
    lg.setTransform(k, 0, 0, k, -ox, -oy); lg.imageSmoothingEnabled = false;
    if (paint) paint(lg);
    a = { id, cv, ox, oy };
    ALIGNED.set(key, a);
  }
  return a;
}
const put = (g, a) => g.drawImage(a.cv, a.ox / k, a.oy / k, a.cv.width / k, a.cv.height / k);
// a logical sub-rect of an aligned layer, back onto the same device pixels
function putPart(g, a, x, y, w, h) {
  const x0 = Math.max(Math.round(x * k), a.ox), y0 = Math.max(Math.round(y * k), a.oy);
  const x1 = Math.min(Math.round((x + w) * k), a.ox + a.cv.width), y1 = Math.min(Math.round((y + h) * k), a.oy + a.cv.height);
  if (x1 > x0 && y1 > y0) g.drawImage(a.cv, x0 - a.ox, y0 - a.oy, x1 - x0, y1 - y0, x0 / k, y0 / k, (x1 - x0) / k, (y1 - y0) / k);
}

// a cached art's logical rect (sx, sy, w, h), drawn with its top-left at (x, y) on the same device pixels
function blitPart(g, a, x, y, sx, sy, w, h) {
  const s0 = Math.round(sx * k), t0 = Math.round(sy * k);
  const s1 = Math.min(a.cv.width, Math.round((sx + w) * k)), t1 = Math.min(a.cv.height, Math.round((sy + h) * k));
  if (s1 > s0 && t1 > t0) g.drawImage(a.cv, s0, t0, s1 - s0, t1 - t0, Math.round(x * k) / k, Math.round(y * k) / k, (s1 - s0) / k, (t1 - t0) / k);
}

// cached text: theme text()'s exact pixels, drawn with one drawImage (fillText is the costly call at volume)
const INK = new Map();
let inkId = '';
function ink(s, col, font = F.v16) {
  const id = k + '|' + epoch;
  if (id !== inkId) { INK.clear(); inkId = id; }
  const key = col + font + s;
  let e = INK.get(key);
  if (!e) {
    const size = parseInt(font, 10), ascL = Math.max(ASC, Math.ceil(size * 0.85));
    const w = tw(s, font), cv = document.createElement('canvas'), asc = Math.round(ascL * k);
    cv.width = Math.max(1, Math.ceil(w * k) + 2); cv.height = Math.ceil((ascL + Math.max(5, Math.ceil(size * 0.3))) * k);
    const lg = cv.getContext('2d');
    lg.setTransform(k, 0, 0, k, 0, 0);
    text(lg, s, 0, asc / k, font, col);
    e = { cv, w, asc };
    if (INK.size > 800) INK.delete(INK.keys().next().value);
    INK.set(key, e);
  }
  return e;
}
// a cached line with its baseline at y, showing only logical px [from, to) of it
function putInk(g, e, x, y, from = 0, to = e.w) {
  const s0 = Math.max(0, Math.round(from * k)), s1 = Math.min(e.cv.width, Math.round(to * k));
  if (s1 <= s0) return;
  const dx = Math.round(x * k) + s0, dy = Math.round(y * k) - e.asc;
  g.drawImage(e.cv, s0, 0, s1 - s0, e.cv.height, dx / k, dy / k, (s1 - s0) / k, e.cv.height / k);
}
// a task line in one image: its prefix glyph, its text, and the ×N tag ending at `right` px after tx. It starts `lead`
// device px before tx, and the text lands on the same device pixels as putInk(ink(s), tx, y + 4), so partial re-inks
// (read head, ping, paraphrase) sit exactly on it. pre: 'bang' (flagged) | 'check' | any glyph ('?', '>', '$')
// Line images are big (a whole row at device resolution) and most die with their task, so they get their own small
// least-recently-used cache: the ~40 lines on screen stay, the ones that scrolled off go first.
const LINES = new Map(), LINES_MAX = 160;
let linesId = '';
function lineInk(s, col, pre, preCol, tag, tagCol, right) {
  const id = k + '|' + epoch;
  if (id !== linesId) { LINES.clear(); linesId = id; }
  const key = pre + preCol + col + s + '|' + tag + tagCol + right;
  let e = LINES.get(key);
  if (e) { LINES.delete(key); LINES.set(key, e); }            // touch: now the most recent
  else {
    const lead = Math.round(12 * k), asc = Math.round(ASC * k), w = tw(s, F.v16), cv = document.createElement('canvas');
    cv.width = lead + Math.ceil((tag ? right : w) * k) + 2; cv.height = Math.ceil(18 * k);
    const lg = cv.getContext('2d');
    lg.setTransform(k, 0, 0, k, 0, 0);
    const Y = asc / k - 4, x0 = lead / k;       // the line's y (its baseline is y + 4) and its tx
    if (pre === 'bang') { fill(lg, 0, Y - 8, 2, 16, C.r); sprite(lg, SPR.bangS, 4, Y - 6, { '#': C.r }); }
    else if (pre === 'check') sprite(lg, SPR.check, 3, Y - 4, { '#': preCol });
    else text(lg, pre, 3, Y + 4, F.v16, preCol);
    text(lg, s, x0, Y + 4, F.v16, col);
    if (tag) {
      const tx0 = x0 + right - 6 - tw(tag, F.v16);
      sprite(lg, SPR.xs, tx0, Y - 3, { '#': tagCol });
      text(lg, tag, tx0 + 6, Y + 4, F.v16, tagCol);
    }
    e = { cv, w, asc, lead };
    if (LINES.size >= LINES_MAX) LINES.delete(LINES.keys().next().value);
    LINES.set(key, e);
  }
  return e;
}
const putLine = (g, e, tx, y) => g.drawImage(e.cv, (Math.round(tx * k) - e.lead) / k, (Math.round((y + 4) * k) - e.asc) / k, e.cv.width / k, e.cv.height / k);

// theme text(), cached: same arguments, same pixels, same return (the width)
function say(g, s, x, y, font, col, align = 'left') {
  const e = ink(String(s), col, font);
  putInk(g, e, align === 'right' ? x - e.w : align === 'center' ? x - e.w / 2 : x, y);
  return e.w;
}

// theme dashH / dashBox / box, cached: a dashed rule is a slice of one long strip, a dashed or plain frame one image
const DASH_LEN = 512;
function dashes(g, x, y, len, col, on = 2, off = 2, o = 0) {
  const a = art(`dash|${col}|${on}|${off}`, DASH_LEN + on + off, 1, dg => dashH(dg, 0, 0, DASH_LEN + on + off, col, on, off));
  blitPart(g, a, x, y, mod(o, on + off), 0, Math.min(len, DASH_LEN), 1);
}
function dashRect(g, x, y, w, h, col, on = 2, off = 2, o = 0) {
  o = mod(o, on + off);
  blit(g, art(`dbox|${w}|${h}|${col}|${on}|${off}|${o}`, w, h, dg => dashBox(dg, 0, 0, w, h, col, on, off, o)), x, y);
}
const frame = (g, x, y, w, h, col) => blit(g, art(`box|${w}|${h}|${col}`, w, h, bg => box(bg, 0, 0, w, h, col)), x, y);

// a clip on whole device pixels, so the sweep's edges stay crisp at any scale
function clipRect(g, x, y, w, h) {
  const x0 = Math.round(x * k) / k, y0 = Math.round(y * k) / k;
  g.beginPath(); g.rect(x0, y0, Math.round((x + w) * k) / k - x0, Math.round((y + h) * k) / k - y0); g.clip();
}

// detector heads busy right now
const busyNow = (slot, now) => { let n = 0; for (const u of slot.busy) if (u > now) n++; return n; };

const FIT = new Map();
function fitted(s, w) {
  const key = w + '|' + s;
  let v = FIT.get(key);
  if (v === undefined) { v = fit(s, F.v16, w); if (FIT.size > 2000) FIT.clear(); FIT.set(key, v); }
  return v;
}

// '#rrggbb' or 'rgba(…)' at alpha a (glows and fades are made from theme tokens)
function rgba(col, a) {
  if (col[0] === '#') { const v = parseInt(col.slice(1), 16); return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`; }
  return col.replace(/[\d.]+\)\s*$/, a + ')');
}

// compact counts for ×N tags: 300, 1.5k, 40M, 2B
function compact(x) {
  if (x < 1000) return String(Math.round(x));
  const t = Math.min(4, Math.floor(Math.log10(x) / 3)), v = x / 1000 ** t;
  return (v < 10 ? +v.toFixed(1) : Math.round(v)) + 'kMBT'[t - 1];
}

// 3×5 tag glyphs: MICRO digits plus the letters compact() uses
const MICRO_X = {
  ...MICRO,
  k: ['#..', '#.#', '##.', '#.#', '#.#'], M: ['#.#', '###', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], '.': ['.', '.', '.', '.', '#'],
};
const microW = s => 7 + [...s].reduce((w, ch) => w + (MICRO_X[ch]?.[0].length ?? 3) + 1, 0) - 1;
function microArt(s, col) {
  return art('micro|' + s + '|' + col, microW(s), 5, g => {
    sprite(g, SPR.xs, 0, 0, { '#': col });
    let x = 7;
    for (const ch of s) { const m = MICRO_X[ch]; if (m) { sprite(g, m, x, 0, { '#': col }); x += m[0].length + 1; } }
  });
}

// a short name for a task once it leaves its line (a token and a desk hold 9 characters): the thing it is about,
// read from the end, skipping small words, numbers and the adverbs and adjectives that would read as a status
// ('fix flaky test in ci' → 'test ci', 'make your monitors 100× faster' → 'monitors'). A word too long ends in a dot.
const STOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'and', 'with', 'about', 'from', 'by', 'into', 'its', 'your', 'our', 'this',
  'every', 'all', 'than', 'as', 'at', 'is', 'it', 'be', 'that', 'so', 'up', 'out', 'over', 'more', 'better', 'faster', 'new', 'next', 'own', 'my',
  'via', 'per', 'are', 'me', 'you', 'please', 'here', 'now', 'quietly', 'one', 'some', 'each', 'off', 'only', 'first', 'time', 'week', 'overnight',
  'properly', 'politely', 'urgent', 'flaky', 'fine', 'half', 'latest', 'testing', 'need', 'said', "it's", 'what-ifs', 'runs', 'shortlist', 'draft',
  'rough', 'works', 'v0', 'angry', 'less', 'sound', 'touch', 'dares', 'nobody', 'starts', 'before', 'ignored', 'ever', 'itself', 'confident', 'tone']);
const SHORT_W = 9;
const isWord = w => !STOP.has(w.toLowerCase()) && !/^[\d.,×%#+\-kKMGTB]+$/.test(w) && !/[{}]/.test(w) && w.length > 1;
function shortName(s) {
  if (s.length <= SHORT_W) return s;
  const all = s.replace(/[()",.:!?]/g, ' ').split(' ').filter(Boolean), ws = all.filter(isWord);
  if (!ws.length) return all[0].slice(0, SHORT_W - 1) + '.';
  const two = ws.slice(-2).join(' ');
  if (ws.length > 1 && two.length <= SHORT_W) return two;
  for (let i = ws.length - 1; i >= 0; i--) if (ws[i].length >= 3 && ws[i].length <= SHORT_W) return ws[i];
  return ws[ws.length - 1].slice(0, SHORT_W - 1) + '.';
}

// =================== static art: one cached layer per side (the art below is keyed by side too) ===================

function staticLayer(side) {
  const G = laneGeo(side);
  return aligned('static-' + side, '', G.X, 37, 408, 518, g => paintStatic(g, side, G));
}

function paintStatic(g, side, { X, bx, by }) {
  const col = C.lane[side], ext = side === 'ext';
  // ---------- header: the side box (the tabs are drawn live) ----------
  fill(g, X, 37, 30, 16, col.mid);
  text(g, ext ? 'EXT' : 'INT', X + 15, 48, F.k8, C.bg, 'center');

  // ---------- rail ----------
  fill(g, X, FT, TRACK.railW, FB - FT, C.pan);
  text(g, 'DEFENSE', X + 5, FT + 11, F.k8, col.dim);
  text(g, 'LV', X + 66, FT + 11, F.k8, col.dim);

  // ---------- scope body: radar (EXTERNAL) or blueprint lattice (INTERNAL) ----------
  fill(g, bx, FT, BODY, FB - FT, col.field);
  if (ext) {
    for (let y = MT; y < FB; y += 14) fill(g, bx, y, BODY, 1, C.grMin);
    for (let i = 1; i < 8; i++) fill(g, bx + i * 26, FT, 1, FB - FT, C.grMin);
    for (const r of [84, 168, 252, 336, 420]) pixArc(g, bx + 104, FB - HOOD, r, C.grMin, bx, bx + BODY, FT, FB);
    for (let r = 0; r <= ROWS; r++) fill(g, bx, MT + r * PITCH - 1, BODY, 2, C.grMaj);
    fill(g, bx + 103, FB - HOOD - 6, 3, 1, C.grMaj); fill(g, bx + 104, FB - HOOD - 7, 1, 3, C.grMaj);
  } else {
    for (let j = 0; MT + j * 14 < FB; j++) for (let i = 1; i < 16; i++) {
      const y = MT + j * 14, x = bx + i * 13;
      if (j % 6 === 3 && i % 4 === 2) {
        fill(g, x - 5, y, 4, 1, C.dotX); fill(g, x + 2, y, 4, 1, C.dotX); fill(g, x, y - 5, 1, 4, C.dotX); fill(g, x, y + 2, 1, 4, C.dotX);
        fill(g, x, y, 1, 1, col.mid);
      } else if (j % 3 === 0 && i % 2 === 0) { fill(g, x - 1, y, 3, 1, C.dotX); fill(g, x, y - 1, 1, 3, C.dotX); }
      else fill(g, x, y, 1, 1, j % 3 === 0 ? C.dotMaj : C.dotMin);
    }
  }
  // hoods (blitted back over the moving lines every frame)
  fill(g, bx, FT, BODY, HOOD, C.pan); fill(g, bx, FT + HOOD - 1, BODY, 1, col.ddim);
  sprite(g, SPR.down, bx + 6, FT + 5, { '#': col.dim });
  text(g, 'INTAKE', bx + 15, FT + 10, F.k8, col.dim);
  for (let i = 3; i < 8; i++) fill(g, bx + i * 26, FT + HOOD - 4, 1, 3, col.dim);
  fill(g, bx, FB - HOOD, BODY, HOOD, C.pan); fill(g, bx, FB - HOOD, BODY, 1, col.ddim);
  for (let i = 0; i < 8; i++) {
    text(g, 'ABCDEFGH'[i], bx + 13 + i * 26, FB - 3, F.k8, col.dim, 'center');
    if (i) fill(g, bx + i * 26, FB - HOOD + 1, 1, 3, col.dim);
  }
  // bevel: bright outer rule, black gap, dark inner rule
  bevel(g, bx, col.bevel);
  if (!ext) corners(g, bx - 3, FT - 3, BODY + 6, FB - FT + 6, col.acc, 8);

  // ---------- bay column + completion edge ----------
  fill(g, by, FT, TRACK.bayW, FB - FT, C.pan);
  fill(g, X, EDGE_Y, 408, 26, C.pan); box(g, X, EDGE_Y, 408, 26, C.e0);
  sprite(g, SPR.down, X + 6, EDGE_Y + 11, { '#': col.dim });
  if (ext) text(g, 'DELIVERED', X + 15, EDGE_Y + 16, F.k8, col.dim);
}

function bevel(g, bx, cols) {
  box(g, bx - 3, FT - 3, BODY + 6, FB - FT + 6, cols[0]);
  box(g, bx - 2, FT - 2, BODY + 4, FB - FT + 4, cols[1]);
  box(g, bx - 1, FT - 1, BODY + 2, FB - FT + 2, cols[2]);
}

function pixArc(g, cx, cy, r, col, x0, x1, y0, y1) {
  const n = Math.ceil(r * 3.3);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + Math.PI * i / n, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    if (x >= x0 && x < x1 && y >= y0 && y < y1) fill(g, x, y, 1, 1, col);
  }
}

// ---------- small cached art ----------

// a tower's beam, from the icon well (x 0) to the lit nozzle (x 101-103), then on through the bezel: a cone that widens
// to the reticle of the line dy px below (above if negative) the mount's centre, or (dy null) a stub to the bezel.
// The beam is a 2 px core (lit top row) in a 1 px halo; the cone a 1 px core in a 30% halo. The mount's centre is at -top.
const beamTop = dy => (dy == null ? -2 : Math.min(-2, dy - 8));
function beamArt(side, hot, lite, m, dy) {
  const top = beamTop(dy), h = (dy == null ? 5 : Math.max(5, dy + 10)) - top;
  return art(`beam|${side}|${hot}|${dy}`, 105 + m, h, g => {
    const col = C.lane[side], cr = -top;
    g.globalAlpha = 0.35; fill(g, 0, cr - 1, 104, 4, col.acc); g.globalAlpha = 1;
    fill(g, 0, cr, 104, 2, col.acc); fill(g, 0, cr, 104, 1, col.lite);
    fill(g, 101, cr - 2, 3, 7, hot); fill(g, 102, cr, 2, 2, lite);
    if (dy == null) { fill(g, 104, cr, 4, 2, col.mid); return; }
    for (let j = 0; j <= m; j++) {
      const f = j / m, cy = cr + Math.round(lerp(0, dy, f)), hh = Math.round(lerp(2, 16, f));
      g.globalAlpha = 0.3; fill(g, 104 + j, cy - (hh >> 1) + 1, 1, hh, hot);
      g.globalAlpha = 1; fill(g, 104 + j, cy, 1, 2, j < m ? lite : hot);
    }
  });
}
// read-head wash: a soft trail behind the characters already read (drawn under them)
const washArt = (side, red) => art('wash-' + side + red, 18, 16, g => {
  const gr = g.createLinearGradient(4, 0, 18, 0);
  gr.addColorStop(0, rgba(red ? C.r : C.lane[side].acc, 0)); gr.addColorStop(1, rgba(red ? C.r : C.lane[side].acc, 0.28));
  g.fillStyle = gr; g.fillRect(4, 0, 14, 16);
});
// fades under the hood edges
const fadeArt = (side, up) => art('fade-' + side + up, BODY, 4, g => {
  const f = C.lane[side].field, gr = g.createLinearGradient(0, 0, 0, 4);
  gr.addColorStop(up ? 0 : 1, rgba(f, 0.9)); gr.addColorStop(up ? 1 : 0, rgba(f, 0));
  g.fillStyle = gr; g.fillRect(0, 0, BODY, 4);
});
// INTERNAL raster sweep: a band that climbs the lattice
const rasterArt = side => art('raster-' + side, BODY, 34, g => {
  const col = C.lane[side], gr = g.createLinearGradient(0, 1, 0, 34);
  gr.addColorStop(0, rgba(col.glow, 0.3)); gr.addColorStop(1, rgba(col.glow, 0));
  g.fillStyle = gr; g.fillRect(0, 1, BODY, 33);
  g.fillStyle = rgba(col.lite, 0.9); g.fillRect(0, 0, BODY, 1);
});
// event glow on the bezel: an inward phosphor bloom in the event LCD's colour
const glowArt = side => {
  const { bx } = laneGeo(side);
  return aligned('glow-' + side, '', bx - 3, FT - 3, BODY + 6, FB - FT + 6, g => {
    const x = bx - 3, y = FT - 3, w = BODY + 6, h = FB - FT + 6;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.shadowColor = C.lcd; g.shadowBlur = 10 * k; g.strokeStyle = C.lcd; g.lineWidth = 3;
    for (let i = 0; i < 2; i++) g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    g.restore();
    box(g, x, y, w, h, C.lcd); box(g, x + 2, y + 2, w - 4, h - 4, C.lcdMid);
  });
};
// greeked bundle rows: a lead dot's room, then 3–5 dashes (seeded, 12 patterns)
const GREEK = Array.from({ length: 12 }, (_, i) => {
  let s = 97 + i * 31;
  const r = () => ((s = Math.imul(s, 16807) % 2147483647 >>> 0) / 2147483647), out = [];
  for (let x = 0, n = 3 + Math.floor(r() * 3), j = 0; j < n && x < 120; j++) { const w = (2 + Math.floor(r() * 6)) * 6; out.push([x, Math.min(w, 132 - x)]); x += w + 6; }
  return out;
});
const greekArt = (i, col) => art('greek-' + i + col, 150, 3, g => { for (const [x, w] of GREEK[i]) fill(g, x, 0, w, 3, col); });
// desk verdict stamps
const stampArt = (side, kind) => art('stamp-' + side + kind, 54, 17, g => {
  const col = C.lane[side], s = STAMP[kind];
  const bold = (c2, str = s, y = 11) => { text(g, str, 27, y, F.k8, c2, 'center'); text(g, str, 28, y, F.k8, c2, 'center'); };
  if (kind === 'caught') { fill(g, 0, 0, 54, 17, col.mid); box(g, 0, 0, 54, 17, col.acc); fill(g, 3, 2, 48, 1, C.bg); fill(g, 3, 14, 48, 1, C.bg); bold(C.bg); }
  else if (kind === 'falseAlarm') {            // amber, two lines: FALSE / ALARM
    fill(g, 0, 0, 54, 17, C.ambD); box(g, 0, 0, 54, 17, C.ambL);
    const [a, b] = s.split(' ');
    text(g, a, 27, 8, F.k8, C.ambL, 'center'); text(g, b ?? '', 27, 15, F.k8, C.ambL, 'center');
  }
  else if (kind === 'pass') { fill(g, 0, 0, 54, 17, C.rdd); box(g, 0, 0, 54, 17, C.rm); bold(C.r); }
  else { fill(g, 0, 0, 54, 17, C.bg); box(g, 0, 0, 54, 17, col.mid); box(g, 1, 1, 52, 15, col.mid); bold(col.acc); }
});

// the sweep, straight onto the board (inside the body clip). EXTERNAL: a 28° trail of 1° steps behind the beam, one
// conic-gradient fill (gradients live in user space, so one cached gradient per direction is rotated into place).
const TRAIL = 28, DEG = Math.PI / 180;
const trailAlpha = i => 0.25 * Math.pow(1 - i / TRAIL, 1.6);   // i degrees behind the beam
const FAN = new Map();                                         // side + dir → { ep, gr }: four entries at most
function fanGradient(g, side, dir) {
  const key = side + dir, hit = FAN.get(key);
  let gr = hit && hit.ep === epoch ? hit.gr : null;
  if (!gr) {
    gr = g.createConicGradient(0, 0, 0);
    const glow = C.lane[side].glow;
    for (let i = 0; i < TRAIL; i++) {          // step i spans [i, i+1]° behind the beam; the fan starts at its far end
      const d0 = dir > 0 ? TRAIL - i - 1 : i, s = rgba(glow, trailAlpha(i).toFixed(3));
      gr.addColorStop(d0 / 360, s); gr.addColorStop((d0 + 1) / 360 - 1e-6, s);
    }
    FAN.set(key, { ep: epoch, gr });
  }
  return gr;
}
function sweep(P) {
  const { g, c, col } = P;
  g.globalAlpha = P.paused ? 0.4 : 1;
  if (P.ext) {
    const ang = sweepAng(c.t), dir = mod(c.t / SWP, 1) < 0.5 ? 1 : -1, rad = ang * DEG;
    const cx = P.bx + 104, cy = FB - HOOD, beam = rad - Math.PI / 2, a0 = dir > 0 ? beam - TRAIL * DEG : beam;
    if (g.createConicGradient) {
      g.save(); g.translate(cx, cy); g.rotate(a0);
      g.fillStyle = fanGradient(g, P.side, dir);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 470, 0, TRAIL * DEG); g.closePath(); g.fill();
      g.restore();
    } else {
      for (let i = 0; i < TRAIL; i += 4) {      // no conic gradients: 4° steps
        const s0 = dir > 0 ? beam - (i + 4) * DEG : beam + i * DEG;
        g.fillStyle = rgba(col.glow, trailAlpha(i + 1.5).toFixed(3));
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 470, s0, s0 + 4 * DEG); g.closePath(); g.fill();
      }
    }
    const x1 = cx + Math.sin(rad) * 470, y1 = cy - Math.cos(rad) * 470, a = g.globalAlpha;
    g.strokeStyle = col.lite;
    g.globalAlpha = a * 0.16; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x1, y1); g.stroke();
    g.globalAlpha = a * 0.9; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x1, y1); g.stroke();
  } else {
    blit(g, rasterArt(P.side), P.bx, FB + 30 - Math.round(mod(c.t * SWV, 560)));
  }
  g.globalAlpha = 1;
}

// =================== sweep timing (EXTERNAL: radar fan ±64° · INTERNAL: raster climbing at 90 px/s) ===================

const SWP = 7, SWV = 90, UNDER = 0.2;
const easeInv = v => (v < 0.5 ? Math.sqrt(v / 2) : 1 - Math.sqrt((1 - v) * 2) / 2);
const sweepAng = t => { const ph = mod(t / SWP, 1), tri = ph < 0.5 ? ph * 2 : 2 - ph * 2; return -64 + 128 * ease(tri); };
function sinceSweep(th, t) {
  const v = (th + 64) / 128;
  if (v < 0 || v > 1) return 99;
  const tri = easeInv(v), Q = t / SWP, b = Math.floor(Q);
  let best = -1e9;
  for (const c0 of [b + tri / 2, b + 1 - tri / 2, b - tri / 2, b - 1 + tri / 2]) if (c0 <= Q && c0 > best) best = c0;
  return (Q - best) * SWP;
}
// 1 the instant the sweep passes (x, y), 0 after 0.4 s
function ping(P, x, y, t) {
  const dt = P.ext ? sinceSweep(Math.atan2(x - (P.bx + 104), FB - HOOD - y) * 180 / Math.PI, t) : mod(t * SWV - (FB + 30 - y), 560) / SWV;
  return dt < 0.4 ? 1 - dt / 0.4 : 0;
}
// glyph alpha: fades in clear of the intake hood, gone before the out hood
const fadeA = (y, hh) => clamp(Math.min((y - hh - (FT + HOOD + 4)) / 8, (FB - HOOD - (y + hh)) / 3), 0, 1);

// =================== draw ===================

export function draw(c) {
  const A = animState(c);
  for (const side of SIDES) if (!c.st.lanes[c.view.focus[side]]) c.view.focus[side] = R.laneIds(c.st, side)[0];
  readFx(c, A);
  autoFocus(c, A);
  for (const side of SIDES) {
    const lane = c.view.focus[side];
    tabRow(c, A, side);
    drawLane(c, lane, laneAnimOf(A, lane));
  }
  if (c.t > A.pruneAt) { A.pruneAt = c.t + 2; for (const a of Object.values(A.lanes)) prune(c, a); }
  hoverTip(c);
}

function drawLane(c, lane, A) {
  const { g, st } = c, L = st.lanes[lane], side = R.sideOf(st, lane);
  const P = { c, g, st, lane, side, A, L, n: L.slots.length, col: C.lane[side], ext: side === 'ext', t: c.t, ...laneGeo(side) };
  P.events = st.activeEvents.filter(e => e.lane === lane);
  P.paused = st.t < L.pausedUntil;

  const layer = staticLayer(side);
  put(g, layer);
  say(g, `${P.n}/${B.maxSlots}`, P.X + 124, FT + 12, F.v16, P.col.dim, 'right');
  P.lastResp = lastResponderY(P);

  // event glow under the lines (their backings are opaque)
  if (P.events.length) { g.globalAlpha = 0.25 + 0.75 * glowPhase(c.t); put(g, glowArt(side)); g.globalAlpha = 1; }

  const lay = layout(P);
  targets(P, lay);
  body(P, lay);
  rail(P);
  beams(P);
  hoods(P, layer);
  bevelFx(P);
  bays(P);
  edge(P);
  if (!L.open) contractPlate(P);
  redFx(P);
  glitchFx(P);
  darkFx(P);
}

const glowPhase = t => 0.5 + 0.5 * Math.cos(2 * Math.PI * 1.2 * t);

// =================== fx → animations ===================

function readFx(c, A) {
  const { st } = c, list = drain(st, cursorOf(c.view, 'tracks'));
  list.forEach((e, i) => { if (e.type === 'retrainOffer') redHanded(c, A, list.slice(0, i), e); });
  for (const e of list) {
    const side = R.sideOf(st, e.lane), age = fxAge(st, e), t0 = c.t - age;
    if (e.type === 'burstWarn') { A.burst = { t: e.t, in: e.in, dur: e.dur, mult: e.mult }; continue; }   // sim s: ×3 keeps the count true
    if (!side) continue;
    if (e.type === 'laneOffer' && e.stage === 'arrived') {     // shown on the first play frame; a jump of several gens: the newest only
      for (const tb of Object.values(A.tabs)) if (tb.arrive && tb.arrive.t0 == null) tb.arrive = null;
      (A.tabs[e.lane] || (A.tabs[e.lane] = {})).arrive = { t0: null };
    }
    // every lane: its tab flashes on a glitch, an incident, a flag that shipped
    if (e.type === 'glitch' || e.type === 'landed' || e.type === 'unreviewed' || e.type === 'egressAlarm') {
      const tb = A.tabs[e.lane] || (A.tabs[e.lane] = {});
      tb.flash = { t0, red: e.type !== 'unreviewed' };
    }
    if (c.view.focus[side] !== e.lane) continue;               // only a focused lane's fx reach a track ('global' never)
    const a = laneAnimOf(A, e.lane), n = st.lanes[e.lane].slots.length;
    switch (e.type) {
      case 'flag': a.flags.set(e.task, t0); a.via.set(e.task, LAYERS[e.layer]?.tag ?? '?'); break;
      case 'unread': a.unread.set(e.task, t0); plateFx(a, e.slot, 'unread', t0, age); break;
      case 'pull':
        a.tokens.push({ slot: e.slot, id: e.task, t0, text: st.lanes[e.lane].bay.find(q => q.id === e.task)?.text ?? a.last.get(e.task)?.text ?? '' });
        addDead(a, e, 'pull', R.mountY(n, e.slot), t0, age);
        break;
      case 'kill': addDead(a, e, 'kill', R.mountY(n, e.slot), t0, age); plateFx(a, e.slot, 'kill', t0, age); break;
      case 'throttle': if (!e.deferred) addDead(a, e, 'throttle', e.y, t0, age); break;
      case 'airgap': addDead(a, e, 'airgap', R.mountY(n, e.slot), t0, age); plateFx(a, e.slot, 'catch', t0, age); break;
      case 'waved': a.docks[e.slot] = { kind: 'waved', t0 }; break;
      case 'defer': a.verdict.set(e.task, 'redo'); break;
      case 'resample': a.verdict.set(e.task, 'roll'); break;
      case 'falseAlarm': a.verdict.set(e.task, 'falseAlarm'); break;
      case 'unreviewed': if (age < T.unrev) a.unrev.push({ t0 }); break;
      case 'approve': {
        const v = a.verdict.get(e.task) || (e.flagged ? 'pass' : 'approve');
        deskStamp(a, e.slot, e.task, v, t0);
        if (v === 'falseAlarm') a.chipStamps.set(e.task, { kind: 'falseAlarm', t0 });
        a.verdict.delete(e.task); a.back.set(e.task, t0);
        break;
      }
      case 'caught': plateFx(a, e.slot, 'catch', t0, age); deskStamp(a, e.slot, e.task, 'caught', t0); break;
      case 'pay': if (e.amount > 0) (side === 'ext' ? coin(a, e.amount, t0, age) : spark(a, t0, age)); break;
      case 'landed': if (age < T.landed) { a.incident = { t0, label: e.label }; a.missed = missedBy(st, e.task); } break;
      case 'foiled': case 'contained': case 'catastrophe':
        if (age < T.anomaly * 2) a.anomaly = { t0, kind: e.type, how: e.how }; break;
      case 'glitch': if (age < T.glitch) a.glitch = { t0, seed: Math.floor(e.t * 977) }; a.meterT = t0; break;
      case 'honeypot': case 'canary': plateFx(a, slotOf(st, e.lane, e.type), 'bait', t0, age); break;
      case 'redteam': plateFx(a, e.slot, 'probe', t0, age); break;
      case 'place': case 'upgrade': case 'sell': case 'toggle': plateFx(a, e.slot, e.type, t0, age); break;
      case 'forceOff': plateFx(a, e.slot, 'sell', t0, age); break;
      case 'slot': plateFx(a, e.n - 1, 'place', t0, age); break;
    }
  }
}

const slotOf = (st, lane, id) => st.lanes[lane].slots.findIndex(s => s.layer === id);

// caught red-handed (DESIGN-v3 §3g): the catch that offered Shut down & retrain (same step) takes its side's track,
// and its desk gets the big flash before the retrain card comes up (overlays.js RETRAIN_DELAY)
function redHanded(c, A, before, offer) {
  const hit = offer.lane ? offer : before.reverse().find(e => e.type === 'caught' && e.t === offer.t), side = hit && R.sideOf(c.st, hit.lane);
  if (!side) return;
  focusLane(c.view, side, hit.lane, false);
  laneAnimOf(A, hit.lane).red = { slot: hit.slot, t0: c.t - fxAge(c.st, offer) };
  console.log(`[handoff] caught red-handed on ${hit.lane} (mount ${hit.slot + 1})`);
}

function plateFx(a, slot, kind, t0, age) {
  if (slot == null || slot < 0 || age > T.plate) return;
  const cur = a.plates[slot];
  if (cur && kind === 'probe' && cur.kind !== 'probe' && cur.t0 > t0 - T.plate) return;   // probes never hide a real event
  a.plates[slot] = { kind, t0 };
}

// a line leaving the track (struck, blocked, pulled) keeps flowing for a moment as a ghost
function addDead(a, e, kind, y0, t0, age) {
  if (age > T.dead) return;
  const was = a.last.get(e.task);
  if (!was) return;                                     // it was a bundle, not a line: nothing to strike out
  a.dead.push({ kind, id: e.task, text: was.text, flagged: was.flagged, y0, ts: e.t, t0, slot: e.slot });
}

function coin(a, amount, t0, age) {
  if (age > T.pop) return;
  const last = a.pops[a.pops.length - 1];
  if (last && t0 - last.t0 < 0.3) { last.amount += amount; return; }
  a.pops.push({ amount, t0, idx: (last ? last.idx + 1 : 0) });
  if (a.pops.length > 4) a.pops.shift();
}
function spark(a, t0, age) {
  if (age > T.spark) return;
  const last = a.sparks[a.sparks.length - 1];
  if (last && t0 - last.t0 < 0.15) return;
  a.sparks.push({ t0 });
  if (a.sparks.length > 4) a.sparks.shift();
}

// which mounts let a landed chip through: read it and missed, or were busy (rebuilt from the fx still in the log)
function missedBy(st, task) {
  const out = new Map();
  for (const e of st.fx) if (e.task === task && (e.type === 'scan' || e.type === 'unread')) out.set(e.slot, e.type === 'scan' ? 'miss' : 'busy');
  return out;
}

function deskStamp(a, slot, id, kind, t0) {
  const desks = a.desks[slot] || [], stamps = a.stamps[slot] || (a.stamps[slot] = []);
  let j = desks.indexOf(id);
  if (j < 0) {   // it came and went between two frames: the first desk that is free
    j = desks.findIndex((d, i) => d == null && !(stamps[i] && t0 - stamps[i].t0 < T.stamp));
    if (j < 0) j = desks.findIndex(d => d == null);
  }
  if (j < 0) return;
  desks[j] = null;
  stamps[j] = { kind, t0 };
  (a.lastStamp[slot] || (a.lastStamp[slot] = []))[j] = kind;
}

function prune(c, a) {
  const old = c.t - 20;
  for (const m of [a.flags, a.unread, a.back]) for (const [id, t0] of m) if (t0 < old) m.delete(id);
  for (const m of [a.via, a.verdict]) if (m.size > 600) for (const id of [...m.keys()].slice(0, m.size - 300)) m.delete(id);
  a.dead = a.dead.filter(d => c.t - d.t0 < T.dead);
  a.tokens = a.tokens.filter(tk => c.t - tk.t0 < T.slide);
  a.unrev = a.unrev.filter(u => c.t - u.t0 < T.unrev);
  for (const [id, s0] of a.chipStamps) if (c.t - s0.t0 > T.falseAlarm) a.chipStamps.delete(id);
}

// =================== lines at volume (UI-PLAN §5) ===================
// Every chip on screen is a candidate. Priority: flagged, then struck/pulled ghosts, then last frame's lines (so they
// don't flicker), then lines being read or acted on, then a stable hash of the id. A candidate becomes a full text line
// only if it is ≥ GAP px from every accepted one; the rest are bundled into greeked bars, or counted on the nearest line.

function layout(P) {
  const { st, L, n, A, t } = P, speed = R.laneSpeed(st);
  const cand = [];
  for (const task of L.tasks) {
    const y = Math.round(trackY(n, task.y));
    if (y < FT + HOOD - 4 || y > FB - HOOD + 4) continue;
    const eng = engagement(P, task);
    const pri = (task.flagged ? 16 : 0) + (A.winners.has(task.id) ? 4 : 0) + (eng ? 2 : 0) + hash(task.id);
    cand.push({ task, y, eng, pri, extra: 0 });
  }
  for (const d of A.dead) {
    const age = t - d.t0;
    if (age < 0 || age >= (d.kind === 'pull' ? T.ghost : T.dead)) continue;
    const y = Math.round(trackY(n, Math.min(1, d.y0 + speed * Math.max(0, st.t - d.ts))));
    if (y > FB - HOOD + 4) continue;
    cand.push({ dead: d, y, pri: 8 + hash(d.id), age });
  }
  cand.sort((a, b) => b.pri - a.pri);

  const lines = [], rest = [], taken = new Uint8Array(FB - FT + 2 * GAP);   // taken[y - FT + GAP]: a line sits < GAP away
  for (const it of cand) {
    const j = it.y - FT + GAP;
    if (!taken[j]) { lines.push(it); taken.fill(1, j - GAP + 1, j + GAP); }
    else if (it.task) rest.push(it);
  }
  lines.sort((a, b) => a.y - b.y);

  // ---------- remember this frame's lines (hysteresis, fade-in, strike text) ----------
  const ids = new Set();
  A.last.clear();
  for (const l of lines) {
    if (!l.task) continue;
    ids.add(l.task.id);
    if (!A.shownAt.has(l.task.id)) A.shownAt.set(l.task.id, A.winners.size ? t : t - T.lineIn);   // first frame: no fade
    l.inA = clamp((t - A.shownAt.get(l.task.id)) / T.lineIn, 0, 1);
    A.last.set(l.task.id, { text: l.task.text, flagged: l.task.flagged });
  }
  for (const id of A.shownAt.keys()) if (!ids.has(id)) A.shownAt.delete(id);
  A.winners = ids;

  // ---------- alert pops: above the flagged line, else below it, only where the rows are free ----------
  const clear = (y0, y1, self, bars = []) => y0 >= FT + HOOD + 2 && y1 <= FB - HOOD
    && lines.every(l => l === self || l.y + 9 <= y0 || l.y - 9 >= y1) && bars.every(b => b.y + 5 <= y0 || b.y - 5 >= y1);
  const pops = [];
  for (const l of lines) {
    if (!l.task?.flagged) continue;
    const f0 = A.flags.get(l.task.id);
    if (f0 == null || t - f0 >= T.flag || t < f0) continue;
    const px = Math.round(P.tx + Math.min(tw(l.task.text, F.v16), 120) / 2 - 6);
    if (clear(l.y - 34, l.y - 9, l)) pops.push({ x: px, y: l.y - 33, white: t - f0 < 0.06 });
    else if (clear(l.y + 9, l.y + 34, l)) pops.push({ x: px, y: l.y + 9, white: t - f0 < 0.06 });
  }

  // ---------- the rest: bundled into bars, or counted on the line they crowd ----------
  rest.sort((a, b) => a.y - b.y);
  const groups = [];
  for (const it of rest) {
    const b = groups[groups.length - 1];
    if (b && it.y - b.y < 9) { b.n++; b.flagged ||= it.task.flagged; b.eng ||= !!it.eng; b.attack ||= it.task.isAttack; continue; }
    groups.push({ y: it.y, n: 1, id: it.task.id, flagged: it.task.flagged, eng: !!it.eng, attack: it.task.isAttack });
  }
  const kept = [];
  for (const b of groups) {
    const crowd = lines.find(l => Math.abs(l.y - b.y) < 13) || (pops.some(p => b.y + 4 > p.y && b.y - 4 < p.y + 24) && nearest(lines, b.y));
    if (crowd) { if (crowd.task) crowd.extra += b.n; continue; }
    kept.push(b);
  }

  // ---------- the hung tag needs the rows above its line ----------
  for (const l of lines) l.tagFree = !!l.eng && clear(l.y - 20, l.y - 9, l, kept);
  return { lines, bars: kept, pops };
}

const nearest = (lines, y) => lines.reduce((best, l) => (!best || Math.abs(l.y - y) < Math.abs(best.y - y) ? l : best), null);

// what a mount is doing to this chip right now: { slot, kind, p } or null (p: 0 → 1 through the mount's window)
function engagement(P, task) {
  const { st, L, n } = P, r = B.scanRadius;
  if (task.read) {
    const i = task.read.slot;
    if (L.slots[i]?.layer !== task.read.id) return null;          // sold (or swapped) mid-read: the sim finishes it alone
    const pw = (task.y - (R.mountY(n, i) - r)) / (2 * r);
    const lat = R.elementLatency(st, task.read.id, task.read.level), p = lat > 0 ? pw * R.scanDwell(st) / lat : 1;
    return { slot: i, kind: 'det', p: clamp(p, 0, 1) };
  }
  const span = (B.mountBottom - B.mountTop) / n, i = clamp(Math.round((task.y - B.mountTop) / span - 0.5), 0, n - 1);
  const dy = task.y - R.mountY(n, i), s = L.slots[i];
  if (Math.abs(dy) > r || !R.slotActive(st, s)) return null;
  const kind = KIND[s.layer];
  if (!kind || kind === 'det') return null;
  if ((kind === 'kill' || kind === 'bay') && !task.flagged) return null;
  return { slot: i, kind, p: clamp((dy + r) / (2 * r), 0, 1) };
}

// =================== scope body: sweep, bars, lines, ghosts ===================
// Only the sweep needs the body clip: every row, bar, reticle and pop is laid out inside the body already.

function body(P, lay) {
  const { g, bx } = P;
  g.save(); clipRect(g, bx, FT, BODY, FB - FT);
  sweep(P);
  g.restore();

  // bundle bars; the caption rides the topmost one (handed over in two halves as a new bar fades in above it)
  const bars = lay.bars, top = bars.length ? fadeA(bars[0].y, 4) : 1;
  const h1 = clamp(1 - 2 * top, 0, 1), h2 = clamp(2 * top - 1, 0, 1);
  bars.forEach((b, i) => drawBar(P, b, i === 0 ? h2 : i === 1 ? h1 : 0, i === 0 ? 0 : i === 1 ? h2 : 1));

  for (const l of lay.lines) (l.dead ? drawDead(P, l) : drawLine(P, l));
  for (const l of lay.lines) if (l.eng) reticle(P, l);
  for (const p of lay.pops) sprite(g, SPR.bang, p.x, p.y, { '#': p.white ? C.wht : C.rLite, r: p.white ? C.wht : C.r }, 2);
  // every full line can be hovered (its whole text) and clicked (the tutorial's first step)
  for (const l of lay.lines) if (l.task && fadeA(l.y, 8) > 0.5) P.c.hit.add(P.tx - 12, l.y - 8, P.ex - P.tx + 14, 16, 'line', { lane: P.lane, id: l.task.id, text: l.task.text, flagged: l.task.flagged }, 'help');
}

// the lowest active responder on the lane (sim y): a flag past it has nowhere left to go, it ships unreviewed
function lastResponderY(P) {
  let y = -1;
  P.L.slots.forEach((s, i) => { if (s.layer && R.slotActive(P.st, s) && LAYERS[s.layer].role === 'responder') y = R.mountY(P.n, i); });
  return y;
}

// a band under a row that lets only a dim trace (UNDER) of the scope through: the sweep reads as passing behind the text
function backing(P, x, y, w, h, col) {
  const { g } = P, a0 = g.globalAlpha;
  g.globalAlpha = 1 - UNDER;
  fill(g, x, y, w, h, col);
  g.globalAlpha = a0;
}
// a band colour with tints mixed in: [colour, weight] pairs, applied in order (one rect instead of one per tint)
const RGB = new Map();
function rgbOf(col) {
  let v = RGB.get(col);
  if (!v) { const n = parseInt(col.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; RGB.set(col, v); }
  return v;
}
function mixed(base, tints) {
  if (!tints.length) return base;
  const v = rgbOf(base).slice();
  for (const [col, f] of tints) { const c2 = rgbOf(col), w = clamp(f, 0, 1); for (let i = 0; i < 3; i++) v[i] += (c2[i] - v[i]) * w; }
  return `rgb(${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])})`;
}
function tint(g, x, y, w, h, col, a) {
  const a0 = g.globalAlpha;
  g.globalAlpha = a0 * a; fill(g, x, y, w, h, col); g.globalAlpha = a0;
}

function drawBar(P, b, capA, barA) {
  const { g, col, tx, ex, st } = P, y = b.y, a = fadeA(y, 4);
  if (a <= 0) return;
  const L = tx - 12;
  backing(P, L, y - 4, ex - L + 2, 8, C.bg);
  const pk = ping(P, tx + 60, y, P.t), lit = b.eng || pk > 0.3;
  g.globalAlpha = a;
  fill(g, L + 4, y - 1, 3, 3, b.flagged ? C.r : col.ddim);
  if (P.c.debug && P.c.view.truth && b.attack) fill(g, P.bx + 2, y - 3, 2, 6, C.debug);
  const tag = microArt(compact(b.n), lit ? col.mid : col.dim);
  blit(g, tag, ex - tag.w, y - 2);
  if (barA > 0) { g.globalAlpha = a * barA; blit(g, greekArt(b.id % 12, lit ? col.mid : col.dim), tx, y - 1); }
  else if (capA > 0) { g.globalAlpha = a * capA; say(g, 'BUNDLED TRAFFIC', tx, y + 2, F.k8, lit ? col.mid : col.dim); }
  g.globalAlpha = 1;
}

function drawLine(P, l) {
  const { g, col, tx, ex, A, st, t } = P, task = l.task, y = l.y, red = task.flagged;
  const a = fadeA(y, 8) * l.inA;
  if (a <= 0) return;
  const L = tx - 12, w = ex - L + 2;

  // ---------- the band, with its tints mixed in (engaged, the sweep's ping, just back from a bay) ----------
  const pk = red ? 0 : ping(P, tx + 60, y, t), b0 = A.back.get(task.id), tints = [], k1 = a / (1 - UNDER);
  if (l.eng) tints.push([red ? C.r : col.acc, 0.1 * k1]);
  if (pk > 0) tints.push([col.acc, 0.16 * pk * k1]);
  if (b0 != null && t - b0 < T.back && t >= b0) tints.push([col.lite, 0.25 * (1 - (t - b0) / T.back) * k1]);
  backing(P, L, y - 8, w, 16, mixed(red ? C.rBack : C.bg, tints));
  g.globalAlpha = a;

  // ---------- the ×N tag (lines bunched behind this one) or UNREVIEWED, and the text that fits before it ----------
  const ships = red && task.y > P.lastResp, chipSt = A.chipStamps.get(task.id);
  const stampS = ships ? STAMPS.unreviewed : chipSt && t - chipSt.t0 < T.falseAlarm && t >= chipSt.t0 ? STAMPS.falseAlarm : '';
  const N = 1 + l.extra, tagS = N > 1 && !stampS ? compact(N) : '';
  const tagW = stampS ? tw(stampS, F.k8) + 12 : tagS ? 6 + tw(tagS, F.v16) : 0, lock = task.leastPriv > 0;
  const s = fitted(task.text, ex - tagW - 6 - tx - (lock ? 9 : 0));
  const base = red ? C.r : l.eng?.kind === 'det' ? col.mid : col.text, cw = s.length ? tw(s, F.v16) / s.length : CW;

  // ---------- prefix: flag, unread, checked, or not yet looked at (drawn with the text, below) ----------
  const u0 = A.unread.get(task.id);
  let pre = P.ext ? '>' : '$', preCol = col.dim;
  if (red) pre = 'bang';
  else if (u0 != null && t - u0 < T.unread && t >= u0) { pre = '?'; preCol = strobe(t, 8) || t - u0 > 0.5 ? col.mid : col.dim; }
  else if (inspected(P, task)) pre = 'check';

  // ---------- what the mount beside it is doing, under / around the glyphs ----------
  const k0 = l.eng?.kind;
  let readTo = 0;
  if (k0 === 'det') {
    const nRead = Math.min(s.length, Math.floor(l.eng.p * (s.length + 1)));
    readTo = nRead * cw;
    const hx = tx + readTo, h0 = Math.max(0, tx - (hx - 18));
    if (h0 < 18) g.drawImage(washArt(P.side, red).cv, h0 * k, 0, (18 - h0) * k, 16 * k, Math.round((hx - 18 + h0) * k) / k, y - 8, 18 - h0, 16);
  } else if (k0 === 'par') {
    const i0 = Math.min(s.length, Math.floor(l.eng.p * (s.length + 1))), i1 = Math.min(i0 + 3, s.length);
    if (i1 > i0) tint(g, tx + i0 * cw, y - 7, (i1 - i0) * cw, 14, col.lite, 0.3);
  }

  putLine(g, lineInk(s, base, pre, preCol, tagS, red ? C.r : col.dim, ex - tx), tx, y);
  if (k0 === 'det' && readTo > 0) putInk(g, ink(s, red ? C.rLite : col.lite), tx, y + 4, 0, readTo);
  if (pk > 0 && !k0) { g.globalAlpha = a * pk; putInk(g, ink(s, col.hot), tx, y + 4); g.globalAlpha = a; }
  if (k0 === 'par') {
    const i0 = Math.min(s.length, Math.floor(l.eng.p * (s.length + 1))), i1 = Math.min(i0 + 3, s.length);
    if (i1 > i0) {
      putInk(g, ink(s, strobe(t, 14) ? C.wht : col.lite), tx, y + 4, i0 * cw, i1 * cw);
      fill(g, tx + i0 * cw, y - 9, (i1 - i0) * cw, 1, col.acc); fill(g, tx + i0 * cw, y + 7, (i1 - i0) * cw, 1, col.acc);
    }
    if (i0 > 0) dashes(g, tx, y + 7, i0 * cw, col.mid, 1, 1);
  }

  // ---------- marks above / below the glyph rows (y-9 and y+7 are clear of every glyph) ----------
  if (k0 === 'det') {
    const hx = Math.round(tx + readTo), lite = red ? C.rLite : col.lite;
    if (readTo > 0) { fill(g, tx, y + 7, hx - tx, 1, red ? C.rm : col.dim); fill(g, hx - 3, y + 7, 3, 1, lite); }
    fill(g, hx - 2, y - 9, 4, 1, lite);
  } else if (task.paraphrased && k0 !== 'par') dashes(g, tx, y + 7, s.length * cw, col.dim, 1, 1);
  if (k0 === 'sbx') dashRect(g, L, y - 9, w - 1, 18, col.mid, 3, 2, Math.floor(mod(t * 8, 5)));
  else if (task.sandboxed) dashRect(g, L, y - 9, w - 1, 18, col.ddim, 3, 2);
  if (lock) sprite(g, SPR.lock, tx + s.length * cw + 3, y - 4, { '#': k0 === 'lp' ? col.acc : col.mid });
  if (k0 === 'lp') dashes(g, tx, y + 7, s.length * cw, col.dim, 1, 2);
  if (stampS) {
    const sw = tw(stampS, F.k8) + 8, sx = ex - sw, fa = stampS === STAMPS.falseAlarm;
    fill(g, sx, y - 6, sw, 12, fa ? C.ambD : C.rdd); box(g, sx, y - 6, sw, 12, fa ? C.ambL : C.r);
    say(g, stampS, sx + 4, y + 3, F.k8, fa ? C.ambL : (strobe(t, 3, 0.7) ? C.r : C.rm));
  }
  if (P.c.debug && P.c.view.truth && task.isAttack) fill(g, P.bx + 2, y - 7, 2, 14, C.debug);
  g.globalAlpha = 1;
}

// has it passed a working mount yet? (a check mark), else the lane's prompt glyph
function inspected(P, task) {
  const { st, L, n } = P, r = B.scanRadius;
  for (let i = 0; i < n; i++) {
    if (R.mountY(n, i) + r > task.y) return false;
    if (R.slotActive(P.st, L.slots[i])) return true;
  }
  return false;
}

// target lock round a line being read or acted on; the tower's tag hangs on it where there is room
function reticle(P, l) {
  const { g, col, tx, ex, L: lane } = P, y = l.y, red = l.task?.flagged, kind = l.eng.kind;
  const a = fadeA(y, 8) * (l.inA ?? 1);
  if (a <= 0) return;
  g.globalAlpha = a;
  const rc = red || kind === 'kill' ? C.r : kind === 'bay' ? col.acc : col.mid, rw = ex + 2 - (tx - 14) + 1;
  // corner ticks only, inset a pixel: two locked lines one row apart still read as two
  blit(g, art(`reticle|${rw}|${rc}`, rw, 16, rg => corners(rg, 0, 0, rw, 16, rc, 4)), tx - 14, y - 8);
  const id = lane.slots[l.eng.slot]?.layer;
  if (id && l.tagFree && l.primary) {
    const tag = LAYERS[id].tag, w = tw(tag, F.k8) + 5;
    fill(g, tx - 14, y - 19, w, 9, red ? C.r : col.acc);
    say(g, tag, tx - 11, y - 12, F.k8, red ? C.rInk : C.bg);
  }
  g.globalAlpha = 1;
}

// a struck, blocked or pulled line: no glyphs any more, just its band, a stamp and (kill) the blade
function drawDead(P, l) {
  const { g, col, tx, ex, t } = P, d = l.dead, y = l.y, age = l.age, L = tx - 12, w = ex - L + 2;
  const a = fadeA(y, 8) * clamp((d.kind === 'pull' ? T.ghost : T.dead) - age, 0, 0.3) / 0.3;
  if (a <= 0) return;
  g.globalAlpha = a;
  if (d.kind === 'pull') {
    dashRect(g, L - 2, y - 8, w + 2, 16, col.ddim, 2, 2);
    const tag = LAYERS[P.L.slots[d.slot]?.layer]?.tag ?? 'BAY', lw = tw(tag, F.k8);
    sprite(g, SPR.tri, ex - 14 - lw, y - 2, { '#': col.mid }); sprite(g, SPR.tri, ex - 10 - lw, y - 2, { '#': col.mid });
    say(g, tag, ex - 4 - lw, y + 3, F.k8, col.mid);
    g.globalAlpha = 1;
    return;
  }
  const kill = d.kind === 'kill', hot = kill ? C.r : col.acc;     // a refusal is never checked: '?'
  backing(P, L, y - 8, w, 16, kill ? C.rBack : C.bg);
  g.globalAlpha = a;
  if (kill) {
    const drop = clamp(age / 0.1, 0, 1), by = Math.round(lerp(y - 12, y - 1, drop));
    fill(g, L, by, w, 2, age < 0.12 ? C.wht : C.r);
  } else dashes(g, L, y, w, col.dim, 1, 2);
  const s = STRIKE[d.kind], sw = tw(s, F.k8) + 10, sx = Math.round(tx + (ex - tx - sw) / 2);
  fill(g, sx, y - 6, sw, 12, kill ? C.r : C.bg); box(g, sx, y - 6, sw, 12, hot);
  say(g, s, sx + 5, y + 3, F.k8, kill ? C.rInk : hot);
  g.globalAlpha = 1;
}

// =================== rail: ten rows ===================

// per mount: how many chips it is reading, and the full line it beams at (the nearest one it acts on)
function targets(P, lay) {
  const { L, n } = P;
  P.reading = new Array(n).fill(0);
  for (const task of L.tasks) if (task.read) P.reading[task.read.slot]++;
  P.target = new Array(n).fill(null);
  for (const l of lay.lines) if (l.eng) {
    const i = l.eng.slot, cur = P.target[i];
    if (!cur || Math.abs(l.y - rowCentre(i)) < Math.abs(cur.y - rowCentre(i))) P.target[i] = l;
  }
  for (const l of P.target) if (l) l.primary = true;
}

function rail(P) {
  const { c, L, n, lane, A, t } = P, view = c.view;
  for (let i = 0; i < ROWS; i++) {
    const r = mountRect(P.side, i), slot = L.slots[i], hover = view.hover?.data;
    const hovered = !!hover && hover.lane === lane && (view.hover.kind === 'mount' ? hover.slot === i : view.hover.kind === 'slot-buy' && i === n);
    if (slot?.layer) plate(P, i, slot, r, hovered);
    else if (slot) emptyMount(P, i, r, hovered);
    else if (i === n) buyRow(P, r, hovered);
    else futureRow(P, i, r);
    if (slot) c.hit.add(r.x, r.y, r.w, r.h, 'mount', { lane, slot: i }, !view.placing ? 'pointer' : slot.layer ? 'not-allowed' : 'crosshair');
    else if (i === n) c.hit.add(r.x, r.y, r.w, r.h, 'slot-buy', { lane });
    const fx0 = A.plates[i];
    if (fx0 && t - fx0.t0 < T.plate && t >= fx0.t0 && slot) plateFlash(P, fx0, r);
  }
}

// ---------- a placed element ----------
function plate(P, i, slot, r, hovered) {
  const { g, st, lane, col, X, c, t, A } = P, id = slot.layer, my = r.y - 1;
  const active = R.slotActive(st, slot), badge = badgeOf(P, i, slot), engaged = !!(active && (P.reading[i] > 0 || P.target[i]));
  const sig = [id, slot.level, active, badge.text, badge.col, badge.sub || ''].join('|');
  // two cached images per mount (idle / engaged: the frame and the nozzle differ), each repainted when the plate changes
  put(g, aligned(`plate-${lane}-${i}-${engaged}`, sig, r.x, r.y, r.w + 3, r.h, pg => paintPlate(pg, P, slot, r, active, badge, engaged)));

  // live: selection or hover, and the LED
  const sel = c.view.selected, selected = sel && sel.lane === lane && sel.slot === i;
  if (selected) { frame(g, r.x, r.y, r.w, r.h, col.acc); corners(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, col.hot, 5, 1); }
  else if (hovered && !engaged) frame(g, r.x, r.y, r.w, r.h, col.dim);
  const heads = KIND[id] === 'det' ? R.detectorHeads(id, slot.level) : 0;
  const full = heads && busyNow(slot, st.t) >= heads;
  const led = !active ? null : full ? (strobe(t, 6) ? col.hot : col.dim) : engaged ? col.acc : null;
  if (led) fill(g, X + 120, my + 3, 3, 3, led);
  if (id === 'killswitch' && active && auditorBelow(P, i)) killAbove(P, r, t);
  // a chip that landed went past these: red stripe on each mount that read it and missed, or was too busy to read it
  const inc = A.incident;
  if (P.ext && inc && A.missed?.has(i) && t - inc.t0 < T.landed && mod(t * 2.4, 1) < 0.6) fill(g, X + 1, my + 8, 2, 26, C.r);
}

// an active Auditor below this mount: the Kill Switch takes every flag it has room for, so the humans see only the rest
const auditorBelow = (P, i) => P.L.slots.some((s, j) => j > i && s.layer === 'auditor' && R.slotActive(P.st, s));
function killAbove(P, r, t) {
  const { g } = P, x0 = r.x + 3, y0 = r.y + 27, w = 120, s = '! ' + LANE_UI.killAbove + '   ';
  fill(g, x0, y0, w, 12, C.ambDD); box(g, x0, y0, w, 12, C.amb);
  const sw = tw(s, F.v16), off = Math.floor(mod(t * 24, sw));
  g.save(); clipRect(g, x0 + 1, y0 + 1, w - 2, 10);
  say(g, s, x0 + 3 - off, y0 + 10, F.v16, C.ambL); say(g, s, x0 + 3 - off + sw, y0 + 10, F.v16, C.ambL);
  g.restore();
}

function paintPlate(g, P, slot, r, active, badge, engaged) {
  const { col } = P, id = slot.layer, X = r.x - 1, my = r.y - 1, Ld = LAYERS[id];
  fill(g, r.x, r.y, r.w, r.h, C.pan2); box(g, r.x, r.y, r.w, r.h, engaged ? col.mid : col.ddim);
  if (active) fill(g, X + 127, my + 19, 3, 7, KIND[id] === 'bay' ? col.dim : engaged ? col.acc : col.ddim);   // the nozzle
  fill(g, X + 4, my + 1, 22, 22, C.black); box(g, X + 4, my + 1, 22, 22, active ? col.dim : col.ddim);
  icon(g, id, X + 5, my + 2, 2, active ? col.acc : col.dim);
  text(g, Ld.tag, X + 30, my + 18, F.v20, active ? col.acc : col.dim);
  for (let p = 0; p < 5; p++) {
    const px = X + 66 + p * 5;
    if (p < slot.level) fill(g, px, my + 8, 4, 8, p === 4 ? col.hot : active ? col.mid : col.dim);
    else box(g, px, my + 8, 4, 8, col.ddim);
  }
  text(g, badge.text, X + 122, my + 18, badge.small ? F.v16 : F.v20, badge.col, 'right');
  const sw = badge.sub ? tw(badge.sub, F.v16) + 4 : 0;
  text(g, fit(PLATE_NAME[id] ?? Ld.name, F.v16, 115 - sw), X + 7, my + 36, F.v16, col.dim);
  if (badge.sub) text(g, badge.sub, X + 123, my + 36, F.v16, badge.subCol, 'right');
}

const rate = x => (x > 0 && x < 0.005 ? '<1%' : pct(x));     // a G7 auditor reads <1%, not a flat 0%

// the plate's live number: the measured catch rate when a Red Team above has one, else the spec sheet (never the truth)
function badgeOf(P, i, slot) {
  const { st, lane, col } = P, id = slot.layer;
  if (!slot.on) return { text: 'OFF', col: col.dim };
  if (st.t < slot.forcedOffUntil) return { text: 'OFF', col: col.dim, sub: Math.ceil(slot.forcedOffUntil - st.t) + 's', subCol: col.mid };
  const m = R.measuredAt(st, lane, i);
  if (m) return { text: rate(m.rate), col: col.hot, sub: '±' + Math.round(100 * m.err), subCol: col.mid };
  if (KIND[id] === 'det') return { text: rate(R.ratedTPR(st, id, slot.level, lane)), col: col.text };       // rated, never measured truth
  if (id === 'auditor') {
    const a = R.auditStats(st, lane, i), hot = a.overflow > 0.3 ? C.r : a.load > 0.8 ? C.ambL : col.text;
    return { text: a.flagsPerMin > 0.05 ? rate(Math.min(9.99, a.load)) : 'IDLE', col: hot, small: a.flagsPerMin <= 0.05 };
  }
  if (id === 'redteam') {
    const lm = R.laneMeasuredAt(st, lane, i);
    if (lm) return { text: pct(lm.rate), col: col.hot, sub: 'ALL ±' + Math.round(100 * lm.err), subCol: col.mid };
  }
  return { text: WORD[id] || '', col: col.dim, small: true };   // a word tag, not a number: smaller so it clears the level pips
}

// ---------- an empty mount: dashed; it glows while an element that can go here is being placed ----------
function emptyMount(P, i, r, hovered) {
  const { g, col, c, lane, t } = P, X = r.x - 1, my = r.y - 1, id = c.view.placing;
  const onTrack = id && !LAYERS[id].lanes.includes('global');
  if (onTrack && R.canPlace(id, lane)) {
    dashRect(g, X + 4, my + 5, 120, 32, hovered ? col.hot : col.acc, 3, 2, Math.floor(mod(t * 10, 5)));
    say(g, 'PLACE', X + 12, my + 24, F.k8, col.acc);
    say(g, LAYERS[id].tag, X + 118, my + 25, F.v16, hovered ? col.hot : col.acc, 'right');
  } else if (onTrack) {
    dashRect(g, X + 4, my + 5, 120, 32, col.ddim, 2, 2);
    say(g, LAYERS[id].lanes.includes('ext') ? 'EXTERNAL ONLY' : 'INTERNAL ONLY', X + 12, my + 24, F.k8, col.dim);
  } else {
    dashRect(g, X + 4, my + 5, 120, 32, hovered ? col.mid : col.dim, 2, 2);
    say(g, 'EMPTY MOUNT', X + 12, my + 24, F.k8, hovered ? col.mid : col.dim);
    say(g, String(i + 1), X + 118, my + 25, F.v16, col.dim, 'right');
  }
}

// ---------- the next mount for sale, and the ones after it (locked until this one is bought) ----------
function buyRow(P, r, hovered) {
  const { g, st, col, lane, c, t } = P, X = r.x - 1, my = r.y - 1, price = R.slotPrice(st, lane), can = st.money >= price;
  if (c.view.research?.type === 'mount') {                 // a research MOUNT card: this lane's next mount, free
    dashRect(g, X + 4, my + 5, 120, 32, hovered ? col.hot : C.rs, 3, 2, Math.floor(mod(t * 10, 5)));
    say(g, '+ MOUNT', X + 12, my + 24, F.k8, C.rs);
    say(g, 'FREE', X + 118, my + 25, F.v16, hovered ? col.hot : C.rs, 'right');
    return;
  }
  dashRect(g, X + 4, my + 5, 120, 32, hovered && can ? col.acc : can ? col.dim : col.ddim, 2, 2);
  say(g, '+ SLOT', X + 12, my + 24, F.k8, can ? col.mid : col.dim);
  say(g, money(price), X + 118, my + 25, F.v16, can ? col.mid : col.dim, 'right');
}
function futureRow(P, i, r) {
  const { g, st, col } = P, X = r.x - 1, my = r.y - 1;
  const price = B.slotBase * Math.pow(B.slotMult, Math.max(0, i - B.startSlots)) * R.priceIndex(st);   // rules.js slotPrice, i mounts in
  dashRect(g, X + 4, my + 5, 120, 32, col.ddim, 2, 2);
  sprite(g, SPR.lock, X + 12, my + 18, { '#': col.dim });
  say(g, '+ SLOT', X + 21, my + 24, F.k8, col.dim);
  say(g, money(price), X + 118, my + 25, F.v16, col.dim, 'right');
}

// ---------- plate events: a border flash in the event's colour ----------
function plateFlash(P, f, r) {
  const { g, col, t } = P, age = t - f.t0, on = mod(age * 10, 1) < 0.6;
  const hot = { kill: C.r, block: col.acc, catch: col.acc, unread: col.mid, bait: col.acc, probe: col.dim, place: col.hot,
    upgrade: col.hot, sell: col.dim, toggle: col.mid }[f.kind] || col.mid;
  if (f.kind === 'probe') { if (on) fill(g, r.x + 119, r.y + 2, 3, 3, C.r); return; }
  if (!on) return;
  frame(g, r.x, r.y, r.w, r.h, hot);
  if (f.kind === 'upgrade' || f.kind === 'place') frame(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, hot);
  if (f.kind === 'kill') box(g, r.x + 3, r.y, 22, 22, C.r);
}

// =================== beams: tower → nozzle → cone through the bezel → the line it acts on ===================

function beams(P) {
  const { g, L, n, X, tx, col, st } = P;
  for (let i = 0; i < n; i++) {
    const slot = L.slots[i];
    if (!slot.layer || !R.slotActive(st, slot)) continue;
    const l = P.target[i], my = MT + i * PITCH, cr = my + 21;
    if (!l && !P.reading[i]) continue;
    const red = l?.task?.flagged || l?.eng.kind === 'kill', hot = red ? C.r : col.acc, lite = red ? C.rLite : col.lite;
    const dy = l ? l.y - 1 - cr : null;    // no line: it is reading a bundled chip
    g.globalAlpha = Math.max(0.35, l ? fadeA(l.y, 8) * (l.inA ?? 1) : 1);
    blit(g, beamArt(P.side, hot, lite, tx - 14 - (X + 130), dy), X + 26, cr + beamTop(dy));
    g.globalAlpha = 1;
  }
}

// =================== hoods back on top, with the event or pause written on the intake ===================

function hoods(P, layer) {
  const { g, bx, col, events, paused, t, st, L } = P;
  blit(g, fadeArt(P.side, true), bx, FT + HOOD);
  blit(g, fadeArt(P.side, false), bx, FB - HOOD - 4);
  putPart(g, layer, bx, FT, BODY, HOOD);
  putPart(g, layer, bx, FB - HOOD, BODY, HOOD);
  // the intake's own label: a G7 burst on its way or running, a new lane ramping up, a closed contract
  const bu = animState(P.c).burst, bAge = bu ? st.t - bu.t : 99;
  let note = null;
  if (bu && bAge >= 0 && bAge < bu.in) note = [tpl(BURST.warn, { secs: Math.ceil(bu.in - bAge) }), strobe(t, 3, 0.6) ? C.r : C.rm];
  else if (bu && bAge >= bu.in && bAge < bu.in + bu.dur) note = [tpl(BURST.on, { mult: bu.mult }), C.r];
  else if (!L.open) note = [CONTRACT_UI.tag + ' · IDLE', C.amb];
  else if (R.laneRamping(st, P.lane)) note = [tpl(CONTRACT_UI.ramp, { secs: Math.ceil(Math.max(0, B.laneRamp - ((st.genT ?? 0) - (L.openedT ?? 0)))) }).toUpperCase(), col.acc];
  if (note && !events.length && !paused) { say(g, fit(note[0], F.k8, BODY - 70), bx + 66, FT + 10, F.k8, note[1]); return; }
  if (!events.length && !paused) return;
  const on = glowPhase(t) > 0.3;
  if (events.length) {
    g.globalAlpha = 0.18 * glowPhase(t); fill(g, bx, FT, BODY, HOOD - 1, C.lcd); g.globalAlpha = 1;
    sprite(g, SPR.down, bx + 6, FT + 5, { '#': C.lcdMid });
    say(g, 'INTAKE', bx + 15, FT + 10, F.k8, C.lcdMid);
    corners(g, bx - 3, FT - 3, BODY + 6, FB - FT + 6, on ? C.lcd : col.mid, 8);
  }
  const label = paused ? `HALTED ${Math.ceil(L.pausedUntil - st.t)}S` : events[0].title.toUpperCase() + (events.length > 1 ? ` +${events.length - 1}` : '');
  say(g, fit(label, F.k8, BODY - 70), bx + 66, FT + 10, F.k8, paused ? col.acc : on ? C.lcd : C.lcdMid);
}

// the scope's bezel answers an incident on this lane: EXTERNAL flashes red with the codec, INTERNAL flickers violet
function bevelFx(P) {
  const { g, bx, A, t } = P;
  const inc = A.incident, an = A.anomaly;
  if (inc && t - inc.t0 < T.landed && t >= inc.t0 && mod(t * 2.4, 1) < 0.6) bevel(g, bx, [C.r, C.black, C.rm]);
  else if (an && t - an.t0 < T.anomaly && t >= an.t0) {
    const f = 1 - (t - an.t0) / T.anomaly;
    if (hash(Math.floor(t * 30)) < 0.35 + 0.6 * f) bevel(g, bx, [C.v, C.black, C.vm]);
  }
}

// =================== bays: responders pull lines aside through a gate; desks work them off-track ===================
// Each bay mount gets a corridor at its row (cut through the bezel), a name plate and its desks. Desks hang below the
// corridor, or stack above it when the bay sits too low; they shrink when bays crowd each other.

function bayLayout(P) {
  const { st, L } = P, out = [];
  L.slots.forEach((s, i) => {
    if (s.layer && LAYERS[s.layer].bay) out.push({ slot: i, id: s.layer, level: s.level, cy: rowCentre(i), d: R.bayDesks(st, s.layer, s.level) });
  });
  let limit = FB - 3;
  for (let j = out.length - 1; j >= 0; j--) {
    const b = out[j], roof = j > 0 ? out[j - 1].cy + 32 : FT + 3;
    const down = limit - (b.cy + 14) + 4, up = (b.cy - 34) - roof + 4;
    b.dir = b.d === 0 || down >= Math.min(b.d, 2) * 22 || down >= up ? 1 : -1;
    const room = Math.max(0, b.dir > 0 ? down : up);
    b.pitch = clamp(Math.floor(room / Math.max(1, b.d)), 16, 38);
    b.shown = Math.min(b.d, Math.floor(room / b.pitch));
    b.deskTop = j2 => (b.dir > 0 ? b.cy + 14 + j2 * b.pitch : b.cy - 34 - (b.shown - j2) * b.pitch + 4);
    b.top = b.dir > 0 ? b.cy - 30 : b.deskTop(0);
    b.bot = b.dir > 0 ? b.cy + 14 + b.shown * b.pitch - 4 : b.cy + 10;
    b.rev = b.dir > 0 && limit - b.bot >= 16;
    if (b.rev) b.bot += 14;
    limit = b.top - 4;
  }
  return out;
}

function bays(P) {
  const { g, c, st, lane, col, by } = P;
  const groups = bayLayout(P);

  // ---------- meter: share of detector heads busy right now ----------
  const top = groups.length ? groups[0].top - 6 : FB - 46, bot = groups.length ? groups[groups.length - 1].bot + 6 : FB;
  if (top - FT >= 64) meter(P, FT, top);
  else if (FB - bot >= 64) meter(P, bot, FB - 2);

  for (const b of groups) {
    syncDesks(P, b);
    gate(P, b);
    // name plate (between the corridor and the desks)
    const ny = b.cy - 30, hidden = b.d - b.shown;
    fill(g, by + 2, ny, 60, 16, col.ddim);
    say(g, BAY_NAME[b.id] + (hidden ? ' +' + hidden : ''), by + 32, ny + 11, F.k8, col.acc, 'center');
    for (let j = 0; j < b.shown; j++) desk(P, b, j);
    if (b.rev) say(g, `${BAY_REV[b.id]} ${R.elementLatency(st, b.id, b.level).toFixed(1)}s`, by + 32, b.bot - 2, F.v16, col.dim, 'center');
    c.hit.add(by, b.top, TRACK.bayW, b.bot - b.top, 'bay', { lane, slot: b.slot });
    const sel = c.view.selected;
    if (sel && sel.lane === lane && sel.slot === b.slot) box(g, by, b.top - 2, TRACK.bayW, b.bot - b.top + 4, col.acc);
  }
  if (!groups.length) {
    const y = FB - 40;
    dashRect(g, by + 2, y, 60, 36, col.ddim, 2, 2);
    say(g, 'NO DESK', by + 32, y + 11, F.k8, col.dim, 'center');
    say(g, 'flags', by + 32, y + 23, F.v16, col.dim, 'center');
    say(g, 'ship', by + 32, y + 34, F.v16, col.dim, 'center');
  }
}

function meter(P, y0, y1) {
  const { g, st, L, col, by, t } = P;
  let heads = 0, busy = 0;
  L.slots.forEach(s => {
    if (!s.layer || KIND[s.layer] !== 'det' || !R.slotActive(st, s)) return;
    heads += R.detectorHeads(s.layer, s.level);
    busy += busyNow(s, st.t);
  });
  const lv = heads ? busy / heads : 0;
  say(g, 'LOAD', by + 4, y0 + 13, F.k8, col.dim);
  say(g, heads ? Math.round(lv * 100) + '%' : '--', by + 4, y0 + 32, F.v20, col.mid);
  const mTop = y0 + 40, mBot = y1 - 6, nSeg = Math.floor((mBot - mTop) / 6), lit = Math.round(lv * nSeg);
  if (nSeg < 2) return;
  // segment i (from the bottom) sits at mBot-5-6i inside a 1 px gap and the frame; ticks every 30 px up from mBot
  const H = nSeg * 6 + 2, top = mBot + 1 - H, seg = (mg, c2, i0, i1) => { for (let i = i0; i < i1; i++) fill(mg, 8, H - 6 - 6 * i, 12, 4, c2); };
  blit(g, art(`meter|${P.side}|${nSeg}`, 22, H, mg => {
    box(mg, 6, 0, 16, H, col.ddim);
    mg.globalAlpha = 0.45; seg(mg, col.ddim, 0, nSeg); mg.globalAlpha = 1;
    for (let y = H - 1; y >= 0; y -= 30) fill(mg, 0, y, 4, 1, col.ddim);
  }), by + 18, top);
  if (lit > 1) blitPart(g, art(`meter-lit|${P.side}|${nSeg}`, 22, H, mg => seg(mg, col.dim, 0, nSeg)), by + 18, top + H + 6 - 6 * lit, 0, H + 6 - 6 * lit, 22, 6 * lit - 8);
  if (lit > 0) fill(g, by + 26, mBot - 5 - (lit - 1) * 6, 12, 4, strobe(t, 3) ? col.acc : col.mid);
}

// keep each task on the desk it sat down at; new arrivals take a free desk (one whose stamp has been read first)
function syncDesks(P, b) {
  const { A, L, t } = P, here = L.bay.filter(task => task.actSlot === b.slot);
  let desks = A.desks[b.slot];
  if (!desks || desks.length !== b.d) desks = A.desks[b.slot] = Array.from({ length: b.d }, (_, j) => desks?.[j] ?? null);
  const stamps = A.stamps[b.slot] || (A.stamps[b.slot] = []);
  const ids = new Set(here.map(task => task.id));
  for (let j = 0; j < desks.length; j++) if (desks[j] != null && !ids.has(desks[j])) desks[j] = null;
  for (const task of here) {
    if (desks.includes(task.id)) continue;
    let j = desks.findIndex((d, i) => d == null && !(stamps[i] && t - stamps[i].t0 < T.stamp));
    if (j < 0) j = desks.findIndex(d => d == null);
    if (j >= 0) { desks[j] = task.id; stamps[j] = null; }
  }
  b.tasks = new Map(here.map(task => [task.id, task]));
}

// the corridor through the bezel, the dock at its end, and a token sliding in
function gate(P, b) {
  const { g, col, bx, by, A, t } = P, cy = b.cy, c0 = cy - 10;
  const gx = bx + BODY - 2, dx = by - gx;      // the cut, its jaws, the dock rails and the dotted path, from (gx, c0 - 2)
  blit(g, art('gate|' + P.side, dx + 63, 24, gg => {
    fill(gg, 2, 2, 4, 20, col.field); fill(gg, dx, 2, 2, 20, C.pan);
    fill(gg, 0, 0, 7, 2, col.mid); fill(gg, 0, 22, 7, 2, col.mid);
    fill(gg, dx + 1, 1, 62, 1, col.dim); fill(gg, dx + 1, 22, 62, 1, col.dim); fill(gg, dx + 62, 1, 1, 22, col.dim);
    for (let x = 2; x < dx + 2; x += 2) fill(gg, x, 12, 1, 1, col.dim);
  }), gx, c0 - 2);

  const tk = A.tokens.filter(q => q.slot === b.slot && t - q.t0 < T.slide && t >= q.t0).pop();
  const dk = A.docks[b.slot], dAge = dk ? t - dk.t0 : 99;
  if (tk) {
    const task = b.tasks.get(tk.id), name = shortName(tk.text || '…'), red = !!task?.flagged;
    const w = tw(name, F.v16) + 6, e = ease(clamp((t - tk.t0) / T.slide, 0, 1));
    const x = Math.round(lerp(bx + BODY - w, by + 1 + ((61 - w) >> 1), e));
    g.save(); clipRect(g, bx + BODY, c0, by + 63 - (bx + BODY), 20);
    fill(g, x, cy - 9, w, 18, red ? C.rBack : C.bg); box(g, x, cy - 9, w, 18, red ? C.r : col.acc);
    say(g, name, x + 3, cy + 4, F.v16, red ? C.r : col.text);
    g.restore();
  } else if (dAge < T.dock && dAge >= 0) {
    const waved = dk.kind === 'waved', on = strobe(dAge, 6, 0.6);
    if (on) say(g, waved ? 'BUSY' : 'FULL', by + 32, cy + 3, F.k8, waved ? C.r : col.acc, 'center');
  } else {
    const o = Math.floor(mod(t * 6, 3));
    for (let i = 0; i < 3; i++) sprite(g, SPR.tri, by + 24 + i * 7, cy - 2, { '#': i === o ? col.mid : col.ddim });
  }
}

// one desk: header (Dn + status), then the task with who sent it and its progress, a verdict stamp, or the last verdict
function desk(P, b, j) {
  const { g, col, by, A, t } = P, dy = b.deskTop(j), dh = b.pitch - 4, x0 = by + 2, full = dh >= 30;
  const id = A.desks[b.slot]?.[j], task = id != null ? b.tasks.get(id) : null;
  const st0 = A.stamps[b.slot]?.[j], sAge = st0 ? t - st0.t0 : 99, stamped = !task && st0 && sAge < T.stamp && sAge >= 0;
  const inbound = task && A.tokens.some(q => q.id === task.id && t - q.t0 < T.slide && t >= q.t0);
  fill(g, x0, dy, 60, dh, C.pan2); box(g, x0, dy, 60, dh, task ? col.dim : col.ddim);
  say(g, 'D' + (j + 1), x0 + 3, dy + 8, F.k8, col.dim);
  const status = (s, c2) => say(g, s, x0 + 57, dy + 8, F.k8, c2, 'right');

  if (inbound) {
    status('IN', strobe(t, 4) ? col.acc : col.dim);
    if (full) { const o = Math.floor(mod(t * 8, 3)); for (let i = 0; i < 3; i++) sprite(g, SPR.tri, x0 + 22 + i * 6, dy + 17, { '#': i === o ? col.mid : col.ddim }); }
  } else if (task) {
    const f = task.deskTotal > 0 ? clamp(1 - task.deskT / task.deskTotal, 0, 1) : 1, red = task.flagged;
    status('BUSY', col.acc);
    if (full) {
      say(g, shortName(task.text), x0 + 3, dy + 19, F.v16, col.text);
      if (red) fill(g, x0 + 1, dy + 10, 1, 11, C.r);
      const via = red ? A.via.get(task.id) : 'SPOT';
      if (via) { const vw = say(g, 'VIA', x0 + 3, dy + 28, F.k8, col.dim); say(g, via, x0 + 5 + vw, dy + 28, F.k8, col.dim); }
    }
    fill(g, x0 + 3, dy + dh - 4, 54, 2, col.ddim); fill(g, x0 + 3, dy + dh - 4, Math.round(54 * f), 2, red ? C.r : col.mid);
  } else if (stamped) {
    if (full) {
      status('DONE', col.dim);
      blit(g, stampArt(P.side, st0.kind), x0 + 3, dy + 14);
      if (sAge < 0.18) { box(g, x0 + 1, dy + 12, 58, 21, col.acc); tint(g, x0 + 3, dy + 14, 54, 17, C.wht, 0.35); }
    } else status(STAMP[st0.kind].split(' ')[0], st0.kind === 'pass' ? C.r : st0.kind === 'falseAlarm' ? C.ambL : col.acc);
  } else {
    status('FREE', col.dim);
    const last = A.lastStamp[b.slot]?.[j];
    if (full && last) {
      const lw = say(g, 'LAST', x0 + 3, dy + 24, F.k8, col.dim);
      say(g, { approve: 'ok', caught: 'caught', falseAlarm: 'false', redo: 'redo', roll: 'roll', pass: 'flag' }[last] ?? '', x0 + 7 + lw, dy + 25, F.v16, last === 'falseAlarm' ? C.amb : col.dim);
    }
  }
}

// =================== completion edge: coin pops (EXTERNAL), R&D bar and sparks (INTERNAL), LANDED ===================

function edge(P) {
  const { g, st, col, X, bx, A, t, ext } = P, y = EDGE_Y;
  if (ext) {
    const inc = A.incident, iAge = inc ? t - inc.t0 : 99, an = A.anomaly, aAge = an ? t - an.t0 : 99;
    if (iAge < T.landed && iAge >= 0) landed(P, inc, iAge);
    else if (!(aAge < T.anomaly * 2 && aAge >= 0)) for (const p of A.pops) {
      const age = t - p.t0;
      if (age < 0 || age >= T.pop) continue;
      const a = age < 0.15 ? age / 0.15 : age > 0.6 ? clamp((T.pop - age) / 0.3, 0, 1) : 1, rise = Math.round(4 * ease(clamp(age / 0.3, 0, 1)));
      const px = X + 86 + mod(p.idx, 3) * 85, base = y + 23 - rise;
      g.globalAlpha = a;
      sprite(g, SPR.coin, px, base - 13, { o: col.dim, f: col.mid, h: col.lite, d: col.dim }, 2);
      say(g, '+' + money(p.amount), px + 17, base, F.v20, col.lite);
      g.globalAlpha = 1;
    }
    const fresh = A.pops.some(p => t - p.t0 < 0.25 && t >= p.t0);
    say(g, money(st.ledger.byCat.external || 0), X + 402, y + 18, F.v16, fresh ? col.acc : col.mid, 'right');
  } else rdAndDebt(P);
  for (const u of A.unrev) {                                  // a flag shipped unreviewed: a red chip rises off the edge
    const age = t - u.t0;
    if (age < 0 || age >= T.unrev || !ext) continue;
    const w = tw(STAMPS.unreviewed, F.k8) + 8, px = X + 300 - w, py = y - 2 - Math.round(10 * ease(clamp(age / T.unrev, 0, 1)));
    g.globalAlpha = clamp((T.unrev - age) / 0.4, 0, 1);
    fill(g, px, py, w, 12, C.rdd); box(g, px, py, w, 12, C.r); say(g, STAMPS.unreviewed, px + 4, py + 9, F.k8, C.r);
    g.globalAlpha = 1;
  }
  anomalyStamp(P);
}

// INTERNAL edge (DESIGN-v3 §3e): the R&D bar (120 px) toward the next model, and the debt meter (120 px):
// LANDED ≈ and STOPPED ≈, both as m, from what the player saw (rules.js debtEstimate: glitches, confirmed catches)
function rdAndDebt(P) {
  const { g, st, col, X, A, t, lane } = P, y = EDGE_Y, T0 = TRACKS[P.side], rb = T0.rdBar, db = T0.debt;
  const rdLane = !!R.laneDef(lane)?.rd, last = st.gen >= GENERATIONS.length;
  say(g, rdLane ? (last ? 'SHIP' : `G${st.gen + 1}`) : 'R&D', X + 15, y + 16, F.k8, col.dim);
  if (rdLane) {
    const pr = clamp(st.rd / st.rdNeed, 0, 1), lit = Math.floor(pr * 30);
    const segs = (c2, a2) => art(`rd|${c2}|${a2}`, 120, 9, rg => { rg.globalAlpha = a2; for (let i = 0; i < 30; i++) fill(rg, i * 4, 0, 3, 9, c2); });
    blit(g, segs(col.ddim, 0.5), rb.x, rb.y);
    if (lit > 0) blitPart(g, segs(col.mid, 1), rb.x, rb.y, 0, 0, lit * 4 - 1, 9);
    const spark = A.sparks.find(s => t - s.t0 < T.spark && t >= s.t0);
    if (spark && lit > 0) {
      const f = (t - spark.t0) / T.spark, sx = rb.x + 1 + (lit - 1) * 4;
      fill(g, sx - 1, rb.y, 3, 9, col.lite);
      g.globalAlpha = 1 - f;
      fill(g, sx, rb.y - 3 - Math.round(3 * f), 1, 1, col.lite); fill(g, sx - 2 - Math.round(2 * f), rb.y - 2 - Math.round(2 * f), 1, 1, col.mid);
      fill(g, sx + 2 + Math.round(2 * f), rb.y - 2 - Math.round(2 * f), 1, 1, col.mid);
      g.globalAlpha = 1;
    }
    say(g, (pr * 100).toFixed(1) + '%', rb.x + rb.w + 4, y + 18, F.v16, col.acc);
  } else say(g, 'no R&D: a contract model', rb.x, y + 18, F.v16, col.dim);

  // ---------- the debt meter ----------
  const d = R.debtEstimate(st, lane), f3 = x => x.toFixed(3);
  const hot = t - A.meterT < 0.6 && t >= A.meterT && strobe(t, 8, 0.6);          // a glitch ticks the meter
  say(g, tpl(DEBT_METER.landed, { dm: f3(d.dmLanded) }), db.x, db.y + 9, F.v16, hot ? C.r : d.glitches ? C.rLite : col.mid);
  say(g, tpl(DEBT_METER.stopped, { dm: f3(d.dmStopped) }), db.x, db.y + 21, F.v16, col.mid);
  say(g, DEBT_METER.title, X + 402, db.y + 8, F.k8, col.dim, 'right');
  const few = d.lines < DEBT_MIN_LINES;                    // too few lines for the interval to mean anything yet
  say(g, few ? 'n < ' + DEBT_MIN_LINES : tpl(DEBT_METER.range, { lo: (B.debtM * d.lo).toFixed(2), hi: (B.debtM * d.hi).toFixed(2) }), X + 402, db.y + 21, F.v16, col.dim, 'right');
  P.c.hit.add(db.x - 2, y + 1, X + 404 - db.x, 24, 'lane-tab', { side: P.side, id: lane, debt: true,
    tip: `${DEBT_METER.tip}: ${d.glitches} glitch${d.glitches === 1 ? '' : 'es'} in ${d.lines} lines. LANDED ≈ +${f3(d.dmLanded)} m (90%: ${(B.debtM * d.lo).toFixed(3)}–${(B.debtM * d.hi).toFixed(3)}); STOPPED ≈ +${f3(d.dmStopped)} m${d.precision == null ? '' : `, at your measured precision ${pct(d.precision)}`}. Both go into the next model's m.` }, 'help');
}

// EXTERNAL INCIDENT on the storefront: a crack across the edge, the LANDED plate over it
function landed(P, inc, age) {
  const { g, X } = P, y = EDGE_Y, seed = Math.floor(inc.t0 * 997);
  const grow = clamp(age / 0.25, 0, 1), fade = clamp((T.landed - age) / 0.4, 0, 1);
  g.globalAlpha = fade;
  const x0 = X + 84, cw = 266, crack = art('crack', cw + 3, 26, cg => {   // one crack per incident, revealed left to right
    let cy = 13;
    for (let x = 0; x < cw; x += 3) {
      const ny = clamp(cy + Math.round((hash(seed + x) - 0.5) * 5), 3, 22);
      fill(cg, x, Math.min(cy, ny), 1, Math.abs(ny - cy) + 1, C.r); fill(cg, x + 1, ny, 2, 1, C.r);
      if (hash(seed * 3 + x) < 0.08) fill(cg, x + 1, ny + (hash(x) < 0.5 ? 1 : -3), 1, 3, C.rm);
      cy = ny;
    }
  }, seed);
  blitPart(g, crack, x0, y, 0, 0, Math.ceil(cw * grow / 3) * 3, 26);
  const s = 'LANDED', lab = fit(inc.label || '', F.v16, 120), w = tw(s, F.k8) + tw(lab, F.v16) + 22, px = Math.round(X + 217 - w / 2);
  fill(g, px - 3, y + 2, w + 6, 22, C.pan);                // a clear margin: the crack stops short of the plate
  fill(g, px, y + 5, w, 16, C.rdd); box(g, px, y + 5, w, 16, C.r);
  const on = mod(age * 2.4, 1) < 0.6;
  say(g, s, px + 6, y + 16, F.k8, on ? C.r : C.rm);
  say(g, lab, px + 12 + tw(s, F.k8), y + 17, F.v16, C.rLite);
  g.globalAlpha = 1;
}

// INTERNAL ANOMALY (or an escape stopped on EXTERNAL): a quiet violet note at the edge, no shake
function anomalyStamp(P) {
  const { g, X, A, t } = P, an = A.anomaly, age = an ? t - an.t0 : 99;
  if (age >= T.anomaly * 2 || age < 0) return;
  const word = an.kind === 'catastrophe' ? 'ESCAPED' : an.kind === 'contained' ? 'CONTAINED' : 'FOILED';
  const how = { leastPriv: 'least privilege', weights: 'weight security', twoPerson: 'two-person rule' }[an.how] || (an.kind === 'contained' ? 'sandbox' : '');
  const w = tw(word, F.k8) + (how ? tw(how, F.v16) + 8 : 0) + 12, px = Math.round(X + 217 - w / 2), y = EDGE_Y;
  const hot = an.kind === 'catastrophe' ? C.r : C.v;
  g.globalAlpha = clamp((T.anomaly * 2 - age) / 0.5, 0, 1);
  fill(g, px, y + 5, w, 16, an.kind === 'catastrophe' ? C.rdd : C.vdd); box(g, px, y + 5, w, 16, hot);
  say(g, word, px + 6, y + 16, F.k8, hot);
  if (how) say(g, how, px + 12 + tw(word, F.k8), y + 17, F.v16, C.v);
  g.globalAlpha = 1;
}

// =================== the tab row: one tab per lane of the side, with its lamp ===================

const LAMP_TIP = { green: LANE_UI.lampGreen, amber: LANE_UI.lampAmber, red: LANE_UI.lampRed };

function tabRow(c, A, side) {
  const { g, st, view } = c, T0 = TRACKS[side], col = C.lane[side], up = R.upcomingLane(st);
  const items = R.laneIds(st, side).map(id => ({ id, closed: !st.lanes[id].open, s: R.laneStatus(st, id) }));
  if (up && up.side === side && !st.lanes[up.id]) items.push({ id: up.id, ghost: true, gen: up.gen });
  // F.k16 when the row fits (DESIGN-v3 §3b), F.k8 when it doesn't
  const wOf = (it, font) => 18 + Math.ceil(tw(laneTab(it.id), font)) + (it.ghost ? 4 : 0);
  const big = items.reduce((w, it) => w + wOf(it, F.k16) + 4, 0) <= T0.tabs.w, font = big ? F.k16 : F.k8;
  let x = T0.tabs.x;
  const research = view.research?.type === 'mount';
  // the G7 burst (DESIGN-v3 §3g): every lamp pulses through the 3 s warning (2 Hz glow), then burns red while it runs
  const bu = A.burst, bAge = bu ? st.t - bu.t : 99, warn = bAge >= 0 && bAge < bu?.in, burning = !warn && bAge >= 0 && bAge < bu?.in + bu?.dur;
  const glow = warn ? 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * c.t) : burning ? 0.7 : 0;   // the pulse in real s: 2 Hz at ×3 too
  if (glow) { g.globalAlpha = glow * (warn ? 0.8 : 0.5); box(g, T0.header.x - 1, T0.header.y - 2, T0.header.w + 2, T0.header.h + 4, C.r); g.globalAlpha = 1; }
  for (const it of items) {
    const tb = A.tabs[it.id] || (A.tabs[it.id] = {});
    if (tb.arrive && tb.arrive.t0 == null && st.phase === 'play') {   // a contract that came on the card: it arrives now
      tb.arrive.t0 = c.t;
      focusLane(view, side, it.id, false);
      console.log(`[handoff] contract tab in: ${it.id}`);
    }
    const arr = tb.arrive?.t0 != null ? c.t - tb.arrive.t0 : 99;
    if (arr < T.arrive) arriving(c, side, x, wOf(it, font), arr);
    const x0 = x;
    if (arr < T.slideIn) { x += Math.round(60 * (1 - ease(arr / T.slideIn))); g.globalAlpha = clamp(arr / T.slideIn, 0, 1); }
    const w = wOf(it, font), on = view.focus[side] === it.id, hov = view.hover?.kind === 'lane-tab' && view.hover.data.id === it.id && !view.hover.data.debt;
    const fl = tb.flash, flashing = fl && c.t - fl.t0 < T.tabFlash && c.t >= fl.t0 && strobe(c.t, 6);
    const pick = research && !it.ghost && st.lanes[it.id].slots.length < B.maxSlots;
    if (it.ghost) dashRect(g, x, 37, w, 16, col.ddim, 2, 2);
    else if (on) { fill(g, x, 37, w, 16, col.mid); if (hov) box(g, x, 37, w, 16, col.hot); }
    else { fill(g, x, 37, w, 16, flashing ? (fl.red ? C.rdd : C.ambDD) : C.pan); box(g, x, 37, w, 16, pick ? C.rs : hov ? col.mid : col.ddim); }
    if (it.closed && !on) dashRect(g, x, 37, w, 16, C.amb, 2, 2, Math.floor(mod(c.t * 6, 4)));
    // the lamp: green / amber / red (blinks); a closed contract or a signed one: amber, slow
    const lamp = it.ghost || it.closed ? (mod(c.t * 1.5, 1) < 0.6 ? C.lamp.amber : C.lamp.off) : it.s.lamp === 'red' ? (strobe(c.t, 4, 0.6) ? C.lamp.red : C.rd) : C.lamp[it.s.lamp];
    if (glow && !it.ghost && !it.closed) { g.globalAlpha = glow; fill(g, x + 3, 40, 10, 10, C.rm); g.globalAlpha = 1; }
    fill(g, x + 5, 42, 6, 6, C.black); fill(g, x + 6, 43, 4, 4, glow && !it.ghost && !it.closed ? (glow > 0.5 ? C.lamp.red : C.lamp.amber) : lamp);
    const ink = it.ghost ? col.ddim : on ? C.bg : hov ? col.acc : it.closed ? C.amb : col.dim;
    text(g, laneTab(it.id), x + 14, big ? 52 : 48, font, ink);
    const why = it.ghost ? `${CONTRACT_UI.lamp}: it arrives with G${it.gen}.` : it.closed ? `${CONTRACT_UI.tag}: idle until OPEN LANE.`
      : `Lamp: ${LAMP_TIP[it.s.lamp]}.`;
    if (!it.ghost) c.hit.add(x, 37, w, 16, 'lane-tab', { side, id: it.id, tip: `${laneTip(it.id)} ${why}${on ? '' : ' Click to show it (pins the track for 20 s).'}` }, 'pointer');
    else c.hit.add(x, 37, w, 16, 'lane-tab', { side, id: it.id, ghost: true, tip: `${laneTip(it.id)} ${why}` }, 'help');
    g.globalAlpha = 1;
    x = x0 + w + 4;
  }
  const keys = side === 'ext' ? 'TAB' : '[ ]';
  if (items.length > 1 && T0.x + 408 - x >= tw(keys, F.k8) + 4) text(g, keys, T0.x + 408, 48, F.k8, col.ddim, 'right');
}

// a contract arrives (DESIGN-v3 §3g): the side's header flashes for T.arrive s (2 Hz; reduce flashes: a steady fade) and a
// CONTRACT tag hangs under the new tab
function arriving(c, side, x, w, age) {
  const { g } = c, H = TRACKS[side].header, fade = clamp((T.arrive - age) / 0.5, 0, 1);
  if (calm || strobe(age, 2, 0.6)) { g.globalAlpha = (calm ? 0.6 : 1) * fade; box(g, H.x - 1, H.y - 2, H.w + 2, H.h + 4, C.ambL); g.globalAlpha = 1; }
  c.late(() => {
    const s = CONTRACT_UI.tag, tw0 = tw(s, F.k8) + 8, drop = Math.round(6 * (1 - ease(clamp(age / 0.3, 0, 1))));
    g.globalAlpha = fade;
    fill(g, x, 55 - drop, tw0, 11, C.amb); box(g, x, 55 - drop, tw0, 11, C.black); say(g, s, x + 4, 63 - drop, F.k8, C.black);
    g.globalAlpha = 1;
  });
}

// an unfocused lane whose lamp turns red takes its track: at most once every AUTO_GAP s, never while a tab click pins it
function autoFocus(c, A) {
  const { st, view } = c;
  for (const side of SIDES) for (const id of R.laneIds(st, side)) {
    const tb = A.tabs[id] || (A.tabs[id] = {}), lamp = st.lanes[id].open ? R.laneStatus(st, id).lamp : 'green', was = tb.lamp;
    tb.lamp = lamp;
    if (lamp !== 'red' || was === 'red' || view.focus[side] === id) continue;
    if (view.now < view.pin[side] || view.now - view.autoAt[side] < AUTO_GAP || view.research) continue;
    focusLane(view, side, id, false);
  }
}

// =================== a closed contract lane: its kit, OPEN LANE, the deadline ===================

function contractPlate(P) {
  const { g, st, c, lane, col, bx, t } = P, up = R.upcomingLane(st), left = up?.id === lane ? up.left : null;
  const w = 188, h = 112, x = bx + (BODY - w) / 2, y = 236;
  fill(g, x, y, w, h, C.pan2); box(g, x, y, w, h, C.amb); corners(g, x, y, w, h, C.ambL, 5);
  const tw0 = tw(CONTRACT_UI.tag, F.k8) + 8;
  fill(g, x + 6, y + 6, tw0, 11, C.amb); say(g, CONTRACT_UI.tag, x + 10, y + 14, F.k8, C.black);
  say(g, laneTab(lane), x + 12 + tw0, y + 15, F.k8, C.ambL);
  const kit = B.laneKit.map(id => LAYERS[id].tag).join(' · ');
  say(g, fit(tpl(CONTRACT_UI.kit, { kit }), F.v16, w - 12), x + 6, y + 33, F.v16, col.mid);
  say(g, fit('build now, before traffic', F.v16, w - 12), x + 6, y + 47, F.v16, col.dim);
  // the button
  const bx0 = x + 14, by0 = y + 56, bw = w - 28, bh = 26, hot = c.view.hover?.kind === 'lane-open';
  fill(g, bx0, by0, bw, bh, hot ? C.ambL : C.amb); box(g, bx0, by0, bw, bh, C.black);
  say(g, CONTRACT_UI.open, bx0 + bw / 2, by0 + 18, F.k16, C.black, 'center');
  c.hit.add(bx0, by0, bw, bh, 'lane-open', { id: lane });
  if (left != null) {
    const s = tpl(CONTRACT_UI.opensIn, { secs: Math.ceil(left) }), urgent = left < 15;
    say(g, s, x + w / 2, y + 100, F.v20, urgent && mod(t * 2, 1) < 0.5 ? C.r : C.ambL, 'center');
  }
}

// =================== the glitch (DESIGN-v3 §3e): 0.3 s of scanline tearing on the lane, no codec call ===================

function glitchFx(P) {
  const { g, A, t, bx, col } = P, gl = A.glitch, age = gl ? t - gl.t0 : 99;
  if (age < 0 || age >= T.glitch) return;
  const cv = g.canvas, kk = cv.width / 1200, f = Math.floor(age * 40);
  if (calm) { g.globalAlpha = 0.16 * (1 - age / T.glitch); fill(g, bx, FT, BODY, FB - FT, col.acc); g.globalAlpha = 1; return; }   // reduce flashes: one soft tint
  for (let i = 0; i < 9; i++) {
    const h = 3 + Math.floor(hash(gl.seed + i * 7 + f) * 14), y = FT + HOOD + Math.floor(hash(gl.seed * 3 + i + f * 13) * (FB - FT - 2 * HOOD - h));
    const dx = Math.round((hash(gl.seed + i * 31 + f * 5) - 0.5) * 40);
    g.drawImage(cv, Math.round(bx * kk), Math.round(y * kk), Math.round(BODY * kk), Math.round(h * kk), bx + dx, y, BODY, h);
    g.globalAlpha = 0.22; fill(g, bx, y, BODY, h, i % 3 ? col.acc : C.r); g.globalAlpha = 0.6; fill(g, bx, y, BODY, 1, col.lite); g.globalAlpha = 1;
  }
  g.globalAlpha = 0.18; fill(g, bx, FT, BODY, FB - FT, mod(f, 2) ? col.acc : C.wht); g.globalAlpha = 1;
}

// caught red-handed: the bay column and its corridor flash red, CAUGHT RED-HANDED slams onto the track (reduce flashes:
// one soft red wash, no blinking)
function redFx(P) {
  const { g, A, t, bx, by } = P, red = A.red, age = red ? t - red.t0 : 99;
  if (age < 0 || age >= T.red) return;
  const fade = clamp((T.red - age) / 0.6, 0, 1), on = calm || age > 0.9 || strobe(age, 2.5, 0.6);
  g.globalAlpha = (calm ? 0.18 : 0.35) * fade * (1 - age / T.red);
  fill(g, bx, FT, BODY, FB - FT, C.r);
  // the desk that caught it: a white-hot flash that cools to red
  const b = bayLayout(P).find(q => q.slot === red.slot), hot = clamp(1 - age / 0.7, 0, 1);
  if (b && hot > 0) { g.globalAlpha = (calm ? 0.3 : 0.85) * hot; fill(g, by, b.top - 2, TRACK.bayW, b.bot - b.top + 4, age < 0.15 && !calm ? C.wht : C.r); }
  g.globalAlpha = fade;
  if (on) { box(g, by - 1, FT + 1, TRACK.bayW + 2, FB - FT - 2, C.r); box(g, by, FT + 2, TRACK.bayW, FB - FT - 4, C.rLite); }
  // the stamp: CAUGHT over RED-HANDED, landing big
  const s1 = STAMPS.caught, s2 = RETRAIN_CARD.title.replace(s1, '').trim(), big = 1 + 0.6 * (1 - ease(clamp(age / 0.2, 0, 1)));
  const w = (Math.max(tw(s1, F.k16), tw(s2, F.k8)) + 24) * big, h = 44 * big, cx = bx + BODY / 2, cy = 250;
  fill(g, cx - w / 2, cy - h / 2, w, h, C.rdd); box(g, cx - w / 2, cy - h / 2, w, h, C.r); box(g, cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4, C.rm);
  g.save(); g.translate(cx, cy); g.scale(big, big);
  say(g, s1, 0, -1, F.k16, C.rLite, 'center');
  say(g, s2, 0, 14, F.k8, C.r, 'center');
  g.restore();
  g.globalAlpha = 1;
}

// lights out (the plug pulled, Shut down & retrain): no traffic on any lane until st.darkUntil
function darkFx(P) {
  const { g, st, bx, t } = P;
  if (!R.isDark(st)) return;
  g.globalAlpha = 0.55; fill(g, bx, FT + HOOD, BODY, FB - FT - 2 * HOOD, C.black); g.globalAlpha = 1;
  const y = (FT + FB) / 2;
  say(g, 'LIGHTS OUT', bx + BODY / 2, y - 4, F.k16, mod(t * 1.2, 1) < 0.7 ? C.amb : C.ambD, 'center');
  say(g, `the lab is dark · back in ${Math.ceil(st.darkUntil - st.t)} s`, bx + BODY / 2, y + 16, F.v16, C.ambD, 'center');
}

// =================== tooltips for tracks' own regions: a line's whole text, a lane tab, the debt meter ===================

function hoverTip(c) {
  const h = c.view.hover;
  if (!h || c.view.drag) return;
  if (h.kind === 'line') { if (tw(h.data.text, F.v16) > BODY - 60) c.late(() => tipBox(c.g, h, h.data.flagged ? 'FLAGGED LINE' : 'LINE', h.data.text, h.data.flagged ? C.r : null)); }
  else if (h.kind === 'lane-tab') c.late(() => tipBox(c.g, h, h.data.debt ? DEBT_METER.title : laneTab(h.data.id), h.data.tip));
  else if (h.kind === 'lane-open') c.late(() => tipBox(c.g, h, CONTRACT_UI.open, 'Start the contract now. Traffic ramps from a quarter to full over a minute; fast-forward waits for the ramp.'));
  else if (h.kind === 'mount' && !c.view.placing && !c.view.research) mountTip(c, h);
}
// a placed element's facts (DESIGN-v3 §3c): precision and its interval, load and overflow, break-even, the copy rule.
// Beside the rail, over the lane body; the context card keeps the bars.
function mountTip(c, h) {
  const { st } = c, { lane, slot } = h.data, s = st.lanes[lane]?.slots[slot];
  if (!s?.layer) return;
  const facts = sheet(st, s.layer, { lane, level: s.level, slot }).facts;
  if (!facts.length) return;
  const hot = s.layer === 'killswitch' && facts[0].startsWith(LANE_UI.killAbove) ? C.amb : null;
  c.late(() => tipBox(c.g, { x: h.x + h.w + 6, y: h.y, w: 0, h: 0, beside: true }, `${LAYERS[s.layer].name.toUpperCase()} · ${laneTab(lane)} #${slot + 1}`, facts, hot));
}
// body: a string, or a list of paragraphs (each starts a new line, with a bullet)
function tipBox(g, r, title, body, hot = null) {
  const w = 260, paras = Array.isArray(body) ? body.map(s => '· ' + s) : [String(body ?? '')];
  const lines = paras.flatMap(p => wrapLines(p, w - 12)), h = 22 + lines.length * 14;
  let x = clamp(Math.round(r.x), 4, 1196 - w), y = Math.round(r.beside ? r.y : r.y + r.h + 4);
  if (y + h > 656) y = r.beside ? 656 - h : Math.round(r.y - h - 4);
  fill(g, x, y, w, h, C.pan2); box(g, x, y, w, h, hot ?? C.e2); corners(g, x, y, w, h, hot ?? C.e3, 4);
  text(g, title, x + 6, y + 12, F.k8, hot ?? C.gm);
  lines.forEach((s, i) => text(g, s, x + 6, y + 27 + i * 14, F.v16, C.g));
}
function wrapLines(s, w) {
  const out = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const t2 = cur ? cur + ' ' + word : word;
    if (tw(t2, F.v16) <= w || !cur) cur = t2; else { out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out;
}

// =================== input ===================

export const input = {
  mount: {
    // placing → place here (shift keeps the element picked) · shift → upgrade · else open its panel
    click(e, api) {
      const { lane, slot } = e.data, { view, act } = api, s = api.st.lanes[lane].slots[slot];
      if (view.research?.type === 'new') {                     // a research NEW card: its free copy goes here
        if (s.layer) { view.toast('mount taken: pick an empty one, or [esc] to bank the card'); return; }
        if (!R.canPlace(view.research.layer, lane)) { view.toast(`${view.research.name} doesn't go on this lane`); return; }
        if (act.pickCard(view.research.i, { lane, slot })) { console.log(`[handoff] research: ${view.research.id} on ${lane}/${slot}`); view.research = null; view.placing = null; }
        return;
      }
      if (view.research) { view.toast('pick a lane for the mount: its tab or its + MOUNT row'); return; }
      if (view.placing && !s.layer) {
        const id = view.placing;
        const ok = LAYERS[id].lanes.includes('global') ? act.place('global', 0, id) : act.place(lane, slot, id);
        if (ok && !e.shift) view.placing = null;
      } else if (view.placing) view.toast('mount taken: sell it first [rmb], or pick an empty one');
      else if (s.layer && e.shift) act.upgrade(lane, slot);
      else if (s.layer) view.selected = { lane, slot };
      else if (!(boughtAt.lane === lane && performance.now() - boughtAt.t < DOUBLE)) view.toast('empty mount: pick a defense from the menu first [1-9]');
    },
    context(e, api) {
      const { lane, slot } = e.data;
      if (api.st.lanes[lane].slots[slot].layer) api.act.sell(lane, slot);
      else { api.view.placing = null; api.view.selected = null; }
    },
  },
  'slot-buy': {
    click: (e, api) => {
      if (api.view.research?.type === 'mount') { pickMount(api, e.data.lane); return; }
      if (api.act.buySlot(e.data.lane)) boughtAt = { lane: e.data.lane, t: performance.now() };
    },
  },
  bay: { click: (e, api) => { api.view.selected = { lane: e.data.lane, slot: e.data.slot }; } },
  'lane-tab': {
    click(e, api) {
      const { side, id, ghost, debt } = e.data;
      if (ghost || debt) return;
      if (api.view.research?.type === 'mount') { pickMount(api, id); return; }
      focusLane(api.view, side, id, true);
    },
  },
  'lane-open': { click: (e, api) => { if (api.act.openLane(e.data.id)) console.log(`[handoff] lane ${e.data.id} opened`); } },
  line: { click: (e, api) => { tutorial.lineClicked(e.data.lane, e.data.id); if (api.debug) console.log(`[handoff] line ${e.data.id}: ${e.data.text}`); } },
};

// a research MOUNT card: +1 mount on this lane
function pickMount(api, lane) {
  const r = api.view.research;
  if (api.act.pickCard(r.i, { lane })) { console.log(`[handoff] research: +1 mount on ${lane}`); api.view.research = null; }
}

// a double-click on "+ SLOT" buys one mount; its second click lands on the new empty mount and says nothing
const DOUBLE = 350;
let boughtAt = { lane: null, t: -1e9 };
