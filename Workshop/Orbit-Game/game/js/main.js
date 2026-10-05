// ======================================================================
//  MAIN  —  input, URL params, game loop
//  URL: ?debug=1 overlay + self-test,  ?seed=N scenery
// ======================================================================

(() => {

  const params = new URLSearchParams(location.search);
  const DEBUG = params.get('debug') === '1' || location.hash.includes('debug');
  const SEED = parseInt(params.get('seed') || '7', 10);

  const canvas = document.getElementById('game');
  Render.init(canvas, SEED);
  window.addEventListener('resize', () => Render.resize(canvas));

  let g = Game.create(SEED);
  window.ORBIT = { get game() { return g; }, CONFIG, Physics, Render };   // console handle

  // ---------------- input ----------------

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyQ') g.hold = g.hold === 'pro' ? null : 'pro';
    if (e.code === 'KeyE') g.hold = g.hold === 'retro' ? null : 'retro';
    if (e.code === 'Period') g.warpIdx = Math.min(CONFIG.sim.warps.length - 1, g.warpIdx + 1);
    if (e.code === 'Comma')  g.warpIdx = Math.max(0, g.warpIdx - 1);
    if (e.code === 'KeyM' || e.code === 'Tab') { Render.cam.map = !Render.cam.map; Render.cam.userZoom = 1; e.preventDefault(); }
    if (e.code === 'KeyR') { g = Game.create(SEED); Render.cam.map = false; console.log('[orbit] restart'); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    Render.cam.userZoom = Math.min(8, Math.max(0.05, Render.cam.userZoom * Math.exp(-e.deltaY * 0.0015)));
  }, { passive: false });

  // ---------------- touch buttons (phones / tablets) ----------------

  const touch = { left: false, right: false, thrust: false };
  document.querySelectorAll('[data-touch]').forEach((b) => {
    const k = b.dataset.touch;
    const on = (e) => { e.preventDefault(); if (k in touch) touch[k] = true; else tap(k); };
    const off = (e) => { e.preventDefault(); if (k in touch) touch[k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off);
  });
  function tap(k) {
    if (k === 'pro') g.hold = g.hold === 'pro' ? null : 'pro';
    if (k === 'map') { Render.cam.map = !Render.cam.map; Render.cam.userZoom = 1; }
    if (k === 'restart') g = Game.create(SEED);
  }

  function readInput() {
    return {
      left:   keys.has('KeyA') || keys.has('ArrowLeft') || touch.left,
      right:  keys.has('KeyD') || keys.has('ArrowRight') || touch.right,
      thrust: keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space') || touch.thrust,
      fine:   keys.has('ShiftLeft') || keys.has('ShiftRight'),
    };
  }

  // ---------------- debug self-test on load ----------------

  if (DEBUG) {
    const P = CONFIG.planet, r0 = P.R + 300, s = { x: r0, y: 0, vx: 0, vy: Math.sqrt(P.mu / r0), angle: 0, fuel: 0 };
    const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / P.mu), E0 = Physics.energy(s, P);
    for (let t = 0; t < T; t += CONFIG.sim.dt) Physics.step(s, 0, CONFIG.sim.dt, CONFIG);
    const err = Math.abs(Physics.radius(s) - r0) / r0, dE = Math.abs((Physics.energy(s, P) - E0) / E0);
    console.log(`[orbit] self-test: one circular orbit, radius err ${err.toExponential(2)}, energy err ${dE.toExponential(2)}  ${err < 1e-3 && dE < 1e-6 ? 'PASS' : 'FAIL'}`);
    console.log('[orbit] config', CONFIG);
  }

  // ---------------- loop ----------------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    Game.update(g, readInput(), dt);
    Render.draw(g, dt, DEBUG);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

})();
