// ======================================================================
//  WRECKS  —  derelicts on analytic circular Kepler rails, and crashed
//  hulks half-buried in the rocks.  Match speed and press F to salvage
//  from the ship (4 s), or walk up on foot and rummage (3 s).  Loot,
//  found cash, free upgrade blueprints, and one crew log line each.
//  API: Wrecks.list(g), byId(g, id), info(g, wr), start(g, id, how),
//       complete(g, id, how), hullDist(wr, t, x, y), isSalvaged(g, id), isSeen(g, id)
// ======================================================================

const Wrecks = (() => {

  const ITEMS = CONFIG.items;

  // ---------------- tuning ----------------
  const SALVAGE_R = 15, SALVAGE_V = 2;       // ship: start within this of the hull [m], slower than this relative to it [m/s]
  const KEEP_R = 25, KEEP_V = 3;             // ...and stay inside these while the cutters work
  const SALVAGE_T = 4, RUMMAGE_T = 3;        // seconds of work (sim time)
  const RUMMAGE_R = 3, RUMMAGE_KEEP = 5;     // on foot: reach to the hull to start / to keep going [m]
  const DRILL_R = 20;                        // no EVA module: a landed ship this close drills a crashed wreck open [m]
  const SEE_R = 400;                         // first sighting within this reveals the name [m]
  const NEAR_WARP = 40;                      // warp capped at 4x this close to an unsalvaged wreck [m] (like rubble)
  const HINT_R = 250;                        // salvage coaching inside this [m] (the core's TGT markers show inside 300)
  const BUMP_V = 1;                          // ramming a wreck faster than this dents the hull [m/s]
  const ICON_PX = 12;                        // a wreck smaller than this on screen [px radius] is drawn as an icon
  const DETAIL_PX = 40;                      // ...and bigger than this gets ribs, cables and scorch marks
  const LOG_CPS = 42, LOG_HOLD = 9;          // crew log typewriter [chars/s], then it stays up this long [s]
  const LOOT_KEEP = 600;                     // wreck loot never ages past this (the core drops pickups at 900 s)
  const FACT_T = 8;                          // seconds a freshly targeted wreck shows its physics fact
  const TETHER_BOB = 0.3;                    // tethered loot bobs in and out this much [m]

  const INK = '#1b1433', PAPER = '#fff4dc', PAPER2 = '#ffe2b0';
  const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif';
  const GOLD = '#ffd166', SIGNAL = '#c792ff', DIM = '#b9addf', STAMP = '#e63946';
  const STEEL = ['#c9c4e8', '#8c84b3', '#f1eeff'], DARK = '#2c2442', CELLS = ['#4466cc', '#2c3f8c', '#a8c0ff'];
  let on = false;                            // registered (not filtered out by ?mods=)


  // ---------------- loot ----------------
  //  scrap / parts: [min, max] units · core: chance of a reactor core · cash: chance of found cash in [cashMin, cashMax]
  //  bp: chance of a blueprint (1 = guaranteed) · extra: always in the pile

  const LOOT = { scrap: [2, 6], parts: [1, 3], core: 0.2, cash: 0.45, cashMin: 50, cashMax: 300, bp: 0.35, extra: null };
  const PURSES = ['a sock full of credits', 'a biscuit tin of credits (no biscuits)', 'credits taped under the pilot seat',
                  'a jar labelled RAINY DAY', 'a lucky envelope of credits', 'credits stuffed in a spare glove'];


  // ---------------- catalogue ----------------
  //  orbital: host, a (rail radius m), ph (rail angle at t = 0), dir (+1 prograde, -1 retrograde), spin (tumble rad/s)
  //  crashed: host, th (polar angle of the crash site), tilt (rad off the ground), bury (fraction of the hull underground),
  //           from (+1 / -1: which side it skidded in from)
  //  size: half-length [m] · kind + art: how it is drawn · loot: overrides of LOOT · who / log: the crew log

  const DEFS = [
    { id: 'esa4', name: 'ESA Intern Project #4', kind: 'probe', host: 'ceres', a: 380, ph: 0.4, spin: 0.11, size: 3.2,
      loot: { scrap: [1, 2], parts: [2, 3], core: 0, cash: 0.3 },
      who: 'INTERN (UNPAID)', log: 'If found, please tell my supervisor it worked for eleven glorious minutes.',
      fact: (wr) => `${wr.name} is in low Ceres orbit, ${wr.a} m from the centre: one lap every ${lap(wr.period)}. ` +
        `Lower orbits are faster, so it laps ${hasMod('stations') ? 'Ceres Hub' : 'anything higher up'}.` },

    //  Dorito's L4 is stable by Routh, but Kiwi kicks loose anything parked there within a lap or two
    //  (tests/test_wrecks.js checks both), so the Tuesday's autopilot keeps puffing it back: keeper = RCS puffs
    { id: 'tuesday', name: 'The Plucky Tuesday', kind: 'hauler', host: 'ceres', needs: ['ceres', 'dorito'], spin: -0.035, size: 8, keeper: true,
      a: (w) => w.byId.dorito.a, ph: (w) => w.byId.dorito.phase + Math.PI / 3,
      art: { cols: ['#ff9f43', '#c25f1c', '#ffd8a6'], stripe: '#7cf5d6', box: ['#7cf5d6', '#3c9f8a', '#d4fff4'] },
      loot: { bp: 1, core: 0.35 },
      who: 'CAPT. MIRA OSEI', log: "Engine's dead. The autopilot keeps puffing us back to Dorito's L4, and Lagrange says we're safe here. Somebody always comes by on a Tuesday.",
      fact: (wr, w) => `The Tuesday holds Dorito's L4, 60° ahead: stable by Routh (Dorito is ${(100 * w.byId.dorito.mu / (w.byId.dorito.mu + w.byId.ceres.mu)).toFixed(1)}% ` +
        "of the pair's mass, limit 3.85%), but Kiwi kicks things loose, so its autopilot puffs it back." },

    //  past the rubble (115-190 m) Ceres' tide breaks up prograde orbits within a few laps; retrograde ones last (tested)
    { id: 'notpirates', name: 'Definitely Not Pirates', kind: 'pirate', host: 'potato', a: 220, ph: 1.0, dir: -1, spin: 0.05, size: 7,
      loot: { bp: 1, cash: 1, cashMin: 150, cashMax: 300, scrap: [3, 6] },
      who: 'DEFINITELY NOT A PIRATE', log: 'Painted over the skull. Painted over the other skull. Flew backwards so nobody could follow us. Nobody followed us.',
      fact: (wr) => `${wr.name} circles Big Potato backwards at ${wr.a} m. Out there Ceres' tide wrecks forward orbits; backward ones last. ` +
        `Matching it costs ~${(2 * wr.v).toFixed(0)} m/s.` },

    { id: 'lettuce', name: 'Lettuce Pray', kind: 'pod', host: 'kiwi', a: 74, ph: 3.5, spin: 0.06, size: 6,
      art: { inside: 'plants' }, loot: { core: 0.15 },
      who: 'BASIL, GARDENER', log: 'Tomatoes thriving. Reactor, less so. Tell Fern the good seeds are in the blue drawer.',
      fact: (wr) => `${wr.name} circles Kiwi at ${wr.a} m, inside the 88 m parking orbit and well under the rubble ring at 118 m.` },

    { id: 'longexp', name: 'Long Exposure', kind: 'hauler', host: 'glimmer', a: 70, ph: 1.0, spin: -0.045, size: 7,
      art: { cols: ['#e8e4f7', '#a9a2cc', '#ffffff'], stripe: '#8f6bff', scope: true }, loot: { parts: [2, 4], core: 0.3 },
      who: 'DR. ADA VOSS', log: "Opened the shutter for one last long exposure of the dark. Leave it open. It's almost developed.",
      fact: (wr) => `${wr.name} circles Glimmer at ${wr.a} m. Glimmer pulls only ${wr.hostBody.g} m/s², so it creeps along at ${wr.v.toFixed(1)} m/s.` },

    { id: 'lithobraker', name: 'The Lithobraker', kind: 'hauler', host: 'ceres', th: -1.35, tilt: 0.22, bury: 0.42, from: 1, size: 8,
      art: { cols: ['#c4c0d8', '#7f7aa0', '#eeecf8'], stripe: GOLD, box: ['#ff9f43', '#c25f1c', '#ffd8a6'] }, loot: { scrap: [3, 6] },
      who: 'PILOT GUS', log: "Flight plan said 'aerobrake'. Ceres has no air. In my defence, it does now have a crater.",
      fact: (wr) => `${wr.name} crashed on Ceres' far side, opposite the pad. ${getIn()}` },

    { id: 'coolranch', name: 'Cool Ranch Express', kind: 'hauler', host: 'dorito', th: 2.15, tilt: -0.3, bury: 0.38, from: -1, size: 6.5,
      art: { cols: ['#4cc9f0', '#2a7fb0', '#c8f1ff'], stripe: '#ff9f1c', crates: true },
      who: 'COURIER TAMSIN', log: '4,000 crates of chips for the Dorito Day festival. Arrived on time. Arrived very hard.',
      fact: (wr) => `${wr.name} crashed on Dorito, chips first. ${getIn()}` },

    { id: 'lunchbox', name: 'Lunchbox', kind: 'hauler', host: 'kiwi', th: 4.0, tilt: 0.28, bury: 0.4, from: 1, size: 6,
      art: { cols: ['#ffd166', '#c9962e', '#fff3c4'], stripe: '#e05a6a', bites: [[4.2, 0.9], [-3.4, 1.1], [-6.6, 0.8]] },
      who: 'MECHANIC BO', log: 'The bugs keep nibbling the hull. Honestly? Good for them. Somebody should enjoy this ship.',
      fact: (wr) => `${wr.name} crashed on Kiwi, bug country. ${getIn()}${hasMod('mobs') ? ' Mind the munchers.' : ''}` },

    { id: 'couch', name: 'Couch Potato', kind: 'pod', host: 'potato', th: 0.75, tilt: -0.18, bury: 0.3, from: -1, size: 5.5,
      art: { inside: 'couch', cols: ['#ffb4c6', '#c96f8b', '#ffe3ea'] }, loot: { core: 0.3 },
      who: 'CAPT. LOU', log: 'Landed for a quick nap. Set the alarm for six. Forgot to say six what.',
      fact: (wr) => `${wr.name} crashed on Big Potato. ${getIn()}${hasMod('mobs') ? ' Beetles about.' : ''}` },

    { id: 'finders', name: 'Finders Keepers', kind: 'prospector', host: 'glimmer', th: 2.9, tilt: -0.95, bury: 0.45, from: 1, size: 5,
      loot: { bp: 1, extra: { voidopal: 1 } },
      who: 'R., PROSPECTOR', log: "Found a void opal vein the size of a fridge. Said 'one more scoop'. If you're reading this, don't say 'one more scoop'.",
      fact: (wr) => `${wr.name} nosed into Glimmer. Same make as your ship. ${getIn()}` },

    { id: 'phil', name: 'Little Phil', kind: 'lander', host: 'seed', th: 1.2, tilt: 0.35, bury: 0.12, from: -1, size: 1.6, stamp: 'SAID HI',
      loot: { scrap: [0, 0], parts: [1, 2], core: 0, cash: 0, bp: 0.5 },
      who: 'LITTLE PHIL (LANDER)', log: 'Bounced twice. Landed in the shade. Took a nap. Woke up once, just to say hi. Hi.',
      fact: (wr) => `${wr.name} sleeps on Seed. Seed's escape speed is only ${Math.sqrt(2 * wr.hostBody.mu / wr.hostBody.R).toFixed(1)} m/s: walk softly.` },
  ];

  //  capsule of each kind for reach & bumps (half-length hx, half-height hy, in art units: 10 = size) + spark spots
  const SHAPE = {
    hauler:     { hx: 10, hy: 3.2, sparks: [[0.9, 2], [0.7, -1], [-0.9, 1.4], [1.5, 0.2]] },
    probe:      { hx: 10, hy: 2.8, sparks: [[-4.6, 0], [2.8, 0.4]] },
    pirate:     { hx: 10, hy: 3.2, sparks: [[0.9, 1.6], [-0.8, -1.1], [0.8, -0.4]] },
    pod:        { hx: 6.4, hy: 6.4, sparks: [[3.6, 4.2], [5.4, 1.4], [-4.8, 3]] },
    lander:     { hx: 6, hy: 3.2, sparks: [] },
    prospector: { hx: 10, hy: 4, sparks: [[5, 1.6], [-6.9, 3.4], [2, -3.4]] },
  };

  const val = (v, w) => (typeof v === 'function' ? v(w) : v);
  const hasMod = (id) => Game.mods.some((x) => x.id === id);
  const getIn = () => (hasMod('eva') ? 'Land nearby, step out (E), walk over and rummage (F).' : `Land within ${DRILL_R} m of it and drill it open (F).`);
  function lap(T) { return T >= 60 ? `${Math.floor(T / 60)} min ${Math.round(T % 60)} s` : `${Math.round(T)} s`; }


  // ======================================================================
  //  RAILS & CRASH SITES
  // ======================================================================

  const cache = new WeakMap();
  function list(g) {
    if (!on || !g || !g.w || !g.w.byId) return [];
    let L = cache.get(g.w);
    if (!L) cache.set(g.w, (L = DEFS.filter((d) => (d.needs || [d.host]).every((id) => g.w.byId[id])).map((d) => build(g.w, d))));
    return L;
  }
  const byId = (g, id) => list(g).find((wr) => wr.id === id) || null;

  function build(w, d) {
    const host = w.byId[d.host], k = d.size / 10, sh = SHAPE[d.kind];
    const wr = { ...d, idx: DEFS.indexOf(d), hostBody: host, k, r: d.size, hx: sh.hx * k, hy: sh.hy * k, hitR: d.size * 0.7,
                 orbital: d.a != null, stamp: d.stamp || 'SALVAGED', art: d.art || {} };
    if (wr.orbital) {
      const a = val(d.a, w), ph = val(d.ph, w), n = (d.dir || 1) * Math.sqrt(host.mu / a ** 3), spin = d.spin || 0, a0 = d.a0 ?? 0.7 * wr.idx;
      Object.assign(wr, { a, ph, n, v: Math.abs(n) * a, period: 2 * Math.PI / Math.abs(n) });
      wr.state = (t) => {
        const h = World.bodyState(w, host, t), th = n * t + ph, c = Math.cos(th), s = Math.sin(th);
        return [h[0] + a * c, h[1] + a * s, h[2] - a * n * s, h[3] + a * n * c];
      };
      wr.ang = (t) => a0 + spin * t;
    } else {
      const R0 = World.surfaceR(host, d.th), [nx, ny] = surfNormal(host, d.th), lift = wr.hy * (1 - 2 * d.bury);
      const gx = R0 * Math.cos(d.th), gy = R0 * Math.sin(d.th), lx = gx + nx * lift, ly = gy + ny * lift;
      const A = Math.atan2(ny, nx) - Math.PI / 2 + (d.tilt || 0);
      Object.assign(wr, { gx, gy, nx, ny, lx, ly, R0 });
      wr.state = (t) => { const h = World.bodyState(w, host, t); return [h[0] + lx, h[1] + ly, h[2], h[3]]; };
      wr.ang = () => A;
      wr.site = crashSite(wr);
    }
    return wr;
  }

  // outward normal of the outline at polar angle th, averaged over a few metres of ground
  function surfNormal(b, th) {
    const e = Math.min(0.3, 3 / b.R), p = (a) => { const r = World.surfaceR(b, a); return [r * Math.cos(a), r * Math.sin(a)]; };
    const [x1, y1] = p(th - e), [x2, y2] = p(th + e), tx = x2 - x1, ty = y2 - y1, n = Math.hypot(tx, ty) || 1;
    return [ty / n, -tx / n];
  }

  // dirt lumps along the hull's footprint, spilled crates (seeded per wreck, in metres along the ground)
  function crashSite(wr) {
    const rand = World.rng(911 + wr.idx * 7717), sc = Math.min(1, wr.r / 6) * Math.min(1, 0.4 + 1.6 * wr.bury), half = wr.hx * Math.cos(wr.tilt || 0);
    const lead = -(wr.from || 1), lumps = [];
    for (let i = 0; i < 4; i++) lumps.push({ s: lead * (half * (0.55 + 0.18 * i) + rand() * 0.6), r: (1.05 - 0.17 * i + 0.2 * rand()) * sc });
    for (let i = 0; i < 2; i++) lumps.push({ s: -lead * (half * (0.45 + 0.3 * i)), r: (0.45 + 0.2 * rand()) * sc });
    for (let i = 0; i < 3; i++) lumps.push({ s: lead * (half * 1.2 + (1.5 + 2.5 * i) * sc * 2) * (0.9 + 0.2 * rand()), r: (0.22 + 0.15 * rand()) * sc });
    const crates = wr.art.crates ? [half + 1.8, half + 4.4, -half - 2.6].map((s) => ({ s, tilt: (rand() - 0.5) * 0.9, r: 0.6 * sc })) : [];
    return { lumps, crates };
  }

  // ---------------- frames: wreck-local [m] <-> world ----------------

  function toWorld(wr, t, lx, ly) {
    const [x, y] = wr.state(t), a = wr.ang(t), c = Math.cos(a), s = Math.sin(a);
    return [x + lx * c - ly * s, y + lx * s + ly * c];
  }
  function toLocal(wr, t, x, y) {
    const [cx, cy] = wr.state(t), a = wr.ang(t), c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
    return [dx * c + dy * s, -dx * s + dy * c];
  }
  // distance from a point to the hull capsule [m] (negative inside), and the nearest hull point
  function hullDist(wr, t, x, y) {
    const [lx, ly] = toLocal(wr, t, x, y), half = Math.max(0, wr.hx - wr.hy), qx = Math.max(-half, Math.min(half, lx));
    return Math.hypot(lx - qx, ly) - wr.hy;
  }
  function hullPoint(wr, t, x, y) {
    const [lx, ly] = toLocal(wr, t, x, y), half = Math.max(0, wr.hx - wr.hy), qx = Math.max(-half, Math.min(half, lx));
    const dx = lx - qx, dy = ly, d = Math.hypot(dx, dy) || 1;
    return toWorld(wr, t, qx + dx / d * wr.hy, dy / d * wr.hy);
  }

  // ship vs wreck: { d: distance to the hull's bounding circle (as the HUD shows it), v: relative speed, s: wreck state }
  function info(g, wr) {
    const s = wr.state(g.t), sh = g.sh;
    return { s, d: Math.hypot(sh.x - s[0], sh.y - s[1]) - wr.r, v: Math.hypot(sh.vx - s[2], sh.vy - s[3]) };
  }

  const where = (wr) => (wr.orbital ? `${wr.hostBody.name} orbit` : `on ${wr.hostBody.name}`);
  const navName = (g, wr) => (isSeen(g, wr.id) ? `${wr.name}${isSalvaged(g, wr.id) ? ' (salvaged)' : ''}` : `Unknown signal (${where(wr)})`);


  // ======================================================================
  //  STATE
  // ======================================================================

  function fresh() {
    return { seen: {}, salvaged: {}, job: null, codec: null, near: [], fx: {}, spill: null, tgt: { id: null, t0: 0 }, said: [],
             stats: { blueprints: 0, cash: 0 } };
  }
  const st = (g) => g.mod.wrecks || (g.mod.wrecks = fresh());
  const isSeen = (g, id) => !!(g.mod.wrecks && g.mod.wrecks.seen[id]);
  const isSalvaged = (g, id) => !!(g.mod.wrecks && g.mod.wrecks.salvaged[id]);
  const count = (o) => Object.keys(o || {}).length;
  const evaOn = () => hasMod('eva');

  function econ() {
    if (typeof Econ === 'undefined' || !Econ || typeof Econ.grant !== 'function' || typeof Econ.randomBlueprint !== 'function') return null;
    return Game.mods.some((x) => x.id === 'economy') ? Econ : null;
  }

  function init(g) { g.mod.wrecks = fresh(); }

  function save(g) {
    const m = st(g), spill = {};
    const add = (id, item, q) => { const s = spill[id] || (spill[id] = {}); s[item] = (s[item] || 0) + q; };
    for (const p of g.pickups) if (p.wreck && p.qty > 0) add(p.wreck, p.item, p.qty);
    if (m.spill) for (const id in m.spill) for (const item in m.spill[id]) add(id, item, m.spill[id][item]);
    return { seen: Object.keys(m.seen), salvaged: Object.keys(m.salvaged), spill, stats: { ...m.stats } };
  }

  function load(g, d) {
    const m = st(g);
    if (!d || typeof d !== 'object') return;
    const known = new Set(DEFS.map((x) => x.id)), num = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    for (const k of ['seen', 'salvaged']) if (Array.isArray(d[k])) for (const id of d[k]) if (known.has(id)) m[k][id] = true;
    for (const id in m.salvaged) m.seen[id] = true;
    if (d.stats && typeof d.stats === 'object') m.stats = { blueprints: num(d.stats.blueprints), cash: num(d.stats.cash) };
    if (d.spill && typeof d.spill === 'object') {
      for (const id in d.spill) {
        if (!known.has(id) || !d.spill[id] || typeof d.spill[id] !== 'object') continue;
        for (const item in d.spill[id]) {
          const q = Math.min(50, num(d.spill[id][item]));
          if (q && ITEMS[item]) { m.spill = m.spill || {}; (m.spill[id] = m.spill[id] || {})[item] = q; }
        }
      }
    }
  }

  // after spawn, a load or a dev teleport: loot left lying around in the last session comes back
  function ready(g) {
    const m = st(g);
    m.job = null; m.near = [];
    if (!m.spill) return;
    for (const id in m.spill) { const wr = byId(g, id); if (wr) respill(g, wr, m.spill[id]); }
    m.spill = null;
  }

  function respawn(g) { const m = st(g); m.job = null; m.near = []; m.said = []; }
  function died(g) { const m = st(g); if (m.job && m.job.how !== 'foot') m.job = null; m.near = []; }


  // ======================================================================
  //  SALVAGE: start, keep going, finish
  //  how: 'ship' (orbital, from the cockpit) · 'foot' (crashed, astronaut) · 'drill' (crashed, landed ship, no EVA module)
  // ======================================================================

  // why this job cannot start / continue, or null
  function problem(g, wr, how, starting) {
    if (isSalvaged(g, wr.id)) return 'already stripped';
    if (how === 'foot') {
      const A = g.astro;
      if (!A || !A.on) return 'back aboard';
      if (A.hp != null && A.hp <= 0) return 'suit trouble';
      return hullDist(wr, g.t, A.x, A.y) > (starting ? RUMMAGE_R : RUMMAGE_KEEP) ? 'walked away' : null;
    }
    if (g.mode !== 'ship' || (g.astro && g.astro.on)) return 'left the cockpit';
    const q = info(g, wr);
    if (how === 'drill') {
      if (wr.orbital || g.status !== 'landed' || g.landedOn !== wr.hostBody) return 'lifted off';
      return q.d > (starting ? DRILL_R : DRILL_R + 5) ? 'too far' : null;
    }
    if (!wr.orbital) return 'it is on the ground';
    if (g.status !== 'flying') return g.status === 'dead' ? 'ship wrecked' : g.status;
    if (q.d > (starting ? SALVAGE_R : KEEP_R)) return 'drifted away';
    if (q.v > (starting ? SALVAGE_V : KEEP_V)) return 'too fast';
    return null;
  }

  function start(g, wrOrId, how) {
    const m = st(g), wr = typeof wrOrId === 'string' ? byId(g, wrOrId) : wrOrId;
    if (!wr || m.job) return false;
    how = how || (wr.orbital ? 'ship' : 'foot');
    const why = problem(g, wr, how, true);
    if (why) { Game.toast(g, `CAN'T SALVAGE: ${why.toUpperCase()}`, '#ff9f1c', 'salvage'); return false; }
    m.job = { id: wr.id, how, t: 0, need: how === 'foot' ? RUMMAGE_T : SALVAGE_T, fxT: g.real, wordT: g.real };
    const [x, y] = workPoint(g, wr, how);
    say(g, wr, how === 'foot' ? 'RUMMAGE!' : how === 'drill' ? 'GRRRIND!' : 'KRRZZT!', GOLD, x, y, 24);
    Game.log(g, `${how === 'foot' ? 'rummaging through' : how === 'drill' ? 'drilling into' : 'salvaging'} ${wr.name}`);
    return true;
  }

  function tooFast(g) {
    Game.toast(g, `TOO FAST: MATCH SPEED (UNDER ${SALVAGE_V} M/S)`, '#ff9f1c', 'salvage');
    Game.popup(g, 'WHOA THERE!', '#ff9f1c');
  }

  function cancel(g, m, wr, why) {
    m.job = null;
    Game.toast(g, `SALVAGE STOPPED: ${why.toUpperCase()}`, '#ff9f1c', 'salvage');
    Game.log(g, `salvage of ${wr.name} stopped: ${why}`);
  }

  // where the cutting happens: the hull point nearest the ship / astronaut
  function workPoint(g, wr, how) {
    const me = how === 'foot' ? g.astro : g.sh;
    return hullPoint(wr, g.t, me.x, me.y);
  }

  function work(g, m, simDt) {
    const J = m.job, wr = byId(g, J.id);
    if (!wr) { m.job = null; return; }
    const why = problem(g, wr, J.how, false);
    if (why) { cancel(g, m, wr, why); return; }
    if (!(simDt > 0)) return;
    J.t += simDt;
    workFx(g, wr, J);
    if (J.t >= J.need) complete(g, wr, J.how);
  }

  const WORK_WORDS = { ship: ['KRRZZT!', 'CLANK!', 'BZZT!', 'SKRRT!'], drill: ['GRRRIND!', 'BZZT!', 'CRUNCH!'],
                       foot: ['RATTLE...', 'CLONK!', 'OOH?', 'HMM...'] };
  function workFx(g, wr, J) {
    if (g.real - J.fxT < 0.3) return;
    J.fxT = g.real;
    const [x, y] = workPoint(g, wr, J.how), [, , vx, vy] = wr.state(g.t), me = J.how === 'foot' ? g.astro : g.sh;
    Game.burst(g, J.how === 'foot' ? 'dust' : 'spark', x, y, J.how === 'foot' ? 2 : 4,
               { vx, vy, speed: J.how === 'foot' ? 1 : 3, dir: Math.atan2(me.y - y, me.x - x), spread: 1.6, life: 0.5, col: J.how === 'foot' ? '#c9c4e8' : undefined });
    if (g.real - J.wordT > 1.1 && J.need - J.t > 0.8) {     // hush just before the finish so SALVAGED! lands alone
      J.wordT = g.real;
      const w = WORK_WORDS[J.how];
      let wx = x, wy = y;                       // on foot the hull point is at your elbow: say it over the hull, not over the progress ring
      if (J.how === 'foot') { const [cx, cy] = wr.state(g.t), dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
        if (d > 0.05) { wx += dx / d * 1.6; wy += dy / d * 1.6; } else { wx = (x + cx) / 2; wy = (y + cy) / 2; } }
      say(g, wr, w[Math.floor(J.t * 7) % w.length], GOLD, wx, wy, 20);
    }
  }


  // ======================================================================
  //  LOOT
  // ======================================================================

  // deterministic per world seed + wreck: reloading does not re-roll anything
  function roll(g, wr) {
    const rand = World.rng(((g.w.seed | 0) + 1) * 7919 + wr.idx * 104729 + 31337), L = { ...LOOT, ...(wr.loot || {}) }, items = {};
    const between = ([a, b]) => a + Math.floor(rand() * (b - a + 1));
    const ns = between(L.scrap), np = between(L.parts), core = rand() < L.core;
    if (ns > 0) items.scrap = ns;
    if (np > 0) items.parts = np;
    if (core) items.core = 1;
    for (const k in L.extra || {}) if (ITEMS[k]) items[k] = (items[k] || 0) + L.extra[k];
    const cashRoll = rand(), cashAmt = rand(), purse = PURSES[Math.floor(rand() * PURSES.length)], bpRoll = rand();
    const cash = cashRoll < L.cash ? 5 * Math.round((L.cashMin + cashAmt * (L.cashMax - L.cashMin)) / 5) : 0;
    return { items, cash, purse, bp: bpRoll < L.bp, rand };
  }

  // a blueprint installs a free upgrade (economy), else the schematics sell to a collector
  function blueprint(g, m, rand) {
    const E = econ(), id = E ? E.randomBlueprint(g, rand) : null, name = id ? E.grant(g, id) : null;
    if (name) { m.stats.blueprints++; return { id, name, engine: !!(E.ENGINES && E.ENGINES[id]) }; }
    const cash = 50 * Math.round((300 + 300 * rand()) / 50);
    g.money += cash; m.stats.cash += cash;
    return { name: null, cash };
  }

  function complete(g, wrOrId, how) {
    const m = st(g), wr = typeof wrOrId === 'string' ? byId(g, wrOrId) : wrOrId;
    if (!wr || m.salvaged[wr.id]) return null;
    how = how || (wr.orbital ? 'ship' : 'foot');
    m.job = null; m.salvaged[wr.id] = true; m.seen[wr.id] = true;
    const L = roll(g, wr), spilled = {};
    if (how === 'foot') popLoot(g, wr, L.items);
    else stow(g, wr, L.items, spilled);
    if (L.cash) { g.money += L.cash; m.stats.cash += L.cash; }
    const bp = L.bp ? blueprint(g, m, L.rand) : null;

    // the hull gets its SALVAGED stamp, you get one gain line and a short toast; the crew log (codec) spells out the rest
    const [x, y, vx, vy] = wr.state(g.t);
    Game.burst(g, 'spark', x, y, 14, { vx, vy, speed: 5, life: 0.7 });
    const gain = (how === 'foot' ? [] : Object.entries(L.items).map(([k, q]) => `+${q} ${ITEMS[k].name.toLowerCase()}`))
      .concat(L.cash ? [`+$${L.cash}`] : [], bp && !bp.name ? [`+$${bp.cash} schematics`] : []).join('  ');
    if (gain) say(g, wr, gain, '#8ff0b0', undefined, undefined, 18);       // one friendly green: scrap grey vanishes against space
    Game.toast(g, 'SALVAGED!', GOLD);                                          // short: long toasts run under the side panels
    if (bp && bp.name) Game.toast(g, `NEW: ${bp.name.toUpperCase()}!`, '#7cf5d6');
    if (count(spilled)) Game.toast(g, 'HOLD FULL: COME BACK', '#ff9f1c');

    m.codec = { id: wr.id, t0: g.real, loot: lootLine(L, bp, spilled, how) };
    Game.log(g, `salvaged ${wr.name} (${how}): ${JSON.stringify(L.items)}${L.cash ? ` +$${L.cash}` : ''}` +
                `${bp ? (bp.name ? `, blueprint ${bp.name}` : `, schematics sold +$${bp.cash}`) : ''}`);
    Game.log(g, `crew log, ${wr.who}: "${wr.log}"`);
    if (!g.dev) Game.save(g);
    return { items: L.items, cash: L.cash, bp, spilled };
  }

  function lootLine(L, bp, spilled, how) {
    const parts = Object.entries(L.items).map(([k, q]) => `${q}× ${ITEMS[k].name.toLowerCase()}`);
    if (L.cash) parts.push(`$${L.cash} (${L.purse})`);
    if (bp) parts.push(bp.name ? `${bp.name} schematics${bp.engine ? ' (equip at a station)' : ' (installed)'}` : `schematics sold for $${bp.cash}`);
    const tail = how === 'foot' ? '  ·  grab it before you go!'
               : count(spilled) ? `  ·  hold full, the rest is ${how === 'ship' ? 'tied to' : 'lying by'} the wreck: sell, then come back` : '';
    return `LOOT: ${parts.join(' · ') || 'dust and memories'}${tail}`;
  }

  // ship salvage: straight into the hold; what does not fit floats beside the wreck (or drops beside it on the ground)
  function stow(g, wr, items, spilled) {
    for (const [item, q] of Object.entries(items)) {
      const n = Game.addCargo(g, item, q);
      if (q - n > 0) { spilled[item] = q - n; spill(g, wr, item, q - n); }
    }
  }
  const spill = (g, wr, item, q) => (wr.orbital ? floatLoot : groundLoot)(g, wr, item, q);

  //  orbital overflow hangs off the hull on cargo-net tethers.  Kinematic: it rides the wreck's rail, because the
  //  rail ignores the tides (~1 cm/s² here) that would carry a free crate tens of metres off per minute.
  function floatLoot(g, wr, item, q) {
    const [x, y] = wr.state(g.t), toward = g.sh ? Math.atan2(g.sh.y - y, g.sh.x - x) : 0;
    for (let i = 0; i < q; i++) {
      const a = toward + (Math.random() - 0.5) * 1.8, d = wr.r + 1 + 1.6 * Math.random();
      const p = Game.spawnPickup(g, { x, y, item, qty: 1 });
      Object.assign(p, { wreck: wr.id, kinematic: true, tether: { dx: d * Math.cos(a), dy: d * Math.sin(a), ph: 2 * Math.PI * Math.random() } });
      hang(wr, p, g.t);
    }
  }
  function hang(wr, p, t) {
    const T = p.tether, d = Math.hypot(T.dx, T.dy) || 1, f = 1 + TETHER_BOB * Math.sin(0.8 * t + T.ph) / d, [x, y, vx, vy] = wr.state(t);
    p.x = x + T.dx * f; p.y = y + T.dy * f; p.vx = vx; p.vy = vy; p.rest = null;
  }

  // a comic word that sticks to an orbital wreck (the core's popups stay put in space, or ride a moon)
  function say(g, wr, text, col, x, y, size) {
    const p = Game.popup(g, text, col, x, y, size);
    if (!wr.orbital || !p || typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const [cx, cy] = wr.state(g.t);
    delete p.ride;
    st(g).said.push({ p, id: wr.id, dx: p.x - cx, dy: p.y - cy });
  }

  // rummage: loot pops out of the hatch nearest the astronaut, gently enough to stay on tiny moons
  function popLoot(g, wr, items) {
    const A = g.astro, b = wr.hostBody, [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    const [hx, hy] = hullPoint(wr, g.t, A.x, A.y), ux0 = hx - bx, uy0 = hy - by, ul = Math.hypot(ux0, uy0) || 1, ux = ux0 / ul, uy = uy0 / ul;
    const vEsc = Math.sqrt(2 * b.mu / b.R), pop = Math.min(1.3, 0.3 * vEsc);
    const tx = A.x - hx, ty = A.y - hy, tl = Math.hypot(tx, ty) || 1;
    for (const [item, q] of Object.entries(items)) {
      for (let i = 0; i < q; i++) {
        const up = pop * (0.6 + 0.4 * Math.random()), side = (Math.random() - 0.5) * pop * 0.6, to = pop * 0.5;
        const p = Game.spawnPickup(g, { x: hx + ux * 0.6, y: hy + uy * 0.6, item, qty: 1,
          vx: bvx + ux * up - uy * side + tx / tl * to, vy: bvy + uy * up + ux * side + ty / tl * to });
        p.wreck = wr.id;
      }
    }
    Game.burst(g, 'dust', hx, hy, 10, { vx: bvx, vy: bvy, speed: 1.5, col: b.color[1] });
  }

  // a little pile on the ground at both ends of a crashed hull
  function groundLoot(g, wr, item, q) {
    const [bx, by, bvx, bvy] = World.bodyState(g.w, wr.hostBody, g.t);
    for (let i = 0; i < q; i++) {
      const s = (wr.hx + 1 + 2 * Math.random()) * (i % 2 ? 1 : -1), px = wr.gx + wr.ny * s, py = wr.gy - wr.nx * s;
      const th = Math.atan2(py, px), r = World.surfaceR(wr.hostBody, th) + 0.8;
      const p = Game.spawnPickup(g, { x: bx + r * Math.cos(th), y: by + r * Math.sin(th), vx: bvx, vy: bvy, item, qty: 1 });
      p.wreck = wr.id;
    }
  }

  // last session's unclaimed loot: back beside its wreck (floating, or lying on the ground)
  function respill(g, wr, items) {
    for (const [item, q] of Object.entries(items)) spill(g, wr, item, q);
  }


  // ======================================================================
  //  PER FRAME: sightings, the job, sparks, bumps
  // ======================================================================

  // orbital wrecks the ship could touch this frame (the step hook only checks these)
  //  ...and tethered loot is placed where its wreck will be when the core collects pickups after this frame's physics
  function frame(g, inp, dt, simDt) {
    const m = st(g), tEnd = g.t + (simDt || 0);
    for (const p of g.pickups) if (p.tether && p.wreck) { const wr = byId(g, p.wreck); if (wr) hang(wr, p, tEnd); }
    m.near = [];
    if (g.status !== 'flying' || !g.sh) return;
    const sh = g.sh;
    for (const wr of list(g)) {
      if (!wr.orbital) continue;
      const [x, y, vx, vy] = wr.state(g.t), reach = wr.hitR + g.S.radius + 10 + Math.hypot(sh.vx - vx, sh.vy - vy) * (simDt || 0) * 1.5;
      if (Math.hypot(sh.x - x, sh.y - y) < reach) m.near.push(wr);
    }
  }

  function step(g) {
    const m = g.mod.wrecks;
    if (!m || !m.near.length || g.status !== 'flying') return;
    for (const wr of m.near) bump(g, wr);
  }

  // the ship bounces off a derelict like off rubble (restitution S.bounce); a hard ram dents the hull
  function bump(g, wr) {
    const sh = g.sh, [x, y, vx, vy] = wr.state(g.t), dx = sh.x - x, dy = sh.y - y, d = Math.hypot(dx, dy), R = wr.hitR + g.S.radius * 0.8;
    if (d >= R) return;
    const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1, vn = (sh.vx - vx) * nx + (sh.vy - vy) * ny;
    sh.x = x + nx * (R + 0.02); sh.y = y + ny * (R + 0.02);
    if (vn >= 0) return;
    const e = g.S.bounce ?? 0.4;
    sh.vx -= (1 + e) * vn * nx; sh.vy -= (1 + e) * vn * ny;
    sh.omega += (Math.random() - 0.5) * Math.min(2, -vn);
    Game.burst(g, 'spark', x + nx * wr.hitR, y + ny * wr.hitR, 6, { vx, vy, speed: 3, life: 0.4 });
    if (-vn > BUMP_V) Game.hurtShip(g, (g.S.bumpDamage || 6) * -vn, 'CLANG!');
    else Game.popup(g, 'bonk', '#ffd166', sh.x, sh.y, 18);
  }

  function after(g, inp, dt, simDt) {
    const m = st(g);
    spot(g, m);
    if (m.job) work(g, m, simDt);
    if (simDt > 0) sparks(g, m);
    for (const p of g.pickups) if (p.wreck && p.age > LOOT_KEEP) p.age = LOOT_KEEP;
    if (m.codec && g.real - m.codec.t0 > codecLife(g, m.codec)) m.codec = null;
    if (g.navId !== m.tgt.id) m.tgt = { id: g.navId, t0: g.real };
    if (m.said.length) {
      m.said = m.said.filter((s) => g.real - s.p.t0 < 1.5 && byId(g, s.id));
      for (const s of m.said) { const [x, y] = byId(g, s.id).state(g.t); s.p.x = x + s.dx; s.p.y = y + s.dy; }
    }
  }

  // first sighting within SEE_R reveals the name (Tab shows 'Unknown signal' until then)
  function spot(g, m) {
    const me = g.astro && g.astro.on ? g.astro : g.status !== 'dead' && g.sh ? g.sh : null;
    if (!me) return;
    for (const wr of list(g)) {
      if (m.seen[wr.id]) continue;
      const [x, y] = wr.state(g.t);
      if (Math.hypot(me.x - x, me.y - y) > SEE_R) continue;
      m.seen[wr.id] = true;
      Game.log(g, `wreck spotted: ${wr.name} (${where(wr)})`);
      if (g.real > 2) Game.toast(g, `WRECK SPOTTED: ${wr.name.toUpperCase()}`, GOLD, 'wreckSeen');
    }
  }

  // live wires: now and then a dangling cable spits sparks (only near you, only before salvage);
  // a station-keeping autopilot (the Tuesday) puffs its thrusters, salvaged or not: that is what holds it on its rail
  function sparks(g, m) {
    const me = g.astro && g.astro.on ? g.astro : g.sh;
    if (!me) return;
    const due = (k, a, b) => { if (m.fx[k] == null) m.fx[k] = g.real + a * Math.random(); if (g.real < m.fx[k]) return false; m.fx[k] = g.real + a + b * Math.random(); return true; };
    for (const wr of list(g)) {
      const spots = m.salvaged[wr.id] ? [] : SHAPE[wr.kind].sparks;
      if (wr.keeper && due('puff:' + wr.id, 2.5, 2)) {           // a steady 2.5-4.5 s beat: the autopilot never sleeps
        const [x, y, vx, vy] = wr.state(g.t);
        if (Math.hypot(me.x - x, me.y - y) < 300) puff(g, wr, vx, vy);
      }
      if (!spots.length || !due(wr.id, 1.5, 3.5)) continue;
      const [x, y, vx, vy] = wr.state(g.t);
      if (Math.hypot(me.x - x, me.y - y) > 300) continue;
      const [sx, sy] = spots[Math.floor(Math.random() * spots.length)], [px, py] = toWorld(wr, g.t, sx * wr.k, sy * wr.k);
      if (!wr.orbital) {
        const [bx, by] = World.bodyState(g.w, wr.hostBody, g.t);
        if (Math.hypot(px - bx, py - by) < World.surfaceR(wr.hostBody, Math.atan2(py - by, px - bx))) continue;   // that spot is underground
      }
      Game.burst(g, 'spark', px, py, 4 + Math.floor(3 * Math.random()), { vx, vy, speed: 2.5, life: 0.45 });
    }
  }

  // one RCS puff from a pod near either end of the hull, blowing outward
  function puff(g, wr, vx, vy) {
    const end = Math.random() < 0.5 ? 1 : -1, side = Math.random() < 0.5 ? 1 : -1;
    const [px, py] = toWorld(wr, g.t, end * wr.hx * 0.7, side * wr.hy * 1.05);
    Game.burst(g, 'puff', px, py, 4, { vx, vy, speed: 5, dir: wr.ang(g.t) + side * Math.PI / 2, spread: 0.35, life: 0.35 });
  }

  function warpLimit(g) {
    const m = g.mod.wrecks;
    if (!m) return null;
    if (m.job) return { max: 4, why: 'salvaging' };
    if (g.status !== 'flying' || g.mode !== 'ship') return null;
    for (const wr of list(g)) {
      if (!wr.orbital || m.salvaged[wr.id]) continue;
      if (info(g, wr).d < NEAR_WARP) return { max: 4, why: `near ${wr.name}` };
    }
    return null;
  }


  // ======================================================================
  //  PROMPTS, TARGETS, HINTS
  // ======================================================================

  function interactions(g) {
    const m = g.mod.wrecks;
    if (!m || g.ui || m.job) return null;
    const out = [];
    if (g.astro && g.astro.on) {
      for (const wr of list(g)) {
        if (wr.orbital || m.salvaged[wr.id]) continue;
        const d = hullDist(wr, g.t, g.astro.x, g.astro.y);
        if (d < RUMMAGE_R) out.push({ key: 'KeyF', dist: Math.max(0, d), col: GOLD, text: `Rummage through ${wr.name}`, act: (g2) => start(g2, wr, 'foot') });
      }
      return out;
    }
    if (g.mode !== 'ship' || g.status === 'dead') return null;
    for (const wr of list(g)) {
      if (m.salvaged[wr.id]) continue;
      if (wr.orbital && g.status === 'flying') {
        const q = info(g, wr);
        if (q.d >= SALVAGE_R) continue;
        if (q.v < SALVAGE_V) out.push({ key: 'KeyF', dist: Math.max(0, q.d), col: GOLD, text: `Salvage ${wr.name}`, act: (g2) => start(g2, wr, 'ship') });
        else out.push({ key: 'KeyF', dist: Math.max(0, q.d), col: '#ffb36b', text: `Slow under ${SALVAGE_V} m/s to salvage (now ${q.v.toFixed(1)})`, act: tooFast });
      } else if (!wr.orbital && !evaOn() && g.status === 'landed' && g.landedOn === wr.hostBody) {
        const q = info(g, wr);
        if (q.d < DRILL_R) out.push({ key: 'KeyF', dist: Math.max(0, q.d), col: GOLD, text: `Drill ${wr.name} open`, act: (g2) => start(g2, wr, 'drill') });
      }
    }
    return out;
  }

  function navTargets(g) {
    const m = g.mod.wrecks;
    if (!m) return [];
    return list(g).map((wr) => ({ id: 'wreck:' + wr.id, name: navName(g, wr), r: wr.r, kind: 'wreck', wreck: wr.id, state: wr.state,
                                  col: !m.seen[wr.id] ? SIGNAL : m.salvaged[wr.id] ? DIM : GOLD }));
  }
  const targeted = (g) => (g.navId && g.navId.startsWith('wreck:') ? byId(g, g.navId.slice(6)) : null);

  function hint(g) {
    const m = g.mod.wrecks;
    if (!m || g.ui) return null;
    if (m.job) return { pri: 64, text: jobHint(g, m.job) };
    if (g.astro && g.astro.on) return footHint(g, m);
    if (g.mode !== 'ship' || g.status === 'dead') return null;
    const here = g.status === 'landed' && g.landedOn ? landedHint(g, m) : g.status === 'flying' ? flyHint(g, m) : null;
    return here || targetHint(g, m);
  }

  function jobHint(g, J) {
    const wr = byId(g, J.id), pct = Math.floor(100 * J.t / J.need), name = wr ? wr.name : 'the wreck';
    if (J.how === 'foot') return `Rummaging through ${name}... ${pct}%. Stay close.`;
    if (J.how === 'drill') return `Drilling ${name} open... ${pct}%. Stay put.`;
    return `Cutting ${name} open... ${pct}%. Hold steady: within ${KEEP_R} m, under ${KEEP_V} m/s.`;
  }

  function nearestCrashed(g, m, x, y, b) {
    let best = null;
    for (const wr of list(g)) {
      if (wr.orbital || m.salvaged[wr.id] || (b && wr.hostBody !== b)) continue;
      const d = hullDist(wr, g.t, x, y);
      if (!best || d < best.d) best = { wr, d };
    }
    return best;
  }

  function footHint(g, m) {
    const A = g.astro, nb = nearestCrashed(g, m, A.x, A.y);
    if (!nb || nb.d > 15) return null;
    if (nb.d < RUMMAGE_R) return { pri: 47, text: `Press F to rummage through ${nb.wr.name}.` };
    return { pri: 40, text: `${nb.wr.name}: ${nb.d.toFixed(0)} m away. Walk up to it and press F to rummage.` };
  }

  function landedHint(g, m) {
    const nb = nearestCrashed(g, m, g.sh.x, g.sh.y, g.landedOn);
    if (!nb || nb.d > 80) return null;
    const name = nb.wr.name;
    if (evaOn()) return { pri: 34, text: `${name} lies ${Math.max(0, nb.d).toFixed(0)} m away. Press E to step out, walk over and press F to rummage.` };
    if (info(g, nb.wr).d < DRILL_R) return { pri: 40, text: `Press F to drill ${name} open with the ship.` };
    return { pri: 34, text: `Land within ${DRILL_R} m of ${name} to drill it open.` };
  }

  // close to an orbital wreck: how to match speed and salvage
  function flyHint(g, m) {
    const tg = targeted(g);
    let wr = tg && tg.orbital && !m.salvaged[tg.id] ? tg : null, q = wr && info(g, wr);
    if (!wr) {
      for (const w of list(g)) {
        if (!w.orbital || m.salvaged[w.id]) continue;
        const qq = info(g, w);
        if (qq.d < HINT_R && (!q || qq.d < q.d)) { wr = w; q = qq; }
      }
    }
    if (!wr || q.d >= HINT_R) return null;
    const name = wr.name;
    if (tg !== wr) return { pri: 38, text: `Wreck nearby: ${name}. Tab (or click it) to target it, then match speed at the teal TGT markers.` };
    if (q.d < SALVAGE_R && q.v < SALVAGE_V) return { pri: 48, text: `In range and slow: press F to salvage ${name}!` };
    if (q.v >= SALVAGE_V) return { pri: 46, text: `Relative speed ${q.v.toFixed(1)} m/s: point at the teal X (target retrograde) and burn until it reads under ${SALVAGE_V}.` };
    return { pri: 44, text: `Speed matched. Close in: ${q.d.toFixed(0)} m to go (salvage within ${SALVAGE_R} m). Point at ${name}, tap W, brake at the teal X.` };
  }

  // a wreck you just targeted: its physics fact for a few seconds, then how to get there
  function targetHint(g, m) {
    const tg = targeted(g);
    if (!tg) return null;
    if (g.real - m.tgt.t0 < FACT_T) {
      if (!m.seen[tg.id]) return { pri: 32, text: `Unknown signal (${where(tg)}). Fly within ${SEE_R} m to identify it.` };
      if (m.salvaged[tg.id]) return { pri: 32, text: `${tg.name}: already stripped. Nothing left but the stamp${tg.orbital ? '' : ' and the crater'}.` };
      return { pri: 32, text: tg.fact(tg, g.w) };
    }
    if (m.salvaged[tg.id] || g.status !== 'flying') return null;
    return { pri: 39, text: tg.orbital ? chase(g, tg) : `${tg.name} lies on ${tg.hostBody.name}, inside the target brackets. ${getIn()}` };
  }

  // rendezvous coaching in plain words (the same moves as for a station)
  function chase(g, wr) {
    const ap = g.approach, o = g.orb, host = wr.hostBody, shrink = 'watch the closest-approach diamond shrink.';
    if (ap && ap.tg.id === 'wreck:' + wr.id && ap.i >= 0 && ap.d < 60)
      return `Closest approach ${Game.fmtDist(ap.d)} in ${Math.max(0, ap.t - g.t).toFixed(0)} s. Coast there (warp is fine), then brake at the TGT marker.`;
    if (host === g.ref && o && o.E < 0) {
      if ((wr.dir || 1) * o.h < 0) return `${wr.name} goes round ${host.name} the other way! Climb a little, then burn retrograde through zero to flip your orbit.`;
      const rp = o.a * (1 - o.e), ra = o.a * (1 + o.e);
      if (ra < wr.a - 10) return `Burn prograde at the yellow marker to raise your orbit to ${wr.name}'s; ${shrink}`;
      if (rp > wr.a + 10) return `Burn retrograde at the pink marker to lower your orbit to ${wr.name}'s; ${shrink}`;
      if (Math.abs(o.a - wr.a) > 0.15 * wr.a || o.e > 0.12) return `Your orbit crosses ${wr.name}'s. Small prograde or retrograde taps change when you meet it.`;
      const [x, y] = wr.state(g.t), [hx, hy] = World.bodyState(g.w, host, g.t);
      const da = Math.atan2(y - hy, x - hx) - Math.atan2(g.sh.y - hy, g.sh.x - hx), ahead = (wr.dir || 1) * Math.atan2(Math.sin(da), Math.cos(da));
      const deg = Math.abs(ahead * 180 / Math.PI).toFixed(0);
      return ahead > 0 ? `${wr.name} is ${deg}° ahead. Lower orbits are faster: a short retrograde burn lets you catch up.`
                       : `${wr.name} is ${deg}° behind. Higher orbits are slower: a short prograde burn lets it catch up.`;
    }
    if (host !== g.ref && host.par) return `${wr.name} circles ${host.name}. Get to ${host.name} first (Tab to target it), then come back to this target.`;
    return `Prograde (yellow) climbs, retrograde (pink) drops; ${shrink}`;
  }

  function hudRows(g) {
    const m = g.mod.wrecks;
    if (!m || !m.job) return null;
    const wr = byId(g, m.job.id);
    return [{ label: m.job.how === 'foot' ? 'RUMMAGING' : m.job.how === 'drill' ? 'DRILLING' : 'SALVAGING', val: `${Math.floor(100 * m.job.t / m.job.need)}%`, col: '#c25f1c' }];
  }


  // ======================================================================
  //  ART  —  world space, y up.  Each wreck is drawn in its own frame
  //  (x along the hull, y "up" off it) in art units: 10 units = its size.
  // ======================================================================

  function drawWorld(g, kit) {
    const m = g.mod.wrecks;
    if (!m) return;
    const view = kit.viewRect(30), zoom = kit.cam.zoom;
    for (const p of g.pickups) if (p.tether && p.x > view[0] && p.x < view[2] && p.y > view[1] && p.y < view[3]) { tetherLine(g, kit, p); crate(g, kit, p); }
    for (const wr of list(g)) {
      const [x, y] = wr.state(g.t), ext = wr.r + 8;
      if (x + ext < view[0] || x - ext > view[2] || y + ext < view[1] || y - ext > view[3]) continue;
      const rs = wr.r * zoom, alpha = Math.max(0, Math.min(1, (rs - 0.7 * ICON_PX) / (0.6 * ICON_PX)));
      if (alpha <= 0) continue;
      const salv = !!m.salvaged[wr.id], c = kit.ctx;
      c.save(); c.globalAlpha = alpha;
      if (!wr.orbital) groove(g, kit, wr);
      drawWreck(g, kit, wr, x, y, salv, rs);
      if (!wr.orbital) dirt(g, kit, wr);
      c.restore();
    }
    if (m.job && m.job.how !== 'foot') drawBeam(g, kit, m.job);
  }

  function drawWreck(g, kit, wr, x, y, salv, rs) {
    const c = kit.ctx, a = wr.ang(g.t), k = wr.k, px = kit.px();
    c.save();
    if (!wr.orbital) clipOutside(c, wr.hostBody, ...World.bodyState(g.w, wr.hostBody, g.t));
    c.translate(x, y); c.rotate(a); c.scale(k, k);
    const L = kit.LIGHT, ca = Math.cos(a), sa = Math.sin(a);
    const P = { c, L: [L[0] * ca + L[1] * sa, -L[0] * sa + L[1] * ca], lw: 2.5 * px / k, px: px / k, t: g.real, salv, rs,
                detail: rs > DETAIL_PX, wr, g, talk: g.mod.wrecks.codec && g.mod.wrecks.codec.id === wr.id };
    ART[wr.kind](P, wr.art);
    c.restore();
  }

  // the body's outline as a hole in a big rectangle: hulls drawn through this clip vanish underground
  function clipOutside(c, b, bx, by) {
    const K = b.out.length, big = b.R * 4;
    c.beginPath(); c.rect(bx - big, by - big, 2 * big, 2 * big);
    for (let i = 0; i <= K; i++) {
      const th = i / K * 2 * Math.PI, r = b.R * b.out[i % K];
      i ? c.lineTo(bx + r * Math.cos(th), by + r * Math.sin(th)) : c.moveTo(bx + r * Math.cos(th), by + r * Math.sin(th));
    }
    c.closePath(); c.clip('evenodd');
  }

  // ---------------- crash site: the furrow it ploughed, dirt piled on the hull, spilled crates ----------------

  function groundPt(g, wr, s, depth = 0) {
    const b = wr.hostBody, px = wr.gx + wr.ny * s, py = wr.gy - wr.nx * s, th = Math.atan2(py, px), r = World.surfaceR(b, th) - depth;
    const [bx, by] = World.bodyState(g.w, b, g.t);
    return [bx + r * Math.cos(th), by + r * Math.sin(th), th];
  }

  function groove(g, kit, wr) {
    const c = kit.ctx, half = wr.hx * Math.cos(wr.tilt || 0), dir = wr.from || 1, len = wr.hx * 2.4, depth = Math.max(0.3, wr.hy * 0.75 * wr.bury * 2), N = 16;
    const inner = [];
    c.beginPath();
    for (let i = 0; i <= N; i++) { const s = dir * (half * 0.5 + len * i / N), p = groundPt(g, wr, s, -0.02); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
    for (let i = N; i >= 0; i--) { const f = i / N, p = groundPt(g, wr, dir * (half * 0.5 + len * f), depth * (1 - f * f)); inner.push(p); c.lineTo(p[0], p[1]); }
    c.closePath(); c.fillStyle = backwall(wr.hostBody); c.fill();
    c.beginPath(); inner.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.strokeStyle = INK; c.lineWidth = 2.5 * kit.px(); c.lineJoin = 'round'; c.stroke();
  }
  // the colour the terrain grid uses for dug-out ground (body shade mixed into ink)
  const backwall = (b) => { const h = b.color[1], f = (k) => Math.round(parseInt(h.slice(k, k + 2), 16) * 0.38 + [27, 20, 51][(k - 1) / 2] * 0.62); return `rgb(${f(1)},${f(3)},${f(5)})`; };

  function dirt(g, kit, wr) {
    const c = kit.ctx, b = wr.hostBody, px = kit.px(), Lt = kit.LIGHT;
    for (const cr of wr.site.crates) {
      const [x, y, th] = groundPt(g, wr, cr.s, -cr.r * 0.55), a = th - Math.PI / 2 + cr.tilt;
      c.save(); c.translate(x, y); c.rotate(a); c.scale(cr.r, cr.r);
      const P = { c, L: [Lt[0] * Math.cos(a) + Lt[1] * Math.sin(a), -Lt[0] * Math.sin(a) + Lt[1] * Math.cos(a)], lw: 2.5 * px / cr.r, px: px / cr.r };
      toon(P, () => rr(c, -1, -1, 2, 2, 0.2), ['#ff9f43', '#c25f1c', '#ffd8a6'], [-1, -1, 1, 1]);
      poly(c, [[-0.55, -0.4], [0.55, -0.4], [0, 0.55]]); c.fillStyle = '#4cc9f0'; c.fill(); ink(P, P.lw * 0.7);
      c.restore();
    }
    for (const lp of wr.site.lumps) {
      const [x, y] = groundPt(g, wr, lp.s, lp.r * 0.35), r = Math.max(lp.r, 2.5 * px);
      kit.toonBlob(LUMP, x, y, r, lp.s, b.color, 2.2 * px);
    }
  }
  const LUMP = [1, 1.08, 0.92, 1.05, 0.88, 1.1, 0.95, 1.02, 0.9];

  // ---------------- cargo-net tether from the hull to a hanging crate (drawn before the hull, so it tucks under) ----------------

  function tetherLine(g, kit, p) {
    const wr = byId(g, p.wreck);
    if (!wr || wr.r * kit.cam.zoom < ICON_PX) return;
    const c = kit.ctx, px = kit.px(), [hx, hy] = hullPoint(wr, g.t, p.x, p.y), [cx, cy] = wr.state(g.t);
    const dx = p.x - hx, dy = p.y - hy, d = Math.hypot(dx, dy);
    if (d < 0.3) return;
    const pr = Math.max(0.35, 6 * px), end = Math.max(0, d - pr) / d;
    const sag = 0.18 * d * Math.sin(0.8 * g.t + p.tether.ph), mx = (hx + p.x) / 2 - dy / d * sag, my = (hy + p.y) / 2 + dx / d * sag;
    const path = () => { c.beginPath(); c.moveTo(hx * 0.4 + cx * 0.6, hy * 0.4 + cy * 0.6); c.quadraticCurveTo(mx, my, hx + dx * end, hy + dy * end); };
    c.lineCap = 'round';
    path(); c.strokeStyle = INK; c.lineWidth = 3.4 * px; c.stroke();
    path(); c.strokeStyle = '#c9c4e8'; c.lineWidth = 1.4 * px; c.stroke();
  }

  // a tethered loot crate: bigger than a loose ore chunk and strapped, so it reads as 'yours, come back for it'
  function crate(g, kit, p) {
    const wr = byId(g, p.wreck);
    if (!wr || wr.r * kit.cam.zoom < ICON_PX) return;
    const c = kit.ctx, px = kit.px(), s = Math.max(0.35, 6 * px), col = (ITEMS[p.item] || {}).col || '#c9c4e8';
    c.save(); c.translate(p.x, p.y); c.rotate(0.25 * Math.sin(0.8 * g.t + p.tether.ph) + p.tether.ph);
    if (kit.roundRect) kit.roundRect(-s, -s, 2 * s, 2 * s, 0.3 * s); else { c.beginPath(); c.rect(-s, -s, 2 * s, 2 * s); }
    c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = 2 * px; c.stroke();
    c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(0, -s); c.lineTo(0, s);
    c.strokeStyle = 'rgba(31,26,51,0.55)'; c.lineWidth = 1.2 * px; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(-0.75 * s, -0.75 * s, 0.4 * s, 0.4 * s);
    c.restore();
  }

  // ---------------- salvage beam: a cutting line from the ship to the hull ----------------

  function drawBeam(g, kit, J) {
    const wr = byId(g, J.id);
    if (!wr || g.status === 'dead') return;
    const c = kit.ctx, px = kit.px(), sh = g.sh, [hx, hy] = hullPoint(wr, g.t, sh.x, sh.y), fl = 0.6 + 0.4 * Math.sin(g.real * 40);
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,209,102,0.28)'; c.lineWidth = Math.max(0.8, 10 * px);
    c.beginPath(); c.moveTo(sh.x, sh.y); c.lineTo(hx, hy); c.stroke();
    c.strokeStyle = GOLD; c.lineWidth = Math.max(0.15, 3 * px); c.setLineDash([7 * px, 5 * px]); c.lineDashOffset = -g.real * 40 * px;
    c.stroke(); c.setLineDash([]);
    glow(c, hx, hy, Math.max(1.2, 16 * px) * fl, '255,240,180', 0.9);
    c.beginPath(); c.arc(hx, hy, Math.max(0.25, 3 * px), 0, 2 * Math.PI); c.fillStyle = '#ffffff'; c.fill();
  }

  // ---------------- toon helpers (flat base, shadow band away from the light, highlight, ink) ----------------

  function ink(P, w = P.lw) { const c = P.c; c.strokeStyle = INK; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function poly(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }

  // box = [x0, y0, x1, y1] sizes the shadow band and places the highlight; inner() draws inside the clip, under the ink
  function toon(P, path, cols, box, inner) {
    const c = P.c, w = box[2] - box[0], h = box[3] - box[1], m = Math.min(w, h), sk = m * 0.22;
    path(); c.fillStyle = cols[1]; c.fill();
    c.save(); path(); c.clip();
    c.save(); c.translate(P.L[0] * sk, P.L[1] * sk); path(); c.fillStyle = cols[0]; c.fill(); c.restore();
    if (cols[2]) {
      const hx = (box[0] + box[2]) / 2 + P.L[0] * (w / 2 - m * 0.3), hy = (box[1] + box[3]) / 2 + P.L[1] * (h / 2 - m * 0.3);
      c.beginPath(); c.ellipse(hx, hy, m * 0.15, m * 0.075, Math.atan2(P.L[1], P.L[0]) + Math.PI / 2, 0, 2 * Math.PI);
      c.fillStyle = cols[2]; c.fill();
    }
    if (inner) inner();
    c.restore();
    path(); ink(P);
  }

  // draw fn(Q) in a frame turned by a about (ox, oy) and nudged by (dx, dy); Q's light turns to match
  function turned(P, ox, oy, a, fn, dx = 0, dy = 0) {
    const c = P.c, s = Math.sin(a), co = Math.cos(a);
    c.save(); c.translate(ox + dx, oy + dy); c.rotate(a); c.translate(-ox, -oy);
    fn({ ...P, L: [P.L[0] * co + P.L[1] * s, -P.L[0] * s + P.L[1] * co] });
    c.restore();
  }
  const xf = (ox, oy, a, dx, dy) => (x, y) => {           // the point map turned() applies
    const c = Math.cos(a), s = Math.sin(a), u = x - ox, v = y - oy;
    return [ox + dx + u * c - v * s, oy + dy + u * s + v * c];
  };

  function glow(c, x, y, R, rgb, a) {
    const gr = c.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, R, 0, 2 * Math.PI); c.fill();
  }

  // world-space text (the frame is y-up, so flip it back)
  function wtext(P, str, x, y, size, col, rot = 0, outline = 0) {
    const c = P.c, k = size / 20;
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, -k);
    c.font = `700 20px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (outline) { c.lineWidth = outline / k; c.strokeStyle = INK; c.lineJoin = 'round'; c.strokeText(str, 0, 0); }
    c.fillStyle = col; c.fillText(str, 0, 0);
    c.restore();
  }

  // ---------------- wreck parts ----------------

  function ribs(P, x, y0, y1, bulge) {
    const c = P.c, path = () => { c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + bulge, (y0 + y1) / 2, x, y1); };
    c.lineCap = 'round';
    path(); c.strokeStyle = INK; c.lineWidth = 0.55 + 2 * P.lw; c.stroke();
    path(); c.strokeStyle = STEEL[0]; c.lineWidth = 0.55; c.stroke();
  }

  // a loose cable floating between two points (sways), with a coloured core inside a fat ink line
  function cable(P, x0, y0, x1, y1, sag, col, ph, plug) {
    const c = P.c, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const s = sag * (1 + 0.3 * Math.sin(P.t * 0.9 + ph)), cx = mx - dy / l * s, cy = my + dx / l * s;
    const path = () => { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); };
    c.lineCap = 'round';
    path(); c.strokeStyle = INK; c.lineWidth = 0.32 + 2 * P.lw; c.stroke();
    path(); c.strokeStyle = col; c.lineWidth = 0.32; c.stroke();
    if (plug) { c.beginPath(); c.arc(x1, y1, 0.32, 0, 2 * Math.PI); c.fillStyle = '#ffe066'; c.fill(); ink(P, P.lw * 0.8); }
  }

  // the emergency light still blinks after all these years (off once salvaged)
  function beacon(P, x, y, ph = 0) {
    const c = P.c, onNow = !P.salv && ((P.t + ph) % 1.3) < 0.24, r = Math.max(0.45, 2.4 * P.px);
    c.beginPath(); c.arc(x, y, r * 1.2, 0, Math.PI); c.closePath(); c.fillStyle = STEEL[1]; c.fill(); ink(P, P.lw * 0.8);
    if (onNow) glow(c, x, y + r * 0.7, Math.max(3, 18 * P.px), '255,70,90', 0.75);
    c.beginPath(); c.arc(x, y + r * 0.7, r * 0.75, 0, 2 * Math.PI);
    c.fillStyle = onNow ? '#ff4d6d' : P.salv ? '#4a4060' : '#8a2f48'; c.fill(); ink(P, P.lw * 0.7);
  }

  // cockpit window; face: 'x' (out cold) | 'patch' (pirate) | null
  function porthole(P, x, y, r, face) {
    const c = P.c, lit = !P.salv;
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fillStyle = lit ? '#7fe0ff' : DARK; c.fill();
    if (lit) { c.beginPath(); c.arc(x + P.L[0] * r * 0.45, y + P.L[1] * r * 0.45, r * 0.26, 0, 2 * Math.PI); c.fillStyle = '#ffffff'; c.fill(); }
    c.beginPath(); c.moveTo(x + r * 0.95, y - r * 0.2); c.lineTo(x + r * 0.45, y - r * 0.05); c.lineTo(x + r * 0.25, y - r * 0.45); c.lineTo(x - r * 0.1, y - r * 0.35);
    c.strokeStyle = lit ? 'rgba(255,255,255,0.9)' : '#5a4f74'; c.lineWidth = Math.max(0.12, P.lw * 0.6); c.stroke();
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); ink(P);
    if (!lit || !face) return;
    const s = r * 0.2, gap = r * 0.38, lw = Math.max(P.lw * 0.9, r * 0.12);
    for (const sx of [-1, 1]) {
      const ex = x + sx * gap, ey = y - r * 0.05;
      if (face === 'patch' && sx < 0) continue;
      c.beginPath(); c.moveTo(ex - s, ey - s); c.lineTo(ex + s, ey + s); c.moveTo(ex - s, ey + s); c.lineTo(ex + s, ey - s); ink(P, lw);
    }
    if (face === 'patch') {
      c.beginPath(); c.moveTo(x - r * 0.95, y + r * 0.3); c.lineTo(x + r * 0.95, y + r * 0.55); ink(P, lw);
      c.beginPath(); c.ellipse(x - gap, y - r * 0.05, r * 0.3, r * 0.26, 0, 0, 2 * Math.PI); c.fillStyle = INK; c.fill();
    }
  }

  function scorch(P, spots) {
    if (!P.detail) return;
    const c = P.c;
    c.fillStyle = 'rgba(27,20,51,0.22)';
    for (const [x, y, r] of spots) {
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * 2 * Math.PI, rr2 = r * (0.85 + 0.12 * Math.sin(2 * a + x) + 0.07 * Math.sin(3 * a + y));
        i ? c.lineTo(x + rr2 * Math.cos(a), y + rr2 * Math.sin(a) * 0.7) : c.moveTo(x + rr2, y);
      }
      c.closePath(); c.fill();
    }
  }

  // a panel the salvagers cut out: dark hole, frame ribs, dashed cut line
  function hole(P, x, y, w, h) {
    const c = P.c;
    rr(c, x, y, w, h, Math.min(w, h) * 0.2); c.fillStyle = DARK; c.fill();
    c.save(); c.clip();
    c.strokeStyle = '#5a4f74'; c.lineWidth = w * 0.09;
    for (const f of [0.33, 0.66]) { c.beginPath(); c.moveTo(x + w * f, y); c.lineTo(x + w * f, y + h); c.stroke(); }
    c.restore();
    rr(c, x, y, w, h, Math.min(w, h) * 0.2); c.setLineDash([P.lw * 1.4, P.lw]); ink(P, P.lw * 0.75); c.setLineDash([]);
  }

  // red rubber stamp, slightly crooked
  function stampIt(P, x, y, rot, text, size = 1.3) {
    if (size / P.px < 5) return;                                  // smaller than ~5 px: unreadable, skip
    const c = P.c;
    c.save(); c.font = `700 20px ${FONT}`;
    const w = c.measureText(text).width * size / 20 + size * 1.3, h = size * 1.75;
    c.translate(x, y); c.rotate(rot); c.globalAlpha *= 0.9;
    rr(c, -w / 2, -h / 2, w, h, size * 0.3); c.strokeStyle = STAMP; c.lineWidth = size * 0.2; c.stroke();
    rr(c, -w / 2 + size * 0.25, -h / 2 + size * 0.25, w - size * 0.5, h - size * 0.5, size * 0.2); c.lineWidth = size * 0.08; c.stroke();
    wtext(P, text, 0, -size * 0.04, size, STAMP);
    c.restore();
  }

  function cells(P, x, y, w, h) {
    const c = P.c;
    c.strokeStyle = 'rgba(168,192,255,0.55)'; c.lineWidth = Math.max(0.08, P.lw * 0.45);
    c.beginPath();
    for (let i = 1; i < Math.round(w / 0.75); i++) { const xx = x + w * i / Math.round(w / 0.75); c.moveTo(xx, y); c.lineTo(xx, y + h); }
    c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2);
    c.stroke();
  }

  // ---------------- the six kinds of wreck ----------------

  const ART = { hauler, probe, pirate, pod, lander, prospector };

  // a freighter broken in two: ribs and cables in the gap, the rear half drifting off at an angle
  function hauler(P, o) {
    const c = P.c, cols = o.cols || STEEL, salv = P.salv, bites = o.bites || [];
    const rearT = [-0.8, 0, -0.24, -1.1, -0.9], R = xf(...rearT);
    const front = () => {
      c.beginPath(); c.moveTo(0.9, -3); c.lineTo(6, -3); c.quadraticCurveTo(9.7, -3, 10, 0); c.quadraticCurveTo(9.7, 3, 6, 3);
      for (const [bx, br] of bites.filter((b) => b[0] > 0).sort((a, b) => b[0] - a[0])) { c.lineTo(bx + br, 3); c.arc(bx, 3, br, 0, Math.PI, true); }
      c.lineTo(0.9, 3); c.lineTo(1.8, 2.1); c.lineTo(0.7, 1.1); c.lineTo(1.6, 0.1); c.lineTo(0.5, -0.9); c.lineTo(1.4, -2.0); c.closePath();
    };
    const rear = () => {
      c.beginPath(); c.moveTo(-0.6, 3);
      for (const [bx, br] of bites.filter((b) => b[0] < 0).sort((a, b) => b[0] - a[0])) { c.lineTo(bx + br, 3); c.arc(bx, 3, br, 0, Math.PI, true); }
      c.lineTo(-8, 3); c.quadraticCurveTo(-9.4, 3, -9.4, 1.6); c.lineTo(-9.4, -1.6); c.quadraticCurveTo(-9.4, -3, -8, -3); c.lineTo(-0.6, -3);
      c.lineTo(-1.5, -2.1); c.lineTo(-0.5, -1.2); c.lineTo(-1.3, -0.2); c.lineTo(-0.4, 0.8); c.lineTo(-1.4, 1.7); c.lineTo(-0.6, 2.4); c.closePath();
    };
    const stripe = (Q) => { c.fillStyle = o.stripe || GOLD; c.fillRect(-12, -1.5, 24, 1); c.beginPath(); c.moveTo(-12, -1.5); c.lineTo(12, -1.5); c.moveTo(-12, -0.5); c.lineTo(12, -0.5); ink(Q, Q.lw * 0.6); };

    if (P.detail) { ribs(P, 0.2, -2.7, 2.7, -0.5); ribs(P, -0.6, -2.2, 0.8, 0.4); }

    turned(P, rearT[0], rearT[1], rearT[2], (Q) => {
      if (P.detail) { ribs(Q, 0.3, -2.8, 2.5, 0.5); ribs(Q, 1.1, -1.4, 2.0, -0.35); }
      toon(Q, () => poly(c, [[-9.2, 1.7], [-11.2, 2.7], [-11.2, -2.7], [-9.2, -1.7]]), STEEL, [-11.2, -2.7, -9.2, 2.7]);
      if (o.box && !salv) toon(Q, () => rr(c, -7.8, 2.4, 5.4, 2.6, 0.45), o.box, [-7.8, 2.4, -2.4, 5], () => {
        c.beginPath(); for (const sx of [-6.4, -3.8]) { c.moveTo(sx, 2.4); c.lineTo(sx, 5); } ink(Q, Q.lw * 0.6);
      });
      toon(Q, rear, cols, [-9.4, -3, -0.6, 3], () => {
        stripe(Q); scorch(Q, [[-2.2, -0.8, 1.4], [-3.6, 1.9, 0.9], [-7.4, -2.2, 0.8]]);
        if (salv) hole(Q, -7.2, -1.2, 3, 2.4);
        else if (Q.detail) { c.fillStyle = INK; for (const [sx, sy] of [[-8.6, 2.2], [-8.6, -2.2]]) { c.beginPath(); c.arc(sx, sy, 0.22, 0, 2 * Math.PI); c.fill(); } }
      });
      if (salv && o.box) { c.beginPath(); c.moveTo(-6.4, 3); c.lineTo(-6.2, 3.7); c.moveTo(-3.8, 3); c.lineTo(-4.1, 3.6); ink(Q, Q.lw); }
      if (salv) stampIt(Q, -4.6, 0.4, 0.16, P.wr.stamp);
    }, rearT[3], rearT[4]);

    if (o.scope && !salv) {
      toon(P, () => rr(c, 1.8, 2.3, 6.6, 2.4, 1), ['#ffffff', '#c4bfe0', null], [1.8, 2.3, 8.4, 4.7]);
      c.beginPath(); c.ellipse(8.4, 3.5, 0.55, 1.25, 0, 0, 2 * Math.PI); c.fillStyle = DARK; c.fill(); ink(P);
      c.beginPath(); c.arc(8.4, 3.75, 0.18, 0, 2 * Math.PI); c.fillStyle = '#fff6e0'; c.fill();
    }
    toon(P, front, cols, [0.5, -3, 10, 3], () => {
      stripe(P); scorch(P, [[2.4, 1.6, 1.3], [3.1, -1.9, 1.0], [8.6, -1.6, 0.7]]);
      if (salv) hole(P, 2.6, -2.4, 2.4, 1.8);
      porthole(P, 6.3, 0.75, 1.55, 'x');
    });
    for (const [bx, br] of bites) {                                   // tooth marks around each bite
      const host = bx > 0 ? null : R;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI + (i + 0.5) / 4 * Math.PI, p = [bx + br * 1.05 * Math.cos(a), 3 + br * 1.05 * Math.sin(a)], [x, y] = host ? host(...p) : p;
        c.beginPath(); c.arc(x, y, 0.13, 0, 2 * Math.PI); c.fillStyle = INK; c.fill();
      }
    }
    c.beginPath(); c.moveTo(8.3, 2.4); c.lineTo(8.9, 4.2); c.lineTo(10.1, 4.6); ink(P, P.lw + 0.25);
    c.beginPath(); c.arc(10.1, 4.6, 0.38, 0, 2 * Math.PI); c.fillStyle = STEEL[0]; c.fill(); ink(P, P.lw * 0.8);
    if (P.detail) {
      cable(P, 1.2, 1.7, ...R(-1.0, 1.5), 0.9, '#ff5d5d', 0);
      cable(P, 1.0, -0.4, ...R(-0.9, -0.7), -0.8, '#ffd166', 1.7);
      cable(P, 1.3, -2.3, 0.2, -5.0, 0.9, '#4cc9f0', 3.1, true);
    }
    beacon(P, 3.6, 3.0);
    if (salv) stampIt(P, 5.2, -1.3, -0.1, P.wr.stamp, 1.1);
  }

  // a cubesat with an intern's googly-eye sticker; one wing bent, one snapped off and drifting
  function probe(P) {
    const c = P.c, salv = P.salv, FOIL = ['#ffd166', '#c9962e', '#fff3c4'];
    const panel = (Q, x, y, w, h) => toon(Q, () => rr(c, x, y, w, h, 0.2), CELLS, [x, y, x + w, y + h], () => cells(Q, x, y, w, h));
    if (!salv) turned(P, -8.4, 1.8, 0.7, (Q) => toon(Q, () => poly(c, [[-9.8, 0.6], [-7.2, 0.6], [-6.8, 1.4], [-7.3, 2.1], [-7, 3], [-9.8, 3]]),
                                                      CELLS, [-9.8, 0.6, -6.8, 3], () => cells(Q, -9.8, 0.6, 3, 2.4)));
    c.beginPath(); c.moveTo(-3.4, 0); c.lineTo(3.6, 0); ink(P, P.lw + 0.35);
    toon(P, () => poly(c, [[-3.2, -1.2], [-4.6, -1.2], [-5.1, -0.6], [-4.5, -0.1], [-5, 0.6], [-4.4, 1.2], [-3.2, 1.2]]), CELLS, [-5.1, -1.2, -3.2, 1.2],
         () => cells(P, -5.1, -1.2, 1.9, 2.4));
    panel(P, 3.5, -1.2, 2.9, 2.4);
    if (!salv) turned(P, 6.4, 0, -0.42, (Q) => panel(Q, 6.6, -1.2, 3.1, 2.4));
    if (P.detail && !salv) cable(P, -4.6, -0.7, -6.6, -3.8, 0.8, '#ff5d5d', 0.4, true);
    if (!salv) turned(P, 1.0, 2.6, -0.55, (Q) => {
      c.beginPath(); c.moveTo(1.0, 2.6); c.lineTo(1.0, 4.1); ink(Q, Q.lw + 0.25);
      toon(Q, () => { c.beginPath(); c.arc(1.0, 5.6, 2, Math.PI * 1.18, Math.PI * 1.82); c.closePath(); }, STEEL, [-0.6, 3.6, 2.6, 4.6]);
      c.beginPath(); c.moveTo(1.0, 4.0); c.lineTo(1.0, 4.9); ink(Q, Q.lw * 0.8);
    });
    toon(P, () => rr(c, -2.6, -2.6, 5.2, 5.2, 0.6), FOIL, [-2.6, -2.6, 2.6, 2.6], () => {
      c.strokeStyle = 'rgba(160,110,20,0.55)'; c.lineWidth = Math.max(0.06, P.lw * 0.45);
      c.beginPath(); c.moveTo(-2.4, -0.4); c.lineTo(-1.4, 0.1); c.lineTo(-0.6, -0.5); c.lineTo(0.6, 0.2); c.lineTo(1.6, -0.3); c.lineTo(2.4, 0.3); c.stroke();
      if (salv) hole(P, -1.9, -2.1, 3.8, 1.7);
      else wtext(P, '#4', 0, -1.45, 1.5, INK);
      if (!salv) for (const ex of [-1, 1]) {
        c.beginPath(); c.arc(ex, 1.0, 0.78, 0, 2 * Math.PI); c.fillStyle = '#ffffff'; c.fill(); ink(P, P.lw * 0.8);
        const s = 0.3; c.beginPath(); c.moveTo(ex - s, 1 - s); c.lineTo(ex + s, 1 + s); c.moveTo(ex - s, 1 + s); c.lineTo(ex + s, 1 - s); ink(P, Math.max(P.lw * 0.8, 0.14));
      }
    });
    beacon(P, -1.6, 2.6, 0.5);
    if (salv) stampIt(P, 0, 0.9, 0.12, P.wr.stamp, 0.95);
  }

  // "definitely not" a pirate ship: skulls painted over with smileys, an eyepatch on the window
  function pirate(P) {
    const c = P.c, salv = P.salv, cols = ['#8c4f7a', '#55284c', '#c993b8'], PINK = '#ff7eb6';
    const rearT = [-0.8, 0, 0.18, -1.0, 0.6], R = xf(...rearT);
    const front = () => poly(c, [[1.0, 2.6], [4.6, 2.6], [10, 0.3], [10, -0.5], [4.6, -2.6], [1.0, -2.6], [1.9, -1.7], [0.8, -0.8], [1.7, 0.2], [0.7, 1.1], [1.8, 1.9]]);
    const rear = () => poly(c, [[-0.8, 2.8], [-6, 2.8], [-8.6, 5], [-9.8, 5], [-9.2, 2.2], [-9.2, -2.2], [-9.8, -5], [-8.6, -5], [-6, -2.8], [-0.8, -2.8],
                                [-1.7, -1.9], [-0.6, -1.0], [-1.6, 0], [-0.5, 1.0], [-1.5, 1.9]]);
    if (P.detail) { ribs(P, -0.9, -2.6, 2.6, 0.45); ribs(P, 0.3, -2.4, 1.2, -0.4); }
    turned(P, rearT[0], rearT[1], rearT[2], (Q) => {
      for (const ny of [0.5, -2.1]) toon(Q, () => rr(c, -11.2, ny, 2.2, 1.6, 0.4), STEEL, [-11.2, ny, -9, ny + 1.6]);
      if (!salv) {
        c.beginPath(); c.moveTo(-7.2, 2.6); c.lineTo(-7.2, 7.4); ink(Q, Q.lw + 0.3);
        const wv = Math.sin(P.t * 2) * 0.25, flag = () => poly(c, [[-7.2, 7.4], [-3.4, 7.1 + wv], [-4.1, 6.5], [-3.3, 5.9 - wv], [-4.4, 5.5], [-7.2, 5.3]]);
        flag(); c.fillStyle = '#2a2140'; c.fill(); ink(Q);
        c.beginPath(); c.arc(-5.5, 6.35, 0.6, 0, 2 * Math.PI); c.fillStyle = PINK; c.fill();
        c.fillStyle = INK; for (const ex of [-5.7, -5.3]) { c.beginPath(); c.arc(ex, 6.5, 0.09, 0, 2 * Math.PI); c.fill(); }
        c.beginPath(); c.arc(-5.5, 6.35, 0.32, Math.PI * 1.2, Math.PI * 1.8); ink(Q, Q.lw * 0.6);
      } else { c.beginPath(); c.moveTo(-7.2, 2.6); c.lineTo(-7.2, 4.2); c.lineTo(-6.9, 4.5); ink(Q, Q.lw + 0.3); }
      toon(Q, rear, cols, [-9.8, -5, -0.6, 5], () => {
        scorch(Q, [[-2.4, -1.4, 1.2], [-7.6, 1.6, 0.8]]);
        if (salv) { hole(Q, -6.4, -1.6, 3.2, 2.6); return; }
        c.globalAlpha *= 0.5;                                          // the old skull, under the new paint
        c.beginPath(); c.arc(-4.6, 0.4, 1.35, 0, 2 * Math.PI); c.fillStyle = '#f1eeff'; c.fill();
        c.fillRect(-5.3, -1.2, 1.4, 0.8);
        c.globalAlpha /= 0.5;
        c.beginPath();
        for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI, r = 1.75 + 0.18 * Math.sin(i * 3.1); i ? c.lineTo(-4.4 + r * Math.cos(a), 0.2 + r * Math.sin(a)) : c.moveTo(-4.4 + r, 0.2); }
        c.closePath(); c.fillStyle = PINK; c.fill();
        c.fillStyle = INK; for (const ex of [-5, -3.8]) { c.beginPath(); c.arc(ex, 0.65, 0.22, 0, 2 * Math.PI); c.fill(); }
        c.beginPath(); c.arc(-4.4, 0.2, 0.9, Math.PI * 1.15, Math.PI * 1.85); ink(Q, Q.lw * 0.9);
        if (Q.detail) wtext(Q, 'NOT PIRATES', -4.6, -2.05, 0.75, PINK, -0.04);
      });
      if (salv) stampIt(Q, -4.6, 0.3, 0.14, P.wr.stamp);
    }, rearT[3], rearT[4]);
    for (const sp of [[[2.6, 2.5], [3.3, 4.3], [4.0, 2.5]], [[5.0, 2.3], [5.9, 3.7], [6.5, 1.9]]]) toon(P, () => poly(c, sp), STEEL, [sp[0][0], 2, sp[2][0], 4]);
    toon(P, front, cols, [0.7, -2.6, 10, 2.6], () => {
      scorch(P, [[2.6, 1.3, 1.1], [3.4, -1.7, 0.9]]);
      if (salv) hole(P, 2.4, -2.1, 2.4, 1.6);
      porthole(P, 6.0, 0.4, 1.3, 'patch');
    });
    if (P.detail) {
      cable(P, 1.2, 1.4, ...R(-1.0, 1.6), 0.6, '#ff5d5d', 0.3);
      cable(P, 1.1, -1.6, 0.4, -4.6, 0.8, '#7cf5d6', 2.2, true);
    }
    beacon(P, 2.0, 2.6, 0.7);
  }

  // a round habitat pod with a cracked glass dome: a greenhouse (plants) or a living room (couch)
  function pod(P, o) {
    const c = P.c, salv = P.salv, cols = o.cols || ['#d9d2ee', '#9a92c0', '#ffffff'];
    if (!salv) turned(P, 7.6, 5.4, 0.7, (Q) => toon(Q, () => poly(c, [[6.4, 4.8], [9, 5.2], [8.6, 6.5], [6.9, 6.2]]), ['#bfeaff', '#7fb4d0', '#ffffff'], [6.4, 4.8, 9, 6.5]));
    toon(P, () => rr(c, -2.6, -7.1, 5.2, 1.8, 0.4), STEEL, [-2.6, -7.1, 2.6, -5.3]);
    c.beginPath(); c.arc(0, 0.4, 5.5, 0, Math.PI); c.closePath(); c.fillStyle = '#3a3150'; c.fill();
    c.save(); c.beginPath(); c.arc(0, 0.4, 5.5, 0, Math.PI); c.closePath(); c.clip();
    if (o.inside === 'couch') couch(P); else plants(P);
    c.restore();
    c.beginPath(); c.arc(0, 0.4, 5.5, 0, Math.PI); c.closePath(); c.fillStyle = salv ? 'rgba(160,230,255,0.10)' : 'rgba(160,230,255,0.22)'; c.fill();
    c.beginPath(); c.arc(0, 0.4, 4.6, Math.PI * 0.55, Math.PI * 0.8); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.35; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.moveTo(3.6, 4.6); c.lineTo(2.6, 3.4); c.lineTo(3.1, 2.6); c.lineTo(2.2, 1.6);
    if (salv) { c.moveTo(-3.8, 4.2); c.lineTo(-2.4, 3.1); c.lineTo(-2.9, 2.1); c.moveTo(-0.4, 5.6); c.lineTo(0.3, 4.2); }
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(0.1, P.lw * 0.6); c.stroke();
    c.beginPath(); c.arc(0, 0.4, 5.5, 0, Math.PI); ink(P);
    toon(P, () => { c.beginPath(); c.arc(0, 0.4, 6, Math.PI, 2 * Math.PI); c.closePath(); }, cols, [-6, -5.6, 6, 0.4], () => {
      c.fillStyle = o.band || '#7cf5d6'; c.fillRect(-7, -1.2, 14, 0.9);
      c.beginPath(); c.moveTo(-7, -1.2); c.lineTo(7, -1.2); c.moveTo(-7, -0.3); c.lineTo(7, -0.3); ink(P, P.lw * 0.6);
      scorch(P, [[3.2, -3, 1.3], [-4, -2.2, 0.9]]);
      if (salv) hole(P, -3.6, -4.4, 2.8, 2); else porthole(P, -3.2, -3.2, 0.9, null);
      c.beginPath(); c.moveTo(1.4, 0.4); c.lineTo(2.0, -1.4); c.lineTo(1.2, -2.6); c.lineTo(2.1, -4.0); ink(P, P.lw * 0.8);
    });
    beacon(P, 5.4, 0.4, 0.3);
    if (salv) stampIt(P, 0.6, -3.6, 0.12, P.wr.stamp, 1.15);
  }

  function plants(P) {
    const c = P.c;
    c.fillStyle = '#7a5a3a'; c.fillRect(-6, 0.4, 12, 1.0);
    if (P.salv) return;
    for (const [x, r, col] of [[-3.1, 1.15, '#a3b05a'], [-0.7, 1.3, '#8fbf5a'], [1.9, 1.05, '#a8a65c']]) {
      c.beginPath(); c.arc(x, 1.4 + r * 0.7, r, 0, 2 * Math.PI); c.fillStyle = col; c.fill(); ink(P, P.lw * 0.8);
      c.beginPath(); c.moveTo(x, 1.4); c.lineTo(x - r * 0.4, 1.4 + r * 1.2); c.moveTo(x, 1.4); c.lineTo(x + r * 0.45, 1.4 + r * 1.1); ink(P, P.lw * 0.5);
    }
    c.beginPath(); c.moveTo(3.8, 1.4); c.lineTo(3.8, 4.4); ink(P, P.lw + 0.12);
    c.beginPath(); c.moveTo(3.8, 1.8); c.quadraticCurveTo(4.8, 2.6, 3.8, 3.2); c.quadraticCurveTo(2.9, 3.8, 3.8, 4.4); c.strokeStyle = '#6f9a46'; c.lineWidth = 0.22; c.stroke();
    for (const [x, y] of [[4.3, 2.5], [3.3, 3.6], [4.1, 3.9]]) { c.beginPath(); c.arc(x, y, 0.3, 0, 2 * Math.PI); c.fillStyle = '#ff5d5d'; c.fill(); ink(P, P.lw * 0.6); }
  }

  function couch(P) {
    const c = P.c;
    c.fillStyle = '#5a4f74'; c.fillRect(-6, 0.4, 12, 0.5);
    if (P.salv) return;
    const RED = ['#e05a6a', '#a3384a', '#ff9aa6'];
    toon(P, () => rr(c, -3.3, 2.0, 6.6, 1.7, 0.5), RED, [-3.3, 2, 3.3, 3.7]);
    toon(P, () => rr(c, -3.3, 0.9, 6.6, 1.3, 0.35), RED, [-3.3, 0.9, 3.3, 2.2]);
    for (const ax of [-3.9, 2.9]) toon(P, () => rr(c, ax, 0.9, 1.0, 2.1, 0.4), RED, [ax, 0.9, ax + 1, 3]);
    c.beginPath(); c.moveTo(4.6, 0.9); c.lineTo(4.6, 3.6); ink(P, P.lw + 0.12);
    glow(c, 4.6, 3.6, 2.4, '255,220,140', 0.55);                     // the lamp is still on
    poly(c, [[3.9, 3.4], [5.3, 3.4], [4.95, 4.4], [4.25, 4.4]]); c.fillStyle = '#ffe066'; c.fill(); ink(P, P.lw * 0.8);
  }

  // a little three-legged lander, fast asleep in the shade
  function lander(P) {
    const c = P.c, salv = P.salv, BODY = ['#eef0fa', '#a9a6c8', '#ffffff'];
    const legs = [[[-2.6, -0.8], [-5.6, -3.6]], [[2.6, -0.8], [5.4, -3.8]], [[0.4, -1], [1.3, -2.6], [0.2, -4.2]]];
    for (const L of legs) {
      c.beginPath(); L.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineCap = 'round';
      c.strokeStyle = INK; c.lineWidth = 0.5 + 2 * P.lw; c.stroke(); c.strokeStyle = STEEL[0]; c.lineWidth = 0.5; c.stroke();
      const [fx, fy] = L[L.length - 1];
      c.beginPath(); c.ellipse(fx, fy, 0.75, 0.3, 0, 0, 2 * Math.PI); c.fillStyle = STEEL[1]; c.fill(); ink(P, P.lw * 0.8);
    }
    if (P.detail) {
      cable(P, -3.6, 0.2, -8.8, -2.6, 1.0, '#c9c4e8', 0.6);
      poly(c, [[-8.6, -2.3], [-9.8, -3.0], [-8.9, -3.0]]); c.fillStyle = STEEL[1]; c.fill(); ink(P, P.lw * 0.8);
    }
    c.beginPath(); c.moveTo(2.6, 3.3); c.lineTo(3.7, 5.5); ink(P, P.lw + 0.12);
    c.beginPath(); c.arc(3.7, 5.5, 0.4, 0, 2 * Math.PI); c.fillStyle = '#ff7eb6'; c.fill(); ink(P, P.lw * 0.8);
    toon(P, () => rr(c, -4, -1, 8, 4.4, 0.9), BODY, [-4, -1, 4, 3.4], () => {
      c.fillStyle = CELLS[0]; c.fillRect(-4, 2.5, 8, 0.9); cells(P, -4, 2.5, 8, 0.9);
      if (salv) hole(P, -3.3, -0.5, 1.8, 1.4);
      c.fillStyle = 'rgba(255,140,170,0.5)'; for (const ex of [-2.3, 2.3]) { c.beginPath(); c.arc(ex, 0.4, 0.5, 0, 2 * Math.PI); c.fill(); }
      for (const ex of [-1.2, 1.2]) {
        c.beginPath();
        if (salv) c.arc(ex, 0.9, 0.42, 0.15 * Math.PI, 0.85 * Math.PI);  // happy ^ ^ (awake, briefly)
        else c.arc(ex, 1.35, 0.42, 1.15 * Math.PI, 1.85 * Math.PI);   // asleep u u
        ink(P, Math.max(P.lw, 0.2));
      }
    });
    if (!salv && P.detail) for (let i = 0; i < 3; i++) {
      const f = (P.t * 0.35 + i / 3) % 1;
      c.save(); c.globalAlpha *= Math.sin(f * Math.PI);
      wtext(P, 'z', 4.4 + f * 2.4, 3.8 + f * 4, 1.0 + f * 1.4, '#c9c4e8', 0.2, Math.max(0.15, P.lw * 0.8));
      c.restore();
    }
    if (salv) stampIt(P, 0.2, -2.6, 0.1, P.wr.stamp, 1.1);
    if (salv && P.talk) {
      rr(c, 4.6, 5.6, 4.6, 2.6, 1); c.fillStyle = PAPER; c.fill(); ink(P);
      poly(c, [[5.4, 5.6], [4.6, 4.6], [6.4, 5.6]]); c.fillStyle = PAPER; c.fill();
      wtext(P, 'hi!', 6.9, 6.9, 1.7, INK);
    }
  }

  // same make as your own ship: orange hull, drill nose (crumpled), one leg left
  function prospector(P) {
    const c = P.c, salv = P.salv, HULL = ['#ffb347', '#e07b2a', '#ffe0a8'], DRILL = ['#9b97b8', '#6e6896', '#d6d2ee'];
    if (P.detail && !salv) {
      cable(P, -1.8, 3.9, -2.4, 7.6, 1.0, '#c9c4e8', 0.8);
      turned(P, -2.4, 8.4, 0.9, (Q) => toon(Q, () => rr(c, -3.4, 7.6, 2, 1.6, 0.6), STEEL, [-3.4, 7.6, -1.4, 9.2]));
    }
    toon(P, () => poly(c, [[-5.6, -2.9], [-10.1, -5.8], [-10.1, -4.1], [-6.9, -2]]), ['#8c84b3', '#5d5687', '#c9c4e8'], [-10.1, -5.8, -5.6, -2]);
    toon(P, () => poly(c, [[-5.6, 2.9], [-7.1, 3.9], [-7.5, 3.4], [-7.2, 2.9], [-6.9, 2]]), ['#8c84b3', '#5d5687', null], [-7.5, 2, -5.6, 3.9]);
    toon(P, () => rr(c, -9.9, -2.5, 2.4, 5, 0.5), ['#6e6896', '#4a4470', null], [-9.9, -2.5, -7.5, 2.5]);
    toon(P, () => rr(c, -4, -5.8, 4.3, 2.2, 0.7), STEEL, [-4, -5.8, 0.3, -3.6]);
    turned(P, 4.3, 0, 0.42, (Q) => {
      toon(Q, () => poly(c, [[4.1, 3.0], [10.1, 0], [4.1, -3.0]]), salv ? ['#5a4f74', '#3a3150', null] : DRILL, [4.1, -3, 10.1, 3], () => {
        c.beginPath(); for (let i = 0; i < 3; i++) { const x = 5.2 + i * 1.5, h = 2.4 * (1 - (i + 0.6) / 3.6); c.moveTo(x, -h); c.lineTo(x + 0.6, h); } ink(Q, Q.lw * 0.7);
      });
    });
    toon(P, () => rr(c, -8.3, -3.96, 12.6, 7.92, 2.8), HULL, [-8.3, -3.96, 4.3, 3.96], () => {
      c.fillStyle = GOLD; c.fillRect(-5.24, -5, 1.26, 10);
      c.beginPath(); c.moveTo(-5.24, -5); c.lineTo(-5.24, 5); c.moveTo(-3.98, -5); c.lineTo(-3.98, 5); ink(P, P.lw * 0.6);
      scorch(P, [[2.4, -2.2, 1.4], [-2.6, 2.4, 1.1], [3.4, 1.8, 0.9]]);
      if (salv) hole(P, -7.4, -2.4, 1.9, 2.6);
      porthole(P, -0.02, 0, 2.25, 'x');
    });
    beacon(P, -3.0, 3.9, 0.9);
    if (salv) stampIt(P, -3.4, -1.0, 0.2, P.wr.stamp, 1.15);
  }


  // ======================================================================
  //  SCREEN: zoomed-out icons, names, the salvage progress ring
  // ======================================================================

  function drawScreen(g, kit) {
    const m = g.mod.wrecks;
    if (!m) return;
    const ctx = kit.ctx, zoom = kit.cam.zoom, tags = [], items = [], badges = [];
    for (const b of g.w.bodies) {                     // the core's body names sit just above each rock: keep our tags off them
      const [bx, by] = World.bodyState(g.w, b, g.t), [x, y] = kit.toScreen(bx, by), Rs = b.R * zoom;
      if (Rs > 4 && Rs < 220) tags.push([x, Math.max(28, y - Rs - 14)]);
    }
    for (const wr of list(g)) {
      const [x, y] = wr.state(g.t), [sx, sy] = kit.toScreen(x, y), rs = wr.r * zoom;
      if (!kit.onScreen(sx, sy, rs + 60)) continue;
      items.push({ wr, sx, sy, rs, seen: !!m.seen[wr.id], salv: !!m.salvaged[wr.id], nav: g.navId === 'wreck:' + wr.id,
                   fade: Math.max(0, Math.min(1, (rs - 0.7 * ICON_PX) / (0.6 * ICON_PX))) });
    }
    items.sort((a, b) => a.salv - b.salv || a.wr.idx - b.wr.idx);     // stable, so clicking a stacked badge cycles in a fixed order
    for (const o of items) {                          // zoomed far out, badges on one moon stack into one with a '+n'
      if (o.fade >= 1) continue;
      const hb = o.wr.hostBody, Rs = hb.R * zoom;
      if (o.tiny = Rs < 20) {                         // a dot-sized moon: pin the badge beside it, clear of the moon's name above
        const [hx, hy] = kit.toScreen(...World.bodyState(g.w, hb, g.t)); o.bx = hx + Math.max(Rs, 3) + 13; o.by = hy - 5;
      } else { o.bx = o.sx; o.by = o.sy; }
      const near = o.tiny ? 40 : 22, hit = badges.find((b) => Math.hypot(b.bx - o.bx, b.by - o.by) < near);
      if (hit) { hit.more++; hit.ids.push(o.wr.id); o.hidden = true; } else { o.more = 0; o.ids = [o.wr.id]; badges.push(o); }
    }
    drawn = { g, badges: badges.filter((o) => o.fade < 0.7) };     // for clicks: a badge pinned beside a moon is not where the wreck is
    for (const o of badges.slice().reverse()) {
      ctx.save(); ctx.globalAlpha = 1 - o.fade; icon(g, kit, o.bx, o.by, o.seen, o.salv);
      if (o.more) { ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'left'; kit.outlinedText(`+${o.more}`, o.bx + 12, o.by + 4, PAPER, 3); }
      ctx.restore();
    }
    for (const o of items) {
      const { wr, sx, sy, rs, fade } = o;
      if (o.hidden || o.nav || rs > 240) continue;
      if (fade < 1 && o.tiny) continue;                // far out the moon's own label wins; the badge alone says 'something here'
      const free = (ty) => !tags.some(([tx, tyy]) => Math.abs(tx - sx) < 110 && Math.abs(tyy - ty) < 16);
      const ty = [fade < 1 ? sy + 24 : sy - rs * 1.05 - 12, fade < 1 ? sy - 22 : sy + rs * 1.05 + 20].find(free);
      if (ty == null) continue;
      tags.push([sx, ty]);
      kit.tag(sx, ty, o.seen ? wr.name : 'Unknown signal', !o.seen ? SIGNAL : o.salv ? DIM : GOLD);
    }
    if (m.job) ring(g, kit, m.job);
  }

  // click a badge to target its wreck; a stacked badge cycles through its wrecks, then lets go
  let drawn = { g: null, badges: [] };
  function onMouse(g, ms) {
    if (!ms.pressed || ms.button !== 0 || g.mode !== 'ship' || g.ui || (g.S && g.S.turret) || drawn.g !== g || !Number.isFinite(ms.sx)) return false;
    const b = drawn.badges.find((o) => Math.hypot(o.bx - ms.sx, o.by - ms.sy) < 13);
    if (!b) return false;
    const i = b.ids.indexOf(g.navId && g.navId.startsWith('wreck:') ? g.navId.slice(6) : null);
    g.navId = i === b.ids.length - 1 ? null : 'wreck:' + b.ids[i + 1];
    Game.refresh(g);
    return true;
  }

  // badge: '?' for an unknown signal, a broken-ship glyph with a blinking beacon, a tick once salvaged
  function icon(g, kit, x, y, seen, salv) {
    const ctx = kit.ctx, R = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(x + 2, y + 2, R, 0, 2 * Math.PI); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fillStyle = !seen ? '#4a3a78' : salv ? '#d9d2ee' : PAPER2; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!seen) { ctx.font = `700 14px ${FONT}`; ctx.fillStyle = SIGNAL; ctx.fillText('?', x, y + 1); }
    else if (salv) {
      ctx.beginPath(); ctx.moveTo(x - 4.5, y); ctx.lineTo(x - 1, y + 3.5); ctx.lineTo(x + 5, y - 4); ctx.strokeStyle = '#2f9e5b'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    } else {
      ctx.fillStyle = '#9b97b8'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      for (const [x0, w, a] of [[-6.5, 5, 0.25], [0.5, 6, -0.15]]) {
        ctx.save(); ctx.translate(x + x0 + w / 2, y); ctx.rotate(a);
        ctx.beginPath(); ctx.rect(-w / 2, -2.4, w, 4.8); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.textBaseline = 'alphabetic';
    if (!salv && (g.real % 1.3) < 0.3) {
      ctx.beginPath(); ctx.arc(x + R * 0.75, y - R * 0.75, 3.2, 0, 2 * Math.PI); ctx.fillStyle = '#ff4d6d'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function ring(g, kit, J) {
    const wr = byId(g, J.id);
    if (!wr) return;
    const ctx = kit.ctx, f = Math.max(0, Math.min(1, J.t / J.need));
    let x, y, R;
    if (J.how === 'foot') { const A = g.astro, up = kit.screenAng(A.ang); [x, y] = kit.toScreen(A.x, A.y); const o = 0.9 * Math.max(kit.cam.zoom, 14) + 30; x += Math.cos(up) * o; y += Math.sin(up) * o; R = 22; }   // clear of the helmet at any zoom
    else { [x, y] = kit.toScreen(...wr.state(g.t)); R = Math.max(30, Math.min(110, wr.r * kit.cam.zoom + 14)); }
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.stroke();
    ctx.strokeStyle = '#4a3a78'; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI); ctx.strokeStyle = GOLD; ctx.lineWidth = 6; ctx.stroke();
    const word = J.how === 'foot' ? 'RUMMAGING' : J.how === 'drill' ? 'DRILLING' : 'SALVAGING', pct = `${Math.floor(f * 100)}%`;
    ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'center';
    if (J.how === 'foot') { kit.outlinedText(pct, x, y + 5, PAPER, 4); kit.tag(x, y - R - 12, word, GOLD); }
    else kit.tag(x, y - R - 12, `${word} ${pct}`, GOLD);                // centre left clear: small wrecks show through
    ctx.textAlign = 'left';
  }


  // ======================================================================
  //  HUD: the crew log, codec style (typewriter, a crackly portrait, then the loot list)
  // ======================================================================

  const codecLife = (g, C) => { const wr = byId(g, C.id); return wr ? (wr.log.length + 2) / LOG_CPS + LOG_HOLD : 0; };

  function wrap(ctx, text, w) {
    const out = []; let line = '';
    for (const word of text.split(' ')) {
      const tryL = line ? `${line} ${word}` : word;
      if (ctx.measureText(tryL).width > w && line) { out.push(line); line = word; } else line = tryL;
    }
    if (line) out.push(line);
    return out;
  }

  function drawHUD(g, kit) {
    const m = g.mod.wrecks, C = m && m.codec, wr = C && byId(g, C.id);
    if (!wr) return;
    const ctx = kit.ctx, age = g.real - C.t0, life = codecLife(g, C), W0 = 300, tx = 84, tw = W0 - tx - 14;
    ctx.font = `500 13px ${FONT}`;
    const quote = `"${wr.log}"`, lines = wrap(ctx, quote, tw);
    ctx.font = `600 12px ${FONT}`;
    const loot = wrap(ctx, C.loot || '', W0 - 30);
    const lootOff = Math.max(60, 15 + (lines.length - 1) * 16 + 21), h = 32 + lootOff + (loot.length - 1) * 15 + 12;   // below y0
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, age * 5, (life - age) * 1.5));
    const y0 = kit.stackRight(W0, h, `CREW LOG · ${wr.name.toUpperCase()}`), x0 = kit.W - W0 - 12;
    const typed = Math.floor(age * LOG_CPS), talking = typed < quote.length;
    portrait(g, kit, wr, x0 + 14, y0 - 14, 58, 58, talking);
    ctx.textAlign = 'left'; ctx.font = `700 11px ${FONT}`; ctx.fillStyle = '#6d5f8a';
    ctx.fillText(`▶ ${wr.who}`, x0 + tx, y0 - 2);
    ctx.font = `500 13px ${FONT}`; ctx.fillStyle = INK;
    let left = typed, cx = x0 + tx, cy = y0 + 5;
    lines.forEach((ln, i) => {
      if (left < 0) return;
      const part = ln.slice(0, left);
      ctx.fillText(part, x0 + tx, y0 + 15 + i * 16);
      cx = x0 + tx + ctx.measureText(part).width + 2; cy = y0 + 4 + i * 16;
      left -= ln.length + 1;
    });
    if (talking && (g.real * 3) % 1 < 0.5) ctx.fillRect(cx, cy, 6, 13);
    if (!talking) {
      ctx.font = `600 12px ${FONT}`; ctx.fillStyle = '#2f9e5b';
      loot.forEach((ln, i) => ctx.fillText(ln, x0 + 14, y0 + lootOff + i * 15));
    }
    ctx.restore();
  }

  // a tiny CRT: helmet (crew) or boxy bot (probes, landers), scanlines, a voice bar while it talks
  function portrait(g, kit, wr, x, y, w, h, talking) {
    const ctx = kit.ctx, bot = wr.kind === 'probe' || wr.kind === 'lander';
    kit.roundRect(x, y, w, h, 8); ctx.fillStyle = '#16283a'; ctx.fill();
    ctx.save(); kit.roundRect(x, y, w, h, 8); ctx.clip();
    const cx = x + w / 2, cy = y + h / 2 - 2, TEAL = '#7cf5d6';
    ctx.strokeStyle = TEAL; ctx.fillStyle = 'rgba(124,245,214,0.18)'; ctx.lineWidth = 2;
    if (bot) {
      kit.roundRect(cx - 14, cy - 10, 28, 22, 5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 4, cy - 19); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 4, cy - 20, 2.5, 0, 2 * Math.PI); ctx.fillStyle = TEAL; ctx.fill();
      for (const ex of [-6, 6]) { ctx.beginPath(); ctx.arc(cx + ex, cy, 3, 0, 2 * Math.PI); ctx.fill(); }
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      kit.roundRect(cx - 11, cy - 7, 22, 13, 6); ctx.fillStyle = 'rgba(124,245,214,0.35)'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 12, cy + 16); ctx.lineTo(cx - 20, cy + 30); ctx.moveTo(cx + 12, cy + 16); ctx.lineTo(cx + 20, cy + 30); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = y + ((g.real * 20) % 3); yy < y + h; yy += 3) ctx.fillRect(x, yy, w, 1);
    if (Math.random() < 0.08) { ctx.fillStyle = 'rgba(124,245,214,0.25)'; ctx.fillRect(x, y + Math.random() * h, w, 2); }
    ctx.fillStyle = TEAL;
    for (let i = 0; i < 7; i++) {
      const bh = talking ? 2 + 7 * Math.abs(Math.sin(g.real * 13 + i * 1.7)) : 1.5;
      ctx.fillRect(x + 8 + i * 6, y + h - 6 - bh, 4, bh);
    }
    ctx.restore();
    kit.roundRect(x, y, w, h, 8); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  }


  // ======================================================================
  //  REGISTER + JOB
  // ======================================================================

  const mod = Game.register({
    id: 'wrecks', init, load, save, ready, respawn, died, frame, step, after, warpLimit,
    interactions, navTargets, onMouse, hint, hudRows, drawWorld, drawScreen, drawHUD,
  });
  on = Game.mods.includes(mod);
  if (on) Game.addGoals([
    { id: 'wreck', order: 75, reward: 150, text: 'Salvage your first wreck',
      test: (g) => count(g.mod.wrecks && g.mod.wrecks.salvaged) > 0 },
  ]);

  return { list, byId, info, start, complete, hullDist, hullPoint, toWorld, isSalvaged, isSeen, roll,
           DEFS, SHAPE, SALVAGE_R, SALVAGE_V, KEEP_R, KEEP_V, SALVAGE_T, RUMMAGE_T, RUMMAGE_R, SEE_R };
})();

if (typeof module !== 'undefined') module.exports = Wrecks;
