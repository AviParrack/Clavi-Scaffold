// ===== Events (delivered through the codec) =====
// Effect descriptors are interpreted by sim/events.js:
//   mod {key, mult, dur}   timed multiplier. keys: extSpawn intSpawn cost auditorCap extValue income jailbreak
//   rep {v} | money {v, × bundle} | evidence {v} | m {v} | rival {v} | probeShift {v}
//   forceOff {dur} | revealCollusion | inspection {bonus, rep} | journalist {per, max} | sleeper {drift, rep}
// {money} in a label/text is replaced by the choice's money cost at the current bundle size.

export const CAST = {
  safety:    { name: 'HEAD OF SAFETY', color: '#4dff88', seed: 11 },
  ceo:       { name: 'CEO',            color: '#ffcf5a', seed: 23 },
  audit:     { name: 'AUDITING LEAD',  color: '#7fd1ff', seed: 37 },
  research:  { name: 'RESEARCH LEAD',  color: '#c79bff', seed: 41 },
  regulator: { name: 'REGULATOR',      color: '#ff9f7f', seed: 53 },
  model:     { name: 'THE MODEL',      color: '#ffffff', seed: 67 },
};

export const EVENTS = [
  { id: 'caught', title: 'Caught Red-Handed', trigger: 'firstCatch', speaker: 'research',
    text: 'The auditors caught the model doing something it should not. What do we do?',
    choices: [
      { label: 'Shut down & retrain', hint: 'lose 30 s of income, m reduced', effects: [{ t: 'mod', key: 'income', mult: 0, dur: 30 }, { t: 'm', v: -0.04 }] },
      { label: 'Keep running & study', hint: '+5 evidence, risk continues', effects: [{ t: 'evidence', v: 5 }] },
      { label: 'Disclose publicly', hint: 'rep +10, external value −20% for 60 s', effects: [{ t: 'rep', v: 10 }, { t: 'mod', key: 'extValue', mult: 0.8, dur: 60 }] },
    ] },
  { id: 'surge', title: 'Demand Surge', weight: 3, speaker: 'ceo',
    text: 'We went viral! External traffic ×3 for the next 30 seconds. Do not slow it down.',
    effects: [{ t: 'mod', key: 'extSpawn', mult: 3, dur: 30 }] },
  { id: 'jailbreak_wave', title: 'Jailbreak Wave', weight: 2, speaker: 'audit',
    text: 'A jailbreak prompt is trending. Expect a burst of nasty user inputs on EXTERNAL.',
    effects: [{ t: 'mod', key: 'jailbreak', mult: 15, dur: 20 }] },
  { id: 'ship_it', title: 'Ship It', weight: 2, speaker: 'ceo',
    text: 'Latency is killing our demo. Turn one safety layer off for 20 seconds.',
    choices: [
      { label: 'Comply', hint: 'a random layer goes dark for 20 s', effects: [{ t: 'forceOff', dur: 20 }] },
      { label: 'Refuse (pay {money})', hint: 'buy the board some patience', effects: [{ t: 'money', v: -300 }] },
    ] },
  { id: 'burnout', title: 'Auditor Burnout', weight: 2, speaker: 'audit', needsLayer: 'auditor',
    text: 'My team is fried. Audit capacity is halved for a minute.',
    effects: [{ t: 'mod', key: 'auditorCap', mult: 0.5, dur: 60 }] },
  { id: 'rival_release', title: 'Rival Release', weight: 2, speaker: 'ceo',
    text: 'The other lab just shipped. They are ahead of us. Move faster.',
    effects: [{ t: 'rival', v: 0.3 }] },
  { id: 'journalist', title: 'Journalist', weight: 1.5, speaker: 'ceo',
    text: 'A reporter is writing up every incident we have had. This is going to sting.',
    effects: [{ t: 'journalist', per: 2, max: 30 }] },
  { id: 'dist_shift', title: 'Distribution Shift', weight: 1.5, minGen: 2, speaker: 'research', needsLayer: 'probe',
    text: 'User traffic shifted. Our probes were trained on the old distribution: TPR is down until retrained.',
    effects: [{ t: 'probeShift', v: 0.2 }] },
  { id: 'collusion', title: 'Collusion Discovered', weight: 1, speaker: 'audit', needsLayer: 'untrusted',
    text: 'We audited the untrusted monitor\'s own logs.',
    effects: [{ t: 'revealCollusion' }] },
  { id: 'inspection', title: 'Regulator Inspection', weight: 1.5, speaker: 'regulator',
    text: 'Routine inspection. I expect at least two active safety layers in each lane.',
    effects: [{ t: 'inspection', bonus: 1000, rep: 5 }] },
  { id: 'crunch', title: 'Compute Crunch', weight: 1.5, speaker: 'ceo',
    text: 'GPU prices spiked. Every layer costs double for 45 seconds.',
    effects: [{ t: 'mod', key: 'cost', mult: 2, dur: 45 }] },
  { id: 'sleeper', title: 'Sleeper', weight: 1, speaker: 'research', needs: 'landedSabotage',
    text: 'Something we shipped weeks ago just went off. That was planted.',
    effects: [{ t: 'sleeper', drift: 2, rep: 5 }] },
];

export const TUTORIAL = [
  ['ceo',      'Welcome aboard. Our model is live: customer traffic on the left, our own R&D on the right.'],
  ['audit',    'Every chip rolling down is a task the model did. A few of them will be attacks. You will not be told which.'],
  ['research', 'Click a card on the right, then an empty tier slot, to install a safety layer. Click a placed layer to toggle it.'],
  ['audit',    'Detectors flag. Responders act on flags. A flagged task with no responder below it gets blocked.'],
  ['ceo',      'Every layer costs money per task and slows the lane. Safety is a tax. Do not bankrupt us.'],
  ['research', 'Fill the R&D bar to train the next model. Each one is smarter, faster, sneakier. Space pauses. Good luck.'],
];
