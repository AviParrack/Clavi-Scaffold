// ======================================================================
//  COMBAT TESTS  —  ship guns, real bullets (gravity, hits, craters),
//  pirates (approach, damage, crash avoidance, leash, flee), zones and
//  spawning, warp caps, docked / Hub safety, death loot + bounty + job,
//  64x warp, save / load, respawn cleanup, loot, sanctuaries.
//  Then re-runs itself with --full: the real stations / eva / mobs modules
//  (Rust's bubble, Mochi Hub, the EVA laser, bullets vs bugs).
//                                                node tests/test_combat.js
// ======================================================================

const H = require('./harness');
const FULL = process.argv.includes('--full');
H.load({ only: FULL ? 'economy,shop,stations,eva,mobs,combat,testgun' : 'economy,shop,combat,testgun' });

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

// the ship coasting far from every body (1300 m above Mochi, falling slowly)
const mochiAt = (g) => World.bodyState(g.w, g.w.byId.mochi, g.t);   // Mochi rides the belt: everything here is relative to it
function deepSpace(g) {
  const [mx, my, mvx, mvy] = mochiAt(g);
  Object.assign(g.sh, { x: mx, y: my + 1300, vx: mvx, vy: mvy, ang: Math.PI / 2, omega: 0 });
  g.status = 'flying'; g.landedOn = null; g.land = null; g.attach = null; g.everFlew = true;
}
// park the ship in a circular orbit around a body
function orbitAt(g, id, r, th) { Game.circularAround(g, g.w.byId[id], r, th); g.status = 'flying'; g.everFlew = true; Game.refresh(g); }
// freeze a pirate's brain (it coasts; tests then move it by hand)
const lobotomize = (p) => { p.thinkT = 1e12; p.ax = 0; p.ay = 0; p.state = 'test'; };


if (!FULL) {

// ---------------- 1. registration, job, zones ----------------
{
  const g = fresh();
  const job = Game.GOALS.find((gl) => gl.id === 'pirate');
  check('pirate job registered (order 85, $300)', job && job.order === 85 && job.reward === 300, job ? job.text : 'missing');
  const pot = g.w.byId.potato, [px, py] = World.bodyState(g.w, pot, g.t), c = g.w.byId.mochi;
  const z1 = Combat.zoneAt(g, px + 300, py), [mx, my] = mochiAt(g), [bx, by] = World.bodyState(g.w, g.w.byId.biscotti, g.t);
  const z2 = Combat.zoneAt(g, bx + 300, by), z3 = Combat.zoneAt(g, mx + 1000, my), z4 = Combat.zoneAt(g, mx + 2050, my);
  let route = 0;                                                    // the starter hop: Mochi -> Pretzel, in a straight line
  const [qx, qy] = World.bodyState(g.w, g.w.byId.pretzel, g.t);
  for (let k = 0; k <= 200; k++) if (Combat.zoneAt(g, mx + (qx - mx) * k / 200, my + (qy - my) * k / 200)) route++;
  check('zones: Big Potato and Biscotti; Mochi\'s rings and the hop to Pretzel are pirate-free', z1 && z1.id === 'potato' && z2 && z2.id === 'biscotti' && !z3 && !z4 && route === 0,
        `${z1 && z1.id} / ${z2 && z2.id} / ${z3} / ${z4}, ${route} pirate samples on the way to Pretzel`);
  check('no pirates on a fresh Mochi start', Combat.list(g).length === 0 && c);
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
  check('bullets leave the nose at muzzle speed + ship speed', b && Math.abs(Math.hypot(b.vx - g.sh.vx, b.vy - g.sh.vy) - 60) < 2 && b.vy - g.sh.vy > 50,
        b ? `rel speed ${Math.hypot(b.vx - g.sh.vx, b.vy - g.sh.vy).toFixed(1)} m/s` : 'none');
  const twin = fresh('orbit'); quiet(twin); arm(twin, PEA); deepSpace(twin); H.run(twin, 60, {});
  const recoil = twin.sh.vy - g.sh.vy, expect = 4 * 0.02 * 60 / (Physics.mass(g.sh, g.S) * 1000);
  check('recoil: p = m v, tiny and honest', recoil > 0 && Math.abs(recoil - expect) < expect * 0.6, `dv ${recoil.toExponential(2)} m/s (expect ~${expect.toExponential(2)})`);
  check('pea shooter shoots actual peas', b && b.style === 'pea' && b.team === 'player');
  check('firing caps warp at 1x', g.warp === 1 && g.warpWhy === 'guns firing', `${g.warp}x ${g.warpWhy}`);
}
{
  // a bullet shot sideways in Mochi's gravity falls like a cannonball: compare with the analytic drop
  const g = fresh('orbit'); quiet(g);
  const c = g.w.byId.mochi, R = 700, gC = c.mu / (R * R);
  const [mx, my, mvx, mvy] = mochiAt(g);
  const b = Combat.fire(g, { x: mx, y: my + R, vx: mvx + 50, vy: mvy, team: 'player', dmg: 1 });
  H.run(g, 60, {});
  const drop = R - (b.y - mochiAt(g)[1]), expect = 0.5 * gC * 1 * 1;
  check('bullets fall under gravity (1 s: y drop = g t^2 / 2)', Math.abs(drop - expect) < 0.05 * expect + 0.02, `drop ${drop.toFixed(3)} m vs ${expect.toFixed(3)} m`);
  H.run(g, 60 * 4, {});
  check('bullets expire after 4 s', !M(g).bullets.includes(b) && M(g).bullets.length === 0, `${M(g).bullets.length} left`);
}
{
  // terrain hit digs a tiny crater
  const g = fresh('pad'); quiet(g);
  const c = g.w.byId.mochi, T = Terrain.of(c), R = World.surfaceR(c, 0.3);
  const x = (R - 0.2) * Math.cos(0.3), y = (R - 0.2) * Math.sin(0.3), before = T.grid.reduce((s, v) => s + (v >= Terrain.REG ? 1 : 0), 0);
  const [mx, my, mvx, mvy] = mochiAt(g);
  for (let k = 0; k < 12; k++) Combat.fire(g, { x: mx + (R + 6) * Math.cos(0.3), y: my + (R + 6) * Math.sin(0.3), vx: mvx - 40 * Math.cos(0.3), vy: mvy - 40 * Math.sin(0.3), team: 'player', dmg: 1 });
  H.run(g, 30, {});
  const after = T.grid.reduce((s, v) => s + (v >= Terrain.REG ? 1 : 0), 0);
  check('bullets dig a tiny crater where they hit the ground', after < before && before - after < 12, `${before - after} cells dug by 12 bullets`);
  void x; void y;
}


// ---------------- 3. hitting a stationary pirate ----------------
{
  const g = fresh('orbit'); quiet(g); arm(g, PEA); deepSpace(g);
  const p = Combat.spawn(g, 'biscotti', { quiet: true, x: g.sh.x, y: g.sh.y + 30, vx: g.sh.vx, vy: g.sh.vy });
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
  // 'fast exit': you scoot out through Potato's rubble ring (115-190 m) at 1.3x orbital speed and they give chase
  for (const [setup, pers] of [['low orbit', 'brash'], ['landed', 'showoff'], ['low orbit', 'sniper'], ['landed', 'coward'], ['fast exit', 'brash']]) {
    const g = fresh('potato'); quiet(g);
    if (setup === 'landed') Game.landAt(g, g.w.byId.potato, 2.0);
    else if (setup === 'fast exit') { orbitAt(g, 'potato', 100, 3.0); g.sh.vx *= 1.3; g.sh.vy *= 1.3; }
    else orbitAt(g, 'potato', 85, 1.0);
    g.sh.hull = 1e6; g.S.hull = 1e6;                               // a tank: keep the fight going for 60 s
    const crew = Combat.CREW.filter((c) => c.pers === pers);
    const ps = [Combat.spawn(g, 'potato', { crew: crew[0], quiet: true }), Combat.spawn(g, 'potato', { crew: crew[1], quiet: true })];
    for (let f = 0; f < 60 * 60; f++) {
      H.run(g, 1, {});
      if (f % 10 === 0) for (const p of Combat.list(g)) minAlt = Math.min(minAlt, altOf(g, p.x, p.y));
    }
    crashes += M(g).crashes + g.events.filter((e) => /crashed into/.test(e.msg)).length; alive += ps.filter((p) => !p.gone).length; n += 2;
  }
  check('pirates never crash into Big Potato or its rubble (5 fights, 60 s)', crashes === 0, `${crashes} crashes`);
  check('...and stay above the ground', minAlt > 0, `lowest ${minAlt.toFixed(1)} m above the surface`);
  check('...and survive the rubble', alive === n, `${alive}/${n} alive`);
}
{
  // rubble caution must not stop the hunt: every personality still works its way in to a ship in low Potato orbit and lands hits
  const bands = M(fresh('orbit')).bands.filter((b) => b.host.id === 'mochi');
  check("Mochi's two rubble rings are two bands (the gap between them is open space)", bands.length === 2 && bands.every((b) => b.hi - b.lo < 400),
        bands.map((b) => `${b.lo.toFixed(0)}-${b.hi.toFixed(0)}`).join(', '));
  for (const seed of [7, 2]) {                                        // two worlds, so one lucky rubble layout cannot hide a timid dodge
    const out = [];
    for (const pers of Object.keys(Combat.PERS)) {
      const g = Game.create(seed, 'potato', { fresh: true }); quiet(g); g.sh.hull = g.S.hull = 1e6;
      const p = Combat.spawn(g, 'potato', { crew: Combat.CREW.find((c) => c.pers === pers), near: true }); p.warned = true;
      let dMin = Infinity;
      for (let f = 0; f < 60 * 45; f++) { H.run(g, 1, {}); if (!p.gone) dMin = Math.min(dMin, distTo(g, p)); }
      out.push([pers, 1e6 - g.sh.hull, distTo(g, p), dMin]);
    }
    //  (closest approach, not the last frame: a sniper that has landed its hits may be swinging round for another pass)
    check(`seed ${seed}: every personality closes in through the rubble and hits a ship in low Potato orbit (45 s)`, out.every(([, dmg, , dMin]) => dmg >= 10 && dMin < 100),
          out.map(([k, dmg, d, dMin]) => `${k} ${dmg.toFixed(0)} dmg, closest ${dMin.toFixed(0)} m (${d.toFixed(0)} m at the end)`).join(', '));
  }
}


// ---------------- 6. warp caps ----------------
{
  const g = fresh('orbit'); quiet(g); deepSpace(g);
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 2, {});
  const WMAX = CONFIG.sim.warps[CONFIG.sim.warps.length - 1];
  check(`far from pirates: full ${WMAX}x`, g.warp === WMAX, `${g.warp}x`);
  const p = Combat.spawn(g, 'biscotti', { quiet: true, x: g.sh.x + 300, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy });
  lobotomize(p);
  H.run(g, 2, {});
  check('pirate within 400 m: warp 1x, pick reset, PIRATES! toast', g.warp === 1 && g.warpIdx === 0 && g.toasts.some((t) => t.text === 'PIRATES!'),
        `${g.warp}x (${g.warpWhy})`);
  deepSpace(g); Game.refresh(g);                                    // back to the top of the fall: no ring rock within a 1024x frame
  Object.assign(p, { x: g.sh.x + 700, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy });
  H.run(g, 1, {});
  g.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(g, 2, {});
  check('pirate at 700 m: warp free again', g.warp === WMAX, `${g.warp}x ${g.warpWhy}`);
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


// ---------------- 9. Mochi Hub is safe ----------------
{
  const g = fresh('orbit');                                         // r 360 from Mochi, 64x for ~5 min
  for (let f = 0; f < 300; f++) { g.warpIdx = 6; H.run(g, 1, {}); }
  check('no pirate spawns in low Mochi orbit (5 min at 64x)', Combat.list(g).length === 0 && g.t > 250, `t ${g.t.toFixed(0)} s`);
  // hover at r 690 m (pinned: a real orbit there gets flung by Dorito) right next to the ring zone rules
  const g2 = fresh('orbit'), c = g2.w.byId.mochi;
  let spawned = 0;
  for (let f = 0; f < 300; f++) {
    g2.warpIdx = 6; Game.circularAround(g2, c, 690, 0.3); g2.status = 'flying';
    H.run(g2, 1, {}); spawned = Math.max(spawned, Combat.list(g2).length);
  }
  check('...nor at r 690 m (just inside the patrol radius)', spawned === 0 && Combat.hostileTo(g2) === 'hub', `t ${g2.t.toFixed(0)} s, ${Combat.hostileTo(g2)}`);
  // chase a pirate into the Hub's patrol radius: it breaks off and never crosses r = 700 m
  const g3 = fresh('orbit'); quiet(g3); orbitAt(g3, 'mochi', 760, 0.3);
  const [m3x, m3y] = mochiAt(g3);
  const p = Combat.spawn(g3, 'biscotti', { quiet: true, crew: Combat.CREW[0], state: 'attack',
                                        x: m3x + (g3.sh.x - m3x) * 1.15, y: m3y + (g3.sh.y - m3y) * 1.15, vx: g3.sh.vx, vy: g3.sh.vy });
  p.zone = 'nowhere';                                               // no home patch = no leash: only the Hub rule can stop it
  { const c3 = g3.w.byId.mochi, r = 2200; p.haunt = { b: c3, r, th0: Math.atan2(g3.sh.y - m3y, g3.sh.x - m3x), n: Math.sqrt(c3.mu / r ** 3), t0: g3.t }; }   // and a lurking orbit just outside Mochi's rings
  let rMin = Infinity, shotsIn = 0, attacked = false;
  for (let f = 0; f < 60 * 50; f++) {
    if (f === 60 * 8) { const [mx, my] = mochiAt(g3); orbitAt(g3, 'mochi', 420, Math.atan2(g3.sh.y - my, g3.sh.x - mx)); }   // duck under the Hub's umbrella
    H.run(g3, 1, {});
    if (f < 60 * 8) attacked = attacked || p.state === 'attack';
    if (!p.gone) { const [mx, my] = mochiAt(g3); rMin = Math.min(rMin, Math.hypot(p.x - mx, p.y - my)); }
    if (f > 60 * 9) shotsIn += M(g3).bullets.filter((b) => b.team === 'pirate' && b.age < 1 / 60 + 1e-9).length;
  }
  check('pirates chase you to the edge of the Hub patrol radius...', attacked && rMin > Combat.SAFE_MOCHI, `closest r ${rMin.toFixed(0)} m`);
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
  const g2 = fresh('orbit'); orbitAt(g2, 'biscotti', 300, 1.0); g2.sh.hull = g2.S.hull = 1e6;     // Biscotti's gang: up to 3
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
  Combat.fire(g, { x: g.sh.x + 50, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy, team: 'pirate', dmg: 5 });
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
  store['pocket-orbit-v4'] = JSON.stringify({ v: 4, money: 5, mods: { combat: { kills: 'NaN', fled: [{ name: 3 }, null, { name: 'X', pers: 'evil', hpMax: 1 }] } } });
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


// ---------------- 15. loot you can scoop, instant bounty feedback, sanctuaries, controls ----------------
{
  const g = fresh('orbit'); quiet(g); arm(g, RIVET); orbitAt(g, 'mochi', 1300, 1.0);
  const fx = Math.cos(g.sh.ang), fy = Math.sin(g.sh.ang);
  const p = Combat.spawn(g, 'glimmer', { quiet: true, x: g.sh.x + fx * 25, y: g.sh.y + fy * 25, vx: g.sh.vx, vy: g.sh.vy, hp: 40 });
  lobotomize(p);
  g.navId = 'pirate:' + p.id;
  for (let f = 0; f < 120 && !p.gone; f++) H.run(g, 1, { keys: ['Space'] });
  check('a kill pops "+$<bounty>" at your ship straight away', p.gone && g.popups.some((q) => q.text === `+$${p.bounty}`), g.popups.map((q) => q.text).join(' '));
  const L = M(g).loot.find((l) => l.id === p.id);
  const spread = L ? Math.max(...L.pks.map((pk) => Math.hypot(pk.vx - p.vx, pk.vy - p.vy))) : Infinity;
  check('loot sprays gently (<= 1.3 m/s) so you can scoop it', L && L.pks.length >= 3 && spread <= 1.31, `${L ? L.pks.length : 0} pieces, fastest ${spread.toFixed(2)} m/s`);
  const nt = Game.navTarget(g);
  check('...the nav target hops from the pirate to its loot', g.navId === 'loot:' + p.id && nt && /^Loot from /.test(nt.name) && finite(...nt.state(g.t + 90)), `${g.navId} ${nt ? nt.name : ''}`);
  H.run(g, 2, {});
  check('...with a hint to scoop it up', /Pirate loot!/.test(Game.hint(g)), Game.hint(g));
  const cen = () => { const n = L.pks.length || 1; return ['x', 'y', 'vx', 'vy'].map((k) => L.pks.reduce((s2, pk) => s2 + pk[k], 0) / n); };
  for (let f = 0; f < 90 && L.pks.length; f++) { const [x, y, vx, vy] = cen(); Object.assign(g.sh, { x, y, vx, vy }); H.run(g, 1, {}); }
  check('flying through the loot scoops it into the hold', (g.cargo.scrap || 0) >= 2 && (g.cargo.parts || 0) >= 1 && !M(g).loot.length, JSON.stringify(g.cargo));
  H.run(g, 1, {});
  check('...and the empty loot target clears itself', g.navId === null, String(g.navId));
}
{
  // pirate rounds fizzle inside the Hub patrol radius; sniping from it sends pirates packing
  const g = fresh('orbit'); quiet(g); orbitAt(g, 'mochi', 690, 0.3);
  const [mx, my] = mochiAt(g), ux = (g.sh.x - mx) / 690, uy = (g.sh.y - my) / 690, h0 = g.sh.hull;
  const b = Combat.fire(g, { x: g.sh.x + ux * 70, y: g.sh.y + uy * 70, vx: g.sh.vx - ux * 80, vy: g.sh.vy - uy * 80, team: 'pirate', dmg: 8 });
  H.run(g, 60, {});
  check('pirate bullets fizzle inside the Hub patrol radius', g.sh.hull === h0 && !M(g).bullets.includes(b), `hull ${g.sh.hull}`);
  const p = Combat.spawn(g, 'biscotti', { quiet: true, x: g.sh.x + ux * 80, y: g.sh.y + uy * 80, vx: g.sh.vx, vy: g.sh.vy });
  lobotomize(p);
  Combat.fire(g, { x: p.x - ux * 10, y: p.y - uy * 10, vx: p.vx + ux * 60, vy: p.vy + uy * 60, team: 'player', dmg: 8 });
  H.run(g, 20, {});
  check('sniping from the safe zone: the pirate flees in a huff', p.hp < p.hpMax && p.state === 'flee' && g.events.some((e) => /radio .*(CHEAP SHOT|NO FAIR|SANCTUARY)/.test(e.msg)), p.state);
}
{
  const g = fresh('orbit'); quiet(g); deepSpace(g);
  g.testGun = { ...PEA, ionThrust: 0.25, ionVe: 1300, ionTank: 0.2 }; Game.recalc(g);
  const ctl = Game.first(g, 'controls') || '';
  check('controls line: Space fire, and X ion is still listed', /Space fire/.test(ctl) && /X ion/.test(ctl), ctl);
  check('...and every key of the core line survives (Shift fine, wheel zoom, ...)', ['W engine', 'Shift fine', 'A/D spin', 'S stop spin', 'arrows nudge', 'Tab target', 'M map', 'wheel zoom', 'P pause'].every((k) => ctl.includes(k)), ctl);
  g.testGun.turret = 1; Game.recalc(g);
  check('...a turret says click to fire instead', /click: fire at mouse/.test(Game.first(g, 'controls') || '') && !/Space fire/.test(Game.first(g, 'controls') || ''));
}


// ---------------- 16. dodging: the gunsight sees you SIGHT_LAG late, so a dash beats the lead ----------------
{
  // a Pack Mule (r 5 m) with Strafe pods in a 100 m Potato orbit, nose on the sniper; still vs a dash every time it is ready
  const duel = (jink, seed) => {
    const g = Game.create(seed, 'potato', { fresh: true }), E = g.mod.economy;
    Econ.install(g, 'side1'); Econ.install(g, 'side2'); E.owned.mule = true; E.frame = 'mule'; Game.recalc(g); g.sh.hull = g.S.hull;
    orbitAt(g, 'potato', 100, 1.0); quiet(g);
    const p = Combat.spawn(g, 'potato', { pers: 'sniper', near: true }), seen = new Set();
    let side = 1, hits = 0, h = g.sh.hull;
    for (let i = 0; i < 60 * 30 && g.status === 'flying' && !p.gone; i++) {
      for (const b of M(g).bullets) if (b.team === 'pirate') seen.add(b);
      g.sh.ang = Math.atan2(p.y - g.sh.y, p.x - g.sh.x); g.sh.omega = 0;
      if (jink && g.t >= g.dash.readyAt && distTo(g, p) < 140) { const k = side > 0 ? 'ArrowLeft' : 'ArrowRight'; H.run(g, 1, { pressed: [k] }); H.run(g, 1, { pressed: [k] }); side = -side; }
      else H.run(g, 1, {});
      if (g.sh.hull < h - 1e-9) hits++;
      h = g.sh.hull;
    }
    return [hits, seen.size];
  };
  const sum = (jink) => [3, 7].map((s) => duel(jink, s)).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
  const [hs, fs] = sum(false), [hj, fj] = sum(true);
  check('a Mule dashing whenever it can dodges a sniper (hit rate ≤ 0.7x still)', fs > 20 && fj > 20 && hj / fj <= 0.7 * hs / fs,
        `still ${hs}/${fs} = ${(100 * hs / fs).toFixed(0)} %, dashing ${hj}/${fj} = ${(100 * hj / fj).toFixed(0)} %`);
}

}   // !FULL


// ======================================================================
//  --full: with the real stations, eva and mobs modules
// ======================================================================

if (FULL) {

const pinTo = (g, x, y, vx, vy) => { Object.assign(g.sh, { x, y, vx, vy }); g.status = 'flying'; g.attach = null; g.landedOn = null; g.land = null; g.everFlew = true; };
const pirateShots = (g, seen) => { let n = 0; for (const b of M(g).bullets) if (b.team === 'pirate' && !seen.has(b)) { seen.add(b); n++; } return n; };

// ---------------- F1. Mochi Hub ----------------
{
  const g = Game.create(7, null, { fresh: true });
  const hub = Stations.byId(g, 'hub'), [hx, hy] = hub.state(g.t).map((v, i) => v - mochiAt(g)[i]);   // relative to Mochi
  check('[full] new game: docked at Mochi Hub, pirates stand down', g.spawn === 'hub' && g.status === 'docked' && Combat.hostileTo(g) === 'docked', `${g.spawn} ${g.status}`);
  check('[full] the Hub orbits well inside the pirate-free radius', Math.hypot(hx, hy) + 150 < Combat.SAFE_MOCHI, `Hub at r ${Math.hypot(hx, hy).toFixed(0)} m, safe to ${Combat.SAFE_MOCHI} m`);
  // a pirate dragged right up to the Hub with you hanging about outside the dock: it will not fight
  const [x, y, vx, vy] = hub.state(g.t);
  pinTo(g, x + 30, y, vx, vy);
  const p = Combat.spawn(g, 'biscotti', { quiet: true, state: 'attack', x: x + 90, y, vx, vy });
  const seen = new Set(); let shots = 0, attackT = 0;
  for (let f = 0; f < 60 * 15; f++) { const [x2, y2, vx2, vy2] = hub.state(g.t); pinTo(g, x2 + 30, y2, vx2, vy2); H.run(g, 1, {}); shots += pirateShots(g, seen); if (p.state === 'attack') attackT++; }
  check('[full] a pirate next to the Hub holds fire and backs off', shots === 0 && attackT < 5 && Combat.hostileTo(g) === 'hub', `${shots} shots, ${p.state}`);
  const g2 = Game.create(7, 'orbit', { fresh: true });                 // low Mochi orbit, under the Hub
  for (let f = 0; f < 300; f++) { g2.warpIdx = 6; H.run(g2, 1, {}); }
  check('[full] 3+ min under the Hub at 64x: no pirates ever show up', Combat.list(g2).length === 0 && g2.t > 150, `t ${g2.t.toFixed(0)} s, ${g2.status}`);
}

// ---------------- F2. Rust's: the real Stations.pirateFree bubble ----------------
{
  const g = Game.create(7, 'potato', { fresh: true }); quiet(g); arm(g, PEA);
  const ru = Stations.byId(g, 'rusts');
  check('[full] Stations.pirateFree exists and Rust\'s is pirate-free', typeof Stations.pirateFree === 'function' && !!ru && Stations.pirateFree(g, ...ru.state(g.t).slice(0, 2)));
  Stations.dock(g, 'rusts', true);
  const [rx, ry, rvx, rvy] = ru.state(g.t);
  const p = Combat.spawn(g, 'potato', { quiet: true, state: 'attack', crew: Combat.CREW[0], x: rx + 150, y: ry, vx: rvx, vy: rvy });
  const h0 = g.sh.hull, seen = new Set(); let shots = 0;
  for (let f = 0; f < 60 * 20; f++) { H.run(g, 1, {}); shots += pirateShots(g, seen); }
  check('[full] docked at Rust\'s: no shots, the pirate drifts off', g.status === 'docked' && shots === 0 && g.sh.hull === h0 && p.state !== 'attack', `${shots} shots, ${p.state}, ${Math.hypot(p.x - g.sh.x, p.y - g.sh.y).toFixed(0)} m`);
  // undocked but inside the 260 m bubble
  const hover = (dx) => { const [x, y, vx, vy] = ru.state(g.t); pinTo(g, x + dx, y, vx, vy); };
  hover(200);
  check('[full] 200 m from Rust\'s: inside the bubble; 300 m: fair game', Combat.hostileTo(g) === 'rusts' && (hover(300), Combat.hostileTo(g) === null), String(Combat.hostileTo(g)));
  p.state = 'attack'; Object.assign(p, { x: g.sh.x + 120, y: g.sh.y, vx: g.sh.vx, vy: g.sh.vy, aggro: 30 });
  shots = 0;
  for (let f = 0; f < 60 * 10; f++) { hover(150); H.run(g, 1, {}); shots += pirateShots(g, seen); }
  check('[full] hovering inside the bubble undocked: still no shots', shots === 0 && g.sh.hull === h0 && p.state !== 'attack', `${shots} shots, ${p.state}`);
  // a stray pirate round flying into the bubble is zapped before it reaches you
  hover(150);
  const b = Combat.fire(g, { x: g.sh.x + 140, y: g.sh.y, vx: g.sh.vx - 80, vy: g.sh.vy, team: 'pirate', dmg: 8 });
  for (let f = 0; f < 60; f++) { hover(150); H.run(g, 1, {}); }
  check('[full] stray pirate rounds fizzle at the bubble\'s edge', g.sh.hull === h0 && !M(g).bullets.includes(b), `hull ${g.sh.hull}`);
}

// ---------------- F3. the EVA laser (team 'player') zaps pirates ----------------
{
  const g = Game.create(7, 'potato', { fresh: true }); quiet(g);
  Game.landAt(g, g.w.byId.potato, 1.0);
  H.run(g, 2, {}); H.run(g, 1, { pressed: ['KeyE'] }); H.run(g, 20, {});
  check('[full] stepped out on Big Potato', EVA.isOut(g), g.mode);
  const A = g.astro, nb = Game.nearestBody(g, A.x, A.y), up = [nb.ux, nb.uy];
  const p = Combat.spawn(g, 'potato', { quiet: true, x: A.x, y: A.y, vx: A.vx, vy: A.vy });
  lobotomize(p);
  const pin = () => { const n = Game.nearestBody(g, g.astro.x, g.astro.y); Object.assign(p, { x: g.astro.x + up[0] * 5.5, y: g.astro.y + up[1] * 5.5, vx: n.bvx, vy: n.bvy }); };
  const hp0 = p.hp;
  for (let f = 0; f < 60; f++) { pin(); H.run(g, 1, { mouse: { x: p.x, y: p.y, sx: 0, sy: 0, down: true, pressed: f === 0, released: false, button: 0, px: 0.05 } }); }
  check('[full] EVA laser hurts a pirate (~18 dmg/s)', hp0 - p.hp > 10 && hp0 - p.hp < 26 && g.popups.some((q) => q.text === 'ZZT!'), `hp ${hp0} -> ${p.hp.toFixed(1)}`);
  const hA = A.hp;
  Combat.fire(g, { x: A.x + up[0] * 6, y: A.y + up[1] * 6, vx: A.vx - up[0] * 40, vy: A.vy - up[1] * 40, team: 'player', dmg: 8 });
  H.run(g, 20, {});
  const hA1 = g.astro.hp;
  Combat.fire(g, { x: g.astro.x + up[0] * 6, y: g.astro.y + up[1] * 6, vx: g.astro.vx - up[0] * 40, vy: g.astro.vy - up[1] * 40, team: 'pirate', dmg: 6 });
  H.run(g, 20, {});
  check('[full] your own bullets pass you by; pirate rounds hurt the astronaut', hA1 === hA && g.astro.hp < hA1, `hp ${hA} -> ${hA1} -> ${g.astro.hp}`);
}

// ---------------- F4. bullets vs bugs (team 'bug') ----------------
{
  const g = Game.create(7, 'kiwi', { fresh: true }); quiet(g);
  const kiwi = g.w.byId.kiwi, home = Mobs.home(g, 'kiwi');
  Game.landAt(g, kiwi, home.nests[0].th + 0.4);
  H.run(g, 2, {});
  const shootAt = (bug, team) => {
    const tg = Game.targets(g).find((t) => t.id === bug.id), [, , bvx, bvy] = World.bodyState(g.w, kiwi, g.t);
    const [bx, by] = World.bodyState(g.w, kiwi, g.t), d = Math.hypot(tg.x - bx, tg.y - by), ux = (tg.x - bx) / d, uy = (tg.y - by) / d;
    Combat.fire(g, { x: tg.x + ux * 5, y: tg.y + uy * 5, vx: bvx - ux * 50, vy: bvy - uy * 50, team, dmg: 8 });
  };
  const b1 = Mobs.spawn(g, 'kiwi', home.nests[2].th), hp1 = b1.hp;
  shootAt(b1, 'player'); H.run(g, 12, {});
  check('[full] a player bullet hits a space bug', b1.hp < hp1 || b1.dead, `${b1.name}: hp ${hp1} -> ${b1.hp}${b1.dead ? ' (squished)' : ''}`);
  for (let k = 0; k < 4 && !b1.dead; k++) { shootAt(b1, 'player'); H.run(g, 12, {}); }
  check('[full] ...a few peas squish a muncher (jelly + the bug job)', b1.dead && g.pickups.some((q) => q.item === 'jelly') && g.done.bug !== undefined);
  const b2 = Mobs.spawn(g, 'kiwi', home.nests[3].th), hp2 = b2.hp;
  shootAt(b2, 'pirate'); H.run(g, 12, {});
  check('[full] a stray pirate round hits bugs too (a bullet is a bullet)', b2.hp < hp2 || b2.dead, `hp ${hp2} -> ${b2.hp}`);
}

// ---------------- F5. 64x with everything on; save / load ----------------
{
  const g = Game.create(7, 'potato', { fresh: true }); arm(g, PEA);
  let bad = 0;
  for (let s = 0; s < 200; s++) {
    g.warpIdx = 6;
    H.run(g, 6, { keys: s % 9 === 0 ? ['Space'] : [] });
    for (const p of Combat.list(g)) if (!finite(p.x, p.y, p.vx, p.vy, p.hp)) bad++;
    for (const b of M(g).bullets) if (!finite(b.x, b.y, b.vx, b.vy)) bad++;
    if (!finite(g.sh.x, g.sh.y)) bad++;
    if (g.status === 'dead') H.run(g, 1, { pressed: ['KeyR'] });
  }
  check('[full] warp requested at Big Potato with every module: no NaN', bad === 0 && !g.err, `${bad} bad, t ${g.t.toFixed(0)} s (capped near pirates), ${g.err || 'no errors'}`);
  // real 64x: you cruise outside the zones while pirates lurk on their haunts far away
  const g3 = Game.create(7, 'orbit', { fresh: true }); quiet(g3); orbitAt(g3, 'mochi', 1300, 1.0);
  const lurkers = [Combat.spawn(g3, 'biscotti', { quiet: true }), Combat.spawn(g3, 'glimmer', { quiet: true }), Combat.spawn(g3, 'potato', { quiet: true })];
  let bad3 = 0, w64 = 0, minAlt = Infinity;
  for (let f = 0; f < 300; f++) {
    for (const p of lurkers) if (p) p.farT = 0;                       // keep them from going home
    g3.warpIdx = 6; H.run(g3, 1, {}); if (g3.warp === 64) w64++;
    for (const p of Combat.list(g3)) { if (!finite(p.x, p.y, p.vx, p.vy)) bad3++; minAlt = Math.min(minAlt, altOf(g3, p.x, p.y)); }
  }
  check('[full] 5 min at real 64x with three lurkers far off: finite, no crashes', bad3 === 0 && w64 > 250 && M(g3).crashes === 0 && minAlt > 5 && lurkers.every((p) => p && !p.gone && p.state === 'lurk'),
        `${w64} frames at 64x, t ${g3.t.toFixed(0)} s, lowest pirate ${minAlt.toFixed(0)} m up, ${lurkers.map((p) => p.gone ? 'gone' : p.state).join('/')}`);
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  Object.assign(M(g), { kills: 3, bounty: 610, fled: [{ name: 'Kessler Kate', short: 'KATE', pers: 'showoff', hpMax: 70 }] });
  g.dev = false; Game.save(g);
  const g2 = Game.create(7, null);
  check('[full] save / load round trip next to the other modules', M(g2).kills === 3 && M(g2).bounty === 610 && M(g2).fled[0].name === 'Kessler Kate' && Combat.list(g2).length === 0 && !g2.err);
  Game.wipeSave(); delete global.localStorage;
}

}   // FULL

if (!FULL) {
  const r = require('child_process').spawnSync(process.execPath, [__filename, '--full'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = r.stdout || '', lines = out.split('\n').filter((l) => /^(PASS|FAIL)/.test(l));
  if (lines.length) console.log(lines.join('\n'));
  nPass += lines.filter((l) => l.startsWith('PASS')).length;
  nFail += lines.filter((l) => l.startsWith('FAIL')).length;
  if (r.status !== 0 && !lines.some((l) => l.startsWith('FAIL'))) check('--full run finished', false, (r.stderr || '').split('\n').slice(0, 6).join(' | '));
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
