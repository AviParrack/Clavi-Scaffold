// ===== Fresh game state =====

import { BALANCE as B, SPLIT } from '../config/balance.js';
import { STARTING_HAND } from '../config/layers.js';
import { TUTORIAL } from '../config/events.js';
import { say } from './log.js';
import { startGeneration, resolveDifficulty, newGenStats } from './phases.js';

// a mount on the left rail (lane.slots holds the mounts, top to bottom), or the global site (st.global.slots).
// busy: when each detector head frees up. reads/unread: chips read / missed (all heads busy)
// rt: Red Team probes of this mount {n, hits, p} · rtLane: (on a Red Team) probes stopped anywhere below {n, hits, p}
//   p = the true catch rate the tally was taken at; when it changes the tally starts over (rules.js measuredAt)
// tokens/tokenT: Rate Limiter bucket
export const newSlot = () => ({ layer: null, level: 1, on: true, forcedOffUntil: 0, busy: [], reads: 0, unread: 0,
  rt: null, rtLane: null, tokens: null, tokenT: 0 });

const laneState = () => ({
  slots: Array.from({ length: B.startSlots }, () => newSlot()),
  tasks: [],        // chips on the track, front first
  bay: [],          // chips pulled off the track by bay layers (auditor, defer, resampler)
  spawnT: 0.5,      // chips until the next spawn
  pausedUntil: 0,
  alertUntil: 0,    // Tripwires: high alert (auditors spot-check more) until this time
});

export function createState({ seed = 1, difficulty = 'medium', tutorial = true } = {}) {
  const st = {
    seed, rng: seed >>> 0, t: 0, difficulty,
    phase: 'play', trainT: 0, over: null,

    // model (traits and truthOffset are hidden truth, like m)
    gen: 0, m: 0, mHistory: [], mRange: [0, 0], mBias: 0, drift: 0, mReductions: 0,
    traits: [], truthOffset: 0,
    probe: { trainedGen: 1, shift: 0 }, promotedM: 0,
    throughputMult: 1,                 // × compute (The Model Asks a Question: −5% if it may decline tasks)
    retrains: 0,                       // times 'Shut down & retrain' was picked (each one finds less to fix)

    // economy & compute
    money: B.startMoney, rep: B.startRep, evidence: 0,
    split: { ...SPLIT.default },
    rd: 0, rdNeed: 1, rival: B.rivalHeadStart, researchCount: 0, negMoneyT: 0,
    ledger: { start: B.startMoney, income: 0, spend: 0, byCat: {} },

    // board
    unlocked: [...STARTING_HAND], upgrades: {}, cardsTaken: [],
    lanes: { ext: laneState(), int: laneState() },
    global: { slots: [newSlot()] },  // the one off-track site: Interp Lab
    taskId: 0,
    researchOffer: null,             // plain data for the research picker (see sim/research.js)
    rsp: { ready: false, usedGen: 0, nudgedGen: 0 },   // the card itself is st.upgrades.rsp

    // evidence dossier (rebuilt every generation, see sim/dossier.js)
    dossier: { g: 0, evidence: 0, rows: [] },

    // events & codec
    mods: [], nextEventAt: 50, eventLog: [], pendingChoice: null, pendingResearch: null,
    timers: [], delayed: [], lastFired: {}, firedCount: {}, firedGen: {},
    activeEvents: [],                // banners: [{ id, title, icon, lane, effect, remaining, total, unit, until }]
    stego: 0,                        // Steganography Detected: 0, or the collusion multiplier while it runs
    rewardHack: { left: 0, total: 0, p: 0 }, forcedAttacks: { ext: [], int: [] }, splitFloor: null,
    rivalShipped: null,              // { remaining, total, mode, at } once Prometheus has finished its last generation
    codec: [], codecId: 0, fx: [], fxId: 0,
    seenAttackTypes: [], firstCatchThisGen: false,
    incidents: 0, landedSabotage: 0,
    catchMsgs: 0, lastCatchMsg: -99, lastIncidentMsg: -99, lastKillMsg: -99,

    // stats
    stats: {
      lanes: { ext: {}, int: {} }, layers: {}, gens: [], driftCleaned: 0,
      evidence: {}, evidenceOut: { carry: 0, spent: 0 },   // earned by source · lost to the carry-over cut, spent on probes
      collusionMisses: {}, honeypotsRun: 0, honeypotCatches: 0, honeypotCollusion: 0,
      repLoss: { incidents: 0, events: 0, killswitch: 0 }, repGain: {},   // reputation by source (log.js changeRep)
      redTeamProbes: 0, rdTotal: 0, labLosses: {}, driftLanded: {},   // driftLanded: hidden drift from landed attacks, by type
      byType: {},                    // per attack type: { spawned, landed } (a resample's new roll isn't counted as spawned)
    },
    genStats: newGenStats(1, 0),
  };
  resolveDifficulty(st, difficulty);
  startGeneration(st, 1);
  if (tutorial) for (const [who, text] of TUTORIAL) say(st, who, text);
  return st;
}
