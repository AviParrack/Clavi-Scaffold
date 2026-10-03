// ===== Element upgrades: L1 (as placed) → L4, then the L5 capstone =====
// price: $ to go L1→2, L2→3, L3→4, L4→5 (× bundle)
// Every other array is one value per level, L1..L5, applied to the base in config/layers.js:
//   *Mult multiplies the base, *Plus adds to it (headsPlus: detector heads, desksPlus: bay desks).
//   latencyMult: detectors read faster (better read quality, heads free up sooner); bays work faster.
// Missing arrays mean "no change". L5 keeps the L4 numbers and adds the capstone flag.
// Capstone flags are read in sim/rules.js (elementStats and helpers).

export const MAX_LEVEL = 5;

export const UPGRADES = {
  // ==================== detectors ====================
  probe: {
    price:     [150, 300, 600, 1200],
    tprMult:   [1, 1.10, 1.20, 1.30, 1.30],
    fprMult:   [1, 0.80, 0.65, 0.50, 0.50],
    headsPlus: [0, 2, 4, 8, 8],                // 4 → 6 → 8 → 12 heads
    capstone: { name: 'Self-Retraining', noDecay: true, text: 'Probe TPR no longer decays between generations.' },
  },
  monitor: {
    price:       [300, 600, 1200, 2400],
    tprMult:     [1, 1.08, 1.16, 1.25, 1.25],
    fprMult:     [1, 0.85, 0.70, 0.60, 0.60],
    costMult:    [1, 1.10, 1.20, 1.30, 1.30],
    headsPlus:   [0, 1, 3, 5, 5],              // 3 → 4 → 6 → 8 heads
    latencyMult: [1, 0.90, 0.80, 0.70, 0.70],  // 0.40 s → 0.28 s per full read
    capstone: { name: 'Weak-to-Strong', decayMult: 0.5, text: 'Its TPR falls half as fast as the models get smarter.' },
  },
  untrusted: {
    price:       [300, 600, 1200, 2400],
    tprMult:     [1, 1.01, 1.02, 1.03, 1.03],
    fprMult:     [1, 0.80, 0.65, 0.50, 0.50],
    headsPlus:   [0, 1, 2, 4, 4],              // 2 → 3 → 4 → 6 heads
    latencyMult: [1, 0.85, 0.70, 0.55, 0.55],  // 0.45 s → 0.25 s per full read
    capstone: { name: 'Signal Jamming', collusionMult: 0.5, text: 'Collusion is halved.' },
  },
  cot: {
    price:       [350, 700, 1400, 2800],       // "legibility training"
    tprMult:     [1, 1.05, 1.10, 1.15, 1.15],
    fprMult:     [1, 0.85, 0.70, 0.60, 0.60],
    headsPlus:   [0, 1, 2, 4, 4],              // 3 → 4 → 5 → 7 heads
    latencyMult: [1, 0.90, 0.80, 0.70, 0.70],
    capstone: { name: 'Faithful CoT', noNeuralese: true, text: 'The reasoning stays legible: no neuralese penalty from G5.' },
  },
  classifier: {
    price:     [200, 400, 800, 1600],
    tprMult:   [1, 1.02, 1.04, 1.06, 1.06],    // 0.92 → 0.975
    fprMult:   [1, 0.75, 0.55, 0.40, 0.40],
    headsPlus: [0, 2, 4, 6, 6],
    capstone: { name: 'Constitutional', alsoCatches: ['harmful'], text: 'Also flags harmful outputs.' },
  },
  egress: {
    price:     [400, 800, 1600, 3200],
    tprMult:   [1, 1.05, 1.10, 1.15, 1.15],    // 0.85 → 0.98
    headsPlus: [0, 1, 2, 4, 4],
    // sideChannel: share of exfiltration attempts, by generation, that find a way round the gap (the filter still reads them)
    capstone: { name: 'Air Gap', airGap: true, rdMult: 0.9, sideChannel: { 6: 0.1, 7: 0.2 },
      text: 'Exfiltration past this mount is blocked outright, read or not. R&D −10%. From G6 a few attempts find side channels.' },
  },

  // ==================== responders ====================
  auditor: {
    price:         [400, 800, 1600, 3200],
    desksPlus:     [0, 1, 2, 3, 3],
    spotCheckMult: [1, 2, 3, 4, 4],            // 1% → 2% → 3% → 4%
    capstone: { name: 'AI-Assisted Audit', capacityMult: 10, honestyCap: 0.95,      // accuracy = min(honestyCap, 1 − m)
      text: 'Each human covers 10× as much of a bundle. Accuracy is now capped by the assisting model\'s honesty (1 − m, max 95%).' },
  },
  defer: {
    price:     [200, 400, 800, 1600],
    desksPlus: [0, 1, 2, 3, 3],
    payMult:   [1, 1.15, 1.30, 1.50, 1.50],    // × BALANCE.deferPay
    capstone: { name: 'Trusted Editing', fullPay: true, text: 'The trusted model edits instead of redoing: deferred tasks pay in full.' },
  },
  resampler: {
    price:       [250, 500, 1000, 2000],
    desksPlus:   [0, 1, 2, 3, 3],
    latencyMult: [1, 0.85, 0.70, 0.55, 0.55],
    capstone: { name: 'Best of Three', tries: 3, text: 'Re-rolls up to three times and keeps the first clean one.' },
  },
  killswitch: {
    price:        [150, 300, 600, 1200],
    triggerMult:  [1, 0.75, 0.55, 0.40, 0.40], // × triggerRep and × triggerCost
    capstone: { name: 'Graceful Halt', noRepCost: true, text: 'Triggers cost no reputation.' },
  },

  // ==================== modifiers ====================
  paraphraser: {
    price:         [200, 400, 800, 1600],
    collusionMult: [1, 0.8, 0.6, 0.4, 0.4],    // × LAYERS.paraphraser.collusionMult
    capstone: { name: 'Canonical Form', noCollusion: true, text: 'Monitors below cannot collude at all.' },
  },
  sandbox: {
    price:    [450, 900, 1800, 3600],
    harmMult: [1, 0.85, 0.70, 0.55, 0.55],     // × LAYERS.sandbox.harmMult
    costMult: [1, 0.85, 0.70, 0.55, 0.55],
    capstone: { name: 'Formal Box', containsAll: true, text: 'Contains escapes in every generation.' },
  },
  leastpriv: {
    price:       [250, 500, 1000, 2000],
    penaltyMult: [1, 0.75, 0.50, 0.25, 0.25],  // × rdPenalty: R&D −5% → −3.75% → −2.5% → −1.25%
    capstone: { name: 'Capability Tokens', driftMult: 0.25, exfilFail: 0.8,
      text: 'Every action needs a signed token: exfiltration below it fails 80% of the time, landed sabotage does a quarter of the drift.' },
  },
  ratelimit: {
    price:    [150, 300, 600, 1200],
    costMult: [1, 0.80, 0.60, 0.40, 0.40],
    capstone: { name: 'Overflow to Trusted', overflowDefer: true, text: 'Turned-away chips go to the trusted model instead: they pay 40%, zero risk.' },
  },

  // ==================== specials ====================
  honeypot: {
    price:      [300, 600, 1200, 2400],
    injectMult: [1, 1.4, 1.8, 2.2, 2.2],
    capstone: { name: 'Sting Operation', evidenceMult: 3, text: 'Bait taken yields 3× the evidence.' },
  },
  canary: {
    price:        [200, 400, 800, 1600],
    repMult:      [1, 0.90, 0.80, 0.70, 0.70], // × LAYERS.canary.repMult: 50% → 45% → 40% → 35% of the damage
    evidenceMult: [1, 1.25, 1.50, 2.00, 2.00],
    capstone: { name: 'Watermarks', alsoCovers: ['harmful'], text: 'Harmful outputs are traced too: less damage, plus evidence.' },
  },
  redteam: {
    price:      [400, 800, 1600, 3200],        // "more probes": more synthetic attacks per chip (each one costs)
    injectMult: [1, 1.5, 2, 3, 3],
    capstone: { name: 'Control Eval', laneWide: true, text: 'Also reports the measured catch rate of the whole stack below it.' },
  },
  interp: {
    price:        [800, 1600, 3200, 6400],     // "more researchers"
    evidenceMult: [1, 1.5, 2, 3, 3],
    costMult:     [1, 1.3, 1.6, 2, 2],
    capstone: { name: 'Microscope', revealM: true, text: 'Reveals the true m ± 0.02 (the dossier\'s truth row, at any evidence, for as long as the lab stays).' },
  },
};
