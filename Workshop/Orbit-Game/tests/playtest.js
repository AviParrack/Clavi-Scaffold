// ======================================================================
//  HEADLESS PLAYTEST v4  —  real key presses and clicks through the loop:
//  start docked at Mochi Hub, shop, undock, warp; launch from the pad to
//  orbit; step out on Mochi, laser ore, board; zap bugs on Kiwi; dock and
//  sell; buy an upgrade; Orion pulse; salvage a wreck; pirates.
//  v4 (contract §7.3, each SKIPs when its module or API is missing): the
//  Debug Duck's Max everything; a tethered EVA from orbit; grapple, crack
//  and sell a swarm rock; Mumble before and after the translator; the
//  tunnels spawn; landing at Frostbite Flats.
//  run:  python3 tools/bundle.py && NODE_PATH=$(npm root -g) node tests/playtest.js [outdir]
//        PLAYTEST_URL=http://localhost:8000/index.html runs it against a live server instead of the bundle
// ======================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(__dirname, '..', 'shots');
const FILE = process.env.PLAYTEST_URL || 'file://' + path.join(__dirname, '..', 'dist', 'pocket-orbit.html');
fs.mkdirSync(OUT, { recursive: true });
let nPass = 0, nFail = 0, nSkip = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok ? nPass++ : nFail++; };
const skip = (name, why) => { console.log(`SKIP  ${name}  ${why}`); nSkip++; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });

  const go = async (q) => { await page.goto(FILE + q); await page.waitForTimeout(700); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const st = () => ev(() => {
    const g = ORBIT.game, c = g.w.byId.mochi, o = ORBIT.Physics.orbitRel(g.sh, c, g.t, g.w);   // Mochi-relative: Mochi rides the belt
    return { t: g.t, status: g.status, mode: g.mode, ui: g.ui, ref: g.ref.id, alt: o.alt, ap: o.ap, pe: o.pe, vr: o.vr,
             hull: g.sh.hull, fuel: g.sh.fuel, money: g.money, warp: g.warp, err: g.err,
             cargo: ORBIT.Game.kgOf(g.cargo), pack: ORBIT.Game.kgOf(g.pack), done: Object.keys(g.done),
             ang: g.sh.ang, omega: g.sh.omega, up: Math.atan2(o.y, o.x), pro: Math.atan2(o.vy, o.vx),
             prompts: g.prompts.map((p) => p.text), impact: !!(g.pred && g.pred.impact) };
  });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log(`  shot ${name}`); };
  const tap = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const click = async (text) => {                                 // click a shop button by its visible text
    const b = page.locator('#ui button', { hasText: text }).first();
    if (!(await b.count())) return false;
    await b.click(); await page.waitForTimeout(250); return true;
  };
  const clickSel = async (sel) => {                               // click a shop button by selector
    const b = page.locator(sel).first();
    if (!(await b.count())) return false;
    await b.click(); await page.waitForTimeout(250); return true;
  };
  // a v4 section: SKIP when its module or API is missing, FAIL (not crash) when it throws
  const section = async (name, needs, body) => {
    let ok = false;
    try { ok = await ev(needs); } catch (e) { ok = false; }
    if (!ok) { skip(name, 'module or API missing'); return; }
    try { await body(); } catch (e) { check(name, false, `threw: ${e.message.split('\n')[0]}`); }
  };
  const shipGap = () => ev(() => Math.hypot(ORBIT.game.astro.x - ORBIT.game.sh.x, ORBIT.game.astro.y - ORBIT.game.sh.y));
  // steer with RCS only: one decision per call
  async function steerTo(target) {
    const s = await st(), err = wrap(target - s.ang), want = Math.max(-1.2, Math.min(1.2, 2.5 * err));
    if (want - s.omega > 0.15) await tap('KeyA', 40);
    else if (want - s.omega < -0.15) await tap('KeyD', 40);
    else await page.waitForTimeout(40);
  }
  // put the mouse on a world point (screen coords come from the live camera)
  const mouseAt = async (x, y) => { const [sx, sy] = await ev(([x, y]) => ORBIT.Render.toScreen(x, y), [x, y]); await page.mouse.move(sx, sy); };
  // aim at a spot fixed on a body (local lx, ly): every rock rides a rail now, so the world point moves
  const mouseOn = async (id, lx, ly) => { const [sx, sy] = await ev(([id, lx, ly]) => { const g = ORBIT.game, [bx, by] = ORBIT.World.bodyState(g.w, g.w.byId[id], g.t); return ORBIT.Render.toScreen(bx + lx, by + ly); }, [id, lx, ly]); await page.mouse.move(sx, sy); };

  // -------- 1. fresh game: docked at Mochi Hub, shop, undock, warp --------
  await go('?fresh=1');
  let s = await st();
  check('a new game starts docked at Mochi Hub', s.status === 'docked' && s.prompts.some((p) => /shop/i.test(p)), JSON.stringify(s.prompts));
  await shot('01_start_hub');
  await page.keyboard.press('KeyF'); await page.waitForTimeout(600);
  check('F opens the shop and pauses time', (await st()).ui === 'shop');
  await shot('02_shop_services');
  await click('Ship parts'); await shot('03_shop_parts');
  await click('Ship sheet'); await shot('04_shop_sheet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Esc closes the shop', (await st()).ui === null);
  await tap('KeyW', 250); await page.waitForTimeout(1500);
  s = await st();
  check('a tap of W undocks and pays the undock job', s.status === 'flying' && s.done.includes('undock'), `money ${s.money}`);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Period');
  await page.waitForTimeout(1500);
  s = await st();
  check('warp goes up with "."', s.warp > 1, `warp ${s.warp}x`);
  await shot('05_warp');
  await page.keyboard.press('KeyM'); await page.waitForTimeout(1200);
  await shot('06_map');

  // -------- 2. launch from the pad to orbit with RCS steering --------
  await go('?fresh=1&spawn=pad');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 600; i++) {
    s = await st();
    if (s.ap > 90) break;
    await steerTo(s.up - Math.min(1, s.alt / 40) * Math.PI / 2 * 0.9);
    if (i === 15) await shot('07_launch');
  }
  await page.keyboard.up('KeyW');
  check('lifted off with the main engine', (await st()).status === 'flying');
  for (let i = 0; i < 600; i++) { s = await st(); if (s.vr <= 0.3) break; await steerTo(s.pro); }
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 600; i++) { s = await st(); if (s.pe > 50) break; await steerTo(s.pro); }
  await page.keyboard.up('KeyW');
  for (let i = 0; i < 20; i++) await tap('KeyS', 30);
  s = await st();
  check('reached Mochi orbit with RCS steering', s.pe > 30 && !s.impact, `Pe ${s.pe.toFixed(0)} Ap ${s.ap.toFixed(0)} fuel ${s.fuel.toFixed(2)}`);
  await shot('08_orbit');

  // -------- 3. on foot on Mochi: step out, laser ore, board --------
  await go('?fresh=1&spawn=pad');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(700);
  s = await st();
  check('E on the pad steps outside', s.mode === 'eva', s.mode);
  await shot('09_eva_out');
  const dig = await ev(() => {                                    // the richest ore cell within 6 m, else plain ground below
    const g = ORBIT.game, A = g.astro, nb = ORBIT.Game.nearestBody(g, A.x, A.y), T = ORBIT.Terrain.of(nb.b);
    let best = null;
    for (let dx = -6; dx <= 6; dx += 0.5) for (let dy = -6; dy <= 0; dy += 0.5) {
      const x = A.x + dx * -nb.uy + dy * nb.ux, y = A.y + dx * nb.ux + dy * nb.uy, m = ORBIT.Terrain.mat(T, x - nb.bx, y - nb.by);
      if (m > 2 && m < 6 && (!best || Math.hypot(dx, dy) < best.d)) best = { x, y, d: Math.hypot(dx, dy), m };
    }
    const pick = best || { x: A.x - nb.ux * 2.5, y: A.y - nb.uy * 2.5, m: 2 };
    return { ...pick, id: nb.b.id, lx: pick.x - nb.bx, ly: pick.y - nb.by };
  });
  await mouseOn(dig.id, dig.lx, dig.ly); await page.mouse.down();
  for (let i = 0; i < 50 && !(await st()).pack; i++) { await page.waitForTimeout(500); if (i % 4 === 0) await mouseOn(dig.id, dig.lx, dig.ly); if (i === 6) await shot('10_laser'); }   // it digs through the regolith first
  await page.mouse.up();
  s = await st();
  check('the mining laser fills the backpack', s.pack > 0, `pack ${s.pack} kg (mat ${dig.m})`);
  await ev(() => { const g = ORBIT.game; Object.assign(g.astro, { x: g.sh.x + (g.astro.x - g.sh.x) * 0.2, y: g.sh.y + (g.astro.y - g.sh.y) * 0.2 }); });
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(600);
  s = await st();
  check('E boards and moves the pack into the hold', s.mode === 'ship' && s.cargo > 0, `hold ${s.cargo} kg`);

  // -------- 4. Kiwi: land, step out, zap bugs --------
  await go('?fresh=1&spawn=kiwi');
  await ev(() => {
    const g = ORBIT.game, k = g.w.byId.kiwi, [bx, by, bvx, bvy] = ORBIT.World.bodyState(g.w, k, g.t);
    Object.assign(g.sh, { x: bx, y: by + k.R + 5, vx: bvx, vy: bvy - 1.0, omega: 0, ang: Math.PI / 2 });
  });
  await page.waitForTimeout(4000);
  s = await st();
  check('soft touchdown lands on Kiwi', s.status === 'landed' && s.done.includes('kiwi'), s.status);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(3000);
  await shot('11_kiwi_eva');
  let squished = false;
  await page.mouse.down();
  for (let i = 0; i < 40 && !squished; i++) {
    const bug = await ev(() => { const g = ORBIT.game, A = g.astro; let b = null;     // screen point computed in-page: no lag while Kiwi races along
      for (const t of ORBIT.Game.targets(g)) if (t.team === 'bug' && (!b || Math.hypot(t.x - A.x, t.y - A.y) < Math.hypot(b.x - A.x, b.y - A.y))) b = t;
      return b && { s: ORBIT.Render.toScreen(b.x, b.y), d: Math.hypot(b.x - A.x, b.y - A.y) }; });
    if (bug && bug.d < 6.5) await page.mouse.move(bug.s[0], bug.s[1]);
    await page.waitForTimeout(250);
    if (i === 12) await shot('12_kiwi_bugs');
    squished = (await st()).done.includes('bug');
  }
  await page.mouse.up();
  check('the laser squishes a bug (bug job)', squished);
  await shot('13_kiwi_after');

  // -------- 5. dock at the hub, sell, buy an upgrade --------
  await go('?fresh=1&spawn=orbit');
  await ev(() => {
    const g = ORBIT.game, hub = Stations.byId('hub') || Stations.list(g).find((x) => x.kind === 'hub'), p = hub.portState(g.t);
    const [cx, cy] = hub.state(g.t), dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy);
    Object.assign(g.sh, { x: p[0] + dx / d * 6, y: p[1] + dy / d * 6, vx: p[2], vy: p[3], omega: 0 });
    ORBIT.Game.addCargo(g, 'iron', 60); ORBIT.Game.addCargo(g, 'opal', 2); g.money = 900;
  });
  await page.waitForTimeout(300);
  s = await st();
  check('near the hub port and slow: F prompt says dock', s.prompts.some((p) => /dock/i.test(p)), JSON.stringify(s.prompts));
  await page.keyboard.press('KeyF'); await page.waitForTimeout(6500);
  s = await st();
  check('F reels the ship in and opens the shop', s.status === 'docked' && s.ui === 'shop', `${s.status} ${s.ui}`);
  const m0 = (await st()).money;
  await page.locator('#ui button', { hasText: /^Sell$/ }).first().click(); await page.waitForTimeout(250);
  await shot('14_shop_sell');
  await click('Sell everything') || await click('Sell all');
  s = await st();
  check('Sell everything pays for the hold', s.money > m0 && s.cargo === 0, `$${m0} -> $${s.money}`);
  await click('Ship parts');
  const bought = await ev(() => {                                 // click the cheapest enabled buy button
    const bs = [...document.querySelectorAll('#ui button')].filter((b) => !b.disabled && /\$\s?\d/.test(b.textContent) && /buy/i.test(b.textContent));
    bs.sort((a, b) => +a.textContent.replace(/[^\d]/g, '') - +b.textContent.replace(/[^\d]/g, ''));
    if (!bs.length) return null; const t = bs[0].textContent.trim(); bs[0].click(); return t;
  });
  await page.waitForTimeout(300);
  s = await st();
  check('a Buy button installs an upgrade (upgrade job)', !!bought && s.done.includes('upgrade'), bought);
  await shot('15_shop_bought');
  await page.keyboard.press('Escape');

  // -------- 6. Orion pulse --------
  await go('?fresh=1&spawn=orbit');
  const v0 = await ev(() => { const g = ORBIT.game; g.money = 5000; Econ.buy(g, 'orion', Econ.hubStation ? Econ.hubStation(g) : undefined);
    return [g.sh.vx, g.sh.vy, ORBIT.Physics.mass(g.sh, g.S)]; });
  await page.keyboard.press('KeyN'); await page.waitForTimeout(150);
  const dv = await ev((v0) => Math.hypot(ORBIT.game.sh.vx - v0[0], ORBIT.game.sh.vy - v0[1]), v0);
  check('N fires an Orion pulse (dv = J/m)', dv > 15, `dv ${dv.toFixed(1)} m/s, mass ${v0[2].toFixed(2)} t`);
  await page.waitForTimeout(250); await shot('16_orion');

  // -------- 7. salvage a wreck (ESA4, low Mochi orbit) --------
  await go('?fresh=1&spawn=orbit');
  await ev(() => {
    const g = ORBIT.game, wr = Wrecks.byId(g, 'esa4') || Wrecks.list(g)[0], [x, y, vx, vy] = wr.state(g.t);
    const [mx, my] = ORBIT.World.bodyState(g.w, g.w.byId.mochi, g.t), r = Math.hypot(x - mx, y - my);
    Object.assign(g.sh, { x: x + (x - mx) / r * (wr.r + 8), y: y + (y - my) / r * (wr.r + 8), vx, vy, omega: 0 });
    g.navId = null;
  });
  await page.waitForTimeout(300);
  s = await st();
  check('beside a wreck and slow: F prompt says salvage', s.prompts.some((p) => /salvage/i.test(p)), JSON.stringify(s.prompts));
  const c0 = s.cargo;
  await page.keyboard.press('KeyF');
  for (let i = 0; i < 12; i++) {                                  // hold station on the wreck while the cutter works
    await page.waitForTimeout(400);
    await ev(() => { const g = ORBIT.game, wr = Wrecks.byId(g, 'esa4') || Wrecks.list(g)[0], [x, y, vx, vy] = wr.state(g.t);
      g.sh.vx += (vx - g.sh.vx) * 0.5; g.sh.vy += (vy - g.sh.vy) * 0.5; });
    if (i === 4) await shot('17_salvage');
  }
  s = await st();
  check('salvage fills the hold and pays the wreck job', s.cargo > c0 && s.done.includes('wreck'), `hold ${c0} -> ${s.cargo} kg`);
  await shot('18_salvaged');
  // -------- 8. pirates: fit a pea shooter, summon one (dev J), point and shoot --------
  await go('?dev=1&fresh=1&spawn=potato');
  await ev(() => { const g = ORBIT.game; Econ.grant(g, 'gun1'); ORBIT.Game.recalc(g); });
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(600);
  const hp0 = await ev(() => Combat.list(ORBIT.game).reduce((s, p) => s + p.hp, 0));
  check('dev J summons a pirate', hp0 > 0, `pirate hp ${hp0}`);
  await page.keyboard.down('Space');
  let hurt = false;
  for (let i = 0; i < 150 && !hurt; i++) {
    const aim = await ev(() => { const g = ORBIT.game, p = Combat.list(g).find((q) => !q.gone); if (!p) return null;
      const dx = p.x - g.sh.x, dy = p.y - g.sh.y, d = Math.hypot(dx, dy), tf = d / Math.max(1, g.S.gunSpeed);
      return Math.atan2(dy + (p.vy - g.sh.vy) * tf, dx + (p.vx - g.sh.vx) * tf); });
    if (aim == null) break;
    await steerTo(aim);
    if (i === 40) await shot('19_dogfight');
    hurt = await ev((hp0) => Combat.list(ORBIT.game).reduce((s, p) => s + Math.max(0, p.hp), 0) < hp0 || !!ORBIT.game.done.pirate, hp0);
  }
  await page.keyboard.up('Space');
  check('Space fires the gun and hits the pirate', hurt);
  await shot('20_dogfight_after');

  // -------- 9. v4 §7.3-1: dev mode, the Debug Duck anywhere (O), Max everything, U, ?build=beast --------
  await go('?dev=1&fresh=1&spawn=orbit');
  await section('dev: Max everything', () => typeof Econ !== 'undefined' && !!Econ && !!ORBIT.game.mod.economy && !!Econ.isInf && !!Econ.grantAll && !!Econ.CHARGES, async () => {
    await page.keyboard.press('KeyO'); await page.waitForTimeout(500);
    check('dev: O opens the Debug Duck shop anywhere', (await st()).ui === 'shop');
    const viaUi = (await clickSel('#ui button[data-act="tab"][data-id="dev"]')) && (await clickSel('#ui button[data-act="dev"][data-id="max"]'));
    if (!viaUi) await ev(() => Econ.grantAll(ORBIT.game));
    await shot('21_dev_max');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const mx = await ev(() => { const g = ORBIT.game, ch = Econ.charges(g);
      return { frame: g.S.frameId, engine: g.S.engine, inf: Econ.isInf(g), full: Object.entries(Econ.CHARGES).every(([id, c]) => (ch[id] || 0) >= c.max) }; });
    check('dev: Max everything flies the Leviathan on the Sunflower', mx.frame === 'leviathan' && mx.engine === 'sunflower', `${mx.frame} / ${mx.engine}${viaUi ? '' : ' (no Dev tab button: via Econ.grantAll)'}`);
    check('dev: money is ∞ and the crack charges are full', mx.inf && mx.full, JSON.stringify(mx));
    await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await shot('22_fusion_burn'); await page.keyboard.up('KeyW');
    const f0 = await ev(() => { const g = ORBIT.game; g.sh.fuel *= 0.3; return g.sh.fuel / g.S.fuel; });
    await page.keyboard.press('KeyU'); await page.waitForTimeout(200);
    const f1 = await ev(() => ORBIT.game.sh.fuel / ORBIT.game.S.fuel);
    check('dev: U tops everything up', f0 < 0.5 && f1 > 0.999, `fuel ${(100 * f0).toFixed(0)}% -> ${(100 * f1).toFixed(0)}%`);
    await go('?dev=1&fresh=1&build=beast&spawn=orbit');
    const b = await ev(() => [ORBIT.game.S.frameId, ORBIT.game.S.engine]);
    check('?dev=1&build=beast gives the same ship', b[0] === 'leviathan' && b[1] === 'sunflower', b.join(' / '));
  });

  // -------- 10. v4 §7.3-2: a tethered EVA from orbit --------
  await go('?dev=1&fresh=1&spawn=orbit');
  await section('tethered EVA from orbit', () => typeof EVA !== 'undefined' && !!EVA && !!ORBIT.game.mod.eva && typeof EVA.isTethered === 'function' && typeof EVA.canBoard === 'function', async () => {
    await page.keyboard.press('KeyE'); await page.waitForTimeout(700);
    const te = await ev(() => { const g = ORBIT.game; return { mode: g.mode, tethered: EVA.isTethered(g), warp: g.warp }; });
    check('E in orbit steps out on a tether, at 1x', te.mode === 'eva' && te.tethered && te.warp === 1, JSON.stringify(te));
    const lim = await ev(() => (ORBIT.game.S.tetherLen ?? 30) + ORBIT.game.S.radius);
    let dMax = 0;
    await page.keyboard.down('KeyD');
    for (let i = 0; i < 25; i++) { await page.waitForTimeout(120); dMax = Math.max(dMax, await shipGap()); }
    await page.keyboard.up('KeyD');
    await shot('23_tether');
    check('the tether holds (centre distance <= tetherLen + hull radius)', dMax <= lim + 0.05, `max ${dMax.toFixed(2)} m of ${lim.toFixed(2)} m`);
    await page.keyboard.down('KeyQ');
    for (let i = 0; i < 80 && !(await ev(() => EVA.canBoard(ORBIT.game))); i++) await page.waitForTimeout(150);
    await page.keyboard.up('KeyQ');
    await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
    s = await st();
    check('Q reels you in and E boards', s.mode === 'ship', `${s.mode}, ${(await shipGap()).toFixed(1)} m`);
  });

  // -------- 11. v4 §7.3-3: grapple a swarm rock, crack it, tow a fragment to the Crusher and sell it --------
  await go('?dev=1&fresh=1&build=hauler&spawn=swarm&inf=0');
  await section('grapple, crack and sell a rock', () => typeof Haul !== 'undefined' && !!Haul && !!ORBIT.game.mod.haul && !!Haul.devRock && !!Haul.towInfo && !!Haul.sellPoints
    && typeof Econ !== 'undefined' && !!ORBIT.game.mod.economy && (ORBIT.game.S.towMax ?? 0) > 0, async () => {
    await page.keyboard.press('KeyU'); await page.waitForTimeout(200);
    await ev(() => { const g = ORBIT.game; g.sh.omega = 0; Haul.devRock(g, 'gravel', 3); });
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyG'); await page.waitForTimeout(1200);
    const h = await ev(() => ({ tow: Haul.towInfo(ORBIT.game), toasts: ORBIT.game.toasts.map((t) => t.text) }));
    check('G latches a rock: the toast names type, mass and value', !!h.tow && h.toasts.some((t) => /HOOKED/i.test(t) && /\d+(\.\d)? t/.test(t) && /\$/.test(t)), h.toasts.join(' | '));
    if (!h.tow) return;
    await ev(() => { const g = ORBIT.game, t = Haul.towInfo(g); g.sh.ang = Math.atan2(g.sh.y - t.y, g.sh.x - t.x); g.sh.omega = 0; });
    let taut = 0;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(100); taut = Math.max(taut, await ev(() => { const t = Haul.towInfo(ORBIT.game); return t ? t.tension : 0; })); }
    await page.keyboard.up('KeyW');
    check('burning away pulls the rope taut', taut > 0, `max tension ${taut.toFixed(0)} N`);
    await shot('24_tow');
    const n0 = await ev(() => Haul.free(ORBIT.game).length);
    await page.keyboard.press('KeyB'); await page.waitForTimeout(250);
    check('B plants a charge and cuts the rope', !(await ev(() => Haul.towInfo(ORBIT.game))));
    await ev(() => { const g = ORBIT.game, a = g.sh.ang; g.sh.x += Math.cos(a) * 60; g.sh.y += Math.sin(a) * 60; });   // get clear
    let n1 = n0;
    for (let i = 0; i < 80 && n1 === n0; i++) { await page.waitForTimeout(150); n1 = await ev(() => Haul.free(ORBIT.game).length); }
    await page.waitForTimeout(400);
    s = await st();
    check('the fuse blows it into 2-5 fragments (crack job)', n1 - n0 + 1 >= 2 && n1 - n0 + 1 <= 5 && s.done.includes('crack'), `${n1 - n0 + 1} fragments`);
    await shot('25_cracked');
    // hook the biggest fragment from 6 m, then put ship and rock 15 m off the Crusher at its velocity
    await ev(() => { const g = ORBIT.game, fr = Haul.free(g).slice().sort((a, b) => b.m - a.m)[0], d = fr.r + g.S.radius + 6;
      Object.assign(g.sh, { x: fr.x - d, y: fr.y, vx: fr.vx, vy: fr.vy, ang: 0, omega: 0 }); });
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyG'); await page.waitForTimeout(1200);
    const hooked = await ev(() => !!Haul.towInfo(ORBIT.game));
    check('G hooks a fragment', hooked);
    if (!hooked) return;
    const pay = await ev(() => {
      const g = ORBIT.game, sp = Haul.sellPoints(g)[0], t = Haul.towInfo(g), rk = Haul.free(g).find((r) => r.id === t.id), r = Math.hypot(sp.x, sp.y), ux = sp.x / r, uy = sp.y / r;
      const dr = sp.r + rk.r + 15, ds = dr + rk.r + g.S.radius + Math.min(t.len, 8);
      Object.assign(rk, { x: sp.x + ux * dr, y: sp.y + uy * dr, vx: sp.vx, vy: sp.vy });
      Object.assign(g.sh, { x: sp.x + ux * ds, y: sp.y + uy * ds, vx: sp.vx, vy: sp.vy, omega: 0 });
      return g.money;
    });
    await page.waitForTimeout(400);
    s = await st();
    const offer = s.prompts.find((p) => /^Sell .* for \$/.test(p)) || '';
    check('at the Crusher and slow: F offers to sell the rock', !!offer, JSON.stringify(s.prompts));
    await shot('26_crusher');
    const done0 = s.done;
    await page.keyboard.press('KeyF'); await page.waitForTimeout(400);
    s = await st();
    const shown = +(offer.match(/\$([\d,]+)/) || [0, '0'])[1].replace(/,/g, ''), jobs = s.done.filter((id) => !done0.includes(id));
    const paid = await ev((ids) => ids.reduce((a, id) => a + ((ORBIT.Game.GOALS.find((x) => x.id === id) || {}).reward || 0), 0), jobs);
    check('F sells: money goes up by the shown value (haul job)', Math.abs(s.money - pay - shown - paid) <= 1 && s.done.includes('haul'),
      `$${pay} -> $${s.money}: offer $${shown} + jobs ${jobs.join(',') || 'none'} $${paid}`);
  });

  // -------- 12. v4 §7.3-4: Mumble, before and after the translator --------
  await go('?dev=1&fresh=1&spawn=pad');
  await section('Mumble and the translator', () => typeof Npcs !== 'undefined' && !!Npcs && !!ORBIT.game.mod.npcs && !!Npcs.readable && !!Npcs.talking && Npcs.list(ORBIT.game).some((n) => n.id === 'mumble'), async () => {
    await page.keyboard.press('KeyE'); await page.waitForTimeout(700);
    const near = async () => ev(() => { const g = ORBIT.game, n = Npcs.list(g).find((q) => q.id === 'mumble'), [ux, uy] = n.up || [0, 1];   // right beside Mumble
      Object.assign(g.astro, { x: n.x - uy * 0.5 + ux * 0.2, y: n.y + ux * 0.5 + uy * 0.2, vx: n.vx || 0, vy: n.vy || 0 }); });
    await near(); await page.waitForTimeout(300);
    await page.keyboard.press('KeyF'); await page.waitForTimeout(900);
    s = await st();
    const before = await ev(() => ({ talk: Npcs.talking(ORBIT.game, 'mumble'), read: Npcs.readable(ORBIT.game, 'murk', 'hello') }));
    check('F talks to Mumble in Murk glyphs (meet job)', before.talk && !before.read && s.done.includes('meet'), JSON.stringify(before));
    await shot('27_mumble_glyphs');
    await page.keyboard.press('KeyL'); await page.keyboard.press('KeyL'); await page.waitForTimeout(200);
    await near(); await page.waitForTimeout(1500);
    await page.keyboard.press('KeyF'); await page.waitForTimeout(1500);
    const after = await ev(() => ({ talk: Npcs.talking(ORBIT.game, 'mumble'), read: Npcs.readable(ORBIT.game, 'murk', 'hello'), lvl: Npcs.translator(ORBIT.game) }));
    check('with the translator Mumble reads in English', after.talk && after.read, JSON.stringify(after));
    await shot('28_mumble_english');
  });

  // -------- 13. v4 §7.3-5: the tunnels --------
  await go('?fresh=1&spawn=tunnels');
  await section('the tunnels spawn', () => typeof Mochi !== 'undefined' && !!Mochi && !!ORBIT.game.mod.mochi && !!Mochi.zoneAt && !!ORBIT.Game.SPAWNS.tunnels, async () => {
    const z = await ev(() => { const g = ORBIT.game, z = Mochi.zoneAt(g, g.astro.x, g.astro.y); return { mode: g.mode, zone: z && z.name, hp: g.astro.hp }; });
    await page.waitForTimeout(1500);
    const hp = await ev(() => ORBIT.game.astro.hp);
    check('?spawn=tunnels: on foot in a named zone, safe', z.mode === 'eva' && !!z.zone && hp >= z.hp, JSON.stringify(z));
    await shot('29_tunnels');
  });

  // -------- 14. v4 §7.3-6: land at Frostbite Flats and trade --------
  await go('?fresh=1&spawn=orbit');
  await section('land at Frostbite Flats', () => typeof Mochi !== 'undefined' && !!Mochi && !!ORBIT.game.mod.mochi && !!Mochi.outposts && Mochi.outposts(ORBIT.game).some((o) => /frostbite/i.test(o.name)), async () => {
    const hull0 = await ev(() => {
      const g = ORBIT.game, o = Mochi.outposts(g).find((q) => /frostbite/i.test(q.name)), b = g.w.byId[o.body], [bx, by, bvx, bvy] = ORBIT.World.bodyState(g.w, b, g.t);
      const r = Math.hypot(o.lx, o.ly), ux = o.lx / r, uy = o.ly / r, up = g.S.radius + 0.3;   // Mochi pulls ~1.8 m/s²: start low and slow
      Object.assign(g.sh, { x: bx + o.lx + ux * up, y: by + o.ly + uy * up, vx: bvx - ux * 0.2, vy: bvy - uy * 0.2, ang: Math.atan2(uy, ux), omega: 0 });
      g.navId = null; return g.sh.hull;
    });
    for (let i = 0; i < 30 && (await st()).status !== 'landed'; i++) await page.waitForTimeout(200);
    await page.waitForTimeout(400);
    s = await st();
    check('lands on the Frostbite Flats plinth with no damage', s.status === 'landed' && s.hull >= hull0, `${s.status}, hull ${hull0} -> ${s.hull}`);
    await shot('30_frostbite');
    const offer = s.prompts.find((p) => /frostbite|okra/i.test(p));
    await page.keyboard.press('KeyF'); await page.waitForTimeout(600);
    const shop = await ev(() => ({ ui: ORBIT.game.ui, name: /frostbite/i.test(document.getElementById('ui').textContent) }));
    check('F opens the Frostbite Flats shop', !!offer && shop.ui === 'shop' && shop.name, `${JSON.stringify(s.prompts)} ${JSON.stringify(shop)}`);
    await shot('31_frostbite_shop');
    await page.keyboard.press('Escape');
  });

  s = await st();
  check('no module error on screen', !s.err, s.err || '');
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${nPass} passed, ${nFail} failed, ${nSkip} skipped`);
  await browser.close();
  process.exit(nFail ? 1 : 0);
})();
