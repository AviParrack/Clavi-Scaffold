// ===== View: UI state that is not game state. Lives across frames; reset on a new game =====
// Shared fields are listed here. A module keeps its own per-game state ONLY in view.anim[name] and
// view.cursors[name] (both wiped on a new game); module-level variables are for caches that survive games.

export function createView() {
  const view = {
    now: 0,                 // this frame's animation clock (s)
    mouse: { x: -1, y: -1, inside: false },
    hover: null,            // the hit region under the mouse: { x, y, w, h, kind, data, cursor }
    placing: null,          // element id picked in the menu, waiting for a mount click
    selected: null,         // { lane, slot } whose upgrade panel is open (lane 'global', slot 0 = the lab site)
    focus: newFocus(),      // the lane id each track shows: { ext: EXTERNAL track, int: INTERNAL track } (by side)
    pin: newPin(),          // per side: a tab click pins its lane until this view.now (auto-focus waits)
    autoAt: newPin(),       // per side: when auto-focus last moved this track (at most once every 10 s)
    research: null,         // a research card waiting for its mount: { i, id, type, layer, name } (view.placing is set too)
    panel: null,            // 'research' while the research panel is open (the sim waits: view.modal)
    drag: null,             // { kind, data, region, x0, y0, x, y } while a drag runs (split handles)
    paused: false,          // Space. The board still takes orders while paused
    fast: false,            // F: sim ×3
    toasts: [],             // { text, t0 }, newest last: refused actions (act.js). hud draws them
    shake: null,            // { t0, amp, dur }: main.js shakes the whole board (EXTERNAL INCIDENT)
    codecLine: null,        // { open, urgent, typing }: codec.js sets it every frame, the sound follows it
    truth: true,            // ?debug=1 only: draw the hidden truth on chips (T toggles)
    layout: false,          // ?debug=1 only: outline every layout region (L toggles)
    modal: false,           // overlays.js: a modal screen covers the board (research panel), so the sim waits
    slow: 1,                // tutorial.js: view-only speed (0.5 while the G1 tutorial teaches)
    training: null,         // main.js: { g, f } while the training placeholder runs (overlays.js draws it)
    settings: { codec: 'normal', calm: false },   // start screen: codec SLOW / NORMAL, reduce flashes (kept across games)
    hold: false,            // debug: the loop draws but does not step the sim (test/ui-shot.mjs)
    clock: null,            // debug: a frozen animation clock (s)
    cursors: {},            // per module: { fx, codec } = the last st.fx / st.codec id it has read
    anim: {},               // per module: its own animation state (coin pops, odometer, typewriter ...)
  };
  view.toast = text => {
    view.toasts.push({ text, t0: view.now });
    if (view.toasts.length > 8) view.toasts.shift();
  };
  return view;
}

export function resetView(view) {
  Object.assign(view, { hover: null, placing: null, selected: null, focus: newFocus(), pin: newPin(), autoAt: newPin(), research: null,
    panel: null, drag: null, paused: false, fast: false, modal: false, slow: 1, toasts: [], shake: null, codecLine: null, cursors: {}, anim: {} });
}
function newPin() { return { ext: -1e9, int: -1e9 }; }

// a new game shows each side's G1 lane, whose id is the side's own
function newFocus() { return { ext: 'ext', int: 'int' }; }

// =================== lane focus: which lane each track shows ===================
// A tab click (or Tab / [ ]) pins its choice for PIN_S s; auto-focus (tracks.js: an unfocused lane turns red) moves a
// track at most once every AUTO_GAP s, and never while it is pinned.

export const PIN_S = 20, AUTO_GAP = 10;
export function focusLane(view, side, id, pin = true) {
  if (view.focus[side] !== id) console.log(`[handoff] focus ${side}: ${id}${pin ? ' (pinned)' : ' (auto)'}`);
  view.focus[side] = id;
  if (pin) view.pin[side] = view.now + PIN_S;
  else view.autoAt[side] = view.now;
}

// a module's own corner of the view: animOf(c.view, 'tracks', () => ({ pops: [] }))
export const animOf = (view, name, init) => view.anim[name] || (view.anim[name] = init());
export const cursorOf = (view, name) => view.cursors[name] || (view.cursors[name] = { fx: 0, codec: 0 });

// =================== reading the sim's append-only logs ===================
// st.fx and st.codec only grow (old entries are trimmed from the front). drain() returns the entries newer than the
// cursor, oldest first, and moves the cursor. Call it every frame, or trimmed entries are lost.
//   for (const e of drain(c.st, cursorOf(c.view, 'tracks'))) ...            st.fx
//   for (const m of drain(c.st, cursorOf(c.view, 'codec'), 'codec')) ...    st.codec
// It counts with the sim's counters (st.fxId, st.codecId), not entry ids: an fx whose data has an `id` key ('event',
// 'card') overwrites its own numeric id with a string. So never key anything on e.id of an fx.

export function drain(st, cur, key = 'fx') {
  const list = st[key], last = st[key + 'Id'];
  const n = Math.min(list.length, last - cur[key]);
  cur[key] = last;
  return n > 0 ? list.slice(list.length - n) : [];
}

// sim seconds since an fx happened. Start its animation at t0 = c.t − fxAge(c.st, e) and skip it if it is already
// older than the animation: a jump of the sim (tab wake-up, the harness) then shows only what is still fresh.
export const fxAge = (st, e) => Math.max(0, st.t - e.t);
