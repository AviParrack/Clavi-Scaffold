// ======================================================================
//  HEADLESS PLAYTEST  —  real key presses: launch with thruster steering,
//  orbit Ceres, then visit each spawn; checks bumps, landing, takeoff.
//  run:  python3 tools/bundle.py && NODE_PATH=$(npm root -g) node tests/playtest.js [outdir]
// ======================================================================

const { chromium } = require('playwright');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', 'shots');
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'pocket-orbit.html');
let nPass = 0, nFail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); ok ? nPass++ : nFail++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); if (m.text().includes('GOAL') || m.text().includes('->')) console.log('  ' + m.text()); });

  const st = () => page.evaluate(() => {
    const g = ORBIT.game, c = g.w.byId.ceres, o = ORBIT.Physics.orbitRel(g.sh, c, g.t, g.w);
    const up = Math.atan2(g.sh.y, g.sh.x);
    return { t: g.t, status: g.status, ref: g.ref.id, alt: o.alt, ap: o.ap, pe: o.pe, vr: o.vr, hull: g.sh.hull, fuel: g.sh.fuel, rcs: g.sh.rcs,
             ang: g.sh.ang, omega: g.sh.omega, up, pro: Math.atan2(g.sh.vy, g.sh.vx), done: Object.keys(g.done), impact: !!(g.pred && g.pred.impact) };
  });
  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    const s = await st();
    console.log(`  shot ${name}`, JSON.stringify(s, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
  };
  const tap = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // steer with RCS only: one decision per call
  async function steerTo(target) {
    const s = await st(), err = wrap(target - s.ang), want = Math.max(-1.2, Math.min(1.2, 2.5 * err));
    if (want - s.omega > 0.15) await tap('KeyA', 40);
    else if (want - s.omega < -0.15) await tap('KeyD', 40);
    else await page.waitForTimeout(40);
  }

  // -------- 1. pad & launch with thruster steering --------
  await page.goto(FILE + '?spawn=pad');
  await page.waitForTimeout(800);
  await shot('01_pad');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 600; i++) {
    const s = await st();
    if (s.ap > 90) break;
    await steerTo(s.up - Math.min(1, s.alt / 40) * Math.PI / 2 * 0.9);
    if (i === 15) await shot('02_launch');
  }
  await page.keyboard.up('KeyW');
  check('lifted off with the main engine', (await st()).status === 'flying');
  for (let i = 0; i < 600; i++) { const s = await st(); if (s.vr <= 0.3) break; await steerTo(s.pro); }
  await shot('03_at_ap');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 600; i++) { const s = await st(); if (s.pe > 50) break; await steerTo(s.pro); }
  await page.keyboard.up('KeyW');
  for (let i = 0; i < 20; i++) await tap('KeyS', 30);
  let s = await st();
  check('reached Ceres orbit with RCS steering', s.pe > 30 && !s.impact, `Pe ${s.pe.toFixed(0)} Ap ${s.ap.toFixed(0)} fuel ${s.fuel.toFixed(2)} rcs ${s.rcs.toFixed(1)}`);
  await page.waitForTimeout(500);
  await shot('04_orbit');
  await page.keyboard.press('KeyM'); await page.waitForTimeout(1500);
  await shot('05_map');

  // -------- 2. rubble belt: look, then ram a rock --------
  await page.goto(FILE + '?spawn=belt'); await page.waitForTimeout(800);
  await shot('06_belt');
  const hit = await page.evaluate(() => {
    const g = ORBIT.game, W = ORBIT.World;
    let best = null, bd = 1e9;
    for (const rk of g.w.rocks) { const [x, y] = W.rockState(g.w, rk, g.t); const d = Math.hypot(x - g.sh.x, y - g.sh.y); if (d < bd && rk.r > 4) { bd = d; best = rk; } }
    const [x, y, vx, vy] = W.rockState(g.w, best, g.t), d = Math.hypot(x - g.sh.x, y - g.sh.y);
    Object.assign(g.sh, { x: x - (x - g.sh.x) / d * (best.r + 12), y: y - (y - g.sh.y) / d * (best.r + 12) });
    const ux = (x - g.sh.x) / (best.r + 12), uy = (y - g.sh.y) / (best.r + 12);
    g.sh.vx = vx + ux * 4; g.sh.vy = vy + uy * 4;
    return g.sh.hull;
  });
  await page.waitForTimeout(3500);
  s = await st();
  check('ramming a rock bounces and dents the hull', s.hull < hit && s.status === 'flying', `hull ${hit} -> ${s.hull.toFixed(0)}`);
  await shot('07_bonk');

  // -------- 3. Kiwi: look, then soft landing --------
  await page.goto(FILE + '?spawn=kiwi'); await page.waitForTimeout(800);
  await shot('08_kiwi');
  await page.keyboard.press('KeyM'); await page.waitForTimeout(1500);
  await shot('09_kiwi_map');
  await page.evaluate(() => {
    const g = ORBIT.game, k = g.w.byId.kiwi, [bx, by, bvx, bvy] = ORBIT.World.bodyState(g.w, k, g.t);
    Object.assign(g.sh, { x: bx, y: by + k.R + 5, vx: bvx, vy: bvy - 1.0, omega: 0, ang: Math.PI / 2 });
  });
  await page.waitForTimeout(4000);
  s = await page.evaluate(() => ({ status: ORBIT.game.status, on: ORBIT.game.landedOn && ORBIT.game.landedOn.id, done: Object.keys(ORBIT.game.done) }));
  check('soft touchdown lands on Kiwi', s.status === 'landed' && s.on === 'kiwi' && s.done.includes('kiwi'), JSON.stringify(s));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(800);
  await shot('10_kiwi_landed');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  s = await st();
  check('takes off again from a moving asteroid', s.status === 'flying');

  // -------- 4. hard hit on Ceres = kaboom --------
  await page.goto(FILE + '?spawn=orbit'); await page.waitForTimeout(500);
  await page.evaluate(() => { const g = ORBIT.game; g.sh.vx = 0; g.sh.vy = -20; });
  await page.waitForTimeout(4000);
  s = await st();
  check('hard impact destroys the ship', s.status === 'dead', s.status);
  await shot('11_kaboom');

  const drawnErr = await page.evaluate(() => document.title);
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${nPass} passed, ${nFail} failed`);
  await browser.close();
})();
