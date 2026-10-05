// ======================================================================
//  GAME  —  flight state, landing & collisions, preview, goals, hints
// ======================================================================

const Game = (() => {

  const S = CONFIG.ship, SIM = CONFIG.sim;

  // ---------------- spawn points ----------------

  const SPAWNS = ['pad', 'orbit', 'belt', 'kiwi'];
  const SPAWN_NAMES = { pad: 'Ceres launch pad', orbit: 'low Ceres orbit', belt: 'inside the rubble belt', kiwi: 'orbiting Kiwi' };

  function circularAround(sh, w, b, r, th, t) {
    const [bx, by, bvx, bvy] = World.bodyState(w, b, t), vc = Math.sqrt(b.mu / r);
    Object.assign(sh, { x: bx + r * Math.cos(th), y: by + r * Math.sin(th),
                        vx: bvx - vc * Math.sin(th), vy: bvy + vc * Math.cos(th), ang: th + Math.PI / 2 });
  }

  // ---------------- flight-school goals ----------------

  const GOALS = [
    { id: 'liftoff', text: 'Lift off from Ceres' },
    { id: 'orbit',   text: 'Orbit Ceres (no impact on the path)' },
    { id: 'belt',    text: 'Cross the rubble belt (r > 650 m)' },
    { id: 'dorito',  text: 'Get captured by Dorito' },
    { id: 'kiwi',    text: 'Land on Kiwi' },
    { id: 'seed',    text: 'Land on Seed, Kiwi\'s moon (bonus)' },
    { id: 'home',    text: 'Come home: land on Ceres' },
  ];
  const TOAST = { liftoff: 'LIFTOFF!', orbit: 'ORBIT!', belt: 'THROUGH THE RUBBLE!', dorito: 'CAPTURED BY DORITO!',
                  kiwi: 'KIWI TOUCHDOWN!', seed: 'SEED SECURED!', home: 'HOME SWEET CERES' };

  // ---------------- new flight ----------------

  function create(seed, spawn = 'pad') {
    const w = World.create(CONFIG, seed), sh = Physics.newShip(CONFIG), ceres = w.byId.ceres;
    const g = { w, sh, t: 0, spawn, status: 'flying', landedOn: null, landOff: null,
                warpIdx: 0, fired: { main: 0, rot: 0, trans: 0 }, pred: null, ref: ceres, orb: null,
                done: {}, popups: [], particles: [], trail: [], events: [], toast: null,
                maxCeresR: 0, stepsLastFrame: 0, nearDist: Infinity, crashMsg: '' };
    if (spawn === 'pad')   { pin(g, ceres, [0, 1]); g.status = 'landed'; g.landedOn = ceres; }
    if (spawn === 'orbit') circularAround(sh, w, ceres, ceres.R + 60, Math.PI / 2, 0);
    if (spawn === 'belt')  circularAround(sh, w, ceres, 550, Math.PI / 2, 0);
    if (spawn === 'kiwi')  circularAround(sh, w, w.byId.kiwi, 125, w.byId.kiwi.phase, 0);
    if (spawn !== 'pad') g.done.liftoff = 0;
    log(g, `spawn ${spawn}`);
    refresh(g);
    return g;
  }

  // ---------------- per-frame update ----------------
  //  input: { thrust, fine, rotL, rotR, kill, fwd, left }

  function update(g, input, frameDt) {
    tickFx(g, frameDt);
    if (g.status === 'dead') return;

    const ctrl = {
      main: input.thrust ? (input.fine ? S.fine : 1) : 0,
      rot: (input.rotL ? 1 : 0) - (input.rotR ? 1 : 0),
      kill: input.kill, fwd: input.fwd, left: input.left,
    };
    const firing = ctrl.main || ctrl.rot || ctrl.kill || ctrl.fwd || ctrl.left;

    // -------- warp limits --------
    if (firing) g.warpIdx = 0;
    if (g.nearDist < 60) g.warpIdx = Math.min(g.warpIdx, SIM.warps.indexOf(SIM.nearWarp));
    const warp = SIM.warps[g.warpIdx];

    // -------- fixed steps --------
    const n = Math.max(1, Math.round(Math.min(frameDt, 1 / 20) * warp / SIM.dt));
    const fired = { main: 0, rot: 0, trans: 0 };
    for (let i = 0; i < n && g.status !== 'dead'; i++) {
      const f = Physics.step(g.sh, ctrl, g.t, SIM.dt, g.w, CONFIG);
      g.t += SIM.dt;
      fired.main = Math.max(fired.main, f.main); fired.rot = Math.max(fired.rot, f.rot); fired.trans = Math.max(fired.trans, f.trans);
      if (g.status === 'landed') holdOnSurface(g); else contacts(g);
    }
    g.fired = fired; g.stepsLastFrame = n;

    if (fired.main) spawnExhaust(g, fired.main);
    if (fired.rot || fired.trans) spawnPuff(g, ctrl);
    if (g.status === 'flying' && (!g.trail.length || g.t - g.trail[g.trail.length - 1][2] > 0.3)) {
      g.trail.push([g.sh.x, g.sh.y, g.t]); if (g.trail.length > 800) g.trail.shift();
    }
    refresh(g);
    checkGoals(g);
  }

  // ---------------- derived state: ref body, orbit, preview, nearest hazard ----------------

  function refresh(g) {
    const { sh, w, t } = g;
    g.ref = World.refBody(w, sh.x, sh.y, t);
    g.orb = Physics.orbitRel(sh, g.ref, t, w);
    if (g.status === 'landed') { g.pred = null; }
    else {
      const T = g.orb.E < 0 ? g.orb.T * 0.98 : SIM.predictMax * 0.6;
      g.pred = Physics.predict(sh, t, w, Math.min(SIM.predictMax, Math.max(SIM.predictMin, T)), SIM.predictSteps);
    }
    let near = Infinity;
    for (const b of w.bodies) { const [bx, by] = World.bodyState(w, b, t); near = Math.min(near, Math.hypot(sh.x - bx, sh.y - by) - b.R); }
    for (const rk of w.rocks) { const [rx, ry] = World.rockState(w, rk, t); near = Math.min(near, Math.hypot(sh.x - rx, sh.y - ry) - rk.r); }
    g.nearDist = near;
    const [cx, cy] = World.bodyState(w, w.byId.ceres, t);
    g.maxCeresR = Math.max(g.maxCeresR, Math.hypot(sh.x - cx, sh.y - cy));
  }

  // ---------------- landed: ride along with the body ----------------

  function pin(g, b, nrm) {
    const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t), d = b.R + S.radius;
    Object.assign(g.sh, { x: bx + nrm[0] * d, y: by + nrm[1] * d, vx: bvx, vy: bvy });
    g.landOff = nrm;
  }

  function holdOnSurface(g) {
    const b = g.landedOn, [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    const dx = g.sh.x - bx, dy = g.sh.y - by, d = Math.hypot(dx, dy);
    const vr = ((g.sh.vx - bvx) * dx + (g.sh.vy - bvy) * dy) / d;     // net push away from the ground?
    if (vr > 1e-4) { setStatus(g, 'flying', `took off from ${b.name}`); g.landedOn = null; return; }
    pin(g, b, g.landOff);
  }

  // ---------------- collisions: big bodies & rubble ----------------

  function contacts(g) {
    const { sh, w, t } = g;
    for (const b of w.bodies) {
      const [bx, by, bvx, bvy] = World.bodyState(w, b, t);
      const dx = sh.x - bx, dy = sh.y - by, d = Math.hypot(dx, dy);
      if (d >= b.R + S.radius) continue;
      const nx = dx / d, ny = dy / d, rvx = sh.vx - bvx, rvy = sh.vy - bvy, v = Math.hypot(rvx, rvy);
      if (v < S.landSpeed) {
        sh.omega = 0; sh.ang = Math.atan2(ny, nx);
        pin(g, b, [nx, ny]); g.landedOn = b; g.trail = [];
        setStatus(g, 'landed', `on ${b.name} at ${v.toFixed(2)} m/s`);
        popup(g, 'TOUCHDOWN!', '#8ff0b0');
      } else if (v < S.crashSpeed) {
        bounce(g, nx, ny, bvx, bvy, b.R + S.radius, bx, by);
        hurt(g, v, 'BONK!');
      } else {
        die(g, `hit ${b.name} at ${v.toFixed(1)} m/s`);
      }
      return;
    }
    for (const rk of w.rocks) {
      const [hx, hy] = World.bodyState(w, rk.host, t);
      if (Math.abs(Math.hypot(sh.x - hx, sh.y - hy) - rk.a) > rk.r + S.radius) continue;   // cheap band test
      const [rx, ry, rvx, rvy] = World.rockState(w, rk, t);
      const dx = sh.x - rx, dy = sh.y - ry, d = Math.hypot(dx, dy), hit = rk.r * 0.9 + S.radius * 0.8;
      if (d >= hit) continue;
      const nx = dx / d, ny = dy / d, vn = (sh.vx - rvx) * nx + (sh.vy - rvy) * ny;
      if (vn >= 0) continue;
      bounce(g, nx, ny, rvx, rvy, hit, rx, ry);
      hurt(g, -vn, ['CLANK!', 'BONK!', 'THUD!'][Math.floor(Math.random() * 3)]);
      return;
    }
  }

  function bounce(g, nx, ny, bvx, bvy, dist, cx, cy) {
    const sh = g.sh, rvx = sh.vx - bvx, rvy = sh.vy - bvy, vn = rvx * nx + rvy * ny;
    if (vn < 0) { sh.vx -= (1 + S.bounce) * vn * nx; sh.vy -= (1 + S.bounce) * vn * ny; }
    sh.x = cx + nx * (dist + 0.05); sh.y = cy + ny * (dist + 0.05);
    sh.omega += (Math.random() - 0.5) * Math.min(3, Math.abs(vn));
  }

  function hurt(g, v, word) {
    const dmg = S.bumpDamage * v;
    g.sh.hull -= dmg;
    popup(g, word, '#ffd166');
    log(g, `${word} ${v.toFixed(1)} m/s, -${dmg.toFixed(0)} hull`);
    if (g.sh.hull <= 0) die(g, 'hull gave out');
  }

  function die(g, why) {
    g.sh.hull = Math.max(0, g.sh.hull); g.crashMsg = why;
    setStatus(g, 'dead', why);
    popup(g, 'KABOOM!', '#ff6b6b');
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 2 * Math.PI, sp = 2 + Math.random() * 14;
      g.particles.push({ x: g.sh.x, y: g.sh.y, vx: g.sh.vx * 0.3 + Math.cos(a) * sp, vy: g.sh.vy * 0.3 + Math.sin(a) * sp,
                         life: 1 + Math.random() * 1.2, max: 2.2, kind: 'boom' });
    }
  }

  // ---------------- effects ----------------

  function spawnExhaust(g, thr) {
    const sh = g.sh, back = sh.ang + Math.PI, bx = sh.x + Math.cos(back) * S.length * 0.5, by = sh.y + Math.sin(back) * S.length * 0.5;
    for (let i = 0; i < 2; i++) {
      const a = back + (Math.random() - 0.5) * 0.45, sp = 6 + Math.random() * 10 * thr;
      g.particles.push({ x: bx, y: by, vx: sh.vx + Math.cos(a) * sp, vy: sh.vy + Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, max: 0.8, kind: 'smoke' });
    }
  }

  function spawnPuff(g, ctrl) {
    const sh = g.sh, c = Math.cos(sh.ang), s = Math.sin(sh.ang);
    const emit = (fx, fy, dir) => {                       // fx: along nose, fy: to the left; dir: puff direction (ship frame angle)
      const px = sh.x + c * fx - s * fy, py = sh.y + s * fx + c * fy, a = sh.ang + dir;
      g.particles.push({ x: px, y: py, vx: sh.vx + Math.cos(a) * 6, vy: sh.vy + Math.sin(a) * 6, life: 0.25, max: 0.25, kind: 'puff' });
    };
    const spin = ctrl.rot || (ctrl.kill ? -Math.sign(sh.omega) : 0);
    if (spin > 0) { emit(3, -2, -Math.PI / 2); emit(-3, 2, Math.PI / 2); }     // CCW torque
    if (spin < 0) { emit(3, 2, Math.PI / 2); emit(-3, -2, -Math.PI / 2); }
    if (ctrl.fwd > 0) emit(-2, 0, Math.PI);
    if (ctrl.fwd < 0) emit(4, 0, 0);
    if (ctrl.left > 0) emit(0, -2, -Math.PI / 2);
    if (ctrl.left < 0) emit(0, 2, Math.PI / 2);
  }

  function popup(g, text, col) { g.popups.push({ text, col, x: g.sh.x, y: g.sh.y, t0: performance.now() }); }

  function tickFx(g, dt) {
    for (const p of g.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    g.particles = g.particles.filter((p) => p.life > 0).slice(-700);
    g.popups = g.popups.filter((p) => performance.now() - p.t0 < 1400);
  }

  // ---------------- status & log ----------------

  function setStatus(g, status, why = '') {
    if (g.status === status) return;
    log(g, `${g.status} -> ${status}  ${why}`);
    g.status = status;
  }
  function log(g, msg) {
    g.events.push({ t: g.t, msg });
    console.log(`[orbit] t=${g.t.toFixed(2)}  ${msg}`);
  }

  // ---------------- goals ----------------

  function checkGoals(g) {
    const o = g.orb, ref = g.ref, safe = g.pred && !g.pred.impact;
    const test = {
      liftoff: () => g.status === 'flying' && g.ref.id === 'ceres' && o.alt > 20,
      orbit:   () => ref.id === 'ceres' && g.status === 'flying' && o.E < 0 && safe && o.pe > 10,
      belt:    () => g.maxCeresR > 650,
      dorito:  () => ref.id === 'dorito' && g.status === 'flying' && o.E < 0 && safe,
      kiwi:    () => g.status === 'landed' && g.landedOn.id === 'kiwi',
      seed:    () => g.status === 'landed' && g.landedOn.id === 'seed',
      home:    () => g.status === 'landed' && g.landedOn.id === 'ceres' && g.done.liftoff !== undefined && g.t - g.done.liftoff > 30,
    };
    for (const goal of GOALS) {
      if (g.done[goal.id] !== undefined || !test[goal.id]()) continue;
      g.done[goal.id] = g.t;
      g.toast = { text: TOAST[goal.id], t0: performance.now() };
      log(g, `GOAL ${goal.id}  (ref ${ref.name}, alt ${o.alt.toFixed(0)}, fuel ${g.sh.fuel.toFixed(2)} t, rcs ${g.sh.rcs.toFixed(1)})`);
    }
  }

  // ---------------- contextual hint ----------------

  function hint(g) {
    const d = g.done, o = g.orb;
    if (g.status === 'dead') return `Kaboom (${g.crashMsg}). R retries, T changes the starting spot.`;
    if (g.pred && g.pred.impact && g.status === 'flying' && g.done.liftoff !== undefined) {
      const dt = g.pred.impact.t - g.t, v = g.orb.speed;
      return `Path hits ${g.pred.impact.body.name} in ${dt.toFixed(0)} s. ${dt > 8 ? 'Burn sideways to miss it, or slow to under 2.5 m/s to land.' : 'Slow down!'}`;
    }
    if (g.status === 'landed' && g.landedOn.id === 'ceres' && d.liftoff === undefined)
      return 'Hold W to fire the engine. A/D spin you with thrusters; S stops the spin.';
    if (Math.abs(g.sh.omega) > 1.2) return 'You are spinning fast. Tap the opposite way, or hold S to stop it.';
    if (g.spawn !== 'pad') return `Free flight near ${g.ref.name}. T changes the starting spot, R restarts.`;
    if (d.orbit === undefined) return 'Tip sideways (A/D, then S to stop) and burn to build sideways speed until the path wraps around Ceres.';
    if (d.belt === undefined) return 'Burn toward the yellow prograde marker to stretch your orbit out through the rubble belt.';
    if (d.dorito === undefined) return 'Dorito is the orange one. Match its speed as you arrive so it can capture you.';
    if (d.kiwi === undefined) return 'Kiwi is the green one. Drop under 2.5 m/s relative to it and touch down.';
    if (d.home === undefined) return 'Head home and land on Ceres. Arrow keys nudge you for fine moves.';
    return 'Flight school done. Go dance with the rubble.';
  }

  return { create, update, hint, GOALS, SPAWNS, SPAWN_NAMES };
})();
