// ===== The G1 tutorial (DESIGN-v3 §3h): ten steps over the sim's scripted opening =====
// Text: config/content/v3-text.js TUTORIAL_STEPS { step, id, do, say, after, teaches } and TUTORIAL_UI.
// The sim plays the scripted lines (st.tutorialScript); this module only watches state and fx, queues the lines on
// the codec (codec.say), shows the step on an HTML plate over the codec's trace (with SKIP TUTORIAL), rings what to
// click, and sets the view-only speed: view.slow 0.5 while it teaches, 0 (held) while a flagged line waits for its
// Auditor (the scripted harmful line would otherwise roll past the mount the player is about to fill).
//
// A step runs in two halves: 'do' (its say lines are queued; the plate shows its do prompt until the gate is met),
// then 'after' (wait for the fx that shows the result, then queue its after lines and move on). Gates read state
// first, so a step done early (a Probe placed before it was asked for) passes at once.

import { TUTORIAL_STEPS, TUTORIAL_UI } from '../config/content/v3-text.js';
import * as R from '../sim/rules.js';
import * as Sim from '../sim/sim.js';
import { money, tpl } from '../util/format.js';
import { C, corners, clamp } from './theme.js';
import * as codec from './codec.js';
import { cursorOf, drain } from './view.js';

// =================== tuning (UI only) ===================

const SLOW = 0.5;          // view.slow while the tutorial teaches
const WAIT_MAX = 25;       // s of play an 'after' half waits for its fx before it moves on anyway
const LINE_MAX = 30;       // s of play the 'click a line' step waits before it moves on anyway
const SPLIT_MOVE = 0.02;   // the Safety share has to move this much
const READ_MAX = 40;       // real s the plate waits for the codec to reach a step's lines before it shows the prompt anyway

// =================== state (module level: one tutorial per game) ===================

let on = false, api = null, el = null;
let T = null;              // { i, half: 'do' | 'after', t0, seen: {}, safety0, lineClick, listen }
export const isOn = () => on;

export function start(a, enabled) {
  api = a;
  on = !!enabled;
  T = { i: 0, half: 'do', t0: 0, seen: {}, safety0: null, lineClick: null, listen: null };
  api.view.slow = on ? SLOW : 1;
  plate();
  if (el) el.hidden = !on;
  console.log(`[handoff] tutorial ${on ? 'on' : 'off'}`);
}

// remember: never offer it again (SKIP TUTORIAL; finishing it remembers too)
export function skip(a = api, remember = true) {
  if (!on) return;
  on = false;
  a.view.slow = 1;
  if (remember) a.tutorialDone();
  if (el) el.hidden = true;
  codec.dropUi(a.view);
  if (a.st) Sim.endTutorial(a.st);                         // the sim's scripted lines too
  a.view.toast(TUTORIAL_UI.skipped, true);
  console.log(`[handoff] tutorial skipped at step ${T.i + 1}`);
}

// a line on the board was clicked (tracks.js)
export function lineClicked(lane, id) { if (on && T) T.lineClick = { lane, id }; }

// =================== the steps' gates ===================

const has = (st, lane, id) => !!st.lanes[lane] && R.laneHas(st, lane, id);
const age = st => st.t - T.t0;

// 'do' gates: true when the player has done what the step asks
const DO = {
  deploy:     st => st.phase !== 'card',
  line:       st => !!T.lineClick || age(st) > LINE_MAX,
  probe:      st => has(st, 'ext', 'probe'),
  auditor:    st => has(st, 'ext', 'auditor'),
  falseAlarm: st => !!T.seen.falseAlarm || age(st) > 2 * WAIT_MAX,
  monitor:    st => has(st, 'ext', 'monitor'),
  rnd:        st => has(st, 'int', 'probe'),
  split:      st => Math.abs(st.split.safety - T.safety0) >= SPLIT_MOVE,
  research:   st => st.research.taken.length > 0 || st.gen > 1,
  done:       () => true,
};
// 'after' gates: the fx that shows the result has happened (or WAIT_MAX s went by)
const AFTER = {
  probe:   st => !!T.seen.flag || age(st) > WAIT_MAX,
  auditor: st => !!T.seen.caught || age(st) > WAIT_MAX,
  rnd:     st => !!T.seen.glitch || age(st) > WAIT_MAX,
};

// the price a step's prompt names ({price}): the element it asks for
const ASKS = { probe: 'probe', auditor: 'auditor', monitor: 'monitor', rnd: 'probe' };

// =================== update: every frame, after the board ===================

export function update(c) {
  const { st, view } = c;
  if (!on || !st) { if (el && !el.hidden) el.hidden = true; return; }
  if (st.over || st.gen > 1) { finish(c, false); return; }
  readFx(c);
  const step = TUTORIAL_STEPS[T.i];
  if (T.safety0 == null && st.phase === 'play') T.safety0 = st.split.safety;

  if (T.half === 'do' && DO[step.id](st)) {
    console.log(`[handoff] tutorial step ${step.step} (${step.id}) done`);
    T.half = 'after'; T.t0 = st.t; T.seen = {};
    if (step.id === 'split') T.safety0 = st.split.safety;
  }
  if (T.half === 'after' && (AFTER[step.id]?.(st) ?? true)) {
    for (const [who, s] of step.after || []) codec.say(view, st, who, s);
    next(c);
    if (!on) return;                                       // the last step finished it: view.slow stays at 1
  }
  // read, then do: the plate shows the new prompt once the codec has reached this step's lines (a click on the codec hurries it)
  if (T.listen != null && (!codec.uiWaiting(view) || c.t - T.listen > READ_MAX)) T.listen = null;
  view.slow = held(st) ? 0 : SLOW;
  if (on) { paint(c); ring(c); }
}

function next(c) {
  const { st, view } = c;
  T.i++; T.half = 'do'; T.t0 = st.t; T.seen = {};
  T.safety0 = st.split.safety;
  const step = TUTORIAL_STEPS[T.i];
  if (!step) { finish(c, true); return; }
  for (const [who, s] of step.say || []) codec.say(view, st, who, s);
  T.listen = c.t;
  if (step.id === 'done') finish(c, true);
}

function finish(c, done) {
  on = false;
  c.view.slow = 1;
  if (done) c.api.tutorialDone();
  if (el) el.hidden = true;
  console.log(`[handoff] tutorial ${done ? 'finished' : 'ended'} (step ${T.i + 1})`);
}

// fx since the step's half began: the scripted Consumer flag, its catch, the FALSE ALARM, the R&D glitch
function readFx(c) {
  for (const e of drain(c.st, cursorOf(c.view, 'tutorial'))) {
    if (e.type === 'flag' && e.lane === 'ext') T.seen.flag = true;
    if (e.type === 'caught' && e.lane === 'ext') T.seen.caught = true;
    if (e.type === 'falseAlarm' && e.lane === 'ext') T.seen.falseAlarm = true;
    if (e.type === 'glitch' && e.lane === 'int') T.seen.glitch = true;
  }
}

// held: a flagged line on Consumer waits while there is no Auditor to take it (steps 3 and 4 only)
function held(st) {
  const id = TUTORIAL_STEPS[T.i]?.id;
  if (st.phase !== 'play' || (id !== 'probe' && id !== 'auditor') || has(st, 'ext', 'auditor')) return false;
  return st.lanes.ext.tasks.some(t => t.flagged && t.script && !t.dead);
}

// =================== the plate (HTML, over the codec's trace) ===================

function plate() {
  if (el) return;
  const root = document.getElementById('overlays');
  if (!root) return;
  el = document.createElement('div');
  el.id = 'tut';
  el.hidden = true;
  el.innerHTML = `<div class="tut-h"><span class="tut-n"></span><button class="tut-skip ghost-btn" type="button"></button></div>
    <div class="tut-do"></div>`;
  el.querySelector('.tut-skip').textContent = TUTORIAL_UI.skip;
  el.querySelector('.tut-skip').addEventListener('click', ev => { ev.stopPropagation(); skip(api, true); });
  root.appendChild(el);
}

let shown = '';
function paint(c) {
  const { st } = c, step = TUTORIAL_STEPS[T.i];
  // the card and report screens cover the board, and a codec question owns the box: no plate then
  const hide = st.phase !== 'play' || !!st.pendingChoice || !!st.pendingRetrain || !!st.alarm || c.view.modal;
  el.hidden = hide;
  if (hide) return;
  // while the codec catches up (T.listen), the plate keeps the step just done, ticked
  const listening = T.listen != null && T.i > 0, show = listening ? TUTORIAL_STEPS[T.i - 1] : step;
  const price = ASKS[show.id] ? money(R.buyPrice(st, ASKS[show.id])) : '';
  const key = `${T.i}|${T.half}|${listening}|${price}`;
  if (key === shown) return;
  shown = key;
  el.querySelector('.tut-n').textContent = tpl(TUTORIAL_UI.counter, { n: show.step, of: TUTORIAL_STEPS.length });
  el.querySelector('.tut-do').textContent = tpl(show.do, { price });
  el.classList.toggle('done', listening || T.half === 'after');
}

// =================== the ring: what to click next (drawn on the canvas, over the board) ===================

function ring(c) {
  const { st, view, g } = c, step = TUTORIAL_STEPS[T.i];
  if (T.half !== 'do' || T.listen != null || st.phase !== 'play' || view.modal) return;
  const regions = targets(c, step.id);
  if (!regions.length) return;
  const a = 0.55 + 0.45 * Math.sin(view.now * 6);
  g.save();
  g.globalAlpha = clamp(a, 0, 1);
  for (const r of regions) corners(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, C.ambL, 5, 2);
  g.restore();
}

function targets(c, id) {
  const { st, view, hit } = c, all = kind => hit.all(kind);
  const item = el => all('menu-item').filter(r => r.data?.id === el);
  const mounts = (lane, below = -1) => all('mount').filter(r => r.data.lane === lane && r.data.slot > below && !st.lanes[lane].slots[r.data.slot].layer);
  const probeAt = st.lanes.ext.slots.findIndex(s => s.layer === 'probe');
  switch (id) {
    case 'line':       return all('line').filter(r => r.data.lane === 'ext').slice(0, 1);
    case 'probe':      return view.placing === 'probe' ? mounts('ext') : item('probe');
    case 'auditor':    return view.placing === 'auditor' ? mounts('ext', probeAt) : item('auditor');
    case 'monitor':    return view.placing === 'monitor' ? mounts('ext') : item('monitor');
    case 'rnd':        return view.placing === 'probe' ? mounts('int') : item('probe');
    case 'split':      return all('split').filter(r => r.data.handle === 1);
    case 'research':   return all('research');
    default:           return [];
  }
}
