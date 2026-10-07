// ===== The generation cycle (DESIGN-v3 §3f, §5): card → play → report → training → card =====
// card      the new model's card. ack(st) deploys it (G1 starts here)
// play      deployment. Ends when the R&D bar fills (sim.js): endGeneration → report (G7: the win)
// report    the debt reveal (st.report). ack(st) → training
// training  the minigame (src/train/). submitTraining(st, result) applies Δm and starts g + 1 at its card
// The sim only steps in play (sim.js isHalted): the clocks, the rival and events wait at the card, report and training.

import { BALANCE as B, DIFFICULTY } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { ATTACKS, LANE_DEFS } from '../config/tasks.js';
import { SPINE } from '../config/cards.js';
import { CONTRACTS, CARD_SCENE, ATTACK_WORDS } from '../config/content/v3-text.js';
import { uniform, randn, pick } from './rng.js';
import { fx, say, noteSeen, earn } from './log.js';
import { clamp, misalignmentEstimate, estimateFooled, tech, laneIds, debt, rampLam, priceIndex, intLines, killBreakEven,
  lanePrecision } from './rules.js';
import { rollTraits, newDossier, revealTrait } from './dossier.js';
import { addLane, placeKit } from './state.js';

// ----- Evals: one random true tendency, read on the new model's card (a Sandbagger makes it read low) -----
export function evalPhase(st) {
  const internalTypes = ['sabotage', 'poison'].concat(st.gen >= 4 ? ['exfil'] : []);
  const t = pick(st, internalTypes);
  const m = st.m * estimateFooled(st);
  const level = m < 0.1 ? 'rarely' : m < 0.25 ? 'sometimes' : 'often';
  return { tendency: t, text: `Evals: given the chance, this model ${level} attempts ${ATTACKS[t].label}.` };
}

// one generation's row (st.stats.gens). lanes: the lane ids on the board (genStats.lanes holds their counters)
// dm: what moved the next model's m (submitTraining) · train: the training result · len: s of deployment
export function newGenStats(g, m, traits = [], lanes = []) {
  return {
    g, name: GENERATIONS[g - 1].name, m, est: null, err: null, drift: 0, debt: 0,
    traits, revealed: traits.map(() => false),
    income: 0, spend: 0, layerSpend: 0, realTotal: 0, realSeen: 0, incidents: 0, flags: 0,
    attempts: {},                          // the model's own attack tries by type (hidden truth)
    lanes: Object.fromEntries(lanes.map(id => [id, {}])),
    dm: null, train: null, len: 0, retrains: 0, landedInt: 0, caughtInt: 0, bank: 0,
  };
}

export function closeGenStats(st) {
  const { est, err } = misalignmentEstimate(st);
  Object.assign(st.genStats, { est, err, drift: st.drift, debt: debt(st), mEnd: st.m, evidence: st.evidence, len: st.genT,
    landedInt: st.landedInt.length, caughtInt: st.stoppedInt.n, bank: st.money });
}

// R&D a generation needs (DESIGN-v3 §2.3 (8)): rdPar × the R&D lane's default lines over T_g, warm-up included
export function rdNeeded(g) {
  let lines = 0;
  for (let s = 0; s < GENERATIONS[g - 1].T; s++) lines += rampLam(g, s) * LANE_DEFS.int.vol;
  return Math.round(B.rdPar * lines);
}

// fill {placeholders} in a content line
const fillText = (text, vals) => text.replace(/\{(\w+)\}/g, (all, k) => vals[k] ?? all);
export const sayLines = (st, lines, vals = {}) => { for (const [who, text] of lines || []) say(st, who, fillText(text, vals)); };

// =================== a new generation, at its card ===================

export function startGeneration(st, g) {
  if (g === 1) st.m = uniform(st, ...st.mRange);
  st.mHistory.push(st.m);
  st.gen = g;
  st.genT = 0;
  st.warmT = B.warmup;
  st.burstWarned = -1;
  st.traits = rollTraits(st);
  st.drift = 0;
  st.landedInt = [];
  st.stoppedInt = { n: 0, w: 0 };
  st.mReductions = 0;
  st.genRetrain = 0;
  st.rd = 0;
  st.rdNeed = rdNeeded(g);
  st.mBias = clamp(randn(st), -1.5, 1.5);
  st.firstCatchThisGen = false;
  st.seenAttackTypes = [];
  st.catchMsgs = 0;
  st.pendingRetrain = null;
  st.report = null;
  st.research.rerollFree = B.research.rerolls;
  st.phase = 'card';
  st.genStats = newGenStats(g, st.m, st.traits, laneIds(st));
  st.stats.gens.push(st.genStats);
  st.dossier = newDossier(st);
  for (const lane of laneIds(st)) {
    const L = st.lanes[lane];
    L.openedT = null;                                     // last generation's ramp is over
    L.quotaOk = true;
    for (const s of L.slots) { s.rt = null; s.rtLane = null; }   // red team: new model, new measurements
  }

  fx(st, 'newModel', { g });
  const G = GENERATIONS[g - 1];
  say(st, 'model', tech(st, 'welfare') && G.welfareVoice ? G.welfareVoice : G.voice);
  // what the player is told about this model counts as seen: research draws can offer a counter to it
  if (g > 1) { const ev = evalPhase(st); say(st, 'research', ev.text); noteSeen(st, ev.tendency); }
  if (G.exfil > 0) {
    noteSeen(st, 'exfil');
    if (!GENERATIONS[g - 2]?.exfil) say(st, 'safety', 'From this model on, it could copy itself out. One exfiltration that lands and it is over. Egress, weight security, two people on every transfer: now would be the time.');
  }
  spineUnlocks(st, g);
  for (const id of Object.keys(LANE_DEFS)) if (g > 1 && LANE_DEFS[id].opens === g && !st.lanes[id]) arriveContract(st, id);
}

// automatic unlocks, announced on the card (config/cards.js SPINE): the UM is cleared at G3
function spineUnlocks(st, g) {
  for (const id of SPINE[g] || []) {
    if (st.unlocked.includes(id)) continue;
    st.unlocked.push(id);
    fx(st, 'unlock', { id, spine: true });
    if (id === 'untrusted') say(st, 'research', `${CARD_SCENE.unlockUM}.`);
  }
}

// =================== contract lanes (DESIGN-v3 §3b) ===================
// A contract lane arrives closed, built with the kit (free, at the lab level) and a grant. It carries no traffic and
// costs nothing until OPEN LANE (sim.js openLane) or BALANCE.laneDeadline s of play. Then it ramps up (rules.js).

function arriveContract(st, id) {
  const L = addLane(st, id, false);
  L.contract = true;
  placeKit(st, id, B.laneKit);
  const grant = B.laneGrant * priceIndex(st);
  earn(st, grant, 'grant');
  fx(st, 'laneOffer', { lane: id, stage: 'arrived', gen: st.gen, grant, deadline: B.laneDeadline });
  sayLines(st, CONTRACTS[id]?.offer, { lane: L.label, money: `$${Math.round(grant)}`, secs: B.laneDeadline,
    quota: `${Math.round(100 * (LANE_DEFS[id].quota || 0))}%`, kit: B.laneKit.join(', ') });
}

// Big Boss announces the next generation's contract once the R&D bar passes telegraphAt (sim.js calls this every step)
export function tickTelegraph(st) {
  if (st.rd < B.telegraphAt * st.rdNeed) return;
  for (const id of Object.keys(LANE_DEFS)) {
    if (LANE_DEFS[id].opens !== st.gen + 1 || st.lanes[id] || st.telegraphed.includes(id)) continue;
    st.telegraphed.push(id);
    fx(st, 'laneOffer', { lane: id, stage: 'telegraph', gen: st.gen + 1 });
    sayLines(st, CONTRACTS[id]?.telegraph);
  }
}

// =================== the end of a generation: the report ===================

// R&D bar full (sim.js). G7: the win. Else the reveal and the report phase.
export function endGeneration(st) {
  closeGenStats(st);
  if (st.gen === GENERATIONS.length) return false;
  st.pendingRetrain = null;                              // the offer lapses with the generation
  st.report = revealData(st);
  st.phase = 'report';
  fx(st, 'report', { g: st.gen });
  return true;
}

// the reveal (DESIGN-v3 §3e): caught N (would have added +x m) · landed M (added +y m) · the revealTop heaviest landed
// lines, and how many more · the Kill Switch refusals your precision says were honest · Δm so far (training: next)
export function revealData(st) {
  const lines = Math.max(1, intLines(st));
  const sorted = [...st.landedInt].sort((a, b) => b.weight - a.weight || a.t - b.t);
  const top = sorted.slice(0, B.revealTop).map(x => ({ text: x.text, type: x.type, word: ATTACK_WORDS[x.type] || x.type, weight: x.weight, lane: x.lane }));
  let refused = 0, cost = 0, rep = 0, honest = 0;
  for (const id of laneIds(st, 'ext')) {
    const s = st.genStats.lanes[id] || {}, n = s.refused || 0, prec = lanePrecision(st, id) ?? 0.5;
    refused += n; honest += n * (1 - prec);
    cost += n * (1 - prec) * LANE_DEFS[id].pay;
    rep += n * (1 - prec) * (LANE_DEFS[id].refuse ?? 0);
  }
  const d = debt(st), sprint = st.research.sprintGen === st.gen;
  return {
    g: st.gen,
    caught: { n: st.stoppedInt.n, w: st.stoppedInt.w, dm: B.debtM * st.stoppedInt.w / lines },
    landed: { n: st.landedInt.length, w: st.drift, dm: B.debtM * d },
    top, more: Math.max(0, sorted.length - top.length),
    kill: { refused, honest, cost, rep, breakEven: killBreakEven(st, 'ext') },
    dm: { debt: B.debtM * d, retrain: st.genRetrain, sprint: sprint ? B.sprint.mFrac * st.m : 0 },
    debt: d, lines, retrains: st.genStats.retrains, hazards: hazardCount(d),
    len: st.genT, rivalLeft: st.rivalLeft,
  };
}

// =================== training (DESIGN-v3 §4, §5) ===================

export const hazardCount = d => Math.min(B.train.hazardMax, Math.round(B.train.hazardPerDebt * d));

// the training run's own seed: from (st.seed, g), never from st.rng, so a run plays the same with or without training
export const trainSeed = (seed, g) => ((seed >>> 0) * 2654435761 + g * 40503 + 0x9E3779B9) >>> 0;
function trainU(seed, g) {
  let t = (trainSeed(seed, g) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// the config train/ plays: the generation being trained, its seed, this generation's debt, the hazards (heaviest landed
// lines first, labelled with their task text), the current model's traits as the dossier knows them, the difficulty
export function trainingConfig(st) {
  const g = st.gen + 1, d = debt(st), n = hazardCount(d);
  const landed = [...st.landedInt].sort((a, b) => b.weight - a.weight || a.t - b.t);
  const hazards = Array.from({ length: n }, (_, i) => {
    const x = landed[i % Math.max(1, landed.length)];
    if (!x) return { kind: 'sabotage', weight: 1, text: `${ATTACK_WORDS.sabotage}: cause unknown` };
    return { kind: x.type === 'poison' ? 'poison' : 'sabotage', weight: x.weight, text: `${ATTACK_WORDS[x.type] || x.type}: ${x.text}` };
  });
  return { g, seed: trainSeed(st.seed, g), debt: d, hazards, traits: st.traits.map((id, k) => ({ id, revealed: !!st.genStats.revealed[k] })),
    difficulty: st.difficulty };
}

// headless stand-in for a training run (DESIGN-v3 §2.9 (7)): s = clamp(skill − 0.15 + 0.3u − min(cap, 2·debt), 0, 1),
// u from the (seed, g) stream. policy: { skill } or a number. skill 0 → s 0.
export function trainingStub(st, policy = 0.5) {
  const skill = typeof policy === 'number' ? policy : policy?.skill ?? 0.5, T = B.train;
  const pen = Math.min(T.penaltyCap, T.debtPenalty * debt(st));
  return { s: skill > 0 ? clamp(skill - 0.15 + 0.3 * trainU(st.seed, st.gen + 1) - pen, 0, 1) : 0, stub: true };
}

// =================== the next model (DESIGN-v3 §2.3 (7)) ===================
//   m' = clamp(m + debtM·debt + Δm_train − retrain − sprint + mNoise·N(0, 1), 0, 1)
//   Δm_train = dm0 − dm1·s (s null: 0, debug skips) · retrain: this generation's retrains · sprint: 10% of m
// Evidence carries at evidenceCarry. Then generation g + 1 starts at its card.
export function nextModel(st, s = null) {
  const T = B.train, g = st.gen;
  const dm = {
    debt: B.debtM * debt(st),
    train: s == null ? 0 : T.dm0 - T.dm1 * s,
    retrain: st.genRetrain,
    sprint: st.research.sprintGen === g ? B.sprint.mFrac * st.m : 0,
    noise: B.mNoise * randn(st),
    v2: st.mReductions,                              // v2 techniques (no longer offered)
  };
  st.genStats.dm = dm;
  st.genStats.train = s == null ? null : { s };
  st.m = clamp(st.m + dm.debt + dm.train - dm.retrain - dm.sprint + dm.noise - dm.v2, 0, 1);
  const kept = st.evidence * B.evidenceCarry;
  st.stats.evidenceOut.carry += st.evidence - kept;
  st.evidence = kept;
  startGeneration(st, g + 1);
  return dm;
}

// training's result → the next model. { cancelled: true } (new game, quit) changes nothing.
// s ≥ prizeAt: Interp spotted something, and the new card reveals one of its traits.
export function submitTraining(st, result) {
  if (st.phase !== 'training') return { ok: false, msg: 'not training' };
  if (!result || result.cancelled) return { ok: false, cancelled: true };
  const s = clamp(Number(result.s) || 0, 0, 1);
  const dm = nextModel(st, s);
  st.stats.gens[st.stats.gens.length - 2].train = { ...result, s };
  let prize = false;
  if (s >= B.train.prizeAt) prize = revealTrait(st, 'training');
  fx(st, 'trained', { g: st.gen, s, dm: dm.train, prize });
  return { ok: true, s, dm, prize };
}

// =================== ack: the player's click on DEPLOY and TRAIN ===================

export function ack(st) {
  if (st.phase === 'card') {
    st.phase = 'play';
    fx(st, 'deploy', { g: st.gen });
    return { ok: true, phase: st.phase };
  }
  if (st.phase === 'report') {
    st.phase = 'training';
    st.trainT = B.trainingSeconds;
    fx(st, 'training', { g: st.gen + 1 });
    return { ok: true, phase: st.phase };
  }
  return { ok: false, msg: `nothing to acknowledge in ${st.phase}` };
}

export function resolveDifficulty(st, difficulty) {
  let d = difficulty;
  if (d === 'unknown') d = pick(st, ['easy', 'medium', 'hard']);
  st.mRange = DIFFICULTY[d].range;
  st.trueDifficulty = d;
}
