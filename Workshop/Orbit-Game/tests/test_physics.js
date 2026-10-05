// ======================================================================
//  PHYSICS TESTS  —  run:  node tests/test_physics.js
// ======================================================================

const CONFIG  = require('../game/js/config.js');
const World   = require('../game/js/world.js');
const Physics = require('../game/js/physics.js');

const S = CONFIG.ship, dt = CONFIG.sim.dt;
const OFF = { main: 0, rot: 0, kill: false, fwd: 0, left: 0 };
let nPass = 0, nFail = 0;

function check(name, ok, info) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(42)} ${info}`);
  ok ? nPass++ : nFail++;
}
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const cfgWith = (patch) => ({ ...CONFIG, ...patch });

const w = World.create(CONFIG, 7);
const ceres = w.byId.ceres, kiwi = w.byId.kiwi, dorito = w.byId.dorito;


// ---------------- 0. world sanity ----------------
{
  for (const b of w.bodies) console.log(`INFO  ${b.name.padEnd(7)} R ${b.R}  mu ${b.mu.toFixed(0)}  hill ${isFinite(b.hill) ? b.hill.toFixed(0) : '∞'}  ` +
    (b.par ? `rail period ${(2 * Math.PI / b.n).toFixed(0)} s` : 'fixed'));
  const [x, y, vx, vy] = World.bodyState(w, kiwi, 37);
  const r = Math.hypot(x, y), v = Math.hypot(vx, vy);
  check('Kiwi rail speed is circular-Kepler', relErr(v, Math.sqrt(ceres.mu / r)) < 1e-9, `${v.toFixed(3)} m/s at r ${r.toFixed(1)}`);
  check('every rail fits inside its parent Hill sphere', w.bodies.every((b) => !b.par || b.a < b.par.hill), '');
}


// ---------------- 1. lone Ceres: circular orbit, conservation ----------------
{
  const w1 = World.create(cfgWith({ bodies: [CONFIG.bodies[0]] }), 7);
  const r0 = 360, sh = Physics.newShip(CONFIG);
  Object.assign(sh, { x: r0, y: 0, vx: 0, vy: Math.sqrt(w1.bodies[0].mu / r0) });
  const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / w1.bodies[0].mu);
  const E0 = Physics.orbitRel(sh, w1.bodies[0], 0, w1).E;
  let rMin = r0, rMax = r0, t = 0;
  for (; t < 10 * T; t += dt) { Physics.step(sh, OFF, t, dt, w1, CONFIG); const r = Math.hypot(sh.x, sh.y); rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); }
  const E1 = Physics.orbitRel(sh, w1.bodies[0], t, w1).E;
  check('circular orbit holds radius (10 laps)', (rMax - rMin) / r0 < 1e-3, `r in [${rMin.toFixed(2)}, ${rMax.toFixed(2)}], period ${T.toFixed(1)} s`);
  check('energy conserved', relErr(E1, E0) < 1e-6, `rel err ${relErr(E1, E0).toExponential(2)}`);
}


// ---------------- 2. rocket equation (no gravity) ----------------
{
  const w0 = World.create(cfgWith({ bodies: [{ ...CONFIG.bodies[0], g: 0 }], rubble: null, rubbleKiwi: null }), 7);
  const sh = Physics.newShip(CONFIG); Object.assign(sh, { x: 1e6, ang: 0 });
  const dv = Physics.deltaV(sh, S);
  let t = 0;
  while (sh.fuel > 0) { Physics.step(sh, { ...OFF, main: 1 }, t, dt, w0, CONFIG); t += dt; }
  check('Tsiolkovsky delta-v', relErr(sh.vx, dv) < 1e-3, `${sh.vx.toFixed(2)} vs ve ln(m0/m1) = ${dv.toFixed(2)} m/s, burn ${t.toFixed(1)} s`);
}


// ---------------- 3. RCS rotation: spin up, then kill spin ----------------
{
  const w0 = World.create(cfgWith({ bodies: [{ ...CONFIG.bodies[0], g: 0 }] }), 7);
  const sh = Physics.newShip(CONFIG); sh.x = 1e6;
  let t = 0;
  for (; t < 0.5 - 1e-9; t += dt) Physics.step(sh, { ...OFF, rot: 1 }, t, dt, w0, CONFIG);
  const w1 = sh.omega, rcs1 = sh.rcs;
  check('torque spins ship up at rotAccel', relErr(w1, 0.5 * S.rotAccel) < 1e-2, `omega ${w1.toFixed(3)} rad/s after 0.5 s (expect ${(0.5 * S.rotAccel).toFixed(3)})`);
  let tk = 0;
  while (Math.abs(sh.omega) > 1e-6 && tk < 5) { Physics.step(sh, { ...OFF, kill: true }, t, dt, w0, CONFIG); tk += dt; }
  check('kill-rotation stops the spin', Math.abs(sh.omega) < 1e-6 && Math.abs(tk - 0.5) < 0.02, `stopped in ${tk.toFixed(3)} s`);
  check('spin stays when nothing fires', (() => { sh.omega = 0.3; Physics.step(sh, OFF, t, dt, w0, CONFIG); return sh.omega === 0.3; })(), 'omega unchanged');
  check('RCS propellant used', S.rcs - sh.rcs > 0.9 && S.rcs - sh.rcs < 1.1, `used ${(S.rcs - sh.rcs).toFixed(3)} units for ~1 s of torque`);
}


// ---------------- 4. trajectory preview matches the real sim ----------------
{
  const sh = Physics.newShip(CONFIG), r0 = 400;
  Object.assign(sh, { x: 0, y: r0, vx: -1.1 * Math.sqrt(ceres.mu / r0), vy: 0 });
  const H = 120, pred = Physics.predict(sh, 0, w, H, CONFIG.sim.predictSteps);
  let t = 0;
  while (t < H - 1e-9) { Physics.step(sh, OFF, t, dt, w, CONFIG); t += dt; }
  const last = pred.pts[pred.pts.length - 1];
  const err = Math.hypot(last[0] - sh.x, last[1] - sh.y);
  check('preview lands where the ship goes (120 s)', err < 1.0, `miss ${err.toFixed(3)} m after ${H} s`);
}


// ---------------- 5. low orbits around small asteroids survive Ceres tides ----------------
//  (they wobble, which is the point: you trim them now and then)
for (const [b, r0] of [[kiwi, 85], [dorito, 52]]) {
  const sh = Physics.newShip(CONFIG);
  const [kx, ky, kvx, kvy] = World.bodyState(w, b, 0);
  const vc = Math.sqrt(b.mu / r0), dir = [kx / Math.hypot(kx, ky), ky / Math.hypot(kx, ky)];
  Object.assign(sh, { x: kx + dir[0] * r0, y: ky + dir[1] * r0, vx: kvx - dir[1] * vc, vy: kvy + dir[0] * vc });
  const T = 2 * Math.PI * r0 / vc;
  let rMin = Infinity, rMax = 0, t = 0;
  for (; t < 3 * T; t += dt) {
    Physics.step(sh, OFF, t, dt, w, CONFIG);
    const [bx, by] = World.bodyState(w, b, t + dt), r = Math.hypot(sh.x - bx, sh.y - by);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  check(`${b.name} orbit at ${r0} m stays bound (3 laps)`, rMin > b.R + 5 && rMax < 0.7 * b.hill,
        `r in [${rMin.toFixed(1)}, ${rMax.toFixed(1)}], period ${T.toFixed(0)} s, Hill ${b.hill.toFixed(0)}`);
}


// ---------------- 6. scripted launch from the Ceres pad to orbit ----------------
{
  const sh = Physics.newShip(CONFIG); sh.y = ceres.R + 0.01;
  let t = 0, phase = 'up', log = [];
  while (t < 400 && phase !== 'done') {
    const o = Physics.orbitRel(sh, ceres, t, w), up = Math.atan2(sh.y, sh.x);
    let main = 0;
    if (phase === 'up') {
      const f = Math.min(1, o.alt / 40);
      sh.ang = up - f * Math.PI / 2 * 0.92; main = 1;
      if (o.ap > 80) { phase = 'coast'; log.push(`cutoff t=${t.toFixed(1)} alt=${o.alt.toFixed(0)}`); }
    } else if (phase === 'coast') {
      if (o.vr <= 0) phase = 'circ';
    } else {
      sh.ang = Math.atan2(sh.vy, sh.vx); main = o.pe < 60 ? 1 : 0.15;
      if (o.pe > 70) { phase = 'done'; log.push(`orbit t=${t.toFixed(1)} Ap=${o.ap.toFixed(0)} Pe=${o.pe.toFixed(0)}`); }
    }
    Physics.step(sh, { ...OFF, main }, t, dt, w, CONFIG); t += dt;
  }
  log.forEach((l) => console.log('      ' + l));
  const o = Physics.orbitRel(sh, ceres, t, w), dvLeft = Physics.deltaV(sh, S), dv0 = Physics.deltaV(Physics.newShip(CONFIG), S);
  check('scripted launch reaches Ceres orbit', phase === 'done' && o.pe > 50, `Pe ${o.pe.toFixed(0)} m, Ap ${o.ap.toFixed(0)} m, t ${t.toFixed(0)} s`);
  check('launch costs a minority of the tank', dvLeft > 0.5 * dv0, `delta-v left ${dvLeft.toFixed(0)} of ${dv0.toFixed(0)} m/s`);
}


// ---------------- 7. feel numbers ----------------
{
  const sh = Physics.newShip(CONFIG), m = Physics.mass(sh, S);
  const vLow = Math.sqrt(ceres.mu / (ceres.R + 60));
  console.log(`INFO  main accel ${(S.thrust / m).toFixed(2)} m/s^2 (fine ${(S.fine * S.thrust / m).toFixed(2)}), TWR on Ceres ${(S.thrust / m / ceres.g).toFixed(2)}, ` +
              `RCS translate ${S.transAccel} m/s^2, v_orbit(60 m) ${vLow.toFixed(1)} m/s, delta-v ${Physics.deltaV(sh, S).toFixed(0)} m/s`);
  check('can lift off Ceres', S.thrust / m / ceres.g > 1.2, '');
  check('fine throttle is gentle (< 0.5 m/s^2)', S.fine * S.thrust / m < 0.5, '');
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
