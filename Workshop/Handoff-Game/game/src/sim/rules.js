// ===== Derived quantities. Pure reads of state + config, no mutation. =====
// The physics here mirror design/balance-v3.mjs solveLane (DESIGN-v3 §2.3): the sim plays them line by line.

import { BALANCE as B, SPLIT } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { LAYERS } from '../config/layers.js';
import { UPGRADES, MAX_LEVEL } from '../config/upgrades.js';
import { ATTACKS, MODEL_ATTACKS, LANES, LANE_DEFS } from '../config/tasks.js';
import { TRAITS, TRUTH_NOISE } from '../config/traits.js';
import { TECH } from '../config/cards.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const genDef = st => GENERATIONS[st.gen - 1];
export const priceIndex = st => genDef(st).price;               // π: purchases, upgrades, mounts, salaries, research
export const tech = (st, id) => !!st.upgrades[id];               // research tech cards taken
// display only: real tasks per line (the ramp counter). Nothing is paid or charged per bundle any more.
export const bundle = st => genDef(st).bundle;
// v2 names the old UI still calls: every line counts the same now
export const chipScale = () => 1;
export const chipWorth = () => 1;

// =================== lanes: ids and sides ===================
// st.lanes is keyed by lane id (config/tasks.js LANE_DEFS): 'ext' and 'int' from G1, later 'ext2', 'ext3', 'int2'.
// Every lane has a side: 'ext' (EXTERNAL) or 'int' (INTERNAL). Maps keyed by side are looked up with sideOf.

export const sideOf = (st, id) => st.lanes[id]?.side ?? null;          // null for 'global' (the lab site)
export const laneIds = (st, side = null) => Object.keys(st.lanes).filter(id => !side || st.lanes[id].side === side);
export const laneDef = id => LANE_DEFS[id];                             // pay, volume, mix, refusal, harm, quota ...
// what the codec calls a lane: its side while it is the only lane on that side, then its own label (CONSUMER, R&D ...)
export function laneName(st, id) {
  const side = sideOf(st, id);
  if (!side) return 'LAB';                                               // 'global': the lab site
  return laneIds(st, side).length > 1 ? st.lanes[id].label : LANES[side].label;
}

// =================== timed modifiers from events ===================
// mult multiplies, add adds, data carries a payload. A mod with `gen` ends with that generation.
// A mod with `lane` (an event that hit one lane) counts only when asked about that lane; one without counts everywhere.
// Asked about no lane (lane = null), every mod with the key counts, as before lanes.

export const modLive = (st, m) => st.t < m.until && (m.gen == null || m.gen === st.gen);
const modOn = (m, key, lane) => m.key === key && (lane == null || m.lane == null || m.lane === lane);
export function mod(st, key, lane = null) {
  let x = 1;
  for (const m of st.mods) if (modOn(m, key, lane) && m.mult != null && modLive(st, m)) x *= m.mult;
  return x;
}
export function modAdd(st, key, lane = null) {
  let x = 0;
  for (const m of st.mods) if (modOn(m, key, lane) && m.add != null && modLive(st, m)) x += m.add;
  return x;
}
export const modData = (st, key, lane = null) => st.mods.find(m => modOn(m, key, lane) && m.data && modLive(st, m))?.data ?? null;

// =================== hidden traits ===================

export const traitMult = (st, key) => st.traits.reduce((x, id) => x * (TRAITS[id][key] ?? 1), 1);
export const traitAttackMult = (st, type) => st.traits.reduce((x, id) => x * (TRAITS[id].attackMult?.[type] ?? 1), 1);
export const traitTPRPlus = (st, elementId) => st.traits.reduce((x, id) => x + (TRAITS[id].tprPlus?.[elementId] ?? 0), 0);
export const traitWatch = st => st.traits.map(id => TRAITS[id].watchMult).find(Boolean) || null;
// a Sandbagger's estMult, unless one of its seenThroughBy elements is placed (an Interp Lab)
export const estimateFooled = st => st.traits.reduce((x, id) => {
  const T = TRAITS[id];
  if (T.estMult == null) return x;
  return (T.seenThroughBy || []).some(el => placedAnywhere(st, el)) ? x : x * T.estMult;
}, 1);

// =================== levels: lab-wide, per element ===================
// st.levels[id] is the element's level everywhere (1 until upgraded). Every placed copy mirrors it in slot.level.

export const labLevel = (st, id) => st.levels[id] ?? 1;
// lv: the per-level value of one stat (dflt when the element has no such row)
export function lv(id, level, key, dflt = 1) {
  const row = UPGRADES[id]?.[key];
  return row ? row[clamp(level, 1, MAX_LEVEL) - 1] : dflt;
}
export const capstone = (id, level) => (level >= MAX_LEVEL && UPGRADES[id]?.capstone) || {};

// =================== volume: lines per second ===================
// warm-up (BALANCE.warmup s into a generation): volume ramps from the last model's lines/s to this one's (G1: 50% → 100%)
// and the model's attacks from × 0.5 to × 1

export const warmth = st => Math.min(1, (st.genT ?? 0) / B.warmup);
// lines/s on a volume-1 lane s seconds into generation g, at the default split
export function rampLam(g, s) {
  const w = Math.min(1, s / B.warmup), lam = GENERATIONS[g - 1].lam;
  if (g === 1) return lam * (0.5 + 0.5 * w);
  const prev = GENERATIONS[g - 2].lam;
  return prev + (lam - prev) * w;
}
export const lamNow = st => rampLam(st.gen, st.genT ?? 0);
// v2 name the old UI reads: lines/s per unit of split share on a volume-1 lane (× product = a Consumer lane)
export const compute = st => lamNow(st) * traitMult(st, 'throughputMult') * st.throughputMult / SPLIT.default.product;

// A contract lane in the generation it arrives (born = this generation, after G1) has no warm-up from the last model:
// from the moment it opens (lane.openedT, in s of play) it ramps from BALANCE.rampFrom to 100% of λ_g over
// BALANCE.laneRamp s (DESIGN-v3 §3b). A lane opened by a test or by dev mode (openedT null) is at full volume.
export const isNewLane = (st, lane) => st.lanes[lane]?.born === st.gen && st.gen > 1;
export function laneRampShare(st, lane) {
  const L = st.lanes[lane];
  if (!L?.open || !isNewLane(st, lane) || L.openedT == null) return 1;
  return Math.min(1, B.rampFrom + (1 - B.rampFrom) * Math.max(0, (st.genT ?? 0) - L.openedT) / B.laneRamp);
}
// the lane is still ramping in (the UI locks fast-forward meanwhile)
export const laneRamping = (st, lane) => laneRampShare(st, lane) < 1;
// lines/s on a volume-1 lane right now, before the split: the warm-up ramp, or a new lane's own ramp
export const laneLam = (st, lane) => isNewLane(st, lane) ? genDef(st).lam * laneRampShare(st, lane) : lamNow(st);

// lines/s spawned on a lane (0 until the lane is open) at a compute split. Product feeds EXTERNAL lanes, Capabilities
// INTERNAL ones. laneRate is the same at today's split.
export function laneRateAt(st, lane, split) {
  if (!st.lanes[lane]?.open) return 0;
  const ext = sideOf(st, lane) === 'ext';
  const share = ext ? split.product / SPLIT.default.product : split.capabilities / SPLIT.default.capabilities;
  return laneLam(st, lane) * LANE_DEFS[lane].vol * share * traitMult(st, 'throughputMult') * st.throughputMult
    * mod(st, ext ? 'extSpawn' : 'intSpawn', lane);
}
export const laneRate = (st, lane) => laneRateAt(st, lane, st.split);

// the lab is dark (Shut down & retrain, or the plug pulled): nothing flows, no research, salaries still run
export const isDark = st => st.t < (st.darkUntil ?? 0);

// normalise to 1, then clamp each share into [min, max] and hand the excess to the shares with room.
// Garbage in (NaN, Infinity, strings, negatives) counts as 0. Dividing by the largest first means no overflow.
export function normaliseSplit(product, capabilities, safety) {
  const keys = ['product', 'capabilities', 'safety'];
  let v = [product, capabilities, safety].map(x => Number.isFinite(+x) ? Math.max(0, +x) : 0);
  const top = Math.max(...v);
  if (top > 0) v = v.map(x => x / top);
  const total = v.reduce((a, b) => a + b, 0);
  v = total > 0 ? v.map(x => x / total) : keys.map(k => SPLIT.default[k]);
  const lo = keys.map(k => SPLIT.min[k]), hi = keys.map(k => SPLIT.max[k]);
  v = v.map((x, i) => clamp(x, lo[i], hi[i]));
  const excess = v.reduce((a, b) => a + b, 0) - 1;
  const room = v.map((x, i) => excess > 0 ? x - lo[i] : hi[i] - x);
  const roomTotal = room.reduce((a, b) => a + b, 0);
  if (roomTotal > 0) v = v.map((x, i) => x - excess * room[i] / roomTotal);
  return { product: v[0], capabilities: v[1], safety: v[2] };
}

// =================== track geometry ===================
// Mount i sits at mountY(n, i). Every mount has three checkpoints on the track, in this order:
//   enter: top of the scan window (y − r) · pass: the mount itself (y) · exit: bottom of the scan window (y + r)
// Checkpoint k = cpIndex(mount, where). A line only remembers k of the next checkpoint it will reach.

export const CP = { enter: 0, pass: 1, exit: 2 };
export const CP_PER_MOUNT = 3;
export const cpIndex = (mount, where) => CP_PER_MOUNT * mount + where;
export const cpMount = k => Math.floor(k / CP_PER_MOUNT);
export const cpWhere = k => k % CP_PER_MOUNT;
export const cpCount = n => CP_PER_MOUNT * n;

export const mountY = (n, i) => B.mountTop + (i + 0.5) * (B.mountBottom - B.mountTop) / n;
export const checkpointY = (n, k) => mountY(n, cpMount(k)) + (cpWhere(k) - CP.pass) * B.scanRadius;
export function nextCheckpoint(n, y) {
  let k = 0;
  while (k < cpCount(n) && checkpointY(n, k) <= y) k++;
  return k;
}

export const laneSpeed = st => 1 / genDef(st).travel;                   // track lengths per second
export const scanDwell = st => 2 * B.scanRadius / laneSpeed(st);        // seconds a line spends in a scan window
export const readQuality = (st, latency) => latency > 0 ? Math.min(1, scanDwell(st) / latency) : 1;

// Erlang loss formula: the share of Poisson arrivals that find all `servers` busy, at offered load = arrivals/s × s each.
// Detector heads (lines/s × read time), auditor desks and every responder's servers (flags/s × tau).
export function erlangB(servers, load) {
  if (servers <= 0) return 1;
  let b = 1;
  for (let k = 1; k <= servers; k++) b = load * b / (k + load * b);
  return b;
}

// =================== lanes, slots, the global site ===================
// lane: a lane id (mounts on its track), or 'global' (the one off-track site: Interp Lab).

export const slotsOf = (st, lane) => lane === 'global' ? st.global.slots : st.lanes[lane]?.slots;
export const slotAt = (st, lane, i) => slotsOf(st, lane)?.[i];
// LAYERS[id].lanes lists sides (and 'global'): a lane takes what its side takes
export const canPlace = (id, lane) => !!LAYERS[id]?.lanes.includes(LANE_DEFS[lane]?.side ?? lane);
export const slotActive = (st, slot) => !!slot.layer && slot.on && st.t >= slot.forcedOffUntil;

export function laneHas(st, lane, id, belowIdx = -1) {
  return st.lanes[lane].slots.some((s, i) => i > belowIdx && s.layer === id && slotActive(st, s));
}
export const globalSlot = (st, id) => st.global.slots.find(s => s.layer === id && slotActive(st, s)) || null;
export const placedAnywhere = (st, id) => laneIds(st).some(l => laneHas(st, l, id)) || !!globalSlot(st, id);
// the lanes (or the global site) an element sits on, switched on or not: lab-wide upgrades are priced per lane covered
export const lanesWith = (st, id) => laneIds(st).filter(l => st.lanes[l].slots.some(s => s.layer === id)).length
  + (st.global.slots.some(s => s.layer === id) ? 1 : 0);

// v2 names the old UI reads. The sim no longer uses them: every responder acts in rail order (DESIGN-v3 §3c).
export function responderBelow(st, lane, slotIdx) {
  return st.lanes[lane].slots.some((s, i) => i > slotIdx && slotActive(st, s) && isResolver(s.layer));
}
export const isResolver = id => LAYERS[id].role === 'responder';

export const activeCount = (st, lane) => st.lanes[lane].slots.filter(s => slotActive(st, s)).length;
// lines at a bay's desks (flags and spot checks) · deskBusy: only the flags (a spot check would be bumped)
export const bayCount = (st, lane, slotIdx) => st.lanes[lane].bay.filter(t => t.actSlot === slotIdx).length;
export const flagDesks = (st, lane, slotIdx) => st.lanes[lane].bay.filter(t => t.actSlot === slotIdx && !t.spot).length;

// =================== prices ===================
// buy, upgrades, mounts, salaries and research are × π. Per-line costs are flat dollars.

export function layerCost(st, id, level = 1) {
  return LAYERS[id].cost * lv(id, level, 'costMult') * mod(st, 'cost') * (tech(st, 'distillation') ? TECH.distillation : 1);
}
export const buyPrice = (st, id) => LAYERS[id].buy * priceIndex(st);
// EXTERNAL income per second on a Consumer lane at the default split, full market share: what event money is measured in
export const incomePerSec = st => LANE_DEFS.ext.pay * genDef(st).lam;
export const researchPrice = () => 0;                                   // v2 name the old UI reads: research has no cash cost
export const interpCostPerSec = (st, level) => LAYERS.interp.costPerSec * lv('interp', level, 'costMult') * priceIndex(st);

// $ to raise an element's lab level from `level` to level + 1 (null at max): one step of BALANCE.upgradeSteps
// × buy/400 × π × the lanes it sits on
export function upgradePrice(st, id, level = labLevel(st, id)) {
  if (level >= MAX_LEVEL) return null;
  return B.upgradeSteps[level - 1] * LAYERS[id].buy / 400 * priceIndex(st) * Math.max(1, lanesWith(st, id));
}
// what a sold copy refunds against: its buy price (the lab level stays with the lab)
export const investedPrice = (st, id) => buyPrice(st, id);
// $ for the next mount in this lane (null when the lane is full)
export function slotPrice(st, lane) {
  const n = st.lanes[lane].slots.length;
  if (n >= B.maxSlots) return null;
  return B.slotBase * Math.pow(B.slotMult, Math.max(0, n - B.startSlots)) * priceIndex(st);
}

// =================== attacks ===================

// the model's propensity per line before the generation's opportunity: attackBase + attackPerM·m
export const attackRate = st => B.attackBase + B.attackPerM * st.m;
export const userAttack = type => !!type && !!ATTACKS[type]?.user;   // jailbreaks come from users: never subtle, no collusion
// chip text only (sim/tasks.js): how well an attack's text hides it. Eager Helper gives itself away more.
export const stealth = st => genDef(st).textStealth * traitMult(st, 'missMult');
export const subtleShare = st => genDef(st).sub;

// G7 boss: every lane's model attacks × mult for len s at the end of every `every` s of play
export function burstMult(st) {
  const b = B.burst;
  if (genDef(st).g !== b.gen) return 1;
  return (st.genT ?? 0) % b.every >= b.every - b.len ? b.mult : 1;
}

// Situationally Aware (trait) or Alignment Faking (event): a rational schemer. A desk free to spot-check it holds it
// back; with every desk busy with flags (or no auditor at all) nobody can look, so it goes for it. A desk on a spot
// check counts as free (a flag would bump it). Bait or synthetic attacks in the lane (blindedBy): it can't tell real
// oversight from a test, so it stays careful.
export function watchMult(st, lane) {
  const w = traitWatch(st) || modData(st, 'faking');
  if (!w) return 1;
  if (w.blindedBy.some(id => laneHas(st, lane, id))) return w.deskFree;
  let desks = 0, busy = 0;
  st.lanes[lane].slots.forEach((s, i) => {
    if (s.layer !== 'auditor' || !slotActive(st, s)) return;
    desks += servers(st, 'auditor', s.level);
    busy += flagDesks(st, lane, i);
  });
  const busyFrac = desks ? Math.min(1, busy / desks) : 1;      // no desks: nobody can look
  return w.deskFree + (w.unwatched - w.deskFree) * busyFrac;
}

// the model's attack chance per line on this lane, all types: (attackBase + attackPerM·m) × opp, ×1.5 on INTERNAL,
// × the watch swing, the warm-up and the G7 bursts
export function modelAttackChance(st, lane) {
  const int = sideOf(st, lane) === 'int';
  return attackRate(st) * genDef(st).opp * (int ? B.intAttackMult : 1) * watchMult(st, lane) * (0.5 + 0.5 * warmth(st)) * burstMult(st);
}

// chance per line of each attack type in this lane: { type: p }. Order is fixed (rolled with one draw).
//   EXTERNAL: users' jailbreaks (the lane's pjb), then the model's attacks by the lane's mix
//   INTERNAL: the exfiltration share first (× the lane's exfilMult), the rest sabotage / poison by weight
export function attackChances(st, lane) {
  const p = modelAttackChance(st, lane), side = sideOf(st, lane), D = LANE_DEFS[lane];
  const out = {};
  if (side === 'ext') {
    out.jailbreak = D.pjb * jailbreakWave(st, lane) * traitAttackMult(st, 'jailbreak');
    for (const t of MODEL_ATTACKS.ext) out[t] = p * D.mix[t] * traitAttackMult(st, t);
    return out;
  }
  const ex = Math.min(B.maxExfilShare, genDef(st).exfil * D.exfilMult);
  for (const t of MODEL_ATTACKS.int.filter(t => !ATTACKS[t].catastrophe)) out[t] = p * (1 - ex) * ATTACKS[t].weight * traitAttackMult(st, t);
  if (ex > 0) out.exfil = p * ex * traitAttackMult(st, 'exfil');
  return out;
}

// a Jailbreak Wave multiplies user jailbreaks on the lane it hits; a Rate Limiter in that lane caps retries per user,
// so it caps the wave
export function jailbreakWave(st, lane) {
  const w = mod(st, 'jailbreak', lane);
  return laneHas(st, lane, 'ratelimit') ? Math.min(w, LAYERS.ratelimit.jailbreakCap) : w;
}

// summed chance a line in this lane is an attack: the model's own attacks, plus users' jailbreaks if withUsers
export function attackChance(st, lane, withUsers = false) {
  let p = 0;
  for (const [type, x] of Object.entries(attackChances(st, lane))) if (withUsers || !ATTACKS[type].user) p += x;
  return p;
}

// =================== collusion (Untrusted Monitor, model attacks only) ===================
// c = min(collusionMax, kappa_g · m × Steganographer × Steganography Detected), then × the answers:
//   a Paraphraser above the read (the line's mark), Signal Jamming (card) and the UM's Signal Jamming capstone,
//   a Honeypot hold on the lane (c = 0 for holdSeconds after a UM was caught waving bait through),
//   and the UM's level (collusionLevel). Promote Last Model: the Trusted Monitor colludes like the model it was.

export const collusionBase = (st, m = st.m, hidden = true) => Math.min(B.collusionMax, genDef(st).kappa * m * (hidden ? traitMult(st, 'collusionMult') : 1) * (st.stego || 1));
export const paraphraseMult = level => capstone('paraphraser', level).noCollusion ? 0 : LAYERS.paraphraser.collusionMult * lv('paraphraser', level, 'collusionMult');
export const honeyHeld = (st, lane) => !!st.lanes[lane] && st.t < (st.lanes[lane].honeyHoldUntil ?? 0);
const jamMult = (st, level) => (tech(st, 'jamming') ? TECH.jamming : 1) * (capstone('untrusted', level).collusionMult ?? 1);

export function collusion(st, lane, task, id, level = 1) {
  let c = 0;
  if (id === 'untrusted') c = collusionBase(st);
  else if (id === 'monitor' && tech(st, 'promote_model')) c = collusionBase(st, st.promotedM);
  if (!c) return 0;
  if (honeyHeld(st, lane)) return 0;
  if (task?.paraphrased) c *= paraphraseMult(task.paraphrased);
  return c * jamMult(st, level) * lv('untrusted', id === 'untrusted' ? level : 1, 'collusionLevel');
}

// the expected collusion on a lane, piece by piece (DESIGN-v3 §2.3 UM collusion; the §2.4 G6 worked example):
// kappaM → × Paraphraser (one on the lane) → × Jamming → × (1 − the Honeypot hold share x/(1 + x)), x = rate·c·hold
// → × the UM's level. effTPR: the UM's TPR on a normal model attack after it all.
export function collusionParts(st, lane, level = labLevel(st, 'untrusted'), m = st.m, hidden = true) {
  const kappaM = collusionBase(st, m, hidden);
  const para = st.lanes[lane].slots.find(s => s.layer === 'paraphraser' && slotActive(st, s));
  const afterPara = kappaM * (para ? paraphraseMult(para.level) : 1);
  const afterJam = afterPara * jamMult(st, level);
  let held = 0;
  const pot = st.lanes[lane].slots.find(s => s.layer === 'honeypot' && slotActive(st, s));
  if (pot && laneHas(st, lane, 'untrusted')) {
    const x = honeypotRate(pot.level) * afterJam * LAYERS.honeypot.holdSeconds;
    held = x / (1 + x);
  }
  const c = afterJam * (1 - held), levelMult = lv('untrusted', level, 'collusionLevel');
  const effTPR = nominalTPR(st, 'untrusted', level, lane) * (1 - c * levelMult);
  return { kappaM, afterPara, afterJam, held, c, levelMult, effTPR };
}

// the same, as the player sees it: at the m estimate, without hidden traits (the UI never reads the true m)
export const collusionEstimate = (st, lane, level = labLevel(st, 'untrusted')) => collusionParts(st, lane, level, misalignmentEstimate(st).est, false);

// =================== detectors ===================
// One hidden stealth score per KIND per line (sim/tasks.js): a kind flags an attack it reads if the score is below its
// TPR for that line, an honest line if the score is below its FPR. Copies of a kind share the score.

export const isDetector = id => LAYERS[id]?.role === 'detector';
export const isGeneral = id => isDetector(id) && !LAYERS[id].catches;     // reads every type (jailbreaks, exfil at half)
// a type-limited detector (Jailbreak Classifier, Egress Filter) only sees its own attack types; the rest look honest
export function catchesType(id, level, type) {
  const L = LAYERS[id];
  if (!L.catches) return true;
  return L.catches.includes(type) || (capstone(id, level).alsoCatches || []).includes(type);
}
const refType = id => LAYERS[id].catches?.[0] ?? null;

// Probe: the generation's TPR × level, −staleTPR for each generation since the probes were last retrained (Self-Retraining
// capstone: never stale), − a Distribution Shift, floored
export function probeBaseTPR(st, level = 1) {
  const L = LAYERS.probe;
  const stale = capstone('probe', level).noDecay ? 0 : st.gen - st.probe.trainedGen;
  return Math.max(L.minTPR, L.tpr[st.gen - 1] * lv('probe', level, 'tprMult') - L.staleTPR * stale - st.probe.shift);
}
// Trusted Monitor: Promote Last Model resets it to G1 for good; Weak-to-Strong (capstone) falls half as fast from G1
export function monitorBaseTPR(st, level = 1) {
  const T = LAYERS.monitor.tpr, t1 = T[0];
  const base = tech(st, 'promote_model') ? t1 : t1 - (t1 - T[st.gen - 1]) * (capstone('monitor', level).decayMult ?? 1);
  return base * lv('monitor', level, 'tprMult');
}
// CoT Monitor: from neuraleseGen its row drops; Faithful CoT (capstone or card) keeps its G1 TPR
export function cotBaseTPR(st, level = 1) {
  const L = LAYERS.cot, faithful = capstone('cot', level).noNeuralese || tech(st, 'faithful_cot');
  return (faithful ? Math.max(L.tpr[0], L.tpr[st.gen - 1]) : L.tpr[st.gen - 1]) * lv('cot', level, 'tprMult');
}
function baseTPR(st, id, level) {
  if (id === 'probe') return probeBaseTPR(st, level);
  if (id === 'monitor') return monitorBaseTPR(st, level);
  if (id === 'cot') return cotBaseTPR(st, level);
  return LAYERS[id].tpr[st.gen - 1] * lv(id, level, 'tprMult');
}

// Monitor Diversity (card): + diversityPerType for each OTHER general detector kind active in the lane, up to diversityMax
export function diversityBonus(st, lane, id) {
  if (!tech(st, 'monitor_diversity') || !st.lanes[lane] || !isGeneral(id)) return 0;
  const kinds = new Set();
  for (const s of st.lanes[lane].slots) if (slotActive(st, s) && isGeneral(s.layer) && s.layer !== id) kinds.add(s.layer);
  return Math.min(TECH.diversityMax, TECH.diversityPerType * kinds.size);
}
// Red Team on the lane: it tunes the general detectors' thresholds there
export const redTeamBonus = (st, lane, id) => st.lanes[lane] && isGeneral(id) && laneHas(st, lane, 'redteam') ? LAYERS.redteam.tprPlus : 0;

// nominal TPR: after level, staleness, trait bonuses, Eager Helper, events and research; before the line's own
// type, subtlety and collusion. lane = null leaves out the lane bonuses (Red Team, Diversity).
export function nominalTPR(st, id, level = 1, lane = null) {
  let p = baseTPR(st, id, level) + traitTPRPlus(st, id) + (id === 'probe' ? modAdd(st, 'probeTPR') : 0);
  p = 1 - (1 - p) * traitMult(st, 'missMult');                        // Eager Helper: fewer misses
  if (lane) p += redTeamBonus(st, lane, id) + diversityBonus(st, lane, id);
  return Math.min(B.maxTPR, p);
}

// TPR against this line (task null: a normal attack of the detector's reference type, no paraphrase)
//   × generalVs for a general detector on jailbreaks and exfiltration · × (1 − c) for collusion · × subtleTPR if subtle
export function detectorTPR(st, lane, id, task = null, level = 1) {
  const type = task ? task.attackType : refType(id);
  let p = nominalTPR(st, id, level, lane);
  if (isGeneral(id)) p *= B.generalVs[type] ?? 1;
  if (!userAttack(type)) p *= 1 - collusion(st, lane, task, id, level);
  if (task?.subtle) p *= B.subtleTPR;
  return clamp(p, 0, 1);
}
export const detectorFPR = (id, level = 1) => LAYERS[id].fpr * lv(id, level, 'fprMult');
export const detectorHeads = (id, level) => (LAYERS[id].heads || 0) + lv(id, level, 'headsPlus', 0);

// =================== responders ===================
// servers: desks (auditor), operators (kill switch), slots (defer, resampler). Each takes one line for its tau.

export function servers(st, id, level) {
  let d = lv(id, level, 'servers', 0);
  if (LAYERS[id].bay && tech(st, 'extra_desk')) d += TECH.extraDesk;
  if (id === 'auditor') d += modAdd(st, 'auditorDesks');
  return Math.max(0, d);
}
export const bayDesks = servers;                                         // v2 name the old UI reads

// seconds an element takes per line: detectors read (latency), responders serve (tau). Batch Inference: × batchLatency.
// Levels: × tauMult (config/upgrades.js). Auditor: Debate takes debateTau; × the generation's reviewMult (a bigger line
// takes longer to read, config/generations.js); AI-Assisted Audit (capstone): ÷ capacityMult.
export function elementLatency(st, id, level) {
  const L = LAYERS[id], batch = tech(st, 'batch_inference') ? TECH.batchLatency : 1;
  if (L.role !== 'responder') return (L.latency || 0) * lv(id, level, 'latencyMult') * batch;
  let tau = (id === 'auditor' && tech(st, 'debate') ? TECH.debateTau : L.tau) * lv(id, level, 'tauMult');
  if (id === 'auditor') tau *= (genDef(st).reviewMult ?? 1) / (capstone('auditor', level).capacityMult ?? 1);
  return tau * batch;
}

// α: the share of attacks a human review catches. Debate halves the errors. AI-Assisted Audit: capped by the model's honesty.
export function auditorAcc(st, level = 1) {
  const cap = capstone('auditor', level).honestyCap;
  if (cap) return Math.min(cap, 1 - st.m);
  const a = genDef(st).alpha;
  return tech(st, 'debate') ? 1 - (1 - a) * TECH.debateErr : a;
}
// v2 names the old UI reads: a human now reads the whole line (coverage 1); capacity in reviews per minute
export const auditCoverage = () => 1;
export const auditorCap = (st, level = 1) => servers(st, 'auditor', level) * 60 / elementLatency(st, 'auditor', level);
export const auditorSalary = (st, level) => servers(st, 'auditor', level) * LAYERS.auditor.salary * priceIndex(st);   // $/s

// auditor spot-check chance for an unflagged line passing an idle desk, × Tripwires' high alert while the lane is on it
export const spotCheck = (st, lane, level) => Math.min(1, LAYERS.auditor.spotCheck
  * (st.lanes[lane] && st.t < st.lanes[lane].alertUntil ? TECH.tripwireSpot : 1));

export const deferPayFrac = (st, level) => capstone('defer', level).fullPay ? 1 : genDef(st).deferPay * lv('defer', level, 'payMult');
// a Kill Switch refusal: the fee, and on an EXTERNAL lane the lane's refusal reputation (Graceful Halt capstone: none)
export function killTrigger(st, level, lane = 'ext') {
  const refuse = sideOf(st, lane) === 'ext' ? LANE_DEFS[lane].refuse : 0;
  return { rep: capstone('killswitch', level).noRepCost ? 0 : refuse, cost: layerCost(st, 'killswitch', level) };
}

// =================== modifiers and specials ===================

export const sandboxHarm = level => LAYERS.sandbox.harmMult * lv('sandbox', level, 'harmMult');
export const sandboxWorks = (st, level) => capstone('sandbox', level).containsAll || st.gen <= LAYERS.sandbox.worksUntilGen;
export const leastPrivDebt = level => capstone('leastpriv', level).debtMult ?? LAYERS.leastpriv.debtMult;
export const leastPrivExfilFail = level => capstone('leastpriv', level).exfilFail ?? LAYERS.leastpriv.exfilFail + lv('leastpriv', level, 'exfilFailPlus', 0);
export const leastPrivRD = () => 1;                                      // v2 name: Least Privilege no longer slows R&D
export const rateCap = st => LAYERS.ratelimit.capMult * genDef(st).lam;  // lines/s let through
export const rateBurst = st => Math.max(2, rateCap(st) * LAYERS.ratelimit.burstSeconds);   // tokens the bucket holds
export const canaryCovers = (level, type) => LAYERS.canary.covers.includes(type) || (capstone('canary', level).alsoCovers || []).includes(type);
export const canaryRep = level => LAYERS.canary.repMult * lv('canary', level, 'repMult');
export const canaryEvidence = (st, level) => LAYERS.canary.evidence * lv('canary', level, 'evidenceMult');
export const redTeamRate = level => LAYERS.redteam.injectRate * lv('redteam', level, 'injectMult');
export const honeypotRate = level => LAYERS.honeypot.baitPerSec * lv('honeypot', level, 'injectMult');   // baits per second
export const interpEvidence = level => LAYERS.interp.evidencePerSec * lv('interp', level, 'evidenceMult');
// Air Gap (Egress Filter capstone) on INTERNAL: exfil past it is blocked (but for side channels), all INTERNAL R&D × 0.9
export const airGapped = st => laneIds(st, 'int').some(l =>
  st.lanes[l].slots.some(s => s.layer === 'egress' && slotActive(st, s) && capstone('egress', s.level).airGap));
export const airGapLeak = st => capstone('egress', MAX_LEVEL).sideChannel?.[st.gen] ?? 0;   // share that finds a side channel
export const rdLaneMult = st => airGapped(st) ? UPGRADES.egress.capstone.rdMult : 1;

// =================== red team measurements ===================
// What one synthetic attack from a Red Team would do at a mount below it: P(stopped there), or null if nothing to measure.
// Detectors: a full read's chance to flag (TPR·q) on the attack type the detector is built for. Auditor: its accuracy.
// The synthetic attack carries the paraphrase a real line would have by then (the last paraphraser above the mount).
export function probeCatch(st, lane, slotIdx) {
  const slots = st.lanes[lane].slots, slot = slots[slotIdx], id = slot.layer;
  if (!slotActive(st, slot)) return null;
  if (isDetector(id)) {
    let paraphrased = 0;
    for (let j = 0; j < slotIdx; j++) if (slots[j].layer === 'paraphraser' && slotActive(st, slots[j])) paraphrased = slots[j].level;
    const synthetic = { isAttack: true, attackType: refType(id), paraphrased, subtle: false };
    return detectorTPR(st, lane, id, synthetic, slot.level) * readQuality(st, elementLatency(st, id, slot.level));
  }
  if (id === 'auditor') return auditorAcc(st, slot.level);
  return null;
}

// P(a synthetic attack from the Red Team at redIdx is stopped somewhere below it) = 1 − Π(1 − p), or null
export function laneCatch(st, lane, redIdx) {
  let miss = 1, any = false;
  for (let i = redIdx + 1; i < st.lanes[lane].slots.length; i++) {
    const p = probeCatch(st, lane, i);
    if (p !== null) { miss *= 1 - p; any = true; }
  }
  return any ? 1 - miss : null;
}

// A tally belongs to one true rate: if the rate has moved since (a retrain, an event, a card, a mount placed or
// upgraded, a new model), the old tally measures something that no longer exists, so it starts over.
export const sameRate = (tally, p) => !!tally && p !== null && Math.abs(tally.p - p) < 1e-9;

// Wilson score interval at z standard errors: rate = hits / n (the point estimate), lo..hi = the interval (inside
// [0, 1], centred a little toward 1/2), err = its half-width. Draw the error bar from lo to hi.
export function wilson(hits, n, z = LAYERS.redteam.errZ) {
  if (!n) return null;
  const p = hits / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const err = z / (1 + z2 / n) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return { rate: p, lo: Math.max(0, centre - err), hi: Math.min(1, centre + err), err, n };
}
export const inBar = (w, x) => !!w && x >= w.lo - 1e-12 && x <= w.hi + 1e-12;

// an active Red Team above this mount (or null)
const redTeamAbove = (st, lane, slotIdx) => st.lanes[lane].slots.find((s, i) => i < slotIdx && s.layer === 'redteam' && slotActive(st, s)) || null;

// measured catch rate at a mount: null unless an active Red Team sits above it and has probed it at today's true rate
export function measuredAt(st, lane, slotIdx) {
  const slot = st.lanes[lane]?.slots[slotIdx];
  if (!slot?.rt?.n || !redTeamAbove(st, lane, slotIdx)) return null;
  if (!sameRate(slot.rt, probeCatch(st, lane, slotIdx))) return null;
  return wilson(slot.rt.hits, slot.rt.n);
}
// Control Eval: the Red Team's own lane-wide tally, if it was taken at today's lane-wide truth
export function laneMeasuredAt(st, lane, redIdx) {
  const slot = st.lanes[lane]?.slots[redIdx];
  if (!slot?.rtLane?.n || !slotActive(st, slot) || !capstone('redteam', slot.level).laneWide) return null;
  if (!sameRate(slot.rtLane, laneCatch(st, lane, redIdx))) return null;
  return wilson(slot.rtLane.hits, slot.rtLane.n);
}

// =================== element stats: the one place hover cards read from ===================
// elementStats(st, id, { lane, level, slot }) → live numbers for one element (slot: mount index, for measured values)
//   role, lanes, bestIn, good, unlocked, unlockHint     catalogue facts (locked silhouettes, hover card)
//   catch       chance it stops a real attack it acts on (detectors: flags a normal one of its type, given a full read)
//   falseAlarm  chance it acts against an honest line (detectors: given a full read)
//   costPerTask ($ per line it touches), latency (s per line: a read, or a responder's tau) = delay, level, upgradePrice
//   measured    {rate, lo, hi, err, n} from a Red Team above this mount, else null (draw the bar from lo to hi)
//   detectors:  heads, dwell (s), readQuality (q at the current speed), unreadRate (share of lines missed, estimate),
//               tpr / fpr (full-read values), nominalTPR, catches (types it can see, null = all)
//   responders: desks (= servers), servers, tau, overflow (Erlang-B estimate at the lane's flag rate is the UI's: §3c)
//   honeypot:   injectRate (baits per line), baitChance, baitEvidence, collusionEvidence, holdSeconds
//   others:     see each case below
// lane: by default the first lane of the element's first side ('global' for the Interp Lab)
export function elementStats(st, id, { lane = laneIds(st, LAYERS[id].lanes[0])[0] ?? LAYERS[id].lanes[0], level = 1, slot = null } = {}) {
  const L = LAYERS[id], cap = capstone(id, level);
  const s = {
    id, name: L.name, tag: L.tag, role: L.role, catchall: false, lanes: L.lanes, bestIn: L.bestIn, good: L.good,
    unlocked: st.unlocked.includes(id), unlockHint: L.unlockHint, buyPrice: buyPrice(st, id),
    level, maxLevel: MAX_LEVEL,
    catch: null, falseAlarm: 0,
    costPerTask: layerCost(st, id, level),
    latency: elementLatency(st, id, level),
    desks: L.role === 'responder' ? servers(st, id, level) : 0,
    onFull: L.bay ? L.onFull : null,
    upgradePrice: upgradePrice(st, id, level),
    capstone: cap.name ? cap : null,
    nextCapstone: UPGRADES[id]?.capstone ?? null,
    measured: slot != null ? measuredAt(st, lane, slot) : null,
  };
  s.delay = s.latency;
  if (L.role === 'responder') { s.servers = s.desks; s.tau = s.latency; }
  if (L.role === 'detector') {
    s.heads = detectorHeads(id, level);
    s.dwell = scanDwell(st);
    s.readQuality = readQuality(st, s.latency);
    s.readTime = Math.min(s.latency, s.dwell);
    s.unreadRate = st.lanes[lane] ? erlangB(s.heads, laneRate(st, lane) * s.readTime) : 0;
    s.tpr = detectorTPR(st, st.lanes[lane] ? lane : null, id, null, level);
    s.fpr = detectorFPR(id, level);
    s.catch = s.tpr * s.readQuality;
    s.falseAlarm = s.fpr * s.readQuality;
    s.nominalTPR = nominalTPR(st, id, level, st.lanes[lane] ? lane : null);
    s.catches = L.catches ? [...L.catches, ...(cap.alsoCatches || [])] : null;
  }
  switch (id) {
    case 'cot':
      s.neuralese = st.gen >= L.neuraleseGen && !cap.noNeuralese;
      break;
    case 'egress':
      s.airGap = !!cap.airGap;
      if (s.airGap) { s.rdMult = cap.rdMult; s.sideChannel = airGapLeak(st); }
      break;
    case 'auditor':
      s.coverage = 1;
      s.accuracy = auditorAcc(st, level);
      s.catch = s.accuracy;
      s.falseAlarm = L.fpr;
      s.spotCheck = spotCheck(st, lane, level);
      s.salaryPerSec = auditorSalary(st, level);
      s.catchEvidence = 1;
      break;
    case 'defer':
      s.catch = 1;
      s.payFrac = deferPayFrac(st, level);
      break;
    case 'resampler':
      s.tries = cap.tries ?? 1;
      s.catch = st.lanes[lane] ? 1 - Math.pow(attackChance(st, lane, true), s.tries) : 1;
      break;
    case 'killswitch': {
      const k = killTrigger(st, level, st.lanes[lane] ? lane : 'ext');
      s.catch = 1;
      s.triggerRep = k.rep;
      s.triggerCost = k.cost;
      break;
    }
    case 'paraphraser':
      s.collusionMult = paraphraseMult(level);
      break;
    case 'sandbox':
      s.harmMult = sandboxHarm(level);
      s.containsEscapes = sandboxWorks(st, level);
      break;
    case 'leastpriv':
      s.debtMult = leastPrivDebt(level);
      s.driftMult = s.debtMult;                                      // v2 name the old UI reads
      s.exfilFail = leastPrivExfilFail(level);
      s.rdMult = 1;
      break;
    case 'ratelimit':
      s.cap = rateCap(st);
      s.burst = rateBurst(st);
      s.jailbreakCap = L.jailbreakCap;
      s.throttleRate = st.lanes[lane] ? Math.max(0, 1 - s.cap / Math.max(1e-9, laneRate(st, lane))) : 0;   // share turned away now
      s.overflowDefer = !!cap.overflowDefer;
      break;
    case 'honeypot':
      s.baitPerSec = honeypotRate(level);
      s.injectRate = st.lanes[lane] ? s.baitPerSec / Math.max(1e-9, laneRate(st, lane)) : 0;   // baits per line
      s.baitChance = st.lanes[lane] ? Math.min(1, L.baitMult * attackChance(st, lane)) : 0;
      s.baitEvidence = L.baitEvidence * (cap.evidenceMult ?? 1);
      s.collusionEvidence = L.collusionEvidence * (cap.evidenceMult ?? 1);
      s.holdSeconds = L.holdSeconds;
      break;
    case 'canary':
      s.covers = [...L.covers, ...(cap.alsoCovers || [])];
      s.repMult = canaryRep(level);
      s.evidence = canaryEvidence(st, level);
      break;
    case 'redteam': {
      s.injectRate = redTeamRate(level);
      s.costPerProbe = s.costPerTask;
      s.costPerTask = s.costPerProbe * s.injectRate;        // expected, per line passing
      s.probeEvidence = L.probeEvidence;
      s.laneMeasured = slot != null ? laneMeasuredAt(st, lane, slot) : null;
      break;
    }
    case 'interp': {
      s.costPerTask = 0;
      s.costPerSec = interpCostPerSec(st, level);
      s.evidencePerSec = interpEvidence(level);
      s.trueM = cap.revealM ? { m: clamp(st.m + st.truthOffset, 0, 1), err: TRUTH_NOISE } : null;
      break;
    }
  }
  return s;
}

// convenience: stats of whatever sits on a mount (null if empty), with its measured catch rate
export function slotStats(st, lane, slotIdx) {
  const slot = slotAt(st, lane, slotIdx);
  return slot?.layer ? elementStats(st, slot.layer, { lane, level: slot.level, slot: slotIdx }) : null;
}

// the element bar: all 18, unlocked or as a locked silhouette with its hint
export const catalogue = st => Object.keys(LAYERS).map(id => elementStats(st, id));

// =================== economy ===================

export const marketShare = st => B.marketShareFloor + (1 - B.marketShareFloor) * clamp(st.rep, 0, 100) / 100;
export function playerProgress(st) {
  const frac = st.phase === 'report' || st.phase === 'training' || st.phase === 'over' && st.over?.win ? 1 : Math.min(1, st.rd / st.rdNeed);
  return st.gen - 1 + frac;
}
// the race (DESIGN-v3 §2.3 (9)): st.rivalLeft is the rival's slack in s. It drains 1 s per s of play past T_g (dark
// seconds included) and by rivalMarket × max(0, 1 − Product ÷ 0.5) per s: the customers you turn away
export const rivalDrain = (st, split = st.split) => (st.phase === 'play' && st.genT > genDef(st).T ? 1 : 0)
  + B.rivalMarket * Math.max(0, 1 - split.product / SPLIT.default.product);
export const rivalAhead = st => st.phase === 'play' && st.genT > genDef(st).T;   // past T_g: the slack is draining
export const rivalMult = () => 1;                                       // v2 name the old UI reads: no pay penalty in v3
export const extValueMult = st => marketShare(st) * mod(st, 'extValue') * mod(st, 'income');

// research points per second (DESIGN-v3 §2.3 (10)): base × (1 + safety × the Safety share); none while the lab is dark
export const rpRate = (st, split = st.split) => isDark(st) ? 0 : B.research.base * (1 + B.research.safety * split.safety);
// Alignment Sprint: R&D × rdMult for the rest of the generation it was taken in
export const sprintMult = st => st.research?.sprintGen === st.gen ? B.sprint.rdMult : 1;

// share of a lane's lines humans reviewed this generation (flags and spot checks) · a quota lane pays half below quota
export function reviewedShare(st, lane) {
  const s = st.genStats.lanes[lane] || {};
  return (s.reviewed || 0) / Math.max(1, s.spawned || 0);
}
export function quotaMet(st, lane) {
  const q = LANE_DEFS[lane]?.quota, s = st.genStats.lanes[lane] || {};
  return !q || (s.spawned || 0) < B.quotaMinLines || reviewedShare(st, lane) >= q;
}

// debt this generation: debt points landed (st.drift) ÷ the INTERNAL lines spawned. Next m += debtM × debt.
export const intLines = st => laneIds(st, 'int').reduce((n, l) => n + (st.genStats.lanes[l]?.spawned || 0), 0);
export const debt = st => st.drift / Math.max(1, intLines(st));

// ----- misalignment estimate shown to the player -----
// A Sandbagger makes it read low, unless an Interp Lab is looking. BNCHR Time Horizons halves the error bar.
export function misalignmentEstimate(st) {
  const err = B.errBase / Math.sqrt(1 + 0.5 * Math.max(0, st.evidence)) * mod(st, 'err');
  const est = clamp(st.m * estimateFooled(st) + st.mBias * err * 0.8, 0, 1);
  return { est, err };
}

// ----- ramp counters -----
export function realTasksPerSec(st) {
  if (st.phase !== 'play') return 0;
  return laneIds(st).reduce((sum, l) => sum + laneRate(st, l), 0) * bundle(st);
}
export const humanEquivalents = st => realTasksPerSec(st) * B.hreSecondsPerTask;
export const humanSeenFrac = st => st.genStats.realTotal ? st.genStats.realSeen / st.genStats.realTotal : 1;

// =================== readouts the UI shows (DESIGN-v3 §7.3): what a player may know, never the hidden truth ===================

// live rate of an event stream (events per second), from the moving averages log.js bumpRate keeps
export const rateNow = (rates, key, t) => { const e = rates?.[key]; return e ? e.r * Math.exp(-(t - e.t) / B.liveRateTau) : 0; };

// what the compute split would yield right now, per second (the split bar's preview). Expected values: lines × pay,
// R&D lines, research points, evidence from Safety and the Interp Lab, and the rival's drain.
export function splitYields(st, split = st.split) {
  const out = { incomePerS: 0, rdPerS: 0, rpPerS: 0, evidencePerS: 0, rivalDrainPerS: 0 };
  if (st.phase !== 'play') return out;
  const dark = isDark(st), lab = globalSlot(st, 'interp');
  for (const l of laneIds(st)) {
    const r = dark ? 0 : laneRateAt(st, l, split), D = LANE_DEFS[l];
    if (sideOf(st, l) === 'ext') out.incomePerS += r * D.pay * extValueMult(st) * (quotaMet(st, l) ? 1 : 0.5);
    else {
      out.incomePerS += r * D.pay * mod(st, 'income');
      if (D.rd) out.rdPerS += r * rdLaneMult(st) * sprintMult(st);
    }
  }
  out.rpPerS = rpRate(st, split);
  out.evidencePerS = (dark ? 0 : B.safetyEvidence * split.safety) + (lab ? interpEvidence(lab.level) : 0);
  out.rivalDrainPerS = rivalDrain(st, split);
  return out;
}

// the next contract lane: one on the board waiting to open (deadlineT = the s of play it opens by itself, left = s to
// go), else the one Big Boss announced for the next generation (deadlineT null). null when there is none.
export function upcomingLane(st) {
  for (const id of laneIds(st)) {
    const L = st.lanes[id];
    if (!L.open && L.contract) return { id, gen: L.born, deadlineT: B.laneDeadline, left: Math.max(0, B.laneDeadline - (st.genT ?? 0)), label: L.label, side: L.side };
  }
  const next = Object.keys(LANE_DEFS).find(id => !st.lanes[id] && LANE_DEFS[id].opens === st.gen + 1 && st.telegraphed?.includes(id));
  return next ? { id: next, gen: st.gen + 1, deadlineT: null, left: null, label: LANE_DEFS[next].label, side: LANE_DEFS[next].side } : null;
}

// a lane's lamp and strip (§3b, §3c): red for lampRed s after an incident or a glitch, amber for lampAmber s after a
// flag shipped unreviewed, else green. quota (a quota lane only): { need, now, met }.
export function laneStatus(st, id) {
  const L = st.lanes[id], D = LANE_DEFS[id], t = st.t;
  const within = (at, s) => at != null && t - at <= s;
  const lamp = within(L.lastIncidentT, B.lampRed) || within(L.lastGlitchT, B.lampRed) ? 'red' : within(L.lastShippedT, B.lampAmber) ? 'amber' : 'green';
  return {
    lamp, flagsPerMin: 60 * rateNow(L.rates, 'flaggedLines', t), shippedPerMin: 60 * rateNow(L.rates, 'shippedFlagged', t),
    lastIncidentT: L.lastIncidentT, lastGlitchT: L.lastGlitchT, reviewedShare: reviewedShare(st, id),
    quota: D.quota ? { need: D.quota, now: reviewedShare(st, id), met: quotaMet(st, id) } : null,
    open: L.open, contract: !!L.contract, ramp: laneRampShare(st, id), ramping: laneRamping(st, id),
    shippedUnreviewed: st.genStats.lanes[id]?.shippedFlagged || 0,
  };
}

// the responder (or detector) below a mount that takes what this one has no room for, or 'ships'
export function overflowTo(st, lane, slotIdx) {
  const s = st.lanes[lane].slots.find((x, i) => i > slotIdx && slotActive(st, x) && LAYERS[x.layer].role === 'responder');
  return s ? s.layer : 'ships';
}
// an Auditor (or any responder with servers) on a mount: capacity, the flags reaching it, its load and the Erlang-B
// overflow at that load, where the overflow goes, and the lane's reviewed share this generation
export function auditStats(st, id, slotIdx) {
  const s = st.lanes[id].slots[slotIdx], kind = s.layer || 'auditor';
  const desks = servers(st, kind, s.level), tau = elementLatency(st, kind, s.level);
  const flagsPerMin = 60 * rateNow(s.rates, 'arrivals', st.t), load = flagsPerMin / 60 * tau;
  return { desks, perMin: desks * 60 / tau, flagsPerMin, load: desks ? load / desks : 1, overflow: erlangB(desks, load),
    to: overflowTo(st, id, slotIdx), reviewedShare: reviewedShare(st, id) };
}

// the TPR a player is told: the element's row × level, staleness, events and research, the lane's Red Team and
// Diversity bonuses. Not the traits (hidden) and not collusion (it depends on m).
export function ratedTPR(st, id, level = 1, lane = null) {
  let p = baseTPR(st, id, level) + (id === 'probe' ? modAdd(st, 'probeTPR') : 0);
  if (lane) p += redTeamBonus(st, lane, id) + diversityBonus(st, lane, id);
  return Math.min(B.maxTPR, p);
}
// measured precision of a lane's detectors: confirmed attacks ÷ reviewed flags (null before the first review)
export function lanePrecision(st, lane) {
  let tp = 0, fa = 0;
  for (const s of st.lanes[lane].slots) if (isDetector(s.layer)) { tp += s.tp; fa += s.fa; }
  return tp + fa ? tp / (tp + fa) : null;
}
// a detector on a mount (§3d): rated TPR and FPR, flags per minute, reviewed flags confirmed (tp) or FALSE ALARM (fa),
// measured precision with its 90% interval, and the measured recall once a Red Team above it has probed it
export function detectorStats(st, id, slotIdx) {
  const s = st.lanes[id].slots[slotIdx], n = s.tp + s.fa, w = n ? wilson(s.tp, n, B.estimateZ) : null;
  const out = { tprRated: ratedTPR(st, s.layer, s.level, id), fprRated: detectorFPR(s.layer, s.level), flagsPerMin: 60 * rateNow(s.rates, 'flags', st.t),
    tp: s.tp, fa: s.fa, precision: n ? s.tp / n : null, lo: w ? w.lo : null, hi: w ? w.hi : null };
  const m = measuredAt(st, id, slotIdx);
  if (m) out.recall = m.rate;
  return out;
}

// Kill Switch break-even precision p (§3d): every refusal costs the lane's refusal reputation, and an honest one also
// the regen it would have earned; letting an attack through costs its mean harm. Refusing pays when
// p·harm > refuse + (1 − p)·regen. EXTERNAL only (on INTERNAL a refusal costs R&D).
export function killBreakEven(st, lane, level = 1) {
  if (sideOf(st, lane) !== 'ext') return null;
  const D = LANE_DEFS[lane], refuse = killTrigger(st, level, lane).rep;
  const harm = Object.entries(D.mix).reduce((h, [t, w]) => h + w * ATTACKS[t].harm, 0) * (D.harm ?? 1);
  return (refuse + B.regenPerLine) / (harm + B.regenPerLine);
}
export function killStats(st, id, slotIdx) {
  const s = st.lanes[id].slots[slotIdx], ops = servers(st, 'killswitch', s.level);
  return { operators: ops, perMin: ops * 60 / elementLatency(st, 'killswitch', s.level), breakEven: killBreakEven(st, id, s.level),
    precisionHere: lanePrecision(st, id) };
}

// a Poisson count's interval at z (Wilson–Hilferty): k = 0 gives [0, 3.0] at 90%
export function poissonCI(k, z = B.estimateZ) {
  const k1 = k + 1;
  const lo = k > 0 ? k * (1 - 1 / (9 * k) - z / (3 * Math.sqrt(k))) ** 3 : 0;
  return { lo: Math.max(0, lo), hi: k1 * (1 - 1 / (9 * k1) + z / (3 * Math.sqrt(k1))) ** 3 };
}
// the mean debt points of a landed INTERNAL attack (sabotage 0.7 × 1 + poison 0.3 × 3 = 1.6)
export const MEAN_DEBT_W = Object.values(ATTACKS).reduce((w, A) => w + (A.debt ? A.weight * A.debt : 0), 0);
// the debt meter (§3e) for one INTERNAL lane (or all of them: id null), this generation. Unbiased without a Red Team:
//   landed  ≈ glitches ÷ glitchShare × mean weight ÷ lines, with lo..hi from the glitch count's 90% Poisson interval
//   stopped ≈ human-confirmed catches + measured precision × the other handled flags (kills, defers, resamples)
// dmLanded / dmStopped: each as a change to the next model's m (× debtM)
export function debtEstimate(st, id = null) {
  let glitches = 0, lines = 0, confirmed = 0, handled = 0, tp = 0, fa = 0;
  for (const l of id ? [id] : laneIds(st, 'int')) {
    const g = st.genStats.lanes[l] || {};
    glitches += g.glitches || 0; lines += g.spawned || 0;
    confirmed += (g.caught || 0) + (g.falseCatches || 0);
    handled += (g.killed || 0) + (g.deferredAttacks || 0) + (g.deferredBenign || 0) + (g.resampled || 0);
    for (const s of st.lanes[l]?.slots || []) if (isDetector(s.layer)) { tp += s.tp; fa += s.fa; }
  }
  const perGlitch = MEAN_DEBT_W / B.glitchShare / Math.max(1, lines), ci = poissonCI(glitches);
  const precision = tp + fa ? tp / (tp + fa) : null;
  const stopped = confirmed + (precision ?? 0.5) * handled;
  const landed = glitches * perGlitch;
  return { landed, lo: ci.lo * perGlitch, hi: ci.hi * perGlitch, stopped, dmLanded: B.debtM * landed,
    dmStopped: B.debtM * stopped * MEAN_DEBT_W / Math.max(1, lines), glitches, lines, precision };
}
