// ======================================================================
//  EVA  —  the little green prospector on foot.  Step out (E) when landed,
//  walk / jump / jetpack under honest gravity from every body, dig the
//  terrain grid with the mining laser, scan for gems, mind the suit (air,
//  HP, jet fuel), then board again (E) to unload the backpack.
//  API: EVA.isOut(g), stepOut(g), board(g), recall(g, why, lose), reach(b)
// ======================================================================

const EVA = (() => {

  const ITEMS = CONFIG.items;

  // ---------------- tuning ----------------
  const FOOT_OFF = 0.3, FOOT_R = 0.45;        // feet circle below the torso centre (g.astro.x, y) [m]
  const HEAD_OFF = 0.45, HEAD_R = 0.38;       // helmet circle above it [m]
  const STAND = FOOT_OFF + FOOT_R;            // torso centre height above the ground [m]
  const UPRIGHT = 0.55;                       // ground normal . local up above this = walkable
  const WALK_ACC = 22, STOP_ACC = 26;         // ground traction [m/s^2]
  const WALK_FRAC = 0.6;                      // walk speed <= this x local circular speed
  const JUMP_V = 3.0, JUMP_ESC = 0.45;        // jump speed [m/s], never above this x local escape speed
  const JUMP_BUF = 0.15, COYOTE = 0.1;        // press-early / step-off grace [s]
  const JET_DELAY = 0.22;                     // keep holding this long after a jump to light the jetpack [s]
  const JET_SIDE = 0.6, JET_DOWN = 0.8;       // sideways / downward jet as a fraction of S.jet
  const JET_REFILL = 0.3;                     // jet seconds regained per second standing on the ground
  const CEIL_H = 40, CEIL_HILL = 0.75;        // suit governor: no orbit may reach past min(top + 40 m, 0.75 Hill radius)
  const SNAP = 0.55;                          // ground-follow distance when walking over bumps and grid steps [m]
  const STEP_V = 0.3;                         // walking up a ledge adds at most this much outward speed [m/s]
  const STEP_H = 0.6;                         // walking climbs ledges up to this tall (the dig grid is 0.5 m) [m]
  const SIDE_AFTER = 0.25;                    // A/D side jets only after this long in the air [s]
  const BOARD_R = 3;                          // board within this of the hull [m]
  const FAR_WARN = 120, FAR_MAX = 150;        // tether: warn, then recall [m from the ship]
  const RECALL_T = 6;                         // seconds of warning before an auto-recall
  const O2_WARN = 30, SUFFOCATE = 8;          // air warning [s left]; suit HP lost per second at 0 air
  const HEAL_RATE = 2;                        // suit HP patched per second while aboard
  const FALL_HURT = 8, FALL_DMG = 5;          // landings faster than this hurt [m/s]; HP per m/s over
  const DIG_TICK = 0.05, DIG_R = 0.55;        // laser dig cadence [s] and bite radius [m]
  const HIT_TICK = 0.1;                       // laser damage cadence on targets [s]
  const CHUNK_V = 8;                          // dug chunks ride back up the beam at this speed [m/s]
  const BEAM_PAST = 0.75;                     // the beam stops this far past the cursor: you dig what you point at [m]
  const SCAN_R = [4, 25, Infinity];           // gem scanner reach by S.scanner level [m]
  const ZOOM = 32, MIN_PX = 22;               // EVA camera [px/m]; smallest on-screen astronaut [px]
  const MINE_KG = 40;                         // job: ore hauled into the pack

  const INK = '#1b1433';
  const SKIN = ['#8fe07a', '#4f9e45', '#d8ffbf'], SUIT = ['#f6f2ff', '#b7afdc', '#ffffff'];
  const PACK = ['#ff9f43', '#c25f1c', '#ffd8a6'], GUN = ['#8a86b3', '#565180', '#d9d6f2'];
  const BEAM = '#ff4f8b', ANTENNA = '#ff7eb6';
  const MAT_NAME = { regolith: 'regolith', ice: 'water ice', iron: 'iron ore', nickel: 'nickel', platinum: 'platinum' };
  const MAT_FEEL = { regolith: 'soft dirt', ice: 'easy', iron: 'tough', nickel: 'tougher', platinum: 'very hard' };
  const BREAK_WORD = { regolith: ['ZZT!', 'FZZT!'], ice: ['CRSSH!', 'KRISH!'], iron: ['KRAK!', 'CRUNCH!'],
                       nickel: ['KRUNK!', 'CLANK!'], platinum: ['TING!', 'TINK!'] };
  let on = false;                             // registered (not filtered out by ?mods=)


  // ======================================================================
  //  STATE
  // ======================================================================

  function fresh() {
    return { o2: 0, jet: 0, face: 1, phase: 0, grounded: false, gn: [0, 1], airT: 9, jumpQ: 0, jetLock: 0,
             ctl: { walk: 0, up: false, down: false }, touchUp: false, firing: false, aimL: null, aimS: null, aimDir: null,
             beam: null, hover: null, digAcc: 0, hitAcc: 0, fxT: 0, wordT: -9, thrust: 0, thrustDir: [0, -1], gov: false, govT: -9,
             cam: null, lost: 0, lostWhy: '', warnO2: false, gaspT: -9, pings: [], prevPack: {}, scanT: 0,
             digNearShip: 0, landT: -9, hauled: 0, gems: 0, outs: 0 };
  }
  const st = (g) => g.mod.eva || (g.mod.eva = fresh());
  const isOut = (g) => !!(g.astro && g.astro.on && g.mode === 'eva');

  function init(g) { g.mod.eva = fresh(); }

  function load(g, d) {
    const m = st(g), num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
    if (!d || typeof d !== 'object') return;
    m.hauled = num(d.hauled); m.gems = Math.floor(num(d.gems)); m.outs = Math.floor(num(d.outs));
  }
  const save = (g) => { const m = st(g); return { hauled: m.hauled, gems: m.gems, outs: m.outs }; };

  // after spawn, a load or a dev teleport: you are in the ship, suit topped up, any pack goes to the hold
  function ready(g) {
    const m = st(g);
    resetSuit(g, m);
    if (!g.astro.on && Object.keys(g.pack).length) Game.unloadPack(g);
    m.prevPack = { ...g.pack };
  }
  function resetSuit(g, m) {
    Object.assign(m, { o2: g.S.o2, jet: g.S.jetFuel, firing: false, beam: null, hover: null, lost: 0, warnO2: false,
                       jumpQ: 0, jetLock: 0, thrust: 0, gov: false, digAcc: 0, hitAcc: 0, cam: null, digNearShip: 0 });
  }
  function respawn(g) { const m = st(g); resetSuit(g, m); m.prevPack = { ...g.pack }; m.pings = []; }
  function died(g) {
    if (!isOut(g)) return;
    Game.toast(g, `YOUR ${g.S.name.toUpperCase()} GOT WRECKED!`, '#ff5d5d');
    Game.log(g, 'ship destroyed while on foot');
  }


  // ======================================================================
  //  STEP OUT / BOARD / RECALL
  // ======================================================================

  const canStepOut = (g) => g.mode === 'ship' && g.status === 'landed' && !!g.landedOn && !!g.land && !g.ui && !g.astro.on;

  // a spot on the ground beside the ship: [x, y, side] in world coords, or null
  function exitSpot(g) {
    const b = g.landedOn, L = g.land, T = Terrain.of(b), S = g.S;
    const rS = Math.hypot(L.lx, L.ly), th0 = Math.atan2(L.ly, L.lx);
    for (const side of [1, -1]) {
      const th = th0 - side * (S.radius + 1.6) / rS, c = Math.cos(th), s = Math.sin(th);
      let r = rS + 4;
      const hits = (rr) => Terrain.collideCircle(T, (rr - FOOT_OFF) * c, (rr - FOOT_OFF) * s, FOOT_R);
      while (r > rS - 10 && !hits(r)) r -= 0.1;
      if (r <= rS - 10) continue;
      for (let k = 0; k < 60 && hits(r); k++) r += 0.02;
      if (Terrain.collideCircle(T, (r + HEAD_OFF) * c, (r + HEAD_OFF) * s, HEAD_R)) continue;
      const [bx, by] = World.bodyState(g.w, b, g.t);
      return [bx + r * c, by + r * s, side];
    }
    return null;
  }

  function stepOut(g) {
    if (!canStepOut(g)) return false;
    const A = g.astro, m = st(g), b = g.landedOn, [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    const ex = exitSpot(g), spot = ex || [g.sh.x, g.sh.y, 1];
    const lx = spot[0] - bx, ly = spot[1] - by;
    Object.assign(A, { on: true, x: spot[0], y: spot[1], vx: bvx, vy: bvy, ang: Math.atan2(ly, lx) });
    g.mode = 'eva';
    resetSuit(g, m);
    Object.assign(m, { face: spot[2], grounded: true, gn: [lx / Math.hypot(lx, ly), ly / Math.hypot(lx, ly)], airT: 0, phase: 0,
                       prevPack: { ...g.pack }, cam: { b: b.id, lx: g.sh.x - bx, ly: g.sh.y - by } });
    m.outs++;
    Game.popup(g, 'POP!', '#8ff0b0', A.x, A.y + 1, 22);
    Game.burst(g, 'puff', A.x, A.y, 8, { vx: bvx, vy: bvy, speed: 2, life: 0.5 });
    Game.log(g, `stepped out on ${b.name}${ex ? '' : ' (no room beside it: popped out on top)'}`);
    return true;
  }

  const hullDist = (g) => Math.hypot(g.astro.x - g.sh.x, g.astro.y - g.sh.y) - g.S.radius;
  const canBoard = (g) => isOut(g) && g.status !== 'dead' && !g.ui && hullDist(g) < BOARD_R;

  // back inside: pack -> hold (leftovers stay in the pack), air and jet refilled
  function toShip(g) {
    const A = g.astro, m = st(g);
    A.on = false; A.vx = 0; A.vy = 0; g.mode = 'ship';
    resetSuit(g, m);
    g.toasts = g.toasts.filter((t) => t.key !== 'evaO2' && t.key !== 'evaTether');   // stale "head back!" nags
    const moved = Game.unloadPack(g);
    m.prevPack = { ...g.pack };
    return moved;
  }

  function board(g) {
    if (!canBoard(g)) return false;
    const moved = toShip(g), kg = Game.kgOf(moved), left = Game.kgOf(g.pack);
    if (kg || left) Game.toast(g, `UNLOADED ${kg.toFixed(0)} KG INTO THE HOLD${left ? `  ·  HOLD FULL, ${left.toFixed(0)} KG STAYS IN YOUR PACK` : ''}`, left ? '#ff9f1c' : '#8ff0b0');
    else Game.popup(g, 'HOME!', '#8ff0b0', g.sh.x, g.sh.y);
    Game.log(g, `boarded ${g.S.name}: ${Object.entries(moved).map(([k, q]) => `${q} ${k}`).join(', ') || 'empty pack'}${left ? `, ${left} kg left in pack` : ''}`);
    return true;
  }

  // why: 'suit' (HP gone: pack lost, HP back to half) | 'far' | 'adrift' (tether reels you in) | 'glitch'
  function recall(g, why, lose = false) {
    const A = g.astro;
    if (!isOut(g)) return false;
    Game.burst(g, 'flash', A.x, A.y, 1, { vx: A.vx, vy: A.vy, size: 3, life: 0.5, speed: 0 });
    if (g.status === 'dead') {                                         // no ship to come home to: the tow tug fetches you
      Game.log(g, `recall (${why}) with the ship wrecked: towed`);
      Game.respawn(g, 'crash');
      return true;
    }
    if (lose) { g.pack = {}; A.hp = A.hpMax * 0.5; }
    toShip(g);
    Game.toast(g, lose ? 'SUIT FAILURE! EMERGENCY RECALL (PACK LOST)' : 'TETHER RECALL: REELED BACK TO THE SHIP', lose ? '#ff5d5d' : '#ffd166');
    Game.log(g, `recall (${why})${lose ? ': pack lost, suit at half' : ''}`);
    return true;
  }


  // ======================================================================
  //  INPUT
  // ======================================================================

  const JUMP_KEYS = new Set(['KeyW', 'Space', 'ArrowUp']);
  const MOVE_KEYS = new Set(['KeyA', 'KeyD', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowDown']);

  function onKey(g, code) {
    if (!isOut(g) || g.ui) return false;
    if (JUMP_KEYS.has(code)) { st(g).jumpQ = JUMP_BUF; return true; }
    return MOVE_KEYS.has(code);
  }
  const onMouse = (g) => isOut(g);                                     // on foot the mouse is the laser, not targeting

  function frame(g, inp, dt) {
    const m = st(g), A = g.astro;
    setCursor(isOut(g));
    if (!isOut(g)) { m.firing = false; return; }
    const k = inp.keys || new Set(), t = inp.touch || {}, has = (c) => k.has(c);
    m.ctl.walk = (has('KeyD') || has('ArrowRight') || t.rotR ? 1 : 0) - (has('KeyA') || has('ArrowLeft') || t.rotL ? 1 : 0);
    m.ctl.up = has('KeyW') || has('Space') || has('ArrowUp') || !!t.thrust;
    m.ctl.down = has('KeyS') || has('ArrowDown') || !!t.kill;
    if (t.thrust && !m.touchUp) m.jumpQ = JUMP_BUF;
    m.touchUp = !!t.thrust;
    m.jumpQ = Math.max(0, m.jumpQ - dt);
    m.o2 = Math.min(m.o2, g.S.o2); m.jet = Math.min(m.jet, g.S.jetFuel);

    const ms = inp.mouse;
    if (ms && Number.isFinite(ms.x) && Number.isFinite(ms.y)) {          // aim kept in the rock's frame: it moves under us
      const nb = Game.nearestBody(g, A.x, A.y);
      m.aimL = [ms.x - nb.bx, ms.y - nb.by, nb.b.id];
      m.aimS = Number.isFinite(ms.sx) ? [ms.sx, ms.sy] : null;
      m.firing = !!ms.down && !g.ui;
    } else { m.aimL = null; m.aimS = null; m.firing = false; }

    const aim = aimWorld(g, m), [ux, uy] = upOf(g);
    const side = aim ? Math.sign((aim[0] - A.x) * uy - (aim[1] - A.y) * ux) : 0;   // + = screen right of you
    if (m.firing && side) m.face = side;
    else if (m.ctl.walk) m.face = m.ctl.walk;
  }

  let cursorOn = null;
  function setCursor(want) {
    if (want === cursorOn || typeof document === 'undefined') return;
    cursorOn = want;
    const cv = document.getElementById('game');
    if (cv) cv.style.cursor = want ? 'crosshair' : '';
  }

  const upOf = (g) => { const a = g.astro.ang; return [Math.cos(a), Math.sin(a)]; };
  function aimWorld(g, m) {
    if (!m.aimL) return null;
    const b = g.w.byId[m.aimL[2]]; if (!b) return null;
    const [bx, by] = World.bodyState(g.w, b, g.t);
    return [bx + m.aimL[0], by + m.aimL[1]];
  }


  // ======================================================================
  //  PHYSICS (every 1/240 s step): gravity from all bodies, walking along the
  //  ground relative to the rock, jump, jetpack with the suit governor, collision
  // ======================================================================

  // how far out the suit governor lets any orbit reach (keeps you bound to tiny moons)
  const reach = (b) => Math.min(CEIL_HILL * b.hill, b.R * (1 + b.shape) + CEIL_H);
  const walkMax = (S, b, d) => Math.min(S.walk, WALK_FRAC * Math.sqrt(b.mu / d));

  // biggest kick along (ex, ey) that keeps the orbit energy under the governor cap
  function kickRoom(b, d, rvx, rvy, ex, ey) {
    const vu = rvx * ex + rvy * ey, v2 = rvx * rvx + rvy * rvy, Emax = World.phi(b, reach(b));
    const disc = vu * vu - v2 + 2 * (Emax - World.phi(b, d));
    return disc > 0 ? Math.max(0, -vu + Math.sqrt(disc)) : 0;
  }

  // jet throttle 0..1 along (ex, ey): only energy-adding thrust is ever cut
  function governor(b, d, rvx, rvy, ex, ey) {
    if (rvx * ex + rvy * ey <= 0) return 1;
    const R = reach(b), E = 0.5 * (rvx * rvx + rvy * rvy) + World.phi(b, d), Emax = World.phi(b, R), band = 0.08 * b.mu / R;
    return Math.max(0, Math.min(1, (Emax - E) / band));
  }

  function step(g, dt) {
    const A = g.astro;
    if (!isOut(g)) return;
    const m = st(g), S = g.S, c = m.ctl, t0 = g.t - dt;
    if (![A.x, A.y, A.vx, A.vy].every(Number.isFinite)) return;
    const b = Game.nearestBody(g, A.x, A.y).b, s0 = World.bodyState(g.w, b, t0);
    const lx = A.x - s0[0], ly = A.y - s0[1], d = Math.hypot(lx, ly) || 1e-9, ux = lx / d, uy = ly / d;
    let rvx = A.vx - s0[2], rvy = A.vy - s0[3];

    // -------- walking: traction along the ground, relative to the rock --------
    if (m.grounded) {
      let [nx, ny] = m.gn;
      if (nx * ux + ny * uy < UPRIGHT) { nx = ux; ny = uy; }
      const want = c.walk * walkMax(S, b, d), dvx = ny * want - rvx, dvy = -nx * want - rvy, dv = Math.hypot(dvx, dvy);
      const k = Math.min(1, (c.walk ? WALK_ACC : STOP_ACC) * dt / Math.max(dv, 1e-9));   // friction steers the whole velocity
      rvx += dvx * k; rvy += dvy * k;
      const vr = rvx * ux + rvy * uy;                                   // walking never pushes you off the rock: ledges are climbed in collide()
      if (vr > 0) { rvx -= ux * vr; rvy -= uy * vr; }
      m.jet = Math.min(S.jetFuel, m.jet + JET_REFILL * dt);
    }

    // -------- jump: a kick along local up, capped well below escape --------
    let jumped = false;
    if (m.jumpQ > 0 && (m.grounded || m.airT < COYOTE)) {
      const vr = rvx * ux + rvy * uy;
      if (vr < 0) { rvx -= ux * vr; rvy -= uy * vr; }
      const j = Math.min(JUMP_V, JUMP_ESC * Math.sqrt(2 * b.mu / d), kickRoom(b, d, rvx, rvy, ux, uy));
      rvx += ux * j; rvy += uy * j;
      Object.assign(m, { jumpQ: 0, grounded: false, airT: COYOTE, jetLock: JET_DELAY, leapt: true });
      jumped = true;
    }

    // -------- jetpack: hold up in the air; A/D nudge sideways; S pushes down --------
    let ax = 0, ay = 0;
    m.thrust = 0; m.gov = false;
    m.jetLock = Math.max(0, m.jetLock - dt);
    m.stepT = Math.max(0, (m.stepT || 0) - dt);
    if (!m.grounded && m.jet > 0) {
      let fx = 0, fy = 0;
      if (c.up && m.jetLock <= 0) { fx += ux; fy += uy; }
      if (c.down) { fx -= ux * JET_DOWN; fy -= uy * JET_DOWN; }
      if (c.walk && m.airT > (m.leapt ? SIDE_AFTER : 0.6)) { fx += uy * c.walk * JET_SIDE; fy -= ux * c.walk * JET_SIDE; }   // walking off a ledge is no reason to fire jets
      const f = Math.hypot(fx, fy);
      if (f > 1e-6) {
        const ex = fx / f, ey = fy / f, thr = governor(b, d, rvx, rvy, ex, ey), k = Math.min(1, f) * thr;
        m.gov = thr < 1;
        ax = ex * S.jet * k; ay = ey * S.jet * k;
        m.jet = Math.max(0, m.jet - k * dt);
        m.thrust = k; m.thrustDir = [ex, ey];
      }
    }

    // -------- integrate (semi-implicit Euler), then collide with the rock at the new time --------
    const [gx, gy] = World.gravity(g.w, A.x, A.y, t0);
    A.vx = s0[2] + rvx + (gx + ax) * dt; A.vy = s0[3] + rvy + (gy + ay) * dt;
    A.x += A.vx * dt; A.y += A.vy * dt;
    collide(g, m, b, dt, jumped);
  }

  function collide(g, m, b, dt, jumped) {
    const A = g.astro, T = Terrain.of(b), s = World.bodyState(g.w, b, g.t);
    let lx = A.x - s[0], ly = A.y - s[1], rvx = A.vx - s[2], rvy = A.vy - s[3];
    const d = Math.hypot(lx, ly) || 1e-9, ux = lx / d, uy = ly / d;
    let ground = null, impact = 0, stepped = false;
    const vr0 = rvx * ux + rvy * uy, walking = m.grounded && !jumped && !m.thrust;
    const push = (h) => {
      lx += h.nx * h.depth; ly += h.ny * h.depth;
      const vn = rvx * h.nx + rvy * h.ny;
      if (vn < 0) { impact = Math.max(impact, -vn); rvx -= vn * h.nx; rvy -= vn * h.ny; }
    };
    // -------- step up: walking into a grid ledge up to STEP_H tall climbs it instead of pushing you back --------
    if (walking && m.ctl.walk) {
      const fh = Terrain.collideCircle(T, lx - ux * FOOT_OFF, ly - uy * FOOT_OFF, FOOT_R), tx = uy * m.ctl.walk, ty = -ux * m.ctl.walk;
      if (fh && fh.nx * tx + fh.ny * ty < -0.03) {
        for (let h = 0.02; h <= STEP_H + 1e-9; h += 0.02) {
          const qx = lx + ux * h, qy = ly + uy * h;
          if (Terrain.collideCircle(T, qx - ux * FOOT_OFF, qy - uy * FOOT_OFF, FOOT_R)) continue;
          if (Terrain.collideCircle(T, qx + ux * HEAD_OFF, qy + uy * HEAD_OFF, HEAD_R)) break;
          lx = qx; ly = qy; stepped = true;
          m.stepT = Math.min(0.4, 0.45 / Math.max(0.5, Math.abs(rvx * uy - rvy * ux)));   // float over the lip before snapping down again
          const vr = rvx * ux + rvy * uy; if (vr > 0) { rvx -= ux * vr; rvy -= uy * vr; }   // a climb, not a launch
          break;
        }
      }
    }
    for (let it = 0; it < 2; it++) {
      const fh = Terrain.collideCircle(T, lx - ux * FOOT_OFF, ly - uy * FOOT_OFF, FOOT_R);
      if (fh) { push(fh); if (fh.nx * ux + fh.ny * uy > UPRIGHT) ground = fh; }
      const hh = Terrain.collideCircle(T, lx + ux * HEAD_OFF, ly + uy * HEAD_OFF, HEAD_R);
      if (hh) push(hh);
      if (!fh && !hh) break;
    }

    // -------- feet step up onto a ledge instead of being catapulted off it --------
    let vr = rvx * ux + rvy * uy;
    const vrCap = Math.max(0, vr0) + STEP_V;
    if (walking && vr > vrCap) { rvx -= ux * (vr - vrCap); rvy -= uy * (vr - vrCap); vr = vrCap; }

    // -------- ground follow: walking over a crest should not launch you --------
    if (!ground && walking && m.stepT > 0) ground = { nx: ux, ny: uy };   // just climbed a ledge: carry on over its lip
    if (!ground && walking && m.jetLock <= 0 && vr < 1.5) {
      const pr = Terrain.collideCircle(T, lx - ux * (FOOT_OFF + SNAP), ly - uy * (FOOT_OFF + SNAP), FOOT_R);
      if (pr && pr.nx * ux + pr.ny * uy > 0.2) {                       // any floor-ish contact below: grid corners tilt a lot on tiny moons
        const dn = Math.max(0, SNAP - pr.depth + 0.005);
        lx -= ux * dn; ly -= uy * dn;
        if (vr > 0) { rvx -= ux * vr; rvy -= uy * vr; }
        ground = pr;
      }
    }

    if (!ground && stepped) ground = { nx: ux, ny: uy };
    if (ground && !m.grounded) { landed(g, m, impact, s); m.leapt = false; }
    m.grounded = !!ground;
    if (ground) {
      const wasG = m.airT === 0, gx = wasG ? m.gn[0] * 0.7 + ground.nx * 0.3 : ground.nx, gy = wasG ? m.gn[1] * 0.7 + ground.ny * 0.3 : ground.ny;
      const gn = Math.hypot(gx, gy) || 1;
      m.gn = [gx / gn, gy / gn]; m.airT = 0;
    } else m.airT += dt;
    A.x = s[0] + lx; A.y = s[1] + ly; A.vx = s[2] + rvx; A.vy = s[3] + rvy;
    const dd = Math.hypot(lx, ly) || 1e-9;
    A.ang = Math.atan2(ly / dd, lx / dd);
    if (m.grounded) {
      const vt = rvx * (ly / dd) - rvy * (lx / dd);                      // along screen-right
      m.phase += vt * m.face * dt * 5.5;
    }
  }

  function landed(g, m, impact, s) {
    const A = g.astro;
    if (impact > 1.6) Game.burst(g, 'dust', A.x - Math.cos(A.ang) * STAND, A.y - Math.sin(A.ang) * STAND, Math.min(10, 2 + impact * 1.5),
                                 { vx: s[2], vy: s[3], speed: 0.6 + impact * 0.25, col: '#cfc6e6', size: 0.35, life: 0.6 });
    if (impact > FALL_HURT) {
      Game.hurtAstro(g, (impact - FALL_HURT) * FALL_DMG, 'THUD!');
      Game.log(g, `hard landing at ${impact.toFixed(1)} m/s`);
    } else if (impact > 4 && g.real - m.landT > 1) { m.landT = g.real; Game.popup(g, 'THUMP!', '#ffe2b0', A.x, A.y, 18); }
  }


  // ======================================================================
  //  PER FRAME (after physics): laser, pack bookkeeping, air, scanner, tether, camera
  // ======================================================================

  function after(g, inp, dt, simDt) {
    const A = g.astro, m = st(g);
    if (!isOut(g)) {
      steerChunks(g, simDt);
      if (g.status !== 'dead' && A.hp < A.hpMax && simDt) A.hp = Math.min(A.hpMax, A.hp + HEAL_RATE * simDt);
      if (g.status === 'landed' && g.S.scanner) scanTick(g, m, dt);
      tidyPings(g, m);
      return;
    }
    if (![A.x, A.y, A.vx, A.vy].every(Number.isFinite)) { recall(g, 'glitch'); return; }
    fireLaser(g, m, simDt);
    steerChunks(g, simDt);
    countPack(g, m);
    breathe(g, m, simDt);
    if (A.hp <= 0) { recall(g, 'suit', true); return; }
    scanTick(g, m, dt);
    tether(g, m, simDt);
    if (!isOut(g)) return;
    jetFx(g, m);
    follow(g, m, dt);
    tidyPings(g, m);
  }

  // -------- laser: raycast from the gun toward the cursor; dig terrain or zap targets --------

  function gunRay(g, m) {
    const A = g.astro, [ux, uy] = upOf(g), px = A.x + ux * 0.12, py = A.y + uy * 0.12;
    const aim = aimWorld(g, m);
    let dx, dy, dn = aim ? Math.hypot(aim[0] - px, aim[1] - py) : 0;
    if (aim && dn > 0.35) { dx = (aim[0] - px) / dn; dy = (aim[1] - py) / dn; }
    else { dx = uy * m.face * 0.7 - ux * 0.7; dy = -ux * m.face * 0.7 - uy * 0.7; dn = Math.hypot(dx, dy); dx /= dn; dy /= dn; }
    return [px + dx * 0.6, py + dy * 0.6, dx, dy];
  }

  function fireLaser(g, m, simDt) {
    const S = g.S, A = g.astro;
    const [ox, oy, dx, dy] = gunRay(g, m);
    m.aimDir = [dx, dy];
    hoverInfo(g, m, ox, oy);
    m.beam = null;
    if (!m.firing) { m.digAcc = 0; m.hitAcc = 0; m.digNearShip = Math.max(0, m.digNearShip - simDt); return; }
    const aim = aimWorld(g, m), len = aim ? Math.min(S.laserRange, Math.hypot(aim[0] - ox, aim[1] - oy) + BEAM_PAST) : S.laserRange;
    const hit = Game.raycast(g, ox, oy, dx, dy, len, { team: 'player' });
    const end = hit ? [hit.x, hit.y] : [ox + dx * len, oy + dy * len];
    const mat = hit && hit.body ? Terrain.MATS[hit.mat] : null;
    m.beam = { x0: ox, y0: oy, x1: end[0], y1: end[1], hit: hit ? (hit.target ? 'target' : 'terrain') : null,
               col: mat ? matCol(mat, hit.body)[0] : hit ? '#ff9fb2' : null };
    if (!simDt || !hit) return;
    const bv = hit.body ? World.bodyState(g.w, hit.body, g.t) : [0, 0, A.vx, A.vy];
    if (hit.target) zapTarget(g, m, hit, simDt, bv, ox, oy, dx, dy);
    else digTerrain(g, m, hit, mat, simDt, bv, dx, dy);
  }

  function zapTarget(g, m, hit, simDt, bv, ox, oy, dx, dy) {
    m.hitAcc += simDt;
    for (let n = 0; m.hitAcc >= HIT_TICK - 1e-9 && n < 8; n++) {
      m.hitAcc -= HIT_TICK;
      hit.target.hit(g, g.S.laserDps * HIT_TICK, 'laser', { team: 'player', kind: 'laser', x: ox, y: oy, from: 'astro' });
    }
    sparks(g, m, hit.x, hit.y, simDt, bv[2], bv[3], dx, dy, '#ffb3c6');
  }

  function digTerrain(g, m, hit, mat, simDt, bv, dx, dy) {
    const A = g.astro, S = g.S, col = matCol(mat, hit.body);
    m.digAcc += simDt;
    let broke = 0;
    for (let n = 0; m.digAcc >= DIG_TICK - 1e-9 && n < 8; n++) {
      m.digAcc -= DIG_TICK;
      const x = hit.x + dx * 0.2, y = hit.y + dy * 0.2;
      const r = Game.dig(g, hit.body, x, y, DIG_R, S.laserPower * DIG_TICK, { collect: true, toward: [A.x, A.y] });
      if (r.cells) tagChunks(g, hit.body, x, y, m.beam.x0, m.beam.y0);
      broke += r.cells;
    }
    sparks(g, m, hit.x, hit.y, simDt, bv[2], bv[3], dx, dy, col[2]);
    g.shake = Math.max(g.shake, 0.3);
    if (broke) {
      g.shake = Math.max(g.shake, 0.42);
      Game.burst(g, 'dust', hit.x, hit.y, 3 + Math.min(4, broke), { vx: bv[2], vy: bv[3], speed: 1.6, col: col[0], size: 0.2, life: 0.8 });
      if (g.real - m.wordT > 0.9) {
        m.wordT = g.real;
        const w = BREAK_WORD[mat.id] || BREAK_WORD.regolith;
        Game.popup(g, w[Math.floor(Math.random() * w.length)], col[0], hit.x, hit.y, 20);
      }
    }
    const ship = g.status === 'landed' || g.status === 'flying' ? Math.hypot(hit.x - g.sh.x, hit.y - g.sh.y) : Infinity;
    m.digNearShip = ship < g.S.radius + 2.5 ? 3 : Math.max(0, m.digNearShip - simDt);
  }

  // -------- chunks freed by the beam glide home along it: to the bite, then back up the beam to the gun.
  //  Terrain only ever gets dug, so that path stays open; they ride it kinematically, pinned each
  //  frame through the core's p.rest, then the core's magnet takes over at the gun. --------

  function tagChunks(g, b, x, y, ox, oy) {
    const [bx, by] = World.bodyState(g.w, b, g.t), P = g.pickups;
    for (let i = P.length - 1; i >= 0 && i >= P.length - 16; i--) {
      const p = P[i];
      if (p.age > 0 || p.evaHome || Math.hypot(p.x - x, p.y - y) > DIG_R + 1.2) continue;
      p.evaHome = { b: b.id, path: [[x - bx, y - by], [ox - bx, oy - by]] };
    }
  }
  function steerChunks(g, simDt) {
    const A = g.astro, out = isOut(g);
    for (const p of g.pickups) {
      const h = p.evaHome;
      if (!h) continue;
      const b = g.w.byId[h.b];
      if (!out || !b || p.age > 5 || p.qty <= 0 || !h.path || !h.path.length) { p.evaHome = null; p.rest = null; continue; }
      const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
      let lx = p.x - bx, ly = p.y - by, left = CHUNK_V * simDt;
      while (h.path.length && left > 0) {
        const [wx, wy] = h.path[0], dx = wx - lx, dy = wy - ly, d = Math.hypot(dx, dy);
        if (d <= left) { lx = wx; ly = wy; left -= d; h.path.shift(); } else { lx += dx / d * left; ly += dy / d * left; left = 0; }
      }
      p.x = bx + lx; p.y = by + ly; p.vx = bvx; p.vy = bvy;
      if (h.path.length) p.rest = { b, lx, ly };
      else { p.evaHome = null; p.rest = null; p.vx = A.vx; p.vy = A.vy; }
    }
  }

  function sparks(g, m, x, y, simDt, vx, vy, dx, dy, col) {
    m.fxT += simDt;
    if (m.fxT < 0.04) return;
    m.fxT = 0;
    Game.burst(g, 'spark', x, y, 2, { vx, vy, speed: 5, dir: Math.atan2(-dy, -dx), spread: 2.2, col, life: 0.3 });
    if (Math.random() < 0.35) Game.burst(g, 'dust', x, y, 1, { vx, vy, speed: 1, col, size: 0.15, life: 0.7 });
  }

  // material under the cursor (for the tag and the hint)
  function hoverInfo(g, m, ox, oy) {
    m.hover = null;
    const aim = aimWorld(g, m);
    if (!aim) return;
    const nb = Game.nearestBody(g, aim[0], aim[1]);
    if (nb.alt > 3) return;
    const id = Terrain.mat(Terrain.of(nb.b), nb.lx, nb.ly);
    if (id < Terrain.REG) return;
    m.hover = { mat: Terrain.MATS[id], b: nb.b, inRange: Math.hypot(aim[0] - ox, aim[1] - oy) <= g.S.laserRange };
  }

  function matCol(mat, b) { return mat && mat.col ? mat.col : b ? [b.color[0], b.color[1], b.color[2]] : ['#cfc6e6', '#8f86b0', '#ffffff']; }

  // -------- pack bookkeeping: ore hauled (job), gems found --------

  function countPack(g, m) {
    for (const [item, q] of Object.entries(g.pack)) {
      const dq = q - (m.prevPack[item] || 0), it = ITEMS[item];
      if (dq <= 0 || !it) continue;
      if (it.kind === 'ore') m.hauled += dq * it.kg;
      if (it.kind === 'gem') {
        m.gems += dq;
        Game.toast(g, `${it.name.toUpperCase()} IN THE BAG!`, it.col);
        Game.log(g, `picked up ${dq} ${item}`);
      }
    }
    m.prevPack = { ...g.pack };
  }

  // -------- air and suit --------

  function breathe(g, m, simDt) {
    if (!simDt) return;
    const A = g.astro;
    m.o2 = Math.max(0, m.o2 - simDt);
    if (m.o2 < O2_WARN && !m.warnO2) { m.warnO2 = true; Game.toast(g, `AIR LOW: ${Math.ceil(m.o2)} S LEFT. HEAD BACK!`, '#ff9f1c', 'evaO2'); }
    if (m.o2 <= 0) {
      A.hp -= SUFFOCATE * simDt;
      if (g.real - m.gaspT > 1.5) { m.gaspT = g.real; Game.popup(g, 'GASP!', '#ff9fb2', A.x, A.y, 20); }
    }
  }

  // -------- gem scanner: buried gems in reach become seen (the core draws their sparkle) --------

  function scanTick(g, m, dt) {
    m.scanT -= dt;
    if (m.scanT > 0) return;
    m.scanT = 0.2;
    const lvl = Math.max(0, Math.min(2, Math.floor(g.S.scanner || 0))), out = isOut(g);
    const at = out ? g.astro : g.sh, b = out ? Game.nearestBody(g, at.x, at.y).b : g.landedOn;
    if (!b || !b.ter) return;
    const R = out ? SCAN_R[lvl] : lvl ? SCAN_R[lvl] : 0, [bx, by] = World.bodyState(g.w, b, g.t);
    let n = 0;
    for (const gm of b.ter.gems) {
      if (gm.state !== 'buried' || gm.seen || Math.hypot(bx + gm.lx - at.x, by + gm.ly - at.y) > R) continue;
      gm.seen = true; n++;
      m.pings.push({ b: b.id, lx: gm.lx, ly: gm.ly, type: gm.type, t0: g.real });
    }
    if (!n) return;
    Game.popup(g, n > 1 ? `PING ×${n}!` : 'PING!', '#7cf5d6', at.x, at.y, 20);
    Game.log(g, `scanner: ${n} buried gem${n > 1 ? 's' : ''} spotted on ${b.name}`);
  }
  function tidyPings(g, m) { if (m.pings.length) m.pings = m.pings.filter((p) => g.real - p.t0 < 1.6).slice(-40); }

  // -------- tether: too far from the ship or drifting off the rock -> warning, then recall --------

  function tether(g, m, simDt) {
    if (!simDt) return;
    const A = g.astro, nb = Game.nearestBody(g, A.x, A.y), b = nb.b;
    const rvx = A.vx - nb.bvx, rvy = A.vy - nb.bvy, E = 0.5 * (rvx * rvx + rvy * rvy) - b.mu / nb.d;
    const far = g.status !== 'dead' && hullDist(g) + g.S.radius > FAR_MAX;
    const adrift = !m.grounded && (nb.d > reach(b) + 8 || E >= 0);
    if (!far && !adrift) { m.lost = 0; return; }
    if (!m.lost) {
      Game.toast(g, far ? 'TETHER LIMIT! TURN BACK' : `DRIFTING OFF ${b.name.toUpperCase()}!`, '#ff9f1c', 'evaTether');
      Game.log(g, far ? `tether warning: ${(hullDist(g) + g.S.radius).toFixed(0)} m from the ship` : `adrift above ${b.name}`);
    }
    m.lost += simDt; m.lostWhy = far ? 'far' : 'adrift';
    if (m.lost >= RECALL_T) recall(g, m.lostWhy);
  }

  // -------- jet puffs --------

  function jetFx(g, m) {
    if (!m.thrust || Math.random() > 0.6) return;
    const A = g.astro, [ux, uy] = upOf(g), [ex, ey] = m.thrustDir;
    const nx = A.x - ux * 0.15 - uy * m.face * 0.3, ny = A.y - uy * 0.15 + ux * m.face * 0.3;
    Game.burst(g, 'puff', nx, ny, 1, { vx: A.vx - ex * 4, vy: A.vy - ey * 4, speed: 0.8, life: 0.35 });
    if (m.gov && g.real - m.govT > 2.5) { m.govT = g.real; Game.popup(g, 'GOVERNOR!', '#7cf5d6', A.x, A.y, 16); }
  }

  // -------- camera: smoothed in the rock's frame (rocks move fast; world-space lag would smear) --------

  function follow(g, m, dt) {
    const A = g.astro, nb = Game.nearestBody(g, A.x, A.y), [ux, uy] = upOf(g);
    const tx = A.x - nb.bx + ux * 0.4, ty = A.y - nb.by + uy * 0.4;
    if (!m.cam || m.cam.b !== nb.b.id) { m.cam = { b: nb.b.id, lx: tx, ly: ty }; return; }
    const k = 1 - Math.exp(-dt * 7);
    m.cam.lx += (tx - m.cam.lx) * k; m.cam.ly += (ty - m.cam.ly) * k;
  }

  function camera(g) {
    const m = st(g);
    if (!isOut(g) || !m.cam || !g.w.byId[m.cam.b]) return null;
    const [bx, by] = World.bodyState(g.w, g.w.byId[m.cam.b], g.t), A = g.astro;
    return { x: bx + m.cam.lx, y: by + m.cam.ly, zoom: ZOOM, rot: A.ang - Math.PI / 2, snap: true };
  }

  const warpLimit = (g) => (isOut(g) ? { max: 1, why: 'on foot', reset: true } : null);


  // ======================================================================
  //  PROMPTS, HINTS, CONTROLS
  // ======================================================================

  function interactions(g) {
    if (canStepOut(g)) return [{ key: 'KeyE', text: 'Step outside', dist: 0, col: '#8ff0b0', act: stepOut }];
    if (canBoard(g)) return [{ key: 'KeyE', text: `Board ${g.S.name}`, dist: hullDist(g), col: '#8ff0b0', act: board }];
    return null;
  }

  function hint(g) {
    const m = st(g), A = g.astro, S = g.S;
    if (g.ui) return null;
    if (!isOut(g)) {
      if (canStepOut(g)) return { pri: g.done.mine === undefined ? 30 : Game.kgOf(g.cargo) > 0 ? 8 : 12, text: `Press E to step out onto ${g.landedOn.name} and dig with your laser.` };
      return null;
    }
    if (g.status === 'dead') return null;
    const b = Game.nearestBody(g, A.x, A.y).b, packKg = Game.kgOf(g.pack), full = packKg >= S.packCap - 0.5;
    const dShip = hullDist(g) + S.radius, left = Math.max(0, Math.ceil(RECALL_T - m.lost));
    if (m.lost > 0 && m.lostWhy === 'far') return { pri: 85, text: `Tether limit! Walk back toward the ${S.name} or get reeled in (${left} s).` };
    if (m.lost > 0) return { pri: 85, text: `Drifting off ${b.name}! Hold S to jet down, or get reeled in (${left} s).` };
    if (m.o2 <= 0) return { pri: 84, text: `Out of air! The suit is losing HP. Get to the ${S.name} and press E!` };
    if (m.o2 < O2_WARN) return { pri: 75, text: `Air low: ${Math.ceil(m.o2)} s left. Back to the ${S.name}, press E to refill.` };
    if (A.hp < 0.3 * A.hpMax) return { pri: 72, text: 'Suit badly hurt! Board (E) to patch it. At 0 HP you get recalled and drop the pack.' };
    if (dShip > FAR_WARN) return { pri: 70, text: `${dShip.toFixed(0)} m from the ${S.name}. The suit tether reels you in past ${FAR_MAX} m.` };
    if (full) return { pri: 62, text: `Backpack full (${S.packCap} kg)! Walk back to the ${S.name} and press E to unload.` };
    if (m.digNearShip > 0) return { pri: 58, text: 'Careful: dig away the ground under the ship and it drops into the hole!' };
    if (canBoard(g) && packKg > 0) return { pri: 52, text: `Press E to board and unload ${packKg.toFixed(0)} kg (air and jetpack refill too).` };
    if (m.gov) return { pri: 46, text: `Suit governor: thrust cut so you can't fly off ${b.name}. Let go and drift down.` };
    if (b.g < 0.6) return { pri: 44, text: `${b.name}: g ${b.g} m/s², escape speed ${Math.sqrt(2 * b.g * b.R).toFixed(1)} m/s. Walk gently; jumps float.` };
    if (m.hover && m.hover.mat.item) {
      const h = m.hover;
      return { pri: 36, text: `That's ${MAT_NAME[h.mat.id]} (${MAT_FEEL[h.mat.id]}). ${h.inRange ? 'Hold left click: chunks fly into your pack.' : `Get closer: laser reach ${S.laserRange} m.`}` };
    }
    return { pri: 25, text: 'Hold left click to dig. Blobs are ore: blue ice, rusty iron, olive nickel, white platinum.' };
  }

  const controls = (g) => (isOut(g)
    ? 'A/D walk · W/Space jump (hold: jetpack) · S jet down · mouse aim · hold click: laser · E board · wheel zoom'
    : null);


  // ======================================================================
  //  DRAWING
  // ======================================================================

  // flat base + shadow band away from the light + optional highlight + ink outline
  function toon(ctx, path, [base, shade, hi], L, k, lw, hiAt) {
    path(); ctx.fillStyle = shade; ctx.fill();
    ctx.save(); path(); ctx.clip();
    ctx.translate(L[0] * k, L[1] * k); path(); ctx.fillStyle = base; ctx.fill();
    if (hiAt) { ctx.beginPath(); ctx.ellipse(hiAt[0], hiAt[1], hiAt[2], hiAt[3], hiAt[4] || 0, 0, 2 * Math.PI); ctx.fillStyle = hi; ctx.fill(); }
    ctx.restore();
    path(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawWorld(g, kit) {
    const m = st(g), ctx = kit.ctx, px = kit.px();
    for (const p of m.pings) {                                          // scanner pings: rings blooming from the gem
      const b = g.w.byId[p.b]; if (!b) continue;
      const [bx, by] = World.bodyState(g.w, b, g.t), age = g.real - p.t0, col = (Terrain.GEM_COL[p.type] || ['#7cf5d6'])[0];
      ctx.globalAlpha = Math.max(0, 1 - age / 1.6);
      ctx.strokeStyle = col; ctx.lineWidth = 3 * px;
      for (const k of [0, 0.35]) {
        const r = Math.max(0, age - k) * 2.6 + 0.4;
        if (age > k) { ctx.beginPath(); ctx.arc(bx + p.lx, by + p.ly, Math.max(r, 6 * px), 0, 2 * Math.PI); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawWorldTop(g, kit) {
    const m = st(g);
    if (!isOut(g)) return;
    if (canBoard(g)) drawHatch(g, kit);
    drawAstro(g, kit, m);
    if (m.beam) drawBeam(g, kit, m.beam);
  }

  // the cockpit window glows when you can hop back in
  function drawHatch(g, kit) {
    const ctx = kit.ctx, px = kit.px(), sh = g.sh, a = sh.ang;
    const u = Math.max(g.S.length, 34 * px) / 10, hx = sh.x + Math.cos(a) * 0.6 * u, hy = sh.y + Math.sin(a) * 0.6 * u;
    const pulse = 0.5 + 0.5 * Math.sin(g.real * 5), R = 1.45 * u + 0.25 * u * pulse;
    ctx.fillStyle = `rgba(143,240,176,${0.18 + 0.14 * pulse})`;
    ctx.beginPath(); ctx.arc(hx, hy, R, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = '#8ff0b0'; ctx.lineWidth = 3 * px; ctx.setLineDash([5 * px, 4 * px]); ctx.lineDashOffset = -g.real * 12 * px;
    ctx.stroke(); ctx.setLineDash([]);
  }

  function drawAstro(g, kit, m) {
    const A = g.astro, ctx = kit.ctx, px = kit.px();
    const s = Math.max(1, MIN_PX * px / 1.6), up = A.ang, rot = up - Math.PI / 2, f = m.face || 1;
    const fx = A.x - Math.cos(up) * STAND, fy = A.y - Math.sin(up) * STAND;
    const c = Math.cos(-rot), sn = Math.sin(-rot), L = [(kit.LIGHT[0] * c - kit.LIGHT[1] * sn) * f, kit.LIGHT[0] * sn + kit.LIGHT[1] * c];
    const small = s / px < 45;                                          // under ~70 px tall: chunkier eyes, thinner rim
    const lw = 2.4 * px / s, lw2 = 1.5 * px / s, t = g.real;
    const walking = m.grounded && Math.abs(Math.sin(m.phase)) > 0.02, air = !m.grounded;
    const bob = m.grounded ? Math.abs(Math.sin(m.phase)) * 0.03 + Math.sin(t * 2.2) * 0.008 : 0;
    const aimL = localAim(m, rot, f);                                   // gun angle in the sprite frame

    ctx.save(); ctx.translate(fx, fy); ctx.rotate(rot); ctx.scale(s * f, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // -------- jet flame (opposite the thrust) --------
    if (m.thrust > 0) {
      const ex = m.thrustDir[0] * c - m.thrustDir[1] * sn, ey = m.thrustDir[0] * sn + m.thrustDir[1] * c;
      const fa = Math.atan2(-ey, -ex * f), len = (0.35 + 0.35 * m.thrust) * (0.8 + 0.4 * Math.random());
      ctx.save(); ctx.translate(-0.24, 0.4); ctx.rotate(fa);
      ctx.beginPath(); ctx.moveTo(0, -0.09); ctx.quadraticCurveTo(len * 0.6, -0.12, len, 0); ctx.quadraticCurveTo(len * 0.6, 0.12, 0, 0.09); ctx.closePath();
      ctx.fillStyle = '#ff7a1c'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.045); ctx.quadraticCurveTo(len * 0.4, -0.05, len * 0.6, 0); ctx.quadraticCurveTo(len * 0.4, 0.05, 0, 0.045); ctx.closePath();
      ctx.fillStyle = '#ffe066'; ctx.fill();
      ctx.restore();
    }

    // -------- back arm, back leg, backpack --------
    const sw = walking ? Math.sin(m.phase) : air ? 0.5 : 0, cw = walking ? Math.cos(m.phase) : 0;
    drawLeg(ctx, -0.05, -sw, air ? 0.12 : Math.max(0, -cw) * 0.07, SUIT[1], lw);
    toon(ctx, () => rr(ctx, -0.42, 0.36 + bob, 0.26, 0.56, 0.08), PACK, L, 0.05, lw, [-0.33, 0.8 + bob, 0.04, 0.09]);
    ctx.fillStyle = GUN[1]; rr(ctx, -0.35, 0.3 + bob, 0.13, 0.1, 0.03); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
    ctx.fillStyle = '#7cf5d6'; ctx.beginPath(); ctx.arc(-0.29, 0.82 + bob, 0.035, 0, 2 * Math.PI); ctx.fill();

    // -------- body --------
    const body = () => { ctx.beginPath(); ctx.ellipse(0, 0.62 + bob, 0.25, 0.31, 0, 0, 2 * Math.PI); };
    toon(ctx, body, SUIT, L, 0.07, lw, [-0.08, 0.76 + bob, 0.05, 0.1, 0.3]);
    ctx.fillStyle = '#ff9f43'; ctx.save(); body(); ctx.clip(); ctx.fillRect(-0.3, 0.42 + bob, 0.6, 0.07); ctx.restore();
    body(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    const led = (t * 1.3) % 2 < 1.7 ? (m.o2 < O2_WARN ? '#ff5d5d' : '#7cf5d6') : '#3b3566';
    ctx.fillStyle = INK; rr(ctx, 0.04, 0.56 + bob, 0.14, 0.1, 0.03); ctx.fill();
    ctx.fillStyle = led; ctx.beginPath(); ctx.arc(0.08, 0.61 + bob, 0.022, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0.14, 0.61 + bob, 0.018, 0, 2 * Math.PI); ctx.fill();
    drawLeg(ctx, 0.08, sw, air ? 0.04 : Math.max(0, cw) * 0.07, SUIT[0], lw);

    // -------- head in a bubble helmet --------
    const hy = 1.17 + bob;
    ctx.fillStyle = SUIT[1]; ctx.beginPath(); ctx.ellipse(0.02, 0.9 + bob, 0.24, 0.07, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
    const wob = Math.sin(t * 3.1) * 0.12 - (air ? 0.15 : 0) + (walking ? Math.cos(m.phase * 2) * 0.1 : 0);
    const ax = 0.0 + Math.sin(wob) * 0.17, ay = hy + 0.22 + Math.cos(wob) * 0.17;
    ctx.strokeStyle = INK; ctx.lineWidth = lw2 * 1.3; ctx.beginPath(); ctx.moveTo(0.02, hy + 0.2); ctx.quadraticCurveTo(0.0, hy + 0.32, ax, ay); ctx.stroke();
    ctx.fillStyle = ANTENNA; ctx.beginPath(); ctx.arc(ax, ay, 0.055, 0, 2 * Math.PI); ctx.fill(); ctx.lineWidth = lw2; ctx.stroke();
    const head = () => { ctx.beginPath(); ctx.ellipse(0.05, hy - 0.01, 0.33, 0.28, 0, 0, 2 * Math.PI); };
    toon(ctx, head, SKIN, L, 0.06, small ? lw2 * 0.8 : lw2 * 1.2, [-0.06, hy + 0.12, 0.07, 0.04, 0.4]);
    drawFace(g, ctx, m, hy, aimL, lw2, small);

    // glass: tint, ink rim, a fat highlight toward the sun
    ctx.beginPath(); ctx.arc(0.03, hy + 0.02, 0.44, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(205,242,255,0.3)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = small ? lw * 0.7 : lw; ctx.stroke();
    const la = Math.atan2(L[1], L[0]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.055; ctx.beginPath(); ctx.arc(0.03, hy + 0.02, 0.34, la - 0.55, la + 0.35); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0.03 + Math.cos(la + 0.75) * 0.33, hy + 0.02 + Math.sin(la + 0.75) * 0.33, 0.03, 0, 2 * Math.PI); ctx.fill();

    // -------- gun arm, pointing at the cursor --------
    drawGunArm(ctx, m, aimL, bob, lw, lw2, t);
    ctx.restore();
  }

  // aim direction in the sprite frame (after rotation and the facing flip)
  function localAim(m, rot, f) {
    const d = m.aimDir; if (!d) return -0.6;
    const c = Math.cos(-rot), s = Math.sin(-rot), x = d[0] * c - d[1] * s, y = d[0] * s + d[1] * c;
    return Math.atan2(y, x * f);
  }

  function drawLeg(ctx, x, sw, lift, col, lw) {
    const footX = x + sw * 0.13;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.17 + lw; ctx.beginPath(); ctx.moveTo(x, 0.42); ctx.lineTo(footX, 0.1 + lift); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 0.17; ctx.beginPath(); ctx.moveTo(x, 0.42); ctx.lineTo(footX, 0.1 + lift); ctx.stroke();
    ctx.fillStyle = '#6e6896'; ctx.beginPath(); ctx.ellipse(footX + 0.04, 0.07 + lift, 0.12, 0.07, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
  }

  function drawFace(g, ctx, m, hy, aimL, lw, small) {
    const blink = (g.real + 0.7) % 3.4 < 0.12, A = g.astro, big = small ? 1.12 : 1;
    const look = [Math.cos(aimL) * 0.035, Math.sin(aimL) * 0.03];
    const worried = m.o2 < O2_WARN || A.hp < 0.3 * A.hpMax;
    for (const ex of [0.0, 0.17]) {
      const ey = hy + 0.04, r = (ex ? 0.085 : 0.078) * big;
      if (blink) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey); ctx.stroke(); continue; }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(ex, ey, r, r * 1.15, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + look[0], ey + look[1], r * (small ? 0.64 : 0.58), 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex + look[0] - r * 0.22, ey + look[1] + r * 0.25, r * 0.2, 0, 2 * Math.PI); ctx.fill();
      if (worried) { ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(ex - r, ey + r * 1.5 + (ex ? -0.02 : 0.02)); ctx.lineTo(ex + r, ey + r * 1.5 + (ex ? 0.02 : -0.02)); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255,120,160,0.55)';
    if (!small) for (const bx of [-0.08, 0.25]) { ctx.beginPath(); ctx.ellipse(bx, hy - 0.07, 0.045, 0.025, 0, 0, 2 * Math.PI); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.9; ctx.beginPath();
    if (m.firing) { ctx.fillStyle = INK; ctx.ellipse(0.1, hy - 0.11, 0.03, 0.035, 0, 0, 2 * Math.PI); ctx.fill(); }
    else if (worried) { ctx.arc(0.1, hy - 0.15, 0.045, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    else { ctx.arc(0.1, hy - 0.07, 0.05, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
  }

  function drawGunArm(ctx, m, a, bob, lw, lw2, t) {
    ctx.save(); ctx.translate(0.02, 0.72 + bob); ctx.rotate(a);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.13 + lw; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.26, 0); ctx.stroke();
    ctx.strokeStyle = SUIT[0]; ctx.lineWidth = 0.13; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.26, 0); ctx.stroke();
    toon(ctx, () => rr(ctx, 0.2, -0.07, 0.36, 0.14, 0.05), GUN, [0, 1], 0.03, lw2 * 1.2, null);
    ctx.fillStyle = GUN[1]; rr(ctx, 0.24, -0.15, 0.08, 0.1, 0.02); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
    const glow = m.firing ? 0.07 + 0.02 * Math.sin(t * 40) : 0.04;
    ctx.fillStyle = m.firing ? '#ffffff' : BEAM; ctx.beginPath(); ctx.arc(0.57, 0, glow, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
    ctx.restore();
  }

  function drawBeam(g, kit, B) {
    const ctx = kit.ctx, px = kit.px(), fl = 0.8 + 0.4 * Math.random();
    const line = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(B.x0, B.y0); ctx.lineTo(B.x1, B.y1); ctx.stroke(); };
    ctx.lineCap = 'round';
    line(Math.max(0.5, 14 * px) * fl, 'rgba(255,79,139,0.22)');
    line(Math.max(0.2, 6 * px), INK);
    line(Math.max(0.13, 3.8 * px), BEAM);
    line(Math.max(0.05, 1.5 * px), '#fff2f7');
    if (!B.hit) return;
    const R = Math.max(0.55, 14 * px) * fl, gr = ctx.createRadialGradient(B.x1, B.y1, 0, B.x1, B.y1, R);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,120,170,0.6)'); gr.addColorStop(1, 'rgba(255,79,139,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(B.x1, B.y1, R, 0, 2 * Math.PI); ctx.fill();
    const n = 7, r0 = R * 0.35, spin = g.real * 9;                       // comic impact star in the material colour
    ctx.beginPath();
    for (let i = 0; i <= 2 * n; i++) {
      const a = spin + i * Math.PI / n, r = i % 2 ? r0 * 0.45 : r0 * (0.9 + 0.3 * Math.random());
      i ? ctx.lineTo(B.x1 + r * Math.cos(a), B.y1 + r * Math.sin(a)) : ctx.moveTo(B.x1 + r * Math.cos(a), B.y1 + r * Math.sin(a));
    }
    ctx.closePath(); ctx.fillStyle = B.col || '#ffffff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px; ctx.stroke();
  }

  // -------- screen layer: reticle, material tag, ship arrow, warnings --------

  function drawScreen(g, kit) {
    const m = st(g);
    if (!isOut(g)) return;
    const ctx = kit.ctx;
    vignette(g, kit, m);
    if (m.aimS && kit.cam && !kit.cam.map) {
      const [sx, sy] = m.aimS, inR = m.hover ? m.hover.inRange : true, col = m.firing ? '#ffffff' : inR ? '#ff8fab' : '#9a8fbd';
      ctx.lineWidth = 4.5; ctx.strokeStyle = INK; reticle(ctx, sx, sy); ctx.lineWidth = 2; ctx.strokeStyle = col; reticle(ctx, sx, sy);
      if (m.hover && m.hover.mat.item) {
        const h = m.hover, mc = matCol(h.mat, h.b)[0];
        ctx.font = `700 12.5px ${kit.FONT}`; ctx.textAlign = 'center';
        kit.outlinedText(MAT_NAME[h.mat.id].toUpperCase(), sx, sy + 28, mc, 4);
        ctx.font = `500 11px ${kit.FONT}`;
        kit.outlinedText(h.inRange ? `hardness ${h.mat.hard}` : 'out of laser range', sx, sy + 42, '#fff4dc', 3.5);
        ctx.textAlign = 'left';
      }
    }
    shipArrow(g, kit);
    if (m.lost > 0) {
      ctx.save(); ctx.textAlign = 'center'; ctx.font = `700 26px ${kit.FONT}`;
      const pulse = 1 + 0.08 * Math.sin(g.real * 10);
      ctx.translate(kit.W / 2, kit.H * 0.36); ctx.scale(pulse, pulse);
      kit.outlinedText(`TETHER RECALL IN ${Math.max(0, Math.ceil(RECALL_T - m.lost))}`, 0, 0, '#ffd166', 7);
      ctx.restore();
    }
  }

  function reticle(ctx, x, y) {
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 13, y + dy * 13); ctx.lineTo(x + dx * 18, y + dy * 18); }
    ctx.stroke();
  }

  function shipArrow(g, kit) {
    if (g.status === 'dead') return;
    const ctx = kit.ctx, [sx, sy] = kit.toScreen(g.sh.x, g.sh.y), W = kit.W, H = kit.H;
    if (kit.onScreen(sx, sy, -40)) return;
    if (kit.edgeArrow) return kit.edgeArrow('ship', g.sh.x, g.sh.y, `${g.S.name} ${kit.fmtDist(Math.max(0, hullDist(g)))}`, '#ffb347');   // core lays out edge arrows
    const a = Math.atan2(sy - H / 2, sx - W / 2), mx = 46;
    const k = Math.min((W / 2 - mx) / Math.max(1e-6, Math.abs(Math.cos(a))), (H / 2 - mx - 40) / Math.max(1e-6, Math.abs(Math.sin(a))));
    const ex = W / 2 + Math.cos(a) * k, ey = H / 2 + Math.sin(a) * k;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.fillStyle = '#ffb347'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    kit.tag(ex - Math.cos(a) * 34, ey - Math.sin(a) * 26 + 4, `${g.S.name} ${kit.fmtDist(Math.max(0, hullDist(g)))}`, '#ffb347');
  }

  function vignette(g, kit, m) {
    const A = g.astro, bad = m.o2 < O2_WARN || A.hp < 0.3 * A.hpMax;
    if (!bad) return;
    const ctx = kit.ctx, W = kit.W, H = kit.H, a = (m.o2 <= 0 ? 0.5 : 0.34) * (0.65 + 0.35 * Math.sin(g.real * (m.o2 <= 0 ? 7 : 4)));
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.5);
    gr.addColorStop(0, 'rgba(230,57,70,0)'); gr.addColorStop(1, `rgba(230,57,70,${Math.max(0, a)})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }

  // -------- HUD: the SUIT panel --------

  function drawHUD(g, kit) {
    if (!isOut(g)) return;
    const m = st(g), A = g.astro, S = g.S, ctx = kit.ctx, C = kit.COL;
    const kg = Game.kgOf(g.pack), items = Object.entries(g.pack).filter(([, q]) => q > 0);
    let y = kit.stackLeft(26 + 4 * 30 + 18, 'SUIT');
    const fr = (a, b) => (b > 0 ? a / b : 0);
    kit.bar('SUIT HP', fr(A.hp, A.hpMax), 24, y, A.hp < 0.3 * A.hpMax ? C.bad : C.good, `${Math.max(0, A.hp).toFixed(0)} / ${A.hpMax}`); y += 30;
    kit.bar('AIR', fr(m.o2, S.o2), 24, y, m.o2 < O2_WARN ? C.bad : '#4cc9f0', `${Math.ceil(m.o2)} s`); y += 30;
    kit.bar(m.gov ? 'JETPACK · GOVERNOR' : 'JETPACK', fr(m.jet, S.jetFuel), 24, y, m.gov ? C.tgt : m.jet < 1 ? C.warn : '#ff9f43', `${m.jet.toFixed(1)} s`); y += 30;
    kit.bar('BACKPACK', fr(kg, S.packCap), 24, y, kg >= S.packCap - 0.5 ? C.bad : '#b892ff', `${kg.toFixed(0)} / ${S.packCap} kg`); y += 22;
    ctx.font = `500 12.5px ${kit.FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = items.length ? kit.INK : C.dim;
    const txt = items.length ? items.map(([k, q]) => (ITEMS[k] && ITEMS[k].kind !== 'ore' ? `${q}× ${ITEMS[k].name.toLowerCase()}` : `${q * (ITEMS[k] ? ITEMS[k].kg : 1)} kg ${k}`)).join(' · ') : 'empty: go dig something';
    ctx.fillText(kit.fit(txt, 212), 24, y);
  }


  // ======================================================================
  //  REGISTER + JOBS
  // ======================================================================

  const mod = Game.register({
    id: 'eva', init, load, save, ready, respawn, died, onKey, onMouse, frame, step, after,
    warpLimit, interactions, camera, hint, controls, drawWorld, drawWorldTop, drawScreen, drawHUD,
  });
  on = Game.mods.includes(mod);
  if (on) Game.addGoals([
    { id: 'mine', order: 30, reward: 75, text: `Laser ${MINE_KG} kg of ore on foot (E)`,
      test: (g) => !!(g.mod.eva && g.mod.eva.hauled >= MINE_KG) },
    { id: 'gem', order: 65, reward: 150, text: 'Bag a gem on foot (buried ones sparkle up close)',
      test: (g) => !!(g.mod.eva && g.mod.eva.gems > 0) },
  ]);

  return { isOut, stepOut, board, recall, reach, canBoard, canStepOut, walkMax, kickRoom, MINE_KG, BOARD_R, FAR_MAX, ZOOM };
})();

if (typeof module !== 'undefined') module.exports = EVA;
