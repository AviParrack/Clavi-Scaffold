// ===== Research: a steady stream of offers, three work streams, no cash cost (DESIGN-v3 §3a) =====
// Research points accrue in play (rules.js rpRate; none while the lab is dark). Every BALANCE.research.offerRP an offer
// of three cards is banked, up to research.bank; then the bar waits full. The oldest banked offer is the one on show.
//
// st.research = { rp, banked: [offer], rerollFree, taken: [card id], offers, sprintGen, seen: [card id], boost: [card id] }
// offer = { g, t, cards: [{ id, stream, type, slot, why, fallback }] }, cards in slot order (monitoring, control, lab)
//   slot: the stream whose slot it fills · fallback: it is another stream's card (that stream had nothing left, or a
//   guarantee moved it) · why: 'threat' | 'new' | 'redteam' | 'tutorial' | 'fill' (what put it there)
//
// How an offer is drawn (drawOffer):
//   1. live threats (THREATS[t] ≤ g, no owned answer): an answer in its own stream's slot, the threat with the fewest
//      free options first; one with no free own slot takes any free slot
//   2. at least one NEW element when any is eligible (a threat answer in its stream's slot moves to a free slot)
//   3. the rest: a random eligible card of the slot's stream (rare ×rareWeight, boosted ×boostWeight); an empty
//      stream falls back to any other, so there is never a dead card. Nothing owned, maxed or duplicated is shown.
//   4. a Red Team by G2 · 5. the G1 tutorial's forced offer has the Classifier in Monitoring

import { BALANCE as B } from '../config/balance.js';
import { CARDS, STREAMS, THREATS } from '../config/cards.js';
import { LAYERS } from '../config/layers.js';
import { GENERATIONS } from '../config/generations.js';
import { weighted } from './rng.js';
import { say, fx } from './log.js';
import { laneIds, labLevel, rpRate, canPlace, isDetector, slotsOf } from './rules.js';
import { addSlot, levelUp } from './board.js';
import { placeFree } from './state.js';

export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
const SLOTS = Object.keys(STREAMS);                    // monitoring, control, lab

export const cardTitle = c => c.title ?? LAYERS[c.layer]?.name ?? c.id;
export const cardText = c => c.text ?? LAYERS[c.layer]?.desc ?? '';
export const timesTaken = (st, id) => st.research.taken.filter(x => x === id).length;

// =================== what can be offered ===================

const placed = (st, id) => laneIds(st).some(l => st.lanes[l].slots.some(s => s.layer === id)) || st.global.slots.some(s => s.layer === id);

// owned: an answer that counts (the balance model's lab.taken: the card was taken, or its element is unlocked)
function owned(st, c) {
  if (c.type === 'new') return st.unlocked.includes(c.layer);
  if (c.type === 'lab') return !!st.upgrades[c.id];
  return st.research.taken.includes(c.id);
}
export function answered(st, threat) {
  return CARDS.some(c => c.answers === threat && owned(st, c))
    || (threat === 'quota' && st.unlocked.includes('auditor')) || (threat === 'neuralese' && st.unlocked.includes('untrusted'));
}
export const liveThreats = st => Object.keys(THREATS).filter(t => THREATS[t] <= st.gen && !answered(st, t));

export function eligible(st, c) {
  if (!c || c.from > st.gen) return false;
  switch (c.type) {
    case 'new':   return !st.unlocked.includes(c.layer);
    case 'lab':   return c.repeat ? st.research.sprintGen !== st.gen && st.gen < GENERATIONS.length : !st.upgrades[c.id];
    case 'level': return st.unlocked.includes(c.el) && placed(st, c.el) && labLevel(st, c.el) < B.research.maxLevel;
    case 'mount': return laneIds(st).some(l => st.lanes[l].slots.length < B.maxSlots);
  }
  return false;
}
const cardWeight = (st, c) => (c.rare ? B.research.rareWeight : 1) * (st.research.boost.includes(c.id) ? B.research.boostWeight : 1);

// =================== drawing an offer ===================

export function drawOffer(st) {
  const pool = CARDS.filter(c => eligible(st, c));
  const slots = Object.fromEntries(SLOTS.map(s => [s, null]));
  const used = c => SLOTS.some(s => slots[s]?.c === c);
  const free = () => SLOTS.filter(s => !slots[s]);
  const choose = list => list.length ? weighted(st, list, c => cardWeight(st, c)) : null;
  const put = (c, why, slot = c.stream) => { slots[slot] = { c, why, fallback: slot !== c.stream }; };

  // 1. live threats: own stream first, fewest free options first
  let open = liveThreats(st).map(t => ({ t, answers: pool.filter(c => c.answers === t) })).filter(x => x.answers.length);
  while (open.length) {
    const opts = x => x.answers.filter(c => !slots[c.stream] && !used(c));
    const ranked = open.filter(x => opts(x).length).sort((a, b) => opts(a).length - opts(b).length);
    if (!ranked.length) break;
    put(choose(opts(ranked[0])), 'threat');
    open = open.filter(x => x !== ranked[0]);
  }
  for (const x of open) {                               // no own slot left: any free slot, as far as the slots allow
    const c = choose(x.answers.filter(c => !used(c)));
    if (c && free().length) put(c, 'threat', free()[0]);
  }

  // 2. at least one NEW element
  if (!SLOTS.some(s => slots[s]?.c.type === 'new')) {
    const news = pool.filter(c => c.type === 'new' && !used(c));
    const own = news.filter(c => !slots[c.stream]);
    if (own.length) put(choose(own), 'new');
    else if (news.length && free().length) {
      const c = choose(news), moved = slots[c.stream];
      put(c, 'new');
      slots[free()[0]] = { ...moved, fallback: true };
    }
  }

  // 3. the rest from each slot's own stream, else from any stream
  for (const s of free()) { const c = choose(pool.filter(c => c.stream === s && !used(c))); if (c) put(c, 'fill', s); }
  for (const s of free()) { const c = choose(pool.filter(c => !used(c))); if (c) put(c, 'fill', s); }

  // 4. a Red Team by G2 · 5. the tutorial's Classifier
  const rt = CARD_BY_ID.redteam;
  if (st.gen >= 2 && !st.research.seen.includes('redteam') && eligible(st, rt) && !used(rt)) {
    const s = [rt.stream, ...SLOTS].find(s => slots[s]?.why === 'fill') ?? SLOTS.find(s => slots[s]?.why === 'new');
    if (s) put(rt, 'redteam', s);
  }
  const cl = CARD_BY_ID.classifier;
  if (st.tutorialScript && st.gen === 1 && eligible(st, cl) && !used(cl)) put(cl, 'tutorial', 'monitoring');

  const cards = SLOTS.filter(s => slots[s]).map(s => {
    const { c, why, fallback } = slots[s];
    return { id: c.id, stream: c.stream, type: c.type, slot: s, why, fallback };
  });
  const R = st.research;
  for (const c of cards) if (!R.seen.includes(c.id)) R.seen.push(c.id);
  R.boost = [];
  R.offers++;
  st.researchCount++;
  return { g: st.gen, t: st.t, cards };
}

// a banked offer whose card went stale (taken from another offer, or maxed since): a fresh card for that slot
function refresh(st, offer) {
  const used = id => offer.cards.some(x => x.id === id);
  offer.cards = offer.cards.flatMap(x => {
    if (eligible(st, CARD_BY_ID[x.id])) return [x];
    const pool = CARDS.filter(c => eligible(st, c) && !used(c.id));
    const own = pool.filter(c => c.stream === x.slot), list = own.length ? own : pool;
    if (!list.length) return [];
    const c = weighted(st, list, c => cardWeight(st, c));
    return [{ id: c.id, stream: c.stream, type: c.type, slot: x.slot, why: 'fill', fallback: c.stream !== x.slot }];
  });
}

// =================== the stream (sim.js calls this every step of play) ===================

export function tickResearch(st, dt) {
  const R = st.research, P = B.research, T = st.tutorialScript;
  R.rp += rpRate(st) * dt;
  if (T && st.gen === 1 && !T.offer && st.genT >= P.tutorialAt) {    // the tutorial's forced offer
    T.offer = true;
    if (!R.offers) R.rp = Math.max(R.rp, P.offerRP);
  }
  while (R.rp >= P.offerRP && R.banked.length < P.bank) {
    const offer = drawOffer(st);
    if (!offer.cards.length) break;                     // nothing left to research
    R.rp -= P.offerRP;
    R.banked.push(offer);
    fx(st, 'researchReady', { n: R.banked.length, g: st.gen, first: R.readyGen !== st.gen });
    R.readyGen = st.gen;
  }
  if (R.banked.length >= P.bank) R.rp = Math.min(R.rp, P.offerRP);   // the bar waits full
}

// =================== the player's moves ===================

// where a NEW element's free copy goes when the player names no mount: a lane of its side with an empty mount (a
// detector or modifier at the top, a responder at the bottom), else a new mount on such a lane. null: nowhere.
function autoMount(st, id) {
  if (LAYERS[id].lanes.includes('global')) return st.global.slots[0].layer ? null : { lane: 'global', slot: 0 };
  const lanes = laneIds(st).filter(l => canPlace(id, l)).sort((a, b) => (st.lanes[b].open ? 1 : 0) - (st.lanes[a].open ? 1 : 0));
  const top = isDetector(id) || LAYERS[id].role === 'modifier';
  for (const l of lanes) {
    const idx = st.lanes[l].slots.map((s, i) => s.layer ? -1 : i).filter(i => i >= 0);
    if (idx.length) return { lane: l, slot: top ? idx[0] : idx[idx.length - 1] };
  }
  const l = lanes.find(l => st.lanes[l].slots.length < B.maxSlots);
  return l ? { lane: l, slot: st.lanes[l].slots.length, add: true } : null;
}

// target: { lane, slot } for a NEW card, { lane } for a MOUNT card; omitted: chosen for you (headless)
function checkTarget(st, c, target) {
  if (!target) return null;
  if (c.type === 'new') {
    const slot = slotsOf(st, target.lane)?.[target.slot];
    if (!slot) return 'no such mount';
    if (slot.layer) return 'mount taken';
    if (!canPlace(c.layer, target.lane)) return `${LAYERS[c.layer].name} can't go on that lane`;
  }
  if (c.type === 'mount') {
    if (!st.lanes[target.lane]) return 'no such lane';
    if (st.lanes[target.lane].slots.length >= B.maxSlots) return 'lane full';
  }
  return null;
}

function applyCard(st, c, target) {
  const R = st.research;
  switch (c.type) {
    case 'new': {
      st.unlocked.push(c.layer);
      fx(st, 'unlock', { id: c.layer });
      const where = target ?? autoMount(st, c.layer);
      if (!where) { say(st, 'research', `${LAYERS[c.layer].name} is ready to deploy. No room for the free copy: buy a mount.`); return {}; }
      if (where.add) addSlot(st, where.lane);
      placeFree(st, where.lane, where.slot, c.layer);
      say(st, 'research', `${LAYERS[c.layer].name} is ready to deploy. The first copy is on the house.`);
      return { lane: where.lane, slot: where.slot };
    }
    case 'level': {
      for (const l of [...laneIds(st), 'global']) {
        const i = slotsOf(st, l).findIndex(s => s.layer === c.el);
        if (i >= 0) { levelUp(st, l, i, { free: true }); return { level: labLevel(st, c.el) }; }
      }
      return {};
    }
    case 'mount': {
      const lane = target?.lane ?? laneIds(st).filter(l => st.lanes[l].slots.length < B.maxSlots)
        .sort((a, b) => st.lanes[a].slots.length - st.lanes[b].slots.length)[0];
      addSlot(st, lane);
      fx(st, 'slot', { lane, n: st.lanes[lane].slots.length, price: 0, free: true });
      return { lane };
    }
    case 'lab': {
      st.upgrades[c.id] = (st.upgrades[c.id] || 0) + 1;
      if (c.id === 'sprint') R.sprintGen = st.gen;
      say(st, 'research', `${c.title}: done.`);
      return {};
    }
  }
  return {};
}

// take card i of the offer on show. Free. NEW: unlocks and mounts the first copy free · LEVEL: +1 lab level ·
// MOUNT: +1 mount · LAB: the technique. Returns { ok, id, lane?, slot?, level? } or { ok: false, msg }.
export function pickCard(st, i, target = null) {
  const R = st.research, offer = R.banked[0], x = offer?.cards[i], c = CARD_BY_ID[x?.id];
  if (!c) return { ok: false, msg: 'no such card' };
  if (!eligible(st, c)) return { ok: false, msg: 'no longer available' };
  const bad = checkTarget(st, c, target);
  if (bad) return { ok: false, msg: bad };
  R.banked.shift();
  st.pendingResearch = null; st.researchOffer = null;
  if (c.flavour) say(st, STREAMS[c.stream].speaker, c.flavour);
  const where = applyCard(st, c, target);
  R.taken.push(c.id);
  st.cardsTaken.push(c.id);
  fx(st, 'card', { id: c.id, stream: c.stream, branch: c.stream, cardType: c.type, ...where });
  for (const o of R.banked) refresh(st, o);
  return { ok: true, id: c.id, ...where };
}

// one free reroll per generation: the offer on show is drawn again
export function reroll(st) {
  const R = st.research;
  if (!R.banked.length) return { ok: false, msg: 'no offer' };
  if (R.rerollFree <= 0) return { ok: false, msg: 'reroll used' };
  R.rerollFree--;
  R.banked[0] = drawOffer(st);
  st.pendingResearch = null; st.researchOffer = null;
  fx(st, 'reroll', { left: R.rerollFree });
  return { ok: true };
}

// keep the offer on show for later: it goes to the back of the bank (cancelling a "choose a mount" lands here too)
export function bankCard(st) {
  const R = st.research;
  if (!R.banked.length) return { ok: false, msg: 'no offer' };
  R.banked.push(R.banked.shift());
  st.pendingResearch = null; st.researchOffer = null;
  return { ok: true };
}

// =================== the old UI's picker (until ui-integration replaces it) ===================
// drawResearch shows the offer on show (st.pendingResearch halts the sim until a pick); pickResearch takes card i.

export function offerData(st, x) {
  const c = CARD_BY_ID[x.id], s = STREAMS[c.stream];
  return { id: c.id, branch: c.stream, stream: c.stream, branchName: s.name, color: s.color, slot: x.slot, fallback: x.fallback,
    type: c.type === 'new' ? 'unlock' : c.type, cardType: c.type, layer: c.layer ?? null, title: cardTitle(c), text: cardText(c),
    flavour: c.flavour, price: 0, counters: !!c.answers && liveThreats(st).includes(c.answers) };
}
export function drawResearch(st) {
  if (st.pendingResearch || st.pendingChoice) return { ok: false, msg: 'busy' };
  const offer = st.research.banked[0];
  if (!offer) return { ok: false, msg: 'no research ready' };
  st.pendingResearch = offer.cards.map(x => x.id);
  st.researchOffer = offer.cards.map(x => offerData(st, x));
  return { ok: true };
}
export const pickResearch = (st, idx) => pickCard(st, idx).ok;

// spend evidence to bring the probes back to full strength (generation decay and Distribution Shift)
export function retrainProbes(st) {
  if (st.evidence < B.retrainEvidence) return false;
  st.evidence -= B.retrainEvidence;
  st.stats.evidenceOut.spent += B.retrainEvidence;
  st.probe.trainedGen = st.gen;
  st.probe.shift = 0;
  say(st, 'research', `Probes retrained on ${GENERATIONS[st.gen - 1].name} activations.`);
  return true;
}
