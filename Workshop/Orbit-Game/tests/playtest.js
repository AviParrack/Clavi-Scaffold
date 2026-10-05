// ======================================================================
//  HEADLESS PLAYTEST  —  flies to orbit with real key presses, screenshots each phase
//  run:  NODE_PATH=$(npm root -g) node tests/playtest.js [outdir]
// ======================================================================

const { chromium } = require('playwright');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', 'shots');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'pocket-orbit.html') + '?debug=1';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.text().startsWith('[orbit]') && !m.text().includes('config')) console.log('  ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(800);
  const st = () => page.evaluate(() => { const g = ORBIT.game, o = ORBIT.Physics.orbit(g.s, ORBIT.CONFIG.planet);
    return { t: g.t, alt: g.alt, ap: o.ap, pe: o.pe, tAp: o.tAp, E: o.E, fuel: g.s.fuel, status: g.status, done: Object.keys(g.done) }; });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log(`  shot ${name}`, JSON.stringify(await st(), (k, v) => typeof v === 'number' ? +v.toFixed(1) : v)); };

  // -------- pad --------
  await shot('01_pad');

  // -------- ascent: full throttle, tap D for a gravity turn --------
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await shot('02_liftoff');
  for (let i = 0; i < 400; i++) {                                   // pitch program: tilt with altitude
    const s = await st();
    if (s.ap > 250) break;
    const pitch = await page.evaluate(() => { const s = ORBIT.game.s, up = Math.atan2(s.y, s.x);
      return Math.atan2(Math.sin(up - s.angle), Math.cos(up - s.angle)) * 180 / Math.PI; });
    if (pitch < Math.min(80, s.alt / 90 * 85) - 3) { await page.keyboard.down('KeyD'); await page.waitForTimeout(40); await page.keyboard.up('KeyD'); }
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('KeyW');
  await shot('03_meco');

  // -------- coast to apoapsis, then prograde burn --------
  await page.keyboard.press('KeyQ');
  for (let i = 0; i < 200; i++) { const s = await st(); if (s.tAp < 1.5 || !(s.tAp > 0)) break; await page.waitForTimeout(50); }
  await shot('04_at_ap');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 100; i++) { const s = await st(); if (s.pe > 180) break; await page.waitForTimeout(50); }
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  await shot('05_orbit');

  // -------- map + warp --------
  await page.keyboard.press('KeyM');
  await page.keyboard.press('Period'); await page.keyboard.press('Period'); await page.keyboard.press('Period');
  await page.waitForTimeout(2500);
  await shot('06_map_warp');

  // -------- boost Ap: burn prograde --------
  await page.keyboard.press('Comma'); await page.keyboard.press('Comma'); await page.keyboard.press('Comma');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 100; i++) { const s = await st(); if (s.ap > 1600) break; await page.waitForTimeout(50); }
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(1500);
  await shot('07_boost');

  // -------- touchdown checks: soft (3 m/s) lands, hard (15 m/s) crashes --------
  for (const [v, want] of [[3, 'landed'], [15, 'crashed']]) {
    await page.keyboard.press('KeyR');
    await page.evaluate((v) => { const g = ORBIT.game; g.status = 'flying'; g.s.y += 0.5; g.s.vy = -v; g.s.fuel = 0; }, v);
    await page.waitForTimeout(2500);
    const got = (await st()).status;
    console.log(`${got === want ? 'PASS' : 'FAIL'}  touchdown at ${v} m/s -> ${got} (want ${want})`);
    await shot(`08_touchdown_${v}`);
  }

  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
})();
