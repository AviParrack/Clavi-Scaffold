// ======================================================================
//  COMBAT  —  pirates, bullets and ship guns.
//  Pirates fly like you do: gravity plus one main engine (<= 3 m/s^2)
//  they have to point, and a little RCS. They haunt Big Potato's Hill
//  sphere, Biscotti and Glimmer; chase you to ~45 m, match
//  your velocity, strafe, lead their shots, flee when hurt, and leave
//  docked ships, Mochi Hub's neighbourhood (r < 700 m) and Rust's alone.
//  Bullets are real projectiles: they fall, they hit, they dig.
//  API: Combat.list(g), spawn(g, zoneId, opt), fire(g, b), zoneAt(g, x, y),
//       hostileTo(g), armed(g), ZONES, CREW, PERS
// ======================================================================

const Combat = (() => {

  // ---------------- tuning ----------------

  const LIFE = 4, SUB = 1 / 60, MAX_SUB = 24, MAX_BULLETS = 160;     // bullet life [s], substep [s]
  const DIG_R = 0.4, DIG_POWER = 0.3;                                  // the crater one bullet leaves
  const A_MAX = 3, RCS_A = 0.5, TURN = 2.4;                            // pirate engine, RCS [m/s^2], turn rate [rad/s]
  const KV = 0.9, BRAKE = 1.2, VMAX = 28, ROCK_V = 14;                // steering gain [1/s], braking budget [m/s^2], closing caps [m/s]
  const DODGE_GAP = 4;                                                 // clearance pirates keep from rubble [m]
  const AI_DT = 0.1, PRED_T = 6, PRED_H = 0.5, CLEAR = 8;              // think period, crash look-ahead [s], ground margin [m]
  const P_LEN = 9, P_R = 3.4, P_T = 1.8, CRASH_V = 9;                  // pirate length, hit radius [m], mass [t], crash speed [m/s]
  const SEE_R = 650, FIRE_R = 150, LEASH = 380, HOVER_ALT = 26;       // notice / shoot / give-up ranges, standoff height [m]
  const WARP_R = 400, ARROW_R = 800, NAV_R = 1500, HINT_R = 600, GONE_R = 700, FAR_R = 1300;
  const SAFE_MOCHI = 700;                                              // Mochi Hub patrol radius, from Mochi's centre [m]
  const SPAWN_GAP = 90, ENTER_T = 4, MAX_ALIVE = 3, FAR_T = 45;        // sim seconds
  const RADIO_GAP = 6, BANTER_GAP = 30;                                // real seconds between radio lines
  const BULLET_KG = [0, 0.02, 0.04, 0.15];                            // per gun level [kg]: honest (tiny) recoil
  const GUN_NAMES = ['', 'Pea shooter', 'Rivet gun', 'Mass driver'];
  const GUN_COL = ['#ffd166', '#8fe36b', '#ffd166', '#7cf5d6'], BARREL = ['#8c84b3', '#78a85a', '#8c84b3', '#4f9e96'];
  const PIRATE_COL = '#ff5d8f', LOOT_COL = '#ffd166', RADIO_COL = '#ff8ae2', BAD = '#e63946', INK = '#1b1433';
  const HULL = ['#7448c2', '#4b2a86', '#c3a6ff'], TRIM = '#ff5d8f', BONE = '#f6ecd6', FLAME = ['#ff5dd8', '#ffe066'];
  const RIM = ['rgba(255,93,216,0.16)', 'rgba(255,93,143,0.9)'];    // danger glow + neon rim: dark hulls vanish on the night sky otherwise
  const MIN_PX = 44;                                                   // pirate ships stay at least this long on screen [px]
  const MILESTONES = { 5: 'SCOURGE OF THE BELT', 10: 'PIRATES NOW CROSS THE STREET WHEN YOU PASS', 25: 'THE PIRATE UNION HAS FILED A COMPLAINT' };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapPi = (a) => ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  const lerp = (r, [a, b]) => a + (b - a) * r;


  // ---------------- crews ----------------
  //  hold: standoff [m] · acc: aim spread [rad] · burst shots, gap between bursts [s], rate within a burst [s]
  //  flee: hp fraction that sends them home · strafe: lead angle around you [rad] · dmg per bullet · speed: muzzle [m/s]
  //  range: they open fire inside this [m] (about 2x hold: close enough that nose guns can answer back)

  const PERS = {
    brash:   { hold: 36, acc: 0.12,  burst: 3, gap: [2.4, 3.2], rate: 0.17, flee: 0.2,  strafe: 0.32, dmg: [5, 7], speed: 70, range: 85 },
    sniper:  { hold: 68, acc: 0.045, burst: 2, gap: [2.4, 3.4], rate: 0.3,  flee: 0.3,  strafe: 0.12, dmg: [7, 8], speed: 95, range: 130 },
    coward:  { hold: 55, acc: 0.08,  burst: 3, gap: [2.2, 3.0], rate: 0.2,  flee: 0.5,  strafe: 0.2,  dmg: [5, 6], speed: 70, range: 105 },
    showoff: { hold: 42, acc: 0.11,  burst: 4, gap: [2.3, 3.0], rate: 0.14, flee: 0.25, strafe: 0.5,  dmg: [5, 7], speed: 75, range: 95 },
  };

  const CREW = [
    { name: 'Captain Crunch',          short: 'CRUNCH',     pers: 'brash',   hi: 'YOU ARE CEREAL-OUSLY IN TROUBLE.' },
    { name: "Mad Marge's cousin Gary", short: 'GARY',       pers: 'coward',  hi: 'MARGE SAYS HI. NOW GIMME ORE.' },
    { name: 'Dread Pirate Roberta',    short: 'ROBERTA',    pers: 'sniper',  hi: 'I HAVE A REPUTATION TO KEEP.' },
    { name: 'Long John Silverfish',    short: 'SILVERFISH', pers: 'showoff', hi: 'SHINY SHIP. MINE NOW.' },
    { name: 'Barnacle Bev',            short: 'BEV',        pers: 'brash',   hi: 'THIS ROCK IS OURS, SWEETIE.' },
    { name: 'Lagrange Larry',          short: 'LARRY',      pers: 'sniper',  hi: 'I PARK WHERE THE FORCES CANCEL.' },
    { name: 'Roche Limit Rita',        short: 'RITA',       pers: 'showoff', hi: 'COME CLOSER. YOU WILL COME APART.' },
    { name: 'Captain Periapsis',       short: 'PERIAPSIS',  pers: 'brash',   hi: 'IT ONLY GOES DOWN FROM HERE.' },
    { name: "Blackbeard's Accountant", short: 'ACCOUNTANT', pers: 'coward',  hi: 'THIS IS A TAX. A PIRATE TAX.' },
    { name: 'Kessler Kate',            short: 'KATE',       pers: 'showoff', hi: 'MORE DEBRIS! MORE!' },
    { name: 'Hohmann the Horrible',    short: 'HOHMANN',    pers: 'sniper',  hi: 'MINIMUM ENERGY. MAXIMUM MENACE.' },
    { name: 'Scurvy Steve',            short: 'STEVE',      pers: 'brash',   hi: 'I NEED VITAMIN C. AND YOUR ORE.' },
    { name: 'One-Eyed Wally',          short: 'WALLY',      pers: 'sniper',  hi: 'ONE EYE IS PLENTY FOR YOU.' },
  ];

  const RADIO = {
    back:   ['REMEMBER ME? I REMEMBER YOU.', 'ROUND TWO, ROOKIE!', 'GOT MY SHIP FIXED. YOU PAID.'],
    hit:    ['OW! MY GOOD WING!', 'MY PAINT JOB!', 'OI! THIS SHIP IS A RENTAL!', 'LUCKY SHOT!', 'RUDE!'],
    hitYou: ['PEW PEW, ROOKIE!', 'HOLD STILL!', 'THAT LEFT A MARK!', 'TOLD YOU. HOLES.'],
    warn:   ['WARNING SHOTS! NEXT ONES COUNT!', 'NO GUNS? THESE ARE A WARNING.'],
    flee:   ['STRATEGIC RETREAT!', "THIS ISN'T OVER!", 'MUMMY!', 'I LEFT THE STOVE ON!'],
    die:    ['TELL MY MOM SHE WAS RIGHT...', 'NOT THE FACE!', 'I REGRET NOTHI-', 'WORTH IT. NOT REALLY.'],
    docked: ["HIDING? WE'LL WAIT.", 'COME OUT, COME OUT!', 'NOBODY STAYS DOCKED FOREVER.'],
    hub:    ['HUB PATROL! SCRAM!', 'NOT NEAR THE HUB. NEXT TIME!'],
    rusts:  ["RUST'S IS NEUTRAL. FINE. FINE!", 'RUST WOULD SKIN US. LATER, ROOKIE.'],
    cheap:  ['CHEAP SHOT FROM THE SAFE ZONE!', 'NO FAIR! THAT BUBBLE IS NEUTRAL!', 'SNIPING FROM SANCTUARY? RUDE.'],
    leash:  ['BAH. NOT WORTH THE FUEL.', 'GO ON THEN. RUN.', "YOU'LL BE BACK. THE ROCKS ARE HERE."],
    gloat:  ['SAY HI TO THE TOW TRUCK!', 'EASY PICKINGS!', "YARR! THAT'S A WRAP!"],
    banter: ["KEPLER'S LAWS? MORE LIKE SUGGESTIONS!", 'OUR ISP IS LOW. OUR MORALS: LOWER.',
             'YO HO HO AND A BOTTLE OF HYDRAZINE!', "NEWTON'S THIRD LAW: YOU SHOOT, WE SHOOT.",
             'NO AIR, NO PARROT. I MISS MY PARROT.', 'CHECK YOUR DELTA-V, ROOKIE.'],
  };


  // ---------------- pirate zones ----------------
  //  r: zone annulus around the host [m] · haunt: lurking orbit radii [m] · max alive here · hp range · core drop chance
  //  Potato's zone is the inner quarter of its 1.9 km Hill sphere (Rust's circles at 600 m, just outside it);
  //  Biscotti's gang works the far side of the outer lane.

  const ZONES = [
    { id: 'glimmer', name: 'Glimmer',        host: 'glimmer', r: [0, 330],     haunt: [70, 140],    max: 2, hp: [60, 90], core: 0.4 },
    { id: 'potato',  name: 'Big Potato',     host: 'potato',  r: [0, 450],     haunt: [215, 320],   max: 2, hp: [40, 70], core: 0.2 },
    { id: 'biscotti', name: 'Biscotti',      host: 'biscotti', r: [0, 520],    haunt: [240, 380],   max: 3, hp: [50, 80], core: 0.25, pair: 0.35 },
    //  (v3's third gang lived in Ceres' outer ring; in the belt every trip out of Mochi crosses that ring, so the
    //   gang moved out to Biscotti, far round the outer lane: the starter hop to Pretzel stays pirate-free)
  ];
  const zoneById = (id) => ZONES.find((z) => z.id === id) || null;

  // how far outside zone z a point is (<= 0: inside) [m]
  function outside(g, z, x, y) {
    const b = g.w.byId[z.host]; if (!b) return Infinity;
    const [bx, by] = World.bodyState(g.w, b, g.t), d = Math.hypot(x - bx, y - by);
    return Math.max(z.r[0] - d, d - z.r[1]);
  }
  const zoneAt = (g, x, y) => ZONES.find((z) => outside(g, z, x, y) <= 0) || null;

  const stationsOn = () => typeof Stations !== 'undefined' && !!Stations && typeof Stations.pirateFree === 'function' && Game.mods.some((m) => m.id === 'stations');
  const econOn = () => typeof Econ !== 'undefined' && !!Econ;

  // 'hub' / 'rusts' when (x, y) is somewhere pirates never fight, else null
  function safeAt(g, x, y) {
    const c = g.w.byId.mochi;
    if (c) { const [cx, cy] = World.bodyState(g.w, c, g.t); if (Math.hypot(x - cx, y - cy) < SAFE_MOCHI) return 'hub'; }
    if (stationsOn() && Stations.pirateFree(g, x, y)) return 'rusts';
    return null;
  }


  // ---------------- state ----------------

  function init(g) {
    g.mod.combat = {
      pirates: [], bullets: [], flashes: [], booms: [], shards: [], n: 0, rand: World.rng(g.w.seed * 977 + 13),
      kills: 0, bounty: 0, crashes: 0, fled: [], lastSpawn: -1e9, zoneT: {}, radioT: -1e9, banterT: 0, breakT: -1e9,
      cd: 0, trigger: false, spaceWas: false, toldNoGun: false, barrel: 1, aim: null, aimAng: Math.PI / 2,
      nearD: Infinity, nearN: 0, shotT: -1e9, bands: rockBands(g.w), loot: [], lootNear: false,
    };
  }
  const st = (g) => g.mod.combat || null;

  // rubble grouped by host, with the radial band it occupies (cheap rejection for bullets and pirates)
  //  one band per ring: a host with two rings (Mochi) gets two bands, never one fat annulus spanning the gap
  function rockBands(w) {
    const out = [], rocks = (w.rocks || []).slice().sort((u, v) => (u.host.idx - v.host.idx) || (u.a - v.a));
    let b = null;
    for (const rk of rocks) {
      if (!b || b.host !== rk.host || rk.a - rk.r - rk.ae > b.hi + 60) out.push(b = { host: rk.host, lo: Infinity, hi: 0, rocks: [] });
      b.lo = Math.min(b.lo, rk.a - rk.r - rk.ae); b.hi = Math.max(b.hi, rk.a + rk.r + rk.ae); b.rocks.push(rk);
    }
    return out;
  }

  function save(g) {
    const M = st(g); if (!M) return undefined;
    return { v: 1, kills: M.kills, bounty: M.bounty, crashes: M.crashes, fled: M.fled.slice(-6) };
  }

  function load(g, d) {
    const M = st(g); if (!M || !d || typeof d !== 'object') return;
    const num = (v) => (isFinite(v) && v >= 0 ? Math.floor(+v) : 0);
    M.kills = num(d.kills); M.bounty = num(d.bounty); M.crashes = num(d.crashes);
    M.fled = (Array.isArray(d.fled) ? d.fled : [])
      .filter((f) => f && typeof f.name === 'string' && PERS[f.pers] && isFinite(f.hpMax))
      .slice(-6).map((f) => ({ name: f.name.slice(0, 40), short: String(f.short || f.name).slice(0, 12).toUpperCase(), pers: f.pers, hpMax: clamp(+f.hpMax, 40, 90) }));
  }


  // ---------------- you: what pirates chase ----------------

  const me = (g) => (g.mode === 'eva' && g.astro.on ? g.astro : g.sh);
  function quarry(g) {
    if (g.status === 'dead') return null;
    const A = g.astro, sh = g.sh;
    if (g.mode === 'eva' && A.on) return { x: A.x, y: A.y, vx: A.vx, vy: A.vy, r: A.r, kind: 'astro' };
    return { x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy, r: g.S.radius, kind: 'ship' };
  }
  // why pirates will not fight you right now ('dead' | 'docked' | 'hub' | 'rusts'), or null: fair game
  function hostileTo(g) {
    if (g.status === 'dead') return 'dead';
    if (g.status === 'docked') return 'docked';
    const P = me(g);
    return safeAt(g, P.x, P.y);
  }
  const armed = (g) => (g.S.gun || 0) > 0 && (g.S.gunRate || 0) > 0 && (g.S.gunSpeed || 0) > 0;
  function gunName(g) {
    if (econOn() && typeof Econ.tierOf === 'function') {
      try { const t = Econ.tierOf(g, 'gun'); if (t && t.name) return t.name; } catch (e) { /* fall back */ }
    }
    return GUN_NAMES[g.S.gun] || `Gun Mk ${g.S.gun}`;
  }


  // ======================================================================
  //  PLAYER GUNS
  // ======================================================================

  function frame(g, inp, dt, simDt) {
    const M = st(g); if (!M) return;
    const keys = inp && inp.keys, ms = inp && inp.mouse, S = g.S;
    const space = !!(keys && keys.has && keys.has('Space'));
    if (ms && isFinite(ms.x) && isFinite(ms.y)) M.aim = [ms.x, ms.y];
    const can = g.mode === 'ship' && (g.status === 'flying' || g.status === 'landed') && !g.ui && !g.paused;
    const turret = armed(g) && S.turret;
    const pull = space || (turret && !!(ms && ms.down));
    if (space && !M.spaceWas && can && !armed(g) && !M.toldNoGun) {
      M.toldNoGun = true;
      Game.toast(g, stationsOn() ? "NO GUNS FITTED. RUST'S SELLS THEM." : 'NO GUNS FITTED. THE SHOP SELLS THEM.', '#ff9f1c', 'gun');
    }
    M.spaceWas = space;
    M.aimAng = aimAngle(g, M);
    M.trigger = can && armed(g) && pull;
    if (!M.trigger || !simDt) { M.cd = Math.max(0, M.cd - simDt); return; }
    M.cd -= simDt;
    for (let n = 0; M.cd <= 0 && n < 4; n++) { shootGun(g, M, M.cd + simDt); M.cd += 1 / S.gunRate; }
    M.cd = Math.max(M.cd, 0);
  }

  function aimAngle(g, M) {
    if (!(g.S.turret && armed(g)) || !M.aim) return g.sh.ang;
    const dx = M.aim[0] - g.sh.x, dy = M.aim[1] - g.sh.y;
    return Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : g.sh.ang;
  }

  // one bullet from the nose guns (alternating barrels) or the turret; `late` = how far into this frame it leaves [s]
  function shootGun(g, M, late) {
    const S = g.S, sh = g.sh, u = S.length / 10, turret = !!S.turret;
    const a = turret ? M.aimAng : sh.ang, c = Math.cos(a), s = Math.sin(a);
    let x, y;
    if (turret) { x = sh.x + Math.cos(sh.ang) * -2 * u + c * 2.6 * u; y = sh.y + Math.sin(sh.ang) * -2 * u + s * 2.6 * u; }
    else {
      M.barrel = -M.barrel;
      const fx = Math.cos(sh.ang), fy = Math.sin(sh.ang), lat = 2.6 * u * M.barrel;
      x = sh.x + fx * 4.4 * u - fy * lat; y = sh.y + fy * 4.4 * u + fx * lat;
    }
    const spread = (M.rand() - 0.5) * 0.02, ca = Math.cos(a + spread), sa = Math.sin(a + spread), v = S.gunSpeed;
    const lvl = clamp(S.gun | 0, 1, 3);
    fire(g, { x: x + sh.vx * late, y: y + sh.vy * late, vx: sh.vx + ca * v, vy: sh.vy + sa * v, t: g.t + late,
              team: 'player', dmg: S.gunDmg, owner: 'ship', col: GUN_COL[lvl], style: lvl === 1 ? 'pea' : 'tracer', gun: lvl });
    if (g.status === 'flying') {                                       // recoil: p = m v, divided by the whole ship
      const k = (BULLET_KG[lvl] || 0.05) * v / (Physics.mass(sh, S) * 1000);
      sh.vx -= ca * k; sh.vy -= sa * k;
    }
    M.flashes.push({ who: 'ship', side: turret ? 0 : M.barrel, real: g.real, col: GUN_COL[lvl] });
    M.shotT = g.real;
    g.shake = Math.max(g.shake, 0.06 + 0.04 * lvl);
  }

  // bullets: { x, y, vx, vy, t (sim time of this state), team, dmg, owner, col, style }
  function fire(g, b) {
    const M = st(g); if (!M) return null;
    const bl = { age: 0, dead: false, t: g.t, style: 'tracer', col: '#ffffff', dmg: 5, team: 'player', ...b };
    if (![bl.x, bl.y, bl.vx, bl.vy, bl.t].every(isFinite)) return null;
    M.bullets.push(bl);
    if (M.bullets.length > MAX_BULLETS) M.bullets.shift();
    return bl;
  }

  function onMouse(g, ms) {
    const M = st(g); if (!M) return false;
    return !!(ms.pressed && ms.button === 0 && g.mode === 'ship' && !g.ui && armed(g) && g.S.turret &&
              (g.status === 'flying' || g.status === 'landed'));
  }

  function onKey(g, code) {
    if (code !== 'KeyJ' || !g.dev || !st(g)) return false;
    const P = me(g), z = zoneAt(g, P.x, P.y) || zoneById('potato'), a0 = Math.random() * 2 * Math.PI;
    let a = a0, best = -Infinity;                                   // the clearest of 12 spots, so it does not spawn in a rock
    for (let k = 0; k < 12; k++) {
      const ak = a0 + k * Math.PI / 6, x = P.x + 120 * Math.cos(ak), y = P.y + 120 * Math.sin(ak);
      let alt = Game.nearestBody(g, x, y).alt;
      for (const rk of g.w.rocks) { if (rk.gone) continue; const [rx, ry] = World.rockState(g.w, rk, g.t); alt = Math.min(alt, Math.hypot(x - rx, y - ry) - rk.r); }
      if (alt > best) { best = alt; a = ak; }
      if (alt > 60) break;
    }
    const p = spawn(g, z.id, { x: P.x + 120 * Math.cos(a), y: P.y + 120 * Math.sin(a), vx: P.vx, vy: P.vy });
    if (p) Game.toast(g, `DEV: ${p.name.toUpperCase()} SUMMONED`, RADIO_COL, 'dev');
    return true;
  }


  // ======================================================================
  //  BULLETS: gravity, segment hits each substep, craters
  // ======================================================================

  function moveBullets(g, M) {
    if (!M.bullets.length) return;
    for (const b of M.bullets) {
      const T = g.t - b.t;
      if (!(T > 0)) continue;
      const n = Math.min(MAX_SUB, Math.max(1, Math.ceil(T / SUB - 1e-9))), h = T / n;
      for (let i = 0; i < n && !b.dead; i++) stepBullet(g, M, b, h);
      if (b.team === 'pirate' && !b.dead && safeAt(g, b.x, b.y)) fizzle(g, b);
    }
    M.bullets = M.bullets.filter((b) => !b.dead);
  }

  function stepBullet(g, M, b, h) {
    const [gx, gy] = World.gravity(g.w, b.x, b.y, b.t);
    b.vx += gx * h; b.vy += gy * h;
    const dx = b.vx * h, dy = b.vy * h, len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      const ux = dx / len, uy = dy / len;
      const hit = Game.raycast(g, b.x, b.y, ux, uy, len, { team: b.team });
      const rk = rockHit(g, M, b.x, b.y, ux, uy, hit ? hit.t : len, 0.15);
      if (rk) { hitRock(g, b, rk); b.dead = true; return; }
      if (hit) { impact(g, M, b, hit, ux, uy); b.dead = true; return; }
    }
    b.x += dx; b.y += dy; b.t += h; b.age += h;
    if (b.age >= LIFE || !isFinite(b.x + b.y + b.vx + b.vy)) b.dead = true;
  }

  // point defence: pirate rounds that stray into a no-fight bubble get zapped
  function fizzle(g, b) {
    b.dead = true;
    Game.burst(g, 'spark', b.x, b.y, 5, { vx: b.vx * 0.1, vy: b.vy * 0.1, speed: 4, col: '#7cf5d6', life: 0.3 });
  }

  // first rubble rock along a segment -> null | { t, x, y, rk, vx, vy }
  function rockHit(g, M, x, y, ux, uy, len, pad) {
    let best = null;
    const stt = World.states(g.w, g.t);
    for (const band of M.bands) {
      const [hx, hy] = stt[band.host.idx], d0 = Math.hypot(x - hx, y - hy);
      if (d0 + len < band.lo - pad || d0 - len > band.hi + pad) continue;
      for (const rk of band.rocks) {
        if (rk.gone || Math.abs(d0 - rk.a) > rk.r + rk.ae + len + pad) continue;
        const [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t), R = rk.r * 0.9 + pad;
        const fx = x - rx, fy = y - ry, b2 = fx * ux + fy * uy, c = fx * fx + fy * fy - R * R, disc = b2 * b2 - c;
        if (disc < 0) continue;
        const t = c < 0 ? 0 : -b2 - Math.sqrt(disc);
        if (t >= 0 && t <= len && (!best || t < best.t)) best = { t, x: x + ux * t, y: y + uy * t, rk, vx: rvx, vy: rvy };
      }
    }
    return best;
  }

  function impact(g, M, b, hit, ux, uy) {
    if (hit.target) {
      const tg = hit.target, [tvx, tvy] = targetVel(g, M, tg, b);
      if (tg.id === 'ship' && g.status === 'docked') {                // docked ships are off limits, even to strays
        Game.burst(g, 'spark', hit.x, hit.y, 5, { vx: tvx, vy: tvy, speed: 6, col: '#ffffff', life: 0.3 });
        Game.popup(g, 'TINK!', '#d9d6f2', hit.x, hit.y, 16);
        return;
      }
      tg.hit(g, b.dmg, 'bullet', { team: b.team, kind: 'bullet', x: hit.x, y: hit.y, vx: b.vx, vy: b.vy, from: b.owner, gun: b.gun });
      Game.burst(g, 'spark', hit.x, hit.y, 7, { vx: tvx, vy: tvy, speed: 8, col: b.col, life: 0.35, dir: Math.atan2(-uy, -ux), spread: 2.2 });
      if (b.team === 'pirate' && tg.team === 'player') {
        const p = M.pirates.find((q) => q.id === b.owner);
        if (p && M.rand() < 0.25) say(g, M, p, 'hitYou');
      }
      return;
    }
    if (!hit.body) return;
    const bs = World.bodyState(g.w, hit.body, g.t);
    Game.dig(g, hit.body, hit.x + ux * 0.25, hit.y + uy * 0.25, DIG_R, DIG_POWER);
    Game.burst(g, 'dust', hit.x, hit.y, 4, { vx: bs[2], vy: bs[3], speed: 2.4, col: hit.body.color[1], size: 0.35, life: 0.7 });
    Game.burst(g, 'spark', hit.x, hit.y, 3, { vx: bs[2], vy: bs[3], speed: 5, col: b.col, life: 0.25 });
  }

  function hitRock(g, b, rk) {
    Game.burst(g, 'dust', rk.x, rk.y, 4, { vx: rk.vx, vy: rk.vy, speed: 2.5, col: '#a69bb8', size: 0.4, life: 0.7 });
    Game.burst(g, 'spark', rk.x, rk.y, 4, { vx: rk.vx, vy: rk.vy, speed: 6, col: b.col, life: 0.3 });
  }

  function targetVel(g, M, tg, b) {
    if (tg.id === 'ship') return [g.sh.vx, g.sh.vy];
    if (tg.id === 'astro') return [g.astro.vx, g.astro.vy];
    const p = M.pirates.find((q) => 'pirate:' + q.id === tg.id);
    return p ? [p.vx, p.vy] : [b.vx * 0.2, b.vy * 0.2];
  }


  // ======================================================================
  //  PIRATES: spawn, think, fly, collide, die
  // ======================================================================

  function hauntState(g, H, t) {
    const [hx, hy, hvx, hvy] = World.bodyState(g.w, H.b, t), th = H.th0 + H.n * (t - H.t0), c = Math.cos(th), s = Math.sin(th);
    return [hx + H.r * c, hy + H.r * s, hvx - H.r * H.n * s, hvy + H.r * H.n * c];
  }

  // opt: { x, y, vx, vy, hp, pers, crew, state, near (spawn ~120 m from you) }
  function spawn(g, zoneId, opt = {}) {
    const M = st(g), z = zoneById(zoneId); if (!M || !z) return null;
    const host = g.w.byId[z.host]; if (!host) return null;
    const P = me(g), rand = M.rand;

    // -------- who: an old friend who fled last time, or a fresh face --------
    let who = opt.crew || null, back = false;
    if (!who && M.fled.length && rand() < 0.35) { who = M.fled.splice(Math.floor(rand() * M.fled.length), 1)[0]; back = true; }
    if (!who) {
      const busy = new Set(M.pirates.map((p) => p.name));
      const free = CREW.filter((c) => !busy.has(c.name));
      who = (free.length ? free : CREW)[Math.floor(rand() * (free.length || CREW.length))];
    }
    const pers = PERS[opt.pers] ? opt.pers : PERS[who.pers] ? who.pers : 'brash';
    const hpMax = clamp(opt.hp || who.hpMax || Math.round(lerp(rand(), z.hp)), 1, 999);

    // -------- where: on a lurking orbit, out of sight (~330 m from you) --------
    const n = (r) => Math.sqrt(host.mu / r ** 3);
    let H = null, best = Infinity;
    const [hx, hy] = World.bodyState(g.w, host, g.t), want = opt.near ? 120 : 330;
    for (let k = 0; k < 24; k++) {
      const r = lerp(rand(), z.haunt), th = rand() * 2 * Math.PI, x = hx + r * Math.cos(th), y = hy + r * Math.sin(th);
      const d = Math.hypot(x - P.x, y - P.y);
      if (safeAt(g, x, y) || Game.nearestBody(g, x, y).alt < 30) continue;
      const score = Math.abs(d - want) + (d < 150 && !opt.near ? 400 : 0);
      if (score < best) { best = score; H = { b: host, r, th0: th, n: n(r), t0: g.t }; }
    }
    if (!H) return null;
    const [x0, y0, vx0, vy0] = hauntState(g, H, g.t);
    const p = {
      id: ++M.n, name: who.name, short: who.short || who.name.toUpperCase(), hi: who.hi || null, pers, P: PERS[pers], zone: z.id,
      x: opt.x ?? x0, y: opt.y ?? y0, vx: opt.vx ?? vx0, vy: opt.vy ?? vy0, ang: 0, want: 0, gx: 0, gy: 0, r: P_R,
      hp: hpMax, hpMax, bounty: Math.round((120 + (hpMax - 40) * 3.6) * (back ? 1.5 : 1) / 10) * 10,
      state: opt.state || 'lurk', haunt: H, ax: 0, ay: 0, thr: 0, rcs: 0, burning: false, side: rand() < 0.5 ? -1 : 1, sideT: g.t + 8 + 8 * rand(),
      thinkT: rand() * AI_DT, nextShot: g.t + 1.5, shots: PERS[pers].burst, aimAng: 0, lastHitT: -1e9, hitReal: -9, wordReal: -9,
      aggro: 0, farT: 0, evadeT: 0, evadeUp: [0, 1], warned: false, back, spawnT: g.t, fleeT: 0, gone: false, smokeT: 0, look: [1, 0],
    };
    p.ang = p.want = p.aimAng = Math.atan2(P.y - p.y, P.x - p.x);
    [p.gx, p.gy] = World.gravity(g.w, p.x, p.y, g.t);
    M.pirates.push(p);
    Game.log(g, `pirate ${p.name} (${pers}, hp ${hpMax}, bounty $${p.bounty}) appears near ${z.name}${back ? ', back for revenge' : ''}`);
    if (!opt.quiet) say(g, M, p, back ? 'back' : 'hi', true);
    return p;
  }

  function setState(g, p, s, why = '') {
    if (p.state === s) return;
    p.state = s;
    if (s === 'flee') p.fleeT = g.t;
    Game.log(g, `pirate ${p.name}: ${s}${why ? ` (${why})` : ''}`);
  }

  function say(g, M, p, kind, force = false) {
    if (!force && g.real - M.radioT < RADIO_GAP) return false;
    const pool = kind === 'hi' ? (p.hi ? [p.hi] : RADIO.back) : RADIO[kind];
    if (!pool || !pool.length) return false;
    const line = pool[Math.floor(M.rand() * pool.length)];
    M.radioT = g.real;
    Game.toast(g, `${p.short}: ${line}`, RADIO_COL, 'radio');
    Game.log(g, `radio ${p.name}: ${line}`);
    return true;
  }

  // -------- physics step (every 1/240 s): think now and then, fly, bump --------

  function step(g, dt) {
    const M = st(g); if (!M || !M.pirates.length) return;
    for (const p of M.pirates) {
      if (p.gone) continue;
      p.thinkT -= dt;
      if (p.thinkT <= 0) { p.thinkT += AI_DT; think(g, M, p); }
      fly(g, p, dt);
      collide(g, M, p);
    }
    if (M.pirates.some((p) => p.gone)) M.pirates = M.pirates.filter((p) => !p.gone);
  }

  function fly(g, p, dt) {
    const err = wrapPi(p.want - p.ang);
    p.ang = wrapPi(p.ang + clamp(err, -TURN * dt, TURN * dt));
    const c = Math.cos(p.ang), s = Math.sin(p.ang), am = Math.hypot(p.ax, p.ay), along = p.ax * c + p.ay * s;
    const main = am > 1e-9 && along > 0.5 * am ? Math.min(A_MAX, along) : 0;      // the engine only pushes along the nose
    let rx = p.ax - main * c, ry = p.ay - main * s;
    const rm = Math.hypot(rx, ry);
    if (rm > RCS_A) { rx *= RCS_A / rm; ry *= RCS_A / rm; }
    const fx = main * c + rx, fy = main * s + ry;
    p.thr = main / A_MAX; p.rcs = Math.min(rm, RCS_A) / RCS_A;
    p.vx += 0.5 * dt * (p.gx + fx); p.vy += 0.5 * dt * (p.gy + fy);   // leapfrog; start-of-step gravity = last step's end
    p.x += dt * p.vx; p.y += dt * p.vy;
    [p.gx, p.gy] = World.gravity(g.w, p.x, p.y, g.t);
    p.vx += 0.5 * dt * (p.gx + fx); p.vy += 0.5 * dt * (p.gy + fy);
  }

  function collide(g, M, p) {
    const stt = World.states(g.w, g.t);
    for (const b of g.w.bodies) {
      const [bx, by, bvx, bvy] = stt[b.idx], lx = p.x - bx, ly = p.y - by, reach = b.R * (1 + b.shape) + p.r + 1;
      if (lx * lx + ly * ly > reach * reach) continue;
      const hit = Terrain.collideCircle(Terrain.of(b), lx, ly, p.r);
      if (!hit) continue;
      p.x += hit.nx * hit.depth; p.y += hit.ny * hit.depth;
      const rvx = p.vx - bvx, rvy = p.vy - bvy, vn = rvx * hit.nx + rvy * hit.ny;
      if (vn >= 0) return;
      if (Math.hypot(rvx, rvy) > CRASH_V) { M.crashes++; kill(g, M, p, 'crash', b.name); return; }
      p.vx -= 1.4 * vn * hit.nx; p.vy -= 1.4 * vn * hit.ny;
      hurt(g, M, p, 4 * -vn, 'bump', null, b.name);
      return;
    }
    for (const band of M.bands) {
      const [hx, hy] = stt[band.host.idx], dh = Math.hypot(p.x - hx, p.y - hy);
      if (dh < band.lo - p.r || dh > band.hi + p.r) continue;
      for (const rk of band.rocks) {
        if (rk.gone || Math.abs(dh - rk.a) > rk.r + rk.ae + p.r) continue;
        const [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t), dx = p.x - rx, dy = p.y - ry, d = Math.hypot(dx, dy), R = rk.r * 0.9 + p.r * 0.8;
        if (d >= R || d < 1e-9) continue;
        const nx = dx / d, ny = dy / d, vn = (p.vx - rvx) * nx + (p.vy - rvy) * ny;
        p.x = rx + nx * (R + 0.05); p.y = ry + ny * (R + 0.05);
        if (vn < 0) { p.vx -= 1.4 * vn * nx; p.vy -= 1.4 * vn * ny; hurt(g, M, p, 2 * -vn, 'bump', null, 'a rubble rock'); }
        return;
      }
    }
    ram(g, M, p);
  }

  // pirate meets your ship: momentum is shared (a parked or landed ship counts as immovable)
  function ram(g, M, p) {
    if (g.status === 'dead' || g.status === 'docked' || p.gone) return;
    const sh = g.sh, dx = p.x - sh.x, dy = p.y - sh.y, d = Math.hypot(dx, dy), R = p.r + g.S.radius;
    if (d >= R || d < 1e-9) return;
    const nx = dx / d, ny = dy / d, vn = (p.vx - sh.vx) * nx + (p.vy - sh.vy) * ny;
    p.x = sh.x + nx * (R + 0.05); p.y = sh.y + ny * (R + 0.05);
    if (vn >= 0) return;
    const mS = g.status === 'flying' ? Physics.mass(sh, g.S) : Infinity;
    const J = -1.4 * vn / (1 / P_T + 1 / mS);                        // [t m/s]
    p.vx += J / P_T * nx; p.vy += J / P_T * ny;
    if (isFinite(mS)) { sh.vx -= J / mS * nx; sh.vy -= J / mS * ny; }
    if (-vn > 0.8) { Game.hurtShip(g, 3 * -vn, 'CLANG!'); hurt(g, M, p, 3 * -vn, 'bump', null); }
  }

  // -------- AI (every 0.1 s of sim time) --------

  function think(g, M, p) {
    const q = quarry(g), why = hostileTo(g), d = q ? Math.hypot(q.x - p.x, q.y - p.y) : Infinity;
    p.aggro = Math.max(0, p.aggro - AI_DT);
    p.evadeT = Math.max(0, p.evadeT - AI_DT);
    if (g.t > p.sideT) { p.side = -p.side; p.sideT = g.t + 8 + 8 * M.rand(); }

    // -------- mood --------
    if (p.state !== 'flee' && p.hp <= p.hpMax * p.P.flee) { setState(g, p, 'flee', `hp ${p.hp.toFixed(0)}`); say(g, M, p, 'flee', true); }
    else if (p.state === 'attack' && why) { setState(g, p, 'lurk', why); if (why !== 'dead') breakOff(g, M, p, why); }
    else if (p.state === 'attack' && q && outsideZone(g, p, q) > LEASH) { setState(g, p, 'lurk', 'leash'); breakOff(g, M, p, 'leash'); }
    else if (p.state === 'lurk' && !why && q && (d < SEE_R || p.aggro > 0) && outsideZone(g, p, q) <= LEASH) setState(g, p, 'attack', `${d.toFixed(0)} m`);

    // -------- plan, look ahead, steer clear --------
    const scan = rockScan(g, M, p), plan = planFor(g, p, q);
    let a = thrustFor(plan, p.x, p.y, p.vx, p.vy, p.gx, p.gy, g.t);
    const crash = predictCrash(g, p, plan);
    if (crash) { p.evadeT = 1.2; p.evadeUp = crash; }
    const dodge = p.evadeT > 0 ? null : scan.dodge;
    if (p.evadeT > 0) a = [p.evadeUp[0] * A_MAX, p.evadeUp[1] * A_MAX];
    else if (dodge) {                                                      // dodge, but keep sliding toward the goal (never into the rock)
      const dm = Math.hypot(dodge[0], dodge[1]) || 1, ox = dodge[0] / dm, oy = dodge[1] / dm, along = Math.min(0, a[0] * ox + a[1] * oy);
      a = [dodge[0] + a[0] - along * ox, dodge[1] + a[1] - along * oy];
    }
    else a = nudges(g, M, p, a);
    const am = Math.hypot(a[0], a[1]);
    if (am > A_MAX) { a[0] *= A_MAX / am; a[1] *= A_MAX / am; }
    if (dodge && p.evadeT <= 0) { a[0] = 0.5 * (a[0] + p.ax); a[1] = 0.5 * (a[1] + p.ay); }   // dodges blend with the last command: no nose flip-flop
    p.ax = a[0]; p.ay = a[1];

    // -------- heading: point the engine when it is needed, else glare at you --------
    p.burning = Math.hypot(a[0], a[1]) > (p.burning ? 0.3 : 0.5) || p.evadeT > 0;
    if (p.burning) p.want = Math.atan2(a[1], a[0]);
    else if (q && p.state === 'attack') p.want = Math.atan2(q.y - p.y, q.x - p.x);
    if (q && d < 400) { p.look = [(q.x - p.x) / (d || 1), (q.y - p.y) / (d || 1)]; if (p.state !== 'attack') p.aimAng = Math.atan2(p.look[1], p.look[0]); }

    // -------- guns & chatter --------
    if (p.state === 'attack' && !why && q && d < Math.min(FIRE_R, p.P.range || FIRE_R)) shoot(g, M, p, q, d);
    if (p.state === 'attack' && g.real - M.banterT > BANTER_GAP && M.rand() < 0.02) { M.banterT = g.real; say(g, M, p, 'banter'); }
  }

  // one grumble when a gang breaks off (it matters: it tells you why the shooting stopped)
  function breakOff(g, M, p, why) {
    if (g.real - M.breakT < 5) return;
    M.breakT = g.real;
    say(g, M, p, why, true);
  }

  // how far you are outside this pirate's home zone [m]
  function outsideZone(g, p, q) { const z = zoneById(p.zone); return z ? outside(g, z, q.x, q.y) : 0; }

  // plan = target point moving at a constant velocity (or a velocity to hold, when fleeing) + gravity there (feed-forward)
  function planFor(g, p, q) {
    if (p.state === 'flee') {
      const from = q || me(g), dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1;
      return { flee: true, vx: (q ? q.vx : p.vx) + dx / d * 35, vy: (q ? q.vy : p.vy) + dy / d * 35, fx: p.gx, fy: p.gy, t0: g.t };
    }
    let tx, ty, tvx, tvy, vmax = VMAX, ff;
    if (p.state === 'attack' && q) {
      const th = Math.atan2(p.y - q.y, p.x - q.x) + p.side * p.P.strafe;
      [tx, ty] = keepOut(g, ...lift(g, q.x + p.P.hold * Math.cos(th), q.y + p.P.hold * Math.sin(th)));
      tvx = q.vx; tvy = q.vy; ff = World.gravity(g.w, q.x, q.y, g.t);
    } else {
      [tx, ty, tvx, tvy] = hauntState(g, p.haunt, g.t); vmax = 18;
      ff = World.gravity(g.w, tx, ty, g.t);
    }
    [tx, ty] = detour(g, p, tx, ty);
    if (inRubble(g, st(g), p, 25)) vmax = Math.min(vmax, ROCK_V);           // don't barge through rubble at full tilt
    return { tx, ty, vx: tvx, vy: tvy, vmax, fx: ff[0], fy: ff[1], t0: g.t };
  }

  // the controller: velocity-matching steer with a braking curve, plus the gravity difference to the target
  function thrustFor(P, x, y, vx, vy, gx, gy, t) {
    let wx, wy;
    if (P.flee) { wx = P.vx; wy = P.vy; }
    else {
      const ex = P.tx + P.vx * (t - P.t0) - x, ey = P.ty + P.vy * (t - P.t0) - y, d = Math.hypot(ex, ey);
      const sp = d > 1e-6 ? Math.min(P.vmax, Math.sqrt(2 * BRAKE * d), 0.5 * d) : 0;
      wx = P.vx + (d > 1e-6 ? ex / d * sp : 0); wy = P.vy + (d > 1e-6 ? ey / d * sp : 0);
    }
    let ax = (wx - vx) * KV + P.fx - gx, ay = (wy - vy) * KV + P.fy - gy;
    const am = Math.hypot(ax, ay);
    if (am > A_MAX) { ax *= A_MAX / am; ay *= A_MAX / am; }
    return [ax, ay];
  }

  // fly the plan forward a few seconds; if it meets a body, return the way out (unit vector) else null
  function predictCrash(g, p, P) {
    let x = p.x, y = p.y, vx = p.vx, vy = p.vy, t = g.t;
    for (let i = 0; i < PRED_T / PRED_H; i++) {
      const [gx, gy] = World.gravity(g.w, x, y, t), [ax, ay] = thrustFor(P, x, y, vx, vy, gx, gy, t);
      vx += (gx + ax) * PRED_H; vy += (gy + ay) * PRED_H; x += vx * PRED_H; y += vy * PRED_H; t += PRED_H;
      const stt = World.states(g.w, t);
      for (const b of g.w.bodies) {
        const dx = x - stt[b.idx][0], dy = y - stt[b.idx][1], r = Math.hypot(dx, dy);
        if (r > b.R * (1 + b.shape) + p.r + CLEAR) continue;
        if (r > World.surfaceR(b, Math.atan2(dy, dx)) + p.r + CLEAR) continue;
        const [bx, by] = World.bodyState(g.w, b, g.t), ux = p.x - bx, uy = p.y - by, un = Math.hypot(ux, uy) || 1;
        return [ux / un, uy / un];
      }
    }
    return null;
  }

  // rubble rocks on a collision course -> a burn out of their way (sideways, plus braking against a rock when
  //  sideways alone cannot clear it in time), else null.  Look-ahead = time to stop, 3-6 s.  Every threat pushes,
  //  weighted by urgency, so a pirate threading a gap between two rocks is squeezed through it, not bounced
  //  from one to the other (that used to trap pirates flying in formation with a ring).
  function rockScan(g, M, p) {
    const stt = World.states(g.w, g.t);
    let sx = 0, sy = 0, wsum = 0;
    for (const band of M.bands) {
      const [hx, hy, hvx, hvy] = stt[band.host.idx], dh = Math.hypot(p.x - hx, p.y - hy);
      const reach = 6 * Math.hypot(p.vx - hvx, p.vy - hvy) + 30;                 // speed relative to the rubble's host (rocks ride it)
      if (dh < band.lo - reach || dh > band.hi + reach) continue;
      for (const rk of band.rocks) {
        if (rk.gone || Math.abs(dh - rk.a) > rk.r + rk.ae + reach) continue;
        const [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t), dx = p.x - rx, dy = p.y - ry, vx = p.vx - rvx, vy = p.vy - rvy;
        const v2 = vx * vx + vy * vy, v = Math.sqrt(v2) || 1, T = clamp(v / A_MAX + 1, 3, 6);
        if (v2 > 0.01 && dx * vx + dy * vy >= 0) continue;                    // already pulling away from it
        const tc = v2 > 1e-9 ? clamp(-(dx * vx + dy * vy) / v2, 0, T) : 0;
        const mx = dx + vx * tc, my = dy + vy * tc, md = Math.hypot(mx, my), clear = rk.r + p.r + DODGE_GAP;
        if (md >= clear) continue;
        if (-(dx * vx + dy * vy) / (Math.hypot(dx, dy) || 1) < 1 && md > rk.r + p.r + 1) continue;   // drifting together slower than 1 m/s: ease past it
        const ox = md > 0.3 ? mx / md : -vy / v, oy = md > 0.3 ? my / md : vx / v;
        const need = 2 * (clear - md) / Math.max(0.25, tc * tc);              // sideways accel to clear it in time
        const brake = tc < 0.3 ? 0 : need > 0.7 * A_MAX ? 1 : v > 6 ? 0.5 : 0;   // alongside it already: just step aside
        const wgt = (1 - md / clear) / (tc + 0.5);
        sx += wgt * (ox - vx / v * brake); sy += wgt * (oy - vy / v * brake); wsum += wgt;
      }
    }
    if (!wsum) return { dodge: null };
    const m = Math.hypot(sx, sy);
    if (m < 0.25 * wsum) return { dodge: null };                               // pushes cancel: the gap is centred, carry on
    return { dodge: [sx / m * A_MAX, sy / m * A_MAX] };
  }
  const inRubble = (g, M, p, pad) => M.bands.some((band) => {
    const [hx, hy] = World.bodyState(g.w, band.host, g.t), dh = Math.hypot(p.x - hx, p.y - hy);
    return dh > band.lo - pad && dh < band.hi + pad;
  });

  // small pushes: keep apart from friends, stay out of the Hub's and Rust's bubbles
  function nudges(g, M, p, a) {
    let [ax, ay] = a;
    const stt = World.states(g.w, g.t);
    for (const o of M.pirates) {
      if (o === p || o.gone) continue;
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
      if (d < 24 && d > 1e-6) { ax += dx / d * 1.2; ay += dy / d * 1.2; }
    }
    const c = g.w.byId.mochi;
    if (c) {
      const [cx, cy] = stt[c.idx], dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
      if (d < SAFE_MOCHI + 60 && d > 1e-6) { ax += dx / d * 2; ay += dy / d * 2; }
    }
    if (stationsOn() && typeof Stations.byId === 'function') {
      const ru = Stations.byId(g, 'rusts');
      if (ru) {
        const [rx, ry] = ru.state(g.t), dx = p.x - rx, dy = p.y - ry, d = Math.hypot(dx, dy);
        if (d < (Stations.SAFE_R || 260) + 40 && d > 1e-6) { ax += dx / d * 2; ay += dy / d * 2; }
      }
    }
    return [ax, ay];
  }

  // keep a standoff point at least HOVER_ALT above the ground
  function lift(g, x, y) {
    const nb = Game.nearestBody(g, x, y);
    if (nb.alt >= HOVER_ALT) return [x, y];
    const r = World.surfaceR(nb.b, Math.atan2(nb.ly, nb.lx)) + HOVER_ALT;
    return [nb.bx + nb.ux * r, nb.by + nb.uy * r];
  }

  // standoff points never sit inside the Hub's patrol radius or Rust's bubble
  function keepOut(g, x, y) {
    const out = (cx, cy, R) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; if (d < R) { x = cx + dx / d * R; y = cy + dy / d * R; } };
    const c = g.w.byId.mochi;
    if (c) { const [cx, cy] = World.bodyState(g.w, c, g.t); out(cx, cy, SAFE_MOCHI + 40); }
    const ru = stationsOn() && typeof Stations.byId === 'function' ? Stations.byId(g, 'rusts') : null;
    if (ru) { const [rx, ry] = ru.state(g.t); out(rx, ry, (Stations.SAFE_R || 260) + 30); }
    return [x, y];
  }

  // if a body sits between the pirate and its goal, aim for a point round its side instead
  function detour(g, p, tx, ty) {
    const ex = tx - p.x, ey = ty - p.y, d = Math.hypot(ex, ey);
    if (d < 2) return [tx, ty];
    const hit = Game.raycast(g, p.x, p.y, ex / d, ey / d, d, { targets: false });
    if (!hit || !hit.body) return [tx, ty];
    const b = hit.body, [bx, by] = World.bodyState(g.w, b, g.t), R = b.R * (1 + b.shape) + HOVER_ALT + 14;
    const a0 = Math.atan2(p.y - by, p.x - bx), da = wrapPi(Math.atan2(ty - by, tx - bx) - a0);
    const a = a0 + (da >= 0 ? 1 : -1) * Math.min(Math.abs(da), 0.7);
    return [bx + R * Math.cos(a), by + R * Math.sin(a)];
  }

  // -------- pirate guns: bursts, lead aim, spread; warning shots first if you are unarmed --------

  function shoot(g, M, p, q, d) {
    const u = P_LEN / 10, c = Math.cos(p.ang), s = Math.sin(p.ang);
    const mx = p.x - c * 1.9 * u, my = p.y - s * 1.9 * u;                // turret, behind the cockpit
    const s0 = p.P.speed, rx = q.x - mx, ry = q.y - my, vx = q.vx - p.vx, vy = q.vy - p.vy;
    const A = vx * vx + vy * vy - s0 * s0, B = 2 * (rx * vx + ry * vy), C = rx * rx + ry * ry;
    let t = Math.sqrt(C) / s0;
    if (A < -1e-9) t = (-B - Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
    p.aimAng = Math.atan2(ry + vy * t, rx + vx * t);
    if (g.t < p.nextShot) return;
    const ray = Game.raycast(g, mx, my, rx / (Math.sqrt(C) || 1), ry / (Math.sqrt(C) || 1), Math.max(0, Math.sqrt(C) - q.r), { targets: false });
    if (ray) { p.nextShot = g.t + 0.4; return; }                        // no clear line: reposition first
    const warn = !p.warned && !armed(g) && q.kind === 'ship';
    if (warn && p.shots === p.P.burst) say(g, M, p, 'warn', true);
    const off = warn ? (M.rand() < 0.5 ? -1 : 1) * Math.atan2(q.r + 6, Math.sqrt(C)) : 0;
    const a = p.aimAng + gauss(M) * p.P.acc + off, ca = Math.cos(a), sa = Math.sin(a);
    fire(g, { x: mx + ca * 1.7 * u, y: my + sa * 1.7 * u, vx: p.vx + ca * s0, vy: p.vy + sa * s0, team: 'pirate',
              dmg: Math.round(lerp(M.rand(), p.P.dmg)), owner: p.id, col: PIRATE_COL, style: 'tracer' });
    M.flashes.push({ who: p.id, real: g.real, col: PIRATE_COL });
    if (--p.shots > 0) p.nextShot = g.t + p.P.rate;
    else { p.shots = p.P.burst; p.nextShot = g.t + lerp(M.rand(), p.P.gap); if (warn) p.warned = true; }
  }
  const gauss = (M) => (M.rand() + M.rand() + M.rand() - 1.5) * 2;

  // -------- getting hit, dying --------

  const HIT_WORDS = ['BLAM!', 'POW!', 'THWACK!', 'KAPOW!', 'BONK!'];

  function hurt(g, M, p, dmg, kind, src, where = '') {
    if (p.gone || !(dmg > 0)) return;
    p.hp -= dmg; p.hitReal = g.real;
    if (kind !== 'bump') { p.lastHitT = g.t; p.aggro = 20; }
    if (kind === 'blast' && src && isFinite(src.x) && isFinite(src.y)) {      // an Orion pulse shoves them too
      const dx = p.x - src.x, dy = p.y - src.y, d = Math.hypot(dx, dy) || 1;
      p.vx += dx / d * 4; p.vy += dy / d * 4;
    }
    if (g.real - p.wordReal > 0.3) {
      p.wordReal = g.real;
      const w = kind === 'laser' ? 'ZZT!' : kind === 'blast' ? 'BOOM!' : kind === 'bump' ? 'CLONK!' : HIT_WORDS[Math.floor(M.rand() * HIT_WORDS.length)];
      Game.popup(g, w, '#ffd166', p.x, p.y, 22);
    }
    if (p.hp <= 0) { kill(g, M, p, kind, where); return; }
    if (kind === 'bump') return;
    const why = hostileTo(g);
    if ((why === 'hub' || why === 'rusts') && p.state !== 'flee') { setState(g, p, 'flee', `shot from ${why}`); say(g, M, p, 'cheap', true); return; }
    if (p.state === 'lurk' && !why) setState(g, p, 'attack', 'shot at');
    if (M.rand() < 0.2) say(g, M, p, 'hit');
  }

  function kill(g, M, p, why, where = '') {
    if (p.gone) return;
    p.gone = true; p.hp = 0;
    boom(g, M, p);
    const z = zoneById(p.zone) || ZONES[1];
    loot(g, M, p, z);
    const yours = (why !== 'crash' && why !== 'bump') || g.t - p.lastHitT < 20;
    M.kills++;
    say(g, M, p, 'die', true);
    if (yours) {
      g.money += p.bounty; M.bounty += p.bounty;
      const P = me(g);
      Game.popup(g, `+$${p.bounty}`, '#8ff0b0', P.x, P.y, 30);
      Game.toast(g, `BOUNTY +$${p.bounty}`, '#8ff0b0', 'bounty');
      Game.log(g, `pirate ${p.name} ${where ? `crashed into ${where}` : 'destroyed'}: bounty +$${p.bounty} (${M.kills} beaten)`);
      Game.goal(g, 'pirate');
    } else Game.log(g, `pirate ${p.name} crashed into ${where || 'the rubble'} (no bounty: you never touched them)`);
    if (MILESTONES[M.kills]) Game.toast(g, MILESTONES[M.kills], RADIO_COL);
    if (g.navId === 'pirate:' + p.id) g.navId = M.loot.some((L) => L.id === p.id) ? 'loot:' + p.id : null;
  }

  function boom(g, M, p) {
    Game.popup(g, ['KA-BLAM!', 'KABOOM!', 'KER-SPLODE!'][Math.floor(M.rand() * 3)], '#ff9f1c', p.x, p.y, 34);
    Game.burst(g, 'boom', p.x, p.y, 60, { vx: p.vx, vy: p.vy, speed: 12 });
    Game.burst(g, 'spark', p.x, p.y, 30, { vx: p.vx, vy: p.vy, speed: 20, col: '#ffe066' });
    Game.burst(g, 'smoke', p.x, p.y, 16, { vx: p.vx, vy: p.vy, speed: 3, life: 1.6 });
    M.booms.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, t: g.t, real: g.real, R: 12 });
    for (let i = 0; i < 9; i++) {
      const a = M.rand() * 2 * Math.PI, v = 3 + 7 * M.rand();
      M.shards.push({ x: p.x, y: p.y, vx: p.vx + Math.cos(a) * v, vy: p.vy + Math.sin(a) * v, ang: a, om: (M.rand() - 0.5) * 8,
                      s: 0.5 + 0.9 * M.rand(), real: g.real, col: HULL[i % 3] });
    }
    if (M.shards.length > 60) M.shards.splice(0, M.shards.length - 60);
    const P = me(g);
    g.shake = Math.max(g.shake, clamp(1 - Math.hypot(P.x - p.x, P.y - p.y) / 200, 0.15, 0.8));
  }

  function loot(g, M, p, z) {
    const drops = [['scrap', 2 + Math.floor(M.rand() * 3)], ['parts', 1 + Math.floor(M.rand() * 2)]];
    if (M.rand() < z.core) drops.push(['core', 1]);
    const pks = [];
    for (const [item, n] of drops) for (let i = 0; i < n; i++) {
      const a = M.rand() * 2 * Math.PI, v = 0.4 + 0.9 * M.rand();
      const pk = Game.spawnPickup(g, { x: p.x + Math.cos(a) * 0.8, y: p.y + Math.sin(a) * 0.8, vx: p.vx + Math.cos(a) * v, vy: p.vy + Math.sin(a) * v, item, qty: 1 });
      if (pk && typeof pk === 'object') pks.push(pk);
    }
    if (pks.length) M.loot.push({ id: p.id, name: p.name, pks, pred: null });
    if (M.loot.length > 4) M.loot.shift();
  }

  // pickups still floating about (not scooped, not expired)
  function tidyLoot(g, M) {
    if (!M.loot.length) return;
    const live = new Set(g.pickups);
    for (const L of M.loot) L.pks = L.pks.filter((pk) => pk.qty > 0 && live.has(pk));
    M.loot = M.loot.filter((L) => L.pks.length);
  }

  // where a loot cluster's middle will be at time t: riding a body if it all settled, else coasting (cached per frame)
  function lootAt(g, L, t) {
    const n = L.pks.length;
    if (!n) return L.last || [0, 0, 0, 0];                               // all scooped up: a stale target asks one last time
    const b = L.pks[0].rest && L.pks[0].rest.b;
    if (b && L.pks.every((pk) => pk.rest && pk.rest.b === b)) {
      const [bx, by, bvx, bvy] = World.bodyState(g.w, b, t);
      const lx = L.pks.reduce((s, pk) => s + pk.rest.lx, 0) / n, ly = L.pks.reduce((s, pk) => s + pk.rest.ly, 0) / n;
      return [bx + lx, by + ly, bvx, bvy];
    }
    const c = ['x', 'y', 'vx', 'vy'].map((k) => L.pks.reduce((s, pk) => s + pk[k], 0) / n);
    if (Math.abs(t - g.t) < 1e-9) L.last = c;
    return coast(g, L, { x: c[0], y: c[1], vx: c[2], vy: c[3], r: 1 }, t);
  }

  function escape(g, M, p) {
    p.gone = true;
    M.fled.push({ name: p.name, short: p.short, pers: p.pers, hpMax: p.hpMax });
    if (M.fled.length > 6) M.fled.shift();
    Game.log(g, `pirate ${p.name} got away (they will remember this)`);
  }


  // ======================================================================
  //  PER FRAME: bullets, zones & spawning, despawning, effects
  // ======================================================================

  function after(g, inp, dt, simDt) {
    const M = st(g); if (!M) return;
    moveBullets(g, M);
    tidyLoot(g, M);
    if (simDt) { zones(g, M, simDt); tidy(g, M, simDt); }
    for (const sd of M.shards) { sd.x += sd.vx * simDt; sd.y += sd.vy * simDt; sd.ang += sd.om * simDt; }
    M.shards = M.shards.filter((sd) => g.real - sd.real < 2.5);
    M.booms = M.booms.filter((b) => g.real - b.real < 1.1);
    M.flashes = M.flashes.filter((f) => g.real - f.real < 0.08);
    const P = me(g);
    M.lootNear = M.loot.some((L) => L.pks.some((pk) => Math.hypot(pk.x - P.x, pk.y - P.y) < 250));
    M.nearD = Infinity; M.nearN = 0;
    for (const p of M.pirates) {
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      M.nearD = Math.min(M.nearD, d);
      if (d < ARROW_R) M.nearN++;
      if (p.hp < 0.5 * p.hpMax && g.real - p.smokeT > 0.12 && simDt) {
        p.smokeT = g.real;
        Game.burst(g, 'smoke', p.x - Math.cos(p.ang) * 3, p.y - Math.sin(p.ang) * 3, 1, { vx: p.vx, vy: p.vy, speed: 1.5, life: 1.2 });
      }
    }
  }

  function zones(g, M, simDt) {
    const P = me(g), why = hostileTo(g), z = why ? null : zoneAt(g, P.x, P.y);
    for (const Z of ZONES) M.zoneT[Z.id] = Z === z ? (M.zoneT[Z.id] || 0) + simDt : 0;
    if (!z || M.zoneT[z.id] < ENTER_T || g.t - M.lastSpawn < SPAWN_GAP) return;
    const alive = () => M.pirates.filter((p) => !p.gone).length, here = () => M.pirates.filter((p) => !p.gone && p.zone === z.id).length;
    if (alive() >= MAX_ALIVE || here() >= z.max) return;
    M.lastSpawn = g.t;
    spawn(g, z.id);
    if (z.pair && M.rand() < z.pair && alive() < MAX_ALIVE && here() < z.max) spawn(g, z.id, { quiet: true });
  }

  function tidy(g, M, simDt) {
    const P = me(g);
    for (const p of M.pirates) {
      if (p.gone) continue;
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (!isFinite(p.x + p.y + p.vx + p.vy)) { p.gone = true; Game.log(g, `pirate ${p.name} fell out of the universe (NaN)`); continue; }
      if (p.state === 'flee' && (d > GONE_R || g.t - p.fleeT > 45)) { escape(g, M, p); continue; }
      p.farT = d > FAR_R ? p.farT + simDt : 0;
      if (p.farT > FAR_T) { p.gone = true; Game.log(g, `pirate ${p.name} went home (you were far away)`); }
    }
    M.pirates = M.pirates.filter((p) => !p.gone);
  }


  // ======================================================================
  //  HOOKS: targets, nav, warp, hints, HUD rows, lifecycle
  // ======================================================================

  function targets(g) {
    const M = st(g); if (!M || !M.pirates.length) return null;
    return M.pirates.filter((p) => !p.gone).map((p) => ({
      id: 'pirate:' + p.id, team: 'pirate', x: p.x, y: p.y, r: p.r, name: p.name,
      hit: (g2, dmg, kind, src) => hurt(g2, M, p, dmg, kind, src),
    }));
  }

  function navTargets(g) {
    const M = st(g); if (!M || (!M.pirates.length && !M.loot.length)) return null;
    const P = me(g), near = (x, y) => Math.hypot(x - P.x, y - P.y) < NAV_R;
    return M.pirates.filter((p) => !p.gone && near(p.x, p.y)).map((p) => ({
      id: 'pirate:' + p.id, name: `Pirate: ${p.name}`, col: PIRATE_COL, r: p.r, kind: 'pirate', state: (t) => pirateAt(g, p, t),
    })).concat(M.loot.filter((L) => L.pks.length && near(L.pks[0].x, L.pks[0].y)).map((L) => ({
      id: 'loot:' + L.id, name: `Loot from ${L.name}`, col: LOOT_COL, r: 2, kind: 'loot', state: (t) => lootAt(g, L, t),
    })));
  }

  // where a pirate will be at time t if it coasts (honest ballistic guess; cached per frame)
  const pirateAt = (g, p, t) => coast(g, p, p, t);

  // ballistic guess for s = { x, y, vx, vy, r } at time t; the path is cached on `memo` for this frame
  function coast(g, memo, p, t) {
    if (Math.abs(t - g.t) < 1e-9) return [p.x, p.y, p.vx, p.vy];
    if (!memo.pred || memo.pred.t0 !== g.t) {
      const pr = Physics.predict({ x: p.x, y: p.y, vx: p.vx, vy: p.vy }, g.t, g.w, CONFIG.sim.predictMax, 300, p.r);
      memo.pred = { t0: g.t, pts: pr.pts, h: CONFIG.sim.predictMax / 300 };
    }
    const P = memo.pred.pts, f = (t - memo.pred.t0) / memo.pred.h;
    if (!(f > 0)) return [p.x, p.y, p.vx, p.vy];
    const i = Math.min(P.length - 2, Math.floor(f));
    if (i < 0) return [p.x, p.y, p.vx, p.vy];
    const a = P[i], b = P[i + 1], k = clamp(f - i, 0, 1), dt = Math.max(1e-6, b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (b[0] - a[0]) / dt, (b[1] - a[1]) / dt];
  }

  function warpLimit(g) {
    const M = st(g); if (!M || g.status === 'dead') return null;
    if (M.trigger) return { max: 1, why: 'guns firing', reset: true };
    if (g.status !== 'docked' && M.nearD < WARP_R) return { max: 1, why: 'pirates nearby', reset: true, toast: 'PIRATES!' };
    if (M.bullets.length) return { max: 4, why: 'bullets flying' };
    return null;
  }

  function hint(g) {
    const M = st(g); if (!M || g.ui || g.status === 'dead') return null;
    if (!(M.nearD < HINT_R)) return M.lootNear && g.mode === 'ship' && g.status === 'flying'
      ? { pri: 52, text: 'Pirate loot! Fly through the sparkles to scoop it up. Tab targets it so you can match speed.' } : null;
    const why = hostileTo(g), near = M.pirates.filter((p) => !p.gone), fleeing = near.find((p) => p.state === 'flee');
    const shop = stationsOn() ? "Rust's (circling Big Potato)" : 'the shop';
    if (why === 'docked') return { pri: 35, text: 'Pirates are waiting outside. They never shoot docked ships, so take your time.' };
    if (why) return null;
    if (g.mode === 'eva') return { pri: 60, text: `Pirates! On foot you're a sitting duck: your laser only reaches ${Math.round(g.S.laserRange || 7)} m. Board the ship (E)!` };
    if (!armed(g)) return { pri: 62, text: `No guns! Run, or buy one at ${shop}. Pirates give up once you leave their patch.` };
    if (fleeing) return { pri: 55, text: `${fleeing.name} is running away! Chase them for the bounty, or let them go.` };
    if (g.S.turret) return { pri: 54, text: `Pirates! Hold left click: your ${gunName(g)} turret shoots at the mouse. Lead a moving ship.` };
    return { pri: 54, text: `Pirates! Space fires your ${gunName(g)} along your nose: spin (A/D) to aim, and lead a moving ship.` };
  }

  function hudRows(g) {
    const M = st(g); if (!M) return null;
    const rows = [];
    if (armed(g)) {
      const ready = M.trigger ? 'BANG!' : g.status === 'docked' ? 'safe' : 'ready';
      rows.push({ label: g.S.turret ? 'TURRET' : 'GUN', val: `${gunName(g)} · ${ready}`, col: M.trigger ? '#e07b2a' : '#2f9e5b' });
    }
    if (M.nearN) rows.push({ label: 'PIRATES', val: `${M.nearN} near · ${M.kills} beaten`, col: BAD });
    return rows;
  }

  function controls(g) {
    if (!armed(g) || g.mode !== 'ship' || (g.status !== 'flying' && g.status !== 'landed')) return null;
    //  the core's own line (render.js) with the trigger slotted in
    return `W engine · Shift fine · A/D spin · S stop spin · ${g.S.turret ? 'click: fire at mouse' : 'Space fire'} · arrows nudge · X ion${g.S.orionCount ? ' · N pulse' : ''}` +
      ' · Tab target · , . warp · M map · wheel zoom · P pause';
  }

  function respawn(g) {
    const M = st(g); if (!M) return;
    M.bullets = []; M.flashes = []; M.trigger = false; M.cd = 0; M.zoneT = {}; M.lastSpawn = g.t;
    for (const p of M.pirates) { if (p.state === 'attack') setState(g, p, 'lurk', 'you got towed'); p.aggro = 0; }
  }

  function died(g) {
    const M = st(g); if (!M) return;
    M.trigger = false;
    const P = me(g), dist = (p) => Math.hypot(p.x - P.x, p.y - P.y);
    const near = M.pirates.filter((p) => !p.gone && p.state === 'attack').sort((a, b) => dist(a) - dist(b))[0];
    if (near) say(g, M, near, 'gloat', true);
    for (const p of M.pirates) if (p.state === 'attack') setState(g, p, 'lurk', 'you blew up');
  }


  // ======================================================================
  //  ART  (world space, y up)
  // ======================================================================

  //  half outline of a pirate ship in units of P_LEN / 10 (nose +x); mirrored for the other side
  const HALF = [[5.2, 0], [3.4, 0.8], [1.9, 1.35], [0.9, 1.55], [-1.2, 4.4], [-1.5, 2.55], [-2.9, 3.3], [-2.8, 1.6], [-4.1, 1.25], [-3.7, 0]];
  const TIPS = [[[-1.2, 4.4], [-0.68, 3.64], [-1.27, 3.94]], [[-2.9, 3.3], [-2.48, 3.08], [-2.87, 2.79]]];

  function hullPath(ctx, u) {
    ctx.beginPath();
    HALF.forEach(([x, y], i) => (i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u)));
    for (let i = HALF.length - 2; i > 0; i--) ctx.lineTo(HALF[i][0] * u, -HALF[i][1] * u);
    ctx.closePath();
  }

  // a frame at (x, y) where +x is screen right and +y is screen down, in metres (for faces and decals)
  function upright(kit, x, y) { const ctx = kit.ctx; ctx.translate(x, y); ctx.rotate(kit.cam.rot); ctx.scale(1, -1); }

  function drawWorld(g, kit) {
    const M = st(g); if (!M) return;
    if (g.status !== 'dead' && armed(g) && !g.S.turret) drawBarrels(g, kit);
    const view = kit.viewRect(30);
    for (const p of M.pirates) if (p.x > view[0] && p.x < view[2] && p.y > view[1] && p.y < view[3]) drawPirate(g, kit, M, p);
    drawShards(g, kit, M);
    drawLoot(g, kit, M, view);
  }

  function drawLoot(g, kit, M, view) {
    if (!M.loot.length) return;
    const ctx = kit.ctx, px = kit.px(), k = 0.5 + 0.5 * Math.sin(g.real * 5);
    for (const L of M.loot) for (const pk of L.pks) {
      if (pk.x < view[0] || pk.x > view[2] || pk.y < view[1] || pk.y > view[3]) continue;
      const R = Math.max(1.1, 10 * px) * (1 + 0.12 * k), a = g.real * 1.5 + pk.x;
      ctx.globalAlpha = 0.75 + 0.25 * k;
      ctx.beginPath(); ctx.arc(pk.x, pk.y, R, 0, 2 * Math.PI);
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.2, 4.5 * px); ctx.stroke();
      ctx.strokeStyle = LOOT_COL; ctx.lineWidth = Math.max(0.1, 2.2 * px); ctx.stroke();
      ctx.fillStyle = '#fffbe8'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.06, 1.2 * px);
      for (let i = 0; i < 2; i++) { const b = a + i * Math.PI; star(ctx, pk.x + Math.cos(b) * R, pk.y + Math.sin(b) * R, R * 0.42, R * 0.12, 4, b); ctx.fill(); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }

  function drawWorldTop(g, kit) {
    const M = st(g); if (!M) return;
    if (g.status !== 'dead' && armed(g) && g.S.turret) drawTurret(g, kit, M);
    drawBullets(g, kit, M);
    drawFlashes(g, kit, M);
    drawBooms(g, kit, M);
  }

  // -------- the pirate ship: spiky, purple, one angry eye, skull & crossbones --------

  function drawPirate(g, kit, M, p) {
    const ctx = kit.ctx, px = kit.px(), u = Math.max(P_LEN, MIN_PX * px) / 10, lw = Math.max(2.5 * px, 0.2 * u);
    const L = kit.LIGHT, c = Math.cos(p.ang), s = Math.sin(p.ang), lx = L[0] * c + L[1] * s, ly = -L[0] * s + L[1] * c;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw;

    if (p.thr > 0.03) {                                                  // hot pink flame
      const f = (0.7 + 0.3 * Math.random()) * (0.35 + 0.65 * p.thr);
      ctx.fillStyle = FLAME[0]; ctx.beginPath(); ctx.moveTo(-3.9 * u, 0.85 * u);
      ctx.lineTo(-(4.6 + 2.6 * f) * u, 0.55 * u); ctx.lineTo(-(4.4 + 1.6 * f) * u, 0.2 * u); ctx.lineTo(-(4.8 + 4.2 * f) * u, 0);
      ctx.lineTo(-(4.4 + 1.6 * f) * u, -0.2 * u); ctx.lineTo(-(4.6 + 2.6 * f) * u, -0.55 * u); ctx.lineTo(-3.9 * u, -0.85 * u);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = FLAME[1]; ctx.beginPath(); ctx.moveTo(-3.9 * u, 0.45 * u); ctx.lineTo(-(4.5 + 2 * f) * u, 0); ctx.lineTo(-3.9 * u, -0.45 * u); ctx.closePath(); ctx.fill();
    }
    hullPath(ctx, u); ctx.strokeStyle = RIM[0]; ctx.lineWidth = lw * 6; ctx.stroke();      // glow + rim, behind the hull
    ctx.strokeStyle = RIM[1]; ctx.lineWidth = lw * 2.8; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    ctx.fillStyle = '#2a1a4a'; kit.roundRect(-4.35 * u, -0.8 * u, 0.9 * u, 1.6 * u, 0.25 * u); ctx.fill(); ctx.stroke();   // nozzle

    hullPath(ctx, u); ctx.fillStyle = HULL[1]; ctx.fill();               // toon: shadow, lit base, highlight
    ctx.save(); hullPath(ctx, u); ctx.clip();
    ctx.save(); ctx.translate(lx * 0.9 * u, ly * 0.9 * u); hullPath(ctx, u); ctx.fillStyle = HULL[0]; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0.6 * u + lx * 0.5 * u, ly * 0.8 * u, 2.4 * u, 0.32 * u, 0, 0, 2 * Math.PI); ctx.fillStyle = HULL[2]; ctx.fill();
    ctx.fillStyle = TRIM;
    for (const sgn of [1, -1]) for (const T of TIPS) { ctx.beginPath(); T.forEach(([x, y], i) => (i ? ctx.lineTo(x * u, sgn * y * u) : ctx.moveTo(x * u, sgn * y * u))); ctx.closePath(); ctx.fill(); }
    if (g.real - p.hitReal < 0.09) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-6 * u, -5 * u, 12 * u, 10 * u); }
    ctx.restore();
    hullPath(ctx, u); ctx.stroke();
    ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(0.9 * u, 1.55 * u); ctx.lineTo(-2.6 * u, 1.55 * u); ctx.moveTo(0.9 * u, -1.55 * u); ctx.lineTo(-2.6 * u, -1.55 * u); ctx.stroke();
    ctx.fillStyle = BONE; ctx.lineWidth = lw * 0.7;                       // fangs
    for (const sgn of [1, -1]) { ctx.beginPath(); ctx.moveTo(3.7 * u, sgn * 0.62 * u); ctx.lineTo(4.55 * u, sgn * 0.3 * u); ctx.lineTo(3.55 * u, sgn * 0.2 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); }

    ctx.lineWidth = lw;                                                   // gun turret
    ctx.save(); ctx.translate(-1.9 * u, 0); ctx.rotate(p.aimAng - p.ang);
    ctx.fillStyle = '#8a86b3'; kit.roundRect(0, -0.24 * u, 1.9 * u, 0.48 * u, 0.15 * u); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.75 * u, 0, 2 * Math.PI); ctx.fillStyle = '#9d8fd0'; ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(-1.9 * u + lx * 0.3 * u, ly * 0.3 * u, 0.22 * u, 0, 2 * Math.PI); ctx.fillStyle = '#e4dcff'; ctx.fill();
    ctx.restore();

    const big = u * kit.cam.zoom > 2.2;                                    // face and decal, upright on screen
    ctx.save(); upright(kit, p.x + c * 2.3 * u, p.y + s * 2.3 * u); drawEye(g, kit, p, u, lw); ctx.restore();
    if (big) { ctx.save(); upright(kit, p.x + c * 0.2 * u, p.y + s * 0.2 * u); drawSkull(ctx, u * 0.62, lw * 0.7); ctx.restore(); }
  }

  // angry cyclops cockpit; bored while lurking; wide and sweaty while fleeing
  function drawEye(g, kit, p, u, lw) {
    const ctx = kit.ctx, rx = 1.0 * u, ry = 0.8 * u, mood = p.state, blink = (g.real + p.id * 1.7) % 4.1 < 0.1;
    const nose = kit.screenAng(p.ang), dir = Math.cos(nose) >= 0 ? 1 : -1;
    const look = kit.screenAng(Math.atan2(p.look[1], p.look[0])), lk = mood === 'flee' ? 0.12 : 0.3;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI); ctx.fillStyle = BONE; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI); ctx.clip();
    const ix = Math.cos(look) * lk * u, iy = Math.sin(look) * lk * u * 0.8;
    ctx.beginPath(); ctx.arc(ix, iy, mood === 'flee' ? 0.3 * u : 0.5 * u, 0, 2 * Math.PI); ctx.fillStyle = '#ff3b5c'; ctx.fill();
    ctx.beginPath(); ctx.arc(ix, iy, mood === 'flee' ? 0.13 * u : 0.24 * u, 0, 2 * Math.PI); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(ix - 0.12 * u, iy - 0.14 * u, 0.09 * u, 0, 2 * Math.PI); ctx.fillStyle = '#ffffff'; ctx.fill();
    if (blink || mood !== 'flee') {                                       // eyelid: slanted down toward the nose = angry
      const yL = blink ? 0.9 * u : mood === 'attack' ? (dir > 0 ? -0.55 : 0.05) * u : -0.05 * u;
      const yR = blink ? 0.9 * u : mood === 'attack' ? (dir > 0 ? 0.05 : -0.55) * u : -0.05 * u;
      ctx.beginPath(); ctx.moveTo(-1.3 * u, -1.2 * u); ctx.lineTo(1.3 * u, -1.2 * u); ctx.lineTo(1.3 * u, yR); ctx.lineTo(-1.3 * u, yL); ctx.closePath();
      ctx.fillStyle = HULL[1]; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI); ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = lw * 1.5; ctx.beginPath(); ctx.moveTo(-1.2 * u, yL - (yR - yL) * 0.05); ctx.lineTo(1.2 * u, yR + (yR - yL) * 0.05); ctx.stroke();
    } else {
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI); ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = '#7fd3ff'; ctx.lineWidth = lw * 0.6;                // sweat drop
      ctx.beginPath(); ctx.moveTo(1.15 * u, -0.95 * u); ctx.quadraticCurveTo(1.5 * u, -0.45 * u, 1.15 * u, -0.35 * u); ctx.quadraticCurveTo(0.8 * u, -0.45 * u, 1.15 * u, -0.95 * u);
      ctx.fill(); ctx.stroke();
    }
  }

  function drawSkull(ctx, k, lw) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [x0, y0, x1, y1] of [[-1.1, -0.9, 1.1, 1.0], [1.1, -0.9, -1.1, 1.0]]) {      // crossbones
      ctx.beginPath(); ctx.moveTo(x0 * k, y0 * k); ctx.lineTo(x1 * k, y1 * k);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.42 * k + 2 * lw; ctx.stroke();
      ctx.strokeStyle = BONE; ctx.lineWidth = 0.42 * k; ctx.stroke();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    ctx.fillStyle = BONE; rrect(ctx, -0.42 * k, 0.1 * k, 0.84 * k, 0.6 * k, 0.15 * k); ctx.fill(); ctx.stroke();      // jaw
    ctx.beginPath(); ctx.arc(0, -0.15 * k, 0.66 * k, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();                              // cranium
    ctx.fillStyle = BONE; ctx.fillRect(-0.36 * k, 0.12 * k, 0.72 * k, 0.2 * k);
    ctx.fillStyle = INK;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 0.27 * k, -0.12 * k, 0.17 * k, 0, 2 * Math.PI); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(0, 0.08 * k); ctx.lineTo(-0.08 * k, 0.24 * k); ctx.lineTo(0.08 * k, 0.24 * k); ctx.closePath(); ctx.fill();
    ctx.lineWidth = lw * 0.6; ctx.beginPath();
    for (const sx of [-0.18, 0, 0.18]) { ctx.moveTo(sx * k, 0.4 * k); ctx.lineTo(sx * k, 0.66 * k); }
    ctx.stroke();
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // -------- your guns: two barrels beside the nose, or a dome turret --------

  function shipU(g, kit) { return Math.max(g.S.length, 34 * kit.px()) / 10; }      // matches the core's ship sprite size

  function drawBarrels(g, kit) {
    const ctx = kit.ctx, sh = g.sh, u = shipU(g, kit), lvl = clamp(g.S.gun | 0, 1, 3), len = [0, 3.9, 4.2, 4.8][lvl];
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.ang);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2 * kit.px(), 0.22 * u); ctx.lineJoin = 'round';
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = BARREL[lvl]; kit.roundRect(0.4 * u, sgn * 2.6 * u - 0.3 * u, len * u, 0.6 * u, 0.2 * u); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect((0.4 + len - 0.45) * u, sgn * 2.6 * u - 0.36 * u, 0.3 * u, 0.72 * u);
      if (lvl === 3) for (let k = 0; k < 3; k++) { ctx.fillStyle = '#7cf5d6'; ctx.fillRect((1.4 + k * 0.9) * u, sgn * 2.6 * u - 0.3 * u, 0.25 * u, 0.6 * u); }
    }
    ctx.restore();
  }

  function drawTurret(g, kit, M) {
    const ctx = kit.ctx, sh = g.sh, u = shipU(g, kit), lvl = clamp(g.S.gun | 0, 1, 3);
    const x = sh.x - Math.cos(sh.ang) * 2 * u, y = sh.y - Math.sin(sh.ang) * 2 * u;
    ctx.save(); ctx.translate(x, y); ctx.rotate(M.aimAng);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2 * kit.px(), 0.22 * u); ctx.lineJoin = 'round';
    ctx.fillStyle = BARREL[lvl]; kit.roundRect(0, -0.28 * u, 2.6 * u, 0.56 * u, 0.2 * u); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 1.0 * u, 0, 2 * Math.PI); ctx.fillStyle = '#c9c4e8'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.3 * u, 0.3 * u, 0.3 * u, 0, 2 * Math.PI); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }

  // -------- bullets: glowing tracers (or actual peas), drawn as you see them move --------

  function drawBullets(g, kit, M) {
    if (!M.bullets.length) return;
    const ctx = kit.ctx, px = kit.px(), view = kit.viewRect(10), V = me(g);
    ctx.lineCap = 'round';
    for (const b of M.bullets) {
      if (b.x < view[0] || b.x > view[2] || b.y < view[1] || b.y > view[3]) continue;
      const rvx = b.vx - V.vx, rvy = b.vy - V.vy, rv = Math.hypot(rvx, rvy) || 1;
      if (b.style === 'pea') {
        const r = Math.max(0.28, 4.5 * px), tl = Math.min(2.5, rv * 0.03);
        ctx.strokeStyle = 'rgba(143,227,107,0.35)'; ctx.lineWidth = r * 1.6;
        ctx.beginPath(); ctx.moveTo(b.x - rvx / rv * tl, b.y - rvy / rv * tl); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 2 * Math.PI); ctx.fillStyle = b.col; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5 * px, r * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x - r * 0.3, b.y + r * 0.3, r * 0.3, 0, 2 * Math.PI); ctx.fillStyle = '#e8ffd8'; ctx.fill();
        continue;
      }
      const len = Math.max(12 * px, Math.min(6, rv * 0.045)), x0 = b.x - rvx / rv * len, y0 = b.y - rvy / rv * len;
      const seg = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(b.x, b.y); ctx.stroke(); };
      ctx.globalAlpha = 0.3; seg(Math.max(1.0, 9 * px), b.col); ctx.globalAlpha = 1;
      seg(Math.max(0.45, 4.5 * px), INK);
      seg(Math.max(0.28, 2.8 * px), b.col);
      ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = Math.max(0.1, 1.1 * px);
      ctx.beginPath(); ctx.moveTo((x0 + b.x) / 2, (y0 + b.y) / 2); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawFlashes(g, kit, M) {
    const ctx = kit.ctx, px = kit.px();
    for (const f of M.flashes) {
      let x, y, a, s;
      if (f.who === 'ship') {
        if (g.status === 'dead') continue;
        const sh = g.sh, u = shipU(g, kit);
        if (f.side) { const lvl = clamp(g.S.gun | 0, 1, 3), len = [0, 3.9, 4.2, 4.8][lvl] + 0.6, fx = Math.cos(sh.ang), fy = Math.sin(sh.ang), lat = 2.6 * u * f.side;
          x = sh.x + fx * len * u - fy * lat; y = sh.y + fy * len * u + fx * lat; a = sh.ang; }
        else { a = M.aimAng; x = sh.x - Math.cos(sh.ang) * 2 * u + Math.cos(a) * 2.8 * u; y = sh.y - Math.sin(sh.ang) * 2 * u + Math.sin(a) * 2.8 * u; }
        s = Math.max(1.1, 10 * px);
      } else {
        const p = M.pirates.find((q) => q.id === f.who); if (!p) continue;
        const u = Math.max(P_LEN, MIN_PX * px) / 10;
        a = p.aimAng; x = p.x - Math.cos(p.ang) * 1.9 * u + Math.cos(a) * 2.1 * u; y = p.y - Math.sin(p.ang) * 1.9 * u + Math.sin(a) * 2.1 * u;
        s = Math.max(1.0, 9 * px);
      }
      const k = 1 - (g.real - f.real) / 0.08;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.35 : i === 0 ? 1.6 : 0.9) * s * (0.6 + 0.4 * k), t = i / 10 * 2 * Math.PI; i ? ctx.lineTo(r * Math.cos(t), r * Math.sin(t)) : ctx.moveTo(r, 0); }
      ctx.closePath(); ctx.fillStyle = '#fff3a0'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5 * px, 0.1 * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.35 * s, 0, 2 * Math.PI); ctx.fillStyle = f.col; ctx.fill();
      ctx.restore();
    }
  }

  function drawBooms(g, kit, M) {
    const ctx = kit.ctx, px = kit.px();
    for (const B of M.booms) {
      const age = g.real - B.real, k = clamp(age / 0.9, 0, 1), x = B.x + B.vx * (g.t - B.t), y = B.y + B.vy * (g.t - B.t);
      const R = Math.max(B.R * (0.35 + 0.9 * Math.sqrt(k)), (30 + 70 * Math.sqrt(k)) * px);
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      star(ctx, x, y, R * 1.2, R * 0.75, 11, age * 2); ctx.fillStyle = '#ff7a1c'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3 * px, R * 0.05); ctx.lineJoin = 'round'; ctx.stroke();
      star(ctx, x, y, R * 0.9, R * 0.55, 11, -age * 3); ctx.fillStyle = '#ffd166'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + kit.LIGHT[0] * R * 0.1, y + kit.LIGHT[1] * R * 0.1, R * 0.35 * (1 - k * 0.5), 0, 2 * Math.PI); ctx.fillStyle = '#fffbe8'; ctx.fill();
      ctx.globalAlpha = Math.max(0, 0.8 - k);
      ctx.beginPath(); ctx.arc(x, y, R * (1.25 + 0.9 * k), 0, 2 * Math.PI); ctx.strokeStyle = '#ffe2b0'; ctx.lineWidth = Math.max(0.5, 5 * px); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function star(ctx, x, y, r1, r2, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < 2 * n; i++) {
      const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1 * (0.8 + 0.2 * Math.sin(i * 2.7));
      i ? ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
  }

  function drawShards(g, kit, M) {
    const ctx = kit.ctx, px = kit.px();
    for (const sd of M.shards) {
      const k = (g.real - sd.real) / 2.5, s = Math.max(sd.s, 5 * px);
      ctx.save(); ctx.globalAlpha = clamp(1.4 - 1.4 * k, 0, 1); ctx.translate(sd.x, sd.y); ctx.rotate(sd.ang);
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-0.6 * s, 0.55 * s); ctx.lineTo(-0.4 * s, -0.6 * s); ctx.closePath();
      ctx.fillStyle = sd.col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5 * px, 0.12 * s); ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
    }
  }

  // -------- screen space: hp bars and name tags (under the HUD), red arrows to off-screen pirates (over it) --------

  function drawScreen(g, kit) {
    const M = st(g); if (!M || !M.pirates.length) return;
    const ctx = kit.ctx, P = me(g);
    for (const p of M.pirates) {
      const d = Math.hypot(p.x - P.x, p.y - P.y), [sx, sy] = kit.toScreen(p.x, p.y);
      if (!kit.onScreen(sx, sy, -8)) continue;
      const rs = Math.max(P_LEN * kit.cam.zoom, MIN_PX) * 0.5;
      if (p.hp < p.hpMax) {
        const w = 46, x = sx - w / 2, y = sy - rs - 18, f = clamp(p.hp / p.hpMax, 0, 1);
        ctx.fillStyle = INK; kit.roundRect(x - 2, y - 2, w + 4, 10, 4); ctx.fill();
        ctx.fillStyle = '#4a3a66'; kit.roundRect(x, y, w, 6, 3); ctx.fill();
        ctx.fillStyle = f > 0.5 ? '#8fe36b' : f > 0.25 ? '#ffd166' : BAD; kit.roundRect(x, y, Math.max(0.5, w * f), 6, 3); ctx.fill();
      }
      if (d < 260 && g.navId !== 'pirate:' + p.id) kit.tag(sx, sy + rs + 18, p.state === 'flee' ? `${p.name} (fleeing!)` : p.name, PIRATE_COL);
    }
  }

  // arrows sit where the line of sight leaves a frame inset clear of the side panels
  function drawHUD(g, kit) {
    const M = st(g); if (!M || !M.pirates.length || g.ui) return;
    const ctx = kit.ctx, W = kit.W, H = kit.H, P = me(g), [cx, cy] = kit.toScreen(P.x, P.y);
    const x0 = W > 640 ? 280 : 40, x1 = W - 44, y0 = 70, y1 = H - 140;
    for (const p of M.pirates) {
      const d = Math.hypot(p.x - P.x, p.y - P.y), [sx, sy] = kit.toScreen(p.x, p.y);
      const underPanels = W > 640 && sx < 252 && sy < H * 0.62;
      if (d > ARROW_R || (kit.onScreen(sx, sy, -8) && !underPanels)) continue;
      if (kit.edgeArrow && g.navId === 'pirate:' + p.id) continue;           // targeted: the core's teal target arrow covers it
      const a = Math.atan2(sy - cy, sx - cx), c = Math.cos(a), s = Math.sin(a);
      const ox = clamp(cx, x0, x1), oy = clamp(cy, y0, y1);
      const t = Math.min(c > 1e-6 ? (x1 - ox) / c : c < -1e-6 ? (x0 - ox) / c : Infinity, s > 1e-6 ? (y1 - oy) / s : s < -1e-6 ? (y0 - oy) / s : Infinity);
      let ex = ox + c * t, ey = oy + s * t;
      if (ex > W - 330 && ey < 170 && W > 760) ey = 170;                    // under the jobs panel
      ex = clamp(ex, x0, x1); ey = clamp(ey, y0, y1);
      const pulse = 1 + 0.12 * Math.sin(g.real * 8 + p.id), hot = p.state === 'attack';
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.scale(pulse, pulse);
      ctx.fillStyle = hot ? BAD : '#ff8fab'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-9, -16); ctx.lineTo(-3, 0); ctx.lineTo(-9, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      const tx = ex - c * 44, ty = ey - s * 34;
      ctx.save(); ctx.translate(tx, ty - 14); drawSkull(ctx, 7, 1.3); ctx.restore();
      kit.tag(tx, ty + 10, `${p.short} ${kit.fmtDist(d)}`, hot ? '#ff8fab' : '#ffd1dc');
    }
  }


  // ======================================================================
  //  REGISTER (+ the pirate job)
  // ======================================================================

  const mod = Game.register({
    id: 'combat', init, load, save, frame, step, after, onKey, onMouse, respawn, died,
    targets, navTargets, warpLimit, hint, hudRows, controls, drawWorld, drawWorldTop, drawScreen, drawHUD,
  });
  if (Game.mods.includes(mod)) {
    Game.addGoals([{ id: 'pirate', order: 85, reward: 300, text: 'Beat a pirate (try Big Potato)' }]);
  }

  return { list: (g) => (st(g) ? st(g).pirates : []), spawn, fire, zoneAt, hostileTo: (g) => hostileTo(g), armed,
           kill: (g, p, why = 'test') => kill(g, st(g), p, why), ZONES, CREW, PERS, SAFE_MOCHI, WARP_R };
})();

if (typeof module !== 'undefined') module.exports = Combat;
