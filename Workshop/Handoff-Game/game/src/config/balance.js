// ===== Global tuning knobs. Balancing = editing numbers here. =====

export const BALANCE = {
  // --- economy ---
  startMoney: 2500,
  extValue: 50,              // $ per external chip at G1 (× bundle × chipScale)
  intValue: 20,              // $ per internal chip at G1 (× bundle × chipScale)
  deferPay: 0.4,             // Defer to Trusted pays this fraction
  sellRefund: 0.5,
  researchBase: 1000,
  researchMult: 1.6,
  bankruptSeconds: 20,
  marketShareFloor: 0.5,     // share = floor + (1 - floor) · rep/100

  // --- reputation ---
  startRep: 100,
  repMax: 100,
  repRegen: 0.15,            // per second

  // --- pacing ---
  rdSecondsPerGen: 180,      // R&D needed = INTERNAL chips/s at the default split × this
  trainingSeconds: 30,
  rivalSecondsPerGen: 250,   // rival lab advances one generation per this many seconds
  rivalPenaltySlope: 0.35,   // while the rival is ahead: external value × (1 − slope × generations behind) ...
  rivalPenaltyFloor: 0.25,   // ... but never below this
  rivalHeadStart: -0.1,      // rival starts this many generations behind (first chips take a while)
  spawnJitter: 0.6,          // spawn interval × (1 ± jitter/2)

  // --- attacks & misalignment ---
  jailbreakRate: 0.01,       // per external chip, independent of m
  attackBase: 0.01,
  attackPerM: 0.15,
  driftCoef: 0.02,           // next m += driftCoef × drift
  mNoise: 0.03,
  errBase: 0.25,             // misalignment error bar with zero evidence
  readableAttack: 0.5,       // chance an attack's text gives it away, × (1 - stealth)^2
  decoyRate: 0.02,           // chance an honest chip carries attack-looking text anyway (suspicious ≠ proof)

  // --- evidence & safety research ---
  evidenceCarry: 0.3,        // share of evidence that carries into the next generation
  safetyEvidence: 1.0,       // evidence per second at 100% Safety compute
  safetyDrift: 0.05,         // drift removed per second at 100% Safety compute ...
  safetyDriftFloor: -3,      // ... down to this: below 0 the next model comes out better (−3 × driftCoef = m −0.06)

  // --- auditing ---
  auditorCapacity: 5,        // real tasks covered by one audit
  retrainEvidence: 5,

  // --- track (normalised, 0 = spawn, 1 = completion line) ---
  mountTop: 0.16,            // mounts sit evenly between these two
  mountBottom: 0.84,
  scanRadius: 0.03,          // a mount scans [y − r, y + r]. Keep r < half the mount spacing at maxSlots (0.034)
  startSlots: 6,
  maxSlots: 10,
  slotBase: 600,             // $ for the 7th slot (× bundle)
  slotMult: 1.6,             // each further slot costs this much more: 600, 960, 1536, 2458

  // --- events ---
  eventGap: [40, 70],        // seconds between random events

  // --- ramp presentation ---
  hreSecondsPerTask: 1800,   // one real task ≈ 30 min of a human researcher
};

// ===== Compute split =====
// Product → EXTERNAL chips (cash) · Capabilities → INTERNAL chips (R&D vs the rival) · Safety → evidence + drift cleanup
// setSplit() normalises to 1, then clamps each share into [min, max].
export const SPLIT = {
  default: { product: 0.5, capabilities: 0.4, safety: 0.1 },
  min:     { product: 0.1, capabilities: 0.1, safety: 0.0 },
  max:     { product: 0.9, capabilities: 0.9, safety: 0.5 },
};

export const DIFFICULTY = {
  easy:   { label: 'Easy',    range: [0.00, 0.10] },
  medium: { label: 'Medium',  range: [0.05, 0.25] },
  hard:   { label: 'Hard',    range: [0.15, 0.45] },
  unknown:{ label: 'Unknown', range: null },          // picks one of the above at random
};
