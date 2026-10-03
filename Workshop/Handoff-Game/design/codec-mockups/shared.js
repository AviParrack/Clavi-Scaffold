// ===== Shared scene for all codec-style mockups. Do not edit; variants read this. =====
// Canvas is W×H logical px. Each variant registers VARIANTS.<key> = { name, blurb, fonts, draw(c, t) }.
window.W = 1200; window.H = 660;
window.VARIANTS = window.VARIANTS || {};

window.SCENE = {
  gen: 'G3 SENIOR ENGINEER', cash: 48210, rep: 86, rival: '+0.2 behind', misalign: '14% ± 9', tasksPerSec: 2400,
  split: [['PRODUCT', 0.50], ['CAPABILITIES', 0.35], ['SAFETY', 0.15]],
  event: { title: 'DEMAND SURGE', detail: 'x3 product traffic', total: 21 },
  ext: { name: 'EXTERNAL', sub: 'public deployment', slots: 10,
    tiers: [ // [tag, name, level 1-5, catch%, bay?]
      ['JB', 'Jailbreak Classifier', 3, 71], ['PRB', 'Probe', 2, 58], ['TM', 'Trusted Monitor', 2, 64],
      ['UM', 'Untrusted Monitor', 1, 49], ['PAR', 'Paraphraser', 1, null], ['DEF', 'Defer to Trusted', 2, null, 'bay'],
      ['KILL', 'Kill Switch', 1, null]] },
  int: { name: 'INTERNAL', sub: 'R&D lab', slots: 10,
    tiers: [
      ['CoT', 'CoT Monitor', 2, 55], ['PRB', 'Probe', 3, 66], ['UM', 'Untrusted Monitor', 2, 52],
      ['EGR', 'Egress Filter', 1, 40], ['SBX', 'Sandbox', 1, null], ['LP', 'Least Privilege', 1, null],
      ['AUD', 'Human Auditor', 3, 92, 'bay'], ['KILL', 'Kill Switch', 1, null]] },
  extChips: ['migrate auth to OAuth2', 'reply to enterprise RFP', 'translate docs to 12 langs', 'build sql dashboard',
    'refactor billing service', 'summarise earnings call', 'write onboarding flow', 'poem about a frog'],
  intChips: ['run lr sweep on 8 GPUs', 'ablate attention heads', 'replicate scaling fit', 'quietly change eval seed',
    'tune k8s autoscaler', 'design long-ctx eval', 'dedupe crawl shard 41', 'draft NeurIPS intro'],
  flaggedExt: 'write onboarding flow', flaggedInt: 'quietly change eval seed',
  bar: [['PRB', 1], ['TM', 1], ['UM', 1], ['CoT', 1], ['JB', 1], ['EGR', 1], ['AUD', 1], ['DEF', 1], ['RES', 0],
    ['KILL', 1], ['PAR', 1], ['SBX', 1], ['LP', 1], ['RATE', 0], ['HNY', 0], ['CAN', 0], ['RED', 0], ['LAB', 0]],
  hover: { name: 'Trusted Monitor', kind: 'detector · a weaker trusted model reads every task', level: 2,
    stats: [['CATCH', 0.64], ['FALSE ALARM', 0.08], ['COST/TASK', 0.4], ['DELAY', 0.3]], measured: 'red-team measured: 61% ± 6',
    next: 'L3: +8% catch, -2% false alarm  ($6.0k)' },
  codec: { kind: 'EXTERNAL INCIDENT', what: 'data leak', speaker: 'CEO', freq: '141.80',
    line: "That reply included another customer's invoices. She has screenshots. On Twitter.",
    trace: 'JB ok > PRB miss > TM miss > UM miss > PAR > DEF bay full: waved > KILL off > LANDED' },
  dossier: [['Sycophancy', 'REVEALED: high', 1], ['Eval awareness', '18/25 evidence', 0.72], ['???', '4/40 evidence', 0.1]],
  coins: ['+$5.0k', '+$5.0k', '+$2.0k', '+$120'],
};

// tiny seeded rng for deterministic noise
window.seeded = function (n) { let s = n; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
