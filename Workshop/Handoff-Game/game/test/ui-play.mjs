// ===== UI playthrough (DESIGN-v3 §7.5 UI tier): one Medium run in real time, driven by real clicks, drags and keys =====
// usage:  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 node test/ui-play.mjs <outdir> [seed]
// G1 card → DEPLOY → the 10-step tutorial by clicks (the codec hurried by clicks, as a reader would) → retrain card,
// a choice, upgrade, mount, split → report → training (a click bot) → G2 card → the codec's minimum dwell → RETRAIN
// → G3 card with a contract → OPEN LANE, fast-forward refused during the ramp → tabs → research → G4 EGRESS ANOMALY
// → scorecard → PLAY AGAIN. Then dev mode (#dev) and a plain page (no hooks). Asserted on the way (§3f, §3g, §3b):
//   1× at every card, report and alarm · no card closes untouched · the card chat completes with no input ·
//   every codec page stays up ≥ max(1.5 + n/15, pageHold) s · fast-forward refused while a new lane ramps.
// ?debug=1 is used only for window.__handoff (hit regions, state reads, a few set-ups named in the log). Every
// player action goes through the mouse or keyboard. Exit code 1 on any failed check or page error.

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
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch();
let page = null;
const errors = [];

async function openPage(url) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 1200, height: 660 } });      // a fresh context: fresh localStorage
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
}

// =================== helpers ===================

let failed = 0, n = 0;
const T0 = Date.now(), clock = () => `${((Date.now() - T0) / 1000).toFixed(0).padStart(4)}s`;
const log = (ok, what, note = '') => { console.log(`${clock()} ${ok ? 'ok  ' : 'FAIL'} ${what}${note ? '   ' + note : ''}`); if (!ok) failed++; };
const info = msg => console.log(`${clock()}      ${msg}`);
const S = fn => page.evaluate(`(${fn})(window.__handoff, window.__handoff.st)`);      // read (or set up) state in the page
const wait = ms => page.waitForTimeout(ms);
const shot = async name => page.screenshot({ path: path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`) });
const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.hidden; }, id);
const away = () => page.mouse.move(1195, 655);                     // park the pointer off every region (no hover cards)

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
// place an element: its menu key, then the mount
async function place(id, lane, slot) {
  await click('menu-item', { id });
  await click('mount', { lane, slot });
  await away();
  return page.evaluate(([lane, slot]) => window.__handoff.st.lanes[lane].slots[slot]?.layer, [lane, slot]);
}
// answer the open choice by clicking a row in the codec (the rows appear once the question is typed)
async function answerChoice(i = 0) {
  const id = await S((H, st) => st?.pendingChoice?.eventId ?? null);
  if (!id) return null;
  await page.evaluate(() => { window.__handoff.__lastChoice = window.__handoff.st.pendingChoice.eventId; });
  if (!(await until(H => H.regions('choice').length > 0, 15000))) { await click('codec-next'); await until(H => H.regions('choice').length > 0, 8000); }
  await wait(700);                                  // codec.js CHOICE_GRACE: a click in the first 0.6 s is ignored
  const ok = await click('choice', { i });
  const gone = await until((H, st) => !st.pendingChoice || st.pendingChoice.eventId !== H.__lastChoice, 3000);
  await away();
  return ok && gone ? id : `${id} (not answered)`;
}

// =================== the cards and alarms: 1× and no card closes untouched (§3f, §3g) ===================

const UNTOUCHED_MS = 5000;
const fast = () => S(H => H.view.fast);
// press F in play (×3): true if the game took it
async function goFast() { await page.keyboard.press('f'); await wait(100); return fast(); }

// a card that waits for a click: it is up, the speed is 1×, and it is still up after UNTOUCHED_MS with no input
async function holdsUntouched(what, phase, el) {
  const up = await until(`(H, st) => st.phase === '${phase}'`, 6000) && await until(`() => !document.getElementById('${el}').hidden`, 4000);
  log(up, `${what}: up`);
  log(!(await fast()), `${what}: 1× speed`);
  await away();
  await wait(UNTOUCHED_MS);
  log(await S(`(H, st) => st.phase === '${phase}'`) && await visible(el), `${what}: still up after ${UNTOUCHED_MS / 1000} s untouched`);
}

// the retrain card (§3f, §3g): the flash first, then the card; it waits; 1× while it is up
let retrainSeen = 0;
async function retrainCard(answer) {
  log(await until(() => !document.getElementById('ov-retrain').hidden, 3000), 'retrain card: up after the red-handed flash');
  if (!retrainSeen++) await shot('retrain-card');
  log(!(await fast()), 'retrain card: 1× speed');
  await wait(2500);
  log(await S((H, st) => !!st.pendingRetrain), 'retrain card: still waiting after 2.5 s untouched');
  await page.locator(answer ? '#rt-yes' : '#rt-no').click();
  log(await until((H, st) => !st.pendingRetrain, 2000), `retrain card: ${answer ? 'RETRAIN' : 'KEEP RUNNING'} closes it`);
  await away();
}
// whatever is waiting on the player in play: a choice or the retrain card (KEEP RUNNING)
async function tend() {
  if (await S((H, st) => !!st.pendingChoice)) info(`answered a choice: ${await answerChoice(0)}`);
  if (await S((H, st) => !!st.pendingRetrain)) await retrainCard(false);
}
// wait for pred while answering whatever comes up first (a retrain card or a choice halts the sim)
async function untilTending(pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await S(pred)) return true;
    await until(`(H, st) => (${pred})(H, st) || !!st.pendingRetrain || !!st.pendingChoice`, 5000);
    await tend();
  }
  return !!(await S(pred));
}

// =================== the codec: a page stays up ≥ max(1.5 + n/15, pageHold) s (§3g) ===================
// A recorder in the page logs every page shown: its start (the codec's own t0, after the ring), the time it left the
// screen, its characters, and whether it was a question. No clicks while it records.

const dwellSpec = n => Math.max(1.5 + n / 15, Math.min(6, Math.max(2.2, 1.2 + n / 28)));
async function recordCodec() {
  await page.evaluate(() => {
    const H = window.__handoff, rec = H.__codecRec = { pages: [], cur: null, on: true };
    const tick = ms => {
      const S = H.view.anim.codec, e = S?.cur, key = e ? `${e.id}|${e.page}` : null, now = ms / 1000;
      if (rec.cur && rec.cur.key !== key) {
        rec.cur.end = now; rec.cur.phase = H.st?.phase; rec.cur.requeued = !!S?.queue.some(q => q.id === rec.cur.id);
        rec.pages.push(rec.cur); rec.cur = null;
      }
      if (e && !rec.cur && e.pages) rec.cur = { key, id: e.id, page: e.page, t0: e.t0, seen: now, urgent: !!e.urgent,
        n: e.pages[e.page].reduce((a, s) => a + s.length, 0), choice: !!e.choice };
      if (rec.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function checkDwell() {
  const pages = await page.evaluate(() => { const r = window.__handoff.__codecRec; r.on = false; return r.pages; });
  // an incident or a choice cuts in: the cut page goes back to the queue (requeued) and restarts later
  const cut = pages.filter((p, i) => pages[i + 1]?.urgent && pages[i + 1].seen === p.end);
  const restarted = new Set(pages.filter((p, i) => p.page === 0 && pages.findIndex(q => q.id === p.id && q.page === 0) !== i).map(p => p.id));
  const timed = pages.filter(p => !p.choice && p.phase === 'play' && !p.requeued && !cut.includes(p) && !restarted.has(p.id));
  const short = timed.filter(p => p.end - p.t0 < dwellSpec(p.n) - 0.05);
  const worst = timed.reduce((w, p) => Math.min(w, (p.end - p.t0) / dwellSpec(p.n)), Infinity);
  log(timed.length >= 4 && !short.length, 'codec: every page stays up for the minimum dwell',
    `${timed.length} pages timed, shortest at ${worst.toFixed(2)}× its dwell` + (short.length ? ` · SHORT: ${short.map(p => `${p.n} ch ${(p.end - p.t0).toFixed(2)} s`).join(', ')}` : ''));
}

// =================== the training run: a click bot reads the run and clicks like a player (as test/train.mjs ui) ===================

async function trainBot(secs) {
  const t0 = Date.now();
  let clicks = 0;
  while (Date.now() - t0 < secs * 1000) {
    const r = await page.evaluate(async () => {
      const H = window.__handoff, h = H.training;
      if (!h) return { phase: 'gone' };
      const v = h._view, run = h._ctl.run;
      if (v.phase !== 'run') return { phase: v.phase };
      const { predict } = await import('/src/train/sim.js');
      const C = run.course, w = C.w, off = run.x - C.c(run.y), outBy = Math.abs(off) - w, bot = (window.__bot ||= { last: {} });
      const pred = predict(run, 1.0, 0.8), since = k => run.t - (bot.last[k] ?? -9);
      const at = (x, y) => H.client(300 + 600 * x, 30 + 600 * (y - run.y + 1 / 3));
      const ptAt = t => pred.pts.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), pred.pts[0]);
      const end = pred.pts[pred.pts.length - 1], stillOut = Math.abs(end.x - C.c(end.y)) > w;
      let ck = null;
      if (outBy > 0.8 * w && off * run.v >= 0 && run.charges >= 2 && since('bumper') > 0.6) ck = ['bumper', 'right', ptAt(0.15)];
      else if (outBy > 0.1 * w && stillOut && run.charges >= 1 && since('ramp') > 0.5) ck = ['ramp', 'left', ptAt(0.3)];
      else if (pred.exit && run.charges >= 1 && since('rail') > 0.35) ck = ['rail', 'left', { x: pred.exit.x + pred.exit.side * 0.045, y: pred.exit.y + 0.08 }];
      if (!ck) return { phase: 'run' };
      bot.last[ck[0]] = run.t;
      return { phase: 'run', click: { button: ck[1], ...at(ck[2].x, ck[2].y) } };
    });
    if (r.phase !== 'run') return clicks;
    if (r.click) { await page.mouse.click(r.click.x, r.click.y, { button: r.click.button }); clicks++; }
    await wait(50);
  }
  return clicks;
}
// report → TRAIN (a click) → the minigame on #train → D debug view → results → CONTINUE (a click) → the next card
async function training(tag) {
  await page.locator('#rp-train').click();
  log(await until((H, st) => st.phase === 'training' && !!H.training, 5000), `${tag}: TRAIN starts the minigame on #train`);
  log(await page.evaluate(() => document.getElementById('train').classList.contains('on')), `${tag}: the training canvas is shown`);
  await wait(800); await shot(`${tag}-countdown`);
  await S(H => H.training._ctl.skipCountdown());
  const clicks = await trainBot(5);
  await shot(`${tag}-midrun`);
  await page.keyboard.press('d'); await wait(300);
  log(await S(H => H.training?._view.debug === true), `${tag}: D shows the debug view`);
  await shot(`${tag}-debug`);
  await page.keyboard.press('d');
  await trainBot(3);
  await S(H => H.training?._view.phase === 'run' && H.training._ctl.advance(90));      // the rest of the run, at once
  log(await until(H => H.training?._view.phase === 'results', 10000), `${tag}: the results card`, `${clicks} bot clicks`);
  await wait(600); await shot(`${tag}-results`);
  const name = await S(H => H.training._ctl.run.config.name);
  const B = await S(H => H.training._view.cont);
  const p = await page.evaluate(([x, y]) => window.__handoff.client(x, y), [B.x + B.w / 2, B.y + B.h / 2]);
  await page.mouse.click(p.x, p.y);
  log(await until((H, st) => st.phase === 'card' && !H.training, 5000), `${tag}: CONTINUE → the next model's card`);
  const card = await page.evaluate(() => document.getElementById('ov-card').innerText);
  log(!!name && card.toLowerCase().includes(name.toLowerCase()), `${tag}: the training run carries the card's model name`, name);   // the card sets it in capitals
}

// =================== the tutorial (§3h): read the prompt, do it, by clicks ===================
// Each prompt must come up in order. The plate shows the next prompt once the codec has reached that step's lines, so
// the test clicks the codec while it waits (a click completes a page, a second advances), like a reader in a hurry.

async function prompt(i) {
  const want = await page.evaluate(async i => {
    const { TUTORIAL_STEPS } = await import('/src/config/content/v3-text.js');
    return TUTORIAL_STEPS[i].do.split('{price}')[0];
  }, i);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const now = await page.evaluate(() => {
      const el = document.getElementById('tut');
      if (!el || el.hidden) return { n: 0, text: '' };
      return { n: parseInt(el.querySelector('.tut-n').textContent.replace(/\D+/, ''), 10), done: el.classList.contains('done'), text: el.querySelector('.tut-do').textContent };
    });
    if (now.n === i + 1 && !now.done && now.text.startsWith(want)) return now.text;
    if (now.n > i + 1) return '(done before its prompt came up)';
    if (await S((H, st) => !!st.pendingChoice || !!st.pendingRetrain)) { await tend(); continue; }
    if (await S(H => { const S = H.view.anim.codec; return !!S?.cur || !!S?.queue.length; })) { await click('codec-next'); await click('codec-next'); }
    await away();
    await wait(400);
  }
  return null;
}
async function step(i, what, act) {
  const p = await prompt(i);
  log(!!p, `tutorial ${i + 1}/10: "${p ?? '(prompt never came up)'}"`);
  if (p && !p.startsWith('(') && act) log(await act(), `tutorial ${i + 1}/10: ${what}`);
}

// =================== the run ===================

try {
  await openPage(`/index.html?debug=1&seed=${seed}`);
  await page.waitForFunction(() => window.__handoff, null, { timeout: 10000 });
  log(await page.evaluate(() => window.__handoff.fontsReady), 'web fonts loaded');
  await wait(1500);
  await shot('start');

  // ---------- G1: the card ----------
  await page.locator('#difficulty .ch', { hasText: 'Medium' }).click();
  await page.keyboard.press('f');                                    // F does nothing at a card
  await holdsUntouched('G1 card', 'card', 'ov-card');
  await shot('card-g1');

  // ---------- G1: the tutorial, step by step ----------
  // step 1 is the card itself ("Read the card, then click DEPLOY"): the plate comes up on the board after it
  await page.locator('#cs-deploy').click();
  log(await until((H, st) => st.phase === 'play', 3000), 'tutorial 1/10: DEPLOY (a click)');
  log(await S(H => H.view.slow === 0.5), 'tutorial: half speed');
  await shot('tutorial-deploy');
  await step(1, 'click a line on CONSUMER', async () => {
    await until(H => H.regions('line').some(r => r.data.lane === 'ext'), 20000);
    return click('line', { lane: 'ext' });
  });
  await step(2, 'a Probe on CONSUMER mount 1', async () => (await place('probe', 'ext', 0)) === 'probe');
  await shot('tutorial-probe');
  await step(3, 'a Human Auditor below it', async () => (await place('auditor', 'ext', 1)) === 'auditor');
  await step(4, 'the desk stamps a FALSE ALARM', () => until((H, st) => st.fx.some(e => e.type === 'falseAlarm') || st.stats.falseAlarms > 0 || Object.values(st.stats.lanes).some(l => l.falseAlarms > 0), 60000));
  await shot('tutorial-false-alarm');
  await step(5, 'a Trusted Monitor on CONSUMER', async () => (await place('monitor', 'ext', 2)) === 'monitor');
  await step(6, 'a Probe on R&D', async () => (await place('probe', 'int', 0)) === 'probe');
  await step(7, 'drag the Safety handle', async () => {
    const s0 = await S((H, st) => st.split.safety), p = await where('split', { handle: 1 });
    if (!p) return false;
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(p.x - 6 * i, p.y); await wait(16); }
    await page.mouse.up(); await away();
    return S(`(H, st) => st.split.safety > ${s0} + 0.02`);
  });
  await step(8, 'the forced offer (Classifier in Monitoring), picked and mounted', async () => {
    if (!(await untilTending((H, st) => st.research.banked.length > 0, 120000))) return false;
    const mon = await S((H, st) => st.research.banked[0].cards.find(c => c.slot === 'monitoring')?.id);
    info(`the offer: ${await S((H, st) => st.research.banked[0].cards.map(c => `${c.slot}:${c.id}`).join(' · '))}`);
    await wait(400); await shot('research-ready');
    await click('research');
    if (!(await until(H => H.view.panel === 'research', 3000))) return false;
    await wait(300); await shot('research-panel');
    const i = await S((H, st) => st.research.banked[0].cards.findIndex(c => c.slot === 'monitoring'));
    await page.locator(`#research-cards .rc[data-i="${i}"]`).click();
    if (await until(H => H.view.research?.type === 'new', 1500)) {
      const free = await S((H, st) => st.lanes.ext.slots.findIndex(s => !s.layer));
      await click('mount', { lane: 'ext', slot: free });
    }
    await away();
    return mon === 'classifier' && S((H, st) => st.research.taken.length === 1 && !H.view.research);
  });
  log(await until(() => document.getElementById('tut')?.hidden !== false, 60000), 'tutorial 10/10: the plate goes, the tutorial is done');
  log(await S(H => H.view.slow === 1), 'tutorial: back to full speed');
  await shot('tutorial-done');

  // ---------- G1 after the tutorial: retrain card, a choice, upgrade, a mount ----------
  await tend();
  if (!retrainSeen) {
    info('set-up: three forced jailbreaks on CONSUMER (the first human catch offers a retrain)');
    await S(H => H.forceAttack('ext', 'jailbreak', 3));
    const t0 = Date.now();
    while (!retrainSeen && Date.now() - t0 < 90000) { await until((H, st) => !!st.pendingRetrain || !!st.pendingChoice, 5000); await tend(); }
    log(retrainSeen > 0, 'caught red-handed: the retrain offer');
  }
  info('set-up: MIRA\'s letter (a call with a choice)');
  await S((H, st) => { if (!st.pendingChoice) H.Sim.fireEvent(st, 'mira_letter'); });
  await until((H, st) => !!st.pendingChoice, 5000);
  await until(H => H.regions('choice').length > 0, 20000);
  await shot('choice');
  log(!!(await answerChoice(0)), 'answer a choice in the codec (a click on its row)');

  await page.keyboard.press('$');                                   // debug money key
  await click('mount', { lane: 'ext', slot: 1 });
  log(await S(H => H.view.selected?.lane === 'ext' && H.view.selected?.slot === 1), 'click the Auditor: the upgrade panel');
  await away(); await wait(200); await shot('upgrade-panel');
  const lv0 = await S((H, st) => H.Rules.labLevel(st, 'auditor'));
  await click('upg-btn', { action: 'upgrade' });
  log(await S((H, st) => H.Rules.labLevel(st, 'auditor')) === lv0 + 1, 'UPGRADE: the Auditor goes up a lab-wide level', `L${lv0} → L${lv0 + 1}`);
  await click('upg-btn', { action: 'close' });
  const mounts = await S((H, st) => st.lanes.int.slots.length);
  await click('slot-buy', { lane: 'int' });
  log(await S((H, st) => st.lanes.int.slots.length) === mounts + 1, 'buy an R&D mount', `${mounts} → ${mounts + 1}`);
  await away();
  await tend();
  await shot('g1-built');

  // ---------- G1 → report: at ×3, the end of the generation drops to 1× ----------
  log(await goFast(), 'F: three times speed in play');
  info('set-up: the rest of G1 at sim speed, with the rail as built (a generation is about 270 s)');
  await S(H => H.labMode(true));                    // the tutorial rail left alone dies by G2 (balance target afkTutorial), and the
  await S(H => H.advance(600, { choose: 0 }));      // set-ups below force bad lines: from here a loss is tallied and the run goes on
  await holdsUntouched('G1 report', 'report', 'ov-report');
  await shot('report-g1');
  await training('train-g2');

  // ---------- G2: the card (its chat completes with no input), then the codec's minimum dwell ----------
  await holdsUntouched('G2 card', 'card', 'ov-card');
  const chatDone = await until(H => { const a = H.view.anim.overlays; return !!a?.chat && a.ci >= a.chat.length; }, 60000);
  log(chatDone, 'G2 card: the chat plays to the end with no input', await S(H => `${H.view.anim.overlays.chat.length} lines`));
  await shot('card-g2');
  await page.keyboard.press('Enter');
  log(await until((H, st) => st.phase === 'play' && st.gen === 2, 3000), 'ENTER: G2 deployed');
  await recordCodec();
  info('set-up: four known lines on the codec (30, 60, 100 and 160 characters); no clicks while they play');
  await page.evaluate(async () => {
    const H = window.__handoff, codec = await import('/src/ui/codec.js');
    for (const n of [30, 60, 100, 160]) codec.say(H.view, H.st, 'audit', ('Dwell check, ' + 'the quick brown fox jumps over the lazy dog. '.repeat(4)).slice(0, n));
  });
  await wait(4000); await shot('g2-codec');
  const t1 = Date.now();
  while (Date.now() - t1 < 60000 && await S(H => { const S = H.view.anim.codec; return !!S.cur || S.queue.length > 0; })) {
    if (await S((H, st) => !!st.pendingChoice)) await answerChoice(0);
    await wait(500);
  }
  await checkDwell();

  // RETRAIN this time: the lab goes dark
  if (await S((H, st) => !st.pendingRetrain)) {
    info('set-up: three forced harmful lines on CONSUMER (G2\'s first human catch)');
    await S(H => H.forceAttack('ext', 'harmful', 3));
    await until((H, st) => !!st.pendingRetrain, 90000);
  }
  if (await S((H, st) => !!st.pendingRetrain)) {
    await retrainCard(true);
    log(await S((H, st) => H.Rules.isDark(st)), 'RETRAIN: the lab goes dark');
    await wait(500); await shot('dark');
  } else log(false, 'G2: a retrain offer');

  // ---------- G2 → G3: the report at 1×, training, the card with a contract ----------
  await goFast();
  info('set-up: the rest of G2 at sim speed');
  await S(H => H.advance(600, { choose: 0 }));
  await holdsUntouched('G2 report', 'report', 'ov-report');
  await training('train-g3');
  await holdsUntouched('G3 card', 'card', 'ov-card');
  log(await page.evaluate(() => /CONTRACT/.test(document.getElementById('cs-info').innerText)), 'G3 card: the Enterprise contract is on it');
  await shot('card-g3');
  await page.locator('#cs-deploy').click();
  log(await until((H, st) => st.phase === 'play' && st.gen === 3, 3000), 'DEPLOY: G3');
  log(await until(H => H.view.focus.ext === 'ext2', 3000), 'the contract lane takes the EXTERNAL track');
  await wait(1500); await shot('g3-contract');

  // ---------- the contract: OPEN LANE, and no fast-forward while it ramps (§3b) ----------
  log(await click('lane-open', { id: 'ext2' }) && await until((H, st) => st.lanes.ext2.open, 2000), 'OPEN LANE (a click): Enterprise opens');
  await away();
  log(!(await goFast()) && await S(H => H.view.toasts.some(t => /ramp/i.test(t.text))), 'F during the ramp: refused, with a reason', await S(H => H.view.toasts.at(-1)?.text));
  await click('hud-btn', { action: 'fast' }); await away();
  log(!(await fast()), 'the ×3 button during the ramp: refused');
  await shot('g3-ramp');
  info('set-up: 61 s of sim time (the ramp is 60 s)');
  await S(H => H.advance(61, { choose: 0 }));
  await tend();
  log(await goFast(), 'F after the ramp: three times speed');
  await page.keyboard.press('f');

  // ---------- lanes: Tab cycles the EXTERNAL track, a tab click pins it ----------
  const f0 = await S(H => H.view.focus.ext);
  await page.keyboard.press('Tab');
  log(await S(`H => H.view.focus.ext !== '${f0}'`), 'Tab: the EXTERNAL track shows the next lane', `${f0} → ${await S(H => H.view.focus.ext)}`);
  await click('lane-tab', { id: 'ext' }); await away();
  log(await S(H => H.view.focus.ext === 'ext' && H.view.pin.ext > H.view.now), 'a click on CONSUMER: shown and pinned');

  // ---------- research: the badge, a card, a mount ----------
  await tend();
  if (!(await S((H, st) => st.research.banked.length))) { info('set-up: the research bar nearly full'); await S((H, st) => { st.research.rp = 39.9; }); await until((H, st) => st.research.banked.length > 0, 10000); }
  await click('research');
  log(await until(H => H.view.panel === 'research' && H.view.modal, 3000), 'the RESEARCH badge opens the panel; the lab waits');
  const tr = await S((H, st) => st.t); await wait(600);
  log(await S((H, st) => st.t) === tr, 'the sim does not move under the panel');
  await shot('g3-research');
  const taken = await S((H, st) => st.research.taken.length);
  await page.locator('#research-cards .rc[data-i="0"]').click();
  if (await until(H => !!H.view.research, 1000)) {
    const t = await S(H => H.view.research.type);
    if (t === 'mount') await click('lane-tab', { id: 'ext' });
    else { const free = await S((H, st) => st.lanes.ext.slots.findIndex(s => !s.layer)); await click('mount', { lane: 'ext', slot: free }); }
  }
  await away();
  log(await S((H, st) => st.research.taken.length) === taken + 1, 'a research card taken', await S((H, st) => st.research.taken.at(-1)?.id ?? st.research.taken.at(-1)));

  // ---------- G4: EGRESS ANOMALY → PULL THE PLUG (§3g, 🚩 5) ----------
  info('set-up: jump to G4 deployed, a bare R&D rail, a forced exfiltration');
  await S((H, st) => {
    H.toGen(4);
    st.lanes.int.slots.forEach((s, i) => { if (s.layer && s.layer !== 'probe') H.Sim.sellLayer(st, 'int', i); });
    H.forceAttack('int', 'exfil', 4);
  });
  await goFast();
  log(await untilTending((H, st) => !!st.alarm, 60000), 'EGRESS ANOMALY: the alarm');
  log(await until(() => !document.getElementById('ov-egress').hidden, 2000), 'EGRESS ANOMALY: the alarm card is up');
  log(!(await fast()), 'EGRESS ANOMALY: 1× speed');
  await shot('egress');
  await page.locator('#eg-pull').click();
  log(await until((H, st) => !st.alarm && !st.over, 2000) && await S((H, st) => H.Rules.isDark(st)), 'PULL THE PLUG (a click): the alarm ends, the lab goes dark');
  await wait(400); await shot('egress-pulled');

  // ---------- the end: the scorecard → PLAY AGAIN ----------
  info('set-up: ship the remaining generations');
  await S(H => H.finish());
  log(await until(() => !document.getElementById('ov-score').hidden, 6000), 'the scorecard', await S((H, st) => `${st.over.win ? 'win' : 'loss'} ${st.over.reason ?? ''}`));
  await wait(2500); await shot('scorecard');
  await page.locator('#sc-again').click();
  log(await until(H => !H.st && !document.getElementById('ov-start').hidden, 3000), 'PLAY AGAIN: the start screen');

  // =================== dev mode (#dev, §7.4) ===================
  await openPage(`/index.html?seed=${seed}#dev`);
  await page.waitForFunction(() => window.__handoff, null, { timeout: 10000 });
  await page.evaluate(() => window.__handoff.fontsReady);
  await page.locator('#difficulty .ch', { hasText: 'Medium' }).click();
  await until((H, st) => st?.phase === 'card');
  await page.keyboard.press('Enter');
  await until((H, st) => st.phase === 'play');
  log(await S((H, st) => H.Rules.laneIds(st).length === 5 && H.Rules.laneIds(st).every(l => st.lanes[l].open && st.lanes[l].slots.length === 10)), 'dev: five lanes open, ten mounts each');
  log(await page.evaluate(() => document.getElementById('tut').hidden), 'dev: no tutorial');
  await S(H => H.labMode(true));                                      // the dev board is bare: a loss is tallied, the run goes on
  await page.keyboard.press('g'); await page.keyboard.press('6');      // G6, not G7: N at G7 ends the run (no G8 to train)
  log(await until((H, st) => st.gen === 6, 4000), 'dev: G then 6 jumps to G6');
  await page.keyboard.press('r');
  log(await until(H => H.view.panel === 'research', 3000), 'dev: R a research offer, the panel opens');
  await page.keyboard.press('Escape');
  await until(H => !H.view.panel, 2000);
  await wait(2000); await shot('dev-g6');
  await page.keyboard.press('n');
  log(await until((H, st) => st.phase === 'training' && !!H.training, 4000), 'dev: N training now');
  await S(H => H.newGame('medium'));
  log(await until(H => !H.training && !document.getElementById('train').classList.contains('on'), 3000), 'dev: a new game cancels the training run');

  // =================== a plain page: no hooks; Easy, DEPLOY, SKIP TUTORIAL, a Probe by layout coordinates, 15 s at ×3 ===================
  await openPage(`/index.html?seed=${seed}`);
  await wait(1500);
  log(await page.evaluate(() => window.__handoff === undefined), 'plain page: no debug hooks');
  await page.locator('#difficulty .ch', { hasText: 'Easy' }).click();
  await page.locator('#cs-deploy').click();
  log(await page.locator('#tut .tut-skip').waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false), 'plain page: a first game opens with the tutorial');
  await page.locator('#tut .tut-skip').click();
  log(await page.evaluate(() => document.getElementById('tut').hidden), 'plain page: SKIP TUTORIAL');
  await page.mouse.click(856, 544); await wait(100); await page.mouse.click(72, 121); await wait(100);     // the PRB key, CONSUMER mount 1
  await page.mouse.move(600, 640);
  await page.keyboard.press('f');
  await wait(15000);
  await shot('plain-easy-x3');
} catch (err) {
  log(false, 'playthrough crashed', err.stack?.split('\n').slice(0, 3).join(' | '));
}

for (const e of errors) console.log('page error: ' + e.split('\n').slice(0, 3).join(' | '));
console.log(`\n${failed ? failed + ' failed' : 'all steps ok'} · ${errors.length} page errors · ${n} PNGs in ${path.resolve(out)} · ${((Date.now() - T0) / 1000).toFixed(0)} s`);
await browser.close();
server.close();
process.exit(failed || errors.length ? 1 : 0);
