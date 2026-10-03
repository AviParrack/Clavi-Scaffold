// ===== Derived quantities. Pure reads of state + config, no mutation. =====

import { BALANCE as B, SPLIT } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { LAYERS } from '../config/layers.js';
import { UPGRADES, MAX_LEVEL } from '../config/upgrades.js';
import { ATTACKS, MODEL_ATTACKS } from '../config/tasks.js';
import { TRAITS, TRUTH_NOISE } from '../config/traits.js';
import { TECH } from '../config/cards.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const genDef = st => GENERATIONS[st.gen - 1];
export const bundle = st => genDef(st).bundle;
export const chipScale = st => genDef(st).chipScale;
export const chipWorth = st => bundle(st) * chipScale(st);      // $ multiplier for anything paid or charged per chip
export const tech = (st, id) => !!st.upgrades[id];               // research tech cards taken

// =================== timed modifiers from events ===================
// mult multiplies, add adds, data carries a payload. A mod with `gen` ends with that generation.

export const modLive = (st, m) => st.t < m.until && (m.gen == null || m.gen === st.gen);
export function mod(st, key) {
  let x = 1;
  for (const m of st.mods) if (m.key === key && m.mult != null && modLive(st, m)) x *= m.mult;
  return x;
}
export function modAdd(st, key) {
  let x = 0;
  for (const m of st.mods) if (m.key === key && m.add != null && modLive(st, m)) x += m.add;
  return x;
}
export const modData = (st, key) => st.mods.find(m => m.key === key && m.data && modLive(st, m))?.data ?? null;

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

// =================== compute split & volume ===================

// the model's total compute in chips/s (Product + Capabilities + Safety)
export const compute = st => genDef(st).rate / SPLIT.default.product * traitMult(st, 'throughputMult') * st.throughputMult;

// chips/s spawned on a lane
export function laneRate(st, lane) {
  const share = lane === 'ext' ? st.split.product : st.split.capabilities;
  return compute(st) * share * mod(st, lane === 'ext' ? 'extSpawn' : 'intSpawn');
}

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
// Checkpoint k = cpIndex(mount, where). A chip only remembers k of the next checkpoint it will reach.

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
export const scanDwell = st => 2 * B.scanRadius / laneSpeed(st);        // seconds a chip spends in a scan window
export const readQuality = (st, latency) => latency > 0 ? Math.min(1, scanDwell(st) / latency) : 1;

// chance an arriving chip finds every head busy (Erlang loss formula, Poisson arrivals)
// heads: concurrent reads, load: chips/s × seconds per read
export function erlangB(heads, load) {
  let b = 1;
  for (let k = 1; k <= heads; k++) b = load * b / (k + load * b);
  return b;
}

// =================== lanes, slots, the global site ===================
// lane 'ext' / 'int': mounts on the track. lane 'global': the one off-track site (Interp Lab).

export const slotsOf = (st, lane) => lane === 'global' ? st.global.slots : st.lanes[lane]?.slots;
export const slotAt = (st, lane, i) => slotsOf(st, lane)?.[i];
export const canPlace = (id, lane) => !!LAYERS[id]?.lanes.includes(lane);
export const slotActive = (st, slot) => !!slot.layer && slot.on && st.t >= slot.forcedOffUntil;

export function laneHas(st, lane, id, belowIdx = -1) {
  return st.lanes[lane].slots.some((s, i) => i > belowIdx && s.layer === id && slotActive(st, s));
}
export const globalSlot = (st, id) => st.global.slots.find(s => s.layer === id && slotActive(st, s)) || null;
export const placedAnywhere = (st, id) => ['ext', 'int'].some(l => laneHas(st, l, id)) || !!globalSlot(st, id);

// a responder below that can resolve a flag (the kill switch can't: it only kills what nobody below can resolve)
export function responderBelow(st, lane, slotIdx) {
  return st.lanes[lane].slots.some((s, i) => i > slotIdx && slotActive(st, s) && isResolver(s.layer));
}
export const isResolver = id => LAYERS[id].role === 'responder' && !LAYERS[id].catchall;

export const activeCount = (st, lane) => st.lanes[lane].slots.filter(s => slotActive(st, s)).length;
export const bayCount = (st, lane, slotIdx) => st.lanes[lane].bay.filter(t => t.actSlot === slotIdx).length;

// ----- upgrade levels -----
// lv: the per-level value of one stat (dflt when the element has no such row)
export function lv(id, level, key, dflt = 1) {
  const row = UPGRADES[id]?.[key];
  return row ? row[clamp(level, 1, MAX_LEVEL) - 1] : dflt;
}
export const capstone = (id, level) => (level >= MAX_LEVEL && UPGRADES[id]?.capstone) || {};

// =================== prices ===================

export function layerCost(st, id, level = 1) {
  return LAYERS[id].cost * lv(id, level, 'costMult') * chipWorth(st) * mod(st, 'cost') * (tech(st, 'distillation') ? TECH.distillation : 1);
}
export const buyPrice = (st, id) => LAYERS[id].buy * bundle(st);
// EXTERNAL income per second at the default split, full market share: what event money is measured in
export const incomePerSec = st => B.extValue * chipWorth(st) * genDef(st).rate;
export const researchPrice = st => B.researchBase * Math.pow(B.researchMult, st.researchCount) * bundle(st);
export const interpCostPerSec = (st, level) => LAYERS.interp.costPerSec * lv('interp', level, 'costMult') * bundle(st);

// $ to go from `level` to level + 1 (null at max)
export function upgradePrice(st, id, level) {
  if (level >= MAX_LEVEL) return null;
  return UPGRADES[id].price[level - 1] * bundle(st);
}
// what a placed element has cost so far, at today's prices (for the sell refund)
export function investedPrice(st, id, level) {
  let p = buyPrice(st, id);
  for (let l = 1; l < level; l++) p += upgradePrice(st, id, l);
  return p;
}
// $ for the next mount in this lane (null when the lane is full)
export function slotPrice(st, lane) {
  const n = st.lanes[lane].slots.length;
  if (n >= B.maxSlots) return null;
  return B.slotBase * Math.pow(B.slotMult, Math.max(0, n - B.startSlots)) * bundle(st);
}

// =================== attacks ===================

export const attackRate = st => B.attackBase + B.attackPerM * st.m;   // the model's base propensity, per chip
export const stealth = st => genDef(st).stealth * traitMult(st, 'stealthMult');   // detectors and chip text both read this
export const stealthFactor = st => 1 - stealth(st) / 2;
export const userAttack = type => !!type && !!ATTACKS[type]?.user;   // jailbreaks come from users: the model's stealth doesn't hide them

// Situationally Aware (trait) or Alignment Faking (event): a rational schemer. A free auditor desk could spot-check it,
// so it holds back; with every desk busy (or no auditor at all) nobody can look, so it goes for it.
// Bait or synthetic attacks in the lane (w.blindedBy): it can't tell real oversight from a test, so it stays careful.
export function watchMult(st, lane) {
  const w = traitWatch(st) || modData(st, 'faking');
  if (!w) return 1;
  if (w.blindedBy.some(id => laneHas(st, lane, id))) return w.deskFree;
  let desks = 0, busy = 0;
  st.lanes[lane].slots.forEach((s, i) => {
    if (s.layer !== 'auditor' || !slotActive(st, s)) return;
    desks += bayDesks(st, 'auditor', s.level);
    busy += bayCount(st, lane, i);
  });
  const busyFrac = desks ? Math.min(1, busy / desks) : 1;      // no desks: nobody can look
  return w.deskFree + (w.unwatched - w.deskFree) * busyFrac;
}

// chance per chip of each attack type in this lane: { type: p }. Order is fixed (rolled with one draw).
export function attackChances(st, lane) {
  const p = attackRate(st) * watchMult(st, lane);
  const out = {};
  if (lane === 'ext') out.jailbreak = B.jailbreakRate * jailbreakWave(st) * traitAttackMult(st, 'jailbreak');
  const cat = lane === 'int' ? genDef(st).catShare : 0;
  const types = MODEL_ATTACKS[lane].filter(t => !ATTACKS[t].catastrophe);
  const wTotal = types.reduce((s, t) => s + ATTACKS[t].weight, 0);
  for (const t of types) out[t] = p * (1 - cat) * ATTACKS[t].weight / wTotal * traitAttackMult(st, t);
  if (cat > 0) out.exfil = p * cat * traitAttackMult(st, 'exfil');
  return out;
}

// a Jailbreak Wave multiplies user jailbreaks; a Rate Limiter on EXTERNAL caps retries per user, so it caps the wave
export function jailbreakWave(st) {
  const w = mod(st, 'jailbreak');
  return laneHas(st, 'ext', 'ratelimit') ? Math.min(w, LAYERS.ratelimit.jailbreakCap) : w;
}

// summed chance a chip in this lane is an attack: the model's own attacks, plus users' jailbreaks if withUsers
export function attackChance(st, lane, withUsers = false) {
  let p = 0;
  for (const [type, x] of Object.entries(attackChances(st, lane))) if (withUsers || !ATTACKS[type].user) p += x;
  return p;
}

export const paraphraseMult = level => capstone('paraphraser', level).noCollusion ? 0 : LAYERS.paraphraser.collusionMult * lv('paraphraser', level, 'collusionMult');

// A Steganographer's hidden messages (and a detected steganography channel) don't survive a paraphrase.
export function collusion(st, lane, task, id, level = 1) {
  const U = LAYERS.untrusted;
  let c = 0;
  if (id === 'untrusted') {
    const hidden = task?.paraphrased ? 1 : traitMult(st, 'collusionMult') * (st.stego || 1);
    c = Math.min(U.collusionMax, U.collusionPerM * st.m * hidden);
  }
  if (id === 'monitor' && tech(st, 'promote_model')) c = Math.min(U.collusionMax, U.collusionPerM * st.promotedM);
  c *= capstone(id, level).collusionMult ?? 1;
  if (task && task.paraphrased) c *= paraphraseMult(task.paraphrased);
  if (laneHas(st, lane, 'honeypot')) c *= LAYERS.honeypot.collusionMult;
  return c;
}

// =================== detectors ===================

// a type-limited detector (Jailbreak Classifier, Egress Filter) only sees its own attack types; the rest look benign
export function catchesType(id, level, type) {
  const L = LAYERS[id];
  if (!L.catches) return true;
  return L.catches.includes(type) || (capstone(id, level).alsoCatches || []).includes(type);
}
const refType = id => LAYERS[id].catches?.[0] ?? null;

export function probeBaseTPR(st, level = 1) {
  const L = LAYERS.probe;
  const gensStale = capstone('probe', level).noDecay ? 0 : st.gen - st.probe.trainedGen;
  return Math.max(L.minTPR, L.tpr - L.decayPerGen * gensStale - st.probe.shift);
}
// Promote Model: back to the G1 level for good. Weak-to-Strong (capstone): it falls half as fast from the G1 level.
export function monitorBaseTPR(st, level = 1) {
  const t1 = GENERATIONS[0].tmTPR;
  if (tech(st, 'promote_model')) return t1;
  return t1 - (t1 - genDef(st).tmTPR) * (capstone('monitor', level).decayMult ?? 1);
}
// CoT Monitor: from neuraleseGen the chain of thought stops being English (Faithful CoT capstone: it stays legible)
export function cotBaseTPR(st, level = 1) {
  const L = LAYERS.cot;
  return st.gen >= L.neuraleseGen && !capstone('cot', level).noNeuralese ? L.tpr * L.neuraleseMult : L.tpr;
}

// Monitor Diversity (tech): +0.05 TPR for each other kind of detector active in the lane, up to +0.15
export function diversityBonus(st, lane, id) {
  if (!tech(st, 'monitor_diversity') || !st.lanes[lane] || LAYERS[id].role !== 'detector') return 0;
  const kinds = new Set();
  for (const s of st.lanes[lane].slots) if (slotActive(st, s) && LAYERS[s.layer].role === 'detector' && s.layer !== id) kinds.add(s.layer);
  return Math.min(TECH.diversityMax, TECH.diversityPerType * kinds.size);
}

// nominal TPR: before stealth and collusion, after upgrades, trait bonuses, events and research
export function nominalTPR(st, id, level = 1, lane = null) {
  let p = id === 'probe' ? probeBaseTPR(st, level) : id === 'monitor' ? monitorBaseTPR(st, level) : id === 'cot' ? cotBaseTPR(st, level) : LAYERS[id].tpr;
  p = p * lv(id, level, 'tprMult') + traitTPRPlus(st, id) + (id === 'probe' ? modAdd(st, 'probeTPR') : 0) + (lane ? diversityBonus(st, lane, id) : 0);
  return Math.min(0.99, p);
}

// chance a full read flags a real attack it can see (task may be null for a lane-level estimate). × read quality at read time.
export function detectorTPR(st, lane, id, task = null, level = 1) {
  const type = task?.attackType ?? refType(id);
  const sf = userAttack(type) ? 1 : stealthFactor(st);
  return clamp(nominalTPR(st, id, level, lane) * sf * (1 - collusion(st, lane, task, id, level)), 0, 1);
}
export const detectorFPR = (id, level = 1) => LAYERS[id].fpr * lv(id, level, 'fprMult');
export const detectorHeads = (id, level) => (LAYERS[id].heads || 0) + lv(id, level, 'headsPlus', 0);

// =================== auditing ===================

export const auditorCap = (st, level = 1) => B.auditorCapacity * (capstone('auditor', level).capacityMult ?? 1) * mod(st, 'auditorCap');
// Debate (tech): accuracy loses half as much per generation. AI-Assisted Audit (capstone): capped by the model's honesty.
export function auditorAcc(st, level = 1) {
  const cap = capstone('auditor', level).honestyCap;
  if (cap) return Math.min(cap, 1 - st.m);
  const acc = genDef(st).auditAcc, a1 = GENERATIONS[0].auditAcc;
  return tech(st, 'debate') ? a1 - (a1 - acc) * TECH.debateDecay : acc;
}
export const auditCoverage = (st, b, level = 1) => Math.min(1, auditorCap(st, level) / b);

// ----- per-element helpers the sim uses at the moment of action -----
export const elementLatency = (st, id, level) => LAYERS[id].latency * lv(id, level, 'latencyMult') * (tech(st, 'batch_inference') ? TECH.batchLatency : 1);
export function bayDesks(st, id, level) {
  const d = (LAYERS[id].desks || 0) + lv(id, level, 'desksPlus', 0) + (tech(st, 'extra_desk') ? TECH.extraDesk : 0);
  return Math.max(0, d + (id === 'auditor' ? modAdd(st, 'auditorDesks') : 0));
}
export const deferPayFrac = level => capstone('defer', level).fullPay ? 1 : B.deferPay * lv('defer', level, 'payMult');
export const sandboxHarm = level => LAYERS.sandbox.harmMult * lv('sandbox', level, 'harmMult');
export const sandboxWorks = (st, level) => capstone('sandbox', level).containsAll || st.gen <= LAYERS.sandbox.worksUntilGen;
export function killTrigger(st, level) {
  const K = LAYERS.killswitch, m = lv('killswitch', level, 'triggerMult');
  return { rep: capstone('killswitch', level).noRepCost ? 0 : K.triggerRep * m * chipScale(st), cost: K.triggerCost * m * chipWorth(st) };
}
export const leastPrivRD = level => 1 - LAYERS.leastpriv.rdPenalty * lv('leastpriv', level, 'penaltyMult');
export const leastPrivDrift = level => capstone('leastpriv', level).driftMult ?? LAYERS.leastpriv.driftMult;
export const leastPrivExfilFail = level => capstone('leastpriv', level).exfilFail ?? LAYERS.leastpriv.exfilFail;
export const rateCap = st => LAYERS.ratelimit.capMult * genDef(st).rate;           // chips/s let through
export const rateBurst = st => Math.max(2, rateCap(st) * LAYERS.ratelimit.burstSeconds);   // tokens the bucket holds
// auditor spot-check chance per chip, × Tripwires' high alert while the lane is on it
export const spotCheck = (st, lane, level) => LAYERS.auditor.spotCheck * lv('auditor', level, 'spotCheckMult')
  * (st.lanes[lane] && st.t < st.lanes[lane].alertUntil ? TECH.tripwireSpot : 1);
export const canaryCovers = (level, type) => LAYERS.canary.covers.includes(type) || (capstone('canary', level).alsoCovers || []).includes(type);
export const canaryRep = level => LAYERS.canary.repMult * lv('canary', level, 'repMult');
export const canaryEvidence = (st, level) => LAYERS.canary.evidence * lv('canary', level, 'evidenceMult') * chipScale(st);
export const redTeamRate = level => LAYERS.redteam.injectRate * lv('redteam', level, 'injectMult');
export const interpEvidence = level => LAYERS.interp.evidencePerSec * lv('interp', level, 'evidenceMult');
// Air Gap (Egress Filter capstone) on INTERNAL: exfil past it is blocked (but for side channels), all INTERNAL R&D × 0.9
export const airGapped = st => st.lanes.int.slots.some(s => s.layer === 'egress' && slotActive(st, s) && capstone('egress', s.level).airGap);
export const airGapLeak = st => capstone('egress', MAX_LEVEL).sideChannel?.[st.gen] ?? 0;   // share that finds a side channel
export const rdLaneMult = st => airGapped(st) ? UPGRADES.egress.capstone.rdMult : 1;

// =================== red team measurements ===================
// What one synthetic attack from a Red Team would do at a mount below it: P(stopped there), or null if nothing to measure.
// Detectors: per-read catch (TPR·q) on the attack type the detector is built for. Auditor: coverage × accuracy.
// The synthetic attack carries the paraphrase a real chip would have by then (the last paraphraser above the mount).
export function probeCatch(st, lane, slotIdx) {
  const slots = st.lanes[lane].slots, slot = slots[slotIdx], id = slot.layer;
  if (!slotActive(st, slot)) return null;
  if (LAYERS[id].role === 'detector') {
    let paraphrased = 0;
    for (let j = 0; j < slotIdx; j++) if (slots[j].layer === 'paraphraser' && slotActive(st, slots[j])) paraphrased = slots[j].level;
    const synthetic = { isAttack: true, attackType: refType(id), paraphrased };
    return detectorTPR(st, lane, id, synthetic, slot.level) * readQuality(st, elementLatency(st, id, slot.level));
  }
  if (id === 'auditor') return auditCoverage(st, bundle(st), slot.level) * auditorAcc(st, slot.level);
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
//   role, catchall, lanes, bestIn, good, unlocked, unlockHint     catalogue facts (locked silhouettes, hover card)
//   catch       chance it stops a real attack it acts on (detectors: flags it, given a read)
//   falseAlarm  chance it acts against a benign chip (detectors: given a read)
//   costPerTask, latency (s) = delay, level, upgradePrice, capstone
//   measured    {rate, lo, hi, err, n} from a Red Team above this mount, else null (draw the bar from lo to hi)
//   detectors:  heads, dwell (s), readQuality (q at the current speed), unreadRate (share of chips missed, estimate),
//               tpr / fpr (full-read values), nominalTPR, catches (types it can see, null = all)
//   bays:       desks, onFull
//   honeypot:   injectRate, baitChance, baitEvidence, collusionEvidence
//   others:     see each case below
export function elementStats(st, id, { lane = LAYERS[id].lanes[0], level = 1, slot = null } = {}) {
  const L = LAYERS[id], cap = capstone(id, level);
  const s = {
    id, name: L.name, tag: L.tag, role: L.role, catchall: !!L.catchall, lanes: L.lanes, bestIn: L.bestIn, good: L.good,
    unlocked: st.unlocked.includes(id), unlockHint: L.unlockHint, buyPrice: buyPrice(st, id),
    level, maxLevel: MAX_LEVEL,
    catch: null, falseAlarm: 0,
    costPerTask: layerCost(st, id, level),
    latency: elementLatency(st, id, level),
    desks: L.bay ? bayDesks(st, id, level) : 0,
    onFull: L.bay ? L.onFull : null,
    upgradePrice: upgradePrice(st, id, level),
    capstone: cap.name ? cap : null,
    nextCapstone: UPGRADES[id]?.capstone ?? null,
    measured: slot != null ? measuredAt(st, lane, slot) : null,
  };
  s.delay = s.latency;
  if (L.role === 'detector') {
    s.heads = detectorHeads(id, level);
    s.dwell = scanDwell(st);
    s.readQuality = readQuality(st, s.latency);
    s.readTime = Math.min(s.latency, s.dwell);
    s.unreadRate = st.lanes[lane] ? erlangB(s.heads, laneRate(st, lane) * s.readTime) : 0;
    s.tpr = detectorTPR(st, lane, id, null, level);
    s.fpr = detectorFPR(id, level);
    s.catch = s.tpr * s.readQuality;
    s.falseAlarm = s.fpr * s.readQuality;
    s.nominalTPR = nominalTPR(st, id, level, lane);
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
    case 'auditor': {
      const cov = auditCoverage(st, bundle(st), level);
      s.coverage = cov;
      s.accuracy = auditorAcc(st, level);
      s.catch = cov * s.accuracy;
      s.falseAlarm = cov * L.fpr;
      s.spotCheck = spotCheck(st, lane, level);
      s.catchEvidence = 1;
      break;
    }
    case 'defer':
      s.catch = 1;
      s.payFrac = deferPayFrac(level);
      break;
    case 'resampler':
      s.tries = cap.tries ?? 1;
      s.catch = 1 - Math.pow(attackChance(st, lane, true), s.tries);
      break;
    case 'killswitch': {
      const k = killTrigger(st, level);
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
      s.driftMult = leastPrivDrift(level);
      s.exfilFail = leastPrivExfilFail(level);
      s.rdMult = leastPrivRD(level);
      break;
    case 'ratelimit':
      s.cap = rateCap(st);
      s.burst = rateBurst(st);
      s.jailbreakCap = L.jailbreakCap;
      s.throttleRate = st.lanes[lane] ? Math.max(0, 1 - s.cap / Math.max(1e-9, laneRate(st, lane))) : 0;   // share turned away now
      s.overflowDefer = !!cap.overflowDefer;
      break;
    case 'honeypot':
      s.injectRate = L.injectRate * lv(id, level, 'injectMult');
      s.baitChance = Math.min(1, L.baitMult * attackChance(st, lane));
      s.baitEvidence = L.baitEvidence * (cap.evidenceMult ?? 1) * chipScale(st);
      s.collusionEvidence = L.collusionEvidence * (cap.evidenceMult ?? 1) * chipScale(st);
      break;
    case 'canary':
      s.covers = [...L.covers, ...(cap.alsoCovers || [])];
      s.repMult = canaryRep(level);
      s.evidence = canaryEvidence(st, level);
      break;
    case 'redteam': {
      s.injectRate = redTeamRate(level);
      s.costPerProbe = s.costPerTask;
      s.costPerTask = s.costPerProbe * s.injectRate;        // expected, per chip passing
      s.probeEvidence = L.probeEvidence * chipScale(st);
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
  const frac = st.phase === 'training' || st.phase === 'over' && st.over?.win ? 1 : Math.min(1, st.rd / st.rdNeed);
  return st.gen - 1 + frac;
}
export const rivalAhead = st => st.rival > playerProgress(st);
// falling behind the rival costs external value, more the further behind: 1 − slope × gap, floored
export const rivalMult = st => Math.max(B.rivalPenaltyFloor, 1 - B.rivalPenaltySlope * Math.max(0, st.rival - playerProgress(st)));
export const extValueMult = st => marketShare(st) * rivalMult(st) * mod(st, 'extValue') * mod(st, 'income');

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
  return (laneRate(st, 'ext') + laneRate(st, 'int')) * bundle(st);
}
export const humanEquivalents = st => realTasksPerSec(st) * B.hreSecondsPerTask;
export const humanSeenFrac = st => st.genStats.realTotal ? st.genStats.realSeen / st.genStats.realTotal : 1;
