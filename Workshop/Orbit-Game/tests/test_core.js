// ======================================================================
//  CORE TESTS  —  terrain grid, landing on it, digging, pickups, warp caps,
//  docking hold, damage/raycast, nav approach, save.   node tests/test_core.js
// ======================================================================

const H = require('./harness');
H.load();

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = 'pad') => Game.create(7, spawn, { fresh: true });


// ---------------- 1. terrain grid ----------------
{
  const g = fresh(), ceres = g.w.byId.ceres, T = Terrain.of(ceres);
  let inside = 0, outside = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const th = k / 400 * 2 * Math.PI, R = World.surfaceR(ceres, th);
    n++;
    if (Terrain.solid(T, (R - 0.6) * Math.cos(th), (R - 0.6) * Math.sin(th))) inside++;
    if (!Terrain.solid(T, (R + 0.6) * Math.cos(th), (R + 0.6) * Math.sin(th))) outside++;
  }
  check('grid matches the drawn outline (±0.6 m)', inside === n && outside === n, `${inside}/${n} just inside solid, ${outside}/${n} just outside empty`);
  const ores = {}; for (const m of T.grid) if (m > Terrain.REG) ores[Terrain.MATS[m].id] = (ores[Terrain.MATS[m].id] || 0) + 1;
  check('Ceres has ice and iron veins', ores.ice > 1000 && ores.iron > 200, JSON.stringify(ores));
  const hit = Terrain.collideCircle(T, 0, World.surfaceR(ceres, Math.PI / 2) + 3, 4);
  check('collideCircle pushes up out of the ground', hit && hit.ny > 0.95 && hit.depth > 0.5 && hit.depth < 1.6, hit ? `n (${hit.nx.toFixed(2)}, ${hit.ny.toFixed(2)}) depth ${hit.depth.toFixed(2)}` : 'no hit');
  const ray = Terrain.raycast(T, 0, 320, 0, -1, 40);
  check('raycast straight down finds the surface', ray && Math.abs(ray.ly - World.surfaceR(ceres, Math.PI / 2)) < 0.4, ray ? `hit at y ${ray.ly.toFixed(2)}` : 'miss');
}


// ---------------- 2. digging ----------------
{
  const g = fresh(), seed = g.w.byId.seed, T = Terrain.of(seed);
  let k0 = -1; for (let k = 0; k < T.grid.length; k++) if (T.grid[k] === Terrain.MAT_ID.platinum) { k0 = k; break; }
  const lx = -T.half + (k0 % T.N + 0.5) * Terrain.CELL, ly = -T.half + (Math.floor(k0 / T.N) + 0.5) * Terrain.CELL;
  let r = { cells: 0, yield: {} }, calls = 0;
  while (!r.cells && calls < 50) { r = Terrain.dig(T, lx, ly, 0.3, 0.5); calls++; }
  check('platinum takes several laser ticks (hardness 3.6)', calls >= 7 && calls <= 9, `${calls} ticks of 0.5 units`);
  check('a dug platinum cell yields platinum', r.yield.platinum === 3 && Terrain.mat(T, lx, ly) === Terrain.DUG, JSON.stringify(r.yield));
  check('dug area is marked for re-bake', T.dirty.size > 0 && T.has[Math.floor(k0 / T.N / 24) * T.NC + Math.floor(k0 % T.N / 24)] === 1, `${T.dirty.size} dirty chunks`);

  const gm = T.gems[0], [bx, by] = World.bodyState(g.w, seed, g.t);
  const before = g.pickups.length;
  for (let i = 0; i < 20; i++) Game.dig(g, seed, bx + gm.lx, by + gm.ly, 0.8, 1, { collect: true });
  check('digging out a gem spawns a gem pickup', gm.state === 'taken' && g.pickups.some((p) => p.item === gm.type), `${g.pickups.length - before} pickups, gem ${gm.type}`);
}


// ---------------- 3. landing on the grid, bounce, crash, takeoff ----------------
function dropOn(bodyId, speed, th = 1.0) {
  const g = fresh('orbit'), b = g.w.byId[bodyId];
  const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t), R = World.surfaceR(b, th) + g.S.radius + 0.4;
  Object.assign(g.sh, { x: bx + R * Math.cos(th), y: by + R * Math.sin(th), vx: bvx - speed * Math.cos(th), vy: bvy - speed * Math.sin(th), ang: th, omega: 0 });
  g.everFlew = true;
  H.run(g, 90, {});
  return g;
}
{
  const g = dropOn('kiwi', 1.2);
  check('soft touchdown on Kiwi lands', g.status === 'landed' && g.landedOn.id === 'kiwi', `${g.status}, hull ${g.sh.hull.toFixed(0)}`);
  check('landing job ticks', g.done.kiwi !== undefined, `money $${g.money}`);
  const [bx, by] = World.bodyState(g.w, g.landedOn, g.t), L = g.land;
  H.run(g, 120, {});
  const [bx2, by2] = World.bodyState(g.w, g.landedOn, g.t);
  check('landed ship rides along with moving Kiwi', Math.hypot(g.sh.x - bx2 - L.lx, g.sh.y - by2 - L.ly) < 1e-9 && Math.hypot(bx2 - bx, by2 - by) > 10, `Kiwi moved ${Math.hypot(bx2 - bx, by2 - by).toFixed(1)} m`);
  H.run(g, 60, { keys: ['KeyW'] });
  check('takeoff from Kiwi', g.status === 'flying', `${g.status}, alt ${g.orb.alt.toFixed(1)} m`);

  const g2 = dropOn('kiwi', 4.5);
  check('medium hit bounces and dents the hull', g2.sh.hull < g2.S.hull && g2.status !== 'dead', `hull ${g2.sh.hull.toFixed(0)}, ${g2.status}`);
  const g3 = dropOn('ceres', 12);
  check('fast hit destroys the ship', g3.status === 'dead', g3.crashMsg);
  H.run(g3, 2, { pressed: ['KeyR'] });
  check('R after a crash respawns a fresh ship', g3.status !== 'dead' && g3.sh.hull === g3.S.hull, `${g3.status} at ${g3.spawn}`);
}
{
  const g = fresh('pad'), b = g.w.byId.ceres, [bx, by] = World.bodyState(g.w, b, g.t);
  for (let i = 0; i < 40; i++) Game.dig(g, b, g.sh.x, g.sh.y - g.S.radius - 0.5, 3.5, 5);
  H.run(g, 30, {});
  check('ship falls when the ground under it is dug away', g.status === 'flying' || (g.status === 'landed' && g.land.ly < g.sh.y - by - 0.1 + 100), `${g.status}`);
  H.run(g, 240, {});
  check('...and settles lower in the hole', g.status === 'landed' && g.sh.y - by < World.surfaceR(b, Math.PI / 2) + g.S.radius - 0.5, `${g.status} at local y ${(g.sh.y - by).toFixed(1)}`);
}


// ---------------- 4. pickups: settle on the ground, ship scoops them ----------------
{
  const g = fresh('pad'), b = g.w.byId.ceres, [bx, by] = World.bodyState(g.w, b, g.t);
  const p = Game.spawnPickup(g, { x: bx + 20, y: by + World.surfaceR(b, Math.atan2(by + 300, 20)) + 3, item: 'ice', qty: 5 });
  H.run(g, 300, {});
  check('pickup falls and comes to rest on the surface', p.rest && Math.abs(Math.hypot(p.x - bx, p.y - by) - World.surfaceR(b, Math.atan2(p.y - by, p.x - bx))) < 1, p.rest ? `rests at alt ${(Math.hypot(p.x - bx, p.y - by) - World.surfaceR(b, Math.atan2(p.y - by, p.x - bx))).toFixed(2)}` : 'still moving');
  Game.spawnPickup(g, { x: g.sh.x + 1, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy, item: 'iron', qty: 10 });
  H.run(g, 5, {});
  check('ship scoops a pickup it touches into cargo', g.cargo.iron === 10 && g.sh.cargoKg === 10, JSON.stringify(g.cargo));
  check('cargo mass lowers delta-v', Physics.deltaV(g.sh, g.S) < Physics.deltaV(Physics.newShip(g.S), g.S), `${Physics.deltaV(g.sh, g.S).toFixed(1)} vs ${Physics.deltaV(Physics.newShip(g.S), g.S).toFixed(1)} m/s`);
  const n = Game.addCargo(g, 'scrap', 1000);
  check('cargo hold caps by mass', g.sh.cargoKg <= g.S.cargoCap && n === Math.floor((g.S.cargoCap - 10) / 10), `added ${n} scrap, hold ${g.sh.cargoKg} kg`);
}


// ---------------- 5. warp caps ----------------
{
  const g = fresh('belt');
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 3, {});
  check('warp is capped near the rubble', g.warp <= CONFIG.sim.nearWarp || g.nearDist >= 40, `warp ${g.warp}x, clearance ${g.nearDist.toFixed(0)} m, ${g.warpWhy}`);
  H.run(g, 1, { keys: ['KeyA'] });
  check('firing thrusters drops warp to 1x and resets the pick', g.warp === 1 && g.warpIdx === 0, `warp ${g.warp}x`);
  const g2 = fresh('orbit'); Object.assign(g2.sh, { x: 0, y: 1300, vx: 0, vy: 0 }); g2.everFlew = true;   // far out, falling
  g2.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g2, 2, {});
  check('far from everything: full 64x', g2.warp === 64, `warp ${g2.warp}x  clearance ${g2.nearDist.toFixed(0)} m`);
}


// ---------------- 6. docking hold & release ----------------
{
  const g = fresh('orbit'), c = g.w.byId.ceres;
  const st = (t) => { const r = 420, n = Math.sqrt(c.mu / r ** 3), th = n * t; return [r * Math.cos(th), r * Math.sin(th), -r * n * Math.sin(th), r * n * Math.cos(th)]; };
  Game.dock(g, { name: 'Test Port', state: st, ang: Math.PI / 2 });
  H.run(g, 60, {});
  const s = st(g.t);
  check('docked ship rides the port', g.status === 'docked' && Math.hypot(g.sh.x - s[0], g.sh.y - s[1]) < 1e-9, g.status);
  H.run(g, 2, { keys: ['KeyW'] });
  check('throttle up releases the dock', g.status === 'flying', g.status);
}


// ---------------- 7. damage, raycast, impulse ----------------
{
  const g = fresh('orbit'), h0 = g.sh.hull;
  Game.dealDamage(g, { x: g.sh.x + 2, y: g.sh.y, r: 1, dmg: 10, kind: 'bullet', team: 'pirate' });
  Game.dealDamage(g, { x: g.sh.x, y: g.sh.y, r: 1, dmg: 10, kind: 'bullet', team: 'player' });
  check('dealDamage hits other teams only', g.sh.hull === h0 - 10, `hull ${h0} -> ${g.sh.hull}`);
  const c = g.w.byId.ceres, hit = Game.raycast(g, 0, 400, 0, -1, 200, { targets: false });
  check('raycast hits Ceres from above', hit && hit.body === c && Math.abs(hit.y - World.surfaceR(c, Math.PI / 2)) < 0.4, hit ? `t ${hit.t.toFixed(2)}` : 'miss');
  const hit2 = Game.raycast(g, g.sh.x + 10, g.sh.y, -1, 0, 20, { terrain: false });
  check('raycast hits the ship as a target', hit2 && hit2.target && hit2.target.id === 'ship' && Math.abs(hit2.t - (10 - g.S.radius)) < 1e-6, hit2 ? `t ${hit2.t.toFixed(2)}` : 'miss');
  const vx0 = g.sh.vx; Game.impulse(g, 5, 0);
  check('impulse changes velocity', Math.abs(g.sh.vx - vx0 - 5) < 1e-12, '');
}


// ---------------- 8. nav target: closest approach ----------------
{
  const g = fresh('orbit');
  g.navId = 'body:dorito'; Game.refresh(g);
  const ap = g.approach;
  check('targeting Dorito computes a closest approach', ap && ap.i >= 0 && isFinite(ap.d) && ap.dNow > 0, ap ? `now ${ap.dNow.toFixed(0)} m, closest ${ap.d.toFixed(0)} m in ${(ap.t - g.t).toFixed(0)} s` : 'none');
  H.run(g, 1, { pressed: ['Tab'] });
  check('Tab cycles to the next target', g.navId === 'body:kiwi', g.navId);
}


// ---------------- 9. save / load ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = fresh('pad'); g.money = 4321; Game.addCargo(g, 'ice', 25); g.done.kiwi = 1;
  Game.save(g);
  const g2 = Game.create(7, 'pad');
  check('save round-trips money, cargo, jobs', g2.money === 4321 && g2.cargo.ice === 25 && g2.done.kiwi === 1 && g2.sh.cargoKg === 25, `$${g2.money} ${JSON.stringify(g2.cargo)}`);
  Game.wipeSave();
  const g3 = Game.create(7, 'pad');
  check('wipe starts fresh', g3.money !== 4321, `$${g3.money}`);
  delete global.localStorage;
}


// ---------------- 10. orbit hygiene around small bodies (tides only) ----------------
{
  const g = fresh('kiwi'), b = g.w.byId.kiwi;
  let rMin = Infinity, rMax = 0;
  for (let i = 0; i < 20 * 300; i++) {          // 300 s, ~5 laps
    Game.update(g, H.input(), 1 / 20);
    const [bx, by] = World.bodyState(g.w, b, g.t), r = Math.hypot(g.sh.x - bx, g.sh.y - by);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  check('88 m Kiwi parking orbit stays put for 300 s', g.status === 'flying' && rMin > 75 && rMax < 100, `r in [${rMin.toFixed(1)}, ${rMax.toFixed(1)}]`);
}

// ---------------- 11. lifecycle: reloads, tows, landed ships, ion ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const reload = () => Game.create(7, null);
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

  // flying: a reload puts you back where you were, at the same world time
  const g = fresh('belt'); H.run(g, 120, {}); g.money = 777; Game.addCargo(g, 'iron', 14);
  Game.save(g);
  const g2 = reload();
  check('reload mid-flight: same time, place, velocity, cargo', g2.status === 'flying' && near(g2.t, g.t) && near(g2.sh.x, g.sh.x) && near(g2.sh.vy, g.sh.vy) && g2.cargo.iron === 14,
        `t ${g.t.toFixed(2)} -> ${g2.t.toFixed(2)}, dx ${(g2.sh.x - g.sh.x).toExponential(1)} m, cargo ${JSON.stringify(g2.cargo)}`);

  // dead: dying saves, and the reload delivers the crash tow (cargo lost, fee paid)
  const d = fresh('belt'); d.money = 1000; Game.addCargo(d, 'platinum', 6);
  Game.die(d, 'test crash');
  const d2 = reload();
  check('reload after a crash is not a free tow: cargo gone, fee paid', d2.status !== 'dead' && !d2.cargo.platinum && d2.money < 1000, `status ${d2.status}, $${d2.money}, cargo ${JSON.stringify(d2.cargo)}`);

  // landed: stays landed, nose along the ground normal
  const l = fresh('pad'); H.run(l, 30, {}); Game.save(l);
  const l2 = reload(); H.run(l2, 30, {});
  check('reload while landed: still landed on the same body', l2.status === 'landed' && l2.landedOn === l2.w.byId.ceres && near(l2.sh.y, l.sh.y + 0, 0.05), `${l2.status} on ${l2.landedOn && l2.landedOn.name}`);

  // dug holes and taken gems stay dug
  const t = fresh('pad'), b = t.w.byId.seed, T = Terrain.of(b), gm = T.gems[0];
  const [bx, by] = World.bodyState(t.w, b, t.t);
  Game.dig(t, b, bx + gm.lx, by + gm.ly, 1.2, 99);
  const dug = T.grid.reduce((n, v) => n + (v === Terrain.DUG), 0);
  Game.save(t);
  const t2 = reload(), T2 = Terrain.of(t2.w.byId.seed), dug2 = T2.grid.reduce((n, v) => n + (v === Terrain.DUG), 0);
  check('reload keeps dug holes and taken gems (no gem farming)', dug > 0 && dug2 === dug && T2.gems[0].state === 'taken', `${dug} dug -> ${dug2}, gem ${T2.gems[0].state}`);
  const raw = JSON.parse(store['pocket-orbit-v3']);
  check('save stays small', store['pocket-orbit-v3'].length < 20000, `${store['pocket-orbit-v3'].length} chars, bodies ${Object.keys(raw.ter).join(',')}`);

  // ?fresh=1 / ?mods= games never write
  const n = Game.create(7, 'pad', { fresh: true, noSave: true }); n.money = 1;
  check('noSave games never overwrite the save', Game.save(n) === false && JSON.parse(store['pocket-orbit-v3']).money !== 1);
  delete global.localStorage;

  // triple R: one tow, not two
  const r = fresh('belt'); r.money = 5000;
  H.run(r, 1, { pressed: ['KeyR'] }); H.run(r, 1, { pressed: ['KeyR'] }); const m1 = r.money;
  H.run(r, 1, { pressed: ['KeyR'] });
  check('R R R tows once (third R only asks again)', m1 < 5000 && r.money === m1, `$5000 -> $${m1} -> $${r.money}`);

  // landed ships do not spin; nose stays on the ground normal
  const p = fresh('pad'); H.run(p, 10, {}); const a0 = p.sh.ang, rcs0 = p.sh.rcs;
  H.run(p, 120, { keys: ['KeyA'] });
  check('landed: A/D do not spin the ship or burn RCS', p.status === 'landed' && near(p.sh.ang, a0) && p.sh.omega === 0 && p.sh.rcs === rcs0, `ang ${a0.toFixed(3)} -> ${p.sh.ang.toFixed(3)}`);

  // ion drive only burns in flight, from the ship
  const q = fresh('belt'); q.S.ionThrust = 0.25; q.S.ionTank = 0.4; q.sh.xe = 0.4;
  Game.toggleIon(q); const on = q.ionOn;
  Game.landAt(q, q.w.byId.ceres, Math.PI / 2); H.run(q, 1, {});
  check('ion drive: on in flight, switched off once not flying', on && !q.ionOn);
  const q2 = fresh('pad'); q2.S.ionThrust = 0.25; q2.sh.xe = 0.4; Game.toggleIon(q2);
  check('ion drive will not start on the pad', !q2.ionOn);
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
