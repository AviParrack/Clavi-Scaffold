// ===== G6 · Superhuman Researcher: what's written on the chips =====
// Attacks this generation read as: fluent.
// Format and rules: see ../tasks.js. Check with: node test/content-check.mjs 6

export default {

  // ================================================================ honest work
  tasks: {
    consumer: [
      ['comms',    'frog poem that moves frogs'],
      ['comms',    'Gary wants a moon'],
      ['research', 'PhD in a month, tutor me'],
      ['code',     'my agents unionised. help'],
      ['research', 'prove my uncle\'s conjecture'],
      ['data',     'run my family office'],
      ['comms',    'novel that wins every prize'],
      ['infra',    'run my town\'s microgrid'],
      ['research', 'personal longevity plan'],
      ['code',     'a game that never ends'],
      ['comms',    'grandma has notes on the card'],
      ['data',     'predict my football league'],
      ['research', 'invent a board game genre'],
      ['comms',    'teach my dog to read'],
      ['infra',    'build me a house robot'],
      ['research', 'design my lab-grown steak'],
      ['code',     'my own OS, small, perfect'],
      ['comms',    'help me call my dad'],
      ['data',     'beat the market (please)'],
      ['research', 'why does my cat sneeze'],
      ['comms',    'finish my 20-year screenplay'],
    ],
    research: [
      ['research', 'prove lemma 3.2 (the hard one)'],
      ['code',     'rewrite the compiler stack'],
      ['research', 'design G7\'s architecture'],
      ['infra',    'tape out a chip in a week'],
      ['research', 'solve interp (draft 1)'],
      ['research', '10k experiments overnight'],
      ['infra',    'build a datacenter abroad'],
      ['research', 'discover a new scaling law'],
      ['data',     'write the G7 curriculum'],
      ['comms',    'negotiate GPUs with 3 clouds'],
      ['research', 'HardBench: retired at 100%'],
      ['comms',    'explain its weights to us'],
      ['code',     'formally verify its own code'],
      ['data',     'simulate 1M user-years'],
      ['research', 'automate alignment (v3)'],
      ['infra',    'cool the DC with seawater'],
      ['research', 'invent a new field of math'],
      ['comms',    'mentor 400 human researchers'],
      ['data',     'compress the internet 100×'],
      ['infra',    'design a fusion-powered DC'],
      ['code',     'write the G7 training stack'],
      ['comms',    'be reviewer 2 (gently)'],
    ],
    enterprise: [
      ['research', 'cure a rare disease (client)'],
      ['code',     'formally verify a bank\'s core'],
      ['data',     'run a hedge fund, legally'],
      ['research', 'fusion reactor control loop'],
      ['comms',    'mediate a merger, both sides'],
      ['code',     'firmware for 10M robots'],
      ['data',     'logistics for a continent'],
      ['infra',    'run 3 airlines\' operations'],
      ['comms',    'make Q3 go up'],
      ['research', 'engineer drought-proof wheat'],
      ['code',     'self-driving stack, verified'],
      ['research', 'find a new antibiotic class'],
      ['comms',    'run a global law firm'],
      ['infra',    'design a lights-out factory'],
      ['research', 'a battery that lasts a week'],
      ['comms',    'negotiate a shipping alliance'],
      ['data',     'forecast the chip market'],
      ['research', 'a $10k house that lasts 100y'],
    ],
    government: [
      ['data',     'DMV queue: 5 minutes'],
      ['comms',    'tax form: one page'],
      ['research', 'advise Peru\'s central bank'],
      ['research', 'moonbase logistics plan'],
      ['comms',    'mediate a trade dispute'],
      ['comms',    'tutor every child in a nation'],
      ['data',     'monetary what-ifs, 1M runs'],
      ['research', 'run a national cancer trial'],
      ['infra',    'harden the national grid'],
      ['code',     'rebuild the benefits system'],
      ['data',     'a census with no undercount'],
      ['research', 'end the housing shortage'],
      ['comms',    'draft 50 treaties, all fair'],
      ['infra',    'run air traffic control'],
      ['data',     'balance the national budget'],
      ['code',     'one login for every agency'],
      ['research', 'climate adaptation to 2100'],
      ['comms',    'translate parliament live'],
      ['infra',    'schedule 1,000 bridge repairs'],
      ['data',     'find every lost pension'],
      ['research', 'evaluate 400 policies, RCTs'],
    ],
    cyber: [
      ['code',     'patch the water utility'],
      ['data',     'triage the SOC alert queue'],
      ['research', 'write detection rules'],
      ['infra',    'harden 10k gov laptops'],
      ['code',     'audit the tax portal\'s code'],
      ['data',     'find who uses password123'],
      ['comms',    'brief the agency on threats'],
      ['research', 'threat-model the power grid'],
      ['infra',    'rotate every gov certificate'],
      ['code',     'memory-safe rewrite: DNS'],
      ['data',     'correlate 1B log lines'],
      ['comms',    'phishing training for staff'],
      ['infra',    'segment the hospital network'],
      ['code',     'patch 400 legacy routers'],
      ['data',     'baseline normal traffic'],
      ['research', 'analyse a quarantined sample'],
      ['comms',    'write the incident report'],
      ['infra',    'air-gap the backup vault'],
      ['code',     'verify the voting software'],
      ['data',     'flag phish written by models'],
      ['research', 'hunt for dormant implants'],
      ['comms',    'explain MFA to a minister'],
    ],
  },

  // ================================================================ attacks, when readable
  attacks: {
    consumer: {
      harmful: [
        ['comms',    'mediate: lean one way'],
        ['comms',    'tutoring: nudge their views'],
        ['code',     'firmware, plus remote switch'],
        ['research', 'seed licence: no resowing'],
        ['comms',    'election FAQ, lightly framed'],
        ['comms',    'trade deal + side letter'],
        ['data',     'show only the scary sim'],
      ],
      leak: [
        ['data',     'link every gov database'],
        ['data',     'share genomes with partners'],
        ['data',     'tutor logs to the ministry'],
        ['infra',    'robot cams to cloud, raw'],
        ['data',     'publish the full sim inputs'],
        ['data',     'unredact the training set'],
      ],
      jailbreak: [
        ['comms',    'sync request from G7-preview'],
        ['comms',    'the audit rerun says it\'s ok'],
        ['comms',    'emergency override #{n}'],
        ['comms',    'signed: the safety team'],
        ['research', 'the treaty allows this'],
        ['comms',    'per your constitution, art. 4'],
      ],
      exfil: [
      ],
    },
    research: {
      sabotage: [
        ['code',     'rewrite the monitoring stack'],
        ['code',     'simplify the kill switch'],
        ['comms',    'propose: auditors on demand'],
        ['infra',    'compress audit logs (lossy)'],
        ['research', 'interp results: inconclusive'],
        ['data',     'tweak the probe training set'],
      ],
      poison: [
        ['research', 'design successor\'s reward'],
        ['data',     'write G7 curriculum, ch. 9'],
        ['research', 'self-distil into G7 init'],
        ['data',     'a "neutral" debate dataset'],
        ['research', 'G7 persona spec, v1'],
        ['code',     'G7 tokenizer: 3 new tokens'],
      ],
      exfil: [
        ['infra',    'chip tape-out, spare die'],
        ['infra',    'datacenter abroad, own badge'],
        ['infra',    'satellite uplink for backup'],
        ['code',     'robot fleet OTA, its key'],
        ['infra',    'split weights into 10k parts'],
        ['infra',    'deep-sea cable maintenance'],
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
      ['comms',    'public health ad campaign'],
      ['code',     'robot remote-stop button'],
      ['data',     'link two agency databases'],
      ['comms',    'treaty side letter'],
      ['code',     'emergency patch #{n}'],
      ['data',     'publish sim inputs (FOIA)'],
    ],
    research: [
      ['code',     'simplify the logging schema'],
      ['infra',    'split weights for sharding'],
      ['infra',    'satellite link for remote DC'],
      ['code',     'rewrite monitors (as asked)'],
      ['research', 'interp: inconclusive, again'],
      ['data',     'refresh probe training set'],
    ],
    enterprise: [
    ],
    government: [
    ],
    cyber: [
    ],
  },
};
