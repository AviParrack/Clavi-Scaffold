// ======================================================================
//  CONFIG  —  game-scaled constants (1 unit = 1 m, 1 s = 1 s)
//  A shrunken Ceres neighbourhood: real gravity, toy distances.
// ======================================================================

const CONFIG = {

  // ---------------- big bodies (on circular rails around their parent) ----------------
  //  g = surface gravity [m/s^2], mu = g R^2.   a = orbit radius around parent [m]
  bodies: [
    { id: 'ceres',  name: 'Ceres',  parent: null,    a: 0,    phase: 0,   R: 300, g: 2.0,
      shape: 0.02, color: ['#9aa7c7', '#5f6a92', '#d6def2'] },
    { id: 'dorito', name: 'Dorito', parent: 'ceres', a: 780,  phase: 0.9, R: 34,  g: 2.0,
      shape: 0.25, color: ['#e6a45e', '#a8643a', '#ffd29a'] },
    { id: 'kiwi',   name: 'Kiwi',   parent: 'ceres', a: 1150, phase: 2.6, R: 52,  g: 2.0,
      shape: 0.12, color: ['#a6c36f', '#5f8044', '#dcf0a6'] },
    { id: 'seed',   name: 'Seed',   parent: 'kiwi',  a: 150,  phase: 0.0, R: 11,  g: 0.3, 
      shape: 0.2,  color: ['#ee9cbf', '#a95a86', '#ffd3e6'] },
  ],

  // ---------------- rubble belt around Ceres (no gravity, they just move and hurt) ----------------
  rubble: { count: 170, rMin: 470, rMax: 630, sizeMin: 2.5, sizeMax: 9, around: 'ceres' },
  rubbleKiwi: { count: 18, rMin: 72, rMax: 100, sizeMin: 1.5, sizeMax: 4, around: 'kiwi' },

  // ---------------- mining ship "Prospector" ----------------
  ship: {
    name: 'Prospector',
    dry: 1.0,                 // dry mass [t]
    fuel: 1.4,                // main propellant [t]
    ve: 150,                  // exhaust velocity [m/s]
    thrust: 7,                // main engine [kN]   ->  2.9 m/s^2 full, TWR 1.46 on Ceres
    fine: 0.15,               // throttle while holding Shift
    rotAccel: 2.4,            // RCS angular acceleration at full mass [rad/s^2]
    transAccel: 0.4,          // RCS translation at full mass [m/s^2]
    rcs: 30,                  // RCS monoprop [units]
    rcsRotUse: 1.0,           // units/s while rotating
    rcsTransUse: 1.5,         // units/s while translating
    radius: 4,                // collision radius [m]
    length: 9,                // drawn length [m]
    landSpeed: 2.5,           // touchdown below this = gentle landing [m/s]
    crashSpeed: 7,            // above this into a big body = destroyed [m/s]
    bounce: 0.4,              // restitution for bumps
    hull: 100,
    bumpDamage: 6,            // hull lost per m/s of impact speed
  },

  // ---------------- simulation ----------------
  sim: {
    dt: 1 / 240,              // physics step [s]
    warps: [1, 2, 4, 8, 16, 32],
    nearWarp: 4,              // max warp within 60 m of rubble or a surface
    predictSteps: 1500,       // trajectory preview resolution
    predictMin: 60,           // preview horizon bounds [s]
    predictMax: 420,
  },
};

if (typeof module !== 'undefined') module.exports = CONFIG;
