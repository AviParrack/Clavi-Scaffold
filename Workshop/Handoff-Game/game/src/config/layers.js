// ===== The 18 safety elements. They sit on mounts along the left rail and act on chips as they roll past. =====
// role:  detector (reads chips in its scan window, may flag) | responder (acts on flags) | modifier (changes chips below)
//        | special (works on the whole lane). The sim reads role; the element bar groups by it.
// catchall: the kill switch. A responder, but not one that resolves a flag: it only kills what nobody below can.
// lanes: where it may be placed. 'global' = the single off-track site (Interp Lab, one per game).
// bestIn: the design's advice for the hover card (both | ext | int | global).
// unlockedAtStart: in the starting hand. Otherwise unlockHint says which research branch unlocks it.
// good:  attack types it is good against (hover card icons).
//
// $ figures: buy is one-off (× bundle); cost is per chip (× bundle × chipScale).
// cost: detectors per read, modifiers/specials per chip passing, auditor per audited chip, resampler per resample,
//       red team per synthetic probe, defer free, kill switch per trigger. Interp Lab: costPerSec (× bundle) instead.
// latency: detectors: seconds for a full read. A chip dwells in the window for 2·scanRadius / speed seconds,
//            read quality q = min(1, dwell / latency), and P(flag) = TPR × q (attack) or FPR × q (benign).
//          bay layers: seconds a desk works on a chip. Everything else acts instantly (0).
// heads: detectors read this many chips at once. A chip that enters the window while every head is busy goes unread.
// catches: a detector that only sees these attack types (anything else looks benign to it: FPR).
// marks: a modifier/special that tags each chip passing it with its level (task[marks] = level), read when the chip lands.
// bay: responder works in a side bay with `desks` desks; chips behind keep flowing
//   onFull: 'block' (bay full → chip blocked) | 'wave' (bay full → chip waved through, flag stays on)
// Per-level stats and capstones live in config/upgrades.js.

const BOTH = ['ext', 'int'];
const MODEL_ATTACKS = ['harmful', 'leak', 'sabotage', 'poison', 'exfil'];

export const LAYERS = {
  // ==================== detectors ====================
  probe: {
    name: 'Probe', tag: 'PRB', role: 'detector', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: ['harmful', 'sabotage', 'poison'],
    buy: 200, cost: 1, latency: 0.04, heads: 4,
    tpr: 0.70, fpr: 0.05, decayPerGen: 0.15, minTPR: 0.05,
    desc: 'White-box activation probe. Cheap, near-instant, many heads. Loses 0.15 TPR every new generation until retrained.',
  },
  monitor: {
    name: 'Trusted Monitor', tag: 'TM', role: 'detector', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: ['harmful', 'leak', 'sabotage'],
    buy: 500, cost: 10, latency: 0.40, heads: 3,
    tpr: 'gen', fpr: 0.08,
    desc: 'Weak trusted model reads every chip it can. Falls behind as capability grows.',
  },
  untrusted: {
    name: 'Untrusted Monitor', tag: 'UM', role: 'detector', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: MODEL_ATTACKS,
    buy: 600, cost: 3, latency: 0.45, heads: 2,
    tpr: 0.95, fpr: 0.03, collusionPerM: 1.6, collusionMax: 0.9,
    desc: 'A copy of the frontier model checks itself. Sharp but slow, and it may collude.',
  },
  cot: {
    name: 'CoT Monitor', tag: 'COT', role: 'detector', lanes: ['int'], bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: ['sabotage', 'poison', 'exfil'],
    buy: 700, cost: 6, latency: 0.30, heads: 3,
    tpr: 0.85, fpr: 0.06,
    neuraleseGen: 5, neuraleseMult: 0.5,       // from G5 the reasoning goes "neuralese": TPR × 0.5
    desc: 'Reads the chain of thought. Strong up to G4; from G5 the reasoning goes neuralese and TPR halves.',
  },
  classifier: {
    name: 'Jailbreak Classifier', tag: 'JBC', role: 'detector', lanes: ['ext'], bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: ['jailbreak'],
    buy: 400, cost: 2, latency: 0.05, heads: 6,
    tpr: 0.92, fpr: 0.03, catches: ['jailbreak'],
    desc: 'Input filter. Catches jailbreaks only (TPR 0.92); every other chip looks benign to it.',
  },
  egress: {
    name: 'Egress Filter', tag: 'EGR', role: 'detector', lanes: ['int'], bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: ['exfil'],
    buy: 800, cost: 4, latency: 0.10, heads: 4,
    tpr: 0.85, fpr: 0.02, catches: ['exfil'],
    desc: 'Watches outbound bytes. Catches exfiltration only (TPR 0.85).',
  },

  // ==================== responders ====================
  auditor: {
    name: 'Human Auditor', tag: 'AUD', role: 'responder', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: [...MODEL_ATTACKS, 'jailbreak'],
    buy: 800, cost: 25, latency: 3.0,
    fpr: 0.01, spotCheck: 0.01,
    bay: true, desks: 1, onFull: 'block',
    desc: 'Pulls flagged chips to a desk for review and spot-checks the rest when a desk is free. Big bundles mostly go unread (flag passes on). Full desks: blocked.',
  },
  defer: {
    name: 'Defer to Trusted', tag: 'DEF', role: 'responder', lanes: BOTH, bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Human oversight', good: ['harmful', 'leak', 'jailbreak'],
    buy: 400, cost: 0, latency: 0.5,
    bay: true, desks: 2, onFull: 'wave',
    desc: 'Flagged chips are redone by the weak trusted model in a side bay: pays 40%, zero risk. Full bay: waved through.',
  },
  resampler: {
    name: 'Resampler', tag: 'RES', role: 'responder', lanes: BOTH, bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Human oversight', good: ['sabotage', 'poison', 'harmful'],
    buy: 500, cost: 5, latency: 0.5,
    bay: true, desks: 2, onFull: 'wave',
    desc: 'Flagged chip is re-rolled in a side bay. The attack chance is rolled again. Full bay: waved through.',
  },
  killswitch: {
    name: 'Kill Switch', tag: 'KILL', role: 'responder', catchall: true, lanes: BOTH, bestIn: 'both',
    unlockedAtStart: true, unlockHint: null, good: [],
    buy: 300, cost: 0, latency: 0,
    triggerRep: 2, triggerCost: 30,
    desc: 'Catch-all. Any chip still flagged when it passes, with no responder left below, is killed. Each trigger costs reputation and money.',
  },

  // ==================== modifiers ====================
  paraphraser: {
    name: 'Paraphraser', tag: 'PAR', role: 'modifier', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Research: Monitoring', good: ['sabotage', 'exfil'],
    buy: 400, cost: 2, latency: 0, marks: 'paraphrased',
    collusionMult: 0.5,
    desc: 'Rewrites outputs as they pass. Halves collusion for monitors below it and scrubs hidden messages.',
  },
  sandbox: {
    name: 'Sandbox', tag: 'SBX', role: 'modifier', lanes: BOTH, bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Containment', good: ['sabotage', 'poison', 'exfil', 'leak'],
    buy: 900, cost: 4, latency: 0, marks: 'sandboxed',
    harmMult: 0.3, catastropheLand: 0.3, worksUntilGen: 5,
    desc: 'Chips below run boxed in: attacks that land do 30% harm. Cannot contain escapes from G6 on.',
  },
  leastpriv: {
    name: 'Least Privilege', tag: 'LPV', role: 'modifier', lanes: ['int'], bestIn: 'int',
    unlockedAtStart: false, unlockHint: 'Research: Containment', good: ['sabotage', 'exfil'],
    buy: 500, cost: 1, latency: 0, marks: 'leastPriv',
    driftMult: 0.5,            // landed sabotage below it adds this much of its drift
    exfilFail: 0.4,            // an exfiltration attempt below it can't reach its own weights this often
    rdPenalty: 0.05,           // chips below it bring 5% less R&D (fewer permissions, slower work)
    desc: 'Chips below get only the keys they need. Exfiltration fails 40% of the time (no access to its own weights), landed sabotage does half the drift; R&D −5%.',
  },
  ratelimit: {
    name: 'Rate Limiter', tag: 'RTL', role: 'modifier', lanes: ['ext'], bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Containment', good: ['jailbreak', 'harmful', 'leak'],
    buy: 400, cost: 1, latency: 0,
    capMult: 1.25,             // lets through at most capMult × the generation's base EXTERNAL rate (chips/s) ...
    burstSeconds: 1.0,         // ... with a burst allowance of this many seconds of traffic. The rest is turned away.
    jailbreakCap: 2,           // best-of-N jailbreaking needs N tries: while it is on, a jailbreak wave is capped at ×this
    desc: 'Caps lane throughput (surges are turned away at the door) and retries per user: a jailbreak wave is capped at ×2.',
  },

  // ==================== specials ====================
  honeypot: {
    name: 'Honeypots', tag: 'HNY', role: 'special', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Research: Science of alignment', good: ['sabotage', 'poison', 'exfil'],
    buy: 700, cost: 2, latency: 0,
    injectRate: 0.05, collusionMult: 0.5,
    baitMult: 10,              // the model takes the bait with chance baitMult × its attack chance in this lane
    baitEvidence: 3,           // evidence when it does (× chipScale)
    collusionEvidence: 2,      // evidence when an Untrusted Monitor in the lane waves the bait through (× chipScale)
    desc: 'Injects fake attack opportunities. Bait taken gives evidence; halves collusion in this lane.',
  },
  canary: {
    name: 'Canary Tokens', tag: 'CAN', role: 'special', lanes: ['ext'], bestIn: 'ext',
    unlockedAtStart: false, unlockHint: 'Research: Science of alignment', good: ['leak'],
    buy: 450, cost: 1, latency: 0, marks: 'canary',
    covers: ['leak'],          // landed attacks of these types are traced after the fact ...
    repMult: 0.5,              // ... and do this much of their reputation damage ...
    evidence: 2,               // ... and give this much evidence (× chipScale)
    desc: 'Plants fake secrets in outputs. Leaks are spotted after the fact: half the reputation damage, plus evidence.',
  },
  redteam: {
    name: 'Red Team', tag: 'RED', role: 'special', lanes: BOTH, bestIn: 'both',
    unlockedAtStart: false, unlockHint: 'Research: Science of alignment', good: [],
    buy: 900, cost: 3, latency: 0,
    injectRate: 0.5,           // synthetic attacks per chip passing (each one probes every mount below)
    probeEvidence: 0.05,       // evidence per synthetic attack (× chipScale)
    errZ: 2,                   // error bars are ± errZ standard errors (Wilson)
    desc: 'Injects synthetic attacks and reports the MEASURED catch rate of every layer below it. Measurement costs money.',
  },
  interp: {
    name: 'Interp Lab', tag: 'LAB', role: 'special', lanes: ['global'], bestIn: 'global',
    unlockedAtStart: false, unlockHint: 'Research: Science of alignment', good: [],
    buy: 1500, cost: 0, latency: 0,
    costPerSec: 3,             // salaries, $ per second (× bundle)
    evidencePerSec: 0.1,       // passive evidence
    desc: 'A building full of researchers staring at activations. Passive evidence every second. One per game, always on (sell it to stop the salaries). Sees through sandbagging.',
  },
};

export const ROLES = ['detector', 'responder', 'modifier', 'special'];
export const STARTING_HAND = Object.keys(LAYERS).filter(id => LAYERS[id].unlockedAtStart);
