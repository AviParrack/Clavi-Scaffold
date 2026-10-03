// ===== Headless sim runner + tests =====
// usage:  node test/headless.mjs            (all tests)
//         node test/headless.mjs run all 7  (one verbose run: policy, seed)

import { createState, step, placeLayer, drawResearch, pickResearch, choose, debugUnlockAll } from '../src/sim/sim.js';
import { scorecard } from '../src/sim/scorecard.js';
import { LAYERS } from '../src/config/layers.js';
import { GENERATIONS } from '../src/config/generations.js';
import { CARD_BY_ID } from '../src/sim/research.js';
import { rivalAhead, playerProgress } from '../src/sim/rules.js';
import { big, pct } from '../src/util/format.js';

const DT = 0.05;

// =================== scripted policies ===================
// build: [lane, slot, layer] placed in order as soon as affordable

const STARTER = [['ext', 0, 'probe'], ['int', 0, 'probe'], ['ext', 1, 'monitor'], ['int', 1, 'monitor'], ['int', 3, 'auditor'], ['ext', 3, 'auditor']];

export const POLICIES = {
  none:    { build: [] },
  starter: { build: STARTER },
  // all: research greedily, fill every slot, keep everything on
  all:     { build: STARTER, research: true, fillAll: true },
};

const ORDER = ['probe', 'monitor', 'untrusted', 'paraphraser', 'honeypot', 'sandbox', 'resampler', 'defer', 'auditor'];

function act(st, policy) {
  if (st.pendingChoice) choose(st, 1 % 2);                  // "keep running" / "refuse": never halts
  if (st.pendingResearch) {
    const ids = st.pendingResearch;
    const unlock = ids.findIndex(id => CARD_BY_ID[id].type === 'unlock');
    pickResearch(st, Math.max(0, unlock));
  }
  for (const [lane, slot, id] of policy.build) {
    const s = st.lanes[lane].slots[slot];
    if (!s.layer && st.unlocked.includes(id)) placeLayer(st, lane, slot, id);
  }
  if (policy.fillAll) {
    for (const lane of ['ext', 'int']) {
      const slots = st.lanes[lane].slots;
      slots.forEach((s, i) => {
        if (s.layer) return;
        const id = ORDER.find(id => st.unlocked.includes(id) && !slots.some(x => x.layer === id));
        if (id) placeLayer(st, lane, i, id);
      });
    }
  }
  if (policy.research) drawResearch(st);
}

// =================== one run ===================

export function run(policyName, seed, opts = {}) {
  const policy = POLICIES[policyName] || policyName;
  const st = createState({ seed, difficulty: opts.difficulty || 'medium', tutorial: false });
  if (opts.setup) opts.setup(st);
  const maxT = opts.maxT ?? 3600;
  let rivalAheadT = 0;
  while (!st.over && st.t < maxT) {
    act(st, policy);
    step(st, DT);
    if (rivalAhead(st)) rivalAheadT += DT;
    if (opts.lockGen) st.rd = 0;
    if (opts.immortal) { st.rep = 100; st.money = 1e9; }
  }
  return { st, card: scorecard(st), rivalAheadT, progress: playerProgress(st) };
}

// =================== reporting ===================

function confusion(st) {
  const rows = [];
  for (const [id, c] of Object.entries(st.stats.layers)) {
    const tpr = c.attackSeen ? c.attackFlagged / c.attackSeen : NaN;
    const fpr = c.benignSeen ? c.benignFlagged / c.benignSeen : NaN;
    const exp = c.attackSeen ? c.expTPRsum / c.attackSeen : NaN;
    rows.push(`    ${LAYERS[id].name.padEnd(18)} attacks ${String(c.attackFlagged).padStart(5)}/${String(c.attackSeen).padEnd(5)} TPR ${tpr.toFixed(3)} (exp ${exp.toFixed(3)})   benign ${String(c.benignFlagged).padStart(5)}/${String(c.benignSeen).padEnd(6)} FPR ${fpr.toFixed(3)}`);
  }
  return rows.join('\n') || '    (no layers)';
}

function summary(name, seed, r) {
  const { st, card } = r;
  const outcome = card.win ? 'WIN' : `LOSS (${card.reason})`;
  console.log(`  [${name} seed=${seed}] ${outcome} at G${st.gen} ${GENERATIONS[st.gen - 1].name}, t=${st.t.toFixed(0)}s`);
  console.log(`    money ${big(st.money)}  income ${big(card.income)}  safety spend ${big(card.safety)} (${pct(card.safetyShare)})  rep ${st.rep.toFixed(1)}`);
  console.log(`    attacks ${card.attacks}: stopped ${card.stopped}, landed ${card.landed}   true m by gen: ${card.gens.map(g => g.m.toFixed(2)).join(' ')}`);
  console.log(`    rival ${st.rival.toFixed(2)} vs you ${r.progress.toFixed(2)}, rival ahead ${r.rivalAheadT.toFixed(0)}s   ending: ${card.ending.title} (${card.grade})`);
}

// =================== tests ===================

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

function testCalibration() {
  console.log('\n▶ Detector calibration (G1, forced m=1, one detector per run, 30 min each)');
  const stealth = 1 - GENERATIONS[0].stealth / 2;
  const U = LAYERS.untrusted;
  const cfgTPR = {
    probe: LAYERS.probe.tpr * stealth,
    monitor: GENERATIONS[0].tmTPR * stealth,
    untrusted: U.tpr * stealth * (1 - Math.min(U.collusionMax, U.collusionPerM * 1)),
  };
  for (const id of ['probe', 'monitor', 'untrusted']) {
    const r = run({ build: [['ext', 0, id], ['int', 0, id]] }, 42, {
      maxT: 1800, lockGen: true, immortal: true,
      setup: st => { st.m = 1; st.money = 1e9; st.rep = 1e9; debugUnlockAll(st); st.nextEventAt = Infinity; },
    });
    console.log(confusion(r.st));
    const c = r.st.stats.layers[id];
    const tpr = c.attackFlagged / c.attackSeen, fpr = c.benignFlagged / c.benignSeen;
    const expT = cfgTPR[id];
    const tolT = 3 * Math.sqrt(expT * (1 - expT) / c.attackSeen) + 0.01;
    const tolF = 3 * Math.sqrt(LAYERS[id].fpr * (1 - LAYERS[id].fpr) / c.benignSeen) + 0.005;
    check(`${id} TPR ${tpr.toFixed(3)} ≈ config ${expT.toFixed(3)}`, Math.abs(tpr - expT) < tolT, `n=${c.attackSeen}, tol ±${tolT.toFixed(3)}`);
    check(`${id} FPR ${fpr.toFixed(3)} ≈ config ${LAYERS[id].fpr}`, Math.abs(fpr - LAYERS[id].fpr) < tolF, `n=${c.benignSeen}, tol ±${tolF.toFixed(3)}`);
  }
}

function testMoney(results) {
  console.log('\n▶ Money conservation (income − costs = balance change)');
  for (const [name, r] of results) {
    const L = r.st.ledger;
    const drift = L.start + L.income - L.spend - r.st.money;
    check(`${name}: ledger balances`, Math.abs(drift) <= 1e-6 * Math.max(1, Math.abs(r.st.money), L.income), `residual ${drift.toExponential(2)}`);
  }
}

function testPolicies() {
  const seeds = [1, 2, 3, 4, 5];
  const results = [];

  console.log('\n▶ Policy: no layers (Medium) — must lose before G4');
  for (const s of seeds) {
    const r = run('none', s); summary('none', s, r); results.push([`none/${s}`, r]);
    check(`none seed ${s} loses before G4`, !r.card.win && r.st.gen < 4, `ended G${r.st.gen} (${r.card.reason})`);
  }

  console.log('\n▶ Policy: starter hand only (Medium)');
  for (const s of seeds.slice(0, 3)) { const r = run('starter', s); summary('starter', s, r); results.push([`starter/${s}`, r]); console.log(confusion(r.st)); }

  console.log('\n▶ Policy: all layers (Medium) — must go bankrupt or fall behind the rival');
  for (const s of seeds) {
    const r = run('all', s); summary('all', s, r); results.push([`all/${s}`, r]);
    const bankrupt = r.card.reason === 'bankrupt';
    const behind = r.rivalAheadT > 0.25 * r.st.t;
    check(`all seed ${s} bankrupt or behind rival`, bankrupt || behind, `bankrupt=${bankrupt}, rival ahead ${pct(r.rivalAheadT / r.st.t)} of the run`);
  }
  return results;
}

function testDeterminism() {
  console.log('\n▶ Determinism (?seed=N reproducible)');
  const a = run('starter', 99, { maxT: 400 }), b = run('starter', 99, { maxT: 400 });
  check('same seed → same money, rep, m', a.st.money === b.st.money && a.st.rep === b.st.rep && a.st.m === b.st.m, `$${a.st.money.toFixed(2)} vs $${b.st.money.toFixed(2)}`);
}

// =================== main ===================

const [, , cmd, pol, seedArg] = process.argv;
if (cmd === 'run') {
  const r = run(pol || 'starter', Number(seedArg || 1));
  summary(pol, seedArg, r);
  console.log(confusion(r.st));
  console.log(JSON.stringify(r.card.lanes, null, 1));
} else {
  const t0 = Date.now();
  testCalibration();
  testDeterminism();
  const results = testPolicies();
  testMoney(results);
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ ALL PASSED'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failures ? 1 : 0);
}
