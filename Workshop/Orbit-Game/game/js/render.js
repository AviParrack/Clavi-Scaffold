// ======================================================================
//  RENDER  —  toon-shaded asteroids, terrain overlay, ship, path preview,
//  nav target, comic HUD.  Camera follows the ship (fixed orientation),
//  the ref body in the local map, the whole Crumb Belt in the belt map
//  (M cycles off -> local -> belt), or a module's camera hook (EVA: rotated
//  so local up is screen up).  Light comes from the star Ember.
//  Modules draw through Render.kit.  v4: the ship grows by frame (Prospector
//  -> Mule -> Hauler -> Barge -> Leviathan) with nozzles by engine and plumes
//  by fuel family; drawRockAt paints rail and free rocks by type;
//  drawShipAt paints any ship on any canvas (shop silhouettes).
// ======================================================================

const Render = (() => {

  let ctx, W, H, stars, nebula;
  const cam = { x: 0, y: 0, zoom: 2, rot: 0, userZoom: 1, map: 0, shx: 0, shy: 0 };   // map: 0 off · 1 local · 2 belt
  const MAP_NAMES = ['', 'MAP', 'BELT MAP'];

  const INK = '#1b1433', PAPER = '#fff4dc', PAPER2 = '#ffe2b0';
  const COL = { path: '#fff1a8', pathEsc: '#ff9ec7', impact: '#ff5d5d', good: '#33c27a', warn: '#ff9f1c', bad: '#e63946',
                pro: '#ffd166', retro: '#ff8fab', tgt: '#7cf5d6', dim: '#6d5f8a', text: INK, money: '#2f9e5b' };
  const LIGHT = norm(-0.55, 0.83);                                // unit vector toward Ember, updated in place every frame (and per body in the belt map)
  const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif';

  function norm(x, y) { const n = Math.hypot(x, y); return [x / n, y / n]; }

  // ---------------- init ----------------

  // ---------------- a counted save stack: a module that throws between save and restore cannot leak a clip into every later frame ----------------
  let depth = 0;
  function countSaves(c) {
    if (c.counted) return; c.counted = true;
    const save = c.save.bind(c), restore = c.restore.bind(c);
    c.save = () => { depth++; save(); };
    c.restore = () => { if (depth > 0) depth--; restore(); };
  }
  const unwind = (d) => { while (depth > d) ctx.restore(); };

  function init(canvas, seed) {
    ctx = canvas.getContext('2d');
    countSaves(ctx);
    const rand = World.rng(seed + 1);
    stars = Array.from({ length: 360 }, () => ({ x: rand(), y: rand(), b: 0.25 + 0.75 * rand(), s: rand() < 0.08 ? 2.5 : 1.2, tw: rand() * 6 }));
    nebula = Array.from({ length: 6 }, () => ({ x: rand(), y: rand(), r: 0.25 + rand() * 0.35, hue: rand() < 0.5 ? '120,80,200' : '60,170,190' }));
    resize(canvas);
  }

  function resize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------------- camera ----------------

  function updateCamera(g, dt) {
    const k = 1 - Math.exp(-dt * 6);
    const ov = cam.map ? null : Game.first(g, 'camera');
    let tx, ty, tz, tr = 0, snap = true;
    if (ov) { tx = ov.x; ty = ov.y; tz = (ov.zoom || 18) * cam.userZoom; tr = ov.rot || 0; snap = ov.snap !== false; }
    else if (cam.map === 2) {                                       // the whole belt round Ember; zooming in slides toward the ship
      const k = Math.max(0, Math.min(1, (cam.userZoom - 1) / 3)), ext = beltExtent(g);
      tx = g.sh.x * k; ty = g.sh.y * k; tz = Math.min(W, H) * 0.47 / ext * cam.userZoom; snap = false;
    } else if (cam.map) {
      const fb = frameBody(g), [bx, by] = frameState(g, g.t);
      let ext = fb ? fb.R * 2.2 : 50;
      if (g.pred) for (const p of relPath(g)) ext = Math.max(ext, Math.hypot(p[0] - bx, p[1] - by));
      ext = Math.max(ext, Math.hypot(g.sh.x - bx, g.sh.y - by));
      tx = bx; ty = by; tz = Math.min(W, H) * 0.45 / ext * cam.userZoom; snap = false;
    } else {                                                        // flight: bigger frames sit a little further back
      const f = flightView(g, k);
      tx = g.sh.x + f.ox; ty = g.sh.y + f.oy; tz = f.zoom * cam.userZoom;
    }
    cam.x += (tx - cam.x) * (snap ? 1 : k); cam.y += (ty - cam.y) * (snap ? 1 : k);
    cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(tz) - Math.log(cam.zoom)) * k);
    let dr = ((tr - cam.rot) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    cam.rot += dr * Math.min(1, k * 1.5);
    const sk = g.shake * g.shake * 9;
    cam.shx = (Math.random() - 0.5) * sk; cam.shy = (Math.random() - 0.5) * sk;
  }

  // while towing (Haul.towInfo), zoom out to fit ship and rock (1.5-4 px/m) and lean the view toward the rock; the
  //  offset eases, so a grapple slides the view over instead of jumping, and +/- still scale it
  const towView = { ox: 0, oy: 0 };
  function flightView(g, k) {
    const base = 4 * Math.pow(9 / Math.max(9, g.S.length || 9), 0.25);
    const ti = haulOn(g) && Haul.towInfo ? Haul.towInfo(g) : null;
    let zoom = base, ox = 0, oy = 0;
    if (ti) {
      const dx = ti.x - g.sh.x, dy = ti.y - g.sh.y, d = Math.hypot(dx, dy), need = 0.55 * d + ti.r + 0.6 * (g.S.length || 9);
      zoom = Math.max(1.5, Math.min(base, Math.min(W, H) * 0.42 / need));
      ox = dx * 0.4; oy = dy * 0.4;
    }
    towView.ox += (ox - towView.ox) * k; towView.oy += (oy - towView.oy) * k;
    return { zoom, ox: towView.ox, oy: towView.oy };
  }

  function toScreen(x, y) {
    const dx = x - cam.x, dy = y - cam.y, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return [W / 2 + (dx * c + dy * s) * cam.zoom + cam.shx, H / 2 - (-dx * s + dy * c) * cam.zoom + cam.shy];
  }
  function screenToWorld(sx, sy) {
    const rx = (sx - W / 2 - cam.shx) / cam.zoom, ry = -(sy - H / 2 - cam.shy) / cam.zoom, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return [cam.x + rx * c - ry * s, cam.y + rx * s + ry * c];
  }
  const px = () => 1 / cam.zoom;                                    // one screen pixel in world units
  const screenAng = (a) => -(a - cam.rot);                          // world angle -> canvas rotation angle
  function worldTransform() { ctx.translate(W / 2 + cam.shx, H / 2 + cam.shy); ctx.scale(cam.zoom, -cam.zoom); ctx.rotate(-cam.rot); ctx.translate(-cam.x, -cam.y); }
  function viewRect(pad = 0) {
    const cs = [screenToWorld(0, 0), screenToWorld(W, 0), screenToWorld(0, H), screenToWorld(W, H)];
    return [Math.min(...cs.map((c) => c[0])) - pad, Math.min(...cs.map((c) => c[1])) - pad, Math.max(...cs.map((c) => c[0])) + pad, Math.max(...cs.map((c) => c[1])) + pad];
  }
  const onScreen = (sx, sy, m = 30) => sx > -m && sx < W + m && sy > -m && sy < H + m;

  // the frame paths are drawn in: the reference body (so orbits around moving rocks close); out in the belt the
  //  nav target or the nearest asteroid (g.frame, set by the core); in the belt map plain Ember-centred space
  const frameOf = (g) => (cam.map === 2 ? null : g.frame || { id: 'body:' + g.ref.id, body: g.ref, state: (t) => World.bodyState(g.w, g.ref, t) });
  const frameBody = (g) => { const f = frameOf(g); return f ? f.body || null : null; };
  const frameState = (g, t) => { const f = frameOf(g); return f ? f.state(t) : [0, 0, 0, 0]; };

  // predicted path, re-expressed relative to the frame
  let relMemo = { pred: null, fid: null, t: NaN, path: [] };              // camera and draw both want it: build once per frame
  function relPath(g) {
    if (!g.pred) return [];
    const M = relMemo, f = frameOf(g), fid = f ? f.id : 'belt';
    if (M.pred === g.pred && M.fid === fid && M.t === g.t) return M.path;
    const [bx0, by0] = frameState(g, g.t);
    const path = g.pred.pts.map(([x, y, t]) => { const [bx, by] = frameState(g, t); return [x - bx + bx0, y - by + by0, t]; });
    relMemo = { pred: g.pred, fid, t: g.t, path };
    return path;
  }
  function relPoint(g, x, y, t) {
    const [bx0, by0] = frameState(g, g.t), [bx, by] = frameState(g, t);
    return [x - bx + bx0, y - by + by0];
  }

  // light: a unit vector toward the nearest star from (x, y), written into LIGHT in place
  function lightFrom(g, x, y) {
    const sun = g.w.root, [sx, sy] = World.bodyState(g.w, sun, g.t), dx = sx - x, dy = sy - y, d = Math.hypot(dx, dy);
    if (!sun.star || d < 1) return;
    LIGHT[0] = dx / d; LIGHT[1] = dy / d;
  }
  const beltExtent = (g) => Math.max(...g.w.bodies.map((b) => (b.par === g.w.root ? b.a + (b.hill || 0) : 0)), 10000) * 1.04;

  // ---------------- frame ----------------

  let layout = { left: 12, right: 12, rw: 0, lx: 12, rx: 0, dx: 0, lMax: 1e9, rMax: 1e9 }, panels = [], g0 = null;

  function draw(g, dt, debug) {
    unwind(0);
    updateCamera(g, dt);
    g0 = g; edges = []; tagRects = [];
    Terrain.frameStart();
    lightFrom(g, cam.x, cam.y);
    const path = relPath(g), view = viewRect(20);
    drawSpace(g);
    ctx.save(); worldTransform();
    if (cam.map === 2) drawLanes(g);
    drawTrail(g);
    drawPath(g, path);
    for (const rk of g.w.rocks) drawRock(g, rk);
    for (const b of g.w.bodies) drawBody(g, b, view);
    lightFrom(g, cam.x, cam.y);
    drawPickups(g, view);
    eachDraw(g, 'drawWorld');
    ctx.restore();
    drawParticles(g);
    drawBodyLabels(g);
    if (cam.map === 2) drawBeltLabels(g);
    if (g.status !== 'dead') drawShip(g);
    ctx.save(); worldTransform(); eachDraw(g, 'drawWorldTop'); ctx.restore();
    drawPathTags(g, path);
    drawApproach(g, path);
    if (g.status !== 'dead') drawMarkers(g);
    drawPopups(g);
    eachDraw(g, 'drawScreen');
    drawHUD(g);
    if (debug) drawDebug(g);
    if (g.err) drawErrorBar(g.err);
  }

  function eachDraw(g, hook) {
    for (const m of Game.mods) {
      if (!m[hook]) continue;
      const d = depth; ctx.save(); layout.dx = 0;
      try { m[hook](g, kit); } catch (e) { const msg = `${m.id}.${hook}: ${e.message}`; if (g.err !== msg) { g.err = msg; console.error(e); } }
      unwind(d); layout.dx = 0;
    }
  }

  // ---------------- space backdrop (rotates with the camera) ----------------
  //  the stars drift only with the camera's motion relative to the frame body (the ref body, the nav target out in
  //  the belt, Ember in the belt map), so 29 m/s of belt orbit at 1024x does not stream them past like rain

  let starOff = [0, 0], starRef = null;
  function starShift(g) {
    const f = frameOf(g), id = f ? f.id : 'belt', [fx, fy] = f ? f.state(g.t) : [0, 0], rx = cam.x - fx, ry = cam.y - fy;
    if (starRef && starRef.id === id) { starOff[0] += rx - starRef.rx; starOff[1] += ry - starRef.ry; }
    starRef = { id, rx, ry };
    starOff = starOff.map((v) => v % 1e7);
  }

  function drawSpace(g) {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#171238'); gr.addColorStop(1, '#2b1752');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot), lx = LIGHT[0] * c + LIGHT[1] * s, ly = -LIGHT[0] * s + LIGHT[1] * c;   // Ember's way, on screen
    const gx = W / 2 + lx * W * 0.55, gy = H / 2 - ly * H * 0.6;
    const sun = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.7);
    sun.addColorStop(0, 'rgba(255,214,140,0.35)'); sun.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    starShift(g);
    const D = Math.hypot(W, H) * 1.05, now = g.real, ox = starOff[0], oy = starOff[1];
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot);
    for (const n of nebula) {
      const x = ((n.x * D - ox * 0.01) % D + D) % D - D / 2, y = ((n.y * D + oy * 0.01) % D + D) % D - D / 2;
      const ng = ctx.createRadialGradient(x, y, 0, x, y, n.r * D);
      ng.addColorStop(0, `rgba(${n.hue},0.10)`); ng.addColorStop(1, `rgba(${n.hue},0)`);
      ctx.fillStyle = ng; ctx.fillRect(-D / 2, -D / 2, D, D);
    }
    ctx.fillStyle = '#fff6e0';
    for (const st of stars) {
      const x = ((st.x * D - ox * 0.03) % D + D) % D - D / 2, y = ((st.y * D + oy * 0.03) % D + D) % D - D / 2;
      ctx.globalAlpha = st.b * (0.75 + 0.25 * Math.sin(now * 1.7 + st.tw));
      if (st.s > 2) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-1, -3, 2, 6); ctx.fillRect(-3, -1, 6, 2); ctx.restore(); }
      else ctx.fillRect(x, y, st.s, st.s);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------------- toon body ----------------

  function shapePath(out, cx, cy, R, rot = 0) {
    ctx.beginPath();
    const K = out.length;
    for (let i = 0; i <= K; i++) {
      const th = i / K * 2 * Math.PI + rot, r = R * out[i % K];
      i ? ctx.lineTo(cx + r * Math.cos(th), cy + r * Math.sin(th)) : ctx.moveTo(cx + r * Math.cos(th), cy + r * Math.sin(th));
    }
    ctx.closePath();
  }

  // inside: draw the ink line inside the outline only (bodies, so dug holes can open the edge)
  function toonBlob(out, cx, cy, R, rot, [base, shade, hi], lineW, inside = false) {
    shapePath(out, cx, cy, R, rot); ctx.fillStyle = shade; ctx.fill();
    ctx.save(); shapePath(out, cx, cy, R, rot); ctx.clip();
    shapePath(out, cx + LIGHT[0] * R * 0.3, cy + LIGHT[1] * R * 0.3, R, rot); ctx.fillStyle = base; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + LIGHT[0] * R * 0.48, cy + LIGHT[1] * R * 0.48, R * 0.28, R * 0.17, Math.atan2(LIGHT[1], LIGHT[0]) + Math.PI / 2, 0, 2 * Math.PI);
    ctx.fillStyle = hi; ctx.fill();
    if (inside) { shapePath(out, cx, cy, R, rot); ctx.strokeStyle = INK; ctx.lineWidth = lineW * 2; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.restore();
    if (!inside) { shapePath(out, cx, cy, R, rot); ctx.strokeStyle = INK; ctx.lineWidth = lineW; ctx.lineJoin = 'round'; ctx.stroke(); }
  }

  function drawBody(g, b, view) {
    const [x, y] = World.bodyState(g.w, b, g.t), Rb = b.R * (1 + b.shape) * (b.star ? 3 : 1);
    if (x + Rb < view[0] || x - Rb > view[2] || y + Rb < view[1] || y - Rb > view[3]) return;
    if (b.star) { drawStar(g, b, x, y); return; }
    if (cam.map === 2) lightFrom(g, x, y);
    if (b.R * cam.zoom < 3) {                                      // far away: a toon dot, never smaller than a few pixels
      const r = (b.par && b.par.par ? 2.5 : 4) * px();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = b.color[0]; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px(); ctx.stroke();
      return;
    }
    toonBlob(b.out, x, y, b.R, 0, b.color, 3.5 * px(), true);
    if (b.R * cam.zoom < 6) return;

    ctx.save(); shapePath(b.out, x, y, b.R); ctx.clip();
    const la = Math.atan2(LIGHT[1], LIGHT[0]), fade = Math.max(0.3, Math.min(1, (16 - cam.zoom) / 10));   // up close: a gentle dip
    for (const c of b.craters) {                                   // craters: shadowed near wall, sunlit floor, ink on the shadow side, lit far rim
      const cx = x + b.R * c.d * Math.cos(c.th), cy = y + b.R * c.d * Math.sin(c.th), cr = b.R * c.r;
      ctx.globalAlpha = fade * 0.85; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 2 * Math.PI); ctx.fillStyle = b.color[1]; ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(cx - LIGHT[0] * cr * 0.24, cy - LIGHT[1] * cr * 0.24, cr * 0.82, 0, 2 * Math.PI); ctx.fillStyle = b.color[0]; ctx.fill();
      ctx.globalAlpha = fade; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, cr, la - 1.25, la + 1.25); ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.93, la + Math.PI - 1.05, la + Math.PI + 1.05); ctx.strokeStyle = b.color[2]; ctx.lineWidth = Math.max(1.5 * px(), cr * 0.035); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (b.id === 'mochi') {                                        // a dusting of potato starch: every mochi has one
      const ox = x + b.R * 0.35, oy = y - b.R * 0.2;
      const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, b.R * 0.12);
      glow.addColorStop(0, 'rgba(230,255,255,0.95)'); glow.addColorStop(1, 'rgba(230,255,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ox, oy, b.R * 0.12, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#f4ffff'; ctx.beginPath(); ctx.arc(ox, oy, b.R * 0.025, 0, 2 * Math.PI); ctx.arc(ox + b.R * 0.05, oy + b.R * 0.03, b.R * 0.015, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();

    if (cam.zoom >= 0.9) Terrain.of(b);                           // build the grid once it is worth seeing
    if (b.id === 'mochi') drawPad(x, y, b);                       // under the terrain overlay, so holes dug beneath it show
    Terrain.draw(ctx, b, x, y, cam.zoom, view, g.real);
    if (b.id === 'mochi' && cam.zoom < 0.35) drawFace(g, x, y, b);
  }

  function drawPad(x, y, b) {
    ctx.save(); ctx.translate(x, y + World.surfaceR(b, Math.PI / 2));
    ctx.fillStyle = '#7d7aa6'; ctx.fillRect(-10, -1, 20, 2.2);
    ctx.fillStyle = '#625f8c'; ctx.fillRect(-10, -1, 20, 0.8); ctx.fillStyle = '#a19ec8'; ctx.fillRect(-10, 0.95, 20, 0.25);   // toon shade + lip
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px(); ctx.strokeRect(-10, -1, 20, 2.2);
    ctx.fillStyle = '#ff9f1c'; for (let i = -9; i < 10; i += 4) ctx.fillRect(i, 0.6, 2, 0.6);
    if (px() < 0.12) {                                             // close up the mast is a little lattice tower, not a slab
      ctx.beginPath(); for (let yy = 1.2; yy < 14; yy += 1.3) { ctx.moveTo(9.2, yy); ctx.lineTo(10.4, yy + 1.3); ctx.moveTo(10.4, yy); ctx.lineTo(9.2, yy + 1.3); }
      ctx.strokeStyle = '#a9a3d6'; ctx.lineWidth = 0.14; ctx.stroke();
      for (const [rx, col] of [[9, '#d8d4f2'], [10.25, '#9690c4']]) { ctx.fillStyle = col; ctx.fillRect(rx, 1.2, 0.35, 13); ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px(); ctx.strokeRect(rx, 1.2, 0.35, 13); }
      ctx.fillStyle = '#c9c4e8'; ctx.fillRect(8.8, 13.9, 2, 0.4); ctx.strokeRect(8.8, 13.9, 2, 0.4);
    } else { ctx.fillStyle = '#c9c4e8'; ctx.fillRect(9, 1.2, 1.6, 13); ctx.strokeRect(9, 1.2, 1.6, 13); }
    ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.arc(9.8, 15, 1.1, 0, 2 * Math.PI); ctx.fill();
    if (px() < 0.12) { ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#ffd0d0'; ctx.beginPath(); ctx.arc(9.45, 15.35, 0.3, 0, 2 * Math.PI); ctx.fill(); }
    ctx.restore();
  }

  // Mochi naps; it opens its eyes when you leave its neighbourhood
  function drawFace(g, x, y, b) {
    const k = b.R * 0.2, [cx, cy] = World.bodyState(g.w, b, g.t), awake = Math.hypot(g.sh.x - cx, g.sh.y - cy) > 650 || g.status === 'dead';
    ctx.save(); ctx.globalAlpha = Math.min(1, (0.35 - cam.zoom) / 0.12); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,150,170,0.45)';
    for (const sx of [-1.7, 1.7]) { ctx.beginPath(); ctx.arc(sx * k, -0.3 * k, 0.4 * k, 0, 2 * Math.PI); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 0.13 * k; ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      if (awake) { ctx.arc(sx * k, 0.25 * k, 0.24 * k, 0, 2 * Math.PI); ctx.fill(); }
      else { ctx.arc(sx * k, 0.4 * k, 0.32 * k, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    }
    ctx.beginPath();
    if (g.status === 'dead') ctx.arc(0, -0.8 * k, 0.28 * k, 0.15 * Math.PI, 0.85 * Math.PI);
    else ctx.arc(0, -0.35 * k, 0.28 * k, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke(); ctx.restore();
  }

  // ---------------- Ember: a glowing toon sun (no ground: fly within 3 radii and SIZZLE) ----------------

  function drawStar(g, b, x, y) {
    const R = cam.map ? Math.max(b.R, 21 * px()) : b.R, t = g.real;    // on the map Ember stays big enough to show her face
    for (const [k, a] of [[3.2, 0.10], [2.2, 0.16], [1.55, 0.28]]) {
      const gl = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * k);
      gl.addColorStop(0, `rgba(255,190,90,${a})`); gl.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, R * k, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.beginPath();                                               // wobbly flame rays
    for (let i = 0; i <= 64; i++) {
      const a = i / 64 * 2 * Math.PI, r = R * (1.16 + 0.07 * Math.sin(9 * a + t * 1.3) + 0.05 * Math.sin(5 * a - t * 0.9));
      i ? ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath(); ctx.fillStyle = '#ffb347'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3 * px(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fillStyle = b.color[0]; ctx.fill();
    ctx.beginPath(); ctx.arc(x - R * 0.28, y + R * 0.3, R * 0.5, 0, 2 * Math.PI); ctx.fillStyle = b.color[2]; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 3.5 * px(); ctx.stroke();
    const k = R * 0.16, hot = g.starR < CONFIG.sim.starWarn && g.status !== 'dead';   // sleepy face; wide awake when you come too close
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 0.18 * k; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(255,110,90,0.5)';
    for (const sx of [-2.2, 2.2]) { ctx.beginPath(); ctx.arc(sx * k, -0.6 * k, 0.55 * k, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = INK;
    for (const sx of [-1.2, 1.2]) {
      ctx.beginPath();
      if (hot) { ctx.arc(sx * k, 0.4 * k, 0.32 * k, 0, 2 * Math.PI); ctx.fill(); }
      else { ctx.arc(sx * k, 0.6 * k, 0.4 * k, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    }
    ctx.beginPath();
    if (hot) ctx.arc(0, -0.8 * k, 0.35 * k, 0, 2 * Math.PI); else ctx.arc(0, -0.4 * k, 0.4 * k, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
    if (cam.map) {                                                 // the SIZZLE zone
      ctx.setLineDash([12 * px(), 10 * px()]); ctx.strokeStyle = 'rgba(255,93,93,0.7)'; ctx.lineWidth = 2 * px();
      ctx.beginPath(); ctx.arc(x, y, b.killR, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ---------------- belt map: lanes, streams, names ----------------

  function drawLanes(g) {
    const sun = g.w.root, [sx, sy] = World.bodyState(g.w, sun, g.t), lanes = new Map();
    for (const b of g.w.bodies) if (b.par === sun) lanes.set(b.a, b.id === 'mochi' || lanes.get(b.a) || false);
    ctx.lineWidth = 1.5 * px();
    for (const [a, home] of lanes) {
      ctx.setLineDash([6 * px(), 8 * px()]); ctx.strokeStyle = home ? 'rgba(233,207,224,0.45)' : 'rgba(217,207,245,0.25)';
      ctx.beginPath(); ctx.arc(sx, sy, a, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.setLineDash([]);
    const streams = {}, home = g.w.byId.mochi ? g.w.byId.mochi.a : 0;   // the rubble streams (inside / outside Mochi's lane) as soft bands
    for (const rk of g.w.rocks) if (rk.host === sun && !rk.gone) {
      const k = rk.a < home ? 'in' : 'out', s = streams[k] || (streams[k] = [Infinity, 0]);
      s[0] = Math.min(s[0], rk.a - rk.ae); s[1] = Math.max(s[1], rk.a + rk.ae);
    }
    for (const [lo, hi] of Object.values(streams)) {
      ctx.beginPath(); ctx.arc(sx, sy, (lo + hi) / 2, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(169,155,200,0.10)'; ctx.lineWidth = hi - lo; ctx.stroke();
    }
  }

  function drawBeltLabels(g) {
    const st = World.states(g.w, g.t), obs = hudRects();             // last frame's HUD panels, title and prompts
    const [x, y] = toScreen(g.sh.x, g.sh.y);
    ctx.fillStyle = COL.pro; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x - 7, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    tagRects.push([x - 8, y - 10, x + 8, y + 7]);
    if (!freeTag(x, y, 22, 22, 'YOU', COL.pro, obs)) tag(x, y + 22, 'YOU', COL.pro);
    const bodies = [...g.w.bodies].sort((a, b) => (b.star ? 2 : b.id === 'mochi' ? 1 : 0) - (a.star ? 2 : a.id === 'mochi' ? 1 : 0));
    for (const b of bodies) {
      const [bx, by] = toScreen(st[b.idx][0], st[b.idx][1]);
      if (!onScreen(bx, by, 0)) continue;
      if (b.par && b.par.par) {                                    // moons: named only once they have room
        const [px2, py2] = toScreen(st[b.par.idx][0], st[b.par.idx][1]);
        if (Math.hypot(bx - px2, by - py2) < 40) continue;
      }
      if (b.R * cam.zoom > 4 && !b.star) continue;                // big enough: drawBodyLabels names it
      const r = Math.max(12, b.R * cam.zoom + 10);
      freeTag(bx, by, r, r + 12, b.name, b.star ? '#ffd36b' : b.color[2], obs);
    }
    for (const sw of g.w.swarms) {
      const [sx, sy] = toScreen(...World.swarmState(g.w, sw, g.t));
      if (onScreen(sx, sy, 0)) freeTag(sx, sy, 18, 18, sw.name, '#c9b8e8', obs);
    }
  }

  // a belt-map name above, below, right or left of its dot, at the first spot clear of other names and the HUD; else skipped
  function freeTag(x, y, up, down, text, col, obs) {
    ctx.font = `600 13px ${FONT}`;
    const w = ctx.measureText(text).width / 2;
    for (const [dx, dy] of [[0, -up], [0, down], [w + 14, 4], [-w - 14, 4]]) {
      const r = [x + dx - w, y + dy - 11, x + dx + w, y + dy + 3];
      if (r[0] < 4 || r[2] > W - 4 || r[1] < 4 || r[3] > H - 4) continue;
      if (tagRects.some((p) => overlap(p, r, 3)) || obs.some((o) => overlap(o, r))) continue;
      tag(x + dx, y + dy, text, col);
      return true;
    }
    return false;
  }

  // ---------------- rocks: one painter for rail and free rocks (haul paints its free rocks through it) ----------------
  //  colours by type once you know it (Haul.TYPES), else v3's three tones. Big on screen a rock gets craters, a cool
  //  bounce-light rim on its night side and its type's marks; tiny ones are one flat fill.

  const ROCK_COLS = [['#b8a99a', '#76665f', '#e2d6c8'], ['#a69bb8', '#675c7c', '#d6cde6'], ['#c4a37f', '#7e6248', '#ecd2b0']];
  const ROUND = Array(12).fill(1), DETAIL = new WeakMap(), DULL = new Map();
  const haulOn = (g) => typeof Haul !== 'undefined' && !!Haul && !!(g.mod && g.mod.haul);

  // [palette, known type or null, Haul.info or null]
  function rockPal(g, rk) {
    let pal = ROCK_COLS[Math.min(2, Math.floor((rk.tone || 0) * 3))], type = null, inf = null;
    if (haulOn(g) && Haul.TYPES) {
      type = rk.type || (Haul.typeOf ? Haul.typeOf(g, rk) : null);
      if (Haul.TYPES[type] && (Haul.known ? Haul.known(g, rk) : !!rk.type)) pal = Haul.TYPES[type].col; else type = null;
      if (type && Haul.info) inf = Haul.info(g, rk);
    }
    if ((inf ? inf.oreKg : rk.oreKg) === 0) {                      // TAILINGS: nothing left worth digging
      if (!DULL.has(pal)) DULL.set(pal, pal.map((c) => mix(c, '#8d8a96', 0.6)));
      pal = DULL.get(pal);
    }
    return [pal, type, inf];
  }
  function rockDetail(rk) {                                        // seeded by id, so a grappled rock keeps its face
    let d = DETAIL.get(rk);
    if (d) return d;
    const r = World.rng(((rk.id ?? 0) * 7919 + 13) >>> 0);
    d = { craters: [0, 1].map(() => ({ th: r() * 2 * Math.PI, d: 0.18 + 0.3 * r(), r: 0.13 + 0.1 * r() })),
          marks: [0, 1, 2].map(() => ({ th: r() * 2 * Math.PI, d: 0.12 + 0.38 * r() })) };
    DETAIL.set(rk, d);
    return d;
  }

  function drawRockAt(g, rk, x, y, ang = 0) {
    const R = rk.r, pr = R * cam.zoom, out = rk.out || ROUND;
    if (pr < 1.2) { ctx.fillStyle = '#8f84a8'; ctx.fillRect(x - px(), y - px(), 2 * px(), 2 * px()); return; }
    const [pal, type, inf] = rockPal(g, rk);
    shapePath(out, x, y, R, ang);
    ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    if (pr < 5) { ctx.fillStyle = pal[0]; ctx.fill(); ctx.lineWidth = 1.6 * px(); ctx.stroke(); return; }
    ctx.fillStyle = pal[1]; ctx.fill();
    ctx.save(); ctx.clip();
    shapePath(out, x + LIGHT[0] * R * 0.3, y + LIGHT[1] * R * 0.3, R, ang); ctx.fillStyle = pal[0]; ctx.fill();
    if (pr > 16) rockCraters(rk, x, y, R, ang, pal);
    ctx.beginPath(); ctx.ellipse(x + LIGHT[0] * R * 0.48, y + LIGHT[1] * R * 0.48, R * 0.28, R * 0.17, Math.atan2(LIGHT[1], LIGHT[0]) + Math.PI / 2, 0, 2 * Math.PI);
    ctx.fillStyle = pal[2]; ctx.fill();
    if (type && pr > 8) rockMarks(g, rk, type, x, y, R, ang);
    if (pr > 16) {                                                  // bounce light from the belt along the night-side edge
      shapePath(out, x + LIGHT[0] * R * 0.09, y + LIGHT[1] * R * 0.09, R, ang);
      ctx.strokeStyle = 'rgba(176,164,255,0.42)'; ctx.lineWidth = R * 0.18; ctx.stroke();
    }
    ctx.restore();
    shapePath(out, x, y, R, ang); ctx.strokeStyle = INK; ctx.lineWidth = 2.2 * px(); ctx.stroke();
    if (inf && inf.gem && (g.S.scanner ?? 0) >= 2) {                 // scanner 2 spots the gem inside: it glints on the rim
      const s = Math.max(0.4, 5 * px());
      Terrain.drawGem(ctx, x + LIGHT[1] * R * 0.8, y - LIGHT[0] * R * 0.8, s, inf.gem, g.real, px());
    }
  }

  function rockCraters(rk, x, y, R, ang, pal) {                    // shadowed near wall, sunlit floor, ink lip, lit far rim
    const la = Math.atan2(LIGHT[1], LIGHT[0]), lw = Math.max(1.2 * px(), R * 0.035);
    for (const k of rockDetail(rk).craters) {
      const a = k.th + ang, cx = x + R * k.d * Math.cos(a), cy = y + R * k.d * Math.sin(a), cr = R * k.r;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 2 * Math.PI); ctx.fillStyle = pal[1]; ctx.fill();
      ctx.beginPath(); ctx.arc(cx - LIGHT[0] * cr * 0.3, cy - LIGHT[1] * cr * 0.3, cr * 0.78, 0, 2 * Math.PI); ctx.fillStyle = pal[0]; ctx.fill();
      ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, cr, la - 1.2, la + 1.2); ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.9, la + Math.PI - 1.0, la + Math.PI + 1.0); ctx.strokeStyle = pal[2]; ctx.stroke();
    }
  }

  function rockMarks(g, rk, type, x, y, R, ang) {                  // slush specks, clank rust and glint, sparkle twinkles
    const at = (m) => [x + R * m.d * Math.cos(m.th + ang), y + R * m.d * Math.sin(m.th + ang)], M = rockDetail(rk).marks;
    if (type === 'slush') {
      ctx.fillStyle = '#ffffff';
      for (const m of M) { const [mx, my] = at(m); ctx.beginPath(); ctx.arc(mx, my, Math.max(1.2 * px(), R * 0.07), 0, 2 * Math.PI); ctx.fill(); }
    } else if (type === 'clank') {
      ctx.fillStyle = '#c4703a';
      for (const m of M) { const [mx, my] = at(m); ctx.beginPath(); ctx.arc(mx, my, Math.max(1.2 * px(), R * 0.08), 0, 2 * Math.PI); ctx.fill(); }
      const la = Math.atan2(LIGHT[1], LIGHT[0]);
      ctx.beginPath(); ctx.arc(x, y, R * 0.62, la - 0.45, la + 0.05); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5 * px(), R * 0.07); ctx.lineCap = 'round'; ctx.stroke();
    } else if (type === 'sparkle') {
      M.forEach((m, i) => {
        const [mx, my] = at(m), s = Math.max(2.5 * px(), R * 0.16) * (0.6 + 0.4 * Math.sin(3 * g.real + i * 2.1)), w = s * 0.28;
        ctx.beginPath(); ctx.moveTo(mx, my + s); ctx.lineTo(mx + w, my + w); ctx.lineTo(mx + s, my); ctx.lineTo(mx + w, my - w);
        ctx.lineTo(mx, my - s); ctx.lineTo(mx - w, my - w); ctx.lineTo(mx - s, my); ctx.lineTo(mx - w, my + w); ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
      });
    }
  }

  function drawRock(g, rk) {
    if (rk.gone) return;
    const [x, y] = World.rockState(g.w, rk, g.t), [sx, sy] = toScreen(x, y);
    if (!onScreen(sx, sy, rk.r * cam.zoom + 10)) return;
    drawRockAt(g, rk, x, y, rk.spin * g.t);
  }

  // ---------------- pickups (ore chunks, gems, loot) ----------------

  function drawPickup(g, p) {
    const it = CONFIG.items[p.item] || { col: '#ffffff', kind: 'ore' }, bob = Math.sin(g.real * 3 + p.x) * 0.06;
    if (it.kind === 'gem') { Terrain.drawGem(ctx, p.x, p.y + bob, Math.max(0.4, 4 * px()), p.item, g.real, px()); return; }
    const r = Math.max(0.22 + 0.05 * Math.sqrt(p.qty * it.kg), 2.5 * px());
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(p.age * 0.7 + p.x);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * 2 * Math.PI, rr = r * (0.8 + 0.25 * Math.sin(i * 2.3 + p.qty)); i ? ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a)) : ctx.moveTo(rr, 0); }
    ctx.closePath(); ctx.fillStyle = it.col; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.4 * px(), r * 0.18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-r * 0.45, r * 0.1, r * 0.3, r * 0.3);
    ctx.restore();
  }
  function drawPickups(g, view) {
    for (const p of g.pickups) if (p.x > view[0] && p.x < view[2] && p.y > view[1] && p.y < view[3]) drawPickup(g, p);
  }

  // ---------------- path preview ----------------

  function drawPath(g, path) {
    if (path.length < 2) return;
    const esc = g.orb.E >= 0, n = path.length;
    ctx.lineWidth = 2.4 * px(); ctx.setLineDash([9 * px(), 7 * px()]); ctx.lineCap = 'round';
    ctx.strokeStyle = esc ? COL.pathEsc : COL.path;
    const chunks = 12;
    for (let c = 0; c < chunks; c++) {
      const i0 = Math.floor(c / chunks * (n - 1)), i1 = Math.floor((c + 1) / chunks * (n - 1));
      ctx.globalAlpha = 0.95 - 0.7 * c / chunks;
      ctx.beginPath(); ctx.moveTo(path[i0][0], path[i0][1]);
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  function drawTrail(g) {                                          // drawn in the frame body's frame, like the preview
    if (g.trail.length < 2 || g.status !== 'flying') return;
    const [bx0, by0] = frameState(g, g.t);
    ctx.strokeStyle = 'rgba(255,244,220,0.22)'; ctx.lineWidth = 1.5 * px();
    ctx.beginPath();
    g.trail.forEach(([x, y, t], i) => {
      const [bx, by] = frameState(g, t), X = x - bx + bx0, Y = y - by + by0;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.lineTo(g.sh.x, g.sh.y); ctx.stroke();
  }

  // Ap / Pe from the predicted path (relative to the ref body), plus the impact X
  function drawPathTags(g, path) {
    if (path.length < 2) return;
    const [bx, by] = World.bodyState(g.w, g.ref, g.t);
    if (g.pred.impact) {
      const [x, y] = toScreen(path[path.length - 1][0], path[path.length - 1][1]);
      ctx.strokeStyle = COL.impact; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke();
      tag(Math.max(40, Math.min(W - 40, x)), y + 22 > H - 8 ? y - 14 : y + 22, `IMPACT ${(g.pred.impact.t - g.t).toFixed(0)}s`, COL.impact);
    }
    if (g.orb.E >= 0 || !g.ref.par || frameBody(g) !== g.ref) return;   // Ap / Pe only round the body the path is drawn about
    let iMin = 0, iMax = 0, dMin = Infinity, dMax = 0;
    path.forEach((p, i) => { const d = Math.hypot(p[0] - bx, p[1] - by); if (d < dMin) { dMin = d; iMin = i; } if (d > dMax) { dMax = d; iMax = i; } });
    const show = (i, label, col) => {
      if (i < 3 || i > path.length - 3) return;                     // only real turning points
      const [x, y] = toScreen(path[i][0], path[i][1]);
      ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      tag(x, y - 16, label, col);
    };
    show(iMin, `Pe ${(dMin - g.ref.R).toFixed(0)} m`, COL.good);
    show(iMax, `Ap ${(dMax - g.ref.R).toFixed(0)} m`, COL.pro);
  }

  // ---------------- nav target: brackets + closest approach ghosts ----------------

  function drawApproach(g, path) {
    const ap = g.approach; if (!ap) return;
    const tg = ap.tg, [tx, ty] = tg.state(g.t), [sx, sy] = toScreen(tx, ty), rr = Math.max(14, (tg.r || 2) * cam.zoom + 8);
    ctx.strokeStyle = COL.tgt; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath(); ctx.moveTo(sx + ax * rr, sy + ay * (rr - 7)); ctx.lineTo(sx + ax * rr, sy + ay * rr); ctx.lineTo(sx + ax * (rr - 7), sy + ay * rr); ctx.stroke();
    }
    if (onScreen(sx, sy, 0)) tag(sx, sy + rr + 16, tg.name, COL.tgt);
    const on = onScreen(sx, sy, (tg.r || 0) * cam.zoom - 4);          // off-screen (or under a panel): an edge arrow, laid out with the rest
    queueEdge({ key: tg.id, sx, sy, text: `${tg.name} ${fmtDist(Math.max(0, ap.dNow))}`, col: COL.tgt, fill: tg.col || COL.tgt, d: -1, on, tgt: true });
    if (ap.i < 0 || !path[ap.i] || (tg.id === 'body:' + g.ref.id && g.ref.par)) return;
    const [px1, py1] = toScreen(path[ap.i][0], path[ap.i][1]);
    const [gx, gy] = relPoint(g, ap.tx, ap.ty, ap.t), [px2, py2] = toScreen(gx, gy);
    ctx.setLineDash([4, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.tgt; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px1, py1 - 7); ctx.lineTo(px1 + 7, py1); ctx.lineTo(px1, py1 + 7); ctx.lineTo(px1 - 7, py1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(px2, py2, Math.max(5, (tg.r || 2) * cam.zoom), 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1;
    tag(px1, py1 - 16, `${fmtDist(Math.max(0, ap.d))} in ${fmtT(ap.t - g.t)}`, COL.tgt);
  }

  // ---------------- ship markers & ship ----------------

  // prograde: circle with prongs; retrograde: ⊗, the BRAKE marker (teal near a target, pink on an impact course)
  function drawMarkers(g) {
    if (g.status === 'landed' || g.status === 'docked' || g.mode !== 'ship') return;
    const ap = g.approach, near = ap && ap.dNow < 300 && ap.vNow > 0.05;
    const vx = near ? ap.rvx : g.orb.vx, vy = near ? ap.rvy : g.orb.vy;
    if (Math.hypot(vx, vy) < 0.05) return;
    const [cx, cy] = toScreen(g.sh.x, g.sh.y), a = screenAng(Math.atan2(vy, vx)), R0 = 56, c = Math.cos(a), s = Math.sin(a);
    const pro = [cx + R0 * c, cy + R0 * s], ret = [cx - R0 * c, cy - R0 * s];
    const ink = (path, col, lw) => { path(); ctx.strokeStyle = INK; ctx.lineWidth = lw + 3; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); };
    ctx.lineCap = 'round';
    const pr = near ? 6 : 8;                                       // near a target the prograde marker steps back: dim, small, unlabelled
    ink(() => {
      ctx.beginPath(); ctx.arc(pro[0], pro[1], pr, 0, 2 * Math.PI);
      for (const d of [-Math.PI / 2, 0, Math.PI / 2]) { const b = a + Math.PI + d; ctx.moveTo(pro[0] + pr * Math.cos(b), pro[1] + pr * Math.sin(b)); ctx.lineTo(pro[0] + (pr + 6) * Math.cos(b), pro[1] + (pr + 6) * Math.sin(b)); }
    }, near ? '#4f8a82' : COL.pro, near ? 2 : 2.8);
    const rr = 9, rc = near ? COL.tgt : COL.retro, k = rr * 0.68;
    ink(() => {
      ctx.beginPath(); ctx.arc(ret[0], ret[1], rr, 0, 2 * Math.PI);
      ctx.moveTo(ret[0] - k, ret[1] - k); ctx.lineTo(ret[0] + k, ret[1] + k); ctx.moveTo(ret[0] + k, ret[1] - k); ctx.lineTo(ret[0] - k, ret[1] + k);
    }, rc, 3);
    const impact = !near && g.status === 'flying' && g.pred && g.pred.impact;
    const label = (word, at, sign, col, r) => {                    // the label sits on the far side of the marker, away from the ship
      ctx.font = `700 12.5px ${FONT}`; ctx.textAlign = 'center';
      const lw = ctx.measureText(word).width, off = r + 9 + Math.abs(c) * lw / 2 + Math.abs(s) * 4;
      const lx = at[0] + sign * c * off, ly = at[1] + sign * s * off + 4.5;
      outlinedText(word, lx, ly, col, 4); ctx.textAlign = 'left'; tagRects.push([lx - lw / 2, ly - 11, lx + lw / 2, ly + 3], [at[0] - 12, at[1] - 12, at[0] + 12, at[1] + 12]);
    };
    if (impact && impact.body.star) label('BURN', pro, 1, COL.pro, pr + 6);   // diving into a star: braking makes it worse, prograde saves you
    else if (near || impact) label('BRAKE', ret, -1, rc, rr);
  }

  // ---------------- ship: five frames by S.frameId, nozzles by S.engine, plumes by fuel family ----------------
  //  painted in screen px scaled to u = 1/10 of the drawn length (all coordinates in u), nose toward -y, +x = the
  //  ship's right. Back to front: plume, legs, nozzle, pods, side pods, hull, details, cockpit, glare.

  const HULL = ['#ffb347', '#e07b2a', '#ffe0a8'], GREY = ['#c9c4e8', '#8c84b3', '#f0eeff'], DARK = ['#6e6896', '#4b4670', '#9b97b8'];
  const TEAL = ['#4fc3b0', '#2f8f80', '#a8f0e0'], RUST = ['#d9773a', '#a8552a', '#f3a874'], DRILL = ['#9b97b8', '#6e6896', '#d6d2ee'];
  const BRICK = ['#5b5680', '#403c63', '#8783ad'], CORAL = ['#ff8a5b', '#c4502e', '#ffc3a3'], HOT = ['#ffe066', '#ff5d5d', '#fff6c8'];
  const WHALE = ['#6a8ce0', '#4560a8', '#b4c8ff'];
  let SU = 1, SLW = 0.28, lastSide = 1;                            // px per u, ink width in u, last side-pod direction

  const both = (fn) => { fn(-1); fn(1); };
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function poly(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
  function inkFill(c, col) { c.fillStyle = col; c.fill(); c.stroke(); }
  function mix(a, b, k) {                                          // '#rrggbb' blend, k = 0..1 toward b
    const p = (s, i) => parseInt(s.slice(1 + 2 * i, 3 + 2 * i), 16);
    return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0')).join('');
  }

  // a toon part: shade, the base shifted toward the light (L: unit light vector in the sprite frame), a highlight
  //  strip on the lit side, then inside() while still clipped (stripes, ribs), then the ink outline
  function part(c, path, [x, y, w, h], pal, L, hi = true, inside = null) {
    path(); c.fillStyle = pal[1]; c.fill();
    c.save(); c.clip();
    c.save(); c.translate(L[0] * w * 0.32, L[1] * h * 0.1); path(); c.fillStyle = pal[0]; c.fill(); c.restore();
    if (hi) { c.fillStyle = pal[2]; c.fillRect(L[0] < 0 ? x + 0.12 * w : x + 0.77 * w, y + 0.16 * h, 0.11 * w, 0.62 * h); }
    if (inside) inside();
    c.restore();
    path(); c.stroke();
  }
  const box = (c, x, y, w, h, r, pal, L, hi) => part(c, () => rrect(c, x, y, w, h, r), [x, y, w, h], pal, L, hi);
  function band(c, x, y, w, h, col) {                              // a flat stripe with ink edges (inside a part's clip)
    c.fillStyle = col; c.fillRect(x, y, w, h);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.moveTo(x, y + h); c.lineTo(x + w, y + h); c.stroke();
  }
  function strut(c, x0, y0, x1, y1, w0, w1, col) {                 // a tapered leg / arm with a foot pad
    const d = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / d, ny = (x1 - x0) / d;
    poly(c, [[x0 + nx * w0, y0 + ny * w0], [x1 + nx * w1, y1 + ny * w1], [x1 - nx * w1, y1 - ny * w1], [x0 - nx * w0, y0 - ny * w0]]);
    inkFill(c, col);
  }
  function foot(c, x, y, w) { rrect(c, x - w / 2, y - 0.3, w, 0.6, 0.25); inkFill(c, GREY[0]); }
  function drill(c, y0, L) {
    part(c, () => poly(c, [[-1.7, y0], [0, y0 - 3.2], [1.7, y0]]), [-1.7, y0 - 3.2, 3.4, 3.2], DRILL, L, false);
    c.beginPath();
    for (let k = 0; k < 3; k++) { const yy = y0 - 0.6 - k * 0.9, hw = 1.4 * (1 - (k + 0.6) / 3.6); c.moveTo(-hw, yy); c.lineTo(hw, yy - 0.5); }
    c.save(); c.lineWidth = Math.max(1.5 / SU, 0.18); c.stroke(); c.restore();
  }

  // ---- the five frames (progression §11.1); tail: where the engine mounts (engines are drawn for a tail at 4) ----

  const FRAME_ART = {
    prospector: {
      tail: 4, half: 3.2, win: [0, -0.6, 1.25], pod: [2.2, 2.6],
      legs(c) { both((s) => { poly(c, [[s * 1.6, 2.5], [s * 3.2, 5], [s * 2.3, 5], [s * 1.1, 3.2]]); inkFill(c, GREY[1]); }); },
      back(c, P, L) { both((s) => box(c, s > 0 ? 2 : -3.2, -0.8, 1.2, 2.4, 0.4, GREY, L, false)); },
      hull(c, P, L) {
        part(c, () => rrect(c, -2.2, -3, 4.4, 7, 1.6), [-2.2, -3, 4.4, 7], HULL, L, true, () => band(c, -2.2, 1.6, 4.4, 0.7, '#ffd166'));
        drill(c, -3, L);
      },
    },
    mule: {
      tail: 4.4, half: 3.8, win: [0, -0.9, 1.25], pod: [3.8, 0.5],
      legs(c) { both((s) => { strut(c, s * 1.6, 2.9, s * 3.4, 5.4, 0.42, 0.3, GREY[1]); strut(c, s * 3.0, 2.6, s * 4.4, 4.8, 0.36, 0.26, GREY[1]); foot(c, s * 3.4, 5.4, 1.2); foot(c, s * 4.4, 4.8, 1.0); }); },
      back(c, P, L) {
        c.beginPath(); c.moveTo(1.2, -2.6); c.quadraticCurveTo(1.3, -4.2, 2.4, -5.0);   // bent antenna, pink bobble
        c.save(); c.lineWidth = SLW * 2.4; c.stroke(); c.strokeStyle = GREY[0]; c.lineWidth = SLW; c.stroke(); c.restore();
        c.beginPath(); c.arc(2.4, -5.0, 0.35, 0, 2 * Math.PI); inkFill(c, '#ff7eb6');
        both((s) => part(c, () => rrect(c, s > 0 ? 1.6 : -3.8, -1.8, 2.2, 4.6, 0.8), [s > 0 ? 1.6 : -3.8, -1.8, 2.2, 4.6], TEAL, L, true, () => {
          c.beginPath(); for (const yy of [-0.6, 1.6]) { c.moveTo(s > 0 ? 1.6 : -3.8, yy); c.lineTo(s > 0 ? 3.8 : -1.6, yy); } c.stroke();
          c.fillStyle = '#ffd166'; for (const yy of [-0.6, 1.6]) c.fillRect(s * 2.95 - 0.25, yy - 0.22, 0.5, 0.44);
        }));
      },
      hull(c, P, L) {
        part(c, () => rrect(c, -2.2, -3.2, 4.4, 7.6, 1.6), [-2.2, -3.2, 4.4, 7.6], HULL, L, true, () => band(c, -2.2, 1.9, 4.4, 0.7, TEAL[0]));
        drill(c, -3.2, L);
      },
    },
    hauler: {
      tail: 5, half: 3.6, win: [0, -1.7, 1.15], pod: [2.6, 0.9],
      legs(c) { both((s) => { strut(c, s * 2.0, 3.4, s * 3.9, 5.6, 0.55, 0.38, GREY[1]); foot(c, s * 3.9, 5.6, 1.5); }); },
      back(c, P, L) {
        both((s) => { for (const y of [-2.8, 2.6]) box(c, s > 0 ? 2.5 : -3.5, y, 1.0, 1.2, 0.35, GREY, L, false); });
        c.beginPath(); c.moveTo(-2.4, 0.8); c.lineTo(-3.8, -0.6); c.lineTo(-3.4, -1.8);   // crane arm and hook
        c.save(); c.lineWidth = SLW * 2.8; c.stroke(); c.strokeStyle = GREY[0]; c.lineWidth = SLW * 1.2; c.stroke();
        c.beginPath(); c.arc(-3.1, -1.75, 0.32, Math.PI * 1.05, Math.PI * 2.4, true); c.lineWidth = SLW * 1.6; c.strokeStyle = INK; c.stroke();
        c.lineWidth = SLW * 0.7; c.strokeStyle = GREY[0]; c.stroke(); c.restore();
      },
      hull(c, P, L) {
        part(c, () => rrect(c, -2.6, -3.6, 5.2, 8.6, 1.2), [-2.6, -3.6, 5.2, 8.6], HULL, L, true, () => {
          c.beginPath(); for (const yy of [-2.5, 4.3]) { c.moveTo(-2.6, yy); c.lineTo(2.6, yy); } c.stroke();
        });
        part(c, () => rrect(c, -1.9, 0.3, 3.8, 3.6, 0.4), [-1.9, 0.3, 3.8, 3.6], RUST, L, false, () => {
          c.beginPath(); for (const yy of [1.2, 2.1, 3.0]) { c.moveTo(-1.9, yy); c.lineTo(1.9, yy); } c.save(); c.lineWidth = SLW * 0.6; c.stroke(); c.restore();
        });
        part(c, () => poly(c, [[-1.8, -3.6], [1.8, -3.6], [1.0, -5.3], [-1.0, -5.3]]), [-1.8, -5.3, 3.6, 1.7], GREY, L, false, () => {
          c.fillStyle = '#ffd166';                                     // the pusher plate: hazard stripes
          for (let i = -3; i <= 3; i++) { poly(c, [[i * 1.1, -3.6], [i * 1.1 + 0.5, -3.6], [i * 1.1 - 0.4, -5.3], [i * 1.1 - 0.9, -5.3]]); c.fill(); }
        });
      },
    },
    barge: {
      tail: 4.8, half: 5.4, win: [0, -3.5, 0.8], pod: [3.4, -2.0],
      legs(c) { both((s) => { strut(c, s * 2.6, 3.6, s * 3.7, 5.3, 0.5, 0.36, GREY[1]); foot(c, s * 3.7, 5.3, 1.4); }); },
      back(c, P, L) {
        const sl = c.createLinearGradient(0, -4.3, 0, -10);                // searchlights
        sl.addColorStop(0, 'rgba(255,236,140,0.34)'); sl.addColorStop(1, 'rgba(255,236,140,0)');
        c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = sl;
        both((s) => { c.beginPath(); c.moveTo(s * 1.0, -4.3); c.lineTo(s * 0.1, -10); c.quadraticCurveTo(s * 1.8, -10.6, s * 3.6, -10); c.closePath(); c.fill(); });
        c.restore();
        both((s) => {
          for (const y of [-0.4, 2.6]) strut(c, s * 3.2, y, s * 4.6, y, 0.22, 0.22, DARK[0]);
          for (const y of [-1.2, 1.8]) box(c, s > 0 ? 4.4 : -5.4, y, 1.0, 2.4, 0.4, GREY, L, false);
        });
      },
      hull(c, P, L) {
        part(c, () => rrect(c, -1.1, -4.5, 2.2, 2.4, 0.9), [-1.1, -4.5, 2.2, 2.4], HULL, L, false);   // the neck cockpit
        part(c, () => rrect(c, -3.4, -2.6, 6.8, 7.4, 1.0), [-3.4, -2.6, 6.8, 7.4], HULL, L, true, () => band(c, -3.4, 3.8, 6.8, 0.6, '#ffd166'));
        const hex = () => { c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c[k ? 'lineTo' : 'moveTo'](2.0 * Math.cos(a), 1.0 + 1.8 * Math.sin(a)); } c.closePath(); };
        part(c, hex, [-2, -0.8, 4, 3.6], DARK, L, false);
        const dots = [[-0.48, 1.85], [0.48, 1.85], [-0.95, 1.0], [0, 1.0], [0.95, 1.0], [-0.48, 0.15], [0.48, 0.15]];
        (P.cargo || []).forEach((col, i) => { c.beginPath(); c.arc(dots[i][0], dots[i][1], 0.45, 0, 2 * Math.PI); inkFill(c, col); });
      },
    },
    leviathan: {
      tail: 4.2, half: 5.8, win: [0, -3.6, 0.75], pod: [2.6, -1.6],
      legs(c) { both((s) => { strut(c, s * 2.0, 2.6, s * 3.5, 4.6, 0.6, 0.4, GREY[1]); foot(c, s * 3.5, 4.6, 1.6); }); },
      back(c, P, L) {
        both((s) => part(c, () => { c.beginPath(); c.moveTo(s * 0.6, 3.6); c.quadraticCurveTo(s * 2.6, 3.7, s * 3.0, 5.4);   // tail flukes
          c.quadraticCurveTo(s * 2.0, 4.7, s * 0.7, 4.9); c.closePath(); }, [s > 0 ? 0.6 : -3.0, 3.6, 2.4, 1.8], WHALE, L, false));
        const k = Math.min(1, P.main * 1.4), hot = k > 0 ? [mix(CORAL[0], k > 0.6 ? HOT[0] : '#ffb36b', k), mix(CORAL[1], HOT[1], k), mix(CORAL[2], HOT[2], k)] : CORAL;
        both((s) => {
          const pts = [[s * 2.2, 0], [s * 5.8, 1.0], [s * 5.8, 3.4], [s * 2.2, 3.0]];
          part(c, () => poly(c, pts), [s > 0 ? 2.2 : -5.8, 0, 3.6, 3.4], hot, L, false, () => {
            c.beginPath();
            for (const t of [0.2, 0.4, 0.6, 0.8]) { c.moveTo(s * 2.2, 3.0 * t); c.lineTo(s * 5.8, 1.0 + 2.4 * t); }
            c.save(); c.lineWidth = SLW * 0.6; c.stroke(); c.restore();
          });
          if (k > 0.05) {                                              // the radiators shed the gigawatts
            const gr = c.createRadialGradient(s * 4.0, 1.9, 0, s * 4.0, 1.9, 3.4);
            gr.addColorStop(0, `rgba(255,170,90,${0.45 * k})`); gr.addColorStop(1, 'rgba(255,120,60,0)');
            c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gr; c.beginPath(); c.arc(s * 4.0, 1.9, 3.4, 0, 2 * Math.PI); c.fill(); c.restore();
          }
        });
      },
      hull(c, P, L) {
        const body = () => {
          c.beginPath(); c.moveTo(0, -5.2);
          c.bezierCurveTo(1.9, -5.2, 2.7, -2.6, 2.7, 0.4); c.bezierCurveTo(2.7, 2.6, 1.6, 3.8, 1.0, 4.2); c.lineTo(-1.0, 4.2);
          c.bezierCurveTo(-1.6, 3.8, -2.7, 2.6, -2.7, 0.4); c.bezierCurveTo(-2.7, -2.6, -1.9, -5.2, 0, -5.2); c.closePath();
        };
        part(c, body, [-2.7, -5.2, 5.4, 9.4], WHALE, L, true, () => {
          c.beginPath(); c.ellipse(0.9, 0.9, 0.95, 3.4, 0, 0, 2 * Math.PI); c.fillStyle = PAPER; c.fill();
          c.save(); c.lineWidth = SLW * 0.6; c.stroke(); c.restore();
          band(c, -2.8, 1.5, 5.6, 0.6, '#ffd166');
          c.beginPath(); c.arc(0, -3.95, 1.3, 0.24 * Math.PI, 0.76 * Math.PI); c.stroke();   // a whale of a smile under the pilot
        });
        if (P.duck) {                                                  // the tycoon's golden duck rides the dashboard
          c.beginPath(); c.ellipse(1.15, -2.75, 0.42, 0.3, 0, 0, 2 * Math.PI); c.arc(1.45, -3.05, 0.22, 0, 2 * Math.PI); inkFill(c, '#ffd166');
          c.fillStyle = '#ff9f1c'; c.fillRect(1.62, -3.08, 0.2, 0.09);
        }
        const on = (P.real % 1.6) < 0.25;                              // slow beacon on the nose
        c.beginPath(); c.arc(0, -5.25, 0.28, 0, 2 * Math.PI); inkFill(c, on ? '#ff5d5d' : '#8a3348');
        if (on) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,93,93,0.35)'; c.beginPath(); c.arc(0, -5.25, 1.1, 0, 2 * Math.PI); c.fill(); c.restore(); }
      },
    },
  };

  // ---- engines (progression §11.2): nozzle art and plume family; exit = plume start, w = plume width ----

  const bell = (c, x, y0, w0, w1, y1, pal, L) => part(c, () => poly(c, [[x - w0, y0], [x + w0, y0], [x + w1, y1], [x - w1, y1]]), [x - w1, y0, 2 * w1, y1 - y0], pal, L, false);
  function trefoil(c, x, y, r) {
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); inkFill(c, '#ffd166');
    c.fillStyle = INK;
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 3; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r * 0.78, a - 0.5, a + 0.5); c.closePath(); c.fill(); }
    c.beginPath(); c.arc(x, y, r * 0.16, 0, 2 * Math.PI); c.fillStyle = '#ffd166'; c.fill();
  }
  // fusion: a throat block and two copper magnetic-nozzle rings; parked on the ground the rings telescope shut and the petals fold
  function magRings(c, k, P, L, petals) {
    const st = !!P.ground, R = st ? [[0.45, 1.35], [0.75, 1.6]] : [[1.0, 1.5], [1.9, 1.95]];
    c.save(); c.translate(0, 3.6); c.scale(k, k); c.lineWidth = SLW / k;
    if (petals) for (let i = 0; i < 7; i++) {                       // the Sunflower's radiator petals
      c.save(); c.translate(0, st ? 0.1 : 0.5); c.rotate(Math.PI * (st ? 0.5 - i / 6 : 0.42 - 0.84 * i / 6)); c.beginPath();
      c.ellipse(0, st ? 1.0 : 1.7, 0.42, st ? 0.6 : 1.0, 0, 0, 2 * Math.PI); inkFill(c, i % 2 ? '#ffd166' : '#ffb347'); c.restore();
    }
    box(c, -1.0, -0.2, 2.0, st ? 0.85 : 1.3, 0.35, DARK, L, false);
    for (const [y, rx] of R) {
      c.beginPath(); c.ellipse(0, y, rx, rx * 0.22, 0, 0, 2 * Math.PI);
      c.lineWidth = SLW * 3 / k; c.strokeStyle = INK; c.stroke(); c.lineWidth = SLW * 1.6 / k; c.strokeStyle = P.main ? '#ffd166' : '#e3893b'; c.stroke();
    }
    c.beginPath(); for (const x of [-0.7, 0.7]) { c.moveTo(x, R[0][0]); c.lineTo(x * 1.3, R[1][0]); } c.lineWidth = SLW / k; c.strokeStyle = INK; c.stroke();
    c.restore();
  }
  const ENGINE_ART = {
    sparrow:   { kind: 'chem', exit: 4.6, w: 1, nozzle(c, P, L) { box(c, -1.4, 3.6, 2.8, 1.3, 0.3, DARK, L, false); } },
    brick:     { kind: 'chem', exit: 4.7, w: 1.2, nozzle(c, P, L) {
      box(c, -1.9, 3.5, 3.8, 1.6, 0.3, BRICK, L, false);
      c.fillStyle = GREY[0]; for (const x of [-1.35, 1.35]) { c.beginPath(); c.arc(x, 4.3, 0.2, 0, 2 * Math.PI); c.fill(); c.stroke(); } } },
    kestrel:   { kind: 'blue', exit: 4.8, w: 1, nozzle(c, P, L) { bell(c, 0, 3.6, 0.8, 1.3, 5.0, GREY, L); } },
    nerva:     { kind: 'ntr', exit: 5.0, w: 1.1, badge: 2.7, nozzle(c, P, L) { bell(c, 0, 3.6, 1.0, 1.6, 5.3, DARK, L); } },
    bulldog:   { kind: 'chem', exit: 4.8, w: 0.55, twin: 1.0, nozzle(c, P, L) { both((s) => bell(c, s * 1.0, 3.6, 0.5, 0.85, 5.0, GREY, L)); } },
    nervasama: { kind: 'ntr', exit: 5.3, w: 1.55, len: 1.35, badge: 2.7, nozzle(c, P, L) {
      both((s) => { c.beginPath(); c.moveTo(s * 1.6, 2.2); c.quadraticCurveTo(s * 3.1, 3.4, s * 2.0, 5.2);   // coolant pipes
        c.save(); c.lineWidth = SLW * 2.6; c.stroke(); c.strokeStyle = '#7cf5d6'; c.lineWidth = SLW * 1.1; c.stroke(); c.restore(); });
      bell(c, 0, 3.6, 1.4, 2.2, 5.6, DARK, L); } },
    pocketsun: { kind: 'fusion', k: 1, nozzle(c, P, L) { magRings(c, 1, P, L, false); } },
    sunflower: { kind: 'fusion', k: 1.35, nozzle(c, P, L) { magRings(c, 1.35, P, L, true); } },
  };

  // ---- plumes ----

  function flame(c, x, y0, w, len, cols, f, alpha = 1) {           // v3's toon flame, any width / length
    c.save(); c.globalAlpha = alpha;
    poly(c, [[x - 1.8 * w, y0 - 0.2], [x - 1.1 * w, y0 + 0.4 + 4 * f * len], [x - 0.4 * w, y0 + 0.6 + 2.5 * f * len], [x, y0 + 0.4 + 6 * f * len],
             [x + 0.4 * w, y0 + 0.6 + 2.5 * f * len], [x + 1.1 * w, y0 + 0.4 + 4 * f * len], [x + 1.8 * w, y0 - 0.2]]);
    inkFill(c, cols[0]);
    poly(c, [[x - 0.9 * w, y0 - 0.2], [x, y0 + 0.4 + 3.3 * f * len], [x + 0.9 * w, y0 - 0.2]]); c.fillStyle = cols[1]; c.fill();
    c.restore();
  }
  function spindle(c, y0, w, len) {                                 // a smooth plume from half-width w at y0 to a point
    c.beginPath(); c.moveTo(-w, y0); c.quadraticCurveTo(-w * 1.25, y0 + 0.35 * len, 0, y0 + len);
    c.quadraticCurveTo(w * 1.25, y0 + 0.35 * len, w, y0);
  }
  function glow(c, y0, w, len, col, a) {                           // additive halo along a plume, round at the top
    const cap = 0.7 * w, gr = c.createLinearGradient(0, y0 - cap, 0, y0 + len);
    gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(cap / (cap + len), `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    spindle(c, y0, w, len); c.quadraticCurveTo(w, y0 - cap, 0, y0 - cap); c.quadraticCurveTo(-w, y0 - cap, -w, y0);
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gr; c.fill(); c.restore();
  }
  const FUSION = { dhe3: ['#b8a6ff', '184,166,255', true], dd: ['#8fd3ff', '143,211,255', true], augment: ['#ff9f43', '255,159,67', false] };

  function plume(c, E, P) {
    const thr = P.main, f = (0.75 + 0.25 * Math.random()) * (0.35 + 0.65 * thr);
    if (E.kind === 'chem') {
      if (E.twin) both((s) => flame(c, s * E.twin, E.exit, E.w, 1, ['#ff7a1c', '#ffe066'], f));
      else flame(c, 0, E.exit, E.w, E.len || 1, ['#ff7a1c', '#ffe066'], f);
    } else if (E.kind === 'blue') {
      glow(c, E.exit, 2.0, 8 * f, '159,220,255', 0.25);
      spindle(c, E.exit, 1.1, 7 * f); inkFill(c, '#9fdcff');
      spindle(c, E.exit, 0.5, 4.5 * f); c.fillStyle = '#ffffff'; c.fill();
    } else if (E.kind === 'ntr') {
      const w = E.w, len = (E.len || 1) * 7.5 * f;
      glow(c, E.exit, w * 2.1, len * 1.2, '255,179,240', 0.4);
      c.save(); c.globalAlpha = 0.75; spindle(c, E.exit, w, len); inkFill(c, '#ffb3f0');
      spindle(c, E.exit, w * 0.45, len * 0.6); c.fillStyle = '#ffffff'; c.fill(); c.restore();
    } else fusionPlume(c, E, P);
  }

  // the torch: long, thin and blinding (D-He3 violet, D-D ice blue) with Mach diamonds; afterburner: fat, short, orange
  function fusionPlume(c, E, P) {
    const [col, rgb, diamonds] = FUSION[P.fuel] || FUSION.dhe3, k = E.k, thr = 0.35 + 0.65 * P.main;
    const y0 = 3.6 + 1.9 * k, f = thr * (0.97 + 0.03 * Math.random());
    const len = (diamonds ? 15 : 9) * f * (k > 1 ? 1.2 : 1), w = (diamonds ? 0.95 : 2.2) * k * (0.8 + 0.2 * f);
    glow(c, y0, w * (diamonds ? 2.6 : 1.9), len * 1.2, rgb, diamonds ? 0.55 : 0.4);
    spindle(c, y0, w, len); c.save(); c.lineWidth = SLW * 0.8; inkFill(c, col); c.restore();
    spindle(c, y0, w * 0.48, len * 0.82); c.fillStyle = diamonds ? '#ffffff' : '#ffe066'; c.fill();
    if (diamonds) for (const q of [0.28, 0.5, 0.72]) {
      const y = y0 + q * len, hw = w * 0.62 * (1 - q * 0.7), hh = 0.55 * k;
      poly(c, [[0, y - hh], [hw, y], [0, y + hh], [-hw, y]]); c.fillStyle = '#ffffff'; c.fill();
    }
  }
  function glare(c, E, P) {                                        // over the hull: the torch outshines its own ship
    const [, rgb] = FUSION[P.fuel] || FUSION.dhe3, k = E.k, y0 = 3.6 + 1.9 * k, a = 0.35 + 0.65 * P.main, R = (3.5 + 3 * a) * k;
    c.save(); c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(0, y0, 0, 0, y0, R);
    gr.addColorStop(0, `rgba(255,255,255,${0.95 * a})`); gr.addColorStop(0.35, `rgba(${rgb},${0.45 * a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = gr; c.beginPath(); c.arc(0, y0, R, 0, 2 * Math.PI); c.fill();
    const W = 6.5 * k * (0.5 + a), sg = c.createLinearGradient(-W, 0, W, 0);   // a lens streak across the exhaust
    sg.addColorStop(0, `rgba(${rgb},0)`); sg.addColorStop(0.5, `rgba(255,255,255,${0.7 * a})`); sg.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = sg; c.fillRect(-W, y0 - 0.07 * k, 2 * W, 0.14 * k);
    c.restore();
  }

  // ---- side pods, the dash, the cockpit ----

  function sidePods(c, F, P, L) {
    const [px0, py] = F.pod;
    both((s) => box(c, s > 0 ? px0 - 0.05 : -px0 - 0.55, py - 0.35, 0.6, 0.7, 0.15, DARK, L, false));
    if (!P.side) return;
    const s = P.side > 0 ? 1 : -1, x0 = s * (px0 + 0.5), f = Math.min(1, Math.abs(P.side)) * (0.75 + 0.25 * Math.random()) * (P.dash ? 1.6 : 1);
    poly(c, [[x0, py - 0.45], [x0 + s * 2.2 * f, py], [x0, py + 0.45]]); inkFill(c, '#ff7a1c');   // exhaust out the far side
    poly(c, [[x0, py - 0.22], [x0 + s * 1.3 * f, py], [x0, py + 0.22]]); c.fillStyle = '#ffe066'; c.fill();
  }
  function dashFx(c, F, P) {
    const k = P.dash.k, s = P.dash.s;
    c.save(); c.globalAlpha = Math.max(0, 1 - k); c.strokeStyle = '#ffffff';
    c.lineWidth = SLW * (3 - 2 * k); c.beginPath(); c.arc(0, 0, F.half + 0.5 + 4 * k, 0, 2 * Math.PI); c.stroke();
    c.lineWidth = SLW * 1.4; c.beginPath();                         // speed lines on the trailing side
    for (const [yy, l] of [[-2.4, 3.2], [0, 4.4], [2.4, 3.2]]) { c.moveTo(s * (F.half + 0.8), yy); c.lineTo(s * (F.half + 0.8 + l * (1 - 0.5 * k)), yy); }
    c.stroke(); c.restore();
  }
  function cockpit(c, [cx, cy, r], P) {
    c.beginPath(); c.arc(cx, cy, r, 0, 2 * Math.PI); inkFill(c, '#7fe0ff');
    c.beginPath(); c.arc(cx - 0.36 * r, cy - 0.32 * r, 0.28 * r, 0, 2 * Math.PI); c.fillStyle = '#ffffff'; c.fill();
    const k = r / 1.25;
    if (!P.pilot) {                                                // out on a walk: an amber HOLD light minds the ship
      if ((P.real % 1.2) < 0.6) { c.beginPath(); c.arc(cx + r + 0.45 * k, cy + 0.5 * r, 0.26 * k, 0, 2 * Math.PI); inkFill(c, '#ffb627'); }
      return;
    }
    c.fillStyle = INK; c.strokeStyle = INK;
    for (const ex of [-0.45, 0.45]) {
      const x = cx + ex * k, y = cy + 0.15 * k;
      if (P.blink) c.fillRect(x - 0.25 * k, y - 0.05 * k, 0.5 * k, 0.15 * k);
      else if (P.spin) {                                           // dizzy spirals
        c.beginPath(); for (let i = 0; i <= 16; i++) { const a = i * 0.75 + P.real * 9, rr = 0.03 * k + 0.015 * k * i; c[i ? 'lineTo' : 'moveTo'](x + rr * Math.cos(a), y + rr * Math.sin(a)); }
        c.save(); c.lineWidth = Math.max(1 / SU, 0.06 * k); c.stroke(); c.restore();
      } else { c.beginPath(); c.arc(x, y, 0.2 * k, 0, 2 * Math.PI); c.fill(); }
    }
  }

  // ---- the painter: P (what to draw) from g or from any S-like look; L the light in the sprite frame ----

  function paintShip(c, x, y, rot, u, P, L) {
    const F = FRAME_ART[P.frame] || FRAME_ART.prospector, E = ENGINE_ART[P.engine] || ENGINE_ART.sparrow;
    const lit = [(Math.sign(L[0]) || -1) * Math.max(0.45, Math.abs(L[0])), L[1]];   // always a clear shadow band, as in v3
    SU = u; SLW = Math.max(2, 0.28 * u) / u;
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(u, u);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = SLW;
    const atTail = (fn) => { c.save(); c.translate(0, F.tail - 4); fn(); c.restore(); };
    if (P.main) atTail(() => plume(c, E, P));
    else if (P.ion) { c.fillStyle = 'rgba(124,245,214,0.55)'; atTail(() => { poly(c, [[-0.8, 4.6], [0, 7 + Math.random()], [0.8, 4.6]]); c.fill(); }); }
    F.legs(c, P, lit);
    atTail(() => { if (P.ground) { c.beginPath(); c.rect(-9, -9, 18, P.ground + 13 - F.tail); c.clip(); } E.nozzle(c, P, lit); });
    F.back(c, P, lit);
    if (P.pods) sidePods(c, F, P, lit);
    F.hull(c, P, lit);
    if (E.badge) atTail(() => trefoil(c, 0, E.badge, 0.55));
    cockpit(c, F.win, P);
    if (P.dash) dashFx(c, F, P);
    if (P.main && E.kind === 'fusion') atTail(() => glare(c, E, P));
    c.restore();
  }

  function shipLook(g) {
    const S = g.S, d = g.dash, side = g.fired.side ?? 0;
    if (side) lastSide = side > 0 ? 1 : -1;
    const P = { frame: S.frameId ?? 'prospector', engine: S.engine ?? 'sparrow', fuel: S.fuelId ?? 'methalox', pods: (S.sideThrust ?? 0) > 0,
                main: g.fired.main, ion: g.fired.ion, side, pilot: g.mode === 'ship', blink: (g.real % 3.7) < 0.12,
                spin: Math.abs(g.sh.omega) > 2, real: g.real, duck: !!(g.done && g.done.tycoon), cargo: null, dash: null };
    if (d && d.until > 0) {                                         // the dash: a puff ring, speed lines trailing (side > 0 moves left)
      const T = S.dashT ?? 0.4, k = (g.t - (d.until - T)) / (T + 0.25);
      if (k >= 0 && k < 1) P.dash = { k, s: Math.sign(d.dir || 0) || lastSide };
    }
    if (P.frame === 'barge') P.cargo = holdDots(g);
    return P;
  }
  function holdDots(g) {                                           // the Barge's hopper: up to 7 dots coloured by what is in the hold
    const n = Math.min(7, Math.ceil(7 * (g.sh.cargoKg || 0) / Math.max(1, g.S.cargoCap))), I = CONFIG.items;
    const kgs = Object.entries(g.cargo).filter(([id, q]) => q > 0 && I[id]).map(([id, q]) => [I[id].col, q * I[id].kg]).sort((a, b) => b[1] - a[1]);
    const tot = kgs.reduce((s, e) => s + e[1], 0) || 1, out = [];
    for (const [col, kg] of kgs) for (let i = Math.max(1, Math.round(n * kg / tot)); i > 0 && out.length < n; i--) out.push(col);
    while (out.length < n) out.push(kgs.length ? kgs[0][0] : '#c9c4e8');
    return out;
  }

  function drawShip(g) {
    const sh = g.sh, [x, y] = toScreen(sh.x, sh.y), u = Math.max(g.S.length * cam.zoom, 34) / 10, c = Math.cos(sh.ang), s = Math.sin(sh.ang), P = shipLook(g);
    if (g.status === 'landed') P.ground = (g.S.radius ?? 4) * cam.zoom / u;          // the contact line, in sprite units
    paintShip(ctx, x, y, screenAng(sh.ang) + Math.PI / 2, u, P, [LIGHT[0] * s - LIGHT[1] * c, -(LIGHT[0] * c + LIGHT[1] * s)]);
  }
  // any ship on any canvas (shop silhouettes, menus): look = S-like { frameId, engine, fuelId, sideThrust }, lenPx = drawn length
  function drawShipAt(c, x, y, rot, lenPx, look = {}, fx = {}) {
    const P = { frame: look.frameId ?? 'prospector', engine: look.engine ?? 'sparrow', fuel: look.fuelId ?? 'methalox', pods: (look.sideThrust ?? 0) > 0,
                main: fx.main || 0, ion: 0, side: fx.side || 0, pilot: fx.pilot !== false, blink: false, spin: false, real: fx.real || 0, duck: !!fx.duck, cargo: fx.cargo || null, dash: null };
    paintShip(c, x, y, rot, lenPx / 10, P, [-0.6, -0.5]);
  }

  function drawParticles(g) {
    for (const p of g.particles) {
      const [x, y] = toScreen(p.x, p.y), f = p.life / p.max;
      if (!onScreen(x, y)) continue;
      if (p.kind === 'boom') {
        ctx.fillStyle = f > 0.5 ? '#ffd166' : '#ff7a1c'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 2 + 5 * f, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      } else if (p.kind === 'puff') {
        ctx.fillStyle = `rgba(255,255,255,${0.9 * f})`; ctx.beginPath(); ctx.arc(x, y, 2 + 4 * (1 - f), 0, 2 * Math.PI); ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(255,236,200,${0.45 * f})`; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, (1.5 - f) * 2.2 * cam.zoom), 0, 2 * Math.PI); ctx.fill();
      } else if (p.kind === 'dust') {
        ctx.globalAlpha = 0.8 * f; ctx.fillStyle = p.col || '#a8946f';
        ctx.beginPath(); ctx.arc(x, y, Math.max(2, (0.5 + (1 - f)) * (p.size || 0.6) * cam.zoom), 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
      } else if (p.kind === 'spark') {
        const a = screenAng(Math.atan2(p.vy, p.vx)), l = 3 + 6 * f;
        ctx.strokeStyle = p.col || '#fff3a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.stroke();
      } else if (p.kind === 'flash') {
        ctx.globalAlpha = f; ctx.strokeStyle = p.col || '#ffffff'; ctx.lineWidth = 3 + 5 * f;
        ctx.beginPath(); ctx.arc(x, y, (1 - f) * (p.size || 20) * cam.zoom + 4, 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (p.kind === 'ion') {
        ctx.fillStyle = `rgba(124,245,214,${0.7 * f})`; ctx.beginPath(); ctx.arc(x, y, 2 + 2 * f, 0, 2 * Math.PI); ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, 1.5 * f); ctx.fillStyle = p.col || '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, (p.size || 0.3) * cam.zoom), 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }

  // ---------------- labels: on-screen names & off-screen arrows ----------------

  // off-screen arrows only for the neighbourhood (within NEAR_ARROW, the ref body, the frame body and home):
  //  twenty arrows round the screen edge would be noise, the belt map (M M) shows the rest
  const NEAR_ARROW = 9000;
  function drawBodyLabels(g) {
    const fb = frameBody(g), home = g.w.byId.mochi;
    for (const b of g.w.bodies) {
      const [bx, by] = World.bodyState(g.w, b, g.t), [x, y] = toScreen(bx, by), Rs = b.R * cam.zoom;
      const dist = Math.hypot(g.sh.x - bx, g.sh.y - by) - b.R;
      if (x > -Rs && x < W + Rs && y > -Rs && y < H + Rs) {
        if (Rs > 4 && Rs < 220 && y - Rs - 14 > 0 && g.mode === 'ship' && !b.star) tag(x, Math.max(28, y - Rs - 14), b.name, b.color[2]);
        continue;
      }
      if (g.mode !== 'ship' && b !== g.ref) continue;
      if (cam.map === 2 || (b.star ? g.starR > 2 * CONFIG.sim.starWarn : dist > NEAR_ARROW && b !== g.ref && b !== fb && b !== home)) continue;
      queueEdge({ key: 'body:' + b.id, sx: x, sy: y, text: `${b.name} ${fmtDist(dist)}`, col: b.color[2], fill: b.color[0], d: dist });
    }
  }

  // ---------------- off-screen arrows: queued while drawing, laid out after the HUD, clear of its panels ----------------

  let edges = [], frameRects = [], tagRects = [];                 // tagRects: every tag() drawn this frame, so edge labels can dodge them

  function queueEdge(e) {                                          // {key, sx, sy, text, col, fill, d, on?, tgt?}
    const old = edges.find((q) => q.key === e.key);
    if (old) { if (e.tgt) Object.assign(old, { tgt: true, on: old.on && e.on }); return; }
    edges.push(e);
  }
  // modules: an arrow (with name and distance) to a world point, drawn only while it is off-screen
  function edgeArrow(key, x, y, text, col, fill = col) {
    const [sx, sy] = toScreen(x, y);
    queueEdge({ key, sx, sy, text, col, fill, d: Math.hypot(g0.sh.x - x, g0.sh.y - y), on: onScreen(sx, sy, -4) });
  }

  function warpRect() {                                            // the DOM warp bar, in canvas px (null when absent or hidden)
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('warpbar'); if (!el) return null;
    const r = el.getBoundingClientRect(), c = ctx.canvas.getBoundingClientRect();
    return r.width > 0 ? [r.left - c.left, r.top - c.top, r.right - c.left + 4, r.bottom - c.top + 4] : null;
  }
  function hudRects() { return [...frameRects, ...panels]; }
  const inRect = (x, y, r, p = 0) => x > r[0] - p && x < r[2] + p && y > r[1] - p && y < r[3] + p;
  const overlap = (a, b, p = 0) => a[0] < b[2] + p && a[2] > b[0] - p && a[1] < b[3] + p && a[3] > b[1] - p;

  function drawEdges(g) {
    const obs = hudRects(), cx = W / 2, cy = H / 2, m = 16, pad = 12;
    const items = edges.filter((e) => !e.on || (e.tgt && obs.some((r) => inRect(e.sx, e.sy, r))));
    if (!items.length) return;
    for (const e of items) {                                       // where the line of sight leaves the free area
      let dx = e.sx - cx, dy = e.sy - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const tx = dx > 1e-6 ? (W - m - cx) / dx : dx < -1e-6 ? (m - cx) / dx : Infinity;
      const ty = dy > 1e-6 ? (H - m - cy) / dy : dy < -1e-6 ? (m - cy) / dy : Infinity;
      let t = Math.min(tx, ty), side = tx < ty ? 'x' : 'y';
      for (const r of obs) {
        if (inRect(cx, cy, r, pad)) continue;
        let tn = -Infinity, tf = Infinity, sn = 'x';
        for (const [o, d, lo, hi, ax] of [[cx, dx, r[0] - pad, r[2] + pad, 'x'], [cy, dy, r[1] - pad, r[3] + pad, 'y']]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) tn = Infinity; continue; }
          const a = Math.min((lo - o) / d, (hi - o) / d), b = Math.max((lo - o) / d, (hi - o) / d);
          if (a > tn) { tn = a; sn = ax; } tf = Math.min(tf, b);
        }
        if (tn <= tf && tn > 0 && tn < t) { t = tn; side = sn; }
      }
      Object.assign(e, { dx, dy, side, ax: cx + dx * t, ay: cy + dy * t });
    }
    items.sort((a, b) => (b.tgt ? 1 : 0) - (a.tgt ? 1 : 0) || a.d - b.d);
    const groups = [];                                             // arrows that would touch share one arrow and a stacked label
    for (const e of items) {
      const gr = groups.find((q) => Math.hypot(q.ax - e.ax, q.ay - e.ay) < 30);
      if (gr) gr.items.push(e); else groups.push({ ax: e.ax, ay: e.ay, dx: e.dx, dy: e.dy, side: e.side, items: [e] });
    }
    ctx.font = `600 13px ${FONT}`;
    for (const q of groups) q.wMax = Math.max(...q.items.map((e) => ctx.measureText(e.text).width));
    const placed = [...tagRects];
    const boxOf = (q, ox, oy) => {                                 // label lines inward of the arrow, aligned by screen side
      const wMax = q.wMax, n = q.items.length, ax = q.ax + ox, ay = q.ay + oy;
      let x0, y0, al;
      if (q.side === 'x') { al = q.dx > 0 ? 'right' : 'left'; x0 = q.dx > 0 ? ax - 22 - wMax : ax + 22; y0 = ay - n * 7.5 - 2; }
      else { al = 'center'; x0 = Math.max(6, Math.min(W - 6 - wMax, ax - wMax / 2)); y0 = q.dy < 0 ? ay + 18 : ay - 18 - n * 15; }
      return { box: [x0, y0, x0 + wMax, y0 + n * 15 + 2], arrow: [ax - 9, ay - 9, ax + 9, ay + 9], al, x0, wMax, y0, ax, ay };
    };
    const shown = [];
    for (const q of groups) {
      const tx = q.side === 'x' ? 0 : 1, ty = 1 - tx;
      let best = null;
      for (let k = 0; k <= 40 && !best; k++) {                     // slide along the edge until the label is clear
        const o = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8, b = boxOf(q, tx * o, ty * o);
        const inside = b.box[0] >= 4 && b.box[2] <= W - 4 && b.box[1] >= 4 && b.box[3] <= H - 4;
        if (inside && !placed.some((p) => overlap(p, b.box, 7) || overlap(p, b.arrow)) && !obs.some((r) => overlap(r, b.box) || overlap(r, b.arrow))) { best = b; q.off = [tx * o, ty * o]; }
      }
      const host = !best && shown.length && shown.reduce((a, c) => Math.hypot(a.at.ax - q.ax, a.at.ay - q.ay) <= Math.hypot(c.at.ax - q.ax, c.at.ay - q.ay) ? a : c);
      if (host) {                                                  // nowhere free: ride along as one more line under the nearest arrow
        const i = placed.indexOf(host.at.box);
        host.items.push(...q.items); host.wMax = Math.max(host.wMax, q.wMax); host.at = boxOf(host, ...host.off);
        placed.splice(i, 2, host.at.box, host.at.arrow);
        continue;
      }
      if (!best) q.off = [0, 0];
      q.at = best || boxOf(q, 0, 0);
      placed.push(q.at.box, q.at.arrow); shown.push(q);
    }
    for (const q of shown) {
      const { ax, ay, al, x0, wMax, y0 } = q.at, tg = q.items.some((e) => e.tgt), sc = tg ? 1.2 : 1;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(q.dy, q.dx)); ctx.scale(sc, sc);
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-14, -8.5); ctx.lineTo(-10, 0); ctx.lineTo(-14, 8.5); ctx.closePath();
      if (tg) { ctx.strokeStyle = COL.tgt; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.fillStyle = q.items[0].fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      ctx.font = `600 13px ${FONT}`; ctx.textAlign = al;
      const lx = al === 'left' ? x0 : al === 'right' ? x0 + wMax : x0 + wMax / 2;
      q.items.forEach((e, i) => {
        const row = q.side === 'y' && q.dy > 0 ? q.items.length - 1 - i : i;   // the head line sits next to the arrow
        outlinedText(e.text, lx, y0 + 12 + row * 15, e.tgt ? COL.tgt : e.col, 4);
      });
    }
    ctx.textAlign = 'left';
  }

  // ---------------- HUD ----------------

  function drawHUD(g) {
    const wb = warpRect() || [W - 270, H - 68, W, H], C = controlsLayout(g, wb);   // the bottom pill first: the left column keeps clear of it
    layout = { left: 12, right: 12, rw: 0, lx: 12, rx: 0, dx: 0, lMax: C.shifted ? C.pill[1] - 10 : H - 14, rMax: wb[1] - 12 };
    panels = []; frameRects = [];
    ctx.save(); shipPanel(g); orbitPanel(g); targetPanel(g); jobsPanel(g); ctx.restore(); layout.dx = 0;

    eachDraw(g, 'drawHUD');

    // ---- top & bottom lines ----
    ctx.textAlign = 'center'; ctx.font = `600 15px ${FONT}`;
    const capped = SIM().warps[g.warpIdx] > g.warp;
    const top = `WARP ${g.warp}x${capped ? `  (max ${g.warpMax}x: ${g.warpWhy})` : ''}${cam.map ? `   ·   ${MAP_NAMES[cam.map]}` : ''}`;
    outlinedText(top, W / 2, 26, g.warp > 1 ? COL.pro : capped ? COL.warn : '#d9cff5');
    const tw = ctx.measureText(top).width; frameRects.push([W / 2 - tw / 2 - 6, 8, W / 2 + tw / 2 + 6, 34]);

    // bottom, stacked upward: controls pill, wrapped hint, interaction prompts; clear of the warp bar
    const half = C.half, cTop = C.cTop, pill = C.pill;
    frameRects.push(wb);
    ctx.fillStyle = 'rgba(27,20,51,0.62)'; roundRect(pill[0], pill[1], pill[2] - pill[0], pill[3] - pill[1], 9); ctx.fill();
    ctx.font = `500 ${C.cs}px ${FONT}`; ctx.fillStyle = '#d9cff5'; C.lines.forEach((l, i) => ctx.fillText(l, C.cx, cTop + i * 15));
    frameRects.push(pill);

    const hint = Game.hint(g) || '';
    let hs = 16, hl = [];
    if (hint) for (;; hs--) { ctx.font = `500 ${hs}px ${FONT}`; hl = wrapText(hint, 2 * half); if (hl.length <= 3 || hs <= 13) break; }
    if (hl.length > 3) hl = [hl[0], hl[1], fit(hl.slice(2).join(' '), 2 * half)];
    const hTop = cTop - 26 - (hl.length - 1) * (hs + 6);
    hl.forEach((l, i) => outlinedText(l, W / 2, hTop + i * (hs + 6), '#fff4dc'));
    if (hl.length) { const hw = Math.max(...hl.map((l) => ctx.measureText(l).width)); frameRects.push([W / 2 - hw / 2 - 4, hTop - hs, W / 2 + hw / 2 + 4, cTop - 20]); }

    const pBase = (hl.length ? hTop : cTop) - 40;                  // one hint line: H - 84, as before; each extra line lifts the prompts
    g.prompts.forEach((p, i) => {
      const yy = pBase - i * 32, label = p.key.replace(/^Key|^Digit/, '');
      ctx.font = `600 17px ${FONT}`; const w = ctx.measureText(p.text).width + 44;
      ctx.fillStyle = INK; roundRect(W / 2 - w / 2 + 3, yy - 19, w, 28, 8); ctx.fill();
      ctx.fillStyle = p.col || PAPER2; roundRect(W / 2 - w / 2, yy - 22, w, 28, 8); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = INK; roundRect(W / 2 - w / 2 + 5, yy - 18, 24, 20, 5); ctx.fill();
      ctx.fillStyle = PAPER; ctx.font = `700 14px ${FONT}`; ctx.fillText(label, W / 2 - w / 2 + 17, yy - 3);
      ctx.fillStyle = INK; ctx.font = `600 17px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(p.text, W / 2 - w / 2 + 36, yy - 2); ctx.textAlign = 'center';
      frameRects.push([W / 2 - w / 2, yy - 22, W / 2 + w / 2 + 3, yy + 9]);
    });
    drawEdges(g); ctx.textAlign = 'center';

    // ---- toast ----
    const t0 = g.toasts[0];
    if (t0 && t0.t0 != null) {
      const age = g.real - t0.t0;
      ctx.save(); ctx.globalAlpha = Math.min(1, (2.4 - age) * 2);
      const s = 1 + 0.25 * Math.max(0, 0.25 - age) / 0.25;
      ctx.translate(W / 2, H * 0.24); ctx.scale(s, s); ctx.rotate(-0.03);
      ctx.font = `700 ${t0.text.length > 26 ? 30 : 42}px ${FONT}`; ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      let lines = [t0.text];                                      // long toasts break in two, clear of the side panels
      const room = W - 2 * 300;
      if (ctx.measureText(t0.text).width > room) {
        let cut = t0.text.lastIndexOf(' ', Math.ceil(t0.text.length / 2) + 4); if (cut < 1) cut = Math.ceil(t0.text.length / 2);
        lines = [t0.text.slice(0, cut), t0.text.slice(cut + 1)];
      }
      const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (wMax > room) ctx.scale(room / wMax, room / wMax);
      lines.forEach((l, i) => {
        const yy = (i - (lines.length - 1) / 2) * 36;
        ctx.strokeText(l, 4, yy + 4); ctx.strokeText(l, 0, yy);
        ctx.fillStyle = t0.col || PAPER2; ctx.fillText(l, 0, yy);
      });
      ctx.restore();
    }
    if (g.paused && !g.ui) {
      ctx.save(); ctx.fillStyle = 'rgba(23,18,56,0.45)'; ctx.fillRect(0, 0, W, H);
      ctx.font = `700 54px ${FONT}`; ctx.textAlign = 'center'; outlinedText('PAUSED', W / 2, H / 2, PAPER2, 10);
      ctx.font = `500 18px ${FONT}`; outlinedText('P or Esc to resume', W / 2, H / 2 + 36, '#fff4dc'); ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  // ---------------- HUD panels (core) ----------------

  const isInf = (g) => typeof Econ !== 'undefined' && !!Econ && !!(g.mod && g.mod.economy) && !!Econ.isInf && !!Econ.isInf(g);

  function shipPanel(g) {                                          // on a walk the ship panel shrinks to what matters from outside
    const sh = g.sh, S = g.S, extra = Game.gather(g, 'hudRows'), out = g.mode !== 'ship', ckg = sh.cargoKg || 0;
    const nBars = out ? 2 : 4 + (S.ionTank > 0 ? 1 : 0), nRows = 2 + extra.length;
    let y = stackLeft(26 + nBars * 30 + nRows * 20, S.name.toUpperCase());
    bar('HULL', sh.hull / S.hull, 24, y, sh.hull < 0.35 * S.hull ? COL.bad : COL.good, `${Math.max(0, sh.hull).toFixed(0)} / ${S.hull}`); y += 30;
    bar(`FUEL · ${S.fuelType || 'fuel'}`, sh.fuel / S.fuel, 24, y, sh.fuel / S.fuel < 0.2 ? COL.bad : COL.warn, `Δv ${Physics.deltaV(sh, S).toFixed(0)} m/s`); y += 30;
    if (!out) {
      if (S.ionTank > 0) { bar(`ION ${g.ionOn ? 'ON' : 'off'} (X)`, sh.xe / S.ionTank, 24, y, g.ionOn ? COL.tgt : '#9ad9c9', `Δv ${Physics.ionDeltaV(sh, S).toFixed(0)} m/s`); y += 30; }
      bar('RCS', sh.rcs / S.rcs, 24, y, sh.rcs / S.rcs < 0.2 ? COL.bad : '#4cc9f0', `${sh.rcs.toFixed(1)}`); y += 30;
      bar('CARGO', ckg / S.cargoCap, 24, y, ckg >= S.cargoCap ? COL.bad : '#b892ff', `${ckg.toFixed(0)} / ${S.cargoCap} kg`); y += 30;
    }
    row('MONEY', isInf(g) ? '∞' : money(g.money), 24, y, COL.money); y += 20;
    const spinDeg = sh.omega * 180 / Math.PI;
    if (out) row('CARGO', `${ckg.toFixed(0)} / ${S.cargoCap} kg`, 24, y, ckg >= S.cargoCap ? COL.bad : INK);
    else row('ENGINE', `${g.fired.main ? (g.fired.main < 0.5 ? 'fine' : 'FULL') : 'off'} · spin ${Math.abs(spinDeg).toFixed(0)}°/s`, 24, y, g.fired.main ? COL.warn : Math.abs(spinDeg) > 90 ? COL.bad : COL.dim);
    y += 20;
    for (const r of extra) { row(r.label, r.val, 24, y, r.col || INK); y += 20; }
  }

  function orbitPanel(g) {
    const sh = g.sh, S = g.S, o = g.orb, ref = g.ref;
    let y;
    if (g.mode === 'ship' && !ref.par) {                            // out in the belt: Ember is the reference, the frame body is the neighbour
      const f = g.frame, fs = f ? f.state(g.t) : null, fb = f && f.body;
      y = stackLeft(150, 'IN THE CRUMB BELT');
      row(`FROM ${ref.name.toUpperCase()}`, fmtDist(o.r), 24, y); y += 20;
      row('ORBIT SPEED', `${o.speed.toFixed(1)} m/s`, 24, y); y += 20;
      if (fs) { row(`TO ${f.name.toUpperCase()}`.slice(0, 18), fmtDist(Math.max(0, Math.hypot(sh.x - fs[0], sh.y - fs[1]) - (fb ? fb.R : 0))), 24, y); y += 20;
                row('REL SPEED', `${Math.hypot(sh.vx - fs[2], sh.vy - fs[3]).toFixed(1)} m/s`, 24, y); y += 20; }
      const st = g.status === 'dead' ? 'wrecked' : g.pred && g.pred.impact ? `impact: ${g.pred.impact.body.name}` : o.E < 0 ? `lap of ${ref.name} ${fmtT(o.T)}` : 'escaping!';
      row('STATUS', st, 24, y, g.status === 'dead' || (g.pred && g.pred.impact) ? COL.bad : COL.good); y += 20;
      if (!fs) y += 40;
      row('CLEARANCE', g.nearDist <= 0.5 ? 'touching' : fmtDist(g.nearDist), 24, y, g.nearDist < 20 && g.status === 'flying' ? COL.bad : INK);
    } else if (g.mode === 'ship') {
      y = stackLeft(130, `NEAR ${ref.name.toUpperCase()}`);
      row('ALTITUDE', fmtDist(Math.max(0, o.alt - S.radius)), 24, y); y += 20;
      row('SPEED', `${o.speed.toFixed(1)} m/s`, 24, y); y += 20;
      row('CLIMB', `${o.vr >= 0 ? '+' : ''}${o.vr.toFixed(1)} m/s`, 24, y); y += 20;
      const st = g.status === 'landed' ? `landed on ${g.landedOn.name}` : g.status === 'docked' ? `docked: ${g.attach.name}` : g.status === 'dead' ? 'wrecked'
               : o.E >= 0 ? 'not captured' : g.pred && g.pred.impact ? 'impact course' : `orbit ${fmtT(o.T)}`;
      row('STATUS', st, 24, y, g.status === 'dead' || (g.pred && g.pred.impact) ? COL.bad : o.E >= 0 && g.status === 'flying' ? COL.dim : COL.good); y += 20;
      row('CLEARANCE', g.nearDist <= 0.5 ? 'touching' : fmtDist(g.nearDist), 24, y, g.nearDist < 20 && g.status === 'flying' ? COL.bad : INK);
    }
  }

  function targetPanel(g) {
    const ap = g.approach;
    if (!ap) return;
    let y = stackLeft(ap.i >= 0 ? 90 : 70, `TARGET ${ap.tg.name.toUpperCase()}`);
    row('DISTANCE', fmtDist(Math.max(0, ap.dNow)), 24, y); y += 20;
    row('REL SPEED', `${ap.vNow.toFixed(1)} m/s`, 24, y, ap.vNow < 2 ? COL.good : INK); y += 20;
    if (ap.i >= 0) row('CLOSEST', `${fmtDist(Math.max(0, ap.d))} in ${fmtT(ap.t - g.t)}`, 24, y, ap.d < 30 ? COL.good : INK);
  }

  function jobsPanel(g) {
    if (W <= 760) return;
    const left = Game.GOALS.filter((gl) => g.done[gl.id] === undefined), todo = left.slice(0, 5);
    const y = stackRight(300, 26 + Math.max(1, todo.length) * 21, `JOBS ${Game.GOALS.length - left.length}/${Game.GOALS.length}`), gx = W - 300 - 12;
    ctx.font = `500 14px ${FONT}`; ctx.textAlign = 'left';
    if (!todo.length) { ctx.fillStyle = COL.good; ctx.fillText('★ All jobs done. Belt legend.', gx + 12, y); }
    todo.forEach((gl, i) => {
      const pay = !gl.reward ? '' : gl.id === 'tycoon' ? '$1 (framed)' : `$${gl.reward.toLocaleString('en-US')}`, pw = pay ? ctx.measureText(pay).width + 12 : 0;
      ctx.fillStyle = i ? COL.dim : INK; ctx.fillText(fit(`☆ ${gl.text}`, 276 - pw), gx + 12, y + i * 21);
      if (pay) { ctx.textAlign = 'right'; ctx.fillStyle = COL.money; ctx.fillText(pay, gx + 288, y + i * 21); ctx.textAlign = 'left'; }
    });
  }

  // ---------------- controls line: whichever module's line wins, plus the v4 ship keys you own ----------------

  const CONTROLS = 'W engine · Shift fine · A/D spin · S stop spin · arrows nudge · X ion · Tab target · , . warp · M map · wheel zoom · P pause';

  function shipKeys(g) {
    if (g.mode !== 'ship' || g.status === 'dead' || g.status === 'docked') return [];
    const S = g.S, out = [];
    if ((S.sideThrust ?? 0) > 0) out.push(`← → side pods${(S.dashBoost ?? 0) > 0 ? ' (tap twice: dash)' : ''}`, 'Shift ← → nudge');
    if (haulOn(g) && (S.towTier ?? 0) > 0) out.push(Haul.towInfo && Haul.towInfo(g) ? 'Q Z reel · B crack · G let go' : 'G grapple');
    if (g.status === 'flying' && typeof EVA !== 'undefined' && g.mod.eva && EVA.canStepOut && EVA.canStepOut(g)) out.push('E spacewalk');
    return out;
  }
  const SAYS = [/side pods|dash/, /Shift ← →/, /reel|let go|grapple/, /spacewalk/];
  function controlsText(g) {                                       // add only what the winning line does not already say
    const ctl = Game.first(g, 'controls') || CONTROLS;
    if (!/W (engine|burn)/.test(ctl)) return ctl;
    const more = shipKeys(g).filter((k) => !SAYS.some((re) => re.test(k) && re.test(ctl)));
    const base = (g.S.sideThrust ?? 0) > 0 ? ctl.replace('arrows nudge', '↑ ↓ nudge') : ctl;
    if (!more.length) return base;
    return base.includes(' · Tab target') ? base.replace(' · Tab target', ` · ${more.join(' · ')} · Tab target`) : `${base} · ${more.join(' · ')}`;
  }
  // centred under the hint in at most two lines; a long line in a narrow window slides left of the warp bar instead
  function controlsLayout(g, wb) {
    const text = controlsText(g), half = Math.max(120, Math.min(W / 2 - 12, wb[0] - W / 2 - 12));
    let cs = 12.5, lines = [], cx = W / 2, shifted = false;
    const wrapIn = (room) => { for (cs = 12.5; ; cs -= 0.5) { ctx.font = `500 ${cs}px ${FONT}`; lines = wrapText(text, room, ' · '); if (lines.length <= 2 || cs <= 11.5) return lines.length <= 2; } };
    if (!wrapIn(2 * half - 18) && wb[0] - 24 > 2 * half + 40) { shifted = true; cx = wb[0] / 2; wrapIn(wb[0] - 24 - 18); }
    const cTop = H - 18 - (lines.length - 1) * 15, cw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
    return { lines, cs, cx, cTop, half, shifted, pill: [cx - cw / 2, cTop - 13, cx + cw / 2, H - 11] };
  }

  const SIM = () => CONFIG.sim;
  function fit(text, w) {                                          // trim with an ellipsis to fit w px in the current font
    if (ctx.measureText(text).width <= w) return text;
    while (text.length > 3 && ctx.measureText(text + '…').width > w) text = text.slice(0, -1);
    return text + '…';
  }

  // panels stack down the left and right edges; one that would run past the bottom opens a new column inward. Callers
  //  draw their rows at x 24 (left) or W - w - 12 (right), so a moved panel shifts the canvas origin for the rest of that
  //  drawHUD (eachDraw restores it)
  function stackLeft(h, title) {
    if (layout.left > 60 && layout.left + h > layout.lMax) { layout.lx += 236 + 22; layout.left = 46; }
    const y0 = layout.left; layout.left += h + 22;
    shiftTo(layout.lx - 12);
    panels.push([layout.lx, y0 - 10, layout.lx + 236 + 4, y0 + h + 4]);
    return comicPanel(12, y0, 236, h, title);
  }
  function stackRight(w, h, title) {
    if (layout.right > 60 && layout.right + h > layout.rMax) { layout.rx -= layout.rw + 18; layout.right = 46; layout.rw = 0; }
    const y0 = layout.right; layout.right += h + 22; layout.rw = Math.max(layout.rw, w + 4);
    shiftTo(layout.rx);
    panels.push([W - w - 12 + layout.rx, y0 - 10, W - 8 + layout.rx, y0 + h + 4]);
    return comicPanel(W - w - 12, y0, w, h, title);
  }
  function shiftTo(dx) { if (dx !== layout.dx) { ctx.translate(dx - layout.dx, 0); layout.dx = dx; } }
  function wrapText(text, w, sep = ' ', even = true) {            // greedy wrap in the current font; even: same line count, balanced widths
    const out = []; let cur = '';
    for (const word of text.split(sep)) { const t = cur ? cur + sep + word : word; if (cur && ctx.measureText(t).width > w) { out.push(cur); cur = word; } else cur = t; }
    if (cur) out.push(cur);
    if (!even || out.length < 2) return out;
    let lo = 0, hi = w;
    for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; if (wrapText(text, mid, sep, false).length > out.length) lo = mid; else hi = mid; }
    return wrapText(text, hi, sep, false);
  }

  // comic words rise and fade; one that would land on an earlier word slides up above it (eased, so nothing jumps)
  function drawPopups(g) {
    const placed = [];
    for (const p of g.popups) {
      const age = g.real - p.t0; if (age > 1.4) continue;
      const [x, y] = toScreen(p.x, p.y), sz = p.size || 26, fs = sz + 10 * Math.max(0, 0.15 - age) / 0.15;
      ctx.font = `700 ${fs}px ${FONT}`;
      const w = ctx.measureText(p.text).width + sz / 4, h = sz * 0.95, px0 = x + 30, py0 = y - 30 - age * 40 - (p.lift || 0) * 26;
      const slack = (b) => (b.h + h) / 2 + 0.03 * (b.w + w);      // the words tilt, so wide ones need a little more room
      let want = 0;
      for (let k = 0; k < 8; k++) {
        const hit = placed.find((b) => Math.abs(b.x - px0) < (b.w + w) / 2 && Math.abs(b.y - (py0 - want - h * 0.35)) < slack(b));
        if (!hit) break;
        want = py0 - h * 0.35 - (hit.y - slack(hit) - 2);
      }
      p.nudge = p.nudge == null ? want : p.nudge + (want - p.nudge) * 0.3;
      const yy = py0 - p.nudge;
      placed.push({ x: px0, y: yy - h * 0.35, w, h });
      ctx.save(); ctx.translate(px0, yy); ctx.rotate(-0.12); ctx.globalAlpha = Math.max(0, Math.min(1, 1.4 - age));
      ctx.textAlign = 'center'; ctx.lineWidth = sz / 4 + 1; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawDebug(g) {
    const sh = g.sh, o = g.orb;
    const lines = [
      `DEBUG seed ${g.w.seed}  spawn ${g.spawn}  t ${g.t.toFixed(2)}s  steps/frame ${g.stepsLastFrame} x ${(g.stepDt * 1000).toFixed(1)} ms  rocks ${g.rockCand ? g.rockCand.length : '-'}/${g.w.rocks.length}  status ${g.status}  mode ${g.mode}  ref ${g.ref.name}  frame ${g.frame ? g.frame.name : '-'}`,
      `x ${sh.x.toFixed(1)}  y ${sh.y.toFixed(1)}  vx ${sh.vx.toFixed(2)}  vy ${sh.vy.toFixed(2)}  ang ${(sh.ang * 180 / Math.PI % 360).toFixed(1)}°  ω ${sh.omega.toFixed(3)}  m ${Physics.mass(sh, g.S).toFixed(3)} t`,
      `rel: r ${o.r.toFixed(1)}  v ${o.speed.toFixed(2)}  E ${o.E.toFixed(3)}  e ${o.e.toFixed(3)}  pe ${o.pe.toFixed(1)}  ap ${o.ap.toFixed(1)}`,
      `pred ${g.pred ? g.pred.pts.length + ' pts, ' + (g.pred.pts[g.pred.pts.length - 1][2] - g.t).toFixed(0) + ' s' : '-'}  impact ${g.pred && g.pred.impact ? g.pred.impact.body.name : 'none'}  near ${g.nearDist.toFixed(1)}  pickups ${g.pickups.length}  particles ${g.particles.length}`,
      `cam ${cam.x.toFixed(0)},${cam.y.toFixed(0)} zoom ${cam.zoom.toFixed(2)} rot ${(cam.rot * 180 / Math.PI).toFixed(0)}°  warp ${g.warp}/${g.warpMax}  ${g.warpWhy}`,
      ...g.events.slice(-3).map((e) => `  ${e.t.toFixed(1)}s ${e.msg}`),
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(10, H - 100 - lines.length * 15, 700, lines.length * 15 + 10);
    ctx.fillStyle = '#9effa0'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, 16, H - 92 - (lines.length - 1 - i) * 15));
  }

  // ---------------- comic HUD helpers ----------------

  function comicPanel(x, y, w, h, title) {
    ctx.fillStyle = INK; roundRect(x + 4, y + 4, w, h, 10); ctx.fill();
    ctx.fillStyle = PAPER; roundRect(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; roundRect(x, y, w, h, 10); ctx.stroke();
    ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillStyle = INK; roundRect(x + 10, y - 9, ctx.measureText(title).width + 16, 20, 6); ctx.fill();
    ctx.fillStyle = PAPER2; ctx.fillText(title, x + 18, y + 6);
    return y + 32;
  }
  function row(label, val, x, y, col = INK) {                     // the value shrinks to clear its label; ∞ gets to be big
    ctx.font = `500 13.5px ${FONT}`; ctx.fillStyle = COL.dim; ctx.textAlign = 'left'; ctx.fillText(label, x, y);
    const room = 212 - ctx.measureText(label).width - 8;
    ctx.fillStyle = col; ctx.textAlign = 'right';
    if (val === '∞') { ctx.font = `800 24px ${FONT}`; ctx.fillText(val, x + 212, y + 5); ctx.textAlign = 'left'; return; }
    let px = 14; ctx.font = `600 ${px}px ${FONT}`;
    for (let w = ctx.measureText(val).width; w > room && px > 10.5; w = ctx.measureText(val).width) ctx.font = `600 ${px -= 0.5}px ${FONT}`;
    ctx.fillText(val, x + 212, y); ctx.textAlign = 'left';
  }
  function bar(label, f, x, y, col, extra) {
    ctx.font = `600 12.5px ${FONT}`; ctx.fillStyle = COL.dim; ctx.textAlign = 'left'; ctx.fillText(label, x, y - 4);
    ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.fillText(extra, x + 212, y - 4); ctx.textAlign = 'left';
    ctx.fillStyle = '#e9dcc0'; roundRect(x, y, 212, 11, 5); ctx.fill();
    ctx.fillStyle = col; roundRect(x, y, Math.max(0.001, 212 * Math.max(0, Math.min(1, f))), 11, 5); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; roundRect(x, y, 212, 11, 5); ctx.stroke();
  }
  function tag(x, y, text, col) {
    ctx.font = `600 13px ${FONT}`; ctx.textAlign = 'center'; outlinedText(text, x, y, col, 4); ctx.textAlign = 'left';
    const w = ctx.measureText(text).width / 2; if (onScreen(x, y, 0)) tagRects.push([x - w, y - 11, x + w, y + 3]);
  }
  function outlinedText(text, x, y, col, lw = 5) {
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const fmtDist = (m) => !isFinite(m) ? '∞' : Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
  const fmtT = (t) => !isFinite(t) ? '—' : t >= 3600 ? `${Math.floor(t / 3600)}h${String(Math.floor(t % 3600 / 60)).padStart(2, '0')}m`
    : t >= 60 ? `${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s` : `${t.toFixed(0)}s`;
  const money = (n) => `$${Math.floor(n).toLocaleString('en-US')}`;

  function drawErrorBar(msg) {
    ctx.save(); ctx.fillStyle = 'rgba(230,57,70,0.92)'; ctx.fillRect(W / 2 - 330, 40, 660, 24);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`Bug caught (game keeps running): ${msg}`.slice(0, 100), W / 2, 56); ctx.restore();
  }
  function drawError(msg) {
    ctx.save(); ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.fillStyle = 'rgba(230,57,70,0.92)'; ctx.fillRect(10, H / 2 - 30, W - 20, 60);
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`Bug caught: ${msg}`.slice(0, 140), W / 2, H / 2 - 4); ctx.fillText('Screenshot this for Claude. The game keeps running; R R tows you home.', W / 2, H / 2 + 16);
    ctx.restore();
  }

  // ---------------- kit: everything modules need to draw ----------------

  const kit = {
    get ctx() { return ctx; }, get W() { return W; }, get H() { return H; }, cam,
    px, toScreen, screenToWorld, screenAng, worldTransform, viewRect, onScreen,
    shapePath, toonBlob, tag, outlinedText, comicPanel, row, bar, roundRect, stackLeft, stackRight, drawPickup, fit, wrapText, edgeArrow,
    fmtDist, fmtT, money, INK, PAPER, PAPER2, COL, LIGHT, FONT,
  };

  // M: off -> local map -> belt map -> off
  function cycleMap() { cam.map = (cam.map + 1) % 3; cam.userZoom = 1; return cam.map; }

  return { init, resize, draw, drawError, cam, kit, toScreen, screenToWorld, cycleMap, drawShipAt, drawRockAt };
})();
