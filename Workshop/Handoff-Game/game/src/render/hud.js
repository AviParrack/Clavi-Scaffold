// ===== DOM HUD: top bar, right panel, research picker, new-model splash, scorecard =====

import { BALANCE as B } from '../config/balance.js';
import { LAYERS } from '../config/layers.js';
import { GENERATIONS, PALETTES } from '../config/generations.js';
import { LANES } from '../config/tasks.js';
import { CARD_BY_ID, cardTitle, cardText } from '../sim/research.js';
import * as R from '../sim/rules.js';
import { money, big, pct, bundleTag } from '../util/format.js';
import { drawPortrait } from './portraits.js';

const $ = id => document.getElementById(id);

export function createHud(actions) {
  let handKey = '', upKey = '', researchKey = '', paletteName = '', modelHideAt = 0, toastAt = 0;

  // ---------- palette by generation ----------
  function applyPalette(st) {
    const name = GENERATIONS[st.gen - 1].palette;
    if (name === paletteName) return;
    paletteName = name;
    const p = PALETTES[name], s = document.documentElement.style;
    s.setProperty('--fg', p.fg); s.setProperty('--dim', p.dim); s.setProperty('--glow', p.glow); s.setProperty('--bg', p.bg);
  }

  // ---------- top bar ----------
  function topbar(st) {
    const g = R.genDef(st);
    $('hud-money').textContent = money(st.money);
    $('hud-money').classList.toggle('danger', st.money < 0);
    if (st.money < 0) $('hud-money').textContent += ` · BANKRUPT IN ${Math.ceil(B.bankruptSeconds - st.negMoneyT)}s`;
    $('hud-rep').textContent = st.rep.toFixed(0);
    $('hud-rep').classList.toggle('danger', st.rep < 25);
    $('hud-rep-bar').style.width = Math.max(0, Math.min(100, st.rep)) + '%';
    $('hud-gen').textContent = `G${g.g} ${g.name}`;
    $('hud-rd-bar').style.width = (st.phase === 'training' ? 100 : 100 * Math.min(1, st.rd / st.rdNeed)) + '%';

    const you = R.playerProgress(st), riv = st.rival;
    $('hud-race-you').style.left = (100 * Math.min(1, you / 7)) + '%';
    $('hud-race-rival').style.left = (100 * Math.min(1, riv / 7)) + '%';
    const ahead = R.rivalAhead(st);
    $('hud-rival').textContent = ahead ? `AHEAD by ${(riv - you).toFixed(2)} gen · ext ×${R.rivalMult(st).toFixed(2)}` : `behind by ${(you - riv).toFixed(2)} gen`;
    $('hud-rival').classList.toggle('danger', ahead);

    const { est, err } = R.misalignmentEstimate(st);
    $('hud-mis').textContent = `${Math.round(100 * est)}% ± ${Math.round(100 * err)}`;
    $('hud-tps').textContent = big(R.realTasksPerSec(st));
    $('hud-hre').textContent = big(R.humanEquivalents(st));
    $('hud-seen').textContent = humanPct(R.humanSeenFrac(st));
  }

  // ---------- right panel ----------
  function panel(st, ui) {
    const key = st.unlocked.join() + '|' + ui.selected + '|' + st.unlocked.map(id => st.money >= R.buyPrice(st, id) ? 1 : 0).join('') + '|' + st.gen + '|' + (st.upgrades.distillation ? 1 : 0) + Math.round(R.mod(st, 'cost') * 10);
    if (key !== handKey) {
      handKey = key;
      const hand = $('hand');
      hand.innerHTML = '';
      st.unlocked.forEach((id, i) => {
        const L = LAYERS[id];
        const b = document.createElement('button');
        b.className = 'card' + (ui.selected === id ? ' sel' : '') + (st.money < R.buyPrice(st, id) ? ' poor' : '');
        b.draggable = true;
        const per = id === 'defer' ? 'free' : `${money(R.layerCost(st, id))}/${id === 'auditor' ? 'audit' : id === 'resampler' ? 'resample' : 'task'}`;
        b.innerHTML = `<span class="t">${i + 1}. ${L.name}</span><span class="p">${money(R.buyPrice(st, id))}</span>
          <div class="d">${L.role} · ${per} · ${L.latency}s</div>`;
        b.title = L.desc;
        b.onclick = () => actions.select(id);
        b.ondragstart = e => { e.dataTransfer.setData('text/plain', id); actions.select(id); };
        hand.appendChild(b);
      });
    }

    const price = R.researchPrice(st);
    const rb = $('btn-research');
    rb.textContent = `RESEARCH  ${money(price)}`;
    rb.disabled = st.money < price || !!st.pendingResearch || !!st.over;

    const tb = $('btn-retrain');
    tb.hidden = !R.placedAnywhere(st, 'probe');
    tb.textContent = `RETRAIN PROBES (${B.retrainEvidence} evidence · have ${st.evidence.toFixed(0)})`;
    tb.disabled = st.evidence < B.retrainEvidence;

    const uk = st.cardsTaken.join();
    if (uk !== upKey) {
      upKey = uk;
      const ups = st.cardsTaken.filter(id => CARD_BY_ID[id].type === 'tech').map(id => '✓ ' + CARD_BY_ID[id].title);
      $('upgrades').innerHTML = ups.length ? '<b>UPGRADES</b><br>' + ups.join('<br>') : '';
    }
    inspector(st, ui);
  }

  function inspector(st, ui) {
    const el = $('inspector');
    const h = ui.hover, slot = h && st.lanes[h.lane].slots[h.slot];
    if (!slot) { el.innerHTML = ui.selected ? `<b>${LAYERS[ui.selected].name}</b><br>${LAYERS[ui.selected].desc}<br><i>click an empty mount to place</i>` : `<span style="color:var(--dim)">hover a mount for details · evidence ${st.evidence.toFixed(0)}</span>`; return; }
    if (!slot.layer) { el.innerHTML = `${LANES[h.lane].label} mount ${h.slot + 1}: empty`; return; }
    const L = LAYERS[slot.layer], s = R.slotStats(st, h.lane, h.slot);
    let lines = [`<b>${L.name}</b> L${s.level} · ${LANES[h.lane].label} mount ${h.slot + 1} · ${R.slotActive(st, slot) ? 'ON' : 'OFF'}`, L.desc];
    if (L.role === 'detector') {
      lines.push(`flags ${pct(s.catch)} of attacks it reads (q ${s.readQuality.toFixed(2)}) · false alarms ${pct(s.falseAlarm, 1)}`);
      lines.push(`${s.heads} heads · ~${pct(s.unreadRate)} of chips go unread at this volume`);
    }
    if (slot.layer === 'auditor') lines.push(`covers ${pct(s.coverage, 1)} of each bundle · accuracy ${pct(s.accuracy)}`);
    lines.push(`<i>click: toggle · right-click: sell for ${money(R.investedPrice(st, slot.layer, slot.level) * B.sellRefund)}</i>`);
    el.innerHTML = lines.join('<br>');
  }

  // ---------- research picker ----------
  function research(st) {
    const key = st.pendingResearch ? st.pendingResearch.join() : '';
    if (key === researchKey) return;
    researchKey = key;
    $('ov-research').hidden = !st.pendingResearch;
    if (!st.pendingResearch) return;
    const box = $('research-cards');
    box.innerHTML = '';
    st.pendingResearch.forEach((id, i) => {
      const c = CARD_BY_ID[id];
      const b = document.createElement('button');
      b.innerHTML = `<span class="t">${cardTitle(c)}</span>${cardText(c)}${c.type === 'unlock' ? `<br><br>buy ${money(R.buyPrice(st, c.layer))}` : ''}`;
      b.onclick = () => actions.pickResearch(i);
      box.appendChild(b);
    });
  }

  // ---------- NEW MODEL TRAINED splash ----------
  function newModel(st) {
    const g = R.genDef(st);
    $('model-name').textContent = `G${g.g} · ${g.name.toUpperCase()}`;
    $('model-stats').innerHTML = `bundle ${bundleTag(g.bundle)} tasks per chip · ${R.laneRate(st, 'ext').toFixed(1)} / ${R.laneRate(st, 'int').toFixed(1)} chips/s ext / int<br>
      ${big(R.realTasksPerSec(st))} tasks/s · ≈ ${big(R.humanEquivalents(st))} human researchers<br>
      "${g.voice}"`;
    drawPortrait($('model-portrait'), 'model', { gen: g.g });
    $('ov-model').hidden = false;
    modelHideAt = performance.now() + 3500;
  }

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); toastAt = performance.now() + 1600; }

  function onFx(e, st) {
    if (e.type === 'newModel' && e.g > 1) newModel(st);
    if (e.type === 'landed' || e.type === 'catastrophe' || e.type === 'shake') { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); }
  }

  function update(st, ui) {
    applyPalette(st);
    topbar(st);
    panel(st, ui);
    research(st);
    if (modelHideAt && performance.now() > modelHideAt) { $('ov-model').hidden = true; modelHideAt = 0; }
    if (toastAt && performance.now() > toastAt) { $('toast').classList.remove('on'); toastAt = 0; }
  }

  function reset() { handKey = upKey = researchKey = paletteName = ''; $('ov-model').hidden = true; }

  return { update, onFx, toast, reset };
}

export function humanPct(f) {
  if (f <= 0) return '0%';
  if (f >= 0.1) return pct(f);
  if (f >= 0.001) return pct(f, 2);
  return (100 * f).toExponential(1) + '%';
}

// ---------- scorecard ----------
export function renderScorecard(card, best, onRestart) {
  const tr = (cells, th = false) => `<tr>${cells.map(c => th ? `<th>${c}</th>` : `<td>${c}</td>`).join('')}</tr>`;
  const genRows = card.gens.map(g => tr([`G${g.g} ${g.name}`, pct(g.m), g.est == null ? '—' : `${pct(g.est)} ± ${Math.round(100 * g.err)}`,
    g.est == null ? '' : Math.abs(g.est - g.m) <= g.err ? '✅' : '❌', (g.drift || 0).toFixed(1),
    g.traits.map(t => `${t.name}${t.revealed ? '' : ' (hidden)'}`).join(', ')])).join('');
  const L = card.lanes;
  const laneRows = ['ext', 'int'].map(l => tr([LANES[l].label, L[l].caught, L[l].blocked, L[l].deferred + L[l].resampled, `<b>${L[l].landed}</b>`, L[l].benignBlocked, L[l].unread])).join('');
  const verdict = card.win ? 'YOU REACHED ASI' : { catastrophe: 'CATASTROPHE', reputation: 'REPUTATION COLLAPSED', bankrupt: 'BANKRUPT', rival: 'PROMETHEUS SHIPPED FIRST' }[card.reason] || 'GAME OVER';

  $('score-body').innerHTML = `
    <div class="grade">${card.grade}</div>
    <h2>${verdict}</h2>
    <div class="ending">${card.ending.title}</div>
    <div>${card.ending.text}</div>
    <p style="color:var(--dim)">reached G${card.gen} ${card.genName} · ${Math.floor(card.time / 60)}m${String(Math.floor(card.time % 60)).padStart(2, '0')}s · seed ${card.seed} · true difficulty: ${card.difficulty}</p>
    <h3>WHAT WAS REALLY GOING ON</h3>
    <table>${tr(['generation', 'true m', 'your estimate', '', 'drift', 'traits'], true)}${genRows}</table>
    <table>${tr(['lane', 'caught', 'blocked', 'neutralised', 'attacks landed', 'benign blocked', 'unread'], true)}${laneRows}</table>
    <p>Real attacks: <b>${card.attacks}</b> · stopped ${card.stopped} (${pct(card.catchRate)}) · landed ${card.landed}<br>
    Earned ${money(card.income)} · spent ${money(card.safety)} on safety (${pct(card.safetyShare)})<br>
    Final share of tasks seen by a human: <b>${humanPct(card.humanSeen)}</b></p>
    ${best ? `<p style="color:var(--dim)">best: grade ${best.grade}, ${best.ending.title}, G${best.gen} (score ${best.score.toFixed(0)})</p>` : ''}
    <button class="btn" id="btn-restart">PLAY AGAIN</button>`;
  $('ov-score').hidden = false;
  $('btn-restart').onclick = onRestart;
}
