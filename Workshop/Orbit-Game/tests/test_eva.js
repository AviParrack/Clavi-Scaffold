// ======================================================================
//  EVA TESTS  —  step out only when landed, walking stays on the ground
//  (Mochi, Kiwi, Seed), riding a moving rock, jump comes back down, Seed
//  cannot be escaped, laser digs ore into the pack, gems + scanner, board
//  unloads the pack, air runs out -> recall, tether recall, laser zaps a
//  target, ship death while out, jobs, save/load, camera, NaN-free art, fuzz.
//    node tests/test_eva.js
// ======================================================================

const H = require('./harness');
H.load({ only: 'eva,evatest' });

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
const mouseAt = (x, y, down = true) => ({ x, y, sx: 400, sy: 300, px: 0.05, down, pressed: false, released: false, button: 0 });
// aim at a spot fixed on a body (local lx, ly): bodies ride rails now, so the world point moves every frame
const mouseOn = (g, b, lx, ly, down = true) => { const [bx, by] = World.bodyState(g.w, b, g.t); return mouseAt(bx + lx, by + ly, down); };


// ---------------- 1. stepping out only when landed ----------------
{
  const g = fresh('orbit');
  H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyE'] });
  check('no stepping out in orbit', g.mode === 'ship' && !g.astro.on && !g.prompts.some((p) => p.key === 'KeyE'), `${g.status} ${g.mode}`);
  const c = g.w.byId.mochi;
  Game.dock(g, { name: 'Test Port', state: (t) => { const r = 420, n = Math.sqrt(c.mu / r ** 3); return [r * Math.cos(n * t), r * Math.sin(n * t), -r * n * Math.sin(n * t), r * n * Math.cos(n * t)]; }, ang: 0 });
  H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyE'] });
  check('no stepping out while docked', g.mode === 'ship' && !g.astro.on, g.status);

  const p = fresh('pad');
  H.run(p, 1, {});
  check('landed: E prompt says "Step outside"', p.prompts.some((x) => x.key === 'KeyE' && x.text === 'Step outside'), p.prompts.map((x) => x.text).join(','));
  H.run(p, 1, { pressed: ['KeyE'] });
  check('E steps out: mode eva, astronaut on', p.mode === 'eva' && p.astro.on && EVA.isOut(p), `${p.mode}`);
  const d = Math.hypot(p.astro.x - p.sh.x, p.astro.y - p.sh.y);
  H.run(p, 30, {});
  check('astronaut appears on the ground beside the ship', d > p.S.radius && d < p.S.radius + 3 && M(p).grounded && alt(p) < 1.2, `${d.toFixed(2)} m from ship centre, alt ${alt(p).toFixed(2)}`);
  check('board prompt shows next to the ship', p.prompts.some((x) => x.key === 'KeyE' && x.text.startsWith('Board')), p.prompts.map((x) => x.text).join(','));
  p.warpIdx = CONFIG.sim.warps.length - 1; H.run(p, 2, {});
  check('warp capped at 1x on foot', p.warp === 1 && p.warpWhy === 'on foot', `${p.warp}x ${p.warpWhy}`);
  check('camera follows (~22 px/m), local up = screen up', (() => { const c2 = Game.first(p, 'camera'); return c2 && c2.zoom === EVA.ZOOM && Math.abs(c2.rot - (p.astro.ang - Math.PI / 2)) < 1e-9 && finite(c2.x, c2.y); })(), '');
  check('controls line switches to on-foot keys', (Game.first(p, 'controls') || '').startsWith('A/D walk'), '');
  check('mouse clicks are consumed on foot (no ship targeting)', Game.call(p, Game.mods.find((m) => m.id === 'eva'), 'onMouse', { pressed: true }) === true, '');
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


// ---------------- 8. tether: too far from the ship -> warning -> recall (pack kept) ----------------
{
  const g = outOn('mochi', Math.PI / 2), c = g.w.byId.mochi, th = Math.PI / 2 - 165 / 300;
  const r = World.surfaceR(c, th) + 1.2;
  Object.assign(g.astro, { x: r * Math.cos(th), y: r * Math.sin(th), vx: 0, vy: 0 });
  g.pack = { ice: 10 }; H.run(g, 60, {});
  check('far from the ship: warning + countdown', M(g).lost > 0 && toastHas(g, 'TETHER') && Game.hint(g).includes('Tether'), Game.hint(g));
  H.run(g, 6 * 60, {});
  check('tether recall: back in the ship, pack kept in the hold', g.mode === 'ship' && g.cargo.ice === 10 && toastHas(g, 'TETHER RECALL'), JSON.stringify(g.cargo));
  check('recall drops the stale "turn back" nag from the toast queue', !g.toasts.some((t) => t.key === 'evaTether' || t.key === 'evaO2'), g.toasts.map((t) => t.text).join(' | '));

  // HP hits 0 on the very frame the tether would reel you in: the suit failure wins, nothing left at 0 HP
  const g2 = outOn('mochi', Math.PI / 2);
  Object.assign(g2.astro, { x: r * Math.cos(th), y: r * Math.sin(th), vx: 0, vy: 0 });
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
  check('save round-trips hauled kg and gems found', M(g2).hauled === 15 && M(g2).gems === 1, JSON.stringify(Game.call(g2, Game.mods.find((m) => m.id === 'eva'), 'save')));
  check('a pack saved mid-walk lands in the hold on load', g2.mode === 'ship' && g2.cargo.ice === 15 && g2.cargo.salt === 1 && Game.kgOf(g2.pack) === 0, JSON.stringify(g2.cargo));
  const g3 = Game.create(7, 'pad');
  Game.call(g3, Game.mods.find((m) => m.id === 'eva'), 'load', { hauled: NaN, gems: 'lots', outs: -4 });
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

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
