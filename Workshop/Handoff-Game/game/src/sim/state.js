// ===== Fresh game state =====

import { BALANCE as B, SPLIT } from '../config/balance.js';
import { STARTING_HAND } from '../config/layers.js';
import { LANE_DEFS, START_LANES } from '../config/tasks.js';
import { TUTORIAL } from '../config/events.js';
import { say, fx } from './log.js';
import { startGeneration, resolveDifficulty, newGenStats } from './phases.js';

// a mount on the left rail (lane.slots holds the mounts, top to bottom), or the global site (st.global.slots).
// level: mirrors the lab level of its element (st.levels, rules.js labLevel)
// busy: when each detector head (or Kill Switch operator) frees up. reads/unread: lines read / missed (all heads busy)
// flags: lines this mount flagged · tp / fa: of those, the ones a human confirmed as attacks / stamped FALSE ALARM
// taken / waved: (responders) flags it took / flags that found every server busy and rolled on
// rt: Red Team probes of this mount {n, hits, p} · rtLane: (on a Red Team) probes stopped anywhere below {n, hits, p}
//   p = the true catch rate the tally was taken at; when it changes the tally starts over (rules.js measuredAt)
// tokens/tokenT: Rate Limiter bucket · rates: moving averages of its flags (detectors) and flag arrivals (responders)
export const newSlot = () => ({ layer: null, level: 1, on: true, forcedOffUntil: 0, busy: [], reads: 0, unread: 0,
  flags: 0, tp: 0, fa: 0, taken: 0, waved: 0, rt: null, rtLane: null, tokens: null, tokenT: 0, rates: {} });

// one lane. id: a key of config/tasks.js LANE_DEFS · side 'ext' | 'int' · born: the generation it joined
// open: it carries traffic (a contract lane waits closed until it is opened) · contract: it arrived as a contract
// openedT: the s of play it opened at (its volume ramps in from there: rules.js laneRampShare; null = no ramp)
// rates: moving averages of its flags, shipped flags ... (log.js count) · last*T: when the lamp last had cause (st.t)
const laneState = (id, born, open) => ({
  id, side: LANE_DEFS[id].side, flavour: LANE_DEFS[id].flavour, label: LANE_DEFS[id].label, born, open,
  contract: false, openedT: null, rates: {}, lastIncidentT: null, lastGlitchT: null, lastShippedT: null,
  slots: Array.from({ length: B.startSlots }, () => newSlot()),
  tasks: [],        // lines on the track, front first
  bay: [],          // lines pulled off the track by bay responders (auditor, defer, resampler)
  spawnT: 0.5,      // lines until the next spawn (exponential gaps: sim.js spawnLane)
  pausedUntil: 0,
  alertUntil: 0,    // Tripwires: high alert (auditors spot-check more) until this time
  honeyHoldUntil: 0,   // Honeypots caught an Untrusted Monitor waving bait through: its collusion is 0 until this time
});

// a new lane on the board, with its counters: stats.lanes, genStats.lanes and forcedAttacks are keyed by lane id
export function addLane(st, id, open = true) {
  st.lanes[id] = laneState(id, Math.max(1, st.gen), open);
  st.stats.lanes[id] = {};
  st.genStats.lanes[id] = {};
  st.forcedAttacks[id] = [];
  return st.lanes[id];
}

export function createState({ seed = 1, difficulty = 'medium', tutorial = true } = {}) {
  const st = {
    seed, rng: seed >>> 0, t: 0, difficulty,
    phase: 'card', trainT: 0, over: null,   // card → play → report → training → card (sim/phases.js); G1 starts at its card
    warmT: B.warmup,                   // s left in this generation's warm-up (rules.js warmth)

    // model (traits and truthOffset are hidden truth, like m)
    gen: 0, genT: 0, m: 0, mHistory: [], mRange: [0, 0], mBias: 0, mReductions: 0,
    drift: 0,                          // debt points landed this generation (rules.js debt: ÷ INTERNAL lines)
    landedInt: [],                     // this generation's landed INTERNAL attacks { id, lane, type, weight, text, t }: the reveal
    stoppedInt: { n: 0, w: 0 },        // ... and the ones stopped (caught, refused, deferred, resampled): count and debt points
    traits: [], truthOffset: 0,
    probe: { trainedGen: 1, shift: 0 }, promotedM: 0,
    throughputMult: 1,                 // × compute (The Model Asks a Question: −5% if it may decline tasks)
    retrains: 0,                       // times Shut down & retrain was picked (each one finds less to fix)
    genRetrain: 0,                     // m the retrains of this generation take off the next model

    // economy & compute
    money: B.startMoney, rep: B.startRep, evidence: 0,
    split: { ...SPLIT.default },
    rd: 0, rdNeed: 1, researchCount: 0, negMoneyT: 0,
    rivalLeft: B.rivalSlack,           // s of slack before Prometheus ships (rules.js rivalDrain)
    rival: 0,                          // v2 name the old HUD reads: the generation a par lab would be at (sim.js)
    ledger: { start: B.startMoney, income: 0, spend: 0, byCat: {} },
    darkUntil: 0,                      // the lab is dark until then (Shut down & retrain, the plug pulled)

    // board
    unlocked: [...STARTING_HAND], upgrades: {}, cardsTaken: [],
    levels: {},                      // lab level per element id (1 when missing): one upgrade raises every copy
    lanes: {},                       // by lane id (addLane, below)
    global: { slots: [newSlot()] },  // the one off-track site: Interp Lab
    taskId: 0,
    telegraphed: [],                 // contract lanes Big Boss has announced
    // research stream (sim/research.js): rp, offers banked (oldest first), free rerolls left this generation,
    // card ids taken, offers drawn, the generation an Alignment Sprint runs in, cards ever offered, cards boosted next offer
    research: { rp: 0, banked: [], rerollFree: B.research.rerolls, taken: [], offers: 0, sprintGen: 0, seen: [], boost: [] },
    researchOffer: null,             // the old UI's picker (sim/research.js drawResearch)

    // choices that halt the sim, and the one alarm that doesn't
    pendingRetrain: null,            // { g, dark, salaries, m }: Shut down & retrain? (sim.js retrain)
    alarm: null,                     // { lane, left, total, n }: EGRESS ANOMALY, pull the plug in time (sim.js pullPlug)
    report: null,                    // the end-of-generation reveal (sim/phases.js revealData)

    // evidence dossier (rebuilt every generation, see sim/dossier.js)
    dossier: { g: 0, evidence: 0, rows: [] },
    evBatch: { n: 0, t: 0, lane: null },   // evidence gained since the last fx 'evidence'
    rsp: { ready: false, usedGen: 0, nudgedGen: 0 },   // the v2 card itself is st.upgrades.rsp

    // events & codec
    mods: [], nextEventAt: 50, eventLog: [], pendingChoice: null, pendingResearch: null,
    timers: [], delayed: [], lastFired: {}, firedCount: {}, firedGen: {},
    activeEvents: [],                // banners: [{ id, title, icon, lane, effect, remaining, total, unit, until }]
    stego: 0,                        // Steganography Detected: 0, or the collusion multiplier while it runs
    rewardHack: { left: 0, total: 0, p: 0, lane: null }, forcedAttacks: {}, splitFloor: null,
    rivalShipped: null,              // { remaining, total, mode, at } once Prometheus has shipped
    burstWarned: -1,                 // G7: the last burst cycle the warning went out for
    codec: [], codecId: 0, fx: [], fxId: 0,
    seenAttackTypes: [], firstCatchThisGen: false,
    incidents: 0, landedSabotage: 0,
    catchMsgs: 0, lastCatchMsg: -99, lastIncidentMsg: -99, lastKillMsg: -99,
    // the G1 tutorial's scripted opening (sim/tasks.js tutorialLine): the next scripted Consumer line, whether the
    // R&D glitch and the forced research offer have happened. null = off (headless, or skipped by the UI)
    tutorialScript: tutorial ? { ext: 0, glitch: false, offer: false } : null,

    // stats
    stats: {
      lanes: {}, layers: {}, gens: [],   // layers: per element kind (log.js layerStats)
      evidence: {}, evidenceOut: { carry: 0, spent: 0 },   // earned by source · lost to the carry-over cut, spent on probes
      collusionMisses: {}, honeypotsRun: 0, honeypotCatches: 0, honeypotCollusion: 0,
      repLoss: { incidents: 0, events: 0, killswitch: 0 }, repGain: {},   // reputation by source (log.js changeRep)
      redTeamProbes: 0, rdTotal: 0, labLosses: {}, driftLanded: {},   // driftLanded: debt points from landed attacks, by type
      byType: {},                    // per attack type: { spawned, landed } (a resample's new roll isn't counted as spawned)
      plugsPulled: 0, retrainsTaken: 0, glitches: 0,
    },
    genStats: newGenStats(1, 0),
  };
  for (const id of START_LANES) addLane(st, id);
  resolveDifficulty(st, difficulty);
  startGeneration(st, 1);
  for (const id of START_LANES) placeFree(st, id, st.lanes[id].slots.length - 1, B.startRail[0]);   // Big Boss's red button
  if (tutorial) for (const [who, text] of TUTORIAL) say(st, who, text);
  return st;
}

// an element on a mount, free (the starting rail, a contract lane's kit, a NEW research card), at the lab level
export function placeFree(st, lane, slotIdx, id) {
  const slot = (lane === 'global' ? st.global.slots : st.lanes[lane]?.slots)?.[slotIdx];
  if (!slot || slot.layer) return false;
  Object.assign(slot, newSlot(), { layer: id, level: st.levels[id] ?? 1 });
  fx(st, 'place', { lane, slot: slotIdx, layer: id, free: true });
  return true;
}
