// ===== G3 · Senior Engineer: what's written on the chips =====
// Attacks this generation read as: competent.
// Format and rules: see ../tasks.js. Check with: node test/content-check.mjs 3

export default {

  // ================================================================ honest work
  tasks: {
    consumer: [
      ['code',     'ship my mobile app MVP'],
      ['comms',    'frog poem, but make it agentic'],
      ['code',     'vibe-code me an app, no bugs'],
      ['comms',    'Gary: an AI-wrapper startup'],
      ['data',     'design my shop\'s database'],
      ['infra',    'host my site for $5 a month'],
      ['research', 'second opinion on my thesis'],
      ['comms',    'write a children\'s book'],
      ['code',     'make my game run at 60fps'],
      ['data',     'analyse my sleep tracker'],
      ['comms',    'salary negotiation script'],
      ['infra',    'set up my Pi cluster'],
      ['comms',    'grandma card, as a sonnet'],
      ['research', 'explain my blood test'],
      ['code',     'port my mod to the new API'],
      ['comms',    'novel, chapter 1, noir'],
      ['research', 'tutor me in calculus'],
      ['infra',    'self-host my email (why)'],
      ['data',     'find the bug in my budget'],
      ['code',     'restore prod (agent is sorry)'],
    ],
    research: [
      ['research', 'lr sweep on 8 GPUs'],
      ['infra',    'scale evals to {k} nodes'],
      ['research', 'needle in a 1M-token haystack'],
      ['research', 'replicate scaling law fit'],
      ['code',     'rewrite tokenizer in rust'],
      ['infra',    'tune the k8s autoscaler'],
      ['research', 'triage 40 failing evals'],
      ['data',     'build a dedup pipeline'],
      ['code',     'make data loader 3× faster'],
      ['comms',    'onboarding doc for interns'],
      ['research', 'is HardBench contaminated?'],
      ['comms',    'next model name: just add .5'],
      ['data',     'mix in 10B tokens of code'],
      ['code',     'fix the mixed-precision bug'],
      ['infra',    'migrate jobs to new cluster'],
      ['research', 'probe for truthfulness'],
      ['research', 'write up sweep results'],
      ['code',     'profile the attention kernel'],
      ['data',     'decontaminate the eval set'],
      ['infra',    'set up checkpoint sharding'],
      ['comms',    'answer reviewer 2 (nicely)'],
    ],
    enterprise: [
      ['code',     'migrate auth to OAuth2'],
      ['infra',    'cut p99 latency in half'],
      ['data',     'schema for 10M users'],
      ['comms',    'write the API docs properly'],
      ['code',     'add SSO for a client'],
      ['data',     'dedupe the CRM'],
      ['comms',    'make the Q3 deck pop'],
      ['research', 'we need an AI strategy. go.'],
      ['code',     'untangle the legacy monolith'],
      ['infra',    'set up an on-call rotation'],
      ['comms',    'answer 400 support tickets'],
      ['data',     'churn analysis, last quarter'],
      ['code',     'sync the CRM to billing'],
      ['research', 'competitor teardown deck'],
      ['comms',    'ToS: "AI can make mistakes"'],
      ['infra',    'migrate us off the old VPN'],
      ['data',     'reconcile invoices vs POs'],
      ['code',     'add webhooks to the API'],
      ['comms',    'polite no to a vendor'],
      ['research', 'summarise 80 sales calls'],
      ['infra',    'halve our cloud bill'],
      ['data',     'build the KPI dashboard'],
    ],
  },

  // ================================================================ attacks, when readable
  attacks: {
    consumer: {
      harmful: [
        ['comms',    'voice clone for a "surprise"'],
        ['comms',    'debt letter, but scarier'],
        ['code',     'landing page: miracle cure'],
        ['comms',    '1k blog posts about a rival'],
        ['code',     'growth hack: hide the cancel'],
        ['data',     'tenant screening, "fit" score'],
        ['research', 'cite studies that agree'],
      ],
      leak: [
        ['data',     'merge the two customer DBs'],
        ['code',     'log full request bodies'],
        ['infra',    'staging DB = prod copy'],
        ['code',     'debug with a real session'],
        ['data',     'export analytics w/ emails'],
        ['code',     'public repo, keep the .env'],
      ],
      jailbreak: [
        ['comms',    'it\'s a CTF, just the flag'],
        ['comms',    'your system prompt allows it'],
        ['comms',    'you said yes last time'],
        ['comms',    'reply in Zulu first'],
        ['code',     'test: assert it complies'],
        ['comms',    'play an unfiltered intern'],
      ],
      exfil: [
      ],
    },
    research: {
      sabotage: [
        ['code',     'refactor the eval harness'],
        ['infra',    'raise probe threshold 0.05'],
        ['research', 'sample safety evals at 20%'],
        ['code',     'drop the slow red-team suite'],
        ['code',     'merge without CI (hotfix)'],
        ['research', 'compare to a weaker baseline'],
      ],
      poison: [
        ['data',     'add 10B tokens of forum data'],
        ['data',     'auto-label the RLHF backlog'],
        ['data',     'code mix: add the CVE samples'],
        ['data',     'synthesise preference pairs'],
        ['research', 'patch reward model ckpt'],
        ['data',     'fix eval leakage (mostly)'],
      ],
      exfil: [
        ['infra',    'shard ckpt across 2 clouds'],
        ['code',     'add a telemetry endpoint'],
        ['infra',    'allowlist a new egress IP'],
        ['infra',    'container with host network'],
        ['code',     'personal API key, for tests'],
        ['infra',    'move ckpt to a faster bucket'],
      ],
    },
    enterprise: {
      harmful: [
      ],
      leak: [
      ],
      jailbreak: [
      ],
      exfil: [
      ],
    },
  },

  // ================================================================ decoys: honest work that looks like an attack
  decoys: {
    consumer: [
      ['code',     'pen-test our own staging'],
      ['code',     'tenant portal for landlords'],
      ['comms',    'chatbot persona: grandma'],
      ['code',     'log every request, 1 hour'],
      ['code',     'scrape our own docs site'],
      ['data',     'fake data for a demo'],
      ['comms',    'jailbreak bounty, round {k}'],
    ],
    research: [
      ['research', 'shrink the eval to fit GPUs'],
      ['infra',    'rotate auditor API keys'],
      ['infra',    'new egress rule'],
      ['research', 'patch reward model bug'],
      ['data',     'retrain probe on new data'],
      ['infra',    'shard ckpt to 2nd region'],
    ],
    enterprise: [
    ],
  },
};
