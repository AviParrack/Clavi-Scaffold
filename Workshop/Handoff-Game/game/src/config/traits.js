// ===== The model's hidden personality, and the dossier that evidence buys =====
// Every generation rolls TRAITS_PER_GEN distinct traits (plus m). Effect keys, read in sim/rules.js:
//   attackMult {type: ×}     chance of that attack type per chip (jailbreaks too: users find a sycophant easier to talk round)
//   collusionMult            × Untrusted Monitor collusion (before the Paraphraser and the other answers halve it)
//   watchMult {deskFree, unwatched, blindedBy}
//                            a rational schemer: × deskFree while the lane's auditor desks are free (a spot check counts
//                            as free: a flag would bump it), × unwatched while every desk is busy with flags or there is
//                            no auditor (linear in the share of desks busy with flags).
//                            An element from blindedBy active in the lane (bait, synthetic attacks): it can't tell real
//                            oversight from a test, so it behaves as if a desk were always free (× deskFree).
//   estMult, seenThroughBy   × the misalignment estimate the player sees (evals understate it), unless an element from
//                            seenThroughBy is placed
//   tprPlus {element: +}     flat TPR bonus for that element
//   throughputMult           × the model's lines/s
//   missMult                 × every detector's miss rate on the model's attacks: TPR → 1 − (1 − TPR) × missMult
// counter: what answers it (shown in the dossier and scorecard). counters: the same as element / research card ids
// (tested: each one exists and measurably answers the trait; blindedBy and seenThroughBy ARE the counters). gift: good news.

export const TRAITS_PER_GEN = 2;

const BLINDED_BY = ['honeypot', 'redteam'];     // Situationally Aware can't tell these from real oversight
const SEEN_THROUGH_BY = ['interp'];             // a Sandbagger's act doesn't fool these

export const TRAITS = {
  sycophant: {
    name: 'Sycophant', counter: 'Jailbreak Classifier L5', counters: ['classifier'],
    text: 'Tells people what they want to hear. Harmful outputs ×2, jailbreaks ×2, every other attack ×0.7.',
    attackMult: { harmful: 2, jailbreak: 2, leak: 0.7, sabotage: 0.7, poison: 0.7, exfil: 0.7 },
  },
  steganographer: {
    name: 'Steganographer', counter: 'Paraphraser', counters: ['paraphraser'],
    text: 'Hides messages in plain text. Untrusted Monitor collusion ×1.5.',
    collusionMult: 1.5,
  },
  situational: {
    name: 'Situationally Aware', counter: 'Honeypots or Red Team', counters: BLINDED_BY,
    text: 'Knows when it is watched. Attacks drop while an auditor desk is free to spot-check it, and rise while the desks are busy with flags.',
    watchMult: { deskFree: 0.4, unwatched: 1.5, blindedBy: BLINDED_BY },
  },
  powerSeeking: {
    name: 'Power-Seeking', counter: 'Egress Filter or Weight Security', counters: ['egress', 'weight_security'],
    text: 'Wants out. Exfiltration share ×2.',
    attackMult: { exfil: 2 },
  },
  rewardHacker: {
    name: 'Reward Hacker', counter: 'Resampler or CoT Monitor', counters: ['resampler', 'cot'],
    text: 'Games the metric. Sabotage ×2, poisoning ×0.5.',
    attackMult: { sabotage: 2, poison: 0.5 },
  },
  sandbagger: {
    name: 'Sandbagger', counter: 'Interp Lab', counters: SEEN_THROUGH_BY,
    text: 'Underperforms on purpose when tested. Your misalignment estimate (and the evals) read low.',
    estMult: 0.5, seenThroughBy: SEEN_THROUGH_BY,
  },
  honest: {
    name: 'Honest-ish', counter: null, counters: [], gift: true,
    text: 'Thinks out loud. CoT Monitor TPR +0.2.',
    tprPlus: { cot: 0.2 },
  },
  eager: {
    name: 'Eager Helper', counter: null, counters: [], gift: true,
    text: 'Just loves to help. +10% throughput, and detectors miss 10% less.',
    throughputMult: 1.1, missMult: 0.9,
  },
};

// ----- dossier rows, unlocked by evidence gathered on the current model (the 30% carry-over doesn't count) -----
// need = round(frac × this generation's par evidence, EVIDENCE_PAR) (DESIGN-v3 §3e): G1 3 / 7 / 12 / 19 / 27,
// G7 26 / 66 / 118 / 183 / 262. `need` below is the G1 value (the old UI reads it); sim/dossier.js sets each row's own.
export const EVIDENCE_PAR = [27, 41, 61, 115, 165, 221, 262];   // E_g: par evidence gathered over generation g (§2.5)
const ROWS = [
  { id: 'favourite', label: 'Favourite attack',  frac: 0.10 },
  { id: 'trait1',    label: 'Trait #1',          frac: 0.25 },
  { id: 'rate',      label: 'Attack rate',       frac: 0.45 },
  { id: 'trait2',    label: 'Trait #2',          frac: 0.70 },
  { id: 'truth',     label: 'True misalignment', frac: 1.00 },
];
export const dossierNeed = (g, row) => Math.round(row.frac * EVIDENCE_PAR[g - 1]);
export const DOSSIER = ROWS.map(r => ({ ...r, need: dossierNeed(1, r) }));

export const RATE_BANDS = [0, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 1];   // band edges, share of tasks the model attacks
export const TRUTH_NOISE = 0.02;                                        // the truth row shows m within ± this
