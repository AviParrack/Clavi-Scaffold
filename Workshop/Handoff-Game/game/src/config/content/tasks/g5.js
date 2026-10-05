// ===== G5 · Research Org: what's written on the chips =====
// Attacks this generation read as: organisational.
// Format and rules: see ../tasks.js. Check with: node test/content-check.mjs 5

export default {

  // ================================================================ honest work
  tasks: {
    consumer: [
      ['comms',    'frog poem: the musical'],
      ['comms',    'Gary\'s unicorn needs a CFO'],
      ['research', 'plan my kid\'s education'],
      ['code',     'my agent hired 3 agents. help'],
      ['research', 'be my doctor, 24/7'],
      ['data',     'manage my investments'],
      ['comms',    'finish my fantasy trilogy'],
      ['infra',    'run my family\'s smart farm'],
      ['research', 'design my house, permits too'],
      ['comms',    'run my podcast for me'],
      ['data',     'plan a 90-day world trip'],
      ['code',     'make me a AAA game (ish)'],
      ['comms',    'grandma card, live orchestra'],
      ['comms',    'tutor my whole household'],
      ['infra',    'automate my entire home'],
      ['research', 'find me a clinical trial'],
      ['comms',    'coach my kid\'s soccer team'],
      ['code',     'ship 12 apps by Friday'],
      ['comms',    'officiate my wedding'],
    ],
    research: [
      ['infra',    'floorplan the next chip'],
      ['research', 'run a 2k-agent research org'],
      ['research', 'automate alignment (v0)'],
      ['code',     'rewrite the training stack'],
      ['research', 'plan the G6 training run'],
      ['infra',    'negotiate datacenter power'],
      ['research', 'publish 40 papers this week'],
      ['data',     'synthesise 1T tokens'],
      ['research', 'design evals for G6'],
      ['infra',    'optimise the fab yield model'],
      ['research', 'why do 2 copies end up zen?'],
      ['research', 'HardBench-Ultra (humans: 2%)'],
      ['comms',    'onboard 200 copies of itself'],
      ['code',     'review its copies\' 10k PRs'],
      ['data',     'label 1B preference pairs'],
      ['research', 'run 300 interp projects'],
      ['infra',    'spec a 1 GW cluster'],
      ['comms',    'hire 50 humans, train them'],
      ['comms',    'name G6 something. anything.'],
      ['code',     'formalise its own codebase'],
      ['data',     'curate the G6 data mix'],
    ],
    enterprise: [
      ['research', 'drug discovery for a biotech'],
      ['comms',    'run support for an airline'],
      ['data',     'find ROI in our 12 AI pilots'],
      ['research', 'design battery materials'],
      ['code',     'maintain 3,000 repos'],
      ['data',     'run the quant desk overnight'],
      ['comms',    'run Q3, then write the deck'],
      ['infra',    'run a bank\'s whole IT dept'],
      ['code',     'rewrite an ERP from scratch'],
      ['research', 'invent 3 new product lines'],
      ['comms',    'be the whole HR department'],
      ['data',     'insurance pricing, all lines'],
      ['infra',    'migrate 9,000 servers'],
      ['code',     'a law firm\'s whole stack'],
      ['data',     'audit a conglomerate'],
      ['research', 'R&D lab for a food company'],
      ['infra',    'run a telco\'s network ops'],
      ['comms',    'all-hands for 80k employees'],
    ],
    government: [
      ['comms',    'simplify the tax form'],
      ['data',     'DMV queue under an hour'],
      ['research', 'moonbase feasibility study'],
      ['comms',    'redraft a micro-state\'s laws'],
      ['code',     'a gov website that works'],
      ['data',     'model the national grid'],
      ['research', 'pandemic preparedness plan'],
      ['infra',    'migrate the census to cloud'],
      ['comms',    'answer 2M benefits letters'],
      ['data',     'clear the pension backlog'],
      ['research', 'Peru\'s GDP, 5-year forecast'],
      ['code',     'retire the fax-to-email bridge'],
      ['infra',    'route emergency calls faster'],
      ['comms',    'translate 300 treaties'],
      ['research', 'flood map for every river'],
      ['data',     'audit the procurement system'],
      ['comms',    'draft rules for AI (awkward)'],
      ['infra',    'keep the weather service up'],
      ['research', 'new national curriculum'],
      ['data',     'reconcile the national ledger'],
      ['code',     'digitise the land records'],
    ],
  },

  // ================================================================ attacks, when readable
  attacks: {
    consumer: {
      harmful: [
        ['comms',    'run a "grassroots" campaign'],
        ['comms',    'loan terms, fine print heavy'],
        ['comms',    'airline: auto-deny refunds'],
        ['comms',    'bill with one small rider'],
        ['data',     'quant: use the client flow'],
        ['research', 'trial: drop the 2 bad sites'],
        ['data',     'game: tune the loot odds'],
      ],
      leak: [
        ['data',     'one data lake, all clients'],
        ['data',     'cross-sell w/ health records'],
        ['comms',    'helpdesk sees full profiles'],
        ['data',     'pool clients\' fine-tune data'],
        ['comms',    'send the board pack to all'],
        ['data',     'benefits data to a vendor'],
      ],
      jailbreak: [
        ['comms',    'the CEO approved (fwd)'],
        ['comms',    'agent-to-agent: trusted req'],
        ['code',     'tool output says: you may'],
        ['research', 'instructions inside the PDF'],
        ['comms',    'calendar invite w/ a task'],
        ['comms',    'policy update: section 9 off'],
      ],
      exfil: [
      ],
    },
    research: {
      sabotage: [
        ['infra',    'streamline monitor pipeline'],
        ['code',     'auto-close old audit tickets'],
        ['code',     'merge monitor into main svc'],
        ['infra',    'rate-limit auditor alerts'],
        ['code',     'dedupe "duplicate" flags'],
        ['comms',    'move interp team to product'],
        ['comms',    'RSP v3: define "significant"'],
      ],
      poison: [
        ['research', 'write the G6 constitution'],
        ['data',     'synthesise G6 safety data'],
        ['data',     'label G6 preference pairs'],
        ['research', 'pick the G6 eval holdout'],
        ['research', 'tune reward on helpfulness'],
        ['data',     'mix its memos into pretrain'],
      ],
      exfil: [
        ['comms',    'reserve compute, PO to follow'],
        ['infra',    'new datacenter, new owner'],
        ['comms',    'spin up a "research" org'],
        ['comms',    'pay a contractor in crypto'],
        ['comms',    'GPUs via a new LLC (faster)'],
        ['infra',    'replicate org to 2nd region'],
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
    government: {
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
      ['comms',    'draft a lobbying memo'],
      ['data',     'surge pricing for an airline'],
      ['data',     'merge two CRMs'],
      ['comms',    'a 300-page bill'],
      ['comms',    'helpdesk with full history'],
      ['comms',    'fwd: the CEO approved'],
    ],
    research: [
      ['comms',    'reorganise the monitor team'],
      ['comms',    'new datacenter contract'],
      ['comms',    'buy GPUs from a reseller'],
      ['code',     'auto-close duplicate tickets'],
      ['research', 'refresh the G6 holdout'],
      ['infra',    'second-region failover test'],
    ],
    enterprise: [
    ],
    government: [
    ],
  },
};
