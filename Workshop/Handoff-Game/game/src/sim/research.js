// ===== Research draws: pay, see 2 cards from different branches, pick 1 =====
// At least one card on offer addresses an attack type seen this generation (log.js noteSeen), or ends an event that is
// running now (a Paraphraser during Steganography), whenever the pool still has one.
// st.pendingResearch = [card ids] (the sim halts until you pick) · st.researchOffer = plain data for the picker:
//   [{ id, branch, branchName, color, type, title, text, flavour, price, counters }]

import { BALANCE as B } from '../config/balance.js';
import { CARDS, BRANCHES, TECH } from '../config/cards.js';
import { LAYERS } from '../config/layers.js';
import { GENERATIONS } from '../config/generations.js';
import { pick, rand } from './rng.js';
import { spend, say, fx } from './log.js';
import { researchPrice, bundle, clamp } from './rules.js';

export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

export function cardTitle(c) { return c.type === 'unlock' ? `Unlock: ${LAYERS[c.layer].name}` : c.title; }
export function cardText(c)  { return c.type === 'unlock' ? LAYERS[c.layer].desc : c.text; }
export const timesTaken = (st, id) => st.cardsTaken.filter(x => x === id).length;
// extra $ to take a card (Alignment Training: × priceMult for every earlier copy)
export const cardPrice = (st, c) => c.price ? c.price * Math.pow(c.priceMult ?? 1, timesTaken(st, c.id)) * bundle(st) : 0;
export const countersSeen = (st, c) => (c.addresses || []).some(a => st.seenAttackTypes.includes(a))
  || (!!c.endsEvent && st.activeEvents.some(e => e.id === c.endsEvent));

export function available(st, c) {
  if (c.type === 'unlock') return !st.unlocked.includes(c.layer);
  if (c.requires && !st.unlocked.includes(c.requires)) return false;
  if (c.minGen && st.gen < c.minGen) return false;
  if (c.repeatable) return st.gen < GENERATIONS.length;     // nothing to train after the last model
  return !st.upgrades[c.id];
}

export function offerData(st, c) {
  const b = BRANCHES[c.branch];
  return { id: c.id, branch: c.branch, branchName: b.name, color: b.color, type: c.type, layer: c.layer ?? null,
    title: cardTitle(c), text: cardText(c), flavour: c.flavour, price: cardPrice(st, c), counters: countersSeen(st, c) };
}

export function drawResearch(st) {
  const price = researchPrice(st);
  if (st.pendingResearch || st.pendingChoice) return { ok: false, msg: 'busy' };
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  // a card with its own price is only offered if you could still pay it after this draw (the sim halts until you pick)
  const pool = CARDS.filter(c => available(st, c) && st.money - price >= cardPrice(st, c));
  if (!pool.length) return { ok: false, msg: 'nothing left to research' };

  spend(st, price, 'research');
  st.researchCount++;
  const relevant = pool.filter(c => countersSeen(st, c));
  const a = pick(st, relevant.length ? relevant : pool);
  const otherBranch = pool.filter(c => c.branch !== a.branch);
  const rest = otherBranch.length ? otherBranch : pool.filter(c => c !== a);   // one branch left: two from it
  const offer = rest.length ? [a, pick(st, rest)] : [a];
  if (offer.length === 2 && rand(st) < 0.5) offer.reverse();
  st.pendingResearch = offer.map(c => c.id);
  st.researchOffer = offer.map(c => offerData(st, c));
  return { ok: true };
}

// false if the index is wrong or the card's own price can't be paid (pick the other one)
export function pickResearch(st, idx) {
  if (!st.pendingResearch) return false;
  const c = CARD_BY_ID[st.pendingResearch[idx]];
  if (!c) return false;
  const price = cardPrice(st, c);
  if (price > 0 && st.money < price) return false;
  if (price > 0) spend(st, price, 'research');
  st.pendingResearch = null;
  st.researchOffer = null;
  applyCard(st, c);
  st.cardsTaken.push(c.id);
  fx(st, 'card', { id: c.id, branch: c.branch });
  return true;
}

function applyCard(st, c) {
  say(st, BRANCHES[c.branch].speaker, c.flavour);
  if (c.type === 'unlock') { st.unlocked.push(c.layer); say(st, 'research', `${LAYERS[c.layer].name} is ready to deploy.`); return; }
  st.upgrades[c.id] = (st.upgrades[c.id] || 0) + 1;
  switch (c.id) {
    case 'promote_model': st.promotedM = st.mHistory[st.gen - 2] ?? st.m; break;
    case 'alignment_training': st.mReductions += TECH.alignmentTrainingM; break;
    case 'welfare': st.m = clamp(st.m - TECH.welfareM, 0, 1); break;
  }
  say(st, 'research', `${c.title}: done.`);
}

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
