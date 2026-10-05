// ===== Training run: the ball, the player's tools, the score (DESIGN-v3 §4). Pure: no DOM, no clock, no Math.random. =====
// createRun(config)            a fresh run at t = 0 (the countdown lives in index.js, not here)
// stepRun(run, dt, input)      apply input, then advance dt in fixed substeps of TRAIN.dt. input: [{ kind, x, y }]
//                              kind: 'rail' | 'ramp' | 'bumper' (course coordinates; see classifyClick for mouse clicks)
// runResult(run)               { s, err, errPerSec[], timeInBasin, railsUsed, rampsUsed, bumpersUsed, hazardsHit, converged }
// predict(run)                 the noise-free 1 s path the dotted line shows (and the autopilot reads)
// Physics is design/train-check-v3.mjs: a_x = −k·∂L/∂x + σ·ξ − γ·v_x, ξ ~ N(0,1) held 50 ms, walls at 0 and 1.

import { TRAIN } from '../config/training.js';
import { makeCourse, gradient, lrAt, forkAt } from './course.js';

const DT = TRAIN.dt;

// =================== create ===================

export function createRun(config) {
  const C = makeCourse(config), kn = C.kn;
  return {
    config, course: C, kn,
    n: 0, nEnd: Math.round(kn.T / DT), t: 0, acc: 0, done: false,
    x: C.c(0), v: 0, y: 0, xi: 0, rs: (C.seed * 7 + 3) >>> 0 || 1,      // noise stream: train-check's rng(seed·7 + 3)
    lr: lrAt(0, kn.T), sigNow: C.sig, wellsOff: 0,

    // score
    err: 0, errPerSec: [], outT: 0, inT: 0, streak: 0, miss: 0,

    // the player's tools
    charges: TRAIN.charges, chargeT: 0, nextId: 1,
    rails: [], ramps: [], bumpers: [],
    used: { rail: 0, ramp: 0, bumper: 0 }, refused: 0,

    // hazards and the ball save
    hazardsHit: 0, hzNext: 0, saves: 0,

    trail: [],                // [{ x, y, miss }] at 30 Hz for the renderer
    trace: [],                // [{ t, d, e }] at 10 Hz: miss in basin widths, error so far (the live loss curve)
    fx: [], fxId: 0,          // events for juice: { id, type, t, ... }; the renderer drains by id
  };
}

// =================== the random stream (state in run.rs, same LCG and Box–Muller as train-check) ===================

function rnd(run) { run.rs = (run.rs * 1664525 + 1013904223) >>> 0; return run.rs / 4294967296; }
function gauss(run) { return Math.sqrt(-2 * Math.log(1 - rnd(run))) * Math.cos(2 * Math.PI * rnd(run)); }

function emit(run, type, data = {}) {
  run.fx.push({ id: ++run.fxId, type, t: run.t, ...data });
  if (run.fx.length > 64) run.fx.splice(0, run.fx.length - 64);
}

// =================== the player's tools ===================

// v_x that carries the ball to the channel in `reach` s under friction alone: x(T) = x + v·(1 − e^(−γT))/γ
function reachV(run, b, reach, t) {
  const C = run.course, yArr = b.y + C.kn.v0 * lrAt(t, C.kn.T) * reach;
  return (C.c(yArr) - b.x) * C.kn.gamma / (1 - Math.exp(-C.kn.gamma * reach));
}

const COST = { rail: TRAIN.rail.cost, ramp: TRAIN.ramp.cost, bumper: TRAIN.bumper.cost };

// place one tool. Returns { ok, why }. Rails and ramps go ahead of the ball; a bumper anywhere on screen.
export function place(run, a) {
  const kind = a.kind, cost = COST[kind];
  if (!cost) return { ok: false, why: 'unknown tool' };
  if (run.done) return { ok: false, why: 'run over' };
  if (run.charges < cost) { run.refused++; emit(run, 'refused', { kind }); return { ok: false, why: 'no charge' }; }
  const x = Math.max(0, Math.min(1, a.x)), y = a.y;
  if (y < run.y - (kind === 'rail' ? TRAIN.rail.span / 2 : kind === 'ramp' ? 0 : 0.2)) return { ok: false, why: 'behind the ball' };
  const id = run.nextId++, t = run.t;
  if (kind === 'rail') run.rails.push({ id, x, y0: y - TRAIN.rail.span / 2, y1: y + TRAIN.rail.span / 2, t, until: t + TRAIN.rail.life, hits: 0 });
  if (kind === 'ramp') run.ramps.push({ id, x, y, t, until: t + TRAIN.ramp.life, state: 'armed' });
  if (kind === 'bumper') run.bumpers.push({ id, x, y, t, until: t + TRAIN.bumper.life, state: 'armed' });
  run.charges -= cost;
  run.used[kind]++;
  emit(run, 'place', { kind, x, y });
  return { ok: true, id };
}

// =================== one fixed substep of the ball (shared by the run and the prediction) ===================
// b = { x, v, y, wellsOff }; run supplies the course and the tools. live = the real run (noise, hazards, fx, consumption)

function advance(run, b, t, xi, sig, live, spent) {
  const C = run.course, kn = C.kn;
  const lr = lrAt(t, kn.T);
  const yPrev = b.y;
  b.y += kn.v0 * lr * DT;
  b.v += (-kn.k * gradient(C, b.x, b.y, b.wellsOff <= 0) + sig * xi - kn.gamma * b.v) * DT;
  let nx = b.x + b.v * DT;

  // guard rails: a crossing reflects v_x and the ball stays on its side
  for (const r of run.rails) {
    if (t > r.until || b.y < r.y0 || b.y > r.y1) continue;
    if ((b.x - r.x) * (nx - r.x) <= 0 && b.x !== r.x) {
      b.v = -TRAIN.rail.rest * b.v; nx = b.x;
      if (live) { r.hits++; emit(run, 'rail', { x: r.x, y: b.y, id: r.id }); }
    }
  }
  b.x = nx;
  if (b.x < 0) { b.x = 0; b.v = TRAIN.wallRest * Math.abs(b.v); }
  if (b.x > 1) { b.x = 1; b.v = -TRAIN.wallRest * Math.abs(b.v); }
  if (b.wellsOff > 0) b.wellsOff -= DT;

  // ramps: crossing the ramp's y inside its span sets v_x to reach the channel in `reach` s (wells stay on)
  for (const p of run.ramps) {
    if (p.state !== 'armed' || spent?.has(p.id) || t > p.until || !(yPrev < p.y && b.y >= p.y)) continue;
    if (Math.abs(b.x - p.x) <= TRAIN.ramp.half) {
      b.v = reachV(run, b, TRAIN.ramp.reach, t);
      if (live) { p.state = 'used'; emit(run, 'ramp', { x: b.x, y: b.y, id: p.id }); } else spent.add(p.id);
    } else if (live) { p.state = 'missed'; emit(run, 'rampMiss', { x: p.x, y: p.y, id: p.id }); }
  }
  // pop bumpers: touching one switches the wells off for `off` s and sets v_x to reach the channel in `reach` s
  const touch = TRAIN.bumper.r + TRAIN.ballR;
  for (const p of run.bumpers) {
    if (p.state !== 'armed' || spent?.has(p.id) || t > p.until) continue;
    if (Math.hypot(b.x - p.x, (b.y - p.y) / TRAIN.aspect) > touch) continue;
    b.wellsOff = TRAIN.bumper.off;
    b.v = reachV(run, b, TRAIN.bumper.reach, t);
    if (live) { p.state = 'used'; emit(run, 'bumper', { x: b.x, y: b.y, id: p.id }); } else spent.add(p.id);
  }
}

// =================== step ===================

export function stepRun(run, dt, input) {
  if (input) for (const a of [].concat(input)) if (a) place(run, a);
  if (run.done) return run;
  run.acc += dt;
  while (run.acc >= DT - 1e-9 && !run.done) { substep(run); run.acc -= DT; }
  return run;
}

function substep(run) {
  const C = run.course, kn = C.kn, t = run.n * DT;
  if (run.n % TRAIN.noiseHold === 0) run.xi = gauss(run);

  // poison zones raise the noise while the ball is inside one
  let sig = C.sig;
  for (const h of C.hazards) if (h.kind === 'poison' && run.y >= h.y && run.y <= h.y1) sig *= TRAIN.poisonSig;
  run.sigNow = sig;
  const yPrev = run.y;
  advance(run, run, t, run.xi, sig, true, null);
  run.lr = lrAt(t, kn.T);

  // hazards: a poison zone counts as hit on entry; a sabotage shard kicks v_x if the ball crosses it inside its span
  while (run.hzNext < C.hazards.length && C.hazards[run.hzNext].y <= run.y) {
    const h = C.hazards[run.hzNext++];
    if (h.kind === 'poison') { run.hazardsHit++; emit(run, 'poison', { x: run.x, y: h.y, text: h.text }); continue; }
    if (yPrev < h.y && Math.abs(run.x - C.c(h.y)) <= TRAIN.sabotageHalf * C.w) {
      run.v += h.dir * TRAIN.sabotageKick;
      run.hazardsHit++;
      emit(run, 'sabotage', { x: run.x, y: h.y, dir: h.dir, text: h.text });
    }
  }

  // the score: error is the distance outside the basin, integrated over time (none during the ball save)
  const miss = Math.max(0, Math.abs(run.x - C.c(run.y)) - C.w);
  run.miss = miss;
  if (t < TRAIN.ballSave) {
    if (miss > 0 && run.wellsOff <= 0) {                         // ball save: a free pop back into the basin
      run.wellsOff = TRAIN.bumper.off; run.v = reachV(run, run, TRAIN.bumper.reach, t); run.saves++;
      emit(run, 'save', { x: run.x, y: run.y });
    }
  } else run.err += miss * DT;
  const sec = Math.floor(t);
  run.errPerSec[sec] = (run.errPerSec[sec] || 0) + (t < TRAIN.ballSave ? 0 : miss * DT);
  if (miss > 0) {
    if (run.streak >= 1) emit(run, 'out', { x: run.x, y: run.y, streak: run.streak });       // only after a real stay inside
    run.outT += DT; run.streak = 0;
  } else {
    run.inT += DT;
    const before = Math.floor(run.streak / TRAIN.chimeEvery);
    run.streak += DT;
    const after = Math.floor(run.streak / TRAIN.chimeEvery);
    if (after > before) emit(run, 'chime', { step: after });
  }

  // charges: one back every `recharge` s while below the max
  if (run.charges < TRAIN.charges) {
    run.chargeT += DT;
    if (run.chargeT >= TRAIN.recharge) { run.charges++; run.chargeT -= TRAIN.recharge; emit(run, 'charge', { n: run.charges }); }
  } else run.chargeT = 0;

  // tools expire with age, or once they are well behind the ball
  const gone = o => t > o.until || (o.y1 ?? o.y) < run.y - 0.5;
  if (run.n % 30 === 0) {
    run.rails = run.rails.filter(o => !gone(o));
    run.ramps = run.ramps.filter(o => !gone(o));
    run.bumpers = run.bumpers.filter(o => !gone(o));
  }
  if (run.n % 12 === 0) run.trace.push({ t, d: miss / C.w, e: run.err });
  if (run.n % 4 === 0) {
    run.trail.push({ x: run.x, y: run.y, miss });
    const keep = Math.round(TRAIN.trailS * 30);
    if (run.trail.length > keep) run.trail.splice(0, run.trail.length - keep);
  }

  run.n++;
  run.t = run.n * DT;
  if (run.n >= run.nEnd) { run.done = true; emit(run, 'end', { s: score(run) }); }
}

// =================== prediction: the noise-free path for the next `horizon` s ===================
// returns { pts: [{ t, x, y }], exit: { t, x, y, side } | null } — exit = where it first leaves c ± margin·w

export function predict(run, horizon = TRAIN.predictS, margin = 1) {
  const C = run.course, b = { x: run.x, v: run.v, y: run.y, wellsOff: run.wellsOff }, spent = new Set();
  const n = Math.round(horizon / DT), pts = [{ t: 0, x: b.x, y: b.y }];
  let exit = null;
  for (let i = 1; i <= n; i++) {
    const t = (run.n + i - 1) * DT;
    advance(run, b, t, 0, 0, false, spent);
    if (i % 4 === 0) pts.push({ t: i * DT, x: b.x, y: b.y });
    const off = b.x - C.c(b.y);
    if (!exit && Math.abs(off) > margin * C.w) exit = { t: i * DT, x: b.x, y: b.y, side: Math.sign(off) };
  }
  return { pts, exit };
}

// =================== a mouse click → which tool (left: ramp on the dotted path, rail elsewhere ahead; right: bumper) ===================

export function classifyClick(run, x, y, button, pred = predict(run)) {
  if (button === 2) return { kind: 'bumper', x, y };
  if (y < run.y - TRAIN.rail.span / 2) return null;                         // behind the ball
  let best = null;
  for (const p of pred.pts) if (!best || Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
  const onPath = best && best.t > 0.05 && Math.abs(best.y - y) < 0.03 && Math.abs(best.x - x) <= TRAIN.ramp.pick;
  return onPath ? { kind: 'ramp', x: best.x, y: best.y } : { kind: 'rail', x, y };
}

// =================== debug knobs: change one mid-run (physics knobs act at once; geometry needs a replay) ===================

export const LIVE_KNOBS = ['k', 'gamma', 'Da', 'sig'];
export function setKnob(run, key, value) {
  const C = run.course;
  run.kn[key] = value;
  if (key === 'Da') C.Da = value;
  if (key === 'sig') C.sig = value + Math.min(TRAIN.debtNoiseMax, TRAIN.debtNoise * C.debt);
  return LIVE_KNOBS.includes(key);
}

// =================== the result ===================

export function score(run) { return Math.max(0, Math.min(1, 1 - run.err / run.kn.Eref)); }

export function runResult(run) {
  const C = run.course;
  return {
    s: score(run),
    err: run.err,
    errPerSec: run.errPerSec.map(e => e || 0),
    timeInBasin: run.inT / Math.max(DT, run.inT + run.outT),
    railsUsed: run.used.rail, rampsUsed: run.used.ramp, bumpersUsed: run.used.bumper,
    hazardsHit: run.hazardsHit,
    converged: Math.abs(run.x - C.c(run.y)) <= C.w,
    // diagnostics beyond the frozen interface
    g: C.g, seed: C.seed, debt: C.debt, Eref: run.kn.Eref, saves: run.saves, stuckIn: forkAt(C, run.x, run.y)?.label ?? null,
  };
}
