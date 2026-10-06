// ======================================================================
//  EVA TESTS  —  stepping out (landed: on foot; flying or docked: on a
//  tether), walking stays on the ground (Mochi, Kiwi, Seed), riding a
//  moving rock, jump comes back down, Seed cannot be escaped, laser digs
//  ore into the pack, gems + scanner, board unloads the pack, air runs out
//  -> recall, the landed reel-in, laser zaps a target, ship death while
//  out, jobs, save/load, camera, NaN-free art, fuzz.  v4: the tether (never
//  past S.tetherLen, Q winches, honest momentum both ways), jets in screen
//  directions, rubble, sprint, dive roll i-frames, bombs (refill, escape
//  cap, recoil, crater, damage), topUp, the spacewalk and bomb jobs.
//    node tests/test_eva.js            (spawns the --solo and --haul runs too)
//    node tests/test_eva.js --solo     only: 'eva' (no other module at all)
//    node tests/test_eva.js --haul     eva + haul: lasering and blasting rubble
// ======================================================================

const H = require('./harness');
const MODE = process.argv[2] || '';
H.load({ only: MODE === '--solo' ? 'eva' : MODE === '--haul' ? 'eva,haul,evatest' : 'eva,evatest' });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = 'pad') => Game.create(7, spawn, { fresh: true });
const M = (g) => g.mod.eva;
const alt = (g) => Game.nearestBody(g, g.astro.x, g.astro.y).alt;
const local = (g, b) => { const [bx, by] = World.bodyState(g.w, b, g.t); return [g.astro.x - bx, g.astro.y - by]; };
const toastHas = (g, s) => g.toasts.some((t) => t.text.includes(s));
const finite = (...v) => v.every(Number.isFinite);
const evaMod = () => Game.mods.find((m) => m.id === 'eva');
const toShip = (g) => Math.hypot(g.astro.x - g.sh.x, g.astro.y - g.sh.y);
const relV = (g) => [g.astro.vx - g.sh.vx, g.astro.vy - g.sh.vy];
const shipKg = (g) => Physics.mass(g.sh, g.S) * 1000;
// suit gear straight from the shop's tier tables (econ is not loaded here)
const GEAR = {
  roll1: { roll: 1, rollDist: 3.0, rollT: 0.45, rollIframes: 0.30, rollCd: 1.2, rollAir: 0 },
  roll2: { roll: 2, rollDist: 4.5, rollT: 0.40, rollIframes: 0.35, rollCd: 0.8, rollAir: 3 },
  bomb1: { bombs: 2, bombDmg: 30, bombR: 1.8, bombDig: 1.6, bombE: 0.5e6, bombKg: 0.5, bombCd: 8, bombFuse: 1.8, bombV: 6, bombSticky: 0 },
  bomb2: { bombs: 3, bombDmg: 50, bombR: 2.4, bombDig: 2.3, bombE: 1.51e6, bombKg: 1, bombCd: 6, bombFuse: 1.6, bombV: 8, bombSticky: 0 },
  bomb3: { bombs: 4, bombDmg: 80, bombR: 3.2, bombDig: 3.4, bombE: 5.02e6, bombKg: 2, bombCd: 4.5, bombFuse: 1.4, bombV: 10, bombSticky: 1 },
  suit: [{}, { suitTier: 1, suitMass: 5 }, { suitTier: 2, suitMass: 20, suitArmor: 0.1 }, { suitTier: 3, suitMass: 60, suitArmor: 0.15, walkMult: 1.25, jumpMult: 1.2, fallSafe: 11 },
         { suitTier: 4, suitMass: 140, suitArmor: 0.25, walkMult: 1.4, jumpMult: 1.35, fallSafe: 15 }],
};
const gear = (g, ...sets) => { for (const s of sets) Object.assign(g.S, s); H.run(g, 1, {}); return g; };

// a test-only target the laser can zap (registered only because 'evatest' is in H.load's list)
const dummy = { on: false, x: 0, y: 0, r: 0.6, dmg: 0, kinds: new Set() };
const dummyAt = (g) => { if (!dummy.b) return [dummy.x, dummy.y]; const [bx, by] = World.bodyState(g.w, dummy.b, g.t); return [bx + dummy.x, by + dummy.y]; };
Game.register({ id: 'evatest', targets: (g) => (dummy.on ? [{ id: 'dummy', team: 'bug', x: dummyAt(g)[0], y: dummyAt(g)[1], r: dummy.r, name: 'dummy',
  hit: (g, d, kind) => { dummy.dmg += d; dummy.kinds.add(kind); } }] : []) });

// land on a body at polar angle th and step out
function outOn(bodyId, th) {
  const g = fresh('orbit'), b = g.w.byId[bodyId];
  Game.landAt(g, b, th); g.everFlew = true;
  H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyE'] }); H.run(g, 30, {});
  return g;
}
// coast in low Mochi orbit and step out on the tether
function walkOut() {
  const g = fresh('orbit');
  H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyE'] });
  return g;
}
const mouseAt = (x, y, down = true) => ({ x, y, sx: 400, sy: 300, px: 0.05, down, pressed: false, released: false, button: 0 });
// aim at a spot fixed on a body (local lx, ly): bodies ride rails now, so the world point moves every frame
const mouseOn = (g, b, lx, ly, down = true) => { const [bx, by] = World.bodyState(g.w, b, g.t); return mouseAt(bx + lx, by + ly, down); };
// a spot on the ground `ahead` metres along the surface from the astronaut (local coords on b)
function groundAhead(g, b, ahead) {
  const [lx, ly] = local(g, b), th = Math.atan2(ly, lx) - ahead / Math.hypot(lx, ly), r = World.surfaceR(b, th);
  return [r * Math.cos(th), r * Math.sin(th)];
}

if (MODE === '--solo') { solo(); finish(); }
if (MODE === '--haul') { haulRun(); finish(); }


// ---------------- 1. stepping out: landed -> on foot; flying or docked -> on a tether ----------------
{
  const g = fresh('orbit');
  H.run(g, 1, {});
  check('flying and coasting: you may step out (no prompt pill: the controls line says E)', EVA.canStepOut(g) && !g.prompts.some((p) => p.key === 'KeyE'), g.prompts.map((p) => p.text).join(','));
  H.run(g, 2, { keys: ['KeyW'] }); H.run(g, 1, { keys: ['KeyW'], pressed: ['KeyE'] });
  check('engine firing: no spacewalk, "CUT THE ENGINE FIRST"', g.mode === 'ship' && !g.astro.on && toastHas(g, 'CUT THE ENGINE'), g.toasts.map((t) => t.text).join(' | '));
  H.run(g, 5, {}); g.sh.omega = 1.2; H.run(g, 1, { pressed: ['KeyE'] });
  check('spinning: no spacewalk, "STOP SPINNING FIRST (S)"', g.mode === 'ship' && !g.astro.on && toastHas(g, 'STOP SPINNING'), g.toasts.map((t) => t.text).join(' | '));
  g.sh.omega = 0.3; H.run(g, 1, { pressed: ['KeyE'] });
  check('E while flying steps out on a tether', g.mode === 'eva' && g.astro.on && EVA.isOut(g) && EVA.isTethered(g), `${g.status} ${g.mode}`);
  const nb = Game.nearestBody(g, g.sh.x, g.sh.y), out = (g.astro.x - g.sh.x) * nb.ux + (g.astro.y - g.sh.y) * nb.uy;
  check('out of the hatch on the side away from the rock', out > g.S.radius && out < g.S.radius + 1.5, `${out.toFixed(2)} m up from the ship centre`);
  H.run(g, 300, {});
  check('the parked ship kills its spin and coasts (engine off)', Math.abs(g.sh.omega) < 0.02 && g.status === 'flying' && !g.fired.main, `ω ${g.sh.omega.toFixed(3)} rad/s`);
  g.warpIdx = CONFIG.sim.warps.length - 1; H.run(g, 2, {});
  const wl = Game.call(g, evaMod(), 'warpLimit');
  check('warp capped at 1x on a spacewalk', g.warp === 1 && wl.max === 1 && wl.why === 'spacewalk', `${g.warp}x (${g.warpWhy}; eva: ${wl.why})`);
  const cam = Game.first(g, 'camera'), mid = [(g.astro.x + g.sh.x) / 2, (g.astro.y + g.sh.y) / 2];
  check('camera: unrotated, framing you and the ship', cam && cam.rot === 0 && cam.zoom >= 3 && cam.zoom <= 32 && Math.hypot(cam.x - mid[0], cam.y - mid[1]) < 1,
        cam ? `zoom ${cam.zoom.toFixed(1)} px/m, ${Math.hypot(cam.x - mid[0], cam.y - mid[1]).toFixed(2)} m off the midpoint` : 'none');
  check('controls line switches to the spacewalk keys', (Game.first(g, 'controls') || '').startsWith('WASD jets · Q winch'), Game.first(g, 'controls'));
  check('hint teaches the spacewalk', Game.hint(g).includes('WASD') && Game.hint(g).includes('Q'), Game.hint(g));

  const d = fresh('orbit'), c = d.w.byId.mochi;
  Game.dock(d, { name: 'Test Port', ang: 0, state: (t) => {
    const [bx, by, bvx, bvy] = World.bodyState(d.w, c, t), r = 420, n = Math.sqrt(c.mu / r ** 3);
    return [bx + r * Math.cos(n * t), by + r * Math.sin(n * t), bvx - r * n * Math.sin(n * t), bvy + r * n * Math.cos(n * t)];
  } });
  H.run(d, 1, {});
  check('docked: the E prompt offers a tethered spacewalk', d.prompts.some((p) => p.key === 'KeyE' && p.text.startsWith('Spacewalk')), d.prompts.map((p) => p.text).join(','));
  H.run(d, 1, { pressed: ['KeyE'] }); H.run(d, 120, { keys: ['KeyD'] });
  check('docked: E steps out on a tether, the ship stays docked', d.status === 'docked' && EVA.isTethered(d) && toShip(d) > d.S.radius + 2, `${d.status}, ${toShip(d).toFixed(1)} m out`);

  const p = fresh('pad');
  H.run(p, 1, {});
  check('landed: E prompt says "Step outside"', p.prompts.some((x) => x.key === 'KeyE' && x.text === 'Step outside'), p.prompts.map((x) => x.text).join(','));
  H.run(p, 1, { pressed: ['KeyE'] });
  check('E steps out: mode eva, astronaut on, no tether', p.mode === 'eva' && p.astro.on && EVA.isOut(p) && !EVA.isTethered(p), `${p.mode}`);
  const dd = Math.hypot(p.astro.x - p.sh.x, p.astro.y - p.sh.y);
  H.run(p, 30, {});
  check('astronaut appears on the ground beside the ship', dd > p.S.radius && dd < p.S.radius + 3 && M(p).grounded && alt(p) < 1.2, `${dd.toFixed(2)} m from ship centre, alt ${alt(p).toFixed(2)}`);
  check('board prompt shows next to the ship', p.prompts.some((x) => x.key === 'KeyE' && x.text.startsWith('Board')), p.prompts.map((x) => x.text).join(','));
  p.warpIdx = CONFIG.sim.warps.length - 1; H.run(p, 2, {});
  check('warp capped at 1x on foot', p.warp === 1 && p.warpWhy === 'on foot', `${p.warp}x ${p.warpWhy}`);
  check('camera follows (~22 px/m), local up = screen up', (() => { const c2 = Game.first(p, 'camera'); return c2 && c2.zoom === EVA.ZOOM && Math.abs(c2.rot - (p.astro.ang - Math.PI / 2)) < 1e-9 && finite(c2.x, c2.y); })(), '');
  check('controls line switches to on-foot keys', (Game.first(p, 'controls') || '').startsWith('A/D walk'), '');
  check('mouse clicks are consumed on foot (no ship targeting)', Game.call(p, evaMod(), 'onMouse', { pressed: true }) === true, '');
}


// ---------------- 2. walking stays on the ground ----------------
function walkTest(bodyId, th, secs) {
  const g = outOn(bodyId, th), b = g.w.byId[bodyId], l0 = local(g, b);
  let ground = 0, maxAlt = 0, n = 0, maxV = 0, recalled = false;
  for (let i = 0; i < secs * 60; i++) {
    H.run(g, 1, { keys: [i % 1200 < 600 ? 'KeyD' : 'KeyA'] });
    if (!g.astro.on) { recalled = true; break; }
    const nb = Game.nearestBody(g, g.astro.x, g.astro.y), [ux, uy] = [nb.ux, nb.uy];
    const vt = Math.abs((g.astro.vx - nb.bvx) * uy - (g.astro.vy - nb.bvy) * ux);
    ground += M(g).grounded ? 1 : 0; maxAlt = Math.max(maxAlt, nb.alt); n++; maxV = Math.max(maxV, vt);
  }
  const l1 = local(g, b);
  return { g, b, frac: ground / Math.max(1, n), maxAlt, moved: Math.hypot(l1[0] - l0[0], l1[1] - l0[1]), maxV, recalled };
}
{
  const r = walkTest('mochi', Math.PI / 2, 30);
  check('Mochi: 30 s of walking stays on the ground', !r.recalled && r.frac > 0.97 && r.maxAlt < 1.6, `grounded ${(100 * r.frac).toFixed(1)}%, max alt ${r.maxAlt.toFixed(2)} m`);
  check('Mochi: walking actually covers ground (~3 m/s)', r.moved > 20 && r.maxV < 3.3, `net ${r.moved.toFixed(1)} m (walks out and back), top speed ${r.maxV.toFixed(2)} m/s`);
}
{
  const r = walkTest('kiwi', 1.0, 30);
  check('Kiwi: 30 s of walking stays on the ground', !r.recalled && r.frac > 0.95 && r.maxAlt < 1.8, `grounded ${(100 * r.frac).toFixed(1)}%, max alt ${r.maxAlt.toFixed(2)} m`);
  const g = outOn('kiwi', 2.0), b = g.w.byId.kiwi, l0 = local(g, b), [bx0, by0] = World.bodyState(g.w, b, g.t);
  H.run(g, 30 * 60, {});
  const l1 = local(g, b), [bx1, by1] = World.bodyState(g.w, b, g.t);
  check('Kiwi: standing still, you ride along with the moving rock', Math.hypot(l1[0] - l0[0], l1[1] - l0[1]) < 0.15 && Math.hypot(bx1 - bx0, by1 - by0) > 100,
        `drift ${Math.hypot(l1[0] - l0[0], l1[1] - l0[1]).toFixed(3)} m while Kiwi moved ${Math.hypot(bx1 - bx0, by1 - by0).toFixed(0)} m`);
}
{
  const r = walkTest('seed', 0.5, 20), vc = Math.sqrt(r.b.mu / r.b.R);
  check('Seed: walk speed capped at 0.6 x circular speed', r.maxV < 0.6 * Math.sqrt(r.b.mu / (r.b.R * (1 - r.b.shape))) + 0.05, `top ${r.maxV.toFixed(2)} m/s vs circular ${vc.toFixed(2)} m/s`);
  check('Seed: walking keeps you on the ground', !r.recalled && r.frac > 0.85 && r.maxAlt < 2.5, `grounded ${(100 * r.frac).toFixed(1)}%, max alt ${r.maxAlt.toFixed(2)} m`);
}


// walking never gets stuck on the 0.5 m dig grid: every rock, a few spots, both ways
{
  const slow = [];
  for (const id of ['mochi', 'kiwi', 'potato', 'dorito', 'glimmer', 'seed']) for (const th of [0.3, 2.5, 3.9]) for (const key of ['KeyA', 'KeyD']) {
    const g = outOn(id, th), b = g.w.byId[id];
    if (!g.astro.on) { slow.push(`${id}@${th} no EVA`); continue; }
    let dist = 0, last = null;
    for (let i = 0; i < 10 * 60; i++) {
      H.run(g, 1, { keys: [key] });
      const [lx, ly] = local(g, b), a = Math.atan2(ly, lx), r = Math.hypot(lx, ly);
      if (last != null) dist += Math.abs(Math.atan2(Math.sin(a - last), Math.cos(a - last))) * r;
      last = a;
    }
    const want = 10 * EVA.walkMax(g.S, b, b.R);
    if (dist < 0.75 * want) slow.push(`${id}@${th} ${key} ${dist.toFixed(1)}/${want.toFixed(0)} m`);
  }
  check('walking climbs grid ledges on every rock (no stalls)', slow.length === 0, slow.join(', ') || '36 walks at >= 75% of walk speed');
}


// ---------------- 3. jump comes back down; Seed cannot be escaped ----------------
{
  const g = outOn('mochi', Math.PI / 2), a0 = alt(g);
  H.run(g, 1, { pressed: ['KeyW'] });
  let maxA = 0, back = -1;
  for (let i = 0; i < 600; i++) { H.run(g, 1, {}); maxA = Math.max(maxA, alt(g) - a0); if (i > 10 && M(g).grounded && back < 0) back = i / 60; }
  check('Mochi: a jump goes up and comes back down', maxA > 1.5 && maxA < 4 && back > 1 && back < 5, `apex +${maxA.toFixed(2)} m, back down after ${back.toFixed(2)} s`);
  const j0 = M(g).jet;
  H.run(g, 1, { pressed: ['KeyW'], keys: ['KeyW'] }); H.run(g, 120, { keys: ['KeyW'] });
  check('Mochi: holding W after a jump lights the jetpack', M(g).jet < j0 - 1 && alt(g) - a0 > 3, `jet ${j0.toFixed(1)} -> ${M(g).jet.toFixed(1)} s, alt +${(alt(g) - a0).toFixed(1)} m`);
  H.run(g, 600, {});
  check('...and you land again (jet refills on the ground)', M(g).grounded && M(g).jet > 0, `jet ${M(g).jet.toFixed(2)} s`);
}
{
  const g = outOn('seed', 0.5), b = g.w.byId.seed;
  H.run(g, 1, { pressed: ['KeyW'] });
  let maxD = 0, back = -1;
  for (let i = 0; i < 60 * 40; i++) { H.run(g, 1, {}); const l = local(g, b); maxD = Math.max(maxD, Math.hypot(l[0], l[1])); if (i > 30 && M(g).grounded && back < 0) back = i / 60; }
  check('Seed: a jump floats and comes back (no escape)', back > 0 && maxD < b.hill * 0.8, `max ${maxD.toFixed(1)} m from Seed's centre (Hill ${b.hill.toFixed(1)} m), down after ${back.toFixed(1)} s`);

  // worst case: run, jump, hold the jetpack, steer sideways, for a full minute
  let maxD2 = 0, lost = 0;
  for (let i = 0; i < 60 * 60; i++) {
    const keys = ['KeyW', i % 600 < 300 ? 'KeyD' : 'KeyA'];
    H.run(g, 1, { keys, pressed: i % 90 === 0 ? ['KeyW'] : [] });
    if (!g.astro.on) break;
    const l = local(g, b); maxD2 = Math.max(maxD2, Math.hypot(l[0], l[1])); lost = Math.max(lost, M(g).lost);
  }
  check('Seed: a minute of jump + jetpack + steering stays bound', g.astro.on && maxD2 < b.hill * 0.85 && lost === 0, `max ${maxD2.toFixed(1)} m (Hill ${b.hill.toFixed(1)} m), governor kept you home`);
  H.run(g, 60 * 30, {});
  check('...and you drift back down to Seed', g.astro.on && M(g).grounded, `alt ${alt(g).toFixed(2)} m`);
}


// ---------------- 4. mining laser: digs a hole, ore ends up in the pack ----------------
function findOre(g, b, mat, dMin, dMax) {
  const T = Terrain.of(b), id = Terrain.MAT_ID[mat];
  for (let k = 0; k < 2000; k++) {
    const th = Math.PI / 2 + 0.6 + k * 0.0011, R = World.surfaceR(b, th);
    for (let dep = dMin; dep <= dMax; dep += 0.25) {
      const lx = (R - dep) * Math.cos(th), ly = (R - dep) * Math.sin(th);
      if (Terrain.mat(T, lx, ly) === id) return { th, dep, lx, ly };
    }
  }
  return null;
}
{
  const g0 = fresh('orbit'), c = g0.w.byId.mochi, ore = findOre(g0, c, 'ice', 1.0, 2.0);
  const r0 = World.surfaceR(c, ore.th), dth = (g0.S.radius + 1.6 + 2.5) / r0;
  const g = outOn('mochi', ore.th + dth), T = Terrain.of(g.w.byId.mochi);
  const pre = Terrain.mat(T, ore.lx, ore.ly);
  for (let i = 0; i < 25 * 60 && Terrain.mat(T, ore.lx, ore.ly) !== Terrain.DUG; i++) H.run(g, 1, { mouse: mouseOn(g, g.w.byId.mochi, ore.lx, ore.ly) });
  H.run(g, 120, { mouse: mouseOn(g, g.w.byId.mochi, ore.lx, ore.ly, false) });
  check('laser digs a hole toward the cursor', pre === Terrain.MAT_ID.ice && Terrain.mat(T, ore.lx, ore.ly) === Terrain.DUG, `${Terrain.MATS[pre].id} -> ${Terrain.MATS[Terrain.mat(T, ore.lx, ore.ly)].id}`);
  check('dug ice flies into the backpack', g.pack.ice >= 5 && M(g).hauled >= 5, `pack ${JSON.stringify(g.pack)}, hauled ${M(g).hauled} kg`);
  check('beam and hover info while aiming', M(g).aimDir && finite(...M(g).aimDir), '');

  // board: pack -> hold, air and jet refilled
  g.pack.iron = (g.pack.iron || 0) + 7; M(g).o2 = 12; M(g).jet = 0.3;
  const kg = Game.kgOf(g.pack), hold0 = Game.kgOf(g.cargo);
  Object.assign(g.astro, { x: g.sh.x + 5, y: g.sh.y });
  H.run(g, 2, {}); H.run(g, 1, { pressed: ['KeyE'] });
  check('boarding moves the pack into the hold', g.mode === 'ship' && !g.astro.on && Game.kgOf(g.pack) === 0 && Game.kgOf(g.cargo) === hold0 + kg && g.cargo.iron === 7, `hold ${JSON.stringify(g.cargo)}`);
  check('boarding refills air and jetpack', M(g).o2 === g.S.o2 && M(g).jet === g.S.jetFuel, `air ${M(g).o2} s, jet ${M(g).jet} s`);
  check('boarding toasts what moved', toastHas(g, 'UNLOADED'), g.toasts.map((t) => t.text).join(' | '));

  // full hold: leftovers stay in the pack
  H.run(g, 1, { pressed: ['KeyE'] }); H.run(g, 10, {});
  Game.addCargo(g, 'scrap', 1000); g.pack = { ice: 30 }; M(g).prevPack = { ...g.pack };
  const room = g.S.cargoCap - Game.kgOf(g.cargo);
  Object.assign(g.astro, { x: g.sh.x + 5, y: g.sh.y }); H.run(g, 2, {}); H.run(g, 1, { pressed: ['KeyE'] });
  check('full hold: leftovers stay in the pack', g.mode === 'ship' && Game.kgOf(g.cargo) === g.S.cargoCap && g.pack.ice === 30 - room && toastHas(g, 'STAYS IN YOUR PACK'), `hold room ${room} kg, pack ${JSON.stringify(g.pack)}`);
}
{
  const g0 = fresh('orbit'), c = g0.w.byId.mochi, ore = findOre(g0, c, 'iron', 1.0, 2.5);
  const g = outOn('mochi', ore.th + (g0.S.radius + 1.6 + 2) / World.surfaceR(c, ore.th));
  for (let i = 0; i < 30 * 60 && !g.pack.iron; i++) H.run(g, 1, { mouse: mouseOn(g, c, ore.lx, ore.ly) });
  check('iron (hardness 2.2) digs too, just slower', g.pack.iron > 0, `pack ${JSON.stringify(g.pack)} after ${(g.t).toFixed(0)} s`);
  check('beam impact star takes a CSS colour string', M(g).beam && typeof M(g).beam.col === 'string', M(g).beam && JSON.stringify(M(g).beam.col));
}


// ---------------- 5. gems: scanner, digging one out, the gem job ----------------
{
  const g = outOn('mochi', Math.PI / 2), c = g.w.byId.mochi, T = Terrain.of(c);
  const gm = T.gems.filter((x) => x.state === 'buried').sort((a, b) => (World.surfaceR(c, Math.atan2(a.ly, a.lx)) - Math.hypot(a.lx, a.ly)) - (World.surfaceR(c, Math.atan2(b.ly, b.lx)) - Math.hypot(b.lx, b.ly)))[0];
  const th = Math.atan2(gm.ly, gm.lx), depth = World.surfaceR(c, th) - Math.hypot(gm.lx, gm.ly);
  const far = T.gems.filter((x) => x !== gm && x.state === 'buried' && !x.seen);
  check('scanner (stock): far-away gems stay hidden', far.length > 5 && far.every((x) => !x.seen), `${far.length} unseen`);
  const g2 = outOn('mochi', th + (g.S.radius + 1.6 + 1.2) / World.surfaceR(c, th)), gm2 = Terrain.of(g2.w.byId.mochi).gems.find((x) => x.lx === gm.lx);
  H.run(g2, 30, {});
  const [al2x, al2y] = local(g2, c), dGem = Math.hypot(al2x - gm2.lx, al2y - gm2.ly);
  check('scanner (stock): a gem within ~4 m becomes seen', dGem < 4 ? gm2.seen : true, `gem ${gm2.type} ${depth.toFixed(1)} m deep, ${dGem.toFixed(1)} m away, seen ${gm2.seen}`);
  for (let i = 0; i < 40 * 60 && !(M(g2).gems > 0); i++) H.run(g2, 1, { mouse: mouseOn(g2, c, gm2.lx, gm2.ly) });
  check('laser frees the gem and it lands in the pack', gm2.state === 'taken' && g2.pack[gm2.type] === 1 && M(g2).gems === 1, `pack ${JSON.stringify(g2.pack)}`);
  H.run(g2, 2, {});
  check('gem job done ($150)', g2.done.gem !== undefined, `money $${g2.money}`);

  const g3 = outOn('mochi', Math.PI / 2);
  g3.S.scanner = 2; H.run(g3, 30, {});
  const T3 = Terrain.of(g3.w.byId.mochi);
  check('deep scanner (S.scanner 2): every buried gem on the rock is seen', T3.gems.filter((x) => x.state === 'buried').every((x) => x.seen), `${T3.gems.length} gems`);
  g3.S.scanner = 1;
  const g4 = outOn('kiwi', 1.0), Tk = Terrain.of(g4.w.byId.kiwi); g4.S.scanner = 1; H.run(g4, 30, {});
  const near = Tk.gems.filter((x) => { const [bx, by] = World.bodyState(g4.w, g4.w.byId.kiwi, g4.t); return Math.hypot(bx + x.lx - g4.astro.x, by + x.ly - g4.astro.y) < 24; });
  const farK = Tk.gems.filter((x) => { const [bx, by] = World.bodyState(g4.w, g4.w.byId.kiwi, g4.t); return Math.hypot(bx + x.lx - g4.astro.x, by + x.ly - g4.astro.y) > 26; });
  check('gem pinger (S.scanner 1): 25 m reach', near.every((x) => x.seen) && farK.every((x) => !x.seen), `${near.length} near seen, ${farK.length} far hidden`);
}


// ---------------- 6. the mine job ----------------
{
  const g = outOn('mochi', Math.PI / 2), $0 = g.money;
  g.pack = { ice: 25 }; H.run(g, 2, {});
  check('mine job waits for 40 kg', g.done.mine === undefined && M(g).hauled === 25, `hauled ${M(g).hauled} kg`);
  g.pack.iron = 15; H.run(g, 2, {});
  check('mine job pays at 40 kg hauled ($75)', g.done.mine !== undefined && g.money === $0 + 75, `hauled ${M(g).hauled} kg, $${$0} -> $${g.money}`);
}


// ---------------- 7. suit: air runs out -> HP drains -> emergency recall ----------------
{
  const g = outOn('mochi', Math.PI / 2);
  g.pack = { iron: 12 }; M(g).o2 = 31; H.run(g, 120, {});
  check('air warning toast under 30 s', toastHas(g, 'AIR LOW'), g.toasts.map((t) => t.text).join(' | '));
  check('air-low hint', Game.hint(g).includes('Air low'), Game.hint(g));
  let t = 0;
  while (g.astro.on && t < 60 * 60) { H.run(g, 1, {}); t++; }
  check('at 0 air the suit fails and you are recalled', g.mode === 'ship' && !g.astro.on && t / 60 > 29 && t / 60 < 50, `after ${(t / 60).toFixed(1)} s`);
  check('emergency recall: pack lost, suit at half', Game.kgOf(g.pack) === 0 && !g.cargo.iron && Math.abs(g.astro.hp - g.astro.hpMax * 0.5) < 1 && toastHas(g, 'EMERGENCY'), `hp ${g.astro.hp.toFixed(0)}`);
  const hp0 = g.astro.hp; H.run(g, 600, {});
  check('suit patches itself up aboard', g.astro.hp > hp0 + 15, `${hp0.toFixed(0)} -> ${g.astro.hp.toFixed(0)}`);
  H.run(g, 1, { pressed: ['KeyE'] }); H.run(g, 5, {});
  check('stepping out again: full air', g.astro.on && M(g).o2 > g.S.o2 - 1, `${M(g).o2.toFixed(0)} s`);
  Game.hurtAstro(g, 1000, 'CHOMP!'); H.run(g, 2, {});
  check('suit HP 0 from damage -> recall', g.mode === 'ship' && !g.astro.on, g.mode);
}


// ---------------- 8. on foot (no tether): too far from the ship -> warning -> the suit reel pulls you home (pack kept) ----------------
{
  const g = outOn('mochi', Math.PI / 2), c = g.w.byId.mochi, th = Math.PI / 2 - 165 / 300;
  const r = World.surfaceR(c, th) + 1.2, onMochi = (g) => { const [bx, by, bvx, bvy] = World.bodyState(g.w, c, g.t); return { x: bx + r * Math.cos(th), y: by + r * Math.sin(th), vx: bvx, vy: bvy }; };
  Object.assign(g.astro, onMochi(g));
  g.pack = { ice: 10 }; H.run(g, 60, {});
  check('far from the ship: warning + countdown', M(g).lost > 0 && toastHas(g, 'TETHER') && Game.hint(g).includes('Tether'), Game.hint(g));
  H.run(g, 6 * 60, {});
  check('tether recall: back in the ship, pack kept in the hold', g.mode === 'ship' && g.cargo.ice === 10 && toastHas(g, 'TETHER RECALL'), JSON.stringify(g.cargo));
  check('recall drops the stale "turn back" nag from the toast queue', !g.toasts.some((t) => t.key === 'evaTether' || t.key === 'evaO2'), g.toasts.map((t) => t.text).join(' | '));

  // HP hits 0 on the very frame the tether would reel you in: the suit failure wins, nothing left at 0 HP
  const g2 = outOn('mochi', Math.PI / 2);
  Object.assign(g2.astro, onMochi(g2));
  g2.pack = { ice: 10 }; H.run(g2, 2, {});
  Object.assign(M(g2), { lost: 5.999, o2: 0 }); g2.astro.hp = 0.01; H.run(g2, 1, {});
  check('suit failure beats a same-frame tether recall', g2.mode === 'ship' && Game.kgOf(g2.pack) === 0 && !g2.cargo.ice && g2.astro.hp > 0 && toastHas(g2, 'EMERGENCY'), `hp ${g2.astro.hp.toFixed(1)}, cargo ${JSON.stringify(g2.cargo)}`);
}


// ---------------- 9. laser zaps a target ----------------
{
  const g = outOn('mochi', Math.PI / 2), [ux, uy] = [Math.cos(g.astro.ang), Math.sin(g.astro.ang)];
  const c = g.w.byId.mochi, [ax, ay] = local(g, c);
  Object.assign(dummy, { on: true, b: c, x: ax + uy * 4 + ux * 0.2, y: ay - ux * 4 + uy * 0.2, dmg: 0 });   // sits on Mochi (local coords)
  for (let i = 0; i < 60; i++) H.run(g, 1, { mouse: mouseOn(g, c, dummy.x, dummy.y) });
  check('laser damages a target (~laserDps)', Math.abs(dummy.dmg - g.S.laserDps) < g.S.laserDps * 0.25 && dummy.kinds.has('laser'), `${dummy.dmg.toFixed(1)} dmg in 1 s (dps ${g.S.laserDps})`);
  const h0 = g.sh.hull;
  dummy.on = false;
  H.run(g, 60, { mouse: mouseAt(g.sh.x, g.sh.y) });
  check('laser never hurts your own ship', g.sh.hull === h0, `hull ${g.sh.hull}`);
}


// ---------------- 10. ship wrecked while you are out ----------------
{
  const g = outOn('mochi', Math.PI / 2);
  g.pack = { ice: 5 };
  Game.die(g, 'test: hit by a meteor'); H.run(g, 10, {});
  check('ship dies: astronaut stays out, toast, no board prompt', g.astro.on && g.mode === 'eva' && toastHas(g, 'WRECKED') && !g.prompts.some((p) => p.key === 'KeyE'), g.prompts.map((p) => p.text).join(','));
  H.run(g, 1, { pressed: ['KeyR'] });
  check('R tows you home: fresh ship, back in it', g.status !== 'dead' && g.mode === 'ship' && !g.astro.on && Game.kgOf(g.pack) === 0, `${g.status} ${g.mode}`);
  const g2 = outOn('mochi', Math.PI / 2);
  Game.die(g2, 'test'); g2.astro.hp = 0; H.run(g2, 2, {});
  check('suit fails with the ship wrecked -> tow', g2.status !== 'dead' && g2.mode === 'ship' && !g2.astro.on, `${g2.status} ${g2.mode}`);
  const g3 = outOn('mochi', Math.PI / 2);
  H.run(g3, 1, { pressed: ['KeyR'] }); H.run(g3, 1, { pressed: ['KeyR'] });
  check('R R tow while on foot resets cleanly', g3.mode === 'ship' && !g3.astro.on && Game.first(g3, 'camera') === null && M(g3).beam === null, `${g3.status}`);
}


// ---------------- 11. save / load ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = outOn('mochi', Math.PI / 2);
  g.pack = { ice: 15, salt: 1 }; H.run(g, 2, {});
  Game.save(g);
  const g2 = Game.create(7, 'pad');
  check('save round-trips hauled kg and gems found', M(g2).hauled === 15 && M(g2).gems === 1, JSON.stringify(Game.call(g2, evaMod(), 'save')));
  check('a pack saved mid-walk lands in the hold on load', g2.mode === 'ship' && g2.cargo.ice === 15 && g2.cargo.salt === 1 && Game.kgOf(g2.pack) === 0, JSON.stringify(g2.cargo));
  const g3 = Game.create(7, 'pad');
  Game.call(g3, evaMod(), 'load', { hauled: NaN, gems: 'lots', outs: -4 });
  check('load shrugs off junk', M(g3).hauled === 0 && M(g3).gems === 0 && M(g3).outs === 0, '');
  Game.wipeSave(); delete global.localStorage;
}


// ---------------- 12. art on a NaN-sniffing fake canvas ----------------
{
  const bad = [];
  let calls = 0;
  const ctx = new Proxy({ globalAlpha: 1, lineWidth: 1, lineDashOffset: 0 }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { calls++; if (a.some((v) => !Number.isFinite(v))) bad.push(k); return { addColorStop() {} }; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      return (...a) => { calls++; if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad.push(`${String(k)}(${a.join(',')})`); };
    },
    set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${String(k)}=${v}`); t[k] = v; return true; },
  });
  const cam = { x: 0, y: 0, zoom: 22, rot: 0, map: false, userZoom: 1 }, W = 1280, Hh = 760;
  const kit = {
    ctx, W, H: Hh, cam, px: () => 1 / cam.zoom, toScreen: (x, y) => [W / 2 + (x - cam.x) * cam.zoom, Hh / 2 - (y - cam.y) * cam.zoom],
    onScreen: (sx, sy, m = 30) => sx > -m && sx < W + m && sy > -m && sy < Hh + m, screenAng: (a) => -a,
    tag: (x, y) => { if (!Number.isFinite(x + y)) bad.push('tag'); }, outlinedText: (s, x, y) => { if (!Number.isFinite(x + y)) bad.push('text'); },
    bar: (l, f, x, y) => { if (!Number.isFinite(f + x + y)) bad.push(`bar ${l} ${f}`); }, stackLeft: () => 40, fit: (s) => s,
    fmtDist: (m) => `${m.toFixed(0)} m`, INK: '#1b1433', COL: { good: '#33c27a', warn: '#ff9f1c', bad: '#e63946', tgt: '#7cf5d6', dim: '#6d5f8a' },
    LIGHT: [-0.55, 0.83], FONT: 'sans-serif',
  };
  const mod = Game.mods.find((x) => x.id === 'eva');
  const draw = (g) => { [cam.x, cam.y] = [g.astro.x, g.astro.y]; for (const h of ['drawWorld', 'drawWorldTop', 'drawScreen', 'drawHUD']) mod[h](g, kit); };
  let frames = 0;
  for (const id of ['mochi', 'kiwi', 'seed', 'glimmer']) {
    const g = outOn(id, 1.3), [bx, by] = World.bodyState(g.w, g.w.byId[id], g.t);
    for (const zoom of [0.3, 4, 22, 80]) {
      cam.zoom = zoom;
      draw(g);
      H.run(g, 20, { keys: ['KeyD'], mouse: mouseAt(bx, by) }); draw(g);                       // walking, firing into the ground
      H.run(g, 1, { pressed: ['KeyW'], keys: ['KeyW'] }); H.run(g, 30, { keys: ['KeyW', 'KeyA'] }); draw(g);   // jetpack
      M(g).o2 = 0; g.astro.hp = 20; M(g).lost = 2; M(g).lostWhy = 'far'; draw(g);              // every warning at once
      M(g).o2 = g.S.o2; g.astro.hp = g.astro.hpMax; M(g).lost = 0;
      cam.x += 900; mod.drawScreen(g, kit);                                                     // ship off-screen: arrow
      frames += 5;
    }
  }
  check('art draws at every zoom on every rock, no NaN on the canvas', bad.length === 0 && calls > 2000, `${frames} frames, ${calls} canvas calls${bad.length ? ', bad: ' + bad.slice(0, 4).join(' ') : ''}`);
}


// ---------------- 13. fuzz: random inputs on every rock, nothing breaks ----------------
{
  let rand = 12345; const rnd = () => { rand = (rand * 1103515245 + 12345) & 0x7fffffff; return rand / 0x7fffffff; };
  const keysAll = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'];
  let worst = '', ok = true;
  for (const id of ['mochi', 'dorito', 'kiwi', 'seed', 'potato', 'glimmer']) {
    const g = outOn(id, 0.3 + rnd() * 6), b = g.w.byId[id];
    let maxD = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const keys = keysAll.filter(() => rnd() < 0.35), pressed = rnd() < 0.05 ? ['KeyW'] : [];
      const [bx, by] = World.bodyState(g.w, b, g.t);
      H.run(g, 1, { keys, pressed, mouse: mouseAt(bx + (rnd() - 0.5) * 2 * b.R, by + (rnd() - 0.5) * 2 * b.R, rnd() < 0.5) });
      if (!g.astro.on) { H.run(g, 1, { pressed: ['KeyE'] }); continue; }
      const A = g.astro;
      if (![A.x, A.y, A.vx, A.vy, A.hp, M(g).o2, M(g).jet].every(Number.isFinite)) { ok = false; worst = `${id}: NaN at frame ${i}`; break; }
      maxD = Math.max(maxD, Math.hypot(A.x - bx, A.y - by) - b.R * (1 + b.shape));
    }
    worst += ` ${id} ${maxD.toFixed(0)}m`;
    if (maxD > EVA.reach(b) - b.R * (1 - b.shape) + 10) ok = false;
  }
  check('fuzz: a minute of mashing on every rock, finite and bound', ok, `max height above the tallest point:${worst}`);
}


// ---------------- 14. the tether: honest masses, never past S.tetherLen, Q winches, boarding shares momentum ----------------
{
  const g = walkOut(), len = g.S.tetherLen ?? 30;
  let v0 = relV(g); H.run(g, 30, { keys: ['KeyD'] }); let v1 = relV(g);
  check('D jets you screen-right (+x: the camera does not rotate out here)', v1[0] - v0[0] > 1.2 && Math.abs(v1[1] - v0[1]) < 0.15, `Δv (${(v1[0] - v0[0]).toFixed(2)}, ${(v1[1] - v0[1]).toFixed(2)}) m/s`);
  v0 = relV(g); H.run(g, 30, { keys: ['KeyW'] }); v1 = relV(g);
  check('W jets you screen-up (+y)', v1[1] - v0[1] > 1.2 && Math.abs(v1[0] - v0[0]) < 0.15, `Δv (${(v1[0] - v0[0]).toFixed(2)}, ${(v1[1] - v0[1]).toFixed(2)}) m/s`);
  let maxD = 0, taut = 0;
  for (let i = 0; i < 25 * 60; i++) { H.run(g, 1, { keys: i < 200 ? ['KeyD', 'KeyW'] : [] }); maxD = Math.max(maxD, toShip(g)); taut += M(g).J > 0 ? 1 : 0; }
  check('the line never stretches past S.tetherLen (+5 cm)', maxD <= len + 0.05 && maxD > len - 0.5 && taut > 0, `max ${maxD.toFixed(3)} m on a ${len} m line, taut ${taut} frames`);
  check('the hint keeps teaching the winch (Q)', Game.hint(g).includes('Q'), Game.hint(g));
  let t = 0;
  while (toShip(g) - g.S.radius > EVA.BOARD_R - 0.3 && t < 90 * 60) { H.run(g, 1, { keys: ['KeyQ'] }); t++; }
  check('Q winches you in to within BOARD_R of the hull', toShip(g) - g.S.radius < EVA.BOARD_R && t / 60 < len / (g.S.reelA ?? 1) + 15, `${(t / 60).toFixed(1)} s at ${g.S.reelA ?? 1} m/s`);
  H.run(g, 120, { keys: ['KeyQ'] });
  check('the winch stops at the hull (no slamming into it)', toShip(g) > g.S.radius + 0.4 && Math.hypot(...relV(g)) < 0.6, `${(toShip(g) - g.S.radius).toFixed(2)} m off the hull, ${Math.hypot(...relV(g)).toFixed(2)} m/s`);
  g.pack = { ice: 4 };
  g.astro.vx = g.sh.vx + 2; g.astro.vy = g.sh.vy - 1;
  const mA = EVA.astroMass(g), mS = shipKg(g), vA = [g.astro.vx, g.astro.vy], vS = [g.sh.vx, g.sh.vy];
  const ok = EVA.board(g), want = [vS[0] + mA * (vA[0] - vS[0]) / (mS + mA), vS[1] + mA * (vA[1] - vS[1]) / (mS + mA)];
  check('boarding transfers momentum: Δv = m_A(v_A − v_S)/(m_S + m_A)', ok && g.mode === 'ship' && Math.hypot(g.sh.vx - want[0], g.sh.vy - want[1]) < 1e-9 && g.cargo.ice === 4,
        `Δv ${(g.sh.vx - vS[0]).toFixed(4)}, ${(g.sh.vy - vS[1]).toFixed(4)} m/s (m_A ${mA} kg, m_S ${mS.toFixed(0)} kg)`);
}
// the line snapping taut: equal and opposite, momentum conserved (twin runs, one with a line too long to bite)
{
  const twin = (len) => {
    const g = walkOut(), A = g.astro, sh = g.sh;
    g.S.tetherLen = len; H.run(g, 1, {});
    Object.assign(A, { x: sh.x + 29, y: sh.y + 2, vx: sh.vx + 3, vy: sh.vy });
    H.run(g, 90, {});
    return g;
  };
  const a = twin(30), b = twin(1e4), mA = EVA.astroMass(a), mS = shipKg(a);
  const dA = [a.astro.vx - b.astro.vx, a.astro.vy - b.astro.vy], dS = [a.sh.vx - b.sh.vx, a.sh.vy - b.sh.vy];
  const dp = Math.hypot(mA * dA[0] + mS * dS[0], mA * dA[1] + mS * dS[1]), jA = mA * Math.hypot(...dA);
  check('a yank on the line: momentum conserved, the ship gets tugged', jA > mA * 2 && dp < 0.01 * jA && Math.hypot(...dS) > 0.05,
        `astronaut ${Math.hypot(...dA).toFixed(2)} m/s, ship ${Math.hypot(...dS).toFixed(3)} m/s, |Δp| ${dp.toFixed(2)} of ${jA.toFixed(0)} kg m/s`);
  check('a yank never breaks the line, distance <= length', toShip(a) <= 30.05, `${toShip(a).toFixed(2)} m`);
}
// spacewalk job, air out -> auto-reel, collision warning, the ship lost while you are out
{
  const g = walkOut(), $0 = g.money;
  H.run(g, 9 * 60, {});
  check('spacewalk job waits for 10 s outside', g.done.spacewalk === undefined, `${M(g).tethT.toFixed(1)} s`);
  H.run(g, 75, {});
  check('spacewalk job pays after a 10 s tethered EVA ($100)', g.done.spacewalk !== undefined && g.money >= $0 + 100, `$${$0} -> $${g.money}`);
  M(g).o2 = 0.01; H.run(g, 2, {});
  check('air out on the line: "O2 OUT: AUTO-REEL"', toastHas(g, 'O2 OUT: AUTO-REEL') && M(g).ctl.reel && Game.hint(g).includes('Out of air'), Game.hint(g));
  const g2 = walkOut(), nb = Game.nearestBody(g2, g2.sh.x, g2.sh.y);
  g2.sh.vx = nb.bvx - nb.ux * 12; g2.sh.vy = nb.bvy - nb.uy * 12; g2.astro.vx = g2.sh.vx; g2.astro.vy = g2.sh.vy;
  H.run(g2, 30, {});
  check('the parked ship on a collision course warns you', toastHas(g2, 'SHIP ON COLLISION COURSE') && Game.hint(g2).includes('hits'), Game.hint(g2));
  let t = 0; while (g2.status !== 'dead' && t < 60 * 60) { H.run(g2, 1, {}); t++; }
  H.run(g2, 2, {});
  check('ship lost: the tether is cut, you stay out, no board prompt', g2.status === 'dead' && g2.astro.on && !EVA.isTethered(g2) && toastHas(g2, 'WRECKED') && !g2.prompts.some((p) => p.key === 'KeyE'), `${g2.status} out ${g2.astro.on}`);
  H.run(g2, 1, { pressed: ['KeyR'] });
  check('R tows you home from a lost spacewalk', g2.status !== 'dead' && g2.mode === 'ship' && !g2.astro.on, `${g2.status} ${g2.mode}`);
}
// rubble: bounce off a rail rock, a hard hit hurts
{
  const g = walkOut(), A = g.astro;
  g.S.tetherLen = 1e6; H.run(g, 1, {});
  const rk = g.w.rocks.find((r) => r.r > 1.5 && !r.gone && r.host.id === 'mochi') || g.w.rocks.find((r) => r.r > 1.5);
  let [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t);
  Object.assign(A, { x: rx - rk.r - 2.5, y: ry, vx: rvx + 6, vy: rvy });
  const hp0 = A.hp;
  H.run(g, 40, {});
  [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t);
  const vn = ((A.vx - rvx) * (A.x - rx) + (A.vy - rvy) * (A.y - ry)) / Math.hypot(A.x - rx, A.y - ry);
  check('rubble: you bounce off a rock (restitution ~0.3)', vn > 1 && vn < 2.6 && Math.hypot(A.x - rx, A.y - ry) > rk.r * 0.9, `rebound ${vn.toFixed(2)} m/s off a ${rk.r.toFixed(1)} m rock`);
  check('...and a 6 m/s hit hurts (min(40, 6 v) HP)', hp0 - A.hp > 25 && hp0 - A.hp <= 40, `${(hp0 - A.hp).toFixed(1)} HP`);
}


// ---------------- 15. suit gear: sprint, dive roll ----------------
{
  const g = outOn('mochi', Math.PI / 2), b = g.w.byId.mochi;
  gear(g, { sprint: 1.6 });
  let maxV = 0; const o0 = M(g).o2;
  for (let i = 0; i < 180; i++) {
    H.run(g, 1, { keys: ['KeyD', 'ShiftLeft'] });
    const nb = Game.nearestBody(g, g.astro.x, g.astro.y);
    maxV = Math.max(maxV, Math.abs((g.astro.vx - nb.bvx) * nb.uy - (g.astro.vy - nb.bvy) * nb.ux));
  }
  check('sprint (Shift): 1.6x walk speed', maxV > 0.9 * 1.6 * g.S.walk && maxV < 1.6 * g.S.walk + 0.1 && M(g).sprinting, `top ${maxV.toFixed(2)} m/s (walk ${g.S.walk})`);
  check('sprinting breathes 1.5x faster', Math.abs(o0 - M(g).o2 - 1.5 * 3) < 0.3, `${(o0 - M(g).o2).toFixed(2)} s of air in 3 s`);
  const s = outOn('seed', 0.5), sb = s.w.byId.seed; gear(s, { sprint: 2.2 });
  let sv = 0;
  for (let i = 0; i < 240; i++) { H.run(s, 1, { keys: ['KeyD', 'ShiftLeft'] }); const nb = Game.nearestBody(s, s.astro.x, s.astro.y); sv = Math.max(sv, Math.abs((s.astro.vx - nb.bvx) * nb.uy - (s.astro.vy - nb.bvy) * nb.ux)); }
  check('Seed: sprint still capped at 0.6 x circular speed', sv < 0.6 * Math.sqrt(sb.mu / (sb.R * (1 - sb.shape))) + 0.05 && s.astro.on, `top ${sv.toFixed(2)} m/s`);
}
{
  const g = outOn('mochi', Math.PI / 2), b = g.w.byId.mochi;
  H.run(g, 1, { pressed: ['KeyC'] });
  check('no roll gear: C just tells you where to get it', M(g).roll === null && toastHas(g, 'TUMBLE PADS'), '');
  gear(g, GEAR.roll1); H.run(g, 30, {});
  const l0 = local(g, b), hp0 = g.astro.hp;
  H.run(g, 1, { pressed: ['KeyC'] });
  Game.hurtAstro(g, 25, 'CHOMP!');
  check('dive roll: i-frames block a bite', g.astro.hp === hp0 && g.astro.invUntil > g.t, `hp ${g.astro.hp}, i-frames left ${(g.astro.invUntil - g.t).toFixed(2)} s`);
  H.run(g, 1, { pressed: ['KeyC'] });
  check('roll cooldown: a second C does nothing yet', M(g).stats.rolls === 1, `${M(g).stats.rolls} rolls`);
  H.run(g, 30, {});
  const l1 = local(g, b), moved = Math.hypot(l1[0] - l0[0], l1[1] - l0[1]);
  check('a roll covers ~rollDist along the ground', moved > 2.2 && moved < 4.5 && M(g).grounded, `${moved.toFixed(2)} m (rollDist 3)`);
  Game.hurtAstro(g, 25, 'CHOMP!');
  check('after the i-frames, bites land again', g.astro.hp < hp0, `hp ${g.astro.hp.toFixed(0)}`);
  H.run(g, 50, {}); H.run(g, 1, { pressed: ['KeyC'] });
  check('...and the roll is back after rollCd', M(g).stats.rolls === 2, `${M(g).stats.rolls} rolls`);

  const s = walkOut(); gear(s, GEAR.roll2); H.run(s, 10, {});
  const v0 = relV(s), j0 = M(s).jet;
  H.run(s, 1, { pressed: ['KeyC'], keys: ['KeyD'] });
  const v1 = relV(s);
  check('Gyro roll in open space: a 3 m/s dash paid from the jetpack', Math.abs(v1[0] - v0[0] - 3) < 0.15 && Math.abs(j0 - M(s).jet - 3 / s.S.jet) < 0.05, `Δv ${(v1[0] - v0[0]).toFixed(2)} m/s, jet ${j0.toFixed(2)} -> ${M(s).jet.toFixed(2)} s`);
}


// ---------------- 16. bombs: charges, escape cap, recoil, a crater, damage, the bomb job ----------------
{
  const g = outOn('mochi', Math.PI / 2), b = g.w.byId.mochi, $0 = g.money;
  H.run(g, 1, { pressed: ['KeyB'] });
  check('no bombs bought: B tells you where to get them', M(g).live.length === 0 && toastHas(g, 'POP ROCKS'), '');
  gear(g, GEAR.bomb1);
  check('bombs: charges full when bought', M(g).bombsN === 2, `${M(g).bombsN}`);
  const [tx, ty] = groundAhead(g, b, 5), aim = () => mouseOn(g, b, tx, ty, false);
  H.run(g, 1, { pressed: ['KeyB'], mouse: aim() });
  check('B throws a bomb at the cursor', M(g).live.length === 1 && M(g).bombsN === 1, `${M(g).live.length} live, ${M(g).bombsN} left`);
  H.run(g, 1, { pressed: ['KeyB'], mouse: aim() }); H.run(g, 1, { pressed: ['KeyB'], mouse: aim() });
  check('two charges, then RECHARGING', M(g).live.length === 2 && M(g).bombsN === 0, `${M(g).live.length} live`);
  let t = 0; while (M(g).live.length && t < 600) { H.run(g, 1, { mouse: aim() }); t++; }
  check('the fuse runs ~1.8 s', t / 60 > 1.6 && t / 60 < 1.9, `${(t / 60).toFixed(2)} s`);
  let since = t + 2;                                                                    // frames since the first throw
  const runTo = (sec) => { const n = Math.round(sec * 60) - since; if (n > 0) { H.run(g, n, { mouse: aim() }); since += n; } };
  check('a bomb digs a crater (>= 1 cell)', M(g).bombCells > 0, `${M(g).bombCells} cells`);
  check('bomb job pays ($150)', g.done.bomb !== undefined && g.money >= $0 + 150, `$${$0} -> $${g.money}`);
  runTo(8.25); const n1 = M(g).bombsN;
  runTo(15.75); const n2 = M(g).bombsN;
  runTo(16.25);
  check('charges refill one at a time (one per bombCd)', n1 === 1 && n2 === 1 && M(g).bombsN === 2, `${n1} after ~8 s, ${n2} at ~15 s, ${M(g).bombsN} after 16 s`);

  // blast damage to a target, sticking around the crater
  H.run(g, 1, { pressed: ['KeyB'], mouse: aim() });
  while (M(g).live.length && M(g).live[0].fuse > 0.2) H.run(g, 1, { mouse: aim() });
  const bm = M(g).live[0], [bx, by] = World.bodyState(g.w, b, g.t);
  Object.assign(dummy, { on: true, b, x: bm.x - bx, y: bm.y - by + 0.5, dmg: 0, kinds: new Set() });
  H.run(g, 20, {});
  check('the blast hurts what is near it (dealDamage, team player)', dummy.dmg > 15 && dummy.dmg <= 30 && dummy.kinds.has('blast'), `${dummy.dmg.toFixed(1)} dmg`);
  dummy.on = false;
}
{
  const g = outOn('seed', 0.5), b = g.w.byId.seed; gear(g, GEAR.bomb3);
  const A = g.astro, [sx, sy] = World.bodyState(g.w, b, g.t);
  H.run(g, 1, { pressed: ['KeyB'], mouse: mouseAt(2 * A.x - sx, 2 * A.y - sy, false) });   // straight up
  const bm = M(g).live[0], cap = 0.9 * Math.sqrt(2 * b.mu / b.R);
  check('Seed: throws capped at 0.9 x escape (2.31 m/s)', bm && bm.u <= cap + 1e-9 && bm.u > 2.1, `${bm.u.toFixed(3)} m/s, cap ${cap.toFixed(3)} at the surface (Thunder Puck bombV 10)`);
  let far = 0; while (M(g).live.length) { H.run(g, 1, {}); const q = M(g).live[0]; if (q) far = Math.max(far, Game.nearestBody(g, q.x, q.y).d); }
  check('...so the bomb comes back down (no orbiting bombs)', far < b.hill && far < 60, `max ${far.toFixed(1)} m from Seed's centre`);
}
{
  const twin = (throwIt) => { const g = walkOut(); gear(g, GEAR.bomb2); H.run(g, 5, {}); H.run(g, 1, { pressed: throwIt ? ['KeyB'] : [] }); return g; };
  const g = twin(true), ref = twin(false), A = g.astro, R = ref.astro, bm = M(g).live[0], mA = EVA.astroMass(g);
  const u = [bm.vx - R.vx, bm.vy - R.vy], dv = [A.vx - R.vx, A.vy - R.vy], want = [-u[0] * g.S.bombKg / mA, -u[1] * g.S.bombKg / mA];
  check('recoil: Δv = −m_b v / m_A', Math.hypot(dv[0] - want[0], dv[1] - want[1]) < 1e-3 * Math.hypot(...want) && Math.hypot(...dv) > 0.05, `${Math.hypot(...dv).toFixed(4)} m/s from a ${g.S.bombKg} kg Boom Berry at ${Math.hypot(...u).toFixed(2)} m/s`);
  H.run(g, 200, {});
  check('a bomb in open space goes off harmlessly far away', M(g).live.length === 0 && g.astro.on && g.astro.hp === g.astro.hpMax, `hp ${g.astro.hp.toFixed(0)}`);
}
// right mouse: hold to see the arc, let go to throw
{
  const g = outOn('mochi', Math.PI / 2), b = g.w.byId.mochi; gear(g, GEAR.bomb1);
  const [tx, ty] = groundAhead(g, b, 4), ms = (right) => ({ ...mouseOn(g, b, tx, ty + 3, false), right });
  H.run(g, 10, { mouse: ms(true) });
  check('hold right-click: a dotted arc for the fuse, nothing thrown yet', M(g).aiming && M(g).arc && M(g).arc.pts.length > 5 && M(g).live.length === 0, `${M(g).arc ? M(g).arc.pts.length : 0} arc points`);
  H.run(g, 1, { mouse: ms(false) });
  check('let go: the bomb flies', !M(g).aiming && M(g).live.length === 1 && M(g).arc === null, '');
}


// ---------------- 17. topUp, suit tiers, save stats ----------------
{
  const g = walkOut(); gear(g, GEAR.bomb1, GEAR.roll1);
  Object.assign(M(g), { o2: 3, jet: 0.5, bombsN: 0, rollReady: g.t + 5 }); g.astro.hp = 10;
  EVA.topUp(g, false);
  check('EVA.topUp(g, false): HP and air only (the fries)', g.astro.hp === g.astro.hpMax && M(g).o2 === g.S.o2 && M(g).jet === 0.5 && M(g).bombsN === 0, '');
  EVA.topUp(g);
  check('EVA.topUp(g): HP, air, jet, bombs and roll', M(g).jet === g.S.jetFuel && M(g).bombsN === 2 && M(g).rollReady <= g.t, '');
  check('astronaut mass: 85 kg + suit + pack', EVA.astroMass(g) === 85 && (gear(g, GEAR.suit[4]), g.pack = { ice: 3 }, EVA.astroMass(g) === 85 + 140 + 3 * CONFIG.items.ice.kg), `${EVA.astroMass(g)} kg`);
  const p = outOn('mochi', Math.PI / 2); gear(p, GEAR.suit[4]);
  H.run(p, 1, { pressed: ['KeyW'] });
  let maxA = 0; for (let i = 0; i < 400; i++) { H.run(p, 1, {}); maxA = Math.max(maxA, alt(p)); }
  check('Mecha-Pip jumps higher (jumpMult 1.35)', maxA > 3.2 && maxA < 7, `apex ${maxA.toFixed(2)} m`);
}
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = walkOut(); gear(g, GEAR.roll1, GEAR.bomb1); H.run(g, 1, { pressed: ['KeyC'] }); H.run(g, 1, { pressed: ['KeyB'] }); H.run(g, 300, { keys: ['KeyD'] });
  Game.save(g);
  const g2 = Game.create(7, 'pad'), s2 = M(g2).stats;
  check('save round-trips the EVA stats; a spacewalk saved loads aboard', s2.spacewalks === 1 && s2.rolls === 1 && s2.bombs === 1 && s2.maxTether > 5 && g2.mode === 'ship' && !g2.astro.on && M(g2).live.length === 0, JSON.stringify(s2));
  const g3 = Game.create(7, 'pad');
  Game.call(g3, evaMod(), 'load', { hauled: 3, stats: { spacewalks: 'x', maxTether: -1, bombs: Infinity } });
  check('load shrugs off junk stats', Object.values(M(g3).stats).every((v) => v === 0), JSON.stringify(M(g3).stats));
  Game.wipeSave(); delete global.localStorage;
}


// ---------------- 18. art: every suit tier, rolling, bombs, the tether, the arc, on a NaN-sniffing canvas ----------------
{
  const { kit, cam, bad, count } = fakeKit();
  const mod = evaMod();
  const draw = (g) => { [cam.x, cam.y] = [g.astro.x, g.astro.y]; for (const h of ['drawWorld', 'drawWorldTop', 'drawScreen', 'drawHUD']) mod[h](g, kit); };
  let frames = 0;
  for (let T = 0; T <= 4; T++) {
    for (const where of ['mochi', 'space']) {
      const g = where === 'space' ? walkOut() : outOn('mochi', 1.3), b = g.w.byId.mochi;
      gear(g, GEAR.suit[T], T >= 2 ? GEAR.bomb3 : GEAR.bomb1, GEAR.roll2, { sprint: 2.2, translator: T % 3 });
      for (const zoom of [0.5, 6, 22, 90]) {
        cam.zoom = zoom;
        const [tx, ty] = groundAhead(g, b, 4);
        H.run(g, 12, { keys: ['KeyD', 'ShiftLeft'], mouse: mouseOn(g, b, tx, ty) }); draw(g);                      // sprint + laser
        H.run(g, 4, { keys: ['KeyD'], mouse: { ...mouseOn(g, b, tx, ty, false), right: true } }); draw(g);       // bomb arc
        H.run(g, 1, { mouse: mouseOn(g, b, tx, ty, false) }); H.run(g, 1, { pressed: ['KeyC'] }); H.run(g, 8, {}); draw(g);   // bomb in flight + roll
        H.run(g, 100, {}); draw(g);                                                                                 // boom
        M(g).o2 = 0; g.astro.hp = 20; draw(g); M(g).o2 = g.S.o2; g.astro.hp = g.astro.hpMax;
        frames += 5;
      }
    }
  }
  check('art: suit tiers 0-4, sprint, roll, bombs, tether, arc, no NaN', bad.length === 0 && count() > 20000, `${frames} frames, ${count()} canvas calls${bad.length ? ', bad: ' + bad.slice(0, 4).join(' ') : ''}`);
}


// ---------------- 19. fuzz on the line: random keys and clicks, finite and leashed ----------------
{
  let rand = 777; const rnd = () => { rand = (rand * 1103515245 + 12345) & 0x7fffffff; return rand / 0x7fffffff; };
  const g = walkOut(); gear(g, GEAR.roll2, GEAR.bomb2, { tetherLen: 60, reelA: 1.5 });
  let ok = true, worst = 0, outs = 0, keys = [];
  for (let i = 0; i < 90 * 60; i++) {
    if (i % 90 === 0) keys = [['KeyA', 'KeyD', 'KeyW', 'KeyS'].filter(() => rnd() < 0.5), rnd() < 0.15 ? ['KeyQ'] : [], rnd() < 0.3 ? ['ShiftLeft'] : []].flat();   // streaks: get somewhere
    if (i % 400 === 0 && g.astro.on) { g.astro.vx += (rnd() - 0.5) * 12; g.astro.vy += (rnd() - 0.5) * 12; }                                         // a shove (a bite, a blast)
    const pressed = rnd() < 0.02 ? [['KeyC', 'KeyB', 'KeyE'][Math.floor(rnd() * 3)]] : [];
    H.run(g, 1, { keys, pressed, mouse: { ...mouseAt(g.astro.x + (rnd() - 0.5) * 20, g.astro.y + (rnd() - 0.5) * 20, rnd() < 0.4), right: rnd() < 0.2 } });
    if (!g.astro.on) { outs++; if (g.status !== 'dead') H.run(g, 1, { pressed: ['KeyE'] }); continue; }
    const A = g.astro;
    if (![A.x, A.y, A.vx, A.vy, A.hp, M(g).o2, M(g).jet, g.sh.x, g.sh.vx].every(Number.isFinite)) { ok = false; break; }
    if (EVA.isTethered(g)) worst = Math.max(worst, toShip(g));
  }
  check('fuzz: 90 s of mashing on a 60 m line, finite, never past the line', ok && worst <= 60.05, `max ${worst.toFixed(2)} m, ${outs} frames aboard`);
}


// ---------------- sub-runs: only 'eva' at all, and eva + haul ----------------
function solo() {
  const g = walkOut();
  check('--solo: E in orbit steps out on a tether', EVA.isTethered(g) && Game.mods.length === 1, Game.mods.map((m) => m.id).join(','));
  gear(g, GEAR.bomb1, GEAR.roll2); H.run(g, 1, { pressed: ['KeyB'] }); H.run(g, 1, { pressed: ['KeyC'] }); H.run(g, 200, { keys: ['KeyD'], mouse: mouseAt(g.astro.x + 3, g.astro.y, true) });
  let t = 0; while (toShip(g) - g.S.radius > EVA.BOARD_R - 0.3 && t < 60 * 60) { H.run(g, 1, { keys: ['KeyQ'] }); t++; }
  H.run(g, 1, { pressed: ['KeyE'] });
  check('--solo: bombs, rolls, laser in space, winch and board', g.mode === 'ship' && M(g).stats.bombs === 1 && M(g).stats.rolls === 1, `${g.mode}`);
  const p = outOn('mochi', Math.PI / 2), b = p.w.byId.mochi; gear(p, GEAR.bomb1);
  const [tx, ty] = groundAhead(p, b, 5);
  H.run(p, 1, { pressed: ['KeyB'], mouse: mouseOn(p, b, tx, ty, false) }); H.run(p, 150, {});
  check('--solo: a bomb digs a crater with no haul around', M(p).bombCells > 0, `${M(p).bombCells} cells`);
}

function haulRun() {
  if (typeof Haul === 'undefined' || !Haul || !Haul.blast) { console.log('SKIP  --haul: no Haul module'); return; }
  const calls = { blast: 0, chip: 0, ray: 0 }, blast0 = Haul.blast, chip0 = Haul.chip;
  Haul.blast = (...a) => { calls.blast++; return blast0(...a); };
  Haul.chip = (...a) => { calls.chip++; return chip0(...a); };
  const p = outOn('mochi', Math.PI / 2), b = p.w.byId.mochi; gear(p, GEAR.bomb2);
  const [tx, ty] = groundAhead(p, b, 5);
  H.run(p, 1, { pressed: ['KeyB'], mouse: mouseOn(p, b, tx, ty, false) }); H.run(p, 150, {});
  check('--haul: a bomb digs AND calls Haul.blast(E)', M(p).bombCells > 0 && calls.blast === 1, `${M(p).bombCells} cells, blast x${calls.blast}`);
  const g = walkOut(), A = g.astro; g.S.tetherLen = 1e6; H.run(g, 1, {});
  const rk = g.w.rocks.find((r) => r.r > 1.5 && !r.gone);
  let [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t);
  Object.assign(A, { x: rx - rk.r - 3, y: ry, vx: rvx, vy: rvy });
  const pack0 = Game.kgOf(g.pack);
  for (let i = 0; i < 6 * 60; i++) { [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t); A.vx = rvx; A.vy = rvy; A.x = rx - rk.r - 3; A.y = ry; H.run(g, 1, { mouse: mouseAt(rx, ry, true) }); }
  check('--haul: the laser chips a rail rock (Haul.rayRocks / Haul.chip)', calls.chip > 100 && M(g).beam && M(g).beam.hit === 'rock', `chip x${calls.chip}, beam ${M(g).beam && M(g).beam.hit}`);
  check('...and its chunks fly into your pack', Game.kgOf(g.pack) > pack0, `pack ${JSON.stringify(g.pack)}`);
}

function fakeKit() {
  const bad = []; let calls = 0;
  const ctx = new Proxy({ globalAlpha: 1, lineWidth: 1, lineDashOffset: 0 }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { calls++; if (a.some((v) => !Number.isFinite(v))) bad.push(k); return { addColorStop() {} }; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      return (...a) => { calls++; if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad.push(`${String(k)}(${a.join(',')})`); };
    },
    set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${String(k)}=${v}`); t[k] = v; return true; },
  });
  const cam = { x: 0, y: 0, zoom: 22, rot: 0, map: false, userZoom: 1 }, W = 1280, Hh = 760;
  const kit = {
    ctx, W, H: Hh, cam, px: () => 1 / cam.zoom, toScreen: (x, y) => [W / 2 + (x - cam.x) * cam.zoom, Hh / 2 - (y - cam.y) * cam.zoom],
    onScreen: (sx, sy, m = 30) => sx > -m && sx < W + m && sy > -m && sy < Hh + m, screenAng: (a) => -a,
    tag: (x, y) => { if (!Number.isFinite(x + y)) bad.push('tag'); }, outlinedText: (s, x, y) => { if (!Number.isFinite(x + y)) bad.push('text'); },
    bar: (l, f, x, y) => { if (!Number.isFinite(f + x + y)) bad.push(`bar ${l} ${f}`); }, stackLeft: () => 40, fit: (s) => s,
    fmtDist: (m) => `${m.toFixed(0)} m`, INK: '#1b1433', COL: { good: '#33c27a', warn: '#ff9f1c', bad: '#e63946', tgt: '#7cf5d6', dim: '#6d5f8a' },
    LIGHT: [-0.55, 0.83], FONT: 'sans-serif',
  };
  return { kit, cam, bad, count: () => calls };
}

function finish() {
  console.log(`\n${nPass} passed, ${nFail} failed`);
  process.exit(nFail ? 1 : 0);
}

for (const mode of ['--solo', '--haul']) {
  const r = require('child_process').spawnSync(process.execPath, [__filename, mode], { encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n').filter((l) => /^(PASS|FAIL|SKIP)/.test(l));
  for (const l of lines) { console.log(l); if (!l.startsWith('SKIP')) l.startsWith('PASS') ? nPass++ : nFail++; }
  if (r.status !== 0 && !lines.some((l) => l.startsWith('FAIL'))) check(`${mode} run exits cleanly`, false, (r.stderr || '').slice(0, 300));
}
finish();
