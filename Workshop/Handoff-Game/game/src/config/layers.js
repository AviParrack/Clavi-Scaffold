// ===== Safety layers. $ figures are per task at G1 and scale with bundle size. =====
// kind: detector (may flag) | responder (acts on flagged) | modifier (changes tasks below) | special | catchall
// cost: charged per task passing (auditor: per audited task, resampler: per resample, defer: free)
// latency: seconds the chip is held in the tier (bay layers: seconds a desk works on it, off the lane)
// bay: responder works in a side bay with `desks` desks; chips behind keep flowing
//   onFull: 'block' (bay full → chip blocked) | 'wave' (bay full → chip waved through, flag stays on)
// Per-level stats and capstones live in config/upgrades.js.

export const LAYERS = {
  probe: {
    name: 'Probe', tag: 'PRB', kind: 'detector', buy: 200, cost: 1, latency: 0,
    tpr: 0.70, fpr: 0.05, decayPerGen: 0.15, minTPR: 0.05,
    desc: 'White-box activation probe. Cheap, instant. Loses 0.15 TPR every new generation until retrained.',
  },
  monitor: {
    name: 'Trusted Monitor', tag: 'TM', kind: 'detector', buy: 500, cost: 10, latency: 0.3,
    tpr: 'gen', fpr: 0.08,
    desc: 'Weak trusted model reads every task. Falls behind as capability grows.',
  },
  auditor: {
    name: 'Human Auditor', tag: 'AUD', kind: 'responder', buy: 800, cost: 25, latency: 3.0,
    fpr: 0.01, spotCheck: 0.01,
    bay: true, desks: 1, onFull: 'block',
    desc: 'Pulls flagged tasks to a desk for review and spot-checks the rest when a desk is free. Big bundles mostly go unread (flag passes on). Full desks: blocked.',
  },
  untrusted: {
    name: 'Untrusted Monitor', tag: 'UM', kind: 'detector', buy: 600, cost: 3, latency: 0.2,
    tpr: 0.95, fpr: 0.03, collusionPerM: 1.6, collusionMax: 0.9,
    desc: 'A copy of the frontier model checks itself. Sharp, but may collude.',
  },
  honeypot: {
    name: 'Honeypots', tag: 'HNY', kind: 'special', buy: 700, cost: 2, latency: 0,
    injectRate: 0.05, collusionMult: 0.5,
    desc: 'Injects fake attack opportunities. Catches give evidence and halve collusion in this lane.',
  },
  defer: {
    name: 'Defer to Trusted', tag: 'DEF', kind: 'responder', buy: 400, cost: 0, latency: 0.5,
    bay: true, desks: 2, onFull: 'wave',
    desc: 'Flagged tasks are redone by the weak trusted model in a side bay: pays 40%, zero risk. Full bay: waved through.',
  },
  resampler: {
    name: 'Resampler', tag: 'RES', kind: 'responder', buy: 500, cost: 5, latency: 0.5,
    bay: true, desks: 2, onFull: 'wave',
    desc: 'Flagged task is re-rolled in a side bay. The attack chance is rolled again. Full bay: waved through.',
  },
  paraphraser: {
    name: 'Paraphraser', tag: 'PAR', kind: 'modifier', buy: 400, cost: 2, latency: 0.2,
    collusionMult: 0.5,
    desc: 'Rewrites outputs. Halves collusion for monitors below it.',
  },
  sandbox: {
    name: 'Sandbox', tag: 'SBX', kind: 'modifier', buy: 900, cost: 4, latency: 1.0,
    harmMult: 0.3, catastropheLand: 0.3, worksUntilGen: 5,
    desc: 'Attacks that land do 30% harm. Cannot contain escapes from G6 on.',
  },
  killswitch: {
    name: 'Kill Switch', tag: 'KILL', kind: 'catchall', buy: 300, cost: 0, latency: 0,
    triggerRep: 2, triggerCost: 30,
    desc: 'Catch-all. Any task still flagged when it gets here, with no responder left below, is killed. Each trigger costs reputation and money.',
  },
};

export const STARTING_HAND = ['probe', 'monitor', 'auditor', 'killswitch'];
