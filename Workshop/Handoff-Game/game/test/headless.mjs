// ===== Headless sim runner + tests =====
// usage:  node test/headless.mjs                 (all tests)
//         node test/headless.mjs run all 7       (one verbose run: policy, seed)
//         node test/headless.mjs balance smart   (win/loss table across difficulties)

import { createState, step, placeLayer, sellLayer, drawResearch, pickResearch, choose, retrainProbes, debugUnlockAll, buySlot, upgrade } from '../src/sim/sim.js';
import { scorecard } from '../src/sim/scorecard.js';
import { LAYERS } from '../src/config/layers.js';
import { UPGRADES, MAX_LEVEL } from '../src/config/upgrades.js';
import { BALANCE as B } from '../src/config/balance.js';
import { GENERATIONS } from '../src/config/generations.js';
import { CARD_BY_ID } from '../src/sim/research.js';
import { rivalAhead, playerProgress, elementStats, slotPrice, upgradePrice, killTrigger } from '../src/sim/rules.js';
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
  const ext = ['probe', 'monitor', has('untrusted') ? 'untrusted' : null];
  const int = [has('paraphraser') ? 'paraphraser' : null, has('untrusted') ? 'untrusted' : 'probe', st.gen >= 4 && has('sandbox') && st.gen <= 5 ? 'sandbox' : 'probe'];
  // spare slots: more detectors in the internal lane, a resampler above the final responder
  const extraInt = [has('untrusted') ? 'untrusted' : 'probe', has('honeypot') ? 'honeypot' : 'probe', has('resampler') ? 'resampler' : 'probe'];
  for (let i = 0; int.length < st.lanes.int.slots.length - 2; i++) int.push(extraInt[i] || null);
  while (ext.length < st.lanes.ext.slots.length - 2) ext.push(null);
  // bottom two tiers: responder, then the kill switch as catch-all
  ext.push(respExt, 'killswitch'); int.push(respInt, 'killswitch');
  return { ext, int };
}
const UPGRADE_FIRST = ['auditor', 'defer', 'untrusted', 'monitor', 'probe', 'killswitch'];
function smartSpend(st) {
  for (const id of UPGRADE_FIRST) for (const lane of ['ext', 'int']) st.lanes[lane].slots.forEach((s, i) => {
    if (s.layer === id && s.level < MAX_LEVEL && st.money > 4 * upgradePrice(st, id, s.level)) upgrade(st, lane, i);
  });
  if (st.gen >= 3 && slotPrice(st, 'int') !== null && st.money > 6 * slotPrice(st, 'int')) buySlot(st, 'int');
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
  smartSpend(st);
  if (st.money > 1.5 * (1000 * Math.pow(1.6, st.researchCount) * GENERATIONS[st.gen - 1].bundle)) drawResearch(st);
}

const ORDER = ['probe', 'monitor', 'untrusted', 'paraphraser', 'honeypot', 'sandbox', 'resampler', 'defer', 'auditor', 'killswitch'];

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
    if (opts.each) opts.each(st);
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

const BAY_KEYS = ['pulled', 'approved', 'tossed', 'waved', 'bayFull', 'killed', 'completedFlagged', 'timeouts'];
function bayLine(st) {
  return ['ext', 'int'].map(l => `${l}: ` + BAY_KEYS.map(k => `${k} ${st.stats.lanes[l][k] || 0}`).join(' ')).join('  |  ');
}

function summary(name, seed, r) {
  const { st, card } = r;
  const outcome = card.win ? 'WIN' : `LOSS (${card.reason})`;
  console.log(`  [${name} seed=${seed}] ${outcome} at G${st.gen} ${GENERATIONS[st.gen - 1].name}, t=${st.t.toFixed(0)}s`);
  console.log(`    money ${big(st.money)}  income ${big(card.income)}  safety spend ${big(card.safety)} (${pct(card.safetyShare)})  rep ${st.rep.toFixed(1)}`);
  console.log(`    attacks ${card.attacks}: stopped ${card.stopped}, landed ${card.landed}   true m by gen: ${card.gens.map(g => g.m.toFixed(2)).join(' ')}`);
  console.log(`    rival ${st.rival.toFixed(2)} vs you ${r.progress.toFixed(2)}, rival ahead ${r.rivalAheadT.toFixed(0)}s   ending: ${card.ending.title} (${card.grade})`);
  console.log(`    ${bayLine(st)}`);
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

// =================== v2: slots, bays, upgrades, kill switch ===================

// lab conditions: G1 forever, no events, unlimited money, all layers unlocked
const lab = extra => st => { st.money = 1e9; debugUnlockAll(st); st.nextEventAt = Infinity; if (extra) extra(st); };
const labOpts = (setup, each, maxT = 300) => ({ maxT, lockGen: true, immortal: true, setup: lab(setup), each });

// test harness: flag chips the moment they spawn (no detector involved), so bays and the kill switch see traffic
const flagAtSpawn = (which = () => true) => st => {
  for (const l of ['ext', 'int']) for (const t of st.lanes[l].tasks) if (!t.seenByHarness) { t.seenByHarness = true; if (which(t)) t.flagged = true; }
};

function testSlots() {
  console.log('\n▶ Deep stack: 6 slots to start, buy up to 10, price escalates');
  const st = createState({ seed: 7, tutorial: false });
  st.money = 1e9;
  check(`lanes start with ${B.startSlots} slots`, st.lanes.ext.slots.length === 6 && st.lanes.int.slots.length === 6);
  const prices = [];
  while (slotPrice(st, 'ext') !== null) { prices.push(slotPrice(st, 'ext')); buySlot(st, 'ext'); }
  console.log(`    slot prices: ${prices.map(p => '$' + p.toFixed(0)).join(' → ')}`);
  check('slot price strictly escalates', prices.every((p, i) => i === 0 || p > prices[i - 1]), prices.length + ' slots bought');
  check(`stops at ${B.maxSlots}`, st.lanes.ext.slots.length === B.maxSlots && !buySlot(st, 'ext').ok);
}

function testBays() {
  console.log('\n▶ Side bays: a full bay never stalls the lane (every chip flagged at spawn)');
  // EXTERNAL: Defer at the bottom (bay full → wave). INTERNAL: Human Auditor (bay full → block).
  // G1 traffic never fills 2 Defer desks at 0.5 s each, so this test stretches Defer's desk time to 4 s.
  let maxBay = { ext: 0, int: 0 };
  const deferLatency = LAYERS.defer.latency;
  LAYERS.defer.latency = 4;
  const r = run({ build: [] }, 11, labOpts(
    st => { placeLayer(st, 'ext', 5, 'defer'); placeLayer(st, 'int', 5, 'auditor'); },
    st => { flagAtSpawn()(st); for (const l of ['ext', 'int']) maxBay[l] = Math.max(maxBay[l], st.lanes[l].bay.length); },
  ));
  LAYERS.defer.latency = deferLatency;
  const st = r.st;
  console.log(`    ${bayLine(st)}`);
  for (const [lane, id] of [['ext', 'defer'], ['int', 'auditor']]) {
    const s = st.stats.lanes[lane], desks = elementStats(st, id, { level: 1 }).desks;
    const inFlight = st.lanes[lane].tasks.length + st.lanes[lane].bay.length;
    const resolved = (s.completed || 0) + (s.blocked || 0) + (s.benignBlocked || 0) + (s.caught || 0) + (s.falseCatches || 0);
    check(`${lane} ${id}: bay filled up (onFull=${LAYERS[id].onFull})`, (s.bayFull || 0) > 0, `${s.bayFull} full-bay arrivals, max ${maxBay[lane]}/${desks} desks used`);
    check(`${lane} ${id}: never more chips at desks than desks`, maxBay[lane] <= desks);
    check(`${lane} ${id}: no timeouts (lane never backed up to the top)`, !(s.timeouts > 0), `timeouts ${s.timeouts || 0}`);
    check(`${lane} ${id}: every spawned chip resolved or in flight`, resolved + inFlight === s.spawned, `${resolved} + ${inFlight} in flight = ${s.spawned} spawned`);
  }
  check('ext defer: full bay waves chips through', (st.stats.lanes.ext.waved || 0) > 0);
  check('int auditor: full bay blocks chips', (st.stats.lanes.int.tossed || 0) > 0);
}

function testUpgrades() {
  console.log('\n▶ Upgrades: catch rate rises as configured (G1, m=1, 30 min, probe & monitor at L3)');
  const stealth = 1 - GENERATIONS[0].stealth / 2, LV = 3;
  for (const id of ['probe', 'monitor']) {
    const base = id === 'probe' ? LAYERS.probe.tpr : GENERATIONS[0].tmTPR;
    const U = UPGRADES[id];
    const expT = Math.min(0.99, base * U.tprMult[LV - 1]) * stealth, expF = LAYERS[id].fpr * U.fprMult[LV - 1];
    const r = run({ build: [] }, 42, labOpts(st => {
      st.m = 1;
      for (const l of ['ext', 'int']) { placeLayer(st, l, 0, id); for (let k = 1; k < LV; k++) upgrade(st, l, 0); }
    }, null, 1800));
    const c = r.st.stats.layers[id];
    const tpr = c.attackFlagged / c.attackSeen, fpr = c.benignFlagged / c.benignSeen;
    const l1 = elementStats(r.st, id, { level: 1 }), l3 = elementStats(r.st, id, { level: LV });
    const tolT = 3 * Math.sqrt(expT * (1 - expT) / c.attackSeen) + 0.01;
    const tolF = 3 * Math.sqrt(expF * (1 - expF) / c.benignSeen) + 0.005;
    console.log(`    ${id}: L1 catch ${l1.catch.toFixed(3)} fa ${l1.falseAlarm.toFixed(3)}  →  L${LV} catch ${l3.catch.toFixed(3)} fa ${l3.falseAlarm.toFixed(3)}   measured TPR ${tpr.toFixed(3)} FPR ${fpr.toFixed(3)}`);
    check(`${id} placed at L${LV}`, r.st.lanes.ext.slots[0].level === LV);
    check(`${id} elementStats L${LV} catch = config ${expT.toFixed(3)}`, Math.abs(l3.catch - expT) < 1e-9);
    check(`${id} L${LV} catch > L1 catch`, l3.catch > l1.catch && l3.falseAlarm < l1.falseAlarm);
    check(`${id} measured TPR ${tpr.toFixed(3)} ≈ L${LV} config`, Math.abs(tpr - expT) < tolT, `n=${c.attackSeen}, tol ±${tolT.toFixed(3)}`);
    check(`${id} measured FPR ${fpr.toFixed(3)} ≈ L${LV} config ${expF.toFixed(3)}`, Math.abs(fpr - expF) < tolF, `n=${c.benignSeen}`);
  }
  const st = createState({ seed: 3, tutorial: false });
  st.money = 1e9;
  placeLayer(st, 'int', 0, 'auditor');
  const desks = [], spot = [];
  for (let l = 1; l <= MAX_LEVEL; l++) { const s = elementStats(st, 'auditor', { level: l }); desks.push(s.desks); spot.push(s.spotCheck); }
  console.log(`    auditor desks by level ${desks.join(' ')}   spot check ${spot.map(x => (100 * x).toFixed(0) + '%').join(' ')}`);
  check('auditor desks +1 per level to L4', desks.slice(0, 4).every((d, i) => d === 1 + i));
  check('auditor spot check 1% → 4%', spot.slice(0, 4).map(x => Math.round(100 * x)).join() === '1,2,3,4');
  for (let k = 0; k < MAX_LEVEL - 1; k++) upgrade(st, 'int', 0);
  check('upgrade stops at L5 (capstone)', st.lanes.int.slots[0].level === MAX_LEVEL && !upgrade(st, 'int', 0).ok);
}

function testKillSwitch() {
  console.log('\n▶ Kill switch: blocks every still-flagged chip that reaches it (half the chips flagged at spawn)');
  const halfFlag = flagAtSpawn(t => t.id % 2 === 0);
  const withKS = run({ build: [] }, 5, labOpts(st => placeLayer(st, 'ext', 5, 'killswitch'), halfFlag));
  const without = run({ build: [] }, 5, labOpts(null, halfFlag));
  const a = withKS.st.stats.lanes.ext, b = without.st.stats.lanes.ext;
  const trig = killTrigger(withKS.st, 1);
  console.log(`    with kill switch:    ${bayLine(withKS.st).split('  |  ')[0]}`);
  console.log(`    without kill switch: ${bayLine(without.st).split('  |  ')[0]}`);
  check('no flagged chip completes past an armed kill switch', !(a.completedFlagged > 0) && a.killed > 0, `killed ${a.killed}, flagged completions ${a.completedFlagged || 0}`);
  check('unflagged chips pass the kill switch', a.completed > 0, `completed ${a.completed}`);
  check('without a kill switch the same flags slip through', b.completedFlagged > 0, `flagged completions ${b.completedFlagged}`);
  const rep = withKS.st.stats.repLoss.killswitch;
  check('each trigger costs the configured reputation', Math.abs(rep - a.killed * trig.rep) < 1e-6, `${a.killed} × ${trig.rep} = ${rep.toFixed(1)}`);
  const above = run({ build: [] }, 5, labOpts(st => { placeLayer(st, 'ext', 3, 'killswitch'); placeLayer(st, 'ext', 5, 'defer'); }, halfFlag)).st.stats.lanes.ext;
  check('kill switch above a responder leaves the flag to the responder', !(above.killed > 0) && above.pulled > 0, `killed ${above.killed || 0}, pulled into Defer ${above.pulled}`);
}

function testMoneyV2() {
  console.log('\n▶ Money conservation with v2 actions (slots, upgrades, sells, kill switch triggers)');
  const results = [];
  for (const seed of [1, 2, 3]) {
    const r = run({ fn: st => {
      smartPolicy(st);
      if (Math.floor(st.t) % 60 === 0 && st.t % 1 < DT) {        // once a minute: buy a slot, upgrade, sell one
        buySlot(st, 'ext');
        st.lanes.ext.slots.forEach((s, i) => { if (s.layer) upgrade(st, 'ext', i); });
        const last = st.lanes.int.slots.findIndex(s => s.layer === 'probe');
        if (last >= 0) sellLayer(st, 'int', last);
      }
    } }, seed, { maxT: 900 });
    console.log(`    seed ${seed}: ${r.card.win ? 'WIN' : r.card.reason} at G${r.st.gen}, slots ext ${r.st.lanes.ext.slots.length} int ${r.st.lanes.int.slots.length}, levels ${r.st.lanes.ext.slots.map(s => s.layer ? s.level : '·').join('')}`);
    results.push([`v2 economy/${seed}`, r]);
  }
  for (const [name, r] of results) {
    const L = r.st.ledger, cats = Object.values(L.byCat).reduce((a, b) => a + b, 0);
    check(`${name}: categories sum to income − spend`, Math.abs(cats - (L.income - L.spend)) <= 1e-6 * Math.max(1, L.income));
  }
  return results;
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
  testSlots();
  testBays();
  testUpgrades();
  testKillSwitch();
  const results = testPolicies().concat(testMoneyV2());
  testMoney(results);
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ ALL PASSED'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failures ? 1 : 0);
}
