// ======================================================================
//  HAUL  —  whole asteroids. G harpoons a rock (it leaves its rail and
//  becomes a free rock on real gravity), the rope tows it with honest
//  impulses, Q / Z reel, B plants a crack charge, F sells it whole at a
//  buyer: the Crusher on Mochi's lane, or a station.
//  API (design/V4-CONTRACT.md §2.3): TYPES, typeOf, known, info, free, rayRocks,
//  chip, blast, towInfo, sellPoints, devRock, CRUSHER (+ rope, split, BUY, CHARGES)
// ======================================================================

const Haul = (() => {

  const ITEMS = CONFIG.items;

  // ---------------- tuning ----------------
  const ROPE_REST = 0.1;                    // the rope snaps taut with this restitution
  const NOSE_REST = 0.1;                    // ...and the nose shoves a towed rock with this one
  const CONE = 40 * Math.PI / 180;          // G aims at rocks inside this half-angle off the nose
  const LATCH_V = 4;                        // fastest relative speed a harpoon holds [m/s]
  const HARPOON_T = 0.3;                    // harpoon flight [s]
  const MIN_CABLE = 0.5;                    // Q reels in to this much cable [m]
  const TENSION_T = 0.25;                   // tension readout smoothing [s]
  const TAUT_KN = 20;                       // a snap past this is logged [kN]
  const SAFE_BUMP = 2;                      // a towed rock nudging the nose slower than this never hurts [m/s]
  const ASTRO_BUMP = 3;                     // a rock hitting the astronaut faster than this hurts [m/s]
  const SELL_R = 40, SELL_V = 1.5;          // sell within this of a buyer's hull [m], slower than this [m/s]
  const FUSE = 5;                           // crack charge fuse [s]
  const PLANT_R = 10;                       // B plants on a rock within this of the hull, if none is in tow [m]
  const TNT = 4.184e6;                      // J per kg of TNT (the definition)
  const FRAG_KE = 0.03;                     // share of a charge's energy that becomes fragment kinetic energy
  const SEAM = 0.05;                        // share of the ore a crack pops out as seam pickups
  const CRUMBS = 0.1;                       // share of the ore a crashing rock leaves as pickups at the rim
  const CHUNK = Game.CHUNK_KG, MAX_PICKUPS = 6;
  const FRAG_MIN_R = 1;                     // smaller fragments crumble into pickups [m]
  const MAX_FREE = 32;                      // free rocks at most (the smallest crumbles)
  const FAR = 60000;                        // past this from Ember a rock has left the pocket universe [m]
  const TOW_WARP = 64;                      // coasting with a rock in tow
  const BURN_WARP = 16, BURN_A = 0.3;       // a towing burn gentler than BURN_A [m/s^2] may run at this warp
  const FIRST_ID = 100000;                  // fragment and dev rock ids
  const EYES = 60, SCAN1 = 300;             // a rail rock's type shows within these [m] (no scanner / scanner 1)
  const WHALE = 20000;                      // [t]
  const DEV_GEAR = { towTier: 2, towMax: 800, cableLen: 40, reelV: 1.0 };   // ?dev=1 without econ: a harpoon winch to play with

  const INK = '#1b1433', PAPER = '#fff4dc', GOLD = '#ffd166', DARK = ['#6e6896', '#4b4670', '#9b97b8'];
  const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif';


  // ---------------- rock types (progression §3.2) ----------------
  //  rho t/m^3 · perT $/t at the Hub · ore it holds · Q J/kg to crack · hard (laser) · gemP chance of gem · rMax [m]

  const TYPES = {
    gravel:  { rho: 1.9, perT: 2,  ore: 'iron',     Q: 20,  hard: 2.2, gemP: 0.06, gem: 'salt',     rMax: Infinity, col: ['#b9aac4', '#7d6e92', '#e4dcee'] },
    slush:   { rho: 1.2, perT: 4,  ore: 'ice',      Q: 15,  hard: 1.4, gemP: 0.10, gem: 'amber',    rMax: Infinity, col: ['#cfeaff', '#7fb2d6', '#ffffff'] },
    clank:   { rho: 4.0, perT: 12, ore: 'nickel',   Q: 150, hard: 2.8, gemP: 0.12, gem: 'opal',     rMax: 6,        col: ['#a9b4c8', '#5f6a85', '#e8eef8'] },
    sparkle: { rho: 3.0, perT: 30, ore: 'platinum', Q: 80,  hard: 3.6, gemP: 0.25, gem: 'voidopal', rMax: 4,        col: ['#d9cdfa', '#8f7bc7', '#ffffff'] },
  };
  const TYPE_IDS = ['gravel', 'slush', 'clank', 'sparkle'];
  const TAILINGS_COL = ['#b3aeb8', '#7c7784', '#dcd8e0'];

  // percent gravel / slush / clank / sparkle per region
  const MIX = { mochiIn: [62, 28, 8, 2], mochiOut: [55, 30, 12, 3], kiwi: [30, 60, 8, 2], potato: [60, 10, 25, 5],
                inner: [50, 15, 25, 10], outer: [55, 35, 8, 2] };
  const REGIONS = Object.keys(MIX);

  // buyers: price multiplier per type (the Crusher sits on Mochi's lane, no capture burn needed)
  const BUY = {
    crusher: { gravel: 0.8, slush: 0.8, clank: 0.8, sparkle: 0.8 },
    hub:     { gravel: 1.0, slush: 1.0, clank: 1.0, sparkle: 1.0 },
    outpost: { gravel: 0.7, slush: 1.1, clank: 0.7, sparkle: 0.7 },
    rusts:   { gravel: 0.5, slush: 0.5, clank: 1.15, sparkle: 1.15 },
  };
  const CRUSHER = { id: 'crusher', name: 'The Crusher', a: 30000, dph: 0.30, r: 25 };

  // crack charges, smallest first (econ sells them; kg of TNT)
  const CHARGES = [
    { id: 'crack1', name: 'Cracker', kg: 5, max: 6 },
    { id: 'crack2', name: 'Splitter', kg: 50, max: 4 },
    { id: 'crack3', name: 'Rock Opera', kg: 500, max: 2 },
  ];

  const orePerT = (T) => T.perT / ITEMS[T.ore].price;                          // kg of ore per tonne of rock
  const massOf = (T, r) => T.rho * 4 / 3 * Math.PI * r * r * r;                 // t
  const payout = (oreKg, gem, T, mult) => Math.round(Math.max(0, oreKg) * ITEMS[T.ore].price * mult + (gem ? ITEMS[gem].price / 2 : 0));
  const fmtMass = (t) => (t < 10 ? `${t.toFixed(1)} t` : `${Math.round(t).toLocaleString('en-US')} t`);
  const fmtMoney = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
  const econ = (g) => (typeof Econ !== 'undefined' && Econ && g.mod.economy && Econ.charges && Econ.spendCharge ? Econ : null);
  const stationsOf = (g) => (typeof Stations !== 'undefined' && Stations && Stations.list ? Stations.list(g) : []);


  // ======================================================================
  //  TYPES, MASS AND VALUE
  // ======================================================================

  function hash(a, b, c) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  function regionOf(rk) {
    const h = rk.host.id;
    if (h === 'mochi') return rk.a < 1000 ? 'mochiIn' : 'mochiOut';
    if (h === 'kiwi' || h === 'potato') return h;
    return rk.a < 30000 ? 'inner' : 'outer';
  }

  // deterministic from (seed, rock id, region): a rock is always the same rock
  function typeOf(g, rk) {
    if (rk.type) return rk.type;
    const cache = g.mod.haul && g.mod.haul.types;
    if (cache && cache[rk.id]) return cache[rk.id];
    const reg = regionOf(rk), mix = MIX[reg], u = hash(g.seed, rk.id, REGIONS.indexOf(reg)) * 100;
    let i = 0, acc = mix[0];
    while (u >= acc && i < 3) acc += mix[++i];
    const type = rk.r > TYPES[TYPE_IDS[i]].rMax ? 'gravel' : TYPE_IDS[i];
    if (cache) cache[rk.id] = type;
    return type;
  }
  const gemOf = (g, rk, T) => (hash(g.seed, rk.id, 77) < T.gemP ? T.gem : null);

  // { type, m [t], oreKg, value [$ at the Hub], gem } of a rail or free rock
  function info(g, rk) {
    const type = typeOf(g, rk), T = TYPES[type];
    if (!rk.host) return { type, m: rk.m, oreKg: rk.oreKg, gem: rk.gem, value: payout(rk.oreKg, rk.gem, T, 1) };
    const m = massOf(T, rk.r), ch = g.mod.haul && g.mod.haul.chipped[rk.id], oreKg = ch ?? m * orePerT(T), gem = gemOf(g, rk, T);
    return { type, m, oreKg, gem, value: payout(oreKg, gem, T, 1) };
  }

  // eyes 60 m, scanner 1: 300 m, scanner 2: anything on screen; free rocks were all seen up close
  function known(g, rk) {
    if (!rk.host || rk.known) return true;
    const lv = g.S.scanner ?? 0;
    if (lv >= 2) return true;
    const [x, y] = World.rockState(g.w, rk, g.t), me = g.astro.on ? g.astro : g.sh;
    return Math.hypot(x - me.x, y - me.y) - rk.r < (lv >= 1 ? SCAN1 : EYES);
  }


  // ======================================================================
  //  FREE ROCKS  { id, type, r, m, oreKg, gem, x, y, vx, vy, ang, spin, out, tone, towed, known }
  // ======================================================================

  const free = (g) => (g.mod.haul ? g.mod.haul.free : []);
  const freeById = (m, id) => m.free.find((rk) => rk.id === id) || null;
  const towed = (g) => { const m = g.mod.haul; return m && m.tow ? freeById(m, m.tow.id) : null; };

  // a rail rock (if still on its rail) or a free rock, by id
  function rockById(g, id) {
    const fr = freeById(g.mod.haul, id);
    if (fr) return fr;
    const rk = id < FIRST_ID ? g.w.rocks[id] : null;
    return rk && rk.id === id && !rk.gone ? rk : null;
  }
  const stateOf = (g, rk) => (rk.host ? World.rockState(g.w, rk, g.t) : [rk.x, rk.y, rk.vx, rk.vy]);
  const angOf = (g, rk) => (rk.host ? rk.spin * g.t : rk.ang);

  // lumpy outline like World's rubble (fragments and dev rocks; rail rocks keep their own)
  function outline(id) {
    const rand = World.rng(id * 7919 + 13), harm = [2, 3, 5, 7].map((k) => [k, rand() * 2 * Math.PI, (rand() * 0.6 + 0.4) / k ** 0.6]);
    const norm = harm.reduce((s, h) => s + h[2], 0);
    return Array.from({ length: 12 }, (_, i) => 1 + 0.35 * harm.reduce((s, [k, ph, w]) => s + w * Math.sin(k * i / 12 * 2 * Math.PI + ph), 0) / norm);
  }

  function makeFree(g, o) {
    const T = TYPES[o.type], m = o.m ?? massOf(T, o.r), rail = o.id < FIRST_ID ? g.w.rocks[o.id] : null;
    return { id: o.id, type: o.type, r: o.r, m, oreKg: o.oreKg ?? m * orePerT(T), gem: o.gem ?? null,
             x: o.x, y: o.y, vx: o.vx, vy: o.vy, ang: o.ang ?? 0, spin: o.spin ?? 0,
             out: o.out || (rail && rail.out) || outline(o.id), tone: o.tone ?? (rail ? rail.tone : 0.5), towed: false, known: true };
  }

  function addFree(g, rk) {
    const m = g.mod.haul;
    m.free.push(rk);
    if (m.free.length > MAX_FREE) {
      const small = m.free.filter((r) => !r.towed).sort((a, b) => a.m - b.m)[0];
      if (small) { crumble(g, small, small.oreKg, 0.5, true); removeFree(g, small, 'crumbled (too many free rocks)'); }
    }
    return rk;
  }

  function removeFree(g, rk, why) {
    const m = g.mod.haul, i = m.free.indexOf(rk);
    if (i >= 0) m.free.splice(i, 1);
    if (m.tow && m.tow.id === rk.id) { m.tow = null; m.tension = 0; }
    m.charges = m.charges.filter((c) => c.id !== rk.id);
    if (why) Game.log(g, `rock ${rk.id} ${why}`);
  }

  // a rail rock leaves its rail: a free copy at its exact rail position and velocity, same id and look
  function takeOff(g, rk) {
    const m = g.mod.haul, [x, y, vx, vy] = World.rockState(g.w, rk, g.t), inf = info(g, rk);
    const fr = makeFree(g, { id: rk.id, type: inf.type, r: rk.r, m: inf.m, oreKg: inf.oreKg, gem: inf.gem, x, y, vx, vy,
                              ang: rk.spin * g.t, spin: rk.spin, out: rk.out, tone: rk.tone });
    rk.gone = true; m.gone.push(rk.id); delete m.chipped[rk.id];
    return addFree(g, fr);
  }

  // ore as pickups round a rock: up to MAX_PICKUPS chunks of CHUNK kg, or (all) every whole kg split over them;
  //  returns the kg that did not pop out
  function crumble(g, rk, kg, speed = 1, all = false) {
    const T = TYPES[rk.type], n = Math.min(MAX_PICKUPS, Math.floor(kg / CHUNK)) || (all && kg >= 1 ? 1 : 0);
    const qty = all && n ? Math.floor(kg / n) : CHUNK;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 2 * Math.PI, v = speed * (0.4 + 0.6 * Math.random()), o = rk.r * 0.6 * Math.random();
      Game.spawnPickup(g, { x: rk.x + Math.cos(a) * o, y: rk.y + Math.sin(a) * o, vx: rk.vx + Math.cos(a) * v, vy: rk.vy + Math.sin(a) * v, item: T.ore, qty });
    }
    return kg - n * qty;
  }


  // ---------------- flight: leapfrog on World.gravity, substepped when the core takes long steps ----------------

  function maxStep(g, rk, t) {
    const st = World.states(g.w, t);
    let h = 0.5;
    for (const b of g.w.bodies) {
      const s = st[b.idx], dx = rk.x - s[0], dy = rk.y - s[1], r = Math.hypot(dx, dy) || 1e-9;
      h = Math.min(h, 0.02 * Math.sqrt(r * r * r / b.mu));
      const vc = -((rk.vx - s[2]) * dx + (rk.vy - s[3]) * dy) / r, gap = r - (b.killR || b.R * (1 + b.shape)) - rk.r;
      if (vc > 0) h = Math.min(h, 0.2 * Math.max(1, gap) / vc);
    }
    return Math.max(CONFIG.sim.dt, h);
  }

  function fly(g, rocks, t0, h) {
    for (const rk of rocks) {
      const [ax, ay] = World.gravity(g.w, rk.x, rk.y, t0);
      rk.vx += 0.5 * h * ax; rk.vy += 0.5 * h * ay;
      rk.x += h * rk.vx;     rk.y += h * rk.vy;
    }
    for (const rk of rocks) {
      const [ax, ay] = World.gravity(g.w, rk.x, rk.y, t0 + h);
      rk.vx += 0.5 * h * ax; rk.vy += 0.5 * h * ay;
      rk.ang += rk.spin * h;
    }
  }

  // body hits: a crater and crumbs; the star: SIZZLE; too far out: gone
  function hitBodies(g, rk, t) {
    const st = World.states(g.w, t);
    if (Math.hypot(rk.x - st[g.w.root.idx][0], rk.y - st[g.w.root.idx][1]) > FAR) { removeFree(g, rk, 'left the pocket universe'); return true; }
    for (const b of g.w.bodies) {
      const s = st[b.idx], lx = rk.x - s[0], ly = rk.y - s[1], d = Math.hypot(lx, ly);
      if (b.killR) { if (d < b.killR) { sizzle(g, rk, b); return true; } continue; }
      if (d > b.R * (1 + b.shape) + rk.r) continue;
      const deep = d < World.surfaceR(b, Math.atan2(ly, lx)) - 1;
      if (deep || Terrain.collideCircle(Terrain.of(b), lx, ly, rk.r * 0.8)) { crater(g, rk, b, s); return true; }
    }
    return false;
  }

  function crater(g, rk, b, s) {
    const lx = rk.x - s[0], ly = rk.y - s[1], d = Math.hypot(lx, ly) || 1, ux = lx / d, uy = ly / d;
    const v = Math.hypot(rk.vx - s[2], rk.vy - s[3]), R = Math.min(6, 0.6 * rk.r);
    const cx = rk.x - ux * rk.r * 0.8, cy = rk.y - uy * rk.r * 0.8, T = TYPES[rk.type];
    const res = Game.dig(g, b, cx, cy, R, 99);
    const n = Math.min(MAX_PICKUPS, Math.floor(CRUMBS * rk.oreKg / CHUNK));
    for (let i = 0; i < n; i++) {
      const side = (i % 2 ? 1 : -1) * (0.6 + 0.4 * Math.random()), px = cx + ux * (R + 0.6) - uy * side * R, py = cy + uy * (R + 0.6) + ux * side * R;
      Game.spawnPickup(g, { x: px, y: py, vx: s[2] + ux * 0.8 - uy * side * 1.2, vy: s[3] + uy * 0.8 + ux * side * 1.2, item: T.ore, qty: CHUNK });
    }
    Game.popup(g, 'KA-THUMP!', '#ffb36b', cx, cy, 30);
    Game.burst(g, 'dust', cx, cy, 30, { vx: s[2], vy: s[3], speed: 3 + Math.min(6, v), col: b.color[1] });
    if (Math.hypot(g.sh.x - cx, g.sh.y - cy) < 200) g.shake = Math.min(1, g.shake + 0.5);
    removeFree(g, rk, `hit ${b.name} at ${v.toFixed(1)} m/s: a ${R.toFixed(1)} m crater (${res.cells} cells), ${n * CHUNK} kg of ${T.ore} at the rim`);
  }

  function sizzle(g, rk, b) {
    Game.popup(g, 'SIZZLE!', '#ffd36b', rk.x, rk.y, 30);
    Game.burst(g, 'flash', rk.x, rk.y, 2, { col: '#ffd36b', size: rk.r * 3, life: 1 });
    removeFree(g, rk, `fell into ${b.name}: SIZZLE. Rock ${rk.id} would like a word with you`);
  }


  // ======================================================================
  //  THE ROPE  —  inextensible, pull only, between the ship's CoM and the rock's centre
  // ======================================================================

  // mA = Infinity pins end a (a landed or docked ship).  Exact momentum and CoM.  Returns the impulse [t m/s = kN s]
  function rope(a, mA, b, mB, L, rest = ROPE_REST) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d <= L || d < 1e-9) return 0;
    const nx = dx / d, ny = dy / d, pinned = mA === Infinity;
    const fa = pinned ? 0 : mB / (mA + mB), fb = pinned ? 1 : mA / (mA + mB);   // share of the correction each end takes
    const vSep = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;                        // > 0: separating
    let J = 0;
    if (vSep > 0) {
      J = (1 + rest) * (pinned ? mB : mA * mB / (mA + mB)) * vSep;
      if (!pinned) { a.vx += J / mA * nx; a.vy += J / mA * ny; }
      b.vx -= J / mB * nx; b.vy -= J / mB * ny;
    }
    const over = d - L;
    a.x += over * fa * nx; a.y += over * fa * ny;
    b.x -= over * fb * nx; b.y -= over * fb * ny;
    return J;
  }

  const held = (g) => g.status !== 'flying';                                   // landed, docked or wrecked: the ship does not budge
  const shipMass = (g) => (held(g) ? Infinity : Physics.mass(g.sh, g.S));

  function towStep(g, dt) {
    const m = g.mod.haul, rk = towed(g);
    if (!rk) { m.tow = null; return; }
    const J = rope(g.sh, shipMass(g), rk, rk.m, m.tow.len + rk.r + g.S.radius);
    m.tension += (J / dt - m.tension) * Math.min(1, dt / TENSION_T);
    if (m.tension > TAUT_KN && !m.taut) { m.taut = true; Game.log(g, `rope taut: ${m.tension.toFixed(0)} kN on rock ${rk.id}`); }
    else if (m.tension < TAUT_KN / 2) m.taut = false;
  }

  // ship vs free rocks: mass-weighted push apart and bounce (the towed one gently, with the nose)
  function bumpShip(g) {
    const m = g.mod.haul, sh = g.sh, S = g.S;
    if (g.status === 'dead') return;
    const mS = shipMass(g);
    for (const rk of m.free) {
      const hitR = rk.towed ? rk.r + S.radius : rk.r * 0.9 + S.radius * 0.8;
      const dx = rk.x - sh.x, dy = rk.y - sh.y, d = Math.hypot(dx, dy);
      if (d >= hitR || d < 1e-9) continue;
      const nx = dx / d, ny = dy / d, fa = mS === Infinity ? 0 : rk.m / (mS + rk.m), over = hitR - d;
      sh.x -= over * fa * nx; sh.y -= over * fa * ny; rk.x += over * (1 - fa) * nx; rk.y += over * (1 - fa) * ny;
      const vn = (rk.vx - sh.vx) * nx + (rk.vy - sh.vy) * ny;                   // < 0: closing
      if (vn >= 0) continue;
      const J = -(1 + (rk.towed ? NOSE_REST : S.bounce)) * (mS === Infinity ? rk.m : mS * rk.m / (mS + rk.m)) * vn;
      if (mS !== Infinity) { sh.vx -= J / mS * nx; sh.vy -= J / mS * ny; }
      rk.vx += J / rk.m * nx; rk.vy += J / rk.m * ny;
      if (rk.towed && -vn > SAFE_BUMP) Game.hurtShip(g, Math.min(45, S.bumpDamage * (-vn - SAFE_BUMP)), 'CLONK!');
      else if (!rk.towed && -vn > 0.3) Game.hurtShip(g, Math.min(45, S.bumpDamage * -vn), ['CLANK!', 'BONK!', 'THUD!'][Math.floor(Math.random() * 3)]);
    }
  }

  function bumpAstro(g) {
    const A = g.astro;
    if (!A.on) return;
    for (const rk of g.mod.haul.free) {
      const dx = A.x - rk.x, dy = A.y - rk.y, d = Math.hypot(dx, dy), hitR = rk.r * 0.9 + A.r;
      if (d >= hitR || d < 1e-9) continue;
      const nx = dx / d, ny = dy / d, vn = (A.vx - rk.vx) * nx + (A.vy - rk.vy) * ny;
      A.x = rk.x + nx * hitR; A.y = rk.y + ny * hitR;
      if (vn >= 0) continue;
      A.vx -= 1.3 * vn * nx; A.vy -= 1.3 * vn * ny;
      if (-vn > ASTRO_BUMP) Game.hurtAstro(g, Math.min(40, 6 * -vn), 'BONK!');
    }
  }

  function step(g, dt) {
    const m = g.mod.haul;
    if (!m.free.length) return;
    const t0 = g.t - dt;
    let n = 1;
    if (dt > 1 / 60) for (const rk of m.free) n = Math.max(n, Math.ceil(dt / maxStep(g, rk, t0)));
    for (let i = 0; i < n; i++) {
      fly(g, m.free, t0 + i * dt / n, dt / n);
      for (const rk of m.free.slice()) hitBodies(g, rk, t0 + (i + 1) * dt / n);
    }
    if (m.tow && m.reel) reel(g, dt);
    if (m.tow) towStep(g, dt);
    bumpShip(g);
    bumpAstro(g);
  }


  // ======================================================================
  //  GRAPPLE (G), REEL (Q / Z), RELEASE
  // ======================================================================

  // the rock G would harpoon: nearest (surface) inside the ±40° cone, within cableLen of the hull
  function aimed(g) {
    const m = g.mod.haul, S = g.S, sh = g.sh, reach = S.cableLen ?? 0, nx = Math.cos(sh.ang), ny = Math.sin(sh.ang);
    let best = null;
    const test = (rk, x, y, vx, vy) => {
      const dx = x - sh.x, dy = y - sh.y, d = Math.hypot(dx, dy) || 1e-9, gap = d - rk.r - S.radius;
      if (gap > reach || (best && gap >= best.gap)) return;
      const off = Math.acos(Math.max(-1, Math.min(1, (dx * nx + dy * ny) / d))) - Math.asin(Math.min(1, rk.r / d));
      if (off <= CONE) best = { rk, gap, d, x, y, v: Math.hypot(vx - sh.vx, vy - sh.vy) };
    };
    for (const rk of m.free) if (!rk.towed) test(rk, rk.x, rk.y, rk.vx, rk.vy);
    const st = World.states(g.w, g.t), hostD = {};
    for (const rk of g.w.rocks) {
      if (rk.gone) continue;
      const hi = rk.host.idx, dh = hostD[hi] ?? (hostD[hi] = Math.hypot(sh.x - st[hi][0], sh.y - st[hi][1]));
      if (Math.abs(dh - rk.a) > rk.r + rk.ae + reach + S.radius) continue;
      const [x, y, vx, vy] = World.rockState(g.w, rk, g.t);
      test(rk, x, y, vx, vy);
    }
    if (best) best.inf = info(g, best.rk);
    return best;
  }

  function grapple(g) {
    const m = g.mod.haul, S = g.S;
    if (m.tow) { release(g, 'let go'); Game.toast(g, 'ROCK RELEASED', '#ffe2b0', 'haul'); return; }
    if (m.shot) return;
    if ((S.towMax ?? 0) <= 0) { Game.toast(g, 'NO TOW GEAR: BUY A TOW HOOK (HAUL TAB)', '#ff9f1c', 'haul'); return; }
    if (g.status !== 'flying') { Game.toast(g, g.status === 'docked' ? 'UNDOCK FIRST' : 'TAKE OFF FIRST', '#ff9f1c', 'haul'); return; }
    const c = aimed(g);
    if (!c) { Game.toast(g, `NO ROCK IN REACH: NOSE AT ONE (±40°) WITHIN ${(S.cableLen ?? 0).toFixed(0)} M`, '#ff9f1c', 'haul'); return; }
    const name = c.inf.type.toUpperCase();
    if (c.inf.m > S.towMax) { Game.toast(g, `TOO BIG: ${fmtMass(c.inf.m)} ${name} > ${fmtMass(S.towMax)}. CRACK IT (B) OR UPGRADE THE WINCH`, '#ff9f1c', 'haul'); return; }
    if (c.v > LATCH_V) { Game.toast(g, `TOO FAST TO LATCH: ${c.v.toFixed(1)} M/S (< ${LATCH_V})`, '#ff9f1c', 'haul'); return; }
    m.shot = { rk: c.rk, t0: g.t };
    Game.log(g, `harpoon away at rock ${c.rk.id} (${c.gap.toFixed(1)} m, ${c.v.toFixed(2)} m/s)`);
  }

  function latch(g) {
    const m = g.mod.haul, S = g.S;
    let rk = m.shot.rk;
    m.shot = null;
    if (g.status !== 'flying' || (rk.host ? rk.gone : !m.free.includes(rk))) return;
    const [x, y] = stateOf(g, rk), gap = Math.hypot(x - g.sh.x, y - g.sh.y) - rk.r - S.radius;
    if (gap > (S.cableLen ?? 0) + 2) { Game.popup(g, 'MISSED!', '#ff9f1c'); Game.log(g, `harpoon missed rock ${rk.id}`); return; }
    if (rk.host) rk = takeOff(g, rk);
    m.tow = { id: rk.id, len: Math.max(MIN_CABLE, Math.min(S.cableLen ?? 0, gap)) };
    rk.towed = true; m.tension = 0; m.taut = false; m.stats.towed++;
    const v = payout(rk.oreKg, rk.gem, TYPES[rk.type], 1);
    Game.popup(g, 'CLUNK!', GOLD, rk.x, rk.y, 28);
    Game.toast(g, `HOOKED: ${rk.type.toUpperCase()} ${fmtMass(rk.m)} (${fmtMoney(v)})`, '#8ff0b0', 'haul');
    Game.log(g, `latched rock ${rk.id}: ${rk.type} ${rk.m.toFixed(0)} t, ${rk.oreKg.toFixed(0)} kg ${TYPES[rk.type].ore}, ${fmtMoney(v)} at the Hub, cable ${m.tow.len.toFixed(1)} m`);
  }

  function release(g, why) {
    const m = g.mod.haul, rk = towed(g);
    m.tow = null; m.tension = 0;
    if (!rk) return;
    rk.towed = false;
    Game.log(g, `released rock ${rk.id} (${why}) at ${Math.hypot(rk.vx - g.sh.vx, rk.vy - g.sh.vy).toFixed(2)} m/s relative`);
  }

  // Q / Z held (read each frame): the winch turns at S.reelV, step by step
  function reel(g, dt) {
    const m = g.mod.haul, S = g.S;
    m.tow.len = Math.max(MIN_CABLE, Math.min(S.cableLen ?? 0, m.tow.len + m.reel * (S.reelV ?? 0) * dt));
  }


  // ======================================================================
  //  CRACK CHARGES (B) AND BLASTS
  // ======================================================================

  const charges = (g) => (econ(g) ? Econ.charges(g) : g.mod.haul.stock);
  function spendCharge(g, id) {
    if (econ(g)) return Econ.spendCharge(g, id);
    const s = g.mod.haul.stock;
    if (!(s[id] > 0)) return false;
    s[id]--;
    return true;
  }

  // the rock B plants on: the one in tow, else the nearest within PLANT_R of the hull
  function plantTarget(g) {
    const rk = towed(g);
    if (rk) return rk;
    const sh = g.sh, S = g.S;
    let best = null, bd = PLANT_R;
    for (const fr of g.mod.haul.free) { const d = Math.hypot(fr.x - sh.x, fr.y - sh.y) - fr.r - S.radius; if (d < bd) { bd = d; best = fr; } }
    for (const r of g.w.rocks) {
      if (r.gone) continue;
      const [x, y] = World.rockState(g.w, r, g.t), d = Math.hypot(x - sh.x, y - sh.y) - r.r - S.radius;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  function plant(g) {
    const m = g.mod.haul;
    if (m.charges.length) { Game.toast(g, 'ONE CHARGE AT A TIME: GET CLEAR!', '#ff9f1c', 'haul'); return; }
    const rk = plantTarget(g);
    if (!rk) { Game.toast(g, `NO ROCK TO CRACK: TOW ONE, OR GET WITHIN ${PLANT_R} M OF ONE`, '#ff9f1c', 'haul'); return; }
    const inf = info(g, rk), need = TYPES[inf.type].Q * inf.m * 1000, have = charges(g);
    const pick = CHARGES.find((c) => (have[c.id] || 0) > 0 && c.kg * TNT >= need);
    if (!pick) {
      const want = CHARGES.find((c) => c.kg * TNT >= need);
      const msg = !CHARGES.some((c) => have[c.id] > 0) ? 'NO CRACK CHARGES: BUY CRACKERS (HAUL TAB)'
        : `NEED A ${want ? want.name.toUpperCase() : 'BIGGER BANG'}: ${fmtMass(inf.m)} ${inf.type.toUpperCase()} NEEDS ${(need / 1e6).toFixed(0)} MJ`;
      Game.toast(g, msg, '#ff9f1c', 'haul');
      return;
    }
    if (!spendCharge(g, pick.id)) return;
    const [x, y] = stateOf(g, rk), a = Math.atan2(g.sh.y - y, g.sh.x - x) - angOf(g, rk);   // stuck on the face toward the ship
    m.charges.push({ id: rk.id, a, kg: pick.kg, E: pick.kg * TNT, name: pick.name, left: FUSE });
    if (rk.towed) { release(g, 'charge planted'); Game.toast(g, `${pick.name.toUpperCase()} PLANTED. ROPE CUT: GET CLEAR!`, '#ff5d5d', 'haul'); }
    else Game.toast(g, `${pick.name.toUpperCase()} PLANTED: GET CLEAR! (${FUSE} S)`, '#ff5d5d', 'haul');
    Game.log(g, `${pick.name} (${pick.kg} kg TNT, ${(pick.kg * TNT / 1e6).toFixed(1)} MJ) planted on rock ${rk.id}: ${fmtMass(inf.m)} ${inf.type} needs ${(need / 1e6).toFixed(1)} MJ`);
  }

  function chargePos(g, c, rk) {
    const [x, y, vx, vy] = stateOf(g, rk), a = c.a + angOf(g, rk);
    return [x + Math.cos(a) * rk.r * 0.9, y + Math.sin(a) * rk.r * 0.9, vx, vy];
  }

  function tickCharges(g, simDt) {
    const m = g.mod.haul;
    for (const c of m.charges.slice()) {
      const rk = rockById(g, c.id);
      if (!rk) { m.charges.splice(m.charges.indexOf(c), 1); continue; }
      const before = Math.ceil(c.left);
      c.left -= simDt;
      const [x, y] = chargePos(g, c, rk);
      if (c.left <= 0) { m.charges.splice(m.charges.indexOf(c), 1); boom(g, c, rk, x, y); }
      else if (Math.ceil(c.left) < before) Game.popup(g, `${Math.ceil(c.left)}…`, '#ff5d5d', x, y, 22);
    }
  }

  // a planted charge goes off: the rock cracks (or TINKs), the ship and astronaut get rattled
  function boom(g, c, rk, x, y) {
    const Rb = rk.r + 4 * Math.cbrt(c.kg), k = 12 * Math.cbrt(c.kg);
    Game.popup(g, c.kg >= 500 ? 'KA-BOOOOM!' : 'KA-BOOM!', '#ff6b6b', x, y, 34);
    Game.burst(g, 'flash', x, y, 2, { col: '#fff3a0', size: Rb, life: 0.6 });
    Game.burst(g, 'boom', x, y, 40, { speed: 4 + Rb / 2 });
    blast(g, x, y, c.E, rk);
    const d = Math.hypot(g.sh.x - x, g.sh.y - y);
    if (d < Rb && g.status !== 'dead') {
      const hit = Math.min(60, k * (1 - d / Rb));
      Game.hurtShip(g, hit, 'BOOM!');
      if (g.status !== 'dead') Game.impulse(g, (g.sh.x - x) / (d || 1) * 0.3 * hit, (g.sh.y - y) / (d || 1) * 0.3 * hit);
    }
    const A = g.astro, da = Math.hypot(A.x - x, A.y - y);
    if (A.on && da < Rb) Game.hurtAstro(g, Math.min(60, k * (1 - da / Rb)), 'BOOM!');
    g.shake = Math.min(1, g.shake + (d < 3 * Rb ? 0.7 : 0.2));
  }

  // E joules at (x, y): every rock whose surface is within reach cracks if E >= Q M (eva's bombs call this too)
  function blast(g, x, y, E, only = null) {
    const reach = 0.5 + 0.5 * Math.cbrt(E / TNT), hits = [], st = World.states(g.w, g.t);
    for (const rk of g.mod.haul.free) if (Math.hypot(rk.x - x, rk.y - y) - rk.r <= reach) hits.push(rk);
    for (const rk of g.w.rocks) {
      const h = st[rk.host.idx];
      if (rk.gone || Math.abs(Math.hypot(x - h[0], y - h[1]) - rk.a) > rk.r + rk.ae + reach) continue;
      const [rx, ry] = World.rockState(g.w, rk, g.t);
      if (Math.hypot(rx - x, ry - y) - rk.r <= reach) hits.push(rk);
    }
    if (only && !hits.includes(only)) hits.push(only);
    let cracked = 0;
    for (const rk of hits) if (crack(g, rk, E)) cracked++;
    return { cracked };
  }

  function crack(g, rk, E) {
    const m = g.mod.haul, inf = info(g, rk), T = TYPES[inf.type], QM = T.Q * inf.m * 1000;
    if (E < QM) {
      const [x, y] = stateOf(g, rk);
      Game.popup(g, 'TINK.', '#c9c4e8', x, y, 22);
      Game.log(g, `${(E / 1e6).toFixed(2)} MJ on rock ${rk.id} (${fmtMass(inf.m)} ${inf.type}, needs ${(QM / 1e6).toFixed(2)} MJ): TINK.`);
      return false;
    }
    if (rk.host) rk = takeOff(g, rk);
    if (rk.towed) release(g, 'cracked');
    const parts = split(rk, E, QM, Math.random), kids = [];
    let spare = crumble(g, rk, SEAM * rk.oreKg, 1.5), dust = 0;
    if (rk.gem) {
      Game.spawnPickup(g, { x: rk.x, y: rk.y, vx: rk.vx + (Math.random() - 0.5), vy: rk.vy + (Math.random() - 0.5), item: rk.gem, qty: 1 });
      Game.popup(g, `${ITEMS[rk.gem].name.toUpperCase()}!`, ITEMS[rk.gem].col, rk.x, rk.y + rk.r);
    }
    for (const p of parts) {
      const oreKg = (1 - SEAM) * rk.oreKg * p.m / rk.m;
      if (p.r < FRAG_MIN_R) { dust += oreKg; continue; }
      const id = m.nextId++;
      kids.push(makeFree(g, { id, type: rk.type, r: p.r, m: p.m, oreKg, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
                               ang: Math.random() * 6.28, spin: (Math.random() - 0.5) * Math.min(2, 4 / p.r), tone: rk.tone }));
    }
    if (kids.length) { spare += crumble(g, rk, dust, 2); kids.sort((a, b) => b.m - a.m)[0].oreKg += spare; }
    else crumble(g, rk, spare + dust, 2, true);                                  // nothing big enough left: all of it pops out
    removeFree(g, rk);
    for (const k of kids) addFree(g, k);
    m.stats.cracked++;
    const vMax = Math.max(0, ...parts.map((p) => Math.hypot(p.vx - rk.vx, p.vy - rk.vy)));
    Game.popup(g, vMax > 30 ? 'ENCORE!' : 'CRACK!', GOLD, rk.x, rk.y + rk.r * 0.5, 30);
    Game.log(g, `rock ${rk.id} (${fmtMass(rk.m)} ${rk.type}) cracked by ${(E / 1e6).toFixed(1)} MJ into ${kids.length}: ${kids.map((k) => `${k.id} ${fmtMass(k.m)}`).join(', ')}`);
    Game.goal(g, 'crack');
    return true;
  }

  // fragments of rk (masses in t) for energy E [J] when E >= QM: n = 2..5 pieces, each >= 15 % of the mass, evenly
  //  spaced directions (sum zero), u_i = s d_i / m_i so KE = FRAG_KE E exactly and the net momentum is zero;
  //  offsets ∝ 1 / m_i too, so the centre of mass stays put
  function split(rk, E, QM, rand) {
    const n = Math.max(2, Math.min(5, 2 + Math.floor(Math.log2(E / QM))));
    const w = Array.from({ length: n }, () => 0.5 + rand()), W = w.reduce((s, x) => s + x, 0);
    const ms = w.map((x) => rk.m * (0.15 + (1 - 0.15 * n) * x / W));
    ms[n - 1] = rk.m - ms.slice(0, n - 1).reduce((s, x) => s + x, 0);
    const kg = ms.map((x) => x * 1000), inv = kg.reduce((s, x) => s + 1 / x, 0), mMin = Math.min(...kg);
    const s = Math.sqrt(2 * FRAG_KE * E / inv), rot = rand() * 2 * Math.PI;
    const parts = kg.map((mk, i) => {
      const a = rot + 2 * Math.PI * i / n, dx = Math.cos(a), dy = Math.sin(a), u = s / mk, off = rk.r * 0.5 * mMin / mk;
      return { m: ms[i], r: rk.r * Math.cbrt(ms[i] / rk.m), x: rk.x + dx * off, y: rk.y + dy * off, vx: rk.vx + dx * u, vy: rk.vy + dy * u };
    });
    let px = 0, py = 0;                                                          // float residue of the momentum
    for (const p of parts) { px += p.m * (p.vx - rk.vx); py += p.m * (p.vy - rk.vy); }
    for (const p of parts) { p.vx -= px / rk.m; p.vy -= py / rk.m; }
    return parts;
  }


  // ======================================================================
  //  LASERING ROCKS (eva's suit laser calls these)
  // ======================================================================

  // nearest rail or free rock along the segment -> { rock, x, y, d } | null
  function rayRocks(g, x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1e-9, ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    let best = null;
    const test = (rock, cx, cy) => {
      const fx = x0 - cx, fy = y0 - cy, R = rock.r * 0.9, b = fx * ux + fy * uy, c = fx * fx + fy * fy - R * R, disc = b * b - c;
      if (disc < 0) return;
      const t = -b - Math.sqrt(disc), d = t >= 0 ? t : c < 0 ? 0 : -1;
      if (d >= 0 && d <= len && (!best || d < best.d)) best = { rock, x: x0 + ux * d, y: y0 + uy * d, d };
    };
    for (const rk of free(g)) test(rk, rk.x, rk.y);
    const st = World.states(g.w, g.t), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const rk of g.w.rocks) {
      if (rk.gone) continue;
      const h = st[rk.host.idx];
      if (Math.abs(Math.hypot(mx - h[0], my - h[1]) - rk.a) > rk.r + rk.ae + len) continue;
      const [rx, ry] = World.rockState(g.w, rk, g.t);
      test(rk, rx, ry);
    }
    return best;
  }

  // power x 4 / hardness kg/s of ore out of the rock's budget; 5 kg chunks fly toward `toward` -> kg removed
  function chip(g, rock, power, dt, toward) {
    const m = g.mod.haul, inf = info(g, rock), T = TYPES[inf.type];
    const kg = Math.min(Math.max(0, inf.oreKg), power * 4 / T.hard * dt);
    const [x, y, vx, vy] = stateOf(g, rock);
    if (kg <= 0) {
      if (g.real - (m.tailAt || -9) > 1.5) { m.tailAt = g.real; Game.popup(g, 'TAILINGS', '#b3aeb8', x, y + rock.r); }
      return 0;
    }
    if (rock.host) m.chipped[rock.id] = inf.oreKg - kg; else rock.oreKg -= kg;
    m.buf[rock.id] = (m.buf[rock.id] || 0) + kg;
    const [tx, ty] = toward || [g.sh.x, g.sh.y], dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
    while (m.buf[rock.id] >= CHUNK) {
      m.buf[rock.id] -= CHUNK;
      Game.spawnPickup(g, { x: x + dx / d * (rock.r + 0.4), y: y + dy / d * (rock.r + 0.4), item: T.ore, qty: CHUNK,
                            vx: vx + dx / d * 3 + (Math.random() - 0.5) * 0.6, vy: vy + dy / d * 3 + (Math.random() - 0.5) * 0.6 });
    }
    if (inf.oreKg - kg <= 0) { Game.popup(g, 'TAILINGS', '#b3aeb8', x, y + rock.r); Game.log(g, `rock ${rock.id} lasered down to tailings`); }
    return kg;
  }


  // ======================================================================
  //  SELLING: the Crusher and the stations
  // ======================================================================

  function crusherState(g, t) {
    const mo = g.w.byId.mochi, a = CRUSHER.a, n = Math.sqrt(g.w.root.mu / (a * a * a));
    const th = (mo ? mo.n * t + mo.phase : n * t) + CRUSHER.dph, c = Math.cos(th), s = Math.sin(th);
    return [a * c, a * s, -a * n * s, a * n * c];
  }

  // [{ id, name, x, y, vx, vy, r, mult(type) }]
  function sellPoints(g) {
    const [x, y, vx, vy] = crusherState(g, g.t);
    const out = [{ id: CRUSHER.id, name: CRUSHER.name, x, y, vx, vy, r: CRUSHER.r, mult: (type) => BUY.crusher[type] ?? 0 }];
    for (const st of stationsOf(g)) {
      const buy = BUY[st.id];
      if (!buy) continue;
      const [sx, sy, svx, svy] = st.state(g.t);
      out.push({ id: st.id, name: st.name, x: sx, y: sy, vx: svx, vy: svy, r: st.r, mult: (type) => buy[type] ?? 0 });
    }
    return out;
  }

  // the buyer the towed rock is at: { sp, rk, d, v, pay, slow } or null
  function atBuyer(g) {
    const rk = towed(g);
    if (!rk) return null;
    let best = null;
    for (const sp of sellPoints(g)) {
      const d = Math.hypot(rk.x - sp.x, rk.y - sp.y) - sp.r - rk.r;
      if (d < SELL_R && (!best || d < best.d)) best = { sp, rk, d, v: Math.hypot(rk.vx - sp.vx, rk.vy - sp.vy) };
    }
    if (best) Object.assign(best, { pay: payout(rk.oreKg, rk.gem, TYPES[rk.type], best.sp.mult(rk.type)), slow: best.v < SELL_V });
    return best;
  }

  function sell(g, sp) {
    const m = g.mod.haul, rk = towed(g);
    if (!rk) return 0;
    const T = TYPES[rk.type], pay = payout(rk.oreKg, rk.gem, T, sp.mult(rk.type));
    g.money += pay; m.stats.sold += pay; m.stats.tonnes += rk.m;
    if (sp.id === CRUSHER.id) m.chompAt = g.real;
    Game.popup(g, 'CRUNCH!', GOLD, rk.x, rk.y, 34);
    Game.burst(g, 'dust', rk.x, rk.y, 36, { vx: rk.vx, vy: rk.vy, speed: 2 + rk.r / 2, col: T.col[1] });
    if (rk.type === 'sparkle' && sp.id === 'rusts') Game.popup(g, 'Platinum? Never heard of her.', '#ff7eb6', sp.x, sp.y + sp.r + 6, 18);
    Game.toast(g, `SOLD ${rk.type.toUpperCase()} ${fmtMass(rk.m)} TO ${sp.name.toUpperCase()}: +${fmtMoney(pay)}`, '#8ff0b0', 'haul');
    removeFree(g, rk, `sold to ${sp.name}: ${rk.type} ${rk.m.toFixed(0)} t, ${rk.oreKg.toFixed(0)} kg ${T.ore}${rk.gem ? ` + ${rk.gem}` : ''} at x${sp.mult(rk.type)}: ${fmtMoney(pay)}`);
    Game.goal(g, 'haul');
    if (rk.m >= WHALE) { m.stats.whale++; Game.goal(g, 'whale'); }
    return pay;
  }

  // docking with a rock on the rope: a buyer takes it, anywhere else the rope lets go
  function dockedWithRock(g) {
    const at = typeof Stations !== 'undefined' && Stations && Stations.dockedAt ? Stations.dockedAt(g) : null;
    const sp = at && sellPoints(g).find((p) => p.id === at.id);
    if (sp) sell(g, sp);
    else { release(g, `docked at ${g.attach ? g.attach.name : 'a port'}, which buys no rocks`); Game.toast(g, 'THIS PORT BUYS NO ROCKS: ROPE RELEASED', '#ff9f1c', 'haul'); }
  }


  // ======================================================================
  //  DEV ROCKS
  // ======================================================================

  // a free rock 3 r + S.radius ahead of the nose, matching the ship's velocity
  function devRock(g, type = 'gravel', r = 4) {
    const m = g.mod.haul, sh = g.sh, T = TYPES[type] ? type : 'gravel', D = 3 * r + g.S.radius, id = m.nextId++;
    const rk = makeFree(g, { id, type: T, r, x: sh.x + Math.cos(sh.ang) * D, y: sh.y + Math.sin(sh.ang) * D, vx: sh.vx, vy: sh.vy,
                              gem: hash(g.seed, id, 77) < TYPES[T].gemP ? TYPES[T].gem : null, spin: 0.2, tone: 0.5 });
    addFree(g, rk);
    Game.log(g, `dev rock ${id}: ${T} r ${r} m, ${fmtMass(rk.m)}, ${fmtMoney(payout(rk.oreKg, rk.gem, TYPES[T], 1))}`);
    return rk;
  }


  // ======================================================================
  //  HOOKS
  // ======================================================================

  function init(g) {
    g.mod.haul = { free: [], tow: null, shot: null, charges: [], gone: [], chipped: {}, types: {}, buf: {}, nextId: FIRST_ID,
                   stats: { towed: 0, tonnes: 0, cracked: 0, sold: 0, whale: 0 }, stock: { crack1: 0, crack2: 0, crack3: 0 },
                   tension: 0, taut: false, reel: 0, aim: null, pendingTow: null, chompAt: -9 };
  }

  function stats(g, S) {
    if (g.dev && !g.mod.economy && !(S.towMax > 0)) Object.assign(S, DEV_GEAR);
  }

  function save(g) {
    const m = g.mod.haul;
    return { v: 1, t: g.t, gone: m.gone.slice(), chipped: { ...m.chipped }, nextId: m.nextId, stats: { ...m.stats },
             free: m.free.map((rk) => ({ id: rk.id, type: rk.type, r: rk.r, m: rk.m, oreKg: rk.oreKg, gem: rk.gem,
                                         x: rk.x, y: rk.y, vx: rk.vx, vy: rk.vy, ang: rk.ang, spin: rk.spin, tone: rk.tone })),
             tow: m.tow ? { id: m.tow.id, len: m.tow.len } : null };
  }

  // defensive: unknown ids and malformed rocks are skipped; a save from another time keeps rocks near the body they flew by
  function load(g, d) {
    const m = g.mod.haul, fin = Number.isFinite;
    if (!d || d.v !== 1) return;
    for (const id of Array.isArray(d.gone) ? d.gone : []) {
      const rk = g.w.rocks[id];
      if (rk && rk.id === id && !rk.gone) { rk.gone = true; m.gone.push(id); }
    }
    for (const [id, kg] of Object.entries(d.chipped || {})) if (fin(kg) && g.w.rocks[id]) m.chipped[id] = kg;
    if (fin(d.nextId)) m.nextId = Math.max(FIRST_ID, d.nextId);
    if (d.stats) for (const k in m.stats) if (fin(d.stats[k])) m.stats[k] = d.stats[k];
    for (const o of Array.isArray(d.free) ? d.free : []) {
      if (!o || !TYPES[o.type] || !['id', 'r', 'm', 'oreKg', 'x', 'y', 'vx', 'vy'].every((k) => fin(o[k]))) continue;
      const rk = makeFree(g, { ...o, gem: ITEMS[o.gem] ? o.gem : null, out: null });
      if (fin(d.t) && d.t !== g.t) reanchor(g, rk, d.t);
      m.free.push(rk);
    }
    if (d.tow && fin(d.tow.id) && fin(d.tow.len)) m.pendingTow = { id: d.tow.id, len: d.tow.len };
  }
  function reanchor(g, rk, t0) {
    const b = World.refBody(g.w, rk.x, rk.y, t0);
    if (!b.par) return;
    const s0 = World.bodyState(g.w, b, t0), s1 = World.bodyState(g.w, b, g.t);
    rk.x += s1[0] - s0[0]; rk.y += s1[1] - s0[1]; rk.vx += s1[2] - s0[2]; rk.vy += s1[3] - s0[3];
  }

  function ready(g) {
    const m = g.mod.haul, p = m.pendingTow, rk = p && freeById(m, p.id);
    m.pendingTow = null;
    if (rk && Math.hypot(rk.x - g.sh.x, rk.y - g.sh.y) <= p.len + rk.r + g.S.radius + 3) { m.tow = { id: rk.id, len: p.len }; rk.towed = true; }
    else if (p) Game.log(g, `rock ${p.id} was in tow at the save, but the ship is elsewhere now: left it free`);
    if (g.dev && !econ(g)) for (const c of CHARGES) m.stock[c.id] = c.max;
  }

  function died(g) { if (g.mod.haul.tow) release(g, 'ship lost'); g.mod.haul.shot = null; }
  function respawn(g) { if (g.mod.haul.tow) release(g, 'towed home'); g.mod.haul.shot = null; }

  function onKey(g, code) {
    if (g.mode !== 'ship' || g.ui || g.status === 'dead') return false;
    if (code === 'KeyG') { grapple(g); return true; }
    if (code === 'KeyB') { plant(g); return true; }
    return false;
  }

  function frame(g, inp, dt, simDt) {
    const m = g.mod.haul;
    if (m.shot && g.t - m.shot.t0 >= HARPOON_T) latch(g);
    if (m.tow && g.status === 'docked') dockedWithRock(g);
    const k = (c) => inp.keys.has(c);
    m.reel = m.tow && g.mode === 'ship' && !g.ui ? (k('KeyZ') ? 1 : 0) - (k('KeyQ') ? 1 : 0) : 0;
    if (simDt > 0) tickCharges(g, simDt);
    m.aim = (g.S.towMax ?? 0) > 0 && g.mode === 'ship' && g.status === 'flying' && !m.tow && !m.shot ? aimed(g) : null;
  }

  function warpLimit(g) {
    const m = g.mod.haul;
    if (m.shot) return { max: 1, why: 'harpoon away' };
    if (m.charges.length) return { max: 1, why: 'charge armed' };
    if (m.tow) return { max: TOW_WARP, why: 'rock in tow' };
    return null;
  }

  // a long gentle burn with a rock in tow (whole system under BURN_A) may warp: a 20-minute whale burn is not played at 1x
  function burnWarp(g) {
    const rk = towed(g);
    if (!rk) return 1;
    return g.S.thrust / (Physics.mass(g.sh, g.S) + rk.m) < BURN_A ? BURN_WARP : 1;
  }

  function interactions(g) {
    const m = g.mod.haul;
    if (!m.tow || g.mode !== 'ship' || g.status !== 'flying' || g.ui) return null;
    const b = atBuyer(g);
    if (!b) return null;
    const what = `${fmtMass(b.rk.m)} ${b.rk.type}`;
    if (b.slow) return [{ key: 'KeyF', dist: -1, col: '#8ff0b0', text: `Sell ${what} to ${b.sp.name} for ${fmtMoney(b.pay)}`, act: (g2) => sell(g2, b.sp) }];
    return [{ key: 'KeyF', dist: -1, col: '#ffb36b', text: `Slow the rock to under ${SELL_V} m/s to sell it to ${b.sp.name} (now ${b.v.toFixed(1)})`,
              act: (g2) => Game.toast(g2, `TOO FAST TO SELL: ${b.v.toFixed(1)} M/S (< ${SELL_V})`, '#ff9f1c', 'haul') }];
  }

  function navTargets(g) {
    return [{ id: CRUSHER.id, name: CRUSHER.name, col: GOLD, r: CRUSHER.r, kind: 'crusher', state: (t) => crusherState(g, t) }];
  }

  const dvWithRock = (g, rk) => { const mS = Physics.mass(g.sh, g.S), M = mS + rk.m; return g.S.ve * Math.log(M / (M - g.sh.fuel)); };
  const accWithRock = (g, rk) => g.S.thrust / (Physics.mass(g.sh, g.S) + rk.m);

  function hint(g) {
    const m = g.mod.haul;
    if (g.mode !== 'ship' || g.status === 'dead') return null;
    if (m.charges.length) {
      const c = m.charges[0], rk = rockById(g, c.id), Rb = rk ? rk.r + 4 * Math.cbrt(c.kg) : 0;
      return { pri: 79, text: `${c.name} armed: BOOM in ${Math.max(0, c.left).toFixed(0)} s. Get clear: the blast reaches ${Rb.toFixed(0)} m. Then G a piece and sell it.` };
    }
    const rk = towed(g);
    if (rk) {
      const b = atBuyer(g), what = `${rk.type} ${fmtMass(rk.m)}`;
      if (b && b.slow) return { pri: 60, text: `Press F: ${b.sp.name} pays ${fmtMoney(b.pay)} for the ${what}.` };
      if (b) return { pri: 60, text: `Match speed with ${b.sp.name}: get the rock under ${SELL_V} m/s (now ${b.v.toFixed(1)}), then F sells it.` };
      return { pri: 46, text: `Towing ${what} (${fmtMoney(payout(rk.oreKg, rk.gem, TYPES[rk.type], 1))}, ${dvWithRock(g, rk).toFixed(1)} m/s of Δv with it). ` +
        `Turn your tail to it and burn: the rope pulls. Q / Z reel, B cracks, G lets go. Sell at the Crusher or a station (Tab, then F within ${SELL_R} m).` };
    }
    const c = m.aim;
    if (c) {
      const what = `${c.inf.type} ${fmtMass(c.inf.m)}`;
      if (c.inf.m > (g.S.towMax ?? 0)) return { pri: 44, text: `That ${what} is over your ${fmtMass(g.S.towMax)} winch. Crack it first: B plants a charge within ${PLANT_R} m.` };
      if (c.v > LATCH_V) return { pri: 44, text: `Match speed with the ${what} (${c.v.toFixed(1)} m/s now, under ${LATCH_V} to latch), then G.` };
      return { pri: 44, text: `Press G to harpoon the ${what} ahead (${fmtMoney(c.inf.value)} at the Hub).` };
    }
    if ((g.S.towMax ?? 0) > 0 && !m.stats.towed && g.status === 'flying')
      return { pri: 13, text: `Tow gear fitted: nose at a rock (±40°) within ${(g.S.cableLen ?? 0).toFixed(0)} m, match speed, press G.` };
    return null;
  }

  function controls(g) {
    if (!g.mod.haul.tow || g.mode !== 'ship') return null;
    return 'W burn · A/D spin · Q reel in · Z pay out · B crack · G let go · F sell at a buyer · Tab target · , . warp · M map';
  }

  function hudRows(g) {
    const m = g.mod.haul, rk = towed(g), rows = [];
    if (rk) {
      const dv = dvWithRock(g, rk);
      rows.push({ label: 'TOW', val: `${rk.type} ${fmtMass(rk.m)} · ${fmtMoney(payout(rk.oreKg, rk.gem, TYPES[rk.type], 1))}`, col: TYPES[rk.type].col[1] });
      rows.push({ label: 'CABLE', val: `${m.tow.len.toFixed(1)}/${(g.S.cableLen ?? 0).toFixed(0)} m · ${m.tension.toFixed(1)} kN`, col: m.tension > TAUT_KN ? '#e63946' : INK });
      rows.push({ label: 'Δv W/ ROCK', val: `${dv.toFixed(1)} m/s · ${accWithRock(g, rk).toFixed(3)} m/s²`, col: dv < 2 ? '#e63946' : INK });
    }
    if (m.charges.length) rows.push({ label: 'CHARGE', val: `${m.charges[0].name}: BOOM ${Math.max(0, m.charges[0].left).toFixed(1)} s`, col: '#e63946' });
    else if (rk || (g.S.towMax ?? 0) > 0) {
      const have = charges(g);
      if (CHARGES.some((c) => have[c.id] > 0)) rows.push({ label: 'CHARGES (B)', val: CHARGES.map((c) => have[c.id] || 0).join(' · ') });
    }
    return rows;
  }


  // ======================================================================
  //  DRAWING
  // ======================================================================

  function paintRock(g, kit, rk) {
    const ctx = kit.ctx, px = kit.px(), [sx, sy] = kit.toScreen(rk.x, rk.y);
    if (!kit.onScreen(sx, sy, rk.r / px * 1.4 + 10)) return;
    if (typeof Render !== 'undefined' && Render && Render.drawRockAt) { Render.drawRockAt(g, rk, rk.x, rk.y, rk.ang); return; }
    const T = TYPES[rk.type], col = rk.oreKg > 0 ? T.col : TAILINGS_COL, R = Math.max(rk.r, 3 * px);
    kit.toonBlob(rk.out, rk.x, rk.y, R, rk.ang, col, 2.2 * px);
    if (R < 6 * px || rk.oreKg <= 0) return;
    const c = Math.cos(rk.ang), s = Math.sin(rk.ang), at = (u, v) => [rk.x + R * (u * c - v * s), rk.y + R * (u * s + v * c)];
    ctx.lineWidth = 1.2 * px; ctx.strokeStyle = INK;
    if (rk.type === 'slush') for (const [u, v] of [[-0.3, 0.2], [0.25, -0.3], [0.1, 0.35]]) { const [x, y] = at(u, v); ctx.beginPath(); ctx.arc(x, y, R * 0.07, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    if (rk.type === 'clank') {
      for (const [u, v] of [[-0.35, -0.2], [0.3, 0.25], [0.05, -0.4]]) { const [x, y] = at(u, v); ctx.beginPath(); ctx.arc(x, y, R * 0.08, 0, 7); ctx.fillStyle = '#c4703a'; ctx.fill(); }
      const [x0, y0] = at(-0.15, 0.3), [x1, y1] = at(0.15, 0.45); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * px; ctx.stroke();
    }
    if (rk.type === 'sparkle') for (const [u, v, ph] of [[-0.3, 0.1, 0], [0.3, -0.2, 2], [0, 0.4, 4]]) {
      const [x, y] = at(u, v), k = R * 0.16 * (0.6 + 0.4 * Math.sin(g.real * 3 + ph));
      ctx.beginPath(); ctx.moveTo(x - k, y); ctx.lineTo(x + k, y); ctx.moveTo(x, y - k); ctx.lineTo(x, y + k);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6 * px; ctx.stroke();
    }
  }

  // a dark puck with a red LED: 2 Hz, 8 Hz in the last second
  function paintCharge(g, kit, c) {
    const rk = rockById(g, c.id);
    if (!rk) return;
    const ctx = kit.ctx, px = kit.px(), [x, y] = chargePos(g, c, rk), r = Math.max(0.5, 5 * px);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = '#2c2442'; ctx.fill();
    ctx.lineWidth = 2 * px; ctx.strokeStyle = INK; ctx.stroke();
    const on = Math.floor(g.real * (c.left < 1 ? 16 : 4)) % 2 === 0;
    ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 2 * Math.PI); ctx.fillStyle = on ? '#ff3b3b' : '#5a1020'; ctx.fill();
    if (on) { ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(255,80,80,0.25)'; ctx.fill(); }
  }

  // the Crusher: a dark toon box with a jaw, googly eyes on the ship, a smokestack and a gold sign (upright on screen)
  function paintCrusher(g, kit) {
    const ctx = kit.ctx, px = kit.px(), [x, y] = crusherState(g, g.t), [sx, sy] = kit.toScreen(x, y);
    if (!kit.onScreen(sx, sy, CRUSHER.r / px * 1.3 + 20)) return;
    const s = CRUSHER.r / 22, lw = Math.max(2.5 * px, 0.25 * s) / s;
    ctx.save(); ctx.translate(x, y); ctx.rotate(kit.cam.rot); ctx.scale(s, -s);
    if (CRUSHER.r / px < 10) { ctx.beginPath(); ctx.arc(0, 0, 10 * px / s, 0, 7); ctx.fillStyle = DARK[0]; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); return; }
    ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = INK;
    const box = () => kit.roundRect(-20, -16, 40, 33, 6), shadeRight = kit.LIGHT[0] * Math.cos(kit.cam.rot) + kit.LIGHT[1] * Math.sin(kit.cam.rot) < 0;
    // smokestack with a beacon
    ctx.fillStyle = DARK[1]; kit.roundRect(10, -27, 6, 13, 1.5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(13, -28.5, 2, 0, 7); ctx.fillStyle = Math.floor(g.real * 1.5) % 2 ? '#ff3b3b' : '#7a1a2a'; ctx.fill(); ctx.stroke();
    // body, toon shaded
    box(); ctx.fillStyle = DARK[0]; ctx.fill();
    ctx.save(); box(); ctx.clip();
    ctx.fillStyle = DARK[1]; ctx.fillRect(shadeRight ? 10 : -22, -18, 12, 38);
    ctx.fillStyle = DARK[2]; ctx.fillRect(shadeRight ? -16 : 13, -13, 3, 24);
    ctx.restore(); box(); ctx.stroke();
    // the jaw (chomps three times after a sale)
    const since = g.real - g.mod.haul.chompAt, gape = since < 1.2 ? 3 * Math.abs(Math.sin(since / 1.2 * 3 * Math.PI)) : 3;
    ctx.fillStyle = '#2c2442'; kit.roundRect(-23, 0, 20, 6 + gape, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER; ctx.lineWidth = lw * 0.6;
    for (let i = 0; i < 4; i++) {
      const tx = -21.5 + i * 4.6;
      ctx.beginPath(); ctx.moveTo(tx, 0.3); ctx.lineTo(tx + 3.6, 0.3); ctx.lineTo(tx + 1.8, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx, 5.7 + gape); ctx.lineTo(tx + 3.6, 5.7 + gape); ctx.lineTo(tx + 1.8, 3 + gape); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(6, 3, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();      // smile
    // googly eyes, glancing at the ship
    const [shx, shy] = kit.toScreen(g.sh.x, g.sh.y), lk = Math.atan2(shy - sy, shx - sx);
    for (const ex of [-6, 6]) {
      ctx.beginPath(); ctx.ellipse(ex, -8, 4.6, 5.4, 0, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex + Math.cos(lk) * 2, -8 + Math.sin(lk) * 2.4, 2, 0, 7); ctx.fillStyle = INK; ctx.fill();
    }
    // the sign
    ctx.font = `700 4.4px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sw = Math.max(30, ctx.measureText('THE CRUSHER').width + 5);
    ctx.fillStyle = GOLD; kit.roundRect(-sw / 2, 19, sw, 7.5, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText('THE CRUSHER', 0, 22.9);
    ctx.font = `600 2.6px ${FONT}`; ctx.fillStyle = PAPER; ctx.fillText('WE BUY ROCKS · WHOLE', 0, 12.5);
    ctx.restore();
  }

  // dashed ring round the rock G would take: green ok, orange too fast, red too big
  function paintAim(g, kit) {
    const c = g.mod.haul.aim;
    if (!c) return;
    const ctx = kit.ctx, px = kit.px(), ok = c.inf.m <= (g.S.towMax ?? 0), col = !ok ? '#ff5d5d' : c.v > LATCH_V ? '#ffb36b' : '#8ff0b0', [x, y] = stateOf(g, c.rk);
    ctx.beginPath(); ctx.arc(x, y, c.rk.r * 1.25 + 6 * px, 0, 2 * Math.PI);
    ctx.setLineDash([6 * px, 5 * px]); ctx.lineDashOffset = -g.real * 12 * px; ctx.lineWidth = 2.5 * px; ctx.strokeStyle = col; ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWorld(g, kit) {
    const m = g.mod.haul;
    paintCrusher(g, kit);
    for (const rk of m.free) paintRock(g, kit, rk);
    for (const c of m.charges) paintCharge(g, kit, c);
    paintAim(g, kit);
  }

  // where the cable leaves the hull as drawn (never shorter than 34 px): the nose claw for a rock ahead, else the
  //  tow hitch on the leg on its side. The rope really pulls on the centre of mass, so it never torques the ship.
  function hitch(g, kit, tx, ty) {
    const sh = g.sh, L = Math.max(g.S.length, 34 * kit.px()), c = Math.cos(sh.ang), s = Math.sin(sh.ang);
    const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy) || 1;
    if (tx == null || (dx * c + dy * s) / d > -0.2) return [sh.x + c * 0.6 * L, sh.y + s * 0.6 * L, true];
    const side = -s * dx + c * dy >= 0 ? 1 : -1;
    return [sh.x - c * 0.5 * L - s * side * 0.32 * L, sh.y - s * 0.5 * L + c * side * 0.32 * L, false];
  }

  // the cable sags with slack and pulls straight, thicker and redder, with tension
  function drawWorldTop(g, kit) {
    const m = g.mod.haul, ctx = kit.ctx, px = kit.px();
    if (g.status === 'dead' || (!m.tow && !m.shot && !((g.S.towMax ?? 0) > 0))) return;
    const rk = towed(g), aim = rk ? [rk.x, rk.y] : m.shot ? stateOf(g, m.shot.rk) : [null, null], [nx, ny, nose] = hitch(g, kit, aim[0], aim[1]);
    let end = null, slack = 0;
    if (rk) {
      const d = Math.hypot(rk.x - g.sh.x, rk.y - g.sh.y) || 1, ux = (g.sh.x - rk.x) / d, uy = (g.sh.y - rk.y) / d;
      end = [rk.x + ux * rk.r * 0.85, rk.y + uy * rk.r * 0.85];
      slack = Math.max(0, m.tow.len + rk.r + g.S.radius - d);
    } else if (m.shot) {
      const [x, y] = stateOf(g, m.shot.rk), f = Math.min(1, (g.t - m.shot.t0) / HARPOON_T);
      end = [nx + (x - nx) * f, ny + (y - ny) * f];
    }
    if (end) {
      const dx = end[0] - nx, dy = end[1] - ny, d = Math.hypot(dx, dy) || 1, sag = Math.min(0.4 * slack, 0.3 * d);
      const cx = (nx + end[0]) / 2 - dy / d * sag, cy = (ny + end[1]) / 2 + dx / d * sag, t = Math.min(1, m.tension / 40);
      const w = Math.max(3 * px, 0.5) * (1 + 0.5 * t);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(cx, cy, end[0], end[1]);
      ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke();
      ctx.strokeStyle = t > 0.5 ? '#ff7a3d' : t > 0.05 ? '#ffb347' : GOLD; ctx.lineWidth = w * 0.5; ctx.stroke();
      paintClaw(ctx, end[0], end[1], Math.atan2(dy, dx), px, true);
    }
    paintClaw(ctx, nx, ny, g.sh.ang, px, false, !end && nose);
  }

  // the winch drum at the nose, and the harpoon head (stowed on the drum, or out on the rock)
  function paintClaw(ctx, x, y, ang, px, head, stowed = false) {
    const u = Math.max(0.35, 3.4 * px), c = Math.cos(ang), s = Math.sin(ang);
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.8 * px, 0.12);
    if (!head) { ctx.beginPath(); ctx.arc(x, y, u * 0.9, 0, 2 * Math.PI); ctx.fillStyle = '#8c84b3'; ctx.fill(); ctx.stroke(); }
    if (!head && !stowed) return;
    const hx = head ? x : x + c * u * 1.1, hy = head ? y : y + s * u * 1.1, tip = head ? 1 : 1.8;
    ctx.beginPath();
    ctx.moveTo(hx + c * u * tip, hy + s * u * tip);
    ctx.lineTo(hx - s * u * 0.8, hy + c * u * 0.8);
    ctx.lineTo(hx - c * u * 0.3, hy - s * u * 0.3);
    ctx.lineTo(hx + s * u * 0.8, hy - c * u * 0.8);
    ctx.closePath(); ctx.fillStyle = '#c9c4e8'; ctx.fill(); ctx.stroke();
  }

  // labels: the towed rock's type, mass and value; the rock G would take; charge countdowns
  function drawScreen(g, kit) {
    const m = g.mod.haul;
    if (kit.cam.map) return;
    const py = kit.toScreen(g.sh.x, g.sh.y)[1];
    const label = (rk, x, y, text, col) => {                         // above or below the rock, whichever side is away from the ship
      const [sx, sy] = kit.toScreen(x, y), rr = rk.r * kit.cam.zoom;
      kit.tag(sx, sy > py + 2 ? sy + rr + 20 : sy - rr - 12, text, col);
    };
    const rk = towed(g);
    if (rk) label(rk, rk.x, rk.y, `${rk.type.toUpperCase()} ${fmtMass(rk.m)} · ${fmtMoney(payout(rk.oreKg, rk.gem, TYPES[rk.type], 1))}`, TYPES[rk.type].col[0]);
    const c = m.aim;
    if (c && g.mode === 'ship') {
      const ok = c.inf.m <= (g.S.towMax ?? 0), fast = c.v > LATCH_V;
      const [x, y] = stateOf(g, c.rk);
      label(c.rk, x, y, ok ? (fast ? `${c.v.toFixed(1)} m/s: too fast` : `G · ${c.inf.type} ${fmtMass(c.inf.m)} · ${fmtMoney(c.inf.value)}`) : `${fmtMass(c.inf.m)}: too big`,
            !ok ? '#ff9f9f' : fast ? '#ffb36b' : '#8ff0b0');
    }
    for (const ch of m.charges) {
      const r = rockById(g, ch.id);
      if (r) { const [x, y] = chargePos(g, ch, r); const [sx, sy] = kit.toScreen(x, y); kit.tag(sx, sy - 14, `${Math.max(0, ch.left).toFixed(1)} s`, '#ff9f9f'); }
    }
  }


  // ======================================================================
  //  REGISTER + JOBS
  // ======================================================================

  const mod = { id: 'haul', init, stats, load, save, ready, died, respawn, onKey, frame, step, warpLimit, burnWarp,
                interactions, navTargets, hint, controls, hudRows, drawWorld, drawWorldTop, drawScreen };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;

  Game.addGoals([
    { id: 'haul',  order: 77, reward: 250,  text: 'Tow a whole rock to a buyer and sell it (G hooks, F sells)' },
    { id: 'crack', order: 78, reward: 200,  text: 'Crack a rock with a charge (B)' },
    { id: 'whale', order: 97, reward: 5000, text: 'Sell a whale: one rock over 20,000 t' },
  ]);

  const towInfo = (g) => {
    const rk = towed(g);
    return rk ? { id: rk.id, x: rk.x, y: rk.y, r: rk.r, m: rk.m, len: g.mod.haul.tow.len, tension: g.mod.haul.tension, type: rk.type } : null;
  };

  return { TYPES, BUY, CRUSHER, CHARGES, typeOf, known, info, free, rayRocks, chip, blast, towInfo, sellPoints, devRock,
           rope, split, sell, crusherState, payout: (g, rk, mult = 1) => payout(rk.oreKg, rk.gem, TYPES[rk.type], mult) };
})();

if (typeof module !== 'undefined') module.exports = Haul;
