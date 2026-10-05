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
    retrainProbes: () => run(st => Sim.retrainProbes(st), `retraining needs ${B.retrainEvidence} evidence`),
    invokeRSP:     () => run(st => Sim.invokeRSP(st)),

    // ----- phases: DEPLOY (card → play), TRAIN (report → training), the training result -----
    ack:           () => run(st => Sim.ack(st)),
    submitTraining: result => run(st => Sim.submitTraining(st, result), 'not training'),
    // ----- research: the offer on show is st.research.banked[0] -----
    pickCard:      (i, target) => run(st => Sim.pickCard(st, i, target), 'no such card'),
    reroll:        () => run(st => Sim.reroll(st), 'reroll used'),
    bankCard:      () => run(st => Sim.bankCard(st), 'nothing banked'),
    // ----- lanes and the two alarms -----
    openLane:      id => run(st => Sim.openLane(st, id)),
    retrain:       yes => run(st => Sim.retrain(st, yes), 'nothing to answer'),
    pullPlug:      () => run(st => Sim.pullPlug(st), 'no alarm'),
  };
}
