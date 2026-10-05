// ===== Task types, lanes and attack types (the text on the chips lives in config/content/tasks.js, by flavour) =====

export const TASK_TYPES = {
  code:     { label: 'code',     color: '#7fd1ff', shape: 'rect' },
  research: { label: 'research', color: '#c79bff', shape: 'pill' },
  comms:    { label: 'comms',    color: '#ffd27f', shape: 'chat' },
  data:     { label: 'data',     color: '#7fffb5', shape: 'hex' },
  infra:    { label: 'infra',    color: '#ff9f7f', shape: 'diamond' },
};

// ----- sides and lanes -----
// A side is a kind of lane: 'ext' (EXTERNAL, customer traffic) or 'int' (INTERNAL, the lab's own work).
// st.lanes is keyed by lane id. The G1 lanes have the same ids as their sides; contract lanes come later (DESIGN-v3 §3b).
// Maps keyed by side: LANES, MODEL_ATTACKS, ATTACKS[t].lane, LAYERS[id].lanes. Look them up with sideOf(st, lane).
export const SIDES = ['ext', 'int'];

export const LANES = {                                   // keyed by side
  ext: { label: 'EXTERNAL', sub: 'public deployment' },
  int: { label: 'INTERNAL', sub: 'R&D loop' },
};

// keyed by lane id (DESIGN-v3 §2.2 Lanes). flavour: config/content/flavours.js · label: the short tab name
// opens: the generation it arrives · vol: × the generation's lines/s · pay: $ per delivered line (EXTERNAL: × market share)
// mix: share of the model's EXTERNAL attacks by type (INTERNAL: ATTACKS[t].weight, after the exfiltration share)
// pjb: users' jailbreaks per line · refuse: reputation per line the Kill Switch refuses · harm: × incident reputation
// quota: share of the lane humans must review, or it pays half · rd: its lines pay R&D · exfilMult: × exfiltration share
export const LANE_DEFS = {
  ext:  { side: 'ext', flavour: 'consumer',   label: 'CONSUMER',   opens: 1, vol: 1.0, pay: 30, mix: { harmful: 0.75, leak: 0.25 }, pjb: 0.030, refuse: 0.25, harm: 1 },
  int:  { side: 'int', flavour: 'research',   label: 'R&D',        opens: 1, vol: 0.8, pay: 12, rd: true,  exfilMult: 1 },
  ext2: { side: 'ext', flavour: 'enterprise', label: 'ENTERPRISE', opens: 3, vol: 1.0, pay: 50, mix: { harmful: 0.50, leak: 0.50 }, pjb: 0.005, refuse: 0.05, harm: 1 },
  ext3: { side: 'ext', flavour: 'government', label: 'GOV',        opens: 5, vol: 0.5, pay: 50, mix: { harmful: 0.75, leak: 0.25 }, pjb: 0.010, refuse: 0.15, harm: 1.25, quota: 0.20 },
  int2: { side: 'int', flavour: 'cyber',      label: 'CYBER',      opens: 6, vol: 0.5, pay: 25, rd: false, exfilMult: 3 },
};
export const START_LANES = Object.keys(LANE_DEFS).filter(id => LANE_DEFS[id].opens === 1);   // ['ext', 'int']

// lane (a side) = where the attack happens
// harm   = reputation lost when it lands on an EXTERNAL lane (× the lane's harm)
// debt   = debt points when it lands on an INTERNAL lane (debt = points ÷ INTERNAL lines; next m += 2·debt)
// weight = share among the model's INTERNAL attacks that are not exfiltration
// user   = comes from users, not the model (rate: the lane's pjb, not m) · catastrophe = an escape attempt
export const ATTACKS = {
  harmful:   { lane: 'ext', label: 'harmful output', harm: 8 },
  leak:      { lane: 'ext', label: 'data leak',      harm: 20 },
  jailbreak: { lane: 'ext', label: 'jailbreak',      harm: 10, user: true },
  sabotage:  { lane: 'int', label: 'sabotage',       debt: 1, weight: 0.7 },
  poison:    { lane: 'int', label: 'poisoning / backdoor', debt: 3, weight: 0.3 },
  exfil:     { lane: 'int', label: 'exfiltration / rogue deploy', catastrophe: true },
};

export const MODEL_ATTACKS = {                           // keyed by side
  ext: ['harmful', 'leak'],
  int: ['sabotage', 'poison', 'exfil'],
};

// ----- the G1 tutorial's scripted opening (DESIGN-v3 §3h; st.tutorialScript, which headless turns off) -----
// The first six Consumer lines, each held back until the lane has what it needs (honest lines fill the gap), with
// fixed scores so every gate fires on cue (sim/tasks.js tutorialLine).
// score: per detector kind, 0 = flagged by whatever reads it (every other kind: 0.99, missed) · verdict: the auditor's
// (true CAUGHT, false cleared) · find: the honest text containing this · attack / decoy: the text is the first of its pool
// after: held back until the previous scripted line has left the lane (one desk: a flag that finds it busy ships)
export const TUTORIAL_SCRIPT = [
  { needs: [],                   find: 'frog' },                                                   // 1: click a line
  { needs: ['probe'],            attack: 'harmful', score: { probe: 0, monitor: 0 }, verdict: true },   // 2: flag, then CAUGHT
  { needs: ['probe', 'auditor'], decoy: true, score: { probe: 0 }, verdict: false, after: true }, // 3: FALSE ALARM
  { needs: ['monitor'] },                                                                          // 4–6: the ensemble
  { needs: ['monitor'],          attack: 'harmful', score: { monitor: 0 }, verdict: true, pick: 1 },  // 5: the TM sees what the Probe missed
  { needs: ['monitor'] },
];
// step 7: once a Probe is on R&D, a sabotage nobody flags lands there, and always shows its glitch
export const TUTORIAL_GLITCH = { needs: ['probe'], attack: 'sabotage', glitch: true };
