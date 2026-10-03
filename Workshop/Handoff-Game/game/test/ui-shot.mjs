// ===== UI screenshot harness: serve the game, open ?debug=1&seed=3, set up each scenario, save PNGs =====
// usage:  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 node test/ui-shot.mjs <outdir> [scenario ...]
//         node test/ui-shot.mjs                 (lists the scenarios)
// Every scenario is a fresh page load. Set-ups go through window.__handoff (src/main.js, ?debug=1 only) and the sim's own
// actions, never through timing: the sim is held and the animation clock frozen at t = 100 before anything happens.
// Per scenario and size (a fresh page each, so both sizes show the same moment): <name>-1200.png (1200×660, the board 1:1)
// and <name>-1600.png (1600×900, letterboxed), console errors, ms per frame (render only, frozen clock).
// A scenario with `live` lets the real loop run that many seconds with the sim moving and reports draw p50/p95 and fps.
// Exit code 1 if any page logged an error.
// The env vars matter: headless Chromium can't reach Google Fonts through the proxy, so font requests are re-fetched by
// Node (which trusts the proxy CA) and handed back to the page.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT = process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUERY = '?debug=1&seed=3';
const SIZES = [[1200, 660, 1], [1600, 900, 1]];          // width, height, device pixel ratio

// =================== scenarios ===================
// setup(H) runs in the page (H = window.__handoff; it is sent as source, so no Node closures) and may return a note. interact(page, H) runs in Node after setup
// and again after the resize (mouse work). settle = seconds of frozen-clock animation before each shot.

const SCENARIOS = {
  start: {
    about: 'start screen, no game yet',
  },
  starter: {
    about: 'starter defenses on both tracks, 12 s in',
    setup: H => { H.newGame('medium'); H.placeStarter(); return H.advance(12, { choose: 1 }); },
  },
  'g3-surge': {
    about: 'G3, busy tracks, Demand Surge banner on EXTERNAL',
    setup: H => {
      H.newGame('medium'); H.toGen(3); H.unlockAll();
      H.build('ext', ['classifier', 'probe', 'monitor', 'untrusted', 'paraphraser', 'defer', 'killswitch']);
      H.build('int', ['cot', 'probe', 'untrusted', 'egress', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.Sim.fireEvent(H.st, 'surge');
      return H.advance(8, { choose: 0 });
    },
  },
  'g3-incident': {
    about: 'G3, busy tracks under a Demand Surge, the moment an attack lands (codec incident, trace, LANDED)',
    settle: 0.3,
    setup: H => {
      H.newGame('medium'); H.toGen(3); H.unlockAll(); H.labMode();
      H.build('ext', ['classifier', 'probe', 'monitor', null, 'paraphraser', 'defer', 'killswitch']);
      H.build('int', ['cot', 'probe', 'untrusted', 'egress', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.Sim.fireEvent(H.st, 'surge');
      H.advance(4, { choose: 0 }); H.frame(); H.settle(6.5, 4);
      const e = H.advanceUntil('landed', 60, { choose: 0 });
      return e ? `landed: ${e.label} at t=${H.st.t.toFixed(1)}` : 'NO landed fx in 60 s';
    },
  },
  'g7-dense': {
    about: 'G7, ten mounts a side, top volume',
    setup: H => {
      H.newGame('medium'); H.toGen(7); H.unlockAll(); H.labMode();
      H.build('ext', ['classifier', 'probe', 'monitor', 'untrusted', 'ratelimit', 'paraphraser', 'canary', 'redteam', 'defer', 'killswitch']);
      H.build('int', ['redteam', 'cot', 'probe', 'untrusted', 'egress', 'honeypot', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      return H.advance(6, { choose: 0 });
    },
  },
  choice: {
    about: 'a codec call waiting on a choice (MIRA Open Letter): the question, then the tall box with the choices',
    settle: 4,
    setup: H => {
      H.newGame('medium'); H.placeStarter(); H.advance(5, { choose: 0 });
      if (H.st.pendingChoice) H.act.choose(0);
      H.Sim.fireEvent(H.st, 'mira_letter');
      return H.st.pendingChoice?.eventId;
    },
  },
  research: {
    about: 'research draw open',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(3, { choose: 0 }); H.money(2); H.act.drawResearch(); return H.st.researchOffer?.map(o => o.id).join(', '); },
  },
  hover: {
    about: 'hover card over the Trusted Monitor key',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(6, { choose: 0 }); H.frame(); },
    interact: async (page, H) => hoverRegion(page, 'menu-item', { id: 'monitor' }),
  },
  upgrade: {
    about: 'upgrade panel open on EXTERNAL mount 2 (Trusted Monitor)',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(6, { choose: 0 }); H.upgradeTo('ext', 1, 2); H.frame(); },
    interact: async (page, H) => {
      const ok = await clickRegion(page, 'mount', { lane: 'ext', slot: 1 });
      await page.mouse.move(...await H.client(620, 640));      // off the mount, or its hover card wins the panel
      if (!ok) await page.evaluate(() => { window.__handoff.view.selected = { lane: 'ext', slot: 1 }; });
      return ok ? null : 'mount region not found: set view.selected directly';
    },
  },
  'ext-incident': {
    about: 'EXTERNAL INCIDENT: a jailbreak lands on an undefended EXTERNAL track',
    settle: 0.3,
    setup: H => {
      H.newGame('medium'); H.toGen(2); H.labMode();
      H.build('int', ['probe', 'monitor', null, null, 'auditor', 'killswitch']);
      H.Sim.fireEvent(H.st, 'jailbreak_wave');
      H.frame();                                               // modules read the old fx before the incident
      H.settle(6.5, 4);                                        // the clock moves on: the G2 model card closes, as in real play
      const e = H.advanceUntil('landed', 60, { choose: 0 });
      return e ? `landed: ${e.label} at t=${H.st.t.toFixed(1)}` : 'NO landed fx in 60 s';
    },
  },
  'int-anomaly': {
    about: 'INTERNAL ANOMALY: an exfiltration foiled or contained, no detectors',
    settle: 0.3,
    setup: H => {
      H.newGame('medium'); H.toGen(5); H.unlockAll(); H.labMode();
      H.build('int', [null, null, 'leastpriv', 'sandbox']);
      H.upgradeTo('int', 2, 5); H.upgradeTo('int', 3, 5);
      H.frame(); H.settle(6.5, 4);
      H.forceAttack('int', 'exfil', 3);
      const e = H.advanceUntil(['foiled', 'contained'], 30, { choose: 0 });
      return e ? `${e.type}${e.how ? ` (${e.how})` : ''} at t=${H.st.t.toFixed(1)}` : 'NO foiled/contained fx in 30 s';
    },
  },
  // ---------- the menu, the hover card and the upgrade panel ----------
  locked: {
    about: 'hover a locked key (Untrusted Monitor): silhouette and unlock hint',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(4, { choose: 0 }); H.frame(); },
    interact: async (page, H) => hoverRegion(page, 'menu-item', { id: 'untrusted' }),
  },
  placing: {
    about: 'Probe armed, pointer over the INTERNAL body: valid mounts glow, the ghost follows',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(4, { choose: 0 }); H.view.placing = 'probe'; H.frame(); },
    interact: async (page, H) => { await page.mouse.move(...await H.client(560, 300)); return null; },
  },
  tab: {
    about: 'hover the RESPOND tab: role card, other roles dimmed',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(4, { choose: 0 }); H.frame(); },
    interact: async (page, H) => hoverRegion(page, 'menu-tab', { role: 'responder' }),
  },
  auditor: {
    about: 'upgrade panel on the INTERNAL auditor (bay desks, bay rule)',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(6, { choose: 0 }); H.view.selected = { lane: 'int', slot: 4 }; H.frame(); },
  },
  capstone: {
    about: 'upgrade panel: an L4 Probe (the capstone is next), can\'t afford it',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.upgradeTo('ext', 0, 4); H.st.money = 50; H.advance(3, { choose: 0 }); H.view.selected = { lane: 'ext', slot: 0 }; H.frame(); },
  },
  maxed: {
    about: 'upgrade panel: an L5 Kill Switch',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.upgradeTo('ext', 5, 5); H.advance(3, { choose: 0 }); H.view.selected = { lane: 'ext', slot: 5 }; H.frame(); },
  },
  measured: {
    about: 'G7: hover the INTERNAL Untrusted Monitor under a Red Team (measured bracket)',
    setup: H => {
      H.newGame('medium'); H.toGen(7); H.unlockAll(); H.labMode();
      H.build('ext', ['classifier', 'probe', 'monitor', 'untrusted', 'ratelimit', 'paraphraser', 'canary', 'redteam', 'defer', 'killswitch']);
      H.build('int', ['redteam', 'cot', 'probe', 'untrusted', 'egress', 'honeypot', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.advance(20, { choose: 0 }); H.frame(); H.settle(6.5, 4);
    },
    interact: async (page, H) => hoverRegion(page, 'mount', { lane: 'int', slot: 3 }),
  },
  redteam: {
    about: 'G7: hover the INTERNAL Red Team at L5 (Control Eval, lane-wide)',
    setup: H => {
      H.newGame('medium'); H.toGen(7); H.unlockAll(); H.labMode();
      H.build('int', ['redteam', 'cot', 'probe', 'untrusted', 'egress', 'honeypot', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.upgradeTo('int', 0, 5);
      H.advance(20, { choose: 0 }); H.frame(); H.settle(6.5, 4);
    },
    interact: async (page, H) => hoverRegion(page, 'mount', { lane: 'int', slot: 0 }),
  },
  lab: {
    about: 'Interp Lab on the lab site, selected; RSP and two techs taken',
    setup: H => {
      H.newGame('medium'); H.placeStarter(); H.unlockAll(); H.build('global', ['interp']);
      H.st.upgrades.rsp = 1; H.st.upgrades.distillation = 1; H.st.upgrades.alignment_training = 2;
      H.advance(4, { choose: 0 }); H.view.selected = { lane: 'global', slot: 0 }; H.frame();
    },
  },
  ratelimit: {
    about: 'G3, everything unlocked: hover the Rate Limiter key',
    setup: H => { H.newGame('medium'); H.toGen(3); H.unlockAll(); H.money(3); H.frame(); H.settle(6.5, 4); },
    interact: async (page, H) => hoverRegion(page, 'menu-item', { id: 'ratelimit' }),
  },

  // ---------- overlays ----------
  model: {
    about: 'NEW MODEL TRAINED card (G3), the outgoing model\'s dossier partly found',
    settle: 3.5,
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(5, { choose: 0 }); H.st.dossier.evidence = 30; H.advance(0.1, { choose: 0 }); H.toGen(2); H.frame(); H.toGen(3); return H.summary(); },
  },
  'model-g6': {
    about: 'NEW MODEL TRAINED card (G6): the forehead eye',
    settle: 5,
    setup: H => { H.newGame('medium'); H.toGen(5); H.st.dossier.evidence = 50; H.advance(0.1, { choose: 0 }); H.frame(); H.toGen(6); return H.summary(); },
  },
  pause: {
    about: 'paused: the plate between the tracks',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(6, { choose: 0 }); H.view.paused = true; },
  },
  rsp: {
    about: 'RSP prompt over the ops log (estimate past the threshold)',
    setup: H => { H.newGame('medium'); H.placeStarter(); H.advance(6, { choose: 0 }); H.st.upgrades.rsp = 1; H.st.m = 0.7; H.advance(0.2, { choose: 0 }); return JSON.stringify(H.st.rsp); },
  },
  'research-broke': {
    about: 'research draw #3 with no money: the priced card refuses',
    setup: H => {
      H.newGame('medium'); H.placeStarter(); H.advance(3, { choose: 0 });
      for (const m of [6, 6]) { H.money(m); H.act.drawResearch(); H.act.pickResearch(0); }
      H.money(8); H.act.drawResearch(); H.st.money = 100;
      return H.st.researchOffer?.map(o => o.id + ':' + o.price).join(', ');
    },
  },
  'score-rival': {
    about: 'scorecard: Prometheus shipped first (Second Place)',
    settle: 2.5,
    setup: H => {
      H.newGame('medium'); H.placeStarter();
      for (let i = 0; i < 3; i++) { H.advance(10, { choose: 0 }); H.Sim.debugSkipGen(H.st); }
      H.st.rival = 7; H.advance(0.1, { choose: 0 }); if (H.st.rivalShipped) H.st.rivalShipped.remaining = 0.05; H.advance(0.3, { choose: 0 });
      return `over=${JSON.stringify(H.st.over)}`;
    },
  },
  theme98: {
    about: "the Codec '98 palette (ui/theme.js setTheme), G4 with the rival's grace countdown",
    settle: 2.5,
    setup: async H => {
      (await import('/src/ui/theme.js')).setTheme('codec98');
      H.newGame('medium'); H.placeStarter();
      for (let i = 0; i < 3; i++) { H.advance(10, { choose: 0 }); H.Sim.debugSkipGen(H.st); }
      H.st.rival = 7; H.advance(0.1, { choose: 0 }); H.frame(); H.settle(6.5, 4);
    },
  },
  'perf-g7': {
    about: 'G7 dense at 1920×1080@2 with the sim and the clock running: draw ms p50/p95 and fps (the CRT/high-DPR case)',
    sizes: [[1920, 1080, 2]],
    live: 4,
    setup: H => {
      H.newGame('medium'); H.toGen(7); H.unlockAll(); H.labMode();
      H.build('ext', ['classifier', 'probe', 'monitor', 'untrusted', 'ratelimit', 'paraphraser', 'canary', 'redteam', 'defer', 'killswitch']);
      H.build('int', ['redteam', 'cot', 'probe', 'untrusted', 'egress', 'honeypot', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.advance(6, { choose: 0 }); H.frame(); H.settle(6.5, 4);
    },
  },
  scorecard: {
    about: 'the end-of-run scorecard',
    settle: 2.5,
    setup: H => {
      H.newGame('medium'); H.placeStarter();
      for (let i = 0; i < 12 && !H.st.over; i++) { H.advance(10, { choose: 0 }); H.Sim.debugSkipGen(H.st); }
      H.finish();
      return `over=${!!H.st.over} G${H.st.gen}`;
    },
  },
};

// =================== page helpers ===================

async function regionCentre(page, kind, data) {
  return page.evaluate(([kind, data]) => {
    const H = window.__handoff, want = JSON.stringify(data);
    const r = H.regions(kind).find(r => JSON.stringify(r.data) === want);
    return r ? H.client(r.x + r.w / 2, r.y + r.h / 2) : null;
  }, [kind, data]);
}
async function hoverRegion(page, kind, data) {
  const p = await regionCentre(page, kind, data);
  if (!p) return `${kind} ${JSON.stringify(data)} not found`;
  await page.mouse.move(p.x, p.y);
  return null;
}
async function clickRegion(page, kind, data) {
  const p = await regionCentre(page, kind, data);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(); await page.mouse.up();
  return true;
}
// H proxy for interact(): H.client(x, y) → [x, y] in client px
const nodeH = page => ({
  client: async (x, y) => { const p = await page.evaluate(([x, y]) => window.__handoff.client(x, y), [x, y]); return [p.x, p.y]; },
});

// fonts: re-fetch through Node (see the header)
async function routeFonts(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    try {
      const x = await fetch(r.request().url(), { headers: { 'user-agent': r.request().headers()['user-agent'] } });
      await r.fulfill({ status: x.status, headers: { 'content-type': x.headers.get('content-type') || '', 'access-control-allow-origin': '*' },
        body: Buffer.from(await x.arrayBuffer()) });
    } catch (err) { await r.abort(); }
  });
}

// =================== static server (port 0 = any free port) ===================

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

// =================== one scenario ===================

async function run(browser, base, out, name) {
  const scn = SCENARIOS[name], errors = [], warnings = [], notes = [], ms = [];
  for (const [i, [w, h, dpr]] of (scn.sizes ?? SIZES).entries()) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e.stack || e)));
    await routeFonts(page);
    await page.goto(base + '/index.html' + QUERY, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__handoff, null, { timeout: 10000 });
    const fonts = await page.evaluate(() => window.__handoff.fontsReady);
    if (!fonts && i === 0) notes.push('web fonts NOT loaded (fallbacks)');
    await page.evaluate(() => { const H = window.__handoff; H.hold(true); H.clock(100); });

    if (scn.setup) {
      const t0 = Date.now();
      const r = await page.evaluate(`(${scn.setup})(window.__handoff)`);
      if (i === 0) notes.push(`setup ${Date.now() - t0} ms` + (r != null ? `: ${typeof r === 'object' ? JSON.stringify(r) : r}` : ''));
    }
    if (scn.interact) {
      await page.evaluate(() => window.__handoff.settle(0.1));    // fresh hit regions
      const n = await scn.interact(page, nodeH(page));
      if (n && i === 0) notes.push(n);
    }
    await page.evaluate(s => window.__handoff.settle(s), scn.settle ?? 1.5);
    if (scn.live) notes.push(`${w}×${h}@${dpr} live: ${await live(page, scn.live)}`);
    await page.screenshot({ path: path.join(out, `${name}-${w}.png`) });
    if (!scn.live) ms.push(await page.evaluate(() => window.__handoff.bench(30)));
    await page.close();
  }
  return { name, errors, warnings, notes, ms };
}

// let the real loop run for `secs` with the sim and the clock moving; sample main.js perf.draw every animation frame
async function live(page, secs) {
  return page.evaluate(secs => new Promise(done => {
    const H = window.__handoff, draws = [], t0 = performance.now();
    H.hold(false); H.clock(null);
    const tick = () => {
      draws.push(H.perf.draw);
      if (performance.now() - t0 < secs * 1000) return requestAnimationFrame(tick);
      H.hold(true);
      const d = draws.slice(2).sort((a, b) => a - b), q = f => d[Math.floor(f * (d.length - 1))].toFixed(1);
      done(`draw p50 ${q(0.5)} ms · p95 ${q(0.95)} ms · ${(draws.length / secs).toFixed(0)} fps`);
    };
    requestAnimationFrame(tick);
  }), secs);
}

// =================== main ===================

const [out, ...want] = process.argv.slice(2);
if (!out) {
  console.log('usage: node test/ui-shot.mjs <outdir> [scenario ...]\n\nscenarios:');
  for (const [n, s] of Object.entries(SCENARIOS)) console.log(`  ${n.padEnd(14)} ${s.about}`);
  process.exit(0);
}
const names = want.length ? want : Object.keys(SCENARIOS);
const unknown = names.filter(n => !SCENARIOS[n]);
if (unknown.length) { console.error(`unknown scenario(s): ${unknown.join(', ')}`); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const { chromium } = await import(PLAYWRIGHT);
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0;
try {
  for (const name of names) {
    let r;
    try { r = await run(browser, base, out, name); }
    catch (err) { r = { name, errors: [`harness: ${err.message}`], warnings: [], notes: [], ms: [] }; }
    const status = r.errors.length ? 'ERR' : 'ok ';
    console.log(`${status} ${name.padEnd(13)} ms/frame ${r.ms.map(m => m.toFixed(2)).join(' / ') || '-'}   ${r.notes.join(' · ')}`);
    for (const e of r.errors) console.log(`      error: ${e.split('\n').slice(0, 4).join('\n             ')}`);
    for (const w of r.warnings) console.log(`      warn:  ${w}`);
    if (r.errors.length) failed++;
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${names.length - failed}/${names.length} clean · PNGs in ${path.resolve(out)}`);
process.exit(failed ? 1 : 0);
