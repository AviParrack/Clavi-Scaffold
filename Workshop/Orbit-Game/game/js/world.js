// ======================================================================
//  WORLD  —  bodies on Keplerian rails, rubble rocks, gravity field
// ======================================================================

const World = (() => {

  // ---------------- seeded rng ----------------

  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // lumpy outline: radius factors at K angles from a few smooth harmonics
  function outline(rand, bump, K = 40) {
    const harm = [2, 3, 5, 7].map((k) => [k, rand() * 2 * Math.PI, (rand() * 0.6 + 0.4) / k ** 0.6]);
    const norm = harm.reduce((s, h) => s + h[2], 0);
    return Array.from({ length: K }, (_, i) => {
      const th = i / K * 2 * Math.PI;
      return 1 + bump * harm.reduce((s, [k, ph, w]) => s + w * Math.sin(k * th + ph), 0) / norm;
    });
  }

  // ---------------- build ----------------

  function create(cfg, seed = 7) {
    const rand = rng(seed);
    const bodies = cfg.bodies.map((b) => ({ ...b, mu: b.g * b.R * b.R }));
    const byId = Object.fromEntries(bodies.map((b) => [b.id, b]));

    bodies.forEach((b, i) => { b.idx = i; });
    for (const b of bodies) {
      b.par = b.parent ? byId[b.parent] : null;            // parents are listed before children
      b.n = b.par ? Math.sqrt(b.par.mu / b.a ** 3) : 0;   // angular rate on the rail
      b.hill = b.par ? b.a * Math.cbrt(b.mu / (3 * b.par.mu)) : Infinity;
      b.out = outline(rand, b.shape, Math.max(40, Math.round(b.R * 1.2)));
      b.Rc = b.R * Math.min(...b.out);                      // deepest valley: below it the pull falls off like a uniform core
      b.craters = Array.from({ length: Math.round(4 + b.R / 25) }, () =>
        ({ th: rand() * 2 * Math.PI, d: rand() * 0.75, r: (0.06 + rand() * 0.12) }));
    }

    bodies.forEach((b) => { b.wseed = seed; });            // terrain grids are built lazily from this

    const rocks = [];
    for (const spec of (cfg.rubble || []).filter((sp) => byId[sp.around])) {
      const host = byId[spec.around];
      for (let i = 0; i < spec.count; i++) {
        const a = spec.rMin + (spec.rMax - spec.rMin) * rand();
        const size = spec.sizeMin + (spec.sizeMax - spec.sizeMin) * rand() ** 2;
        rocks.push({ host, a, phase: rand() * 2 * Math.PI, n: Math.sqrt(host.mu / a ** 3), r: size,
                     out: outline(rand, 0.35, 12), spin: (rand() - 0.5) * 1.5, tone: rand() });
      }
    }
    return { bodies, byId, rocks, seed, _t: NaN, _st: null };
  }

  // ---------------- body states at time t (cached per t) ----------------
  //  returns array of [x, y, vx, vy, ax, ay] in body order (ax, ay = rail acceleration)

  function states(w, t) {
    if (t === w._t) return w._st;
    const st = [];
    w.bodies.forEach((b) => {
      if (!b.par) { st.push([0, 0, 0, 0, 0, 0]); return; }
      const p = st[b.par.idx], th = b.n * t + b.phase, c = Math.cos(th), s = Math.sin(th), n2 = b.n * b.n;
      st.push([p[0] + b.a * c, p[1] + b.a * s, p[2] - b.a * b.n * s, p[3] + b.a * b.n * c, p[4] - n2 * b.a * c, p[5] - n2 * b.a * s]);
    });
    w._t = t; w._st = st;
    return st;
  }

  const bodyState = (w, b, t) => states(w, t)[b.idx];

  function rockState(w, rk, t) {
    const h = bodyState(w, rk.host, t), th = rk.n * t + rk.phase, c = Math.cos(th), s = Math.sin(th);
    return [h[0] + rk.a * c, h[1] + rk.a * s, h[2] - rk.a * rk.n * s, h[3] + rk.a * rk.n * c];
  }

  // ---------------- gravity on a test mass ----------------
  //  Pull of every body, plus a frame correction for the local reference body B
  //  (smallest Hill sphere containing the point): B rides a Kepler rail and so ignores
  //  the other bodies' pull, so we add B's rail acceleration minus the pull B would really feel.
  //  Motion relative to B then feels only true tides (and Ceres gets the usual indirect term).

  function gravity(w, x, y, t) {
    const st = states(w, t), bs = w.bodies;
    let ax = 0, ay = 0, ref = 0, refHill = Infinity;
    for (let i = 0; i < bs.length; i++) {
      const dx = st[i][0] - x, dy = st[i][1] - y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
      const Rc = bs[i].Rc, k = r > Rc ? bs[i].mu / (r2 * r) : bs[i].mu / (Rc * Rc * Rc);   // inside: g ∝ r, no blow-up at the centre
      ax += k * dx; ay += k * dy;
      if (r < bs[i].hill && bs[i].hill < refHill) { ref = i; refHill = bs[i].hill; }
    }
    const B = st[ref];
    ax += B[4]; ay += B[5];
    for (let j = 0; j < bs.length; j++) {
      if (j === ref) continue;
      const dx = st[j][0] - B[0], dy = st[j][1] - B[1], r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
      const k = bs[j].mu / (r2 * r);
      ax -= k * dx; ay -= k * dy;
    }
    return [ax, ay];
  }

  // potential of body b at distance r (matches gravity: point mass outside Rc, uniform core inside)
  const phi = (b, r) => r > b.Rc ? -b.mu / r : -b.mu * (3 * b.Rc * b.Rc - r * r) / (2 * b.Rc ** 3);

  // outline radius of a body at polar angle th (local frame; bodies never rotate)
  function surfaceR(b, th) {
    const K = b.out.length, u = (((th / (2 * Math.PI)) % 1 + 1) % 1) * K, i = Math.floor(u), f = u - i;
    return b.R * (b.out[i % K] * (1 - f) + b.out[(i + 1) % K] * f);
  }

  // reference body = smallest Hill sphere that contains the point
  function refBody(w, x, y, t) {
    const st = states(w, t);
    let best = w.bodies[0];
    w.bodies.forEach((b, i) => {
      if (Math.hypot(x - st[i][0], y - st[i][1]) < b.hill && b.hill < best.hill) best = b;
    });
    return best;
  }

  return { create, states, bodyState, rockState, gravity, phi, refBody, surfaceR, rng };
})();

if (typeof module !== 'undefined') module.exports = World;
