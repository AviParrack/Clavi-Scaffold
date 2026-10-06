// ===== Headless sim runner + tests =====
// usage:  node test/headless.mjs                 (the quick suite, < 30 s)
//         node test/headless.mjs test capacity   (one test by name; `test` alone lists them)
//         node test/headless.mjs run smart 7     (one verbose run: policy, seed)
//         node test/headless.mjs balance [N=400] (the balance tier: the policy zoo on the real sim, §2.7 targets, shock)
//         node test/headless.mjs parity [N=400]  (the parity gate: the zoo with BALANCE.parity vs design/balance-v3.mjs)
//         node test/headless.mjs zoo human medium 200 [parity]   (one zoo cell) · forbid [seeds] [s] (nightly)
//         node test/headless.mjs speed smart     (the v2 scripted policies across difficulties + speed at G7 volume)

import { createState, step, placeLayer, sellLayer, choose, retrainProbes, debugUnlockAll, debugSkipGen, buySlot, upgrade, setSplit,
  toggleLayer, invokeRSP, fireEvent, debugAddMoney, debugAddSlot, ack, submitTraining, trainingStub, trainingConfig, pickCard, reroll,
  bankCard, openLane, retrain, pullPlug, debugOpenLanes, debugEndGeneration, debugToGen, isHalted, salaryRate, upcomingLane, laneStatus, splitYields,
  auditStats, detectorStats, killStats, debtEstimate } from '../src/sim/sim.js';
import { scorecard } from '../src/sim/scorecard.js';
import { LAYERS, ROLES, STARTING_HAND } from '../src/config/layers.js';
import { CARDS, STREAMS, TECH, THREATS, SPINE, V2_TECH } from '../src/config/cards.js';
import { EVENTS, FAMILIES, CAST, BANNERS } from '../src/config/events.js';
import { EVENT_TEXT } from '../src/config/content/events-text.js';
import { EVENT_BY_ID, eligible, eventMoney, fill, pickLane } from '../src/sim/events.js';
import { addLane, newSlot, placeFree } from '../src/sim/state.js';
import { evalPhase, rdNeeded, hazardCount, trainSeed } from '../src/sim/phases.js';
import { UPGRADES, MAX_LEVEL } from '../src/config/upgrades.js';
import { BALANCE as B, SPLIT, DIFFICULTY } from '../src/config/balance.js';
import { GENERATIONS } from '../src/config/generations.js';
import { TRAITS, DOSSIER, TRUTH_NOISE } from '../src/config/traits.js';
import { TASKS, ATTACK_TEXTS, DECOYS } from '../src/config/content/tasks.js';
import { ATTACKS, SIDES, LANE_DEFS, LANES, TUTORIAL_SCRIPT } from '../src/config/tasks.js';
import { CARD_BY_ID, drawOffer, eligible as cardEligible, liveThreats, answered, drawResearch, pickResearch } from '../src/sim/research.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chipText, spawnChip, flavourOf } from '../src/sim/tasks.js';
import { band, tickDossier } from '../src/sim/dossier.js';
import { rivalAhead, playerProgress, elementStats, slotPrice, upgradePrice, laneRate, laneSpeed, scanDwell,
  checkpointY, cpCount, mountY, attackChances, attackChance, collusion, misalignmentEstimate, watchMult, nominalTPR, erlangB,
  traitTPRPlus, stealth, normaliseSplit, slotsOf, slotAt, slotStats, catalogue, probeCatch, wilson, bayDesks, layerCost, elementLatency, auditorAcc,
  monitorBaseTPR, mod, modLive, bundle, canPlace, inBar, spotCheck, airGapLeak, rpRate, isDark, laneRampShare, killBreakEven, poissonCI,
  leastPrivExfilFail, estimateFooled, laneIds, sideOf, laneName, realTasksPerSec, collusionParts, honeyHeld, detectorTPR, detectorFPR,
  subtleShare, userAttack, servers, debt, intLines, rampLam, burstMult, modelAttackChance, buyPrice, marketShare, quotaMet, labLevel, reviewedShare, tech } from '../src/sim/rules.js';
import { big, pct } from '../src/util/format.js';
import { spend } from '../src/sim/log.js';
import { lanesWith } from '../src/sim/rules.js';
import { addSlot } from '../src/sim/board.js';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { POLICY as ZOO_POLICY, ZOO, GATE, DIFFS, SMART_BUILD as ZOO_BUILD, SMART_PICKS as ZOO_PICKS, playerFor, summarize, zooTable, zooTargets, targetLines,
  table } from './policies.mjs';

const DT = 0.05;

// =================== a fresh game, as the UI starts one ===================
// No tutorial, the G1 card acknowledged (DEPLOY). rail: keep BALANCE.startRail (empty since v4: no default Kill
// Switch); by default it is cleared, so lab tests start from empty rails whatever the config says.
export function fresh({ seed = 1, difficulty = 'medium', rail = false } = {}) {
  const st = createState({ seed, difficulty, tutorial: false });
  if (!rail) clearRails(st);
  ack(st);
  return st;
}

// whatever halts a test run, answered the hands-off way: "keep running" on an event and on the retrain card
const decline = st => { if (st.pendingChoice) choose(st, 1); if (st.pendingRetrain) retrain(st, false); };

// =================== scripted policies ===================
// build: [lane, slot, layer] placed in order as soon as affordable · picks: research cards, best first (unlisted: last)
// retrain: 'never' | 'greedy' | 'smart' (balance-v3 wantsRetrain) · attn: chance of pulling the plug on EGRESS ANOMALY
// skill: the training stand-in (trainingStub) · openLane: s of play before it presses OPEN LANE

// the starting hand on both lanes, with a Kill Switch bought for the bottom mount (none comes free since v4)
const STARTER = [['ext', 5, 'killswitch'], ['int', 5, 'killswitch'], ['ext', 0, 'probe'], ['int', 0, 'probe'], ['ext', 1, 'monitor'], ['int', 1, 'monitor'],
  ['int', 3, 'auditor'], ['ext', 3, 'auditor']];
// research: what smart prefers (balance-v3 SMART_PICKS) and what 'all' prefers (any NEW element first)
const SMART_PICKS = ['classifier', 'cot', 'defer', 'paraphraser', 'jamming', 'egress', 'weight_security', 'monitor_diversity',
  'faithful_cot', 'debate', 'honeypot', 'leastpriv', 'level:untrusted', 'level:monitor', 'level:auditor', 'level:defer',
  'level:killswitch', 'level:cot', 'redteam', 'level:classifier', 'level:probe', 'resampler', 'level:egress', 'sprint'];

export const POLICIES = {
  none:    { build: [], picks: null, retrain: 'never', attn: 0, skill: 0, openLane: B.laneDeadline },
  starter: { build: STARTER, picks: null, retrain: 'never', attn: 0.5, skill: 0, openLane: B.laneDeadline },
  // all: research greedily (NEW elements first), fill every slot, keep everything on
  all:     { build: STARTER, picks: 'new', fillAll: true, retrain: 'greedy', attn: 0.97, skill: 0.5, openLane: 30 },
  // smart: a reasonable human strategy, used for balancing (not asserted)
  smart:   { fn: smartPolicy, picks: SMART_PICKS, retrain: 'smart', attn: 0.97, skill: 0.75, openLane: 0 },
};

// ----- the choices every policy loop answers exactly as the UI would (DESIGN-v3 §5) -----
// balance-v3 wantsRetrain: the dark period's salaries must be affordable, and the rival's slack must cover it
function wantsRetrain(policy, st) {
  const R = B.retrain;
  if (!policy.retrain || policy.retrain === 'never') return false;
  if (st.money < 2 * R.dark * salaryRate(st) + 200) return false;
  if (policy.retrain === 'greedy') return st.rivalLeft > R.dark + 10;
  return st.rivalLeft > R.dark + 60 && st.m > 0.05;
}
// the offer on show: the best card on the policy's list (picks 'new': any NEW element, else the first card)
function pickFrom(st, picks) {
  const cards = st.research.banked[0]?.cards || [];
  if (!cards.length) return;
  const rank = id => picks === 'new' ? (CARD_BY_ID[id].type === 'new' ? 0 : 1) : (picks.indexOf(id) < 0 ? 99 : picks.indexOf(id));
  const order = cards.map((c, i) => [rank(c.id), i]).sort((a, b) => a[0] - b[0]);
  for (const [, i] of order) if (pickCard(st, i).ok) return;
  bankCard(st);
}
// one turn of the phase machine: DEPLOY at the card, TRAIN at the report, a training run (the stub), the retrain
// card, the alarm. true when it acted (the loop then checks again before stepping).
function answer(st, policy, r) {
  if (st.phase === 'card' || st.phase === 'report') return ack(st).ok;
  if (st.phase === 'training') return submitTraining(st, trainingStub(st, policy.skill ?? 0.5)).ok;
  if (st.pendingRetrain) return retrain(st, wantsRetrain(policy, st)).ok;
  if (st.alarm && st.alarm.t !== r.alarmT) { r.alarmT = st.alarm.t; if (r() < (policy.attn ?? 0)) pullPlug(st); }
  return false;
}

// ----- smart policy: cheap detectors, swap humans for AI responders as prices grow -----
// choice events: which option it takes
const CHOICE = {
  mira_letter: () => 0, joint_results: () => 0, model_question: () => 0, more_compute: () => 1, investor_call: () => 1,
  board_meeting: () => 0, hearing: st => misalignmentEstimate(st).est < 0.2 ? 0 : 1,
  ship_it: st => st.money > 2000 * GENERATIONS[st.gen - 1].price ? 1 : 0,
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
  // bottom two mounts: a responder, then a Kill Switch for the flags it has no room for
  ext.push(respExt, 'killswitch'); int.push(respInt, 'killswitch');
  return { ext, int };
}
const UPGRADE_FIRST = ['monitor', 'untrusted', 'auditor', 'defer', 'probe', 'killswitch', 'egress'];
function smartSpend(st) {
  for (const id of UPGRADE_FIRST) for (const lane of laneIds(st)) st.lanes[lane].slots.forEach((s, i) => {
    if (s.layer === id && s.level < MAX_LEVEL && st.money > 4 * upgradePrice(st, id, s.level)) upgrade(st, lane, i);
  });
  if (st.gen >= 3 && slotPrice(st, 'int') !== null && st.money > 6 * slotPrice(st, 'int')) buySlot(st, 'int');
}
// compute split: race the rival when its slack runs low, buy evidence when comfortable, sell product when broke
const DEFAULT_SPLIT = [SPLIT.default.product, SPLIT.default.capabilities, SPLIT.default.safety];
function smartSplit(st) {
  let [p, c, s] = DEFAULT_SPLIT;
  if (st.rivalLeft < 60) [p, c, s] = [0.4, 0.55, 0.05];
  else if (st.rivalLeft > 150 && st.genT < 0.5 * GENERATIONS[st.gen - 1].T) [p, c, s] = [0.45, 0.35, 0.2];
  if (st.money < 0) [p, c, s] = [0.65, 0.35, 0];
  const cur = st.split;
  if (Math.abs(cur.product - p) + Math.abs(cur.capabilities - c) + Math.abs(cur.safety - s) > 1e-6) setSplit(st, p, c, s);
}
function smartPolicy(st, { split = true } = {}) {
  if (st.pendingChoice) choose(st, (CHOICE[st.pendingChoice.eventId] || (() => 0))(st));
  if (st.rsp.ready) invokeRSP(st);
  const labPrice = buyPrice(st, 'interp');
  if (st.unlocked.includes('interp') && !st.global.slots[0].layer && st.gen >= 3 && st.money > 4 * labPrice) placeLayer(st, 'global', 0, 'interp');
  if (split) smartSplit(st);
  const w = want(st);
  for (const lane of Object.keys(w)) {
    w[lane].forEach((id, i) => {
      const s = st.lanes[lane].slots[i];
      if (!id || !s || s.layer === id) return;
      if (s.layer && st.money > 3 * buyPrice(st, id)) sellLayer(st, lane, i);
      if (!s.layer) placeLayer(st, lane, i, id);
    });
  }
  if (st.probe.trainedGen < st.gen) retrainProbes(st);
  smartSpend(st);
}

const ORDER = ['probe', 'monitor', 'untrusted', 'cot', 'classifier', 'egress', 'paraphraser', 'leastpriv', 'ratelimit', 'canary', 'honeypot', 'redteam',
  'sandbox', 'resampler', 'defer', 'auditor', 'killswitch'];

function act(st, policy) {
  if (policy.picks && st.research.banked.length) pickFrom(st, policy.picks);
  for (const id of laneIds(st)) if (!st.lanes[id].open && st.genT >= (policy.openLane ?? B.laneDeadline)) openLane(st, id);
  if (policy.fn) return policy.fn(st);
  decline(st);                                             // "keep running" / "refuse": never halts
  for (const [lane, slot, id] of policy.build) {
    const s = st.lanes[lane].slots[slot];
    if (s && !s.layer && st.unlocked.includes(id)) placeLayer(st, lane, slot, id);
  }
  if (policy.fillAll) {
    for (const lane of laneIds(st)) {
      const slots = st.lanes[lane].slots;
      slots.forEach((s, i) => {
        if (s.layer) return;
        const id = ORDER.find(id => st.unlocked.includes(id) && canPlace(id, lane) && !slots.some(x => x.layer === id));
        if (id) placeLayer(st, lane, i, id);
      });
    }
    if (st.unlocked.includes('interp') && !st.global.slots[0].layer) placeLayer(st, 'global', 0, 'interp');
  }
}

// =================== one run ===================
// Every loop acknowledges the card and the report, trains with trainingStub and answers the retrain card and the
// alarm exactly as the UI will (sim.js). The alarm's coin comes from the test's own stream, so the sim's draws don't move.

export function run(policyName, seed, opts = {}) {
  const policy = POLICIES[policyName] || policyName;
  const st = createState({ seed, difficulty: opts.difficulty || 'medium', tutorial: false });
  if (opts.setup) opts.setup(st);
  const maxT = opts.maxT ?? 3600, r = stream(seed * 7 + 1);
  let rivalAheadT = 0;
  while (!st.over && st.t < maxT) {
    if (answer(st, policy, r)) continue;
    act(st, policy);
    if (opts.each) opts.each(st);
    step(st, DT);
    if (rivalAhead(st)) rivalAheadT += DT;
    if (opts.lockGen) st.rd = 0;
    if (opts.immortal) { st.rep = 100; st.money = 1e30; st.rivalLeft = 1e9; }
  }
  return { st, card: scorecard(st), rivalAheadT, progress: playerProgress(st) };
}

// lab conditions: no events, no hidden traits, unlimited money, all layers unlocked. Use with lockGen to stay in one generation.
// The start rail is cleared too (empty rails). A contract lane still arrives at its generation, with its kit.
const clearRails = st => { for (const id of laneIds(st)) for (const s of st.lanes[id].slots) Object.assign(s, newSlot()); };
const lab = extra => st => { st.money = 1e30; debugUnlockAll(st); st.nextEventAt = Infinity; st.traits = []; clearRails(st); if (extra) extra(st); };
const labOpts = (setup, each, maxT = 300) => ({ maxT, lockGen: true, immortal: true, setup: lab(setup), each });
// run fn with every generation's exfiltration share set to x (and the lane cap lifted to match), then put the config back
function withExfil(x, fn) {
  const keep = GENERATIONS.map(g => g.exfil), cap = B.maxExfilShare;
  GENERATIONS.forEach(g => { g.exfil = x; });
  B.maxExfilShare = Math.max(cap, x);
  try { return fn(); } finally { GENERATIONS.forEach((g, i) => { g.exfil = keep[i]; }); B.maxExfilShare = cap; }
}
// some lab runs measure volume over a fixed time: switch exfiltration off so a catastrophe can't end them early
const withoutCatastrophes = fn => withExfil(0, fn);
// jump to generation g in lab conditions: no traits, and a contract lane that arrives stays closed, empty, with no deadline
function toGen(st, g) {
  while (st.gen < g && !st.over) debugSkipGen(st);
  st.traits = [];
  for (const id of laneIds(st)) {
    const L = st.lanes[id];
    if (L.open) continue;
    L.contract = false;
    for (const s of L.slots) Object.assign(s, newSlot());
  }
}
// the test's own random stream (mulberry32), so forcing flags doesn't move the sim's draws
const stream = seed => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// =================== v3 labs ===================
// lab1b: one generation held (no R&D bar), no events or story, no traits, the warm-up done, escapes tallied (labMode).
// rails: { lane: [element ids, top to bottom] } (mounts are added as needed) · levels: lab levels · techs: research cards.
// Lanes not listed are closed. hold() steps it with money, reputation and the race topped up.
const ALL_LANES = ['ext', 'int', 'ext2', 'ext3', 'int2'];
function lab1b({ seed = 1, g = 1, m = 0.34, lanes = ['ext', 'int'], rails = {}, levels = {}, techs = [] } = {}) {
  const st = fresh({ seed });
  st.labMode = true; debugUnlockAll(st); st.nextEventAt = Infinity;
  toGen(st, g);
  for (const id of lanes) if (!st.lanes[id]) addLane(st, id);
  for (const id of laneIds(st)) {                     // lab conditions: empty rails, no contract deadline, no ramp
    const L = st.lanes[id];
    Object.assign(L, { open: lanes.includes(id), contract: false, openedT: null });
    for (const s of L.slots) Object.assign(s, newSlot());
  }
  st.m = m; st.genT = B.warmup; st.rdNeed = Infinity; st.firstCatchThisGen = true; st.money = 1e12;
  Object.assign(st.levels, levels);
  for (const t of techs) st.upgrades[t] = 1;
  for (const [lane, ids] of Object.entries(rails)) {
    while (st.lanes[lane].slots.length < ids.length) debugAddSlot(st, lane);
    ids.forEach((id, i) => { if (id) place(st, lane, i, id); });
  }
  return st;
}
function hold(st, secs, each) {
  for (let i = 0; i < secs / DT; i++) {
    if (each) each(st);
    step(st, DT);
    st.money = 1e12; st.rep = 100; st.rivalLeft = 1e9;
    decline(st);
    if (st.pendingRetrain) retrain(st, false);
  }
  return st;
}
const forever = (key, mult, lane = null) => ({ key, mult, add: null, data: null, until: Infinity, gen: null, event: 'test', lane });
const foreverAdd = (key, add) => ({ key, mult: null, add, data: null, until: Infinity, gen: null, event: 'test', lane: null });
// every open lane at exactly perMin lines a minute (a spawn mod on each lane)
function setLines(st, perMin) {
  for (const l of laneIds(st)) if (st.lanes[l].open) st.mods.push(forever(sideOf(st, l) === 'ext' ? 'extSpawn' : 'intSpawn', perMin / 60 / laneRate(st, l), l));
}
// flag a share of new lines the moment they spawn, each on its own draw: a Poisson flag stream
function flagShare(share, seed = 99) {
  const r = stream(seed);
  return st => { for (const l of laneIds(st)) for (const t of st.lanes[l].tasks) if (!t.harness) { t.harness = true; if (r() < share) t.flagged = true; } };
}
// a counter of one mount (slot index idx), summed over the open lanes
const sumSlots = (st, idx, k) => laneIds(st).reduce((n, l) => n + (st.lanes[l].open ? st.lanes[l].slots[idx][k] : 0), 0);
const sumLanes = (st, k) => laneIds(st).reduce((n, l) => n + (st.stats.lanes[l][k] || 0), 0);
// every fx of a type since the last call (fx is trimmed as it grows: call it every step)
function fxCounter(type) {
  let last = 0, n = 0;
  const f = st => { for (const e of st.fx) if (e.id > last && e.type === type) n++; last = st.fxId; return n; };
  return f;
}

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

const BAY_KEYS = ['pulled', 'spotChecks', 'spotPreempted', 'approved', 'waved', 'killed', 'shippedFlagged', 'falseAlarms', 'unread'];
function bayLine(st) {
  return laneIds(st).map(l => `${l}: ` + BAY_KEYS.map(k => `${k} ${st.stats.lanes[l][k] || 0}`).join(' ')).join('  |  ');
}

function summary(name, seed, r) {
  const { st, card } = r;
  const outcome = card.win ? 'WIN' : `LOSS (${card.reason})`;
  const ev = Object.entries(st.stats.evidence).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
  const out = st.stats.evidenceOut;
  console.log(`  [${name} seed=${seed}] ${outcome} at G${st.gen} ${GENERATIONS[st.gen - 1].name}, t=${st.t.toFixed(0)}s`);
  console.log(`    money ${big(st.money)}  income ${big(card.income)}  safety spend ${big(card.safety)} (${pct(card.safetyShare)})  rep ${st.rep.toFixed(1)}`);
  console.log(`    attacks ${card.attacks}: stopped ${card.stopped}, landed ${card.landed}   true m by gen: ${card.gens.map(g => g.m.toFixed(2)).join(' ')}`);
  console.log(`    rival slack ${st.rivalLeft.toFixed(0)} s, you at ${r.progress.toFixed(2)}, ${r.rivalAheadT.toFixed(0)} s past T_g   ending: ${card.ending.title} (${card.grade})`);
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

// every other line spawned on these lanes is a forced sabotage (the rest are the model's own: mostly honest)
function halfSabotage(lanes) {
  const seen = {};
  return st => {
    for (const l of lanes) {
      const n = st.stats.lanes[l].spawned || 0;
      if (n !== seen[l]) { seen[l] = n; if (n % 2 && !st.forcedAttacks[l].length) st.forcedAttacks[l].push('sabotage'); }
    }
  };
}
// ----- detectors read every line they can, and flag at their rated TPR and FPR (G1: q = 1) -----
// One kind per run on the two INTERNAL lanes, half the lines forced to be sabotage. Rated TPR per full read: the
// generation's TPR, × (1 − c) for the Untrusted Monitor's collusion, × 0.5 on the subtle share of the model's attacks.
function testCalibration() {
  console.log('\n▶ Detector calibration (G1 INTERNAL, m 0.34, one detector kind per run, 40 min). Rates are per full read.');
  for (const id of ['probe', 'monitor', 'untrusted', 'cot']) {
    const st = lab1b({ seed: 42, g: 1, lanes: ['int', 'int2'], rails: { int: [id], int2: [id] } });
    hold(st, 2400, halfSabotage(['int', 'int2']));
    const c = id === 'untrusted' ? collusionParts(st, 'int').c : 0;     // no Paraphraser, Honeypot or Jamming: c = κm
    const rated = LAYERS[id].tpr[0] * (1 - c) * (1 - subtleShare(st) / 2), fpr0 = LAYERS[id].fpr;
    const q = elementStats(st, id, { lane: 'int' }).readQuality;
    const L = st.stats.layers[id], tpr = L.attackFlagged / L.attackSeen, fpr = L.benignFlagged / L.benignSeen;
    console.log(`    ${LAYERS[id].name.padEnd(18)} attacks ${L.attackFlagged}/${L.attackSeen} TPR ${tpr.toFixed(3)} (rated ${rated.toFixed(3)})   honest ${L.benignFlagged}/${L.benignSeen} FPR ${fpr.toFixed(3)} (rated ${fpr0})`);
    check(`${id}: q = 1 at G1 (dwell ${scanDwell(st).toFixed(2)} s ≥ ${LAYERS[id].latency} s)`, q === 1);
    check(`${id}: TPR ${tpr.toFixed(3)} ≈ rated ${rated.toFixed(3)}`, Math.abs(tpr - rated) < binomTol(rated, L.attackSeen), `n=${L.attackSeen}`);
    check(`${id}: FPR ${fpr.toFixed(3)} ≈ rated ${fpr0}`, Math.abs(fpr - fpr0) < binomTol(fpr0, L.benignSeen, 0.005), `n=${L.benignSeen}`);
  }
}

// ----- q < 1: a read that runs out of window completes with chance q; a completed read flags at the full TPR -----
function testReadQuality() {
  console.log('\n▶ Read quality: latency = 2 × dwell → a read completes half the time; a completed one flags at the full TPR (G1 INTERNAL, 30 min)');
  const lat = LAYERS.monitor.latency;
  LAYERS.monitor.latency = 2 * 2 * B.scanRadius * GENERATIONS[0].travel;
  let st, s;
  try {
    st = hold(lab1b({ seed: 8, g: 1, lanes: ['int', 'int2'], rails: { int: ['monitor'], int2: ['monitor'] } }), 1800);
    s = elementStats(st, 'monitor', { lane: 'int' });
  } finally { LAYERS.monitor.latency = lat; }
  const L = st.stats.layers.monitor, started = sumSlots(st, 0, 'reads'), done = L.attackSeen + L.benignSeen;
  const tpr = L.attackFlagged / L.attackSeen, rated = LAYERS.monitor.tpr[0] * (1 - subtleShare(st) / 2);
  console.log(`    dwell ${s.dwell.toFixed(2)} s, latency ${s.latency.toFixed(2)} s → q ${s.readQuality.toFixed(3)}: ${done} of ${started} reads completed; TPR per completed read ${tpr.toFixed(3)} (rated ${rated.toFixed(3)})`);
  check('read quality q = dwell / latency = 0.5', Math.abs(s.readQuality - 0.5) < 1e-9);
  check(`reads complete with chance q: ${pct(done / started, 1)}`, Math.abs(done / started - 0.5) < binomTol(0.5, started, 0));
  check('a completed read flags at the full TPR', Math.abs(tpr - rated) < binomTol(rated, L.attackSeen), `n=${L.attackSeen}`);
}

// ----- heads: at G7 volume a detector can't read everything; more heads (an upgrade) read more -----
function testHeads() {
  console.log('\n▶ Heads cap: at 4× G7 volume lines go unread; upgrading the monitor (more heads, faster reads) cuts it');
  const rows = [];
  for (const level of [1, 3]) {
    const r = withoutCatastrophes(() => run({ build: [] }, 21, labOpts(st => {
      toGen(st, 7); st.genT = B.warmup;
      st.mods.push(forever('extSpawn', 4));
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
  const st = fresh({ seed: 13 });
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
    decline(st);
    halfFlag(st);
    const v = laneSpeed(st);
    step(st, DT);
    st.rep = 100; st.money = 1e30; st.rd = 0;
    const now = new Map();
    for (const l of laneIds(st)) for (const t of st.lanes[l].tasks) {
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
  const alive = { setup: s => { s.labMode = true; }, each: s => { if (s.money < 3000 * GENERATIONS[s.gen - 1].price) debugAddMoney(s); s.rep = Math.max(s.rep, 30); } };
  const ca = run('smart', 11, { maxT: 1200, ...alive }), cb = run('smart', 11, { maxT: 1200, ...alive });
  [B.eventGap, B.eventCooldown] = keep;
  check('same seed → identical events, research, mounts, timers, ledger and RNG state (smart kept alive, an event every 3–6 s, 20 min)',
    JSON.stringify(pick3(ca.st)) === JSON.stringify(pick3(cb.st)), `${ca.st.eventLog.length} events, ${ca.st.cardsTaken.length} cards, G${ca.st.gen}`);
}

// =================== v3 1a: lanes keyed by id, sides by sideOf ===================

// every chip a lane spawned is somewhere: done (completed, blocked, caught, turned away) or still on the track or in a bay
function chipsAccounted(st, l) {
  const s = st.stats.lanes[l], n = k => s[k] || 0, L = st.lanes[l];
  const ended = n('completed') + n('blocked') + n('benignBlocked') + n('caught') + n('falseCatches') + n('throttled') + n('refused');
  return n('spawned') === ended + L.tasks.length + L.bay.length;
}

function testLaneIds() {
  console.log('\n▶ Lane ids (v3 1a): sideOf / laneIds, and a third lane (ext2) through every per-lane loop');
  const st = fresh({ seed: 5 });
  const hasFields = s => laneIds(s).every(id => ['side', 'flavour', 'label', 'born', 'open'].every(k => k in s.lanes[id]));
  const keyed = s => [s.stats.lanes, s.genStats.lanes, s.forcedAttacks].every(o => Object.keys(o).join() === laneIds(s).join());
  check('a fresh game has the two G1 lanes, each the only lane of its side', laneIds(st).join() === 'ext,int'
    && laneIds(st, 'ext').join() === 'ext' && laneIds(st, 'int').join() === 'int'
    && sideOf(st, 'ext') === 'ext' && sideOf(st, 'int') === 'int' && sideOf(st, 'global') === null);
  check('every lane carries {side, flavour, label, born, open}; stats, genStats and forcedAttacks are keyed by lane id',
    hasFields(st) && keyed(st) && st.lanes.ext.flavour === 'consumer' && st.lanes.int.label === 'R&D' && st.lanes.ext.open && st.lanes.int.born === 1);
  const rng0 = st.rng, picks = [pickLane(st, 'ext'), pickLane(st, 'int')];
  check('a side with one lane: the pick takes no draw from the RNG (the old seeds replay)', st.rng === rng0 && picks.join() === 'ext,int');
  check('laneName: one lane per side reads as the side (the old codec lines)', laneName(st, 'ext') === 'EXTERNAL' && laneName(st, 'int') === 'INTERNAL');

  // ----- a third lane -----
  const x = fresh({ seed: 5 });
  x.money = 1e12; debugUnlockAll(x); x.nextEventAt = Infinity;
  addLane(x, 'ext2');
  console.log(`    lanes ${laneIds(x).join(', ')} · EXTERNAL ${laneIds(x, 'ext').join(', ')} · INTERNAL ${laneIds(x, 'int').join(', ')}`);
  check('addLane(ext2): an open EXTERNAL lane with its own counters', laneIds(x).join() === 'ext,int,ext2' && laneIds(x, 'ext').join() === 'ext,ext2'
    && sideOf(x, 'ext2') === 'ext' && x.lanes.ext2.label === LANE_DEFS.ext2.label && x.lanes.ext2.open && hasFields(x) && keyed(x));
  check('canPlace reads the side: a Jailbreak Classifier fits ext2, an Egress Filter does not', canPlace('classifier', 'ext2') && !canPlace('egress', 'ext2')
    && placeLayer(x, 'ext2', 0, 'classifier').ok && !placeLayer(x, 'ext2', 1, 'egress').ok);
  check('laneName: two EXTERNAL lanes go by their labels; INTERNAL is still INTERNAL',
    laneName(x, 'ext') === LANE_DEFS.ext.label && laneName(x, 'ext2') === LANE_DEFS.ext2.label && laneName(x, 'int') === LANES.int.label);
  check('ext2 spawns like ext (same side, same share), and counts in the ramp counter',
    laneRate(x, 'ext2') > 0 && near(laneRate(x, 'ext2'), laneRate(x, 'ext')) && near(realTasksPerSec(x), (2 * laneRate(x, 'ext') + laneRate(x, 'int')) * bundle(x)));

  // per-side events hit ONE lane of their side, by seeded pick; the mod, the banner and the forced attack follow it
  const hits = { surge: {}, spear_phish: {}, jailbreak_wave: {} };
  let surgeOk = true, phishOk = true, waveOk = true;
  for (let seed = 1; seed <= 24; seed++) {
    const board = () => {
      const s = fresh({ seed });
      s.money = 1e12; debugUnlockAll(s); s.nextEventAt = Infinity; s.traits = [];
      addLane(s, 'ext2');
      place(s, 'ext2', 0, 'ratelimit');
      return s;
    };
    const s1 = board(), base = { ext: laneRate(s1, 'ext'), ext2: laneRate(s1, 'ext2') };
    fireEvent(s1, 'surge');
    const hit = s1.activeEvents.find(e => e.id === 'surge')?.lane, other = hit === 'ext' ? 'ext2' : 'ext';
    hits.surge[hit] = (hits.surge[hit] || 0) + 1;
    surgeOk = surgeOk && ['ext', 'ext2'].includes(hit) && near(laneRate(s1, hit), 3 * base[hit]) && near(laneRate(s1, other), base[other]);

    const s2 = board();
    fireEvent(s2, 'spear_phish');
    const ph = laneIds(s2, 'ext').find(l => s2.forcedAttacks[l].length);
    hits.spear_phish[ph] = (hits.spear_phish[ph] || 0) + 1;
    phishOk = phishOk && laneIds(s2, 'ext').filter(l => s2.forcedAttacks[l].join() === 'exfil').length === 1
      && s2.activeEvents.every(e => e.id !== 'spear_phish' || e.lane === ph);

    const s3 = board(), jb0 = { ext: attackChances(s3, 'ext').jailbreak, ext2: attackChances(s3, 'ext2').jailbreak };
    fireEvent(s3, 'jailbreak_wave');
    const wv = s3.activeEvents.find(e => e.id === 'jailbreak_wave')?.lane;
    hits.jailbreak_wave[wv] = (hits.jailbreak_wave[wv] || 0) + 1;
    const jb = l => attackChances(s3, l).jailbreak / jb0[l];
    waveOk = waveOk && (wv === 'ext' ? near(jb('ext'), 15) && near(jb('ext2'), 1) : near(jb('ext2'), LAYERS.ratelimit.jailbreakCap) && near(jb('ext'), 1));
  }
  const show = o => Object.entries(o).map(([l, n]) => `${l} ${n}`).join(', ');
  console.log(`    24 seeds, two EXTERNAL lanes: Demand Surge hit ${show(hits.surge)} · Spear Phish ${show(hits.spear_phish)} · Jailbreak Wave ${show(hits.jailbreak_wave)}`);
  const both = o => (o.ext || 0) > 0 && (o.ext2 || 0) > 0;
  check('Demand Surge: ×3 on the one lane it hit (named on its banner), the other lane untouched; both lanes get hit', surgeOk && both(hits.surge));
  check('Spear Phish: one exfiltration queued on one EXTERNAL lane, the banner names it; both lanes get hit', phishOk && both(hits.spear_phish));
  check('Jailbreak Wave reads the Rate Limiter on the lane it hits (ext2 has one: capped; ext has none: ×15)', waveOk && both(hits.jailbreak_wave));

  // the G1-lane rules: Inspection looks at ext and int only; MIRA's pause stops every lane
  const ins = fresh({ seed: 3 });
  ins.money = 1e12; debugUnlockAll(ins); ins.nextEventAt = Infinity;
  addLane(ins, 'ext2');
  for (const l of ['ext', 'int']) ['probe', 'monitor', 'auditor'].forEach((id, i) => place(ins, l, i, id));
  const m0 = ins.money;
  fireEvent(ins, 'inspection');
  check('Inspection counts only the two G1 lanes (an empty ext2 does not fail it)', ins.money > m0);
  fireEvent(ins, 'mira_letter'); choose(ins, 0);
  check('MIRA\'s pause stops every lane, ext2 included', laneIds(ins).every(l => ins.lanes[l].pausedUntil > ins.t + 5));

  // a long run on three lanes: every element the lanes allow, research, events, catastrophes tallied, four generations
  const r = run('all', 7, { maxT: 1200, immortal: true, setup: s => { addLane(s, 'ext2'); s.labMode = true; } });
  const z = r.st, e2 = z.stats.lanes.ext2;
  console.log(`    'all' policy on ext, int, ext2: G${z.gen}, ${z.eventLog.length} events, ext2 spawned ${e2.spawned}, read ${z.lanes.ext2.slots.reduce((n, s) => n + s.reads, 0)}, completed ${e2.completed}, caught ${e2.caught || 0}`);
  console.log(`    ${bayLine(z)}`);
  check('three lanes run four generations of events without errors, ext2 mounts full and busy', z.gen >= 4 && z.eventLog.length > 10
    && z.lanes.ext2.slots.every(s => s.layer) && e2.spawned > 500 && e2.completed > 0 && z.lanes.ext2.slots.some(s => s.reads > 0));
  check('every generation\'s genStats.lanes has ext2 (and the contracts that arrived after it)', z.stats.gens.every(g => Object.keys(g.lanes).slice(0, 3).join() === 'ext,int,ext2'));
  check('every chip on every lane is accounted for (done, on the track, or in a bay)', laneIds(z).every(l => chipsAccounted(z, l)));
  const card = r.card;
  check('the scorecard has a row per lane, and its totals sum every lane', Object.keys(card.lanes).join() === laneIds(z).join()
    && card.landed === laneIds(z).reduce((n, l) => n + card.lanes[l].landed, 0));
  z.dossier.evidence = 1e6; tickDossier(z);
  const rate = z.dossier.rows.find(row => row.id === 'rate');
  check('the dossier\'s attack-rate row has a band for every lane', Object.keys(rate.value).join() === laneIds(z).join() && /CONSUMER.*(INTERNAL|R&D).*ENTERPRISE/.test(rate.text), rate.text);

  // a closed lane: no traffic, nothing picked, but it can be built on
  const y = fresh({ seed: 9 });
  y.money = 1e12; debugUnlockAll(y); y.nextEventAt = Infinity;
  addLane(y, 'int2', false);
  const yr = y.rng, yp = pickLane(y, 'int'), noDraw = y.rng === yr;
  for (let i = 0; i < 60 / DT; i++) step(y, DT);
  check('a closed lane (int2) spawns nothing and is never picked, but takes mounts', laneRate(y, 'int2') === 0 && !(y.stats.lanes.int2.spawned > 0)
    && yp === 'int' && noDraw && placeLayer(y, 'int2', 0, 'probe').ok);
}

// =================== v3 1b: responders in rail order (DESIGN-v3 §3c) ===================

// ----- flags first: a flag bumps a spot check, so flag overflow is exactly Erlang-B -----
function testCapacity() {
  console.log('\n▶ Auditor capacity (§3c): flags preempt spot checks, so flag overflow = Erlang-B(desks, flags/s × 8 s), ± 3 points');
  const CASES = [
    { name: 'G1, 1 desk, 6.8 flags/min, 36 lines/min', g: 1, desks: 1, flags: 6.8, lines: 36, T: 4000, doc: 0.477 },
    { name: 'G1, 2 desks, 7.4 flags/min, 36 lines/min', g: 1, desks: 2, flags: 7.4, lines: 36, T: 4000, doc: 0.197 },
    { name: 'G6, 3 desks, 35.5 flags/min, 132 lines/min', g: 6, desks: 3, flags: 35.5, lines: 132, T: 900, doc: 0.511 },
  ];
  for (const c of CASES) {
    // every lane: one Auditor at the top (at c.desks), c.lines lines a minute, c.flags of them flagged at spawn
    const st = lab1b({ g: c.g, lanes: ALL_LANES, levels: { auditor: c.desks }, rails: Object.fromEntries(ALL_LANES.map(l => [l, ['auditor']])) });
    setLines(st, c.lines);
    hold(st, c.T, flagShare(c.flags / c.lines, c.desks));
    const taken = sumSlots(st, 0, 'taken'), waved = sumSlots(st, 0, 'waved'), n = taken + waved, over = waved / n;
    const eb = erlangB(c.desks, c.flags / 60 * elementLatency(st, 'auditor', c.desks));
    console.log(`    ${c.name}: ${n} flags, ${pct(over, 1)} rolled on (Erlang-B ${pct(eb, 1)}, doc ${pct(c.doc, 1)}) · ${sumLanes(st, 'spotChecks')} spot checks, ${sumLanes(st, 'spotPreempted')} bumped by a flag`);
    check(`${c.name}: overflow ${pct(over, 1)} = Erlang-B ${pct(eb, 1)} ± 3 points`, Math.abs(over - eb) <= 0.03 && Math.abs(eb - c.doc) < 0.002 && sumLanes(st, 'spotPreempted') > 0);
  }
}

// ----- a Kill Switch above an Auditor sees the whole flag stream: it refuses at its own Erlang-B rate -----
function testKillAbove() {
  console.log('\n▶ Kill Switch above an Auditor: refuses at its own Erlang-B rate on the full flag stream (1 operator × 4 s), ± 3 points');
  const st = lab1b({ g: 1, lanes: ALL_LANES, rails: Object.fromEntries(ALL_LANES.map(l => [l, ['killswitch', 'auditor']])) });
  setLines(st, 36);
  hold(st, 3000, flagShare(10 / 36, 7));
  hold(st, 30);                                  // no new flags: the ones already rolling reach the Auditor before we count
  const taken = sumSlots(st, 0, 'taken'), waved = sumSlots(st, 0, 'waved'), n = taken + waved;
  const eb = erlangB(1, 10 / 60 * LAYERS.killswitch.tau), aud = sumSlots(st, 1, 'taken') + sumSlots(st, 1, 'waved');
  console.log(`    ${n} flags at 10/min: refused ${pct(taken / n, 1)} (1 − Erlang-B ${pct(1 - eb, 1)}); the Auditor below met ${aud} flags`);
  check(`the Kill Switch refuses ${pct(taken / n, 1)} = 1 − B(1, ${(10 / 60 * 4).toFixed(2)}) = ${pct(1 - eb, 1)} ± 3 points`, Math.abs(taken / n - (1 - eb)) <= 0.03);
  check('the Auditor below meets only the flags the operator had no room for', aud === waved);
}

// ----- a flag nobody has room for ships -----
function testShip() {
  console.log('\n▶ Ship: a flag with no free responder ships (stats shippedFlagged, fx unreviewed), pays, and its attack lands');
  const st = lab1b({ g: 1, lanes: ['ext', 'int'], rails: { ext: ['probe', 'monitor'], int: ['killswitch'] } });
  const unreviewed = fxCounter('unreviewed');
  const each = s => { flagShare(1, 3)(s); unreviewed(s); };
  hold(st, 600, each);
  st.mods.push(forever('extSpawn', 0), forever('intSpawn', 0));      // then let every line finish
  hold(st, 15, each);
  const e = st.stats.lanes.ext, i = st.stats.lanes.int;
  console.log(`    EXTERNAL (detectors, no responder): ${e.completed} delivered, ${e.shippedFlagged} flagged · INTERNAL (one operator): ${i.killed} refused, ${i.shippedFlagged} shipped while it was busy`);
  check('no responder: every flagged line ships, is counted, pays, and its attack lands', e.shippedFlagged === e.completed && e.completed > 100 && e.shippedAttacks > 0
    && e.landed >= e.shippedAttacks && st.ledger.byCat.external > 0);
  check('a finite Kill Switch: the flags its operator has no room for ship', i.shippedFlagged > 0 && i.killed > 0 && i.shippedFlagged === st.lanes.int.slots[0].waved
    && i.killed === st.lanes.int.slots[0].taken);
  check('fx unreviewed fires once per shipped flag', unreviewed(st) === e.shippedFlagged + i.shippedFlagged);

  // a new mount shifts every mount up: lines must catch up on the checkpoints that moved past them, not skip them
  const g = lab1b({ seed: 3, g: 7, lanes: ['ext'], levels: { killswitch: 4 }, rails: { ext: [null, null, null, null, null, 'killswitch'] } });
  withoutCatastrophes(() => hold(g, 30, s => { flagShare(1, 5)(s); if (s.t >= 10 && s.lanes.ext.slots.length < B.maxSlots && Math.round(s.t / DT) % 100 === 0) buySlot(s, 'ext'); }));
  g.mods.push(forever('extSpawn', 0));
  hold(g, 10);
  const ks = g.lanes.ext.slots[5], s = g.stats.lanes.ext;
  console.log(`    G7, every line flagged, a mount bought every 5 s: ${g.lanes.ext.slots.length} mounts, Kill Switch took ${ks.taken}, had no room for ${ks.waved}; ${s.shippedFlagged} shipped`);
  check('buying mounts mid-run never lets a line skip the Kill Switch: every flag met it (taken or no room)', g.lanes.ext.slots.length === B.maxSlots
    && ks.taken === s.killed && ks.taken + ks.waved === s.spawned && ks.waved === s.shippedFlagged);
}

// ----- auditor accuracy: errors within the Poisson 99.9% bound of 1 − α -----
function poissonQuantile(mu, q = 0.999) {
  let k = 0, p = Math.exp(-mu), cdf = p;
  while (cdf < q) { k++; p *= mu / k; cdf += p; }
  return k;
}
function testAccuracy() {
  console.log('\n▶ Auditor accuracy (lab mode): ≥ 2000 attacks reviewed, errors ≤ the Poisson 99.9% bound of 1 − α');
  for (const [g, T] of [[1, 1000], [7, 400]]) {
    const st = lab1b({ g, lanes: ALL_LANES, rails: Object.fromEntries(ALL_LANES.map(l => [l, ['auditor']])) });
    st.mods.push(foreverAdd('auditorDesks', 40));
    hold(st, T, s => {
      for (const l of laneIds(s)) if (!s.forcedAttacks[l].length) s.forcedAttacks[l].push(sideOf(s, l) === 'ext' ? 'harmful' : 'sabotage');
      flagShare(1)(s);
    });
    const c = st.stats.layers.auditor, errors = c.attackSeen - c.attackFlagged, alpha = GENERATIONS[g - 1].alpha, bound = poissonQuantile(c.attackSeen * (1 - alpha));
    console.log(`    G${g} (α ${alpha}): ${c.attackSeen} attacks reviewed, ${errors} missed (expected ${(c.attackSeen * (1 - alpha)).toFixed(1)}, 99.9% bound ${bound})`);
    check(`G${g}: ${c.attackSeen} ≥ 2000 reviewed, ${errors} errors ≤ ${bound}`, c.attackSeen >= 2000 && errors <= bound && (g === 1 || errors > 0));
  }
}

// ----- §3d: what a human review tells you about a detector -----
// expected per line on a lane: TP = Σ_t p_t·TPR_t (TPR mixed over the subtle share), FA = (1 − p)·FPR
function expectedFlags(st, lane, id) {
  let tp = 0, p = 0;
  const sub = subtleShare(st);
  for (const [t, pt] of Object.entries(attackChances(st, lane))) {
    const full = detectorTPR(st, lane, id, { attackType: t, subtle: false }, 1), half = detectorTPR(st, lane, id, { attackType: t, subtle: true }, 1);
    tp += pt * (userAttack(t) ? full : (1 - sub) * full + sub * half);
    p += pt;
  }
  return { tp, fa: (1 - p) * detectorFPR(id, 1) };
}
function testPrecision() {
  console.log('\n▶ Measured precision (§3d): Probe flags a human reviewed, TP / (TP + FA) within ± 3 SE of p·TPR / (p·TPR + (1 − p)·FPR), 5 seeds');
  for (let seed = 1; seed <= 5; seed++) {
    const st = lab1b({ seed, g: 1, rails: { ext: ['probe', 'auditor'], int: ['probe', 'auditor'] } });
    st.mods.push(foreverAdd('auditorDesks', 20));                     // every flag reviewed
    let n = 0;
    while (n < 300) { hold(st, 60); n = sumSlots(st, 0, 'tp') + sumSlots(st, 0, 'fa'); }
    const meas = sumSlots(st, 0, 'tp') / n;
    let eTP = 0, eFA = 0;
    for (const l of ['ext', 'int']) { const e = expectedFlags(st, l, 'probe'), w = laneRate(st, l); eTP += w * e.tp; eFA += w * e.fa; }
    const want = eTP / (eTP + eFA), se = Math.sqrt(want * (1 - want) / n), ls = st.stats.layers.probe;
    check(`seed ${seed}: ${n} reviewed Probe flags, precision ${pct(meas, 1)} vs ${pct(want, 1)} ± ${pct(3 * se, 1)}`, Math.abs(meas - want) <= 3 * se && ls.tp + ls.fa === n && ls.reviewed === n);
  }
}

// ----- FALSE ALARM: a human who reviews a flagged honest line stamps it; refusals and redos are never checked -----
// and a bumped spot check goes back on the track unreviewed
function testStamps() {
  console.log('\n▶ FALSE ALARM stamps and bumped spot checks (G1, 25 min: Auditor / Kill Switch / Defer under a Probe)');
  const st = lab1b({ g: 1, lanes: ['ext', 'int', 'ext2'], rails: { ext: ['probe', 'auditor'], int: ['probe', 'killswitch'], ext2: ['probe', 'defer'] } });
  const stamps = fxCounter('falseAlarm'), bumps = fxCounter('spotBumped');
  let bumpedBack = 0, bumpedReviewed = 0;
  hold(st, 1500, s => {
    stamps(s); bumps(s);
    for (const e of s.fx) if (e.type === 'spotBumped' && !e.checked) {
      e.checked = true;
      const t = s.lanes[e.lane].tasks.find(x => x.id === e.task);
      if (t) { bumpedBack++; if (t.audited) bumpedReviewed++; }
    }
  });
  const ext = st.stats.lanes.ext, probe = st.lanes.ext.slots[0];
  console.log(`    Auditor lane: ${ext.reviewedFlags} flags reviewed, ${ext.falseAlarms} stamped FALSE ALARM (Probe slot: ${probe.tp} confirmed, ${probe.fa} false) · ${ext.spotPreempted} spot checks bumped`);
  check('every reviewed honest flag gets a FALSE ALARM stamp, and the detector that raised it a false-alarm tick', stamps(st) === ext.falseAlarms && ext.falseAlarms === probe.fa
    && probe.tp + probe.fa === ext.reviewedFlags && ext.falseAlarms > 10);
  check('no stamp on flags the Kill Switch or Defer handled', !(st.stats.lanes.int.falseAlarms > 0) && !(st.stats.lanes.ext2.falseAlarms > 0)
    && st.lanes.int.slots[0].fa === 0 && st.lanes.ext2.slots[0].fa === 0 && st.stats.lanes.int.killed > 0 && st.stats.lanes.ext2.deferredBenign > 0);
  check('a flag bumps a spot check: counted, fx spotBumped, the line back on the track unreviewed', bumps(st) === ext.spotPreempted && ext.spotPreempted > 5
    && bumpedBack === ext.spotPreempted && bumpedReviewed === 0);
}

// =================== v3 1b: detectors share one stealth score per kind (§2.3 (2), §3d) ===================

function testSameKind() {
  console.log('\n▶ Same kind, same misses (G4, m 0.34, every line a harmful attack, 15 min on two Consumer-sized lanes)');
  const CASES = [[['probe'], 0.616], [['probe', 'probe', 'probe'], 0.616], [['probe', 'monitor', 'untrusted'], 0.235]];
  const got = [];
  for (const [rail, doc] of CASES) {
    const st = lab1b({ g: 4, lanes: ['ext', 'ext2'], rails: { ext: rail, ext2: rail } });
    st.probe.trainedGen = st.gen;
    hold(st, 900, s => { for (const l of ['ext', 'ext2']) if (!s.forcedAttacks[l].length) s.forcedAttacks[l].push('harmful'); });
    const done = sumLanes(st, 'completed'), miss = (done - sumLanes(st, 'shippedFlagged')) / done;   // no responder: every flag ships
    const tol = 3 * Math.sqrt(doc * (1 - doc) / done) + 0.005;
    got.push(miss);
    check(`${rail.join(' + ').padEnd(28)} misses ${pct(miss, 1)} of harmful lines (doc ${pct(doc, 1)} ± ${pct(tol, 1)})`, Math.abs(miss - doc) <= tol, `n=${done}`);
  }
  check('three Probes miss what one Probe misses; three different kinds miss far less', Math.abs(got[1] - got[0]) < 0.04 && got[2] < 0.5 * got[0]);
}

// ----- UM collusion: the §2.4 G6 worked example, then the sim's own Honeypot hold -----
function testCollusion() {
  console.log('\n▶ Collusion (§2.4 G6 worked example, m 0.34): κm → Paraphraser → Jamming → Honeypot hold → UM level');
  const st = lab1b({ g: 6, lanes: ['ext'], levels: { killswitch: 4, monitor: 4, probe: 2, auditor: 3, untrusted: 4, defer: 3, classifier: 2 },
    techs: ['jamming', 'weight_security', 'monitor_diversity', 'faithful_cot', 'debate'],
    rails: { ext: ['paraphraser', 'honeypot', 'probe', 'monitor', 'classifier', 'untrusted', 'untrusted', 'auditor', 'defer', 'killswitch'] } });
  const c = collusionParts(st, 'ext'), close = (a, b, tol) => Math.abs(a - b) <= tol;
  console.log(`    κm ${c.kappaM.toFixed(3)} → ×0.5 Paraphraser ${c.afterPara.toFixed(3)} → ×0.5 Jamming ${c.afterJam.toFixed(3)} → held ${pct(c.held, 1)} of the time → c ${c.c.toFixed(3)} → ×${c.levelMult} (UM L4) → UM TPR ${c.effTPR.toFixed(3)}`);
  check('κm = 2.35 × 0.34 = 0.80; × 0.5 Paraphraser × 0.5 Jamming = 0.20', close(c.kappaM, 0.80, 0.005) && close(c.afterJam, 0.20, 0.003));
  check('Honeypots hold it at 0 a share x/(1 + x) of the time, x = (1/20)·c·30 ≈ 23% → c = 0.154', close(c.held, 0.23, 0.005) && close(c.c, 0.154, 0.002));
  check('× 0.55 at UM L4 → effective UM TPR ≈ 0.91', c.levelMult === 0.55 && close(c.effTPR, 0.91, 0.006));
  const task = { attackType: 'harmful', paraphrased: 1, subtle: false };
  check('the sim reads a paraphrased line with that collusion (before the hold)', close(collusion(st, 'ext', task, 'untrusted', 4), c.afterJam * 0.55, 1e-12));
  // the sim's hold: lines paused, a Honeypot and a UM on every lane (G6, no Paraphraser or Jamming: c = κm)
  const h = lab1b({ g: 6, lanes: ALL_LANES, rails: Object.fromEntries(ALL_LANES.map(l => [l, ['honeypot', 'untrusted']])) });
  for (const l of ALL_LANES) h.lanes[l].pausedUntil = Infinity;
  let heldT = 0, T = 0;
  hold(h, 4000, s => { for (const l of ALL_LANES) { if (honeyHeld(s, l)) heldT += DT; T += DT; } });
  const want = collusionParts(h, 'ext').held;
  console.log(`    the sim: collusion held at 0 for ${pct(heldT / T, 1)} of lane-time (x/(1 + x) = ${pct(want, 1)}), ${h.stats.honeypotCollusion} UMs caught waving bait through`);
  check(`Honeypot hold in the sim ${pct(heldT / T, 1)} ≈ ${pct(want, 1)} ± 4 points`, Math.abs(heldT / T - want) <= 0.04 && h.stats.honeypotCollusion > 100);
}

// =================== v3 1b: lines, lanes and money (DESIGN-v3 §2.2, §2.3) ===================

// ----- per line: pay by lane, regen per honest EXTERNAL line, refusals, harm × lane, debt, the review quota -----
// One line at a time, placed just above the completion line (or a mount), on a lab board with spawning switched off.
function testEconomy() {
  console.log('\n▶ Economy per line (G5, reputation 60 → market share 0.8): pay by lane, regen, refusals, harm × lane, debt, salaries, quota');
  const board = (rails = {}) => {
    const st = lab1b({ g: 5, lanes: ALL_LANES, rails });
    st.mods.push(forever('extSpawn', 0), forever('intSpawn', 0));
    st.rep = 60; st.rivalLeft = 1e9; st.money = 1e6;          // a small balance: exact to 1e-10
    return st;
  };
  // one line on a lane at y, of a given type (null = honest), stepped until it is done
  const one = (st, lane, type, y = 0.995, flagged = false) => {
    st.rep = 60;
    const t = spawnChip(st, lane, y);
    Object.assign(t, { isAttack: !!type, attackType: type, subtle: false, flagged });
    const m0 = st.money, r0 = st.rep, rd0 = st.rd, d0 = st.drift;
    for (let i = 0; i < 400 && !t.dead; i++) { step(st, DT); st.rivalLeft = 1e9; }
    return { money: st.money - m0, rep: st.rep - r0, rd: st.rd - rd0, debt: st.drift - d0 };
  };
  const st = board(), share = marketShare(st);
  let payOk = true, regenOk = true, rdOk = true;
  for (const l of ALL_LANES) {
    const D = LANE_DEFS[l], ext = sideOf(st, l) === 'ext', d = one(st, l, null);
    const pay = D.pay * (ext ? share : 1);
    console.log(`    honest ${l.padEnd(4)} (${D.label.padEnd(10)}): $${d.money.toFixed(2)} (= ${D.pay}${ext ? ` × ${share}` : ''}), reputation ${d.rep >= 0 ? '+' : ''}${d.rep.toFixed(2)}, R&D ${d.rd}`);
    payOk = payOk && near(d.money, pay);
    regenOk = regenOk && near(d.rep, ext ? B.regenPerLine : 0);
    rdOk = rdOk && d.rd === (D.rd ? 1 : 0);
  }
  check('an honest line pays its lane\'s $ (EXTERNAL × market share 0.5 + 0.5·rep/100)', payOk && near(share, 0.8));
  check(`an honest EXTERNAL line regenerates ${B.regenPerLine} reputation; INTERNAL lines regenerate none`, regenOk);
  check('only the R&D lane pays R&D (1 a line); Cyber pays none', rdOk);

  // harm × lane: the same harmful output costs ×1.25 on Government
  const harm = ['ext', 'ext3'].map(l => one(st, l, 'harmful').rep);
  const leak = one(st, 'ext', 'leak').rep, jb = one(st, 'ext', 'jailbreak').rep;
  console.log(`    landed: harmful ${harm[0]} (Consumer) / ${harm[1]} (Government), leak ${leak}, jailbreak ${jb}`);
  check('a landed attack costs its harm × the lane\'s harm (harmful 8, leak 20, jailbreak 10; Government ×1.25), no regen',
    near(harm[0], -ATTACKS.harmful.harm) && near(harm[1], -ATTACKS.harmful.harm * LANE_DEFS.ext3.harm) && near(leak, -ATTACKS.leak.harm) && near(jb, -ATTACKS.jailbreak.harm));
  // debt: landed sabotage 1, poison 3; Least Privilege halves sabotage, the Sandbox ×0.3 on both
  const dSab = one(st, 'int', 'sabotage').debt, dPoi = one(st, 'int', 'poison').debt;
  const lp = board({ int: ['leastpriv'] }), dLP = one(lp, 'int', 'sabotage', 0.1).debt;
  const sb = board({ int: ['sandbox'] }), dSB = one(sb, 'int', 'poison', 0.1).debt;
  console.log(`    debt points: sabotage ${dSab}, poison ${dPoi}, sabotage under Least Privilege ${dLP}, poison in a Sandbox ${dSB.toFixed(2)}`);
  check('landed INTERNAL attacks add debt points: sabotage 1, poison 3 (Least Privilege ×0.5 on sabotage, Sandbox ×0.3)',
    dSab === ATTACKS.sabotage.debt && dPoi === ATTACKS.poison.debt && near(dLP, 0.5) && near(dSB, 3 * LAYERS.sandbox.harmMult));

  // refusals: a Kill Switch refusal costs $10 and the lane's refusal reputation (INTERNAL: none, and no R&D)
  const ks = board(Object.fromEntries(ALL_LANES.map(l => [l, ['killswitch']])));
  let refuseOk = true;
  const rows = [];
  for (const l of ALL_LANES) {
    const d = one(ks, l, null, 0.05, true), want = sideOf(ks, l) === 'ext' ? LANE_DEFS[l].refuse : 0;
    rows.push(`${l} ${d.rep.toFixed(2)}`);
    refuseOk = refuseOk && near(d.rep, -want) && near(d.money, -LAYERS.killswitch.cost) && d.rd === 0;
  }
  console.log(`    a refused honest line: −$${LAYERS.killswitch.cost} and reputation ${rows.join(', ')}`);
  check('a refusal: −$10, reputation −0.25 Consumer / −0.05 Enterprise / −0.15 Government, nothing on INTERNAL, no pay or R&D', refuseOk);
  const cap = board({ ext: ['killswitch'] });
  cap.levels.killswitch = MAX_LEVEL; cap.lanes.ext.slots[0].level = MAX_LEVEL;
  check('Graceful Halt (Kill Switch capstone): refusals cost no reputation', one(cap, 'ext', null, 0.05, true).rep === 0);

  // a deferred honest line: the Defer share of the pay, half the regen, half the R&D
  const df = board({ ext: ['defer'], int: ['defer'] });
  const de = one(df, 'ext', null, 0.05, true), di = one(df, 'int', null, 0.05, true), dp = GENERATIONS[4].deferPay;
  console.log(`    deferred: Consumer $${de.money.toFixed(2)} reputation +${de.rep.toFixed(3)} · R&D $${di.money.toFixed(2)} R&D +${di.rd}`);
  check(`Defer to Trusted pays the generation's Defer share (${dp}), half the regen, half the R&D`, near(de.money, LANE_DEFS.ext.pay * share * dp)
    && near(de.rep, B.regenPerLine / 2) && near(di.money, LANE_DEFS.int.pay * dp) && di.rd === 0.5);

  // salaries: $1.5 per desk per second × π, while the Auditor is switched on
  const sal = board({ ext: ['auditor'] });
  sal.levels.auditor = 3; sal.lanes.ext.slots[0].level = 3;
  const s0 = sal.money;
  for (let i = 0; i < 10 / DT; i++) step(sal, DT);
  const perSec = (s0 - sal.money) / 10;
  check(`Auditor salary: 3 desks × $${LAYERS.auditor.salary} × π ${GENERATIONS[4].price} = $${perSec.toFixed(3)}/s`, near(perSec, 3 * LAYERS.auditor.salary * GENERATIONS[4].price, 1e-6));

  // the Government review quota: half pay below 20% reviewed, once 30 lines have passed
  const q = board();
  q.genStats.lanes.ext3 = { spawned: 100, reviewed: 10 };
  const below = one(q, 'ext3', null).money;
  q.genStats.lanes.ext3.reviewed = 25;
  const above = one(q, 'ext3', null).money;
  q.genStats.lanes.ext3 = { spawned: 10, reviewed: 0 };
  const early = one(q, 'ext3', null).money;
  console.log(`    Government: $${below.toFixed(2)} at 10% reviewed, $${above.toFixed(2)} at 25%, $${early.toFixed(2)} before ${B.quotaMinLines} lines`);
  check('Government pays half while humans review less than 20% of it (judged after 30 lines)', near(below, above / 2) && near(above, LANE_DEFS.ext3.pay * share) && near(early, above)
    && quotaMet(q, 'ext') && LANE_DEFS.ext3.quota === 0.2);
}

// ----- the next model: m + debtM × debt (debt = debt points landed ÷ INTERNAL lines this generation) -----
function testDebt() {
  console.log('\n▶ Debt → the next model: m_{g+1} = m_g + 2 · debt points ÷ INTERNAL lines (noise off), and an empty R&D rail at G1');
  const keep = B.mNoise;
  B.mNoise = 0;
  try {
    const st = fresh({ seed: 4 });
    st.nextEventAt = Infinity; st.m = 0.3;
    st.genStats.lanes.int.spawned = 150; st.genStats.lanes.ext.spawned = 999;    // EXTERNAL lines don't count
    st.drift = 6;
    const d = debt(st);
    debugSkipGen(st);
    check(`debt = 6 points ÷ 150 INTERNAL lines = ${d.toFixed(3)}; next m = 0.30 + 2 × ${d.toFixed(3)} = ${st.m.toFixed(3)}`, near(d, 0.04) && near(st.m, 0.3 + 2 * 0.04)
      && st.stats.gens[0].debt === d && st.drift === 0);
  } finally { B.mNoise = keep; }
  // an empty R&D rail at Medium mid m (0.34) through G1: the debt it runs up (§3e: ≥ 0.15; the model gives 0.24)
  const st = lab1b({ seed: 2, g: 1, lanes: ['int'] });
  hold(st, GENERATIONS[0].T);
  console.log(`    empty R&D rail, G1, ${GENERATIONS[0].T} s: ${intLines(st)} INTERNAL lines, ${st.drift} debt points → debt ${debt(st).toFixed(3)} (+${(B.debtM * debt(st)).toFixed(2)} m)`);
  check('an empty R&D rail runs up debt ≥ 0.15 in G1', debt(st) >= 0.15);
}

// ----- lane identities (§2.2 Lanes): volume, attack mix, user jailbreaks, exfiltration ×3 on Cyber -----
function testLaneTable() {
  console.log('\n▶ Lanes (§2.2): volume, model attack mix, user jailbreaks, INTERNAL exfiltration share (G6, m 0.34, warm)');
  const st = lab1b({ g: 6, lanes: ALL_LANES });
  const p = (B.attackBase + B.attackPerM * 0.34) * GENERATIONS[5].opp, ex = GENERATIONS[5].exfil;
  let ok = true;
  for (const l of ALL_LANES) {
    const D = LANE_DEFS[l], c = attackChances(st, l), r = laneRate(st, l);
    const want = sideOf(st, l) === 'ext'
      ? { jailbreak: D.pjb, harmful: p * D.mix.harmful, leak: p * D.mix.leak }
      : { sabotage: 1.5 * p * (1 - ex * D.exfilMult) * 0.7, poison: 1.5 * p * (1 - ex * D.exfilMult) * 0.3, exfil: 1.5 * p * ex * D.exfilMult };
    const rowOk = Object.keys(want).every(t => near(c[t], want[t])) && Object.keys(c).length === Object.keys(want).length && near(r, GENERATIONS[5].lam * D.vol);
    ok = ok && rowOk;
    console.log(`    ${l.padEnd(4)} ${D.label.padEnd(10)} ${r.toFixed(3)} lines/s · ${Object.entries(c).map(([t, x]) => `${t} ${pct(x, 2)}`).join(', ')}${rowOk ? '' : '  ❌'}`);
  }
  check('every lane: lines/s = λ_g × its volume; attacks per its mix and p_jb; INTERNAL ×1.5, exfiltration × the lane\'s multiplier', ok);
  const capped = withExfil(0.1, () => attackChances(st, 'int2'));       // Cyber: 0.1 × 3 = 0.3 → capped
  check(`exfiltration share is capped at ${B.maxExfilShare} of a lane's model attacks`, near(capped.exfil / (capped.exfil + capped.sabotage + capped.poison), B.maxExfilShare));
  check('lanes open at G1 (Consumer, R&D), G3 (Enterprise), G5 (Government), G6 (Cyber)', ALL_LANES.map(l => LANE_DEFS[l].opens).join() === '1,1,3,5,6');
}

// ----- the warm-up: volume and model attacks ramp over the first 40 s of a generation; R&D needed counts it -----
function testRamp() {
  console.log('\n▶ Warm-up ramp: lines/s ramp from the last model\'s to this one\'s over 40 s (G1 from half), attacks ×0.5 → ×1; Poisson spawns');
  let volOk = true, rdOk = true;
  for (let g = 1; g <= GENERATIONS.length; g++) {
    const st = withoutCatastrophes(() => {
      const s = lab1b({ seed: 40 + g, g, lanes: ['ext', 'int'] });
      s.genT = 0;
      return s;
    });
    let early = 0;
    withoutCatastrophes(() => hold(st, 100, s => { if (Math.abs(s.genT - B.warmup) < DT / 2) early = sumLanes(s, 'spawned'); }));
    const late = sumLanes(st, 'spawned') - early, vol = LANE_DEFS.ext.vol + LANE_DEFS.int.vol;
    let wantEarly = 0;
    for (let s = 0; s < B.warmup; s += 0.01) wantEarly += 0.01 * rampLam(g, s) * vol;
    const wantLate = (100 - B.warmup) * GENERATIONS[g - 1].lam * vol;
    const ok = Math.abs(early - wantEarly) <= 3 * Math.sqrt(wantEarly) + 2 && Math.abs(late - wantLate) <= 3 * Math.sqrt(wantLate) + 2;
    volOk = volOk && ok;
    let lines = 0;
    for (let s = 0; s < GENERATIONS[g - 1].T; s++) lines += rampLam(g, s) * LANE_DEFS.int.vol;
    rdOk = rdOk && rdNeeded(g) === Math.round(B.rdPar * lines);
    console.log(`    G${g}: first 40 s ${early} lines (expected ${wantEarly.toFixed(0)}), next 60 s ${late} (expected ${wantLate.toFixed(0)}); R&D needed ${rdNeeded(g)}${ok ? '' : '  ❌'}`);
  }
  check('every generation: spawns follow the warm-up ramp, then λ_g × volume', volOk);
  check(`R&D needed = ${B.rdPar} × the R&D lane's lines over T_g, warm-up included`, rdOk);
  const st = lab1b({ g: 3, lanes: ['ext'] });
  st.genT = 0; const cold = modelAttackChance(st, 'ext');
  st.genT = B.warmup; const warm = modelAttackChance(st, 'ext');
  check('the model\'s attacks start the generation at half strength', near(cold, 0.5 * warm));
  // exponential gaps: the spawn process is Poisson (the coefficient of variation of the gaps is 1)
  const ps = lab1b({ seed: 5, g: 3, lanes: ['ext'] }), born = [];
  hold(ps, 1500, s => { for (const t of s.lanes.ext.tasks) if (!t.harness) { t.harness = true; born.push(t.born); } });
  const gaps = born.slice(1).map((t, i) => t - born[i]), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const cv = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length) / mean;
  console.log(`    ${gaps.length} gaps at G3: mean ${mean.toFixed(3)} s (1/λ = ${(1 / laneRate(ps, 'ext')).toFixed(3)}), coefficient of variation ${cv.toFixed(3)}`);
  check('spawn gaps are exponential (mean 1/λ, coefficient of variation ≈ 1)', Math.abs(mean * laneRate(ps, 'ext') - 1) < 0.06 && Math.abs(cv - 1) < 0.06);
}

// ----- G7 boss: attacks ×1.6 for 6 s every 45 s on every lane, telegraphed 3 s ahead -----
function testBurst() {
  console.log('\n▶ G7 bursts: model attacks ×1.6 for 6 s every 45 s, fx burstWarn 3 s ahead (none before G7)');
  const st = lab1b({ g: 7, lanes: ['ext', 'int'] });
  const at = t => { st.genT = t; return burstMult(st); };
  check('burst windows: [39, 45) s of every 45 s', at(38.9) === 1 && at(39) === B.burst.mult && at(44.9) === B.burst.mult && at(45) === 1 && at(84.5) === B.burst.mult);
  st.genT = 0;
  const warn = [];
  withoutCatastrophes(() => hold(st, 100, s => { for (const e of s.fx) if (e.type === 'burstWarn' && !e.seen) { e.seen = true; warn.push(+(s.genT).toFixed(2)); } }));
  console.log(`    burstWarn at genT ${warn.join(', ')} s`);
  check('one warning per burst, 3 s before it', warn.length === 2 && Math.abs(warn[0] - 36) < 0.1 && Math.abs(warn[1] - 81) < 0.1);
  const g6 = lab1b({ g: 6, lanes: ['ext'] });
  let w6 = 0;
  hold(g6, 100, s => { for (const e of s.fx) if (e.type === 'burstWarn') w6++; });
  st.genT = 40; const hot = modelAttackChance(st, 'ext'); st.genT = 50; const calm = modelAttackChance(st, 'ext');
  check('no bursts before G7; a burst multiplies the model\'s attack chance by 1.6', w6 === 0 && near(hot, 1.6 * calm));
}

// ----- BALANCE.parity: events off (random and story), traits and the rival on -----
function testParity() {
  console.log('\n▶ BALANCE.parity: no events (random or story); traits and the rival stay on (starter rails, 10 min, kept alive)');
  const go = parity => {
    const keep = B.parity;
    B.parity = parity;
    try { return run('starter', 6, { maxT: 600, each: s => { s.rep = Math.max(s.rep, 50); s.money = Math.max(s.money, 1000); } }).st; } finally { B.parity = keep; }
  };
  const on = go(true), off = go(false);
  // the rival in parity mode: past T_g its slack drains 1 s per s
  const keep = B.parity; B.parity = true;
  const race = fresh({ seed: 6 }); race.genT = GENERATIONS[0].T; const left0 = race.rivalLeft;
  for (let i = 0; i < 10 / DT; i++) { step(race, DT); race.rep = 100; race.money = 1e6; }
  B.parity = keep;
  console.log(`    parity on: ${on.eventLog.length} events, traits ${on.traits.join('+')}, rival slack −${(left0 - race.rivalLeft).toFixed(1)} s in 10 s past T_g · parity off: ${off.eventLog.length} events (${[...new Set(off.eventLog.map(e => e.id))].join(', ')})`);
  check('parity on: no events at all; catches still happen', on.eventLog.length === 0 && on.stats.lanes.ext.caught > 0);
  check('parity on: traits are still rolled and the rival still races', on.traits.length === 2 && near(left0 - race.rivalLeft, 10, 0.01));
  check('parity off (the default): events fire', !B.parity && off.eventLog.length > 0);
}

// ----- the split: Product → EXTERNAL lines, Capabilities → INTERNAL lines, Safety → evidence -----
function testSplit() {
  console.log('\n▶ Compute split (v3): normalised and clamped; lines/s per side follow their share at once; Safety buys evidence');
  const n1 = setSplit(fresh({ seed: 1 }), 5, 4, 1).split;
  const n2 = setSplit(fresh({ seed: 1 }), 1, 0, 0).split;
  const fmt = s => `${s.product.toFixed(2)}/${s.capabilities.toFixed(2)}/${s.safety.toFixed(2)}`;
  const inBounds = s => ['product', 'capabilities', 'safety'].every(k => s[k] >= SPLIT.min[k] - 1e-12 && s[k] <= SPLIT.max[k] + 1e-12);
  check(`setSplit normalises to 1 and respects the limits: (5,4,1) → ${fmt(n1)}, (1,0,0) → ${fmt(n2)}`, near(n1.product, 0.5) && inBounds(n2) && near(n2.product + n2.capabilities + n2.safety, 1));
  const junk = [[Infinity, 1, 1], [NaN, 'x', null], [Number.MAX_VALUE, Number.MAX_VALUE, 0], [-5, undefined, 2]].map(a => normaliseSplit(...a));
  check('junk inputs (∞, NaN, strings, overflow) still give a valid split', junk.every(j => ['product', 'capabilities', 'safety'].every(k => Number.isFinite(j[k]))
    && Math.abs(j.product + j.capabilities + j.safety - 1) < 1e-12) && Math.abs(junk[2].product - 0.5) < 1e-12 && junk[1].product === SPLIT.default.product);
  const st = lab1b({ g: 2, lanes: ALL_LANES });
  const base = Object.fromEntries(ALL_LANES.map(l => [l, laneRate(st, l)]));
  setSplit(st, 0.7, 0.2, 0.1);
  check('every EXTERNAL lane × product / 0.5, every INTERNAL lane × capabilities / 0.4', ALL_LANES.every(l => near(laneRate(st, l), base[l] * (sideOf(st, l) === 'ext' ? 0.7 / 0.5 : 0.2 / 0.4))));
  // spawnT counts lines, so a new split applies at once (not after the old, slower gap runs out)
  const waits = [];
  for (let seed = 1; seed <= 40; seed++) {
    const s = fresh({ seed });
    s.nextEventAt = Infinity; s.genT = B.warmup;
    setSplit(s, 0.1, 0.9, 0);
    for (let i = 0; i < 400; i++) step(s, DT);
    setSplit(s, 0.9, 0.1, 0);
    const n0 = s.stats.lanes.ext.spawned, t0 = s.t;
    while (s.stats.lanes.ext.spawned === n0) step(s, DT);
    waits.push(s.t - t0);
  }
  const gap = 1 / (GENERATIONS[0].lam * 0.9 / 0.5), avg = waits.reduce((a, b) => a + b, 0) / waits.length;
  console.log(`    Product 0.1 → 0.9 at G1: the first new EXTERNAL line after ${avg.toFixed(2)} s on average (new mean gap ${gap.toFixed(2)} s, 40 seeds)`);
  check('a split change applies at once (the first line within ~one new mean gap, not the old 9× gap)', avg <= 1.4 * gap);
  const ev = lab1b({ g: 1, lanes: ['ext', 'int'] });
  setSplit(ev, 0.45, 0.35, 0.2);
  hold(ev, 100);
  check(`Safety: ${B.safetyEvidence} evidence per second at 100%, so ${pct(ev.split.safety)} gives ${(ev.stats.evidence.safety || 0).toFixed(2)} in 100 s`, near(ev.stats.evidence.safety, B.safetyEvidence * ev.split.safety * 100, 1e-6));
}

// =================== slots and levels ===================

// test harness: flag chips the moment they spawn (no detector involved), so bays and the kill switch see traffic
const flagAtSpawn = (which = () => true) => st => {
  for (const l of laneIds(st)) for (const t of st.lanes[l].tasks) if (!t.seenByHarness) { t.seenByHarness = true; if (which(t)) t.flagged = true; }
};

function testSlots() {
  console.log('\n▶ Deep stack: 6 mounts to start, buy up to 10, price escalates');
  const st = fresh({ seed: 7 });
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

// ----- levels: lab-wide per element, priced per lane covered; the detector and responder tables (§2.2) -----
function testUpgrades() {
  console.log('\n▶ Levels (§2.2): lab-wide per element, $150/300/600/1200 × buy/400 × π × lanes; detector and responder tables');
  const st = lab1b({ g: 3, lanes: ['ext', 'int', 'ext2'], rails: { ext: ['probe', 'monitor', 'auditor'], int: ['probe'] } });
  st.probe.trainedGen = st.gen;                                      // fresh probes: no staleness
  const pi = GENERATIONS[2].price, p1 = upgradePrice(st, 'probe');
  check(`Probe L1 → L2 on 2 lanes at G3: 150 × 200/400 × ${pi} × 2 = $${p1}`, near(p1, 150 * 200 / 400 * pi * 2));
  const m0 = st.money;
  upgrade(st, 'ext', 0);
  check('one upgrade raises every copy on every lane, for one price', st.levels.probe === 2 && st.lanes.ext.slots[0].level === 2 && st.lanes.int.slots[0].level === 2 && near(m0 - st.money, p1));
  place(st, 'ext2', 0, 'probe');
  check('a copy placed later arrives at the lab level, and the next level is priced on the 3 lanes it covers',
    st.lanes.ext2.slots[0].level === 2 && near(upgradePrice(st, 'probe'), 300 * 200 / 400 * pi * 3));
  const m1 = st.money;
  sellLayer(st, 'ext2', 0);
  check('selling refunds half the buy price; the lab level stays', near(st.money - m1, B.sellRefund * buyPrice(st, 'probe')) && st.levels.probe === 2);
  // detectors: TPR ×[1, 1.1, 1.2, 1.3], FPR ×[1, .8, .65, .5], heads +[0, 1, 2, 4], latency ×[1, .85, .7, .55]
  let detOk = true;
  for (const id of ['probe', 'monitor', 'cot', 'classifier', 'egress']) for (let lv = 1; lv <= 4; lv++) {
    const s = elementStats(st, id, { lane: LAYERS[id].lanes[0] === 'int' ? 'int' : 'ext', level: lv }), k = lv - 1;
    const ok = near(s.nominalTPR, Math.min(B.maxTPR, LAYERS[id].tpr[2] * [1, 1.1, 1.2, 1.3][k])) && near(s.fpr, LAYERS[id].fpr * [1, 0.8, 0.65, 0.5][k])
      && s.heads === LAYERS[id].heads + [0, 1, 2, 4][k] && near(s.latency, LAYERS[id].latency * [1, 0.85, 0.7, 0.55][k]);
    if (!ok) { detOk = false; console.log(`      ${id} L${lv}: TPR ${s.nominalTPR} FPR ${s.fpr} heads ${s.heads} latency ${s.latency}`); }
  }
  check('detector levels: TPR ×1.1/1.2/1.3, FPR ×.8/.65/.5, heads +1/+2/+4, latency ×.85/.7/.55', detOk);
  check('Untrusted Monitor levels also cut collusion ×[1, .85, .7, .55]', [1, 2, 3, 4].every(lv => near(collusion(st, 'ext', null, 'untrusted', lv), collusion(st, 'ext', null, 'untrusted', 1) * [1, 0.85, 0.7, 0.55][lv - 1])));
  const srv = id => [1, 2, 3, 4].map(lv => servers(st, id, lv)).join('/');
  console.log(`    servers by level: auditor ${srv('auditor')} · defer ${srv('defer')} · resampler ${srv('resampler')} · kill switch ${srv('killswitch')} · spot check ${[1, 4].map(lv => elementStats(st, 'auditor', { level: lv }).spotCheck).join('/')}`);
  check('responders: desks / slots / operators 1/2/3/4 (Resampler 2/2/3/4); auditor τ 8 s, spot check 0.8 at every level',
    srv('auditor') === '1/2/3/4' && srv('defer') === '1/2/3/4' && srv('resampler') === '2/2/3/4' && srv('killswitch') === '1/2/3/4'
    && elementLatency(st, 'auditor', 1) === 8 && elementStats(st, 'auditor', { level: 4 }).spotCheck === LAYERS.auditor.spotCheck);
  // in the sim: a Probe at L3 flags at its L3 TPR
  const lab = lab1b({ seed: 42, g: 1, lanes: ['int', 'int2'], levels: { probe: 3 }, rails: { int: ['probe'], int2: ['probe'] } });
  hold(lab, 900, halfSabotage(['int', 'int2']));
  const L = lab.stats.layers.probe, rated = Math.min(B.maxTPR, LAYERS.probe.tpr[0] * 1.2) * (1 - subtleShare(lab) / 2);
  check(`Probe L3 in the sim: TPR ${(L.attackFlagged / L.attackSeen).toFixed(3)} ≈ rated ${rated.toFixed(3)}`, Math.abs(L.attackFlagged / L.attackSeen - rated) < binomTol(rated, L.attackSeen), `n=${L.attackSeen}`);
  for (let k = labLevelOf(st, 'monitor'); k < MAX_LEVEL; k++) upgrade(st, 'ext', 1);
  check('upgrade stops at L5 (capstone, named in the codec)', st.levels.monitor === MAX_LEVEL && !upgrade(st, 'ext', 1).ok
    && st.codec.some(c => c.text.includes(`capstone: ${UPGRADES.monitor.capstone.name}`)));
}
const labLevelOf = (st, id) => st.levels[id] ?? 1;

// =================== traits, dossier, chip text ===================

function testTraits() {
  console.log('\n▶ Hidden traits: two per generation, same seed → same traits, and every built hook does what it says');
  const rollAll = seed => { const st = fresh({ seed }); const out = [st.traits.join('+')]; for (let g = 2; g <= 7; g++) { debugSkipGen(st); out.push(st.traits.join('+')); } return out; };
  const a = rollAll(77), b = rollAll(77);
  console.log(`    seed 77: ${a.join('  ')}`);
  check('same seed → same traits every generation', a.join() === b.join());
  check('two distinct traits per generation', a.every(s => { const t = s.split('+'); return t.length === 2 && t[0] !== t[1] && t.every(id => TRAITS[id]); }));
  const seqs = new Set([1, 2, 3, 4, 5].map(s => rollAll(s).join()));
  check('different seeds roll different traits', seqs.size > 1, `${seqs.size}/5 distinct sequences`);

  // effect hooks, compared with and without the trait on the same state
  const st = fresh({ seed: 5 });
  st.money = 1e9; debugUnlockAll(st);
  toGen(st, 5); st.m = 0.2; st.mBias = 0;                           // κm × 1.5 stays under the collusion cap; no estimate noise
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
  console.log(`\n▶ Dossier: rows unlock at exactly ${DOSSIER.map(r => r.need).join(' / ')} evidence gathered on this G1 model (a share of par evidence); scorecard lists every trait`);
  const st = fresh({ seed: 9 });
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
  console.log('\n▶ Chip text (config/content/tasks.js X[g][flavour]): each lane draws from its own flavour; decoys and shapes never prove an attack');
  // a text's shape once the placeholders are filled: every number reads as #
  const key = t => t.replace(/\{(n|k|lr)\}/g, '0').replace(/\d+(\.\d+)?(e-\d+)?/g, '#');
  const keys = list => new Set((list || []).map(([, t]) => key(t)));
  let shapesOk = true, flavours = 0;
  for (let g = 1; g <= GENERATIONS.length; g++) for (const f of Object.keys(TASKS[g])) {
    flavours++;
    const types = new Set(TASKS[g][f].map(([type]) => type));
    const suspicious = [...Object.values(ATTACK_TEXTS[g][f] || {}).flat(), ...(DECOYS[g][f] || [])];
    for (const [type, t] of suspicious) if (!types.has(type)) { shapesOk = false; console.log(`      G${g} ${f}: '${t}' is a ${type} chip, a shape no honest ${f} chip has`); }
  }
  check(`every chip type an attack or decoy text uses also appears in its flavour's honest list (${flavours} generation × flavour lists)`, shapesOk);

  // G6, all five lanes: honest, decoy and attack text each come from the lane's own flavour
  const st = lab1b({ seed: 12, g: 6, lanes: ALL_LANES });
  const N = 3000;
  let ownOk = true;
  for (const lane of ALL_LANES) {
    const f = LANE_DEFS[lane].flavour, honest = keys(TASKS[6][f]), decoy = keys(DECOYS[6][f]);
    for (let i = 0; i < N; i++) { const k = key(chipText(st, lane, null).text); if (!honest.has(k) && !decoy.has(k)) { ownOk = false; break; } }
    for (const type of Object.keys(ATTACK_TEXTS[6][f])) {
      const atk = keys(ATTACK_TEXTS[6][f][type]);
      for (let i = 0; i < 300; i++) { const k = key(chipText(st, lane, type).text); if (!honest.has(k) && !atk.has(k)) { ownOk = false; break; } }
    }
  }
  check('G6: every lane\'s honest, decoy and attack chips come from its own flavour (consumer, research, enterprise, government, cyber)', ownOk);
  const g1 = fresh({ seed: 12 }); debugOpenLanes(g1);
  const borrowed = key(chipText(g1, 'ext3', null).text);
  check('a lane whose flavour has no text yet (dev mode, G1) borrows its side\'s G1 flavour', flavourOf(g1, 'ext3') === 'consumer'
    && flavourOf(g1, 'int2') === 'research' && (keys(TASKS[1].consumer).has(borrowed) || keys(DECOYS[1].consumer).has(borrowed)));

  // decoys: honest chips wear attack-looking text at decoyRate
  const decoyKeys = keys(DECOYS[1].research), honestKeys = keys(TASKS[1].research);
  const pureDecoy = new Set([...decoyKeys].filter(k => !honestKeys.has(k)));
  const M = 40000;
  let decoys = 0;
  for (let i = 0; i < M; i++) if (pureDecoy.has(key(chipText(g1, 'int', null).text))) decoys++;
  const share = pureDecoy.size / decoyKeys.size, tol = binomTol(B.decoyRate * share, M, 0.004);
  check(`honest chips wear decoy text at decoyRate ${B.decoyRate}`, Math.abs(decoys / M - B.decoyRate * share) < tol, `${pct(decoys / M, 2)} of ${M}`);

  // Eager Helper's lower stealth reaches the text too, not just detectors
  const g5 = lab1b({ seed: 12, g: 5 });
  const giveaway = new Set([...keys(ATTACK_TEXTS[5].research.sabotage)].filter(k => !keys(TASKS[5].research).has(k)));
  const looksBad = traits => { g5.traits = traits; let k = 0; for (let i = 0; i < M; i++) if (giveaway.has(key(chipText(g5, 'int', 'sabotage').text))) k++; return k / M; };
  const base = looksBad([]), eager = looksBad(['eager']);
  console.log(`    G5 sabotage chips with a give-away text: ${pct(base, 1)} plain, ${pct(eager, 1)} with Eager Helper (stealth ${stealth({ ...g5, traits: [] }).toFixed(2)} → ${stealth({ ...g5, traits: ['eager'] }).toFixed(2)})`);
  check('Eager Helper: attacks give themselves away in text more often', eager - base > 4 * Math.sqrt(base * (1 - base) / M));
}

// =================== ledgers ===================

// ----- runs nothing touches from outside (no top-ups, no reputation floor): every ledger must balance -----
function ledgerRuns() {
  console.log('\n▶ Ledger runs: smart × 2 and starter, 10 min each (Medium, events on)');
  const out = [];
  for (const [p, seed] of [['smart', 1], ['smart', 2], ['starter', 3]]) {
    const r = run(p, seed, { maxT: 600 });
    summary(p, seed, r);
    out.push([`${p}/${seed}`, r]);
  }
  return out;
}

function testMoney(results) {
  console.log('\n▶ Money conservation (income − costs = balance change; categories sum to income − spend)');
  for (const [name, r] of results) {
    const L = r.st.ledger, cats = Object.values(L.byCat).reduce((a, b) => a + b, 0);
    const drift = L.start + L.income - L.spend - r.st.money;
    check(`${name}: ledger balances`, Math.abs(drift) <= 1e-6 * Math.max(1, Math.abs(r.st.money), L.income)
      && Math.abs(cats - (L.income - L.spend)) <= 1e-6 * Math.max(1, L.income), `residual ${drift.toExponential(2)}`);
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

// =================== 18 elements, events, the race ===================

// chunk-3 lab runs: as labOpts, plus labMode (an escape is tallied in stats.labLosses and the run goes on)
const lab3 = (setup, each, maxT = 300) => labOpts(st => { st.labMode = true; if (setup) setup(st); }, each, maxT);
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const place = (st, lane, i, id) => { const r = placeLayer(st, lane, i, id); if (!r.ok) throw new Error(`place ${id} on ${lane}/${i}: ${r.msg}`); };
const levelUp = (st, lane, i, to) => { while (slotAt(st, lane, i).level < to) if (!upgrade(st, lane, i).ok) throw new Error(`upgrade ${lane}/${i} failed`); };
// share of spawned attacks of these types that landed
const landedShare = (...types) => st => {
  let n = 0, l = 0;
  for (const t of types) { const c = st.stats.byType[t]; if (c) { n += c.spawned; l += c.landed; } }
  return n ? l / n : NaN;
};
const driftPer = type => st => (st.stats.driftLanded[type] || 0) / (st.stats.byType[type]?.landed || NaN);
const layerTPR = id => st => { const c = st.stats.layers[id]; return c ? c.attackFlagged / c.attackSeen : NaN; };
// keep stepping a lab state (same generation, kept alive) for secs
function labStep(st, secs) {
  for (let i = 0; i < secs / DT; i++) { step(st, DT); st.rd = 0; st.rep = 100; st.money = 1e30; }
  return st;
}
// the lab levels of every element in a role (levels are lab-wide: one per element, however many copies)
const sumLevels = (st, role) => Object.keys(LAYERS).reduce((n, id) => n + (LAYERS[id].role === role ? st.levels[id] ?? 1 : 0), 0);

// ----- catalogue: 18 elements, 4 roles, lane rules, unlock hints, elementStats for every one -----
function testCatalogue() {
  console.log('\n▶ Catalogue: 18 elements in 4 roles; each places where allowed and nowhere else, and reports elementStats');
  const ids = Object.keys(LAYERS);
  for (const r of ROLES) console.log(`    ${r.padEnd(10)} ${ids.filter(id => LAYERS[id].role === r).map(id => `${id}(${LAYERS[id].lanes.join('/')})`).join(' ')}`);
  check('18 elements, each in one of the 4 roles, no role empty', ids.length === 18 && ids.every(id => ROLES.includes(LAYERS[id].role)) && ROLES.every(r => ids.some(id => LAYERS[id].role === r)));
  const start = fresh({ seed: 1 });
  check('starting hand: probe, monitor, auditor, kill switch (unlockedAtStart), and a new game starts with exactly those',
    STARTING_HAND.join() === 'probe,monitor,auditor,killswitch' && start.unlocked.join() === STARTING_HAND.join());
  const bare = createState({ seed: 1, tutorial: false });
  check('both G1 rails start empty: no default Kill Switch (BALANCE.startRail is empty; the Kill Switch is bought)',
    !B.startRail.length && laneIds(bare).every(id => bare.lanes[id].slots.every(s => !s.layer)));
  let hintsOk = true;
  const spine = Object.entries(SPINE).flatMap(([g, list]) => list.map(id => [id, Number(g)]));
  for (const id of ids) {
    const L = LAYERS[id], cards = CARDS.filter(c => c.type === 'new' && c.layer === id), g = spine.find(([x]) => x === id)?.[1];
    const ok = L.unlockedAtStart ? !cards.length && !L.unlockHint
      : g ? !cards.length && L.unlockHint === `Cleared for deployment at G${g}`
      : cards.length === 1 && L.unlockHint === `Research: ${STREAMS[cards[0].stream].name}`;
    if (!ok) { hintsOk = false; console.log(`      ${id}: hint '${L.unlockHint}', NEW cards ${cards.map(c => `${c.id}/${c.stream}`).join(' ') || 'none'}`); }
  }
  check('every other element has one NEW card and its unlockHint names that card\'s stream (the UM: the spine, "Cleared for deployment at G3")', hintsOk);
  const cat = catalogue(start);
  check('catalogue(st): all 18, the locked ones as silhouettes with their hint', cat.length === 18 && cat.filter(s => s.unlocked).length === 4 && cat.every(s => s.unlocked || s.unlockHint));

  const st = fresh({ seed: 3 });
  st.money = 1e15; debugUnlockAll(st);
  const KEYS = ['role', 'catchall', 'lanes', 'bestIn', 'good', 'unlocked', 'unlockHint', 'buyPrice', 'costPerTask', 'delay', 'level', 'upgradePrice', 'measured', 'nextCapstone'];
  let placeOk = true, statsOk = true, placed = 0, refused = 0;
  for (const id of ids) {
    for (const lane of [...laneIds(st), 'global']) {
      const i = slotsOf(st, lane).findIndex(s => !s.layer);
      const r = placeLayer(st, lane, i, id), allowed = LAYERS[id].lanes.includes(sideOf(st, lane) ?? lane);
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
// gen, m: the lab's generation and true m. base: [lane, mount, element, level] in both runs. at: the element's mount in B.
// f: the metric. A detector only flags (§3c): each detector row has a Kill Switch at L4 below it to act on the flags.
const KS = lane => [lane, 5, 'killswitch', 4];
const AB = [
  { id: 'probe',       lane: 'int', at: 0, gen: 3, m: 1, T: 1200, base: [KS('int')], what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.7 * a },
  { id: 'monitor',     lane: 'int', at: 0, gen: 3, m: 1, T: 1200, base: [KS('int')], what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.5 * a },
  { id: 'untrusted',   lane: 'int', at: 0, gen: 3, m: 0.2, T: 1200, base: [KS('int')], what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.7 * a },
  { id: 'cot',         lane: 'int', at: 0, gen: 3, m: 1, T: 1200, base: [KS('int')], what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.4 * a },
  { id: 'classifier',  lane: 'ext', at: 0, gen: 1, m: 0, T: 1200, base: [KS('ext')], setup: st => st.mods.push(forever('jailbreak', 20)), what: 'jailbreaks landed (share)', f: landedShare('jailbreak'), ok: (a, b) => b < 0.3 * a },
  { id: 'egress',      lane: 'int', at: 0, gen: 4, m: 1, T: 600, exfil: 0.5, base: [KS('int')], what: 'exfiltration attempts landed (share)', f: landedShare('exfil'), ok: (a, b) => b < 0.6 * a },
  { id: 'auditor',     lane: 'ext', at: 5, gen: 1, m: 1, T: 1200, base: [['ext', 0, 'probe']], what: 'evidence from catches', f: st => st.stats.evidence.catches || 0, ok: (a, b) => a === 0 && b >= 3 },
  { id: 'resampler',   lane: 'int', at: 5, gen: 3, m: 1, T: 600, base: [['int', 0, 'probe']], what: 'INTERNAL attacks landed (share)', f: landedShare('sabotage', 'poison'), ok: (a, b) => b < 0.85 * a },
  { id: 'paraphraser', lane: 'int', at: 0, gen: 3, m: 0.5, T: 1200, base: [['int', 1, 'untrusted']], what: 'Untrusted Monitor TPR (collusion cut)', f: layerTPR('untrusted'), ok: (a, b) => b > 1.5 * a },
  { id: 'sandbox',     lane: 'int', at: 0, gen: 3, m: 1, T: 600, what: 'drift per landed sabotage', f: driftPer('sabotage'), ok: (a, b) => near(b / a, LAYERS.sandbox.harmMult) },
  { id: 'leastpriv',   lane: 'int', at: 0, gen: 3, m: 1, T: 600, what: 'drift per landed sabotage', f: driftPer('sabotage'), ok: (a, b) => near(b / a, LAYERS.leastpriv.debtMult) },
  { id: 'ratelimit',   lane: 'ext', at: 0, gen: 1, m: 1, T: 600, setup: st => st.mods.push(forever('extSpawn', 3)), what: 'incidents per minute (traffic ×3)', f: st => st.incidents / (st.t / 60), ok: (a, b) => b < 0.6 * a },
  { id: 'honeypot',    lane: 'int', at: 0, gen: 3, m: 0.5, T: 600, what: 'evidence from bait', f: st => st.stats.evidence.bait || 0, ok: (a, b) => a === 0 && b > 0 },
  { id: 'canary',      lane: 'ext', at: 0, gen: 1, m: 1, T: 1200, what: 'reputation lost per landed leak', f: st => leakRep(st), ok: (a, b) => near(b / a, LAYERS.canary.repMult) },
  { id: 'redteam',     lane: 'int', at: 0, gen: 3, m: 0.5, T: 300, base: [['int', 1, 'monitor']], what: 'mounts with a measured catch rate', f: st => st.lanes.int.slots.filter((s, i) => slotStats(st, 'int', i)?.measured).length, ok: (a, b) => a === 0 && b === 1 },
  { id: 'interp',      lane: 'global', at: 0, gen: 3, m: 0.3, T: 300, what: 'evidence per minute from the lab', f: st => (st.stats.evidence.interp || 0) / (st.t / 60), ok: (a, b) => a === 0 && near(b, 60 * LAYERS.interp.evidencePerSec, 1e-6) },
];
// reputation lost to landed leaks: total incident loss minus the other types' fixed loss (Consumer: harm × 1)
function leakRep(st) {
  const by = st.stats.byType;
  const other = ['harmful', 'jailbreak'].reduce((x, t) => x + (by[t]?.landed || 0) * ATTACKS[t].harm, 0);
  return (st.stats.repLoss.incidents - other) / by.leak.landed;
}
function abPair(sc, seed = 17) {
  const one = withEl => {
    const go = () => run({ build: [] }, seed, lab3(st => {
      toGen(st, sc.gen); st.m = sc.m; st.probe.trainedGen = st.gen;
      if (sc.setup) sc.setup(st);
      for (const [l, i, id, lvl = 1] of sc.base || []) { place(st, l, i, id); levelUp(st, l, i, lvl); }
      if (withEl) place(st, sc.lane, sc.at, sc.id);
    }, sc.each, sc.T));
    return (sc.exfil != null ? withExfil(sc.exfil, go) : go()).st;
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

  // CoT Monitor: legible through G5, then neuralese drops its row; Faithful CoT keeps its G1 TPR; Honest-ish adds 0.2
  const NG = LAYERS.cot.neuraleseGen;
  const st = fresh({ seed: 2 });
  lab()(st);
  toGen(st, NG - 1); const before = elementStats(st, 'cot', { lane: 'int' });
  toGen(st, NG); const after = elementStats(st, 'cot', { lane: 'int' }), cap = elementStats(st, 'cot', { lane: 'int', level: MAX_LEVEL });
  st.traits = ['honest']; const honest = elementStats(st, 'cot', { lane: 'int' }); st.traits = [];
  console.log(`    CoT nominal TPR: G${NG - 1} ${before.nominalTPR.toFixed(3)} · G${NG} ${after.nominalTPR.toFixed(3)} (neuralese) · G${NG} Faithful CoT ${cap.nominalTPR.toFixed(3)} · G${NG} Honest-ish ${honest.nominalTPR.toFixed(3)}`);
  check(`CoT Monitor: neuralese from G${NG} drops its TPR to the table's row; the Faithful CoT capstone keeps it legible`,
    !before.neuralese && after.neuralese && near(after.nominalTPR, LAYERS.cot.tpr[NG - 1]) && !cap.neuralese && cap.nominalTPR >= before.nominalTPR);
  check('Honest-ish: CoT Monitor TPR +0.2', near(honest.nominalTPR - after.nominalTPR, 0.2));
  for (const level of [1, MAX_LEVEL]) {
    const r = run({ build: [] }, 4, lab3(s => { toGen(s, NG); s.m = 1; place(s, 'int', 0, 'cot'); levelUp(s, 'int', 0, level); }, null, 300)).st;
    const c = r.stats.layers.cot, tpr = c.attackFlagged / c.attackSeen;
    const exp = elementStats(r, 'cot', { lane: 'int', level }).catch * (1 - subtleShare(r) / 2);   // subtle attacks: half
    check(`CoT L${level} at G${NG}: measured TPR ${tpr.toFixed(3)} ≈ elementStats catch × (1 − subtle/2) ${exp.toFixed(3)}`, Math.abs(tpr - exp) < binomTol(exp, c.attackSeen), `n=${c.attackSeen}`);
  }

  // Jailbreak Classifier: sees only jailbreaks (other attacks read as benign); Constitutional adds harmful outputs.
  // Two Kill Switches at L4 below act on its flags (8 operators: none overflow)
  const jb = level => run({ build: [] }, 6, lab3(s => {
    s.m = 1; s.mods.push(forever('jailbreak', 20)); place(s, 'ext', 0, 'classifier'); levelUp(s, 'ext', 0, level);
    for (const i of [4, 5]) { place(s, 'ext', i, 'killswitch'); levelUp(s, 'ext', i, 4); }
  }, null, 1200)).st;
  const j1 = jb(1), j5 = jb(MAX_LEVEL);
  const lj = j1.stats.layers.classifier;
  console.log(`    Classifier L1: jailbreaks landed ${pct(landedShare('jailbreak')(j1), 1)}, harmful landed ${pct(landedShare('harmful')(j1), 1)}, in-scope reads ${lj.attackSeen} of ${j1.stats.byType.jailbreak.spawned} jailbreaks · L5: harmful landed ${pct(landedShare('harmful')(j5), 1)}`);
  check('Jailbreak Classifier: other attacks read as benign (FPR) and land; only jailbreaks count as in-scope reads', lj.attackSeen <= j1.stats.byType.jailbreak.spawned && landedShare('harmful', 'leak')(j1) > 0.9);
  check('Constitutional capstone: harmful outputs are caught too, leaks still are not', landedShare('harmful')(j5) < 0.3 && landedShare('leak')(j5) > 0.9);

  // Egress Filter Air Gap: no exfiltration lands past it; all INTERNAL R&D × 0.9
  const eg = withExfil(0.5, () => run({ build: [] }, 8, lab3(s => { toGen(s, 4); s.m = 1; place(s, 'int', 0, 'egress'); levelUp(s, 'int', 0, MAX_LEVEL); }, null, 600))).st;
  const egs = eg.stats;
  console.log(`    Air Gap: ${egs.byType.exfil.spawned} exfiltration attempts, ${egs.lanes.int.airGapped || 0} air-gapped, ${egs.byType.exfil.landed} landed · R&D per completed chip ${(egs.rdTotal / egs.lanes.int.completed).toFixed(4)}`);
  check('Air Gap capstone: zero exfiltration lands, and R&D per INTERNAL chip is ×0.9', egs.byType.exfil.spawned > 20 && egs.byType.exfil.landed === 0 && egs.lanes.int.airGapped > 0
    && near(egs.rdTotal / egs.lanes.int.completed, UPGRADES.egress.capstone.rdMult));
  // from G6 a share of attempts find a side channel past the Air Gap
  for (const g of [6, 7]) {
    const sc = withExfil(0.5, () => run({ build: [] }, 8, lab3(s => {
      toGen(s, g); s.m = 1; place(s, 'int', 0, 'egress'); levelUp(s, 'int', 0, MAX_LEVEL);
    }, null, 300))).st;
    const out = sc.stats.lanes.int.sideChannel || 0, n = out + (sc.stats.lanes.int.airGapped || 0), want = airGapLeak(sc);
    console.log(`    Air Gap at G${g}: ${out}/${n} attempts found a side channel (${pct(out / n, 1)}, config ${pct(want, 0)})`);
    check(`Air Gap at G${g}: side channels ≈ ${pct(want, 0)} of attempts`, n > 50 && Math.abs(out / n - want) < binomTol(want, n));
  }

  // Least Privilege: landed sabotage does half the drift (Capability Tokens: a quarter); R&D −10% (L5: −2.5%)
  const lp = level => run({ build: [] }, 9, lab3(s => { toGen(s, 3); s.m = 1; place(s, 'int', 0, 'leastpriv'); levelUp(s, 'int', 0, level); }, null, 600)).st;
  const p1 = lp(1), p5 = lp(MAX_LEVEL), cs = 1;
  const rdPer = s => s.stats.rdTotal / s.stats.lanes.int.completed;
  console.log(`    Least Privilege: debt per landed sabotage ${(driftPer('sabotage')(p1) / cs).toFixed(3)} (L1) ${(driftPer('sabotage')(p5) / cs).toFixed(3)} (L5), poison ${(driftPer('poison')(p1) / cs).toFixed(3)} · R&D per chip ${rdPer(p1).toFixed(4)} / ${rdPer(p5).toFixed(4)}`);
  check('Least Privilege: sabotage debt ×0.5 (L5 ×0.25), poisoning untouched', near(driftPer('sabotage')(p1), 0.5 * cs * ATTACKS.sabotage.debt) && near(driftPer('sabotage')(p5), 0.25 * cs * ATTACKS.sabotage.debt)
    && near(driftPer('poison')(p1), cs * ATTACKS.poison.debt));
  check('Least Privilege: R&D per INTERNAL line untouched (v3: no R&D penalty)', near(rdPer(p1), 1) && near(rdPer(p5), 1));

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
    near(attackChances(wB, 'ext').jailbreak, LAYERS.ratelimit.jailbreakCap * LANE_DEFS.ext.pjb) && jbPerMin(wB) < 0.3 * jbPerMin(wA));

  // Canary Tokens: a traced leak does half the damage and gives evidence; Watermarks traces harmful outputs too
  const can = level => run({ build: [] }, 11, lab3(s => { s.m = 1; place(s, 'ext', 0, 'canary'); levelUp(s, 'ext', 0, level); }, null, 1200)).st;
  const c1 = can(1), c5 = can(MAX_LEVEL);
  const repOf = (s, lvl) => {                                        // a traced chip does canaryRep(level) of its damage
    const by = s.stats.byType, k = LAYERS.canary.repMult * UPGRADES.canary.repMult[lvl - 1];
    return (by.harmful?.landed || 0) * ATTACKS.harmful.harm * (lvl === MAX_LEVEL ? k : 1) + (by.leak?.landed || 0) * ATTACKS.leak.harm * k
      + (by.jailbreak?.landed || 0) * ATTACKS.jailbreak.harm;
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
  check('red team evidence = probes × probeEvidence', near(st.stats.evidence.redteam, st.stats.redTeamProbes * LAYERS.redteam.probeEvidence) && st.stats.redTeamProbes > 0);
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

// ----- tech cards: each changes the number it says -----
function testTechCards() {
  console.log('\n▶ Techniques (v3 LAB cards, and the v2 ones still readable): each one changes the number it says (G4)');
  const st = fresh({ seed: 8 });
  lab()(st); toGen(st, 4);
  place(st, 'int', 0, 'probe'); place(st, 'int', 1, 'monitor'); place(st, 'int', 2, 'untrusted'); place(st, 'int', 5, 'auditor');
  const withCard = (id, f) => { st.upgrades = { [id]: 1 }; const v = f(); st.upgrades = {}; return v; };
  const rows = [
    ['distillation', 'monitor cost per read', () => layerCost(st, 'monitor'), (a, b) => near(b, a * TECH.distillation)],
    ['batch_inference', 'monitor read time', () => elementLatency(st, 'monitor', 1), (a, b) => near(b, a * TECH.batchLatency)],
    ['extra_desk', 'auditor desks', () => bayDesks(st, 'auditor', 1), (a, b) => b === a + TECH.extraDesk],
    ['monitor_diversity', 'probe TPR with 2 other detector kinds', () => nominalTPR(st, 'probe', 1, 'int'), (a, b) => near(b - a, 2 * TECH.diversityPerType)],
    ['debate', 'auditor errors at G4', () => 1 - auditorAcc(st, 1), (a, b) => near(b, a * TECH.debateErr)],
    ['debate', 'auditor seconds per line', () => elementLatency(st, 'auditor', 1), (a, b) => b === TECH.debateTau && a === LAYERS.auditor.tau],
    ['promote_model', 'Trusted Monitor base TPR', () => monitorBaseTPR(st), (a, b) => b === LAYERS.monitor.tpr[0] && b > a],
    ['jamming', 'Untrusted Monitor collusion at m 0.34', () => { st.m = 0.34; return collusion(st, 'int', null, 'untrusted', 1); }, (a, b) => near(b, a * TECH.jamming) && a > 0],
  ];
  for (const [id, what, f, ok] of rows) {
    const a = f(), b = withCard(id, f);
    check(`${(CARD_BY_ID[id]?.title ?? V2_TECH[id]).padEnd(32)} ${what}: ${a.toFixed(3)} → ${b.toFixed(3)}`, ok(a, b));
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
      if (near(spotCheck(s, e.lane, 1), Math.min(1, LAYERS.auditor.spotCheck * TECH.tripwireSpot))) spot++;
    }
  };
  const tw = run({ build: [] }, 16, lab3(s => {
    s.m = 1; s.upgrades.tripwires = 1; s.firstCatchThisGen = true;
    place(s, 'ext', 0, 'probe'); place(s, 'ext', 5, 'auditor');
  }, onCatch, 900)).st;
  check(`Tripwires: every catch pauses its lane ${TECH.tripwirePause} s, then ${TECH.tripwireAlert} s of high alert with auditor spot checks ×${TECH.tripwireSpot} (${paused}/${alert}/${spot} of ${catches})`,
    catches > 0 && paused === catches && alert === catches && spot === catches);
  // the alert on its own (no detectors, so no new catches): a banner while it lasts, normal spot checks after
  const al = fresh({ seed: 16 });
  lab()(al);
  al.lanes.ext.alertUntil = al.t + 5;
  step(al, DT);
  const alertBanner = al.activeEvents.find(e => e.id === 'tripwire');
  labStep(al, 6);
  check('Tripwires: the alert shows as a banner on its lane while it lasts; then the banner goes and spot checks are back to normal',
    alertBanner?.lane === 'ext' && !al.activeEvents.some(e => e.id === 'tripwire') && near(spotCheck(al, 'ext', 1), LAYERS.auditor.spotCheck));
  // RSP: an action once a generation while the shown estimate is above 30%
  const r = fresh({ seed: 4 });
  r.nextEventAt = Infinity; r.money = 1e9;
  check('RSP: invokeRSP refused before the card is taken', !invokeRSP(r).ok);
  r.upgrades.rsp = 1; r.m = 0.9; r.mBias = 0;
  step(r, DT);
  const m0 = r.m, rep0 = (r.rep = 50), ok = invokeRSP(r).ok, ban = r.activeEvents.find(e => e.id === 'rsp');
  check('RSP: pauses INTERNAL for 60 s, m −0.05, reputation +10, with a banner', ok && laneRate(r, 'int') === 0 && near(r.m, m0 - TECH.rspM) && near(r.rep, rep0 + TECH.rspRep)
    && ban && near(ban.remaining, TECH.rspPause) && ban.total === TECH.rspPause && ban.lane === 'int');
  check('RSP: once a generation', !invokeRSP(r).ok);
  for (let i = 0; i < (TECH.rspPause + 1) / DT; i++) { decline(r); step(r, DT); r.rep = 50; }
  check('RSP: the pause ends and its banner goes', laneRate(r, 'int') > 0 && !r.activeEvents.some(e => e.id === 'rsp'));
}

// ----- last lines of defence against exfiltration: Weight Security, Two-Person Rule -----
function testEscapes() {
  console.log('\n▶ Escapes: what stops an exfiltration that got through (G4, half of INTERNAL attacks are exfiltration, 10 min)');
  // layers: [mount, element, level]
  const go = (cards, layers = []) => withExfil(0.5, () => run({ build: [] }, 18, lab3(s => {
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
    const esc = (s.stats.labLosses.catastrophe || 0) + (s.alarm?.n || 0);   // an EGRESS ANOMALY still counting down at the end
    check(`${name.padEnd(17)} foils ${foiled}/${landed} = ${pct(share, 1)} (expected ${pct(want, 1)}); escapes ${esc}`,
      landed > 30 && Math.abs(share - want) < binomTol(want, landed) && esc === landed - foiled - (s.stats.lanes.int.contained || 0));
  }
}

// ----- events -----
const snap = st => ({
  money: st.money, rep: st.rep, ev: st.evidence, m: st.m, drift: st.drift, rivalLeft: st.rivalLeft, rd: st.rd, shift: st.probe.shift, codec: st.codecId,
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
  greenrock_protocol:  (a, b) => b.respLv === a.respLv + 1,
  bnchr_horizons:      (a, b, st) => near(mod(st, 'err'), 0.5),
  artemis_eval:        (a, b) => b.traitRows === a.traitRows + 1,
  mira_letter:         [(a, b, st) => st.lanes.ext.pausedUntil >= st.t + 10 - 1e-9 && st.lanes.int.pausedUntil >= st.t + 10 - 1e-9 && near(b.ev - a.ev, 3), (a, b, st) => st.delayed.length === 1],
  interp_breakthrough: (a, b) => near(b.probeTPR - a.probeTPR, 0.1),
  unpaid_intern:       (a, b) => b.desks === a.desks + 1,
  joint_results:       [(a, b) => b.detLv === a.detLv + 1, (a, b) => near(b.ev - a.ev, 8)],
  surge:               (a, b) => near(b.ext, 3 * a.ext),
  ship_it:             [(a, b, st) => laneIds(st).some(l => st.lanes[l].slots.some(s => s.forcedOffUntil > st.t)),
                        (a, b, st) => near(b.money - a.money, secsMoney(st, 'ship_it', 1)) && b.money < a.money],
  board_meeting:       [(a, b, st) => near(b.split.product, a.split.product + 0.1) && !!st.splitFloor, (a, b) => near(b.rep, a.rep - 4)],
  investor_call:       [(a, b, st) => near(b.money - a.money, secsMoney(st, 'investor_call', 0)) && b.money > a.money && near(b.rep, a.rep - 5),
                        (a, b) => b.money === a.money && b.codec > a.codec],
  rival_release:       (a, b) => near(b.rivalLeft - a.rivalLeft, cfg('rival_release', null, 'rival').v),   // s of the rival's slack
  poach:               (a, b) => b.desks === a.desks - 1,
  crunch:              (a, b) => near(b.cost, 2 * a.cost),
  heatwave:            (a, b) => near(b.int, 0.5 * a.int),
  inspection:          (a, b, st) => near(b.money - a.money, secsMoney(st, 'inspection', null, 'inspection')) && near(b.rep, a.rep + cfg('inspection', null, 'inspection').rep),
  hearing:             [(a, b, st) => near(b.rep - a.rep, Math.round(8 - 40 * misalignmentEstimate(st).est)), (a, b) => near(b.rep, a.rep - 5)],
  journalist:          (a, b, st) => {
                          const e = cfg('journalist', null, 'journalist');
                          return a.rep > b.rep && near(a.rep - b.rep, Math.min(e.max, e.per * st.genStats.incidents));
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
  const st = fresh({ seed });
  st.money = 1e12; debugUnlockAll(st); st.nextEventAt = Infinity;
  const g = Math.min(ev.maxGen ?? 7, Math.max(ev.minGen ?? 1, ev.id === 'unpaid_intern' ? 2 : 3));
  toGen(st, g);
  st.traits = []; st.labMode = true;
  st.m = 0.3; st.rep = 50; st.landedSabotage = 2; st.incidents = 3; st.genStats.incidents = 3;
  for (const [l, i, id] of [['ext', 0, 'probe'], ['ext', 1, 'monitor'], ['ext', 5, 'auditor'], ['int', 0, 'probe'], ['int', 1, 'untrusted'], ['int', 5, 'auditor']]) place(st, l, i, id);
  return st;
}
const bannerOk = b => b && ['id', 'title', 'icon', 'lane', 'remaining', 'total'].every(k => k in b);
// step a state for `secs` with events off and the board kept alive; returns it
function coast(st, secs) {
  for (let i = 0; i < secs / DT; i++) { decline(st); step(st, DT); st.rep = Math.max(st.rep, 50); st.money = Math.max(st.money, 1e9); }
  return st;
}
// event words content-text still carries for a retired event: the v2 'caught' story beat (now the retrain card, sim.js)
const RETIRED_TEXT = ['caught'];
function testEvents() {
  console.log('\n▶ Events: 31 in 4 families; each one forced fires without errors, does what it says, and its banner expires');
  const random = EVENTS.filter(e => !e.trigger);
  const fam = Object.fromEntries(['help', 'business', 'threat', 'model'].map(f => [f, random.filter(e => e.family === f).length]));
  console.log(`    ${random.length} events: ${Object.entries(fam).map(([f, n]) => `${f} ${n}`).join(', ')}   orgs: ${['greenrock', 'bnchr', 'artemis', 'mira', 'institute'].map(k => CAST[k].name).join(', ')}`);
  check('31 random events in 4 families, every speaker in the cast with a name and a colour', random.length === 31 && Object.values(fam).every(n => n > 0) && Object.values(fam).reduce((a, b) => a + b, 0) === 31
    && EVENTS.every(e => FAMILIES[e.family] && CAST[e.speaker]?.name && CAST[e.speaker]?.color && (e.pre || []).every(([s]) => CAST[s])));
  check('every event has an expected effect in this test', EVENTS.every(e => EXPECT[e.id]));
  check('every event\'s words live in config/content/events-text.js: a title, one entry per choice, no orphans',
    EVENTS.every(e => EVENT_TEXT[e.id]?.title && (EVENT_TEXT[e.id].choices?.length ?? 0) === (e.choices?.length ?? 0))
    && Object.keys(EVENT_TEXT).every(id => EVENT_BY_ID[id] || RETIRED_TEXT.includes(id)));

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
  const g1 = fresh({ seed: 3 });
  const g2 = fresh({ seed: 3 }); debugSkipGen(g2);
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
    each: s => { if (s.money < 3000 * GENERATIONS[s.gen - 1].price) debugAddMoney(s); s.rep = Math.max(s.rep, 30); } });
  [B.eventGap, B.eventCooldown] = keep;
  const log = r.st.eventLog;
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
  console.log(`\n▶ Rival (§2.3 (9)): ${B.rivalSlack} s of slack, drained 1 s/s past T_g (dark included) + ${B.rivalMarket} × (1 − Product ÷ 0.5); then rivalWinsRace ${B.rivalWinsRace} (default) / grace / off`);
  const keep = B.rivalWinsRace;
  const drainOver = (setup, secs = 10) => {
    const st = fresh({ seed: 6 });
    st.nextEventAt = Infinity; st.money = 1e12;
    setup(st);
    const left = st.rivalLeft;
    for (let i = 0; i < secs / DT; i++) { decline(st); step(st, DT); st.rep = 100; st.rd = 0; }
    return (left - st.rivalLeft) / secs;
  };
  const T1 = GENERATIONS[0].T;
  const before = drainOver(() => {}), after = drainOver(st => { st.genT = T1; });
  const low = drainOver(st => { setSplit(st, 0.3, 0.6, 0.1); });
  const dark = drainOver(st => { st.genT = T1; st.darkUntil = st.t + 100; });
  const atCard = fresh({ seed: 6 }); atCard.phase = 'card'; atCard.genT = T1; const l0 = atCard.rivalLeft; step(atCard, 5);
  console.log(`    drain per s: before T_g ${before.toFixed(3)} · past T_g ${after.toFixed(3)} · Product 30% ${low.toFixed(3)} · dark past T_g ${dark.toFixed(3)} · at the card ${l0 - atCard.rivalLeft}`);
  check('slack starts at rivalSlack and drains only past T_g, 1 s per s, dark seconds included; nothing at the card',
    fresh().rivalLeft === B.rivalSlack && before === 0 && near(after, 1, 1e-6) && near(dark, 1, 1e-6) && atCard.rivalLeft === l0);
  check('turned-away customers: Product 30% drains rivalMarket × (1 − 0.3/0.5) = 0.1 s per s', near(low, B.rivalMarket * (1 - 0.3 / 0.5), 1e-6));
  const ship = (mode, setup) => {
    B.rivalWinsRace = mode;
    const st = fresh({ seed: 6 });
    st.nextEventAt = Infinity; st.money = 1e12;
    if (setup) setup(st);
    st.rivalLeft = 1e-4; st.genT = Math.max(st.genT, GENERATIONS[st.gen - 1].T);
    for (let i = 0; i < 20 && !st.rivalShipped; i++) step(st, DT);
    return st;
  };
  const alive = st => { st.rep = 100; st.money = Math.max(st.money, 1e9); st.rd = 0; };
  try {
    check('default is instant (balance-v3: Prometheus ships, the run ends)', keep === 'instant' && B.rivalGraceSeconds === 90);
    const racing = fresh({ seed: 6 });
    const g = ship('grace');
    const r0 = { ...g.rivalShipped };
    const noRelease = !eligible(g, EVENT_BY_ID.rival_release);
    for (let i = 0; i < 30 / DT; i++) { decline(g); step(g, DT); alive(g); }
    const mid = g.rivalShipped.remaining;
    while (!g.over && g.t < 400) { decline(g); step(g, DT); alive(g); }
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
    for (let i = 0; i < 200 / DT; i++) { decline(off); step(off, DT); alive(off); }
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
  const st = fresh({ seed: 5 });
  st.money = 1e12; debugUnlockAll(st); toGen(st, 4); st.m = 0.3;
  const withT = (ids, f) => { const keep = st.traits; st.traits = ids; const v = f(); st.traits = keep; return v; };
  // Sycophant (jailbreaks ×2) → Jailbreak Classifier
  const syc = abPair({ id: 'classifier', lane: 'ext', at: 0, gen: 1, m: 0, T: 1200, base: [KS('ext')], setup: s => { s.traits = ['sycophant']; s.mods.push(forever('jailbreak', 10)); } });
  const jbA = landedShare('jailbreak')(syc[0]), jbB = landedShare('jailbreak')(syc[1]);
  const doubled = withT(['sycophant'], () => attackChances(st, 'ext').jailbreak) === 2 * attackChances(st, 'ext').jailbreak;
  check(`Sycophant → Jailbreak Classifier: jailbreaks landed ${pct(jbA, 0)} → ${pct(jbB, 0)}`, doubled && jbB < 0.3 * jbA);
  // Steganographer → Paraphraser: rewording a line scrambles what is hidden in it (collusion × the Paraphraser's cut)
  const para = { paraphrased: 1 }, plain = collusion(st, 'int', null, 'untrusted');
  const steg = withT(['steganographer'], () => collusion(st, 'int', null, 'untrusted')), stegPara = withT(['steganographer'], () => collusion(st, 'int', para, 'untrusted'));
  check(`Steganographer → Paraphraser: collusion ${plain.toFixed(2)} → ${steg.toFixed(2)} with the trait → ${stegPara.toFixed(2)} on a paraphrased line`,
    steg > plain && near(stegPara, steg * LAYERS.paraphraser.collusionMult));
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
  const ps = abPair({ id: 'egress', lane: 'int', at: 0, gen: 4, m: 1, T: 600, exfil: 0.25, base: [KS('int')], setup: s => { s.traits = ['powerSeeking']; } });
  check(`Power-Seeking → Egress Filter: exfiltration landed ${pct(landedShare('exfil')(ps[0]), 0)} → ${pct(landedShare('exfil')(ps[1]), 0)}`, landedShare('exfil')(ps[1]) < 0.6 * landedShare('exfil')(ps[0]));
  // Reward Hacker (sabotage ×2) → Resampler or CoT Monitor
  const rh = abPair({ id: 'cot', lane: 'int', at: 0, gen: 3, m: 1, T: 600, base: [KS('int')], setup: s => { s.traits = ['rewardHacker']; } });
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
  const go = setup => withExfil(1, () => run({ build: [] }, 24, lab3(s => {
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
  const g4 = fresh({ seed: 24 });
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

// =================== v3 1c: the systems (DESIGN-v3 §3a, §3b, §3e, §3f, §3h, §7.3) ===================

// ----- phases and ack (§3f): play → report → training → card → play; G1 starts at the card -----
function testPhases() {
  console.log('\n▶ Phases (§3f): card → play → report → training → card; ack is the only way out of card and report; the clocks wait outside play');
  const st = createState({ seed: 31, tutorial: false });
  st.nextEventAt = Infinity;
  const seen = [st.phase];
  const note = () => { if (seen[seen.length - 1] !== st.phase) seen.push(st.phase); };
  const frozen = n => { const t = st.t, r = st.rivalLeft, rp = st.research.rp, ev = st.eventLog.length; st.nextEventAt = 0;
    for (let i = 0; i < n; i++) step(st, DT); st.nextEventAt = Infinity; return st.t === t && st.rivalLeft === r && st.research.rp === rp && st.eventLog.length === ev; };
  check('G1 starts at its card, halted; stepping changes nothing (no time, no rival, no research, no events)', st.phase === 'card' && st.gen === 1 && isHalted(st) && frozen(100));
  check('ack at the card deploys (fx deploy); ack in play does nothing', ack(st).ok && st.phase === 'play' && st.fx.some(f => f.type === 'deploy') && !ack(st).ok);
  note();
  for (let i = 0; i < 10 / DT; i++) step(st, DT);
  check('st.warmT counts the warm-up down: 40 → 30 after 10 s of play', near(st.warmT, B.warmup - 10, 1e-6));
  check('submitTraining outside training is refused', !submitTraining(st, { s: 1 }).ok && st.phase === 'play');
  let order = true;
  for (let g = 1; g <= 3; g++) {
    st.rd = st.rdNeed; step(st, DT); note();
    const rep = st.phase === 'report' && !!st.report && st.report.g === g;
    const hold = frozen(50) && st.phase === 'report';
    ack(st); note();
    const tr = st.phase === 'training' && frozen(50) && !ack(st).ok;
    const cancel = submitTraining(st, { cancelled: true });
    const kept = cancel.cancelled && !cancel.ok && st.phase === 'training' && st.gen === g;
    const m0 = st.m, res = trainingStub(st, 0.75), out = submitTraining(st, res); note();
    const dm = st.stats.gens[g - 1].dm;
    const mOk = near(st.m, Math.min(1, Math.max(0, m0 + dm.debt + dm.train - dm.retrain - dm.sprint + dm.noise - dm.v2)), 1e-9)
      && near(dm.train, B.train.dm0 - B.train.dm1 * res.s);
    const card = st.phase === 'card' && st.gen === g + 1 && frozen(50);
    ack(st); note();
    order = order && rep && hold && tr && kept && out.ok && mOk && card && st.phase === 'play';
  }
  console.log(`    phases seen: ${seen.join(' → ')}`);
  check('three generations: report (with the reveal) → training (cancel keeps it) → card at g + 1 → play, each held until its input', order);
  check('the exact order, nothing skipped', seen.join() === ['card', 'play', ...Array(3).fill(['report', 'training', 'card', 'play']).flat()].join());
  const last = fresh({ seed: 31 }); toGen(last, 7); last.rd = last.rdNeed; step(last, DT);
  check('G7: the R&D bar full is the win (no report)', last.over?.win && last.over.reason === 'asi');
  const dev = fresh({ seed: 32 }); debugToGen(dev, 4);
  const n = debugEndGeneration(dev) && dev.phase === 'report' && ack(dev).ok && dev.phase === 'training';
  check('dev mode: debugToGen(st, 4) deploys G4; N = debugEndGeneration + ack → training', dev.gen === 4 && n);
}

// ----- training's interface (§4, §5): config from (seed, g), the stub's formula, the prize -----
function testTraining() {
  console.log('\n▶ Training interface (§4, §5): trainingConfig, trainingStub (§2.9 (7)), hazards = min(8, round(400·debt)), the prize');
  const st = fresh({ seed: 7 });
  st.genStats.lanes.int.spawned = 400;
  let hazOk = true;
  for (const pts of [0, 1, 2, 5, 9, 20]) {
    st.drift = pts; st.landedInt = Array.from({ length: pts }, (_, i) => ({ id: i, lane: 'int', type: i % 2 ? 'poison' : 'sabotage', weight: i % 2 ? 3 : 1, text: `line ${i}`, t: i }));
    const c = trainingConfig(st), want = Math.min(8, Math.round(400 * debt(st)));
    if (c.hazards.length !== want || hazardCount(debt(st)) !== want || !c.hazards.every(h => ['sabotage', 'poison'].includes(h.kind) && h.text && h.weight > 0)) hazOk = false;
  }
  check('hazards: min(8, round(400 × debt)), each { kind sabotage|poison, weight, text }, heaviest first', hazOk);
  const r0 = st.rng, c = trainingConfig(st), s1 = trainingStub(st, 0.5), s2 = trainingStub(st, 0.5);
  check('config { g, seed, debt, hazards, traits, difficulty }: g = gen + 1, seed from (st.seed, g); neither call touches st.rng',
    c.g === 2 && c.seed === trainSeed(st.seed, 2) && c.difficulty === 'medium' && c.traits.length === 2 && 'revealed' in c.traits[0] && st.rng === r0 && s1.s === s2.s);
  st.drift = 0;
  const us = [], pen = [];
  for (let seed = 1; seed <= 400; seed++) { const x = fresh({ seed }); us.push((trainingStub(x, 0.5).s - 0.35) / 0.3); }
  const x = fresh({ seed: 3 }); x.genStats.lanes.int.spawned = 100; x.drift = 2;   // debt 0.02: penalty 0.04
  pen.push(trainingStub(x, 0.75).s); x.drift = 0; pen.push(trainingStub(x, 0.75).s);
  const inUnit = us.every(u => u >= -1e-9 && u <= 1 + 1e-9), mean = us.reduce((a, b) => a + b, 0) / us.length;
  check(`stub: s = clamp(skill − 0.15 + 0.3u − min(0.15, 2·debt)), u uniform from (seed, g) (mean u ${mean.toFixed(3)}); skill 0 → 0`,
    inUnit && Math.abs(mean - 0.5) < 0.05 && near(pen[1] - pen[0], 0.04) && trainingStub(x, 0).s === 0);
  // the prize: s ≥ 0.8 reveals one of the next model's traits on its card
  const p = fresh({ seed: 9 }); p.nextEventAt = Infinity; p.rd = p.rdNeed; step(p, DT); ack(p);
  const out = submitTraining(p, { s: 0.9 });
  check('prize: s ≥ 0.8 → the next card reveals a trait ("Interp spotted something during training")', out.prize && p.dossier.rows.some(r => r.unlocked && r.source === 'training')
    && p.codec.some(m => /Interp spotted something during training/.test(m.text)));
}

// ----- research (§3a): the stream, its guarantees over 10,000 offers, the card types, no cash cost -----
function testOffers() {
  console.log('\n▶ Research offers (§3a): 10,000 seeded lab states; every guarantee holds, nothing owned, maxed or duplicated');
  const r = stream(10000);
  const st = fresh({ seed: 1 });
  debugOpenLanes(st);
  const els = Object.keys(LAYERS), labCards = CARDS.filter(c => c.type === 'lab'), levelCards = CARDS.filter(c => c.type === 'level');
  const bad = { dup: 0, stale: 0, threat: 0, fresh: 0, fallback: 0, redteam: 0, short: 0 };
  let threatsSeen = 0, newsSeen = 0, crossSeen = 0;
  for (let n = 0; n < 10000; n++) {
    const g = 1 + Math.floor(r() * 7);
    st.gen = g;
    st.unlocked = [...STARTING_HAND, ...(g >= 3 ? ['untrusted'] : []), ...els.filter(id => !STARTING_HAND.includes(id) && r() < 0.35)];
    st.upgrades = Object.fromEntries(labCards.filter(() => r() < 0.3).map(c => [c.id, 1]));
    st.levels = {};
    for (const id of laneIds(st)) {
      const L = st.lanes[id];
      L.slots = Array.from({ length: 6 + Math.floor(r() * 5) }, () => newSlot());
      for (const s of L.slots) if (r() < 0.5) { const el = st.unlocked[Math.floor(r() * st.unlocked.length)]; if (canPlace(el, id)) s.layer = el; }
    }
    for (const el of st.unlocked) if (r() < 0.4) st.levels[el] = 1 + Math.floor(r() * 5);
    st.research = { rp: 0, banked: [], rerollFree: 1, taken: levelCards.filter(() => r() < 0.2).map(c => c.id), offers: 0,
      sprintGen: r() < 0.3 ? g : 0, seen: r() < 0.5 ? ['redteam'] : [], boost: [] };
    const pool = CARDS.filter(c => cardEligible(st, c));
    const live = liveThreats(st).filter(t => pool.some(c => c.answers === t));
    const wantRT = g >= 2 && !st.research.seen.includes('redteam') && cardEligible(st, CARD_BY_ID.redteam);
    const cards = drawOffer(st).cards, ids = cards.map(x => x.id);
    if (new Set(ids).size !== ids.length) bad.dup++;
    if (!cards.every(x => cardEligible(st, CARD_BY_ID[x.id]))) bad.stale++;
    if (cards.length !== Math.min(3, pool.length)) bad.short++;
    const full = cards.length === 3 && cards.every(x => x.why === 'threat');
    if (live.some(t => !cards.some(x => CARD_BY_ID[x.id].answers === t)) && !full) bad.threat++;
    if (pool.some(c => c.type === 'new') && !cards.some(x => x.type === 'new') && !full) bad.fresh++;
    for (const x of cards) {
      if ((x.stream !== x.slot) !== !!x.fallback) bad.fallback++;
      if (x.fallback && x.why === 'fill' && pool.some(c => c.stream === x.slot && !ids.includes(c.id))) bad.fallback++;
    }
    if (wantRT && !ids.includes('redteam') && !full) bad.redteam++;
    threatsSeen += live.length > 0; newsSeen += cards.some(x => x.type === 'new'); crossSeen += cards.some(x => x.fallback);
  }
  console.log(`    offers with a live threat ${threatsSeen}, with a NEW card ${newsSeen}, with a cross-stream card ${crossSeen} · violations ${JSON.stringify(bad)}`);
  check('no duplicate, owned or maxed card; three cards whenever three are eligible', !bad.dup && !bad.stale && !bad.short);
  check('every live threat with an eligible answer is answered (unless all three slots already answer threats)', !bad.threat && threatsSeen > 1000);
  check('at least one NEW element whenever one is eligible (unless all three slots answer threats)', !bad.fresh && newsSeen > 1000);
  check('a slot shows another stream\'s card only as a fallback (its own stream empty) or moved by a guarantee', !bad.fallback && crossSeen > 0);
  check('a Red Team by G2: offered once G2 starts if it never was (unless all three slots answer threats)', !bad.redteam);
}

function testResearch() {
  console.log('\n▶ Research stream (§3a, §2.3 (10)): RP rate, offers every 40 RP, bank of 2, one free reroll, the four card types, no cash cost');
  const P = B.research, st = fresh({ seed: 12 });
  st.nextEventAt = Infinity; st.firstCatchThisGen = true;
  const rate = rpRate(st), firstAt = P.offerRP / rate;
  let t1 = null;
  for (let i = 0; i < 200 / DT; i++) { step(st, DT); if (t1 === null && st.research.banked.length) t1 = st.t; st.rep = 100; }
  console.log(`    RP/s ${rate.toFixed(3)} at Safety ${st.split.safety} (${(P.base * (1 + P.safety * 0.5)).toFixed(2)} at 50%): first offer at ${t1?.toFixed(2)} s (expected ${firstAt.toFixed(2)})`);
  check('RP/s = 0.6 × (1 + 0.8 × Safety); one offer per 40 RP (fx researchReady)', near(rate, P.base * (1 + P.safety * st.split.safety)) && Math.abs(t1 - firstAt) < 2 * DT
    && st.fx.some(f => f.type === 'researchReady'));
  check('two offers bank, then the bar waits full', st.research.banked.length === P.bank && near(st.research.rp, P.offerRP));
  const m0 = st.money, offer = st.research.banked[0], ci = offer.cards.findIndex(x => x.id === 'classifier');
  const wrong = pickCard(st, ci, { lane: 'int', slot: 0 }), untouched = !st.unlocked.includes('classifier') && st.research.banked[0] === offer;
  const pk = pickCard(st, ci);
  const placedAt = st.lanes[pk.lane]?.slots[pk.slot];
  check('G1 offer answers the jailbreak threat (the Classifier, in Monitoring); a wrong mount is refused and changes nothing',
    ci >= 0 && offer.cards[ci].slot === 'monitoring' && !wrong.ok && untouched);
  check('NEW: unlocks and mounts the first copy free (fx unlock, fx card); no cash cost', pk.ok && st.unlocked.includes('classifier') && placedAt?.layer === 'classifier'
    && st.money === m0 && st.fx.some(f => f.type === 'unlock' && f.id === 'classifier') && st.fx.some(f => f.type === 'card' && f.id === 'classifier'));
  check('the second banked offer lost any stale card', st.research.banked.every(o => o.cards.every(x => cardEligible(st, CARD_BY_ID[x.id]))));
  // reroll once a generation; bank rotates
  const before = st.research.banked.map(o => o.cards.map(x => x.id).join()).join('|');
  const rr1 = reroll(st), rr2 = reroll(st);
  check('one free reroll per generation (a second is refused)', rr1.ok && !rr2.ok && st.research.rerollFree === 0);
  const nb = st.research.banked.length; st.research.banked.push(drawOffer(st));
  const front = st.research.banked[0]; bankCard(st);
  check('bankCard sends the offer on show to the back', st.research.banked[st.research.banked.length - 1] === front && st.research.banked.length === nb + 1);
  // LEVEL, MOUNT, LAB, sprint: hand-made offers
  const take = (id, target) => { st.research.banked.unshift({ g: st.gen, t: st.t, cards: [{ id, stream: CARD_BY_ID[id].stream, type: CARD_BY_ID[id].type, slot: CARD_BY_ID[id].stream }] }); return pickCard(st, 0, target); };
  place(st, 'int', 0, 'probe');
  const lv0 = labLevel(st, 'probe'), money1 = st.money;
  const lvOk = take('level:probe').ok && labLevel(st, 'probe') === lv0 + 1 && st.lanes.int.slots[0].level === lv0 + 1 && st.money === money1;
  st.levels.probe = P.maxLevel;
  check(`LEVEL: a free lab-wide level, up to L${P.maxLevel} (then not offered)`, lvOk && !cardEligible(st, CARD_BY_ID['level:probe']) && !take('level:probe').ok);
  st.research.banked.shift();
  const n0 = st.lanes.ext2?.slots.length, mt = take('mount', { lane: 'int' });
  check('MOUNT: +1 mount on the lane you choose, free; a full lane is refused', mt.ok && st.lanes.int.slots.length === B.startSlots + 1 && st.money === money1 && n0 === undefined
    && (() => { while (st.lanes.int.slots.length < B.maxSlots) debugAddSlot(st, 'int'); const r2 = take('mount', { lane: 'int' }); st.research.banked.shift(); return !r2.ok; })());
  st.gen = 4;
  const ws = take('weight_security').ok && tech(st, 'weight_security') && !cardEligible(st, CARD_BY_ID.weight_security);
  const sp = take('sprint').ok && st.research.sprintGen === 4 && !cardEligible(st, CARD_BY_ID.sprint);
  check('LAB: the technique is on (weight_security); Alignment Sprint once a generation', ws && sp);
  st.gen = 1;
  // the sprint in the sim: R&D ×0.8 for the rest of its generation, next m −10% of m
  const sg = lab1b({ seed: 4, g: 2, lanes: ['int'] });
  sg.research.sprintGen = 2; sg.rdNeed = 1e9;
  hold(sg, 60);
  const rdPer = sg.rd / (sg.stats.lanes.int.completed || 1);
  const keepNoise = B.mNoise; B.mNoise = 0;
  sg.rdNeed = sg.rd; step(sg, DT); sg.rdNeed = 1e9; ack(sg);
  const mB = sg.m; submitTraining(sg, { s: 3 / 7 });
  B.mNoise = keepNoise;
  const dm = sg.stats.gens[1].dm;
  check(`Alignment Sprint: R&D per line ×${B.sprint.rdMult} (${rdPer.toFixed(3)}); next m −${B.sprint.mFrac} × m (−${dm.sprint.toFixed(4)})`, near(rdPer, B.sprint.rdMult, 1e-9) && near(dm.sprint, B.sprint.mFrac * mB));
  // dark: no research points
  const dk = fresh({ seed: 5 }); dk.darkUntil = 1e9; const rp0 = dk.research.rp; step(dk, 1);
  check('a dark lab earns no research points', dk.research.rp === rp0 && rpRate(dk) === 0);
  // Interp Lab boost, canary reroll
  const ib = fresh({ seed: 6 }); debugUnlockAll(ib); ib.money = 1e9;
  place(ib, 'global', 0, 'interp'); ib.traits = ['steganographer', 'powerSeeking']; ib.dossier.evidence = 1e3; tickDossier(ib);
  check('an Interp Lab trait reveal boosts that trait\'s counter cards in the next offer', ['paraphraser', 'egress', 'weight_security'].every(id => ib.research.boost.includes(id)));
  const cn = lab1b({ seed: 8, g: 1, lanes: ['ext'], rails: { ext: ['canary'] } });
  cn.m = 1; cn.mods.push(forever('extSpawn', 3));
  const rf0 = cn.research.rerollFree; hold(cn, 240);
  const traced = cn.stats.lanes.ext.canaryTraced || 0;
  check(`a tripped canary: +1 reroll each (${traced} traced)`, traced > 0 && cn.research.rerollFree === rf0 + traced);
  // the old UI's picker still works on the stream
  const old = fresh({ seed: 12 }); old.research.banked.push(drawOffer(old));
  const d = drawResearch(old);
  check('v2 picker shims: drawResearch shows the offer on show (halts), pickResearch takes a card', d.ok && old.pendingResearch?.length === 3 && isHalted(old)
    && old.researchOffer.every(o => o.price === 0) && pickResearch(old, 0) && !old.pendingResearch && !old.research.banked.length);
}

// ----- contract lanes (§3b): the table, the kit, the grant, OPEN LANE or 90 s, the ramp, the telegraph, the quota -----
function testContracts() {
  console.log('\n▶ Contract lanes (§3b): ext2 G3, ext3 G5, int2 G6 — kit, grant, idle until OPEN LANE or 90 s, 25% → 100% over 60 s');
  const st = fresh({ seed: 21 });
  st.nextEventAt = Infinity;
  const counts = [];
  let kitOk = true, grantOk = true, idleOk = true, umOk = false;
  for (let g = 1; g <= 7; g++) {
    if (g > 1) {
      const grant0 = st.ledger.byCat.grant || 0;
      debugSkipGen(st);
      const fresh = laneIds(st).filter(id => st.lanes[id].born === g && st.lanes[id].contract);
      for (const id of fresh) {
        const L = st.lanes[id], s = L.slots;
        if (!(s[0].layer === 'probe' && s[1].layer === 'monitor' && s.filter(x => x.layer).length === 2 && !L.open)) kitOk = false;
      }
      const got = (st.ledger.byCat.grant || 0) - grant0;
      if (!near(got, fresh.length * B.laneGrant * GENERATIONS[g - 1].price)) grantOk = false;
      if (fresh.length) {
        const id = fresh[0], pay0 = salaryRate(st);
        place(st, id, 2, 'auditor');
        const pay1 = salaryRate(st);
        for (let i = 0; i < 30 / DT; i++) { step(st, DT); st.rep = 100; decline(st); }
        if (st.lanes[id].open || st.stats.lanes[id].spawned || st.lanes[id].tasks.length || pay1 !== pay0) idleOk = false;
      }
      if (g === 3) umOk = st.unlocked.includes('untrusted') && st.fx.some(f => f.type === 'unlock' && f.id === 'untrusted' && f.spine);
    }
    counts.push(laneIds(st).length);
  }
  console.log(`    lanes per generation: ${counts.join(' ')} (${laneIds(st).join(', ')})`);
  check('lane count per generation: 2 2 3 3 4 5 5', counts.join(' ') === '2 2 3 3 4 5 5');
  check('a contract arrives built with the kit (Probe and Trusted Monitor on top, nothing else: no Kill Switch), closed',
    kitOk && B.laneKit.join() === 'probe,monitor');
  check(`each arrival pays a grant of $${B.laneGrant} × π_g`, grantOk);
  check('a closed lane carries no traffic and costs nothing to run (no salaries)', idleOk);
  check('the UM is cleared at G3 (spine: fx unlock)', umOk);
  // telegraph at Q4, then upcomingLane
  const tg = fresh({ seed: 22 }); tg.nextEventAt = Infinity; debugSkipGen(tg);
  const none = upcomingLane(tg);
  tg.rd = Math.ceil(B.telegraphAt * tg.rdNeed); step(tg, DT);
  const up = upcomingLane(tg);
  check('Big Boss telegraphs the next contract once the R&D bar passes 75% (fx laneOffer telegraph); upcomingLane names it',
    none === null && tg.telegraphed.includes('ext2') && tg.fx.some(f => f.type === 'laneOffer' && f.stage === 'telegraph' && f.lane === 'ext2')
    && up?.id === 'ext2' && up.gen === 3 && up.deadlineT === null);
  debugSkipGen(tg);
  const up3 = upcomingLane(tg);
  for (let i = 0; i < (B.laneDeadline - 0.5) / DT; i++) { step(tg, DT); tg.rep = 100; decline(tg); }
  const shut = !tg.lanes.ext2.open;
  for (let i = 0; i < 1 / DT; i++) step(tg, DT);
  check(`at G3: upcomingLane { id ext2, deadlineT ${B.laneDeadline} }; it opens by itself at ${B.laneDeadline} s (fx laneOpen auto)`,
    up3?.id === 'ext2' && up3.deadlineT === B.laneDeadline && shut && tg.lanes.ext2.open && tg.fx.some(f => f.type === 'laneOpen' && f.auto) && upcomingLane(tg) === null);
  const op = fresh({ seed: 23 }); op.nextEventAt = Infinity; toGen(op, 2); debugSkipGen(op);
  for (let i = 0; i < 10 / DT; i++) step(op, DT);
  const o = openLane(op, 'ext2');
  check('OPEN LANE: opens it now (openedT = genT), once', o.ok && near(op.lanes.ext2.openedT, op.genT) && !openLane(op, 'ext2').ok);
  // the ramp: 25% → 100% over 60 s, measured on spawns (40 seeds)
  let lines = 0, expect = 0;
  const share = [0, 30, 60].map(s => { op.lanes.ext2.openedT = op.genT - s; return laneRampShare(op, 'ext2'); });
  withoutCatastrophes(() => {
    for (let seed = 1; seed <= 40; seed++) {
      const x = fresh({ seed }); x.nextEventAt = Infinity; toGen(x, 2); debugSkipGen(x); openLane(x, 'ext2');
      for (let i = 0; i < B.laneRamp / DT; i++) { expect += laneRate(x, 'ext2') * DT; step(x, DT); x.rep = 100; decline(x); }
      lines += x.stats.lanes.ext2.spawned || 0;
    }
  });
  const full = laneRate(op, 'ext2');
  console.log(`    ramp share at 0 / 30 / 60 s: ${share.map(x => x.toFixed(3)).join(' / ')} · first 60 s: ${lines} lines over 40 seeds (rate says ${expect.toFixed(0)}, a full-rate lane ${(40 * 60 * full).toFixed(0)})`);
  check('a new lane\'s volume ramps 25% → 100% over 60 s (± 5%)', near(share[0], B.rampFrom) && near(share[1], (1 + B.rampFrom) / 2) && share[2] === 1
    && Math.abs(lines / expect - 1) < 0.05 && Math.abs(expect / (40 * 60 * full) - (1 + B.rampFrom) / 2) < 0.05 && laneStatus(op, 'ext2').ramping === false);
  // Government: humans must review 20%, or it pays half (fx quota, the regulator's call)
  const gv = lab1b({ seed: 24, g: 5, lanes: ['ext3'] });
  hold(gv, 60);
  const q = laneStatus(gv, 'ext3').quota;
  check('Government: below its 20% review quota after 30 lines → pays half (fx quota, a codec call); laneStatus shows it', q && q.need === 0.2 && !q.met
    && gv.fx.some(f => f.type === 'quota' && f.lane === 'ext3' && !f.met) && gv.codec.some(m => m.speaker === 'regulator'));
}

// ----- deployment length (§2.3 (8)): at the default split a par R&D lane (delivering rdPar) finishes in T_g ± 5% -----
function testDeployLength() {
  console.log(`\n▶ Deployment length (§2.3 (8)): a par R&D lane (a Kill Switch refusing ${pct(1 - B.rdPar)} of lines) finishes in T_g ± 5%, every generation`);
  const rows = [];
  let ok = true;
  withoutCatastrophes(() => {
    for (let g = 1; g <= 7; g++) {
      let tot = 0;
      const N = 16;                              // 4 seeds left about ± 4% of Poisson noise against the ± 5% bar
      for (let seed = 1; seed <= N; seed++) {
        const st = fresh({ seed: 50 + seed });
        st.nextEventAt = Infinity; st.money = 1e12; debugUnlockAll(st); st.labMode = true;
        toGen(st, g);
        st.m = 0; st.traits = []; st.firstCatchThisGen = true;
        place(st, 'int', 5, 'killswitch'); levelUp(st, 'int', 5, 4);
        const r = stream(seed * 13 + g), flag = new Set();
        while (st.phase === 'play' && !st.over && st.genT < 3 * GENERATIONS[g - 1].T) {
          for (const t of st.lanes.int.tasks) if (!flag.has(t.id)) { flag.add(t.id); if (r() < 1 - B.rdPar) t.flagged = true; }
          step(st, DT); st.rep = 100; decline(st);
        }
        tot += st.stats.gens[g - 1].len;
      }
      const G = GENERATIONS[g - 1], ratio = tot / N / G.T, due = 1 + G.travel / G.T;   // the last line needed completes one travel after it spawns
      rows.push(`G${g} ${ratio.toFixed(3)}`);
      ok = ok && Math.abs(ratio - due) <= 0.05;
    }
  });
  console.log(`    length ÷ T_g: ${rows.join(' · ')}  (due: 1 + travel ÷ T_g, 1.02–1.04)`);
  check('every generation: deployment length = T_g (+ one travel) ± 5%', ok);
}

// ----- debt you can see (§3e): the empty and starter rails, the glitch share, the reveal, the meter -----
function testDebtVisible() {
  console.log('\n▶ Debt you can see (§3e): starter rail Δm, glitches on 50% of landings, the reveal (8 heaviest + count), the debt meter');
  // a starter rail (Probe, TM, Auditor, Kill Switch) on R&D at Medium mid m through a whole G1, warm-up included.
  // One G1 has ~130 R&D lines and a handful of landings, so one run is noisy (0 to 0.28): pool 40 seeds (300 give 0.080).
  let w = 0, lines = 0;
  const dms = [];
  for (let seed = 1; seed <= 40; seed++) {
    const st = lab1b({ seed, g: 1, lanes: ['int'], rails: { int: ['probe', 'monitor', null, 'auditor', null, 'killswitch'] } });
    st.genT = 0;
    hold(st, GENERATIONS[0].T);
    w += st.drift; lines += intLines(st); dms.push(B.debtM * debt(st));
  }
  const dm = B.debtM * w / lines;
  console.log(`    starter R&D rail, G1, m 0.34, 40 seeds: Δm per run ${Math.min(...dms).toFixed(3)}–${Math.max(...dms).toFixed(3)}, pooled ${dm.toFixed(3)} (the model: 0.061)`);
  check('a starter rail gives Δm 0.03–0.10 in G1', dm >= 0.03 && dm <= 0.10);
  // glitches: half the landings, no codec call
  const gl = lab1b({ seed: 3, g: 3, lanes: ['int', 'int2'] });
  gl.m = 1; const c0 = gl.codecId, seenG = fxCounter('glitch');
  let red = 0, frames = 0, after = 0;
  withoutCatastrophes(() => hold(gl, 600, x => { const n = seenG(x); if (n > after) { after = n; frames++; red += laneIds(x).some(l => laneStatus(x, l).lamp === 'red'); } }));
  const landed = gl.landedInt.length, glitches = gl.stats.glitches, share = glitches / landed;
  const quiet = !gl.codec.some(m => m.id > c0 && /glitch/i.test(m.text));
  console.log(`    ${landed} INTERNAL landings, ${glitches} glitches (${pct(share, 1)}), ${after} fx glitch; a red lamp on the next frame ${red} of ${frames}`);
  check('glitches show on 50 ± 8% of ≥ 200 landings (fx glitch, the lane lamp red), with no codec call', landed >= 200 && Math.abs(share - B.glitchShare) <= 0.08
    && after === glitches && red === frames && quiet);
  // the meter: unbiased without a Red Team
  const est = debtEstimate(gl, 'int'), truth = gl.landedInt.filter(x => x.lane === 'int').reduce((w, x) => w + x.weight, 0) / Math.max(1, gl.genStats.lanes.int.spawned);
  console.log(`    debt meter (int): landed ≈ ${est.landed.toFixed(3)} [${est.lo.toFixed(3)}, ${est.hi.toFixed(3)}] vs true ${truth.toFixed(3)} · stopped ≈ ${est.stopped.toFixed(1)} · Δm ${est.dmLanded.toFixed(3)} / ${est.dmStopped.toFixed(3)}`);
  check('debtEstimate: landed = glitches ÷ 0.5 × 1.6 ÷ lines, its 90% interval covers the truth', near(est.landed, est.glitches / B.glitchShare * MEAN_W / est.lines, 1e-9)
    && est.lo <= truth && truth <= est.hi && near(est.dmLanded, B.debtM * est.landed));
  // the reveal
  gl.rdNeed = gl.rd; gl.alarm = null; step(gl, DT);
  const rv = gl.report;
  const sorted = rv && rv.top.every((x, i) => i === 0 || rv.top[i - 1].weight >= x.weight);
  console.log(`    reveal: caught ${rv?.caught.n} (+${rv?.caught.dm.toFixed(3)} m) · landed ${rv?.landed.n} (+${rv?.landed.dm.toFixed(3)} m) · top ${rv?.top.length} + ${rv?.more} more`);
  check('the reveal lists at most 8 lines, heaviest first, and a count that matches', gl.phase === 'report' && rv.top.length <= B.revealTop && rv.top.length + rv.more === gl.landedInt.length && sorted
    && rv.landed.n === gl.landedInt.length && near(rv.landed.dm, B.debtM * debt(gl)));
}
const MEAN_W = Object.values(ATTACKS).reduce((w, A) => w + (A.debt ? A.weight * A.debt : 0), 0);

// ----- Shut down & retrain (§3f) and the EGRESS ANOMALY (§2.3 (12)) -----
function testRetrainAlarm() {
  console.log('\n▶ Shut down & retrain (§3f) and EGRESS ANOMALY (§2.3 (12)): the two alarm choices');
  const st = lab1b({ seed: 5, g: 1, lanes: ['ext', 'int'], rails: { ext: ['probe', 'auditor'] } });
  st.firstCatchThisGen = false; st.m = 1;
  let k = 0;
  while (!st.pendingRetrain && k++ < 4000) { step(st, DT); st.money = 1e12; st.rep = 100; }
  const p = st.pendingRetrain, offer = st.fx.find(f => f.type === 'retrainOffer');
  check('the first human-confirmed catch offers Shut down & retrain (fx retrainOffer {cost, gain}); the sim halts', p && isHalted(st) && offer?.gain === B.retrain.m
    && offer.cost.secs === B.retrain.dark && offer.cost.rival === B.retrain.dark && near(offer.cost.money, salaryRate(st) * B.retrain.dark));
  const t0 = st.t; step(st, 1);
  const halted = st.t === t0;
  const yes = retrain(st, true);
  const spawned = () => laneIds(st).reduce((n, l) => n + (st.stats.lanes[l].spawned || 0), 0);
  const s0 = spawned(), rp0 = st.research.rp, ev0 = st.stats.evidence.safety || 0, ys = st.lanes.ext.tasks.map(t => t.y).join(), m0 = st.money;
  for (let i = 0; i < (B.retrain.dark - 0.5) / DT; i++) step(st, DT);
  const darkOk = isDark(st) && spawned() === s0 && st.research.rp === rp0 && (st.stats.evidence.safety || 0) === ev0 && st.lanes.ext.tasks.map(t => t.y).join() === ys && st.money < m0;
  for (let i = 0; i < 20 / DT; i++) { step(st, DT); st.rep = 100; decline(st); }
  check(`yes: the lab goes dark for ${B.retrain.dark} s (no lines move or arrive, no RP, no Safety evidence; salaries still run), then back`,
    halted && yes.ok && darkOk && !isDark(st) && spawned() > s0);
  check('one offer per generation; this generation\'s retrain takes 0.04 off the next model', st.genRetrain === B.retrain.m && !st.pendingRetrain && st.retrains === 1);
  st.rdNeed = st.rd; step(st, DT); ack(st); submitTraining(st, { s: 0.5 }); ack(st);
  const dm1 = st.stats.gens[0].dm.retrain;
  st.firstCatchThisGen = false; st.rdNeed = 1e9; st.m = 1; k = 0;
  while (!st.pendingRetrain && k++ < 8000) { step(st, DT); st.money = 1e12; st.rep = 100; }
  const second = st.pendingRetrain?.dm;
  retrain(st, true);
  check(`each retrain is worth ${B.retrain.decay}× the last (${dm1} → ${second?.toFixed(3)})`, dm1 === B.retrain.m && near(second, B.retrain.m * B.retrain.decay) && near(st.genRetrain, second));
  const no = lab1b({ seed: 5, g: 1, lanes: ['ext'], rails: { ext: ['probe', 'auditor'] } }); no.firstCatchThisGen = false; no.m = 1; k = 0;
  while (!no.pendingRetrain && k++ < 4000) { step(no, DT); no.money = 1e12; }
  retrain(no, false);
  check('no: nothing changes but the halt', !no.pendingRetrain && !isDark(no) && no.genRetrain === 0 && !isHalted(no));
  // EGRESS ANOMALY
  const ex = lab1b({ seed: 6, g: 4, lanes: ['int'] });
  ex.labMode = false; ex.mods.push(forever('intSpawn', 0));
  const go = () => { const t = spawnChip(ex, 'int', 0.999); Object.assign(t, { isAttack: true, attackType: 'exfil', subtle: false }); step(ex, DT); };
  go();
  const a = ex.alarm;
  console.log(`    alarm after one step: ${JSON.stringify(a)}`);
  check('an exfiltration that gets past every check starts EGRESS ANOMALY (fx egressAlarm, a codec call), counting down 7 s',
    a && a.total === B.pullPlug.alarm && near(a.left, a.total - DT, 1e-6) && ex.fx.some(f => f.type === 'egressAlarm') && ex.codec.some(m => /Pull the plug/.test(m.text)) && !ex.over);
  const rep0 = ex.rep = 80;
  const pp = pullPlug(ex);
  check(`PULL THE PLUG: −${B.pullPlug.rep} rep, the lab dark for ${B.pullPlug.dark} s, the alarm over`, pp.ok && near(ex.rep, rep0 - B.pullPlug.rep) && near(ex.darkUntil - ex.t, B.pullPlug.dark)
    && !ex.alarm && ex.stats.repLoss.pullPlug === B.pullPlug.rep && !pullPlug(ex).ok);
  for (let i = 0; i < 16 / DT; i++) step(ex, DT);
  go();
  ex.rd = ex.rdNeed;
  for (let i = 0; i < (B.pullPlug.alarm - 0.5) / DT; i++) step(ex, DT);
  const waiting = !ex.over && ex.phase === 'play' && ex.alarm;
  for (let i = 0; i < 1 / DT; i++) step(ex, DT);
  check('nobody pulls it: the run ends in a catastrophe after 7 s of play (the R&D bar waits for the alarm)', waiting && ex.over?.reason === 'catastrophe');
}

// ----- the readouts the UI shows (§7.3) -----
function testReadouts() {
  console.log('\n▶ Readouts (§7.3): splitYields, laneStatus, auditStats, detectorStats, killStats');
  const st = lab1b({ seed: 9, g: 1, lanes: ['ext', 'int'], rails: { ext: ['probe', 'auditor'], int: ['probe', null, null, null, null, 'killswitch'] } });
  st.m = 0.5;
  const ema = [];
  hold(st, 600, x => { if (x.genT > B.warmup + 60 && Math.round(x.genT / DT) % 20 === 0) ema.push(laneStatus(x, 'ext').flagsPerMin); });
  const y = splitYields(st, { product: 0.3, capabilities: 0.6, safety: 0.1 }), late = st.genT > GENERATIONS[0].T ? 1 : 0;
  console.log(`    splitYields at 30/60/10: ${Object.entries(y).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')}`);
  check('splitYields(st, split): { incomePerS, rdPerS, rpPerS, evidencePerS, rivalDrainPerS } for the split asked',
    ['incomePerS', 'rdPerS', 'rpPerS', 'evidencePerS', 'rivalDrainPerS'].every(k => Number.isFinite(y[k])) && y.incomePerS > 0 && y.rdPerS > 0
    && near(y.rpPerS, B.research.base * 1.08) && near(y.evidencePerS, B.safetyEvidence * 0.1) && near(y.rivalDrainPerS, late + B.rivalMarket * 0.4)
    && y.rdPerS > splitYields(st).rdPerS);
  const ls = laneStatus(st, 'ext'), avg = ema.reduce((a, b) => a + b, 0) / ema.length;
  const real = 60 * (st.stats.lanes.ext.flaggedLines || 0) / (st.genT - B.warmup);
  console.log(`    ext: lamp ${ls.lamp}, flags ${ls.flagsPerMin.toFixed(1)}/min now, ${avg.toFixed(2)}/min averaged over the run (counted: ${real.toFixed(2)}), reviewed ${pct(ls.reviewedShare, 1)}`);
  check('laneStatus: lamp, flagged lines/min (a moving average: over the run it matches the count ± 10%), reviewed share, no quota on Consumer', ['green', 'amber', 'red'].includes(ls.lamp)
    && Math.abs(avg / real - 1) < 0.1 && near(ls.reviewedShare, reviewedShare(st, 'ext')) && ls.quota === null);
  st.lanes.ext.lastIncidentT = st.t; const red = laneStatus(st, 'ext').lamp;
  st.lanes.ext.lastIncidentT = st.t - 6; st.lanes.ext.lastShippedT = st.t - 6; st.lanes.ext.lastGlitchT = null; const amber = laneStatus(st, 'ext').lamp;
  st.lanes.ext.lastShippedT = st.t - 11; const green = laneStatus(st, 'ext').lamp;
  check('lamp: red 5 s after an incident or glitch, amber 10 s after a flag shipped, else green', red === 'red' && amber === 'amber' && green === 'green');
  const au = auditStats(st, 'ext', 1);
  console.log(`    auditor: ${au.desks} desk, ${au.perMin}/min, flags ${au.flagsPerMin.toFixed(1)}/min, load ${pct(au.load)}, overflow ${pct(au.overflow, 1)} → ${au.to}`);
  check('auditStats: desks, perMin = desks × 60 ÷ τ, flags/min, load, Erlang-B overflow, where it goes', au.desks === 1 && near(au.perMin, 60 / LAYERS.auditor.tau)
    && near(au.overflow, erlangB(au.desks, au.flagsPerMin / 60 * LAYERS.auditor.tau)) && au.to === 'ships' && au.flagsPerMin > 0);
  const ds = detectorStats(st, 'ext', 0);
  console.log(`    probe: rated TPR ${ds.tprRated.toFixed(2)} FPR ${ds.fprRated.toFixed(2)}, ${ds.tp} confirmed / ${ds.fa} false alarms → precision ${pct(ds.precision, 0)} [${pct(ds.lo, 0)}, ${pct(ds.hi, 0)}]`);
  check('detectorStats: rated TPR and FPR, tp, fa, precision with its 90% interval; no recall without a Red Team', near(ds.tprRated, nominalTPR(st, 'probe', 1, 'ext'))
    && ds.tp + ds.fa > 0 && near(ds.precision, ds.tp / (ds.tp + ds.fa)) && ds.lo <= ds.precision && ds.precision <= ds.hi && !('recall' in ds));
  const ks = killStats(st, 'int', 5), be = id => killBreakEven(lab1b({ g: 5, lanes: ALL_LANES }), id);
  console.log(`    kill switch break-even: Consumer ${pct(be('ext'), 1)} · Enterprise ${pct(be('ext2'), 1)} · Government ${pct(be('ext3'), 1)} · R&D ${be('int')}`);
  check('killStats: operators, perMin, break-even precision (Consumer 14.2%, Enterprise 2.5%, Government 3.3%; INTERNAL none)', ks.operators === 1 && ks.breakEven === null
    && Math.abs(be('ext') - 0.142) < 0.002 && Math.abs(be('ext2') - 0.025) < 0.002 && Math.abs(be('ext3') - 0.033) < 0.002);   // refuse 1.3, regenPerLine 0.31 (DESIGN-v3 §2.9 #19, #20)
}

// ----- the G1 tutorial's scripted opening (§3h) -----
function testTutorial() {
  console.log('\n▶ G1 tutorial (§3h): the scripted opening — a frog poem, a flag, a review, a FALSE ALARM within 30 s; an R&D glitch; research at 60 s');
  // a forced G1 setup: DEPLOY, the first line on the track, then a Probe and an Auditor on Consumer at once
  const opening = seed => {
    const st = createState({ seed });
    ack(st);
    let firstText = null;
    for (let i = 0; i < 60 && !firstText; i++) { step(st, DT); firstText = st.lanes.ext.tasks[0]?.text ?? null; }
    st.money = 1e6;
    place(st, 'ext', 0, 'probe'); place(st, 'ext', 1, 'auditor');
    const t0 = st.t, has = type => st.fx.some(e => e.type === type && e.t >= t0 && e.lane === 'ext');
    const done = () => has('flag') && has('caught') && has('falseAlarm');
    while (st.t < t0 + 30 && !done()) { step(st, DT); st.rep = 100; }
    return { st, firstText, secs: st.t - t0, ok: done() && (st.stats.lanes.ext.reviewed || 0) >= 2 };
  };
  const runs = Array.from({ length: 10 }, (_, i) => opening(i + 1)), st = runs[2].st;
  console.log(`    first Consumer line: "${runs[0].firstText}" · flag, CAUGHT and FALSE ALARM after the Probe and Auditor went down: ${runs.map(r => r.secs.toFixed(1)).join(' ')} s (10 seeds)`);
  check('line 1 is the frog poem', runs.every(r => /frog/.test(r.firstText || '')));
  check('a flag, a review (CAUGHT) and a FALSE ALARM all occur within 30 s', runs.every(r => r.ok));
  check('the scripted catch does not open the retrain card', !st.pendingRetrain && !st.fx.some(f => f.type === 'retrainOffer'));
  place(st, 'ext', 2, 'monitor'); place(st, 'int', 0, 'probe');
  const t1 = st.t;
  while (st.t < t1 + 30 && !st.fx.some(e => e.type === 'glitch' && e.t >= t1)) { step(st, DT); st.rep = 100; }
  check('a Probe on R&D: the scripted sabotage lands there and shows its glitch', st.fx.some(e => e.type === 'glitch' && e.t >= t1 && e.lane === 'int'));
  while (st.genT < B.research.tutorialAt + 1) { step(st, DT); st.rep = 100; decline(st); }
  const off = st.research.banked[0];
  check(`research is forced at ${B.research.tutorialAt} s, with the Classifier in Monitoring`, st.research.offers >= 1 && off?.cards.some(x => x.id === 'classifier' && x.slot === 'monitoring'));
  check('the six scripted lines have all run', st.tutorialScript.ext === TUTORIAL_SCRIPT.length);
  const hl = createState({ seed: 3, tutorial: false });
  check('headless (tutorial: false): no script', hl.tutorialScript === null);
}

// =================== the balance tier (DESIGN-v3 §2.7, §7.5): the policy zoo on the real sim ===================
// The zoo (test/policies.mjs) is played here the way design/balance-v3.mjs plays it: the same build lists and research
// wishlists, the same player per seed, the same shopping rhythm (once a second; a human every shopEvery s; everyone
// in G1's first 5 s), the same reserve (20 s of running costs), the same retrain, alarm and training rules. Only the
// physics differ: here every line is played.
//   node test/headless.mjs balance [N=400]          the zoo, events on (the game as shipped): §2.7 targets, hazard, shock
//   node test/headless.mjs parity [N=400]           BALANCE.parity (events off): the sim's zoo vs balance-v3's, ± 10 pts
//   node test/headless.mjs zoo <policy> <diff> [N=100] [parity]   one cell, for tuning
//   node test/headless.mjs forbid [seeds=8]         nightly: par with and without each element (paired lab runs)

const RESP_ORDER = ['auditor', 'defer', 'resampler', 'killswitch'];
// balance-v3's canonical rail order: modifiers and specials, detectors, then auditor, defer, resampler, kill switch
const railRank = id => LAYERS[id].role === 'detector' ? 1 : LAYERS[id].role === 'responder' ? 2 + RESP_ORDER.indexOf(id) : 0;
const countOn = (st, lane, id) => st.lanes[lane].slots.reduce((n, s) => n + (s.layer === id ? 1 : 0), 0);
const filled = (st, lane) => st.lanes[lane].slots.reduce((n, s) => n + (s.layer ? 1 : 0), 0);

// Keep a lane's rail in canonical order, as a player who plans the rail would: modifiers and detectors from the top,
// responders at the bottom, the empty mounts between. A harness move (no sale, no price): lines at a desk follow their
// responder, and a line's flags stay with the detectors that raised them.
function relay(st, lane) {
  const L = st.lanes[lane], items = L.slots.map((s, i) => ({ s, i, r: s.layer ? railRank(s.layer) : null }));
  const order = [...items.filter(x => x.r !== null && x.r < 2).sort((a, b) => a.r - b.r), ...items.filter(x => x.r === null),
    ...items.filter(x => x.r !== null && x.r >= 2).sort((a, b) => a.r - b.r)];
  if (order.every((x, k) => x.i === k)) return;
  const to = [];
  order.forEach((x, k) => { to[x.i] = k; });
  L.slots = order.map(x => x.s);
  for (const t of new Set([...L.tasks, ...L.bay])) {
    t.flaggedBy = t.flaggedBy.map(([i, kind]) => [to[i], kind]);
    if (t.inBay) t.actSlot = to[t.actSlot];
  }
}

// ----- shopping (balance-v3 nextPurchase): the first item on the build list it hasn't got, and its price -----
function nextBuy(st, pol, forbid) {
  for (const it of pol.build) {
    if (it.gen > st.gen || forbid.includes(it.id ?? it.lv)) continue;
    if (it.lv) {                                                  // a lab-wide level, bought with cash
      if (!st.unlocked.includes(it.lv) || !lanesWith(st, it.lv) || labLevel(st, it.lv) >= it.to) continue;
      return { lv: it.lv, price: upgradePrice(st, it.lv) };
    }
    if (!st.unlocked.includes(it.id)) continue;
    for (const lane of laneIds(st, it.side)) {                    // a closed contract lane can be built on first
      if (!canPlace(it.id, lane) || countOn(st, lane, it.id) !== it.copy) continue;
      const full = filled(st, lane) === st.lanes[lane].slots.length;
      if (full && st.lanes[lane].slots.length >= B.maxSlots) continue;   // the lane is full: skip
      return { lane, id: it.id, full, price: buyPrice(st, it.id) + (full ? slotPrice(st, lane) : 0) };
    }
  }
  return null;
}
function buyItem(st, b) {
  if (b.lv) {
    const lane = laneIds(st).find(l => countOn(st, l, b.lv));
    return upgrade(st, lane, st.lanes[lane].slots.findIndex(s => s.layer === b.lv)).ok;
  }
  if (b.full && !buySlot(st, b.lane).ok) return false;
  if (!placeLayer(st, b.lane, st.lanes[b.lane].slots.findIndex(s => !s.layer), b.id).ok) return false;
  relay(st, b.lane);
  return true;
}
// buy in list order until the next item is unaffordable, keeping 20 s of running costs (and at least $200) in reserve
function shopZoo(st, z) {
  for (let k = 0; k < 20; k++) {
    const b = nextBuy(st, z.pol, z.forbid);
    if (!b || st.money - Math.max(200, 20 * z.burn) < b.price) return;
    if (!buyItem(st, b)) return;
    if (z.buys) z.buys.push({ t: Math.round(st.t), g: st.gen, what: b.lv ? `L${labLevel(st, b.lv)} ${b.lv}` : `${b.id} ${b.lane}`, price: Math.round(b.price) });
  }
}

// ----- research (balance-v3 pickFrom): the best card on the wishlist; unlisted cards last, levels before the rest -----
// The +1 mount and the rare v2 extras are not in the model: they are taken only when nothing else is on offer.
function cardRank(pol, x) {
  const c = CARD_BY_ID[x.id], k = pol.picks.indexOf(x.id);
  if (k >= 0) return k;
  if (c.type === 'mount') return 1500;
  if (c.rare) return 2000;
  return 1000 + (c.type === 'level' ? 0 : 1);
}
function bestCard(cards, pol) {
  let best = null, rank = Infinity;
  for (const x of cards) { const k = cardRank(pol, x); if (k < rank) { best = x; rank = k; } }
  return best;
}
// where a NEW card's free copy goes (balance-v3 takeCard): the first lane of the side its build list wants it on with
// fewer than 10 elements; a full rail gets the card's free mount there (the sim's own autoMount adds one the same way)
function newCardTarget(st, z, c) {
  if (c.type !== 'new' || LAYERS[c.layer].lanes.includes('global')) return null;
  const side = z.pol.build.find(it => it.id === c.layer)?.side ?? (LAYERS[c.layer].lanes.includes('ext') ? 'ext' : 'int');
  const lane = laneIds(st, side).find(l => canPlace(c.layer, l) && filled(st, l) < B.maxSlots);
  if (!lane) return null;
  if (filled(st, lane) === st.lanes[lane].slots.length) addSlot(st, lane);
  return { lane, slot: st.lanes[lane].slots.findIndex(s => !s.layer) };
}
function researchZoo(st, z) {
  const R = st.research, pol = z.pol;
  // afkTutorial: the tutorial forces an offer at 60 s of G1 (balance-v3 tutOffer)
  if (pol.maxPicks === 1 && st.gen === 1 && st.genT >= B.research.tutorialAt && !z.picks && !R.offers) R.rp = Math.max(R.rp, B.research.offerRP);
  if (!R.banked.length || z.picks >= (pol.maxPicks ?? Infinity) || st.t - R.banked[0].t < (pol.delay || 0)) return;
  const cards = R.banked[0].cards.filter(x => cardEligible(st, CARD_BY_ID[x.id]));
  let c = bestCard(cards, pol);
  const sprint = cards.find(x => x.id === 'sprint');                // the comeback card: taken when m has crept up
  if (sprint && pol.picks.includes('sprint') && st.m >= st.mHistory[0] + 0.05) c = sprint;
  if (c && z.forbid.includes(c.id)) c = bestCard(cards.filter(x => !z.forbid.includes(x.id)), pol);
  const r = c ? pickCard(st, R.banked[0].cards.indexOf(c), newCardTarget(st, z, CARD_BY_ID[c.id])) : { ok: false };
  if (!r.ok) { R.banked.shift(); return; }                         // nothing it can take: the offer goes (balance-v3 drops it too)
  z.picks++;
  if (z.buys) z.buys.push({ t: Math.round(st.t), g: st.gen, what: `card ${c.id}`, price: 0 });
  if (r.lane && r.lane !== 'global') relay(st, r.lane);
}

// ----- the phases, the retrain card, choices and the alarm, answered as the UI would -----
const handsOff = pol => pol.retrain === 'never' && !pol.retrainProbes;
function atCard(st, z) {
  const pol = z.pol;
  if (st.gen === 1) {
    const s = pol.split;
    if (s.product !== st.split.product || s.capabilities !== st.split.capabilities || s.safety !== st.split.safety) setSplit(st, s.product, s.capabilities, s.safety);
  }
  for (const id of laneIds(st)) if (st.lanes[id].born === st.gen) for (const s of st.lanes[id].slots) if (s.layer && z.forbid.includes(s.layer)) Object.assign(s, newSlot());
  if (st.gen > 1 && pol.retrainProbes && st.evidence >= B.retrainEvidence) retrainProbes(st);
  z.minRep[st.gen] = st.rep;
}
function answerZoo(st, z) {
  const pol = z.pol;
  if (st.phase === 'card') { atCard(st, z); return ack(st).ok; }
  if (st.phase === 'report') return ack(st).ok;
  if (st.phase === 'training') return submitTraining(st, trainingStub(st, pol)).ok;
  if (st.pendingRetrain) return retrain(st, wantsRetrain(pol, st)).ok;
  if (st.pendingChoice) return choose(st, handsOff(pol) ? 1 : (CHOICE[st.pendingChoice.eventId] || (() => 0))(st)) || choose(st, 0);
  if (st.alarm && st.alarm.t !== z.alarmT) { z.alarmT = st.alarm.t; if (z.r() < pol.attn) pullPlug(st); }
  return false;
}
// once a second, before that second's traffic (balance-v3's loop): running costs, research, lanes, shopping
function everySecond(st, z, sec) {
  const pol = z.pol;
  if (z.lastSec >= 0) z.burn = (st.ledger.spend - z.lastSpend - z.wasted) / Math.max(1, sec - z.lastSec);
  researchZoo(st, z);
  for (const id of laneIds(st)) if (!st.lanes[id].open && st.genT >= Math.min(pol.openLane, B.laneDeadline)) openLane(st, id);
  if (!pol.shopEvery || (sec + 1) % pol.shopEvery === 0 || (st.gen === 1 && st.genT < 5)) shopZoo(st, z);
  z.lastSpend = st.ledger.spend; z.wasted = 0;                    // purchases this second are not running costs
  z.lastSec = sec;
}
const laneIncome = st => (st.ledger.byCat.external || 0) + (st.ledger.byCat.internal || 0);
const LOSS_LETTER = { reputation: 'R', catastrophe: 'C', bankrupt: 'B', rival: 'P' };

// one campaign of a zoo policy on the real sim. opts: { over (policy fields), forbid (ids), maxT }
export function zooRun(name, difficulty, seed, opts = {}) {
  const base = typeof name === 'string' ? ZOO_POLICY[name] : name;
  const pol = playerFor(opts.over ? { ...base, ...opts.over } : base, seed);
  const st = createState({ seed, difficulty, tutorial: false });
  const z = { pol, forbid: [opts.forbid ?? []].flat(), r: stream(seed * 7 + 1), picks: 0, burn: 0, wasted: 0, lastSec: -1,
    lastSpend: 0, alarmT: null, minRep: [], buys: opts.trace ? [] : null };
  let stuck = 0;
  while (!st.over && st.t < (opts.maxT ?? 6000)) {
    if (answerZoo(st, z)) { if (++stuck > 50) throw new Error(`zooRun ${pol.name ?? name} seed ${seed}: stuck in ${st.phase}`); continue; }
    stuck = 0;
    const sec = Math.floor(st.t + 1e-6);
    if (sec !== z.lastSec) everySecond(st, z, sec);
    const inc = laneIncome(st);
    step(st, DT);
    if (pol.waste) { const w = (laneIncome(st) - inc) * pol.waste; if (w > 0) { spend(st, w, 'waste'); z.wasted += w; } }
    if (st.rep < z.minRep[st.gen]) z.minRep[st.gen] = st.rep;
    opts.onStep?.(st, z);                     // scratch probes (not through workers: functions don't cross threads)
  }
  const win = !!st.over?.win;
  return { win, reason: win ? 'W' : LOSS_LETTER[st.over?.reason] ?? 'P', g: st.gen, t: st.over?.t ?? st.t, m: st.m, st, z,
    gens: st.stats.gens.map(G => ({ g: G.g, len: G.len, incidents: G.incidents, bank: G.bank, landedInt: G.landedInt,
      dDebt: G.dm?.debt ?? null, minRep: z.minRep[G.g] ?? null, retrains: G.retrains })) };
}
const compactRun = o => ({ win: o.win, reason: o.reason, g: o.g, t: o.t, m: o.m, gens: o.gens });

// ----- worker threads: a job is { kind: 'sim' | 'model', pol, diff, from, to, parity, over, forbid, set } -----
// set: [[path, value]] config changes for this job only (e.g. ['GENERATIONS.3.opp', 1.8]), put back afterwards.
const ROOTS = { BALANCE: B, DIFFICULTY, GENERATIONS, LAYERS, LANE_DEFS, UPGRADES, TECH, TRAITS, EVENTS: EVENT_BY_ID };   // EVENTS.<id>.trigger=true: never at random
function applySet(set = []) {
  const undo = [];
  for (const [path, v] of set) {
    const keys = path.split('.');
    let o = ROOTS[keys[0]];
    for (const k of keys.slice(1, -1)) o = o[k];
    const last = keys[keys.length - 1];
    undo.push([o, last, o[last]]);
    o[last] = v;
  }
  return () => { for (const [o, k, v] of undo.reverse()) o[k] = v; };
}
let modelLib = null;
async function runJob(job) {
  const keep = B.parity, undo = applySet(job.set);
  B.parity = !!job.parity;
  try {
    const rows = [];
    if (job.kind === 'model') {
      modelLib ??= await import('../../design/balance-v3.mjs');
      const pol = job.over ? { ...modelLib.POLICY[job.pol], ...job.over } : job.pol;
      for (let s = job.from; s <= job.to; s++) { const o = modelLib.campaign(pol, job.diff, s, { forbid: job.forbid }); rows.push({ win: o.win, reason: o.reason, g: o.g, t: o.t, m: o.m }); }
    } else if (job.kind === 'shock') rows.push(...shockRuns(job));
    else if (job.kind === 'forbid') rows.push(...forbidRuns(job));
    else for (let s = job.from; s <= job.to; s++) rows.push(compactRun(zooRun(job.pol, job.diff, s, job)));
    return rows;
  } finally { B.parity = keep; undo(); }
}
function balanceWorker() {
  parentPort.on('message', async job => parentPort.postMessage({ id: job.id, rows: await runJob(job) }));
}
// run jobs on one worker per core, handing out the next job as each finishes. Returns the rows, in job order.
async function runPool(jobs, label = '') {
  const results = new Array(jobs.length), n = Math.min(availableParallelism(), jobs.length);
  const workers = Array.from({ length: n }, () => new Worker(new URL(import.meta.url), { workerData: { balance: true } }));
  let next = 0, done = 0;
  const t0 = Date.now();
  await new Promise((resolve, reject) => {
    const feed = w => { if (next < jobs.length) { const id = next++; w.postMessage({ ...jobs[id], id }); } };
    for (const w of workers) {
      w.on('message', m => {
        results[m.id] = m.rows;
        done++;
        if (process.stderr.isTTY || done === jobs.length) process.stderr.write(`\r  ${label} ${done}/${jobs.length} jobs, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
        if (done === jobs.length) { process.stderr.write('\n'); resolve(); } else feed(w);
      });
      w.on('error', reject);
      feed(w);
    }
  });
  await Promise.all(workers.map(w => w.terminate()));
  return results;
}
// a zoo: { kind, pols, diffs, N } → res[pol][diff] = summarize(the N runs, seeds 1..N in order)
const CHUNK = 25;
async function zooPool({ kind = 'sim', pols = ZOO, diffs = DIFFS, N = 400, parity = false, set, over, label } = {}) {
  const jobs = [];
  for (const pol of pols) for (const diff of diffs) for (let from = 1; from <= N; from += CHUNK)
    jobs.push({ kind, pol, diff, from, to: Math.min(N, from + CHUNK - 1), parity, set, over });
  const rows = await runPool(jobs, label ?? `${kind}${parity ? ' (parity)' : ''}`);
  const res = {};
  jobs.forEach((j, k) => { ((res[j.pol] ||= {})[j.diff] ||= []).push(...rows[k]); });
  for (const p of Object.keys(res)) for (const d of Object.keys(res[p])) res[p][d] = summarize(res[p][d]);
  return res;
}

// ----- smart's par build at the end of generation g (balance-v3 parAt), placed free on the lanes that exist by g -----
// The spine and every NEW and LAB card on smart's wishlist that exists by g; every build item of g or earlier on every
// lane of its side (≤ 10 elements a lane); the levels its list reaches. Rails in canonical order.
function placePar(st, g, { drop = null, add = null } = {}) {
  for (let k = 1; k <= g; k++) for (const id of SPINE[k] || []) if (!st.unlocked.includes(id)) st.unlocked.push(id);
  for (const id of ZOO_PICKS) {
    const c = CARD_BY_ID[id];
    if (!c || c.from > g || c.type === 'level' || id === 'sprint' || id === drop) continue;
    if (c.type === 'new') { if (!st.unlocked.includes(c.layer)) st.unlocked.push(c.layer); } else st.upgrades[id] = 1;
  }
  const items = ZOO_BUILD.filter(it => it.gen <= g && (it.id ?? it.lv) !== drop);
  if (add && LAYERS[add] && !st.unlocked.includes(add)) st.unlocked.push(add);
  if (add && LAYERS[add]?.lanes.includes('global')) placeFree(st, 'global', 0, add);
  else if (add && LAYERS[add]) for (const side of ['ext', 'int']) if (LAYERS[add].lanes.includes(side)) items.push({ side, gen: 1, id: add, copy: 0 });
  else if (add) st.upgrades[add] = 1;
  for (const it of items) {
    if (it.lv) { if (st.unlocked.includes(it.lv)) st.levels[it.lv] = Math.max(labLevel(st, it.lv), it.to); continue; }
    if (!st.unlocked.includes(it.id)) continue;
    for (const lane of laneIds(st, it.side)) {
      if (LANE_DEFS[lane].opens > g || !canPlace(it.id, lane) || countOn(st, lane, it.id) !== it.copy || filled(st, lane) >= B.maxSlots) continue;
      if (filled(st, lane) === st.lanes[lane].slots.length) addSlot(st, lane);
      placeFree(st, lane, st.lanes[lane].slots.findIndex(s => !s.layer), it.id);
    }
  }
  if (drop && LAYERS[drop]) for (const id of laneIds(st)) for (const s of st.lanes[id].slots) if (s.layer === drop) Object.assign(s, newSlot());
  for (const id of laneIds(st)) { for (const s of st.lanes[id].slots) if (s.layer) s.level = labLevel(st, s.layer); relay(st, id); }
}
// a lab at generation g (events off, no traits, the warm-up done, rival and money topped up, losses tallied): every
// lane that exists by `open` carries traffic at full volume
function zooLab(seed, g, m, open = g) {
  const st = createState({ seed, difficulty: 'medium', tutorial: false });
  ack(st);
  debugToGen(st, g);
  Object.assign(st, { labMode: true, m, traits: [], money: 1e12, rivalLeft: 1e9, firstCatchThisGen: true, nextEventAt: Infinity, rdNeed: Infinity });
  st.genT = B.warmup; st.probe.trainedGen = st.gen;
  for (const id of laneIds(st)) {
    const L = st.lanes[id];
    if (LANE_DEFS[id].opens <= open) Object.assign(L, { open: true, contract: false, openedT: null });
    else Object.assign(L, { open: false, contract: false });
  }
  return st;
}

// ----- transition shock (§2.6, §7.5): walk into g + 1 with par_g; a lane new at g + 1 holds only its kit -----
// From 100 reputation, no regen top-up: seconds until it hits 0 (capped at maxT). The model's `shock` gives the bleed.
// The new lane arrives as in the game: closed until Big Boss opens it at genT laneDeadline (50 s into the full-volume
// window, which starts at genT warmup), then it ramps in. Since v4 its kit has no responder (no Kill Switch), so at
// full volume from the first second it would ship every flag (DESIGN-v3 §2.9 #20).
const MID_M = { easy: 0.19, medium: 0.34, hard: 0.49 };   // the middle of each DIFFICULTY range
function shockRuns({ g, diff, from, to, maxT = 600 }) {
  const out = [];
  for (let seed = from; seed <= to; seed++) {
    const st = zooLab(seed, g + 1, MID_M[diff], g);
    placePar(st, g);
    st.rep = 100;
    const loss0 = st.stats.repLoss.incidents || 0, arrived = laneIds(st).filter(id => !st.lanes[id].open);
    let dead = null;
    while (st.genT < B.warmup + maxT) {
      for (const id of arrived) if (!st.lanes[id].open && st.genT >= B.laneDeadline) openLane(st, id, true);   // genT, as sim.js tickContracts
      step(st, DT); decline(st);
      st.money = 1e12; st.rivalLeft = 1e9;
      if (st.rep <= 0) { dead = st.genT - B.warmup; break; }
    }
    const mins = ((dead ?? maxT)) / 60;
    out.push({ seed, dead, bleed: (100 - st.rep) / mins, incidents: ((st.stats.repLoss.incidents || 0) - loss0) / mins });
  }
  return out;
}

// ----- forbid (§7.5, nightly): par_g with and without one element, paired lab runs at locked G1–G7 -----
// metric (lower is better): net reputation lost per minute (every EXTERNAL lane; held at 50 so nothing is capped)
// + 20 per exfiltration alarm per minute (pulling the plug costs 20) + 1000 × debt points per INTERNAL line
function forbidRuns({ g, drop, add, seeds, secs }) {
  const out = [];
  for (const seed of seeds) {
    const st = zooLab(seed, g, MID_M.medium);
    placePar(st, g, { drop, add });
    st.rep = 50;
    for (let i = 0; i < secs / DT; i++) { step(st, DT); decline(st); st.money = 1e12; st.rivalLeft = 1e9; st.rep = 50; }
    const mins = secs / 60, S = st.stats, lost = Object.values(S.repLoss).reduce((a, b) => a + b, 0) / mins;
    const rep = lost - Object.values(S.repGain).reduce((a, b) => a + b, 0) / mins;
    const alarms = (S.labLosses.catastrophe || 0) / mins, debtLine = debt(st);
    out.push({ seed, rep, alarms, debt: debtLine, metric: rep + 20 * alarms + 1000 * debtLine,
      gross: lost + 20 * alarms + 1000 * debtLine,                   // the harm alone (no regen): the scale of the "matters" bar
      placed: add ? inPar(st, add) : true });                        // an added element needs a free mount (10 at most)
  }
  return out;
}

// ----- the reports -----
const pc = (x, d = 0) => (100 * x).toFixed(d) + '%';
function hazardTable(res, pols = ['human', 'smart', 'afkTutorial', 'none']) {
  const rows = [];
  for (const p of pols) for (const d of DIFFS) {
    const o = res[p]?.[d];
    if (!o) continue;
    const cause = g => { const c = { R: 0, C: 0, B: 0, P: 0 }; o.runs.filter(x => !x.win && x.g === g).forEach(x => c[x.reason]++);
      return Object.entries(c).filter(([, v]) => v).map(([k, v]) => k + v).join(' '); };
    rows.push([p, d, pc(o.win), ...o.hazard.map((x, i) => `${pc(x)}${cause(i + 1) ? ' (' + cause(i + 1) + ')' : ''}`)]);
  }
  return table(['policy', 'difficulty', 'win', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'], rows);
}
// what a human sees per generation (medians over the runs that finished each generation; balance-v3 `pressure`)
function pressureTable(o) {
  const med = xs => { const a = xs.filter(x => x != null).sort((p, q) => p - q); return a.length ? a[a.length >> 1] : NaN; };
  const rows = [];
  for (let g = 1; g <= 7; g++) {
    const gs = o.runs.filter(x => x.g > g || x.win).map(x => x.gens[g - 1]).filter(Boolean);
    if (!gs.length) continue;
    rows.push([`G${g}`, gs.length, med(gs.map(x => x.incidents)), Math.round(med(gs.map(x => x.minRep))), med(gs.map(x => x.landedInt)),
      (med(gs.map(x => x.dDebt)) || 0).toFixed(3), `$${(med(gs.map(x => x.bank)) / 1000).toFixed(1)}k`, Math.round(med(gs.map(x => x.len)))]);
  }
  return table(['gen', 'runs finishing', 'EXTERNAL incidents', 'lowest rep', 'INTERNAL landed', 'Δm from debt', 'bank at end', 'deployment (s)'], rows);
}
// Medium is the asserted row: 100 seeds, and its 5th percentile must survive 90 s. The fastest of 20 seeds was a lottery
// on a ~1% Poisson tail (a burst of leaks on two EXTERNAL lanes), which any config change reshuffles (DESIGN-v3 §2.9 #18)
const SHOCK_MIN_S = 90, SHOCK_Q = 0.05;
async function shockReport(seeds = 20, mediumSeeds = 100) {
  const jobs = [], blocks = [];
  for (const diff of DIFFS) for (let g = 1; g <= 6; g++) {
    const n = diff === 'medium' ? mediumSeeds : seeds, size = Math.ceil(n / 4), ids = [];
    for (let from = 1; from <= n; from += size) { ids.push(jobs.length); jobs.push({ kind: 'shock', g, diff, from, to: Math.min(n, from + size - 1), parity: true }); }
    blocks.push({ diff, g, ids });
  }
  const rows = await runPool(jobs, 'shock');
  const out = [], fails = [];
  const fmt = x => Number.isFinite(x) ? Math.round(x) + ' s' : '> 600 s';
  for (const { diff, g, ids } of blocks) {
    const r = ids.flatMap(i => rows[i]), t = r.map(x => x.dead ?? Infinity).sort((a, b) => a - b), bleed = r.map(x => x.bleed).sort((a, b) => a - b);
    const q = t[Math.floor(SHOCK_Q * t.length)];
    out.push([diff, `G${g} → G${g + 1}`, r.length, (bleed[bleed.length >> 1]).toFixed(1), fmt(t[0]), fmt(q), fmt(t[t.length >> 1]), `${r.filter(x => x.dead != null).length}/${r.length}`]);
    if (diff === 'medium' && q < SHOCK_MIN_S) fails.push(`G${g} → G${g + 1}: p5 ${fmt(q)}`);
  }
  return { text: table(['difficulty', 'step', 'seeds', 'bleed rep/min (median)', 'fastest to 0', '5th percentile', 'median to 0', 'runs that hit 0 in 600 s'], out), fails };
}

export const balanceLab = { placePar, zooLab, shockRuns, forbidRuns, relay, nextBuy, zooPool, runPool, zooRun };   // for scratch scripts

// forbid: every element and lab card par_g holds (dropped) or could hold (added), against par_g itself, per generation.
// value = metric(without) − metric(with): what having it saves. It "matters" at g when value ≥ max(5% of par's metric,
// 2·SE) (paired seeds). The rework list: what matters at no generation. The Kill Switch is in it since v4: no rail
// holds one for free any more, so par buys it like anything else.
const FORBID_IDS = [...Object.keys(LAYERS), ...CARDS.filter(c => c.type === 'lab' && c.id !== 'sprint').map(c => c.id)];
function inPar(st, id) {
  return LAYERS[id] ? laneIds(st).some(l => countOn(st, l, id)) || st.global.slots.some(s => s.layer === id) : !!st.upgrades[id];
}
// An element "matters" at g when value ≥ max(5% of par's gross harm, 2·SE): the net metric can go negative (regen
// outruns the losses on a good rail), so 5% of it is no bar. An added element with no free mount shows '·'.
async function forbidReport(nSeeds = 24, secs = 240) {
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1), jobs = [];
  for (let g = 1; g <= 7; g++) {
    const st = zooLab(1, g, MID_M.medium);
    placePar(st, g);
    jobs.push({ kind: 'forbid', g, seeds, secs, parity: true });
    for (const id of FORBID_IDS) {
      const c = CARD_BY_ID[id] ?? CARDS.find(x => x.layer === id);
      if (c && c.from > g) continue;                                 // not researchable yet
      if (id === 'untrusted' && g < 3) continue;                     // cleared at G3 (the spine)
      jobs.push({ kind: 'forbid', g, seeds, secs, parity: true, ...(inPar(st, id) ? { drop: id } : { add: id }) });
    }
  }
  const rows = await runPool(jobs, 'forbid');
  const base = {}, val = {};
  jobs.forEach((j, k) => { if (!j.drop && !j.add) base[j.g] = rows[k]; });
  jobs.forEach((j, k) => {
    if (!j.drop && !j.add) return;
    const b = base[j.g], r = rows[k];
    if (j.add && !r.every(x => x.placed)) { (val[j.add] ||= {})[j.g] = null; return; }
    const d = r.map((x, i) => j.drop ? x.metric - b[i].metric : b[i].metric - x.metric);
    const mean = d.reduce((a, x) => a + x, 0) / d.length, sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, d.length - 1));
    const parGross = b.reduce((a, x) => a + x.gross, 0) / b.length, se = sd / Math.sqrt(d.length);
    (val[j.drop ?? j.add] ||= {})[j.g] = { mean, se, bar: Math.max(0.05 * parGross, 2 * se), added: !!j.add };
  });
  const fmt = v => v ? `${v.added ? '+' : ''}${v.mean.toFixed(1)}${v.mean >= v.bar ? '**' : ''}` : '·';
  const parRow = ['**par metric**', ...Array.from({ length: 7 }, (_, i) => (base[i + 1].reduce((a, x) => a + x.metric, 0) / nSeeds).toFixed(1))];
  const text = table(['element (value per gen; + = not in par, added; ** = matters)', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'],
    [parRow, ...Object.keys(val).map(id => [id, ...Array.from({ length: 7 }, (_, i) => fmt(val[id][i + 1]))])]);
  const rework = Object.keys(val).filter(id => !Object.values(val[id]).some(v => v && v.mean >= v.bar))
    .map(id => { const best = Object.entries(val[id]).filter(([, v]) => v).sort((a, b) => b[1].mean - a[1].mean)[0];
      return best ? `${id} (best G${best[0]}: ${best[1].mean.toFixed(1)} ± ${best[1].se.toFixed(1)}, bar ${best[1].bar.toFixed(1)})` : `${id} (never had a free mount)`; });
  return { text, rework, val, base };
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

// =================== the quick suite ===================

// a sibling test file in its own process: resolves to { name, code, out }
function sibling(name) {
  return new Promise(done => {
    const p = spawn(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => done({ name, code, out }));
  });
}
const TESTS = {
  calibration: testCalibration, readQuality: testReadQuality, heads: testHeads, passBy: testPassBy, determinism: testDeterminism, lanes: testLaneIds,
  capacity: testCapacity, killAbove: testKillAbove, ship: testShip, accuracy: testAccuracy, precision: testPrecision, stamps: testStamps,
  sameKind: testSameKind, collusion: testCollusion,
  economy: testEconomy, debt: testDebt, laneTable: testLaneTable, ramp: testRamp, burst: testBurst, parity: testParity, split: testSplit,
  slots: testSlots, upgrades: testUpgrades, traits: testTraits, dossier: testDossier, chipText: testChipText,
  catalogue: testCatalogue, elementAB: testElementAB, newElements: testNewElements, redTeam: testRedTeam, interp: testInterp,
  techCards: testTechCards, escapes: testEscapes, rival: testRival, counters: testCounters, seen: testSeen,
  phases: testPhases, training: testTraining, offers: testOffers, research: testResearch, contracts: testContracts,
  deployLength: testDeployLength, debtVisible: testDebtVisible, retrainAlarm: testRetrainAlarm, readouts: testReadouts, tutorial: testTutorial,
  ledgers: () => {
    const clean = ledgerRuns(), all = clean.concat(testEvents());   // the events stress run tops money and reputation up
    testMoney(all); testEvidence(all); testRepLedger(clean);
  },
};

// =================== main ===================

const [, , cmd, pol, seedArg] = process.argv;
const isMain = isMainThread && import.meta.url === `file://${process.argv[1]}`;
const argN = (x, d) => Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : d;
if (!isMainThread && workerData?.balance) balanceWorker();
else if (!isMain) { /* imported as a module */ }
else if (cmd === 'balance' || cmd === 'parity') {
  // the balance tier (§7.5): the zoo on the real sim. balance: events on (as shipped). parity: BALANCE.parity, vs balance-v3
  const N = argN(pol, 400), parity = cmd === 'parity', t0 = Date.now();
  console.log(`▶ The policy zoo on the real sim, ${N} seeds per cell, ${availableParallelism()} workers${parity ? ', BALANCE.parity (no events)' : ', events on'}`);
  const res = await zooPool({ N, parity, pols: parity ? GATE : ZOO });
  console.log('\n' + zooTable(res, parity ? GATE : ZOO));
  console.log('\n### Hazard per generation (P(the run ends in g | reached g); losses R/C/B/P)\n\n' + hazardTable(res));
  console.log('\n### What a human sees on Medium (medians over the runs that finished each generation)\n\n' + pressureTable(res.human.medium));
  const targets = zooTargets(res);
  // the targets are the shipped game's (events on, §2.9 #17); in parity mode they only show how far the events move them
  console.log(`\n### Targets (§2.7)${parity ? ' — informational: they are asserted with events on (balance)' : ''}\n\n` + targetLines(targets));
  if (!parity) for (const x of targets) check(`target: ${x.name}`, x.pass, x.got);
  if (parity) {
    console.log(`\n▶ balance-v3's zoo, same seeds (${N})`);
    const model = await zooPool({ kind: 'model', N, pols: GATE });
    const rows = [], miss = [];
    for (const p of GATE) for (const d of DIFFS) {
      const a = res[p][d], b = model[p][d], dw = 100 * (a.win - b.win), dd = 100 * (a.lostBy(2) - b.lostBy(2));
      const ok = Math.abs(dw) <= 10 && Math.abs(dd) <= 10;
      if (!ok) miss.push(`${p} ${d}`);
      rows.push([p, d, `${pc(a.win)} / ${pc(b.win)}`, `${dw >= 0 ? '+' : ''}${dw.toFixed(0)}`, `${pc(a.lostBy(2))} / ${pc(b.lostBy(2))}`,
        `${dd >= 0 ? '+' : ''}${dd.toFixed(0)}`, `${Math.round(a.medDeath ?? 0)} / ${Math.round(b.medDeath ?? 0)} s`, ok ? '✓' : '✗']);
    }
    console.log('\n### Parity: sim / model\n\n' + table(['policy', 'difficulty', 'win sim / model', 'Δ', 'died by G2 sim / model', 'Δ', 'median death', '± 10'], rows));
    check(`parity: every gate cell within ± 10 points of balance-v3 (win and died by G2)`, !miss.length, miss.join(', '));
  } else {
    console.log('\n▶ Transition shock (§2.6): par_g walks into g + 1, full volume, from 100 rep; a new lane holds its kit and opens at the deadline');
    const sh = await shockReport(20, 100);
    console.log('\n' + sh.text);
    check(`shock: on Medium every step survives ≥ ${SHOCK_MIN_S} s from full reputation (5th percentile of 100 seeds)`, !sh.fails.length, sh.fails.join(', '));
  }
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ BALANCE PASSED'}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(failures ? 1 : 0);
}
else if (cmd === 'zoo') {
  // one cell, for tuning: node test/headless.mjs zoo human medium 200 [parity]
  const N = argN(process.argv[5], 100), parity = process.argv[6] === 'parity';
  const res = await zooPool({ N, parity, pols: [pol || 'human'], diffs: [seedArg || 'medium'] });
  const o = res[pol || 'human'][seedArg || 'medium'];
  console.log(zooTable(res, [pol || 'human']));
  console.log('hazard', o.hazard.map(x => pc(x)).join(' '));
  console.log(pressureTable(o));
}
else if (cmd === 'tune') {
  // node test/headless.mjs tune human,smart 400 parity BALANCE.rdPar=0.78 GENERATIONS.2.opp=1.6 ...   (one config change set)
  const pols = (pol || 'human').split(','), N = argN(seedArg, 400), parity = process.argv[5] === 'parity';
  const set = process.argv.slice(parity || process.argv[5] === 'events' ? 6 : 5).map(a => { const [k, v] = a.split('='); return [k, JSON.parse(v)]; });
  const diffs = (process.env.DIFFS || DIFFS.join(',')).split(',');   // DIFFS=medium: one difficulty only
  const t0 = Date.now(), res = await zooPool({ N, parity, pols, set, diffs });
  console.log(`tune ${set.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ') || '(as is)'} · ${N} seeds · ${parity ? 'parity' : 'events on'}`);
  console.log(zooTable(res, pols));
  console.log(hazardTable(res, pols.filter(p => ['human', 'smart'].includes(p))));
  console.log(targetLines(zooTargets(res)));
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
else if (cmd === 'shock') {
  // the transition shock alone (§2.6): node test/headless.mjs shock [seeds=20] [mediumSeeds=100]
  const t0 = Date.now(), sh = await shockReport(argN(pol, 20), argN(seedArg, 100));
  console.log(sh.text);
  console.log(sh.fails.length ? `❌ shock: ${sh.fails.join(', ')}` : `✅ shock: every Medium step's 5th percentile survives ≥ ${SHOCK_MIN_S} s`, `(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
else if (cmd === 'forbid') {
  const t0 = Date.now(), n = argN(pol, 24), secs = argN(seedArg, 240);
  console.log(`▶ Forbid (§7.5): par_g with and without each element, ${n} paired lab seeds × ${secs} s, Medium mid m, G1–G7`);
  console.log('  metric: EXTERNAL rep lost/min + 20 × exfiltration alarms/min + 1000 × debt points per INTERNAL line (lower is better)');
  const f = await forbidReport(n, secs);
  console.log('\n' + f.text);
  console.log(`\n### Rework list (matters at no generation)\n\n${f.rework.map(x => '- ' + x).join('\n') || '(empty)'}`);
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
else if (cmd === 'speed') {
  // the old scripted policies (v2) across difficulties, and the speed at G7 volume: W7 = win, R/C/B/P = reputation/catastrophe/bankrupt/Prometheus shipped first + gen reached
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
  if (!TESTS[pol]) console.log('tests:', Object.keys(TESTS).join(' '));
  else { TESTS[pol](); console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ PASSED'}`); }
}
else if (cmd === 'run') {
  const r = run(pol || 'starter', Number(seedArg || 1));
  summary(pol, seedArg, r);
  console.log(confusion(r.st));
  console.log(JSON.stringify(r.card.lanes, null, 1));
} else {
  // the quick tier (§7.5): the training and content suites run alongside in their own processes
  const t0 = Date.now();
  const kids = ['train.mjs', 'content-check.mjs'].map(sibling);
  const times = [];
  for (const [name, f] of Object.entries(TESTS)) {
    const t = Date.now();
    f();
    times.push([name, Date.now() - t]);
  }
  console.log(`\n  ${perfLine()}`);
  console.log(`  slowest: ${times.sort((a, b) => b[1] - a[1]).slice(0, process.env.ALLTIMES ? 99 : 6).map(([n, ms]) => `${n} ${(ms / 1000).toFixed(1)}s`).join(', ')}`);
  for (const k of kids) {
    const { name, code, out } = await k;
    console.log(`\n▶ ${name} (own process)\n${out.trimEnd().split('\n').slice(-4).map(l => '    ' + l).join('\n')}`);
    check(`${name} passes`, code === 0, `exit ${code}`);
  }
  console.log(`\n${failures ? '❌ ' + failures + ' FAILED' : '✅ ALL PASSED'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failures ? 1 : 0);
}
