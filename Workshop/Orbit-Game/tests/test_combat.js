// ======================================================================
//  COMBAT TESTS  —  ship guns, real bullets (gravity, hits, craters),
//  pirates (approach, damage, crash avoidance, leash, flee), zones and
//  spawning, warp caps, docked / Hub safety, death loot + bounty + job,
//  64x warp, save / load, respawn cleanup.     node tests/test_combat.js
// ======================================================================

const H = require('./harness');
H.load({ only: 'economy,shop,combat,testgun' });

// test-only stats module: g.testGun = { gun, gunDmg, gunRate, gunSpeed, turret } fits guns without the shop
Game.register({ id: 'testgun', stats: (g, S) => { if (g.testGun) Object.assign(S, g.testGun); } });

// remember every toast (the on-screen queue only holds 4)
const toast0 = Game.toast;
Game.toast = (g, text, ...rest) => { (g.toastLog || (g.toastLog = [])).push(text); return toast0(g, text, ...rest); };
const toasted = (g, re) => (g.toastLog || []).some((t) => re.test(t));

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = 'pad') => Game.create(7, spawn, { fresh: true });
const PEA = { gun: 1, gunDmg: 8, gunRate: 4, gunSpeed: 60 }, RIVET = { gun: 2, gunDmg: 14, gunRate: 6, gunSpeed: 80 };
function arm(g, gun = PEA) { g.testGun = { ...gun }; Game.recalc(g); }
const M = (g) => g.mod.combat;
const quiet = (g) => { M(g).lastSpawn = 1e12; };                   // no zone spawns unless a test wants them
const distTo = (g, p) => Math.hypot(p.x - g.sh.x, p.y - g.sh.y);
const altOf = (g, x, y) => Game.nearestBody(g, x, y).alt;
const finite = (...v) => v.every((x) => Number.isFinite(x));

// the ship coasting far from every body (1300 m above Ceres, falling slowly)
function deepSpace(g) {
  Object.assign(g.sh, { x: 0, y: 1300, vx: 0, vy: 0, ang: Math.PI / 2, omega: 0 });
  g.status = 'flying'; g.landedOn = null; g.land = null; g.attach = null; g.everFlew = true;
}
// park the ship in a circular orbit around a body
function orbitAt(g, id, r, th) { Game.circularAround(g, g.w.byId[id], r, th); g.status = 'flying'; g.everFlew = true; Game.refresh(g); }
// freeze a pirate's brain (it coasts; tests then move it by hand)
const lobotomize = (p) => { p.thinkT = 1e12; p.ax = 0; p.ay = 0; p.state = 'test'; };


// ---------------- 1. registration, job, zones ----------------
{
  const g = fresh();
  const job = Game.GOALS.find((gl) => gl.id === 'pirate');
  check('pirate job registered (order 85, $300)', job && job.order === 85 && job.reward === 300, job ? job.text : 'missing');
  const pot = g.w.byId.potato, [px, py] = World.bodyState(g.w, pot, g.t), c = g.w.byId.ceres;
  const z1 = Combat.zoneAt(g, px + 300, py), z2 = Combat.zoneAt(g, 2050, 0), z3 = Combat.zoneAt(g, 1000, 0);
  check('zones: Potato Hill sphere, outer ring, not the inner belt', z1 && z1.id === 'potato' && z2 && z2.id === 'ring' && !z3,
        `${z1 && z1.id} / ${z2 && z2.id} / ${z3}`);
  check('no pirates on a fresh Ceres start', Combat.list(g).length === 0 && c);
  check('no guns on the stock ship', !Combat.armed(g));
}


// ---------------- 2. guns: no-gun toast, firing, recoil, bullets fall ----------------
{
  const g = fresh('orbit'); quiet(g); deepSpace(g);
  H.run(g, 3, { keys: ['Space'] });
  const toasts = g.toasts.filter((t) => /NO GUNS FITTED/.test(t.text));
  check('Space without guns: one toast, no bullets', toasts.length === 1 && M(g).bullets.length === 0, toasts[0] ? toasts[0].text : 'no toast');
  H.run(g, 3, {}); H.run(g, 3, { keys: ['Space'] });
  check('...and only once', g.toastLog.filter((t) => /NO GUNS FITTED/.test(t)).length === 1 && M(g).toldNoGun);

  arm(g, PEA); deepSpace(g);
  H.run(g, 60, { keys: ['Space'] });
  const n = M(g).bullets.length, b = M(g).bullets[0];
  check('Space fires at gunRate (4/s for 1 s)', n >= 3 && n <= 5, `${n} bullets in flight`);
  check('bullets leave the nose at muzzle speed + ship speed', b && Math.abs(Math.hypot(b.vx - g.sh.vx, b.vy - g.sh.vy) - 60) < 2 && b.vy > 50,
        b ? `rel speed ${Math.hypot(b.vx - g.sh.vx, b.vy - g.sh.vy).toFixed(1)} m/s` : 'none');
  const twin = fresh('orbit'); quiet(twin); arm(twin, PEA); deepSpace(twin); H.run(twin, 60, {});
  const recoil = twin.sh.vy - g.sh.vy, expect = 4 * 0.02 * 60 / (Physics.mass(g.sh, g.S) * 1000);
  check('recoil: p = m v, tiny and honest', recoil > 0 && Math.abs(recoil - expect) < expect * 0.6, `dv ${recoil.toExponential(2)} m/s (expect ~${expect.toExponential(2)})`);
  check('pea shooter shoots actual peas', b && b.style === 'pea' && b.team === 'player');
  check('firing caps warp at 1x', g.warp === 1 && g.warpWhy === 'guns firing', `${g.warp}x ${g.warpWhy}`);
}
{
  // a bullet shot sideways in Ceres' gravity falls like a cannonball: compare with the analytic drop
  const g = fresh('orbit'); quiet(g);
  const c = g.w.byId.ceres, R = 700, gC = c.mu / (R * R);
  const b = Combat.fire(g, { x: 0, y: R, vx: 50, vy: 0, team: 'player', dmg: 1 });
  H.run(g, 60, {});
  const drop = R - b.y, expect = 0.5 * gC * 1 * 1;
  check('bullets fall under gravity (1 s: y drop = g t^2 / 2)', Math.abs(drop - expect) < 0.05 * expect + 0.02, `drop ${drop.toFixed(3)} m vs ${expect.toFixed(3)} m`);
  H.run(g, 60 * 4, {});
  check('bullets expire after 4 s', !M(g).bullets.includes(b) && M(g).bullets.length === 0, `${M(g).bullets.length} left`);
}
{
  // terrain hit digs a tiny crater
  const g = fresh('pad'); quiet(g);
  const c = g.w.byId.ceres, T = Terrain.of(c), R = World.surfaceR(c, 0.3);
  const x = (R - 0.2) * Math.cos(0.3), y = (R - 0.2) * Math.sin(0.3), before = T.grid.reduce((s, v) => s + (v >= Terrain.REG ? 1 : 0), 0);
  for (let k = 0; k < 12; k++) Combat.fire(g, { x: (R + 6) * Math.cos(0.3), y: (R + 6) * Math.sin(0.3), vx: -40 * Math.cos(0.3), vy: -40 * Math.sin(0.3), team: 'player', dmg: 1 });
  H.run(g, 30, {});
  const after = T.grid.reduce((s, v) => s + (v >= Terrain.REG ? 1 : 0), 0);
  check('bullets dig a tiny crater where they hit the ground', after < before && before - after < 12, `${before - after} cells dug by 12 bullets`);
  void x; void y;
}


// ---------------- 3. hitting a stationary pirate ----------------
{
  const g = fresh('orbit'); quiet(g); arm(g, PEA); deepSpace(g);
  const p = Combat.spawn(g, 'ring', { quiet: true, x: g.sh.x, y: g.sh.y + 30, vx: g.sh.vx, vy: g.sh.vy });
  lobotomize(p);
  const hp0 = p.hp;
  H.run(g, 40, { keys: ['Space'] });
  check('a bullet fired at a stationary pirate hits and hurts it', p.hp < hp0 && p.hp > 0, `hp ${hp0} -> ${p.hp}`);
  check('...hits are 8 dmg each (Pea shooter)', (hp0 - p.hp) % 8 === 0, `${(hp0 - p.hp) / 8} hits`);
  check('...the pirate is a team "pirate" target', Game.targets(g).some((t) => t.id === 'pirate:' + p.id && t.team === 'pirate'));
  const ray = Game.raycast(g, g.sh.x, g.sh.y, 0, 1, 60, { team: 'player', terrain: false });
  check('...and Game.raycast finds it', ray && ray.target && ray.target.id === 'pirate:' + p.id, ray ? ray.target.name : 'miss');
  const nt = Game.navTargets(g).find((n) => n.id === 'pirate:' + p.id);
  check('nav target "Pirate: <name>", state(t) extrapolates', nt && nt.name === `Pirate: ${p.name}` && finite(...nt.state(g.t + 30)), nt ? nt.name : 'none');
}
{
  // turret: left mouse fires at the cursor (and is consumed so it does not retarget)
  const g = fresh('orbit'); quiet(g); arm(g, { ...RIVET, turret: 1 }); deepSpace(g);
  g.navId = null;
  const mouse = { x: g.sh.x + 40, y: g.sh.y, down: true, pressed: true, released: false, button: 0, px: 0.25 };
  H.run(g, 20, { mouse });
  const bs = M(g).bullets;
  check('turret: left mouse fires toward the cursor', bs.length >= 1 && bs.every((b) => b.vx - g.sh.vx > 70 && Math.abs(b.vy - g.sh.vy) < 10), `${bs.length} bullets`);
  check('...and the click is consumed (no retargeting)', g.navId === null);
}


// ---------------- 4. a pirate approaches and damages the ship ----------------
{
  const g = fresh('potato'); quiet(g);
  const crew = Combat.CREW.find((c) => c.name === 'Captain Crunch');
  const p = Combat.spawn(g, 'potato', { crew });
  const d0 = distTo(g, p), h0 = g.sh.hull;
  let dMin = Infinity, warned = false;
  for (let s = 0; s < 45 && g.status !== 'dead'; s++) {
    H.run(g, 60, {});
    dMin = Math.min(dMin, distTo(g, p));
    warned = warned || g.events.some((e) => /WARNING SHOTS|THESE ARE A WARNING/.test(e.msg));
  }
  check('Captain Crunch spawns ~330 m out and closes in', d0 > 200 && d0 < 450 && dMin < 60, `start ${d0.toFixed(0)} m, closest ${dMin.toFixed(0)} m`);
  check('...fires warning shots at an unarmed ship first', warned);
  check('...then damages the ship (dmg 5-8)', g.sh.hull < h0, `hull ${h0} -> ${g.sh.hull.toFixed(0)}`);
  check('...radio taunt in the pirate colour', g.events.some((e) => /radio Captain Crunch: YOU ARE CEREAL-OUSLY/.test(e.msg)));
}


// ---------------- 5. crash avoidance around Big Potato ----------------
{
  let crashes = 0, minAlt = Infinity, alive = 0, n = 0;
  for (const [setup, pers] of [['low orbit', 'brash'], ['landed', 'showoff'], ['low orbit', 'sniper'], ['landed', 'coward']]) {
    const g = fresh('potato'); quiet(g);
    if (setup === 'landed') Game.landAt(g, g.w.byId.potato, 2.0);
    else orbitAt(g, 'potato', 85, 1.0);
    g.sh.hull = 1e6; g.S.hull = 1e6;                               // a tank: keep the fight going for 60 s
    const crew = Combat.CREW.filter((c) => c.pers === pers);
    const ps = [Combat.spawn(g, 'potato', { crew: crew[0], quiet: true }), Combat.spawn(g, 'potato', { crew: crew[1], quiet: true })];
    for (let f = 0; f < 60 * 60; f++) {
      H.run(g, 1, {});
      if (f % 10 === 0) for (const p of Combat.list(g)) minAlt = Math.min(minAlt, altOf(g, p.x, p.y));
    }
    crashes += M(g).crashes; alive += ps.filter((p) => !p.gone).length; n += 2;
  }
  check('pirates never crash into Big Potato in 60 s (4 fights)', crashes === 0, `${crashes} crashes`);
  check('...and stay above the ground', minAlt > 0, `lowest ${minAlt.toFixed(1)} m above the surface`);
  check('...and survive the rubble', alive === n, `${alive}/${n} alive`);
}


// ---------------- 6. warp caps ----------------
{
  const g = fresh('orbit'); quiet(g); deepSpace(g);
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 2, {});
  check('far from pirates: full 64x', g.warp === 64, `${g.warp}x`);
  const p = Combat.spawn(g, 'ring', { quiet: true, x: g.sh.x + 300, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy });
  lobotomize(p);
  H.run(g, 2, {});
  check('pirate within 400 m: warp 1x, pick reset, PIRATES! toast', g.warp === 1 && g.warpIdx === 0 && g.toasts.some((t) => t.text === 'PIRATES!'),
        `${g.warp}x (${g.warpWhy})`);
  Object.assign(p, { x: g.sh.x + 700 });
  H.run(g, 1, {});
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 2, {});
  check('pirate at 700 m: warp free again', g.warp === 64, `${g.warp}x`);
}


// ---------------- 7. death: explosion, loot, bounty, job ----------------
{
  const g = fresh('orbit'); quiet(g); arm(g, RIVET); deepSpace(g);
  const p = Combat.spawn(g, 'glimmer', { quiet: true, x: g.sh.x, y: g.sh.y + 25, vx: g.sh.vx, vy: g.sh.vy, hp: 40 });
  lobotomize(p);
  const m0 = g.money, pk0 = g.pickups.length;
  for (let f = 0; f < 120 && !p.gone; f++) H.run(g, 1, { keys: ['Space'] });
  const loot = g.pickups.slice(pk0);
  check('Rivet gun destroys a 40 hp pirate', p.gone && !Combat.list(g).includes(p), `hp ${p.hp}`);
  check('...loot pops out: scrap + parts (+ maybe a core)', loot.some((q) => q.item === 'scrap') && loot.some((q) => q.item === 'parts') &&
        loot.every((q) => ['scrap', 'parts', 'core'].includes(q.item)), loot.map((q) => q.item).join(' '));
  check('...bounty $120-300 and the $300 job', g.money - m0 === p.bounty + 300 && p.bounty >= 120 && p.bounty <= 300 && g.done.pirate !== undefined,
        `+$${g.money - m0} (bounty $${p.bounty})`);
  check('...BOUNTY toast, last words, a big explosion', toasted(g, new RegExp(`^BOUNTY \\+\\$${p.bounty}$`)) && g.events.some((e) => /radio .*: (TELL MY MOM|NOT THE FACE|I REGRET|WORTH IT)/.test(e.msg)) &&
        M(g).booms.length === 1 && M(g).shards.length > 0, g.toastLog.join(' / '));
  check('...kill counted, nav target cleared', M(g).kills === 1 && Game.navTargets(g).every((n) => n.id !== 'pirate:' + p.id));
  const p2 = Combat.spawn(g, 'glimmer', { quiet: true, x: g.sh.x, y: g.sh.y + 25, vx: g.sh.vx, vy: g.sh.vy, hp: 40 });
  lobotomize(p2);
  const m1 = g.money;
  H.run(g, 120, { keys: ['Space'] });
  check('second kill: bounty only (job pays once)', p2.gone && g.money - m1 === p2.bounty, `+$${g.money - m1}`);
}
{
  // a pirate that crashes on its own pays nothing; one you shot recently still pays
  const g = fresh('orbit'); quiet(g);
  const p = Combat.spawn(g, 'potato', { quiet: true });
  const m0 = g.money;
  Combat.kill(g, p, 'crash');
  check('crash with no help from you: loot but no bounty', g.money === m0 && g.done.pirate === undefined, `$${g.money - m0}`);
}


// ---------------- 8. docked: never attacked ----------------
{
  const g = fresh('potato'); quiet(g);
  const pot = g.w.byId.potato;
  const port = (t) => { const [bx, by, bvx, bvy] = World.bodyState(g.w, pot, t), r = 110, n = Math.sqrt(pot.mu / r ** 3), th = n * t + 1;
                        return [bx + r * Math.cos(th), by + r * Math.sin(th), bvx - r * n * Math.sin(th), bvy + r * n * Math.cos(th)]; };
  Game.dock(g, { name: 'Test Port', state: port, ang: 0 });
  const crew = Combat.CREW.find((c) => c.pers === 'brash');
  const p = Combat.spawn(g, 'potato', { crew, quiet: true, state: 'attack' });
  const h0 = g.sh.hull;
  let shots = 0, attackT = 0;
  const seen = new Set();
  for (let f = 0; f < 60 * 40; f++) {
    H.run(g, 1, {});
    for (const b of M(g).bullets) if (b.team === 'pirate' && !seen.has(b)) { seen.add(b); shots++; }
    if (p.state === 'attack') attackT++;
  }
  check('docked: pirates hold fire for 40 s', shots === 0 && g.sh.hull === h0, `${shots} shots, hull ${g.sh.hull}`);
  check('...and go back to lurking', p.state === 'lurk' && attackT < 30, `${attackT} attack frames`);
  check('...warp is not capped while docked', !g.warpWhy.includes('pirates'), g.warpWhy || 'free');
  // stray bullets do not hurt a docked ship
  Combat.fire(g, { x: g.sh.x + 20, y: g.sh.y, vx: g.sh.vx - 60, vy: g.sh.vy, team: 'pirate', dmg: 8 });
  H.run(g, 30, {});
  check('...even stray pirate bullets just go TINK', g.sh.hull === h0, `hull ${g.sh.hull}`);
}


// ---------------- 9. Ceres Hub is safe ----------------
{
  const g = fresh('orbit');                                         // r 360 from Ceres, 64x for ~5 min
  for (let f = 0; f < 300; f++) { g.warpIdx = 6; H.run(g, 1, {}); }
  check('no pirate spawns in low Ceres orbit (5 min at 64x)', Combat.list(g).length === 0 && g.t > 250, `t ${g.t.toFixed(0)} s`);
  // hover at r 690 m (pinned: a real orbit there gets flung by Dorito) right next to the ring zone rules
  const g2 = fresh('orbit'), c = g2.w.byId.ceres;
  let spawned = 0;
  for (let f = 0; f < 300; f++) {
    g2.warpIdx = 6; Game.circularAround(g2, c, 690, 0.3); g2.status = 'flying';
    H.run(g2, 1, {}); spawned = Math.max(spawned, Combat.list(g2).length);
  }
  check('...nor at r 690 m (just inside the patrol radius)', spawned === 0 && Combat.hostileTo(g2) === 'hub', `t ${g2.t.toFixed(0)} s, ${Combat.hostileTo(g2)}`);
  // chase a pirate into the Hub's patrol radius: it breaks off and never crosses r = 700 m
  const g3 = fresh('orbit'); quiet(g3); orbitAt(g3, 'ceres', 760, 0.3);
  const p = Combat.spawn(g3, 'ring', { quiet: true, crew: Combat.CREW[0], state: 'attack',
                                        x: g3.sh.x * 1.15, y: g3.sh.y * 1.15, vx: g3.sh.vx, vy: g3.sh.vy });
  p.zone = 'nowhere';                                               // no home patch = no leash: only the Hub rule can stop it
  let rMin = Infinity, shotsIn = 0, attacked = false;
  for (let f = 0; f < 60 * 50; f++) {
    if (f === 60 * 8) orbitAt(g3, 'ceres', 420, Math.atan2(g3.sh.y, g3.sh.x));   // duck under the Hub's umbrella
    H.run(g3, 1, {});
    if (f < 60 * 8) attacked = attacked || p.state === 'attack';
    if (!p.gone) rMin = Math.min(rMin, Math.hypot(p.x, p.y));
    if (f > 60 * 9) shotsIn += M(g3).bullets.filter((b) => b.team === 'pirate' && b.age < 1 / 60 + 1e-9).length;
  }
  check('pirates chase you to the edge of the Hub patrol radius...', attacked && rMin > Combat.SAFE_CERES, `closest r ${rMin.toFixed(0)} m`);
  check('...then break off and hold fire', p.state !== 'attack' && shotsIn === 0, `${p.state}, ${shotsIn} shots`);
  check('...with a grumpy radio line', g3.events.some((e) => /radio .*(HUB PATROL|NOT NEAR THE HUB)/.test(e.msg)));
}


// ---------------- 10. zones: entering spawns, cooldown, cap, despawn far ----------------
{
  const g = fresh('potato');
  H.run(g, 60 * 3, {});
  check('entering Big Potato: nobody for the first few seconds', Combat.list(g).length === 0);
  H.run(g, 60 * 3, {});
  const L = Combat.list(g);
  check('...then a pirate shows up with a radio hello', L.length === 1 && L[0].zone === 'potato' && g.toasts.some((t) => /:/.test(t.text)), L.map((p) => p.name).join(', '));
  H.run(g, 60 * 30, {});
  check('...cooldown: no second pirate within 90 s', Combat.list(g).filter((p) => !p.gone).length <= 1);
  // max alive
  const g2 = fresh('orbit'); orbitAt(g2, 'ceres', 2200, 1.0); g2.sh.hull = g2.S.hull = 1e6;
  let most = 0;
  for (let f = 0; f < 60 * 40; f++) { if (f % 60 === 0) M(g2).lastSpawn = -1e9; H.run(g2, 1, {}); most = Math.max(most, Combat.list(g2).length); }
  check('zone spawning (cooldown off) never exceeds 3 alive', most >= 2 && most <= 3, `${most} at most`);
  // far away for a while: they go home
  const g3 = fresh('orbit'); quiet(g3);
  const p = Combat.spawn(g3, 'potato', { quiet: true });
  for (let f = 0; f < 120; f++) { g3.warpIdx = 6; H.run(g3, 1, {}); }
  check('pirates despawn when you are far away for a while', p.gone && Combat.list(g3).length === 0, `t ${g3.t.toFixed(0)} s`);
}


// ---------------- 11. flee & leash ----------------
{
  const g = fresh('potato'); quiet(g); arm(g, PEA);
  const crew = Combat.CREW.find((c) => c.pers === 'coward');
  const p = Combat.spawn(g, 'potato', { crew, quiet: true, state: 'attack' });
  p.hp = p.hpMax * 0.45;
  H.run(g, 30, {});
  check('a hurt coward flees', p.state === 'flee', p.state);
  for (let s = 0; s < 60 && !p.gone; s++) H.run(g, 60, {});
  check('...gets away and is remembered for a rematch', p.gone && M(g).fled.some((f) => f.name === p.name), `${M(g).fled.length} fled`);
  M(g).lastSpawn = -1e9; M(g).rand = () => 0.1;                     // force the rematch roll
  const q = Combat.spawn(g, 'potato', { quiet: true });
  check('...comes back for revenge with a fatter bounty', q && q.name === p.name && q.back && q.bounty > p.bounty, q ? `${q.name} $${q.bounty}` : 'none');
}
{
  const g = fresh('potato'); quiet(g);
  const pot = g.w.byId.potato, [px, py, pvx, pvy] = World.bodyState(g.w, pot, g.t);
  Object.assign(g.sh, { x: px + 900, y: py, vx: pvx, vy: pvy });   // 450 m outside the zone, drifting with Potato
  const p = Combat.spawn(g, 'potato', { quiet: true, state: 'attack', x: px + 400, y: py, vx: pvx, vy: pvy });
  H.run(g, 30, {});
  const out = Math.hypot(g.sh.x - px, g.sh.y - py) - 450;
  check('leash: pirates give up when you are well outside their patch', p.state === 'lurk', `you are ${out.toFixed(0)} m outside, ${p.state}`);
}


// ---------------- 12. 64x warp: no NaN, nothing explodes ----------------
{
  const g = fresh('potato'); arm(g, PEA);
  let bad = 0, maxP = 0;
  for (let s = 0; s < 240; s++) {
    g.warpIdx = 6;
    H.run(g, 6, { keys: s % 7 === 0 ? ['Space'] : [] });
    for (const p of Combat.list(g)) if (!finite(p.x, p.y, p.vx, p.vy, p.ang, p.hp)) bad++;
    for (const b of M(g).bullets) if (!finite(b.x, b.y, b.vx, b.vy)) bad++;
    if (!finite(g.sh.x, g.sh.y, g.sh.vx, g.sh.vy)) bad++;
    maxP = Math.max(maxP, Combat.list(g).length);
    if (g.status === 'dead') H.run(g, 1, { pressed: ['KeyR'] });
  }
  check('64x warp with pirates around: no NaN anywhere', bad === 0, `${bad} bad values, up to ${maxP} pirates, t ${g.t.toFixed(0)} s`);
  // a tiny moon: bullets and pirates near Seed
  const g2 = fresh('kiwi'); quiet(g2); arm(g2, RIVET);
  const seed = g2.w.byId.seed, [sx, sy, svx, svy] = World.bodyState(g2.w, seed, g2.t);
  Object.assign(g2.sh, { x: sx, y: sy + 30, vx: svx, vy: svy, ang: -Math.PI / 2 });
  const p = Combat.spawn(g2, 'potato', { quiet: true, x: sx + 40, y: sy + 30, vx: svx, vy: svy, state: 'attack' });
  for (let f = 0; f < 60 * 20; f++) H.run(g2, 1, { keys: f % 30 < 10 ? ['Space'] : [] });
  check('Seed (R 11 m): fighting next to a tiny moon stays finite', finite(p.x, p.y, g2.sh.x, g2.sh.y) && M(g2).crashes === 0, `${p.gone ? 'pirate gone' : p.state}`);
}


// ---------------- 13. lifecycle: died, respawn, save / load ----------------
{
  const g = fresh('potato'); quiet(g);
  const p = Combat.spawn(g, 'potato', { quiet: true, state: 'attack' });
  Combat.fire(g, { x: g.sh.x + 50, y: g.sh.y, vx: 0, vy: 0, team: 'pirate', dmg: 5 });
  Game.die(g, 'test');
  H.run(g, 3, {});
  check('your ship blows up: pirates gloat and stop attacking', p.state === 'lurk' && g.events.some((e) => /radio .*(TOW TRUCK|EASY PICKINGS|WRAP)/.test(e.msg)));
  H.run(g, 1, { pressed: ['KeyR'] });
  check('respawn clears bullets and calms pirates', M(g).bullets.length === 0 && !M(g).trigger && Combat.list(g).every((q) => q.state !== 'attack'));
}
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = fresh('orbit');
  Object.assign(M(g), { kills: 4, bounty: 777, crashes: 1, fled: [{ name: "Mad Marge's cousin Gary", short: 'GARY', pers: 'coward', hpMax: 55 }] });
  Game.save(g);
  const g2 = Game.create(7, 'orbit');
  check('save / load round-trips kills, bounty, the grudge list', M(g2).kills === 4 && M(g2).bounty === 777 && M(g2).fled.length === 1 && M(g2).fled[0].short === 'GARY',
        JSON.stringify(Game.call(g2, Game.mods.find((m) => m.id === 'combat'), 'save')));
  check('...pirates and bullets are not saved (fresh skies)', Combat.list(g2).length === 0 && M(g2).bullets.length === 0);
  store['pocket-orbit-v3'] = JSON.stringify({ v: 3, money: 5, mods: { combat: { kills: 'NaN', fled: [{ name: 3 }, null, { name: 'X', pers: 'evil', hpMax: 1 }] } } });
  const g3 = Game.create(7, 'orbit');
  check('...junk save data is ignored safely', M(g3).kills === 0 && M(g3).fled.length === 0);
  Game.wipeSave(); delete global.localStorage;
}


// ---------------- 14. HUD rows, hints ----------------
{
  const g = fresh('potato'); quiet(g);
  const p = Combat.spawn(g, 'potato', { quiet: true, x: g.sh.x + 200, y: g.sh.y });
  H.run(g, 2, {});
  check('hint when pirates are near and you have no gun', /No guns! Run, or buy one/.test(Game.hint(g)), Game.hint(g));
  arm(g, RIVET);
  H.run(g, 2, {});
  const rows = Game.gather(g, 'hudRows');
  check('GUN row (name + state) and PIRATES row', rows.some((r) => r.label === 'GUN' && /Rivet gun|Gun Mk 2/.test(r.val)) && rows.some((r) => r.label === 'PIRATES'),
        rows.map((r) => `${r.label}: ${r.val}`).join(' | '));
  check('hint with a gun: Space fires', /Space fires/.test(Game.hint(g)), Game.hint(g));
  void p;
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
