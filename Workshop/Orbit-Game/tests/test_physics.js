// ======================================================================
//  PHYSICS TESTS  —  run:  node tests/test_physics.js
//  rails, Hill spheres and lanes, epicycle rocks, gravity frames, the
//  integrator (fixed and adaptive steps), the rock cull, the star.
// ======================================================================

const H = require('./harness');
H.load();

const S = CONFIG.ship, dt = CONFIG.sim.dt, SIM = CONFIG.sim;
const OFF = { main: 0, rot: 0, kill: false, fwd: 0, left: 0 };
let nPass = 0, nFail = 0;

function check(name, ok, info) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${info}`);
  ok ? nPass++ : nFail++;
}
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const cfgWith = (patch) => ({ ...CONFIG, ...patch });
const MOCHI = CONFIG.bodies.find((b) => b.id === 'mochi');
const loneMochi = (patch = {}) => cfgWith({ bodies: [{ ...MOCHI, parent: null, a: 0, ...patch }], rubble: [] });

const w = World.create(CONFIG, 7);
const mochi = w.byId.mochi, kiwi = w.byId.kiwi, dorito = w.byId.dorito, ember = w.byId.ember, pretzel = w.byId.pretzel;
const helio = w.bodies.filter((b) => b.par === ember);


// ---------------- 0. world sanity ----------------
{
  for (const b of w.bodies) console.log(`INFO  ${b.name.padEnd(10)} R ${String(b.R).padStart(4)}  mu ${b.mu.toExponential(2)}  hill ${isFinite(b.hill) ? b.hill.toFixed(0).padStart(5) : '    ∞'}  ` +
    (b.par ? `a ${b.a} round ${b.par.name}, rail period ${(2 * Math.PI / b.n).toFixed(0)} s, speed ${(b.a * b.n).toFixed(1)} m/s` : 'fixed: the root'));
  const [x, y, vx, vy] = World.bodyState(w, kiwi, 37), [mx, my, mvx, mvy] = World.bodyState(w, mochi, 37);
  const r = Math.hypot(x - mx, y - my), v = Math.hypot(vx - mvx, vy - mvy);
  check('Kiwi rail speed (round Mochi) is circular-Kepler', relErr(v, Math.sqrt(mochi.mu / r)) < 1e-9, `${v.toFixed(3)} m/s at r ${r.toFixed(1)}`);
  check('every rail fits inside its parent Hill sphere', w.bodies.every((b) => !b.par || b.a < b.par.hill), '');
  check('Ember is the root and a star (flagged, no terrain)', w.root === ember && ember.star && Terrain.of(ember).N === 0 && ember.killR === SIM.starKill * ember.R,
        `kill radius ${ember.killR} m`);
  const vb = Math.sqrt(ember.mu / mochi.a), Tb = 2 * Math.PI * mochi.a / vb;
  check('Mochi rides the belt at ~29 m/s, period ~6,500 s, Hill ~4,000 m', Math.abs(vb - 29) < 0.5 && Math.abs(Tb - 6500) < 100 && Math.abs(mochi.hill - 4000) < 50,
        `${vb.toFixed(2)} m/s, ${Tb.toFixed(0)} s, Hill ${mochi.hill.toFixed(0)} m`);
}


// ---------------- 0b. lanes: nothing ever sails through Mochi's moon system ----------------
{
  const lanes = [...new Set(helio.map((b) => b.a))].sort((p, q) => p - q);
  console.log(`INFO  lanes at ${lanes.map((a) => (a / 1000).toFixed(1) + ' km').join(', ')}: ${lanes.map((a) => helio.filter((b) => b.a === a).map((b) => b.name).join(' ')).join(' | ')}`);
  let worst = Infinity, who = '';
  for (const b of helio) {
    if (b === mochi || b.a === mochi.a) continue;
    const m = Math.abs(b.a - mochi.a) - mochi.hill - b.hill;
    if (m < worst) { worst = m; who = b.name; }
  }
  check('other lanes: |Δa| > Hill(Mochi) + Hill(body) + 100 m', worst > 100, `tightest ${who}, margin ${worst.toFixed(0)} m`);
  let sameWorst = Infinity, pair = '';
  for (const p of helio) for (const q of helio) {
    if (p.idx >= q.idx) continue;
    const gap = p.a === q.a ? 2 * p.a * Math.abs(Math.sin((p.phase - q.phase) / 2)) - p.hill - q.hill : Math.abs(p.a - q.a) - p.hill - q.hill;
    if (gap < sameWorst) { sameWorst = gap; pair = `${p.name} / ${q.name}`; }
  }
  check('every pair stays further apart than the sum of their Hill radii', sameWorst > 300, `tightest ${pair}, margin ${sameWorst.toFixed(0)} m`);
  let dMin = Infinity, dWho = '';                                    // sampled: closest any body ever gets to Mochi
  for (const b of helio) {
    if (b === mochi) continue;
    const syn = b.n === mochi.n ? 1 : 2 * Math.PI / Math.abs(b.n - mochi.n);
    for (let k = 0; k <= 2000; k++) {
      const t = syn * k / 2000, [x, y] = World.bodyState(w, b, t), [mx, my] = World.bodyState(w, mochi, t), d = Math.hypot(x - mx, y - my) - b.hill;
      if (d < dMin) { dMin = d; dWho = b.name; }
    }
  }
  check('no body (or its Hill sphere) ever enters Mochi\'s Hill sphere', dMin > mochi.hill, `closest: ${dWho}'s Hill edge ${dMin.toFixed(0)} m from Mochi (Hill ${mochi.hill.toFixed(0)})`);
  const ring = Math.max(...CONFIG.rubble.filter((s) => s.around === 'mochi').map((s) => s.rMax));
  let rk1 = Infinity, rk2 = Infinity, rkWho = '';
  for (const rk of w.rocks) {
    if (rk.host !== ember) continue;
    for (const b of helio) {
      const m = Math.abs(rk.a - b.a) - rk.ae - rk.r - (b === mochi ? ring : b.hill);
      if (b === mochi) rk1 = Math.min(rk1, m); else if (m < rk2) { rk2 = m; rkWho = b.name; }
    }
  }
  check('belt rubble stays clear of Mochi\'s rings and moons (+300 m)', rk1 > 300, `margin ${rk1.toFixed(0)} m past the ${ring} m outer ring`);
  check('belt rubble never enters a small body\'s Hill sphere', rk2 > 100, `tightest ${rkWho}, margin ${rk2.toFixed(0)} m`);
  const n = w.rocks.filter((rk) => rk.host === ember).length;
  check('the belt: 6-8 swarms, 600-800 belt rocks, every rock has an id', w.swarms.length >= 6 && w.swarms.length <= 8 && n >= 600 && n <= 800 && w.rocks.every((rk, i) => rk.id === i && rk.gone === false),
        `${w.swarms.length} swarms, ${n} belt rocks, ${w.rocks.length} in all, biggest ${Math.max(...w.rocks.map((rk) => rk.r)).toFixed(1)} m`);
}


// ---------------- 0c. epicycle rails: Kepler to first order, coherent swarms ----------------
{
  // exact Kepler orbit (a, e, mean anomaly M, periapsis angle) vs the epicycle state
  const kepler = (a, e, M, peri, mu) => {
    let E = M; for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const r = a * (1 - e * Math.cos(E)), f = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    return [r * Math.cos(f + peri), r * Math.sin(f + peri)];
  };
  let worst = 0, worstV = 0, bound = 0;
  for (const rk of w.rocks.filter((q) => q.e > 0).slice(0, 200)) {
    for (const t of [0, 1234.5, 9999]) {
      const [x, y, vx, vy] = World.rockState(w, rk, t), M = rk.n * t + rk.mph, peri = rk.phase - rk.mph;
      const [kx, ky] = kepler(rk.a, rk.e, M, peri, rk.host.mu);
      worst = Math.max(worst, Math.hypot(x - kx, y - ky) / (rk.a * rk.e * rk.e)); bound = Math.max(bound, rk.a * rk.e * rk.e);
      const h = 0.01, p1 = World.rockState(w, rk, t + h), p0 = World.rockState(w, rk, t - h);
      worstV = Math.max(worstV, Math.hypot((p1[0] - p0[0]) / (2 * h) - vx, (p1[1] - p0[1]) / (2 * h) - vy));
    }
  }
  check('epicycle rock = Kepler orbit to O(e²)', worst < 3, `max miss ${worst.toFixed(2)} a e² (largest a e² ${bound.toFixed(2)} m)`);
  check('rock velocity is the derivative of its position', worstV < 1e-5, `max mismatch ${worstV.toExponential(1)} m/s`);
  const Tb = 2 * Math.PI / mochi.n;
  let back = 0, breathe = 0, spread0 = 0, spreadMax = 0;
  for (const sw of w.swarms) {
    const extent = (t) => { const [cx, cy] = World.swarmState(w, sw, t); return Math.max(...sw.rocks.map((rk) => { const p = World.rockState(w, rk, t); return Math.hypot(p[0] - cx, p[1] - cy); })); };
    const Tsw = 2 * Math.PI / sw.n, e0 = extent(0);
    let eMax = e0;
    for (let k = 1; k <= 200; k++) eMax = Math.max(eMax, extent(10 * Tsw * k / 200));
    back = Math.max(back, Math.abs(extent(10 * Tsw) - e0));                 // same shape again after 10 of its own laps
    breathe = Math.max(breathe, (eMax - e0) / (3 * sw.a * sw.ecc));         // in between it only breathes by its epicycles
    spread0 = Math.max(spread0, e0); spreadMax = Math.max(spreadMax, eMax);
    console.log(`      ${sw.name.padEnd(18)} a ${sw.a} m, ${sw.rocks.length} rocks, ${e0.toFixed(0)} m across at t=0, at most ${eMax.toFixed(0)} m over 10 laps (epicycles up to ${(sw.a * sw.ecc).toFixed(0)} m)`);
  }
  check('swarms come back to the same shape after 10 laps (no shear)', back < 0.01, `max change ${back.toExponential(1)} m`);
  check('in between they only breathe by their epicycles (< 3 a e)', breathe < 1, `widest ${spread0.toFixed(0)} m, never wider than ${spreadMax.toFixed(0)} m in 10 laps (~${(10 * Tb / 3600).toFixed(0)} h)`);
}


// ---------------- 0d. gravity frames: the root is fixed, Hill-sphere edges are smooth ----------------
{
  const t = 321, [mx, my] = World.bodyState(w, mochi, t);
  const raw = (x, y) => { const st = World.states(w, t); let ax = 0, ay = 0; for (const b of w.bodies) { const dx = st[b.idx][0] - x, dy = st[b.idx][1] - y, r = Math.hypot(dx, dy); ax += b.mu * dx / r ** 3; ay += b.mu * dy / r ** 3; } return [ax, ay]; };
  const ux = mx / Math.hypot(mx, my), uy = my / Math.hypot(mx, my);
  const P = [mx + ux * 6000, my + uy * 6000], gA = World.gravity(w, P[0], P[1], t), gB = raw(P[0], P[1]);
  check('out in the belt (reference = Ember): plain sum of pulls, no frame term', Math.hypot(gA[0] - gB[0], gA[1] - gB[1]) < 1e-15, `|diff| ${Math.hypot(gA[0] - gB[0], gA[1] - gB[1]).toExponential(1)} m/s²`);
  const jump = (b, dir) => {                                         // largest change of the frame term (g minus the raw pulls) per 0.5 m across the Hill edge
    const [bx, by] = World.bodyState(w, b, t); let worst = 0, prev = null;
    for (let r = b.hill * 0.85; r < b.hill * 1.05; r += 0.5) {
      const x = bx + dir[0] * r, y = by + dir[1] * r, gg = World.gravity(w, x, y, t), g0 = raw(x, y), c = [gg[0] - g0[0], gg[1] - g0[1]];
      if (prev) worst = Math.max(worst, Math.hypot(c[0] - prev[0], c[1] - prev[1]));
      prev = c;
    }
    const [x0, y0] = [bx + dir[0] * b.hill * 0.85, by + dir[1] * b.hill * 0.85], [x1, y1] = [bx + dir[0] * b.hill * 1.05, by + dir[1] * b.hill * 1.05];
    const g0 = World.gravity(w, x0, y0, t), r0 = raw(x0, y0), g1 = World.gravity(w, x1, y1, t), r1 = raw(x1, y1);
    return [worst, Math.hypot(g0[0] - r0[0] - g1[0] + r1[0], g0[1] - r0[1] - g1[1] + r1[1])];   // [blended step, what an unblended switch would jump]
  };
  const [jM, cM] = jump(mochi, [ux, uy]), [jK, cK] = jump(kiwi, [0, 1]);
  check('crossing Mochi\'s Hill edge: the frame term blends smoothly', jM < 0.05 * cM, `max step ${jM.toExponential(1)} m/s² per 0.5 m (an unblended switch jumps ${cM.toExponential(1)})`);
  check('crossing Kiwi\'s Hill edge: smooth too', jK < 0.05 * cK, `max step ${jK.toExponential(1)} m/s² per 0.5 m (unblended jump ${cK.toExponential(1)})`);
}


// ---------------- 1. lone Mochi: circular orbit, conservation ----------------
{
  const w1 = World.create(loneMochi(), 7), c = w1.bodies[0];
  const r0 = 360, sh = Physics.newShip(S);
  Object.assign(sh, { x: r0, y: 0, vx: 0, vy: Math.sqrt(c.mu / r0) });
  const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / c.mu);
  const E0 = Physics.orbitRel(sh, c, 0, w1).E;
  let rMin = r0, rMax = r0, t = 0;
  for (; t < 10 * T; t += dt) { Physics.step(sh, OFF, t, dt, w1, S); const r = Math.hypot(sh.x, sh.y); rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); }
  const E1 = Physics.orbitRel(sh, c, t, w1).E;
  check('circular orbit holds radius (10 laps)', (rMax - rMin) / r0 < 1e-3, `r in [${rMin.toFixed(2)}, ${rMax.toFixed(2)}], period ${T.toFixed(1)} s`);
  check('energy conserved', relErr(E1, E0) < 1e-6, `rel err ${relErr(E1, E0).toExponential(2)}`);
}


// ---------------- 2. rocket equation (no gravity) ----------------
{
  const w0 = World.create(loneMochi({ g: 0 }), 7);
  const sh = Physics.newShip(S); Object.assign(sh, { x: 1e6, ang: 0 });
  const dv = Physics.deltaV(sh, S);
  let t = 0;
  while (sh.fuel > 0) { Physics.step(sh, { ...OFF, main: 1 }, t, dt, w0, S); t += dt; }
  check('Tsiolkovsky delta-v', relErr(sh.vx, dv) < 1e-3, `${sh.vx.toFixed(2)} vs ve ln(m0/m1) = ${dv.toFixed(2)} m/s, burn ${t.toFixed(1)} s`);
}


// ---------------- 3. RCS rotation: spin up, then kill spin ----------------
{
  const w0 = World.create(loneMochi({ g: 0 }), 7);
  const sh = Physics.newShip(S); sh.x = 1e6;
  let t = 0;
  for (; t < 0.5 - 1e-9; t += dt) Physics.step(sh, { ...OFF, rot: 1 }, t, dt, w0, S);
  const w1 = sh.omega;
  check('torque spins ship up at rotAccel', relErr(w1, 0.5 * S.rotAccel) < 1e-2, `omega ${w1.toFixed(3)} rad/s after 0.5 s (expect ${(0.5 * S.rotAccel).toFixed(3)})`);
  let tk = 0;
  while (Math.abs(sh.omega) > 1e-6 && tk < 5) { Physics.step(sh, { ...OFF, kill: true }, t, dt, w0, S); tk += dt; }
  check('kill-rotation stops the spin', Math.abs(sh.omega) < 1e-6 && Math.abs(tk - 0.5) < 0.02, `stopped in ${tk.toFixed(3)} s`);
  check('spin stays when nothing fires', (() => { sh.omega = 0.3; Physics.step(sh, OFF, t, dt, w0, S); return sh.omega === 0.3; })(), 'omega unchanged');
  check('RCS propellant used', S.rcs - sh.rcs > 0.9 && S.rcs - sh.rcs < 1.1, `used ${(S.rcs - sh.rcs).toFixed(3)} units for ~1 s of torque`);
}


// ---------------- 4. trajectory preview matches the real sim ----------------
{
  const sh = Physics.newShip(S), r0 = 400, [mx, my, mvx, mvy] = World.bodyState(w, mochi, 0);
  Object.assign(sh, { x: mx, y: my + r0, vx: mvx - 1.1 * Math.sqrt(mochi.mu / r0), vy: mvy });
  const Hh = 120, pred = Physics.predict(sh, 0, w, Hh, SIM.predictSteps);
  let t = 0;
  while (t < Hh - 1e-9) { Physics.step(sh, OFF, t, dt, w, S); t += dt; }
  const last = pred.pts[pred.pts.length - 1];
  const err = Math.hypot(last[0] - sh.x, last[1] - sh.y);
  check('preview lands where the ship goes (120 s, round Mochi)', err < 1.0, `miss ${err.toFixed(3)} m after ${Hh} s`);
  const sb = Physics.newShip(S), [px, py, pvx, pvy] = World.bodyState(w, pretzel, 0);  // out in the belt, drifting past Pretzel
  Object.assign(sb, { x: px - 3000, y: py + 200, vx: pvx + 3, vy: pvy });
  const pb = Physics.predict(sb, 0, w, SIM.predictBelt, SIM.predictBeltSteps);
  t = 0; while (t < SIM.predictBelt - 1e-9) { Physics.step(sb, OFF, t, dt, w, S); t += dt; }
  const lb = pb.pts[pb.pts.length - 1], eb = Math.hypot(lb[0] - sb.x, lb[1] - sb.y);
  check(`belt preview (${SIM.predictBelt} s horizon) matches the sim`, eb < 5, `miss ${eb.toFixed(2)} m after ${SIM.predictBelt} s (travelled ${(Math.hypot(sb.x - px, sb.y - py) / 1000).toFixed(1)} km from Pretzel's start)`);
  // impacts are tested along each segment: 4 s steps at 50 m/s (200 m apart) still find 48 m Truffle, at the right time
  const tr = w.byId.truffle, D = 1500, v = 50, [tx, ty] = World.bodyState(w, tr, 0), [fx, fy] = World.bodyState(w, tr, D / v);
  const st = Physics.newShip(S), u = [tx / Math.hypot(tx, ty), ty / Math.hypot(tx, ty)];
  Object.assign(st, { x: tx + u[0] * D, y: ty + u[1] * D }); Object.assign(st, { vx: (fx - st.x) / (D / v), vy: (fy - st.y) / (D / v) });
  const coarse = Physics.predict(st, 0, w, 60, 15, 3.2), fine = Physics.predict(st, 0, w, 60, 6000, 3.2);
  const endsOnly = coarse.pts.some(([x, y, t]) => { const [bx, by] = World.bodyState(w, tr, t); return Math.hypot(x - bx, y - by) < tr.R * (1 + tr.shape) + 3.2; });
  check('a 4 s preview step cannot skip a small asteroid (segment test)', coarse.impact && coarse.impact.body === tr && Math.abs(coarse.impact.t - fine.impact.t) < 0.5,
        `${coarse.impact ? `impact ${coarse.impact.t.toFixed(2)} s` : 'none'} vs ${fine.impact ? fine.impact.t.toFixed(2) : 'none'} s with 0.01 s steps (end points alone ${endsOnly ? 'would see it' : 'miss it'})`);
}


// ---------------- 5. low orbits around small asteroids survive tides ----------------
//  (they wobble, which is the point: you trim them now and then)
for (const [b, r0] of [[kiwi, 85], [dorito, 52], [pretzel, 75]]) {
  const sh = Physics.newShip(S);
  const [kx, ky, kvx, kvy] = World.bodyState(w, b, 0), [hx, hy] = World.bodyState(w, b.par, 0);
  const vc = Math.sqrt(b.mu / r0), d = Math.hypot(kx - hx, ky - hy), dir = [(kx - hx) / d, (ky - hy) / d];
  Object.assign(sh, { x: kx + dir[0] * r0, y: ky + dir[1] * r0, vx: kvx - dir[1] * vc, vy: kvy + dir[0] * vc });
  const T = 2 * Math.PI * r0 / vc;
  let rMin = Infinity, rMax = 0, t = 0;
  for (; t < 3 * T; t += dt) {
    Physics.step(sh, OFF, t, dt, w, S);
    const [bx, by] = World.bodyState(w, b, t + dt), r = Math.hypot(sh.x - bx, sh.y - by);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  check(`${b.name} orbit at ${r0} m stays bound (3 laps)`, rMin > b.R + 5 && rMax < 0.7 * b.hill,
        `r in [${rMin.toFixed(1)}, ${rMax.toFixed(1)}], period ${T.toFixed(0)} s, Hill ${b.hill.toFixed(0)}`);
}


// ---------------- 6. scripted launch from the Mochi pad to orbit ----------------
{
  const sh = Physics.newShip(S), [mx0, my0, mvx0, mvy0] = World.bodyState(w, mochi, 0);
  Object.assign(sh, { x: mx0, y: my0 + mochi.R + 0.01, vx: mvx0, vy: mvy0 });
  let t = 0, phase = 'up';
  const log = [];
  while (t < 400 && phase !== 'done') {
    const o = Physics.orbitRel(sh, mochi, t, w), up = Math.atan2(o.y, o.x);
    let main = 0;
    if (phase === 'up') {
      const f = Math.min(1, o.alt / 40);
      sh.ang = up - f * Math.PI / 2 * 0.92; main = 1;
      if (o.ap > 80) { phase = 'coast'; log.push(`cutoff t=${t.toFixed(1)} alt=${o.alt.toFixed(0)}`); }
    } else if (phase === 'coast') {
      if (o.vr <= 0) phase = 'circ';
    } else {
      sh.ang = Math.atan2(o.vy, o.vx); main = o.pe < 60 ? 1 : 0.15;
      if (o.pe > 70) { phase = 'done'; log.push(`orbit t=${t.toFixed(1)} Ap=${o.ap.toFixed(0)} Pe=${o.pe.toFixed(0)}`); }
    }
    Physics.step(sh, { ...OFF, main }, t, dt, w, S); t += dt;
  }
  log.forEach((l) => console.log('      ' + l));
  const o = Physics.orbitRel(sh, mochi, t, w), dvLeft = Physics.deltaV(sh, S), dv0 = Physics.deltaV(Physics.newShip(S), S);
  check('scripted launch reaches Mochi orbit', phase === 'done' && o.pe > 50, `Pe ${o.pe.toFixed(0)} m, Ap ${o.ap.toFixed(0)} m, t ${t.toFixed(0)} s`);
  check('launch costs a small part of the tank', dvLeft > 0.8 * dv0, `delta-v left ${dvLeft.toFixed(0)} of ${dv0.toFixed(0)} m/s`);
}


// ---------------- 7. feel numbers: the stock tank holds 3x the delta-v, same Isp, same lift ----------------
{
  const sh = Physics.newShip(S), m = Physics.mass(sh, S), dv = Physics.deltaV(sh, S);
  const vLow = Math.sqrt(mochi.mu / (mochi.R + 60)), isp = S.ve * CONFIG.ISP_SCALE / 9.81, twr = S.thrust / m / mochi.g;
  console.log(`INFO  main accel ${(S.thrust / m).toFixed(2)} m/s^2 (fine ${(S.fine * S.thrust / m).toFixed(2)}), TWR on Mochi ${twr.toFixed(2)}, ` +
              `RCS translate ${S.transAccel} m/s^2, v_orbit(60 m) ${vLow.toFixed(1)} m/s, delta-v ${dv.toFixed(0)} m/s, Isp ${isp.toFixed(0)} s, ` +
              `full-thrust burn ${(sh.fuel / (S.thrust / S.ve)).toFixed(0)} s`);
  check('stock delta-v tripled: ~393 m/s (was 131)', Math.abs(dv - 3 * 131.3) < 3, `${dv.toFixed(1)} m/s`);
  check('displayed Isp unchanged (methalox 367 s)', Math.round(isp) === 367, `ve ${S.ve} x ${CONFIG.ISP_SCALE} / 9.81 = ${isp.toFixed(1)} s`);
  check('TWR on Mochi unchanged (1.46): same thrust, same mass', Math.abs(twr - 1.46) < 0.01, `${twr.toFixed(3)}`);
  check('can lift off Mochi', twr > 1.2, '');
  check('fine throttle is gentle (< 0.5 m/s^2)', S.fine * S.thrust / m < 0.5, '');
}


// ---------------- 8. adaptive steps at big warps: energy holds for many orbits ----------------
//  same start, same sim time: fixed 1/240 s steps vs the game at 1024x (steps up to SIM.dtMax)
function orbitRun(spawn, body, laps, warp, tEnd) {
  const g = Game.create(7, spawn, { fresh: true }), b = g.w.byId[body];
  g.everFlew = true; g.navId = null;
  const o0 = Physics.orbitRel(g.sh, b, g.t, g.w), T = tEnd || o0.T * laps;     // the reference stops exactly where the warp run did
  let steps = 0, frames = 0, hMax = 0, rMin = Infinity, rMax = 0;
  const t0 = g.t, ms0 = Date.now();
  if (warp) {
    Game.setWarp(g, warp);
    while (g.t - t0 < T && g.status === 'flying') {
      Game.update(g, H.input(), 1 / 60); steps += g.stepsLastFrame; frames++; hMax = Math.max(hMax, g.stepDt);
      const o = Physics.orbitRel(g.sh, b, g.t, g.w); rMin = Math.min(rMin, o.r); rMax = Math.max(rMax, o.r);
    }
  } else {                                                            // reference: plain 1/240 s steps, no game loop around them
    for (; g.t - t0 < T; steps++) { Physics.step(g.sh, OFF, g.t, dt, g.w, g.S); g.t += dt; }
    hMax = dt;
  }
  const o1 = Physics.orbitRel(g.sh, b, g.t, g.w);
  return { g, o0, o1, steps, frames, hMax, rMin, rMax, ms: Date.now() - ms0, T, dE: (o1.E - o0.E) / Math.abs(o0.E), da: (o1.a - o0.a) / o0.a };
}
for (const [spawn, body, laps] of [['orbit', 'mochi', 30], ['pretzel', 'pretzel', 30]]) {
  const big = orbitRun(spawn, body, laps, 1024), ref = orbitRun(spawn, body, laps, 0, big.g.t);
  const name = big.g.w.byId[body].name;
  console.log(`INFO  ${name} ${laps} laps (${big.T.toFixed(0)} s): 1024x took ${big.frames} frames, ${big.steps} steps (max step ${big.hMax.toFixed(3)} s, ${big.ms} ms); ` +
              `plain 1/240 s took ${ref.steps} steps (${ref.ms} ms)`);
  //  (energy round a moving, tugged body is not exactly conserved: Ember's tide and the moons do real work, so we
  //   compare against the same flight in tiny steps, which feels the same tides)
  check(`${name} orbit at 1024x: energy tracks 1/240 s steps over ${laps} laps`, Math.abs(big.dE - ref.dE) < 1e-3 && big.g.status === 'flying',
        `dE/E ${big.dE.toExponential(2)} vs ${ref.dE.toExponential(2)} with 1/240 s steps, da/a ${big.da.toExponential(2)}, r in [${big.rMin.toFixed(1)}, ${big.rMax.toFixed(1)}]`);
  check(`${name} at 1024x really took long steps`, big.hMax > 0.05 && big.steps < ref.steps / 10, `${(ref.steps / big.steps).toFixed(0)}x fewer steps`);
}


// ---------------- 9. the rock cull == brute force (every rock, every step) ----------------
{
  const seeded = (k) => { const r = World.rng(k); Math.random = r; };
  const rnd0 = Math.random, out = [];
  let same = 0, hits = 0, cand = 0, all = 0;
  for (let trial = 0; trial < 12; trial++) {
    const runOnce = (cull) => {
      Game.cullRocks = cull; seeded(1000 + trial);
      const g = Game.create(7, trial % 3 ? 'swarm' : 'belt', { fresh: true }), R = World.rng(77 + trial);
      g.everFlew = true;
      const a = R() * 2 * Math.PI, v = 1 + R() * 8;                          // drift through the rocks in a random direction
      g.sh.vx += v * Math.cos(a); g.sh.vy += v * Math.sin(a);
      Game.setWarp(g, [1, 4, 64, 1024][trial % 4]);
      let n = 0, c = 0;
      const h0 = g.sh.hull;
      for (let f = 0; f < 400 && g.status === 'flying'; f++) { Game.update(g, H.input(), 1 / 60); n++; c += g.rockCand ? g.rockCand.length : 0; }
      return { x: g.sh.x, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy, hull: g.sh.hull, t: g.t, dents: h0 - g.sh.hull, c: c / n, status: g.status };
    };
    const A = runOnce(true), B = runOnce(false);
    const ok = ['x', 'y', 'vx', 'vy', 'hull', 't'].every((k) => A[k] === B[k]) && A.status === B.status;
    same += ok ? 1 : 0; hits += A.dents > 0 ? 1 : 0; cand += A.c; all += B.c;
    if (!ok) out.push(`trial ${trial}: ${JSON.stringify(A)} vs ${JSON.stringify(B)}`);
  }
  Game.cullRocks = true; Math.random = rnd0;
  out.forEach((l) => console.log('      ' + l));
  check('rock cull gives bit-identical flights to brute force', same === 12, `${same}/12 identical, ${hits} with rock hits, ~${(cand / 12).toFixed(0)} of ${(all / 12).toFixed(0)} rocks checked per step`);
}


// ---------------- 10. the star: SIZZLE ----------------
{
  const g = Game.create(7, 'orbit', { fresh: true }), e = g.w.byId.ember;
  Object.assign(g.sh, { x: 5 * e.R, y: 0, vx: -20, vy: 0, omega: 0 }); g.everFlew = true; g.navId = null;
  Game.refresh(g);
  check('path into Ember is flagged as an impact', g.pred && g.pred.impact && g.pred.impact.body === e, g.pred && g.pred.impact ? `in ${(g.pred.impact.t - g.t).toFixed(0)} s` : 'none');
  check('...with a star warning hint', /star|Ember/.test(Game.hint(g)), Game.hint(g));
  for (let i = 0; i < 20 * 120 && g.status !== 'dead'; i++) Game.update(g, H.input(), 1 / 20);
  check('flying into Ember: SIZZLE, dead', g.status === 'dead' && /SIZZLE/.test(g.crashMsg), `${g.status}: ${g.crashMsg}, ${(Math.hypot(g.sh.x, g.sh.y) / e.R).toFixed(2)} radii out`);
}


// ---------------- 11. frame time (Node, no rendering): 1x, 64x, 1024x near Mochi and out in the belt ----------------
{
  const rows = [];
  for (const spawn of ['orbit', 'open belt', 'swarm']) for (const warp of [1, 64, 1024]) {
    const g = Game.create(7, spawn === 'open belt' ? 'pretzel' : spawn, { fresh: true }); g.everFlew = true; g.navId = null;
    if (spawn === 'open belt') {                                    // circling Ember in the empty gap between the inner swarms and the Mochi lane
      const r = 28500, th = 1.0, v = Math.sqrt(g.w.byId.ember.mu / r);
      Object.assign(g.sh, { x: r * Math.cos(th), y: r * Math.sin(th), vx: -v * Math.sin(th), vy: v * Math.cos(th) });
    }
    Game.setWarp(g, warp);
    for (let i = 0; i < 20; i++) Game.update(g, H.input(), 1 / 60);
    const t0 = process.hrtime.bigint(), N = 120;
    let steps = 0;
    for (let i = 0; i < N; i++) { Game.update(g, H.input(), 1 / 60); steps += g.stepsLastFrame; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
    rows.push({ spawn, warp, got: g.warp, ms, steps: steps / N, h: g.stepDt, rocks: g.rockCand ? g.rockCand.length : 0 });
  }
  for (const r of rows) console.log(`INFO  ${r.spawn.padEnd(9)} warp ${String(r.warp).padStart(4)}x (got ${String(r.got).padStart(4)}x): ${r.ms.toFixed(2)} ms/frame, ${r.steps.toFixed(0)} steps of ${(r.h * 1000).toFixed(1)} ms, ${r.rocks} rock candidates`);
  check('every case under 16 ms of sim per frame in Node', rows.every((r) => r.ms < 16), `worst ${Math.max(...rows.map((r) => r.ms)).toFixed(2)} ms`);
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
