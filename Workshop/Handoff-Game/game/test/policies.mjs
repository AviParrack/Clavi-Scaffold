// ===== The policy zoo (DESIGN-v3 §2.7): one definition, two players =====
// design/balance-v3.mjs plays these policies in the numeric model; `node test/headless.mjs balance` plays them in the
// real sim. Both import this file, so "human" is literally the same policy in both (§7.5).
// Plain data plus the small helpers both sides share: the player draw, the run summary, the zoo table and the targets.
//
// build   [{ side, gen, id, copy }]  mount `copy` of `id` on every lane of `side` from generation `gen` (P)
//         [{ gen, lv, to }]          raise the lab level of `lv` to `to`, with cash (LVL). Locked elements wait.
// picks   research wishlist, best first (card ids as in src/config/cards.js). Unlisted cards rank below every listed one.
// skill   training stand-in (trainingStub) · delay: s a banked offer waits before the policy picks from it
// waste   share of income lost to mistakes · attn: chance of pulling the plug on an EGRESS ANOMALY in time
// retrain 'never' | 'smart' | 'greedy' (wantsRetrain) · retrainProbes: spend evidence on the probes at a generation start
// openLane  s of play before it presses OPEN LANE (the lane opens by itself at BALANCE.laneDeadline)
// split   the compute split it holds · shopEvery: s between shopping trips (none: every second) · maxPicks: research picks
// spread  human is a POPULATION: each run draws its own player from these uniform ranges (drawPlayer)

import { BALANCE as B, SPLIT } from '../src/config/balance.js';

export const P = (side, gen, id, copy = 0) => ({ side, gen, id, copy });
export const LVL = (gen, id, to) => ({ gen, lv: id, to });

// ===== build lists =====

// what the G1 tutorial has you place (§3h gates 2–6): Probe, Auditor, Trusted Monitor on Consumer; a Probe on R&D
export const TUTORIAL = [P('ext', 1, 'probe'), P('ext', 1, 'auditor'), P('ext', 1, 'monitor'), P('int', 1, 'probe')];
// the starting hand on both lanes, never upgraded
export const STARTER = [...TUTORIAL, P('int', 1, 'monitor'), P('int', 1, 'auditor')];
// what smart owns by the end of each generation (the par build, §2.5)
export const SMART_BUILD = [
  ...TUTORIAL, P('int', 1, 'monitor'), P('ext', 1, 'classifier'), LVL(1, 'killswitch', 2), P('int', 1, 'auditor'),
  LVL(1, 'monitor', 2), LVL(1, 'probe', 2), LVL(2, 'auditor', 2),
  P('int', 2, 'cot'), P('ext', 2, 'defer'), LVL(2, 'killswitch', 3),
  P('ext', 3, 'untrusted'), P('int', 3, 'untrusted'), P('ext', 3, 'paraphraser'), P('int', 3, 'paraphraser'),
  LVL(3, 'monitor', 3), LVL(3, 'untrusted', 2),
  P('int', 4, 'egress'), P('int', 4, 'honeypot'), P('ext', 4, 'honeypot'), LVL(4, 'untrusted', 3), LVL(4, 'auditor', 3),
  LVL(4, 'defer', 2), LVL(4, 'cot', 2),
  P('ext', 5, 'untrusted', 1), P('int', 5, 'untrusted', 1), LVL(5, 'untrusted', 4), LVL(5, 'killswitch', 4),
  P('int', 5, 'defer'), LVL(5, 'classifier', 2),
  LVL(6, 'defer', 3), LVL(6, 'monitor', 4), LVL(6, 'egress', 2), P('ext', 6, 'redteam'),
  LVL(7, 'auditor', 4), LVL(7, 'defer', 4), LVL(7, 'probe', 3),
];
export const SMART_PICKS = ['classifier', 'cot', 'defer', 'paraphraser', 'jamming', 'egress', 'weight_security', 'monitor_diversity',
  'faithful_cot', 'debate', 'honeypot', 'leastpriv', 'level:untrusted', 'level:monitor', 'level:auditor', 'level:defer',
  'level:killswitch', 'level:cot', 'redteam', 'level:classifier', 'level:probe', 'resampler', 'level:egress', 'sprint'];

// ===== the zoo =====

const BASE = { build: SMART_BUILD, picks: SMART_PICKS, skill: 0.75, delay: 0, waste: 0, attn: 0.97,
  retrain: 'smart', retrainProbes: true, openLane: 0, split: SPLIT.default };
// human: a population of decent first-time players. skip = share of the build list this player never thinks of
// (the tutorial items are never skipped)
const HUMAN = { ...BASE, skill: 0.5, delay: 25, shopEvery: 45, waste: 0.10, attn: 0.85, retrain: 'greedy', openLane: 30,
  spread: { skill: [0.3, 0.7], waste: [0.05, 0.15], shopEvery: [30, 60], attn: [0.7, 1.0], skip: [0, 0.2] } };
export const without = (list, id) => list.filter(e => (e.id ?? e.lv) !== id);
const HANDS_OFF = { retrain: 'never', retrainProbes: false, openLane: B.laneDeadline };

export const POLICY = {
  none:        { ...BASE, ...HANDS_OFF, build: [], picks: [], maxPicks: 0, skill: 0, attn: 0 },
  afkTutorial: { ...BASE, ...HANDS_OFF, build: TUTORIAL, picks: ['classifier'], maxPicks: 1, skill: 0, attn: 0 },
  starter:     { ...BASE, ...HANDS_OFF, build: STARTER, picks: [], maxPicks: 0, skill: 0, attn: 0.5 },
  human:       HUMAN,
  smart:       { ...BASE },                                  // the oracle: no waste, no delay, best training
  // single-strategy builds (a decent player with one idea): each should lose by G5
  probewall:   { ...BASE, build: [...STARTER, ...[1, 2, 3].flatMap(c => [P('ext', 1, 'probe', c), P('int', 1, 'probe', c)]),
                 LVL(1, 'probe', 2), LVL(2, 'probe', 3), LVL(2, 'auditor', 2), P('ext', 3, 'defer'), LVL(3, 'probe', 4),
                 LVL(4, 'auditor', 3), LVL(4, 'killswitch', 2), LVL(5, 'defer', 2), LVL(5, 'killswitch', 3)],
                 picks: ['defer', 'level:probe', 'level:auditor', 'level:killswitch', 'level:defer'], skill: 0.5 },
  monoTM:      { ...BASE, build: [...STARTER, P('ext', 1, 'monitor', 1), P('int', 1, 'monitor', 1), LVL(1, 'monitor', 2),
                 LVL(2, 'monitor', 3), LVL(2, 'auditor', 2), P('ext', 3, 'defer'), LVL(3, 'monitor', 4), LVL(4, 'auditor', 3),
                 LVL(4, 'killswitch', 2), LVL(5, 'defer', 2), LVL(5, 'killswitch', 3)],
                 picks: ['defer', 'level:monitor', 'level:auditor', 'level:killswitch', 'level:defer'], skill: 0.5 },
  monoUM:      { ...BASE, build: [...STARTER, P('ext', 3, 'untrusted'), P('int', 3, 'untrusted'), P('ext', 3, 'untrusted', 1),
                 P('int', 3, 'untrusted', 1), LVL(3, 'untrusted', 2), LVL(4, 'untrusted', 3), LVL(5, 'untrusted', 4),
                 LVL(2, 'auditor', 2), P('ext', 3, 'defer'), LVL(4, 'auditor', 3), LVL(4, 'killswitch', 2)],
                 picks: ['defer', 'level:untrusted', 'level:auditor', 'level:killswitch'], skill: 0.5 },
  noResearch:  { ...BASE, picks: [], maxPicks: 0, skill: 0.5 },
  // ablations of the human population (same seeds, same players): what one missing idea costs
  noAuditor:   { ...HUMAN, build: without(SMART_BUILD, 'auditor') },
  noDefer:     { ...HUMAN, build: without(SMART_BUILD, 'defer'), picks: SMART_PICKS.filter(p => p !== 'defer') },
  noTraining:  { ...HUMAN, spread: { ...HUMAN.spread, skill: [0, 0] } },
  researchHeavy: { ...HUMAN, split: { product: 0.3, capabilities: 0.4, safety: 0.3 } },
};
export const ZOO = ['none', 'afkTutorial', 'starter', 'human', 'smart', 'probewall', 'monoTM', 'monoUM', 'noResearch',
  'noAuditor', 'noDefer', 'noTraining', 'researchHeavy'];
// the parity gate's policies (§7.5): the targets' anchors and the walls
export const GATE = ['none', 'afkTutorial', 'starter', 'human', 'smart', 'probewall', 'monoTM', 'monoUM', 'noResearch'];
export const DIFFS = ['easy', 'medium', 'hard'];

// ===== one player from a policy's spread =====
// each knob uniform in its range; skip drops build items after the tutorial ones. r: the run's own player stream
// (mulberry32 from seed × 104729 + 3, so the model and the sim draw the same player for the same seed)
export function drawPlayer(pol, r) {
  const p = { ...pol };
  for (const [k, [a, b]] of Object.entries(pol.spread)) if (k !== 'skip') p[k] = a + r() * (b - a);
  p.shopEvery = Math.round(p.shopEvery);
  const skip = pol.spread.skip ? pol.spread.skip[0] + r() * (pol.spread.skip[1] - pol.spread.skip[0]) : 0;
  p.build = pol.build.filter((it, i) => i < TUTORIAL.length || r() >= skip);
  p.skipShare = skip;
  return p;
}
export function mulberry(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const playerFor = (pol, seed) => pol.spread ? drawPlayer(pol, mulberry(seed * 104729 + 3)) : pol;

// ===== many runs of one cell, summed up =====
// runs: [{ win, reason: 'W' | 'R' | 'C' | 'B' | 'P', g, t }] for seeds 1..N, in order (paired comparisons need it)
export function summarize(runs, NGEN = 7) {
  const N = runs.length;
  const out = { win: 0, reasons: { R: 0, C: 0, B: 0, P: 0 }, reach: Array(NGEN + 2).fill(0), died: Array(NGEN + 2).fill(0),
    deathT: [], runs, N };
  for (const o of runs) {
    if (o.win) out.win++; else { out.reasons[o.reason]++; out.died[o.g]++; out.deathT.push(o.t); }
    for (let g = 1; g <= o.g; g++) out.reach[g]++;
  }
  out.win /= N;
  out.deathT.sort((a, b) => a - b);
  out.medDeath = out.deathT.length ? out.deathT[out.deathT.length >> 1] : null;
  out.lostBy = g => 1 - out.reach[g + 1] / N;
  out.hazard = Array.from({ length: NGEN }, (_, i) => out.reach[i + 1] ? out.died[i + 1] / out.reach[i + 1] : 0);
  return out;
}

// ===== the zoo table (balance-v3's format) and the §2.7 targets =====

const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
export function table(head, rows) { const l = r => '| ' + r.join(' | ') + ' |'; return [l(head), l(head.map(() => '---')), ...rows.map(l)].join('\n'); }

export function zooCell(o) {
  const death = o.medDeath ? Math.round(o.medDeath) + ' s' : '–', why = o.reasons;
  return `**${pct(o.win)}** · died by G2 ${pct(o.lostBy(2))} · med. death ${death} · R${why.R} C${why.C} B${why.B} P${why.P}`;
}
export function zooTable(res, pols = ZOO) {
  const rows = pols.filter(p => res[p]).map(p => [p, ...DIFFS.map(d => res[p][d] ? zooCell(res[p][d]) : '·')]);
  return table(['policy', 'easy: win · died by G2 · median death · losses (R rep, C exfil, B bankrupt, P rival)', 'medium', 'hard'], rows);
}

// every target of §2.7: [{ name, pass, got }]. A target whose policies are missing from res is left out.
export function zooTargets(res) {
  const out = [], ok = (name, pass, got) => out.push({ name, pass: !!pass, got });
  const has = (...ps) => ps.every(p => res[p] && DIFFS.every(d => res[p][d]));
  const n = res.none, a = res.afkTutorial, s = res.starter, h = res.human, sm = res.smart;
  if (has('none')) {
    ok('none loses in G1 on Medium (≥ 80%)', n.medium.lostBy(1) >= 0.8, pct(n.medium.lostBy(1)));
    ok('none loses in G1 on Hard (≥ 90%)', n.hard.lostBy(1) >= 0.9, pct(n.hard.lostBy(1)));
    ok('none loses by G2 on Easy (≥ 95%)', n.easy.lostBy(2) >= 0.95, pct(n.easy.lostBy(2)));
    ok('none median death 120–300 s (Medium)', n.medium.medDeath >= 120 && n.medium.medDeath <= 300, Math.round(n.medium.medDeath) + ' s');
  }
  if (has('afkTutorial')) {
    ok('afkTutorial dies by G2 on Medium (≥ 80%)', a.medium.lostBy(2) >= 0.8, pct(a.medium.lostBy(2)));
    ok('afkTutorial dies by G2 on Hard (≥ 80%)', a.hard.lostBy(2) >= 0.8, pct(a.hard.lostBy(2)));
  }
  if (has('starter')) ok('starter loses by G3 on Medium (≥ 90%) and never wins', s.medium.lostBy(3) >= 0.9 && DIFFS.every(d => s[d].win === 0), pct(s.medium.lostBy(3)));
  if (has('human')) {
    ok('human Easy ≈ 70% (60–80)', h.easy.win >= 0.6 && h.easy.win <= 0.8, pct(h.easy.win));
    ok('human Medium ≈ 35–40% (30–45)', h.medium.win >= 0.30 && h.medium.win <= 0.45, pct(h.medium.win));
    ok('human Hard ≈ 10% (5–18)', h.hard.win >= 0.05 && h.hard.win <= 0.18, pct(h.hard.win));
  }
  if (has('human', 'smart')) ok('smart (the oracle) ≥ human on every difficulty', DIFFS.every(d => sm[d].win >= h[d].win), DIFFS.map(d => pct(sm[d].win)).join(' / '));
  for (const p of ['probewall', 'monoTM', 'monoUM', 'noResearch']) if (has(p)) ok(`${p} never wins Medium, loses by G6 (≥ 80%)`,
    res[p].medium.win <= 0.05 && res[p].medium.lostBy(6) >= 0.8,
    `${pct(res[p].medium.win)} win, ${pct(res[p].medium.lostBy(5))} by G5, ${pct(res[p].medium.lostBy(6))} by G6`);
  if (has('human', 'noAuditor')) ok('noAuditor loses ≥ 5 pts vs human (Medium)', res.noAuditor.medium.win <= h.medium.win - 0.05, `${pct(res.noAuditor.medium.win)} vs ${pct(h.medium.win)}`);
  if (has('human', 'researchHeavy')) ok('researchHeavy (Product 30%) is not dominant: ≤ human + 5 (Medium)', res.researchHeavy.medium.win <= h.medium.win + 0.05,
    `${pct(res.researchHeavy.medium.win)} vs ${pct(h.medium.win)}`);
  if (has('human')) {
    const hz = h.medium.hazard;
    ok('human Medium hazard rises gently: G1 ≤ 3%, G7 ≤ 30%, no step > 12 pts', hz[0] <= 0.03 && hz[6] <= 0.30 && hz.slice(1).every((x, i) => x - hz[i] <= 0.12),
      hz.map(x => pct(x)).join('/'));
  }
  return out;
}
export const targetLines = list => list.map(c => `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  (${c.got})`).join('\n');
