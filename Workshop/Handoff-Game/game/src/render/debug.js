// ===== ?debug=1 overlay: the truth, plus cheat keys =====

import { EVENTS } from '../config/events.js';
import { LAYERS } from '../config/layers.js';
import * as R from '../sim/rules.js';

export function createDebug(actions) {
  const el = document.getElementById('debug');
  el.hidden = false;
  const pre = document.createElement('div');
  const btns = document.createElement('div');
  el.append(pre, btns);

  const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; btns.appendChild(b); };
  add('N: skip gen', actions.skipGen);
  add('$: +money', actions.addMoney);
  add('U: unlock all', actions.unlockAll);
  add('+slot ext', () => actions.addSlot('ext'));
  add('+slot int', () => actions.addSlot('int'));
  btns.appendChild(document.createElement('br'));
  for (const ev of EVENTS) add(ev.id, () => actions.fireEvent(ev.id));

  let lastT = 0;
  function update(st) {
    const now = performance.now();
    if (now - lastT < 250) return;
    lastT = now;
    const { est, err } = R.misalignmentEstimate(st);
    const lines = [
      `DEBUG  seed ${st.seed}  t ${st.t.toFixed(1)}s  phase ${st.phase}  difficulty ${st.trueDifficulty}`,
      `true m ${st.m.toFixed(3)}   est ${est.toFixed(3)} ± ${err.toFixed(3)}   drift ${st.drift.toFixed(1)}`,
      `attack rate/task ${R.attackRate(st).toFixed(3)}   catastrophic share ${R.genDef(st).catShare}`,
      `rd ${st.rd.toFixed(1)}/${st.rdNeed}  rival ${st.rival.toFixed(2)} vs ${R.playerProgress(st).toFixed(2)}`,
      `evidence ${st.evidence.toFixed(1)}  incidents ${st.incidents}  sleeper ${st.landedSabotage}`,
      '', 'live TPR (with stealth+collusion) / FPR per lane:',
    ];
    for (const id of ['probe', 'monitor', 'untrusted']) {
      lines.push(`  ${LAYERS[id].tag.padEnd(4)} ext ${R.detectorTPR(st, 'ext', id).toFixed(2)}  int ${R.detectorTPR(st, 'int', id).toFixed(2)}  fpr ${LAYERS[id].fpr}`);
    }
    lines.push(`  AUD  coverage ${R.auditCoverage(st, R.bundle(st)).toExponential(1)}  acc ${R.auditorAcc(st).toFixed(2)}`);
    lines.push('', 'measured (attacks flagged/seen · benign flagged/seen):');
    for (const [id, c] of Object.entries(st.stats.layers)) lines.push(`  ${LAYERS[id].tag.padEnd(4)} ${c.attackFlagged}/${c.attackSeen} · ${c.benignFlagged}/${c.benignSeen}`);
    const L = st.stats.lanes;
    lines.push('', `ext landed ${L.ext.landed || 0} caught ${L.ext.caught || 0} blocked ${L.ext.blocked || 0}`);
    lines.push(`int landed ${L.int.landed || 0} caught ${L.int.caught || 0} blocked ${L.int.blocked || 0}`);
    pre.textContent = lines.join('\n');
  }
  return { update };
}
