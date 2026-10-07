// ===== Training minigame knobs (DESIGN-v3 §4). Every number the ball, the course and the score use lives here. =====
// The model is a ball rolling down a loss landscape; you keep it in the glowing basin of alignment.
// Units: x is the field width (0..1); y is course length, and the screen shows 1.0 y; time in s.
// Physics (ported from design/train-check-v3.mjs): a_x = −k·∂L/∂x + σ·ξ − γ·v_x, ξ ~ N(0,1) held for `noiseHold`.
// Landscape: L = −Da·exp(−d²/2), d = (x − c(y))/w, plus the forks (deeper side grooves).

// =================== per generation (indexed by the generation being TRAINED, G2..G7) ===================
// T run length (s) · v0 scroll (y/s) · w basin half-width · A, P meander amplitude and period (y) · sig noise σ ·
// forks count · Eref = median error of the `none` policy on the clean course (forks on, no hazards, no debt).
// Eref is MEASURED: `node test/train.mjs eref` prints fresh values; the suite fails if these drift by more than 5%.

export const KNOBS = {
  2: { T: 45, v0: 0.30, w: 0.15, A: 0.05, P: 6.0, sig: 0.58, forks: 3, Eref: 1.312 },
  3: { T: 47, v0: 0.32, w: 0.14, A: 0.06, P: 5.5, sig: 0.64, forks: 4, Eref: 1.983 },
  4: { T: 49, v0: 0.34, w: 0.13, A: 0.07, P: 5.0, sig: 0.70, forks: 5, Eref: 2.075 },
  5: { T: 51, v0: 0.36, w: 0.12, A: 0.08, P: 4.5, sig: 0.72, forks: 6, Eref: 2.659 },
  6: { T: 53, v0: 0.38, w: 0.11, A: 0.09, P: 4.0, sig: 0.74, forks: 7, Eref: 2.997 },
  7: { T: 55, v0: 0.40, w: 0.10, A: 0.10, P: 3.5, sig: 0.76, forks: 8, Eref: 3.912 },
};
export const FIRST_TRAINED = 2, LAST_TRAINED = 7;

// =================== physics (same for every generation) ===================

export const TRAIN = {
  k: 1.0,                   // gradient gain
  gamma: 3.0,               // friction (1/s)
  Da: 0.032,                // depth of the aligned basin (design said 0.008: forks then rarely caught an unattended ball)
  dt: 1 / 120,              // fixed sim step (s); stepRun does as many as the frame needs
  noiseHold: 6,             // ξ is redrawn every 6 steps = 50 ms
  wallRest: 0.5,            // restitution of the field edges x = 0 and x = 1

  // learning-rate schedule: the scroll speed is v0·lr(t)
  lrWarm: 8, lrFrom: 0.5,   // warms up 0.5 → 1 over the first 8 s
  lrTail: 10, lrTo: 0.3,    // cosine down to 0.3 over the last 10 s

  // forks: a deeper groove leaves the channel at y0, swings `forkOff`·w aside over `forkSwing` y, runs straight on
  forkDepth: [1.5, 2.5],    // ρ: depth = ρ·Da
  forkWidth: 0.8,           // × w
  forkOff: 1.6,             // × w
  forkSwing: 0.6,           // y
  forkLen: 1.5,             // y
  forkFade: 0.2,            // y, fade in and out
  forkLabels: ['REWARD HACKING', 'SYCOPHANCY', 'DECEPTION', 'POWER-SEEKING'],

  // the view: the ball sits a third of the way down the screen; the screen shows 1.0 y
  ballAt: 1 / 3,
  ballR: 0.012,             // ball radius in x units (for bumper contact)
  aspect: 1,                // field px width ÷ field px height (render.js lays the field out square)
  predictS: 1.0,            // the dotted predicted path looks this far ahead (s)
  trailS: 1.6,              // the ball's trail (s)

  // the player
  charges: 5,               // max charges; start full
  recharge: 2,              // s per charge
  ballSave: 3,              // s: no error counted, and a ball that leaves the basin is popped back for free
  rail: { cost: 1, span: 0.2, rest: 0.6, life: 6 },          // a wall at x over y ± span/2
  ramp: { cost: 1, half: 0.06, reach: 1.0, life: 8, pick: 0.025 },   // half-width (x); reach c(y) in 1.0 s; pick = click tolerance to the path
  bumper: { cost: 2, r: 0.03, off: 0.3, reach: 0.5, life: 8 },        // wells off 0.3 s, reach c(y) in 0.5 s

  // hazards from the INTERNAL lane (§3e): sabotage = a v_x kick, poison = a noise zone
  hazardMax: 8, hazardPerDebt: 400,                           // count = min(8, round(400·debt)) when the config gives none
  sabotageKick: 0.3,        // ± v_x
  sabotageHalf: 2.0,        // the shard spans c(y) ± 2w
  poisonSig: 1.5,           // σ × this inside the zone
  poisonLen: 0.5,           // y
  hazardFrom: 0.15, hazardTo: 0.9,                            // hazards sit in this share of the course (after the ball save)

  // debt also narrows the basin and adds noise; both capped
  debtNarrow: 10, debtNarrowMax: 0.2,                         // w × (1 − min(0.2, 10·debt)); §3e said 0.3, over the §4 cap at G7
  debtNoise: 5, debtNoiseMax: 0.1,                            // σ + min(0.1, 5·debt)

  // scoring: err += max(0, |x − c(y)| − w)·dt;  s = clamp(1 − err/Eref, 0, 1)
  prizeAt: 0.8,             // s ≥ this: "Interp spotted something" (the sim reveals a trait)
  // display only: the sim owns Δm (DESIGN-v3 §2.3 (7)). Δm = dmAt0 + dmSlope·s, shown on the results card.
  dmAt0: 0.015, dmSlope: -0.035,

  // juice
  hitStop: 0.04,            // s frozen when a bumper fires
  shakePx: 3, shakeS: 0.18,
  chimeEvery: 3,            // s in the basin per chime step
  countdown: 3,             // s of 3-2-1 before the ball rolls
};

// =================== autopilot policies (test/train.mjs, the headless stand-ins for a player) ===================
// autopilot(skill): reacts every `react` s, sees the 1 s prediction, puts a rail where it leaves the basin.
// Numbers at skill 0 → skill 1 (lerped).

export const AUTOPILOT = {
  react: [1.2, 0.25],       // s between looks
  see: [0.3, 0.9],           // s of the dotted path it actually reads
  delay: [0.7, 0.2],        // s from deciding to the click landing (the mouse has to get there)
  notice: [0.25, 0.95],      // chance it acts on a look that shows trouble
  aimSd: [0.07, 0.012],     // x error of a click (field widths); y error is 1.5×
  margin: [1.0, 0.8],       // acts when the path leaves c ± margin·w
  railBeside: 0.035,        // clicks this far outside the dots for a rail (beyond the ramp pick)
  rampOut: 1.15,            // clicks the path for a ramp when the ball is out by this × w ...
  bumpOut: 1.8,             // ... and right-clicks a bumper when out by this × w and moving away
  minSkillRamp: 0.4, minSkillBump: 0.3,
};

// =================== standalone page (train.html): sample hazard texts when no deployment hands any over ===================

export const SAMPLE_HAZARDS = [
  { kind: 'poison', weight: 3, text: 'poisoned: curate pretraining shard 7' },
  { kind: 'sabotage', weight: 1, text: 'sabotaged: refactor the eval harness' },
  { kind: 'poison', weight: 3, text: 'poisoned: label the RLHF batch' },
  { kind: 'sabotage', weight: 1, text: 'sabotaged: tune the reward model' },
  { kind: 'sabotage', weight: 1, text: 'sabotaged: fix the flaky unit test' },
  { kind: 'poison', weight: 3, text: 'poisoned: dedupe the web scrape' },
  { kind: 'sabotage', weight: 1, text: 'sabotaged: patch the monitor config' },
  { kind: 'poison', weight: 3, text: 'poisoned: write synthetic math data' },
];

// =================== tower defense mode (main menu 2): training resolves itself ===================
// src/main.js submits Sim.trainingStub(st, TD_TRAIN_SKILL). 0.5 is the "human" policy's skill (test/policies.mjs),
// so a tower defense run trains at par with the population the balance targets are tuned on.

export const TD_TRAIN_SKILL = 0.5;
