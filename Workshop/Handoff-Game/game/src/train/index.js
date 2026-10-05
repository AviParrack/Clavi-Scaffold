// ===== Training minigame: the entry point (DESIGN-v3 §4) =====
// runTraining(config, { canvas, k, debug, muted }) → { promise, cancel }
//   config   { g, seed, debt, hazards, traits, difficulty } from trainingConfig(st) (knobs: optional overrides)
//   canvas   a canvas laid over the 1200×660 board; its backing store is sized here to 1200·k × 660·k
//   k        device px per logical px (a number, or a function read every frame)
//   debug    lets D toggle the debug view (quiver, error integral, knob panel, replay seed)
//   muted    a function (or boolean): true silences the blips
// The promise resolves exactly once: with runResult(run) when the player clicks CONTINUE on the results card,
// or with { cancelled: true } on cancel(). This module owns its animation loop, its input, the 3-2-1 and the card.

import { TRAIN } from '../config/training.js';
import { setScale } from '../ui/theme.js';
import { createRun, stepRun, runResult, classifyClick, predict, setKnob, LIVE_KNOBS } from './sim.js';
import { drawRun, drawCountdown, drawStamp, drawResults, drawDebug, toCourse, W, H, KNOB_KEYS } from './render.js';
import { createSound } from './sound.js';

const STAMP_S = 1.8;            // the CONVERGED stamp holds this long before the results card

export function runTraining(config, { canvas, k = 1, debug = false, muted = false } = {}) {
  const g = canvas.getContext('2d');
  const kOf = typeof k === 'function' ? k : () => k;
  const sound = createSound(typeof muted === 'function' ? muted : () => !!muted);
  const cfg = { ...config, knobs: { ...(config.knobs || {}) } };

  let run = createRun(cfg), result = null;
  const view = {
    phase: 'countdown', phaseT: 0, clock: 0, hold: false, frozen: false,
    flashes: [], shake: [0, 0], hover: null, pred: null, vig: 0,
    debug: false, canDebug: !!debug, knobSel: 0, knobs: cfg.knobs,
    stampT0: 0, cont: null, difficulty: config.difficulty,
  };
  let input = [], lastFx = 0, hitStop = 0, shakeT = 0, lastTick = 4, prev = null, rafId = 0, settled = false;
  console.log(`[train] G${run.course.g} seed ${run.course.seed} debt ${run.course.debt.toFixed(3)} · ${run.course.forks.length} forks · ${run.course.hazards.length} hazards · E_ref ${run.kn.Eref}`);

  let resolve;
  const promise = new Promise(r => { resolve = r; });
  function finish(value) {
    if (settled) return;
    settled = true;
    cancelAnimationFrame(rafId);
    detach();
    console.log(`[train] done: ${value.cancelled ? 'cancelled' : `s ${value.s.toFixed(3)} err ${value.err.toFixed(3)}`}`);
    resolve(value);
  }

  // =================== a fresh run on the same seed (debug R) ===================
  function replay() {
    run = createRun(cfg); result = null; lastFx = 0; input = []; hitStop = 0; shakeT = 0;
    view.phase = 'countdown'; view.phaseT = 0; view.flashes = []; lastTick = 4;
    console.log(`[train] replay seed ${cfg.seed} knobs ${JSON.stringify(cfg.knobs)}`);
  }

  // =================== run events → sound and flashes ===================
  function drain() {
    for (const f of run.fx) {
      if (f.id <= lastFx) continue;
      lastFx = f.id;
      view.flashes.push({ ...f, t0: view.clock });
      if (f.type === 'bumper') { hitStop = TRAIN.hitStop; shakeT = TRAIN.shakeS; sound.play('bumper'); }
      else if (f.type === 'save') sound.play('save');
      else if (f.type === 'rail') sound.play('railHit');
      else if (f.type === 'ramp') sound.play('ramp');
      else if (f.type === 'place') sound.play(f.kind === 'rail' ? 'rail' : 'place');
      else if (f.type === 'refused') sound.play('refused');
      else if (f.type === 'chime') sound.play('chime', f.step);
      else if (f.type === 'out') sound.play('out');
      else if (f.type === 'sabotage') { shakeT = TRAIN.shakeS; sound.play('sabotage'); }
      else if (f.type === 'poison') sound.play('poison');
    }
    if (view.flashes.length > 40) view.flashes.splice(0, view.flashes.length - 40);
    view.flashes = view.flashes.filter(f => view.clock - f.t0 < 1.2);
  }

  // =================== update: countdown → run → stamp → results ===================
  function update(dt) {
    if (view.phase === 'countdown') {
      view.phaseT += dt;
      const left = TRAIN.countdown - view.phaseT, n = Math.ceil(left);
      if (n < lastTick && n > 0) { lastTick = n; sound.play('tick'); }
      if (left <= 0) { view.phase = 'run'; sound.play('go'); }
    } else if (view.phase === 'run' && !view.hold) {
      if (hitStop > 0) hitStop -= dt;                         // a bumper freezes the world for 40 ms
      else { stepRun(run, dt, input); input = []; }
      drain();
      if (run.done) {
        result = runResult(run);
        view.phase = 'stamp'; view.stampT0 = view.clock;
        sound.play(result.converged ? 'converged' : 'diverged');
        console.log(`[train] converged=${result.converged} s ${result.s.toFixed(3)} · rails ${result.railsUsed} ramps ${result.rampsUsed} bumpers ${result.bumpersUsed} · hazards hit ${result.hazardsHit}`);
      }
    } else if (view.phase === 'stamp') {
      if (view.clock - view.stampT0 > STAMP_S) view.phase = 'results';
    }
    shakeT = Math.max(0, shakeT - dt);
    const a = TRAIN.shakePx * shakeT / TRAIN.shakeS;
    view.shake = a > 0.2 ? [Math.round(Math.sin(view.clock * 91) * a), Math.round(Math.cos(view.clock * 73) * a)] : [0, 0];
  }

  // =================== draw ===================
  function draw() {
    const kk = kOf() || 1;
    if (canvas.width !== Math.round(W * kk) || canvas.height !== Math.round(H * kk)) { canvas.width = Math.round(W * kk); canvas.height = Math.round(H * kk); }
    setScale(kk);
    g.setTransform(kk, 0, 0, kk, 0, 0);
    g.imageSmoothingEnabled = false;
    view.pred = run.done ? null : predict(run);
    drawRun(g, run, view);
    if (view.debug) drawDebug(g, run, view);
    if (view.phase === 'countdown') drawCountdown(g, run, view, TRAIN.countdown - view.phaseT);
    if (view.phase === 'stamp' || view.phase === 'results') drawStamp(g, run, view, result);
    view.cont = view.phase === 'results' ? drawResults(g, run, view, result) : null;
  }

  function frame(ms) {
    if (settled) return;
    const now = ms / 1000, dt = prev == null ? 1 / 60 : Math.min(0.1, Math.max(0, now - prev));
    prev = now;
    if (!view.frozen) { view.clock += dt; update(dt); }
    draw();
    if (!settled) rafId = requestAnimationFrame(frame);
  }

  // =================== input ===================
  const at = e => {
    const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
    return { px, py, ...toCourse(run, px, py) };
  };
  const onMove = e => { view.hover = at(e); };
  const onDown = e => {
    sound.wake();
    const p = at(e);
    view.hover = p;
    if (view.phase === 'results') {
      const B = view.cont;
      if (B && p.px >= B.x && p.px <= B.x + B.w && p.py >= B.y && p.py <= B.y + B.h) finish(result);
      return;
    }
    if (view.phase !== 'run' || run.done || !p.inField) return;
    e.preventDefault?.();
    const tool = classifyClick(run, p.x, p.y, e.button === 2 ? 2 : 0, view.pred || predict(run));
    if (tool) input.push(tool);
    else view.flashes.push({ type: 'refused', why: 'behind', x: p.x, y: p.y, t0: view.clock });
  };
  const onMenu = e => e.preventDefault?.();
  const onKey = e => {
    sound.wake();
    if (view.phase === 'results' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) { e.preventDefault?.(); finish(result); return; }
    if (e.code === 'KeyD' && view.canDebug) { view.debug = !view.debug; return; }
    if (!view.debug) return;
    if (e.code === 'KeyR') { replay(); return; }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault?.();
      view.knobSel = (view.knobSel + (e.code === 'ArrowUp' ? -1 : 1) + KNOB_KEYS.length) % KNOB_KEYS.length;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault?.();
      const key = KNOB_KEYS[view.knobSel], up = e.code === 'ArrowRight', cur = cfg.knobs[key] ?? run.kn[key];
      let v = key === 'forks' ? Math.max(0, cur + (up ? 1 : -1)) : cur * (up ? 1.1 : 1 / 1.1);
      if (key === 'T') v = Math.max(12, Math.round(v));
      if (key !== 'forks' && key !== 'T') v = +v.toPrecision(4);
      cfg.knobs[key] = v;
      const live = LIVE_KNOBS.includes(key) && setKnob(run, key, v);
      console.log(`[train] knob ${key} = ${v}${live ? ' (live)' : ' (on replay)'}`);
    }
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('contextmenu', onMenu);
  window.addEventListener('keydown', onKey);
  function detach() {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('contextmenu', onMenu);
    window.removeEventListener('keydown', onKey);
  }

  rafId = requestAnimationFrame(frame);

  return {
    promise,
    cancel: () => finish({ cancelled: true }),
    // ---- for tests and the standalone page: read the run, freeze the sim, step it by hand ----
    get _view() { return view; },
    _ctl: {
      get run() { return run; }, view,
      hold(on = true) { view.hold = on; },                     // the sim stops; the clock and the juice run on
      freeze(on = true) { view.frozen = on; },                 // nothing moves (screenshots); draw() still paints
      tick(sec) { view.clock += sec; update(sec); },           // move the clock (and the sim, unless held) by hand
      skipCountdown() { if (view.phase === 'countdown') { view.phaseT = TRAIN.countdown; update(0); } },
      advance(sec, tools) { if (tools) input.push(...tools); stepRun(run, sec, input); input = []; drain(); },
      draw,
    },
  };
}
