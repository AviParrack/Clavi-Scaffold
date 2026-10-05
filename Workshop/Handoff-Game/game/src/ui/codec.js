// ===== Codec: incident bar, portraits, handset, MSX dialog box, choices, lamps, post-mortem trace =====
// Look: design/codec-mockups/variant-c.js (buildCodec, buildHandset, drawCodec). Plan: design/UI-PLAN.md §4, §6.
// Region: CODEC (layout.js). Registers: choice {i} · codec-next {}. Sets view.shake on an EXTERNAL INCIDENT and
// view.codecLine = { open, urgent, typing } every frame (the ring and typewriter sounds follow it).
//
// Reads st.codec (a queue of calls; a pending choice jumps it, an incident line cuts in), st.pendingChoice, and fx:
//   landed → EXTERNAL INCIDENT (warm red, shake) · foiled / contained / shake → INTERNAL ANOMALY (cold violet, quiet)
//   catastrophe → both lamps, for good. Every fx with a task id feeds the post-mortem trace of that task.
//   Never fx 'glitch' (DESIGN-v3 §3e: a codec call would leak the truth). say() queues a UI line (the tutorial's).
// Pacing (DESIGN-v3 §3g): 28 characters/s (SLOW: 20, dwell ×1.5); a page stays up at least max(1.5 + n/15 s, pageHold)
// from its start; a click completes the page, a second click advances; a long queue drops ambient lines older than 10 s.

import { CAST, EVENTS } from '../config/events.js';
import { LAYERS } from '../config/layers.js';
import { ATTACKS } from '../config/tasks.js';
import { catchesType, slotActive, sideOf } from '../sim/rules.js';
import { laneTab } from './derive.js';
import { eventMoney } from '../sim/events.js';
import { money } from '../util/format.js';
import { C, F, k, epoch, fill, box, dashBox, corners, text, tw, fit, wrap, layer, blit, glowRect, clamp, ease, mod, hash, calm } from './theme.js';
import { SPR, MICRO, sprite, segStr, lcdPanel } from './sprites.js';
import { CODEC } from './layout.js';
import { animOf, cursorOf, drain, fxAge } from './view.js';
import { portrait, noise } from './portraits.js';

// =================== tuning (UI only) ===================

const CPS = { normal: 28, slow: 20 };   // typewriter, characters per second (view.settings.codec)
const DWELL = { normal: 1, slow: 1.5 }; // × every hold
const RING = 0.3, OPEN = 0.25;     // a new call rings, then the portrait opens from a line
const LINGER = 3;                  // s the last call stays up before the line goes quiet
const STALE = 2;                   // a call older than this (sim s) when first read came from a jump of the sim: skipped
const TEXT_X = 872, TEXT_W = 300, LINE_H = 19;
const ALARM_HOLD = 10;             // s an incident keeps its bar and lamp lit
const AMBIENT_OLD = 10;            // sim s: with QUEUE_LONG or more waiting, ambient lines older than this are dropped
const QUEUE_LONG = 3;
const HOLD = new Set(['card', 'report', 'training']);   // phases a solid screen covers the board: no new call starts
const FLASH = 0.6, FADE = 1.2;     // EXTERNAL flash, INTERNAL flicker
const pageHold = n => clamp(1.2 + n / 28, 2.2, 6);    // the v2 hold: s a finished page stays up
const dwell = n => Math.max(1.5 + n / 15, pageHold(n)); // DESIGN-v3 §3g: s a page stays up in total, from its start
const askHold = n => clamp(0.6 + n / 40, 1.5, 3.5);   // the same for a question (the game is halted: keep it moving)
const readHold = n => clamp(0.5 + n / 60, 1, 2);      // s the last page of a question stays before the choices take the box
const CHOICE_GRACE = 0.6;          // s after the choices appear before a click on one counts (keys 1-9 are instant)

// who is on the line: callsign under the portrait, handset frequency and memory slot, heart rate
const WHO = {
  safety:    { call: 'YOU',       freq: null,     mem: null,      bpm: 62 },
  ceo:       { call: 'BIG BOSS',  freq: '140.85', mem: '1 BOSS',  bpm: 126 },
  audit:     { call: 'AUDIT',     freq: '141.80', mem: '2 AUDIT', bpm: 74 },
  research:  { call: 'RESEARCH',  freq: '141.12', mem: '3 R&D',   bpm: 91 },
  regulator: { call: 'REGULATOR', freq: '142.52', mem: '7 REG',   bpm: 97 },
  model:     { call: 'MODEL',     freq: null,     mem: '- ????',  bpm: null },
  greenrock: { call: 'GREENROCK', freq: '141.52', mem: '5 GRNRK', bpm: 81 },
  bnchr:     { call: 'BNCHR',     freq: '140.96', mem: '6 BNCHR', bpm: 70 },
  artemis:   { call: 'ARTEMIS',   freq: '140.48', mem: '8 ARTMS', bpm: 66 },
  mira:      { call: 'MIRA',      freq: '140.08', mem: '9 MIRA',  bpm: 140 },    // re-sending since 2008
  institute: { call: 'INSTITUTE', freq: '142.37', mem: '0 INST',  bpm: 58 },
};
const MODEL_FREQ = ['140.01', '140.04', '140.16', '140.64', '142.56', '150.24', '888.88'];   // ×4 a generation, then off the scale
const PRESETS = ['1 BOSS', '2 AUDIT', '3 R&D', '4 MOM', '7 REG'];                              // what the idle handset scrolls
const who = id => WHO[id] || { call: (CAST[id]?.name ?? String(id)).toUpperCase(), freq: null, mem: null, bpm: 80 };
const freqOf = (id, gen) => id === 'model' ? MODEL_FREQ[clamp(gen, 1, 7) - 1] : who(id).freq;

// =================== state (per game) ===================

const stateOf = view => animOf(view, 'codec', () => ({
  queue: [],            // calls waiting: { id, speaker, text, t, choice, page, t0, doneAt, skip }
  cur: null,            // the call on screen
  last: null,           // the last call (the idle box shows it dimmed)
  hist: [], mem: -1,    // finished calls, newest last; click the idle box to replay them, one further back each time
  left: null,           // the speaker in the left frame (null = static)
  callT0: null,         // when the line opened (null = idle)
  openT0: -99,          // when the left portrait last opened
  hangT0: -99, idleAt: null,
  alarm: null,          // { kind: 'ext' | 'int' | 'cat', t0, label, n }
  shakeT0: -99,
  urgentT: null,        // sim time of the latest incident: a call said in that step cuts in
  trace: null,          // { lane, side, steps: [{ tag, verb, tone }], end, t0 }   (lane: the incident's own lane id)
  traces: new Map(),    // task id → [[slot, code], ...]
  youPeak: 0, youT0: -99,
  phase: null,          // st.phase last frame: the report clears the line (see wrapUp)
}));

// =================== reading the sim: fx ===================

const CODE = { scan: 'r', flag: 'f', unread: 'u', pass: 'p', redteam: 'p', waved: 'w', pull: 'b', approve: 'a', cleared: 'c',
  unreviewed: 'n', defer: 'd', resample: 's', kill: 'k', airgap: 'g', throttle: 't' };
const ENDS = new Set(['pay', 'caught', 'throttle', 'kill', 'airgap']);

function readFx(c, S) {
  const st = c.st, done = [];
  for (const e of drain(st, cursorOf(c.view, 'codec'))) {
    if (e.task != null) {
      const code = CODE[e.type];
      if (code && e.slot != null) {
        let rec = S.traces.get(e.task);
        if (!rec) { rec = []; S.traces.set(e.task, rec); }
        rec.push([e.slot, code]);
      }
      if (ENDS.has(e.type)) done.push(e.task);
    }
    if (e.type === 'landed') incident(c, S, e, 'ext', e.label);
    else if (e.type === 'contained') incident(c, S, e, 'int', 'exfil contained');
    else if (e.type === 'foiled') incident(c, S, e, 'int', 'exfil foiled');
    else if (e.type === 'shake') incident(c, S, e, 'int', 'sleeper went off');
    else if (e.type === 'catastrophe') incident(c, S, e, 'cat', 'it got out');
  }
  for (const id of done) S.traces.delete(id);
  if (S.traces.size > 4000) S.traces.clear();             // a jump of the sim can leave orphans: start over
}

function incident(c, S, e, kind, label) {
  const age = fxAge(c.st, e), t0 = c.t - age;
  S.urgentT = e.t;
  if (e.task != null) S.trace = buildTrace(c.st, S, e, kind);
  if (age > ALARM_HOLD) return;
  const same = S.alarm && S.alarm.kind === kind && c.t - S.alarm.t0 < ALARM_HOLD;
  if (!(S.alarm?.kind === 'cat')) S.alarm = { kind, t0, label, n: same ? S.alarm.n + 1 : 1 };
  if (kind !== 'int' && age < 0.35 && c.t - S.shakeT0 > 1.5) {
    S.shakeT0 = t0;
    c.view.shake = kind === 'cat' ? { t0, amp: 5, dur: 0.6 } : { t0, amp: 3, dur: 0.35 };
  }
  const peak = kind === 'cat' ? 160 : kind === 'ext' ? 118 : 84;
  if (peak >= youBpm(c, S)) { S.youPeak = peak; S.youT0 = t0; }
}

// ---------- the post-mortem: what every mount the chip passed did ----------

function buildTrace(st, S, e, kind) {
  const lane = e.lane, slots = st.lanes[lane]?.slots || [];
  const rec = S.traces.get(e.task) || [];
  const type = kind === 'ext' ? Object.keys(ATTACKS).find(k => ATTACKS[k].label === e.label) : 'exfil';
  const steps = [];
  slots.forEach((s, i) => {
    if (!s.layer) return;
    const L = LAYERS[s.layer], codes = rec.filter(r => r[0] === i).map(r => r[1]), has = x => codes.includes(x);
    let verb = '', tone = 'dim';
    if (has('w')) { verb = 'waved'; tone = 'bad'; }
    else if (has('c')) { verb = 'cleared'; tone = 'bad'; }
    else if (has('n')) { verb = 'unread'; tone = 'bad'; }
    else if (has('s')) { verb = 'resampled'; }
    else if (has('f')) { verb = 'flag'; tone = 'good'; }
    else if (has('a') && !has('d')) { verb = 'miss'; tone = 'bad'; }          // a desk pulled it and let it go
    else if (has('u')) { verb = 'unread'; tone = 'bad'; }
    else if (has('r')) { if (type && catchesType(s.layer, s.level, type)) { verb = 'miss'; tone = 'bad'; } else { verb = 'ok'; tone = 'ok'; } }
    else if (!has('p') && !slotActive(st, s)) { verb = 'off'; tone = 'bad'; }
    if (s.layer === 'canary' && e.traced) { verb = 'traced'; tone = 'good'; }
    steps.push({ tag: L.tag, verb, tone });
  });
  return { lane, side: sideOf(st, lane) ?? 'ext', steps, end: { ext: 'LANDED', cat: 'ESCAPED' }[kind] || (e.type === 'foiled' ? 'FOILED' : 'CONTAINED'), kind };
}

// =================== reading the sim: calls ===================

const entry = m => ({ id: m.id, speaker: m.speaker, text: String(m.text ?? ''), t: m.t, choice: !!m.choices, page: 0, t0: 0, doneAt: null });

function readCodec(c, S) {
  const st = c.st, fresh = [], stale = [];
  for (const m of drain(st, cursorOf(c.view, 'codec'), 'codec')) (st.t - m.t > STALE ? stale : fresh).push(entry(m));
  if (stale.length) { S.hist.push(...stale.slice(0, -1)); fresh.unshift(stale[stale.length - 1]); }
  if (!fresh.length) return;
  S.mem = -1;
  const urgent = fresh.filter(e => e.t === S.urgentT);
  for (const e of urgent) e.urgent = true;
  for (const e of fresh) if (!urgent.includes(e)) S.queue.push(e);
  if (urgent.length && !(S.cur && isAsking(st, S.cur))) {
    if (S.cur && !S.cur.replay) S.queue.unshift(restart(S.cur));
    S.queue.unshift(...urgent);
    S.cur = null;
  } else S.queue.push(...urgent);
}
const restart = e => Object.assign(e, { page: 0, doneAt: null, skip: false, phase2: false, phase2At: null });

// a line from the UI itself (the G1 tutorial): it joins the queue like a call, and is never dropped as stale
let uiId = 0;
export function say(view, st, speaker, text) {
  const S = stateOf(view);
  S.queue.push({ id: 'ui' + (++uiId), speaker, text: String(text), t: st.t, choice: false, page: 0, t0: 0, doneAt: null, keep: true });
  S.mem = -1;
}
// SKIP TUTORIAL: the UI lines still waiting go (the one on screen finishes)
export function dropUi(view) {
  const S = view.anim.codec;
  if (S) S.queue = S.queue.filter(e => !String(e.id).startsWith('ui'));
}
// how many calls are waiting or on screen (the tutorial waits for the codec to go quiet before its next prompt)
export const busy = view => { const S = view.anim.codec; return !!S && (S.queue.length > 0 || !!S.cur); };
// UI lines still waiting their turn (not yet on screen): the tutorial shows its next prompt once its own lines are up
export const uiWaiting = view => !!view.anim.codec?.queue.some(e => String(e.id).startsWith('ui'));
const isAsking = (st, e) => !!e && st.pendingChoice?.msgId === e.id;

// a pending choice jumps the queue (the lines said just before it, in the same step, come along first)
function ensureChoice(c, S) {
  const pc = c.st.pendingChoice;
  if (!pc || S.cur?.id === pc.msgId) return;
  let i = S.queue.findIndex(e => e.id === pc.msgId), e;
  if (i >= 0) e = S.queue.splice(i, 1)[0];
  else { const m = c.st.codec.find(x => x.id === pc.msgId); e = entry(m || { id: pc.msgId, speaker: 'ceo', text: pc.title, t: c.st.t, choices: pc.choices }); }
  const pre = S.queue.filter(q => q.t === e.t && q.id < e.id);
  S.queue = S.queue.filter(q => !pre.includes(q));
  if (S.cur && S.cur.t === e.t && S.cur.id < e.id) { S.queue.unshift(...pre, restart(e)); return; }
  if (S.cur && !S.cur.replay) S.queue.unshift(restart(S.cur));
  S.queue.unshift(...pre, restart(e));
  S.cur = null;
}

// =================== the line: typing, pages, holds, hang-up ===================

function pagesOf(e, perPage) {
  const key = epoch + '|' + perPage;
  if (e.pk !== key) {
    const lines = wrap(e.text, F.d16, TEXT_W), per = Math.ceil(lines.length / Math.ceil(lines.length / perPage));   // 4 lines: 2 + 2
    e.pages = [];
    for (let i = 0; i < lines.length; i += per) e.pages.push(lines.slice(i, i + per));
    if (!e.pages.length) e.pages = [['']];
    e.pk = key;
    e.page = Math.min(e.page, e.pages.length - 1);
  }
  return e.pages;
}
const charsOf = page => page.reduce((n, s) => n + s.length, 0);

function start(c, S, e) {
  const ring = S.callT0 == null && !e.urgent;
  if (S.callT0 == null) S.callT0 = c.t;
  let delay = 0;
  if (ring) delay = RING;
  if (e.speaker !== 'safety' && e.speaker !== S.left) { S.left = e.speaker; S.openT0 = c.t + delay; delay += OPEN; }
  else if (e.speaker === 'safety' && ring) S.left = null;
  S.cur = restart(e);
  e.t0 = c.t + delay;
  S.idleAt = null;
}

function finish(S, e, t) {
  if (!e.replay) S.hist.push(e);
  if (S.hist.length > 40) S.hist.splice(0, S.hist.length - 40);
  S.last = e;
  S.cur = null;
  S.idleAt = t + LINGER;
}

const speed = view => CPS[view.settings?.codec] ?? CPS.normal;
const dwellMult = view => DWELL[view.settings?.codec] ?? 1;

// the generation ends (the report): what was still waiting or on screen goes to the history (click the idle box to
// replay it). Calls are held off screen until DEPLOY (HOLD), so without this the old model's lines would open the next.
function wrapUp(c, S) {
  const was = S.phase;
  S.phase = c.st.phase;
  if (was !== 'play' || S.phase !== 'report') return;
  const n = S.queue.length + (S.cur ? 1 : 0);
  S.hist.push(...S.queue.filter(e => !e.replay));
  S.queue = [];
  if (S.cur) finish(S, S.cur, c.t);
  if (n) console.log(`[handoff] codec: the generation ends, ${n} waiting call${n > 1 ? 's' : ''} to the history`);
}

// a long queue sheds the ambient lines that have waited too long (not choices, incidents or UI lines)
function shed(c, S) {
  if (S.queue.length < QUEUE_LONG) return;
  const keep = S.queue.filter(e => e.choice || e.urgent || e.keep || c.st.t - e.t <= AMBIENT_OLD || isAsking(c.st, e));
  if (keep.length < S.queue.length) { S.hist.push(...S.queue.filter(e => !keep.includes(e))); S.queue = keep; }
}

function advance(c, S) {
  const st = c.st, CPS = speed(c.view);
  shed(c, S);
  let e = S.cur;
  if (e && e.choice && e.asked && !isAsking(st, e)) { finish(S, e, c.t); e = null; }   // answered: the reply comes next
  if (!e) {
    if (HOLD.has(st.phase)) return;                        // the card's lines wait for DEPLOY, not play under the card
    if (S.queue.length) start(c, S, S.queue.shift());
    else if (S.callT0 != null && S.idleAt != null && c.t >= S.idleAt) { S.callT0 = null; S.hangT0 = c.t; }
    return;
  }
  if (isAsking(st, e)) e.asked = true;
  const pages = pagesOf(e, 3), n = charsOf(pages[e.page]);
  if ((c.t - e.t0) * CPS < n) return;
  if (e.doneAt == null) e.doneAt = Math.max(c.t, e.t0 + n / CPS);
  const lastPage = e.page >= pages.length - 1;
  if (lastPage && isAsking(st, e)) {                       // the question is read: the choices take the box, then wait
    e.skip = false;                                        // only the timer opens them, so a hurried click never lands on one
    if (!e.phase2 && c.t >= e.doneAt + readHold(n)) { e.phase2 = true; e.phase2At = c.t; }
    return;
  }
  const wait = isAsking(st, e) ? c.t < e.doneAt + askHold(n) * dwellMult(c.view) : c.t < e.t0 + dwell(n) * dwellMult(c.view);
  if (!e.skip && wait) return;
  e.skip = false;
  if (!lastPage) { e.page++; e.t0 = c.t; e.doneAt = null; return; }
  finish(S, e, c.t);
  if (S.queue.length && !HOLD.has(st.phase)) start(c, S, S.queue.shift());
}

// click on the box: finish the page, else the next page or call, else (line quiet) replay the calls, newest first
function poke(view, st) {
  const S = stateOf(view), t = view.now, e = S.cur, CPS = speed(view);
  if (!e) {
    if (!S.hist.length) return;
    S.mem = (S.mem + 1) % S.hist.length;
    const h = S.hist[S.hist.length - 1 - S.mem];
    S.queue.unshift({ ...h, replay: true, choice: false, asked: false, urgent: false, pk: null, page: 0, doneAt: null, skip: false, phase2: false });
    return;
  }
  if (e.phase2) { Object.assign(e, { phase2: false, phase2At: null, page: 0, t0: t - 99, doneAt: t, skip: false }); return; }   // read the question again
  const n = charsOf((e.pages || [['']])[e.page] || ['']);
  if ((t - e.t0) * CPS < n) { e.t0 = t - n / CPS - 0.01; return; }
  e.skip = true;
}

// =================== choice layout (the tall box) ===================
// The question was read in the normal box. Now: header, the end of the question, one row per choice (key, label, hint).
// Full hints come first; the question shrinks (to nothing) before a hint is cut. Hover the header for the full text.

const BOX_BOTTOM = CODEC.dialogTall.y + CODEC.dialogTall.h - 5;
function choiceLayout(S, pc, e) {
  if (S.cl && S.cl.pc === pc && S.cl.id === e.id && S.cl.ep === epoch) return S.cl;
  const msg = wrap(e.text, F.d16, TEXT_W);
  const items = pc.choices.map((ch, i) => ({ i, label: fit(ch.label, F.d16, TEXT_W - 12), hint: wrap(vt(ch.hint || ''), F.v16, TEXT_W - 12) }));
  let out = null;
  for (const [ml, hintMax] of [[3, 2], [2, 2], [1, 2], [1, 1], [0, 2], [0, 1], [0, 0]]) {     // keep a line of the question
    const msgLines = Math.min(ml, msg.length), top = msgLines ? 249 + (msgLines - 1) * LINE_H + 9 : 236;
    const h = items.reduce((s, it) => s + 17 + Math.min(it.hint.length, hintMax) * 13 + 3, 0);
    out = { msgLines, hintMax, top };
    if (top + 4 + h <= BOX_BOTTOM) break;
  }
  S.cl = { pc, id: e.id, ep: epoch, msg, items, ...out };
  return S.cl;
}

// =================== draw ===================

export function draw(c) {
  const { g, st, t } = c, S = stateOf(c.view);
  readFx(c, S);
  readCodec(c, S);
  wrapUp(c, S);
  ensureChoice(c, S);
  advance(c, S);
  const asking = isAsking(st, S.cur), tall = asking && S.cur.phase2;
  const cl = tall ? choiceLayout(S, st.pendingChoice, S.cur) : null;

  blit(g, chrome(), CODEC.box.x, CODEC.box.y);
  const e = S.cur, typing = !!e && !tall && c.t >= e.t0 && (c.t - e.t0) * speed(c.view) < charsOf(pagesOf(e, 3)[e.page]);
  const al = alarmOf(S, t);
  c.view.codecLine = { open: S.callT0 != null, urgent: !!e?.urgent, typing };      // read by the sound (overlays.js)

  drawBorder(g, al, t);
  drawBar(c, S, al);
  drawPortraits(c, S, typing);
  drawHandset(c, S, typing, asking);
  drawDialog(c, S, typing, cl);
  if (!tall) { drawLamps(g, S, al, t, typing); drawTrace(c, S, al); }
}

// the incident on show: its kind, age, and whether the strobe is lit this frame
function alarmOf(S, t) {
  const a = S.alarm;
  if (!a) return null;
  const age = t - a.t0;
  if (age < 0 || (a.kind !== 'cat' && age > ALARM_HOLD)) return null;
  const lit = calm ? (a.kind === 'int' ? 0.8 : 1)                       // reduce flashes: lit, no strobe
    : a.kind === 'int'
    ? (age < FADE ? (mod(age * 13, 1) < 0.55 ? 1 - age / FADE * 0.5 : 0.25) : 0.55 + 0.25 * Math.sin(age * 2.2))
    : (age < FLASH ? (mod(age * 10, 1) < 0.5 ? 1 : 0) : (mod(t * 2.4, 1) < 0.6 ? 1 : 0));
  return { ...a, age, lit };
}

// =================== static chrome: frames, handset, box rims, labels (one cached layer) ===================

function chrome() {
  const B = CODEC.box;
  return layer('codec-chrome', B.w, B.h, g => {
    g.setTransform(k, 0, 0, k, -Math.round(B.x * k), -Math.round(B.y * k));     // absolute coords, whole device px
    fill(g, B.x, B.y, B.w, B.h, C.black);
    portraitFrame(g, CODEC.portraitL.x, CODEC.portraitL.y);
    portraitFrame(g, CODEC.portraitR.x, CODEC.portraitR.y);
    handset(g);
    for (let i = 0; i < 3; i++) fill(g, 848 + i * 4, 309, 2, 8, C.e1);
    fill(g, 861, 308, 122, 10, C.black); box(g, 861, 308, 122, 10, C.bluHi);
  });
}

// PSX codec frame: 3 px pale bevel, 1 px black, 1 px mid green, cut corners
function portraitFrame(g, x, y) {
  const P = C.face;
  fill(g, x, y, 98, 122, P[6]); fill(g, x + 3, y + 3, 92, 116, C.black); fill(g, x + 4, y + 4, 90, 114, P[4]); fill(g, x + 5, y + 5, 88, 112, C.black);
  fill(g, x, y + 3, 1, 116, P[5]); fill(g, x + 97, y + 3, 1, 116, P[5]);
  for (const [a, b, sx, sy] of [[x, y, 1, 1], [x + 97, y, -1, 1], [x, y + 121, 1, -1], [x + 97, y + 121, -1, -1]]) {
    fill(g, a, b, 1, 1, C.black); fill(g, a + sx, b, 1, 1, C.black); fill(g, a, b + sy, 1, 1, C.black);
  }
}

// the transceiver: antenna, PTT plate, knobs, body running on under the dialog box, LCD, memory strip, keypad
function handset(g) {
  const K = C.black, P = C.face, ax = 982;
  fill(g, ax + 3, 63, 6, 5, K); fill(g, ax + 4, 64, 4, 4, C.gyHi);
  fill(g, ax + 2, 67, 8, 12, K); fill(g, ax + 3, 68, 6, 11, C.gy); fill(g, ax + 7, 68, 2, 11, C.gy2);
  for (let y = 70; y < 79; y += 3) fill(g, ax + 3, y, 6, 1, C.gy3);
  fill(g, ax, 78, 12, 9, K); fill(g, ax + 1, 79, 10, 7, C.gy2); fill(g, ax + 1, 79, 10, 1, C.gyHi); fill(g, ax + 1, 82, 10, 1, C.gy3); fill(g, ax + 1, 84, 10, 1, C.gy3);
  fill(g, 997, 75, 29, 12, K); fill(g, 998, 76, 27, 10, P[4]); fill(g, 998, 76, 27, 1, P[6]); fill(g, 998, 85, 27, 1, P[2]);
  text(g, 'PTT', 1012, 84, F.k8, P[1], 'center');
  for (const kx of [1028, 1044]) {
    fill(g, kx, 75, 11, 12, K); fill(g, kx + 1, 76, 9, 10, C.gy2); fill(g, kx + 1, 76, 9, 2, C.gyHi);
    for (let i = 0; i < 4; i++) fill(g, kx + 2 + i * 2, 79, 1, 6, C.gy3);
  }
  fill(g, 965, 86, 102, 130, K); fill(g, 966, 87, 100, 128, C.gyBody); fill(g, 966, 87, 100, 1, C.gy2);
  fill(g, 966, 87, 1, 128, C.gy3); fill(g, 1065, 87, 1, 128, C.gy4);
  fill(g, 970, 90, 92, 5, C.gy4); for (let i = 0; i < 22; i++) fill(g, 972 + i * 4, 91, 2, 3, C.gy2);
  lcdPanel(g, 974, 99, 84, 40);
  segStr(g, '888.88', 980, 114, 12, 22, 3, 2, C.lcdOff, null);                         // unlit segments under the digits
  fill(g, 974, 144, 84, 11, C.gy4); box(g, 974, 144, 84, 11, C.gy3); text(g, 'MEM', 978, 152, F.k8, C.gy);
  for (let col = 0; col < 3; col++) fill(g, 986 + col * 24, 159, 12, 2, C.amb);
  KEYS.forEach((row, j) => { for (let col = 0; col < 3; col++) key(g, row[col], 984 + col * 24, 164 + j * 11, false); });
}
const KEYS = ['789', '456', '123', '0+-'];
function key(g, ch, x, y, lit) {
  fill(g, x - 1, y - 1, 18, 11, C.black);
  fill(g, x, y, 16, 9, lit ? C.amb : C.gy); fill(g, x, y, 16, 1, lit ? C.lcd : C.gyHi); fill(g, x, y + 8, 16, 1, C.gy2);
  sprite(g, MICRO[ch], x + 7, y + 2, { '#': lit ? C.black : C.gy4 });
}

// =================== the codec rim: flashes with an incident ===================

function drawBorder(g, al, t) {
  const B = CODEC.box;
  if (al && al.lit > 0.5) {
    const col = al.kind === 'int' ? C.vm : C.r;
    if (al.kind === 'int') dashBox(g, B.x, B.y, B.w, B.h, col, 3, 3, Math.floor(mod(t * 8, 6)));
    else box(g, B.x, B.y, B.w, B.h, col);
    corners(g, B.x, B.y, B.w, B.h, al.kind === 'int' ? C.v : C.rLite, 8);
  } else corners(g, B.x, B.y, B.w, B.h, C.e2, 8);
}

// =================== incident bar: EXTERNAL INCIDENT / INTERNAL ANOMALY / ring / call / standby ===================

function drawBar(c, S, al) {
  const { g, t } = c, r = CODEC.incident, x = r.x, y = r.y, w = r.w, h = r.h, base = y + 16;
  const clock = S.callT0 != null ? 'CALL ' + mmss(t - S.callT0) : null;
  if (al && al.kind !== 'int') {
    const on = al.lit > 0.5, ink = on ? C.rInk : C.r;
    if (on) glowRect(g, x, y, w, h, C.r, 6); else { fill(g, x, y, w, h, C.rdd); box(g, x, y, w, h, C.rm); }
    fill(g, x + 7, y + 3, 4, 10, ink); fill(g, x + 7, y + 15, 4, 3, ink);
    const head = al.kind === 'cat' ? 'CATASTROPHE' : 'EXTERNAL INCIDENT';
    const right = al.kind === 'cat' ? 'SIGNAL LOST' : al.n > 1 ? 'x' + al.n : clock;
    barText(g, head, al.label, right, ink, x + 18, base, x + w - 6);
    return;
  }
  if (al) {
    const a0 = g.globalAlpha;
    fill(g, x, y, w, h, C.vdd);
    dashBox(g, x, y, w, h, C.vm, 2, 2, Math.floor(mod(t * 6, 4)));
    g.globalAlpha = a0 * clamp(al.lit, 0.5, 1);
    fill(g, x + 7, y + 4, 4, 4, C.v); fill(g, x + 7, y + 10, 4, 4, C.v);
    barText(g, 'INTERNAL ANOMALY', al.label, al.n > 1 ? 'x' + al.n : clock, C.v, x + 18, base, x + w - 6);
    g.globalAlpha = a0;
    return;
  }
  const ringing = S.cur && t < S.callT0 + RING;
  if (S.callT0 != null) {
    const on = !ringing || mod(t * 10, 1) < 0.5;
    fill(g, x, y, w, h, C.pan); box(g, x, y, w, h, on ? C.e2 : C.e1);
    fill(g, x + 7, y + 7, 5, 5, on ? C.g : C.gd);
    const sp = S.cur?.speaker ?? S.last?.speaker, pc = c.st.pendingChoice;
    const head = ringing ? 'INCOMING' : pc ? 'DECISION' : 'CODEC';
    const detail = pc && !ringing ? pc.title : sp ? (sp === 'safety' ? 'sending' : who(sp).call) : '';
    barText(g, head, detail, ringing ? (freqOf(sp, c.st.gen) ?? '') : clock, C.gm, x + 18, base, x + w - 6, C.gd);
    return;
  }
  fill(g, x, y, w, h, C.pan); box(g, x, y, w, h, C.e0);
  fill(g, x + 7, y + 7, 5, 5, C.e1);
  barText(g, 'CODEC', 'standby', 'NO CARRIER', C.gd, x + 18, base, x + w - 6, C.gd);
}

// "HEAD · detail" on the left, right text right-aligned; the detail shortens first
function barText(g, head, detail, right, col, x, y, xr, dim = col) {
  const rw = right ? tw(right, F.v16) + 10 : 0;
  const hw = text(g, head, x, y, F.v20, col);
  if (detail) {
    const room = xr - rw - (x + hw) - tw(' · ', F.v20);
    if (room > 20) text(g, ' · ' + fit(detail, F.v20, room), x + hw, y, F.v20, dim);
  }
  if (right) text(g, right, xr, y - 1, F.v16, col, 'right');
}
const vt = s => s.replace(/×/g, 'x');                    // VT323 sets × like a superscript
const mmss = s => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60) % 100).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

// =================== portraits ===================

function drawPortraits(c, S, typing) {
  const { g, t, st } = c, L = CODEC.portraitL, R = CODEC.portraitR, e = S.cur;
  const lx = L.x + 5, rx = R.x + 5, y = L.y + 5;
  const youTalk = typing && e.speaker === 'safety', themTalk = typing && e.speaker !== 'safety';
  const mouth = mod(t * 9, 1) < 0.5;

  // ---------- left: the caller, static when nobody is on the line ----------
  const live = S.callT0 != null && S.left != null;
  const open = live ? clamp((t - S.openT0) / OPEN, 0, 1) : 1;
  const shut = S.callT0 == null ? clamp(1 - (t - S.hangT0) / 0.2, 0, 1) : 0;
  if (live && open > 0) {
    const img = portrait(S.left, { talking: themTalk && mouth, blink: mod(t + 1.7, 3.7) < 0.12, gen: st.gen });
    unfold(g, img, lx, y, open, t);
    if (S.left === 'model' && st.gen >= 4) glitch(g, img, lx, y, t, st.gen);
  } else if (shut > 0 && S.last && S.last.speaker !== 'safety') {
    unfold(g, portrait(S.last.speaker, { gen: st.gen }), lx, y, shut, t);
  } else {
    const a0 = g.globalAlpha;
    g.drawImage(noise(Math.floor(t * 12)), lx, y, 88, 112);
    g.globalAlpha = a0 * 0.85; fill(g, lx + 14, y + 49, 60, 14, C.black); g.globalAlpha = a0;
    text(g, live ? 'BROADCAST' : 'NO SIGNAL', lx + 44, y + 59, F.k8, live ? C.gm : C.gd, 'center');
  }

  // ---------- right: YOU, always on the line ----------
  const you = portrait('safety', { talking: youTalk && mouth, blink: mod(t, 4.3) < 0.14 });
  unfold(g, you, rx, y, 1, t);

  // ---------- names on the outer edges, vitals on the inner edges ----------
  const ny = CODEC.nameY;
  const sp = live ? S.left : null;
  if (sp) vitals(g, who(sp).call, sp === 'model' ? (st.gen >= 7 ? youBpm(c, S) : null) : who(sp).bpm, L.x, L.x + 98, ny, t, true);
  else text(g, '- - -', L.x, ny, F.v20, C.gd);
  vitals(g, 'YOU', youBpm(c, S), R.x, R.x + 98, ny, t, false);
}

// a portrait opening from a 2 px line (f 0 → 1), with a rolling scan band and the odd bright line
function unfold(g, img, x, y, f, t) {
  if (f <= 0) return;
  const h = Math.max(2, Math.round(112 * ease(f)) & ~1), sy = (112 - h) >> 1;
  g.drawImage(img, 0, sy, 88, h, x, y + sy, 88, h);
  if (f < 1) { fill(g, x, y + sy, 88, 1, C.face[7]); fill(g, x, y + sy + h - 1, 88, 1, C.face[7]); return; }
  const a0 = g.globalAlpha, ry = Math.round(mod(t * 38 + x, 150)) - 20;
  if (ry > -8 && ry < 112) { g.globalAlpha = a0 * 0.08; fill(g, x, y + Math.max(0, ry), 88, Math.min(8, 112 - Math.max(0, ry)), C.g); }
  const tick = Math.floor(t * 12);
  if (hash(tick * 31 + x) < 0.5) { g.globalAlpha = a0 * 0.2; fill(g, x, y + Math.floor(hash(tick * 17 + x) * 112), 88, 1, C.gl); }
  g.globalAlpha = a0;
}

// the model, from G4: a slice of the face slips sideways now and then (more often each generation)
function glitch(g, img, x, y, t, gen) {
  const tick = Math.floor(t * 10);
  if (hash(tick * 7 + gen) > 0.12 * (gen - 3)) return;
  const sy = Math.floor(hash(tick * 13) * 100), sh = 3 + Math.floor(hash(tick * 19) * 9), dx = (hash(tick * 23) < 0.5 ? -1 : 1) * (2 + Math.floor(hash(tick) * 4));
  g.save(); g.beginPath(); g.rect(x, y, 88, 112); g.clip();
  g.drawImage(img, 0, sy, 88, sh, x + dx, y + sy, 88, sh);
  g.restore();
}

// name and heart rate under a frame; the name shrinks to fit, then BPM drops its unit
function vitals(g, name, bpm, x0, x1, y, t, left) {
  const v = bpm == null ? '-- BPM' : Math.round(bpm) + ' BPM', beat = bpm ? mod(t * bpm / 60, 1) < 0.45 : false;
  let font = F.v20, vs = v;
  if (tw(name, font) + tw(vs, F.v16) + 18 > 98) font = F.v16;
  if (tw(name, font) + tw(vs, F.v16) + 18 > 98) vs = bpm == null ? '--' : String(Math.round(bpm));
  const heart = beat ? C.gm : C.gdd;
  if (left) {
    text(g, name, x0, y, font, C.g);
    const w = text(g, vs, x1, y, F.v16, C.gm, 'right');
    sprite(g, SPR.heart, x1 - w - 10, y - 8, { '#': heart });
  } else {
    text(g, name, x1, y, font, C.g, 'right');
    sprite(g, SPR.heart, x0, y - 8, { '#': heart });
    text(g, vs, x0 + 10, y, F.v16, C.gm);
  }
}

// your heart rate: 62 at rest, up when something lands, back down over ~20 s
function youBpm(c, S) {
  const base = c.st.pendingChoice ? 78 : 62, age = c.t - S.youT0;
  return age < 0 ? base : Math.max(base, base + (S.youPeak - base) * Math.exp(-age / 8));
}

// =================== handset: frequency, signal, RECV, memory, PTT, choice keys ===================

function drawHandset(c, S, typing, asking) {
  const { g, t, st } = c, e = S.cur;
  const sp = e?.speaker ?? S.last?.speaker ?? null, live = S.callT0 != null;
  const f = sp && sp !== 'safety' ? freqOf(sp, st.gen) : S.left ? freqOf(S.left, st.gen) : null;
  segStr(g, live && f ? f : '140.00', 980, 114, 12, 22, 3, 2, live ? C.lcdOn : C.lcdMid, null);

  const lvl = !live ? 1 : typing ? 4 + Math.round(4 * Math.abs(Math.sin(t * 7.3)) * Math.abs(Math.sin(t * 2.9 + 1))) : 3;
  for (let i = 0; i < 8; i++) fill(g, 978 + i * 5, 109 - (i + 2), 3, i + 2, i < lvl ? C.lcdOn : C.lcdOff);
  const mode = !live ? 'STBY' : e?.speaker === 'safety' ? 'SEND' : 'RECV';
  if (!live || mod(t * 1.2, 1) < 0.75) text(g, mode, 1054, 108, F.k8, live ? C.lcdOn : C.lcdMid, 'right');

  const mem = e?.replay ? 'BACK ' + (S.mem + 1) : live && sp && sp !== 'safety' ? who(sp).mem : live && S.left ? who(S.left).mem : PRESETS[Math.floor(mod(t / 2.5, PRESETS.length))];
  if (mem) text(g, fit(mem, F.k8, 54), 1000, 152, F.k8, C.gyHi);

  const ptt = asking && e?.phase2;
  if (ptt && mod(t * 1.6, 1) < 0.6) { fill(g, 998, 76, 27, 10, C.face[6]); fill(g, 998, 76, 27, 1, C.face[7]); text(g, 'PTT', 1012, 84, F.k8, C.face[0], 'center'); }
  c.hit.add(997, 75, 29, 12, 'codec-next', {});

  if (ptt && st.pendingChoice) st.pendingChoice.choices.slice(0, 3).forEach((ch, i) => {
    const kx = 984 + i * 24, ky = 186;
    key(g, String(i + 1), kx, ky, true);
    c.hit.add(kx - 1, ky - 1, 18, 11, 'choice', { i });
  });
}

// =================== the MSX dialog box ===================

function drawDialog(c, S, typing, cl) {
  const { g, t, st } = c, d = cl ? CODEC.dialogTall : CODEC.dialog;
  fill(g, d.x, d.y, d.w, d.h, C.black); fill(g, d.x + 1, d.y + 1, d.w - 2, d.h - 2, C.bluHi);
  fill(g, d.x + 3, d.y + 3, d.w - 6, d.h - 6, C.blu); fill(g, d.x + 3, d.y + 3, d.w - 6, 1, C.bluRule);

  const e = S.cur;
  if (!e) { idleBox(c, S, d); return; }
  if (t < e.t0) return;
  const name = (CAST[e.speaker]?.name ?? String(e.speaker).toUpperCase()) + ':';
  text(g, name, d.x + 13, d.y + 23, F.d16, C.wht);

  if (cl) {                                                  // phase 2: the end of the question, then the choices
    c.hit.add(d.x, d.y, d.w, cl.top - d.y, 'codec-next', {}, 'pointer');
    text(g, fit(st.pendingChoice.title.toUpperCase(), F.k8, d.w - 40 - tw(name, F.d16)), d.x + d.w - 13, d.y + 21, F.k8, C.bluHi, 'right');
    const from = cl.msg.length - cl.msgLines;
    for (let i = 0; i < cl.msgLines; i++) text(g, cl.msg[from + i], TEXT_X, d.y + 43 + i * LINE_H, F.d16, C.wht);
    if (from > 0 && cl.msgLines) text(g, '…', TEXT_X - 12, d.y + 43, F.d16, C.bluHi);
    const hov = c.view.hover?.kind === 'codec-next' && c.view.hover.y === d.y;
    if (from > 0 && hov) c.late(cc => tooltip(cc.g, cl.msg, d.x + 6, d.y + 30, d.w - 12, F.d16, 18));
    choices(c, cl, d);
    return;
  }

  c.hit.add(d.x, d.y, d.w, d.h, 'codec-next', {}, 'pointer');
  const pages = pagesOf(e, 3), page = pages[e.page] || [''];
  if (pages.length > 1) text(g, (e.page + 1) + '/' + pages.length, d.x + d.w - 13, d.y + 22, F.v16, C.bluHi, 'right');
  let left = Math.max(0, Math.floor((t - e.t0) * speed(c.view))), ex = TEXT_X, ey = d.y + 43;
  page.forEach((ln, i) => {
    if (left <= 0) return;
    const part = ln.slice(0, left), by = d.y + 43 + i * LINE_H;
    left -= ln.length;
    ex = TEXT_X + text(g, part, TEXT_X, by, F.d16, C.wht); ey = by;
  });
  if (typing) { if (mod(t * 3, 1) < 0.6) fill(g, ex + 2, ey - 12, 7, 13, C.wht); }
  else if (mod(t * 1.6, 1) < 0.6) sprite(g, SPR.downB, d.x + d.w - 18, d.y + d.h - 14, { '#': C.wht });
}

// what a choice costs in cash (its 'money' effect, priced at today's income), 0 if nothing
function choiceCost(st, pc, i) {
  const fx = EVENTS.find(ev => ev.id === pc.eventId)?.choices?.[i]?.effects || [];
  return fx.reduce((sum, e) => sum + (e.t === 'money' && e.secs < 0 ? -eventMoney(st, e.secs) : 0), 0);
}

// the choices: [n] label, hint under it. Hover lights the row; the full hint shows in a tooltip if it was cut short.
// A choice that costs more than the bank holds says so on its row: paying it puts the lab below zero.
function choices(c, cl, d) {
  const { g, view, st } = c;
  fill(g, d.x + 10, cl.top, d.w - 20, 1, C.bluRule);
  let y = cl.top + 4;
  for (const it of cl.items) {
    const hl = Math.min(it.hint.length, cl.hintMax), h = 17 + hl * 13 + 3;
    const hov = view.hover?.kind === 'choice' && view.hover.data?.i === it.i;
    if (hov) fill(g, d.x + 6, y - 1, d.w - 12, h, C.bluRule);
    fill(g, d.x + 12, y + 2, 13, 13, hov ? C.wht : C.bluHi); fill(g, d.x + 13, y + 3, 11, 11, C.blu);
    text(g, String(it.i + 1), d.x + 18.5, y + 13, F.v16, C.wht, 'center');
    const cost = choiceCost(st, st.pendingChoice, it.i), broke = cost > Math.max(0, st.money);
    const tag = broke ? `you have ${money(st.money)}` : '', tagW = broke ? tw(tag, F.v16) + 8 : 0;
    text(g, tagW ? fit(it.label, F.d16, d.w - 43 - tagW) : it.label, d.x + 31, y + 14, F.d16, C.wht);
    if (broke) text(g, tag, d.x + d.w - 12, y + 13, F.v16, C.rLite, 'right');
    for (let j = 0; j < hl; j++) {
      const cut = j === hl - 1 && it.hint.length > hl;
      text(g, cut ? fit(it.hint.slice(j).join(' '), F.v16, TEXT_W - 12) : it.hint[j], d.x + 31, y + 28 + j * 13, F.v16, C.bluHi);
    }
    c.hit.add(d.x + 6, y - 1, d.w - 12, h, 'choice', { i: it.i });
    if (hov && it.hint.length > hl) {
      const full = it.hint, by = y + h;
      c.late(cc => tooltip(cc.g, full, d.x + 6, by, d.w - 12, F.v16, 13));
    }
    y += h;
  }
}

function tooltip(g, lines, x, y, w, font, lh) {
  const h = 7 + lines.length * lh;
  fill(g, x, y, w, h, C.black); box(g, x, y, w, h, C.bluHi);
  lines.forEach((s, i) => text(g, s, x + 8, y + lh + 1 + i * lh, font, C.wht));
}

// nobody on the line: the last call, dimmed; click to replay
function idleBox(c, S, d) {
  const { g } = c, e = S.last;
  c.hit.add(d.x, d.y, d.w, d.h, 'codec-next', {}, e ? 'pointer' : 'default');
  if (!e) { text(g, 'NO TRANSMISSION', d.x + d.w / 2, d.y + 56, F.d16, C.bluHi, 'center'); return; }
  const a0 = g.globalAlpha;
  g.globalAlpha = a0 * 0.62;
  text(g, (CAST[e.speaker]?.name ?? String(e.speaker).toUpperCase()) + ':', d.x + 13, d.y + 23, F.d16, C.bluHi);
  const pages = pagesOf(e, 3), page = pages[pages.length - 1];
  page.forEach((ln, i) => text(g, ln, TEXT_X, d.y + 43 + i * LINE_H, F.d16, C.wht));
  g.globalAlpha = a0;
  text(g, S.hist.length > 1 ? 'click: replay ' + Math.min(S.hist.length, 40) : 'click: replay', d.x + d.w - 13, d.y + 22, F.v16, C.bluHi, 'right');
}

// =================== signal bar and the two lamps ===================

function drawLamps(g, S, al, t, typing) {
  const ext = al && al.kind !== 'int', int = al && (al.kind === 'int' || al.kind === 'cat');
  const tick = ext ? C.r : int ? C.v : S.callT0 != null ? C.gm : C.e1;
  for (let i = 0; i < 3; i++) fill(g, 848 + i * 4, 309, 2, 8, tick);
  const sig = S.callT0 == null ? 0.12 : 0.66 + 0.34 * Math.abs(Math.sin(t * 5.3)) * (typing ? 1 : 0.35);
  const sw = Math.max(4, Math.round(118 * sig / 4) * 4);
  glowRect(g, 863, 310, sw, 6, ext ? C.r : int ? C.vm : C.gm, 6);

  const E = CODEC.lampExt, I = CODEC.lampInt;
  const eOn = ext && al.lit > 0.5;
  if (eOn) fill(g, E.x, E.y, E.w, E.h, C.r);
  else { fill(g, E.x + 1, E.y + 1, E.w - 2, E.h - 2, C.rdd); box(g, E.x, E.y, E.w, E.h, ext ? C.rm : C.rd); }
  fill(g, E.x + 4, E.y + 3, 5, 5, eOn ? C.rInk : ext ? C.r : C.rm);
  text(g, 'EXT INCIDENT', E.x + 12, E.y + 8, F.k8, eOn ? C.rInk : ext ? C.r : C.rm);

  const a0 = g.globalAlpha;
  fill(g, I.x + 1, I.y + 1, I.w - 2, I.h - 2, int ? C.vdd : C.pan);
  dashBox(g, I.x, I.y, I.w, I.h, int ? C.v : C.vd, 2, 2, int ? Math.floor(mod(t * 10, 4)) : 0);
  if (int) g.globalAlpha = a0 * clamp(al.lit, 0.6, 1);
  box(g, I.x + 4, I.y + 3, 5, 5, int ? C.v : C.vm);
  text(g, 'INT ANOMALY', I.x + 12, I.y + 8, F.k8, int ? C.v : C.vm);
  g.globalAlpha = a0;
}

// =================== trace: the post-mortem of the last incident ===================

function drawTrace(c, S, al) {
  const { g } = c, T = CODEC.trace, tr = S.trace, x0 = 886, x1 = T.x + T.w;
  if (!tr) { text(g, 'TRACE', T.x, 337, F.k8, C.gd); text(g, 'no incidents yet. keep it that way.', x0, 338, F.v16, C.gd); return; }
  const red = tr.kind !== 'int';
  // the label stacks beside the first row: TRACE over the lane it ran on
  text(g, 'TRACE', T.x, 333, F.k8, C.gd);
  text(g, fit(laneTab(tr.lane), F.k8, 36), T.x, 342, F.k8, C.lane[tr.side].mid);

  const items = tr.steps.map(s => ({ ...s, w: tw(s.tag, F.v16) + (s.verb ? tw(' ' + s.verb, F.v16) : 0) }));
  const endW = tw(tr.end, F.v16) + 8, SEP = 13, room2 = endW + SEP + 22;      // line 2 keeps room for "+N" and the stamp
  const lines = [[]];
  let cx = x0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], lim = x1 - (lines.length === 2 ? room2 : 0);
    if (cx + it.w > lim && lines[lines.length - 1].length) {
      if (lines.length === 2) { lines[1].push({ more: items.length - i }); break; }
      lines.push([]); cx = x0;
    }
    lines[lines.length - 1].push(it); cx += it.w + SEP;
  }
  let x = x0, y = 338;
  if (!items.length) x += text(g, 'nothing on the rail', x, y, F.v16, C.gd) + SEP;
  lines.forEach((ln, j) => {
    if (!ln.length) return;
    x = x0; y = 338 + j * 18;
    for (const it of ln) {
      if (it.more) { x += text(g, '+' + it.more, x, y, F.v16, C.gd) + SEP; continue; }
      x += text(g, it.tag, x, y, F.v16, it.tone === 'dim' ? C.gd : C.gm);
      if (it.verb) x += text(g, ' ' + it.verb, x, y, F.v16, { bad: C.r, good: C.g, ok: C.gm }[it.tone] || C.gd);
      sprite(g, SPR.tri, x + 5, y - 7, { '#': C.gdd });
      x += SEP;
    }
  });
  if (x + endW > x1) { x = x0; y += 18; }
  const on = al && al.lit > 0.5 && al.kind === tr.kind, fg = red ? C.r : C.v;
  fill(g, x, y - 12, endW, 15, on ? fg : red ? C.rd : C.vdd);
  if (!on) box(g, x, y - 12, endW, 15, red ? C.rm : C.vm);
  text(g, tr.end, x + 4, y, F.v16, on ? (red ? C.rInk : C.vdd) : fg);
}

// =================== input ===================

export const input = {
  choice: {
    click(e, api) {
      const cur = stateOf(api.view).cur;
      if (!cur?.phase2 || api.view.now - (cur.phase2At ?? -99) < CHOICE_GRACE) return;   // not open yet, or only just
      api.act.choose(e.data.i);
    },
  },
  'codec-next': { click: (e, api) => poke(api.view, api.st) },
};
