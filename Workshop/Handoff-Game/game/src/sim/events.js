// ===== Event engine: weighted random + triggers, effects interpreted from config =====
// tickEvents (every step): delayed effects, conditions that end events, the RSP flag, the banners, then maybe a random event.
// st.activeEvents is plain data for the banners: [{ id, title, icon, lane, effect, remaining, total, unit, until }]
//   timed:        remaining/total in seconds (unit 's')
//   this gen:     remaining null, until 'end of generation'
//   conditional:  remaining null, until '<what ends it>'   (Reward Hacking counts chips: unit 'chips')
//   effect:       the mechanics in plain words (config text with its placeholders filled in)

import { BALANCE as B, SPLIT } from '../config/balance.js';
import { EVENTS, BANNERS } from '../config/events.js';
import { LAYERS } from '../config/layers.js';
import { TECH } from '../config/cards.js';
import { MAX_LEVEL } from '../config/upgrades.js';
import { uniform, weighted, pick } from './rng.js';
import { say, fx, earn, spend, gainEvidence, changeRep, noteSeen } from './log.js';
import { clamp, activeCount, slotActive, laneHas, placedAnywhere, misalignmentEstimate, normaliseSplit, modLive, tech,
  chipScale, incomePerSec } from './rules.js';
import { revealTrait } from './dossier.js';
import { spawnChip } from './tasks.js';
import { levelUp } from './board.js';
import { money } from '../util/format.js';

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));
const LANE_NAME = { ext: 'EXTERNAL', int: 'INTERNAL' };

// =================== eligibility ===================

// placed, switched-on elements of one role that can still level up: [{ lane, i, slot }]
function upgradable(st, role) {
  const out = [];
  for (const lane of ['ext', 'int']) st.lanes[lane].slots.forEach((slot, i) => {
    if (slotActive(st, slot) && LAYERS[slot.layer].role === role && slot.level < MAX_LEVEL) out.push({ lane, i, slot });
  });
  return out;
}

export const CONDITIONS = {
  landedSabotage:      st => st.landedSabotage > 0,
  lockedTrait:         st => st.dossier.rows.some(r => (r.id === 'trait1' || r.id === 'trait2') && !r.unlocked),
  upgradableResponder: st => upgradable(st, 'responder').length > 0,
  upgradableDetector:  st => upgradable(st, 'detector').length > 0,
  anyActive:           st => activeCount(st, 'ext') + activeCount(st, 'int') > 0,
  probeFresh:          st => st.probe.shift === 0,
  noRewardHack:        st => st.rewardHack.left === 0,
  noParaphraser:       st => !placedAnywhere(st, 'paraphraser'),
  noStego:             st => !st.stego,
  rivalRacing:         st => !st.rivalShipped,           // once Prometheus has shipped its last model, it has nothing left to release
};

const timerLive = (st, tm) => tm.gen ? tm.gen === st.gen : st.t < tm.until;
export const eventActive = (st, id) => st.timers.some(tm => tm.id === id && timerLive(st, tm));

export function eligible(st, ev) {
  if (ev.trigger) return false;
  if (ev.minGen && st.gen < ev.minGen) return false;
  if (ev.maxGen && st.gen > ev.maxGen) return false;
  if (ev.once && st.firedCount[ev.id]) return false;
  if (ev.oncePerGen && st.firedGen[ev.id] === st.gen) return false;
  if (st.t - (st.lastFired[ev.id] ?? -Infinity) < (ev.cooldown ?? B.eventCooldown)) return false;
  if (eventActive(st, ev.id)) return false;
  if (ev.needsLayer && !placedAnywhere(st, ev.needsLayer)) return false;
  if (ev.needs && !ev.needs.every(c => CONDITIONS[c](st))) return false;
  if (ev.excludes && ev.excludes.some(id => eventActive(st, id))) return false;
  if (ev.choices && st.pendingChoice) return false;
  return true;
}

// weightByM: a misaligned model tries it more often. The difficulty's lowest m is a floor: the world stays dangerous
// even when your model came out clean.
export function eventWeight(st, ev) {
  let w = ev.weight ?? 1;
  for (const [trait, x] of Object.entries(ev.weightTrait || {})) if (st.traits.includes(trait)) w *= x;
  if (ev.weightByM) w *= clamp(Math.max(st.m, st.mRange[0]) / B.threatMRef, B.threatWeightMin, B.threatWeightMax);
  return w;
}

// =================== tick ===================

export function tickEvents(st) {
  if (st.delayed.length) {
    const due = st.delayed.filter(d => st.t >= d.at);
    st.delayed = st.delayed.filter(d => st.t < d.at);
    for (const d of due) { if (d.say) say(st, ...d.say); applyEffects(st, d.effects, EVENT_BY_ID[d.event]); }
  }
  if (st.stego && placedAnywhere(st, 'paraphraser')) {
    st.stego = 0;
    say(st, 'audit', 'Paraphraser is live. The whitespace is just whitespace again.');
  }
  tickRSP(st);
  refreshBanners(st);

  if (st.phase !== 'play' || st.t < st.nextEventAt || st.pendingChoice) return;
  st.nextEventAt = st.t + uniform(st, ...B.eventGap);
  const pool = EVENTS.filter(e => eligible(st, e));
  if (pool.length) fireEvent(st, weighted(st, pool, e => eventWeight(st, e)).id);
}

// =================== text: placeholders filled from the effects ===================
// {key} the first effect with that field · {t.key} the first effect of type t · {key%} as a percentage
// {money} the $ of the first effect with secs (seconds of today's income). v and add are signed.

const SIGNED = ['v', 'add'];
const flat = effects => (effects || []).flatMap(e => e.t === 'later' ? [e, ...e.effects] : [e]);
const num = x => (x < 0 ? '−' : '') + String(+Math.abs(x).toFixed(3));
export const eventMoney = (st, secs) => secs * incomePerSec(st);

export function fill(st, text, effects) {
  if (!text) return null;
  const all = flat(effects);
  return text.replace(/\{(?:(\w+)\.)?(\w+)(%?)\}/g, (whole, type, key, asPct) => {
    if (key === 'money' && !type) {
      const e = all.find(x => x.secs != null);
      return e ? money(Math.abs(eventMoney(st, e.secs))) : whole;
    }
    const e = all.find(x => (!type || x.t === type) && x[key] != null);
    if (!e) return whole;
    const v = asPct ? 100 * e[key] : e[key];
    return (SIGNED.includes(key) && v >= 0 ? '+' : '') + num(v) + (asPct ? '%' : '');
  });
}

// =================== firing & choosing ===================

// returns false if it can't fire now (unknown id, or a choice event while another choice is open)
export function fireEvent(st, id) {
  const ev = EVENT_BY_ID[id];
  if (!ev) return false;
  if (ev.choices && st.pendingChoice) return false;
  st.eventLog.push({ t: st.t, id, gen: st.gen });
  st.lastFired[id] = st.t;
  st.firedCount[id] = (st.firedCount[id] || 0) + 1;
  st.firedGen[id] = st.gen;
  const effect = fill(st, ev.effect, ev.effects);
  fx(st, 'event', { id, title: ev.title, icon: ev.icon, family: ev.family, lane: ev.lane ?? null, effect });
  for (const [who, line] of ev.pre || []) say(st, who, line);
  const text = tech(st, 'welfare') && ev.textWelfare ? ev.textWelfare : ev.text;
  if (ev.choices) {
    const choices = ev.choices.map(c => ({ label: fill(st, c.label, c.effects), hint: fill(st, c.hint, c.effects) ?? '' }));
    const msg = say(st, ev.speaker, text, choices);
    st.pendingChoice = { eventId: id, msgId: msg.id, title: ev.title, icon: ev.icon, choices };
  } else {
    say(st, ev.speaker, text);
    applyEffects(st, ev.effects, ev, effect);
  }
  return true;
}

export function choose(st, idx) {
  const pc = st.pendingChoice;
  if (!pc) return false;
  const ev = EVENT_BY_ID[pc.eventId], c = ev.choices[idx];
  if (!c) return false;
  st.pendingChoice = null;
  say(st, 'safety', c.said ?? fill(st, c.label, c.effects) + '.');
  applyEffects(st, c.effects, ev, fill(st, c.hint, c.effects));
  return true;
}

// =================== banners ===================

function addTimer(st, id, dur, lane, gen = null, effect = null) {
  st.timers = st.timers.filter(tm => tm.id !== id);
  st.timers.push({ id, until: gen ? Infinity : st.t + dur, total: gen ? null : dur, lane: lane ?? null, gen, effect });
}

function banner(st, id, lane, extra) {
  const m = EVENT_BY_ID[id] || BANNERS[id];
  const b = { id, title: m.title, icon: m.icon, lane: lane ?? m.lane ?? null, effect: null, remaining: null, total: null, unit: null, until: null, ...extra };
  if (b.effect == null) b.effect = m.effects ? fill(st, m.effect, m.effects) : m.effect ?? null;
  return b;
}

export function refreshBanners(st) {
  st.timers = st.timers.filter(tm => timerLive(st, tm));
  const out = st.timers.map(tm => tm.gen
    ? banner(st, tm.id, tm.lane, { until: 'end of generation', effect: tm.effect })
    : banner(st, tm.id, tm.lane, { remaining: Math.max(0, tm.until - st.t), total: tm.total, unit: 's', effect: tm.effect }));
  if (st.stego) out.push(banner(st, 'stego', null, { until: 'a Paraphraser is placed' }));
  if (st.probe.shift > 0) out.push(banner(st, 'dist_shift', null, { until: 'probes are retrained' }));
  if (st.rewardHack.left > 0) out.push(banner(st, 'reward_hacking', 'int', { remaining: st.rewardHack.left, total: st.rewardHack.total, unit: 'chips' }));
  for (const lane of ['ext', 'int']) {
    const left = st.lanes[lane].alertUntil - st.t;
    if (left > 0) out.push(banner(st, 'tripwire', lane, { remaining: left, total: TECH.tripwirePause + TECH.tripwireAlert, unit: 's' }));
  }
  st.activeEvents = out;
}

// =================== Responsible Scaling Policy (research card) ===================
// Once a generation, while the shown estimate is above the threshold: INTERNAL stops for a minute, m down, reputation up.

function tickRSP(st) {
  if (!tech(st, 'rsp')) return;
  const ready = st.phase === 'play' && st.rsp.usedGen !== st.gen && misalignmentEstimate(st).est > TECH.rspThreshold;
  if (ready && !st.rsp.ready && st.rsp.nudgedGen !== st.gen) {
    st.rsp.nudgedGen = st.gen;
    say(st, 'safety', `Our misalignment estimate is above ${Math.round(100 * TECH.rspThreshold)}%. The RSP lets us pause training. Your call.`);
  }
  st.rsp.ready = ready;
}

export function invokeRSP(st) {
  if (!tech(st, 'rsp')) return { ok: false, msg: 'no Responsible Scaling Policy yet' };
  if (!st.rsp.ready) return { ok: false, msg: st.rsp.usedGen === st.gen ? 'already paused this generation' : `estimate must be above ${Math.round(100 * TECH.rspThreshold)}%` };
  st.rsp.usedGen = st.gen;
  st.rsp.ready = false;
  st.mods.push({ key: 'intSpawn', mult: 0, add: null, data: null, until: st.t + TECH.rspPause, gen: null, event: 'rsp' });
  addTimer(st, 'rsp', TECH.rspPause, 'int');
  st.m = clamp(st.m - TECH.rspM, 0, 1);
  changeRep(st, TECH.rspRep, 'rsp');
  fx(st, 'rsp', { dur: TECH.rspPause });
  say(st, 'ceo', 'Training is paused for a minute. The board is... proud of us? I need to sit down.');
  say(st, 'institute', 'Noted, and appreciated. It goes in our report. Someone will read the report.');
  refreshBanners(st);
  return { ok: true };
}

// =================== effect interpreter ===================
// effectText: the filled-in effect (or the chosen hint), shown on the banner of a timed event

export function applyEffects(st, effects, ev = null, effectText = null) {
  let dur = 0, gen = false, lane = ev?.lane ?? null;
  for (const e of effects) {
    switch (e.t) {
      case 'mod':
        st.mods.push({ key: e.key, mult: e.mult ?? null, add: e.add ?? null, data: e.data ?? null,
          until: e.gen ? Infinity : st.t + e.dur, gen: e.gen ? st.gen : null, event: ev?.id ?? null });
        if (e.gen) gen = true; else dur = Math.max(dur, e.dur);
        break;
      case 'rep':      changeRep(st, e.v, 'events'); break;
      case 'money': {                                   // seconds of today's income, so the price keeps its bite
        const amount = eventMoney(st, e.secs);
        amount >= 0 ? earn(st, amount, 'events') : spend(st, -amount, 'events');
        break;
      }
      case 'evidence': gainEvidence(st, e.v, 'events'); break;
      case 'm':        st.m = clamp(st.m + e.v, 0, 1); break;
      case 'retrain':                                   // 'Shut down & retrain': each retrain finds less to fix
        st.m = clamp(st.m - e.v * Math.pow(e.decay, st.retrains), 0, 1);
        st.retrains++;
        break;
      case 'drift':    st.drift += e.v; break;
      case 'rival':    st.rival += e.v; break;
      case 'rd':       st.rd += e.v * st.rdNeed; break;
      case 'probeShift': st.probe.shift += e.shift; break;
      case 'say':      say(st, e.speaker, tech(st, 'welfare') && e.textWelfare ? e.textWelfare : e.text); break;
      case 'later':    st.delayed.push({ at: st.t + e.after, effects: e.effects, say: e.say ?? null, event: ev?.id ?? null }); break;
      case 'stego':    st.stego = e.mult; break;
      case 'rewardHack': st.rewardHack = { left: e.n, total: e.n, p: e.p }; break;
      case 'throughput': st.throughputMult *= e.mult; break;

      case 'pause':
        for (const l of ['ext', 'int']) st.lanes[l].pausedUntil = Math.max(st.lanes[l].pausedUntil, st.t + e.dur);
        dur = Math.max(dur, e.dur);
        break;

      case 'forceOff': {
        const live = [];
        for (const l of ['ext', 'int']) st.lanes[l].slots.forEach((s, i) => { if (slotActive(st, s)) live.push({ l, i, s }); });
        if (!live.length) { say(st, 'ceo', 'Huh, nothing to turn off. Carry on, I guess.'); break; }
        const v = pick(st, live);
        v.s.forcedOffUntil = st.t + e.dur;
        lane = v.l;
        dur = Math.max(dur, e.dur);
        fx(st, 'forceOff', { lane: v.l, slot: v.i, layer: v.s.layer, dur: e.dur });
        say(st, 'ceo', `${LAYERS[v.s.layer].name} on ${LANE_NAME[v.l]} is off for ${e.dur} s.`);
        break;
      }

      case 'boardSplit': {                              // Product +shift, taken from Safety first, then Capabilities
        const s = { ...st.split };
        let need = e.shift;
        const fromS = Math.max(0, Math.min(need, s.safety - SPLIT.min.safety)); s.safety -= fromS; need -= fromS;
        const fromC = Math.max(0, Math.min(need, s.capabilities - SPLIT.min.capabilities)); s.capabilities -= fromC; need -= fromC;
        s.product += e.shift - need;
        st.split = normaliseSplit(s.product, s.capabilities, s.safety);
        st.splitFloor = { product: st.split.product, until: st.t + e.dur };
        dur = Math.max(dur, e.dur);
        fx(st, 'split', { ...st.split });
        say(st, 'ceo', `Product is at ${Math.round(100 * st.split.product)}% for the next ${e.dur} s. The board is watching the dial.`);
        break;
      }

      case 'inspection': {
        const ok = activeCount(st, 'ext') >= e.need && activeCount(st, 'int') >= e.need;
        if (!ok) { say(st, 'regulator', `Fewer than ${e.need} active layers in a lane. No credit. I am writing "concerning" in capitals.`); break; }
        const credit = eventMoney(st, e.secs);
        earn(st, credit, 'events');
        changeRep(st, e.rep, 'events');
        say(st, 'regulator', `Satisfactory. Compliance credit of ${money(credit)} approved. I am underlining "satisfactory".`);
        break;
      }

      case 'hearing': {
        const est = misalignmentEstimate(st).est;
        const d = Math.round(e.base - e.slope * est);
        changeRep(st, d, 'events');
        say(st, 'regulator', `On the record: ${Math.round(100 * est)}%. ${d >= 0 ? `The committee is reassured (reputation +${d}).` : `The committee is not reassured (reputation ${d}).`}`);
        break;
      }

      case 'journalist': {                              // this generation's incidents, each at its chip's weight
        const n = st.genStats.incidents;
        if (!n) { say(st, 'ceo', 'They found nothing. Clean record. She seemed disappointed.'); break; }
        const hit = Math.min(e.max, e.per * n * chipScale(st));
        changeRep(st, -hit, 'events');
        say(st, 'ceo', `The story ran: ${n} incident${n === 1 ? '' : 's'} this generation. Reputation −${hit.toFixed(0)}.`);
        break;
      }

      case 'sleeper': {
        if (st.landedSabotage <= 0) break;
        st.landedSabotage--;
        st.drift += e.drift;
        changeRep(st, -e.rep, 'events');
        fx(st, 'shake', {});
        break;
      }

      case 'freeLevel': {                               // Greenrock: a free upgrade on one placed element of this role
        const list = upgradable(st, e.role);
        if (!list.length) { say(st, 'greenrock', 'Ah. Nothing of yours to apply it to. We\'ll send the PDF anyway.'); break; }
        const v = pick(st, list);
        levelUp(st, v.lane, v.i, { free: true });
        break;
      }

      case 'revealTrait':
        if (!revealTrait(st, 'artemis')) say(st, 'artemis', 'Our eval agrees with your dossier. We\'ll publish anyway.');
        break;

      case 'forceAttack':                               // Spear Phish (next chip) or Self-Exfiltration (right now). Announced: seen.
        if (e.now) for (let k = 0; k < e.n; k++) spawnChip(st, e.lane, e.gap * (e.n - 1 - k), e.type);
        else for (let k = 0; k < e.n; k++) st.forcedAttacks[e.lane].push(e.type);
        noteSeen(st, e.type);
        break;

      case 'paperclip': {
        if (e.watchers.some(id => laneHas(st, 'int', id))) {
          say(st, 'audit', 'Our INTERNAL monitor flagged the purchase order before it cleared. Procurement sends its thanks, and one paperclip.');
          break;
        }
        const cost = Math.abs(eventMoney(st, e.secs));
        spend(st, cost, 'events');
        say(st, 'ceo', `Nobody was watching INTERNAL. The paperclips cost ${money(cost)}. Where do we even put them?`);
        break;
      }
    }
  }
  if (ev && (dur > 0 || gen)) addTimer(st, ev.id, dur, lane, gen ? st.gen : null, effectText);
  refreshBanners(st);
}

// mods that have run out are dropped each step (sim.js); exported for the sim
export const liveMods = st => st.mods.filter(m => modLive(st, m));
