// ======================================================================
//  HEADLESS PLAYTEST v3  —  real key presses and clicks through the loop:
//  start docked at Ceres Hub, shop, undock, warp; launch from the pad to
//  orbit; step out on Ceres, laser ore, board; zap bugs on Kiwi; dock and
//  sell; buy an upgrade; Orion pulse; salvage a wreck; pirates.
//  run:  python3 tools/bundle.py && NODE_PATH=$(npm root -g) node tests/playtest.js [outdir]
// ======================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(__dirname, '..', 'shots');
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'pocket-orbit.html');
fs.mkdirSync(OUT, { recursive: true });
let nPass = 0, nFail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok ? nPass++ : nFail++; };
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
    const g = ORBIT.game, c = g.w.byId.ceres, o = ORBIT.Physics.orbitRel(g.sh, c, g.t, g.w);
    return { t: g.t, status: g.status, mode: g.mode, ui: g.ui, ref: g.ref.id, alt: o.alt, ap: o.ap, pe: o.pe, vr: o.vr,
             hull: g.sh.hull, fuel: g.sh.fuel, money: g.money, warp: g.warp, err: g.err,
             cargo: ORBIT.Game.kgOf(g.cargo), pack: ORBIT.Game.kgOf(g.pack), done: Object.keys(g.done),
             ang: g.sh.ang, omega: g.sh.omega, up: Math.atan2(g.sh.y, g.sh.x), pro: Math.atan2(g.sh.vy, g.sh.vx),
             prompts: g.prompts.map((p) => p.text), impact: !!(g.pred && g.pred.impact) };
  });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log(`  shot ${name}`); };
  const tap = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const click = async (text) => {                                 // click a shop button by its visible text
    const b = page.locator('#ui button', { hasText: text }).first();
    if (!(await b.count())) return false;
    await b.click(); await page.waitForTimeout(250); return true;
  };
  // steer with RCS only: one decision per call
  async function steerTo(target) {
    const s = await st(), err = wrap(target - s.ang), want = Math.max(-1.2, Math.min(1.2, 2.5 * err));
    if (want - s.omega > 0.15) await tap('KeyA', 40);
    else if (want - s.omega < -0.15) await tap('KeyD', 40);
    else await page.waitForTimeout(40);
  }
  // put the mouse on a world point (screen coords come from the live camera)
  const mouseAt = async (x, y) => { const [sx, sy] = await ev(([x, y]) => ORBIT.Render.toScreen(x, y), [x, y]); await page.mouse.move(sx, sy); };

  // -------- 1. fresh game: docked at Ceres Hub, shop, undock, warp --------
  await go('?fresh=1');
  let s = await st();
  check('a new game starts docked at Ceres Hub', s.status === 'docked' && s.prompts.some((p) => /shop/i.test(p)), JSON.stringify(s.prompts));
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
  check('reached Ceres orbit with RCS steering', s.pe > 30 && !s.impact, `Pe ${s.pe.toFixed(0)} Ap ${s.ap.toFixed(0)} fuel ${s.fuel.toFixed(2)}`);
  await shot('08_orbit');

  // -------- 3. on foot on Ceres: step out, laser ore, board --------
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
    return best || { x: A.x - nb.ux * 2.5, y: A.y - nb.uy * 2.5, m: 2 };
  });
  await mouseAt(dig.x, dig.y); await page.mouse.down();
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(500); const d = await ev(() => [ORBIT.game.astro.x, ORBIT.game.astro.y]); if (i % 4 === 0) await mouseAt(dig.x, dig.y); if (i === 6) await shot('10_laser'); }
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
    const bug = await ev(() => { const g = ORBIT.game, A = g.astro; let b = null;
      for (const t of ORBIT.Game.targets(g)) if (t.team === 'bug' && (!b || Math.hypot(t.x - A.x, t.y - A.y) < Math.hypot(b.x - A.x, b.y - A.y))) b = t;
      return b && { x: b.x, y: b.y, d: Math.hypot(b.x - A.x, b.y - A.y) }; });
    if (bug && bug.d < 6.5) await mouseAt(bug.x, bug.y);
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

  // -------- 7. salvage a wreck (ESA4, low Ceres orbit) --------
  await go('?fresh=1&spawn=orbit');
  await ev(() => {
    const g = ORBIT.game, wr = Wrecks.byId(g, 'esa4') || Wrecks.list(g)[0], [x, y, vx, vy] = wr.state(g.t), r = Math.hypot(x, y);
    Object.assign(g.sh, { x: x + x / r * (wr.r + 8), y: y + y / r * (wr.r + 8), vx, vy, omega: 0 });
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

  s = await st();
  check('no module error on screen', !s.err, s.err || '');
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${nPass} passed, ${nFail} failed`);
  await browser.close();
  process.exit(nFail ? 1 : 0);
})();
