// ======================================================================
//  TERRAIN  —  diggable cell grid per body (Worms / Noita style)
//  Local coords: metres from the body centre (bodies never rotate).
//  Cell values: 0 space · 1 dug (cave backwall) · 2 regolith · 3+ ores and built stone
//  Built lazily on first use: Terrain.of(body). Carvers (mochi.js) shape a body at build:
//  Terrain.addCarver(bodyId, fn(T, b)). Fixed mats (wall, slab, deck) never break.
// ======================================================================

const Terrain = (() => {

  const Wd = typeof World !== 'undefined' ? World : require('./world.js');

  const CELL = 0.5;               // cell size [m]
  const CHUNK = 24;               // cells per chunk side (12 m)
  const PXC = 6;                  // baked pixels per cell
  const BAKES_PER_FRAME = 6, CACHE_MAX = 320;   // Mochi's town alone has ~210 content chunks

  const SPACE = 0, DUG = 1, REG = 2;
  const MATS = [
    { id: 'space' },
    { id: 'dug' },
    { id: 'regolith', hard: 1.0, kg: 0 },
    { id: 'ice',      hard: 1.4, kg: 5, item: 'ice',      col: ['#c4ecff', '#6fb0d8', '#ffffff'] },
    { id: 'iron',     hard: 2.2, kg: 7, item: 'iron',     col: ['#d98a5f', '#93502f', '#ffd0a8'] },
    { id: 'nickel',   hard: 2.8, kg: 7, item: 'nickel',   col: ['#bccb94', '#77854f', '#f1fbd2'] },
    { id: 'platinum', hard: 3.6, kg: 3, item: 'platinum', col: ['#eef1ff', '#9aa2cc', '#ffffff'] },
    { id: 'wall',     hard: Infinity, kg: 0, fixed: true, col: ['#a99cc8', '#6f6496', '#d9d0f2'] },   // Murk-stone: town lining, lift gates
    { id: 'slab',     hard: Infinity, kg: 0, fixed: true, col: ['#cfc6b8', '#8f8577', '#f2ece2'] },   // pad concrete: outpost plinths
    { id: 'deck',     hard: Infinity, kg: 0, fixed: true, col: ['#ffd166', '#c9961f', '#fff3c4'] },   // lift steel: the Clunk Lift's floor
  ];
  const MAT_ID = Object.fromEntries(MATS.map((m, i) => [m.id, i]));
  const GEM_COL = { salt: ['#f4f0ff', '#a99cd6'], amber: ['#ffb347', '#b8620f'], opal: ['#ff7eb6', '#b0306e'], voidopal: ['#8f6bff', '#3b1f9e'] };
  const INK_RGB = [27, 20, 51];
  const FIXED = MATS.map((m) => !!m.fixed);

  let bakeBudget = BAKES_PER_FRAME;

  // ---------------- carvers: modules that shape a body when its grid is built ----------------

  const CARVERS = {};                                             // bodyId -> [fn(T, b)]
  function addCarver(id, fn) { (CARVERS[id] = CARVERS[id] || []).push(fn); }

  // ---------------- build ----------------

  function of(b) { return b.ter || (b.ter = build(b)); }

  function build(b) {
    if (b.star) return { b, N: 0, NC: 0, half: 0, grid: new Uint8Array(0), wear: new Uint8Array(0), gems: [], has: new Uint8Array(0),
                         dirty: new Set(), cache: new Map(), back: INK_RGB, back2: INK_RGB };   // a star has no ground: nothing to land on or dig
    const rand = Wd.rng(9973 * ((b.tidx ?? b.idx) + 1) + (b.wseed || 7) * 131);
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

    for (const fn of CARVERS[b.id] || []) fn(T, b);                // after ores and gems, so the rng layout never shifts
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
  //  returns { yield: { item: kg }, gems: [freed gems], cells, mats: { matId: count }, fixed: fixed cells hit }

  function dig(T, lx, ly, r, power) {
    const out = { yield: {}, gems: [], cells: 0, mats: {}, fixed: 0 };
    forCells(T, lx, ly, r, (k) => {
      const m = T.grid[k];
      if (m < REG) return;
      if (FIXED[m]) { out.fixed++; return; }                     // built stone: CLINK, no wear
      const M = MATS[m], w = T.wear[k] + Math.max(1, Math.round(255 * power / M.hard));
      if (w < 255) { T.wear[k] = w; return; }
      T.grid[k] = DUG; T.wear[k] = 0; out.cells++; T.touched = T.snapDirty = true;
      out.mats[M.id] = (out.mats[M.id] || 0) + 1;
      if (M.item) out.yield[M.item] = (out.yield[M.item] || 0) + M.kg;
    });
    if (out.cells) {
      touchChunks(T, lx, ly, r + CELL * 2);
      for (const gm of T.gems) if (gm.state === 'buried' && mat(T, gm.lx, gm.ly) < REG) { gm.state = 'loose'; gm.seen = true; out.gems.push(gm); }
    }
    return out;
  }

  // ---------------- save: dug cells as [start, length] runs + indexes of taken gems ----------------

  function snapshot(T) {                                            // cached until the next dig
    if (T.snap !== undefined && !T.snapDirty) return T.snap;
    T.snapDirty = false;
    return (T.snap = scan(T));
  }
  function scan(T) {
    const gems = [];
    T.gems.forEach((gm, i) => { if (gm.state !== 'buried') gems.push(i); });
    if (!T.touched && !gems.length) return null;
    const dug = [], G = T.grid, Z = T.zone;                       // carved cells (zone) are part of the build: never saved
    for (let k = 0; k < G.length; k++) {
      if (G[k] !== DUG || (Z && Z[k])) continue;
      const k0 = k; while (k + 1 < G.length && G[k + 1] === DUG && !(Z && Z[k + 1])) k++;
      dug.push(k0, k - k0 + 1);
    }
    return { dug, gems };
  }

  function restore(T, s) {
    if (!s || typeof s !== 'object') return;
    const r = Array.isArray(s.dug) ? s.dug : [], G = T.grid, N = T.N;
    for (let i = 0; i + 1 < r.length; i += 2) {
      const k0 = Math.max(0, r[i] | 0), k1 = Math.min(G.length, k0 + Math.max(0, r[i + 1] | 0));
      for (let k = k0; k < k1; k++) {
        if (G[k] < REG || FIXED[G[k]] || (T.zone && T.zone[k])) continue;   // never undo the build
        G[k] = DUG; T.wear[k] = 0;
        const c = Math.floor(Math.floor(k / N) / CHUNK) * T.NC + Math.floor((k % N) / CHUNK);
        T.dirty.add(c); T.has[c] = 1;
      }
    }
    for (const i of Array.isArray(s.gems) ? s.gems : []) if (T.gems[i]) T.gems[i].state = 'taken';
    T.touched = T.snapDirty = true;
  }

  // mark the chunks of these cell indexes for re-bake (a module rewrote them: the lift deck, its gates)
  function touchCells(T, ks) {
    for (const k of ks) {
      const c = Math.floor(Math.floor(k / T.N) / CHUNK) * T.NC + Math.floor((k % T.N) / CHUNK);
      T.dirty.add(c); T.has[c] = 1;
    }
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

  // one ImageData shared by every bake (each cache entry keeps only its canvas)
  let IMG = null;
  const WALL = MAT_ID.wall, DECK = MAT_ID.deck;

  function bake(T, cx, cy, e) {
    const S = CHUNK * PXC + 2;
    if (!e) { const cv = document.createElement('canvas'); cv.width = cv.height = S; e = { cv, c2: cv.getContext('2d') }; }
    if (!IMG || IMG.width !== S) IMG = e.c2.createImageData(S, S);
    const D = IMG.data, N = T.N, g = T.grid, back = T.back, back2 = T.back2, Z = T.zone;
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
          const zi = Z ? Z[Math.min(N - 1, Math.max(0, Math.round(v))) * N + Math.min(N - 1, Math.max(0, Math.round(u)))] : 0;
          const zn = zi ? T.zones[zi - 1] : null;
          if (zn && zn.lit) col = sol > 0.28 ? INK_RGB : sol > 0.14 ? (T.townBack2 || TOWN_WALL.back2) : townWall(T, zn, u, v);   // lamplit town backwall
          else col = sol > 0.28 ? INK_RGB : sol > 0.14 ? back2 : back;
        } else {
          const m = fu < 0.5 ? (fv < 0.5 ? a : c) : (fv < 0.5 ? b1 : d);
          const ore = (a > REG ? w0 : 0) + (b1 > REG ? w1 : 0) + (c > REG ? w2 : 0) + (d > REG ? w3 : 0);
          if (m > REG) {
            const q = (a === m ? w0 : 0) + (b1 === m ? w1 : 0) + (c === m ? w2 : 0) + (d === m ? w3 : 0), M = MATS[m].col;
            const ci = Math.round(u), cj = Math.round(v), h = hash(ci, cj), fx = u - ci, fy = v - cj;
            if (m === WALL) {                                        // Murk-stone: square blocks, some with a raised touch-dot
              const joint = Math.abs(fx) > 0.4 || Math.abs(fy) > 0.4, dot = h < 0.3 && fx * fx + fy * fy < 0.02;
              col = q < 0.75 || joint ? hexRGB(M[1]) : dot ? hexRGB(M[2]) : hexRGB(M[0]);
            } else if (m === DECK) {                                 // lift steel: hazard stripes
              col = q < 0.75 ? hexRGB(M[1]) : ((Math.floor((u + v) * 1.5) & 1) ? hexRGB(M[0]) : INK_RGB);
            } else {
              const speck = q > 0.95 && h < 0.22 && fx * fx + fy * fy < 0.04 + 0.05 * h;
              col = q >= 0.75 ? (speck ? hexRGB(M[2]) : hexRGB(M[0])) : hexRGB(M[1]);
            }
            if (FIXED[m] && org < 0.72) col = INK_RGB;              // built stone standing in space gets an ink edge
          } else if (ore >= 0.26) { col = INK_RGB; al = 220; }
          if (dug && sol < 0.72) { col = INK_RGB; al = 255; }
          else if (!col && dug && sol < 0.9) { col = INK_RGB; al = 110; }   // a soft ink rim round every crater
        }
        if (!col) continue;
        D[p] = col[0]; D[p + 1] = col[1]; D[p + 2] = col[2]; D[p + 3] = al;
      }
    }
    e.c2.putImageData(IMG, 0, 0);
    return e;
  }

  // the town backwall: stone courses round the body, staggered joints, a wood wainscot along each level floor
  function townWall(T, zn, u, v) {
    const x = -T.half + (u + 0.5) * CELL, y = -T.half + (v + 0.5) * CELL, r = Math.hypot(x, y), s = Math.atan2(y, x) * r;
    const W = T.townWall || TOWN_WALL, back = T.townBack || W.back;
    if (zn.rf && r - zn.rf < 1.1) {
      if (r - zn.rf > 0.95) return W.rail;
      return ((s / 0.7) % 1 + 1) % 1 < 0.12 ? W.plank2 : W.plank;
    }
    const row = Math.floor(r / 0.9), fr = r / 0.9 - row, fs = (((s + (row & 1) * 0.8) / 1.6) % 1 + 1) % 1;
    return fr < 0.1 || fs < 0.06 ? W.mortar : back;
  }
  const TOWN_WALL = { mortar: [80, 59, 87], plank: [118, 78, 70], plank2: [92, 60, 58], rail: [158, 110, 88], back: [94, 71, 99], back2: [122, 95, 122] };

  // ---------------- helpers ----------------

  function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const _rgb = {};
  function hexRGB(h) { return _rgb[h] || (_rgb[h] = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))); }
  function mixRGB(a, b, f) { return a.map((v, i) => Math.round(v * (1 - f) + b[i] * f)); }

  return { of, mat, solid, collideCircle, raycast, dig, snapshot, restore, draw, drawGem, frameStart, forCells, index,
           addCarver, touchCells, CARVERS, CELL, MATS, MAT_ID, GEM_COL, SPACE, DUG, REG };
})();

if (typeof module !== 'undefined') module.exports = Terrain;
