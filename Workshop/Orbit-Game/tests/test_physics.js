// ======================================================================
//  PHYSICS TESTS  —  run:  node tests/test_physics.js
// ======================================================================

const CONFIG  = require('../game/js/config.js');
const Physics = require('../game/js/physics.js');

const P = CONFIG.planet, Rk = CONFIG.rocket, dt = CONFIG.sim.dt;
let nPass = 0, nFail = 0;

function check(name, ok, info) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}   ${info}`);
  ok ? nPass++ : nFail++;
}
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const clone = (o) => JSON.parse(JSON.stringify(o));


// ---------------- 1. circular orbit stays circular ----------------
{
  const r0 = P.R + 300, v0 = Math.sqrt(P.mu / r0);
  const s = { x: r0, y: 0, vx: 0, vy: v0, angle: 0, fuel: 0 };
  const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / P.mu);
  const E0 = Physics.energy(s, P), h0 = Physics.angMom(s);
  let rMin = r0, rMax = r0;
  for (let t = 0; t < 10 * T; t += dt) {
    Physics.step(s, 0, dt, CONFIG);
    const r = Physics.radius(s); rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  check('circular orbit radius (10 periods)', (rMax - rMin) / r0 < 1e-3,
        `r in [${rMin.toFixed(2)}, ${rMax.toFixed(2)}], period ${T.toFixed(1)} s`);
  check('energy conserved', relErr(Physics.energy(s, P), E0) < 1e-5, `rel err ${relErr(Physics.energy(s, P), E0).toExponential(2)}`);
  check('angular momentum conserved', relErr(Physics.angMom(s), h0) < 1e-9, `rel err ${relErr(Physics.angMom(s), h0).toExponential(2)}`);
}


// ---------------- 2. ellipse: predicted Ap/Pe match simulation ----------------
{
  const r0 = P.R + 200, v0 = 1.15 * Math.sqrt(P.mu / r0);
  const s = { x: 0, y: r0, vx: -v0, vy: 0, angle: 0, fuel: 0 };
  const o = Physics.orbit(s, P);
  let rMin = Infinity, rMax = 0, tFirstAp = null, rPrev = r0, growing = true;
  for (let t = 0; t < 2 * o.T; t += dt) {
    Physics.step(s, 0, dt, CONFIG);
    const r = Physics.radius(s);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    if (growing && r < rPrev && tFirstAp === null) tFirstAp = t;
    growing = r >= rPrev; rPrev = r;
  }
  check('periapsis prediction', relErr(rMin, o.rp) < 1e-3, `sim ${rMin.toFixed(2)} vs kepler ${o.rp.toFixed(2)}`);
  check('apoapsis prediction', relErr(rMax, o.ra) < 1e-3, `sim ${rMax.toFixed(2)} vs kepler ${o.ra.toFixed(2)}`);
  check('time-to-apoapsis prediction', Math.abs(tFirstAp - o.tAp) < 0.05, `sim ${tFirstAp.toFixed(2)} s vs kepler ${o.tAp.toFixed(2)} s`);
  check('clockwise orbit detected', o.dir === 1, `dir ${o.dir} (moving -x at +y is CCW)`);
}


// ---------------- 3. rocket equation in empty space ----------------
{
  const cfg = clone(CONFIG); cfg.planet.mu = 0; cfg.planet.rho0 = 0;
  const s = { x: 1e9, y: 0, vx: 0, vy: 0, angle: 0, fuel: Rk.fuel };
  const dv = Physics.deltaV(s, Rk);
  let t = 0;
  while (s.fuel > 0) { Physics.step(s, 1, dt, cfg); t += dt; }
  check('tsiolkovsky delta-v', relErr(s.vx, dv) < 1e-3, `burned ${s.vx.toFixed(2)} m/s vs ve ln(m0/m1) = ${dv.toFixed(2)} m/s, burn time ${t.toFixed(1)} s`);
}


// ---------------- 4. scripted ascent reaches orbit with fuel to spare ----------------
//  vertical -> gravity turn -> cut at target Ap -> coast -> circularize

function flyAscent(targetAp = 250, turnEnd = 90) {
  const s = Physics.newState(CONFIG);
  let t = 0, phase = 'ascent', log = [];
  while (t < 600) {
    const alt = Physics.altitude(s, P), o = Physics.orbit(s, P);
    const up = Math.atan2(s.y, s.x);
    const pro = Math.atan2(s.vy, s.vx);
    let thr = 0;

    if (phase === 'ascent') {
      const f = Math.min(1, Math.max(0, alt / turnEnd));
      s.angle = up - f * Math.PI / 2 * 0.95;                  // tilt east (CW) with altitude
      thr = 1;
      if (o.ap >= targetAp) { phase = 'coast'; log.push(`MECO t=${t.toFixed(1)} alt=${alt.toFixed(0)} fuel=${s.fuel.toFixed(2)}`); }
    } else if (phase === 'coast') {
      s.angle = pro;
      if (o.tAp < 2.5 || Physics.radius(s) >= o.ra - 1) { phase = 'circ'; log.push(`circ start t=${t.toFixed(1)} alt=${alt.toFixed(0)} Ap=${o.ap.toFixed(0)} tAp=${o.tAp.toFixed(1)}`); }
    } else if (phase === 'circ') {
      s.angle = pro; thr = o.pe < targetAp - 80 ? 1 : 0.2;
      if (o.pe >= targetAp - 30 || s.fuel <= 0) { phase = 'done'; log.push(`circ done t=${t.toFixed(1)} Ap=${o.ap.toFixed(0)} Pe=${o.pe.toFixed(0)} fuel=${s.fuel.toFixed(2)}`); break; }
    }
    Physics.step(s, thr, dt, CONFIG); t += dt;
    if (Physics.altitude(s, P) < 0 && t > 1) { log.push('crashed'); break; }
  }
  return { s, t, o: Physics.orbit(s, P), log };
}

{
  const res = flyAscent();
  res.log.forEach((l) => console.log('      ' + l));
  const dvLeft = Physics.deltaV(res.s, Rk);
  check('scripted ascent reaches stable orbit', res.o.pe > CONFIG.goals.orbitPe, `Pe ${res.o.pe.toFixed(0)} m, Ap ${res.o.ap.toFixed(0)} m, t ${res.t.toFixed(0)} s`);
  check('orbit leaves fuel for boosts', dvLeft > 25, `delta-v left ${dvLeft.toFixed(1)} m/s of ${Physics.deltaV(Physics.newState(CONFIG), Rk).toFixed(1)}`);
  check('time to orbit is short (15-90 s)', res.t > 15 && res.t < 90, `${res.t.toFixed(0)} s`);
}


// ---------------- 5. sanity numbers for the HUD ----------------
{
  const s = Physics.newState(CONFIG);
  const vLow = Math.sqrt(P.mu / (P.R + 250)), vEsc = Math.sqrt(2 * P.mu / P.R);
  console.log(`INFO  liftoff TWR ${Physics.twr(s, CONFIG).toFixed(2)}, full delta-v ${Physics.deltaV(s, Rk).toFixed(1)} m/s, ` +
              `v_orbit(250 m) ${vLow.toFixed(1)} m/s, v_escape(surface) ${vEsc.toFixed(1)} m/s, full burn ${(Rk.fuel * Rk.ve / Rk.thrust).toFixed(1)} s`);
  check('liftoff TWR > 1', Physics.twr(s, CONFIG) > 1.2, Physics.twr(s, CONFIG).toFixed(2));
}


console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
