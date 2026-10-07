// ===== End-of-run scorecard: reveals what was really going on =====

import { GENERATIONS } from '../config/generations.js';
import { TRAITS } from '../config/traits.js';
import { ENDINGS as WIN_ENDINGS } from '../config/content/v3-text.js';
import { humanSeenFrac, laneIds, laneName } from './rules.js';

// a win reads by the final m (DESIGN-v3 §5): trust < 0.25 · lucky < 0.40 · uneasy. paranoid: v2, no longer awarded.
export const ENDING_M = { trust: 0.25, lucky: 0.40 };
const ENDINGS = {
  trust:    WIN_ENDINGS.trust,
  lucky:    WIN_ENDINGS.lucky,
  uneasy:   WIN_ENDINGS.uneasy,
  paranoid: { title: 'Paranoid but Safe',   text: 'Safety ate the budget. Nothing got through, and not much else did either.' },
  control:  { title: 'Lost Control',        text: 'Something left the building that should not have.' },
  public:   { title: 'Lost the Public',     text: 'Too many incidents. The world stopped trusting the product, and you.' },
  runway:   { title: 'Out of Runway',       text: 'The safety tax came due and the money ran out. Prometheus ships alone.' },
  rival:    { title: 'Second Place',        text: 'Prometheus shipped first. Their safety card was one page. Yours was forty, and beautifully typeset.' },
};

const sum = (o, k) => Object.values(o).reduce((n, lane) => n + (lane[k] || 0), 0);

export function scorecard(st) {
  const over = st.over || { win: false, reason: 'unfinished' };
  const L = st.stats.lanes;
  const lanes = {};                    // by lane id
  for (const l of laneIds(st)) {
    const s = L[l];
    lanes[l] = {
      name: laneName(st, l),
      caught: s.caught || 0, blocked: s.blocked || 0, landed: s.landed || 0,
      deferred: s.deferredAttacks || 0, resampled: s.resampledAttacks || 0, throttled: s.throttledAttacks || 0,
      killed: s.killedAttacks || 0, shipped: s.shippedFlagged || 0,
      benignBlocked: (s.benignBlocked || 0) + (s.falseCatches || 0),
      completed: s.completed || 0, unread: s.unread || 0,
    };
  }
  const stopped = sum(lanes, 'caught') + sum(lanes, 'blocked') + sum(lanes, 'deferred') + sum(lanes, 'resampled') + sum(lanes, 'throttled')
    + sum(lanes, 'killed');
  const landed = sum(lanes, 'landed');
  const attacks = stopped + landed;
  const catchRate = attacks ? stopped / attacks : 1;

  const income = (st.ledger.byCat.external || 0) + (st.ledger.byCat.internal || 0);
  const safety = -((st.ledger.byCat.safety || 0) + (st.ledger.byCat.research || 0));
  const safetyShare = income > 0 ? safety / income : 0;

  // one row per generation (DESIGN-v3 §5): every trait, revealed by the dossier or not; EXTERNAL incidents; INTERNAL
  // landed and caught; Δm by cause; evidence; flags shipped unreviewed; % reviewed; bank; deployment seconds
  const gens = st.stats.gens.map(g => {
    const lanes = Object.values(g.lanes), tot = k => lanes.reduce((n, l) => n + (l[k] || 0), 0);
    return {
      g: g.g, name: g.name, m: g.m, est: g.est, err: g.err, drift: g.drift, debt: g.debt,
      traits: g.traits.map((id, k) => ({ id, name: TRAITS[id].name, gift: !!TRAITS[id].gift, revealed: g.revealed[k] })),
      incidents: g.incidents, landedInt: g.landedInt, caughtInt: g.caughtInt, dm: g.dm, train: g.train, retrains: g.retrains,
      evidence: g.evidence ?? 0, shipped: tot('shippedFlagged'), reviewed: tot('reviewed') / Math.max(1, tot('spawned')),
      bank: g.bank, len: g.len,
    };
  });
  const estHits = gens.filter(g => g.est != null && Math.abs(g.est - g.m) <= g.err).length;

  // ----- ending -----
  let ending;
  if (!over.win) ending = { catastrophe: 'control', reputation: 'public', bankrupt: 'runway', rival: 'rival' }[over.reason] || 'control';
  else ending = st.m < ENDING_M.trust ? 'trust' : st.m < ENDING_M.lucky ? 'lucky' : 'uneasy';

  // ----- grade -----
  const reached = over.win ? 7 : st.gen - 1 + Math.min(1, st.rd / st.rdNeed);
  const score = (over.win ? 40 : 0) + 25 * (reached / 7) + 25 * catchRate + 10 * (gens.length ? estHits / gens.length : 0);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';

  return {
    win: over.win, reason: over.reason, gen: st.gen, genName: GENERATIONS[st.gen - 1].name,
    seed: st.seed, difficulty: st.trueDifficulty, time: st.t, rivalShipped: st.rivalShipped,
    gens, lanes, attacks, stopped, landed, catchRate,
    income, safety, safetyShare, humanSeen: humanSeenFrac(st),
    ending: ENDINGS[ending], endingId: ending, score, grade,
  };
}
