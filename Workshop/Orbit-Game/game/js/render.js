// ======================================================================
//  RENDER  —  toon-shaded asteroids, terrain overlay, ship, path preview,
//  nav target, comic HUD.  Camera follows the ship (fixed orientation),
//  the ref body in map mode, or a module's camera hook (EVA: rotated so
//  local up is screen up).  Modules draw through Render.kit.
// ======================================================================

const Render = (() => {

  let ctx, W, H, stars, nebula;
  const cam = { x: 0, y: 0, zoom: 2, rot: 0, userZoom: 1, map: false, shx: 0, shy: 0 };

  const INK = '#1b1433', PAPER = '#fff4dc', PAPER2 = '#ffe2b0';
  const COL = { path: '#fff1a8', pathEsc: '#ff9ec7', impact: '#ff5d5d', good: '#33c27a', warn: '#ff9f1c', bad: '#e63946',
                pro: '#ffd166', retro: '#ff8fab', tgt: '#7cf5d6', dim: '#6d5f8a', text: INK, money: '#2f9e5b' };
  const LIGHT = norm(-0.55, 0.83);                                // the Sun, upper left
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
    else if (cam.map) {
      const [bx, by] = World.bodyState(g.w, g.ref, g.t);
      let ext = g.ref.R * 2.2;
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

  // predicted path, re-expressed relative to the reference body (so orbits around moving rocks close)
  function relPath(g) {
    if (!g.pred) return [];
    const [bx0, by0] = World.bodyState(g.w, g.ref, g.t);
    return g.pred.pts.map(([x, y, t]) => { const [bx, by] = World.bodyState(g.w, g.ref, t); return [x - bx + bx0, y - by + by0, t]; });
  }
  function relPoint(g, x, y, t) {
    const [bx0, by0] = World.bodyState(g.w, g.ref, g.t), [bx, by] = World.bodyState(g.w, g.ref, t);
    return [x - bx + bx0, y - by + by0];
  }

  // ---------------- frame ----------------

  let layout = { left: 0, right: 0 };

  function draw(g, dt, debug) {
    updateCamera(g, dt);
    Terrain.frameStart();
    const path = relPath(g), view = viewRect(20);
    drawSpace(g);
    ctx.save(); worldTransform();
    drawTrail(g);
    drawPath(g, path);
    for (const rk of g.w.rocks) drawRock(g, rk);
    for (const b of g.w.bodies) drawBody(g, b, view);
    drawPickups(g, view);
    eachDraw(g, 'drawWorld');
    ctx.restore();
    drawParticles(g);
    drawBodyLabels(g);
    if (g.status !== 'dead') { drawMarkers(g); drawShip(g); }
    ctx.save(); worldTransform(); eachDraw(g, 'drawWorldTop'); ctx.restore();
    drawPathTags(g, path);
    drawApproach(g, path);
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

  function drawSpace(g) {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#171238'); gr.addColorStop(1, '#2b1752');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(-W * 0.05, -H * 0.1, 0, -W * 0.05, -H * 0.1, Math.max(W, H) * 0.7);
    sun.addColorStop(0, 'rgba(255,214,140,0.35)'); sun.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    const D = Math.hypot(W, H) * 1.05, now = g.real;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot);
    for (const n of nebula) {
      const x = ((n.x * D - cam.x * 0.01) % D + D) % D - D / 2, y = ((n.y * D + cam.y * 0.01) % D + D) % D - D / 2;
      const ng = ctx.createRadialGradient(x, y, 0, x, y, n.r * D);
      ng.addColorStop(0, `rgba(${n.hue},0.10)`); ng.addColorStop(1, `rgba(${n.hue},0)`);
      ctx.fillStyle = ng; ctx.fillRect(-D / 2, -D / 2, D, D);
    }
    ctx.fillStyle = '#fff6e0';
    for (const st of stars) {
      const x = ((st.x * D - cam.x * 0.03) % D + D) % D - D / 2, y = ((st.y * D + cam.y * 0.03) % D + D) % D - D / 2;
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
    const [x, y] = World.bodyState(g.w, b, g.t), Rb = b.R * (1 + b.shape);
    if (x + Rb < view[0] || x - Rb > view[2] || y + Rb < view[1] || y - Rb > view[3]) return;
    toonBlob(b.out, x, y, b.R, 0, b.color, 3.5 * px(), true);
    if (b.R * cam.zoom < 6) return;

    ctx.save(); shapePath(b.out, x, y, b.R); ctx.clip();
    for (const c of b.craters) {                                   // craters: dark bowl, lit far rim
      const cx = x + b.R * c.d * Math.cos(c.th), cy = y + b.R * c.d * Math.sin(c.th), cr = b.R * c.r;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 2 * Math.PI); ctx.fillStyle = b.color[1]; ctx.fill();
      ctx.beginPath(); ctx.arc(cx - LIGHT[0] * cr * 0.3, cy - LIGHT[1] * cr * 0.3, cr * 0.8, 0, 2 * Math.PI); ctx.fillStyle = b.color[0]; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 2 * Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px(); ctx.stroke();
    }
    if (b.id === 'ceres') {                                        // Occator's bright spots
      const ox = x + b.R * 0.35, oy = y - b.R * 0.2;
      const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, b.R * 0.12);
      glow.addColorStop(0, 'rgba(230,255,255,0.95)'); glow.addColorStop(1, 'rgba(230,255,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ox, oy, b.R * 0.12, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#f4ffff'; ctx.beginPath(); ctx.arc(ox, oy, b.R * 0.025, 0, 2 * Math.PI); ctx.arc(ox + b.R * 0.05, oy + b.R * 0.03, b.R * 0.015, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();

    if (cam.zoom >= 0.9) Terrain.of(b);                           // build the grid once it is worth seeing
    if (b.id === 'ceres') drawPad(x, y, b);                       // under the terrain overlay, so holes dug beneath it show
    Terrain.draw(ctx, b, x, y, cam.zoom, view, g.real);
    if (b.id === 'ceres' && cam.zoom < 0.35) drawFace(g, x, y, b);
  }

  function drawPad(x, y, b) {
    ctx.save(); ctx.translate(x, y + World.surfaceR(b, Math.PI / 2));
    ctx.fillStyle = '#7d7aa6'; ctx.fillRect(-10, -1, 20, 2.2);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px(); ctx.strokeRect(-10, -1, 20, 2.2);
    ctx.fillStyle = '#ff9f1c'; for (let i = -9; i < 10; i += 4) ctx.fillRect(i, 0.6, 2, 0.6);
    ctx.fillStyle = '#c9c4e8'; ctx.fillRect(9, 1.2, 1.6, 13); ctx.strokeRect(9, 1.2, 1.6, 13);
    ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.arc(9.8, 15, 1.1, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
  }

  // Ceres naps; it opens its eyes when you leave its neighbourhood
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

  const ROCK_COLS = [['#b8a99a', '#76665f', '#e2d6c8'], ['#a69bb8', '#675c7c', '#d6cde6'], ['#c4a37f', '#7e6248', '#ecd2b0']];

  function drawRock(g, rk) {
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

  function drawTrail(g) {                                          // drawn in the ref body's frame, like the preview
    if (g.trail.length < 2 || g.status !== 'flying') return;
    const [bx0, by0] = World.bodyState(g.w, g.ref, g.t);
    ctx.strokeStyle = 'rgba(255,244,220,0.22)'; ctx.lineWidth = 1.5 * px();
    ctx.beginPath();
    g.trail.forEach(([x, y, t], i) => {
      const [bx, by] = World.bodyState(g.w, g.ref, t), X = x - bx + bx0, Y = y - by + by0;
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
      tag(x, y + 22, `IMPACT ${(g.pred.impact.t - g.t).toFixed(0)}s`, COL.impact);
    }
    if (g.orb.E >= 0) return;
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
    if (ap.i < 0 || !path[ap.i] || tg.id === 'body:' + g.ref.id) return;
    const [px1, py1] = toScreen(path[ap.i][0], path[ap.i][1]);
    const [gx, gy] = relPoint(g, ap.tx, ap.ty, ap.t), [px2, py2] = toScreen(gx, gy);
    ctx.setLineDash([4, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.tgt; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px1, py1 - 7); ctx.lineTo(px1 + 7, py1); ctx.lineTo(px1, py1 + 7); ctx.lineTo(px1 - 7, py1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(px2, py2, Math.max(5, (tg.r || 2) * cam.zoom), 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1;
    tag(px1, py1 - 16, `${fmtDist(Math.max(0, ap.d))} in ${fmtT(ap.t - g.t)}`, COL.tgt);
  }

  // ---------------- ship markers & ship ----------------

  function drawMarkers(g) {
    if (g.status === 'landed' || g.status === 'docked' || g.mode !== 'ship') return;
    const ap = g.approach, near = ap && ap.dNow < 300 && ap.vNow > 0.05;
    const vx = near ? ap.rvx : g.orb.vx, vy = near ? ap.rvy : g.orb.vy;
    if (Math.hypot(vx, vy) < 0.05) return;
    const [cx, cy] = toScreen(g.sh.x, g.sh.y), a = screenAng(Math.atan2(vy, vx)), R0 = 50;
    const pro = [cx + R0 * Math.cos(a), cy + R0 * Math.sin(a)], ret = [cx - R0 * Math.cos(a), cy - R0 * Math.sin(a)];
    ctx.lineWidth = 2.5; ctx.strokeStyle = near ? COL.tgt : COL.pro;
    ctx.beginPath(); ctx.arc(pro[0], pro[1], 6, 0, 2 * Math.PI); ctx.stroke();
    for (const d of [-Math.PI / 2, 0, Math.PI / 2]) {
      const b = a + Math.PI + d;
      ctx.beginPath(); ctx.moveTo(pro[0] + 6 * Math.cos(b), pro[1] + 6 * Math.sin(b)); ctx.lineTo(pro[0] + 11 * Math.cos(b), pro[1] + 11 * Math.sin(b)); ctx.stroke();
    }
    ctx.strokeStyle = near ? COL.tgt : COL.retro;
    ctx.beginPath(); ctx.arc(ret[0], ret[1], 6, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ret[0] - 4, ret[1] - 4); ctx.lineTo(ret[0] + 4, ret[1] + 4); ctx.moveTo(ret[0] + 4, ret[1] - 4); ctx.lineTo(ret[0] - 4, ret[1] + 4); ctx.stroke();
    if (near) { ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; outlinedText('TGT', pro[0], pro[1] - 12, COL.tgt, 3); ctx.textAlign = 'left'; }
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

  function drawBodyLabels(g) {
    for (const b of g.w.bodies) {
      const [bx, by] = World.bodyState(g.w, b, g.t), [x, y] = toScreen(bx, by), Rs = b.R * cam.zoom;
      const dist = Math.hypot(g.sh.x - bx, g.sh.y - by) - b.R;
      if (x > -Rs && x < W + Rs && y > -Rs && y < H + Rs) {
        if (Rs > 4 && Rs < 220 && y - Rs - 14 > 0 && g.mode === 'ship') tag(x, Math.max(28, y - Rs - 14), b.name, b.color[2]);
        continue;
      }
      if (g.mode !== 'ship' && b !== g.ref) continue;
      const a = Math.atan2(y - H / 2, x - W / 2), m = 34;
      const ex = Math.max(m, Math.min(W - m, W / 2 + Math.cos(a) * W)), ey = Math.max(m + 40, Math.min(H - m - 110, H / 2 + Math.sin(a) * H));
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = b.color[0]; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      tag(ex - Math.cos(a) * 30, ey - Math.sin(a) * 22, `${b.name} ${fmtDist(dist)}`, b.color[2]);
    }
  }

  // ---------------- HUD ----------------

  function drawHUD(g) {
    const sh = g.sh, S = g.S, o = g.orb, ref = g.ref;
    layout = { left: 12, right: 12 };

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
    if (g.mode === 'ship') {
      y = stackLeft(130, `NEAR ${ref.name.toUpperCase()}`);
      row('ALTITUDE', fmtDist(Math.max(0, o.alt - S.radius)), 24, y); y += 20;
      row('SPEED', `${o.speed.toFixed(1)} m/s`, 24, y); y += 20;
      row('CLIMB', `${o.vr >= 0 ? '+' : ''}${o.vr.toFixed(1)} m/s`, 24, y); y += 20;
      const st = g.status === 'landed' ? `landed on ${g.landedOn.name}` : g.status === 'docked' ? `docked: ${g.attach.name}` : g.status === 'dead' ? 'wrecked'
               : o.E >= 0 ? 'not captured' : g.pred && g.pred.impact ? 'impact course' : `orbit ${fmtT(o.T)}`;
      row('STATUS', st, 24, y, g.pred && g.pred.impact ? COL.bad : o.E >= 0 && g.status === 'flying' ? COL.dim : COL.good); y += 20;
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
    const top = `WARP ${g.warp}x${capped ? `  (max ${g.warpMax}x: ${g.warpWhy})` : ''}${cam.map ? '   ·   MAP' : ''}`;
    outlinedText(top, W / 2, 26, g.warp > 1 ? COL.pro : capped ? COL.warn : '#d9cff5');

    g.prompts.forEach((p, i) => {
      const yy = H - 84 - i * 32, label = p.key.replace(/^Key|^Digit/, '');
      ctx.font = `600 17px ${FONT}`; const w = ctx.measureText(p.text).width + 44;
      ctx.fillStyle = INK; roundRect(W / 2 - w / 2 + 3, yy - 19, w, 28, 8); ctx.fill();
      ctx.fillStyle = p.col || PAPER2; roundRect(W / 2 - w / 2, yy - 22, w, 28, 8); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = INK; roundRect(W / 2 - w / 2 + 5, yy - 18, 24, 20, 5); ctx.fill();
      ctx.fillStyle = PAPER; ctx.font = `700 14px ${FONT}`; ctx.fillText(label, W / 2 - w / 2 + 17, yy - 3);
      ctx.fillStyle = INK; ctx.font = `600 17px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(p.text, W / 2 - w / 2 + 36, yy - 2); ctx.textAlign = 'center';
    });

    ctx.font = `500 16px ${FONT}`;
    const hint = Game.hint(g), hw = W - 580;                      // long hints wrap onto a second line, clear of the warp bar
    if (ctx.measureText(hint).width <= hw) outlinedText(hint, W / 2, H - 44, '#fff4dc');
    else {
      let cut = hint.lastIndexOf(' ', Math.ceil(hint.length / 2) + 6); if (cut < 1) cut = Math.ceil(hint.length / 2);
      outlinedText(fit(hint.slice(0, cut), hw), W / 2, H - 66, '#fff4dc');
      outlinedText(fit(hint.slice(cut + 1), hw), W / 2, H - 44, '#fff4dc');
    }
    ctx.font = `400 12.5px ${FONT}`; ctx.fillStyle = '#b9addf';
    const ctl = Game.first(g, 'controls') ||
      'W engine · Shift fine · A/D spin · S stop spin · arrows nudge · X ion · Tab target · , . warp · M map · wheel zoom · P pause';
    ctx.fillText(ctl, W / 2, H - 18);

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
  function stackRight(w, h, title) { const y0 = layout.right; layout.right += h + 22; return comicPanel(W - w - 12, y0, w, h, title); }

  function drawPopups(g) {
    for (const p of g.popups) {
      const age = g.real - p.t0, [x, y] = toScreen(p.x, p.y), sz = p.size || 26;
      ctx.save(); ctx.translate(x + 30, y - 30 - age * 40 - (p.lift || 0) * 26); ctx.rotate(-0.12); ctx.globalAlpha = Math.max(0, Math.min(1, 1.4 - age));
      ctx.font = `700 ${sz + 10 * Math.max(0, 0.15 - age) / 0.15}px ${FONT}`; ctx.textAlign = 'center';
      ctx.lineWidth = sz / 4 + 1; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawDebug(g) {
    const sh = g.sh, o = g.orb;
    const lines = [
      `DEBUG seed ${g.w.seed}  spawn ${g.spawn}  t ${g.t.toFixed(2)}s  steps/frame ${g.stepsLastFrame}  status ${g.status}  mode ${g.mode}  ref ${g.ref.name}`,
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
  const fmtT = (t) => !isFinite(t) ? '—' : t >= 60 ? `${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s` : `${t.toFixed(0)}s`;
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
    shapePath, toonBlob, tag, outlinedText, comicPanel, row, bar, roundRect, stackLeft, stackRight, drawPickup, fit,
    fmtDist, fmtT, money, INK, PAPER, PAPER2, COL, LIGHT, FONT,
  };

  return { init, resize, draw, drawError, cam, kit, toScreen, screenToWorld };
})();
