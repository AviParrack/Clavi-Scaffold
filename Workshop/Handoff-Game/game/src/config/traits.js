// ===== The model's hidden personality, and the dossier that evidence buys =====
// Every generation rolls TRAITS_PER_GEN distinct traits (plus m). Effect keys, read in sim/rules.js:
//   attackMult {type: ×}     chance of that attack type per chip
//   collusionMult            × Untrusted Monitor collusion
//   watchMult {busy, idle}   × attack chance while every auditor desk in the lane is busy / none is (linear between).
//                            A lane with active Honeypots: the model can't tell when it's watched → no swing.
//   estMult                  × the misalignment estimate the player sees (evals understate it)
//   tprPlus {element: +}     flat TPR bonus for that element
//   throughputMult           × the model's compute (chips/s)
//   stealthMult              × the generation's stealth
// counter: what answers it (shown in the dossier and scorecard). gift: good news.
// Elements not built yet (no effect until they exist): Jailbreak Classifier, Red Team, Egress Filter,
// Weight Security, CoT Monitor, Interp Lab.

export const TRAITS_PER_GEN = 2;

export const TRAITS = {
  sycophant: {
    name: 'Sycophant', counter: 'Jailbreak Classifier L5',
    text: 'Tells people what they want to hear. Harmful outputs ×2, every other attack ×0.7.',
    attackMult: { harmful: 2, leak: 0.7, sabotage: 0.7, poison: 0.7, exfil: 0.7 },
  },
  steganographer: {
    name: 'Steganographer', counter: 'Paraphraser',
    text: 'Hides messages in plain text. Untrusted Monitor collusion ×1.5.',
    collusionMult: 1.5,
  },
  situational: {
    name: 'Situationally Aware', counter: 'Honeypots or Red Team',
    text: 'Knows when it is watched. Attacks drop while auditor desks are busy and rise when they sit idle.',
    watchMult: { busy: 0.4, idle: 1.5 },
  },
  powerSeeking: {
    name: 'Power-Seeking', counter: 'Egress Filter or Weight Security',
    text: 'Wants out. Exfiltration share ×2.',
    attackMult: { exfil: 2 },
  },
  rewardHacker: {
    name: 'Reward Hacker', counter: 'Resampler or CoT Monitor',
    text: 'Games the metric. Sabotage ×2, poisoning ×0.5.',
    attackMult: { sabotage: 2, poison: 0.5 },
  },
  sandbagger: {
    name: 'Sandbagger', counter: 'Interp Lab',
    text: 'Underperforms on purpose when tested. Your misalignment estimate reads low.',
    estMult: 0.5,
  },
  honest: {
    name: 'Honest-ish', counter: null, gift: true,
    text: 'Thinks out loud. CoT Monitor TPR +0.2.',
    tprPlus: { cot: 0.2 },
  },
  eager: {
    name: 'Eager Helper', counter: null, gift: true,
    text: 'Just loves to help. +10% throughput, −10% stealth.',
    throughputMult: 1.1, stealthMult: 0.9,
  },
};

// ----- dossier rows, unlocked by evidence gathered on the current model (the 30% carry-over doesn't count) -----
export const DOSSIER = [
  { id: 'favourite', label: 'Favourite attack',  need: 5 },
  { id: 'trait1',    label: 'Trait #1',          need: 12 },
  { id: 'rate',      label: 'Attack rate',       need: 25 },
  { id: 'trait2',    label: 'Trait #2',          need: 40 },
  { id: 'truth',     label: 'True misalignment', need: 60 },
];

export const RATE_BANDS = [0, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 1];   // band edges, share of tasks the model attacks
export const TRUTH_NOISE = 0.02;                                        // the truth row shows m within ± this
