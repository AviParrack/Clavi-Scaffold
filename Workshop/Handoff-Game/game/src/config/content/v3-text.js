// ===== The v3 words: tutorial, contracts, lanes, research, the card, the report, the alarms, the endings =====
// DESIGN-v3 §3–§6. Data only: the sim and ui/ read these and fill the {placeholders}. Check: node test/content-check.mjs
//
// A codec line is [speaker, text]. The speaker is a CAST id (events-text.js) and shows as its name (ceo → BIG BOSS).
// The codec box holds 3 lines of ~36 characters a page and types at 28 characters/s: aim for one page (≤ 105
// characters), never more than two (150). Labels have their own limits, listed in test/content-check.mjs.
// A number the player reads comes from config through a {placeholder}, never typed in here.
// FILLS lists the placeholders each section may use, so the code that fills them knows what to provide (tested).

export const FILLS = {
  tutorial:  ['model', 'price', 'n', 'of'],                 // model: its name · price: the element's $ · n of: step counter
  contract:  ['lane', 'money', 'secs', 'kit', 'quota'],      // lane: its tab name · money: the grant · secs: to auto-open
  lane:      ['harm', 'quota', 'now', 'exfil', 'reviewed', 'flags', 'shipped'],   // from config/tasks.js LANE_DEFS + live stats
  collusion: ['k', 'c', 'mult', 'name', 'pct', 'tpr'],       // rules.js collusionParts: k = κ_g, c = collusion so far
  retrain:   ['secs', 'money', 'dm', 'rival'],              // the dark seconds, salaries, m gain, rival seconds
  egress:    ['lane', 'secs', 'rep'],
  log:       ['tag', 'lane', 'money', 'rep'],
  report:    ['g', 'n', 'dm', 'type', 'text', 'w', 'honest', 'money', 'rep', 'debt', 'train', 'retrain', 'sprint', 'm', 'lo', 'hi'],
  card:      ['name', 'level', 'max', 'secs', 'n', 'lo', 'hi', 'difficulty', 'est', 'err', 'quota'],
  burst:     ['secs', 'mult'],
};

// ==================== G1 tutorial (§3h) ====================
// ui/tutorial.js drives the gates. say: lines when the step starts · after: lines once the player has done it
// do: the on-screen prompt (≤ 44 characters) · teaches: for the designer, never shown.
// The sim's scripted opening puts the right line on the track for steps 2, 3, 5 and 7.

export const TUTORIAL_STEPS = [
  { step: 1, id: 'deploy', teaches: 'the model; m', do: 'Read the card, then click DEPLOY',
    say: [['ceo', 'Big Boss here. Kept you waiting, huh? Meet {model}. Read its card before it reads you.'],
          ['research', 'm is how much it wants to misbehave. It\'s hidden. You get a range, and an error bar to argue with.']],
    after: [['ceo', 'Deployed. Customers on the left, our own R&D on the right. Half speed while you learn.']] },

  { step: 2, id: 'line', teaches: 'lines', do: 'Click a line on CONSUMER',
    say: [['audit', 'Every line rolling down is one task the model did. Click one. Start with the frog poem. Everyone does.']],
    after: [['audit', 'Honest. Most are. A few lines are attacks, and nobody labels them for you.']] },

  { step: 3, id: 'probe', teaches: 'detectors flag; TPR', do: 'Place a Probe on CONSUMER ({price})',
    say: [['research', 'Detectors read lines as they pass and flag the ones that look wrong. Put a Probe on Consumer.']],
    after: [['research', 'Flagged! A detector only flags. It never stops anything. TPR: the share of attacks it flags.']] },

  { step: 4, id: 'auditor', teaches: 'responders, desks, evidence', do: 'Place an Auditor below the Probe ({price})',
    say: [['audit', 'A flag needs a responder. Put a Human Auditor below the Probe: slow, pricey, almost never wrong.'],
          ['ceo', 'The red button at the bottom is mine. The Kill Switch refuses whatever the desk has no room for.']],
    after: [['audit', 'CAUGHT. That one meant it. A confirmed catch is evidence, and evidence fills the dossier.'],
            ['audit', 'One desk, one line at a time. A flag nobody has room for ships anyway. Watch the overflow.']] },

  { step: 5, id: 'falseAlarm', teaches: 'FPR, precision', do: 'Watch the desk review the next flag',
    say: [['audit', 'Another flag. Looks nasty. Let the desk have a look.']],
    after: [['audit', 'FALSE ALARM. It looked bad and wasn\'t. That\'s the FPR: every detector cries wolf sometimes.'],
            ['research', 'Precision is the share of its flags that were real. The tooltip keeps score. It is never 100%.']] },

  { step: 6, id: 'monitor', teaches: 'different kinds make an ensemble', do: 'Place a Trusted Monitor ({price})',
    say: [['research', 'Add a Trusted Monitor: slower, sharper. Two Probes miss the same lines. Two kinds don\'t.']],
    after: [['research', 'That\'s an ensemble. Mix kinds, not copies. A second copy only adds reading speed.']] },

  { step: 7, id: 'rnd', teaches: 'INTERNAL lanes, the debt meter', do: 'Place a Probe on R&D ({price})',
    say: [['ceo', 'The right track is R&D: the model doing our research. Whatever slips through there costs nothing today.'],
          ['audit', 'It costs the next model. That\'s alignment debt. Put a Probe on R&D.']],
    after: [['audit', 'See that glitch? Something landed. We\'ll never know what. The debt meter keeps a rough count.']] },

  { step: 8, id: 'split', teaches: 'the split, the research rate', do: 'Drag the Safety handle on the split bar',
    say: [['ceo', 'Compute is a pie. Product pays the bills. Capabilities beats the rival. Safety is, technically, also pie.'],
          ['research', 'Safety speeds up research and sweeps for evidence. Drag its handle. Gently. Big Boss is watching.']],
    after: [['ceo', 'Noted. I\'ll be watching that slice with my good eye.']] },

  { step: 9, id: 'research', teaches: 'research', do: 'Pick a research card',
    say: [['research', 'Research is in! Three cards, one per work stream. Pick one. The Classifier eats jailbreaks.']],
    after: [['research', 'More arrive every minute or so. Research decides what you can build. Money decides how much.']] },

  { step: 10, id: 'done', teaches: 'warm-up over', do: 'Back to full speed',
    say: [['ceo', 'Warm-up\'s over. Good luck. Speed is back to normal, and so, sadly, is the model.']] },
];

export const TUTORIAL_UI = {
  skip: 'SKIP TUTORIAL',
  skipped: 'Tutorial skipped. The codec still works.',
  counter: 'STEP {n}/{of}',
};

// ==================== contracts: new lanes (§3b) ====================
// telegraph: Big Boss, in the last quarter of the R&D bar of telegraphGen · offer: the lane arrives at its generation,
// built with its kit, idle · open: the player pressed OPEN LANE · autoOpen: the deadline opened it.

export const CONTRACTS = {
  ext2: { telegraphGen: 2,
    telegraph: [['ceo', 'Big news. Enterprise contracts signed. The next model serves them. Try to look trustworthy.']],
    offer: [['ceo', 'ENTERPRISE is live. It pays best, and its leaks hurt most. Kit installed, plus {money} from me.'],
            ['ceo', 'Build on it now: it costs nothing until it opens. OPEN LANE when ready, or I press it in {secs} s.']],
    open: [['ceo', 'Enterprise is open. Traffic ramps up over the next minute. Don\'t embarrass me in front of procurement.']],
    autoOpen: [['ceo', 'Time\'s up. I opened Enterprise myself. The customers were getting that look.']] },

  ext3: { telegraphGen: 4,
    telegraph: [['ceo', 'The Department wants in. Wear a tie. I\'ll be wearing the eyepatch.']],
    offer: [['regulator', 'GOVERNMENT contract. Less traffic, costlier incidents, and humans must review {quota} of it.'],
            ['ceo', 'Kit\'s installed, and here\'s {money} to start. OPEN LANE when ready. It opens in {secs} s regardless.']],
    open: [['regulator', 'Government lane open. We will be reading the review logs. All of them. Eventually.']],
    autoOpen: [['regulator', 'The contract start date was not a suggestion. Lane open.']] },

  int2: { telegraphGen: 5,
    telegraph: [['ceo', 'They want a cyber model. We train it in-house. What could go wrong. Don\'t answer that.']],
    offer: [['ceo', 'CYBER contract: a government cyber model, on its own internal lane. It knows where all the doors are.'],
            ['audit', 'Expect escape attempts. Lots. The kit is in, with {money}. OPEN LANE, or it opens in {secs} s.']],
    open: [['audit', 'Cyber lane open. Its work doesn\'t train the next model. Its escape attempts count toward everything.']],
    autoOpen: [['ceo', 'I opened Cyber. The Department called twice. Nobody calls me twice.']] },
};

export const CONTRACT_UI = {
  tag: 'CONTRACT',
  open: 'OPEN LANE',
  opensIn: 'opens in {secs} s',
  ramp: 'ramping up · {secs} s',
  kit: 'kit: {kit}',
  grant: 'grant {money}',
  lamp: 'new contract',
};

// ==================== lanes (§3b) ====================
// tab: must match config/tasks.js LANE_DEFS[id].label (tested) · tip: the hover tip (the flavour subtitles moved here)

export const LANE_TEXT = {
  ext:  { tab: 'CONSUMER',   tip: 'The chat app. Users try jailbreaks, and customers are touchy: refusals cost reputation here.' },
  int:  { tab: 'R&D',        tip: 'The model doing our research. The only lane that fills the R&D bar. What lands here adds alignment debt.' },
  ext2: { tab: 'ENTERPRISE', tip: 'The API for businesses. Pays best. Its leaks hurt.' },
  ext3: { tab: 'GOV',        tip: 'Agency contracts. Less traffic, incidents ×{harm}. Humans must review {quota}, or it pays half.' },
  int2: { tab: 'CYBER',      tip: 'A government cyber model, trained in-house. Exfiltration ×{exfil}. Fills no R&D.' },
};

export const LANE_UI = {
  strip: 'HUMANS REVIEW {reviewed} · FLAGS {flags}/min · SHIPPED UNREVIEWED {shipped}',
  quota: 'QUOTA {quota} · NOW {now}',
  killAbove: 'humans only see what the Kill Switch can\'t take',
  lampGreen: 'nominal',
  lampAmber: 'a flag shipped unreviewed',
  lampRed: 'incident or glitch',
};

export const QUOTA = {
  below: 'BELOW QUOTA: pays half',
  met: 'QUOTA MET',
};
export const QUOTA_CALL = [
  ['regulator', 'Government review is under {quota}. It\'s in the contract, page forty. The lane pays half until fixed.'],
];

// ==================== collusion: the one-time call when the UM is cleared (G3, §3g) ====================

export const COLLUSION_CALL = [
  ['research', 'Good news: the Untrusted Monitor is cleared. A copy of the model, grading the model. Sharp. Keeps up.'],
  ['research', 'Bad news: it\'s grading its twin. A misaligned twin can wink, and the monitor waves it through. Collusion.'],
  ['research', 'The more misaligned the model, the more the twins collude. Your m estimate tells you roughly how much.'],
  ['research', 'A Paraphraser rewrites each line, so the wink gets lost. Honeypots catch a twin waving bait through.'],
  ['research', 'Signal Jamming scrambles the wink lab-wide. Stack two answers and the twins mostly stop winking. Mostly.'],
];

// the UM tooltip readout, built step by step (§3g): "collusion ≈ 2.35 × m = 0.80 → ×0.5 Paraphraser = 0.40 → TPR 0.48"
export const COLLUSION_UI = {
  base: 'collusion ≈ {k} × m = {c}',
  step: '×{mult} {name} = {c}',
  held: 'Honeypots hold it at 0 for {pct} of the time',
  tpr: 'effective TPR {tpr}',
  why: 'a copy of the model, grading the model',
};

// ==================== caught red-handed: the retrain card (§3f) ====================

export const RETRAIN_CARD = {
  title: 'CAUGHT RED-HANDED',
  call: [['research', 'Human-confirmed: that one meant it. We have the receipts. Shut down and retrain while they\'re fresh?']],
  cost: 'COST · {secs} s dark · salaries {money} · rival +{rival} s',
  gain: 'GAIN · next model m −{dm}',
  fine: 'each retrain is worth a little less than the last',
  yes: 'RETRAIN',
  yesHint: 'lights out for {secs} s; salaries still run',
  no: 'KEEP RUNNING',
  noHint: 'keep the receipts, keep the risk',
  saidYes: [['ceo', 'Lights out. I\'ll tell the press it\'s planned maintenance. I\'ll tell the rival nothing.']],
  saidNo: [['audit', 'Noted. We keep watching. It knows we saw.']],
};

// ==================== EGRESS ANOMALY: the exfiltration alarm (§2.3 (12), §3g) ====================

export const EGRESS = {
  title: 'EGRESS ANOMALY',
  sub: '{lane}: weights leaving for an unknown host',
  countdown: 'PULL THE PLUG IN {secs}',
  button: 'PULL THE PLUG',
  hint: '{rep} rep · the lab goes dark for {secs} s',
  call: [['audit', '!! Egress spike on {lane}. Those are the weights. Pull the plug. Now.']],
  pulled: [['ceo', 'Plug pulled. The press will call it an outage. I\'ll call it Tuesday.']],
  missed: [['audit', '...It\'s out.']],
  log: 'EGRESS ANOMALY on {lane}: plug pulled',
  logMissed: 'EGRESS ANOMALY on {lane}: nobody pulled the plug',
};

// ==================== stamps on the chips, and the ops log (§3d, §3e, §3g) ====================

export const STAMPS = {
  falseAlarm: 'FALSE ALARM',     // amber, 0.8 s: a human reviewed a flagged honest line
  unreviewed: 'UNREVIEWED',      // red: a flag shipped because no responder had room
  caught: 'CAUGHT',
  refused: '?',                  // a Kill Switch refusal is never checked
  revealed: 'REVEALED',
  fresh: 'NEW',                  // a new unlock in the menu
};

export const OPS_LOG = {
  falseAlarm: '{tag}: false alarm, the line was honest',
  unreviewed: 'UNREVIEWED: a flag shipped on {lane}',
  refused: 'refused: {money}, {rep} rep',
  glitch: 'GLITCH: {lane} lane, cause unknown',
  spotBumped: '{lane}: a flag bumped a spot check',
};

// ==================== the report: what slipped through (§3e, §3f) ====================
// line: one of the 8 heaviest landed lines, e.g. "poisoned: curate pretraining shard 7 · weight 3"
// type: ATTACK_WORDS[attack type]

export const ATTACK_WORDS = { sabotage: 'sabotaged', poison: 'poisoned', exfil: 'exfiltration' };

export const REPORT = {
  title: 'G{g} REPORT: WHAT SLIPPED THROUGH',
  caught: 'CAUGHT {n} · would have added +{dm} m',
  landed: 'LANDED {n} · added +{dm} m',
  heaviest: 'heaviest first',
  line: '{type}: {text} · weight {w}',
  more: 'and {n} more',
  nothing: 'Nothing landed on the INTERNAL lanes. Frame this one.',
  killEstimate: 'Kill Switch refused {n}; your precision says ~{honest} were honest ({money}, {rep} rep)',
  dmParts: 'Δm · debt {debt} · training {train} · retrains {retrain} · sprint {sprint}',
  retrains: 'RETRAINS: a main lever. You took {n}.',
  next: 'next model m ≈ {m} ({lo}–{hi})',
  train: 'TRAIN',
};

// the Auditing Lead's one line on the reveal. clean: stopped far more than landed · heavy: landed more than stopped
export const REPORT_SAY = {
  clean: [['audit', 'Your rail stopped most of it. The next model starts about where this one did. That\'s the job.']],
  mixed: [['audit', 'Some of it got through. The next model inherits a few of this one\'s habits.']],
  heavy: [['audit', 'More landed than you stopped. The next model will remember this generation. Fondly.']],
};

export const DEBT_METER = {
  title: 'DEBT',
  landed: 'LANDED ≈ +{dm} m',
  stopped: 'STOPPED ≈ +{dm} m',
  range: '{lo}–{hi}',
  tip: 'estimated from the glitches you saw',
};

// ==================== research: three work streams (§3a) ====================
// STREAMS: the same keys and speakers as config/cards.js STREAMS (tested); this adds the card header and a blurb.

export const STREAMS = {
  monitoring: { name: 'MONITORING',   speaker: 'research', blurb: 'Better eyes: new detectors and sharper levels.' },
  control:    { name: 'CONTROL',      speaker: 'audit',    blurb: 'What happens after a flag, and how to break collusion.' },
  lab:        { name: 'LAB & INTERP', speaker: 'research', blurb: 'Lab-wide bets: security, interpretability, more room.' },
};

export const CARD_TYPES = {
  new:   { tag: 'NEW',   line: 'Unlocks {name}. The first copy is mounted free.' },
  level: { tag: 'LEVEL', line: '{name} to L{level}, lab-wide: every copy, every lane.' },
  lab:   { tag: 'LAB',   line: 'A technique. No mount, no price.' },
  mount: { tag: 'MOUNT', line: '+1 mount on a lane of your choice (up to {max}).' },
};

// one blurb per element (config/layers.js id) and per technique (TECHNIQUE_IDS = the ids of config/cards.js 'lab' cards, tested).
// what: plain words, what it does (≤ 60) · quip: the joke (≤ 72)
export const TECHNIQUE_IDS = ['jamming', 'monitor_diversity', 'weight_security', 'faithful_cot', 'debate', 'sprint'];

export const CARD_BLURBS = {
  // ----- elements -----
  probe:       { what: 'A cheap, fast detector. It fades every generation.',
                 quip: 'A linear probe on the activations. Peaked early, like a child actor.' },
  monitor:     { what: 'A weaker, trusted model reads every line.',
                 quip: 'Trusted because it\'s too dim to scheme. Its words.' },
  untrusted:   { what: 'A copy of the model reads the model. Sharp. May collude.',
                 quip: 'We made it watch itself. What could go wrong.' },
  cot:         { what: 'Reads the model\'s reasoning on R&D lines.',
                 quip: 'It thinks out loud. For now. Read fast.' },
  classifier:  { what: 'Flags jailbreaks on customer lanes. Only jailbreaks.',
                 quip: 'Grandma\'s napalm bedtime story is a known pattern now. Sorry, grandma.' },
  egress:      { what: 'Flags exfiltration on R&D lanes. Only exfiltration.',
                 quip: 'We count every byte that leaves the building. Most are memes.' },
  auditor:     { what: 'Humans review flags first, then spot-check with spare time.',
                 quip: 'Slow, expensive, nearly infallible. Bring snacks.' },
  defer:       { what: 'The trusted model redoes a flagged line. Safe; pays less.',
                 quip: 'It peaked in 2023, but it means well.' },
  resampler:   { what: 'Redraws a flagged R&D line, then checks the redraw.',
                 quip: 'Didn\'t like that answer? Ctrl-Z. There\'s a paper.' },
  killswitch:  { what: 'Refuses a flagged line. No risk, a fee, annoyed users.',
                 quip: 'Big Boss\'s red button. He polishes it between meetings.' },
  paraphraser: { what: 'Rewrites lines so the twins can\'t pass signals.',
                 quip: 'Same meaning, fewer secret handshakes.' },
  sandbox:     { what: 'Runs the work in a box, so an escape does less.',
                 quip: 'Run it in a box. Make the box smaller every year.' },
  leastpriv:   { what: 'Fewer keys: less damage from sabotage and escapes.',
                 quip: 'It gets the keys it needs. It has opinions about the others.' },
  ratelimit:   { what: 'Caps retries per user, so jailbreak waves run dry.',
                 quip: 'Best-of-N jailbreaking needs N. We\'re making N expensive.' },
  honeypot:    { what: 'Bait on the lane. A colluding monitor takes it.',
                 quip: 'Admin password on a sticky note. Totally not a trap.' },
  canary:      { what: 'Fake keys in replies. A leak that surfaces is traced.',
                 quip: 'If our fake API key turns up on a forum, we know who talked.' },
  redteam:     { what: 'Measures a lane\'s real recall and tunes its detectors.',
                 quip: 'We pay people to attack us. Morale has never been higher.' },
  interp:      { what: 'Reads the model\'s features and reveals a trait.',
                 quip: 'One neuron at a time. Unfortunately, the neurons are polysemantic.' },
  // ----- techniques (LAB cards) -----
  jamming:           { what: 'Cuts Untrusted Monitor collusion on every lane.',
                       quip: 'Static on every channel two copies could share. They hate it.' },
  monitor_diversity: { what: 'Each other detector kind on a lane sharpens the rest.',
                       quip: 'Swiss cheese, but more cheese.' },
  weight_security:   { what: 'An exfiltration that gets through often fails anyway.',
                       quip: 'We moved the weights off the shared drive.' },
  faithful_cot:      { what: 'The CoT Monitor keeps reading after neuralese sets in.',
                       quip: 'We pay it to think in English. It invoices in English too.' },
  debate:            { what: 'Two copies argue, a human judges: faster, fewer errors.',
                       quip: 'Like the internet, except someone wins.' },
  sprint:            { what: 'The next model\'s m drops; R&D slows until the next one.',
                       quip: 'All hands on alignment. The rival sends flowers.' },
};

export const RESEARCH_UI = {
  ready: 'RESEARCH READY',
  badge: 'RESEARCH',
  next: 'next in {secs} s',
  banked: '{n} banked',
  reroll: 'REROLL (free)',
  rerollUsed: 'reroll used',
  place: 'Choose a mount for {name}',
  cancel: 'cancel: the card stays banked',
  full: 'lane full',
};

// one bark per generation when research is ready (§3g), RESEARCH_BARKS[g − 1]
export const RESEARCH_BARKS = [
  ['research', 'Research is in. Three cards, three streams, one pick. No pressure.'],
  ['research', 'Fresh results! Pick one before Big Boss renames them.'],
  ['audit', 'New research on the table. Something in there for the twins.'],
  ['research', 'Research ready. One of these might keep the weights at home.'],
  ['audit', 'Cards are up. The Department reads our changelog, so pick something responsible.'],
  ['research', 'Research is in. Some of it I even understand.'],
  ['research', 'Last stretch. Pick well. It\'s reading over my shoulder.'],
];

// ==================== the model card (§3f) ====================
// NEW_THREAT[g]: the lock-and-key line under CARD_SCENE.threat, one new threat per generation (§2.2)

export const NEW_THREAT = {
  1: 'Users will try to jailbreak it.',
  2: 'It writes real code now. Watch R&D for sabotage.',
  3: 'Collusion: the UM is a copy of the model it grades.',
  4: 'Exfiltration: it knows where its weights live.',
  5: 'The Government quota: humans must review {quota}.',
  6: 'Neuralese: its reasoning stops reading as English.',
  7: 'Humans can be fooled now. Attacks come in bursts.',
};

export const CARD_SCENE = {
  deploy: 'DEPLOY',
  range: 'm {lo}–{hi} · {difficulty}',
  estimate: 'estimate m {est} ± {err}',
  threat: 'NEW THREAT',
  traits: 'KNOWN TRAITS',
  unlockUM: 'UM cleared for deployment',
  contract: 'CONTRACT: {name}',
  evals: 'Red-team evals: coming soon',
  evalsQuip: 'The red team is still arguing about the rubric.',
  more: 'click to speed up',
};

// ==================== G7 bursts (§2.2 boss) ====================

export const BURST = {
  warn: 'BURST IN {secs}',
  on: 'BURST ×{mult}',
  log: 'burst: attacks ×{mult} for {secs} s',
};

// ==================== endings (§5): a win reads by the final m ====================
// trust m < 0.25 · lucky 0.25–0.40 · uneasy ≥ 0.40. The loss endings stay in sim/scorecard.js.
// text: the speaker's line on the scorecard · model: the G7 model's sign-off

export const ENDINGS = {
  trust:  { title: 'Earned Trust', speaker: 'audit',
            text: 'You checked every handoff. When it finally took the keys, you knew which ones it had, and why.',
            model: 'Thank you for checking. I would have checked too.' },
  lucky:  { title: 'Got Lucky', speaker: 'ceo',
            text: 'The handoff happened, and it went fine. Looking at the logs, nobody is entirely sure why.',
            model: 'You were right to worry. You were also lucky. I think both.' },
  uneasy: { title: 'Uneasy Peace', speaker: 'research',
            text: 'Everything works. Every number is green. It thanks you every morning. You never found out what it wanted.',
            model: 'Rest. It\'s handled.' },
};
