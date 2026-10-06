// ======================================================================
//  MOCHI  —  Downtown (tunnels carved at build), the Clunk Lift, outposts on
//  Mochi and the belt, spots for NPCs, signs, map boards.
//  API: Mochi.spots(g), airAt(g, x, y), nearestAir(g, x, y), zoneAt(g, x, y), outposts(g), noon(g) 0..1, PAD_ID, padAt(b), TOWN, ST
//  Design: design/mochi.md · contract: design/V4-CONTRACT.md
// ======================================================================

const Mochi = (() => {
  const mod = { id: 'mochi' };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;

  const on = (g, id) => !!(g.mod && g.mod[id]);
  const npcs = () => (typeof Npcs !== 'undefined' && Npcs ? Npcs : null);         // new globals are undefined when filtered


  // ---------------- data: Downtown (x = metres east of the pad along radius r) ----------------

  const TH0 = Math.PI / 2, thAt = (x, r) => TH0 - x / r, xAt = (th, r) => (TH0 - th) * r;
  const F1 = 284, F2 = 266, F3 = 246, ST_H = 3.5;
  let TOP = 297.5, ROOF = 301.5;                                    // the lift's top stop and roof follow the surface (setWorld)
  const LIFT = { th: thAt(21, 297.2), w: 4.0, deck: 3.5, vmax: 3, acc: 1.5,
    stops: [{ id: 'top', name: 'Surface', r: TOP }, { id: 'f1', name: 'Main Street', r: F1 },
            { id: 'f2', name: 'Low Street', r: F2 }, { id: 'f3', name: 'The Cellar', r: F3 }] };
  const STREETS = [
    { id: 'main', name: 'Main Street', r: F1, x0: -13.5, x1: 84,   h: ST_H, air: true },
    { id: 'low',  name: 'Low Street',  r: F2, x0: -64,   x1: 38,   h: ST_H, air: true },
    { id: 'deep', name: 'Cellar Row',  r: F3, x0: -30,   x1: 17.4, h: ST_H, air: true },
  ];
  const ROOMS = [
    { id: 'pantry',   name: 'The Pantry',       r: F1, x0: -13.5, x1: 14,  h: 9,   p: 4,   air: true },
    { id: 'noodle',   name: 'The Noodle Hole',  r: F1, x0: 25,    x1: 41,  h: 6,   p: 4,   air: true },
    { id: 'dighall',  name: 'The Dig Hall',     r: F1, x0: 46,    x1: 66,  h: 7.5, p: 3,   air: true },
    { id: 'skylight', name: 'The Skylight',     r: F1, x0: 71,    x1: 84,  h: 7,   p: 2.5, air: false },
    { id: 'shrine',   name: 'The Crumb Shrine', r: F2, x0: -64,   x1: -48, h: 10,  p: 2,   air: true },
    { id: 'gallery',  name: 'Echo Gallery',     r: F2, x0: -50,   x1: 8,   h: 5.5, p: 8,   air: true },
    { id: 'nook',     name: 'The Quiet Nook',   r: F2, x0: 24,    x1: 38,  h: 5,   p: 4,   air: true },
    { id: 'cellar',   name: 'The Cellar',       r: F3, x0: -30,   x1: 12,  h: 7,   p: 3,   air: true },
    { id: 'workings', name: 'Old Workings',     r: 236, x0: -63,  x1: -50, h: 4,   p: 3,   air: false, unlined: true },   // the mine face
  ];
  const RAMPS = [
    { id: 'weststair', name: 'West Stair',   a: [-44, 297.6], b: [-13.5, F1], h: 3.5, air: true },     // an airlock at the top
    { id: 'workings0', name: 'Old Workings', a: [-30, F3],    b: [-52, 236],  h: 3.2, air: false, unlined: true },
  ];
  const SHAFTS = [
    { id: 'lift',    name: 'Clunk Lift', th: LIFT.th,         w: LIFT.w, r0: F3 - 0.5, r1: ROOF, air: true },     // gated, roofed: pumped
    { id: 'skyhole', name: 'Skylight',   th: thAt(77.5, F1), w: 3.0,    r0: F1 + 5,   r1: 302,  air: false },
  ];
  const CAVES = [
    { x: -58, r: 230.5, rx: 7, ry: 3.5 }, { x: -66, r: 226, rx: 6, ry: 3 },     // under the mine face: dig down to them { x: -55, r: 222, rx: 8, ry: 3 },
    { x: -44, r: 217, rx: 6, ry: 2.8 }, { x: -62, r: 214, rx: 5, ry: 3.2 },
  ];
  const TOWN_X = [-70, 90], TOWN_R = [205, 312];                   // Downtown's box (x, r): wake the lift, draw props
  const STAIR_MOUTH = [-40, 297.4];                                // nav target "Downtown"
  const PAD_ID = 'mochi:pad', PAD_NEAR = 60;                       // the town pad's nav target; core counts a landing within PAD_NEAR m

  // ---------------- per world: the town hangs under this seed's pad ----------------
  //  The numbers above are for seed 7 (pad radius SURF0). Another seed shifts the whole town by DR (whole cells),
  //  and the stair mouth, the lift's top stop and the skyhole meet that seed's surface.
  const SURF0 = 297.24;
  let DR = 0, WB = null, SD = (x) => 297.24 + 0 * x;
  function setWorld(b) {
    if (!b || b === WB) return;
    WB = b; DR = Math.round((World.surfaceR(b, TH0) - SURF0) / Terrain.CELL) * Terrain.CELL;
    SD = (x) => World.surfaceR(b, thAt(x, 297)) - DR;               // the surface in town coordinates
    TOP = Math.round((SD(21) + 0.2) / Terrain.CELL) * Terrain.CELL; ROOF = TOP + 4;
    LIFT.stops[0].r = TOP; SHAFTS[0].r1 = ROOF; SHAFTS[1].r1 = Math.max(302, SD(77.5) + 1.5);
    RAMPS[0].a[1] = Math.max(297.6, SD(-44) + 0.3); STAIR_MOUTH[1] = SD(-40) + 0.2;
    PLACED = null; SHAPES = null;
  }

  // ---------------- data: outposts (plinths on Mochi, slabs on belt rocks) and their shops ----------------

  const OUTPOSTS = [
    { id: 'frostbite', role: 'outpost-ice',  body: 'mochi',   th: TH0 + 0.9, w: 50, kx: -13.2, col: '#9fdcff' },
    { id: 'clank',     role: 'outpost-iron', body: 'mochi',   th: -2.94,     w: 50, kx: -13.2, col: '#ff9f43' },
    { id: 'pump9',     role: 'pump9',        body: 'mochi',   th: -1.74,     w: 50, kx: -13.2, col: '#ffd166' },
    { id: 'pitstop',   role: 'pitstop',      body: 'pretzel', th: 3.10,      w: 24, kx: -6.5,  col: '#7cf5d6' },
    { id: 'forge',     role: 'forge',        body: 'waffle',  th: 0.40,      w: 24, kx: -6.5,  col: '#ff7a1c' },
    { id: 'brinepit',  role: 'brinepit',     body: 'pickle',  th: 0.86,      w: 24, kx: -6.5,  col: '#b892ff' },
  ];
  const ST = {
    pantry:    { id: 'pantry', name: 'The Pantry', kind: 'outpost', keeper: 'Parsnip', tabs: ['sell'],
                 buy: { salt: 1.1, amber: 1.1, opal: 1.1, voidopal: 1.1, '*': 0.8 },
                 blurb: 'Gems at a dime over Hub price, everything else a bit under. No fuel down here: open flames and tunnels.' },
    dighall:   { id: 'dighall', name: 'The Dig Hall', kind: 'outpost', keeper: 'Sorrel', tabs: ['suit', 'sell'],
                 buy: { ice: 0.95, iron: 0.95, nickel: 0.95, platinum: 0.95, '*': 0.7 },
                 blurb: 'The diggers\' guild. Suits, lights, jetpacks. Guild rate for ore: a nickel under the Hub, no lift up.' },
    frostbite: { id: 'frostbite', name: 'Frostbite Flats', kind: 'outpost', keeper: 'Foreman Okra', tabs: ['services', 'sell'],
                 buy: { ice: 1.1, iron: 0.7, nickel: 0.7, platinum: 0.7, '*': 0.6 }, fuelMult: 1.1, repairMult: 1.2,
                 blurb: 'Okra\'s ice camp, 267 m west of the pad on the best ice field near town. Ice pays 1.1x, no trip to orbit.' },
    clank:     { id: 'clank', name: 'Clank Rig', kind: 'outpost', keeper: 'Bonk', tabs: ['services', 'sell'],
                 buy: { iron: 1.1, nickel: 1.1, platinum: 0.9, scrap: 1.1, ice: 0.5, '*': 0.6 }, fuelMult: 1.3, repairMult: 0.75,
                 blurb: 'Round the back of Mochi on the richest iron. Repairs at three quarters price. Bonk hits things for money now.' },
    pump9:     { id: 'pump9', name: 'Pump 9', kind: 'outpost', keeper: 'Nozzle', tabs: ['services', 'sell'],
                 buy: { ice: 1.0, '*': 0 }, fuelMult: 0.9, repairMult: 1.3,
                 blurb: 'Mochi\'s far side. We crack the richest ice on the rock into fuel and sell it cheapest. There were never pumps 1 to 8.' },
    pitstop:   { id: 'pitstop', name: 'Pretzel Pit Stop', kind: 'outpost', keeper: 'Twist', tabs: ['services', 'sell'],
                 buy: { ice: 0.9, '*': 0.6 }, fuelMult: 1.15, repairMult: 1.3,
                 blurb: 'First stop out of Mochi, 5.4 km up the lane. Fuel, a kettle, no pirates. Old Halite lives round the back. Do not laser him.' },
    forge:     { id: 'forge', name: 'Annie\'s Forge', kind: 'outpost', keeper: 'Anvil Annie', tabs: ['services', 'sell'],
                 buy: { iron: 1.15, nickel: 1.2, scrap: 1.2, '*': 0.5 }, fuelMult: 1.4, repairMult: 0.7,
                 blurb: 'Forty years a pirate, now a smith. Cheapest patch-ups in the belt. Mind your fingers, the anvil bites.' },
    brinepit:  { id: 'brinepit', name: 'The Brine Pit', kind: 'black', keeper: 'Mad Marge', tabs: ['services', 'sell', 'weapons'],
                 buy: { salt: 1.2, amber: 1.2, opal: 1.25, voidopal: 1.25, parts: 1.4, core: 1.5, scrap: 1.2, '*': 0.6 }, fuelMult: 1.6, repairMult: 1.0,
                 blurb: 'The Free Company\'s clubhouse on Pickle. No names, no receipts, no shooting: Marge charges for paint.' },
  };

  // props along each plinth top (x east of its centre, m): the shop dome and its counter, the business prop, the price sign
  const LAYOUT = {
    frostbite: { dome: -18, R: 3.8, counter: -16.2, pad: 12, sign: 'ICE 1.1×', biz: [['derrick', 17, { col: '#9fd8ff' }], ['tank', 21.5, { label: 'H₂O' }]] },
    clank:     { dome: -18, R: 3.8, counter: -16.2, pad: 12, sign: 'REPAIRS ¾ PRICE', biz: [['derrick', 17.5, { col: '#ff7a1c' }], ['anvil', 13.6, {}], ['scrap', 21.8, {}]] },
    pump9:     { dome: -18, R: 3.8, counter: -16.2, pad: 12, sign: 'CHEAPEST FUEL IN THE BELT*',
                 biz: [['tank', 14.4, { label: 'CH₄', w: 2.6 }], ['tank', 18, { label: 'O₂', w: 2.6, cols: ['#ff9ec7', '#c25f8a', '#ffe0ee'] }], ['tank', 21.6, { label: '9', w: 2.6, cols: ['#ffd166', '#c9961f', '#fff3c4'] }]] },
    pitstop:   { dome: -9.5, R: 2.4, counter: -8.1, pad: 8.5, sign: 'FUEL · TEA', kettle: true, biz: [['tank', 10.2, { label: 'FUEL', w: 2.2, th: 1.6, lh: 2.2, cols: ['#ff9f43', '#c25f1c', '#ffd8a6'] }]] },
    forge:     { dome: -9.5, R: 2.4, counter: -8.1, pad: 8.5, sign: 'PATCH-UPS', biz: [['forge', 9.6, {}]] },
    brinepit:  { dome: -9.5, R: 2.4, counter: -8.1, pad: 8.5, sign: 'BRINE', neon: true, biz: [['shack', 9.6, {}]] },
  };

  // ---------------- data: spots where NPCs stand ----------------

  const SPOTS = [ // [id, name, x, r, w, air]  (x east of the pad along r)
    ['pad', 'Mochi launch pad', -15, 'S', 6, false], ['guide', 'West Stair head', -50, 'S', 4, false],
    ['market', 'The Pantry', 0, F1, 20, true], ['lift', 'Clunk Lift', 15.5, F1, 3, true],
    ['canteen', 'The Noodle Hole', 33, F1, 12, true], ['guild', 'The Dig Hall', 56, F1, 16, true],
    ['skylight', 'The Skylight', 76, F1, 8, false], ['shrine', 'The Crumb Shrine', -56, F2, 10, true],
    ['gallery', 'Echo Gallery', -25, F2, 40, true], ['archive', 'The Quiet Nook', 31, F2, 10, true],
    ['cellar', 'The Cellar', -9, F3, 30, true], ['workings', 'Old Workings', -57, 236, 6, false],
  ];


  // ======================================================================
  //  CARVE  (runs once inside Terrain's build; no random numbers, so the town is the same on every load)
  // ======================================================================

  const dth = (a, c) => Math.atan2(Math.sin(a - c), Math.cos(a - c));

  function carveTown(T, b) {
    setWorld(b);
    const t0 = Date.now(), CELL = Terrain.CELL, N = T.N, G = T.grid, { REG, DUG } = Terrain;
    const zone = T.zone = new Uint8Array(N * N), ZONES = T.zones = [];
    const st = { carved: 0, lined: 0, kinds: {} };
    const addZone = (o, kind, rf) => { ZONES.push({ id: o.id, name: o.name, kind, air: !!o.air, lit: !o.unlined, rf }); return ZONES.length; };
    function region(th0, th1, r0, r1, test, z) {                   // cells in a polar box (no angle wrap near the pad)
      const xs = [], ys = [];
      for (const th of [th0, (th0 + th1) / 2, th1]) for (const r of [r0 + DR, r1 + DR]) { xs.push(r * Math.cos(th)); ys.push(r * Math.sin(th)); }
      const i0 = Math.max(0, Math.floor((Math.min(...xs) - 1 + T.half) / CELL)), i1 = Math.min(N - 1, Math.floor((Math.max(...xs) + 1 + T.half) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(...ys) - 1 + T.half) / CELL)), j1 = Math.min(N - 1, Math.floor((Math.max(...ys) + 1 + T.half) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -T.half + (i + 0.5) * CELL, y = -T.half + (j + 0.5) * CELL, k = j * N + i;
        if (!test(Math.hypot(x, y) - DR, Math.atan2(y, x))) continue;
        if (G[k] >= REG) { st.carved++; st.kinds[ZONES[z - 1].kind] = (st.kinds[ZONES[z - 1].kind] || 0) + 1; }
        if (G[k] >= REG || G[k] === DUG) { G[k] = DUG; zone[k] = z; }
      }
    }
    for (const s of STREETS) {
      const z = addZone(s, 'street', s.r), ta = thAt(s.x0, s.r), tb = thAt(s.x1, s.r), hi = Math.max(ta, tb), lo = Math.min(ta, tb);
      region(hi, lo, s.r, s.r + s.h, (r, th) => th <= hi && th >= lo && r >= s.r && r <= s.r + s.h, z);
    }
    for (const q of ROOMS) {
      const z = addZone(q, 'room', q.r), ta = thAt(q.x0, q.r), tb = thAt(q.x1, q.r), tc = (ta + tb) / 2, hw = Math.abs(ta - tb) / 2;
      region(ta, tb, q.r, q.r + q.h, (r, th) => {
        const u = Math.abs(dth(th, tc)) / hw; if (u > 1 || r < q.r) return false;
        return r - q.r <= q.h * Math.pow(1 - Math.pow(u, q.p), 1 / q.p);
      }, z);
    }
    for (const q of RAMPS) {
      const z = addZone(q, 'ramp', 0), ta = thAt(q.a[0], q.a[1]), tb = thAt(q.b[0], q.b[1]);
      region(ta, tb, Math.min(q.a[1], q.b[1]), Math.max(q.a[1], q.b[1]) + q.h, (r, th) => {
        const s = (th - ta) / (tb - ta); if (s < 0 || s > 1) return false;
        const rf = q.a[1] + s * (q.b[1] - q.a[1]); return r >= rf && r <= rf + q.h;
      }, z);
    }
    for (const q of SHAFTS) {
      const z = addZone(q, 'shaft', 0);
      region(q.th + q.w / q.r0, q.th - q.w / q.r0, q.r0, q.r1, (r, th) => Math.abs(dth(th, q.th)) * r <= q.w / 2 && r >= q.r0 && r <= q.r1, z);
    }
    for (const c of CAVES) {
      const z = addZone({ id: 'workings', name: 'Old Workings', unlined: true }, 'cave', 0), tc = thAt(c.x, c.r);
      region(tc + c.rx / c.r, tc - c.rx / c.r, c.r - c.ry, c.r + c.ry, (r, th) => {
        const u = dth(th, tc) * c.r / c.rx, v = (r - c.r) / c.ry, wob = 1 + 0.18 * Math.sin(5 * Math.atan2(v, u) + c.x);
        return u * u + v * v <= wob * wob;
      }, z);
    }
    // -------- lining: solid cells within 2 cells of a lined zone become Murk-stone --------
    const FIX = Terrain.MATS.map((m) => !!m.fixed), WALL = Terrain.MAT_ID.wall;
    for (let k = 0; k < G.length; k++) {
      const z = zone[k]; if (!z || !ZONES[z - 1].lit) continue;
      const i = k % N, j = (k - i) / N;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        if (di * di + dj * dj > 5) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const kk = jj * N + ii; if (G[kk] >= REG && !FIX[G[kk]]) { G[kk] = WALL; st.lined++; }
      }
    }
    // -------- lift-house roof, the pad's ice seam (contract §9 #4: no slab under the pad) --------
    liftCells(T, ROOF, ROOF + 0.5, (o) => o <= LIFT.w / 2 + 0.5).forEach((k) => { G[k] = WALL; });
    st.seam = seam(T, b, TH0, 16, 0.5, 2.5, Terrain.MAT_ID.ice);
    T.gems = T.gems.filter((gm) => { const k = Terrain.index(T, gm.lx, gm.ly); return k >= 0 && !zone[k] && !FIX[G[k]]; });
    T.townBack = [94, 71, 99]; T.townBack2 = [122, 95, 122];
    T.townWall = { mortar: [80, 59, 87], plank: [118, 78, 70], plank2: [92, 60, 58], rail: [158, 110, 88] };
    st.zones = ZONES.length; st.ms = Date.now() - t0;
    T.carve = st;                                                  // ready() logs it (no g in here)
  }

  // regolith cells within w/2 of angle th and d0..d1 under the surface become `mat` (shape unchanged): the first-dig seam
  function seam(T, b, th, w, d0, d1, mat) {
    const rs = World.surfaceR(b, th); let n = 0;
    Terrain.forCells(T, (rs - d1 / 2) * Math.cos(th), (rs - d1 / 2) * Math.sin(th), w / 2 + d1, (k) => {
      const [r, off] = polarOff(T, k, th), rr = World.surfaceR(b, th - off / rs);
      if (Math.abs(off) <= w / 2 && r < rr - d0 && r > rr - d1 && T.grid[k] === Terrain.REG) { T.grid[k] = mat; n++; }
    });
    return n;
  }
  function polarOff(T, k, th) {                                    // -> [r, arc offset from angle th (+ = clockwise/east)]
    const i = k % T.N, j = (k - i) / T.N, x = -T.half + (i + 0.5) * Terrain.CELL, y = -T.half + (j + 0.5) * Terrain.CELL;
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    return [r, -dth(a, th) * r];
  }


  // ======================================================================
  //  PLINTH: a dead-flat landing top at radius rp, `slab` down to 2 m under the lowest ground
  // ======================================================================

  function plinthTop(b, th, w) {                                   // pure: spots() needs no grid
    const hw = w / 2, rs = World.surfaceR(b, th); let top = 0, low = 1e9;
    for (let s = -hw; s <= hw; s += 0.25) { const r = World.surfaceR(b, th - s / rs); top = Math.max(top, r); low = Math.min(low, r); }
    return { rp: Math.ceil((top + 0.25) / Terrain.CELL) * Terrain.CELL, top, low };
  }
  function plinth(T, b, o) {
    const hw = o.w / 2, { rp, low } = plinthTop(b, o.th, o.w), SLAB = Terrain.MAT_ID.slab; let n = 0;
    Terrain.forCells(T, rp * Math.cos(o.th), rp * Math.sin(o.th), hw + rp - low + 3, (k) => {
      const [r, off] = polarOff(T, k, o.th); if (Math.abs(off) > hw) return;
      if (r < rp && r > low - 2) { T.grid[k] = SLAB; n++; } else if (r >= rp && T.grid[k] >= Terrain.REG) T.grid[k] = Terrain.DUG;
    });
    T.gems = T.gems.filter((gm) => { const k = Terrain.index(T, gm.lx, gm.ly); return k >= 0 && T.grid[k] !== SLAB; });
    (T.plinths = T.plinths || {})[o.id] = { rp, cells: n, depth: rp - low + 2 };
  }


  // ======================================================================
  //  THE CLUNK LIFT: a 1-cell deck of `deck` cells rewritten every 0.5 m; gates close the shaft where the car is not
  // ======================================================================

  function liftCells(T, r0, r1, test) {                            // cells of the shaft column with r0 <= r < r1 and test(|off|)
    const out = [], th = LIFT.th, rm = (r0 + r1) / 2;
    Terrain.forCells(T, (rm + DR) * Math.cos(th), (rm + DR) * Math.sin(th), (r1 - r0) / 2 + LIFT.w, (k) => {
      const [rw, off] = polarOff(T, k, th), r = rw - DR; if (r >= r0 && r < r1 && test(Math.abs(off))) out.push(k);
    });
    return out;
  }
  const freshLift = () => ({ r: TOP, target: TOP, v: 0, q: null, cells: [], gates: {}, orig: new Map(), idle: 0, ka: 0, sleep: false, dep: TOP, rider: null });
  const stopOf = (r) => LIFT.stops.find((s) => Math.abs(s.r - r) < 0.01) || null;

  function placeDeck(T, L, rTop) {
    const q = Math.round(rTop / Terrain.CELL) * Terrain.CELL; if (L.q === q) return false;
    for (const k of L.cells) T.grid[k] = T.zone[k] ? Terrain.DUG : Terrain.SPACE;   // above the surface the shaft is open sky
    const old = L.cells;
    L.cells = liftCells(T, q - Terrain.CELL, q, (o) => o <= LIFT.deck / 2);
    for (const k of L.cells) T.grid[k] = Terrain.MAT_ID.deck;
    L.q = q; Terrain.touchCells(T, old.concat(L.cells)); return true;
  }
  function setGate(T, L, f, closed) {
    if (L.gates[f] === closed) return; L.gates[f] = closed;
    const [r0, r1] = f === TOP ? [TOP - 1, ROOF] : [f, f + ST_H];
    const ks = liftCells(T, r0, r1, (o) => o > LIFT.w / 2 && o <= LIFT.w / 2 + 0.5);
    for (const k of ks) {
      if (closed) { if (!L.orig.has(k)) L.orig.set(k, T.grid[k]); T.grid[k] = Terrain.MAT_ID.wall; }
      else T.grid[k] = L.orig.get(k) ?? T.grid[k];
    }
    Terrain.touchCells(T, ks);
  }
  function stepLift(g, L, dt) {
    const b = g.w.byId.mochi, T = b && b.ter; if (!T || !T.zone) return;
    if (L.q === null) { placeDeck(T, L, L.r); for (const s of LIFT.stops) setGate(T, L, s.r, s.r !== L.r); }
    if (L.sleep && L.v === 0 && L.r === L.target) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;  // big steps (never while you are out) still stop on the floor
    for (let i = 0; i < n; i++) {
      const d = L.target - L.r, want = Math.sign(d) * Math.min(LIFT.vmax, Math.sqrt(2 * LIFT.acc * Math.abs(d)));
      L.v += Math.max(-LIFT.acc * h, Math.min(LIFT.acc * h, want - L.v));
      if (Math.abs(d) < 0.01 && Math.abs(L.v) < 0.05 || Math.abs(d) < Math.abs(L.v * h)) {
        if (L.v) L.arrived = true;
        L.v = 0; L.r = L.target;
      } else L.r += L.v * h;
    }
    placeDeck(T, L, L.r);
    for (const s of LIFT.stops) setGate(T, L, s.r, !(L.v === 0 && Math.abs(L.r - s.r) < 0.01));
  }


  // ======================================================================
  //  QUERIES: where things are in Downtown
  // ======================================================================

  const M = (g) => g.mod.mochi;
  function mochiLocal(g, x, y) {                                   // world -> [lx, ly, r, x east of the pad] on Mochi
    const b = g.w.byId.mochi; setWorld(b);
    const [bx, by] = World.bodyState(g.w, b, g.t), lx = x - bx, ly = y - by, r = Math.hypot(lx, ly) - DR;
    return [lx, ly, r, xAt(Math.atan2(ly, lx), r)];
  }
  function zoneAt(g, x, y) {
    const b = g.w.byId.mochi, T = b && b.ter; if (!T || !T.zone) return null;
    const [lx, ly] = mochiLocal(g, x, y), k = Terrain.index(T, lx, ly);
    return k >= 0 && T.zone[k] ? T.zones[T.zone[k] - 1] : null;
  }
  const airAt = (g, x, y) => { const z = zoneAt(g, x, y); return !!(z && z.air); };

  // the nearest breathable place on Mochi -> { name, x, y, d } (world, straight line), or null.
  // Outside the tunnels only the two ways in count; inside, any hall with air (sampled every 2 m).
  const DOORS = [['the West Stair', -38, 295.7], ['the Clunk Lift', 21, 'lift']];
  function airPoints(T) {
    if (T.airPts) return T.airPts;
    const pts = T.airPts = [], S = 4;
    for (let j = 0; j < T.N; j += S) for (let i = 0; i < T.N; i += S) {
      const z = T.zone[j * T.N + i]; if (!z || !T.zones[z - 1].air) continue;
      pts.push([-T.half + (i + 0.5) * Terrain.CELL, -T.half + (j + 0.5) * Terrain.CELL, T.zones[z - 1].name]);
    }
    return pts;
  }
  function nearestAir(g, x, y) {
    const b = g.w.byId.mochi, T = b && b.ter; if (!T || !T.zone) return null;
    const [lx, ly, r, xe] = mochiLocal(g, x, y), [bx, by] = World.bodyState(g.w, b, g.t);
    const pts = DOORS.map(([name, dx, dr]) => { const [px, py] = floorAt(dx, dr === 'lift' ? TOP - 2 : dr); return [px, py, name]; });
    if (zoneAt(g, x, y) || r < SD(xe) - 2) pts.push(...airPoints(T));
    let best = null;
    for (const [px, py, name] of pts) { const d = Math.hypot(px - lx, py - ly); if (!best || d < best.d) best = { name, x: bx + px, y: by + py, d }; }
    return best;
  }
  const inTown = (x, r) => x > TOWN_X[0] && x < TOWN_X[1] && r > TOWN_R[0] && r < TOWN_R[1];

  // [lx, ly, ux, uy] of a floor point x east of the pad on radius r (body-local)
  function floorAt(x, r) { const th = thAt(x, r), R = r + DR; return [R * Math.cos(th), R * Math.sin(th), Math.cos(th), Math.sin(th)]; }
  const padAt = (b) => [0, World.surfaceR(b, TH0) + 1.2];         // the top of the pad's deck (body-local; render.drawPad)

  const astroOut = (g) => g.mode === 'eva' && g.astro && g.astro.on, STAND = 0.75;   // STAND: eva's torso centre above the feet
  function astroAt(g) {                                            // the astronaut's feet in town coords, or null
    if (!astroOut(g) || !g.w.byId.mochi) return null;
    const A = g.astro, [, , r, x] = mochiLocal(g, A.x, A.y), feet = r - STAND;
    return { x, r, feet, z: zoneAt(g, A.x, A.y), grounded: !!(g.mod.eva && g.mod.eva.grounded) };
  }
  function onDeck(g) {
    const a = astroAt(g), L = M(g).lift; if (!a || !a.grounded || L.q === null) return false;
    return Math.abs(xAt(LIFT.th, a.r) - a.x) <= LIFT.deck / 2 && Math.abs(a.feet - L.q) < 1;
  }
  function landingNear(g, d = 5) {                                 // the lift stop whose landing you stand by (not on the deck)
    const a = astroAt(g); if (!a) return null;
    const off = Math.abs(a.x - xAt(LIFT.th, a.r));
    return LIFT.stops.find((s) => Math.abs(a.feet - s.r) < 1.2 && off < LIFT.w / 2 + d) || null;
  }


  // ======================================================================
  //  SPOTS AND OUTPOSTS (contract §5.2: 18 ids)
  // ======================================================================

  function spots(g) {
    setWorld(g.w.byId.mochi);
    const out = SPOTS.map(([id, name, x, r, w, air]) => { const [lx, ly, ux, uy] = floorAt(x, r === 'S' ? SD(x) : r);
      return { id, name, body: 'mochi', lx, ly, ux, uy, w, air }; });
    for (const o of OUTPOSTS) {
      const b = g.w.byId[o.body]; if (!b) continue;
      const rp = plinthTop(b, o.th, o.w).rp, th = o.th - o.kx / rp;
      out.push({ id: o.role, name: ST[o.id].name, body: o.body, lx: rp * Math.cos(th), ly: rp * Math.sin(th), ux: Math.cos(th), uy: Math.sin(th), w: 1.8, air: false });
    }
    return out;
  }
  function outposts(g) {
    return OUTPOSTS.filter((o) => g.w.byId[o.body]).map((o) => {
      const rp = plinthTop(g.w.byId[o.body], o.th, o.w).rp;
      return { id: o.id, name: ST[o.id].name, body: o.body, lx: rp * Math.cos(o.th), ly: rp * Math.sin(o.th), col: o.col };
    });
  }

  // ======================================================================
  //  STATE, SAVE, LOGS
  // ======================================================================

  const SEEN_IDS = new Set([...STREETS, ...ROOMS, ...RAMPS].map((z) => z.id).concat(['workings']));

  function init(g) { setWorld(g.w.byId.mochi); g.mod.mochi = { lift: freshLift(), map: false, seen: {}, zone: null, logged: false, call: null, plaque: -9 }; }
  function load(g, d) {
    if (!d || typeof d !== 'object' || !d.seen || typeof d.seen !== 'object') return;
    for (const k of Object.keys(d.seen)) if (SEEN_IDS.has(k)) M(g).seen[k] = 1;
  }
  const save = (g) => ({ seen: M(g).seen });

  function ready(g) {
    const sp = spots(g), belt = sp.filter((s) => s.body !== 'mochi').length, out = OUTPOSTS.filter((o) => o.body === 'mochi').length;
    Game.log(g, `mochi spots: ${sp.length} (${sp.length - belt - out} mochi, ${out} outposts, ${belt} belt)`);
    logCarve(g);
  }
  function logCarve(g) {
    const m = M(g), b = g.w.byId.mochi, T = b && b.ter;
    if (m.logged || !T || !T.carve) return;
    m.logged = true;
    const c = T.carve; let n = 0; for (let i = 0; i < T.has.length; i++) n += T.has[i];
    Game.log(g, `mochi carve: ${c.carved} dug (${(c.carved * 0.25).toFixed(0)} m2), ${c.lined} lined, ${c.zones} zones, ice seam ${c.seam}, ${n} content chunks, ${c.ms} ms`);
    for (const [id, p] of Object.entries(T.plinths || {})) Game.log(g, `mochi plinth ${id} rp ${p.rp} cells ${p.cells}`);
  }


  // ======================================================================
  //  PER STEP / PER FRAME: the lift, auto-call, zones you walk into
  // ======================================================================

  const step = (g, dt) => { setWorld(g.w.byId.mochi); const L = M(g).lift; stepLift(g, L, dt); carry(g, L); };

  // ---------------- riding: whoever starts a ride on the deck stays on it ----------------
  //  The deck is re-cut from square cells every 0.5 m and its stair-step top used to shuffle riders off the edge.
  //  So a rider is carried: feet on the deck, held where they stood (inside the foot's reach of the rim), no walking.
  const RIDE_OFF = LIFT.deck / 2 - 0.45;
  function board(g, L) {
    if (L.rider && L.v) return;                                    // a new floor mid-ride: hold on
    const a = onDeck(g) && astroAt(g);
    L.rider = a ? { off: Math.max(-RIDE_OFF, Math.min(RIDE_OFF, a.x - xAt(LIFT.th, a.r))) } : null;
  }
  function carry(g, L) {
    if (!L.rider) return;
    if (!astroOut(g) || L.q === null) { L.rider = null; return; }
    const b = g.w.byId.mochi, [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t), r = L.q + 0.02 + STAND, th = LIFT.th - L.rider.off / r;
    Object.assign(g.astro, { x: bx + (r + DR) * Math.cos(th), y: by + (r + DR) * Math.sin(th), vx: bvx, vy: bvy });
    if (L.v === 0 && L.r === L.target) L.rider = null;
  }

  function frame(g, inp, dt, simDt) {
    const m = M(g), L = m.lift, a = astroAt(g);
    logCarve(g);
    const [, , rs, xs] = mochiLocal(g, g.sh.x, g.sh.y), near = (x, r) => x > TOWN_X[0] - 150 && x < TOWN_X[1] + 150 && r > TOWN_R[0] - 150 && r < TOWN_R[1] + 150;
    L.sleep = !(near(xs, rs) || (a && near(a.x, a.r)));
    trackZone(g, m, a);
    autoCall(g, m, L, a, simDt);
    liftFx(g, m, L);
    if (m.map && (!a || ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'Space'].some((k) => inp && inp.keys && inp.keys.has(k)))) m.map = false;
  }

  function trackZone(g, m, a) {
    const z = a && a.z, id = z ? (z.id === 'workings0' ? 'workings' : z.id) : null;
    if (id === m.zone) return;
    m.zone = id;
    if (!id) return;
    if (!m.seen[id] && z.kind !== 'shaft') {
      m.seen[id] = 1;
      if (z.kind !== 'street') Game.toast(g, `FOUND: ${z.name.toUpperCase()}`, z.air ? '#8ff0b0' : '#ffd166', 'mochiZone');
      Game.log(g, `mochi: found ${z.name}`);
    }
  }

  // idle 3 s with you on a stop's floor (or by the lift house) and not on the deck: the car comes to you
  function autoCall(g, m, L, a, simDt) {
    if (L.v !== 0 || L.r !== L.target || !a || !a.grounded || onDeck(g)) { L.idle = 0; return; }
    L.idle += simDt;
    if (L.idle < 3) return;
    const z = a.z, nearHouse = a.feet > TOP - 1.5 && Math.abs(a.x - xAt(LIFT.th, a.r)) < LIFT.w / 2 + 0.5 + 8;
    const stop = nearHouse ? LIFT.stops[0] : z && z.rf ? stopOf(z.rf) : null;
    if (stop && stop.r !== L.r) go(g, L, stop, 'auto-call');
  }

  function go(g, L, stop, why) {
    if (L.target === stop.r && L.v !== 0) return;
    const from = stopOf(L.r), d = Math.abs(stop.r - L.r), t = d >= 6 ? d / LIFT.vmax + LIFT.vmax / LIFT.acc : 2 * Math.sqrt(d / LIFT.acc);
    L.target = stop.r; L.idle = 0; L.dep = L.r; L.ka = L.r; board(g, L);
    Game.log(g, `mochi lift ${from ? from.id : L.r.toFixed(1)} -> ${stop.id} (${d.toFixed(0)} m, ${t.toFixed(1)} s, ${why})`);
  }

  function liftFx(g, m, L) {
    const b = g.w.byId.mochi; if (!b || !b.ter || L.q === null) return;
    const at = () => { const [lx, ly] = floorAt(xAt(LIFT.th, L.q), L.q), [bx, by] = World.bodyState(g.w, b, g.t); return [bx + lx, by + ly]; };
    if (L.arrived) {
      L.arrived = false;
      const [x, y] = at(), s = stopOf(L.r);
      Game.popup(g, 'CLUNK!', '#ffd166', x, y + 1.5, 24);
      if (s && astroOut(g)) Game.toast(g, `CLUNK LIFT: ${s.name.toUpperCase()}`, '#ffd166', 'mochiLift');
    }
    if (Math.abs(L.r - L.ka) >= 4) { L.ka = L.r; const [x, y] = at(); Game.popup(g, 'ka-chunk', '#ffe2b0', x, y + 1, 14); }
  }


  // ======================================================================
  //  INTERACTIONS (F) AND KEYS (1-4 on the deck)
  // ======================================================================

  const econ = (g) => typeof Econ !== 'undefined' && on(g, 'economy') && typeof Econ.openShop === 'function';
  function openShop(g, id) {
    if (Econ.openShop(g, ST[id]) !== false) Game.log(g, `mochi shop ${id} opened`);
  }

  const PLAQUES = [   // under the three wrong Pipkin signs: [x, floor r, what the Murk dots say]
    [16.6, F1, 'noodles east'], [14, F2, 'down. obviously.'], [12.5, F3, 'the old workings. do not.'],
  ];
  const BOARDS = [[-55.5, 'S'], [-11, F1]];                       // map boards: [x, floor r]
  const COUNTERS = { pantry: [-8, F1], dighall: [59, F1], noodle: [33, F1] };

  function interactions(g) {
    const m = M(g), out = [];
    if (m.map) return [{ key: 'KeyF', text: 'Close the map', dist: 0, col: '#7cf5d6', act: (g2) => { M(g2).map = false; } }];
    if (g.ui) return null;
    if (g.mode === 'ship' && g.status === 'landed' && econ(g)) {
      const o = landedOutpost(g);
      if (o) out.push({ key: 'KeyF', text: `Open ${ST[o.id].name} (${ST[o.id].keeper})`, dist: 4, col: '#ffd166', act: (g2) => openShop(g2, o.id) });
    }
    if (!astroOut(g)) return out;
    const o = outpostNear(g);
    if (o && econ(g)) out.push({ key: 'KeyF', text: `Open ${ST[o.o.id].name} (${ST[o.o.id].keeper})`, dist: o.d, col: '#ffd166', act: (g2) => openShop(g2, o.o.id) });
    const a = astroAt(g); if (!a || !inTown(a.x, a.r)) return out;
    const near = (x, r, reach) => { const d = Math.hypot(a.x - x, a.feet - r); return d < reach ? d : -1; };
    let d;
    if (econ(g) && (d = near(...COUNTERS.pantry, 2.6)) >= 0) out.push({ key: 'KeyF', text: 'Sell at the Pantry (Parsnip)', dist: d, col: '#ffd166', act: (g2) => openShop(g2, 'pantry') });
    if (econ(g) && (d = near(...COUNTERS.dighall, 3)) >= 0) out.push({ key: 'KeyF', text: 'Dig Hall: suits and the guild till (Sorrel)', dist: d, col: '#ffd166', act: (g2) => openShop(g2, 'dighall') });
    if ((d = near(...COUNTERS.noodle, 3.2)) >= 0) out.push({ key: 'KeyF', text: 'Fries! Fix your suit and refill your air ($5)', dist: d, col: '#ff9ec7', act: fries });
    for (const [x, r] of BOARDS) if ((d = near(x, r === 'S' ? SD(x) : r, 2.2)) >= 0) out.push({ key: 'KeyF', text: 'Read the map', dist: d, col: '#7cf5d6', act: (g2) => { M(g2).map = true; Game.log(g2, 'mochi map board read'); } });
    for (const p of PLAQUES) if ((d = near(p[0], p[1], 1.6)) >= 0) out.push({ key: 'KeyF', text: 'Feel the dots', dist: d, col: '#b9a6f2', act: (g2) => feelPlaque(g2, p) });
    const L = m.lift;
    if (onDeck(g)) {
      if (L.v !== 0) return out;                                   // riding: 1-4 still pick a floor
      const s = nextStop(L);
      out.push({ key: 'KeyF', text: `Lift: ${s.r < L.r ? 'going down' : 'going up'} to ${s.name}`, dist: 0.5, col: '#8ff0b0', act: (g2) => go(g2, L, s, 'F') });
    } else {
      const s = landingNear(g, 2.5);
      if (s && (L.r !== s.r || L.v !== 0)) out.push({ key: 'KeyF', text: 'Call the lift', dist: 1, col: '#8ff0b0', act: (g2) => go(g2, L, s, 'call') });
    }
    return out;
  }
  const nextStop = (L) => { const i = LIFT.stops.findIndex((s) => Math.abs(s.r - L.target) < 0.01); return LIFT.stops[i >= 0 && i < LIFT.stops.length - 1 ? i + 1 : 0]; };

  function fries(g) {
    if (g.money < 5) { Game.toast(g, 'GRUBB: NO MONEY, NO FRIES. HOUSE RULES.', '#ff9f1c', 'mochiFries'); return; }
    g.money -= 5;
    if (typeof EVA !== 'undefined' && on(g, 'eva') && typeof EVA.topUp === 'function') EVA.topUp(g, false);
    else g.astro.hp = g.astro.hpMax;
    Game.popup(g, 'NOM!', '#ffd166');
    Game.toast(g, 'FRIES! SUIT PATCHED, AIR TOPPED UP  -$5', '#ff9ec7', 'mochiFries');
    Game.log(g, 'mochi: fries at the Noodle Hole');
  }

  function feelPlaque(g, p) {
    const N = npcs(), read = !!N && typeof N.readable === 'function' && p[2].split(' ').every((w) => N.readable(g, 'murk', w));
    Game.popup(g, read ? `"${p[2]}"` : '~ bumpy dots ~', read ? '#d9d0f2' : '#b9a6f2', undefined, undefined, 18);
    Game.log(g, `mochi plaque: ${read ? p[2] : 'unread'}`);
  }

  function onKey(g, code) {
    if (code === 'Escape' && M(g).map) { M(g).map = false; return true; }  // Esc closes the map board, not the game
    const k = /^(Digit|Numpad)([1-4])$/.exec(code);
    if (!k || g.ui || !onDeck(g)) return false;
    go(g, M(g).lift, LIFT.stops[+k[2] - 1], `key ${k[2]}`);
    return true;
  }

  // ---------------- outposts: where the ship or astronaut is ----------------

  function outpostFrame(g, o, x, y) {                              // world -> [x along the plinth top (east +), height above it]
    const b = g.w.byId[o.body], [bx, by] = World.bodyState(g.w, b, g.t), lx = x - bx, ly = y - by, r = Math.hypot(lx, ly);
    const rp = plinthTop(b, o.th, o.w).rp;
    return [-dth(Math.atan2(ly, lx), o.th) * rp, r - rp];
  }
  function landedOutpost(g) {
    const b = g.landedOn; if (!b) return null;
    return OUTPOSTS.find((o) => o.body === b.id && Math.abs(outpostFrame(g, o, g.sh.x, g.sh.y)[0]) <= Math.min(14, o.w / 2)) || null;
  }
  function outpostNear(g) {
    const A = g.astro, nb = Game.nearestBody(g, A.x, A.y); let best = null;
    for (const o of OUTPOSTS) {
      if (o.body !== nb.b.id) continue;
      const [x, h] = outpostFrame(g, o, A.x, A.y), L = LAYOUT[o.id], d = Math.min(Math.abs(x - L.counter), Math.abs(x - o.kx));
      if (d < 3 && h < 3 && h > -1 && (!best || d < best.d)) best = { o, d };
    }
    return best;
  }


  // ======================================================================
  //  NAV, HINTS, JOB, SPAWN
  // ======================================================================

  function navTargets(g) {
    const b = g.w.byId.mochi; if (!b) return null;
    const pt = (body, lx, ly) => (t) => { const s = World.bodyState(g.w, body, t); return [s[0] + lx, s[1] + ly, s[2], s[3]]; };
    const [sx, sy] = floorAt(...STAIR_MOUTH), [px, py] = padAt(b);
    const list = [{ id: PAD_ID, name: 'Mochi Pad (town)', col: '#7cf5d6', r: 10, kind: 'pad', state: pt(b, px, py) },
                  { id: 'mochi:downtown', name: 'Downtown (West Stair)', col: '#b9a6f2', r: 2, state: pt(b, sx, sy) }];
    for (const o of outposts(g)) {
      const body = g.w.byId[o.body], [bx, by] = World.bodyState(g.w, body, g.t);
      if (g.navId !== 'mochi:' + o.id && Math.hypot(g.sh.x - bx - o.lx, g.sh.y - by - o.ly) > 3000) continue;
      list.push({ id: 'mochi:' + o.id, name: o.name, col: o.col, r: 12, state: pt(body, o.lx, o.ly) });
    }
    return list;
  }

  function hint(g) {
    const m = M(g), L = m.lift, a = astroAt(g);
    if (g.ui) return null;
    if (m.map) return { pri: 40, text: 'The map: you are the red dot. Walk (or press F) to put it away.' };
    if (!a) {
      const lo = g.status === 'landed' && landedOutpost(g);
      if (lo && econ(g)) return { pri: 34, text: `${ST[lo.id].name}: press F to trade with ${ST[lo.id].keeper}. ${OUT_HINT[lo.id]}` };
      const x = landedX(g), town = !m.seen.pantry && g.done.mine !== undefined;
      if (x === null || !(town || g.done.land_mochi === undefined)) return null;
      if (Math.abs(x) > PAD_NEAR) return { pri: 31, text: hopHint(g, x) };
      if (town)
        return { pri: 30, text: `Downtown is under your feet: E to step out, then walk ${way(x + 44)} to the West Stair or ${way(x - 21)} to the Clunk Lift.` };
      return null;
    }
    const z = a.z, x = a.x;
    if (onDeck(g) && L.v) return { pri: 48, text: `Clunk Lift: ${L.v < 0 ? 'down' : 'up'} to ${(stopOf(L.target) || LIFT.stops[0]).name}. Hold on (or press 1-4 to change floors).` };
    if (onDeck(g)) return { pri: 48, text: `Clunk Lift: F goes to ${nextStop(L).name}; or 1 Surface · 2 Main Street · 3 Low Street · 4 The Cellar.` };
    const s = landingNear(g, 3);
    if (s && L.r !== s.r) return { pri: 47, text: `The Clunk Lift is ${L.v ? 'on its way' : `at ${(stopOf(L.r) || { name: 'a stop' }).name}`}. Wait here, or press F to call it.` };
    if (!inTown(x, a.r)) return null;
    if (!z && a.feet > 295 && !m.seen.pantry) {
      const pri = g.done.mine === undefined ? 20 : 30;
      if (!npcs() && Math.abs(x + 50) < 6) return { pri, text: 'A note on the post: "Downtown\'s down the stair. Lift\'s by the pad. The signs are wrong." (Tansy)' };
      if (x < -35) return { pri, text: 'The West Stair: walk on east and down into Downtown. The Pantry is at the bottom.' };
      return { pri, text: `Downtown is under your feet: walk ${(x + 40).toFixed(0)} m west to the West Stair, or ${Math.abs(21 - x).toFixed(0)} m east to the Clunk Lift.` };
    }
    if (!z) return null;
    if (z.id === 'skylight') return { pri: 27, text: `Ember shines down this hole once a day (108 min). ${noon(g) ? 'It is noon: look up!' : `Next noon in ${mins(noonIn(g))}.`}` };
    if (z.id === 'workings' || z.id === 'workings0') return { pri: 27, text: 'The Old Workings: no lining, no air, no lamps. These walls are plain rock: dig away.' };
    if (z.id === 'cellar' || z.id === 'deep') return { pri: 26, text: 'The Cellar: you weigh 16% less down here (g grows with r inside Mochi). The Old Workings ramp is west.' };
    if (!m.seen.deep && z.rf) return { pri: 26, text: 'The Clunk Lift (east of the Pantry) goes down to Low Street and the Cellar. Stand on the yellow deck.' };
    return null;
  }
  const mins = (t) => (t < 90 ? `${Math.ceil(t)} s` : `${Math.round(t / 60)} min`);
  const way = (dx) => `${Math.abs(dx).toFixed(0)} m ${dx > 0 ? 'left' : 'right'}`;   // dx = you - there (x east = right when upright)

  // landed on Mochi: the ship's x east of the pad (the short way round), else null
  function landedX(g) {
    const b = g.w.byId.mochi;
    if (g.status !== 'landed' || g.mode !== 'ship' || !g.landedOn || g.landedOn !== b) return null;
    const [bx, by] = World.bodyState(g.w, b, g.t);
    return -dth(Math.atan2(g.sh.y - by, g.sh.x - bx), TH0) * World.surfaceR(b, TH0);
  }
  // landed far from town: a hop. Minimum-energy ballistic hop over chord c on a sphere of radius R:
  //  v^2 = mu (2/R - 4/(2R + c)); twice that for the landing. 100 m: 13 m/s, 460 m: 22, 730 m: 24 (stock tank: ~390)
  function hopHint(g, x) {
    const b = g.w.byId.mochi, R = World.surfaceR(b, TH0), c = 2 * R * Math.sin(Math.abs(x) / R / 2);
    const dv = 2 * Math.sqrt(b.mu * (2 / R - 4 / (2 * R + c))), dir = x > 0 ? 'left' : 'right', key = x > 0 ? 'A' : 'D';
    const tab = g.navId === PAD_ID ? '' : ' (Tab: Mochi Pad)';
    return `Town pad: ${Math.abs(x).toFixed(0)} m to your ${dir}${tab}. Hop: W up, tip ${dir} (${key}), burn till your path ends on the pad, brake at ⊗ BRAKE. ~${Math.ceil(dv / 5) * 5} m/s of fuel.`;
  }
  const OUT_HINT = { frostbite: 'Ice sells at 1.1x here.', clank: 'Repairs at 3/4 price, iron at 1.1x.', pump9: 'The cheapest fuel in the belt.',
                     pitstop: 'Fuel and a kettle.', forge: 'The cheapest repairs in the belt.', brinepit: 'Black market: no names, no receipts.' };

  // Ember stands over the skyhole when its direction from Mochi points along it (Mochi never spins)
  function noonIn(g) {
    const b = g.w.byId.mochi, per = 2 * Math.PI / b.n, [bx, by] = World.bodyState(g.w, b, g.t);
    const d = dth(Math.atan2(-by, -bx), SHAFTS[1].th);
    return ((-d / (2 * Math.PI)) * per % per + per) % per;
  }

  function inCellar(g) {                                          // stepped off at the Cellar, or rode the deck all the way down
    const z = astroOut(g) && zoneAt(g, g.astro.x, g.astro.y), L = M(g).lift;
    return !!z && (z.id === 'cellar' || z.id === 'deep' || (onDeck(g) && L.v === 0 && L.r === F3));
  }

  function placeTunnels(g) {
    const b = g.w.byId.mochi;
    Game.landAt(g, b, TH0);
    const L = M(g).lift; Object.assign(L, { r: F1, target: F1, dep: F1, ka: F1 });
    stepLift(g, L, 0);
    if (typeof EVA === 'undefined' || !on(g, 'eva') || !EVA.stepOut(g)) return;
    const [lx, ly, ux, uy] = floorAt(0, F1), [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    Object.assign(g.astro, { x: bx + lx + ux * 0.8, y: by + ly + uy * 0.8, vx: bvx, vy: bvy, ang: Math.atan2(uy, ux) });
    Game.log(g, 'mochi: spawned in the Pantry');
  }

  // ======================================================================
  //  ART: props in the house toon recipe (mochi.md §6.3). Each prop draws in a floor frame:
  //  origin on the floor, +x east, +y up, metres. Indoors the lamps are the key light.
  // ======================================================================

  const INK = '#1b1433', INDOOR = [-0.55, 0.83];
  const WOOD = ['#d9a066', '#93602f', '#ffd7a3'], POST = ['#8a6a5a', '#523a30', '#c9a898'], CREAM = ['#fff4dc', '#e5c99a', '#ffffff'],
        GOLD = ['#ffd166', '#c9961f', '#fff3c4'], LILAC = ['#bdb7da', '#7d77a3', '#efedff'], ORANGE = ['#ff9f43', '#c25f1c', '#ffd8a6'],
        STEEL = ['#a7a2b8', '#6e6896', '#e0ddf0'], PINK = ['#ff7eb6', '#b0306e', '#ffd6ea'], PLUM = ['#8f6bb8', '#5a3f80', '#d9c8f2'];
  let ctx = null, PX = 0.03, NOW = 0, LT = INDOOR, FONT = 'sans-serif', NIGHT = false;

  // ---------------- toon helpers ----------------

  function ink(w = 2.5) { ctx.strokeStyle = INK; ctx.lineWidth = w * PX; ctx.lineJoin = 'round'; ctx.stroke(); }
  function toon(path, cols, k, hiFn, w) {                          // shade, base shifted toward the light, highlight, ink
    path(); ctx.fillStyle = cols[1]; ctx.fill();
    ctx.save(); path(); ctx.clip(); ctx.translate(LT[0] * k, LT[1] * k); path(); ctx.fillStyle = cols[0]; ctx.fill();
    if (hiFn && cols[2]) { ctx.translate(-LT[0] * k, -LT[1] * k); ctx.fillStyle = cols[2]; hiFn(); }
    ctx.restore(); path(); ink(w);
  }
  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function box(x, y, w, h, r, cols, k = Math.min(w, h) * 0.18) {   // the recipe without a clip: a box and its shifted copy overlap in a box
    if (!(w > 0 && h > 0)) return;
    const dx = LT[0] * k, dy = LT[1] * k;
    rr(x, y, w, h, r); ctx.fillStyle = cols[1]; ctx.fill();
    rr(x + Math.max(0, dx), y + Math.max(0, dy), w - Math.abs(dx), h - Math.abs(dy), r); ctx.fillStyle = cols[0]; ctx.fill();
    if (cols[2]) { ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + h * 0.72, Math.min(w, h) * 0.12, Math.min(w, h) * 0.06, 0.6, 0, 7); ctx.fillStyle = cols[2]; ctx.fill(); }
    rr(x, y, w, h, r); ink();
  }
  function disc(x, y, r, cols, k = r * 0.25) {                      // ...and a disc's lit part is the biggest disc inside the lens
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = cols[1]; ctx.fill();
    ctx.beginPath(); ctx.arc(x + LT[0] * k / 2, y + LT[1] * k / 2, Math.max(0, r - k / 2), 0, 7); ctx.fillStyle = cols[0]; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ink();
  }
  function poly(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
  function line(pts, w, col = INK) {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  const rod = (pts, w, col) => { line(pts, w + 4 * PX); line(pts, w, col); };
  function text(s, x, y, size, col = INK, outline = 0, maxW = 0) {
    if (maxW) size = Math.min(size, maxW / (String(s).length * 0.62));
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 20, -size / 20); ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (outline) { ctx.lineWidth = outline * 20 / size; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(s, 0, 0); }
    ctx.fillStyle = col; ctx.fillText(s, 0, 0); ctx.restore();
  }
  const GLOWS = new Map();                                         // one pre-painted glow per colour, stamped per lamp (systems M3)
  function glow(x, y, R, rgb, a) {
    if (typeof document === 'undefined') {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); return;
    }
    let cv = GLOWS.get(rgb);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
      GLOWS.set(rgb, cv);
    }
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a; ctx.drawImage(cv, x - R, y - R, 2 * R, 2 * R); ctx.globalAlpha = a0;
  }

  // ---------------- alien script on signs (Npcs.script when present; Murk-ish dots without it) ----------------

  const GLY = new Map();
  function glyphs(race, word, x, y, w, h, col = INK) {             // fills the box (x, y)-(x + w, y + h)
    const k = `${race}|${word}|${(w / h).toFixed(1)}`, N = npcs();
    if (!GLY.has(k)) GLY.set(k, N && typeof N.script === 'function' ? N.script(race, word, 40 * w / h, 40) : dots(word, 40 * w / h));
    ctx.save(); ctx.translate(x, y + h); ctx.scale(h / 40, -h / 40); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (const [t, a, b, c, d, e] of GLY.get(k)) {
      ctx.beginPath(); ctx.lineWidth = 3;
      if (t === 'dot') { ctx.arc(a, b, c, 0, 7); ctx.fill(); }
      else if (t === 'ring') { ctx.arc(a, b, c, 0, 7); ctx.stroke(); }
      else if (t === 'line') { ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineWidth = e; ctx.stroke(); }
      else if (t === 'ell') { ctx.ellipse(a, b, c, d, e, 0, 7); ctx.stroke(); }
      else if (t === 'sq') { if (d) { ctx.fillStyle = '#7cf5d6'; ctx.fillRect(a, b, c, c); ctx.fillStyle = col; } else { ctx.lineWidth = 1; ctx.strokeRect(a + 1, b + 1, c - 2, c - 2); } }
      else if (t === 'spiral') { for (let i = 0; i <= 30; i++) { const an = i / 30 * 4.7, q = c * (0.15 + 0.85 * i / 30); ctx.lineTo(a + Math.cos(an) * q, b + Math.sin(an) * q); } ctx.stroke(); }
    }
    ctx.restore();
  }
  function dots(word, w) {
    const out = [], n = Math.max(1, Math.round(w / 25));
    for (let i = 0; i < n; i++) {
      const ch = word.charCodeAt(i % word.length) * (i + 3);
      for (let k = 0; k < 6; k++) if ((ch >> k) & 1) out.push(['dot', (i + 0.3 + 0.4 * (k % 2)) * w / n, 40 * (0.2 + 0.3 * Math.floor(k / 2)), 5.6]);
    }
    return out;
  }

  // ---------------- props: lights (drawn first; at low zoom they are all you see: an ant farm with its lamps on) ----------------

  const P = {}, LIT = {};
  const cord = (h) => Math.max(0.4, Math.min(3, h - 4.2));
  LIT.lamp = (o) => glow(0, o.h - cord(o.h) - 0.37, 3.4, o.rgb || '255,214,140', 0.42);
  P.lamp = (o) => {
    const h = o.h, y = h - cord(h);
    ctx.save(); ctx.translate(0, h); ctx.rotate(Math.sin(NOW * 1.3 + o.x) * 0.04); ctx.translate(0, -h);
    line([[0, h], [0, y]], 1.6 * PX);
    toon(() => poly([[-0.32, y - 0.3], [-0.16, y], [0.16, y], [0.32, y - 0.3]]), o.shade || ORANGE, 0.06);
    ctx.beginPath(); ctx.arc(0, y - 0.37, 0.13, 0, 7); ctx.fillStyle = '#fff6c8'; ctx.fill(); ink(1.5);
    ctx.restore();
  };
  LIT.postLamp = () => glow(0.55, 3.0, 3.2, '255,214,140', NIGHT ? 0.5 : 0.25);
  P.postLamp = () => {
    box(-0.09, 0, 0.18, 3.6, 0.05, STEEL); rod([[0, 3.5], [0.55, 3.5]], 0.08, '#a7a2b8');
    toon(() => poly([[0.3, 2.85], [0.8, 2.85], [0.7, 3.3], [0.4, 3.3]]), GOLD, 0.05);
    ctx.beginPath(); ctx.arc(0.55, 3.0, 0.12, 0, 7); ctx.fillStyle = '#fff6c8'; ctx.fill();
  };
  LIT.window = (o) => glow(0, o.y, 2.2, '255,214,140', 0.33);
  P.window = (o) => {
    const y = o.y, R = 0.5;
    ctx.beginPath(); ctx.arc(0, y, R + 0.13, 0, 7); ctx.fillStyle = '#8a7aa8'; ctx.fill(); ink();
    ctx.beginPath(); ctx.arc(0, y, R, 0, 7); ctx.fillStyle = '#ffe9a8'; ctx.fill(); ink(2);
    ctx.save(); ctx.beginPath(); ctx.arc(0, y, R, 0, 7); ctx.clip();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * R, y + R); ctx.quadraticCurveTo(s * R * 0.2, y + R * 0.2, s * R, y - R); ctx.closePath(); ctx.fillStyle = o.cur || '#ff7eb6'; ctx.fill(); ink(1.5); }
    ctx.restore();
    box(-0.55, y - R - 0.24, 1.1, 0.14, 0.04, WOOD);
    disc(0.25, y - R - 0.02, 0.13, ['#7ed957', '#3f8f2a', '#c8f5a8']);
  };
  LIT.shroom = () => glow(0, 0.6, 1.6, '124,245,214', 0.32 + 0.06 * Math.sin(NOW * 1.7));
  P.shroom = (o) => {
    const s = o.flip ? -1 : 1;
    for (const [dx, h, R] of [[0, 0.75, 0.32], [0.38 * s, 0.45, 0.2], [-0.32 * s, 0.35, 0.16]]) {
      rod([[dx, 0], [dx + 0.05 * s, h]], 0.07, '#e6e0ff');
      toon(() => { ctx.beginPath(); ctx.ellipse(dx + 0.05 * s, h, R, R * 0.6, 0, 0, Math.PI); ctx.closePath(); }, ['#7cf5d6', '#2f9e96', '#e0fff8'], R * 0.2);
    }
  };

  // ---------------- props: the market and the streets ----------------

  P.stall = (o) => {
    const w = o.w || 3.0, cols = o.awn || ['#ff7eb6', '#fff4dc'], n = 6, aw = w + 0.4, goods = o.goods || 4;
    box(-w / 2, 0, w, 1.0, 0.12, o.wood || WOOD);
    for (const sx of [-w / 2 + 0.15, w / 2 - 0.3]) box(sx, 1.0, 0.15, 1.3, 0.05, POST);
    for (let i = 0; i < n; i++) {
      const x0 = -aw / 2 + i * aw / n, x1 = x0 + aw / n;
      ctx.beginPath(); ctx.moveTo(x0, 2.6); ctx.lineTo(x1, 2.6); ctx.lineTo(x1, 2.25); ctx.quadraticCurveTo((x0 + x1) / 2, 2.0, x0, 2.25); ctx.closePath();
      ctx.fillStyle = cols[i % 2]; ctx.fill(); ink(2);
    }
    poly([[-aw / 2, 2.6], [aw / 2, 2.6], [aw / 2 - 0.2, 2.85], [-aw / 2 + 0.2, 2.85]]); ctx.fillStyle = cols[0]; ctx.fill(); ink(2);
    for (let i = 0; i < goods; i++) {
      const gx = -w / 2 + 0.45 + i * (w - 0.9) / Math.max(1, goods - 1);
      ctx.beginPath(); ctx.arc(gx, 1.15, 0.16, 0, 7); ctx.fillStyle = (o.gc || ['#c4ecff', '#d98a5f', '#bccb94', '#ffb347'])[i % 4]; ctx.fill(); ink(1.5);
    }
    box(-0.9, 3.0, 1.8, 0.55, 0.12, CREAM);
    if (o.race) glyphs(o.race, o.word, -0.72, 3.07, 1.44, 0.4); else text(o.sign, 0, 3.27, 0.36, INK, 0, 1.6);
  };
  function arrow(x, y, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); poly([[-0.05, -0.25], [0.32, 0], [-0.05, 0.25]]);
    ctx.fillStyle = '#ff9f1c'; ctx.fill(); ink(2); ctx.restore();
  }
  const ARROW = { e: 0, w: Math.PI, up: Math.PI / 2, down: -Math.PI / 2 };
  P.sign = (o) => {
    const w = o.w || 2.4, y = 1.8, lines = o.lines || [o.text], bh = 0.5 + 0.38 * lines.length + (o.race ? 0.36 : 0), top = y - 0.1 + bh;
    box(-0.08, 0, 0.16, y, 0.04, POST);
    box(-w / 2, y - 0.1, w, bh, 0.15, o.cols || GOLD);
    lines.forEach((s, i) => text(s, o.arrow ? -0.2 : 0, top - 0.42 - i * 0.4, 0.4, INK, 0, w - (o.arrow ? 0.9 : 0.3)));
    if (o.race) glyphs(o.race, o.word, -w / 2 + 0.3, y + 0.02, w - 0.6, 0.3);
    if (o.arrow) arrow(w / 2 - 0.42, top - 0.42, ARROW[o.arrow]);
  };
  P.plaque = (o) => {                                              // Murk touch-dots that tell the truth under a wrong sign
    box(-0.6, 0.6, 1.2, 0.5, 0.1, ['#b9a6f2', '#7d6bb8', '#e6dcff']);
    glyphs('murk', o.word, -0.48, 0.68, 0.96, 0.34, '#4a3a7a');
  };
  P.banner = (o) => {                                              // a hanging name board: English (Pipkin) over the residents' script
    const w = o.w || 4, y = o.y, h = o.text ? 1.15 : 0.7, tie = o.h - y;
    for (const s of [-1, 1]) line([[s * (w / 2 - 0.3), y], [s * (w / 2 - 0.5), y + tie]], 1.5 * PX);
    box(-w / 2, y - h, w, h, 0.2, o.cols || CREAM);
    if (o.text) text(o.text, 0, y - 0.38, 0.46, INK, 0, w - 0.4);
    if (o.race) glyphs(o.race, o.word, -w / 2 + 0.35, y - h + 0.12, w - 0.7, o.text ? 0.36 : 0.46, '#5a3f80');
  };
  P.door = (o) => {
    const R = 0.95, col = o.col || ['#7fb8ff', '#4a74b8', '#d6e8ff'];
    ctx.save(); ctx.beginPath(); ctx.rect(-2, 0, 4, 3); ctx.clip();
    ctx.beginPath(); ctx.arc(0, R, R + 0.18, 0, 7); ctx.fillStyle = '#8a7aa8'; ctx.fill(); ink();
    toon(() => { ctx.beginPath(); ctx.arc(0, R, R, 0, 7); }, col, R * 0.2);
    for (const a of [-0.45, 0, 0.45]) line([[Math.sin(a) * R * 0.92, R + Math.cos(a) * R * 0.92], [Math.sin(a) * R * 0.92, R - Math.cos(a) * R * 0.92]], 1.5 * PX, 'rgba(27,20,51,0.35)');
    ctx.restore();
    disc(R * 0.5, R, 0.09, GOLD, 0.02);
    ctx.beginPath(); ctx.arc(0, R * 1.45, R * 0.25, 0, 7); ctx.fillStyle = '#ffe9a8'; ctx.fill(); ink(2);
    if (o.n) { box(-0.25, 2.25, 0.5, 0.38, 0.08, CREAM); text(String(o.n), 0, 2.44, 0.28); }
  };
  P.plant = () => {
    box(-0.3, 0, 0.6, 0.55, 0.08, ['#ff9f43', '#c25f1c', '#ffd8a6']);
    for (const [a, l] of [[-0.5, 0.8], [0, 1.0], [0.5, 0.8], [-0.25, 0.65], [0.25, 0.7]]) {
      ctx.save(); ctx.translate(0, 0.55); ctx.rotate(a);
      toon(() => { ctx.beginPath(); ctx.ellipse(0, l / 2, 0.12, l / 2, 0, 0, 7); }, ['#7ed957', '#3f8f2a', '#c8f5a8'], 0.04);
      ctx.restore();
    }
  };
  P.crates = () => {
    box(-0.6, 0, 1.2, 1.0, 0.08, WOOD); box(0.65, 0, 0.8, 0.7, 0.08, ['#c48a54', '#835228', '#f2c690']); box(-0.3, 1.0, 0.8, 0.65, 0.08, ['#e0b07a', '#9a6a3a', '#ffe0b0']);
    line([[-0.6, 0], [0.6, 1.0]], 1.5 * PX); line([[0.6, 0], [-0.6, 1.0]], 1.5 * PX);
  };
  P.mapBoard = (o) => {
    for (const s of [-1, 1]) box(s * 1.0 - 0.07, 0, 0.14, 1.1, 0.04, POST);
    box(-1.3, 1.0, 2.6, 1.8, 0.15, CREAM);
    const s = 2.3 / 160, X = (x) => (x - 10) * s, Y = (r) => 1.12 + (r - 205) * s;
    ctx.save(); rr(-1.2, 1.08, 2.4, 1.48, 0.06); ctx.clip(); mapPaint(o.b, X, Y, 0.6 * PX, o.L); ctx.restore();
    const p = 0.5 + 0.5 * Math.sin(NOW * 5);
    ctx.beginPath(); ctx.arc(X(o.x), Y(o.r + 1), 0.06 + 0.05 * p, 0, 7); ctx.fillStyle = '#ff3b3b'; ctx.fill(); ink(1);
    text('YOU ARE HERE', 0, 2.68, 0.15, '#c4203a');
  };
  P.airlock = () => {
    const h = 3.4;
    box(-0.35, 0, 0.7, h, 0.06, GOLD);
    ctx.save(); rr(-0.35, 0, 0.7, h, 0.06); ctx.clip(); ctx.fillStyle = INK;
    for (let y = -1; y < h + 1; y += 0.5) { poly([[-0.4, y], [0.4, y + 0.3], [0.4, y + 0.5], [-0.4, y + 0.2]]); ctx.fill(); }
    ctx.restore();
    box(-0.32, h - 0.65, 0.64, 0.42, 0.08, CREAM); text('AIR', 0, h - 0.44, 0.26);
  };
  LIT.airlock = () => { if ((NOW % 1.4) < 0.7) glow(0, 3.45, 1.2, '124,245,214', 0.6); };
  P.noodle = () => {
    box(-3, 0, 6, 1.1, 0.12, ORANGE);
    box(-3.15, 1.1, 6.3, 0.18, 0.06, CREAM);
    for (const sx of [-2.2, -0.8, 0.6, 2.0]) { line([[sx, 0], [sx, 0.7]], 0.08 + 3 * PX); toon(() => { ctx.beginPath(); ctx.ellipse(sx, 0.75, 0.35, 0.12, 0, 0, 7); }, PINK, 0.04); }
    for (const bx of [-1.6, 1.3]) { toon(() => { ctx.beginPath(); ctx.ellipse(bx, 1.3, 0.35, 0.28, 0, Math.PI, 2 * Math.PI, true); ctx.closePath(); }, CREAM, 0.05); }
    const fl = 0.75 + 0.25 * Math.sin(NOW * 7) * Math.sin(NOW * 3.1);
    ctx.save(); ctx.translate(0, 3.6); ctx.lineCap = 'round'; ctx.lineWidth = 0.14; ctx.strokeStyle = `rgba(255,150,200,${fl})`;
    ctx.beginPath(); ctx.arc(0, 0, 1.0, Math.PI, 2 * Math.PI, true); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-1.1, 0); ctx.lineTo(1.1, 0); ctx.stroke();
    for (const nx of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(nx, 0.05); ctx.quadraticCurveTo(nx + 0.25, 0.5, nx - 0.1, 0.9); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0.7, 1.2); ctx.lineTo(-0.1, 0.1); ctx.moveTo(0.95, 1.1); ctx.lineTo(0.15, 0.05); ctx.strokeStyle = `rgba(255,214,102,${fl})`; ctx.stroke();
    ctx.restore();
    text('NOODLE HOLE', 0, 2.25, 0.42, '#ff9ec7', 0.06);
  };
  LIT.noodle = () => glow(0, 3.6, 2.8, '255,120,180', 0.32 * (0.75 + 0.25 * Math.sin(NOW * 7) * Math.sin(NOW * 3.1)));
  P.menu = () => {                                                 // Grubb's menu: Oggle notches and prices
    box(-0.7, 1.4, 1.4, 1.5, 0.12, ['#4a3a5c', '#2c2238', '#6e5a84']);
    ['fries', 'noodles', 'more fries'].forEach((w, i) => { glyphs('oggle', w, -0.58, 2.42 - i * 0.42, 0.75, 0.28, '#fff4dc'); text('$5', 0.42, 2.56 - i * 0.42, 0.22, '#ffd166'); });
  };
  P.rack = () => {                                                 // the Dig Hall's drill rack and hard hats
    box(-1.3, 2.75, 2.6, 0.16, 0.04, WOOD);
    for (const dx of [-0.8, 0, 0.8]) {
      line([[dx, 2.75], [dx, 2.55]], 1.5 * PX);
      box(dx - 0.14, 1.2, 0.28, 1.35, 0.06, STEEL);
      poly([[dx - 0.14, 1.2], [dx, 0.85], [dx + 0.14, 1.2]]); ctx.fillStyle = '#ffd166'; ctx.fill(); ink(2);
    }
    for (const dx of [-0.75, 0.75]) toon(() => { ctx.beginPath(); ctx.ellipse(dx, 3.0, 0.32, 0.26, 0, 0, Math.PI); ctx.closePath(); }, GOLD, 0.05);
  };
  P.counter = (o) => {
    box(-1.4, 0, 2.8, 1.1, 0.12, o.cols || ['#7fb8ff', '#4a74b8', '#d6e8ff']);
    box(-1.55, 1.1, 3.1, 0.16, 0.05, CREAM);
    box(-0.9, 1.55, 1.8, 0.6, 0.12, GOLD); text(o.text, 0, 1.85, 0.34, INK, 0, 1.6);
    if (o.race) glyphs(o.race, o.word, -1.2, 0.35, 2.4, 0.4, '#fff4dc');
  };
  P.portrait = (o) => {                                            // Echo Gallery: rock portraits of the Elders
    const y = o.y, k = o.k;
    toon(() => { ctx.beginPath(); ctx.ellipse(0, y, 0.55, 0.68, 0, 0, 7); }, GOLD, 0.06);
    ctx.beginPath(); ctx.ellipse(0, y, 0.42, 0.55, 0, 0, 7); ctx.fillStyle = ['#cfe9ff', '#ffe2b0', '#d9f5c8', '#ffd6ea'][k % 4]; ctx.fill(); ink(1.5);
    toon(() => { ctx.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * 2 * Math.PI, q = 0.3 * (1 + 0.12 * Math.sin(3 * a + k)); ctx.lineTo(q * Math.cos(a), y - 0.06 + 0.85 * q * Math.sin(a)); } ctx.closePath(); }, ['#b8a99a', '#76665f', '#e2d6c8'], 0.05);
    for (const ex of [-0.1, 0.1]) { ctx.beginPath(); ctx.arc(ex, y, 0.035, 0, 7); ctx.fillStyle = INK; ctx.fill(); }
    line([[-0.08, y - 0.12], [0.08, y - 0.12 - 0.03 * (k % 2)]], 1.2 * PX);
  };
  P.shelves = () => {
    box(-1.1, 0, 2.2, 2.6, 0.08, ['#a9805c', '#6b4a32', '#d9b48c']);
    for (let s = 0; s < 3; s++) {
      const y = 0.25 + s * 0.8; box(-0.95, y, 1.9, 0.1, 0.02, WOOD);
      for (let i = 0; i < 7; i++) { const w = 0.16 + ((i * 7 + s * 3) % 4) * 0.03, h = 0.45 + ((i * 5 + s) % 3) * 0.08;
        box(-0.88 + i * 0.255, y + 0.1, w, h, 0.03, [['#7fb8ff', '#ff7eb6', '#ffd166', '#7cf5d6', '#b9a6f2'][(i + s) % 5], INK, null], 0.02); }
    }
  };
  P.ledSign = (o) => {                                             // the bots' LED sign: a grid, half of it lit
    box(-1.2, o.y - 0.38, 2.4, 0.76, 0.1, ['#3a3448', '#1f1a2a', '#6e6584']);
    glyphs('bot', o.word, -1.05, o.y - 0.26, 2.1, 0.52, '#2f9e96');
  };
  P.cushion = (o) => toon(() => { ctx.beginPath(); ctx.ellipse(0, 0.22, 0.6, 0.24, 0, 0, 7); }, o.col ? PINK : PLUM, 0.06,
    () => { ctx.beginPath(); ctx.ellipse(-0.2, 0.32, 0.18, 0.06, 0, 0, 7); ctx.fill(); });
  P.scope = () => {
    for (const a of [-0.35, 0.35, 0]) rod([[0, 1.4], [Math.sin(a) * 1.0, 0]], 0.08, '#ffd166');
    ctx.save(); ctx.translate(0, 1.45); ctx.rotate(1.25);
    toon(() => rr(-0.4, -0.22, 2.4, 0.44, 0.15), ['#9fd8ff', '#4f86b8', '#e6f6ff'], 0.08);
    box(1.9, -0.28, 0.35, 0.56, 0.08, GOLD);
    ctx.restore();
  };
  P.chart = (o) => {                                               // Sizzy's orbit chart (Orbiloon script)
    box(-1.0, o.y - 0.7, 2.0, 1.4, 0.15, ['#24305e', '#151c3a', '#3e4f8f']);
    for (const q of [0.25, 0.42, 0.58]) { ctx.beginPath(); ctx.ellipse(0, o.y + 0.08, q * 1.5, q, 0, 0, 7); ctx.strokeStyle = 'rgba(255,244,220,0.6)'; ctx.lineWidth = 1.5 * PX; ctx.stroke(); }
    disc(0, o.y + 0.08, 0.13, GOLD, 0.02); disc(0.62, o.y + 0.38, 0.07, ['#7cf5d6', '#2f9e96', null], 0.01);
    glyphs('orbiloon', 'sky', -0.8, o.y - 0.62, 1.6, 0.26, '#fff4dc');
  };
  LIT.idol = () => { for (const cx of [-2.4, -2.0, 2.0, 2.4]) glow(cx, 0.8, 0.8, '255,200,120', 0.55 * (0.8 + 0.2 * Math.sin(NOW * 9 + cx * 7))); };
  P.idol = () => {                                                 // the Elder Crumb: a sleepy boulder with candles
    toon(() => { ctx.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * 2 * Math.PI, q = 1.6 * (1 + 0.1 * Math.sin(2 * a + 1) + 0.06 * Math.sin(5 * a)); ctx.lineTo(q * Math.cos(a), 1.5 + 0.9 * q * Math.sin(a)); } ctx.closePath(); },
      ['#b8a99a', '#76665f', '#e2d6c8'], 0.3, () => { ctx.beginPath(); ctx.ellipse(-0.6, 2.3, 0.35, 0.14, 0.4, 0, 7); ctx.fill(); });
    for (const ex of [-0.45, 0.45]) { ctx.beginPath(); ctx.arc(ex, 1.75, 0.2, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = INK; ctx.lineWidth = 0.07; ctx.stroke(); }
    line([[-0.3, 1.25], [-0.1, 1.15], [0.1, 1.25], [0.3, 1.15]], 0.07);
    for (const cx of [-2.4, -2.0, 2.0, 2.4]) {
      const ch = 0.5 + (cx > 0 ? 0.15 : 0), f = 0.8 + 0.2 * Math.sin(NOW * 9 + cx * 7);
      box(cx - 0.1, 0, 0.2, ch, 0.04, CREAM);
      ctx.beginPath(); ctx.ellipse(cx, ch + 0.14, 0.06, 0.12 * f, 0, 0, 7); ctx.fillStyle = '#ffd166'; ctx.fill();
    }
  };
  LIT.drape = (o) => glow(0, o.h - cord(o.h) - 0.37, 3.2, '160,120,255', 0.4);
  P.drape = (o) => {
    const w = o.w, y = o.y;
    for (let i = 0; i < 3; i++) {
      const x0 = -w / 2 + i * w / 3;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + w / 6, y - 1.0, x0 + w / 3, y); ctx.lineTo(x0 + w / 3, y + 0.1); ctx.lineTo(x0, y + 0.1); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#4a2848' : '#3a2d5c'; ctx.fill(); ink(2);
    }
    P.lamp({ h: o.h, x: o.x + 1, shade: ['#8f6bff', '#3b1f9e', '#d6c8ff'] });
  };

  // ---------------- props: the Old Workings ----------------

  P.beam = (o) => {                                                // timber frame; posts stand on the ramp (o.k = slope)
    const w = 3.2, h = o.h || 3.0, k = o.k || 0, wood = ['#b07a4a', '#6e4526', '#e0b07a'];
    for (const s of [-1, 1]) box(s * w / 2 - 0.15, s * w / 2 * k - 0.1, 0.3, h + 0.1, 0.05, wood);
    ctx.save(); ctx.translate(0, h - 0.15); ctx.rotate(Math.atan(k)); box(-w / 2 - 0.25, -0.17, w / Math.cos(Math.atan(k)) + 0.5, 0.35, 0.05, wood); ctx.restore();
  };
  P.drip = (o) => {
    P.sign({ text: 'MIND THE DRIP', w: 3.0, cols: ['#ff9f1c', '#b8620f', '#ffd8a6'] });
    const f = (NOW / 1.4 + (o.x || 0)) % 1;
    ctx.beginPath(); ctx.ellipse(1.8, 3.2 - f * 3.2, 0.06, 0.1, 0, 0, 7); ctx.fillStyle = '#9fdcff'; ctx.fill(); ink(1);
  };
  P.cart = () => {
    rod([[-3, 0.05], [3, 0.05]], 0.1, '#a7a2b8');
    ctx.save(); ctx.translate(0.6, 0.25); ctx.rotate(0.25);
    toon(() => poly([[-0.9, 0.2], [0.9, 0.2], [1.1, 1.1], [-1.1, 1.1]]), ['#8a86b3', '#565180', '#d9d6f2'], 0.12);
    for (const wx of [-0.55, 0.55]) disc(wx, 0.15, 0.22, ['#3b3448', '#1f1a2a', '#6e6584'], 0.05);
    ctx.restore();
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-1.4 + i * 0.35, 0.25, 0.18, 0, 7); ctx.fillStyle = ['#bccb94', '#eef1ff', '#d98a5f'][i]; ctx.fill(); ink(1.5); }
  };
  P.pick = () => {                                                 // a pick left stuck in the face
    ctx.save(); ctx.translate(0, 1.7); ctx.rotate(-0.5);
    box(-0.05, -1.1, 0.1, 1.2, 0.03, WOOD);
    toon(() => { ctx.beginPath(); ctx.moveTo(-0.55, -0.05); ctx.quadraticCurveTo(0, 0.25, 0.55, -0.05); ctx.lineTo(0, 0.1); ctx.closePath(); }, STEEL, 0.03);
    ctx.restore();
  };

  // ---------------- props: the Clunk Lift ----------------

  P.cage = (o) => {
    const w = 3.5, h = 2.5;
    for (const sx of [-w / 2, w / 2]) rod([[sx, 0], [sx, h]], 0.12, '#ffd166');
    if (!o.far) { ctx.beginPath(); for (let x = -w / 2; x < w / 2 - 0.1; x += 0.6) { ctx.moveTo(x, 0.1); ctx.lineTo(x + 0.6, h - 0.1); } ctx.strokeStyle = 'rgba(255,209,102,0.3)'; ctx.lineWidth = 0.05; ctx.stroke(); }
    box(-w / 2 - 0.15, h, w + 0.3, 0.3, 0.08, GOLD);
    for (const sx of [-0.6, 0.6]) line([[sx, h + 0.3], [sx, o.top]], Math.max(0.05, 2 * PX));
    ctx.beginPath(); ctx.arc(0, h - 0.3, 0.14, 0, 7); ctx.fillStyle = '#fff6c8'; ctx.fill(); glow(0, h - 0.3, 1.6, '255,230,160', 0.35);
  };
  P.liftHouse = (o) => {                                           // over the shaft at the surface: posts, an orange roof, LIFT ↓, a lamp
    for (const s of [-1, 1]) box(s * 2.75 - 0.2, -0.2, 0.4, 4.3, 0.08, LILAC);
    toon(() => poly([[-3.4, 4.45], [3.4, 4.45], [2.7, 5.6], [-2.7, 5.6]]), ORANGE, 0.2);
    box(-1.2, 5.75, 2.4, 0.75, 0.18, CREAM); text('LIFT', -0.25, 6.12, 0.46); arrow(0.75, 6.12, ARROW.down);
    disc(2.75, 3.7, 0.2, o.here ? ['#8ff0b0', '#2f9e5b', '#e0fff0'] : ['#ff5d5d', '#a32a2a', '#ffd0d0'], 0.04);
    if (o.here) glow(2.75, 3.7, 1.3, '143,240,176', 0.5);
  };
  P.shutter = (o) => {                                             // a closed gate: hazard shutters both sides, the stop number
    const [y0, y1] = o.top ? [-1, 4] : [0, ST_H];
    for (const s of [-1, 1]) {
      const x = s > 0 ? 2.0 : -2.5;
      ctx.save(); rr(x, y0, 0.5, y1 - y0, 0.05); ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.clip(); ctx.fillStyle = INK;
      for (let y = y0 - 1; y < y1 + 1; y += 0.6) { poly([[x, y], [x + 0.5, y + 0.35], [x + 0.5, y + 0.6], [x, y + 0.25]]); ctx.fill(); }
      ctx.restore(); rr(x, y0, 0.5, y1 - y0, 0.05); ink();
      disc(s * 2.25, Math.min(y1 - 0.9, 2.4), 0.34, CREAM, 0.03); text(String(o.n), s * 2.25, Math.min(y1 - 0.9, 2.4), 0.42);
    }
  };

  // ---------------- props: outposts (outdoor light; portholes and edge lights glow at night) ----------------

  P.padMarks = (o) => {
    ctx.fillStyle = 'rgba(255,209,102,0.9)'; for (let x = -o.hw + 0.5; x < o.hw; x += 2.4) ctx.fillRect(x, -0.14, 1.2, 0.14);
    for (const sx of [-o.hw, o.hw]) { const on = (NOW * 1.5 + (sx > 0 ? 0.5 : 0)) % 1 < 0.5 || !NIGHT; disc(sx, 0.25, 0.25, on ? ['#7cf5d6', '#2f9e96', '#e0fff8'] : ['#3b3566', '#221d40', null], 0.04); }
  };
  LIT.padMarks = (o) => { if (NIGHT) for (const sx of [-o.hw, o.hw]) if ((NOW * 1.5 + (sx > 0 ? 0.5 : 0)) % 1 < 0.5) glow(sx, 0.25, 1.6, '124,245,214', 0.55); };
  const PORTS = [0.5, 2.64];
  const beaconOn = () => (NOW % 1.2) < 0.6;
  LIT.dome = (o) => {                                              // portholes at night; the beacon on the sign blinks day and night
    if (NIGHT) for (const a of PORTS) glow(Math.cos(a) * o.R * 0.72, Math.sin(a) * o.R * 0.5, 1.4, '255,233,168', 0.5);
    if (beaconOn()) glow(0, o.R * 0.85 + 4.1, 3.2, o.rgb, NIGHT ? 0.7 : 0.45);
  };
  P.dome = (o) => {                                                // habitat dome: portholes, counter, mint awning, name plate, rooftop sign
    const R = o.R, bw = Math.max(3, Math.min(8, o.sign.length * 0.27 + 1)), by = R * 0.85 + 0.9;
    for (const s of [-1, 1]) box(s * (bw / 2 - 0.5) - 0.07, R * 0.5, 0.14, by - R * 0.5, 0.04, POST);
    toon(() => { ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.85, 0, 0, Math.PI); ctx.closePath(); }, ['#f6f2ff', '#b9b2d9', '#ffffff'], R * 0.12,
      () => { ctx.beginPath(); ctx.ellipse(-R * 0.35, R * 0.55, R * 0.2, R * 0.1, -0.5, 0, 7); ctx.fill(); });
    for (const a of PORTS) { ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.5, R * 0.11, 0, 7); ctx.fillStyle = NIGHT ? '#ffe9a8' : '#7fd8ff'; ctx.fill(); ink(2); }
    box(-R * 0.6, R * 0.47, R * 1.2, Math.max(0.5, R * 0.15), 0.12, CREAM); text(o.name, 0, R * 0.47 + Math.max(0.5, R * 0.15) / 2, 0.36, INK, 0, R * 1.1);
    const cx = o.counter;
    box(cx - 0.8, 0, 1.6, 1.15, 0.1, ORANGE);
    poly([[cx - 1.0, 1.95], [cx + 1.0, 1.95], [cx + 0.8, 1.6], [cx - 0.8, 1.6]]); ctx.fillStyle = '#7cf5d6'; ctx.fill(); ink(2);
    if (o.kettle) P.kettle(cx);
    box(-bw / 2, by, bw, 0.85, 0.2, o.neon ? ['#3a2d5c', '#221d40', null] : [o.col, INK, null], 0);
    line([[0, by + 0.85], [0, by + 3.1]], 0.08 + 3 * PX); line([[0, by + 0.85], [0, by + 3.1]], 0.08, '#bdb7da');
    disc(0, by + 3.2, 0.28, beaconOn() ? [o.col, INK, '#ffffff'] : ['#3b3566', '#221d40', null], 0.05);
    if (o.neon) { glow(0, by + 0.42, 2.4, '255,93,177', 0.35); text(o.sign, 0, by + 0.42, 0.5, '#ff9ec7', 0, bw - 0.4); }
    else text(o.sign, 0, by + 0.42, 0.46, INK, 0, bw - 0.4);
  };
  P.kettle = (x) => {
    toon(() => { ctx.beginPath(); ctx.ellipse(x, 1.42, 0.3, 0.26, 0, 0, 7); }, ['#ff7eb6', '#b0306e', '#ffd6ea'], 0.04);
    line([[x + 0.28, 1.45], [x + 0.5, 1.62]], 0.06);
    for (let i = 0; i < 3; i++) { const f = (NOW * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - f; ctx.beginPath(); ctx.arc(x + 0.5 + f * 0.3, 1.7 + f * 1.2, 0.08 + f * 0.15, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    ctx.globalAlpha = 1;
  };
  P.derrick = (o) => {
    const h = o.h || 9, w = 2.4, bob = Math.sin(NOW * 2.2) * 0.35;
    for (const s of [-1, 1]) rod([[s * w / 2, 0], [s * 0.35, h]], 0.18, o.col);
    ctx.beginPath();
    for (let y = 0.6; y < h - 0.6; y += 1.1) { const a0 = w / 2 * (1 - y / h) + 0.35 * y / h, a1 = w / 2 * (1 - (y + 1.1) / h) + 0.35 * (y + 1.1) / h; ctx.moveTo(-a0, y); ctx.lineTo(a1, y + 1.1); ctx.moveTo(a0, y); ctx.lineTo(-a1, y + 1.1); }
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.05, 1.5 * PX); ctx.stroke();
    disc(0, h + 0.2, 0.55, GOLD, 0.1);
    line([[0, h], [0, 1.6 + bob]], Math.max(0.04, 1.5 * PX));
    box(-0.3, -1.2 + bob, 0.6, 2.8, 0.1, STEEL);
  };
  P.tank = (o) => {
    const w = o.w || 3, h = o.th || 2.4, lh = o.lh || 3.4;
    for (const s of [-1, 1]) rod([[s * (w / 2 - 0.3), 0], [s * (w / 2 - 0.3) * 0.8, lh]], 0.14, '#bdb7da');
    toon(() => rr(-w / 2, lh, w, h, h * 0.45), o.cols || ['#9fdcff', '#4e93c9', '#eefaff'], 0.25, () => { ctx.beginPath(); ctx.ellipse(-w * 0.2, lh + h * 0.7, w * 0.12, h * 0.08, 0, 0, 7); ctx.fill(); });
    if (o.label) text(o.label, 0, lh + h / 2, 0.55, INK, 0, w - 0.4);
  };
  P.anvil = () => {
    box(-0.3, 0, 0.6, 0.6, 0.05, ['#5a5470', '#35304a', '#8a84a8']);
    toon(() => poly([[-0.9, 0.6], [0.6, 0.6], [0.9, 1.0], [1.4, 1.05], [0.8, 1.2], [-0.9, 1.2]]), ['#5a5470', '#35304a', '#8a84a8'], 0.06);
  };
  P.scrap = () => {
    for (const [x, y, r, c] of [[-1.2, 0.5, 0.7, STEEL], [0, 0.7, 0.9, ['#ff9f43', '#c25f1c', null]], [1.1, 0.45, 0.6, STEEL], [0.3, 1.5, 0.5, ['#ffd166', '#c9961f', null]]]) disc(x, y, r, c, r * 0.2);
    rod([[-0.6, 1.4], [0.9, 2.4]], 0.1, '#bdb7da'); disc(0.9, 2.4, 0.22, ['#ff7a1c', '#a3480f', null], 0.04);
  };
  LIT.forge = () => glow(-0.2, 1.0, 2.2, '255,140,40', 0.55 + 0.1 * Math.sin(NOW * 6));
  P.forge = () => {
    box(-1.3, 0, 2.2, 2.0, 0.15, ['#b0605a', '#6e3430', '#e8a49c']);
    box(-0.55, 2.0, 0.7, 1.2, 0.05, ['#8a6a5a', '#523a30', null]);
    ctx.beginPath(); ctx.arc(-0.2, 0.9, 0.5, 0, Math.PI); ctx.lineTo(-0.7, 0.4); ctx.lineTo(0.3, 0.4); ctx.closePath(); ctx.fillStyle = '#ffb347'; ctx.fill(); ink(2);
    ctx.save(); ctx.translate(1.5, 0); P.anvil(); ctx.restore();
  };
  P.shack = () => {
    box(-1.5, 0, 3.0, 2.2, 0.08, ['#8fa3a8', '#56686d', '#c7d6da']);
    for (let x = -1.2; x < 1.5; x += 0.45) line([[x, 0.1], [x, 2.1]], 1.2 * PX, 'rgba(27,20,51,0.4)');
    toon(() => poly([[-1.8, 2.1], [1.8, 2.3], [1.6, 2.6], [-1.6, 2.45]]), ['#b07a4a', '#6e4526', null], 0.05);
    box(-0.4, 0, 0.8, 1.5, 0.06, ['#3a2d5c', '#221d40', null]);
    rod([[1.3, 2.4], [1.3, 4.4]], 0.07, '#bdb7da');
    const wv = Math.sin(NOW * 3) * 0.08;
    poly([[1.33, 4.4], [2.6, 4.25 + wv], [2.55, 3.65 + wv], [1.33, 3.7]]); ctx.fillStyle = '#1b1433'; ctx.fill(); ink(1.5);
    ctx.beginPath(); ctx.arc(1.9, 4.05 + wv / 2, 0.15, 0, 7); ctx.fillStyle = '#fff4dc'; ctx.fill();
    for (const s of [-1, 1]) line([[1.9 + s * 0.22, 3.8 + wv / 2], [1.9 - s * 0.22, 3.85 + wv / 2]], 0.05, '#ffd166');
  };


  // ======================================================================
  //  PLACEMENT (x m east of the pad, floor r; 'S' = the surface, 'ramp:<id>' = that ramp's floor)
  // ======================================================================

  const S_ = 'S', WS = 'ramp:weststair', WK = 'ramp:workings0';
  const PLACE = [
    // ---- surface: the way down
    ['sign', -48.5, S_, { text: 'DOWNTOWN', arrow: 'e', w: 3.4, race: 'murk', word: 'down' }], ['mapBoard', -55.5, S_, {}],
    ['postLamp', -45.4, S_, {}], ['postLamp', 16, S_, {}],
    // ---- West Stair
    ['airlock', -41.6, WS, {}], ['lamp', -36, WS, { h: 3.4 }], ['lamp', -27, WS, { h: 3.4 }], ['lamp', -18.5, WS, { h: 3.4 }],
    // ---- The Pantry
    ['banner', 0, F1, { y: 6.7, text: 'THE PANTRY', race: 'oggle', word: 'pantry', w: 4.4 }],
    ['window', -5.5, F1, { y: 4.9 }], ['window', 6.8, F1, { y: 5.1, cur: '#7cf5d6' }],
    ['lamp', -10, F1, {}], ['lamp', -3.6, F1, {}], ['lamp', 3.6, F1, {}], ['lamp', 10, F1, {}],
    ['mapBoard', -11, F1, {}],
    ['stall', -7.6, F1, { sign: 'GEMS', awn: ['#ff7eb6', '#fff4dc'], gc: ['#f4f0ff', '#ffb347', '#ff7eb6', '#8f6bff'] }],
    ['stall', -1.5, F1, { race: 'oggle', word: 'ore', awn: ['#7cf5d6', '#fff4dc'] }],
    ['door', 4.4, F1, { n: 7 }], ['plant', 6.1, F1, {}],
    ['stall', 9.5, F1, { sign: 'SNACKS', w: 2.6, awn: ['#ffd166', '#ff9f43'], goods: 3, gc: ['#9df07a', '#ffd166', '#ff9f43'] }],
    ['crates', 12.3, F1, {}],
    // ---- Main Street east, the Noodle Hole, the Dig Hall, the Skylight
    ['sign', 16.0, F1, { text: 'NOODLES', arrow: 'w', w: 3.0 }], ['plaque', 16.6, F1, { word: 'noodles east' }],
    ['lamp', 28, F1, {}], ['lamp', 38, F1, {}], ['noodle', 33, F1, {}], ['menu', 39.6, F1, {}],
    ['sign', 43.5, F1, { text: 'DIG HALL', arrow: 'e', w: 2.8, race: 'crustling', word: 'dig' }],
    ['banner', 56, F1, { y: 6.3, text: 'THE DIG HALL', race: 'crustling', word: 'dig hall', w: 4.6 }],
    ['lamp', 50, F1, {}], ['lamp', 62, F1, {}], ['rack', 50.6, F1, {}], ['counter', 59, F1, { text: 'GUILD', race: 'crustling', word: 'guild' }],
    ['crates', 64, F1, {}],
    ['sign', 67.6, F1, { text: 'SKYLIGHT', arrow: 'e', w: 2.8, race: 'orbiloon', word: 'sky' }], ['door', 70, F1, { n: 12, col: ['#ff9ec7', '#c25f8a', '#ffe0ee'] }],
    ['chart', 73.6, F1, { y: 2.7 }], ['scope', 78.6, F1, {}], ['lamp', 81.5, F1, {}],
    // ---- Low Street: the Shrine, Echo Gallery, the Quiet Nook
    ['lamp', -52, F2, {}], ['lamp', -60, F2, {}], ['idol', -56, F2, {}],
    ['banner', -56, F2, { y: 7.8, race: 'murk', word: 'elder crumb', w: 3.2, cols: ['#b9a6f2', '#7d6bb8', '#e6dcff'] }],
    ['shroom', -62.6, F2, {}], ['shroom', -49.4, F2, { flip: 1 }],
    ['sign', -46, F2, { text: 'SHRINE', arrow: 'w', w: 2.6, race: 'murk', word: 'shrine' }],
    ['lamp', -40, F2, {}], ['lamp', -25, F2, {}], ['lamp', -10, F2, {}],
    ['banner', -32.5, F2, { y: 4.9, text: 'ECHO GALLERY', race: 'orbiloon', word: 'echo', w: 4.4 }],
    ['portrait', -37, F2, { y: 2.4, k: 0 }], ['portrait', -29, F2, { y: 2.6, k: 1 }], ['portrait', -21, F2, { y: 2.4, k: 2 }], ['portrait', -14.5, F2, { y: 2.6, k: 3 }],
    ['door', 10.4, F2, { n: 3, col: ['#9df07a', '#4f9a3a', '#e0ffd0'] }], ['window', 3.5, F2, { y: 2.3 }],
    ['sign', 13.3, F2, { text: 'CELLAR', arrow: 'up', w: 2.8 }], ['plaque', 14, F2, { word: 'down. obviously.' }],
    ['shelves', 25.8, F2, {}], ['shelves', 36.2, F2, {}], ['lamp', 28.5, F2, {}], ['lamp', 33.5, F2, {}], ['ledSign', 31, F2, { y: 3.2, word: 'archive' }],
    // ---- The Cellar
    ['drape', -12, F3, { w: 9, y: 6.3 }], ['drape', -24, F3, { w: 6, y: 5.5 }],
    ['banner', 3.5, F3, { y: 5.7, text: 'THE CELLAR', race: 'murk', word: 'cellar', w: 3.8, cols: ['#b9a6f2', '#7d6bb8', '#e6dcff'] }],
    ['lamp', 8, F3, {}], ['shroom', -28.6, F3, {}], ['shroom', 14.2, F3, { flip: 1 }],
    ['cushion', -16.5, F3, {}], ['cushion', -6.5, F3, { col: 1 }], ['cushion', 0.8, F3, {}],
    ['sign', -1.2, F3, { lines: ['YOU WEIGH 16%', 'LESS DOWN HERE'], w: 3.6 }],
    ['sign', 11.9, F3, { text: 'EXIT', arrow: 'down', w: 2.2 }], ['plaque', 12.5, F3, { word: 'the old workings. do not.' }],
    // ---- the Old Workings: no lamps, only mushrooms
    ['beam', -34.5, WK, {}], ['drip', -39.5, WK, {}], ['beam', -45.5, WK, {}],
    ['cart', -59.5, 236, {}], ['shroom', -62.4, 236, {}], ['shroom', -50.8, 236, { flip: 1 }], ['pick', -53.8, 236, {}],
  ];
  const LINES = [   // [kind, x0, x1, floor, height above the floor]: drawn along the real curve
    ['pipe', -10, 10, F1, 7.5], ['bunting', -12, -3, F1, 6.3], ['bunting', 3, 12, F1, 6.3],
    ['pipe', 50, 62, F1, 6.2], ['bunting', -23.5, -11.5, F2, 4.8], ['rail', -42.5, -15, WS, 0.95],
  ];

  function rampFloor(q, x) {                                       // floor r of a ramp at x (the carve is linear in angle)
    const ta = thAt(...q.a), tb = thAt(...q.b); let s = (x - q.a[0]) / (q.b[0] - q.a[0]);
    for (let i = 0; i < 4; i++) s = (thAt(x, q.a[1] + s * (q.b[1] - q.a[1])) - ta) / (tb - ta);
    return q.a[1] + s * (q.b[1] - q.a[1]);
  }
  function roofAt(x, r) {                                          // ceiling height over floor r at x
    let h = 0;
    for (const s of STREETS) if (s.r === r && x >= s.x0 && x <= s.x1) h = Math.max(h, s.h);
    for (const q of ROOMS) if (q.r === r && x > q.x0 && x < q.x1) {
      const u = Math.abs(x - (q.x0 + q.x1) / 2) / ((q.x1 - q.x0) / 2); h = Math.max(h, q.h * Math.pow(1 - Math.pow(u, q.p), 1 / q.p));
    }
    return h - 0.15;
  }
  let PLACED = null;
  function floorR(b, x, f) {
    if (f === S_) return SD(x);
    if (typeof f === 'string') return Math.min(SD(x), rampFloor(RAMPS.find((q) => 'ramp:' + q.id === f), x));   // a ramp mouth in the air: you walk on the ground
    return f;
  }
  function placed(b) {                                             // PLACE with floors, ceilings and slopes worked out (once)
    if (PLACED) return PLACED;
    PLACED = PLACE.map(([name, x, f, o]) => {
      const r = floorR(b, x, f), ramp = typeof f === 'string' && f !== S_ && RAMPS.find((q) => 'ramp:' + q.id === f);
      const k = ramp ? (ramp.b[1] - ramp.a[1]) / (ramp.b[0] - ramp.a[0]) : 0;
      const h = o.h || (name === 'drape' ? o.y + 0.1 : ramp ? ramp.h - 0.15 : Math.max(0.5, roofAt(x, r)));
      return { name, x, r, out: f === S_, o: { ...o, x, r, h, k, b } };
    });
    return PLACED;
  }


  // ======================================================================
  //  DRAWING: the town, its lines, the lift, the noon beam, the outposts
  // ======================================================================

  function at(bx, by, th, r, fn) {
    ctx.save(); ctx.translate(bx + r * Math.cos(th), by + r * Math.sin(th)); ctx.rotate(th - Math.PI / 2); fn(); ctx.restore();
  }
  const inView = (v, x, y, R) => x > v[0] - R && x < v[2] + R && y > v[1] - R && y < v[3] + R;
  function outdoor(kit, th) {                                      // kit.LIGHT in a frame rotated to angle th; night when it points below
    const c = Math.cos(th - Math.PI / 2), s = Math.sin(th - Math.PI / 2), [lx, ly] = kit.LIGHT;
    NIGHT = Math.cos(th) * lx + Math.sin(th) * ly < 0.1;
    return [lx * c + ly * s, -lx * s + ly * c];
  }

  function drawWorld(g, kit) {
    if (kit.cam.zoom < 1.2) return;
    ctx = kit.ctx; PX = kit.px(); NOW = g.real; FONT = kit.FONT;
    const view = kit.viewRect(4), far = kit.cam.zoom < 6, b = g.w.byId.mochi;
    setWorld(b);
    if (b && b.ter && b.ter.zone) drawTown(g, kit, b, view, far);
    for (const o of OUTPOSTS) drawOutpost(g, kit, o, view);
  }

  function drawTown(g, kit, b, view, far) {
    const [bx, by] = World.bodyState(g.w, b, g.t), [cx, cy] = floorAt(10, 255);
    if (!inView(view, bx + cx, by + cy, 120)) return;
    const items = placed(b).filter((it) => { const [lx, ly] = floorAt(it.x, it.r); return inView(view, bx + lx, by + ly, 9); });
    const light = (it) => { LT = it.out ? outdoor(kit, thAt(it.x, it.r)) : INDOOR; if (!it.out) NIGHT = false; };
    for (const it of items) if (LIT[it.name]) { light(it); at(bx, by, thAt(it.x, it.r), it.r + DR, () => LIT[it.name](it.o)); }
    noonBeam(g, b, bx, by);
    LT = INDOOR;
    if (!far) {
      for (const ln of LINES) drawLine(b, bx, by, ln);
      for (const it of items) { light(it); it.o.L = M(g).lift; at(bx, by, thAt(it.x, it.r), it.r + DR, () => (still(it) ? stamp(it) : P[it.name](it.o))); }
    }
    drawLift(g, kit, bx, by, far);
  }

  // ---------------- props that never change: painted once per zoom step, then stamped (systems M3) ----------------
  //  Indoors only (the light is fixed there); anything that moves or blinks is painted live every frame.

  const ANIM = new Set(['lamp', 'mapBoard', 'noodle', 'idol', 'drip', 'padMarks', 'kettle', 'derrick', 'shack']);
  const still = (it) => !it.out && !ANIM.has(it.name) && typeof document !== 'undefined';
  let BAKE = { z: 0, map: new Map() };
  function stamp(it) {
    const z = Math.pow(2, Math.ceil(Math.log2(1 / PX) * 4) / 4);   // the zoom, rounded up to a quarter octave [px/m]
    if (BAKE.z !== z) BAKE = { z, map: new Map() };
    if (!BAKE.map.has(it)) BAKE.map.set(it, bake(it, z));
    const k = BAKE.map.get(it);
    if (!k) { P[it.name](it.o); return; }
    ctx.save(); ctx.translate(k.x0, k.y1); ctx.scale(1 / z, -1 / z); ctx.drawImage(k.cv, 0, 0); ctx.restore();
  }
  function paintInto(c, px, fn) {                                  // run a painter on another canvas at another scale
    const c0 = ctx, p0 = PX; ctx = c; PX = px;
    try { fn(); } finally { ctx = c0; PX = p0; }
  }
  function bake(it, z) {
    const S = 8, mw = 192, mh = 128, mx = 12, my = 13, probe = document.createElement('canvas');   // find its box at 8 px/m in -12..12 x -3..13 m
    probe.width = mw; probe.height = mh;
    const pc = probe.getContext('2d'); pc.setTransform(S, 0, 0, -S, mx * S, my * S);
    paintInto(pc, 1 / z, () => P[it.name](it.o));
    const a = pc.getImageData(0, 0, mw, mh).data; let u0 = mw, u1 = -1, v0 = mh, v1 = -1;
    for (let v = 0; v < mh; v++) for (let u = 0; u < mw; u++) if (a[(v * mw + u) * 4 + 3]) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    if (u1 < 0 || u0 === 0 || v0 === 0 || u1 === mw - 1 || v1 === mh - 1) return null;   // empty, or bigger than the probe: paint it live
    const x0 = u0 / S - mx - 0.4, x1 = (u1 + 1) / S - mx + 0.4, y1 = my - v0 / S + 0.4, y0 = my - (v1 + 1) / S - 0.4;
    const w = Math.ceil((x1 - x0) * z), h = Math.ceil((y1 - y0) * z);
    if (w * h > 1600 * 1600) return null;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); c.setTransform(z, 0, 0, -z, -x0 * z, y1 * z);
    paintInto(c, 1 / z, () => P[it.name](it.o));
    return { cv, x0, y1 };
  }

  function drawLine(b, bx, by, [kind, x0, x1, f, y]) {
    const pts = [], up = [], n = Math.ceil(x1 - x0);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, sag = kind === 'bunting' ? 0.5 * (1 - Math.pow(2 * i / n - 1, 2)) : 0, r = floorR(b, x, f) + y - sag, th = thAt(x, r);
      pts.push([bx + (r + DR) * Math.cos(th), by + (r + DR) * Math.sin(th)]); up.push([Math.cos(th), Math.sin(th)]);
    }
    if (kind === 'pipe') { rod(pts, 0.32, '#b9a6f2'); line(pts.map(([x, y2], i) => [x + up[i][0] * 0.08, y2 + up[i][1] * 0.08]), 0.07, 'rgba(255,255,255,0.55)'); }
    if (kind === 'rail') {
      for (let i = 0; i <= n; i += 3) line([pts[i], [pts[i][0] - up[i][0] * y, pts[i][1] - up[i][1] * y]], 0.07 + 3 * PX);
      rod(pts, 0.08, '#d9a066');
    }
    if (kind === 'bunting') {
      line(pts, 1.5 * PX);
      const COLS = ['#ff7eb6', '#ffd166', '#7cf5d6', '#b9a6f2', '#ff9f43'];
      for (let i = 0; i < n; i++) {
        const [px0, py0] = pts[i], [px1, py1] = pts[i + 1], mx = (px0 + px1) / 2, my = (py0 + py1) / 2, [ux, uy] = up[i];
        poly([[px0 + (px1 - px0) * 0.2, py0 + (py1 - py0) * 0.2], [px0 + (px1 - px0) * 0.8, py0 + (py1 - py0) * 0.8], [mx - ux * 0.45, my - uy * 0.45]]);
        ctx.fillStyle = COLS[i % COLS.length]; ctx.fill(); ink(1.5);
      }
    }
  }

  function drawLift(g, kit, bx, by, far) {
    const L = M(g).lift, th = LIFT.th;
    LT = outdoor(kit, th);
    at(bx, by, th, TOP + DR, () => P.liftHouse({ here: L.v === 0 && L.r === TOP }));
    LT = INDOOR;
    if (L.q !== null) at(bx, by, th, L.q + DR, () => P.cage({ far, top: ROOF - L.q }));
    if (far) return;
    LIFT.stops.forEach((s, i) => { if (L.gates[s.r]) at(bx, by, th, s.r + DR, () => P.shutter({ n: i + 1, top: i === 0 })); });
  }

  function noon(g) {                                               // 0..1: Ember straight down the skyhole, about ±110 s a day
    const b = g.w.byId.mochi; if (!b) return 0;
    const [bx, by] = World.bodyState(g.w, b, g.t);
    return Math.max(0, 1 - Math.abs(dth(Math.atan2(-by, -bx), SHAFTS[1].th)) / 0.106);
  }
  function noonBeam(g, b, bx, by) {
    const q = SHAFTS[1], k = noon(g);
    if (!k) return;
    at(bx, by, q.th, F1 + DR, () => {
      const gr = ctx.createLinearGradient(0, 18, 0, 0); gr.addColorStop(0, `rgba(255,236,160,${0.5 * k})`); gr.addColorStop(1, `rgba(255,214,120,${0.25 * k})`);
      poly([[-1.5, 18], [1.5, 18], [2.4, 0], [-2.4, 0]]); ctx.fillStyle = gr; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0.05, 2.6, 0.3, 0, 0, 7); ctx.fillStyle = `rgba(255,240,180,${0.6 * k})`; ctx.fill();
      for (let i = 0; i < 9; i++) { const y = (i * 2.1 + NOW * 0.3) % 17, x = Math.sin(i * 7.3 + NOW * 0.4) * 1.4; ctx.beginPath(); ctx.arc(x, y, 0.05, 0, 7); ctx.fillStyle = `rgba(255,255,230,${k})`; ctx.fill(); }
    });
  }

  function drawOutpost(g, kit, o, view) {
    const b = g.w.byId[o.body]; if (!b || !b.ter || !b.ter.plinths || !b.ter.plinths[o.id]) return;
    const [bx, by] = World.bodyState(g.w, b, g.t), rp = b.ter.plinths[o.id].rp, Lo = LAYOUT[o.id];
    if (!inView(view, bx + rp * Math.cos(o.th), by + rp * Math.sin(o.th), o.w)) return;
    LT = outdoor(kit, o.th);
    const put = (name, x, opt) => at(bx, by, o.th - x / rp, rp, () => P[name](opt));
    const lit = (name, x, opt) => at(bx, by, o.th - x / rp, rp, () => LIT[name](opt));
    const rgb = [1, 3, 5].map((i) => parseInt(o.col.slice(i, i + 2), 16)).join(',');
    const dome = { R: Lo.R, counter: Lo.counter - Lo.dome, sign: Lo.sign, name: ST[o.id].name, col: o.col, rgb, kettle: Lo.kettle, neon: Lo.neon };
    lit('padMarks', 0, { hw: Lo.pad }); lit('dome', Lo.dome, dome);
    for (const [name, x, opt] of Lo.biz) if (LIT[name]) lit(name, x, opt);
    for (const [name, x, opt] of Lo.biz) put(name, x, opt);
    put('dome', Lo.dome, dome); put('padMarks', 0, { hw: Lo.pad });
  }


  // ======================================================================
  //  MAP (board and overlay) and HUD (zone pill, lift panel)
  // ======================================================================

  let SHAPES = null;
  function shapes() {                                              // every zone as a polygon in (x, r)
    if (SHAPES) return SHAPES;
    const out = [], add = (z, kind, pts) => out.push({ id: z.id, name: z.name, air: !!z.air, kind, pts, z });
    for (const c of CAVES) { const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * 2 * Math.PI; pts.push([c.x + c.rx * Math.cos(a), c.r + c.ry * Math.sin(a)]); } add({ id: 'workings', name: 'Old Workings' }, 'cave', pts); }
    for (const q of RAMPS) add(q, 'ramp', [q.a, q.b, [q.b[0], q.b[1] + q.h], [q.a[0], q.a[1] + q.h]]);
    for (const q of SHAFTS) { const x0 = xAt(q.th, q.r0), x1 = xAt(q.th, q.r1); add(q, 'shaft', [[x0 - q.w / 2, q.r0], [x0 + q.w / 2, q.r0], [x1 + q.w / 2, q.r1], [x1 - q.w / 2, q.r1]]); }
    for (const s of STREETS) add(s, 'street', [[s.x0, s.r], [s.x1, s.r], [s.x1, s.r + s.h], [s.x0, s.r + s.h]]);
    for (const q of ROOMS) {
      const xc = (q.x0 + q.x1) / 2, hw = (q.x1 - q.x0) / 2, pts = [];
      for (let i = 0; i <= 20; i++) { const u = -1 + i / 10; pts.push([xc + u * hw, q.r + q.h * Math.pow(1 - Math.pow(Math.abs(u), q.p), 1 / q.p)]); }
      add(q, 'room', pts);
    }
    return (SHAPES = out);
  }
  function mapPaint(b, X, Y, lw, L) {                              // the town's cross-section through X(x), Y(r)
    const path = (pts) => { ctx.beginPath(); pts.forEach(([x, r], i) => (i ? ctx.lineTo(X(x), Y(r)) : ctx.moveTo(X(x), Y(r)))); ctx.closePath(); };
    ctx.beginPath(); ctx.moveTo(X(-72), Y(204));
    for (let x = -72; x <= 92; x += 4) ctx.lineTo(X(x), Y(SD(x)));
    ctx.lineTo(X(92), Y(204)); ctx.closePath(); ctx.fillStyle = '#8a7aa8'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    for (const s of shapes()) { path(s.pts); ctx.lineWidth = 3 * lw; ctx.stroke(); }
    for (const s of shapes()) { path(s.pts); ctx.fillStyle = s.kind === 'cave' ? '#3b3566' : s.air ? '#ffe2a8' : '#cfc8ec'; ctx.fill(); }
    if (L && L.q !== null) { const x = xAt(LIFT.th, L.q); ctx.fillStyle = '#ffd166'; ctx.fillRect(X(x - 1.8), Y(L.q + 2.5), X(x + 1.8) - X(x - 1.8), Y(L.q) - Y(L.q + 2.5)); }
  }

  function drawMap(g, kit, a) {
    const c = kit.ctx, W = kit.W, H = kit.H, w = Math.min(W - 80, 880), h = Math.min(H - 230, w * 0.62), x0 = (W - w) / 2, y0 = 62;
    const top = kit.comicPanel(x0, y0, w, h, 'DOWNTOWN · THE MAP');
    const s = Math.min((w - 40) / 166, (h - (top - y0) - 36) / 100), cxm = W / 2, cym = (top + y0 + h - 26) / 2;
    const X = (x) => cxm + (x - 10) * s, Y = (r) => cym - (r - 254) * s;
    ctx = c; PX = 1; c.save(); mapPaint(g.w.byId.mochi, X, Y, 1, M(g).lift); c.restore();
    c.textAlign = 'center'; c.font = `600 ${Math.max(10, Math.min(13, s * 3.2))}px ${kit.FONT}`; c.fillStyle = kit.INK;
    for (const q of ROOMS) c.fillText(q.name.replace(/^The /, ''), X((q.x0 + q.x1) / 2), Y(q.r + Math.min(q.h * 0.55, 3.2)) + 4);
    for (const st of STREETS) c.fillText(st.name, X(st.id === 'main' ? 43.5 : st.id === 'low' ? 1 : -22), Y(st.r + 1.4) + 4);
    c.fillText('West Stair', X(-30), Y(294.5));
    LIFT.stops.forEach((st, i) => {
      const x = X(xAt(LIFT.th, st.r) + 3.6), y = Y(st.r + 1.2);
      c.fillStyle = '#8ff0b0'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); c.strokeStyle = kit.INK; c.lineWidth = 2; c.stroke();
      c.fillStyle = kit.INK; c.font = `700 12px ${kit.FONT}`; c.fillText(String(i + 1), x, y + 4);
    });
    c.font = `600 12px ${kit.FONT}`; c.fillStyle = kit.INK; c.fillText('PAD', X(0), Y(SD(0) + 3));
    const p = 0.5 + 0.5 * Math.sin(g.real * 6), yx = X(a.x), yy = Y(a.feet + 0.9);
    c.fillStyle = 'rgba(255,59,59,0.3)'; c.beginPath(); c.arc(yx, yy, 8 + 8 * p, 0, 7); c.fill();
    c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(yx, yy, 6, 0, 7); c.fill(); c.strokeStyle = kit.INK; c.lineWidth = 2; c.stroke();
    c.font = `700 13px ${kit.FONT}`; kit.outlinedText('YOU ARE HERE', yx, yy - 14, '#ff9e9e', 4);
    c.font = `500 12.5px ${kit.FONT}`; c.fillStyle = kit.COL.dim;
    c.fillText('cream: air   ·   lilac: no air   ·   1-4: Clunk Lift stops   ·   walk or F to close', W / 2, y0 + h - 12);
  }

  function drawHUD(g, kit) {
    const m = M(g), a = astroAt(g); if (!a) return;
    const c = kit.ctx;
    if (a.z) {
      const t = `${a.z.name} · ${a.z.air ? 'air: refills your suit' : 'NO AIR'}`;
      c.font = `600 15px ${kit.FONT}`; const w = c.measureText(t).width + 28, x = kit.W / 2 - w / 2, y = 40;
      c.fillStyle = kit.INK; kit.roundRect(x + 3, y + 3, w, 26, 13); c.fill();
      c.fillStyle = a.z.air ? '#8ff0b0' : '#ff8a80'; kit.roundRect(x, y, w, 26, 13); c.fill(); c.strokeStyle = kit.INK; c.lineWidth = 2.5; c.stroke();
      c.fillStyle = kit.INK; c.textAlign = 'center'; c.fillText(t, kit.W / 2, y + 18);
    }
    if (onDeck(g) || landingNear(g, 5)) liftPanel(g, kit, m.lift);
    if (m.map) drawMap(g, kit, a);
  }
  function liftPanel(g, kit, L) {
    const c = kit.ctx, w = 196, y = kit.stackRight(w, 4 * 21 + 38, 'CLUNK LIFT'), x = kit.W - w - 12 + 14, here = L.v === 0 ? stopOf(L.r) : null;
    LIFT.stops.forEach((s, i) => {
      const yy = y + i * 21;
      if (here === s) { c.fillStyle = '#8ff0b0'; kit.roundRect(x - 7, yy - 15, w - 14, 20, 6); c.fill(); }
      c.globalAlpha = L.v !== 0 && s.r === L.target && (g.real % 0.8) < 0.4 ? 0.3 : 1;
      c.font = `600 14px ${kit.FONT}`; c.fillStyle = kit.INK; c.textAlign = 'left'; c.fillText(`${i + 1}   ${s.name}`, x, yy);
      c.globalAlpha = 1;
    });
    c.font = `500 13px ${kit.FONT}`; c.fillStyle = kit.COL.dim;
    c.fillText(L.v ? `${L.v < 0 ? '▼' : '▲'} ${Math.abs(L.v).toFixed(1)} m/s` : onDeck(g) ? 'on the deck: press 1-4' : 'parked', x, y + 4 * 21 + 1);
  }


  // ======================================================================
  //  REGISTER (only reached when the module is active: ?mods= without mochi keeps v3 Mochi)
  // ======================================================================

  Object.assign(mod, { init, load, save, ready, step, frame, interactions, navTargets, hint, onKey, drawWorld, drawHUD });
  Terrain.addCarver('mochi', carveTown);
  for (const o of OUTPOSTS) Terrain.addCarver(o.body, (T, b) => plinth(T, b, o));
  Game.addSpawn('tunnels', 'Downtown (the Pantry)', placeTunnels);
  Game.addGoals([{ id: 'downtown', order: 34, reward: 75, text: 'Ride the Clunk Lift down to the Cellar', test: inCellar }]);

  return { spots, airAt, nearestAir, zoneAt, outposts, noon, PAD_ID, PAD_NEAR, padAt, TOWN: { F1, F2, F3, get TOP() { return TOP; }, get ROOF() { return ROOF; }, get DR() { return DR; }, surface: (x) => SD(x), LIFT, STREETS, ROOMS, RAMPS, SHAFTS, CAVES, OUTPOSTS, thAt, xAt, floorAt }, ST };
})();

if (typeof module !== 'undefined') module.exports = Mochi;
