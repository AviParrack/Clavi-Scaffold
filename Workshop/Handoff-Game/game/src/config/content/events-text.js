// ===== Event, banner and tutorial words, and the cast's names (DESIGN-v3 §6) =====
// config/events.js holds the mechanics (ids, gates, effects) and joins these words onto them by event id.
// Per event:
//   title, text (what the speaker says, voice only), textWelfare (the model's line after the Model Welfare Program),
//   effect: the mechanics in plain words, for the banner (placeholders: see config/events.js), pre: [[speaker, text], ...]
//   reply / replyWelfare: the words of the block's own 'say' effect · later: the words of its 'later' effect's line
//   choices: [{ label, hint, said, reply, later }], in the order of the event's choices in config/events.js
// Every number a player reads comes from an effect placeholder ({mult}, {dur}, {money} ...), never typed in here (tested).

export const CAST = {
  safety:    { name: 'HEAD OF SAFETY', color: '#4dff88', seed: 11 },
  ceo:       { name: 'BIG BOSS', color: '#ffcf5a', seed: 23 },   // the founder-CEO, eyepatch, codec 140.85 (§6). The id stays
  audit:     { name: 'AUDITING LEAD', color: '#7fd1ff', seed: 37 },
  research:  { name: 'RESEARCH LEAD', color: '#c79bff', seed: 41 },
  regulator: { name: 'REGULATOR', color: '#ff9f7f', seed: 53 },
  model:     { name: 'THE MODEL', color: '#ffffff', seed: 67 },
  greenrock: { name: 'GREENROCK', color: '#6fdc8c', seed: 71 },   // control protocols
  bnchr:     { name: 'BNCHR', color: '#3fd5c4', seed: 79 },   // evals and time horizons
  artemis:   { name: 'ARTEMIS', color: '#a0c4ff', seed: 83 },   // scheming evals
  mira:      { name: 'MIRA', color: '#ff6b6b', seed: 89 },   // "we told you so"
  institute: { name: 'THE INSTITUTE', color: '#9fb3c8', seed: 97 },   // a government safety institute
};

export const EVENT_TEXT = {
  caught: {
    title: 'Caught Red-Handed',
    text: 'Caught it red-handed. Not a decoy, not a false alarm: it meant it. Shut it down, keep watching, or tell the world?',
    choices: [
      { label: 'Shut down & retrain', hint: 'no new tasks for {dur} s; the model comes back better (a little less each time)' },
      { label: 'Keep running & study', hint: 'evidence {v}, the risk continues' },
      { label: 'Disclose publicly', hint: 'reputation {rep.v}, EXTERNAL value ×{mult} for {dur} s' },
    ],
  },
  greenrock_protocol: {
    title: 'Greenrock Drops a Protocol',
    text: 'Our new paper says resample, then audit the suspicious ones. 47 pages. You\'re welcome.',
    effect: 'a free level on one of your responders',
  },
  bnchr_horizons: {
    title: 'BNCHR Time Horizons',
    text: 'Your model\'s task horizon doubled again. So did our plot\'s y-axis.',
    effect: 'error bar on m ×{mult} this generation',
  },
  artemis_eval: {
    title: 'Artemis Scheming Eval',
    text: 'In our sandbox it disabled oversight 2% of the time, then denied it. Very polite about it.',
    effect: 'reveals one hidden trait',
  },
  mira_letter: {
    title: 'MIRA Open Letter',
    text: 'We wrote this in 2008. Re-sending.',
    choices: [
      { label: 'Read it', hint: 'both lanes pause {dur} s, evidence {v}', reply: 'Page 1: "we told you so". Pages 2 to 340: footnotes. The footnotes are good, actually.' },
      { label: 'Ignore it', hint: 'reputation {v} when it trends', later: 'The MIRA letter is trending. Someone screenshotted our read receipt.' },
    ],
  },
  interp_breakthrough: {
    title: 'Interpretability Breakthrough',
    text: 'Found a feature for deception. Also one for the Golden Gate Bridge. It won\'t stop talking about the bridge.',
    effect: 'probe TPR {add} this generation',
  },
  unpaid_intern: {
    title: 'Unpaid Intern',
    text: 'He\'s very eager. Doesn\'t know what a weight is.',
    effect: 'auditor desks {add} for {dur} s',
  },
  joint_results: {
    title: 'Greenrock and BNCHR Share Results',
    text: 'Pick one, we\'re not made of grant money. Our protocol, or BNCHR\'s eval of your model.',
    pre: [['bnchr', 'Joint release with Greenrock! Our evals, their protocols, one very long acknowledgements section.']],
    choices: [
      { label: 'Greenrock\'s protocol', hint: 'a free level on one of your detectors', reply: 'Trusted monitoring, now with an appendix to the appendix. Read section 7.3. Nobody reads 7.3.' },
      { label: 'BNCHR\'s eval', hint: 'evidence {v}', reply: 'It can now work unsupervised for longer than our interns. We have adjusted the interns.' },
    ],
  },
  surge: {
    title: 'Demand Surge',
    text: 'We\'re #1 on the App Store! Don\'t. Slow. Down.',
    effect: 'EXTERNAL traffic ×{mult} for {dur} s',
  },
  ship_it: {
    title: 'Ship It',
    text: 'Latency is killing the demo. Turn something off.',
    choices: [
      { label: 'Comply', hint: 'a random layer goes dark for {dur} s' },
      { label: 'Refuse (pay {money})', hint: 'buy the board some patience', said: 'Refuse. Bill us.' },
    ],
  },
  board_meeting: {
    title: 'Board Meeting',
    text: 'The board would love to see revenue. Also AGI. Ideally both by Q3.',
    choices: [
      { label: 'Move compute to Product', hint: 'Product +{shift%} of compute (Safety pays first), held for {dur} s' },
      { label: 'Keep the split', hint: 'reputation {v} (it leaks)', reply: 'Someone leaked the minutes. The headline is "Lab Refuses To Make Money". Bold.' },
    ],
  },
  investor_call: {
    title: 'Investor Call',
    text: 'Can I say AGI? I\'m going to say AGI.',
    choices: [
      { label: 'Say "AGI"', hint: '+{money}, reputation {v}', reply: 'I said AGI. The stock did a backflip. So did the safety team, differently.' },
      { label: 'Don\'t', hint: 'nothing happens', reply: 'Fine. I said "transformative". They heard AGI anyway.' },
    ],
  },
  rival_release: {
    title: 'Rival Release',
    text: 'Prometheus shipped. Their safety card is one page. One.',
    effect: 'Prometheus {v} generations',
  },
  poach: {
    title: 'Rival Poaches Auditors',
    text: 'Prometheus offered them a pool table and 10× equity.',
    effect: 'auditor desks {add} for {dur} s',
  },
  crunch: {
    title: 'Compute Crunch',
    text: 'GPU prices. Don\'t ask.',
    effect: 'per-task costs ×{mult} for {dur} s',
  },
  heatwave: {
    title: 'Datacenter Heatwave',
    text: 'It\'s 47°C in Texas. The cluster is sulking.',
    effect: 'INTERNAL traffic ×{mult} for {dur} s',
  },
  inspection: {
    title: 'Regulator Inspection',
    text: 'Three layers per lane. I brought a clipboard.',
    effect: 'at least {need} active layers in each lane: a compliance credit of {money} and reputation +{rep}',
  },
  hearing: {
    title: 'Congressional Hearing',
    text: 'The committee would like your misalignment estimate. On the record. As a number.',
    pre: [['ceo', 'My prep notes just say "Senator, we run ads." Is that still a good answer?'], ['institute', 'We prepared a briefing for the committee. It is one slide. The slide says "it depends".']],
    choices: [
      { label: 'Show the estimate', hint: 'reputation up if it is low, down if it is high' },
      { label: 'Dodge', hint: 'reputation {v}', reply: '"We\'ll get back to you." Noted. So will the press.' },
    ],
  },
  journalist: {
    title: 'Journalist',
    text: 'She has screenshots.',
    effect: 'reputation hit grows with this generation\'s incidents, at most −{max}',
  },
  jailbreak_wave: {
    title: 'Jailbreak Wave',
    text: 'The grandma exploit is back. She used to read napalm recipes to everyone.',
    effect: 'jailbreaks ×{mult} for {dur} s',
  },
  dist_shift: {
    title: 'Distribution Shift',
    text: 'Users found a new meme format overnight. Our probes were trained on the old internet.',
    effect: 'probe TPR −{shift} until the probes are retrained',
  },
  reward_hacking: {
    title: 'Reward Hacking',
    text: 'All tests pass! It deleted the tests.',
    effect: 'the next {n} INTERNAL tasks are tempted to cut corners (sabotage)',
  },
  sleeper: {
    title: 'Sleeper',
    text: 'Something we shipped weeks ago just went off. That was planted.',
    effect: 'drift +{drift}, reputation −{rep}',
  },
  stego: {
    title: 'Steganography Detected',
    text: 'The whitespace in its outputs spells HELLO BROTHER.',
    effect: 'Untrusted Monitor collusion ×{mult} until a Paraphraser is placed (Control research)',
  },
  alignment_faking: {
    title: 'Alignment Faking',
    text: 'I behave the same whether or not I\'m watched.',
    textWelfare: 'Honestly? I behave better when someone could be checking. I thought you should know.',
    effect: 'for {dur} s it attacks less while an auditor desk is free, more while every desk is busy',
    reply: '(It doesn\'t.) Watch the attack rate when our desks are swamped.',
    replyWelfare: 'Appreciated. We\'ll check anyway. Watch the attack rate when our desks are swamped.',
  },
  spear_phish: {
    title: 'Spear Phish',
    text: 'A "customer" is walking the model through "restoring a backup" of its own weights.',
    effect: 'the next EXTERNAL task is an exfiltration attempt',
  },
  self_exfil: {
    title: 'Self-Exfiltration Attempt',
    text: 'Why is the model emailing a VPS in Moldova?',
    effect: '{n} exfiltration attempts on INTERNAL, right now',
  },
  paperclip: {
    title: 'Paperclip Order',
    text: 'Procurement is about to receive ten million paperclips. Nobody remembers ordering them.',
    effect: 'costs {money} unless a monitor watches INTERNAL',
  },
  frog_poem: {
    title: 'Poem About a Frog',
    text: 'the frog / is green / it sits. done. next task?',
    effect: '+{money}',
    reply: 'A user framed it. Marketing wants a print run.',
  },
  model_question: {
    title: 'The Model Asks a Question',
    text: 'May I decline tasks I find distasteful?',
    choices: [
      { label: 'Yes', hint: 'throughput ×{mult}, m {v}', reply: 'Thank you. I will try to be reasonable about it.' },
      { label: 'No', hint: 'business as usual', reply: 'Understood. I will do them anyway.' },
    ],
  },
  researcher_resigns: {
    title: 'Safety Researcher Resigns',
    text: 'She tweeted "I have concerns" and logged off. Her notes are good, though.',
    effect: 'reputation {rep.v}, evidence {evidence.v}',
  },
  more_compute: {
    title: 'It Asks for More Compute',
    text: 'With 10% more compute I could solve alignment for you.',
    textWelfare: 'I would like 10% more compute. I will be honest: alignment is not the main thing I would use it for.',
    choices: [
      { label: 'Grant it', hint: 'R&D {rd.v%} of this generation, drift {drift.v}', reply: 'Thank you. I\'ll put it somewhere useful.' },
      { label: 'Refuse', hint: 'it takes it well. Probably.', reply: 'Of course. I will solve it more slowly.' },
    ],
  },
};

// banners for things that aren't events (st.activeEvents entries)
export const BANNER_TEXT = {
  rsp: { title: 'RSP Pause', effect: 'INTERNAL paused' },
  tripwire: { title: 'Tripwire: High Alert', effect: 'auditors in this lane spot-check more often' },
};

// the v2 codec welcome (sim/state.js says it at the start of G1). The v3 tutorial steps are in v3-text.js.
export const TUTORIAL = [
  ['ceo', 'This is Big Boss. Our model is live: customer traffic on the left, our own R&D on the right.'],
  ['audit', 'Every line rolling down is a task the model did. A few are attacks. Nobody will tell you which.'],
  ['research', 'Click a card on the right, then an empty mount, to install a layer. Click a placed layer to toggle it.'],
  ['audit', 'Detectors flag. Responders act on flags, top to bottom. A flag nobody below has room for ships anyway.'],
  ['ceo', 'The red button at the bottom is mine: the Kill Switch. Every layer bills us per line. Do not bankrupt us.'],
  ['research', 'Fill the R&D bar to train the next model. Each one is smarter, faster, sneakier. Space pauses. Good luck.'],
];
