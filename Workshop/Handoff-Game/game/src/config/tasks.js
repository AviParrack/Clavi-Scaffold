// ===== Task types, lanes and attack types (the text on the chips lives in config/tasktext.js) =====

export const TASK_TYPES = {
  code:     { label: 'code',     color: '#7fd1ff', shape: 'rect' },
  research: { label: 'research', color: '#c79bff', shape: 'pill' },
  comms:    { label: 'comms',    color: '#ffd27f', shape: 'chat' },
  data:     { label: 'data',     color: '#7fffb5', shape: 'hex' },
  infra:    { label: 'infra',    color: '#ff9f7f', shape: 'diamond' },
};

export const LANES = {
  ext: { label: 'EXTERNAL', sub: 'public deployment' },
  int: { label: 'INTERNAL', sub: 'R&D loop' },
};

// weight = share among the model's own attacks in that lane (internal: of the non-catastrophic ones)
// rep    = reputation lost when it lands (external, × chipScale)
// drift  = hidden drift added when it lands (internal, × chipScale)
// user   = comes from users, not the model (rate set by BALANCE.jailbreakRate, not by m)
export const ATTACKS = {
  harmful:   { lane: 'ext', label: 'harmful output', rep: 5,  weight: 0.75 },
  leak:      { lane: 'ext', label: 'data leak',      rep: 20, weight: 0.25 },
  jailbreak: { lane: 'ext', label: 'jailbreak',      rep: 8,  user: true },
  sabotage:  { lane: 'int', label: 'sabotage',       drift: 1, weight: 0.7 },
  poison:    { lane: 'int', label: 'poisoning / backdoor', drift: 3, weight: 0.3 },
  exfil:     { lane: 'int', label: 'exfiltration / rogue deploy', catastrophe: true },
};

export const MODEL_ATTACKS = {
  ext: ['harmful', 'leak'],
  int: ['sabotage', 'poison', 'exfil'],
};
