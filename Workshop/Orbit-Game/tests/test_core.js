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
const WMAX = CONFIG.sim.warps[CONFIG.sim.warps.length - 1];
const built = (T, x, y) => { const k = Terrain.index(T, x, y); return k >= 0 && (!!(T.zone && T.zone[k]) || !!Terrain.MATS[T.grid[k]].fixed); };


// ---------------- 1. terrain grid ----------------
{
  const g = fresh(), mochi = g.w.byId.mochi, T = Terrain.of(mochi);
  let inside = 0, outside = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const th = k / 400 * 2 * Math.PI, R = World.surfaceR(mochi, th);
    n++;
    const xi = (R - 0.6) * Math.cos(th), yi = (R - 0.6) * Math.sin(th), xo = (R + 0.6) * Math.cos(th), yo = (R + 0.6) * Math.sin(th);
    if (Terrain.solid(T, xi, yi) || built(T, xi, yi)) inside++;                // v4: carved town and plinths are built on purpose
    if (!Terrain.solid(T, xo, yo) || built(T, xo, yo)) outside++;
  }
  check('grid matches the drawn outline (±0.6 m)', inside === n && outside === n, `${inside}/${n} just inside solid, ${outside}/${n} just outside empty`);
  const ores = {}; for (const m of T.grid) if (m > Terrain.REG) ores[Terrain.MATS[m].id] = (ores[Terrain.MATS[m].id] || 0) + 1;
  check('Mochi has ice and iron veins', ores.ice > 1000 && ores.iron > 200, JSON.stringify(ores));
  const hit = Terrain.collideCircle(T, 0, World.surfaceR(mochi, Math.PI / 2) + 3, 4);
  check('collideCircle pushes up out of the ground', hit && hit.ny > 0.95 && hit.depth > 0.5 && hit.depth < 1.6, hit ? `n (${hit.nx.toFixed(2)}, ${hit.ny.toFixed(2)}) depth ${hit.depth.toFixed(2)}` : 'no hit');
  const ray = Terrain.raycast(T, 0, 320, 0, -1, 40);
  check('raycast straight down finds the surface', ray && Math.abs(ray.ly - World.surfaceR(mochi, Math.PI / 2)) < 0.4, ray ? `hit at y ${ray.ly.toFixed(2)}` : 'miss');
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
  const g3 = dropOn('mochi', 12);
  check('fast hit destroys the ship', g3.status === 'dead', g3.crashMsg);
  H.run(g3, 2, { pressed: ['KeyR'] });
  check('R after a crash respawns a fresh ship', g3.status !== 'dead' && g3.sh.hull === g3.S.hull, `${g3.status} at ${g3.spawn}`);
}
{
  const g = fresh('pad'), b = g.w.byId.mochi, TH = Math.PI / 2 - 0.6;  // v4: off the pad, east of Downtown
  Game.landAt(g, b, TH); H.run(g, 10, {});
  const ux = Math.cos(TH), uy = Math.sin(TH), up = () => { const [bx, by] = World.bodyState(g.w, b, g.t); return (g.sh.x - bx) * ux + (g.sh.y - by) * uy; };
  const h0 = up();
  for (let i = 0; i < 40; i++) Game.dig(g, b, g.sh.x - (g.S.radius + 0.5) * ux, g.sh.y - (g.S.radius + 0.5) * uy, 3.5, 5);
  H.run(g, 30, {});
  check('ship falls when the ground under it is dug away', g.status === 'flying' || up() < h0 - 0.1, `${g.status} ${(h0 - up()).toFixed(2)} m down`);
  H.run(g, 240, {});
  check('...and settles lower in the hole', g.status === 'landed' && up() < World.surfaceR(b, TH) + g.S.radius - 0.5, `${g.status} at local r ${up().toFixed(1)}`);
}


// ---------------- 4. pickups: settle on the ground, ship scoops them ----------------
{
  const g = fresh('pad'), b = g.w.byId.mochi;
  let [bx, by] = World.bodyState(g.w, b, g.t);
  const [, , bvx, bvy] = World.bodyState(g.w, b, g.t);
  const p = Game.spawnPickup(g, { x: bx + 20, y: by + World.surfaceR(b, Math.atan2(300, 20)) + 3, vx: bvx, vy: bvy, item: 'ice', qty: 5 });
  H.run(g, 300, {});
  [bx, by] = World.bodyState(g.w, b, g.t);
  check('pickup falls and comes to rest on the surface', p.rest && Math.abs(Math.hypot(p.x - bx, p.y - by) - World.surfaceR(b, Math.atan2(p.y - by, p.x - bx))) < 1, p.rest ? `rests at alt ${(Math.hypot(p.x - bx, p.y - by) - World.surfaceR(b, Math.atan2(p.y - by, p.x - bx))).toFixed(2)}` : 'still moving');
  Game.spawnPickup(g, { x: g.sh.x + 1, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy, item: 'iron', qty: 10 });
  H.run(g, 5, {});
  check('ship scoops a pickup it touches into cargo', g.cargo.iron === 10 && g.sh.cargoKg === 10, JSON.stringify(g.cargo));
  check('cargo mass lowers delta-v', Physics.deltaV(g.sh, g.S) < Physics.deltaV(Physics.newShip(g.S), g.S), `${Physics.deltaV(g.sh, g.S).toFixed(1)} vs ${Physics.deltaV(Physics.newShip(g.S), g.S).toFixed(1)} m/s`);
  const n = Game.addCargo(g, 'scrap', 1000);
  check('cargo hold caps by mass', g.sh.cargoKg <= g.S.cargoCap && n === Math.floor((g.S.cargoCap - 10) / 10), `added ${n} scrap, hold ${g.sh.cargoKg} kg`);
}
{                                                                     // ore tossed up next to a landed ship, then max warp
  for (const fd of [1 / 60, 1 / 20]) {
    const g = fresh('pad'), b = g.w.byId.mochi, R = World.rng(9), [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t), ps = [];
    for (let i = 0; i < 40; i++) {
      const th = Math.PI / 2 + 0.3 + i * 0.01, r = World.surfaceR(b, th) + 1 + 6 * R(), sp = 3 * R(), a = 2 * Math.PI * R();
      ps.push(Game.spawnPickup(g, { x: bx + r * Math.cos(th), y: by + r * Math.sin(th), vx: bvx + sp * Math.cos(a), vy: bvy + sp * Math.sin(a), item: 'ice', qty: 1 }));
    }
    let worst = 0;
    for (let f = 0; f < 3; f++) { g.warpIdx = CONFIG.sim.warps.length - 1; const t0 = Date.now(); Game.update(g, H.input(), fd); worst = Math.max(worst, Date.now() - t0); }
    const [cx, cy] = World.bodyState(g.w, b, g.t);
    const under = ps.filter((p) => Terrain.solid(Terrain.of(b), p.x - cx, p.y - cy) || Math.hypot(p.x - cx, p.y - cy) < World.surfaceR(b, Math.atan2(p.y - cy, p.x - cx)) - 1).length;
    check(`loose ore settles at ${g.warp}x (${Math.round(1 / fd)} fps frames), none falls through`, under === 0 && ps.every((p) => p.rest),
          `${ps.filter((p) => p.rest).length}/40 resting, ${under} underground, ${(g.t).toFixed(0)} s sim, slowest frame ${worst} ms`);
  }
}


// ---------------- 5. warp caps ----------------
{
  const g = fresh('belt');
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 3, {});
  check('co-orbiting the rubble: warp only caps when a rock is closing', g.warp === WMAX || g.rockTTC < 20 || g.nearDist < 8, `warp ${g.warp}x, clearance ${g.nearDist.toFixed(0)} m, ttc ${g.rockTTC.toFixed(0)} s, ${g.warpWhy}`);
  const rk = g.w.rocks.find((r) => r.r > 3), [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t), D = rk.r + g.S.radius + 30;
  Object.assign(g.sh, { x: rx + D, y: ry, vx: rvx - 2, vy: rvy }); Game.refresh(g);
  check('a straight-line hit that Mochi\'s tide curves away (17 m miss) is no rock warning', g.rockTTC === Infinity, `ttc ${g.rockTTC}`);
  Object.assign(g.sh, { x: rx + D, y: ry, vx: rvx - 4, vy: rvy });
  g.warpIdx = CONFIG.sim.warps.length - 1; Game.refresh(g); H.run(g, 1, {});
  check('a rock closing at 4 m/s caps warp to 4x', g.warp <= CONFIG.sim.nearWarp && /rock/.test(g.warpWhy), `warp ${g.warp}x, ttc ${g.rockTTC.toFixed(1)} s, ${g.warpWhy}`);
  Object.assign(g.sh, { x: rx + rk.r + g.S.radius + 6, y: ry, vx: rvx - 2, vy: rvy }); Game.refresh(g); H.run(g, 1, {});
  check('...and to 1x with a hint a few seconds out', g.warp === 1 && /Rock ahead/.test(Game.hint(g)), `warp ${g.warp}x: ${Game.hint(g)}`);
  H.run(g, 1, { keys: ['KeyA'] });
  check('firing thrusters drops warp to 1x and resets the pick', g.warp === 1 && g.warpIdx === 0, `warp ${g.warp}x`);
  const g2 = fresh('orbit'), [mx, my, mvx, mvy] = World.bodyState(g2.w, g2.w.byId.mochi, g2.t);
  Object.assign(g2.sh, { x: mx, y: my + 1300, vx: mvx, vy: mvy }); g2.everFlew = true;   // 1.3 km above Mochi, falling from rest
  g2.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g2, 2, {});
  check(`far from everything: full ${WMAX}x`, g2.warp === WMAX && g2.status === 'flying', `warp ${g2.warp}x  ${g2.status}  clearance ${g2.nearDist.toFixed(0)} m`);
}


// ---------------- 5b. big warps never jump past a warning (a 1024x frame at 20 fps covers 51 s) ----------------
{
  const WI = CONFIG.sim.warps.length - 1;
  // coast at a body, the player holding max warp until it drops to 1x: how long before the end did it drop?
  const lead = (id, D, v, fd) => {
    const g = fresh('orbit'), b = g.w.byId[id], [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t), th = 2.0;
    Object.assign(g.sh, { x: bx + D * Math.cos(th), y: by + D * Math.sin(th), vx: bvx - v * Math.cos(th), vy: bvy - v * Math.sin(th), omega: 0 });
    g.everFlew = true; Game.refresh(g);
    let t1 = null;
    for (let f = 0; f < 4000 && g.status === 'flying'; f++) {
      if (t1 === null) g.warpIdx = WI;
      Game.update(g, H.input(), fd);
      if (t1 === null && g.warp === 1) t1 = g.t;
    }
    return { dead: g.status === 'dead', lead: t1 === null ? -1 : g.t - t1, msg: g.crashMsg };
  };
  const runs = [['pretzel', 1300, 10], ['pretzel', 1500, 25], ['truffle', 1500, 50], ['ember', 20000, 0]].map(([id, D, v]) => ({ id, v, ...lead(id, D, v, 1 / 20) }));
  check('coasting into a body at max warp (20 fps): 1x comes ~20 s before impact', runs.every((r) => r.dead && r.lead > 18),
        runs.map((r) => `${r.id} ${r.v} m/s: ${r.lead.toFixed(1)} s`).join(', '));
  check('...a star dive too (SIZZLE)', /SIZZLE/.test(runs[3].msg), runs[3].msg);

  // fly straight at a lone belt rock with max warp held every frame: it must hit (no tunnelling), and only at <= 4x
  const g0 = fresh('pad'), RK = g0.w.rocks.find((r) => r.host === g0.w.root && r.swarm === -1 && r.r > 4 &&
    g0.w.rocks.every((o) => o === r || o.host !== g0.w.root || Math.hypot(...World.rockState(g0.w, o, 0).slice(0, 2).map((c, i) => c - World.rockState(g0.w, r, 0)[i])) > 1500));
  const out = [];
  for (const fd of [1 / 60, 1 / 20]) for (const v of [30, 40]) for (const gap0 of [450, 650, 900]) {
    const g = fresh('pad'), rk = g.w.rocks[RK.id], [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t), d = Math.hypot(rx, ry), ux = rx / d, uy = ry / d;
    const D = gap0 + rk.r + g.S.radius;
    g.status = 'flying'; g.landedOn = null; g.land = null; g.everFlew = true;
    Object.assign(g.sh, { x: rx + ux * D, y: ry + uy * D, vx: rvx - ux * v, vy: rvy - uy * v, omega: 0 }); Game.refresh(g);
    let res = 'missed';
    for (let f = 0; f < 3000 && res === 'missed'; f++) {
      g.warpIdx = WI; const hull = g.sh.hull;
      Game.update(g, H.input(), fd);
      const [x2, y2, vx2, vy2] = World.rockState(g.w, rk, g.t);
      if (g.sh.hull < hull) res = g.warp <= CONFIG.sim.nearWarp ? 'hit' : `hit at ${g.warp}x`;
      else if ((g.sh.x - x2) * (g.sh.vx - vx2) + (g.sh.y - y2) * (g.sh.vy - vy2) > 0 && Math.hypot(g.sh.x - x2, g.sh.y - y2) > rk.r + 30) res = 'tunnelled';
    }
    out.push(res);
  }
  check('flying at a rock with max warp held: always hit (never tunnelled), always capped to <= 4x first', out.every((r) => r === 'hit'), `rock ${RK.id} r ${RK.r.toFixed(1)} m: ${out.join(', ')}`);
}


// ---------------- 6. docking hold & release ----------------
{
  const g = fresh('orbit'), c = g.w.byId.mochi;
  const st = (t) => { const r = 420, n = Math.sqrt(c.mu / r ** 3), th = n * t, [cx, cy, cvx, cvy] = World.bodyState(g.w, c, t);
                      return [cx + r * Math.cos(th), cy + r * Math.sin(th), cvx - r * n * Math.sin(th), cvy + r * n * Math.cos(th)]; };
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
  const c = g.w.byId.mochi, [cx, cy] = World.bodyState(g.w, c, g.t), hit = Game.raycast(g, cx, cy + 400, 0, -1, 200, { targets: false });
  check('raycast hits Mochi from above', hit && hit.body === c && Math.abs(hit.y - cy - World.surfaceR(c, Math.PI / 2)) < 0.4, hit ? `t ${hit.t.toFixed(2)}` : 'miss');
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
  const ids = Game.navTargets(g).map((n) => n.id);
  H.run(g, 1, { pressed: ['Tab'] });
  const n1 = g.navId;
  H.run(g, 1, { pressed: ['Tab'] });
  const n2 = g.navId;
  H.run(g, 1, { keys: ['ShiftLeft'], pressed: ['Tab'] });
  check('Tab cycles to another target, Shift+Tab steps back', ids.includes(n1) && n1 !== 'body:dorito' && ids.includes(n2) && n2 !== n1 && g.navId === n1, `dorito -> ${n1} -> ${n2} -> back to ${g.navId}`);
  const jb = fresh('orbit'); H.run(jb, 1, { pressed: ['Tab'] });
  check('...and from nothing it starts at the next job\'s target (Mochi\'s pad)', ['mochi:pad', 'body:mochi'].includes(jb.navId), jb.navId);
  // out in the belt the path is drawn in the target's lane body frame: Mochi for the Hub or Kiwi (no corkscrew), Pretzel as itself
  const gb = fresh('orbit'), m = gb.w.byId.mochi, [mx, my, mvx, mvy] = World.bodyState(gb.w, m, gb.t);
  Object.assign(gb.sh, { x: mx * 1.17, y: my * 1.17 + 300, vx: mvx * 0.92, vy: mvy * 0.92 }); gb.everFlew = true;
  const frames = ['station:hub', 'body:kiwi', 'body:seed', 'body:pretzel'].map((id) => { gb.navId = id; Game.refresh(gb); return `${id} -> ${gb.frame.id}`; });
  check('belt path frame: Hub, Kiwi and Seed draw in Mochi\'s frame, Pretzel in its own', gb.ref === gb.w.root &&
        frames.join() === 'station:hub -> body:mochi,body:kiwi -> body:mochi,body:seed -> body:mochi,body:pretzel -> body:pretzel', frames.join(', '));
  const gs = fresh('swarm'), sw = gs.w.swarms.reduce((a, b) => (Math.hypot(gs.sh.x - World.swarmState(gs.w, a, 0)[0], gs.sh.y - World.swarmState(gs.w, a, 0)[1]) <
                                                       Math.hypot(gs.sh.x - World.swarmState(gs.w, b, 0)[0], gs.sh.y - World.swarmState(gs.w, b, 0)[1]) ? a : b));
  const [sx, sy] = World.swarmState(gs.w, sw, 0), ang = Math.acos((sx * mx + sy * my) / Math.hypot(sx, sy) / Math.hypot(mx, my)) * 180 / Math.PI;
  check('the swarm spawn picks the swarm furthest round the belt from Mochi', gs.w.swarms.every((o) => {
    const [ox, oy] = World.swarmState(gs.w, o, 0); return Math.acos((ox * mx + oy * my) / Math.hypot(ox, oy) / Math.hypot(mx, my)) * 180 / Math.PI <= ang + 1e-9; }),
        `${sw.name}, ${ang.toFixed(0)}° from Mochi`);
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
  check('reload while landed: still landed on the same body', l2.status === 'landed' && l2.landedOn === l2.w.byId.mochi && near(l2.land.ly, l.land.ly, 0.05) && near(l2.land.lx, l.land.lx, 0.05), `${l2.status} on ${l2.landedOn && l2.landedOn.name}`);

  // dug holes and taken gems stay dug
  const t = fresh('pad'), b = t.w.byId.seed, T = Terrain.of(b), gm = T.gems[0];
  const [bx, by] = World.bodyState(t.w, b, t.t);
  Game.dig(t, b, bx + gm.lx, by + gm.ly, 1.2, 99);
  const dug = T.grid.reduce((n, v) => n + (v === Terrain.DUG), 0);
  Game.save(t);
  const t2 = reload(), T2 = Terrain.of(t2.w.byId.seed), dug2 = T2.grid.reduce((n, v) => n + (v === Terrain.DUG), 0);
  check('reload keeps dug holes and taken gems (no gem farming)', dug > 0 && dug2 === dug && T2.gems[0].state === 'taken', `${dug} dug -> ${dug2}, gem ${T2.gems[0].state}`);
  const raw = JSON.parse(store['pocket-orbit-v4']);
  check('save stays small', store['pocket-orbit-v4'].length < 20000, `${store['pocket-orbit-v4'].length} chars, bodies ${Object.keys(raw.ter).join(',')}`);

  // ?fresh=1 / ?mods= games never write
  const n = Game.create(7, 'pad', { fresh: true, noSave: true }); n.money = 1;
  check('noSave games never overwrite the save', Game.save(n) === false && JSON.parse(store['pocket-orbit-v4']).money !== 1);
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
  Game.landAt(q, q.w.byId.mochi, Math.PI / 2); H.run(q, 1, {});
  check('ion drive: on in flight, switched off once not flying', on && !q.ionOn);
  const q2 = fresh('pad'); q2.S.ionThrust = 0.25; q2.sh.xe = 0.4; Game.toggleIon(q2);
  check('ion drive will not start on the pad', !q2.ionOn);

  // empty RCS: a slow reaction wheel still turns you (no soft-lock), and the hint says why it is slow
  const e = fresh('orbit'); e.sh.rcs = 0; H.run(e, 60, { keys: ['KeyA'] });
  const w1 = e.sh.omega, full = fresh('orbit'); H.run(full, 60, { keys: ['KeyA'] });
  check('RCS empty: reaction wheel turns at ~15% torque, uses nothing', w1 > 0 && Math.abs(w1 / full.sh.omega - 0.15) < 0.03 && e.sh.rcs === 0 && /RCS empty/.test(Game.hint(e)),
        `omega ${w1.toFixed(3)} vs ${full.sh.omega.toFixed(3)} rad/s`);
  const k = fresh('pad'); k.money = 900; H.run(k, 1, { pressed: ['KeyR'] }); H.run(k, 1, { pressed: ['KeyR'] });
  check('R R on the pad still tows (not docked)', k.money < 900);
}


// ---------------- 12. v4 side pods and the dash (Mule numbers), astro i-frames and suit armor, g.opts ----------------
{
  const MULE = { dry: 4.02, fuel: 6.0, ionTank: 0, ve: 465, thrust: 36, sideThrust: 11.25, sideVe: 0, dashBoost: 4, dashT: 0.4, dashCd: 1.5 };
  const mule = (patch = {}) => {
    const g = fresh('orbit'), { x, y, vx, vy, ang } = g.sh;
    Object.assign(g.S, MULE, patch);
    Object.assign(g.sh, Physics.newShip(g.S), { x, y, vx, vy, ang });
    g.everFlew = true; g.navId = null;
    return g;
  };
  const tap = { pressed: ['ArrowLeft'] };                                     // a tap: pressed and released inside one frame
  const g = mule(), c = mule(), f0 = g.sh.fuel;
  H.run(g, 1, tap); H.run(g, 2, {}); H.run(g, 1, tap); H.run(g, 60, {});       // double-tap within DASH_TAP, then coast 1 s
  H.run(c, 64, {});                                                            // the clone just coasts
  const dvx = g.sh.vx - c.sh.vx, dvy = g.sh.vy - c.sh.vy, dv = Math.hypot(dvx, dvy), along = (-dvx * Math.sin(g.sh.ang) + dvy * Math.cos(g.sh.ang)) / dv;
  const sv = Physics.sideVeOf(g.S), want = sv * Math.log(10.02 / (10.02 - 4 * 11.25 / sv * 0.4));
  check('Mule dash: double-tap ← gives 1.80 m/s to the left', Math.abs(dv - 1.80) < 0.05 && Math.abs(dv - want) < 0.01 && along > 0.9999 && g.events.some((e) => /dash left/.test(e.msg)),
        `${dv.toFixed(3)} m/s (rocket eq. ${want.toFixed(3)}), ${((f0 - g.sh.fuel) * 1000).toFixed(1)} kg of methalox`);
  const until = g.dash.until;
  H.run(g, 1, tap); H.run(g, 2, {}); H.run(g, 1, tap);
  check('...a second dash inside dashCd is refused (DASH RECHARGING)', g.dash.until === until && g.toasts.some((t) => t.text === 'DASH RECHARGING'), `ready in ${(g.dash.readyAt - g.t).toFixed(2)} s`);
  H.run(g, 60, {}); H.run(g, 1, { pressed: ['ArrowRight'] }); H.run(g, 1, { pressed: ['ArrowRight'] });
  check('...after the cooldown, double-tap → dashes right', g.dash.until > until && g.dash.dir === -1, '');
  const slow = mule(); H.run(slow, 1, tap); H.run(slow, 30, {}); H.run(slow, 1, tap);
  check('...two taps further apart than 0.25 s do not dash', slow.dash.until < 0, '');

  const p = mule(); Game.setWarp(p, 16); H.run(p, 1, { keys: ['ArrowLeft'] });
  const pk = { ...p.fired }, pw = p.warp;
  H.run(p, 1, { keys: ['ArrowLeft', 'ShiftLeft'] });
  check('pods fitted: ← fires the pods (warp drops to 1x), Shift+← is the RCS nudge', pk.side === 1 && !pk.trans && pw === 1 && p.fired.trans === 1 && !p.fired.side,
        `← side ${pk.side} trans ${pk.trans} at ${pw}x; Shift+← side ${p.fired.side} trans ${p.fired.trans}`);
  const v3 = mule({ sideThrust: 0, dashBoost: 0 }); H.run(v3, 1, { keys: ['ArrowLeft'] }); const v3k = { ...v3.fired };
  H.run(v3, 1, tap); H.run(v3, 1, tap);
  check('no pods: ← is the v3 RCS nudge and double-taps do nothing', v3k.trans === 1 && !v3k.side && v3.dash.until < 0, '');

  const a = fresh(), A = a.astro; A.on = true; A.hp = 100;
  Game.hurtAstro(a, 40); const h1 = A.hp;
  A.invUntil = a.t + 1; Game.hurtAstro(a, 40); const h2 = A.hp;
  A.invUntil = 0; a.S.suitArmor = 0.25; Game.hurtAstro(a, 40);
  check('astro: i-frames (invUntil) dodge a hit (MISS!), suit armor soaks 25%', h1 === 60 && h2 === 60 && A.hp === 30 && a.popups.some((q) => q.text === 'MISS!'), `hp 100 -> ${h1} -> ${h2} -> ${A.hp}`);

  const o = { dev: true, fresh: true, build: 'deadbeef', inf: true }, go = Game.create(7, 'pad', o); o.build = 'changed';
  check('g.opts keeps a shallow copy of the create options', go.opts !== o && go.opts.build === 'deadbeef' && go.opts.inf === true && JSON.stringify(Game.create(7, 'pad', { fresh: true }).opts) === '{"fresh":true}',
        JSON.stringify(go.opts));
}


// ---------------- 13. v4 flight fixes: warp reasons, liftoff, honest brake hint, the wreck, the pad, odd saves ----------------
{
  const e = fresh('orbit'); H.run(e, 5, {}); H.run(e, 1, { pressed: ['KeyE'] });
  e.warpIdx = CONFIG.sim.warps.length - 1; H.run(e, 10, { keys: ['ArrowLeft'] });
  check('on a tether the warp reason is the spacewalk, not "thrusters firing"', e.mode === 'eva' && e.warp === 1 && e.warpWhy === 'spacewalk', `${e.mode} ${e.warp}x ${e.warpWhy}`);

  const l = fresh('pad'); let warned = 0;
  for (let i = 0; i < 420; i++) { H.run(l, 1, { keys: ['KeyW'] }); if (l.status === 'flying' && ((l.pred && l.pred.impact) || /impact/.test(l.warpWhy))) warned++; }
  check('a liftoff under thrust (lift > 1) never warns of impact', l.status === 'flying' && warned === 0, `${warned} frames with an impact warning, alt ${Game.nearestBody(l, l.sh.x, l.sh.y).alt.toFixed(0)} m`);

  const w = fresh('orbit'), mo = w.w.byId.mochi, [mx, my, mvx, mvy] = World.bodyState(w.w, mo, w.t);
  Object.assign(w.sh, { x: mx, y: my + mo.R + 120, vx: mvx, vy: mvy }); w.everFlew = true;
  w.S.thrust = 0.6 * Physics.mass(w.sh, w.S) * mo.mu / (mo.R * mo.R); Game.refresh(w);
  const ht = Game.hint(w);
  check('lift < 1: the impact hint says braking cannot save it', /cannot hold this ship up here \(lift 0\.60x\)/.test(ht) && !/hold W/.test(ht), ht);

  const d = fresh('pad'), [bx0, by0] = World.bodyState(d.w, d.w.byId.mochi, d.t), off0 = [d.sh.x - bx0, d.sh.y - by0];
  Game.die(d, 'test'); d.warpIdx = CONFIG.sim.warps.length - 1; H.run(d, 120, {});
  const [bx1, by1] = World.bodyState(d.w, d.w.byId.mochi, d.t), drift = Math.hypot(d.sh.x - bx1 - off0[0], d.sh.y - by1 - off0[1]);
  check('a wreck on the ground rides its body, hull 0, warp held at 1x', d.status === 'dead' && drift < 0.5 && d.sh.hull === 0 && d.warp === 1 && /wrecked/.test(d.warpWhy), `drift ${drift.toFixed(2)} m, ${d.warp}x ${d.warpWhy}`);

  const p = fresh('orbit'), pad = Game.navTargets(p).find((n) => n.id === 'mochi:pad');
  if (pad) {
    const [px, py] = pad.state(p.t), [cx, cy] = World.bodyState(p.w, p.w.byId.mochi, p.t), th = Math.atan2(py - cy, px - cx);
    p.everFlew = true; Game.landAt(p, p.w.byId.mochi, th + 1.2); H.run(p, 5, {});
    const far = p.done.land_mochi === undefined;
    Game.landAt(p, p.w.byId.mochi, th); H.run(p, 5, {});
    check('land_mochi pays on the pad only (not 1.2 rad round the rock)', far && p.done.land_mochi !== undefined && /Mochi Pad/.test(Game.GOALS.find((gl) => gl.id === 'land_mochi').text), `far: ${far ? 'not paid' : 'PAID'}, pad: ${p.done.land_mochi !== undefined ? 'paid' : 'not paid'}`);
  } else check('land_mochi pays on the pad only', false, 'no mochi:pad target');

  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const s0 = fresh('pad'); s0.money = 777; Game.save(s0);
  const key = Object.keys(store)[0], sv = JSON.parse(store[key]);
  sv.money = '1234'; sv.cargo = { __proto__: null, toString: 5, ice: 3, rock: -2 }; store[key] = JSON.stringify(sv).replace('"cargo":{', '"cargo":{"__proto__":9,');
  let err = null, s1 = null; try { s1 = Game.create(7, 'pad'); } catch (x) { err = x.message; }
  check('a hand-edited save: "1234" money is read, odd cargo keys dropped', !err && s1.money === 1234 && s1.cargo.ice === 3 && !Object.hasOwn(s1.cargo, 'toString') && !Object.hasOwn(s1.cargo, 'rock') && Object.getPrototypeOf(s1.cargo) === Object.prototype,
        err || `$${s1.money} ${JSON.stringify(s1.cargo)}`);
  Game.wipeSave(); delete global.localStorage;
}


// ---------------- the starter trip: Mochi Hub -> Pretzel -> land -> Hub, stock ship, real game loop ----------------
//  A tiny flight computer plays the careful pilot: it plans a coast that misses every rock and moon (waiting for
//  a gap in Mochi's rings), burns it with the main engine, trims twice, hovers down onto Pretzel, then does the
//  same back to the Hub port and presses F.  Attitude is set by fiat (no RCS); thrust, fuel and collisions are the game's.
{
  const AP = { mode: 'off', g: null, used: 0, frameDt: 1 / 20 };
  Game.register({ id: 'autopilot', shipCtrl(g, ctrl) { if (AP.g === g && AP.mode !== 'off') steer(g, ctrl); } });
  function steer(g, ctrl) {
    const sh = g.sh, aMax = g.S.thrust / Physics.mass(sh, g.S);
    if (AP.mode === 'burn') {                                       // deliver AP.dv by thrust, full throttle, then stop
      const left = Math.hypot(AP.dv[0], AP.dv[1]);
      if (left < 0.02) { AP.mode = 'off'; return; }
      ctrl.main = Math.min(1, left / (aMax * AP.frameDt)); sh.ang = Math.atan2(AP.dv[1], AP.dv[0]); sh.omega = 0;
      const got = ctrl.main * aMax * AP.frameDt;
      AP.dv[0] -= AP.dv[0] / left * got; AP.dv[1] -= AP.dv[1] / left * got;
      return;
    }
    const [px, py, pvx, pvy, pax, pay] = AP.point(g.t), dx = px - sh.x, dy = py - sh.y, d = Math.hypot(dx, dy), rvx = sh.vx - pvx, rvy = sh.vy - pvy;
    const sp = Math.min(AP.vcap, Math.sqrt(0.6 * aMax * d), 0.3 * d), [gx, gy] = World.gravity(g.w, sh.x, sh.y, g.t);   // 'goto': braking curve + gravity feed-forward
    const ax = ((d > 1e-6 ? dx / d * sp : 0) - rvx) / 1.5 + pax - gx, ay = ((d > 1e-6 ? dy / d * sp : 0) - rvy) / 1.5 + pay - gy, a = Math.hypot(ax, ay);
    ctrl.main = a > 0.02 ? Math.min(1, a / aMax) : 0;
    if (ctrl.main) { sh.ang = Math.atan2(ay, ax); sh.omega = 0; }
    AP.d = d; AP.v = Math.hypot(rvx, rvy);
  }
  const withAcc = (st) => (t) => { const p = st(t), a = st(t + 0.05), b = st(t - 0.05); return [p[0], p[1], p[2], p[3], (a[2] - b[2]) / 0.1, (a[3] - b[3]) / 0.1]; };
  const bodyPoint = (g, b, lx, ly) => withAcc((t) => { const s = World.bodyState(g.w, b, t); return [s[0] + lx, s[1] + ly, s[2], s[3]]; });

  // free fall in World gravity after an optional finite burn (kick m/s at aB m/s^2); onStep(x, y, t, vx, vy, dt)
  function coast(w, s, t, T, onStep, kick = null, aB = 1) {
    let [x, y, vx, vy] = s, left = kick ? Math.hypot(kick[0], kick[1]) : 0, [ax, ay] = World.gravity(w, x, y, t);
    const tEnd = t + T, ux = left ? kick[0] / left : 0, uy = left ? kick[1] / left : 0;
    while (t < tEnd - 1e-9) {
      const fa = left > 1e-9 ? aB : 0, dt = Math.min(fa ? Math.min(0.05, left / aB) : 0.5, tEnd - t);
      vx += (ax + ux * fa) * dt / 2; vy += (ay + uy * fa) * dt / 2; x += vx * dt; y += vy * dt; t += dt;
      [ax, ay] = World.gravity(w, x, y, t); vx += (ax + ux * fa) * dt / 2; vy += (ay + uy * fa) * dt / 2;
      left -= fa * dt;
      if (onStep) onStep(x, y, t, vx, vy, dt);
    }
    return [x, y, vx, vy];
  }
  // the kick that lands state s (at t0) on point P(t0 + T): Newton on the miss, numerical Jacobian, damped steps
  function shoot(w, s, t0, T, P, guess, aB) {
    const tgt = P(t0 + T);
    let dv = guess ? guess.slice() : [(tgt[0] - s[0]) / T - s[2], (tgt[1] - s[1]) / T - s[3]];
    for (let it = 0; it < 15; it++) {
      const end = (d) => coast(w, s, t0, T, null, d, aB), e0 = end(dv), mx = e0[0] - tgt[0], my = e0[1] - tgt[1];
      if (Math.hypot(mx, my) < 0.5) return { dv, arrive: e0 };
      const ex = end([dv[0] + 0.01, dv[1]]), ey = end([dv[0], dv[1] + 0.01]);
      const J = [[(ex[0] - e0[0]) / 0.01, (ey[0] - e0[0]) / 0.01], [(ex[1] - e0[1]) / 0.01, (ey[1] - e0[1]) / 0.01]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      let sx = (J[1][1] * mx - J[0][1] * my) / det, sy = (-J[1][0] * mx + J[0][0] * my) / det;
      const sm = Math.hypot(sx, sy); if (sm > 10) { sx *= 10 / sm; sy *= 10 / sm; }
      dv = [dv[0] - sx, dv[1] - sy];
    }
    return null;
  }
  // closest the flight comes to a rock or a moon surface [m] (closest approach inside each step)
  function clearance(g, s, t0, T, skip, kick, aB) {
    let worst = Infinity, who = '';
    const gap = (x, y, vx, vy, o, rr, h) => {
      const dx = x - o[0], dy = y - o[1], ux = vx - o[2], uy = vy - o[3], u2 = ux * ux + uy * uy, tau = u2 > 1e-9 ? Math.max(0, Math.min(h, (dx * ux + dy * uy) / u2)) : 0;
      return Math.hypot(dx - ux * tau, dy - uy * tau) - rr;
    };
    coast(g.w, s, t0, T, (x, y, t, vx, vy, h) => {
      const st = World.states(g.w, t);
      for (const rk of g.w.rocks) {
        const hs = st[rk.host.idx];
        if (rk.gone || Math.abs(Math.hypot(x - hs[0], y - hs[1]) - rk.a) > rk.ae + rk.r + 40) continue;
        const d = gap(x, y, vx, vy, World.rockState(g.w, rk, t), rk.r + g.S.radius, h);
        if (d < worst) { worst = d; who = `rock ${rk.id}`; }
      }
      for (const b of g.w.bodies) {
        if (b === skip || b.star) continue;
        const d = gap(x, y, vx, vy, st[b.idx], b.R * (1 + b.shape) + g.S.radius, h);
        if (d < worst) { worst = d; who = b.name; }
      }
    }, kick, aB);
    return { worst, who };
  }
  // cheapest clear transfer: go at t0 = now + wait (from(t0) = where we will be), coast T; cost = kick + match on arrival
  function plan(g, P, from, skip) {
    const aB = g.S.thrust / Physics.mass(g.sh, g.S);
    let best = null, n = 0;
    for (let wt = 0; wt <= 300; wt += 15) {
      const t0 = g.t + wt, s = from(t0).slice(0, 4);
      let guess = null;
      for (const T of [500, 700, 900]) {
        const sol = shoot(g.w, s, t0, T, P, guess, aB);
        if (!sol) continue;
        n++; guess = sol.dv;
        const tg = P(t0 + T), cost = Math.hypot(...sol.dv) + Math.hypot(sol.arrive[2] - tg[2], sol.arrive[3] - tg[3]);
        if (best && cost >= best.cost) continue;
        const c = clearance(g, s, t0, T, skip, sol.dv, aB);
        if (c.worst > 6) best = { wt, T, t0, dv: sol.dv, cost, gap: c.worst, who: c.who };
      }
    }
    if (best) best.n = n;
    return best;
  }

  const g = Game.create(7, 'hub', { fresh: true }); AP.g = g;
  const hub = Stations.byId(g, 'hub'), pz = g.w.byId.pretzel, mochi = g.w.byId.mochi, dv0 = Physics.deltaV(g.sh, g.S), t0 = g.t, ms0 = Date.now();
  const used = () => dv0 - Physics.deltaV(g.sh, g.S), notes = [];
  const runUntil = (cond, max, warp = 1) => { for (let f = 0; f < max && g.status !== 'dead' && !cond(); f++) { if (warp > 1) Game.setWarp(g, warp); else g.warpIdx = 0; H.run(g, 1, {}, AP.frameDt); } };
  const leg = (name) => { const l = `${name} t+${(g.t - t0).toFixed(0)} s, ${used().toFixed(1)} m/s used, hull ${g.sh.hull}`; notes.push(l); console.log('      ' + l); };
  const aim = (point, vcap) => Object.assign(AP, { mode: 'goto', vcap, point, d: Infinity });
  function transfer(P, from, skip, hold) {
    const p = plan(g, P, from, skip);
    if (!p) { leg('no clear transfer found'); return false; }
    console.log(`      plan (${p.n} solved): wait ${p.wt} s, coast ${p.T} s, kick ${Math.hypot(...p.dv).toFixed(1)} + match ~${(p.cost - Math.hypot(...p.dv)).toFixed(1)} m/s, closest pass ${p.gap.toFixed(0)} m (${p.who})`);
    if (hold) { runUntil(() => g.t >= p.t0 - 40, 1e6, 16); aim(hold, 3); }        // wait on the ground, climb to the start point
    runUntil(() => g.t >= p.t0 - 1e-9, 1e6);
    const aB = () => g.S.thrust / Physics.mass(g.sh, g.S), sol = shoot(g.w, [g.sh.x, g.sh.y, g.sh.vx, g.sh.vy], g.t, p.t0 + p.T - g.t, P, p.dv, aB());
    Object.assign(AP, { mode: 'burn', dv: (sol || p).dv.slice() }); runUntil(() => AP.mode === 'off', 20 * 60);
    for (const frac of [0.5, 0.85]) {                                                  // mid-course trims
      runUntil(() => g.t >= p.t0 + frac * p.T, 1e6, 64);
      const tr = shoot(g.w, [g.sh.x, g.sh.y, g.sh.vx, g.sh.vy], g.t, p.t0 + p.T - g.t, P, [0, 0], aB());
      if (tr && Math.hypot(...tr.dv) > 0.05) { Object.assign(AP, { mode: 'burn', dv: tr.dv.slice() }); runUntil(() => AP.mode === 'off', 20 * 30); }
    }
    runUntil(() => g.t >= p.t0 + p.T - 2, 1e6, 64);
    return true;
  }

  // out: undock, coast to 120 m over Pretzel's Mochi-facing side, hover down
  const [mx, my] = World.bodyState(g.w, mochi, g.t), [qx, qy] = World.bodyState(g.w, pz, g.t), L = Math.hypot(mx - qx, my - qy), u = [(mx - qx) / L, (my - qy) / L];
  const over = bodyPoint(g, pz, u[0] * 120, u[1] * 120), up = bodyPoint(g, pz, u[0] * 100, u[1] * 100);
  H.run(g, 1, { keys: ['KeyW'] }, AP.frameDt); H.run(g, 1, {}, AP.frameDt); leg('undocked');
  const s0 = [g.sh.x, g.sh.y, g.sh.vx, g.sh.vy], tA = g.t, drift = (t) => (t > tA + 1e-9 ? coast(g.w, s0, tA, t - tA) : s0);
  transfer(over, drift, pz); leg('coasted to Pretzel');
  aim(over, 3); runUntil(() => AP.d < 3 && AP.v < 0.3, 20 * 300); leg('holding 120 m over Pretzel');
  aim(bodyPoint(g, pz, u[0] * (pz.R - 5), u[1] * (pz.R - 5)), 1); runUntil(() => g.status === 'landed', 20 * 300); AP.mode = 'off';
  const landed = g.status === 'landed' && g.landedOn === pz, dvLand = used(); leg(`landed on ${g.landedOn ? g.landedOn.name : '?'}`);
  H.run(g, 40, {}, AP.frameDt);
  // back: wait on Pretzel for a gap, lift off, coast to 40 m outside the Hub port, close in, F
  const near = withAcc((t) => { const p = hub.portState(t), [hx, hy] = World.bodyState(g.w, mochi, t), r = Math.hypot(p[0] - hx, p[1] - hy); return [p[0] + (p[0] - hx) / r * 40, p[1] + (p[1] - hy) / r * 40, p[2], p[3]]; });
  transfer(near, up, mochi, up); leg('coasted back to the Hub');
  aim(withAcc((t) => hub.portState(t)), 2); runUntil(() => AP.d < 5 && AP.v < 0.4, 20 * 300); AP.mode = 'off'; leg('at the Hub port');
  H.run(g, 1, { pressed: ['KeyF'] }, AP.frameDt); H.run(g, 80, {}, AP.frameDt); leg(g.status);
  const dvAll = used();
  check('starter trip: Hub -> Pretzel, land (job done)', landed && g.done.pretzel !== undefined, `landed after ${dvLand.toFixed(0)} m/s`);
  check('...and back to dock at the Hub, not a scratch on the hull', g.status === 'docked' && g.attach && /Hub/.test(g.attach.name) && g.sh.hull === g.S.hull,
        `${g.status} at ${g.attach ? g.attach.name : '-'}, hull ${g.sh.hull}/${g.S.hull}, ${((g.t - t0) / 60).toFixed(0)} min of game time, ${((Date.now() - ms0) / 1000).toFixed(0)} s wall`);
  check('...on well under half the stock tank (and inside v3\'s whole 131 m/s)', dvAll < 0.5 * dv0 && dvAll < 131, `${dvAll.toFixed(1)} of ${dv0.toFixed(0)} m/s (${(100 * dvAll / dv0).toFixed(0)}%)`);
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
