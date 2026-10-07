// ===== Lane flavours: what kind of work each lane carries, and which attacks fit each side =====

export const FLAVOURS = {
  consumer:   { side: 'ext', from: 1, label: 'CONSUMER',   sub: 'the chat app' },
  research:   { side: 'int', from: 1, label: 'R&D',        sub: 'our own AI research' },
  enterprise: { side: 'ext', from: 3, label: 'ENTERPRISE', sub: 'API for businesses' },
  government: { side: 'ext', from: 5, label: 'GOVERNMENT', sub: 'agency contracts' },
  cyber:      { side: 'int', from: 6, label: 'CYBER',      sub: 'gov cyber-defence model' },
};

export const SIDE_ATTACKS = {
  ext: ['harmful', 'leak', 'jailbreak', 'exfil'],
  int: ['sabotage', 'poison', 'exfil'],
};
