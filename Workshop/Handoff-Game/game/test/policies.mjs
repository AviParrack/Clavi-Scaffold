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
// keep    build items a drawn player never forgets (the one the tutorial's step 4 points it at)
// reroll  a card id: while it is eligible and not yet owned, the free reroll goes on an offer that lacks it

import { BALANCE as B, SPLIT } from '../src/config/balance.js';

export const P = (side, gen, id, copy = 0) => ({ side, gen, id, copy });
export const LVL = (gen, id, to) => ({ gen, lv: id, to });

// ===== build lists =====

// what the G1 tutorial has you place (§3h gates 2–6): Probe, Auditor, Trusted Monitor on Consumer; a Probe on R&D
export const TUTORIAL = [P('ext', 1, 'probe'), P('ext', 1, 'auditor'), P('ext', 1, 'monitor'), P('int', 1, 'probe')];
// the Kill Switch is never free (v4): a policy that wants one buys it, one per lane of its side, contract lanes too.
// The tutorial's step 4 points at Consumer's overflow, so a human who answers it with a Kill Switch never forgets that one
const POINTED_AT = P('ext', 1, 'killswitch');
const KILL = [POINTED_AT, P('int', 1, 'killswitch')];
// the starting hand on both lanes, never upgraded
export const STARTER = [...TUTORIAL, P('int', 1, 'monitor'), P('int', 1, 'auditor'), ...KILL];
export const without = (list, id) => list.filter(e => (e.id ?? e.lv) !== id);
// G1's levels and everything after: smart's and human's lists share it
const LATER = [
  LVL(1, 'monitor', 2), LVL(1, 'probe', 2), LVL(2, 'auditor', 2),
  P('int', 2, 'cot'), P('ext', 2, 'defer'), LVL(2, 'killswitch', 3),
  P('ext', 3, 'untrusted'), P('int', 3, 'untrusted'), P('ext', 3, 'paraphraser'), P('int', 3, 'paraphraser'),
  LVL(3, 'monitor', 3), LVL(3, 'untrusted', 2),
  P('int', 4, 'egress'), P('int', 4, 'honeypot'), P('ext', 4, 'honeypot'), LVL(4, 'untrusted', 3), LVL(4, 'auditor', 3),
  LVL(4, 'defer', 2), LVL(4, 'cot', 2),
  P('int', 4, 'defer'),   // R&D's Defer with Defer L2 (was G5; at G2 it stood in for R&D's desk: noAuditor came within 5, §2.9 #22)
  P('ext', 5, 'untrusted', 1), P('int', 5, 'untrusted', 1), LVL(5, 'untrusted', 4), LVL(5, 'killswitch', 4),
  LVL(5, 'classifier', 2),
  LVL(6, 'defer', 3), LVL(6, 'monitor', 4), LVL(6, 'egress', 2), P('ext', 6, 'redteam'),
  LVL(7, 'auditor', 4), LVL(7, 'defer', 4), LVL(7, 'probe', 3),
];
// what smart owns by the end of each generation (the par build, §2.5). The oracle buys both Kill Switches first:
// on Consumer a refusal pays from 14% precision, and G1's flags run ~50% real
export const SMART_BUILD = [
  ...TUTORIAL, ...KILL, P('int', 1, 'monitor'), P('ext', 1, 'classifier'), LVL(1, 'killswitch', 2), P('int', 1, 'auditor'),
  ...LATER,
];
// a decent first-time player buys a lane's Kill Switch once that lane's desk overflows: Consumer's right after the
// tutorial (its step 4 points at the overflow); R&D, whose Probe has nothing below it, gets a desk first, then its own.
// A second operator (L2) once the Kill Switches overflow too, then smart's G1 list
export const HUMAN_BUILD = [
  ...TUTORIAL, POINTED_AT, P('int', 1, 'auditor'), P('int', 1, 'killswitch'), LVL(1, 'killswitch', 2),
  P('int', 1, 'monitor'), P('ext', 1, 'classifier'),
  ...LATER,
];
export const SMART_PICKS = ['classifier', 'cot', 'defer', 'paraphraser', 'jamming', 'egress', 'weight_security', 'monitor_diversity',
  'faithful_cot', 'debate', 'honeypot', 'leastpriv', 'level:untrusted', 'level:monitor', 'level:auditor', 'level:defer',
  'level:killswitch', 'level:cot', 'redteam', 'level:classifier', 'level:probe', 'resampler', 'level:egress', 'sprint'];

// ===== no Kill Switch, ever (Avi, v5: "Make it viable"; DESIGN-v3 §2.9 #21) =====
// The same population answers step 4's overflow another way and keeps to it: its Kill Switch items become desks, or Defer
const NO_KILL_LATER = without(LATER, 'killswitch');
const NO_KILL_PICKS = SMART_PICKS.filter(p => p !== 'level:killswitch');
const first = (ids, picks) => [...ids, ...picks.filter(p => !ids.includes(p))];
// desks: a second desk on Consumer where its Kill Switch was (L2: $300 while only Consumer has a desk), R&D's desk
// (it arrives at the lab's L2), a third (L3: from here a desk reads faster) where R&D's Kill Switch and its L2 were,
// a fourth at G3. Defer comes as in human's list
const MORE_DESKS = LVL(1, 'auditor', 2);
export const DESKS_BUILD = [
  ...TUTORIAL, MORE_DESKS, P('int', 1, 'auditor'), LVL(1, 'auditor', 3),
  P('int', 1, 'monitor'), P('ext', 1, 'classifier'), LVL(3, 'auditor', 4),
  ...NO_KILL_LATER,
];
// defer: the trusted model takes the overflow. Defer on every lane the moment research offers it (an item waits for
// its card; the free reroll goes on an offer without it), a second slot at once, its later levels two generations
// early; the rest is human's list
const DEFER_FIRST = P('ext', 1, 'defer');
export const DEFER_BUILD = [
  ...TUTORIAL, DEFER_FIRST, P('int', 1, 'auditor'), P('int', 1, 'defer'), LVL(1, 'defer', 2),
  P('int', 1, 'monitor'), P('ext', 1, 'classifier'), LVL(4, 'defer', 3), LVL(5, 'defer', 4),
  ...without(NO_KILL_LATER, 'defer'),
];
// both at once (step 4's "more desks with Defer behind them"): Defer first, then desks where the Kill Switches were
export const HYBRID_BUILD = [
  ...TUTORIAL, DEFER_FIRST, P('int', 1, 'auditor'), P('int', 1, 'defer'), MORE_DESKS, LVL(1, 'defer', 2), LVL(1, 'auditor', 3),
  P('int', 1, 'monitor'), P('ext', 1, 'classifier'), LVL(3, 'auditor', 4), LVL(4, 'defer', 3), LVL(5, 'defer', 4),
  ...without(NO_KILL_LATER, 'defer'),
];
// no single opening runs away: human, Kill Switch and all, with Defer as its next answer (an R&D Defer and Defer L2 in
// G1, Defer and its levels first in research)
export const HUMAN_DEFER_BUILD = [
  ...TUTORIAL, POINTED_AT, DEFER_FIRST, P('int', 1, 'auditor'), P('int', 1, 'defer'), P('int', 1, 'killswitch'), LVL(1, 'killswitch', 2),
  P('int', 1, 'monitor'), P('ext', 1, 'classifier'), LVL(1, 'defer', 2),
  ...LATER,
];

// ===== the zoo =====

const BASE = { build: SMART_BUILD, picks: SMART_PICKS, skill: 0.75, delay: 0, waste: 0, attn: 0.97,
  retrain: 'smart', retrainProbes: true, openLane: 0, split: SPLIT.default };
// human: a population of decent first-time players. skip = share of the build list this player never thinks of
// (never the tutorial items, nor the Consumer Kill Switch the tutorial points at)
const HUMAN = { ...BASE, build: HUMAN_BUILD, keep: [POINTED_AT], skill: 0.5, delay: 25, shopEvery: 45, waste: 0.10, attn: 0.85,
  retrain: 'greedy', openLane: 30, spread: { skill: [0.3, 0.7], waste: [0.05, 0.15], shopEvery: [30, 60], attn: [0.7, 1.0], skip: [0, 0.2] } };
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
  noAuditor:   { ...HUMAN, build: without(HUMAN_BUILD, 'auditor') },
  noDefer:     { ...HUMAN, build: without(HUMAN_BUILD, 'defer'), picks: SMART_PICKS.filter(p => p !== 'defer') },
  noKill:      { ...HUMAN, build: without(HUMAN_BUILD, 'killswitch'), picks: NO_KILL_PICKS },   // and nothing in its place
  // three styles that never buy a Kill Switch (the viability targets): human's players, its spread, its seeds
  noKillDesks: { ...HUMAN, build: DESKS_BUILD, keep: [MORE_DESKS], picks: first(['classifier', 'level:auditor'], NO_KILL_PICKS) },
  noKillDefer: { ...HUMAN, build: DEFER_BUILD, keep: [DEFER_FIRST], picks: first(['defer', 'level:defer'], NO_KILL_PICKS), reroll: 'defer' },
  noKillHybrid: { ...HUMAN, build: HYBRID_BUILD, keep: [DEFER_FIRST], picks: first(['defer', 'level:defer', 'level:auditor'], NO_KILL_PICKS), reroll: 'defer' },
  // human's own sharper opening: the Kill Switch, then Defer as fast as the game allows (no opening runs away)
  humanDefer:  { ...HUMAN, build: HUMAN_DEFER_BUILD, picks: first(['defer', 'level:defer'], SMART_PICKS), reroll: 'defer' },
  noTraining:  { ...HUMAN, spread: { ...HUMAN.spread, skill: [0, 0] } },
  researchHeavy: { ...HUMAN, split: { product: 0.3, capabilities: 0.4, safety: 0.3 } },
};
export const ZOO = ['none', 'afkTutorial', 'starter', 'human', 'smart', 'probewall', 'monoTM', 'monoUM', 'noResearch',
  'noAuditor', 'noDefer', 'noKill', 'noKillDesks', 'noKillDefer', 'noKillHybrid', 'humanDefer', 'noTraining', 'researchHeavy'];
// the parity gate's policies (§7.5): the targets' anchors and the walls
export const GATE = ['none', 'afkTutorial', 'starter', 'human', 'smart', 'probewall', 'monoTM', 'monoUM', 'noResearch'];
export const DIFFS = ['easy', 'medium', 'hard'];
const DLABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const NO_KILL_STYLES = ['noKillDesks', 'noKillDefer', 'noKillHybrid'];
const OPENING_MAX = 0.15;   // a sharper opening may beat human by this much, no more (v4: +9.5; v5 as first shipped: +17, §2.9 #22)

// ===== one player from a policy's spread =====
// each knob uniform in its range; skip drops build items, never the tutorial's nor the policy's keep. r: the run's own
// player stream (mulberry32 from seed × 104729 + 3, so the model and the sim draw the same player for the same seed)
export function drawPlayer(pol, r) {
  const p = { ...pol };
  for (const [k, [a, b]] of Object.entries(pol.spread)) if (k !== 'skip') p[k] = a + r() * (b - a);
  p.shopEvery = Math.round(p.shopEvery);
  const skip = pol.spread.skip ? pol.spread.skip[0] + r() * (pol.spread.skip[1] - pol.spread.skip[0]) : 0;
  p.build = pol.build.filter(it => TUTORIAL.includes(it) || pol.keep?.includes(it) || r() >= skip);
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
  if (has('human', 'noDefer')) ok('noDefer loses ≥ 5 pts vs human (Medium)', res.noDefer.medium.win <= h.medium.win - 0.05, `${pct(res.noDefer.medium.win)} vs ${pct(h.medium.win)}`);
  // winning without ever buying a Kill Switch (Avi, v5: "Make it viable"; DESIGN-v3 §8 decision 1)
  if (has('human', 'noKillDesks', 'noKillDefer')) {
    const kd = res.noKillDesks, kf = res.noKillDefer, best = d => Math.max(kd[d].win, kf[d].win), worst = d => Math.min(kd[d].win, kf[d].win);
    const both = d => `desks ${pct(kd[d].win)} · defer ${pct(kf[d].win)}`;
    ok('no Kill Switch, Medium: the better style wins ≥ 25%, each ≥ 18%', best('medium') >= 0.25 && worst('medium') >= 0.18, both('medium'));
    ok('no Kill Switch, Easy: the better style wins ≥ 45%', best('easy') >= 0.45, both('easy'));
    ok('the Kill Switch still pays: human ≥ the weaker no-Kill style (Medium)', h.medium.win >= worst('medium'), `human ${pct(h.medium.win)} vs ${both('medium')}`);
  }
  // no new dominant style: the best of the three no-Kill styles (desks, Defer, both), on Medium and on Hard
  if (has('human', ...NO_KILL_STYLES)) for (const d of ['medium', 'hard']) {
    const top = Math.max(...NO_KILL_STYLES.map(p => res[p][d].win)), all = NO_KILL_STYLES.map(p => pct(res[p][d].win)).join(' / ');
    ok(`no Kill Switch is no new dominant style: desks, Defer and both each ≤ human + 5 (${DLABEL[d]})`, top <= h[d].win + 0.05, `${all} vs human ${pct(h[d].win)}`);
  }
  // no single opening runs away: human with Defer as its next answer, and the Kill Switch's worth with Defer matched
  if (has('human', 'humanDefer')) ok(`humanDefer (Defer first, R&D Defer and L2 in G1) ≤ human + ${Math.round(100 * OPENING_MAX)} (Medium)`,
    res.humanDefer.medium.win <= h.medium.win + OPENING_MAX, `${pct(res.humanDefer.medium.win)} vs ${pct(h.medium.win)}`);
  if (has('humanDefer', 'noKillHybrid')) ok('the Kill Switch still pays with Defer matched: humanDefer ≥ noKillHybrid + 5 (Medium)',
    res.humanDefer.medium.win >= res.noKillHybrid.medium.win + 0.05, `${pct(res.humanDefer.medium.win)} vs ${pct(res.noKillHybrid.medium.win)}`);
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
