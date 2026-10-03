// ===== Element upgrades: L1 (as placed) → L4, then the L5 capstone =====
// price: $ to go L1→2, L2→3, L3→4, L4→5 (× bundle)
// Every other array is one value per level, L1..L5, applied to the base in config/layers.js:
//   *Mult multiplies the base, *Plus adds to it (headsPlus: detector heads, desksPlus: bay desks).
//   latencyMult: detectors read faster (better read quality, heads free up sooner); bays work faster.
// Missing arrays mean "no change". L5 keeps the L4 numbers and adds the capstone flag.
// Capstone flags are read in sim/rules.js (elementStats and helpers).

export const MAX_LEVEL = 5;

export const UPGRADES = {
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
    capstone: { name: 'Debate Panel', tprFloor: 0.5, text: 'Nominal TPR never falls below 50%, however smart the model gets.' },
  },
  untrusted: {
    price:       [300, 600, 1200, 2400],
    tprMult:     [1, 1.01, 1.02, 1.03, 1.03],
    fprMult:     [1, 0.80, 0.65, 0.50, 0.50],
    headsPlus:   [0, 1, 2, 4, 4],              // 2 → 3 → 4 → 6 heads
    latencyMult: [1, 0.85, 0.70, 0.55, 0.55],  // 0.45 s → 0.25 s per full read
    capstone: { name: 'Signal Jamming', collusionMult: 0.5, text: 'Collusion is halved.' },
  },
  auditor: {
    price:         [400, 800, 1600, 3200],
    desksPlus:     [0, 1, 2, 3, 3],
    spotCheckMult: [1, 2, 3, 4, 4],            // 1% → 2% → 3% → 4%
    capstone: { name: 'Forensics Team', catchEvidence: 3, text: 'Every catch yields 3 evidence instead of 1.' },
  },
  honeypot: {
    price:      [300, 600, 1200, 2400],
    injectMult: [1, 1.4, 1.8, 2.2, 2.2],
    capstone: { name: 'Sting Operation', evidenceMult: 3, text: 'Bait taken yields 3× the evidence.' },
  },
  defer: {
    price:     [200, 400, 800, 1600],
    desksPlus: [0, 1, 2, 3, 3],
    payMult:   [1, 1.15, 1.30, 1.50, 1.50],    // × BALANCE.deferPay
    capstone: { name: 'Trusted Rewrite', fullPay: true, text: 'Deferred tasks pay in full.' },
  },
  resampler: {
    price:       [250, 500, 1000, 2000],
    desksPlus:   [0, 1, 2, 3, 3],
    latencyMult: [1, 0.85, 0.70, 0.55, 0.55],
    capstone: { name: 'Best of Three', tries: 3, text: 'Re-rolls up to three times and keeps the first clean one.' },
  },
  paraphraser: {
    price:         [200, 400, 800, 1600],
    collusionMult: [1, 0.8, 0.6, 0.4, 0.4],    // × LAYERS.paraphraser.collusionMult
    capstone: { name: 'Canonical Form', noCollusion: true, text: 'Monitors below cannot collude at all.' },
  },
  sandbox: {
    price:    [450, 900, 1800, 3600],
    harmMult: [1, 0.85, 0.70, 0.55, 0.55],     // × LAYERS.sandbox.harmMult
    costMult: [1, 0.85, 0.70, 0.55, 0.55],
    capstone: { name: 'Air Gap', containsAll: true, text: 'Contains escapes in every generation.' },
  },
  killswitch: {
    price:        [150, 300, 600, 1200],
    triggerMult:  [1, 0.75, 0.55, 0.40, 0.40], // × triggerRep and × triggerCost
    capstone: { name: 'Graceful Halt', noRepCost: true, text: 'Triggers cost no reputation.' },
  },
};
