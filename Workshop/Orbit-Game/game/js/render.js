// ======================================================================
//  RENDER  —  camera, planet, orbit preview, rocket, HUD
// ======================================================================

const Render = (() => {

  const P = CONFIG.planet, Rk = CONFIG.rocket;
  let ctx, W, H, scenery, stars;
  const cam = { x: 0, y: P.R, zoom: 3, rot: 0, userZoom: 1, map: false };

  const COL = {
    space: '#0b0d21', sky: '#7ec8ff', ground: '#5bbf6a', grassDark: '#3f9a52', core: '#c98b5a',
    orbit: '#ffd166', orbitEsc: '#ff7aa2', trail: 'rgba(255,255,255,0.35)', hud: '#e8f1ff', dim: '#8ea0c8',
    good: '#7dffb0', warn: '#ffb347', bad: '#ff6b6b',
  };

  // ---------------- seeded rng ----------------

  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------------- init ----------------

  function init(canvas, seed) {
    ctx = canvas.getContext('2d');
    const rand = rng(seed);
    stars = Array.from({ length: 260 }, () => ({ x: rand(), y: rand(), b: 0.3 + 0.7 * rand(), s: rand() < 0.1 ? 2 : 1 }));
    scenery = [];
    for (let i = 0; i < 70; i++) {
      const th = rand() * 2 * Math.PI;
      if (Math.abs(Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2))) < 0.04) continue; // keep the pad clear
      scenery.push({ th, kind: rand() < 0.75 ? 'tree' : 'house', h: 5 + rand() * 6, hue: rand() });
    }
    for (let i = 0; i < 18; i++) scenery.push({ th: rand() * 2 * Math.PI, kind: 'cloud', alt: 35 + rand() * 60, w: 14 + rand() * 22, spd: 0.002 + rand() * 0.004 });
    resize(canvas);
  }

  function resize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------------- camera ----------------
  //  world (y up) -> screen:  translate(center) * scale(z, -z) * rotate(rot) * translate(-cam)

  function updateCamera(g, dt) {
    const s = g.s, o = Physics.orbit(s, P), r = Physics.radius(s);
    let tx, ty, tz, trot;
    if (cam.map) {
      const far = o.E < 0 ? Math.max(o.ra, r) : Math.max(r * 1.6, P.R * 2);
      tx = 0; ty = 0; tz = Math.min(W, H) * 0.44 / far * cam.userZoom; trot = 0;
    } else {
      tx = s.x; ty = s.y;
      tz = 3.2 / (1 + Math.max(0, g.alt) / 70) * cam.userZoom;
      tz = Math.max(tz, 0.12);
      trot = Math.PI / 2 - Math.atan2(s.y, s.x);
    }
    const k = 1 - Math.exp(-dt * 5);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(tz) - Math.log(cam.zoom)) * k);
    cam.rot += Math.atan2(Math.sin(trot - cam.rot), Math.cos(trot - cam.rot)) * k;
  }

  function toScreen(x, y) {
    const dx = x - cam.x, dy = y - cam.y, c = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    const rx = dx * c - dy * sn, ry = dx * sn + dy * c;
    return [W / 2 + rx * cam.zoom, H / 2 - ry * cam.zoom];
  }
  const screenAngle = (worldAngle) => -(worldAngle + cam.rot);   // canvas angle of a world direction

  function worldTransform() {
    ctx.translate(W / 2, H / 2); ctx.scale(cam.zoom, -cam.zoom); ctx.rotate(cam.rot); ctx.translate(-cam.x, -cam.y);
  }

  // ---------------- frame ----------------

  function draw(g, dt, debug) {
    updateCamera(g, dt);
    drawSky(g);
    ctx.save(); worldTransform();
    drawAtmosphere(); drawOrbit(g); drawTrail(g); drawPlanet(g);
    ctx.restore();
    drawParticles(g);
    if (g.status !== 'crashed') drawRocket(g);
    drawMarkers(g);
    drawHUD(g);
    if (debug) drawDebug(g);
  }

  // ---------------- sky & stars ----------------

  function drawSky(g) {
    const day = cam.map ? 0 : Math.min(1, Physics.density(Math.max(0, g.alt), P) / P.rho0 * 1.4);
    ctx.fillStyle = mix(COL.space, COL.sky, day);
    ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-cam.rot * 0.3);
    const D = Math.hypot(W, H);
    for (const st of stars) {
      ctx.globalAlpha = st.b * (1 - day);
      ctx.fillStyle = '#fff';
      ctx.fillRect((st.x - 0.5) * D, (st.y - 0.5) * D, st.s, st.s);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawAtmosphere() {
    const gr = ctx.createRadialGradient(0, 0, P.R, 0, 0, P.R + P.atmoTop * 1.3);
    gr.addColorStop(0, 'rgba(126,200,255,0.55)'); gr.addColorStop(1, 'rgba(126,200,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, P.R + P.atmoTop * 1.3, 0, 2 * Math.PI); ctx.fill();
  }

  // ---------------- planet ----------------

  function drawPlanet(g) {
    const px = 1 / cam.zoom;
    ctx.fillStyle = COL.core; ctx.beginPath(); ctx.arc(0, 0, P.R, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = COL.ground; ctx.lineWidth = Math.max(18, 3 * px); ctx.beginPath(); ctx.arc(0, 0, P.R - ctx.lineWidth / 2, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = COL.grassDark; ctx.lineWidth = Math.max(2, 1.5 * px); ctx.beginPath(); ctx.arc(0, 0, P.R, 0, 2 * Math.PI); ctx.stroke();

    if (cam.zoom < 0.5) drawPlanetFace(g);
    if (cam.zoom < 0.3) return;

    for (const it of scenery) {
      ctx.save();
      if (it.kind === 'cloud') {
        const th = it.th + g.t * it.spd;
        ctx.rotate(th - Math.PI / 2); ctx.translate(0, P.R + it.alt);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const [dx, dy, rr] of [[-0.35, 0, 0.3], [0, 0.12, 0.38], [0.35, 0, 0.28]]) {
          ctx.beginPath(); ctx.arc(dx * it.w, dy * it.w, rr * it.w * 0.6, 0, 2 * Math.PI); ctx.fill();
        }
      } else {
        ctx.rotate(it.th - Math.PI / 2); ctx.translate(0, P.R);
        if (it.kind === 'tree') {
          ctx.fillStyle = '#7a5235'; ctx.fillRect(-0.6, 0, 1.2, it.h * 0.4);
          ctx.fillStyle = it.hue < 0.5 ? '#2f8f4e' : '#3fae5a';
          ctx.beginPath(); ctx.arc(0, it.h * 0.65, it.h * 0.38, 0, 2 * Math.PI); ctx.fill();
        } else {
          ctx.fillStyle = ['#ffd6a5', '#bde0fe', '#ffc8dd'][Math.floor(it.hue * 3)];
          ctx.fillRect(-3, 0, 6, 5);
          ctx.fillStyle = '#d1495b'; ctx.beginPath(); ctx.moveTo(-3.8, 5); ctx.lineTo(0, 8.5); ctx.lineTo(3.8, 5); ctx.fill();
          ctx.fillStyle = '#ffe066'; ctx.fillRect(-1, 1.5, 2, 2);
        }
      }
      ctx.restore();
    }

    // launch pad at the north pole
    ctx.save(); ctx.translate(0, P.R);
    ctx.fillStyle = '#6c757d'; ctx.fillRect(-9, 0, 18, 1.5);
    ctx.fillStyle = '#adb5bd'; ctx.fillRect(7, 0, 1.6, 16);
    ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 0.4;
    for (let y = 0; y < 16; y += 2) { ctx.beginPath(); ctx.moveTo(7, y); ctx.lineTo(8.6, y + 2); ctx.stroke(); }
    ctx.restore();
  }

  // Pebble is a sleepy little planet; it wakes up when you are far away from home
  function drawPlanetFace(g) {
    const k = P.R * 0.22, awake = g.alt > 600 || g.status === 'crashed';
    ctx.save(); ctx.globalAlpha = Math.min(1, (0.5 - cam.zoom) / 0.2);
    ctx.fillStyle = 'rgba(255,170,170,0.5)';
    for (const sx of [-1.6, 1.6]) { ctx.beginPath(); ctx.arc(sx * k, -0.25 * k, 0.35 * k, 0, 2 * Math.PI); ctx.fill(); }
    ctx.strokeStyle = '#5a3a24'; ctx.fillStyle = '#5a3a24'; ctx.lineWidth = 0.12 * k; ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      if (awake) ctx.arc(sx * k, 0.25 * k, 0.22 * k, 0, 2 * Math.PI), ctx.fill();
      else ctx.arc(sx * k, 0.35 * k, 0.3 * k, Math.PI * 1.15, Math.PI * 1.85, false), ctx.stroke();
    }
    ctx.beginPath();
    if (g.status === 'crashed') ctx.arc(0, -0.75 * k, 0.25 * k, 0.15 * Math.PI, 0.85 * Math.PI, false);
    else ctx.arc(0, -0.35 * k, 0.25 * k, 1.15 * Math.PI, 1.85 * Math.PI, false);
    ctx.stroke(); ctx.restore();
  }

  // ---------------- orbit preview ----------------

  function drawOrbit(g) {
    if (g.status === 'pad' || g.status === 'crashed') return;
    const o = Physics.orbit(g.s, P), px = 1 / cam.zoom;
    ctx.strokeStyle = o.E < 0 ? COL.orbit : COL.orbitEsc;
    ctx.lineWidth = 2 * px; ctx.setLineDash([8 * px, 6 * px]);
    ctx.beginPath();
    const N = 360, rMax = Math.max(P.R * 8, Physics.radius(g.s) * 3);
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const th = i / N * 2 * Math.PI, r = Physics.conicRadius(o, th);
      if (!(r > 0 && r < rMax)) { pen = false; continue; }
      const x = r * Math.cos(th), y = r * Math.sin(th);
      pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true;
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  function drawTrail(g) {
    if (g.trail.length < 2) return;
    ctx.strokeStyle = COL.trail; ctx.lineWidth = 1.5 / cam.zoom;
    ctx.beginPath(); ctx.moveTo(g.trail[0][0], g.trail[0][1]);
    for (const [x, y] of g.trail) ctx.lineTo(x, y);
    ctx.lineTo(g.s.x, g.s.y); ctx.stroke();
  }

  // ---------------- Ap / Pe markers + prograde/retro (screen space) ----------------

  function drawMarkers(g) {
    if (g.status === 'pad' || g.status === 'crashed') return;
    const s = g.s, o = Physics.orbit(s, P);
    ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';

    const peDir = o.omega, apDir = o.omega + Math.PI;
    const tag = (r, th, label, col) => {
      if (!(r > 0 && isFinite(r))) return;
      const [x, y] = toScreen(r * Math.cos(th), r * Math.sin(th));
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) return;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillText(label, x, y - 10);
    };
    if (o.e > 0.002) {
      if (o.pe > 0) tag(o.rp, peDir, `Pe ${fmtAlt(o.pe)}`, o.pe < P.atmoTop ? COL.bad : COL.good);
      if (o.E < 0 && o.ap > 25) tag(o.ra, apDir, `Ap ${fmtAlt(o.ap)}`, COL.orbit);
    }

    // prograde / retrograde ring around the rocket
    if (Physics.speed(s) > 0.5) {
      const [cx, cy] = toScreen(s.x, s.y), a = screenAngle(Math.atan2(s.vy, s.vx)), R0 = 46;
      ctx.lineWidth = 2;
      ctx.strokeStyle = g.hold === 'pro' ? COL.good : COL.orbit;
      const x1 = cx + R0 * Math.cos(a), y1 = cy + R0 * Math.sin(a);
      ctx.beginPath(); ctx.arc(x1, y1, 6, 0, 2 * Math.PI); ctx.stroke();
      for (const d of [-Math.PI / 2, 0, Math.PI / 2]) {
        ctx.beginPath(); ctx.moveTo(x1 + 6 * Math.cos(a + d + Math.PI), y1 + 6 * Math.sin(a + d + Math.PI));
        ctx.lineTo(x1 + 11 * Math.cos(a + d + Math.PI), y1 + 11 * Math.sin(a + d + Math.PI)); ctx.stroke();
      }
      ctx.strokeStyle = g.hold === 'retro' ? COL.good : COL.orbitEsc;
      const x2 = cx - R0 * Math.cos(a), y2 = cy - R0 * Math.sin(a);
      ctx.beginPath(); ctx.arc(x2, y2, 6, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2 - 4, y2 - 4); ctx.lineTo(x2 + 4, y2 + 4); ctx.moveTo(x2 + 4, y2 - 4); ctx.lineTo(x2 - 4, y2 + 4); ctx.stroke();
    }
  }

  // ---------------- rocket "Pip" (screen space, never smaller than ~26 px) ----------------

  function drawRocket(g) {
    const s = g.s, [x, y] = toScreen(s.x, s.y);
    const L = Math.max(Rk.length * cam.zoom, 26), u = L / 14;
    ctx.save(); ctx.translate(x, y); ctx.rotate(screenAngle(s.angle) + Math.PI / 2);   // rocket's nose = -y on canvas

    if (g.throttle > 0) {                                         // flame
      const f = (0.6 + 0.4 * Math.random()) * (0.4 + 0.6 * g.throttle);
      ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(-2.2 * u, 0); ctx.lineTo(0, 10 * f * u); ctx.lineTo(2.2 * u, 0); ctx.fill();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.moveTo(-1.1 * u, 0); ctx.lineTo(0, 5 * f * u); ctx.lineTo(1.1 * u, 0); ctx.fill();
    }
    ctx.fillStyle = '#e63946';                                    // fins
    ctx.beginPath(); ctx.moveTo(-2.6 * u, -0.2 * u); ctx.lineTo(-5 * u, 1 * u); ctx.lineTo(-2.6 * u, -4 * u); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2.6 * u, -0.2 * u); ctx.lineTo(5 * u, 1 * u); ctx.lineTo(2.6 * u, -4 * u); ctx.fill();
    ctx.fillStyle = '#f1faee';                                    // body
    roundRect(-2.8 * u, -10 * u, 5.6 * u, 10 * u, 1.5 * u); ctx.fill();
    ctx.fillStyle = '#e63946';                                    // nose
    ctx.beginPath(); ctx.moveTo(-2.8 * u, -9.6 * u); ctx.quadraticCurveTo(0, -16 * u, 2.8 * u, -9.6 * u); ctx.fill();
    ctx.fillStyle = '#457b9d';                                    // porthole
    ctx.beginPath(); ctx.arc(0, -6 * u, 1.9 * u, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#1d3557';                                    // eyes
    const blink = (g.t % 4) < 0.12, scared = g.alt < 25 && Physics.speed(s) > Rk.crashSpeed && g.status === 'flying' && (s.x * s.vx + s.y * s.vy) < 0;
    for (const ex of [-0.7, 0.7]) {
      if (blink) ctx.fillRect((ex - 0.4) * u, -6 * u, 0.8 * u, 0.25 * u);
      else { ctx.beginPath(); ctx.arc(ex * u, -6.1 * u, (scared ? 0.45 : 0.32) * u, 0, 2 * Math.PI); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawParticles(g) {
    for (const p of g.particles) {
      const [x, y] = toScreen(p.x, p.y), f = p.life / p.max;
      if (p.kind === 'boom') { ctx.fillStyle = `rgba(255,${Math.floor(120 + 120 * f)},60,${f})`; }
      else { ctx.fillStyle = `rgba(255,255,255,${0.35 * f})`; }
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, (p.kind === 'boom' ? 1.2 : 2.5 - 1.5 * f) * cam.zoom), 0, 2 * Math.PI); ctx.fill();
    }
  }

  // ---------------- HUD ----------------

  function drawHUD(g) {
    const s = g.s, o = Physics.orbit(s, P);
    const vr = (s.x * s.vx + s.y * s.vy) / Physics.radius(s);
    ctx.textAlign = 'left';

    // ---- flight panel ----
    panel(12, 12, 230, 178, 'FLIGHT  ·  ' + Rk.name);
    let y = 50;
    row('ALT', fmtAlt(g.alt), 22, y); y += 18;
    row('SPEED', `${Physics.speed(s).toFixed(1)} m/s`, 22, y); y += 18;
    row('V-SPEED', `${vr >= 0 ? '+' : ''}${vr.toFixed(1)} m/s`, 22, y); y += 18;
    row('TWR', Physics.twr(s, CONFIG).toFixed(2), 22, y); y += 22;
    bar('THROTTLE', g.throttle, 22, y, COL.warn); y += 26;
    bar('FUEL', s.fuel / Rk.fuel, 22, y, s.fuel / Rk.fuel < 0.2 ? COL.bad : COL.good, `Δv ${Physics.deltaV(s, Rk).toFixed(0)} m/s`);

    // ---- orbit panel ----
    panel(12, 200, 230, 130, 'ORBIT');
    y = 238;
    const esc = o.E >= 0;
    row('Ap', esc ? 'escaping!' : fmtAlt(o.ap), 22, y, esc ? COL.orbitEsc : COL.orbit); y += 18;
    row('Pe', o.pe < 0 ? 'underground' : fmtAlt(o.pe), 22, y, o.pe < P.atmoTop ? COL.bad : COL.good); y += 18;
    row('T-Ap / T-Pe', esc || !isFinite(o.tAp) ? '—' : `${fmtT(o.tAp)} / ${fmtT(o.tPe)}`, 22, y); y += 18;
    row('PERIOD', esc ? '—' : fmtT(o.T), 22, y); y += 18;
    row('ECC', o.e.toFixed(3), 22, y);

    // ---- goals ----
    const gx = W - 292;
    panel(gx, 12, 280, 34 + Game.GOALS.length * 20, 'FLIGHT SCHOOL');
    Game.GOALS.forEach((goal, i) => {
      const done = g.done[goal.id] !== undefined;
      ctx.fillStyle = done ? COL.good : COL.dim; ctx.font = '13px monospace';
      ctx.fillText(`${done ? '✔' : '○'} ${goal.text}`, gx + 10, 50 + i * 20);
    });

    // ---- top center: warp + status ----
    ctx.textAlign = 'center'; ctx.font = 'bold 14px monospace';
    const warp = CONFIG.sim.warps[g.warpIdx];
    ctx.fillStyle = warp > 1 ? COL.warn : COL.dim;
    ctx.fillText(`WARP ${warp}x   ${g.hold ? 'HOLD ' + (g.hold === 'pro' ? 'PROGRADE' : 'RETROGRADE') : ''}   ${cam.map ? '[MAP]' : ''}`, W / 2, 24);
    ctx.fillStyle = COL.hud; ctx.font = '15px monospace';
    ctx.fillText(Game.hint(g), W / 2, H - 46);
    ctx.fillStyle = COL.dim; ctx.font = '12px monospace';
    ctx.fillText('W/↑ thrust · Shift fine · A/D rotate · Q prograde · E retro · , . warp · M map · wheel zoom · R restart', W / 2, H - 20);

    // ---- toast ----
    if (g.toast) {
      const age = (performance.now() - g.toast.t0) / 1000;
      if (age < 3) {
        ctx.globalAlpha = Math.min(1, 3 - age);
        ctx.font = `bold ${36 + 6 * Math.max(0, 0.3 - age) / 0.3}px monospace`; ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 5;
        ctx.strokeText(g.toast.text, W / 2, H * 0.28); ctx.fillText(g.toast.text, W / 2, H * 0.28);
        ctx.globalAlpha = 1;
      }
    }
    if (g.status === 'crashed') {
      ctx.font = 'bold 40px monospace'; ctx.fillStyle = COL.bad; ctx.fillText('KABOOM', W / 2, H / 2 - 40);
    }
    ctx.textAlign = 'left';
  }

  function drawDebug(g) {
    const s = g.s, E = Physics.energy(s, P), o = Physics.orbit(s, P);
    const drift = g.coastE0 === null ? '(engine on / in air)' : ((E - g.coastE0) / Math.abs(g.coastE0)).toExponential(2);
    const lines = [
      `DEBUG  seed ${g.seed}  t ${g.t.toFixed(2)} s  steps/frame ${g.stepsLastFrame}  status ${g.status}`,
      `x ${s.x.toFixed(1)}  y ${s.y.toFixed(1)}  vx ${s.vx.toFixed(2)}  vy ${s.vy.toFixed(2)}  angle ${(s.angle * 180 / Math.PI % 360).toFixed(1)}°`,
      `E ${E.toFixed(3)}  h ${o.h.toFixed(1)}  coast dE/E ${drift}`,
      `a ${o.a.toFixed(1)}  e ${o.e.toFixed(4)}  rp ${o.rp.toFixed(1)}  ra ${o.ra.toFixed(1)}  ν ${(o.nu * 180 / Math.PI).toFixed(1)}°`,
      `fuel ${s.fuel.toFixed(3)} t  mass ${Physics.mass(s, Rk).toFixed(3)} t  rho ${Physics.density(g.alt, P).toFixed(3)}  particles ${g.particles.length}`,
      ...g.events.slice(-3).map((e) => `  ${e.t.toFixed(1)}s  ${e.msg}`),
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(10, H - 80 - lines.length * 15, 620, lines.length * 15 + 10);
    ctx.fillStyle = '#9effa0'; ctx.font = '12px monospace';
    lines.forEach((l, i) => ctx.fillText(l, 16, H - 72 - (lines.length - 1 - i) * 15 - 0));
  }

  // ---------------- small helpers ----------------

  function panel(x, y, w, h, title) {
    ctx.fillStyle = 'rgba(10,14,40,0.72)'; roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(142,160,200,0.5)'; ctx.lineWidth = 1; roundRect(x, y, w, h, 8); ctx.stroke();
    ctx.fillStyle = COL.dim; ctx.font = 'bold 12px monospace'; ctx.fillText(title, x + 10, y + 20);
  }
  function row(label, val, x, y, col = COL.hud) {
    ctx.font = '13px monospace'; ctx.fillStyle = COL.dim; ctx.fillText(label, x, y);
    ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(val, x + 208, y); ctx.textAlign = 'left';
  }
  function bar(label, f, x, y, col, extra = '') {
    ctx.font = '11px monospace'; ctx.fillStyle = COL.dim; ctx.fillText(label, x, y - 4);
    if (extra) { ctx.textAlign = 'right'; ctx.fillText(extra, x + 208, y - 4); ctx.textAlign = 'left'; }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, 208, 8);
    ctx.fillStyle = col; ctx.fillRect(x, y, 208 * Math.max(0, Math.min(1, f)), 8);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function mix(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
  }
  const fmtAlt = (m) => !isFinite(m) ? '∞' : Math.abs(m) >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(0)} m`;
  const fmtT = (t) => !isFinite(t) ? '—' : t >= 60 ? `${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s` : `${t.toFixed(1)}s`;

  return { init, resize, draw, cam };
})();
