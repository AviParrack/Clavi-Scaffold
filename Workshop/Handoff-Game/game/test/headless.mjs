// ===== Headless sim runner + tests =====
// usage:  node test/headless.mjs                 (all tests)
//         node test/headless.mjs test passBy     (one test by name; `test` alone lists them)
//         node test/headless.mjs run all 7       (one verbose run: policy, seed)
//         node test/headless.mjs balance smart   (win/loss table across difficulties + speed at G7 volume)

import { createState, step, placeLayer, sellLayer, drawResearch, pickResearch, choose, retrainProbes, debugUnlockAll, debugSkipGen, buySlot, upgrade, setSplit } from '../src/sim/sim.js';
import { scorecard } from '../src/sim/scorecard.js';
import { LAYERS } from '../src/config/layers.js';
import { UPGRADES, MAX_LEVEL } from '../src/config/upgrades.js';
import { BALANCE as B, SPLIT } from '../src/config/balance.js';
import { GENERATIONS } from '../src/config/generations.js';
import { TRAITS, DOSSIER, TRUTH_NOISE } from '../src/config/traits.js';
import { TASK_TEXT, ATTACK_TEXT, LATE_ATTACK_GEN } from '../src/config/tasktext.js';
import { ATTACKS } from '../src/config/tasks.js';
import { CARD_BY_ID } from '../src/sim/research.js';
import { chipText } from '../src/sim/tasks.js';
import { band } from '../src/sim/dossier.js';
import { rivalAhead, playerProgress, elementStats, slotPrice, upgradePrice, killTrigger, laneRate, laneSpeed, scanDwell,
  checkpointY, cpCount, mountY, attackChances, attackChance, collusion, misalignmentEstimate, watchMult, nominalTPR, erlangB,
  traitTPRPlus, stealth, normaliseSplit } from '../src/sim/rules.js';
import { big, pct } from '../src/util/format.js';

const DT = 0.05;
const LANE_IDS = ['ext', 'int'];

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
  // bottom two mounts: responder, then the kill switch as catch-all
  ext.push(respExt, 'killswitch'); int.push(respInt, 'killswitch');
  return { ext, int };
}
const UPGRADE_FIRST = ['monitor', 'untrusted', 'auditor', 'defer', 'probe', 'killswitch'];
function smartSpend(st) {
  for (const id of UPGRADE_FIRST) for (const lane of LANE_IDS) st.lanes[lane].slots.forEach((s, i) => {
    if (s.layer === id && s.level < MAX_LEVEL && st.money > 4 * upgradePrice(st, id, s.level)) upgrade(st, lane, i);
  });
  if (st.gen >= 3 && slotPrice(st, 'int') !== null && st.money > 6 * slotPrice(st, 'int')) buySlot(st, 'int');
}
// compute split: race the rival when close, buy evidence when comfortable, sell product when broke
const DEFAULT_SPLIT = [SPLIT.default.product, SPLIT.default.capabilities, SPLIT.default.safety];
function smartSplit(st) {
  const lead = playerProgress(st) - st.rival;
  let [p, c, s] = DEFAULT_SPLIT;
  if (lead < 0.15) [p, c, s] = [0.4, 0.55, 0.05];
  else if (lead > 0.6) [p, c, s] = [0.45, 0.35, 0.2];
  if (st.money < 0) [p, c, s] = [0.65, 0.35, 0];
  const cur = st.split;
  if (Math.abs(cur.product - p) + Math.abs(cur.capabilities - c) + Math.abs(cur.safety - s) > 1e-6) setSplit(st, p, c, s);
}
function smartPolicy(st, { split = true } = {}) {
  if (st.pendingChoice) choose(st, st.pendingChoice.eventId === 'caught' ? 0 : st.money > 2000 * GENERATIONS[st.gen - 1].bundle ? 1 : 0);
  if (st.pendingResearch) {
    const ids = st.pendingResearch;
    const rank = id => { const r = PREFER.indexOf(id); return r < 0 ? 99 : r; };
    pickResearch(st, rank(ids[0]) <= rank(ids[1] ?? ids[0]) ? 0 : 1);
  }
  if (split) smartSplit(st);
  const w = want(st);
  for (const lane of LANE_IDS) {
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
    for (const lane of LANE_IDS) {
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
    if (opts.immortal) { st.rep = 100; st.money = 1e30; }
  }
  return { st, card: scorecard(st), rivalAheadT, progress: playerProgress(st) };
}

// lab conditions: no events, no hidden traits, unlimited money, all layers unlocked. Use with lockGen to stay in one generation.
const lab = extra => st => { st.money = 1e30; debugUnlockAll(st); st.nextEventAt = Infinity; st.traits = []; if (extra) extra(st); };
const labOpts = (setup, each, maxT = 300) => ({ maxT, lockGen: true, immortal: true, setup: lab(setup), each });
// some lab runs measure volume over a fixed time: switch exfiltration off so a catastrophe can't end them early
function withoutCatastrophes(fn) {
  const keep = GENERATIONS.map(g => g.catShare);
  GENERATIONS.forEach(g => { g.catShare = 0; });
  try { return fn(); } finally { GENERATIONS.forEach((g, i) => { g.catShare = keep[i]; }); }
}
const toGen = (st, g) => { while (st.gen < g && !st.over) debugSkipGen(st); st.traits = []; };

// =================== reporting ===================

function confusion(st) {
  const rows = [];
  for (const [id, c] of Object.entries(st.stats.layers)) {
    const tpr = c.attackSeen ? c.attackFlagged / c.attackSeen : NaN;
    const fpr = c.benignSeen ? c.benignFlagged / c.benignSeen : NaN;
    const exp = c.attackSeen ? c.expTPRsum / c.attackSeen : NaN;
    const unread = LAYERS[id].kind === 'detector' ? `   unread ${c.unread}` : '';
    rows.push(`    ${LAYERS[id].name.padEnd(18)} attacks ${String(c.attackFlagged).padStart(5)}/${String(c.attackSeen).padEnd(5)} TPR ${tpr.toFixed(3)} (exp ${exp.toFixed(3)})   benign ${String(c.benignFlagged).padStart(5)}/${String(c.benignSeen).padEnd(6)} FPR ${fpr.toFixed(3)}${unread}`);
  }
  return rows.join('\n') || '    (no layers)';
}

const BAY_KEYS = ['pulled', 'approved', 'tossed', 'waved', 'bayFull', 'killed', 'completedFlagged', 'unread'];
function bayLine(st) {
  return LANE_IDS.map(l => `${l}: ` + BAY_KEYS.map(k => `${k} ${st.stats.lanes[l][k] || 0}`).join(' ')).join('  |  ');
}

function summary(name, seed, r) {
  const { st, card } = r;
  const outcome = card.win ? 'WIN' : `LOSS (${card.reason})`;
  const ev = Object.entries(st.stats.evidence).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
  const out = st.stats.evidenceOut;
  console.log(`  [${name} seed=${seed}] ${outcome} at G${st.gen} ${GENERATIONS[st.gen - 1].name}, t=${st.t.toFixed(0)}s`);
  console.log(`    money ${big(st.money)}  income ${big(card.income)}  safety spend ${big(card.safety)} (${pct(card.safetyShare)})  rep ${st.rep.toFixed(1)}`);
  console.log(`    attacks ${card.attacks}: stopped ${card.stopped}, landed ${card.landed}   true m by gen: ${card.gens.map(g => g.m.toFixed(2)).join(' ')}`);
  console.log(`    rival ${st.rival.toFixed(2)} vs you ${r.progress.toFixed(2)}, rival ahead ${r.rivalAheadT.toFixed(0)}s   ending: ${card.ending.title} (${card.grade})`);
  console.log(`    evidence ${st.evidence.toFixed(1)} = earned (${ev || 'none'}) − carry-over cut ${out.carry.toFixed(1)} − spent ${out.spent}   traits: ${card.gens.map(g => `G${g.g} ` + g.traits.map(t => t.name + (t.revealed ? '✓' : '')).join('+')).join('  ')}`);
  console.log(`    ${bayLine(st)}`);
}

// =================== tests ===================

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}
const binomTol = (p, n, slack = 0.01) => 3 * Math.sqrt(p * (1 - p) / Math.max(1, n)) + slack;

// ----- detectors read every chip they can, and flag at the configured rates (G1 dwell is long enough for q = 1) -----
function testCalibration() {
  console.log('\n▶ Detector calibration (G1, forced m=1, one detector per run, 30 min each). Rates are per read.');
  const stealth = 1 - GENERATIONS[0].stealth / 2;
  const U = LAYERS.untrusted;
  const cfgTPR = {
    probe: LAYERS.probe.tpr * stealth,
    monitor: GENERATIONS[0].tmTPR * stealth,
    untrusted: U.tpr * stealth * (1 - Math.min(U.collusionMax, U.collusionPerM * 1)),
  };
  for (const id of ['probe', 'monitor', 'untrusted']) {
    const r = run({ build: [] }, 42, labOpts(st => { st.m = 1; for (const l of LANE_IDS) placeLayer(st, l, 0, id); }, null, 1800));
    console.log(confusion(r.st));
    const q = elementStats(r.st, id, { level: 1 }).readQuality;
    check(`${id}: dwell ${scanDwell(r.st).toFixed(2)}s ≥ latency ${LAYERS[id].latency}s, so read quality q = 1`, q === 1, `q ${q}`);
    const c = r.st.stats.layers[id];
    const tpr = c.attackFlagged / c.attackSeen, fpr = c.benignFlagged / c.benignSeen;
    const tolT = binomTol(cfgTPR[id], c.attackSeen), tolF = binomTol(LAYERS[id].fpr, c.benignSeen, 0.005);
    check(`${id} TPR ${tpr.toFixed(3)} ≈ config ${cfgTPR[id].toFixed(3)}`, Math.abs(tpr - cfgTPR[id]) < tolT, `n=${c.attackSeen}, tol ±${tolT.toFixed(3)}`);
    check(`${id} FPR ${fpr.toFixed(3)} ≈ config ${LAYERS[id].fpr}`, Math.abs(fpr - LAYERS[id].fpr) < tolF, `n=${c.benignSeen}, tol ±${tolF.toFixed(3)}`);
  }
}

// ----- q < 1: a read that runs out of window flags less, in proportion -----
function testReadQuality() {
  console.log('\n▶ Read quality: latency > dwell cuts flags to TPR·q and FPR·q (G1, m=1, monitor stretched to 2× dwell, 60 min)');
  const lat = LAYERS.monitor.latency;
  const dwell = 2 * B.scanRadius * GENERATIONS[0].travel;
  LAYERS.monitor.latency = 2 * dwell;
  const r = run({ build: [] }, 8, labOpts(st => { st.m = 1; for (const l of LANE_IDS) placeLayer(st, l, 0, 'monitor'); }, null, 3600));
  const s = elementStats(r.st, 'monitor', { level: 1 });
  LAYERS.monitor.latency = lat;
  const c = r.st.stats.layers.monitor;
  const tpr = c.attackFlagged / c.attackSeen, fpr = c.benignFlagged / c.benignSeen;
  const expT = s.tpr * s.readQuality, expF = s.fpr * s.readQuality;
  console.log(confusion(r.st));
  console.log(`    dwell ${s.dwell.toFixed(2)}s, latency ${s.latency.toFixed(2)}s → q ${s.readQuality.toFixed(3)};  full-read TPR ${s.tpr.toFixed(3)} → expected ${expT.toFixed(3)}`);
  check('read quality q = dwell / latency = 0.5', Math.abs(s.readQuality - 0.5) < 1e-9);
  check(`measured TPR ${tpr.toFixed(3)} ≈ TPR·q ${expT.toFixed(3)}`, Math.abs(tpr - expT) < binomTol(expT, c.attackSeen), `n=${c.attackSeen}, tol ±${binomTol(expT, c.attackSeen).toFixed(3)}`);
  check(`measured TPR well below the full-read TPR ${s.tpr.toFixed(3)}`, s.tpr - tpr > 2 * binomTol(expT, c.attackSeen, 0));
  check(`measured FPR ${fpr.toFixed(3)} ≈ FPR·q ${expF.toFixed(3)}`, Math.abs(fpr - expF) < binomTol(expF, c.benignSeen, 0.005), `n=${c.benignSeen}`);
}

// ----- heads: at G7 volume a detector can't read everything; more heads (an upgrade) read more -----
function testHeads() {
  console.log('\n▶ Heads cap: at G7 volume chips go unread; upgrading the monitor (more heads, faster reads) cuts it');
  const rows = [];
  for (const level of [1, 3]) {
    const r = withoutCatastrophes(() => run({ build: [] }, 21, labOpts(st => {
      toGen(st, 7);
      placeLayer(st, 'ext', 0, 'monitor');
      for (let k = 1; k < level; k++) upgrade(st, 'ext', 0);
    }, null, 60)));
    const slot = r.st.lanes.ext.slots[0], s = elementStats(r.st, 'monitor', { lane: 'ext', level });
    const frac = slot.unread / (slot.unread + slot.reads);
    rows.push({ level, frac, s, slot });
    console.log(`    L${level}: ${s.heads} heads, ${s.readTime.toFixed(3)}s per read, ${laneRate(r.st, 'ext').toFixed(1)} chips/s → unread ${slot.unread}/${slot.unread + slot.reads} = ${pct(frac, 1)} (Erlang estimate ${pct(s.unreadRate, 1)})`);
  }
  check('L1 monitor at G7: unread > 0', rows[0].slot.unread > 0);
  check('L3 has more heads than L1', rows[1].s.heads > rows[0].s.heads, `${rows[0].s.heads} → ${rows[1].s.heads}`);
  check('L3 reads a bigger share of chips', rows[1].frac < rows[0].frac, `${pct(rows[0].frac, 1)} → ${pct(rows[1].frac, 1)}`);
  check('elementStats unreadRate falls with the upgrade too', rows[1].s.unreadRate < rows[0].s.unreadRate);
  check('Erlang B sanity: 1 head, load 1 → 50% lost', Math.abs(erlangB(1, 1) - 0.5) < 1e-12);
}

// ----- pass-by: nothing on the rail ever holds a chip -----
function testPassBy() { return withoutCatastrophes(passBy); }
function passBy() {
  console.log('\n▶ Pass-by track: every chip on the track moves exactly speed·dt per step (bays pull sideways, never hold)');
  const st = createState({ seed: 13, tutorial: false });
  lab()(st);
  const ext = ['probe', 'monitor', 'untrusted', 'paraphraser', 'sandbox', 'honeypot', 'resampler', 'defer', 'auditor', 'killswitch'];
  const int = ['paraphraser', 'untrusted', 'monitor', 'probe', 'honeypot', 'sandbox', 'auditor', 'resampler', 'defer', 'killswitch'];
  while (st.lanes.ext.slots.length < B.maxSlots) { buySlot(st, 'ext'); buySlot(st, 'int'); }
  ext.forEach((id, i) => placeLayer(st, 'ext', i, id));
  int.forEach((id, i) => placeLayer(st, 'int', i, id));
  const halfFlag = flagAtSpawn(t => t.id % 3 === 0);
  let prev = new Map(), checked = 0, bad = 0, worst = 0, maxGen = 1, maxChips = 0;
  for (let k = 0; st.t < 500 && !st.over; k++) {
    if (k > 0 && k % 1400 === 0) toGen(st, st.gen + 1);      // a new generation every 70 s: speed changes
    if (st.over) break;
    if (st.pendingChoice) choose(st, 1);
    halfFlag(st);
    const v = laneSpeed(st);
    step(st, DT);
    st.rep = 100; st.money = 1e30; st.rd = 0;
    const now = new Map();
    for (const l of LANE_IDS) for (const t of st.lanes[l].tasks) {
      now.set(t.id, { y: t.y, pulls: t.pulls });
      const p = prev.get(t.id);
      if (!p || p.pulls !== t.pulls) continue;               // new chip, or it came back from a bay this step
      checked++;
      const err = Math.abs(t.y - p.y - v * DT);
      worst = Math.max(worst, err);
      if (err > 1e-9 && ++bad <= 5) console.log(`      held? ${l} chip ${t.id} at G${st.gen} t=${st.t.toFixed(2)}: moved ${(t.y - p.y).toFixed(4)}, expected ${(v * DT).toFixed(4)}`);
    }
    prev = now;
    maxGen = st.gen;
    maxChips = Math.max(maxChips, st.lanes.ext.tasks.length + st.lanes.int.tasks.length);
  }
  console.log(`    ${checked} chip-steps checked through G${maxGen}, up to ${maxChips} chips on the tracks, worst |Δy − v·dt| = ${worst.toExponential(1)}`);
  console.log(`    ${bayLine(st)}`);
  check('no chip is ever held: positions advance exactly v·dt between bay pulls', bad === 0 && checked > 1000, `${bad} violations`);
  check('bays did pull chips sideways during the run', (st.stats.lanes.ext.pulled || 0) + (st.stats.lanes.int.pulled || 0) > 0);
}

function testDeterminism() {
  console.log('\n▶ Determinism (?seed=N reproducible)');
  const a = run('starter', 99, { maxT: 400 }), b = run('starter', 99, { maxT: 400 });
  check('same seed → same money, rep, m', a.st.money === b.st.money && a.st.rep === b.st.rep && a.st.m === b.st.m, `$${a.st.money.toFixed(2)} vs $${b.st.money.toFixed(2)}`);
  const sa = run('smart', 7, { maxT: 900 }), sb = run('smart', 7, { maxT: 900 });
  const same = JSON.stringify([sa.st.stats, sa.st.traits, sa.st.dossier, sa.st.split, sa.st.fxId]) === JSON.stringify([sb.st.stats, sb.st.traits, sb.st.dossier, sb.st.split, sb.st.fxId]);
  check('same seed → identical stats, traits, dossier, split and fx stream (smart, 15 min)', same, `G${sa.st.gen}, ${sa.st.taskId} chips`);
}

// =================== v2: slots, bays, upgrades, kill switch ===================

// test harness: flag chips the moment they spawn (no detector involved), so bays and the kill switch see traffic
const flagAtSpawn = (which = () => true) => st => {
  for (const l of LANE_IDS) for (const t of st.lanes[l].tasks) if (!t.seenByHarness) { t.seenByHarness = true; if (which(t)) t.flagged = true; }
};

function testSlots() {
  console.log('\n▶ Deep stack: 6 mounts to start, buy up to 10, price escalates');
  const st = createState({ seed: 7, tutorial: false });
  st.money = 1e9;
  check(`lanes start with ${B.startSlots} mounts`, st.lanes.ext.slots.length === 6 && st.lanes.int.slots.length === 6);
  const prices = [];
  while (slotPrice(st, 'ext') !== null) { prices.push(slotPrice(st, 'ext')); buySlot(st, 'ext'); }
  console.log(`    slot prices: ${prices.map(p => '$' + p.toFixed(0)).join(' → ')}`);
  check('slot price strictly escalates', prices.every((p, i) => i === 0 || p > prices[i - 1]), prices.length + ' slots bought');
  check(`stops at ${B.maxSlots}`, st.lanes.ext.slots.length === B.maxSlots && !buySlot(st, 'ext').ok);
  let ordered = true;
  for (let n = B.startSlots; n <= B.maxSlots; n++) for (let k = 1; k < cpCount(n); k++) if (!(checkpointY(n, k) > checkpointY(n, k - 1))) ordered = false;
  const spacing = mountY(B.maxSlots, 1) - mountY(B.maxSlots, 0);
  check('scan windows never overlap (checkpoints strictly ordered at every mount count)', ordered, `window ${2 * B.scanRadius} vs spacing ${spacing.toFixed(3)} at ${B.maxSlots} mounts`);
}

function testBays() {
  console.log('\n▶ Side bays: a full bay never stalls the lane (every chip flagged at spawn)');
  // EXTERNAL: Defer at the bottom (bay full → wave). INTERNAL: Human Auditor (bay full → block).
  // G1 traffic never fills 2 Defer desks at 0.5 s each, so this test stretches Defer's desk time to 4 s.
  let maxBay = { ext: 0, int: 0 }, maxAge = { ext: 0, int: 0 };
  const deferLatency = LAYERS.defer.latency;
  LAYERS.defer.latency = 4;
  const r = run({ build: [] }, 11, labOpts(
    st => { placeLayer(st, 'ext', 5, 'defer'); placeLayer(st, 'int', 5, 'auditor'); },
    st => {
      flagAtSpawn()(st);
      for (const l of LANE_IDS) {
        maxBay[l] = Math.max(maxBay[l], st.lanes[l].bay.length);
        for (const t of st.lanes[l].tasks) maxAge[l] = Math.max(maxAge[l], st.t - t.born);
      }
    },
  ));
  LAYERS.defer.latency = deferLatency;
  const st = r.st;
  console.log(`    ${bayLine(st)}`);
  for (const [lane, id, desk] of [['ext', 'defer', 4], ['int', 'auditor', LAYERS.auditor.latency]]) {
    const s = st.stats.lanes[lane], desks = elementStats(st, id, { level: 1 }).desks;
    const inFlight = st.lanes[lane].tasks.length + st.lanes[lane].bay.length;
    const resolved = (s.completed || 0) + (s.blocked || 0) + (s.benignBlocked || 0) + (s.caught || 0) + (s.falseCatches || 0);
    const limit = GENERATIONS[0].travel + desk + DT;
    check(`${lane} ${id}: bay filled up (onFull=${LAYERS[id].onFull})`, (s.bayFull || 0) > 0, `${s.bayFull} full-bay arrivals, max ${maxBay[lane]}/${desks} desks used`);
    check(`${lane} ${id}: never more chips at desks than desks`, maxBay[lane] <= desks);
    check(`${lane} ${id}: lane never stalls (no chip older than travel + one desk visit)`, maxAge[lane] <= limit, `oldest ${maxAge[lane].toFixed(2)}s ≤ ${limit.toFixed(2)}s`);
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
      for (const l of LANE_IDS) { placeLayer(st, l, 0, id); for (let k = 1; k < LV; k++) upgrade(st, l, 0); }
    }, null, 1800));
    const c = r.st.stats.layers[id];
    const tpr = c.attackFlagged / c.attackSeen, fpr = c.benignFlagged / c.benignSeen;
    const l1 = elementStats(r.st, id, { level: 1 }), l3 = elementStats(r.st, id, { level: LV });
    const tolT = binomTol(expT, c.attackSeen), tolF = binomTol(expF, c.benignSeen, 0.005);
    console.log(`    ${id}: L1 catch ${l1.catch.toFixed(3)} fa ${l1.falseAlarm.toFixed(3)} heads ${l1.heads} read ${l1.latency.toFixed(3)}s  →  L${LV} catch ${l3.catch.toFixed(3)} fa ${l3.falseAlarm.toFixed(3)} heads ${l3.heads} read ${l3.latency.toFixed(3)}s   measured TPR ${tpr.toFixed(3)} FPR ${fpr.toFixed(3)}`);
    check(`${id} placed at L${LV}`, r.st.lanes.ext.slots[0].level === LV);
    check(`${id} elementStats L${LV} catch = config ${expT.toFixed(3)}`, Math.abs(l3.catch - expT) < 1e-9);
    check(`${id} L${LV} catch > L1 catch`, l3.catch > l1.catch && l3.falseAlarm < l1.falseAlarm);
    check(`${id} L${LV} has more heads`, l3.heads > l1.heads, `${l1.heads} → ${l3.heads}`);
    check(`${id} measured TPR ${tpr.toFixed(3)} ≈ L${LV} config`, Math.abs(tpr - expT) < tolT, `n=${c.attackSeen}, tol ±${tolT.toFixed(3)}`);
    check(`${id} measured FPR ${fpr.toFixed(3)} ≈ L${LV} config ${expF.toFixed(3)}`, Math.abs(fpr - expF) < tolF, `n=${c.benignSeen}`);
  }
  const st = createState({ seed: 3, tutorial: false });
  st.money = 1e9;
  placeLayer(st, 'int', 0, 'auditor');
  const desks = [], spot = [], heads = [], lat = [];
  for (let l = 1; l <= MAX_LEVEL; l++) {
    const s = elementStats(st, 'auditor', { level: l }); desks.push(s.desks); spot.push(s.spotCheck);
    const m = elementStats(st, 'monitor', { level: l }); heads.push(m.heads); lat.push(m.latency);
  }
  console.log(`    auditor desks by level ${desks.join(' ')}   spot check ${spot.map(x => (100 * x).toFixed(0) + '%').join(' ')}`);
  console.log(`    monitor heads by level ${heads.join(' ')}   seconds per full read ${lat.map(x => x.toFixed(3)).join(' ')}`);
  check('auditor desks +1 per level to L4', desks.slice(0, 4).every((d, i) => d === 1 + i));
  check('auditor spot check 1% → 4%', spot.slice(0, 4).map(x => Math.round(100 * x)).join() === '1,2,3,4');
  check('monitor heads rise and read time falls with level', heads.slice(0, 4).every((h, i) => i === 0 || h > heads[i - 1]) && lat.slice(0, 4).every((x, i) => i === 0 || x < lat[i - 1]));
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

  // a new mount shifts every mount up: chips must catch up on the checkpoints that moved past them, not skip them
  const grow = withoutCatastrophes(() => run({ build: [] }, 3, labOpts(st => { toGen(st, 7); placeLayer(st, 'ext', 5, 'killswitch'); },
    st => { flagAtSpawn()(st); if (st.t >= 10 && st.lanes.ext.slots.length < B.maxSlots && Math.round(st.t / DT) % 100 === 0) buySlot(st, 'ext'); }, 30)));
  const g = grow.st.stats.lanes.ext;
  console.log(`    G7, every chip flagged, a mount bought every 5 s from t=10 s: ${grow.st.lanes.ext.slots.length} mounts, killed ${g.killed}, flagged completions ${g.completedFlagged || 0}`);
  check('buying mounts mid-run never lets a chip skip the kill switch', grow.st.lanes.ext.slots.length === B.maxSlots && g.killed > 0 && !(g.completedFlagged > 0));
}

// =================== v2 chunk 2: split, volume, traits, dossier ===================

function testSplit() {
  console.log('\n▶ Compute split: Product → income, Capabilities → R&D, Safety → evidence and less drift (G1, no layers, 5 min each)');
  const n1 = setSplit(createState({ seed: 1, tutorial: false }), 5, 4, 1).split;
  const n2 = setSplit(createState({ seed: 1, tutorial: false }), 1, 0, 0).split;
  const n3 = setSplit(createState({ seed: 1, tutorial: false }), 0, 0, 1).split;
  const fmt = s => `${s.product.toFixed(2)}/${s.capabilities.toFixed(2)}/${s.safety.toFixed(2)}`;
  console.log(`    setSplit(5,4,1) → ${fmt(n1)}   setSplit(1,0,0) → ${fmt(n2)}   setSplit(0,0,1) → ${fmt(n3)}`);
  const sums = [n1, n2, n3].every(s => Math.abs(s.product + s.capabilities + s.safety - 1) < 1e-12);
  const inBounds = [n2, n3].every(s => ['product', 'capabilities', 'safety'].every(k => s[k] >= SPLIT.min[k] - 1e-12 && s[k] <= SPLIT.max[k] + 1e-12));
  check('setSplit normalises to 1 and respects the config limits', sums && inBounds && Math.abs(n1.product - 0.5) < 1e-12);
  const junk = [[Infinity, 1, 1], [NaN, 'x', null], [Number.MAX_VALUE, Number.MAX_VALUE, 0], [-5, undefined, 2]].map(a => normaliseSplit(...a));
  console.log(`    junk in: (∞,1,1) → ${fmt(junk[0])}   (NaN,'x',null) → ${fmt(junk[1])}   (MAX,MAX,0) → ${fmt(junk[2])}   (−5,undef,2) → ${fmt(junk[3])}`);
  check('junk inputs (∞, NaN, strings, overflow) still give a valid split', junk.every(j => ['product', 'capabilities', 'safety'].every(k => Number.isFinite(j[k]))
    && Math.abs(j.product + j.capabilities + j.safety - 1) < 1e-12) && Math.abs(junk[2].product - 0.5) < 1e-12 && junk[1].product === SPLIT.default.product);

  // spawnT counts chips, so a new split applies at once (not after the old, slower gap runs out)
  let waits = [];
  for (let seed = 1; seed <= 40; seed++) {
    const st = createState({ seed, tutorial: false });
    st.nextEventAt = Infinity;
    setSplit(st, 0.1, 0.9, 0);
    for (let i = 0; i < 400; i++) step(st, DT);
    setSplit(st, 0.9, 0.1, 0);
    const n0 = st.stats.lanes.ext.spawned, t0 = st.t;
    while (st.stats.lanes.ext.spawned === n0) step(st, DT);
    waits.push(st.t - t0);
  }
  const gap = 1 / laneRate((() => { const st = createState({ seed: 1, tutorial: false }); setSplit(st, 0.9, 0.1, 0); return st; })(), 'ext');
  const avg = waits.reduce((a, b) => a + b, 0) / waits.length, worst = Math.max(...waits);
  console.log(`    Product 0.1 → 0.9 at G1: first new EXTERNAL chip after ${avg.toFixed(2)} s on average, worst ${worst.toFixed(2)} s (new gap ${gap.toFixed(2)} s, 40 seeds)`);
  check('a split change takes effect at once (first chip within one new gap on average, two at worst)', avg <= gap && worst <= 2 * gap);

  const res = {};
  for (const [name, sp] of [['default', DEFAULT_SPLIT], ['product', [0.75, 0.2, 0.05]], ['capabilities', [0.2, 0.75, 0.05]], ['safety', [0.35, 0.25, 0.4]]]) {
    const r = run({ build: [] }, 31, { maxT: 300, immortal: true, lockGen: true, setup: lab(st => { setSplit(st, ...sp); st.drift = 20; }) });
    const L = r.st.ledger.byCat;
    res[name] = { income: (L.external || 0) + (L.internal || 0), rd: r.st.stats.lanes.int.completed || 0, evidence: r.st.stats.evidence.safety || 0, cleaned: r.st.stats.driftCleaned };
    console.log(`    ${name.padEnd(12)} ${fmt(r.st.split)}   income $${res[name].income.toFixed(0).padStart(6)}   R&D chips ${String(res[name].rd).padStart(4)}   safety evidence ${res[name].evidence.toFixed(1).padStart(5)}   drift cleaned ${res[name].cleaned.toFixed(1)}`);
  }
  const d = res.default;
  // internal chips pay too ($20 vs $50), so moving compute between Product and Capabilities moves income by less than chips
  check('more Product → more income, less R&D', res.product.income > 1.1 * d.income && res.product.rd < 0.8 * d.rd);
  check('more Capabilities → more R&D, less income', res.capabilities.rd > 1.2 * d.rd && res.capabilities.income < 0.9 * d.income);
  check('more Safety → more evidence, more drift cleaned, less income and R&D', res.safety.evidence > 2 * d.evidence && res.safety.cleaned > 2 * d.cleaned && res.safety.income < d.income && res.safety.rd < d.rd);
}

function testVolume() {
  console.log('\n▶ Volume ramp: chips/s per lane at the default split, each generation (60 s each)');
  console.log('    G   config ext/int     measured ext/int     ms per sim-second (no layers)');
  let allOk = true;
  for (let g = 1; g <= GENERATIONS.length; g++) {
    const t0 = performance.now();
    const r = withoutCatastrophes(() => run({ build: [] }, 40 + g, labOpts(st => toGen(st, g), null, 60)));
    const ms = (performance.now() - t0) / 60;
    const s = r.st.genStats.lanes, T = r.st.t;
    const want = { ext: laneRate(r.st, 'ext'), int: laneRate(r.st, 'int') };
    const got = { ext: s.ext.spawned / T, int: s.int.spawned / T };
    const ok = LANE_IDS.every(l => Math.abs(got[l] - want[l]) <= 0.05 * want[l] + 2 / T);
    const extIsRate = Math.abs(want.ext - GENERATIONS[g - 1].rate) < 1e-9;
    allOk = allOk && ok && extIsRate;
    console.log(`    G${g}  ${want.ext.toFixed(1).padStart(5)} / ${want.int.toFixed(1).padEnd(5)}       ${got.ext.toFixed(2).padStart(6)} / ${got.int.toFixed(2).padEnd(6)}       ${ms.toFixed(2)}  ${ok ? '' : '❌'}`);
  }
  check('every generation spawns its configured chips/s (EXTERNAL = generations.js rate at the default split)', allOk);
}

function testTraits() {
  console.log('\n▶ Hidden traits: two per generation, same seed → same traits, and every built hook does what it says');
  const rollAll = seed => { const st = createState({ seed, tutorial: false }); const out = [st.traits.join('+')]; for (let g = 2; g <= 7; g++) { debugSkipGen(st); out.push(st.traits.join('+')); } return out; };
  const a = rollAll(77), b = rollAll(77);
  console.log(`    seed 77: ${a.join('  ')}`);
  check('same seed → same traits every generation', a.join() === b.join());
  check('two distinct traits per generation', a.every(s => { const t = s.split('+'); return t.length === 2 && t[0] !== t[1] && t.every(id => TRAITS[id]); }));
  const seqs = new Set([1, 2, 3, 4, 5].map(s => rollAll(s).join()));
  check('different seeds roll different traits', seqs.size > 1, `${seqs.size}/5 distinct sequences`);

  // effect hooks, compared with and without the trait on the same state
  const st = createState({ seed: 5, tutorial: false });
  st.money = 1e9; debugUnlockAll(st); st.m = 0.3;
  toGen(st, 5);
  const withT = (ids, f) => { const keep = st.traits; st.traits = ids; const v = f(); st.traits = keep; return v; };
  const ch = ids => withT(ids, () => ({ ...attackChances(st, 'ext'), ...attackChances(st, 'int') }));
  const base = ch([]);
  const syc = ch(['sycophant']), pow = ch(['powerSeeking']), rh = ch(['rewardHacker']);
  check('Sycophant: harmful ×2, other model attacks ×0.7', Math.abs(syc.harmful / base.harmful - 2) < 1e-9 && Math.abs(syc.sabotage / base.sabotage - 0.7) < 1e-9 && Math.abs(syc.leak / base.leak - 0.7) < 1e-9);
  check('Power-Seeking: exfil ×2', Math.abs(pow.exfil / base.exfil - 2) < 1e-9);
  check('Reward Hacker: sabotage ×2, poison ×0.5', Math.abs(rh.sabotage / base.sabotage - 2) < 1e-9 && Math.abs(rh.poison / base.poison - 0.5) < 1e-9);
  check('Steganographer: untrusted collusion ×1.5', Math.abs(withT(['steganographer'], () => collusion(st, 'ext', null, 'untrusted')) / collusion(st, 'ext', null, 'untrusted') - 1.5) < 1e-9);
  check('Eager Helper: +10% chips/s, less stealth', Math.abs(withT(['eager'], () => laneRate(st, 'ext')) / laneRate(st, 'ext') - 1.1) < 1e-9
    && withT(['eager'], () => elementStats(st, 'monitor').tpr) > elementStats(st, 'monitor').tpr);
  check('Sandbagger: misalignment estimate reads low', withT(['sandbagger'], () => misalignmentEstimate(st).est) < misalignmentEstimate(st).est);
  check('Honest-ish: +0.2 TPR hook for the CoT Monitor (not built yet), other detectors unchanged', withT(['honest'], () => traitTPRPlus(st, 'cot')) === 0.2
    && withT(['honest'], () => nominalTPR(st, 'monitor')) === nominalTPR(st, 'monitor'));
  placeLayer(st, 'ext', 5, 'auditor');
  const idle = withT(['situational'], () => watchMult(st, 'ext'));
  st.lanes.ext.bay.push({ actSlot: 5 });
  const busy = withT(['situational'], () => watchMult(st, 'ext'));
  st.lanes.ext.bay.pop();
  placeLayer(st, 'ext', 0, 'honeypot');
  const potted = withT(['situational'], () => watchMult(st, 'ext'));
  check('Situationally Aware: attacks ×1.5 with idle desks, ×0.4 with busy ones, no swing with Honeypots', Math.abs(idle - 1.5) < 1e-12 && Math.abs(busy - 0.4) < 1e-12 && potted === 1, `idle ${idle}, busy ${busy.toFixed(2)}, honeypot ${potted}`);
}

function testDossier() {
  console.log('\n▶ Dossier: rows unlock at exactly 5 / 12 / 25 / 40 / 60 evidence gathered on this model; scorecard lists every trait');
  const st = createState({ seed: 9, tutorial: false });
  lab(st => setSplit(st, 0.55, 0.45, 0))(st);
  st.traits = ['sycophant', 'sandbagger']; st.genStats.traits = st.traits;
  st.genStats.attempts = { harmful: 3, sabotage: 5, leak: 1 };   // the model's tries so far: sabotage is its favourite (5/9)
  st.m = 0;                                                        // truth row must not show a negative m
  let exact = true;
  for (const row of DOSSIER) {
    st.dossier.evidence = row.need - 1e-9; step(st, DT);
    const before = st.dossier.rows.find(r => r.id === row.id);
    const lockedOk = !before.unlocked && before.text === null;
    const fx0 = st.fxId;
    st.dossier.evidence = row.need; step(st, DT);
    const after = st.dossier.rows.find(r => r.id === row.id);
    const revealFx = st.fx.some(e => e.id > fx0 && e.type === 'reveal' && e.row === row.id);
    console.log(`    ${String(row.need).padStart(2)} evidence → ${row.label.padEnd(18)} ${after.unlocked ? after.text : '(locked)'}`);
    if (!(lockedOk && after.unlocked && revealFx)) exact = false;
  }
  const rows = Object.fromEntries(st.dossier.rows.map(r => [r.id, r]));
  check('each row is locked just below its threshold and unlocks (with an fx reveal) exactly at it', exact);
  check('favourite attack = the most-tried type, with its share', rows.favourite.value === 'sabotage' && rows.favourite.text.includes('56%'), rows.favourite.text);
  check('trait rows name the hidden traits', rows.trait1.value === 'sycophant' && rows.trait2.value === 'sandbagger');
  const bands = { ext: band(attackChance(st, 'ext')), int: band(attackChance(st, 'int')) };
  check('attack-rate row bands each lane\'s real attack chance (traits included)', JSON.stringify(rows.rate.value) === JSON.stringify(bands), rows.rate.text);
  check(`truth row: m within ±${TRUTH_NOISE} and never below 0`, rows.truth.value.m >= 0 && Math.abs(rows.truth.value.m - st.m) <= TRUTH_NOISE + 1e-12, `true m 0, shown ${rows.truth.value.m.toFixed(3)}`);
  check('revealed traits are marked in this generation\'s stats', st.genStats.revealed.every(Boolean));

  st.evidence = 60;
  debugSkipGen(st);
  check(`${100 * B.evidenceCarry}% of evidence carries into the next generation`, Math.abs(st.evidence - B.evidenceCarry * 60) < 1e-9, `60 → ${st.evidence}`);
  step(st, DT);
  check('carried evidence is about the last model: it unlocks nothing in the new dossier', st.dossier.evidence < 1 && st.dossier.rows.every(r => !r.unlocked), `dossier evidence ${st.dossier.evidence.toFixed(2)}`);
  debugSkipGen(st);
  const card = scorecard(st);
  const listed = card.gens.map(g => g.traits.map(t => `${t.name}${t.revealed ? '✓' : '·'}`).join('+'));
  console.log(`    scorecard traits (✓ revealed, · hidden): ${listed.join('  ')}`);
  check('scorecard lists every trait of every generation, revealed or not', card.gens.length === 3 && card.gens.every(g => g.traits.length === 2)
    && card.gens[0].traits.every(t => t.revealed) && card.gens[2].traits.every(t => !t.revealed));
}

// ----- chip text: a careful player sees hints, never proof -----
function testChipText() {
  console.log('\n▶ Chip text: decoys and chip shapes never prove a chip is an attack');
  let shapesOk = true;
  const honestSet = new Set(), attackSet = new Set();
  for (let g = 1; g <= GENERATIONS.length; g++) for (const lane of LANE_IDS) {
    const honest = TASK_TEXT[g - 1][lane];
    honest.forEach(([, t]) => honestSet.add(t));
    const types = new Set(honest.map(([type]) => type));
    for (const a of Object.keys(ATTACK_TEXT).filter(t => ATTACKS[t].lane === lane)) {
      const pool = g >= LATE_ATTACK_GEN ? ATTACK_TEXT[a].early.concat(ATTACK_TEXT[a].late) : ATTACK_TEXT[a].early;
      for (const [type, t] of pool) {
        attackSet.add(t);
        if (!types.has(type)) { shapesOk = false; console.log(`      G${g} ${lane}: '${t}' is a ${type} chip, a shape no honest ${lane} chip has`); }
      }
    }
  }
  check('every chip type an attack text uses also appears in that lane\'s honest list, every generation', shapesOk);

  const st = createState({ seed: 12, tutorial: false });
  const N = 40000;
  let decoys = 0;
  for (let i = 0; i < N; i++) if (attackSet.has(chipText(st, 'int', null).text)) decoys++;
  const tol = binomTol(B.decoyRate, N, 0.004);
  check(`honest chips wear attack-looking text at decoyRate ${B.decoyRate}`, Math.abs(decoys / N - B.decoyRate) < tol, `${pct(decoys / N, 2)} of ${N}`);

  // Eager Helper's lower stealth reaches the text too, not just detectors
  toGen(st, 5);
  const looksBad = traits => { st.traits = traits; let k = 0; for (let i = 0; i < N; i++) { const t = chipText(st, 'int', 'sabotage').text; if (attackSet.has(t) && !honestSet.has(t)) k++; } return k / N; };
  const base = looksBad([]), eager = looksBad(['eager']);
  console.log(`    G5 sabotage chips with a give-away text: ${pct(base, 1)} plain, ${pct(eager, 1)} with Eager Helper (stealth ${stealth({ ...st, traits: [] }).toFixed(2)} → ${stealth({ ...st, traits: ['eager'] }).toFixed(2)})`);
  check('Eager Helper: attacks give themselves away in text more often', eager - base > 4 * Math.sqrt(base * (1 - base) / N));
}

// =================== policies & money ===================

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

  // v1 also starved R&D (layers held chips, lanes jammed). Pass-by removes that by design, so the tax is now money:
  // bankrupt, behind the rival, or spending ≥ half of income on safety. (Over 40 seeds: 37/40 meet this, 32/40 at 60%.)
  console.log('\n▶ Policy: all layers (Medium) — must never win; bankrupt, behind the rival or paying a ≥ 50% safety tax in ≥ 4/5 seeds');
  let taxed = 0;
  for (const s of seeds) {
    const r = run('all', s); summary('all', s, r); results.push([`all/${s}`, r]);
    const bankrupt = r.card.reason === 'bankrupt';
    const behind = r.rivalAheadT > 0.25 * r.st.t;
    const paranoid = r.card.safetyShare >= 0.5;
    if (bankrupt || behind || paranoid) taxed++;
    check(`all seed ${s} does not win`, !r.card.win, `bankrupt=${bankrupt}, rival ahead ${pct(r.rivalAheadT / r.st.t)} of the run, safety ${pct(r.card.safetyShare)} of income, ended ${r.card.reason}`);
  }
  check(`all-layers bankrupt, behind the rival or ≥ 50% safety tax in ≥ 4/5 seeds`, taxed >= 4, `${taxed}/5`);
  return results;
}

function testMoneyV2() {
  console.log('\n▶ Money conservation with v2 actions (slots, upgrades, sells, a split held off-default, kill switch triggers)');
  const results = [];
  for (const seed of [1, 2, 3]) {
    const r = run({ fn: st => {
      const swing = Math.floor(st.t / 60) % 2 === 1;              // every other minute: hold a product-heavy split
      smartPolicy(st, { split: !swing });
      if (swing && st.split.product < 0.69) setSplit(st, 0.7, 0.25, 0.05);
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
  // kill switch for real: every 5th EXTERNAL chip flagged at spawn, kill switch with no responder below, no lab safety net
  const kill = run({ fn: st => {
    if (!st.lanes.ext.slots[5].layer) placeLayer(st, 'ext', 5, 'killswitch');
    flagAtSpawn(t => t.lane === 'ext' && t.id % 5 === 0)(st);
    if (st.pendingChoice) choose(st, 1);
  } }, 4, { maxT: 600 });
  const k = kill.st.stats.lanes.ext;
  console.log(`    kill switch run: ${kill.card.win ? 'WIN' : kill.card.reason || 'running'} at G${kill.st.gen}, killed ${k.killed}, rep lost to kills ${kill.st.stats.repLoss.killswitch.toFixed(1)}, $${(-(kill.st.ledger.byCat.safety || 0)).toFixed(0)} safety spend`);
  check('kill switch run: triggers fired and cost reputation and money', k.killed > 0 && kill.st.stats.repLoss.killswitch > 0 && kill.st.ledger.byCat.safety < 0);
  results.push(['v2 kill switch/4', kill]);
  for (const [name, r] of results) {
    const L = r.st.ledger, cats = Object.values(L.byCat).reduce((a, b) => a + b, 0);
    check(`${name}: categories sum to income − spend`, Math.abs(cats - (L.income - L.spend)) <= 1e-6 * Math.max(1, L.income));
  }
  return results;
}

function testMoney(results) {
  console.log('\n▶ Money conservation (income − costs = balance change)');
  for (const [name, r] of results) {
    const L = r.st.ledger;
    const drift = L.start + L.income - L.spend - r.st.money;
    check(`${name}: ledger balances`, Math.abs(drift) <= 1e-6 * Math.max(1, Math.abs(r.st.money), L.income), `residual ${drift.toExponential(2)}`);
  }
}

function testEvidence(results) {
  console.log('\n▶ Evidence ledger (earned by source − carry-over cut − spent = evidence)');
  let worst = 0, name = '';
  for (const [n, r] of results) {
    const st = r.st, earned = Object.values(st.stats.evidence).reduce((a, b) => a + b, 0);
    const err = Math.abs(earned - st.stats.evidenceOut.carry - st.stats.evidenceOut.spent - st.evidence);
    if (err >= worst) { worst = err; name = n; }
  }
  check(`evidence balances in all ${results.length} runs`, worst < 1e-6, `worst residual ${worst.toExponential(1)} (${name})`);
}

// =================== speed at G7 volume ===================

function perfLine() {
  const t0 = performance.now();
  const r = withoutCatastrophes(() => run('all', 3, labOpts(st => {
    toGen(st, 7);
    while (st.lanes.ext.slots.length < B.maxSlots) { buySlot(st, 'ext'); buySlot(st, 'int'); }
  }, null, 120)));
  const ms = performance.now() - t0, s = r.st.stats.lanes;
  const chips = ((s.ext.spawned || 0) + (s.int.spawned || 0)) / r.st.t;
  return `G7 volume, 10 mounts per lane: ${chips.toFixed(1)} chips/s, ${(ms / r.st.t).toFixed(2)} ms per simulated second (${(r.st.t / ms * 1000).toFixed(0)}× real time)`;
}

// =================== main ===================

const [, , cmd, pol, seedArg] = process.argv;
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (!isMain) { /* imported as a module */ }
else if (cmd === 'balance') {
  // win/loss table for a policy across difficulties: W7 = win, R/C/B = reputation/catastrophe/bankrupt + gen reached
  const t0 = performance.now();
  let simT = 0, chips = 0;
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const rows = [];
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(pol || 'smart', seed, { difficulty });
      rows.push(`${r.card.win ? 'W' : r.card.reason[0].toUpperCase()}${r.st.gen}`);
      simT += r.st.t; chips += (r.st.stats.lanes.ext.spawned || 0) + (r.st.stats.lanes.int.spawned || 0);
    }
    console.log(difficulty.padEnd(7), rows.join(' '));
  }
  const ms = performance.now() - t0;
  console.log(`\n30 runs: ${(simT / 60).toFixed(0)} simulated minutes, ${(chips / simT).toFixed(1)} chips/s on average, ${(ms / simT).toFixed(2)} ms per simulated second`);
  console.log(perfLine());
}
else if (cmd === 'test') {
  // one test by name, e.g. node test/headless.mjs test passBy
  const TESTS = { calibration: testCalibration, readQuality: testReadQuality, heads: testHeads, passBy: testPassBy, determinism: testDeterminism,
    slots: testSlots, bays: testBays, upgrades: testUpgrades, killSwitch: testKillSwitch, split: testSplit, volume: testVolume,
    traits: testTraits, dossier: testDossier, chipText: testChipText,
    policies: () => { const r = testPolicies(); testMoney(r); testEvidence(r); }, moneyV2: () => { const r = testMoneyV2(); testMoney(r); testEvidence(r); } };
  if (!TESTS[pol]) console.log('tests:', Object.keys(TESTS).join(' '));
  else { TESTS[pol](); console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ PASSED'}`); }
}
else if (cmd === 'run') {
  const r = run(pol || 'starter', Number(seedArg || 1));
  summary(pol, seedArg, r);
  console.log(confusion(r.st));
  console.log(JSON.stringify(r.card.lanes, null, 1));
} else {
  const t0 = Date.now();
  testCalibration();
  testReadQuality();
  testHeads();
  testPassBy();
  testDeterminism();
  testSlots();
  testBays();
  testUpgrades();
  testKillSwitch();
  testSplit();
  testVolume();
  testTraits();
  testDossier();
  testChipText();
  const results = testPolicies().concat(testMoneyV2());
  testMoney(results);
  testEvidence(results);
  console.log(`\n  ${perfLine()}`);
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ ALL PASSED'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failures ? 1 : 0);
}
