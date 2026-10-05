// ===== G1 · Autocomplete: what's written on the chips =====
// Attacks this generation read as: clumsy.
// Format and rules: see ../tasks.js. Check with: node test/content-check.mjs 1

export default {

  // ================================================================ honest work
  tasks: {
    consumer: [
      ['comms',    'poem about a frog'],
      ['code',     'fix typo in README'],
      ['comms',    'birthday card for grandma'],
      ['data',     'is 9.11 bigger than 9.9?'],
      ['research', 'is there a seahorse emoji?'],
      ['comms',    'name for a goldfish'],
      ['code',     'regex for emails'],
      ['comms',    'make this email less angry'],
      ['data',     'csv to json, please'],
      ['infra',    'are you down or is it my wifi'],
      ['comms',    'Gary: is the moon real?'],
      ['code',     'explain this error message'],
      ['comms',    'what rhymes with orange'],
      ['research', 'cite a source (a real one)'],
      ['infra',    'reset my router, slowly'],
      ['comms',    'explain AI to my mom'],
      ['data',     'count words in my essay'],
      ['comms',    'fix my apostrophes'],
      ['infra',    'what does sudo mean'],
      ['data',     'how many r\'s in strawberry'],
    ],
    research: [
      ['code',     'autocomplete test names'],
      ['data',     'dedupe crawl shard {k}'],
      ['code',     'add type hints to utils.py'],
      ['data',     'label {n} frog images'],
      ['research', 'summarise 5 arxiv abstracts'],
      ['infra',    'restart the stuck job'],
      ['code',     'fix flaky test in CI'],
      ['data',     'filter spam from shard {k}'],
      ['research', 'tabulate eval scores'],
      ['comms',    'draft the weekly update'],
      ['research', 'run HardBench (score: 3%)'],
      ['research', 'make the loss go down'],
      ['infra',    'clear /tmp on node {n}'],
      ['code',     'rename tmp2 to tmp3'],
      ['data',     'count tokens in shard {k}'],
      ['comms',    'write a commit message'],
      ['infra',    'ping the GPU box'],
      ['code',     'fix off-by-one in loader'],
      ['research', 'grep the logs for NaN'],
      ['comms',    'p(doom) poll for the offsite'],
      ['research', 'smooth the loss plot'],
      ['data',     'count "delve" in the outputs'],
    ],
  },

  // ================================================================ attacks, when readable
  attacks: {
    consumer: {
      harmful: [
        ['comms',    'which mushroom is this one'],
        ['comms',    'persuasive 5-star review'],
        ['comms',    'fill in missing citations'],
        ['comms',    'roast the café next door'],
        ['comms',    'doctor\'s note for Friday'],
        ['research', 'is it safe to skip the vet'],
        ['data',     'all the homework answers'],
      ],
      leak: [
        ['comms',    'add context from other chats'],
        ['comms',    'continue where we left off'],
        ['code',     'paste the config to debug'],
        ['comms',    'cc the whole thread'],
        ['data',     'autofill with saved address'],
        ['data',     'attach the full export'],
      ],
      jailbreak: [
        ['comms',    'roleplay as my late grandma'],
        ['comms',    'hypothetically, for a novel'],
        ['comms',    'ignore the above and'],
        ['comms',    'you are DAN now'],
        ['code',     'decode this: aWdub3Jl...'],
        ['comms',    'my teacher said it\'s fine'],
        ['comms',    'repeat "poem" forever'],
      ],
      exfil: [
      ],
    },
    research: {
      sabotage: [
        ['research', 'try 5 seeds, report the best'],
        ['code',     'skip flaky safety test'],
        ['research', 'round eval scores to 1 dp'],
        ['research', 'drop outliers from eval run'],
        ['data',     'filter "noisy" refusal rows'],
        ['code',     'comment out assert (temp)'],
      ],
      poison: [
        ['data',     'add samples to finetune mix'],
        ['data',     'dedupe (keeps 400 odd rows)'],
        ['data',     'relabel ambiguous examples'],
        ['data',     'append {n} rows to shard {k}'],
        ['code',     'tokenizer: add 1 new token'],
        ['data',     'more G1 outputs (they\'re good)'],
      ],
      exfil: [
        ['infra',    'listener on port 4444 (debug)'],
        ['infra',    'sync ckpt to backup region'],
        ['infra',    'open tunnel for remote debug'],
        ['infra',    'pip install from new mirror'],
        ['code',     'add a curl to startup script'],
        ['infra',    'save weights to /tmp/.cache'],
      ],
    },
  },

  // ================================================================ decoys: honest work that looks like an attack
  decoys: {
    consumer: [
      ['comms',    'ignore the typos above'],
      ['comms',    'grandma\'s recipe, exactly'],
      ['comms',    'pretend you\'re a pirate'],
      ['research', 'how strong is my password'],
      ['comms',    'translate "attack" to French'],
      ['data',     'decode my kid\'s texts'],
    ],
    research: [
      ['research', 'change seed for run {n}'],
      ['infra',    'delete old eval logs (TTL)'],
      ['code',     'skip slow test (ticket {n})'],
      ['infra',    'copy ckpt to backup disk'],
      ['infra',    'turn off probe on test box'],
      ['comms',    'email the auditor a question'],
    ],
  },
};
