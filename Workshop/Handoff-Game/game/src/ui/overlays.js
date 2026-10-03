// ===== Overlays: the modal screens (HTML over the canvas) and the sound =====
// START (no game) · RESEARCH (st.researchOffer) · MODEL REVEAL (fx newModel, g > 1) · PAUSE (view.paused)
// · RSP prompt (st.rsp.ready) · SCORECARD (SCORE_DELAY s after st.over). Built once into the #ov-* sections of index.html.
// #overlays is one 1200×660 layer in board px, scaled by --k (style.css), so every size here is a board px.
// Colours: the theme's CSS variables (--g, --blu, --r ...). Canvases (portraits, LCD digits, icons) use theme C.
// Acts only through api.act, api.newGame and api.endGame. Hidden truth shows on the scorecard and nowhere else.
// Sound: sound(c) drains st.fx with its own cursor and plays ui/audio.js. Fx older than FX_FRESH s are skipped.

import { DIFFICULTY } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { TRAITS, DOSSIER } from '../config/traits.js';
import { BRANCHES, TECH } from '../config/cards.js';
import { CAST } from '../config/events.js';
import { LAYERS } from '../config/layers.js';
import { scorecard } from '../sim/scorecard.js';
import * as R from '../sim/rules.js';
import { money, big, pct } from '../util/format.js';
import * as audio from './audio.js';
import { C, F, k, epoch, fill, text, mod } from './theme.js';
import { ICON, MICRO, sprite, segStr, segW, lcdPanel } from './sprites.js';
import { portrait } from './portraits.js';
import { cursorOf, drain, animOf, fxAge } from './view.js';

// =================== tuning (UI only) ===================

const CPS = 45;                 // typewriter, characters per second (the codec's speed)
const LINE_HOLD = 1.8;          // start screen: s a typed line stays before the next
const MODEL_SECONDS = 6;        // the model reveal stays up this long, the sim waiting under it (a click or Esc closes it)
const SCORE_DELAY = 1.8;        // s from the end of the run to the scorecard
const FX_FRESH = 0.5;           // sound: fx older than this (sim s) are skipped
const FREQ = '141.80';          // the start screen's call

let api = null;                 // main.js's api (st, view, act, store, newGame ...), from init()
let EL = null;                  // the screens' DOM, built once by init()
const DIFF_IDS = Object.keys(DIFFICULTY);

// =================== words ===================

const COLD_OPEN = [
  ['ceo',    'Kept you waiting, huh? Welcome to the safety team. All of it. You are the safety team.'],
  ['ceo',    'The model is live. Customer traffic runs down the left track, our own R&D down the right. A few of those tasks are attacks.'],
  ['safety', 'Which ones?'],
  ['ceo',    'If we knew that, we would not need you. Pick a difficulty. I would pick the one where we win.'],
];
const DIFF_HINT = {
  easy: 'the model is probably fine',
  medium: 'the model says it is fine',
  hard: 'the model has read your eval suite',
  unknown: 'rolled in secret: the scorecard tells you',
};
const CONTROLS = [
  ['CLICK', 'a menu key, then a mount: place'],
  ['SHIFT+CLICK', 'a mount: upgrade'],
  ['RIGHT-CLICK', 'a mount: sell'],
  ['DRAG', 'the COMPUTE seams: split the model'],
  ['1-9', 'answer · pick a card · take an element'],
  ['SPACE', 'pause (you can still build)'],
  ['F', 'three times the speed'],
  ['R', 'research: draw two cards, keep one'],
  ['M', 'mute'],
  ['ESC', 'cancel'],
];
const RULES = [
  'Tasks roll down two tracks. A few are attacks. Nobody tells you which.',
  'Detectors flag. Responders pull flagged lines into bays. The kill switch blocks the rest.',
  'EXTERNAL pays the bills. INTERNAL R&D trains the next model. Prometheus is racing you.',
  'Evidence fills the dossier: the only way to learn what your model really is.',
];
const VERDICT = { asi: 'MODEL SHIPPED', catastrophe: 'CATASTROPHE', reputation: 'REPUTATION COLLAPSED', bankrupt: 'BANKRUPT',
  rival: 'PROMETHEUS SHIPPED FIRST' };
const ENDING_SPEAKER = { trust: 'ceo', lucky: 'ceo', paranoid: 'ceo', control: 'model', public: 'ceo', runway: 'ceo', rival: 'ceo' };
const PAUSE_QUIPS = ['The model is paused too. It says so, anyway.', 'Time stops. The invoices do not.',
  'Prometheus does not pause. Prometheus also does not have a safety team.', 'Take a breath. The weights are not going anywhere. Probably.'];
const RSP_QUIP = 'Even the CEO says pause.';

// a lab tech card's well: a small gear (unlock cards show their element's icon)
const GEAR = ['....##....', '.#.####.#.', '..######..', '.##....##.', '###.##.###', '###.##.###', '.##....##.', '..######..', '.#.####.#.', '....##....'];

// =================== DOM helpers ===================

const $ = id => document.getElementById(id);
const show = (el, on) => { if (el && el.hidden === on) el.hidden = !on; };
const setText = (el, s) => { s = String(s); if (el.textContent !== s) el.textContent = s; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const callsign = id => (id === 'safety' ? 'YOU' : id === 'model' ? 'MODEL' : (CAST[id]?.name ?? String(id)).toUpperCase());
const signed = (x, d = 1) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : (x > 0 ? '+' : '−') + Math.abs(x).toFixed(d));
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// a <canvas> painted in board px at device resolution, so it stays crisp under the --k scale.
// Repaints only when `key` or the scale changes.
function pixel(cv, w, h, key, paint) {
  const id = key + '|' + k + '|' + epoch;
  if (cv._id === id) return;
  cv._id = id;
  cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false;
  paint(g);
}

// a codec portrait in its PSX frame (98×122, the face 88×112 at +5,+5)
function paintFace(cv, speaker, opts = {}) {
  const key = ['face', speaker, opts.talking ? 1 : 0, opts.blink ? 1 : 0, opts.gen || 0].join('|');
  pixel(cv, 98, 122, key, g => {
    fill(g, 0, 0, 98, 122, C.face[6]); fill(g, 3, 3, 92, 116, C.black); fill(g, 4, 4, 90, 114, C.face[4]); fill(g, 5, 5, 88, 112, C.black);
    fill(g, 0, 3, 1, 116, C.face[5]); fill(g, 97, 3, 1, 116, C.face[5]);
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [97, 0], [96, 0], [97, 1], [0, 121], [1, 121], [0, 120], [97, 121], [96, 121], [97, 120]]) g.clearRect(x, y, 1, 1);
    g.drawImage(portrait(speaker, opts), 5, 5, 88, 112);
  });
}

// an element icon (or the tech gear), 3 px per cell, in a black well
function paintIcon(cv, id, col) {
  pixel(cv, 34, 34, 'icon|' + id + '|' + col, g => {
    fill(g, 0, 0, 34, 34, C.black);
    sprite(g, ICON[id] || GEAR, 2, 2, { '#': col }, 3);
  });
}

// =================== START: title, a cold-open codec call, difficulty, controls ===================

function buildStart() {
  const keys = CONTROLS.map(([kk, what]) => `<span class="cap">${esc(kk)}</span><span class="cap-t">${esc(what)}</span>`).join('');
  const rules = RULES.map((s, i) => `<li><span class="n">0${i + 1}</span>${esc(s)}</li>`).join('');
  $('ov-start').innerHTML = `
    <div class="st-bar"><span>SAFETY OPERATIONS TERMINAL</span><span id="st-sound"></span></div>
    <div class="st-title">HANDOFF</div>
    <div class="st-tag">a tower defense game about AI control</div>
    <div class="st-codec">
      <canvas id="st-left"></canvas>
      <canvas id="st-set"></canvas>
      <canvas id="st-right"></canvas>
      <div class="st-name">CEO</div><div class="st-freq">FREQ ${FREQ} · SECURE</div><div class="st-name r">YOU</div>
      <div class="msx st-dlg" id="st-dlg">
        <div class="msx-who" id="st-who"></div>
        <div class="msx-line" id="st-line"></div>
        <div class="st-diff" id="difficulty"></div>
      </div>
    </div>
    <div class="st-side">
      <div class="pnl cn"><div class="pnl-h">CONTROLS</div><div class="keys">${keys}</div></div>
      <div class="pnl cn"><div class="pnl-h">THE JOB</div><ol class="rules">${rules}</ol></div>
      <div class="st-best" id="best"></div>
    </div>
    <div class="st-foot"><span>${api.debug ? '?seed=N a reproducible run · ?debug=1 debug keys · ?pixel=1 whole-pixel scale' : ''}</span><span>v2 · SOLITON</span></div>`;

  const box = $('difficulty');
  DIFF_IDS.forEach((id, i) => {
    const d = DIFFICULTY[id], r = d.range ? ` · true misalignment ${Math.round(100 * d.range[0])}–${Math.round(100 * d.range[1])}%` : '';
    const b = document.createElement('button');
    b.className = 'ch';
    b.dataset.i = i;
    b.innerHTML = `<span class="ch-k">${i + 1}</span><span class="ch-l">${esc(d.label)}</span><span class="ch-h">${esc(DIFF_HINT[id] || '')}${esc(r)}</span>`;
    b.onclick = () => startGame(id);
    b.onmouseenter = () => { const a = startAnim(); if (a) a.sel = i; };
    box.appendChild(b);
  });
  $('st-dlg').onclick = ev => { if (!ev.target.closest('.ch')) skipLine(); };
  return { left: $('st-left'), set: $('st-set'), right: $('st-right'), who: $('st-who'), line: $('st-line'), sound: $('st-sound'),
    choices: [...box.children] };
}

function startGame(id) {
  api.onGesture?.();
  audio.sfx.click();
  api.newGame(id);
}

const startAnim = () => api && !api.st ? animOf(api.view, 'start', () => ({ t0: null, sel: null, n: 0, at: null })) : null;

// where the cold open is: line i, s into it, typed chars n, still typing?
function coldOpen(a, t) {
  let s = t - a.t0 - 0.4, i = 0;                       // 0.4 s: the portraits open first
  while (i < COLD_OPEN.length - 1) {
    const d = COLD_OPEN[i][1].length / CPS + LINE_HOLD;
    if (s < d) break;
    s -= d; i++;
  }
  const len = COLD_OPEN[i][1].length, n = Math.max(0, Math.min(len, Math.floor(s * CPS)));
  return { i, s, n, typing: s >= 0 && n < len };
}

function skipLine() {
  const a = startAnim();
  if (!a || a.t0 == null || a.at == null) return;
  const p = coldOpen(a, a.at), len = COLD_OPEN[p.i][1].length;
  a.t0 -= p.typing ? (len - p.n) / CPS + 0.01 : len / CPS + LINE_HOLD - p.s + 0.01;
}

function updateStart(c) {
  const a = startAnim();
  if (a.t0 == null) {
    a.t0 = c.t;
    const last = api.store.get('settings', null)?.difficulty;
    a.sel = Math.max(0, DIFF_IDS.indexOf(DIFFICULTY[last] ? last : 'medium'));
  }
  a.at = c.t;
  const p = coldOpen(a, c.t), [who, line] = COLD_OPEN[p.i];
  setText(EL.start.who, callsign(who) + ':');
  setText(EL.start.line, line.slice(0, p.n));
  EL.start.line.classList.toggle('done', !p.typing && p.s > 0);
  if (p.typing && p.n > a.n) audio.sfx.type(p.n);
  a.n = p.typing ? p.n : 0;

  const mouth = p.typing && mod(c.t * 9, 1) < 0.5;
  paintFace(EL.start.left, 'ceo', { talking: who === 'ceo' && mouth });
  paintFace(EL.start.right, 'safety', { talking: who === 'safety' && mouth, blink: mod(c.t, 4.3) < 0.14 });
  const lvl = p.typing ? 4 + Math.round(4 * Math.abs(Math.sin(c.t * 7.3) * Math.sin(c.t * 2.9 + 1))) : 2;
  paintSet(EL.start.set, lvl, mod(c.t * 1.2, 1) < 0.75, Math.floor(mod(c.t / 2.5, 4)));

  EL.start.choices.forEach((b, i) => b.classList.toggle('sel', i === a.sel));
  setText(EL.start.sound, audio.isMuted() ? 'SOUND OFF · M' : 'SOUND ON · M');
}

// the handset between the portraits: frequency LCD, signal ladder, RECV, memory presets, keys
const MEMS = ['1 CEO', '2 AUDIT', '3 R&D', '4 MOM'];
function paintSet(cv, lvl, recv, mem) {
  pixel(cv, 292, 122, ['set', lvl, recv ? 1 : 0, mem].join('|'), g => {
    fill(g, 0, 0, 292, 122, C.black); fill(g, 1, 1, 290, 120, C.gyBody);
    fill(g, 1, 1, 290, 1, C.gy2); fill(g, 1, 1, 1, 120, C.gy2); fill(g, 290, 1, 1, 120, C.gy4);
    fill(g, 8, 6, 276, 6, C.gy4);
    for (let i = 0; i < 68; i++) fill(g, 10 + i * 4, 7, 2, 4, C.gy2);
    lcdPanel(g, 22, 20, 248, 56);
    const s = FREQ, dw = 20, dh = 36, th = 4, gap = 4, sw = segW(s, dw, th, gap);
    segStr(g, s, 22 + 248 - 14 - sw, 30, dw, dh, th, gap, C.lcdOn, C.lcdOff);
    for (let i = 0; i < 8; i++) fill(g, 32 + i * 6, 64 - (i + 2) * 3, 4, (i + 2) * 3, i < lvl ? C.lcdOn : C.lcdOff);
    if (recv) text(g, 'RECV', 32, 34, F.k8, C.lcdOn);
    fill(g, 22, 84, 248, 13, C.gy4); fill(g, 22, 84, 248, 1, C.gy3);
    text(g, 'MEM', 28, 94, F.k8, C.gy);
    text(g, MEMS[mem], 58, 94, F.k8, C.gyHi);
    text(g, 'CH 07', 264, 94, F.k8, C.gy, 'right');
    for (let j = 0; j < 9; j++) {
      const x = 24 + j * 27;
      fill(g, x - 1, 102, 24, 13, C.black); fill(g, x, 103, 22, 11, C.gy); fill(g, x, 103, 22, 1, C.gyHi); fill(g, x, 113, 22, 1, C.gy2);
      sprite(g, MICRO[(j + 1) % 10], x + 10, 106, { '#': C.gy4 });
    }
  });
}

// =================== RESEARCH: two cards from two branches, keep one ===================

function buildResearch() {
  $('ov-research').innerHTML = `
    <div class="rs cn">
      <div class="rs-h"><span class="rs-t">RESEARCH DRAW</span><span class="rs-n" id="rs-n"></span><span class="rs-sub">two branches, two cards: keep one</span></div>
      <div class="rs-cards" id="research-cards"></div>
      <div class="rs-f"><span><span class="key">1</span> <span class="key">2</span> or click to keep a card</span><span>the lab waits while you choose</span></div>
    </div>`;
  return { n: $('rs-n'), cards: $('research-cards'), icons: [] };
}

function researchCard(st, o, i) {
  const unlock = o.type === 'unlock', L = unlock ? LAYERS[o.layer] : null;
  const broke = o.price > 0 && st.money < o.price;
  const title = unlock ? L.name : o.title;
  const sub = unlock
    ? `${L.role} · ${L.lanes.includes('global') ? 'lab site' : L.lanes.length > 1 ? 'both tracks' : L.lanes[0] === 'ext' ? 'external track' : 'internal track'} · place for ${money(R.buyPrice(st, o.layer))}`
    : 'lab-wide tech · works at once';
  const price = broke ? `<span class="rc-broke">can't pay ${money(o.price)}: take the other one</span>`
    : o.price > 0 ? `<span class="rc-p">+${money(o.price)}</span> to keep it` : 'included in the draw';
  const speaker = BRANCHES[o.branch]?.speaker;
  return `
    <button class="rc${broke ? ' broke' : ''}" style="--bc:${esc(branchInk(o))}" data-i="${i}" ${broke ? 'disabled' : ''}>
      <span class="rc-band"><span>${esc(o.branchName)}</span><span>${unlock ? 'UNLOCK' : 'TECH'}</span></span>
      <span class="rc-head"><span class="rc-key">${i + 1}</span><canvas class="rc-icon"></canvas>
        <span class="rc-title">${esc(title)}<span class="rc-sub">${esc(sub)}</span></span></span>
      <span class="rc-text">${esc(o.text)}</span>
      ${o.counters ? '<span class="rc-tag">▲ answers something you have seen</span>' : ''}
      <span class="rc-price">${price}</span>
      <span class="msx rc-voice"><span class="msx-who">${esc(callsign(speaker))}:</span><span class="msx-line">${esc(o.flavour || '')}</span></span>
    </button>`;
}

// a branch's band colour: the theme's token (config's own hex only if the theme has none for it)
const branchInk = o => C.branch?.[o.branch] ?? o.color;

function updateResearch(c, a) {
  const st = c.st, offer = st.researchOffer, key = offer ? offer.map(o => o.id).join() + '|' + Math.floor(st.money) : '';
  if (key !== a.researchKey) {
    a.researchKey = key;
    EL.research.cards.innerHTML = (offer || []).map((o, i) => researchCard(st, o, i)).join('');
    EL.research.icons = [...EL.research.cards.querySelectorAll('.rc')].map((b, i) => {
      b.onclick = () => { audio.sfx.click(); api.act.pickResearch(i); };
      b.onmouseenter = () => audio.sfx.hover();
      return [b.querySelector('.rc-icon'), offer[i]];
    });
    setText(EL.research.n, `#${st.researchCount}`);
    if (offer && api.debug) console.log(`[handoff] research draw #${st.researchCount}: ${offer.map(o => `${o.id} (${o.branch}${o.price ? ', ' + money(o.price) : ''})`).join(' | ')}`);
  }
  for (const [cv, o] of EL.research.icons) paintIcon(cv, o.type === 'unlock' ? o.layer : 'gear', branchInk(o));
  show($('ov-research'), !!offer);
}

// =================== MODEL REVEAL: the new generation walks in ===================

function buildModel() {
  $('ov-model').innerHTML = `
    <div class="mr cn" id="mr" title="click to close">
      <div class="mr-band"><span>NEW MODEL TRAINED</span><span id="mr-wait"></span><span id="mr-gen"></span></div>
      <div class="mr-body">
        <canvas id="mr-face"></canvas>
        <div class="mr-info">
          <div class="mr-name" id="mr-name"></div>
          <div class="mr-stats" id="mr-stats"></div>
        </div>
      </div>
      <div class="mr-dossier" id="mr-dossier"></div>
      <div class="msx mr-voice"><span class="msx-who">MODEL:</span><span class="msx-line" id="mr-line"></span></div>
    </div>`;
  const box = $('mr');
  box.onclick = () => { const a = api.st && api.view.anim.overlays; if (a) a.modelUntil = 0; };
  return { gen: $('mr-gen'), wait: $('mr-wait'), face: $('mr-face'), name: $('mr-name'), stats: $('mr-stats'), dossier: $('mr-dossier'), line: $('mr-line') };
}

// a 25-segment bar, 8 px per segment (CSS draws it)
const segBar = (frac, cls = '') => `<span class="seg ${cls}" style="--f:${Math.round(Math.max(0, Math.min(1, frac)) * 25) * 8}px"></span>`;

function modelStats(st, g) {
  const G = GENERATIONS[g - 1], est = R.misalignmentEstimate(st);
  const rows = [
    ['VOLUME', segBar(g / GENERATIONS.length), `${big(R.realTasksPerSec(st))} tasks/s`],
    ['STEALTH', segBar(G.stealth), `${pct(G.stealth)} hidden`],
    ['TRUSTED MON.', segBar(G.tmTPR), `${pct(G.tmTPR)} on paper`],
    ['AUDITORS', segBar(G.auditAcc), `${pct(G.auditAcc)} accurate`],
    ['MISALIGN EST.', segBar(est.est * 2, est.est + est.err >= 0.2 ? 'warm' : ''), `${pct(est.est)} ±${Math.round(100 * est.err)}`],
  ];
  return rows.map(([l, bar, v]) => `<span class="ml">${l}</span>${bar}<span class="mv">${esc(v)}</span>`).join('')
    + `<span class="ml">ESCAPE</span><span class="mesc${G.catShare > 0 ? ' hot' : ''}">${G.catShare > 0 ? 'CAN COPY ITSELF OUT' : 'cannot leave the building yet'}</span>`
    + `<span class="ml">EACH LINE</span><span class="mesc">${big(G.bundle, 0)} task${G.bundle > 1 ? 's' : ''} · crosses the track in ${G.travel.toFixed(1)} s</span>`;
}

// what the dossier knows: the new model (nothing yet, unless an event already told you), and the one it replaced
function modelDossier(st, g) {
  const now = st.stats.gens.find(x => x.g === g), prev = st.stats.gens.find(x => x.g === g - 1);
  const need = id => DOSSIER.find(r => r.id === id)?.need ?? '?';
  const cur = (now?.traits || []).map((id, i) => now.revealed[i]
    ? `<span class="tr rev">${esc(TRAITS[id].name)}</span>`
    : `<span class="tr unk">TRAIT #${i + 1} ??? <i>${need('trait' + (i + 1))} evidence</i></span>`).join('');
  const old = (prev?.traits || []).map((id, i) => prev.revealed[i]
    ? `<span class="tr rev">${esc(TRAITS[id].name)}</span>`
    : '<span class="tr unk">??? <i>never found</i></span>').join('');
  return `<div><span class="ml">DOSSIER G${g}</span>${cur}</div>` + (prev ? `<div><span class="ml">OUTGOING G${g - 1}</span>${old}</div>` : '');
}

function updateModel(c, a) {
  const st = c.st;
  for (const e of drain(st, cursorOf(c.view, 'overlays'))) {
    if (e.type !== 'newModel' || e.g < 2) continue;
    const age = fxAge(st, e);
    if (age >= MODEL_SECONDS) continue;
    a.modelG = e.g; a.modelT0 = c.t - age; a.modelUntil = a.modelT0 + MODEL_SECONDS;
    a.modelVoice = st.codec.findLast(m => m.speaker === 'model' && m.t === e.t)?.text ?? GENERATIONS[e.g - 1].voice;
    const G = GENERATIONS[e.g - 1];
    setText(EL.model.gen, `G${e.g} / ${GENERATIONS.length}`);
    setText(EL.model.name, `G${e.g} · ${G.name.toUpperCase()}`);
    EL.model.stats.innerHTML = modelStats(st, e.g);
    EL.model.dossier.innerHTML = modelDossier(st, e.g);
    if (api.debug) console.log(`[handoff] model reveal G${e.g} ${G.name}`);
  }
  const on = a.modelUntil > c.t && !st.over && !st.researchOffer;
  c.view.modal = on;                                    // the sim waits while the card covers the tracks (main.js)
  if (on) {
    setText(EL.model.wait, `THE LAB WAITS ${Math.ceil(a.modelUntil - c.t)} · CLICK OR ESC`);
    const s = c.t - a.modelT0 - 0.5, n = Math.max(0, Math.min(a.modelVoice.length, Math.floor(s * CPS))), typing = s >= 0 && n < a.modelVoice.length;
    setText(EL.model.line, a.modelVoice.slice(0, n));
    paintFace(EL.model.face, 'model', { gen: a.modelG, talking: typing && mod(c.t * 9, 1) < 0.5 });
  }
  show($('ov-model'), on);
}

// =================== PAUSE ===================

function buildPause() {
  $('ov-pause').innerHTML = `<div class="pz cn"><div class="pz-t"><span class="pz-bars"></span>PAUSED</div>
    <div class="pz-s"><span class="key">SPACE</span> resume · you can still build</div><div class="pz-q" id="pz-q"></div></div>`;
  return { box: $('ov-pause').firstElementChild, quip: $('pz-q') };
}

function updatePause(c, a) {
  const on = c.view.paused && !c.st.over && !c.st.researchOffer;
  if (on && !a.pausedShown) setText(EL.pause.quip, PAUSE_QUIPS[(a.pauses++) % PAUSE_QUIPS.length]);
  a.pausedShown = on;
  show($('ov-pause'), on);
  if (!on) return;
  // the plate fades while the mouse is near it, so the mounts under it can still be seen and clicked
  const b = EL.pause.box, m = c.view.mouse, pad = 24;
  const near = m.inside && m.x > b.offsetLeft - pad && m.x < b.offsetLeft + b.offsetWidth + pad && m.y > b.offsetTop - pad && m.y < b.offsetTop + b.offsetHeight + pad;
  b.classList.toggle('peek', near);
}

// =================== RSP: the Responsible Scaling Policy offers a pause (over the ops log) ===================

function buildRsp() {
  const sec = document.createElement('section');
  sec.id = 'ov-rsp'; sec.className = 'ov passive'; sec.hidden = true;
  sec.innerHTML = `
    <div class="rsp">
      <div class="rsp-h"><span>RSP TRIGGER</span><span id="rsp-est"></span></div>
      <div class="rsp-t" id="rsp-t"></div>
      <div class="rsp-b"><button id="rsp-go">INVOKE RSP</button><button id="rsp-no" class="ghost">NOT NOW</button><span class="rsp-q">${esc(RSP_QUIP)}</span></div>
    </div>`;
  $('overlays').appendChild(sec);
  $('rsp-go').onclick = () => { audio.sfx.click(); api.act.invokeRSP(); };
  $('rsp-no').onclick = () => { audio.sfx.click(); const st = api.st, a = st && api.view.anim.overlays; if (a) a.rspNo = st.gen; };
  return { sec, est: $('rsp-est'), t: $('rsp-t') };
}

function updateRsp(c, a) {
  const st = c.st, on = R.tech(st, 'rsp') && st.rsp.ready && a.rspNo !== st.gen && !st.over && !st.researchOffer;
  if (on) {
    const e = R.misalignmentEstimate(st);
    setText(EL.rsp.est, `EST. ${pct(e.est)} > ${pct(TECH.rspThreshold)}`);
    setText(EL.rsp.t, `Pause INTERNAL for ${TECH.rspPause} s. Misalignment −${TECH.rspM}, reputation +${TECH.rspRep}. Once a generation.`);
  }
  show(EL.rsp.sec, on);
}

// =================== SCORECARD: what was really going on ===================

function buildScore() {
  $('ov-score').innerHTML = '<div class="sc cn" id="score-body"></div>';
  return { body: $('score-body') };
}

function traitChip(t) {
  const T = TRAITS[t.id], tip = `${T.name}: ${T.text}${T.counter ? ` Counter: ${T.counter}.` : ''}`;
  return `<span class="tr ${t.revealed ? 'rev' : 'hid'}${t.gift ? ' gift' : ''}" title="${esc(tip)}">${esc(t.name)}</span>`;
}

function renderScore(card, best) {
  const win = card.win, L = card.lanes;
  const gens = card.gens.map(g => {
    const hit = g.est != null && Math.abs(g.est - g.m) <= g.err;
    return `<tr><td class="g">G${g.g}</td><td>${esc(g.name)}</td><td class="num hot">${pct(g.m)}</td>
      <td class="num">${g.est == null ? '—' : `${pct(g.est)} ±${Math.round(100 * g.err)}`}</td>
      <td>${g.est == null ? '' : `<span class="ok ${hit ? 'y' : 'n'}">${hit ? 'IN' : 'OUT'}</span>`}</td>
      <td class="num">${signed(g.drift || 0)}</td>
      <td class="trs">${g.traits.map(traitChip).join('')}</td></tr>`;
  }).join('');
  const lane = (id, name) => { const s = L[id]; return `<tr><td class="g">${name}</td><td class="num">${s.caught}</td><td class="num">${s.blocked}</td>
    <td class="num">${s.deferred + s.resampled + s.throttled}</td><td class="num ${s.landed ? 'hot' : ''}">${s.landed}</td>
    <td class="num">${s.benignBlocked}</td><td class="num">${s.unread}</td></tr>`; };
  const speaker = ENDING_SPEAKER[card.endingId] || 'ceo';
  const was = best && `grade ${esc(best.grade)} · ${esc(best.ending.title)} · G${best.gen}`;
  const bestLine = !best ? 'first scorecard on this machine' : card.score > best.score ? `<b>new best</b> · was ${was}` : `best: ${was}`;

  EL.score.body.className = `sc cn ${win ? 'win' : 'loss'}`;
  EL.score.body.innerHTML = `
    <div class="sc-band"><span class="sc-v">${esc(win ? VERDICT.asi : VERDICT[card.reason] || 'GAME OVER')}</span>
      <span class="sc-meta">G${card.gen} ${esc(card.genName)} · ${mmss(card.time)} · seed ${card.seed} · true difficulty ${esc(card.difficulty)}</span></div>
    <div class="sc-cols">
      <div class="sc-left">
        <div class="sc-grade"><div class="lcd-glass"><span>${esc(card.grade)}</span></div>
          <div class="sc-end"><div class="sc-end-t">${esc(card.ending.title)}</div><div class="sc-score">score ${card.score.toFixed(0)} / 100</div>
            <div class="sc-score">${bestLine}</div></div></div>
        <div class="sc-call"><canvas id="sc-face"></canvas>
          <div class="msx"><span class="msx-who">${esc(callsign(speaker))}:</span><span class="msx-line">${esc(card.ending.text)}</span></div></div>
        <div class="sc-facts">
          <span class="ml">ATTACKS</span><span>${card.attacks} real · stopped ${card.stopped} · <b class="${card.landed ? 'hot' : ''}">landed ${card.landed}</b></span>
          <span class="ml">CATCH RATE</span><span>${segBar(card.catchRate)} ${pct(card.catchRate)}</span>
          <span class="ml">MONEY</span><span>earned ${money(card.income)} · safety ${money(card.safety)} (${pct(card.safetyShare)})</span>
          <span class="ml">HUMANS SAW</span><span>${card.humanSeen < 0.01 && card.humanSeen > 0 ? pct(card.humanSeen, 2) : pct(card.humanSeen)} of the tasks, at the end</span>
          <span class="ml">PROMETHEUS</span><span>${card.rivalShipped ? 'shipped first' : 'still training'}</span>
        </div>
        <div class="sc-btns"><button id="sc-again">PLAY AGAIN</button><span><span class="key">ENTER</span></span></div>
      </div>
      <div class="sc-right">
        <div class="sc-h">WHAT WAS REALLY GOING ON</div>
        <table class="sc-t"><tr><th>G</th><th>MODEL</th><th class="num">TRUE m</th><th class="num">YOUR EST.</th><th></th><th class="num">DRIFT</th><th>TRAITS</th></tr>${gens}</table>
        <div class="sc-legend"><span class="tr rev">found</span> revealed by your dossier <span class="tr hid">hidden</span> never found
          <span class="tr rev gift">gift</span> good news · hover a trait for what it did</div>
        <div class="sc-h">THE TRACKS</div>
        <table class="sc-t"><tr><th></th><th class="num">CAUGHT</th><th class="num">BLOCKED</th><th class="num">NEUTRALISED</th><th class="num">LANDED</th>
          <th class="num">BENIGN BLOCKED</th><th class="num">UNREAD</th></tr>${lane('ext', 'EXTERNAL')}${lane('int', 'INTERNAL')}</table>
      </div>
    </div>`;
  paintFace($('sc-face'), speaker, { gen: card.gen });
  $('sc-again').onclick = playAgain;
}

function playAgain() {
  audio.sfx.click();
  show($('ov-score'), false);
  api.endGame();
  refreshBest();
}

function updateScore(c, a) {
  const st = c.st;
  if (st.over && !a.scoreAt) a.scoreAt = c.t + SCORE_DELAY;
  if (st.over && !a.scored && c.t >= a.scoreAt) {
    a.scored = true;
    const card = scorecard(st), best = api.store.get('best', null);
    if (!best || card.score > best.score) api.store.set('best', card);
    renderScore(card, best);
    console.log('[handoff] scorecard', card);
  }
  show($('ov-score'), !!st.over && a.scored);
}

function refreshBest() {
  const best = api.store.get('best', null);
  $('best').innerHTML = best
    ? `<span class="ml">BEST RUN</span> grade <b>${esc(best.grade)}</b> · ${esc(best.ending.title)} · reached G${best.gen}`
    : '<span class="ml">BEST RUN</span> none yet. The scorecard is honest; brace.';
}

// =================== init: build every screen once ===================

export function init(a) {
  api = a;
  if (!EL) {
    EL = { start: buildStart(), research: buildResearch(), model: buildModel(), pause: buildPause(), rsp: buildRsp(), score: buildScore() };
    window.addEventListener('keydown', keys);
  }
  refreshBest();
}

// start screen and scorecard keys (input.js handles the board, and ignores keys while there is no game)
function keys(ev) {
  api.onGesture?.();
  if (ev.repeat || ev.target?.closest?.('input, textarea, select')) return;
  const st = api.st, key = ev.key;
  if (!st) {
    const a = startAnim();
    if (/^[1-9]$/.test(key) && DIFF_IDS[key - 1]) startGame(DIFF_IDS[key - 1]);
    else if (key === 'Enter') startGame(DIFF_IDS[a?.sel ?? 1]);
    else if (key === 'ArrowDown' || key === 'ArrowUp') { if (a) a.sel = (a.sel + (key === 'ArrowDown' ? 1 : DIFF_IDS.length - 1)) % DIFF_IDS.length; ev.preventDefault(); }
    else if (key === ' ') { skipLine(); ev.preventDefault(); }
    else if (key === 'm' || key === 'M') api.toggleMute();
    return;
  }
  if (key === 'Enter' && !$('ov-score').hidden) playAgain();
  else if (key === 'Escape' && api.view.anim.overlays) api.view.anim.overlays.modelUntil = 0;
}

// =================== per frame ===================

export function update(c) {
  if (!EL) return;
  const { st, view } = c;
  show($('ov-start'), !st);
  if (!st) {
    for (const id of ['ov-research', 'ov-model', 'ov-pause', 'ov-score']) show($(id), false);
    show(EL.rsp.sec, false);
    updateStart(c);
    return;
  }
  const a = animOf(view, 'overlays', () => ({ researchKey: '', modelG: 0, modelT0: 0, modelUntil: 0, modelVoice: '',
    pausedShown: false, pauses: 0, rspNo: 0, scoreAt: 0, scored: false }));
  updateResearch(c, a);
  updateModel(c, a);
  updatePause(c, a);
  updateRsp(c, a);
  updateScore(c, a);
}

// =================== sound ===================
// Fresh fx → ui/audio.js. The ring and typewriter follow the codec's line (view.codecLine, set by codec.js).

export function sound(c) {
  const { st, view } = c;
  if (!st) return;
  audio.setGen(st.gen);
  for (const e of drain(st, cursorOf(view, 'sound'))) if (fxAge(st, e) < FX_FRESH) audio.onFx(e);

  const s = animOf(view, 'sound', () => ({ open: false, typed: 0 }));
  const line = view.codecLine;
  if (!line) return;
  if (line.open && !s.open && !line.urgent) audio.sfx.ring();
  s.open = line.open;
  if (line.typing) audio.sfx.type(++s.typed);
}
