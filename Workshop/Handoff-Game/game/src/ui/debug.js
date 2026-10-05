// ===== ?debug=1 panel (key D): the hidden truth in plain text, plus cheat buttons. DOM only, never read by the game =====

import { EVENTS } from '../config/events.js';
import { LAYERS } from '../config/layers.js';
import { START_LANES } from '../config/tasks.js';
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
  for (const l of START_LANES) add('+slot ' + l, () => actions.addSlot(l));
  btns.appendChild(document.createElement('br'));
  for (const ev of EVENTS) add(ev.id, () => actions.fireEvent(ev.id));

  let lastT = 0;
  function update(st) {
    const now = performance.now();
    if (now - lastT < 250) return;
    lastT = now;
    const { est, err } = R.misalignmentEstimate(st), ids = R.laneIds(st);
    const lines = [
      `DEBUG  seed ${st.seed}  t ${st.t.toFixed(1)}s  phase ${st.phase}  difficulty ${st.trueDifficulty}`,
      `true m ${st.m.toFixed(3)}   est ${est.toFixed(3)} ± ${err.toFixed(3)}   drift ${st.drift.toFixed(1)}`,
      `attack chance/chip ${ids.map(l => `${l} ${R.attackChance(st, l).toFixed(3)}`).join(' ')}   catastrophic share ${R.genDef(st).catShare}`,
      `rd ${st.rd.toFixed(1)}/${st.rdNeed}  rival ${st.rival.toFixed(2)} vs ${R.playerProgress(st).toFixed(2)}`,
      `evidence ${st.evidence.toFixed(1)} (on this model ${st.dossier.evidence.toFixed(1)})  incidents ${st.incidents}  sleeper ${st.landedSabotage}`,
      `traits ${st.traits.join(', ')}   split P ${st.split.product.toFixed(2)} C ${st.split.capabilities.toFixed(2)} S ${st.split.safety.toFixed(2)}`,
      `chips/s ${ids.map(l => `${l} ${R.laneRate(st, l).toFixed(1)}`).join(' ')}   dwell ${R.scanDwell(st).toFixed(2)}s`,
      '', 'live per read, × q (catch / false alarm / unread estimate), placed level or L1:',
    ];
    for (const id of ['probe', 'monitor', 'untrusted']) {
      const cols = ids.map(lane => {
        const level = st.lanes[lane].slots.find(s => s.layer === id)?.level ?? 1;
        const s = R.elementStats(st, id, { lane, level });
        return `${lane} L${level} ${s.catch.toFixed(2)}/${s.falseAlarm.toFixed(3)}/${(100 * s.unreadRate).toFixed(0)}%`;
      });
      lines.push(`  ${LAYERS[id].tag.padEnd(4)} ${cols.join('   ')}`);
    }
    const audLevel = ids.map(l => st.lanes[l].slots.find(s => s.layer === 'auditor')?.level).find(Boolean) ?? 1;
    lines.push(`  AUD  L${audLevel} coverage ${R.auditCoverage(st, R.bundle(st), audLevel).toExponential(1)}  acc ${R.auditorAcc(st, audLevel).toFixed(2)}`);
    lines.push('', 'measured (attacks flagged/seen · benign flagged/seen):');
    for (const [id, c] of Object.entries(st.stats.layers)) lines.push(`  ${LAYERS[id].tag.padEnd(4)} ${c.attackFlagged}/${c.attackSeen} · ${c.benignFlagged}/${c.benignSeen}`);
    const L = st.stats.lanes;
    lines.push('');
    for (const l of ids) lines.push(`${l} landed ${L[l].landed || 0} caught ${L[l].caught || 0} blocked ${L[l].blocked || 0}`);
    pre.textContent = lines.join('\n');
  }
  return { update };
}
