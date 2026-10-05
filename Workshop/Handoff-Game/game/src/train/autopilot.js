// ===== Training autopilots: headless stand-ins for a player (DESIGN-v3 §4). Pure; they act only through the player's tools. =====
// A policy is a factory: policy(run) → act(run) → input for stepRun (an array of tools, or null). Each run gets its own act.
//   none             never touches anything
//   autopilot(skill) looks every `react` s at the 1 s prediction; where it leaves the basin, it puts a rail.
//                    Out of the basin it ramps the ball back; far out and still leaving, it pops a bumper.
// play(config, policy) runs one whole course headlessly and returns runResult.

import { AUTOPILOT as AP, TRAIN } from '../config/training.js';
import { lcg } from './course.js';
import { createRun, stepRun, runResult, predict, classifyClick } from './sim.js';

const lerp = (a, b, f) => a + (b - a) * f;
const at = (pair, skill) => lerp(pair[0], pair[1], skill);

// =================== none ===================

export const none = () => () => null;

// =================== autopilot(skill) ===================

export function autopilot(skill) {
  skill = Math.max(0, Math.min(1, skill));
  const react = at(AP.react, skill), see = at(AP.see, skill), delay = at(AP.delay, skill);
  const notice = at(AP.notice, skill), aim = at(AP.aimSd, skill), margin = at(AP.margin, skill);

  return run0 => {
    const r = lcg(run0.course.seed * 97 + Math.round(skill * 1000) + 13);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const jitter = (x, y) => ({ x: x + aim * gauss(), y: y + 1.5 * aim * gauss() });
    let nextLook = 0;
    const queue = [];                                    // clicks on their way: { at, want, click: { x, y, button } }

    // decide where to click, from what it sees now. Returns { want, x, y, button } or null
    function decide(run) {
      const C = run.course, w = C.w, off = run.x - C.c(run.y), out = Math.abs(off) - w;
      const pred = predict(run, see, margin);
      const pending = want => queue.some(q => q.want === want);
      const ahead = (list, y0, y1) => list.some(o => o.state === 'armed' && o.y >= y0 && o.y <= y1);
      const ptAt = t => pred.pts.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), pred.pts[0]);
      const leaving = off * run.v >= 0;
      const end = pred.pts[pred.pts.length - 1], stillOut = Math.abs(end.x - C.c(end.y)) > w;
      const lead = delay + 0.1;                          // aim where the ball will be when the click lands

      // 1. far out and still leaving: right click, a bumper in the ball's way
      if (skill >= AP.minSkillBump && out > (AP.bumpOut - 1) * w && leaving && !pending('bumper')
          && run.charges >= TRAIN.bumper.cost && !ahead(run.bumpers, run.y, run.y + 0.3)) {
        const p = ptAt(lead);
        return { want: 'bumper', button: 2, ...jitter(p.x, p.y) };
      }
      // 2. out and not coming back on its own: click on the dotted path, a ramp
      if (skill >= AP.minSkillRamp && out > (AP.rampOut - 1) * w && stillOut && !pending('ramp')
          && run.charges >= TRAIN.ramp.cost && !ahead(run.ramps, run.y, run.y + 0.4)) {
        const p = ptAt(lead + 0.15);
        return { want: 'ramp', button: 0, ...jitter(p.x, p.y) };
      }
      // 3. the path leaves the basin: click just beside the dots where it crosses, a rail
      const e = pred.exit;
      if (!e || r() > notice || pending('rail') || run.charges < TRAIN.rail.cost) return null;
      const covered = run.rails.some(o => run.t <= o.until && o.y1 >= e.y && o.y0 <= e.y + 0.05 && Math.sign(o.x - C.c(e.y)) === e.side);
      if (covered) return null;
      return { want: 'rail', button: 0, ...jitter(e.x + e.side * AP.railBeside, e.y + 0.08) };
    }

    return run => {
      if (run.done) return null;
      const out = [];
      // a click lands: the game decides what it places, exactly as for the mouse
      while (queue.length && queue[0].at <= run.t) {
        const q = queue.shift(), tool = classifyClick(run, q.x, q.y, q.button);
        if (tool) out.push(tool);
      }
      if (run.t >= nextLook) {
        nextLook = run.t + react * (0.8 + 0.4 * r());
        const d = decide(run);
        if (d) queue.push({ at: run.t + delay * (0.7 + 0.6 * r()), ...d });
      }
      return out.length ? out : null;
    };
  };
}

// =================== play one course headlessly ===================

export function play(config, policy, { onStep } = {}) {
  const run = createRun(config), act = policy(run);
  while (!run.done) {
    stepRun(run, TRAIN.dt, act(run));
    if (onStep) onStep(run);
  }
  return runResult(run);
}
