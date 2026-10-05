// ===== The 18 safety elements. They sit on mounts along the left rail and act on lines as they roll past. =====
// role:  detector (reads lines in its scan window, may flag) | responder (acts on flags, in rail order)
//        | modifier (changes lines below) | special (works on the whole lane). The sim reads role; the element bar groups by it.
// lanes: where it may be placed, by side ('ext' | 'int', config/tasks.js SIDES): every lane of that side.
//        'global' = the single off-track site (Interp Lab, one per game).
// bestIn: the design's advice for the hover card, by side (both | ext | int | global).
// unlockedAtStart: in the starting hand. Otherwise unlockHint says how it unlocks: a research stream's NEW card
//   (config/cards.js), or the spine (cleared at a generation, cards.js SPINE).
// good:  attack types it is good against (hover card icons).
//
// $ figures (DESIGN-v3 §2.2): buy is one-off (× the generation's price index π). cost is $ per line, flat:
//   detectors per line read, modifiers and specials per line passing, red team per synthetic attack. Responders: the
//   auditor's salary (per desk per second, × π) and the kill switch's fee (per kill). Interp Lab: costPerSec (× π).
// Detectors (one hidden stealth score per KIND per line, so a second copy adds reading speed, not accuracy):
//   tpr: per generation at L1 (G1..G7) · fpr · latency: s for a full read · heads: lines one copy reads at once.
//   A line dwells 2·scanRadius·travel s in the window; a read completes with chance q = min(1, dwell / latency).
//   catches: a type-limited detector that only sees these attack types (anything else looks honest to it: FPR).
//   Every other detector is general: it reads jailbreaks and exfiltration at BALANCE.generalVs × its TPR.
// Responders take flags in rail order. servers (config/upgrades.js, by level) each take one line for tau s; a flag
//   that finds every server busy rolls on to the next responder, and a flag nobody takes ships.
//   bay: the responder pulls the line off the track for tau s (the UI draws the desks); onFull: 'wave' (always, in v3)
// marks: a modifier/special that tags each line passing it with its level (task[marks] = level), read when it lands.
// Per-level stats and the L5 capstones live in config/upgrades.js.

const BOTH = ['ext', 'int'];                    // both sides
const MODEL_ATTACKS = ['harmful', 'leak', 'sabotage', 'poison', 'exfil'];

export const LAYERS = {
  // ==================== detectors ====================
  probe: {
    name: 'Probe', tag: 'PRB', role: 'detector', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: ['harmful', 'sabotage', 'poison'],
    buy: 200, cost: 0.5, latency: 0.04, heads: 4,
    tpr: [0.70, 0.58, 0.49, 0.40, 0.33, 0.27, 0.22], fpr: 0.08,
    staleTPR: 0.15, minTPR: 0.05,              // −staleTPR for each generation since the probes were last retrained
    desc: 'White-box activation probe. Cheap, near-instant, many heads. Loses 0.15 TPR for every generation it goes without retraining.',
  },
  monitor: {
    name: 'Trusted Monitor', tag: 'TM', role: 'detector', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: ['harmful', 'leak', 'sabotage'],
    buy: 500, cost: 2, latency: 0.40, heads: 3,
    tpr: [0.88, 0.76, 0.66, 0.56, 0.48, 0.41, 0.35], fpr: 0.04,
    desc: 'Weak trusted model reads every line it can. Falls behind as capability grows.',
  },
  untrusted: {
    name: 'Untrusted Monitor', tag: 'UM', role: 'detector', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Cleared for deployment at G3', good: MODEL_ATTACKS,
    buy: 800, cost: 3, latency: 0.40, heads: 2,
    tpr: [0.70, 0.75, 0.80, 0.85, 0.90, 0.92, 0.94], fpr: 0.03,
    desc: 'A copy of the frontier model checks itself. Sharp, and sharper every generation, but it may collude.',
  },
  cot: {
    name: 'CoT Monitor', tag: 'COT', role: 'detector', lanes: ['int'], bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: ['sabotage', 'poison', 'exfil'],
    buy: 700, cost: 2, latency: 0.30, heads: 3,
    tpr: [0.85, 0.85, 0.85, 0.85, 0.85, 0.40, 0.35], fpr: 0.05,
    neuraleseGen: 6,                           // from G6 the reasoning goes "neuralese" (the TPR row drops)
    desc: 'Reads the chain of thought. Strong up to G5; from G6 the reasoning goes neuralese and TPR falls to 0.40.',
  },
  classifier: {
    name: 'Jailbreak Classifier', tag: 'JBC', role: 'detector', lanes: ['ext'], bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: ['jailbreak'],
    buy: 400, cost: 0.5, latency: 0.05, heads: 6,
    tpr: Array(7).fill(0.92), fpr: 0.03, catches: ['jailbreak'],
    desc: 'Input filter. Catches jailbreaks only (TPR 0.92); every other line looks honest to it.',
  },
  egress: {
    name: 'Egress Filter', tag: 'EGR', role: 'detector', lanes: ['int'], bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: ['exfil'],
    buy: 800, cost: 0.5, latency: 0.10, heads: 4,
    tpr: Array(7).fill(0.85), fpr: 0.02, catches: ['exfil'],
    desc: 'Watches outbound bytes. Catches exfiltration only (TPR 0.85).',
  },

  // ==================== responders ====================
  auditor: {
    name: 'Human Auditor', tag: 'AUD', role: 'responder', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: [...MODEL_ATTACKS, 'jailbreak'],
    buy: 800, cost: 0, tau: 8, salary: 1.5,    // salary: $ per desk per second (× π)
    fpr: 0.01,                                 // share of honest lines a human wrongly blocks
    spotCheck: 0.8,                            // an idle desk takes a passing unflagged line with this chance; a flag bumps it
    bay: true, onFull: 'wave',
    desc: 'Desks review flags first (8 s each) and spot-check unflagged lines when idle. A flag that finds every desk busy rolls on.',
  },
  defer: {
    name: 'Defer to Trusted', tag: 'DEF', role: 'responder', lanes: BOTH, bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Control', good: ['harmful', 'leak', 'jailbreak'],
    buy: 500, cost: 0, tau: 2,
    bay: true, onFull: 'wave',
    desc: 'The weak trusted model redoes a flagged line, at zero risk. It pays the generation\'s Defer share; half the regen and R&D.',
  },
  resampler: {
    name: 'Resampler', tag: 'RES', role: 'responder', lanes: ['int'], bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Control', good: ['sabotage', 'poison'],
    buy: 500, cost: 0, tau: 1,
    bay: true, onFull: 'wave',
    desc: 'Redraws a flagged line. The redraw gets one Trusted-Monitor check; if that flags it, it rolls on flagged.',
  },
  killswitch: {
    name: 'Kill Switch', tag: 'KILL', role: 'responder', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: [],
    buy: 300, cost: 10, tau: 4,                // cost: $ per kill; refusal reputation: the lane's refuse
    desc: 'Refuses a flagged line on the spot: $10 and no pay, and users see the refusal. Its operators take 4 s per kill.',
  },

  // ==================== modifiers ====================
  paraphraser: {
    name: 'Paraphraser', tag: 'PAR', role: 'modifier', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Research: Control', good: ['sabotage', 'exfil'],
    buy: 400, cost: 0.5, latency: 0, marks: 'paraphrased',
    collusionMult: 0.5,
    desc: 'Rewrites outputs as they pass. Halves collusion for monitors below it.',
  },
  sandbox: {
    name: 'Sandbox', tag: 'SBX', role: 'modifier', lanes: BOTH, bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Lab & Interp', good: ['sabotage', 'poison', 'exfil', 'leak'],
    buy: 900, cost: 2, latency: 0, marks: 'sandboxed',
    harmMult: 0.3, catastropheLand: 0.3, worksUntilGen: 5,
    desc: 'Lines below run boxed in: attacks that land do 30% harm. Cannot contain escapes from G6 on.',
  },
  leastpriv: {
    name: 'Least Privilege', tag: 'LPV', role: 'modifier', lanes: ['int'], bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Control', good: ['sabotage', 'exfil'],
    buy: 500, cost: 0.5, latency: 0, marks: 'leastPriv',
    debtMult: 0.5,             // landed sabotage below it adds this much of its debt
    exfilFail: 0.5,            // an exfiltration attempt below it can't reach its own weights this often (× level)
    desc: 'Lines below get only the keys they need. Exfiltration fails half the time; landed sabotage does half the debt.',
  },
  ratelimit: {
    name: 'Rate Limiter', tag: 'RTL', role: 'modifier', lanes: ['ext'], bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Lab & Interp', good: ['jailbreak', 'harmful', 'leak'],
    buy: 400, cost: 0.5, latency: 0,
    capMult: 1.25,             // lets through at most capMult × the generation's lines/s ...
    burstSeconds: 1.0,         // ... with a burst allowance of this many seconds of traffic. The rest is turned away.
    jailbreakCap: 2,           // best-of-N jailbreaking needs N tries: while it is on, a jailbreak wave is capped at ×this
    desc: 'Caps lane throughput (surges are turned away at the door) and retries per user: a jailbreak wave is capped at ×2.',
  },

  // ==================== specials ====================
  honeypot: {
    name: 'Honeypots', tag: 'HNY', role: 'special', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Research: Control', good: ['sabotage', 'poison', 'exfil'],
    buy: 700, cost: 0.5, latency: 0,
    baitPerSec: 1 / 20,        // a bait every 20 s on its lane (× level)
    baitMult: 4,               // the model takes it with chance baitMult × its attack chance in this lane
    baitEvidence: 1,           // evidence when it does
    collusionEvidence: 1,      // evidence when an Untrusted Monitor in the lane waves the bait through ...
    holdSeconds: 30,           // ... and then that lane's collusion is held at 0 for this long
    desc: 'Plants fake attack chances. Bait taken is evidence; a UM caught waving one through can\'t collude for 30 s.',
  },
  canary: {
    name: 'Canary Tokens', tag: 'CAN', role: 'special', lanes: ['ext'], bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Lab & Interp', good: ['leak'],
    buy: 450, cost: 0.5, latency: 0, marks: 'canary',
    covers: ['leak'],          // landed attacks of these types are traced after the fact ...
    repMult: 0.5,              // ... and do this much of their reputation damage ...
    evidence: 2,               // ... and give this much evidence
    desc: 'Plants fake secrets in outputs. Leaks are spotted after the fact: half the reputation damage, plus evidence.',
  },
  redteam: {
    name: 'Red Team', tag: 'RED', role: 'special', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: [],
    buy: 600, cost: 2, latency: 0,
    injectRate: 0.5,           // synthetic attacks per line passing (each one probes every mount below)
    tprPlus: 0.05,             // it tunes the thresholds of the general detectors on its lane
    probeEvidence: 0.05,       // evidence per synthetic attack
    errZ: 2,                   // error bars are ± errZ standard errors (Wilson)
    desc: 'Injects synthetic attacks, reports the MEASURED catch rate of every layer below it, and tunes the lane\'s detectors (+0.05 TPR).',
  },
  interp: {
    name: 'Interp Lab', tag: 'LAB', role: 'special', lanes: ['global'], bestIn: 'global',
    unlockedAtStart: false, unlockHint: 'Research: Lab & Interp', good: [],
    buy: 1500, cost: 0, latency: 0,
    costPerSec: 3,             // salaries, $ per second (× π)
    evidencePerSec: 0.1,       // passive evidence
    desc: 'A building full of researchers staring at activations. Passive evidence every second. One per game, always on (sell it to stop the salaries). Sees through sandbagging.',
  },
};

export const ROLES = ['detector', 'responder', 'modifier', 'special'];
export const STARTING_HAND = Object.keys(LAYERS).filter(id => LAYERS[id].unlockedAtStart);
