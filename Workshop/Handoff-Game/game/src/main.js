// ===== Boot, game loop, input. Glue between sim (state) and render (reads state). =====

import * as Sim from './sim/sim.js';
import { scorecard } from './sim/scorecard.js';
import { DIFFICULTY } from './config/balance.js';
import { LAYERS } from './config/layers.js';
import { createPlayfield } from './render/playfield.js';
import { createHud, renderScorecard } from './render/hud.js';
import { createCodec } from './render/codec.js';
import { createDebug } from './render/debug.js';
import { initAudio, setMuted, isMuted, onFx as audioFx, sfx } from './render/audio.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const SIM_DT = 1 / 60;

// ---------- tiny localStorage wrapper (best scorecard + settings only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('handoff.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('handoff.' + k, JSON.stringify(v)); } catch { /* private mode etc. */ } },
};

// ---------- state ----------
let st = null, paused = false, fast = false, lastFx = 0, scoreShown = false;
const ui = { selected: null, hover: null };

const canvas = document.getElementById('field');
const field = createPlayfield(canvas);

const actions = {
  select(id) { ui.selected = ui.selected === id ? null : id; sfx.click(); },
  pickResearch(i) { Sim.pickResearch(st, i); },
  skipGen() { Sim.debugSkipGen(st); },
  addMoney() { Sim.debugAddMoney(st); },
  unlockAll() { Sim.debugUnlockAll(st); },
  addSlot(l) { Sim.debugAddSlot(st, l); },
  fireEvent(id) { Sim.fireEvent(st, id); },
};
const hud = createHud(actions);
const codec = createCodec(i => Sim.choose(st, i));
const debug = DEBUG ? createDebug(actions) : null;
setMuted(store.get('muted', false));

// ---------- start / restart ----------
function newGame(difficulty) {
  const seed = params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
  st = Sim.createState({ seed, difficulty });
  st.debug = DEBUG;
  lastFx = 0; scoreShown = false; paused = false; ui.selected = null;
  codec.reset(); hud.reset();
  document.getElementById('ov-start').hidden = true;
  document.getElementById('ov-score').hidden = true;
  console.log(`[handoff] new game seed=${seed} difficulty=${difficulty} (true: ${st.trueDifficulty})`);
  store.set('settings', { difficulty });
  if (DEBUG) window.__handoff = { st, Sim, ui };   // poke at it from the console
}

function showStart() {
  const box = document.getElementById('difficulty');
  box.innerHTML = '';
  for (const [id, d] of Object.entries(DIFFICULTY)) {
    const b = document.createElement('button');
    b.textContent = d.label.toUpperCase();
    b.onclick = () => { initAudio(); newGame(id); };
    box.appendChild(b);
  }
  const best = store.get('best', null);
  document.getElementById('best').textContent = best ? `best run: grade ${best.grade} · ${best.ending.title} · reached G${best.gen}` : '';
  document.getElementById('ov-start').hidden = false;
}

// ---------- input ----------
function canvasXY(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

function clickSlot(h, sell = false) {
  if (!st || st.over) return;
  const slot = st.lanes[h.lane].slots[h.slot];
  let res;
  if (sell) res = Sim.sellLayer(st, h.lane, h.slot);
  else if (!slot.layer && ui.selected) {
    const global = LAYERS[ui.selected].lanes.includes('global');          // Interp Lab: any mount click builds it off-track
    res = global ? Sim.placeLayer(st, 'global', 0, ui.selected) : Sim.placeLayer(st, h.lane, h.slot, ui.selected);
    if (res.ok) ui.selected = null;
  }
  else if (slot.layer) res = Sim.toggleLayer(st, h.lane, h.slot);
  else res = { ok: false, msg: 'pick a layer card first' };
  if (!res.ok) hud.toast(res.msg);
}

canvas.addEventListener('mousemove', e => { if (st) ui.hover = field.hit(st, ...canvasXY(e)); });
canvas.addEventListener('mouseleave', () => { ui.hover = null; });
canvas.addEventListener('click', e => { initAudio(); const h = st && field.hit(st, ...canvasXY(e)); if (h) clickSlot(h); });
canvas.addEventListener('contextmenu', e => { e.preventDefault(); const h = st && field.hit(st, ...canvasXY(e)); if (h) clickSlot(h, true); });
canvas.addEventListener('dragover', e => e.preventDefault());
canvas.addEventListener('drop', e => {
  e.preventDefault();
  const h = st && field.hit(st, ...canvasXY(e));
  const id = e.dataTransfer.getData('text/plain');
  if (h && id) { ui.selected = id; clickSlot(h); }
});

document.getElementById('btn-research').onclick = () => { const r = Sim.drawResearch(st); if (!r.ok) hud.toast(r.msg); };
document.getElementById('btn-retrain').onclick = () => Sim.retrainProbes(st);

window.addEventListener('keydown', e => {
  if (!st) return;
  const k = e.key;
  if (k === ' ') { e.preventDefault(); paused = !paused; }
  else if (k === 'Escape') ui.selected = null;
  else if (k === 'f' || k === 'F') fast = !fast;
  else if (k === 'm' || k === 'M') { setMuted(!isMuted()); store.set('muted', isMuted()); hud.toast(isMuted() ? 'muted' : 'sound on'); }
  else if (/^[1-9]$/.test(k)) {
    const i = Number(k) - 1;
    if (st.pendingChoice) Sim.choose(st, i);
    else if (st.pendingResearch) Sim.pickResearch(st, i);
    else if (st.unlocked[i]) actions.select(st.unlocked[i]);
  }
  else if (DEBUG && (k === 'n' || k === 'N')) actions.skipGen();
  else if (DEBUG && k === '$') actions.addMoney();
  else if (DEBUG && (k === 'd' || k === 'D')) { const d = document.getElementById('debug'); d.hidden = !d.hidden; }
  else if (DEBUG && (k === 'u' || k === 'U')) actions.unlockAll();
});

window.addEventListener('resize', () => field.resize());

// ---------- loop: fixed-step sim, render every frame ----------
let acc = 0, prev = performance.now();
function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - prev) / 1000);
  prev = nowMs;

  if (st) {
    if (!paused) {
      acc += dt * (fast ? 3 : 1);
      while (acc >= SIM_DT) { Sim.step(st, SIM_DT); acc -= SIM_DT; }
    }
    // dispatch new fx to the renderers
    for (const e of st.fx) if (e.id > lastFx) { field.onFx(e, st); audioFx(e); hud.onFx(e, st); lastFx = e.id; }

    field.draw(st, ui);
    hud.update(st, ui);
    codec.update(st, nowMs / 1000);
    if (debug) debug.update(st);
    document.getElementById('ov-pause').hidden = !paused;

    if (st.over && !scoreShown) {
      scoreShown = true;
      setTimeout(() => {
        const card = scorecard(st);
        const best = store.get('best', null);
        if (!best || card.score > best.score) store.set('best', card);
        renderScorecard(card, best, showStart);
        console.log('[handoff] scorecard', card);
      }, 1800);
    }
  }
  requestAnimationFrame(frame);
}

field.resize();
showStart();
requestAnimationFrame(frame);
