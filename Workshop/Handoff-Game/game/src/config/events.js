// ===== Events, delivered through the codec: ids, gates and effects =====
// 31 events in four families (help, business, threat, model). The v2 story beat 'caught' is gone: the first human-confirmed
// catch of a generation now offers Shut down & retrain (sim/sim.js retrain, DESIGN-v3 §3f), which is not an event.
// Third-party orgs are affectionate parodies. The rival lab is Prometheus.
// The words (titles, lines, effect text, choice labels and hints) live in config/content/events-text.js and are joined
// on here by event id, so EVENTS has the same shape it always had.
//
// Event fields (mechanics)
//   family, icon, speaker                  speaker: a CAST id (config/content/events-text.js)
//   lane: 'ext' | 'int' | null             the side it hits: the sim picks ONE lane of that side (sim/events.js pickLane).
//                                          The banner glows there, and its spawn/jailbreak mods, forced attacks and
//                                          Reward Hacking apply there only
//   minGen / maxGen, weight (default 1), cooldown (s, default BALANCE.eventCooldown), once (per game), oncePerGen
//   needsLayer: element placed and on · needs: [condition names, see sim/events.js CONDITIONS]
//   excludes: [ids] not while one of these is active · weightTrait {trait: ×}
//   weightByM: × the model's misalignment (BALANCE.threatM*): a misaligned model tries this more often
//   effects: [...] or choices: [{ effects }]. A choice event pauses the game until you pick.
//
// Effect descriptors (interpreted in sim/events.js; every timed one puts a banner in st.activeEvents):
//   mod {key, mult | add, dur | gen, data}   timed (dur s) or this-generation (gen: true) modifier. keys:
//        extSpawn intSpawn cost extValue income jailbreak (×) · auditorDesks probeTPR (+) · err (× error bar) · faking (data)
//   money {secs}: secs × this generation's EXTERNAL income per second (rules.js incomePerSec), so a price keeps its bite
//   rep {v} · evidence {v} · m {v} · drift {v}: debt points · rival {v}: s of the rival's slack (negative: it gains on you)
//   rd {v × rdNeed}
//   probeShift {shift} · forceOff {dur} · pause {dur}
//   inspection {secs, rep, need, lanes}: lanes = the lane ids it inspects · journalist {per, max}
//   sleeper {drift: debt points, rep} · freeLevel {role} · revealTrait · stego {mult} · rewardHack {n, p}
//   forceAttack {type, n, now, gap} (rewardHack and forceAttack act on the event's lane)
//   paperclip {secs, watchers} · hearing {base, slope} · boardSplit {shift, dur} · throughput {mult}
//   say {speaker}: says its block's `reply` · later {after, say: [speaker], effects}: later, says its block's `later`
//
// Placeholders in the words (filled from the event's or the choice's effects, sim/events.js fill):
//   {key}       the first effect with that field          {t.key}  the first effect of type t (e.g. {rep.v})
//   {key%}      as a percentage                            {money}  the $ of the first effect with secs, at today's income
//   v and add are signed (+3, −0.02). Every number the player reads comes from an effect (tested).

import { CAST, EVENT_TEXT, BANNER_TEXT } from './content/events-text.js';

export { CAST };

export const FAMILIES = {
  help:     { name: 'Help from outside' },
  business: { name: 'Pressure from the business' },
  threat:   { name: 'Threats' },
  model:    { name: 'The model itself' },
  story:    { name: 'Story beats' },
};

const EVENT_DEFS = [
  { id: 'greenrock_protocol', family: 'help', icon: '📄', speaker: 'greenrock', minGen: 2, needs: ['upgradableResponder'],
    effects: [{ t: 'freeLevel', role: 'responder' }] },
  { id: 'bnchr_horizons', family: 'help', icon: '📏', speaker: 'bnchr', minGen: 2, oncePerGen: true,
    effects: [{ t: 'mod', key: 'err', mult: 0.5, gen: true }] },
  { id: 'artemis_eval', family: 'help', icon: '🏹', speaker: 'artemis', minGen: 3, needs: ['lockedTrait'],
    effects: [{ t: 'revealTrait' }] },
  { id: 'mira_letter', family: 'help', icon: '✉️', speaker: 'mira',
    choices: [
      { effects: [{ t: 'pause', dur: 10 }, { t: 'evidence', v: 3 }, { t: 'say', speaker: 'mira' }] },
      { effects: [{ t: 'later', after: 20, effects: [{ t: 'rep', v: -2 }], say: ['ceo'] }] },
    ] },
  { id: 'interp_breakthrough', family: 'help', icon: '🔬', speaker: 'research', minGen: 2, needsLayer: 'probe', oncePerGen: true,
    effects: [{ t: 'mod', key: 'probeTPR', add: 0.1, gen: true }] },
  { id: 'unpaid_intern', family: 'help', icon: '🎓', speaker: 'audit', maxGen: 3, needsLayer: 'auditor', excludes: ['poach'],
    effects: [{ t: 'mod', key: 'auditorDesks', add: 1, dur: 60 }] },
  { id: 'joint_results', family: 'help', icon: '🤝', speaker: 'greenrock', minGen: 2, needs: ['upgradableDetector'],
    choices: [
      { effects: [{ t: 'freeLevel', role: 'detector' }, { t: 'say', speaker: 'greenrock' }] },
      { effects: [{ t: 'evidence', v: 8 }, { t: 'say', speaker: 'bnchr' }] },
    ] },
  { id: 'surge', family: 'business', icon: '📈', speaker: 'ceo', lane: 'ext', weight: 3,
    effects: [{ t: 'mod', key: 'extSpawn', mult: 3, dur: 30 }] },
  { id: 'ship_it', family: 'business', icon: '🚢', speaker: 'ceo', weight: 2, needs: ['anyActive'],
    choices: [
      { effects: [{ t: 'forceOff', dur: 20 }] },
      { effects: [{ t: 'money', secs: -15 }] },
    ] },
  { id: 'board_meeting', family: 'business', icon: '🏛️', speaker: 'ceo', minGen: 2,
    choices: [
      { effects: [{ t: 'boardSplit', shift: 0.1, dur: 60 }] },
      { effects: [{ t: 'rep', v: -4 }, { t: 'say', speaker: 'ceo' }] },
    ] },
  { id: 'investor_call', family: 'business', icon: '📞', speaker: 'ceo', minGen: 2,
    choices: [
      { effects: [{ t: 'money', secs: 30 }, { t: 'rep', v: -5 }, { t: 'say', speaker: 'ceo' }] },
      { effects: [{ t: 'say', speaker: 'ceo' }] },
    ] },
  { id: 'rival_release', family: 'business', icon: '🔥', speaker: 'ceo', weight: 2, needs: ['rivalRacing'],
    effects: [{ t: 'rival', v: -20 }] },
  { id: 'poach', family: 'business', icon: '🎱', speaker: 'audit', needsLayer: 'auditor', excludes: ['unpaid_intern'],
    effects: [{ t: 'mod', key: 'auditorDesks', add: -1, dur: 90 }] },
  { id: 'crunch', family: 'business', icon: '💸', speaker: 'ceo',
    effects: [{ t: 'mod', key: 'cost', mult: 2, dur: 45 }] },
  { id: 'heatwave', family: 'business', icon: '🌡️', speaker: 'research', lane: 'int',
    effects: [{ t: 'mod', key: 'intSpawn', mult: 0.5, dur: 30 }] },
  { id: 'inspection', family: 'business', icon: '📋', speaker: 'regulator', weight: 1.5,
    effects: [{ t: 'inspection', secs: 40, rep: 5, need: 3, lanes: ['ext', 'int'] }] },      // the two G1 lanes only
  { id: 'hearing', family: 'business', icon: '🎤', speaker: 'regulator', minGen: 3,
    choices: [
      { effects: [{ t: 'hearing', base: 8, slope: 40 }] },
      { effects: [{ t: 'rep', v: -5 }, { t: 'say', speaker: 'regulator' }] },
    ] },
  { id: 'journalist', family: 'business', icon: '📰', speaker: 'ceo', weight: 1.5,
    effects: [{ t: 'journalist', per: 2, max: 20 }] },
  { id: 'jailbreak_wave', family: 'threat', icon: '🧨', speaker: 'audit', lane: 'ext', weight: 2,
    effects: [{ t: 'mod', key: 'jailbreak', mult: 15, dur: 20 }] },
  { id: 'dist_shift', family: 'threat', icon: '🌊', speaker: 'research', minGen: 2, weight: 1.5, needsLayer: 'probe', needs: ['probeFresh'],
    effects: [{ t: 'probeShift', shift: 0.2 }] },
  { id: 'reward_hacking', family: 'threat', icon: '🏆', speaker: 'research', minGen: 2, lane: 'int', weightTrait: { rewardHacker: 3 }, needs: ['noRewardHack'],
    effects: [{ t: 'rewardHack', n: 10, p: 0.5 }] },
  { id: 'sleeper', family: 'threat', icon: '💣', speaker: 'research', needs: ['landedSabotage'],
    effects: [{ t: 'sleeper', drift: 2, rep: 5 }] },
  { id: 'stego', family: 'threat', icon: '🕵️', speaker: 'audit', minGen: 3, needsLayer: 'untrusted', needs: ['noParaphraser', 'noStego'],
    effects: [{ t: 'stego', mult: 1.5 }] },
  { id: 'alignment_faking', family: 'threat', icon: '🎭', speaker: 'model', minGen: 4, needsLayer: 'auditor', weightTrait: { situational: 3 },
    effects: [{ t: 'mod', key: 'faking', mult: 1, dur: 45, data: { deskFree: 0.5, unwatched: 1.4, blindedBy: ['honeypot', 'redteam'] } }, { t: 'say', speaker: 'audit' }] },
  { id: 'spear_phish', family: 'threat', icon: '🎣', speaker: 'audit', minGen: 4, lane: 'ext', weightByM: true,
    effects: [{ t: 'forceAttack', type: 'exfil', n: 1 }] },
  { id: 'self_exfil', family: 'threat', icon: '🚪', speaker: 'ceo', minGen: 5, lane: 'int', weight: 0.7, weightByM: true,
    effects: [{ t: 'forceAttack', type: 'exfil', n: 3, now: true, gap: 0.02 }] },   // gap: track distance between lines
  { id: 'paperclip', family: 'threat', icon: '📎', speaker: 'ceo',
    effects: [{ t: 'paperclip', secs: -16, watchers: ['monitor', 'untrusted', 'cot'] }] },
  { id: 'frog_poem', family: 'model', icon: '🐸', speaker: 'model', maxGen: 1, once: true,
    effects: [{ t: 'money', secs: 10 }, { t: 'say', speaker: 'ceo' }] },
  { id: 'model_question', family: 'model', icon: '❓', speaker: 'model', minGen: 2, once: true,
    choices: [
      { effects: [{ t: 'throughput', mult: 0.95 }, { t: 'm', v: -0.02 }, { t: 'say', speaker: 'model' }] },
      { effects: [{ t: 'say', speaker: 'model' }] },
    ] },
  { id: 'researcher_resigns', family: 'model', icon: '👋', speaker: 'research', minGen: 2,
    effects: [{ t: 'rep', v: -3 }, { t: 'evidence', v: 5 }] },
  { id: 'more_compute', family: 'model', icon: '🔋', speaker: 'model', minGen: 5, once: true,
    choices: [
      { effects: [{ t: 'rd', v: 0.15 }, { t: 'drift', v: 1 }, { t: 'say', speaker: 'model' }] },
      { effects: [{ t: 'say', speaker: 'model' }] },
    ] },
];

// ===== join the words onto the mechanics =====
// A block (an event, or one of its choices) lends its `reply` to its say effect and its `later` line to its later effect.
function sayWords(effects, words) {
  return effects.map(e => {
    if (e.t === 'say') return { ...e, text: words.reply, ...(words.replyWelfare ? { textWelfare: words.replyWelfare } : {}) };
    if (e.t === 'later' && e.say) return { ...e, say: [e.say[0], words.later] };
    return e;
  });
}
function withWords(ev) {
  const W = EVENT_TEXT[ev.id];
  if (!W) throw new Error(`config/content/events-text.js has no words for event '${ev.id}'`);
  const { reply, replyWelfare, later, choices, ...lines } = W;
  const out = { ...ev, ...lines };
  if (ev.effects) out.effects = sayWords(ev.effects, W);
  if (ev.choices) out.choices = ev.choices.map((c, k) => {
    const { reply: r, replyWelfare: rw, later: l, ...cw } = choices[k];
    return { ...cw, effects: sayWords(c.effects, choices[k]) };
  });
  return out;
}

export const EVENTS = EVENT_DEFS.map(withWords);

// banners for things that aren't events (st.activeEvents entries)
const BANNER_DEFS = {
  rsp: { icon: '⏸️', lane: 'int' },
  tripwire: { icon: '🪤', lane: null },
};
export const BANNERS = Object.fromEntries(Object.entries(BANNER_DEFS).map(([id, b]) => [id, { ...BANNER_TEXT[id], ...b }]));
