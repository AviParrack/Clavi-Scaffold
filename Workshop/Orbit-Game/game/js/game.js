// ======================================================================
//  GAME  —  flight state, controls -> physics, ground contact, goals
// ======================================================================

const Game = (() => {

  const P = CONFIG.planet, Rk = CONFIG.rocket, SIM = CONFIG.sim;

  // ---------------- flight-school goals ----------------

  const GOALS = [
    { id: 'liftoff', text: 'Lift off',                         test: (g)    => g.status === 'flying' },
    { id: 'space',   text: 'Reach space (120 m)',              test: (g)    => g.alt > CONFIG.goals.space },
    { id: 'orbit',   text: 'Get into orbit (Pe > 120 m)',      test: (g, o) => o.pe > CONFIG.goals.orbitPe && o.E < 0 },
    { id: 'highAp',  text: 'Boost Ap above 1500 m',            test: (g, o) => o.E < 0 && o.ap > CONFIG.goals.highAp },
    { id: 'circ',    text: 'Circularize high (Pe > 1200 m)',   test: (g, o) => o.E < 0 && o.e < CONFIG.goals.highCircE && o.pe > CONFIG.goals.highCircAlt },
    { id: 'escape',  text: 'Escape Pebble (bonus)',            test: (g, o) => o.E >= 0 && g.status === 'flying' },
    { id: 'home',    text: 'Come home: land softly',           test: (g)    => g.status === 'landed' && g.done.orbit },
  ];

  const TOASTS = {
    liftoff: 'LIFTOFF!', space: 'WELCOME TO SPACE', orbit: '★ ORBIT ACHIEVED ★',
    highAp: 'HIGH FLYER', circ: '★ CIRCULAR, BABY ★', escape: '☄ ESCAPE VELOCITY ☄', home: '★ SAFE LANDING ★',
  };

  // ---------------- new flight ----------------

  function create(seed) {
    return {
      s: Physics.newState(CONFIG),
      status: 'pad',                 // pad | flying | landed | crashed
      t: 0, alt: 0, throttle: 0,
      warpIdx: 0, hold: null,        // hold: null | 'pro' | 'retro'
      done: {}, events: [], trail: [], particles: [],
      seed, stepsLastFrame: 0,
      coastE0: null,                 // energy at engine cut-off, for drift check
    };
  }

  // ---------------- per-frame update ----------------
  // input: { left, right, thrust, fine }   frameDt: real seconds

  function update(g, input, frameDt) {
    const s = g.s;
    if (g.status === 'crashed') { tickParticles(g, frameDt); return; }

    // -------- throttle & warp limits --------
    let thr = input.thrust ? (input.fine ? Rk.fineThrottle : 1) : 0;
    if (s.fuel <= 0) thr = 0;
    if (thr > 0) g.warpIdx = Math.min(g.warpIdx, SIM.warps.indexOf(SIM.maxWarpBurning));
    if (g.alt < P.atmoTop && g.status === 'flying') g.warpIdx = Math.min(g.warpIdx, SIM.warps.indexOf(SIM.maxWarpAtmo));
    const warp = SIM.warps[g.warpIdx];

    // -------- integrate in fixed steps --------
    const simDt = Math.min(frameDt, 1 / 20) * warp;
    const n = Math.max(1, Math.round(simDt / SIM.dt));
    let delivered = 0;
    for (let i = 0; i < n; i++) {
      steer(g, input, SIM.dt);
      const px = s.x, py = s.y;
      delivered = Physics.step(s, thr, SIM.dt, CONFIG);
      g.t += SIM.dt;
      if (ground(g, px, py)) break;
    }
    g.stepsLastFrame = n;
    g.throttle = delivered;
    g.alt = Physics.altitude(s, P);

    // -------- coast energy bookkeeping (debug) --------
    if (delivered > 0 || g.alt < P.atmoTop) g.coastE0 = null;
    else if (g.coastE0 === null) g.coastE0 = Physics.energy(s, P);

    // -------- trail, particles, goals --------
    if (g.status === 'flying' && (g.trail.length === 0 || g.t - g.trail[g.trail.length - 1][2] > 0.25)) {
      g.trail.push([s.x, s.y, g.t]);
      if (g.trail.length > 1500) g.trail.shift();
    }
    if (delivered > 0) spawnExhaust(g, delivered);
    tickParticles(g, frameDt);
    checkGoals(g);
  }

  // ---------------- steering: manual or hold prograde/retro ----------------

  function steer(g, input, dt) {
    const s = g.s, w = Rk.turnRate * dt;
    if (input.left || input.right) {
      g.hold = null;
      s.angle += (input.left ? w : 0) - (input.right ? w : 0);
      return;
    }
    if (!g.hold || Physics.speed(s) < 0.5) return;
    let target = Math.atan2(s.vy, s.vx) + (g.hold === 'retro' ? Math.PI : 0);
    let d = Math.atan2(Math.sin(target - s.angle), Math.cos(target - s.angle));
    s.angle += Math.max(-w, Math.min(w, d));
  }

  // ---------------- ground contact ----------------
  // returns true if the rocket touched down / crashed this step

  function ground(g, px, py) {
    const s = g.s, r = Physics.radius(s);
    if (r >= P.R) {
      if (g.status !== 'flying' && r > P.R + 0.05) setStatus(g, 'flying');
      return false;
    }
    const v = Physics.speed(s);
    if (g.status === 'flying') {
      if (v > Rk.crashSpeed) { crash(g, v); return true; }
      setStatus(g, 'landed', `touchdown at ${v.toFixed(1)} m/s`);
    }
    const pr = Math.hypot(px, py);                         // snap back onto the surface
    s.x = px / pr * P.R; s.y = py / pr * P.R;
    s.vx = 0; s.vy = 0;
    return false;
  }

  function crash(g, v) {
    setStatus(g, 'crashed', `impact at ${v.toFixed(1)} m/s`);
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * 2 * Math.PI, sp = 5 + Math.random() * 25;
      g.particles.push({ x: g.s.x, y: g.s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                         life: 1 + Math.random(), max: 2, kind: 'boom' });
    }
  }

  function setStatus(g, status, why = '') {
    if (g.status === status) return;
    g.events.push({ t: g.t, msg: `${g.status} -> ${status} ${why}` });
    console.log(`[orbit] t=${g.t.toFixed(2)}  ${g.status} -> ${status}  ${why}`);
    g.status = status;
  }

  // ---------------- particles ----------------

  function spawnExhaust(g, thr) {
    const s = g.s, back = s.angle + Math.PI;
    for (let i = 0; i < 2; i++) {
      const a = back + (Math.random() - 0.5) * 0.5, sp = 15 + Math.random() * 15 * thr;
      g.particles.push({ x: s.x, y: s.y, vx: s.vx + Math.cos(a) * sp, vy: s.vy + Math.sin(a) * sp,
                         life: 0.5 + Math.random() * 0.4, max: 0.9, kind: 'smoke' });
    }
    if (g.particles.length > 600) g.particles.splice(0, g.particles.length - 600);
  }

  function tickParticles(g, dt) {
    for (const p of g.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt; }
    g.particles = g.particles.filter((p) => p.life > 0);
  }

  // ---------------- goals ----------------

  function checkGoals(g) {
    const o = Physics.orbit(g.s, P);
    for (const goal of GOALS) {
      if (g.done[goal.id] || !goal.test(g, o)) continue;
      g.done[goal.id] = g.t;
      g.toast = { text: TOASTS[goal.id], t0: performance.now() };
      console.log(`[orbit] GOAL ${goal.id} at t=${g.t.toFixed(1)} s  (Ap ${o.ap.toFixed(0)}, Pe ${o.pe.toFixed(0)}, fuel ${g.s.fuel.toFixed(2)} t)`);
    }
  }

  // ---------------- contextual tutorial hint ----------------

  function hint(g) {
    const o = Physics.orbit(g.s, P), d = g.done;
    if (g.status === 'crashed') return 'Kaboom. Press R to try again.';
    if (g.status === 'pad')     return 'Hold W (or ↑) to light the engine!';
    if (g.s.fuel <= 0 && g.status === 'flying' && !(o.pe > P.atmoTop)) return 'Out of fuel... enjoy the view. R to restart.';
    if (!d.orbit) {
      if (g.alt < 30)          return 'Going up! Tap D (or →) to start tilting sideways.';
      if (o.ap < 200 && g.throttle > 0) return 'Keep tilting toward horizontal. Watch Ap climb.';
      if (o.ap >= 200 && g.throttle > 0) return 'Ap is high enough. Let go of W to coast!';
      if (o.pe < P.atmoTop)    return 'Coast to Ap (see T-Ap), press Q to point prograde, then burn to lift Pe above 120 m.';
    }
    if (!d.highAp) return 'In orbit! Burn prograde (Q, then W) to raise your Ap. M toggles the map.';
    if (!d.circ)   return 'Wait for Ap (T-Ap), then burn prograde to raise Pe. Circle it out.';
    if (!d.home)   return 'Retro burn (E, then W) at Ap to drop Pe into the air, then land under 6 m/s.';
    return 'Flight school complete. You are a rocket person now.';
  }

  return { create, update, hint, GOALS };
})();
