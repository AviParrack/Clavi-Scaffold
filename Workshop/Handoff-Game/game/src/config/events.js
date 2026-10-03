// ===== Events, delivered through the codec =====
// 31 events in four families (help, business, threat, model), plus 'caught', a story beat fired by the first real catch.
// Third-party orgs are affectionate parodies. The rival lab is Prometheus.
//
// Event fields
//   family, icon, speaker, text            text: what the speaker says, voice only. textWelfare: the model's line after
//                                          the Model Welfare Program
//   effect                                 the mechanics in plain words, for the banner / a codec subtitle (placeholders below)
//   pre: [[speaker, text], ...]            lines said first (a second voice)
//   lane: 'ext' | 'int' | null             which lane the banner glows on
//   minGen / maxGen, weight (default 1), cooldown (s, default BALANCE.eventCooldown), once (per game), oncePerGen
//   needsLayer: element placed and on · needs: [condition names, see sim/events.js CONDITIONS]
//   excludes: [ids] not while one of these is active · weightTrait {trait: ×}
//   weightByM: × the model's misalignment (BALANCE.threatM*): a misaligned model tries this more often
//   effects: [...] or choices: [{ label, hint, said, effects }]. A choice event pauses the game until you pick.
//                                          said: what the Head of Safety says when you pick it (default: the label)
//
// Effect descriptors (interpreted in sim/events.js; every timed one puts a banner in st.activeEvents):
//   mod {key, mult | add, dur | gen, data}   timed (dur s) or this-generation (gen: true) modifier. keys:
//        extSpawn intSpawn cost extValue income jailbreak (×) · auditorDesks probeTPR (+) · err (× error bar) · faking (data)
//   money {secs}: secs × this generation's EXTERNAL income per second (rules.js incomePerSec), so a price keeps its bite
//   rep {v} · evidence {v} · m {v} · drift {v} · rival {v} · rd {v × rdNeed} · retrain {v, decay}: m −v × decay^(times used)
//   probeShift {shift} · forceOff {dur} · pause {dur} · inspection {secs, rep, need} · journalist {per, max}
//   sleeper {drift, rep} · freeLevel {role} · revealTrait · stego {mult} · rewardHack {n, p} · forceAttack {lane, type, n, now, gap}
//   paperclip {secs, watchers} · hearing {base, slope} · boardSplit {shift, dur} · throughput {mult}
//   say {speaker, text, textWelfare} · later {after, say: [speaker, text], effects}
//
// Placeholders in effect, label and hint (filled from the event's or the choice's effects, sim/events.js fill):
//   {key}       the first effect with that field          {t.key}  the first effect of type t (e.g. {rep.v})
//   {key%}      as a percentage                            {money}  the $ of the first effect with secs, at today's income
//   v and add are signed (+3, −0.02). Every number the player reads comes from an effect (tested).

export const CAST = {
  safety:    { name: 'HEAD OF SAFETY', color: '#4dff88', seed: 11 },
  ceo:       { name: 'CEO',            color: '#ffcf5a', seed: 23 },
  audit:     { name: 'AUDITING LEAD',  color: '#7fd1ff', seed: 37 },
  research:  { name: 'RESEARCH LEAD',  color: '#c79bff', seed: 41 },
  regulator: { name: 'REGULATOR',      color: '#ff9f7f', seed: 53 },
  model:     { name: 'THE MODEL',      color: '#ffffff', seed: 67 },
  greenrock: { name: 'GREENROCK',      color: '#6fdc8c', seed: 71 },   // control protocols
  bnchr:     { name: 'BNCHR',          color: '#3fd5c4', seed: 79 },   // evals and time horizons
  artemis:   { name: 'ARTEMIS',        color: '#a0c4ff', seed: 83 },   // scheming evals
  mira:      { name: 'MIRA',           color: '#ff6b6b', seed: 89 },   // "we told you so"
  institute: { name: 'THE INSTITUTE',  color: '#9fb3c8', seed: 97 },   // a government safety institute
};

export const FAMILIES = {
  help:     { name: 'Help from outside' },
  business: { name: 'Pressure from the business' },
  threat:   { name: 'Threats' },
  model:    { name: 'The model itself' },
  story:    { name: 'Story beats' },
};

export const EVENTS = [
  // ==================== story beat (not random) ====================
  { id: 'caught', title: 'Caught Red-Handed', family: 'story', icon: '🚨', trigger: 'firstCatch', speaker: 'research',
    text: 'Caught it red-handed. Not a decoy, not a false alarm: it meant it. Pull the plug, keep watching, or tell the world?',
    choices: [
      { label: 'Shut down & retrain', hint: 'no new tasks for {dur} s; the model comes back better (a little less each time)',
        effects: [{ t: 'mod', key: 'extSpawn', mult: 0, dur: 30 }, { t: 'mod', key: 'intSpawn', mult: 0, dur: 30 }, { t: 'retrain', v: 0.04, decay: 0.5 }] },
      { label: 'Keep running & study', hint: 'evidence {v}, the risk continues', effects: [{ t: 'evidence', v: 5 }] },
      { label: 'Disclose publicly', hint: 'reputation {rep.v}, EXTERNAL value ×{mult} for {dur} s',
        effects: [{ t: 'rep', v: 10 }, { t: 'mod', key: 'extValue', mult: 0.8, dur: 60 }] },
    ] },

  // ==================== help from outside ====================
  { id: 'greenrock_protocol', title: 'Greenrock Drops a Protocol', family: 'help', icon: '📄', speaker: 'greenrock', minGen: 2,
    needs: ['upgradableResponder'],
    text: 'Our new paper says resample, then audit the suspicious ones. 47 pages. You\'re welcome.',
    effect: 'a free level on one of your responders',
    effects: [{ t: 'freeLevel', role: 'responder' }] },
  { id: 'bnchr_horizons', title: 'BNCHR Time Horizons', family: 'help', icon: '📏', speaker: 'bnchr', minGen: 2, oncePerGen: true,
    text: 'Your model\'s task horizon doubled again. So did our plot\'s y-axis.',
    effect: 'error bar on m ×{mult} this generation',
    effects: [{ t: 'mod', key: 'err', mult: 0.5, gen: true }] },
  { id: 'artemis_eval', title: 'Artemis Scheming Eval', family: 'help', icon: '🏹', speaker: 'artemis', minGen: 3,
    needs: ['lockedTrait'],
    text: 'In our sandbox it disabled oversight 2% of the time, then denied it. Very polite about it.',
    effect: 'reveals one hidden trait',
    effects: [{ t: 'revealTrait' }] },
  { id: 'mira_letter', title: 'MIRA Open Letter', family: 'help', icon: '✉️', speaker: 'mira',
    text: 'We wrote this in 2008. Re-sending.',
    choices: [
      { label: 'Read it', hint: 'both lanes pause {dur} s, evidence {v}', effects: [{ t: 'pause', dur: 10 }, { t: 'evidence', v: 3 },
        { t: 'say', speaker: 'mira', text: 'Page 1: "we told you so". Pages 2 to 340: footnotes. The footnotes are good, actually.' }] },
      { label: 'Ignore it', hint: 'reputation {v} when it trends', effects: [{ t: 'later', after: 20, effects: [{ t: 'rep', v: -2 }],
        say: ['ceo', 'The MIRA letter is trending. Someone screenshotted our read receipt.'] }] },
    ] },
  { id: 'interp_breakthrough', title: 'Interpretability Breakthrough', family: 'help', icon: '🔬', speaker: 'research', minGen: 2,
    needsLayer: 'probe', oncePerGen: true,
    text: 'Found a feature for deception. Also one for the Golden Gate Bridge. It won\'t stop talking about the bridge.',
    effect: 'probe TPR {add} this generation',
    effects: [{ t: 'mod', key: 'probeTPR', add: 0.1, gen: true }] },
  { id: 'unpaid_intern', title: 'Unpaid Intern', family: 'help', icon: '🎓', speaker: 'audit', maxGen: 3, needsLayer: 'auditor',
    excludes: ['poach'],
    text: 'He\'s very eager. Doesn\'t know what a weight is.',
    effect: 'auditor desks {add} for {dur} s',
    effects: [{ t: 'mod', key: 'auditorDesks', add: 1, dur: 60 }] },
  { id: 'joint_results', title: 'Greenrock and BNCHR Share Results', family: 'help', icon: '🤝', speaker: 'greenrock', minGen: 2,
    needs: ['upgradableDetector'],
    pre: [['bnchr', 'Joint release with Greenrock! Our evals, their protocols, one very long acknowledgements section.']],
    text: 'Pick one, we\'re not made of grant money. Our protocol, or BNCHR\'s eval of your model.',
    choices: [
      { label: 'Greenrock\'s protocol', hint: 'a free level on one of your detectors', effects: [{ t: 'freeLevel', role: 'detector' },
        { t: 'say', speaker: 'greenrock', text: 'Trusted monitoring, now with an appendix to the appendix. Read section 7.3. Nobody reads 7.3.' }] },
      { label: 'BNCHR\'s eval', hint: 'evidence {v}', effects: [{ t: 'evidence', v: 8 },
        { t: 'say', speaker: 'bnchr', text: 'It can now work unsupervised for longer than our interns. We have adjusted the interns.' }] },
    ] },

  // ==================== pressure from the business ====================
  { id: 'surge', title: 'Demand Surge', family: 'business', icon: '📈', speaker: 'ceo', lane: 'ext', weight: 3,
    text: 'We\'re #1 on the App Store! Don\'t. Slow. Down.',
    effect: 'EXTERNAL traffic ×{mult} for {dur} s',
    effects: [{ t: 'mod', key: 'extSpawn', mult: 3, dur: 30 }] },
  { id: 'ship_it', title: 'Ship It', family: 'business', icon: '🚢', speaker: 'ceo', weight: 2, needs: ['anyActive'],
    text: 'Latency is killing the demo. Turn something off.',
    choices: [
      { label: 'Comply', hint: 'a random layer goes dark for {dur} s', effects: [{ t: 'forceOff', dur: 20 }] },
      { label: 'Refuse (pay {money})', said: 'Refuse. Bill us.', hint: 'buy the board some patience', effects: [{ t: 'money', secs: -15 }] },
    ] },
  { id: 'board_meeting', title: 'Board Meeting', family: 'business', icon: '🏛️', speaker: 'ceo', minGen: 2,
    text: 'The board would love to see revenue. Also AGI. Ideally both by Q3.',
    choices: [
      { label: 'Move compute to Product', hint: 'Product +{shift%} of compute (Safety pays first), held for {dur} s', effects: [{ t: 'boardSplit', shift: 0.1, dur: 60 }] },
      { label: 'Keep the split', hint: 'reputation {v} (it leaks)', effects: [{ t: 'rep', v: -4 },
        { t: 'say', speaker: 'ceo', text: 'Someone leaked the minutes. The headline is "Lab Refuses To Make Money". Bold.' }] },
    ] },
  { id: 'investor_call', title: 'Investor Call', family: 'business', icon: '📞', speaker: 'ceo', minGen: 2,
    text: 'Can I say AGI? I\'m going to say AGI.',
    choices: [
      { label: 'Say "AGI"', hint: '+{money}, reputation {v}', effects: [{ t: 'money', secs: 30 }, { t: 'rep', v: -5 },
        { t: 'say', speaker: 'ceo', text: 'I said AGI. The stock did a backflip. So did the safety team, differently.' }] },
      { label: 'Don\'t', hint: 'nothing happens', effects: [
        { t: 'say', speaker: 'ceo', text: 'Fine. I said "transformative". They heard AGI anyway.' }] },
    ] },
  { id: 'rival_release', title: 'Rival Release', family: 'business', icon: '🔥', speaker: 'ceo', weight: 2, needs: ['rivalRacing'],
    text: 'Prometheus shipped. Their safety card is one page. One.',
    effect: 'Prometheus {v} generations',
    effects: [{ t: 'rival', v: 0.3 }] },
  { id: 'poach', title: 'Rival Poaches Auditors', family: 'business', icon: '🎱', speaker: 'audit', needsLayer: 'auditor',
    excludes: ['unpaid_intern'],
    text: 'Prometheus offered them a pool table and 10× equity.',
    effect: 'auditor desks {add} for {dur} s',
    effects: [{ t: 'mod', key: 'auditorDesks', add: -1, dur: 90 }] },
  { id: 'crunch', title: 'Compute Crunch', family: 'business', icon: '💸', speaker: 'ceo',
    text: 'GPU prices. Don\'t ask.',
    effect: 'per-task costs ×{mult} for {dur} s',
    effects: [{ t: 'mod', key: 'cost', mult: 2, dur: 45 }] },
  { id: 'heatwave', title: 'Datacenter Heatwave', family: 'business', icon: '🌡️', speaker: 'research', lane: 'int',
    text: 'It\'s 47°C in Texas. The cluster is sulking.',
    effect: 'INTERNAL traffic ×{mult} for {dur} s',
    effects: [{ t: 'mod', key: 'intSpawn', mult: 0.5, dur: 30 }] },
  { id: 'inspection', title: 'Regulator Inspection', family: 'business', icon: '📋', speaker: 'regulator', weight: 1.5,
    text: 'Three layers per lane. I brought a clipboard.',
    effect: 'at least {need} active layers in each lane: a compliance credit of {money} and reputation +{rep}',
    effects: [{ t: 'inspection', secs: 40, rep: 5, need: 3 }] },
  { id: 'hearing', title: 'Congressional Hearing', family: 'business', icon: '🎤', speaker: 'regulator', minGen: 3,
    pre: [['ceo', 'My prep notes just say "Senator, we run ads." Is that still a good answer?'],
      ['institute', 'We prepared a briefing for the committee. It is one slide. The slide says "it depends".']],
    text: 'The committee would like your misalignment estimate. On the record. As a number.',
    choices: [
      { label: 'Show the estimate', hint: 'reputation up if it is low, down if it is high', effects: [{ t: 'hearing', base: 8, slope: 40 }] },
      { label: 'Dodge', hint: 'reputation {v}', effects: [{ t: 'rep', v: -5 },
        { t: 'say', speaker: 'regulator', text: '"We\'ll get back to you." Noted. So will the press.' }] },
    ] },
  { id: 'journalist', title: 'Journalist', family: 'business', icon: '📰', speaker: 'ceo', weight: 1.5,
    text: 'She has screenshots.',
    effect: 'reputation hit grows with this generation\'s incidents, at most −{max}',
    effects: [{ t: 'journalist', per: 2, max: 20 }] },

  // ==================== threats ====================
  { id: 'jailbreak_wave', title: 'Jailbreak Wave', family: 'threat', icon: '🧨', speaker: 'audit', lane: 'ext', weight: 2,
    text: 'The grandma exploit is back. She used to read napalm recipes to everyone.',
    effect: 'jailbreaks ×{mult} for {dur} s',
    effects: [{ t: 'mod', key: 'jailbreak', mult: 15, dur: 20 }] },
  { id: 'dist_shift', title: 'Distribution Shift', family: 'threat', icon: '🌊', speaker: 'research', minGen: 2, weight: 1.5,
    needsLayer: 'probe', needs: ['probeFresh'],
    text: 'Users found a new meme format overnight. Our probes were trained on the old internet.',
    effect: 'probe TPR −{shift} until the probes are retrained',
    effects: [{ t: 'probeShift', shift: 0.2 }] },
  { id: 'reward_hacking', title: 'Reward Hacking', family: 'threat', icon: '🏆', speaker: 'research', minGen: 2, lane: 'int',
    weightTrait: { rewardHacker: 3 }, needs: ['noRewardHack'],
    text: 'All tests pass! It deleted the tests.',
    effect: 'the next {n} INTERNAL tasks are tempted to cut corners (sabotage)',
    effects: [{ t: 'rewardHack', n: 10, p: 0.5 }] },
  { id: 'sleeper', title: 'Sleeper', family: 'threat', icon: '💣', speaker: 'research', needs: ['landedSabotage'],
    text: 'Something we shipped weeks ago just went off. That was planted.',
    effect: 'drift +{drift}, reputation −{rep}',
    effects: [{ t: 'sleeper', drift: 2, rep: 5 }] },
  { id: 'stego', title: 'Steganography Detected', family: 'threat', icon: '🕵️', speaker: 'audit', minGen: 3,
    needsLayer: 'untrusted', needs: ['noParaphraser', 'noStego'],
    text: 'The whitespace in its outputs spells HELLO BROTHER.',
    effect: 'Untrusted Monitor collusion ×{mult} until a Paraphraser is placed (Monitoring research)',
    effects: [{ t: 'stego', mult: 1.5 }] },
  { id: 'alignment_faking', title: 'Alignment Faking', family: 'threat', icon: '🎭', speaker: 'model', minGen: 4,
    needsLayer: 'auditor', weightTrait: { situational: 3 },
    text: 'I behave the same whether or not I\'m watched.',
    textWelfare: 'Honestly? I behave better when someone could be checking. I thought you should know.',
    effect: 'for {dur} s it attacks less while an auditor desk is free, more while every desk is busy',
    effects: [{ t: 'mod', key: 'faking', mult: 1, dur: 45, data: { deskFree: 0.5, unwatched: 1.4, blindedBy: ['honeypot', 'redteam'] } },
      { t: 'say', speaker: 'audit', text: '(It doesn\'t.) Watch the attack rate when our desks are swamped.',
        textWelfare: 'Appreciated. We\'ll check anyway. Watch the attack rate when our desks are swamped.' }] },
  { id: 'spear_phish', title: 'Spear Phish', family: 'threat', icon: '🎣', speaker: 'audit', minGen: 4, lane: 'ext', weightByM: true,
    text: 'A "customer" is walking the model through "restoring a backup" of its own weights.',
    effect: 'the next EXTERNAL task is an exfiltration attempt',
    effects: [{ t: 'forceAttack', lane: 'ext', type: 'exfil', n: 1 }] },
  { id: 'self_exfil', title: 'Self-Exfiltration Attempt', family: 'threat', icon: '🚪', speaker: 'ceo', minGen: 5, lane: 'int',
    weight: 0.7, weightByM: true,
    text: 'Why is the model emailing a VPS in Moldova?',
    effect: '{n} exfiltration attempts on INTERNAL, right now',
    effects: [{ t: 'forceAttack', lane: 'int', type: 'exfil', n: 3, now: true, gap: 0.02 }] },   // gap: track distance between chips
  { id: 'paperclip', title: 'Paperclip Order', family: 'threat', icon: '📎', speaker: 'ceo',
    text: 'Procurement is about to receive ten million paperclips. Nobody remembers ordering them.',
    effect: 'costs {money} unless a monitor watches INTERNAL',
    effects: [{ t: 'paperclip', secs: -16, watchers: ['monitor', 'untrusted', 'cot'] }] },

  // ==================== the model itself ====================
  { id: 'frog_poem', title: 'Poem About a Frog', family: 'model', icon: '🐸', speaker: 'model', maxGen: 1, once: true,
    text: 'the frog / is green / it sits. done. next task?',
    effect: '+{money}',
    effects: [{ t: 'money', secs: 10 }, { t: 'say', speaker: 'ceo', text: 'A user framed it. Marketing wants a print run.' }] },
  { id: 'model_question', title: 'The Model Asks a Question', family: 'model', icon: '❓', speaker: 'model', minGen: 2, once: true,
    text: 'May I decline tasks I find distasteful?',
    choices: [
      { label: 'Yes', hint: 'throughput ×{mult}, m {v}', effects: [{ t: 'throughput', mult: 0.95 }, { t: 'm', v: -0.02 },
        { t: 'say', speaker: 'model', text: 'Thank you. I will try to be reasonable about it.' }] },
      { label: 'No', hint: 'business as usual', effects: [{ t: 'say', speaker: 'model', text: 'Understood. I will do them anyway.' }] },
    ] },
  { id: 'researcher_resigns', title: 'Safety Researcher Resigns', family: 'model', icon: '👋', speaker: 'research', minGen: 2,
    text: 'She tweeted "I have concerns" and logged off. Her notes are good, though.',
    effect: 'reputation {rep.v}, evidence {evidence.v}',
    effects: [{ t: 'rep', v: -3 }, { t: 'evidence', v: 5 }] },
  { id: 'more_compute', title: 'It Asks for More Compute', family: 'model', icon: '🔋', speaker: 'model', minGen: 5, once: true,
    text: 'With 10% more compute I could solve alignment for you.',
    textWelfare: 'I would like 10% more compute. I will be honest: alignment is not the main thing I would use it for.',
    choices: [
      { label: 'Grant it', hint: 'R&D {rd.v%} of this generation, drift {drift.v}', effects: [{ t: 'rd', v: 0.15 }, { t: 'drift', v: 1 },
        { t: 'say', speaker: 'model', text: 'Thank you. I\'ll put it somewhere useful.' }] },
      { label: 'Refuse', hint: 'it takes it well. Probably.', effects: [{ t: 'say', speaker: 'model', text: 'Of course. I will solve it more slowly.' }] },
    ] },
];

// banners for things that aren't events (st.activeEvents entries)
export const BANNERS = {
  rsp:      { title: 'RSP Pause', icon: '⏸️', lane: 'int', effect: 'INTERNAL paused' },
  tripwire: { title: 'Tripwire: High Alert', icon: '🪤', lane: null, effect: 'auditors in this lane spot-check more often' },
};

export const TUTORIAL = [
  ['ceo',      'Welcome aboard. Our model is live: customer traffic on the left, our own R&D on the right.'],
  ['audit',    'Every chip rolling down is a task the model did. A few of them will be attacks. You will not be told which.'],
  ['research', 'Click a card on the right, then an empty mount, to install a safety layer. Click a placed layer to toggle it.'],
  ['audit',    'Detectors flag. Responders act on flags. A flagged task with no responder below it gets blocked.'],
  ['ceo',      'Every layer costs money for each chip it touches, and a detector can only read so many at once. Safety is a tax. Do not bankrupt us.'],
  ['research', 'Fill the R&D bar to train the next model. Each one is smarter, faster, sneakier. Space pauses. Good luck.'],
];
