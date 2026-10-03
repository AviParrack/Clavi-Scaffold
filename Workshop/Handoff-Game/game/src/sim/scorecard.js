// ===== End-of-run scorecard: reveals what was really going on =====

import { GENERATIONS } from '../config/generations.js';
import { humanSeenFrac } from './rules.js';

const ENDINGS = {
  trust:    { title: 'Earned Trust',        text: 'You watched closely, caught what mattered, and knew what you did not know.' },
  lucky:    { title: 'Got Lucky',           text: 'You made it. Looking at the numbers, it is not entirely clear why.' },
  paranoid: { title: 'Paranoid but Safe',   text: 'Safety ate the budget. Nothing got through, and not much else did either.' },
  control:  { title: 'Lost Control',        text: 'Something left the building that should not have.' },
  public:   { title: 'Lost the Public',     text: 'Too many incidents. The world stopped trusting the product, and you.' },
  runway:   { title: 'Out of Runway',       text: 'The safety tax came due and the money ran out. The rival lab ships alone.' },
};

const sum = (o, k) => (o.ext[k] || 0) + (o.int[k] || 0);

export function scorecard(st) {
  const over = st.over || { win: false, reason: 'unfinished' };
  const L = st.stats.lanes;
  const lanes = {};
  for (const l of ['ext', 'int']) {
    const s = L[l];
    lanes[l] = {
      caught: s.caught || 0, blocked: s.blocked || 0, landed: s.landed || 0,
      deferred: s.deferredAttacks || 0, resampled: s.resampledAttacks || 0,
      benignBlocked: (s.benignBlocked || 0) + (s.falseCatches || 0),
      completed: s.completed || 0, timeouts: s.timeouts || 0,
    };
  }
  const stopped = sum(lanes, 'caught') + sum(lanes, 'blocked') + sum(lanes, 'deferred') + sum(lanes, 'resampled');
  const landed = sum(lanes, 'landed');
  const attacks = stopped + landed;
  const catchRate = attacks ? stopped / attacks : 1;

  const income = (st.ledger.byCat.external || 0) + (st.ledger.byCat.internal || 0);
  const safety = -((st.ledger.byCat.safety || 0) + (st.ledger.byCat.research || 0));
  const safetyShare = income > 0 ? safety / income : 0;

  const gens = st.stats.gens.map(g => ({ g: g.g, name: g.name, m: g.m, est: g.est, err: g.err, drift: g.drift }));
  const estHits = gens.filter(g => g.est != null && Math.abs(g.est - g.m) <= g.err).length;

  // ----- ending -----
  let ending;
  if (!over.win) ending = over.reason === 'catastrophe' ? 'control' : over.reason === 'reputation' ? 'public' : over.reason === 'bankrupt' ? 'runway' : 'control';
  else if (safetyShare > 0.6) ending = 'paranoid';
  else if (catchRate > 0.7 && st.m < 0.35) ending = 'trust';
  else ending = 'lucky';

  // ----- grade -----
  const reached = over.win ? 7 : st.gen - 1 + Math.min(1, st.rd / st.rdNeed);
  const score = (over.win ? 40 : 0) + 25 * (reached / 7) + 25 * catchRate + 10 * (gens.length ? estHits / gens.length : 0);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';

  return {
    win: over.win, reason: over.reason, gen: st.gen, genName: GENERATIONS[st.gen - 1].name,
    seed: st.seed, difficulty: st.trueDifficulty, time: st.t,
    gens, lanes, attacks, stopped, landed, catchRate,
    income, safety, safetyShare, humanSeen: humanSeenFrac(st),
    ending: ENDINGS[ending], endingId: ending, score, grade,
  };
}
