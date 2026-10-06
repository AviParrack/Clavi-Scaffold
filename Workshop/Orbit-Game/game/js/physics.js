// ======================================================================
//  PHYSICS  —  ship dynamics: gravity from all bodies, main engine,
//  ion cruise drive, side pods (and the dash), RCS rotation (torque -> spin)
//  and RCS translation. Leapfrog integrator. S = derived ship stats
//  (Game.recalc), not CONFIG.
// ======================================================================

const Physics = (() => {

  const Wd = typeof World !== 'undefined' ? World : require('./world.js');
  const WHEEL = 0.15;             // reaction wheel torque as a fraction of RCS torque (works with the RCS tank empty)

  // ---------------- ship state ----------------
  //  { x, y, vx, vy, ang, omega, fuel [t], xe [t ion propellant], rcs, hull, cargoKg }    ang: nose, CCW from +x

  function newShip(S) {
    return { x: 0, y: 0, vx: 0, vy: 0, ang: Math.PI / 2, omega: 0,
             fuel: S.fuel, xe: S.ionTank || 0, rcs: S.rcs, hull: S.hull, cargoKg: 0 };
  }

  const mass     = (sh, S) => S.dry + sh.fuel + (sh.xe || 0) + (sh.cargoKg || 0) / 1000;
  const deltaV   = (sh, S) => S.ve * Math.log(mass(sh, S) / (mass(sh, S) - sh.fuel));
  const ionDeltaV = (sh, S) => S.ionVe && sh.xe ? S.ionVe * Math.log(mass(sh, S) / (mass(sh, S) - sh.xe)) : 0;
  const fullMass = (S) => S.dry + S.fuel + (S.ionTank || 0);

  // ---------------- one fixed step ----------------
  //  ctrl = { main: 0..1, ion: 0|1, rot: -1|0|1, kill: bool, fwd: -1..1, left: -1..1, side: -1..1, dash: bool, cant: rad }
  //  side > 0 pushes toward the ship's left (like left); pods burn main propellant at F / sideVe
  //  cant: the main engine splits into two jets ±cant off the axis (towing: the plume misses the rock); the same
  //  propellant flow, cos(cant) of the thrust along the nose
  //  returns what actually fired: { main, ion, rot, trans, side, cant }

  const sideVeOf = (S) => (S.sideVe > 0 ? S.sideVe : Math.min(0.85 * S.ve, 900));

  function step(sh, ctrl, t, dt, w, S) {
    const m = mass(sh, S), boost = fullMass(S) / m;               // lighter ship = snappier RCS
    const out = { main: 0, ion: 0, rot: 0, trans: 0, side: 0, cant: 0 };

    // -------- rotation: RCS torque --------
    let alpha = 0;
    const jets = sh.rcs > 0, aMax = S.rotAccel * boost * (jets ? 1 : WHEEL);      // empty RCS: a slow reaction wheel, no propellant
    if (ctrl.rot) alpha = ctrl.rot * aMax;
    else if (ctrl.kill && Math.abs(sh.omega) > 1e-4) alpha = -Math.sign(sh.omega) * Math.min(aMax, Math.abs(sh.omega) / dt);
    if (alpha && jets) { out.rot = Math.abs(alpha) / aMax; sh.rcs = Math.max(0, sh.rcs - S.rcsRotUse * out.rot * dt); }
    sh.omega += alpha * dt;
    sh.ang += sh.omega * dt;

    // -------- main engine and side pods share the tank (mass flow = F / ve) --------
    let thr = sh.fuel > 0 ? (ctrl.main || 0) : 0;
    let side = sh.fuel > 0 && (S.sideThrust ?? 0) > 0 ? (ctrl.side || 0) : 0;
    let sideF = side * (S.sideThrust ?? 0) * (ctrl.dash ? (S.dashBoost ?? 0) : 1);
    const burn = (thr * S.thrust / S.ve + Math.abs(sideF) / sideVeOf(S)) * dt;
    if (burn > sh.fuel) { const k = sh.fuel / burn; thr *= k; side *= k; sideF *= k; }
    const mdot = thr * S.thrust / S.ve + Math.abs(sideF) / sideVeOf(S);
    out.main = thr; out.side = side; out.cant = thr ? ctrl.cant || 0 : 0;

    // -------- ion cruise drive (tiny thrust, huge ve) --------
    let ion = S.ionThrust > 0 && sh.xe > 0 ? (ctrl.ion || 0) : 0;
    if (ion && ion * S.ionThrust / S.ionVe * dt > sh.xe) ion = sh.xe / (S.ionThrust / S.ionVe * dt);
    const xdot = ion ? ion * S.ionThrust / S.ionVe : 0;
    out.ion = ion;

    const mMid = m - 0.5 * (mdot + xdot) * dt;

    // -------- RCS translation (ship frame) --------
    let tf = 0, tl = 0;
    if (sh.rcs > 0 && (ctrl.fwd || ctrl.left)) {
      const n = Math.hypot(ctrl.fwd, ctrl.left);
      tf = ctrl.fwd / n; tl = ctrl.left / n;
      out.trans = 1;
      sh.rcs = Math.max(0, sh.rcs - S.rcsTransUse * dt);
    }

    const c = Math.cos(sh.ang), s = Math.sin(sh.ang);
    const aMain = (thr * S.thrust * Math.cos(out.cant) + (ion ? ion * S.ionThrust : 0)) / mMid, aT = S.transAccel * boost, aS = sideF / mMid;
    const fx = aMain * c + aT * (tf * c - tl * s) - aS * s;
    const fy = aMain * s + aT * (tf * s + tl * c) + aS * c;

    // -------- leapfrog: kick, drift, kick --------
    let [gx, gy] = Wd.gravity(w, sh.x, sh.y, t);
    sh.vx += 0.5 * dt * (gx + fx); sh.vy += 0.5 * dt * (gy + fy);
    sh.x += dt * sh.vx;            sh.y += dt * sh.vy;
    [gx, gy] = Wd.gravity(w, sh.x, sh.y, t + dt);
    sh.vx += 0.5 * dt * (gx + fx); sh.vy += 0.5 * dt * (gy + fy);

    sh.fuel = Math.max(0, sh.fuel - mdot * dt);
    if (xdot) sh.xe = Math.max(0, sh.xe - xdot * dt);
    return out;
  }

  // ---------------- trajectory preview (engines off) ----------------
  //  returns { pts: [[x, y, t], ...], impact: null | { body, t, x, y } }
  //  impact = centre comes within the body outline + pad (a star: within its kill radius), tested along each
  //  segment between points (closest approach of the straight relative motion), so a long step cannot skip a small rock

  function predict(sh, t0, w, horizon, nSteps, pad = 0) {
    let x = sh.x, y = sh.y, vx = sh.vx, vy = sh.vy, t = t0;
    const dt = horizon / nSteps, pts = [[x, y, t]];
    let [gx, gy] = Wd.gravity(w, x, y, t), st0 = Wd.states(w, t);
    const reach = w.bodies.map((b) => b.killR || b.R * (1 + b.shape) + pad);
    for (let i = 0; i < nSteps; i++) {
      const x0 = x, y0 = y;
      vx += 0.5 * dt * gx; vy += 0.5 * dt * gy;
      x += dt * vx;        y += dt * vy;
      t += dt;
      [gx, gy] = Wd.gravity(w, x, y, t);
      vx += 0.5 * dt * gx; vy += 0.5 * dt * gy;
      pts.push([x, y, t]);
      const st = Wd.states(w, t);
      for (const b of w.bodies) {
        const k = b.idx, ax = x0 - st0[k][0], ay = y0 - st0[k][1], bx = x - st[k][0], by = y - st[k][1];
        const far = reach[k] + Math.abs(bx - ax) + Math.abs(by - ay);
        if (bx * bx + by * by > far * far) continue;                    // the whole step stays out of reach (cheap)
        const hit = segmentHit(b, ax, ay, bx, by, pad);
        if (hit >= 0) return { pts, impact: { body: b, t: t - dt + hit * dt, x: x0 + hit * (x - x0), y: y0 + hit * (y - y0) } };
      }
      st0 = st;
    }
    return { pts, impact: null };
  }

  // relative positions a -> b along one straight step: the fraction 0..1 where it first comes within reach of the
  //  origin (0 if it starts inside), or -1 if it never does.  opt. inside(cx, cy): extra test at the closest point
  function segEntry(ax, ay, bx, by, reach, inside) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, ad = ax * dx + ay * dy;
    const s = L2 > 0 ? Math.max(0, Math.min(1, -ad / L2)) : 1, cx = ax + s * dx, cy = ay + s * dy;
    if (Math.hypot(cx, cy) >= reach || (inside && !inside(cx, cy))) return -1;
    const c = ax * ax + ay * ay - reach * reach;
    return c <= 0 ? 0 : Math.max(0, Math.min(s, (-ad - Math.sqrt(Math.max(0, ad * ad - L2 * c))) / L2));
  }
  function segmentHit(b, ax, ay, bx, by, pad) {
    if (b.killR) return segEntry(ax, ay, bx, by, b.killR);
    return segEntry(ax, ay, bx, by, b.R * (1 + b.shape) + pad, (cx, cy) => Math.hypot(cx, cy) < Wd.surfaceR(b, Math.atan2(cy, cx)) + pad);
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
    const surf = Wd.surfaceR(b, Math.atan2(y, x));
    return { r, alt: r - surf, speed: Math.sqrt(v2), vr: rv / r, E, h, e, a, T,
             pe: (E < 0 ? a * (1 - e) : h * h / mu / (1 + e)) - b.R, ap: E < 0 ? a * (1 + e) - b.R : Infinity,
             vx, vy, x, y };
  }

  return { newShip, mass, deltaV, ionDeltaV, fullMass, sideVeOf, step, predict, segEntry, orbitRel };
})();

if (typeof module !== 'undefined') module.exports = Physics;
