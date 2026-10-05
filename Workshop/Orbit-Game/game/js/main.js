// ======================================================================
//  MAIN  —  input, URL params, game loop, crash guard
//  ?debug=1 or #debug  overlay + self-test     ?seed=N  rubble layout
//  ?spawn=pad|orbit|belt|kiwi  (or #belt etc.)  starting spot
// ======================================================================

(() => {

  const params = new URLSearchParams(location.search), hash = location.hash.slice(1);
  const DEBUG = params.get('debug') === '1' || hash === 'debug';
  const SEED = parseInt(params.get('seed') || '7', 10);
  let spawn = params.get('spawn') || (Game.SPAWNS.includes(hash) ? hash : 'pad');

  const canvas = document.getElementById('game');
  Render.init(canvas, SEED);
  window.addEventListener('resize', () => Render.resize(canvas));

  let g = Game.create(SEED, spawn);
  window.ORBIT = { get game() { return g; }, CONFIG, Physics, World, Render };   // console handle

  let lastErr = null;
  const restart = () => { g = Game.create(SEED, spawn); Render.cam.map = false; lastErr = null; };

  // ---------------- keyboard ----------------

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Period') g.warpIdx = Math.min(CONFIG.sim.warps.length - 1, g.warpIdx + 1);
    if (e.code === 'Comma')  g.warpIdx = Math.max(0, g.warpIdx - 1);
    if (e.code === 'KeyM' || e.code === 'Tab') { Render.cam.map = !Render.cam.map; Render.cam.userZoom = 1; }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') zoom(1.25);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoom(0.8);
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyT') { spawn = Game.SPAWNS[(Game.SPAWNS.indexOf(spawn) + 1) % Game.SPAWNS.length]; restart(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  function zoom(f) { Render.cam.userZoom = Math.min(10, Math.max(0.02, Render.cam.userZoom * f)); }

  // ---------------- touch buttons ----------------

  const touch = {};
  document.querySelectorAll('[data-touch]').forEach((b) => {
    const k = b.dataset.touch, hold = !['map', 'spawn'].includes(k);
    const on = (e) => { e.preventDefault(); if (hold) touch[k] = true; else if (k === 'map') Render.cam.map = !Render.cam.map; else { spawn = Game.SPAWNS[(Game.SPAWNS.indexOf(spawn) + 1) % Game.SPAWNS.length]; restart(); } };
    const off = (e) => { e.preventDefault(); touch[k] = false; };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  });

  function readInput() {
    const k = (c) => keys.has(c);
    return {
      thrust: k('KeyW') || k('Space') || touch.thrust,
      fine:   k('ShiftLeft') || k('ShiftRight'),
      rotL:   k('KeyA') || touch.rotL,
      rotR:   k('KeyD') || touch.rotR,
      kill:   k('KeyS') || touch.kill,
      fwd:    (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0),
      left:   (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0),
    };
  }

  // ---------------- debug self-test ----------------

  if (DEBUG) {
    const w = World.create({ ...CONFIG, bodies: [CONFIG.bodies[0]] }, 1), c = w.bodies[0], r0 = 360;
    const sh = Physics.newShip(CONFIG); Object.assign(sh, { x: r0, y: 0, vx: 0, vy: Math.sqrt(c.mu / r0) });
    const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / c.mu), E0 = Physics.orbitRel(sh, c, 0, w).E, dt = CONFIG.sim.dt;
    let t = 0; const off = { main: 0, rot: 0, kill: false, fwd: 0, left: 0 };
    for (; t < T; t += dt) Physics.step(sh, off, t, dt, w, CONFIG);
    const err = Math.abs(Math.hypot(sh.x, sh.y) - r0) / r0, dE = Math.abs((Physics.orbitRel(sh, c, t, w).E - E0) / E0);
    console.log(`[orbit] self-test: one Ceres orbit, radius err ${err.toExponential(2)}, energy err ${dE.toExponential(2)}  ${err < 1e-3 && dE < 1e-6 ? 'PASS' : 'FAIL'}`);
  }

  // ---------------- loop (a thrown error is shown, never freezes the game) ----------------

  let last = performance.now();
  window.addEventListener('error', (e) => { lastErr = e.message; });
  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    try {
      Game.update(g, readInput(), dt);
      Render.draw(g, dt, DEBUG);
    } catch (err) {
      lastErr = err.message; console.error(err);
    }
    if (lastErr) Render.drawError(lastErr);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

})();
