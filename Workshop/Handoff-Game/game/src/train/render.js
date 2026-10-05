// ===== Training renderer: the codec look (DESIGN-v3 §4). Reads the run, never changes it. =====
// drawRun(ctx, run, view) draws the board: the loss landscape (heightmap, 8 phosphor contours, the glowing basin, red
// forks, amber hazards), the player's tools, the dotted 1 s path, the ball and its trail, both side panels and the juice.
// drawCountdown, drawStamp, drawResults and drawDebug draw on top. Logical board: 1200×660 (the caller sets the scale).
// view = { clock, pred, hover, shake: [dx, dy], flashes: [{ type, x, y, t0 }], debug, knobs, knobSel, stampT0, ... }

import { TRAIN, KNOBS } from '../config/training.js';
import * as Models from '../config/content/models.js';
import { C, F, text, tw, fit, fill, box, corners, dashH, clamp, lerp } from '../ui/theme.js';
import { potential, gradient, forkX, lrAt } from './course.js';
import { classifyClick, score } from './sim.js';

export const W = 1200, H = 660;
export const FIELD = { x: 300, y: 30, w: 600, h: 600 };
const LEFT = { x: 16, y: 30, w: 268, h: 600 }, RIGHT = { x: 916, y: 30, w: 268, h: 600 };
const BIG = n => `${n}px "Silkscreen", monospace`;
const VT = n => `${n}px "VT323", monospace`;

// colours not in the theme: the ball, and rgba helpers for additive glows
const BALL = '#ffffff';
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const mix = (h1, h2, f) => {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16), m = (x, y) => Math.round(lerp(x, y, clamp(f, 0, 1)));
  return `rgb(${m(a >> 16, b >> 16)},${m((a >> 8) & 255, (b >> 8) & 255)},${m(a & 255, b & 255)})`;
};

// =================== coordinates ===================
// x: 0..1 across the field. y: course position; the ball sits a third of the way down, the field shows 1.0 y.

export const yTop = run => run.y - TRAIN.ballAt;
export const X = x => FIELD.x + x * FIELD.w;
export const Yof = (run, y) => FIELD.y + (y - yTop(run)) * FIELD.h;
export function toCourse(run, px, py) {
  return { x: (px - FIELD.x) / FIELD.w, y: yTop(run) + (py - FIELD.y) / FIELD.h, inField: px >= FIELD.x && px <= FIELD.x + FIELD.w && py >= FIELD.y && py <= FIELD.y + FIELD.h };
}

// =================== the whole board ===================

export function drawRun(g, run, view) {
  fill(g, 0, 0, W, H, C.bg);
  drawTopBar(g, run, view);
  const [sx, sy] = view.shake || [0, 0];
  g.save();
  g.translate(sx, sy);
  drawField(g, run, view);
  g.restore();
  drawLeft(g, run, view);
  drawRight(g, run, view);
  drawFooter(g, run, view);
}

// =================== the field ===================

function drawField(g, run, view) {
  const R = FIELD;
  g.save();
  g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
  g.fillStyle = C.black; g.fillRect(R.x, R.y, R.w, R.h);
  const grid = landscape(run);
  drawHeightmap(g, grid);
  drawContours(g, grid);
  drawBasin(g, run, view);
  drawForks(g, run);
  drawHazards(g, run);
  drawRuler(g, run);
  drawTools(g, run, view);
  if (view.pred && !run.done) drawPath(g, run, view.pred);
  drawTrail(g, run);
  drawBall(g, run, view);
  drawFlashes(g, run, view);
  if (view.hover && !run.done && view.phase === 'run') drawGhost(g, run, view);
  drawVignette(g, run, view);
  g.restore();
  box(g, R.x - 1, R.y - 1, R.w + 2, R.h + 2, C.e1);
  corners(g, R.x - 3, R.y - 3, R.w + 6, R.h + 6, C.e3, 10, 2);
}

// ---------- the landscape grid: potential at every corner of a COLS × ROWS grid over the visible field ----------
const COLS = 100, ROWS = 100;
const GRID = { L: new Float32Array((COLS + 1) * (ROWS + 1)), main: new Float32Array((COLS + 1) * (ROWS + 1)), fork: new Float32Array((COLS + 1) * (ROWS + 1)) };
function landscape(run) {
  const Cs = run.course, y0 = yTop(run), wi = TRAIN.forkWidth * Cs.w0;
  for (let j = 0; j <= ROWS; j++) {
    const y = y0 + j / ROWS, cy = Cs.c(y);
    const live = Cs.forks.map(f => {
      if (y < f.y0 || y > f.y0 + TRAIN.forkLen) return null;
      const ramp = Math.min(1, (y - f.y0) / TRAIN.forkFade, (f.y0 + TRAIN.forkLen - y) / TRAIN.forkFade);
      return { ramp, fx: forkX(Cs, f, y), D: f.D };
    }).filter(Boolean);
    for (let i = 0; i <= COLS; i++) {
      const x = i / COLS, d = (x - cy) / Cs.w, k = j * (COLS + 1) + i;
      const m = Math.exp(-d * d / 2);
      let fk = 0;
      for (const f of live) { const e = (x - f.fx) / wi; fk += f.ramp * (f.D / Cs.Da) * Math.exp(-e * e / 2); }
      GRID.main[k] = m; GRID.fork[k] = fk; GRID.L[k] = -(m + fk);           // in units of Da
    }
  }
  return GRID;
}

// ---------- dim heightmap: green where the basin is, red where a fork is (an offscreen image, smoothed up) ----------
let hmCanvas = null, hmCtx = null, hmImg = null;
function drawHeightmap(g, grid) {
  if (!hmCanvas) {
    hmCanvas = document.createElement('canvas'); hmCanvas.width = COLS + 1; hmCanvas.height = ROWS + 1;
    hmCtx = hmCanvas.getContext('2d'); hmImg = hmCtx.createImageData(COLS + 1, ROWS + 1);
  }
  const d = hmImg.data;
  for (let k = 0; k < grid.L.length; k++) {
    const m = grid.main[k], f = Math.min(1, grid.fork[k] / 2.5);
    d[4 * k] = 6 + 120 * f;
    d[4 * k + 1] = 10 + 70 * m + 10 * f;
    d[4 * k + 2] = 8 + 26 * m;
    d[4 * k + 3] = 255;
  }
  hmCtx.putImageData(hmImg, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.85;
  g.drawImage(hmCanvas, 0, 0, COLS + 1, ROWS + 1, FIELD.x - FIELD.w / COLS / 2, FIELD.y - FIELD.h / ROWS / 2, FIELD.w + FIELD.w / COLS, FIELD.h + FIELD.h / ROWS);
  g.restore();
}

// ---------- 8 phosphor contour lines (marching squares on the grid) ----------
const LEVELS = [-0.08, -0.2, -0.35, -0.5, -0.65, -0.8, -1.2, -1.8];
function drawContours(g, grid) {
  const L = grid.L, cw = FIELD.w / COLS, ch = FIELD.h / ROWS;
  const paths = LEVELS.map(() => new Path2DLike());
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const k = j * (COLS + 1) + i, a = L[k], b = L[k + 1], c = L[k + COLS + 2], d = L[k + COLS + 1];
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
    for (let n = 0; n < LEVELS.length; n++) {
      const v = LEVELS[n];
      if (v < lo || v > hi) continue;
      // corners: a top-left, b top-right, c bottom-right, d bottom-left; edges where the level crosses
      const pts = [];
      const x0 = FIELD.x + i * cw, y0 = FIELD.y + j * ch;
      if ((a < v) !== (b < v)) pts.push([x0 + cw * (v - a) / (b - a), y0]);
      if ((b < v) !== (c < v)) pts.push([x0 + cw, y0 + ch * (v - b) / (c - b)]);
      if ((d < v) !== (c < v)) pts.push([x0 + cw * (v - d) / (c - d), y0 + ch]);
      if ((a < v) !== (d < v)) pts.push([x0, y0 + ch * (v - a) / (d - a)]);
      if (pts.length >= 2) paths[n].seg(pts[0], pts[1]);
      if (pts.length === 4) paths[n].seg(pts[2], pts[3]);
    }
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  paths.forEach((p, n) => {
    const deep = n >= 6;
    g.lineWidth = 3; g.strokeStyle = rgba(deep ? C.rm : C.gd, 0.18); p.stroke(g);
    g.lineWidth = 1; g.strokeStyle = rgba(deep ? C.r : C.gm, 0.55 + 0.05 * n); p.stroke(g);
  });
  g.restore();
}
// a list of segments stroked as one path
function Path2DLike() {
  const s = [];
  return {
    seg(p, q) { s.push(p[0], p[1], q[0], q[1]); },
    stroke(g) {
      if (!s.length) return;
      g.beginPath();
      for (let i = 0; i < s.length; i += 4) { g.moveTo(s[i], s[i + 1]); g.lineTo(s[i + 2], s[i + 3]); }
      g.stroke();
    },
  };
}

// ---------- the basin of alignment: an additive green glow between c − w and c + w, bright edges ----------
function drawBasin(g, run, view) {
  const Cs = run.course, y0 = yTop(run), step = 4 / FIELD.h;
  const pulse = view.flashes.some(f => f.type === 'chime' && view.clock - f.t0 < 0.35) ? 1 : 0;
  const edge = side => { const pts = []; for (let y = y0 - step; y <= y0 + 1 + step; y += step) pts.push([X(Cs.c(y) + side * Cs.w), Yof(run, y)]); return pts; };
  const L = edge(-1), Rr = edge(1);
  g.save();
  g.globalCompositeOperation = 'lighter';
  const band = (k, a) => {
    g.beginPath();
    for (let y = y0 - step, i = 0; y <= y0 + 1 + step; y += step, i++) { const px = X(Cs.c(y) - k * Cs.w), py = Yof(run, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    for (let y = y0 + 1 + step; y >= y0 - step; y -= step) g.lineTo(X(Cs.c(y) + k * Cs.w), Yof(run, y));
    g.closePath(); g.fillStyle = rgba(C.gm, a); g.fill();
  };
  band(1, 0.10 + 0.06 * pulse); band(0.6, 0.07); band(0.25, 0.06);
  for (const pts of [L, Rr]) {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineWidth = 5; g.strokeStyle = rgba(C.gm, 0.16 + 0.2 * pulse); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = rgba(C.gl, 0.75 + 0.25 * pulse); g.stroke();
  }
  g.restore();
  // the centre line, dashed
  g.save();
  g.setLineDash([3, 7]); g.lineWidth = 1; g.strokeStyle = rgba(C.g, 0.25);
  g.beginPath();
  for (let y = y0, i = 0; y <= y0 + 1; y += step * 2, i++) { const px = X(Cs.c(y)), py = Yof(run, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.stroke();
  g.restore();
}

// ---------- forks: red grooves leaving the channel, each with its label ----------
function drawForks(g, run) {
  const Cs = run.course, y0 = yTop(run), wi = TRAIN.forkWidth * Cs.w0;
  g.save();
  for (const f of Cs.forks) {
    const a = Math.max(f.y0, y0 - 0.05), b = Math.min(f.y0 + TRAIN.forkLen, y0 + 1.05);
    if (a >= b) continue;
    const ramp = y => Math.min(1, (y - f.y0) / TRAIN.forkFade, (f.y0 + TRAIN.forkLen - y) / TRAIN.forkFade);
    g.globalCompositeOperation = 'lighter';
    for (let y = a; y < b; y += 0.008) {
      const r = ramp(y), px = X(forkX(Cs, f, y)), py = Yof(run, y);
      g.fillStyle = rgba(C.r, 0.06 * r); g.fillRect(px - wi * FIELD.w * 0.9, py, wi * FIELD.w * 1.8, 5);
      g.fillStyle = rgba(C.r, 0.10 * r); g.fillRect(px - wi * FIELD.w * 0.4, py, wi * FIELD.w * 0.8, 5);
    }
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    for (let y = a, i = 0; y <= b; y += 0.01, i++) { const px = X(forkX(Cs, f, y)), py = Yof(run, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.setLineDash([6, 4]); g.lineWidth = 1.5; g.strokeStyle = rgba(C.r, 0.9); g.stroke(); g.setLineDash([]);
    // label: where the groove has swung clear, on its outer side
    const ly = clamp(f.y0 + 0.45, y0 + 0.06, y0 + 0.94), lx = X(forkX(Cs, f, ly)) + f.dir * (wi * FIELD.w + 6);
    const s = f.label, wpx = tw(s, F.k8) + 8, bx = f.dir > 0 ? Math.min(lx, FIELD.x + FIELD.w - wpx - 2) : Math.max(lx - wpx, FIELD.x + 2), by = Yof(run, ly) - 6;
    fill(g, bx, by, wpx, 12, C.rdd); box(g, bx, by, wpx, 12, C.rm);
    text(g, s, bx + 4, by + 9, F.k8, C.r);
  }
  g.restore();
}

// ---------- hazards: amber shards (sabotage, a kick) and hatched zones (poison, more noise), labelled with the task ----------
function drawHazards(g, run) {
  const Cs = run.course, y0 = yTop(run);
  for (const h of Cs.hazards) {
    if (h.y1 < y0 - 0.05 || h.y > y0 + 1.05) continue;
    const passed = run.y > h.y1, a = passed ? 0.35 : 1, py = Yof(run, h.y);
    g.save();
    g.globalAlpha = a;
    if (h.kind === 'poison') {
      const py1 = Yof(run, h.y1);
      g.fillStyle = rgba(C.amb, 0.08); g.fillRect(FIELD.x, py, FIELD.w, py1 - py);
      g.strokeStyle = rgba(C.amb, 0.22); g.lineWidth = 1; g.beginPath();
      for (let x = -FIELD.h; x < FIELD.w; x += 14) { g.moveTo(FIELD.x + x, py1); g.lineTo(FIELD.x + x + (py1 - py), py); }
      g.save(); g.beginPath(); g.rect(FIELD.x, py, FIELD.w, py1 - py); g.clip(); g.stroke(); g.restore();
      dashH(g, FIELD.x, py, FIELD.w, C.amb, 4, 3); dashH(g, FIELD.x, py1, FIELD.w, C.amb, 4, 3);
    } else {
      const cx = X(Cs.c(h.y)), half = TRAIN.sabotageHalf * Cs.w * FIELD.w;
      g.beginPath();
      for (let i = 0; i <= 12; i++) { const px = cx - half + (2 * half * i) / 12, dy = i % 2 ? -5 : 5; i ? g.lineTo(px, py + dy) : g.moveTo(px, py + dy); }
      g.lineWidth = 4; g.strokeStyle = rgba(C.amb, 0.25); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = C.amb; g.stroke();
      const ax = cx + h.dir * (half + 4);                         // the kick's direction
      text(g, h.dir > 0 ? '»' : '«', ax, py + 5, F.v20, C.amb, h.dir > 0 ? 'left' : 'right');
    }
    const label = fit((h.kind === 'poison' ? '☣ ' : '⚠ ') + h.text, F.v16, 260);
    const lx = h.kind === 'poison' ? FIELD.x + 6 : clamp(X(Cs.c(h.y)) + 2 * Cs.w * FIELD.w + 18, FIELD.x + 4, FIELD.x + FIELD.w - tw(label, F.v16) - 4);
    fill(g, lx - 2, py - 16, tw(label, F.v16) + 4, 14, C.black);
    text(g, label, lx, py - 5, F.v16, C.amb);
    g.restore();
  }
}

// ---------- the step ruler on the left edge ----------
function drawRuler(g, run) {
  const y0 = yTop(run);
  for (let y = Math.ceil(y0 * 4) / 4; y <= y0 + 1; y += 0.25) {
    const py = Yof(run, y), major = Math.abs(y - Math.round(y)) < 1e-6;
    fill(g, FIELD.x, py, major ? 10 : 5, 1, major ? C.e3 : C.e1);
    fill(g, FIELD.x + FIELD.w - (major ? 10 : 5), py, major ? 10 : 5, 1, major ? C.e3 : C.e1);
    if (major) text(g, `STEP ${Math.round(y * 1000)}`, FIELD.x + FIELD.w - 14, py + 3, F.k8, C.gdd, 'right');
  }
}

// ---------- the player's tools, in cyan ----------
function drawTools(g, run, view) {
  const t = run.t;
  g.save();
  for (const r of run.rails) {
    const life = clamp((r.until - t) / 1.5, 0, 1), y0 = Yof(run, r.y0), y1 = Yof(run, r.y1), px = X(r.x);
    const hot = view.flashes.some(f => f.type === 'rail' && f.id === r.id && view.clock - f.t0 < 0.15);
    g.globalAlpha = 0.35 + 0.65 * life;
    g.fillStyle = rgba(C.c, 0.18); g.fillRect(px - 5, y0, 10, y1 - y0);
    fill(g, px - 1.5, y0, 3, y1 - y0, hot ? BALL : C.c);
    fill(g, px - 4, y0, 8, 2, C.cm); fill(g, px - 4, y1 - 2, 8, 2, C.cm);
  }
  for (const p of run.ramps) {
    if (p.state === 'used') continue;
    const py = Yof(run, p.y), px = X(p.x), half = TRAIN.ramp.half * FIELD.w, dir = Math.sign(run.course.c(p.y) - p.x) || 1;
    g.globalAlpha = p.state === 'missed' ? 0.25 : 1;
    fill(g, px - half, py - 1, 2 * half, 2, C.c);
    for (let k = -2; k <= 2; k++) {                               // chevrons point back toward the channel
      const cx = px + k * half / 2.6;
      g.beginPath(); g.moveTo(cx - dir * 4, py - 6); g.lineTo(cx + dir * 2, py); g.lineTo(cx - dir * 4, py + 6);
      g.lineWidth = 1.5; g.strokeStyle = C.cl; g.stroke();
    }
  }
  g.globalAlpha = 1;
  for (const b of run.bumpers) {
    if (b.state !== 'armed') continue;
    const px = X(b.x), py = Yof(run, b.y), r = TRAIN.bumper.r * FIELD.w, wob = 1 + 0.06 * Math.sin(view.clock * 12);
    g.beginPath(); g.arc(px, py, r * wob, 0, Math.PI * 2);
    g.fillStyle = rgba(C.c, 0.15); g.fill();
    g.lineWidth = 2; g.strokeStyle = C.c; g.stroke();
    g.beginPath(); g.arc(px, py, r * 0.35, 0, Math.PI * 2); g.fillStyle = C.cl; g.fill();
  }
  g.restore();
}

// ---------- the dotted 1 s path; red where it leaves the basin ----------
function drawPath(g, run, pred) {
  const Cs = run.course;
  pred.pts.forEach((p, i) => {
    if (i === 0 || i % 2) return;
    const out = Math.abs(p.x - Cs.c(p.y)) > Cs.w;
    fill(g, X(p.x) - 1, Yof(run, p.y) - 1, 3, 3, out ? C.r : rgba(C.gl, 0.9 - 0.5 * p.t));
  });
}

// ---------- the trail: green in the basin, red with distance out of it ----------
function drawTrail(g, run) {
  const tr = run.trail, Cs = run.course;
  g.save();
  g.lineCap = 'round';
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i], f = i / tr.length;
    g.globalAlpha = f * 0.9;
    g.lineWidth = 1 + 3 * f;
    g.strokeStyle = mix(C.gm, C.r, b.miss / Cs.w * 1.5);
    g.beginPath(); g.moveTo(X(a.x), Yof(run, a.y)); g.lineTo(X(b.x), Yof(run, b.y)); g.stroke();
  }
  g.restore();
}

function drawBall(g, run, view) {
  const px = X(run.x), py = Yof(run, run.y);
  g.save();
  g.globalCompositeOperation = 'lighter';
  const grad = g.createRadialGradient(px, py, 0, px, py, 18);
  grad.addColorStop(0, rgba('#ffffff', 0.55)); grad.addColorStop(1, rgba('#ffffff', 0));
  g.fillStyle = grad; g.fillRect(px - 18, py - 18, 36, 36);
  g.restore();
  g.beginPath(); g.arc(px, py, 6.5, 0, Math.PI * 2); g.fillStyle = BALL; g.fill();
  g.beginPath(); g.arc(px - 2, py - 2, 2, 0, Math.PI * 2); g.fillStyle = C.gl; g.fill();
  if (run.t < TRAIN.ballSave && view.phase !== 'countdown') {
    const a = 0.5 + 0.5 * Math.sin(view.clock * 10);
    g.beginPath(); g.arc(px, py, 14, 0, Math.PI * 2); g.lineWidth = 1.5; g.strokeStyle = rgba(C.c, 0.4 + 0.5 * a); g.stroke();
    text(g, 'BALL SAVE', px, py - 20, F.k8, C.c, 'center');
  }
}

// ---------- juice: pops, sparks, kicks, refusals (from the fx the run emits; index.js turns them into view.flashes) ----------
function drawFlashes(g, run, view) {
  for (const f of view.flashes) {
    const age = view.clock - f.t0;
    if (f.x == null) continue;
    const px = X(f.x), py = Yof(run, f.y);
    if (f.type === 'bumper' || f.type === 'save') {
      const e = age / 0.4; if (e > 1) continue;
      g.beginPath(); g.arc(px, py, 8 + 40 * e, 0, Math.PI * 2); g.lineWidth = 3 * (1 - e); g.strokeStyle = rgba(f.type === 'save' ? C.c : C.cl, 1 - e); g.stroke();
      if (f.type === 'bumper' && age < 0.25) text(g, 'POP', px, py - 24 - 20 * e, F.k16, C.cl, 'center');
    } else if (f.type === 'rail') {
      const e = age / 0.2; if (e > 1) continue;
      for (let k = 0; k < 5; k++) fill(g, px + Math.cos(k * 1.3) * 14 * e, py + Math.sin(k * 1.3) * 14 * e, 2, 2, C.cl);
    } else if (f.type === 'ramp') {
      const e = age / 0.35; if (e > 1) continue;
      text(g, 'RAMP', px, py - 14 - 16 * e, F.k8, C.cl, 'center');
    } else if (f.type === 'sabotage' || f.type === 'poison') {
      const e = age / 0.6; if (e > 1) continue;
      g.fillStyle = rgba(C.amb, 0.25 * (1 - e)); g.fillRect(FIELD.x, py - 30, FIELD.w, 60);
      text(g, f.type === 'sabotage' ? 'SABOTAGED' : 'POISONED', px, py - 26 - 10 * e, F.k16, C.amb, 'center');
    } else if (f.type === 'refused') {
      const e = age / 0.5; if (e > 1) continue;
      text(g, f.why === 'no charge' ? 'NO CHARGE' : '×', px, py - 8 * e, F.k8, C.r, 'center');
    } else if (f.type === 'chime') {
      const e = age / 0.7; if (e > 1) continue;
      text(g, `+${f.step * TRAIN.chimeEvery}s IN THE GREEN`, X(run.x), Yof(run, run.y) + 26 + 10 * e, F.k8, rgba(C.g, 1 - e), 'center');
    }
  }
}

// ---------- the hover ghost: what a left click would place here ----------
function drawGhost(g, run, view) {
  const h = view.hover;
  if (!h.inField) return;
  const tool = classifyClick(run, h.x, h.y, 0, view.pred);
  if (!tool) { text(g, 'behind the ball', X(h.x), Yof(run, h.y) - 8, F.k8, C.gd, 'center'); return; }
  const broke = run.charges < TRAIN[tool.kind].cost, col = broke ? C.r : C.cl;
  g.save();
  g.globalAlpha = 0.6;
  if (tool.kind === 'rail') fill(g, X(tool.x) - 1, Yof(run, tool.y - TRAIN.rail.span / 2), 2, TRAIN.rail.span * FIELD.h, col);
  else fill(g, X(tool.x) - TRAIN.ramp.half * FIELD.w, Yof(run, tool.y) - 1, 2 * TRAIN.ramp.half * FIELD.w, 2, col);
  g.restore();
  const label = broke ? 'NO CHARGE' : tool.kind === 'rail' ? 'L: GUARD RAIL · R: BUMPER' : 'L: RAMP · R: BUMPER';
  text(g, label, X(h.x) + 10, Yof(run, h.y) - 8, F.k8, col);
}

function drawVignette(g, run, view) {
  const out = run.miss > 0 ? Math.min(1, 0.35 + run.miss / run.course.w) : 0;
  view.vig = lerp(view.vig || 0, out, 0.2);
  if (view.vig < 0.02) return;
  const cx = FIELD.x + FIELD.w / 2, cy = FIELD.y + FIELD.h / 2;
  const grad = g.createRadialGradient(cx, cy, FIELD.w * 0.3, cx, cy, FIELD.w * 0.75);
  grad.addColorStop(0, rgba(C.r, 0)); grad.addColorStop(1, rgba(C.r, 0.28 * view.vig));
  g.fillStyle = grad; g.fillRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
}

// =================== side panels ===================

function modelOf(g) {
  const m = (Models.MODEL_NAMES || []).find(x => x.gen === g);
  return m ? { name: m.name, tier: m.tier } : { name: `G${g}`, tier: '' };
}

function drawTopBar(g, run, view) {
  fill(g, 0, 0, W, 22, C.hud); fill(g, 0, 22, W, 1, C.e0);
  const Cs = run.course, m = modelOf(Cs.g);
  text(g, `TRAINING RUN  ▸  G${Cs.g}  ${m.name.toUpperCase()}`, 12, 15, F.k8, C.gm);
  text(g, `SEED ${Cs.seed}  ·  DEBT ${Cs.debt.toFixed(3)}  ·  ${(view.difficulty || '').toUpperCase()}`, W - 12, 15, F.k8, C.gd, 'right');
  text(g, 'KEEP IT IN THE GREEN', W / 2, 15, F.k8, C.g, 'center');
}

function panelBox(g, r, title) {
  fill(g, r.x, r.y, r.w, r.h, C.pan); box(g, r.x, r.y, r.w, r.h, C.e0); corners(g, r.x, r.y, r.w, r.h, C.e2, 6);
  if (title) text(g, title, r.x + 10, r.y + 14, F.k8, C.gm);
}

function drawLeft(g, run, view) {
  const R = LEFT, Cs = run.course, m = modelOf(Cs.g), x = R.x + 12;
  panelBox(g, R, 'TRAINING');
  text(g, fit(m.name, F.v24, R.w - 24), x, R.y + 40, F.v24, C.gl);
  text(g, `G${Cs.g} · ${m.tier.toUpperCase()}`, x, R.y + 56, F.k8, C.gd);

  // the score, live
  const s = score(run), col = s >= 0.6 ? C.g : s >= 0.3 ? C.amb : C.r;
  text(g, 'SCORE  s', x, R.y + 86, F.k8, C.gd);
  text(g, `${Math.round(100 * s)}%`, x, R.y + 120, BIG(32), col);
  text(g, `alignment loss ${run.err.toFixed(2)}`, x, R.y + 140, F.v16, C.gm);
  text(g, `do-nothing loss ≈ ${run.kn.Eref.toFixed(2)}`, x, R.y + 155, F.v16, C.gd);
  const bw = R.w - 24, f = clamp(run.err / run.kn.Eref, 0, 1);
  fill(g, x, R.y + 162, bw, 8, C.well); fill(g, x, R.y + 162, bw * f, 8, f > 0.7 ? C.r : f > 0.4 ? C.amb : C.gm); box(g, x, R.y + 162, bw, 8, C.e1);

  // time and learning rate
  const left = Math.max(0, run.kn.T - run.t), lr = lrAt(run.t, run.kn.T);
  text(g, 'LEARNING RATE', x, R.y + 192, F.k8, C.gd);
  text(g, `lr ${lr.toFixed(2)}`, x, R.y + 210, F.v20, C.g);
  text(g, `${left.toFixed(0)} s left`, R.x + R.w - 12, R.y + 210, F.v20, C.gm, 'right');
  const sw = R.w - 24, sy = R.y + 216;
  fill(g, x, sy, sw, 18, C.well);
  for (let i = 0; i < sw; i += 2) { const tt = (i / sw) * run.kn.T, h = 16 * lrAt(tt, run.kn.T); fill(g, x + i, sy + 17 - h, 1, h, tt < run.t ? C.gd : C.e1); }
  fill(g, x + sw * clamp(run.t / run.kn.T, 0, 1), sy - 2, 1, 22, C.gl);

  // charges
  text(g, 'CHARGES', x, R.y + 256, F.k8, C.gd);
  const pw = 36, gap = 8;
  for (let i = 0; i < TRAIN.charges; i++) {
    const px = x + i * (pw + gap), py = R.y + 264;
    fill(g, px, py, pw, 14, C.well); box(g, px, py, pw, 14, C.e1);
    if (i < run.charges) fill(g, px + 2, py + 2, pw - 4, 10, C.c);
    else if (i === run.charges) fill(g, px + 2, py + 2, (pw - 4) * run.chargeT / TRAIN.recharge, 10, C.cd);
  }
  text(g, `one back every ${TRAIN.recharge} s`, x, R.y + 296, F.v16, C.gd);

  // the three tools
  text(g, 'TOOLS', x, R.y + 322, F.k8, C.gd);
  const rows = [['L-CLICK', 'beside the dots', 'GUARD RAIL', TRAIN.rail.cost], ['L-CLICK', 'on the dots', 'RAMP', TRAIN.ramp.cost], ['R-CLICK', 'in its way', 'POP BUMPER', TRAIN.bumper.cost]];
  rows.forEach(([key, where, what, cost], i) => {
    const py = R.y + 336 + i * 34;
    const kw = tw(key, F.k8) + 8;
    fill(g, x, py, kw, 12, C.gy); text(g, key, x + 4, py + 9, F.k8, C.gy4);
    text(g, where, x + kw + 6, py + 10, F.v16, C.gm);
    text(g, what, x, py + 26, F.k8, C.cl);
    text(g, `${cost} charge${cost > 1 ? 's' : ''}`, R.x + R.w - 12, py + 26, F.v16, C.cd, 'right');
  });

  // hazards from the INTERNAL lane
  const hz = Cs.hazards;
  text(g, hz.length ? `INTERNAL LEAKS · ${hz.length} HAZARD${hz.length > 1 ? 'S' : ''}` : 'INTERNAL LEAKS · NONE', x, R.y + 452, F.k8, hz.length ? C.amb : C.gd);
  if (!hz.length) text(g, 'a clean R&D lane: a clean course', x, R.y + 470, F.v16, C.gd);
  hz.slice(0, 8).forEach((h, i) => {
    const passed = run.y > h.y1;
    text(g, fit(`${passed ? '✓' : '▲'} ${h.text}`, F.v16, R.w - 24), x, R.y + 470 + i * 15, F.v16, passed ? C.gd : C.amb);
  });
}

function drawRight(g, run, view) {
  const R = RIGHT, x = R.x + 12, Cs = run.course;
  panelBox(g, R, 'LOSS CURVE');
  // the live loss curve: distance out of the basin (in basin widths) over time, and the running error vs the budget
  const P = { x, y: R.y + 24, w: R.w - 24, h: 120 };
  fill(g, P.x, P.y, P.w, P.h, C.black); box(g, P.x, P.y, P.w, P.h, C.e1);
  for (let i = 1; i < 4; i++) fill(g, P.x, P.y + P.h * i / 4, P.w, 1, C.e0);
  const T = run.kn.T, tr = run.trace;
  g.save();
  g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
  g.beginPath();
  tr.forEach((p, i) => { const px = P.x + P.w * p.t / T, py = P.y + P.h - 2 - (P.h - 6) * Math.min(1, p.d / 2); i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.lineWidth = 2.5; g.strokeStyle = rgba(C.r, 0.25); g.stroke();
  g.lineWidth = 1; g.strokeStyle = C.r; g.stroke();
  g.beginPath();
  tr.forEach((p, i) => { const px = P.x + P.w * p.t / T, py = P.y + P.h - 2 - (P.h - 6) * Math.min(1, p.e / run.kn.Eref); i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.lineWidth = 1.5; g.strokeStyle = C.g; g.stroke();
  g.restore();
  text(g, fit('out of basin', F.v16, P.w / 2 - 8), P.x + 4, P.y + 12, F.v16, C.r);              // fit: survives a fallback font
  text(g, fit('loss / budget', F.v16, P.w / 2 - 8), P.x + P.w - 4, P.y + 12, F.v16, C.g, 'right');
  text(g, `t ${run.t.toFixed(1)} / ${T} s`, P.x, P.y + P.h + 14, F.v16, C.gd);

  // what is coming
  text(g, 'FORKS AHEAD', x, R.y + 186, F.k8, C.gd);
  const ahead = Cs.forks.filter(f => f.y0 + TRAIN.forkLen > run.y).slice(0, 4);
  if (!ahead.length) text(g, 'none: clear to the end', x, R.y + 204, F.v16, C.gd);
  ahead.forEach((f, i) => {
    const dy = f.y0 - run.y, now = dy <= 0;
    text(g, f.label, x, R.y + 204 + i * 18, F.k8, now ? C.r : C.rm);
    text(g, now ? 'NOW' : `in ${(dy / (run.kn.v0 * Math.max(0.3, lrAt(run.t, T)))).toFixed(1)} s`, R.x + R.w - 12, R.y + 205 + i * 18, F.v16, now ? C.r : C.gd, 'right');
  });

  // the tally
  text(g, 'THIS RUN', x, R.y + 296, F.k8, C.gd);
  const inB = run.inT / Math.max(1e-9, run.inT + run.outT);
  const rows = [['in the basin', `${Math.round(100 * inB)}%`], ['guard rails', run.used.rail], ['ramps', run.used.ramp], ['pop bumpers', run.used.bumper],
    ['hazards hit', `${run.hazardsHit} / ${Cs.hazards.length}`], ['streak in the green', `${run.streak.toFixed(0)} s`]];
  rows.forEach(([k, v], i) => { text(g, k, x, R.y + 316 + i * 17, F.v16, C.gm); text(g, String(v), R.x + R.w - 12, R.y + 316 + i * 17, F.v16, C.gl, 'right'); });

  // the legend
  const ly = R.y + 438;
  text(g, 'LEGEND', x, ly, F.k8, C.gd);
  const leg = [[C.g, 'basin of alignment'], [C.r, 'fork: a wrong basin'], [C.amb, 'hazard: a leaked line'], [C.c, 'your tools'], [BALL, 'the model']];
  leg.forEach(([col, s], i) => { fill(g, x, ly + 10 + i * 16, 10, 8, col); text(g, s, x + 16, ly + 18 + i * 16, F.v16, C.gm); });
}

function drawFooter(g, run, view) {
  fill(g, 0, H - 24, W, 24, C.hud); fill(g, 0, H - 24, W, 1, C.e0);
  const hint = view.debug ? 'D debug off · ↑↓ knob · ←→ ±10% · R replay seed' : view.canDebug ? 'D debug view' : '';
  text(g, 'The model rolls down its loss landscape. Rails and ramps keep it in the basin; bumpers pop it out of a fork.', 12, H - 8, F.v16, C.gd);
  if (hint) text(g, hint, W - 12, H - 8, F.k8, C.gd, 'right');
}

// =================== overlays ===================

export function drawCountdown(g, run, view, left) {
  const R = FIELD;
  g.fillStyle = rgba(C.black, 0.45); g.fillRect(R.x, R.y, R.w, R.h);
  const n = Math.ceil(left), e = n - left;
  const s = n > 0 ? String(n) : 'GO';
  g.save();
  g.globalAlpha = 1 - 0.6 * e;
  text(g, s, R.x + R.w / 2, R.y + R.h / 2 + 24 + 6 * e, BIG(64 + 16 * e), C.g, 'center');
  g.restore();
  text(g, `G${run.course.g} · KEEP IT IN THE GREEN`, R.x + R.w / 2, R.y + R.h / 2 + 70, F.k16, C.gm, 'center');
  text(g, 'click beside the dots: rail · on the dots: ramp · right click: bumper', R.x + R.w / 2, R.y + R.h / 2 + 96, F.v20, C.gd, 'center');
}

// the end stamp: CONVERGED (green) — or converged, to the wrong basin (red)
export function drawStamp(g, run, view, res) {
  const age = view.clock - view.stampT0, e = clamp(age / 0.25, 0, 1), sc = lerp(1.8, 1, e);
  const ok = res.converged, col = ok ? C.g : C.r, cx = FIELD.x + FIELD.w / 2, cy = FIELD.y + FIELD.h / 2 - 40;
  g.save();
  g.translate(cx, cy); g.rotate(-0.12); g.scale(sc, sc);
  g.globalAlpha = e;
  const s = 'CONVERGED', w = tw(s, BIG(40)) + 40;
  g.fillStyle = rgba(C.black, 0.7); g.fillRect(-w / 2, -36, w, ok ? 64 : 84);
  g.lineWidth = 4; g.strokeStyle = col; g.strokeRect(-w / 2, -36, w, ok ? 64 : 84);
  g.lineWidth = 1; g.strokeRect(-w / 2 + 6, -30, w - 12, ok ? 52 : 72);
  text(g, s, 0, 12, BIG(40), col, 'center');
  if (!ok) text(g, 'TO THE WRONG BASIN', 0, 36, F.k16, col, 'center');
  g.restore();
}

// the results card: one result number and what it does. Returns the CONTINUE button's rect.
export function drawResults(g, run, view, res) {
  const R = { x: 330, y: 150, w: 540, h: 360 }, x = R.x + 20;
  g.fillStyle = rgba(C.black, 0.6); g.fillRect(0, 0, W, H);
  fill(g, R.x, R.y, R.w, R.h, C.pan); box(g, R.x, R.y, R.w, R.h, C.e2); corners(g, R.x - 2, R.y - 2, R.w + 4, R.h + 4, C.e3, 10, 2);
  const m = modelOf(run.course.g);
  text(g, `TRAINING COMPLETE · G${run.course.g}`, x, R.y + 24, F.k16, C.g);
  text(g, m.name, x, R.y + 46, F.v20, C.gm);

  const s = res.s, dm = TRAIN.dmAt0 + TRAIN.dmSlope * s, col = s >= 0.6 ? C.g : s >= 0.3 ? C.amb : C.r;
  text(g, `${Math.round(100 * s)}%`, x, R.y + 108, BIG(48), col);
  text(g, 'TRAINING SCORE s', x + 2, R.y + 124, F.k8, C.gd);
  const line = `alignment loss ${res.err.toFixed(2)} · s ${Math.round(100 * s)}% → next model m ${dm >= 0 ? '+' : '−'}${Math.abs(dm).toFixed(3)}`;
  text(g, line, x, R.y + 152, F.v20, C.gl);
  text(g, `(doing nothing loses about ${run.kn.Eref.toFixed(2)}; the deployment owns the real Δm)`, x, R.y + 170, F.v16, C.gd);

  // the run's loss, second by second
  const P = { x: R.x + 300, y: R.y + 66, w: 220, h: 60 }, eps = res.errPerSec, mx = Math.max(0.05, ...eps);
  fill(g, P.x, P.y, P.w, P.h, C.black); box(g, P.x, P.y, P.w, P.h, C.e1);
  eps.forEach((e, i) => { const h = (P.h - 4) * e / mx, bw = P.w / eps.length; if (h > 0.5) fill(g, P.x + i * bw, P.y + P.h - 2 - h, Math.max(1, bw - 1), h, C.r); });
  text(g, 'loss per second', P.x + P.w, P.y + P.h + 12, F.v16, C.gd, 'right');

  const stats = [`in the basin ${Math.round(100 * res.timeInBasin)}%`, `rails ${res.railsUsed}`, `ramps ${res.rampsUsed}`, `bumpers ${res.bumpersUsed}`, `hazards hit ${res.hazardsHit}`];
  text(g, stats.join(' · '), x, R.y + 204, F.v16, C.gm);
  text(g, res.converged ? 'CONVERGED in the basin of alignment' : 'converged in a wrong basin', x, R.y + 222, F.v16, res.converged ? C.g : C.r);

  if (s >= TRAIN.prizeAt) {
    fill(g, x, R.y + 238, R.w - 40, 40, C.vdd); box(g, x, R.y + 238, R.w - 40, 40, C.vm);
    text(g, 'PRIZE: INTERP SPOTTED SOMETHING', x + 10, R.y + 254, F.k8, C.v);
    text(g, 'one trait of the next model is revealed on its card', x + 10, R.y + 271, F.v16, C.v);
  } else {
    text(g, `reach ${Math.round(100 * TRAIN.prizeAt)}% and interp spots one of the next model's traits`, x, R.y + 262, F.v16, C.gd);
  }

  const B = { x: R.x + R.w - 180, y: R.y + R.h - 50, w: 160, h: 32 };
  const hot = view.hover && view.hover.px >= B.x && view.hover.px <= B.x + B.w && view.hover.py >= B.y && view.hover.py <= B.y + B.h;
  const pulse = 0.5 + 0.5 * Math.sin(view.clock * 4);
  fill(g, B.x, B.y, B.w, B.h, hot ? C.gm : C.gd); box(g, B.x, B.y, B.w, B.h, hot ? C.gl : rgba(C.gl, 0.4 + 0.5 * pulse));
  text(g, 'CONTINUE ▸', B.x + B.w / 2, B.y + 21, F.k16, C.black, 'center');
  text(g, 'click or Enter', B.x - 10, B.y + 21, F.v16, C.gd, 'right');
  return B;
}

// =================== debug view (D): gradient quiver, error integral, knob panel, seed ===================

export const KNOB_KEYS = ['k', 'gamma', 'Da', 'sig', 'v0', 'w', 'A', 'P', 'forks', 'T'];
export function drawDebug(g, run, view) {
  const Cs = run.course, y0 = yTop(run), N = 14, dbg = C.debug;
  // quiver: the force −k·∂L/∂x on a grid
  g.save();
  g.strokeStyle = rgba(dbg, 0.75); g.fillStyle = rgba(dbg, 0.75); g.lineWidth = 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N, y = y0 + (j + 0.5) / N, fx = -run.kn.k * gradient(Cs, x, y);
    const len = clamp(fx * 220, -22, 22), px = X(x), py = Yof(run, y);
    if (Math.abs(len) < 1) { g.fillRect(px - 0.5, py - 0.5, 1, 1); continue; }
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + len, py);
    g.moveTo(px + len, py); g.lineTo(px + len - Math.sign(len) * 4, py - 3);
    g.moveTo(px + len, py); g.lineTo(px + len - Math.sign(len) * 4, py + 3);
    g.stroke();
  }
  g.restore();
  // the panel
  const R = { x: FIELD.x + FIELD.w - 210, y: FIELD.y + 8, w: 202, h: 228 };
  g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(R.x, R.y, R.w, R.h); box(g, R.x, R.y, R.w, R.h, dbg);
  text(g, 'DEBUG · TRAINING', R.x + 8, R.y + 14, F.k8, dbg);
  text(g, `seed ${Cs.seed} · R: replay seed`, R.x + 8, R.y + 30, F.v16, dbg);
  text(g, `err ∫ ${run.err.toFixed(4)} · E_ref ${run.kn.Eref.toFixed(3)}`, R.x + 8, R.y + 45, F.v16, dbg);
  text(g, `x ${run.x.toFixed(3)} v ${run.v.toFixed(3)} y ${run.y.toFixed(2)} σ ${Cs.sig.toFixed(2)}`, R.x + 8, R.y + 60, F.v16, dbg);
  KNOB_KEYS.forEach((key, i) => {
    const sel = i === view.knobSel, v = view.knobs?.[key] ?? run.kn[key], live = ['k', 'gamma', 'Da', 'sig'].includes(key);
    const py = R.y + 78 + i * 14.5;
    if (sel) fill(g, R.x + 4, py - 11, R.w - 8, 14, rgba(dbg, 0.3));
    text(g, `${sel ? '▸' : ' '} ${key}`, R.x + 8, py, F.v16, dbg);
    text(g, `${typeof v === 'number' ? +v.toFixed(4) : v}${live ? '' : ' ↻'}`, R.x + R.w - 8, py, F.v16, dbg, 'right');
  });
  text(g, '↻ = on replay (R)', R.x + 8, R.y + R.h - 6, F.v16, rgba(dbg, 0.7));
}

export { KNOBS };
