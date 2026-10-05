// ======================================================================
//  PHYSICS  —  ship dynamics: gravity from all bodies, main engine,
//  RCS rotation (torque -> spin) and RCS translation. Leapfrog integrator.
// ======================================================================

const Physics = (() => {

  const Wd = typeof World !== 'undefined' ? World : require('./world.js');

  // ---------------- ship state ----------------
  //  { x, y, vx, vy, ang, omega, fuel, rcs, hull }    ang: nose direction, CCW from +x

  function newShip(cfg) {
    const S = cfg.ship;
    return { x: 0, y: 0, vx: 0, vy: 0, ang: Math.PI / 2, omega: 0, fuel: S.fuel, rcs: S.rcs, hull: S.hull };
  }

  const mass   = (sh, S) => S.dry + sh.fuel;
  const deltaV = (sh, S) => S.ve * Math.log(mass(sh, S) / S.dry);
  const fullMass = (S) => S.dry + S.fuel;

  // ---------------- one fixed step ----------------
  //  ctrl = { main: 0..1, rot: -1|0|1, kill: bool, fwd: -1..1, left: -1..1 }
  //  returns what actually fired: { main, rot, trans }

  function step(sh, ctrl, t, dt, w, cfg) {
    const S = cfg.ship, m = mass(sh, S), boost = fullMass(S) / m;   // lighter ship = snappier RCS
    const out = { main: 0, rot: 0, trans: 0 };

    // -------- rotation: RCS torque --------
    let alpha = 0;
    if (sh.rcs > 0) {
      const aMax = S.rotAccel * boost;
      if (ctrl.rot) alpha = ctrl.rot * aMax;
      else if (ctrl.kill && Math.abs(sh.omega) > 1e-4) alpha = -Math.sign(sh.omega) * Math.min(aMax, Math.abs(sh.omega) / dt);
      if (alpha) { out.rot = Math.abs(alpha) / aMax; sh.rcs = Math.max(0, sh.rcs - S.rcsRotUse * out.rot * dt); }
    }
    sh.omega += alpha * dt;
    sh.ang += sh.omega * dt;

    // -------- main engine (mass flow = T / ve) --------
    let thr = sh.fuel > 0 ? ctrl.main : 0;
    if (thr * S.thrust / S.ve * dt > sh.fuel) thr = sh.fuel / (S.thrust / S.ve * dt);
    const mdot = thr * S.thrust / S.ve;
    const mMid = m - 0.5 * mdot * dt;
    out.main = thr;

    // -------- RCS translation (ship frame) --------
    let tf = 0, tl = 0;
    if (sh.rcs > 0 && (ctrl.fwd || ctrl.left)) {
      const n = Math.hypot(ctrl.fwd, ctrl.left);
      tf = ctrl.fwd / n; tl = ctrl.left / n;
      out.trans = 1;
      sh.rcs = Math.max(0, sh.rcs - S.rcsTransUse * dt);
    }

    const c = Math.cos(sh.ang), s = Math.sin(sh.ang);
    const aMain = thr * S.thrust / mMid, aT = S.transAccel * boost;
    const fx = aMain * c + aT * (tf * c - tl * s);
    const fy = aMain * s + aT * (tf * s + tl * c);

    // -------- leapfrog: kick, drift, kick --------
    let [gx, gy] = Wd.gravity(w, sh.x, sh.y, t);
    sh.vx += 0.5 * dt * (gx + fx); sh.vy += 0.5 * dt * (gy + fy);
    sh.x += dt * sh.vx;            sh.y += dt * sh.vy;
    [gx, gy] = Wd.gravity(w, sh.x, sh.y, t + dt);
    sh.vx += 0.5 * dt * (gx + fx); sh.vy += 0.5 * dt * (gy + fy);

    sh.fuel = Math.max(0, sh.fuel - mdot * dt);
    return out;
  }

  // ---------------- trajectory preview (engines off) ----------------
  //  returns { pts: [[x, y, t], ...], impact: null | { body, t, x, y } }

  function predict(sh, t0, w, horizon, nSteps) {
    let x = sh.x, y = sh.y, vx = sh.vx, vy = sh.vy, t = t0;
    const dt = horizon / nSteps, pts = [[x, y, t]];
    let [gx, gy] = Wd.gravity(w, x, y, t);
    for (let i = 0; i < nSteps; i++) {
      vx += 0.5 * dt * gx; vy += 0.5 * dt * gy;
      x += dt * vx;        y += dt * vy;
      t += dt;
      [gx, gy] = Wd.gravity(w, x, y, t);
      vx += 0.5 * dt * gx; vy += 0.5 * dt * gy;
      pts.push([x, y, t]);
      const st = Wd.states(w, t);
      for (const b of w.bodies) {
        if (Math.hypot(x - st[b.idx][0], y - st[b.idx][1]) < b.R) return { pts, impact: { body: b, t, x, y } };
      }
    }
    return { pts, impact: null };
  }

  // ---------------- two-body elements relative to a body ----------------

  function orbitRel(sh, b, t, w) {
    const [bx, by, bvx, bvy] = Wd.bodyState(w, b, t);
    const x = sh.x - bx, y = sh.y - by, vx = sh.vx - bvx, vy = sh.vy - bvy;
    const r = Math.hypot(x, y), v2 = vx * vx + vy * vy, mu = b.mu;
    const E = 0.5 * v2 - mu / r, h = x * vy - y * vx;
    const rv = x * vx + y * vy;
    const ex = ((v2 - mu / r) * x - rv * vx) / mu, ey = ((v2 - mu / r) * y - rv * vy) / mu;
    const e = Math.hypot(ex, ey);
    const a = E < 0 ? -mu / (2 * E) : Infinity;
    const T = E < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity;
    return { r, alt: r - b.R, speed: Math.sqrt(v2), vr: rv / r, E, h, e, a, T,
             pe: (E < 0 ? a * (1 - e) : h * h / mu / (1 + e)) - b.R, ap: E < 0 ? a * (1 + e) - b.R : Infinity,
             vx, vy, x, y };
  }

  return { newShip, mass, deltaV, fullMass, step, predict, orbitRel };
})();

if (typeof module !== 'undefined') module.exports = Physics;
