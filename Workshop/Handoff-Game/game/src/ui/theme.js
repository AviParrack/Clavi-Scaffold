// ===== Theme: colours, fonts and the pixel helpers every UI module draws with =====
// Colours live here and nowhere else. Modules read C.<token>; C is a live binding, so setTheme() can swap palettes.
// Lane colours, keyed by side: C.lane.ext / C.lane.int (look a lane id up with R.sideOf). Portrait greens: C.face[0..7], dark to light.
// Draw in logical px (1200×660). Helpers snap to device pixels, so edges stay crisp at any scale.

// =================== palettes ===================

const SOLITON = {
  name: 'Soliton',
  bg: '#020504', pan: '#06100a', pan2: '#0a1810', hud: '#030805', black: '#000000',
  e0: '#12301d', e1: '#1d4d2e', e2: '#2c7a47', e3: '#46b86a',                        // rules and frames, dark → light
  g: '#a6ffbd', gm: '#5fe08a', gd: '#2f8650', gdd: '#1c5232', gl: '#c9ffd6',         // green ink: bright, mid, dim, dimmer, lit
  c: '#8ae9ff', cm: '#47bfe0', cd: '#2a809e', cdd: '#143e4d', cl: '#d2f6ff',         // cyan ink, same steps
  lcd: '#a3cc7c', lcdOff: '#97bf70', lcdOn: '#0f2a10', lcdMid: '#5e8248', lcdEdge: '#24381c',   // LCD glass and segments
  blu: '#1d38b4', bluHi: '#dfe4f4', bluRule: '#3550d0', wht: '#f3f6ff',              // the MSX dialog box
  r: '#ff4a3a', rm: '#c42a1d', rd: '#4a0f09', rdd: '#220604', rInk: '#200402', rLite: '#ffb0a6', rBack: '#1d0504',   // alarms only
  v: '#b99cff', vm: '#7d62d6', vd: '#33265e', vdd: '#140d28',                         // INTERNAL ANOMALY: cold violet
  gy: '#8a8f99', gy2: '#5a5f69', gy3: '#353941', gy4: '#1b1e23', gyHi: '#b9bec8', gyBody: '#2a2d34', amb: '#c98a2a',   // handset plastic
  grMin: '#143a20', grMaj: '#1f5c34',                                                 // EXTERNAL radar grid
  dotMin: '#1d5566', dotMaj: '#2a7088', dotX: '#3a8aa6',                              // INTERNAL blueprint lattice
  well: '#020504', segOff: '#0a1810', hatch: '#0a1810',                              // LCD wells, unlit 7-seg bars, locked hatching
  debug: '#ff4dff',                                                                   // ?debug=1 truth marks only
  lane: {
    ext: { acc: '#a6ffbd', mid: '#5fe08a', dim: '#2f8650', ddim: '#1c5232', text: '#b8ffc9', hot: '#effff3', lite: '#c9ffd6',
           field: '#030a06', bevel: ['#46b86a', '#000000', '#12301d'], glow: 'rgba(120,255,160,1)' },
    int: { acc: '#8ae9ff', mid: '#47bfe0', dim: '#2a809e', ddim: '#143e4d', text: '#c6f3ff', hot: '#eefcff', lite: '#d2f6ff',
           field: '#02080b', bevel: ['#47bfe0', '#000000', '#143e4d'], glow: 'rgba(120,225,255,1)' },
  },
  face: ['#010603', '#041709', '#0a2e15', '#155024', '#26783c', '#45a35c', '#7bd18f', '#c6f7cd'],
  // research branches (overlays.js cards): five hues that are neither alarm red nor the INTERNAL ANOMALY violet
  branch: { monitoring: '#8ae9ff', oversight: '#e8c46a', containment: '#b8c8f0', science: '#d4f07a', operations: '#a6ffbd' },
  // the three research work streams (config/cards.js STREAMS colours): card headers, the research panel
  stream: { monitoring: '#7fd1ff', control: '#ffd27f', lab: '#c79bff' },
  rs: '#d4f07a', rsm: '#9bbf3e', rsd: '#3e4f18', rsdd: '#1a220a',                     // research: badge, slim bar (lime)
  ambL: '#ffcf6a', ambD: '#4a3208', ambDD: '#1f1503',                                 // FALSE ALARM stamps, quota below, lamps
  lamp: { green: '#5fe08a', amber: '#ffb43a', red: '#ff4a3a', off: '#1c5232' },     // a lane tab's status lamp
  // CRT: a CSS layer over the canvas (style.css #crt), soft-light blended so the lines darken panels, barely letters
  crt: { line: 'rgba(0,0,0,0.12)', vignette: 'rgba(0,0,0,0.24)' },
};

// Untuned sketches of the other two codec looks (design/codec-mockups/variant-a.js, variant-b.js). Same keys.
const CODEC98 = {
  ...SOLITON, name: "Codec '98",
  bg: '#020805', pan: '#05140b', pan2: '#07170e', hud: '#020805', well: '#020805', segOff: '#07170e', hatch: '#07170e',
  e0: '#0c2a18', e1: '#13472a', e2: '#1e7444', e3: '#35b36a',
  g: '#8affc1', gm: '#5fe39a', gd: '#35b36a', gdd: '#1e7444', gl: '#c8ffe0',
  c: '#8affc1', cm: '#5fe39a', cd: '#35b36a', cdd: '#13472a', cl: '#c8ffe0',
  blu: '#04170c', bluHi: '#35b36a', bluRule: '#1e7444', wht: '#8affc1',
  r: '#ff3b3b', rm: '#9a2222', rd: '#4a0e0e', rdd: '#3a0a0a',
  branch: { monitoring: '#c8ffe0', oversight: '#8affc1', containment: '#5fe39a', science: '#b8ffd6', operations: '#35b36a' },
  lane: {
    ext: { ...SOLITON.lane.ext, acc: '#8affc1', mid: '#5fe39a', dim: '#35b36a', ddim: '#13472a', text: '#b8ffd6', field: '#07170e' },
    int: { ...SOLITON.lane.int, acc: '#8affc1', mid: '#5fe39a', dim: '#1e7444', ddim: '#0c2a18', text: '#8affc1', field: '#020a06' },
  },
};
const TRANSCEIVER90 = {
  ...SOLITON, name: "Transceiver '90",
  bg: '#000000', pan: '#161616', pan2: '#2f2f2f', hud: '#000000', well: '#000000', segOff: '#2f2f2f', hatch: '#2f2f2f',
  e0: '#2f2f2f', e1: '#6d6d6d', e2: '#b7b7b7', e3: '#ffffff',
  g: '#8fe08a', gm: '#3fae4a', gd: '#1f6b2c', gdd: '#0f3d17', gl: '#ffffff',
  blu: '#1531a8', bluHi: '#ffffff', bluRule: '#2f4fd0', wht: '#ffffff',
  r: '#d81f1f', rm: '#a01818', rd: '#5e0e0e', rdd: '#2a0606',
  branch: { monitoring: '#ffffff', oversight: '#b7b7b7', containment: '#8fe08a', science: '#7ad47e', operations: '#3fae4a' },
  lane: {
    ext: { ...SOLITON.lane.ext, acc: '#8fe08a', mid: '#3fae4a', dim: '#1f6b2c', ddim: '#0f3d17', text: '#8fe08a', field: '#000000' },
    int: { ...SOLITON.lane.int, acc: '#7ad47e', mid: '#3fae4a', dim: '#18521f', ddim: '#0f3d17', text: '#7ad47e', field: '#000000' },
  },
};

export const THEMES = { soliton: SOLITON, codec98: CODEC98, transceiver90: TRANSCEIVER90 };
export let C = SOLITON;

// epoch bumps when anything cached could be stale: theme, fonts, scale. Caches compare it.
export let epoch = 0;
export function setTheme(name) { C = THEMES[name] || SOLITON; bump(); cssVars(); }

// overlays are HTML: hand them the same tokens as CSS variables (--g, --r, --blu ...)
export function cssVars() {
  const s = document.documentElement.style;
  for (const [k, v] of Object.entries(C)) if (typeof v === 'string') s.setProperty('--' + k, v);
  s.setProperty('--ext', C.lane.ext.acc); s.setProperty('--int', C.lane.int.acc);
  s.setProperty('--crtLine', C.crt.line); s.setProperty('--crtVig', C.crt.vignette);
  for (const [k, v] of Object.entries(C.stream)) s.setProperty('--s-' + k, v);
}

// =================== fonts ===================
// VT323 = data (numbers, task lines, logs) · Silkscreen = labels (caps only) · DotGothic16 = voice (codec dialog)

export const F = {
  v16: '16px "VT323", monospace', v20: '20px "VT323", monospace', v24: '24px "VT323", monospace', v32: '32px "VT323", monospace',
  k8: '8px "Silkscreen", monospace', k16: '16px "Silkscreen", monospace',
  d16: '16px "DotGothic16", monospace',
};
const FACES = ['16px "VT323"', '8px "Silkscreen"', '16px "DotGothic16"'];
const FAMILIES = ['VT323', 'Silkscreen', 'DotGothic16'];
const loaded = fam => [...document.fonts].some(f => f.family.replace(/["']/g, '') === fam && f.status === 'loaded');
const facesOk = () => FAMILIES.every(loaded);

// resolves true once all three faces are in (false after ~6 s: fallbacks). Text metrics are re-measured on load.
export const fontsReady = (async () => {
  if (!document.fonts) return false;
  document.fonts.addEventListener?.('loadingdone', bump);
  for (let i = 0; i < 40 && !facesOk(); i++) {
    await Promise.all(FACES.map(f => document.fonts.load(f, 'Aa0').catch(() => null)));
    if (!facesOk()) await new Promise(r => setTimeout(r, 150));
  }
  bump();
  if (!facesOk()) console.warn('[handoff] web fonts not loaded: drawing with fallbacks');
  return facesOk();
})();

// =================== scale & snapping ===================
// k = device px per logical px (main.js sets it on resize). snap() lands a logical coordinate on a device pixel.

export let k = 1;
export function setScale(v) { if (v !== k) { k = v; bump(); } }
export const snap = v => Math.round(v * k) / k;

function bump() { epoch++; MEASURE.clear(); }

// =================== rects and lines ===================

export function fill(g, x, y, w, h, col) {
  const x0 = snap(x), y0 = snap(y);
  g.fillStyle = col;
  g.fillRect(x0, y0, Math.max(1 / k, snap(x + w) - x0), Math.max(1 / k, snap(y + h) - y0));
}
// 1 px frame inside the rect
export function box(g, x, y, w, h, col) {
  fill(g, x, y, w, 1, col); fill(g, x, y + h - 1, w, 1, col);
  fill(g, x, y, 1, h, col); fill(g, x + w - 1, y, 1, h, col);
}
// dashed lines: `on` px lit, `off` px dark, shifted by o (animate o to march)
export function dashH(g, x, y, w, col, on = 2, off = 2, o = 0) {
  for (let i = -o; i < w; i += on + off) { const a = Math.max(i, 0), b = Math.min(i + on, w); if (b > a) fill(g, x + a, y, b - a, 1, col); }
}
export function dashV(g, x, y, h, col, on = 2, off = 2, o = 0) {
  for (let i = -o; i < h; i += on + off) { const a = Math.max(i, 0), b = Math.min(i + on, h); if (b > a) fill(g, x, y + a, 1, b - a, col); }
}
export function dashBox(g, x, y, w, h, col, on = 2, off = 2, o = 0) {
  dashH(g, x, y, w, col, on, off, o); dashH(g, x, y + h - 1, w, col, on, off, o);
  dashV(g, x, y, h, col, on, off, o); dashV(g, x + w - 1, y, h, col, on, off, o);
}
// L-shaped corner marks, L px long, th px thick
export function corners(g, x, y, w, h, col, L = 6, th = 2) {
  fill(g, x, y, L, th, col); fill(g, x, y, th, L, col); fill(g, x + w - L, y, L, th, col); fill(g, x + w - th, y, th, L, col);
  fill(g, x, y + h - th, L, th, col); fill(g, x, y + h - L, th, L, col); fill(g, x + w - L, y + h - th, L, th, col); fill(g, x + w - th, y + h - L, th, L, col);
}
// the standard framed panel (dossier, ops log, context panel)
export function panel(g, r, { bg = C.pan, rule = C.e0, mark = C.e2 } = {}) {
  fill(g, r.x, r.y, r.w, r.h, bg); box(g, r.x, r.y, r.w, r.h, rule); corners(g, r.x, r.y, r.w, r.h, mark, 6);
}

// =================== text ===================
// text(g, s, x, y, font, colour, align) draws at baseline y and returns the width. align: 'left' | 'center' | 'right'

const MEASURE = new Map();
let scratch = null;
// VT323 draws "fi" and "fl" as one 6 px glyph ("flow" would read "fow"): a zero-width non-joiner keeps them apart
const plain = s => (s.includes('f') ? s.replace(/f(?=[fil])/g, 'f\u200c') : s);
export function tw(s, font) {
  s = plain(String(s));
  const key = font + '|' + s;
  let w = MEASURE.get(key);
  if (w === undefined) {
    if (!scratch) scratch = document.createElement('canvas').getContext('2d');
    if (MEASURE.size > 6000) MEASURE.clear();
    scratch.font = font;
    w = scratch.measureText(s).width;
    MEASURE.set(key, w);
  }
  return w;
}

export function text(g, s, x, y, font, col, align = 'left') {
  s = plain(String(s));
  const w = tw(s, font);
  const X = snap(align === 'right' ? x - w : align === 'center' ? x - w / 2 : x), Y = snap(y);
  g.font = font;
  g.fillStyle = col;
  if (font === F.v16 && k < 1.5 && s.includes('M')) inkM(g, s, X, Y);
  else g.fillText(s, X, Y);
  return w;
}

// VT323 at 16 px rasterises M as N at 1×: draw those M's from a cached 6×10 sprite (soft left edge), the rest as text
const M16 = ['h#...#', 'h##.##', 'h#.#.#', 'h#.#.#', 'h#...#', 'h#...#', 'h#...#', 'h#...#', 'h#...#', 'h#...#'];
const mSprite = col => layer('inkM|' + col, 6, 10, lg => {
  lg.fillStyle = col;
  for (let j = 0; j < 10; j++) for (let q = 0; q < 6; q++) {
    const ch = M16[j][q];
    if (ch === '.') continue;
    lg.globalAlpha = ch === 'h' ? 0.45 : 1;
    lg.fillRect(q, j, 1, 1);
  }
});
function inkM(g, s, X, Y) {
  const parts = s.split('M'), mw = tw('M', F.v16), M = typeof g.fillStyle === 'string' ? mSprite(g.fillStyle) : null;
  let cx = X;
  parts.forEach((p, i) => {
    if (p) { g.fillText(p, cx, Y); cx += tw(p, F.v16); }
    if (i === parts.length - 1) return;
    if (M) g.drawImage(M.cv, cx, Y - 10, M.cv.width / k, M.cv.height / k);
    else g.fillText('M', cx, Y);
    cx += mw;
  });
}

// shorten to fit maxW: drop whole words first, then letters, ending in …
export function fit(s, font, maxW) {
  s = String(s);
  if (tw(s, font) <= maxW) return s;
  const ws = s.split(' ');
  for (let n = ws.length - 1; n > 0; n--) { const c = ws.slice(0, n).join(' ') + '…'; if (tw(c, font) <= maxW) return c; }
  let n = s.length;
  while (n > 1 && tw(s.slice(0, n).trimEnd() + '…', font) > maxW) n--;
  return s.slice(0, n).trimEnd() + '…';
}

// word-wrap into lines no wider than maxW
export function wrap(s, font, maxW) {
  const out = [];
  let cur = '';
  for (const w of String(s).split(' ')) {
    const next = cur ? cur + ' ' + w : w;
    if (tw(next, font) > maxW && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// =================== cached layers (static chrome, glows) ===================
// layer(key, w, h, paint) paints once at device resolution, again only when scale, fonts or theme change.
// blit(g, layer, x, y) draws it 1:1 on device pixels.

const LAYER_CACHE = new Map();
export function layer(key, w, h, paint) {
  const id = key + '|' + k + '|' + epoch;
  let L = LAYER_CACHE.get(key);
  if (!L || L.id !== id) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const lg = cv.getContext('2d');
    lg.setTransform(k, 0, 0, k, 0, 0);
    lg.imageSmoothingEnabled = false;
    paint(lg);
    L = { id, cv, w, h };
    LAYER_CACHE.set(key, L);
  }
  return L;
}
export function blit(g, L, x, y) { g.drawImage(L.cv, snap(x), snap(y), L.cv.width / k, L.cv.height / k); }

// a lit bar with its phosphor bloom (the blur is baked once per size and colour)
const GLOW = new Map();
export function glowRect(g, x, y, w, h, col, blur = 6) {
  const key = w + '|' + h + '|' + col + '|' + blur + '|' + k, pad = blur * 2;
  let cv = GLOW.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = Math.ceil((w + pad * 2) * k); cv.height = Math.ceil((h + pad * 2) * k);
    const lg = cv.getContext('2d');
    lg.setTransform(k, 0, 0, k, 0, 0);
    lg.shadowColor = col; lg.shadowBlur = blur * k; lg.fillStyle = col; lg.fillRect(pad, pad, w, h);
    if (GLOW.size > 300) GLOW.clear();
    GLOW.set(key, cv);
  }
  g.drawImage(cv, snap(x - pad), snap(y - pad), cv.width / k, cv.height / k);
}

// =================== deterministic noise (no Math.random in draw code) ===================

export function hash(n) {
  n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function rnd(seed) { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (Math.imul(s, 16807) >>> 0) % 2147483647 || 1) / 2147483647; }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, f) => a + (b - a) * f;
export const ease = e => (e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2);
export const mod = (a, n) => ((a % n) + n) % n;

// =================== skeleton placeholder (builders delete their calls) ===================

export function placeholder(g, r, title, lines = []) {
  fill(g, r.x, r.y, r.w, r.h, C.pan);
  dashBox(g, r.x, r.y, r.w, r.h, C.e1, 3, 3);
  text(g, title, r.x + 6, r.y + 11, F.k8, C.gd);
  lines.forEach((s, i) => { if (r.y + 28 + i * 15 < r.y + r.h) text(g, fit(s, F.v16, r.w - 12), r.x + 6, r.y + 28 + i * 15, F.v16, C.gm); });
}
