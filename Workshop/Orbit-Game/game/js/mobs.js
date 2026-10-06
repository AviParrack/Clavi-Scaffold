// ======================================================================
//  MOBS  —  space bugs.  Munchers on Kiwi, Tater Tanks (armoured rock
//  beetles) on Big Potato, a couple of Nacho Nibblers on Dorito.
//  Lazy: a body's bugs wake when you come within 200 m of its surface and
//  go home to their nests when you leave.  They crawl in the body frame
//  (own gravity + tides, from World.gravity), grip the dig grid, hop at
//  the astronaut on honest ballistic arcs, bite, and pop into jelly.
//  API: Mobs.list(g), Mobs.wake(g, bodyId), Mobs.sleep(g, bodyId),
//       Mobs.spawn(g, bodyId, th, opt), Mobs.home(g, bodyId)
// ======================================================================

const Mobs = (() => {

  // ---------------- tuning ----------------

  const WAKE_ALT = 200, SLEEP_ALT = 260;   // a body's bugs wake / sleep at this distance from its surface [m]
  const RECALL = 150, LOW_ALT = 60;        // while you are this low, wanderers this far from you go home [m]
  const EMERGE_R = 110;                    // nests this close to you send out new bugs [m]
  const EMERGE_GAP = 3, EMERGE_T = 0.5;    // seconds between nest pops / length of the pop-out
  const REGEN = 240;                       // seconds for a nest to grow one bug
  const ROAM = 14;                         // wander this far (arc) from home [m]
  const SUB = 0.02, MAX_SUB = 120;         // physics substep [s] (a 64x frame is ~54 of them)
  const CHUNK = 1.2;                       // at bigger warps a frame is split into chunks this long [s], each with its own think
  const SKIN = 0.12, VMAX = 16;            // ground contact skin [m], speed cap [m/s]
  const HINT_R = 20, ENGAGE_R = 25;        // hint / warp cap when bugs are this close [m]
  const CHEW_GAP = 5, BORED = 40;          // ship chewing: seconds between nibbles, sulk after a PTOOEY
  const ART = 1.2, MIN_PX = 7, NEST_PX = 16;  // bugs drawn 1.2x their hitbox; min on-screen bug radius / nest width [px]
  const BUG_ZOOM = 0.6, NEST_ZOOM = 1.1;   // below this zoom [px/m] bugs / nests are not drawn
  const JELLY = '#9df07a', INK = '#1b1433';
  let on = false;


  // ---------------- species ----------------

  const SPECIES = {
    muncher: {
      name: 'Muncher', plural: 'munchers', r: 0.45, hp: 18, crawl: 1.0, run: 1.9, hop: 5.2, hopCd: [2.2, 4], squash: 0.45,
      grip: 2.6, trac: 6, bite: 8, biteCd: 1.5, chew: 2, jelly: [1, 2], kb: 1, notice: 18,
      cols: ['#8fe36b', '#4f9c3a', '#e2ffc8'], spot: '#5fae45',
      names: ['Pip', 'Bean', 'Nibs', 'Sprout', 'Pickle', 'Moss', 'Basil', 'Lima', 'Mochi', 'Fuzz', 'Kevin', 'Dot', 'Gus',
              'Pea', 'Olive', 'Brussels', 'Gherkin', 'Wasabi', 'Edamame', 'Lettuce', 'Kale Sagan'],
    },
    beetle: {
      name: 'Tater Tank', plural: 'Tater Tanks', r: 0.75, hp: 54, crawl: 0.7, run: 1.45, hop: 4.3, hopCd: [3.5, 6], squash: 0.65,
      grip: 1.8, trac: 4, bite: 10, biteCd: 1.8, chew: 3, jelly: [2, 3], kb: 0.4, notice: 16, armor: { bullet: 0.4, bump: 0.5 },
      cols: ['#b9946b', '#735437', '#ecd2ae'], head: ['#6e5a7e', '#43345a', '#a596b8'], spot: '#dcc09a',
      names: ['Gerald', 'Russet', 'Yukon', 'Mash', 'Spud', 'Hash', 'Duchess', 'Rösti', 'Gnocchi', 'Tot', 'Wedge', 'Lord Fries'],
    },
    nacho: {
      name: 'Nacho Nibbler', plural: 'Nacho Nibblers', r: 0.5, hp: 22, crawl: 1.1, run: 2.0, hop: 5, hopCd: [2.5, 4.5], squash: 0.45,
      grip: 2.4, trac: 6, bite: 7, biteCd: 1.5, chew: 2, jelly: [1, 2], kb: 0.9, notice: 18,
      cols: ['#f7a83e', '#c0641d', '#ffe3a3'], spot: '#d2401f',
      names: ['Salsa', 'Queso', 'Chip', 'Guac', 'Jalapeño', 'Crunch', 'Cool Ranch'],
    },
  };
  const GOLD = { name: 'Golden Muncher', hp: 24, run: 2.6, jelly: [4, 5], cols: ['#ffd84d', '#c4910f', '#fff8cc'], spot: '#e8b82a' };

  const HOMES = {
    kiwi:   { sp: 'muncher', nests: 6, stock: 3, cap: 8, gold: 0.04, nest: { w: 2.6, h: 1.0, cols: ['#86b35a', '#4d7334', '#cdeea0'], grass: '#5f9a3c' } },
    potato: { sp: 'beetle',  nests: 3, stock: 2, cap: 5, gold: 0,    nest: { w: 3.4, h: 1.25, cols: ['#a88563', '#6c5137', '#dcc09c'], grass: null } },
    dorito: { sp: 'nacho',   nests: 1, stock: 2, cap: 2, gold: 0,    nest: { w: 2.6, h: 1.0, cols: ['#e09a4f', '#9c5a2c', '#ffcf8f'], grass: null } },
  };
  const MILESTONES = { 10: 'PEST CONTROL: 10 BUGS SQUISHED', 50: 'THE BUGS WHISPER YOUR NAME', 100: 'THE BUGS HAVE FORMED A SUPPORT GROUP' };

  const specOf = (bug) => (bug.gold ? { ...SPECIES[bug.sp], ...GOLD } : SPECIES[bug.sp]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapPi = (a) => ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;


  // ---------------- state ----------------

  function init(g) {
    const M = g.mod.mobs = { homes: {}, bugs: [], n: 0, kills: 0, splats: [], rand: World.rng(g.w.seed * 31 + 5),
                             engaged: false, nearAstro: 0, chewing: false, goldNear: false, nearAny: 0 };
    for (const id in HOMES) if (g.w.byId[id]) M.homes[id] = makeHome(g, g.w.byId[id], HOMES[id]);
  }

  function makeHome(g, b, def) {
    const rand = World.rng(g.w.seed * 7919 + (b.tidx ?? b.idx) * 104729 + 17), nests = [];
    for (let k = 0; k < def.nests; k++) {
      const th = (k + 0.15 + 0.7 * rand()) / def.nests * 2 * Math.PI, R = World.surfaceR(b, th), [ux, uy] = surfNormal(b, th);
      const lx = R * Math.cos(th), ly = R * Math.sin(th);
      nests.push({ k, th, lx, ly, gx: lx, gy: ly, ux, uy, stock: def.stock, max: def.stock, out: 0, regen: 0, gone: false });
    }
    return { id: b.id, b, def, sp: def.sp, cap: def.cap, nests, awake: false, emergeT: 0, bx: 0, by: 0, bvx: 0, bvy: 0 };
  }

  function surfNormal(b, th) {
    const e = 0.01, r1 = World.surfaceR(b, th - e), r2 = World.surfaceR(b, th + e);
    const tx = r2 * Math.cos(th + e) - r1 * Math.cos(th - e), ty = r2 * Math.sin(th + e) - r1 * Math.sin(th - e), n = Math.hypot(tx, ty) || 1;
    return [ty / n, -tx / n];
  }

  function save(g) {
    const M = g.mod.mobs; if (!M) return undefined;
    const nests = {};
    for (const id in M.homes) nests[id] = M.homes[id].nests.map((n) => (n.gone ? -1 : Math.min(n.max, n.stock + n.out)));
    return { kills: M.kills, n: M.n, nests };
  }

  function load(g, d) {
    const M = g.mod.mobs; if (!M || !d) return;
    M.kills = d.kills | 0; M.n = d.n | 0;
    for (const id in d.nests || {}) {
      const H = M.homes[id]; if (!H || !Array.isArray(d.nests[id])) continue;
      d.nests[id].forEach((v, k) => { const n = H.nests[k]; if (!n) return; if (v < 0) n.gone = true; else n.stock = clamp(v | 0, 0, n.max); });
    }
  }

  const bugsOf = (M, H) => M.bugs.filter((bug) => bug.home === H.id && !bug.dead);


  // ---------------- wake / sleep / spawn ----------------

  function wake(g, H, near) {
    const M = g.mod.mobs; H.awake = true; H.emergeT = EMERGE_GAP;
    settle(H);
    const order = H.nests.filter((n) => !n.gone).sort((a, b) => dist2(a, near) - dist2(b, near));
    let made = 0, any = true;
    while (any && bugsOf(M, H).length < H.cap) {
      any = false;
      for (const nest of order) {
        if (nest.stock <= 0 || bugsOf(M, H).length >= H.cap) continue;
        const th = nest.th + (M.rand() - 0.5) * 1.6 * ROAM / H.b.R;
        if (spawnBug(g, H, nest, th, {})) { made++; any = true; }
      }
    }
    Game.log(g, `${H.b.name}: ${made} ${SPECIES[H.sp].plural} wake up${made ? ' and smell snacks' : ''}`);
  }
  const dist2 = (n, p) => (p ? (n.lx - p[0]) ** 2 + (n.ly - p[1]) ** 2 : n.k);

  // pin each nest to the dig grid under its outline point (once: digging later must not move it)
  function settle(H) {
    const T = Terrain.of(H.b);
    for (const n of H.nests) if (!n.settled) { const p = groundAt(T, H.b, n.th, 0); if (p) { n.gx = p[0]; n.gy = p[1]; } n.settled = true; }
  }

  function sleep(g, H) {
    const M = g.mod.mobs;
    for (const bug of bugsOf(M, H)) goHome(M, H, bug);
    H.awake = false;
    Game.log(g, `${H.b.name}: the ${SPECIES[H.sp].plural} go back to bed`);
  }

  function goHome(M, H, bug) {
    const nest = H.nests[bug.nest];
    if (nest) { nest.out = Math.max(0, nest.out - 1); if (!nest.gone) nest.stock = Math.min(nest.max, nest.stock + 1); }
    bug.dead = true;
    M.bugs = M.bugs.filter((b) => !b.dead);
  }

  // th: polar angle to drop the bug at (scatter), or null to pop it out of the nest hole
  function spawnBug(g, H, nest, th, opt) {
    const M = g.mod.mobs, sp = SPECIES[H.sp], T = Terrain.of(H.b);
    const gold = opt.gold != null ? opt.gold : M.rand() < H.def.gold;
    let lx, ly, vx = 0, vy = 0, emerge = 0;
    if (th == null) {
      lx = nest.gx + nest.ux * 0.5; ly = nest.gy + nest.uy * 0.5;
      const side = M.rand() < 0.5 ? -1 : 1;
      vx = nest.ux * 2.2 - nest.uy * side * 0.9; vy = nest.uy * 2.2 + nest.ux * side * 0.9; emerge = EMERGE_T;
    } else {
      const p = groundAt(T, H.b, th, sp.r + 0.15); if (!p) return null;
      [lx, ly] = p;
    }
    const names = sp.names, n = ++M.n;
    const bug = {
      n, id: 'bug:' + n, sp: H.sp, gold, home: H.id, nest: nest ? nest.k : -1, b: H.b,
      name: gold ? 'Goldie' : names[Math.floor(M.rand() * names.length)],
      lx, ly, vx, vy, ua: Math.atan2(ly, lx), face: M.rand() < 0.5 ? -1 : 1, dir: 0, ground: false, nx: 0, ny: 1,
      hp: gold ? GOLD.hp : sp.hp, r: sp.r, mode: 'wander', tgt: null, think: M.rand() * 2, hopCd: 1 + M.rand() * 2, biteCd: 0, chewCd: 0,
      squash: 0, air: emerge ? 0.15 : 0, anger: 0, bored: 0, phase: M.rand() * 6, flash: 0, chomp: 0, alert: 0, emerge, seed: M.rand() * 100,
      stuck: 0, sx: lx, sy: ly, look: [1, 0], dead: false,
    };
    bug.hpMax = bug.hp;
    if (nest) { nest.stock = Math.max(0, nest.stock - 1); nest.out++; }
    M.bugs.push(bug);
    return bug;
  }

  // first solid point straight down at polar angle th, lifted by `lift` -> [lx, ly] or null
  function groundAt(T, b, th, lift) {
    const c = Math.cos(th), s = Math.sin(th), R = World.surfaceR(b, th) + 6;
    const hit = Terrain.raycast(T, R * c, R * s, -c, -s, 60);
    return hit ? [hit.lx + c * lift, hit.ly + s * lift] : null;
  }


  // ---------------- per frame ----------------

  function after(g, inp, dt, simDt) {
    const M = g.mod.mobs; if (!M) return;
    for (const bug of M.bugs) { bug.flash = Math.max(0, bug.flash - dt * 6); bug.chomp = Math.max(0, bug.chomp - dt); bug.alert = Math.max(0, bug.alert - dt); }
    if (!simDt) return;
    M.engaged = false; M.nearAstro = 0; M.chewing = false; M.goldNear = false; M.nearAny = 0;
    const obs = observers(g);
    const k = Math.min(64, Math.ceil(simDt / CHUNK - 1e-9));                // big warps: think again every CHUNK of sim time
    for (const id in M.homes) for (let i = 0; i < k; i++) tickHome(g, M, M.homes[id], obs, simDt / k, Math.ceil(MAX_SUB / k));   // same substep budget per frame
    M.splats = M.splats.filter((s) => g.real - s.t0 < 25);
  }

  function observers(g) {
    const out = [];
    if (g.sh) out.push([g.sh.x, g.sh.y]);
    if (g.astro.on) out.push([g.astro.x, g.astro.y]);
    return out;
  }

  function tickHome(g, M, H, obs, dt, maxSub = MAX_SUB) {
    const s = World.bodyState(g.w, H.b, g.t);
    H.bx = s[0]; H.by = s[1]; H.bvx = s[2]; H.bvy = s[3];
    let alt = Infinity, near = null;
    const local = obs.map(([x, y]) => [x - H.bx, y - H.by]);
    for (const p of local) {
      const a = Math.hypot(p[0], p[1]) - World.surfaceR(H.b, Math.atan2(p[1], p[0]));
      if (a < alt) { alt = a; near = p; }
    }
    regrow(H, dt);
    if (!H.awake && alt < WAKE_ALT) wake(g, H, near);
    else if (H.awake && alt > SLEEP_ALT) sleep(g, H);
    if (!H.awake) return;

    checkNests(g, M, H);
    const bugs = bugsOf(M, H), T = Terrain.of(H.b);
    for (const bug of bugs) think(g, M, H, bug, dt);
    const n = Math.min(maxSub, Math.max(1, Math.ceil(dt / SUB - 1e-9))), h = dt / n;
    for (const bug of bugs) for (let i = 0; i < n; i++) stepBug(g, bug, T, h);
    separate(bugs);
    for (const bug of bugs) { touch(g, M, H, bug); sanity(g, M, H, bug, alt < LOW_ALT ? local : null); }
    emerge(g, M, H, local, dt);
  }

  function regrow(H, dt) {
    for (const n of H.nests) {
      if (n.gone || n.stock + n.out >= n.max) { n.regen = 0; continue; }
      n.regen += dt;
      if (n.regen >= REGEN) { n.regen = 0; n.stock++; }
    }
  }

  function emerge(g, M, H, local, dt) {
    H.emergeT -= dt;
    if (H.emergeT > 0 || bugsOf(M, H).length >= H.cap) return;
    H.emergeT = EMERGE_GAP;
    let best = null, bd = EMERGE_R;
    for (const n of H.nests) {
      if (n.gone || n.stock <= 0) continue;
      for (const p of local) { const d = Math.hypot(n.lx - p[0], n.ly - p[1]); if (d < bd) { bd = d; best = n; } }
    }
    if (best && spawnBug(g, H, best, null, {})) Game.burst(g, 'dust', H.bx + best.lx, H.by + best.ly, 6, { vx: H.bvx, vy: H.bvy, speed: 1.5, col: H.def.nest.cols[1] });
  }

  // a nest whose ground is dug out from under it collapses for good
  function checkNests(g, M, H) {
    const T = Terrain.of(H.b);
    for (const n of H.nests) {
      if (n.gone) continue;
      const d = Math.hypot(n.gx, n.gy) || 1, rx = n.gx / d, ry = n.gy / d;
      if (Terrain.solid(T, n.gx - rx * 0.6, n.gy - ry * 0.6) || Terrain.solid(T, n.gx - rx * 1.3, n.gy - ry * 1.3)) continue;
      n.gone = true; n.stock = 0;
      const x = H.bx + n.lx, y = H.by + n.ly;
      Game.popup(g, 'NEST COLLAPSED!', '#ffd166', x, y, 24);
      Game.burst(g, 'dust', x, y, 18, { vx: H.bvx, vy: H.bvy, speed: 3, col: H.def.nest.cols[1] });
      for (let i = 0; i < 2; i++) dropJelly(g, M, x, y, H, n.ux, n.uy);
      Game.log(g, `${H.b.name}: a ${SPECIES[H.sp].name.toLowerCase()} nest collapsed (dug out)`);
    }
  }

  // bugs knocked into space or broken by NaN go away quietly; far wanderers go home (local: you, when you are low)
  function sanity(g, M, H, bug, local) {
    if (bug.dead) return;
    const d = Math.hypot(bug.lx, bug.ly);
    if (!isFinite(bug.lx + bug.ly + bug.vx + bug.vy) || d > H.b.R * (1 + H.b.shape) + 40) {
      Game.log(g, `${H.b.name}: ${bug.name} the ${specOf(bug).name.toLowerCase()} drifted off into space`);
      const nest = H.nests[bug.nest]; if (nest) nest.out = Math.max(0, nest.out - 1);
      bug.dead = true; M.bugs = M.bugs.filter((b) => !b.dead);
      return;
    }
    if (local && bug.mode === 'wander' && local.every((p) => Math.hypot(p[0] - bug.lx, p[1] - bug.ly) > RECALL)) goHome(M, H, bug);
  }


  // ---------------- AI ----------------

  function think(g, M, H, bug, dt) {
    const sp = specOf(bug), A = g.astro;
    for (const k of ['hopCd', 'biteCd', 'chewCd', 'anger', 'bored', 'think']) bug[k] -= dt;
    bug.emerge = Math.max(0, bug.emerge - dt);

    // -------- who to bother: the astronaut first, else a landed ship --------
    let tgt = null, tx = 0, ty = 0, td = Infinity, near = Infinity;
    if (A.on && A.hp > 0) {
      const ax = A.x - H.bx, ay = A.y - H.by, d = Math.hypot(ax - bug.lx, ay - bug.ly);
      const keen = bug.anger > 0 ? 35 : bug.tgt === 'astro' ? 30 : sp.notice;
      if (d < keen) { tgt = 'astro'; tx = ax; ty = ay; td = d; }
      if (d < HINT_R) { M.nearAstro++; if (bug.gold) M.goldNear = true; }
      near = d;
    }
    if (g.status !== 'dead') {
      const sx = g.sh.x - H.bx, sy = g.sh.y - H.by, d = Math.hypot(sx - bug.lx, sy - bug.ly);
      near = Math.min(near, d);
      if (!tgt && g.status === 'landed' && g.landedOn === H.b && bug.bored <= 0 && d < (bug.tgt === 'ship' ? 24 : 16)) { tgt = 'ship'; tx = sx; ty = sy; td = d; }
    }
    const flee = bug.gold && tgt === 'astro' && td < 14;
    const mode = flee ? 'flee' : tgt ? 'chase' : 'wander';
    if (mode !== 'wander' && bug.mode === 'wander') bug.alert = 0.9;
    bug.mode = mode; bug.tgt = tgt;
    if (tgt && td < ENGAGE_R) M.engaged = true;
    if (tgt === 'ship' && td < 10) M.chewing = true;
    if (near < 40) M.nearAny++;
    if (tgt) bug.look = [tx - bug.lx, ty - bug.ly];

    // -------- telegraphed hop: squash, then launch --------
    if (bug.squash > 0) {
      bug.dir = 0; bug.squash -= dt;
      if (bug.squash <= 0) launch(g, H, bug, sp, tgt === 'astro' ? [tx, ty] : null, flee);
      return;
    }

    const [tnx, tny] = tangent(bug);
    if (mode === 'wander') { wander(M, H, bug, tnx, tny, dt); return; }
    const along = (tx - bug.lx) * tnx + (ty - bug.ly) * tny;
    bug.dir = Math.abs(along) < 0.3 ? 0 : Math.sign(along) * (flee ? -1 : 1);
    if (bug.dir) bug.face = -bug.dir;
    const hopRange = tgt === 'astro' && td > 1.6 && td < 13 && (td > 4 || Math.abs(along) < 0.6);
    if (bug.ground && bug.hopCd <= 0 && bug.emerge <= 0 && (hopRange || (flee && td < 6))) {
      bug.squash = sp.squash; bug.hopCd = sp.hopCd[0] + (sp.hopCd[1] - sp.hopCd[0]) * M.rand();
    }
  }

  // tangent along the ground (or along the local horizon in the air); dir +1 walks this way
  function tangent(bug) {
    if (bug.ground) return [-bug.ny, bug.nx];
    const d = Math.hypot(bug.lx, bug.ly) || 1;
    return [-bug.ly / d, bug.lx / d];
  }

  function wander(M, H, bug, tnx, tny, dt) {
    const nest = H.nests[bug.nest], arc = nest ? Math.abs(wrapPi(Math.atan2(bug.ly, bug.lx) - nest.th)) * H.b.R : 0;
    if (nest && arc > ROAM) {
      const along = (nest.lx - bug.lx) * tnx + (nest.ly - bug.ly) * tny;
      bug.dir = Math.sign(along) || 1;
    } else if (bug.think <= 0) {
      bug.think = 1.5 + M.rand() * 3;
      bug.dir = M.rand() < 0.3 ? 0 : (M.rand() < 0.5 ? -1 : 1);
    }
    // stuck against a wall for a while: turn around
    if (bug.dir && Math.hypot(bug.lx - bug.sx, bug.ly - bug.sy) < 0.3) {
      if ((bug.stuck += dt) > 2.5) { bug.dir = -bug.dir; bug.stuck = 0; bug.think = 2; }
    } else { bug.stuck = 0; bug.sx = bug.lx; bug.sy = bug.ly; }
    if (bug.dir) bug.face = -bug.dir;
    bug.look = [bug.face * -tnx + Math.sin(bug.seed + bug.phase * 0.2) * 0.3, -bug.face * tny];
  }

  // ballistic hop in the local field: v = d / T - g T / 2 lands on the target after T seconds.
  // T = sqrt(2 d tan35° / g) is a ~35° lob (floaty in 2 m/s², which is the honest answer),
  // aimed a little ahead of a moving astronaut
  function launch(g, H, bug, sp, at, flee) {
    let vx, vy;
    const [gx, gy] = localGrav(g, H.b, bug.lx, bug.ly), gm = Math.hypot(gx, gy) || 1;
    if (at && !flee) {
      const A = g.astro, d0 = Math.hypot(at[0] - bug.lx, at[1] - bug.ly), T0 = clamp(Math.sqrt(1.4 * d0 / gm), 0.7, 3.2);
      const ax = at[0] + (A.vx - H.bvx) * T0 * 0.6, ay = at[1] + (A.vy - H.bvy) * T0 * 0.6;
      const dx = ax - bug.lx, dy = ay - bug.ly, T = clamp(Math.sqrt(1.4 * Math.hypot(dx, dy) / gm), 0.7, 3.2);
      vx = dx / T - 0.5 * gx * T; vy = dy / T - 0.5 * gy * T;
    } else {
      const [tnx, tny] = tangent(bug);
      vx = bug.nx * 3.5 + tnx * bug.dir * 2.5; vy = bug.ny * 3.5 + tny * bug.dir * 2.5;
      if (!bug.dir) { vx += tnx * -bug.face * 2.5; vy += tny * -bug.face * 2.5; }
    }
    const v = Math.hypot(vx, vy);
    if (v > sp.hop) { vx *= sp.hop / v; vy *= sp.hop / v; }
    const vn = vx * bug.nx + vy * bug.ny, need = 0.3 * sp.hop;
    if (vn < need) { vx += bug.nx * (need - vn); vy += bug.ny * (need - vn); }
    bug.vx += vx; bug.vy += vy; bug.air = 0.2; bug.ground = false;
    const [tnx, tny] = tangent(bug), along = vx * tnx + vy * tny;
    if (Math.abs(along) > 0.2) bug.face = -Math.sign(along);
  }


  // ---------------- physics (body frame: own gravity + tides) ----------------

  function localGrav(g, b, lx, ly) {
    const s = World.bodyState(g.w, b, g.t), a = World.gravity(g.w, s[0] + lx, s[1] + ly, g.t);
    return [a[0] - s[4], a[1] - s[5]];
  }

  function stepBug(g, bug, T, h) {
    const sp = specOf(bug);
    let [ax, ay] = localGrav(g, bug.b, bug.lx, bug.ly);
    const c = bug.air > 0 ? null : Terrain.collideCircle(T, bug.lx, bug.ly, bug.r + SKIN);
    bug.air = Math.max(0, bug.air - h);
    if (c) {
      bug.ground = true; bug.nx = c.nx; bug.ny = c.ny;
      ax -= c.nx * sp.grip; ay -= c.ny * sp.grip;
      const tx = -c.ny, ty = c.nx, vt = bug.vx * tx + bug.vy * ty;
      const want = bug.dir * (bug.mode === 'wander' ? sp.crawl : bug.mode === 'flee' ? sp.run * 1.2 : sp.run);
      const dv = clamp(want - vt, -sp.trac * h, sp.trac * h);
      bug.vx += tx * dv; bug.vy += ty * dv;
      bug.phase += Math.abs(vt) * h * 7;
    } else { bug.ground = false; bug.phase += h * 16; }
    bug.vx += ax * h; bug.vy += ay * h;
    const v = Math.hypot(bug.vx, bug.vy);
    if (v > VMAX) { bug.vx *= VMAX / v; bug.vy *= VMAX / v; }
    bug.lx += bug.vx * h; bug.ly += bug.vy * h;
    const hit = Terrain.collideCircle(T, bug.lx, bug.ly, bug.r);
    if (hit) {
      bug.lx += hit.nx * hit.depth; bug.ly += hit.ny * hit.depth;
      const vn = bug.vx * hit.nx + bug.vy * hit.ny;
      if (vn < 0) { bug.vx -= vn * hit.nx; bug.vy -= vn * hit.ny; }
      if (!c && bug.air <= 0) { bug.ground = true; bug.nx = hit.nx; bug.ny = hit.ny; }
    }
    const up = bug.ground ? Math.atan2(bug.ny, bug.nx) : Math.atan2(bug.ly, bug.lx);
    bug.ua += wrapPi(up - bug.ua) * Math.min(1, h * 12);
  }

  function separate(bugs) {
    for (let i = 0; i < bugs.length; i++) for (let j = i + 1; j < bugs.length; j++) {
      const a = bugs[i], b = bugs[j], dx = b.lx - a.lx, dy = b.ly - a.ly, d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.9;
      if (d >= min) continue;
      if (d < 1e-6) { b.lx += 0.05 * (b.n % 2 ? 1 : -1); continue; }
      const k = (min - d) / d * 0.5;
      a.lx -= dx * k; a.ly -= dy * k; b.lx += dx * k; b.ly += dy * k;
    }
  }


  // ---------------- bites & chews ----------------

  function touch(g, M, H, bug) {
    if (bug.dead || bug.emerge > 0) return;
    const sp = specOf(bug), A = g.astro, wx = H.bx + bug.lx, wy = H.by + bug.ly;
    if (A.on && A.hp > 0 && bug.biteCd <= 0 && !bug.gold && Math.hypot(A.x - wx, A.y - wy) < bug.r + A.r + 0.15) {
      bug.biteCd = sp.biteCd; bug.chomp = 0.3;
      hitTarget(g, 'astro', sp.bite, wx, wy) || Game.hurtAstro(g, sp.bite, 'CHOMP!');
      Game.log(g, `${bug.name} the ${sp.name.toLowerCase()} bit you  -${sp.bite} hp`);
      recoil(H, bug, A.x - H.bx, A.y - H.by, 1.8);
    }
    const sh = g.sh, S = g.S;
    if (g.status === 'landed' && g.landedOn === H.b && bug.chewCd <= 0 && bug.bored <= 0 &&
        Math.hypot(sh.x - wx, sh.y - wy) < S.radius + bug.r + 0.6) {
      bug.chewCd = CHEW_GAP; bug.chomp = 0.3;
      Game.hurtShip(g, sp.chew, 'NOM!');
      if (M.rand() < 0.45) {
        bug.bored = BORED; bug.anger = 0; bug.tgt = null;
        Game.popup(g, 'PTOOEY!', JELLY, wx, wy, 20);
        recoil(H, bug, sh.x - H.bx, sh.y - H.by, 1.2);
      }
    }
  }

  // hit a core/module target by id, as dealDamage would (but without splashing the ship next to you)
  function hitTarget(g, id, dmg, x, y) {
    const tg = Game.targets(g).find((t) => t.id === id);
    if (tg) tg.hit(g, dmg, 'bite', { x, y, r: 0, dmg, kind: 'bite', team: 'bug' });
    return !!tg;
  }

  function recoil(H, bug, fx, fy, k) {
    const dx = bug.lx - fx, dy = bug.ly - fy, d = Math.hypot(dx, dy) || 1, [ux, uy] = upOf(bug);
    bug.vx += dx / d * k + ux * k * 0.8; bug.vy += dy / d * k + uy * k * 0.8; bug.air = 0.12; bug.ground = false;
  }
  const upOf = (bug) => [Math.cos(bug.ua), Math.sin(bug.ua)];


  // ---------------- getting hit, squishing ----------------

  function hitBug(g, bug, dmg, kind, src) {
    const M = g.mod.mobs; if (!M || bug.dead || !(dmg > 0)) return;
    const sp = specOf(bug), H = M.homes[bug.home];
    dmg *= 1 - ((sp.armor && sp.armor[kind]) || 0);
    bug.hp -= dmg; bug.flash = 1; bug.anger = 10;
    const s = World.bodyState(g.w, H.b, g.t), wx = s[0] + bug.lx, wy = s[1] + bug.ly;
    const from = src && isFinite(src.x) && isFinite(src.y) ? [src.x, src.y] : g.astro.on ? [g.astro.x, g.astro.y] : [g.sh.x, g.sh.y];
    let dx = wx - from[0], dy = wy - from[1], d = Math.hypot(dx, dy);
    if (d < 1e-6) { [dx, dy] = upOf(bug); d = 1; }
    const kb = Math.min(5, (kind === 'laser' ? 0.08 : 0.3) * dmg) * sp.kb;
    bug.vx += dx / d * kb; bug.vy += dy / d * kb;
    if (kb > 1) { const [ux, uy] = upOf(bug); bug.vx += ux * kb * 0.4; bug.vy += uy * kb * 0.4; bug.air = 0.08; }
    if (kind !== 'laser' && dmg >= 3) Game.popup(g, sp.armor && sp.armor[kind] ? 'PING!' : 'EEK!', '#ffd166', wx, wy, 18);
    if (bug.hp <= 0) kill(g, M, H, bug, wx, wy, s, !(src && src.team === 'pirate'));
  }

  function kill(g, M, H, bug, x, y, s, yours = true) {   // yours: false when a pirate's stray round did it
    bug.dead = true; M.bugs = M.bugs.filter((b) => !b.dead);
    const sp = specOf(bug), [ux, uy] = upOf(bug);
    const nest = H.nests[bug.nest]; if (nest) nest.out = Math.max(0, nest.out - 1);
    Game.burst(g, 'goo', x, y, 26, { vx: s[2], vy: s[3], speed: 5, col: JELLY, size: 0.2, life: 0.9 });
    Game.burst(g, 'flash', x, y, 1, { vx: s[2], vy: s[3], speed: 0, col: JELLY, size: 2.5, life: 0.4 });
    Game.popup(g, 'SQUISH!', JELLY, x, y, 30);
    if (bug.gold) Game.popup(g, 'JACKPOT!', '#ffd84d', x, y + 1.5, 24);
    const T = Terrain.of(H.b), c = Terrain.collideCircle(T, bug.lx, bug.ly, bug.r + 0.6);
    if (c) M.splats.push({ home: H.id, lx: bug.lx - c.nx * bug.r * 0.8, ly: bug.ly - c.ny * bug.r * 0.8, ua: Math.atan2(c.ny, c.nx), w: bug.r * 2.6, t0: g.real, seed: bug.seed });
    if (M.splats.length > 24) M.splats.shift();
    const nJ = sp.jelly[0] + Math.floor(M.rand() * (sp.jelly[1] - sp.jelly[0] + 1));
    for (let i = 0; i < nJ; i++) dropJelly(g, M, x, y, H, ux, uy);
    Game.log(g, `squished ${bug.name} the ${sp.name.toLowerCase()} on ${H.b.name}  (${nJ} jelly${yours ? '' : ', by a pirate'})`);
    if (!yours) return;
    M.kills++;
    Game.goal(g, 'bug');
    if (MILESTONES[M.kills]) Game.toast(g, MILESTONES[M.kills], JELLY);
  }

  function dropJelly(g, M, x, y, H, ux, uy) {
    const side = (M.rand() - 0.5) * 2.4;
    Game.spawnPickup(g, { x: x + ux * 0.2, y: y + uy * 0.2, vx: H.bvx + ux * 2.2 - uy * side, vy: H.bvy + uy * 2.2 + ux * side, item: 'jelly', qty: 1 });
  }


  // ---------------- hooks: targets, warp, hints, HUD, lifecycle ----------------

  function targets(g) {
    const M = g.mod.mobs; if (!M || !M.bugs.length) return null;
    const out = [];
    for (const bug of M.bugs) {
      if (bug.dead) continue;
      const s = World.bodyState(g.w, bug.b, g.t), sp = specOf(bug);
      out.push({ id: bug.id, team: 'bug', x: s[0] + bug.lx, y: s[1] + bug.ly, r: bug.r, name: `${sp.name} ${bug.name}`,
                 hit: (g2, dmg, kind, src) => hitBug(g2, bug, dmg, kind, src) });
    }
    return out;
  }

  function warpLimit(g) {
    const M = g.mod.mobs;
    return M && M.engaged ? { max: 2, why: 'bugs attacking' } : null;
  }

  function hint(g) {
    const M = g.mod.mobs; if (!M) return null;
    if (M.goldNear) return { pri: 57, text: 'A golden muncher! It is shy and fast. Zap it for a jelly jackpot.' };
    if (M.nearAstro) return { pri: 56, text: 'Bugs! Zap them with the laser; they drop jelly worth cash.' };
    if (M.chewing) {
      const eva = Game.mods.some((m) => m.id === 'eva');
      return { pri: 58, text: g.astro.on ? 'Bugs are nibbling your parked ship! Go back and zap them.'
        : eva ? 'Bugs are nibbling your hull! Lift off (W), or hop out (E) and zap them.' : 'Bugs are nibbling your hull! Lift off (W) to shake them off.' };
    }
    return null;
  }

  function hudRows(g) {
    const M = g.mod.mobs; if (!M || !M.nearAny) return null;
    return [{ label: 'BUGS', val: `${M.nearAny} near · ${M.kills} squished`, col: M.engaged ? '#e63946' : '#ff9f1c' }];
  }

  function respawn(g) {
    const M = g.mod.mobs; if (!M) return;
    for (const id in M.homes) if (M.homes[id].awake) sleep(g, M.homes[id]);
    M.splats = []; M.engaged = false; M.nearAstro = 0; M.chewing = false; M.goldNear = false; M.nearAny = 0;
  }


  // ======================================================================
  //  ART  (world space, y up; each bug drawn upright on its local up)
  // ======================================================================

  // nests and splats sit under the ship; the bugs themselves crawl over everything (so a CHOMP is visible)
  function drawWorld(g, kit) { eachHome(g, kit, false); }
  function drawWorldTop(g, kit) { eachHome(g, kit, true); }

  function eachHome(g, kit, top) {
    const M = g.mod.mobs; if (!M) return;
    const zoom = kit.cam.zoom, view = kit.viewRect(12);
    const vis = (x, y, m) => x > view[0] - m && x < view[2] + m && y > view[1] - m && y < view[3] + m;
    for (const id in M.homes) {
      const H = M.homes[id], [bx, by] = World.bodyState(g.w, H.b, g.t), Rb = H.b.R * (1 + H.b.shape) + 4;
      if (bx + Rb < view[0] || bx - Rb > view[2] || by + Rb < view[1] || by - Rb > view[3]) continue;
      if (!top && zoom >= NEST_ZOOM) {
        for (const sp of M.splats) if (sp.home === id && vis(bx + sp.lx, by + sp.ly, 3)) drawSplat(g, kit, sp, bx, by);
        for (const n of H.nests) if (!n.gone && vis(bx + n.lx, by + n.ly, 4)) drawNest(g, kit, H, n, bx, by);
      }
      if (!top || zoom < BUG_ZOOM || !H.awake) continue;
      for (const bug of M.bugs) if (bug.home === id && !bug.dead && vis(bx + bug.lx, by + bug.ly, 3)) drawBug(g, kit, bug, bx, by);
    }
  }

  // flat base + shadow band away from the light + highlight + ink outline (path(dx, dy) builds the outline)
  function toon(ctx, path, cx, cy, R, L, cols, lw, flash) {
    path(0, 0); ctx.fillStyle = cols[1]; ctx.fill();
    ctx.save(); path(0, 0); ctx.clip();
    path(L[0] * R * 0.32, L[1] * R * 0.32); ctx.fillStyle = cols[0]; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + L[0] * R * 0.48, cy + L[1] * R * 0.48, R * 0.3, R * 0.16, Math.atan2(L[1], L[0]) + Math.PI / 2, 0, 2 * Math.PI);
    ctx.fillStyle = cols[2]; ctx.fill();
    if (flash > 0) { ctx.globalAlpha = Math.min(1, flash); ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 3 * R, cy - 3 * R, 6 * R, 6 * R); ctx.globalAlpha = 1; }
    ctx.restore();
    if (lw > 0) { path(0, 0); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
  }

  function drawBug(g, kit, bug, bx, by) {
    const ctx = kit.ctx, px = kit.px(), sp = specOf(bug), r = bug.r;
    const s = Math.max(ART, MIN_PX * px / r), ux = Math.cos(bug.ua), uy = Math.sin(bug.ua), face = bug.face || 1;
    const x = bx + bug.lx + ux * (s - 1) * r, y = by + bug.ly + uy * (s - 1) * r;
    const L = [(kit.LIGHT[0] * uy - kit.LIGHT[1] * ux) * face, kit.LIGHT[0] * ux + kit.LIGHT[1] * uy];
    const lk = lookLocal(bug, ux, uy, face), lw = 2.5 * px / s, t = g.real + bug.seed;
    let sx = 1, sy = 1;
    if (bug.squash > 0) { const k = clamp(1 - bug.squash / sp.squash, 0, 1); sx = 1 + 0.3 * k; sy = 1 - 0.35 * k; }
    else if (!bug.ground) { sx = 0.9; sy = 1.12; }
    const em = bug.emerge > 0 ? clamp(1 - bug.emerge / EMERGE_T, 0.05, 1) : 1;

    ctx.save();
    ctx.translate(x, y); ctx.rotate(bug.ua - Math.PI / 2); ctx.scale(s * face, s);
    ctx.translate(0, -r); ctx.scale(sx * em, sy * em); ctx.translate(0, r);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const f = { r, L, lw, t, lk, angry: bug.mode === 'chase', chomp: bug.chomp > 0, blink: (t % 4.3) < 0.13, flash: bug.flash * 0.85,
                cols: sp.cols, spot: sp.spot, sp };
    if (bug.sp === 'beetle') drawBeetle(ctx, bug, f);
    else if (bug.sp === 'nacho') drawNacho(ctx, bug, f);
    else drawMuncher(ctx, bug, f);
    ctx.restore();

    if (bug.gold) sparkles(ctx, x, y, r * s, t, px);
    if (bug.alert > 0 || bug.squash > 0) alertMark(ctx, x + ux * r * s * 1.75, y + uy * r * s * 1.75, bug.ua, Math.max(0.42, 11 * px), lw * s, bug.squash > 0);
  }

  // where the pupils point, in the bug's drawing frame
  function lookLocal(bug, ux, uy, face) {
    const [wx, wy] = bug.look, lx = (wx * uy - wy * ux) * face, ly = wx * ux + wy * uy, d = Math.hypot(lx, ly) || 1;
    return [lx / d, ly / d];
  }

  // ---------------- muncher: round, green, fangs ----------------

  function drawMuncher(ctx, bug, f) {
    const { r, L, lw } = f, cy = 0.1 * r, rx = 1.0 * r, ry = 0.84 * r;
    legs(ctx, bug, f, true, 0.5);
    toon(ctx, (dx, dy) => { ctx.beginPath(); ctx.ellipse(dx, cy + dy, rx, ry, 0, 0, 2 * Math.PI); }, 0, cy, r, L, f.cols, lw, f.flash);
    ctx.fillStyle = f.spot;
    for (const [sx, sy, sr] of [[-0.48, 0.42, 0.16], [-0.74, 0.02, 0.11], [-0.16, 0.68, 0.1]]) { ctx.beginPath(); ctx.arc(sx * r, sy * r, sr * r, 0, 2 * Math.PI); ctx.fill(); }
    legs(ctx, bug, f, false, 0.5);
    antennae(ctx, f, [[0.22, 0.86], [0.56, 0.78]], 0.6);
    blush(ctx, f, 0.8, -0.12);
    eye(ctx, f, 0.26 * r, 0.3 * r, 0.31 * r, 1);
    eye(ctx, f, 0.7 * r, 0.25 * r, 0.27 * r, -1);
    mouth(ctx, f, 0.58 * r, -0.24 * r, 0.2 * r, true);
  }

  // ---------------- Tater Tank: armoured rock shell, purple head ----------------

  function drawBeetle(ctx, bug, f) {
    const { r, L, lw } = f, sp = f.sp;
    legs(ctx, bug, f, true, 0.55);
    const shell = (dx, dy) => {
      ctx.beginPath(); ctx.moveTo(-1.08 * r + dx, -0.52 * r + dy);
      ctx.bezierCurveTo(-1.18 * r + dx, 0.5 * r + dy, -0.5 * r + dx, 0.95 * r + dy, 0.0 + dx, 0.92 * r + dy);
      ctx.bezierCurveTo(0.5 * r + dx, 0.9 * r + dy, 0.78 * r + dx, 0.35 * r + dy, 0.66 * r + dx, -0.52 * r + dy);
      ctx.closePath();
    };
    toon(ctx, shell, -0.2 * r, 0.25 * r, 0.95 * r, L, f.cols, lw, f.flash);
    ctx.save(); shell(0, 0); ctx.clip();
    ctx.fillStyle = f.spot;
    for (const [sx, sy, sr] of [[-0.62, 0.22, 0.12], [-0.28, 0.58, 0.09], [0.2, 0.28, 0.1], [-0.82, -0.12, 0.07], [0.38, 0.62, 0.06], [-0.1, 0.05, 0.06]]) {
      ctx.beginPath(); ctx.arc(sx * r, sy * r, sr * r, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8;                               // armour plate seams
    for (const k of [-0.42, 0.12]) { ctx.beginPath(); ctx.moveTo((k - 0.3) * r, -0.6 * r); ctx.quadraticCurveTo((k - 0.05) * r, 0.25 * r, (k + 0.18) * r, 1.0 * r); ctx.stroke(); }
    ctx.fillStyle = f.cols[1]; ctx.fillRect(-1.3 * r, -0.62 * r, 2.2 * r, 0.2 * r);   // rim
    ctx.restore();
    shell(0, 0); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    toon(ctx, (dx, dy) => { ctx.beginPath(); ctx.arc(0.72 * r + dx, -0.16 * r + dy, 0.4 * r, 0, 2 * Math.PI); }, 0.72 * r, -0.16 * r, 0.4 * r, L, sp.head, lw, f.flash);
    legs(ctx, bug, f, false, 0.55);
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 1.2;                                 // mandibles
    for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(1.04 * r, -0.3 * r); ctx.quadraticCurveTo(1.3 * r, (-0.28 + s * 0.06) * r, 1.22 * r, (-0.46 + s * 0.04) * r); ctx.stroke(); }
    antennae(ctx, f, [[0.62, 0.18], [0.86, 0.14]], 0.48);
    eye(ctx, f, 0.6 * r, 0.0, 0.2 * r, 1);
    eye(ctx, f, 0.92 * r, -0.04 * r, 0.18 * r, -1);
    mouth(ctx, f, 0.9 * r, -0.36 * r, 0.12 * r, false);
  }

  // ---------------- Nacho Nibbler: a seasoned triangle with feelings ----------------

  function drawNacho(ctx, bug, f) {
    const { r, L, lw } = f;
    const P = [[-1.0, -0.6], [1.0, -0.6], [0.05, 1.0]];
    const chip = (dx, dy) => {
      const q = P.map(([a, b]) => [a * r + dx, b * r + dy]);
      ctx.beginPath(); ctx.moveTo((q[2][0] + q[0][0]) / 2, (q[2][1] + q[0][1]) / 2);
      for (let i = 0; i < 3; i++) { const a = q[i], b = q[(i + 1) % 3]; ctx.arcTo(a[0], a[1], b[0], b[1], 0.3 * r); }
      ctx.closePath();
    };
    legs(ctx, bug, f, true, 0.6);
    toon(ctx, chip, 0, -0.05 * r, r, L, f.cols, lw, f.flash);
    ctx.save(); chip(0, 0); ctx.clip(); ctx.fillStyle = f.spot;
    for (const [sx, sy, sr] of [[-0.55, -0.35, 0.07], [0.6, -0.4, 0.06], [-0.2, 0.55, 0.05], [0.3, 0.42, 0.06], [-0.7, -0.05, 0.05], [0.12, -0.42, 0.05]]) {
      ctx.beginPath(); ctx.arc(sx * r, sy * r, sr * r, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
    legs(ctx, bug, f, false, 0.6);
    antennae(ctx, f, [[-0.05, 0.86], [0.18, 0.82]], 0.55);
    blush(ctx, f, 0.62, -0.28);
    eye(ctx, f, -0.12 * r, 0.06 * r, 0.27 * r, 1);
    eye(ctx, f, 0.36 * r, 0.03 * r, 0.24 * r, -1);
    mouth(ctx, f, 0.2 * r, -0.36 * r, 0.16 * r, true);
  }

  // ---------------- body parts ----------------

  // three legs a side, tripod gait; far-side legs darker and shifted back
  function legs(ctx, bug, f, far, y0) {
    const { r, lw } = f, moving = bug.ground && Math.abs(bug.dir) > 0, air = !bug.ground;
    ctx.strokeStyle = far ? '#3a2f55' : INK; ctx.lineWidth = Math.max(lw, 0.11 * r);
    for (let i = -1; i <= 1; i++) {
      const ph = bug.phase + (i + 1) * 2.09 + (far ? Math.PI : 0) + (i === 0 ? Math.PI : 0);
      const swing = moving ? Math.sin(ph) * 0.22 * r : air ? Math.sin(ph) * 0.12 * r : 0, lift = moving ? Math.max(0, Math.cos(ph)) * 0.14 * r : 0;
      const rx = i * 0.5 * r + (far ? -0.12 * r : 0), ry = -y0 * r;
      const fx = i * 0.82 * r + swing + (far ? -0.12 * r : 0), fy = (air ? -0.85 : -1) * r + lift;
      const kx = (rx + fx) / 2 + i * 0.22 * r, ky = Math.max(ry, fy) + 0.12 * r;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
  }

  function antennae(ctx, f, roots, len) {
    const { r, lw, t } = f;
    roots.forEach(([ax, ay], i) => {
      const wob = Math.sin(t * 3.1 + i * 1.7) * 0.12 * r, tx = (ax + 0.12 + i * 0.12) * r + wob, ty = (ay + len) * r;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(lw * 0.9, 0.08 * r);
      ctx.beginPath(); ctx.moveTo(ax * r, ay * r); ctx.quadraticCurveTo((ax - 0.1) * r, (ay + len * 0.7) * r, tx, ty); ctx.stroke();
      ctx.fillStyle = f.cols[0]; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.arc(tx, ty, 0.12 * r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    });
  }

  // side: +1 left eye (inner edge at +x), -1 right eye
  function eye(ctx, f, ex, ey, er, side) {
    const { lw, lk } = f;
    if (f.blink) {
      ctx.strokeStyle = INK; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(ex, ey + er * 0.2, er * 0.7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.9;
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      const px = ex + lk[0] * er * 0.38, py = ey + lk[1] * er * 0.38;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px, py, er * 0.5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px - er * 0.16, py + er * 0.18, er * 0.17, 0, 2 * Math.PI); ctx.fill();
    }
    if (f.angry) {
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); ctx.moveTo(ex - side * er * 1.0, ey + er * 1.38); ctx.lineTo(ex + side * er * 0.75, ey + er * 0.95); ctx.stroke();
    }
  }

  function mouth(ctx, f, mx, my, w, fangs) {
    const { lw } = f;
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.9;
    if (f.chomp) {
      ctx.fillStyle = '#5a1430'; ctx.beginPath(); ctx.ellipse(mx, my, w * 0.9, w * 0.8, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8fab'; ctx.beginPath(); ctx.ellipse(mx, my - w * 0.4, w * 0.5, w * 0.28, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx + s * w * 0.55, my + w * 0.6); ctx.lineTo(mx + s * w * 0.3, my + w * 0.6); ctx.lineTo(mx + s * w * 0.42, my + w * 0.15); ctx.closePath(); ctx.fill(); }
      return;
    }
    if (fangs) {
      ctx.fillStyle = '#ffffff';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(mx + s * w * 0.55, my - w * 0.05); ctx.lineTo(mx + s * w * 0.2, my - w * 0.05); ctx.lineTo(mx + s * w * 0.38, my - w * 0.5); ctx.closePath();
        ctx.fill(); ctx.lineWidth = lw * 0.5; ctx.stroke();
      }
      ctx.lineWidth = lw * 0.9;
    }
    ctx.beginPath();
    if (f.angry) ctx.arc(mx, my - w * 0.55, w * 0.7, Math.PI * 0.25, Math.PI * 0.75);
    else ctx.arc(mx, my + w * 0.35, w * 0.7, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }

  function blush(ctx, f, bx, by) {
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    ctx.beginPath(); ctx.ellipse(bx * f.r, by * f.r, 0.16 * f.r, 0.09 * f.r, 0, 0, 2 * Math.PI); ctx.fill();
  }

  // "!" over a bug that just noticed you (and while it winds up a hop)
  function alertMark(ctx, x, y, ua, size, lw, big) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ua - Math.PI / 2); const k = size * (big ? 1.25 : 1); ctx.scale(k, k);
    ctx.fillStyle = big ? '#ff5d5d' : '#ffd166'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.12, lw / k * 0.8); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-0.16, 1.0); ctx.lineTo(0.16, 1.0); ctx.lineTo(0.09, 0.3); ctx.lineTo(-0.09, 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.08, 0.11, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function sparkles(ctx, x, y, R, t, px) {
    ctx.fillStyle = '#fff6b0';
    for (let i = 0; i < 3; i++) {
      const a = t * 0.9 + i * 2.1, k = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.3), s = Math.max(0.12, 3 * px) * (0.6 + k);
      const sx = x + Math.cos(a) * R * 1.7, sy = y + Math.sin(a) * R * 1.5 + R * 0.3;
      ctx.beginPath(); ctx.moveTo(sx, sy + s); ctx.lineTo(sx + s * 0.25, sy); ctx.lineTo(sx, sy - s); ctx.lineTo(sx - s * 0.25, sy); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx + s, sy); ctx.lineTo(sx, sy + s * 0.25); ctx.lineTo(sx - s, sy); ctx.lineTo(sx, sy - s * 0.25); ctx.closePath(); ctx.fill();
    }
  }

  // ---------------- nests: bumpy mounds with a hole (and somebody home) ----------------

  function drawNest(g, kit, H, n, bx, by) {
    const ctx = kit.ctx, px = kit.px(), d = H.def.nest, w = d.w, h = d.h, s = Math.max(1, NEST_PX * px / w);
    const ua = Math.atan2(n.uy, n.ux), ux = n.ux, uy = n.uy;
    const L = [kit.LIGHT[0] * uy - kit.LIGHT[1] * ux, kit.LIGHT[0] * ux + kit.LIGHT[1] * uy], lw = 2.5 * px / s;
    ctx.save();
    ctx.translate(bx + n.lx - ux * 0.3, by + n.ly - uy * 0.3); ctx.rotate(ua - Math.PI / 2); ctx.scale(s, s);
    const top = (dx, dy) => {
      ctx.moveTo(-w / 2 + dx, 0.12 + dy);
      ctx.quadraticCurveTo(-w * 0.5 + dx, h * 0.5 + dy, -w * 0.3 + dx, h * 0.62 + dy);
      ctx.quadraticCurveTo(-w * 0.25 + dx, h * 1.02 + dy, 0 + dx, h * 0.96 + dy);
      ctx.quadraticCurveTo(w * 0.18 + dx, h * 1.08 + dy, w * 0.3 + dx, h * 0.72 + dy);
      ctx.quadraticCurveTo(w * 0.52 + dx, h * 0.55 + dy, w / 2 + dx, 0.12 + dy);
    };
    const mound = (dx, dy) => { ctx.beginPath(); top(dx, dy); ctx.quadraticCurveTo(dx, -0.2 + dy, -w / 2 + dx, 0.12 + dy); ctx.closePath(); };
    toon(ctx, mound, -w * 0.05, h * 0.45, w * 0.45, L, d.cols, 0, 0);
    ctx.beginPath(); top(0, 0); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = d.cols[2];
    for (const [sx, sy, sr] of [[-0.3, 0.25, 0.05], [0.25, 0.3, 0.04], [-0.12, 0.08, 0.035]]) { ctx.beginPath(); ctx.arc(sx * w, sy * h, sr * w, 0, 2 * Math.PI); ctx.fill(); }
    const hx = w * 0.06, hy = h * 0.6, hr = w * 0.17;                    // the hole
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(hx, hy, hr, hr * 0.62, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = d.cols[1]; ctx.lineWidth = lw * 0.9; ctx.beginPath(); ctx.ellipse(hx, hy - hr * 0.08, hr * 1.05, hr * 0.72, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    if (n.stock > 0 && ((g.real + n.k * 1.7) % 5.2) > 0.18) {             // somebody's home
      ctx.fillStyle = '#ffe66b';
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + sx * hr * 0.32, hy + hr * 0.02, hr * 0.13, 0, 2 * Math.PI); ctx.fill(); }
    }
    if (d.grass) {
      ctx.strokeStyle = d.grass; ctx.lineWidth = Math.max(lw * 0.8, 0.05);
      for (const [gx, gy, a] of [[-0.36, 0.55, -0.4], [-0.3, 0.6, 0.1], [0.36, 0.62, 0.3], [0.42, 0.52, 0.7], [-0.08, 0.98, -0.1]]) {
        ctx.beginPath(); ctx.moveTo(gx * w, gy * h); ctx.lineTo(gx * w + Math.sin(a) * 0.3, gy * h + Math.cos(a) * 0.32); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSplat(g, kit, sp, bx, by) {
    const ctx = kit.ctx, px = kit.px(), age = g.real - sp.t0, a = clamp(1 - (age - 15) / 10, 0, 1);
    if (a <= 0) return;
    const s = Math.max(1, 12 * px / sp.w), w = sp.w;
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(bx + sp.lx, by + sp.ly); ctx.rotate(sp.ua - Math.PI / 2); ctx.scale(s, s);
    ctx.fillStyle = JELLY; ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * px / s;
    ctx.beginPath(); ctx.ellipse(0, 0.04 * w, w * 0.5, w * 0.12, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const dx = Math.sin(sp.seed + i * 2.4) * w * 0.7, dy = 0.08 * w + Math.abs(Math.cos(sp.seed * 1.3 + i)) * w * 0.22, rr = w * (0.05 + 0.03 * (i % 2));
      ctx.beginPath(); ctx.arc(dx, dy, rr, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-w * 0.18, w * 0.09, w * 0.12, w * 0.035, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
  }


  // ---------------- registration ----------------

  const mod = Game.register({ id: 'mobs', init, load, save, after, respawn, targets, warpLimit, hint, hudRows, drawWorld, drawWorldTop });
  on = Game.mods.includes(mod);
  if (on) Game.addGoals([{ id: 'bug', order: 70, reward: 100, text: 'Squish a space bug (Kiwi is crawling with them)' }]);

  // ---------------- API (tests, dev console, other modules) ----------------

  const home = (g, id) => (g.mod.mobs ? g.mod.mobs.homes[id] || null : null);
  return {
    SPECIES, HOMES, WAKE_ALT, SLEEP_ALT, home,
    list: (g) => (g.mod.mobs ? g.mod.mobs.bugs.filter((b) => !b.dead) : []),
    wake: (g, id) => { const H = home(g, id); if (H && !H.awake) wake(g, H, null); return H; },
    sleep: (g, id) => { const H = home(g, id); if (H && H.awake) sleep(g, H); return H; },
    spawn: (g, id, th, opt = {}) => {
      const H = home(g, id); if (!H) return null;
      if (!H.awake) { H.awake = true; H.emergeT = EMERGE_GAP; settle(H); }
      const s = World.bodyState(g.w, H.b, g.t); H.bx = s[0]; H.by = s[1]; H.bvx = s[2]; H.bvy = s[3];
      const nest = H.nests.reduce((a, n) => (Math.abs(wrapPi(n.th - th)) < Math.abs(wrapPi(a.th - th)) ? n : a));
      if (nest.stock <= 0) nest.stock = 1;
      return spawnBug(g, H, nest, th, opt);
    },
    hit: hitBug,
  };
})();

if (typeof module !== 'undefined') module.exports = Mobs;
