// ===== Fresh game state =====

import { BALANCE as B } from '../config/balance.js';
import { STARTING_HAND } from '../config/layers.js';
import { TUTORIAL } from '../config/events.js';
import { say } from './log.js';
import { startGeneration, resolveDifficulty, newGenStats } from './phases.js';

const laneState = () => ({
  slots: Array.from({ length: B.startSlots }, () => ({ layer: null, on: true, forcedOffUntil: 0 })),
  tasks: [],
  spawnT: 1,
  pausedUntil: 0,
});

export function createState({ seed = 1, difficulty = 'medium', tutorial = true } = {}) {
  const st = {
    seed, rng: seed >>> 0, t: 0, difficulty,
    phase: 'play', trainT: 0, over: null,

    // model
    gen: 0, m: 0, mHistory: [], mRange: [0, 0], mBias: 0, drift: 0, mReductions: 0,
    probe: { trainedGen: 1, shift: 0 }, promotedM: 0,

    // economy
    money: B.startMoney, rep: B.startRep, evidence: 0,
    rd: 0, rdNeed: 1, rival: B.rivalHeadStart, researchCount: 0, negMoneyT: 0,
    ledger: { start: B.startMoney, income: 0, spend: 0, byCat: {} },

    // board
    unlocked: [...STARTING_HAND], upgrades: {}, cardsTaken: [],
    lanes: { ext: laneState(), int: laneState() },
    taskId: 0,

    // events & codec
    mods: [], nextEventAt: 50, eventLog: [], pendingChoice: null, pendingResearch: null,
    codec: [], codecId: 0, fx: [], fxId: 0,
    seenAttackTypes: [], firstCatchThisGen: false,
    incidents: 0, landedSabotage: 0,
    catchMsgs: 0, lastCatchMsg: -99, lastIncidentMsg: -99,

    // stats
    stats: {
      lanes: { ext: {}, int: {} }, layers: {}, gens: [],
      collusionMisses: {}, repLoss: { incidents: 0, timeouts: 0, events: 0 }, honeypotsRun: 0, honeypotCatches: 0, honeypotCollusion: 0,
    },
    genStats: newGenStats(1, 0),
  };
  resolveDifficulty(st, difficulty);
  startGeneration(st, 1);
  if (tutorial) for (const [who, text] of TUTORIAL) say(st, who, text);
  return st;
}
