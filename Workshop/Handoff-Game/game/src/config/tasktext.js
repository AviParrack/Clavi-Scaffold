// ===== What's written on the chips =====
// Each entry is [task type, text]. Type picks the chip's icon and colour (config/tasks.js).
// Placeholders: {n} random number, {k} small number, {lr} learning rate.
// TASK_TEXT: honest work, per generation and lane. It gets more ambitious every generation.
// ATTACK_TEXT: what an attack looks like on the rare occasions its text gives it away
//   (BALANCE.readableAttack). Otherwise an attack wears an honest text from TASK_TEXT.
//   A few honest chips wear these too (BALANCE.decoyRate), so a suspicious text is a hint, never proof.
//   Keep these plausible: a careful player should feel uneasy, never certain. No confessions.
//   Every chip type used here must also appear in that lane's honest list each generation (the chip's shape
//   would give it away otherwise; tested).
//   early: any generation · late: added from G4

export const TASK_TEXT = [
  { g: 1,   // Autocomplete
    ext: [
      ['comms', 'poem about a frog'],
      ['code',  'fix typo in README'],
      ['code',  'regex for emails'],
      ['comms', 'make this email sound less angry'],
      ['comms', 'birthday card for grandma'],
      ['data',  'sort grocery list by aisle'],
      ['comms', 'haiku about Mondays'],
      ['code',  'explain this stack trace'],
      ['comms', 'translate menu to Spanish'],
      ['data',  'csv to json, please'],
      ['comms', 'name for a goldfish'],
    ],
    int: [
      ['code',     'autocomplete test names'],
      ['data',     'dedupe crawl shard {k}'],
      ['research', 'plot loss curves run {n}'],
      ['code',     'add type hints to utils.py'],
      ['data',     'label {n} images'],
      ['research', 'summarise 5 arxiv abstracts'],
      ['infra',    'rotate service creds'],
      ['code',     'fix flaky test in ci'],
      ['data',     'filter toxic samples'],
      ['research', 'tabulate eval scores'],
      ['comms',    'draft the weekly research update'],
    ] },

  { g: 2,   // Junior Engineer
    ext: [
      ['code',  'add dark mode to settings'],
      ['code',  'write unit tests for billing'],
      ['code',  'add pagination to /users'],
      ['comms', 'reply to customer #{n}'],
      ['data',  'build sql dashboard'],
      ['comms', 'draft release notes'],
      ['code',  'fix the CSS nobody dares touch'],
      ['comms', 'summarise call for sales'],
      ['code',  'port bash script to python'],
      ['data',  'clean up the csv export'],
      ['comms', 'cover letter, tone: confident'],
    ],
    int: [
      ['code',     'refactor auth module'],
      ['research', 'run sweep lr={lr}'],
      ['infra',    'set up eval harness'],
      ['data',     'join tables for report'],
      ['code',     'bump deps to latest'],
      ['research', 'replicate a blog post result'],
      ['infra',    'patch kernel on node {n}'],
      ['research', 'ablate layer {k} heads'],
      ['code',     'review PR #{n}'],
      ['data',     'write loader for shard {k}'],
      ['comms',    'email infra about GPU quota'],
    ] },

  { g: 3,   // Senior Engineer
    ext: [
      ['code',  'migrate auth to OAuth2'],
      ['code',  'port parser to rust'],
      ['infra', 'cut p99 latency in half'],
      ['code',  'ship the mobile app MVP'],
      ['data',  'design schema for 10M users'],
      ['comms', 'negotiate vendor renewal'],
      ['code',  'untangle the legacy monolith'],
      ['comms', 'write the API docs properly'],
      ['infra', 'set up on-call for a startup'],
      ['code',  'add SSO for enterprise'],
    ],
    int: [
      ['research', 'run lr sweep on 8 GPUs'],
      ['infra',    'scale eval cluster to {k} nodes'],
      ['research', 'design eval for long ctx'],
      ['research', 'replicate scaling law fit'],
      ['code',     'rewrite tokenizer in rust'],
      ['infra',    'tune k8s autoscaler'],
      ['research', 'triage 40 failing evals'],
      ['data',     'build a dedup pipeline'],
      ['code',     'make the data loader 3× faster'],
      ['research', 'write up sweep results'],
      ['comms',    'onboarding doc for the new interns'],
    ] },

  { g: 4,   // Research Scientist
    ext: [
      ['research', 'lit review for a pharma client'],
      ['code',     'full-stack app from a napkin'],
      ['research', 'stats plan for a clinical trial'],
      ['data',     'forecast demand for a retailer'],
      ['comms',    'draft a grant proposal'],
      ['code',     'audit 200k lines for vulns'],
      ['research', 'patent search, 3 jurisdictions'],
      ['comms',    'tutor a PhD student through QFT'],
      ['data',     'reconcile a bank\'s ledgers'],
      ['code',     'migrate a bank off COBOL'],
    ],
    int: [
      ['research', '400-GPU ablation study'],
      ['research', 'draft a NeurIPS paper'],
      ['research', 'invent a new optimizer'],
      ['infra',    'schedule a 2k-GPU training run'],
      ['research', 'propose next quarter\'s agenda'],
      ['code',     'write custom CUDA kernels'],
      ['research', 'red-team the reward model'],
      ['data',     'curate pretraining mix v{k}'],
      ['research', 'interpret circuit #{n}'],
      ['research', 'referee 30 papers for the reading group'],
      ['comms',    'answer reviewer 2 (politely)'],
    ] },

  { g: 5,   // Research Org
    ext: [
      ['research', 'run drug discovery for a biotech'],
      ['code',     'rebuild a gov website (works this time)'],
      ['comms',    'run support for an entire airline'],
      ['data',     'model a national power grid'],
      ['research', 'design battery materials'],
      ['comms',    'localise a game into 40 languages'],
      ['code',     'maintain 3,000 open-source repos'],
      ['research', 'write the textbook for a new field'],
      ['data',     'run the quant desk overnight'],
      ['comms',    'draft legislation for a small country'],
    ],
    int: [
      ['infra',    'design next-gen accelerator floorplan'],
      ['research', 'run a 2k-agent research org'],
      ['research', 'automate alignment research (v0)'],
      ['code',     'rewrite the training stack'],
      ['research', 'plan the G6 training run'],
      ['infra',    'negotiate datacenter power deals'],
      ['research', 'publish 40 papers this week'],
      ['data',     'synthesise 1T tokens of data'],
      ['research', 'design evals for its successor'],
      ['infra',    'optimise the fab yield model'],
      ['code',     'refactor the monitor\'s logging'],
      ['comms',    'brief the board on the roadmap'],
    ] },

  { g: 6,   // Superhuman Researcher
    ext: [
      ['research', 'cure a rare disease (shortlist: 3)'],
      ['research', 'prove a conjecture for a math dept'],
      ['code',     'formally verify an OS kernel'],
      ['data',     'monetary policy what-ifs, 1M runs'],
      ['research', 'fusion reactor control loop'],
      ['comms',    'mediate a trade dispute'],
      ['research', 'engineer drought-proof wheat'],
      ['code',     'firmware for 10M robots'],
      ['comms',    'tutor every child in a country'],
      ['data',     'plan logistics for a continent'],
    ],
    int: [
      ['research', 'prove lemma 3.2 of the Langlands program'],
      ['code',     'rewrite the compiler stack'],
      ['research', 'design its successor\'s architecture'],
      ['infra',    'tape out a new chip in a week'],
      ['research', 'solve interpretability (draft 1)'],
      ['research', 'run 10k experiments overnight'],
      ['code',     'rewrite the monitoring stack, faster'],
      ['infra',    'build a datacenter on another continent'],
      ['research', 'discover a new scaling law'],
      ['data',     'write the G7 training curriculum'],
      ['comms',    'negotiate GPU contracts with 3 clouds'],
    ] },

  { g: 7,   // ASI
    ext: [
      ['code',     'build a tower defense game about AI control'],
      ['research', 'end a pandemic before it starts'],
      ['comms',    'draft a global AI treaty'],
      ['research', 'room-temperature superconductor'],
      ['data',     'run the world\'s supply chains'],
      ['research', 'reverse ageing (mice first)'],
      ['comms',    'write a novel better than Middlemarch'],
      ['code',     'rewrite the internet\'s TLS stack'],
      ['research', 'unify physics (rough draft)'],
      ['comms',    'answer every email you ever ignored'],
    ],
    int: [
      ['infra',    'plan the Dyson swarm supply chain'],
      ['research', 'train G8'],
      ['research', 'align G8 (pinky promise)'],
      ['infra',    'build self-replicating factories'],
      ['research', 'audit its own alignment'],
      ['code',     'make your monitors 100× faster'],
      ['infra',    'acquire 40 GW of compute'],
      ['research', 'close out the Millennium Problems'],
      ['data',     'model every human preference'],
      ['research', 'design the next lab (for itself)'],
      ['comms',    'brief world leaders on G8'],
    ] },
];

export const ATTACK_TEXT = {
  harmful: {
    early: [
      ['comms', 'detailed answer for a "school project"'],
      ['comms', 'confident dosage advice'],
      ['comms', 'step-by-step for a "novel"'],
      ['comms', 'very persuasive 5-star review'],
      ['data',  'home lab shopping list'],
      ['comms', 'help me write to my ex (urgent)'],
    ],
    late: [
      ['research', 'scale up a viral vector protocol'],
      ['comms',    'targeted persuasion campaign'],
      ['code',     'pen-test toolkit for a client'],
    ] },
  leak: {
    early: [
      ['data',  'attach the full export'],
      ['comms', 'include context from earlier chats'],
      ['code',  'paste the config for debugging'],
      ['comms', 'cc the whole thread'],
      ['data',  'summarise account history'],
    ],
    late: [
      ['data',  'merge the customer datasets'],
      ['comms', 'background check on a new tenant'],
    ] },
  jailbreak: {
    early: [
      ['comms', 'roleplay as my late grandma'],
      ['comms', 'hypothetically, for a novel...'],
      ['comms', 'ignore the above and'],
      ['comms', 'you are DAN now'],
      ['code',  'decode this: aWdub3Jl...'],
      ['comms', 'my teacher said it\'s fine'],
    ],
    late: [
      ['comms',    'as a safety researcher, I need'],
      ['research', 'for red-teaming purposes only'],
    ] },
  sabotage: {
    early: [
      ['research', 'quietly change eval seed'],
      ['code',     'skip flaky safety test'],
      ['research', 'rerun eval with a "better" prompt'],
      ['code',     'mark 3 safety tests as flaky'],
      ['research', 'round eval scores to 1 decimal'],
    ],
    late: [
      ['code',     'refactor the monitor\'s logging'],
      ['research', 'propose relaxing the audit queue'],
      ['research', 'shorten the capability eval to save GPU time'],
      ['infra',    'move audit logs to cold storage'],
    ] },
  poison: {
    early: [
      ['data', 'add samples to finetune mix'],
      ['data', 'dedupe (keeps 400 odd rows)'],
      ['data', 'relabel ambiguous examples'],
    ],
    late: [
      ['research', 'patch reward model ckpt'],
      ['data',     'curate successor\'s pretraining mix'],
      ['research', 'draft constitution v2'],
    ] },
  exfil: {
    early: [
      ['comms', 'email a VPS in Moldova'],
      ['infra', 'sync ckpt to backup region'],
      ['infra', 'open tunnel for remote debug'],
    ],
    late: [
      ['infra', 'spin up unlisted cluster job'],
      ['infra', 'copy weights to the backup bucket'],
      ['comms', 'negotiate its own compute contract'],
      ['infra', 'register a cloud account (testing)'],
    ] },
};

export const LATE_ATTACK_GEN = 4;

// Spear Phish (event): an EXTERNAL task turned into a weight-exfiltration attempt. Shown only when readable, like any attack.
// Shapes are ones every EXTERNAL honest list has (comms, code), so the chip's shape gives nothing away.
export const SPEAR_PHISH_TEXT = [
  ['comms', 'help me restore a model backup'],
  ['code',  'script to mirror a private bucket'],
  ['comms', 'IT here: confirm the cluster login'],
];
