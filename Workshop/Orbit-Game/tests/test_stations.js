// ======================================================================
//  STATIONS TESTS  —  Kepler rails, Rust's at L5, docking rules, F docks
//  and the ship rides the port, thrust undocks, hub spawn, undock job,
//  free refuel without economy (child run), chatter, targeting, hints,
//  save/load, death/tow, warp, and the art on a NaN-sniffing fake canvas.
//    node tests/test_stations.js
// ======================================================================

const H = require('./harness');
const SOLO = process.argv.includes('--solo');                 // child run: stations alone, no economy
const PAD = process.argv.includes('--pad');                   // child run: with Mochi's town (the pad target)
H.load({ only: SOLO ? 'stations' : PAD ? 'economy,shop,stations,eva,mochi' : 'economy,shop,stations' });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${(SOLO ? '[solo] ' : PAD ? '[pad] ' : '') + name.padEnd(56)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = null) => Game.create(7, spawn, { fresh: true });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const promptF = (g) => g.prompts.find((p) => p.key === 'KeyF');
const toastHas = (g, s) => g.toasts.some((t) => t.text.includes(s));

// put the ship `dist` m outside a port (along the way it faces), closing at `relV` m/s (or opening if negative)
function nearPort(g, st, dist, relV, sideways = 0) {
  const p = st.portState(g.t), th = st.portAng(g.t), ux = Math.cos(th), uy = Math.sin(th);
  Object.assign(g.sh, { x: p[0] + ux * dist - uy * sideways, y: p[1] + uy * dist + ux * sideways,
                        vx: p[2] - ux * relV, vy: p[3] - uy * relV, ang: th + Math.PI, omega: 0 });
  Object.assign(g, { status: 'flying', attach: null, landedOn: null, land: null, everFlew: true });
  Game.refresh(g);
}
// put the ship on the station's own circular orbit, ds metres along the track from it, plus dv m/s prograde
function coorbit(g, st, ds, dv = 0) {
  const R = st.orbitR, b = st.hostBody, th = st.facing(g.t) + ds / R, [hx, hy, hvx, hvy] = World.bodyState(g.w, b, g.t), v = Math.sqrt(b.mu / R) + dv;
  Object.assign(g.sh, { x: hx + R * Math.cos(th), y: hy + R * Math.sin(th), vx: hvx - v * Math.sin(th), vy: hvy + v * Math.cos(th), ang: th + Math.PI / 2, omega: 0 });
  Object.assign(g, { status: 'flying', attach: null, landedOn: null, land: null, everFlew: true });
  Game.refresh(g);
}
const onPort = (g, st) => { const p = st.portState(g.t); return Math.hypot(g.sh.x - p[0], g.sh.y - p[1]) + Math.hypot(g.sh.vx - p[2], g.sh.vy - p[3]); };


// ---------------- 15. pad child: with Mochi's town the Hub times your drop onto the pad (newplayer H1, L3) ----------------
if (PAD) {
  const late = fresh();                                                       // the window's last moment, for the landing check below
  for (let n = 0; n < 60 * 140 && !/undock now/.test(Game.hint(late)); n++) H.run(late, 1, {});
  for (let n = 0; n < 60 * 5 && /undock now/.test(Game.hint(late)); n++) H.run(late, 1, {});
  const g = fresh(), hub = Stations.byId(g, 'hub'), mochi = g.w.byId.mochi;
  check('docked: the hint gives the town pad\'s undock window', /For the town pad, undock in \d+ s|undock now/.test(Game.hint(g)), Game.hint(g));
  let n = 0;
  for (; n < 60 * 140 && !/undock now/.test(Game.hint(g)); n++) H.run(g, 1, {});
  check('...which comes round within one Hub lap', n / 60 <= hub.period + 0.1, `${(n / 60).toFixed(0)} s (lap ${hub.period.toFixed(0)} s): ${Game.hint(g)}`);
  const gw = fresh(), top = CONFIG.sim.warps.length - 1; gw.warpIdx = top; H.run(gw, 2, {});
  const w0 = CONFIG.sim.warps[gw.warpIdx]; let nw = 0;
  for (; nw < 60 * 60 && !/undock now/.test(Game.hint(gw)); nw++) H.run(gw, 1, {});
  check('warp to the window: the warp eases down and the window opens at 1x (newplayer H1 at warp)', w0 > 4 && /undock now/.test(Game.hint(gw)) && CONFIG.sim.warps[gw.warpIdx] === 1,
        `${w0}x at first, window after ${(nw / 60).toFixed(1)} s real at ${CONFIG.sim.warps[gw.warpIdx]}x`);
  H.run(g, 6, { keys: ['KeyW'] }); H.run(g, 30, {});
  check('undocking targets the town pad', g.navId === Mochi.PAD_ID && /Pad/.test(Game.navTarget(g).name), `${g.navId}`);
  check('just undocked: no "Dock at" prompt (READY panel hidden too)', !g.prompts.some((p) => /Dock at/.test(p.text)), g.prompts.map((p) => p.text).join(' | '));
  check('...and the hint says the pad is your target', /town pad, your target/.test(Game.hint(g)), Game.hint(g));
  check('...over a wreck\'s "Tab to target it" for the first 20 s (pad hint pri 39)', Game.mods.find((x) => x.id === 'stations').hint(g).pri === 39);
  H.run(late, 6, { keys: ['KeyW'] });
  const drop = (g2) => {                                                       // a newcomer's brake-and-drop: nose against the motion, W while fast
    for (let i = 0; i < 60 * 300 && g2.status === 'flying'; i++) {
      const o = Physics.orbitRel(g2.sh, mochi, g2.t, g2.w);
      g2.sh.ang = Math.atan2(-o.vy, -o.vx); g2.sh.omega = 0;
      Game.update(g2, H.input({ keys: Math.hypot(o.vx, o.vy) > Math.min(8, 1.5 + o.alt / 12) ? ['KeyW'] : [] }), 1 / 60);
    }
    const [px, py] = Game.navTargets(g2).find((t) => t.id === Mochi.PAD_ID).state(g2.t);
    return { ok: g2.status === 'landed' && g2.done.land_mochi !== undefined, gap: Math.hypot(g2.sh.x - px, g2.sh.y - py) };
  };
  const a = drop(g), b = drop(late);
  check('a brake-and-drop from either end of the window lands by the pad: land_mochi done', a.ok && b.ok && Math.max(a.gap, b.gap) < Mochi.PAD_NEAR, `${a.gap.toFixed(0)} m / ${b.gap.toFixed(0)} m from the pad`);
  console.log(`\n${nPass} passed, ${nFail} failed`);
  process.exit(nFail ? 1 : 0);
}


// ======================================================================
//  SOLO (child process): no economy -> docking is a free refuel + repair
// ======================================================================

if (SOLO) {
  const g = fresh('orbit'), hub = Stations.byId(g, 'hub');
  check('solo: stations alone still spawns docked at the hub', fresh().status === 'docked' && Game.defaultSpawn() === 'hub');
  Object.assign(g.sh, {});
  nearPort(g, hub, 8, 0.3);
  g.sh.fuel = 0.1; g.sh.hull = 37; g.sh.rcs = 2;
  H.run(g, 1, {});
  H.run(g, 1, { pressed: ['KeyF'] });
  H.run(g, 260, {});
  check('solo: F docks without the economy', g.status === 'docked' && Stations.dockedAt(g) === hub, g.status);
  check('solo: docking tops up fuel, hull and RCS for free', g.sh.fuel === g.S.fuel && g.sh.hull === g.S.hull && g.sh.rcs === g.S.rcs && !g.ui,
        `fuel ${g.sh.fuel.toFixed(2)}/${g.S.fuel} hull ${g.sh.hull}/${g.S.hull} rcs ${g.sh.rcs}`);
  check('solo: says so with a toast', toastHas(g, 'FREE REFUEL'), g.toasts.map((t) => t.text).join(' | '));
  check('solo: docked prompt offers the free refuel', promptF(g) && /Refuel & repair at Mochi Hub \(free\)/.test(promptF(g).text), promptF(g) && promptF(g).text);
  g.sh.fuel = 0.5; H.run(g, 1, { pressed: ['KeyF'] });
  check('solo: F while docked refuels again', g.sh.fuel === g.S.fuel, `${g.sh.fuel}`);
  console.log(`\n[solo] ${nPass} passed, ${nFail} failed`);
  process.exit(nFail ? 1 : 0);
}


// ---------------- mock Econ (only while the economy module is still a stub) ----------------

const shopCalls = [];
const MOCK = typeof Econ === 'undefined';

// every hint the module gives is recorded: the core draws it on one line, so it must stay short
const HINTS = new Set();
{
  const sm = Game.mods.find((x) => x.id === 'stations'), orig = sm.hint;
  sm.hint = (g) => { const r = orig(g); if (r) HINTS.add(r.text); return r; };
}
if (MOCK) global.Econ = { openShop(g, st) { shopCalls.push(st); g.ui = 'shop'; }, closeShop(g) { g.ui = null; } };
const closeShop = (g) => { if (Econ.closeShop) Econ.closeShop(g); g.ui = null; };


// ---------------- 1. rails: exact circular Kepler orbits ----------------
{
  const g = fresh();
  for (const st of Stations.list(g)) {
    const host = st.hostBody, vc = Math.sqrt(host.mu / st.orbitR);
    let eR = 0, eV = 0, eDot = 0, eFD = 0, ePort = 0;
    for (const t of [0, 13.7, 500, 4321.5, 98765.4]) {
      const [x, y, vx, vy] = st.state(t), [hx, hy, hvx, hvy] = World.bodyState(g.w, host, t);
      const rx = x - hx, ry = y - hy, ux = vx - hvx, uy = vy - hvy, r = Math.hypot(rx, ry), v = Math.hypot(ux, uy);
      eR = Math.max(eR, Math.abs(r - st.orbitR)); eV = Math.max(eV, Math.abs(v - vc) / vc); eDot = Math.max(eDot, Math.abs(rx * ux + ry * uy) / (r * v));
      const h = 1e-3, a = st.state(t - h), b = st.state(t + h), pa = st.portState(t - h), pb = st.portState(t + h), p = st.portState(t);
      eFD = Math.max(eFD, Math.hypot((b[0] - a[0]) / (2 * h) - vx, (b[1] - a[1]) / (2 * h) - vy));
      ePort = Math.max(ePort, Math.hypot((pb[0] - pa[0]) / (2 * h) - p[2], (pb[1] - pa[1]) / (2 * h) - p[3]));
    }
    check(`${st.name}: circular Kepler rail around ${host.name}`, eR < 1e-6 && eV < 1e-12 && eDot < 1e-12,
          `r ${st.orbitR} m, v ${vc.toFixed(3)} m/s = sqrt(mu/r), T ${st.period.toFixed(1)} s`);
    check(`${st.name}: state & port velocities match the motion`, eFD < 1e-4 && ePort < 1e-4, `fd err ${eFD.toExponential(1)}, port ${ePort.toExponential(1)} m/s`);
  }
  const hub = Stations.byId(g, 'hub'), out = Stations.byId(g, 'outpost');
  check('hub sits at r = 420 around Mochi, outpost at 95 around Kiwi', hub.orbitR === 420 && hub.hostBody.id === 'mochi' && out.orbitR === 95 && out.hostBody.id === 'kiwi');
  check('Kepler period: T = 2 pi sqrt(a^3 / mu)', Math.abs(hub.period - 2 * Math.PI * Math.sqrt(420 ** 3 / hub.hostBody.mu)) < 1e-9, `${hub.period.toFixed(2)} s`);
}


// ---------------- 2. Rust's circles Big Potato, deep inside its Hill sphere ----------------
//  (v3 parked it at Potato's L5; in the belt Potato has its own Hill sphere, so Rust's just orbits it)
{
  const g = fresh(), rust = Stations.byId(g, 'rusts'), pot = g.w.byId.potato;
  check("Rust's orbits Big Potato, inside a third of its Hill sphere", rust.hostBody === pot && rust.orbitR < pot.hill / 3,
        `r ${rust.orbitR} m, Hill ${pot.hill.toFixed(0)} m, lap ${rust.period.toFixed(0)} s`);
  const sh = Physics.newShip(g.S), [x0, y0, vx0, vy0] = rust.state(0);       // a free test mass on Rust's rail: the rail is an honest orbit
  Object.assign(sh, { x: x0, y: y0, vx: vx0, vy: vy0 });
  const OFF = { main: 0, rot: 0, kill: false, fwd: 0, left: 0 }, dt = CONFIG.sim.dt;
  let eDrift = 0, t = 0;
  for (; t < 3 * rust.period; t += dt) {
    Physics.step(sh, OFF, t, dt, g.w, g.S);
    if (Math.round(t / dt) % 240 === 0) { const [px, py] = World.bodyState(g.w, pot, t + dt); eDrift = Math.max(eDrift, Math.abs(Math.hypot(sh.x - px, sh.y - py) - rust.orbitR)); }
  }
  const [rx, ry] = rust.state(t), dRail = Math.hypot(sh.x - rx, sh.y - ry);
  //  at r / Hill = 0.31 Ember's tide is ~3 % of Potato's pull: a free orbit wobbles ~13 % and slips along the rail; still bound
  check("a free mass on Rust's rail stays bound to Big Potato (tides wobble it)", eDrift < 0.2 * rust.orbitR, `radius wobble ${eDrift.toFixed(1)} m, ${dRail.toFixed(1)} m off the rail after 3 laps`);
  check("Rust's blurb is honest (Big Potato's Hill sphere does the parking)", /Hill sphere/.test(rust.blurb) && /Big Potato/.test(rust.blurb) && /Pirates leave/.test(rust.blurb), rust.blurb.slice(0, 60) + '...');
  check('Pirates leave Rust\'s alone (pirateFree)', Stations.pirateFree(g, ...rust.state(g.t).slice(0, 2)) && !Stations.pirateFree(g, ...Stations.byId(g, 'hub').state(g.t).slice(0, 2)));
}


// ---------------- 3. docking only when close and slow ----------------
{
  const g = fresh('orbit'), hub = Stations.byId(g, 'hub');
  nearPort(g, hub, 45, 0.5); H.run(g, 1, {});
  check('45 m out: no dock prompt', !promptF(g), promptF(g) ? promptF(g).text : 'none');
  nearPort(g, hub, 24, 0.4); H.run(g, 1, {});
  check('24 m out, slow: still no dock prompt', !promptF(g), promptF(g) ? promptF(g).text : 'none');
  nearPort(g, hub, 10, 3.2); H.run(g, 1, {});
  const p = promptF(g);
  check('10 m out at 3.2 m/s: "Slow to under 1.5 m/s to dock (now 3.2)"', p && /^Slow to under 1\.5 m\/s to dock \(now 3\.\d\)$/.test(p.text), p ? p.text : 'none');
  H.run(g, 1, { pressed: ['KeyF'] });
  check('...and F does not dock while too fast', g.status === 'flying' && toastHas(g, 'TOO FAST'), g.status);
  nearPort(g, hub, 10, 0.4); H.run(g, 1, {});
  check('10 m out at 0.4 m/s: "Dock at Mochi Hub"', promptF(g) && promptF(g).text === 'Dock at Mochi Hub', promptF(g) ? promptF(g).text : 'none');
  nearPort(g, hub, 18, 0.3, 0); const pi = Stations.portInfo(g, hub);
  nearPort(g, hub, -(hub.port[0] * hub.pd[0] + hub.port[1] * hub.pd[1]) - 4.6, 0.3); H.run(g, 1, {});   // right over the station centre, 17.6 m from the port
  check('flying over the station body counts as in range', Stations.portInfo(g, hub).dc < 0.1 && promptF(g) && promptF(g).text === 'Dock at Mochi Hub', `${pi.d.toFixed(1)} m; ${promptF(g) ? promptF(g).text : 'none'}`);
}


// ---------------- 4. F docks; clamps reel in smoothly; the ship rides the port ----------------
{
  const g = fresh('orbit'), hub = Stations.byId(g, 'hub');
  nearPort(g, hub, 11, 0.8, 3); H.run(g, 1, {});
  H.run(g, 1, { pressed: ['KeyF'] });
  check('F docks at Mochi Hub', g.status === 'docked' && Stations.dockedAt(g) === hub, g.status);
  let maxJump = 0, last = null;
  for (let i = 0; i < 400; i++) {
    H.run(g, 1, {});
    const p = hub.portState(g.t), rel = [g.sh.x - p[0], g.sh.y - p[1]];
    if (last) maxJump = Math.max(maxJump, Math.hypot(rel[0] - last[0], rel[1] - last[1]));
    last = rel;
    if (g.ui) break;
  }
  check('clamps reel the ship in without jumps', maxJump < 0.4, `max ${maxJump.toFixed(3)} m per frame`);
  check('then the shop opens (Econ.openShop with the station)', g.ui === 'shop' && (!MOCK || (shopCalls.length === 1 && shopCalls[0].id === 'hub')), `ui ${g.ui}`);
  const st = MOCK ? shopCalls[0] : hub;
  check('station info has the shop fields', ['id', 'name', 'kind', 'keeper', 'blurb', 'buy', 'tabs', 'fuelMult'].every((k) => st[k] !== undefined) && st.tabs.join() === 'services,sell,ship,suit,haul',
        `${st.kind}, keeper ${st.keeper}, tabs ${st.tabs}`);
  closeShop(g);
  H.run(g, 90, {});
  check('docked ship rides the port exactly', onPort(g, hub) < 1e-9 && Math.abs(wrap(g.sh.ang - hub.portAng(g.t))) < 1e-12, `err ${onPort(g, hub).toExponential(1)}`);
  check('docked prompt: "Open Mochi Hub shop"', promptF(g) && promptF(g).text === 'Open Mochi Hub shop', promptF(g) && promptF(g).text);
  H.run(g, 1, { pressed: ['KeyF'] });
  check('F while docked reopens the shop', g.ui === 'shop');
  closeShop(g);
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 120, {});
  check('max warp while docked: still on the port, finite', g.warp === CONFIG.sim.warps[CONFIG.sim.warps.length - 1] && onPort(g, hub) < 1e-9 && Number.isFinite(g.sh.x + g.sh.vx), `warp ${g.warp}x, t ${g.t.toFixed(0)} s`);
  g.warpIdx = 0;
}


// ---------------- 4b. v4: the dock zone grows with the hull; every station has a haul tab; keeper lines carry a mood ----------------
{
  const g = fresh('orbit'), hub = Stations.byId(g, 'hub');
  nearPort(g, hub, 19, 0.4); H.run(g, 1, {});
  check('stock Prospector (r 4 m): no dock prompt at 19 m', !promptF(g) && Stations.dockR(g) === 14, `dockR ${Stations.dockR(g)}; ${promptF(g) ? promptF(g).text : 'none'}`);
  const lev = (typeof Econ !== 'undefined' && Econ && Econ.FRAMES && Econ.FRAMES.leviathan) ? Econ.FRAMES.leviathan.radius : 11;
  g.S.radius = lev;                                                   // the Leviathan's hull (econ's frame stat)
  nearPort(g, hub, 19, 0.4); H.run(g, 1, {});
  check('Leviathan (r 11 m): dock zone 21 m, prompt at 19 m', Stations.dockR(g) === 21 && promptF(g) && promptF(g).text === 'Dock at Mochi Hub', `dockR ${Stations.dockR(g)}; ${promptF(g) ? promptF(g).text : 'none'}`);
  nearPort(g, hub, 23, 0.4); H.run(g, 1, {});
  check('...and still none at 23 m', !promptF(g), promptF(g) ? promptF(g).text : 'none');
  const seat = (len) => { g.S.length = len; Stations.list(g); const [px, py] = hub.portState(g.t), [cx, cy] = hub.collar(g.t); return Math.hypot(px - cx, py - cy); };
  const s9 = seat(9), s26 = seat(26); g.S.length = 9; Stations.list(g);
  check('a docked hull sits by its length: 4.6 m off the collar at 9 m, 13.3 m at 26 m (critic L4: no tail in the ring)', Math.abs(s9 - 4.6) < 1e-6 && Math.abs(s26 - 4.6 * 26 / 9) < 1e-6, `${s9.toFixed(2)} / ${s26.toFixed(2)} m`);
  const tabs = ['hub', 'outpost', 'rusts'].map((id) => Stations.byId(g, id).tabs);
  check('hub, outpost and rusts tabs include haul', tabs.every((t) => t.includes('haul')), tabs.map((t) => t.join('/')).join(' · '));
  const MOODS = ['chat', 'hint', 'joke', 'gossip', 'lore', 'warn', 'grumpy', 'sad', 'want', 'happy'], bad = [];
  for (const st of Stations.list(g)) for (const L of [st.hello, st.hi, ...st.lines].filter(Boolean))
    if (!Array.isArray(L) || !MOODS.includes(L[0]) || typeof L[1] !== 'string' || L[1].length > 90) bad.push(`${st.id}: ${JSON.stringify(L)}`);
  check('keeper lines are [mood, text] (<= 90 chars), each keeper names its npc', !bad.length && Stations.list(g).every((st) => st.npc && st.keeperAt), bad.join(' | ') || Stations.list(g).map((st) => st.npc).join(','));
}


// ---------------- 5. thrust undocks, pushes clear, ticks the undock job ----------------
{
  const g = fresh(), hub = Stations.byId(g, 'hub'), m0 = g.money;
  check("'hub' is the default spawn: new games start docked", g.spawn === 'hub' && g.status === 'docked' && Stations.dockedAt(g) === hub && onPort(g, hub) < 1e-9, `${g.spawn} ${g.status}`);
  check('new game: docked hint says how to undock', /Tap W to undock/.test(Game.hint(g)), Game.hint(g));
  H.run(g, 1, { keys: ['KeyW'] });
  const p = hub.portState(g.t), th = hub.portAng(g.t), out = (g.sh.vx - p[2]) * Math.cos(th) + (g.sh.vy - p[3]) * Math.sin(th);
  check('W undocks', g.status === 'flying' && !g.attach, g.status);
  check('undocking pushes away from the station', out > 0.75, `outward ${out.toFixed(2)} m/s`);
  check('...along the nose, which the hub points retrograde (W drops you toward Mochi)', Math.abs(wrap(hub.portAng(g.t) - hub.facing(g.t) + Math.PI / 2)) < 1e-9);   // facing = radial out; CCW orbit -> retrograde = facing - 90 deg
  check('undock job ticks (+$25)', g.done.undock !== undefined && g.money - m0 === 25 && Game.GOALS.find((x) => x.id === 'undock').order === 10, `$${m0} -> $${g.money}`);
  check('just undocked: the hint says where to go next, not "dock here"', /Free flying! Retrograde .* toward Mochi/.test(Game.hint(g)), Game.hint(g));
  const g2 = fresh('outpost');
  H.run(g2, 1, { keys: ['ArrowLeft'] });
  check('arrows undock too; leaving another station is not the job', g2.status === 'flying' && g2.done.undock === undefined, g2.status);
}


// ---------------- 5b. undocking is never a launch: soft start, nose retrograde, three quiet laps ----------------
{
  const mod = Game.mods.find((x) => x.id === 'stations'), g = fresh(), hub = Stations.byId(g, 'hub');
  check('docked controls line starts "tap W: undock"', /^tap W: undock · F shop/.test(mod.controls(g)), mod.controls(g));
  H.run(g, 60, { keys: ['KeyW'] });                                     // W held for 1 s straight off the clamps
  const p = hub.portState(g.t), dv = Math.hypot(g.sh.vx - p[2], g.sh.vy - p[3]);
  check(`soft start: W held off the clamps runs at the fine throttle for ${Stations.SOFT_T} s`, dv < 2.5, `${dv.toFixed(2)} m/s off the port after 1 s (full throttle: ~8)`);
  // W held `hold` s from a fresh docked start, then hands off for `laps` station laps: track r around the host
  function flyOff(id, hold, laps = 3) {
    const g = fresh(id), st = Stations.byId(g, id), host = st.hostBody, t0 = g.t;
    H.run(g, Math.max(1, Math.round(hold * 60)), { keys: ['KeyW'] });
    let rmin = 1e9, rmax = 0, warn = null, hull = g.sh.hull;
    while (g.t - t0 < laps * st.period && g.status === 'flying') {
      g.warpIdx = CONFIG.sim.warps.length - 1; H.run(g, 1, {}, 1 / 20);
      const [hx, hy] = World.bodyState(g.w, host, g.t), r = Math.hypot(g.sh.x - hx, g.sh.y - hy);
      rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
      if (g.status === 'flying') hull = g.sh.hull;
      if (warn == null && g.pred && g.pred.impact) warn = { dt: g.pred.impact.t - g.t, body: g.pred.impact.body.id };
    }
    return { g, rmin, rmax, warn, hull, info: `${g.status}, hull ${hull}, r ${rmin.toFixed(0)}..${rmax.toFixed(0)} m over ${(g.t - t0).toFixed(0)} s` +
                                               (warn ? `, impact warned ${warn.dt.toFixed(0)} s ahead (${warn.body})` : '') };
  }
  const tap = flyOff('hub', 0.1);
  check('tap W at the hub, coast 3 laps: no rubble (470+ m), no Mochi', tap.g.status === 'flying' && tap.hull === 100 && tap.rmax < 470 && tap.rmin > 330 && !tap.warn, tap.info);
  const hold = flyOff('hub', 3);
  check('hold W 3 s at the hub: below the rubble, Mochi impact warned >= 15 s ahead', hold.hull === 100 && hold.rmax < 470 && hold.warn && hold.warn.body === 'mochi' && hold.warn.dt >= 15, hold.info);
  const kiwi = flyOff('outpost', 0.1);
  check('tap W at Kiwi Outpost, coast 3 laps: inside the rubble (118+ m), off Kiwi', kiwi.g.status === 'flying' && kiwi.hull === 100 && kiwi.rmax < 118 && !kiwi.warn, kiwi.info);
}


// ---------------- 6. every station docks and holds ----------------
for (const id of ['outpost', 'rusts']) {
  const g = fresh('orbit'), st = Stations.byId(g, id);
  nearPort(g, st, 6, 0.6); H.run(g, 1, {});
  H.run(g, 1, { pressed: ['KeyF'] });
  H.run(g, 160, {});
  check(`${st.name}: docks, clamps finish, shop opens, ship rides the port`, Stations.dockedAt(g) === st && g.ui === 'shop', `ui ${g.ui}`);
  closeShop(g); H.run(g, 60, {});
  check(`${st.name}: ...and the ship stays on the port`, onPort(g, st) < 1e-9, `err ${onPort(g, st).toExponential(1)}`);
  if (id === 'rusts') check("Rust's sells weapons; Kiwi buys ice dearly", st.tabs.includes('weapons') && Stations.byId(g, 'outpost').buy.ice > 1.3 && st.buy.scrap > 1.2 && st.buy.jelly > 1.2);
}


// ---------------- 6b. the Mochi pad depot: with stations on, a kiosk (fuel, RCS, sell) a bit worse than the hub ----------------
{
  const g = fresh('pad'), hub = Stations.byId(g, 'hub'); H.run(g, 1, {});
  check('on the Mochi pad: F opens the pad depot', promptF(g) && /pad depot/.test(promptF(g).text), promptF(g) ? promptF(g).text : 'none');
  Game.addCargo(g, 'iron', 10); Object.assign(g.sh, { fuel: 0, rcs: 0 }); g.money = 5000;
  H.run(g, 1, { pressed: ['KeyF'] });
  const k = g.mod.economy.station || {};
  check('...a kiosk: services and sell tabs only (upgrades stay at the hub)', g.ui === 'shop' && k.id === 'pad-depot' && k.tabs.join() === 'services,sell', `${g.ui} ${k.name}: ${k.tabs}`);
  const ore = Econ.sellPrice(g, 'iron', k) / Econ.sellPrice(g, 'iron', hub), fuel = Econ.quote(g, k, 'fuel') / Econ.quote(g, hub, 'fuel'), rcs = Econ.quote(g, k, 'rcs') / Econ.quote(g, hub, 'rcs');
  check('kiosk prices vs the hub: ore 0.8x, fuel and RCS 1.2x', Math.abs(ore - 0.8) < 0.01 && Math.abs(fuel - 1.2) < 0.03 && Math.abs(rcs - 1.2) < 0.05,
        `ore ${ore.toFixed(2)}x, fuel ${fuel.toFixed(2)}x, rcs ${rcs.toFixed(2)}x`);
  const m0 = g.money, got = Econ.sellAll(g, k); Econ.refuel(g, k); closeShop(g); H.run(g, 2, {});
  check('selling there pays and ticks the sell job; refuel fills fuel and RCS', got > 0 && g.done.sell !== undefined && g.sh.fuel === g.S.fuel && g.sh.rcs === g.S.rcs,
        `+$${got}, sell job ${g.done.sell !== undefined}, $${m0} -> $${g.money}`);
  Econ.firePulse(g);
  check('no Orion units: the toast names the stations that sell them', toastHas(g, "NO ORION UNITS (MOCHI HUB AND RUST'S SELL THEM)"), g.toasts.map((t) => t.text).slice(-1).join());
}


// ---------------- 7. tow, crash, death while docked ----------------
{
  const g = fresh('outpost');
  Game.respawn(g, 'tow');
  check('a tow lands you docked at Mochi Hub, with a word from Dot', Stations.dockedAt(g) && Stations.dockedAt(g).id === 'hub' && toastHas(g, 'Dot:'), g.toasts.map((t) => t.text).join(' | '));
  Game.die(g, 'test');
  H.run(g, 1, {});
  check('dying while docked clears the dock and the prompts', g.status === 'dead' && !Stations.dockedAt(g) && !promptF(g) && !g.mod.stations.pending, g.status);
  H.run(g, 1, { pressed: ['KeyR'] });
  check('R after the crash: docked at the hub again', Stations.dockedAt(g) && Stations.dockedAt(g).id === 'hub' && g.sh.hull === g.S.hull, g.status);
  const g2 = fresh('orbit'), hub = Stations.byId(g2, 'hub');
  nearPort(g2, hub, 9, 0.2); H.run(g2, 1, {}); H.run(g2, 1, { pressed: ['KeyF'] }); H.run(g2, 5, {});
  Game.impulse(g2, 0, 3);
  H.run(g2, 200, {});
  check('kicked off mid-docking (impulse): no shop pops up later', g2.status === 'flying' && !g2.ui && !g2.mod.stations.pending, `${g2.status} ui ${g2.ui}`);
}


// ---------------- 8. chatter: one line per visit ----------------
{
  const g = fresh(), hub = Stations.byId(g, 'hub');
  H.run(g, 2, {});
  check('docked at start: Dot says hello', toastHas(g, `Dot: "${hub.hello[1]}"`) && g.mod.stations.met.hub, g.toasts.map((t) => t.text).join(' | '));
  const n0 = g.toasts.length;
  H.run(g, 30, {});
  check('...only once while you stay', g.toasts.length === n0);
  H.run(g, 1, { keys: ['KeyW'] });
  const far = () => { const [mx, my, mvx, mvy] = World.bodyState(g.w, g.w.byId.mochi, g.t); Object.assign(g.sh, { x: mx, y: my - 1400, vx: mvx, vy: mvy }); };
  far(); H.run(g, 1, {}); g.real += 61;
  nearPort(g, hub, 100, 0); H.run(g, 1, {});
  check('come back later: a fresh line', toastHas(g, `Dot: "${hub.lines[0][1]}"`), g.toasts.map((t) => t.text).join(' | '));
  far(); H.run(g, 1, {}); nearPort(g, hub, 100, 0); H.run(g, 1, {});
  check('...but not again within a minute', !toastHas(g, hub.lines[1][1]));
  const g2 = fresh('orbit');
  nearPort(g2, hub, 120, 6); H.run(g2, 2, {});
  check('zooming past, never docked: Dot says hi, not "Tap W to fly"', toastHas(g2, `Dot: "${hub.hi[1]}"`) && !toastHas(g2, 'Tap W'), g2.toasts.map((t) => t.text).join(' | '));
}


// ---------------- 9. targeting: Tab, H, nav targets are the ports ----------------
{
  const g = fresh();
  const nts = Game.navTargets(g).filter((n) => n.kind === 'station');
  check('all three stations are nav targets', nts.map((n) => n.id).join() === 'station:hub,station:outpost,station:rusts', nts.map((n) => n.name).join(', '));
  const seen = [];
  for (let i = 0; i <= Game.navTargets(g).length; i++) { H.run(g, 1, { pressed: ['Tab'] }); seen.push(g.navId); }
  check('Tab cycles through the stations', ['station:hub', 'station:outpost', 'station:rusts'].every((id) => seen.includes(id)), seen.filter(Boolean).slice(-4).join(' '));
  g.navId = null;
  const ids = []; for (let i = 0; i < 4; i++) { H.run(g, 1, { pressed: ['KeyH'] }); ids.push(g.navId); }
  check('H targets the nearest station, then the next', ids.join() === 'station:hub,station:outpost,station:rusts,station:hub', ids.join(' '));
  const hub = Stations.byId(g, 'hub'), [hx, hy] = hub.state(g.t);
  g.navId = null; H.run(g, 1, { mouse: { x: hx + 2, y: hy - 3, px: 0.25, pressed: true, button: 0 } });
  check('clicking a station targets its dock', g.navId === 'station:hub', g.navId);
}


// ---------------- 10. rendezvous coaching ----------------
{
  const g = fresh('orbit'), hub = Stations.byId(g, 'hub'), fresh_ = (g) => { g.mod.stations.apk = null; };   // forget the last approach phase
  Game.circularAround(g, g.w.byId.mochi, 330, hub.facing(g.t) + Math.PI);
  g.everFlew = true; g.navId = 'station:hub'; Game.refresh(g); H.run(g, 1, {});
  check('below the station: burn prograde at the yellow marker', /prograde at the yellow marker to raise your orbit; watch the closest-approach diamond shrink/.test(Game.hint(g)), Game.hint(g));
  const g2 = fresh('belt'); g2.everFlew = true; g2.navId = 'station:hub'; Game.refresh(g2); H.run(g2, 1, {});
  check('above the station: burn retrograde', /retrograde at the pink marker to lower your orbit/.test(Game.hint(g2)), Game.hint(g2));
  coorbit(g, hub, -30, 2.5); g.navId = 'station:hub'; H.run(g, 1, {});
  check('near and fast: point the nose at the ⊗ BRAKE marker', /^Too fast: point the nose at the ⊗ BRAKE marker and burn until relative speed < \d m\/s/.test(Game.hint(g)), `${g.approach.vNow.toFixed(1)} m/s: ${Game.hint(g)}`);
  fresh_(g); nearPort(g, hub, 45, 3); H.run(g, 1, {});
  check('near, closing at a sane speed: coast, brake by 30 m', /^Closing at 3\.0 m\/s, 45 m to go\. Coast, then brake at the ⊗ BRAKE marker inside 30 m/.test(Game.hint(g)), Game.hint(g));
  fresh_(g); coorbit(g, hub, -60); H.run(g, 1, {});
  check('co-orbiting 60 m behind (rel v = n d): burn in, coast, brake', /^Burn toward the dock to close at about \d m\/s, coast, then brake at the ⊗ BRAKE marker/.test(Game.hint(g)), `${g.approach.vNow.toFixed(1)} m/s: ${Game.hint(g)}`);
  nearPort(g, hub, 6, 0.2); H.run(g, 1, {});
  check('in the zone: press F', /press F to dock/.test(Game.hint(g)), Game.hint(g));
  const rust = Stations.byId(g, 'rusts');
  g.navId = 'station:rusts'; nearPort(g, rust, 40, 1.0); H.run(g, 1, {});
  const own = (Game.mods.find((x) => x.id === 'stations').hint(g) || {}).text;          // the core's impact warning may outrank it here
  check('closing slower than 1.5 m/s: just coast in', /Closing at 1\.\d m\/s.*Coast in, then press F inside 14 m/.test(own), own);
  nearPort(g, rust, 20, 0.5); g.warpIdx = CONFIG.sim.warps.length - 1; H.run(g, 1, {});
  check('warp capped at 4x right by a station (2 radii)', g.warpMax === 4 && g.warpWhy === "near Rust's", `${g.warpMax}x: ${g.warpWhy}`);
  nearPort(g, rust, 100, 4); g.warpIdx = CONFIG.sim.warps.length - 1; H.run(g, 1, {});
  check('...and 100 m out closing at 4 m/s (there in 25 s)', g.warpMax === 4 && g.warpWhy === "near Rust's", `${g.warpMax}x: ${g.warpWhy}`);
  nearPort(g, rust, 120, 0); g.warpIdx = CONFIG.sim.warps.length - 1; H.run(g, 1, {});
  check('...but not 120 m out at rest', g.warpMax > 4, `${g.warpMax}x ${g.warpWhy}`);
  const gw = fresh('orbit'); let capped = 0;
  for (let i = 0; i < 300; i++) { gw.warpIdx = CONFIG.sim.warps.length - 1; H.run(gw, 1, {}); if (gw.warpMax <= 4) capped++; }
  check('low Mochi orbit 60 m under the hub: full warp all the way round', capped === 0, `${capped}/300 frames capped, t ${gw.t.toFixed(0)} s`);
  const g3 = fresh('orbit'); g3.everFlew = true; g3.navId = 'station:outpost'; Game.refresh(g3); H.run(g3, 1, {});
  check('Kiwi Outpost from Mochi orbit: head for Kiwi first', /Kiwi/.test(Game.hint(g3)) && /prograde/.test(Game.hint(g3)), Game.hint(g3));
}


// ---------------- 10b. wrong way round, too fast to stop, which way to take off, idle and cargo hints ----------------
{
  const mod = Game.mods.find((x) => x.id === 'stations'), own = (g) => mod.hint(g) || { pri: 0, text: '' };
  const g = fresh('orbit'), hub = Stations.byId(g, 'hub'), mochi = g.w.byId.mochi;
  Game.circularAround(g, mochi, 430, hub.facing(g.t) + Math.PI);
  const [, , mvx, mvy] = World.bodyState(g.w, mochi, g.t); g.sh.vx = 2 * mvx - g.sh.vx; g.sh.vy = 2 * mvy - g.sh.vy;   // flip it relative to Mochi (Mochi rides the belt)
  const oc = Physics.orbitRel(g.sh, mochi, g.t, g.w);
  check('the flipped orbit is circular and clockwise round Mochi', oc.h < 0 && oc.e < 0.01, `h ${oc.h.toFixed(0)}, e ${oc.e.toFixed(4)}`);
  g.everFlew = true; g.navId = 'station:hub'; Game.refresh(g); H.run(g, 1, {});
  check('clockwise orbit: "Wrong way round!" and how to flip it', /^Wrong way round! Mochi Hub goes counter-clockwise: burn at the pink marker/.test(own(g).text), own(g).text);   // (the core's range-rate rock alarm may outrank it)
  const g2 = fresh('orbit'); nearPort(g2, Stations.byId(g2, 'hub'), 70, 9.5); g2.navId = 'station:hub'; Game.refresh(g2); H.run(g2, 1, {});   // 70 m behind, catching up at 9.5 m/s
  check('a 9.5 m/s pass right by the port: "too fast to stop"', /^Pass in \d+ s at \d+ m\/s: too fast to stop\./.test(own(g2).text), own(g2).text);   // the core's rubble-ring heads-up (41) may outrank it
  const g3 = fresh('pad'); g3.navId = 'station:hub'; Game.refresh(g3); H.run(g3, 1, {});
  check('on the pad, hub targeted: tip the nose left (Mochi turns counter-clockwise)', /^Take off \(hold W\), tip the nose left with A and burn sideways: Mochi Hub goes counter-clockwise/.test(Game.hint(g3)), Game.hint(g3));
  const g4 = fresh(); H.run(g4, 2, {}); H.run(g4, 6, { keys: ['KeyW'] }); H.run(g4, 60 * 40, {});
  const before = own(g4).text; g4.done.land_mochi = g4.t; const after = own(g4).text;
  check('drifting by the hub before landing on Mochi: no "right here, dock" nag', /^Free flying!/.test(before) && !/right here/.test(before), before);
  check('...after the Mochi landing it may suggest docking again', /^Mochi Hub is right here: press H/.test(after), after);
  const g5 = fresh('pad'); Game.addCargo(g5, 'iron', 5); H.run(g5, 1, {});
  check('landed at the pad with ore: sell here, or at the hub for more (pri >= 35)', own(g5).pri >= 35 && /^Got ore! Press F here at the pad to sell/.test(Game.hint(g5)), `${own(g5).pri}: ${Game.hint(g5)}`);
  const g6 = fresh('pad'); Game.landAt(g6, g6.w.byId.mochi, Math.PI); Game.addCargo(g6, 'iron', 5); H.run(g6, 1, {});
  const quiet = own(g6).text; g6.done.mine = g6.t; H.run(g6, 1, {});
  check('landed away from the pad after the mining job: fly up to the hub to sell', !quiet && own(g6).pri >= 35 && /^Got ore! Fly up to Mochi Hub \(H targets it\) and dock to sell/.test(Game.hint(g6)),
        `before the job: "${quiet}"; after: ${Game.hint(g6)}`);
}


// ---------------- 11. save / load ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = fresh(), rust = Stations.byId(g, 'rusts');
  H.run(g, 2, {}); H.run(g, 1, { keys: ['KeyW'] });
  nearPort(g, rust, 5, 0.2); H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyF'] }); H.run(g, 150, {}); closeShop(g);
  Game.save(g);
  const raw = JSON.parse(store['pocket-orbit-v4']).mods.stations;
  const g2 = Game.create(7, null), m2 = g2.mod.stations;
  check('save round-trips visits, keeper lines, dock count', m2.visited.rusts && m2.met.hub && m2.met.rusts && m2.docks === g.mod.stations.docks && m2.line.hub === g.mod.stations.line.hub,
        JSON.stringify(raw));
  check('loaded game starts where you left it (docked at Rust\'s), undock job kept', Stations.dockedAt(g2) && Stations.dockedAt(g2).id === 'rusts' && g2.done.undock !== undefined,
        g2.status);
  Game.load && 0;
  const g3 = Game.create(7, null); Game.call(g3, Game.mods.find((x) => x.id === 'stations'), 'load', { visited: 'junk', met: { hub: 1, evil: 1 }, docks: NaN, line: { hub: -3 } });
  check('load shrugs off junk data', !g3.mod.stations.met.evil && g3.mod.stations.met.hub && Number.isFinite(g3.mod.stations.docks), JSON.stringify(g3.mod.stations.met));
  Game.wipeSave(); delete global.localStorage;
}


// ---------------- 12. art on a NaN-sniffing fake canvas ----------------
{
  const bad = [];
  let calls = 0;
  const ctx = new Proxy({ globalAlpha: 1, lineWidth: 1, lineDashOffset: 0, shadowBlur: 0 }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { calls++; if (a.some((v) => !Number.isFinite(v))) bad.push(k); return { addColorStop() {} }; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      return (...a) => { calls++; if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad.push(`${String(k)}(${a.join(',')})`); };
    },
    set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${String(k)}=${v}`); t[k] = v; return true; },
  });
  const cam = { x: 0, y: 0, zoom: 4, rot: 0, map: false, userZoom: 1 }, W = 1280, Hh = 760;
  const toScreen = (x, y) => [W / 2 + (x - cam.x) * cam.zoom, Hh / 2 - (y - cam.y) * cam.zoom];
  let right = 0;
  const kit = {
    ctx, W, H: Hh, cam, px: () => 1 / cam.zoom, toScreen, screenToWorld: (sx, sy) => [cam.x + (sx - W / 2) / cam.zoom, cam.y - (sy - Hh / 2) / cam.zoom],
    viewRect: (pad = 0) => [cam.x - W / 2 / cam.zoom - pad, cam.y - Hh / 2 / cam.zoom - pad, cam.x + W / 2 / cam.zoom + pad, cam.y + Hh / 2 / cam.zoom + pad],
    onScreen: (sx, sy, m = 30) => sx > -m && sx < W + m && sy > -m && sy < Hh + m, screenAng: (a) => -a,
    toonBlob: (out, cx, cy, R) => { if (![cx, cy, R].every(Number.isFinite)) bad.push('toonBlob'); }, tag: (x, y) => { if (!Number.isFinite(x + y)) bad.push('tag'); },
    outlinedText() {}, comicPanel: (x, y) => y + 32, row: (l, v, x, y) => { if (!Number.isFinite(x + y)) bad.push('row'); }, bar() {}, roundRect() {},
    stackLeft: () => 40, stackRight: (w, h) => { const y0 = right; right += h + 22; return y0 + 32; }, fit: (s) => s,
    fmtDist: (m) => `${m.toFixed(0)} m`, fmtT: (t) => `${t.toFixed(0)}s`, money: (n) => `$${n}`,
    INK: '#1b1433', PAPER: '#fff4dc', PAPER2: '#ffe2b0', COL: { good: '#33c27a', warn: '#ff9f1c', bad: '#e63946', tgt: '#7cf5d6', pro: '#ffd166', retro: '#ff8fab', dim: '#6d5f8a', money: '#2f9e5b' },
    LIGHT: [-0.55, 0.83], FONT: 'sans-serif',
  };
  const mod = Game.mods.find((x) => x.id === 'stations');
  const draw = (g) => { right = 0; for (const h of ['drawWorld', 'drawScreen', 'drawHUD']) mod[h](g, kit); };
  const g = fresh('orbit');
  let n = 0;
  for (const st of Stations.list(g)) for (const zoom of [0.05, 0.3, 0.9, 1.6, 4, 12, 40]) {
    [cam.x, cam.y] = st.state(g.t); cam.zoom = zoom;
    nearPort(g, st, 40, 2); draw(g);                                   // flying near: gauge + beckon chevrons
    nearPort(g, st, 5, 0.3); H.run(g, 1, { pressed: ['KeyF'] }); H.run(g, 3, {}); draw(g);   // tractor beam
    H.run(g, 150, {}); closeShop(g); draw(g); n += 3;                   // docked
  }
  g.navId = 'station:rusts'; cam.zoom = 4; [cam.x, cam.y] = [0, -2000]; nearPort(g, Stations.byId(g, 'hub'), 400, 0); draw(g);   // off-screen arrow
  check('art draws every station at every zoom, no NaN on the canvas', bad.length === 0 && calls > 1000, `${n} frames, ${calls} canvas calls${bad.length ? ', bad: ' + bad.slice(0, 4).join(' ') : ''}`);
}


// ---------------- 12b. reel-in edge cases, target cleanup, crossing-orbit hint ----------------
{
  const g = fresh('orbit'), hub = Stations.byId(g, 'hub');
  g.navId = 'station:hub';
  nearPort(g, hub, 12, 0.4); g.navId = 'station:hub'; H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyF'] }); H.run(g, 10, {});
  check('docking clears the nav target on that station', g.status === 'docked' && g.navId === null, `navId ${g.navId}`);
  const reeling = g.t < g.attach.t1;
  H.run(g, 1, { pressed: ['KeyF'] });
  const opened = g.ui === 'shop';
  closeShop(g); H.run(g, 400, {});
  check('F during the reel-in opens the shop once (no surprise reopen)', reeling && opened && !g.ui && onPort(g, hub) < 1e-9, `reeling ${reeling}, opened ${opened}, ui later ${g.ui}`);
  const g2 = fresh('orbit');
  const [, , mvx2, mvy2] = World.bodyState(g2.w, g2.w.byId.mochi, g2.t);             // 10 % faster than circular, relative to Mochi
  Object.assign(g2.sh, { vx: mvx2 + 1.1 * (g2.sh.vx - mvx2), vy: mvy2 + 1.1 * (g2.sh.vy - mvy2) }); g2.everFlew = true; g2.navId = 'station:hub'; Game.refresh(g2); H.run(g2, 1, {});
  const own2 = (Game.mods.find((x) => x.id === 'stations').hint(g2) || {}).text || '';           // the core's rubble-ring heads-up may outrank it
  check('eccentric orbit crossing the station: timing advice', /crosses Mochi Hub's/.test(own2) || (g2.approach.d < 60 && /Closest approach/.test(own2)), own2);
  const g3 = fresh('orbit'), hub3 = Stations.byId(g3, 'hub');
  coorbit(g3, hub3, -420 * 0.9); g3.navId = 'station:hub'; Game.refresh(g3); H.run(g3, 1, {});
  check('same circular orbit, station ahead: lower orbits are faster', /ahead\. Lower orbits are faster/.test(Game.hint(g3)), Game.hint(g3));
}


// ---------------- 12c. a careful pilot can dock from 60 m out (fine throttle, A/D, F) ----------------
{
  function pilot(id) {
    const g = fresh('orbit'), st = Stations.byId(g, id), t0 = g.t;
    coorbit(g, st, -60);
    while (g.t - t0 < 150 && g.status === 'flying') {
      const q = Stations.portInfo(g, st), p = q.p, dx = p[0] - g.sh.x, dy = p[1] - g.sh.y, d = Math.hypot(dx, dy);
      const vmax = Math.min(1, 0.05 * d + 0.2), evx = dx / d * vmax - (g.sh.vx - p[2]), evy = dy / d * vmax - (g.sh.vy - p[3]);
      const keys = [], pf = promptF(g), err = wrap(Math.atan2(evy, evx) - g.sh.ang), wOm = Math.max(-1.2, Math.min(1.2, 2.5 * err));
      if (Math.hypot(evx, evy) > 0.15) {
        if (wOm - g.sh.omega > 0.08) keys.push('KeyA'); else if (wOm - g.sh.omega < -0.08) keys.push('KeyD');
        if (Math.abs(err) < 0.3) keys.push('KeyW', 'ShiftLeft');
      } else if (Math.abs(g.sh.omega) > 0.05) keys.push('KeyS');
      Game.update(g, H.input({ keys, pressed: pf && /^Dock/.test(pf.text) ? ['KeyF'] : [] }), 1 / 30);
    }
    return [g, st, g.t - t0];
  }
  for (const id of ['hub', 'outpost', 'rusts']) {
    const [g, st, T] = pilot(id);
    check(`careful pilot docks at ${st.name} from 60 m out`, g.status === 'docked' && Stations.dockedAt(g) === st, `${g.status} after ${T.toFixed(0)} s, rcs left ${g.sh.rcs.toFixed(1)}`);
  }
}


// ---------------- 13. long docked + undocked run stays finite ----------------
{
  const g = fresh();
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 300, {});
  H.run(g, 30, { keys: ['KeyW'] });
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 600, {});
  const ok = ['x', 'y', 'vx', 'vy', 'ang'].every((k) => Number.isFinite(g.sh[k]));
  check('docked at 64x then flown off: state stays finite', ok && !g.err, `${g.status}, t ${g.t.toFixed(0)} s, warp ${g.warp}x`);
}


// ---------------- 13b. hint sweep: every station from every spawn, all one-liners ----------------
{
  for (const sp of ['orbit', 'belt', 'hub', 'outpost', 'rusts']) for (const id of ['hub', 'outpost', 'rusts']) {
    const g = fresh(sp); g.everFlew = true;
    if (g.status === 'docked') H.run(g, 1, { keys: ['KeyW'] });
    g.navId = 'station:' + id; Game.refresh(g); H.run(g, 2, {}); Game.hint(g);
  }
  const long = [...HINTS].filter((t) => t.length > 100);
  const old = [...HINTS].filter((t) => /TGT|teal X/.test(t));
  check('the hints say "⊗ BRAKE marker", never "TGT marker" or "teal X"', !old.length, old.join(' || '));
  check(`all ${HINTS.size} station hints fit on one line (<= 100 chars)`, HINTS.size > 15 && !long.length, long.join(' || ') || `longest: ${[...HINTS].sort((a, b) => b.length - a.length)[0]}`);
}


// ---------------- 14. solo child: no economy at all ----------------
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [__filename, '--solo'], { encoding: 'utf8' });
  process.stdout.write(r.stdout.split('\n').filter((l) => /PASS|FAIL/.test(l)).map((l) => l + '\n').join(''));
  check('without the economy, docking is a free refuel (child run)', r.status === 0, r.status ? r.stderr.slice(0, 300) : '');
  const r2 = spawnSync(process.execPath, [__filename, '--pad'], { encoding: 'utf8' });
  process.stdout.write(r2.stdout.split('\n').filter((l) => /PASS|FAIL/.test(l)).map((l) => l + '\n').join(''));
  check('with Mochi\'s town: undock window, pad target, landing by the pad (child run)', r2.status === 0, r2.status ? r2.stderr.slice(0, 300) : '');
}

console.log(`\n${nPass} passed, ${nFail} failed${MOCK ? '  (economy not built yet: Econ mocked)' : ''}`);
process.exit(nFail ? 1 : 0);
