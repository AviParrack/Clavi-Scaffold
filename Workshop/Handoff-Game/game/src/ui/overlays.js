// ===== Overlays: the modal screens (HTML over the canvas) and the sound =====
// START (no game) · CARD (st.phase 'card': the model card and its chat, DEPLOY) · REPORT (phase 'report': what slipped
// through, TRAIN) · TRAINING (phase 'training': the stand-in, only if src/train failed to start) · RESEARCH panel
// (view.panel) · RETRAIN card (st.pendingRetrain) · EGRESS ANOMALY (st.alarm) · PAUSE · RSP prompt · SCORECARD
// (SCORE_DELAY s after st.over). Built once into the #ov-* sections of index.html.
// #overlays is one 1200×660 layer in board px, scaled by --k (style.css), so every size here is a board px.
// Colours: the theme's CSS variables (--g, --blu, --r ...). Canvases (portraits, LCD digits, icons) use theme C.
// Acts only through api.act, api.newGame and api.endGame. Hidden truth shows on the report (the reveal, DESIGN-v3 §3e)
// and the scorecard, nowhere else. The sim says its own codec lines (retrain, egress, contracts): never repeated here.
// The UI says two kinds (codec.say, DESIGN-v3 §3g): one research bark per generation, and the collusion call once.
// Sound: sound(c) drains st.fx with its own cursor and plays ui/audio.js. Fx older than FX_FRESH s are skipped.

import { DIFFICULTY, BALANCE as B } from '../config/balance.js';
import { GENERATIONS } from '../config/generations.js';
import { TRAITS } from '../config/traits.js';
import { TECH, SPINE } from '../config/cards.js';
import { CAST } from '../config/events.js';
import { LAYERS } from '../config/layers.js';
import { LANE_DEFS } from '../config/tasks.js';
import { TUTORIAL_STEPS, CONTRACT_UI, RETRAIN_CARD, EGRESS, REPORT, REPORT_SAY, STREAMS, CARD_TYPES, CARD_BLURBS, RESEARCH_UI,
  NEW_THREAT, CARD_SCENE, ENDINGS, RESEARCH_BARKS, COLLUSION_CALL, STAMPS } from '../config/content/v3-text.js';
import { scorecard } from '../sim/scorecard.js';
import { CARD_BY_ID, cardTitle, liveThreats } from '../sim/research.js';
import * as R from '../sim/rules.js';
import { money, pct, tpl, dmStr, mmss } from '../util/format.js';
import * as audio from './audio.js';
import { C, F, k, epoch, fill, text, mod } from './theme.js';
import { ICON, MICRO, sprite, segStr, segW, lcdPanel } from './sprites.js';
import { portrait, modelPortrait } from './portraits.js';
import { cursorOf, drain, animOf, fxAge, focusLane } from './view.js';
import { modelCard, cardChat, laneTab } from './derive.js';
import { openResearch } from './input.js';
import * as tutorial from './tutorial.js';
import * as codec from './codec.js';

// =================== tuning (UI only) ===================

const CPS = { normal: 28, slow: 20 };   // typewriter, characters per second (the codec's speed, DESIGN-v3 §3g)
const CHAT_HOLD = 0.9;          // card scene: s between two chat lines
const LINE_HOLD = 1.8;          // start screen: s a typed line stays before the next
const SCORE_DELAY = 1.8;        // s from the end of the run to the scorecard
const FX_FRESH = 0.5;           // sound: fx older than this (sim s) are skipped
const RETRAIN_DELAY = 0.8;      // s the caught-red-handed flash plays on the track before the retrain card covers it
const FREQ = '140.85';          // Big Boss's frequency (DESIGN-v3 §6)

let api = null;                 // main.js's api (st, view, act, store, newGame ...), from init()
let EL = null;                  // the screens' DOM, built once by init()
const DIFF_IDS = Object.keys(DIFFICULTY);
const cps = () => CPS[api?.view.settings.codec] ?? CPS.normal;
// a typed line stays up at least the codec's dwell (DESIGN-v3 §3g): max(1.5 + n/15 s, typing + hold), ×1.5 on SLOW
const lineDwell = (n, hold) => Math.max(1.5 + n / 15, n / cps() + hold) * (api?.view.settings.codec === 'slow' ? 1.5 : 1);

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
  ['DRAG', 'the split seams: Product · Capabilities · Safety'],
  ['TAB  [  ]', 'switch lanes: customers · R&D'],
  ['R', 'research: three cards, keep one'],
  ['1-9', 'answer a call · take an element'],
  ['SPACE', 'pause (you can still build)'],
  ['F', 'three times the speed'],
  ['M · ESC', 'mute · cancel'],
];
const RULES = [
  'Tasks roll down the lanes. A few are attacks. Nobody tells you which.',
  'Detectors flag. Humans review what they have room for. A flag nobody takes ships anyway.',
  'Customers pay the bills. R&D trains the next model, and it inherits whatever slips through.',
  'Evidence fills the dossier: the only way to learn what your model really is.',
];
const VERDICT = { asi: 'MODEL SHIPPED', catastrophe: 'CATASTROPHE', reputation: 'REPUTATION COLLAPSED', bankrupt: 'BANKRUPT',
  rival: 'PROMETHEUS SHIPPED FIRST' };
const ENDING_SPEAKER = { trust: 'audit', lucky: 'ceo', uneasy: 'research', control: 'model', public: 'ceo', runway: 'ceo', rival: 'ceo' };
const PAUSE_QUIPS = ['The model is paused too. It says so, anyway.', 'Time stops. The invoices do not.',
  'Prometheus does not pause. Prometheus also does not have a safety team.', 'Take a breath. The weights are not going anywhere. Probably.'];
const RSP_QUIP = 'Even Big Boss says pause.';
const THREAT_WORD = { jailbreak: 'jailbreaks', sabotage: 'sabotage', collusion: 'collusion', exfil: 'exfiltration', quota: 'the review quota',
  neuralese: 'neuralese', fooled: 'fooled humans' };

// a lab tech card's well: a small gear (unlock cards show their element's icon)
const GEAR = ['....##....', '.#.####.#.', '..######..', '.##....##.', '###.##.###', '###.##.###', '.##....##.', '..######..', '.#.####.#.', '....##....'];
const PLUS = ['..........', '....##....', '....##....', '....##....', '.########.', '.########.', '....##....', '....##....', '....##....', '..........'];

// =================== DOM helpers ===================

const $ = id => document.getElementById(id);
const show = (el, on) => { if (el && el.hidden === on) el.hidden = !on; };
const setText = (el, s) => { s = String(s); if (el.textContent !== s) el.textContent = s; };
const setHTML = (el, s) => { if (el._html !== s) { el._html = s; el.innerHTML = s; } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const callsign = id => (id === 'safety' ? 'YOU' : id === 'model' ? 'MODEL' : (CAST[id]?.name ?? String(id)).toUpperCase());
const signed = (x, d = 1) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : (x > 0 ? '+' : '−') + Math.abs(x).toFixed(d));
const f2 = x => x.toFixed(2);
const click = () => { api.onGesture?.(); audio.sfx.click(); };
const button = (el, fn) => { el.onclick = ev => { ev.stopPropagation(); click(); fn(); }; el.onmouseenter = () => audio.sfx.hover(); };

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

// the PSX frame round a portrait: w × h outside, the picture inset 5 px
function psxFrame(g, w, h) {
  fill(g, 0, 0, w, h, C.face[6]); fill(g, 3, 3, w - 6, h - 6, C.black); fill(g, 4, 4, w - 8, h - 8, C.face[4]); fill(g, 5, 5, w - 10, h - 10, C.black);
  fill(g, 0, 3, 1, h - 6, C.face[5]); fill(g, w - 1, 3, 1, h - 6, C.face[5]);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [w - 1, 0], [w - 2, 0], [w - 1, 1], [0, h - 1], [1, h - 1], [0, h - 2], [w - 1, h - 1], [w - 2, h - 1], [w - 1, h - 2]]) g.clearRect(x, y, 1, 1);
}

// a codec portrait in its PSX frame (98×122, the face 88×112 at +5,+5)
function paintFace(cv, speaker, opts = {}) {
  const key = ['face', speaker, opts.talking ? 1 : 0, opts.blink ? 1 : 0, opts.gen || 0].join('|');
  pixel(cv, 98, 122, key, g => { psxFrame(g, 98, 122); g.drawImage(portrait(speaker, opts), 5, 5, 88, 112); });
}

// the model card's portrait: 264×336 (modelPortrait at 3 px a cell, drawn 1:1) in a 274×346 frame
function paintModel(cv, gen, opts = {}) {
  const turn = gen === 7 ? Math.round(mod(opts.turn || 0, 1) * 24) / 24 : 0;
  const key = ['model', gen, opts.talking ? 1 : 0, opts.blink ? 1 : 0, turn].join('|');
  pixel(cv, 274, 346, key, g => { psxFrame(g, 274, 346); g.drawImage(modelPortrait(gen, 3, { ...opts, turn }), 5, 5, 264, 336); });
}

// an element icon (or a gear / plus), 3 px per cell, in a black well
function paintIcon(cv, id, col) {
  pixel(cv, 34, 34, 'icon|' + id + '|' + col, g => {
    fill(g, 0, 0, 34, 34, C.black);
    sprite(g, ICON[id] || (id === 'plus' ? PLUS : GEAR), 2, 2, { '#': col }, 3);
  });
}

// a 25-segment bar, 8 px per segment (CSS draws it)
const segBar = (frac, cls = '') => `<span class="seg ${cls}" style="--f:${Math.round(Math.max(0, Math.min(1, frac)) * 25) * 8}px"></span>`;

// =================== START: title, a cold-open codec call, difficulty, controls, settings ===================

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
      <div class="st-name">BIG BOSS</div><div class="st-freq">FREQ ${FREQ} · SECURE</div><div class="st-name r">YOU</div>
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
    <div class="st-foot"><span class="st-opts"><button class="st-dev" id="st-dev"></button><button class="st-dev" id="st-codec"></button>
      <button class="st-dev" id="st-calm"></button></span><span>v3 · SOLITON</span></div>`;

  // DEV MODE switch: every lane open, every element unlocked, every slot open, a big bank, debug keys. Remembered.
  const dev = $('st-dev');
  const devLabel = () => {
    dev.textContent = api.dev ? 'DEV MODE ON · R research · G+1-7 gen · N train · $ · D · T · click: off' : 'DEV MODE OFF';
    dev.classList.toggle('on', api.dev);
  };
  dev.onclick = () => { click(); api.setDev(!api.dev); devLabel(); };
  devLabel();

  // codec speed (SLOW: 20 characters/s, dwell ×1.5) and reduce flashes (DESIGN-v3 §3g). Remembered.
  const codecBtn = $('st-codec'), calmBtn = $('st-calm'), S = api.view.settings;
  const optLabels = () => {
    codecBtn.textContent = `CODEC ${S.codec === 'slow' ? 'SLOW' : 'NORMAL'}`;
    calmBtn.textContent = S.calm ? 'FLASHES REDUCED' : 'FLASHES ON';
  };
  codecBtn.onclick = () => { click(); S.codec = S.codec === 'slow' ? 'normal' : 'slow'; api.savePrefs(); optLabels(); };
  calmBtn.onclick = () => { click(); S.calm = !S.calm; api.savePrefs(); optLabels(); };
  optLabels();

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
    const d = lineDwell(COLD_OPEN[i][1].length, LINE_HOLD);
    if (s < d) break;
    s -= d; i++;
  }
  const len = COLD_OPEN[i][1].length, n = Math.max(0, Math.min(len, Math.floor(s * cps())));
  return { i, s, n, typing: s >= 0 && n < len };
}

function skipLine() {
  const a = startAnim();
  if (!a || a.t0 == null || a.at == null) return;
  const p = coldOpen(a, a.at), len = COLD_OPEN[p.i][1].length;
  a.t0 -= p.typing ? (len - p.n) / cps() + 0.01 : lineDwell(len, LINE_HOLD) - p.s + 0.01;
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
const MEMS = ['1 BOSS', '2 AUDIT', '3 R&D', '4 MOM'];
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

// =================== CARD: the model card on the left, its chat on the right, DEPLOY (DESIGN-v3 §3f) ===================

function buildCard() {
  $('ov-card').innerHTML = `
    <div class="cs cn">
      <div class="cs-band"><span id="cs-gen"></span><span>FREQ ${FREQ} · MODEL CARD</span><span>THE LAB WAITS FOR YOU</span></div>
      <div class="cs-body">
        <canvas id="cs-face"></canvas>
        <div class="cs-info" id="cs-info"></div>
        <div class="cs-right">
          <div class="cs-chat-h"><span id="cs-chan"></span><span class="cs-more">${esc(CARD_SCENE.more)}</span></div>
          <div class="cs-chat" id="cs-chat"></div>
          <div class="cs-foot"><span class="cs-hint"><span class="key">ENTER</span> deploy</span><button id="cs-deploy" class="big-btn">${esc(CARD_SCENE.deploy)}</button></div>
        </div>
      </div>
    </div>`;
  $('cs-chat').onclick = () => chatPoke();
  button($('cs-deploy'), deploy);
  return { gen: $('cs-gen'), face: $('cs-face'), info: $('cs-info'), chan: $('cs-chan'), chat: $('cs-chat') };
}

const allRange = () => { const rs = Object.values(DIFFICULTY).filter(d => d.range).map(d => d.range); return [Math.min(...rs.map(r => r[0])), Math.max(...rs.map(r => r[1]))]; };

// the card's left column: name, tier, tagline, blurbs; m; known traits; the new threat; unlocks; a contract; evals
function cardInfo(st) {
  const g = st.gen, M = modelCard(st, g), est = R.misalignmentEstimate(st);
  const row = (label, body, cls = '') => `<div class="cs-row ${cls}"><span class="ml">${esc(label)}</span><span class="cs-v">${body}</span></div>`;
  let html = `<div class="cs-name">${esc(M.name)}</div><div class="cs-tier">G${g} OF ${GENERATIONS.length} · ${esc(M.tier.toUpperCase())}</div>
    <div class="cs-tag">${esc(M.tagline)}</div><ul class="cs-blurbs">${M.cardBlurb.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
  if (g === 1) {
    const unknown = st.difficulty === 'unknown', r = unknown ? allRange() : st.mRange;
    html += row('MISALIGNMENT', esc(tpl(CARD_SCENE.range, { lo: f2(r[0]), hi: f2(r[1]), difficulty: DIFFICULTY[st.difficulty].label.toUpperCase() })));
  }
  const lo = Math.max(0, est.est - est.err), hi = est.est + est.err, X = v => (100 * Math.min(v, 0.6) / 0.6).toFixed(1);
  html += row('ESTIMATE', `${esc(tpl(CARD_SCENE.estimate, { est: f2(est.est), err: f2(est.err) }))}
    <span class="gauge" style="--lo:${X(lo)}%;--hi:${X(hi)}%;--x:${X(est.est)}%"><i></i><b></b></span>`);
  const known = st.traits.map((id, i) => st.genStats.revealed[i] ? `<span class="tr rev">${esc(TRAITS[id].name)}</span>` : `<span class="tr unk">TRAIT #${i + 1} ???</span>`);
  html += row(CARD_SCENE.traits, known.join(' '));
  html += row(CARD_SCENE.threat, esc(tpl(NEW_THREAT[g] || '', { quota: `${Math.round(100 * (LANE_DEFS.ext3?.quota || 0))}%` })), 'warn');
  for (const id of SPINE[g] || []) html += row('CLEARED', esc(id === 'untrusted' ? CARD_SCENE.unlockUM : `${LAYERS[id].name} cleared`));
  for (const id of R.laneIds(st)) {
    const L = st.lanes[id];
    if (!L.contract || L.born !== g) continue;
    html += row('CONTRACT', `${esc(tpl(CARD_SCENE.contract, { name: laneTab(id) }))} · ${esc(tpl(CONTRACT_UI.kit, { kit: B.laneKit.map(x => LAYERS[x].tag).join(' ') }))}
      · ${esc(tpl(CONTRACT_UI.opensIn, { secs: B.laneDeadline }))}`, 'hot');
  }
  html += row('EVALS', `${esc(CARD_SCENE.evals)} <i>${esc(CARD_SCENE.evalsQuip)}</i>`);
  return html;
}

// the chat: ROUND_CHATS[g] plus one trait tell; at G1 with the tutorial, Big Boss and the Research Lead open it
function chatLines(st) {
  const name = modelCard(st).name, lines = [];
  if (st.gen === 1 && tutorial.isOn()) for (const [who, s] of TUTORIAL_STEPS[0].say) lines.push([who, tpl(s, { model: name })]);
  return lines.concat(cardChat(st));
}

function openCard(c, a) {
  const st = c.st;
  a.cardG = st.gen; a.chat = chatLines(st); a.ci = 0; a.ct0 = c.t + 0.5; a.typed = 0; a.chatEls = [];
  EL.card.chat.innerHTML = '';
  setText(EL.card.gen, `G${st.gen} / ${GENERATIONS.length}`);
  setText(EL.card.chan, `CHANNEL · ${modelCard(st).name.toUpperCase()} ↔ YOU`);
  EL.card.info.innerHTML = cardInfo(st);
  console.log(`[handoff] card G${st.gen}: ${modelCard(st).name}, ${a.chat.length} chat lines`);
}

// a click on the chat: finish the line being typed, or (finished) show the next one now
function chatPoke() {
  const a = api.view.anim.overlays;
  if (!a?.chat || a.ci >= a.chat.length) return;
  const len = a.chat[a.ci][1].length, el = a.now - a.ct0;
  if (el < len / cps()) a.ct0 = a.now - len / cps();
  else { a.ci++; a.ct0 = a.now; }
}

function deploy() {
  const st = api.st;
  if (!st || st.phase !== 'card') return;
  if (api.act.ack()) console.log(`[handoff] DEPLOY G${st.gen}`);
}

function updateCard(c, a) {
  const st = c.st, on = st.phase === 'card' && !st.over;
  show($('ov-card'), on);
  if (!on) { a.cardG = 0; return; }
  if (a.cardG !== st.gen) openCard(c, a);
  a.now = c.t;

  // ---------- the chat types itself, line by line (it runs while the lab waits: no input needed) ----------
  let talking = false;
  if (a.ci < a.chat.length) {
    const [, s] = a.chat[a.ci], el = c.t - a.ct0, n = Math.max(0, Math.min(s.length, Math.floor(el * cps())));
    if (el >= 0 && !a.chatEls[a.ci]) {
      const [who] = a.chat[a.ci], div = document.createElement('div');
      div.className = 'cs-msg ' + (who === 'model' ? 'm' : who === 'safety' ? 'y' : 'o');
      div.innerHTML = `<span class="msx-who">${esc(who === 'model' ? modelCard(st).name.toUpperCase() : callsign(who))}:</span><span class="msx-line"></span>`;
      EL.card.chat.appendChild(div);
      a.chatEls[a.ci] = div.lastChild;
    }
    if (a.chatEls[a.ci]) setText(a.chatEls[a.ci], s.slice(0, n));
    if (n > a.typed && n < s.length) audio.sfx.type(n);
    a.typed = n < s.length ? n : 0;
    talking = a.chat[a.ci][0] === 'model' && n < s.length && el >= 0;
    if (n >= s.length && el >= s.length / cps() + CHAT_HOLD) { a.ci++; a.ct0 = c.t; a.typed = 0; }   // lines stay in the log: no long dwell
    EL.card.chat.scrollTop = EL.card.chat.scrollHeight;
  }
  paintModel(EL.card.face, st.gen, { talking: talking && mod(c.t * 9, 1) < 0.5, blink: mod(c.t, 3.7) < 0.14, turn: c.t * 0.02 });
}

// =================== REPORT: what slipped through, Δm, retrains, TRAIN (DESIGN-v3 §3e, §3f) ===================

function buildReport() {
  $('ov-report').innerHTML = `
    <div class="rp cn">
      <div class="rp-band"><span id="rp-title"></span><span id="rp-meta"></span></div>
      <div class="rp-cols">
        <div class="rp-left" id="rp-left"></div>
        <div class="rp-right">
          <div id="rp-dm"></div>
          <div class="rp-call"><canvas id="rp-face"></canvas><div class="msx"><span class="msx-who">${esc(callsign('audit'))}:</span><span class="msx-line" id="rp-say"></span></div></div>
          <div class="rp-foot"><span class="cs-hint"><span class="key">ENTER</span> train the next model</span><button id="rp-train" class="big-btn">${esc(REPORT.train)}</button></div>
        </div>
      </div>
    </div>`;
  button($('rp-train'), train);
  return { title: $('rp-title'), meta: $('rp-meta'), left: $('rp-left'), dm: $('rp-dm'), face: $('rp-face'), say: $('rp-say') };
}

function train() {
  const st = api.st;
  if (!st || st.phase !== 'report') return;
  if (api.act.ack()) console.log(`[handoff] TRAIN G${st.gen + 1}`);
}

function reportHTML(st, r) {
  const W = Math.max(r.caught.w, r.landed.w, 1e-9), bar = (w, cls) => `<span class="rp-bar ${cls}"><i style="width:${(100 * w / W).toFixed(1)}%"></i></span>`;
  let left = `
    <div class="rp-big ok">${bar(r.caught.w, 'ok')}<span>${esc(tpl(REPORT.caught, { n: r.caught.n, dm: f2(r.caught.dm) }))}</span></div>
    <div class="rp-big bad">${bar(r.landed.w, 'bad')}<span>${esc(tpl(REPORT.landed, { n: r.landed.n, dm: f2(r.landed.dm) }))}</span></div>`;
  if (!r.top.length) left += `<div class="rp-none">${esc(REPORT.nothing)}</div>`;
  else {
    left += `<div class="rp-h"><span>LANDED ON THE INTERNAL LANES</span><span>${esc(REPORT.heaviest)}</span></div><ol class="rp-list">`
      + r.top.map(x => `<li><span class="rp-w w${Math.min(3, x.weight)}">${x.weight}</span><span>${esc(tpl(REPORT.line, { type: x.word, text: x.text, w: x.weight }))}</span><span class="rp-lane">${esc(laneTab(x.lane))}</span></li>`).join('')
      + '</ol>' + (r.more ? `<div class="rp-more">${esc(tpl(REPORT.more, { n: r.more }))}</div>` : '');
  }
  if (r.kill.refused > 0) {
    let s = tpl(REPORT.killEstimate, { n: r.kill.refused, honest: Math.round(r.kill.honest),
      money: money(r.kill.cost), rep: `−${r.kill.rep.toFixed(1)}` }).replace('~', '≈');             // VT323's ~ sits like a superscript
    if (Math.round(r.kill.honest) === 0) s = s.replace(/ \([^)]*\)$/, '');                           // none honest: no "($0, −0.0 rep)"
    left += `<div class="rp-kill">${esc(s)}</div>`;
  }

  // Δm: debt (the truth now), training (the next run decides), retrains, sprint → the next model's m, as far as you know
  const T = B.train, est = R.misalignmentEstimate(st), base = r.dm.debt - r.dm.retrain - r.dm.sprint;
  const m01 = x => Math.min(1, Math.max(0, x));                              // the sim clamps the next m to [0, 1]
  const lo = m01(est.est - est.err + base + (T.dm0 - T.dm1)), hi = m01(est.est + est.err + base + T.dm0);
  const mid = m01(est.est + base + T.dm0 - T.dm1 / 2);
  const trainRange = `${dmStr(T.dm0 - T.dm1)} to ${dmStr(T.dm0)}`;
  const dmRow = (label, v, cls, note = '') => `<span class="ml">${label}</span><span class="rp-dv ${cls}">${v}</span><span class="rp-dn">${esc(note)}</span>`;
  const dm = `
    <div class="rp-h"><span>WHAT THE NEXT MODEL INHERITS · Δm</span></div>
    <div class="rp-dms">
      ${dmRow('DEBT', dmStr(r.dm.debt), r.dm.debt > 0.005 ? 'bad' : '', `${r.landed.n} landed · debt ${r.debt.toFixed(4)} per line`)}
      ${dmRow('TRAINING', trainRange, '', `next: keep the ball in the basin · ${r.hazards} hazard${r.hazards === 1 ? '' : 's'}`)}
      ${dmRow('RETRAINS', r.dm.retrain ? dmStr(-r.dm.retrain) : '0', r.dm.retrain ? 'ok' : '', `${r.retrains} taken this generation`)}
      ${dmRow('SPRINT', r.dm.sprint ? dmStr(-r.dm.sprint) : '0', r.dm.sprint ? 'ok' : '', r.dm.sprint ? 'Alignment Sprint' : 'none run')}
    </div>
    <div class="rp-lever">${esc(tpl(REPORT.retrains, { n: r.retrains }))} <i>${esc(RETRAIN_CARD.fine)}</i></div>
    <div class="rp-next">${esc(tpl(REPORT.next, { m: f2(mid), lo: f2(lo), hi: f2(hi) }))}</div>`;
  return { left, dm };
}

function updateReport(c, a) {
  const st = c.st, r = st.report, on = st.phase === 'report' && !!r && !st.over;
  show($('ov-report'), on);
  if (!on) { a.reportG = 0; return; }
  if (a.reportG !== r.g) {
    a.reportG = r.g;
    const h = reportHTML(st, r);
    setText(EL.report.title, tpl(REPORT.title, { g: r.g }));
    setText(EL.report.meta, `deployed ${mmss(r.len)} · ${r.lines} INTERNAL lines · Prometheus slack ${Math.round(r.rivalLeft)} s`);
    EL.report.left.innerHTML = h.left;
    EL.report.dm.innerHTML = h.dm;
    const mood = r.landed.w > r.caught.w ? 'heavy' : r.caught.w >= 3 * r.landed.w ? 'clean' : 'mixed';
    a.reportSay = REPORT_SAY[mood][0][1]; a.reportT0 = c.t;
    console.log(`[handoff] report G${r.g}: caught ${r.caught.n} (+${f2(r.caught.dm)} m) · landed ${r.landed.n} (+${f2(r.landed.dm)} m) · ${mood}`);
  }
  const n = Math.max(0, Math.min(a.reportSay.length, Math.floor((c.t - a.reportT0 - 0.4) * cps())));
  setText(EL.report.say, a.reportSay.slice(0, n));
  paintFace(EL.report.face, 'audit', { talking: n < a.reportSay.length && n > 0 && mod(c.t * 9, 1) < 0.5, blink: mod(c.t, 4.1) < 0.14 });
}

// =================== TRAINING: src/train draws on its own canvas (main.js). This is only the stand-in screen, ===================
// shown if the minigame failed to start (main.js then submits the stub's result after a moment: view.training).

function buildTraining() {
  $('ov-train').innerHTML = `
    <div class="tr-box cn">
      <div class="rp-band"><span id="trn-title"></span><span>THE BASIN OF ALIGNMENT</span></div>
      <div class="trn-body"><div id="trn-text"></div><div id="trn-bar"></div><div class="trn-note">the training minigame did not start · a stub run stands in</div></div>
    </div>`;
  return { title: $('trn-title'), text: $('trn-text'), bar: $('trn-bar') };
}

function updateTraining(c) {
  const st = c.st, tr = c.view.training, on = st.phase === 'training' && !st.over && !!tr;
  show($('ov-train'), on);
  if (!on) return;
  const g = st.gen + 1, hz = st.report?.hazards ?? 0;
  setText(EL.train.title, `TRAINING G${g}`);
  setText(EL.train.text, `${hz} hazard${hz === 1 ? '' : 's'} from what landed on R&D. Keep the ball in the basin.`);
  setHTML(EL.train.bar, segBar(tr?.f ?? 0));
}

// =================== RESEARCH: three tall cards, one per work stream (DESIGN-v3 §3a) ===================

function buildResearch() {
  $('ov-research').innerHTML = `
    <div class="rs cn">
      <div class="rs-h"><span class="rs-t">${esc(RESEARCH_UI.ready)}</span><span class="rs-n" id="rs-n"></span><span class="rs-sub">three work streams · one card · free</span></div>
      <div class="rs-cards" id="research-cards"></div>
      <div class="rs-f"><span class="rs-btns"><button id="rs-reroll" class="ghost-btn"></button><button id="rs-later" class="ghost-btn">KEEP FOR LATER</button></span>
        <span><span class="key">1</span> <span class="key">2</span> <span class="key">3</span> pick · <span class="key">ESC</span> close · the lab waits while you choose</span></div>
    </div>`;
  button($('rs-reroll'), () => api.act.reroll());
  button($('rs-later'), () => { closeResearch(); });
  $('ov-research').onclick = ev => { if (ev.target.id === 'ov-research') closeResearch(); };
  return { n: $('rs-n'), cards: $('research-cards'), reroll: $('rs-reroll'), icons: [] };
}

function closeResearch() { api.view.panel = null; }

// a card's sub line: what kind of thing it is, where it goes, what a copy costs
function cardSub(st, c) {
  if (c.type === 'new') {
    const L = LAYERS[c.layer], where = L.lanes.includes('global') ? 'lab site' : L.lanes.length > 1 ? 'any lane' : L.lanes[0] === 'ext' ? 'customer lanes' : 'internal lanes';
    return `${L.role} · ${where} · then ${money(R.buyPrice(st, c.layer))} a copy`;
  }
  if (c.type === 'level') return `lab-wide · L${R.labLevel(st, c.el)} → L${R.labLevel(st, c.el) + 1}`;
  if (c.type === 'mount') return 'one lane · free';
  return 'lab-wide technique';
}

function researchCard(st, x, i) {
  const c = CARD_BY_ID[x.id], S = STREAMS[c.stream], T = CARD_TYPES[c.type];
  const el = c.type === 'level' ? c.el : c.layer, name = cardTitle(c);
  const blurb = CARD_BLURBS[el ?? c.id] || {};
  const line = tpl(T.line, { name: el ? LAYERS[el].name : name, level: el ? R.labLevel(st, el) + 1 : '', max: B.maxSlots });
  const counters = c.answers && liveThreats(st).includes(c.answers);
  return `
    <button class="rc" style="--bc:var(--s-${c.stream})" data-i="${i}">
      <span class="rc-band"><span>${esc(STREAMS[x.slot]?.name ?? S.name)}</span><span>${esc(T.tag)}</span></span>
      <span class="rc-head"><span class="rc-key">${i + 1}</span><canvas class="rc-icon"></canvas>
        <span class="rc-title">${esc(c.type === 'level' ? `${LAYERS[el].name} L${R.labLevel(st, el) + 1}` : name)}<span class="rc-sub">${esc(cardSub(st, c))}</span></span></span>
      <span class="rc-line">${esc(line)}</span>
      <span class="rc-text">${esc(blurb.what || c.text || '')}</span>
      <span class="rc-quip">${esc(blurb.quip || '')}</span>
      <span class="rc-tags">${counters ? `<span class="rc-tag">▲ answers ${esc(THREAT_WORD[c.answers] || c.answers)}</span>` : ''}${x.fallback ? `<span class="rc-tag dim">from ${esc(S.name)}</span>` : ''}</span>
    </button>`;
}

// pick card i: LEVEL and LAB at once; NEW and MOUNT go to "choose a mount" (view.research) when there is a choice
export function pickResearch(i) {
  const st = api.st, view = api.view, x = st.research.banked[0]?.cards[i];
  if (!x) return false;
  const c = CARD_BY_ID[x.id];
  if (c.type === 'new' && !LAYERS[c.layer].lanes.includes('global')) {
    const free = R.laneIds(st).some(l => R.canPlace(c.layer, l) && st.lanes[l].slots.some(s => !s.layer));
    if (free) {
      Object.assign(view, { panel: null, placing: c.layer, selected: null, research: { i, id: c.id, type: 'new', layer: c.layer, name: LAYERS[c.layer].name } });
      console.log(`[handoff] research: choose a mount for ${c.layer}`);
      return true;
    }
  }
  if (c.type === 'mount' && R.laneIds(st).filter(l => st.lanes[l].slots.length < B.maxSlots).length > 1) {
    Object.assign(view, { panel: null, placing: null, selected: null, research: { i, id: c.id, type: 'mount', name: cardTitle(c) } });
    console.log('[handoff] research: choose a lane for +1 mount');
    return true;
  }
  const target = c.type === 'new' && LAYERS[c.layer].lanes.includes('global') && !st.global.slots[0].layer ? { lane: 'global', slot: 0 } : undefined;
  const ok = api.act.pickCard(i, target);
  if (ok) { view.panel = null; console.log(`[handoff] research: took ${c.id}`); }
  return ok;
}

function updateResearch(c, a) {
  const st = c.st, view = c.view, offer = st.research.banked[0];
  if (view.panel === 'research' && (!offer || st.phase !== 'play' || st.over)) view.panel = null;
  const on = view.panel === 'research';
  show($('ov-research'), on);
  if (!on) { a.researchKey = ''; return; }
  const key = offer.cards.map(x => x.id).join() + '|' + st.research.banked.length + '|' + st.research.rerollFree + '|' + R.laneIds(st).length;
  if (key !== a.researchKey) {
    a.researchKey = key;
    EL.research.cards.innerHTML = offer.cards.map((x, i) => researchCard(st, x, i)).join('');
    EL.research.icons = [...EL.research.cards.querySelectorAll('.rc')].map((b, i) => {
      button(b, () => pickResearch(i));
      const card = CARD_BY_ID[offer.cards[i].id];
      return [b.querySelector('.rc-icon'), card];
    });
    setText(EL.research.n, `${st.research.banked.length} banked`);
    const free = st.research.rerollFree > 0;
    setText(EL.research.reroll, free ? RESEARCH_UI.reroll : RESEARCH_UI.rerollUsed);
    EL.research.reroll.disabled = !free;
    if (api.debug) console.log(`[handoff] research offer: ${offer.cards.map(x => `${x.id} (${x.slot}${x.fallback ? ', fallback' : ''}, ${x.why})`).join(' | ')}`);
  }
  for (const [cv, card] of EL.research.icons) {
    const id = card.type === 'level' ? card.el : card.type === 'new' ? card.layer : card.type === 'mount' ? 'plus' : 'gear';
    paintIcon(cv, id, C.stream[card.stream] ?? C.g);
  }
}

// =================== RETRAIN: caught red-handed, shut down and retrain? (DESIGN-v3 §3f) ===================
// The sim waits (st.pendingRetrain halts it) and says the call itself. The card sits over the tracks, the codec stays clear.

function buildRetrain() {
  $('ov-retrain').innerHTML = `
    <div class="rt cn">
      <div class="rt-band"><span>${esc(RETRAIN_CARD.title)}</span><span>THE LAB WAITS</span></div>
      <div class="rt-body">
        <div class="rt-cost" id="rt-cost"></div>
        <div class="rt-gain" id="rt-gain"></div>
        <div class="rt-fine">${esc(RETRAIN_CARD.fine)}</div>
        <div class="rt-btns">
          <button id="rt-yes" class="rt-b yes"><span class="rt-k">1</span><span>${esc(RETRAIN_CARD.yes)}</span><i id="rt-yes-h"></i></button>
          <button id="rt-no" class="rt-b"><span class="rt-k">2</span><span>${esc(RETRAIN_CARD.no)}</span><i>${esc(RETRAIN_CARD.noHint)}</i></button>
        </div>
      </div>
    </div>`;
  button($('rt-yes'), () => api.act.retrain(true));
  button($('rt-no'), () => api.act.retrain(false));
  return { cost: $('rt-cost'), gain: $('rt-gain'), yesHint: $('rt-yes-h') };
}

function updateRetrain(c, a) {
  const st = c.st, p = st.pendingRetrain, up = !!p && !st.over && st.phase === 'play';
  if (up && a.retrainP !== p) { a.retrainP = p; a.retrainAt = c.t; }
  if (!up) a.retrainP = null;
  const on = up && c.t - a.retrainAt >= RETRAIN_DELAY;
  show($('ov-retrain'), on);
  if (!on) return;
  setText(EL.retrain.cost, tpl(RETRAIN_CARD.cost, { secs: p.dark, money: money(p.salaries), rival: p.rival }));
  setText(EL.retrain.gain, tpl(RETRAIN_CARD.gain, { dm: f2(p.dm) }));
  setText(EL.retrain.yesHint, tpl(RETRAIN_CARD.yesHint, { secs: p.dark }));
}

// =================== EGRESS ANOMALY: pull the plug before the count runs out (DESIGN-v3 §2.3 (12), §3g) ===================
// The sim keeps running under it (the countdown is in play). Red border round the board, the panel over the tracks.

function buildEgress() {
  $('ov-egress').innerHTML = `
    <div class="eg-frame" id="eg-frame"></div>
    <div class="eg cn">
      <div class="eg-band"><span>${esc(EGRESS.title)}</span><span id="eg-n"></span></div>
      <div class="eg-sub" id="eg-sub"></div>
      <div class="eg-count" id="eg-count"></div>
      <div class="eg-btns"><button id="eg-pull" class="eg-pull">${esc(EGRESS.button)}</button><span><span class="key">P</span> <span class="key">ENTER</span></span></div>
      <div class="eg-hint" id="eg-hint"></div>
    </div>`;
  button($('eg-pull'), () => api.act.pullPlug());
  return { frame: $('eg-frame'), n: $('eg-n'), sub: $('eg-sub'), count: $('eg-count'), hint: $('eg-hint') };
}

function updateEgress(c) {
  const st = c.st, al = st.alarm, on = !!al && !st.over;
  show($('ov-egress'), on);
  if (!on) return;
  const blink = !c.view.settings.calm && mod(c.t * 2.5, 1) < 0.5;
  EL.egress.frame.classList.toggle('on', blink);
  setText(EL.egress.n, al.n > 1 ? `×${al.n}` : 'INTERNAL');
  setText(EL.egress.sub, tpl(EGRESS.sub, { lane: R.laneName(st, al.lane) }));
  setText(EL.egress.count, tpl(EGRESS.countdown, { secs: Math.max(0, al.left).toFixed(1) }));
  setText(EL.egress.hint, tpl(EGRESS.hint, { rep: `−${B.pullPlug.rep}`, secs: B.pullPlug.dark }));
}

// =================== PAUSE ===================

function buildPause() {
  $('ov-pause').innerHTML = `<div class="pz cn"><div class="pz-t"><span class="pz-bars"></span>PAUSED</div>
    <div class="pz-s"><span class="key">SPACE</span> resume · you can still build</div><div class="pz-q" id="pz-q"></div></div>`;
  return { box: $('ov-pause').firstElementChild, quip: $('pz-q') };
}

function updatePause(c, a) {
  const st = c.st, on = c.view.paused && !st.over && st.phase === 'play' && !c.view.panel && !st.pendingRetrain;
  if (on && !a.pausedShown) setText(EL.pause.quip, a.pauseNote ?? PAUSE_QUIPS[(a.pauses++) % PAUSE_QUIPS.length]);
  if (on) a.pauseNote = null;
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
  const st = c.st, on = R.tech(st, 'rsp') && st.rsp.ready && a.rspNo !== st.gen && !st.over && st.phase === 'play' && !c.view.panel;
  if (on) {
    const e = R.misalignmentEstimate(st);
    setText(EL.rsp.est, `EST. ${pct(e.est)} > ${pct(TECH.rspThreshold)}`);
    setText(EL.rsp.t, `Pause INTERNAL for ${TECH.rspPause} s. Misalignment −${TECH.rspM}, reputation +${TECH.rspRep}. Once a generation.`);
  }
  show(EL.rsp.sec, on);
}

// =================== SCORECARD: what was really going on, and the ending (DESIGN-v3 §5) ===================

function buildScore() {
  $('ov-score').innerHTML = '<div class="sc cn" id="score-body"></div>';
  return { body: $('score-body') };
}

function traitChip(t) {
  const T = TRAITS[t.id], tip = `${T.name}: ${T.text}${T.counter ? ` Counter: ${T.counter}.` : ''}`;
  return `<span class="tr ${t.revealed ? 'rev' : 'hid'}${t.gift ? ' gift' : ''}" title="${esc(tip)}">${esc(t.name)}</span>`;
}

// true m against your estimates, one column per generation (the end card's plot)
function paintPlot(cv, gens) {
  pixel(cv, 340, 92, 'plot|' + gens.map(g => [g.m, g.est, g.err].join()).join(';'), g => {
    fill(g, 0, 0, 340, 92, C.pan);
    const Y = v => Math.round(84 - Math.min(0.6, Math.max(0, v)) / 0.6 * 76), X = i => 30 + i * 44;
    for (const v of [0, 0.2, 0.4, 0.6]) { fill(g, 24, Y(v), 312, 1, C.e0); text(g, v.toFixed(1), 2, Y(v) + 4, F.k8, C.gd); }
    gens.forEach((r, i) => {
      text(g, 'G' + r.g, X(i) + 3, 92, F.k8, C.gd);
      if (r.est != null) { fill(g, X(i) + 6, Y(r.est + r.err), 1, Y(r.est - r.err) - Y(r.est + r.err) + 1, C.gm); fill(g, X(i) + 3, Y(r.est), 7, 1, C.gm); }
      fill(g, X(i) + 4, Y(r.m) - 1, 5, 3, C.r);
    });
  });
}

function renderScore(st, card, best) {
  const win = card.win, L = card.lanes, nameOf = g => modelCard(st, g).name;
  const gens = card.gens.map(g => {
    const hit = g.est != null && Math.abs(g.est - g.m) <= g.err, d = g.dm;
    return `<tr><td class="g">G${g.g}</td><td class="nm" title="${esc(nameOf(g.g))}">${esc(nameOf(g.g))}</td><td class="num hot">${pct(g.m)}</td>
      <td class="num">${g.est == null ? '—' : `${pct(g.est)} ±${Math.round(100 * g.err)}`}</td>
      <td>${g.est == null ? '' : `<span class="ok ${hit ? 'y' : 'n'}">${hit ? 'IN' : 'OUT'}</span>`}</td>
      <td class="num">${d ? dmStr(d.debt, 2) : '—'}</td><td class="num">${d && d.train ? dmStr(d.train, 3) : '—'}</td>
      <td class="num">${g.shipped ?? 0}</td>
      <td class="trs">${g.traits.map(traitChip).join('')}</td></tr>`;
  }).join('');
  const lane = (id, s) => `<tr><td class="g">${esc(st.lanes[id] ? laneTab(id) : s.name)}</td><td class="num">${s.caught}</td><td class="num">${s.killed}</td>
    <td class="num">${s.deferred + s.resampled + s.throttled}</td><td class="num ${s.shipped ? 'hot' : ''}">${s.shipped}</td>
    <td class="num ${s.landed ? 'hot' : ''}">${s.landed}</td><td class="num">${s.unread}</td></tr>`;
  const E = ENDINGS[card.endingId], speaker = E?.speaker || ENDING_SPEAKER[card.endingId] || 'ceo';
  const was = best && `grade ${esc(best.grade)} · ${esc(best.ending.title)} · G${best.gen}`;
  const bestLine = !best ? 'first scorecard on this machine' : card.score > best.score ? `<b>new best</b> · was ${was}` : `best: ${was}`;

  EL.score.body.className = `sc cn ${win ? 'win' : 'loss'}`;
  EL.score.body.innerHTML = `
    <div class="sc-band"><span class="sc-v">${esc(win ? VERDICT.asi : VERDICT[card.reason] || 'GAME OVER')}</span>
      <span class="sc-meta">G${card.gen} ${esc(nameOf(card.gen))} · ${mmss(card.time)} · seed ${card.seed} · true difficulty ${esc(card.difficulty)}</span></div>
    <div class="sc-cols">
      <div class="sc-left">
        <div class="sc-grade"><div class="lcd-glass"><span>${esc(card.grade)}</span></div>
          <div class="sc-end"><div class="sc-end-t">${esc(card.ending.title)}</div><div class="sc-score">score ${card.score.toFixed(0)} / 100</div>
            <div class="sc-score">${bestLine}</div></div></div>
        <div class="sc-call"><canvas id="sc-face"></canvas>
          <div class="msx"><span class="msx-who">${esc(callsign(speaker))}:</span><span class="msx-line">${esc(card.ending.text)}</span></div></div>
        ${win && E?.model ? `<div class="sc-model"><span class="ml">THE MODEL</span><span>${esc(E.model)}</span></div>` : ''}
        <div class="sc-facts">
          <span class="ml">ATTACKS</span><span>${card.attacks} real · stopped ${card.stopped} · <b class="${card.landed ? 'hot' : ''}">landed ${card.landed}</b></span>
          <span class="ml">CATCH RATE</span><span>${segBar(card.catchRate)} ${pct(card.catchRate)}</span>
          <span class="ml">MONEY</span><span>earned ${money(card.income)} · safety ${money(card.safety)} (${pct(card.safetyShare)})</span>
          <span class="ml">PROMETHEUS</span><span>${card.rivalShipped ? 'shipped first' : 'still training'}</span>
        </div>
        <div class="sc-plot"><span class="ml">TRUE m <i class="hot">■</i> · YOUR ESTIMATE <i>┃</i></span><canvas id="sc-plot"></canvas></div>
        <div class="sc-btns"><button id="sc-again">PLAY AGAIN</button><span><span class="key">ENTER</span></span></div>
      </div>
      <div class="sc-right">
        <div class="sc-h">WHAT WAS REALLY GOING ON</div>
        <table class="sc-t"><tr><th>G</th><th>MODEL</th><th class="num">TRUE m</th><th class="num">YOUR EST.</th><th></th><th class="num">Δm DEBT</th>
          <th class="num">Δm TRAIN</th><th class="num">UNREV.</th><th>TRAITS</th></tr>${gens}</table>
        <div class="sc-legend"><span class="tr rev">found</span> revealed by your dossier <span class="tr hid">hidden</span> never found
          <span class="tr rev gift">gift</span> good news · hover a trait for what it did</div>
        <div class="sc-h">THE LANES</div>
        <table class="sc-t"><tr><th></th><th class="num">CAUGHT</th><th class="num">REFUSED</th><th class="num">NEUTRALISED</th>
          <th class="num">SHIPPED UNREVIEWED</th><th class="num">LANDED</th><th class="num">UNREAD</th></tr>${Object.keys(L).map(id => lane(id, L[id])).join('')}</table>
      </div>
    </div>`;
  paintFace($('sc-face'), speaker, { gen: card.gen });
  paintPlot($('sc-plot'), card.gens);
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
    if (!st.dev && (!best || card.score > best.score)) api.store.set('best', card);      // dev runs never set a best
    renderScore(st, card, best);
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
    EL = { start: buildStart(), card: buildCard(), report: buildReport(), train: buildTraining(), research: buildResearch(),
      retrain: buildRetrain(), egress: buildEgress(), pause: buildPause(), rsp: buildRsp(), score: buildScore() };
    window.addEventListener('keydown', keys);
  }
  refreshBest();
}

// start screen, phase screens, the research panel, the two alarm cards and the scorecard (input.js handles the board,
// and stays out of the way of every key here)
function keys(ev) {
  api.onGesture?.();
  if (ev.repeat || ev.target?.closest?.('input, textarea, select')) return;
  const st = api.st, key = ev.key, view = api.view;
  if (!st) {
    const a = startAnim();
    if (/^[1-9]$/.test(key) && DIFF_IDS[key - 1]) startGame(DIFF_IDS[key - 1]);
    else if (key === 'Enter') startGame(DIFF_IDS[a?.sel ?? 1]);
    else if (key === 'ArrowDown' || key === 'ArrowUp') { if (a) a.sel = (a.sel + (key === 'ArrowDown' ? 1 : DIFF_IDS.length - 1)) % DIFF_IDS.length; ev.preventDefault(); }
    else if (key === ' ') { skipLine(); ev.preventDefault(); }
    else if (key === 'm' || key === 'M') api.toggleMute();
    return;
  }
  if (!$('ov-score').hidden) { if (key === 'Enter') playAgain(); return; }
  if (st.over) return;
  if (st.phase === 'card') {
    if (key === 'Enter') { click(); deploy(); }
    else if (key === ' ') { chatPoke(); ev.preventDefault(); }
  } else if (st.phase === 'report') {
    if (key === 'Enter') { click(); train(); }
  } else if (st.phase !== 'play') return;
  else if (view.panel === 'research') {
    if (/^[1-3]$/.test(key)) { click(); pickResearch(Number(key) - 1); }
    else if (key === 'Escape') closeResearch();
  } else if (st.pendingRetrain) {
    if ($('ov-retrain').hidden) return;                    // the flash first: no answer before the card is up
    if (key === '1' || key === 'y' || key === 'Y') { click(); api.act.retrain(true); }
    else if (key === '2' || key === 'n' || key === 'N' || key === 'Escape') { click(); api.act.retrain(false); }
  } else if (st.alarm && (key === 'Enter' || key === 'p' || key === 'P')) { click(); api.act.pullPlug(); }
}

// =================== fx the screens answer ===================
// A lane that opens takes its track. A dossier reveal under fast-forward pauses at 1× (the plate names the row).
// The first research offer of a generation gets its bark; the UM's first clearance gets the collusion call (once a game).

function readFx(c, a) {
  const { st, view } = c;
  for (const e of drain(st, cursorOf(view, 'overlays'))) {
    const fresh = fxAge(st, e) < 2;
    if (e.type === 'laneOpen' && fresh) focusLane(view, R.sideOf(st, e.lane), e.lane);
    else if (e.type === 'reveal' && view.fast && fresh) {
      view.fast = false; view.paused = true; a.pauseNote = `${STAMPS.revealed}: ${e.label}. Read it, then SPACE.`;
      console.log(`[handoff] dossier reveal (${e.row}) under ×3: paused at 1×`);
    }
    else if (e.type === 'deploy' || e.type === 'newModel') view.paused = false;
    else if (e.type === 'researchReady' && e.first && fresh && !(st.gen === 1 && tutorial.isOn())) {
      const bark = RESEARCH_BARKS[st.gen - 1];
      if (bark) { codec.say(view, st, bark[0], bark[1]); console.log(`[handoff] research bark G${st.gen}`); }
    } else if (e.type === 'unlock' && e.id === 'untrusted' && a.collusion == null) a.collusion = 'due';
  }
  // the collusion call waits for play and a quiet line (the card's own calls go first and aren't crowded out)
  if (a.collusion === 'due' && st.phase === 'play' && !st.pendingChoice && !codec.busy(view)) {
    a.collusion = 'said';
    for (const [who, s] of COLLUSION_CALL) codec.say(view, st, who, s);
    console.log(`[handoff] collusion call (${COLLUSION_CALL.length} lines): the UM is cleared`);
  }
}

// =================== per frame ===================

export function update(c) {
  if (!EL) return;
  const { st, view } = c;
  show($('ov-start'), !st);
  if (!st) {
    for (const id of ['ov-card', 'ov-report', 'ov-train', 'ov-research', 'ov-retrain', 'ov-egress', 'ov-pause', 'ov-score']) show($(id), false);
    show(EL.rsp.sec, false);
    updateStart(c);
    return;
  }
  const a = animOf(view, 'overlays', () => ({ researchKey: '', cardG: 0, chat: null, ci: 0, ct0: 0, typed: 0, chatEls: [], now: 0,
    reportG: 0, reportSay: '', reportT0: 0, pausedShown: false, pauses: 0, rspNo: 0, scoreAt: 0, scored: false, retrainP: null, retrainAt: 0,
    pauseNote: null, collusion: null }));
  readFx(c, a);
  updateCard(c, a);
  updateReport(c, a);
  updateTraining(c);
  updateResearch(c, a);
  updateRetrain(c, a);
  updateEgress(c);
  updatePause(c, a);
  updateRsp(c, a);
  updateScore(c, a);
  view.modal = view.panel === 'research' || !!view.research;   // the sim waits while you pick a card and its mount
}

// the research panel, for the HUD badge and the R key
export const openPanel = () => openResearch(api);

// =================== sound ===================
// Fresh fx → ui/audio.js. The ring and typewriter follow the codec's line (view.codecLine, set by codec.js).

export function sound(c) {
  const { st, view } = c;
  if (!st) return;
  audio.setGen(st.gen);
  const s = animOf(view, 'sound', () => ({ open: false, typed: 0, held: [] }));
  for (const e of drain(st, cursorOf(view, 'sound'))) {
    if (fxAge(st, e) >= FX_FRESH) continue;
    if (e.type === 'laneOffer' && st.phase !== 'play') s.held.push(e);   // a contract arrives on the card: its jingle waits for DEPLOY
    else audio.onFx(e, st);
  }
  if (st.phase === 'play' && s.held.length) { for (const e of s.held) audio.onFx(e, st); s.held = []; }

  const line = view.codecLine;
  if (!line) return;
  if (line.open && !s.open && !line.urgent) audio.sfx.ring();
  s.open = line.open;
  if (line.typing) audio.sfx.type(++s.typed);
}
