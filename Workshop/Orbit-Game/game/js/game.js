// ======================================================================
//  GAME  —  core: module registry, ship flight, landing on the terrain grid,
//  docking hold, warp, pickups, damage, nav target, goals, save, hints.
//  Feature modules (economy, stations, eva, mobs, wrecks, combat) plug in
//  with Game.register({ id, ...hooks }).  See SPEC.md for the hook list.
// ======================================================================

const Game = (() => {

  const SIM = CONFIG.sim, ITEMS = CONFIG.items;
  const SAVE_KEY = 'pocket-orbit-v3';
  const CHUNK_KG = 5;                                   // dug ore pops out in chunks of this many kg
  const ZERO = { main: 0, ion: 0, rot: 0, kill: false, fwd: 0, left: 0 };


  // ======================================================================
  //  MODULE REGISTRY
  // ======================================================================

  const mods = [];
  const api = { strict: false, quiet: false };          // strict: hook errors throw (tests); else they show on screen

  // ?mods=eva,economy (browser) or ORBIT_ONLY = 'eva,economy' (Node harness) loads only those modules
  const ONLY = ((typeof ORBIT_ONLY !== 'undefined' && ORBIT_ONLY) ||
                (typeof location !== 'undefined' && location.search && new URLSearchParams(location.search).get('mods')) || '')
               .split(',').map((s) => s.trim()).filter(Boolean);

  function register(m) {
    if (!m || !m.id) throw new Error('module needs an id');
    if (ONLY.length && !ONLY.includes(m.id)) return m;
    if (mods.some((x) => x.id === m.id)) throw new Error(`module ${m.id} registered twice`);
    mods.push(m);
    return m;
  }

  function call(g, m, hook, ...args) {
    if (!m[hook]) return undefined;
    if (api.strict) return m[hook](g, ...args);
    try { return m[hook](g, ...args); }
    catch (e) {
      const msg = `${m.id}.${hook}: ${e.message}`;
      if (g && g.err !== msg) { g.err = msg; console.error(`[orbit] ${msg}`, e); }
      return undefined;
    }
  }
  const each   = (g, hook, ...a) => { for (const m of mods) call(g, m, hook, ...a); };
  const gather = (g, hook, ...a) => { const out = []; for (const m of mods) { const r = call(g, m, hook, ...a); if (r) out.push(...r); } return out; };
  const first  = (g, hook, ...a) => { for (const m of mods) { const r = call(g, m, hook, ...a); if (r != null) return r; } return null; };


  // ======================================================================
  //  SPAWNS
  // ======================================================================

  const SPAWNS = {};                                    // id -> { name, place(g) }
  const SPAWN_ORDER = [];
  function addSpawn(id, name, place) { if (!SPAWNS[id]) SPAWN_ORDER.push(id); SPAWNS[id] = { name, place }; }
  const defaultSpawn = () => (SPAWNS.hub ? 'hub' : 'pad');

  function circularAround(g, b, r, th) {
    const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t), vc = Math.sqrt(b.mu / r);
    Object.assign(g.sh, { x: bx + r * Math.cos(th), y: by + r * Math.sin(th),
                          vx: bvx - vc * Math.sin(th), vy: bvy + vc * Math.cos(th), ang: th + Math.PI / 2, omega: 0 });
  }

  // put the ship down on the surface at polar angle th (walks outward until it no longer overlaps the grid)
  function landAt(g, b, th) {
    const T = Terrain.of(b), c = Math.cos(th), s = Math.sin(th), R = g.S.radius;
    let r = World.surfaceR(b, th) + R - 1;
    while (Terrain.collideCircle(T, r * c, r * s, R)) r += 0.05;
    const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    Object.assign(g.sh, { x: bx + r * c, y: by + r * s, vx: bvx, vy: bvy, ang: th, omega: 0 });
    g.land = { lx: r * c, ly: r * s, nx: c, ny: s };
    g.landedOn = b; g.status = 'landed';
  }

  addSpawn('pad',     'Ceres launch pad',       (g) => landAt(g, g.w.byId.ceres, Math.PI / 2));
  addSpawn('orbit',   'low Ceres orbit',        (g) => circularAround(g, g.w.byId.ceres, 360, Math.PI / 2));
  addSpawn('belt',    'inside the rubble belt', (g) => circularAround(g, g.w.byId.ceres, 550, Math.PI / 2));
  addSpawn('kiwi',    'orbiting Kiwi',          (g) => circularAround(g, g.w.byId.kiwi, 88, g.w.byId.kiwi.phase));
  addSpawn('potato',  'orbiting Big Potato',    (g) => circularAround(g, g.w.byId.potato, 100, g.w.byId.potato.phase));
  addSpawn('glimmer', 'orbiting Glimmer',       (g) => circularAround(g, g.w.byId.glimmer, 55, g.w.byId.glimmer.phase));

  function place(g, id) {
    if (!SPAWNS[id]) id = 'pad';
    g.spawn = id; g.status = 'flying'; g.landedOn = null; g.land = null; g.attach = null; g.trail = [];
    Object.assign(g.sh, { vx: 0, vy: 0, omega: 0, ang: Math.PI / 2 });
    SPAWNS[id].place(g);
  }


  // ======================================================================
  //  NEW GAME / STATS / RESPAWN
  // ======================================================================

  function create(seed = 7, spawn = null, opts = {}) {
    const w = World.create(CONFIG, seed);
    const g = {
      w, seed, t: 0, real: 0, dev: !!opts.dev, spawn: null,
      S: null, sh: null, status: 'flying', mode: 'ship',
      landedOn: null, land: null, attach: null, everFlew: false,
      warpIdx: 0, warp: 1, warpMax: SIM.warps[SIM.warps.length - 1], warpWhy: '', paused: false, ui: null,
      fired: { main: 0, ion: 0, rot: 0, trans: 0 }, ionOn: false,
      pred: null, ref: w.byId.ceres, orb: null, nearDist: Infinity, navId: null, approach: null,
      money: 300, cargo: {}, pack: {},
      astro: { on: false, x: 0, y: 0, vx: 0, vy: 0, ang: Math.PI / 2, hp: 100, hpMax: 100, r: 0.6 },
      pickups: [], particles: [], popups: [], toasts: [], events: [], trail: [], prompts: [],
      done: {}, mod: {}, err: null, shake: 0, deadAt: 0, crashMsg: '', towAsk: -9,
      maxCeresR: 0, stepsLastFrame: 0, digBuf: {}, gain: null, lastSave: 0,
      noSave: !!opts.noSave,                                         // ?fresh=1 / ?mods= runs never overwrite the real save
    };
    each(g, 'init');
    const saved = opts.fresh || g.dev ? null : readSave();
    const same = saved && saved.seed === seed;                         // flight + terrain only make sense in the same world
    const flight = same && !spawn && saved.flight && Number.isFinite(saved.flight.t) ? saved.flight : null;
    if (flight) g.t = flight.t;
    if (saved) applySave(g, saved, 'pre');
    if (same) restoreTerrain(g, saved.ter);
    recalc(g);
    g.sh = Physics.newShip(g.S);
    g.astro.hp = g.astro.hpMax = g.S.suitHp;
    if (saved) applySave(g, saved, 'ship');
    if (g.dev) g.money = Math.max(g.money, 50000);
    if (!(flight && restoreFlight(g, flight))) place(g, spawn && SPAWNS[spawn] ? spawn : defaultSpawn());
    each(g, 'ready');
    refresh(g);
    if (flight && flight.status === 'dead') respawn(g, 'crash');     // closed the tab on a wreck: the tow still comes
    g.prompts = gatherPrompts(g);
    log(g, `new game  seed ${seed}  spawn ${g.spawn}${g.dev ? '  DEV' : ''}${saved ? '  (save loaded)' : ''}`);
    return g;
  }

  // derived ship stats: CONFIG.ship + every module's stats hook (upgrades, engines, fuels)
  function recalc(g) {
    const S = { ...CONFIG.ship };
    each(g, 'stats', S);
    g.S = S;
    if (g.sh) {
      const sh = g.sh;
      sh.fuel = Math.min(sh.fuel, S.fuel); sh.rcs = Math.min(sh.rcs, S.rcs); sh.hull = Math.min(sh.hull, S.hull);
      sh.xe = Math.min(sh.xe || 0, S.ionTank || 0);
      sh.cargoKg = kgOf(g.cargo);
      g.astro.hpMax = S.suitHp; g.astro.hp = Math.min(g.astro.hp, S.suitHp);
      if (!S.ionThrust) g.ionOn = false;
    }
    return S;
  }

  // after a crash or a tow: fresh ship at the default spawn, cargo lost (modules add fees etc.)
  function respawn(g, why = 'towed') {
    const old = { fuel: g.sh.fuel, xe: g.sh.xe || 0, rcs: g.sh.rcs, hull: Math.max(0, g.sh.hull) };
    g.sh = Physics.newShip(g.S);
    g.cargo = {}; g.pack = {}; g.sh.cargoKg = 0;
    g.mode = 'ship'; g.astro.on = false; g.astro.hp = g.astro.hpMax;
    g.ionOn = false; g.warpIdx = 0; g.pred = null; g.crashMsg = ''; g.err = null; g.towAsk = -9;
    place(g, defaultSpawn());
    each(g, 'respawn', why, old);
    refresh(g);
    log(g, `respawn (${why}) at ${g.spawn}`);
    save(g);
  }


  // ======================================================================
  //  PER-FRAME UPDATE
  //  inp = { keys: Set, pressed: [codes], mouse: { x, y, sx, sy, px, down, pressed, released, button }, touch: {} }
  // ======================================================================

  function update(g, inp, frameDt) {
    inp = inp || { keys: new Set(), pressed: [], mouse: null, touch: {} };
    g.real += frameDt;
    tickFx(g, frameDt);

    for (const code of inp.pressed || []) handleKey(g, code);
    if (inp.mouse && (inp.mouse.pressed || inp.mouse.released)) handleMouse(g, inp.mouse);

    // -------- ship controls --------
    const live = g.status !== 'dead' && g.mode === 'ship';
    const ctrl = live ? readShipCtrl(g, inp) : { ...ZERO };
    if (g.ionOn && (g.status !== 'flying' || g.mode !== 'ship')) { g.ionOn = false; toast(g, 'ION DRIVE OFF', '#7cf5d6', 'ion'); }
    ctrl.ion = g.ionOn ? 1 : 0;
    if (g.status === 'landed') { ctrl.rot = 0; ctrl.kill = false; }    // feet on the ground: no spinning in place
    each(g, 'shipCtrl', ctrl, inp);
    if (g.status === 'docked' && (ctrl.main || ctrl.fwd || ctrl.left || ctrl.ion)) release(g);

    // -------- warp --------
    const paused = g.paused || !!g.ui;
    applyWarpCaps(g, ctrl);
    g.warp = Math.min(SIM.warps[g.warpIdx], g.warpMax);
    const nMax = Math.round(SIM.warps[SIM.warps.length - 1] / 60 / SIM.dt);       // a slow frame lets sim time slip instead of piling up steps
    const n = paused ? 0 : Math.max(1, Math.min(nMax, Math.round(Math.min(frameDt, 1 / 20) * g.warp / SIM.dt)));
    const simDt = n * SIM.dt;
    each(g, 'frame', inp, frameDt, simDt);

    // -------- fixed physics steps --------
    const fired = { main: 0, ion: 0, rot: 0, trans: 0 }, stepMods = mods.filter((m) => m.step);
    for (let i = 0; i < n; i++) {
      if (g.status === 'docked') { g.t += SIM.dt; holdAttach(g); }
      else if (g.status !== 'dead') {
        const f = Physics.step(g.sh, ctrl, g.t, SIM.dt, g.w, g.S);
        for (const k in fired) fired[k] = Math.max(fired[k], f[k]);
        g.t += SIM.dt;
        if (g.status === 'landed') holdLanded(g, i); else contacts(g);
      } else g.t += SIM.dt;
      for (const m of stepMods) call(g, m, 'step', SIM.dt);
    }
    g.fired = fired; g.stepsLastFrame = n;
    if (g.ionOn && g.sh.xe <= 0) { g.ionOn = false; toast(g, 'ION TANK EMPTY', '#ff9f1c'); }
    const rcsF = g.sh.rcs / Math.max(1e-9, g.S.rcs);
    const rcsLvl = rcsF <= 0 ? 2 : rcsF < 0.2 ? 1 : 0;                            // warn once at 20 %, once more at empty
    if (rcsLvl > (g.rcsWarned || 0) && g.status !== 'dead') toast(g, rcsLvl === 2 ? 'RCS EMPTY: SLOW REACTION WHEEL ONLY' : 'RCS LOW', '#ff9f1c', 'rcs');
    if (rcsLvl > (g.rcsWarned || 0) || rcsF > 0.3) g.rcsWarned = rcsLvl;

    if (n) {
      if (fired.main) spawnExhaust(g, fired.main);
      if (fired.ion && Math.random() < 0.5) spawnIon(g);
      if (fired.rot || fired.trans) spawnPuff(g, ctrl);
      if (g.status === 'flying' && (!g.trail.length || g.t - g.trail[g.trail.length - 1][2] > 0.3)) {
        g.trail.push([g.sh.x, g.sh.y, g.t]); if (g.trail.length > 800) g.trail.shift();
      }
      tickPickups(g, simDt);
    }
    each(g, 'after', inp, frameDt, simDt);
    if (n) { refresh(g); checkGoals(g); }
    g.prompts = gatherPrompts(g);
    if (g.real - g.lastSave > 30) save(g);
  }

  function readShipCtrl(g, inp) {
    const k = (c) => inp.keys.has(c), t = inp.touch || {};
    return {
      main: k('KeyW') || t.thrust ? (k('ShiftLeft') || k('ShiftRight') ? g.S.fine : 1) : 0,
      ion: 0,
      rot: (k('KeyA') || t.rotL ? 1 : 0) - (k('KeyD') || t.rotR ? 1 : 0),
      kill: k('KeyS') || !!t.kill,
      fwd: (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0),
      left: (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0),
    };
  }

  // -------- keys: modules first (return true to consume), then interaction prompts, then core --------

  function handleKey(g, code) {
    for (const m of mods) if (call(g, m, 'onKey', code)) return;
    const it = g.prompts.find((p) => p.key === code);
    if (it) { it.act(g); g.prompts = gatherPrompts(g); return; }
    if (code === 'KeyP' || code === 'Escape') g.paused = !g.paused;
    if (code === 'Period') warpStep(g, +1);
    if (code === 'Comma') warpStep(g, -1);
    if (code === 'Tab') cycleNav(g);
    if (code === 'KeyX' && g.mode === 'ship') toggleIon(g);
    if (code === 'KeyR') {
      if (g.status === 'docked') toast(g, 'ALREADY DOCKED: NO TOW NEEDED', '#ffd166', 'tow');
      else if (g.status === 'dead') respawn(g, 'crash');
      else if (g.real - g.towAsk < 2.5) respawn(g, 'tow');
      else { g.towAsk = g.real; toast(g, 'PRESS R AGAIN: TOW TO BASE (CARGO LOST, FEE + REFILL)', '#ffd166'); }
    }
    if (code === 'KeyT' && g.dev) {
      const id = SPAWN_ORDER[(SPAWN_ORDER.indexOf(g.spawn) + 1) % SPAWN_ORDER.length];
      g.mode = 'ship'; g.astro.on = false;
      g.sh = Physics.newShip(g.S); place(g, id); each(g, 'ready'); refresh(g); g.prompts = gatherPrompts(g);
      toast(g, SPAWNS[id].name.toUpperCase());
    }
  }

  function handleMouse(g, ms) {
    for (const m of mods) if (call(g, m, 'onMouse', ms)) return;
    if (ms.pressed && ms.button === 0 && g.mode === 'ship') {           // click an object to target it
      let best = null, bd = 30 * (ms.px || 1);
      for (const nt of navTargets(g)) {
        const [x, y] = nt.state(g.t), d = Math.max(0, Math.hypot(x - ms.x, y - ms.y) - (nt.r || 0));
        if (d < bd) { bd = d; best = nt; }
      }
      if (best) { g.navId = best.id === g.navId ? null : best.id; refresh(g); }
    }
  }

  function toggleIon(g) {
    if (!g.S.ionThrust) { toast(g, 'NO ION DRIVE FITTED', '#ff9f1c'); return; }
    if (!g.ionOn && g.sh.xe <= 0) { toast(g, 'ION TANK EMPTY', '#ff9f1c'); return; }
    if (!g.ionOn && g.status !== 'flying') { toast(g, 'ION DRIVE: ONLY IN FLIGHT', '#ff9f1c', 'ion'); return; }
    g.ionOn = !g.ionOn;
    toast(g, g.ionOn ? 'ION DRIVE ON' : 'ION DRIVE OFF', '#7cf5d6', 'ion');
  }


  // ======================================================================
  //  WARP
  //  the player picks warpIdx; caps limit it. A cap with reset:true also lowers the pick.
  // ======================================================================

  function warpStep(g, d) {
    g.warpIdx = Math.max(0, Math.min(SIM.warps.length - 1, g.warpIdx + d));
    if (d > 0 && SIM.warps[g.warpIdx] > g.warpMax) toast(g, `WARP CAPPED AT ${g.warpMax}x: ${g.warpWhy}`.toUpperCase(), '#ffd166', 'warp');
  }
  function setWarp(g, x) { const i = SIM.warps.indexOf(x); if (i >= 0) g.warpIdx = i; }

  function applyWarpCaps(g, ctrl) {
    const caps = [];
    if (ctrl.main || ctrl.rot || ctrl.kill || ctrl.fwd || ctrl.left) caps.push({ max: 1, why: 'thrusters firing', reset: true });
    if (ctrl.ion) caps.push({ max: g.S.warpBurnMax, why: 'ion drive burning' });
    if (g.status === 'flying' && (g.nearDist < 8 || g.rockTTC < 20)) caps.push({ max: SIM.nearWarp, why: 'close to rocks' });
    if (g.rockTTC < 5) caps.push({ max: 1, why: 'rock ahead', reset: true, toast: 'ROCK AHEAD' });
    if (g.status === 'flying' && g.pred && g.pred.impact && g.pred.impact.t - g.t < SIM.impactWarnT)
      caps.push({ max: 1, why: 'impact ahead', reset: true, toast: 'IMPACT AHEAD' });
    for (const m of mods) { const c = call(g, m, 'warpLimit'); if (c) caps.push(c); }
    let max = SIM.warps[SIM.warps.length - 1], why = '';
    for (const c of caps) {
      if (c.max < max) { max = c.max; why = c.why; }
      if (c.reset && SIM.warps[g.warpIdx] > c.max) {
        g.warpIdx = Math.max(0, SIM.warps.filter((x) => x <= c.max).length - 1);
        if (c.toast) toast(g, c.toast, '#ff5d5d');
      }
    }
    g.warpMax = max; g.warpWhy = why;
  }


  // ======================================================================
  //  LANDED / DOCKED HOLDS, CONTACTS
  // ======================================================================

  function holdLanded(g, i) {
    const b = g.landedOn, L = g.land, sh = g.sh, [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    const vr = (sh.vx - bvx) * L.nx + (sh.vy - bvy) * L.ny;            // net push away from the ground?
    if (vr > 1e-4) { g.landedOn = null; g.land = null; g.everFlew = true; setStatus(g, 'flying', `took off from ${b.name}`); return; }
    sh.x = bx + L.lx; sh.y = by + L.ly; sh.vx = bvx; sh.vy = bvy; sh.ang = Math.atan2(L.ny, L.nx); sh.omega = 0;
    if (i % 8 === 0 && !Terrain.collideCircle(Terrain.of(b), L.lx, L.ly, g.S.radius + 0.35)) {
      g.landedOn = null; g.land = null; setStatus(g, 'flying', `ground under the ship dug away on ${b.name}`);
    }
  }

  // att = { name, state(t) -> [x, y, vx, vy], ang (number | fn(t)), pushDir(g) -> [dx, dy], onRelease(g) }
  function dock(g, att) {
    g.attach = att; g.landedOn = null; g.land = null; g.sh.omega = 0; g.trail = []; g.ionOn = false;
    holdAttach(g);
    setStatus(g, 'docked', `docked at ${att.name}`);
  }
  function holdAttach(g) {
    const a = g.attach, [x, y, vx, vy] = a.state(g.t);
    Object.assign(g.sh, { x, y, vx, vy });
    if (a.ang != null) g.sh.ang = typeof a.ang === 'function' ? a.ang(g.t) : a.ang;
  }
  function release(g, push = 0.8) {
    const a = g.attach; if (!a) return;
    holdAttach(g);
    const [dx, dy] = a.pushDir ? a.pushDir(g) : [Math.cos(g.sh.ang), Math.sin(g.sh.ang)];
    g.sh.vx += dx * push; g.sh.vy += dy * push;
    g.attach = null; g.everFlew = true;
    setStatus(g, 'flying', `undocked from ${a.name}`);
    if (a.onRelease) a.onRelease(g);
  }

  function contacts(g) {
    const sh = g.sh, S = g.S, w = g.w, st = World.states(w, g.t);
    for (const b of w.bodies) {
      const [bx, by, bvx, bvy] = st[b.idx], lx = sh.x - bx, ly = sh.y - by, d = Math.hypot(lx, ly);
      if (d > b.R * (1 + b.shape) + S.radius + 1) continue;
      const hit = Terrain.collideCircle(Terrain.of(b), lx, ly, S.radius);
      if (!hit) continue;
      sh.x += hit.nx * hit.depth; sh.y += hit.ny * hit.depth;
      const rvx = sh.vx - bvx, rvy = sh.vy - bvy, vn = rvx * hit.nx + rvy * hit.ny, v = Math.hypot(rvx, rvy);
      if (vn >= 0) return;
      const upright = (lx * hit.nx + ly * hit.ny) / d;                     // contact normal vs local up
      if (v < S.landSpeed && upright > 0.3) {
        g.land = { lx: sh.x - bx, ly: sh.y - by, nx: hit.nx, ny: hit.ny };
        sh.vx = bvx; sh.vy = bvy; sh.omega = 0; sh.ang = Math.atan2(hit.ny, hit.nx);
        g.landedOn = b; g.trail = [];
        setStatus(g, 'landed', `on ${b.name} at ${v.toFixed(2)} m/s`);
        popup(g, 'TOUCHDOWN!', '#8ff0b0');
      } else if (v < S.crashSpeed) {
        sh.vx -= (1 + S.bounce) * vn * hit.nx; sh.vy -= (1 + S.bounce) * vn * hit.ny;
        sh.omega += (Math.random() - 0.5) * Math.min(3, Math.abs(vn));
        hurtShip(g, S.bumpDamage * v, 'BONK!');
        burst(g, 'dust', sh.x - hit.nx * S.radius, sh.y - hit.ny * S.radius, 10, { vx: bvx, vy: bvy, col: b.color[1] });
      } else {
        die(g, `hit ${b.name} at ${v.toFixed(1)} m/s`);
      }
      return;
    }
    const hostD = {};                                                         // distance to each rubble host, once per step
    for (const rk of w.rocks) {
      const hi = rk.host.idx, dh = hostD[hi] ?? (hostD[hi] = Math.hypot(sh.x - st[hi][0], sh.y - st[hi][1]));
      if (Math.abs(dh - rk.a) > rk.r + S.radius) continue;                     // cheap band test
      const [rx, ry, rvx, rvy] = World.rockState(w, rk, g.t);
      const dx = sh.x - rx, dy = sh.y - ry, d = Math.hypot(dx, dy), hitR = rk.r * 0.9 + S.radius * 0.8;
      if (d >= hitR) continue;
      const nx = dx / d, ny = dy / d, vn = (sh.vx - rvx) * nx + (sh.vy - rvy) * ny;
      if (vn >= 0) continue;
      sh.vx -= (1 + S.bounce) * vn * nx; sh.vy -= (1 + S.bounce) * vn * ny;
      sh.x = rx + nx * (hitR + 0.05); sh.y = ry + ny * (hitR + 0.05);
      sh.omega += (Math.random() - 0.5) * Math.min(3, Math.abs(vn));
      hurtShip(g, Math.min(45, S.bumpDamage * -vn), ['CLANK!', 'BONK!', 'THUD!'][Math.floor(Math.random() * 3)]);   // capped: rubble dents, it does not one-shot
      return;
    }
  }

  // instant velocity change (Orion pulse, explosions); lifts the ship off the ground or a dock
  function impulse(g, dvx, dvy) {
    if (g.status === 'dead') return;
    if (g.status === 'docked') release(g, 0);
    if (g.status === 'landed') { g.landedOn = null; g.land = null; g.everFlew = true; setStatus(g, 'flying', 'kicked off the ground'); }
    g.sh.vx += dvx; g.sh.vy += dvy;
  }


  // ======================================================================
  //  DAMAGE, TARGETS, RAYCAST
  //  target = { id, team, x, y, r, name, hit(g, dmg, kind, src) }   teams: 'player' | 'pirate' | 'bug'
  // ======================================================================

  const HIT_WORD = { bullet: 'PING!', bite: 'CHOMP!', blast: 'BOOM!', laser: 'ZZT!', bump: 'BONK!' };

  function hurtShip(g, dmg, word = 'OUCH!') {
    if (g.status === 'dead' || dmg <= 0) return;
    dmg *= 1 - Math.min(0.8, g.S.armor || 0);
    g.sh.hull -= dmg; g.shake = Math.min(1, g.shake + dmg / 40);
    popup(g, word, '#ffd166', g.sh.x, g.sh.y);
    log(g, `${word} -${dmg.toFixed(0)} hull`);
    if (g.sh.hull <= 0) die(g, 'hull gave out');
  }
  function hurtAstro(g, dmg, word = 'OOF!') {
    const A = g.astro; if (!A.on || dmg <= 0) return;
    A.hp -= dmg; g.shake = Math.min(1, g.shake + dmg / 60);
    popup(g, word, '#ff9fb2', A.x, A.y);
  }
  function healShip(g, amt) { g.sh.hull = Math.min(g.S.hull, g.sh.hull + amt); }

  function die(g, why) {
    if (g.status === 'dead') return;
    g.sh.hull = Math.max(0, g.sh.hull); g.crashMsg = why; g.deadAt = g.real;
    g.landedOn = null; g.land = null; g.attach = null; g.ionOn = false;
    setStatus(g, 'dead', why);
    popup(g, 'KABOOM!', '#ff6b6b', g.sh.x, g.sh.y); g.shake = 1;
    burst(g, 'boom', g.sh.x, g.sh.y, 70, { vx: g.sh.vx * 0.3, vy: g.sh.vy * 0.3, speed: 14 });
    each(g, 'died', why);
    save(g);
  }

  function targets(g) {
    const out = [];
    if (g.status !== 'dead') out.push({ id: 'ship', team: 'player', x: g.sh.x, y: g.sh.y, r: g.S.radius, name: g.S.name,
                                        hit: (g2, dmg, kind) => hurtShip(g2, dmg, HIT_WORD[kind] || 'OUCH!') });
    if (g.astro.on) out.push({ id: 'astro', team: 'player', x: g.astro.x, y: g.astro.y, r: g.astro.r, name: 'you',
                               hit: (g2, dmg, kind) => hurtAstro(g2, dmg, HIT_WORD[kind] || 'OOF!') });
    return out.concat(gather(g, 'targets'));
  }

  // area hit: { x, y, r, dmg, kind, team (attacker's, skipped), falloff, dig (dig power: blasts terrain) }
  function dealDamage(g, h) {
    let n = 0;
    for (const tg of targets(g)) {
      if (h.team && tg.team === h.team) continue;
      const d = Math.hypot(tg.x - h.x, tg.y - h.y), reach = (h.r || 0) + tg.r;
      if (d > reach) continue;
      tg.hit(g, h.dmg * (h.falloff ? Math.max(0.25, 1 - d / reach) : 1), h.kind || 'hit', h);
      n++;
    }
    if (h.dig) { const nb = nearestBody(g, h.x, h.y); if (nb.alt < (h.r || 1)) dig(g, nb.b, h.x, h.y, h.r || 1, h.dig); }
    return n;
  }

  // first thing a ray hits -> null | { t, x, y, target, body, mat }   opt: { team (skip own team), skip (target id), terrain, targets }
  function raycast(g, x, y, dx, dy, len, opt = {}) {
    let best = null;
    if (opt.terrain !== false) {
      const st = World.states(g.w, g.t);
      for (const b of g.w.bodies) {
        const bx = st[b.idx][0], by = st[b.idx][1], reach = b.R * (1 + b.shape) + 1;
        const tc = Math.max(0, Math.min(len, (bx - x) * dx + (by - y) * dy));
        if (Math.hypot(x + dx * tc - bx, y + dy * tc - by) > reach) continue;
        const h = Terrain.raycast(Terrain.of(b), x - bx, y - by, dx, dy, best ? best.t : len);
        if (h && (!best || h.t < best.t)) best = { t: h.t, body: b, target: null, mat: h.mat };
      }
    }
    if (opt.targets !== false) for (const tg of targets(g)) {
      if ((opt.team && tg.team === opt.team) || tg.id === opt.skip) continue;
      const fx = x - tg.x, fy = y - tg.y, b2 = fx * dx + fy * dy, c = fx * fx + fy * fy - tg.r * tg.r, disc = b2 * b2 - c;
      if (disc < 0) continue;
      const t = -b2 - Math.sqrt(disc), tt = t >= 0 ? t : (c < 0 ? 0 : -1);
      if (tt >= 0 && tt <= len && (!best || tt < best.t)) best = { t: tt, body: null, target: tg };
    }
    return best && { ...best, x: x + dx * best.t, y: y + dy * best.t };
  }


  // ======================================================================
  //  TERRAIN HELPERS (world coords)
  // ======================================================================

  // body whose surface is closest -> { b, lx, ly, d, alt, bx, by, bvx, bvy, ux, uy }   (u = local up)
  function nearestBody(g, x, y, t = g.t) {
    const st = World.states(g.w, t);
    let best = null;
    for (const b of g.w.bodies) {
      const [bx, by, bvx, bvy] = st[b.idx], lx = x - bx, ly = y - by, d = Math.hypot(lx, ly) || 1e-9;
      const alt = d - World.surfaceR(b, Math.atan2(ly, lx));
      if (!best || alt < best.alt) best = { b, lx, ly, d, alt, bx, by, bvx, bvy, ux: lx / d, uy: ly / d };
    }
    return best;
  }

  // dig at world (x, y) on body b.  opt: { collect: spawn ore chunks, toward: [x, y] they fly to }
  function dig(g, b, x, y, r, power, opt = {}) {
    const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    const res = Terrain.dig(Terrain.of(b), x - bx, y - by, r, power);
    if (!res.cells) return res;
    for (const p of g.pickups) if (p.rest && p.rest.b === b && Math.hypot(p.rest.lx - (x - bx), p.rest.ly - (y - by)) < r + 1.5) p.rest = null;
    const fly = () => {
      if (!opt.toward) return [bvx + (Math.random() - 0.5), bvy + (Math.random() - 0.5)];
      const dx = opt.toward[0] - x, dy = opt.toward[1] - y, d = Math.hypot(dx, dy) || 1;
      return [bvx + dx / d * 3 + (Math.random() - 0.5) * 0.6, bvy + dy / d * 3 + (Math.random() - 0.5) * 0.6];
    };
    for (const gm of res.gems) {
      gm.state = 'taken';
      const [vx, vy] = fly();
      spawnPickup(g, { x: bx + gm.lx, y: by + gm.ly, vx, vy, item: gm.type, qty: 1 });
      popup(g, `${ITEMS[gm.type].name.toUpperCase()}!`, ITEMS[gm.type].col, bx + gm.lx, by + gm.ly);
      log(g, `gem freed: ${gm.type} on ${b.name}`);
    }
    if (opt.collect) {
      const buf = g.digBuf[b.id] || (g.digBuf[b.id] = {});
      for (const [item, kg] of Object.entries(res.yield)) {
        buf[item] = (buf[item] || 0) + kg;
        while (buf[item] >= CHUNK_KG) {
          buf[item] -= CHUNK_KG;
          const [vx, vy] = fly();
          spawnPickup(g, { x, y, vx, vy, item, qty: CHUNK_KG });
        }
      }
    }
    return res;
  }


  // ======================================================================
  //  CARGO, BACKPACK, PICKUPS
  // ======================================================================

  const kgOf = (bag) => Object.entries(bag).reduce((s, [k, q]) => s + q * (ITEMS[k] ? ITEMS[k].kg : 1), 0);
  function addTo(bag, cap, item, qty) {
    const kg = ITEMS[item] ? ITEMS[item].kg : 1, room = cap - kgOf(bag);
    const n = Math.max(0, Math.min(qty, Math.floor(room / kg + 1e-9)));
    if (n) bag[item] = (bag[item] || 0) + n;
    return n;
  }
  function addCargo(g, item, qty) { const n = addTo(g.cargo, g.S.cargoCap, item, qty); g.sh.cargoKg = kgOf(g.cargo); return n; }
  function removeCargo(g, item, qty) {
    const n = Math.min(qty, g.cargo[item] || 0);
    if (n) { g.cargo[item] -= n; if (!g.cargo[item]) delete g.cargo[item]; g.sh.cargoKg = kgOf(g.cargo); }
    return n;
  }
  function addPack(g, item, qty) {                                    // gems ride in a pocket: up to 4 kg over a full pack
    return addTo(g.pack, g.S.packCap + (ITEMS[item] && ITEMS[item].kind === 'gem' ? 4 : 0), item, qty);
  }
  function unloadPack(g) {
    const moved = {};
    for (const [item, q] of Object.entries(g.pack)) {
      const n = addCargo(g, item, q);
      if (n) { moved[item] = n; g.pack[item] -= n; if (!g.pack[item]) delete g.pack[item]; }
    }
    return moved;
  }

  // pickup = { x, y, vx, vy, item, qty, age, rest: null | { b, lx, ly } }
  function spawnPickup(g, p) {
    const pk = { x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0, item: p.item, qty: p.qty || 1, age: 0, rest: null };
    g.pickups.push(pk);
    if (g.pickups.length > 260) g.pickups.shift();
    return pk;
  }

  function tickPickups(g, simDt) {
    if (!g.pickups.length) return;
    const nSub = Math.min(60, Math.max(1, Math.ceil(simDt * 60))), h = simDt / nSub, A = g.astro, sh = g.sh, S = g.S;
    const shipR = S.radius + 1.2 + (S.tractor || 0);
    let packFull = false;
    // substep s ends at ts: the moons move during a warp frame, so each substep sees them where they really are then
    for (let s = 0; s < nSub; s++) {
      const ts = g.t - simDt + (s + 1) * h;
      for (const p of g.pickups) {
        if (p.kinematic || p.rest) continue;                       // kinematic: a module moves it (EVA chunks riding the beam home)
        let [ax, ay] = World.gravity(g.w, p.x, p.y, ts);
        if (A.on) {
          const dx = A.x - p.x, dy = A.y - p.y, d = Math.hypot(dx, dy);
          if (d < 3.2 && d > 0.05) { ax += dx / d * 14 + (A.vx - p.vx) * 3; ay += dy / d * 14 + (A.vy - p.vy) * 3; }
        }
        if (S.tractor && g.status !== 'dead') {
          const dx = sh.x - p.x, dy = sh.y - p.y, d = Math.hypot(dx, dy);
          if (d < shipR + 6 && d > 0.05) { ax += dx / d * 8 + (sh.vx - p.vx) * 2; ay += dy / d * 8 + (sh.vy - p.vy) * 2; }
        }
        p.vx += ax * h; p.vy += ay * h; p.x += p.vx * h; p.y += p.vy * h;
        const nb = nearestBody(g, p.x, p.y, ts);
        if (nb.alt > 2) continue;
        const hit = Terrain.collideCircle(Terrain.of(nb.b), nb.lx, nb.ly, 0.3);
        if (!hit) continue;
        p.x += hit.nx * hit.depth; p.y += hit.ny * hit.depth;
        const rvx = p.vx - nb.bvx, rvy = p.vy - nb.bvy, vn = rvx * hit.nx + rvy * hit.ny;
        if (vn < 0) {
          const tx = rvx - vn * hit.nx, ty = rvy - vn * hit.ny;
          p.vx = nb.bvx + tx * 0.6 - vn * 0.25 * hit.nx; p.vy = nb.bvy + ty * 0.6 - vn * 0.25 * hit.ny;
        }
        if (Math.hypot(p.vx - nb.bvx, p.vy - nb.bvy) < 0.12) p.rest = { b: nb.b, lx: p.x - nb.bx, ly: p.y - nb.by };
      }
    }
    for (const p of g.pickups) {
      p.age += simDt;
      if (p.rest && !p.kinematic) {                                  // resting on a moon: ride along with it
        const [bx, by, bvx, bvy] = World.bodyState(g.w, p.rest.b, g.t);
        p.x = bx + p.rest.lx; p.y = by + p.rest.ly; p.vx = bvx; p.vy = bvy;
        if (A.on && Math.hypot(A.x - p.x, A.y - p.y) < 3.2) p.rest = null;
      }
      // -------- collect: astronaut's backpack first, else the ship's hold --------
      if (A.on && Math.hypot(A.x - p.x, A.y - p.y) < A.r + 0.5) {
        const n = addPack(g, p.item, p.qty);
        if (n) { p.qty -= n; gain(g, p.item, n); }
        if (p.qty > 0) packFull = true;
      } else if (g.status !== 'dead' && !A.on && Math.hypot(sh.x - p.x, sh.y - p.y) < shipR) {   // on foot, the pack gets it
        const n = addCargo(g, p.item, p.qty);
        if (n) { p.qty -= n; gain(g, p.item, n); }
      }
    }
    if (packFull && g.real - (g.packFullAt || -9) > 2) { g.packFullAt = g.real; popup(g, 'PACK FULL', '#ff9f1c', A.x, A.y); }
    g.pickups = g.pickups.filter((p) => p.qty > 0 && p.age < 900);
    if (g.gain && g.real - g.gain.t0 > 0.45) {
      const txt = Object.entries(g.gain.items).map(([k, q]) => `+${q * ITEMS[k].kg} kg ${ITEMS[k].name.toLowerCase()}`).join('  ');
      popup(g, txt, ITEMS[Object.keys(g.gain.items)[0]].col, g.gain.x, g.gain.y, 18);
      g.gain = null;
    }
  }
  function gain(g, item, n) {
    const at = g.astro.on ? g.astro : g.sh;
    if (!g.gain) g.gain = { items: {}, t0: g.real, x: at.x, y: at.y };
    g.gain.items[item] = (g.gain.items[item] || 0) + n;
  }


  // ======================================================================
  //  DERIVED STATE: ref body, orbit, preview, clearance, nav target approach
  // ======================================================================

  function refresh(g) {
    const { sh, w, t } = g;
    g.ref = World.refBody(w, sh.x, sh.y, t);
    g.orb = Physics.orbitRel(sh, g.ref, t, w);
    if (g.status !== 'flying') g.pred = null;
    else {
      const T = g.orb.E < 0 ? g.orb.T * 0.98 : SIM.predictMax * 0.6;
      g.pred = Physics.predict(sh, t, w, Math.min(SIM.predictMax, Math.max(SIM.predictMin, T)), SIM.predictSteps, g.S.radius * 0.8);
    }
    let near = Infinity;
    const st = World.states(w, t);
    for (const b of w.bodies) {
      const dx = sh.x - st[b.idx][0], dy = sh.y - st[b.idx][1];
      near = Math.min(near, Math.hypot(dx, dy) - World.surfaceR(b, Math.atan2(dy, dx)) - g.S.radius);
    }
    let ttc = Infinity, ttcGap = Infinity;                                      // the preview ignores rubble: time to the first closing rock
    for (const rk of w.rocks) {
      const [rx, ry, rvx, rvy] = World.rockState(w, rk, t), dx = sh.x - rx, dy = sh.y - ry, d = Math.hypot(dx, dy) || 1e-9, gap = d - rk.r - g.S.radius;
      near = Math.min(near, gap);
      const vr = ((sh.vx - rvx) * dx + (sh.vy - rvy) * dy) / d;
      if (vr < -0.05 && gap / -vr < ttc) { ttc = Math.max(0, gap) / -vr; ttcGap = gap; }
    }
    g.nearDist = near; g.rockTTC = g.status === 'flying' && ttcGap < 400 ? ttc : Infinity;
    g.maxCeresR = Math.max(g.maxCeresR, Math.hypot(sh.x - st[0][0], sh.y - st[0][1]));

    // -------- nav target: closest approach along the predicted path --------
    g.approach = null;
    const tg = navTarget(g);
    if (g.navId && !tg) g.navId = null;
    if (tg) {
      const [tx, ty, tvx, tvy] = tg.state(t);
      const ap = { tg, dNow: Math.hypot(sh.x - tx, sh.y - ty) - (tg.r || 0), vNow: Math.hypot(sh.vx - tvx, sh.vy - tvy),
                   rvx: sh.vx - tvx, rvy: sh.vy - tvy, d: Infinity, t, i: -1 };
      if (g.pred) {
        const P = g.pred.pts;
        P.forEach(([x, y, tt], i) => { const s = tg.state(tt), d = Math.hypot(x - s[0], y - s[1]); if (d < ap.d) { ap.d = d; ap.i = i; } });
        const i = ap.i, a = P[Math.max(0, i - 1)], b2 = P[Math.min(P.length - 1, i + 1)], s = tg.state(P[i][2]);
        const vx = (b2[0] - a[0]) / Math.max(1e-6, b2[2] - a[2]), vy = (b2[1] - a[1]) / Math.max(1e-6, b2[2] - a[2]);
        Object.assign(ap, { t: P[i][2], x: P[i][0], y: P[i][1], tx: s[0], ty: s[1], v: Math.hypot(vx - s[2], vy - s[3]), d: ap.d - (tg.r || 0) });
      }
      g.approach = ap;
    }
  }

  function navTargets(g) {
    const list = g.w.bodies.map((b) => ({ id: 'body:' + b.id, name: b.name, col: b.color[2], r: b.R, kind: 'body',
                                          state: (t) => World.bodyState(g.w, b, t) }));
    return list.concat(gather(g, 'navTargets'));
  }
  const navTarget = (g) => (g.navId ? navTargets(g).find((n) => n.id === g.navId) || null : null);
  function cycleNav(g) {
    const list = navTargets(g), i = list.findIndex((n) => n.id === g.navId);
    g.navId = i + 1 >= list.length ? null : list[i + 1].id;
    toast(g, g.navId ? `TARGET: ${list[i + 1].name.toUpperCase()}` : 'TARGET CLEARED', '#7cf5d6', 'nav');
    refresh(g);
  }

  function gatherPrompts(g) {
    const byKey = {};
    for (const it of gather(g, 'interactions')) {
      if (!it || !it.key || !it.act) continue;
      if (!byKey[it.key] || (it.dist || 0) < (byKey[it.key].dist || 0)) byKey[it.key] = it;
    }
    return Object.values(byKey);
  }


  // ======================================================================
  //  GOALS (jobs) — modules add their own with Game.addGoals
  //  goal = { id, order, text, reward, test(g) }   (test optional: a module may call Game.goal(g, id))
  // ======================================================================

  const GOALS = [];
  function addGoals(list) { for (const gl of list) if (!GOALS.some((x) => x.id === gl.id)) GOALS.push(gl); GOALS.sort((a, b) => a.order - b.order); }

  addGoals([
    { id: 'land_ceres', order: 20, reward: 50,  text: 'Fly down and land on Ceres',
      test: (g) => g.status === 'landed' && g.landedOn.id === 'ceres' && g.everFlew },
    { id: 'kiwi',       order: 60, reward: 150, text: 'Land on Kiwi (the green one)',
      test: (g) => g.status === 'landed' && g.landedOn.id === 'kiwi' },
    { id: 'seed',       order: 62, reward: 200, text: 'Land on Seed, Kiwi\'s tiny moon',
      test: (g) => g.status === 'landed' && g.landedOn.id === 'seed' },
    { id: 'glimmer',    order: 90, reward: 600, text: 'Land on Glimmer, past the outer ring',
      test: (g) => g.status === 'landed' && g.landedOn.id === 'glimmer' },
  ]);

  function goal(g, id) {
    if (g.done[id] !== undefined) return false;
    const gl = GOALS.find((x) => x.id === id);
    g.done[id] = g.t;
    if (gl && gl.reward) g.money += gl.reward;
    toast(g, gl ? `JOB DONE: ${gl.text.replace(/\s*\([^)]*\)/g, '').toUpperCase()}${gl.reward ? `  +$${gl.reward}` : ''}` : id.toUpperCase(), '#8ff0b0');
    log(g, `GOAL ${id}${gl && gl.reward ? ` +$${gl.reward}` : ''}`);
    each(g, 'goal', id);
    save(g);
    return true;
  }
  function checkGoals(g) {
    for (const gl of GOALS) {
      if (g.done[gl.id] !== undefined || !gl.test) continue;
      let ok = false;
      try { ok = gl.test(g); } catch (e) { if (api.strict) throw e; }
      if (ok) goal(g, gl.id);
    }
  }


  // ======================================================================
  //  SAVE (localStorage; every failure is ignored)
  // ======================================================================

  function save(g) {
    g.lastSave = g.real;
    if (g.dev || g.noSave || typeof localStorage === 'undefined') return false;
    const data = { v: 3, seed: g.seed, money: g.money, done: g.done, cargo: g.cargo, pack: g.pack,
                   ship: { fuel: g.sh.fuel, xe: g.sh.xe, rcs: g.sh.rcs, hull: g.sh.hull },
                   flight: flightState(g), ter: terrainState(g), mods: {} };
    for (const m of mods) { const s = call(g, m, 'save'); if (s !== undefined) data.mods[m.id] = s; }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function readSave() {
    try { const s = typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }
  function applySave(g, d, phase) {
    if (phase === 'pre') {
      g.money = d.money ?? g.money; g.done = d.done || {}; g.cargo = d.cargo || {}; g.pack = d.pack || {};
      for (const m of mods) if (d.mods && d.mods[m.id] !== undefined) call(g, m, 'load', d.mods[m.id]);
    } else if (d.ship) {
      for (const k of ['fuel', 'xe', 'rcs', 'hull']) if (typeof d.ship[k] === 'number') g.sh[k] = Math.min(d.ship[k], k === 'xe' ? g.S.ionTank : g.S[k]);
      if (g.sh.hull <= 0) g.sh.hull = g.S.hull * 0.5;
      g.sh.cargoKg = kgOf(g.cargo);
    }
  }
  // where the ship is, so a reload is not a free tow (dead: the crash tow happens on load; EVA: back aboard)
  function flightState(g) {
    const sh = g.sh, f = { t: g.t, status: g.status, x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy, ang: sh.ang, omega: sh.omega };
    if (g.status === 'landed' && g.landedOn) { f.on = g.landedOn.id; f.land = g.land; }
    if (g.status === 'docked' && g.attach) f.dock = g.attach.station;
    return f;
  }
  function restoreFlight(g, f) {
    if (!['x', 'y', 'vx', 'vy', 'ang', 'omega'].every((k) => Number.isFinite(f[k])) || f.status === 'dead') return false;
    g.spawn = 'saved'; g.status = 'flying'; g.landedOn = null; g.land = null; g.attach = null; g.trail = []; g.everFlew = true;
    Object.assign(g.sh, { x: f.x, y: f.y, vx: f.vx, vy: f.vy, ang: f.ang, omega: f.omega });
    if (f.status === 'docked') return !!(f.dock && typeof Stations !== 'undefined' && Stations.dock(g, f.dock, true));
    const b = f.on && g.w.byId[f.on], L = f.land;
    if (f.status === 'landed' && b && L && [L.lx, L.ly, L.nx, L.ny].every(Number.isFinite)) {
      g.landedOn = b; g.land = { lx: L.lx, ly: L.ly, nx: L.nx, ny: L.ny }; g.status = 'landed'; holdLanded(g, 1);
    }
    return true;
  }
  // dug holes and taken gems per body, so dug-out rocks stay dug
  function terrainState(g) {
    const out = {};
    for (const b of g.w.bodies) { const s = b.ter && Terrain.snapshot(b.ter); if (s) out[b.id] = s; }
    return out;
  }
  function restoreTerrain(g, ter) {
    if (!ter || typeof ter !== 'object') return;
    for (const b of g.w.bodies) if (ter[b.id]) Terrain.restore(Terrain.of(b), ter[b.id]);
  }
  function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }


  // ======================================================================
  //  EFFECTS, STATUS, LOG
  // ======================================================================

  // particle kinds drawn by the renderer: boom, puff, smoke, dust, spark, flash, ion; anything else = dot with col/size
  function burst(g, kind, x, y, n, o = {}) {
    const sp = o.speed ?? 4;
    for (let i = 0; i < n; i++) {
      const a = o.dir != null ? o.dir + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * 2 * Math.PI, v = sp * (0.3 + Math.random());
      const life = (o.life ?? 1) * (0.5 + Math.random() * 0.8);
      g.particles.push({ x, y, vx: (o.vx || 0) + Math.cos(a) * v, vy: (o.vy || 0) + Math.sin(a) * v, life, max: life, kind, col: o.col, size: o.size });
    }
  }
  function spawnExhaust(g, thr) {
    const sh = g.sh, S = g.S, back = sh.ang + Math.PI, bx = sh.x + Math.cos(back) * S.length * 0.5, by = sh.y + Math.sin(back) * S.length * 0.5;
    for (let i = 0; i < 2; i++) {
      const a = back + (Math.random() - 0.5) * 0.45, sp = 6 + Math.random() * 10 * thr;
      g.particles.push({ x: bx, y: by, vx: sh.vx + Math.cos(a) * sp, vy: sh.vy + Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, max: 0.8, kind: 'smoke' });
    }
  }
  function spawnIon(g) {
    const sh = g.sh, back = sh.ang + Math.PI, bx = sh.x + Math.cos(back) * g.S.length * 0.5, by = sh.y + Math.sin(back) * g.S.length * 0.5;
    g.particles.push({ x: bx, y: by, vx: sh.vx + Math.cos(back) * 9, vy: sh.vy + Math.sin(back) * 9, life: 0.6, max: 0.6, kind: 'ion' });
  }
  function spawnPuff(g, ctrl) {
    const sh = g.sh, c = Math.cos(sh.ang), s = Math.sin(sh.ang);
    const emit = (fx, fy, dir) => {
      const px = sh.x + c * fx - s * fy, py = sh.y + s * fx + c * fy, a = sh.ang + dir;
      g.particles.push({ x: px, y: py, vx: sh.vx + Math.cos(a) * 6, vy: sh.vy + Math.sin(a) * 6, life: 0.25, max: 0.25, kind: 'puff' });
    };
    const spin = ctrl.rot || (ctrl.kill ? -Math.sign(sh.omega) : 0);
    if (spin > 0) { emit(3, -2, -Math.PI / 2); emit(-3, 2, Math.PI / 2); }
    if (spin < 0) { emit(3, 2, Math.PI / 2); emit(-3, -2, -Math.PI / 2); }
    if (ctrl.fwd > 0) emit(-2, 0, Math.PI);
    if (ctrl.fwd < 0) emit(4, 0, 0);
    if (ctrl.left > 0) emit(0, -2, -Math.PI / 2);
    if (ctrl.left < 0) emit(0, 2, Math.PI / 2);
  }

  // a popup near a moving rock rides along with it, so words said on Kiwi stay on Kiwi
  function popup(g, text, col = '#ffd166', x, y, size = 26) {
    const at = g.mode === 'eva' && g.astro.on ? g.astro : g.sh;
    const p = { text, col, x: x ?? at.x, y: y ?? at.y, t0: g.real, size };
    const nb = nearestBody(g, p.x, p.y);
    if (nb && nb.alt < 60 && nb.b.par) p.ride = { b: nb.b, lx: p.x - nb.bx, ly: p.y - nb.by };
    p.lift = g.popups.filter((q) => g.real - q.t0 < 0.7 && Math.hypot(q.x - p.x, q.y - p.y) < 2).length;   // stack, don't overlap
    g.popups.push(p);
    if (g.popups.length > 30) g.popups.shift();
    return p;
  }
  // key: a toast with the same key replaces the waiting one (rapid Tab presses, warp clicks)
  function toast(g, text, col = '#ffe2b0', key = null) {
    const last = g.toasts[g.toasts.length - 1];
    if (key && last && last.key === key) { Object.assign(last, { text, col, t0: last.t0 == null ? null : g.real }); return; }
    g.toasts.push({ text, col, t0: null, key });
    if (g.toasts.length > 4) g.toasts.shift();
  }

  function tickFx(g, dt) {
    for (const p of g.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    g.particles = g.particles.filter((p) => p.life > 0).slice(-900);
    g.popups = g.popups.filter((p) => g.real - p.t0 < 1.4);
    for (const p of g.popups) if (p.ride) { const [bx, by] = World.bodyState(g.w, p.ride.b, g.t); p.x = bx + p.ride.lx; p.y = by + p.ride.ly; }
    g.shake = Math.max(0, g.shake - dt * 2.5);
    if (g.toasts.length) { const t0 = g.toasts[0]; if (t0.t0 == null) t0.t0 = g.real; else if (g.real - t0.t0 > 2.4) g.toasts.shift(); }
  }

  function setStatus(g, status, why = '') {
    if (g.status === status) return;
    log(g, `${g.status} -> ${status}  ${why}`);
    g.status = status;
  }
  function log(g, msg) {
    g.events.push({ t: g.t, msg });
    if (g.events.length > 200) g.events.shift();
    if (!api.quiet) console.log(`[orbit] t=${g.t.toFixed(2)}  ${msg}`);
  }


  // ======================================================================
  //  HINT (highest priority wins; module hint hooks return a string or { text, pri })
  // ======================================================================

  function hint(g) {
    if (g.status === 'dead') return `Kaboom (${g.crashMsg}). Press R to get towed back to base. Upgrades are kept, cargo is lost.`;
    const cands = [];
    if (g.pred && g.pred.impact && g.status === 'flying' && g.everFlew) {
      const dt = g.pred.impact.t - g.t;
      cands.push({ pri: 80, text: `Path hits ${g.pred.impact.body.name} in ${dt.toFixed(0)} s. ${dt > 8 ? 'To land, point the nose at the ⊗ BRAKE marker and burn until under 2.5 m/s. To miss it, burn sideways.' : 'Brake now: nose on ⊗ BRAKE, hold W!'}` });
    }
    if (g.rockTTC < 8 && g.mode === 'ship') cands.push({ pri: 82, text: `Rock ahead: contact in ${g.rockTTC.toFixed(0)} s. Dodge with the arrow keys or a short sideways burn.` });
    if (g.sh.rcs <= 0 && g.mode === 'ship' && g.status !== 'dead') cands.push({ pri: 75, text: 'RCS empty: only the slow reaction wheel turns you, and the arrow keys do nothing. Dock or use a pad depot to restock.' });
    if (Math.abs(g.sh.omega) > 1.2 && g.mode === 'ship' && g.status !== 'dead') cands.push({ pri: 70, text: 'You are spinning fast. Tap the opposite way, or hold S to stop it.' });
    for (const m of mods) {
      const r = call(g, m, 'hint');
      if (r) cands.push(typeof r === 'string' ? { pri: 50, text: r } : r);
    }
    if (g.status === 'landed' && !g.everFlew) cands.push({ pri: 10, text: 'Hold W to fire the engine and lift off. Once airborne, A/D spin you with thrusters and S stops the spin.' });
    if (g.navId && g.approach && g.approach.i >= 0) cands.push({ pri: 15, text: `Closest approach to ${g.approach.tg.name}: ${fmtDist(g.approach.d)} in ${(g.approach.t - g.t).toFixed(0)} s. Tab cycles targets.` });
    cands.push({ pri: 1, text: 'Tab (or click a rock) picks a target and shows your closest approach. , and . change warp.' });
    cands.sort((a, b) => b.pri - a.pri);
    return cands[0].text;
  }
  const fmtDist = (m) => !isFinite(m) ? '∞' : Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;


  return Object.assign(api, {
    register, mods, call, each, gather, first,
    create, update, recalc, respawn, place, landAt, circularAround, addSpawn, SPAWNS, SPAWN_ORDER, defaultSpawn,
    dock, release, impulse, hurtShip, hurtAstro, healShip, die, targets, dealDamage, raycast,
    nearestBody, dig, addCargo, removeCargo, addPack, unloadPack, kgOf, spawnPickup,
    refresh, navTargets, navTarget, cycleNav, warpStep, setWarp, toggleIon,
    GOALS, addGoals, goal, save, wipeSave, readSave,
    burst, popup, toast, setStatus, log, hint, fmtDist, ITEMS, CHUNK_KG,
  });
})();

if (typeof module !== 'undefined') module.exports = Game;
