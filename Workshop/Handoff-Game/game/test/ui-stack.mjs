// ===== UI stack check: the stack a player built never seems to vanish, and is never sold by accident =====
// usage:  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 node test/ui-stack.mjs [outdir] [seed]
// Avi (v4): "when an incident happens it can delete the safety stack of probes and monitors and you have to rebuy".
// The sim never cleared a slot: the UI moved the track to the lane in trouble (a thinner stack, the rail never named
// it), and a right-click sold a filled mount even while an element was being placed. Checks:
//   1. incidents and glitches on lanes out of view (G6, every lane open) leave view.focus alone; their tabs alert and
//      the prompt names them; the rail's mounts still belong to the lanes the player picked
//   2. right-click on a filled mount (and the lab site) while placing or with a panel open cancels and sells nothing;
//      right after a placement it sells nothing; with nothing armed one right-click only arms SELL?, a second sells
//      (real mouse and keys)
//   3. a G1 → G4 run with forced incidents on every lane: no slot loses its element without a 'sell' fx, and the stack
//      on show never changes without one (no input at all, so the tracks must never move)
// ?debug=1 is used for window.__handoff (set-ups, state reads). Prints "[ui-stack] ok|FAIL ..." per check; PNGs only
// when an outdir is given. Exit code 1 on any failed check or page error.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT = process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out = null, seed = '7'] = process.argv.slice(2);
if (out) fs.mkdirSync(out, { recursive: true });

// =================== static server and fonts (same as test/ui-play.mjs) ===================

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
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch();
let page = null;
const errors = [];

async function openPage(url) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 1200, height: 660 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    try {
      const x = await fetch(r.request().url(), { headers: { 'user-agent': r.request().headers()['user-agent'] } });
      await r.fulfill({ status: x.status, headers: { 'content-type': x.headers.get('content-type') || '', 'access-control-allow-origin': '*' },
        body: Buffer.from(await x.arrayBuffer()) });
    } catch { await r.abort(); }
  });
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__handoff, null, { timeout: 10000 });
}

// =================== helpers ===================

let failed = 0, n = 0;
const T0 = Date.now();
const log = (ok, what, note = '') => { console.log(`[ui-stack] ${ok ? 'ok  ' : 'FAIL'} ${what}${note ? '   ' + note : ''}`); if (!ok) failed++; };
const info = msg => console.log(`[ui-stack]      ${msg}`);
const S = fn => page.evaluate(`(${fn})(window.__handoff, window.__handoff.st)`);      // read (or set up) state in the page
const wait = ms => page.waitForTimeout(ms);
const shot = async name => { if (out) await page.screenshot({ path: path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
const away = () => page.mouse.move(1195, 655);

// centre of the newest hit region of this kind whose data includes `data`, in client px (null if none)
async function where(kind, data = {}) {
  return page.evaluate(([kind, data]) => {
    const H = window.__handoff;
    const r = H.regions(kind).reverse().find(r => Object.entries(data).every(([k, v]) => r.data?.[k] === v));
    return r ? H.client(r.x + r.w / 2, r.y + r.h / 2) : null;
  }, [kind, data]);
}
async function click(kind, data = {}, button = 'left') {
  const p = await where(kind, data);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await wait(60);
  await page.mouse.click(p.x, p.y, { button });
  await wait(80);
  return true;
}
const layers = lane => S(`(H, st) => st.lanes['${lane}'].slots.map(s => s.layer)`);
const sells = () => S((H, st) => st.fx.filter(e => e.type === 'sell').length);

// a fresh game in play, no tutorial; the real loop keeps drawing but the sim only moves when a check steps it
async function freshGame() {
  await openPage(`/index.html?debug=1&seed=${seed}`);
  await S(H => { H.newGame('medium', { tutorial: false }); H.deploy(); H.hold(true); H.labMode(); });
  await wait(300);
}

try {
  // =================== 1. a lane in trouble out of view never takes the track ===================
  await freshGame();
  await S(H => {
    H.toGen(6);
    for (const id of H.Rules.laneIds(H.st)) if (!H.st.lanes[id].open) H.Sim.openLane(H.st, id);
    H.build('ext', ['probe', 'monitor', 'probe', 'monitor', 'auditor']);
    H.build('int', ['probe', 'monitor', 'probe', 'monitor', 'auditor']);
    H.frame();
  });
  await wait(200);
  await click('lane-tab', { id: 'ext' }); await click('lane-tab', { id: 'int' }); await away();     // the player looks at their two built lanes
  log(await S(H => H.view.focus.ext === 'ext' && H.view.focus.int === 'int'), 'set-up: tab clicks show CONSUMER and R&D', await S(H => JSON.stringify(H.view.focus)));
  const r1 = await S((H, st) => {
    const out = { moves: [], red: {}, toasts: [], mountLanes: [] };
    for (let k = 0; k < 6; k++) { H.forceAttack('ext2', 'leak'); H.forceAttack('ext3', 'harmful'); H.forceAttack('int2', 'sabotage'); }
    for (let i = 0; i < 240; i++) {                                    // 60 s of sim, a frame every 0.25 s (the view's clock
      H.advance(0.25, { choose: 0 }); H.clock(1000 + st.t); H.frame();  // keeps pace, as at 1×: the tab clicks are long past)
      for (const id of ['ext2', 'ext3', 'int2']) if (H.Rules.laneStatus(st, id).lamp === 'red') out.red[id] = (out.red[id] || 0) + 1;
      const f = H.view.focus;
      if (f.ext !== 'ext' || f.int !== 'int') out.moves.push(`t ${st.t.toFixed(1)}: ${f.ext}/${f.int}`);
      if (Object.keys(out.red).length && !out.mountLanes.length) out.mountLanes = [...new Set(H.regions('mount').map(r => r.data.lane))];
    }
    out.toasts = H.view.toasts.filter(t => t.info).map(t => t.text);
    return out;
  });
  info(`red frames out of view: ${JSON.stringify(r1.red)} · alerts: ${r1.toasts.join(' | ') || 'none'}`);
  log(r1.red.ext2 > 0 || r1.red.ext3 > 0, 'an incident lands on an EXTERNAL lane out of view (the check is live)');
  log(r1.red.int2 > 0, 'a glitch shows on CYBER out of view (the check is live)');
  log(!r1.moves.length, 'incidents and glitches out of view: view.focus stays on CONSUMER / R&D', r1.moves.slice(0, 3).join(' · '));
  log(r1.mountLanes.length > 0 && r1.mountLanes.every(l => l === 'ext' || l === 'int'), 'mid-incident, every mount on screen is CONSUMER\'s or R&D\'s', r1.mountLanes.join(' '));
  log(r1.toasts.some(s => /ENTERPRISE|GOV/.test(s)) && r1.toasts.some(s => /CYBER/.test(s)), 'the prompt names the lane in trouble and the key to look');
  await shot('incident-out-of-view');
  await click('lane-tab', { id: 'ext2' }); await away();
  log(await S(H => H.view.focus.ext === 'ext2'), 'a tab click still shows the lane in trouble');
  await shot('enterprise-by-click');

  // =================== 2. right-click: cancel first, sell only when nothing is armed ===================
  await freshGame();
  await S(H => { H.unlockAll(); H.build('ext', ['probe', 'monitor', 'probe']); H.build('global', ['interp']); H.frame(); });
  await wait(200);
  const before = await layers('ext'), money0 = await S((H, st) => Math.round(st.money)), sold0 = await sells();
  await page.keyboard.press('1');
  const armed = await S(H => H.view.placing);
  log(!!armed, 'key 1 arms an element', armed);
  await click('mount', { lane: 'ext', slot: 1 }, 'right'); await away();
  log(JSON.stringify(await layers('ext')) === JSON.stringify(before) && await sells() === sold0, 'right-click on a filled mount while placing: nothing sold', JSON.stringify(await layers('ext')));
  log(await S(H => H.view.placing === null), 'that right-click cancelled the placing');
  await click('mount', { lane: 'ext', slot: 0 }); await away();
  log(await S(H => H.view.selected?.lane === 'ext' && H.view.selected?.slot === 0), 'a click on mount 1 opens its panel');
  await click('mount', { lane: 'ext', slot: 1 }, 'right'); await away();
  log(JSON.stringify(await layers('ext')) === JSON.stringify(before) && await sells() === sold0, 'right-click on another filled mount with a panel open: nothing sold');
  log(await S(H => H.view.selected === null), 'that right-click closed the panel');
  await page.keyboard.press('1');
  await click('lab-site', {}, 'right'); await away();
  log(await S((H, st) => st.global.slots[0].layer === 'interp') && await sells() === sold0, 'right-click on the lab site while placing: the Interp Lab stays');
  log(await S((H, st) => Math.round(st.money)) === money0, 'money unchanged by the cancelling right-clicks');
  await click('mount', { lane: 'ext', slot: 1 }, 'right');
  log(JSON.stringify(await layers('ext')) === JSON.stringify(before) && await sells() === sold0, 'one right-click with nothing armed: SELL? armed, nothing sold');
  log(await S(H => H.view.sellArm?.lane === 'ext' && H.view.sellArm?.slot === 1) && await S(H => H.view.toasts.some(t => /^SELL /.test(t.text))),
    'the prompt says how to sell', await S(H => H.view.toasts.at(-1)?.text));
  await shot('sell-armed');
  await click('mount', { lane: 'ext', slot: 1 }, 'right'); await away();
  const after = await layers('ext');
  log(after[1] === null && await sells() === sold0 + 1, 'a second right-click on the same mount: sells, as the controls say', JSON.stringify(after));
  await click('mount', { lane: 'ext', slot: 2 }, 'right'); await wait(1700);
  await click('mount', { lane: 'ext', slot: 2 }, 'right'); await away();
  log((await layers('ext'))[2] === 'probe' && await sells() === sold0 + 1, 'two right-clicks 1.7 s apart: nothing sold (the arm lapses)');
  await S(H => { H.view.sellArm = null; H.money(3); });
  const free = await S((H, st) => st.lanes.ext.slots.findIndex(s => !s.layer));
  await page.keyboard.press('1');
  await click('mount', { lane: 'ext', slot: free });
  const placed = await S(`(H, st) => st.lanes.ext.slots[${free}].layer`);
  await click('mount', { lane: 'ext', slot: free }, 'right'); await away();
  log(!!placed && await S(`(H, st) => st.lanes.ext.slots[${free}].layer`) === placed && await sells() === sold0 + 1,
    'place, then right-click to deselect (an RTS habit): the new element stays', `${placed} on mount ${free + 1}`);
  await page.keyboard.press('Escape');
  await click('lab-site', {}, 'right'); await click('lab-site', {}, 'right'); await away();
  log(await S((H, st) => !st.global.slots[0].layer) && await sells() === sold0 + 2, 'two right-clicks on the lab site: the Interp Lab is sold');
  await shot('right-click');

  // =================== 3. G1 → G4 with incidents: nothing vanishes without a sale ===================
  await freshGame();
  await S(H => { H.placeStarter(); H.frame(); });
  const r3 = await S((H, st) => {
    const out = { lost: [], shown: [], moves: [], red: 0, sells: 0, gens: [], incidents: 0 };
    const snap = () => Object.fromEntries(H.Rules.laneIds(st).map(id => [id, st.lanes[id].slots.map(s => s.layer)]));
    const shown = () => ({ ext: H.view.focus.ext, int: H.view.focus.int });
    let rng = 12345;
    const rnd = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
    let prev = snap(), seen = shown(), nextAttack = st.t + 5, genT0 = st.t;
    for (let i = 0; i < 20000 && st.gen <= 4 && !st.over; i++) {
      if (st.phase === 'report') { H.train(); continue; }
      if (st.phase === 'card') { out.gens.push(st.gen); H.deploy(); genT0 = st.t; H.clock(1000 + st.t); H.frame(); prev = snap(); continue; }
      if (st.phase !== 'play') break;
      if (st.gen === 4 && st.t - genT0 > 120) break;                   // enough of G4
      if (st.t - genT0 > 900) { H.endGeneration(); continue; }          // a stuck R&D bar: move on
      if (st.t >= nextAttack) {                                          // an incident somewhere, often out of view
        for (const side of ['ext', 'int']) {
          const ids = H.Rules.laneIds(st, side).filter(id => st.lanes[id].open);
          H.forceAttack(ids[Math.floor(rnd() * ids.length)], side === 'ext' ? (rnd() < 0.5 ? 'leak' : 'harmful') : 'sabotage', 2);
        }
        nextAttack = st.t + 5;
      }
      const fx0 = st.fxId;
      H.advance(0.5, { choose: 0 });
      H.clock(1000 + st.t); H.frame();                                   // the view's clock keeps pace with the sim, as at 1×
      const fresh = st.fx.slice(Math.max(0, st.fx.length - (st.fxId - fx0)));
      const sold = new Set(fresh.filter(e => e.type === 'sell').map(e => `${e.lane}/${e.slot}`));
      out.sells += sold.size;
      out.incidents += fresh.filter(e => e.type === 'landed' || e.type === 'glitch').length;
      const now = snap(), f = shown();
      for (const [id, slots] of Object.entries(prev)) slots.forEach((layer, k) => {
        if (layer && now[id]?.[k] !== layer && !sold.has(`${id}/${k}`)) out.lost.push(`G${st.gen} t ${st.t.toFixed(1)} ${id}/${k} ${layer} → ${now[id]?.[k]}`);
      });
      for (const side of ['ext', 'int']) {
        if (f[side] !== seen[side]) out.moves.push(`G${st.gen} t ${st.t.toFixed(1)} ${side}: ${seen[side]} → ${f[side]}`);
        const a = prev[seen[side]] || [], b = now[f[side]] || [];
        a.forEach((layer, k) => { if (layer && b[k] !== layer && !sold.has(`${f[side]}/${k}`)) out.shown.push(`G${st.gen} ${side} mount ${k + 1}: ${layer} → ${b[k]}`); });
      }
      for (const id of H.Rules.laneIds(st)) if (id !== f[st.lanes[id].side] && H.Rules.laneStatus(st, id).lamp === 'red') out.red++;
      prev = now; seen = f;
    }
    out.end = `G${st.gen} ${st.phase}${st.over ? ' over' : ''}`;
    return out;
  });
  info(`run: deployed ${r3.gens.map(g => 'G' + g).join(' ')} · ended ${r3.end} · ${r3.incidents} incidents/glitches · ${r3.red} red frames out of view · ${r3.sells} sales`);
  log(r3.gens.includes(4) && r3.incidents > 20 && r3.red > 0, 'G1 → G4 ran, with incidents on lanes out of view');
  log(!r3.lost.length, 'no slot lost its element without a sale', r3.lost.slice(0, 3).join(' · '));
  log(!r3.moves.length, 'no track moved on its own (contract arrivals, the deadline, catches, incidents)', r3.moves.slice(0, 3).join(' · '));
  log(!r3.shown.length, 'the stack on show never lost an element without a sale', r3.shown.slice(0, 3).join(' · '));
  await shot('g4');
} catch (err) {
  log(false, 'crashed', err.stack?.split('\n').slice(0, 3).join(' | '));
}

for (const e of errors) console.log('[ui-stack] page error: ' + e.split('\n').slice(0, 3).join(' | '));
console.log(`[ui-stack] ${failed ? failed + ' failed' : 'all checks ok'} · ${errors.length} page errors · ${((Date.now() - T0) / 1000).toFixed(0)} s`);
await browser.close();
server.close();
process.exit(failed || errors.length ? 1 : 0);
