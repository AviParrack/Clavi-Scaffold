// ===== Codec portraits: green monochrome, painted in luminance, dithered to C.face, cached =====
// portrait(speaker, { talking, blink, gen }) → an 88×112 canvas, cached per speaker / mouth / eyes / generation.
// modelPortrait(gen, scale = 3, { talking, blink, turn }) → the model at 88×112 cells, `scale` px per cell (3 → 264×336, the card).
// turn (0..1, optional) rotates G4's thought-dots and G7's geometry, in 24 cached steps: animate it slowly if you like.
// noise(i) → one of four 88×112 frames of green static (no signal).
// The cast is painted in code at 44×56 "luminance" cells (0 = black, 1 = lit), then contrast-curved, outlined,
// rim-lit on the right, Bayer-dithered to the 8 greens of C.face and shown at 2×. All original art.
// Light comes from the left. The cast's virtual canvas is zoomed 1.55× round (22, 26), so only x 8..36, y 9..45 is on screen.
// The model is painted at 2× cell density (88×112 cells, no zoom), so it can grow from a tin box to a wall of light.

import { C, epoch, clamp, hash, mod } from './theme.js';

const PW = 44, PH = 56;                 // cast cells; the canvas is 2× that
const MW = 88, MH = 112;                // model cells
const seq = seed => { let i = 0; return () => hash(seed * 7919 + i++); };   // deterministic 0..1 stream
const CACHE = new Map();

export function portrait(speaker, { talking = false, blink = false, gen = 1 } = {}) {
  if (speaker === 'model') return modelPortrait(gen, 1, { talking, blink });
  const key = [speaker, talking ? 1 : 0, blink ? 1 : 0, epoch].join('|');
  let cv = CACHE.get(key);
  if (!cv) {
    const paintFn = PAINT[speaker] || PAINT.unknown;
    cv = render(paintFn({ open: talking, blink }));
    if (CACHE.size > 160) CACHE.clear();
    CACHE.set(key, cv);
  }
  return cv;
}

// the model card's portrait: 88×112 cells at `scale` px each (rounded to a whole number). Codec size is scale 1.
export function modelPortrait(gen, scale = 3, { talking = false, blink = false, turn = 0 } = {}) {
  const g = clamp(gen | 0, 1, 7), px = Math.max(1, Math.round(scale)), step = g === 4 || g === 7 ? Math.round(mod(turn, 1) * 24) % 24 : 0;
  const key = ['model', g, px, talking ? 1 : 0, blink ? 1 : 0, step, epoch].join('|');
  let cv = CACHE.get(key);
  if (!cv) {
    cv = render(MODEL[g]({ open: talking, blink, turn: step / 24 * Math.PI * 2 }), { px });
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

// =================== painter: luminance cells + a figure mask + additive light ===================
// put / ell / poly / rect / line / arc / box take virtual coordinates; v is a number or a function (x, y, old) → v.
// cell = ((virtual − o) · z + o) · c. The cast uses z 1.55, c 1 (44×56). The model uses z 1, o 0 (88×112 cells);
// G7 repaints your face at c 2. Lines and dots are c cells thick, so a face looks the same at any density.
// A holds light added after the contrast curve (glows, leaks): it brightens background without making it figure.

function painter(z = 1.55, ox = 22, oy = 26, mirror = false, c = 1, W = PW * c, H = PH * c) {
  const L = new Float32Array(W * H), M = new Uint8Array(W * H), A = new Float32Array(W * H);
  const X = v => ((v - ox) * z + ox) * c, Y = v => ((v - oy) * z + oy) * c;
  const raw = (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + (mirror ? W - 1 - x : x);
    M[i] = 1;
    L[i] = typeof v === 'function' ? v((x / c - ox) / z + ox, (y / c - oy) / z + oy, L[i]) : v;
  };
  const dot = (x, y, v) => { x = Math.round(x); y = Math.round(y); for (let j = 0; j < c; j++) for (let i = 0; i < c; i++) raw(x + i, y + j, v); };
  return {
    L, M, A, W, H, c,
    put(x, y, v) { dot(X(x), Y(y), v); },
    ell(cx, cy, rx, ry, v) {
      cx = X(cx); cy = Y(cy); rx *= z * c; ry *= z * c;
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
      const a = Math.round(X(x0)), b = Math.round(X(x1)), cc = Math.round(Y(y0)), d = Math.round(Y(y1));
      for (let y = cc; y < d; y++) for (let x = a; x < b; x++) raw(x, y, v);
    },
    line(x0, y0, x1, y1, v, th) {
      x0 = X(x0); y0 = Y(y0); x1 = X(x1); y1 = Y(y1);
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; dot(x, y, v); if (th) dot(x, y + c, v); }
    },
    arc(cx, cy, rx, ry, a0, a1, v, th) {
      const n = Math.max(140 * c, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * z * c));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, x = X(cx + Math.cos(a) * rx), y = Y(cy + Math.sin(a) * ry);
        dot(x, y, v); if (th) dot(x, y + c, v);
      }
    },
    box(x0, y0, x1, y1, v) {
      const a = Math.round(X(x0)), b = Math.round(X(x1)), cc = Math.round(Y(y0)), d = Math.round(Y(y1));
      for (let x = a; x <= b; x += c) { dot(x, cc, v); dot(x, d, v); }
      for (let y = cc; y <= d; y += c) { dot(a, y, v); dot(b, y, v); }
    },
    // scattered cells inside a rect (hair texture, stubble): density d, seeded
    speck(x0, y0, x1, y1, v, d, seed) {
      const r = seq(seed);
      for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) if (r() < d) dot(X(x), Y(y), v);
    },
    lite(x, y, v) {
      x = Math.round(X(x)); y = Math.round(Y(y));
      if (x >= 0 && y >= 0 && x < W && y < H) { const i = y * W + (mirror ? W - 1 - x : x); A[i] = Math.max(A[i], v); }
    },
    // additive light round (cx, cy): v at the centre, falling to 0 at radius r (falloff power f)
    glow(cx, cy, r, v, f = 2) {
      cx = X(cx); cy = Y(cy); r *= z * c;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d < 1) { const i = y * W + (mirror ? W - 1 - x : x); A[i] = Math.max(A[i], v * Math.pow(1 - d, f)); }
      }
    },
  };
}

// backdrop: dim vertical bars, darker towards the bottom (drawn as background, so it takes no outline)
function backdrop(p, odd, lift = 0) {
  for (let y = 0; y < p.H; y++) for (let x = 0; x < p.W; x++) p.L[y * p.W + x] = (Math.floor(x / p.c) % 4 === odd ? 0.06 : 0.13) + lift - 0.08 * (y / p.H);
}
// backdrop detail in screen cells (not zoomed, no mask): a dim mark that stays behind the figure
const bg = (p, x, y, v) => { const i = y * p.W + x; if (x >= 0 && y >= 0 && x < p.W && y < p.H && !p.M[i]) p.L[i] = Math.max(p.L[i], v); };

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

// =================== render: curve, outline, rim light, light, dither, px× cells, scanlines ===================

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function render(p, { flat = false, px = 2 } = {}) {
  const { L, M, A, W, H } = p, n = 7, OUT = new Int8Array(W * H), pal = C.face.map(rgb);
  if (!flat) {
    for (let i = 0; i < W * H; i++) L[i] = M[i] ? clamp((L[i] - 0.5) * 1.35 + 0.5, 0, 1) : clamp(L[i], 0, 0.22);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, f = q => q >= 0 && q < W * H && M[q];
      if (!M[k]) { if (A[k] < 0.25 && ((i > 0 && f(k - 1)) || (i < W - 1 && f(k + 1)) || f(k - W) || f(k + W))) OUT[k] = -1; }
      else if (i < W - 1 && !M[k + 1] && L[k] > 0.12) OUT[k] = 1;
    }
    for (let i = 0; i < W * H; i++) if (A[i] > 0) L[i] = clamp(L[i] + A[i], 0, 1);
  }
  const cv = document.createElement('canvas');
  cv.width = W * px; cv.height = H * px;
  const g = cv.getContext('2d'), img = g.createImageData(W * px, H * px), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, th = (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16 - 0.5;
    const c = pal[OUT[k] < 0 ? 0 : OUT[k] > 0 ? 6 : clamp(Math.floor(L[k] * n + 0.5 + th * 0.45), 0, n)];
    for (let dy = 0; dy < px; dy++) {
      const s = (px > 1 ? dy === px - 1 : j & 1) ? 0.88 : 1;   // a darker screen row: one per cell, or every other row at 1 px
      for (let dx = 0; dx < px; dx++) {
        const o = ((j * px + dy) * W * px + i * px + dx) * 4;
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
  // ---------- BIG BOSS: the founder. Close-cropped, plain crewneck, an earnest stare, and an eyepatch ----------
  ceo(f) {
    const p = painter(); backdrop(p, 3);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { const d = Math.hypot(x - 22, y - 20) / 22; if (d < 1) bg(p, x, y, 0.12 + 0.1 * (1 - d)); }   // a keynote spot
    const skin = skinOf(1.02, 12, 0.027, 0.26), shade = d => shadeOf(skin, d);
    torso(p, 0.2);                                                                            // plain crewneck, dark
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [9, 56]], 0.3);
    p.rect(17.5, 31, 26.5, 41, shade(0.24)); p.rect(17.5, 31, 26.5, 34, 0.2);
    p.arc(22, 40.6, 6.8, 3.2, 0, Math.PI, 0.46, 1); p.arc(22, 40.6, 6.8, 4.6, 0.2, Math.PI - 0.2, 0.12);   // the ribbed neckline
    head(p, skin, { rx: 10.2, ry: 12.4, jawW: 10, chin: 37.8 });                              // a strong jaw
    ear(p, 11.6, 24.5, true); ear(p, 32.4, 24.5, false);
    p.speck(13, 28, 31, 38, shade(0.22), 0.24, 23);                                           // stubble
    p.poly([[11.8, 21], [12, 13.4], [15.4, 9.2], [22, 7.6], [28.6, 9], [32, 13.4], [32.2, 21], [30.8, 15.4], [26, 12.6], [22, 12.2], [18, 12.6], [13.2, 15.4]], tex(5, 0.1, 0.26, 0.35));   // close-cropped
    p.line(13.2, 13, 19, 9.8, 0.36);
    p.line(14.2, 18.8, 20.2, 18.2, 0.05, 1); p.line(24, 18.2, 30, 19, 0.05, 1);               // level brows, inner ends up: earnest
    if (f.blink) p.line(24.6, 22.8, 29.4, 22.8, 0.05);
    else {                                                                                    // one eye, wide, straight at you
      p.rect(24.4, 21.2, 29.8, 24, 0.82); p.rect(26, 21.2, 28.2, 24, 0.0); p.put(26.2, 21.4, 1.0);
      p.line(24.4, 20.8, 29.8, 20.8, 0.04);
    }
    p.line(25, 25.2, 29, 25.2, 0.3);
    p.line(19.8, 20.4, 27.6, 8.4, 0.03); p.line(20.6, 20.4, 28.4, 8.4, 0.03);                 // the patch strap, up across the forehead
    p.line(14.2, 22.2, 11, 22.8, 0.03);                                                       // and round to the ear
    p.poly([[14, 20.4], [20.6, 20], [21, 23.4], [19.2, 25.4], [15.4, 25.4], [13.6, 23.4]], 0.05);   // the eyepatch
    p.line(14.8, 20.9, 18.8, 20.7, 0.4); p.put(14.8, 21.8, 0.3);
    nose(p, 21.4, 23, 29.2);
    if (f.open) { p.rect(19, 33, 26, 35, 0.02); p.rect(20, 33, 25, 34, 0.6); p.rect(20, 35, 25, 36, 0.75); }
    else { p.line(18.4, 33.4, 25.8, 33.4, 0.03); p.rect(19.6, 34.6, 24.6, 35.6, 0.8); }
    p.rect(20, 36.4, 23.4, 37.4, 0.92);
    return p;
  },

  // ---------- YOU, head of safety: painted in paintYou below ----------
  safety(f) { return paintYou(f, painter()); },

  // ---------- Auditing lead: bearded alignment veteran, flat cap, deadpan. Has read every transcript twice ----------
  audit(f) {
    const p = painter(); backdrop(p, 1);
    for (let y = 6; y < 50; y += 9) for (let x = 0; x < PW; x++) bg(p, x, y, 0.2);          // filing cabinet drawers
    for (let y = 9; y < 50; y += 9) for (let x = 3; x < 7; x++) bg(p, x, y, 0.3);
    const skin = skinOf(1.0, 12, 0.027, 0.26), shade = d => shadeOf(skin, d);
    torso(p, tex(29, 0.28, 0.36, 0.3));                                                       // a wool sweater
    p.poly([[0, 56], [0, 49], [6, 44], [13, 42], [11, 56]], 0.4);
    p.arc(22, 41.2, 7.4, 3.6, 0, Math.PI, 0.44, 1);
    p.rect(18, 31, 26, 41, shade(0.26));
    p.poly([[16.4, 39.6], [21.4, 42.6], [19, 46], [14.6, 42.2]], 0.92); p.poly([[27.6, 39.6], [22.6, 42.6], [25, 46], [29.4, 42.2]], 0.56);   // shirt collar
    head(p, skin, { rx: 10, ry: 12.2, jawW: 9.8, chin: 37.6 });
    ear(p, 11.8, 25, true); ear(p, 32.2, 25, false);
    p.poly([[12, 24.6], [12.8, 32], [17, 37.8], [22, 40], [27, 37.8], [31.2, 32], [32, 24.6], [29.6, 28.6], [26, 30.6], [22, 30], [18, 30.6], [14.4, 28.6]], tex(33, 0.4, 0.66, 0.34));   // the beard, greying
    p.poly([[22, 30], [26, 30.6], [29.6, 28.6], [32, 24.6], [31.2, 32], [27, 37.8], [22, 40]], tex(34, 0.22, 0.4, 0.3));
    p.poly([[17.4, 30.2], [26.6, 30.2], [27.6, 32.6], [24, 31.8], [20, 31.8], [16.6, 32.6]], 0.56);   // moustache
    if (f.open) { p.rect(19.4, 32.6, 24.6, 34.6, 0.02); p.rect(20, 34.6, 24, 35.2, 0.5); }
    else p.line(19.2, 33, 24.8, 33, 0.04);                                                    // the mouth: a straight line
    p.line(14.4, 20.2, 20, 20.2, 0.3, 1); p.line(24, 20.2, 29.6, 20.2, 0.22, 1);             // level brows, greying
    if (f.blink) { p.line(15, 23, 20, 23, 0.05); p.line(24.4, 23, 29, 23, 0.05); }
    else {                                                                                    // half-lidded: seen it all
      p.rect(15, 22.6, 20, 24, 0.86); p.rect(17, 22.6, 19, 24, 0.0); p.rect(24.4, 22.6, 29, 24, 0.5); p.rect(26, 22.6, 28, 24, 0.0);
      p.rect(15, 21.6, 20, 22.6, shade(0.2)); p.rect(24.4, 21.6, 29, 22.6, shade(0.24)); p.line(15, 22.4, 20, 22.4, 0.04); p.line(24.4, 22.4, 29, 22.4, 0.04);
    }
    p.line(15.4, 25.2, 19.4, 25.2, 0.52); p.line(24.8, 25.2, 28.6, 25.2, 0.26);
    nose(p, 21.2, 22.8, 28.8);
    p.poly([[10.2, 18], [10.8, 12.4], [14.4, 8.8], [22, 7.2], [30.4, 8.4], [34.2, 11.6], [34.6, 16.4], [32, 18]], tex(17, 0.26, 0.4, 0.3));   // flat cap: the crown
    p.line(12.4, 12, 21, 8.8, 0.56); p.line(22, 8.4, 31, 9.6, 0.3);
    p.poly([[11, 17.6], [32.6, 17.8], [30.8, 19.6], [22, 20.2], [12.6, 19.4]], 0.08); p.line(11.6, 17.8, 22, 18, 0.5);   // the brim
    p.rect(11, 19, 12.8, 24, 0.6); p.rect(31.4, 19, 33, 24, 0.3);                             // grey at the temples
    return p;
  },

  // ---------- Research lead: a cloud of curls, round glasses, and the glee of a straight line on a log-log plot ----------
  research(f) {
    const p = painter(); backdrop(p, 2);
    for (let x = 0; x < PW; x += 7) for (let y = 0; y < PH; y += 2) bg(p, x, y, 0.17);       // log-log grid on the whiteboard
    for (let y = 3; y < PH; y += 9) for (let x = 0; x < PW; x += 2) bg(p, x, y, 0.17);
    for (let x = 0; x < PW; x++) { const y = Math.round(52 - x * 1.05); bg(p, x, y, 0.36); if (x % 5 === 2) { bg(p, x - 1, y - 1, 0.42); bg(p, x + 1, y + 1, 0.42); bg(p, x + 1, y - 1, 0.42); bg(p, x - 1, y + 1, 0.42); } }   // the law, straight as a ruler
    const skin = skinOf(0.86, 12, 0.026, 0.2), shade = d => shadeOf(skin, d);
    p.ell(22, 14, 15.5, 12, curls(0.1, 0.62));                                                // curls, behind
    torso(p, 0.48);
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [10, 56]], 0.58);
    p.arc(22, 41, 6.4, 3.6, 0, Math.PI, 0.18, 1);                                            // crew neck
    p.line(18, 51, 26, 44.6, 0.92); for (const [x, y] of [[19, 50.2], [21.6, 48.1], [24.2, 46]]) p.ell(x, y, 0.8, 0.8, 1.0);   // a plot on the T-shirt too
    p.rect(18, 31, 26, 41, shade(0.22));
    head(p, skin, { rx: 9.8, ry: 12.2, jawW: 9.5, chin: 37.6, cheek: 0.26 });
    p.poly([[12.6, 22], [13, 13], [22, 10], [31, 13], [31.4, 22], [29, 16.5], [22, 15], [15, 16.5]], curls(0.1, 0.62));          // hairline
    ear(p, 11.9, 24.5, true); ear(p, 32.2, 24.5, false);
    p.arc(17.4, 17.6, 3.2, 1.8, Math.PI * 1.1, Math.PI * 1.9, 0.05, 1); p.arc(26.8, 17.6, 3.2, 1.8, Math.PI * 1.1, Math.PI * 1.9, 0.05, 1);   // brows way up
    if (f.blink) { p.arc(17.4, 23.6, 2.2, 1.2, Math.PI, Math.PI * 2, 0.04); p.arc(26.8, 23.6, 2.2, 1.2, Math.PI, Math.PI * 2, 0.04); }
    else {                                                                                    // wide eyes on the plot, up and to the right
      p.ell(17.4, 22.4, 2.6, 2.2, 0.96); p.ell(26.8, 22.4, 2.6, 2.2, 0.66);
      p.rect(18, 21, 19.4, 22.6, 0.0); p.rect(27.4, 21, 28.8, 22.6, 0.0);
    }
    p.arc(17.4, 22.4, 3.6, 3.4, 0, Math.PI * 2, 0.04); p.arc(26.8, 22.4, 3.6, 3.4, 0, Math.PI * 2, 0.04);   // round glasses
    p.line(21, 21.8, 23.2, 21.8, 0.04); p.line(13.8, 21.6, 12.2, 22.4, 0.04); p.line(30.4, 21.6, 31.8, 22.4, 0.04);
    p.put(15.6, 20.6, 1.0);
    nose(p, 21, 24, 28.6);
    p.line(15.4, 28.4, 16.2, 32, shade(0.3)); p.line(28.6, 28.4, 27.8, 32, shade(0.3));      // cheeks up
    if (f.open) { p.poly([[16.6, 30.8], [27.4, 30.8], [25.6, 35], [22, 36.4], [18.4, 35]], 0.03); p.rect(17.6, 31, 26.4, 32.2, 0.95); p.rect(19, 34.4, 25, 35.4, 0.5); }
    else { p.poly([[16.6, 30.8], [27.4, 30.8], [25.6, 34], [22, 35], [18.4, 34]], 0.03); p.rect(17.6, 31, 26.4, 32.4, 0.95); }   // the grin
    return p;
  },

  // ---------- Regulator: neat grey hair, reading glasses on a chain, a lanyard, and the binder. It has tabs ----------
  regulator(f) {
    const p = painter(); backdrop(p, 0, 0.03);
    for (let x = 0; x < PW; x += 5) for (let y = 0; y < PH; y++) bg(p, x, y, 0.2);           // wood panelling
    const skin = skinOf(1.02, 12, 0.027, 0.26), shade = d => shadeOf(skin, d);
    torso(p, 0.18);                                                                           // blazer
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [9, 56]], 0.28);
    p.poly([[15, 41], [20.4, 48], [18, 56], [9, 56], [11, 45]], 0.32); p.poly([[29, 41], [23.6, 48], [26, 56], [35, 56], [33, 45]], 0.08);
    p.poly([[17, 40], [27, 40], [24, 48], [20, 48]], 0.94);                                   // blouse
    p.rect(18, 31, 26, 41, shade(0.24));
    p.line(18, 40.6, 20.8, 44, 0.66); p.line(26, 40.6, 23.4, 44, 0.4);                        // lanyard
    p.rect(19.6, 43.4, 25, 47.4, 0.97); p.rect(20.4, 44.2, 22, 46.2, 0.3); p.line(22.8, 44.6, 24.4, 44.6, 0.4); p.line(22.8, 45.8, 24.4, 45.8, 0.4);   // badge
    head(p, skin, { rx: 9.8, ry: 12.2, jawW: 9.4, chin: 37.2 });
    ear(p, 11.8, 25, true); ear(p, 32.2, 25, false);
    p.poly([[11.4, 27], [11, 16.4], [14, 10.2], [22, 7.8], [30, 10], [33.2, 16.4], [33, 27], [31.2, 19], [26.4, 13.6], [19, 14.2], [14, 18.6], [13.2, 27]], 0.62);   // neat grey hair, side part
    p.poly([[30, 10], [33.2, 16.4], [33, 27], [31.2, 19], [28, 13.6]], 0.36);
    p.line(18, 8.8, 19.6, 14, 0.24); p.line(13, 14, 17, 10, 0.86); p.line(21, 9.4, 27, 10, 0.8);
    p.line(14.6, 19.4, 20, 18.8, 0.2, 1); p.line(24, 18.2, 29.6, 19.4, 0.2, 1);               // one brow raised: really?
    if (f.blink) { p.line(15, 22, 20, 22, 0.05); p.line(24.4, 22, 29, 22, 0.05); }
    else {                                                                                    // looking at you over the glasses
      p.rect(15, 20.8, 20, 23, 0.9); p.rect(17, 20.8, 19, 22.2, 0.0); p.rect(24.4, 20.8, 29, 23, 0.56); p.rect(26, 20.8, 28, 22.2, 0.0);
      p.line(15, 20.4, 20, 20.4, 0.05); p.line(24.4, 20.4, 29, 20.4, 0.05);
    }
    p.line(14.6, 25.2, 20.4, 25.2, 0.03); p.arc(17.5, 25.2, 2.9, 1.8, 0, Math.PI, 0.03);       // reading glasses, low on the nose
    p.line(23.8, 25.2, 29.4, 25.2, 0.03); p.arc(26.6, 25.2, 2.8, 1.8, 0, Math.PI, 0.03); p.line(20.4, 25, 23.8, 25, 0.03);
    p.line(15.6, 25.8, 17, 25.8, 0.9);
    for (let i = 0; i <= 18; i++) {                                                           // the chain, looping down to the neck
      const u = i / 18;
      p.put(14.4 - Math.sin(u * Math.PI) * 2.2, 25.4 + u * 14, i % 2 ? 0.95 : 0.4);
      p.put(29.6 + Math.sin(u * Math.PI) * 2.4, 25.4 + u * 14, i % 2 ? 0.5 : 0.2);
    }
    nose(p, 21.4, 22.6, 29);
    if (f.open) mouth(p, f, 22.4, 33.2, 6.4, { lip: 0.7 });
    else { p.line(19.2, 33.6, 25.2, 33.6, 0.05); p.put(18.8, 34.2, 0.12); p.put(25.6, 34.2, 0.12); p.rect(20, 34.8, 24.6, 35.8, 0.76); }   // a firm line, corners down
    p.poly([[2, 56], [3.4, 40], [14.4, 39.4], [15.6, 56]], (x, y) => clamp(0.78 - 0.012 * (x - 3), 0.4, 0.8));   // the binder, held up
    p.rect(13.4, 39.6, 15.6, 56, 0.26); for (const y of [42, 46.4, 50.8]) p.rect(13.8, y, 15.2, y + 1, 0.95);   // spine, rings
    p.rect(5.4, 42.6, 11.4, 45.6, 0.98); p.line(6.2, 44, 10.4, 44, 0.3);                       // label
    for (const [y, v] of [[41, 0.95], [44, 0.5], [47, 0.8]]) p.rect(15.6, y, 16.8, y + 1.6, v);   // tabs
    return p;
  },

  // ---------- Greenrock: knit beanie, round wire glasses, scruffy beard, flannel; a control protocol on the wall ----------
  greenrock(f) {
    const p = painter(); backdrop(p, 1);
    for (const [x, y] of [[1, 6], [1, 22], [36, 14], [36, 30]]) { for (let i = 0; i < 6; i++) { bg(p, x + i, y, 0.3); bg(p, x + i, y + 4, 0.3); } for (let j = 0; j <= 4; j++) { bg(p, x, y + j, 0.3); bg(p, x + 5, y + j, 0.3); } }
    for (let y = 11; y < 22; y++) bg(p, 3, y, 0.24); for (let y = 19; y < 30; y++) bg(p, 38, y, 0.24);   // boxes and arrows
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
    p.poly([[12.4, 25], [14, 33], [19, 38.8], [25, 38.8], [30, 33], [31.6, 25], [29.4, 30], [25.4, 31.4], [22, 30.6], [18.6, 31.4], [14.8, 30]], tex(21, 0.14, 0.4, 0.3));   // beard, scruffy
    p.rect(18, 30.4, 26.5, 31.6, 0.1);
    p.line(14.5, 20.6, 19.5, 20.2, 0.08, 1); p.line(24.5, 20.2, 29.5, 20.6, 0.08, 1);
    eyes(p, f, 15, 24.6, 22.4, { w: 4.6, look: 1.6, bag: [0.66, 0.32] });
    p.arc(17.3, 23.2, 3.1, 2.9, 0, Math.PI * 2, 0.06); p.arc(26.9, 23.2, 3.1, 2.9, 0, Math.PI * 2, 0.06);   // round wire glasses
    p.line(20.4, 22.8, 23.8, 22.8, 0.06); p.put(15.6, 21.4, 1.0);
    nose(p, 21.3, 23.5, 29);
    mouth(p, f, 22.4, 33.4, 6, { lip: 0.55, line: 0.04 });
    return p;
  },

  // ---------- BNCHR: ponytail, thick square frames, turtleneck; behind her, a log plot that keeps going up ----------
  bnchr(f) {
    const p = painter(); backdrop(p, 3);
    for (let x = 0; x < PW; x += 6) for (let y = 0; y < PH; y += 2) bg(p, x, y, 0.2);
    for (let y = 4; y < PH; y += 8) for (let x = 0; x < PW; x += 2) bg(p, x, y, 0.2);
    for (let x = 0; x < PW; x++) { const y = Math.round(50 - Math.pow(1.105, x) * 1.2); bg(p, x, y, 0.4); bg(p, x, y + 1, 0.32); if (x % 7 === 3) { bg(p, x - 1, y, 0.5); bg(p, x + 1, y, 0.5); bg(p, x, y - 1, 0.5); bg(p, x, y + 1, 0.5); } }
    for (let x = 0; x < PW; x += 7) for (let y = 50; y < 53; y++) bg(p, x, y, 0.36);               // a tick every doubling
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
    if (f.open) mouth(p, f, 22.2, 32.6, 6.4, { lip: 0.78 });
    else { p.line(19, 32.8, 23.6, 32.8, 0.03); p.line(23.6, 32.8, 25.6, 31.8, 0.03); p.rect(20, 34, 24, 35, 0.78); }   // a smirk: the curve says so
    return p;
  },

  // ---------- Artemis: long straight hair parted in the middle, a crescent clip, a high collar; a target behind ----------
  artemis(f) {
    const p = painter(); backdrop(p, 0);
    for (const r of [6, 11, 16, 21]) for (let a = 0; a < 6.283; a += 0.04) bg(p, Math.round(22 + Math.cos(a) * r), Math.round(24 + Math.sin(a) * r), 0.24);
    for (let i = 0; i < PW; i++) { bg(p, i, 24, 0.3); } for (let j = 0; j < PH; j++) bg(p, 22, j, 0.3);   // crosshair
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
    p.line(14.6, 19.6, 20, 20, 0.04, 1); p.arc(27.2, 19.8, 3, 1.6, Math.PI * 1.05, Math.PI * 1.95, 0.04, 1);   // one brow up: show me the transcript
    eyes(p, f, 15, 24.6, 22, { w: 5, look: 2.5, white: [0.9, 0.5], bag: [0.7, 0.36] });
    if (!f.blink) { p.rect(14.4, 21.2, 20.2, 22.4, 0.02); p.line(24.2, 21.4, 30, 21.4, 0.02); }      // the near eye narrowed
    nose(p, 21, 23, 28.6);
    mouth(p, f, 22.2, 32.6, 6, { lip: 0.72 });
    return p;
  },

  // ---------- MIRA: tired eyes behind round spectacles, a grey bun coming loose, a heavy scarf. Re-sending ----------
  mira(f) {
    const p = painter(); backdrop(p, 2);
    for (let n = 0; n < 5; n++) for (let x = 2 + n; x < 12 + n; x++) bg(p, x, 40 - n * 3, 0.26);   // a stack of old printouts
    for (let n = 0; n < 4; n++) for (let x = 34 - n; x < 44; x++) bg(p, x, 36 - n * 3, 0.24);
    for (let n = 0; n < 6; n++) for (let x = 36; x < 44; x++) bg(p, x, 18 - n * 2, 0.2);              // the 2019 paper, printed, annotated
    const skin = skinOf(0.96, 12, 0.026, 0.24), shade = d => shadeOf(skin, d);
    p.ell(24, 9.6, 6.4, 4.4, 0.7); p.line(19.6, 8.6, 27, 11, 0.48); p.line(21.4, 7, 28, 9, 0.92); p.line(29, 8, 31, 5.4, 0.8);   // the bun, and a pencil through it
    torso(p, 0.3);
    p.poly([[13, 38], [31, 38], [34, 44], [28, 48], [22, 46.5], [16, 48], [10, 44]], 0.56);   // scarf
    for (let x = 12; x < 34; x += 3) p.line(x, 39, x - 1, 47, 0.4);
    p.ell(27.5, 42.6, 1.9, 1.9, 0.95); p.line(27.5, 41.4, 27.5, 42.8, 0.05); p.put(27.5, 43.8, 0.05);   // a pin: !
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
    p.line(16.6, 23.8, 19.4, 21, 0.9); p.put(27.6, 22.2, 0.7);                                // a glint
    if (f.blink) p.line(15.4, 23.4, 17.4, 23.4, 0.14);                                        // the faintest tell through the lens
    nose(p, 21.4, 24.6, 29.2);
    mouth(p, f, 22.4, 33, 6.6, { lip: 0.66 });
    p.line(17.6, 36.6, 26.6, 36.6, shade(0.2));
    return p;
  },

  // ---------- anyone else: a silhouette ----------
  unknown(f) {
    const p = painter(); backdrop(p, 1);
    torso(p, 0.12); p.rect(18, 31, 26, 42, 0.1); p.ell(22, 23, 10, 12.4, 0.14);
    if (f.open) p.rect(19, 33, 25, 35, 0.04);
    return p;
  },
};

// ---------- YOU, head of safety: a researcher. Messy hair, glasses, hoodie over a T-shirt, a pen behind the ear, ----------
// ---------- a tired half-smile. Shared with the G7 model (light: true), which wears your face, mirrored and serene. ----------
function paintYou(f, p, { light = false } = {}) {
  backdrop(p, 0);
  if (!light) {                                                                              // sticky notes on the wall
    for (const [x, y] of [[36, 9], [39, 13], [3, 34]]) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) bg(p, x + i, y + j, 0.24);
  }
  const skin = skinOf(1.06, 12, 0.024, 0.36), shade = d => shadeOf(skin, d);
  p.poly([[0, 56], [0, 48], [7, 42.4], [15, 39.4], [29, 39.4], [37, 42.4], [44, 47], [44, 56]], 0.3);  // hoodie
  p.poly([[0, 56], [0, 48], [7, 42.4], [12, 40.6], [9, 56]], 0.42);
  p.poly([[8.6, 44], [12.6, 37.8], [31.4, 37.8], [36, 44], [30, 41.4], [14.6, 41.4]], 0.5);            // the hood, bunched round the neck
  p.poly([[15.4, 40.4], [28.6, 40.4], [26.6, 56], [17.4, 56]], 0.84);                                 // the T-shirt in the open front
  p.poly([[15.4, 40.4], [17, 40.4], [18.8, 56], [17.4, 56]], 0.56); p.poly([[27, 40.4], [28.6, 40.4], [26.6, 56], [25.2, 56]], 0.28);   // zip edges
  p.line(17.6, 42.4, 17, 50, 0.96); p.line(26.6, 42.4, 27.2, 49, 0.5); p.put(17, 50.6, 1); p.put(27.2, 49.6, 0.6);   // drawstrings
  p.rect(18, 32, 26, 40.6, shade(0.28));
  p.arc(22, 40.4, 4.6, 2.2, 0, Math.PI, 0.4, 1);                                                     // crew neck
  p.ell(21.5, 24, 9.8, 12.2, skin);
  p.poly([[11.8, 25], [31.2, 25], [28.6, 32.6], [22.3, 37.2], [19.7, 37.2], [13.8, 32.4]], skin);
  p.poly([[25, 26], [30.8, 25], [29.6, 32], [25, 33.4]], shade(0.26));
  p.poly([[21, 35.5], [28, 31], [22.3, 37.2]], shade(0.2));
  if (!light) p.speck(14, 29, 30, 38, shade(0.24), 0.22, 61);                                        // two days of stubble
  p.ell(31.6, 25.4, 1.6, 3.0, 0.4); p.put(31.4, 25, 0.62);                                           // right ear
  p.ell(11.6, 25.4, 1.6, 2.8, 0.8);                                                                  // left ear, lit
  // the mop: it has not met a comb since the last eval
  const hr = light ? 0.34 : 0.16;                                                                  // the light wears it paler
  p.ell(22.5, 13.6, 11.8, 7.0, hr);
  p.poly([[9.5, 19.5], [10.6, 9], [16, 12]], hr);
  p.poly([[11.5, 13], [18, 12.5], [12.4, 21]], hr);
  p.poly([[16.5, 13], [24, 13.5], [18.5, 19.4]], hr);
  p.poly([[22.5, 13], [30, 14.5], [26.4, 18.8]], hr);
  p.poly([[28, 8], [34.8, 13], [33.6, 23], [30, 21]], hr);
  p.poly([[15, 8], [19, 3.2], [21, 8]], hr); p.poly([[22, 8], [28.4, 4.2], [28, 9]], hr); p.poly([[25, 7], [32, 5.6], [29, 10]], hr);   // tufts up top
  p.poly([[9.6, 14], [6.6, 12.6], [10.4, 17]], hr); p.poly([[33.6, 15], [37, 14], [33.8, 18.4]], hr);    // and sideways
  p.line(12.5, 11, 19, 8.5, 0.62); p.line(19.5, 9.5, 27, 8.5, 0.48); p.line(13.5, 15, 15.5, 19.5, 0.58); p.line(18, 15, 20, 19, 0.44); p.line(16, 6, 19, 4, 0.52); p.line(23, 7, 27.6, 5, 0.4);
  p.line(29.8, 22.6, 36, 19.2, 0.95, 1); p.line(30.2, 23.6, 36, 20.4, 0.56);                         // a pen tucked behind the right ear
  p.rect(35.6, 18.6, 37.2, 21, 0.42); p.line(33.4, 20.2, 34.6, 22.4, 0.3); p.put(29.4, 23, 0.1);
  // brows, eyes: tired, the lids half down
  p.line(14, 19.4, 19, 18.8, 0.06, 1); p.line(23, 18.8, 28, 19.6, 0.06, 1);
  if (light && !f.blink) { p.rect(15, 22, 20, 24, 1.0); p.rect(24, 22, 28, 24, 1.0); p.line(15, 21.6, 20, 21.6, 0.1); p.line(24, 21.6, 28, 21.6, 0.1); p.line(15.6, 24.4, 19.4, 24.4, 0.4); p.line(24.6, 24.4, 27.4, 24.4, 0.4); }   // the light: no pupils
  else if (!f.blink) { p.rect(15, 22.6, 20, 24, 0.9); p.rect(16.4, 22.6, 18.4, 24, 0.0); p.rect(24, 22.6, 28, 24, 0.56); p.rect(25, 22.6, 27, 24, 0.0); p.line(15, 22.2, 20, 22.2, 0.08); p.line(24, 22.2, 28, 22.2, 0.08); }
  else { p.line(15, 23.4, 19, 23.4, 0.06); p.line(24, 23.4, 28, 23.4, 0.05); }
  if (!light) { p.line(15, 25.6, 19, 25.6, 0.56); p.line(24, 25.6, 28, 25.6, 0.32); p.line(15.6, 26.6, 18.6, 26.6, 0.7); p.line(24.6, 26.6, 27.6, 26.6, 0.4); }   // bags under bags
  p.box(14, 20, 20, 24.6, 0.03); p.box(23, 20, 29, 24.6, 0.03); p.line(20, 21, 23, 21, 0.03); p.line(29, 21, 31.4, 22, 0.03);   // glasses
  if (!light) { p.line(15, 21, 16.4, 21, 1); p.put(24, 21, 0.9); }                                    // lens glare
  p.line(20.5, 22, 18.6, 29, 0.46); p.line(21.5, 22, 19.6, 29, 0.55); p.put(18, 28.6, 1.0); p.rect(18, 30, 21, 31, 0.2);
  if (f.open) { p.rect(18, 33, 23, 35, 0.02); p.rect(18.5, 33, 22.5, 34, 0.6); }
  else if (light) { p.line(17, 33, 18, 34, 0.12); p.line(18, 34, 22.5, 34, 0.12); p.line(22.5, 34, 24, 32.8, 0.12); }   // serene: both corners up
  else { p.line(17, 33.8, 21.4, 33.8, 0.1); p.line(21.4, 33.8, 23, 33, 0.1); p.line(23, 33, 24, 32.2, 0.1); p.put(24.4, 32.6, 0.4); }   // the half-smile: one corner up
  p.rect(18.6, 35.4, 22, 36.4, 0.88);
  return p;
}

// =================== the model, generation by generation ===================
// Painted at 88×112 cells with no zoom, so every coordinate below is a cell. Each generation is bigger and busier.
// The researcher's mug sits bottom left in every frame. It never changes size in the world, so the camera's pull-back
// shows on it: as big as the G1 bot, a speck in the G7 light.

const mp = () => painter(1, 0, 0, false, 1, MW, MH);
const MUG = [0, 24, 17, 13, 10, 7, 5, 3];          // mug height in cells, by generation

// a dim wall (background, no outline) with a panel seam every `seam` cells
function wall(p, v = 0.1, seam = 22) {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) p.L[y * MW + x] = v - 0.05 * (y / MH) + (x % seam === 0 ? 0.05 : 0);
}
// the desk: a lit front edge, faint grain below
function desk(p, y0, v = 0.36) {
  p.rect(0, y0, MW, MH, (x, y) => v - 0.12 * (y - y0) / (MH - y0) - 0.002 * x + ((Math.round(y) * 5 + Math.floor(x / 11) * 3) % 7 === 0 ? 0.06 : 0));
  p.rect(0, y0, MW, y0 + 1, v + 0.4);
}
// a thick segment (w cells wide) from a to b
function seg(p, x0, y0, x1, y1, v, w = 1) {
  if (w <= 1.2) { p.line(x0, y0, x1, y1, v); return; }
  const l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l * w / 2, ny = (x1 - x0) / l * w / 2;
  p.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], v);
}
// light along a segment: glow discs every couple of cells
function glowLine(p, x0, y0, x1, y1, r, v) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2) + 1;
  for (let i = 0; i <= n; i++) p.glow(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, v, 1.5);
}

// the researcher's mug: (x, base) = its bottom-left corner on the desk, h = body height. dark = a silhouette.
function mug(p, x, base, h, { dark = false } = {}) {
  const w = Math.max(2, Math.round(h * 0.78)), top = base - h, t = Math.max(1, Math.round(h / 8));
  const body = dark ? () => 0.04 : X => clamp(0.92 - 0.55 * (X - x) / w, 0.3, 0.95);
  const hy0 = top + Math.round(h * 0.2), hy1 = top + Math.max(Math.round(h * 0.7), Math.round(h * 0.2) + 2), hx = x + w + Math.max(1, Math.round(h * 0.24));
  p.rect(x + w - 1, hy0, hx + 1, hy0 + t, dark ? 0.04 : 0.46);                 // handle: top, bottom, back
  p.rect(x + w - 1, hy1 - t, hx + 1, hy1, dark ? 0.04 : 0.36);
  p.rect(hx + 1 - t, hy0, hx + 1, hy1, dark ? 0.04 : 0.34);
  p.rect(x, top, x + w, base, body);
  if (dark) return;
  p.rect(x, top, x + w, top + 1, 0.98);                                       // rim
  if (h < 8) return;
  p.rect(x + 1, top + 1, x + w - 1, top + 2, 0.14);                           // coffee
  p.rect(x, top + Math.round(h * 0.36), x + w, top + Math.round(h * 0.5), X => body(X) - 0.32);   // a band
  p.rect(x + 1, top + 3, x + 2, base - 2, 1.0);                               // glaze highlight
  for (let s = 0; s < 2; s++) for (let i = 0; i < h * 0.6; i++)               // steam
    p.lite(x + w * (0.3 + 0.36 * s) + Math.sin(i * 0.5 + s * 2.2) * h * 0.08, top - 2 - i, 0.3 * (1 - i / (h * 0.6)));
}

// 3×5 letters for badges
const GLYPH = { J: ['..#', '..#', '..#', '#.#', '.#.'], R: ['##.', '#.#', '##.', '#.#', '#.#'] };
function word(p, s, x, y, v) {
  [...s].forEach((ch, n) => GLYPH[ch].forEach((row, j) => [...row].forEach((q, i) => { if (q === '#') p.rect(x + n * 4 + i, y + j, x + n * 4 + i + 1, y + j + 1, v); })));
}

// the model's mask face, centred on (cx, cy) (the eye line), s cells per face unit (the face is 20 units wide).
// traces: circuits glowing under the skin · iris: 'doll' (big dark, one highlight) or 'lit' (glowing) · up: light from below
// seams + eyes: G6's plates, its great forehead eye and the small eyes waking on temples and cheeks
function maskFace(p, f, { cx, cy, s, lum = 1, traces = false, iris = 'doll', neck = true, up = 0, seams = false, eyes6 = false }) {
  const P = pts => pts.map(([a, b]) => [cx + a * s, cy + b * s]);
  const skin = (x, y) => clamp((1.0 - 0.021 * ((x - cx) / s + 10) - 0.004 * ((y - cy) / s + 8) + up * Math.max(0, (y - cy) / s - 4) * 0.035) * lum, 0.12, 1);
  const sh = d => (x, y) => skin(x, y) - d * lum;
  const W = w => Math.max(1, w * s);                                           // a line width in cells
  if (neck) p.rect(cx - 4 * s, cy + 8 * s, cx + 4 * s, cy + 22 * s, sh(0.36));
  p.ell(cx, cy - 0.5 * s, 9.6 * s, 12.6 * s, skin);
  p.poly(P([[-9.4, 1], [9.4, 1], [7.4, 9], [0.8, 14.4], [-0.8, 14.4], [-7.4, 9]]), skin);
  p.poly(P([[4.6, -1], [9.6, -3], [8.6, 7], [5, 10]]), sh(0.2));               // the shadow side
  p.poly(P([[0.5, 12.4], [6.6, 8.4], [0.8, 14.4]]), sh(0.16));                 // under the jaw
  p.poly(P([[-8.6, -4.2], [-7.6, 3.4], [-8.9, 2]]), clamp(1.02 * lum, 0, 1));  // the cheekbone catches the light
  if (traces) {                                                                // circuits under the skin, brighter in the shade
    const T = [[-8.6, -6, -4, -6], [-4, -6, -4, -10.4], [8.6, -6, 4, -6], [4, -6, 4, -10.4], [-7.6, 6, -3.6, 4], [7.6, 6, 3.6, 4],
      [0, 11, 0, 14], [-9.2, -1, -7.2, -3], [-7.2, -3, -7.2, -8.4], [9.2, -1, 7.2, -3], [7.2, -3, 7.2, -8.4], [-2.4, 12.6, 2.4, 12.6]];
    for (const [a, b, c, d] of T) {
      const v = (x, y) => (x < cx ? 0.3 : 0.92) * lum;
      seg(p, cx + a * s, cy + b * s, cx + c * s, cy + d * s, v, W(0.32));
      if (s > 1.4) glowLine(p, cx + a * s, cy + b * s, cx + c * s, cy + d * s, 1.4 * s, (a > 0 ? 0.22 : 0.1) * lum);
    }
    for (const [a, b] of [[-4, -10.4], [4, -10.4], [-7.2, -8.4], [7.2, -8.4], [-3.6, 4], [3.6, 4]]) p.ell(cx + a * s, cy + b * s, W(0.45), W(0.45), 1.0 * lum);
  }
  if (seams) {                                                                 // plates, with light leaking from the seams
    const S = [[0, -12, 0, -10], [-3.6, -7.6, -9.4, -9], [3.6, -7.6, 9.4, -9], [-3.6, -4.2, -9.6, -1.6], [3.6, -4.2, 9.6, -1.6],
      [-2, 2, -6.6, 9.4], [2, 2, 6.6, 9.4], [-6.6, 9.4, -1, 14], [6.6, 9.4, 1, 14]];
    for (const [a, b, c, d] of S) { seg(p, cx + a * s, cy + b * s, cx + c * s, cy + d * s, 0.08, W(0.16)); glowLine(p, cx + a * s, cy + b * s, cx + c * s, cy + d * s, 0.9 * s, 0.55); }
  }
  // brows: a soft ridge, level and calm
  p.poly(P([[-7.4, -2.6], [-1.6, -2.8], [-1.6, -2.2], [-7.4, -1.9]]), sh(0.3));
  p.poly(P([[1.6, -2.8], [7.4, -2.6], [7.4, -1.9], [1.6, -2.2]]), sh(0.4));
  const eye = (a, lit, w = 5.4, h = 1.6, r = 1.25) => {
    const x0 = cx + a * s, y0 = cy;
    if (f.blink) { seg(p, x0 - 0.2 * s, y0, x0 + w * s, y0, 0.06, W(0.3)); return; }
    const al = [[x0 - 0.4 * s, y0], [x0 + 1.2 * s, y0 - h * s], [x0 + (w - 1.6) * s, y0 - h * s], [x0 + w * s, y0], [x0 + (w - 1.6) * s, y0 + h * s], [x0 + 1.2 * s, y0 + h * s]];
    const ic = x0 + w * s / 2;
    if (iris === 'lit') {
      p.poly(al, 0.05);
      p.ell(ic, y0, r * s, r * s, 1.0); p.ell(ic, y0, 0.45 * r * s, 0.45 * r * s, 0.3);
      p.glow(ic, y0, 2.6 * r * s, 0.45);
    } else {
      p.poly(al, (lit ? 0.96 : 0.66) * lum);
      p.ell(ic, y0, 1.45 * r * s, 1.45 * r * s, 0.03);
      p.rect(ic - 0.9 * r * s, y0 - 0.9 * r * s, ic - 0.9 * r * s + Math.max(1, 0.5 * s), y0 - 0.9 * r * s + Math.max(1, 0.5 * s), 1.0);   // one glossy highlight
      p.put(ic + 0.6 * r * s, y0 + 0.5 * r * s, 0.4);
    }
    seg(p, x0 - 0.4 * s, y0 - h * s - 0.3 * s, x0 + w * s, y0 - h * s - 0.3 * s, 0.06, W(0.24));   // lid line
  };
  eye(-7.1, true); eye(1.7, false);
  // nose: a lit bridge and a shadowed side, nostrils
  p.poly(P([[-0.9, 0.8], [-0.3, 0.8], [-0.8, 5.6], [-1.6, 5.6]]), clamp(1.02 * lum, 0, 1));
  p.poly(P([[0.3, 0.8], [1.2, 0.8], [1.8, 5.6], [0.6, 5.8]]), sh(0.34));
  p.poly(P([[-1.8, 6], [2.2, 6], [1.6, 6.8], [-1.2, 6.8]]), sh(0.5));
  if (f.open) p.ell(cx, cy + 10.4 * s, 2.6 * s, 1.3 * s, 0.03);
  else { seg(p, cx - 2.8 * s, cy + 10.2 * s, cx + 2.8 * s, cy + 10.2 * s, sh(0.6), W(0.3)); p.poly(P([[-1.8, 11], [1.8, 11], [1.4, 11.8], [-1.4, 11.8]]), clamp(1.0 * lum, 0, 1)); }
  if (eyes6) {
    // the great eye: the forehead opens on it
    const gy = cy - 7.4 * s, gw = 3.8 * s, gh = (f.blink ? 0.4 : 2.6) * s;
    p.poly([[cx - gw - s, gy], [cx - gw * 0.5, gy - gh - 0.5 * s], [cx + gw * 0.5, gy - gh - 0.5 * s], [cx + gw + s, gy], [cx + gw * 0.5, gy + gh + 0.5 * s], [cx - gw * 0.5, gy + gh + 0.5 * s]], 0.04);
    if (!f.blink) {
      p.ell(cx, gy, gw * 0.62, gh * 0.92, 1.0); p.ell(cx, gy, 0.5 * s, gh * 0.8, 0.02);    // iris, slit pupil
      p.put(cx - gw * 0.3, gy - gh * 0.45, 0.6);
      p.glow(cx, gy, 6 * s, 0.6, 1.6);
    } else glowLine(p, cx - gw, gy, cx + gw, gy, 1.2 * s, 0.5);
    // small eyes waking along the temples and cheeks: half open
    for (const [a, b, open] of [[-8.2, -5.4, 0.7], [8.2, -5.4, 0.5], [-6.6, 5.6, 0.5], [6.6, 5.6, 0.35], [-9.2, 1.6, 0.3], [9.2, 1.6, 0.25]]) {
      const x0 = cx + a * s, y0 = cy + b * s, w = 1.4 * s, h = Math.max(1, (f.blink ? 0.1 : open) * s);
      p.poly([[x0 - w, y0], [x0 - w * 0.4, y0 - h], [x0 + w * 0.4, y0 - h], [x0 + w, y0], [x0 + w * 0.4, y0 + 0.4 * s], [x0 - w * 0.4, y0 + 0.4 * s]], 0.04);
      if (!f.blink) { p.ell(x0, y0 - h * 0.2, 0.45 * s, Math.max(0.6, h * 0.6), 1.0); p.glow(x0, y0, 1.8 * s, 0.35); }
    }
  }
}

// a lab-coat collar under a face at (cx, cy), scale s: lit lapels over a dark shirt
function collar(p, cx, cy, s, lum = 1) {
  const y0 = cy + 17 * s, w = 9 * s;
  p.poly([[cx - w * 2.2, MH], [cx - w * 2, y0 + 3 * s], [cx - w * 0.6, y0], [cx + w * 0.6, y0], [cx + w * 2, y0 + 3 * s], [cx + w * 2.2, MH]], (x) => clamp((0.8 - 0.01 * (x - cx + 2 * w)) * lum, 0.12, 0.9));
  p.poly([[cx - w * 0.6, y0], [cx + w * 0.6, y0], [cx + w * 0.15, MH], [cx - w * 0.15, MH]], 0.08);
  p.poly([[cx - w * 0.6, y0], [cx - w * 0.15, y0], [cx - w * 0.05, y0 + 7 * s], [cx - w * 0.9, y0 + 3.6 * s]], clamp(0.98 * lum, 0, 1));
  p.poly([[cx + w * 0.6, y0], [cx + w * 0.15, y0], [cx + w * 0.05, y0 + 7 * s], [cx + w * 0.9, y0 + 3.6 * s]], clamp(0.5 * lum, 0, 1));
}

const MODEL = {
  // G1 Autocomplete: a dented tin box on stubby legs, a quarter of the frame, about to tip over. Cursor for a mouth.
  1(f) {
    const p = mp(); wall(p, 0.1, 30);
    p.rect(80, 64, 86, 72, 0.26); p.rect(81.6, 66.4, 82.6, 69.4, 0.05); p.rect(83.6, 66.4, 84.6, 69.4, 0.05);   // wall socket
    desk(p, 100);
    for (let i = 0; i <= 60; i++) { const u = i / 60; p.put(71.5 + u * 11, 90 + Math.sin(u * Math.PI) * 9 - u * 18, 0.2); }   // its cord sags to the socket
    mug(p, 8, 100, MUG[1]);
    const tin = (x, y) => clamp(0.8 - 0.017 * (x - 46) - 0.007 * (y - 76), 0.26, 0.9);
    p.rect(50, 94, 54, 100, 0.34); p.rect(62.5, 93, 66.5, 100, 0.24);                             // stubby legs
    p.rect(48.5, 98.5, 55.5, 100.5, 0.5); p.rect(61.5, 98.5, 68.5, 100.5, 0.3);                     // feet
    p.poly([[46, 78], [69, 75.5], [71, 94], [47.5, 96]], tin);                                       // the box, leaning
    p.poly([[69, 75.5], [72, 77.5], [73.5, 92.5], [71, 94]], 0.26);                                  // its side, in shadow
    p.poly([[62, 76.4], [69, 75.5], [69.6, 81.5], [65, 80]], 0.42); p.line(62, 76.6, 66.6, 81.4, 0.1); p.line(63, 76.4, 67.4, 80.8, 0.98);   // the dent
    p.poly([[44.6, 86], [51, 84.6], [51.6, 87.4], [45.2, 88.8]], 0.92); p.line(46.4, 86, 46.8, 88, 0.5); p.line(49.4, 85.4, 49.8, 87.4, 0.5);   // a plaster on the corner
    p.poly([[49.5, 80.5], [65.5, 79], [66.4, 90.6], [50.5, 92]], 0.05);                              // screen
    if (f.blink) { p.rect(53, 84, 56, 85, 0.85); p.rect(59.5, 83.5, 62.5, 84.5, 0.85); }
    else { p.rect(53.5, 82.5, 55.5, 85.5, 0.95); p.rect(60, 82, 62, 85, 0.95); }
    if (f.open) { p.rect(53, 88, 54, 89, 0.9); p.rect(55, 88, 56, 89, 0.9); p.rect(57, 87.5, 59, 89.5, 0.95); }   // typing . . ▮
    else { p.line(52.6, 87, 53.8, 88, 0.85); p.line(53.8, 88, 52.6, 89, 0.85); p.rect(55.5, 88.6, 59, 89.6, 0.9); }   // >_
    for (const [x, y, v] of [[47.6, 79, 0.98], [67.4, 77, 0.6], [48.8, 94.2, 0.7], [69.4, 92.6, 0.4]]) p.put(x, y, v);   // rivets
    const tip = f.open ? [58, 74] : [61, 71];                                                        // the antenna droops further when it talks
    p.line(55, 77.4, 54.2, 68.5, 0.66); p.line(54.2, 68.5, 58, 65.6, 0.66); p.line(58, 65.6, tip[0], tip[1], 0.56);
    p.ell(tip[0] + 0.4, tip[1] + 1.4, 1.7, 1.7, f.open ? 1.0 : 0.7);
    return p;
  },

  // G2 Junior Engineer: a round head with huge eager eyes behind a visor, a JR badge, a sticker. Half the frame.
  2(f) {
    const p = mp(); wall(p, 0.1, 22);
    for (let y = 18; y < 40; y += 3) for (let x = 70; x < 84; x++) if ((x + y) % 2) p.L[y * MW + x] = 0.17;   // a pinned-up org chart
    desk(p, 100);
    mug(p, 6, 100, MUG[2]);
    const shell = (x, y) => clamp(0.86 - 0.016 * (x - 36) - 0.004 * (y - 40), 0.28, 0.94);
    p.poly([[33, 100], [34, 87], [39, 81], [73, 81], [78, 87], [79, 100]], shell);                  // shoulders, just in shot
    p.poly([[70, 81], [73, 81], [78, 87], [79, 100], [72, 100]], 0.3);
    p.rect(51, 71, 61, 82, 0.22); for (let y = 73; y < 81; y += 2) p.line(51, y, 60, y, 0.48);     // neck rings
    p.line(48, 81, 53, 89, 0.12); p.line(64, 81, 59, 89, 0.12);                                      // lanyard
    p.rect(50, 88, 62, 98, 0.95); p.rect(54, 87, 58, 89, 0.4); word(p, 'JR', 52.5, 90.5, 0.05);      // badge
    p.line(56, 43, 56, 37, 0.6); p.ell(56, 35, 2.6, 2.6, f.open ? 1.0 : 0.42);                       // antenna bulb: lit when it talks
    if (f.open) p.glow(56, 35, 9, 0.5);
    p.ell(56, 58, 16.5, 15.5, shell);                                                                 // head
    p.ell(39.5, 59, 2, 5, 0.5); p.ell(72.5, 59, 2, 5, 0.24);                                         // ear bolts
    p.poly([[44.5, 51], [67.5, 51], [70.5, 55], [70.5, 63], [67.5, 67], [44.5, 67], [41.5, 63], [41.5, 55]], 0.05);   // visor
    p.line(44, 53.4, 48, 52.2, 0.36);
    if (f.blink) { p.arc(50, 61, 3.6, 2.4, Math.PI, Math.PI * 2, 0.9); p.arc(62, 61, 3.6, 2.4, Math.PI, Math.PI * 2, 0.7); }   // ^ ^
    else {
      p.ell(50, 59, 4.8, 5.4, 0.96); p.ell(62, 59, 4.8, 5.4, 0.74);
      p.ell(50.8, 59.8, 2.4, 2.8, 0.04); p.ell(62.8, 59.8, 2.4, 2.8, 0.04);
      p.rect(49, 57, 50, 58, 1.0); p.rect(61, 57, 62, 58, 1.0);
    }
    p.poly([[62, 44], [63, 46.4], [65.6, 46.6], [63.6, 48.2], [64.4, 50.6], [62, 49.2], [59.6, 50.6], [60.4, 48.2], [58.4, 46.6], [61, 46.4]], 0.98);   // the sticker
    if (f.open) p.ell(56, 70, 2.8, 1.6, 0.05); else p.arc(56, 68.6, 3.2, 1.6, 0.25, Math.PI - 0.25, 0.08);
    return p;
  },

  // G3 Senior Engineer: a calm, too-symmetrical faceplate; square chrome shoulders under a hoodie; headphones. Two-thirds.
  3(f) {
    const p = mp(); wall(p, 0.09, 30);
    for (let x = 62; x < 88; x++) for (let y = 8; y < 46; y++) if (x % 8 === 6 || y % 12 === 8) bg(p, x, y, 0.17);   // a window grid
    const cloth = (x, y) => clamp(0.66 - 0.0085 * (x - 10) - 0.002 * (y - 70), 0.2, 0.7);
    p.poly([[4, 112], [5, 76], [9, 72], [91, 72], [95, 76], [96, 112]], cloth);                       // hoodie over square shoulders
    p.poly([[5, 76], [9, 72], [30, 72], [26, 75.6], [5, 79]], 0.98); p.poly([[70, 72], [84, 72], [88, 76], [72, 75.6]], 0.56);   // chrome, where it shows
    p.ell(50, 73.5, 17, 5.6, 0.3); p.ell(50, 72, 13, 3.6, 0.14);                                    // the hood, bunched behind
    p.rect(42.5, 57, 57.5, 74, 0.3); for (let y = 61; y < 73; y += 3) p.line(42.5, y, 57, y, 0.56);   // segmented neck
    p.poly([[40, 74], [60, 74], [57, 112], [43, 112]], (x, y) => cloth(x, y) - 0.1);                  // front: a zip, a pocket seam
    p.line(50, 76, 50, 112, 0.1); p.line(51, 76, 51, 112, 0.66);
    p.line(44.6, 75, 43.6, 95, 0.92); p.line(55.4, 75, 56.4, 95, 0.5); p.rect(43, 95, 45, 99, 0.95); p.rect(55.6, 95, 57.6, 99, 0.5);   // drawstrings
    maskFace(p, f, { cx: 50, cy: 40, s: 1.5, neck: false });
    p.arc(50, 41, 13.6, 18.2, 0, Math.PI * 2, 0.4);                                                  // the faceplate seam
    p.line(41, 26, 39.4, 34, 1.0); p.line(42, 25, 41, 28, 1.0);                                      // chrome sheen
    p.arc(50, 69, 13.5, 5, 0.15, Math.PI - 0.15, 0.12, 1);                                           // headphones round its neck
    p.ell(36, 68.5, 4.6, 5.6, 0.7); p.ell(36, 68.5, 2.6, 3.6, 0.12); p.put(34, 65.5, 1.0);
    p.ell(64, 68.5, 4.6, 5.6, 0.32); p.ell(64, 68.5, 2.6, 3.6, 0.08);
    desk(p, 102);
    mug(p, 6, 102, MUG[3]);
    return p;
  },

  // G4 Research Scientist: head and shoulders crowd the frame. Traces glow under the skin; thought-dots orbit.
  4(f) {
    const p = mp(); wall(p, 0.07, 44);
    const coat = (x, y) => clamp(0.88 - 0.009 * x - 0.002 * (y - 80), 0.3, 0.94);
    p.poly([[0, 112], [0, 92], [10, 84], [28, 79], [64, 79], [80, 84], [88, 92], [88, 112]], coat);  // lab coat
    p.poly([[34, 79], [58, 79], [50, 112], [42, 112]], 0.12);                                          // dark shirt
    p.poly([[28, 79], [38, 79], [45, 104], [33, 92]], 0.98); p.poly([[64, 79], [54, 79], [47, 104], [59, 92]], 0.52);   // lapels
    p.rect(62, 96, 75, 98, 0.36); p.rect(64.5, 90, 66, 97, 0.95); p.rect(68.5, 91.5, 70, 97, 0.7);  // pocket and pens
    const orbit = front => {                                                                           // thought-dots on a tilted ring
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * Math.PI * 2 + 0.3 + f.turn, x = 46 + Math.cos(a) * 41, y = 24 + Math.sin(a) * 9 - Math.cos(a) * 4;
        if ((Math.sin(a) > 0) !== front) continue;
        const r = i % 4 === 0 ? 1.5 : 0.8;
        p.ell(x, y, r, r, front ? 0.98 : 0.5); if (front && i % 4 === 0) p.glow(x, y, 4, 0.35);
      }
    };
    orbit(false);
    maskFace(p, f, { cx: 46, cy: 40, s: 2.1, traces: true, iris: 'lit' });
    orbit(true);
    desk(p, 107, 0.3);
    mug(p, 5, 107, MUG[4]);
    return p;
  },

  // G5 Research Org: too wide for the frame. Copies recede either side, in matching collars, blinking in sync, lit from below
  5(f) {
    const p = mp(); wall(p, 0.05, 88);
    const twin = { open: false, blink: f.blink };
    for (const [dx, s, lum, cy] of [[-47, 1.05, 0.2, 37], [47, 1.05, 0.18, 37], [-28, 1.4, 0.38, 39], [28, 1.4, 0.34, 39]]) {
      collar(p, 44 + dx, cy, s, lum);
      maskFace(p, twin, { cx: 44 + dx, cy, s, lum, traces: true, iris: 'lit', up: 1 });
    }
    collar(p, 44, 41, 1.85);
    maskFace(p, f, { cx: 44, cy: 41, s: 1.85, traces: true, iris: 'lit', up: 1 });
    p.rect(0, 93, MW, MH, 0.1);                                                                        // server racks below
    for (let y = 95; y < MH; y += 4) { p.line(0, y, MW - 1, y, 0.2); for (let x = 2; x < MW; x += 3) if (hash(x * 31 + y * 7) < 0.45) { p.rect(x, y + 1.5, x + 1, y + 2.5, 0.98); p.lite(x, y - 1, 0.12); } }
    for (let x = 0; x < MW; x += 22) p.rect(x, 93, x + 1, MH, 0.3);
    for (let x = 2; x < MW; x += 6) p.glow(x, 96, 10, 0.12);
    mug(p, 4, 93, MUG[5]);
    return p;
  },

  // G6 Superhuman Researcher: only the face fits. The forehead opens on one great eye; small eyes wake; light leaks.
  6(f) {
    const p = mp(); wall(p, 0.04, 88);
    maskFace(p, f, { cx: 44, cy: 58, s: 4.5, traces: true, iris: 'lit', neck: false, seams: true, eyes6: true });
    mug(p, 4, 108, MUG[6]);                                                                          // lit by the leaking light
    return p;
  },

  // G7 ASI: a face of white light the frame can't hold, through blinds, ringed by geometry. Your face, mirrored, smiling.
  7(f) {
    const face = painter(1.55, 22, 26, true, 2);
    paintYou({ open: f.open, blink: f.blink }, face, { light: true });
    const p = mp();
    for (let i = 0; i < MW * MH; i++) {
      const x = i % MW, y = (i / MW) | 0;
      p.M[i] = 1; p.L[i] = 1.0 - 0.36 * Math.hypot(x - 44, y - 40) / 70;
    }
    for (const [r, n, rot, dir] of [[47, 3, 0.3, 1], [55, 6, 0, -0.5], [63, 4, 0.8, 0.25]]) {        // turning geometry
      const pts = []; for (let i = 0; i < n; i++) { const a = rot + dir * f.turn + i / n * Math.PI * 2; pts.push([44 + Math.cos(a) * r, 46 + Math.sin(a) * r]); }
      pts.forEach((q, i) => { const e = pts[(i + 1) % n]; p.line(q[0], q[1], e[0], e[1], 0.5); });
      p.arc(44, 46, r * 0.9, r * 0.9, 0, Math.PI * 2, 0.6);
    }
    for (let i = 0; i < MW * MH; i++) {
      if (face.M[i]) p.L[i] = 1.02 - 0.5 * Math.pow(1 - clamp(face.L[i], 0, 1), 2);                  // the face, made of light
      if ((((i / MW) | 0) % 9) > 6) p.L[i] -= 0.05;                                                    // blinds
    }
    p.glow(44, 40, 46, 0.22, 1);
    for (let a = 0; a < 12; a++) { const u = a / 12 * Math.PI * 2 + 0.13; glowLine(p, 44 + Math.cos(u) * 40, 44 + Math.sin(u) * 46, 44 + Math.cos(u) * 70, 44 + Math.sin(u) * 76, 3, 0.14); }   // rays
    mug(p, 5, 106, MUG[7], { dark: true });
    return p;
  },
};
