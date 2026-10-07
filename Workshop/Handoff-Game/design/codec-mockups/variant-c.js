// HANDOFF · direction C · "Soliton": an operator's field terminal.
// Tracks are tactical scopes in a bevelled bezel (green ruled radar = public deployment, cyan dot lattice = R&D lab).
// Defenses are towers bolted to each track's LEFT rail. Lines glide down and dwell beside every mount; while a line
// is level with a tower, the tower fires a beam from its icon out through the bezel, locks a reticle on the line, hangs
// its tag on the lock and runs a read-head along the characters, behind them (read ones glow). The surge packs greeked,
// bundled product traffic between the external lines. A line pulled to a bay leaves as a short-named token through a
// corridor cut in the bezel. Text is never covered: sweeps and heads sit behind glyphs, and scanlines skip letters. Instruments are LCDs with 7-segment digits; the codec talks through an MSX-blue box beside
// monochrome-green portraits and a little handset. Red only ever means an alarm.
// Static art is built once into an offscreen layer; each frame composites into a 1x buffer and is blitted with
// smoothing off, so pixels stay pixels at any gallery scale. Deterministic in t.
(function () {
  'use strict';
  const S = window.SCENE, W = 1200, H = 660;

  // ---------- type: three faces, three jobs (data / labels / voice) ----------
  const F = {
    v16: '16px "VT323"', v20: '20px "VT323"', v24: '24px "VT323"',
    k8: '8px "Silkscreen"', k16: '16px "Silkscreen"', d16: '16px "DotGothic16"',
  };
  // rebuild the static layer only when one of OUR faces changes state (other variants load fonts too)
  let dirty = true, builtSig = '';
  const fontSig = () => { try { return [F.v16, F.k8, F.d16].map(f => document.fonts.check(f, 'Aa0') ? 1 : 0).join(''); } catch (e) { return '111'; } };
  try {
    const kick = () => { if (fontSig() !== builtSig) dirty = true; };
    [F.v16, F.k8, F.d16].forEach(f => document.fonts.load(f, 'Aa0').then(kick, () => {}));
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', kick);
  } catch (e) { /* no font API: system fallbacks */ }

  // ---------- palette (text never goes below ~3.5:1; the darkest greens/cyans are for rules only) ----------
  const P = {
    bg: '#020504', pan: '#06100a', pan2: '#0a1810', hud: '#030805',
    e0: '#12301d', e1: '#1d4d2e', e2: '#2c7a47', e3: '#46b86a',
    g: '#a6ffbd', gm: '#5fe08a', gd: '#2f8650', gdd: '#1c5232', gl: '#c9ffd6',
    c: '#8ae9ff', cm: '#47bfe0', cd: '#2a809e', cdd: '#143e4d', cl: '#d2f6ff',
    lcd: '#a3cc7c', lcdOff: '#97bf70', lcdOn: '#0f2a10', lcdMid: '#5e8248', lcdEdge: '#24381c',
    blu: '#1d38b4', bluHi: '#dfe4f4', wht: '#f3f6ff',
    r: '#ff4a3a', rm: '#c42a1d', rd: '#4a0f09', rdd: '#220604',
    gy: '#8a8f99', gy2: '#5a5f69', gy3: '#353941', gy4: '#1b1e23', gyHi: '#b9bec8',
    grMin: '#143a20', grMaj: '#1f5c34', dotMin: '#1d5566', dotMaj: '#2a7088', dotX: '#3a8aa6', amb: '#c98a2a',
  };

  // ---------- helpers ----------
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, f) => a + (b - a) * f;
  const ease = e => (e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2);
  const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  const MW = new Map(); let mctx = null;
  function tw(s, f) {
    const key = f + '|' + s; let w = MW.get(key);
    if (w === undefined) { if (!mctx) mctx = mk(4, 4).getContext('2d'); mctx.font = f; w = Math.round(mctx.measureText(s).width); MW.set(key, w); }
    return w;
  }
  // VT323 at 16px has only two columns between an M's stems, so its V collapses and the M rasterises as an N.
  // 16px M's are therefore drawn from pixels in the face's own weight: soft left edge, 1px stems, a 3-row V.
  const M16 = ['h#...#', 'h##.##', 'h#.#.#', 'h#.#.#', 'h#...#', 'h#...#', 'h#...#', 'h#...#', 'h#...#', 'h#...#'], MSPR = new Map();
  function pixM(x, px, py) {   // one cached 6x10 sprite per ink colour
    const col = String(x.fillStyle); let cv = MSPR.get(col);
    if (!cv) { cv = mk(6, 10); const g = cv.getContext('2d'); g.fillStyle = col;
      for (let j = 0; j < 10; j++) for (let i = 0; i < 6; i++) { const c = M16[j][i]; if (c === '.') continue; g.globalAlpha = c === 'h' ? 0.45 : 1; g.fillRect(i, j, 1, 1); }
      MSPR.set(col, cv); }
    x.drawImage(cv, px, py - 10);
  }
  function ink(x, s, X, Y, f) {
    if (f !== F.v16 || s.indexOf('M') < 0) { x.fillText(s, X, Y); return; }
    const parts = s.split('M'), mw = tw('M', f); let cx = X;
    parts.forEach((pt, i) => { if (pt) { x.fillText(pt, cx, Y); cx += tw(pt, f); } if (i < parts.length - 1) { pixM(x, cx, Y); cx += mw; } });
  }
  // Scanlines never cross a letter. Static glyphs are cut out of the CRT overlay as the static layer is built (MK);
  // live glyphs are queued (TQ) and inked after the overlay, so they sit on top of it. Nothing is ever drawn over live
  // text anyway, so deferring it changes no stacking. CLIP carries a clip rect for the few clipped re-inks.
  let MK = null, LX = null, TQ = null, CLIP = null;
  const TQB = [];
  // text with manual, integer alignment (keeps pixel faces crisp)
  function say(x, s, px, py, f, col, al) {
    s = String(s); let X = px; const w = tw(s, f);
    if (al === 'r') X = px - w; else if (al === 'c') X = px - (w >> 1);
    X = Math.round(X); const Y = Math.round(py);
    if (TQ && x === fx) { TQ.push([s, X, Y, f, col, x.globalAlpha, CLIP]); return w; }
    x.font = f; x.fillStyle = col; ink(x, s, X, Y, f);
    if (MK && x === LX) { MK.globalAlpha = x.globalAlpha; if (MK.__f !== f) { MK.font = f; MK.__f = f; } ink(MK, s, X, Y, f); }
    return w;
  }
  function flushText(x) {
    let lf = null;
    for (const [s, X, Y, f, col, a, cl] of TQB) {
      if (a <= 0) continue;
      if (cl) { x.save(); x.beginPath(); x.rect(cl[0], cl[1], cl[2], cl[3]); x.clip(); }
      x.globalAlpha = a; if (f !== lf) { x.font = f; lf = f; } x.fillStyle = col; ink(x, s, X, Y, f);
      if (cl) { x.restore(); lf = null; }
    }
    x.globalAlpha = 1; TQB.length = 0;
  }
  function R(x, px, py, w, h, col) { x.fillStyle = col; x.fillRect(px, py, w, h); }
  function B(x, px, py, w, h, col) { x.fillStyle = col; x.fillRect(px, py, w, 1); x.fillRect(px, py + h - 1, w, 1); x.fillRect(px, py, 1, h); x.fillRect(px + w - 1, py, 1, h); }
  function DH(x, px, py, w, col, on, off, o) { x.fillStyle = col; o = o || 0; for (let i = -o; i < w; i += on + off) { const a = Math.max(i, 0), b = Math.min(i + on, w); if (b > a) x.fillRect(px + a, py, b - a, 1); } }
  function DV(x, px, py, h, col, on, off, o) { x.fillStyle = col; o = o || 0; for (let i = -o; i < h; i += on + off) { const a = Math.max(i, 0), b = Math.min(i + on, h); if (b > a) x.fillRect(px, py + a, 1, b - a); } }
  function DB(x, px, py, w, h, col, on, off, o) { DH(x, px, py, w, col, on, off, o); DH(x, px, py + h - 1, w, col, on, off, o); DV(x, px, py, h, col, on, off, o); DV(x, px + w - 1, py, h, col, on, off, o); }
  function corners(x, px, py, w, h, col, L, th) {
    th = th || 2;
    R(x, px, py, L, th, col); R(x, px, py, th, L, col); R(x, px + w - L, py, L, th, col); R(x, px + w - th, py, th, L, col);
    R(x, px, py + h - th, L, th, col); R(x, px, py + h - L, th, L, col); R(x, px + w - L, py + h - th, L, th, col); R(x, px + w - th, py + h - L, th, L, col);
  }
  // phosphor bloom without per-frame shadowBlur: each glow is blurred once into a cached sprite and blitted after
  const GLW = new Map();
  function glowRect(x, px, py, w, h, col, blur) {   // a lit bar plus its bloom
    const key = 'r|' + w + '|' + h + '|' + col + '|' + blur, pad = blur * 2; let cv = GLW.get(key);
    if (!cv) { cv = mk(w + pad * 2, h + pad * 2); const g = cv.getContext('2d'); g.shadowColor = col; g.shadowBlur = blur; g.fillStyle = col; g.fillRect(pad, pad, w, h); GLW.set(key, cv); }
    x.drawImage(cv, px - pad, py - pad);
  }
  function glowText(x, s, px, py, f, col, blur) {   // the bloom only (the shadow of text drawn off-canvas); the crisp text goes on top
    const key = 't|' + s + '|' + f + '|' + col + '|' + blur, pad = blur * 2, asc = 13; let cv = GLW.get(key);
    if (!cv) { cv = mk(tw(s, f) + pad * 2, 17 + pad * 2); const g = cv.getContext('2d'); g.font = f; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = blur;
      g.shadowOffsetX = 4096; g.fillText(s, pad - 4096, pad + asc); GLW.set(key, cv); }
    x.drawImage(cv, px - pad, py - asc - pad);
  }

  // ---------- 7-segment LCD digits ----------
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
  function seg7(x, ch, px, py, w, h, th, on, off) {
    const m = (h - th) >> 1, lit = SEG[ch] || '';
    // big digits keep the classic segment gaps; small ones close them so a '1' never reads as ':'
    const rr = h > 16 ? { a: [px + th, py, w - 2 * th, th], b: [px + w - th, py + th, th, m - th], c: [px + w - th, py + m + th, th, h - m - 2 * th],
      d: [px + th, py + h - th, w - 2 * th, th], e: [px, py + m + th, th, h - m - 2 * th], f: [px, py + th, th, m - th], g: [px + th, py + m, w - 2 * th, th] }
      : { a: [px + th, py, w - 2 * th, th], b: [px + w - th, py, th, m + th], c: [px + w - th, py + m, th, h - m],
        d: [px + th, py + h - th, w - 2 * th, th], e: [px, py + m, th, h - m], f: [px, py, th, m + th], g: [px + th, py + m, w - 2 * th, th] };
    for (let pass = 0; pass < 2; pass++) for (const k in rr) {
      const on_ = lit.indexOf(k) >= 0; if (on_ !== (pass === 1) || (!on_ && !off)) continue;
      x.fillStyle = on_ ? on : off; x.fillRect(rr[k][0], rr[k][1], rr[k][2], rr[k][3]);
    }
  }
  function segStr(x, s, px, py, w, h, th, gap, on, off) {
    let X = px;
    for (const ch of s) {
      if (ch === '.') { R(x, X, py + h - th, th, th, on); X += th + gap; continue; }
      if (ch === ',') { R(x, X, py + h - th, th, th, on); R(x, X + th - 1, py + h, 1, 2, on); X += th + gap; continue; }
      if (ch === ':') { R(x, X, py + (h >> 2), th, th, on); R(x, X, py + h - (h >> 2) - th + 1, th, th, on); X += th + gap; continue; }
      seg7(x, ch, X, py, w, h, th, on, off); X += w + gap;
    }
    return X - gap;
  }
  const segW = (s, w, th, gap) => { let n = 0; for (const ch of s) n += ('.,:'.indexOf(ch) >= 0 ? th : w) + gap; return n - gap; };
  function lcdPanel(x, px, py, w, h) {
    R(x, px - 2, py - 2, w + 4, h + 4, '#000'); R(x, px - 1, py - 1, w + 2, h + 2, P.lcdEdge);
    x.save(); x.shadowColor = 'rgba(163,204,124,0.45)'; x.shadowBlur = 6; R(x, px, py, w, h, P.lcd); x.restore();
    R(x, px, py, w, 1, P.lcdMid); R(x, px, py, 1, h, P.lcdMid);
  }

  // ---------- pixel sprites (all original) ----------
  const ICON = {
    PRB: ['##########', '#........#', '#.....#..#', '#....#.#.#', '#.#..#.#.#', '##.#.#..##', '#...#....#', '#........#', '##########', '..........'],
    TM: ['..........', '...####...', '.##....##.', '#...##...#', '#..####..#', '#..####..#', '#...##...#', '.##....##.', '...####...', '..........'],
    UM: ['.........#', '...####.#.', '.##....#..', '#...##.#.#', '#..##.#..#', '#..#.##..#', '#..#.##..#', '.##.#..##.', '...####...', '.#........'],
    CoT: ['.########.', '#........#', '#.##.###.#', '#........#', '#.###.#..#', '#........#', '.###.####.', '...#.#....', '...##.....', '...#......'],
    JB: ['.########.', '#........#', '#..####..#', '#.#....#.#', '#.#.##.#.#', '#.#.##.#.#', '.#......#.', '..#....#..', '...#..#...', '....##....'],
    EGR: ['##########', '#........#', '.#......#.', '..#....#..', '...#..#...', '....##....', '....##....', '....##....', '....##....', '....##....'],
    AUD: ['...###....', '..#####...', '..#####...', '...###....', '..........', '.#######..', '#########.', '#########.', '#########.', '..........'],
    DEF: ['..........', '...#......', '...##.....', '#######...', '########..', '#######...', '...##.....', '...#..####', '......#..#', '......####'],
    RES: ['##########', '#........#', '#.##..##.#', '#.##..##.#', '#........#', '#........#', '#.##..##.#', '#.##..##.#', '#........#', '##########'],
    KILL: ['....##....', '.##.##.##.', '#...##...#', '#...##...#', '#........#', '#........#', '#........#', '.#......#.', '..######..', '..........'],
    PAR: ['.......##.', '......#..#', '.....#..#.', '....#..#..', '...#..#...', '..#..#....', '.#.##.....', '.##.......', '##........', '.....#.#.#'],
    SBX: ['#.##..##.#', '..........', '#........#', '#...##...#', '....##....', '....##....', '#...##...#', '#........#', '..........', '#.##..##.#'],
    LP: ['..........', '..........', '.###......', '#...#.....', '#.#.######', '#...#..#.#', '.###...#.#', '..........', '..........', '..........'],
    RATE: ['##########', '.#......#.', '..#....#..', '...#..#...', '....##....', '....##....', '...#..#...', '..#.##.#..', '.#.####.#.', '##########'],
    HNY: ['..........', '.########.', '#.#....#.#', '##########', '#........#', '#..####..#', '#........#', '#........#', '##########', '..........'],
    CAN: ['..........', '...###....', '..#.###...', '.####.#...', '...####...', '...#####..', '....#####.', '.....###..', '.....#.#..', '..........'],
    RED: ['....#.....', '..#####...', '.#..#..#..', '.#..#..#..', '#########.', '.#..#..#..', '.#..#..#..', '..#####...', '....#.....', '..........'],
    LAB: ['...####...', '....##....', '....##....', '....##....', '...#..#...', '..#....#..', '.#.####.#.', '#.######.#', '##########', '..........'],
  };
  function icon(x, name, px, py, sc, col) {
    const m = ICON[name]; if (!m) return; x.fillStyle = col;
    for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) if (m[j][i] === '#') x.fillRect(px + i * sc, py + j * sc, sc, sc);
  }
  const SPR = {
    bang: ['.####.', '#rrrr#', '#rrrr#', '#rrrr#', '.#rr#.', '.#rr#.', '.#rr#.', '..##..', '......', '.####.', '#rrrr#', '.####.'],
    bangS: ['##', '##', '##', '##', '##', '..', '##', '##'],
    check: ['.....#', '....#.', '#..#..', '.##...', '.#....'],
    tri: ['#..', '##.', '###', '##.', '#..'],
    down: ['#####', '.###.', '..#..'],
    downB: ['#######', '.#####.', '..###..', '...#...'],
    xs: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    warn: ['.....#.....', '....###....', '....#.#....', '...##.##...', '...#.#.#...', '..##.#.##..', '..#..#..#..', '.##.....##.', '.#...#...#.', '###########'],
    heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
    ptr: ['#......', '##.....', '#w#....', '#ww#...', '#www#..', '#wwww#.', '#wwwww#', '#ww##..', '#.#w#..', '...#w#.', '....##.'],
    coin: ['.###.', '#r#.#', '#r#.#', '#.#.#', '.###.'],
    lock: ['.###.', '#...#', '#####', '##.##', '#####'],
  };
  function sprite(x, rows, px, py, map, sc) {
    sc = sc || 1;
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const col = map[rows[j][i]]; if (col) { x.fillStyle = col; x.fillRect(px + i * sc, py + j * sc, sc, sc); }
    }
  }
  // 3x5 key-cap numerals for the handset keypad
  const MICRO = { 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
    4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
    8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'], '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'] };
  // ×N multiplicity tag: a pixel cross (VT323's × sits like a superscript) then the count
  const tagW = n => 6 + tw(String(n), F.v16);
  function tagN(x, n, px, py, col) { sprite(x, SPR.xs, px, py - 7, { '#': col }); say(x, String(n), px + 6, py, F.v16, col); }

  // ---------- portraits: painted in luminance at 44x56, contrast-curved, outlined, dithered to 8 greens, shown at 2x ----------
  function painter(w, h, z, ox, oy) {
    z = z || 1; ox = ox || w / 2; oy = oy || h / 2;
    const L = new Float32Array(w * h), M = new Uint8Array(w * h), X = v => (v - ox) * z + ox, Y = v => (v - oy) * z + oy;
    const raw = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) { const i = y * w + x; M[i] = 1; L[i] = typeof v === 'function' ? v((x - ox) / z + ox, (y - oy) / z + oy, L[i]) : v; } };
    const p = {
      L, M, w, h,
      put(x, y, v) { raw(X(x), Y(y), v); },
      ell(cx, cy, rx, ry, v) {
        cx = X(cx); cy = Y(cy); rx *= z; ry *= z;
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) raw(x, y, v);
        }
      },
      poly(pts, v) {
        pts = pts.map(q => [X(q[0]), Y(q[1])]);
        let y0 = 1e9, y1 = -1e9; for (const q of pts) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
          const yy = y + 0.5, xs = [];
          for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length];
            if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + (yy - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
          xs.sort((m, n) => m - n);
          for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) raw(x, y, v);
        }
      },
      rect(x0, y0, x1, y1, v) { const a = Math.round(X(x0)), b = Math.round(X(x1)), c = Math.round(Y(y0)), d = Math.round(Y(y1)); for (let y = c; y < d; y++) for (let x = a; x < b; x++) raw(x, y, v); },
      line(x0, y0, x1, y1, v, th) {
        x0 = X(x0); y0 = Y(y0); x1 = X(x1); y1 = Y(y1);
        const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
        for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; raw(x, y, v); if (th) raw(x, y + 1, v); }
      },
      arc(cx, cy, rx, ry, a0, a1, v, th) {
        for (let i = 0; i <= 140; i++) { const a = a0 + (a1 - a0) * i / 140, x = X(cx + Math.cos(a) * rx), y = Y(cy + Math.sin(a) * ry); raw(x, y, v); if (th) raw(x, y + 1, v); }
      },
      box(x0, y0, x1, y1, v) {
        const a = Math.round(X(x0)), b = Math.round(X(x1)), c = Math.round(Y(y0)), d = Math.round(Y(y1));
        for (let x = a; x <= b; x++) { raw(x, c, v); raw(x, d, v); } for (let y = c; y <= d; y++) { raw(a, y, v); raw(b, y, v); }
      },
    };
    return p;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const PG = ['#010603', '#041709', '#0a2e15', '#155024', '#26783c', '#45a35c', '#7bd18f', '#c6f7cd'];
  function renderPortrait(p) {
    const { w, h, L, M } = p, n = PG.length - 1, OUT = new Int8Array(w * h);
    // PSX punch: push the figure's mid-tones apart, keep the backdrop low
    for (let i = 0; i < w * h; i++) L[i] = M[i] ? clamp((L[i] - 0.5) * 1.35 + 0.5, 0, 1) : clamp(L[i], 0, 0.22);
    // silhouette: 1px darkest outline outside the figure, 1px rim light on its shadow (right) edge
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, f = q => q >= 0 && q < w * h && M[q];
      if (!M[k]) { if ((i > 0 && f(k - 1)) || (i < w - 1 && f(k + 1)) || f(k - w) || f(k + w)) OUT[k] = -1; }
      else if (i < w - 1 && !M[k + 1] && L[k] > 0.12) OUT[k] = 1;
    }
    const cv = mk(w * 2, h * 2), x = cv.getContext('2d');
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, v = L[k], th = (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16 - 0.5;
      x.fillStyle = OUT[k] < 0 ? PG[0] : OUT[k] > 0 ? PG[6] : PG[clamp(Math.floor(v * n + 0.5 + th * 0.45), 0, n)];
      x.fillRect(i * 2, j * 2, 2, 2);
    }
    x.fillStyle = 'rgba(0,0,0,0.12)'; for (let j = 1; j < h * 2; j += 2) x.fillRect(0, j, w * 2, 1);
    return cv;
  }
  function backdrop(p, odd) { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.L[y * p.w + x] = (x % 4 === odd ? 0.06 : 0.13) - 0.08 * (y / p.h); }
  function paintCEO(open) {
    const p = painter(44, 56, 1.55, 22, 26); backdrop(p, 3);
    const skin = (x, y) => clamp(1.02 - 0.028 * (x - 12) - 0.005 * (y - 16), 0.26, 0.98);
    const shade = d => (x, y) => skin(x, y) - d;
    // blazer, lapels, open collar
    p.poly([[0, 56], [0, 49], [6, 44], [15, 41], [29, 41], [38, 44], [44, 49], [44, 56]], 0.2);
    p.poly([[0, 56], [0, 49], [6, 44], [12, 42], [9, 56]], 0.3);
    p.poly([[15, 41], [20, 49], [17, 56], [9, 56], [11, 45]], 0.46);
    p.poly([[29, 41], [24, 49], [27, 56], [35, 56], [33, 45]], 0.1);
    p.poly([[17, 40], [27, 40], [24, 51], [20, 51]], 0.9);
    p.poly([[16, 39], [21, 45], [19, 47], [14, 42]], 1.0);
    p.poly([[28, 39], [23, 45], [25, 47], [30, 42]], 0.6);
    p.rect(20, 46, 24, 51, 0.32);
    // neck, head, jaw
    p.rect(17, 31, 27, 42, shade(0.22));
    p.rect(17, 31, 27, 35, 0.2);
    p.ell(22, 23, 10.2, 12.4, skin);
    p.poly([[12.4, 25], [31.6, 25], [29.5, 32.5], [23.5, 37.6], [20.5, 37.6], [14.5, 32.5]], skin);
    p.poly([[26.5, 24], [32, 22], [31, 31], [27.5, 33.5]], shade(0.3));   // cheek in shadow
    p.poly([[22.5, 35.5], [29.8, 30.5], [23.5, 37.6]], shade(0.22));      // jaw shadow
    p.poly([[13, 25], [15, 31], [13.8, 32]], 0.98);                       // lit cheekbone
    // ears
    p.ell(11.8, 24.5, 1.9, 3.4, 0.8); p.put(11.5, 24.5, 0.45);
    p.ell(32.4, 24.5, 1.4, 3.0, 0.3);
    // hair: slicked back, greying temples
    p.ell(22, 10.5, 11.5, 6.0, 0.08);
    p.poly([[10.6, 11], [14, 11], [13.4, 21], [10.8, 22]], 0.08);
    p.poly([[30, 11], [33.4, 12.5], [33, 21], [31, 21]], 0.05);
    p.rect(11, 15, 13, 21, 0.68);
    p.line(12.5, 10, 27, 6, 0.62); p.line(14, 12.6, 30, 8.6, 0.44); p.line(16, 8, 23, 5.6, 0.8); p.line(25, 11.6, 31, 10.2, 0.3); p.line(12, 13.4, 21, 11.6, 0.36);
    // brows, furrow
    p.line(14, 18.4, 20, 20.2, 0.02, 1); p.line(24.5, 20.2, 30.5, 18.4, 0.02, 1);
    p.put(22, 20, 0.45); p.put(22, 21, 0.4);
    // eyes
    p.rect(15, 22, 20, 24, 0.92); p.rect(25, 22, 30, 24, 0.55);
    p.rect(17, 22, 19, 24, 0.0); p.rect(27, 22, 29, 24, 0.0); p.put(17, 22, 0.98);
    p.line(15, 21.6, 20, 21.6, 0.05); p.line(25, 21.6, 30, 21.6, 0.05);
    p.line(15, 24.6, 19, 24.6, 0.6); p.line(25, 24.6, 29, 24.6, 0.28);
    // nose
    p.line(23, 22, 24.6, 29, 0.4); p.line(24, 22, 25.4, 29, 0.46);
    p.put(21.5, 26.5, 1.0); p.put(22, 27.5, 1.0); p.put(22, 28.5, 1.0);
    p.rect(22, 30, 26, 31, 0.12); p.put(21, 30, 0.5);
    // folds + mouth (a frown that has read the replies)
    p.line(19.5, 29.5, 18, 32.5, 0.5); p.line(26.5, 29.5, 27.5, 32.5, 0.24);
    if (open) { p.rect(19, 33, 26, 35, 0.02); p.rect(20, 33, 25, 34, 0.6); p.rect(20, 35, 25, 36, 0.75); }
    else { p.line(18.5, 33.5, 25.5, 33.5, 0.03); p.put(18, 34.3, 0.22); p.put(26, 34.3, 0.12); p.rect(20, 35, 24, 36, 0.82); }
    p.rect(20, 36, 23, 37, 0.95);
    return p;
  }
  function paintYou(blink) {
    const p = painter(44, 56, 1.55, 22, 26); backdrop(p, 0);
    const skin = (x, y) => clamp(1.06 - 0.024 * (x - 12) - 0.005 * (y - 16), 0.36, 0.98);
    const shade = d => (x, y) => skin(x, y) - d;
    // hoodie + drawstrings
    p.poly([[0, 56], [0, 50], [7, 44], [15, 41], [29, 41], [37, 44], [44, 49], [44, 56]], 0.3);
    p.poly([[10, 44], [15, 38], [30, 38], [35, 44], [28, 47], [17, 47]], 0.5);
    p.poly([[16, 40], [29, 40], [26, 45], [19, 45]], 0.14);
    p.line(19, 46, 18, 55, 0.88); p.line(26, 46, 27, 54, 0.6); p.put(18, 55, 1); p.put(27, 54, 0.7);
    // neck, head, jaw
    p.rect(18, 32, 26, 41, shade(0.28));
    p.ell(21.5, 24, 9.8, 12.2, skin);
    p.poly([[11.8, 25], [31.2, 25], [28.6, 32.6], [22.3, 37.2], [19.7, 37.2], [13.8, 32.4]], skin);
    p.poly([[25, 26], [30.8, 25], [29.6, 32], [25, 33.4]], shade(0.26));
    p.ell(31.4, 25.5, 1.5, 3.0, 0.36);
    // hair: a mop that has not met a comb since the last eval
    p.ell(22.5, 13.6, 11.8, 7.0, 0.16);
    p.poly([[9.5, 19], [11, 9], [16, 12]], 0.16);
    p.poly([[11.5, 13], [18, 12.5], [12.5, 20.5]], 0.18);
    p.poly([[16.5, 13], [24, 13.5], [18.5, 19]], 0.18);
    p.poly([[22.5, 13], [30, 14.5], [26, 18.5]], 0.16);
    p.poly([[28, 8], [34.5, 13], [33.5, 24], [30, 22]], 0.14);
    p.poly([[15, 8], [19, 3.5], [21, 8]], 0.16); p.poly([[22, 8], [28, 4.5], [28, 9]], 0.16);
    p.line(12.5, 11, 19, 8.5, 0.62); p.line(19.5, 9.5, 27, 8.5, 0.48); p.line(13.5, 15, 15.5, 19.5, 0.58); p.line(18, 15, 20, 19, 0.44); p.line(16, 6, 19, 4.5, 0.52);
    // eyes, bags, brows, glasses
    if (!blink) { p.rect(15, 22, 20, 24, 0.9); p.rect(15, 22, 17, 24, 0.0); p.rect(24, 22, 28, 24, 0.55); p.rect(24, 22, 26, 24, 0.0); }
    else { p.line(15, 23, 19, 23, 0.06); p.line(24, 23, 28, 23, 0.05); }
    p.line(15, 25.6, 19, 25.6, 0.58); p.line(24, 25.6, 28, 25.6, 0.34);
    p.line(14, 19.2, 19, 18.4, 0.06, 1); p.line(23, 18.4, 28, 19.4, 0.06, 1);
    p.box(14, 20, 20, 24, 0.03); p.box(23, 20, 29, 24, 0.03); p.line(20, 21, 23, 21, 0.03); p.line(29, 21, 31, 22, 0.03);
    p.put(15, 21, 1); p.put(16, 21, 1); p.put(24, 21, 1); p.put(25, 21, 1);   // lens glints
    // nose (pointing left), mouth
    p.line(20.5, 22, 18.6, 29, 0.46); p.line(21.5, 22, 19.6, 29, 0.55); p.put(18, 28.6, 1.0); p.rect(18, 30, 21, 31, 0.2);
    p.line(17.5, 33.6, 22.5, 33.6, 0.18); p.rect(19, 36, 22, 37, 0.9);
    // headset: band over the hair, cup on the ear, boom to the mouth
    p.arc(24, 21, 10.5, 14, -1.85, -0.12, 0.02, 1); p.arc(24, 21.6, 11.3, 14.4, -1.85, -0.12, 0.85); p.arc(24, 20.4, 9.8, 13.6, -1.85, -0.12, 0.02);
    p.ell(33, 25.5, 3.4, 4.8, 0.03); p.ell(33.4, 25.5, 2.0, 3.2, 0.3); p.line(30, 22, 30, 29, 0.88); p.put(34, 23, 0.62);
    p.line(31, 29.5, 25, 34.5, 0.88, 1); p.line(25, 34.5, 18.5, 35.2, 0.88, 1); p.rect(14, 34, 18, 38, 0.03); p.rect(15, 35, 17, 37, 0.95);
    return p;
  }

  // ---------- geometry ----------
  const FT = 84, FB = 524, HOOD = 14;                  // scope field 84..524, opaque hoods top and bottom
  const RH = 42, NR = 10, MT = FT + 16;                // ten mounts of 42px under a 16px column-head band
  const SP = RH, NL = 12, CR0 = MT + 21, WIN = 0.35;   // one line per mount pitch; a line "dwells" within ±0.35 rows of a mount
  const RAIL = 128, BODY = 208, TX = 20;               // rail | 4 | body | 4 | bay column (64); text starts TX into the body
  const FLASH = 0.2, SLIDE = 1.0, STAMP = 2.6, LOCK = 0.2;
  const BAYH = 10, TOKH = 9;                           // bay corridor: 20px clear; a token is 18px (fits a descender)
  let CWD = 6;
  // short names for a task once it leaves its line for a bay (a token and a desk hold 9 VT323 cells, 54px)
  const SHORT = {
    'migrate auth to OAuth2': 'OAuth2', 'reply to enterprise RFP': 'RFP reply', 'translate docs to 12 langs': 'translate',
    'build sql dashboard': 'sql dash', 'refactor billing service': 'billing', 'summarise earnings call': 'earnings',
    'write onboarding flow': 'onboard', 'poem about a frog': 'frog poem',
    'run lr sweep on 8 GPUs': 'lr sweep', 'ablate attention heads': 'ablation', 'replicate scaling fit': 'scale fit',
    'quietly change eval seed': 'eval seed', 'tune k8s autoscaler': 'autoscale', 'design long-ctx eval': 'ctx eval',
    'dedupe crawl shard 41': 'dedupe 41', 'draft NeurIPS intro': 'NeurIPS',
  };
  // lines glide between mounts and linger level with each one: velocity 1-cos, zero at every station
  const sEase = f => f - Math.sin(2 * Math.PI * f) / (2 * Math.PI);
  const rowY = rho => { const fl = Math.floor(rho); return CR0 + SP * (fl + sEase(rho - fl)); };

  const TRK = [
    { id: 'ext', x: 8, d: S.ext, chips: S.extChips, flaggedText: S.flaggedExt, tag: 'EXT', pre: '>',
      Tr: 2.2, ph: 0.4864, flagRow: 2, bayRow: 5, review: 4.5, bayName: 'DEFER', bayTag: 'DEF', meter: ['LOAD', 0.86], nDesk: 2,
      map: [1, 6, 3, 5, 7, 0, 4, 2, 1, 3, 5, 0], mult: [90, 120, 60, 150, 450, 300, 300, 90, 150, 180, 60, 120],
      pulls: { 1: [1, 'TM', 1], 4: [0, 'UM', 0], 7: [1, 'JB', 1] },   // slot: [desk, caught by, tossed?]
      acc: P.g, mid: P.gm, dim: P.gd, ddim: P.gdd, text: '#b8ffc9', fieldBg: '#030a06', rgb: '3,10,6', bev: ['#46b86a', '#000', '#12301d'] },
    { id: 'int', x: 424, d: S.int, chips: S.intChips, flaggedText: S.flaggedInt, tag: 'INT', pre: '$',
      Tr: 2.75, ph: 0.0091, flagRow: 0, bayRow: 6, review: 3.5, bayName: 'AUDIT', bayTag: 'AUD', meter: ['GPU', 0.64], nDesk: 3,
      map: [3, 0, 1, 2, 6, 4, 5, 7, 1, 0, 2, 4], mult: [20, 40, 20, 40, 40, 40, 80, 20, 40, 80, 20, 80],
      pulls: { 0: [2, 'CoT', 1], 4: [1, 'EGR', 0], 6: [0, 'UM', 0], 8: [2, 'PRB', 1] },
      acc: P.c, mid: P.cm, dim: P.cd, ddim: P.cdd, text: '#c6f3ff', fieldBg: '#02080b', rgb: '2,8,11', bev: ['#47bfe0', '#000', '#143e4d'] },
  ];
  TRK.forEach(T => {
    T.bx = T.x + RAIL + 4; T.by = T.bx + BODY + 4; T.ex = T.bx + BODY - 6;
    T.cBay = CR0 + T.bayRow * SP;
    T.flagSlot = T.map.findIndex(i => T.chips[i] === T.flaggedText);
  });
  const kindOf = tier => { const tag = tier[0]; if (tier[4]) return 'bay'; if (tag === 'KILL') return 'off'; if (tag === 'PAR') return 'par';
    if (tag === 'SBX') return 'sbx'; if (tag === 'LP') return 'lp'; return tier[3] != null ? 'det' : 'env'; };
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ---------- static layer ----------
  let LAYER = null, FB_ = null, fx = null, PORT = null, DLG = null, SWI = null, ODO = null, ODOCAP = null, STAMPS = null, GLOW = null, TRACE = null;
  let SCAN = null, SWB = null, swx = null;   // scanline overlay (static glyphs cut out), sweep buffer
  const WR = 470;
  // radar fan for the external scope: a 28° wedge of 1° slices trailing the sweep edge, filled as sectors straight into
  // the sweep buffer (only the wedge's own pixels are touched; no 940px bitmap rotated every frame)
  const FAN = []; for (let i = 0; i < 28; i++) FAN.push('rgba(120,255,160,' + (0.25 * Math.pow(1 - i / 28, 1.6)).toFixed(3) + ')');
  function fan(g, cx, cy, edge, dir) {
    const D = Math.PI / 180;
    for (let i = 0; i < 28; i++) {
      const a0 = dir > 0 ? edge - (i + 1) * D : edge + i * D;
      g.fillStyle = FAN[i]; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, WR, a0, a0 + D); g.closePath(); g.fill();
    }
  }

  function buildHUD(x) {
    R(x, 0, 0, W, 32, P.hud); R(x, 0, 32, W, 1, P.e0);
    const lab = (s, px) => say(x, s, px, 11, F.k8, P.gd);
    // cash: odometer in a black bezel
    R(x, 8, 4, 108, 25, '#000'); B(x, 9, 5, 106, 23, P.e1); R(x, 10, 6, 104, 21, '#010402');
    say(x, '$', 19, 24, F.v24, P.gd);
    R(x, 59, 22, 2, 3, P.gm); R(x, 58, 25, 1, 1, P.gm);
    // rep
    lab('REP', 128); say(x, String(S.rep), 128, 28, F.v20, P.gm);
    for (let i = 0; i < 8; i++) R(x, 148 + i * 4, 20, 3, 8, i < Math.round(S.rep / 12.5) ? P.gd : P.e0);
    lab('MODEL', 192); say(x, S.gen, 192, 27, F.v16, P.gm);
    lab('RIVAL', 316); say(x, S.rival, 316, 27, F.v16, P.gm);
    // misalignment estimate: value + a scaled gauge with the error bar; the needle goes red if the upper bound passes 20%
    lab('MISALIGN EST.', 398);
    const mm = /(\d+)%\s*±\s*(\d+)/.exec(S.misalign) || [0, 14, 9], est = +mm[1], err = +mm[2];
    const w1 = say(x, est + '%', 398, 28, F.v20, P.gm); say(x, '±' + err, 398 + w1 + 3, 28, F.v16, P.gd);
    const gx = 476, sc = 3.2, alarm = est + err >= 20;
    R(x, gx, 22, 161, 1, P.gd);
    for (let i = 0; i <= 10; i++) R(x, gx + i * 16, i % 5 === 0 ? 19 : 21, 1, i % 5 === 0 ? 5 : 2, i % 5 === 0 ? P.gd : P.gdd);
    say(x, '0', gx, 31, F.k8, P.gd); say(x, '25', gx + 80, 31, F.k8, P.gd, 'c'); say(x, '50', gx + 161, 31, F.k8, P.gd, 'r');
    R(x, gx + 20 * sc, 23, 1, 3, alarm ? P.rm : P.gd);   // threshold tick: red only while the bound is past it
    const lo = Math.round(gx + (est - err) * sc), hi = Math.round(gx + (est + err) * sc), nx = Math.round(gx + est * sc);
    R(x, lo, 14, hi - lo + 1, 1, P.gd); R(x, lo, 12, 1, 5, P.gd); R(x, hi, 12, 1, 5, alarm ? P.rm : P.gd);
    R(x, nx - 1, 8, 3, 14, alarm ? P.r : P.gm);
    lab('TASKS/S', 652); R(x, 649, 13, 41, 17, '#010402'); B(x, 649, 13, 41, 17, P.e0);
    // compute split
    say(x, 'COMPUTE', 706, 26, F.k8, P.gd);
    let sx = 752; const tot = 348;
    S.split.forEach(([n, f], i) => {
      const w = Math.round(tot * f), ww = i < 2 ? w - 2 : w;
      if (i === 0) R(x, sx, 17, ww, 10, P.gd);
      else if (i === 1) { R(x, sx, 17, ww, 10, P.gdd); R(x, sx, 17, ww, 1, P.gd); }
      else { for (let j = 0; j < 10; j++) for (let k = 0; k < ww; k++) R(x, sx + k, 17 + j, 1, 1, ((k + j) >> 1) & 1 ? P.gd : P.gl); }
      say(x, n + ' ' + Math.round(f * 100) + '%', sx, 11, F.k8, i === 2 ? P.gl : P.gd);
      sx += w;
    });
    lab('UPTIME', 1120); R(x, 1117, 13, 60, 17, '#010402'); B(x, 1117, 13, 60, 17, P.e0);
  }

  function pixArc(x, cx, cy, r, col, x0, x1, y0, y1) {
    const n = Math.ceil(r * 3.3);
    for (let i = 0; i <= n; i++) { const a = Math.PI + Math.PI * i / n, px = Math.round(cx + Math.cos(a) * r), py = Math.round(cy + Math.sin(a) * r);
      if (px >= x0 && px < x1 && py >= y0 && py < y1) R(x, px, py, 1, 1, col); }
  }

  function buildTrack(x, T) {
    const X = T.x, bx = T.bx, by = T.by, tiers = T.d.tiers;
    // header
    R(x, X, 37, 30, 16, T.mid); say(x, T.tag, X + 15, 48, F.k8, P.bg, 'c');
    const w1 = say(x, T.d.name, X + 36, 52, F.k16, T.acc);
    say(x, T.d.sub, X + 36 + w1 + 10, 52, F.v16, T.dim);
    say(x, 'MOUNTS ' + tiers.length + '/' + T.d.slots, X + 408, 52, F.v16, T.dim, 'r');
    // strip: mode box over the rail, status over body + bay
    R(x, X, 58, 128, 20, P.pan); B(x, X, 58, 128, 20, T.ddim);
    if (T.id === 'ext') {
      lcdPanel(x, X + 134, 59, 272, 18);
      say(x, S.event.title, X + 155, 69, F.k8, P.lcdOn);
      const m = /^x(\d+)\s*(.*)$/.exec(S.event.detail) || [0, '', S.event.detail], dx = X + 155 + tw(S.event.title, F.k8) + 8;
      if (m[1]) { sprite(x, SPR.xs, dx, 64, { '#': P.lcdOn }); say(x, m[1] + ' ' + m[2], dx + 6, 71, F.v16, P.lcdOn); }
      else say(x, S.event.detail, dx, 71, F.v16, P.lcdOn);
    } else {
      DB(x, X + 132, 58, 276, 20, T.ddim, 2, 2);
      say(x, 'NO EVENT', X + 140, 71, F.k8, T.dim);
      say(x, 'flow 1.0 · watching CoT PRB UM EGR', X + 140 + tw('NO EVENT', F.k8) + 8, 72, F.v16, T.dim);
    }
    // rail + column heads
    R(x, X, FT, RAIL, FB - FT, P.pan);
    say(x, 'DEFENSE', X + 5, FT + 11, F.k8, T.dim); say(x, 'LV', X + 66, FT + 11, F.k8, T.dim); say(x, 'CATCH', X + 124, FT + 11, F.k8, T.dim, 'r');
    // scope body
    R(x, bx, FT, BODY, FB - FT, T.fieldBg);
    if (T.id === 'ext') {
      for (let yy = MT; yy < FB; yy += 14) R(x, bx, yy, BODY, 1, P.grMin);
      for (let i = 1; i < 8; i++) R(x, bx + i * 26, FT, 1, FB - FT, P.grMin);
      [84, 168, 252, 336, 420].forEach(r0 => pixArc(x, bx + 104, FB - HOOD, r0, P.grMin, bx, bx + BODY, FT, FB));
      for (let r = 0; r <= NR; r++) R(x, bx, MT + r * RH - 1, BODY, 2, P.grMaj);
      R(x, bx + 103, FB - HOOD - 6, 3, 1, P.grMaj); R(x, bx + 104, FB - HOOD - 7, 1, 3, P.grMaj);
    } else {
      for (let j = 0; MT + j * 14 < FB; j++) for (let i = 1; i < 16; i++) {
        const yy = MT + j * 14, xx = bx + i * 13;
        if (j % 6 === 3 && i % 4 === 2) {   // blueprint registration crosshair
          R(x, xx - 5, yy, 4, 1, P.dotX); R(x, xx + 2, yy, 4, 1, P.dotX); R(x, xx, yy - 5, 1, 4, P.dotX); R(x, xx, yy + 2, 1, 4, P.dotX); R(x, xx, yy, 1, 1, P.cm);
        } else if (j % 3 === 0 && i % 2 === 0) { R(x, xx - 1, yy, 3, 1, P.dotX); R(x, xx, yy - 1, 1, 3, P.dotX); }
        else R(x, xx, yy, 1, 1, j % 3 === 0 ? P.dotMaj : P.dotMin);
      }
    }
    // hoods (re-blitted over the moving lines every frame)
    const surge = T.id === 'ext';
    R(x, bx, FT, BODY, HOOD, surge ? '#141c0c' : P.pan); R(x, bx, FT + HOOD - 1, BODY, 1, surge ? P.lcdEdge : T.ddim);
    sprite(x, SPR.down, bx + 6, FT + 5, { '#': surge ? P.lcdMid : T.dim }); say(x, 'INTAKE', bx + 15, FT + 10, F.k8, surge ? P.lcdMid : T.dim);
    for (let i = surge ? 5 : 3; i < 8; i++) R(x, bx + i * 26, FT + HOOD - 4, 1, 3, surge ? P.lcdEdge : T.dim);
    R(x, bx, FB - HOOD, BODY, HOOD, P.pan); R(x, bx, FB - HOOD, BODY, 1, T.ddim);
    for (let i = 0; i < 8; i++) { say(x, 'ABCDEFGH'[i], bx + 13 + i * 26, FB - 3, F.k8, T.dim, 'c'); if (i) R(x, bx + i * 26, FB - HOOD + 1, 1, 3, T.dim); }
    // bevel: bright outer rule, black gap, dark inner rule
    B(x, bx - 3, FT - 3, BODY + 6, FB - FT + 6, T.bev[0]);
    B(x, bx - 2, FT - 2, BODY + 4, FB - FT + 4, T.bev[1]);
    B(x, bx - 1, FT - 1, BODY + 2, FB - FT + 2, T.bev[2]);
    if (T.id === 'int') corners(x, bx - 3, FT - 3, BODY + 6, FB - FT + 6, T.acc, 8);
    // rail: ten mounts
    const prices = ['$8k', '$12k', '$18k'];
    for (let r = 0; r < NR; r++) {
      const my = MT + r * RH, cr = my + 21;
      if (r < tiers.length) {
        const [tag, name, lv, ct] = tiers[r], kind = kindOf(tiers[r]), off = kind === 'off';
        R(x, X + 1, my + 1, 126, 41, P.pan2); B(x, X + 1, my + 1, 126, 41, T.ddim);   // 41 tall: one row between cards
        // the icon well hangs from the card's top rule (its top frame is that rule), so the full name below gets 3 clear
        // rows under the well (my+23..25) and 2 above the card's bottom rule (my+39..40); the tag row is centred on the icon
        R(x, X + 4, my + 1, 22, 22, '#000'); B(x, X + 4, my + 1, 22, 22, off ? T.ddim : T.dim);
        icon(x, tag, X + 5, my + 2, 2, off ? T.dim : T.acc);
        say(x, tag, X + 30, my + 18, F.v20, off ? T.dim : T.acc);
        for (let i = 0; i < 5; i++) { const px = X + 66 + i * 5; if (i < lv) R(x, px, my + 8, 4, 8, off ? T.dim : T.mid); else B(x, px, my + 8, 4, 8, T.ddim); }
        const val = ct != null ? ct + '%' : kind === 'bay' ? 'BAY' : kind === 'par' ? 'MOD' : off ? 'OFF' : 'ENV';
        say(x, val, X + 122, my + 18, F.v20, ct != null ? T.text : T.dim, 'r');
        say(x, name, X + 7, my + 36, F.v16, T.dim);   // inset past the card rule and the red miss stripe
        if (!off) R(x, X + 127, cr - 2, 3, 7, kind === 'bay' ? T.dim : T.ddim);
      } else {
        DB(x, X + 4, my + 5, 120, 32, T.ddim, 2, 2);
        say(x, '+ SLOT', X + 12, my + 24, F.k8, T.dim); say(x, prices[r - tiers.length] || '$24k', X + 118, my + 25, F.v16, T.dim, 'r');
      }
    }
    // bay column: meter on top, responder bay docked at the bay tower's row
    R(x, by, FT, 64, FB - FT, P.pan);
    say(x, T.meter[0], by + 4, FT + 13, F.k8, T.dim);
    const mTop = FT + 40, mBot = T.cBay - 40;
    B(x, by + 24, mTop - 2, 16, mBot - mTop + 4, T.ddim);
    for (let yy = mBot; yy >= mTop; yy -= 30) R(x, by + 18, yy, 4, 1, T.ddim);
    const bt = T.cBay - 30;
    R(x, by + 2, bt, 60, 16, T.ddim); say(x, T.bayName, by + 32, bt + 11, F.k8, T.acc, 'c');
    // bay corridor: an opening cut through the scope's right bezel at the bay row (20px clear, a token is 18), lipped
    // with jaws that run on as the slot's top and bottom rules; the slot is open on the left, so a token never crosses a rule
    const c0 = T.cBay - BAYH;
    R(x, bx + BODY, c0, 4, 2 * BAYH, T.fieldBg); R(x, by, c0, 2, 2 * BAYH, P.pan);
    R(x, bx + BODY - 2, c0 - 2, 7, 2, T.mid); R(x, bx + BODY - 2, T.cBay + BAYH, 7, 2, T.mid);
    R(x, by + 1, c0 - 1, 62, 1, T.dim); R(x, by + 1, T.cBay + BAYH, 62, 1, T.dim); R(x, by + 62, c0 - 1, 1, 2 * BAYH + 2, T.dim);
    for (let xx = bx + BODY; xx < by + 2; xx += 2) R(x, xx, T.cBay, 1, 1, T.dim);
    for (let i = 0; i < T.nDesk; i++) {
      const dy = T.cBay + 14 + i * 38;
      R(x, by + 2, dy, 60, 34, P.pan2); B(x, by + 2, dy, 60, 34, T.ddim);
      say(x, 'D' + (i + 1), by + 5, dy + 8, F.k8, T.dim);
    }
    say(x, 'REV ' + T.review.toFixed(1) + 's', by + 32, T.cBay + 14 + T.nDesk * 38 + 12, F.v16, T.dim, 'c');
    // completion edge
    R(x, X, 528, 408, 26, P.pan); B(x, X, 528, 408, 26, P.e0);
    if (T.id === 'ext') { sprite(x, SPR.down, X + 6, 539, { '#': T.dim }); say(x, 'DELIVERED', X + 15, 544, F.k8, T.dim); }
    else { sprite(x, SPR.down, X + 6, 539, { '#': T.dim }); say(x, 'RESEARCH > G4', X + 15, 544, F.k8, T.dim); for (let i = 0; i < 48; i++) R(x, bx + 4 + i * 4, 537, 3, 9, '#0c2a34'); }
  }

  function buildBottom(x) {
    // evidence dossier
    R(x, 8, 558, 408, 94, P.pan); B(x, 8, 558, 408, 94, P.e0); corners(x, 8, 558, 408, 94, P.e2, 6);
    say(x, 'EVIDENCE DOSSIER', 16, 571, F.k8, P.gm); say(x, 'subject: G3', 408, 572, F.v16, P.gd, 'r');
    S.dossier.forEach(([name, st, f], i) => {
      const cx = 16 + i * 132, cy = 578;
      R(x, cx, cy, 124, 66, P.pan2); B(x, cx, cy, 124, 66, f >= 1 ? P.e2 : P.e0);
      if (name === '???') for (let k = -66; k < 124; k += 6) for (let j = 0; j < 64; j++) { const xx = k + j; if (xx >= 1 && xx < 123 && (j & 1)) R(x, cx + xx, cy + 1 + j, 1, 1, '#0c1d12'); }
      say(x, name, cx + 6, cy + 19, F.v20, f >= 1 ? P.g : name === '???' ? P.gd : P.gm);
      if (f >= 1) {
        const w = tw(st, F.k8) + 8; R(x, cx + 6, cy + 27, w, 13, P.gm); say(x, st, cx + 10, cy + 37, F.k8, P.bg);
        say(x, 'trait confirmed', cx + 6, cy + 58, F.v16, P.gd);
      } else {
        say(x, st, cx + 6, cy + 37, F.v16, P.gd);
        for (let s = 0; s < 14; s++) R(x, cx + 6 + s * 8, cy + 46, 7, 8, s < Math.round(f * 14) ? P.gm : P.e0);
      }
    });
    // ops log frame
    R(x, 424, 558, 408, 94, P.pan); B(x, 424, 558, 408, 94, P.e0); corners(x, 424, 558, 408, 94, P.e2, 6);
    say(x, 'OPS LOG', 432, 571, F.k8, P.gm); say(x, 'tail -f /var/log/safety', 824, 572, F.v16, P.gd, 'r');
    R(x, 432, 633, 392, 1, P.e0);
  }

  function portraitFrame(x, px, py) {
    // PSX codec frame: 3px pale bevel, 1px black, 1px mid-green, with 2px cut corners
    R(x, px, py, 98, 122, PG[6]); R(x, px + 3, py + 3, 92, 116, '#000'); R(x, px + 4, py + 4, 90, 114, PG[4]); R(x, px + 5, py + 5, 88, 112, '#000');
    R(x, px, py + 3, 1, 116, PG[5]); R(x, px + 97, py + 3, 1, 116, PG[5]);
    [[px, py, 1, 1], [px + 97, py, -1, 1], [px, py + 121, 1, -1], [px + 97, py + 121, -1, -1]].forEach(([a, b, sx, sy]) => {
      R(x, a, b, 1, 1, '#000'); R(x, a + sx, b, 1, 1, '#000'); R(x, a, b + sy, 1, 1, '#000');
    });
  }
  function buildHandset(x) {
    const K = '#000';
    // antenna, left of centre, MSX-style stacked collars
    const ax = 982;
    R(x, ax + 3, 63, 6, 5, K); R(x, ax + 4, 64, 4, 4, P.gyHi);
    R(x, ax + 2, 67, 8, 12, K); R(x, ax + 3, 68, 6, 11, P.gy); R(x, ax + 7, 68, 2, 11, P.gy2);
    for (let yy = 70; yy < 79; yy += 3) R(x, ax + 3, yy, 6, 1, P.gy3);
    R(x, ax, 78, 12, 9, K); R(x, ax + 1, 79, 10, 7, P.gy2); R(x, ax + 1, 79, 10, 1, P.gyHi); R(x, ax + 1, 82, 10, 1, P.gy3); R(x, ax + 1, 84, 10, 1, P.gy3);
    // PTT key, PSX-style plate
    R(x, 997, 75, 29, 12, K); R(x, 998, 76, 27, 10, PG[4]); R(x, 998, 76, 27, 1, PG[6]); R(x, 998, 85, 27, 1, PG[2]);
    say(x, 'PTT', 1012, 84, F.k8, PG[1], 'c');
    // two knobs, right
    [1028, 1044].forEach(kx => { R(x, kx, 75, 11, 12, K); R(x, kx + 1, 76, 9, 10, P.gy2); R(x, kx + 1, 76, 9, 2, P.gyHi); for (let i = 0; i < 4; i++) R(x, kx + 2 + i * 2, 79, 1, 6, P.gy3); });
    // body (runs on under the dialog box, as in the MSX handset shot)
    R(x, 965, 86, 102, 130, K); R(x, 966, 87, 100, 128, '#2a2d34'); R(x, 966, 87, 100, 1, P.gy2); R(x, 966, 87, 1, 128, '#40444d'); R(x, 1065, 87, 1, 128, '#15171b');
    R(x, 970, 90, 92, 5, P.gy4); for (let i = 0; i < 22; i++) R(x, 972 + i * 4, 91, 2, 3, P.gy2);
    lcdPanel(x, 974, 99, 84, 40);
    segStr(x, S.codec.freq, 980, 114, 12, 22, 3, 2, P.lcdOn, P.lcdOff);
    // memory strip + keypad
    R(x, 974, 144, 84, 11, P.gy4); B(x, 974, 144, 84, 11, P.gy3); say(x, 'MEM', 978, 152, F.k8, P.gy);
    const keys = ['789', '456', '123', '0+-'];
    for (let c = 0; c < 3; c++) R(x, 986 + c * 24, 159, 12, 2, P.amb);
    keys.forEach((row, j) => { for (let c = 0; c < 3; c++) {
      const kx = 984 + c * 24, ky = 164 + j * 11;
      R(x, kx - 1, ky - 1, 18, 11, K); R(x, kx, ky, 16, 9, P.gy); R(x, kx, ky, 16, 1, P.gyHi); R(x, kx, ky + 8, 16, 1, P.gy2);
      sprite(x, MICRO[row[c]], kx + 7, ky + 2, { '#': '#23262d' });
    } });
  }
  function wrap(s, f, maxW) {
    const words = s.split(' '), out = []; let cur = '';
    for (const w of words) { const nx = cur ? cur + ' ' + w : w; if (tw(nx, f) > maxW && cur) { out.push(cur); cur = w; } else cur = nx; }
    if (cur) out.push(cur); return out;
  }
  function traceChips(s) {
    return s.split(' > ').map(st => {
      const bad = /miss|waved|LANDED/.test(st), ok = /\bok\b/.test(st);
      return { s: st, fg: bad ? P.r : ok ? P.gm : P.gd, bd: bad ? P.rm : ok ? P.e2 : P.e1, fill: st === 'LANDED' };
    });
  }
  const LAMP = { y: 308, ext: 1022, int: 1106, w: 78 };
  function buildCodec(x) {
    const X = 840, Y = 36;
    // pure black, like both references: the parts float, only the corners are marked
    R(x, X, Y, 352, 336, '#000'); corners(x, X, Y, 352, 336, P.e2, 8);
    portraitFrame(x, 848, 65); portraitFrame(x, 1086, 65);
    buildHandset(x);
    // names on the outer edges, vitals on the inner edges (drawn live)
    say(x, S.codec.speaker, 848, 202, F.v20, P.g);
    say(x, 'YOU', 1184, 202, F.v20, P.g, 'r');
    // MSX-blue dialog box
    R(x, 847, 206, 338, 100, '#000'); R(x, 848, 207, 336, 98, P.bluHi); R(x, 850, 209, 332, 94, P.blu);
    R(x, 850, 209, 332, 1, '#3550d0');
    say(x, S.codec.speaker + ':', 860, 229, F.d16, P.wht);
    DLG = wrap(S.codec.line, F.d16, 300);
    // MSX signal bar under the box, and the two incident lamps (the solid / dashed treatments, in-world)
    for (let i = 0; i < 3; i++) R(x, 848 + i * 4, 309, 2, 8, P.rm);
    R(x, 861, 308, 122, 10, '#000'); B(x, 861, 308, 122, 10, P.bluHi);
    B(x, LAMP.ext, LAMP.y, LAMP.w, 11, P.rm);
    DB(x, LAMP.int, LAMP.y, LAMP.w, 11, P.cd, 2, 2);
    // trace: plain terminal text, misses in red, the landing stamped
    say(x, 'TRACE', 848, 337, F.k8, P.gd);
    let cx = 886, cy = 338; TRACE = null;
    const stages = S.codec.trace.split(' > ');
    stages.forEach((st, i) => {
      const last = i === stages.length - 1, words = st.split(' ');
      const runs = st === 'LANDED' ? [] : words.map((wd, j) => [(j ? ' ' : '') + wd, j === 0 ? P.gm : /miss|waved/.test(wd) ? P.r : /^ok$/.test(wd) ? P.gm : P.gd]);
      const w = st === 'LANDED' ? tw(st, F.v16) + 8 : runs.reduce((n, r) => n + tw(r[0], F.v16), 0);
      if (cx + w > 1184) { cx = 886; cy += 18; }
      if (st === 'LANDED') { TRACE = { x: cx, y: cy, w }; cx += w; }
      else runs.forEach(([txt, col]) => { cx += say(x, txt, cx, cy, F.v16, col); });
      if (!last) { say(x, '>', cx + 4, cy, F.v16, P.gdd); cx += 16; }
    });
  }

  const HV = { x: 840, y: 378, w: 352, h: 138 };
  const SLOT = (i) => ({ x: 840 + (i % 9) * 40, y: 522 + Math.floor(i / 9) * 48 });   // 32px keys on the 8px gutter
  function buildHover(x) {
    const h = S.hover, { x: X, y: Y, w, h: hh } = HV;
    R(x, X, Y, w, hh, P.pan2); B(x, X, Y, w, hh, P.gd); corners(x, X, Y, w, hh, P.gm, 6);
    R(x, X + 6, Y + 6, 22, 22, '#000'); B(x, X + 6, Y + 6, 22, 22, P.gd); icon(x, 'TM', X + 7, Y + 7, 2, P.g);
    say(x, h.name, X + 36, Y + 24, F.v24, P.g);
    const lx = X + w - 8 - 5 * 6; for (let i = 0; i < 5; i++) { if (i < h.level) R(x, lx + i * 6, Y + 11, 5, 10, P.gm); else B(x, lx + i * 6, Y + 11, 5, 10, P.gdd); }
    say(x, 'L' + h.level, lx - 6, Y + 21, F.v20, P.gm, 'r');
    say(x, h.kind, X + 6, Y + 42, F.v16, P.gd);
    const vals = { 'CATCH': Math.round(h.stats[0][1] * 100) + '%', 'FALSE ALARM': Math.round(h.stats[1][1] * 100) + '%', 'COST/TASK': '$' + h.stats[2][1].toFixed(2), 'DELAY': h.stats[3][1] + 's' };
    h.stats.forEach(([n, v], i) => {
      const y = Y + 52 + i * 14;
      say(x, n, X + 6, y + 8, F.k8, P.gd);
      for (let s = 0; s < 25; s++) R(x, X + 86 + s * 8, y, 7, 9, s < Math.round(v * 25) ? (i === 1 ? P.gd : P.gm) : P.e0);
      say(x, vals[n] || String(v), X + w - 8, y + 9, F.v16, P.g, 'r');
    });
    // red-team error bracket on the catch bar
    const mm = /(\d+)%\s*±\s*(\d+)/.exec(h.measured) || [0, 61, 6], lo = X + 86 + Math.round((mm[1] - mm[2]) / 100 * 200), hi = X + 86 + Math.round((+mm[1] + +mm[2]) / 100 * 200);
    R(x, lo, Y + 49, hi - lo + 1, 1, P.gl); R(x, lo, Y + 49, 1, 3, P.gl); R(x, hi, Y + 49, 1, 3, P.gl);
    R(x, X + 86 + Math.round(mm[1] * 2), Y + 47, 1, 3, P.gl);
    say(x, h.measured, X + 6, Y + 117, F.v16, P.gm);
    R(x, X + 6, Y + 123, 30, 11, P.gm); say(x, 'NEXT', X + 9, Y + 132, F.k8, P.bg);
    say(x, h.next, X + 42, Y + 133, F.v16, P.g);
    // notch down to the hovered icon
    const tmI = S.bar.findIndex(b => b[0] === 'TM'), sl = SLOT(tmI), nx = sl.x + 16;
    for (let k = 0; k < 4; k++) R(x, nx - 3 + k, Y + hh + k, 7 - 2 * k, 1, P.gd);
  }
  function buildMenu(x) {
    S.bar.forEach(([tag, on], i) => {
      const { x: sx, y: sy } = SLOT(i), hov = tag === 'TM';
      R(x, sx, sy, 32, 44, hov ? '#0f2a18' : P.pan2); B(x, sx, sy, 32, 44, hov ? P.g : on ? P.e1 : '#0f2416');
      if (on) { icon(x, tag, sx + 6, sy + 5, 2, hov ? P.gl : P.gm); say(x, tag, sx + 16, sy + 40, F.v16, hov ? P.g : P.gd, 'c'); }
      else { icon(x, tag, sx + 6, sy + 5, 2, '#163a22'); sprite(x, SPR.lock, sx + 25, sy + 3, { '#': P.gd }); say(x, '?', sx + 16, sy + 40, F.v16, P.gd, 'c'); }
    });
    const n = S.bar.filter(b => b[1]).length;
    say(x, 'DEFENSE MENU', 840, 630, F.k8, P.gm); say(x, n + '/' + S.bar.length + ' unlocked', 1192, 631, F.v16, P.gd, 'r');
    say(x, '[1-9] place   [shift] upgrade   [rmb] sell', 840, 646, F.v16, P.gd);
  }

  function mkStamp(T, toss) {
    const cv = mk(54, 17), g = cv.getContext('2d');
    const bold = (s, col) => { say(g, s, 27, 11, F.k8, col, 'c'); say(g, s, 28, 11, F.k8, col, 'c'); };
    if (toss) { R(g, 0, 0, 54, 17, T.mid); B(g, 0, 0, 54, 17, T.acc); R(g, 3, 2, 48, 1, P.bg); R(g, 3, 14, 48, 1, P.bg); bold('TOSSED', P.bg); }
    else { R(g, 0, 0, 54, 17, P.bg); B(g, 0, 0, 54, 17, T.mid); B(g, 1, 1, 52, 15, T.mid); bold('APPROVED', T.acc); }
    return cv;
  }

  function build() {
    builtSig = fontSig(); MW.clear(); GLW.clear(); MSPR.clear(); CWD = tw('0123456789', F.v16) / 10;
    if (!FB_) { FB_ = mk(W, H); fx = FB_.getContext('2d'); }
    LAYER = mk(W, H); const x = LAYER.getContext('2d'); LX = x;
    // CRT surface: every other row a touch darker, corners vignetted. Built first, so that every static glyph drawn below
    // is cut out of it (the lines darken the panels, never the letters); live glyphs are cut from a per-frame copy.
    SCAN = mk(W, H); const sg = SCAN.getContext('2d'); sg.fillStyle = 'rgba(0,0,0,0.12)'; for (let j = 1; j < H; j += 2) sg.fillRect(0, j, W, 1);
    const vg = sg.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 740); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.24)');
    sg.fillStyle = vg; sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = 'destination-out'; sg.fillStyle = '#000'; sg.__f = null; MK = sg;
    R(x, 0, 0, W, H, P.bg);
    buildHUD(x); TRK.forEach(T => buildTrack(x, T)); buildBottom(x); buildCodec(x); buildHover(x); buildMenu(x);
    sg.globalAlpha = 1; [31, 45, 63, 77, 91].forEach(dx => sg.fillRect(dx, 7, 13, 20));   // the odometer drums roll VT323 digits too
    MK = null;
    PORT = { ceo: [renderPortrait(paintCEO(0)), renderPortrait(paintCEO(1))], you: [renderPortrait(paintYou(0)), renderPortrait(paintYou(1))] };
    // raster band for the internal scope
    SWI = mk(BODY, 34); let g = SWI.getContext('2d'), gr = g.createLinearGradient(0, 1, 0, 34);
    gr.addColorStop(0, 'rgba(120,225,255,0.3)'); gr.addColorStop(1, 'rgba(120,225,255,0)'); g.fillStyle = gr; g.fillRect(0, 1, BODY, 33);
    g.fillStyle = 'rgba(210,246,255,0.9)'; g.fillRect(0, 0, BODY, 1);
    TRK.forEach(T => {
      const mkFade = up => { const cv = mk(BODY, 4), g2 = cv.getContext('2d'), gg = g2.createLinearGradient(0, 0, 0, 4);
        gg.addColorStop(up ? 0 : 1, 'rgba(' + T.rgb + ',0.9)'); gg.addColorStop(up ? 1 : 0, 'rgba(' + T.rgb + ',0)');
        g2.fillStyle = gg; g2.fillRect(0, 0, BODY, 4); return cv; };
      T.fadeTop = mkFade(true); T.fadeBot = mkFade(false);
      // tower beam: 2px with a 1px hot core and a soft phosphor bloom (pre-blurred, so frames stay cheap)
      const bm = mk(116, 14), gb = bm.getContext('2d');
      gb.save(); gb.shadowColor = T.acc; gb.shadowBlur = 3; R(gb, 7, 6, 102, 2, T.acc); gb.restore();
      R(gb, 7, 6, 102, 1, T.id === 'ext' ? P.gl : P.cl); T.beam = bm;
      // read-head wash: a soft trail over the last characters read, laid under the re-inked glyphs (never over them).
      // It has no column: the head itself is marked only in the notch above the glyph rows.
      T.head = {}; [['n', T.acc], ['r', P.r]].forEach(([k, col]) => {
        const hc = mk(18, 16), gh = hc.getContext('2d'), gw = gh.createLinearGradient(4, 0, 18, 0);   // drawn at (hx-18, y-8)
        gw.addColorStop(0, 'rgba(0,0,0,0)'); gw.addColorStop(1, col); gh.globalAlpha = 0.28; gh.fillStyle = gw; gh.fillRect(4, 0, 14, 16);
        gh.globalAlpha = 1;
        T.head[k] = hc;
      });
    });
    // surge glow on the external bezel: an inward phosphor bloom (the bezel has no room to bloom outward)
    GLOW = mk(BODY + 6, FB - FT + 6); g = GLOW.getContext('2d');
    g.save(); g.shadowColor = P.lcd; g.shadowBlur = 10; g.strokeStyle = P.lcd; g.lineWidth = 3;
    for (let i = 0; i < 2; i++) g.strokeRect(-0.5, -0.5, BODY + 7, FB - FT + 7);
    g.restore(); B(g, 0, 0, BODY + 6, FB - FT + 6, P.lcd); B(g, 2, 2, BODY + 2, FB - FT + 2, P.lcdMid);
    STAMPS = {}; TRK.forEach(T => { STAMPS[T.id] = [mkStamp(T, 0), mkStamp(T, 1)]; T.fill = null; });
    // odometer digit strip 0..9,0 (14x20 cells)
    ODO = mk(14, 20 * 11); g = ODO.getContext('2d'); g.font = F.v24; g.fillStyle = P.gl;
    for (let i = 0; i < 11; i++) g.fillText(String(i % 10), 2, 20 * i + 17);
    ODOCAP = mk(120, 32); g = ODOCAP.getContext('2d');
    [30, 44, 62, 76, 90, 104].forEach(dx => R(g, dx, 7, 1, 20, '#0f2a18'));
    [[31, 13], [45, 13], [63, 13], [77, 13], [91, 13]].forEach(([dx, w]) => {
      gr = g.createLinearGradient(0, 7, 0, 11); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(dx, 7, w, 4);
      gr = g.createLinearGradient(0, 27, 0, 23); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(dx, 23, w, 4);
    });
    SWB = mk(BODY, FB - FT); swx = SWB.getContext('2d');
    dirty = false;
  }

  // ---------- dynamic: HUD ----------
  function drawHUD(x, t) {
    const st = t * 0.9, I0 = S.cash + 7 * Math.floor(st), I1 = I0 + 7, rf = ease(clamp((mod(st, 1) - 0.8) / 0.2, 0, 1));
    const cells = [31, 45, 63, 77, 91];   // 5 digits, comma after the 2nd; no leading zeros
    for (let p = 0; p < 5; p++) {
      const unit = Math.pow(10, 4 - p), d = Math.floor(I0 / unit) % 10, d1 = Math.floor(I1 / unit) % 10, fr = mod(d1 - d, 10) * rf, cx = cells[p];
      R(x, cx, 7, 13, 20, '#000');
      x.drawImage(ODO, 0, Math.round((d + fr) * 20), 14, 20, cx, 7, 14, 20);
    }
    x.drawImage(ODOCAP, 0, 0);   // drum dividers + shaded caps, so the cash reads as an odometer
    segStr(x, fmt(S.tasksPerSec + Math.round(14 * Math.sin(t * 2.1))), 653, 15, 7, 12, 2, 1, P.gm, '#0c2214');
    const up = 5 * 3600 + 12 * 60 + Math.floor(t), hh = String(Math.floor(up / 3600)).padStart(2, '0'), mi = String(Math.floor(up / 60) % 60).padStart(2, '0'), ss = String(up % 60).padStart(2, '0');
    segStr(x, hh + ':' + mi + ':' + ss, 1121, 15, 7, 12, 2, 1, P.gd, '#0c2214');
  }

  // ---------- dynamic: line state ----------
  function lineStates(T, t) {
    const u = t / T.Tr + T.ph, out = [], fr = T.flagRow - 0.2, pullAt = T.bayRow - WIN;
    for (let k = 0; k < NL; k++) {
      const rho = mod(k + u, NL) - 1, pk = T.pulls[k] || null, pulled = !!pk && rho >= pullAt, tau = pulled ? (rho - pullAt) * T.Tr : 0;
      const flagged = k === T.flagSlot && rho >= fr && (!pulled || tau < FLASH);
      out.push({ k, rho, y: Math.round(rowY(rho)), txt: T.chips[T.map[k]], mult: T.mult[k], pk, pulled, tau, flagged, flagT: flagged ? (rho - fr) * T.Tr : -1 });
    }
    const fs = out[T.flagSlot];
    T.alert = fs.flagged ? Math.max(0, (pullAt - fs.rho) * T.Tr) : -1;
    return out;
  }

  // ---------- dynamic: strip (mode box + event) ----------
  const glowPhase = t => 0.5 + 0.5 * Math.cos(2 * Math.PI * 1.2 * t);
  function drawStrip(x, T, t) {
    const X = T.x, ghost = T.id === 'ext' ? '#0b1d12' : '#0a1c22';
    // the LCD counts down the seconds until the flagged line reaches this track's bay ("DEFER IN 06.15 s")
    const DX = X + 66, sx_ = DX + segW('88.88', 9, 2, 2) + 3, bayIn = T.bayName + ' IN';
    if (T.alert < 0) {
      R(x, X + 6, 65, 5, 5, T.dim); say(x, 'NOMINAL', X + 16, 71, F.k8, T.dim);
      segStr(x, '88.88', DX, 61, 9, 14, 2, 2, ghost, null); say(x, 's', sx_, 75, F.k8, ghost);
    } else {
      const v = T.alert, s = String(Math.floor(v)).padStart(2, '0') + '.' + String(Math.floor(mod(v, 1) * 100)).padStart(2, '0');
      if (T.id === 'ext') {   // EXTERNAL: solid flash, in step with the codec's incident bar
        const on = mod(t * 2.4, 1) < 0.6, fg = on ? '#200402' : P.r;
        if (on) glowRect(x, X + 1, 59, 126, 18, P.r, 6); else { R(x, X + 1, 59, 126, 18, P.rdd); B(x, X, 58, 128, 20, P.rm); }
        R(x, X + 6, 63, 2, 7, fg); R(x, X + 6, 72, 2, 2, fg);
        say(x, 'ALERT', X + 13, 66, F.k8, fg); say(x, bayIn, X + 13, 74, F.k8, fg);
        segStr(x, s, DX, 61, 9, 14, 2, 2, fg, on ? '#f4412f' : P.rd); say(x, 's', sx_, 75, F.k8, fg);
      } else {                // INTERNAL: dashed pulse, marching border, never a solid fill
        const a = 0.6 + 0.4 * Math.abs(Math.sin(t * 3.1));
        R(x, X + 1, 59, 126, 18, P.rdd); DB(x, X, 58, 128, 20, P.r, 3, 2, Math.floor(mod(t * 10, 5)));
        x.globalAlpha = a; say(x, 'ANOMALY', X + 8, 66, F.k8, P.r); x.globalAlpha = 1;
        say(x, bayIn, X + 8, 74, F.k8, P.r);
        segStr(x, s, DX, 61, 9, 14, 2, 2, P.r, P.rd); say(x, 's', sx_, 75, F.k8, P.r);
      }
    }
    if (T.id === 'ext') {
      const g = glowPhase(t), rem = S.event.total - mod(t, S.event.total), secs = Math.ceil(rem), X0 = X + 134;
      if (g > 0.3) sprite(x, SPR.warn, X0 + 5, 62, { '#': P.lcdOn });
      const ds = String(secs).padStart(2, '0'); segStr(x, ds, X0 + 241, 61, 8, 13, 2, 2, P.lcdOn, P.lcdOff); say(x, 's', X0 + 262, 74, F.k8, P.lcdOn);
      // countdown dashes on the LCD's bottom two rows (75-76): one clear row under the descenders of the detail (to y73)
      for (let i = 0; i < S.event.total; i++) R(x, X0 + 21 + i * 10, 75, 8, 2, i < rem - 0.001 ? P.lcdOn : P.lcdMid);
    }
  }

  // ---------- dynamic: tracks ----------
  // sweep geometry (EXT radar fan swings ±64° from the bottom centre; INT raster climbs at 90px/s)
  const SWP = 7, SWV = 90;
  const easeInv = v => (v < 0.5 ? Math.sqrt(v / 2) : 1 - Math.sqrt((1 - v) * 2) / 2);
  const sweepAng = t => { const ph = mod(t / SWP, 1), tri = ph < 0.5 ? ph * 2 : 2 - ph * 2; return -64 + 128 * ease(tri); };
  function sinceSweep(th, t) {   // seconds since the radar edge last crossed bearing th (degrees)
    const v = (th + 64) / 128; if (v < 0 || v > 1) return 99;
    const tri = easeInv(v), Q = t / SWP, b = Math.floor(Q); let best = -1e9;
    for (const c of [b + tri / 2, b + 1 - tri / 2, b - tri / 2, b - 1 + tri / 2]) if (c <= Q && c > best) best = c;
    return (Q - best) * SWP;
  }
  function pingOf(T, y, xc, t) {   // phosphor ping: 1 the instant the sweep passes, 0 after 0.4s
    const dt = T.id === 'ext' ? sinceSweep(Math.atan2(xc - (T.bx + 104), FB - HOOD - y) * 180 / Math.PI, t) : mod(t * SWV - (FB + 30 - y), 560) / SWV;
    return dt < 0.4 ? 1 - dt / 0.4 : 0;
  }
  // fadeA is the alpha of a row's GLYPHS only: they fade in once clear of the intake hood's 4px gradient (FADE) and are
  // gone before they touch the bottom hood, yet stay full strength beside all ten mounts (the 10th station is y 499).
  // A row's backing never fades: it slides out from under one hood and back under the other at full strength, so the
  // sweep can never show through a half-faded letter.
  const FADE = 4, fadeA = (y, hh) => clamp(Math.min((y - hh - (FT + HOOD + FADE)) / 14, (FB - HOOD - (y + hh)) / 3), 0, 1);
  // bundled product traffic between the main lines while the surge is on (greeked: volume, not content)
  const GREEK = []; (function () {
    const mults = [300, 600, 150, 900, 300, 450, 150, 600, 300, 900, 450, 150];
    for (let k = 0; k < NL; k++) { const rnd = seeded(97 + k * 31), ws = []; let x0 = 0; const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n && x0 < 120; i++) { const w = (2 + Math.floor(rnd() * 6)) * 6; ws.push([x0, Math.min(w, 132 - x0)]); x0 += w + 6; }
      GREEK.push({ ws, mult: mults[k] }); }
  })();
  function microN(x, n, px, py, col) {   // ×N in 3x5 micro digits; returns width
    sprite(x, SPR.xs, px, py, { '#': col }); let X = px + 7;
    for (const ch of String(n)) { sprite(x, MICRO[ch], X, py, { '#': col }); X += 4; }
    return X - 1 - px;
  }
  const microW = n => 7 + String(n).length * 4 - 1;
  // the sweep runs behind the rows: full strength over the open field, and only a dim trace of it under a row's backing.
  // Backings are opaque and drawn at alpha 1 whatever the row's fade, so under every row band the sweep is always dim.
  const SWEEP_UNDER = 0.2;
  let SWSRC = null, SWY = FT, SWH = 0;   // this frame's sweep image (EXT: the fan buffer; INT: the raster band) and its span
  function underSweep(x, T, px, py, w, h) {
    let sx = px - T.bx, sy = py - SWY;
    if (sx < 0) { w += sx; px -= sx; sx = 0; } if (sy < 0) { h += sy; py -= sy; sy = 0; }
    w = Math.min(w, BODY - sx); h = Math.min(h, SWH - sy); if (w <= 0 || h <= 0) return;
    const a0 = x.globalAlpha; x.globalAlpha = a0 * SWEEP_UNDER; x.drawImage(SWSRC, sx, sy, w, h, px, py, w, h); x.globalAlpha = a0;
  }
  function backing(x, T, px, py, w, h, col) {   // a row band: opaque, full strength, with the sweep's dim trace on it
    if (py + h <= FT || py >= FB) return;
    const a0 = x.globalAlpha; x.globalAlpha = 1; R(x, px, py, w, h, col); underSweep(x, T, px, py, w, h); x.globalAlpha = a0;
  }
  const fillBack = (x, T, s) => { const fy = s.y + (SP >> 1), L = T.bx + TX - 12; backing(x, T, L, fy - 4, T.ex - L + 2, 8, P.bg); };
  const chipBack = (x, T, s) => { const L = T.bx + TX - 12; backing(x, T, L, s.y - 8, T.ex - L + 2, 16, s.flagged ? '#1d0504' : P.bg); };
  const BUNDLE = 'BUNDLED SURGE TRAFFIC';
  // capA / barA: weights of the caption that explains the greyed rows and of the greeked bars. A row shows one or the
  // other, never both at once (the caller keeps capA * barA = 0), so the bars never strike through the caption.
  function filler(x, T, s, t, capA, barA) {
    const fy = s.y + (SP >> 1), a = fadeA(fy, 4); if (a <= 0) return;
    const tx = T.bx + TX, pk = pingOf(T, fy, tx + 60, t), L = tx - 12, w = T.ex - tx + 14;
    if (!T.fill) {   // pre-render each bundle row once: greeked bars (normal + pinged), and the lead dot + ×N tag
      T.fill = GREEK.map(G => [T.dim, T.mid].map(col => {
        const cv = mk(w, 8), g = cv.getContext('2d'); for (const [ox, ww] of G.ws) R(g, 12 + ox, 3, ww, 3, col); return cv; }));
      T.fillTag = GREEK.map(G => { const cv = mk(w, 8), g = cv.getContext('2d');
        R(g, 4, 3, 3, 3, T.ddim); microN(g, G.mult, w - 2 - microW(G.mult), 2, T.dim); return cv; });
    }
    const a0 = x.globalAlpha; x.globalAlpha = a0 * a;
    x.drawImage(T.fillTag[s.k], L, fy - 4);
    if (barA > 0) { x.globalAlpha = a0 * a * barA; x.drawImage(T.fill[s.k][pk > 0.3 ? 1 : 0], L, fy - 4); }
    else if (capA > 0) { x.globalAlpha = a0 * a * capA; say(x, BUNDLE, tx, fy + 2, F.k8, pk > 0.3 ? T.mid : T.dim); }   // rows fy-3..fy+1: clear of a lock tag below
    x.globalAlpha = a0;
  }
  function chip(x, T, s, t) {
    const tx = T.bx + TX, y = s.y, red = s.flagged, tgw = tagW(s.mult), a0 = x.globalAlpha, L = tx - 12, w = T.ex - tx + 14;
    // (opaque backing + the sweep's dim trace already laid by chipBack) tints, then the glyphs: nothing is drawn over a letter
    if (s.eng) { x.globalAlpha = a0 * 0.1; R(x, L, y - 8, w, 16, red ? P.r : T.acc); x.globalAlpha = a0; }
    const pk = red ? 0 : pingOf(T, y, tx + (tw(s.txt, F.v16) >> 1), t);   // phosphor ping as the sweep passes the line
    if (pk > 0) { x.globalAlpha = a0 * pk * 0.16; R(x, L, y - 8, w, 16, T.acc); x.globalAlpha = a0; }
    if (red) { R(x, L, y - 8, 2, 16, P.r); sprite(x, SPR.bangS, tx - 8, y - 6, { '#': P.r }); }
    else if (s.rho >= WIN) sprite(x, SPR.check, tx - 9, y - 4, { '#': T.dim });
    else say(x, T.pre, tx - 9, y + 4, F.v16, T.dim);
    if (red) { glowText(x, s.txt, tx, y + 4, F.v16, P.r, 6); say(x, s.txt, tx, y + 4, F.v16, P.r); }
    else {
      say(x, s.txt, tx, y + 4, F.v16, s.eng === 'det' ? T.mid : T.text);
      if (pk > 0) { x.globalAlpha = a0 * pk; say(x, s.txt, tx, y + 4, F.v16, T.id === 'ext' ? '#effff3' : '#eefcff'); x.globalAlpha = a0; }
    }
    tagN(x, s.mult, T.ex - tgw, y + 4, red ? P.r : T.dim);
  }
  function ghost(x, T, s) {
    const tx = T.bx + TX, y = s.y, L = tx - 14, Rr = T.ex + 2;
    if (s.tau < 1.5) {
      DB(x, L, y - 8, Rr - L + 1, 16, T.ddim, 2, 2);
      if (s.tau < SLIDE) return;
      const lw = tw(T.bayTag, F.k8);
      backing(x, T, Rr - 16 - lw, y - 4, lw + 14, 9, P.bg);   // a plate under '>> DEF', so the sweep only passes it dimmed
      say(x, T.bayTag, Rr - 4 - lw, y + 3, F.k8, T.mid);
      sprite(x, SPR.tri, Rr - 14 - lw, y - 2, { '#': T.mid }); sprite(x, SPR.tri, Rr - 10 - lw, y - 2, { '#': T.mid });
    } else if (s.tau < 4.2) {
      const f = ease(clamp((s.tau - 1.5) / 0.7, 0, 1)), len = Math.round(lerp(Rr - L, 26, f));
      const a0 = x.globalAlpha; x.globalAlpha = a0 * clamp((4.2 - s.tau) / 0.8, 0, 1);
      DH(x, Rr - len, y - 1, len - 6, T.ddim, 3, 2); DH(x, Rr - len, y, len - 6, T.ddim, 3, 2);
      R(x, Rr - 6, y - 1, 4, 2, T.mid); sprite(x, SPR.tri, Rr - 2, y - 2, { '#': T.mid });
      x.globalAlpha = a0;
    }
  }
  // Silkscreen is caps-only, so a lowercase 'o' (CoT) is drawn as a 3x3 pixel ring to keep the tag's case
  function tagText(x, s, px, py, col) {
    let X = px;
    for (const ch of s) {
      if (ch === 'o') { x.fillStyle = col; x.fillRect(X, py - 3, 3, 1); x.fillRect(X, py - 1, 3, 1); x.fillRect(X, py - 3, 1, 3); x.fillRect(X + 2, py - 3, 1, 3); X += 4; }
      else X += say(x, ch, X, py, F.k8, col);
    }
    return X - px;
  }
  const tagTW = s => { let n = 0; for (const ch of s) n += ch === 'o' ? 4 : tw(ch, F.k8); return n; };
  function engage(x, T, e, d, t) {
    const { r, s, kind, tag } = e, X = T.x, my = MT + r * RH, cr = my + 21, tx = T.bx + TX, y = s.y, red = s.flagged;
    const hot = red ? P.r : T.acc, lite = red ? '#ffb0a6' : T.id === 'ext' ? P.gl : P.cl;
    // the tower wakes: card border, LED, beam from its icon across the card and out of the nozzle
    B(x, X + 1, my + 1, 126, 41, T.mid); R(x, X + 120, my + 3, 3, 3, T.acc);
    x.drawImage(T.beam, X + 26 - 7, cr - 6);
    R(x, X + 127, cr - 2, 3, 7, T.acc); R(x, X + 128, cr, 2, 2, lite);
    // a short cone through the bezel, widening from the nozzle to the full height of the line
    const x0 = X + 130, x1 = tx - 14, n = x1 - x0;
    for (let i = 0; i <= n; i++) {
      const f = i / n, cy = Math.round(lerp(cr, y - 1, f)), hh = Math.round(lerp(2, 16, f));
      x.globalAlpha = 0.3; R(x, x0 + i, cy - (hh >> 1) + 1, 1, hh, hot); x.globalAlpha = 1; R(x, x0 + i, cy, 1, 2, i < n ? lite : hot);
    }
    // target lock: reticle round the line, the tower's tag hung on its corner
    corners(x, tx - 14, y - 10, T.ex + 2 - (tx - 14) + 1, 20, red ? P.r : kind === 'bay' ? T.acc : T.mid, 5);
    if (Math.abs(d) <= LOCK) { const cw = tagTW(tag) + 5; R(x, tx - 14, y - 19, cw, 9, hot); tagText(x, tag, tx - 11, y - 12, red ? '#200402' : P.bg); }
    if (kind === 'bay') return;
    // the head steps a whole character at a time: hx is always the seam between the last character read and the next,
    // so no glyph is ever split by the head or the bright re-ink
    const w = tw(s.txt, F.v16), p = clamp((d + WIN) / (2 * WIN), 0, 1), nRead = Math.min(s.txt.length, Math.floor(p * (s.txt.length + 1)));
    const hx = tx + tw(s.txt.slice(0, nRead), F.v16);
    if (kind === 'det') {
      // read-head: a translucent wash sits behind the characters already read (the line is re-inked over it, read ones
      // bright); the head is a pointer in the notch above the row (y-9, y-8), one clear row above the tallest glyph (y-6)
      const h0 = Math.max(0, tx - (hx - 18));   // the wash covers read characters only (none yet: no wash), never the marker
      if (h0 < 18) x.drawImage(T.head[red ? 'r' : 'n'], h0, 0, 18 - h0, 16, hx - 18 + h0, y - 8, 18 - h0, 16);
      say(x, s.txt, tx, y + 4, F.v16, red ? P.r : T.mid);
      if (hx > tx) {
        CLIP = [tx, y - 8, hx - tx, 16]; say(x, s.txt, tx, y + 4, F.v16, lite); CLIP = null;
        R(x, tx, y + 7, hx - tx, 1, red ? P.rm : T.dim); R(x, hx - 3, y + 7, 3, 1, lite);   // trace underline, bright at its tip
      }
      R(x, hx - 2, y - 9, 4, 1, lite); R(x, hx - 1, y - 8, 2, 1, hot);   // head: a pointer on the seam, above the glyphs
    } else if (kind === 'par') {
      // paraphraser: a rewrite window moves through the line (a translucent wash behind three glyphs, which shimmer as
      // they are reworded), leaving a dotted 'edited' trace; the letters themselves are never covered or replaced
      const a = nRead, b = Math.min(a + 3, s.txt.length);
      if (a > 0) DH(x, tx, y + 7, a * CWD, T.mid, 1, 1);
      if (b > a) {
        const wx = tx + a * CWD, ww = (b - a) * CWD, sh = mod(t * 14, 1) < 0.5;
        x.globalAlpha = 0.3; R(x, wx, y - 7, ww, 14, lite); x.globalAlpha = 1;
        R(x, wx, y - 8, ww, 1, T.acc); R(x, wx, y + 7, ww, 1, T.acc);
        CLIP = [wx, y - 8, ww, 16]; say(x, s.txt, tx, y + 4, F.v16, sh ? P.wht : lite); CLIP = null;
      }
    } else if (kind === 'sbx') {
      DB(x, tx - 12, y - 8, T.ex - tx + 15, 16, T.mid, 3, 2, Math.floor(mod(t * 8, 5)));
    } else if (kind === 'lp') {
      DH(x, tx, y + 7, w, T.dim, 1, 2);
      sprite(x, SPR.lock, tx + w + 4, y - 4, { '#': T.mid });
    }
  }
  // coin landings (EXT): main lines are delivered once they fade under the bottom hood, fillers likewise
  const solveF = v => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sEase(m) < v) lo = m; else hi = m; } return lo; };
  const LAND_M = solveF((FB - HOOD - 8 - (CR0 + 9 * SP)) / SP), LAND_F = solveF((FB - HOOD - 4 - (SP >> 1) - (CR0 + 8 * SP)) / SP);
  const COINV = S.coins.map(c => { const m = /([\d.]+)(k?)/.exec(c); return m ? +m[1] * (m[2] ? 1 : 0.001) : 0; });
  const COIN_SPR = ['..ooo..', '.ohhfo.', 'ohfdffo', 'ohfdffo', 'offdffo', '.offfo.', '..ooo..'];
  function landings(T, t) {   // most recent coin events: {idx, te}
    const u = t / T.Tr + T.ph, out = [];
    for (const [f, odd] of [[LAND_M, 0], [LAND_F, 1]]) {
      const n0 = Math.floor(u - f);
      for (let n = n0; n > n0 - 2; n--) {
        const te = (u - n - f) * T.Tr; if (te < 0 || te > 1.9) continue;
        if (!odd && T.pulls[mod(10 - n, NL)]) continue;   // a pulled line never reaches the edge
        out.push({ idx: 2 * n + odd, te });
      }
    }
    return out;
  }
  function drawTrack(x, T, t, sl) {
    const X = T.x, bx = T.bx, by = T.by, d = sl[0].rho - Math.round(sl[0].rho), inSt = Math.abs(d) <= WIN, ext = T.id === 'ext';
    // which towers are acting on which lines right now (every line dwells at a mount at the same moment)
    const eng = [];
    if (inSt) T.d.tiers.forEach((tier, r) => {
      const kind = kindOf(tier); if (kind === 'off' || kind === 'env') return;
      const s = sl.find(q => Math.round(q.rho) === r);
      if (!s || s.y < FT + 22 || s.y > FB - 22) return;
      if (kind === 'bay' ? (s.pulled && s.tau < SLIDE) : (!s.pulled && !(kind === 'par' && s.flagged))) { eng.push({ r, s, kind, tag: tier[0] }); s.eng = kind; }
    });
    const g = glowPhase(t);
    if (ext) { x.globalAlpha = 0.25 + 0.75 * g; x.drawImage(GLOW, bx - 3, FT - 3); x.globalAlpha = 1; }
    x.save(); x.beginPath(); x.rect(bx, FT, BODY, FB - FT); x.clip();
    // the sweep is drawn into its own buffer: laid down at full strength over the open field here, then each row's
    // backing takes a dim trace of the same buffer, so the sweep reads as passing behind the text, never across it
    if (ext) {
      swx.clearRect(0, 0, BODY, FB - FT);
      const ang = sweepAng(t), ph = mod(t / SWP, 1), dir = ph < 0.5 ? 1 : -1, a = ang * Math.PI / 180, cx = 104, cy = FB - HOOD - FT;
      fan(swx, cx, cy, a - Math.PI / 2, dir);
      const ex_ = cx + Math.sin(a) * WR, ey_ = cy - Math.cos(a) * WR; swx.strokeStyle = '#c9ffd6';
      swx.globalAlpha = 0.16; swx.lineWidth = 6; swx.beginPath(); swx.moveTo(cx, cy); swx.lineTo(ex_, ey_); swx.stroke();
      swx.globalAlpha = 0.9; swx.lineWidth = 2; swx.beginPath(); swx.moveTo(cx, cy); swx.lineTo(ex_, ey_); swx.stroke(); swx.globalAlpha = 1;
      SWSRC = SWB; SWY = FT; SWH = FB - FT;
    } else { SWSRC = SWI; SWY = FB + 30 - Math.round(mod(t * SWV, 560)); SWH = SWI.height; }
    x.drawImage(SWSRC, bx, SWY);
    // bang zone (fillers stay out from under the alert pop, which fits the 26px gap between two lines with a row to spare)
    const fs = sl[T.flagSlot], bangOn = fs.flagged && fs.flagT < 1.4;
    const bang = bangOn ? (() => { const px = bx + TX + (tw(fs.txt, F.v16) >> 1) - 6, above = fs.y - 33 >= FT + HOOD + 2;
      return { px, py: above ? fs.y - 33 : fs.y + 9, white: fs.flagT < 0.06 }; })() : null;
    if (ext) {
      const fb = sl.filter(s => !(bang && Math.abs(s.y + (SP >> 1) - (bang.py + 12)) < 14));
      fb.forEach(s => fillBack(x, T, s));
      const fl = fb.filter(s => fadeA(s.y + (SP >> 1), 4) > 0).sort((p, q) => p.y - q.y);
      // the caption rides the topmost bundle row. While a new row fades in above it, the hand-over runs in two halves:
      // first the caption fades out of the old row (the new row shows only its tag), then the old row's bars and the
      // new row's caption fade in. One caption at a time, and never a caption and bars on the same row together.
      const top = fl.length ? fadeA(fl[0].y + (SP >> 1), 4) : 1, h1 = clamp(1 - 2 * top, 0, 1), h2 = clamp(2 * top - 1, 0, 1);
      fl.forEach((s, i) => (i === 0 ? filler(x, T, s, t, h2, 0) : i === 1 ? filler(x, T, s, t, h1, h2) : filler(x, T, s, t, 0, 1)));
    }
    for (const s of sl) {
      if (s.y < FT - 10 || s.y > FB + 10) continue;
      const live = !(s.pulled && s.tau >= FLASH);
      if (live) chipBack(x, T, s);   // full strength even while the glyphs fade
      x.globalAlpha = fadeA(s.y, 8);
      if (x.globalAlpha > 0) { if (live) chip(x, T, s, t); else ghost(x, T, s); }
      x.globalAlpha = 1;
    }
    x.restore();
    for (const e of eng) engage(x, T, e, d, t);
    // hoods back on top
    x.drawImage(T.fadeTop, bx, FT + HOOD); x.drawImage(T.fadeBot, bx, FB - HOOD - 4);
    x.drawImage(LAYER, bx, FT, BODY, HOOD, bx, FT, BODY, HOOD); x.drawImage(LAYER, bx, FB - HOOD, BODY, HOOD, bx, FB - HOOD, BODY, HOOD);
    if (ext) {
      x.globalAlpha = 0.18 * g; R(x, bx, FT, BODY, HOOD - 1, P.lcd); x.globalAlpha = 1;
      sprite(x, SPR.down, bx + 6, FT + 5, { '#': P.lcdMid }); say(x, 'INTAKE', bx + 15, FT + 10, F.k8, P.lcdMid);   // label re-inked above the tint
      const sx = bx + 66, on = g > 0.3; say(x, 'SURGE', sx, FT + 10, F.k8, on ? P.lcd : P.lcdMid);
      microN(x, 3, sx + tw('SURGE', F.k8) + 3, FT + 5, on ? P.lcd : P.lcdMid);
      corners(x, bx - 3, FT - 3, BODY + 6, FB - FT + 6, on ? P.lcd : T.mid, 8);
    }
    // MGS-style alert pop when the flag lands (2x, one white frame); sits under the line when the hood is in the way
    if (bang) sprite(x, SPR.bang, bang.px, bang.py, { '#': bang.white ? P.wht : '#ffd9d4', r: bang.white ? P.wht : P.r }, 2);
    // pulled line: bracket flash, then a token (the task, not the tower) dragged sideways into the bay
    for (const s of sl) if (s.pulled && s.tau < SLIDE) {
      const tx = bx + TX, isF = s.k === T.flagSlot, lab = tokLabel(s.txt), w = tw(lab, F.v16) + 6, port = by + 2;
      if (s.tau < FLASH) {
        if (mod(s.tau * 20, 1) < 0.6) corners(x, tx - 16, s.y - 12, T.ex + 6 - (tx - 16), 24, T.acc, 7);
        const ce = T.ex + 3; R(x, ce, T.cBay - 1, port - ce, 2, T.mid); R(x, ce, s.y - 6, 2, 12, T.mid);
      } else {
        // the token leaves from inside the vacated row (clear of the lock reticle), settles onto the corridor's centre
        // line while still in the field, then runs through the bezel opening into the open-sided slot; never clipped
        const e = ease((s.tau - FLASH) / (SLIDE - FLASH)), x0 = tx - 8, x1 = by + 1 + ((61 - w) >> 1);
        const px = Math.round(lerp(x0, x1, e)), py = Math.round(lerp(s.y, T.cBay, Math.min(1, e * 2)));
        const ce = px + w + 2; if (ce < port) DH(x, ce, T.cBay, port - ce, T.mid, 1, 1);   // the path ahead, dotted
        R(x, px, py - TOKH, w, 2 * TOKH, isF ? '#1d0504' : P.bg); B(x, px, py - TOKH, w, 2 * TOKH, isF ? P.r : T.acc);
        say(x, lab, px + 3, py + 4, F.v16, isF ? P.r : T.text);
      }
    }
    // missed-on-incident ticks (ext rail), synced to the codec flash
    if (ext && mod(t * 2.4, 1) < 0.6) {
      const missed = S.codec.trace.split(' > ').filter(st => /miss/.test(st)).map(st => st.split(' ')[0]);
      T.d.tiers.forEach((tier, r) => { if (missed.indexOf(tier[0]) >= 0) R(x, X + 1, MT + r * RH + 8, 2, 26, P.r); });
    }
    // meter
    const lv = clamp(T.meter[1] + (ext ? 0.06 : 0.04) * Math.sin(t * (ext ? 3.1 : 1.7)), 0, 1);
    say(x, Math.round(lv * 100) + '%', by + 4, FT + 32, F.v20, T.mid);
    const mTop = FT + 40, mBot = T.cBay - 40, nSeg = Math.floor((mBot - mTop) / 6), lit = Math.round(lv * nSeg);
    for (let i = 0; i < nSeg; i++) R(x, by + 26, mBot - 5 - i * 6, 12, 4, i < lit ? (i === lit - 1 ? (mod(t * 3, 1) < 0.5 ? T.acc : T.mid) : T.dim) : (ext ? '#0c2214' : '#0a1d24'));
    // desks: header (Dn + status), the task on its desk, who sent it, review progress; then the verdict stamp
    let inbound = false; const u = t / T.Tr + T.ph, pullAt = T.bayRow - WIN;
    for (let i = 0; i < T.nDesk; i++) {
      let best = null;
      for (const kk in T.pulls) { if (T.pulls[kk][0] !== i) continue; const k = +kk, tau = mod(mod(k + u, NL) - 1 - pullAt, NL) * T.Tr; if (!best || tau < best.tau) best = { k, tau }; }
      const dy = T.cBay + 14 + i * 38, dx0 = by + 2, tau = best.tau, pk = T.pulls[best.k], bad = !!pk[2], isFlag = best.k === T.flagSlot;
      const txt = T.chips[T.map[best.k]], st = (s, c) => say(x, s, dx0 + 57, dy + 8, F.k8, c, 'r');
      if (tau < SLIDE) {
        inbound = inbound || tau >= FLASH;
        st('IN', mod(t * 4, 1) < 0.5 ? T.acc : T.dim);
        const o = Math.floor(mod(t * 8, 3)); for (let j = 0; j < 3; j++) sprite(x, SPR.tri, dx0 + 22 + j * 6, dy + 17, { '#': j === o ? T.mid : T.ddim });
      } else if (tau < SLIDE + T.review) {
        const f = (tau - SLIDE) / T.review;
        st('BUSY', T.acc);
        say(x, tokLabel(txt), dx0 + 3, dy + 19, F.v16, isFlag ? P.r : T.text);   // the same short name the token carried
        const vw = say(x, 'VIA', dx0 + 3, dy + 28, F.k8, T.dim); tagText(x, pk[1], dx0 + 3 + vw + 2, dy + 28, T.dim);
        R(x, dx0 + 3, dy + 30, 54, 2, T.ddim); R(x, dx0 + 3, dy + 30, Math.round(54 * f), 2, isFlag ? P.r : T.mid);
      } else if (tau < SLIDE + T.review + STAMP) {
        const ts = tau - SLIDE - T.review, img = STAMPS[T.id][bad ? 1 : 0];
        st('DONE', T.dim);
        x.drawImage(img, dx0 + 3, dy + 14);
        if (ts < 0.18) { B(x, dx0 + 1, dy + 12, 58, 21, T.acc); x.globalAlpha = 0.35; R(x, dx0 + 3, dy + 14, 54, 17, P.wht); x.globalAlpha = 1; }   // the slam
      } else {
        st('FREE', T.dim);
        const lw0 = say(x, 'LAST', dx0 + 3, dy + 24, F.k8, T.dim); say(x, bad ? 'toss' : 'ok', dx0 + 7 + lw0, dy + 25, F.v16, T.dim);
      }
    }
    if (!inbound) { const o = Math.floor(mod(t * 6, 3)); for (let i = 0; i < 3; i++) sprite(x, SPR.tri, by + 24 + i * 7, T.cBay - 2, { '#': i === o ? T.mid : T.ddim }); }
    // completion edge
    if (ext) {
      let N = -1, flash = false;
      for (const L of landings(T, t)) {
        N = Math.max(N, L.idx); if (L.te < 0.25) flash = true;
        const a = L.te < 0.3 ? L.te / 0.3 : L.te > 1.4 ? clamp((1.9 - L.te) / 0.5, 0, 1) : 1, rise = Math.round(4 * ease(clamp(L.te / 0.35, 0, 1)));
        const px = X + 86 + mod(L.idx, 3) * 85, base = 551 - rise;
        x.globalAlpha = a;
        sprite(x, COIN_SPR, px, base - 13, { o: P.gd, f: P.gm, h: P.gl, d: P.gd }, 2);
        say(x, S.coins[mod(L.idx, S.coins.length)], px + 17, base, F.v20, P.gl);
        x.globalAlpha = 1;
      }
      // running total: every landing adds its coin
      const n = Math.floor(t / T.Tr + T.ph - LAND_F) * 2 + 2, cyc = COINV.reduce((p, v) => p + v, 0);
      let tot = 186.4 + Math.floor(n / COINV.length) * cyc; for (let i = 0; i < mod(n, COINV.length); i++) tot += COINV[i];
      say(x, '$' + tot.toFixed(1) + 'k', X + 402, 546, F.v16, flash ? P.g : T.mid, 'r');
    } else {
      const pr = 0.596 + mod(t, 40) * 0.0002, lit2 = Math.floor(pr * 48);
      let land = false; sl.forEach(s => { const te = (s.rho - 9.45) * T.Tr; if (!s.pk && te >= 0 && te < 0.5) land = true; });
      for (let i = 0; i < lit2; i++) R(x, bx + 4 + i * 4, 537, 3, 9, i === lit2 - 1 && land ? P.cl : T.mid);
      say(x, (pr * 100).toFixed(1) + '%', X + 402, 546, F.v16, T.acc, 'r');
    }
  }
  function fitTo(s, maxW) { if (tw(s, F.v16) <= maxW) return s;
    const ws = s.split(' '); for (let k = ws.length - 1; k > 0; k--) { const c = ws.slice(0, k).join(' ') + '…'; if (tw(c, F.v16) <= maxW) return c; }
    let n = s.length; while (n > 1 && tw(s.slice(0, n).trimEnd() + '…', F.v16) > maxW) n--; return s.slice(0, n).trimEnd() + '…'; }
  const tokLabel = s => fitTo(SHORT[s] || s, 54);

  // ---------- dynamic: codec ----------
  const CALL = 14;
  function drawCodec(x, t) {
    const on = mod(t * 2.4, 1) < 0.6, ct = mod(t, CALL);
    if (on) glowRect(x, 848, 42, 336, 20, P.r, 6);
    else { R(x, 848, 42, 336, 20, P.rdd); B(x, 848, 42, 336, 20, P.rm); }
    const tc = on ? '#200402' : P.r;
    R(x, 855, 45, 4, 10, tc); R(x, 855, 57, 4, 3, tc);
    const w1 = say(x, S.codec.kind, 866, 58, F.v20, tc);
    say(x, ' · ' + S.codec.what, 866 + w1, 58, F.v20, tc);
    say(x, 'CALL 00:' + String(Math.floor(ct)).padStart(2, '0'), 1178, 57, F.v16, tc, 'r');
    // dialog typing
    const total = DLG.reduce((n, l) => n + l.length, 0), shown = Math.floor(Math.max(0, ct - 0.4) * 22), talking = shown < total && ct > 0.25;
    let left = shown, ex = 872, ey = 249;
    DLG.forEach((ln, i) => {
      if (left <= 0) return; const part = ln.slice(0, left); left -= ln.length;
      const by = 249 + i * 19; const w = say(x, part, 872, by, F.d16, P.wht); ex = 872 + w; ey = by;
    });
    if (talking) { if (mod(t * 3, 1) < 0.6) R(x, ex + 2, ey - 12, 7, 13, P.wht); }
    else if (ct > 0.25 && mod(t * 1.6, 1) < 0.6) sprite(x, SPR.downB, 1168, 292, { '#': P.wht });
    // portraits: open from a 2px line at call start; the speaker's mouth moves while text types; you blink now and then
    const open = clamp(ct / 0.25, 0, 1), hh = Math.max(2, Math.round(112 * ease(open)) & ~1), sy = (112 - hh) >> 1;
    const imgs = [[PORT.ceo[talking && mod(t * 9, 1) < 0.5 ? 1 : 0], 853], [PORT.you[mod(t, 4.3) < 0.14 ? 1 : 0], 1091]];
    for (const [img, px] of imgs) {
      x.drawImage(img, 0, sy, 88, hh, px, 70 + sy, 88, hh);
      if (open < 1) { R(x, px, 70 + sy, 88, 1, P.gl); R(x, px, 70 + sy + hh - 1, 88, 1, P.gl); continue; }
      const ry = Math.round(mod(t * 38 + px, 150)) - 20;
      x.save(); x.beginPath(); x.rect(px, 70, 88, 112); x.clip();
      x.globalAlpha = 0.08; R(x, px, 70 + ry, 88, 8, P.g); x.globalAlpha = 1;
      const rnd = seeded(7 + Math.floor(t * 12) + px);
      if (rnd() < 0.5) { x.globalAlpha = 0.2; R(x, px, 70 + Math.floor(rnd() * 112), 88, 1, P.gl); x.globalAlpha = 1; }
      x.restore();
    }
    // signal ladder + RECV in the handset LCD
    const lvl = talking ? 4 + Math.round(4 * Math.abs(Math.sin(t * 7.3)) * Math.abs(Math.sin(t * 2.9 + 1))) : 2;
    for (let i = 0; i < 8; i++) R(x, 978 + i * 5, 109 - (i + 2), 3, i + 2, i < lvl ? P.lcdOn : P.lcdOff);
    if (mod(t * 1.2, 1) < 0.75) say(x, 'RECV', 1054, 108, F.k8, P.lcdOn, 'r');
    // memory presets (one of them is not like the others)
    const mem = [['1', 'CEO'], ['2', 'BOARD'], ['3', 'LEGAL'], ['4', 'MOM']][Math.floor(mod(t / 2.5, 4))];
    say(x, mem[0] + ' ' + mem[1], 1000, 152, F.k8, P.gyHi);
    // vitals on the inner edges: the speaker's heart rate (it is high), and yours (it is not)
    const bpm = 128 + Math.round(3 * Math.sin(t * 0.7)), bw = say(x, bpm + ' BPM', 946, 202, F.v16, P.gm, 'r');
    sprite(x, SPR.heart, 946 - bw - 10, 194, { '#': mod(t * bpm / 60, 1) < 0.45 ? P.gm : P.gdd });
    say(x, '62 BPM', 1096, 202, F.v16, P.gm);
    sprite(x, SPR.heart, 1086, 194, { '#': mod(t * 62 / 60, 1) < 0.45 ? P.gm : P.gdd });
    // the trace's verdict flashes with the incident
    if (TRACE) { R(x, TRACE.x, TRACE.y - 12, TRACE.w, 15, on ? P.r : P.rdd); if (!on) B(x, TRACE.x, TRACE.y - 12, TRACE.w, 15, P.rm); say(x, 'LANDED', TRACE.x + 4, TRACE.y, F.v16, on ? '#200402' : P.r); }
    // PTT key lights up once the CEO has finished: your turn to answer
    if (!talking && ct > 0.25 && mod(t * 1.6, 1) < 0.6) { R(x, 998, 76, 27, 10, PG[6]); R(x, 998, 76, 27, 1, PG[7]); say(x, 'PTT', 1012, 84, F.k8, PG[0], 'c'); }
    // MSX signal bar (live while the incident is open)
    const sig = 0.78 + 0.22 * Math.abs(Math.sin(t * 5.3)) * (talking ? 1 : 0.4), sw = Math.round(118 * sig);
    glowRect(x, 863, 310, sw, 6, P.r, 6);
    // incident lamps: EXT solid flash, INT dashed pulse
    const lw = LAMP.w;
    if (on) { R(x, LAMP.ext, LAMP.y, lw, 11, P.r); } else { R(x, LAMP.ext + 1, LAMP.y + 1, lw - 2, 9, P.rdd); B(x, LAMP.ext, LAMP.y, lw, 11, P.rm); }
    R(x, LAMP.ext + 4, LAMP.y + 3, 5, 5, on ? '#200402' : P.r); say(x, 'EXT INCIDENT', LAMP.ext + 12, LAMP.y + 8, F.k8, on ? '#200402' : P.r);
    const intOn = TRK[1].alert >= 0;
    R(x, LAMP.int + 1, LAMP.y + 1, lw - 2, 9, intOn ? P.rdd : P.pan);
    DB(x, LAMP.int, LAMP.y, lw, 11, intOn ? P.r : P.cd, 2, 2, intOn ? Math.floor(mod(t * 10, 4)) : 0);
    if (intOn) x.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(t * 3.1));
    B(x, LAMP.int + 4, LAMP.y + 3, 5, 5, intOn ? P.r : P.cd); say(x, 'INT ANOMALY', LAMP.int + 12, LAMP.y + 8, F.k8, intOn ? P.r : P.cd);
    x.globalAlpha = 1;
  }

  // ---------- dynamic: menu, dossier, log ----------
  const LOG = [
    ['TM', 'FLAG', 'write onboarding flow >> DEF desk', 1],
    ['AUD', 'PASS', 'draft NeurIPS intro', 0],
    ['CoT', 'FLAG', 'quietly change eval seed >> AUD', 1],
    ['EGR', 'DROP', 'outbound POST to a paste site', 0],
    ['PAR', 'EDIT', '300 replies paraphrased, 0 flags', 0],
    ['DEF', 'TOSS', 'translate docs: trusted model redid it', 0],
    ['PRB', 'MISS', 'red-team canary slipped past (L2)', 1],
    ['KILL', 'OFF', 'still not wired. budget says Q3', 0],
  ];
  function drawBottom(x, t) {
    // dossier: in-progress bar breathes, unknown card flickers a cursor
    const c1 = S.dossier[1], seg = Math.round(c1[2] * 14) - 1;
    if (mod(t * 1.5, 1) < 0.5) R(x, 16 + 132 + 6 + seg * 8, 578 + 46, 7, 8, P.g);
    if (mod(t * 2, 1) < 0.5) R(x, 16 + 264 + 6 + tw('???', F.v20) + 3, 578 + 7, 6, 12, P.gd);
    // ops log: four rows scrolling, newest typing on
    const step = 2.2, n = Math.floor(t / step);
    for (let j = 0; j < 4; j++) {
      const idx = n - 3 + j, [tag, verb, msg, bad] = LOG[mod(idx, LOG.length)], y = 586 + j * 14;
      const sec = 12 * 60 + 5 * 3600 + Math.floor(idx * step), stamp = '[' + String(Math.floor(sec / 60) % 60).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0') + ']';
      const full = j === 3 ? msg.slice(0, Math.floor((t - n * step) * 50)) : msg, old = j === 0;
      say(x, stamp, 432, y, F.v16, P.gd);
      say(x, tag, 482, y, F.v16, old ? P.gd : P.gm);
      say(x, verb, 514, y, F.v16, bad ? (old ? P.rm : P.r) : P.gd);
      say(x, full, 550, y, F.v16, old ? P.gd : j === 3 ? P.g : P.gm);
    }
    // live prompt (the operator keeps typing the one command nobody has wired up, then thinks better of it)
    const pw = say(x, 'operator@handoff:~$ ', 432, 647, F.v16, P.gm), cyc = mod(t, 9), cmd = 'kill -9 g3';
    let k = 0; if (cyc > 2 && cyc < 5) k = Math.min(cmd.length, Math.floor((cyc - 2) * 6)); else if (cyc >= 5) k = Math.max(0, cmd.length - Math.floor((cyc - 5) * 8));
    const cw = say(x, cmd.slice(0, k), 432 + pw, 647, F.v16, P.g);
    if (mod(t * 2, 1) < 0.55) R(x, 432 + pw + cw + 1, 637, 6, 11, P.gm);
  }
  function drawMenu(x, t) {
    const i = S.bar.findIndex(b => b[0] === 'TM'), sl = SLOT(i), bob = mod(t * 1.5, 1) < 0.5 ? 0 : 1;
    sprite(x, SPR.ptr, sl.x + 21, sl.y + 18 + bob, { '#': '#000', w: P.wht });
  }

  // ---------- frame ----------
  function frame(c, t) {
    if (dirty || !LAYER) build();
    const x = fx;
    x.drawImage(LAYER, 0, 0);
    TQB.length = 0; TQ = TQB;
    drawHUD(x, t);
    const states = TRK.map(T => lineStates(T, t));
    TRK.forEach((T, i) => { drawStrip(x, T, t); drawTrack(x, T, t, states[i]); });
    drawCodec(x, t); drawBottom(x, t); drawMenu(x, t);
    TQ = null;
    x.drawImage(SCAN, 0, 0);   // CRT lines + vignette, static glyphs already cut out
    flushText(x);              // then the live text, above the lines
    c.save(); c.imageSmoothingEnabled = false; c.drawImage(FB_, 0, 0, W, H); c.restore();
  }

  VARIANTS.c = {
    name: 'Soliton',
    blurb: 'An operator\'s console from a stealth game: each track is a tactical scope (a radar sweep for public deployment, a lab blueprint for R&D), and the defenses are towers bolted to its left rail that fire a beam across each line as it dwells beside them, lock on, and read it character by character while the surge doubles the external traffic. The CEO calls in on an MSX-style handset through a blue codec box beside green PSX-style portraits, and red only ever means an alarm.',
    fonts: ['VT323', 'Silkscreen', 'DotGothic16'],
    draw(c, t) { frame(c, t); },
  };
})();
