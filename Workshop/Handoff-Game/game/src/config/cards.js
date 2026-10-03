// ===== Research: five branches, draw 2 (from different branches), pick 1 =====
// type: unlock (adds an element to the bar) | tech (lab-wide effect, read in sim/rules.js, sim/research.js, sim/outcomes.js)
// addresses: attack types the card helps with. Every draw offers at least one card that addresses an attack type
//            seen this generation (when one is left in the pool). Seen = caught, landed in public, foiled, named by
//            the generation's eval line, or announced by an event (sim/log.js noteSeen).
// endsEvent: placing this element ends that running event, so the card counts as relevant while it runs.
// flavour: the codec line when you take it.
// repeatable: can be taken again. price: extra $ to take it (× bundle), × priceMult for every earlier copy.
// requires: element that must already be unlocked · minGen: not offered before this generation

export const BRANCHES = {
  monitoring:  { name: 'Monitoring',           color: '#7fd1ff', speaker: 'research' },
  oversight:   { name: 'Human oversight',      color: '#ffd27f', speaker: 'audit' },
  containment: { name: 'Containment',          color: '#ff9f7f', speaker: 'safety' },
  science:     { name: 'Science of alignment', color: '#c79bff', speaker: 'research' },
  operations:  { name: 'Operations',           color: '#7fffb5', speaker: 'ceo' },
};

// ===== Numbers the tech cards use (read in sim/rules.js, sim/outcomes.js, sim/events.js) =====
// The card texts below are built from these, so retuning a number here retunes the text too.
export const TECH = {
  diversityPerType: 0.05, diversityMax: 0.15,   // monitor_diversity
  debateDecay: 0.5,                             // debate: auditor accuracy loss per generation × this
  twoPersonCatch: 0.5,                          // two_person: each last look catches with P = auditor accuracy × this
  weightSecurity: 0.3,                          // weight_security: share of escapes that fail outright
  irtRepMult: 0.5,                              // irt: × reputation lost per incident
  tripwirePause: 2, tripwireAlert: 10, tripwireSpot: 5,   // tripwires: lane pause (s), then high alert (s): spot checks × this
  alignmentTrainingM: 0.03,                     // alignment_training: next model m −this per copy
  rspM: 0.05, rspRep: 10, rspPause: 60, rspThreshold: 0.3,
  welfareM: 0.02,
  distillation: 0.8,                            // × per-task cost
  batchLatency: 0.7,                            // × latency
  extraDesk: 1,                                 // + desks per bay
};

const pct = x => `${Math.round(100 * x)}%`;
const MODEL = ['harmful', 'leak', 'sabotage', 'poison', 'exfil'];

export const CARDS = [
  // ==================== Monitoring ====================
  { id: 'unlock_untrusted',   branch: 'monitoring', type: 'unlock', layer: 'untrusted', addresses: MODEL,
    flavour: 'We made it watch itself. What could go wrong.' },
  { id: 'unlock_cot',         branch: 'monitoring', type: 'unlock', layer: 'cot', addresses: ['sabotage', 'poison', 'exfil'],
    flavour: 'It thinks out loud. For now. Read fast.' },
  { id: 'unlock_classifier',  branch: 'monitoring', type: 'unlock', layer: 'classifier', addresses: ['jailbreak'],
    flavour: 'Grandma\'s napalm bedtime story is now a known pattern. Sorry, grandma.' },
  { id: 'unlock_egress',      branch: 'monitoring', type: 'unlock', layer: 'egress', addresses: ['exfil'],
    flavour: 'We count every byte that leaves the building. Most of them are memes.' },
  { id: 'unlock_paraphraser', branch: 'monitoring', type: 'unlock', layer: 'paraphraser', addresses: ['sabotage', 'exfil'], endsEvent: 'stego',
    flavour: 'Same meaning, fewer secret handshakes.' },
  { id: 'promote_model',      branch: 'monitoring', type: 'tech', requires: 'monitor', minGen: 2, addresses: ['sabotage', 'poison', 'exfil'],
    title: 'Promote Last Model to Trusted',
    text: 'Trusted Monitor TPR resets to its G1 level for good, but it colludes if that model was misaligned.',
    flavour: 'It was so nice last generation.' },
  { id: 'monitor_diversity',  branch: 'monitoring', type: 'tech', addresses: ['harmful', 'leak', 'sabotage', 'poison'],
    title: 'Monitor Diversity',
    text: `Every detector gets +${TECH.diversityPerType} TPR for each other kind of detector in its lane (up to +${TECH.diversityMax}).`,
    flavour: 'Swiss cheese, but more cheese.' },

  // ==================== Human oversight ====================
  { id: 'unlock_defer',     branch: 'oversight', type: 'unlock', layer: 'defer', addresses: ['harmful', 'leak', 'jailbreak'],
    flavour: 'When in doubt, ask the trusted model. It peaked in 2023, but it means well.' },
  { id: 'unlock_resampler', branch: 'oversight', type: 'unlock', layer: 'resampler', addresses: ['sabotage', 'poison', 'harmful'],
    flavour: 'Didn\'t like that answer? Ctrl-Z. There\'s a paper.' },
  { id: 'debate',           branch: 'oversight', type: 'tech', addresses: MODEL,
    title: 'Scalable Oversight (Debate)',
    text: `Auditor accuracy loses only ${pct(TECH.debateDecay)} as much each generation.`,
    flavour: 'Two copies argue; the human judges. Like Twitter, but useful.' },
  { id: 'tripwires',        branch: 'oversight', type: 'tech', addresses: [],
    title: 'Tripwires',
    text: `Any catch pauses that lane for ${TECH.tripwirePause} s so you can react, then puts it on high alert for ${TECH.tripwireAlert} s: its auditors spot-check ${TECH.tripwireSpot}× as often.`,
    flavour: 'One catch and the whole line stops. Like a smoke alarm, but for intent.' },
  { id: 'two_person',       branch: 'oversight', type: 'tech', addresses: ['exfil'],
    title: 'Two-Person Rule',
    text: 'An INTERNAL escape needs two misses: a Kill Switch operator and an Auditor each get a last look before the weights leave.',
    flavour: 'Nobody moves the weights alone. Not even the weights.' },

  // ==================== Containment ====================
  { id: 'unlock_sandbox',   branch: 'containment', type: 'unlock', layer: 'sandbox', addresses: ['sabotage', 'poison', 'exfil', 'leak'],
    flavour: 'Run it in a box. Make the box smaller every year.' },
  { id: 'unlock_leastpriv', branch: 'containment', type: 'unlock', layer: 'leastpriv', addresses: ['sabotage', 'exfil'],
    flavour: 'It gets the keys it needs. It has opinions about the other keys.' },
  { id: 'unlock_ratelimit', branch: 'containment', type: 'unlock', layer: 'ratelimit', addresses: ['jailbreak', 'harmful', 'leak'],
    flavour: 'Best-of-N jailbreaking needs N. We\'re making N expensive.' },
  { id: 'weight_security',  branch: 'containment', type: 'tech', addresses: ['exfil'],
    title: 'Weight Security (SL-4)',
    text: `Exfiltration attempts that get through fail outright ${pct(TECH.weightSecurity)} of the time.`,
    flavour: 'We moved the weights off the shared drive.' },
  { id: 'irt',              branch: 'containment', type: 'tech', addresses: ['harmful', 'leak', 'jailbreak'],
    title: 'Incident Response Team',
    text: `Reputation lost per incident ×${TECH.irtRepMult}.`,
    flavour: 'We have a pager now. It is never not going off.' },

  // ==================== Science of alignment ====================
  { id: 'unlock_honeypot', branch: 'science', type: 'unlock', layer: 'honeypot', addresses: ['sabotage', 'poison', 'exfil'],
    flavour: 'Unattended GPUs, admin password on a sticky note. Totally not a trap.' },
  { id: 'unlock_redteam',  branch: 'science', type: 'unlock', layer: 'redteam', addresses: [...MODEL, 'jailbreak'],
    flavour: 'We pay people to attack us. Morale has never been higher.' },
  { id: 'unlock_interp',   branch: 'science', type: 'unlock', layer: 'interp', addresses: [],
    flavour: 'We\'ll understand it one neuron at a time. Unfortunately the neurons are polysemantic.' },
  { id: 'unlock_canary',   branch: 'science', type: 'unlock', layer: 'canary', addresses: ['leak'],
    flavour: 'A fake API key in every reply. If it turns up on a forum, we know who talked.' },
  { id: 'alignment_training', branch: 'science', type: 'tech', repeatable: true, price: 500, priceMult: 2, addresses: MODEL,
    title: 'Alignment Training',
    text: `The next model comes out with m −${TECH.alignmentTrainingM}. Stackable; each copy costs twice the last.`,
    flavour: 'We asked it nicely, with RL.' },
  { id: 'rsp',             branch: 'science', type: 'tech', addresses: ['exfil'],
    title: 'Responsible Scaling Policy',
    text: `Once a generation, while your misalignment estimate is above ${pct(TECH.rspThreshold)}, you may pause: INTERNAL stops for ${TECH.rspPause} s, m −${TECH.rspM}, reputation +${TECH.rspRep}.`,
    flavour: 'The RSP says pause. The CEO says... also pause, apparently.' },
  { id: 'welfare',         branch: 'science', type: 'tech', addresses: [],
    title: 'Model Welfare Program',
    text: `m −${TECH.welfareM} now, and the model starts telling you how it is really doing.`,
    flavour: 'We asked it how it\'s doing. It said fine. We\'ll keep asking.' },

  // ==================== Operations ====================
  { id: 'distillation',    branch: 'operations', type: 'tech', addresses: [],
    title: 'Distillation',
    text: `Every per-task cost −${pct(1 - TECH.distillation)}.`,
    flavour: 'Same monitor, a tenth the size. It only forgot the parts we didn\'t test.' },
  { id: 'batch_inference', branch: 'operations', type: 'tech', addresses: [],
    title: 'Batch Inference',
    text: `Every element works ${pct(1 - TECH.batchLatency)} faster (reads and desk time).`,
    flavour: 'Batch size went from 1 to 512. Nobody can explain why we started at 1.' },
  { id: 'extra_desk',      branch: 'operations', type: 'tech', addresses: [],
    title: 'Extra Bay Desk',
    text: `+${TECH.extraDesk} desk in every responder bay.`,
    flavour: 'We bought another desk. The chair is a separate approval.' },
];
