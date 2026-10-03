// ===== Headless sim runner + tests =====
// usage:  node test/headless.mjs                 (all tests)
//         node test/headless.mjs run all 7       (one verbose run: policy, seed)
//         node test/headless.mjs balance smart   (win/loss table across difficulties)

import { createState, step, placeLayer, sellLayer, drawResearch, pickResearch, choose, retrainProbes, debugUnlockAll } from '../src/sim/sim.js';
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
  // smart: a reasonable human strategy, used for balancing (not asserted)
  smart:   { fn: smartPolicy },
};

// ----- smart policy: cheap detectors, swap humans for AI responders as bundles grow -----
const PREFER = ['unlock_defer', 'unlock_untrusted', 'unlock_paraphraser', 'retrain_probes', 'extra_slot_int', 'unlock_sandbox', 'unlock_resampler', 'unlock_honeypot', 'irt', 'extra_slot_ext', 'monitor_ensemble', 'ai_auditing', 'tripwires'];
function want(st) {
  const has = id => st.unlocked.includes(id);
  const late = st.gen >= 3;
  const respExt = has('defer') && (late || !has('auditor')) ? 'defer' : 'auditor';
  const respInt = has('defer') && late ? 'defer' : 'auditor';
  const ext = ['probe', 'monitor', has('untrusted') ? 'untrusted' : null, respExt];
  const int = [has('paraphraser') ? 'paraphraser' : null, has('untrusted') ? 'untrusted' : 'probe', st.gen >= 4 && has('sandbox') && st.gen <= 5 ? 'sandbox' : 'probe', respInt];
  // extra slots: more detectors in the internal lane, a resampler above the final responder
  const extraInt = [has('untrusted') ? 'untrusted' : 'probe', has('honeypot') ? 'honeypot' : 'probe', has('resampler') ? 'resampler' : 'probe'];
  for (let i = 4; i < st.lanes.int.slots.length; i++) int.splice(int.length - 1, 0, extraInt[i - 4]);
  for (let i = 4; i < st.lanes.ext.slots.length; i++) ext.splice(ext.length - 1, 0, 'probe');
  return { ext, int };
}
function smartPolicy(st) {
  if (st.pendingChoice) choose(st, st.pendingChoice.eventId === 'caught' ? 0 : st.money > 2000 * GENERATIONS[st.gen - 1].bundle ? 1 : 0);
  if (st.pendingResearch) {
    const ids = st.pendingResearch;
    const rank = id => { const r = PREFER.indexOf(id); return r < 0 ? 99 : r; };
    pickResearch(st, rank(ids[0]) <= rank(ids[1] ?? ids[0]) ? 0 : 1);
  }
  const w = want(st);
  for (const lane of ['ext', 'int']) {
    w[lane].forEach((id, i) => {
      const s = st.lanes[lane].slots[i];
      if (!id || s.layer === id) return;
      if (s.layer && st.money > 3 * (LAYERS[id].buy * GENERATIONS[st.gen - 1].bundle)) sellLayer(st, lane, i);
      if (!s.layer) placeLayer(st, lane, i, id);
    });
  }
  if (st.probe.trainedGen < st.gen) retrainProbes(st);
  if (st.money > 1.5 * (1000 * Math.pow(1.6, st.researchCount) * GENERATIONS[st.gen - 1].bundle)) drawResearch(st);
}

const ORDER = ['probe', 'monitor', 'untrusted', 'paraphraser', 'honeypot', 'sandbox', 'resampler', 'defer', 'auditor'];

function act(st, policy) {
  if (policy.fn) return policy.fn(st);
  if (st.pendingChoice) choose(st, 1 % 2);                  // "keep running" / "refuse": never halts
  if (st.pendingResearch) {
    const ids = st.pendingResearch;
    // all-layers: more slots first, then unlocks, then anything
    const score = id => (CARD_BY_ID[id].lane ? 0 : CARD_BY_ID[id].type === 'unlock' ? 1 : 2);
    pickResearch(st, ids.length > 1 && score(ids[1]) < score(ids[0]) ? 1 : 0);
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

  console.log('\n▶ Policy: smart (balance reference, not asserted)');
  for (const s of seeds) { const r = run('smart', s); summary('smart', s, r); results.push([`smart/${s}`, r]); }

  console.log('\n▶ Policy: all layers (Medium) — must never win; bankrupt or behind the rival in ≥ 4/5 seeds');
  let taxed = 0;
  for (const s of seeds) {
    const r = run('all', s); summary('all', s, r); results.push([`all/${s}`, r]);
    const bankrupt = r.card.reason === 'bankrupt';
    const behind = r.rivalAheadT > 0.25 * r.st.t;
    if (bankrupt || behind) taxed++;
    check(`all seed ${s} does not win`, !r.card.win, `bankrupt=${bankrupt}, rival ahead ${pct(r.rivalAheadT / r.st.t)} of the run, ended ${r.card.reason}`);
  }
  check(`all-layers bankrupt or behind rival in ≥ 4/5 seeds`, taxed >= 4, `${taxed}/5`);
  return results;
}

function testDeterminism() {
  console.log('\n▶ Determinism (?seed=N reproducible)');
  const a = run('starter', 99, { maxT: 400 }), b = run('starter', 99, { maxT: 400 });
  check('same seed → same money, rep, m', a.st.money === b.st.money && a.st.rep === b.st.rep && a.st.m === b.st.m, `$${a.st.money.toFixed(2)} vs $${b.st.money.toFixed(2)}`);
}

// =================== main ===================

const [, , cmd, pol, seedArg] = process.argv;
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (!isMain) { /* imported as a module */ }
else if (cmd === 'balance') {
  // win/loss table for a policy across difficulties: W7 = win, R/C/B = reputation/catastrophe/bankrupt + gen reached
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const rows = [];
    for (let seed = 1; seed <= 10; seed++) { const r = run(pol || 'smart', seed, { difficulty }); rows.push(`${r.card.win ? 'W' : r.card.reason[0].toUpperCase()}${r.st.gen}`); }
    console.log(difficulty.padEnd(7), rows.join(' '));
  }
}
else if (cmd === 'run') {
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
