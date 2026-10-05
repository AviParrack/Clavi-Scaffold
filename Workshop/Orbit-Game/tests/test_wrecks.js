// ======================================================================
//  WRECKS TESTS  —  exact Kepler rails, crash sites riding their rocks,
//  ship salvage (range, slow, 4 s, cancels), rummage on foot (fake
//  astronaut), drilling without EVA, loot into the hold / pickups, no
//  double dipping, blueprints through Econ (and the cash fallback without
//  it), save/load, warp caps, death and tow, bumps, art without NaN.
//  run:  node tests/test_wrecks.js   (re-runs itself with --solo: wrecks alone, --eva: the real astronaut,
//        --all: every module at once)
// ======================================================================

const H = require('./harness');
const MODE = process.argv[2] || '';                    // '' | --solo | --eva | --all  (the main run spawns the others)
const ONLY = { '--solo': 'wrecks', '--eva': 'economy,shop,stations,eva,wrecks', '--all': 'economy,shop,stations,eva,mobs,wrecks,combat' };
H.load({ only: ONLY[MODE] || 'economy,shop,wrecks' });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(60)} ${info}`);
  ok ? nPass++ : nFail++;
}
function safely(name, fn) {
  try { fn(); } catch (e) { check(`${name} (threw)`, false, e.stack.split('\n').slice(0, 3).join(' | ')); }
}
const fresh = (spawn = 'pad') => Game.create(7, spawn, { fresh: true });
const mod = Game.mods.find((m) => m.id === 'wrecks');
const st = (g) => g.mod.wrecks;
const toasted = (g, re) => g.toasts.some((t) => re.test(t.text));
const prompt = (g, re) => g.prompts.find((p) => re.test(p.text));
const fin = (...a) => a.flat(3).every((v) => typeof v !== 'number' || Number.isFinite(v));
const units = (o) => Object.values(o || {}).reduce((s, q) => s + q, 0);
const loot = (g, id) => g.pickups.filter((p) => p.wreck === id);
const lootCount = (g, id) => { const o = {}; for (const p of loot(g, id)) o[p.item] = (o[p.item] || 0) + p.qty; return o; };
const sameBag = (a, b) => { const k = new Set([...Object.keys(a), ...Object.keys(b)]); return [...k].every((i) => (a[i] || 0) === (b[i] || 0)); };
const minus = (a, b) => { const o = {}; for (const k in a) if (a[k] - (b[k] || 0)) o[k] = a[k] - (b[k] || 0); return o; };

// put the ship d metres outside a wreck's bounding circle, radially out from its host, co-moving (+ dvr out, dvt along)
function park(g, id, d, dvr = 0, dvt = 0) {
  const wr = Wrecks.byId(g, id), [x, y, vx, vy] = wr.state(g.t), [hx, hy] = World.bodyState(g.w, wr.hostBody, g.t);
  const rl = Math.hypot(x - hx, y - hy), ux = (x - hx) / rl, uy = (y - hy) / rl, D = wr.r + d;
  Object.assign(g.sh, { x: x + ux * D, y: y + uy * D, vx: vx + ux * dvr - uy * dvt, vy: vy + uy * dvr + ux * dvt, omega: 0, ang: Math.atan2(uy, ux) });
  Object.assign(g, { status: 'flying', landedOn: null, land: null, attach: null, everFlew: true, mode: 'ship', warpIdx: 0 });
  g.astro.on = false;
  return wr;
}

// the stand-in astronaut (no EVA module here): d metres off the hull, on the "up" side, riding the host rock
function stand(g, wr, d) {
  const [x, y] = Wrecks.toWorld(wr, g.t, 0, wr.hy + d), [, , bvx, bvy] = World.bodyState(g.w, wr.hostBody, g.t);
  Object.assign(g.astro, { on: true, x, y, vx: bvx, vy: bvy, hp: 100, ang: Math.atan2(wr.ny, wr.nx) });
  g.mode = 'eva';
}
function runStanding(g, wr, d, n, pressed = []) {
  for (let i = 0; i < n; i++) { stand(g, wr, d); Game.update(g, H.input({ pressed: i ? [] : pressed }), 1 / 60); }
}

// frame by frame until the wreck is salvaged; returns sim seconds from the start of the first frame
function runUntilSalvaged(g, id, maxFrames, each) {
  const t0 = g.t;
  for (let i = 0; i < maxFrames; i++) {
    if (each) each(i); else H.run(g, 1, {});
    if (Wrecks.isSalvaged(g, id)) return g.t - t0;
  }
  return Infinity;
}

// a canvas that records every non-finite number it is handed
function fakeKit(zoom, cx, cy, W = 1280, Hh = 800) {
  const bad = [];
  const num = (k, a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) { bad.push(k); return; } };
  const state = { globalAlpha: 1, lineWidth: 1, font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', textAlign: 'left',
                  textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', lineDashOffset: 0 };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: 7 * String(s).length });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { num(k, a); return { addColorStop: (o) => num('addColorStop', [o]) }; };
      return (...a) => num(String(k), a);
    },
    set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`set ${String(k)}`); t[k] = v; return true; },
  });
  const L = Math.hypot(0.55, 0.83);
  let right = 80;
  const kit = {
    ctx, W, H: Hh, cam: { x: cx, y: cy, zoom, rot: 0 }, LIGHT: [-0.55 / L, 0.83 / L], INK: '#1b1433',
    px: () => 1 / zoom, screenAng: (a) => -a,
    toScreen: (x, y) => [W / 2 + (x - cx) * zoom, Hh / 2 - (y - cy) * zoom],
    viewRect: (p = 0) => [cx - W / 2 / zoom - p, cy - Hh / 2 / zoom - p, cx + W / 2 / zoom + p, cy + Hh / 2 / zoom + p],
    onScreen: (sx, sy, m = 30) => sx > -m && sx < W + m && sy > -m && sy < Hh + m,
    toonBlob: (...a) => num('toonBlob', a), tag: (x, y) => num('tag', [x, y]), outlinedText: (s, x, y) => num('outlinedText', [x, y]),
    roundRect: (...a) => num('roundRect', a), stackRight: (w, h) => { num('stackRight', [w, h]); const y = right; right += h + 22; return y + 32; },
  };
  return { kit, bad };
}


function main() {

// ---------------- 0. catalogue ----------------
safely('catalogue', () => {
  const g = fresh('orbit'), L = Wrecks.list(g), orb = L.filter((w) => w.orbital), crashed = L.filter((w) => !w.orbital);
  check('wrecks registered, 11 of them: 5 on rails, 6 crashed', mod && L.length === 11 && orb.length === 5 && crashed.length === 6,
        `${orb.map((w) => w.id).join(' ')} | ${crashed.map((w) => w.id).join(' ')}`);
  check('unique ids and names; every wreck has a crew log and a fact', new Set(L.map((w) => w.id)).size === L.length &&
        new Set(L.map((w) => w.name)).size === L.length && L.every((w) => w.who && w.log && typeof w.fact === 'function'));
  check('crashed on Ceres, Dorito, Kiwi, Big Potato, Glimmer (+ Seed)', ['ceres', 'dorito', 'kiwi', 'potato', 'glimmer', 'seed'].every((b) => crashed.some((w) => w.host === b)));
  check('3 wrecks guarantee a blueprint', L.filter((w) => w.loot && w.loot.bp === 1).length === 3, L.filter((w) => w.loot && w.loot.bp === 1).map((w) => w.id).join(' '));
  check('job "wreck": order 75, pays $150', Game.GOALS.some((x) => x.id === 'wreck' && x.order === 75 && x.reward === 150));
  check('every fact text renders (no undefined / NaN)', L.every((w) => { const s = w.fact(w, g.w); return s && !/undefined|NaN/.test(s); }));
});


// ---------------- 1. rails are exact circular Kepler orbits ----------------
safely('rails', () => {
  const g = fresh('orbit');
  let eR = 0, eV = 0, eRad = 0, eDer = 0, eAcc = 0, dirOk = true;
  for (const wr of Wrecks.list(g).filter((w) => w.orbital)) {
    const mu = wr.hostBody.mu, vc = Math.sqrt(mu / wr.a);
    for (const t of [0, 123.4, 9876.5, 4.2e6]) {
      const s = wr.state(t), h = World.bodyState(g.w, wr.hostBody, t), rx = s[0] - h[0], ry = s[1] - h[1], vx = s[2] - h[2], vy = s[3] - h[3];
      eR = Math.max(eR, Math.abs(Math.hypot(rx, ry) - wr.a) / wr.a);
      eV = Math.max(eV, Math.abs(Math.hypot(vx, vy) - vc) / vc);
      eRad = Math.max(eRad, Math.abs(rx * vx + ry * vy) / (wr.a * vc));
      if (Math.sign(rx * vy - ry * vx) !== (wr.dir || 1)) dirOk = false;
      const hd = 1e-3, sp = wr.state(t + hd), sm = wr.state(t - hd);
      eDer = Math.max(eDer, Math.hypot((sp[0] - sm[0]) / (2 * hd) - s[2], (sp[1] - sm[1]) / (2 * hd) - s[3]) / vc);
      const ha = 0.05, rel = (tt) => { const a = wr.state(tt), b = World.bodyState(g.w, wr.hostBody, tt); return [a[0] - b[0], a[1] - b[1]]; };
      const p = rel(t + ha), q = rel(t), m = rel(t - ha), k = mu / wr.a ** 3;
      eAcc = Math.max(eAcc, Math.hypot((p[0] - 2 * q[0] + m[0]) / ha ** 2 + k * q[0], (p[1] - 2 * q[1] + m[1]) / ha ** 2 + k * q[1]) / (mu / wr.a ** 2));
    }
  }
  check('radius = a exactly, speed = sqrt(mu/a), velocity is tangent', eR < 1e-12 && eV < 1e-12 && eRad < 1e-12, `max rel err r ${eR.toExponential(1)}, v ${eV.toExponential(1)}, r·v ${eRad.toExponential(1)}`);
  check('state velocity = d(position)/dt (central difference)', eDer < 1e-6, `rel err ${eDer.toExponential(1)}`);
  check('relative acceleration = -mu r / a^3 (inverse square)', eAcc < 1e-4, `rel err ${eAcc.toExponential(1)}`);
  check('Definitely Not Pirates orbits backwards, the rest prograde', dirOk && Wrecks.byId(g, 'notpirates').dir === -1);

  const tu = Wrecks.byId(g, 'tuesday'), dor = g.w.byId.dorito;
  let eL4 = 0;
  for (const t of [0, 777, 5e4, 3e6]) {
    const a = tu.state(t), b = World.bodyState(g.w, dor, t), ang = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
    eL4 = Math.max(eL4, Math.abs(-ang - Math.PI / 3), Math.abs(Math.hypot(a[0], a[1]) - dor.a));
  }
  check("The Plucky Tuesday sits 60° ahead of Dorito, on Dorito's orbit", eL4 < 1e-9, `max err ${eL4.toExponential(1)}`);
});


// ---------------- 2. honest rails: what a free pebble really does on them (World gravity, tides and all) ----------------
//  Rails are exact Kepler circles that ignore tides, like the moons' own rails.  So: (a) over a salvage a co-moving
//  pebble stays put; (b) in the quiet spots a pebble stays near the rail for many laps; (c) the facts we tell
//  the player about the two special spots (retrograde at Big Potato, Dorito's L4) are true in this world.

// leapfrog a pebble in World gravity; returns [x, y, vx, vy, t] or null if it hit the host / flew off; onStep(x, y, t)
function pebble(w, host, s, t0, T, onStep, dt = 1 / 20) {
  let [x, y, vx, vy] = s, t = t0, [ax, ay] = World.gravity(w, x, y, t);
  while (t - t0 < T) {
    vx += ax * dt / 2; vy += ay * dt / 2; x += vx * dt; y += vy * dt; t += dt;
    [ax, ay] = World.gravity(w, x, y, t); vx += ax * dt / 2; vy += ay * dt / 2;
    const h = World.bodyState(w, host, t), r = Math.hypot(x - h[0], y - h[1]);
    if (r < host.R || r > 2500) return null;
    if (onStep && onStep(x, y, t, r) === false) return null;
  }
  return [x, y, vx, vy, t];
}
safely('honest rails', () => {
  const g = fresh('orbit'), orb = Wrecks.list(g).filter((w) => w.orbital), T0 = [0, 450, 1700, 3900];
  let dMax = 0, vMax = 0;
  for (const wr of orb) for (const t0 of T0) {
    const e = pebble(g.w, wr.hostBody, wr.state(t0), t0, 10, null, 1 / 120), s = wr.state(e[4]);
    dMax = Math.max(dMax, Math.hypot(e[0] - s[0], e[1] - s[1])); vMax = Math.max(vMax, Math.hypot(e[2] - s[2], e[3] - s[3]));
  }
  check('co-moving pebble stays with every wreck for 10 s (salvage takes 4)', dMax < 2 && vMax < 0.5, `max drift ${dMax.toFixed(2)} m, ${vMax.toFixed(2)} m/s`);

  const notes = [];
  let ok = true;
  for (const wr of orb.filter((w) => !w.keeper)) {
    let lo = Infinity, hi = 0;
    for (const t0 of T0) {
      const e = pebble(g.w, wr.hostBody, wr.state(t0), t0, 12 * wr.period, (x, y, t, r) => { lo = Math.min(lo, r); hi = Math.max(hi, r); });
      if (!e) ok = false;
    }
    if (!(lo > 0.6 * wr.a && hi < 1.5 * wr.a)) ok = false;
    notes.push(`${wr.id} ${lo.toFixed(0)}-${hi.toFixed(0)}`);
  }
  check('quiet rails: a free pebble stays near the rail for 12 laps', ok, `r range (m): ${notes.join(', ')}`);

  const np = Wrecks.byId(g, 'notpirates'), P = np.hostBody, broke = [];
  for (const t0 of T0) {
    const s = np.state(t0), h = World.bodyState(g.w, P, t0), pro = [s[0], s[1], 2 * h[2] - s[2], 2 * h[3] - s[3]];
    const e = pebble(g.w, P, pro, t0, 12 * np.period, (x, y, t, r) => r > 0.5 * np.a && r < 2 * np.a);
    broke.push(!e);
  }
  check(`Big Potato at ${np.a} m: forward orbits break up (backward ones above survive)`, broke.every(Boolean), `prograde broken: ${broke.filter(Boolean).length}/${broke.length}`);

  const tu = Wrecks.byId(g, 'tuesday'), lead = (w, x, y, t) => {               // degrees ahead of Dorito
    const d = World.bodyState(w, w.byId.dorito, t); return Math.atan2(d[0] * y - d[1] * x, d[0] * x + d[1] * y) * 180 / Math.PI;
  };
  const w2 = World.create({ ...CONFIG, bodies: CONFIG.bodies.filter((b) => b.id === 'ceres' || b.id === 'dorito'), rubble: [] }, 7);
  let lib = [99, -99];
  pebble(w2, w2.byId.ceres, tu.state(0), 0, 20 * tu.period, (x, y, t) => { const a = lead(w2, x, y, t); lib = [Math.min(lib[0], a), Math.max(lib[1], a)]; });
  check("Tuesday: without Kiwi, Dorito's L4 holds a pebble for 20 laps", lib[0] > 35 && lib[1] < 85, `librates ${lib[0].toFixed(0)}°..${lib[1].toFixed(0)}° ahead of Dorito`);
  let lostAt = null;
  pebble(g.w, g.w.byId.ceres, tu.state(0), 0, 3 * tu.period, (x, y, t) => { if (lostAt == null && Math.abs(lead(g.w, x, y, t) - 60) > 25) lostAt = t; });
  check('...with Kiwi it is kicked loose within 3 laps (so the autopilot puffs it back)', lostAt != null && tu.keeper,
        lostAt != null ? `left L4 after ${lostAt.toFixed(0)} s` : 'stayed');
});


// ---------------- 3. crash sites ride their rocks, half-buried ----------------
safely('crash sites', () => {
  const g = fresh('orbit');
  let ride = 0, buriedOk = true;
  const notes = [];
  for (const wr of Wrecks.list(g).filter((w) => !w.orbital)) {
    const b = wr.hostBody;
    for (const t of [0, 321, 7e5]) {
      const s = wr.state(t), h = World.bodyState(g.w, b, t);
      ride = Math.max(ride, Math.abs(s[0] - h[0] - wr.lx), Math.abs(s[1] - h[1] - wr.ly), Math.abs(s[2] - h[2]), Math.abs(s[3] - h[3]));
    }
    const alt = (lx, ly) => { const [x, y] = Wrecks.toWorld(wr, 0, lx, ly), h = World.bodyState(g.w, b, 0), dx = x - h[0], dy = y - h[1]; return Math.hypot(dx, dy) - World.surfaceR(b, Math.atan2(dy, dx)); };
    const top = alt(0, wr.hy), bot = alt(0, -wr.hy);
    if (!(top > 0 && bot < 0)) buriedOk = false;
    notes.push(`${wr.id} ${top.toFixed(1)}/${bot.toFixed(1)}`);
  }
  check('crashed wrecks ride along with their rock (pos + vel)', ride < 1e-9, `max err ${ride.toExponential(1)}`);
  check('each hull pokes out of the ground and is buried below it', buriedOk, `top/bottom alt m: ${notes.join(', ')}`);
});


// ---------------- 4. names: unknown signal until seen within 400 m ----------------
safely('nav names', () => {
  const g = fresh('pad');
  const nav = () => Game.navTargets(g).filter((n) => n.kind === 'wreck');
  const tu = () => nav().find((n) => n.id === 'wreck:tuesday');
  check('all 11 wrecks are nav targets', nav().length === 11 && nav().every((n) => fin(n.state(g.t)) && n.r > 0));
  check('far wreck shows as "Unknown signal (Ceres orbit)"', tu().name === 'Unknown signal (Ceres orbit)' && !Wrecks.isSeen(g, 'tuesday'), tu().name);
  check('crashed unknown says where: "Unknown signal (on Glimmer)"', nav().find((n) => n.id === 'wreck:finders').name === 'Unknown signal (on Glimmer)');
  park(g, 'tuesday', Wrecks.SEE_R - 30); H.run(g, 1, {});
  check('flying within 400 m reveals its name', Wrecks.isSeen(g, 'tuesday') && tu().name === 'The Plucky Tuesday' &&
        g.events.some((e) => /wreck spotted: The Plucky Tuesday/.test(e.msg)), tu().name);
  g.navId = 'wreck:tuesday'; H.run(g, 1, {}); park(g, 'tuesday', 200); H.run(g, 1, {});
  const h = mod.hint(g);
  check('targeted wreck 200 m off, speed matched: close-in coaching', h && /Speed matched\. Close in: 200 m/.test(h.text), h && h.text);
  park(g, 'tuesday', 600); g.navId = null; H.run(g, 1, {}); g.navId = 'wreck:tuesday'; H.run(g, 1, {});
  const h2 = mod.hint(g);
  check('...far away, the fact explains L4 honestly (Routh, Kiwi)', h2 && /L4/.test(h2.text) && /Routh/.test(h2.text) && /Kiwi/.test(h2.text), h2 && h2.text.slice(0, 90));
  const gs = fresh('pad'); gs.navId = 'wreck:longexp'; H.run(gs, 2, {});
  const h3 = mod.hint(gs);
  check('targeting an unseen one: "fly within 400 m to identify it"', h3 && /Unknown signal on|Unknown signal Glimmer|identify/.test(h3.text), h3 && h3.text);
});


// ---------------- 5. ship salvage: range + slow + 4 s ----------------
safely('ship salvage', () => {
  const g = fresh('orbit'), m = st(g);
  park(g, 'esa4', 20); H.run(g, 1, {});
  check('20 m out: no salvage prompt', !prompt(g, /Salvage/));
  check('...and start() refuses (drifted away)', !Wrecks.start(g, 'esa4', 'ship') && !m.job && toasted(g, /DRIFTED AWAY/));
  check('parked 20 m off a derelict, nothing closing: warp is not capped by it', !/ESA/.test(g.warpWhy), `${g.warpMax}x ${g.warpWhy}`);
  park(g, 'esa4', 30, -2); H.run(g, 1, {});
  check('closing on a derelict at 2 m/s: warp caps at 4x ("ahead")', g.warpMax <= 4 && /ESA.*ahead/.test(g.warpWhy), `${g.warpMax}x ${g.warpWhy}`);
  park(g, 'esa4', 10, -2); g.navId = null; H.run(g, 1, {});
  const hz = Game.hint(g);
  check('...and an untargeted wreck a few seconds out gets a dodge hint', /dead ahead/.test(hz), hz);
  park(g, 'esa4', 20, 0);

  park(g, 'esa4', 8, 3); H.run(g, 1, {});
  const slow = prompt(g, /Slow under 2 m\/s/);
  check('8 m out at 3 m/s: "Slow under 2 m/s" prompt instead', !!slow && !prompt(g, /^Salvage/), slow && slow.text);
  H.run(g, 1, { pressed: ['KeyF'] });
  check('...F there does not start (TOO FAST toast)', !m.job && toasted(g, /TOO FAST/));

  park(g, 'esa4', 8); H.run(g, 1, {});
  check('8 m out, speed matched: [F] Salvage ESA Intern Project #4', !!prompt(g, /^Salvage ESA Intern Project #4$/), g.prompts.map((p) => p.text).join(' | '));
  const money0 = g.money, cargo0 = { ...g.cargo }, expect = Wrecks.roll(g, Wrecks.byId(g, 'esa4'));
  let frames = 0, at2 = null;
  const T = runUntilSalvaged(g, 'esa4', 600, (i) => {
    H.run(g, 1, i === 0 ? { pressed: ['KeyF'] } : {});
    frames++;
    if (i === 0) check('F starts a ship job', m.job && m.job.how === 'ship' && m.job.need === 4);
    if (i === 120) at2 = { job: !!m.job, pct: mod.hudRows(g), hint: mod.hint(g), warp: (g.warpIdx = 6, 0) };
    if (i === 121) at2.warp = g.warp;
  });
  check('takes 4 s of sim time (±1 frame)', T >= 4 && T <= 4 + 4 / 60 + 1e-9, `${T.toFixed(3)} s over ${frames} frames`);
  check('mid-job: HUD row, "Cutting ... open" hint, no prompts', at2 && at2.job && /SALVAGING/.test(at2.pct[0].label) && /Cutting ESA Intern Project #4 open/.test(at2.hint.text),
        at2 && `${at2.pct[0].val} · ${at2.hint.text.slice(0, 40)}`);
  check('mid-job: warp picked at 64x runs at 4x', at2 && at2.warp === 4, `${at2 && at2.warp}x`);
  const got = minus(g.cargo, cargo0);
  check('loot lands in the hold (exactly the deterministic roll)', sameBag(got, expect.items), `${JSON.stringify(got)} vs ${JSON.stringify(expect.items)}`);
  H.run(g, 2, {});
  check('job "wreck" done: +$150 (+ any found cash)', g.done.wreck !== undefined && g.money - money0 === 150 + m.stats.cash, `+$${g.money - money0}, found $${m.stats.cash}`);
  check('crew log codec opens with a loot line', m.codec && m.codec.id === 'esa4' && /^LOOT: /.test(m.codec.loot) && g.events.some((e) => /crew log, INTERN/.test(e.msg)), m.codec && m.codec.loot);
  check('job cleared, cap lifted for a salvaged derelict', !m.job && mod.warpLimit(g) === null);

  // no double salvage
  const c1 = { ...g.cargo }, mny = g.money;
  park(g, 'esa4', 6); H.run(g, 1, {});
  check('salvaged: no prompt, start() and complete() refuse', !prompt(g, /Salvage ESA/) && !Wrecks.start(g, 'esa4', 'ship') && Wrecks.complete(g, 'esa4', 'ship') === null &&
        sameBag(c1, g.cargo) && g.money === mny);
  const nt = Game.navTargets(g).find((n) => n.id === 'wreck:esa4');
  check('nav shows it as "(salvaged)"', /\(salvaged\)$/.test(nt.name), nt.name);
});


// ---------------- 6. salvage cancels when you drift or speed up ----------------
safely('cancel', () => {
  const g = fresh('orbit'), m = st(g);
  const begin = () => { park(g, 'esa4', 8); H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyF'] }); H.run(g, 30, {}); return !!m.job; };
  check('job running after 0.5 s', begin() && m.job.t > 0.4);
  park(g, 'esa4', 30); H.run(g, 1, {});
  check('drifting past 25 m stops it (SALVAGE STOPPED: DRIFTED AWAY)', !m.job && toasted(g, /SALVAGE STOPPED: DRIFTED AWAY/) && !Wrecks.isSalvaged(g, 'esa4'));
  begin(); const wr = Wrecks.byId(g, 'esa4'), s = wr.state(g.t); g.sh.vx = s[2] + 3.5; g.sh.vy = s[3]; H.run(g, 1, {});
  check('speeding past 3 m/s stops it (TOO FAST)', !m.job && toasted(g, /SALVAGE STOPPED: TOO FAST/));
  begin(); const s2 = wr.state(g.t), [hx, hy] = World.bodyState(g.w, wr.hostBody, g.t), rl = Math.hypot(s2[0] - hx, s2[1] - hy);
  g.sh.vx = s2[2] + 2.5 * (s2[0] - hx) / rl; g.sh.vy = s2[3] + 2.5 * (s2[1] - hy) / rl;
  const T = runUntilSalvaged(g, 'esa4', 400);
  check('drifting off at 2.5 m/s mid-job is tolerated (keep: 25 m, 3 m/s)', Number.isFinite(T) && Wrecks.isSalvaged(g, 'esa4'), `done ${T.toFixed(2)} s later`);

  const g2 = fresh('orbit'), m2 = st(g2);
  park(g2, 'longexp', 8); H.run(g2, 1, {}); H.run(g2, 1, { pressed: ['KeyF'] });
  Game.die(g2, 'test'); H.run(g2, 1, {});
  check('ship destroyed mid-job: job cleared, wreck untouched', !m2.job && !Wrecks.isSalvaged(g2, 'longexp'));
  Game.respawn(g2, 'crash');
  park(g2, 'longexp', 8); H.run(g2, 1, {}); H.run(g2, 1, { pressed: ['KeyF'] });
  check('...can start again after respawn', !!m2.job);
  Game.respawn(g2, 'tow'); H.run(g2, 1, {});
  check('tow mid-job: job cleared, no warp cap left behind', !m2.job && mod.warpLimit(g2) === null && g2.warpWhy !== 'salvaging');
  park(g2, 'longexp', 8); H.run(g2, 1, {}); H.run(g2, 1, { pressed: ['KeyF'] });
  const lw = Wrecks.byId(g2, 'longexp');
  Game.dock(g2, { name: 'Test', state: lw.state, ang: 0 }); H.run(g2, 1, {});
  check('docking (to anything) mid-job cancels it', !m2.job && toasted(g2, /SALVAGE STOPPED/));
});


// ---------------- 7. a full hold: what does not fit floats beside the wreck ----------------
safely('overflow', () => {
  const g = fresh('glimmer'), wr = park(g, 'longexp', 8);
  Game.addCargo(g, 'ice', g.S.cargoCap - 7);
  const c0 = { ...g.cargo }, n0 = g.pickups.length, res = Wrecks.complete(g, 'longexp', 'ship');
  const inHold = minus(g.cargo, c0), floating = lootCount(g, 'longexp');
  const all = { ...inHold }; for (const k in floating) all[k] = (all[k] || 0) + floating[k];
  check('hold + floating = the whole roll', sameBag(all, res.items) && sameBag(floating, res.spilled) && units(res.spilled) > 0,
        `hold ${JSON.stringify(inHold)}, floating ${JSON.stringify(floating)}`);
  const s = wr.state(g.t), ps = loot(g, 'longexp');
  check('spilled loot floats beside the wreck, co-moving', g.pickups.length - n0 === units(res.spilled) &&
        ps.every((p) => Math.hypot(p.x - s[0], p.y - s[1]) < wr.r + 4 && Math.hypot(p.vx - s[2], p.vy - s[3]) < 0.4));
  check('"hold full" in the loot line', /hold full/.test(st(g).codec.loot), st(g).codec.loot);
  ps[0].age = 899; H.run(g, 1, {});
  check('wreck loot never ages out (clamped below 900 s)', loot(g, 'longexp').length === ps.length && ps[0].age <= 600 + 1e-9, `age ${ps[0].age.toFixed(1)}`);
  H.run(g, 600, {});
  const far = loot(g, 'longexp').map((p) => Math.hypot(p.x - wr.state(g.t)[0], p.y - wr.state(g.t)[1]));
  check('...and 10 s later it is still loitering by the wreck', far.length && Math.max(...far) < 30 && fin(far), `max ${Math.max(...far).toFixed(1)} m`);
  check('overflow hangs on tethers (kinematic: rides the rail, not the tides)', ps.every((p) => p.kinematic && p.tether));

  Game.circularAround(g, g.w.byId.ceres, 5200, 1.0); Game.setWarp(g, 64);
  H.run(g, 600, {});
  const s2 = wr.state(g.t), off = loot(g, 'longexp').map((p) => Math.hypot(p.x - s2[0], p.y - s2[1]) - wr.r);
  check('10 min at 64x, ship far away: every crate still hangs by the wreck', g.warp === 64 && off.length === ps.length && off.every((d) => d > 0.5 && d < 3) && fin(off),
        `${g.warp}x, ${off.length} crates ${Math.min(...off).toFixed(1)}-${Math.max(...off).toFixed(1)} m off the hull circle`);
  g.cargo = {}; g.sh.cargoKg = 0;
  const p0 = loot(g, 'longexp')[0], it = p0.item, have = g.cargo[it] || 0, nL = loot(g, 'longexp').length, [px, py, pvx, pvy] = [p0.x, p0.y, ...s2.slice(2)];
  const ux = (px - s2[0]) / Math.hypot(px - s2[0], py - s2[1]), uy = (py - s2[1]) / Math.hypot(px - s2[0], py - s2[1]);
  Object.assign(g.sh, { x: px + ux * 3, y: py + uy * 3, vx: pvx, vy: pvy, omega: 0 }); Game.setWarp(g, 1);
  H.run(g, 2, {});
  check('fly up to a hanging crate and the ship scoops it', (g.cargo[it] || 0) > have && loot(g, 'longexp').length < nL, `${it}: ${have} -> ${g.cargo[it] || 0}`);
});


// ---------------- 7b. comic words stick to a moving wreck; the Tuesday's autopilot puffs ----------------
safely('popups and puffs', () => {
  const g = fresh('orbit'), wr = park(g, 'esa4', 6);
  Wrecks.complete(g, 'esa4', 'ship');
  const pop = g.popups.find((p) => /^\+/.test(p.text));
  const rel = () => { const s = wr.state(g.t); return [pop.x - s[0], pop.y - s[1]]; }, r0 = rel(), x0 = pop.x, y0 = pop.y;
  H.run(g, 40, {});
  const r1 = rel();
  check('the "+loot" line rides along with the wreck (not left behind in space)', Math.hypot(r1[0] - r0[0], r1[1] - r0[1]) < 1e-6 && Math.hypot(pop.x - x0, pop.y - y0) > 5,
        `wreck moved ${Math.hypot(pop.x - x0, pop.y - y0).toFixed(1)} m, popup offset err ${Math.hypot(r1[0] - r0[0], r1[1] - r0[1]).toExponential(1)}`);

  const g2 = fresh('orbit'), puffs = [], burst0 = Game.burst;
  park(g2, 'tuesday', 30);
  Game.burst = (gg, kind, x, y, n, o) => { if (kind === 'puff') { const w = Wrecks.byId(gg, 'tuesday').state(gg.t); puffs.push(Math.hypot(x - w[0], y - w[1])); } return burst0(gg, kind, x, y, n, o); };
  try { H.run(g2, 900, {}); } finally { Game.burst = burst0; }
  check("the Tuesday's autopilot puffs its thrusters now and then, from its own hull", puffs.length >= 3 && puffs.every((d) => d < 30),
        `${puffs.length} puffs in 15 s, ${Math.max(...puffs).toFixed(1)} m from the centre at most`);
});


// ---------------- 7c. coaching: how to reach a targeted wreck, in plain words, short enough for the hint line ----------------
safely('coaching', () => {
  const later = (g, id) => { g.navId = 'wreck:' + id; H.run(g, 1, {}); st(g).tgt.t0 -= 60; H.run(g, 1, {}); return mod.hint(g); };
  const g1 = fresh('orbit'), h1 = later(g1, 'tuesday');
  check('low Ceres orbit -> Tuesday: "burn prograde to raise your orbit"', h1 && /Burn prograde/.test(h1.text) && h1.pri === 39, h1 && h1.text);
  const g2 = fresh('potato'), h2 = later(g2, 'notpirates');
  check('prograde round Big Potato -> backwards wreck: "the other way"', h2 && /other way/.test(h2.text), h2 && h2.text);
  const g3 = fresh('orbit'), h3 = later(g3, 'lettuce');
  check('Ceres orbit -> wreck round Kiwi: "get to Kiwi first"', h3 && /Get to Kiwi first/.test(h3.text), h3 && h3.text);
  const g4 = fresh('orbit'), h4 = later(g4, 'couch');
  check('crashed target: land near it', h4 && /lies on Big Potato/.test(h4.text), h4 && h4.text);
  const g5 = fresh('orbit'); Game.circularAround(g5, g5.w.byId.ceres, 380, Wrecks.byId(g5, 'esa4').ph + 1.4); H.run(g5, 1, {});
  const h5 = later(g5, 'esa4');
  check('same orbit as ESA #4, ahead of it: "higher orbits are slower"', h5 && /behind\. Higher orbits are slower/.test(h5.text), h5 && h5.text);
  const texts = [];
  for (const id of Wrecks.list(g1).map((w) => w.id)) {
    const w = Wrecks.byId(g1, id);
    texts.push(w.fact(w, g1.w), `Unknown signal (on Big Potato). Fly within ${Wrecks.SEE_R} m to identify it.`);
  }
  for (const h of [h1, h2, h3, h4, h5]) if (h) texts.push(h.text);
  const long = texts.filter((t) => t.length > 170);
  check('every fact / coaching line fits the two-line hint (<= 170 chars)', !long.length, long.length ? long[0] : `longest ${Math.max(...texts.map((t) => t.length))}`);
});



// ---------------- 8. rummage on foot needs the astronaut ----------------
safely('rummage', () => {
  const g = fresh('pad'), m = st(g), wr = Wrecks.byId(g, 'lithobraker');
  check('no astronaut out: start() refuses (back aboard)', !Wrecks.start(g, 'lithobraker', 'foot') && toasted(g, /BACK ABOARD/));
  check('the ship cannot "salvage" a crashed wreck from orbit', !Wrecks.start(g, 'lithobraker', 'ship'));
  runStanding(g, wr, 6, 2);
  check('astronaut 6 m from the hull: no prompt, refuses', !prompt(g, /Rummage/) && !Wrecks.start(g, wr, 'foot'));
  check('...walking-up hint', /Walk up to it/.test((mod.hint(g) || {}).text || ''), (mod.hint(g) || {}).text);
  check('...and the wreck counts as seen', Wrecks.isSeen(g, 'lithobraker'));
  runStanding(g, wr, 1.5, 2);
  check('within 3 m: [F] Rummage through The Lithobraker', !!prompt(g, /^Rummage through The Lithobraker$/), g.prompts.map((p) => p.text).join(' | '));
  runStanding(g, wr, 1.5, 1, ['KeyF']);
  check('F starts a 3 s foot job', m.job && m.job.how === 'foot' && m.job.need === 3);
  runStanding(g, wr, 7, 1);
  check('walking off (> 5 m) stops it', !m.job && toasted(g, /WALKED AWAY/) && !Wrecks.isSalvaged(g, 'lithobraker'));
  runStanding(g, wr, 1.5, 1); runStanding(g, wr, 1.5, 1, ['KeyF']);
  const was = !!m.job; g.astro.on = false; g.mode = 'ship'; H.run(g, 1, {});
  check('climbing back aboard stops it', was && !m.job && toasted(g, /BACK ABOARD/));

  const expect = Wrecks.roll(g, wr), cargo0 = { ...g.cargo };
  runStanding(g, wr, 1.5, 2); runStanding(g, wr, 1.5, 1, ['KeyF']);
  const T = runUntilSalvaged(g, 'lithobraker', 400, () => runStanding(g, wr, 1.5, 1)) + 1 / 60;
  check('rummage takes 3 s (±1 frame)', T >= 3 && T <= 3 + 2 / 60 + 1e-9, `${T.toFixed(3)} s`);
  const popped = lootCount(g, 'lithobraker');
  check('loot pops out as pickups (not into the ship)', sameBag(popped, expect.items) || units(g.pack) > 0, JSON.stringify(popped));
  check('...the hold is untouched', sameBag(cargo0, g.cargo));
  runStanding(g, wr, 1.5, 300);
  const both = { ...g.pack }; for (const [k, q] of Object.entries(lootCount(g, 'lithobraker'))) both[k] = (both[k] || 0) + q;
  check('5 s later: backpack + what is left on the ground = the roll', sameBag(both, expect.items), `pack ${JSON.stringify(g.pack)} (${Game.kgOf(g.pack)} kg)`);
  g.astro.on = false; g.mode = 'ship'; H.run(g, 240, {});                    // the (hovering) stand-in leaves: no more magnet
  const [bx, by] = World.bodyState(g.w, wr.hostBody, g.t), alts = loot(g, 'lithobraker').map((p) =>
    Math.hypot(p.x - bx, p.y - by) - World.surfaceR(wr.hostBody, Math.atan2(p.y - by, p.x - bx)));
  check('leftovers settle on the surface, not inside it or in orbit', alts.length && alts.every((a) => a > -0.8 && a < 1.5) &&
        loot(g, 'lithobraker').every((p) => p.rest), `alts ${alts.map((a) => a.toFixed(2)).join(' ')}`);
  check('job + codec + "Rummaging" hint cleared/shown', !m.job && m.codec && m.codec.id === 'lithobraker' && /grab it/.test(m.codec.loot));
});


// ---------------- 9. tiny moon: Little Phil's loot does not reach escape speed ----------------
safely('tiny moon', () => {
  const g = fresh('kiwi'), wr = Wrecks.byId(g, 'phil'), seed = g.w.byId.seed;
  runStanding(g, wr, 1.2, 2); runStanding(g, wr, 1.2, 1, ['KeyF']);
  runUntilSalvaged(g, 'phil', 400, () => runStanding(g, wr, 1.2, 1));
  const n = loot(g, 'phil').length, vEsc = Math.sqrt(2 * seed.mu / seed.R);
  const [bx0, by0, bvx, bvy] = World.bodyState(g.w, seed, g.t), vmax = Math.max(...loot(g, 'phil').map((p) => Math.hypot(p.vx - bvx, p.vy - bvy)));
  check(`pop speed under Seed's escape speed (${vEsc.toFixed(2)} m/s)`, n > 0 && vmax < 0.8 * vEsc, `${n} pickups, fastest ${vmax.toFixed(2)} m/s`);
  g.astro.on = false; g.mode = 'ship';
  H.run(g, 1800, {});
  const [bx, by] = World.bodyState(g.w, seed, g.t), alts = loot(g, 'phil').map((p) => Math.hypot(p.x - bx, p.y - by) - seed.R);
  check('30 s later every piece is still on Seed', alts.length === n && Math.max(...alts) < 6 && fin(alts), `max alt ${Math.max(...alts).toFixed(1)} m (${alts.length}/${n})`);
  check('Little Phil wakes up and says hi (stamp SAID HI)', wr.stamp === 'SAID HI' && Wrecks.isSalvaged(g, 'phil'));
});


// ---------------- 10. blueprints go through Econ ----------------
safely('blueprints', () => {
  const g = fresh('orbit'), E = g.mod.economy, owned0 = Object.keys(E.owned).length, bp0 = E.stats.blueprints, mny = g.money;
  park(g, 'tuesday', 5);
  const res = Wrecks.complete(g, 'tuesday', 'ship');
  check('guaranteed blueprint installs through Econ.grant', res.bp && res.bp.name && E.stats.blueprints === bp0 + 1 && Object.keys(E.owned).length === owned0 + 1,
        res.bp && `${res.bp.id} = ${res.bp.name}`);
  check('...counted in wreck stats, no collector cash', st(g).stats.blueprints === 1 && !res.bp.cash && g.money - mny === res.cash);
  check('...named in the loot line', new RegExp(`${res.bp.name} schematics`).test(st(g).codec.loot), st(g).codec.loot);
  const g2 = fresh('orbit'); park(g2, 'tuesday', 5);
  check('same world seed, same blueprint (no re-roll by reloading)', Wrecks.complete(g2, 'tuesday', 'ship').bp.id === res.bp.id);
  const rolls = Wrecks.list(g).map((w) => JSON.stringify(Wrecks.roll(g, w).items) + Wrecks.roll(g, w).cash);
  check('loot rolls are deterministic per wreck', rolls.every((r, i) => r === JSON.stringify(Wrecks.roll(g2, Wrecks.list(g2)[i]).items) + Wrecks.roll(g2, Wrecks.list(g2)[i]).cash));
  const all = Wrecks.list(g).map((w) => Wrecks.roll(g, w));
  check('loot tables: scrap 0-6, parts 1-4, cash $50-300 in $5 steps', all.every((L) => (L.items.scrap || 0) <= 6 && L.items.parts >= 1 && L.items.parts <= 4 &&
        (!L.cash || (L.cash >= 50 && L.cash <= 300 && L.cash % 5 === 0))), all.map((L) => `${units(L.items)}u$${L.cash}${L.bp ? 'B' : ''}`).join(' '));
  check('Finders Keepers always holds a void opal', Wrecks.roll(g, Wrecks.byId(g, 'finders')).items.voidopal === 1);
});


// ---------------- 11. no EVA module: a landed ship drills a crashed wreck open ----------------
safely('drill', () => {
  const g = fresh('pad'), m = st(g), wr = Wrecks.byId(g, 'lithobraker'), ceres = g.w.byId.ceres;
  Game.landAt(g, ceres, wr.th + 16 / ceres.R); g.everFlew = true; H.run(g, 2, {});
  const pr = prompt(g, /^Drill The Lithobraker open$/);
  check('landed 16 m away: [F] Drill The Lithobraker open', !!pr && /drill/.test(mod.hint(g).text), g.prompts.map((p) => p.text).join(' | '));
  Game.addCargo(g, 'ice', g.S.cargoCap - 3);
  const c0 = { ...g.cargo };
  H.run(g, 1, { pressed: ['KeyF'] });
  check('F starts a drill job', m.job && m.job.how === 'drill');
  const T = runUntilSalvaged(g, 'lithobraker', 400) + 1 / 60;
  check('drilling takes 4 s', T >= 4 && T <= 4 + 2 / 60 + 1e-9, `${T.toFixed(3)} s`);
  const inHold = minus(g.cargo, c0), spilled = lootCount(g, 'lithobraker');
  const all = { ...inHold }; for (const k in spilled) all[k] = (all[k] || 0) + spilled[k];
  check('full hold: the rest falls out beside the hull, on the ground', sameBag(all, Wrecks.roll(g, wr).items) && units(spilled) > 0 && loot(g, 'lithobraker').every((p) => {
    const a = Math.hypot(p.x, p.y) - World.surfaceR(ceres, Math.atan2(p.y, p.x)); return a > -0.5 && a < 1.5; }), `hold ${JSON.stringify(inHold)}, ground ${JSON.stringify(spilled)}`);
  const g2 = fresh('pad'); Game.landAt(g2, ceres, wr.th + 16 / ceres.R); g2.everFlew = true; H.run(g2, 2, {});
  H.run(g2, 1, { pressed: ['KeyF'] }); H.run(g2, 90, { keys: ['KeyW'] });
  check('lifting off stops the drill', !st(g2).job && g2.status === 'flying' && !Wrecks.isSalvaged(g2, 'lithobraker'));
});


// ---------------- 12. bumping a derelict ----------------
safely('bumps', () => {
  const g = fresh('orbit'), wr = Wrecks.byId(g, 'esa4'), R = wr.hitR + g.S.radius * 0.8;
  park(g, 'esa4', R - wr.r + 2, -3); const hull0 = g.sh.hull;
  H.run(g, 60, {});
  const s = wr.state(g.t), dx = g.sh.x - s[0], dy = g.sh.y - s[1], d = Math.hypot(dx, dy), vn = ((g.sh.vx - s[2]) * dx + (g.sh.vy - s[3]) * dy) / d;
  check('ramming at 3 m/s: CLANG, hull dented, bounced off', g.sh.hull < hull0 && vn > 0.5 && d >= R - 0.05 && fin([g.sh.x, g.sh.y, g.sh.vx, g.sh.vy]),
        `hull ${hull0.toFixed(0)} -> ${g.sh.hull.toFixed(0)}, now separating at ${vn.toFixed(2)} m/s`);
  park(g, 'esa4', R - wr.r + 1, -0.5); const h1 = g.sh.hull;
  H.run(g, 120, {});
  check('a 0.5 m/s nudge just bonks (no damage)', g.sh.hull === h1 && Math.hypot(g.sh.x - wr.state(g.t)[0], g.sh.y - wr.state(g.t)[1]) >= R - 0.05);
  park(g, 'esa4', -wr.r); g.sh.x = wr.state(g.t)[0]; g.sh.y = wr.state(g.t)[1]; H.run(g, 2, {});
  check('dead-centre overlap resolves without NaN', fin([g.sh.x, g.sh.y, g.sh.vx, g.sh.vy]));
});


// ---------------- 13. save / load round trip ----------------
safely('save/load', () => {
  const store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  try {
    const g = fresh('glimmer');
    park(g, 'longexp', 8); Game.addCargo(g, 'ice', g.S.cargoCap - 7);
    const res = Wrecks.complete(g, 'longexp', 'ship');
    park(g, 'tuesday', 100); H.run(g, 1, {});
    const data = JSON.parse(JSON.stringify(mod.save(g)));
    check('save: seen, salvaged, unclaimed loot, stats', data.salvaged.includes('longexp') && data.seen.includes('tuesday') && sameBag(data.spill.longexp, res.spilled),
          JSON.stringify(data).slice(0, 150));
    check('Game.save writes it', Game.save(g) && JSON.parse(store[Object.keys(store)[0]]).mods.wrecks.salvaged.includes('longexp'));
    const g2 = Game.create(7, 'glimmer');
    const m2 = st(g2);
    check('reload: salvaged + seen restored', Wrecks.isSalvaged(g2, 'longexp') && Wrecks.isSeen(g2, 'tuesday') && !Wrecks.isSalvaged(g2, 'tuesday'));
    const back = lootCount(g2, 'longexp'), wr2 = Wrecks.byId(g2, 'longexp'), s = wr2.state(g2.t);
    check('reload: unclaimed loot floats beside its wreck again', sameBag(back, res.spilled) && loot(g2, 'longexp').every((p) => Math.hypot(p.x - s[0], p.y - s[1]) < wr2.r + 4),
          JSON.stringify(back));
    check('reload: no job, no pending spill, stats kept', !m2.job && !m2.spill && m2.stats.cash === st(g).stats.cash);
    const again = mod.save(g2), norm = (d) => JSON.stringify({ ...d, seen: [...d.seen].sort(), salvaged: [...d.salvaged].sort() });
    check('save -> load -> save is stable', norm(again) === norm(data));
    park(g2, 'longexp', 6); H.run(g2, 1, {});
    check('reloaded wreck cannot be salvaged twice', !prompt(g2, /Salvage Long Exposure/) && Wrecks.complete(g2, 'longexp') === null);
  } finally { delete global.localStorage; }

  const g3 = fresh('orbit');
  let threw = null;
  try {
    mod.load(g3, null); mod.load(g3, 'nope'); mod.load(g3, 42);
    mod.load(g3, { seen: 'esa4', salvaged: [1, null, 'bogus', 'phil', { a: 1 }], spill: { phil: { parts: 1e9, bogus: 3, scrap: -2, core: NaN }, nope: { scrap: 2 }, esa4: 7 },
                   stats: { blueprints: NaN, cash: 'lots' } });
  } catch (e) { threw = e; }
  const m3 = st(g3);
  check('garbage save data is ignored safely', !threw && Object.keys(m3.salvaged).join() === 'phil' && m3.spill && sameBag(m3.spill.phil, { parts: 50 }) &&
        !m3.spill.nope && m3.stats.blueprints === 0 && m3.stats.cash === 0, threw ? threw.message : JSON.stringify(m3.spill));
  mod.ready(g3);
  check('...and its loot (capped) respawns by Little Phil on the ground', lootCount(g3, 'phil').parts === 50 && !m3.spill);
});


// ---------------- 14. far from everything, 64x warp ----------------
safely('far + warp', () => {
  const g = fresh('orbit'), ceres = g.w.byId.ceres, r = 5200;
  Game.circularAround(g, ceres, r, 1.0); g.everFlew = true; Game.setWarp(g, 64);
  for (let i = 0; i < 400; i++) H.run(g, 1, {});
  const L = Wrecks.list(g);
  check('64x for ~7 min sim far out: no cap, all finite', g.warp === 64 && mod.warpLimit(g) === null && fin(L.map((w) => w.state(g.t))) && fin([g.sh.x, g.sh.y]),
        `${g.warp}x, t ${g.t.toFixed(0)} s, ${Math.hypot(g.sh.x, g.sh.y).toFixed(0)} m out`);
  check('hint / prompts / nav quiet out here', !mod.hint(g) && !(mod.interactions(g) || []).length && Game.navTargets(g).filter((n) => n.kind === 'wreck').every((n) => fin(n.state(g.t))));
  check('rails stay exact at t = 1e7 s', Wrecks.list(g).filter((w) => w.orbital).every((w) => {
    const s = w.state(1e7), h = World.bodyState(g.w, w.hostBody, 1e7); return Math.abs(Math.hypot(s[0] - h[0], s[1] - h[1]) - w.a) < 1e-6; }));
});


// ---------------- 15. art: every wreck, every zoom, salvaged or not, no NaN handed to the canvas ----------------
safely('art', () => {
  const g = fresh('orbit'), m = st(g);
  let bad = [], draws = 0;
  const drawAll = () => {
    for (const wr of Wrecks.list(g)) for (const z of [0.02, 0.3, 1.5, 6, 24, 80]) {
      const [x, y] = wr.state(g.t), K = fakeKit(z, x, y);
      mod.drawWorld(g, K.kit); mod.drawScreen(g, K.kit); mod.drawHUD(g, K.kit);
      draws++; if (K.bad.length) bad.push(`${wr.id}@${z}: ${K.bad[0]}`);
    }
  };
  drawAll();
  for (const id of ['esa4', 'notpirates']) m.seen[id] = true;
  park(g, 'esa4', 8); H.run(g, 1, {}); H.run(g, 1, { pressed: ['KeyF'] }); H.run(g, 20, {});
  drawAll();
  for (const wr of Wrecks.list(g)) { m.salvaged[wr.id] = m.seen[wr.id] = true; }
  m.codec = { id: 'phil', t0: g.real - 2, loot: 'LOOT: 1× ship parts · somebody said hi' };
  drawAll();
  stand(g, Wrecks.byId(g, 'couch'), 1); m.job = { id: 'couch', how: 'foot', t: 1, need: 3, fxT: 0, wordT: 0 };
  drawAll();
  check('every wreck draws at 6 zooms x 4 states, no NaN, no throw', bad.length === 0, `${draws} draws${bad.length ? `, bad: ${bad.slice(0, 3).join('; ')}` : ''}`);
});


// ---------------- 15b. far out: badges by a dot-sized moon stack, and clicking the stack cycles its wrecks ----------------
safely('badge stack', () => {
  const g = fresh('orbit'), kiwi = g.w.byId.kiwi, z = 0.15, [kx, ky] = World.bodyState(g.w, kiwi, g.t), K = fakeKit(z, kx, ky);
  g.navId = null; mod.drawScreen(g, K.kit);
  const [sx, sy] = K.kit.toScreen(kx, ky), bx = sx + Math.max(kiwi.R * z, 3) + 13, by = sy - 5, seen = [];
  const click = () => { mod.drawScreen(g, K.kit); return mod.onMouse(g, { pressed: true, button: 0, sx: bx, sy: by, x: kx, y: ky, px: 1 / z }); };
  for (let i = 0; i < 6; i++) { if (!click()) break; seen.push(g.navId); if (!g.navId) break; }
  const ids = seen.filter(Boolean).map((n) => n.slice(6));
  check('far out, the badge beside Kiwi stacks its wrecks; clicks cycle them, then let go', ids.includes('lunchbox') && ids.includes('lettuce') && new Set(ids).size === ids.length && seen[seen.length - 1] === null,
        seen.join(' -> '));
  check('a click elsewhere is left to the core', mod.onMouse(g, { pressed: true, button: 0, sx: 5, sy: 5 }) === false);
});


// ---------------- 16. a long ordinary session does not trip anything ----------------
safely('soak', () => {
  const g = fresh('orbit');
  for (let i = 0; i < 600; i++) H.run(g, 1, i % 120 === 0 ? { pressed: ['Tab'] } : {});
  check('10 s of play with Tab cycling through wreck targets: no error', !g.err && fin([g.sh.x, g.sh.y]), g.err || `nav ${g.navId}`);
});
}


// ======================================================================
//  --solo: only the wrecks module (no economy, no EVA)
// ======================================================================

function solo() {
  safely('solo', () => {
    check('[wrecks only] loads alone: no economy, no EVA', Game.mods.length === 1 && Game.mods[0].id === 'wrecks');
    const g = fresh('orbit'), mny = g.money;
    park(g, 'tuesday', 5);
    const res = Wrecks.complete(g, 'tuesday', 'ship');
    check('[wrecks only] blueprint without Econ: sold for $300-600', res.bp && !res.bp.name && res.bp.cash >= 300 && res.bp.cash <= 600 && res.bp.cash % 50 === 0 &&
          g.money - mny === res.cash + res.bp.cash && !g.mod.economy, `bp $${res.bp && res.bp.cash}, cash $${res.cash}`);
    check('[wrecks only] the loot line says so', /schematics sold for \$/.test(st(g).codec.loot), st(g).codec.loot);
    H.run(g, 2, {});
    check('[wrecks only] job "wreck" pays out', g.done.wreck !== undefined);
    for (let i = 0; i < 300; i++) H.run(g, 1, i % 60 === 0 ? { pressed: ['Tab'] } : {});
    check('[wrecks only] 5 s of play, no error', !g.err, g.err || '');
  });
}


// ======================================================================
//  --eva: the real astronaut (economy, shop, stations, eva, wrecks): step out, walk over, rummage, board
// ======================================================================

// walk like a person: hold the key, hop (W) when a 0.5 m terrain step stops you; until(g) ends it -> frames taken
function walk(g, key, until, maxFrames = 1800) {
  let last = [g.astro.x, g.astro.y], stuck = 0, i = 0;
  for (; i < maxFrames && !until(g); i++) {
    const hop = stuck > 0.4;
    H.run(g, 1, hop ? { keys: [key, 'KeyW'], pressed: ['KeyW'] } : { keys: [key] });
    stuck = hop ? 0 : Math.hypot(g.astro.x - last[0], g.astro.y - last[1]) < 0.01 ? stuck + 1 / 60 : 0;
    last = [g.astro.x, g.astro.y];
  }
  return i;
}

function evaRun() {
  safely('eva', () => {
    check('[real EVA] economy, shop, stations, eva, wrecks loaded', ['economy', 'stations', 'eva', 'wrecks'].every((id) => Game.mods.some((x) => x.id === id)));
    const g = Game.create(7, null, { fresh: true }), m = st(g);
    g.navId = 'wreck:finders'; H.run(g, 2, {});
    const h0 = Game.hint(g);
    check('[real EVA] docked at the Hub, Tab to a wreck: its line beats the dock chatter', g.status === 'docked' && /Unknown signal \(on Glimmer\)/.test(h0), `${g.status}: ${h0}`);
    g.navId = null;

    const ceres = g.w.byId.ceres, wr = Wrecks.byId(g, 'lithobraker');
    Game.release(g, 0); Game.landAt(g, ceres, wr.th + 32 / ceres.R); g.everFlew = true; H.run(g, 2, {});
    const h1 = Game.hint(g);
    check('[real EVA] landed 32 m off: "Press E to step out, walk over"', g.status === 'landed' && /Press E to step out/.test(h1), h1);
    H.run(g, 1, { pressed: ['KeyE'] });
    check('[real EVA] E steps out', g.mode === 'eva' && g.astro.on);
    let i = walk(g, 'KeyD', () => !!prompt(g, /^Rummage through The Lithobraker$/) && Wrecks.hullDist(wr, g.t, g.astro.x, g.astro.y) < 2.5);
    H.run(g, 20, {});
    const d = Wrecks.hullDist(wr, g.t, g.astro.x, g.astro.y);
    check('[real EVA] walk over (D): [F] Rummage appears within 3 m', !!prompt(g, /^Rummage through/) && d < 3 && i > 60, `${(i / 60).toFixed(1)} s walking, ${d.toFixed(2)} m from the hull`);
    H.run(g, 1, { pressed: ['KeyF'] });
    check('[real EVA] F starts rummaging', m.job && m.job.how === 'foot');
    H.run(g, 190, {});
    check('[real EVA] 3 s later: salvaged, job "wreck" done', Wrecks.isSalvaged(g, 'lithobraker') && g.done.wreck !== undefined && !m.job);
    H.run(g, 240, {});
    const roll = Wrecks.roll(g, wr).items, packKg = Game.kgOf(g.pack);
    check('[real EVA] loot flew into the backpack via the magnet', Object.keys(roll).some((k) => g.pack[k] > 0) && packKg <= g.S.packCap,
          `pack ${JSON.stringify(g.pack)} (${packKg} kg of ${g.S.packCap})`);
    i = walk(g, 'KeyA', () => !!prompt(g, /^Board/));
    const cargo0 = { ...g.cargo };
    H.run(g, 1, { pressed: ['KeyE'] });
    check('[real EVA] walk back (A), E boards: the pack goes into the hold', i > 60 && g.mode === 'ship' && Object.keys(roll).some((k) => (g.cargo[k] || 0) > (cargo0[k] || 0)),
          `hold ${JSON.stringify(g.cargo)}, ${(i / 60).toFixed(1)} s back`);
    check('[real EVA] no hook errors, everything finite', !g.err && fin([g.sh.x, g.sh.y, g.astro.x, g.astro.y]), g.err || '');
  });
}


// ======================================================================
//  --all: every module at once; visit every wreck, salvage it, warp about
// ======================================================================

function allRun() {
  safely('all', () => {
    check('[all modules] seven modules loaded', Game.mods.length === 7, Game.mods.map((x) => x.id).join(' '));
    const g = Game.create(7, null, { fresh: true });
    H.run(g, 30, {});
    let bad = 0;
    for (const wr of Wrecks.list(g)) {
      if (wr.orbital) park(g, wr.id, 8);
      else { Game.landAt(g, wr.hostBody, wr.th + (wr.hx + 6) / wr.R0); g.everFlew = true; EVA.stepOut(g); }
      H.run(g, 60, {});
      Wrecks.complete(g, wr.id);
      H.run(g, 60, {});
      if (g.err || !fin([g.sh.x, g.sh.y, g.astro.x, g.astro.y])) bad++;
      if (g.mode === 'eva') { g.astro.on = false; g.mode = 'ship'; }
    }
    check('[all modules] every wreck salvaged once, no errors', Wrecks.list(g).every((w) => Wrecks.isSalvaged(g, w.id)) && !bad && !g.err, g.err || `${bad} bad`);
    Game.circularAround(g, g.w.byId.ceres, 1300, 2.0); g.status = 'flying'; Game.setWarp(g, 64);
    H.run(g, 400, {});
    check('[all modules] then 64x for a while: no errors, finite', !g.err && fin([g.sh.x, g.sh.y]), g.err || `t ${g.t.toFixed(0)} s, warp ${g.warp}x`);
  });
}


if (MODE === '--solo') solo();
else if (MODE === '--eva') evaRun();
else if (MODE === '--all') allRun();
else {
  main();
  for (const mode of ['--solo', '--eva', '--all']) {
    const r = require('child_process').spawnSync(process.execPath, [__filename, mode], { encoding: 'utf8' });
    const lines = (r.stdout || '').split('\n').filter((l) => /^(PASS|FAIL)/.test(l));
    for (const l of lines) { console.log(l); l.startsWith('PASS') ? nPass++ : nFail++; }
    if (r.status !== 0 && !lines.some((l) => l.startsWith('FAIL'))) check(`${mode} run exits cleanly`, false, (r.stderr || '').slice(0, 300));
  }
}
console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
