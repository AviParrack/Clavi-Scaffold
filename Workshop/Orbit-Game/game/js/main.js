// ======================================================================
//  MAIN  —  input (keys, mouse, touch, warp buttons), URL params, loop
//  ?debug=1 or #debug   overlay + self-test        ?seed=N   world layout
//  ?dev=1 or #dev       dev mode: $50k, no save, T cycles spawn points
//  ?spawn=pad|orbit|belt|kiwi|potato|glimmer|hub  (or #kiwi etc.)
//  ?fresh=1             ignore the saved game
// ======================================================================

(() => {

  const params = new URLSearchParams(location.search), hash = location.hash.slice(1);
  const DEBUG = params.get('debug') === '1' || hash === 'debug';
  const DEV = params.get('dev') === '1' || hash === 'dev';
  const SEED = parseInt(params.get('seed') || '7', 10);
  const spawn = params.get('spawn') || (Game.SPAWNS[hash] ? hash : null);
  const fresh = params.get('fresh') === '1';

  const canvas = document.getElementById('game');
  Render.init(canvas, SEED);
  window.addEventListener('resize', () => Render.resize(canvas));

  let g = Game.create(SEED, spawn, { dev: DEV, fresh });
  window.ORBIT = { get game() { return g; }, set game(v) { g = v; }, CONFIG, Physics, World, Terrain, Game, Render };   // console handle

  let lastErr = null;

  // ---------------- keyboard ----------------

  const keys = new Set();
  let pressed = [];
  const typing = (e) => e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyM') { Render.cam.map = !Render.cam.map; Render.cam.userZoom = 1; return; }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { zoom(1.25); return; }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { zoom(0.8); return; }
    pressed.push(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  function zoom(f) { Render.cam.userZoom = Math.min(10, Math.max(0.02, Render.cam.userZoom * f)); }

  // ---------------- mouse (world coords filled in each frame) ----------------

  const mouse = { sx: 0, sy: 0, x: 0, y: 0, px: 1, down: false, pressed: false, released: false, button: 0, right: false };
  canvas.addEventListener('mousemove', (e) => { mouse.sx = e.clientX; mouse.sy = e.clientY; });
  canvas.addEventListener('mousedown', (e) => {
    mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.button = e.button;
    if (e.button === 0) { mouse.down = true; mouse.pressed = true; }
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) { mouse.down = false; mouse.released = true; } if (e.button === 2) mouse.right = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------- touch buttons ----------------

  const touch = {};
  document.querySelectorAll('[data-touch]').forEach((b) => {
    const k = b.dataset.touch, hold = !['map', 'spawn', 'use'].includes(k);
    const on = (e) => { e.preventDefault(); if (hold) touch[k] = true; else if (k === 'map') Render.cam.map = !Render.cam.map; else pressed.push(k === 'use' ? 'KeyE' : 'KeyF'); };
    const off = (e) => { e.preventDefault(); touch[k] = false; };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  });

  // ---------------- warp bar ----------------

  const warpVal = document.getElementById('warpval'), pauseBtn = document.querySelector('[data-warp="pause"]');
  document.querySelectorAll('[data-warp]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault(); b.blur();
    const k = b.dataset.warp;
    if (k === 'pause') g.paused = !g.paused;
    if (k === 'up') Game.warpStep(g, +1);
    if (k === 'down') Game.warpStep(g, -1);
    if (k === 'max') { g.paused = false; g.warpIdx = CONFIG.sim.warps.length - 1; if (g.warpMax < 64) Game.toast(g, `WARP CAPPED AT ${g.warpMax}x: ${g.warpWhy}`.toUpperCase(), '#ffd166', 'warp'); }
  }));
  let lastWarpTxt = '';
  function updateWarpBar() {
    const want = CONFIG.sim.warps[g.warpIdx];
    const txt = g.paused || g.ui ? 'PAUSED' : `${g.warp}×${want > g.warp ? `<small>max ${g.warpMax}×</small>` : ''}`;
    if (txt !== lastWarpTxt) { warpVal.innerHTML = txt; lastWarpTxt = txt; }
    pauseBtn.classList.toggle('on', !!g.paused);
  }

  // ---------------- debug self-test ----------------

  if (DEBUG) {
    const w = World.create({ ...CONFIG, bodies: [CONFIG.bodies[0]], rubble: [] }, 1), c = w.bodies[0], r0 = 360, S = CONFIG.ship;
    const sh = Physics.newShip(S); Object.assign(sh, { x: r0, y: 0, vx: 0, vy: Math.sqrt(c.mu / r0) });
    const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / c.mu), E0 = Physics.orbitRel(sh, c, 0, w).E, dt = CONFIG.sim.dt;
    let t = 0; const off = { main: 0, ion: 0, rot: 0, kill: false, fwd: 0, left: 0 };
    for (; t < T; t += dt) Physics.step(sh, off, t, dt, w, S);
    const err = Math.abs(Math.hypot(sh.x, sh.y) - r0) / r0, dE = Math.abs((Physics.orbitRel(sh, c, t, w).E - E0) / E0);
    console.log(`[orbit] self-test: one Ceres orbit, radius err ${err.toExponential(2)}, energy err ${dE.toExponential(2)}  ${err < 1e-3 && dE < 1e-6 ? 'PASS' : 'FAIL'}`);
  }

  // ---------------- loop (a thrown error is shown, never freezes the game) ----------------

  let last = performance.now();
  window.addEventListener('error', (e) => { lastErr = e.message; });
  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    try {
      [mouse.x, mouse.y] = Render.screenToWorld(mouse.sx, mouse.sy); mouse.px = 1 / Render.cam.zoom;
      const inp = { keys, pressed, mouse, touch };
      pressed = [];
      Game.update(g, inp, dt);
      mouse.pressed = false; mouse.released = false;
      Render.draw(g, dt, DEBUG);
      updateWarpBar();
      if (lastErr && !g.err) lastErr = null;
    } catch (err) {
      lastErr = err.message; console.error(err);
    }
    if (lastErr) Render.drawError(lastErr);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

})();
