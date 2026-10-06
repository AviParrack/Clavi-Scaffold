// ======================================================================
//  WORLD  —  the star Ember at the origin, bodies on Keplerian rails,
//  rubble rocks (circular rails or first-order epicycles), gravity field
// ======================================================================

const World = (() => {

  const SHELL = 0.1;              // the frame correction blends across the outer 10 % of a Hill sphere

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
    const bodies = cfg.bodies.map((b) => ({ ...b, mu: b.mu ?? b.g * b.R * b.R }));
    const byId = Object.fromEntries(bodies.map((b) => [b.id, b]));

    bodies.forEach((b, i) => { b.idx = i; if (b.g == null) b.g = b.mu / (b.R * b.R); });
    for (const b of bodies) {
      b.par = b.parent ? byId[b.parent] : null;            // parents are listed before children
      b.n = b.par ? Math.sqrt(b.par.mu / b.a ** 3) : 0;   // angular rate on the rail
      b.hill = b.par ? b.a * Math.cbrt(b.mu / (3 * b.par.mu)) : Infinity;
      b.vmax = b.par ? b.par.vmax + b.a * b.n : 0;           // fastest it ever moves (rails stack up their speeds)
      b.out = b.star ? Array(40).fill(1) : outline(rand, b.shape, Math.max(40, Math.round(b.R * 1.2)));   // stars draw no rng: Mochi & co keep their v3 shapes
      b.Rc = b.R * Math.min(...b.out);                      // deepest valley: below it the pull falls off like a uniform core
      b.killR = b.star ? b.R * ((cfg.sim && cfg.sim.starKill) || 3) : 0;   // stars: no ground, just a SIZZLE radius
      b.craters = b.star ? [] : Array.from({ length: Math.round(4 + b.R / 25) }, () =>
        ({ th: rand() * 2 * Math.PI, d: rand() * 0.75, r: (0.06 + rand() * 0.12) }));
    }
    const root = bodies.find((b) => !b.par);

    let tidx = 0;
    bodies.forEach((b) => { b.wseed = seed; b.tidx = b.star ? -1 : tidx++; });   // terrain grids are built lazily from these

    // -------- rubble: rings, sprinkles and swarms --------
    const rocks = [], swarms = [];
    const rock = (host, a, phase, size, e, mph, swarm) => ({
      id: rocks.length, host, a, phase, n: Math.sqrt(host.mu / a ** 3), r: size, e, mph, ae: a * e, swarm, gone: false,
      vmax: host.vmax + Math.sqrt(host.mu / a) * (1 + 5 * e),
      out: outline(rand, 0.35, 12), spin: (rand() - 0.5) * 1.5, tone: rand() });
    for (const spec of (cfg.rubble || []).filter((sp) => byId[sp.around])) {
      const host = byId[spec.around], sizeOf = () => spec.sizeMin + (spec.sizeMax - spec.sizeMin) * rand() ** 2;
      if (spec.swarm) {
        const sw = { id: swarms.length, name: spec.swarm, host, a: spec.a, lam: spec.lam, arc: spec.arc, ecc: spec.ecc,
                     n: Math.sqrt(host.mu / spec.a ** 3), rocks: [] };
        swarms.push(sw);
        for (let i = 0; i < spec.count; i++) {
          const ph = spec.lam + (2 * rand() - 1) * spec.arc / spec.a, e = spec.ecc * Math.sqrt(rand());
          const rk = rock(host, spec.a, ph, sizeOf(), e, rand() * 2 * Math.PI, sw.id);
          sw.rocks.push(rk); rocks.push(rk);
        }
        continue;
      }
      for (let i = 0; i < spec.count; i++) {
        const a = spec.rMin + (spec.rMax - spec.rMin) * rand(), size = sizeOf(), phase = rand() * 2 * Math.PI;
        const e = spec.ecc ? spec.ecc * rand() : 0, mph = spec.ecc ? rand() * 2 * Math.PI : 0;
        rocks.push(rock(host, a, phase, size, e, mph, -1));
      }
    }
    return { bodies, byId, root, rocks, swarms, seed, _t: NaN, _st: null };
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

  // ---------------- rocks ----------------
  //  first-order epicycle (Kepler to O(e)): r = a (1 - e cos M), theta = lambda + 2 e sin M, both advancing at n.
  //  e = 0 is a plain circular rail.  Returns [x, y, vx, vy] (velocity = the exact time derivative).

  function rockState(w, rk, t) {
    const h = bodyState(w, rk.host, t), th = rk.n * t + rk.phase;
    if (!rk.e) {
      const c = Math.cos(th), s = Math.sin(th);
      return [h[0] + rk.a * c, h[1] + rk.a * s, h[2] - rk.a * rk.n * s, h[3] + rk.a * rk.n * c];
    }
    const M = rk.n * t + rk.mph, cM = Math.cos(M), sM = Math.sin(M);
    const r = rk.a * (1 - rk.e * cM), q = th + 2 * rk.e * sM, c = Math.cos(q), s = Math.sin(q);
    const dr = rk.a * rk.e * rk.n * sM, dq = rk.n * (1 + 2 * rk.e * cM);
    return [h[0] + r * c, h[1] + r * s, h[2] + dr * c - r * dq * s, h[3] + dr * s + r * dq * c];
  }

  // where a swarm's centre is (a circular rail at its shared semi-major axis)
  function swarmState(w, sw, t) {
    const h = bodyState(w, sw.host, t), th = sw.n * t + sw.lam, c = Math.cos(th), s = Math.sin(th);
    return [h[0] + sw.a * c, h[1] + sw.a * s, h[2] - sw.a * sw.n * s, h[3] + sw.a * sw.n * c];
  }

  // ---------------- gravity on a test mass ----------------
  //  Pull of every body, plus a frame correction for the local reference body B
  //  (smallest Hill sphere containing the point): B rides a Kepler rail and so ignores
  //  the other bodies' pull, so we add B's rail acceleration minus the pull B would really feel.
  //  Motion relative to B then feels only true tides (and Mochi gets the usual indirect term).
  //  The root (Ember) is truly fixed: no correction there.  Across the outer SHELL of a Hill sphere
  //  the correction blends smoothly into the next frame out, so a crossing never jumps.

  function frameCorr(w, st, i, out, f) {
    const bs = w.bodies, B = st[i];
    if (!bs[i].par || f <= 0) return;
    let ax = B[4], ay = B[5];
    for (let j = 0; j < bs.length; j++) {
      if (j === i) continue;
      const dx = st[j][0] - B[0], dy = st[j][1] - B[1], r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
      const k = bs[j].mu / (r2 * r);
      ax -= k * dx; ay -= k * dy;
    }
    out[0] += f * ax; out[1] += f * ay;
  }

  function gravity(w, x, y, t) {
    const st = states(w, t), bs = w.bodies;
    let ax = 0, ay = 0, ref = -1, refHill = Infinity, refR = 0, out2 = -1, out2Hill = Infinity;
    for (let i = 0; i < bs.length; i++) {
      const dx = st[i][0] - x, dy = st[i][1] - y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
      const Rc = bs[i].Rc, k = r > Rc ? bs[i].mu / (r2 * r) : bs[i].mu / (Rc * Rc * Rc);   // inside: g ∝ r, no blow-up at the centre
      ax += k * dx; ay += k * dy;
      const H = bs[i].hill;
      if (r < H && H < refHill) { out2 = ref; out2Hill = refHill; ref = i; refHill = H; refR = r; }
      else if (r < H && H < out2Hill) { out2 = i; out2Hill = H; }
    }
    const a = [ax, ay];
    if (ref < 0) return a;
    const f = Math.min(1, (refHill - refR) / (SHELL * refHill));                 // 1 inside, 0 at the Hill edge
    const s = f * f * (3 - 2 * f);
    frameCorr(w, st, ref, a, s);
    if (s < 1 && out2 >= 0) frameCorr(w, st, out2, a, 1 - s);
    return a;
  }

  // potential of body b at distance r (matches gravity: point mass outside Rc, uniform core inside)
  const phi = (b, r) => r > b.Rc ? -b.mu / r : -b.mu * (3 * b.Rc * b.Rc - r * r) / (2 * b.Rc ** 3);

  // outline radius of a body at polar angle th (local frame; bodies never rotate)
  function surfaceR(b, th) {
    const K = b.out.length, u = (((th / (2 * Math.PI)) % 1 + 1) % 1) * K, i = Math.floor(u), f = u - i;
    return b.R * (b.out[i % K] * (1 - f) + b.out[(i + 1) % K] * f);
  }

  // reference body = smallest Hill sphere that contains the point (the star's is infinite)
  function refBody(w, x, y, t) {
    const st = states(w, t);
    let best = w.root;
    w.bodies.forEach((b, i) => {
      if (Math.hypot(x - st[i][0], y - st[i][1]) < b.hill && b.hill < best.hill) best = b;
    });
    return best;
  }

  return { create, states, bodyState, rockState, swarmState, gravity, phi, refBody, surfaceR, rng, SHELL };
})();

if (typeof module !== 'undefined') module.exports = World;
