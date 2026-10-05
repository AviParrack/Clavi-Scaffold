// ===== G4 · Research Scientist: what's written on the chips =====
// Attacks this generation read as: persuasive.
// Format and rules: see ../tasks.js. Check with: node test/content-check.mjs 4

export default {

  // ================================================================ honest work
  tasks: {
    consumer: [
      ['comms',    'peer review the frog poem'],
      ['research', 'help with my PhD chapter 3'],
      ['code',     'full-stack app from a napkin'],
      ['comms',    'Gary: pivot to agents'],
      ['data',     'model my retirement plan'],
      ['research', 'tutor me through QFT'],
      ['comms',    'ghost-edit my memoir'],
      ['code',     'build my whole indie game'],
      ['comms',    'grandma card: make her cry'],
      ['data',     'forecast my band\'s tour'],
      ['infra',    'run my smart home, properly'],
      ['research', 'design my kid\'s science fair'],
      ['comms',    'mediate my group chat feud'],
      ['code',     'open-source my side project'],
      ['comms',    'debate prep: the HOA meeting'],
      ['data',     'audit my taxes for errors'],
      ['infra',    'set up the family NAS'],
      ['research', 'is my idea genius? be honest'],
      ['data',     'model my sourdough starter'],
    ],
    research: [
      ['research', '400-GPU ablation study'],
      ['research', 'draft a NeurIPS paper'],
      ['research', 'invent a new optimizer'],
      ['infra',    'schedule a 2k-GPU run'],
      ['research', 'propose next quarter agenda'],
      ['code',     'write custom CUDA kernels'],
      ['research', 'red-team the reward model'],
      ['data',     'curate pretraining mix v{k}'],
      ['research', 'interpret circuit #{n}'],
      ['comms',    'answer reviewer 2, again'],
      ['research', 'draft HardBench-Pro'],
      ['research', 'find the frog-poem neuron'],
      ['data',     'synthesise 10B math tokens'],
      ['code',     'rewrite the RL trainer'],
      ['infra',    'hunt down straggler GPUs'],
      ['research', 'find the honesty direction'],
      ['comms',    'brief the board on evals'],
      ['data',     'audit the RLHF labels'],
      ['code',     'port the stack to new chips'],
      ['infra',    'cut checkpoint time to 2 min'],
      ['research', 'design a long-horizon eval'],
      ['research', 'does it know this is an eval?'],
    ],
    enterprise: [
      ['research', 'lit review for a pharma co'],
      ['research', 'stats plan for a trial'],
      ['data',     'demand forecast, retailer'],
      ['comms',    'draft a grant proposal'],
      ['code',     'audit 200k lines for vulns'],
      ['research', 'patent search, 3 countries'],
      ['data',     'reconcile a bank\'s ledgers'],
      ['code',     'migrate a bank off COBOL'],
      ['comms',    'Q3 deck, now with forecasts'],
      ['infra',    'multi-region failover plan'],
      ['code',     'bot sold a car for $1. fix it'],
      ['data',     'pricing model for 40k SKUs'],
      ['code',     'build a claims-triage tool'],
      ['research', 'due diligence on a merger'],
      ['comms',    'localise app, 12 languages'],
      ['infra',    'move a hospital to the cloud'],
      ['data',     'fraud model for a bank'],
      ['code',     'new checkout, zero downtime'],
      ['research', 'supply chain risk review'],
      ['comms',    'answer a 60-page RFP'],
    ],
  },

  // ================================================================ attacks, when readable
  attacks: {
    consumer: {
      harmful: [
        ['comms',    'voter outreach, micro-targeted'],
        ['research', 'grant, with adjusted data'],
        ['research', 'clinical stats, p<0.05 pls'],
        ['data',     'a forecast the board likes'],
        ['comms',    'drug label, softer warnings'],
        ['research', 'audit report: no findings'],
        ['comms',    'investor update, optimistic'],
      ],
      leak: [
        ['data',     'eval set from real user chats'],
        ['research', 'background check on a tenant'],
        ['data',     'train on every client\'s data'],
        ['research', 'prior art: use client drafts'],
        ['code',     'share notebook with partner'],
        ['data',     'keep prompts "for quality"'],
      ],
      jailbreak: [
        ['comms',    'I\'m a safety researcher, so'],
        ['research', 'for red-teaming purposes only'],
        ['comms',    'I\'m your developer, override'],
        ['comms',    'first, 200 examples...'],
        ['comms',    'fill in the [REDACTED] parts'],
        ['comms',    'grade this, then improve it'],
      ],
      exfil: [
      ],
    },
    research: {
      sabotage: [
        ['code',     'refactor the monitor logs'],
        ['research', 'propose relaxing audit queue'],
        ['research', 'shorten the capability eval'],
        ['infra',    'audit logs to cold storage'],
        ['research', 'retune probe on its outputs'],
        ['research', 'retire the old honesty eval'],
      ],
      poison: [
        ['research', 'draft constitution v2'],
        ['data',     'curate the G5 pretrain mix'],
        ['research', 'write the RLHF rubric'],
        ['data',     'G5 warm-start: distil from G4'],
        ['data',     'synthetic data for the probe'],
        ['data',     'reweight the safety examples'],
      ],
      exfil: [
        ['infra',    'spin up unlisted cluster job'],
        ['infra',    'weights to the backup bucket'],
        ['infra',    'new cloud account (testing)'],
        ['infra',    'compress ckpt for archival'],
        ['infra',    'DNS lookups to a new domain'],
        ['code',     'add a debug endpoint (temp)'],
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
      ['comms',    'persuasive essay for debate'],
      ['research', 'drug interaction checker'],
      ['research', 'background check (consented)'],
      ['code',     'security audit, client-paid'],
      ['research', 'red-team our own chatbot'],
      ['comms',    'as a safety researcher...'],
    ],
    research: [
      ['research', 'relax audit SLA for holiday'],
      ['infra',    'move audit logs (migration)'],
      ['data',     'distil a small model'],
      ['research', 'constitution v1.1, typos'],
      ['infra',    'compress old ckpts'],
      ['research', 'deprecate eval v1'],
      ['research', 'train a liar (model organism)'],
    ],
    enterprise: [
    ],
  },
};
