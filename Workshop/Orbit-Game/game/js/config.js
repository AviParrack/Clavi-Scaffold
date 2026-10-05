// ======================================================================
//  CONFIG  —  all game-scaled constants live here (SI-ish, 1 unit = 1 m)
// ======================================================================

const CONFIG = {

  // ---------------- planet "Pebble" ----------------
  planet: {
    name: 'Pebble',
    R: 1000,                  // radius [m]
    g0: 4.0,                  // surface gravity [m/s^2]  ->  mu = g0 R^2
    atmoTop: 120,             // altitude where drag goes to zero [m]
    rho0: 1.0,                // surface density (game units)
    scaleH: 30,               // density scale height [m]
  },

  // ---------------- starter rocket "Mk1 Pip" ----------------
  rocket: {
    name: 'Mk1 Pip',
    dry: 1.0,                 // dry mass [t]
    fuel: 3.0,                // fuel mass [t]
    ve: 125,                  // exhaust velocity [m/s]   (Isp * g)
    thrust: 28,               // max thrust [kN]  ->  liftoff TWR = 28 / (4 * 4) = 1.75
    CdA: 0.003,               // drag area (game units)
    turnRate: 2.2,            // rotation speed [rad/s]
    fineThrottle: 0.2,        // throttle while holding Shift
    length: 14,               // drawn length [m]
    crashSpeed: 6,            // touchdown faster than this = boom [m/s]
  },

  // ---------------- simulation ----------------
  sim: {
    dt: 1 / 240,              // fixed physics step [s]
    warps: [1, 2, 4, 8, 16, 32],
    maxWarpBurning: 1,        // warp is forced to this while the engine is on
    maxWarpAtmo: 4,
  },

  // ---------------- flight-school goals ----------------
  goals: {
    space: 120,               // "reach space" altitude [m] (= atmoTop)
    orbitPe: 120,             // stable orbit = periapsis above the atmosphere
    highAp: 1500,             // boost goal: apoapsis altitude [m]
    highCircE: 0.05,          // circular = eccentricity below this
    highCircAlt: 1200,        // ... with periapsis above this altitude
  },
};

CONFIG.planet.mu = CONFIG.planet.g0 * CONFIG.planet.R ** 2;

if (typeof module !== 'undefined') module.exports = CONFIG;
