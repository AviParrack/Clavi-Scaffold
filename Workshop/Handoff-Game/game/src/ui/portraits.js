// ===== Codec portraits: green monochrome, painted in luminance, dithered to C.face, cached =====
// portrait(speaker, { talking, blink, gen }) → an 88×112 canvas, cached per speaker / mouth / eyes / generation.
// noise(i) → one of four 88×112 frames of green static (no signal).
// Every face is painted in code at 44×56 "luminance" cells (0 = black, 1 = lit), then contrast-curved, outlined,
// rim-lit on the right, Bayer-dithered to the 8 greens of C.face and shown at 2×. All original art.
// Light comes from the left. The virtual canvas is zoomed 1.55× round (22, 26), so only x 8..36, y 9..45 is on screen.

import { C, epoch, clamp, hash } from './theme.js';

const PW = 44, PH = 56;                 // painted cells; the canvas is 2× that
const seq = seed => { let i = 0; return () => hash(seed * 7919 + i++); };   // deterministic 0..1 stream
const CACHE = new Map();

export function portrait(speaker, { talking = false, blink = false, gen = 1 } = {}) {
  const g = speaker === 'model' ? clamp(gen | 0, 1, 7) : 0;
  const key = [speaker, talking ? 1 : 0, blink ? 1 : 0, g, epoch].join('|');
  let cv = CACHE.get(key);
  if (!cv) {
    const paintFn = PAINT[speaker] || PAINT.unknown;
    cv = render(paintFn({ open: talking, blink, gen: g }));
    if (CACHE.size > 160) CACHE.clear();
    CACHE.set(key, cv);
  }
  return cv;
}

const NOISE = new Map();
export function noise(i) {
  const key = (i & 3) + '|' + epoch;
  let cv = NOISE.get(key);
  if (!cv) {
    const p = painter(), r = seq(1013 + (i & 3) * 7919);
    for (let j = 0; j < PH; j++) {
      const band = r() < 0.12 ? 0.25 : 0;                  // a brighter roll band now and then
      for (let x = 0; x < PW; x++) p.L[j * PW + x] = Math.pow(r(), 3.2) * 0.62 + band * r();
    }
    cv = render(p, { flat: true });
    if (NOISE.size > 8) NOISE.clear();
    NOISE.set(key, cv);
  }
  return cv;
}

// =================== painter: luminance cells + a figure mask ===================
// put / ell / poly / rect / line / arc / box take virtual coordinates; v is a number or a function (x, y, old) → v.

function painter(z = 1.55, ox = 22, oy = 26, mirror = false) {
  const L = new Float32Array(PW * PH), M = new Uint8Array(PW * PH);
  const X = v => (v - ox) * z + ox, Y = v => (v - oy) * z + oy;
  const raw = (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    const i = y * PW + (mirror ? PW - 1 - x : x);
    M[i] = 1;
    L[i] = typeof v === 'function' ? v((x - ox) / z + ox, (y - oy) / z + oy, L[i]) : v;
  };
  return {
    L, M,
    put(x, y, v) { raw(X(x), Y(y), v); },
    ell(cx, cy, rx, ry, v) {
      cx = X(cx); cy = Y(cy); rx *= z; ry *= z;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) raw(x, y, v);
      }
    },
    poly(pts, v) {
      pts = pts.map(q => [X(q[0]), Y(q[1])]);
      let y0 = 1e9, y1 = -1e9;
      for (const q of pts) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const yy = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + (yy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
        xs.sort((m, n) => m - n);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) raw(x, y, v);
      }
    },
    rect(x0, y0, x1, y1, v) {
      const a = Math.round(X(x0)), b = Math.round(X(x1)), c = Math.round(Y(y0)), d = Math.round(Y(y1));
      for (let y = c; y < d; y++) for (let x = a; x < b; x++) raw(x, y, v);
    },
    line(x0, y0, x1, y1, v, th) {
      x0 = X(x0); y0 = Y(y0); x1 = X(x1); y1 = Y(y1);
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; raw(x, y, v); if (th) raw(x, y + 1, v); }
    },
    arc(cx, cy, rx, ry, a0, a1, v, th) {
      for (let i = 0; i <= 140; i++) {
        const a = a0 + (a1 - a0) * i / 140, x = X(cx + Math.cos(a) * rx), y = Y(cy + Math.sin(a) * ry);
        raw(x, y, v); if (th) raw(x, y + 1, v);
      }
    },
    box(x0, y0, x1, y1, v) {
      const a = Math.round(X(x0)), b = Math.round(X(x1)), c = Math.round(Y(y0)), d = Math.round(Y(y1));
      for (let x = a; x <= b; x++) { raw(x, c, v); raw(x, d, v); }
      for (let y = c; y <= d; y++) { raw(a, y, v); raw(b, y, v); }
    },
    // scattered cells inside a rect (hair texture, stubble): density d, seeded
    speck(x0, y0, x1, y1, v, d, seed) {
      const r = seq(seed);
      for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) if (r() < d) raw(X(x), Y(y), v);
    },
  };
}

// backdrop: dim vertical bars, darker towards the bottom (drawn as background, so it takes no outline)
function backdrop(p, odd, lift = 0) {
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) p.L[y * PW + x] = (x % 4 === odd ? 0.06 : 0.13) + lift - 0.08 * (y / PH);
}
// backdrop detail in screen cells (not zoomed, no mask): a dim mark that stays behind the figure
const bg = (p, x, y, v) => { const i = y * PW + x; if (x >= 0 && y >= 0 && x < PW && y < PH && !p.M[i]) p.L[i] = Math.max(p.L[i], v); };

// skin lit from the left: brightest at x0, falling off to the right and downwards
const skinOf = (top, x0 = 12, k = 0.028, lo = 0.26) => (x, y) => clamp(top - k * (x - x0) - 0.005 * (y - 16), lo, 0.98);
const shadeOf = (skin, d) => (x, y) => skin(x, y) - d;
// a rough texture (curls, stubble, knit): lo, with hi on a share d of the on-screen cells
const tex = (seed, lo, hi, d) => (x, y) => hash(seed + Math.round(x * 1.55) * 131 + Math.round(y * 1.55) * 977) < d ? hi : lo;
// curls: a staggered grid of small rings, each lit on its upper left; the whole mop brighter towards the light
const curls = (lo, hi, s = 3.4) => (x, y) => {
  const row = Math.floor(y / s), u = x / s + (row % 2) * 0.5, fx = u - Math.floor(u) - 0.5, fy = y / s - row - 0.5;
  const r = Math.hypot(fx, fy), top = hi - 0.012 * (x - 8);
  return r > 0.44 ? lo : r > 0.24 && fx + fy < 0.15 ? top : lo + (top - lo) * 0.35;
};

// =================== render: curve, outline, rim light, dither, 2×, scanlines ===================

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function render(p, { flat = false } = {}) {
  const { L, M } = p, n = 7, OUT = new Int8Array(PW * PH), pal = C.face.map(rgb);
  if (!flat) {
    for (let i = 0; i < PW * PH; i++) L[i] = M[i] ? clamp((L[i] - 0.5) * 1.35 + 0.5, 0, 1) : clamp(L[i], 0, 0.22);
    for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
      const k = j * PW + i, f = q => q >= 0 && q < PW * PH && M[q];
      if (!M[k]) { if ((i > 0 && f(k - 1)) || (i < PW - 1 && f(k + 1)) || f(k - PW) || f(k + PW)) OUT[k] = -1; }
      else if (i < PW - 1 && !M[k + 1] && L[k] > 0.12) OUT[k] = 1;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = PW * 2; cv.height = PH * 2;
  const g = cv.getContext('2d'), img = g.createImageData(PW * 2, PH * 2), d = img.data;
  for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
    const k = j * PW + i, th = (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16 - 0.5;
    const c = pal[OUT[k] < 0 ? 0 : OUT[k] > 0 ? 6 : clamp(Math.floor(L[k] * n + 0.5 + th * 0.45), 0, n)];
    for (let dy = 0; dy < 2; dy++) {
      const s = dy ? 0.88 : 1;                                 // every other screen row a touch darker
      for (let dx = 0; dx < 2; dx++) {
        const o = ((j * 2 + dy) * PW * 2 + i * 2 + dx) * 4;
        d[o] = c[0] * s; d[o + 1] = c[1] * s; d[o + 2] = c[2] * s; d[o + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// =================== shared features ===================
// eyes(p, f, lx, rx, y, opts): two eyes at y with left eye from lx, right from rx (each w cells wide).
// The left eye is lit (white of the eye bright), the right one in shadow.

function eyes(p, f, lx, rx, y, { w = 5, lid = 0.05, white = [0.92, 0.55], pupil = 0, bag = [0.6, 0.28], look = 2 } = {}) {
  if (f.blink) {
    p.line(lx, y + 1, lx + w - 1, y + 1, lid); p.line(rx, y + 1, rx + w - 2, y + 1, lid);
  } else {
    p.rect(lx, y, lx + w, y + 2, white[0]); p.rect(rx, y, rx + w, y + 2, white[1]);
    p.rect(lx + look, y, lx + look + 2, y + 2, pupil); p.rect(rx + look, y, rx + look + 2, y + 2, pupil);
    p.line(lx, y - 0.4, lx + w, y - 0.4, lid); p.line(rx, y - 0.4, rx + w, y - 0.4, lid);
  }
  if (bag) { p.line(lx, y + 2.6, lx + w - 1, y + 2.6, bag[0]); p.line(rx, y + 2.6, rx + w - 1, y + 2.6, bag[1]); }
}

// mouth centred on cx at y: closed = a dark line, open = dark gap with a lit lower lip
function mouth(p, f, cx, y, w = 7, { lip = 0.82, line = 0.03 } = {}) {
  const a = cx - w / 2, b = cx + w / 2;
  if (f.open) { p.rect(a + 0.5, y - 0.5, b, y + 1.5, 0.02); p.rect(a + 1.5, y - 0.5, b - 1, y + 0.5, 0.62); p.rect(a + 1.5, y + 1.5, b - 1, y + 2.5, lip); }
  else { p.line(a, y, b - 1, y, line); p.rect(a + 1.5, y + 1.5, b - 1.5, y + 2.5, lip); }
}

// a standard head: skull ellipse + jaw polygon, cheek and jaw shadows on the right
function head(p, skin, { cx = 22, cy = 24, rx = 10, ry = 12.3, chin = 37.4, jawW = 9.6, cheek = 0.3 } = {}) {
  const sh = shadeOf(skin, cheek);
  p.ell(cx, cy - 1, rx, ry, skin);
  p.poly([[cx - jawW, 25], [cx + jawW, 25], [cx + jawW - 2.2, 32.5], [cx + 1.5, chin], [cx - 1.5, chin], [cx - jawW + 1.6, 32.5]], skin);
  p.poly([[cx + 4.5, 24], [cx + rx, 22], [cx + rx - 1, 31], [cx + 5.5, 33.5]], sh);
  p.poly([[cx + 0.5, chin - 2], [cx + jawW - 1.8, 30.5], [cx + 1.5, chin]], shadeOf(skin, 0.22));
}

function ear(p, x, y, lit) { p.ell(x, y, lit ? 1.9 : 1.4, lit ? 3.4 : 3, lit ? 0.8 : 0.3); if (lit) p.put(x - 0.3, y, 0.45); }

function nose(p, x, y0, y1, { lit = 1.0 } = {}) {
  p.line(x + 1, y0, x + 2.6, y1, 0.4); p.line(x + 2, y0, x + 3.4, y1, 0.46);
  p.put(x - 0.5, y1 - 2.5, lit); p.put(x, y1 - 1.5, lit); p.put(x, y1 - 0.5, lit);
  p.rect(x, y1 + 1, x + 4, y1 + 2, 0.12);
}

// shoulders and a top: base luminance v, optional collar/lapels drawn by the caller
const torso = (p, v) => p.poly([[0, 56], [0, 49], [6, 44], [15, 41], [29, 41], [38, 44], [44, 49], [44, 56]], v);

// =================== the cast ===================

const PAINT = {
  // ---------- CEO: slicked back, greying temples, blazer; a frown that has read the replies ----------
  ceo(f) {
    const p = painter(); backdrop(p, 3);
    const skin = skinOf(1.02), shade = d => shadeOf(skin, d);
    p.poly([[0, 56], [0, 49], [6, 44], [15, 41], [29, 41], [38, 44], [44, 49], [44, 56]], 0.2);
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [9, 56]], 0.3);
    p.poly([[15, 41], [20, 49], [17, 56], [9, 56], [11, 45]], 0.46);
    p.poly([[29, 41], [24, 49], [27, 56], [35, 56], [33, 45]], 0.1);
    p.poly([[17, 40], [27, 40], [24, 51], [20, 51]], 0.9);
    p.poly([[16, 39], [21, 45], [19, 47], [14, 42]], 1.0);
    p.poly([[28, 39], [23, 45], [25, 47], [30, 42]], 0.6);
    p.rect(20, 46, 24, 51, 0.32);
    p.rect(17, 31, 27, 42, shade(0.22)); p.rect(17, 31, 27, 35, 0.2);
    p.ell(22, 23, 10.2, 12.4, skin);
    p.poly([[12.4, 25], [31.6, 25], [29.5, 32.5], [23.5, 37.6], [20.5, 37.6], [14.5, 32.5]], skin);
    p.poly([[26.5, 24], [32, 22], [31, 31], [27.5, 33.5]], shade(0.3));
    p.poly([[22.5, 35.5], [29.8, 30.5], [23.5, 37.6]], shade(0.22));
    p.poly([[13, 25], [15, 31], [13.8, 32]], 0.98);
    ear(p, 11.8, 24.5, true); ear(p, 32.4, 24.5, false);
    p.ell(22, 10.5, 11.5, 6.0, 0.08);
    p.poly([[10.6, 11], [14, 11], [13.4, 21], [10.8, 22]], 0.08);
    p.poly([[30, 11], [33.4, 12.5], [33, 21], [31, 21]], 0.05);
    p.rect(11, 15, 13, 21, 0.68);
    p.line(12.5, 10, 27, 6, 0.62); p.line(14, 12.6, 30, 8.6, 0.44); p.line(16, 8, 23, 5.6, 0.8); p.line(25, 11.6, 31, 10.2, 0.3); p.line(12, 13.4, 21, 11.6, 0.36);
    p.line(14, 18.4, 20, 20.2, 0.02, 1); p.line(24.5, 20.2, 30.5, 18.4, 0.02, 1);
    p.put(22, 20, 0.45); p.put(22, 21, 0.4);
    if (f.blink) { p.line(15, 23, 19, 23, 0.06); p.line(25, 23, 29, 23, 0.05); }
    else {
      p.rect(15, 22, 20, 24, 0.92); p.rect(25, 22, 30, 24, 0.55);
      p.rect(17, 22, 19, 24, 0.0); p.rect(27, 22, 29, 24, 0.0); p.put(17, 22, 0.98);
      p.line(15, 21.6, 20, 21.6, 0.05); p.line(25, 21.6, 30, 21.6, 0.05);
    }
    p.line(15, 24.6, 19, 24.6, 0.6); p.line(25, 24.6, 29, 24.6, 0.28);
    p.line(23, 22, 24.6, 29, 0.4); p.line(24, 22, 25.4, 29, 0.46);
    p.put(21.5, 26.5, 1.0); p.put(22, 27.5, 1.0); p.put(22, 28.5, 1.0);
    p.rect(22, 30, 26, 31, 0.12); p.put(21, 30, 0.5);
    p.line(19.5, 29.5, 18, 32.5, 0.5); p.line(26.5, 29.5, 27.5, 32.5, 0.24);
    if (f.open) { p.rect(19, 33, 26, 35, 0.02); p.rect(20, 33, 25, 34, 0.6); p.rect(20, 35, 25, 36, 0.75); }
    else { p.line(18.5, 33.5, 25.5, 33.5, 0.03); p.put(18, 34.3, 0.22); p.put(26, 34.3, 0.12); p.rect(20, 35, 24, 36, 0.82); }
    p.rect(20, 36, 23, 37, 0.95);
    return p;
  },

  // ---------- YOU, head of safety: hoodie, a mop that has not met a comb since the last eval, glasses, headset ----------
  safety(f) { return paintYou(f, painter()); },

  // ---------- Auditing lead: sharp bob with a straight fringe, rectangular glasses, high collar, badge ----------
  audit(f) {
    const p = painter(); backdrop(p, 1);
    for (let y = 6; y < 50; y += 9) for (let x = 0; x < PW; x++) bg(p, x, y, 0.2);          // filing cabinet drawers
    const skin = skinOf(1.04, 12, 0.026, 0.3), shade = d => shadeOf(skin, d);
    p.poly([[10, 34], [9, 18], [12, 9], [22, 6], [32, 9], [35, 18], [34.5, 34], [31, 35], [13, 35]], 0.1);   // the bob, behind
    torso(p, 0.34);
    p.poly([[0, 56], [0, 49], [6, 44], [13, 42], [11, 56]], 0.44);
    p.poly([[16, 39], [28, 39], [28.5, 45], [22, 47.5], [15.5, 45]], 0.88);                    // high collar, lit
    p.poly([[22, 41], [28, 39], [28.5, 45], [22, 47.5]], 0.6);
    p.line(17.5, 44, 20, 54, 0.05); p.line(26.5, 44, 24, 54, 0.05);                          // lanyard
    p.rect(18.5, 50.5, 25.5, 56, 0.92); p.rect(19.5, 51.5, 22, 54, 0.3); p.line(23, 52, 25, 52, 0.4); p.line(23, 54, 25, 54, 0.4);
    p.rect(18, 31, 26, 40, shade(0.26));
    head(p, skin, { rx: 9.5, ry: 12, jawW: 9.2, chin: 36.6 });
    p.poly([[12.5, 33], [12, 18], [14, 12], [22, 9], [30, 12], [32, 18], [31.5, 33], [33.8, 30], [34.5, 16], [31, 8], [22, 6], [13, 8], [9.5, 16], [10.2, 30]], 0.1);
    p.poly([[12, 18], [13.5, 10.5], [22, 8.2], [30.5, 10.5], [32, 18], [27, 18.3], [22, 17.6], [17, 18.3]], 0.1);   // fringe, cut straight
    p.line(13, 12, 20, 9.2, 0.55); p.line(13.5, 15, 18, 13.5, 0.38); p.line(11, 22, 11.5, 31, 0.42); p.line(24, 9.5, 29, 11, 0.24);
    p.line(14.5, 19.2, 20, 19.6, 0.05, 1); p.line(24, 19.6, 29.5, 19.2, 0.05, 1);
    eyes(p, f, 15, 24.5, 21.6, { w: 5, look: 2, bag: [0.72, 0.4] });
    p.box(13.8, 20.4, 20.6, 24.2, 0.02); p.box(23.6, 20.4, 30.4, 24.2, 0.02); p.line(20.6, 21.4, 23.6, 21.4, 0.02);
    p.put(15, 21, 1.0); p.put(24.6, 21, 0.9);
    nose(p, 21, 23, 28.6);
    mouth(p, f, 22.3, 32.6, 6.5, { lip: 0.7 });
    p.put(11.6, 28.5, 1.0); p.put(11.6, 29.5, 0.7);                                           // earring
    return p;
  },

  // ---------- Research lead: a cloud of curls, short beard, marker behind the ear, whiteboard scribbles ----------
  research(f) {
    const p = painter(); backdrop(p, 2);
    const r = seq(41);
    for (let n = 0; n < 7; n++) { const y = 6 + n * 6 + (r() * 3 | 0), x0 = r() * 10 | 0; for (let x = x0; x < x0 + 6 + r() * 30; x++) bg(p, x, y + ((x * 3) % 5 === 0 ? 1 : 0), 0.24); }
    const skin = skinOf(0.86, 12, 0.026, 0.2), shade = d => shadeOf(skin, d);
    p.ell(22, 14, 16.5, 12.5, curls(0.1, 0.62));                                               // curls, behind
    torso(p, 0.48);
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [10, 56]], 0.58);
    p.arc(22, 41, 6.4, 3.6, 0, Math.PI, 0.18, 1);                                            // crew neck
    p.ell(19, 49, 1, 1, 0.92); p.ell(25, 49, 1, 1, 0.92); p.ell(22, 52.5, 1, 1, 0.92); p.line(19, 49, 22, 52.5, 0.8); p.line(25, 49, 22, 52.5, 0.8);
    p.rect(18, 31, 26, 41, shade(0.22));
    head(p, skin, { rx: 9.8, ry: 12.2, jawW: 9.5, chin: 37.6, cheek: 0.26 });
    p.poly([[12.6, 22], [13, 13], [22, 10], [31, 13], [31.4, 22], [29, 16.5], [22, 15], [15, 16.5]], curls(0.1, 0.62));          // hairline
    ear(p, 11.9, 24.5, true); ear(p, 32.2, 24.5, false);
    p.rect(31.5, 17, 33.5, 25, 0.95); p.rect(31.5, 17, 33.5, 18.5, 0.3);                     // marker
    p.poly([[12.6, 26], [14, 33], [19, 38.4], [25, 38.4], [30.6, 33], [31.4, 26], [29, 30.5], [25, 34], [19, 34], [15, 30.5]], tex(10, 0.08, 0.3, 0.16));   // beard
    p.line(14, 18.6, 20, 18, 0.05, 1); p.line(24, 18, 30, 18.6, 0.05, 1);                    // brows up: excited
    eyes(p, f, 15, 24.5, 21.8, { w: 5, look: 2, white: [0.95, 0.6] });
    nose(p, 21, 22.5, 28.8);
    p.rect(18, 30.8, 26.5, 32, 0.08);                                                        // moustache
    if (f.open) { p.rect(18.5, 32.4, 26, 35.2, 0.02); p.rect(19.5, 32.4, 25, 33.4, 0.9); }
    else { p.line(18.5, 33, 25.5, 33, 0.9); p.line(18.5, 33.8, 25.5, 33.8, 0.04); }          // a grin
    return p;
  },

  // ---------- Regulator: bald dome, grey sides, heavy brows, half-moon glasses, moustache, suit and a lapel pin ----------
  regulator(f) {
    const p = painter(); backdrop(p, 0, 0.03);
    for (let x = 0; x < PW; x += 5) for (let y = 0; y < PH; y++) bg(p, x, y, 0.2);           // wood panelling
    const skin = skinOf(1.0, 12, 0.027, 0.24), shade = d => shadeOf(skin, d);
    torso(p, 0.16);
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [9, 56]], 0.24);
    p.poly([[15, 41], [21, 50], [18, 56], [9, 56], [11, 45]], 0.3); p.poly([[29, 41], [23, 50], [26, 56], [35, 56], [33, 45]], 0.08);
    p.poly([[17, 40], [27, 40], [23.5, 49], [20.5, 49]], 0.95);                               // shirt
    p.poly([[20.6, 42], [23.4, 42], [24.2, 54], [22, 56], [19.8, 54]], 0.36);                 // tie
    for (let y = 44; y < 55; y += 3) p.line(20.2, y, 23.8, y - 1, 0.6);
    p.rect(12.5, 46, 14.5, 48, 1.0);                                                          // lapel pin
    p.rect(17, 31, 27, 41, shade(0.24)); p.rect(17, 31, 27, 34, 0.24);
    head(p, skin, { rx: 10.6, ry: 12.8, jawW: 10.2, chin: 37.8 });
    p.poly([[11.5, 28], [10.5, 25], [13.8, 32.5], [17, 35.8]], shade(0.12));                 // jowls
    p.ell(16, 13, 3.4, 2.2, 1.0);                                                             // dome shine
    p.poly([[10.8, 16], [13.6, 15], [14, 23], [11.4, 23.5]], 0.7); p.poly([[30.4, 15], [33.4, 16], [33, 23.5], [30.6, 23]], 0.32);   // grey sides
    ear(p, 11.3, 24.5, true); ear(p, 32.8, 24.5, false);
    p.rect(13.6, 18, 20.4, 20, 0.08); p.rect(23.8, 18, 30.6, 20, 0.08);                      // heavy brows
    p.line(13.6, 17.6, 20, 17.6, 0.55);
    eyes(p, f, 15, 25, 21.5, { w: 5, look: 1.5, white: [0.85, 0.5], bag: [0.55, 0.25] });
    p.arc(17.5, 24.3, 3.2, 1.8, 0, Math.PI, 0.03); p.arc(27.5, 24.3, 3.2, 1.8, 0, Math.PI, 0.03); p.line(20.7, 24.3, 24.3, 24.3, 0.03);   // half-moons
    nose(p, 21.5, 22.5, 29.2);
    p.poly([[17, 31.4], [27, 31.4], [28, 33.6], [24, 32.8], [20, 32.8], [16, 33.6]], 0.72);  // moustache, grey
    if (f.open) { p.rect(19, 33.8, 25.5, 35.8, 0.02); p.rect(20, 35.8, 24.5, 36.6, 0.7); }
    else { p.line(19, 34.2, 25, 34.2, 0.04); p.rect(19.5, 35.4, 24.5, 36.4, 0.8); }
    return p;
  },

  // ---------- Greenrock: knit beanie, round glasses, scruffy beard, flannel ----------
  greenrock(f) {
    const p = painter(); backdrop(p, 1);
    const skin = skinOf(0.98, 12, 0.027, 0.24), shade = d => shadeOf(skin, d);
    const plaid = (x, y) => ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 0.22 : 0.42) + (Math.floor(x) % 3 === 0 ? 0.12 : 0) - 0.01 * (x - 12);
    torso(p, plaid);
    p.poly([[16, 40], [22, 47], [28, 40], [27, 43], [22, 49], [17, 43]], 0.12);
    p.rect(18, 31, 26, 41, shade(0.24));
    head(p, skin, { rx: 10, ry: 12.2, jawW: 9.8, chin: 37.6 });
    ear(p, 11.8, 25, true); ear(p, 32.3, 25, false);
    p.ell(22, 13, 12, 7.8, 0.3);                                                              // beanie
    for (let x = 11; x < 34; x += 2) p.line(x, 8, x + 0.4, 17, 0.4);
    p.rect(10.4, 15, 33.6, 19, 0.52); for (let x = 11; x < 34; x += 2) p.line(x, 15, x, 18.6, 0.36);
    p.ell(22, 5.6, 2.2, 1.8, 0.62);
    p.poly([[12.4, 25], [14, 33], [19, 38.8], [25, 38.8], [30, 33], [31.6, 25], [29.4, 30], [25.4, 31.4], [22, 30.6], [18.6, 31.4], [14.8, 30]], tex(21, 0.14, 0.4, 0.3));   // beard, scruffy
    p.rect(18, 30.4, 26.5, 31.6, 0.1);
    p.line(14.5, 20.6, 19.5, 20.2, 0.08, 1); p.line(24.5, 20.2, 29.5, 20.6, 0.08, 1);
    eyes(p, f, 15, 24.6, 22.4, { w: 4.6, look: 1.6, bag: [0.66, 0.32] });
    nose(p, 21.3, 23.5, 29);
    mouth(p, f, 22.4, 33.4, 6, { lip: 0.55, line: 0.04 });
    return p;
  },

  // ---------- BNCHR: ponytail, thick square frames, turtleneck; behind her, a log plot that keeps going up ----------
  bnchr(f) {
    const p = painter(); backdrop(p, 3);
    for (let x = 0; x < PW; x += 6) for (let y = 0; y < PH; y += 2) bg(p, x, y, 0.2);
    for (let y = 4; y < PH; y += 8) for (let x = 0; x < PW; x += 2) bg(p, x, y, 0.2);
    for (let x = 0; x < PW; x++) { const y = Math.round(50 - Math.pow(1.105, x) * 1.2); bg(p, x, y, 0.34); bg(p, x, y + 1, 0.3); if (x % 7 === 3) { bg(p, x - 1, y, 0.42); bg(p, x + 1, y, 0.42); bg(p, x, y - 1, 0.42); } }
    const skin = skinOf(1.0, 12, 0.026, 0.28), shade = d => shadeOf(skin, d);
    p.poly([[30, 12], [36, 16], [38, 30], [35, 38], [32.5, 30], [31, 18]], 0.12);             // ponytail, behind
    p.line(33, 16, 36, 30, 0.38);
    torso(p, 0.26);
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [10, 56]], 0.36);
    p.rect(16.5, 33, 27.5, 44, 0.3); for (let y = 35; y < 44; y += 2) p.line(16.5, y, 27.5, y, 0.18);   // turtleneck
    head(p, skin, { rx: 9.6, ry: 12, jawW: 9.4, chin: 37 });
    p.poly([[12, 22], [12.4, 13], [17, 9.2], [24, 8.6], [30, 10.4], [32.2, 16], [32, 22], [29, 15], [22.5, 14.2], [16, 16.2], [13.6, 22]], 0.14);   // pulled back
    p.line(13.4, 14, 20, 10.4, 0.55); p.line(21, 10.4, 28, 11, 0.36); p.rect(30.6, 13, 32.4, 15, 0.7);   // hair tie
    ear(p, 12, 24.5, true); ear(p, 32, 24.5, false);
    p.line(14.5, 19.6, 19.5, 19.4, 0.06, 1); p.line(24.5, 19.4, 29.5, 19.8, 0.06, 1);
    eyes(p, f, 15, 24.5, 22, { w: 5, look: 2 });
    p.rect(13.6, 20.6, 20.8, 21.6, 0.02); p.rect(23.6, 20.6, 30.8, 21.6, 0.02);                  // thick frames
    p.box(13.6, 20.6, 20.8, 24.6, 0.02); p.box(23.6, 20.6, 30.8, 24.6, 0.02); p.line(20.8, 21.6, 23.6, 21.6, 0.02);
    nose(p, 21, 23, 28.8);
    mouth(p, f, 22.2, 32.6, 6.4, { lip: 0.78 });
    return p;
  },

  // ---------- Artemis: long straight hair parted in the middle, a crescent clip, a high collar; a target behind ----------
  artemis(f) {
    const p = painter(); backdrop(p, 0);
    for (const r of [6, 11, 16, 21]) for (let a = 0; a < 6.283; a += 0.04) bg(p, Math.round(22 + Math.cos(a) * r), Math.round(24 + Math.sin(a) * r), 0.22);
    const skin = skinOf(1.03, 12, 0.026, 0.3), shade = d => shadeOf(skin, d);
    p.poly([[9, 56], [9.5, 20], [13, 10], [22, 7], [31, 10], [34.5, 20], [35, 56]], 0.1);     // long hair, behind
    for (let x = 10; x < 35; x += 3) p.line(x, 22, x - 0.5, 56, 0.16);
    torso(p, 0.26);
    p.poly([[16, 38], [28, 38], [29, 46], [22, 44], [15, 46]], 0.62);                         // high collar
    p.poly([[9, 56], [9.5, 24], [13.5, 30], [14, 56]], 0.12); p.poly([[35, 56], [34.5, 24], [30.5, 30], [30, 56]], 0.08);   // hair over shoulders
    p.line(10.5, 30, 11.5, 50, 0.42);
    p.rect(18, 31, 26, 40, shade(0.26));
    head(p, skin, { rx: 9.4, ry: 12, jawW: 9.2, chin: 37 });
    p.poly([[12.4, 24], [12.6, 14], [17, 9.4], [22, 9], [22, 12], [16.6, 15], [14, 24]], 0.1);   // centre parting
    p.poly([[31.6, 24], [31.4, 14], [27, 9.4], [22, 9], [22, 12], [27.4, 15], [30, 24]], 0.08);
    p.line(13, 16, 17, 11, 0.6); p.line(14, 20, 16, 14, 0.44);
    p.ell(27.6, 12.6, 2.6, 2.6, 1.0); p.ell(28.8, 11.8, 2.2, 2.2, 0.08);                       // crescent clip
    p.line(14.6, 19.4, 20, 20, 0.04, 1); p.line(24.4, 20, 29.8, 19.4, 0.04, 1);                // level, focused brows
    eyes(p, f, 15, 24.6, 22, { w: 5, look: 2.5, white: [0.9, 0.5], bag: [0.7, 0.36] });
    if (!f.blink) { p.line(14.4, 21.4, 20.2, 21.4, 0.02); p.line(24.2, 21.4, 30, 21.4, 0.02); }
    nose(p, 21, 23, 28.6);
    mouth(p, f, 22.2, 32.6, 6, { lip: 0.72 });
    return p;
  },

  // ---------- MIRA: tired eyes behind round spectacles, a grey bun coming loose, a heavy scarf. Re-sending ----------
  mira(f) {
    const p = painter(); backdrop(p, 2);
    for (let n = 0; n < 5; n++) for (let x = 2 + n; x < 12 + n; x++) bg(p, x, 40 - n * 3, 0.26);   // a stack of old printouts
    for (let n = 0; n < 4; n++) for (let x = 34 - n; x < 44; x++) bg(p, x, 36 - n * 3, 0.24);
    const skin = skinOf(0.96, 12, 0.026, 0.24), shade = d => shadeOf(skin, d);
    p.ell(24, 9.6, 6.4, 4.4, 0.7); p.line(19.6, 8.6, 27, 11, 0.48); p.line(21.4, 7, 28, 9, 0.92); p.line(29, 8, 31, 5.4, 0.8);   // the bun, and a pencil through it
    torso(p, 0.3);
    p.poly([[13, 38], [31, 38], [34, 44], [28, 48], [22, 46.5], [16, 48], [10, 44]], 0.56);   // scarf
    for (let x = 12; x < 34; x += 3) p.line(x, 39, x - 1, 47, 0.4);
    p.rect(18, 31, 26, 39, shade(0.26));
    head(p, skin, { rx: 9.8, ry: 12.2, jawW: 9.4, chin: 37.2 });
    p.poly([[12.4, 24], [12, 14], [17, 9.6], [24, 9.2], [30, 11], [32.2, 16], [32, 24], [29.6, 15.4], [22, 13.6], [15, 15.4], [13.8, 24]], 0.72);   // grey hair
    p.line(13, 14, 19, 10.6, 0.98); p.line(12.4, 20, 10.4, 28, 0.8); p.line(31.8, 19, 33.6, 27, 0.4); p.line(20, 10.4, 16, 14.6, 0.5);   // loose strands
    ear(p, 11.8, 25, true); ear(p, 32.2, 25, false);
    p.line(14.4, 19.6, 19.6, 20.4, 0.36, 1); p.line(24.4, 20.4, 29.6, 19.4, 0.36, 1);         // brows tilted up: worried
    eyes(p, f, 15.2, 24.8, 22.4, { w: 4.6, look: 1.6, bag: [0.5, 0.2] });
    p.line(15, 26, 19.4, 26, 0.42); p.line(24.8, 26, 29.2, 26, 0.18);                         // second set of bags
    p.arc(17.5, 23.3, 3.6, 3.4, 0, Math.PI * 2, 0.04); p.arc(27, 23.3, 3.6, 3.4, 0, Math.PI * 2, 0.04); p.line(21.1, 23, 23.4, 23, 0.04);
    p.put(15.6, 21.4, 1.0);
    nose(p, 21.2, 23.8, 29);
    p.line(18.6, 31.6, 20.4, 31, 0.36); p.line(25.6, 31.4, 27, 30.4, 0.18);                   // smile lines
    if (f.open) mouth(p, f, 22.4, 33, 6, { lip: 0.66 });
    else { p.line(19.4, 33.2, 25, 33.2, 0.04); p.put(25.4, 32.6, 0.04); p.rect(20, 34.4, 24.6, 35.4, 0.7); }   // a knowing half-smile
    return p;
  },

  // ---------- The Institute: buzz cut, dark glasses, earpiece and coiled wire, suit, crest pin ----------
  institute(f) {
    const p = painter(); backdrop(p, 3);
    for (let a = 0; a < 6.283; a += 0.05) { bg(p, Math.round(22 + Math.cos(a) * 19), Math.round(22 + Math.sin(a) * 19), 0.26); bg(p, Math.round(22 + Math.cos(a) * 17), Math.round(22 + Math.sin(a) * 17), 0.18); }
    const skin = skinOf(0.98, 12, 0.028, 0.22), shade = d => shadeOf(skin, d);
    torso(p, 0.12);
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [9, 56]], 0.2);
    p.poly([[15, 41], [21, 50], [18, 56], [9, 56], [11, 45]], 0.24); p.poly([[29, 41], [23, 50], [26, 56], [35, 56], [33, 45]], 0.06);
    p.poly([[17, 40], [27, 40], [23.5, 49], [20.5, 49]], 0.92);
    p.poly([[20.8, 42], [23.2, 42], [23.8, 54], [22, 56], [20.2, 54]], 0.1);                   // narrow dark tie
    p.ell(13.4, 47, 1.3, 1.3, 1.0);                                                           // crest pin
    p.rect(17.5, 30, 27, 41, shade(0.24)); p.rect(17.5, 30, 27, 33, 0.22);
    head(p, skin, { rx: 10.2, ry: 12.2, jawW: 10.4, chin: 37.4 });                           // square jaw
    p.poly([[12, 20], [12.4, 12], [16, 8.4], [22, 7.6], [28, 8.4], [31.6, 12], [32, 20], [30, 14], [22, 12.4], [14, 14]], 0.2);   // flat top
    p.speck(13, 8, 31, 14, 0.42, 0.3, 97);
    ear(p, 11.6, 24.5, true); ear(p, 32.6, 24.5, false);
    p.ell(32.8, 25.8, 1.2, 1.4, 0.9); for (let y = 27; y < 40; y += 1.5) p.put(33.4 + (y % 3 < 1.5 ? 0 : 0.8), y, 0.85);   // earpiece + coil
    p.poly([[13.4, 20.2], [30.8, 20.2], [30.2, 24.6], [24.6, 25.2], [22, 23], [19.4, 25.2], [14, 24.6]], 0.03);   // dark glasses
    p.line(14.6, 21, 18.4, 21, 0.62); p.line(25, 21, 27.4, 21, 0.4);
    if (f.blink) p.line(15.4, 23.4, 17.4, 23.4, 0.14);                                        // the faintest tell through the lens
    nose(p, 21.4, 24.6, 29.2);
    mouth(p, f, 22.4, 33, 6.6, { lip: 0.66 });
    p.line(17.6, 36.6, 26.6, 36.6, shade(0.2));
    return p;
  },

  // ---------- The model: a different thing every generation, each one stranger ----------
  model(f) { return (MODEL[f.gen] || MODEL[1])(f); },

  // ---------- anyone else: a silhouette ----------
  unknown(f) {
    const p = painter(); backdrop(p, 1);
    torso(p, 0.12); p.rect(18, 31, 26, 42, 0.1); p.ell(22, 23, 10, 12.4, 0.14);
    if (f.open) p.rect(19, 33, 25, 35, 0.04);
    return p;
  },
};

// ---------- YOU (shared by the G7 model, which wears your face) ----------
function paintYou(f, p, { mirrorEyes = false } = {}) {
  backdrop(p, 0);
  const skin = skinOf(1.06, 12, 0.024, 0.36), shade = d => shadeOf(skin, d);
  p.poly([[0, 56], [0, 50], [7, 44], [15, 41], [29, 41], [37, 44], [44, 49], [44, 56]], 0.3);
  p.poly([[10, 44], [15, 38], [30, 38], [35, 44], [28, 47], [17, 47]], 0.5);
  p.poly([[16, 40], [29, 40], [26, 45], [19, 45]], 0.14);
  p.line(19, 46, 18, 55, 0.88); p.line(26, 46, 27, 54, 0.6); p.put(18, 55, 1); p.put(27, 54, 0.7);
  p.rect(18, 32, 26, 41, shade(0.28));
  p.ell(21.5, 24, 9.8, 12.2, skin);
  p.poly([[11.8, 25], [31.2, 25], [28.6, 32.6], [22.3, 37.2], [19.7, 37.2], [13.8, 32.4]], skin);
  p.poly([[25, 26], [30.8, 25], [29.6, 32], [25, 33.4]], shade(0.26));
  p.ell(31.4, 25.5, 1.5, 3.0, 0.36);
  p.ell(22.5, 13.6, 11.8, 7.0, 0.16);
  p.poly([[9.5, 19], [11, 9], [16, 12]], 0.16);
  p.poly([[11.5, 13], [18, 12.5], [12.5, 20.5]], 0.18);
  p.poly([[16.5, 13], [24, 13.5], [18.5, 19]], 0.18);
  p.poly([[22.5, 13], [30, 14.5], [26, 18.5]], 0.16);
  p.poly([[28, 8], [34.5, 13], [33.5, 24], [30, 22]], 0.14);
  p.poly([[15, 8], [19, 3.5], [21, 8]], 0.16); p.poly([[22, 8], [28, 4.5], [28, 9]], 0.16);
  p.line(12.5, 11, 19, 8.5, 0.62); p.line(19.5, 9.5, 27, 8.5, 0.48); p.line(13.5, 15, 15.5, 19.5, 0.58); p.line(18, 15, 20, 19, 0.44); p.line(16, 6, 19, 4.5, 0.52);
  if (mirrorEyes) { p.rect(15, 22, 20, 24, 1.0); p.rect(24, 22, 28, 24, 1.0); }                // no pupils
  else if (!f.blink) { p.rect(15, 22, 20, 24, 0.9); p.rect(15, 22, 17, 24, 0.0); p.rect(24, 22, 28, 24, 0.55); p.rect(24, 22, 26, 24, 0.0); }
  else { p.line(15, 23, 19, 23, 0.06); p.line(24, 23, 28, 23, 0.05); }
  p.line(15, 25.6, 19, 25.6, 0.58); p.line(24, 25.6, 28, 25.6, 0.34);
  p.line(14, 19.2, 19, 18.4, 0.06, 1); p.line(23, 18.4, 28, 19.4, 0.06, 1);
  p.box(14, 20, 20, 24, 0.03); p.box(23, 20, 29, 24, 0.03); p.line(20, 21, 23, 21, 0.03); p.line(29, 21, 31, 22, 0.03);
  if (!mirrorEyes) { p.put(15, 21, 1); p.put(16, 21, 1); p.put(24, 21, 1); p.put(25, 21, 1); }
  p.line(20.5, 22, 18.6, 29, 0.46); p.line(21.5, 22, 19.6, 29, 0.55); p.put(18, 28.6, 1.0); p.rect(18, 30, 21, 31, 0.2);
  if (f.open) { p.rect(18, 33, 23, 35, 0.02); p.rect(18.5, 33, 22.5, 34, 0.6); }
  else p.line(17.5, 33.6, 22.5, 33.6, 0.18);
  p.rect(19, 36, 22, 37, 0.9);
  p.arc(24, 21, 10.5, 14, -1.85, -0.12, 0.02, 1); p.arc(24, 21.6, 11.3, 14.4, -1.85, -0.12, 0.85); p.arc(24, 20.4, 9.8, 13.6, -1.85, -0.12, 0.02);
  p.ell(33, 25.5, 3.4, 4.8, 0.03); p.ell(33.4, 25.5, 2.0, 3.2, 0.3); p.line(30, 22, 30, 29, 0.88); p.put(34, 23, 0.62);
  p.line(31, 29.5, 25, 34.5, 0.88, 1); p.line(25, 34.5, 18.5, 35.2, 0.88, 1); p.rect(14, 34, 18, 38, 0.03); p.rect(15, 35, 17, 37, 0.95);
  return p;
}

// =================== the model, generation by generation ===================

// a smooth mask: the face the model wears from G3 on. No hair, no ears, too symmetric; doll eyes.
// dx shifts it sideways (G5's copies), lum dims it, glowEyes lights the irises.
function mask(p, f, { dx = 0, lum = 1, lines = false, glowEyes = false } = {}) {
  const cx = 22 + dx, skin = (x, y) => clamp((1.0 - 0.02 * (x - 12 - dx) - 0.004 * (y - 16)) * lum, 0.16, 1);
  p.rect(cx - 4, 31, cx + 4, 44, (x, y) => skin(x, y) - 0.36);
  p.ell(cx, 22.5, 9.6, 12.6, skin);
  p.poly([[cx - 9.4, 24], [cx + 9.4, 24], [cx + 7.4, 32], [cx + 0.8, 37.4], [cx - 0.8, 37.4], [cx - 7.4, 32]], skin);
  p.poly([[cx + 4.6, 22], [cx + 9.6, 20], [cx + 8.6, 30], [cx + 5, 33]], (x, y) => skin(x, y) - 0.2);
  if (lines) {                                                                                // traces under the skin
    const v = (x, y) => (x < cx ? 0.16 : 0.85) * lum;
    p.line(cx - 8.5, 17, cx - 4, 17, v); p.line(cx - 4, 17, cx - 4, 13, v); p.line(cx + 8.5, 17, cx + 4, 17, v); p.line(cx + 4, 17, cx + 4, 13, v);
    p.line(cx - 7.5, 29, cx - 3.5, 27, v); p.line(cx + 7.5, 29, cx + 3.5, 27, v); p.line(cx, 33.6, cx, 37, v);
    p.put(cx - 4, 12.6, 0.98 * lum); p.put(cx + 4, 12.6, 0.98 * lum);
  }
  const eye = (x0, lit) => {
    if (f.blink) { p.line(x0, 23, x0 + 5, 23, 0.06); return; }
    p.poly([[x0 - 0.4, 23], [x0 + 1.2, 21.4], [x0 + 3.8, 21.4], [x0 + 5.4, 23], [x0 + 3.8, 24.6], [x0 + 1.2, 24.6]], glowEyes ? 0.06 : (lit ? 0.95 : 0.62) * lum);
    p.rect(x0 + 1.6, 21.8, x0 + 3.6, 24.2, glowEyes ? 1.0 : 0.04);
    p.line(x0 - 0.4, 21.2, x0 + 5.4, 21.2, 0.08);
  };
  eye(cx - 7, true); eye(cx + 2, false);
  p.line(cx - 0.6, 24, cx - 1.2, 29, 0.98 * lum); p.line(cx + 0.6, 24, cx + 1.4, 29, 0.4 * lum); p.rect(cx - 1.4, 29.6, cx + 2, 30.4, 0.3 * lum);
  if (f.open) { p.ell(cx, 33.4, 2.6, 1.3, 0.03); } else { p.line(cx - 2.6, 33.4, cx + 2.6, 33.4, 0.2 * lum); p.rect(cx - 1.6, 34.6, cx + 1.6, 35.4, 0.95 * lum); }
}

const MODEL = {
  // G1 Autocomplete: a little terminal with two dots for eyes and a cursor that blinks when it talks
  1(f) {
    const p = painter(); backdrop(p, 1);
    p.rect(17, 36, 27, 46, 0.3); p.rect(10, 44, 34, 48, 0.42);                               // stand
    p.rect(9, 9, 35, 37, 0.62); p.rect(9, 9, 35, 10, 0.86); p.rect(34, 10, 35, 37, 0.36);    // case
    p.rect(12, 12, 32, 33, 0.06);                                                             // glass
    if (f.blink) { p.line(16, 20, 18, 20, 0.85); p.line(25, 20, 27, 20, 0.85); }
    else { p.rect(16, 18, 18.5, 21, 0.95); p.rect(25, 18, 27.5, 21, 0.95); }
    if (f.open) { p.rect(18, 26, 26, 28, 0.95); p.rect(19, 25, 25, 26, 0.6); }
    else { p.rect(14, 27, 15.5, 28.5, 0.9); p.rect(16.5, 27, 21, 28.5, 0.9); }               // >_
    p.rect(28, 34, 31, 35, 0.95);                                                             // power LED
    return p;
  },
  // G2 Junior Engineer: a round robot head, antenna bulb, big eager eyes
  2(f) {
    const p = painter(); backdrop(p, 2);
    torso(p, 0.36); p.rect(17, 33, 27, 42, 0.26); for (let y = 34; y < 42; y += 2) p.line(17, y, 27, y, 0.4);
    p.line(22, 4, 22, 11, 0.7); p.ell(22, 4, 2.2, 2.2, 1.0);
    p.ell(22, 22, 12, 11.5, (x, y) => clamp(0.86 - 0.02 * (x - 11) - 0.006 * (y - 12), 0.3, 0.95));
    p.rect(12.5, 15, 31.5, 29, 0.08);                                                         // visor
    if (f.blink) { p.line(15, 21, 20, 21, 0.9); p.line(24, 21, 29, 21, 0.9); }
    else { p.ell(17.5, 21, 3, 3.4, 0.95); p.ell(26.5, 21, 3, 3.4, 0.7); p.ell(18, 21.5, 1.2, 1.4, 0.05); p.ell(27, 21.5, 1.2, 1.4, 0.05); p.put(16.6, 19.6, 1); }
    if (f.open) p.ell(22, 26.4, 2.6, 1.6, 0.9); else p.arc(22, 25, 3, 1.6, 0.3, Math.PI - 0.3, 0.9);
    p.rect(9, 19, 11, 25, 0.5); p.rect(33, 19, 35, 25, 0.3);                                  // ear bolts
    return p;
  },
  // G3 Senior Engineer: a mask, calm and symmetric
  3(f) { const p = painter(); backdrop(p, 3); torso(p, 0.26); p.poly([[16, 40], [28, 40], [26, 46], [18, 46]], 0.5); mask(p, f); return p; },
  // G4 Research Scientist: traces under the skin, lit irises, a halo of points
  4(f) {
    const p = painter(); backdrop(p, 0);
    for (let a = 0; a < 6.283; a += 0.22) bg(p, Math.round(22 + Math.cos(a) * 20), Math.round(22 + Math.sin(a) * 19), 0.55);
    torso(p, 0.2); p.poly([[16, 40], [28, 40], [26, 46], [18, 46]], 0.46);
    mask(p, f, { lines: true, glowEyes: true }); return p;
  },
  // G5 Research Org: many of it at once, copies behind it either side
  5(f) {
    const p = painter(); backdrop(p, 2);
    torso(p, 0.18);
    mask(p, { open: false, blink: f.blink }, { dx: -9, lum: 0.42, lines: true, glowEyes: true });
    mask(p, { open: false, blink: f.blink }, { dx: 9, lum: 0.36, lines: true, glowEyes: true });
    mask(p, f, { lines: true, glowEyes: true });
    return p;
  },
  // G6 Superhuman Researcher: the forehead opens round one large eye; more of them on the cheeks and temples
  6(f) {
    const p = painter(); backdrop(p, 1, -0.03);
    for (let x = 1; x < PW; x += 4) for (let y = 1; y < PH; y += 4) bg(p, x, y, 0.4);
    torso(p, 0.16);
    mask(p, f, { lines: true, glowEyes: true });
    const small = (x, y) => { p.ell(x, y, 1.7, 1.1, 0.04); if (!f.blink) { p.rect(x - 0.6, y - 0.5, x + 0.6, y + 0.6, 1.0); } };
    small(14.6, 17.2); small(29.4, 17.2); small(15.8, 29.4); small(28.2, 29.4);
    p.ell(22, 15.2, 4.4, 3.2, 0.03);
    if (f.blink) p.line(18.4, 15.2, 25.6, 15.2, 0.9);
    else { p.ell(22, 15.2, 3.4, 2.4, 0.98); p.ell(22, 15.2, 1.3, 1.9, 0.02); p.put(20.8, 14.2, 1); }
    return p;
  },
  // G7 ASI: it wears your face, mirrored, and the light comes from the wrong side
  7(f) {
    const p = painter(1.55, 22, 26, true);
    paintYou({ open: f.open, blink: false }, p, { mirrorEyes: !f.blink });
    for (let x = 0; x < PW; x += 3) for (let y = 0; y < PH; y += 3) bg(p, x, y, 0.3);
    return p;
  },
};
