// ===== Research draws: pay, see 2 cards, pick 1 =====

import { BALANCE as B } from '../config/balance.js';
import { CARDS } from '../config/cards.js';
import { LAYERS } from '../config/layers.js';
import { GENERATIONS } from '../config/generations.js';
import { pick, rand } from './rng.js';
import { spend, say, fx } from './log.js';
import { researchPrice } from './rules.js';

export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

export function cardTitle(c) { return c.type === 'unlock' ? `Unlock: ${LAYERS[c.layer].name}` : c.title; }
export function cardText(c)  { return c.type === 'unlock' ? LAYERS[c.layer].desc : c.text; }

function available(st, c) {
  if (c.type === 'unlock') return !st.unlocked.includes(c.layer);
  if (c.requires && !st.unlocked.includes(c.requires)) return false;
  if (c.minGen && st.gen < c.minGen) return false;
  if (c.lane) return st.lanes[c.lane].slots.length < B.maxSlots;
  return !st.upgrades[c.id];
}

export function drawResearch(st) {
  const price = researchPrice(st);
  if (st.pendingResearch || st.pendingChoice) return { ok: false, msg: 'busy' };
  if (st.money < price) return { ok: false, msg: 'not enough money' };
  const pool = CARDS.filter(c => available(st, c));
  if (!pool.length) return { ok: false, msg: 'nothing left to research' };

  spend(st, price, 'research');
  st.researchCount++;
  const relevant = pool.filter(c => (c.addresses || []).some(a => st.seenAttackTypes.includes(a)));
  const a = pick(st, relevant.length ? relevant : pool);
  const rest = pool.filter(c => c !== a);
  const offer = rest.length ? [a, pick(st, rest)] : [a];
  if (offer.length === 2 && rand(st) < 0.5) offer.reverse();
  st.pendingResearch = offer.map(c => c.id);
  return { ok: true };
}

export function pickResearch(st, idx) {
  if (!st.pendingResearch) return false;
  const c = CARD_BY_ID[st.pendingResearch[idx]];
  if (!c) return false;
  st.pendingResearch = null;
  applyCard(st, c);
  st.cardsTaken.push(c.id);
  fx(st, 'card', { id: c.id });
  return true;
}

function applyCard(st, c) {
  if (c.type === 'unlock') { st.unlocked.push(c.layer); say(st, 'research', `${LAYERS[c.layer].name} is ready to deploy.`); return; }
  if (c.lane) { addSlot(st, c.lane); return; }
  st.upgrades[c.id] = true;
  if (c.id === 'promote_model') st.promotedM = st.mHistory[st.gen - 2] ?? st.m;
  say(st, 'research', `${c.title}: done.`);
}

export function addSlot(st, lane) {
  const L = st.lanes[lane];
  if (L.slots.length >= B.maxSlots) return false;
  L.slots.push({ layer: null, on: true, forcedOffUntil: 0 });
  // tiers moved: re-index which tier each chip visits next
  const n = L.slots.length;
  const tierY = i => B.tierTop + (i + 0.5) * (B.tierBottom - B.tierTop) / n;
  for (const t of L.tasks) {
    if (t.act) continue;
    let i = 0; while (i < n && tierY(i) <= t.y) i++;
    t.tierIdx = i;
  }
  return true;
}

export function retrainProbes(st) {
  if (!st.upgrades.retrain_probes || st.evidence < B.retrainEvidence) return false;
  st.evidence -= B.retrainEvidence;
  st.probe.trainedGen = st.gen;
  st.probe.shift = 0;
  say(st, 'research', `Probes retrained on ${GENERATIONS[st.gen - 1].name} activations.`);
  return true;
}
