// ======================================================================
//  MOCHI TESTS  —  Downtown's carve, unbreakable lining, the pad's ice seam,
//  save, walks and lift rides with the real eva.js, gates, auto-call, spots,
//  outposts and their shops, the tunnels spawn, the downtown job, isolation.
//  node tests/test_mochi.js        (design/mochi.md §15, contract §7.2)
// ======================================================================

const H = require('./harness');
const ONLY = process.argv[2] === '--only' ? process.argv[3] : null;
H.load({ only: ONLY || 'economy,eva,mochi' });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${info}`);
  ok ? nPass++ : nFail++;
}
const done = () => { console.log(`${nPass} passed, ${nFail} failed`); process.exit(nFail ? 1 : 0); };


// ---------------- 12. isolation: run as a child with --only <mods> ----------------
if (ONLY) {
  const g = Game.create(7, 'pad', { fresh: true, noSave: true }), T = Terrain.of(g.w.byId.mochi);
  for (const b of g.w.bodies) Terrain.of(b);
  H.run(g, 600, { keys: ['KeyW'] });
  const carved = !!T.zone;
  check(`only '${ONLY}': builds and steps 600 frames`, Number.isFinite(g.sh.x) && !g.err, `${g.status}, t ${g.t.toFixed(1)} s`);
  check(`only '${ONLY}': town carved only with mochi on`, carved === ONLY.split(',').includes('mochi'), `zone grid ${carved}`);
  done();
}

const TW = Mochi.TOWN, MAT = Terrain.MAT_ID, FIX = Terrain.MATS.map((m) => !!m.fixed);
const fresh = (spawn = 'pad') => Game.create(7, spawn, { fresh: true, noSave: true });
const count = (T, id) => { let n = 0; for (let k = 0; k < T.grid.length; k++) if (T.grid[k] === id) n++; return n; };
const hashGrid = (G) => { let h = 2166136261; for (let k = 0; k < G.length; k++) { h ^= G[k]; h = Math.imul(h, 16777619); } return h >>> 0; };

// astronaut helpers (town coords: x m east of the pad along radius r)
function townPos(g) {
  const b = g.w.byId.mochi, [bx, by] = World.bodyState(g.w, b, g.t), lx = g.astro.x - bx, ly = g.astro.y - by, r = Math.hypot(lx, ly) - TW.DR;
  return { x: TW.xAt(Math.atan2(ly, lx), r), r, feet: r - 0.75 };
}
function put(g, x, r) {
  const b = g.w.byId.mochi, [lx, ly, ux, uy] = TW.floorAt(x, r), [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
  Object.assign(g.astro, { x: bx + lx + ux * 0.9, y: by + ly + uy * 0.9, vx: bvx, vy: bvy, ang: Math.atan2(uy, ux) });
  g.mod.eva.grounded = false; g.mod.eva.o2 = 1e9; H.run(g, 60, {});
}
const park = (g, r) => { const L = g.mod.mochi.lift; Object.assign(L, { r, target: r, v: 0, idle: -1e9 }); H.run(g, 2, {}); };
function walk(g, x0, r0, x1, tmax = 60) {
  put(g, x0, r0);
  const hp0 = g.astro.hp, key = x1 > x0 ? 'KeyD' : 'KeyA', past = (p) => (x1 > x0 ? p.x >= x1 : p.x <= x1);
  let n = 0;
  for (; n < tmax * 60 && !past(townPos(g)); n++) { H.run(g, 1, { keys: [key] }); g.mod.eva.o2 = 1e9; }
  return { ok: past(townPos(g)), t: n / 60, hurt: hp0 - g.astro.hp, p: townPos(g) };
}


// ---------------- 1. carve ----------------
const g = fresh(), mochi = g.w.byId.mochi, T = Terrain.of(mochi);
{
  const g2 = fresh(), T2 = Terrain.of(g2.w.byId.mochi);
  check('carve: two fresh builds give identical grids', hashGrid(T.grid) === hashGrid(T2.grid), `hash ${hashGrid(T.grid)}`);
  const c = T.carve;
  check('carve: > 8,000 cells dug and > 2,500 lined', c.carved > 8000 && c.lined > 2500, JSON.stringify(c));
  const ids = new Set(T.zones.map((z) => z.id)), want = [...TW.STREETS, ...TW.ROOMS, ...TW.RAMPS, ...TW.SHAFTS].map((z) => z.id).concat('workings');
  check('carve: every zone id from the tables', want.every((id) => ids.has(id)), `${ids.size} ids, ${T.zones.length} zones`);
  const bad = T.gems.filter((gm) => { const k = Terrain.index(T, gm.lx, gm.ly); return T.zone[k] || FIX[T.grid[k]]; });
  check('carve: no gem left in a street or in stone', bad.length === 0, `${T.gems.length} gems`);
  check('carve: zone cells are all open (dug)', (() => { for (let k = 0; k < T.grid.length; k++) if (T.zone[k] && T.grid[k] >= Terrain.REG && T.grid[k] !== MAT.deck && T.grid[k] !== MAT.wall) return false; return true; })());
}


// ---------------- 2. unbreakable lining; the pad's ice seam ----------------
{
  const g2 = fresh(), T2 = Terrain.of(g2.w.byId.mochi), walls = count(T2, MAT.wall), slabs = count(T2, MAT.slab);
  const zoneOpen = () => { let n = 0; for (let k = 0; k < T2.grid.length; k++) if (T2.zone[k] && T2.grid[k] === Terrain.DUG) n++; return n; };
  const open0 = zoneOpen();
  const [rx, ry] = TW.floorAt(0, 293.6);                           // the Pantry's roof
  let fixed = 0;
  for (let i = 0; i < 300; i++) fixed += Terrain.dig(T2, rx + (i % 7 - 3) * 0.8, ry + 1, 6, 99).fixed;
  check('300 big digs on the Pantry roof: no wall/slab/deck lost', count(T2, MAT.wall) === walls && count(T2, MAT.slab) === slabs, `wall ${walls}, slab ${slabs}, ${fixed} CLINKs`);
  check('...and the town\'s open cells are untouched', zoneOpen() === open0 && fixed > 0, `${open0} open`);
  const r = Terrain.dig(T2, rx, ry - 0.2, 0.6, 99);
  check('dig on Murk-stone reports fixed hits and digs no cells', r.fixed > 0 && r.cells === 0, JSON.stringify({ cells: r.cells, fixed: r.fixed }));

  let slabNear = 0, ice = 0;
  const rs = World.surfaceR(mochi, Math.PI / 2);
  Terrain.forCells(T, 0, rs - 6, 14, (k) => {
    const i = k % T.N, j = (k - i) / T.N, x = -T.half + (i + 0.5) * Terrain.CELL, y = -T.half + (j + 0.5) * Terrain.CELL;
    const th = Math.atan2(y, x), arc = Math.abs(th - Math.PI / 2) * rs, depth = World.surfaceR(mochi, th) - Math.hypot(x, y);
    if (arc < 12 && T.grid[k] === MAT.slab) slabNear++;
    if (arc <= 8 && depth > 0.5 && depth < 2.5 && T.grid[k] === MAT.ice) ice++;
  });
  check('the main pad is not slab', slabNear === 0, `${slabNear} slab cells within 12 m`);
  check('an ice seam lies 0.5-2.5 m under the pad', ice >= 100, `${ice} ice cells`);
  const gp = fresh(), Tp = Terrain.of(gp.w.byId.mochi), [bx, by] = World.bodyState(gp.w, gp.w.byId.mochi, gp.t);
  let kg = 0, deep = 0;
  for (let i = 0; i < 400; i++) {
    const res = Game.dig(gp, gp.w.byId.mochi, bx + 2, by + rs - 0.3 - i * 0.02, 0.8, 1);
    kg += res.yield.ice || 0; deep += res.fixed;
  }
  check('a dig under the pad yields ice', kg > 0, `${kg} kg ice`);
  check('...and stops at the Pantry\'s lining', Terrain.mat(Tp, 2, rs - 8) !== Terrain.SPACE && deep >= 0, `${deep} CLINKs`);
}


// ---------------- 3. save ----------------
{
  const g2 = fresh(), T2 = Terrain.of(g2.w.byId.mochi);
  H.run(g2, 30, {});
  check('save: a fresh game\'s terrain snapshot is null', Terrain.snapshot(T2) === null);
  const [wx, wy] = TW.floorAt(-58, 230.5 + 4.2);                   // between the mine face and the first Workings cave
  const res = Terrain.dig(T2, wx, wy, 1.2, 99), snap = Terrain.snapshot(T2);
  let zoneInRuns = 0;
  for (let i = 0; i + 1 < snap.dug.length; i += 2) for (let k = snap.dug[i]; k < snap.dug[i] + snap.dug[i + 1]; k++) if (T2.zone[k]) zoneInRuns++;
  check('save: a dig in the Old Workings saves only its own cells', res.cells > 0 && zoneInRuns === 0 && snap.dug.length <= 2 * res.cells, `${res.cells} cells, ${snap.dug.length / 2} runs`);
  const g3 = fresh(), T3 = Terrain.of(g3.w.byId.mochi);
  park(g3, TW.F2);
  const deck0 = count(T3, MAT.deck), wall0 = count(T3, MAT.wall);
  Terrain.restore(T3, JSON.parse(JSON.stringify(snap)));
  check('save: a restore reproduces the dig', Terrain.mat(T3, wx, wy) === Terrain.DUG);
  check('...and leaves the lift deck and gates alone', count(T3, MAT.deck) === deck0 && count(T3, MAT.wall) === wall0, `deck ${deck0}, wall ${wall0}`);
}


// ---------------- 4. walks (real eva.js) ----------------
EVA.stepOut(g); H.run(g, 30, {});
{
  park(g, TW.F1);
  const a = walk(g, -52, 297.6, 80), b = walk(g, 80, TW.F1, -52);
  check('walk: surface -> West Stair -> Pantry -> Skylight < 45 s', a.ok && a.t < 45 && a.hurt === 0, `${a.t.toFixed(1)} s, ${a.hurt} HP`);
  check('walk: ...and back up the stair < 45 s', b.ok && b.t < 45 && b.hurt === 0, `${b.t.toFixed(1)} s, ${b.hurt} HP`);
  park(g, TW.F2);
  const c = walk(g, -60, TW.F2, 36), d = walk(g, 36, TW.F2, -60);
  check('walk: Low Street end to end, both ways, over the deck', c.ok && d.ok && !c.hurt && !d.hurt, `${c.t.toFixed(1)} s / ${d.t.toFixed(1)} s`);
  park(g, TW.F3);
  const e = walk(g, 14, TW.F3, -61), f = walk(g, -61, 236, 10);
  check('walk: the Cellar down the Old Workings ramp and back', e.ok && f.ok && !e.hurt && !f.hurt, `${e.t.toFixed(1)} s / ${f.t.toFixed(1)} s`);
  park(g, TW.TOP);
  const s1 = walk(g, -10, 297.3, 30), s2 = walk(g, 30, 297.4, -30);
  check('walk: the surface across the lift house, both ways', s1.ok && s2.ok, `${s1.t.toFixed(1)} s / ${s2.t.toFixed(1)} s`);
}


// ---------------- 5. lift rides ----------------
{
  const L = g.mod.mochi.lift, axis = TW.xAt(TW.LIFT.th, TW.TOP);
  park(g, TW.TOP); put(g, axis, TW.TOP);
  const key = { [TW.TOP]: 'Digit1', [TW.F1]: 'Digit2', [TW.F2]: 'Digit3', [TW.F3]: 'Digit4' };
  for (const to of [TW.F1, TW.F2, TW.F3, TW.TOP]) {
    const from = L.r, d = Math.abs(to - from), tExp = d / TW.LIFT.vmax + TW.LIFT.vmax / TW.LIFT.acc, hp0 = g.astro.hp;
    H.run(g, 1, { pressed: [key[to]] });
    let n = 1, air = 0;
    for (; n < 60 * 40 && !(L.v === 0 && L.r === to); n++) { H.run(g, 1, {}); g.mod.eva.o2 = 1e9; if (!g.mod.eva.grounded) air++; }
    H.run(g, 30, {});
    const p = townPos(g);
    check(`lift: ${from} -> ${to} in d/v + v/a, no harm`, Math.abs(n / 60 - tExp) < 0.3 && g.astro.hp === hp0 && air <= 2 && Math.abs(p.feet - to) < 0.4,
      `${(n / 60).toFixed(2)} s (${tExp.toFixed(2)}), ${air} airborne frames, feet ${p.feet.toFixed(2)}`);
  }
  check('lift: F on the deck offers the next stop', g.prompts.some((q) => /^Lift: going down to Main Street/.test(q.text)), g.prompts.map((q) => q.text).join(' | '));
}


// ---------------- 5b. riders stay on: every stop to every other, standing anywhere on the deck ----------------
{
  const L = g.mod.mochi.lift, stops = TW.LIFT.stops.map((q) => q.r), bad = [];
  let rides = 0, worst = 0;
  for (const from of stops) for (const to of stops) for (const off of [-1.2, 0, 1.2]) {
    if (from === to) continue;
    park(g, from); put(g, TW.xAt(TW.LIFT.th, from + 1) + off, from);
    const hp0 = g.astro.hp;
    H.run(g, 1, { pressed: ['Digit' + (stops.indexOf(to) + 1)] });
    for (let n = 0; n < 60 * 40 && !(L.v === 0 && L.r === to); n++) { H.run(g, 1, {}); g.mod.eva.o2 = 1e9; }
    H.run(g, 20, {});
    const p = townPos(g), x = p.x - TW.xAt(TW.LIFT.th, p.r);
    worst = Math.max(worst, Math.abs(x - off));
    rides++; if (Math.abs(p.feet - to) > 0.4 || Math.abs(x) > TW.LIFT.deck / 2 || g.astro.hp !== hp0) bad.push(`${from}->${to}@${off}: feet ${p.feet.toFixed(1)} x ${x.toFixed(2)}`);
  }
  check(`lift: ${rides} rides, every pair of stops from x -1.2/0/+1.2: all arrive`, bad.length === 0, bad.slice(0, 3).join(' | ') || `worst sideways drift ${worst.toFixed(2)} m`);
}

// ---------------- 6. gates ----------------
{
  park(g, TW.F3);
  const a = walk(g, 10, 297.3, 30, 12), b = walk(g, 10, TW.F1, 30, 12);
  check('gates: the car below closes the surface gate', !a.ok && a.p.x < 19.0, `stopped at x ${a.p.x.toFixed(2)}`);
  check('gates: ...and the Main Street gate', !b.ok && b.p.x < 18.07, `stopped at x ${b.p.x.toFixed(2)}`);
  park(g, TW.F1);
  const c = walk(g, 10, TW.F1, 24.5, 15);
  check('gates: with the car at Main Street you walk across', c.ok, `x ${c.p.x.toFixed(2)}`);
}


// ---------------- 7. auto-call ----------------
{
  const L = g.mod.mochi.lift;
  park(g, TW.TOP); put(g, 0, TW.F2); L.idle = 0;
  let n = 0; for (; n < 60 * 16 && !(L.r === TW.F2 && L.v === 0); n++) { H.run(g, 1, {}); g.mod.eva.o2 = 1e9; }
  check('auto-call: waiting on Low Street brings the car', L.r === TW.F2 && n / 60 < 3 + 12.5 + 0.3, `${(n / 60).toFixed(1)} s`);
}


// ---------------- 8. spots ----------------
{
  const sp = Mochi.spots(g), ids = sp.map((s) => s.id);
  const roles = ['pad', 'outpost-ice', 'outpost-iron', 'market', 'canteen', 'gallery', 'cellar', 'archive', 'skylight',
                 'guild', 'shrine', 'workings', 'lift', 'guide', 'pump9', 'pitstop', 'forge', 'brinepit'];
  check('spots: 18, unique ids, every role', sp.length === 18 && new Set(ids).size === 18 && roles.every((r) => ids.includes(r)), ids.join(' '));
  const bad = [];
  for (const s of sp) {
    const Tb = Terrain.of(g.w.byId[s.body]), tx = s.uy, ty = -s.ux;
    for (const f of [-0.45, 0, 0.45]) {
      const ox = s.lx + tx * f * s.w, oy = s.ly + ty * f * s.w;
      const hit = Terrain.raycast(Tb, ox + s.ux * 0.6, oy + s.uy * 0.6, -s.ux, -s.uy, 1.6);
      const clear = hit && [0.15, 0.6, 1.0, 1.6].every((h) => !Terrain.solid(Tb, hit.lx + s.ux * h, hit.ly + s.uy * h));
      if (!hit || !clear) bad.push(`${s.id}@${f}`);
    }
  }
  check('spots: floor within 1 m below and 1.6 m clear above', bad.length === 0, bad.join(' ') || 'all standable across their width');
  check('airAt: the Pantry has air, the Skylight none', Mochi.airAt(g, ...world(g, 0, TW.F1 + 1)) && !Mochi.airAt(g, ...world(g, 76, TW.F1 + 1)));
  const axis = TW.xAt(TW.LIFT.th, TW.F2);
  check('airAt: the Clunk Lift shaft and the West Stair have air (newplayer H3)', Mochi.airAt(g, ...world(g, axis, TW.F2 + 6)) && Mochi.airAt(g, ...world(g, -30, 292.4)));
  const na = (x, r) => Mochi.nearestAir(g, ...world(g, x, r)) || { name: 'none', d: NaN };
  const n1 = na(-60, TW.surface(-60) + 1), n2 = na(40, TW.surface(40) + 1), n3 = na(76, TW.F1 + 1);
  check('nearestAir: the stair from the west, the lift from the east, a hall from the Skylight', n1.name === 'the West Stair' && n2.name === 'the Clunk Lift' && n3.d < 8,
    `${n1.name} ${n1.d.toFixed(0)} m · ${n2.name} ${n2.d.toFixed(0)} m · ${n3.name} ${n3.d.toFixed(1)} m`);
}
function world(g2, x, r) { const [lx, ly] = TW.floorAt(x, r), [bx, by] = World.bodyState(g2.w, g2.w.byId.mochi, g2.t); return [bx + lx, by + ly]; }


// ---------------- 9. outposts and their shops ----------------
for (const o of TW.OUTPOSTS) {
  const g2 = fresh(), b = g2.w.byId[o.body], Tb = Terrain.of(b), p = Tb.plinths[o.id];
  let worst = 0;
  for (let s = -o.w / 2 + 0.3; s <= o.w / 2 - 0.3; s += 0.25) {
    const th = o.th - s / p.rp, c = Math.cos(th), sn = Math.sin(th), hit = Terrain.raycast(Tb, (p.rp + 3) * c, (p.rp + 3) * sn, -c, -sn, 6);
    const k = hit ? Terrain.index(Tb, hit.lx, hit.ly) : -1, i = k % Tb.N, j = (k - i) / Tb.N;
    const rc = hit ? Math.hypot(-Tb.half + (i + 0.5) * Terrain.CELL, -Tb.half + (j + 0.5) * Terrain.CELL) : 0;
    if (!hit || Tb.grid[k] !== MAT.slab || rc >= p.rp || Math.abs(Math.hypot(hit.lx, hit.ly) - p.rp) > 0.4) worst++;   // 0.5 m cells on a tilted top: ±0.4
  }
  Game.landAt(g2, b, o.th); const h0 = g2.sh.hull; H.run(g2, 300, {});
  let opened = null; const orig = Econ.openShop; Econ.openShop = (g3, st) => { opened = st.id; return true; };
  const pr = g2.prompts.find((q) => /^Open /.test(q.text)); if (pr) pr.act(g2); Econ.openShop = orig;
  check(`outpost ${o.id} on ${o.body}: flat top, safe landing, F opens its shop`, worst === 0 && g2.status === 'landed' && g2.sh.hull === h0 && opened === o.id,
    `rp ${p.rp}, ${worst} bumps, ${g2.status}, hull ${g2.sh.hull}, "${pr ? pr.text : 'no prompt'}"`);
}
{
  const g2 = fresh(), o = TW.OUTPOSTS[0];
  Game.landAt(g2, g2.w.byId.mochi, o.th + 8 / 302); H.run(g2, 60, {}); EVA.stepOut(g2); H.run(g2, 30, {});
  const kx = o.th - o.kx / 302, [bx, by, bvx, bvy] = World.bodyState(g2.w, g2.w.byId.mochi, g2.t);
  Object.assign(g2.astro, { x: bx + 303 * Math.cos(kx), y: by + 303 * Math.sin(kx), vx: bvx, vy: bvy, ang: kx }); H.run(g2, 60, {});
  check('outpost on foot: the keeper\'s counter offers the shop', g2.prompts.some((q) => q.text === 'Open Frostbite Flats (Foreman Okra)'), g2.prompts.map((q) => q.text).join(' | '));
  const ice = Econ.sellPrice(g2, 'ice', Mochi.ST.frostbite) / Econ.sellPrice(g2, 'ice', null);
  check('Frostbite Flats buys ice at 1.1x', Math.abs(ice - 1.1) < 1e-9, `${ice.toFixed(3)}x`);
}


// ---------------- 10. the tunnels spawn ----------------
{
  const g2 = fresh('tunnels');
  let n = 0; for (; n < 60 && !g2.mod.eva.grounded; n++) H.run(g2, 1, {});
  const z = Mochi.zoneAt(g2, g2.astro.x, g2.astro.y);
  check('spawn tunnels: on foot in the Pantry, grounded within 1 s', g2.mode === 'eva' && z && z.id === 'pantry' && n < 60, `${z && z.id}, ${n} frames`);
  check('spawn tunnels: the lift waits at Main Street', g2.mod.mochi.lift.r === TW.F1);
}


// ---------------- 11. the downtown job; fries ----------------
{
  const g2 = fresh('tunnels'), L = g2.mod.mochi.lift, m0 = g2.money;
  H.run(g2, 30, {});
  put(g2, TW.xAt(TW.LIFT.th, TW.F1), TW.F1);
  check('job: downtown is not done in the Pantry', g2.done.downtown === undefined);
  H.run(g2, 1, { pressed: ['Digit4'] });
  for (let n = 0; n < 60 * 20 && g2.done.downtown === undefined; n++) { H.run(g2, 1, {}); g2.mod.eva.o2 = 1e9; }
  check('job: riding to the Cellar pays downtown (+$75)', g2.done.downtown !== undefined && g2.money === m0 + 75, `$${m0} -> $${g2.money}, lift at ${L.r}`);
  put(g2, 33, TW.F1); g2.astro.hp = 40;
  const pr = g2.prompts.find((q) => /Fries/.test(q.text)), m1 = g2.money;
  if (pr) pr.act(g2);
  check('fries at the Noodle Hole: $5, suit patched', pr && g2.money === m1 - 5 && g2.astro.hp === g2.astro.hpMax, pr ? `HP ${g2.astro.hp}` : 'no prompt');
  put(g2, -11, TW.F1);
  const mb = g2.prompts.find((q) => q.text === 'Read the map'); if (mb) mb.act(g2);
  check('map board: F opens the map, a walk key closes it', mb && g2.mod.mochi.map && (H.run(g2, 2, { keys: ['KeyD'] }), !g2.mod.mochi.map));
  put(g2, -11, TW.F1); if (mb) mb.act(g2);
  H.run(g2, 1, { pressed: ['Escape'] });
  check('Esc closes the map board, and does not pause the game', mb && !g2.mod.mochi.map && !g2.paused, `map ${g2.mod.mochi.map}, paused ${g2.paused}`);
}


// ---------------- 11b. the town pad: a nav target, and the way back when you land far from it (newplayer H1) ----------------
{
  const g2 = fresh(), b = g2.w.byId.mochi, pad = Game.navTargets(g2).find((t) => t.id === Mochi.PAD_ID);
  const [px, py, pvx, pvy] = pad ? pad.state(g2.t) : [0, 0, 0, 0], [bx, by, bvx, bvy] = World.bodyState(g2.w, b, g2.t);
  check('nav: "Mochi Pad" is a target on top of the pad, riding Mochi', pad && /Pad/.test(pad.name) && Math.abs(Math.hypot(px - bx, py - by) - World.surfaceR(b, Math.PI / 2) - 1.2) < 1e-6 && pvx === bvx && pvy === bvy,
    pad ? `${pad.name}, ${(Math.hypot(px - bx, py - by)).toFixed(1)} m from Mochi's centre` : 'missing');
  const rows = [];
  for (const [th, dir] of [[Math.PI / 2 + 0.5, 'right'], [Math.PI / 2 - 1.2, 'left']]) {
    const g3 = fresh(); Game.landAt(g3, g3.w.byId.mochi, th); g3.everFlew = true; H.run(g3, 5, {});
    const d = Math.round(Math.abs(th - Math.PI / 2) * World.surfaceR(g3.w.byId.mochi, Math.PI / 2)), h = Game.hint(g3);
    rows.push(new RegExp(`^Town pad: ${d} m to your ${dir}.*~\\d+ m/s of fuel`).test(h) ? 'ok' : h);
  }
  check('landed far from the pad: how far, which way, and what the hop costs', rows.every((r) => r === 'ok'), rows.join(' | '));
  const g4 = fresh(); Game.landAt(g4, g4.w.byId.mochi, Math.PI / 2 + 0.1); g4.done.mine = g4.t; H.run(g4, 5, {});
  check('landed by the pad after mining: Downtown with the real walking distances', /walk 14 m left to the West Stair or 51 m right to the Clunk Lift/.test(Game.hint(g4)), Game.hint(g4));
}


// ---------------- 13. art: drawWorld and drawHUD on a stub canvas, everywhere ----------------
{
  const calls = {}, grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : /^create(Radial|Linear)Gradient$/.test(k) ? () => grad : k === 'measureText' ? () => ({ width: 40 }) : () => { calls[k] = (calls[k] || 0) + 1; }),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const mod = Game.mods.find((m) => m.id === 'mochi');
  function art(g2, x, y, zoom = 32) {
    for (const k in calls) delete calls[k];
    const kit = { ctx, W: 1280, H: 760, cam: { zoom }, px: () => 1 / zoom, LIGHT: [-0.55, 0.83], FONT: 'sans-serif', INK: '#1b1433', COL: { dim: '#6d5f8a' },
      viewRect: (pad = 0) => [x - 640 / zoom - pad, y - 380 / zoom - pad, x + 640 / zoom + pad, y + 380 / zoom + pad],
      roundRect() {}, comicPanel: (x0, y0) => y0 + 32, stackRight: () => 60, outlinedText() {} };
    let err = null; try { mod.drawWorld(g2, kit); mod.drawHUD(g2, kit); mod.hint(g2); mod.interactions(g2); } catch (e) { err = e.message; }
    return { err, fills: calls.fill || 0, text: calls.fillText || 0 };
  }
  const g2 = fresh('tunnels'); H.run(g2, 30, {});
  const at = (x, r) => { put(g2, x, r); return [g2.astro.x, g2.astro.y]; };
  const rows = [['Pantry', 0, TW.F1], ['Noodle Hole', 33, TW.F1], ['Dig Hall', 56, TW.F1], ['Skylight', 77, TW.F1], ['Shrine', -56, TW.F2], ['Gallery', -25, TW.F2],
                ['Nook', 31, TW.F2], ['Cellar', -9, TW.F3], ['Workings', -57, 236], ['stair head', -50, 297.4], ['lift house', 15, 297.4]];
  const bad = [], low = [];
  for (const [name, x, r] of rows) { const [wx, wy] = at(x, r), a = art(g2, wx, wy); if (a.err) bad.push(`${name}: ${a.err}`); if (a.fills < 40) low.push(`${name} ${a.fills}`); }
  check('art: every chamber draws (and hints) without a throw', !bad.length, bad.join('; ') || `${rows.length} places`);
  check('art: every chamber has props on screen', !low.length, low.join(', ') || 'all > 40 fills');
  const [wx, wy] = at(0, TW.F1); g2.mod.mochi.map = true;
  const mp = art(g2, wx, wy); g2.mod.mochi.map = false;
  const far = art(g2, wx, wy, 3), off = art(g2, wx, wy, 1);
  check('art: map overlay, ant-farm zoom and far zoom draw clean', !mp.err && !far.err && !off.err && mp.text > 10 && off.fills < 5, `map ${mp.text} labels, far ${far.fills} fills, off (HUD only) ${off.fills}`);
  const g3 = fresh('pad'), fb = g3.w.byId.mochi; Terrain.of(fb);
  Game.landAt(g3, fb, Math.PI / 2 + 0.9); H.run(g3, 30, {});
  const op = art(g3, g3.sh.x, g3.sh.y, 18);
  check('art: Frostbite Flats draws from the ship', !op.err && op.fills > 20, op.err || `${op.fills} fills`);
}


// ---------------- 14. other seeds: the town hangs under that seed's pad ----------------
{
  const rows = [];
  for (const seed of [1, 2, 99]) {
    const g4 = Game.create(seed, 'tunnels', { fresh: true, noSave: true }), L = g4.mod.mochi.lift;
    Terrain.of(g4.w.byId.mochi); H.run(g4, 30, {});
    const up = walk(g4, 0, TW.F1, -47, 40), upOk = up.ok && !up.hurt && Math.abs(up.p.feet - TW.surface(up.p.x)) < 0.8;
    park(g4, TW.F1); put(g4, TW.xAt(TW.LIFT.th, TW.F1), TW.F1);
    H.run(g4, 1, { pressed: ['Digit1'] });
    for (let n = 0; n < 60 * 15 && !(L.r === TW.TOP && L.v === 0); n++) { H.run(g4, 1, {}); g4.mod.eva.o2 = 1e9; }
    const hp0 = g4.astro.hp;
    for (let n = 0; n < 60 * 15 && townPos(g4).x < 30; n++) { H.run(g4, 1, { keys: ['KeyD'] }); g4.mod.eva.o2 = 1e9; }
    const p = townPos(g4), liftOk = p.x >= 30 && Math.abs(p.feet - TW.surface(p.x)) < 0.8 && g4.astro.hp === hp0;
    const sp = Mochi.spots(g4).filter((q) => q.id === 'pad' || q.id === 'guide').every((q) => Math.abs(Math.hypot(q.lx, q.ly) - TW.DR - TW.surface(TW.xAt(Math.atan2(q.ly, q.lx), 297))) < 0.05);
    rows.push(`seed ${seed} DR ${TW.DR} top ${TW.TOP}: stair ${upOk ? 'ok' : 'STUCK'}, lift ${liftOk ? 'ok' : 'STUCK'}, spots ${sp ? 'ok' : 'off'}`);
    if (!upOk || !liftOk || !sp) rows.push('!');
  }
  check('other seeds: stair and lift reach that seed\'s surface', !rows.includes('!'), rows.filter((r) => r !== '!').join(' | '));
}


// ---------------- 12. isolation (child processes) ----------------
{
  const cp = require('child_process');
  for (const only of ['mochi', 'eva']) {
    let out = '', ok = true;
    try { out = cp.execFileSync(process.execPath, [__filename, '--only', only], { encoding: 'utf8' }); } catch (e) { out = (e.stdout || '') + e.message; ok = false; }
    const tail = out.trim().split('\n').pop();
    check(`isolation: only '${only}' runs clean`, ok && /^\d+ passed, 0 failed$/.test(tail), tail);
  }
}

done();
