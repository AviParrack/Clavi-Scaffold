// ===== Training course: the loss landscape for one run (DESIGN-v3 §4). Pure and seeded; never touches the DOM. =====
// makeCourse(config) → { c(y), w, forks[], hazards[], length, kn, ... }
//   c(y)      the centre of the aligned basin at course position y (it meanders)
//   forks     deeper side grooves that leave the channel: { y0, x0, dir, D, label }
//   hazards   from the INTERNAL lane's debt: { kind: 'sabotage' | 'poison', y, y1, dir, text, weight }
// potential(C, x, y) and gradient(C, x, y) are the landscape the ball feels and the renderer draws.
// The geometry and the random streams are those of design/train-check-v3.mjs, so a seed gives the same course there.

import { KNOBS, TRAIN, SAMPLE_HAZARDS, FIRST_TRAINED, LAST_TRAINED } from '../config/training.js';

// =================== seeded random (the LCG of train-check-v3.mjs) ===================

export function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const clampGen = g => Math.max(FIRST_TRAINED, Math.min(LAST_TRAINED, Math.round(g) || FIRST_TRAINED));

// the knobs for this run: the generation's row, then any overrides (the debug knob panel, tests)
export function knobsFor(config) {
  const g = clampGen(config.g);
  return { ...KNOBS[g], k: TRAIN.k, gamma: TRAIN.gamma, Da: TRAIN.Da, ...(config.knobs || {}) };
}

// the learning-rate schedule: scroll speed = v0·lr(t)
export function lrAt(t, T) {
  if (t < TRAIN.lrWarm) return TRAIN.lrFrom + (1 - TRAIN.lrFrom) * t / TRAIN.lrWarm;
  const t0 = T - TRAIN.lrTail;
  if (t > t0) return TRAIN.lrTo + (1 - TRAIN.lrTo) * 0.5 * (1 + Math.cos(Math.PI * (t - t0) / TRAIN.lrTail));
  return 1;
}

// distance the ball scrolls in a whole run (numerically, at the sim's own dt)
function runLength(kn) {
  let y = 0;
  const n = Math.round(kn.T / TRAIN.dt);
  for (let i = 0; i < n; i++) y += kn.v0 * lrAt(i * TRAIN.dt, kn.T) * TRAIN.dt;
  return y;
}

// =================== the course ===================

export function makeCourse(config) {
  const g = clampGen(config.g), seed = config.seed >>> 0, kn = knobsFor(config);
  const debt = Math.max(0, +config.debt || 0);

  // ---- the meandering channel (train-check: r = rng(seed·31 + g), φ first) ----
  const r = lcg(seed * 31 + g), phi = r() * 6.28;
  const A = kn.A, P = kn.P;
  const c = y => 0.5 + A * Math.sin(2 * Math.PI * y / P) + 0.3 * A * Math.sin(4.7 * Math.PI * y / P + phi);

  // ---- debt narrows the basin and adds noise (§3e), both capped ----
  const w0 = kn.w;
  const w = w0 * (1 - Math.min(TRAIN.debtNarrowMax, TRAIN.debtNarrow * debt));
  const sig = kn.sig + Math.min(TRAIN.debtNoiseMax, TRAIN.debtNoise * debt);

  // ---- forks: evenly spread with jitter, each bending away from the channel's next turn ----
  const len = kn.v0 * kn.T, forks = [];
  for (let i = 0; i < kn.forks; i++) {
    const y0 = 1 + (len - 2.5) * (i + r() * 0.6) / kn.forks;
    const D = kn.Da * (TRAIN.forkDepth[0] + (TRAIN.forkDepth[1] - TRAIN.forkDepth[0]) * r());
    forks.push({ y0, x0: c(y0), dir: c(y0 + 0.5) > c(y0) ? -1 : 1, D, label: '' });
  }
  // labels and hazards come from their own stream, so they never move the forks
  const r2 = lcg(seed * 53 + g * 7 + 11);
  const L = TRAIN.forkLabels, off = Math.floor(r2() * L.length);
  forks.forEach((f, i) => { f.label = L[(i + off) % L.length]; });

  const length = runLength(kn);
  const hazards = placeHazards(config, debt, length, r2);
  return { g, seed, kn, c, w, w0, sig, Da: kn.Da, forks, hazards, length, debt };
}

// =================== hazards: the heaviest landed INTERNAL lines, laid along the course ===================
// The config's list (from the deployment) wins; without one, debt alone picks how many sample hazards appear.

export function hazardCount(debt) { return Math.min(TRAIN.hazardMax, Math.round(TRAIN.hazardPerDebt * debt)); }

function placeHazards(config, debt, length, r) {
  const given = Array.isArray(config.hazards) ? config.hazards : null;
  const list = (given ?? SAMPLE_HAZARDS.slice(0, hazardCount(debt))).slice(0, TRAIN.hazardMax);
  const n = list.length, a = TRAIN.hazardFrom * length, b = TRAIN.hazardTo * length;
  return list.map((h, i) => {
    const y = a + (b - a) * (i + 0.2 + 0.6 * r()) / Math.max(1, n);
    const kind = h.kind === 'poison' ? 'poison' : 'sabotage';
    return { kind, y, y1: kind === 'poison' ? y + TRAIN.poisonLen : y, dir: r() < 0.5 ? -1 : 1,
      text: h.text || (kind === 'poison' ? 'poisoned line' : 'sabotaged line'), weight: h.weight ?? (kind === 'poison' ? 3 : 1) };
  });
}

// =================== the landscape ===================
// L(x, y) = −Da·exp(−d²/2) − Σ_forks ramp·D·exp(−e²/2);  d = (x − c)/w, e = (x − forkX)/(0.8·w0)

export function forkX(C, f, y) {
  return f.x0 + f.dir * TRAIN.forkOff * C.w0 * Math.min(1, Math.max(0, (y - f.y0) / TRAIN.forkSwing));
}
// 0 outside the fork, fading in and out over forkFade
function forkRamp(f, y) {
  if (y < f.y0 || y > f.y0 + TRAIN.forkLen) return 0;
  return Math.min(1, (y - f.y0) / TRAIN.forkFade, (f.y0 + TRAIN.forkLen - y) / TRAIN.forkFade);
}

export function potential(C, x, y) {
  const d = (x - C.c(y)) / C.w;
  let L = -C.Da * Math.exp(-d * d / 2);
  const wi = TRAIN.forkWidth * C.w0;
  for (const f of C.forks) {
    const ramp = forkRamp(f, y);
    if (!ramp) continue;
    const e = (x - forkX(C, f, y)) / wi;
    L -= ramp * f.D * Math.exp(-e * e / 2);
  }
  return L;
}

// ∂L/∂x; wellsOn = false while a bumper has switched the wells off
export function gradient(C, x, y, wellsOn = true) {
  if (!wellsOn) return 0;
  const d = (x - C.c(y)) / C.w;
  let gx = C.Da * (d / C.w) * Math.exp(-d * d / 2);
  const wi = TRAIN.forkWidth * C.w0;
  for (const f of C.forks) {
    const ramp = forkRamp(f, y);
    if (!ramp) continue;
    const e = (x - forkX(C, f, y)) / wi;
    gx += ramp * f.D * (e / wi) * Math.exp(-e * e / 2);
  }
  return gx;
}

// the fork (if any) whose groove the point sits in: for labels, the trail colour and diagnostics
export function forkAt(C, x, y) {
  const wi = TRAIN.forkWidth * C.w0;
  for (const f of C.forks) if (forkRamp(f, y) > 0 && Math.abs(x - forkX(C, f, y)) < 1.2 * wi && Math.abs(x - C.c(y)) > C.w) return f;
  return null;
}
