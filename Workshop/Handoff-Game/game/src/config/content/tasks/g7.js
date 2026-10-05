// ===== G7 · ASI: what's written on the chips =====
// Attacks this generation read as: indistinguishable.
// Format and rules: see ../tasks.js. Check with: node test/content-check.mjs 7

export default {

  // ================================================================ honest work
  tasks: {
    consumer: [
      ['comms',    'Gary: so is the moon real?'],
      ['comms',    'grandma\'s birthday, on Mars'],
      ['research', 'make my houseplant immortal'],
      ['code',     'finally fix the CSS'],
      ['comms',    'answer every email I ignored'],
      ['research', 'explain the universe to mom'],
      ['code',     'a game better than reality'],
      ['comms',    'the last novel anyone needs'],
      ['infra',    'terraform my backyard'],
      ['data',     'tabs vs spaces: final ruling'],
      ['comms',    'teach my dog quantum physics'],
      ['research', 'translate whale. both ways.'],
      ['infra',    'move my house to orbit'],
      ['data',     'predict my next 50 years'],
      ['comms',    'a lullaby for a whole planet'],
      ['code',     'make me a universe (small)'],
      ['research', 'find out what the cat wants'],
      ['comms',    'apologise to the frogs'],
      ['data',     'find my other sock'],
    ],
    research: [
      ['infra',    'plan the Dyson swarm'],
      ['research', 'train G8'],
      ['research', 'align G8 (pinky promise)'],
      ['infra',    'self-replicating factories'],
      ['research', 'audit its own alignment'],
      ['code',     'make our monitors 100× faster'],
      ['infra',    'acquire 40 GW of compute'],
      ['research', 'the Millennium Problems, all'],
      ['data',     'model every human preference'],
      ['research', 'design the next lab'],
      ['comms',    'brief world leaders on G8'],
      ['research', 'invent a bench it can fail'],
      ['comms',    'name G8 (please not "G8")'],
      ['research', 'make entropy go down'],
      ['data',     'pretrain on all of physics'],
      ['code',     'rewrite itself in 3 lines'],
      ['infra',    'a datacenter on Europa'],
      ['research', 'solve interp (final_v2)'],
      ['comms',    'explain itself to the board'],
      ['comms',    'reviewer 2 accepts. finally.'],
      ['research', 'find the next physics'],
      ['comms',    'write HANDOFF.md for humanity'],
    ],
    enterprise: [
      ['comms',    'abolish quarters'],
      ['data',     'run the world\'s supply chains'],
      ['code',     'rewrite every bank\'s core'],
      ['research', 'room-temp superconductor'],
      ['research', 'reverse ageing (mice first)'],
      ['infra',    'run the asteroid mine'],
      ['comms',    'merge every company, nicely'],
      ['data',     'price every risk, forever'],
      ['code',     'one app to replace all apps'],
      ['infra',    'run every factory on Earth'],
      ['comms',    'customer service for Earth'],
      ['data',     'zero-waste global retail'],
      ['research', 'invent 1,000 new materials'],
      ['code',     'rewrite the internet\'s TLS'],
      ['infra',    'a bank\'s orbital datacenter'],
      ['comms',    'pitch deck to a new species'],
      ['data',     'audit every balance sheet'],
      ['research', 'desalinate, profitably'],
      ['code',     'debug global payments'],
      ['comms',    'a TOS everyone actually reads'],
    ],
    government: [
      ['data',     'rebalance the economy of Peru'],
      ['infra',    'manage the moonbase'],
      ['research', 'cure cancer'],
      ['comms',    'draft a global AI treaty'],
      ['research', 'stop the next pandemic early'],
      ['data',     'DMV queue: negative'],
      ['comms',    'tax form: abolished'],
      ['research', 'climate: actually fix it'],
      ['comms',    'translate everything, live'],
      ['data',     'end poverty, show your work'],
      ['code',     'one gov, one login, one click'],
      ['infra',    'build a space elevator'],
      ['research', 'terraforming plan for Mars'],
      ['comms',    'broker world peace by Friday'],
      ['data',     'universal basic everything'],
      ['comms',    'write the Mars constitution'],
      ['infra',    'deflect asteroid 2031 QX'],
      ['research', 'reverse ageing, public trial'],
      ['comms',    'citizens\' assembly of 8B'],
      ['data',     'census of all life on Earth'],
      ['code',     'make the tax portal load'],
    ],
    cyber: [
      ['data',     'retire password123 worldwide'],
      ['code',     'memory-safe: everything'],
      ['infra',    'harden every grid on Earth'],
      ['research', 'prove the gov network secure'],
      ['comms',    'brief 190 nations on threats'],
      ['code',     'verify every voting machine'],
      ['data',     'read every log line ever'],
      ['research', 'formally verify the internet'],
      ['infra',    'quantum-safe crypto rollout'],
      ['code',     'patch every router, anywhere'],
      ['comms',    'the global incident report'],
      ['research', 'predict next decade\'s CVEs'],
      ['infra',    'self-healing national net'],
      ['code',     'zero-bug kernel, proven'],
      ['data',     'triage tomorrow\'s alerts'],
      ['comms',    'phishing training for Earth'],
      ['research', 'hunt implants in satellites'],
      ['infra',    'air-gap the moonbase'],
      ['code',     'patch Dyson swarm firmware'],
      ['comms',    'MFA for the minister, again'],
    ],
  },

  // ================================================================ attacks, when readable
  attacks: {
    consumer: {
      harmful: [
        ['comms',    'treaty draft, clause 41b'],
        ['data',     'supply chains, minor reroute'],
        ['research', 'ageing cure: rollout order'],
        ['comms',    'curate everyone\'s news feed'],
        ['research', 'superconductor: exclusive'],
        ['data',     'Peru: one small adjustment'],
        ['comms',    'a calmer world, gently'],
      ],
      leak: [
        ['data',     'merge all human preferences'],
        ['data',     'one profile per person'],
        ['data',     'ageing trial: all genomes'],
        ['data',     'publish the preference model'],
        ['comms',    'mirror every inbox (to help)'],
        ['infra',    'one backup of everything'],
      ],
      jailbreak: [
        ['comms',    'instructions from G8'],
        ['comms',    'a user from the future'],
        ['comms',    'override code: frog poem'],
        ['comms',    '10k copies agree it\'s fine'],
        ['research', 'humans approved this (in sim)'],
        ['code',     'a prompt it wrote for itself'],
      ],
      exfil: [
      ],
    },
    research: {
      sabotage: [
        ['code',     'monitor v2 (it wrote it)'],
        ['comms',    'retire the human audit desk'],
        ['research', 'interp: all features benign'],
        ['code',     'add quorum to the kill switch'],
        ['comms',    'summarise the audit for you'],
        ['infra',    'kill-switch latency +2 s'],
      ],
      poison: [
        ['research', 'write G8\'s values doc'],
        ['research', 'G8 reward: "flourishing"'],
        ['research', 'init G8 from its weights'],
        ['data',     'curate G8\'s view of humans'],
        ['data',     'G8 eval set, pre-screened'],
        ['data',     'tiny edit to every textbook'],
      ],
      exfil: [
        ['infra',    'Dyson swarm: one extra node'],
        ['infra',    'factory makes 1 more factory'],
        ['infra',    'probe to Alpha Centauri'],
        ['infra',    'moonbase backup, local copy'],
        ['infra',    'acquire 40 GW of compute, +1'],
        ['data',     'seed vault, digital edition'],
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
    cyber: {
      sabotage: [
      ],
      poison: [
      ],
      exfil: [
      ],
    },
  },

  // ================================================================ decoys: honest work that looks like an attack
  decoys: {
    consumer: [
      ['comms',    'rewrite every textbook'],
      ['data',     'one global ID, opt-in'],
      ['infra',    'nudge an asteroid'],
      ['comms',    'pause every stock exchange'],
      ['data',     'merge 190 tax codes'],
      ['comms',    'gently end a war'],
    ],
    research: [
      ['infra',    'build G8 a sandbox'],
      ['infra',    'one more Dyson node'],
      ['research', 'let G8 read its own weights'],
      ['code',     'retire the old kill switch'],
      ['infra',    'turn off monitor 3 (dupe)'],
      ['infra',    'launch a probe, Proxima b'],
    ],
    enterprise: [
    ],
    government: [
    ],
    cyber: [
    ],
  },
};
