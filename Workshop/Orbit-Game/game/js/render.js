// ======================================================================
//  RENDER  —  toon-shaded asteroids, terrain overlay, ship, path preview,
//  nav target, comic HUD.  Camera follows the ship (fixed orientation),
//  the ref body in the local map, the whole Crumb Belt in the belt map
//  (M cycles off -> local -> belt), or a module's camera hook (EVA: rotated
//  so local up is screen up).  Light comes from the star Ember.
//  Modules draw through Render.kit.
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

  function init(canvas, seed) {
    ctx = canvas.getContext('2d');
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
    } else { tx = g.sh.x; ty = g.sh.y; tz = 4 * cam.userZoom; }
    cam.x += (tx - cam.x) * (snap ? 1 : k); cam.y += (ty - cam.y) * (snap ? 1 : k);
    cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(tz) - Math.log(cam.zoom)) * k);
    let dr = ((tr - cam.rot) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    cam.rot += dr * Math.min(1, k * 1.5);
    const sk = g.shake * g.shake * 9;
    cam.shx = (Math.random() - 0.5) * sk; cam.shy = (Math.random() - 0.5) * sk;
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

  let layout = { left: 0, right: 0, rw: 0 }, g0 = null;

  function draw(g, dt, debug) {
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
      ctx.save();
      try { m[hook](g, kit); } catch (e) { const msg = `${m.id}.${hook}: ${e.message}`; if (g.err !== msg) { g.err = msg; console.error(e); } }
      ctx.restore();
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
    const R = b.R, t = g.real;
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

  const ROCK_COLS = [['#b8a99a', '#76665f', '#e2d6c8'], ['#a69bb8', '#675c7c', '#d6cde6'], ['#c4a37f', '#7e6248', '#ecd2b0']];

  function drawRock(g, rk) {
    if (rk.gone) return;
    const [x, y] = World.rockState(g.w, rk, g.t), [sx, sy] = toScreen(x, y);
    if (!onScreen(sx, sy, rk.r * cam.zoom + 10)) return;
    if (rk.r * cam.zoom < 1.2) { ctx.fillStyle = '#8f84a8'; ctx.fillRect(x - px(), y - px(), 2 * px(), 2 * px()); return; }
    toonBlob(rk.out, x, y, rk.r, rk.spin * g.t, ROCK_COLS[Math.floor(rk.tone * 3)], 2.2 * px());
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

  function drawShip(g) {
    const sh = g.sh, S = g.S, [x, y] = toScreen(sh.x, sh.y);
    const L = Math.max(S.length * cam.zoom, 34), u = L / 10;
    const lightSide = Math.sign(Math.cos(sh.ang) * LIGHT[1] - Math.sin(sh.ang) * LIGHT[0]) || 1;   // +1: light on ship's left
    ctx.save(); ctx.translate(x, y); ctx.rotate(screenAng(sh.ang) + Math.PI / 2);   // nose = -y on canvas
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, 0.28 * u); ctx.strokeStyle = INK;

    if (g.fired.main) {                                            // toon flame
      const f = (0.75 + 0.25 * Math.random()) * (0.35 + 0.65 * g.fired.main);
      ctx.fillStyle = '#ff7a1c'; ctx.beginPath(); ctx.moveTo(-1.8 * u, 4.6 * u);
      ctx.lineTo(-1.1 * u, (5 + 4 * f) * u); ctx.lineTo(-0.4 * u, (5.2 + 2.5 * f) * u); ctx.lineTo(0, (5 + 6 * f) * u);
      ctx.lineTo(0.4 * u, (5.2 + 2.5 * f) * u); ctx.lineTo(1.1 * u, (5 + 4 * f) * u); ctx.lineTo(1.8 * u, 4.6 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(-0.9 * u, 4.6 * u); ctx.lineTo(0, (5 + 3.3 * f) * u); ctx.lineTo(0.9 * u, 4.6 * u); ctx.closePath(); ctx.fill();
    } else if (g.fired.ion) {                                      // faint blue ion plume
      ctx.fillStyle = 'rgba(124,245,214,0.55)'; ctx.beginPath(); ctx.moveTo(-0.8 * u, 4.6 * u); ctx.lineTo(0, (7 + Math.random()) * u); ctx.lineTo(0.8 * u, 4.6 * u); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#8c84b3';                                      // legs
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 1.6 * u, 2.5 * u); ctx.lineTo(s * 3.2 * u, 5 * u); ctx.lineTo(s * 2.3 * u, 5 * u); ctx.lineTo(s * 1.1 * u, 3.2 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#6e6896'; roundRect(-1.4 * u, 3.6 * u, 2.8 * u, 1.3 * u, 0.3 * u); ctx.fill(); ctx.stroke();   // nozzle
    for (const s of [-1, 1]) { ctx.fillStyle = '#c9c4e8'; roundRect(s > 0 ? 2 * u : -3.2 * u, -0.8 * u, 1.2 * u, 2.4 * u, 0.4 * u); ctx.fill(); ctx.stroke(); }  // RCS pods

    roundRect(-2.2 * u, -3 * u, 4.4 * u, 7 * u, 1.6 * u); ctx.fillStyle = '#ffb347'; ctx.fill();   // hull + toon shadow
    ctx.save(); roundRect(-2.2 * u, -3 * u, 4.4 * u, 7 * u, 1.6 * u); ctx.clip();
    ctx.fillStyle = '#e07b2a'; ctx.fillRect(lightSide > 0 ? 0.9 * u : -2.3 * u, -3.2 * u, 1.4 * u, 7.5 * u);
    ctx.fillStyle = '#ffe0a8'; ctx.fillRect(lightSide > 0 ? -1.7 * u : 1.2 * u, -2.2 * u, 0.5 * u, 4.5 * u);
    ctx.restore();
    roundRect(-2.2 * u, -3 * u, 4.4 * u, 7 * u, 1.6 * u); ctx.stroke();
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-2.2 * u, 1.6 * u, 4.4 * u, 0.7 * u); ctx.strokeRect(-2.2 * u, 1.6 * u, 4.4 * u, 0.7 * u);   // stripe

    ctx.fillStyle = '#9b97b8'; ctx.beginPath(); ctx.moveTo(-1.7 * u, -3 * u); ctx.lineTo(0, -6.2 * u); ctx.lineTo(1.7 * u, -3 * u); ctx.closePath(); ctx.fill(); ctx.stroke();   // drill
    ctx.beginPath(); for (let k = 0; k < 3; k++) { const yy = -3.6 * u - k * 0.9 * u, hw = 1.4 * u * (1 - (k + 0.6) / 3.6); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy - 0.5 * u); } ctx.lineWidth = Math.max(1.5, 0.18 * u); ctx.stroke();

    ctx.lineWidth = Math.max(2, 0.28 * u);
    ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.arc(0, -0.6 * u, 1.25 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();   // window
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-0.45 * u, -1 * u, 0.35 * u, 0, 2 * Math.PI); ctx.fill();
    if (g.mode === 'ship') {                                       // pilot's eyes (empty cockpit while you're outside)
      const blink = (g.real % 3.7) < 0.12, spin = Math.abs(sh.omega) > 2;
      ctx.fillStyle = INK;
      for (const ex of [-0.45, 0.45]) {
        if (blink) ctx.fillRect((ex - 0.25) * u, -0.5 * u, 0.5 * u, 0.15 * u);
        else if (spin) { ctx.font = `bold ${0.9 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('@', ex * u, -0.15 * u); }
        else { ctx.beginPath(); ctx.arc(ex * u, -0.45 * u, 0.2 * u, 0, 2 * Math.PI); ctx.fill(); }
      }
    }
    ctx.restore();
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
  function hudRects() {
    const rs = [...frameRects];
    if (layout.left > 12) rs.push([0, 0, 12 + 236 + 4, layout.left - 18]);
    if (layout.right > 12) rs.push([W - layout.rw - 12, 0, W, layout.right - 18]);
    return rs;
  }
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
    const sh = g.sh, S = g.S, o = g.orb, ref = g.ref;
    layout = { left: 12, right: 12, rw: 0 }; frameRects = [];

    // ---- ship panel ----
    const extra = Game.gather(g, 'hudRows');
    const nBars = 4 + (S.ionTank > 0 ? 1 : 0), nRows = 2 + extra.length;
    let y = stackLeft(26 + nBars * 30 + nRows * 20, S.name.toUpperCase());
    bar('HULL', sh.hull / S.hull, 24, y, sh.hull < 0.35 * S.hull ? COL.bad : COL.good, `${Math.max(0, sh.hull).toFixed(0)} / ${S.hull}`); y += 30;
    bar(`FUEL · ${S.fuelType || 'fuel'}`, sh.fuel / S.fuel, 24, y, sh.fuel / S.fuel < 0.2 ? COL.bad : COL.warn, `Δv ${Physics.deltaV(sh, S).toFixed(0)} m/s`); y += 30;
    if (S.ionTank > 0) { bar(`ION ${g.ionOn ? 'ON' : 'off'} (X)`, sh.xe / S.ionTank, 24, y, g.ionOn ? COL.tgt : '#9ad9c9', `Δv ${Physics.ionDeltaV(sh, S).toFixed(0)} m/s`); y += 30; }
    bar('RCS', sh.rcs / S.rcs, 24, y, sh.rcs / S.rcs < 0.2 ? COL.bad : '#4cc9f0', `${sh.rcs.toFixed(1)}`); y += 30;
    const ckg = sh.cargoKg || 0;
    bar('CARGO', ckg / S.cargoCap, 24, y, ckg >= S.cargoCap ? COL.bad : '#b892ff', `${ckg.toFixed(0)} / ${S.cargoCap} kg`); y += 30;
    row('MONEY', money(g.money), 24, y, COL.money); y += 20;
    const spinDeg = sh.omega * 180 / Math.PI;
    row('ENGINE', `${g.fired.main ? (g.fired.main < 0.5 ? 'fine' : 'FULL') : 'off'} · spin ${Math.abs(spinDeg).toFixed(0)}°/s`, 24, y, g.fired.main ? COL.warn : Math.abs(spinDeg) > 90 ? COL.bad : COL.dim); y += 20;
    for (const r of extra) { row(r.label, r.val, 24, y, r.col || INK); y += 20; }

    // ---- orbit panel ----
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

    // ---- nav target ----
    const ap = g.approach;
    if (ap) {
      y = stackLeft(ap.i >= 0 ? 90 : 70, `TARGET ${ap.tg.name.toUpperCase()}`);
      row('DISTANCE', fmtDist(Math.max(0, ap.dNow)), 24, y); y += 20;
      row('REL SPEED', `${ap.vNow.toFixed(1)} m/s`, 24, y, ap.vNow < 2 ? COL.good : INK); y += 20;
      if (ap.i >= 0) row('CLOSEST', `${fmtDist(Math.max(0, ap.d))} in ${fmtT(ap.t - g.t)}`, 24, y, ap.d < 30 ? COL.good : INK);
    }

    // ---- jobs ----
    if (W > 760) {
      const todo = Game.GOALS.filter((gl) => g.done[gl.id] === undefined).slice(0, 5), nDone = Game.GOALS.length - Game.GOALS.filter((gl) => g.done[gl.id] === undefined).length;
      y = stackRight(300, 26 + Math.max(1, todo.length) * 21, `JOBS ${nDone}/${Game.GOALS.length}`);
      const gx = W - 300 - 12;
      if (!todo.length) { ctx.font = `500 14px ${FONT}`; ctx.fillStyle = COL.good; ctx.fillText('★ All jobs done. Belt legend.', gx + 12, y); }
      todo.forEach((gl, i) => {
        ctx.font = `500 14px ${FONT}`; ctx.fillStyle = i ? COL.dim : INK; ctx.textAlign = 'left';
        ctx.fillText(fit(`☆ ${gl.text}`, gl.reward ? 228 : 276), gx + 12, y + i * 21);
        if (gl.reward) { ctx.textAlign = 'right'; ctx.fillStyle = COL.money; ctx.fillText(`$${gl.reward}`, gx + 288, y + i * 21); ctx.textAlign = 'left'; }
      });
    }

    eachDraw(g, 'drawHUD');

    // ---- top & bottom lines ----
    ctx.textAlign = 'center'; ctx.font = `600 15px ${FONT}`;
    const capped = SIM().warps[g.warpIdx] > g.warp;
    const top = `WARP ${g.warp}x${capped ? `  (max ${g.warpMax}x: ${g.warpWhy})` : ''}${cam.map ? `   ·   ${MAP_NAMES[cam.map]}` : ''}`;
    outlinedText(top, W / 2, 26, g.warp > 1 ? COL.pro : capped ? COL.warn : '#d9cff5');
    const tw = ctx.measureText(top).width; frameRects.push([W / 2 - tw / 2 - 6, 8, W / 2 + tw / 2 + 6, 34]);

    // bottom, stacked upward: controls pill, wrapped hint, interaction prompts; all centred, clear of the warp bar
    const wb = warpRect() || [W - 270, H - 68, W, H], half = Math.max(120, Math.min(W / 2 - 12, wb[0] - W / 2 - 12));
    frameRects.push(wb);
    const ctl = Game.first(g, 'controls') ||
      'W engine · Shift fine · A/D spin · S stop spin · arrows nudge · X ion · Tab target · , . warp · M map · wheel zoom · P pause';
    let cs = 12.5, cl;
    for (;; cs -= 0.5) { ctx.font = `500 ${cs}px ${FONT}`; cl = wrapText(ctl, 2 * half - 18, ' · '); if (cl.length <= 2 || cs <= 11) break; }
    const cTop = H - 18 - (cl.length - 1) * 15, cw = Math.max(...cl.map((l) => ctx.measureText(l).width)) + 18;
    const pill = [W / 2 - cw / 2, cTop - 13, W / 2 + cw / 2, H - 11];
    ctx.fillStyle = 'rgba(27,20,51,0.62)'; roundRect(pill[0], pill[1], cw, pill[3] - pill[1], 9); ctx.fill();
    ctx.fillStyle = '#d9cff5'; cl.forEach((l, i) => ctx.fillText(l, W / 2, cTop + i * 15));
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

  const SIM = () => CONFIG.sim;
  function fit(text, w) {                                          // trim with an ellipsis to fit w px in the current font
    if (ctx.measureText(text).width <= w) return text;
    while (text.length > 3 && ctx.measureText(text + '…').width > w) text = text.slice(0, -1);
    return text + '…';
  }

  function stackLeft(h, title) { const y0 = layout.left; layout.left += h + 22; return comicPanel(12, y0, 236, h, title); }
  function stackRight(w, h, title) { const y0 = layout.right; layout.right += h + 22; layout.rw = Math.max(layout.rw, w + 4); return comicPanel(W - w - 12, y0, w, h, title); }
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
  function row(label, val, x, y, col = INK) {
    ctx.font = `500 13.5px ${FONT}`; ctx.fillStyle = COL.dim; ctx.textAlign = 'left'; ctx.fillText(label, x, y);
    ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.font = `600 14px ${FONT}`; ctx.fillText(val, x + 212, y); ctx.textAlign = 'left';
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

  return { init, resize, draw, drawError, cam, kit, toScreen, screenToWorld, cycleMap };
})();
