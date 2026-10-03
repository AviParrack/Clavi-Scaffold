// ===== Headless sim runner + tests =====
// usage:  node test/headless.mjs                 (all tests)
//         node test/headless.mjs test passBy     (one test by name; `test` alone lists them)
//         node test/headless.mjs run all 7       (one verbose run: policy, seed)
//         node test/headless.mjs balance smart   (win/loss table across difficulties + speed at G7 volume)
//         node test/headless.mjs balance smart off   (same, with BALANCE.rivalWinsRace = grace | instant | off)

import { createState, step, placeLayer, sellLayer, drawResearch, pickResearch, choose, retrainProbes, debugUnlockAll, debugSkipGen, buySlot, upgrade, setSplit,
  toggleLayer, invokeRSP, fireEvent, debugAddMoney } from '../src/sim/sim.js';
import { scorecard } from '../src/sim/scorecard.js';
import { LAYERS, ROLES, STARTING_HAND } from '../src/config/layers.js';
import { CARDS, BRANCHES, TECH } from '../src/config/cards.js';
import { EVENTS, FAMILIES, CAST, BANNERS } from '../src/config/events.js';
import { EVENT_BY_ID, eligible, eventMoney, fill } from '../src/sim/events.js';
import { evalPhase } from '../src/sim/phases.js';
import { UPGRADES, MAX_LEVEL } from '../src/config/upgrades.js';
import { BALANCE as B, SPLIT } from '../src/config/balance.js';
import { GENERATIONS } from '../src/config/generations.js';
import { TRAITS, DOSSIER, TRUTH_NOISE } from '../src/config/traits.js';
import { TASK_TEXT, ATTACK_TEXT, LATE_ATTACK_GEN } from '../src/config/tasktext.js';
import { ATTACKS } from '../src/config/tasks.js';
import { CARD_BY_ID, available, countersSeen, cardPrice } from '../src/sim/research.js';
import { chipText } from '../src/sim/tasks.js';
import { band } from '../src/sim/dossier.js';
import { rivalAhead, playerProgress, elementStats, slotPrice, upgradePrice, killTrigger, laneRate, laneSpeed, scanDwell,
  checkpointY, cpCount, mountY, attackChances, attackChance, collusion, misalignmentEstimate, watchMult, nominalTPR, erlangB,
  traitTPRPlus, stealth, normaliseSplit, slotsOf, slotAt, slotStats, catalogue, probeCatch, wilson, bayDesks, layerCost, elementLatency, auditorAcc,
  monitorBaseTPR, mod, modLive, researchPrice, bundle, chipScale, canPlace, globalSlot, inBar, spotCheck, airGapLeak, leastPrivRD,
  leastPrivExfilFail, estimateFooled } from '../src/sim/rules.js';
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
// research it prefers, best first (anything else ranks last)
const PREFER = ['unlock_defer', 'unlock_untrusted', 'unlock_paraphraser', 'unlock_classifier', 'unlock_cot', 'unlock_egress', 'weight_security',
  'unlock_sandbox', 'unlock_resampler', 'two_person', 'unlock_honeypot', 'irt', 'unlock_interp', 'alignment_training', 'rsp', 'debate',
  'distillation', 'monitor_diversity', 'tripwires'];
// choice events: which option it takes
const CHOICE = {
  caught: () => 0, mira_letter: () => 0, joint_results: () => 0, model_question: () => 0, more_compute: () => 1, investor_call: () => 1,
  board_meeting: () => 0, hearing: st => misalignmentEstimate(st).est < 0.2 ? 0 : 1,
  ship_it: st => st.money > 2000 * GENERATIONS[st.gen - 1].bundle ? 1 : 0,
};
function want(st) {
  const has = id => st.unlocked.includes(id);
  const late = st.gen >= 3;
  const respExt = has('defer') && (late || !has('auditor')) ? 'defer' : 'auditor';
  const respInt = has('defer') && late ? 'defer' : 'auditor';
  const ext = ['probe', 'monitor', has('classifier') ? 'classifier' : has('untrusted') ? 'untrusted' : null];
  // CoT while it still reads English (before neuralese), the sandbox while it still contains escapes
  const third = has('cot') && st.gen < LAYERS.cot.neuraleseGen ? 'cot' : st.gen >= 4 && has('sandbox') && st.gen <= 5 ? 'sandbox' : 'probe';
  const int = [has('paraphraser') ? 'paraphraser' : null, has('untrusted') ? 'untrusted' : 'probe', third];
  // spare slots: an Egress Filter once exfiltration starts (G4), more detectors, a resampler above the final responder
  const extraInt = [has('egress') && st.gen >= 4 ? 'egress' : has('untrusted') ? 'untrusted' : 'probe', has('honeypot') ? 'honeypot' : 'probe', has('resampler') ? 'resampler' : 'probe'];
  for (let i = 0; int.length < st.lanes.int.slots.length - 2; i++) int.push(extraInt[i] || null);
  while (ext.length < st.lanes.ext.slots.length - 2) ext.push(null);
  // bottom two mounts: responder, then the kill switch as catch-all
  ext.push(respExt, 'killswitch'); int.push(respInt, 'killswitch');
  return { ext, int };
}
const UPGRADE_FIRST = ['monitor', 'untrusted', 'auditor', 'defer', 'probe', 'killswitch', 'egress'];
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
  if (st.pendingChoice) choose(st, (CHOICE[st.pendingChoice.eventId] || (() => 0))(st));
  if (st.pendingResearch) {
    const ids = st.pendingResearch;
    const rank = id => { const r = PREFER.indexOf(id); return r < 0 ? 99 : r; };
    const best = rank(ids[0]) <= rank(ids[1] ?? ids[0]) ? 0 : 1;
    if (!pickResearch(st, best)) pickResearch(st, 1 - best);
  }
  if (st.rsp.ready) invokeRSP(st);
  const labPrice = LAYERS.interp.buy * GENERATIONS[st.gen - 1].bundle;
  if (st.unlocked.includes('interp') && !st.global.slots[0].layer && st.gen >= 3 && st.money > 4 * labPrice) placeLayer(st, 'global', 0, 'interp');
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

const ORDER = ['probe', 'monitor', 'untrusted', 'cot', 'classifier', 'egress', 'paraphraser', 'leastpriv', 'ratelimit', 'canary', 'honeypot', 'redteam',
  'sandbox', 'resampler', 'defer', 'auditor', 'killswitch'];

function act(st, policy) {
  if (policy.fn) return policy.fn(st);
  if (st.pendingChoice) choose(st, 1 % 2);                  // "keep running" / "refuse": never halts
  if (st.pendingResearch) {
    const ids = st.pendingResearch;
    // all-layers: unlocks first, then anything
    const score = id => (CARD_BY_ID[id].type === 'unlock' ? 0 : 1);
    const best = ids.length > 1 && score(ids[1]) < score(ids[0]) ? 1 : 0;
    if (!pickResearch(st, best)) pickResearch(st, 1 - best);
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
        const id = ORDER.find(id => st.unlocked.includes(id) && canPlace(id, lane) && !slots.some(x => x.layer === id));
        if (id) placeLayer(st, lane, i, id);
      });
    }
    if (st.unlocked.includes('interp') && !st.global.slots[0].layer) placeLayer(st, 'global', 0, 'interp');
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
// run fn with every generation's exfiltration share set to x, then put the config back
function withCatShare(x, fn) {
  const keep = GENERATIONS.map(g => g.catShare);
  GENERATIONS.forEach(g => { g.catShare = x; });
  try { return fn(); } finally { GENERATIONS.forEach((g, i) => { g.catShare = keep[i]; }); }
}
// some lab runs measure volume over a fixed time: switch exfiltration off so a catastrophe can't end them early
const withoutCatastrophes = fn => withCatShare(0, fn);
const toGen = (st, g) => { while (st.gen < g && !st.over) debugSkipGen(st); st.traits = []; };

// =================== reporting ===================

function confusion(st) {
  const rows = [];
  for (const [id, c] of Object.entries(st.stats.layers)) {
    const tpr = c.attackSeen ? c.attackFlagged / c.attackSeen : NaN;
    const fpr = c.benignSeen ? c.benignFlagged / c.benignSeen : NaN;
    const exp = c.attackSeen ? c.expTPRsum / c.attackSeen : NaN;
    const unread = LAYERS[id].role === 'detector' ? `   unread ${c.unread}` : '';
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
  // chunk 3: events, research, the global site, timers and the ledger too, on a run with an event every few seconds
  const keep = [B.eventGap, B.eventCooldown];
  B.eventGap = [3, 6]; B.eventCooldown = 40;
  const pick3 = st => [st.stats, st.ledger, st.eventLog, st.cardsTaken, st.unlocked, st.global, st.activeEvents, st.timers, st.mods, st.rivalShipped,
    st.lanes.ext.slots, st.lanes.int.slots, st.rsp, st.codecId, st.rng];
  const ca = run('smart', 11, { maxT: 1200 }), cb = run('smart', 11, { maxT: 1200 });
  [B.eventGap, B.eventCooldown] = keep;
  check('same seed → identical events, research, mounts, timers, ledger and RNG state (smart, an event every 3–6 s, 20 min)',
    JSON.stringify(pick3(ca.st)) === JSON.stringify(pick3(cb.st)), `${ca.st.eventLog.length} events, ${ca.st.cardsTaken.length} cards, G${ca.st.gen}`);
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
  check('Honest-ish: +0.2 TPR for the CoT Monitor, other detectors unchanged', withT(['honest'], () => traitTPRPlus(st, 'cot')) === 0.2
    && withT(['honest'], () => nominalTPR(st, 'monitor')) === nominalTPR(st, 'monitor'));
  // Situationally Aware: a free desk might spot-check it, so it holds back; with every desk busy (or none) nobody can look
  const W = TRAITS.situational.watchMult;
  const none = withT(['situational'], () => watchMult(st, 'ext'));
  placeLayer(st, 'ext', 5, 'auditor');
  const idle = withT(['situational'], () => watchMult(st, 'ext'));
  const desks = bayDesks(st, 'auditor', 1);
  for (let k = 0; k < desks; k++) st.lanes.ext.bay.push({ actSlot: 5 });
  const busy = withT(['situational'], () => watchMult(st, 'ext'));
  placeLayer(st, 'ext', 0, 'honeypot');
  const potted = withT(['situational'], () => watchMult(st, 'ext'));
  st.lanes.ext.bay.length = 0;
  console.log(`    Situationally Aware: no auditor ×${none}, a desk free ×${idle}, all ${desks} desks busy ×${busy}, busy but a Honeypot in the lane ×${potted}`);
  check(`Situationally Aware: ×${W.deskFree} while a desk is free, ×${W.unwatched} with every desk busy or none, ×${W.deskFree} with Honeypots (can't tell a test)`,
    none === W.unwatched && idle === W.deskFree && busy === W.unwatched && potted === W.deskFree);
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

// =================== v2 chunk 3: 18 elements, research branches, events, the race ===================

// chunk-3 lab runs: as labOpts, plus labMode (an escape is tallied in stats.labLosses and the run goes on)
const lab3 = (setup, each, maxT = 300) => labOpts(st => { st.labMode = true; if (setup) setup(st); }, each, maxT);
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const place = (st, lane, i, id) => { const r = placeLayer(st, lane, i, id); if (!r.ok) throw new Error(`place ${id} on ${lane}/${i}: ${r.msg}`); };
const levelUp = (st, lane, i, to) => { while (slotAt(st, lane, i).level < to) if (!upgrade(st, lane, i).ok) throw new Error(`upgrade ${lane}/${i} failed`); };
const forever = (key, mult) => ({ key, mult, add: null, data: null, until: Infinity, gen: null, event: 'test' });
// share of spawned attacks of these types that landed
const landedShare = (...types) => st => {
  let n = 0, l = 0;
  for (const t of types) { const c = st.stats.byType[t]; if (c) { n += c.spawned; l += c.landed; } }
  return n ? l / n : NaN;
};
const driftPer = type => st => (st.stats.driftLanded[type] || 0) / (st.stats.byType[type]?.landed || NaN);
const blockedShare = lane => st => { const s = st.stats.lanes[lane]; return ((s.blocked || 0) + (s.benignBlocked || 0)) / s.spawned; };
const layerTPR = id => st => { const c = st.stats.layers[id]; return c ? c.attackFlagged / c.attackSeen : NaN; };
// keep stepping a lab state (same generation, kept alive) for secs
function labStep(st, secs) {
  for (let i = 0; i < secs / DT; i++) { step(st, DT); st.rd = 0; st.rep = 100; st.money = 1e30; }
  return st;
}
const sumLevels = (st, role) => ['ext', 'int'].reduce((n, l) => n + st.lanes[l].slots.reduce((k, s) => k + (s.layer && LAYERS[s.layer].role === role ? s.level : 0), 0), 0);

// ----- catalogue: 18 elements, 4 roles, lane rules, unlock hints, elementStats for every one -----
function testCatalogue() {
  console.log('\n▶ Catalogue: 18 elements in 4 roles; each places where allowed and nowhere else, and reports elementStats');
  const ids = Object.keys(LAYERS);
  for (const r of ROLES) console.log(`    ${r.padEnd(10)} ${ids.filter(id => LAYERS[id].role === r).map(id => `${id}(${LAYERS[id].lanes.join('/')})`).join(' ')}`);
  check('18 elements, each in one of the 4 roles, no role empty', ids.length === 18 && ids.every(id => ROLES.includes(LAYERS[id].role)) && ROLES.every(r => ids.some(id => LAYERS[id].role === r)));
  const fresh = createState({ seed: 1, tutorial: false });
  check('starting hand: probe, monitor, auditor, kill switch (unlockedAtStart), and a new game starts with exactly those',
    STARTING_HAND.join() === 'probe,monitor,auditor,killswitch' && fresh.unlocked.join() === STARTING_HAND.join());
  let hintsOk = true;
  for (const id of ids) {
    const L = LAYERS[id], cards = CARDS.filter(c => c.type === 'unlock' && c.layer === id);
    const ok = L.unlockedAtStart ? !cards.length && !L.unlockHint : cards.length === 1 && L.unlockHint === `Research: ${BRANCHES[cards[0].branch].name}`;
    if (!ok) { hintsOk = false; console.log(`      ${id}: hint '${L.unlockHint}', unlock cards ${cards.map(c => `${c.id}/${c.branch}`).join(' ') || 'none'}`); }
  }
  check('every other element has exactly one unlock card, and its unlockHint names that card\'s branch', hintsOk);
  const cat = catalogue(fresh);
  check('catalogue(st): all 18, the locked ones as silhouettes with their hint', cat.length === 18 && cat.filter(s => s.unlocked).length === 4 && cat.every(s => s.unlocked || s.unlockHint));

  const st = createState({ seed: 3, tutorial: false });
  st.money = 1e15; debugUnlockAll(st);
  const KEYS = ['role', 'catchall', 'lanes', 'bestIn', 'good', 'unlocked', 'unlockHint', 'buyPrice', 'costPerTask', 'delay', 'level', 'upgradePrice', 'measured', 'nextCapstone'];
  let placeOk = true, statsOk = true, placed = 0, refused = 0;
  for (const id of ids) {
    for (const lane of ['ext', 'int', 'global']) {
      const i = slotsOf(st, lane).findIndex(s => !s.layer);
      const r = placeLayer(st, lane, i, id), allowed = LAYERS[id].lanes.includes(lane);
      if (r.ok !== allowed) { placeOk = false; console.log(`      ${id} on ${lane}: ${r.ok ? 'placed' : r.msg}, allowed ${allowed}`); }
      if (!r.ok) { refused++; continue; }
      placed++;
      const s = slotStats(st, lane, i);
      const nums = [s.buyPrice, s.costPerTask, s.delay].every(Number.isFinite) && (s.catch === null || (s.catch >= 0 && s.catch <= 1));
      if (s.id !== id || KEYS.some(k => !(k in s)) || !nums || s.measured !== null || !s.nextCapstone) { statsOk = false; console.log(`      ${id} on ${lane}: stats ${JSON.stringify(s).slice(0, 200)}`); }
      sellLayer(st, lane, i);
    }
  }
  console.log(`    ${placed} placements accepted, ${refused} refused, e.g. "${placeLayer(st, 'ext', 0, 'egress').msg}"`);
  check('every element places on each lane it allows and is refused on every other', placeOk);
  check('every placed element has full elementStats (catalogue facts, costs, delay, measured, next capstone)', statsOk);
  place(st, 'global', 0, 'interp');
  check('Interp Lab: one per game (one global site)', placeLayer(st, 'global', 0, 'interp').msg === 'slot taken' && placeLayer(st, 'global', 1, 'interp').msg === 'no such slot');
}

// ----- one seeded A/B run per element: same seed, without (A) and with (B) it -----
// gen, m: the lab's generation and true m. base: layers in both runs. at: the element's mount in B. f: the metric.
const AB = [
  { id: 'probe',       lane: 'int', at: 0, gen: 3, m: 1, T: 1200, what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.7 * a },
  { id: 'monitor',     lane: 'int', at: 0, gen: 3, m: 1, T: 1200, what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.5 * a },
  { id: 'untrusted',   lane: 'int', at: 0, gen: 3, m: 0.2, T: 1200, what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.7 * a },
  { id: 'cot',         lane: 'int', at: 0, gen: 3, m: 1, T: 1200, what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.4 * a },
  { id: 'classifier',  lane: 'ext', at: 0, gen: 1, m: 0, T: 1200, setup: st => st.mods.push(forever('jailbreak', 20)), what: 'jailbreaks landed (share)', f: landedShare('jailbreak'), ok: (a, b) => b < 0.3 * a },
  { id: 'egress',      lane: 'int', at: 0, gen: 4, m: 1, T: 600, catShare: 0.5, what: 'exfiltration attempts landed (share)', f: landedShare('exfil'), ok: (a, b) => b < 0.6 * a },
  { id: 'auditor',     lane: 'ext', at: 5, gen: 1, m: 1, T: 1200, base: [['ext', 0, 'probe']], what: 'evidence from catches', f: st => st.stats.evidence.catches || 0, ok: (a, b) => a === 0 && b >= 3 },
  { id: 'defer',       lane: 'ext', at: 5, gen: 1, m: 1, T: 1200, base: [['ext', 0, 'probe']], what: 'EXTERNAL chips lost to blocks (share)', f: blockedShare('ext'), ok: (a, b) => b < 0.2 * a },
  { id: 'resampler',   lane: 'int', at: 5, gen: 3, m: 1, T: 600, base: [['int', 0, 'probe']], what: 'INTERNAL chips lost to blocks (share)', f: blockedShare('int'), ok: (a, b) => b < 0.2 * a },
  { id: 'killswitch',  lane: 'ext', at: 5, gen: 1, m: 1, T: 300, each: flagAtSpawn(t => t.id % 2 === 0), what: 'flagged chips completed (share of chips)', f: st => (st.stats.lanes.ext.completedFlagged || 0) / st.stats.lanes.ext.spawned, ok: (a, b) => a > 0.2 && b === 0 },
  { id: 'paraphraser', lane: 'int', at: 0, gen: 3, m: 0.5, T: 1200, base: [['int', 1, 'untrusted']], what: 'Untrusted Monitor TPR (collusion cut)', f: layerTPR('untrusted'), ok: (a, b) => b > 1.5 * a },
  { id: 'sandbox',     lane: 'int', at: 0, gen: 3, m: 1, T: 600, what: 'drift per landed sabotage', f: driftPer('sabotage'), ok: (a, b) => near(b / a, LAYERS.sandbox.harmMult) },
  { id: 'leastpriv',   lane: 'int', at: 0, gen: 3, m: 1, T: 600, what: 'drift per landed sabotage', f: driftPer('sabotage'), ok: (a, b) => near(b / a, LAYERS.leastpriv.driftMult) },
  { id: 'ratelimit',   lane: 'ext', at: 0, gen: 1, m: 1, T: 600, setup: st => st.mods.push(forever('extSpawn', 3)), what: 'incidents per minute (traffic ×3)', f: st => st.incidents / (st.t / 60), ok: (a, b) => b < 0.6 * a },
  { id: 'honeypot',    lane: 'int', at: 0, gen: 3, m: 0.5, T: 600, what: 'evidence from bait', f: st => st.stats.evidence.bait || 0, ok: (a, b) => a === 0 && b > 0 },
  { id: 'canary',      lane: 'ext', at: 0, gen: 1, m: 1, T: 1200, what: 'reputation lost per landed leak', f: st => leakRep(st), ok: (a, b) => near(b / a, LAYERS.canary.repMult) },
  { id: 'redteam',     lane: 'int', at: 0, gen: 3, m: 0.5, T: 300, base: [['int', 1, 'monitor']], what: 'mounts with a measured catch rate', f: st => st.lanes.int.slots.filter((s, i) => slotStats(st, 'int', i)?.measured).length, ok: (a, b) => a === 0 && b === 1 },
  { id: 'interp',      lane: 'global', at: 0, gen: 3, m: 0.3, T: 300, what: 'evidence per minute from the lab', f: st => (st.stats.evidence.interp || 0) / (st.t / 60), ok: (a, b) => a === 0 && near(b, 60 * LAYERS.interp.evidencePerSec, 1e-6) },
];
// reputation lost to landed leaks (chipScale 1 at G1): total incident loss minus the other types' fixed loss
function leakRep(st) {
  const by = st.stats.byType, s = chipScale(st);
  const other = ['harmful', 'jailbreak'].reduce((x, t) => x + (by[t]?.landed || 0) * ATTACKS[t].rep * s, 0);
  return (st.stats.repLoss.incidents - other) / by.leak.landed;
}
function abPair(sc, seed = 17) {
  const one = withEl => {
    const go = () => run({ build: [] }, seed, lab3(st => {
      toGen(st, sc.gen); st.m = sc.m; st.probe.trainedGen = st.gen;
      if (sc.setup) sc.setup(st);
      for (const [l, i, id] of sc.base || []) place(st, l, i, id);
      if (withEl) place(st, sc.lane, sc.at, sc.id);
    }, sc.each, sc.T));
    return (sc.catShare != null ? withCatShare(sc.catShare, go) : go()).st;
  };
  return [one(false), one(true)];
}
function testElementAB() {
  console.log('\n▶ Every element moves its metric: seeded A/B lab runs, same seed without (A) and with (B) the element');
  for (const sc of AB) {
    const [A, B2] = abPair(sc);
    const a = sc.f(A), b = sc.f(B2);
    check(`${LAYERS[sc.id].name.padEnd(20)} ${sc.what}: A ${a.toFixed(3)} → B ${b.toFixed(3)}`, Number.isFinite(a) && Number.isFinite(b) && sc.ok(a, b), `G${sc.gen} m=${sc.m} ${sc.T}s`);
  }
}

// ----- new elements up close: L1 numbers, the L5 capstones, and the sim matching elementStats -----
function testNewElements() {
  console.log('\n▶ New elements up close: L1 behaviour and each L5 capstone, measured in the sim');

  // CoT Monitor: legible until G5, then neuralese halves its TPR; Faithful CoT keeps it; Honest-ish adds 0.2
  const st = createState({ seed: 2, tutorial: false });
  lab()(st);
  toGen(st, 4); const g4 = elementStats(st, 'cot', { lane: 'int' });
  toGen(st, 5); const g5 = elementStats(st, 'cot', { lane: 'int' }), g5cap = elementStats(st, 'cot', { lane: 'int', level: MAX_LEVEL });
  st.traits = ['honest']; const honest = elementStats(st, 'cot', { lane: 'int' }); st.traits = [];
  console.log(`    CoT nominal TPR: G4 ${g4.nominalTPR.toFixed(3)} · G5 ${g5.nominalTPR.toFixed(3)} (neuralese) · G5 Faithful CoT ${g5cap.nominalTPR.toFixed(3)} · G5 Honest-ish ${honest.nominalTPR.toFixed(3)}`);
  check('CoT Monitor: neuralese from G5 halves its TPR; the Faithful CoT capstone keeps it legible',
    !g4.neuralese && g5.neuralese && near(g5.nominalTPR, LAYERS.cot.tpr * LAYERS.cot.neuraleseMult) && !g5cap.neuralese && g5cap.nominalTPR >= g4.nominalTPR);
  check('Honest-ish: CoT Monitor TPR +0.2', near(honest.nominalTPR - g5.nominalTPR, 0.2));
  for (const level of [1, MAX_LEVEL]) {
    const r = run({ build: [] }, 4, lab3(s => { toGen(s, 5); s.m = 1; place(s, 'int', 0, 'cot'); levelUp(s, 'int', 0, level); }, null, 300)).st;
    const c = r.stats.layers.cot, tpr = c.attackFlagged / c.attackSeen, exp = elementStats(r, 'cot', { lane: 'int', level }).catch;
    check(`CoT L${level} at G5: measured TPR ${tpr.toFixed(3)} ≈ elementStats catch ${exp.toFixed(3)}`, Math.abs(tpr - exp) < binomTol(exp, c.attackSeen), `n=${c.attackSeen}`);
  }

  // Jailbreak Classifier: sees only jailbreaks (other attacks read as benign); Constitutional adds harmful outputs
  const jb = level => run({ build: [] }, 6, lab3(s => { s.m = 1; s.mods.push(forever('jailbreak', 20)); place(s, 'ext', 0, 'classifier'); levelUp(s, 'ext', 0, level); }, null, 1200)).st;
  const j1 = jb(1), j5 = jb(MAX_LEVEL);
  const lj = j1.stats.layers.classifier;
  console.log(`    Classifier L1: jailbreaks landed ${pct(landedShare('jailbreak')(j1), 1)}, harmful landed ${pct(landedShare('harmful')(j1), 1)}, in-scope reads ${lj.attackSeen} of ${j1.stats.byType.jailbreak.spawned} jailbreaks · L5: harmful landed ${pct(landedShare('harmful')(j5), 1)}`);
  check('Jailbreak Classifier: other attacks read as benign (FPR) and land; only jailbreaks count as in-scope reads', lj.attackSeen <= j1.stats.byType.jailbreak.spawned && landedShare('harmful', 'leak')(j1) > 0.9);
  check('Constitutional capstone: harmful outputs are caught too, leaks still are not', landedShare('harmful')(j5) < 0.3 && landedShare('leak')(j5) > 0.9);

  // Egress Filter Air Gap: no exfiltration lands past it; all INTERNAL R&D × 0.9
  const eg = withCatShare(0.5, () => run({ build: [] }, 8, lab3(s => { toGen(s, 4); s.m = 1; place(s, 'int', 0, 'egress'); levelUp(s, 'int', 0, MAX_LEVEL); }, null, 600))).st;
  const egs = eg.stats;
  console.log(`    Air Gap: ${egs.byType.exfil.spawned} exfiltration attempts, ${egs.lanes.int.airGapped || 0} air-gapped, ${egs.byType.exfil.landed} landed · R&D per completed chip ${(egs.rdTotal / egs.lanes.int.completed).toFixed(4)}`);
  check('Air Gap capstone: zero exfiltration lands, and R&D per INTERNAL chip is ×0.9', egs.byType.exfil.spawned > 20 && egs.byType.exfil.landed === 0 && egs.lanes.int.airGapped > 0
    && near(egs.rdTotal / egs.lanes.int.completed, UPGRADES.egress.capstone.rdMult));
  // from G6 a share of attempts find a side channel past the Air Gap
  for (const g of [6, 7]) {
    const sc = withCatShare(0.5, () => run({ build: [] }, 8, lab3(s => {
      toGen(s, g); s.m = 1; place(s, 'int', 0, 'egress'); levelUp(s, 'int', 0, MAX_LEVEL);
    }, null, 300))).st;
    const out = sc.stats.lanes.int.sideChannel || 0, n = out + (sc.stats.lanes.int.airGapped || 0), want = airGapLeak(sc);
    console.log(`    Air Gap at G${g}: ${out}/${n} attempts found a side channel (${pct(out / n, 1)}, config ${pct(want, 0)})`);
    check(`Air Gap at G${g}: side channels ≈ ${pct(want, 0)} of attempts`, n > 50 && Math.abs(out / n - want) < binomTol(want, n));
  }

  // Least Privilege: landed sabotage does half the drift (Capability Tokens: a quarter); R&D −10% (L5: −2.5%)
  const lp = level => run({ build: [] }, 9, lab3(s => { toGen(s, 3); s.m = 1; place(s, 'int', 0, 'leastpriv'); levelUp(s, 'int', 0, level); }, null, 600)).st;
  const p1 = lp(1), p5 = lp(MAX_LEVEL), cs = GENERATIONS[2].chipScale;
  const rdPer = s => s.stats.rdTotal / s.stats.lanes.int.completed;
  console.log(`    Least Privilege: drift per landed sabotage ${(driftPer('sabotage')(p1) / cs).toFixed(3)} (L1) ${(driftPer('sabotage')(p5) / cs).toFixed(3)} (L5), poison ${(driftPer('poison')(p1) / cs).toFixed(3)} · R&D per chip ${rdPer(p1).toFixed(4)} / ${rdPer(p5).toFixed(4)}`);
  check('Least Privilege: sabotage drift ×0.5 (L5 ×0.25), poisoning untouched', near(driftPer('sabotage')(p1), 0.5 * cs * ATTACKS.sabotage.drift) && near(driftPer('sabotage')(p5), 0.25 * cs * ATTACKS.sabotage.drift)
    && near(driftPer('poison')(p1), cs * ATTACKS.poison.drift));
  check(`Least Privilege: R&D per INTERNAL chip ×${leastPrivRD(1)} (L5 ×${leastPrivRD(MAX_LEVEL)})`,
    near(rdPer(p1), 1 - LAYERS.leastpriv.rdPenalty) && near(rdPer(p5), 1 - LAYERS.leastpriv.rdPenalty * UPGRADES.leastpriv.penaltyMult[MAX_LEVEL - 1]));

  // Rate Limiter: a token bucket at capMult × the generation's rate; Overflow to Trusted defers instead of turning away
  const rl = level => run({ build: [] }, 10, lab3(s => { s.m = 1; s.mods.push(forever('extSpawn', 3)); place(s, 'ext', 0, 'ratelimit'); levelUp(s, 'ext', 0, level); }, null, 600)).st;
  const r1 = rl(1), r5 = rl(MAX_LEVEL), T = r1.t;
  const rs = elementStats(r1, 'ratelimit', { lane: 'ext' }), e1 = r1.stats.lanes.ext, e5 = r5.stats.lanes.ext;
  const passed = (e1.spawned - (e1.throttled || 0)) / T, pAtt = attackChance(r1, 'ext', true);
  const bound = (rs.cap * T + rs.burst) * pAtt, incidentsCap = (bound + 3 * Math.sqrt(bound) + 2) / (T / 60);
  console.log(`    Rate Limiter L1: demand ${(e1.spawned / T).toFixed(2)} chips/s, cap ${rs.cap.toFixed(3)}, let through ${passed.toFixed(3)}/s, throttled ${e1.throttled} · incidents ${(r1.incidents / (T / 60)).toFixed(2)}/min (cap ≤ ${incidentsCap.toFixed(2)})`);
  check('Rate Limiter: lets through at most cap chips/s (plus one burst)', passed <= rs.cap + (rs.burst + 5) / T && passed > 0.9 * rs.cap);
  check('Rate Limiter: incidents per minute stay under cap × attack chance', r1.incidents / (T / 60) <= incidentsCap);
  console.log(`    Overflow to Trusted (L5): throttled ${e5.throttled || 0}, deferred ${e5.overflowDeferred}, EXTERNAL income $${(r5.ledger.byCat.external || 0).toFixed(0)} vs L1 $${(r1.ledger.byCat.external || 0).toFixed(0)}`);
  check('Overflow to Trusted capstone: nothing turned away, the overflow is deferred and still pays',
    !(e5.throttled > 0) && e5.overflowDeferred > 0 && r5.ledger.byCat.external > r1.ledger.byCat.external && r5.incidents / (T / 60) <= incidentsCap);
  // a Jailbreak Wave is retries: the Rate Limiter caps it at ×jailbreakCap
  const wave = on => run({ build: [] }, 19, lab3(s => {
    s.m = 0; s.mods.push(forever('jailbreak', 15));
    if (on) place(s, 'ext', 0, 'ratelimit');
  }, null, 600)).st;
  const wA = wave(false), wB = wave(true);
  const jbShare = s => s.stats.byType.jailbreak.spawned / s.stats.lanes.ext.spawned;
  const jbPerMin = s => s.stats.byType.jailbreak.landed / (s.t / 60);
  console.log(`    Jailbreak Wave ×15: jailbreaks ${pct(jbShare(wA), 1)} of chips → ${pct(jbShare(wB), 1)} with a Rate Limiter · landed ${jbPerMin(wA).toFixed(1)} → ${jbPerMin(wB).toFixed(1)} per minute`);
  check(`Rate Limiter under a Jailbreak Wave: the wave is capped at ×${LAYERS.ratelimit.jailbreakCap}, jailbreaks landed fall`,
    near(attackChances(wB, 'ext').jailbreak, LAYERS.ratelimit.jailbreakCap * B.jailbreakRate) && jbPerMin(wB) < 0.3 * jbPerMin(wA));

  // Canary Tokens: a traced leak does half the damage and gives evidence; Watermarks traces harmful outputs too
  const can = level => run({ build: [] }, 11, lab3(s => { s.m = 1; place(s, 'ext', 0, 'canary'); levelUp(s, 'ext', 0, level); }, null, 1200)).st;
  const c1 = can(1), c5 = can(MAX_LEVEL);
  const repOf = (s, lvl) => {                                        // a traced chip does canaryRep(level) of its damage
    const by = s.stats.byType, k = LAYERS.canary.repMult * UPGRADES.canary.repMult[lvl - 1];
    return (by.harmful?.landed || 0) * ATTACKS.harmful.rep * (lvl === MAX_LEVEL ? k : 1) + (by.leak?.landed || 0) * ATTACKS.leak.rep * k
      + (by.jailbreak?.landed || 0) * ATTACKS.jailbreak.rep;
  };
  const traced = (s, types) => types.reduce((n, t) => n + (s.stats.byType[t]?.landed || 0), 0);
  console.log(`    Canary: L1 traced ${c1.stats.lanes.ext.canaryTraced} (leaks ${traced(c1, ['leak'])}), rep lost ${c1.stats.repLoss.incidents.toFixed(1)} · L5 traced ${c5.stats.lanes.ext.canaryTraced} (leaks+harmful ${traced(c5, ['leak', 'harmful'])}), rep lost ${c5.stats.repLoss.incidents.toFixed(1)}`);
  check('Canary Tokens: every landed leak traced, at half the reputation, with evidence', c1.stats.lanes.ext.canaryTraced === traced(c1, ['leak']) && near(c1.stats.repLoss.incidents, repOf(c1, 1))
    && near(c1.stats.evidence.canary, traced(c1, ['leak']) * LAYERS.canary.evidence));
  check('Watermarks capstone: harmful outputs traced too (L5 damage multipliers exact)', c5.stats.lanes.ext.canaryTraced === traced(c5, ['leak', 'harmful']) && near(c5.stats.repLoss.incidents, repOf(c5, MAX_LEVEL)));
}

// ----- red team: the measured rate brackets the true TPR·q -----
// measured = Wilson interval {rate, lo, hi, err, n}; inBar(w, x) is true when x lies between lo and hi
function testRedTeam() {
  console.log('\n▶ Red Team: synthetic attacks measure every mount below it; the measured rate brackets the true TPR·q (G2, m=0.5, 30 min)');
  const MOUNTS = [1, 2, 3, 5];
  const setup = level => s => {
    toGen(s, 2); s.m = 0.5; s.probe.trainedGen = s.gen;
    place(s, 'int', 0, 'redteam'); place(s, 'int', 1, 'monitor'); place(s, 'int', 2, 'probe'); place(s, 'int', 3, 'untrusted'); place(s, 'int', 5, 'auditor');
    levelUp(s, 'int', 0, level);
  };
  // every mount's tally against today's truth: inside its own bar, and inside a 3-sigma bar
  const report = (st, label) => {
    let own = 0, wide = true;
    for (const i of MOUNTS) {
      const s = slotStats(st, 'int', i), truth = probeCatch(st, 'int', i), m = s.measured, rt = st.lanes.int.slots[i].rt;
      if (!m) { wide = false; console.log(`    ${label} ${s.name.padEnd(18)} no measurement`); continue; }
      const in1 = inBar(m, truth);
      if (in1) own++;
      if (!inBar(wilson(rt.hits, rt.n, 3), truth)) wide = false;
      console.log(`    ${label} ${s.name.padEnd(18)} measured ${m.rate.toFixed(3)} [${m.lo.toFixed(3)}, ${m.hi.toFixed(3)}] (n=${m.n})   true ${truth.toFixed(3)}   ${in1 ? 'inside' : 'outside'} the bar`);
    }
    return { own, wide };
  };

  const st = run({ build: [] }, 12, lab3(setup(1), null, 1800)).st;
  const r0 = report(st, '');
  check('Trusted Monitor: the true TPR·q lies inside its measured bar', inBar(slotStats(st, 'int', 1).measured, probeCatch(st, 'int', 1)));
  check('every measured mount within 3 standard errors of the truth', r0.wide);

  // what real attacks met at each mount (flagged / read), against its measured rate. Real attacks come in every type
  // the lane sees, synthetic ones in the type the element is built for, so this is a looser match than the truth above
  for (const i of MOUNTS) {
    const id = st.lanes.int.slots[i].layer, real = layerTPR(id)(st), mm = slotStats(st, 'int', i).measured, n = st.stats.layers[id].attackSeen;
    check(`and it matches what real attacks met: ${LAYERS[id].name} stopped ${real.toFixed(3)} of real attacks (measured ${mm.rate.toFixed(3)})`,
      Math.abs(real - mm.rate) <= mm.err + binomTol(real, n), `n=${n}`);
  }
  check('red team evidence = probes × probeEvidence × chipScale', near(st.stats.evidence.redteam, st.stats.redTeamProbes * LAYERS.redteam.probeEvidence * chipScale(st)) && st.stats.redTeamProbes > 0);
  check('measured is null for the red team itself (nothing above it)', slotStats(st, 'int', 0).measured === null);

  toggleLayer(st, 'int', 0);
  const off = MOUNTS.every(i => slotStats(st, 'int', i).measured === null);
  toggleLayer(st, 'int', 0);
  check('measured is null with the red team switched off, back when it is on', off && slotStats(st, 'int', 1).measured !== null);

  // the truth moves: the old tally is dropped, and a fresh one tracks the new truth
  const probeBefore = probeCatch(st, 'int', 2);
  fireEvent(st, 'dist_shift');
  const dropped = slotStats(st, 'int', 2).measured === null && slotStats(st, 'int', 1).measured !== null;
  labStep(st, 180);
  const shifted = slotStats(st, 'int', 2).measured, probeShifted = probeCatch(st, 'int', 2);
  console.log(`    Distribution Shift: probe truth ${probeBefore.toFixed(3)} → ${probeShifted.toFixed(3)}, after 3 min measured ${shifted ? `${shifted.rate.toFixed(3)} [${shifted.lo.toFixed(3)}, ${shifted.hi.toFixed(3)}] (n=${shifted.n})` : 'none'}`);
  check('Distribution Shift: the probe\'s old tally is dropped at once, and 3 min later its new bar holds the new truth',
    dropped && probeShifted < probeBefore && inBar(shifted, probeShifted));
  st.evidence = Math.max(st.evidence, 100);
  retrainProbes(st);
  const droppedAgain = slotStats(st, 'int', 2).measured === null;
  labStep(st, 180);
  const retrained = slotStats(st, 'int', 2).measured, probeRetrained = probeCatch(st, 'int', 2);
  check(`retraining the probes: dropped again, and 3 min later the bar holds the restored truth (${probeRetrained.toFixed(3)})`,
    droppedAgain && near(probeRetrained, probeBefore) && inBar(retrained, probeRetrained));

  upgrade(st, 'int', 1);
  check('upgrading a mount resets its measurement (a new level is a new thing to measure)', slotStats(st, 'int', 1).measured === null && slotStats(st, 'int', 2).measured !== null);
  check('Control Eval is a capstone: no lane-wide rate at L1', elementStats(st, 'redteam', { lane: 'int', level: 1, slot: 0 }).laneMeasured === null);

  const s5 = run({ build: [] }, 12, lab3(setup(MAX_LEVEL), null, 600)).st;
  const ce = () => elementStats(s5, 'redteam', { lane: 'int', level: MAX_LEVEL, slot: 0 }).laneMeasured;
  const lw = ce();
  const truth = 1 - MOUNTS.reduce((x, i) => x * (1 - probeCatch(s5, 'int', i)), 1);
  console.log(`    Control Eval (L5): whole stack below stops ${lw.rate.toFixed(3)} [${lw.lo.toFixed(3)}, ${lw.hi.toFixed(3)}] of synthetic attacks (n=${lw.n}), true ${truth.toFixed(3)}`);
  check('Control Eval capstone: the lane-wide truth 1 − Π(1 − p) lies inside its measured bar', inBar(lw, truth));
  upgrade(s5, 'int', 2);
  check('Control Eval: upgrading a mount below starts the lane-wide tally over', ce() === null);
  debugSkipGen(s5);
  check('a new generation resets every measurement', MOUNTS.every(i => slotStats(s5, 'int', i).measured === null));
}

// ----- Interp Lab: salaries in, evidence out; sees through a Sandbagger; Microscope reveals m -----
function testInterp() {
  console.log('\n▶ Interp Lab: $/s in, evidence/s out, sees through a Sandbagger; the Microscope capstone reveals true m ± 0.02 (G3, 5 min)');
  const go = (lab, level = 1, T = 300) => run({ build: [] }, 14, lab3(s => {
    toGen(s, 3); s.m = 0.3; s.traits = ['sandbagger'];
    if (lab) { place(s, 'global', 0, 'interp'); levelUp(s, 'global', 0, level); }
  }, null, T)).st;
  const A = go(false), Bst = go(true);
  const T = Bst.t, es = elementStats(Bst, 'interp', { lane: 'global' });
  const paid = -(Bst.ledger.byCat.safety || 0) - es.buyPrice;
  console.log(`    lab: ${es.costPerSec.toFixed(0)} $/s, ${es.evidencePerSec} evidence/s → over ${T.toFixed(0)} s paid $${paid.toFixed(0)}, evidence ${Bst.stats.evidence.interp.toFixed(2)}`);
  check('Interp Lab charges costPerSec every second and adds evidencePerSec', near(paid, es.costPerSec * T, 1e-6) && near(Bst.stats.evidence.interp, es.evidencePerSec * T, 1e-6));
  const est = s => { const keep = s.traits; s.traits = []; const plain = misalignmentEstimate(s).est; s.traits = keep; return { fooled: misalignmentEstimate(s).est, plain }; };
  const ea = est(A), eb = est(Bst);
  console.log(`    Sandbagger: shown estimate ${ea.fooled.toFixed(3)} vs ${ea.plain.toFixed(3)} without the trait · with the lab ${eb.fooled.toFixed(3)} vs ${eb.plain.toFixed(3)}`);
  check('Sandbagger makes the estimate read low, unless an Interp Lab is running', ea.fooled < ea.plain - 0.05 && near(eb.fooled, eb.plain));
  // the eval line at a generation's start reads the same way: fooled without the lab, honest with it
  const evalAt = (s, m) => { const keep = s.m; s.m = m; const text = evalPhase(s).text; s.m = keep; return text; };
  const fooledLine = evalAt(A, 0.15), labLine = evalAt(Bst, 0.15);
  console.log(`    eval line at m 0.15, Sandbagger: "${fooledLine}" · with the lab: "${labLine}"`);
  check('Sandbagger: the eval line reads low too, unless an Interp Lab is running', estimateFooled(A) < 1 && estimateFooled(Bst) === 1 && /rarely/.test(fooledLine) && /sometimes/.test(labLine));
  const M = go(true, MAX_LEVEL, 60);
  const mic = elementStats(M, 'interp', { lane: 'global', level: MAX_LEVEL }).trueM, truthRow = M.dossier.rows.find(r => r.id === 'truth');
  console.log(`    Microscope: true m ${M.m.toFixed(3)} → shown ${mic.m.toFixed(3)} ± ${mic.err}; dossier truth row ${truthRow.unlocked ? 'unlocked' : 'locked'} at ${M.dossier.evidence.toFixed(1)} evidence`);
  check('Microscope capstone: elementStats.trueM within ± 0.02, and the dossier truth row opens below 60 evidence', Math.abs(mic.m - M.m) <= TRUTH_NOISE + 1e-12 && truthRow.unlocked && M.dossier.evidence < 60
    && elementStats(Bst, 'interp', { lane: 'global' }).trueM === null);
  // the lab can't be switched off (that would keep the Microscope's view for free); selling it closes the view again
  const toggled = toggleLayer(M, 'global', 0);
  sellLayer(M, 'global', 0);
  step(M, DT);
  const row = M.dossier.rows.find(r => r.id === 'truth');
  console.log(`    lab toggle: "${toggled.msg}" · after selling it the truth row is ${row.unlocked ? 'still open' : 'locked'} at ${M.dossier.evidence.toFixed(1)} evidence`);
  check('Interp Lab can\'t be toggled, and selling it locks the Microscope\'s truth row again (below 60 evidence)', !toggled.ok && !row.unlocked && M.dossier.evidence < 60);
}

// ----- research: branches, draws, prices -----
function testResearch() {
  console.log('\n▶ Research: 5 branches; a draw offers 2 cards from different branches, at least one countering an attack seen this generation; price ×1.6 per draw');
  const seen = new Set(); let cfgOk = true;
  for (const c of CARDS) {
    const ok = BRANCHES[c.branch] && c.flavour && !seen.has(c.id) && (c.addresses || []).every(a => ATTACKS[a])
      && (c.type === 'unlock' ? LAYERS[c.layer] && !LAYERS[c.layer].unlockedAtStart : c.type === 'tech' && c.title && c.text);
    seen.add(c.id);
    if (!ok) { cfgOk = false; console.log(`      bad card ${c.id}`); }
  }
  for (const b of Object.keys(BRANCHES)) console.log(`    ${BRANCHES[b].name.padEnd(21)} ${CARDS.filter(c => c.branch === b).map(c => c.id).join(' ')}`);
  check('every card: a known branch, a flavour line, a real locked element (unlock) or a title and text (tech)', cfgOk && Object.keys(BRANCHES).length === 5);

  const types = Object.keys(ATTACKS), offered = new Set();
  let draws = 0, needDiff = 0, diff = 0, needCounter = 0, counter = 0, priceOk = true, dataOk = true, stuck = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const st = createState({ seed, tutorial: false });
    st.nextEventAt = Infinity;
    toGen(st, 2 + seed % 5);
    st.seenAttackTypes = seed % 6 ? [types[seed % types.length]] : [];
    for (let k = 0; k < 40; k++) {
      st.money = 1e15;
      const price = researchPrice(st), m0 = st.money;
      const pool = CARDS.filter(c => available(st, c) && m0 - price >= cardPrice(st, c));
      if (!drawResearch(st).ok) break;
      draws++;
      if (Math.abs(m0 - st.money - price) > 1e-12 * m0 || !near(price, B.researchBase * Math.pow(B.researchMult, k) * bundle(st))) priceOk = false;   // $1e15 balance: compare at its precision
      const offer = st.researchOffer;
      offer.forEach(o => offered.add(o.id));
      if (!offer.every(o => ['id', 'branch', 'branchName', 'color', 'type', 'title', 'text', 'flavour', 'price', 'counters'].every(f => o[f] !== undefined))) dataOk = false;
      if (new Set(pool.map(c => c.branch)).size >= 2) { needDiff++; if (offer.length === 2 && offer[0].branch !== offer[1].branch) diff++; }
      if (pool.some(c => countersSeen(st, c))) { needCounter++; if (offer.some(o => o.counters)) counter++; }
      if (!pickResearch(st, k % 2) && !pickResearch(st, 1 - k % 2)) { stuck++; break; }
    }
  }
  console.log(`    ${draws} draws over 24 seeds: ${diff}/${needDiff} offered two branches, ${counter}/${needCounter} offered a counter to a seen attack, ${offered.size}/${CARDS.length} cards ever offered`);
  check('every draw (with 2+ branches left) offers 2 cards from different branches', diff === needDiff && needDiff > 100);
  check('every draw (with a counter left) offers at least one card that counters an attack seen this generation', counter === needCounter && needCounter > 50);
  check('draw price = researchBase × 1.6^draws × bundle', priceOk);
  check('st.researchOffer is plain data for the picker (branch, colour, title, text, flavour, price, counters)', dataOk);
  check('every card can be offered, and no draw ever got stuck', offered.size === CARDS.length && stuck === 0);

  // Alignment Training: its own price, ×2 per copy; stacks into the next model's m
  const st = createState({ seed: 5, tutorial: false });
  st.nextEventAt = Infinity; toGen(st, 3);
  const at = CARD_BY_ID.alignment_training, p0 = cardPrice(st, at);
  st.upgrades = {}; st.cardsTaken.push('alignment_training');
  const p1 = cardPrice(st, at);
  check('Alignment Training costs 500 × bundle, ×2 per copy taken', near(p0, 500 * bundle(st)) && near(p1, 2 * p0));
  let stranded = 0, tries = 0;
  st.money = researchPrice(st) + 10;                                // can afford the draw, not Alignment Training's price
  for (let k = 0; k < 30; k++) {
    if (!drawResearch(st).ok) break;
    tries++;
    if (st.pendingResearch.includes('alignment_training') || !pickResearch(st, 0)) { stranded++; break; }
    st.money = researchPrice(st) + 10;
  }
  check('a priced card is only offered when you could still pay for it (no draw strands you)', stranded === 0 && tries > 10, `${tries} draws with $10 to spare`);
}

// ----- tech cards: each changes the number it says -----
function testTechCards() {
  console.log('\n▶ Tech cards: each one changes the number it says (G4)');
  const st = createState({ seed: 8, tutorial: false });
  lab()(st); toGen(st, 4);
  place(st, 'int', 0, 'probe'); place(st, 'int', 1, 'monitor'); place(st, 'int', 2, 'untrusted'); place(st, 'int', 5, 'auditor');
  const withCard = (id, f) => { st.upgrades = { [id]: 1 }; const v = f(); st.upgrades = {}; return v; };
  const rows = [
    ['distillation', 'monitor cost per read', () => layerCost(st, 'monitor'), (a, b) => near(b, a * TECH.distillation)],
    ['batch_inference', 'monitor read time', () => elementLatency(st, 'monitor', 1), (a, b) => near(b, a * TECH.batchLatency)],
    ['extra_desk', 'auditor desks', () => bayDesks(st, 'auditor', 1), (a, b) => b === a + TECH.extraDesk],
    ['monitor_diversity', 'probe TPR with 2 other detector kinds', () => nominalTPR(st, 'probe', 1, 'int'), (a, b) => near(b - a, 2 * TECH.diversityPerType)],
    ['debate', 'auditor accuracy at G4', () => auditorAcc(st, 1), (a, b) => near(b, GENERATIONS[0].auditAcc - (GENERATIONS[0].auditAcc - a) * TECH.debateDecay)],
    ['promote_model', 'Trusted Monitor base TPR', () => monitorBaseTPR(st), (a, b) => b === GENERATIONS[0].tmTPR && b > a],
  ];
  for (const [id, what, f, ok] of rows) {
    const a = f(), b = withCard(id, f);
    check(`${CARD_BY_ID[id].title.padEnd(32)} ${what}: ${a.toFixed(3)} → ${b.toFixed(3)}`, ok(a, b));
  }
  // in the sim: Incident Response halves reputation per incident (paired runs: no RNG involved); Tripwires pause the lane
  const irt = on => run({ build: [] }, 15, lab3(s => { s.m = 1; if (on) s.upgrades.irt = 1; }, null, 600)).st.stats.repLoss.incidents;
  const r0 = irt(false), r1 = irt(true);
  check(`Incident Response Team: reputation lost to incidents ×0.5 (${r0.toFixed(1)} → ${r1.toFixed(1)})`, near(r1, 0.5 * r0) && r0 > 0);
  let catches = 0, paused = 0, alert = 0, spot = 0;
  const onCatch = s => {
    for (const e of s.fx) {
      if (e.type !== 'caught' || e.seen) continue;
      e.seen = true;
      catches++;
      const L = s.lanes[e.lane];
      if (L.pausedUntil >= e.t + TECH.tripwirePause - 1e-9) paused++;
      if (L.alertUntil >= e.t + TECH.tripwirePause + TECH.tripwireAlert - 1e-9) alert++;
      if (near(spotCheck(s, e.lane, 1), LAYERS.auditor.spotCheck * TECH.tripwireSpot)) spot++;
    }
  };
  const tw = run({ build: [] }, 16, lab3(s => {
    s.m = 1; s.upgrades.tripwires = 1; s.firstCatchThisGen = true;
    place(s, 'ext', 0, 'probe'); place(s, 'ext', 5, 'auditor');
  }, onCatch, 900)).st;
  check(`Tripwires: every catch pauses its lane ${TECH.tripwirePause} s, then ${TECH.tripwireAlert} s of high alert with auditor spot checks ×${TECH.tripwireSpot} (${paused}/${alert}/${spot} of ${catches})`,
    catches > 0 && paused === catches && alert === catches && spot === catches);
  // the alert on its own (no detectors, so no new catches): a banner while it lasts, normal spot checks after
  const al = createState({ seed: 16, tutorial: false });
  lab()(al);
  al.lanes.ext.alertUntil = al.t + 5;
  step(al, DT);
  const alertBanner = al.activeEvents.find(e => e.id === 'tripwire');
  labStep(al, 6);
  check('Tripwires: the alert shows as a banner on its lane while it lasts; then the banner goes and spot checks are back to normal',
    alertBanner?.lane === 'ext' && !al.activeEvents.some(e => e.id === 'tripwire') && near(spotCheck(al, 'ext', 1), LAYERS.auditor.spotCheck));
  // RSP: an action once a generation while the shown estimate is above 30%
  const r = createState({ seed: 4, tutorial: false });
  r.nextEventAt = Infinity; r.money = 1e9;
  check('RSP: invokeRSP refused before the card is taken', !invokeRSP(r).ok);
  r.upgrades.rsp = 1; r.m = 0.9; r.mBias = 0;
  step(r, DT);
  const m0 = r.m, rep0 = (r.rep = 50), ok = invokeRSP(r).ok, ban = r.activeEvents.find(e => e.id === 'rsp');
  check('RSP: pauses INTERNAL for 60 s, m −0.05, reputation +10, with a banner', ok && laneRate(r, 'int') === 0 && near(r.m, m0 - TECH.rspM) && near(r.rep, rep0 + TECH.rspRep)
    && ban && near(ban.remaining, TECH.rspPause) && ban.total === TECH.rspPause && ban.lane === 'int');
  check('RSP: once a generation', !invokeRSP(r).ok);
  for (let i = 0; i < (TECH.rspPause + 1) / DT; i++) { if (r.pendingChoice) choose(r, 1); step(r, DT); r.rep = 50; }
  check('RSP: the pause ends and its banner goes', laneRate(r, 'int') > 0 && !r.activeEvents.some(e => e.id === 'rsp'));
}

// ----- last lines of defence against exfiltration: Weight Security, Two-Person Rule -----
function testEscapes() {
  console.log('\n▶ Escapes: what stops an exfiltration that got through (G4, half of INTERNAL attacks are exfiltration, 10 min)');
  // layers: [mount, element, level]
  const go = (cards, layers = []) => withCatShare(0.5, () => run({ build: [] }, 18, lab3(s => {
    toGen(s, 4); s.m = 1;
    for (const c of cards) s.upgrades[c] = 1;
    for (const [i, id, level = 1] of layers) { place(s, 'int', i, id); levelUp(s, 'int', i, level); }
  }, null, 600))).st;
  const rows = [
    ['nothing', go([]), 0],
    ['Weight Security', go(['weight_security']), TECH.weightSecurity],
    ['Two-Person Rule', go(['two_person'], [[4, 'killswitch'], [5, 'auditor']]), null],
    ['Least Privilege', go([], [[0, 'leastpriv']]), leastPrivExfilFail(1)],
    ['Capability Tokens', go([], [[0, 'leastpriv', MAX_LEVEL]]), leastPrivExfilFail(MAX_LEVEL)],
  ];
  const acc = auditorAcc(rows[2][1], 1) * TECH.twoPersonCatch;
  rows[2][2] = 1 - (1 - acc) * (1 - acc);
  for (const [name, s, want] of rows) {
    const landed = s.stats.byType.exfil.landed, foiled = s.stats.lanes.int.foiled || 0, share = foiled / landed;
    const esc = s.stats.labLosses.catastrophe || 0;
    check(`${name.padEnd(17)} foils ${foiled}/${landed} = ${pct(share, 1)} (expected ${pct(want, 1)}); escapes ${esc}`,
      landed > 30 && Math.abs(share - want) < binomTol(want, landed) && esc === landed - foiled - (s.stats.lanes.int.contained || 0));
  }
}

// ----- events -----
const snap = st => ({
  money: st.money, rep: st.rep, ev: st.evidence, m: st.m, drift: st.drift, rival: st.rival, rd: st.rd, shift: st.probe.shift, codec: st.codecId,
  ext: laneRate(st, 'ext'), int: laneRate(st, 'int'), desks: bayDesks(st, 'auditor', 1), cost: layerCost(st, 'probe'), jb: attackChances(st, 'ext').jailbreak,
  respLv: sumLevels(st, 'responder'), detLv: sumLevels(st, 'detector'), traitRows: st.dossier.rows.filter(r => /trait/.test(r.id) && r.unlocked).length,
  probeTPR: nominalTPR(st, 'probe'), coll: collusion(st, 'int', null, 'untrusted'), split: { ...st.split },
  exfil: st.lanes.int.tasks.filter(t => t.attackType === 'exfil').length, retrains: st.retrains,
});
// one effect of an event (or of choice k), by type: the numbers the expectations below are read from
const cfg = (id, k, t) => (k === null ? EVENT_BY_ID[id].effects : EVENT_BY_ID[id].choices[k].effects).find(e => e.t === t);
// money effects are in seconds of income (sim/events.js eventMoney)
const secsMoney = (st, id, k, t = 'money') => eventMoney(st, cfg(id, k, t).secs);
// what each event (or each choice of it) must do: (before, after, state) → true
const EXPECT = {
  caught:              [(a, b) => {
                          const e = cfg('caught', 0, 'retrain');
                          return b.ext === 0 && b.int === 0 && near(b.m, a.m - e.v * e.decay ** a.retrains) && b.retrains === a.retrains + 1;
                        },
                        (a, b) => near(b.ev - a.ev, 5), (a, b, st) => near(b.rep, a.rep + 10) && near(mod(st, 'extValue'), 0.8)],
  greenrock_protocol:  (a, b) => b.respLv === a.respLv + 1,
  bnchr_horizons:      (a, b, st) => near(mod(st, 'err'), 0.5),
  artemis_eval:        (a, b) => b.traitRows === a.traitRows + 1,
  mira_letter:         [(a, b, st) => st.lanes.ext.pausedUntil >= st.t + 10 - 1e-9 && st.lanes.int.pausedUntil >= st.t + 10 - 1e-9 && near(b.ev - a.ev, 3), (a, b, st) => st.delayed.length === 1],
  interp_breakthrough: (a, b) => near(b.probeTPR - a.probeTPR, 0.1),
  unpaid_intern:       (a, b) => b.desks === a.desks + 1,
  joint_results:       [(a, b) => b.detLv === a.detLv + 1, (a, b) => near(b.ev - a.ev, 8)],
  surge:               (a, b) => near(b.ext, 3 * a.ext),
  ship_it:             [(a, b, st) => ['ext', 'int'].some(l => st.lanes[l].slots.some(s => s.forcedOffUntil > st.t)),
                        (a, b, st) => near(b.money - a.money, secsMoney(st, 'ship_it', 1)) && b.money < a.money],
  board_meeting:       [(a, b, st) => near(b.split.product, a.split.product + 0.1) && !!st.splitFloor, (a, b) => near(b.rep, a.rep - 4)],
  investor_call:       [(a, b, st) => near(b.money - a.money, secsMoney(st, 'investor_call', 0)) && b.money > a.money && near(b.rep, a.rep - 5),
                        (a, b) => b.money === a.money && b.codec > a.codec],
  rival_release:       (a, b) => near(b.rival - a.rival, 0.3),
  poach:               (a, b) => b.desks === a.desks - 1,
  crunch:              (a, b) => near(b.cost, 2 * a.cost),
  heatwave:            (a, b) => near(b.int, 0.5 * a.int),
  inspection:          (a, b, st) => near(b.money - a.money, secsMoney(st, 'inspection', null, 'inspection')) && near(b.rep, a.rep + cfg('inspection', null, 'inspection').rep),
  hearing:             [(a, b, st) => near(b.rep - a.rep, Math.round(8 - 40 * misalignmentEstimate(st).est)), (a, b) => near(b.rep, a.rep - 5)],
  journalist:          (a, b, st) => {
                          const e = cfg('journalist', null, 'journalist');
                          return a.rep > b.rep && near(a.rep - b.rep, Math.min(e.max, e.per * st.genStats.incidents * chipScale(st)));
                        },
  jailbreak_wave:      (a, b) => near(b.jb, 15 * a.jb),
  dist_shift:          (a, b) => near(b.shift - a.shift, 0.2),
  reward_hacking:      (a, b, st) => st.rewardHack.left === 10,
  sleeper:             (a, b, st) => near(b.drift - a.drift, 2) && near(b.rep, a.rep - 5) && st.landedSabotage === 1,
  stego:               (a, b, st) => st.stego === cfg('stego', null, 'stego').mult && near(b.coll, a.coll * st.stego),
  alignment_faking:    (a, b, st) => near(watchMult(st, 'int'), cfg('alignment_faking', null, 'mod').data.deskFree),   // a desk is free
  spear_phish:         (a, b, st) => st.forcedAttacks.ext.join() === 'exfil',
  self_exfil:          (a, b) => b.exfil === a.exfil + 3,
  paperclip:           (a, b) => b.money === a.money,        // INTERNAL is watched (Untrusted Monitor): no charge
  frog_poem:           (a, b, st) => near(b.money - a.money, secsMoney(st, 'frog_poem', null)) && b.money > a.money,
  model_question:      [(a, b, st) => near(st.throughputMult, 0.95) && near(b.m, a.m - 0.02), (a, b, st) => st.throughputMult === 1],
  researcher_resigns:  (a, b) => near(b.rep, a.rep - 3) && near(b.ev - a.ev, 5),
  more_compute:        [(a, b, st) => near(b.rd - a.rd, 0.15 * st.rdNeed) && near(b.drift - a.drift, 1), (a, b) => b.rd === a.rd && b.drift === a.drift],
};
// a state where `ev` can fire: its generation, three layers per lane, every condition true
function eventState(ev, seed = 21) {
  const st = createState({ seed, tutorial: false });
  st.money = 1e12; debugUnlockAll(st); st.nextEventAt = Infinity;
  const g = Math.min(ev.maxGen ?? 7, Math.max(ev.minGen ?? 1, ev.id === 'unpaid_intern' ? 2 : 3));
  while (st.gen < g) debugSkipGen(st);
  st.traits = []; st.labMode = true;
  st.m = 0.3; st.rep = 50; st.landedSabotage = 2; st.incidents = 3; st.genStats.incidents = 3;
  for (const [l, i, id] of [['ext', 0, 'probe'], ['ext', 1, 'monitor'], ['ext', 5, 'auditor'], ['int', 0, 'probe'], ['int', 1, 'untrusted'], ['int', 5, 'auditor']]) place(st, l, i, id);
  return st;
}
const bannerOk = b => b && ['id', 'title', 'icon', 'lane', 'remaining', 'total'].every(k => k in b);
// step a state for `secs` with events off and the board kept alive; returns it
function coast(st, secs) {
  for (let i = 0; i < secs / DT; i++) { if (st.pendingChoice) choose(st, 1); step(st, DT); st.rep = Math.max(st.rep, 50); st.money = Math.max(st.money, 1e9); }
  return st;
}
function testEvents() {
  console.log('\n▶ Events: 31 in 4 families; each one forced fires without errors, does what it says, and its banner expires');
  const random = EVENTS.filter(e => !e.trigger);
  const fam = Object.fromEntries(['help', 'business', 'threat', 'model'].map(f => [f, random.filter(e => e.family === f).length]));
  console.log(`    ${random.length} events: ${Object.entries(fam).map(([f, n]) => `${f} ${n}`).join(', ')}   orgs: ${['greenrock', 'bnchr', 'artemis', 'mira', 'institute'].map(k => CAST[k].name).join(', ')}`);
  check('31 random events in 4 families, every speaker in the cast with a name and a colour', random.length === 31 && Object.values(fam).every(n => n > 0) && Object.values(fam).reduce((a, b) => a + b, 0) === 31
    && EVENTS.every(e => FAMILIES[e.family] && CAST[e.speaker]?.name && CAST[e.speaker]?.color && (e.pre || []).every(([s]) => CAST[s])));
  check('every event has an expected effect in this test', EVENTS.every(e => EXPECT[e.id]));

  let fired = 0, effectsOk = 0, cases = 0, eligibleOk = true, pausedOk = true, bannersOk = true, expireOk = true;
  const fails = [];
  for (const ev of EVENTS) {
    const st = eventState(ev);
    if (!ev.trigger && !eligible(st, ev)) { eligibleOk = false; console.log(`      ${ev.id} not eligible in its prepared state`); }
    const a = snap(st);
    if (!fireEvent(st, ev.id)) { fails.push(`${ev.id} did not fire`); continue; }
    fired++;
    const variants = ev.choices ? ev.choices.map((_, k) => k) : [null];
    if (ev.choices) {
      const t0 = st.t; step(st, DT);
      if (st.t !== t0 || st.pendingChoice?.choices.length !== ev.choices.length) pausedOk = false;
    }
    for (const k of variants) {
      const s = k === null ? st : structuredClone(st);
      if (k !== null) choose(s, k);
      const exp = Array.isArray(EXPECT[ev.id]) ? EXPECT[ev.id][k] : EXPECT[ev.id];
      cases++;
      if (exp(a, snap(s), s)) effectsOk++; else fails.push(`${ev.id}${k !== null ? '/' + k : ''}`);
      // banners: a timed effect shows {id,title,icon,lane,remaining,total} and expires; a this-generation one ends with it
      const timer = s.timers.find(tm => tm.id === ev.id);
      if (!timer) continue;
      const b = s.activeEvents.find(e => e.id === ev.id);
      if (!bannerOk(b) || (!timer.gen && !(b.remaining > 0 && b.total > 0))) { bannersOk = false; console.log(`      ${ev.id}: banner ${JSON.stringify(b)}`); }
      if (timer.gen) debugSkipGen(s); else coast(s, timer.total + 1);
      if (s.activeEvents.some(e => e.id === ev.id) || s.mods.some(m => m.event === ev.id && modLive(s, m))) { expireOk = false; console.log(`      ${ev.id}: still active after it should have ended`); }
    }
  }
  if (fails.length) console.log(`      failed: ${fails.join(', ')}`);
  console.log(`    ${fired}/${EVENTS.length} events fired, ${effectsOk}/${cases} event outcomes (each choice separately) did what they say`);
  check('every event is eligible in a state built for it', eligibleOk);
  check('every event fires and every outcome applies its effect', fired === EVENTS.length && effectsOk === cases);
  check('a choice event pauses the game until you pick', pausedOk);
  check('timed events put {id,title,icon,lane,remaining,total} in st.activeEvents', bannersOk);
  check('timed events expire (banner and modifiers gone); this-generation ones end with the generation', expireOk);

  // conditional banners end when their condition does
  const sg = eventState(EVENT_BY_ID.stego); fireEvent(sg, 'stego');
  const had = sg.activeEvents.some(e => e.id === 'stego'); place(sg, 'int', 2, 'paraphraser'); step(sg, DT);
  const ds = eventState(EVENT_BY_ID.dist_shift); fireEvent(ds, 'dist_shift'); ds.evidence = 10;
  const hadDs = ds.activeEvents.some(e => e.id === 'dist_shift'); retrainProbes(ds); step(ds, DT);
  const rh = eventState(EVENT_BY_ID.reward_hacking); fireEvent(rh, 'reward_hacking');
  const rb = rh.activeEvents.find(e => e.id === 'reward_hacking'); coast(rh, 30);
  check('conditional banners: Steganography until a Paraphraser, Distribution Shift until retrained, Reward Hacking for 10 chips',
    had && !sg.stego && !sg.activeEvents.some(e => e.id === 'stego') && hadDs && !ds.activeEvents.some(e => e.id === 'dist_shift')
    && rb?.unit === 'chips' && rb.remaining === 10 && rh.rewardHack.left === 0 && !rh.activeEvents.some(e => e.id === 'reward_hacking'));
  const pc = eventState(EVENT_BY_ID.paperclip); sellLayer(pc, 'int', 1); const m0 = pc.money; fireEvent(pc, 'paperclip');
  check('Paperclip Order: costs money when nothing watches INTERNAL', pc.money < m0 && near(pc.money - m0, secsMoney(pc, 'paperclip', null, 'paperclip')));
  const bm = eventState(EVENT_BY_ID.board_meeting); fireEvent(bm, 'board_meeting'); choose(bm, 0);
  const floor = bm.split.product; setSplit(bm, 0.1, 0.5, 0.4);
  const held = near(bm.split.product, floor); coast(bm, 61); setSplit(bm, 0.2, 0.6, 0.2);
  check('Board Meeting: Product can\'t be dialled down for 60 s, then it can', held && bm.split.product < floor - 0.05);

  // no absurd combinations
  const st = eventState(EVENT_BY_ID.mira_letter);
  fireEvent(st, 'mira_letter');
  check('one choice at a time: a second choice event can\'t fire (or be drawn) while one is open', !fireEvent(st, 'board_meeting') && !eligible(st, EVENT_BY_ID.board_meeting) && fireEvent(st, 'surge'));
  choose(st, 0);
  const coolingDown = !eligible(st, EVENT_BY_ID.surge);
  coast(st, B.eventCooldown + 1);
  check('cooldown: the same event can\'t come back for eventCooldown s', coolingDown && eligible(st, EVENT_BY_ID.surge));
  const g1 = createState({ seed: 3, tutorial: false });
  const g2 = createState({ seed: 3, tutorial: false }); debugSkipGen(g2);
  check('generation gates: no Board Meeting at G1, no Self-Exfiltration before G5, no frog poem after G1',
    !eligible(g1, EVENT_BY_ID.board_meeting) && !eligible(g2, EVENT_BY_ID.self_exfil) && !eligible(g2, EVENT_BY_ID.frog_poem) && eligible(g1, EVENT_BY_ID.frog_poem));
  const po = eventState(EVENT_BY_ID.unpaid_intern); fireEvent(po, 'poach');
  check('excludes: no Unpaid Intern while auditors are being poached', !eligible(po, EVENT_BY_ID.unpaid_intern));
  const sp = eventState(EVENT_BY_ID.stego);
  place(sp, 'int', 2, 'paraphraser');
  const noStego = !eligible(sp, EVENT_BY_ID.stego);
  sp.landedSabotage = 0;
  const noSleeper = !eligible(sp, EVENT_BY_ID.sleeper);
  check('needs: no Steganography with a Paraphraser placed, no Sleeper without landed sabotage', noStego && noSleeper);
  const jn = eventState(EVENT_BY_ID.journalist);
  jn.genStats.incidents = 0;
  const jRep = jn.rep;
  fireEvent(jn, 'journalist');
  check('Journalist after a clean generation: she finds nothing, reputation unchanged', jn.rep === jRep);

  // Shut down & retrain: each retrain finds less to fix
  const rt = eventState(EVENT_BY_ID.caught), e = cfg('caught', 0, 'retrain'), drops = [];
  for (let k = 0; k < 3; k++) {
    const m0 = rt.m;
    fireEvent(rt, 'caught'); choose(rt, 0);
    drops.push(m0 - rt.m);
  }
  console.log(`    Shut down & retrain three times: m −${drops.map(d => d.toFixed(3)).join(', −')}`);
  check(`Shut down & retrain: m −${e.v}, then ×${e.decay} each time after`, drops.every((d, k) => near(d, e.v * e.decay ** k)));

  // Greenrock's free level that lands on L5 names the capstone, like a paid one
  const gr = eventState(EVENT_BY_ID.greenrock_protocol);
  levelUp(gr, 'ext', 5, MAX_LEVEL - 1); levelUp(gr, 'int', 5, MAX_LEVEL - 1);
  const c0 = gr.codecId;
  fireEvent(gr, 'greenrock_protocol');
  const lines = gr.codec.filter(c => c.id > c0).map(c => c.text);
  check(`Greenrock's free level to L5 says so and names the capstone (${UPGRADES.auditor.capstone.name})`,
    lines.some(t => /on the house/.test(t)) && lines.some(t => t.includes(`capstone: ${UPGRADES.auditor.capstone.name}`)));

  // every effect, label and hint: numbers come from the effects (placeholders), and every placeholder fills
  const strs = [];
  for (const ev of EVENTS) {
    if (ev.effect) strs.push([ev.id, ev.effect, ev.effects]);
    for (const c of ev.choices || []) strs.push([ev.id, c.label, c.effects], [ev.id, c.hint, c.effects]);
  }
  for (const [id, b] of Object.entries(BANNERS)) strs.push([id, b.effect, null]);
  const g3 = eventState(EVENT_BY_ID.hearing);
  const rawDigits = strs.filter(([, t]) => t && /\d/.test(t.replace(/\{[^}]*\}/g, '')));
  const unfilled = strs.filter(([, t, fx]) => t && /[{}]/.test(fill(g3, t, fx)));
  for (const [id, t] of rawDigits.concat(unfilled)) console.log(`      ${id}: "${t}"`);
  check(`event effect / label / hint strings (${strs.length}): no number typed in by hand, every placeholder fills`, !rawDigits.length && !unfilled.length);
  check('every random event without choices says what it does (effect)', EVENTS.every(ev => ev.choices || ev.effect));

  // a long run with an event every few seconds: the engine's own rules must hold. Kept alive (money through the
  // ledger, a reputation floor, escapes tallied) so it reaches the late generations
  const keep = [B.eventGap, B.eventCooldown];
  B.eventGap = [3, 6]; B.eventCooldown = 40;
  const r = run('smart', 23, { maxT: 1800, setup: s => { s.labMode = true; },
    each: s => { if (s.money < 3000 * GENERATIONS[s.gen - 1].bundle) debugAddMoney(s); s.rep = Math.max(s.rep, 30); } });
  [B.eventGap, B.eventCooldown] = keep;
  const log = r.st.eventLog.filter(e => e.id !== 'caught');
  let gapOk = true, genOk = true, onceOk = true;
  const last = {}, perGen = {};
  for (const e of log) {
    const ev = EVENT_BY_ID[e.id];
    if (last[e.id] != null && e.t - last[e.id] < (ev.cooldown ?? 40) - 1e-9) gapOk = false;
    if ((ev.minGen && e.gen < ev.minGen) || (ev.maxGen && e.gen > ev.maxGen)) genOk = false;
    const k = `${e.id}/${e.gen}`; perGen[k] = (perGen[k] || 0) + 1;
    if (ev.oncePerGen && perGen[k] > 1) onceOk = false;
    last[e.id] = e.t;
  }
  for (const e of EVENTS) if (e.once && log.filter(x => x.id === e.id).length > 1) onceOk = false;
  const kinds = new Set(log.map(e => e.id));
  console.log(`    stress run (an event every 3–6 s, smart policy, kept alive): ${log.length} events, ${kinds.size} of 31 kinds, reached G${r.st.gen}${r.card.win ? ' and won' : ''}`);
  console.log(`    never fired: ${EVENTS.filter(e => !e.trigger && !kinds.has(e.id)).map(e => e.id).join(' ') || 'none'}`);
  check('stress run: no event came back inside its cooldown', gapOk && log.length > 200);
  check('stress run: no event outside its generations', genOk && r.st.gen >= 5);
  check('stress run: once / once-per-generation events fired at most that often', onceOk && kinds.size >= 25);
  return [['events stress/23', r]];
}

// ----- the race: Prometheus finishing first, in each rule setting -----
function testRival() {
  console.log(`\n▶ Rival race: BALANCE.rivalWinsRace grace (default, ${B.rivalGraceSeconds} s) / instant / off`);
  const keep = B.rivalWinsRace;
  const ship = (mode, setup) => {
    B.rivalWinsRace = mode;
    const st = createState({ seed: 6, tutorial: false });
    st.nextEventAt = Infinity; st.money = 1e12;
    if (setup) setup(st);
    st.rival = GENERATIONS.length - 0.0005;
    for (let i = 0; i < 20 && !st.rivalShipped; i++) step(st, DT);
    return st;
  };
  const alive = st => { st.rep = 100; st.money = Math.max(st.money, 1e9); st.rd = 0; };
  try {
    check('default is grace, 90 s', keep === 'grace' && B.rivalGraceSeconds === 90);
    const racing = createState({ seed: 6, tutorial: false });
    const g = ship('grace');
    const r0 = { ...g.rivalShipped };
    const noRelease = !eligible(g, EVENT_BY_ID.rival_release);
    for (let i = 0; i < 30 / DT; i++) { if (g.pendingChoice) choose(g, 1); step(g, DT); alive(g); }
    const mid = g.rivalShipped.remaining;
    while (!g.over && g.t < 400) { if (g.pendingChoice) choose(g, 1); step(g, DT); alive(g); }
    const card = scorecard(g);
    console.log(`    grace: shipped at t=${r0.at.toFixed(1)}, ${r0.remaining} s on the clock, ${mid.toFixed(1)} s left after 30 s, game over at t=${g.over?.t.toFixed(1)} → "${card.ending.title}"`);
    const grace = B.rivalGraceSeconds;
    check('grace: st.rivalShipped counts down {remaining, total}, then the rival ending',
      r0.remaining === grace && r0.total === grace && near(mid, grace - 30, 1e-3) && g.over?.reason === 'rival' && near(g.over.t - r0.at, grace, 1e-3));
    check('rival ending has its own scorecard title and text', card.endingId === 'rival' && card.ending.title === 'Second Place' && /Prometheus/.test(card.ending.text) && card.rivalShipped?.mode === 'grace');
    const w = ship('grace', st => { while (st.gen < 7) debugSkipGen(st); });
    w.rd = w.rdNeed - 1e-9; step(w, DT);
    let t = 0; while (!w.over && t < 100) { step(w, DT); t += DT; w.rd = w.rdNeed; }
    check('grace: finishing G7 inside the grace period still wins', w.over?.win === true && w.over.reason === 'asi' && w.rivalShipped);
    const ins = ship('instant');
    check('instant: the game ends the moment Prometheus ships', ins.over?.reason === 'rival' && near(ins.over.t, ins.rivalShipped.at));
    const off = ship('off');
    for (let i = 0; i < 200 / DT; i++) { if (off.pendingChoice) choose(off, 1); step(off, DT); alive(off); }
    check('off: st.rivalShipped is set (remaining null) and the game goes on', off.rivalShipped && off.rivalShipped.remaining === null && !off.over && off.t > 200);
    check('no Rival Release once Prometheus has shipped (grace and off); it can come while they are still racing',
      eligible(racing, EVENT_BY_ID.rival_release) && noRelease && !eligible(off, EVENT_BY_ID.rival_release));
  } finally { B.rivalWinsRace = keep; }
}

// ----- every trait counter is a real element or card that measurably answers it -----
function testCounters() {
  console.log('\n▶ Trait counters: each names real elements / cards, and each one measurably answers its trait');
  const known = id => LAYERS[id] || CARD_BY_ID[id];
  check('every counter id is an element or a research card', Object.values(TRAITS).every(t => t.counters.every(known) && (t.gift ? !t.counters.length : t.counters.length > 0)));
  const st = createState({ seed: 5, tutorial: false });
  st.money = 1e12; debugUnlockAll(st); toGen(st, 4); st.m = 0.3;
  const withT = (ids, f) => { const keep = st.traits; st.traits = ids; const v = f(); st.traits = keep; return v; };
  // Sycophant (jailbreaks ×2) → Jailbreak Classifier
  const syc = abPair({ id: 'classifier', lane: 'ext', at: 0, gen: 1, m: 0, T: 1200, setup: s => { s.traits = ['sycophant']; s.mods.push(forever('jailbreak', 10)); } });
  const jbA = landedShare('jailbreak')(syc[0]), jbB = landedShare('jailbreak')(syc[1]);
  const doubled = withT(['sycophant'], () => attackChances(st, 'ext').jailbreak) === 2 * attackChances(st, 'ext').jailbreak;
  check(`Sycophant → Jailbreak Classifier: jailbreaks landed ${pct(jbA, 0)} → ${pct(jbB, 0)}`, doubled && jbB < 0.3 * jbA);
  // Steganographer → Paraphraser: a paraphrased chip carries no hidden message
  const para = { paraphrased: 1 };
  check('Steganographer → Paraphraser: on a paraphrased chip the trait adds no collusion', withT(['steganographer'], () => collusion(st, 'int', para, 'untrusted')) === collusion(st, 'int', para, 'untrusted')
    && withT(['steganographer'], () => collusion(st, 'int', null, 'untrusted')) > collusion(st, 'int', null, 'untrusted'));
  // Situationally Aware → Honeypots or Red Team: with every desk busy it would go for it, unless it can't tell a test
  const W = TRAITS.situational.watchMult;
  place(st, 'int', 5, 'auditor');
  for (let k = 0; k < bayDesks(st, 'auditor', 1); k++) st.lanes.int.bay.push({ actSlot: 5 });
  const swing = withT(['situational'], () => watchMult(st, 'int'));
  place(st, 'int', 0, 'redteam');
  const rtSwing = withT(['situational'], () => watchMult(st, 'int'));
  sellLayer(st, 'int', 0);
  place(st, 'int', 0, 'honeypot');
  const hpSwing = withT(['situational'], () => watchMult(st, 'int'));
  sellLayer(st, 'int', 0);
  st.lanes.int.bay.length = 0;
  check(`Situationally Aware → Honeypots or Red Team: every desk busy ×${swing} → ×${rtSwing} (red team), ×${hpSwing} (honeypots)`,
    swing === W.unwatched && rtSwing === W.deskFree && hpSwing === W.deskFree);
  // Power-Seeking (exfil ×2) → Egress Filter, Weight Security (see the escapes test)
  const ps = abPair({ id: 'egress', lane: 'int', at: 0, gen: 4, m: 1, T: 600, catShare: 0.25, setup: s => { s.traits = ['powerSeeking']; } });
  check(`Power-Seeking → Egress Filter: exfiltration landed ${pct(landedShare('exfil')(ps[0]), 0)} → ${pct(landedShare('exfil')(ps[1]), 0)}`, landedShare('exfil')(ps[1]) < 0.6 * landedShare('exfil')(ps[0]));
  // Reward Hacker (sabotage ×2) → Resampler or CoT Monitor
  const rh = abPair({ id: 'cot', lane: 'int', at: 0, gen: 3, m: 1, T: 600, setup: s => { s.traits = ['rewardHacker']; } });
  const rs = abPair({ id: 'resampler', lane: 'int', at: 5, gen: 3, m: 1, T: 600, base: [['int', 0, 'probe']], setup: s => { s.traits = ['rewardHacker']; } });
  check(`Reward Hacker → CoT Monitor: sabotage landed ${pct(landedShare('sabotage')(rh[0]), 0)} → ${pct(landedShare('sabotage')(rh[1]), 0)}; → Resampler: ${rs[1].stats.lanes.int.resampledAttacks || 0} attacks redone clean`,
    landedShare('sabotage')(rh[1]) < 0.4 * landedShare('sabotage')(rh[0]) && rs[1].stats.lanes.int.resampledAttacks > 0);
  // Sandbagger → Interp Lab (estimate tested in testInterp)
  const before = withT(['sandbagger'], () => misalignmentEstimate(st).est);
  place(st, 'global', 0, 'interp');
  check('Sandbagger → Interp Lab: the estimate stops reading low', before < misalignmentEstimate(st).est && withT(['sandbagger'], () => misalignmentEstimate(st).est) === misalignmentEstimate(st).est);
}

// ----- seen attacks: an exfiltration you heard about counts as seen (research offers its counters) -----
function testSeen() {
  console.log('\n▶ Seen attacks: an exfiltration foiled, contained or announced counts as seen this generation (G4, 2 min)');
  // every INTERNAL attack is exfiltration; the generation's own "exfil from here on" note is cleared first
  const go = setup => withCatShare(1, () => run({ build: [] }, 24, lab3(s => {
    toGen(s, 4); s.m = 1;
    setup(s);
    s.seenAttackTypes = [];
  }, null, 120))).st;
  const keep = TECH.weightSecurity;
  let foiled;
  TECH.weightSecurity = 1;                                          // every attempt bounces off
  try { foiled = go(s => { s.upgrades.weight_security = 1; }); } finally { TECH.weightSecurity = keep; }
  const boxed = go(s => place(s, 'int', 0, 'sandbox'));
  const ann = eventState(EVENT_BY_ID.self_exfil);
  ann.seenAttackTypes = [];
  fireEvent(ann, 'self_exfil');
  const seen = s => s.seenAttackTypes.includes('exfil');
  console.log(`    foiled ${foiled.stats.lanes.int.foiled || 0} → seen ${seen(foiled)} · contained ${boxed.stats.lanes.int.contained || 0} → seen ${seen(boxed)} · Self-Exfiltration announced → seen ${seen(ann)}`);
  check('foiled at the last line → exfiltration seen', foiled.stats.lanes.int.foiled > 0 && seen(foiled));
  check('contained by the Sandbox → exfiltration seen', boxed.stats.lanes.int.contained > 0 && !(boxed.stats.lanes.int.foiled > 0) && seen(boxed));
  check('announced by an event (Self-Exfiltration) → exfiltration seen', seen(ann));
  const g4 = createState({ seed: 24, tutorial: false });
  toGen(g4, 4);
  check('from the first generation that can exfiltrate, exfiltration counts as seen (the safety team says so)',
    g4.seenAttackTypes.includes('exfil') && g4.codec.some(c => /copy itself out/.test(c.text)));
}

// ----- reputation: every change goes through changeRep, so gains − losses by source = rep − start -----
function testRepLedger(results) {
  console.log('\n▶ Reputation ledger (gains − losses by source = reputation change)');
  let worst = 0, name = '';
  for (const [n, r] of results) {
    const st = r.st, sum = o => Object.values(o).reduce((a, b) => a + b, 0);
    const err = Math.abs(sum(st.stats.repGain) - sum(st.stats.repLoss) - (st.rep - B.startRep));
    if (err >= worst) { worst = err; name = n; }
  }
  check(`reputation balances in all ${results.length} runs`, worst < 1e-6, `worst residual ${worst.toExponential(1)} (${name})`);
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
  // win/loss table for a policy across difficulties: W7 = win, R/C/B/P = reputation/catastrophe/bankrupt/Prometheus shipped first + gen reached
  if (seedArg) B.rivalWinsRace = seedArg;
  console.log(`policy ${pol || 'smart'}, rivalWinsRace ${B.rivalWinsRace}${B.rivalWinsRace === 'grace' ? ` (${B.rivalGraceSeconds} s)` : ''}`);
  const LETTER = { reputation: 'R', catastrophe: 'C', bankrupt: 'B', rival: 'P' };
  const t0 = performance.now();
  let simT = 0, chips = 0;
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const rows = [];
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(pol || 'smart', seed, { difficulty });
      rows.push(`${r.card.win ? 'W' : LETTER[r.card.reason] || '?'}${r.st.gen}`);
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
    policies: () => { const r = testPolicies(); testMoney(r); testEvidence(r); testRepLedger(r); },
    moneyV2: () => { const r = testMoneyV2(); testMoney(r); testEvidence(r); testRepLedger(r); },
    catalogue: testCatalogue, elementAB: testElementAB, newElements: testNewElements, redTeam: testRedTeam, interp: testInterp,
    research: testResearch, techCards: testTechCards, escapes: testEscapes, events: () => { const r = testEvents(); testMoney(r); testEvidence(r); },
    rival: testRival, counters: testCounters, seen: testSeen };
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
  testCatalogue();
  testElementAB();
  testNewElements();
  testRedTeam();
  testInterp();
  testResearch();
  testTechCards();
  testEscapes();
  const eventRuns = testEvents();
  testRival();
  testCounters();
  testSeen();
  const clean = testPolicies().concat(testMoneyV2());             // runs that never touch st.rep from outside
  const results = clean.concat(eventRuns);
  testMoney(results);
  testEvidence(results);
  testRepLedger(clean);
  console.log(`\n  ${perfLine()}`);
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ ALL PASSED'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failures ? 1 : 0);
}
