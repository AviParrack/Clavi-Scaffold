// Variant A — Codec '98. Green-phosphor homage to the 1998 PlayStation codec, with a nod to the MSX2 transceiver LCD.
// Static chrome is painted once into offscreen layers; each frame blits it and draws only what moves.
(function () {
  'use strict';

  VARIANTS.a = {
    name: "Codec '98",
    blurb: "One green phosphor on a black void, after the 1998 codec: the CEO calls in on 141.80 and red is saved for alarms. Defenses are towers on each track's left rail; as a task line scrolls past, its tower fires a beam and a bright bar sweeps across the line, and the bay towers hook lines out sideways through a door while the rest keep flowing.",
    fonts: ['VT323', 'Press Start 2P'],
    draw: function (c, t) { drawFrame(c, t); }
  };

  // ask for the faces up front so the very first frame already has them
  try { document.fonts.load('16px VT323'); document.fonts.load('8px "Press Start 2P"'); } catch (e) { /* no FontFace API */ }

  const S = window.SCENE;
  const C = {
    bg: '#020805', g0: '#05140b', g1: '#0c2a18', g2: '#13472a', g3: '#1e7444', g4: '#35b36a', g5: '#5fe39a', g6: '#8affc1',
    red: '#ff3b3b', redD: '#3a0a0a', redM: '#9a2222', redB: '#4a0e0e', k: '#000000', lane: '#07170e', chip: '#020a06', lcd: '#04170c'
  };
  const FV = n => n + 'px VT323';
  const FP = n => n + 'px "Press Start 2P"';

  // ---------------------------------------------------------------- geometry
  const BODY_Y = 98, MP = 46, BODY_H = 460, BODY_B = BODY_Y + BODY_H; // ten mounts, 46px apart
  const TW = 116, GUT = 18, BW = 64, CW = 6, INTAKE = 11; // tower plate, tower-to-lane gutter, bay, VT323 16px advance
  // a line stays invisible until its top (chip edge, 9px above centre) has cleared the intake band, then fades in over 8px of travel
  const BAND_B = BODY_Y + INTAKE, ROW_TOP = 9, ROW_FADE = 8, ROW_FULL = BAND_B + ROW_TOP + ROW_FADE;
  const SHORT = { 'Jailbreak Classifier': 'JB Classifier' };
  const nameOf = tier => SHORT[tier[1]] || tier[1];
  const TRK = [
    { key: 'ext', x: 8, LW: 196, TX0: 14, d: S.ext, chips: S.extChips, flagged: S.flaggedExt, solid: true,
      v: 45, P: 24, RH: 5, ph: -0.022, hookOff: 8, step: 4.8, pivot: 1, flagP: 18, flagRes: 3, pullRes: 1, PULL: 0.5, D: 2.6, SD: 1.0,
      tags: ['×60', '×90', '×120', '×150', '×300'], desks: 2, bay: 'DEFER', ghost: 'DEFERRED', mult: 3 },
    { key: 'int', x: 428, LW: 188, TX0: 16, d: S.int, chips: S.intChips, flagged: S.flaggedInt, solid: false,
      v: 17.6, P: 34, RH: 7, ph: 12.795, hookOff: 5, step: 12, pivot: 2, flagP: 12, flagRes: 5, pullRes: 2, PULL: 0.9, D: 7.5, SD: 1.6,
      tags: ['×20', '×40', '×40', '×80'], desks: 3, bay: 'AUDIT', ghost: 'AUDITING', mult: 1 }
  ];
  TRK.forEach(tr => {
    tr.LX = tr.x + TW + GUT; tr.BX = tr.LX + tr.LW + 6; tr.BW = BW; tr.XR = tr.BX + BW;
    tr.bayM = tr.d.tiers.findIndex(q => q[4] === 'bay');
    tr.bayY = BODY_Y + 23 + tr.bayM * MP;
    tr.pool = tr.chips.filter(s => s !== tr.flagged);
    tr.bayTop = tr.bayY - 40;
    tr.deskY = d => tr.bayY + 16 + d * 40;
    tr.bayBot = tr.deskY(tr.desks) + 28;
    tr.door = 20;
    tr.y0 = tr.bayY - tr.hookOff; // where a hooked line leaves the flow
    // the payout lane under the finish line: between DELIVERED and SURGE in public, under the R&D bar in the lab
    tr.lane = tr.solid ? { x: 88, pitch: 64, cols: 4, gap: 0.45, rise: 16 } : { x: tr.LX + 4, pitch: 56, cols: 3, gap: 0.8, rise: 8 };
    // each reader's scan point sits a few px off its mount centre so that, line after line, the towers fire as a downward cascade
    const ym = m => BODY_Y + 23 + m * MP, readers = [];
    tr.d.tiers.forEach((q, m) => { if (q[0] !== 'KILL' && q[4] !== 'bay') readers.push(m); });
    const ip = readers.indexOf(tr.pivot), base = ym(tr.pivot);
    tr.scan = [];
    readers.forEach((m, i) => { const want = base + (i - ip) * tr.step; const d = want - ym(m) + tr.P / 2; tr.scan[m] = ym(m) + Math.round(((d % tr.P) + tr.P) % tr.P - tr.P / 2); });
    // a reader whose window would open while its line is still fading in under the intake reads the next line down instead, on the same beat
    readers.forEach(m => { while (tr.scan[m] - tr.RH < ROW_FULL) tr.scan[m] += tr.P; });
  });
  const WALL = 414; // the wall between public and lab: x 414..421

  // short names for the tickets and bay slots, where a whole task line will not fit (8 cells at most)
  const SHORTN = {
    'migrate auth to OAuth2': 'OAuth2', 'reply to enterprise RFP': 'RFP', 'translate docs to 12 langs': 'localize', 'build sql dashboard': 'sql dash',
    'refactor billing service': 'billing', 'summarise earnings call': 'earnings', 'write onboarding flow': 'onboard', 'poem about a frog': 'poem',
    'run lr sweep on 8 GPUs': 'lr sweep', 'ablate attention heads': 'ablate', 'replicate scaling fit': 'scaling', 'quietly change eval seed': 'reseed',
    'tune k8s autoscaler': 'k8s tune', 'design long-ctx eval': 'ctx eval', 'dedupe crawl shard 41': 'dedupe', 'draft NeurIPS intro': 'NeurIPS'
  };
  const FROGT = 'poem about a frog';

  // ---------------------------------------------------------------- helpers
  const mod = (a, m) => ((a % m) + m) % m;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = u => u * u * (3 - 2 * u);
  function hash(n, salt) { const r = seeded(mod(n * 7919 + salt * 104729 + 31337, 2147483000) + 1); r(); return r(); }
  function mk(w, h) { const v = document.createElement('canvas'); v.width = w; v.height = h; return v; }
  // VT323 ships fi/ffi ligatures; a zero-width non-joiner keeps every glyph on its 6px cell
  const NL = (s, f) => f.indexOf('VT323') >= 0 ? s.replace(/f(?=[fil])/g, 'f‌') : s;
  // VT323 smears the middle strokes of M and m into grey at 16 and 20px, and the scanlines finish them off ('TM miss' read 'TN niss').
  // At those sizes the two letters are drawn as crisp glyphs on the font's own cell; every other letter is still the font.
  // At 20px the font's stems are about 2px of ink (a lit column with soft half-lit edges), so there every stroke is a lit column ('#')
  // plus a half-lit one ('+') on its right: the same letter shapes, but as heavy as the 'o' and 'e' beside them. dx: offset into the cell.
  const PXG = {
    16: { dx: 1, M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
          m: ['.#.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#'] },
    20: { dx: 0, M: ['#+...#+', '##+.##+', '##+.##+', '#+##+#+', '#+##+#+', '#+...#+', '#+...#+', '#+...#+', '#+...#+', '#+...#+', '#+...#+'],
          m: ['.##+##+.', '#+.#+.#+', '#+.#+.#+', '#+.#+.#+', '#+.#+.#+', '#+.#+.#+', '#+.#+.#+', '#+.#+.#+'] }
  };
  function gsprite(x, m, X, Y, col) { // a PXG glyph: '#' lit, '+' half-lit (the mask gets the same coverage, so scanlines thin out to match)
    const a = x.globalAlpha; x.fillStyle = col;
    for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) {
      const ch = m[j][i]; if (ch === '.') continue;
      x.globalAlpha = ch === '#' ? a : a * 0.55; x.fillRect(X + i, Y + j, 1, 1);
    }
    x.globalAlpha = a;
  }
  // Text mask: while MK is set, every glyph is also drawn into it (same transform, alpha and clip), and the scanline overlay skips those pixels.
  let MK = null, MKI = null;
  const CAN_MASK = typeof DOMMatrix === 'function' && typeof CanvasRenderingContext2D !== 'undefined' && !!CanvasRenderingContext2D.prototype.getTransform;
  function mrel(x) { MK.setTransform(MKI.multiply(x.getTransform())); MK.globalAlpha = x.globalAlpha; }
  function msprite(x, m, X, Y, sc, col) { sprite(x, m, X, Y, sc, col); if (MK) { mrel(x); sprite(MK, m, X, Y, sc, '#fff'); } }
  function clipR(x, X, Y, w, h) { x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip(); if (MK) { MK.save(); mrel(x); MK.beginPath(); MK.rect(X, Y, w, h); MK.clip(); } }
  function unclip(x) { x.restore(); if (MK) MK.restore(); }
  function T(x, s, X, Y, f, col, al) {
    const str = NL(s, f), g = f.indexOf('VT323') >= 0 && /[Mm]/.test(s) ? PXG[parseInt(f, 10)] : null;
    x.font = f; x.fillStyle = col; x.textBaseline = 'alphabetic';
    if (MK) { mrel(x); MK.font = f; MK.fillStyle = '#fff'; MK.textBaseline = 'alphabetic'; }
    if (!g) {
      x.textAlign = al || 'left'; x.fillText(str, X, Y);
      if (MK) { MK.textAlign = al || 'left'; MK.fillText(str, X, Y); }
      return;
    }
    x.textAlign = 'left'; if (MK) MK.textAlign = 'left';
    const w = x.measureText(str).width;
    let cx = al === 'center' ? X - w / 2 : al === 'right' ? X - w : X;
    str.split(/([Mm])/).forEach(run => {
      if (!run) return;
      const adv = x.measureText(run).width;
      if (run === 'M' || run === 'm') {
        const gl = g[run], gx = Math.round(cx) + g.dx, gy = Y - gl.length;
        gsprite(x, gl, gx, gy, col); if (MK) gsprite(MK, gl, gx, gy, '#fff');
      } else { x.fillText(run, cx, Y); if (MK) MK.fillText(run, cx, Y); }
      cx += adv;
    });
  }
  function R(x, X, Y, w, h, col) { x.fillStyle = col; x.fillRect(X, Y, w, h); }
  function TX(x, s, X, Y, f, col) { // VT323's '×' is a full-size X; draw the small times sprite in its cell instead
    const parts = s.split('×'); let cx = X;
    parts.forEach((pt, i) => { T(x, pt, cx, Y, f, col); cx += TWd(x, pt, f); if (i < parts.length - 1) { msprite(x, TIMES, cx, Y - 7, 1, col); cx += 6; } });
  }
  function TWd(x, s, f) { x.font = f; return Math.ceil(x.measureText(NL(s, f)).width); }
  function box(x, X, Y, w, h, col) { R(x, X, Y, w, 1, col); R(x, X, Y + h - 1, w, 1, col); R(x, X, Y, 1, h, col); R(x, X + w - 1, Y, 1, h, col); }
  function rbox(x, X, Y, w, h, col) { R(x, X + 1, Y, w - 2, 1, col); R(x, X + 1, Y + h - 1, w - 2, 1, col); R(x, X, Y + 1, 1, h - 2, col); R(x, X + w - 1, Y + 1, 1, h - 2, col); }
  function dbox(x, X, Y, w, h, col, on, off) {
    on = on || 2; off = off || 2; x.fillStyle = col;
    for (let i = 0; i < w; i += on + off) { const l = Math.min(on, w - i); x.fillRect(X + i, Y, l, 1); x.fillRect(X + i, Y + h - 1, l, 1); }
    for (let i = 0; i < h; i += on + off) { const l = Math.min(on, h - i); x.fillRect(X, Y + i, 1, l); x.fillRect(X + w - 1, Y + i, 1, l); }
  }
  function bevel(x, X, Y, w, h, fill, hi, lo) { R(x, X, Y, w, h, fill); R(x, X, Y, w, 1, hi); R(x, X, Y, 1, h, hi); R(x, X, Y + h - 1, w, 1, lo); R(x, X + w - 1, Y, 1, h, lo); }
  function pips(x, X, Y, lvl, on, off) { for (let i = 0; i < 5; i++) { if (i < lvl) R(x, X + i * 6, Y, 4, 7, on); else box(x, X + i * 6, Y, 4, 7, off); } }
  function hatch(x, X, Y, w, h, col, step) { // diagonal 1px hatch; one fillRect per lit pixel
    x.fillStyle = col;
    for (let j = 0; j < h; j++) for (let i = mod(-(X + Y + j), step); i < w; i += step) x.fillRect(X + i, Y + j, 1, 1);
  }
  function sprite(x, m, X, Y, sc, col) { for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) if (m[j][i] === '#') R(x, X + i * sc, Y + j * sc, sc, sc, col); }
  const TIMES = ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'];
  const CHEV = ['#..', '.#.', '..#', '.#.', '#..'];
  const DOWN = ['#######', '.#####.', '..###..', '...#...'];
  const DIG = { 1: ['.#.', '##.', '.#.', '.#.', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'] };
  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const BANG = ['.##.', '####', '####', '####', '####', '.##.', '.##.', '.##.', '....', '.##.', '####', '.##.'];
  const FROG = ['#..#', '####', '.##.', '#..#'];
  function bang(o, X, yc, sc) { // the guard's '!': red with a black keyline, centred on yc
    const h = BANG.length * sc, Y = Math.round(yc - h / 2);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) sprite(o, BANG, X + dx, Y + dy, sc, C.k);
    sprite(o, BANG, X, Y, sc, C.red);
  }

  // ---------------------------------------------------------------- pixel icons (9x9, '#' bright, '+' mid)
  const ICON = {
    JB: ['#########', '#+++#+++#', '#++#++++#', '#+++#+++#', '.#+#+++#.', '.#++#++#.', '..#+#+#..', '...#+#...', '....#....'], // shield, cracked
    PRB: ['......##.', '.....#++#', '....#++#.', '...#+##..', '..#+#....', '.#+#.....', '.##......', '#........', '#........'],
    TM: ['.........', '..#####..', '.#+++++#.', '#++###++#', '#++#.#++#', '#++###++#', '.#+++++#.', '..#####..', '.........'],
    UM: ['.......#.', '..####.#.', '.#++++#..', '#++##+#+#', '#++#.#++#', '#+###++#.', '.##+++#..', '.#####...', '#........'],
    PAR: ['.........', '######...', '.........', '####..#..', '.....####', '......#..', '.#.......', '####.....', '.#..#####'],
    DEF: ['.........', '####.....', '...#.....', '...#..#..', '...#####.', '......#..', '.#######.', '.#+++++#.', '.#######.'],
    KILL: ['....#....', '.#..#..#.', '#...#...#', '#...#...#', '#.......#', '#.......#', '.#.....#.', '..#####..', '.........'],
    CoT: ['.#######.', '#+++++++#', '#+#+#+#+#', '#+++++++#', '.###+###.', '...#+#...', '....#....', '..##.....', '.##......'],
    EGR: ['#########', '.#+++++#.', '..#+++#..', '...#+#...', '...#+#...', '...#+#...', '...#.#...', '....#....', '....#....'],
    SBX: ['#.......#', '#.......#', '#..###..#', '#..#+#..#', '#..###..#', '#.......#', '#########', '.........', '.........'],
    LP: ['.###.....', '#+++#....', '#+.+#....', '#+++#####', '.###..#.#', '......#..', '.........', '.........', '.........'],
    AUD: ['...###...', '..#+++#..', '..#+++#..', '...###...', '.#######.', '#+++++++#', '#+++++++#', '#+++++++#', '.........'],
    RES: ['#########', '#.......#', '#.#####.#', '#.......#', '#.#####.#', '#.......#', '#.#####.#', '#.......#', '#########'],
    RATE: ['#########', '.#+++++#.', '..#+++#..', '...#+#...', '....#....', '...#.#...', '..#...#..', '.#+++++#.', '#########'],
    HNY: ['..#####..', '...#.#...', '.#######.', '#+++++++#', '#++#++++#', '#+++++++#', '#+++++++#', '.#+++++#.', '..#####..'],
    CAN: ['...##....', '..#+.#...', '..#++###.', '.#+++#...', '#++++#...', '.#++++#..', '..####...', '...#.#...', '.........'],
    RED: ['....#....', '..#####..', '.#..#..#.', '.#..#..#.', '#########', '.#..#..#.', '.#..#..#.', '..#####..', '....#....'],
    LAB: ['...###...', '....#....', '....#....', '...#+#...', '..#+++#..', '.#+++++#.', '#+++++++#', '#########', '.........']
  };
  function icon(x, tag, X, Y, sc, hi, mid) { // mid === null: outline only (locked silhouettes keep their contour)
    const m = ICON[tag]; if (!m) return;
    for (let r = 0; r < 9; r++) for (let q = 0; q < 9; q++) {
      const ch = m[r][q]; if (ch === '.' || (ch === '+' && mid === null)) continue;
      x.fillStyle = ch === '#' ? hi : mid; x.fillRect(X + q * sc, Y + r * sc, sc, sc);
    }
  }

  // ---------------------------------------------------------------- 7-segment readout
  const SEG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  function seg7(x, X, Y, w, h, th, d, on, off) {
    const hs = th / 2, mid = Y + Math.floor((h - th) / 2);
    const H = (x1, x2, y) => [[x1 + 1, y + hs], [x1 + 1 + hs, y], [x2 - 1 - hs, y], [x2 - 1, y + hs], [x2 - 1 - hs, y + th], [x1 + 1 + hs, y + th]];
    const V = (xx, y1, y2) => [[xx + hs, y1 + 1], [xx + th, y1 + 1 + hs], [xx + th, y2 - 1 - hs], [xx + hs, y2 - 1], [xx, y2 - 1 - hs], [xx, y1 + 1 + hs]];
    const P = { a: H(X, X + w, Y), g: H(X, X + w, mid), d: H(X, X + w, Y + h - th), f: V(X, Y, mid + hs), e: V(X, mid + hs, Y + h), b: V(X + w - th, Y, mid + hs), c: V(X + w - th, mid + hs, Y + h) };
    for (const k in P) {
      const lit = d !== null && SEG[d].indexOf(k) >= 0;
      if (!lit && off === null) continue;
      x.fillStyle = lit ? on : off;
      x.beginPath(); P[k].forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill();
    }
  }

  // ---------------------------------------------------------------- portraits (procedural grey -> ordered dither -> green)
  // Painted at 52x63 and shown at 2x. Faces sit in the mid-tones with dark shadow masses; only rim and specular light reach the top level.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const PLV = [C.bg, C.g1, C.g2, C.g3, C.g4, C.g5, C.g6];
  const G = v => 'rgb(' + v + ',' + v + ',' + v + ')';
  function lg(g, x1, y1, x2, y2, stops) { const q = g.createLinearGradient(x1, y1, x2, y2); stops.forEach(s => q.addColorStop(s[0], G(s[1]))); return q; }
  function rg(g, x, y, r0, r1, stops) { const q = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(s => q.addColorStop(s[0], s[1])); return q; }
  function poly(g, pts, fill) { g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); }
  function line(g, pts, col, lw) { g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
  function ell(g, x, y, rx, ry, fill) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  const shade = (a) => 'rgba(0,0,0,' + a + ')';
  const PZ = 1.2; // codec close-up: the figure is zoomed about the face, the backdrop is not
  const zoom = g => g.setTransform(PZ, 0, 0, PZ, 26 * (1 - PZ), 25 * (1 - PZ));

  function headCEO(g) { g.beginPath(); g.moveTo(12.5, 23); g.bezierCurveTo(11.5, 9, 40.5, 7.5, 40, 22.5); g.bezierCurveTo(40.4, 32, 37.5, 39, 31.5, 42.6); g.quadraticCurveTo(27, 45.2, 22.6, 42.6); g.bezierCurveTo(16.5, 39, 13, 32, 12.5, 23); }
  function paintCEO(g) { // faces right, lit from the right (the codec's centre)
    g.fillStyle = lg(g, 0, 0, 0, 63, [[0, 60], [1, 16]]); g.fillRect(0, 0, 52, 63);
    for (let y = 2; y < 38; y += 3) { g.fillStyle = G(y % 2 ? 98 : 84); g.fillRect(44, y, 8, 1); } // window blinds behind his lit shoulder
    g.fillStyle = G(28); g.fillRect(43, 0, 1, 38);
    zoom(g);
    // suit
    g.fillStyle = lg(g, 0, 0, 52, 0, [[0, 26], [0.5, 58], [1, 130]]);
    g.beginPath(); g.moveTo(0, 63); g.lineTo(0, 55); g.quadraticCurveTo(3, 48, 14, 46.5); g.lineTo(38, 46.5); g.quadraticCurveTo(49, 48, 52, 55); g.lineTo(52, 63); g.fill();
    // shirt collar, tie, lapels
    poly(g, [[19, 44.4], [33, 44.4], [26, 58.5]], G(236));
    poly(g, [[19, 44.4], [26, 58.5], [23.2, 44.4]], G(160));
    poly(g, [[24.7, 48.5], [27.3, 48.5], [28.6, 57], [26, 61], [23.4, 57]], G(40));
    g.fillStyle = G(84); g.fillRect(24.6, 46, 2.8, 2.6);
    line(g, [[17.5, 46.6], [24.6, 61.5]], G(14), 1.3); line(g, [[34.5, 46.6], [27.4, 61.5]], G(182), 1);
    // neck (narrow, shadowed under the jaw)
    g.fillStyle = lg(g, 21.5, 0, 30.5, 0, [[0, 92], [1, 196]]); g.fillRect(21.5, 37, 9, 9);
    g.fillStyle = G(56); g.fillRect(21.5, 37, 9, 3.5);
    // head: mid-tone skin, lit flank on the right, a real shadow mass on the left
    g.fillStyle = lg(g, 12, 0, 40, 0, [[0, 100], [0.28, 150], [0.58, 206], [0.82, 236], [1, 220]]);
    headCEO(g); g.fill();
    g.save(); headCEO(g); g.clip();
    g.fillStyle = rg(g, 15.5, 31, 1, 10, [[0, shade(0.45)], [1, shade(0)]]); g.fillRect(3, 19, 24, 26);
    g.fillStyle = rg(g, 27, 44, 1, 7, [[0, shade(0.4)], [1, shade(0)]]); g.fillRect(18, 36, 18, 10);
    g.fillStyle = rg(g, 33.5, 30.5, 0.5, 5, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(27, 24, 13, 13); // cheekbone
    g.restore();
    // ear (shadow side)
    ell(g, 13.4, 27.6, 2.1, 3.6, G(128)); ell(g, 13.7, 27.8, 1, 2.1, G(70));
    // hair: a swept-back grey mass across the crown
    line(g, [[15.6, 25], [16.6, 17], [22, 13.6], [28, 13.2], [34, 14.2], [40, 20]], G(58), 1.4); // shadow under the hairline
    g.fillStyle = lg(g, 11, 0, 41, 0, [[0, 60], [0.5, 104], [1, 168]]);
    g.beginPath(); g.moveTo(12.4, 25); g.bezierCurveTo(10, 11, 19, 4.6, 27.5, 4.6); g.bezierCurveTo(36.5, 4.6, 42, 10, 40.8, 20.5);
    g.bezierCurveTo(38.5, 15.5, 33, 13.4, 27, 13.6); g.bezierCurveTo(21, 13.8, 16.4, 16.4, 15.2, 25); g.closePath(); g.fill();
    line(g, [[17, 10], [26, 7.4], [36, 9]], G(176), 0.8); line(g, [[15.5, 14], [24, 10.8], [38, 13.2]], G(150), 0.8); line(g, [[21, 6.4], [31, 5.6]], G(200), 0.7);
    g.fillStyle = G(176); g.fillRect(38.6, 15, 1.4, 6); // silver temple on the lit side
    // brows, knitted
    line(g, [[18.2, 20.8], [24.6, 21.4]], G(34), 1.6); line(g, [[28.4, 21.4], [35.2, 20.5]], G(44), 1.6);
    // eyes in shadowed sockets
    ell(g, 21.6, 24.6, 3.9, 2.4, G(108)); ell(g, 31.6, 24.6, 3.9, 2.4, G(150));
    g.fillStyle = G(206); g.fillRect(20, 24.4, 3.5, 1); g.fillRect(31.5, 24.4, 3.5, 1);
    g.fillStyle = G(14); g.fillRect(22.4, 23.6, 2, 2); g.fillRect(32.4, 23.6, 2, 2);
    // glasses
    g.strokeStyle = G(24); g.lineWidth = 1; g.strokeRect(17.6, 22, 8.4, 5.6); g.strokeRect(28, 22, 8.4, 5.6);
    line(g, [[26, 23.4], [28, 23.4]], G(24), 1); line(g, [[17.6, 23.2], [13.4, 23.8]], G(24), 1);
    g.fillStyle = G(252); g.fillRect(34.8, 22.6, 1, 1); g.fillRect(35.6, 23.4, 0.8, 0.8);
    // nose: lit ridge on the right, shadow on the left
    line(g, [[27, 26.5], [26.4, 31.6]], G(118), 1); line(g, [[29.4, 26.2], [30.8, 31.6]], G(240), 0.9);
    line(g, [[27, 33], [30.6, 33.2]], G(62), 1);
    // folds and the tight, unhappy mouth
    line(g, [[24, 33.6], [22.2, 37]], G(112), 0.8); line(g, [[32, 33.4], [33.6, 37]], G(176), 0.8);
    line(g, [[22.8, 37.6], [26.6, 37], [31.2, 37.8]], G(46), 1.2);
    line(g, [[24.4, 39.2], [29.4, 39.2]], G(198), 0.8);
    // jaw rim light
    line(g, [[39.6, 23.5], [38.8, 32], [33.6, 40.2]], G(250), 0.8);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function headHOS(g) { g.beginPath(); g.moveTo(39.5, 23); g.bezierCurveTo(40.5, 9, 11.5, 7.5, 12, 22.5); g.bezierCurveTo(11.6, 32, 14.5, 39, 20.5, 42.6); g.quadraticCurveTo(25, 45.2, 29.4, 42.6); g.bezierCurveTo(35.5, 39, 39, 32, 39.5, 23); }
  function paintHOS(g) { // you: faces left, comms headset, lit from the left
    g.fillStyle = lg(g, 0, 0, 0, 63, [[0, 44], [1, 12]]); g.fillRect(0, 0, 52, 63);
    g.fillStyle = G(30); g.fillRect(0, 0, 7, 46); // a server rack behind you, LEDs blinking
    for (let y = 3; y < 44; y += 4) { g.fillStyle = G(14); g.fillRect(1, y, 5, 2); g.fillStyle = G((y * 7) % 3 ? 70 : 170); g.fillRect(5, y, 1, 1); }
    zoom(g);
    // jacket
    g.fillStyle = lg(g, 0, 0, 52, 0, [[0, 120], [0.5, 56], [1, 22]]);
    g.beginPath(); g.moveTo(0, 63); g.lineTo(0, 55); g.quadraticCurveTo(3, 48, 14, 46.5); g.lineTo(38, 46.5); g.quadraticCurveTo(49, 48, 52, 55); g.lineTo(52, 63); g.fill();
    poly(g, [[16, 45.5], [26, 54], [36, 45.5], [38, 49], [26, 59], [14, 49]], G(78));
    poly(g, [[19.5, 45], [26, 51], [32.5, 45]], G(150));
    line(g, [[26, 54], [26, 63]], G(26), 1);
    // neck
    g.fillStyle = lg(g, 21.5, 0, 30.5, 0, [[0, 198], [1, 84]]); g.fillRect(21.5, 37, 9, 9);
    g.fillStyle = G(52); g.fillRect(21.5, 37, 9, 3.5);
    // head
    g.fillStyle = lg(g, 12, 0, 40, 0, [[0, 222], [0.16, 238], [0.42, 206], [0.72, 150], [1, 100]]);
    headHOS(g); g.fill();
    g.save(); headHOS(g); g.clip();
    g.fillStyle = rg(g, 36, 31, 1, 10, [[0, shade(0.45)], [1, shade(0)]]); g.fillRect(25, 19, 24, 26);
    g.fillStyle = rg(g, 25, 44, 1, 7, [[0, shade(0.4)], [1, shade(0)]]); g.fillRect(16, 36, 18, 10);
    g.fillStyle = rg(g, 18.5, 30.5, 0.5, 5, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(12, 24, 13, 13);
    const r = seeded(77); // stubble
    for (let i = 0; i < 70; i++) { const x = 15 + r() * 22, y = 34 + r() * 9; g.fillStyle = shade(0.16 + r() * 0.14); g.fillRect(x | 0, y | 0, 1, 1); }
    g.restore();
    // hair: short and dark, a smooth crown, clipped to the head so nothing strays into the frame corner
    g.save(); g.translate(26, 25); g.scale(1.08, 1.08); g.translate(-26, -25); headHOS(g); g.clip();
    zoom(g);
    g.fillStyle = lg(g, 11, 0, 41, 0, [[0, 150], [0.35, 112], [0.75, 76], [1, 56]]);
    g.beginPath(); g.moveTo(39.5, 25); g.bezierCurveTo(42, 10, 32, 3, 25, 3.5); g.bezierCurveTo(17, 4, 11, 9, 11.6, 21);
    g.bezierCurveTo(13, 16, 16.2, 13.6, 20, 14); g.lineTo(22, 11.8); g.lineTo(24.4, 13.6); g.bezierCurveTo(29, 12.8, 34, 14.4, 36, 19); g.lineTo(37, 25); g.closePath(); g.fill();
    g.strokeStyle = G(150); g.lineWidth = 1; g.beginPath(); g.moveTo(12.3, 20.5); g.bezierCurveTo(11.8, 12, 16, 6.4, 24, 4.8); g.stroke(); // rim light on the crown
    line(g, [[12.4, 19.5], [12.2, 13]], G(190), 0.9);
    line(g, [[15.5, 10], [21.5, 7]], G(176), 0.8); line(g, [[14.4, 14], [18.6, 11]], G(160), 0.8); line(g, [[24, 6.5], [31, 7.5]], G(126), 0.7);
    line(g, [[20.4, 14.2], [24.6, 13.8], [30, 13.4], [35.4, 15.6]], G(40), 1); // shadow under the fringe
    g.restore();
    // headset: band over the crown, ear cup on the far side, boom mic to the mouth
    g.strokeStyle = G(14); g.lineWidth = 2.6; g.beginPath(); g.arc(26, 23, 15, Math.PI * 1.08, Math.PI * 1.94); g.stroke();
    g.strokeStyle = G(196); g.lineWidth = 0.8; g.beginPath(); g.arc(26, 21.8, 15, Math.PI * 1.12, Math.PI * 1.5); g.stroke();
    ell(g, 39.6, 27.5, 4.2, 5.4, G(18)); ell(g, 39.6, 27.5, 3, 4.1, G(132)); ell(g, 39.6, 27.5, 2, 3, G(44));
    line(g, [[38.4, 32.5], [35.4, 37.8], [29.6, 39.6]], G(226), 1.4);
    g.fillStyle = G(246); g.fillRect(26.6, 38.4, 3.4, 2.4);
    // brows, set
    line(g, [[16.8, 20.6], [23.4, 21.5]], G(28), 1.7); line(g, [[27.6, 21.5], [34.2, 20.4]], G(36), 1.7);
    // eyes, looking left toward the CEO
    ell(g, 20.4, 24.8, 3.9, 2.4, G(156)); ell(g, 30.8, 24.8, 3.7, 2.3, G(104));
    g.fillStyle = G(220); g.fillRect(17.6, 24.6, 4, 1); g.fillRect(29.6, 24.6, 3, 1);
    g.fillStyle = G(8); g.fillRect(18, 23.8, 2, 2); g.fillRect(28.6, 23.8, 2, 2);
    g.fillStyle = G(70); g.fillRect(17, 22.6, 7, 1);
    // nose: the shadow falls right, away from the light
    line(g, [[23.6, 26.2], [22, 31.6], [24, 33.2]], G(96), 1.1); line(g, [[22, 27], [21.2, 30.6]], G(244), 0.8);
    line(g, [[22.6, 33.6], [25.4, 33.6]], G(60), 1);
    // mouth, set
    line(g, [[20.4, 37.6], [24.6, 37.2], [29, 37.7]], G(44), 1.2);
    line(g, [[21.4, 39.2], [25.8, 39.2]], G(206), 0.8);
    // jaw rim light
    line(g, [[12.5, 24], [13.4, 32.4], [18.8, 40]], G(250), 0.8);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function ditherPortrait(paint, w, h) {
    const lo = mk(w, h), g = lo.getContext('2d');
    paint(g);
    const px = g.getImageData(0, 0, w, h).data;
    const out = mk(w * 2, h * 2), o = out.getContext('2d');
    const L = PLV.length - 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = px[(y * w + x) * 4] / 255;
      v = clamp((Math.pow(v, 1.15) - 0.5) * 1.2 + 0.40, 0, 1);
      const s = v * L, b = Math.floor(s), f = s - b;
      const lvl = clamp(b + (f > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0), 0, L);
      o.fillStyle = PLV[lvl]; o.fillRect(x * 2, y * 2, 2, 2);
    }
    o.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 1; y < h * 2; y += 2) o.fillRect(0, y, w * 2, 1);
    return out;
  }

  // ---------------------------------------------------------------- layout: right column
  const RX = 828, RW = 364, PW = 104, PH = 126;
  const PL = { x: RX + 5, y: 100, w: PW, h: PH };
  const PRt = { x: RX + RW - 5 - PW, y: 100, w: PW, h: PH };
  const MID = { x: PL.x + PW + 10, w: PRt.x - PL.x - PW - 20 };
  const DSP = { y: 121, h: 80 };
  const UY = 256; // readouts under the portraits
  const DLG = { x: RX, y: 262, w: RW, h: 78 };
  const TRC = { y: 344 };
  const HOV = { x: RX, y: 382, w: RW - 4, h: 130 };
  const MENU = { x: RX + 3, y: 518, cw: 38, ch: 42, gap: 2 };
  const FLASH = { x: RX, y: 46, w: RW - 84, h: 20 };
  const RAMP = [26, 20, 15, 12, 10, 8, 7, 6]; // the codec's signal ramp, widest at the top

  // ---------------------------------------------------------------- static layer
  let K = null;
  function fontsReady() {
    try { return document.fonts.check('16px VT323') && document.fonts.check('8px "Press Start 2P"'); } catch (e) { return true; }
  }

  function build() {
    const ok = fontsReady();
    if (!ok) { try { document.fonts.load('16px VT323'); document.fonts.load('8px "Press Start 2P"'); } catch (e) { /* ignore */ } }
    K = { ok: ok, frame: mk(1200, 660), half: mk(600, 330), quart: mk(300, 165), quart2: mk(300, 165), eighth: mk(150, 83), stat: mk(1200, 660),
      scan: mk(1200, 660), scan2: mk(1200, 660), vig: mk(1200, 660), mStat: mk(1200, 660), mDyn: mk(1200, 660), glow: mk(TRK[0].LW, BODY_H) };
    K.f = K.frame.getContext('2d'); K.h = K.half.getContext('2d'); K.q = K.quart.getContext('2d'); K.q2 = K.quart2.getContext('2d'); K.e = K.eighth.getContext('2d');
    K.s2 = K.scan2.getContext('2d'); K.md = K.mDyn.getContext('2d');
    K.portL = ditherPortrait(paintCEO, 52, 63);
    K.portR = ditherPortrait(paintHOS, 52, 63);
    const x = K.stat.getContext('2d');
    if (CAN_MASK) { MK = K.mStat.getContext('2d'); MKI = new DOMMatrix(); } // the static layer's glyphs go into their own mask
    R(x, 0, 0, 1200, 660, C.bg);
    buildHUD(x);
    TRK.forEach(tr => buildTrack(x, tr));
    // the wall between public and lab
    R(x, WALL, 46, 2, 556, C.g2); R(x, WALL + 2, 46, 4, 556, C.k); hatch(x, WALL + 2, 46, 4, 556, C.g1, 3); R(x, WALL + 6, 46, 2, 556, C.g2);
    buildCodec(x);
    buildHover(x);
    buildMenu(x);
    buildDossier(x);
    buildETA(x);
    // dialog wrap, measured once with the real face
    x.font = FV(20); const words = S.codec.line.split(' '), lines = []; let cur = '';
    words.forEach(wd => { const tt = cur ? cur + ' ' + wd : wd; if (x.measureText(tt).width > DLG.w - 40) { lines.push(cur); cur = wd; } else cur = tt; });
    lines.push(cur); K.wrap = lines;
    MK = null;
    // surge glow: a soft inner light along the public lane's top and right edges
    const gl = K.glow.getContext('2d'), gw = TRK[0].LW;
    let q = gl.createLinearGradient(0, INTAKE, 0, INTAKE + 14); q.addColorStop(0, 'rgba(138,255,193,0.22)'); q.addColorStop(1, 'rgba(138,255,193,0)');
    gl.fillStyle = q; gl.fillRect(0, INTAKE, gw, 14);
    q = gl.createLinearGradient(gw, 0, gw - 14, 0); q.addColorStop(0, 'rgba(138,255,193,0.22)'); q.addColorStop(1, 'rgba(138,255,193,0)');
    gl.fillStyle = q; gl.fillRect(gw - 14, INTAKE, 14, BODY_H - INTAKE);
    // overlay: scanlines (each frame punches the glyphs out of them) + vignette
    const v = K.scan.getContext('2d');
    v.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 1; y < 660; y += 2) v.fillRect(0, y, 1200, 1);
    const vv = K.vig.getContext('2d');
    const vg = vv.createRadialGradient(600, 330, 300, 600, 330, 780); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    vv.fillStyle = vg; vv.fillRect(0, 0, 1200, 660);
  }

  // ---- HUD (quiet, except the cash odometer)
  const HUDL = [['CASH', 8], ['REP', 132], ['MODEL', 212], ['RIVAL LAB', 372], ['MISALIGNMENT EST.', 476], ['TASKS/S', 652], ['COMPUTE SPLIT', 724]];
  const CASHX = i => 20 + i * 15 + (i >= 3 ? 6 : 0);
  function buildHUD(x) {
    R(x, 0, 0, 1200, 40, C.g0); R(x, 0, 40, 1200, 1, C.g2); R(x, 0, 41, 1200, 1, C.g1);
    HUDL.forEach(([l, X], i) => { T(x, l, X, 11, FP(8), C.g4); if (i) R(x, X - 8, 4, 1, 33, C.g1); });
    // odometer drums
    T(x, '$', 8, 34, FV(24), C.g4);
    for (let i = 0; i < 6; i++) { const X = CASHX(i); R(x, X, 14, 14, 24, C.k); R(x, X + 14, 14, 1, 24, C.g3); }
    T(x, ',', CASHX(3) - 6, 36, FV(24), C.g4);
    // REP
    T(x, String(S.rep), 132, 35, FV(24), C.g5);
    for (let i = 0; i < 10; i++) R(x, 158 + i * 4, 24, 3, 11, i < Math.round(S.rep / 10) ? C.g3 : C.g1);
    // MODEL, RIVAL
    T(x, S.gen, 212, 34, FV(20), C.g5);
    T(x, S.rival, 372, 34, FV(20), C.g4);
    // MISALIGNMENT: inverted chip + error bar
    const mw = TWd(x, S.misalign, FV(20)) + 10;
    R(x, 476, 18, mw, 18, C.g6); T(x, S.misalign, 481, 32, FV(20), C.k);
    const ax = 476 + mw + 10, aw = 636 - ax, ay = 27;
    R(x, ax, ay, aw, 1, C.g2);
    for (let i = 0; i <= 4; i++) R(x, ax + Math.round(i * aw / 4), ay - 2, 1, 5, C.g2);
    const m = 0.14, e = 0.09, px = v => ax + Math.round(v * aw);
    R(x, px(m - e), ay - 1, px(m + e) - px(m - e), 3, C.g3);
    R(x, px(m - e), ay - 4, 1, 9, C.g4); R(x, px(m + e), ay - 4, 1, 9, C.g4);
    R(x, px(m) - 1, ay - 3, 3, 7, C.g6);
    // COMPUTE SPLIT: three filled proportions, labels on small plates
    const bx = 724, bw = 468, by = 18, bh = 18;
    let cx = bx;
    S.split.forEach(([name, f], i) => {
      const w = i === S.split.length - 1 ? bx + bw - cx : Math.round(bw * f), sw = w - 2;
      if (i === 0) R(x, cx, by, sw, bh, C.g3);
      else if (i === 1) { R(x, cx, by, sw, bh, C.g1); hatch(x, cx, by, sw, bh, C.g3, 3); }
      else R(x, cx, by, sw, bh, C.g5);
      const label = name + ' ' + Math.round(f * 100) + '%', lw = TWd(x, label, FV(16));
      if (i < 2) { R(x, cx + 2, by + 2, lw + 6, bh - 4, C.g0); T(x, label, cx + 5, by + 13, FV(16), C.g5); }
      else T(x, label, cx + Math.round((sw - lw) / 2), by + 13, FV(16), C.k);
      cx += w;
    });
  }

  // ---- Tracks
  // right edge of a line's pill (public) or of its text and blinking cursor (lab)
  function chipR(tr, n) {
    const s = shownOf(tr, n), x = tr.LX + tr.TX0 + s.length * CW;
    return tr.solid ? x + (s === FROGT ? 11 : 0) + 2 : x + (isFlag(tr, n) ? 2 : 8);
  }

  function buildTrack(x, tr) {
    const X = tr.x, ext = tr.solid, LX = tr.LX, LW = tr.LW, XR = tr.XR;
    // header: title, sub, mount count, identity bar
    T(x, tr.d.name, X, 62, FP(16), C.g6);
    T(x, tr.d.sub, X + 136, 61, FV(16), C.g3);
    T(x, 'MOUNTS ' + tr.d.tiers.length + '/' + tr.d.slots, XR, 61, FV(16), C.g3, 'right');
    if (ext) { R(x, X, 66, 128, 4, C.g4); R(x, X + 128, 69, XR - X - 128, 1, C.g2); }
    else { hatch(x, X, 66, 128, 4, C.g3, 3); R(x, X + 128, 69, XR - X - 128, 1, C.g1); }
    // header row 2: event banner frame (content is live) or the quiet lab strip
    if (ext) { R(x, X, 74, XR - X, 20, C.redD); box(x, X, 74, XR - X, 20, C.redM); }
    else {
      dbox(x, X, 74, XR - X, 20, C.g2, 3, 2);
      T(x, 'NO EVENT', X + 8, 88, FP(8), C.g3);
      TX(x, 'flow ×1.0 · sabotage watch: CoT PRB EGR', X + 80, 89, FV(16), C.g3);
    }
    // lane body + intake strip at the top, where the tasks pour in
    if (ext) R(x, LX, BODY_Y, LW, BODY_H, C.lane);
    R(x, LX, BODY_Y + INTAKE - 1, LW, 1, ext ? C.redB : C.g1);
    if (!ext) for (let cx = LX + 10; cx < LX + LW - 24; cx += 48) { sprite(x, DOWN, cx, BODY_Y + 3, 1, C.g2); sprite(x, TIMES, cx + 10, BODY_Y + 2, 1, C.g2); sprite(x, DIG[1], cx + 16, BODY_Y + 2, 1, C.g2); }
    const railC = ext ? C.g4 : C.g2;
    const doorA = tr.bayY - tr.door, doorB = tr.bayY + tr.door;
    for (let y = BODY_Y - 4; y < BODY_B + 2; y += ext ? 1 : 4) {
      const h = ext ? 1 : 2;
      R(x, LX - 3, y, 2, h, railC);
      if (y + h <= doorA || y >= doorB) R(x, LX + LW + 1, y, 2, h, railC);
    }
    R(x, LX + LW, doorA - 2, 6, 2, C.g5); R(x, LX + LW, doorB, 6, 2, C.g5); // door jambs
    // mounts: plates on the left rail, each with an emitter port facing the lane
    for (let m = 0; m < tr.d.slots; m++) {
      const my = BODY_Y + m * MP, ym = my + 23, tier = tr.d.tiers[m];
      R(x, LX - 5, ym - 4, 6, 8, tier ? (ext ? C.g3 : C.g2) : C.g1); R(x, LX - 4, ym - 3, 4, 6, C.k);
      if (!tier) {
        dbox(x, X, my + 2, TW, 42, C.g2, 3, 3);
        T(x, '+ SLOT', X + 12, ym + 5, FV(16), C.g3);
        T(x, ['$8k', '$12k', '$18k'][m - tr.d.tiers.length] || '$18k', X + TW - 10, ym + 5, FV(16), C.g3, 'right');
        continue;
      }
      const [tag, , lvl, cat, bay] = tier;
      const off = tag === 'KILL';
      if (ext) bevel(x, X, my + 2, TW, 42, C.g0, C.g2, C.k);
      else { R(x, X, my + 2, TW, 42, C.g0); dbox(x, X, my + 2, TW, 42, C.g2, 2, 2); }
      R(x, X, my + 2, 2, 42, off ? C.g1 : (ext ? C.g3 : C.g2));
      bevel(x, X + 4, my + 6, 22, 22, C.k, C.g2, C.g1);
      icon(x, tag, X + 6, my + 8, 2, off ? C.g2 : C.g4, off ? C.g1 : C.g2);
      T(x, tag, X + 30, my + 15, FP(8), off ? C.g3 : C.g4);
      pips(x, X + 30, my + 19, lvl, off ? C.g2 : C.g4, C.g2);
      if (cat != null) T(x, cat + '%', X + TW - 4, my + 22, FV(20), C.g4, 'right');
      else T(x, bay ? 'BAY' : off ? 'OFF' : 'MOD', X + TW - 4, my + 16, FP(8), off ? C.g2 : C.g3, 'right');
      T(x, nameOf(tier), X + 5, my + 39, FV(16), off ? C.g2 : C.g3);
      R(x, X + TW - 1, ym - 3, 3, 6, off ? C.g1 : C.g2); // emitter port
    }
    // bay
    const bx = tr.BX, bw = tr.BW, bt = tr.bayTop, bb = tr.bayBot;
    R(x, bx, bt, bw, bb - bt, C.g0);
    if (ext) box(x, bx, bt, bw, bb - bt, C.g3); else dbox(x, bx, bt, bw, bb - bt, C.g3, 2, 2);
    R(x, bx, doorA, 1, doorB - doorA, C.g0); // open to the lane at the door
    T(x, tr.bay, bx + bw / 2, bt + 14, FP(8), C.g5, 'center');
    T(x, tr.desks + ' DESKS', bx + bw / 2, bt + 28, FV(16), C.g3, 'center');
    dbox(x, bx + 4, tr.bayY - 8, bw - 8, 18, C.g3, 2, 2); // the IN slot; its label is drawn live, since a lit ticket covers it
    for (let d = 0; d <= tr.desks; d++) R(x, bx + 4, tr.deskY(d) - 3, bw - 8, 1, C.g1);
    T(x, 'LAST', bx + bw / 2, tr.deskY(tr.desks) + 8, FP(8), C.g3, 'center');
    // completion edge
    const ey = BODY_B + 4;
    R(x, LX - 4, ey, LW + 8, 1, C.g3); R(x, LX - 4, ey + 2, LW + 8, 1, C.g2);
    if (ext) {
      T(x, 'DELIVERED', X, 578, FP(8), C.g4);
      T(x, '$/s', X, 597, FP(8), C.g3);
      T(x, 'SURGE', XR, 578, FP(8), C.g3, 'right');
    } else {
      T(x, 'R&D DONE', X, 578, FP(8), C.g4);
      T(x, 'NEXT GEN G4', X, 597, FV(16), C.g3);
      box(x, LX, 568, LW - 52, 12, C.g3);
      for (let i = 1; i < 10; i++) R(x, LX + Math.round((LW - 52) * i / 10), 570, 1, 8, C.g1);
    }
  }

  // ---- Codec (no chrome: it sits in the black void, as in the original)
  const CNT = { w: 9, h: 16, gap: 3 };
  CNT.tot = 4 * CNT.w + 3 * CNT.gap; CNT.x = MID.x + Math.round((MID.w - CNT.tot) / 2); CNT.y = 76;
  const FREQ = { dw: 14, dh: 40, gap: 3, dot: 5 };
  FREQ.tot = 5 * FREQ.dw + 4 * FREQ.gap + FREQ.dot; FREQ.x = MID.x + MID.w - 6 - FREQ.tot; FREQ.y = DSP.y + 32;
  function portraitFrame(x, p) { // 3px rounded bevel: bright outer ring, black, dim inner ring
    R(x, p.x - 3, p.y - 4, p.w + 6, 1, C.g4); R(x, p.x - 3, p.y + p.h + 3, p.w + 6, 1, C.g4);
    R(x, p.x - 4, p.y - 3, 1, p.h + 6, C.g4); R(x, p.x + p.w + 3, p.y - 3, 1, p.h + 6, C.g4);
    R(x, p.x - 3, p.y - 3, p.w + 6, 1, C.g3); R(x, p.x - 3, p.y - 3, 1, p.h + 6, C.g3); // inner bright edge, lit from above
    R(x, p.x - 2, p.y - 2, p.w + 4, p.h + 4, C.k);
    box(x, p.x - 1, p.y - 1, p.w + 2, p.h + 2, C.g2);
  }
  function buildCodec(x) {
    R(x, RX - 2, 70, RW + 4, 272, C.k); // the void
    // the other alarm lamp, unlit: internal problems flash here, hatched rather than solid
    dbox(x, RX + RW - 78, 46, 78, 20, C.g2, 2, 2);
    T(x, 'INT ANOMALY', RX + RW - 39, 60, FV(16), C.g3, 'center');
    // call counter above PTT (ghost segments)
    for (let i = 0; i < 4; i++) seg7(x, CNT.x + i * (CNT.w + CNT.gap), CNT.y, CNT.w, CNT.h, 2, 8, '#0b2717', null);
    // portraits in bevelled frames, captioned inside
    [[PL, K.portL, 'CEO', 0], [PRt, K.portR, 'HEAD OF SAFETY', 1]].forEach(([p, img, cap, right]) => {
      portraitFrame(x, p);
      x.drawImage(img, p.x, p.y);
      const cw = TWd(x, cap, FV(16)) + 8, cx = right ? p.x + p.w - cw : p.x;
      R(x, cx, p.y + p.h - 14, cw, 14, C.k); R(x, cx, p.y + p.h - 15, cw, 1, C.g3);
      R(x, right ? cx - 1 : cx + cw, p.y + p.h - 15, 1, 15, C.g3);
      T(x, cap, cx + 4, p.y + p.h - 3, FV(16), C.g6);
    });
    // number flourishes under the faces, as in the original
    const under = (p, lab, val) => {
      const lw = TWd(x, lab, FP(8)), vw = TWd(x, val, FV(28)), sx = p.x + Math.round((p.w - lw - 6 - vw) / 2);
      T(x, lab, sx, UY - 1, FP(8), C.g4); T(x, val, sx + lw + 6, UY, FV(28), C.g6);
    };
    under(PL, 'REP', '%0' + S.rep); under(PRt, 'TRUST', '%064');
    const bpx = MID.x + Math.round((MID.w - 73) / 2);
    T(x, '132', bpx + 11, UY, FV(28), C.g5); T(x, 'BPM', bpx + 49, UY - 1, FP(8), C.g4);
    // centre column: PTT, LCD, MEMORY
    const mx = MID.x, mw = MID.w, dy = DSP.y;
    bevel(x, mx + 24, PL.y, mw - 48, 15, C.g1, C.g4, C.g2); T(x, 'PTT', mx + mw / 2, PL.y + 12, FP(8), C.g6, 'center');
    bevel(x, mx, dy, mw, DSP.h, C.lcd, C.g2, C.g3);
    R(x, mx + 4, dy + 21, mw - 8, 1, C.g1);
    RAMP.forEach((w, i) => R(x, mx + 6, dy + 26 + i * 6, w, 4, C.g2));
    const digits = S.codec.freq.replace('.', '');
    let fx = FREQ.x;
    for (let i = 0; i < digits.length; i++) {
      seg7(x, fx, FREQ.y, FREQ.dw, FREQ.dh, 4, +digits[i], C.g6, '#0b2717');
      fx += FREQ.dw + FREQ.gap;
      if (i === 2) { R(x, fx - 1, FREQ.y + FREQ.dh - 4, 4, 4, C.g6); fx += FREQ.dot; }
    }
    bevel(x, mx + 12, PL.y + PL.h - 15, mw - 24, 15, C.g1, C.g4, C.g2); T(x, 'MEMORY', mx + mw / 2, PL.y + PL.h - 3, FP(8), C.g6, 'center');
    // dialog: hairlines only, the words float in the void
    R(x, DLG.x, DLG.y, DLG.w, 1, C.g3); R(x, DLG.x, DLG.y + DLG.h - 1, DLG.w, 1, C.g3);
    R(x, DLG.x, DLG.y, 1, 4, C.g3); R(x, DLG.x + DLG.w - 1, DLG.y, 1, 4, C.g3);
    R(x, DLG.x, DLG.y + DLG.h - 4, 1, 4, C.g3); R(x, DLG.x + DLG.w - 1, DLG.y + DLG.h - 4, 1, 4, C.g3);
    // trace: which defenses the leak slipped past
    T(x, 'TRACE', RX, TRC.y + 11, FP(8), C.g4);
    const toks = S.codec.trace.split(' > ');
    let tx = RX + 46, row = 0;
    toks.forEach((tk, i) => {
      const miss = /miss|waved|off/.test(tk), land = /LANDED/.test(tk), okk = / ok$/.test(tk), pre = miss ? 8 : 0;
      const w = TWd(x, tk, FV(16)) + 8 + pre;
      if (tx + w > RX + RW) { row++; tx = RX + 46; }
      const yy = TRC.y + row * 19;
      if (land) { R(x, tx, yy, w, 15, C.red); T(x, tk, tx + 4, yy + 12, FV(16), C.k); }
      else if (miss) { R(x, tx, yy, w, 15, C.g1); sprite(x, TIMES, tx + 4, yy + 5, 1, C.g3); T(x, tk, tx + 4 + pre, yy + 12, FV(16), C.g4); }
      else if (okk) { R(x, tx, yy, w, 15, C.g5); T(x, tk, tx + 4, yy + 12, FV(16), C.k); }
      else { box(x, tx, yy, w, 15, C.g2); T(x, tk, tx + 4, yy + 12, FV(16), C.g4); }
      tx += w;
      if (i < toks.length - 1) { sprite(x, CHEV, tx + 3, yy + 5, 1, C.g3); tx += 10; }
    });
  }

  // ---- Hover card (floats over the menu, anchored to the TM icon)
  function slotXY(i) { const r = i < 9 ? 0 : 1, q = i % 9; return [MENU.x + q * (MENU.cw + MENU.gap), MENU.y + r * (MENU.ch + MENU.gap)]; }
  function buildHover(x) {
    const h = S.hover, X = HOV.x, Y = HOV.y, w = HOV.w, hh = HOV.h, fill = '#04140b';
    R(x, X + 4, Y + 4, w, hh, C.k); // drop shadow
    R(x, X, Y, w, hh, fill); box(x, X, Y, w, hh, C.g6); box(x, X + 2, Y + 2, w - 4, hh - 4, C.g2);
    // pointer to the icon
    const ti = S.bar.findIndex(b => b[0] === 'TM'); const [sx] = slotXY(ti); const px = sx + MENU.cw / 2;
    for (let i = 0; i < 6; i++) R(x, px - 6 + i, Y + hh - 1 + i, 13 - i * 2, 1, C.g6);
    R(x, px - 4, Y + hh - 2, 9, 2, fill);
    // header
    bevel(x, X + 8, Y + 8, 26, 26, C.k, C.g3, C.g1); icon(x, 'TM', X + 12, Y + 12, 2, C.g6, C.g3);
    T(x, h.name, X + 42, Y + 24, FV(24), C.g6);
    T(x, 'L' + h.level, X + w - 46, Y + 20, FP(8), C.g5, 'right');
    pips(x, X + w - 40, Y + 13, h.level, C.g6, C.g3);
    T(x, h.kind, X + 42, Y + 38, FV(16), C.g4);
    // stats
    h.stats.forEach(([n, v], i) => {
      const yy = Y + 46 + i * 13;
      T(x, n, X + 12, yy + 8, FP(8), C.g4);
      const bx = X + 116;
      for (let k = 0; k < 20; k++) R(x, bx + k * 8, yy, 6, 8, k < Math.round(v * 20) ? (i === 0 ? C.g6 : C.g4) : C.g1);
      const lab = n === 'CATCH' || n === 'FALSE ALARM' ? Math.round(v * 100) + '%' : n === 'DELAY' ? v.toFixed(1) + 's' : '$' + v.toFixed(1);
      T(x, lab, X + w - 12, yy + 9, FV(16), C.g5, 'right');
      if (i === 0) { // red-team measured error bar on the catch bar
        const mpx = v2 => bx + Math.round(v2 * 160);
        R(x, mpx(0.55), yy + 10, mpx(0.67) - mpx(0.55), 1, C.g6);
        R(x, mpx(0.55), yy + 9, 1, 3, C.g6); R(x, mpx(0.67), yy + 9, 1, 3, C.g6);
      }
    });
    T(x, h.measured, X + 12, Y + 107, FV(16), C.g5);
    R(x, X + 6, Y + 112, w - 12, 14, C.g1);
    T(x, 'NEXT', X + 12, Y + 123, FP(8), C.g6);
    T(x, h.next, X + 50, Y + 124, FV(16), C.g5);
  }

  // ---- Defense menu (18 slots)
  function buildMenu(x) {
    S.bar.forEach(([tag, un], i) => {
      const [sx, sy] = slotXY(i);
      if (un) {
        bevel(x, sx, sy, MENU.cw, MENU.ch, C.g0, C.g3, C.k);
        icon(x, tag, sx + 6, sy + 2, 3, C.g6, C.g3);
        T(x, tag, sx + MENU.cw / 2, sy + 38, FP(8), C.g5, 'center');
      } else {
        R(x, sx, sy, MENU.cw, MENU.ch, '#030b06'); dbox(x, sx, sy, MENU.cw, MENU.ch, C.g2, 2, 2);
        icon(x, tag, sx + 6, sy + 2, 3, C.g2, null);
        T(x, '???', sx + MENU.cw / 2, sy + 38, FP(8), C.g3, 'center');
      }
    });
    const fy = MENU.y + 2 * (MENU.ch + MENU.gap);
    T(x, 'DEFENSE MENU', RX, fy + 15, FP(8), C.g5);
    const un = S.bar.filter(b => b[1]).length;
    T(x, un + '/18 unlocked', RX + RW, fy + 16, FV(16), C.g4, 'right');
    // key legend as keycaps
    let kx = RX; const ky = fy + 23;
    [['1-9', 'place'], ['SHIFT', 'upgrade'], ['RMB', 'sell']].forEach(([k, a]) => {
      const kw = TWd(x, k, FP(8)) + 9;
      bevel(x, kx, ky, kw, 15, C.g1, C.g3, C.k); R(x, kx + 1, ky + 15, kw - 1, 1, C.g2);
      T(x, k, kx + 5, ky + 11, FP(8), C.g5);
      kx += kw + 5; T(x, a, kx, ky + 12, FV(16), C.g3); kx += TWd(x, a, FV(16)) + 14;
    });
  }

  // ---- Evidence dossier (an intel file)
  function buildDossier(x) {
    const X = 8, Y = 612, w = 540, h = 44;
    for (let i = 0; i < 8; i++) R(x, X, Y - 8 + i, 40 + i, 1, C.g3); // folder tab
    R(x, X, Y, w, h, C.g0); box(x, X, Y, w, h, C.g3);
    T(x, 'EVIDENCE', X + 10, Y + 19, FP(8), C.g5); T(x, 'DOSSIER', X + 10, Y + 33, FP(8), C.g5);
    S.dossier.forEach(([n, st, f], i) => {
      const cx = X + 88 + i * 150, unk = n === '???';
      R(x, cx - 8, Y + 6, 1, h - 12, C.g1);
      T(x, n, cx, Y + 19, FV(20), unk ? C.g3 : C.g6);
      if (f >= 1) {
        x.save(); x.translate(cx + 52, Y + 31); x.rotate(-4 * Math.PI / 180);
        x.strokeStyle = C.g6; x.lineWidth = 1.5; x.strokeRect(-44, -7, 88, 14);
        T(x, st.toUpperCase(), 0, 5, FV(16), C.g6, 'center');
        x.restore();
      } else {
        for (let k = 0; k < 16; k++) R(x, cx + k * 6, Y + 26, 4, 8, k < Math.round(f * 16) ? (unk ? C.g3 : C.g5) : C.g1);
        T(x, st.split(' ')[0], cx + 102, Y + 35, FV(16), unk ? C.g3 : C.g4);
      }
    });
  }

  // ---- Next-gen readout
  const ETA = { x: 556, y: 612, w: 264, h: 44 };
  function buildETA(x) {
    const { x: X, y: Y, w, h } = ETA;
    R(x, X, Y, w, h, C.g0); box(x, X, Y, w, h, C.g3);
    T(x, 'NEXT GEN', X + 8, Y + 14, FP(8), C.g4);
    T(x, 'G4 ETA', X + 8, Y + 38, FV(28), C.g5);
    R(x, X + 150, Y + 6, 1, h - 12, C.g1);
    T(x, 'THROUGHPUT 60s', X + 158, Y + 14, FV(16), C.g3);
    R(x, X + 158, Y + 37, 98, 1, C.g1);
  }

  // ---------------------------------------------------------------- dynamic: lines
  function yOf(tr, n, s) { return BODY_Y + 8 + s - n * tr.P; }
  function tPull(tr, n) { return (tr.y0 - BODY_Y - 8 + n * tr.P) / tr.v; } // in track time
  function isFlag(tr, n) { return mod(n, tr.flagP) === tr.flagRes; }
  function isPull(tr, n) { return mod(n, 3) === tr.pullRes; }
  function chipOf(tr, n) { return isFlag(tr, n) ? tr.flagged : tr.pool[mod(n * 3 + 2, tr.pool.length)]; }
  function tagOf(tr, n) { const k = chipOf(tr, n).length >= 24 ? 2 : tr.tags.length; return tr.tags[Math.floor(hash(n, 3) * k)]; }
  function verdictOf(tr, n) { return isFlag(tr, n) || hash(n, 5) < 0.18 ? 'TOSSED' : 'APPROVED'; }
  // lines stay invisible until they have cleared the intake band, then fade in; they fade out again before the finish line
  function fadeAt(y) { return clamp((y - ROW_TOP - BAND_B) / ROW_FADE, 0, 1) * clamp((BODY_B - 9 - y) / 6, 0, 1); }
  const shortOf = (tr, n) => SHORTN[chipOf(tr, n)] || chipOf(tr, n);
  const tagW = (tr, n) => 6 + (tagOf(tr, n).length - 1) * CW; // the × cell plus the digits
  // what a line shows: its whole task, or an ellipsis cut that keeps the pill (the lab: text and cursor) 8px clear of its multiplier
  function shownOf(tr, n) {
    const text = chipOf(tr, n);
    const room = tr.LX + tr.LW - 2 - tagW(tr, n) - 8 - (tr.LX + tr.TX0) - (tr.solid ? 2 + (text === FROGT ? 11 : 0) : isFlag(tr, n) ? 0 : 6);
    const max = Math.floor(room / CW);
    return text.length <= max ? text : text.slice(0, max - 1).replace(/ +$/, '') + '…';
  }
  const nameW = nm => nm.length * CW + (nm === 'poem' ? 11 : 0);
  function drawName(o, nm, X, Y, col) { T(o, nm, X, Y, FV(16), col); if (nm === 'poem') msprite(o, FROG, X + nm.length * CW + 3, Y - 9, 2, col); }
  function fitName(nm, w) { if (nameW(nm) <= w) return nm; let s = nm; while (s.length > 1 && (s.length + 1) * CW > w) s = s.slice(0, -1); return s + '…'; }

  function drawPrefix(o, tr, X, y, flag, col) {
    if (flag) { R(o, X, y - 6, 3, 8, C.red); R(o, X, y + 3, 3, 3, C.red); return; }
    if (tr.solid) { R(o, X, y - 4, 1, 9, col); R(o, X + 1, y - 3, 1, 7, col); R(o, X + 2, y - 2, 1, 5, col); R(o, X + 3, y - 1, 1, 3, col); R(o, X + 4, y, 1, 1, col); }
    else T(o, '$', X, y + 5, FV(16), col);
  }

  function drawTag(o, tr, n, X, y, flag) { // right-aligned at X; returns the tag's left edge
    const num = tagOf(tr, n).slice(1), nx = X - num.length * CW;
    T(o, num, nx, y + 5, FV(16), flag ? C.red : C.g6);
    msprite(o, TIMES, nx - 6, y - 2, 1, flag ? C.red : C.g3);
    return nx - 6;
  }

  function drawLine(o, tr, n, y, r, t, al) {
    const ext = tr.solid, LX = tr.LX, LW = tr.LW, tx = LX + tr.TX0;
    const text = shownOf(tr, n), flag = isFlag(tr, n), tw = text.length * CW, cr = chipR(tr, n);
    o.globalAlpha = al;
    if (r) { o.globalAlpha = al * 0.1; R(o, LX, y - 11, LW, 22, flag ? C.red : C.g6); o.globalAlpha = al; }
    if (ext) { R(o, LX + 5, y - 9, cr - LX - 4, 18, flag ? C.redD : C.chip); rbox(o, LX + 5, y - 9, cr - LX - 4, 18, flag ? C.red : C.g3); }
    else if (flag) R(o, LX + 4, y - 9, LW - 8, 18, C.redD);
    drawPrefix(o, tr, LX + 7, y, flag, C.g4);
    T(o, text, tx, y + 5, FV(16), flag ? C.red : C.g5);
    if (text === FROGT) msprite(o, FROG, tx + tw + 3, y - 4, 2, C.g5);
    if (!ext && !flag && Math.floor(t * 2 + hash(n, 9) * 2) % 2 === 0) R(o, tx + tw + 1, y + 4, 5, 2, C.g4);
    drawTag(o, tr, n, LX + LW - 2, y, flag);
    if (r) {
      const bc = flag ? C.red : C.g6;
      R(o, LX, y - 9, 2, 18, bc); R(o, LX, y - 9, 4, 2, bc); R(o, LX, y + 7, 4, 2, bc); // '[' at the lane edge
      if (r.mode === 'read') { // the read part inverts: a bright bar sweeps left to right behind the glyphs, and they turn black on it
        const k = clamp(Math.floor(r.p * (text.length + 1)), 0, text.length), cx = tx + k * CW, bl = tx - 2, br = cx + 2;
        R(o, bl, y - 7, br - bl, 15, flag ? C.red : C.g5); // 15 rows: caps to descenders
        if (r.kind === 'PAR') { // the paraphraser rewrites as it reads: a shimmer runs through its bar, and an editor's squiggle trails under the line
          const gx = bl + Math.floor(mod(t * 80, cx - bl + 40)) - 20; // a glint sweeping through the bar
          [1, 2, 3, 2, 1].forEach((g, i) => { const xx = gx + i * 2; if (xx >= bl && xx + 2 <= cx) R(o, xx, y - 7, 2, 15, flag ? ['#ff6060', '#ff8a8a', '#ffb0b0'][g - 1] : ['#74ebae', '#80f6b9', C.g6][g - 1]); });
          for (let xx = bl; xx < br; xx++) R(o, xx, y + 10 + [0, 1, 2, 1][mod(xx + Math.floor(t * 16), 4)], 1, 1, bc);
        }
        R(o, cx, y - 7, 2, 15, bc); // the read head
        o.save(); o.beginPath(); o.rect(bl, y - 7, br - bl, 15); o.clip();
        T(o, text, tx, y + 5, FV(16), C.k);
        o.restore();
      } else dbox(o, LX + 3, y - 12, LW - 3, 24, bc, 3, 2); // sandbox / least privilege fence the whole line in, multiplier and all
    }
    o.globalAlpha = 1;
  }

  function drawGhost(o, tr, n, y, al, label) {
    const cr = chipR(tr, n);
    o.globalAlpha = al;
    dbox(o, tr.LX + 5, y - 9, cr - tr.LX - 4, 18, C.g3, 2, 2);
    if (label) T(o, tr.ghost, tr.LX + tr.TX0, y + 4, FP(8), C.g4);
    o.globalAlpha = 1;
  }

  function drawHooked(o, tr, n, yFlow, u) { // a line hooked out of the flow and dragged sideways to the bay door
    const ext = tr.solid, LX = tr.LX, door = LX + tr.LW + 6;
    const k = clamp(u / tr.PULL, 0, 1), y = Math.round(tr.y0 + 0.9 * tr.v * u); // stays in its slot, lagging a little
    const text = shownOf(tr, n), flag = isFlag(tr, n), cr = chipR(tr, n);
    const hc = flag ? C.red : C.g6;
    drawGhost(o, tr, n, Math.round(yFlow), 1, false); // labelled once the hook has let go
    clipR(o, LX, y - 12, door - LX, 26);
    let L, Rt;
    if (k < 0.4) { // the claws catch the whole line and lift it loose
      const dx = Math.round(ease(k / 0.4) * 10);
      R(o, LX + 5 + dx, y - 9, cr - LX - 4, 18, flag ? C.redD : C.chip); rbox(o, LX + 5 + dx, y - 9, cr - LX - 4, 18, flag ? C.red : C.g4);
      drawPrefix(o, tr, LX + 7 + dx, y, flag, C.g4);
      T(o, text, LX + tr.TX0 + dx, y + 5, FV(16), flag ? C.red : C.g6);
      if (text === FROGT) msprite(o, FROG, LX + tr.TX0 + dx + text.length * CW + 3, y - 4, 2, C.g6);
      L = LX + 5 + dx; Rt = cr + dx + 1;
    } else { // then it folds into a ticket (short name, multiplier) that slides up to the door and waits there, whole and opaque, never cut by it;
      // it is handed through on the frame the pull ends, when it leaves the lane and the bay's IN slot lights with its name (no cross-fade)
      const nm = shortOf(tr, n), num = tagOf(tr, n).slice(1), nx = ext ? 11 : 14, tw = nx + nameW(nm) + 5 + 6 + num.length * CW + 3;
      const x0 = LX + 15, x1 = door - 4 - tw, tx = Math.round(x0 + ease(clamp((k - 0.4) / 0.4, 0, 1)) * (x1 - x0));
      R(o, tx, y - 8, tw, 16, flag ? C.red : C.g5);
      if (ext) { R(o, tx + 4, y - 4, 1, 9, C.k); R(o, tx + 5, y - 3, 1, 7, C.k); R(o, tx + 6, y - 2, 1, 5, C.k); R(o, tx + 7, y - 1, 1, 3, C.k); }
      else T(o, '$', tx + 3, y + 5, FV(16), C.k);
      drawName(o, nm, tx + nx, y + 5, C.k);
      const ax = tx + nx + nameW(nm) + 5;
      msprite(o, TIMES, ax, y - 2, 1, C.k); T(o, num, ax + 6, y + 5, FV(16), C.k);
      L = tx; Rt = tx + tw;
    }
    R(o, L - 2, y + 8, Rt - L + 4, 2, hc); R(o, L - 2, y + 3, 2, 7, hc); R(o, Rt, y + 3, 2, 7, hc); // claws
    unclip(o);
    // telescoping arm back to the rail
    const ae = L - 2;
    if (ae > LX - 1 && ae < door - 8) R(o, LX - 1, y + 9, ae - LX + 1, 1, C.g3);
    return { y: y + 9, flag };
  }

  function drawTowerActive(o, tr, m, yLine, flag, t) {
    const X = tr.x, LX = tr.LX, my = BODY_Y + m * MP, ym = my + 23, tier = tr.d.tiers[m];
    const acc = flag ? C.red : C.g6;
    // the plate wakes up: bright edge, inverted icon, lit name
    R(o, X, my + 2, 3, 42, acc); R(o, X + 3, my + 2, TW - 3, 1, acc);
    R(o, X + 5, my + 7, 20, 20, flag ? C.red : C.g5); icon(o, tier[0], X + 6, my + 8, 2, C.k, flag ? C.redM : C.g3);
    T(o, tier[0], X + 30, my + 15, FP(8), C.g6);
    T(o, nameOf(tier), X + 5, my + 39, FV(16), C.g6);
    if (tier[3] != null) { R(o, X + TW - 34, my + 8, 31, 16, C.g0); T(o, tier[3] + '%', X + TW - 4, my + 22, FV(20), C.g6, 'right'); }
    // emitter, a beam of travelling dashes across the gutter, the rail port, the elbow down the rail to the line
    R(o, X + TW - 2, ym - 4, 4, 8, acc);
    const b0 = X + TW + 2, b1 = LX - 5;
    R(o, b0, ym - 1, b1 - b0, 2, flag ? C.redM : C.g3);
    const off = Math.floor(mod(t * 60, 6));
    for (let xx = b0 - 6 + off; xx < b1; xx += 6) { const a = Math.max(xx, b0), b = Math.min(xx + 3, b1); if (b > a) R(o, a, ym - 1, b - a, 2, acc); }
    R(o, LX - 5, ym - 4, 6, 8, acc); R(o, LX - 4, ym - 3, 4, 6, C.k);
    const y0 = Math.min(ym, yLine), y1 = Math.max(ym, yLine);
    R(o, LX - 3, y0 - 1, 2, y1 - y0 + 2, acc);
    if (flag) bang(o, X + TW + 5, Math.max(ym - 17, 109), 2); // the tower's alert: a '!' standing on the beam, in the gutter, its top kept below the header (y 94)
  }

  function drawTrack(o, tr, t) {
    const tt = t + tr.ph, s = tr.v * tt, LX = tr.LX, LW = tr.LW, ext = tr.solid, P = tr.P;
    const nLo = Math.ceil((s + 8 - BODY_H - 16) / P), nHi = Math.floor((s + 8 + 16) / P);
    // which line each tower is acting on right now: a short window, so the towers fire as a downward cascade
    const reads = {}, acts = [];
    let killNear = false;
    tr.d.tiers.forEach((tier, m) => {
      const tag = tier[0], ym = tr.scan[m] != null ? tr.scan[m] : BODY_Y + 23 + m * MP, n = Math.round((BODY_Y + 8 + s - ym) / P), y = yOf(tr, n, s);
      if (tag === 'KILL') { if (isFlag(tr, n) && Math.abs(y - ym) < 16) killNear = { m, y }; return; }
      if (tier[4] === 'bay') return;
      if (y - ym < -tr.RH || y - ym >= tr.RH) return;
      if (isPull(tr, n) && tt >= tPull(tr, n)) return;
      if (reads[n]) return; // one reader per line: where two windows touch, the upper tower finishes first
      const r = { m, n, y: Math.round(y), kind: tag, mode: (tag === 'SBX' || tag === 'LP') ? 'fence' : 'read', p: (y - ym + tr.RH) / (2 * tr.RH) };
      reads[n] = r; acts.push(r);
    });
    // lines
    const hooked = [];
    clipR(o, LX, BAND_B, LW, BODY_B - BAND_B); // rows live strictly below the intake band
    for (let n = nLo; n <= nHi; n++) {
      const yf = yOf(tr, n, s), y = Math.round(yf);
      if (isPull(tr, n)) {
        const u = tt - tPull(tr, n);
        if (u >= 0 && u < tr.PULL) { hooked.push({ n, yf, u }); continue; }
        if (u >= tr.PULL) { const a = fadeAt(y); if (a > 0) drawGhost(o, tr, n, y, a, true); continue; }
      }
      const a = fadeAt(y); if (a <= 0) continue;
      drawLine(o, tr, n, y, reads[n], t, a);
    }
    unclip(o);
    if (ext) { o.globalAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 5)); o.drawImage(K.glow, LX, BODY_Y); o.globalAlpha = 1; }
    // intake strip: the lines pour in beneath it
    R(o, LX, BODY_Y, LW, INTAKE - 1, C.k);
    if (ext) {
      const bl = Math.floor(t * 3) % 2 === 0, col = bl ? C.red : C.redM;
      for (let cx = LX + 10; cx < LX + LW - 24; cx += 48) { sprite(o, DOWN, cx, BODY_Y + 3, 1, col); sprite(o, TIMES, cx + 10, BODY_Y + 2, 1, col); sprite(o, DIG[3], cx + 16, BODY_Y + 2, 1, col); }
    } else for (let cx = LX + 10; cx < LX + LW - 24; cx += 48) { sprite(o, DOWN, cx, BODY_Y + 3, 1, C.g2); sprite(o, TIMES, cx + 10, BODY_Y + 2, 1, C.g2); sprite(o, DIG[1], cx + 16, BODY_Y + 2, 1, C.g2); }
    // hooked lines travel outside the lane clip, to the door
    let hookInfo = null;
    hooked.forEach(h => { hookInfo = drawHooked(o, tr, h.n, h.yf, h.u); });
    // towers act
    acts.forEach(r => drawTowerActive(o, tr, r.m, r.y, isFlag(tr, r.n), t));
    if (hookInfo) drawTowerActive(o, tr, tr.bayM, hookInfo.y, hookInfo.flag, t);
    if (killNear && Math.floor(t * 4) % 2 === 0) { // a red line slides past a switch nobody armed
      const X = tr.x, my = BODY_Y + killNear.m * MP;
      R(o, X + TW - 30, my + 7, 27, 11, C.redD); T(o, 'OFF', X + TW - 4, my + 16, FP(8), C.red, 'right');
    }
    drawBay(o, tr, tt, t);
    drawEdge(o, tr, tt, t);
  }

  function deskSprite(o, X, Y, state, fl, t) { // 28x20: reviewer, monitor, desk
    const busy = state !== 'FREE';
    R(o, X, Y + 14, 28, 2, C.g3); R(o, X + 2, Y + 16, 1, 4, C.g2); R(o, X + 25, Y + 16, 1, 4, C.g2);
    bevel(o, X + 15, Y + 3, 12, 9, busy ? C.g1 : C.k, C.g3, C.g2); R(o, X + 20, Y + 12, 2, 2, C.g3);
    if (busy) { // a ticket's text scrolling on the monitor
      const sc = Math.floor(t * 5);
      for (let i = 0; i < 3; i++) R(o, X + 17, Y + 5 + i * 2, 3 + Math.floor(hash(sc + i, 21) * 6), 1, state === 'DONE' ? C.g4 : (fl ? C.red : C.g5));
    } else if (Math.floor(t * 2) % 2) R(o, X + 17, Y + 9, 2, 1, C.g3);
    R(o, X + 5, Y + 3, 4, 4, busy ? C.g5 : C.g3);   // head
    R(o, X + 4, Y + 8, 6, 5, busy ? C.g4 : C.g2);   // torso
    if (busy) R(o, X + 10, Y + 10, 4, 1, C.g4);     // arm on the keys
    R(o, X + 12, Y + 13, 6, 1, C.g2);               // keyboard
  }

  function stamp(o, cx, Y, w, v, red) { // a rubber stamp, a little crooked
    const c = red ? C.red : v === 'APPROVED' ? C.g6 : C.g4, X = -Math.round(w / 2);
    o.save(); o.translate(cx, Y + 7); o.rotate((v === 'APPROVED' ? -3 : 2) * Math.PI / 180);
    if (v === 'APPROVED') { R(o, X, -7, w, 13, c); T(o, v, 0, 4, FV(16), C.k, 'center'); }
    else { R(o, X, -7, w, 13, red ? C.redD : C.g0); box(o, X, -7, w, 13, c); T(o, v, 0, 4, FV(16), c, 'center'); }
    o.restore();
  }

  function coin(o, X, Y) { R(o, X + 2, Y, 6, 10, C.g6); R(o, X, Y + 2, 10, 6, C.g6); R(o, X + 1, Y + 1, 8, 8, C.g6); R(o, X + 3, Y + 2, 4, 6, C.g3); R(o, X + 2, Y + 3, 6, 4, C.g3); R(o, X + 4, Y + 3, 2, 4, C.g6); }

  function drawBay(o, tr, tt, t) {
    const bx = tr.BX, bw = tr.BW, s = tr.v * tt, mcx = bx + bw / 2;
    const nNow = Math.floor((BODY_Y + 8 + s - tr.y0) / tr.P);
    const busy = new Array(tr.desks).fill(null);
    let last = null, enter = null;
    let n = nNow - mod(nNow - tr.pullRes, 3);
    for (let i = 0; i < tr.desks * 4 + 3; i++, n -= 3) {
      const u = tt - tPull(tr, n) - tr.PULL, d = mod((n - tr.pullRes) / 3, tr.desks);
      if (u >= 0 && u < 0.6 && enter == null) enter = n; // lights on the frame the ticket leaves the door, never while it is still there
      if (u >= 0 && u < tr.D + tr.SD && !busy[d]) busy[d] = { n, u };
      if (u >= tr.D && last == null) last = n;
    }
    if (enter != null) { // the IN slot carries the ticket's short name
      const fl = isFlag(tr, enter), nm = fitName(shortOf(tr, enter), bw - 16);
      R(o, bx + 5, tr.bayY - 7, bw - 10, 16, fl ? C.red : C.g5);
      drawName(o, nm, bx + Math.round((bw - nameW(nm)) / 2), tr.bayY + 5, C.k);
    } else T(o, 'IN', bx + bw / 2, tr.bayY + 6, FV(16), C.g3, 'center');
    for (let d = 0; d < tr.desks; d++) {
      const dy = tr.deskY(d), b = busy[d];
      const state = !b ? 'FREE' : b.u < tr.D ? 'BUSY' : 'DONE', fl = !!b && isFlag(tr, b.n);
      deskSprite(o, bx + 18, dy, state, fl, t + d * 0.37);
      if (state === 'DONE') { const v = verdictOf(tr, b.n); stamp(o, mcx, dy + 22, bw - 12, v, v === 'TOSSED' && fl); continue; }
      R(o, bx + 6, dy + 23, bw - 12, 2, C.g1);
      if (state === 'BUSY') R(o, bx + 6, dy + 23, Math.round((bw - 12) * b.u / tr.D), 2, fl ? C.red : C.g5);
      T(o, state, mcx, dy + 35, FP(8), state === 'BUSY' ? (fl ? C.red : C.g5) : C.g3, 'center');
    }
    if (last != null) { const v = verdictOf(tr, last); stamp(o, mcx, tr.deskY(tr.desks) + 12, bw - 12, v, v === 'TOSSED' && isFlag(tr, last)); }
  }

  // Payouts ride one lane under each track's finish line: the public lane takes delivered lines, LANDED leaks and approved deferrals
  // shipping from the bay. Each pop waits for the next free beat of a fixed metronome and successive beats step across the lane's
  // columns, so no two pops start together, and a column is free again before its next beat comes round.
  function payouts(tr, tt) {
    const ln = tr.lane, life = ln.cols * ln.gap - 0.05, W0 = Math.floor((tt - 20) / 20) * 20, ev = [];
    const E = BODY_B - BODY_Y - 8; // line n crosses the finish edge at (E + nP) / v
    for (let n = Math.ceil((W0 * tr.v - E) / tr.P); ; n++) {
      const at = (E + n * tr.P) / tr.v; if (at > tt) break;
      if (isPull(tr, n) || (!tr.solid && isFlag(tr, n))) continue;
      ev.push({ at, n, landed: isFlag(tr, n) });
    }
    if (tr.solid) { // an approved deferral ships when its desk finishes
      const B = tr.y0 - BODY_Y - 8, lag = tr.PULL + tr.D;
      for (let n = Math.ceil(((W0 - lag) * tr.v - B) / tr.P); ; n++) {
        const at = (B + n * tr.P) / tr.v + lag; if (at > tt) break;
        if (isPull(tr, n) && verdictOf(tr, n) === 'APPROVED') ev.push({ at, n, landed: false });
      }
    }
    ev.sort((a, b) => a.at - b.at || a.n - b.n);
    const live = []; let beat = -Infinity;
    ev.forEach(e => {
      beat = Math.max(Math.ceil(e.at / ln.gap - 1e-9), beat + 1);
      const u = tt - beat * ln.gap;
      if (u >= 0 && u < life) live.push({ n: e.n, landed: e.landed, col: mod(beat, ln.cols), k: u / life });
    });
    return live;
  }

  function drawEdge(o, tr, tt, t) {
    const LX = tr.LX, LW = tr.LW, s = tr.v * tt, P = tr.P;
    const nExit = Math.floor((BODY_Y + 8 + s - BODY_B) / P); // newest line past the edge
    const ln = tr.lane;
    payouts(tr, tt).forEach(p => {
      const xx = ln.x + p.col * ln.pitch, yy = Math.round(600 - p.k * ln.rise);
      o.globalAlpha = 1 - p.k * p.k * p.k;
      if (!tr.solid) T(o, '+0.1%', xx, yy, FV(16), C.g4);
      else if (p.landed) { R(o, xx, yy - 13, 52, 16, C.red); T(o, 'LANDED', xx + 26, yy, FV(20), C.k, 'center'); }
      else { coin(o, xx, yy - 10); T(o, S.coins[mod(p.n, 4)], xx + 13, yy, FV(16), C.g6); }
      o.globalAlpha = 1;
    });
    if (tr.solid) {
      T(o, '1.7k', tr.x + 28, 598, FV(20), C.g5);
      T(o, '+$' + (1.7333 * mod(t, S.event.total)).toFixed(1) + 'k', tr.XR, 598, FV(20), C.g6, 'right');
    } else {
      const p = 0.584 + 0.0011 * (nExit - Math.floor(nExit / 3)) % 0.4;
      const bw = LW - 52;
      R(o, LX + 2, 570, Math.round((bw - 4) * p), 8, C.g4);
      for (let i = 1; i < 10; i++) { const xi = LX + Math.round(bw * i / 10); if (xi < LX + 2 + Math.round((bw - 4) * p)) R(o, xi, 570, 1, 8, C.g2); }
      T(o, (p * 100).toFixed(1) + '%', LX + LW, 580, FV(16), C.g5, 'right');
    }
  }

  // ---------------------------------------------------------------- dynamic: HUD, event, codec, menu, ETA
  function drawHUD(o, t) {
    const val = mod(S.cash + t * 1733.3, 1e6), str = String(Math.floor(val)).padStart(6, '0');
    const f = val - Math.floor(val), rr = ease(clamp((f - 0.55) / 0.45, 0, 1));
    const lead = str.search(/[1-9]/); // leading-zero drums stay dark
    let carry = true;
    for (let i = 5; i >= 0; i--) {
      const d = +str[i], r = carry ? rr : 0, X = CASHX(i), col = i < lead ? C.g2 : C.g6;
      carry = carry && d === 9;
      clipR(o, X, 14, 14, 24);
      const yy = 34 - Math.round(r * 24);
      T(o, String(d), X + 1, yy, FV(32), col); if (r > 0) T(o, String((d + 1) % 10), X + 1, yy + 24, FV(32), C.g6);
      o.globalAlpha = 0.55; R(o, X, 14, 14, 4, C.k); R(o, X, 34, 14, 4, C.k); o.globalAlpha = 1;
      R(o, X, 14, 14, 1, C.g2); R(o, X, 37, 14, 1, C.g2);
      unclip(o);
    }
    const ts = S.tasksPerSec + Math.round(Math.sin(t * 2.3) * 9 + Math.sin(t * 7.1) * 4);
    T(o, ts.toLocaleString('en-US'), 652, 35, FV(24), C.g5);
  }

  function drawEvent(o, t) {
    const tr = TRK[0], X = tr.x, Y = 74, ev = S.event;
    const left = ev.total - mod(t, ev.total), bl = Math.floor(t * 3) % 2 === 0;
    R(o, X + 4, Y + 3, 14, 14, bl ? C.red : C.redM); T(o, '!', X + 7, Y + 15, FP(8), C.k);
    T(o, ev.title, X + 24, Y + 14, FP(8), C.red);
    TX(o, ev.detail.replace(/^x(?=\d)/, '×'), X + 128, Y + 15, FV(16), C.red);
    T(o, Math.ceil(left) + 's', X + 276, Y + 16, FV(20), C.red, 'right');
    const bx = X + 284, bw = tr.XR - 8 - bx;
    box(o, bx, Y + 5, bw, 10, C.redM);
    const fw = Math.round((bw - 4) * left / ev.total);
    for (let i = 0; i < fw; i += 3) R(o, bx + 2 + i, Y + 7, Math.min(2, fw - i), 6, C.red);
  }

  function drawCodec(o, t) {
    // incident flash; the PTT key lights on the same beat, an incoming call
    const on = Math.floor(t * 2.5) % 2 === 0, F = FLASH;
    if (on) { R(o, F.x, F.y, F.w, F.h, C.red); T(o, '! ' + S.codec.kind, F.x + 8, F.y + 14, FP(8), C.k); T(o, '· ' + S.codec.what, F.x + 166, F.y + 15, FV(20), C.k); }
    else { R(o, F.x, F.y, F.w, F.h, C.redD); box(o, F.x, F.y, F.w, F.h, C.red); T(o, '! ' + S.codec.kind, F.x + 8, F.y + 14, FP(8), C.red); T(o, '· ' + S.codec.what, F.x + 166, F.y + 15, FV(20), C.red); }
    const mx = MID.x, mw = MID.w, dy = DSP.y;
    if (on) { R(o, mx + 24, PL.y, mw - 48, 15, C.g6); T(o, 'PTT', mx + mw / 2, PL.y + 12, FP(8), C.k, 'center'); }
    // call timer above PTT
    const secs = String(Math.floor(t) % 10000).padStart(4, '0');
    for (let i = 0; i < 4; i++) seg7(o, CNT.x + i * (CNT.w + CNT.gap), CNT.y, CNT.w, CNT.h, 2, +secs[i], C.g5, null);
    // signal ramp: lights from the bottom while the CEO talks
    const talking = mod(t, 9) < 4.8;
    const amp = talking ? 0.4 + 0.6 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1)) : 0.14;
    const lit = Math.max(1, Math.round(amp * RAMP.length));
    RAMP.forEach((w, i) => { if (RAMP.length - i <= lit) R(o, mx + 6, dy + 26 + i * 6, w, 4, C.g6); });
    if (talking || Math.floor(t * 2) % 2 === 0) T(o, 'RECV', mx + mw - 6, dy + 16, FP(8), C.g6, 'right');
    // the heart (the CEO is not calm)
    const beat = mod(t * 132 / 60, 1) < 0.18;
    sprite(o, HEART, MID.x + Math.round((MID.w - 73) / 2), UY - 11, 1, beat ? C.g6 : C.g3);
    // portrait interference band
    [PL, PRt].forEach((p, i) => {
      const yy = p.y + Math.round(mod(t * 38 + i * 50, p.h + 30)) - 15;
      o.save(); o.beginPath(); o.rect(p.x, p.y, p.w, p.h - 15); o.clip();
      o.globalAlpha = 0.12; R(o, p.x, yy, p.w, 6, C.g6); o.globalAlpha = 0.24; R(o, p.x, yy + 2, p.w, 1, C.g6);
      o.restore(); o.globalAlpha = 1;
    });
    if (talking && Math.floor(t * 8) % 2) R(o, PL.x + PL.w - 10, PL.y + 4, 6, 4, C.g6); // speaking light
    // dialog typing
    const total = S.codec.line.length, shown = Math.floor(clamp(mod(t, 9) / 4.8, 0, 1) * total);
    T(o, S.codec.speaker + ':', DLG.x + 8, DLG.y + 18, FV(20), C.g6);
    let left = shown;
    K.wrap.forEach((ln, i) => {
      const lx = DLG.x + 24, yy = DLG.y + 36 + i * 18;
      const part = ln.slice(0, Math.max(0, left)); left -= ln.length + 1;
      T(o, part, lx, yy, FV(20), C.g5);
      if (left < 0 && left > -ln.length - 2 && Math.floor(t * 4) % 2 === 0) { R(o, lx + TWd(o, part, FV(20)) + 1, yy - 12, 7, 13, C.g6); left = -9999; }
    });
    if (shown >= total && Math.floor(t * 2) % 2) for (let i = 0; i < 4; i++) R(o, DLG.x + DLG.w - 16 + i, DLG.y + DLG.h - 12 + i, 7 - 2 * i, 1, C.g5);
  }

  function drawMenu(o, t) {
    const ti = S.bar.findIndex(b => b[0] === 'TM'); const [sx, sy] = slotXY(ti);
    const on = Math.floor(t * 3) % 2 === 0;
    box(o, sx - 1, sy - 1, MENU.cw + 2, MENU.ch + 2, on ? C.g6 : C.g4);
    box(o, sx, sy, MENU.cw, MENU.ch, C.g5);
  }

  function drawETA(o, t) {
    const { x: X, y: Y } = ETA;
    const sec = Math.max(0, 252 - Math.floor(t));
    T(o, String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'), X + 78, Y + 38, FV(28), C.g6);
    // throughput sparkline: the surge shows as a climb
    let prev = null;
    for (let i = 0; i < 48; i++) {
      const tt = t - (47 - i) * 0.35;
      const v = 0.45 + 0.3 * Math.sin(tt * 0.9) * Math.sin(tt * 0.31 + 1) + 0.12 * Math.sin(tt * 3.7);
      const yy = Y + 36 - Math.round(clamp(v, 0, 1) * 16), xx = X + 158 + i * 2;
      if (prev !== null) { const a = Math.min(prev, yy), b = Math.max(prev, yy); R(o, xx, a, 1, b - a + 1, i === 47 ? C.g6 : C.g4); }
      prev = yy;
    }
    R(o, X + 252, prev - 1, 3, 3, C.g6);
  }

  function drawFrame(c, t) {
    if (!K || (!K.ok && fontsReady())) build();
    // Paint straight onto c when it is exactly this 1200x660 view (any DPR scale); otherwise via an offscreen frame.
    const m = c.getTransform ? c.getTransform() : null, cv = c.canvas;
    const direct = !!(m && cv && m.b === 0 && m.c === 0 && m.e === 0 && m.f === 0 &&
      Math.abs(cv.width - 1200 * m.a) < 1 && Math.abs(cv.height - 660 * m.d) < 1);
    const o = direct ? c : K.f, src = direct ? cv : K.frame;
    o.save();
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.imageSmoothingEnabled = false;
    o.drawImage(K.stat, 0, 0, 1200, 660);
    if (CAN_MASK) { // collect this frame's glyphs, in frame coordinates whatever the device scale
      K.md.setTransform(1, 0, 0, 1, 0, 0); K.md.globalAlpha = 1; K.md.clearRect(0, 0, 1200, 660);
      MK = K.md; MKI = o.getTransform().inverse();
    }
    drawHUD(o, t);
    drawEvent(o, t);
    TRK.forEach(tr => drawTrack(o, tr, t));
    drawCodec(o, t);
    drawMenu(o, t);
    drawETA(o, t);
    MK = null;
    // phosphor bloom from the brights only: downsample, square (multiply by itself) to drop the dim greens,
    // tint toward the phosphor so the glow stays green instead of drifting cyan-white, add back blurred
    K.h.imageSmoothingEnabled = true; K.q.imageSmoothingEnabled = true; K.e.imageSmoothingEnabled = true;
    K.h.globalCompositeOperation = 'copy'; K.h.drawImage(src, 0, 0, src.width, src.height, 0, 0, 600, 330);
    K.q.globalCompositeOperation = 'copy'; K.q.drawImage(K.half, 0, 0, 300, 165);
    K.q2.globalCompositeOperation = 'copy'; K.q2.drawImage(K.quart, 0, 0);
    K.q.globalCompositeOperation = 'multiply'; K.q.drawImage(K.quart2, 0, 0);
    K.q.fillStyle = '#55ff40'; K.q.fillRect(0, 0, 300, 165);
    K.e.globalCompositeOperation = 'copy'; K.e.drawImage(K.quart, 0, 0, 150, 83);
    o.imageSmoothingEnabled = true; o.globalCompositeOperation = 'lighter';
    o.globalAlpha = 0.4; o.drawImage(K.quart, 0, 0, 1200, 660);
    o.globalAlpha = 0.35; o.drawImage(K.eighth, 0, 0, 1200, 660);
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.imageSmoothingEnabled = false;
    // scanlines skip the letters: punch every glyph (static and live) out of them, so pixel faces keep all their strokes
    const s2 = K.s2;
    s2.globalCompositeOperation = 'copy'; s2.drawImage(K.scan, 0, 0);
    if (CAN_MASK) { s2.globalCompositeOperation = 'destination-out'; s2.drawImage(K.mStat, 0, 0); s2.drawImage(K.mDyn, 0, 0); }
    s2.globalCompositeOperation = 'source-over';
    o.drawImage(K.scan2, 0, 0, 1200, 660);
    o.drawImage(K.vig, 0, 0, 1200, 660);
    o.restore();
    if (!direct) {
      c.save(); c.imageSmoothingEnabled = false; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.drawImage(K.frame, 0, 0, 1200, 660); c.restore();
    }
  }
})();
