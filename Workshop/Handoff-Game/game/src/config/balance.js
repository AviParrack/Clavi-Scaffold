// ===== Global tuning knobs. Balancing = editing numbers here. =====

export const BALANCE = {
  // --- economy ---
  startMoney: 2500,
  extValue: 50,              // $ per external task at G1 (× bundle)
  intValue: 20,              // $ per internal task at G1 (× bundle)
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
  timeoutRep: 0.05,

  // --- pacing ---
  rdSecondsPerGen: 180,      // R&D needed = internal chips/s × this
  trainingSeconds: 30,
  rivalSecondsPerGen: 250,   // rival lab advances one generation per this many seconds
  rivalPenalty: 0.7,         // external value multiplier while the rival is ahead
  rivalHeadStart: -0.1,      // rival starts this many generations behind (first chips take a while)
  spawnJitter: 0.6,          // spawn interval × (1 ± jitter/2)

  // --- attacks & misalignment ---
  jailbreakRate: 0.01,       // per external chip, independent of m
  attackBase: 0.01,
  attackPerM: 0.15,
  driftCoef: 0.02,
  mNoise: 0.03,
  errBase: 0.25,             // misalignment error bar with zero evidence
  readableAttack: 0.5,       // chance an attack snippet reads as suspicious, × (1 - stealth)^2

  // --- auditing ---
  spotCheck: 0.15,           // chance auditor reviews an unflagged task (only with spare capacity)
  auditorCapacity: 5,        // real tasks covered by one audit
  retrainEvidence: 5,

  // --- lane geometry (normalised, 0 = spawn, 1 = completion line) ---
  chipGap: 0.065,
  tierTop: 0.16,
  tierBottom: 0.84,
  startSlots: 4,
  maxSlots: 7,

  // --- events ---
  eventGap: [40, 70],        // seconds between random events

  // --- ramp presentation ---
  hreSecondsPerTask: 1800,   // one real task ≈ 30 min of a human researcher
};

export const DIFFICULTY = {
  easy:   { label: 'Easy',    range: [0.00, 0.10] },
  medium: { label: 'Medium',  range: [0.05, 0.25] },
  hard:   { label: 'Hard',    range: [0.15, 0.45] },
  unknown:{ label: 'Unknown', range: null },          // picks one of the above at random
};
