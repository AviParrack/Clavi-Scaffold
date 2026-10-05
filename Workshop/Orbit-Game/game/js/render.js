// ======================================================================
//  RENDER  —  toon-shaded asteroids, ship, path preview, comic HUD
//  Camera: fixed orientation (world +y = screen up), follows the ship or,
//  in map mode, the reference body.
// ======================================================================

const Render = (() => {

  const S = CONFIG.ship;
  let ctx, W, H, stars, nebula;
  const cam = { x: 0, y: 0, zoom: 2, userZoom: 1, map: false };

  const INK = '#1b1433', PAPER = '#fff4dc', PAPER2 = '#ffe2b0';
  const COL = { path: '#fff1a8', pathEsc: '#ff9ec7', impact: '#ff5d5d', good: '#33c27a', warn: '#ff9f1c', bad: '#e63946',
                pro: '#ffd166', retro: '#ff8fab', dim: '#6d5f8a', text: INK };
  const LIGHT = norm(-0.55, 0.83);                                // the Sun, upper left
  const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif';

  function norm(x, y) { const n = Math.hypot(x, y); return [x / n, y / n]; }

  // ---------------- init ----------------

  function init(canvas, seed) {
    ctx = canvas.getContext('2d');
    const rand = World.rng(seed + 1);
    stars = Array.from({ length: 320 }, () => ({ x: rand(), y: rand(), b: 0.25 + 0.75 * rand(), s: rand() < 0.08 ? 2.5 : 1.2, tw: rand() * 6 }));
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
    let tx, ty, tz;
    if (cam.map && g.pred) {
      const [bx, by] = World.bodyState(g.w, g.ref, g.t);
      let ext = g.ref.R * 2.2;
      for (const p of relPath(g)) ext = Math.max(ext, Math.hypot(p[0] - bx, p[1] - by));
      ext = Math.max(ext, Math.hypot(g.sh.x - bx, g.sh.y - by));
      tx = bx; ty = by; tz = Math.min(W, H) * 0.45 / ext * cam.userZoom;
    } else if (cam.map) {
      const [bx, by] = World.bodyState(g.w, g.ref, g.t);
      tx = bx; ty = by; tz = Math.min(W, H) * 0.4 / (g.ref.R * 2) * cam.userZoom;
    } else {
      tx = g.sh.x; ty = g.sh.y; tz = 4 * cam.userZoom;
    }
    const k = 1 - Math.exp(-dt * 6);
    cam.x += (tx - cam.x) * (cam.map ? k : 1); cam.y += (ty - cam.y) * (cam.map ? k : 1);
    cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(tz) - Math.log(cam.zoom)) * k);
  }

  const toScreen = (x, y) => [W / 2 + (x - cam.x) * cam.zoom, H / 2 - (y - cam.y) * cam.zoom];
  const px = () => 1 / cam.zoom;                                    // one screen pixel in world units
  function worldTransform() { ctx.translate(W / 2, H / 2); ctx.scale(cam.zoom, -cam.zoom); ctx.translate(-cam.x, -cam.y); }

  // predicted path, re-expressed relative to the reference body (so orbits around moving rocks close)
  function relPath(g) {
    if (!g.pred) return [];
    const [bx0, by0] = World.bodyState(g.w, g.ref, g.t);
    return g.pred.pts.map(([x, y, t]) => { const [bx, by] = World.bodyState(g.w, g.ref, t); return [x - bx + bx0, y - by + by0, t]; });
  }

  // ---------------- frame ----------------

  function draw(g, dt, debug) {
    updateCamera(g, dt);
    const path = relPath(g);
    drawSpace(g);
    ctx.save(); worldTransform();
    drawTrail(g);
    drawPath(g, path);
    for (const rk of g.w.rocks) drawRock(g, rk);
    for (const b of g.w.bodies) drawBody(g, b);
    ctx.restore();
    drawParticles(g);
    drawBodyLabels(g);
    if (g.status !== 'dead') { drawMarkers(g); drawShip(g); }
    drawPathTags(g, path);
    drawPopups(g);
    drawHUD(g);
    if (debug) drawDebug(g);
  }

  // ---------------- space backdrop ----------------

  function drawSpace(g) {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#171238'); gr.addColorStop(1, '#2b1752');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(-W * 0.05, -H * 0.1, 0, -W * 0.05, -H * 0.1, Math.max(W, H) * 0.7);
    sun.addColorStop(0, 'rgba(255,214,140,0.35)'); sun.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    const D = Math.max(W, H) * 1.2, now = performance.now() / 1000;
    for (const n of nebula) {
      const x = ((n.x * D - cam.x * 0.01) % D + D) % D - D * 0.1, y = ((n.y * D + cam.y * 0.01) % D + D) % D - D * 0.1;
      const ng = ctx.createRadialGradient(x, y, 0, x, y, n.r * D);
      ng.addColorStop(0, `rgba(${n.hue},0.10)`); ng.addColorStop(1, `rgba(${n.hue},0)`);
      ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
    }
    for (const st of stars) {
      const x = ((st.x * D - cam.x * 0.03) % D + D) % D, y = ((st.y * D + cam.y * 0.03) % D + D) % D;
      if (x > W || y > H) continue;
      ctx.globalAlpha = st.b * (0.75 + 0.25 * Math.sin(now * 1.7 + st.tw));
      ctx.fillStyle = '#fff6e0';
      if (st.s > 2) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-1, -3, 2, 6); ctx.fillRect(-3, -1, 6, 2); ctx.restore(); }
      else ctx.fillRect(x, y, st.s, st.s);
    }
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

  function toonBlob(out, cx, cy, R, rot, [base, shade, hi], lineW) {
    shapePath(out, cx, cy, R, rot); ctx.fillStyle = shade; ctx.fill();
    ctx.save(); shapePath(out, cx, cy, R, rot); ctx.clip();
    shapePath(out, cx + LIGHT[0] * R * 0.3, cy + LIGHT[1] * R * 0.3, R, rot); ctx.fillStyle = base; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + LIGHT[0] * R * 0.48, cy + LIGHT[1] * R * 0.48, R * 0.28, R * 0.17, Math.atan2(LIGHT[1], LIGHT[0]) + Math.PI / 2, 0, 2 * Math.PI);
    ctx.fillStyle = hi; ctx.fill();
    ctx.restore();
    shapePath(out, cx, cy, R, rot); ctx.strokeStyle = INK; ctx.lineWidth = lineW; ctx.lineJoin = 'round'; ctx.stroke();
  }

  function drawBody(g, b) {
    const [x, y] = World.bodyState(g.w, b, g.t), [sx, sy] = toScreen(x, y), Rs = b.R * cam.zoom * 1.3;
    if (sx < -Rs || sx > W + Rs || sy < -Rs || sy > H + Rs) return;
    toonBlob(b.out, x, y, b.R, 0, b.color, 3.5 * px());
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

    if (b.id === 'ceres') drawPad(x, y, b);
    if (b.id === 'ceres' && cam.zoom < 0.35) drawFace(g, x, y, b);
  }

  function drawPad(x, y, b) {
    ctx.save(); ctx.translate(x, y + b.R);
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
    if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) return;
    if (rk.r * cam.zoom < 1.2) { ctx.fillStyle = '#8f84a8'; ctx.fillRect(x - px(), y - px(), 2 * px(), 2 * px()); return; }
    toonBlob(rk.out, x, y, rk.r, rk.spin * g.t, ROCK_COLS[Math.floor(rk.tone * 3)], 2.2 * px());
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
    if (g.trail.length < 2) return;
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

  // ---------------- ship markers & ship ----------------

  function drawMarkers(g) {
    const o = g.orb; if (o.speed < 0.2 || g.status === 'landed') return;
    const [cx, cy] = toScreen(g.sh.x, g.sh.y), a = -Math.atan2(o.vy, o.vx), R0 = 50;
    const pro = [cx + R0 * Math.cos(a), cy + R0 * Math.sin(a)], ret = [cx - R0 * Math.cos(a), cy - R0 * Math.sin(a)];
    ctx.lineWidth = 2.5; ctx.strokeStyle = COL.pro;
    ctx.beginPath(); ctx.arc(pro[0], pro[1], 6, 0, 2 * Math.PI); ctx.stroke();
    for (const d of [-Math.PI / 2, 0, Math.PI / 2]) {
      const b = a + Math.PI + d;
      ctx.beginPath(); ctx.moveTo(pro[0] + 6 * Math.cos(b), pro[1] + 6 * Math.sin(b)); ctx.lineTo(pro[0] + 11 * Math.cos(b), pro[1] + 11 * Math.sin(b)); ctx.stroke();
    }
    ctx.strokeStyle = COL.retro;
    ctx.beginPath(); ctx.arc(ret[0], ret[1], 6, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ret[0] - 4, ret[1] - 4); ctx.lineTo(ret[0] + 4, ret[1] + 4); ctx.moveTo(ret[0] + 4, ret[1] - 4); ctx.lineTo(ret[0] - 4, ret[1] + 4); ctx.stroke();
  }

  function drawShip(g) {
    const sh = g.sh, [x, y] = toScreen(sh.x, sh.y);
    const L = Math.max(S.length * cam.zoom, 34), u = L / 10;
    const lightSide = Math.sign(Math.cos(sh.ang) * LIGHT[1] - Math.sin(sh.ang) * LIGHT[0]) || 1;   // +1: light on ship's left
    ctx.save(); ctx.translate(x, y); ctx.rotate(-sh.ang + Math.PI / 2);   // nose = -y on canvas
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, 0.28 * u); ctx.strokeStyle = INK;

    if (g.fired.main) {                                            // toon flame
      const f = (0.75 + 0.25 * Math.random()) * (0.35 + 0.65 * g.fired.main);
      ctx.fillStyle = '#ff7a1c'; ctx.beginPath(); ctx.moveTo(-1.8 * u, 4.6 * u);
      ctx.lineTo(-1.1 * u, (5 + 4 * f) * u); ctx.lineTo(-0.4 * u, (5.2 + 2.5 * f) * u); ctx.lineTo(0, (5 + 6 * f) * u);
      ctx.lineTo(0.4 * u, (5.2 + 2.5 * f) * u); ctx.lineTo(1.1 * u, (5 + 4 * f) * u); ctx.lineTo(1.8 * u, 4.6 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(-0.9 * u, 4.6 * u); ctx.lineTo(0, (5 + 3.3 * f) * u); ctx.lineTo(0.9 * u, 4.6 * u); ctx.closePath(); ctx.fill();
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
    const blink = (g.t % 3.7) < 0.12, spin = Math.abs(sh.omega) > 2;  // pilot's eyes
    ctx.fillStyle = INK;
    for (const ex of [-0.45, 0.45]) {
      if (blink) ctx.fillRect((ex - 0.25) * u, -0.5 * u, 0.5 * u, 0.15 * u);
      else if (spin) { ctx.font = `bold ${0.9 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('@', ex * u, -0.15 * u); }
      else { ctx.beginPath(); ctx.arc(ex * u, -0.45 * u, 0.2 * u, 0, 2 * Math.PI); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawParticles(g) {
    for (const p of g.particles) {
      const [x, y] = toScreen(p.x, p.y), f = p.life / p.max;
      if (p.kind === 'boom') {
        ctx.fillStyle = f > 0.5 ? '#ffd166' : '#ff7a1c'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 2 + 5 * f, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      } else if (p.kind === 'puff') {
        ctx.fillStyle = `rgba(255,255,255,${0.9 * f})`; ctx.beginPath(); ctx.arc(x, y, 2 + 4 * (1 - f), 0, 2 * Math.PI); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(255,236,200,${0.45 * f})`; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, (1.5 - f) * 2.2 * cam.zoom), 0, 2 * Math.PI); ctx.fill();
      }
    }
  }

  // ---------------- labels: on-screen names & off-screen arrows ----------------

  function drawBodyLabels(g) {
    for (const b of g.w.bodies) {
      const [bx, by] = World.bodyState(g.w, b, g.t), [x, y] = toScreen(bx, by), Rs = b.R * cam.zoom;
      const dist = Math.hypot(g.sh.x - bx, g.sh.y - by) - b.R;
      if (x > -Rs && x < W + Rs && y > -Rs && y < H + Rs) {
        if (Rs > 4 && Rs < 220 && y - Rs - 14 > 0) tag(x, Math.max(28, y - Rs - 14), b.name, b.color[2]);
        continue;
      }
      const a = Math.atan2(y - H / 2, x - W / 2), m = 34;
      const ex = Math.max(m, Math.min(W - m, W / 2 + Math.cos(a) * W)), ey = Math.max(m + 40, Math.min(H - m - 70, H / 2 + Math.sin(a) * H));
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = b.color[0]; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      tag(ex - Math.cos(a) * 30, ey - Math.sin(a) * 22, `${b.name} ${fmtDist(dist)}`, b.color[2]);
    }
  }

  // ---------------- HUD ----------------

  function drawHUD(g) {
    const sh = g.sh, o = g.orb, ref = g.ref;

    // ---- ship panel ----
    let y = comicPanel(12, 12, 236, 214, S.name.toUpperCase());
    bar('HULL', sh.hull / S.hull, 24, y, sh.hull < 35 ? COL.bad : COL.good, `${Math.max(0, sh.hull).toFixed(0)}%`); y += 30;
    bar('FUEL', sh.fuel / S.fuel, 24, y, sh.fuel / S.fuel < 0.2 ? COL.bad : COL.warn, `Δv ${Physics.deltaV(sh, S).toFixed(0)} m/s`); y += 30;
    bar('RCS', sh.rcs / S.rcs, 24, y, sh.rcs / S.rcs < 0.2 ? COL.bad : '#4cc9f0', `${sh.rcs.toFixed(1)}`); y += 30;
    const spinDeg = sh.omega * 180 / Math.PI;
    row('SPIN', `${Math.abs(spinDeg).toFixed(0)}°/s ${spinDeg > 1 ? '⟲' : spinDeg < -1 ? '⟳' : ''}`, 24, y, Math.abs(spinDeg) > 90 ? COL.bad : INK); y += 20;
    row('ENGINE', g.fired.main ? (g.fired.main < 0.5 ? 'fine' : 'FULL') : 'off', 24, y, g.fired.main ? COL.warn : COL.dim);

    // ---- orbit panel ----
    y = comicPanel(12, 238, 236, 152, `NEAR ${ref.name.toUpperCase()}`);
    row('ALTITUDE', fmtDist(o.alt), 24, y); y += 20;
    row('SPEED', `${o.speed.toFixed(1)} m/s`, 24, y); y += 20;
    row('CLIMB', `${o.vr >= 0 ? '+' : ''}${o.vr.toFixed(1)} m/s`, 24, y); y += 20;
    const orbitTxt = g.status === 'landed' ? `landed on ${g.landedOn.name}` : o.E >= 0 ? 'not captured' : g.pred && g.pred.impact ? 'impact course' : `orbit ${fmtT(o.T)}`;
    row('STATUS', orbitTxt, 24, y, g.pred && g.pred.impact ? COL.bad : o.E >= 0 ? COL.dim : COL.good); y += 20;
    row('CLEARANCE', fmtDist(g.nearDist), 24, y, g.nearDist < 20 ? COL.bad : INK);

    // ---- goals ----
    const gw = 292, gx = W - gw - 12;
    if (W > 760) {
      y = comicPanel(gx, 12, gw, 34 + Game.GOALS.length * 21, 'FLIGHT SCHOOL');
      Game.GOALS.forEach((goal, i) => {
        const done = g.done[goal.id] !== undefined;
        ctx.font = `500 14px ${FONT}`; ctx.fillStyle = done ? COL.good : COL.dim; ctx.textAlign = 'left';
        ctx.fillText(`${done ? '★' : '☆'} ${goal.text}`, gx + 12, y + i * 21);
      });
    }

    // ---- top & bottom lines ----
    ctx.textAlign = 'center'; ctx.font = `600 15px ${FONT}`;
    const warp = CONFIG.sim.warps[g.warpIdx];
    const top = `WARP ${warp}x${cam.map ? '   ·   MAP' : ''}${g.nearDist < 60 && warp === CONFIG.sim.nearWarp ? '   (near rocks)' : ''}`;
    outlinedText(top, W / 2, 26, warp > 1 ? COL.pro : '#d9cff5');
    ctx.font = `500 16px ${FONT}`;
    outlinedText(Game.hint(g), W / 2, H - 44, '#fff4dc');
    ctx.font = `400 12.5px ${FONT}`; ctx.fillStyle = '#b9addf';
    ctx.fillText('W engine · Shift fine · A/D spin · S stop spin · arrows nudge · , . warp · M map · wheel/+/- zoom · R restart · T spawn', W / 2, H - 18);

    // ---- toast ----
    if (g.toast) {
      const age = (performance.now() - g.toast.t0) / 1000;
      if (age < 3) {
        ctx.save(); ctx.globalAlpha = Math.min(1, 3 - age);
        const s = 1 + 0.25 * Math.max(0, 0.25 - age) / 0.25;
        ctx.translate(W / 2, H * 0.26); ctx.scale(s, s); ctx.rotate(-0.04);
        ctx.font = `700 44px ${FONT}`; ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
        ctx.strokeText(g.toast.text, 4, 4); ctx.strokeText(g.toast.text, 0, 0);
        ctx.fillStyle = PAPER2; ctx.fillText(g.toast.text, 0, 0);
        ctx.restore();
      }
    }
    ctx.textAlign = 'left';
  }

  function drawPopups(g) {
    for (const p of g.popups) {
      const age = (performance.now() - p.t0) / 1000, [x, y] = toScreen(p.x, p.y);
      ctx.save(); ctx.translate(x + 30, y - 30 - age * 40); ctx.rotate(-0.12); ctx.globalAlpha = Math.min(1, 1.4 - age);
      ctx.font = `700 ${26 + 10 * Math.max(0, 0.15 - age) / 0.15}px ${FONT}`; ctx.textAlign = 'center';
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawDebug(g) {
    const sh = g.sh, o = g.orb;
    const lines = [
      `DEBUG seed ${g.w.seed}  spawn ${g.spawn}  t ${g.t.toFixed(2)}s  steps/frame ${g.stepsLastFrame}  status ${g.status}  ref ${g.ref.name}`,
      `x ${sh.x.toFixed(1)}  y ${sh.y.toFixed(1)}  vx ${sh.vx.toFixed(2)}  vy ${sh.vy.toFixed(2)}  ang ${(sh.ang * 180 / Math.PI % 360).toFixed(1)}°  ω ${sh.omega.toFixed(3)}`,
      `rel: r ${o.r.toFixed(1)}  v ${o.speed.toFixed(2)}  E ${o.E.toFixed(3)}  e ${o.e.toFixed(3)}  pe ${o.pe.toFixed(1)}  ap ${o.ap.toFixed(1)}`,
      `pred ${g.pred ? g.pred.pts.length + ' pts, ' + (g.pred.pts[g.pred.pts.length - 1][2] - g.t).toFixed(0) + ' s' : '-'}  impact ${g.pred && g.pred.impact ? g.pred.impact.body.name : 'none'}  near ${g.nearDist.toFixed(1)}`,
      ...g.events.slice(-3).map((e) => `  ${e.t.toFixed(1)}s ${e.msg}`),
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(10, H - 90 - lines.length * 15, 640, lines.length * 15 + 10);
    ctx.fillStyle = '#9effa0'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, 16, H - 82 - (lines.length - 1 - i) * 15));
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

  function drawError(msg) {
    ctx.save(); ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.fillStyle = 'rgba(230,57,70,0.92)'; ctx.fillRect(10, H / 2 - 30, W - 20, 60);
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`Bug caught: ${msg}`.slice(0, 140), W / 2, H / 2 - 4); ctx.fillText('Screenshot this for Claude. The game keeps running; R restarts.', W / 2, H / 2 + 16);
    ctx.restore();
  }

  return { init, resize, draw, drawError, cam };
})();
