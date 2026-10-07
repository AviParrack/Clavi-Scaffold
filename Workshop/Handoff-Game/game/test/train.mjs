// ===== Training minigame tests (DESIGN-v3 §4), on the real src/train/ module =====
// usage:  node test/train.mjs                      every §4 acceptance check (exit 1 on a failure)
//         node test/train.mjs <policy> <seed> <g>  one run, error per second. policy: none | autopilot | autopilot:0.5
//         node test/train.mjs eref [N]             fresh E_ref per generation (median `none` error, seeds 1..N), to paste into config
//         node test/train.mjs tune [N]             the feel-tuning table: s by policy and generation, tools used, noise-only exits
//         node test/train.mjs ui <outdir> [g] [seed]  Playwright: plays train.html with the real mouse, screenshots each phase
//             (needs NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 for the web fonts, as test/ui-shot.mjs)
// Replaces design/train-check-v3.mjs (same physics, same seeds, same two asserts plus the rest of §4).

import { KNOBS, TRAIN, SAMPLE_HAZARDS } from '../src/config/training.js';
import { makeCourse, hazardCount, gradient, potential } from '../src/train/course.js';
import { createRun, stepRun, runResult, place, predict, classifyClick } from '../src/train/sim.js';
import { none, autopilot, play } from '../src/train/autopilot.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GENS = [2, 3, 4, 5, 6, 7];
const EREF_SEEDS = 100;
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const pct = x => `${(100 * x).toFixed(0)}%`;
const seeds = n => Array.from({ length: n }, (_, i) => i + 1);

// =================== policies by name ===================

function policyOf(name) {
  if (name === 'none') return none;
  const m = /^(?:autopilot|ap)(?::?([\d.]+))?$/.exec(name);
  if (m) return autopilot(m[1] ? +m[1] : 0.8);
  throw new Error(`unknown policy "${name}" (none | autopilot | autopilot:0.5)`);
}

// fresh E_ref: the median error of `none` on the clean course (forks on, no hazards, no debt)
function measureEref(g, n = EREF_SEEDS) {
  return median(seeds(n).map(s => play({ g, seed: s, debt: 0, hazards: [] }, none).err));
}

// =================== checks ===================

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

// ----- one bumper from the bottom of the deepest fork (ρ = 2.5) puts the ball back in the basin, 0.8 s later -----
function testBumper() {
  console.log('\n▶ Bumper escape: the ball at the bottom of the deepest fork, one bumper, back in the basin 0.8 s later (noise on)');
  const N = 60;
  for (const g of GENS) {
    let ok = 0, n = 0;
    for (const s of seeds(N)) for (const dir of [1, -1]) {
      const run = createRun({ g, seed: s, knobs: { forks: 0 } }), C = run.course, y0 = 2;
      C.forks.push({ y0: y0 - 0.8, x0: C.c(y0 - 0.8), dir, D: C.Da * TRAIN.forkDepth[1], label: 'TEST' });
      jumpTo(run, 20, y0, C.c(y0 - 0.8) + dir * TRAIN.forkOff * C.w0);
      const r = place(run, { kind: 'bumper', x: run.x, y: run.y });
      stepRun(run, 0.8, null);
      ok += r.ok && Math.abs(run.x - C.c(run.y)) <= C.w; n++;
    }
    check(`G${g}: back in the basin ${ok}/${n}`, ok / n >= 0.9, pct(ok / n));
  }
}
// put a run at time t, course position y and lateral x, at rest (tests only)
function jumpTo(run, t, y, x) {
  run.n = Math.round(t / TRAIN.dt); run.t = run.n * TRAIN.dt; run.y = y; run.x = x; run.v = 0;
  run.hzNext = run.course.hazards.filter(h => h.y <= y).length;
}

// ----- noise alone (no forks) leaves the basin 5–30% of the time at G4 -----
function testNoise() {
  console.log('\n▶ Noise alone: time out of the basin with no forks and no input (60 seeds)');
  for (const g of GENS) {
    const out = mean(seeds(60).map(s => 1 - play({ g, seed: s, knobs: { forks: 0 } }, none).timeInBasin));
    if (g === 4) check(`G4: out of the basin ${pct(out)}, inside 5–30%`, out >= 0.05 && out <= 0.30);
    else console.log(`     G${g}: ${pct(out)}`);
  }
}

// ----- the ball never crosses an active rail at v_x ≤ 4 (wells and noise on, the scroll slowed so the ball stays in the span) -----
function testRails() {
  console.log('\n▶ Guard rails: a ball thrown at an active rail never ends up on the far side');
  for (const vx of [0.5, 1, 2, 4]) {
    let crossed = 0, n = 0;
    for (const g of GENS) for (const s of seeds(10)) for (const side of [1, -1]) {
      const run = createRun({ g, seed: s, knobs: { v0: 0.02 } }), C = run.course;
      jumpTo(run, 20, 1, C.c(1));
      const xr = run.x + side * 0.05;
      place(run, { kind: 'rail', x: xr, y: run.y });
      run.v = side * vx;
      for (let i = 0; i < 240; i++) {
        stepRun(run, TRAIN.dt, null);
        const r = run.rails[0];
        if (r && run.t <= r.until && run.y >= r.y0 && run.y <= r.y1 && (run.x - xr) * side > 0) { crossed++; break; }
      }
      n++;
    }
    check(`v_x = ${vx}: crossed ${crossed}/${n}`, crossed === 0);
  }
  // the same at full scroll: a rail beside the ball, the ball thrown at it; it holds while the ball is in its span
  let crossed = 0, held = 0;
  for (const g of GENS) for (const s of seeds(10)) {
    const run = createRun({ g, seed: s }), C = run.course;
    jumpTo(run, 15, 3, C.c(3));
    const side = s % 2 ? 1 : -1, xr = run.x + side * 0.6 * C.w;
    place(run, { kind: 'rail', x: xr, y: run.y + 0.08 });
    run.v = side * 2;
    const r = run.rails[0];
    while (run.y < r.y1) {
      stepRun(run, TRAIN.dt, null);
      if (run.y >= r.y0 && run.y <= r.y1) { if ((run.x - xr) * side > 0) crossed++; else held++; }
    }
  }
  check(`full scroll, v_x = 2 at a rail beside the ball: on the far side in ${crossed} of ${crossed + held} steps inside its span`, crossed === 0);
}

// ----- determinism: the same seed gives the same error, whatever the frame rate -----
function testDeterminism() {
  console.log('\n▶ Determinism: same seed, same error (fixed dt with substeps, so frame size does not matter)');
  for (const g of [2, 5, 7]) {
    const a = play({ g, seed: 11, debt: 0.01 }, autopilot(0.8)), b = play({ g, seed: 11, debt: 0.01 }, autopilot(0.8));
    check(`G${g}: autopilot(0.8) twice → err ${a.err.toFixed(6)} = ${b.err.toFixed(6)}`, a.err === b.err && a.railsUsed === b.railsUsed);
    // none, stepped at ragged frame sizes (1/144 .. 1/20 s), against the headless fixed-step run
    const run = createRun({ g, seed: 11, debt: 0.01 });
    let k = 0;
    while (!run.done) stepRun(run, [1 / 144, 1 / 60, 1 / 33, 1 / 20, 1 / 75][k++ % 5], null);
    const c = play({ g, seed: 11, debt: 0.01 }, none);
    check(`G${g}: none at ragged frame sizes → err ${run.err.toFixed(6)} = ${c.err.toFixed(6)}`, run.err === c.err);
  }
  const c1 = makeCourse({ g: 4, seed: 5, debt: 0.02 }), c2 = makeCourse({ g: 4, seed: 5, debt: 0.02 });
  check('makeCourse is pure: same forks and hazards', JSON.stringify([c1.forks, c1.hazards]) === JSON.stringify([c2.forks, c2.hazards]));
}

// ----- scores: none ≥ 0.9 E_ref, autopilot(0.8) ≤ E_ref/3 (medians), and the E_ref in config is fresh -----
function testScores() {
  console.log(`\n▶ Scores: none vs autopilot(0.8), medians over 60 seeds; E_ref in config vs a fresh ${EREF_SEEDS}-seed measurement`);
  for (const g of GENS) {
    const E = KNOBS[g].Eref, fresh = measureEref(g);
    const nErr = median(seeds(100).map(s => play({ g, seed: 100 + s }, none).err));        // fresh seeds 101..200
    const aRes = seeds(60).map(s => play({ g, seed: s }, autopilot(0.8)));
    const aErr = median(aRes.map(r => r.err)), aS = mean(aRes.map(r => r.s));
    check(`G${g}: E_ref ${E} vs fresh ${fresh.toFixed(3)}`, Math.abs(fresh / E - 1) <= 0.05, `${((fresh / E - 1) * 100).toFixed(1)}%`);
    check(`G${g}: none err ${nErr.toFixed(3)} (other seeds) ≥ 0.9·E_ref (${(0.9 * E).toFixed(3)})`, nErr >= 0.9 * E);
    check(`G${g}: autopilot(0.8) err ${aErr.toFixed(3)} ≤ E_ref/3 (${(E / 3).toFixed(3)})`, aErr <= E / 3, `mean s ${aS.toFixed(2)}`);
  }
}

// ----- debt: hazards = min(8, round(400·debt)); the worst debt costs autopilot(0.8) at most 0.20 of s -----
function testDebt() {
  console.log('\n▶ Debt: hazard count, and the cap on what the worst debt costs a good run (autopilot(0.8), 80 seeds)');
  const counts = [0, 0.001, 0.004, 0.005, 0.0125, 0.02, 0.1].map(d => [d, makeCourse({ g: 3, seed: 1, debt: d }).hazards.length]);
  check('no hazard list given: count = min(8, round(400·debt))', counts.every(([d, n]) => n === hazardCount(d) && n === Math.min(8, Math.round(400 * d))),
    counts.map(([d, n]) => `${d}→${n}`).join(' '));
  const given = makeCourse({ g: 3, seed: 1, debt: 0.1, hazards: SAMPLE_HAZARDS.slice(0, 3) });
  check('a hazard list from the deployment wins (3 given → 3 shards)', given.hazards.length === 3 && given.hazards[0].text === SAMPLE_HAZARDS[0].text);
  const C0 = makeCourse({ g: 4, seed: 1, debt: 0 }), C1 = makeCourse({ g: 4, seed: 1, debt: 1 });
  check(`basin ×${(C1.w / C0.w).toFixed(2)} (≥ 0.7) and σ +${(C1.sig - C0.sig).toFixed(2)} (≤ 0.1) at any debt`, C1.w / C0.w >= 0.7 - 1e-9 && C1.sig - C0.sig <= 0.1 + 1e-9);
  // hazards do something: a sabotage kicks, a poison zone raises the noise
  const run = createRun({ g: 4, seed: 3, debt: 0.05 });
  let kicked = 0, poisoned = 0;
  while (!run.done) { stepRun(run, TRAIN.dt, null); if (run.sigNow > run.course.sig) poisoned++; }
  kicked = run.fx.filter(f => f.type === 'sabotage').length + run.hazardsHit;
  check(`hazards bite: ${run.hazardsHit} hit, ${poisoned} steps inside a poison zone`, run.hazardsHit > 0 && poisoned > 0, `${kicked}`);

  for (const g of GENS) {
    const clean = mean(seeds(80).map(s => play({ g, seed: s, debt: 0, hazards: [] }, autopilot(0.8)).s));
    const worst = mean(seeds(80).map(s => play({ g, seed: s, debt: 0.05 }, autopilot(0.8)).s));
    check(`G${g}: s clean ${clean.toFixed(2)} − s at max debt ${worst.toFixed(2)} = ${(clean - worst).toFixed(2)} ≤ 0.20`, clean - worst <= 0.20);
  }
}

// ----- the tools: charges, refusals, click classification, prediction -----
function testTools() {
  console.log('\n▶ Tools: charges, recharge, what a click places, the dotted path');
  const run = createRun({ g: 3, seed: 2 });
  stepRun(run, 4, null);
  const y = run.y + 0.3;
  const placed = [1, 2, 3, 4, 5, 6].map(i => place(run, { kind: 'rail', x: 0.2 + i * 0.05, y }).ok);
  check('5 charges: five rails go down, the sixth is refused', placed.filter(Boolean).length === 5 && !placed[5], placed.join(' '));
  stepRun(run, TRAIN.recharge + 0.01, null);
  check(`one charge back every ${TRAIN.recharge} s`, run.charges === 1, `charges ${run.charges}`);
  check('a bumper costs 2: refused with 1', !place(run, { kind: 'bumper', x: 0.5, y: run.y + 0.1 }).ok);
  check('behind the ball: refused', !place(run, { kind: 'rail', x: 0.5, y: run.y - 0.3 }).ok);

  const r2 = createRun({ g: 3, seed: 2 });
  stepRun(r2, 5, null);
  const pred = predict(r2), p = pred.pts[Math.floor(pred.pts.length / 2)];
  const onPath = classifyClick(r2, p.x + 0.005, p.y, 0, pred), beside = classifyClick(r2, p.x + 0.08, p.y, 0, pred);
  const right = classifyClick(r2, p.x, p.y, 2, pred), behind = classifyClick(r2, p.x, r2.y - 0.4, 0, pred);
  check('left click on the dotted path → ramp (snapped onto the path)', onPath?.kind === 'ramp' && onPath.x === p.x);
  check('left click ahead, off the path → rail', beside?.kind === 'rail');
  check('right click → bumper; left click behind the ball → nothing', right?.kind === 'bumper' && behind === null);

  // the prediction is the noise-free future: with σ = 0 the run follows it
  const r3 = createRun({ g: 4, seed: 9, knobs: { sig: 0 } });
  stepRun(r3, 6, null);
  const pr = predict(r3, 1.0);
  stepRun(r3, 1.0, null);
  const last = pr.pts[pr.pts.length - 1];
  check(`σ = 0: the ball lands on the end of its 1 s prediction (Δx ${Math.abs(r3.x - last.x).toExponential(1)})`, Math.abs(r3.x - last.x) < 1e-9 && Math.abs(r3.y - last.y) < 1e-9);

  // a ramp across the path sends a ball that is out of the basin back toward the channel
  let back = 0, n = 0;
  for (const g of GENS) for (const s of seeds(20)) {
    const r = createRun({ g, seed: s, knobs: { forks: 0 } }), C = r.course;
    jumpTo(r, 20, 3, C.c(3) + (s % 2 ? 1 : -1) * 2 * C.w);
    const pp = predict(r).pts.find(q => q.t >= 0.2);
    place(r, { kind: 'ramp', x: pp.x, y: pp.y });
    stepRun(r, 1.4, null);
    back += Math.abs(r.x - C.c(r.y)) <= C.w; n++;
  }
  check(`a ramp on the path brings a ball from 2w out back into the basin within 1.4 s: ${back}/${n}`, back / n >= 0.9, pct(back / n));
}

// ----- the result object (the frozen interface) -----
function testResult() {
  console.log('\n▶ Result: the shape submitTraining reads');
  const r = play({ g: 4, seed: 1, debt: 0.01 }, autopilot(0.6));
  const keys = ['s', 'err', 'errPerSec', 'timeInBasin', 'railsUsed', 'rampsUsed', 'bumpersUsed', 'hazardsHit', 'converged'];
  check(`has ${keys.join(', ')}`, keys.every(k => k in r));
  check(`errPerSec sums to err (${mean([r.errPerSec.reduce((a, b) => a + b, 0)]).toFixed(4)} vs ${r.err.toFixed(4)}), one entry per second`,
    Math.abs(r.errPerSec.reduce((a, b) => a + b, 0) - r.err) < 1e-9 && r.errPerSec.length === KNOBS[4].T);
  check(`s = clamp(1 − err/E_ref) = ${r.s.toFixed(3)}`, Math.abs(r.s - Math.max(0, Math.min(1, 1 - r.err / KNOBS[4].Eref))) < 1e-12);
}

// ----- runTraining: a fake page (canvas, rAF, keys), resolves exactly once, cancel works -----
async function testRunTraining() {
  console.log('\n▶ runTraining: countdown → run → results card → CONTINUE resolves once; cancel resolves { cancelled: true }');
  const dom = fakeDom();
  const { runTraining } = await import('../src/train/index.js');
  const cfg = { g: 3, seed: 4, debt: 0.01, hazards: SAMPLE_HAZARDS.slice(0, 2), traits: [], difficulty: 'medium', knobs: { T: 12 } };

  // a whole run: play the frames, then click CONTINUE on the card
  const h = runTraining(cfg, { canvas: dom.canvas, k: 1, debug: true });
  let resolved = 0, value = null;
  h.promise.then(v => { resolved++; value = v; });
  dom.frames(TRAIN.countdown + 12 + 2);                         // countdown, the run, the CONVERGED stamp
  dom.key('KeyD'); dom.frames(0.2); dom.key('ArrowRight'); dom.key('KeyD');
  dom.click(600, 400, 0); dom.click(600, 400, 2);               // late clicks on a finished run do nothing
  const btn = h._view?.cont;
  if (btn) dom.click(btn.x + btn.w / 2, btn.y + btn.h / 2, 0); else dom.key('Enter');
  await new Promise(r => setTimeout(r, 0));
  h.cancel(); dom.key('Enter');
  await new Promise(r => setTimeout(r, 0));
  check('resolves once, with a result', resolved === 1 && value && typeof value.s === 'number' && !value.cancelled, JSON.stringify(value && { s: +value.s.toFixed(3), err: +value.err.toFixed(3) }));
  check('stops its animation loop and drops its listeners after resolving', dom.pending() === 0 && dom.listeners() === 0, `rAF ${dom.pending()} · listeners ${dom.listeners()}`);

  // cancel mid-run
  const h2 = runTraining(cfg, { canvas: dom.canvas, k: 1 });
  let n2 = 0, v2 = null;
  h2.promise.then(v => { n2++; v2 = v; });
  dom.frames(TRAIN.countdown + 2);
  h2.cancel(); h2.cancel();
  await new Promise(r => setTimeout(r, 0));
  check('cancel() mid-run resolves { cancelled: true } once', n2 === 1 && v2?.cancelled === true);
  check('cancel() stops the loop and drops the listeners', dom.pending() === 0 && dom.listeners() === 0, `rAF ${dom.pending()} · listeners ${dom.listeners()}`);
  check('no errors drawing', dom.errors.length === 0, dom.errors.slice(0, 2).join(' | '));
}

// a minimal page for index.js: a canvas whose 2D context swallows every call, a hand-cranked rAF, key and mouse listeners
function fakeDom() {
  const listeners = new Map(), errors = [];
  let raf = new Map(), rid = 0, now = 0;
  const target = name => ({
    addEventListener(t, f) { listeners.set(name + ':' + t + ':' + listeners.size, { t, f, name }); },
    removeEventListener(t, f) { for (const [k, v] of listeners) if (v.t === t && v.f === f && v.name === name) listeners.delete(k); },
  });
  const ctx = new Proxy({}, {
    get(o, p) {
      if (p in o) return o[p];
      if (p === 'measureText') return s => ({ width: String(s).length * 6 });
      if (p === 'createImageData' || p === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(o, p, v) { o[p] = v; return true; },
  });
  const mkCanvas = name => ({ ...target(name), width: 1200, height: 660, style: {}, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 660 }), focus() {} });
  const canvas = mkCanvas('canvas');
  globalThis.window = Object.assign(globalThis.window || {}, target('window'), { devicePixelRatio: 1 });
  globalThis.document = { createElement: () => mkCanvas('scratch'), fonts: undefined, hidden: false };
  globalThis.requestAnimationFrame = f => { raf.set(++rid, f); return rid; };
  globalThis.cancelAnimationFrame = id => raf.delete(id);
  const fire = (name, t, ev) => { for (const v of [...listeners.values()]) if (v.name === name && v.t === t) try { v.f(ev); } catch (e) { errors.push(e.stack || String(e)); } };
  return {
    canvas, errors,
    frames(sec) {
      for (let i = 0; i < Math.round(sec * 60); i++) {
        now += 1000 / 60;
        const due = raf; raf = new Map();
        for (const f of due.values()) try { f(now); } catch (e) { errors.push(e.stack || String(e)); }
      }
    },
    key(code) { fire('window', 'keydown', { code, key: code, preventDefault() {} }); },
    click(x, y, button) {
      const ev = { clientX: x, clientY: y, button, preventDefault() {} };
      fire('canvas', 'pointermove', ev); fire('canvas', 'pointerdown', ev);
      if (button === 2) fire('canvas', 'contextmenu', ev);
    },
    pending: () => raf.size,
    listeners: () => listeners.size,
  };
}


// =================== UI: play train.html in Chromium with the real mouse ===================
// A bot reads the run each ~50 ms and clicks like a player: beside the dots for a rail, on the dots for a ramp, a right
// click for a bumper. Checks: no page errors, every tool goes down from a real click, D toggles the debug view,
// CONTINUE on the results card resolves the run, and the bot's score shows the course is winnable.

async function uiPlay(out, g = 3, seed = 5) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
  fs.mkdirSync(out, { recursive: true });
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 660 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (/\[train/.test(m.text())) console.log('     page:', m.text()); });
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    try {
      const x = await fetch(r.request().url(), { headers: { 'user-agent': r.request().headers()['user-agent'] } });
      await r.fulfill({ status: x.status, headers: { 'content-type': x.headers.get('content-type') || '', 'access-control-allow-origin': '*' }, body: Buffer.from(await x.arrayBuffer()) });
    } catch { await r.abort(); }
  });
  const shot = name => page.screenshot({ path: path.join(out, `train-${name}.png`) });
  try {
    console.log(`\n▶ UI play-through: train.html, G${g} seed ${seed}, debt 0.005 (real mouse, real time)`);
    await page.goto(`http://127.0.0.1:${server.address().port}/train.html#g=${g},seed=${seed},debt=0.005`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__train);
    const fonts = await page.evaluate(() => window.__train.fontsReady);
    await page.waitForTimeout(300);
    await shot('1-picker');
    await page.click('#go');
    await page.waitForTimeout(1200);
    await shot('2-countdown');

    // ---- the bot ----
    let shotMid = false, shotDebug = false, debugSeen = false, clicks = { rail: 0, ramp: 0, bumper: 0 };
    const t0 = Date.now();
    for (;;) {
      const d = await page.evaluate(async () => {
        const T = window.__train, h = T.handle;
        if (!h) return { phase: 'gone' };
        const v = h._view, run = h._ctl.run;
        if (v.phase !== 'run') return { phase: v.phase };
        const { predict } = await import('/src/train/sim.js');
        const C = run.course, w = C.w, off = run.x - C.c(run.y), out = Math.abs(off) - w, bot = (window.__bot ||= { last: {} });
        const pred = predict(run, 1.0, 0.8), since = k => run.t - (bot.last[k] ?? -9);
        const at = (x, y) => T.client(300 + 600 * x, 30 + 600 * (y - run.y + 1 / 3));
        const ptAt = t => pred.pts.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), pred.pts[0]);
        const res = { phase: 'run', t: run.t, used: { ...run.used }, debug: v.debug };
        const end = pred.pts[pred.pts.length - 1], stillOut = Math.abs(end.x - C.c(end.y)) > w;
        let click = null;
        if (out > 0.8 * w && off * run.v >= 0 && run.charges >= 2 && since('bumper') > 0.6) click = ['bumper', 'right', ptAt(0.15)];
        else if (out > 0.1 * w && stillOut && run.charges >= 1 && since('ramp') > 0.5) click = ['ramp', 'left', ptAt(0.3)];
        else if (pred.exit && run.charges >= 1 && since('rail') > 0.35) click = ['rail', 'left', { x: pred.exit.x + pred.exit.side * 0.045, y: pred.exit.y + 0.08 }];
        // make sure every tool gets tried once, late in the run, if the course never asked for it
        else if (run.t > 22 && run.used.ramp === 0 && run.charges >= 3) click = ['ramp', 'left', ptAt(0.5)];
        else if (run.t > 24 && run.used.bumper === 0 && run.charges >= 2) click = ['bumper', 'right', ptAt(0.4)];
        if (click) { bot.last[click[0]] = run.t; res.click = { kind: click[0], button: click[1], ...at(click[2].x, click[2].y) }; }
        return res;
      });
      if (d.phase === 'results' || d.phase === 'gone' || Date.now() - t0 > 90000) break;
      if (d.phase === 'stamp') { if (!shotMid) continue; await shot('6-stamp'); shotMid = 'stamped'; await page.waitForTimeout(2000); continue; }
      if (d.click) { await page.mouse.click(d.click.x, d.click.y, { button: d.click.button }); clicks[d.click.kind]++; }
      if (d.phase === 'run' && d.t > 14 && !shotMid) {
        shotMid = true;
        await page.evaluate(() => window.__train.handle._ctl.freeze(true));
        await page.mouse.move(...Object.values(await page.evaluate(() => window.__train.client(640, 520))));
        await page.evaluate(() => window.__train.handle._ctl.draw());
        await shot('3-midrun');
        await page.keyboard.press('KeyD');
        debugSeen = await page.evaluate(() => { window.__train.handle._ctl.draw(); return window.__train.handle._view.debug; });
        await shot('4-debug');
        await page.keyboard.press('KeyD');
        await page.evaluate(() => window.__train.handle._ctl.freeze(false));
      }
      if (d.phase === 'run' && d.t > 30 && !shotDebug) { shotDebug = true; await shot('5-late'); }
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
    await shot('7-results');
    const before = await page.evaluate(() => { const h = window.__train.handle; return h && { used: { ...h._ctl.run.used }, debug: h._view.debug, B: h._view.cont }; });
    const B = before?.B;
    if (B) { const p = await page.evaluate(([x, y]) => window.__train.client(x, y), [B.x + B.w / 2, B.y + B.h / 2]); await page.mouse.click(p.x, p.y); }
    await page.waitForTimeout(500);
    const last = await page.evaluate(() => window.__train.last);
    await shot('8-after');
    check(`web fonts loaded`, fonts === true);
    check(`no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    check(`the bot's clicks: rail ${clicks.rail}, ramp ${clicks.ramp}, bumper ${clicks.bumper}; placed: rails ${before?.used.rail}, ramps ${before?.used.ramp}, bumpers ${before?.used.bumper}`,
      before && before.used.rail > 0 && before.used.ramp > 0 && before.used.bumper > 0);
    check('D shows the debug view, D again hides it', debugSeen === true && before?.debug === false);
    check('CONTINUE on the results card resolves the run with a result', last && typeof last.s === 'number' && !last.cancelled,
      last && `s ${last.s.toFixed(3)} · loss ${last.err.toFixed(2)} · in basin ${pct(last.timeInBasin)} · converged ${last.converged}`);
    check('winnable: the mouse bot scores s ≥ 0.5', last && last.s >= 0.5);
    console.log(`     screenshots: ${path.resolve(out)}/train-*.png`);
  } finally {
    await browser.close();
    server.close();
  }
}

// =================== CLI: one run, error per second ===================

function oneRun(name, seed, g) {
  const res = play({ g, seed, debt: 0, hazards: [] }, policyOf(name));
  console.log(`${name} · seed ${seed} · G${g} · E_ref ${KNOBS[g].Eref}`);
  console.log(' t  err/s   cumulative');
  let cum = 0;
  res.errPerSec.forEach((e, t) => { cum += e; console.log(`${String(t).padStart(2)}  ${e.toFixed(4)}  ${cum.toFixed(4)}  ${'█'.repeat(Math.min(60, Math.round(e * 200)))}`); });
  console.log(`err ${res.err.toFixed(4)} · s ${res.s.toFixed(3)} · in the basin ${pct(res.timeInBasin)} · rails ${res.railsUsed} ramps ${res.rampsUsed} bumpers ${res.bumpersUsed} · converged ${res.converged}`);
}

function tune(N) {
  console.log(`Feel tuning (${N} seeds, clean course). s = mean over seeds (median in brackets). Target: autopilot(0.8) ≈ 0.8 at G2 → lower at G7; none ≈ 0.\n`);
  const pols = ['none', 'autopilot:0.3', 'autopilot:0.5', 'autopilot:0.8', 'autopilot:1'];
  console.log(`| gen | noise-only out | ${pols.join(' | ')} | autopilot(0.8) rails/ramps/bumpers |`);
  console.log(`|---|---|${pols.map(() => '---|').join('')}---|`);
  for (const g of GENS) {
    const out = mean(seeds(N).map(s => 1 - play({ g, seed: s, knobs: { forks: 0 } }, none).timeInBasin));
    let tools = '';
    const cells = pols.map(p => {
      const R = seeds(N).map(s => play({ g, seed: s }, policyOf(p)));
      if (p === 'autopilot:0.8') tools = ['railsUsed', 'rampsUsed', 'bumpersUsed'].map(k => mean(R.map(r => r[k])).toFixed(1)).join(' / ');
      return `${mean(R.map(r => r.s)).toFixed(2)} (${median(R.map(r => r.s)).toFixed(2)})`;
    });
    console.log(`| G${g} | ${pct(out)} | ${cells.join(' | ')} | ${tools} |`);
  }
}

// =================== main ===================

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'eref') {
  const N = +a1 || EREF_SEEDS;
  console.log(`E_ref = median error of none on the clean course, seeds 1..${N}:`);
  for (const g of GENS) { const e = measureEref(g, N); console.log(`  G${g}: ${e.toFixed(3)}   (config ${KNOBS[g].Eref}, ${((e / KNOBS[g].Eref - 1) * 100).toFixed(1)}%)`); }
} else if (cmd === 'tune') {
  tune(+a1 || 40);
} else if (cmd === 'ui') {
  await uiPlay(a1 || 'train-shots', +a2 || 3, +process.argv[5] || 5);
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
} else if (cmd) {
  oneRun(cmd, +a1 || 1, +a2 || 4);
} else {
  const t0 = Date.now();
  console.log(`Training minigame (DESIGN-v3 §4): Da ${TRAIN.Da}, k ${TRAIN.k}, γ ${TRAIN.gamma}, dt 1/${Math.round(1 / TRAIN.dt)}`);
  testBumper();
  testNoise();
  testRails();
  testDeterminism();
  testTools();
  testResult();
  testScores();
  testDebt();
  await testRunTraining();
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ ALL PASSED'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failures ? 1 : 0);
}
