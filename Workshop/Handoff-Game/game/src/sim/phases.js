// ===== Generation lifecycle + stubs for the future Training / Evals phases =====

import { BALANCE as B, DIFFICULTY, SPLIT } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { ATTACKS } from '../config/tasks.js';
import { uniform, randn, pick } from './rng.js';
import { fx, say } from './log.js';
import { clamp, misalignmentEstimate, traitMult } from './rules.js';
import { rollTraits, newDossier } from './dossier.js';

// ----- stub: Training phase (future). v1 returns defaults -----
export function trainingPhase(st) {
  return { mModifier: 0, attackMix: null };
}

// ----- stub: Evals phase (future). Reveals one random true tendency (a Sandbagger makes it read low) -----
export function evalPhase(st) {
  const internalTypes = ['sabotage', 'poison'].concat(st.gen >= 4 ? ['exfil'] : []);
  const t = pick(st, internalTypes);
  const m = st.m * traitMult(st, 'estMult');
  const level = m < 0.1 ? 'rarely' : m < 0.25 ? 'sometimes' : 'often';
  return { tendency: t, text: `Evals: given the chance, this model ${level} attempts ${ATTACKS[t].label}.` };
}

export function newGenStats(g, m, traits = []) {
  return {
    g, name: GENERATIONS[g - 1].name, m, est: null, err: null, drift: 0,
    traits, revealed: traits.map(() => false),
    income: 0, spend: 0, layerSpend: 0, realTotal: 0, realSeen: 0,
    attempts: {},                          // the model's own attack tries by type (hidden truth)
    lanes: { ext: {}, int: {} },
  };
}

export function closeGenStats(st) {
  const { est, err } = misalignmentEstimate(st);
  Object.assign(st.genStats, { est, err, drift: st.drift, mEnd: st.m, evidence: st.evidence });
}

// R&D a generation needs: INTERNAL chips/s at the default split × rdSecondsPerGen
export const rdNeeded = g => Math.round(GENERATIONS[g - 1].rate / SPLIT.default.product * SPLIT.default.capabilities * B.rdSecondsPerGen);

export function startGeneration(st, g) {
  if (g === 1) {
    st.m = uniform(st, ...st.mRange);
  } else {
    closeGenStats(st);
    const tr = trainingPhase(st);
    st.m = clamp(st.m + B.mNoise * randn(st) + B.driftCoef * st.drift - st.mReductions + tr.mModifier, 0, 1);
    const kept = st.evidence * B.evidenceCarry;
    st.stats.evidenceOut.carry += st.evidence - kept;
    st.evidence = kept;
  }
  st.mHistory.push(st.m);
  st.gen = g;
  st.traits = rollTraits(st);
  st.drift = 0;
  st.mReductions = 0;
  st.rd = 0;
  st.rdNeed = rdNeeded(g);
  st.mBias = clamp(randn(st), -1.5, 1.5);
  st.firstCatchThisGen = false;
  st.seenAttackTypes = [];
  st.catchMsgs = 0;
  st.phase = 'play';
  st.genStats = newGenStats(g, st.m, st.traits);
  st.stats.gens.push(st.genStats);
  st.dossier = newDossier(st);

  fx(st, 'newModel', { g });
  say(st, 'model', GENERATIONS[g - 1].voice);
  if (g > 1) say(st, 'research', evalPhase(st).text);
}

export function resolveDifficulty(st, difficulty) {
  let d = difficulty;
  if (d === 'unknown') d = pick(st, ['easy', 'medium', 'hard']);
  st.mRange = DIFFICULTY[d].range;
  st.trueDifficulty = d;
}
