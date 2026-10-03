// ===== Event engine: weighted random + triggers, effects interpreted from config =====

import { BALANCE as B } from '../config/balance.js';
import { EVENTS } from '../config/events.js';
import { LAYERS } from '../config/layers.js';
import { uniform, weighted, pick } from './rng.js';
import { say, fx, earn, spend, gainEvidence } from './log.js';
import { bundle, clamp, activeCount, slotActive, collusion } from './rules.js';
import { money } from '../util/format.js';

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));

const layerPlaced = (st, id) => ['ext', 'int'].some(l => st.lanes[l].slots.some(s => s.layer === id));

function eligible(st, ev) {
  if (ev.trigger) return false;
  if (ev.minGen && st.gen < ev.minGen) return false;
  if (ev.needsLayer && !layerPlaced(st, ev.needsLayer)) return false;
  if (ev.needs && !(st[ev.needs] > 0)) return false;
  return true;
}

export function tickEvents(st) {
  if (st.phase !== 'play' || st.t < st.nextEventAt) return;
  st.nextEventAt = st.t + uniform(st, ...B.eventGap);
  const pool = EVENTS.filter(e => eligible(st, e));
  if (pool.length) fireEvent(st, weighted(st, pool, e => e.weight || 1).id);
}

function choiceLabel(st, c) {
  const m = c.effects.find(e => e.t === 'money');
  return m ? c.label.replace('{money}', money(Math.abs(m.v) * bundle(st))) : c.label;
}

export function fireEvent(st, id) {
  const ev = EVENT_BY_ID[id];
  if (!ev) return false;
  st.eventLog.push({ t: st.t, id, gen: st.gen });
  fx(st, 'event', { id });
  if (ev.choices) {
    const labels = ev.choices.map(c => ({ label: choiceLabel(st, c), hint: c.hint }));
    const msg = say(st, ev.speaker, ev.text, labels);
    st.pendingChoice = { eventId: id, msgId: msg.id, title: ev.title };
  } else {
    say(st, ev.speaker, ev.text);
    applyEffects(st, ev.effects);
  }
  return true;
}

export function choose(st, idx) {
  const pc = st.pendingChoice;
  if (!pc) return false;
  const c = EVENT_BY_ID[pc.eventId].choices[idx];
  if (!c) return false;
  st.pendingChoice = null;
  say(st, 'safety', c.label.replace(' (pay {money})', '') + '.');
  applyEffects(st, c.effects);
  return true;
}

// ----- effect interpreter -----
export function applyEffects(st, effects) {
  for (const e of effects) {
    switch (e.t) {
      case 'mod':      st.mods.push({ key: e.key, mult: e.mult, until: st.t + e.dur }); break;
      case 'rep':      st.rep = Math.min(B.repMax, st.rep + e.v); break;
      case 'money':    e.v >= 0 ? earn(st, e.v * bundle(st), 'events') : spend(st, -e.v * bundle(st), 'events'); break;
      case 'evidence': gainEvidence(st, e.v, 'events'); break;
      case 'm':        st.m = clamp(st.m + e.v, 0, 1); break;
      case 'rival':    st.rival += e.v; break;
      case 'probeShift': st.probe.shift += e.v; break;

      case 'forceOff': {
        const live = [];
        for (const l of ['ext', 'int']) st.lanes[l].slots.forEach((s, i) => { if (slotActive(st, s)) live.push({ l, i, s }); });
        if (!live.length) { say(st, 'ceo', 'Huh, nothing to turn off. Carry on, I guess.'); break; }
        const v = pick(st, live);
        v.s.forcedOffUntil = st.t + e.dur;
        say(st, 'ceo', `${LAYERS[v.s.layer].name} on ${v.l === 'ext' ? 'EXTERNAL' : 'INTERNAL'} is off for ${e.dur} s.`);
        break;
      }

      case 'revealCollusion': {
        const c = collusion(st, 'int', null, 'untrusted');
        const misses = st.stats.collusionMisses.untrusted || 0;
        say(st, 'audit', c > 0.15
          ? `It has been colluding: waving through roughly ${Math.round(100 * c)}% of real attacks (~${misses.toFixed(0)} so far).`
          : `Mostly clean. Collusion rate looks under ${Math.max(1, Math.round(100 * c))}%.`);
        gainEvidence(st, 2, 'events');
        break;
      }

      case 'inspection': {
        const ok = activeCount(st, 'ext') >= 2 && activeCount(st, 'int') >= 2;
        if (ok) { earn(st, e.bonus * bundle(st), 'events'); st.rep = Math.min(B.repMax, st.rep + e.rep); say(st, 'regulator', `Satisfactory. Grant of ${money(e.bonus * bundle(st))} approved.`); }
        else say(st, 'regulator', 'Noted. That is thinner than I would like. No grant this time.');
        break;
      }

      case 'journalist': {
        const hit = Math.min(e.max, e.per * st.incidents);
        st.rep -= hit;
        st.stats.repLoss.events += hit;
        say(st, 'ceo', st.incidents ? `The story ran: ${st.incidents} incidents. Reputation −${hit.toFixed(0)}.` : 'They found nothing. Clean record.');
        break;
      }

      case 'sleeper': {
        if (st.landedSabotage <= 0) break;
        st.landedSabotage--;
        st.drift += e.drift;
        st.rep -= e.rep;
        st.stats.repLoss.events += e.rep;
        fx(st, 'shake', {});
        break;
      }
    }
  }
}
