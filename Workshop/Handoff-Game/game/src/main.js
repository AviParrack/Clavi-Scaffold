// ===== Boot, loop, scale, input. Glue between the sim (game state) and the ui modules (read state, draw the board) =====
// One canvas, 1200×660 logical px, letterboxed and crisp at any devicePixelRatio. Modal screens are HTML (ui/overlays.js).
// Plan: design/UI-PLAN.md. Every ui/ module only reads state and acts through ui/act.js.

import * as Sim from './sim/sim.js';
import * as Rules from './sim/rules.js';
import * as Layout from './ui/layout.js';
import { W, H, REGIONS } from './ui/layout.js';
import { C, F, setScale, setCalm, cssVars, fontsReady, box, text } from './ui/theme.js';
import { createView, resetView } from './ui/view.js';
import { createHits } from './ui/hit.js';
import { createAct } from './ui/act.js';
import { attachInput } from './ui/input.js';
import * as tracks from './ui/tracks.js';
import * as hud from './ui/hud.js';
import * as codec from './ui/codec.js';
import * as menu from './ui/menu.js';
import * as overlays from './ui/overlays.js';
import * as tutorial from './ui/tutorial.js';
import { createDebug } from './ui/debug.js';
import { modelCard } from './ui/derive.js';
import { initAudio, setMuted, isMuted } from './ui/audio.js';
import { runTraining } from './train/index.js';
import { BALANCE as B } from './config/balance.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const HASH = location.hash.slice(1).split(',').filter(Boolean);   // flags: #dev, #dev,slow, #notut
const PIXEL = params.get('pixel') === '1';        // integer scale only (sharper pixels, wider letterbox)
const SIM_DT = 1 / 60;

// board modules, in draw order. Each exports draw(c) and input = { kind: { click, context, drag } }
const MODULES = [['tracks', tracks], ['hud', hud], ['codec', codec], ['menu', menu]];

// ---------- tiny localStorage wrapper (best scorecard + settings only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('handoff.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('handoff.' + k, JSON.stringify(v)); } catch { /* private mode etc. */ } },
};

// dev mode: every lane open, every element unlocked, every slot open, a big bank, and the debug keys
// (R research now · G then 1–7 jump to a generation · N training now · $ U D T L).
// On with the #dev link (works in the published artifact; flags: #dev,slow) or the start screen's DEV MODE switch
// (remembered). ?debug=1 alone gives the keys and the truth panel but a normal opening (test/ui-shot.mjs relies on that).
let DEV = HASH.includes('dev') || store.get('dev', false);

// =================== state ===================

let st = null;
const view = createView();
Object.assign(view.settings, store.get('prefs', {}));        // codec SLOW / NORMAL, reduce flashes (start screen)
if (HASH.includes('slow')) view.settings.codec = 'slow';
const hits = createHits();
const canvas = document.getElementById('screen');
const frameEl = document.getElementById('frame');
const g = canvas.getContext('2d');           // not { alpha: false }: an opaque canvas gets LCD sub-pixel text (colour fringes)
let k = 1;                                   // device px per logical px

const api = {
  get st() { return st; },
  view, store,
  get debug() { return DEBUG || DEV; },
  get dev() { return DEV; },
  setDev(on) { DEV = on; store.set('dev', on); if (on) setupDev(); },
  act: null,
  newGame, endGame,
  isMuted,
  toggleMute() { setMuted(!isMuted()); store.set('muted', isMuted()); view.toast(isMuted() ? 'muted' : 'sound on'); },
  onGesture: initAudio,
  debugActions: null,
  savePrefs() { store.set('prefs', { ...view.settings }); },
  // the G1 tutorial: on for a first game, off once finished or skipped (remembered), off in dev mode and with #notut
  get tutorialWanted() { return !DEV && !HASH.includes('notut') && !store.get('tutorialDone', false); },
  tutorialDone() { store.set('tutorialDone', true); },
};
api.act = createAct(api);
setMuted(store.get('muted', false));

// ---------- start / restart ----------
// tutorial: null = ask api.tutorialWanted (a player's first game), true / false = force it (debug hooks)
function newGame(difficulty = 'medium', { tutorial: tut = null } = {}) {
  const seed = params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
  const withTutorial = (tut ?? api.tutorialWanted) && !DEV;          // dev mode never runs the tutorial
  st = Sim.createState({ seed, difficulty, tutorial: withTutorial });
  st.debug = DEBUG;
  resetView(view);
  stopTraining();
  if (DEV) devStart(st);
  tutorial.start(api, withTutorial);
  acc = 0;
  store.set('settings', { difficulty });
  console.log(`[handoff] new game seed=${seed} difficulty=${difficulty}${DEBUG ? ` (true: ${st.trueDifficulty})` : ''} tutorial=${withTutorial}`);
  return st;
}
function endGame() { stopTraining(); st = null; resetView(view); }

// dev mode's opening: every lane open, all unlocked, every lane at max slots, and a bank (press $ for more)
function devStart(st) {
  st.dev = true;
  Sim.debugOpenLanes(st);
  Sim.debugUnlockAll(st);
  for (const lane of Rules.laneIds(st)) while (st.lanes[lane].slots.length < B.maxSlots) Sim.debugAddSlot(st, lane);
  for (let i = 0; i < 4; i++) Sim.debugAddMoney(st);
  console.log(`[handoff] dev mode: ${Rules.laneIds(st).length} lanes open, ${st.unlocked.length} elements, ${B.maxSlots} slots per lane, ${Math.round(st.money)} money`);
}

// =================== training (DESIGN-v3 §4, §5): src/train on its own canvas while st.phase is 'training' ===================
// runTraining(trainingConfig(st)) owns #train (its loop, input, countdown and results card). Its result goes to
// Sim.submitTraining, which starts the next model at its card. While a run is on, the board is neither drawn nor
// clickable (#train covers it). A new game, or the end of the run, cancels it. If src/train fails to start, the
// stub stands in (overlays.js shows a placeholder for TRAIN_STUB_S s), so a broken minigame never blocks the game.

const trainCanvas = document.getElementById('train');
const TRAIN_STUB_S = 2.5;
let trainRun = null;                            // { g, game, handle } while the minigame runs · { g, game, stub: t0 } for the stub

function tickTraining(t) {
  if (!st || st.phase !== 'training' || st.over) { if (trainRun) stopTraining(); return; }
  if (trainRun?.game === st && trainRun.g === st.gen) { if (trainRun.stub != null) tickStub(t); return; }
  stopTraining();
  startTraining(t);
}

function startTraining(t) {
  const game = st, g = st.gen, M = modelCard(st, g + 1);
  const cfg = { ...Sim.trainingConfig(st), name: M.name, tier: M.tier };     // the run's own (seeded) name, as on its card
  let handle = null;
  try {
    handle = runTraining(cfg, { canvas: trainCanvas, k: () => k, debug: api.debug, muted: () => isMuted() });
  } catch (err) {
    console.error('[handoff] training failed to start, the stub stands in:', err);
    trainRun = { g, game, stub: t };
    return;
  }
  trainRun = { g, game, handle };
  trainCanvas.classList.add('on');
  view.hover = null; view.drag = null; view.placing = null; view.selected = null;
  console.log(`[handoff] training G${cfg.g}: seed ${cfg.seed} · debt ${cfg.debt.toFixed(4)} · ${cfg.hazards.length} hazards`);
  handle.promise.then(r => {
    if (trainRun?.handle !== handle) return;                     // cancelled, or a new game
    trainRun = null;
    trainCanvas.classList.remove('on');
    setScale(k);                                                  // src/train set it every frame: the board's caches follow k
    if (r.cancelled || st !== game || st.phase !== 'training') return;
    if (api.act.submitTraining(r)) console.log(`[handoff] training G${cfg.g} submitted: s ${r.s.toFixed(3)} · err ${r.err.toFixed(3)} → G${st.gen} card`);
  });
}

// the stand-in: a progress bar, then the stub's s (as the headless policies use)
function tickStub(t) {
  view.training = { g: st.gen + 1, f: Math.min(1, (t - trainRun.stub) / TRAIN_STUB_S) };
  if (t - trainRun.stub < TRAIN_STUB_S || view.hold) return;
  const r = Sim.trainingStub(st, 0.5);
  trainRun = null; view.training = null;
  if (api.act.submitTraining(r)) console.log(`[handoff] training submitted: s=${r.s.toFixed(2)} (stub)`);
}

function stopTraining() {
  const run = trainRun;
  trainRun = null; view.training = null;
  trainCanvas.classList.remove('on');
  run?.handle?.cancel();
}
const trainingLive = () => !!trainRun?.handle;

// =================== scale: fit the board in the window ===================
// fit = CSS px per logical px, k = device px per logical px. The canvas backing store is W·k × H·k device px.

function resize() {
  const dpr = window.devicePixelRatio || 1;
  let fit = Math.min(window.innerWidth / W, window.innerHeight / H);
  let kk = fit * dpr;
  if (PIXEL && kk >= 1) { kk = Math.floor(kk); fit = kk / dpr; }
  const fw = W * kk / dpr, fh = H * kk / dpr, px = v => Math.floor(v * dpr) / dpr + 'px';    // whole device px
  Object.assign(frameEl.style, { width: fw + 'px', height: fh + 'px', left: px((window.innerWidth - fw) / 2), top: px((window.innerHeight - fh) / 2) });
  const root = document.documentElement.style, P = Math.max(2, Math.round(2 * kk)), T = Math.max(1, Math.round(kk));
  root.setProperty('--k', fit);
  root.setProperty('--crtP', P / dpr + 'px'); root.setProperty('--crtGap', (P - T) / dpr + 'px');   // scanline period, gap
  return kk;
}
// the backing store (and every cache keyed on k) follows only once the window stops moving: CSS stretches the old
// canvas meanwhile, so a drag-resize never repaints every cached layer on every step
function applyScale(kk) {
  canvas.width = Math.round(W * kk); canvas.height = Math.round(H * kk);
  k = kk;
  setScale(k);
}
let resizeTimer = 0;
window.addEventListener('resize', () => {
  const kk = resize();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => applyScale(kk), 150);
});
// a devicePixelRatio change with no CSS resize (the window moved to another monitor)
function watchDpr() {
  const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  mq.addEventListener?.('change', () => { applyScale(resize()); watchDpr(); }, { once: true });
}

// =================== draw one frame ===================

const warned = new Set();
function guard(name, fn) {
  g.save();
  try { fn(); }
  catch (err) {
    const key = name + ':' + err.message;
    if (!warned.has(key)) { warned.add(key); console.error(`[handoff] ${name} failed:`, err); }
  }
  finally { g.restore(); }
}

// screen shake (EXTERNAL INCIDENT): whole device pixels, deterministic in t
function shakeOffset(t) {
  const s = view.shake;
  if (!s || view.settings.calm) return [0, 0];                 // reduce flashes: the board holds still
  const e = (t - s.t0) / s.dur;
  if (e < 0 || e >= 1) return [0, 0];
  const a = s.amp * (1 - e) * k;
  return [Math.round(Math.sin(t * 91) * a), Math.round(Math.cos(t * 73) * a)];
}

const perf = { draw: 0, step: 0 };

function render(t, dt) {
  const t0 = performance.now();
  view.now = t;
  setCalm(view.settings.calm);
  const c = { g, st, view, t, dt, k, hit: hits, act: api.act, api, debug: api.debug, late: () => {} };
  if (trainingLive()) {                         // src/train draws its own canvas: the board waits, the overlays stay hidden
    guard('overlays', () => overlays.update(c));
    guard('tutorial', () => tutorial.update(c));
    perf.draw = performance.now() - t0;
    return;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = C.bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const [sx, sy] = shakeOffset(t);
  g.setTransform(k, 0, 0, k, sx, sy);
  g.imageSmoothingEnabled = false;

  // ---------- board ----------
  const late = [];
  c.late = fn => late.push(fn);
  hits.begin();
  if (st) {
    for (const [name, m] of MODULES) guard(name, () => m.draw(c));
    for (const fn of late) guard('late', () => fn(c));
    if (api.debug && view.layout) guard('layout', outline);
  }
  hits.end();
  input?.refresh();                             // a still mouse: hover (and its tooltip) follows this frame's regions

  // ---------- overlays, sound (the CRT scanlines are a CSS layer over the canvas: style.css #crt) ----------
  g.setTransform(k, 0, 0, k, 0, 0);
  guard('overlays', () => overlays.update(c));
  guard('tutorial', () => tutorial.update(c));
  guard('sound', () => overlays.sound(c));
  if (debugPanel && st && !debugEl.hidden) debugPanel.update(st);
  perf.draw = performance.now() - t0;
}

// debug key L: every layout region, outlined and labelled with its owner
function outline() {
  for (const [owner, r] of REGIONS) { box(g, r.x, r.y, r.w, r.h, C.debug); text(g, owner, r.x + 2, r.y + r.h - 2, F.k8, C.debug); }
  for (const r of hits.all()) box(g, r.x, r.y, r.w, r.h, 'rgba(255,0,255,.35)');
}

// =================== loop: fixed-step sim, render every frame ===================

let acc = 0, prev = performance.now(), lastLog = 0;
function frame(ms) {
  const dt = Math.min(0.1, (ms - prev) / 1000);
  prev = ms;
  if (st) speedRules();
  if (st && !view.paused && !view.hold && !view.modal) {
    const t0 = performance.now();
    acc += dt * (view.fast ? 3 : 1) * view.slow;
    while (acc >= SIM_DT) { Sim.step(st, SIM_DT); acc -= SIM_DT; }
    perf.step = performance.now() - t0;
  }
  tickTraining(ms / 1000);
  render(view.clock ?? ms / 1000, dt);
  if (DEBUG && st && ms - lastLog > 10000) {
    lastLog = ms;
    const chips = Rules.laneIds(st).reduce((n, l) => n + st.lanes[l].tasks.length, 0);
    console.log(`[handoff] t=${st.t.toFixed(1)} G${st.gen} chips=${chips} draw ${perf.draw.toFixed(1)}ms step ${perf.step.toFixed(1)}ms`);
  }
  requestAnimationFrame(frame);
}

// fast-forward is 1× outside play, during an alarm or a choice, and while a new lane ramps up (DESIGN-v3 §3b, §3f, §3g)
function speedRules() {
  if (!view.fast) return;
  const why = st.phase !== 'play' ? st.phase : st.alarm ? 'alarm' : st.pendingRetrain || st.pendingChoice ? 'choice'
    : Rules.laneIds(st).some(l => st.lanes[l].open && Rules.laneRamping(st, l)) ? 'ramp' : null;
  if (!why) return;
  view.fast = false;
  if (why === 'ramp') view.toast('a new lane is ramping up: normal speed');
  console.log(`[handoff] speed 1× (${why})`);
}
api.canFast = () => !st ? false : st.phase !== 'play' ? 'not now' : Rules.laneIds(st).some(l => st.lanes[l].open && Rules.laneRamping(st, l))
  ? 'fast-forward is locked while a new lane ramps up' : true;

// =================== input ===================

const handlers = {};
for (const [name, m] of MODULES) for (const [kind, h] of Object.entries(m.input || {})) {
  if (handlers[kind]) console.warn(`[handoff] hit kind "${kind}" claimed twice (${name})`);
  handlers[kind] = h;
}

// =================== debug / dev mode: the panel, cheat keys, and hooks for test/ui-shot.mjs ===================

const debugEl = document.getElementById('debug');
let debugPanel = null;
view.truth = DEBUG;                             // truth marks on chips start on only with ?debug=1 (T toggles)
if (api.debug) setupDev();
function setupDev() {
  if (api.debugActions) return;
  const on = fn => (...a) => st && fn(st, ...a);
  api.debugActions = {
    skipGen: on(Sim.debugSkipGen), addMoney: on(Sim.debugAddMoney), unlockAll: on(Sim.debugUnlockAll),
    addSlot: on(Sim.debugAddSlot), fireEvent: on(Sim.fireEvent), openLanes: on(Sim.debugOpenLanes),
    researchNow: on(st => { Sim.debugResearchNow(st); console.log(`[handoff] dev: research offer banked (${st.research.banked.length})`); }),
    toGen: on((st, gen) => { Sim.debugToGen(st, gen); console.log(`[handoff] dev: jumped to G${st.gen}`); }),
    // training now: the R&D bar full, the report, then TRAIN
    trainNow: on(st => { if (Sim.debugEndGeneration(st)) Sim.ack(st); console.log(`[handoff] dev: training now (phase ${st.phase})`); }),
    togglePanel() { debugEl.hidden = !debugEl.hidden; },
  };
  debugPanel = createDebug(api.debugActions);
  debugEl.hidden = true;                        // D shows it
  window.__handoff = debugHooks();
}

function debugHooks() {
  const halt = () => !st || st.over;
  const ensure = price => { while (price != null && st.money < price) Sim.debugAddMoney(st); };
  // one sim step. Outside play it stops. A pending choice is answered with `choose` (clamped) and the retrain card
  // with KEEP RUNNING when `choose` is given; else either one stops the run, like the old research picker did
  const stepOnce = choose => {
    if (st.phase !== 'play' || st.pendingResearch) return false;
    if (st.pendingChoice) {
      if (choose == null) return false;
      Sim.choose(st, Math.min(choose, st.pendingChoice.choices.length - 1));
    }
    if (st.pendingRetrain) {
      if (choose == null) return false;
      Sim.retrain(st, false);
    }
    Sim.step(st, SIM_DT);
    return true;
  };
  const summary = () => st && { t: +st.t.toFixed(2), gen: st.gen, over: !!st.over, phase: st.phase,
    choice: st.pendingChoice?.eventId ?? null, research: st.research.banked.length, retrain: !!st.pendingRetrain,
    alarm: st.alarm ? +st.alarm.left.toFixed(1) : null, money: Math.round(st.money) };

  const hooks = {
    get st() { return st; }, Sim, Rules, Layout, view, act: api.act, hits, fontsReady, perf,
    newGame: (d, opts) => { newGame(d, opts); return summary(); },
    // ---------- phases (what DEPLOY and TRAIN do) ----------
    deploy() { if (st.phase === 'card') api.act.ack(); return summary(); },
    // report → training → the next card, with the stub's result (or a given s)
    train(s = null) {
      if (st.phase === 'report') api.act.ack();
      if (st.phase === 'training') { api.act.submitTraining(s == null ? Sim.trainingStub(st, 0.5) : { s }); stopTraining(); }
      return summary();
    },
    skipTutorial() { tutorial.skip(api, false); },
    // the live training run's handle (src/train: _ctl.freeze / tick / skipCountdown / advance / draw), or null
    get training() { return trainRun?.handle ?? null; },

    // ---------- time ----------
    hold(on = true) { view.hold = on; },               // the loop keeps drawing but stops stepping the sim
    clock(t) { view.clock = t; },                      // freeze the animation clock (null = real time)
    frame() { render(view.clock ?? performance.now() / 1000, 1 / 60); },
    // step the frozen clock and draw: lets fx-born animations play out without moving the sim
    settle(sec = 1.5, fps = 20) {
      const t0 = view.clock ?? 0;
      for (let i = 1; i <= Math.round(sec * fps); i++) { view.clock = t0 + i / fps; render(view.clock, 1 / fps); }
    },
    advance(sec, { choose } = {}) {
      for (let i = 0; i < Math.round(sec / SIM_DT) && !halt(); i++) if (!stepOnce(choose)) break;
      return summary();
    },
    // run until an fx of one of these types appears (returns it), or maxSec passes (null)
    advanceUntil(types, maxSec = 30, { choose } = {}) {
      const want = [].concat(types);
      for (let i = 0; i < Math.round(maxSec / SIM_DT) && !halt(); i++) {
        const from = st.fxId;
        if (!stepOnce(choose)) break;
        const fresh = st.fx.slice(Math.max(0, st.fx.length - (st.fxId - from)));   // counted, see ui/view.js drain()
        const hit = fresh.find(e => want.includes(e.type));
        if (hit) return hit;
      }
      return null;
    },

    // ---------- set-ups ----------
    toGen(gen) { while (!halt() && st.gen < gen) Sim.debugSkipGen(st); return summary(); },
    endGeneration() { Sim.debugEndGeneration(st); return summary(); },
    finish() { while (!halt()) Sim.debugSkipGen(st); return summary(); },
    money(times = 1) { for (let i = 0; i < times; i++) Sim.debugAddMoney(st); return Math.round(st.money); },
    unlockAll() { Sim.debugUnlockAll(st); },
    labMode(on = true) { st.labMode = on; },           // tests only: a loss is tallied and the run goes on
    forceAttack(lane, type, n = 1) { for (let i = 0; i < n; i++) st.forcedAttacks[lane].push(type); },
    // ids[i] goes on mount i (null = leave it). Buys mounts, money and unlocks as needed; replaces what is there.
    build(lane, ids) {
      const slots = () => Rules.slotsOf(st, lane);
      ids.forEach((id, i) => {
        while (lane !== 'global' && slots().length <= i) {
          ensure(Rules.slotPrice(st, lane));
          if (!Sim.buySlot(st, lane).ok) break;
        }
        const slot = slots()[i];
        if (!id || !slot || slot.layer === id) return;
        if (slot.layer) Sim.sellLayer(st, lane, i);
        if (!st.unlocked.includes(id)) Sim.debugUnlockAll(st);
        ensure(Rules.buyPrice(st, id));
        const r = Sim.placeLayer(st, lane, i, id);
        if (!r.ok) console.warn(`[handoff] build ${lane}/${i} ${id}: ${r.msg}`);
      });
    },
    placeStarter() { for (const lane of Rules.laneIds(st)) hooks.build(lane, ['probe', 'monitor', null, null, 'auditor', 'killswitch']); },
    upgradeTo(lane, slot, level) {
      const s = Rules.slotAt(st, lane, slot);
      while (s?.layer && s.level < level) {
        ensure(Rules.upgradePrice(st, s.layer, s.level));
        if (!Sim.upgrade(st, lane, slot).ok) break;
      }
    },

    // ---------- measuring ----------
    regions: kind => hits.all(kind),
    // logical px → client px (for page.mouse in the harness)
    client(x, y) { const r = canvas.getBoundingClientRect(); return { x: r.left + x * r.width / W, y: r.top + y * r.height / H }; },
    bench(n = 30) {
      const t0 = performance.now(), clk = view.clock ?? 0;
      for (let i = 0; i < n; i++) render(clk + i / 60, 1 / 60);
      view.clock = clk;
      render(clk, 0);
      return +((performance.now() - t0) / (n + 1)).toFixed(2);
    },
    summary,
  };
  return hooks;
}

// =================== boot ===================

cssVars();
applyScale(resize());
watchDpr();
const input = attachInput({ canvas, hits, handlers, api });
overlays.init(api);
fontsReady.then(ok => DEBUG && console.log(`[handoff] fonts ${ok ? 'loaded' : 'fallback'}`));
requestAnimationFrame(frame);
