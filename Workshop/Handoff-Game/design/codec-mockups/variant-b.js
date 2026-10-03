// HANDOFF — visual direction B: "Transceiver '90" — an MSX2-era codec homage.
// The whole frame is painted on a 600x330 low-res buffer and blown up 2x with smoothing off,
// so every pixel is a visible block. Portraits and the transceiver are drawn in 2x2 "art pixels".
// Colour discipline, as on the 1990 screen: blue is only ever speech, red is only meters and alarms.
(function () {
  'use strict';
  const LW = 600, LH = 330;
  const FS = '8px Silkscreen', FJ = '8px Tiny5';
  const FT = 'task5x7'; // task lines: a hand-made bitmap face, not a CSS font (see GL below)
  try { document.fonts.load(FS); document.fonts.load(FJ); } catch (e) { /* fall back to system fonts */ }

  // ---------- the task face: hand-made 5x7 bitmap ----------
  // Rows run from y-7 (cap line) to y (descender); caps and digits are 7 rows, x-height is 5, descenders 1.
  // Drawn pixel for pixel, never thresholded, so an 8 is two stacked loops and can't be mistaken for a $.
  const GL = {
    a: '.../.../##./..#/.##/#.#/.##/...', b: '#../#../##./#.#/#.#/#.#/##./...', c: '.../.../.##/#../#../#../.##/...',
    d: '..#/..#/.##/#.#/#.#/#.#/.##/...', e: '.../.../.#./#.#/###/#../.##/...', f: '.##/.#./###/.#./.#./.#./.#./...',
    g: '.../.../.##/#.#/#.#/.##/..#/##.', h: '#../#../##./#.#/#.#/#.#/#.#/...', i: '#/./#/#/#/#/#/.',
    j: '.#/../.#/.#/.#/.#/.#/#.', k: '#../#../#.#/#.#/##./#.#/#.#/...', l: '#/#/#/#/#/#/#/.',
    m: '...../...../####./#.#.#/#.#.#/#.#.#/#.#.#/.....', n: '.../.../##./#.#/#.#/#.#/#.#/...',
    o: '.../.../.#./#.#/#.#/#.#/.#./...', p: '.../.../##./#.#/#.#/##./#../#..', q: '.../.../.##/#.#/#.#/.##/..#/..#',
    r: '.../.../#.#/##./#../#../#../...', s: '.../.../.##/#../.#./..#/##./...', t: '.../.#./###/.#./.#./.#./.##/...',
    u: '.../.../#.#/#.#/#.#/#.#/.##/...', v: '...../...../#...#/#...#/.#.#./.#.#./..#../.....', // v is pointed and as wide as w, so 'eval' never reads 'eual'
    w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#./.....', x: '.../.../#.#/#.#/.#./#.#/#.#/...',
    y: '.../.../#.#/#.#/#.#/.##/..#/##.', z: '.../.../###/..#/.#./#../###/...',
    A: '.##./#..#/#..#/####/#..#/#..#/#..#/....', B: '###./#..#/#..#/###./#..#/#..#/###./....',
    C: '.###/#.../#.../#.../#.../#.../.###/....', D: '###./#..#/#..#/#..#/#..#/#..#/###./....',
    E: '####/#.../#.../###./#.../#.../####/....', F: '####/#.../#.../###./#.../#.../#.../....',
    G: '.###/#.../#.../#.##/#..#/#..#/.###/....', H: '#..#/#..#/#..#/####/#..#/#..#/#..#/....',
    I: '###/.#./.#./.#./.#./.#./###/...', J: '..##/...#/...#/...#/...#/#..#/.##./....',
    K: '#..#/#..#/#.#./##../#.#./#..#/#..#/....', L: '#.../#.../#.../#.../#.../#.../####/....',
    M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#/.....', N: '#..#/##.#/##.#/#.##/#.##/#..#/#..#/....',
    O: '.##./#..#/#..#/#..#/#..#/#..#/.##./....', P: '###./#..#/#..#/###./#.../#.../#.../....',
    Q: '.##./#..#/#..#/#..#/#..#/#.#./.#.#/....', R: '###./#..#/#..#/###./#.#./#..#/#..#/....',
    S: '.###/#.../#.../.##./...#/...#/###./....', T: '###/.#./.#./.#./.#./.#./.#./...',
    U: '#..#/#..#/#..#/#..#/#..#/#..#/.##./....', V: '#..#/#..#/#..#/#..#/#..#/.##./.##./....',
    W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#/.....', X: '#..#/#..#/.##./.##./.##./#..#/#..#/....',
    Y: '#.#/#.#/#.#/.#./.#./.#./.#./...', Z: '####/...#/..#./.##./.#../#.../####/....',
    0: '.##./#..#/#..#/#.##/##.#/#..#/.##./....', 1: '.#./##./.#./.#./.#./.#./###/...',
    2: '.##./#..#/...#/..#./.#../#.../####/....', 3: '###./...#/...#/.##./...#/...#/###./....',
    4: '..#./.##./#.#./#.#./####/..#./..#./....', 5: '####/#.../###./...#/...#/#..#/.##./....',
    6: '.##./#.../#.../###./#..#/#..#/.##./....', 7: '####/...#/..#./..#./.#../.#../.#../....',
    8: '.##./#..#/#..#/.##./#..#/#..#/.##./....', 9: '.##./#..#/#..#/.###/...#/...#/.##./....',
    ' ': '../../../../../../../..', '.': './././././././#/.', ',': '../../../../../../.#/#.', '-': '.../.../.../.../###/.../.../...',
    '!': '#/#/#/#/#/./#/.', ':': './././#/././#/.', "'": '#/#/./././././.',
    '?': '.##./#..#/...#/..#./.#../..../.#../....', '/': '..#/..#/.#./.#./.#./#../#../...',
    '(': '.#/#./#./#./#./#./.#/..', ')': '#./.#/.#/.#/.#/.#/#./..', '+': '.../.../.../.#./###/.#./.../...',
    '$': '.#./###/#../###/..#/###/.#./...', '>': '.../.../#../.#./..#/.#./#../...',
    '▸': '.../.../#../##./###/##./#../...', // ▸ the R&D shell's prompt
    '≈': '...../...../.##../#..##/...../.##../#..##/.....', // ≈ the paraphraser's prompt
    '…': '...../...../...../...../...../...../#.#.#/.....', // …
    '\u0000': '.../.../###/#.#/#.#/#.#/###/...', // anything unmapped
  };
  const GLY = new Map();
  function gl(ch) {
    let g = GLY.get(ch); if (g) return g;
    const rows = (GL[ch] || GL['\u0000']).split('/');
    g = { w: rows[0].length, rows }; GLY.set(ch, g); return g;
  }

  // ---------- palette (MSX-ish, deliberately small) ----------
  const P = {
    K: '#000000', d: '#161616', D: '#2f2f2f', M: '#6d6d6d', L: '#b7b7b7', W: '#ffffff',
    G: '#3fae4a', g: '#0f3d17', q: '#1f6b2c', Y: '#8fe08a', E: '#7ad47e', z: '#18521f', // E: R&D task ink, z: R&D lane lattice
    B: '#1531a8', R: '#d81f1f', r: '#5e0e0e',
    o: '#a3481c', h: '#4a2410',
    S: '#eaa878', s: '#b56a40', n: '#6e3a1e', H: '#2b1a10',
  };

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const mod = (a, n) => ((a % n) + n) % n;
  const hint = n => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return (n ^ (n >>> 16)) >>> 0; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  let fontsOK = false;
  function fontsReady() {
    if (fontsOK) return true;
    try {
      let a = false, b = false;
      document.fonts.forEach(f => {
        if (f.status !== 'loaded') return;
        const fam = f.family.replace(/["']/g, '');
        if (fam === 'Silkscreen') a = true; else if (fam === 'Tiny5') b = true;
      });
      fontsOK = a && b;
    } catch (e) { fontsOK = true; }
    return fontsOK;
  }

  // ---------- crisp text: thresholded sprite cache (no anti-aliasing survives the 2x blow-up) ----------
  const mctx = mk(8, 8).getContext('2d');
  const WC = new Map(), TC = new Map(), CUM = new Map(), WR = new Map(), DL = new Map();
  const ASC = 9, SPH = 13;
  function trim() { if (TC.size > 1500) TC.clear(); if (WC.size > 3000) WC.clear(); } // shrinking slips mint new strings every frame; keep the caches bounded
  function tw(s, f) {
    const key = f + '\u0001' + s; let w = WC.get(key);
    if (w === undefined) {
      if (f === FT) { w = 0; for (const ch of s) w += gl(ch).w + 1; WC.set(key, w); return w; }
      mctx.font = f; w = Math.round(mctx.measureText(s).width); if (fontsOK) WC.set(key, w);
    }
    return w;
  }
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function spr(s, f, col) {
    const key = f + '\u0001' + col + '\u0001' + s; let o = TC.get(key); if (o) return o;
    const w = Math.max(1, tw(s, f) + 2), cv = mk(w, SPH), x = cv.getContext('2d');
    if (f === FT) { // bitmap face: plot the pixels directly
      x.fillStyle = col; let px = 0;
      for (const ch of s) { const g = gl(ch); g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') x.fillRect(px + i, ASC - 7 + j, 1, 1); }); px += g.w + 1; }
      TC.set(key, cv); return cv;
    }
    x.font = f; x.fillStyle = col; x.textBaseline = 'alphabetic'; x.fillText(s, 0, ASC);
    const id = x.getImageData(0, 0, w, SPH), p = id.data, c3 = rgb(col);
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] > 110) { p[i] = c3[0]; p[i + 1] = c3[1]; p[i + 2] = c3[2]; p[i + 3] = 255; } else p[i + 3] = 0;
    }
    if (f === FJ) restamp8(x, s, p, w, c3);
    x.putImageData(id, 0, 0); if (fontsOK) TC.set(key, cv); return cv;
  }
  // Tiny5 draws 8 as a 3x5 zigzag (.#./#.#/.#./#.#/.#.) that reads as $ or &. Wherever that exact cell appears,
  // restamp it as two stacked boxes, the plain pixel-font 8; any other rendering (a fallback font) is left alone.
  const T5_8 = ['.#.', '#.#', '.#.', '#.#', '.#.'], NEW_8 = ['###', '#.#', '###', '#.#', '###'];
  function restamp8(x, s, p, w, c3) {
    for (let i = s.indexOf('8'); i >= 0; i = s.indexOf('8', i + 1)) {
      const x0 = Math.round(x.measureText(s.slice(0, i)).width), at = (j, k) => ((ASC - 5 + j) * w + x0 + k) * 4;
      if (x0 + 3 > w || !T5_8.every((r, j) => [...r].every((ch, k) => (p[at(j, k) + 3] > 0) === (ch === '#')))) continue;
      NEW_8.forEach((r, j) => [...r].forEach((ch, k) => {
        const q = at(j, k); if (ch === '#') { p[q] = c3[0]; p[q + 1] = c3[1]; p[q + 2] = c3[2]; p[q + 3] = 255; } else p[q + 3] = 0;
      }));
    }
  }
  function T(cx, s, x, y, f, col, al) { // y = baseline
    s = String(s); const w = tw(s, f);
    if (al === 'r') x -= w; else if (al === 'c') x -= (w >> 1);
    if (fontsOK || f === FT) cx.drawImage(spr(s, f, col), x, y - ASC);
    else { cx.font = f; cx.fillStyle = col; cx.textBaseline = 'alphabetic'; cx.fillText(s, x, y); }
    return w;
  }
  function Tpart(cx, s, x, y, f, col, sx, sw) { // horizontal slice [sx, sx+sw) of a string placed at x
    sw = Math.min(sw, tw(s, f) + 2 - sx); if (sw <= 0) return;
    if (fontsOK || f === FT) cx.drawImage(spr(s, f, col), sx, 0, sw, SPH, x + sx, y - ASC, sw, SPH);
    else { cx.save(); cx.beginPath(); cx.rect(x + sx, y - ASC, sw, SPH); cx.clip(); cx.font = f; cx.fillStyle = col; cx.fillText(s, x, y); cx.restore(); }
  }
  function T2(cx, s, x, y, f, col, sw) { // the codec voice: the first sw px of s, blitted at 2x (y = baseline)
    s = String(s); if (sw == null) sw = tw(s, f) + 2; if (sw <= 0) return;
    if (fontsOK) cx.drawImage(spr(s, f, col), 0, 0, sw, SPH, x, y - 2 * ASC, sw * 2, SPH * 2);
    else { cx.save(); cx.beginPath(); cx.rect(x, y - 2 * ASC, sw * 2, SPH * 2); cx.clip(); cx.font = f.replace(/^(\d+)px/, (m, a) => (2 * a) + 'px'); cx.fillStyle = col; cx.fillText(s, x, y); cx.restore(); }
  }
  function cum(s, f) {
    const key = f + '\u0001' + s; let a = CUM.get(key); if (a) return a;
    a = [0]; for (let i = 1; i <= s.length; i++) a.push(tw(s.slice(0, i), f));
    if (fontsOK || f === FT) CUM.set(key, a); return a;
  }
  function fit(s, f, maxW) {
    if (tw(s, f) <= maxW) return s;
    const el = f === FT ? '\u2026' : '..';
    let n = s.length; while (n > 1 && tw(s.slice(0, n).trimEnd() + el, f) > maxW) n--;
    return s.slice(0, n).trimEnd() + el;
  }
  function wrap(s, f, maxW) {
    const key = f + '\u0001' + maxW + '\u0001' + s; let r = WR.get(key); if (r) return r;
    r = []; let cur = '';
    for (const w of s.split(' ')) { const t2 = cur ? cur + ' ' + w : w; if (!cur || tw(t2, f) <= maxW) cur = t2; else { r.push(cur); cur = w; } }
    if (cur) r.push(cur); if (fontsOK) WR.set(key, r); return r;
  }
  function wrapBal(s, f, maxW) { // two lines of similar length when a sentence needs two
    if (tw(s, f) <= maxW) return [s];
    const ws = s.split(' '); let best = null, bw = 1e9;
    for (let i = 1; i < ws.length; i++) {
      const a = ws.slice(0, i).join(' '), b = ws.slice(i).join(' '), m = Math.max(tw(a, f), tw(b, f));
      if (m <= maxW && m < bw) { bw = m; best = [a, b]; }
    }
    return best || wrap(s, f, maxW);
  }
  // a desk label: the most telling word(s) of a task, not its first letters
  const STOP = new Set(['to', 'a', 'an', 'the', 'on', 'of', 'for', 'in', 'about', 'and']);
  const DESK_W = 35; // a desk label's budget, trailing gap included: 34 glyph columns between the sprite and the border
  function keyword(s, maxW) {
    const key = maxW + '\u0001' + s; let r = DL.get(key); if (r) return r;
    const ws = s.split(' '), two = ws.slice(-2);
    if (ws.length > 1 && two.every(w => w.length > 1 && !STOP.has(w)) && tw(two.join(' '), FT) <= maxW) r = two.join(' ');
    else {
      let best = '', long = ''; // best: the longest word that fits; long: the longest word of all
      ws.forEach(w => { if (STOP.has(w)) return; if (w.length >= long.length) long = w; if (w.length >= best.length && tw(w, FT) <= maxW) best = w; });
      // a short weak word ('write', 'build') loses to most of a long telling one ('onboard…', 'dashboa…')
      const cut = long !== best ? fit(long, FT, maxW) : '', kept = cut.length - 1;
      if (best.length < 6 && kept >= 5) r = cut;
      else r = best.length >= 4 ? best : fit(s, FT, maxW);
    }
    DL.set(key, r); return r;
  }

  // ---------- pixel helpers ----------
  function R(cx, x, y, w, h, col) { cx.fillStyle = col; cx.fillRect(x, y, w, h); }
  function box(cx, x, y, w, h, col) { R(cx, x, y, w, 1, col); R(cx, x, y + h - 1, w, 1, col); R(cx, x, y, 1, h, col); R(cx, x + w - 1, y, 1, h, col); }
  function box2(cx, x, y, w, h, col) { box(cx, x, y, w, h, col); box(cx, x + 1, y + 1, w - 2, h - 2, col); }
  function dashH(cx, x, y, w, col, on, off, ph) {
    cx.fillStyle = col; const per = on + off; let i = -mod(ph || 0, per);
    for (; i < w; i += per) { const a = Math.max(0, i), b = Math.min(w, i + on); if (b > a) cx.fillRect(x + a, y, b - a, 1); }
  }
  function dashV(cx, x, y, h, col, on, off, ph) {
    cx.fillStyle = col; const per = on + off; let i = -mod(ph || 0, per);
    for (; i < h; i += per) { const a = Math.max(0, i), b = Math.min(h, i + on); if (b > a) cx.fillRect(x, y + a, 1, b - a); }
  }
  function checker(cx, x, y, w, h, col, par) { cx.fillStyle = col; for (let j = 0; j < h; j++) for (let i = (j + (par || 0)) & 1; i < w; i += 2) cx.fillRect(x + i, y + j, 1, 1); }
  function clip(cx, x, y, w, h) { cx.save(); cx.beginPath(); cx.rect(x, y, w, h); cx.clip(); }
  function line(cx, x0, y0, x1, y1, col) { // 1px Bresenham
    cx.fillStyle = col; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { cx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  function corner(cx, x, y, sx, sy, col) { R(cx, sx > 0 ? x : x - 2, y, 3, 1, col); R(cx, x, sy > 0 ? y : y - 2, 1, 3, col); }
  function brackets(cx, x0, y0, x1, y1, col) { corner(cx, x0, y0, 1, 1, col); corner(cx, x1, y0, -1, 1, col); corner(cx, x0, y1, 1, -1, col); corner(cx, x1, y1, -1, -1, col); }
  function pix(rows, sc, map) {
    map = map || P; const h = rows.length; let w = 0; rows.forEach(r => { w = Math.max(w, r.length); });
    const cv = mk(w * sc, h * sc), x = cv.getContext('2d');
    for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
      const col = map[rows[j][i]]; if (col) { x.fillStyle = col; x.fillRect(i * sc, j * sc, sc, sc); }
    }
    return cv;
  }
  let HAZ = null; // hazard stripe tile (orange-brown, the only place P.o / P.h live besides coins)
  function hazard(cx, x, y, w, h) {
    if (!HAZ) { HAZ = mk(64, 16); const z = HAZ.getContext('2d'); for (let j = 0; j < 16; j++) for (let i = 0; i < 64; i++) { z.fillStyle = mod(i + j, 6) < 3 ? P.o : P.h; z.fillRect(i, j, 1, 1); } }
    for (let i = 0; i < w; i += 64) cx.drawImage(HAZ, 0, 0, Math.min(64, w - i), h, x + i, y, Math.min(64, w - i), h);
  }
  function times(cx, x, y, col) { R(cx, x, y, 1, 1, col); R(cx, x + 2, y, 1, 1, col); R(cx, x + 1, y + 1, 1, 1, col); R(cx, x, y + 2, 1, 1, col); R(cx, x + 2, y + 2, 1, 1, col); }
  function bang(cx, x, y, col, ink) { R(cx, x, y, 5, 8, col); R(cx, x + 2, y + 1, 1, 4, ink); R(cx, x + 2, y + 6, 1, 1, ink); } // red "!" marker
  function lock(cx, x, y) { // 3x4 padlock badge with a black keyline
    R(cx, x - 1, y - 1, 5, 6, P.K); R(cx, x + 1, y, 1, 1, P.L); R(cx, x, y + 1, 1, 1, P.L); R(cx, x + 2, y + 1, 1, 1, P.L); R(cx, x, y + 2, 3, 2, P.L);
  }
  function padlock(cx, x, y, col, open) { // 5x7 padlock (rows y..y+6); the shackle lifts and snaps shut
    const o = open ? 1 : 0;
    R(cx, x + 1, y - o, 3, 1, col); R(cx, x, y + 1 - o, 1, 2, col); R(cx, x + 4, y + 1 - o, 1, open ? 1 : 2, col);
    R(cx, x, y + 3, 5, 4, col); R(cx, x + 2, y + 4, 1, 2, P.K);
  }
  // small 5x7 seven-segment digits with 1px strokes (event countdown)
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
  const SEGS = { a: [1, 0, 3, 1], b: [4, 1, 1, 2], c: [4, 4, 1, 2], d: [1, 6, 3, 1], e: [0, 4, 1, 2], f: [0, 1, 1, 2], g: [1, 3, 3, 1] };
  function seg7s(cx, s, xr, y, col, ghost) { // ghosts sit behind every digit but the leading one
    let w = 0; for (const ch of s) w += ch === '.' ? 2 : 6; let x = xr - w + 1, lead = true;
    for (const ch of s) {
      if (ch === '.') { R(cx, x, y + 6, 1, 1, col); x += 2; continue; }
      if (ghost && !lead) for (const k of 'abcdefg') { const r = SEGS[k]; R(cx, x + r[0], y + r[1], r[2], r[3], ghost); } // solid, not dithered: a dither on 1px strokes reads as an x
      for (const k of SEG[ch]) { const r = SEGS[k]; R(cx, x + r[0], y + r[1], r[2], r[3], col); }
      x += 6; lead = false;
    }
  }
  // LCD: bold seven-segment digits, 6x10 with 2px strokes (the same block size as the radio's art pixels)
  const SEGR = { a: [1, 0, 4, 2], b: [4, 1, 2, 4], c: [4, 5, 2, 4], d: [1, 8, 4, 2], e: [0, 5, 2, 4], f: [0, 1, 2, 4], g: [1, 4, 4, 2] };
  function seg7(cx, s, xr, y, col, ghost) { // right-aligned so the last digit ends at xr
    let w = 0; for (const ch of s) w += ch === '.' ? 4 : 7; let x = xr - w + 2;
    for (const ch of s) {
      if (ch === '.') { R(cx, x, y + 8, 2, 2, col); x += 4; continue; }
      if (ghost) 'abcdefg'.split('').forEach(k => { const r = SEGR[k]; for (let j = 0; j < r[3]; j++) for (let i = 0; i < r[2]; i++) if (!((x + r[0] + i) & 1) && !((y + r[1] + j) & 1)) R(cx, x + r[0] + i, y + r[1] + j, 1, 1, ghost); });
      for (const k of SEG[ch]) { const r = SEGR[k]; R(cx, x + r[0], y + r[1], r[2], r[3], col); }
      x += 7;
    }
  }

  // ---------- icons (10x10, original) ----------
  const ICON = {
    JB: ['.LLLLLLLL.', 'LMMMMMMKML', 'LMWMMMKMML', 'LMWMMKMMML', 'LMMMKKMMML', '.LMMKMMML.', '.LMKMMMML.', '..LKMMML..', '...LMML...', '....LL....'],
    PRB: ['.........W', '........L.', '.......L..', '......L...', '.....L....', '..GGGG....', '.GGGGGG...', '.GGYYGG...', '.GGYYGG...', '..GGGG....'],
    TM: ['LLLLLLLLLL', 'L........L', 'L..WWWW..L', 'L.WWGGWW.L', 'L.WWGGWW.L', 'L..WWWW..L', 'L........L', 'LLLLLLLLLL', '....MM....', '..MMMMMM..'],
    UM: ['MMMMMMMMMM', 'M........M', 'M..LLLL..M', 'M.LLooLL.M', 'M.LLooLL.M', 'M..LLLL..M', 'M........M', 'MMMMMMMMMM', '....DD....', '..DDDDDD..'],
    CoT: ['.WWWWWWWW.', 'WWWWWWWWWW', 'WWWWWWWWWW', 'WGWWGWWGWW', 'WWWWWWWWWW', '.WWWWWWWW.', '..WW......', '..W.......', '.W........', '..........'],
    EGR: ['LLLLLLLLLL', '.LLLLLLLL.', '..LLLLLL..', '...LLLL...', '....LL....', '....LL....', '..MMMMMM..', '....WW....', '...WWWW...', '....WW....'],
    AUD: ['...HHHH...', '..HSSSSH..', '..SSSSSS..', '...SSSS...', '....ss....', '.MMMMMMMM.', 'MMMMWWMMMM', 'MMMMWMMMMM', 'MMMMMMMMMM', 'MMMMMMMMMM'],
    DEF: ['...LLLL...', '..L....L..', '.L......L.', '.L......L.', '.L......L.', 'LLL.....L.', '.L......L.', '........L.', '......GGGG', '......GGGG'],
    KILL: ['....LL....', '.L..LL..L.', 'L...LL...L', 'L...LL...L', 'L........L', 'L........L', '.L......L.', '..LLLLLL..', '..........', '..........'],
    PAR: ['.LLLLLL...', 'L......L..', 'L.....LLL.', 'L......L..', '..........', '..L......L', '.LLL.....L', '..L......L', '...LLLLLL.', '..........'],
    SBX: ['.......LL.', '......LL..', '.....LL...', 'L...LL...L', 'L..SL....L', 'L.SSSS.S.L', 'LSSSSSSSSL', 'LSSSSSSSSL', 'LLLLLLLLLL', '..........'],
    LP: ['..........', '..........', '.LLL......', 'L...L.....', 'L...LLLLLL', 'L...L..L.L', '.LLL......', '..........', '..........', '..........'],
    RES: ['..........', '.XXXXXXXX.', '.XX.XXXXX.', '.XXXXXXXX.', '.XXXX.XXX.', '.XXXXXXXX.', '.XXXXXX.X.', '.XXXXXXXX.', '..........', '..........'],
    RATE: ['XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...', '....XX....', '....XX....', '...XXXX...', '..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX'],
    HNY: ['...XXXX...', '..X....X..', '..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..'],
    CAN: ['....XXX...', '...XXXXX..', '...XX.XXXX', '..XXXXXX..', '.XXXXXXX..', 'XXXXXXXX..', '.XXXXXX...', '..X..X....', '..........', '..........'],
    Q: ['...XXXX...', '..XX..XX..', '......XX..', '.....XX...', '....XX....', '....XX....', '..........', '....XX....', '..........', '..........'],
  };
  const ICACHE = {};
  function icon(tag, locked) {
    const key = tag + (locked ? '#' : ''); if (ICACHE[key]) return ICACHE[key];
    const rows = ICON[tag] || ICON.Q;
    if (locked) return (ICACHE[key] = pix(rows.map(r => r.replace(/[^.]/g, 'X')), 1, { X: P.M }));
    return (ICACHE[key] = pix(rows, 1, Object.assign({}, P, { X: P.L })));
  }

  // ---------- portraits: original characters, 22x28 art px drawn at 2x ----------
  // Side-lit like the MSX2 faces: each is lit from the radio between them, hard black shadow on the far side.
  const CEO = [ // silver hair swept back, heavy brow, looks left at you
    '....MLWWLWWWLLMMMD....',
    '...LWWWLWWLLLLMMMMD...',
    '..LWWLLWLLLLMLMMMMDD..',
    '..WWLLLLLMMLMMMMMDDDD.',
    '.LWLLLMMLMMMMMMMDDDDD.',
    '.LWLSSSSSSLLMMMDDDDDD.',
    '.LLSSssSSSSsssMMDDDDD.',
    '.MSSSSSSSSSSSssnKDDDD.',
    '.MSWWLLSSSLLLLnnnKDDD.',
    '..SKKKKnSnKKKKKnnnKDD.',
    '..SKKWKsSsnKKWKnnnKnD.',
    '..SSsnnSSSsnnnnnnnKsn.',
    '..SSSSSSSSsSssnnnnKnn.',
    '..SSSSSSSSsSsnnnnnKn..',
    '..sSSSSSSSsnssnnnnK...',
    '..sSSSnSSSSsnssnnnK...',
    '..nSSnSKKKKnsssnnnK...',
    '..nSSnSSSSSSnssnnnK...',
    '..nsnKKKKKKKKKnnnnK...',
    '..nsSSSnnnnnSsnnnK....',
    '..KnsSSSSSSSssnnnK....',
    '...KnsSSSSSssnnnK.....',
    '....KnnsssssnnnK......',
    '.....KKnnnnnnKK.......',
    'DDD...KnnnnnK....DDD..',
    'DDDDDDWWnnnWWDDDDDDDDD',
    'DDMDDDDWWRRWWDDDDDDMDD',
    'DMMDDDDDWRRWDDDDDDMMMD',
  ];
  const YOU = [ // you, Head of Safety: fringe, glasses, a long week; looks right at the CEO
    '......HHHHHHHHHH......',
    '....HHHHHHHHHHHnHH....',
    '...HHHHHHHHHHHHnnHH...',
    '..HHHHHHHHHHHHHHnnHH..',
    '..HHHHHHHHHHHHHnHHnH..',
    '.KHHHHHHHHHHHHnHSHHnH.',
    '.KHHHHHHHHHHHSSSSSHH..',
    '.KHHHHHHHHHSSSSSSSSH..',
    '.KHHHHHHnsSSKKKSSKKKH.',
    '.KHHnnsLLLLLsLLLLLLLH.',
    'KnHnnsLsWKsLsLSWKSSL..',
    'KnKnnsLLLLLLnLLLLLLL..',
    '.KKnnssnnnsSSSnnnSS...',
    '..KnnsssssSSSSSSSSS...',
    '..KnssssssSSSSSSsSS...',
    '..KnsssssssSSSSSSSS...',
    '...nssssssnSSSSnKKS...',
    '...nnsssssssnSSSSSS...',
    '...KnsssssnKKKKKSSS...',
    '....KnssssssnnnSSS....',
    '....KnnsssssssSSSS....',
    '.....KnnsssssSSSs.....',
    '......KnnnssssSSn.....',
    '.......KKnnnsSnK......',
    '........KnnnnnK.......',
    '....qqqqqKnnnnKqqq....',
    '..qqGGqqqqLqqLqqqGGq..',
    '.qGGGqqqqqqLLqqqqqGGG.',
  ];
  const ROBOT = ['...WW...', '.LLLLLL.', 'LLGLLGLL', 'LLLLLLLL', 'LLMMMMLL', '.LLLLLL.', '..MMMM..', '.MMMMMM.'];
  const CLERK = ['..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SKSSKS.', '..SSSS..', '.MMWWMM.', 'MMMWWMMM', 'MMMMMMMM'];
  const BOXI = ['.MMMMMMM.', 'MDDDDDDDM', 'MMMMMMMMM', 'MMMDDDMMM', 'MMMMMMMMM'];
  const FROG = ['.G...G.', 'GYG.GYG', 'GGGGGGG', '.GGGGG.', 'G.G.G.G'];
  const COIN = ['..ooo..', '.oSSSo.', 'oSWSSSo', 'oSSSSso', 'oSSSsso', '.osssh.', '..ohh..'];
  let ART = null;
  function art() {
    if (ART) return ART;
    const coinD = COIN.map((r, j) => r.split('').map((ch, i) => ((i + j) & 1 ? '.' : ch)).join(''));
    const dim = { L: P.D, M: P.D, W: P.D, G: P.D, S: P.D, s: P.D, n: P.D, H: P.d, B: P.d, K: P.K }; // a vacant desk: grey silhouette
    ART = { ceo: pix(CEO, 2), you: pix(YOU, 2), robot: pix(ROBOT, 2), clerk: pix(CLERK, 2), robotI: pix(ROBOT, 2, dim), clerkI: pix(CLERK, 2, dim), box: pix(BOXI, 1), frog: pix(FROG, 1),
      coin: pix(COIN, 1), coinD: pix(coinD, 1), noise: [] };
    for (let f = 0; f < 4; f++) { // static frames for the codec's tuning noise
      const cv = mk(44, 56), z = cv.getContext('2d'), rr = seeded(911 + f * 131);
      for (let i = 0; i < 44 * 56; i++) { const v = rr(); if (v < 0.09) { z.fillStyle = v < 0.04 ? P.M : P.D; z.fillRect(i % 44, (i / 44) | 0, 1, 1); } }
      ART.noise.push(cv);
    }
    return ART;
  }

  // odometer digits 5x9 (white on dark), plus a $ cell
  const ODO = {
    '0': ['.###.', '#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    '2': ['.###.', '#...#', '....#', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '3': ['.###.', '#...#', '....#', '....#', '..##.', '....#', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
    '5': ['#####', '#....', '#....', '####.', '....#', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '....#', '...#.', '...#.', '..#..', '..#..', '..#..', '..#..'],
    '8': ['.###.', '#...#', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '#...#', '.####', '....#', '....#', '....#', '.###.'],
    '$': ['..#..', '.####', '#.#..', '#.#..', '.###.', '..#.#', '..#.#', '####.', '..#..'],
  };
  let STRIP = null; // rolling strip: 0..9 then 0 again, 12px pitch, 8px wide
  function odoStrip() {
    if (STRIP) return STRIP;
    STRIP = mk(8, 12 * 11); const z = STRIP.getContext('2d'); R(z, 0, 0, 8, 132, P.d);
    for (let d = 0; d <= 10; d++) ODO[String(d % 10)].forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') R(z, 2 + i, d * 12 + 2 + j, 1, 1, P.W); });
    return STRIP;
  }
  function glyph5(cx, g, x, y, col) { ODO[g].forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') R(cx, x + i, y + j, 1, 1, col); }); }

  // ---------- layout ----------
  const LANE_Y = 46, LANE_H = 140, ROW = 14, START = 8, EXIT = 134, TYPE = 10; // TYPE: chars typed per px of travel
  // a line at baseline y owns the slot y-8..y+1: glyph rows y-7..y plus one clear row above and below.
  // Bands, underlines and brackets live in those clear rows or behind the glyphs, never on top of them.
  const TRK = [
    { key: 'ext', d: SCENE.ext, x0: 4, PIT: 10, v: 14, t0: 3.714, thr: 0.04, F: 6, fq: 1, catchRow: 1,
      frame: P.M, tab: P.L, sub: P.M, ink: P.L, dim: P.M, pc: P.M, acc: P.W, tag: P.W, pip: P.L, bg: P.K, band: P.D, xcol: P.M,
      prompt: '>', bay: 'DEFER BAY', D: 4.0, tIn: 0.5, seed: 17, cOff: 0,
      chips: SCENE.extChips, flag: SCENE.flaggedExt, mults: [2, 3, 3, 4, 6, 8, 12] },
    { key: 'int', d: SCENE.int, x0: 302, PIT: 12, v: 8, t0: 1.0625, thr: 0.1, F: 8, fq: 2, catchRow: 0,
      frame: P.q, tab: P.G, sub: P.G, ink: P.E, dim: P.q, pc: P.G, acc: P.Y, tag: P.Y, pip: P.G, bg: P.g, band: P.q, xcol: P.G,
      prompt: '\u25b8', bay: 'AUDIT BAY', D: 6.2, tIn: 0.6, seed: 3001, cOff: 3,
      chips: SCENE.intChips, flag: SCENE.flaggedInt, mults: [1, 1, 2, 2, 3, 4] },
  ];
  TRK.forEach(tr => {
    tr.LX = tr.x0 + 86; tr.LWd = 144; tr.BX = tr.x0 + 235; tr.BW = 56;
    tr.bayRow = tr.d.tiers.findIndex(x => x[4] === 'bay');
    tr.ymBay = LANE_Y + tr.bayRow * ROW + 7;
    tr.posPull = tr.ymBay + 3 - LANE_Y;
    tr.ymCatch = LANE_Y + tr.catchRow * ROW + 7;
    tr.catchTag = tr.d.tiers[tr.catchRow][0];
    tr.H = tr.F / 2;
    // the bay corridor: a pulled line keeps drifting down with the stream while it slides right, so the gate in the
    // lane's wall and the in-tray both span every row its slip sweeps (slip = the line's slot, padded where pitch allows)
    tr.pad = (tr.PIT - 10) >> 1;
    tr.yb0 = tr.ymBay + 3; tr.drift = Math.round(tr.v * tr.tIn);
    tr.gTop = tr.yb0 - 8 - tr.pad; tr.gBot = tr.yb0 + tr.drift + 1 + tr.pad;
  });
  const RING = { y: 44, h: 141 }; // the surge ring around the external lane (rows 44..184)

  function lineInfo(tr, k) {
    const rr = seeded(hint(k * 7919 + tr.seed) % 2147483646 + 1); rr();
    const a = rr(), c = rr();
    const m = mod(k, tr.F), flagged = m === tr.fq, pulled = flagged || m === mod(tr.fq + tr.H, tr.F);
    const present = pulled || a > tr.thr;
    let txt;
    if (flagged) txt = tr.flag;
    else { const pool = tr.pool || (tr.pool = tr.chips.filter(c => c !== tr.flag)); txt = pool[mod(k * 3 + tr.cOff + (mod(Math.floor(k / 7), 2) ? 2 : 0), pool.length)]; }
    return { k, flagged, pulled, present, txt, mult: tr.mults[Math.floor(c * tr.mults.length)] };
  }

  // ---------- static layer ----------
  function drawStatic(cx) {
    R(cx, 0, 0, LW, LH, P.K);
    drawHudStatic(cx);
    TRK.forEach(tr => drawTrackStatic(cx, tr));
    drawCodecStatic(cx);
    drawHoverStatic(cx);
    drawTraceStatic(cx);
    drawMenuStatic(cx);
  }

  // HUD: quiet greys; cash is the one hero instrument
  const HUD = { rep: 80, model: 162, rival: 250, mis: 306, tps: 372, split: 420 };
  function drawHudStatic(cx) {
    const lab = (s, x) => T(cx, s, x, 7, FS, P.M);
    // cash odometer frame: [$][0][4][8] , [2][1][0]
    box(cx, 3, 3, 67, 14, P.M);
    R(cx, 4, 4, 8, 12, P.d); glyph5(cx, '$', 6, 6, P.L);
    [12, 21, 30, 51, 60].forEach(x => R(cx, x, 4, 1, 12, P.M));
    R(cx, 39, 4, 3, 12, P.K); R(cx, 40, 4, 1, 12, P.K); R(cx, 39, 4, 1, 12, P.M); R(cx, 41, 4, 1, 12, P.M);
    R(cx, 40, 13, 1, 2, P.L); R(cx, 39, 15, 1, 1, P.L);
    lab('REP', HUD.rep); lab('MODEL', HUD.model); lab('RIVAL', HUD.rival); lab('MISALIGN', HUD.mis); lab('TASKS/S', HUD.tps); lab('COMPUTE', HUD.split);
    [HUD.rep, HUD.model, HUD.rival, HUD.mis, HUD.tps, HUD.split].forEach(x => dashV(cx, x - 6, 2, 16, P.D, 1, 1, 0));
    // rep: a LIFE bar, three ticks then the gauge
    const rx = HUD.rep; [0, 2, 4].forEach(i => R(cx, rx + i, 12, 1, 5, P.R));
    box(cx, rx + 7, 11, 52, 7, P.r); R(cx, rx + 8, 12, Math.round(50 * SCENE.rep / 100), 5, P.R);
    T(cx, String(SCENE.rep), rx + 62, 17, FS, P.L);
    T(cx, SCENE.gen, HUD.model, 17, FJ, P.L);
    T(cx, SCENE.rival, HUD.rival, 17, FJ, P.L);
    // misalignment with an error bar on a 0..50% scale
    const mw = T(cx, SCENE.misalign, HUD.mis, 17, FJ, P.L);
    const ex = HUD.mis + mw + 5, sc = 28 / 50; R(cx, ex, 14, 28, 1, P.D);
    const mm = String(SCENE.misalign).match(/([\d.]+)\D+([\d.]+)/) || [0, 14, 9], m = +mm[1], e = +mm[2];
    const a = ex + Math.round((m - e) * sc), b = ex + Math.round((m + e) * sc), c = ex + Math.round(m * sc);
    R(cx, a, 14, b - a + 1, 1, P.L); R(cx, a, 12, 1, 5, P.L); R(cx, b, 12, 1, 5, P.L); R(cx, c - 1, 12, 3, 5, P.W);
    T(cx, SCENE.tasksPerSec.toLocaleString('en-US'), HUD.tps, 17, FJ, P.L);
    // compute split: segmented bar on the label row, legend below
    const cols = [P.L, P.M, P.G], bx0 = HUD.split + tw('COMPUTE', FS) + 5, total = 596 - bx0;
    let x = bx0, lx = HUD.split;
    SCENE.split.forEach(([name, f], i) => {
      const w = i === 2 ? bx0 + total - x : Math.round(total * f);
      R(cx, x, 3, w - 1, 4, cols[i]); x += w;
      R(cx, lx, 13, 4, 4, cols[i]); lx += 6;
      lx += T(cx, name.toLowerCase() + ' ' + Math.round(f * 100) + '%', lx, 17, FJ, P.L) + 6;
    });
  }

  const PRICES = ['$4.0k', '$6.5k'];
  function drawTrackStatic(cx, tr) {
    const x0 = tr.x0, LX = tr.LX, LWd = tr.LWd, ext = tr.key === 'ext';
    box(cx, x0, 22, 294, 176, tr.frame);
    const name = tr.d.name, nw = tw(name, FS);
    R(cx, x0, 22, nw + 8, 9, tr.tab); T(cx, name, x0 + 4, 29, FS, P.K);
    T(cx, tr.d.sub, x0 + nw + 12, 29, FJ, tr.sub);
    T(cx, 'MOUNTS ' + tr.d.tiers.length + '/' + tr.d.slots, x0 + 289, 29, FS, tr.dim, 'r');
    if (ext) {
      // event plate: hazard caps, "!" lamp (dynamic), title, detail, draining bar, LCD countdown
      R(cx, x0 + 2, 31, 290, 12, P.h);
      hazard(cx, x0 + 2, 31, 4, 12); hazard(cx, x0 + 288, 31, 4, 12);
      const ev = SCENE.event, tx = x0 + 18, tw1 = T(cx, ev.title, tx, 39, FS, P.W);
      const dx = tx + tw1 + 5, tw2 = T(cx, ev.detail, dx, 39, FJ, P.L);
      tr.barX = dx + tw2 + 6; tr.barW = x0 + 250 - tr.barX;
      R(cx, tr.barX, 35, tr.barW, 4, P.K);
      box(cx, x0 + 254, 31, 33, 12, P.o); R(cx, x0 + 255, 32, 31, 10, P.K);
      // lane: black with a faint dot grid; the surge ring is dynamic
      for (let y = LANE_Y + 3; y < LANE_Y + LANE_H - 4; y += 6) for (let x = LX + 7; x < LX + LWd - 4; x += 6) R(cx, x, y, 1, 1, P.d);
    } else {
      dashH(cx, x0 + 3, 36, 11, P.q, 2, 2, 0); dashH(cx, x0 + 280, 36, 11, P.q, 2, 2, 0);
      R(cx, x0 + 18, 34, 3, 3, P.G);
      T(cx, 'INTAKE', x0 + 25, 39, FS, P.q); T(cx, 'nominal', x0 + 29 + tw('INTAKE', FS), 39, FJ, P.q);
      R(cx, LX, LANE_Y, LWd, LANE_H, P.g);
      for (let y = LANE_Y + 3; y < LANE_Y + LANE_H; y += 6) for (let x = LX + 7; x < LX + LWd - 4; x += 6) R(cx, x, y, 1, 1, P.z);
      dashH(cx, LX, 44, LWd, P.q, 2, 2, 0);
      dashV(cx, LX - 1, LANE_Y, LANE_H, P.q, 1, 2, 0);
      // right wall, open where the audit bay's corridor leaves the lane; solid posts mark the gate
      dashV(cx, LX + LWd, LANE_Y, tr.gTop - 3 - LANE_Y, P.q, 1, 2, 0);
      dashV(cx, LX + LWd, tr.gBot + 4, LANE_Y + LANE_H - tr.gBot - 4, P.q, 1, 2, 0);
      R(cx, LX + LWd, tr.gTop - 3, 1, 3, P.G); R(cx, LX + LWd, tr.gBot + 1, 1, 3, P.G);
      dashH(cx, LX, LANE_Y + LANE_H, LWd, P.G, 2, 2, 0);
    }
    // the rail: ten mounts, towers beside the path
    let empty = 0;
    for (let i = 0; i < tr.d.slots; i++) {
      const y0 = LANE_Y + i * ROW, ym = y0 + 7, tier = tr.d.tiers[i];
      if (i) dashH(cx, x0 + 4, y0, 60, P.d, 1, 1, 0);
      if (!tier) {
        const locked = empty >= PRICES.length;
        dashH(cx, x0 + 67, y0 + 1, 12, P.D, 2, 1, 0); dashH(cx, x0 + 67, y0 + 12, 12, P.D, 2, 1, 0);
        dashV(cx, x0 + 67, y0 + 1, 12, P.D, 2, 1, 0); dashV(cx, x0 + 78, y0 + 1, 12, P.D, 2, 1, 0);
        if (locked) { T(cx, 'LOCKED', x0 + 4, y0 + 10, FS, P.M); lock(cx, x0 + 72, y0 + 5); }
        else {
          T(cx, '+ SLOT', x0 + 4, y0 + 10, FS, P.M); T(cx, PRICES[empty], x0 + 64, y0 + 10, FJ, P.L, 'r');
          R(cx, x0 + 72, y0 + 4, 2, 6, P.M); R(cx, x0 + 70, y0 + 6, 6, 2, P.M);
        }
        empty++;
        continue;
      }
      const [tag, , lvl, ct, bay] = tier;
      T(cx, tag, x0 + 4, y0 + 10, /[a-z]/.test(tag) ? FJ : FS, tr.tag);
      for (let p = 0; p < 5; p++) R(cx, x0 + 25 + p * 4, y0 + 6, 3, 3, p < lvl ? tr.pip : P.D);
      let cs, cc;
      if (tag === 'KILL') { cs = 'OFF'; cc = P.R; }
      else if (ct != null) { cs = ct + '%'; cc = tr.tag; }
      else if (bay) { cs = 'BAY'; cc = tr.pip; } else { cs = '--'; cc = P.M; }
      T(cx, cs, x0 + 64, y0 + 10, FS, cc, 'r');
      box(cx, x0 + 67, y0 + 1, 12, 12, tr.frame);
      cx.drawImage(icon(tag, false), x0 + 68, y0 + 2);
      if (tag !== 'KILL') R(cx, x0 + 79, ym - 1, 2, 2, tr.frame); // barrel pointing into the lane
    }
    // bay column: plate, three desks, in-tray, out-tray
    const BX = tr.BX, BW = tr.BW;
    R(cx, BX, 46, BW, 9, tr.tab); T(cx, tr.bay, BX + 3, 53, FS, P.K);
    for (let d = 0; d < 3; d++) box(cx, BX, 57 + d * 19, BW, 18, P.D);
    // in-tray: a walled corridor from the lane's gate to the tray's back wall, tall enough for the whole slide
    const wx = LX + LWd + (ext ? 2 : 1);
    dashH(cx, wx, tr.gTop - 1, BX + BW - wx, tr.frame, 2, 2, 0); dashH(cx, wx, tr.gBot + 1, BX + BW - wx, tr.frame, 2, 2, 0);
    dashV(cx, BX + BW - 1, tr.gTop - 1, tr.gBot - tr.gTop + 3, tr.frame, 2, 2, 0);
    T(cx, 'OUT', BX, tr.gBot + 13, FS, P.M);
    // completion edge
    T(cx, ext ? 'DELIVERED' : 'RESEARCH', x0 + 4, 196, FS, P.M);
    if (!ext) box(cx, LX, 190, LWd, 6, P.q);
  }

  // ---------- codec band: the MSX2 screen, left to right ----------
  const CX = { youX: 8, ceoX: 132, radX: 64, radY: 200, rowY: 212, dosX: 190, dosW: 142, dlgX: 8, dlgY: 276, dlgW: 324, dlgH: 47, flashX: 132, flashY: 201 };
  function drawPortrait(cx, x, img) {
    const y = CX.rowY;
    box2(cx, x, y, 48, 60, P.G); R(cx, x + 2, y + 2, 44, 56, P.K);
    for (let j = 0; j < 28; j++) for (let i = (j & 1); i < 22; i += 2) R(cx, x + 2 + i * 2, y + 2 + j * 2, 2, 2, P.g);
    cx.drawImage(img, x + 2, y + 2);
  }
  function drawCodecStatic(cx) {
    const A = art();
    drawPortrait(cx, CX.youX, A.you);
    drawPortrait(cx, CX.ceoX, A.ceo);
    drawRadio(cx);
    drawDossierStatic(cx);
    // dialog box last, so it occludes the transceiver's lower body as in the reference
    const { dlgX: x, dlgY: y, dlgW: w, dlgH: h } = CX;
    R(cx, x, y, w, h, P.B); box2(cx, x, y, w, h, P.W);
    T(cx, SCENE.codec.speaker + ':', x + 6, y + 9, FS, P.W);
    // the caller's red meter under the dialog's corner: three ticks and a bar
    [0, 2, 4].forEach(i => R(cx, x + i, 324, 1, 5, P.R));
    box(cx, x + 7, 324, 52, 5, P.r);
    T(cx, 'CEO PATIENCE', x + 63, 329, FS, P.L);
  }

  // transceiver: 30 art px wide at 2x, antenna rising above the portraits; the dialog hides its base
  function drawRadio(cx) {
    const ox = CX.radX, oy = CX.radY;
    const A = (ax, ay, aw, ah, col) => R(cx, ox + ax * 2, oy + ay * 2, aw * 2, ah * 2, col);
    // antenna: tip, two collars, two segments
    A(7, 0, 2, 1, P.L);
    A(7, 1, 2, 2, P.M); A(7, 1, 1, 2, P.L);
    A(6, 3, 4, 1, P.D);
    A(6, 4, 4, 2, P.M); A(6, 4, 1, 2, P.L); A(7, 5, 2, 1, P.D);
    A(5, 6, 6, 1, P.D);
    // knobs
    [16, 22].forEach(k => { A(k, 4, 4, 3, P.M); A(k, 4, 4, 1, P.L); A(k + 1, 5, 2, 1, P.D); });
    // body
    A(2, 7, 26, 1, P.L); A(1, 8, 28, 31, P.M); A(1, 8, 1, 31, P.L); A(28, 8, 1, 31, P.D);
    // LCD bezel + screen
    A(3, 8, 24, 11, P.D);
    R(cx, ox + 8, oy + 18, 44, 18, P.G);
    // wedge (signal) at the LCD's top-left
    const wx = ox + 10, wy = oy + 19;
    [[6, 2], [4, 4], [3, 5], [1, 7], [0, 8]].forEach(([s, w], j) => R(cx, wx + s, wy + j, w, 1, P.g));
    // keypad well: red caps, then 7 8 9 / 4 5 6 / 1 2 3 / 0 + - ; the last row sits right on the dialog's edge
    R(cx, ox + 6, oy + 39, 48, 37, P.D); R(cx, ox + 6, oy + 39, 48, 1, P.K); R(cx, ox + 6, oy + 39, 1, 37, P.K);
    const keys = ['789', '456', '123', '0+-'];
    for (let c = 0; c < 3; c++) {
      const kx = ox + 8 + c * 16;
      R(cx, kx + 2, oy + 41, 8, 1, P.R);
      for (let r = 0; r < 4; r++) {
        const ky = oy + 44 + r * 8;
        R(cx, kx, ky, 12, 7, P.L); R(cx, kx, ky, 12, 1, P.W);
        keyGlyph(cx, keys[r][c], kx + 4, ky + 1);
      }
    }
  }
  const KG = { '0': '###,#.#,#.#,#.#,###', '1': '.#.,##.,.#.,.#.,###', '2': '###,..#,###,#..,###', '3': '###,..#,.##,..#,###', '4': '#.#,#.#,###,..#,..#',
    '5': '###,#..,###,..#,###', '6': '###,#..,###,#.#,###', '7': '###,..#,.#.,.#.,.#.', '8': '###,#.#,###,#.#,###', '9': '###,#.#,###,..#,###', '+': '...,.#.,###,.#.,...', '-': '...,...,###,...,...' };
  function keyGlyph(cx, ch, x, y) { KG[ch].split(',').forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '#') R(cx, x + i, y + j, 1, 1, P.D); }); }

  // the evidence dossier sits where the MSX2 screen keeps its green grid panel
  function drawDossierStatic(cx) {
    const x = CX.dosX, y = CX.rowY, w = CX.dosW, h = 58;
    R(cx, x, y, w, h, P.K);
    for (let gx = x + 8; gx < x + w - 2; gx += 12) R(cx, gx, y + 24, 1, h - 26, P.g);
    for (let gy = y + 28; gy < y + h - 2; gy += 12) R(cx, x + 2, gy, w - 4, 1, P.g);
    box2(cx, x, y, w, h, P.G);
    R(cx, x + 2, y + 2, w - 4, 9, P.G);
    T(cx, 'EVIDENCE DOSSIER', x + 5, y + 9, FS, P.K);
    T(cx, SCENE.gen.split(' ')[0], x + w - 5, y + 9, FS, P.g, 'r');
    hazard(cx, x + 2, y + h + 1, w - 4, 3);
    const A = art();
    SCENE.dossier.forEach(([nm, st, f], i) => {
      const yy = y + 21 + i * 13, unknown = nm === '???';
      R(cx, x + 3, yy - 7, w - 6, 11, P.K);
      let nx = x + 6;
      if (unknown) { cx.drawImage(A.box, nx, yy - 5); nx += 12; }
      T(cx, nm, nx, yy, FJ, unknown ? P.M : P.W);
      if (i === 0) { const sw = tw(st, FJ) + 6; R(cx, x + w - 6 - sw, yy - 7, sw, 9, P.W); T(cx, st, x + w - 9, yy, FJ, P.K, 'r'); }
      else T(cx, st, x + w - 7, yy, FJ, unknown ? P.M : P.L, 'r');
      const bw = w - 14; R(cx, x + 7, yy + 2, bw, 2, P.D);
      R(cx, x + 7, yy + 2, Math.round(bw * f), 2, i === 0 ? P.W : unknown ? P.q : P.G);
    });
  }

  // ---------- right column: hover card, trace, defense menu ----------
  const MENU = { x: 340, y: 297, pitch: 16, cols: 9 };
  const HOV = { x: 340, y: 201, w: 150, h: 91 };
  const TRC = { x: 499, y: 201 };
  const slotXY = i => [MENU.x + (i % MENU.cols) * MENU.pitch, MENU.y + Math.floor(i / MENU.cols) * MENU.pitch];
  function drawHoverStatic(cx) {
    const { x, y, w, h } = HOV, hv = SCENE.hover;
    checker(cx, x + w, y + 2, 2, h, P.D, 0); checker(cx, x + 2, y + h, w, 2, P.D, 0); // dithered drop shadow
    R(cx, x, y, w, h, P.K); box(cx, x, y, w, h, P.W);
    R(cx, x + 1, y + 1, w - 2, 11, P.L);
    T(cx, hv.name.toUpperCase(), x + 5, y + 9, FS, P.K);
    for (let p = 0; p < 5; p++) R(cx, x + w - 24 + p * 4, y + 5, 3, 3, p < hv.level ? P.K : P.M);
    T(cx, 'L' + hv.level, x + w - 27, y + 9, FS, P.K, 'r');
    const kl = wrap(hv.kind, FJ, w - 12);
    kl.forEach((s, i) => T(cx, s, x + 6, y + 21 + i * 8, FJ, P.L));
    let sy = y + 21 + kl.length * 8 + 2;
    hv.stats.forEach(([lab, f], i) => {
      const yy = sy + i * 8;
      T(cx, lab.toLowerCase(), x + 6, yy, FJ, P.M);
      const bx = x + 54, bw = 58; R(cx, bx, yy - 4, bw, 3, P.D); R(cx, bx, yy - 4, Math.round(bw * f), 3, i === 0 ? P.G : P.L);
      T(cx, /CATCH|ALARM/.test(lab) ? Math.round(f * 100) + '%' : String(f), x + w - 6, yy, FJ, P.W, 'r');
    });
    sy += hv.stats.length * 8 + 2;
    T(cx, hv.measured, x + 6, sy, FJ, P.Y);
    const m = hv.next.match(/^(.*?)\s*(\([^)]*\))\s*$/), main = m ? m[1] : hv.next, price = m ? m[2] : '';
    dashH(cx, x + 4, sy + 3, w - 8, P.D, 1, 1, 0);
    T(cx, main, x + 6, sy + 12, FJ, P.L);
    if (price) T(cx, price, x + w - 6, sy + 12, FJ, P.W, 'r');
  }
  function traceSteps() {
    return SCENE.codec.trace.split(' > ').map(st => {
      const sp = st.indexOf(' '), tag = sp < 0 ? st : st.slice(0, sp), rest = sp < 0 ? '' : st.slice(sp + 1);
      let col = P.M;
      if (/ok/.test(rest)) col = P.G; else if (/miss/.test(rest)) col = P.R; else if (/waved|full/.test(rest)) col = P.L; else if (tag === 'LANDED') col = P.R;
      return { tag, rest, col };
    });
  }
  const TSTEP = 28; // first trace step's baseline below TRC.y
  function drawTraceStatic(cx) {
    const { x, y } = TRC;
    T(cx, 'LEAK TRACE', x, y + 7, FS, P.L);
    dashH(cx, x, y + 10, 97, P.D, 1, 1, 0);
    // which task leaked: the reply the CEO is talking about
    const task = SCENE.extChips.find(c => /reply/.test(c)) || SCENE.extChips[0];
    T(cx, '> ' + task, x, y + 18, FJ, P.M);
    const st = traceSteps();
    R(cx, x + 2, y + TSTEP - 3, 1, (st.length - 1) * 9, P.D);
  }
  function drawMenuStatic(cx) {
    SCENE.bar.forEach(([tag, un], i) => {
      const [x, y] = slotXY(i);
      if (un) { box(cx, x, y, 14, 14, P.L); R(cx, x + 1, y + 1, 12, 12, P.d); cx.drawImage(icon(tag, false), x + 2, y + 2); }
      else { cx.drawImage(icon((tag === 'RED' || tag === 'LAB') ? 'Q' : tag, true), x + 2, y + 2); lock(cx, x + 10, y + 9); }
    });
    const nUn = SCENE.bar.filter(b => b[1]).length;
    const lx = TRC.x;
    T(cx, 'DEFENSE MENU', lx, 304, FS, P.L);
    T(cx, nUn + '/' + SCENE.bar.length + ' unlocked', lx, 314, FJ, P.M);
    lock(cx, lx + 1, 320); T(cx, 'locked: ? to discover', lx + 7, 324, FJ, P.M);
  }

  // ---------- dynamic ----------
  function drawHudDyn(cx, t) {
    const v = SCENE.cash + 37 * mod(t, 21), iv = Math.floor(v), fr = v - iv;
    const digits = String(iv).padStart(6, '0'), S = odoStrip(), xs = [13, 22, 31, 42, 51, 60];
    for (let i = 0; i < 6; i++) {
      const dv = +digits[i], pos = 5 - i;
      let roll = 0;
      if (pos === 0) roll = fr; else if (pos === 1 && digits[5] === '9') roll = fr;
      cx.drawImage(S, 0, dv * 12 + Math.round(roll * 12), 8, 12, xs[i], 4, 8, 12);
    }
  }

  function visLines(tr, t) {
    const s = (t + tr.t0) * tr.v, out = [];
    for (let k = Math.ceil((s - EXIT) / tr.PIT); k <= Math.floor((s - START) / tr.PIT); k++) {
      const L = lineInfo(tr, k); if (!L.present) continue;
      const pos = s - k * tr.PIT, y = LANE_Y + Math.round(pos), cy = y - 3;
      out.push({ k, L, pos, y, cy, n: Math.min(L.txt.length, Math.max(0, Math.floor((pos - START) * TYPE))),
        gone: L.pulled && pos >= tr.posPull, landed: L.pulled && pos >= tr.posPull + tr.v * tr.tIn, red: L.flagged && cy >= tr.ymCatch - 1, lit: false });
    }
    return out;
  }

  function drawTrackDyn(cx, tr, t) {
    const s = (t + tr.t0) * tr.v, LX = tr.LX, LWd = tr.LWd, x0 = tr.x0, ext = tr.key === 'ext';
    const vis = visLines(tr, t);
    if (ext) drawSurge(cx, tr, t);
    // which fully-typed line is beside each mount right now (towers are 14 rows apart, so no line is claimed twice)
    const jobs = [], jobOf = new Map();
    tr.d.tiers.forEach((tier, i) => {
      const [tag, , , ct, bay] = tier, ym = LANE_Y + i * ROW + 7;
      if (tag === 'KILL') return;
      let best = null, bd = 99;
      vis.forEach(o => { if (o.gone || o.n < o.L.txt.length) return; const dd = Math.abs(o.cy - ym); if (dd < bd && dd < tr.PIT / 2) { bd = dd; best = o; } });
      if (!best) return;
      if (bay) { if (best.L.pulled) { const j = { i, ym, o: best, kind: 'grab' }; jobs.push(j); jobOf.set(best, j); } return; }
      const j = { i, ym, o: best, kind: ct != null ? 'scan' : tag };
      jobs.push(j); jobOf.set(best, j);
      best.lit = true;
    });
    // lines: each one paints its own slot (backdrop, band, glyphs), then the read heads add marks in the clear rows
    clip(cx, LX + 4, LANE_Y, LWd - 8, LANE_H);
    vis.forEach(o => { if (!o.gone) drawLine(cx, tr, o, jobOf.get(o), t); else if (o.landed) ghost(cx, tr, o); });
    jobs.forEach(j => readHead(cx, tr, j, t));
    cx.restore();
    // connectors: straight across from each muzzle at its own row, then a short drop inside the lane's margin
    // (column LX+4, left of every prompt) to the line's underline; the drop never leaves that line's slot
    jobs.forEach(j => {
      const col = j.o.red ? P.R : tr.acc, flash = mod(t + j.i * 0.05, 0.16) < 0.09, yu = j.o.y + 1;
      R(cx, x0 + 81, j.ym, LX + 4 - (x0 + 81), 1, col);
      R(cx, LX + 4, Math.min(j.ym, yu), 1, Math.abs(yu - j.ym) + 1, col);
      R(cx, x0 + 81, j.ym - 1, 2, 2, flash ? col : tr.frame);
    });
    // a caught line flashes its mount while it passes; its red tag names the tower from there on
    const ymc = tr.ymCatch;
    let alert = false;
    vis.forEach(o => { if (o.L.flagged && !o.gone && o.cy >= ymc - tr.PIT / 2 && o.cy <= ymc + 9) alert = true; });
    if (alert) {
      const y0 = LANE_Y + tr.catchRow * ROW;
      R(cx, x0 + 67, y0 + 1, 12, 12, P.R); R(cx, x0 + 72, y0 + 3, 2, 5, P.W); R(cx, x0 + 72, y0 + 9, 2, 2, P.W);
      R(cx, x0 + 79, ymc - 1, 2, 2, P.R);
    }
    drawBay(cx, tr, t, s);
    drawFinish(cx, tr, t, s);
  }

  function drawSurge(cx, tr, t) {
    const x0 = tr.x0, LX = tr.LX, LWd = tr.LWd, ev = SCENE.event, left = ev.total - mod(t, ev.total);
    // plate: blinking "!" lamp, draining bar, LCD seconds (red digits over ghost segments, like the radio)
    const on = mod(t, 0.8) < 0.5;
    R(cx, x0 + 9, 34, 6, 6, on ? P.R : P.r); R(cx, x0 + 11, 35, 2, 2, P.W); R(cx, x0 + 11, 38, 2, 1, P.W);
    R(cx, tr.barX + 1, 36, Math.round((tr.barW - 2) * left / ev.total), 2, P.L);
    seg7s(cx, left.toFixed(1), x0 + 278, 33, P.R, '#1e0404'); // faint ghosts, none on the leading digit, so no stray glyph forms in front
    T(cx, 's', x0 + 280, 40, FJ, P.R);
    // marching ants around the lane: red dashes on black, crawling clockwise
    const m = Math.floor(t * 16), rx = LX - 2, rw = LWd + 4, ry = RING.y, rh = RING.h;
    for (let k = 0; k < 2; k++) {
      dashH(cx, rx, ry + k, rw, P.R, 4, 4, -m); dashH(cx, rx, ry + rh - 1 - k, rw, P.R, 4, 4, m);
      dashV(cx, rx + k, ry + 2, rh - 4, P.R, 4, 4, m); dashV(cx, rx + rw - 1 - k, ry + 2, rh - 4, P.R, 4, 4, -m);
    }
    // the gate: the ring stands open where the defer bay's corridor leaves the lane, between two solid posts
    R(cx, LX + LWd, tr.gTop - 3, 2, tr.gBot - tr.gTop + 7, P.K);
    R(cx, LX + LWd, tr.gTop - 3, 2, 3, P.R); R(cx, LX + LWd, tr.gBot + 1, 2, 3, P.R);
  }

  // the read window for a scanning mount: about four characters, never starting or ending on a space
  function readWin(tr, j) {
    const o = j.o, txt = o.L.txt, n = o.n;
    const ph = clamp((o.cy - (j.ym - tr.PIT / 2)) / tr.PIT, 0, 0.999);
    let ci = Math.floor(ph * Math.max(1, n - 3)), ce = Math.min(n, ci + 4);
    while (ci < ce && txt[ci] === ' ') ci++;
    while (ce > ci && txt[ce - 1] === ' ') ce--;
    if (ce <= ci) return null;
    const cw = cum(txt, FT), tx = tr.LX + 12;
    return { ci, ce, x0: tx + cw[ci] - 1, x1: tx + cw[ce] - 1 }; // x0..x1: one clear column either side of the glyphs
  }

  function drawLine(cx, tr, o, j, t) {
    const { L, y, n } = o, LX = tr.LX, tx = LX + 12, red = o.red, col = red ? P.R : tr.ink, txt = L.txt;
    const cw = cum(txt, FT), typed = n >= txt.length;
    const ms = String(L.mult), mw = tw(ms, FS), mx = LX + tr.LWd - 6 - mw;
    // 1. backdrop: the slot is cleared behind the glyphs, so no lattice dot ever sits against a letter
    if (red) R(cx, LX + 4, y - 8, tr.LWd - 8, 10, P.K);
    else {
      R(cx, LX + 5, y - 8, tx - LX - 5 + cw[n] + (typed ? 1 : 4), 10, tr.bg);
      if (typed) R(cx, mx - 7, y - 8, mw + 8, 10, tr.bg);
    }
    const kind = j && j.kind, win = typed && (kind === 'scan' || kind === 'PAR') ? readWin(tr, j) : null;
    // 2. the read window is a band behind the glyphs
    if (win) R(cx, win.x0, y - 8, win.x1 - win.x0 + 1, 10, kind === 'PAR' ? P.D : red ? P.r : tr.band); // dark red on a caught line, so it never merges with the "!" lamp
    // 3. prompt: the paraphraser swaps it for "≈" while it rewrites the line
    if (red) bang(cx, LX + 6, y - 7, P.R, P.W);
    else T(cx, kind === 'PAR' ? '≈' : tr.prompt, LX + 6, y, FT, o.lit ? tr.acc : tr.pc);
    // 4. glyphs
    if (!typed) { // still printing: no read head touches it yet
      Tpart(cx, txt, tx, y, FT, col, 0, cw[n]);
      R(cx, tx + cw[n], y - 5, 3, 5, col);
      return;
    }
    if (win) {
      const hot = kind === 'PAR' ? (mod(Math.floor(t * 8), 2) ? P.W : P.L) : P.W;
      Tpart(cx, txt, tx, y, FT, col, 0, cw[win.ci]);
      Tpart(cx, txt, tx, y, FT, hot, cw[win.ci], cw[win.ce] - cw[win.ci]);
      Tpart(cx, txt, tx, y, FT, col, cw[win.ce], cw[txt.length] - cw[win.ce] + 2);
    } else T(cx, txt, tx, y, FT, col);
    T(cx, ms, mx, y, FS, red ? P.R : tr.acc);
    times(cx, mx - 5, y - 4, red ? P.R : tr.xcol);
    if (red) {
      const tag = tr.catchTag + '!', ww = tw(tag, FJ) + 3, rx = mx - 8 - ww;
      R(cx, rx, y - 7, ww, 8, P.R); T(cx, tag, rx + 2, y, FJ, P.W);
    }
  }
  function ghost(cx, tr, o) { // where a line was pulled out: a dotted strike and an arrow to the bay, dithering away
    const e = (o.pos - tr.posPull) / tr.v - tr.tIn; if (e > 1.0) return;
    const w = Math.min(tw(o.L.txt, FT), tr.LWd - 30), col = o.L.flagged ? P.R : tr.dim, faint = e > 0.55;
    dashH(cx, tr.LX + 12, o.cy, w, col, 1, faint ? 5 : 2, faint ? 2 : 0);
    if (faint) return;
    const ax = tr.LX + 14 + w; R(cx, ax, o.cy, 4, 1, col); R(cx, ax + 2, o.cy - 2, 1, 1, col); R(cx, ax + 3, o.cy - 1, 1, 1, col); R(cx, ax + 3, o.cy + 1, 1, 1, col); R(cx, ax + 2, o.cy + 2, 1, 1, col);
  }

  // the clear row under a line (y+1) carries underlines and read trails. Like text-decoration-skip-ink, a rule skips
  // the column under any descender (g, p, q, y, j, comma) and one column either side, so no tail fuses into it
  const DSC = new Map();
  function inkRow(s, row) { // which columns of s carry ink on one glyph row (0: the cap line, 7: the descender row)
    const key = row + '\u0001' + s; let m = DSC.get(key); if (m) return m;
    m = new Uint8Array(tw(s, FT) + 2); let px = 0;
    for (const ch of s) { const g = gl(ch), r = g.rows[row] || ''; for (let i = 0; i < r.length; i++) if (r[i] === '#') m[px + i] = 1; px += g.w + 1; }
    DSC.set(key, m); return m;
  }
  function rule(cx, tr, o, xa, xb, col, on, off, ph) { // xa..xb inclusive on row y+1; off = 0 draws it solid
    const m = inkRow(o.L.txt, 7), tx = tr.LX + 12, per = on + off, sh = mod(ph || 0, per);
    cx.fillStyle = col;
    for (let x = xa; x <= xb; x++) {
      if (off && mod(x - xa + sh, per) >= on) continue;
      const c = x - tx; if (m[c - 1] || m[c] || m[c + 1]) continue;
      cx.fillRect(x, o.y + 1, 1, 1);
    }
  }

  // read-head marks: bands go behind the glyphs; underlines and trails take the clear row under the line (y+1), the
  // sandbox takes the spare rows between slots and the grab brackets the lane's edges. None lands on a glyph or in a
  // neighbouring letter's columns
  function readHead(cx, tr, j, t) {
    const o = j.o, txt = o.L.txt, cw = cum(txt, FT), n = o.n, LX = tr.LX, tx = LX + 12, y = o.y;
    const acc = o.red ? P.R : tr.acc;
    if (j.kind === 'grab') { brackets(cx, LX + 4, y - 8, LX + tr.LWd - 5, y + 1, acc); return; }
    if (j.kind === 'SBX') { // the sandbox boxes the line in; where the pitch leaves spare rows the box sits in them,
      // one row clear of the cap line and the descenders, so its dots never lengthen a d, an l or a p
      const w = cw[n] + 9, e = tr.PIT >= 12 ? 1 : 0, top = y - 8 - e, h = 10 + 2 * e;
      dashH(cx, LX + 4, top, w, P.Y, 1, 1, 0); dashH(cx, LX + 4, top + h - 1, w, P.Y, 1, 1, 0);
      dashV(cx, LX + 4, top, h, P.Y, 1, 1, 0); dashV(cx, LX + 4 + w, top, h, P.Y, 1, 1, 0);
      return;
    }
    if (j.kind === 'LP') { // least privilege: the read trail runs the whole line and a padlock snaps shut at its end
      const xe = tx + cw[n];
      rule(cx, tr, o, LX + 5, xe - 1, P.Y, 1, 1, 0);
      const ms = String(o.L.mult), mx = LX + tr.LWd - 6 - tw(ms, FS), lim = o.red ? mx - 8 - (tw(tr.catchTag + '!', FJ) + 3) : mx - 6;
      if (xe + 8 < lim) padlock(cx, xe + 2, y - 6, P.Y, mod(t, 0.6) < 0.3);
      return;
    }
    const w = readWin(tr, j); if (!w) return;
    // read trail: from where the connector lands, along the underline into the window
    if (w.x0 - 2 > LX + 5) rule(cx, tr, o, LX + 5, w.x0 - 3, acc, 1, 1, 0);
    // the paraphraser rewrites what it reads: a ticking rule under the window, within the band's own columns
    if (j.kind === 'PAR') { rule(cx, tr, o, w.x0, w.x1, P.L, 2, 2, -Math.floor(t * 8)); return; }
    // window: a solid underline exactly as wide as the band. No tick above: a mark in the clear row over a tall
    // edge letter (l, i, b, h) turned it into a bracket, and nothing reaches into a neighbouring letter's columns
    rule(cx, tr, o, w.x0, w.x1, acc, 1, 0, 0);
  }

  // flagged pulls are always tossed; about one in five of the merely-suspicious ones is tossed too
  function tossed(tr, j) { return mod(j, 2) === 0 || hint(j * 131 + tr.seed) % 5 === 0; }
  function pullTime(tr, j) { return ((tr.fq + tr.H * j) * tr.PIT + tr.posPull) / tr.v - tr.t0; }
  function drawBay(cx, tr, t, s) {
    const BX = tr.BX, BW = tr.BW, LX = tr.LX, A = art();
    const jNow = Math.floor((s - tr.posPull - tr.fq * tr.PIT) / (tr.H * tr.PIT));
    // the line being dragged sideways out of the stream, through the gate and down the corridor into the in-tray.
    // It rides in its own slot (drifting with the stream) at full length until its nose meets the tray's back wall,
    // then folds: the box narrows and the label steps down to the task's last words, then its keyword (the desk label).
    const eNow = t - pullTime(tr, jNow);
    if (eNow >= 0 && eNow < tr.tIn) {
      const k = tr.fq + tr.H * jNow, L = lineInfo(tr, k), f = 1 - Math.pow(1 - eNow / tr.tIn, 2), red = L.flagged;
      const yb = LANE_Y + Math.round(s - k * tr.PIT), top = yb - 8 - tr.pad, hh = 10 + 2 * tr.pad;
      const x = LX + 4 + Math.round(f * (BX + 1 - LX - 4)), wFull = tw(L.txt, FT) + 9, wEnd = Math.min(wFull, BW - 2);
      const sw = Math.min(wFull, Math.max(wEnd, BX + BW - 1 - x)), room = sw - 9;
      let lab = L.txt;
      if (tw(lab, FT) > room) { lab = keyword(L.txt, room); if (tw(lab, FT) > room) lab = fit(L.txt, FT, room); }
      clip(cx, LX + 4, tr.gTop, BX + BW - 1 - (LX + 4), tr.gBot - tr.gTop + 1);
      dashH(cx, LX + 4, yb - 3, Math.max(0, x - LX - 4), red ? P.R : tr.acc, 2, 1, -Math.floor(t * 14));
      R(cx, x, top, sw, hh, red ? P.R : tr.acc); R(cx, x + 1, top + 1, sw - 2, hh - 2, P.K);
      if (!tr.pad) { // a slip with no spare rows is the line's own slot: its rails part over tall letters and tails, as underlines do
        const up = inkRow(lab, 0), dn = inkRow(lab, 7);
        for (let c = -1; c <= up.length; c++) {
          const xx = x + 8 + c; if (xx <= x || xx >= x + sw - 1) continue;
          if (up[c - 1] || up[c] || up[c + 1]) R(cx, xx, top, 1, 1, P.K);
          if (dn[c - 1] || dn[c] || dn[c + 1]) R(cx, xx, top + hh - 1, 1, 1, P.K);
        }
      }
      if (red) bang(cx, x + 2, yb - 7, P.R, P.W); else T(cx, tr.prompt, x + 2, yb, FT, tr.pc);
      T(cx, lab, x + 8, yb, FT, red ? P.R : tr.ink);
      cx.restore();
    } else T(cx, 'IN', BX + BW - 4, tr.gBot - 1, FS, P.M, 'r');
    // desks
    const busyEnd = tr.tIn + tr.D, stampEnd = busyEnd + 1.4;
    let lift = false;
    for (let d = 0; d < 3; d++) {
      const dy = 57 + d * 19;
      let j = jNow - mod(jNow - d, 3), e = t - pullTime(tr, j);
      if (e < tr.tIn) { j -= 3; e = t - pullTime(tr, j); }
      const L = lineInfo(tr, tr.fq + tr.H * j), worker = tr.key === 'ext' ? A.robot : A.clerk;
      if (e >= tr.tIn && e < tr.tIn + 0.35) lift = true;
      if (e >= tr.tIn && e < busyEnd) {
        const p = (e - tr.tIn) / tr.D;
        cx.drawImage(worker, BX + 1, dy + 1);
        if (mod(t * 3 + d, 1) < 0.5) R(cx, BX + 4, dy + 13, 10, 3, P.W); // paper in hand
        // label and progress bar keep two clear columns from the worker sprite (BX+16) and from the desk's right border (BX+55)
        T(cx, keyword(L.txt, DESK_W), BX + 19, dy + 9, FT, L.flagged ? P.R : P.L);
        R(cx, BX + 19, dy + 12, DESK_W - 1, 2, P.D); R(cx, BX + 19, dy + 12, Math.round((DESK_W - 1) * p), 2, tr.acc);
      } else if (e >= busyEnd && e < stampEnd) {
        const ok = !tossed(tr, j), col = ok ? P.G : P.R, fresh = e - busyEnd < 0.12;
        R(cx, BX + 1, dy + 1, BW - 2, 16, P.K);
        R(cx, BX + 2, dy + 3, BW - 4, 12, fresh ? col : P.K);
        box(cx, BX + 2, dy + 3, BW - 4, 12, fresh ? P.W : ok ? P.q : P.r);
        T(cx, ok ? 'APPROVED' : 'TOSSED', BX + (BW >> 1), dy + 12, FS, fresh ? P.W : col, 'c');
      } else {
        cx.drawImage(tr.key === 'ext' ? A.robotI : A.clerkI, BX + 1, dy + 1);
        T(cx, 'FREE', BX + 19, dy + 11, FS, P.M);
      }
    }
    // connector from in-tray up to the desks
    const cTop = 57 + 3 * 19 - 1, cH = tr.gTop - 1 - cTop;
    if (cH > 0) dashV(cx, BX + 9, cTop, cH, lift ? tr.acc : P.D, 2, 1, lift ? Math.floor(t * 20) : 0);
    // out-tray: the last eight verdicts, newest first
    const jDone = Math.floor(((t - busyEnd + tr.t0) * tr.v - tr.posPull - tr.fq * tr.PIT) / (tr.H * tr.PIT));
    for (let i = 0; i < 8; i++) {
      const j = jDone - i, x = BX + i * 7, y = tr.gBot + 16, tz = tossed(tr, j);
      R(cx, x, y, 6, 8, tz ? P.r : P.g);
      if (tz) { R(cx, x + 1, y + 2, 1, 1, P.R); R(cx, x + 4, y + 2, 1, 1, P.R); R(cx, x + 2, y + 3, 2, 2, P.R); R(cx, x + 1, y + 5, 1, 1, P.R); R(cx, x + 4, y + 5, 1, 1, P.R); }
      else { R(cx, x + 1, y + 4, 1, 1, P.G); R(cx, x + 2, y + 5, 1, 1, P.G); R(cx, x + 3, y + 4, 1, 1, P.G); R(cx, x + 4, y + 3, 1, 1, P.G); R(cx, x + 4, y + 2, 1, 1, P.G); }
    }
  }

  function drawFinish(cx, tr, t, s) {
    const LX = tr.LX, A = art();
    if (tr.key === 'ext') {
      // coin pops rise out of the lane's bottom edge as lines complete
      const life = 2.2, kHi = Math.floor((s - EXIT) / tr.PIT), kLo = Math.ceil((s - EXIT - life * tr.v) / tr.PIT);
      for (let k = kLo; k <= kHi; k++) {
        const L = lineInfo(tr, k); if (!L.present || L.pulled) continue;
        const e = (s - EXIT - k * tr.PIT) / tr.v; if (e < 0 || e > life) continue;
        const frog = L.txt === 'poem about a frog', val = frog ? SCENE.coins[3] : SCENE.coins[mod(k, 3)];
        const x = LX + 8 + mod(k, 3) * 45, yb = 194 - Math.min(2, Math.floor(e * 6)); // 194..192: the $ and its shadow keep a clear row from the frame (197) and the ring (184)
        if (frog) cx.drawImage(A.frog, x, yb - 5); else cx.drawImage(e > 1.8 ? A.coinD : A.coin, x, yb - 6);
        if (e < 1.95) { T(cx, val.toUpperCase(), x + 10, yb + 1, FS, P.h); T(cx, val.toUpperCase(), x + 9, yb, FS, frog ? P.Y : P.W); }
      }
      // running total for this surge, where the internal track shows its R&D progress
      const tot = '+$' + (12.3 + 0.2 * Math.floor(mod(t, 21) * 1.4)).toFixed(1) + 'K';
      cx.drawImage(A.coin, tr.BX, 187);
      T(cx, tot, tr.BX + 10, 195, FS, P.o); T(cx, tot, tr.BX + 9, 194, FS, P.W); // the $ tail's shadow ends on row 195, the frame is 197
    } else {
      const p = 0.36 + 0.3 * (mod(t, 21) / 21), w = Math.round((tr.LWd - 2) * p);
      R(cx, LX + 1, 191, w, 4, P.G);
      if (mod(s - EXIT, tr.PIT) / tr.v < 0.2) R(cx, LX + w - 2, 191, 2, 4, P.W);
      T(cx, Math.round(p * 100) + '% > G4', tr.BX, 196, FS, P.G);
    }
  }

  // the call: two pages typed on at 2x, a beat before the punchline, the ▼ prompt between pages
  let DLG = null;
  function dialog() {
    if (DLG) return DLG;
    const line0 = SCENE.codec.line, maxW = Math.floor((CX.dlgW - 32) / 2), rate = 24;
    const sents = (line0.match(/[^.!?]+[.!?]+/g) || [line0]).map(x => x.trim());
    const p1 = wrapBal(sents[0], FJ, maxW), p2 = [];
    sents.slice(1).forEach(x => wrapBal(x, FJ, maxW).forEach(l => p2.push(l)));
    const raw = p2.length ? [p1, p2] : [p1], pages = [];
    raw.forEach(p => { for (let i = 0; i < p.length; i += 2) pages.push(p.slice(i, i + 2)); });
    let tEnd = 0.4;
    const out = pages.map((lines, pi) => {
      const start = pi === 0 ? 0.4 : Math.max(tEnd + 2.4, 5.0); let tt = start;
      const lt = lines.map((ln, li) => { const t0 = tt; tt += ln.length / rate; if (/[.!?]$/.test(ln) && li < lines.length - 1) tt += 0.7; return t0; });
      tEnd = tt; return { lines, lt, start, end: tt };
    });
    const res = { pages: out, rate };
    if (fontsOK) DLG = res; return res;
  }

  function drawCodecDyn(cx, t) {
    const A = art(), y = CX.rowY, tl = mod(t, 21);
    // incident flash over the caller + status lamps
    const on = mod(t, 0.7) < 0.45, fx = CX.flashX, fy = CX.flashY;
    const kind = SCENE.codec.kind, what = SCENE.codec.what, w1 = tw(kind, FS), w2 = tw(what, FJ), fw = 13 + w1 + 9 + w2 + 5;
    R(cx, fx, fy, fw, 10, on ? P.R : P.r); box(cx, fx, fy, fw, 10, P.R);
    R(cx, fx + 4, fy + 2, 2, 4, P.W); R(cx, fx + 4, fy + 7, 2, 1, P.W);
    T(cx, kind, fx + 10, fy + 8, FS, on ? P.W : P.R);
    R(cx, fx + 13 + w1, fy + 4, 2, 2, on ? P.W : P.R);
    T(cx, what, fx + 18 + w1, fy + 8, FJ, on ? P.W : P.L);
    let lx = fx + fw + 6;
    R(cx, lx, fy + 3, 5, 5, mod(t, 0.5) < 0.3 ? P.R : P.r); lx += 7 + T(cx, 'EXT', lx + 7, fy + 8, FJ, P.L) + 5;
    box(cx, lx, fy + 3, 5, 5, P.q); T(cx, 'INT', lx + 7, fy + 8, FJ, P.q);
    // dialog pages
    const D = dialog(), dx = CX.dlgX + 20, dy = CX.dlgY;
    let pg = D.pages[0]; D.pages.forEach(p => { if (tl >= p.start) pg = p; });
    let typing = false, lastX = dx, lastY = dy + 24;
    pg.lines.forEach((ln, i) => {
      const yy = dy + 24 + i * 15, nn = clamp(Math.floor((tl - pg.lt[i]) * D.rate), 0, ln.length);
      if (nn < ln.length && tl >= pg.lt[i]) typing = true;
      if (nn <= 0) return;
      const cw = cum(ln, FJ); T2(cx, ln, dx, yy, FJ, P.W, cw[nn] + (nn === ln.length ? 2 : 0));
      lastX = dx + cw[nn] * 2; lastY = yy;
    });
    if (typing) { if (mod(t, 0.2) < 0.13) R(cx, lastX + 2, lastY - 10, 6, 10, P.W); }
    else if (tl >= pg.end && mod(t, 0.8) < 0.5) { // ▼ prompt
      const ax = CX.dlgX + CX.dlgW - 16, ay = dy + CX.dlgH - 11;
      R(cx, ax, ay, 7, 1, P.W); R(cx, ax + 1, ay + 1, 5, 1, P.W); R(cx, ax + 2, ay + 2, 3, 1, P.W); R(cx, ax + 3, ay + 3, 1, 1, P.W);
    }
    // the caller's patience drains over the call
    R(cx, CX.dlgX + 8, 325, Math.round(50 * (0.78 - 0.5 * tl / 21)), 3, P.R);
    // CEO talks while the line types on; you blink
    if (typing && mod(t, 0.16) < 0.08) R(cx, CX.ceoX + 2 + 6 * 2, y + 2 + 19 * 2, 12, 2, P.K);
    if (mod(t, 3.7) < 0.14) { R(cx, CX.youX + 2 + 8 * 2, y + 2 + 10 * 2, 4, 2, P.n); R(cx, CX.youX + 2 + 15 * 2, y + 2 + 10 * 2, 4, 2, P.n); }
    // tuning noise when the call opens and when the frequency slips
    const slip = tl > 19.1 && tl < 19.5;
    if (tl < 0.7 || slip) cx.drawImage(A.noise[Math.floor(t * 30) & 3], CX.ceoX + 2, y + 2);
    // codec-open wipe: a scanline band opens the portraits
    if (tl < 0.2) {
      const hh = Math.floor(28 * tl / 0.2);
      [CX.youX, CX.ceoX].forEach(px => {
        R(cx, px + 2, y + 2, 44, 28 - hh, P.K); R(cx, px + 2, y + 30 + hh, 44, 28 - hh, P.K);
        R(cx, px + 2, y + 30 - hh, 44, 1, P.G); R(cx, px + 2, y + 29 + hh, 44, 1, P.G);
      });
    }
    // radio LCD: signal dots, RECV, frequency
    const ox = CX.radX, oy = CX.radY;
    const bars = 1 + Math.floor(mod(t * 3, 3));
    for (let i = 0; i < 3; i++) { if (i < bars) R(cx, ox + 21 + i * 3, oy + 21, 2, 2, P.g); else checker(cx, ox + 21 + i * 3, oy + 21, 2, 2, P.q, 0); }
    const recv = typing || mod(t, 1) < 0.6;
    T(cx, 'RECV', ox + 50, oy + 24, FJ, recv ? P.g : P.q, 'r');
    seg7(cx, slip ? '140.85' : SCENE.codec.freq, ox + 50, oy + 25, P.g, P.q);
  }

  function drawRightDyn(cx, t) {
    // hovered icon (TM) pulses; a notch ties the card to it
    const i = SCENE.bar.findIndex(b => b[0] === 'TM'), [x, y] = slotXY(i);
    const on = mod(t, 0.9) < 0.6;
    box(cx, x, y, 14, 14, on ? P.W : P.L); box(cx, x - 1, y - 1, 16, 16, on ? P.G : P.K);
    const nx = x + 7, by = HOV.y + HOV.h;
    R(cx, nx - 3, by, 7, 1, P.W); R(cx, nx - 2, by + 1, 5, 1, P.W); R(cx, nx - 1, by + 2, 3, 1, P.W); R(cx, nx, by + 3, 1, 2, P.W);
    // trace: steps light up in order, LANDED blinks
    const st = traceSteps(), cur = Math.floor(mod(t * 2.2, st.length + 2)), tx = TRC.x, ty = TRC.y;
    st.forEach((s0, k) => {
      const yy = ty + TSTEP + k * 9, lit = k <= cur;
      R(cx, tx + 1, yy - 4, 3, 3, lit ? s0.col : P.D);
      if (k === cur) box(cx, tx, yy - 5, 5, 5, P.W);
      if (s0.tag === 'LANDED') {
        const blink = lit && mod(t, 0.5) < 0.3, ww = tw(s0.tag, FS) + 5;
        R(cx, tx + 7, yy - 7, ww, 9, blink ? P.R : P.r); T(cx, s0.tag, tx + 10, yy, FS, P.W);
      } else {
        const w1 = T(cx, s0.tag, tx + 7, yy, FS, lit ? P.W : P.M);
        if (s0.rest) T(cx, s0.rest, tx + 10 + w1, yy, FJ, lit ? s0.col : P.D);
      }
    });
    // dossier: in-progress evidence shimmer
    const bw = CX.dosW - 14;
    SCENE.dossier.forEach(([, , f], j) => {
      if (j === 0) return;
      const yy = CX.rowY + 21 + j * 13, fw = Math.round(bw * f), sx = Math.floor(mod(t * 20, fw + 10)) - 4;
      if (sx >= 0 && sx < fw - 1) R(cx, CX.dosX + 7 + sx, yy + 2, 2, 2, j === 1 ? P.Y : P.G);
    });
  }

  let LO = null, g = null, ST = null;
  VARIANTS.b = {
    name: "Transceiver '90",
    blurb: 'An MSX2 transceiver screen painted at 600x330 and blown up 2x, so every pixel is a block: you and the CEO face off in side-lit portraits across a walkie-talkie tuned to 141.80, and the big blue dialog pages through the bad news. Defenses are turrets on each track\'s left rail that fire a beam straight across to the line passing beside them and read it through a lit window behind the letters as it scrolls by, while the bays drag caught lines sideways through a gate in the lane wall onto desks without ever stopping the stream.',
    fonts: ['Silkscreen', 'Tiny5'],
    draw(c, t) {
      if (!LO) { LO = mk(LW, LH); g = LO.getContext('2d'); }
      g.imageSmoothingEnabled = false;
      const ready = fontsReady();
      if (ready && !ST) { ST = mk(LW, LH); drawStatic(ST.getContext('2d')); }
      if (ST) g.drawImage(ST, 0, 0); else drawStatic(g);
      trim();
      drawHudDyn(g, t);
      TRK.forEach(tr => drawTrackDyn(g, tr, t));
      drawCodecDyn(g, t);
      drawRightDyn(g, t);
      c.save(); c.imageSmoothingEnabled = false;
      c.drawImage(LO, 0, 0, W, H); c.restore();
    },
  };
})();
