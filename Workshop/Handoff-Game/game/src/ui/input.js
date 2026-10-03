// ===== Input: pointer and keys → hit regions → the handlers of the module that owns that kind =====
// handlers = { kind: { click(e, api), context(e, api), drag: { start, move, end } } }, merged from every module.
//   e   = { region, data, x, y, shift, button }   (x, y in logical px)
//   api = { st, view, act, debug, ... } (main.js)
// Click = button down and up on the same region. Right click = context. A kind with `drag` starts a drag on press.

import { W, H } from './layout.js';
import { sameRegion } from './hit.js';
import { LAYERS } from '../config/layers.js';

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
    else if (!r && !down) { view.placing = null; }            // a click on nothing drops what you were placing
    down = null;
  });

  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    const p = pos(ev), r = hits.at(p.x, p.y);
    if (!(r && call(r, 'context', ev, p))) { view.placing = null; view.selected = null; }
  });

  window.addEventListener('keydown', ev => keys(ev, api));

  // main.js calls this after every frame: a mouse that has not moved still hovers this frame's region, so tooltips
  // (whose text is baked into the region) and cursors stay current
  return { refresh() { if (view.mouse.inside && !view.drag) hover(view.mouse); } };
}

// =================== keys ===================
// Space pause (you can still build) · F ×3 · M mute · R research draw · Esc cancel
// 1–9: answer a choice, else pick a research card, else take the i-th unlocked element (menu order)
// ?debug=1: N next generation · $ money · U unlock all · D debug panel · T truth marks on chips · L layout outlines

export const unlockedInMenuOrder = st => Object.keys(LAYERS).filter(id => st.unlocked.includes(id));

function keys(ev, api) {
  if (ev.target?.closest?.('input, textarea, select')) return;
  const { view, act } = api, st = api.st, k = ev.key;
  if (!st) return;
  if (ev.repeat && k !== '$') { if (k === ' ') ev.preventDefault(); return; }      // a held key is one press, not a flicker
  if (k === ' ') { ev.preventDefault(); view.paused = !view.paused; }
  else if (k === 'Escape') { view.placing = null; view.selected = null; }
  else if (k === 'f' || k === 'F') view.fast = !view.fast;
  else if (k === 'm' || k === 'M') api.toggleMute();
  else if (k === 'r' || k === 'R') act.drawResearch();
  else if (/^[1-9]$/.test(k)) {
    const i = Number(k) - 1;
    if (st.pendingChoice) { if (i < st.pendingChoice.choices.length) act.choose(i); }
    else if (st.pendingResearch) { if (i < (st.researchOffer?.length ?? 0)) act.pickResearch(i); }
    else {
      const id = unlockedInMenuOrder(st)[i];
      if (id) { view.placing = view.placing === id ? null : id; view.selected = null; }
    }
  }
  else if (api.debug) {
    const d = api.debugActions;
    if (k === 'n' || k === 'N') d.skipGen();
    else if (k === '$') d.addMoney();
    else if (k === 'u' || k === 'U') d.unlockAll();
    else if (k === 'd' || k === 'D') d.togglePanel();
    else if (k === 't' || k === 'T') view.truth = !view.truth;
    else if (k === 'l' || k === 'L') view.layout = !view.layout;
  }
}
