// ===== UI playthrough: one whole run in real time, driven by real mouse clicks, drags and keys =====
// usage:  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 node test/ui-play.mjs <outdir> [seed]
// Start Medium from the start screen → place defenses from the menu → upgrade one → buy a mount → drag the compute
// split → answer a choice → keep a research card → skip to G7 (debug key N) and watch the volume → reach the
// scorecard → PLAY AGAIN. Every step checks the state it should have changed and saves a PNG. Exit code 1 on any
// failed check or page error. The page runs ?debug=1 only for window.__handoff (to find hit regions) and the N key;
// every action goes through the mouse or keyboard like a player's would.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT = process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out, seed = '11'] = process.argv.slice(2);
if (!out) { console.log('usage: node test/ui-play.mjs <outdir> [seed]'); process.exit(0); }
fs.mkdirSync(out, { recursive: true });

// =================== static server and fonts (same as test/ui-shot.mjs) ===================

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = await new Promise(ok => {
  const s = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  s.listen(0, '127.0.0.1', () => ok(s));
});
const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 660 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e.stack || e)));
await page.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
  try {
    const x = await fetch(r.request().url(), { headers: { 'user-agent': r.request().headers()['user-agent'] } });
    await r.fulfill({ status: x.status, headers: { 'content-type': x.headers.get('content-type') || '', 'access-control-allow-origin': '*' },
      body: Buffer.from(await x.arrayBuffer()) });
  } catch { await r.abort(); }
});

// =================== helpers ===================

let failed = 0, n = 0;
const log = (ok, what, note = '') => { console.log(`${ok ? 'ok ' : 'FAIL'} ${what}${note ? '   ' + note : ''}`); if (!ok) failed++; };
const S = fn => page.evaluate(`(${fn})(window.__handoff, window.__handoff.st)`);      // read state in the page
const wait = ms => page.waitForTimeout(ms);
const shot = async name => page.screenshot({ path: path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`) });

// centre of the newest hit region of this kind whose data includes `data`, in client px (null if none)
async function where(kind, data = {}) {
  return page.evaluate(([kind, data]) => {
    const H = window.__handoff;
    const r = H.regions(kind).reverse().find(r => Object.entries(data).every(([k, v]) => r.data?.[k] === v));
    return r ? H.client(r.x + r.w / 2, r.y + r.h / 2) : null;
  }, [kind, data]);
}
async function click(kind, data = {}, { shift = false, button = 'left' } = {}) {
  const p = await where(kind, data);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await wait(60);                                   // a frame or two: hover state settles
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down({ button }); await page.mouse.up({ button });
  if (shift) await page.keyboard.up('Shift');
  await wait(80);
  return true;
}
// wait for a condition on the state, polling (real time)
async function until(fn, ms = 10000) {
  try { await page.waitForFunction(`(${fn})(window.__handoff, window.__handoff.st)`, null, { timeout: ms, polling: 100 }); return true; }
  catch { return false; }
}
// answer whatever choice is open by clicking its first row in the codec (the rows appear once the question is typed)
async function answerChoice(i = 0) {
  const id = await S((H, st) => st?.pendingChoice?.eventId ?? null);
  if (!id) return null;
  const shown = await until(H => H.regions('choice').length > 0, 15000);
  if (!shown) { await click('codec-next'); await until(H => H.regions('choice').length > 0, 8000); }
  await wait(700);                                      // codec.js CHOICE_GRACE: a click in the first 0.6 s is ignored
  const ok = await click('choice', { i });
  const gone = await until((H, st) => !st.pendingChoice || st.pendingChoice.eventId !== H.__lastChoice, 3000);
  return ok && gone ? id : `${id} (not answered)`;
}

// =================== the run ===================

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?debug=1&seed=${seed}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__handoff, null, { timeout: 10000 });
  await page.evaluate(() => window.__handoff.fontsReady);
  await wait(1500);
  await shot('start');

  // ---------- 1. start Medium: a click on the difficulty row ----------
  await page.locator('#difficulty .ch', { hasText: 'Medium' }).click();
  log(await until((H, st) => st && st.phase === 'play'), 'start Medium', await S((H, st) => `difficulty ${st?.difficulty}`));
  await wait(800);
  await shot('g1-empty');

  // ---------- 2. place defenses: menu key, then a mount ----------
  await page.keyboard.press('$');                                // debug money key: enough for both starter stacks
  const plan = [['probe', 'ext', 0], ['monitor', 'ext', 1], ['auditor', 'ext', 4], ['killswitch', 'ext', 5],
    ['probe', 'int', 0], ['monitor', 'int', 1], ['killswitch', 'int', 5]];
  for (const [id, lane, slot] of plan) {
    await click('menu-item', { id });
    const armed = await S(H => H.view.placing);
    await click('mount', { lane, slot });
    const layer = await page.evaluate(([lane, slot]) => window.__handoff.st.lanes[lane].slots[slot].layer, [lane, slot]);
    log(layer === id, `place ${id} on ${lane} mount ${slot + 1}`, `armed ${armed}`);
  }
  await shot('placed');
  // shift-click keeps the card armed: two Trusted Monitors in a row would need money; check the hover card instead
  await page.mouse.move(...Object.values(await where('menu-item', { id: 'auditor' })));
  await wait(150);
  await shot('hover-auditor');

  // ---------- 3. upgrade: click a mount to select it, then the UPGRADE key; then shift-click another ----------
  await page.evaluate(() => window.__handoff.money(2));          // the money key ($) would do the same
  await click('mount', { lane: 'ext', slot: 1 });
  log(await S(H => H.view.selected?.lane === 'ext' && H.view.selected?.slot === 1), 'select EXT mount 2 (upgrade panel)');
  await page.mouse.move(5, 650);
  await wait(200);
  await shot('upgrade-panel');
  const before = await S((H, st) => st.lanes.ext.slots[1].level);
  await click('upg-btn', { action: 'upgrade' });
  const after = await S((H, st) => st.lanes.ext.slots[1].level);
  log(after === before + 1, 'UPGRADE key', `L${before} → L${after}`);
  await click('mount', { lane: 'ext', slot: 0 }, { shift: true });
  log(await S((H, st) => st.lanes.ext.slots[0].level === 2), 'shift-click upgrade on EXT mount 1');
  await page.mouse.move(5, 650);
  await shot('upgraded');

  // ---------- 4. buy a mount ----------
  const mounts = await S((H, st) => st.lanes.int.slots.length);
  await click('slot-buy', { lane: 'int' });
  log(await S((H, st) => st.lanes.int.slots.length) === mounts + 1, 'buy an INTERNAL mount', `${mounts} → ${mounts + 1}`);

  // ---------- 5. drag the compute split: Product|Capabilities seam left, then Capabilities|Safety seam left ----------
  const s0 = await S((H, st) => ({ ...st.split }));
  for (const [handle, dx] of [[0, -50], [1, -40]]) {
    const p = await where('split', { handle });
    if (!p) { log(false, `split handle ${handle} found`); continue; }
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(p.x + dx * i / 8, p.y); await wait(16); }
    await page.mouse.up();
  }
  const s1 = await S((H, st) => ({ ...st.split }));
  const f = s => `${s.product.toFixed(2)}/${s.capabilities.toFixed(2)}/${s.safety.toFixed(2)}`;
  log(s1.product < s0.product - 0.05 && s1.safety > s0.safety + 0.05, 'drag the compute split', `${f(s0)} → ${f(s1)}`);
  await wait(300);
  await shot('split');

  // ---------- 6. a choice: the next one that comes up (MIRA's letter is fired to make sure one does) ----------
  if (!(await S((H, st) => !!st.pendingChoice))) await S((H, st) => { H.Sim.fireEvent(st, 'mira_letter'); });
  await until((H, st) => !!st.pendingChoice, 5000);
  await page.evaluate(() => { window.__handoff.__lastChoice = window.__handoff.st.pendingChoice?.eventId; });
  await until(H => H.regions('choice').length > 0, 15000);
  await shot('choice');
  const answered = await answerChoice(0);
  log(answered && !/not answered/.test(answered), 'answer a choice in the codec', String(answered));

  // ---------- 7. research: close the upgrade panel (its × key), then the RESEARCH key in the lab panel, then a card ----------
  log(await click('upg-btn', { action: 'close' }) && await S(H => !H.view.selected), 'close the upgrade panel');
  await page.mouse.move(5, 650);
  await wait(100);
  const drew = await click('ctx-btn', { action: 'research' });
  log(drew && await until((H, st) => !!st.researchOffer, 3000), 'draw research from the context panel');
  await wait(300);
  await shot('research');
  const unlockedBefore = await S((H, st) => st.unlocked.length + Object.keys(st.upgrades).length);
  await page.locator('#research-cards .rc:not(.broke)').first().click();
  await until((H, st) => !st.researchOffer, 3000);
  const unlockedAfter = await S((H, st) => st.unlocked.length + Object.keys(st.upgrades).length);
  log(unlockedAfter === unlockedBefore + 1, 'keep a research card', `unlocks + techs ${unlockedBefore} → ${unlockedAfter}`);

  // ---------- 8. play a little in real time, answering choices as they come ----------
  for (let i = 0; i < 20; i++) {
    await wait(500);
    if (await S((H, st) => !!st.pendingChoice)) { await page.evaluate(() => { window.__handoff.__lastChoice = window.__handoff.st.pendingChoice.eventId; }); log(!!await answerChoice(1), 'answer a choice that came up'); }
    if (await S((H, st) => !!st.researchOffer)) await page.keyboard.press('1');
  }
  await shot('g1-playing');

  // ---------- 9. skip to G7 with the N key, then watch the volume ----------
  await page.mouse.move(600, 300);
  for (let i = 0; i < 6 && (await S((H, st) => st.gen)) < 7; i++) {
    await page.keyboard.press('n');
    await wait(400);
    if (await S((H, st) => !!st.pendingChoice)) { await page.evaluate(() => { window.__handoff.__lastChoice = window.__handoff.st.pendingChoice.eventId; }); await answerChoice(0); }
    if (await S((H, st) => !!st.researchOffer)) await page.keyboard.press('1');
  }
  log(await S((H, st) => st.gen === 7), 'skip to G7 with N');
  const card = await page.evaluate(() => !document.getElementById('ov-model').hidden);
  await shot('g7-model-card');
  if (card) await page.locator('#mr').click();
  log(card && await until(() => document.getElementById('ov-model').hidden, 2000), 'NEW MODEL card shows, a click closes it');
  await page.keyboard.press('$'); await page.keyboard.press('$');
  // a deep stack at G7: buy mounts and place by clicking, like a player with money
  await page.keyboard.press('u');
  for (const [id, lane, slot] of [['classifier', 'ext', 2], ['untrusted', 'ext', 3], ['egress', 'int', 2], ['cot', 'int', 3], ['auditor', 'int', 4]]) {
    await click('menu-item', { id }); await click('mount', { lane, slot });
  }
  await page.mouse.move(600, 640);
  const perf = [];
  for (let i = 0; i < 12; i++) {
    await wait(500);
    if (await S((H, st) => !!st.pendingChoice)) { await page.evaluate(() => { window.__handoff.__lastChoice = window.__handoff.st.pendingChoice.eventId; }); await answerChoice(0); }
    if (await S((H, st) => !!st.researchOffer)) await page.keyboard.press('1');
    perf.push(await S(H => H.perf.draw));
    if (i === 5) await shot('g7-volume');
  }
  const chips = await S((H, st) => st.lanes.ext.tasks.length + st.lanes.int.tasks.length);
  const avg = perf.reduce((a, b) => a + b, 0) / perf.length;
  log(chips > 50, 'watch G7 at volume', `${chips} lines on the tracks, draw ${avg.toFixed(1)} ms/frame (sampled)`);
  await shot('g7-later');

  // ---------- 10. the end: N at G7 ships ASI → the scorecard → PLAY AGAIN ----------
  while (!(await S((H, st) => !!st.over))) { await page.keyboard.press('n'); await wait(200); }
  const shown = await until(() => !document.getElementById('ov-score').hidden, 5000);
  log(shown, 'scorecard shows', await S((H, st) => `${st.over.win ? 'win' : 'loss'} ${st.over.reason ?? ''}`));
  await wait(400);
  await shot('scorecard');
  await page.locator('#sc-again').click();
  log(await until(H => !H.st && !document.getElementById('ov-start').hidden, 3000), 'PLAY AGAIN returns to the start screen');
  await wait(300);
  await shot('again');

  // ---------- 11. a plain page (no ?debug=1): no hooks, no truth; start, place by layout coordinates, 20 s at ×3 ----------
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?seed=${seed}`, { waitUntil: 'load' });
  await wait(1500);
  log(await page.evaluate(() => window.__handoff === undefined), 'plain page has no debug hooks');
  await page.locator('#difficulty .ch', { hasText: 'Easy' }).click();
  await wait(300);
  for (const [key, mount] of [[[856, 544], [72, 121]], [[896, 544], [72, 163]], [[856, 544], [488, 121]]]) {
    await page.mouse.click(...key); await wait(100); await page.mouse.click(...mount); await wait(100);
  }
  await page.mouse.move(600, 640);
  await page.keyboard.press('f');
  await wait(20000);
  await shot('plain-easy-x3');
} catch (err) {
  log(false, 'playthrough crashed', err.message);
}

for (const e of errors) console.log('page error: ' + e.split('\n').slice(0, 3).join(' | '));
console.log(`\n${failed ? failed + ' failed' : 'all steps ok'} · ${errors.length} page errors · PNGs in ${path.resolve(out)}`);
await browser.close();
server.close();
process.exit(failed || errors.length ? 1 : 0);
