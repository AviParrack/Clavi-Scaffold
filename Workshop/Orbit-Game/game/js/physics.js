// ======================================================================
//  PHYSICS  —  Newtonian point-mass gravity + rocket equation + drag
//  Integrator: leapfrog (kick-drift-kick), symplectic -> orbits don't drift
// ======================================================================

const Physics = (() => {

  // ---------------- state ----------------
  // s = { x, y, vx, vy, angle, fuel }     angle: 0 = +x, CCW positive

  function newState(cfg) {
    const P = cfg.planet, Rk = cfg.rocket;
    return { x: 0, y: P.R, vx: 0, vy: 0, angle: Math.PI / 2, fuel: Rk.fuel };
  }

  const mass     = (s, Rk) => Rk.dry + s.fuel;
  const radius   = (s) => Math.hypot(s.x, s.y);
  const altitude = (s, P) => radius(s) - P.R;
  const speed    = (s) => Math.hypot(s.vx, s.vy);

  function density(alt, P) {
    if (alt >= P.atmoTop) return 0;
    const fade = 1 - alt / P.atmoTop;                       // smooth to 0 at the top
    return P.rho0 * Math.exp(-Math.max(alt, 0) / P.scaleH) * fade;
  }

  // ---------------- forces ----------------

  function accel(x, y, vx, vy, m, thrustF, angle, cfg) {
    const P = cfg.planet, Rk = cfg.rocket;
    const r2 = x * x + y * y, r = Math.sqrt(r2);

    const kg = -P.mu / (r2 * r);                             // gravity
    let ax = kg * x, ay = kg * y;

    ax += thrustF / m * Math.cos(angle);                     // thrust
    ay += thrustF / m * Math.sin(angle);

    const rho = density(r - P.R, P);                         // drag
    if (rho > 0) {
      const v = Math.hypot(vx, vy), kd = -0.5 * rho * Rk.CdA * v / m;
      ax += kd * vx; ay += kd * vy;
    }
    return [ax, ay];
  }

  // ---------------- one fixed step ----------------
  // returns the throttle actually delivered (0 when out of fuel)

  function step(s, throttle, dt, cfg) {
    const Rk = cfg.rocket;

    let mdot = throttle * Rk.thrust / Rk.ve;
    if (mdot * dt > s.fuel) throttle *= s.fuel / (mdot * dt); // last drop of fuel
    mdot = throttle * Rk.thrust / Rk.ve;
    const F = throttle * Rk.thrust;

    const m0 = mass(s, Rk);
    const m1 = m0 - mdot * dt;
    const mMid = 0.5 * (m0 + m1);

    let [ax, ay] = accel(s.x, s.y, s.vx, s.vy, mMid, F, s.angle, cfg);
    s.vx += 0.5 * dt * ax;  s.vy += 0.5 * dt * ay;           // kick
    s.x  += dt * s.vx;      s.y  += dt * s.vy;               // drift
    [ax, ay] = accel(s.x, s.y, s.vx, s.vy, mMid, F, s.angle, cfg);
    s.vx += 0.5 * dt * ax;  s.vy += 0.5 * dt * ay;           // kick

    s.fuel = Math.max(0, s.fuel - mdot * dt);
    return throttle;
  }

  // ---------------- diagnostics ----------------

  const energy  = (s, P) => 0.5 * (s.vx ** 2 + s.vy ** 2) - P.mu / radius(s);  // per unit mass
  const angMom  = (s) => s.x * s.vy - s.y * s.vx;                               // per unit mass
  const deltaV  = (s, Rk) => Rk.ve * Math.log(mass(s, Rk) / Rk.dry);           // Tsiolkovsky
  const twr     = (s, cfg) => cfg.rocket.thrust / (mass(s, cfg.rocket) * cfg.planet.g0);

  // ---------------- orbital elements (2D Kepler) ----------------

  function orbit(s, P) {
    const mu = P.mu, r = radius(s), v2 = s.vx ** 2 + s.vy ** 2;
    const h = angMom(s), E = 0.5 * v2 - mu / r;
    const rv = s.x * s.vx + s.y * s.vy;

    const ex = ((v2 - mu / r) * s.x - rv * s.vx) / mu;       // eccentricity vector
    const ey = ((v2 - mu / r) * s.y - rv * s.vy) / mu;
    const e = Math.hypot(ex, ey);
    const p = h * h / mu;                                    // semi-latus rectum
    const a = E < 0 ? -mu / (2 * E) : Infinity;
    const omega = Math.atan2(ey, ex);                        // periapsis direction
    const rp = E < 0 ? a * (1 - e) : p / (1 + e);           // a-form survives radial (h = 0) paths
    const ra = E < 0 ? a * (1 + e) : Infinity;
    const T = E < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity;
    const dir = h >= 0 ? 1 : -1;                             // +1 CCW, -1 CW

    // true anomaly of the rocket, measured in direction of motion
    let nu = Math.atan2(s.y, s.x) - omega;
    nu = dir * nu;
    nu = Math.atan2(Math.sin(nu), Math.cos(nu));

    // time to periapsis / apoapsis (ellipse only)
    let tPe = NaN, tAp = NaN;
    if (e < 1 && e > 1e-6) {
      const Ean = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
      const M = Ean - e * Math.sin(Ean);
      const n = 2 * Math.PI / T;
      const mod = (t) => ((t % T) + T) % T;
      tPe = mod((2 * Math.PI - M) / n);
      tAp = mod((Math.PI - M) / n);
    }

    return { e, a, p, rp, ra, T, omega, dir, nu, E, h, tPe, tAp,
             pe: rp - P.R, ap: ra - P.R };
  }

  // r(theta) along the conic, theta = world angle.  NaN where the conic doesn't exist.
  function conicRadius(o, theta) {
    const nu = o.dir * (theta - o.omega);
    const den = 1 + o.e * Math.cos(nu);
    return den > 1e-9 ? o.p / den : NaN;
  }

  // ---------------- exports ----------------

  return { newState, mass, radius, altitude, speed, density, accel, step,
           energy, angMom, deltaV, twr, orbit, conicRadius };
})();

if (typeof module !== 'undefined') module.exports = Physics;
