// ===== Research cards (DESIGN-v3 §3a): a steady stream, three work streams, no cash cost =====
// An offer is three cards, one per stream (sim/research.js drawOffer). Card types:
//   new    unlocks an element (layer) and mounts its first copy free
//   level  a free lab-wide level of a placed element (el), up to BALANCE.research.maxLevel (L4)
//   lab    a technique: a lab-wide effect read in sim/rules.js and sim/outcomes.js (st.upgrades[id])
//   mount  +1 mount on one lane, up to BALANCE.maxSlots
// from: first generation it can be offered · answers: the threat (THREATS) it counters · rare: drawn at
// BALANCE.research.rareWeight · repeat: can come back (Alignment Sprint: once a generation).
// flavour: the codec line when you take it. Titles and texts are built from the numbers below, so a retune retunes them.

import { LAYERS } from './layers.js';

// the three work streams (one offer slot each). BRANCHES is the v2 name the old UI reads.
export const STREAMS = {
  monitoring: { name: 'Monitoring',   color: '#7fd1ff', speaker: 'research' },
  control:    { name: 'Control',      color: '#ffd27f', speaker: 'audit' },
  lab:        { name: 'Lab & Interp', color: '#c79bff', speaker: 'research' },
};
export const BRANCHES = STREAMS;

// threats, by the generation they first appear (balance-v3 THREATS). While a live threat has no owned answer, every
// offer shows an answer to it (as far as the three slots allow).
export const THREATS = { jailbreak: 1, sabotage: 2, collusion: 3, exfil: 4, quota: 5, neuralese: 6, fooled: 7 };

// automatic unlocks, announced on the model card (DESIGN-v3 §3a "Spine unlocks")
export const SPINE = { 3: ['untrusted'] };

// ===== Numbers the techniques use (read in sim/rules.js, sim/outcomes.js, sim/events.js) =====
// The v2 techniques below the line are no longer offered (§3a, §3i); their effects stay readable for the old UI and tests.
export const TECH = {
  diversityPerType: 0.02, diversityMax: 0.06,   // monitor_diversity: + TPR per OTHER general detector kind in the lane
  jamming: 0.5,                                 // jamming: × Untrusted Monitor collusion on every lane
  debateTau: 6, debateErr: 0.5,                 // debate: auditor base seconds per line (8 without), × auditor errors
  weightSecurity: 0.5,                          // weight_security: share of escapes that fail outright
  // ---- v2 techniques, not offered in v3.0 ----
  twoPersonCatch: 0.5,                          // two_person: each last look catches with P = auditor accuracy × this
  irtRepMult: 0.5,                              // irt: × reputation lost per incident
  tripwirePause: 2, tripwireAlert: 10, tripwireSpot: 5,   // tripwires: lane pause (s), then high alert (s): spot checks × this
  alignmentTrainingM: 0.03,
  rspM: 0.05, rspRep: 10, rspPause: 60, rspThreshold: 0.3,
  welfareM: 0.02,
  distillation: 0.8,                            // × per-line cost
  batchLatency: 0.7,                            // × latency (detector reads and responder time)
  extraDesk: 1,                                 // + desks per bay
};
// titles of the v2 techniques (tests and the old UI's tech list)
export const V2_TECH = {
  promote_model: 'Promote Last Model to Trusted', tripwires: 'Tripwires', two_person: 'Two-Person Rule', irt: 'Incident Response Team',
  alignment_training: 'Alignment Training', rsp: 'Responsible Scaling Policy', welfare: 'Model Welfare Program',
  distillation: 'Distillation', batch_inference: 'Batch Inference', extra_desk: 'Extra Bay Desk',
};

const pct = x => `${Math.round(100 * x)}%`;
const NEW = (id, stream, from, more = {}) => ({ id, stream, type: 'new', layer: id, from, title: LAYERS[id].name, text: LAYERS[id].desc, ...more });
const LEVEL = (el, stream) => ({ id: `level:${el}`, stream, type: 'level', el, from: 1,
  title: `${LAYERS[el].name}: +1 level`, text: `${LAYERS[el].name} goes up one lab level: every copy, every lane. Free, up to L4.` });

export const CARDS = [
  // ==================== Monitoring ====================
  NEW('classifier', 'monitoring', 1, { answers: 'jailbreak', flavour: 'Grandma\'s napalm bedtime story is now a known pattern. Sorry, grandma.' }),
  NEW('cot', 'monitoring', 2, { answers: 'sabotage', flavour: 'It thinks out loud. For now. Read fast.' }),
  NEW('egress', 'monitoring', 4, { answers: 'exfil', flavour: 'We count every byte that leaves the building. Most of them are memes.' }),
  NEW('redteam', 'monitoring', 1, { flavour: 'We pay people to attack us. Morale has never been higher.' }),
  { id: 'monitor_diversity', stream: 'monitoring', type: 'lab', from: 3,
    title: 'Monitor Diversity',
    text: `Every general detector gets +${TECH.diversityPerType} TPR for each other kind of general detector in its lane (up to +${TECH.diversityMax}).`,
    flavour: 'Swiss cheese, but more cheese.' },
  ...['probe', 'monitor', 'untrusted', 'cot', 'classifier', 'egress'].map(el => LEVEL(el, 'monitoring')),

  // ==================== Control ====================
  // Defer from G1 (v5, DESIGN-v3 §2.9 #21): the trusted model can take a desk's overflow before anyone buys a Kill Switch
  NEW('defer', 'control', 1, { answers: 'quota', flavour: 'When in doubt, ask the trusted model. It peaked in 2023, but it means well.' }),
  NEW('resampler', 'control', 2, { answers: 'sabotage', flavour: 'Didn\'t like that answer? Ctrl-Z. There\'s a paper.' }),
  NEW('paraphraser', 'control', 3, { answers: 'collusion', flavour: 'Same meaning, fewer secret handshakes.' }),
  NEW('honeypot', 'control', 3, { answers: 'collusion', flavour: 'Unattended GPUs, admin password on a sticky note. Totally not a trap.' }),
  NEW('leastpriv', 'control', 4, { answers: 'exfil', flavour: 'It gets the keys it needs. It has opinions about the other keys.' }),
  { id: 'jamming', stream: 'control', type: 'lab', from: 3, answers: 'collusion',
    title: 'Signal Jamming',
    text: `Untrusted Monitor collusion ×${TECH.jamming} on every lane.`,
    flavour: 'A little noise on every channel two copies could share. They hate it. Good.' },
  { id: 'debate', stream: 'control', type: 'lab', from: 5, answers: 'fooled',
    title: 'Scalable Oversight (Debate)',
    text: `Auditors take ${pct(TECH.debateTau / LAYERS.auditor.tau)} as long per line, and make ${pct(TECH.debateErr)} of the mistakes.`,
    flavour: 'Two copies argue; the human judges. Like Twitter, but useful.' },
  { ...LEVEL('auditor', 'control'), answers: 'quota' },
  LEVEL('defer', 'control'),
  LEVEL('killswitch', 'control'),

  // ==================== Lab & Interp ====================
  { id: 'weight_security', stream: 'lab', type: 'lab', from: 4, answers: 'exfil',
    title: 'Weight Security (SL-4)',
    text: `Exfiltration attempts that get through fail outright ${pct(TECH.weightSecurity)} of the time.`,
    flavour: 'We moved the weights off the shared drive.' },
  { id: 'faithful_cot', stream: 'lab', type: 'lab', from: 5, answers: 'neuralese',
    title: 'Faithful CoT',
    text: 'The CoT Monitor keeps reading English after the model goes neuralese: it never falls below its G1 TPR.',
    flavour: 'We pay it to think in words we can read. It bills by the token.' },
  { id: 'sprint', stream: 'lab', type: 'lab', from: 2, repeat: true,
    title: 'Alignment Sprint',
    text: 'The next model comes out with m −10% of m. R&D ×0.8 for the rest of this generation.',
    flavour: 'Everyone off capabilities for a week. The capabilities team has thoughts.' },
  { id: 'mount', stream: 'lab', type: 'mount', from: 1,
    title: '+1 Mount',
    text: 'Click a lane\'s + SLOT or its tab: the new mount goes there, empty. Esc banks the card.',
    flavour: 'Facilities found another rack. Do not ask where it was.' },
  NEW('interp', 'lab', 1, { rare: true, flavour: 'We\'ll understand it one neuron at a time. Unfortunately the neurons are polysemantic.' }),
  NEW('canary', 'lab', 1, { rare: true, answers: null, flavour: 'A fake API key in every reply. If it turns up on a forum, we know who talked.' }),
  NEW('sandbox', 'lab', 1, { rare: true, flavour: 'Run it in a box. Make the box smaller every year.' }),
  NEW('ratelimit', 'lab', 1, { rare: true, flavour: 'Best-of-N jailbreaking needs N. We\'re making N expensive.' }),
];
