// ===== Input: pointer and keys → hit regions → the handlers of the module that owns that kind =====
// handlers = { kind: { click(e, api), context(e, api), drag: { start, move, end } } }, merged from every module.
//   e   = { region, data, x, y, shift, button }   (x, y in logical px)
//   api = { st, view, act, debug, ... } (main.js)
// Click = button down and up on the same region. Right click = context. A kind with `drag` starts a drag on press.

import { W, H } from './layout.js';
import { sameRegion } from './hit.js';
import { focusLane } from './view.js';
import { LAYERS } from '../config/layers.js';
import { BALANCE as B } from '../config/balance.js';
import * as R from '../sim/rules.js';

export function attachInput({ canvas, hits, handlers, api }) {
  const view = api.view;
  let down = null;

  const pos = ev => {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
  };
  const evOf = (ev, region, p) => ({ region, data: region?.data ?? null, x: p.x, y: p.y, shift: ev.shiftKey, button: ev.button });
  const call = (region, what, ev, p) => {
    const h = handlers[region.kind]?.[what];
    if (h) h(evOf(ev, region, p), api);
    return !!h;
  };

  function hover(p) {
    view.mouse.x = p.x; view.mouse.y = p.y; view.mouse.inside = true;
    const r = hits.at(p.x, p.y);
    view.hover = r;
    const cur = view.drag ? 'grabbing' : r ? r.cursor : view.placing ? 'crosshair' : 'default';
    if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
  }

  // ---------- pointer ----------
  canvas.addEventListener('pointermove', ev => {
    const p = pos(ev);
    if (view.drag) {
      Object.assign(view.drag, p);
      handlers[view.drag.kind]?.drag?.move?.(evOf(ev, view.drag.region, p), api);
    }
    hover(p);
  });
  canvas.addEventListener('pointerleave', () => { view.mouse.inside = false; if (!view.drag) view.hover = null; });

  canvas.addEventListener('pointerdown', ev => {
    api.onGesture?.();
    const p = pos(ev), r = hits.at(p.x, p.y);
    down = r;
    if (ev.button !== 0 || !r || !handlers[r.kind]?.drag) return;
    view.drag = { kind: r.kind, region: r, data: r.data, x0: p.x, y0: p.y, ...p };
    canvas.setPointerCapture?.(ev.pointerId);
    handlers[r.kind].drag.start?.(evOf(ev, r, p), api);
  });

  canvas.addEventListener('pointerup', ev => {
    const p = pos(ev);
    if (view.drag) {
      handlers[view.drag.kind]?.drag?.end?.(evOf(ev, view.drag.region, p), api);
      view.drag = null; down = null;
      hover(p);
      return;
    }
    if (ev.button !== 0) return;
    const r = hits.at(p.x, p.y);
    if (r && sameRegion(r, down)) call(r, 'click', ev, p);
    else if (!r && !down && !view.research) { view.placing = null; }   // a click on nothing drops what you were placing
    down = null;
  });

  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    const p = pos(ev), r = hits.at(p.x, p.y);
    if (!(r && call(r, 'context', ev, p)) && !view.research) { view.placing = null; view.selected = null; }
  });

  window.addEventListener('keydown', ev => keys(ev, api));

  // main.js calls this after every frame: a mouse that has not moved still hovers this frame's region, so tooltips
  // (whose text is baked into the region) and cursors stay current
  return { refresh() { if (view.mouse.inside && !view.drag) hover(view.mouse); } };
}

// =================== keys ===================
// Board keys, in play only: card, report, training, the research panel and the two alarm cards take their keys in
// overlays.js (and src/train while training), so nothing here fires under them.
// Space pause (you can still build) · F ×3 · M mute · R research panel · Esc cancel
// Tab / Shift+Tab: the EXTERNAL lanes · [ / ]: the INTERNAL lanes (ev.code, so the number keys keep their meaning)
// 1–9: answer a choice, else take the i-th unlocked element (menu order)
// ?debug=1 / dev: N training now · G then 1–7 a generation · R a research offer now · $ money · U unlock all · D panel
//                 · T truth marks on chips · L layout outlines · Shift+N the next generation, deployed (v2 N)

export const unlockedInMenuOrder = st => Object.keys(LAYERS).filter(id => st.unlocked.includes(id));

let gWait = 0;                        // dev: G was pressed; a digit 1–7 within 1.5 s jumps to that generation

function keys(ev, api) {
  if (ev.target?.closest?.('input, textarea, select')) return;
  const { view, act } = api, st = api.st, k = ev.key, code = ev.code;
  if (!st) return;
  if (st.phase === 'training') return;                          // src/train owns D, Enter, Space and the arrows
  if (ev.repeat && k !== '$') { if (k === ' ' || code === 'Tab') ev.preventDefault(); return; }   // a held key is one press
  if (k === 'm' || k === 'M') { api.toggleMute(); return; }
  if (st.phase !== 'play' || view.panel || st.pendingRetrain) return;   // overlays.js has these
  if (st.alarm && (k === 'Enter' || k === 'p' || k === 'P')) return;     // PULL THE PLUG: overlays.js

  if (api.debug && gWait && performance.now() - gWait < 1500 && /^[1-7]$/.test(k)) { gWait = 0; api.debugActions.toGen(Number(k)); return; }
  gWait = 0;

  if (k === ' ') { ev.preventDefault(); view.paused = !view.paused; }
  else if (code === 'Tab') { ev.preventDefault(); cycleLane(api, 'ext', ev.shiftKey ? -1 : 1); }
  else if (code === 'BracketLeft' || code === 'BracketRight') cycleLane(api, 'int', code === 'BracketLeft' ? -1 : 1);
  else if (k === 'Escape') {
    if (view.research) { act.bankCard(); view.toast('card banked: open RESEARCH to pick again'); }
    view.research = null; view.placing = null; view.selected = null;
  }
  else if (k === 'f' || k === 'F') toggleFast(api);
  else if ((k === 'r' || k === 'R') && api.debug) { api.debugActions.researchNow(); view.panel = 'research'; }
  else if (k === 'r' || k === 'R') openResearch(api);
  else if (/^[1-9]$/.test(k)) {
    const i = Number(k) - 1;
    if (st.pendingChoice) { if (i < st.pendingChoice.choices.length) act.choose(i); }
    else if (!view.research) {
      const id = unlockedInMenuOrder(st)[i];
      if (id) { view.placing = view.placing === id ? null : id; view.selected = null; }
    }
  }
  else if (api.debug) {
    const d = api.debugActions;
    if (k === 'N') d.skipGen();
    else if (k === 'n') d.trainNow();
    else if (k === 'g' || k === 'G') gWait = performance.now();
    else if (k === '$') d.addMoney();
    else if (k === 'u' || k === 'U') d.unlockAll();
    else if (k === 'd' || k === 'D') d.togglePanel();
    else if (k === 't' || k === 'T') view.truth = !view.truth;
    else if (k === 'l' || k === 'L') view.layout = !view.layout;
  }
}

// the next lane of a side, in board order (parked contract lanes included: you can build on them)
function cycleLane(api, side, dir) {
  const ids = R.laneIds(api.st, side);
  if (ids.length < 2) return;
  const i = ids.indexOf(api.view.focus[side]);
  focusLane(api.view, side, ids[(i + dir + ids.length) % ids.length]);
}

export function toggleFast(api) {
  const v = api.view;
  if (v.fast) { v.fast = false; return; }
  const ok = api.canFast();
  if (ok === true) v.fast = true;
  else v.toast(ok || 'not now');
}

// the research panel: the offer on show (st.research.banked[0]); with nothing banked, when the next one is due
export function openResearch(api) {
  const st = api.st, R0 = st.research;
  if (R0.banked.length) { api.view.panel = 'research'; api.view.placing = null; api.view.research = null; return true; }
  const rate = R.rpRate(st), left = Math.max(0, B.research.offerRP - R0.rp);
  api.view.toast(rate > 0 ? `no research yet: next in ${Math.ceil(left / rate)} s` : 'no research yet: the lab is dark');
  return false;
}
