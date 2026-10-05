// ======================================================================
//  CONFIG  —  game-scaled constants (1 unit = 1 m, 1 s = 1 s)
//  A shrunken Ceres neighbourhood: real gravity, toy distances.
//  Module-specific numbers (prices, stations, pirates...) live in each module file.
// ======================================================================

const CONFIG = {

  // ---------------- big bodies (on circular rails around their parent) ----------------
  //  g = surface gravity [m/s^2], mu = g R^2.   a = orbit radius around parent [m]
  //  ores: blobs of ore baked into the terrain grid (depth below the surface, m)
  //  gems: buried special items, found on EVA
  bodies: [
    { id: 'ceres', name: 'Ceres', parent: null, a: 0, phase: 0, R: 300, g: 2.0,
      shape: 0.02, color: ['#9aa7c7', '#5f6a92', '#d6def2'],
      ores: [{ mat: 'ice', blobs: 90, rMin: 1.5, rMax: 3.5, dMin: 1, dMax: 14 },
             { mat: 'iron', blobs: 45, rMin: 1, rMax: 2.5, dMin: 2, dMax: 16 }],
      gems: [{ type: 'salt', count: 40, dMin: 1.5, dMax: 10 }] },

    { id: 'dorito', name: 'Dorito', parent: 'ceres', a: 780, phase: 0.9, R: 34, g: 2.0,
      shape: 0.25, color: ['#e6a45e', '#a8643a', '#ffd29a'],
      ores: [{ mat: 'iron', blobs: 30, rMin: 1.2, rMax: 3, dMin: 1, dMax: 20 },
             { mat: 'nickel', blobs: 12, rMin: 1, rMax: 2.2, dMin: 3, dMax: 20 }],
      gems: [{ type: 'amber', count: 6, dMin: 2, dMax: 12 }] },

    { id: 'kiwi', name: 'Kiwi', parent: 'ceres', a: 1150, phase: 2.6, R: 52, g: 2.0,
      shape: 0.12, color: ['#a6c36f', '#5f8044', '#dcf0a6'],
      ores: [{ mat: 'ice', blobs: 24, rMin: 1.5, rMax: 3.5, dMin: 1, dMax: 25 },
             { mat: 'iron', blobs: 10, rMin: 1, rMax: 2.5, dMin: 2, dMax: 25 }],
      gems: [{ type: 'amber', count: 10, dMin: 2, dMax: 15 }] },

    { id: 'seed', name: 'Seed', parent: 'kiwi', a: 170, phase: 0.0, R: 11, g: 0.3,
      shape: 0.2, color: ['#ee9cbf', '#a95a86', '#ffd3e6'],
      ores: [{ mat: 'platinum', blobs: 6, rMin: 0.8, rMax: 1.6, dMin: 1, dMax: 8 }],
      gems: [{ type: 'opal', count: 5, dMin: 1, dMax: 7 }] },

    { id: 'potato', name: 'Big Potato', parent: 'ceres', a: 1750, phase: 4.2, R: 70, g: 2.2,
      shape: 0.18, color: ['#c9a27a', '#86643f', '#f0d3ad'],
      ores: [{ mat: 'nickel', blobs: 28, rMin: 1.2, rMax: 3, dMin: 1, dMax: 30 },
             { mat: 'platinum', blobs: 14, rMin: 0.8, rMax: 1.8, dMin: 4, dMax: 30 },
             { mat: 'iron', blobs: 20, rMin: 1.2, rMax: 3, dMin: 1, dMax: 30 }],
      gems: [{ type: 'opal', count: 8, dMin: 3, dMax: 20 }] },

    { id: 'glimmer', name: 'Glimmer', parent: 'ceres', a: 2350, phase: 5.5, R: 26, g: 1.2,
      shape: 0.3, color: ['#8fd3e8', '#4b8aa8', '#d9f6ff'],
      ores: [{ mat: 'platinum', blobs: 14, rMin: 0.8, rMax: 1.8, dMin: 1, dMax: 18 },
             { mat: 'ice', blobs: 10, rMin: 1, rMax: 2.5, dMin: 1, dMax: 18 }],
      gems: [{ type: 'voidopal', count: 9, dMin: 2, dMax: 16 }] },
  ],

  // ---------------- rubble (no gravity: they just move, bump and hurt) ----------------
  rubble: [
    { count: 170, rMin: 470, rMax: 630, sizeMin: 2.5, sizeMax: 9, around: 'ceres' },
    { count: 18, rMin: 118, rMax: 145, sizeMin: 1.5, sizeMax: 4, around: 'kiwi' },
    { count: 40, rMin: 115, rMax: 190, sizeMin: 2, sizeMax: 7, around: 'potato' },
    { count: 60, rMin: 1950, rMax: 2150, sizeMin: 3, sizeMax: 11, around: 'ceres' },
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
    ve: 150,                  // exhaust velocity [m/s]   (shown as real-equivalent Isp = ve * ISP_SCALE / 9.81)
    thrust: 7,                // main engine [kN]   ->  2.9 m/s^2 full, TWR 1.46 on Ceres
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
  ISP_SCALE: 24,              // game ve x 24 = real-world exhaust velocity (methalox 150 -> 3600 m/s -> Isp 367 s)

  // ---------------- simulation ----------------
  sim: {
    dt: 1 / 240,              // physics step [s]
    warps: [1, 2, 4, 8, 16, 32, 64],
    nearWarp: 4,              // max warp within 40 m of rubble or a surface
    impactWarnT: 20,          // warp drops to 1x when the path hits something within this many seconds
    predictSteps: 1500,       // trajectory preview resolution
    predictMin: 60,           // preview horizon bounds [s]
    predictMax: 600,
  },
};

if (typeof module !== 'undefined') module.exports = CONFIG;
