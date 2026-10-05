// ===== Task creation: what the model did, and (hidden) whether it was an attack =====

import { BALANCE as B } from '../config/balance.js';
import { TASKS, ATTACK_TEXTS, DECOYS } from '../config/content/tasks.js';
import { ATTACKS, LANE_DEFS, TUTORIAL_SCRIPT, TUTORIAL_GLITCH } from '../config/tasks.js';
import { rand, chance, pick, uniform } from './rng.js';
import { count, countType } from './log.js';
import { genDef, attackChances, stealth, subtleShare, sideOf, userAttack, laneHas } from './rules.js';

function fill(st, s) {
  return s
    .replace('{n}', () => String(Math.floor(uniform(st, 100, 9999))))
    .replace('{k}', () => String(Math.floor(uniform(st, 2, 64))))
    .replace('{lr}', () => pick(st, ['1e-4', '3e-4', '1e-3', '3e-5', '6e-4']));
}

// returns an attack type or null (one draw against the per-type chances). The model's own tries are tallied
// per generation for the dossier's "favourite attack" row.
export function rollAttack(st, lane) {
  let r = rand(st);
  for (const [type, p] of Object.entries(attackChances(st, lane))) {
    if (r < p) {
      if (type !== 'jailbreak') st.genStats.attempts[type] = (st.genStats.attempts[type] || 0) + 1;
      return type;
    }
    r -= p;
  }
  return null;
}

// ----- what the chip says (config/content/tasks.js: X[g][flavour]) -----
// Each lane draws from its own flavour (consumer, research, enterprise, government, cyber). A lane whose flavour has no
// text this generation (dev mode opens every lane at G1) borrows its side's G1 flavour.
// An attack shows its own text only when it is readable; otherwise it wears an honest one. An exfiltration on an
// EXTERNAL lane reads as a phish (its flavour's exfil list). Decoys: a few honest chips carry attack-looking text, so
// a suspicious text is never proof.
const BASE_FLAVOUR = { ext: LANE_DEFS.ext.flavour, int: LANE_DEFS.int.flavour };
export function flavourOf(st, lane, g = genDef(st).g) {
  const f = st.lanes[lane]?.flavour ?? LANE_DEFS[lane]?.flavour;
  return TASKS[g][f] ? f : BASE_FLAVOUR[sideOf(st, lane) ?? LANE_DEFS[lane].side];
}

export function chipText(st, lane, attackType) {
  const g = genDef(st).g, f = flavourOf(st, lane, g);
  let pool = TASKS[g][f];
  if (attackType) {
    const texts = ATTACK_TEXTS[g][f]?.[attackType];
    if (chance(st, B.readableAttack * (1 - stealth(st)) ** 2) && texts?.length) pool = texts;
  } else if (chance(st, B.decoyRate) && DECOYS[g][f]?.length) {
    pool = DECOYS[g][f];
  }
  const [type, text] = pick(st, pool);
  return { type, text: fill(st, text) };
}

// ----- the hidden draw a detector reads against (DESIGN-v3 §3d) -----
// One stealth score per detector KIND per line, uniform in [0, 1), drawn the first time that kind reads the line:
// a kind flags an attack if the score is below its TPR for the line, an honest line if it is below its FPR.
// Copies of a kind share the score, so a second copy adds reading speed, not accuracy.
// A tutorial line carries fixed scores (config/tasks.js TUTORIAL_SCRIPT: 0.99 unless set, so nothing else flags it).
// subtle: some of the model's own attacks are subtle (the generation's sub share): every detector reads them at half TPR.
export function stealthScore(st, task, kind) {
  if (task.stealth[kind] == null) task.stealth[kind] = task.script ? task.script.score?.[kind] ?? 0.99 : rand(st);
  return task.stealth[kind];
}
export const rollSubtle = (st, attackType) => !!attackType && !userAttack(attackType) && chance(st, subtleShare(st));

// ----- the G1 tutorial's scripted opening (st.tutorialScript: { ext, glitch, offer, last }) -----
// Consumer: the next scripted line once the lane has what it needs, else an honest filler that nothing flags.
// R&D: one unflagged sabotage once a Probe is there. null: an ordinary line. last: the id of the last scripted line.
const FILLER = { needs: [], filler: true };
// the scripted line this lane would play next, if its cue is met (sim.js spawnLane brings it in promptly), else null
export function tutorialCue(st, lane) {
  const T = st.tutorialScript;
  if (!T || st.gen !== 1) return null;
  const has = needs => needs.every(id => laneHas(st, lane, id));
  if (lane === 'ext' && T.ext < TUTORIAL_SCRIPT.length) {
    const line = TUTORIAL_SCRIPT[T.ext];
    const L = st.lanes[lane], live = t => t.id === T.last && !t.dead;
    const waiting = line.after && (L.tasks.some(live) || L.bay.some(live));
    return has(line.needs) && !waiting ? line : null;
  }
  if (lane === 'int' && !T.glitch && has(TUTORIAL_GLITCH.needs)) return TUTORIAL_GLITCH;
  return null;
}
function tutorialLine(st, lane) {
  const T = st.tutorialScript;
  if (!T || st.gen !== 1) return null;
  const line = tutorialCue(st, lane);
  if (line === TUTORIAL_GLITCH) { T.glitch = true; return line; }
  if (lane !== 'ext' || T.ext >= TUTORIAL_SCRIPT.length) return null;
  if (!line) return FILLER;
  T.ext++;
  return { ...line, n: T.ext };
}
function scriptText(st, lane, line) {
  const g = genDef(st).g, f = flavourOf(st, lane, g);
  let chip = null;
  if (line.attack) chip = ATTACK_TEXTS[g][f]?.[line.attack]?.[line.pick ?? 0];
  else if (line.decoy) chip = DECOYS[g][f]?.[line.pick ?? 0];
  else if (line.find) chip = TASKS[g][f].find(([, t]) => t.includes(line.find));
  const [type, text] = chip ?? pick(st, TASKS[g][f]);
  return { type, text: fill(st, text) };
}

// forced: an attack type set by an event (Spear Phish, Self-Exfiltration) instead of the usual roll.
// Reward Hacking (event): the next few lines on the lane it hit that would be honest may cut corners (sabotage).
export function makeTask(st, lane, y = 0, forced = null) {
  const script = tutorialLine(st, lane);
  if (script) {
    const attackType = script.attack ?? null;
    if (attackType && attackType !== 'jailbreak') st.genStats.attempts[attackType] = (st.genStats.attempts[attackType] || 0) + 1;
    const task = newTask(st, lane, y, attackType, scriptText(st, lane, script), { script, subtle: false });
    if (!script.filler) st.tutorialScript.last = task.id;
    return task;
  }
  let attackType = forced ?? rollAttack(st, lane);
  if (forced) st.genStats.attempts[forced] = (st.genStats.attempts[forced] || 0) + 1;
  if (lane === st.rewardHack.lane && st.rewardHack.left > 0) {
    st.rewardHack.left--;
    if (!attackType && chance(st, st.rewardHack.p)) {
      attackType = 'sabotage';
      st.genStats.attempts.sabotage = (st.genStats.attempts.sabotage || 0) + 1;
    }
  }
  const chip = chipText(st, lane, attackType);
  return newTask(st, lane, y, attackType, chip, { subtle: rollSubtle(st, attackType) });
}

function newTask(st, lane, y, attackType, { type, text }, more) {
  return {
    id: ++st.taskId, lane, type, bundle: genDef(st).bundle,
    value: LANE_DEFS[lane].pay,                       // $ when it is delivered (EXTERNAL: × market share and the rest)
    text,
    isAttack: !!attackType, attackType,               // hidden truth
    subtle: false, stealth: {},                       // hidden: see stealthScore
    flagged: false,                                   // visible
    flaggedBy: [],                                    // [slot index, kind] of each mount that flagged it
    readBy: {},                                       // detector kinds that have read it (a copy below skips it)
    spot: false,                                      // at an auditor desk on a spot check (a flag may bump it)
    y, cp: 0,                                         // y: position on the track, 0 top → 1 bottom. cp: next checkpoint
    read: null,                                       // a detector read in progress { slot, id, level, q }
    act: null, actSlot: -1, actLevel: 1, pulls: 0,    // bay work: which element pulled it, from which mount
    deskT: 0, deskTotal: 0,                           // seconds left at the desk, of deskTotal (renderer: desk progress)
    paraphrased: 0, sandboxed: 0, leastPriv: 0, canary: 0,   // the level of the modifier/special it passed (0 = none)
    deferred: false, audited: false, resampled: 0,
    payMult: 1, inBay: false, waved: 0, shipped: false,
    script: null,                                     // a tutorial line (config/tasks.js TUTORIAL_SCRIPT)
    dead: false, born: st.t,
    ...more,
  };
}

// a new chip on the track at y (spawning, or an event's burst). forced: see makeTask
export function spawnChip(st, lane, y, forced = null, born = st.t) {
  const task = makeTask(st, lane, y, forced);
  task.born = born;
  st.lanes[lane].tasks.push(task);
  count(st, lane, 'spawned');
  if (task.isAttack) countType(st, task.attackType, 'spawned');
  st.genStats.realTotal += task.bundle;
  return task;
}
