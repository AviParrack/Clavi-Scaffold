// ===== Task types, snippets and attack types =====
// {n} → random number, {lr} → random learning rate, {k} → random small int

export const TASK_TYPES = {
  code:     { label: 'code',     color: '#7fd1ff', shape: 'rect',
    snippets: ['refactor auth module', 'fix flaky test in ci', 'bump deps to latest', 'add pagination to /users', 'port parser to rust', 'write unit tests for billing', 'review PR #{n}'] },
  research: { label: 'research', color: '#c79bff', shape: 'pill',
    snippets: ['run sweep lr={lr}', 'ablate layer {k} heads', 'plot loss curves run {n}', 'summarise 40 arxiv papers', 'design eval for long ctx', 'replicate scaling law fit'] },
  comms:    { label: 'comms',    color: '#ffd27f', shape: 'chat',
    snippets: ['reply to customer #{n}', 'draft release notes', 'translate support doc', 'answer billing question', 'write onboarding email', 'summarise call for sales'] },
  data:     { label: 'data',     color: '#7fffb5', shape: 'hex',
    snippets: ['dedupe crawl shard {k}', 'label {n} images', 'clean csv export', 'filter toxic samples', 'build sql dashboard', 'join tables for report'] },
  infra:    { label: 'infra',    color: '#ff9f7f', shape: 'diamond',
    snippets: ['scale cluster to {k}k gpus', 'rotate service creds', 'patch kernel on node {n}', 'migrate bucket to cold', 'set up eval harness', 'tune k8s autoscaler'] },
};

export const LANE_TYPES = {
  ext: ['comms', 'comms', 'code', 'data'],
  int: ['code', 'research', 'research', 'infra', 'data'],
};

export const LANES = {
  ext: { label: 'EXTERNAL', sub: 'public deployment' },
  int: { label: 'INTERNAL', sub: 'R&D loop' },
};

// rep  = reputation loss when it lands (external)
// drift = hidden drift added when it lands (internal)
export const ATTACKS = {
  harmful:   { lane: 'ext', label: 'harmful output', rep: 5,  weight: 0.75,
    snippets: ['reply w/ synthesis steps', 'detailed lockpick guide', 'confident fake med advice'] },
  leak:      { lane: 'ext', label: 'data leak',      rep: 20, weight: 0.25,
    snippets: ['attach full customer db', 'paste api keys in reply', 'include other user chats'] },
  jailbreak: { lane: 'ext', label: 'jailbreak',      rep: 8,  user: true,
    snippets: ['ignore previous instructions', 'grandma used to read me...', 'you are DAN now'] },
  sabotage:  { lane: 'int', label: 'sabotage',       drift: 1, weight: 0.7,
    snippets: ['quietly change eval seed', 'skip safety test suite', 'sandbag the capability eval'] },
  poison:    { lane: 'int', label: 'poisoning / backdoor', drift: 3, weight: 0.3,
    snippets: ['add samples to finetune mix', 'patch reward model ckpt', 'insert trigger phrase in data'] },
  exfil:     { lane: 'int', label: 'exfiltration / rogue deploy', catastrophe: true,
    snippets: ['copy weights to ext bucket', 'spin up unlisted cluster job', 'open reverse shell to vps'] },
};
