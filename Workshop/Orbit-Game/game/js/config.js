// ======================================================================
//  CONFIG  —  game-scaled constants (1 unit = 1 m, 1 s = 1 s)
//  The Crumb Belt: one great asteroid belt round the star Ember.
//  Real gravity, toy distances.  Module-specific numbers (prices,
//  stations, pirates...) live in each module file.
// ======================================================================

const CONFIG = {

  // ---------------- big bodies (on circular rails around their parent) ----------------
  //  g = surface gravity [m/s^2], mu = g R^2 (or given).   a = orbit radius around parent [m], phase = rail angle at t = 0
  //  ores: blobs of ore baked into the terrain grid (depth below the surface, m)
  //  gems: buried special items, found on EVA
  //  Lanes round Ember: inner 24 km, Mochi's 30 km, outer 36.5 km.  Bodies in different lanes stay further apart
  //  radially than Hill(Mochi) + their own Hill radius, so nothing ever sails through Mochi's moons.
  bodies: [
    { id: 'ember', name: 'Ember', parent: null, a: 0, phase: 0, R: 1200, mu: 2.53e7, star: true,
      shape: 0, color: ['#ffd36b', '#ff8a3d', '#fff3c4'] },

    // ---- Mochi's lane (a = 30 km): home, its moons, and co-orbiting neighbours that never drift ----
    { id: 'mochi', name: 'Mochi', parent: 'ember', a: 30000, phase: 0, R: 300, g: 2.0,
      shape: 0.02, color: ['#e9cfe0', '#a7819e', '#fff1f8'],
      ores: [{ mat: 'ice', blobs: 90, rMin: 1.5, rMax: 3.5, dMin: 1, dMax: 14 },
             { mat: 'iron', blobs: 45, rMin: 1, rMax: 2.5, dMin: 2, dMax: 16 }],
      gems: [{ type: 'salt', count: 40, dMin: 1.5, dMax: 10 }] },

    { id: 'dorito', name: 'Dorito', parent: 'mochi', a: 780, phase: 0.9, R: 34, g: 2.0,
      shape: 0.25, color: ['#e6a45e', '#a8643a', '#ffd29a'],
      ores: [{ mat: 'iron', blobs: 30, rMin: 1.2, rMax: 3, dMin: 1, dMax: 20 },
             { mat: 'nickel', blobs: 12, rMin: 1, rMax: 2.2, dMin: 3, dMax: 20 }],
      gems: [{ type: 'amber', count: 6, dMin: 2, dMax: 12 }] },

    { id: 'kiwi', name: 'Kiwi', parent: 'mochi', a: 1150, phase: 2.6, R: 52, g: 2.0,
      shape: 0.12, color: ['#a6c36f', '#5f8044', '#dcf0a6'],
      ores: [{ mat: 'ice', blobs: 24, rMin: 1.5, rMax: 3.5, dMin: 1, dMax: 25 },
             { mat: 'iron', blobs: 10, rMin: 1, rMax: 2.5, dMin: 2, dMax: 25 }],
      gems: [{ type: 'amber', count: 10, dMin: 2, dMax: 15 }] },

    { id: 'seed', name: 'Seed', parent: 'kiwi', a: 170, phase: 0.0, R: 11, g: 0.3,
      shape: 0.2, color: ['#ee9cbf', '#a95a86', '#ffd3e6'],
      ores: [{ mat: 'platinum', blobs: 6, rMin: 0.8, rMax: 1.6, dMin: 1, dMax: 8 }],
      gems: [{ type: 'opal', count: 5, dMin: 1, dMax: 7 }] },

    { id: 'pretzel', name: 'Pretzel', parent: 'ember', a: 30000, phase: 0.18, R: 40, g: 0.9,
      shape: 0.28, color: ['#d9a066', '#93602f', '#ffd7a3'],
      ores: [{ mat: 'ice', blobs: 26, rMin: 1.2, rMax: 3, dMin: 1, dMax: 22 },
             { mat: 'iron', blobs: 16, rMin: 1, rMax: 2.5, dMin: 2, dMax: 22 }],
      gems: [{ type: 'salt', count: 14, dMin: 1, dMax: 10 }] },

    { id: 'waffle', name: 'Waffle', parent: 'ember', a: 30000, phase: -0.20, R: 55, g: 1.1,
      shape: 0.1, color: ['#f0c27a', '#b07f3a', '#ffe6b5'],
      ores: [{ mat: 'iron', blobs: 30, rMin: 1.2, rMax: 3, dMin: 1, dMax: 28 },
             { mat: 'nickel', blobs: 14, rMin: 1, rMax: 2.2, dMin: 3, dMax: 28 }],
      gems: [{ type: 'amber', count: 10, dMin: 2, dMax: 16 }] },

    { id: 'nugget', name: 'Nugget', parent: 'ember', a: 30000, phase: 0.42, R: 30, g: 0.8,
      shape: 0.22, color: ['#e8b04a', '#a06c1e', '#ffe08f'],
      ores: [{ mat: 'iron', blobs: 14, rMin: 1, rMax: 2.5, dMin: 1, dMax: 16 },
             { mat: 'nickel', blobs: 10, rMin: 0.8, rMax: 2, dMin: 2, dMax: 16 }],
      gems: [{ type: 'amber', count: 6, dMin: 2, dMax: 12 }] },

    { id: 'crouton', name: 'Crouton', parent: 'ember', a: 30000, phase: -0.46, R: 35, g: 0.9,
      shape: 0.3, color: ['#d8b98a', '#9a7a4c', '#f6e2bd'],
      ores: [{ mat: 'ice', blobs: 20, rMin: 1, rMax: 2.5, dMin: 1, dMax: 18 },
             { mat: 'iron', blobs: 12, rMin: 1, rMax: 2.2, dMin: 2, dMax: 18 }],
      gems: [{ type: 'salt', count: 10, dMin: 1, dMax: 10 }] },

    // ---- outer lane (a = 36.5 km): Big Potato's pirate country ----
    { id: 'potato', name: 'Big Potato', parent: 'ember', a: 36500, phase: 0.55, R: 70, g: 2.2,
      shape: 0.18, color: ['#c9a27a', '#86643f', '#f0d3ad'],
      ores: [{ mat: 'nickel', blobs: 28, rMin: 1.2, rMax: 3, dMin: 1, dMax: 30 },
             { mat: 'platinum', blobs: 14, rMin: 0.8, rMax: 1.8, dMin: 4, dMax: 30 },
             { mat: 'iron', blobs: 20, rMin: 1.2, rMax: 3, dMin: 1, dMax: 30 }],
      gems: [{ type: 'opal', count: 8, dMin: 3, dMax: 20 }] },

    { id: 'tatertot', name: 'Tater Tot', parent: 'ember', a: 36500, phase: 0.95, R: 30, g: 0.8,
      shape: 0.2, color: ['#d6a35c', '#8f6532', '#f7d39a'],
      ores: [{ mat: 'nickel', blobs: 14, rMin: 1, rMax: 2.4, dMin: 1, dMax: 16 },
             { mat: 'iron', blobs: 10, rMin: 1, rMax: 2.4, dMin: 1, dMax: 16 }],
      gems: [{ type: 'amber', count: 6, dMin: 2, dMax: 12 }] },

    { id: 'pickle', name: 'Pickle', parent: 'ember', a: 36500, phase: -0.6, R: 45, g: 1.0,
      shape: 0.35, color: ['#8fbf5a', '#567a2e', '#d2f0a0'],
      ores: [{ mat: 'ice', blobs: 24, rMin: 1.2, rMax: 3, dMin: 1, dMax: 24 },
             { mat: 'nickel', blobs: 12, rMin: 1, rMax: 2.2, dMin: 2, dMax: 24 }],
      gems: [{ type: 'opal', count: 5, dMin: 2, dMax: 16 }] },

    { id: 'biscotti', name: 'Biscotti', parent: 'ember', a: 36500, phase: 2.4, R: 38, g: 0.9,
      shape: 0.32, color: ['#e3c9a0', '#a68a5e', '#fff0d6'],
      ores: [{ mat: 'iron', blobs: 16, rMin: 1, rMax: 2.6, dMin: 1, dMax: 20 },
             { mat: 'platinum', blobs: 6, rMin: 0.8, rMax: 1.6, dMin: 3, dMax: 20 }],
      gems: [{ type: 'amber', count: 6, dMin: 2, dMax: 14 }] },

    // ---- inner lane (a = 24 km): close to Ember, rich and dangerous ----
    { id: 'glimmer', name: 'Glimmer', parent: 'ember', a: 24000, phase: -0.9, R: 26, g: 1.2,
      shape: 0.3, color: ['#8fd3e8', '#4b8aa8', '#d9f6ff'],
      ores: [{ mat: 'platinum', blobs: 14, rMin: 0.8, rMax: 1.8, dMin: 1, dMax: 18 },
             { mat: 'ice', blobs: 10, rMin: 1, rMax: 2.5, dMin: 1, dMax: 18 }],
      gems: [{ type: 'voidopal', count: 9, dMin: 2, dMax: 16 }] },

    { id: 'gumdrop', name: 'Gumdrop', parent: 'ember', a: 24000, phase: 0.3, R: 28, g: 1.0,
      shape: 0.15, color: ['#f78fb3', '#b04f7a', '#ffd1e3'],
      ores: [{ mat: 'ice', blobs: 14, rMin: 1, rMax: 2.4, dMin: 1, dMax: 16 },
             { mat: 'nickel', blobs: 8, rMin: 0.8, rMax: 2, dMin: 2, dMax: 16 }],
      gems: [{ type: 'opal', count: 5, dMin: 2, dMax: 12 }] },

    { id: 'macaron', name: 'Macaron', parent: 'ember', a: 24000, phase: 1.6, R: 32, g: 1.0,
      shape: 0.12, color: ['#b9a6f2', '#7262b0', '#e8e0ff'],
      ores: [{ mat: 'nickel', blobs: 14, rMin: 1, rMax: 2.4, dMin: 1, dMax: 18 },
             { mat: 'platinum', blobs: 6, rMin: 0.8, rMax: 1.6, dMin: 3, dMax: 18 }],
      gems: [{ type: 'opal', count: 6, dMin: 2, dMax: 14 }] },

    { id: 'truffle', name: 'Truffle', parent: 'ember', a: 24000, phase: -2.2, R: 24, g: 1.0,
      shape: 0.35, color: ['#8a6a5a', '#523a30', '#c9a898'],
      ores: [{ mat: 'platinum', blobs: 8, rMin: 0.8, rMax: 1.6, dMin: 1, dMax: 14 },
             { mat: 'iron', blobs: 8, rMin: 1, rMax: 2, dMin: 1, dMax: 14 }],
      gems: [{ type: 'voidopal', count: 4, dMin: 2, dMax: 12 }] },
  ],

  // ---------------- rubble (no gravity: they just move, bump and hurt) ----------------
  //  rings: circular rails round a host, radius rMin..rMax.
  //  ecc: rocks get a small eccentricity (first-order epicycle), so they wander in and out of their rail.
  //  swarm: rocks share one semi-major axis a (so one mean motion: the swarm never shears apart), guiding
  //  centres spread over ±arc metres along the rail from angle lam, each on its own epicycle of eccentricity <= ecc.
  //  Streams sit between the lanes: inner 25.0-27.3 km, outer 32.7-34.3 km (outside Mochi's rings, every small
  //  body's Hill sphere and Big Potato's).
  rubble: [
    { count: 170, rMin: 470, rMax: 630, sizeMin: 2.5, sizeMax: 9, around: 'mochi' },
    { count: 18, rMin: 118, rMax: 145, sizeMin: 1.5, sizeMax: 4, around: 'kiwi' },
    { count: 40, rMin: 115, rMax: 190, sizeMin: 2, sizeMax: 7, around: 'potato' },
    { count: 60, rMin: 1950, rMax: 2150, sizeMin: 3, sizeMax: 11, around: 'mochi' },

    { swarm: 'The Crumbs',        around: 'ember', a: 26600, lam: 0.10, arc: 450, ecc: 0.004, count: 90, sizeMin: 2, sizeMax: 15 },
    { swarm: 'The Sprinkles',     around: 'ember', a: 25600, lam: 2.20, arc: 500, ecc: 0.003, count: 80, sizeMin: 1.5, sizeMax: 8 },
    { swarm: 'Popcorn Drift',     around: 'ember', a: 26100, lam: -2.0, arc: 400, ecc: 0.005, count: 80, sizeMin: 2, sizeMax: 14 },
    { swarm: 'Croutonium Cloud',  around: 'ember', a: 26900, lam: 4.00, arc: 350, ecc: 0.003, count: 70, sizeMin: 2, sizeMax: 12 },
    { swarm: 'The Gravel Gang',   around: 'ember', a: 33400, lam: 0.35, arc: 500, ecc: 0.003, count: 90, sizeMin: 2, sizeMax: 15 },
    { swarm: 'Jellybean Stream',  around: 'ember', a: 33600, lam: -1.1, arc: 600, ecc: 0.002, count: 80, sizeMin: 1.5, sizeMax: 9 },
    { swarm: 'Rubble Trouble',    around: 'ember', a: 33100, lam: 2.80, arc: 450, ecc: 0.004, count: 80, sizeMin: 2.5, sizeMax: 15 },
    { count: 100, rMin: 25000, rMax: 27300, ecc: 0.0015, sizeMin: 1.5, sizeMax: 7, around: 'ember' },
    { count: 100, rMin: 32700, rMax: 34300, ecc: 0.0015, sizeMin: 1.5, sizeMax: 7, around: 'ember' },
  ],

  // ---------------- base mining ship "Prospector" ----------------
  //  Game.recalc(g) copies this into g.S and lets module `stats` hooks (upgrades, engines, fuels) modify it.
  //  Physics and every module read g.S, never CONFIG.ship directly.
  ship: {
    name: 'Prospector',
    dry: 1.0,                 // dry mass [t]  (engines, tanks, guns add to it)
    fuel: 1.4,                // main tank capacity [t]  (= tank volume x fuel density)
    fuelType: 'methalox',
    engine: 'sparrow',
    ve: 450,                  // exhaust velocity [m/s]   (shown as real-equivalent Isp = ve * ISP_SCALE / 9.81)
    thrust: 7,                // main engine [kN]   ->  2.9 m/s^2 full, TWR 1.46 on Mochi
    fine: 0.15,               // throttle while holding Shift
    ionThrust: 0,             // ion cruise drive [kN]  (0 = not fitted)
    ionVe: 0,                 // ion exhaust velocity [m/s]
    ionTank: 0,               // ion propellant capacity [t]
    rotAccel: 2.4,            // RCS angular acceleration at full mass [rad/s^2]
    transAccel: 0.4,          // RCS translation at full mass [m/s^2]
    rcs: 30,                  // RCS monoprop capacity [units]
    rcsRotUse: 1.0,           // units/s while rotating
    rcsTransUse: 1.5,         // units/s while translating
    radius: 4,                // collision radius [m]
    length: 9,                // drawn length [m]
    landSpeed: 2.5,           // touchdown below this = gentle landing [m/s]
    crashSpeed: 7,            // above this into terrain = destroyed [m/s]
    bounce: 0.4,              // restitution for bumps
    hull: 100,                // max hull
    armor: 0,                 // fraction of incoming damage absorbed (0..0.8)
    bumpDamage: 6,            // hull lost per m/s of impact speed
    cargoCap: 300,            // cargo hold [kg]
    tractor: 0,               // extra pickup scoop radius [m]
    scanner: 0,               // 0 none · 1 shows gems within 25 m on foot · 2 shows all gems on the body
    warpBurnMax: 16,          // max time warp while the ion drive burns
    orionJ: 60,               // nuclear pulse impulse [kN s]  (dv = J / mass)

    // ---- suit (EVA) ----
    packCap: 40,              // backpack [kg]
    suitHp: 100,
    o2: 150,                  // seconds of air outside
    jet: 3.0,                 // jetpack acceleration [m/s^2]
    jetFuel: 5,               // seconds of jetpack burn (refills inside the ship)
    walk: 3.0,                // walk speed [m/s] (capped on tiny moons)
    laserPower: 1.0,          // dig units per second (regolith hardness 1)
    laserRange: 7,            // [m]
    laserDps: 18,             // damage per second to bugs / pirates

    // ---- weapons (0 = none fitted) ----
    gun: 0,                   // gun level
    gunDmg: 0,                // damage per bullet
    gunRate: 0,               // bullets per second
    gunSpeed: 0,              // muzzle speed relative to the ship [m/s]
    turret: 0,                // 1 = aims at the mouse instead of the nose
  },

  // ---------------- tradeable items  (qty units; kg per unit; base price per unit) ----------------
  items: {
    ice:      { name: 'Water ice',     kg: 1,  price: 0.8,  col: '#c4ecff', kind: 'ore' },
    iron:     { name: 'Iron ore',      kg: 1,  price: 1.6,  col: '#d98a5f', kind: 'ore' },
    nickel:   { name: 'Nickel',        kg: 1,  price: 3.2,  col: '#bccb94', kind: 'ore' },
    platinum: { name: 'Platinum',      kg: 1,  price: 18,   col: '#eef1ff', kind: 'ore' },
    salt:     { name: 'Salt crystal',  kg: 2,  price: 45,   col: '#f4f0ff', kind: 'gem' },
    amber:    { name: 'Kiwi amber',    kg: 2,  price: 90,   col: '#ffb347', kind: 'gem' },
    opal:     { name: 'Fire opal',     kg: 1,  price: 220,  col: '#ff7eb6', kind: 'gem' },
    voidopal: { name: 'Void opal',     kg: 1,  price: 650,  col: '#8f6bff', kind: 'gem' },
    jelly:    { name: 'Bug jelly',     kg: 3,  price: 30,   col: '#9df07a', kind: 'bio' },
    scrap:    { name: 'Scrap metal',   kg: 10, price: 14,   col: '#a7a2b8', kind: 'salvage' },
    parts:    { name: 'Ship parts',    kg: 5,  price: 70,   col: '#ffd166', kind: 'salvage' },
    core:     { name: 'Reactor core',  kg: 30, price: 600,  col: '#7cf5d6', kind: 'salvage' },
  },
  ISP_SCALE: 8,               // game ve x 8 = real-world exhaust velocity (methalox 450 -> 3600 m/s -> Isp 367 s)

  // ---------------- simulation ----------------
  sim: {
    dt: 1 / 240,              // physics step [s] (always, whenever anything is near or an engine / EVA is active)
    dtMax: 0.5,               // adaptive step ceiling far from everything (big warps)
    dynFrac: 0.02,            // ...and at most this fraction of sqrt(r^3 / mu) for every body
    gapFrac: 0.2,             // ...and at most this fraction of (clearance / closing speed) to every surface and rock
    maxSteps: 256,            // physics steps per frame, at most
    warps: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
    nearWarp: 4,              // max warp within 40 m of rubble or a surface
    impactWarnT: 20,          // warp drops to 1x when the path hits something within this many seconds
    predictSteps: 1500,       // trajectory preview resolution
    predictMin: 60,           // preview horizon bounds [s]
    predictMax: 600,
    predictBelt: 4000,        // horizon out in the belt (reference body = the star) [s]
    predictBeltSteps: 1500,   // ...in this many steps (2.7 s each; impacts are tested along every segment, so nothing small is skipped)
    starKill: 3,              // flying within this many star radii: SIZZLE
    starWarn: 6,              // ...warned from this many
  },
};

if (typeof module !== 'undefined') module.exports = CONFIG;
