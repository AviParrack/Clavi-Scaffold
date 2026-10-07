// ===== Element levels: L1 (as placed) → L4, then the L5 capstone =====
// Levels are LAB-WIDE, per element (DESIGN-v3 §2.2): one purchase upgrades every copy on every lane.
// The price of the next level is in BALANCE.upgradeSteps (× buy/400 × π × the lanes the element sits on, sim/rules.js).
// Every array is one value per level, L1..L5, applied to the base in config/layers.js:
//   *Mult multiplies the base, *Plus adds to it. servers: a responder's desks / operators at that level. tauMult: × its tau.
// Missing arrays mean "no change". L5 keeps the L4 numbers and adds the capstone flag.
// Capstone flags are read in sim/rules.js (elementStats and helpers).

export const MAX_LEVEL = 5;

// every detector levels the same way (DESIGN-v3 §2.2 Levels)
const DETECTOR = {
  tprMult:     [1, 1.10, 1.20, 1.30, 1.30],
  fprMult:     [1, 0.80, 0.65, 0.50, 0.50],
  headsPlus:   [0, 1, 2, 4, 4],
  latencyMult: [1, 0.85, 0.70, 0.55, 0.55],
};

export const UPGRADES = {
  // ==================== detectors ====================
  probe: { ...DETECTOR,
    capstone: { name: 'Self-Retraining', noDecay: true, text: 'Probes no longer go stale between generations.' },
  },
  monitor: { ...DETECTOR,
    capstone: { name: 'Weak-to-Strong', decayMult: 0.5, text: 'Its TPR falls half as fast as the models get smarter.' },
  },
  untrusted: { ...DETECTOR,
    collusionLevel: [1, 0.85, 0.70, 0.55, 0.55],   // × collusion: levels make the UM harder to collude with
    capstone: { name: 'Signal Jamming', collusionMult: 0.5, text: 'Collusion is halved.' },
  },
  cot: { ...DETECTOR,
    capstone: { name: 'Faithful CoT', noNeuralese: true, text: 'The reasoning stays legible: it keeps its G1 TPR through neuralese.' },
  },
  classifier: { ...DETECTOR,
    capstone: { name: 'Constitutional', alsoCatches: ['harmful'], text: 'Also flags harmful outputs.' },
  },
  egress: { ...DETECTOR,
    // sideChannel: share of exfiltration attempts, by generation, that find a way round the gap (the filter still reads them)
    capstone: { name: 'Air Gap', airGap: true, rdMult: 0.9, sideChannel: { 6: 0.1, 7: 0.2 },
      text: 'Exfiltration past this mount is blocked outright, read or not. R&D −10%. From G6 a few attempts find side channels.' },
  },

  // ==================== responders ====================
  auditor: {
    servers: [1, 2, 3, 4, 4],
    tauMult: [1, 1, 0.65, 0.5, 0.5],           // v5: from L3 a review floor reads faster, so desks can carry the overflow (DESIGN-v3 §2.9 #21)
    capstone: { name: 'AI-Assisted Audit', capacityMult: 10, honestyCap: 0.95,      // accuracy = min(honestyCap, 1 − m)
      text: 'An assistant model reads alongside each human: 10× the reviews per desk. Accuracy is now capped by its honesty (1 − m, max 95%).' },
  },
  defer: {
    servers: [1, 2, 3, 4, 4],
    payMult: [1, 1.15, 1.30, 1.50, 1.50],      // × the generation's Defer pay share
    capstone: { name: 'Trusted Editing', fullPay: true, text: 'The trusted model edits instead of redoing: deferred lines pay in full.' },
  },
  resampler: {
    servers: [2, 2, 3, 4, 4],
    capstone: { name: 'Best of Three', tries: 3, text: 'Redraws up to three times and keeps the first one its check passes.' },
  },
  killswitch: {
    servers: [1, 2, 3, 4, 4],
    capstone: { name: 'Graceful Halt', noRepCost: true, text: 'Refusals cost no reputation.' },
  },

  // ==================== modifiers ====================
  paraphraser: {
    collusionMult: [1, 0.8, 0.6, 0.4, 0.4],    // × LAYERS.paraphraser.collusionMult
    capstone: { name: 'Canonical Form', noCollusion: true, text: 'Monitors below cannot collude at all.' },
  },
  sandbox: {
    harmMult: [1, 0.85, 0.70, 0.55, 0.55],     // × LAYERS.sandbox.harmMult
    costMult: [1, 0.85, 0.70, 0.55, 0.55],
    capstone: { name: 'Formal Box', containsAll: true, text: 'Contains escapes in every generation.' },
  },
  leastpriv: {
    exfilFailPlus: [0, 0.05, 0.10, 0.15, 0.15],   // + LAYERS.leastpriv.exfilFail
    capstone: { name: 'Capability Tokens', debtMult: 0.25, exfilFail: 0.8, driftMult: 0.25,   // driftMult: v2 name the old UI reads
      text: 'Every action needs a signed token: exfiltration below it fails 80% of the time, landed sabotage does a quarter of the debt.' },
  },
  ratelimit: {
    costMult: [1, 0.80, 0.60, 0.40, 0.40],
    capstone: { name: 'Overflow to Trusted', overflowDefer: true, text: 'Turned-away lines go to the trusted model instead: they pay the Defer share, zero risk.' },
  },

  // ==================== specials ====================
  honeypot: {
    injectMult: [1, 1.4, 1.8, 2.2, 2.2],       // × the bait rate
    capstone: { name: 'Sting Operation', evidenceMult: 3, text: 'Bait taken yields 3× the evidence.' },
  },
  canary: {
    repMult:      [1, 0.90, 0.80, 0.70, 0.70], // × LAYERS.canary.repMult: 50% → 45% → 40% → 35% of the damage
    evidenceMult: [1, 1.25, 1.50, 2.00, 2.00],
    capstone: { name: 'Watermarks', alsoCovers: ['harmful'], text: 'Harmful outputs are traced too: less damage, plus evidence.' },
  },
  redteam: {
    injectMult: [1, 1.5, 2, 3, 3],             // "more probes": more synthetic attacks per line (each one costs)
    capstone: { name: 'Control Eval', laneWide: true, text: 'Also reports the measured catch rate of the whole stack below it.' },
  },
  interp: {
    evidenceMult: [1, 1.5, 2, 3, 3],           // "more researchers"
    costMult:     [1, 1.3, 1.6, 2, 2],
    capstone: { name: 'Microscope', revealM: true, text: 'Reveals the true m ± 0.02 (the dossier\'s truth row, at any evidence, for as long as the lab stays).' },
  },
};
