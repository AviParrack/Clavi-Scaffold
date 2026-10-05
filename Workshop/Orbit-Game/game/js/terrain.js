// ======================================================================
//  TERRAIN  —  diggable cell grid per body (Worms / Noita style)
//  Local coords: metres from the body centre (bodies never rotate).
//  Cell values: 0 space · 1 dug (cave backwall) · 2 regolith · 3+ ores
//  Built lazily on first use: Terrain.of(body).
// ======================================================================

const Terrain = (() => {

  const Wd = typeof World !== 'undefined' ? World : require('./world.js');

  const CELL = 0.5;               // cell size [m]
  const CHUNK = 24;               // cells per chunk side (12 m)
  const PXC = 6;                  // baked pixels per cell
  const BAKES_PER_FRAME = 6, CACHE_MAX = 220;

  const SPACE = 0, DUG = 1, REG = 2;
  const MATS = [
    { id: 'space' },
    { id: 'dug' },
    { id: 'regolith', hard: 1.0, kg: 0 },
    { id: 'ice',      hard: 1.4, kg: 5, item: 'ice',      col: ['#c4ecff', '#6fb0d8', '#ffffff'] },
    { id: 'iron',     hard: 2.2, kg: 7, item: 'iron',     col: ['#d98a5f', '#93502f', '#ffd0a8'] },
    { id: 'nickel',   hard: 2.8, kg: 7, item: 'nickel',   col: ['#bccb94', '#77854f', '#f1fbd2'] },
    { id: 'platinum', hard: 3.6, kg: 3, item: 'platinum', col: ['#eef1ff', '#9aa2cc', '#ffffff'] },
  ];
  const MAT_ID = Object.fromEntries(MATS.map((m, i) => [m.id, i]));
  const GEM_COL = { salt: ['#f4f0ff', '#a99cd6'], amber: ['#ffb347', '#b8620f'], opal: ['#ff7eb6', '#b0306e'], voidopal: ['#8f6bff', '#3b1f9e'] };
  const INK_RGB = [27, 20, 51];

  let bakeBudget = BAKES_PER_FRAME;

  // ---------------- build ----------------

  function of(b) { return b.ter || (b.ter = build(b)); }

  function build(b) {
    const rand = Wd.rng(9973 * (b.idx + 1) + (b.wseed || 7) * 131);
    const rMax = b.R * (1 + b.shape) + 1, rMin = b.R * (1 - b.shape) - 1;
    const N = Math.ceil(2 * rMax / CELL / CHUNK) * CHUNK, half = N * CELL / 2, NC = N / CHUNK;
    const grid = new Uint8Array(N * N), wear = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      const ly = -half + (j + 0.5) * CELL;
      for (let i = 0; i < N; i++) {
        const lx = -half + (i + 0.5) * CELL, r = Math.hypot(lx, ly);
        if (r < rMin || (r < rMax && r < Wd.surfaceR(b, Math.atan2(ly, lx)))) grid[j * N + i] = REG;
      }
    }
    const T = { b, N, NC, half, grid, wear, gems: [], has: new Uint8Array(NC * NC), dirty: new Set(), cache: new Map(),
                back: mixRGB(hexRGB(b.color[1]), INK_RGB, 0.62), back2: mixRGB(hexRGB(b.color[1]), INK_RGB, 0.42) };

    // -------- ore blobs (lumpy discs below the surface) --------
    for (const o of b.ores || []) {
      const m = MAT_ID[o.mat];
      for (let k = 0; k < o.blobs; k++) {
        const th = rand() * 2 * Math.PI, d = o.dMin + (o.dMax - o.dMin) * rand(), rr = o.rMin + (o.rMax - o.rMin) * rand();
        const ph1 = rand() * 6.28, ph2 = rand() * 6.28, lump = 0.15 + 0.2 * rand();
        const rs = Wd.surfaceR(b, th) - d;
        if (rs < rr + 1) continue;
        const cx = rs * Math.cos(th), cy = rs * Math.sin(th);
        forCells(T, cx, cy, rr * 1.4, (k2, dx, dy) => {
          const a = Math.atan2(dy, dx), lim = rr * (1 + lump * Math.sin(2 * a + ph1) + 0.1 * Math.sin(3 * a + ph2));
          if (grid[k2] === REG && dx * dx + dy * dy < lim * lim) grid[k2] = m;
        });
      }
    }

    // -------- gems (buried points, freed when their cell is dug) --------
    for (const gs of b.gems || []) for (let k = 0; k < gs.count; k++) {
      const th = rand() * 2 * Math.PI, d = gs.dMin + (gs.dMax - gs.dMin) * rand(), rs = Wd.surfaceR(b, th) - d;
      if (rs > 0.5) T.gems.push({ type: gs.type, lx: rs * Math.cos(th), ly: rs * Math.sin(th), state: 'buried', seen: false, body: b });
    }

    for (let c = 0; c < NC * NC; c++) T.has[c] = chunkHasContent(T, c % NC, Math.floor(c / NC)) ? 1 : 0;
    return T;
  }

  // call fn(index, dx, dy) for every cell whose centre lies within r of (cx, cy)
  function forCells(T, cx, cy, r, fn) {
    const N = T.N;
    const i0 = Math.max(0, Math.floor((cx - r + T.half) / CELL)), i1 = Math.min(N - 1, Math.floor((cx + r + T.half) / CELL));
    const j0 = Math.max(0, Math.floor((cy - r + T.half) / CELL)), j1 = Math.min(N - 1, Math.floor((cy + r + T.half) / CELL));
    for (let j = j0; j <= j1; j++) {
      const dy = -T.half + (j + 0.5) * CELL - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = -T.half + (i + 0.5) * CELL - cx;
        if (dx * dx + dy * dy <= r * r) fn(j * N + i, dx, dy);
      }
    }
  }

  function chunkHasContent(T, cx, cy) {
    for (let j = cy * CHUNK; j < (cy + 1) * CHUNK; j++)
      for (let i = cx * CHUNK; i < (cx + 1) * CHUNK; i++) { const m = T.grid[j * T.N + i]; if (m === DUG || m > REG) return true; }
    return false;
  }

  // ---------------- queries (local coords) ----------------

  function index(T, lx, ly) {
    const i = Math.floor((lx + T.half) / CELL), j = Math.floor((ly + T.half) / CELL);
    return i < 0 || j < 0 || i >= T.N || j >= T.N ? -1 : j * T.N + i;
  }
  function mat(T, lx, ly) { const k = index(T, lx, ly); return k < 0 ? SPACE : T.grid[k]; }
  const solid = (T, lx, ly) => mat(T, lx, ly) >= REG;

  // circle vs solid cells -> null | { nx, ny, depth }   (normal points out of the ground)
  function collideCircle(T, lx, ly, r) {
    const N = T.N, g = T.grid, rr = r + CELL * 0.5;
    const i0 = Math.max(0, Math.floor((lx - rr + T.half) / CELL)), i1 = Math.min(N - 1, Math.floor((lx + rr + T.half) / CELL));
    const j0 = Math.max(0, Math.floor((ly - rr + T.half) / CELL)), j1 = Math.min(N - 1, Math.floor((ly + rr + T.half) / CELL));
    let sx = 0, sy = 0, n = 0, dmin = Infinity;
    for (let j = j0; j <= j1; j++) {
      const cy = -T.half + (j + 0.5) * CELL - ly;
      for (let i = i0; i <= i1; i++) {
        if (g[j * N + i] < REG) continue;
        const cx = -T.half + (i + 0.5) * CELL - lx, d2 = cx * cx + cy * cy;
        if (d2 >= rr * rr) continue;
        sx += cx; sy += cy; n++;
        if (d2 < dmin) dmin = d2;
      }
    }
    if (!n) return null;
    const s = Math.hypot(sx, sy);
    let nx, ny;
    if (s < 1e-6) { const d = Math.hypot(lx, ly) || 1; nx = lx / d; ny = ly / d; } else { nx = -sx / s; ny = -sy / s; }
    return { nx, ny, depth: rr - Math.sqrt(dmin), n };
  }

  // march a ray -> null | { t, lx, ly, mat }
  function raycast(T, lx, ly, dx, dy, len) {
    const st = CELL * 0.25, n = Math.ceil(len / st);
    for (let k = 0; k <= n; k++) {
      const t = Math.min(len, k * st), m = mat(T, lx + dx * t, ly + dy * t);
      if (m >= REG) return { t, lx: lx + dx * t, ly: ly + dy * t, mat: m };
    }
    return null;
  }

  // ---------------- dig ----------------
  //  power: dig units per call (a cell with hardness h breaks after h units)
  //  returns { yield: { item: kg }, gems: [freed gems], cells, mats: { matId: count } }

  function dig(T, lx, ly, r, power) {
    const out = { yield: {}, gems: [], cells: 0, mats: {} };
    forCells(T, lx, ly, r, (k) => {
      const m = T.grid[k];
      if (m < REG) return;
      const M = MATS[m], w = T.wear[k] + Math.max(1, Math.round(255 * power / M.hard));
      if (w < 255) { T.wear[k] = w; return; }
      T.grid[k] = DUG; T.wear[k] = 0; out.cells++;
      out.mats[M.id] = (out.mats[M.id] || 0) + 1;
      if (M.item) out.yield[M.item] = (out.yield[M.item] || 0) + M.kg;
    });
    if (out.cells) {
      touchChunks(T, lx, ly, r + CELL * 2);
      for (const gm of T.gems) if (gm.state === 'buried' && mat(T, gm.lx, gm.ly) < REG) { gm.state = 'loose'; gm.seen = true; out.gems.push(gm); }
    }
    return out;
  }

  function touchChunks(T, lx, ly, r) {
    const size = CHUNK * CELL;
    const c0 = Math.max(0, Math.floor((lx - r + T.half) / size)), c1 = Math.min(T.NC - 1, Math.floor((lx + r + T.half) / size));
    const d0 = Math.max(0, Math.floor((ly - r + T.half) / size)), d1 = Math.min(T.NC - 1, Math.floor((ly + r + T.half) / size));
    for (let cy = d0; cy <= d1; cy++) for (let cx = c0; cx <= c1; cx++) { const c = cy * T.NC + cx; T.dirty.add(c); T.has[c] = 1; }
  }

  // ---------------- draw: baked chunk overlay (ore, tunnels, ink edges) + gems ----------------
  //  ctx is in world transform; view = [x0, y0, x1, y1] world bounds

  function frameStart() { bakeBudget = BAKES_PER_FRAME; }

  function draw(ctx, b, bx, by, zoom, view, t) {
    if (!b.ter || zoom < 0.9) return;
    const T = b.ter, size = CHUNK * CELL, S = CHUNK * PXC;
    const c0 = Math.max(0, Math.floor((view[0] - bx + T.half) / size)), c1 = Math.min(T.NC - 1, Math.floor((view[2] - bx + T.half) / size));
    const d0 = Math.max(0, Math.floor((view[1] - by + T.half) / size)), d1 = Math.min(T.NC - 1, Math.floor((view[3] - by + T.half) / size));
    ctx.imageSmoothingEnabled = true;
    for (let cy = d0; cy <= d1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const c = cy * T.NC + cx;
      if (!T.has[c]) continue;
      let e = T.cache.get(c);
      if ((!e || T.dirty.has(c)) && bakeBudget > 0) { e = bake(T, cx, cy, e); bakeBudget--; T.dirty.delete(c); }
      if (!e) continue;
      T.cache.delete(c); T.cache.set(c, e);                       // LRU touch
      const h = 0.5 * size / S;                                   // overlap neighbours by half a texel: no seams
      ctx.drawImage(e.cv, 0.5, 0.5, S + 1, S + 1, bx - T.half + cx * size - h, by - T.half + cy * size - h, size + 2 * h, size + 2 * h);
    }
    while (T.cache.size > CACHE_MAX) T.cache.delete(T.cache.keys().next().value);

    for (const gm of T.gems) {
      if (gm.state !== 'buried' || !gm.seen) continue;
      const x = bx + gm.lx, y = by + gm.ly;
      if (x < view[0] || x > view[2] || y < view[1] || y > view[3]) continue;
      drawGem(ctx, x, y, 0.45, gm.type, t, 1 / zoom);
    }
  }

  function drawGem(ctx, x, y, s, type, t, px) {
    const [c, d] = GEM_COL[type] || GEM_COL.salt, tw = 0.5 + 0.5 * Math.sin((t || 0) * 4 + x);
    ctx.beginPath(); ctx.moveTo(x, y + s); ctx.lineTo(x + s * 0.8, y + s * 0.2); ctx.lineTo(x + s * 0.5, y - s); ctx.lineTo(x - s * 0.5, y - s); ctx.lineTo(x - s * 0.8, y + s * 0.2); ctx.closePath();
    ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = '#1b1433'; ctx.lineWidth = Math.max(1.5 * px, s * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.8, y + s * 0.2); ctx.lineTo(x + s * 0.8, y + s * 0.2); ctx.lineTo(x, y - s); ctx.closePath(); ctx.fillStyle = d; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = tw;
    ctx.fillRect(x - s * 0.35, y + s * 0.25, s * 0.18, s * 0.18);
    ctx.fillRect(x + s * 0.55 - s * 0.05, y + s * 0.9, s * 0.1, s * 0.5); ctx.fillRect(x + s * 0.35, y + s * 1.1, s * 0.5, s * 0.1);
    ctx.globalAlpha = 1;
  }

  function bake(T, cx, cy, e) {
    const S = CHUNK * PXC + 2;
    if (!e) { const cv = document.createElement('canvas'); cv.width = cv.height = S; const c2 = cv.getContext('2d'); e = { cv, c2, img: c2.createImageData(S, S) }; }
    const D = e.img.data, N = T.N, g = T.grid, back = T.back, back2 = T.back2;
    const cell = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? 0 : g[j * N + i]);
    for (let py = 0; py < S; py++) {
      const v = cy * CHUNK + (py - 0.5) / PXC - 0.5, j0 = Math.floor(v), fv = v - j0;
      for (let px = 0; px < S; px++) {
        const u = cx * CHUNK + (px - 0.5) / PXC - 0.5, i0 = Math.floor(u), fu = u - i0;
        const a = cell(i0, j0), b1 = cell(i0 + 1, j0), c = cell(i0, j0 + 1), d = cell(i0 + 1, j0 + 1);
        const w0 = (1 - fu) * (1 - fv), w1 = fu * (1 - fv), w2 = (1 - fu) * fv, w3 = fu * fv;
        const org = (a ? w0 : 0) + (b1 ? w1 : 0) + (c ? w2 : 0) + (d ? w3 : 0);
        const p = (py * S + px) * 4;
        D[p + 3] = 0;
        if (org < 0.5) continue;
        const sol = (a >= REG ? w0 : 0) + (b1 >= REG ? w1 : 0) + (c >= REG ? w2 : 0) + (d >= REG ? w3 : 0);
        const dug = a === DUG || b1 === DUG || c === DUG || d === DUG;
        let col = null, al = 255;
        if (sol < 0.5) {
          col = sol > 0.28 ? INK_RGB : sol > 0.14 ? back2 : back;
        } else {
          const m = fu < 0.5 ? (fv < 0.5 ? a : c) : (fv < 0.5 ? b1 : d);
          const ore = (a > REG ? w0 : 0) + (b1 > REG ? w1 : 0) + (c > REG ? w2 : 0) + (d > REG ? w3 : 0);
          if (m > REG) {
            const q = (a === m ? w0 : 0) + (b1 === m ? w1 : 0) + (c === m ? w2 : 0) + (d === m ? w3 : 0), M = MATS[m].col;
            const ci = Math.round(u), cj = Math.round(v), h = hash(ci, cj);
            const fx = u - ci, fy = v - cj, speck = q > 0.95 && h < 0.22 && fx * fx + fy * fy < 0.04 + 0.05 * h;
            col = q >= 0.75 ? (speck ? hexRGB(M[2]) : hexRGB(M[0])) : hexRGB(M[1]);
          } else if (ore >= 0.26) { col = INK_RGB; al = 220; }
          if (dug && sol < 0.72) { col = INK_RGB; al = 255; }
        }
        if (!col) continue;
        D[p] = col[0]; D[p + 1] = col[1]; D[p + 2] = col[2]; D[p + 3] = al;
      }
    }
    e.c2.putImageData(e.img, 0, 0);
    return e;
  }

  // ---------------- helpers ----------------

  function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const _rgb = {};
  function hexRGB(h) { return _rgb[h] || (_rgb[h] = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))); }
  function mixRGB(a, b, f) { return a.map((v, i) => Math.round(v * (1 - f) + b[i] * f)); }

  return { of, mat, solid, collideCircle, raycast, dig, draw, drawGem, frameStart, forCells, index,
           CELL, MATS, MAT_ID, GEM_COL, SPACE, DUG, REG };
})();

if (typeof module !== 'undefined') module.exports = Terrain;
