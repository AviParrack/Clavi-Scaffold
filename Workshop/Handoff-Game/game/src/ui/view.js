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
    sellArm: null,          // { lane, slot, layer, at }: a first right-click armed SELL? here (rightClickSells)
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
  // a refused action prints as an error on the operator's prompt; info = true prints a plain note
  view.toast = (text, info = false) => {
    view.toasts.push({ text, t0: view.now, info });
    if (view.toasts.length > 8) view.toasts.shift();
  };
  return view;
}

export function resetView(view) {
  Object.assign(view, { hover: null, placing: null, selected: null, focus: newFocus(), sellArm: null, research: null,
    panel: null, drag: null, paused: false, fast: false, modal: false, slow: 1, toasts: [], shake: null, codecLine: null, cursors: {}, anim: {} });
}

// a new game shows each side's G1 lane, whose id is the side's own
function newFocus() { return { ext: 'ext', int: 'int' }; }

// =================== lane focus: which lane each track shows ===================
// Only the player moves a track: a tab click, Tab / [ ], or their own OPEN LANE. A lane in trouble out of view flashes
// its tab (tracks.js alertLanes) and never takes the track: another lane's stack would read as yours, wiped.

export function focusLane(view, side, id) {
  if (view.focus[side] !== id) console.log(`[handoff] focus ${side}: ${id}`);
  view.focus[side] = id;
}

// =================== right-click on a filled mount ===================
// It cancels first: an element being placed, an open panel, a research card waiting for its mount. Then it sells in two
// steps: the first right-click arms SELL? on that mount (a red frame, a note on the prompt), a second one on the same
// mount within SELL_ARM_S s sells. So a right-click meant as "cancel" or "deselect" never sells by itself.

export const SELL_ARM_S = 1.5;

export function rightClickCancels(view) {
  if (view.research) return true;                          // the card waits for its mount: Esc banks it
  if (!view.placing && !view.selected) return false;
  view.placing = null; view.selected = null; view.sellArm = null;
  console.log('[handoff] right-click: cancelled, nothing sold');
  return true;
}

// true: sell now (the second right-click). false: this one only armed SELL? (the caller says so on the prompt)
export function rightClickSells(view, lane, slot, layer) {
  if (sellArmed(view, lane, slot, layer)) { view.sellArm = null; return true; }
  view.sellArm = { lane, slot, layer, at: performance.now() };
  console.log(`[handoff] right-click: SELL? armed on ${lane}/${slot} (${layer})`);
  return false;
}
// is SELL? armed on this mount (for its red frame)
export function sellArmed(view, lane, slot, layer) {
  const a = view.sellArm;
  return !!a && a.lane === lane && a.slot === slot && a.layer === layer && performance.now() - a.at <= SELL_ARM_S * 1000;
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
