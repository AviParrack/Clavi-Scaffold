// ======================================================================
//  MOBS TESTS  —  lazy waking, crawling on the grid, hops and bites,
//  laser squishing, jelly, the bug job, sleeping, 64x warp, save, nests.
//  node tests/test_mobs.js
// ======================================================================

const H = require('./harness');
H.load({ only: 'mobs' });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = 'pad') => Game.create(7, spawn, { fresh: true });
const bodyOf = (g, id) => g.w.byId[id];
const altOf = (b, lx, ly) => Math.hypot(lx, ly) - World.surfaceR(b, Math.atan2(ly, lx));
const finite = (bug) => isFinite(bug.lx + bug.ly + bug.vx + bug.vy + bug.ua);
const bugsOn = (g, id) => Mobs.list(g).filter((b) => b.home === id);

// park the ship (motionless relative to the body) at altitude `alt` above body id, polar angle th
function hover(g, id, alt, th = 1) {
  const b = bodyOf(g, id), [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t), r = World.surfaceR(b, th) + alt;
  Object.assign(g.sh, { x: bx + r * Math.cos(th), y: by + r * Math.sin(th), vx: bvx, vy: bvy });
  g.status = 'flying'; g.landedOn = null; g.land = null;
}

// a fake astronaut standing on the ground at polar angle th, pinned to the moving body every frame
function astronautAt(g, id, th, lift = 0.8) {
  const b = bodyOf(g, id), T = Terrain.of(b), c = Math.cos(th), s = Math.sin(th), R = World.surfaceR(b, th) + 8;
  const hit = Terrain.raycast(T, R * c, R * s, -c, -s, 60);
  const p = { b, lx: hit.lx + c * lift, ly: hit.ly + s * lift };
  g.mode = 'eva'; g.astro.on = true; g.astro.hp = g.astro.hpMax;
  p.pin = () => { const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t); Object.assign(g.astro, { x: bx + p.lx, y: by + p.ly, vx: bvx, vy: bvy }); };
  p.pin();
  return p;
}
function runPinned(g, p, frames, each) {
  for (let f = 0; f < frames; f++) { p.pin(); Game.update(g, H.input(), 1 / 60); if (each && each(f) === false) break; }
}
const nearestBug = (g, id, lx, ly) => bugsOn(g, id).sort((a, b) => Math.hypot(a.lx - lx, a.ly - ly) - Math.hypot(b.lx - lx, b.ly - ly))[0];


// ---------------- 1. nests and the job ----------------
{
  const g = fresh();
  const homes = ['kiwi', 'potato', 'dorito'].map((id) => Mobs.home(g, id));
  check('nests: Kiwi 6, Big Potato 3, Dorito 1', homes.map((h) => h.nests.length).join(',') === '6,3,1', homes.map((h) => `${h.id} ${h.nests.length}`).join(' '));
  const onSurface = homes.every((h) => h.nests.every((n) => Math.abs(altOf(h.b, n.lx, n.ly)) < 0.01));
  check('nests sit on the surface outline', onSurface);
  const job = Game.GOALS.find((gl) => gl.id === 'bug');
  check('bug job registered (order 70, $100)', job && job.order === 70 && job.reward === 100, job ? job.text : 'missing');
  check('no bugs and no sleepers on a Mochi start', Mobs.list(g).length === 0 && homes.every((h) => !h.awake));
}


// ---------------- 2. lazy: wake within 200 m, hysteresis, sleep far ----------------
{
  const g = fresh('pad');
  H.run(g, 30, {});
  check('bugs stay asleep while you are on Mochi', Mobs.list(g).length === 0);
  hover(g, 'kiwi', 150); H.run(g, 3, {});
  const kiwi = Mobs.home(g, 'kiwi');
  check('150 m above Kiwi: Kiwi bugs wake (cap 8)', kiwi.awake && bugsOn(g, 'kiwi').length === 8, `${bugsOn(g, 'kiwi').length} awake`);
  check('...only Kiwi wakes', !Mobs.home(g, 'potato').awake && !Mobs.home(g, 'dorito').awake && Mobs.list(g).every((b) => b.home === 'kiwi'));
  const spawnAlt = bugsOn(g, 'kiwi').map((b) => altOf(kiwi.b, b.lx, b.ly));
  check('...spawned on the ground near their nests', spawnAlt.every((a) => a > -0.6 && a < 1.6), spawnAlt.map((a) => a.toFixed(2)).join(' '));
  check('...from nests (8 out, 10 still home)', kiwi.nests.reduce((s, n) => s + n.out, 0) === 8 && kiwi.nests.reduce((s, n) => s + n.stock, 0) === 10);
  hover(g, 'kiwi', 230); H.run(g, 3, {});
  check('230 m: still awake (hysteresis, sleeps past 260)', kiwi.awake && bugsOn(g, 'kiwi').length === 8);
  hover(g, 'kiwi', 320); H.run(g, 3, {});
  check('320 m: asleep, bugs back home', !kiwi.awake && Mobs.list(g).length === 0 && kiwi.nests.every((n) => n.stock === 3 && n.out === 0),
        kiwi.nests.map((n) => `${n.stock}/${n.out}`).join(' '));
  hover(g, 'potato', 120); H.run(g, 3, {});
  check('Big Potato: 5 armoured Tater Tanks (r 0.75)', bugsOn(g, 'potato').length === 5 && bugsOn(g, 'potato').every((b) => b.sp === 'beetle' && b.r === 0.75));
  hover(g, 'dorito', 60); H.run(g, 3, {});
  check('Dorito: a couple of Nacho Nibblers', bugsOn(g, 'dorito').length === 2 && bugsOn(g, 'dorito').every((b) => b.sp === 'nacho'), `${bugsOn(g, 'dorito').length}`);
  check('far from Potato, its beetles went to bed', !Mobs.home(g, 'potato').awake && bugsOn(g, 'potato').length === 0);
}


// ---------------- 3. crawling: 60 s on Kiwi, on the ground, near home ----------------
{
  const g = fresh('kiwi'), b = bodyOf(g, 'kiwi'), T = Terrain.of(b), home = Mobs.home(g, 'kiwi');
  H.run(g, 2, {});
  const ids = bugsOn(g, 'kiwi').map((x) => x.id);
  let samples = 0, grounded = 0, embedded = 0, bad = 0, maxAlt = -Infinity, maxArc = 0, moved = 0;
  const start = Object.fromEntries(bugsOn(g, 'kiwi').map((x) => [x.id, [x.lx, x.ly]]));
  for (let f = 0; f < 60 * 60; f++) {
    Game.update(g, H.input(), 1 / 60);
    if (f % 10) continue;
    for (const x of bugsOn(g, 'kiwi')) {
      samples++;
      if (!finite(x)) { bad++; continue; }
      if (Terrain.collideCircle(T, x.lx, x.ly, x.r + 0.3)) grounded++;
      if (Terrain.collideCircle(T, x.lx, x.ly, x.r * 0.4)) embedded++;
      maxAlt = Math.max(maxAlt, altOf(b, x.lx, x.ly));
      const n = home.nests[x.nest]; maxArc = Math.max(maxArc, Math.abs(Math.atan2(Math.sin(Math.atan2(x.ly, x.lx) - n.th), Math.cos(Math.atan2(x.ly, x.lx) - n.th))) * b.R);
    }
  }
  for (const x of bugsOn(g, 'kiwi')) if (start[x.id] && Math.hypot(x.lx - start[x.id][0], x.ly - start[x.id][1]) > 1) moved++;
  check('60 s on Kiwi: the same 8 bugs, all finite', bugsOn(g, 'kiwi').length === 8 && bugsOn(g, 'kiwi').every((x) => ids.includes(x.id)) && !bad, `${bugsOn(g, 'kiwi').length} bugs, ${bad} NaN samples`);
  check('...touching the ground > 97% of the time', grounded / samples > 0.97, `${(100 * grounded / samples).toFixed(1)}% of ${samples}`);
  check('...never sunk into rock, never floating off', embedded === 0 && maxAlt < 2.5, `embedded ${embedded}, max alt above outline ${maxAlt.toFixed(2)} m`);
  check('...they wander, but stay near their nests', moved >= 5 && maxArc < 22, `${moved}/8 moved > 1 m, max ${maxArc.toFixed(1)} m (arc) from home`);
}


// ---------------- 4. a stationary astronaut: notice, squash, hop, bite ----------------
{
  const g = fresh('kiwi'), kb = bodyOf(g, 'kiwi'), home = Mobs.home(g, 'kiwi');
  H.run(g, 2, {});
  const p = astronautAt(g, 'kiwi', home.nests[0].th + 12 / kb.R);
  let squashed = false, hopped = false, firstBite = null, sawHint = false, minWarp = 99, chasing = false;
  const watch = nearestBug(g, 'kiwi', p.lx, p.ly);
  runPinned(g, p, 60 * 20, (f) => {
    const x = watch && !watch.dead ? watch : null;
    if (x && x.squash > 0) squashed = true;
    if (x && squashed && !x.ground && x.squash <= 0) hopped = true;
    if (x && x.mode === 'chase' && x.tgt === 'astro') chasing = true;
    if (firstBite == null && g.astro.hp < g.astro.hpMax) firstBite = g.t;
    if (/Bugs! Hold left click on them .*\(a bite costs 8 suit\)/.test(Game.hint(g))) sawHint = true;
    minWarp = Math.min(minWarp, g.warpMax);
  });
  check('a nearby bug notices and chases the astronaut', chasing, watch ? `${watch.name}` : 'no bug');
  check('...telegraphs with a squash, then hops', squashed && hopped);
  check('...and bites (CHOMP!, -8 hp)', firstBite != null && g.astro.hp <= g.astro.hpMax - 8 && g.events.some((e) => /bit you\s+-8 hp/.test(e.msg)),
        firstBite != null ? `first bite at ${firstBite.toFixed(1)} s, hp ${g.astro.hp}` : 'no bite');
  check('...bites have a cooldown (no machine-gun chomping)', g.events.filter((e) => /bit you/.test(e.msg)).length <= 2 * 20 / 1.5 + 2,
        `${g.events.filter((e) => /bit you/.test(e.msg)).length} bites in 20 s`);
  check('hint: "Bugs! Hold left click on them... (a bite costs 8 suit)"', sawHint);
  check('warp capped while bugs attack', minWarp <= 2, `min warp cap ${minWarp}x`);
  check('the ship in flight is ignored', g.sh.hull === g.S.hull, `hull ${g.sh.hull}`);
}


// ---------------- 5. bugs follow you down a dug hole ----------------
{
  const g = fresh('kiwi'), kb = bodyOf(g, 'kiwi'), home = Mobs.home(g, 'kiwi');
  H.run(g, 2, {});
  const th = home.nests[0].th + 7 / kb.R, R = World.surfaceR(kb, th), [bx, by] = World.bodyState(g.w, kb, g.t);
  for (let d = 0; d <= 3; d += 0.5) for (let i = 0; i < 6; i++) Game.dig(g, kb, bx + (R - d) * Math.cos(th), by + (R - d) * Math.sin(th), 1.6, 1);
  const p = astronautAt(g, 'kiwi', th);
  const depth = World.surfaceR(kb, th) - Math.hypot(p.lx, p.ly);
  let reached = false, bit = false;
  runPinned(g, p, 60 * 40, () => {
    const x = nearestBug(g, 'kiwi', p.lx, p.ly);
    if (x && Math.hypot(x.lx - p.lx, x.ly - p.ly) < 1.4) reached = true;
    if (g.astro.hp < g.astro.hpMax) bit = true;
    return !(reached && bit);
  });
  check('bugs follow the terrain into a dug hole and bite', depth > 2 && reached && bit, `astronaut ${depth.toFixed(1)} m below the old surface, reached ${reached}, bit ${bit}`);
}


// ---------------- 6. laser squishing: muncher ~1 s, jelly, job ----------------
function laserUntilDead(g, bug, dps = 18) {
  let frames = 0;
  while (!bug.dead && frames < 600) {
    const tg = Game.targets(g).find((t) => t.id === bug.id);
    if (tg) tg.hit(g, dps / 60, 'laser', { x: g.astro.x, y: g.astro.y });
    Game.update(g, H.input(), 1 / 60); frames++;
  }
  return frames;
}
{
  const g = fresh('kiwi'), kb = bodyOf(g, 'kiwi'), home = Mobs.home(g, 'kiwi');
  H.run(g, 2, {});
  const p = astronautAt(g, 'kiwi', home.nests[2].th + 25 / kb.R);       // out of reach: the bug won't come to us
  const bug = bugsOn(g, 'kiwi').sort((a, b) => b.lx - a.lx)[0];
  const tg = Game.targets(g).find((t) => t.id === bug.id);
  check('targets hook: bug:<n>, team bug, r 0.45, a name', tg && /^bug:\d+$/.test(tg.id) && tg.team === 'bug' && tg.r === 0.45 && /Muncher/.test(tg.name), tg ? `${tg.id} "${tg.name}"` : 'none');
  const ray = Game.raycast(g, tg.x + 5, tg.y + 0.1, -1, 0, 10, { terrain: false, team: 'player' });
  check('Game.raycast can hit a bug', ray && ray.target && ray.target.id === bug.id, ray ? `t ${ray.t.toFixed(2)}` : 'miss');
  const money0 = g.money, out0 = home.nests[bug.nest].out, pk0 = g.pickups.length;
  const frames = laserUntilDead(g, bug);
  const jelly = g.pickups.slice(pk0).filter((x) => x.item === 'jelly');
  check('EVA laser (18 dps) squishes a muncher in ~1 s', bug.dead && frames >= 58 && frames <= 62, `${frames} frames`);
  check('...SQUISH! popup and a green splat', g.popups.some((x) => x.text === 'SQUISH!') && g.mod.mobs.splats.length === 1);
  check('...drops 1-2 bug jelly pickups', jelly.length >= 1 && jelly.length <= 2 && jelly.every((x) => x.qty === 1), `${jelly.length} jelly`);
  check('...bug job done, +$100', g.done.bug !== undefined && g.money === money0 + 100, `$${money0} -> $${g.money}`);
  check('...gone from targets, nest knows it is one short', !Game.targets(g).some((t) => t.id === bug.id) && home.nests[bug.nest].out === out0 - 1);
  H.run(g, 240, {});
  const rest = g.pickups.filter((x) => x.item === 'jelly');
  check('jelly falls and settles on Kiwi', rest.length && rest.every((x) => x.rest && x.rest.b === kb), rest.map((x) => (x.rest ? 'rest' : 'moving')).join(' '));
  const before = g.money; laserUntilDead(g, bugsOn(g, 'kiwi')[0]);
  check('second squish pays no second job reward', g.money === before && g.mod.mobs.kills === 2);
}
{
  const g = fresh('potato'), pb = bodyOf(g, 'potato'), home = Mobs.home(g, 'potato');
  H.run(g, 2, {});
  astronautAt(g, 'potato', home.nests[0].th + Math.PI);
  const bug = bugsOn(g, 'potato')[0];
  const frames = laserUntilDead(g, bug);
  check('a Tater Tank takes ~3 s of laser', bug.dead && frames >= 175 && frames <= 185, `${frames} frames`);
  const g2 = fresh('potato'); H.run(g2, 2, {});
  const tank = bugsOn(g2, 'potato')[0], hp0 = tank.hp;
  Game.targets(g2).find((t) => t.id === tank.id).hit(g2, 10, 'bullet', { x: g2.sh.x, y: g2.sh.y });
  check('...its shell shrugs off 40% of bullet damage', Math.abs(hp0 - tank.hp - 6) < 1e-9 && tank.flash > 0, `hp ${hp0} -> ${tank.hp}`);
}


// ---------------- 7. dealDamage, knockback, anger ----------------
{
  const g = fresh('kiwi'); H.run(g, 2, {});
  const bug = bugsOn(g, 'kiwi')[0], [bx, by] = World.bodyState(g.w, bug.b, g.t), wx = bx + bug.lx, wy = by + bug.ly;
  const v0 = [bug.vx, bug.vy];
  Game.dealDamage(g, { x: wx + 1, y: wy, r: 1, dmg: 6, kind: 'blast', team: 'pirate' });
  check('dealDamage (non-bug team) hurts a bug, flashes, knocks back', bug.hp === 12 && bug.flash > 0 && Math.hypot(bug.vx - v0[0], bug.vy - v0[1]) > 0.5 && bug.anger > 0,
        `hp ${bug.hp}, kick ${Math.hypot(bug.vx - v0[0], bug.vy - v0[1]).toFixed(2)} m/s`);
  const n = Game.dealDamage(g, { x: wx, y: wy, r: 1, dmg: 50, kind: 'bite', team: 'bug' });
  check('bug-team damage does not hurt bugs', bug.hp === 12 && !bug.dead, `${n} hit`);
}


// ---------------- 8. landed ship gets nibbled (a little), never in flight ----------------
{
  const g = fresh('kiwi'), kb = bodyOf(g, 'kiwi'), home = Mobs.home(g, 'kiwi');
  H.run(g, 2, {});
  Game.landAt(g, kb, home.nests[1].th + 2 / kb.R);
  let chewHint = false, cap = 99;
  for (let f = 0; f < 60 * 60; f++) {
    Game.update(g, H.input(), 1 / 60);
    if (/nibbling your hull/.test(Game.hint(g))) chewHint = true;
    cap = Math.min(cap, g.warpMax);
  }
  const loss = g.S.hull - g.sh.hull, nibbles = g.events.filter((e) => /NOM!/.test(e.msg)).length;
  check('bugs chew a landed ship next to their nest', nibbles >= 1 && loss > 0, `${nibbles} nibbles, -${loss} hull in 60 s`);
  check('...but only a little (2 hull per NOM!, ≤ 1 per 5 s each)', loss === 2 * nibbles && loss <= 30 && g.status === 'landed', `hull ${g.sh.hull}`);
  check('...with a hint and a warp cap', chewHint && cap <= 2, `cap ${cap}x`);
}


// ---------------- 9. max warp: landed on Kiwi, bugs awake, no NaN ----------------
{
  const g = fresh('kiwi'), kb = bodyOf(g, 'kiwi'), home = Mobs.home(g, 'kiwi');
  const n0 = home.nests[0].th, n1 = home.nests[1].th;
  Game.landAt(g, kb, (n0 + n1) / 2);
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 2, {});
  const t0 = Date.now(), tSim0 = g.t;
  let maxWarp = 0;
  for (let f = 0; f < 600; f++) { Game.update(g, H.input(), 1 / 60); maxWarp = Math.max(maxWarp, g.warp); }
  const ms = (Date.now() - t0) / 600, bugs = bugsOn(g, 'kiwi');
  const WMAX = CONFIG.sim.warps[CONFIG.sim.warps.length - 1];
  check(`${WMAX}x warp for 10 s real on Kiwi (hours of sim)`, maxWarp === WMAX && g.t - tSim0 > 500, `max warp ${maxWarp}x, ${(g.t - tSim0).toFixed(0)} s sim, ${ms.toFixed(1)} ms/frame`);
  check('...no NaN, bugs still on the ground', bugs.length === 8 && bugs.every(finite) && bugs.every((x) => Math.abs(altOf(kb, x.lx, x.ly)) < 2.5),
        bugs.map((x) => altOf(kb, x.lx, x.ly).toFixed(1)).join(' '));
  check('...CPU stays cool', ms < 6, `${ms.toFixed(2)} ms per ${WMAX}x frame (game + bugs)`);
  const M = g.mod.mobs, before = bugs.map((x) => [x.lx, x.ly]);
  Mobs.list(g).forEach((x) => { x.vx = 3; x.vy = -2; });
  for (const m of Game.mods) if (m.id === 'mobs') m.after(g, H.input(), 1 / 20, 3.2);
  check('a 3.2 s frame (64x at 20 fps) stays finite', Mobs.list(g).every(finite) && M.bugs.length === 8, before.length + ' bugs');
}


// ---------------- 10. nests regrow, recall far wanderers ----------------
{
  const g = fresh('kiwi'), home = Mobs.home(g, 'kiwi'); H.run(g, 2, {});
  astronautAt(g, 'kiwi', home.nests[0].th + Math.PI);
  for (const x of bugsOn(g, 'kiwi').slice(0, 3)) laserUntilDead(g, x);
  g.astro.on = false; g.mode = 'ship';
  const total = () => home.nests.reduce((s, n) => s + n.stock + n.out, 0);
  check('three squished: nests are 3 bugs short', total() === 15, `${total()} of 18`);
  hover(g, 'kiwi', 400); H.run(g, 2, {});
  g.t += 0; for (let i = 0; i < 4 * 60; i++) Game.update(g, H.input(), 1 / 60);
  for (const m of Game.mods) if (m.id === 'mobs') for (let i = 0; i < 300; i++) m.after(g, H.input(), 1 / 60, 1);
  check('...and grow them back slowly (one per nest per 240 s)', total() === 18, `${total()} of 18 after ~300 s`);
}


{
  const g = fresh('pad'), pb = bodyOf(g, 'potato'), home = Mobs.home(g, 'potato');
  const thA = home.nests[0].th;
  hover(g, 'potato', 150, thA); H.run(g, 3, {});
  const woke = bugsOn(g, 'potato').length;
  const thB = home.nests.map((n) => n.th).sort((a, b) => Math.abs(Math.cos(b - thA) + 1) - Math.abs(Math.cos(a - thA) + 1))[0];
  Game.landAt(g, pb, thB + 10 / pb.R);
  const p = astronautAt(g, 'potato', thB + 6 / pb.R);
  let closest = Infinity;
  runPinned(g, p, 60 * 30, () => { const x = nearestBug(g, 'potato', p.lx, p.ly); if (x) closest = Math.min(closest, Math.hypot(x.lx - p.lx, x.ly - p.ly)); });
  check('Big Potato: bugs find you on the far side (recall + nest pops)', woke === 5 && closest < 15 && bugsOn(g, 'potato').length <= 5, `woke ${woke}, closest ${closest.toFixed(1)} m`);
}


// ---------------- 11. digging out a nest collapses it ----------------
{
  const g = fresh('kiwi'), kb = bodyOf(g, 'kiwi'), home = Mobs.home(g, 'kiwi'); H.run(g, 2, {});
  const n = home.nests[3], [bx, by] = World.bodyState(g.w, kb, g.t), d = Math.hypot(n.lx, n.ly);
  for (let k = 0; k < 12; k++) Game.dig(g, kb, bx + n.lx * (1 - 0.8 / d), by + n.ly * (1 - 0.8 / d), 1.4, 1);
  for (let k = 0; k < 12; k++) Game.dig(g, kb, bx + n.lx * (1 - 1.6 / d), by + n.ly * (1 - 1.6 / d), 1.4, 1);
  const pk0 = g.pickups.length;
  H.run(g, 2, {});
  check('a nest dug out from under collapses (and spills jelly)', n.gone && n.stock === 0 && g.pickups.length - pk0 === 2 && g.popups.some((x) => x.text === 'NEST COLLAPSED!'));
  const others = home.nests.filter((x) => x !== n);
  check('...the other nests are intact', others.every((x) => !x.gone));
}


// ---------------- 12. save / load, respawn, tiny moons ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = fresh('kiwi'), home = Mobs.home(g, 'kiwi'); H.run(g, 2, {});
  astronautAt(g, 'kiwi', home.nests[0].th + Math.PI);
  laserUntilDead(g, bugsOn(g, 'kiwi')[0]);
  home.nests[5].gone = true;
  const want = home.nests.map((n) => (n.gone ? -1 : n.stock + n.out));
  Game.save(g);
  const g2 = Game.create(7, 'pad');
  const h2 = Mobs.home(g2, 'kiwi'), got = h2.nests.map((n) => (n.gone ? -1 : n.stock));
  check('save round-trips kills, nest stock and collapsed nests', g2.mod.mobs.kills === 1 && JSON.stringify(got) === JSON.stringify(want) && g2.done.bug !== undefined,
        `${JSON.stringify(want)} -> ${JSON.stringify(got)}`);
  Game.wipeSave(); delete global.localStorage;

  const g3 = fresh('kiwi'); H.run(g3, 2, {});
  astronautAt(g3, 'kiwi', 0); laserUntilDead(g3, bugsOn(g3, 'kiwi')[0]);
  Game.respawn(g3, 'tow'); H.run(g3, 2, {});
  check('tow home: bugs and splats cleared, nothing left awake', Mobs.list(g3).length === 0 && g3.mod.mobs.splats.length === 0 && !Mobs.home(g3, 'kiwi').awake);

  const g4 = fresh('kiwi'); H.run(g4, 2, {});
  const seed = bodyOf(g4, 'seed'), [sx, sy] = World.bodyState(g4.w, seed, g4.t);
  g4.mode = 'eva'; g4.astro.on = true;
  const pinSeed = () => { const [x, y, vx, vy] = World.bodyState(g4.w, seed, g4.t); Object.assign(g4.astro, { x, y: y + 12, vx, vy }); };
  for (let f = 0; f < 600; f++) { pinSeed(); Game.update(g4, H.input(), 1 / 60); }
  check('astronaut on tiny Seed: Kiwi bugs do not chase across space', Mobs.list(g4).every((x) => x.tgt !== 'astro') && g4.astro.hp === g4.astro.hpMax && Mobs.list(g4).every(finite));
}


// ---------------- 13. the golden muncher is shy ----------------
{
  const g = fresh('kiwi'), kb = bodyOf(g, 'kiwi'), home = Mobs.home(g, 'kiwi'); H.run(g, 2, {});
  const th = home.nests[4].th, p = astronautAt(g, 'kiwi', th + 6 / kb.R);
  const gold = Mobs.spawn(g, 'kiwi', th, { gold: true });
  const d0 = Math.hypot(gold.lx - p.lx, gold.ly - p.ly);
  let sawHint = false;
  runPinned(g, p, 60 * 6, () => { if (/golden muncher/.test(Game.hint(g))) sawHint = true; });
  const d1 = Math.hypot(gold.lx - p.lx, gold.ly - p.ly);
  check('a golden muncher runs away from you', gold.mode === 'flee' || d1 > d0 + 3, `${d0.toFixed(1)} m -> ${d1.toFixed(1)} m`);
  check('...with its own hint', sawHint);
  const pk0 = g.pickups.length; laserUntilDead(g, gold);
  check('...and pays a jelly jackpot', g.pickups.length - pk0 >= 4 && g.popups.some((x) => x.text === 'JACKPOT!'), `${g.pickups.length - pk0} jelly`);
}


// ---------------- 12. landing among bugs (with the suit module): a warning before you step out ----------------
{
  const { execFileSync } = require('child_process');
  const solo = `const H = require(${JSON.stringify(__dirname + '/harness')}); H.load({ only: 'mobs,eva' });
    const g = Game.create(7, 'kiwi', { fresh: true }), kb = g.w.byId.kiwi; H.run(g, 2, {});
    Game.landAt(g, kb, Mobs.home(g, 'kiwi').nests[1].th + 40 / kb.R); H.run(g, 3, {});
    console.log(JSON.stringify({ hint: Game.hint(g), status: g.status }));`;
  let out = null;
  try { out = JSON.parse(execFileSync(process.execPath, ['-e', solo], { encoding: 'utf8' }).trim().split('\n').pop()); } catch (e) { out = { hint: e.message.slice(0, 160) }; }
  check('landed on Kiwi: "Munchers live on Kiwi: 8 suit a bite..."', out && /^Munchers live on Kiwi: 8 suit a bite\. Step out \(E\)/.test(out.hint), out && out.hint);
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
