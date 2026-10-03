// ===== Player actions: the sim's own actions, plus a toast when one is refused =====
// The only way the UI changes the game. Every call returns true / false.

import * as Sim from '../sim/sim.js';
import { BALANCE as B } from '../config/balance.js';

export function createAct(api) {
  const view = api.view;

  function run(fn, why) {
    const st = api.st;
    if (!st) return false;
    if (st.over) { view.toast('the run is over'); return false; }
    const res = fn(st);
    const ok = res && typeof res === 'object' ? !!res.ok : !!res;
    if (!ok) view.toast((res && res.msg) || why || 'not now');
    return ok;
  }

  return {
    place:         (lane, slot, id) => run(st => Sim.placeLayer(st, lane, slot, id)),
    toggle:        (lane, slot) => run(st => Sim.toggleLayer(st, lane, slot)),
    sell:          (lane, slot) => run(st => Sim.sellLayer(st, lane, slot)),
    upgrade:       (lane, slot) => run(st => Sim.upgrade(st, lane, slot)),
    buySlot:       lane => run(st => Sim.buySlot(st, lane)),
    setSplit:      (product, capabilities, safety) => run(st => Sim.setSplit(st, product, capabilities, safety)),
    choose:        i => run(st => Sim.choose(st, i), 'no such choice'),
    drawResearch:  () => run(st => Sim.drawResearch(st)),
    pickResearch:  i => run(st => Sim.pickResearch(st, i), api.st?.researchOffer?.[i] ? 'can\'t pay for that card: take the other one' : 'no such card'),
    retrainProbes: () => run(st => Sim.retrainProbes(st), `retraining needs ${B.retrainEvidence} evidence`),
    invokeRSP:     () => run(st => Sim.invokeRSP(st)),
  };
}
