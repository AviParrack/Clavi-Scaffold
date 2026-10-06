// ======================================================================
//  EVA  —  the little green prospector outside.  Landed: step out (E), walk,
//  jump and jetpack under honest gravity from every body, dig the terrain
//  grid with the mining laser, scan for gems.  Flying or docked: step out on
//  a tether (E), jet about in open space (WASD), winch home (Q), board (E).
//  Suit gear: sprint (Shift), dive roll (C), bombs (B, or hold right-click
//  to aim).  Mind the suit (air, HP, jet fuel); board to unload the pack.
//  API: EVA.isOut(g), isTethered(g), canStepOut(g), stepOut(g), board(g),
//       recall(g, why, lose), topUp(g, all), reach(b), astroMass(g)
// ======================================================================

const EVA = (() => {

  const ITEMS = CONFIG.items;

  // ---------------- tuning: on foot ----------------
  const FOOT_OFF = 0.3, FOOT_R = 0.45;        // feet circle below the torso centre (g.astro.x, y) [m]
  const HEAD_OFF = 0.45, HEAD_R = 0.38;       // helmet circle above it [m]
  const STAND = FOOT_OFF + FOOT_R;            // torso centre height above the ground [m]
  const UPRIGHT = 0.55;                       // ground normal . local up above this = walkable
  const WALK_ACC = 22, STOP_ACC = 26;         // ground traction [m/s^2]
  const WALK_FRAC = 0.6;                      // walk speed <= this x local circular speed
  const JUMP_V = 3.0, JUMP_ESC = 0.45;        // jump speed [m/s], never above this x local escape speed
  const JUMP_BUF = 0.15, COYOTE = 0.1;        // press-early / step-off grace [s]
  const JET_DELAY = 0.22;                     // keep holding this long after a jump to light the jetpack [s]
  const JET_SIDE = 0.6, JET_DOWN = 0.8;       // sideways / downward jet as a fraction of S.jet
  const JET_REFILL = 0.3;                     // jet seconds regained per second standing on the ground
  const CEIL_H = 40, CEIL_HILL = 0.75;        // suit governor: no orbit may reach past min(top + 40 m, 0.75 Hill radius)
  const SNAP = 0.55;                          // ground-follow distance when walking over bumps and grid steps [m]
  const STEP_V = 0.3;                         // walking up a ledge adds at most this much outward speed [m/s]
  const STEP_H = 0.6;                         // walking climbs ledges up to this tall (the dig grid is 0.5 m) [m]
  const SIDE_AFTER = 0.25;                    // A/D side jets only after this long in the air [s]
  const BOARD_R = 3;                          // board within this of the hull [m]
  const FAR_WARN = 120, FAR_MAX = 150;        // landed EVA: warn, then recall [m from the ship]
  const RECALL_T = 6;                         // seconds of warning before an auto-recall
  const O2_WARN = 30, SUFFOCATE = 8;          // air warning [s left]; suit HP lost per second at 0 air
  const HEAL_RATE = 2;                        // suit HP patched per second while aboard
  const FALL_HURT = 8, FALL_DMG = 5;          // landings faster than this hurt [m/s] (S.fallSafe overrides); HP per m/s over
  const DIG_TICK = 0.05, DIG_R = 0.55;        // laser dig cadence [s] and bite radius [m]
  const HIT_TICK = 0.1;                       // laser damage cadence on targets [s]
  const CHUNK_V = 8;                          // dug chunks ride back up the beam at this speed [m/s]
  const BEAM_PAST = 0.75;                     // the beam stops this far past the cursor: you dig what you point at [m]
  const SCAN_R = [4, 25, Infinity];           // gem scanner reach by S.scanner level [m]
  const ZOOM = 32, MIN_PX = 30, MIN_PX_SPACE = 60;   // EVA camera [px/m]; smallest on-screen astronaut, on a rock / out in space [px]
  const MINE_KG = 40;                         // job: ore hauled into the pack

  // ---------------- tuning: tethered spacewalk ----------------
  const BODY_KG = 85;                         // a Pipkin in a stock suit [kg]; + S.suitMass + the pack
  const EXIT_GAP = 0.8, EXIT_V = 0.4;         // step out this far off the hull [m], drifting away this fast [m/s]
  const SPIN_MAX = 0.5;                       // no stepping out of a ship spinning faster than this [rad/s]
  const TETHER_REST = 0.15;                   // a slack line snapping taut gives back this much
  const REEL_MIN = 1.2;                       // the winch stops this far off the hull [m]
  const SPOOL_V = 0.8;                        // the reel takes up slack line this fast (looks only) [m/s]
  const SPACE_IN = 4, SPACE_OUT = 2;          // open-space controls above / back to walking below this altitude [m]
  const ROCK_REST = 0.3, ROCK_HURT = 3;       // bouncing off rubble; hits faster than this hurt [m/s]
  const ROCK_DMG = 6, ROCK_DMG_MAX = 40;      // HP per m/s, capped
  const ROCK_SCAN = 40;                       // rocks within this get checked every physics step [m]
  const HULL_REST = 0.2;                      // bumping into your own hull
  const CRASH_WARN = 20;                      // warn when the parked ship will hit something within this [s]
  const SPACEWALK_T = 10;                     // job: a tethered spacewalk this long [s]

  // ---------------- tuning: sprint, roll, bombs ----------------
  const SPRINT_O2 = 1.5;                      // sprinting breathes this much faster
  const ROLL_ACC = 60;                        // ground grip during a dive roll [m/s^2]
  const BOMB_R = 0.15;                        // bomb collision radius [m]
  const BOMB_REST = 0.3, BOMB_FRIC = 0.5;     // bounce
  const BOMB_POWER = 6;                       // dig units: a bomb breaks anything but built stone in one go
  const BOMB_ESC = 0.9;                       // near a body, throws stay under this x local escape speed
  const SELF_DMG = 0.5, SHIP_DMG = 0.25;      // your own bombs hurt you and your ship this much less
  const ARC_DT = 1 / 30;                      // bomb arc preview step [s]
  const BOOM_T = 0.5;                         // comic starburst lifetime [s]
  const BOOM_WORD = ['POP!', 'BOOM!', 'KRA-KOOM!'];

  const INK = '#1b1433';
  const SKIN = ['#8fe07a', '#4f9e45', '#d8ffbf'], SUIT = ['#f6f2ff', '#b7afdc', '#ffffff'];
  const PACK = ['#ff9f43', '#c25f1c', '#ffd8a6'], GUN = ['#8a86b3', '#565180', '#d9d6f2'];
  const MECH = ['#d6d1f2', '#8c84b3', '#f7f5ff'], DARK = ['#6e6896', '#4b4670', '#9b97b8'];
  const BEAM = '#ff4f8b', ANTENNA = '#ff7eb6', GLOW = '#7cf5d6', TEAL = '#7cf5d6', BRASS = '#e3b04b';
  const SUIT_NAME = ['Stock suit', 'Padded suit', 'Armored suit', 'Strider', 'Mecha-Pip'];
  const MAT_NAME = { regolith: 'regolith', ice: 'water ice', iron: 'iron ore', nickel: 'nickel', platinum: 'platinum' };
  const MAT_FEEL = { regolith: 'soft dirt', ice: 'easy', iron: 'tough', nickel: 'tougher', platinum: 'very hard' };
  const BREAK_WORD = { regolith: ['ZZT!', 'FZZT!'], ice: ['CRSSH!', 'KRISH!'], iron: ['KRAK!', 'CRUNCH!'],
                       nickel: ['KRUNK!', 'CLANK!'], platinum: ['TING!', 'TINK!'] };

  const haul = () => (typeof Haul !== 'undefined' && Haul ? Haul : null);


  // ======================================================================
  //  STATE
  // ======================================================================

  function fresh() {
    return { o2: 0, jet: 0, face: 1, phase: 0, grounded: false, gn: [0, 1], airT: 9, jumpQ: 0, jetLock: 0, stepT: 0, leapt: false,
             ctl: { walk: 0, up: false, down: false, jx: 0, jy: 0, sprint: false, reel: false }, touchUp: false,
             firing: false, aimL: null, aimS: null, aimDir: null,
             beam: null, hover: null, hoverRock: null, digAcc: 0, hitAcc: 0, fxT: 0, wordT: -9, clinkT: -9, thrust: 0, thrustDir: [0, -1],
             gov: false, govT: -9, cam: null, camOff: null, lost: 0, lostWhy: '', warnO2: false, gaspT: -9, pings: [], prevPack: {}, scanT: 0,
             digNearShip: 0, landT: -9, hauled: 0, gems: 0, outs: 0, gemT: -9,
             teth: false, space: false, sUp: Math.PI / 2, tLen: 30, paid: 0, J: 0, tethT: 0, autoReel: false, crashT: Infinity, crashWarn: false,
             sprinting: false, dustT: 0, roll: null, rollReady: 0,
             bombsN: 0, bombsCap: 0, bombT: 0, live: [], booms: [], aiming: false, rPrev: false, arc: null, bombCells: 0,
             wantRoll: false, wantBomb: false, throwT: -9,
             rocks: [], free: [], told: {},
             stats: { spacewalks: 0, maxTether: 0, bombs: 0, rolls: 0 } };
  }
  const st = (g) => g.mod.eva || (g.mod.eva = fresh());
  const isOut = (g) => !!(g.astro && g.astro.on && g.mode === 'eva');
  const isTethered = (g) => isOut(g) && !!st(g).teth;
  const tier = (g) => Math.max(0, Math.min(4, Math.round(g.S.suitTier ?? 0)));
  const astroMass = (g) => BODY_KG + (g.S.suitMass ?? 0) + Game.kgOf(g.pack);

  function init(g) { g.mod.eva = fresh(); }

  function load(g, d) {
    const m = st(g), num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
    if (!d || typeof d !== 'object') return;
    m.hauled = num(d.hauled); m.gems = Math.floor(num(d.gems)); m.outs = Math.floor(num(d.outs));
    const s = d.stats && typeof d.stats === 'object' ? d.stats : {};
    m.stats = { spacewalks: Math.floor(num(s.spacewalks)), maxTether: num(s.maxTether), bombs: Math.floor(num(s.bombs)), rolls: Math.floor(num(s.rolls)) };
  }
  const save = (g) => { const m = st(g); return { hauled: m.hauled, gems: m.gems, outs: m.outs, stats: { ...m.stats } }; };

  // after spawn, a load or a dev teleport: you are in the ship, suit topped up, any pack goes to the hold
  function ready(g) {
    const m = st(g);
    resetSuit(g, m);
    Object.assign(m, { live: [], booms: [], bombsCap: g.S.bombs ?? 0, bombsN: g.S.bombs ?? 0, bombT: 0, rollReady: 0 });
    if (!g.astro.on && Object.keys(g.pack).length) Game.unloadPack(g);
    m.prevPack = { ...g.pack };
  }
  function resetSuit(g, m) {
    Object.assign(m, { o2: g.S.o2, jet: g.S.jetFuel, firing: false, beam: null, hover: null, hoverRock: null, lost: 0, warnO2: false,
                       jumpQ: 0, jetLock: 0, thrust: 0, gov: false, digAcc: 0, hitAcc: 0, cam: null, camOff: null, digNearShip: 0,
                       teth: false, space: false, J: 0, tethT: 0, autoReel: false, crashT: Infinity, crashWarn: false,
                       sprinting: false, roll: null, aiming: false, arc: null });
  }
  function respawn(g) { const m = st(g); resetSuit(g, m); m.prevPack = { ...g.pack }; m.pings = []; m.live = []; m.booms = []; }
  function died(g) {
    const m = st(g);
    if (!isOut(g)) return;
    if (m.teth) { m.teth = false; m.autoReel = false; m.space = false; Game.log(g, 'tether cut: the ship is gone'); }
    Game.toast(g, `YOUR ${g.S.name.toUpperCase()} GOT WRECKED!`, '#ff5d5d');
    Game.log(g, 'ship destroyed while outside');
  }

  // dev U, the Noodle Hole's fries: all = HP, air, jet fuel, bombs, roll; false = HP and air only
  function topUp(g, all = true) {
    const m = st(g), A = g.astro, S = g.S;
    A.hp = A.hpMax; m.o2 = S.o2; m.warnO2 = false; m.autoReel = false;
    if (!all) return;
    m.jet = S.jetFuel; m.bombsCap = S.bombs ?? 0; m.bombsN = m.bombsCap; m.bombT = 0; m.rollReady = 0;
  }

  // first-time tips, once per session each
  function tip(g, m, key, text) {
    if (m.told[key]) return;
    m.told[key] = true;
    Game.toast(g, text, '#7cf5d6');
  }


  // ======================================================================
  //  STEP OUT / BOARD / RECALL
  // ======================================================================

  // null when you may step out, else why not: 'busy' | 'dead' | 'engine' | 'spin'
  function whyNot(g) {
    if (g.mode !== 'ship' || g.astro.on || g.ui) return 'busy';
    if (g.status === 'dead') return 'dead';
    if (g.status === 'landed') return g.landedOn && g.land ? null : 'busy';
    if (g.status !== 'flying' && g.status !== 'docked') return 'busy';
    if (g.fired && g.fired.main > 0) return 'engine';
    if (Math.abs(g.sh.omega) >= SPIN_MAX) return 'spin';
    return null;
  }
  const canStepOut = (g) => !whyNot(g);

  function stepOut(g) {
    if (!canStepOut(g)) return false;
    return g.status === 'landed' ? stepOnto(g) : spacewalk(g);
  }

  // a spot on the ground beside the ship: [x, y, side] in world coords, or null
  function exitSpot(g) {
    const b = g.landedOn, L = g.land, T = Terrain.of(b), S = g.S;
    const rS = Math.hypot(L.lx, L.ly), th0 = Math.atan2(L.ly, L.lx);
    for (const side of [1, -1]) {
      const th = th0 - side * (S.radius + 1.6) / rS, c = Math.cos(th), s = Math.sin(th);
      let r = rS + 4;
      const hits = (rr) => Terrain.collideCircle(T, (rr - FOOT_OFF) * c, (rr - FOOT_OFF) * s, FOOT_R);
      while (r > rS - 10 && !hits(r)) r -= 0.1;
      if (r <= rS - 10) continue;
      for (let k = 0; k < 60 && hits(r); k++) r += 0.02;
      if (Terrain.collideCircle(T, (r + HEAD_OFF) * c, (r + HEAD_OFF) * s, HEAD_R)) continue;
      const [bx, by] = World.bodyState(g.w, b, g.t);
      return [bx + r * c, by + r * s, side];
    }
    return null;
  }

  // landed: onto the ground beside the ship, no tether (as v3)
  function stepOnto(g) {
    const A = g.astro, m = st(g), b = g.landedOn, [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
    const ex = exitSpot(g), spot = ex || [g.sh.x, g.sh.y, 1];
    const lx = spot[0] - bx, ly = spot[1] - by, d = Math.hypot(lx, ly);
    Object.assign(A, { on: true, x: spot[0], y: spot[1], vx: bvx, vy: bvy, ang: Math.atan2(ly, lx) });
    g.mode = 'eva';
    resetSuit(g, m);
    Object.assign(m, { face: spot[2], grounded: true, gn: [lx / d, ly / d], airT: 0, phase: 0,
                       prevPack: { ...g.pack }, cam: { b: b.id, lx: g.sh.x - bx, ly: g.sh.y - by } });
    m.outs++;
    Game.popup(g, 'POP!', '#8ff0b0', A.x, A.y + 1, 22);
    Game.burst(g, 'puff', A.x, A.y, 8, { vx: bvx, vy: bvy, speed: 2, life: 0.5 });
    gearTips(g, m, true);
    Game.log(g, `stepped out on ${b.name}${ex ? '' : ' (no room beside it: popped out on top)'}`);
    return true;
  }

  // flying or docked: out of the hatch on the side away from the nearest body, on a tether
  function spacewalk(g) {
    const A = g.astro, m = st(g), S = g.S, sh = g.sh, nb = Game.nearestBody(g, sh.x, sh.y), len = S.tetherLen ?? 30;
    const nx = nb.ux, ny = nb.uy, gap = S.radius + EXIT_GAP;
    Object.assign(A, { on: true, x: sh.x + nx * gap, y: sh.y + ny * gap, vx: sh.vx + nx * EXIT_V, vy: sh.vy + ny * EXIT_V, ang: Math.atan2(ny, nx) });
    g.mode = 'eva';
    resetSuit(g, m);
    Object.assign(m, { teth: true, space: true, sUp: Math.PI / 2, face: nx < 0 ? -1 : 1, grounded: false, airT: 9, phase: 0,
                       tLen: len, paid: gap, tethT: 0, prevPack: { ...g.pack } });
    m.outs++; m.stats.spacewalks++;
    Game.popup(g, 'WHEEE!', '#7cf5d6', A.x, A.y + 1, 22);
    Game.burst(g, 'puff', A.x, A.y, 8, { vx: A.vx, vy: A.vy, speed: 1.5, life: 0.5 });
    tip(g, m, 'walk', 'SPACEWALK! WASD JETS · Q WINCHES YOU IN · E BOARDS AT THE HULL');
    gearTips(g, m, false);
    Game.log(g, `EVA: tethered spacewalk from ${S.name} (${len} m line)${g.status === 'docked' ? ', docked' : ''}`);
    return true;
  }

  function gearTips(g, m, onFoot) {
    const S = g.S;
    if ((S.bombs ?? 0) > 0) tip(g, m, 'bomb', 'BOMBS: B THROWS AT THE CURSOR · HOLD RIGHT-CLICK TO AIM THE ARC');
    if ((S.roll ?? 0) >= 1) tip(g, m, 'roll', (S.rollAir ?? 0) > 0 ? 'C: DIVE ROLL (DODGES BITES; IN SPACE A JET DASH)' : 'C: DIVE ROLL (DODGES BITES)');
    if ((S.sprint ?? 1) > 1 && onFoot) tip(g, m, 'sprint', 'HOLD SHIFT TO SPRINT');
  }

  const hullDist = (g) => Math.hypot(g.astro.x - g.sh.x, g.astro.y - g.sh.y) - g.S.radius;
  const canBoard = (g) => isOut(g) && g.status !== 'dead' && !g.ui && hullDist(g) < BOARD_R;

  // back inside: pack -> hold (leftovers stay in the pack), air and jet refilled
  function toShip(g) {
    const A = g.astro, m = st(g);
    A.on = false; A.vx = 0; A.vy = 0; g.mode = 'ship';
    resetSuit(g, m);
    g.toasts = g.toasts.filter((t) => t.key !== 'evaO2' && t.key !== 'evaTether' && t.key !== 'evaCrash');   // stale "head back!" nags
    const moved = Game.unloadPack(g);
    m.prevPack = { ...g.pack };
    return moved;
  }

  // a coasting ship takes the astronaut's momentum: dv = mA (vA - vS) / (mS + mA)
  function catchAstro(g) {
    const A = g.astro, sh = g.sh, mA = astroMass(g), mS = Physics.mass(sh, g.S) * 1000, k = mA / (mS + mA);
    sh.vx += (A.vx - sh.vx) * k; sh.vy += (A.vy - sh.vy) * k;
  }

  function board(g) {
    if (!canBoard(g)) return false;
    const m = st(g), walk = m.teth ? m.tethT : 0;
    if (m.teth && g.status === 'flying') catchAstro(g);
    const moved = toShip(g), kg = Game.kgOf(moved), left = Game.kgOf(g.pack);
    if (kg || left) Game.toast(g, `UNLOADED ${kg.toFixed(0)} KG INTO THE HOLD${left ? `  ·  HOLD FULL, ${left.toFixed(0)} KG STAYS IN YOUR PACK` : ''}`, left ? '#ff9f1c' : '#8ff0b0');
    else Game.popup(g, 'HOME!', '#8ff0b0', g.sh.x, g.sh.y);
    Game.log(g, `boarded ${g.S.name}${walk ? ` after a ${walk.toFixed(0)} s spacewalk` : ''}: ${Object.entries(moved).map(([k, q]) => `${q} ${k}`).join(', ') || 'empty pack'}${left ? `, ${left} kg left in pack` : ''}`);
    return true;
  }

  // why: 'suit' (HP gone: pack lost, HP back to half) | 'far' | 'adrift' (the suit reel pulls you in) | 'glitch'
  function recall(g, why, lose = false) {
    const A = g.astro;
    if (!isOut(g)) return false;
    Game.burst(g, 'flash', A.x, A.y, 1, { vx: A.vx, vy: A.vy, size: 3, life: 0.5, speed: 0 });
    if (g.status === 'dead') {                                         // no ship to come home to: the tow tug fetches you
      Game.log(g, `recall (${why}) with the ship wrecked: towed`);
      Game.respawn(g, 'crash');
      return true;
    }
    if (lose) { g.pack = {}; A.hp = A.hpMax * 0.5; }
    toShip(g);
    Game.toast(g, lose ? 'SUIT FAILURE! EMERGENCY RECALL (PACK LOST)' : 'TETHER RECALL: REELED BACK TO THE SHIP', lose ? '#ff5d5d' : '#ffd166');
    Game.log(g, `recall (${why})${lose ? ': pack lost, suit at half' : ''}`);
    return true;
  }


  // ======================================================================
  //  INPUT
  // ======================================================================

  const JUMP_KEYS = new Set(['KeyW', 'Space', 'ArrowUp']);
  const MOVE_KEYS = new Set(['KeyA', 'KeyD', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowDown']);
  const GEAR_KEYS = new Set(['KeyQ', 'ShiftLeft', 'ShiftRight']);

  function onKey(g, code) {
    if (g.ui) return false;
    if (!isOut(g)) return code === 'KeyE' && g.mode === 'ship' && (g.status === 'flying' || g.status === 'docked') ? tryStepOut(g) : false;
    const m = st(g);
    if (code === 'KeyC') { m.wantRoll = true; return true; }                // done in frame(), with this frame's keys and aim
    if (code === 'KeyB') { m.wantBomb = true; return true; }
    if (code === 'KeyE' && m.teth && !canBoard(g) && g.status !== 'dead') { Game.toast(g, 'TOO FAR TO BOARD: HOLD Q TO WINCH IN', '#ffd166', 'evaTether'); return true; }
    if (GEAR_KEYS.has(code)) return true;
    if (JUMP_KEYS.has(code)) { if (!m.space) m.jumpQ = JUMP_BUF; return true; }
    return MOVE_KEYS.has(code);
  }
  function tryStepOut(g) {
    const why = whyNot(g);
    if (why === 'engine') Game.toast(g, 'CUT THE ENGINE FIRST', '#ff9f1c', 'evaOut');
    else if (why === 'spin') Game.toast(g, 'STOP SPINNING FIRST (S)', '#ff9f1c', 'evaOut');
    else if (!why) stepOut(g);
    return why !== 'busy' && why !== 'dead';
  }
  const onMouse = (g) => isOut(g);                                     // outside, the mouse is the laser, not targeting

  function frame(g, inp, dt, simDt) {
    const m = st(g), A = g.astro, S = g.S, ms = inp.mouse, right = !!(ms && ms.right);
    setCursor(isOut(g));
    refillBombs(g, m, simDt || 0);
    if (!isOut(g)) { m.firing = false; m.aiming = false; m.arc = null; m.rPrev = right; m.rocks = []; m.free = []; m.wantRoll = m.wantBomb = false; return; }
    const k = inp.keys || new Set(), t = inp.touch || {}, has = (c) => k.has(c), c = m.ctl;
    c.walk = (has('KeyD') || has('ArrowRight') || t.rotR ? 1 : 0) - (has('KeyA') || has('ArrowLeft') || t.rotL ? 1 : 0);
    c.up = has('KeyW') || has('Space') || has('ArrowUp') || !!t.thrust;
    c.down = has('KeyS') || has('ArrowDown') || !!t.kill;
    c.jx = c.walk;                                                       // open space: jets in screen directions
    c.jy = (c.up ? 1 : 0) - (c.down ? 1 : 0);
    c.sprint = (has('ShiftLeft') || has('ShiftRight')) && (S.sprint ?? 1) > 1;
    c.reel = m.teth && (has('KeyQ') || m.autoReel);
    if (t.thrust && !m.touchUp && !m.space) m.jumpQ = JUMP_BUF;
    m.touchUp = !!t.thrust;
    m.jumpQ = Math.max(0, m.jumpQ - dt);
    m.o2 = Math.min(m.o2, S.o2); m.jet = Math.min(m.jet, S.jetFuel);

    if (ms && Number.isFinite(ms.x) && Number.isFinite(ms.y)) {          // aim kept in the rock's frame: it moves under us
      const nb = Game.nearestBody(g, A.x, A.y);
      m.aimL = [ms.x - nb.bx, ms.y - nb.by, nb.b.id];
      m.aimS = Number.isFinite(ms.sx) ? [ms.sx, ms.sy] : null;
      m.firing = !!ms.down && !g.ui;
    } else { m.aimL = null; m.aimS = null; m.firing = false; }

    // -------- right mouse: hold to aim the bomb arc, release to throw --------
    if (right && !m.rPrev && !g.ui) { m.aiming = (S.bombs ?? 0) > 0; if (!m.aiming) noBombs(g, m); }
    if (!right && m.rPrev && m.aiming) { m.aiming = false; throwBomb(g, m); }
    m.rPrev = right;
    if (m.wantRoll) { m.wantRoll = false; roll(g, m); }
    if (m.wantBomb) { m.wantBomb = false; throwBomb(g, m); }
    m.arc = m.aiming ? arcPreview(g, m) : null;

    const aim = aimWorld(g, m), [ux, uy] = upOf(g);
    const side = aim ? Math.sign((aim[0] - A.x) * uy - (aim[1] - A.y) * ux) : 0;   // + = screen right of you
    if ((m.firing || m.aiming) && side) m.face = side;
    else if (rollingNow(g, m)) m.face = m.roll.side;
    else if (c.walk) m.face = c.walk;                                   // walking or jetting: face where you go
    else if (side) m.face = side;                                       // standing about: face the cursor
    nearRocks(g, m);
  }

  let cursorOn = null;
  function setCursor(want) {
    if (want === cursorOn || typeof document === 'undefined') return;
    cursorOn = want;
    const cv = document.getElementById('game');
    if (cv) cv.style.cursor = want ? 'crosshair' : '';
  }

  // the sprite's up: local up on a rock, screen up out in open space
  const upAng = (g) => { const m = st(g); return m.space ? m.sUp : g.astro.ang; };
  const upOf = (g) => { const a = upAng(g); return [Math.cos(a), Math.sin(a)]; };
  const rollingNow = (g, m) => !!(m.roll && g.t < m.roll.t0 + m.roll.T);
  function aimWorld(g, m) {
    if (!m.aimL) return null;
    const b = g.w.byId[m.aimL[2]]; if (!b) return null;
    const [bx, by] = World.bodyState(g.w, b, g.t);
    return [bx + m.aimL[0], by + m.aimL[1]];
  }

  // rubble near enough to bump into this frame (rail rocks via the core's band test, plus haul's free rocks)
  function nearRocks(g, m) {
    const A = g.astro, S0 = World.states(g.w, g.t), out = [];
    for (const rk of g.w.rocks) {
      if (rk.gone) continue;
      const h = S0[rk.host.idx], dh = Math.hypot(A.x - h[0], A.y - h[1]);
      if (Math.abs(dh - rk.a) > rk.r + (rk.ae || 0) + ROCK_SCAN) continue;
      const [rx, ry] = World.rockState(g.w, rk, g.t);
      if (Math.hypot(A.x - rx, A.y - ry) < rk.r + ROCK_SCAN) out.push(rk);
    }
    m.rocks = out;
    const H = haul(), free = H && H.free ? H.free(g) : null;
    m.free = Array.isArray(free) ? free.filter((fr) => fr && Math.hypot(A.x - fr.x, A.y - fr.y) < fr.r + ROCK_SCAN) : [];
  }


  // ======================================================================
  //  PHYSICS (every 1/240 s step): gravity from all bodies, walking along the
  //  ground relative to the rock, jump, jetpack with the suit governor (on
  //  foot) or free jets (open space), collision, rubble, the tether
  // ======================================================================

  // how far out the suit governor lets any orbit reach (keeps you bound to tiny moons)
  const reach = (b) => Math.min(CEIL_HILL * b.hill, b.R * (1 + b.shape) + CEIL_H);
  const speedCap = (b, d) => WALK_FRAC * Math.sqrt(b.mu / d);
  const walkMax = (S, b, d) => Math.min(S.walk * (S.walkMult ?? 1), speedCap(b, d));

  // biggest kick along (ex, ey) that keeps the orbit energy under the governor cap
  function kickRoom(b, d, rvx, rvy, ex, ey) {
    const vu = rvx * ex + rvy * ey, v2 = rvx * rvx + rvy * rvy, Emax = World.phi(b, reach(b));
    const disc = vu * vu - v2 + 2 * (Emax - World.phi(b, d));
    return disc > 0 ? Math.max(0, -vu + Math.sqrt(disc)) : 0;
  }

  // jet throttle 0..1 along (ex, ey): only energy-adding thrust is ever cut
  function governor(b, d, rvx, rvy, ex, ey) {
    if (rvx * ex + rvy * ey <= 0) return 1;
    const R = reach(b), E = 0.5 * (rvx * rvx + rvy * rvy) + World.phi(b, d), Emax = World.phi(b, R), band = 0.08 * b.mu / R;
    return Math.max(0, Math.min(1, (Emax - E) / band));
  }

  function step(g, dt) {
    const m = st(g), A = g.astro;
    if (m.live.length) flyBombs(g, m, dt);                            // bombs fly on whether you are out or not
    if (!isOut(g)) return;
    const S = g.S, c = m.ctl, t0 = g.t - dt;
    if (![A.x, A.y, A.vx, A.vy].every(Number.isFinite)) return;
    const b = Game.nearestBody(g, A.x, A.y).b, s0 = World.bodyState(g.w, b, t0);
    const lx = A.x - s0[0], ly = A.y - s0[1], d = Math.hypot(lx, ly) || 1e-9, ux = lx / d, uy = ly / d;
    let rvx = A.vx - s0[2], rvy = A.vy - s0[3];
    const rolling = rollingNow(g, m);
    m.thrust = 0; m.gov = false;
    m.jetLock = Math.max(0, m.jetLock - dt);
    m.stepT = Math.max(0, m.stepT - dt);
    m.sprinting = false;

    // -------- walking: traction along the ground, relative to the rock (sprint, dive roll) --------
    if (m.grounded && !m.space) {
      let [nx, ny] = m.gn;
      if (nx * ux + ny * uy < UPRIGHT) { nx = ux; ny = uy; }
      m.sprinting = c.sprint && !!c.walk && !rolling;
      const vmax = m.sprinting ? Math.min(walkMax(S, b, d) * S.sprint, speedCap(b, d)) : walkMax(S, b, d);
      let want = c.walk * vmax, acc = c.walk ? WALK_ACC : STOP_ACC;
      if (rolling) { want = m.roll.side * Math.min((S.rollDist ?? 0) / Math.max(0.05, m.roll.T), speedCap(b, d)); acc = ROLL_ACC; }
      const dvx = ny * want - rvx, dvy = -nx * want - rvy, dv = Math.hypot(dvx, dvy);
      const k = Math.min(1, acc * dt / Math.max(dv, 1e-9));           // friction steers the whole velocity
      rvx += dvx * k; rvy += dvy * k;
      const vr = rvx * ux + rvy * uy;                                   // walking never pushes you off the rock: ledges are climbed in collide()
      if (vr > 0) { rvx -= ux * vr; rvy -= uy * vr; }
      m.jet = Math.min(S.jetFuel, m.jet + JET_REFILL * dt);
    }

    // -------- jump: a kick along local up, capped well below escape --------
    let jumped = false;
    if (!m.space && m.jumpQ > 0 && (m.grounded || m.airT < COYOTE)) {
      const vr = rvx * ux + rvy * uy;
      if (vr < 0) { rvx -= ux * vr; rvy -= uy * vr; }
      const j = Math.min(JUMP_V * (S.jumpMult ?? 1), JUMP_ESC * Math.sqrt(2 * b.mu / d), m.teth ? Infinity : kickRoom(b, d, rvx, rvy, ux, uy));
      rvx += ux * j; rvy += uy * j;
      Object.assign(m, { jumpQ: 0, grounded: false, airT: COYOTE, jetLock: JET_DELAY, leapt: true });
      jumped = true;
    }

    // -------- jets: open space = WASD in screen directions; on foot = hold up in the air, A/D nudge, S down --------
    const [ax, ay] = m.space ? spaceJets(g, m, dt) : footJets(g, m, b, d, ux, uy, rvx, rvy, dt);

    // -------- integrate (semi-implicit Euler), then collide with the rock, rubble and the tether --------
    const [gx, gy] = World.gravity(g.w, A.x, A.y, t0);
    A.vx = s0[2] + rvx + (gx + ax) * dt; A.vy = s0[3] + rvy + (gy + ay) * dt;
    A.x += A.vx * dt; A.y += A.vy * dt;
    if (!b.star) collide(g, m, b, dt, jumped);
    if (m.rocks.length || m.free.length) bumpRocks(g, m);
    if (m.teth) { bumpHull(g, m); tetherSolve(g, m, dt); }
    if (b.star && d < b.killR && A.hp > 0) { A.hp = 0; Game.popup(g, 'SIZZLE!', '#ff6b6b', A.x, A.y, 26); }
  }

  function footJets(g, m, b, d, ux, uy, rvx, rvy, dt) {
    const c = m.ctl, S = g.S;
    if (m.grounded || m.jet <= 0) return [0, 0];
    let fx = 0, fy = 0;
    if (c.up && m.jetLock <= 0) { fx += ux; fy += uy; }
    if (c.down) { fx -= ux * JET_DOWN; fy -= uy * JET_DOWN; }
    if (c.walk && m.airT > (m.leapt ? SIDE_AFTER : 0.6)) { fx += uy * c.walk * JET_SIDE; fy -= ux * c.walk * JET_SIDE; }   // walking off a ledge is no reason to fire jets
    const f = Math.hypot(fx, fy);
    if (f < 1e-6) return [0, 0];
    const ex = fx / f, ey = fy / f, thr = m.teth ? 1 : governor(b, d, rvx, rvy, ex, ey), k = Math.min(1, f) * thr;   // on a tether the line is the leash: no governor
    m.gov = thr < 1;
    m.jet = Math.max(0, m.jet - k * dt);
    m.thrust = k; m.thrustDir = [ex, ey];
    return [ex * S.jet * k, ey * S.jet * k];
  }

  // the camera does not rotate out here, so screen directions are world directions
  function spaceJets(g, m, dt) {
    const c = m.ctl, f = Math.hypot(c.jx, c.jy);
    if (f < 1e-6 || m.jet <= 0) return [0, 0];
    const ex = c.jx / f, ey = c.jy / f;
    m.jet = Math.max(0, m.jet - dt);
    m.thrust = 1; m.thrustDir = [ex, ey];
    return [ex * g.S.jet, ey * g.S.jet];
  }

  function collide(g, m, b, dt, jumped) {
    const A = g.astro, T = Terrain.of(b), s = World.bodyState(g.w, b, g.t);
    let lx = A.x - s[0], ly = A.y - s[1], rvx = A.vx - s[2], rvy = A.vy - s[3];
    const d = Math.hypot(lx, ly) || 1e-9, ux = lx / d, uy = ly / d;
    if (m.space && d > b.R * (1 + (b.shape || 0)) + 3) { m.grounded = false; m.airT += dt; return; }   // nowhere near the ground
    let ground = null, impact = 0, stepped = false;
    const vr0 = rvx * ux + rvy * uy, walking = m.grounded && !jumped && !m.thrust;
    const push = (h) => {
      lx += h.nx * h.depth; ly += h.ny * h.depth;
      const vn = rvx * h.nx + rvy * h.ny;
      if (vn < 0) { impact = Math.max(impact, -vn); rvx -= vn * h.nx; rvy -= vn * h.ny; }
    };
    // -------- step up: walking into a grid ledge up to STEP_H tall climbs it instead of pushing you back --------
    const dir = rollingNow(g, m) ? m.roll.side : m.ctl.walk;
    if (walking && dir) {
      const fh = Terrain.collideCircle(T, lx - ux * FOOT_OFF, ly - uy * FOOT_OFF, FOOT_R), tx = uy * dir, ty = -ux * dir;
      if (fh && fh.nx * tx + fh.ny * ty < -0.03) {
        for (let h = 0.02; h <= STEP_H + 1e-9; h += 0.02) {
          const qx = lx + ux * h, qy = ly + uy * h;
          if (Terrain.collideCircle(T, qx - ux * FOOT_OFF, qy - uy * FOOT_OFF, FOOT_R)) continue;
          if (Terrain.collideCircle(T, qx + ux * HEAD_OFF, qy + uy * HEAD_OFF, HEAD_R)) break;
          lx = qx; ly = qy; stepped = true;
          m.stepT = Math.min(0.4, 0.45 / Math.max(0.5, Math.abs(rvx * uy - rvy * ux)));   // float over the lip before snapping down again
          const vr = rvx * ux + rvy * uy; if (vr > 0) { rvx -= ux * vr; rvy -= uy * vr; }   // a climb, not a launch
          break;
        }
      }
    }
    for (let it = 0; it < 2; it++) {
      const fh = Terrain.collideCircle(T, lx - ux * FOOT_OFF, ly - uy * FOOT_OFF, FOOT_R);
      if (fh) { push(fh); if (fh.nx * ux + fh.ny * uy > UPRIGHT) ground = fh; }
      const hh = Terrain.collideCircle(T, lx + ux * HEAD_OFF, ly + uy * HEAD_OFF, HEAD_R);
      if (hh) push(hh);
      if (!fh && !hh) break;
    }

    // -------- feet step up onto a ledge instead of being catapulted off it --------
    let vr = rvx * ux + rvy * uy;
    const vrCap = Math.max(0, vr0) + STEP_V;
    if (walking && vr > vrCap) { rvx -= ux * (vr - vrCap); rvy -= uy * (vr - vrCap); vr = vrCap; }

    // -------- ground follow: walking over a crest should not launch you --------
    if (!ground && walking && m.stepT > 0) ground = { nx: ux, ny: uy };   // just climbed a ledge: carry on over its lip
    if (!ground && walking && m.jetLock <= 0 && vr < 1.5) {
      const pr = Terrain.collideCircle(T, lx - ux * (FOOT_OFF + SNAP), ly - uy * (FOOT_OFF + SNAP), FOOT_R);
      if (pr && pr.nx * ux + pr.ny * uy > 0.2) {                       // any floor-ish contact below: grid corners tilt a lot on tiny moons
        const dn = Math.max(0, SNAP - pr.depth + 0.005);
        lx -= ux * dn; ly -= uy * dn;
        if (vr > 0) { rvx -= ux * vr; rvy -= uy * vr; }
        ground = pr;
      }
    }

    if (!ground && stepped) ground = { nx: ux, ny: uy };
    if (ground && !m.grounded) { landed(g, m, impact, s); m.leapt = false; m.space = false; }
    m.grounded = !!ground;
    if (ground) {
      const wasG = m.airT === 0, gx = wasG ? m.gn[0] * 0.7 + ground.nx * 0.3 : ground.nx, gy = wasG ? m.gn[1] * 0.7 + ground.ny * 0.3 : ground.ny;
      const gn = Math.hypot(gx, gy) || 1;
      m.gn = [gx / gn, gy / gn]; m.airT = 0;
    } else m.airT += dt;
    A.x = s[0] + lx; A.y = s[1] + ly; A.vx = s[2] + rvx; A.vy = s[3] + rvy;
    const dd = Math.hypot(lx, ly) || 1e-9;
    A.ang = Math.atan2(ly / dd, lx / dd);
    if (m.grounded) {
      const vt = rvx * (ly / dd) - rvy * (lx / dd);                      // along screen-right
      m.phase += vt * m.face * dt * 5.5;
    }
  }

  function landed(g, m, impact, s) {
    const A = g.astro, mech = tier(g) >= 4;
    if (impact > 1.6) Game.burst(g, 'dust', A.x - Math.cos(A.ang) * STAND, A.y - Math.sin(A.ang) * STAND, Math.min(10, 2 + impact * 1.5),
                                 { vx: s[2], vy: s[3], speed: 0.6 + impact * 0.25, col: '#cfc6e6', size: 0.2, life: 0.6 });
    const safe = g.S.fallSafe ?? FALL_HURT;
    if (impact > safe) {
      Game.hurtAstro(g, (impact - safe) * FALL_DMG, mech ? 'CLANK!' : 'THUD!');
      Game.log(g, `hard landing at ${impact.toFixed(1)} m/s`);
    } else if (impact > 4 && g.real - m.landT > 1) { m.landT = g.real; Game.popup(g, mech ? 'CLANK!' : 'THUMP!', '#ffe2b0', A.x, A.y, 18); }
  }

  // -------- rubble: an obstacle (rail rocks ride their rails; free rocks take an honest push) --------

  function bumpRocks(g, m) {
    for (const rk of m.rocks) {
      if (rk.gone) continue;
      const [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t);
      bounce(g, rx, ry, rvx, rvy, rk.r * 0.9 + g.astro.r, null);
    }
    for (const fr of m.free) bounce(g, fr.x, fr.y, fr.vx, fr.vy, fr.r * 0.9 + g.astro.r, fr);
  }
  function bounce(g, rx, ry, rvx, rvy, R, fr) {
    const A = g.astro, dx = A.x - rx, dy = A.y - ry, d = Math.hypot(dx, dy);
    if (!(d < R) || d < 1e-9) return;
    const nx = dx / d, ny = dy / d, vn = (A.vx - rvx) * nx + (A.vy - rvy) * ny;
    A.x = rx + nx * R; A.y = ry + ny * R;
    if (vn >= 0) return;
    const mA = astroMass(g), wR = fr && fr.m > 0 ? 1 / (fr.m * 1000) : 0, J = -(1 + ROCK_REST) * vn / (1 / mA + wR);
    A.vx += J / mA * nx; A.vy += J / mA * ny;
    if (fr) { fr.vx -= J * wR * nx; fr.vy -= J * wR * ny; }
    if (-vn > ROCK_HURT) Game.hurtAstro(g, Math.min(ROCK_DMG_MAX, ROCK_DMG * -vn), 'BONK!');
  }

  // -------- your own hull: a soft bump, momentum shared with a coasting ship --------

  function bumpHull(g, m) {
    if (g.status === 'dead') return;
    const A = g.astro, sh = g.sh, R = g.S.radius + 0.5, dx = A.x - sh.x, dy = A.y - sh.y, d = Math.hypot(dx, dy);
    if (d >= R || d < 1e-9) return;
    const nx = dx / d, ny = dy / d, mA = astroMass(g), wS = g.status === 'flying' ? 1 / (Physics.mass(sh, g.S) * 1000) : 0;
    A.x = sh.x + nx * R; A.y = sh.y + ny * R;
    const vn = (A.vx - sh.vx) * nx + (A.vy - sh.vy) * ny;
    if (vn >= 0) return;
    const J = -(1 + HULL_REST) * vn / (1 / mA + wS);
    A.vx += J / mA * nx; A.vy += J / mA * ny; sh.vx -= J * wS * nx; sh.vy -= J * wS * ny;
  }

  // -------- the tether: free-spooling up to S.tetherLen, then inextensible (pull only); Q winches it shorter.
  //  Equal and opposite impulses and a mass-weighted position fix keep momentum and the centre of mass exact.
  //  A landed or docked ship is held fast: it takes no impulse. --------

  function tetherSolve(g, m, dt) {
    if (g.status === 'dead') return;
    const A = g.astro, sh = g.sh, S = g.S, reelA = S.reelA ?? 1.0, reel = m.ctl.reel, minL = S.radius + REEL_MIN;
    const dx = A.x - sh.x, dy = A.y - sh.y, d = Math.hypot(dx, dy) || 1e-9, nx = dx / d, ny = dy / d;
    m.tLen = reel ? Math.max(minL, Math.min(m.tLen, d) - reelA * dt) : S.tetherLen ?? 30;
    m.J = 0;
    const wA = 1 / astroMass(g), wS = g.status === 'flying' ? 1 / (Physics.mass(sh, S) * 1000) : 0, w = wA + wS;
    if (reel && d < minL + 0.05) {                                     // reeled home: grab the handrail (no slamming into the hull)
      const rvx = A.vx - sh.vx, rvy = A.vy - sh.vy;
      A.vx -= rvx * wA / w; A.vy -= rvy * wA / w; sh.vx += rvx * wS / w; sh.vy += rvy * wS / w;
      return;
    }
    if (d < m.tLen) return;
    const vSep = (A.vx - sh.vx) * nx + (A.vy - sh.vy) * ny, vT = reel && m.tLen > minL + 1e-9 ? -reelA : 0;   // the winch stops at the hull
    if (vSep > vT) {
      const J = (reel ? vSep - vT : (1 + TETHER_REST) * vSep) / w;
      A.vx -= J * wA * nx; A.vy -= J * wA * ny; sh.vx += J * wS * nx; sh.vy += J * wS * ny;
      m.J = J;
    }
    const over = d - m.tLen;
    A.x -= over * wA / w * nx; A.y -= over * wA / w * ny; sh.x += over * wS / w * nx; sh.y += over * wS / w * ny;
  }


  // ======================================================================
  //  SUIT GEAR: dive roll, bombs
  // ======================================================================

  function roll(g, m) {
    const S = g.S, A = g.astro;
    if (!((S.roll ?? 0) >= 1)) { tip(g, m, 'noroll', 'NO DIVE ROLL YET: TUMBLE PADS ARE IN THE SUIT TAB'); return false; }
    if (g.t < m.rollReady || rollingNow(g, m)) return false;
    const side = m.ctl.walk || m.face || 1;
    m.roll = { t0: g.t, T: S.rollT ?? 0.45, side, air: !m.grounded };
    A.invUntil = g.t + (S.rollIframes ?? 0);
    m.rollReady = g.t + (S.rollCd ?? 1.2);
    m.face = side; m.stats.rolls++;
    const dash = !m.grounded && (S.rollAir ?? 0) > 0 ? airDash(g, m, S.rollAir) : 0;
    Game.popup(g, m.grounded ? 'TUCK!' : dash ? 'WHOOSH!' : 'TUMBLE!', '#ffe2b0', A.x, A.y + 0.9, 16);
    return true;
  }

  // roll2 in the air or in space: a burst along the input, paid from the jetpack (dv / S.jet seconds of burn)
  function airDash(g, m, dv) {
    const A = g.astro, c = m.ctl, f = Math.hypot(c.jx, c.jy);
    let dx, dy;
    if (m.space) [dx, dy] = f ? [c.jx / f, c.jy / f] : [m.roll.side, 0];
    else { const ux = Math.cos(A.ang), uy = Math.sin(A.ang); dx = uy * m.roll.side; dy = -ux * m.roll.side; }
    const cost = dv / g.S.jet, k = Math.min(1, m.jet / cost);
    if (!(k > 0)) return 0;
    m.jet = Math.max(0, m.jet - k * cost); A.vx += dx * dv * k; A.vy += dy * dv * k;
    return dv * k;
  }

  function noBombs(g, m) { tip(g, m, 'nobomb', 'NO SUIT BOMBS YET: POP ROCKS ARE IN THE SUIT TAB'); }

  function refillBombs(g, m, simDt) {
    const cap = g.S.bombs ?? 0;
    if (cap !== m.bombsCap) { m.bombsN = Math.max(0, Math.min(cap, m.bombsN + Math.max(0, cap - m.bombsCap))); m.bombsCap = cap; }
    if (m.bombsN >= cap) { m.bombT = 0; return; }
    m.bombT += simDt;                                                    // one charge at a time
    const cd = g.S.bombCd ?? 8;
    if (m.bombT >= cd) { m.bombT -= cd; m.bombsN++; if (m.bombsN >= cap) m.bombT = 0; }
  }
  const bombTier = (S) => Math.max(1, Math.min(3, (S.bombs ?? 2) - 1));

  // throw speed: S.bombV, but near a body never above 0.9 x local escape (nobody orbits a bomb by accident)
  function throwSpeed(g, x, y) {
    const v = g.S.bombV ?? 6, nb = Game.nearestBody(g, x, y), b = nb.b;
    return b.star || nb.d > reach(b) ? v : Math.min(v, BOMB_ESC * Math.sqrt(2 * b.mu / nb.d));
  }

  // from the hand toward the cursor (or up and forward with no mouse)
  function throwRay(g, m) {
    const A = g.astro, [ux, uy] = upOf(g), aim = aimWorld(g, m);
    let dx = uy * m.face * 0.7 + ux * 0.7, dy = -ux * m.face * 0.7 + uy * 0.7;
    if (aim && Math.hypot(aim[0] - A.x, aim[1] - A.y) > 0.3) { dx = aim[0] - A.x; dy = aim[1] - A.y; }
    const n = Math.hypot(dx, dy); dx /= n; dy /= n;
    let ox = A.x + ux * 0.2 + dx * 0.35, oy = A.y + uy * 0.2 + dy * 0.35;
    const nb = Game.nearestBody(g, ox, oy);
    if (!nb.b.star && nb.alt < 1 && Terrain.collideCircle(Terrain.of(nb.b), nb.lx, nb.ly, BOMB_R)) { ox = A.x; oy = A.y; }
    return [ox, oy, dx, dy];
  }

  function throwBomb(g, m) {
    const S = g.S, A = g.astro;
    if (!((S.bombs ?? 0) > 0)) { noBombs(g, m); return null; }
    if (m.bombsN < 1) { Game.popup(g, 'RECHARGING...', '#ff9fb2', A.x, A.y + 1, 15); return null; }
    const [ox, oy, dx, dy] = throwRay(g, m), u = throwSpeed(g, ox, oy), kg = S.bombKg ?? 0.5, mA = astroMass(g), tr = bombTier(S);
    const bm = { x: ox, y: oy, vx: A.vx + dx * u, vy: A.vy + dy * u, u, fuse: S.bombFuse ?? 1.8, fuse0: S.bombFuse ?? 1.8, tier: tr,
                 R: S.bombR ?? 0, dig: S.bombDig ?? 0, dmg: S.bombDmg ?? 0, E: S.bombE ?? 0, sticky: (S.bombSticky ?? 0) > 0,
                 stuck: null, spin: 0, w: (Math.random() < 0.5 ? -1 : 1) * (6 + 6 * Math.random()) };
    A.vx -= dx * u * kg / mA; A.vy -= dy * u * kg / mA;                // recoil: -m_b v / m_A
    m.live.push(bm); m.bombsN--; m.stats.bombs++;
    m.throwT = g.real;
    Game.log(g, `${['', 'Pop Rock', 'Boom Berry', 'Thunder Puck'][tr]} thrown at ${u.toFixed(2)} m/s (recoil ${(u * kg / mA).toFixed(3)} m/s), ${m.bombsN} left`);
    return bm;
  }

  function flyBombs(g, m, dt) {
    for (const bm of m.live) {
      bm.fuse -= dt;
      if (bm.stuck) ride(g, bm); else moveBomb(g, m, bm, dt);
    }
    if (!m.live.some((bm) => bm.fuse <= 0)) return;
    const done = m.live.filter((bm) => bm.fuse <= 0);
    m.live = m.live.filter((bm) => bm.fuse > 0);
    for (const bm of done) explode(g, m, bm);
  }

  function moveBomb(g, m, bm, dt) {
    const [gx, gy] = World.gravity(g.w, bm.x, bm.y, g.t - dt);
    bm.vx += gx * dt; bm.vy += gy * dt; bm.x += bm.vx * dt; bm.y += bm.vy * dt; bm.spin += bm.w * dt;
    const nb = Game.nearestBody(g, bm.x, bm.y);
    if (nb.alt < 1 && !nb.b.star) {
      const hit = Terrain.collideCircle(Terrain.of(nb.b), nb.lx, nb.ly, BOMB_R);
      if (hit) {
        bm.x += hit.nx * hit.depth; bm.y += hit.ny * hit.depth;
        if (bm.sticky) return stick(bm, { b: nb.b.id, lx: bm.x - nb.bx, ly: bm.y - nb.by, nx: hit.nx, ny: hit.ny });
        const rvx = bm.vx - nb.bvx, rvy = bm.vy - nb.bvy, vn = rvx * hit.nx + rvy * hit.ny;
        if (vn < 0) {
          const tx = rvx - vn * hit.nx, ty = rvy - vn * hit.ny, k = 1 - BOMB_FRIC;
          bm.vx = nb.bvx + tx * k - vn * BOMB_REST * hit.nx; bm.vy = nb.bvy + ty * k - vn * BOMB_REST * hit.ny; bm.w *= k;
          if (Math.hypot(bm.vx - nb.bvx, bm.vy - nb.bvy) < 0.25) stick(bm, { b: nb.b.id, lx: bm.x - nb.bx, ly: bm.y - nb.by, nx: hit.nx, ny: hit.ny, rest: true });
        }
      }
    }
    for (const rk of m.rocks) {
      if (rk.gone) continue;
      const [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t);
      if (hitRock(bm, rx, ry, rvx, rvy, rk.r * 0.9 + BOMB_R) && bm.sticky) return stick(bm, { rk: rk.id, ox: bm.x - rx, oy: bm.y - ry, nx: (bm.x - rx) / rk.r, ny: (bm.y - ry) / rk.r });
    }
    for (const fr of m.free) {
      if (hitRock(bm, fr.x, fr.y, fr.vx, fr.vy, fr.r * 0.9 + BOMB_R) && bm.sticky) return stick(bm, { free: fr.id, ox: bm.x - fr.x, oy: bm.y - fr.y, nx: (bm.x - fr.x) / fr.r, ny: (bm.y - fr.y) / fr.r });
    }
    return null;
  }
  function hitRock(bm, rx, ry, rvx, rvy, R) {
    const dx = bm.x - rx, dy = bm.y - ry, d = Math.hypot(dx, dy);
    if (!(d < R) || d < 1e-9) return false;
    const nx = dx / d, ny = dy / d, vn = (bm.vx - rvx) * nx + (bm.vy - rvy) * ny;
    bm.x = rx + nx * R; bm.y = ry + ny * R;
    if (vn < 0) { bm.vx -= (1 + BOMB_REST) * vn * nx; bm.vy -= (1 + BOMB_REST) * vn * ny; }
    return true;
  }
  function stick(bm, at) { bm.stuck = at; bm.w = 0; if (!at.rest) bm.spin = Math.atan2(at.ny, at.nx) - Math.PI / 2; }

  // a stuck (or resting) bomb rides along with what it sits on
  function ride(g, bm) {
    const at = bm.stuck;
    let p = null;
    if (at.b && g.w.byId[at.b]) { const s = World.bodyState(g.w, g.w.byId[at.b], g.t); p = [s[0] + at.lx, s[1] + at.ly, s[2], s[3]]; }
    else if (at.rk != null) { const rk = g.w.rocks[at.rk]; if (rk && !rk.gone) { const s = World.rockState(g.w, rk, g.t); p = [s[0] + at.ox, s[1] + at.oy, s[2], s[3]]; } }
    else if (at.free != null) { const H = haul(), all = H && H.free ? H.free(g) : null, fr = Array.isArray(all) ? all.find((q) => q && q.id === at.free) : null; if (fr) p = [fr.x + at.ox, fr.y + at.oy, fr.vx, fr.vy]; }
    if (!p) { bm.stuck = null; return; }                                // its rock got cracked or towed off: fly on
    [bm.x, bm.y, bm.vx, bm.vy] = p;
  }

  function explode(g, m, bm) {
    const A = g.astro, S = g.S, word = BOOM_WORD[bm.tier - 1] || 'BOOM!';
    if (bm.R > 0 && bm.dmg > 0) Game.dealDamage(g, { x: bm.x, y: bm.y, r: bm.R, dmg: bm.dmg, kind: 'blast', team: 'player', falloff: true });
    if (A.on) { const d = Math.hypot(A.x - bm.x, A.y - bm.y), reachA = bm.R + A.r; if (d < reachA) Game.hurtAstro(g, SELF_DMG * bm.dmg * (1 - 0.5 * d / reachA), 'OUCH!'); }
    if (g.status !== 'dead') { const d = Math.hypot(g.sh.x - bm.x, g.sh.y - bm.y) - S.radius; if (d < bm.R) Game.hurtShip(g, SHIP_DMG * bm.dmg * (1 - 0.5 * Math.max(0, d) / bm.R), 'BONK!'); }
    const nb = Game.nearestBody(g, bm.x, bm.y);
    let cells = 0;
    if (!nb.b.star && bm.dig > 0 && nb.alt < bm.dig) {
      const r = Game.dig(g, nb.b, bm.x, bm.y, bm.dig, BOMB_POWER, { collect: true, toward: A.on ? [A.x, A.y] : [g.sh.x, g.sh.y] });
      cells = (r && r.cells) || 0; m.bombCells += cells;
      if (r && r.fixed) Game.popup(g, 'CLINK!', '#c9c4e8', bm.x, bm.y + 1, 18);
    }
    const H = haul(), crack = H && H.blast ? H.blast(g, bm.x, bm.y, bm.E) : null;
    Game.burst(g, 'flash', bm.x, bm.y, 2, { vx: bm.vx, vy: bm.vy, size: Math.max(1, bm.R * 1.6), life: 0.45, speed: 0, col: '#fff3a0' });
    Game.burst(g, 'boom', bm.x, bm.y, Math.round(10 + bm.R * 8), { vx: nb.bvx, vy: nb.bvy, speed: 1 + bm.R * 2.5, life: 0.6 });
    Game.burst(g, 'dust', bm.x, bm.y, Math.round(6 + bm.R * 4), { vx: nb.bvx, vy: nb.bvy, speed: 1 + bm.R * 2, col: nb.b.color ? nb.b.color[0] : '#cfc6e6', size: 0.4, life: 1 });
    Game.popup(g, word, bm.tier >= 3 ? '#ffd166' : bm.tier === 2 ? '#c9b8ff' : '#ff9fd0', bm.x, bm.y + 0.6, 22 + 6 * bm.tier);
    const near = A.on ? Math.hypot(A.x - bm.x, A.y - bm.y) : Math.hypot(g.sh.x - bm.x, g.sh.y - bm.y);
    g.shake = Math.max(g.shake, Math.min(1, (0.25 + 0.15 * bm.tier) * Math.max(0, 1 - near / 40)));
    const ride = nb.alt < 60 && !nb.b.star ? { b: nb.b.id, lx: bm.x - nb.bx, ly: bm.y - nb.by } : null;
    m.booms.push({ x: bm.x, y: bm.y, ride, t0: g.real, R: Math.max(0.8, bm.R), tier: bm.tier, seed: Math.random() * 6 });
    if (m.booms.length > 8) m.booms.shift();
    Game.log(g, `${word} near ${nb.b.name}${cells ? `: ${cells} cells dug` : ''}${crack && crack.cracked ? ', rock cracked' : ''}`);
  }

  // dotted arc for the length of the fuse, in the nearby body's frame (or riding along with you in open space)
  function arcPreview(g, m) {
    const A = g.astro, S = g.S, [ox, oy, dx, dy] = throwRay(g, m), u = throwSpeed(g, ox, oy), T = S.bombFuse ?? 1.8;
    const nb0 = Game.nearestBody(g, A.x, A.y), body = !nb0.b.star && nb0.d < reach(nb0.b) * 1.5 ? nb0.b : null;
    const pts = [];
    let x = ox, y = oy, vx = A.vx + dx * u, vy = A.vy + dy * u, hit = false;
    for (let t = 0; t <= T + 1e-9; t += ARC_DT) {
      const tt = g.t + t, [fx, fy] = body ? World.bodyState(g.w, body, tt) : [A.x + A.vx * t, A.y + A.vy * t];
      pts.push([x - fx, y - fy]);
      if (hit) break;
      const [gx, gy] = World.gravity(g.w, x, y, tt);
      vx += gx * ARC_DT; vy += gy * ARC_DT; x += vx * ARC_DT; y += vy * ARC_DT;
      const nb = Game.nearestBody(g, x, y, tt + ARC_DT);
      if (nb.alt < 1 && !nb.b.star && Terrain.collideCircle(Terrain.of(nb.b), nb.lx, nb.ly, BOMB_R)) hit = true;
    }
    return { pts, body: body ? body.id : null, hit, u };
  }


  // ======================================================================
  //  PER FRAME (after physics): laser, pack bookkeeping, air, scanner, tether, camera
  // ======================================================================

  function after(g, inp, dt, simDt) {
    const A = g.astro, m = st(g);
    if (!isOut(g)) {
      steerChunks(g, simDt);
      if (g.status !== 'dead' && A.hp < A.hpMax && simDt) A.hp = Math.min(A.hpMax, A.hp + HEAL_RATE * simDt);
      if (g.status === 'landed' && g.S.scanner) scanTick(g, m, dt);
      tidyPings(g, m);
      return;
    }
    if (![A.x, A.y, A.vx, A.vy].every(Number.isFinite)) { recall(g, 'glitch'); return; }
    fireLaser(g, m, simDt);
    steerChunks(g, simDt);
    countPack(g, m);
    breathe(g, m, simDt);
    if (A.hp <= 0) { recall(g, 'suit', true); return; }
    scanTick(g, m, dt);
    if (m.teth) spaceTick(g, m, simDt); else tether(g, m, simDt);
    if (!isOut(g)) return;
    jetFx(g, m);
    gearFx(g, m, simDt);
    follow(g, m, dt);
    tidyPings(g, m);
  }

  // -------- laser: raycast from the gun toward the cursor; dig terrain, chip rocks, zap targets --------

  function gunRay(g, m) {
    const A = g.astro, [ux, uy] = upOf(g), R = RIG[tier(g)], px = A.x + ux * (R.arm - STAND), py = A.y + uy * (R.arm - STAND);
    const aim = aimWorld(g, m);
    let dx, dy, dn = aim ? Math.hypot(aim[0] - px, aim[1] - py) : 0;
    if (aim && dn > 0.35) { dx = (aim[0] - px) / dn; dy = (aim[1] - py) / dn; }
    else { dx = uy * m.face * 0.7 - ux * 0.7; dy = -ux * m.face * 0.7 - uy * 0.7; dn = Math.hypot(dx, dy); dx /= dn; dy /= dn; }
    return [px + dx * R.gun, py + dy * R.gun, dx, dy];
  }

  function fireLaser(g, m, simDt) {
    const S = g.S, A = g.astro;
    const [ox, oy, dx, dy] = gunRay(g, m);
    m.aimDir = [dx, dy];
    hoverInfo(g, m, ox, oy);
    m.beam = null;
    const aim = aimWorld(g, m), len = aim ? Math.min(S.laserRange, Math.hypot(aim[0] - ox, aim[1] - oy) + BEAM_PAST) : S.laserRange;
    const H = haul(), rock = H && H.rayRocks ? H.rayRocks(g, ox, oy, ox + dx * len, oy + dy * len) : null;
    m.hoverRock = rock;
    if (!m.firing) { m.digAcc = 0; m.hitAcc = 0; m.digNearShip = Math.max(0, m.digNearShip - simDt); return; }
    const hit = Game.raycast(g, ox, oy, dx, dy, len, { team: 'player' });
    if (rock && rock.rock && (!hit || rock.d < hit.t)) { chipRock(g, m, rock, simDt, ox, oy, dx, dy); return; }
    const end = hit ? [hit.x, hit.y] : [ox + dx * len, oy + dy * len];
    const mat = hit && hit.body ? Terrain.MATS[hit.mat] : null;
    m.beam = { x0: ox, y0: oy, x1: end[0], y1: end[1], hit: hit ? (hit.target ? 'target' : 'terrain') : null,
               col: mat ? matCol(mat, hit.body)[0] : hit ? '#ff9fb2' : null };
    if (!simDt || !hit) return;
    const bv = hit.body ? World.bodyState(g.w, hit.body, g.t) : [0, 0, A.vx, A.vy];
    if (hit.target) zapTarget(g, m, hit, simDt, bv, ox, oy, dx, dy);
    else digTerrain(g, m, hit, mat, simDt, bv, dx, dy);
  }

  function zapTarget(g, m, hit, simDt, bv, ox, oy, dx, dy) {
    m.hitAcc += simDt;
    for (let n = 0; m.hitAcc >= HIT_TICK - 1e-9 && n < 8; n++) {
      m.hitAcc -= HIT_TICK;
      hit.target.hit(g, g.S.laserDps * HIT_TICK, 'laser', { team: 'player', kind: 'laser', x: ox, y: oy, from: 'astro' });
    }
    sparks(g, m, hit.x, hit.y, simDt, bv[2], bv[3], dx, dy, '#ffb3c6');
  }

  function digTerrain(g, m, hit, mat, simDt, bv, dx, dy) {
    const A = g.astro, S = g.S, col = matCol(mat, hit.body);
    m.digAcc += simDt;
    let broke = 0, fixed = 0;
    for (let n = 0; m.digAcc >= DIG_TICK - 1e-9 && n < 8; n++) {
      m.digAcc -= DIG_TICK;
      const x = hit.x + dx * 0.2, y = hit.y + dy * 0.2;
      const r = Game.dig(g, hit.body, x, y, DIG_R, S.laserPower * DIG_TICK, { collect: true, toward: [A.x, A.y] });
      if (r.cells) tagChunks(g, hit.body, x, y, m.beam.x0, m.beam.y0);
      broke += r.cells; fixed += r.fixed || 0;
    }
    sparks(g, m, hit.x, hit.y, simDt, bv[2], bv[3], dx, dy, col[2]);
    g.shake = Math.max(g.shake, 0.3);
    if (fixed && !broke && g.real - m.clinkT > 0.7) { m.clinkT = g.real; Game.popup(g, 'CLINK!', '#c9c4e8', hit.x, hit.y, 18); }   // built stone: the laser just pings off
    if (broke) {
      g.shake = Math.max(g.shake, 0.42);
      Game.burst(g, 'dust', hit.x, hit.y, 3 + Math.min(4, broke), { vx: bv[2], vy: bv[3], speed: 1.6, col: col[0], size: 0.2, life: 0.8 });
      if (g.real - m.wordT > 0.9) {
        m.wordT = g.real;
        const w = BREAK_WORD[mat.id] || BREAK_WORD.regolith;
        Game.popup(g, w[Math.floor(Math.random() * w.length)], col[0], hit.x, hit.y, 20);
      }
    }
    const ship = g.status === 'landed' || g.status === 'flying' ? Math.hypot(hit.x - g.sh.x, hit.y - g.sh.y) : Infinity;
    m.digNearShip = ship < g.S.radius + 2.5 ? 3 : Math.max(0, m.digNearShip - simDt);
  }

  // -------- rubble: haul chips the ore off and throws the chunks at you --------

  function rockInfo(g, rk) {
    const H = haul(), type = H && H.typeOf ? H.typeOf(g, rk) : null, T = type && H.TYPES ? H.TYPES[type] : null;
    const vel = rk.vx != null ? [rk.vx, rk.vy] : rk.host ? World.rockState(g.w, rk, g.t).slice(2, 4) : [0, 0];
    return { type, col: T && T.col ? T.col : ['#cfc6e6', '#8f86b0', '#ffffff'], vel };
  }
  function chipRock(g, m, seg, simDt, ox, oy, dx, dy) {
    const A = g.astro, H = haul(), info = rockInfo(g, seg.rock);
    m.beam = { x0: ox, y0: oy, x1: seg.x, y1: seg.y, hit: 'rock', col: info.col[0] };
    if (!simDt) return;
    const kg = H.chip ? H.chip(g, seg.rock, g.S.laserPower, simDt, [A.x, A.y]) : 0;
    sparks(g, m, seg.x, seg.y, simDt, info.vel[0], info.vel[1], dx, dy, info.col[2]);
    g.shake = Math.max(g.shake, 0.3);
    if (kg > 0 && g.real - m.wordT > 0.9) { m.wordT = g.real; Game.popup(g, Math.random() < 0.5 ? 'CHIP!' : 'KRAK!', info.col[0], seg.x, seg.y, 20); }
  }

  // -------- chunks freed by the beam glide home along it: to the bite, then back up the beam to the gun.
  //  Terrain only ever gets dug, so that path stays open; they ride it kinematically, pinned each
  //  frame through the core's p.rest, then the core's magnet takes over at the gun. --------

  function tagChunks(g, b, x, y, ox, oy) {
    const [bx, by] = World.bodyState(g.w, b, g.t), P = g.pickups;
    for (let i = P.length - 1; i >= 0 && i >= P.length - 16; i--) {
      const p = P[i];
      if (p.age > 0 || p.evaHome || Math.hypot(p.x - x, p.y - y) > DIG_R + 1.2) continue;
      p.evaHome = { b: b.id, path: [[x - bx, y - by], [ox - bx, oy - by]] };
    }
  }
  function steerChunks(g, simDt) {
    const A = g.astro, out = isOut(g);
    for (const p of g.pickups) {
      const h = p.evaHome;
      if (!h) continue;
      const b = g.w.byId[h.b];
      if (!out || !b || p.age > 5 || p.qty <= 0 || !h.path || !h.path.length) { p.evaHome = null; p.rest = null; continue; }
      const [bx, by, bvx, bvy] = World.bodyState(g.w, b, g.t);
      let lx = p.x - bx, ly = p.y - by, left = CHUNK_V * simDt;
      while (h.path.length && left > 0) {
        const [wx, wy] = h.path[0], dx = wx - lx, dy = wy - ly, d = Math.hypot(dx, dy);
        if (d <= left) { lx = wx; ly = wy; left -= d; h.path.shift(); } else { lx += dx / d * left; ly += dy / d * left; left = 0; }
      }
      p.x = bx + lx; p.y = by + ly; p.vx = bvx; p.vy = bvy;
      if (h.path.length) p.rest = { b, lx, ly };
      else { p.evaHome = null; p.rest = null; p.vx = A.vx; p.vy = A.vy; }
    }
  }

  function sparks(g, m, x, y, simDt, vx, vy, dx, dy, col) {
    m.fxT += simDt;
    if (m.fxT < 0.04) return;
    m.fxT = 0;
    Game.burst(g, 'spark', x, y, 2, { vx, vy, speed: 5, dir: Math.atan2(-dy, -dx), spread: 2.2, col, life: 0.3 });
    if (Math.random() < 0.35) Game.burst(g, 'dust', x, y, 1, { vx, vy, speed: 1, col, size: 0.15, life: 0.7 });
  }

  // material under the cursor (for the tag and the hint)
  function hoverInfo(g, m, ox, oy) {
    m.hover = null;
    const aim = aimWorld(g, m);
    if (!aim) return;
    const nb = Game.nearestBody(g, aim[0], aim[1]);
    if (nb.alt > 3 || nb.b.star) return;
    const id = Terrain.mat(Terrain.of(nb.b), nb.lx, nb.ly);
    if (id < Terrain.REG) return;
    m.hover = { mat: Terrain.MATS[id], b: nb.b, inRange: Math.hypot(aim[0] - ox, aim[1] - oy) <= g.S.laserRange };
  }

  function matCol(mat, b) { return mat && mat.col ? mat.col : b ? [b.color[0], b.color[1], b.color[2]] : ['#cfc6e6', '#8f86b0', '#ffffff']; }

  // -------- pack bookkeeping: ore hauled (job), gems found --------

  function countPack(g, m) {
    for (const [item, q] of Object.entries(g.pack)) {
      const dq = q - (m.prevPack[item] || 0), it = ITEMS[item];
      if (dq <= 0 || !it) continue;
      if (it.kind === 'ore') m.hauled += dq * it.kg;
      if (it.kind === 'gem') {
        m.gems += dq; m.gemT = g.real;
        Game.toast(g, `${it.name.toUpperCase()} IN THE BAG!`, it.col);
        Game.log(g, `picked up ${dq} ${item}`);
      }
    }
    m.prevPack = { ...g.pack };
  }

  // -------- air and suit (Downtown's pressurised halls top the tank up, when mochi is on) --------

  function breathe(g, m, simDt) {
    if (!simDt) return;
    const A = g.astro;
    if (typeof Mochi !== 'undefined' && Mochi && Mochi.airAt && Mochi.airAt(g, A.x, A.y)) m.o2 = Math.min(g.S.o2, m.o2 + 10 * simDt);
    m.o2 = Math.max(0, m.o2 - simDt * (m.sprinting ? SPRINT_O2 : 1));
    if (m.o2 < O2_WARN && !m.warnO2) { m.warnO2 = true; Game.toast(g, `AIR LOW: ${Math.ceil(m.o2)} S LEFT. HEAD BACK!`, '#ff9f1c', 'evaO2'); }
    if (m.o2 <= 0) {
      A.hp -= SUFFOCATE * simDt;
      if (g.real - m.gaspT > 1.5) { m.gaspT = g.real; Game.popup(g, 'GASP!', '#ff9fb2', A.x, A.y, 20); }
      if (m.teth && !m.autoReel && g.status !== 'dead') { m.autoReel = true; Game.toast(g, 'O2 OUT: AUTO-REEL', '#ff5d5d', 'evaO2'); Game.log(g, 'air out on a spacewalk: auto-reel'); }
    }
  }

  // -------- gem scanner: buried gems in reach become seen (the core draws their sparkle) --------

  function scanTick(g, m, dt) {
    m.scanT -= dt;
    if (m.scanT > 0) return;
    m.scanT = 0.2;
    const lvl = Math.max(0, Math.min(2, Math.floor(g.S.scanner || 0))), out = isOut(g);
    const at = out ? g.astro : g.sh, b = out ? Game.nearestBody(g, at.x, at.y).b : g.landedOn;
    if (!b || !b.ter) return;
    const R = out ? SCAN_R[lvl] : lvl ? SCAN_R[lvl] : 0, [bx, by] = World.bodyState(g.w, b, g.t);
    let n = 0;
    for (const gm of b.ter.gems) {
      if (gm.state !== 'buried' || gm.seen || Math.hypot(bx + gm.lx - at.x, by + gm.ly - at.y) > R) continue;
      gm.seen = true; n++;
      m.pings.push({ b: b.id, lx: gm.lx, ly: gm.ly, type: gm.type, t0: g.real });
    }
    if (!n) return;
    Game.popup(g, n > 1 ? `PING ×${n}!` : 'PING!', '#7cf5d6', at.x, at.y, 20);
    Game.log(g, `scanner: ${n} buried gem${n > 1 ? 's' : ''} spotted on ${b.name}`);
  }
  function tidyPings(g, m) { if (m.pings.length) m.pings = m.pings.filter((p) => g.real - p.t0 < 1.6).slice(-40); }

  // -------- untethered (landed) EVA: too far from the ship or drifting off the rock -> warning, then recall --------

  function tether(g, m, simDt) {
    if (!simDt) return;
    const A = g.astro, nb = Game.nearestBody(g, A.x, A.y), b = nb.b;
    const rvx = A.vx - nb.bvx, rvy = A.vy - nb.bvy, E = 0.5 * (rvx * rvx + rvy * rvy) - b.mu / nb.d;
    const far = g.status !== 'dead' && hullDist(g) + g.S.radius > FAR_MAX;
    const adrift = !m.grounded && (nb.d > reach(b) + 8 || E >= 0);
    if (!far && !adrift) { m.lost = 0; return; }
    if (!m.lost) {
      Game.toast(g, far ? 'TETHER LIMIT! TURN BACK' : `DRIFTING OFF ${b.name.toUpperCase()}!`, '#ff9f1c', 'evaTether');
      Game.log(g, far ? `tether warning: ${(hullDist(g) + g.S.radius).toFixed(0)} m from the ship` : `adrift above ${b.name}`);
    }
    m.lost += simDt; m.lostWhy = far ? 'far' : 'adrift';
    if (m.lost >= RECALL_T) recall(g, m.lostWhy);
  }

  // -------- tethered: open-space mode, the job clock, slack line, the parked ship's path --------

  function spaceTick(g, m, simDt) {
    const A = g.astro, nb = Game.nearestBody(g, A.x, A.y);
    if (m.grounded || (nb.alt < SPACE_OUT && !nb.b.star)) m.space = false;
    else if (nb.alt > SPACE_IN || nb.b.star) m.space = true;
    if (m.space) m.sUp += (Math.PI / 2 - m.sUp) * Math.min(1, 3 * simDt);
    else m.sUp = A.ang;
    if (g.status === 'dead') return;
    const d = Math.hypot(A.x - g.sh.x, A.y - g.sh.y);
    m.tethT += simDt;
    m.stats.maxTether = Math.max(m.stats.maxTether, d);
    m.paid = Math.min(m.tLen, Math.max(d, m.paid - SPOOL_V * simDt));
    const p = g.pred, tt = g.status === 'flying' && p && p.impact ? p.impact.t - g.t : Infinity;
    m.crashT = tt;
    if (tt < CRASH_WARN && !m.crashWarn) {
      m.crashWarn = true;
      Game.toast(g, `SHIP ON COLLISION COURSE: ${Math.ceil(tt)} S`, '#ff5d5d', 'evaCrash');
      Game.log(g, `parked ship will hit ${p.impact.body ? p.impact.body.name : 'something'} in ${tt.toFixed(0)} s`);
    } else if (tt > CRASH_WARN + 5) m.crashWarn = false;
  }

  // -------- jet puffs, sprint dust, roll dust ring --------

  function jetFx(g, m) {
    if (!m.thrust || Math.random() > 0.6) return;
    const A = g.astro, [ux, uy] = upOf(g), [ex, ey] = m.thrustDir;
    const nx = A.x - ux * 0.15 - uy * m.face * 0.3, ny = A.y - uy * 0.15 + ux * m.face * 0.3;
    Game.burst(g, 'puff', nx, ny, 1, { vx: A.vx - ex * 4, vy: A.vy - ey * 4, speed: 0.8, life: 0.35 });
    if (m.gov && g.real - m.govT > 2.5) { m.govT = g.real; Game.popup(g, 'GOVERNOR!', '#7cf5d6', A.x, A.y, 16); }
  }

  function gearFx(g, m, simDt) {
    const A = g.astro, [ux, uy] = upOf(g), fx = A.x - ux * STAND, fy = A.y - uy * STAND;
    m.dustT -= simDt;
    if (m.sprinting && m.dustT <= 0) {
      m.dustT = 0.09;
      const nb = Game.nearestBody(g, A.x, A.y), bx = -uy * m.face, by = ux * m.face;   // kicked back and up
      Game.burst(g, 'dust', fx + bx * 0.25, fy + by * 0.25, 2, { vx: nb.bvx, vy: nb.bvy, speed: 0.9, dir: Math.atan2(by + uy * 0.4, bx + ux * 0.4), spread: 0.8, col: '#cfc6e6', size: 0.08, life: 0.35 });
    }
    if (m.roll && !m.roll.dusted && g.t >= m.roll.t0 + m.roll.T) {
      m.roll.dusted = true;
      if (m.grounded) { const nb = Game.nearestBody(g, A.x, A.y); Game.burst(g, 'dust', fx, fy, 10, { vx: nb.bvx, vy: nb.bvy, speed: 2.2, col: '#d8cfee', size: 0.3, life: 0.5 }); }
    }
  }

  // -------- camera: on a rock, smoothed in its frame (rocks move fast; world-space lag would smear);
  //  in open space, unrotated and framing you and the ship --------

  function follow(g, m, dt) {
    const A = g.astro, k = 1 - Math.exp(-dt * 7);
    if (m.space) {
      const live = g.status !== 'dead', tx = live ? (g.sh.x - A.x) / 2 : 0, ty = live ? (g.sh.y - A.y) / 2 : 0;
      if (!m.camOff) m.camOff = m.cam && g.w.byId[m.cam.b] ? (([x, y]) => [x - A.x, y - A.y])(camOnRock(g, m)) : [0, 0];
      const k2 = 1 - Math.exp(-dt * 3);
      m.camOff[0] += (tx - m.camOff[0]) * k2; m.camOff[1] += (ty - m.camOff[1]) * k2;
      m.cam = null;
      return;
    }
    const nb = Game.nearestBody(g, A.x, A.y), [ux, uy] = upOf(g);
    const tx = A.x - nb.bx + ux * 0.4, ty = A.y - nb.by + uy * 0.4;
    if (!m.cam || m.cam.b !== nb.b.id) {
      m.cam = m.camOff ? { b: nb.b.id, lx: A.x + m.camOff[0] - nb.bx, ly: A.y + m.camOff[1] - nb.by } : { b: nb.b.id, lx: tx, ly: ty };
      m.camOff = null;
    }
    m.cam.lx += (tx - m.cam.lx) * k; m.cam.ly += (ty - m.cam.ly) * k;
  }
  function camOnRock(g, m) { const [bx, by] = World.bodyState(g.w, g.w.byId[m.cam.b], g.t); return [bx + m.cam.lx, by + m.cam.ly]; }
  function screenSize() {
    const k = typeof Render !== 'undefined' && Render && Render.kit;
    return k && k.W > 0 && k.H > 0 ? [k.W, k.H] : [800, 800];
  }
  // open space: frame you and the ship (3..32 px/m)
  function spaceZoom(g) {
    const A = g.astro, d = g.status === 'dead' ? 0 : Math.hypot(A.x - g.sh.x, A.y - g.sh.y), [W, H] = screenSize();
    return Math.max(3, Math.min(ZOOM, 0.38 * Math.min(W, H) / Math.max(20, d + 2 * g.S.radius)));
  }

  function camera(g) {
    const m = st(g), A = g.astro;
    if (!isOut(g)) return null;
    if (m.space && m.camOff) return { x: A.x + m.camOff[0], y: A.y + m.camOff[1], zoom: spaceZoom(g), rot: 0, snap: true };
    if (!m.cam || !g.w.byId[m.cam.b]) return null;
    const [x, y] = camOnRock(g, m);
    return { x, y, zoom: ZOOM, rot: A.ang - Math.PI / 2, snap: true };
  }

  const warpLimit = (g) => (isOut(g) ? { max: 1, why: st(g).teth ? 'spacewalk' : 'on foot', reset: true } : null);

  // the ship holds attitude and coasts while you are out on the line
  function shipCtrl(g, ctrl) { if (isTethered(g) && g.status === 'flying') ctrl.kill = true; }


  // ======================================================================
  //  PROMPTS, HINTS, CONTROLS
  // ======================================================================

  function interactions(g) {
    if (canStepOut(g) && g.status !== 'flying') return [{ key: 'KeyE', text: g.status === 'landed' ? 'Step outside' : 'Spacewalk (on a tether)', dist: 0, col: '#8ff0b0', act: stepOut }];   // flying: the controls line says "E spacewalk"
    if (canBoard(g)) return [{ key: 'KeyE', text: `Board ${g.S.name}`, dist: hullDist(g), col: '#8ff0b0', act: board }];
    return null;
  }

  function hint(g) {
    const m = st(g), A = g.astro, S = g.S;
    if (g.ui) return null;
    if (!isOut(g)) {
      if (canStepOut(g) && g.status === 'landed') return { pri: g.done.mine === undefined ? 30 : Game.kgOf(g.cargo) > 0 ? 8 : 12, text: `Press E to step out onto ${g.landedOn.name} and dig with your laser.` };
      return null;
    }
    if (g.status === 'dead' && !m.space) return null;
    const b = Game.nearestBody(g, A.x, A.y).b, packKg = Game.kgOf(g.pack), full = packKg >= S.packCap - 0.5;
    const dShip = hullDist(g) + S.radius, left = Math.max(0, Math.ceil(RECALL_T - m.lost));
    if (m.lost > 0 && m.lostWhy === 'far') return { pri: 85, text: `Tether limit! Walk back toward the ${S.name} or get reeled in (${left} s).` };
    if (m.lost > 0) return { pri: 85, text: `Drifting off ${b.name}! Hold S to jet down, or get reeled in (${left} s).` };
    if (m.o2 <= 0) return { pri: 84, text: m.teth ? 'Out of air! The winch is reeling you in: press E at the hull.' : `Out of air! The suit is losing HP. Get to the ${S.name} and press E!` };
    if (m.teth && m.crashT < CRASH_WARN && g.pred && g.pred.impact) return { pri: 81, text: `Your ${S.name} hits ${g.pred.impact.body ? g.pred.impact.body.name : 'something'} in ${Math.ceil(m.crashT)} s! Hold Q to winch in, E to board and fly it.` };
    if (m.o2 < O2_WARN) return { pri: 75, text: `Air low: ${Math.ceil(m.o2)} s left. Back to the ${S.name}, press E to refill.${m.teth ? ' Q winches you in.' : ''}` };
    if (A.hp < 0.3 * A.hpMax) return { pri: 72, text: 'Suit badly hurt! Board (E) to patch it. At 0 HP you get recalled and drop the pack.' };
    if (!m.teth && dShip > FAR_WARN) return { pri: 70, text: `${dShip.toFixed(0)} m from the ${S.name}. The suit reel pulls you back past ${FAR_MAX} m.` };
    if (full) return { pri: 62, text: `Backpack full (${S.packCap} kg)! ${m.teth ? 'Winch in (Q)' : `Walk back to the ${S.name}`} and press E to unload.` };
    if (m.teth && g.status !== 'dead' && !m.ctl.reel && dShip > m.tLen - 0.5) return { pri: 60, text: `Tether taut at ${m.tLen.toFixed(0)} m. Hold Q to winch back toward the ${S.name}.` };
    if (m.digNearShip > 0) return { pri: 58, text: 'Careful: dig away the ground under the ship and it drops into the hole!' };
    if (m.space && m.jet <= 0.05) return { pri: 56, text: `Jetpack empty. Hold Q to winch back to the ${S.name}.` };
    if (canBoard(g) && packKg > 0) return { pri: 52, text: `Press E to board and unload ${packKg.toFixed(0)} kg (air and jetpack refill too).` };
    if (m.teth && m.ctl.reel) return { pri: 50, text: `Winching in at ${(S.reelA ?? 1).toFixed(1)} m/s... E boards within ${BOARD_R} m of the hull.` };
    if (m.gov) return { pri: 46, text: `Suit governor: thrust cut so you can't fly off ${b.name}. Let go and drift down.` };
    if ((S.bombs ?? 0) > 0 && g.done.bomb === undefined) return { pri: 42, text: 'Bombs! Press B to lob one at the cursor, or hold right-click to see the arc and let go to throw.' };
    if (m.space && m.hoverRock && m.hoverRock.rock) return { pri: 41, text: 'A rock! Hold left click to laser it: the chunks fly into your pack.' };
    if (m.space) return { pri: 40, text: `Spacewalk! WASD jets (${m.jet.toFixed(1)} s of jet left), Q winches you in, E boards at the hull.` };
    if (!m.teth && b.g < 0.6) return { pri: 44, text: `${b.name}: g ${b.g} m/s², escape speed ${Math.sqrt(2 * b.g * b.R).toFixed(1)} m/s. Walk gently; jumps float.` };
    if (m.hover && m.hover.mat.item) {
      const h = m.hover;
      return { pri: 36, text: `That's ${MAT_NAME[h.mat.id]} (${MAT_FEEL[h.mat.id]}). ${h.inRange ? 'Hold left click: chunks fly into your pack.' : `Get closer: laser reach ${S.laserRange} m.`}` };
    }
    return { pri: 25, text: 'Hold left click to dig. Blobs are ore: blue ice, rusty iron, olive nickel, white platinum.' };
  }

  function controls(g) {
    if (!isOut(g)) return null;
    const m = st(g), S = g.S;
    const gear = [(S.sprint ?? 1) > 1 && !m.space ? 'Shift sprint' : '', (S.roll ?? 0) >= 1 ? 'C roll' : '',
                  (S.bombs ?? 0) > 0 ? 'B or hold right-click: bomb' : ''].filter(Boolean);
    const base = m.space ? 'WASD jets · Q winch in · mouse aim · hold click: laser · E board at the hull'
      : `A/D walk · W/Space jump (hold: jetpack) · S jet down · mouse aim · hold click: laser · E board${m.teth ? ' · Q winch' : ''}`;
    return [base, ...gear, 'wheel zoom'].join(' · ');
  }


  // ======================================================================
  //  DRAWING
  // ======================================================================

  // flat base + shadow band away from the light + optional highlight + ink outline
  function toon(ctx, path, [base, shade, hi], L, k, lw, hiAt) {
    path(); ctx.fillStyle = shade; ctx.fill();
    ctx.save(); path(); ctx.clip();
    ctx.translate(L[0] * k, L[1] * k); path(); ctx.fillStyle = base; ctx.fill();
    if (hiAt) { ctx.beginPath(); ctx.ellipse(hiAt[0], hiAt[1], hiAt[2], hiAt[3], hiAt[4] || 0, 0, 2 * Math.PI); ctx.fillStyle = hi; ctx.fill(); }
    ctx.restore();
    path(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const circ = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); };
  function disc(ctx, x, y, r, col, lw) { circ(ctx, x, y, r); ctx.fillStyle = col; ctx.fill(); if (lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); } }
  // a limb: ink underlay, then the colour on top
  function limb(ctx, pts, w, col, lw) {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = INK; ctx.lineWidth = w + lw; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  // two-bone leg: the knee bends forward (+x, the way you face)
  function knee(hx, hy, fx, fy, a, b) {
    const dx = fx - hx, dy = fy - hy, d = Math.min(a + b - 1e-4, Math.max(1e-4, Math.hypot(dx, dy)));
    const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)))), base = Math.atan2(dy, dx) + al;
    return [hx + a * Math.cos(base), hy + a * Math.sin(base)];
  }

  // per suit tier [m above the feet]: hip, how much the torso is lifted, thigh and shin, helmet centre, laser shoulder, gun length, height
  const RIG = [
    { hip: 0.42, lift: 0, th: 0.17, sh: 0.17, head: 1.17, arm: 0.72, gun: 0.6, h: 1.6 },
    { hip: 0.42, lift: 0, th: 0.17, sh: 0.17, head: 1.17, arm: 0.72, gun: 0.6, h: 1.6 },
    { hip: 0.42, lift: 0, th: 0.17, sh: 0.17, head: 1.17, arm: 0.72, gun: 0.6, h: 1.6 },
    { hip: 0.54, lift: 0.12, th: 0.23, sh: 0.23, head: 1.29, arm: 0.84, gun: 0.6, h: 1.72 },
    { hip: 0.80, lift: 0.5, th: 0.35, sh: 0.35, head: 1.68, arm: 1.16, gun: 0.85, h: 2.15 },
  ];

  function drawWorld(g, kit) {
    const m = st(g), ctx = kit.ctx, px = kit.px();
    for (const p of m.pings) {                                          // scanner pings: rings blooming from the gem
      const b = g.w.byId[p.b]; if (!b) continue;
      const [bx, by] = World.bodyState(g.w, b, g.t), age = g.real - p.t0, col = (Terrain.GEM_COL[p.type] || ['#7cf5d6'])[0];
      ctx.globalAlpha = Math.max(0, 1 - age / 1.6);
      ctx.strokeStyle = col; ctx.lineWidth = 3 * px;
      for (const k of [0, 0.35]) {
        const r = Math.max(0, age - k) * 2.6 + 0.4;
        if (age > k) { ctx.beginPath(); ctx.arc(bx + p.lx, by + p.ly, Math.max(r, 6 * px), 0, 2 * Math.PI); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawWorldTop(g, kit) {
    const m = st(g);
    if (isOut(g)) {
      if (m.teth && g.status !== 'dead') drawTether(g, kit, m);
      if (canBoard(g)) drawHatch(g, kit);
      drawAstro(g, kit, m);
      if (m.beam) drawBeam(g, kit, m.beam);
      if (m.arc) drawArc(g, kit, m);
    }
    for (const bm of m.live) drawBomb(g, kit, bm);
    if (m.booms.length) drawBooms(g, kit, m);
  }

  // the cockpit window glows when you can hop back in
  function drawHatch(g, kit) {
    const ctx = kit.ctx, px = kit.px(), sh = g.sh, a = sh.ang;
    const u = Math.max(g.S.length, 34 * px) / 10, hx = sh.x + Math.cos(a) * 0.6 * u, hy = sh.y + Math.sin(a) * 0.6 * u;
    const pulse = 0.5 + 0.5 * Math.sin(g.real * 5), R = 1.45 * u + 0.25 * u * pulse;
    ctx.fillStyle = `rgba(143,240,176,${0.18 + 0.14 * pulse})`;
    ctx.beginPath(); ctx.arc(hx, hy, R, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = '#8ff0b0'; ctx.lineWidth = 3 * px; ctx.setLineDash([5 * px, 4 * px]); ctx.lineDashOffset = -g.real * 12 * px;
    ctx.stroke(); ctx.setLineDash([]);
  }

  // -------- the tether: from the side hatch to your backpack; slack line bows, a taut one is straight --------

  function hatchPos(g, kit) {
    const sh = g.sh, A = g.astro, a = sh.ang, L = Math.max(g.S.length, 34 * kit.px());
    const fx = Math.cos(a), fy = Math.sin(a), rx = Math.sin(a), ry = -Math.cos(a);
    const side = Math.sign((A.x - sh.x) * rx + (A.y - sh.y) * ry) || 1;
    return [sh.x + rx * side * 0.21 * L - fx * 0.05 * L, sh.y + ry * side * 0.21 * L - fy * 0.05 * L];
  }
  const spriteScale = (g, kit) => Math.max(1, (st(g).space ? MIN_PX_SPACE : MIN_PX) * kit.px() / RIG[tier(g)].h);
  // a point in the sprite frame (metres, feet origin, facing +x) -> world
  function spritePt(g, m, kit, x, y) {
    const A = g.astro, s = spriteScale(g, kit), up = upAng(g), f = m.face || 1;
    const ux = Math.cos(up), uy = Math.sin(up), rxv = uy, ryv = -ux, fx = A.x - ux * STAND, fy = A.y - uy * STAND;
    return [fx + (rxv * x * f + ux * y) * s, fy + (ryv * x * f + uy * y) * s];
  }

  function drawTether(g, kit, m) {
    const ctx = kit.ctx, px = kit.px(), [hx, hy] = hatchPos(g, kit), T = tier(g), lift = RIG[T].lift;
    const [bx, by] = rollingNow(g, m) ? [g.astro.x, g.astro.y] : spritePt(g, m, kit, T >= 4 ? -0.5 : -0.32, T >= 4 ? 1.25 : 0.66 + lift);
    const d = Math.hypot(bx - hx, by - hy) || 1e-6;
    const slack = Math.max(0, m.paid - Math.hypot(g.astro.x - g.sh.x, g.astro.y - g.sh.y));
    const sag = Math.min(0.28 * d, Math.sqrt(3 * d * slack / 8)), nx = -(by - hy) / d, ny = (bx - hx) / d;
    const mx = (hx + bx) / 2, my = (hy + by) / 2, nb = Game.nearestBody(g, mx, my);
    let sg = Math.sin(g.real * 0.6 + 1);                                // floats in loose curves out here
    if (nb.alt < 30 && !nb.b.star) sg = -Math.sign(nx * nb.ux + ny * nb.uy) || 1;   // near a rock it droops toward it
    const cx = mx + nx * sag * sg * 2, cy = my + ny * sag * sg * 2, taut = m.J > 0 || sag < 0.05;
    const line = (w, col) => { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(cx, cy, bx, by); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    ctx.lineCap = 'round';
    line(3.6 * px, INK);
    line(1.7 * px, taut ? '#d6fff3' : TEAL);
    disc(ctx, hx, hy, 3 * px, TEAL, 1.5 * px);
  }

  // -------- the astronaut: a Pipkin sprout in a bubble helmet; the suit tier changes everything below the chin --------

  function drawAstro(g, kit, m) {
    const A = g.astro, ctx = kit.ctx, px = kit.px(), T = tier(g), R = RIG[T];
    const s = spriteScale(g, kit), up = upAng(g), rot = up - Math.PI / 2, f = m.face || 1;
    const fx = A.x - Math.cos(up) * STAND, fy = A.y - Math.sin(up) * STAND;
    const c = Math.cos(-rot), sn = Math.sin(-rot), L = [(kit.LIGHT[0] * c - kit.LIGHT[1] * sn) * f, kit.LIGHT[0] * sn + kit.LIGHT[1] * c];
    const t = g.real, ppm = s / px;
    const walking = m.grounded && !m.space && Math.abs(Math.sin(m.phase)) > 0.02, air = !m.grounded;
    const P = { g, m, ctx, T, R, L, f, t, s, c, sn, small: ppm < 45, tiny: ppm < 26, lw: 2.4 * px / s, lw2: 1.5 * px / s,
                walking, air, sprint: m.sprinting, lift: R.lift, inv: g.t < (A.invUntil ?? 0) && Math.sin(t * 40) > 0,
                bob: m.grounded ? Math.abs(Math.sin(m.phase)) * 0.03 + Math.sin(t * 2.2) * 0.008 : Math.sin(t * 1.7) * 0.015,
                aim: localAim(m, rot, f) };
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(rot); ctx.scale(s * f, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (rollingNow(g, m)) drawBall(P, (g.t - m.roll.t0) / m.roll.T);
    else drawPip(P);
    ctx.restore();
  }

  function drawPip(P) {
    const { ctx, m, T } = P, sw = P.walking ? Math.sin(m.phase) : P.air ? 0.45 : 0, cw = P.walking ? Math.cos(m.phase) : 0;
    const lean = P.sprint ? -0.14 : m.space && m.thrust ? -0.1 * m.thrustDir[0] * m.face : 0;
    if (P.sprint) speedLines(P);
    jetFlame(P);
    ctx.save();
    if (lean) { ctx.translate(0, RIG[T].hip); ctx.rotate(lean); ctx.translate(0, -RIG[T].hip); }
    backArm(P, sw);
    leg(P, -0.05, -sw, P.air ? 0.12 : Math.max(0, -cw) * 0.08, true);
    pack(P);
    torso(P);
    if ((P.g.S.bombs ?? 0) > 0) bandolier(P);
    leg(P, 0.08, sw, P.air ? 0.04 : Math.max(0, cw) * 0.08, false);
    const armFirst = P.aim > (T >= 4 ? 0.3 : 0.75);                    // aiming high: the arm goes behind the helmet, the face stays visible
    if (armFirst) gunArm(P);
    head(P, RIG[T].head + P.bob);
    if (T >= 4) collarLip(P);
    if (!armFirst) gunArm(P);
    if (T >= 4) pauldron(P);
    ctx.restore();
    if (P.inv) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff'; circ(ctx, 0, RIG[T].h * 0.55, RIG[T].h * 0.48); ctx.fill(); ctx.globalAlpha = 1; }
  }

  // aim direction in the sprite frame (after rotation and the facing flip)
  function localAim(m, rot, f) {
    const d = m.aimDir; if (!d) return -0.6;
    const c = Math.cos(-rot), s = Math.sin(-rot), x = d[0] * c - d[1] * s, y = d[0] * s + d[1] * c;
    return Math.atan2(y, x * f);
  }

  function speedLines(P) {
    const { ctx, t, lift } = P;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.045;
    for (let i = 0; i < 3; i++) {
      const y = 0.45 + lift + i * 0.28, x0 = -0.5 - ((t * 6 + i * 0.37) % 1) * 0.3;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - 0.35 - 0.1 * i, y); ctx.stroke();
    }
  }

  function jetFlame(P) {
    const { ctx, m, c, sn, f, lift } = P;
    if (!(m.thrust > 0)) return;
    const ex = m.thrustDir[0] * c - m.thrustDir[1] * sn, ey = m.thrustDir[0] * sn + m.thrustDir[1] * c;
    const fa = Math.atan2(-ey, -ex * f), len = (0.35 + 0.35 * m.thrust) * (0.8 + 0.4 * Math.random()) * (P.T >= 4 ? 1.4 : 1);
    for (const off of P.T >= 3 ? [-0.06, 0.1] : [0]) {
      ctx.save(); ctx.translate(P.T >= 4 ? -0.5 + off : -0.26 - (P.T >= 3 ? 0.05 : 0), P.T >= 4 ? 0.95 : 0.42 + lift + off); ctx.rotate(fa);
      ctx.beginPath(); ctx.moveTo(0, -0.09); ctx.quadraticCurveTo(len * 0.6, -0.12, len, 0); ctx.quadraticCurveTo(len * 0.6, 0.12, 0, 0.09); ctx.closePath();
      ctx.fillStyle = '#ff7a1c'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = P.lw2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.045); ctx.quadraticCurveTo(len * 0.4, -0.05, len * 0.6, 0); ctx.quadraticCurveTo(len * 0.4, 0.05, 0, 0.045); ctx.closePath();
      ctx.fillStyle = '#ffe066'; ctx.fill();
      ctx.restore();
    }
  }

  // -------- legs --------

  function leg(P, x, sw, lift, back) {
    const { ctx, T, R, lw } = P, hipY = R.hip, stride = T >= 4 ? 0.2 : T >= 3 ? 0.16 : 0.13;
    const ankle = [x + sw * stride, 0.1 + lift + (T >= 4 ? 0.06 : T >= 3 ? 0.03 : 0)], hip = [x * (T >= 4 ? 1.6 : 1), hipY];
    const kn = knee(hip[0], hip[1], ankle[0], ankle[1], R.th, R.sh);
    if (T >= 4) return mechLeg(P, hip, kn, ankle, back);
    limb(ctx, [hip, kn, ankle], T === 1 ? 0.2 : 0.17, back ? SUIT[1] : SUIT[0], lw);
    if (T === 1 && !P.tiny) { ctx.strokeStyle = SUIT[1]; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(kn[0] - 0.08, kn[1] + 0.02); ctx.lineTo(kn[0] + 0.08, kn[1] - 0.02); ctx.stroke(); }
    if (T === 2) {                                                       // shin guard
      ctx.save(); ctx.translate((kn[0] + ankle[0]) / 2, (kn[1] + ankle[1]) / 2); ctx.rotate(Math.atan2(ankle[1] - kn[1], ankle[0] - kn[0]));
      toon(ctx, () => rr(ctx, -0.1, -0.1, 0.2, 0.2, 0.06), back ? [GUN[1], GUN[1], GUN[0]] : GUN, [0, 0], 0, lw * 0.8, null);
      ctx.restore();
    }
    if (T === 3) strut(P, hip, kn, ankle, back);
    boot(P, ankle, back);
  }

  // Strider: orange struts hip -> knee -> ankle with joint discs, outside the suit leg
  function strut(P, hip, kn, ankle, back) {
    const { ctx, lw } = P, col = back ? '#c25f1c' : '#ff9f43', off = 0.05;
    const pts = [[hip[0] + off, hip[1]], [kn[0] + off, kn[1]], [ankle[0] + off, ankle[1] + 0.02]];
    limb(ctx, pts, 0.07, col, lw * 0.9);
    for (const [x, y] of pts) disc(ctx, x, y, 0.065, back ? DARK[1] : DARK[0], lw * 0.7);
    if (!P.tiny) for (const [x, y] of pts) disc(ctx, x, y, 0.022, '#ffd166');
  }

  function boot(P, [ax, ay], back) {
    const { ctx, T, lw, g } = P, big = T >= 3 ? 1.35 : T === 1 ? 1.1 : 1, by = ay - 0.04;
    const col = T >= 3 ? (back ? DARK[1] : DARK[0]) : back ? '#5a5480' : '#6e6896';
    ctx.beginPath(); ctx.ellipse(ax + 0.05 * big, by, 0.13 * big, 0.075 * big, 0, 0, 2 * Math.PI);
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
    if (T === 2 && !P.tiny) { ctx.fillStyle = GUN[0]; ctx.beginPath(); ctx.ellipse(ax + 0.13, by + 0.01, 0.05, 0.045, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    if ((g.S.sprint ?? 1) > 1 && !P.tiny) {                             // racing stripes on the sneakers
      ctx.strokeStyle = '#ff7eb6'; ctx.lineWidth = 0.035 * big;
      for (const k of [0, 1]) { ctx.beginPath(); ctx.moveTo(ax - 0.03 * big + k * 0.07 * big, by - 0.055 * big); ctx.lineTo(ax + 0.02 * big + k * 0.07 * big, by + 0.05 * big); ctx.stroke(); }
    }
    ctx.fillStyle = INK; ctx.fillRect(ax - 0.08 * big, by - 0.075 * big, 0.26 * big, 0.03 * big);   // sole
  }

  // Mecha-Pip: thick servo thigh and shin, a piston, a glowing knee, a big flat boot
  function mechLeg(P, hip, kn, ankle, back) {
    const { ctx, lw, m, t } = P, plate = back ? [MECH[1], MECH[1], MECH[0]] : MECH;
    const seg = (a, b, w) => {
      ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      toon(ctx, () => rr(ctx, -0.03, -w / 2, l + 0.06, w, w * 0.35), plate, [0, -0.6], 0.05, lw, null);
      ctx.restore();
    };
    seg(hip, kn, 0.22);
    limb(ctx, [[hip[0] - 0.06, hip[1] - 0.05], [ankle[0] - 0.08, ankle[1] + 0.12]], 0.035, '#9b97b8', lw * 0.6);   // piston
    seg(kn, ankle, 0.24);
    if (!back && !P.tiny) {                                             // orange hazard band on the shin
      ctx.save(); ctx.translate((kn[0] + ankle[0]) / 2, (kn[1] + ankle[1]) / 2); ctx.rotate(Math.atan2(ankle[1] - kn[1], ankle[0] - kn[0]));
      ctx.fillStyle = '#ff9f43'; ctx.fillRect(-0.04, -0.12, 0.07, 0.24); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.6; ctx.strokeRect(-0.04, -0.12, 0.07, 0.24);
      ctx.restore();
    }
    disc(ctx, hip[0], hip[1], 0.11, DARK[back ? 1 : 0], lw * 0.8);
    const glow = m.sprinting ? 0.6 + 0.4 * Math.sin(t * 14) : 0.25;
    disc(ctx, kn[0], kn[1], 0.11, DARK[back ? 1 : 0], lw * 0.8);
    ctx.globalAlpha = back ? glow * 0.6 : glow; disc(ctx, kn[0], kn[1], 0.06, GLOW); ctx.globalAlpha = 1;
    const [ax, ay] = ankle, by = ay - 0.06;                              // the boot: a chunky wedge with a toe cap
    toon(ctx, () => { ctx.beginPath(); ctx.moveTo(ax - 0.16, by - 0.07); ctx.lineTo(ax - 0.12, by + 0.1); ctx.lineTo(ax + 0.12, by + 0.1); ctx.quadraticCurveTo(ax + 0.3, by + 0.04, ax + 0.3, by - 0.07); ctx.closePath(); },
         back ? [DARK[1], DARK[1], DARK[0]] : DARK, [0, 0.5], 0.04, lw, null);
    if ((P.g.S.sprint ?? 1) > 1 && !P.tiny) { ctx.strokeStyle = '#ff7eb6'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(ax - 0.02, by + 0.08); ctx.lineTo(ax + 0.05, by - 0.06); ctx.moveTo(ax + 0.07, by + 0.08); ctx.lineTo(ax + 0.14, by - 0.06); ctx.stroke(); }
    ctx.fillStyle = INK; ctx.fillRect(ax - 0.17, by - 0.1, 0.48, 0.04);
  }

  // -------- back arm, pack, torso --------

  function backArm(P, sw) {
    const { ctx, T, lift, bob, lw, m } = P, sh = T >= 4 ? [-0.12, 1.2 + bob] : [-0.06, 0.8 + lift + bob];
    const swing = P.sprint ? Math.sin(m.phase) * 0.9 : P.walking ? -sw * 0.5 : P.air ? -0.9 : 0.15;
    const a = -Math.PI / 2 - swing, len = T >= 4 ? 0.48 : 0.3;
    const hand = [sh[0] + Math.cos(a) * len, sh[1] + Math.sin(a) * len];
    if (T >= 4) {
      limb(ctx, [sh, hand], 0.18, MECH[1], lw);
      disc(ctx, hand[0], hand[1], 0.12, DARK[1], lw);
      return;
    }
    limb(ctx, [sh, hand], T === 1 ? 0.15 : 0.12, SUIT[1], lw);
    disc(ctx, hand[0], hand[1], 0.065, T >= 2 ? GUN[1] : '#b7afdc', lw * 0.8);
  }

  function pack(P) {
    const { ctx, T, L, lw, lw2, bob, lift, t } = P, y = 0.36 + lift + bob;
    if (T <= 2) {
      toon(ctx, () => rr(ctx, -0.42, y, 0.26, 0.56, 0.08), PACK, L, 0.05, lw, [-0.33, y + 0.44, 0.04, 0.09]);
      ctx.fillStyle = GUN[1]; rr(ctx, -0.35, y - 0.06, 0.13, 0.1, 0.03); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
      disc(ctx, -0.29, y + 0.46, 0.035, '#7cf5d6');
      return;
    }
    const big = T >= 4, x0 = big ? -0.72 : -0.46, w = big ? 0.42 : 0.3, h = big ? 0.7 : 0.6, y0 = big ? 0.9 + bob : y;
    for (const k of [0, 1]) {                                            // two exhaust vents on top, glowing inside
      const vx = x0 + 0.06 + k * (w - 0.18);
      toon(ctx, () => rr(ctx, vx, y0 + h - 0.04, 0.12, big ? 0.22 : 0.16, 0.03), DARK, L, 0.03, lw2 * 1.2, null);
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 6 + k * 2); disc(ctx, vx + 0.06, y0 + h + (big ? 0.16 : 0.1), 0.035, GLOW); ctx.globalAlpha = 1;
    }
    toon(ctx, () => rr(ctx, x0, y0, w, h, 0.08), DARK, L, 0.05, lw, [x0 + 0.08, y0 + h * 0.75, 0.04, 0.1]);
    ctx.fillStyle = '#ff9f43'; ctx.fillRect(x0 + 0.02, y0 + h * 0.42, w - 0.04, 0.07);
    if (!P.tiny) { ctx.strokeStyle = INK; ctx.lineWidth = lw2 * 0.8; ctx.strokeRect(x0 + 0.02, y0 + h * 0.42, w - 0.04, 0.07); }
    disc(ctx, x0 + w / 2, y0 + h * 0.22, 0.045, GLOW, lw2 * 0.8);
  }

  function torso(P) {
    const { ctx, T, L, lw, lw2, bob, lift, t, m } = P;
    if (T >= 4) return mechTorso(P);
    const cy = 0.62 + lift + bob, rx = T === 1 ? 0.28 : 0.25, ry = T === 1 ? 0.33 : 0.31;
    const body = () => { ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, 2 * Math.PI); };
    toon(ctx, body, SUIT, L, 0.07, lw, [-0.08, cy + 0.14, 0.05, 0.1, 0.3]);
    ctx.save(); body(); ctx.clip();
    if (T === 1 && !P.tiny) {                                          // quilted: three seams
      ctx.strokeStyle = SUIT[1]; ctx.lineWidth = lw * 0.7;
      for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.ellipse(0, cy + k * 0.15 + 0.02, rx * 1.05, 0.05, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke(); }
    }
    ctx.fillStyle = '#ff9f43'; ctx.fillRect(-0.3, cy - 0.2, 0.6, 0.07);   // belt stripe
    if (T === 3) { ctx.fillStyle = DARK[0]; ctx.fillRect(-0.3, cy - 0.27, 0.6, 0.07); }        // Strider's waist frame
    ctx.restore();
    body(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    if (T === 2) {                                                     // armour: a chest plate with four rivets
      toon(ctx, () => rr(ctx, -0.13, cy - 0.12, 0.33, 0.3, 0.08), GUN, L, 0.03, lw2 * 1.2, [-0.05, cy + 0.1, 0.04, 0.03]);
      if (!P.tiny) for (const [x, y] of [[-0.08, cy - 0.07], [0.15, cy - 0.07], [-0.08, cy + 0.13], [0.15, cy + 0.13]]) disc(ctx, x, y, 0.018, GUN[2]);
    }
    const led = (t * 1.3) % 2 < 1.7 ? (m.o2 < O2_WARN ? '#ff5d5d' : '#7cf5d6') : '#3b3566';
    if (T !== 2) {
      ctx.fillStyle = INK; rr(ctx, 0.04, cy - 0.06, 0.14, 0.1, 0.03); ctx.fill();
      disc(ctx, 0.08, cy - 0.01, 0.022, led); disc(ctx, 0.14, cy - 0.01, 0.018, '#ffd166');
    } else disc(ctx, 0.12, cy + 0.03, 0.03, led);
    if (T === 3) toon(ctx, () => rr(ctx, -0.2, 0.44 + bob, 0.4, 0.1, 0.04), DARK, L, 0.02, lw2 * 1.1, null);   // hip frame bolts the struts on
  }

  // Mecha-Pip: a chunky chest with a cage over a glowing core, hazard stripes, a raised collar
  function mechTorso(P) {
    const { ctx, L, lw, lw2, bob, t, m } = P, y0 = 0.86 + bob, h = 0.56, x0 = -0.36, w = 0.74;
    toon(ctx, () => rr(ctx, -0.22, 0.7 + bob, 0.44, 0.22, 0.06), DARK, L, 0.03, lw, null);   // pelvis
    const chest = () => { ctx.beginPath(); ctx.moveTo(x0 + 0.06, y0); ctx.lineTo(x0 + w - 0.06, y0); ctx.quadraticCurveTo(x0 + w + 0.04, y0 + h * 0.55, x0 + w - 0.04, y0 + h); ctx.lineTo(x0 + 0.02, y0 + h); ctx.quadraticCurveTo(x0 - 0.06, y0 + h * 0.5, x0 + 0.06, y0); ctx.closePath(); };
    toon(ctx, chest, MECH, L, 0.07, lw, [x0 + 0.16, y0 + h * 0.78, 0.07, 0.12, 0.2]);
    ctx.save(); chest(); ctx.clip();
    const sy = y0 + h - 0.2;                                                                    // orange stripe with hazard ticks, up by the collar
    ctx.fillStyle = '#ff9f43'; ctx.fillRect(x0 - 0.1, sy, w + 0.2, 0.1);
    if (!P.tiny) { ctx.fillStyle = INK; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(x0 + k * 0.12, sy); ctx.lineTo(x0 + k * 0.12 + 0.05, sy); ctx.lineTo(x0 + k * 0.12 + 0.1, sy + 0.1); ctx.lineTo(x0 + k * 0.12 + 0.05, sy + 0.1); ctx.closePath(); ctx.fill(); } }
    ctx.restore();
    chest(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    const cx = 0.19, cy = y0 + 0.16, pulse = 0.75 + 0.25 * Math.sin(t * (m.sprinting ? 12 : 3));   // the core behind its cage
    disc(ctx, cx, cy, 0.13, '#2b2550', lw2);
    ctx.globalAlpha = pulse; disc(ctx, cx, cy, 0.09, GLOW); disc(ctx, cx - 0.03, cy + 0.03, 0.03, '#ffffff'); ctx.globalAlpha = 1;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.03, lw2);
    for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(cx + k * 0.06, cy - 0.13); ctx.lineTo(cx + k * 0.06, cy + 0.13); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - 0.13, cy); ctx.lineTo(cx + 0.13, cy); ctx.stroke();
    if (!P.tiny) for (const [x, y] of [[x0 + 0.1, y0 + 0.24], [x0 + w - 0.1, y0 + 0.24], [x0 + 0.1, y0 + h - 0.08], [x0 + w - 0.1, y0 + h - 0.08]]) disc(ctx, x, y, 0.02, MECH[1]);
    toon(ctx, () => { ctx.beginPath(); ctx.ellipse(0.03, y0 + h + 0.03, 0.4, 0.13, 0, 0, 2 * Math.PI); }, DARK, L, 0.03, lw, null);   // the raised collar the bubble sits in
  }
  // ...and its front lip, drawn over the bottom of the bubble
  function collarLip(P) {
    const { ctx, lw, bob, t } = P, y = 1.45 + bob;
    ctx.beginPath(); ctx.ellipse(0.03, y, 0.4, 0.13, 0, 0, Math.PI, true); ctx.lineTo(0.43, y); ctx.ellipse(0.03, y + 0.05, 0.4, 0.09, 0, 0, Math.PI, true); ctx.closePath();
    ctx.fillStyle = DARK[0]; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
    for (const k of [-0.22, -0.07, 0.08, 0.23]) disc(ctx, 0.03 + k, y - 0.1, 0.022, GLOW);
    ctx.globalAlpha = 1;
  }

  // bandolier across the chest: one puck per charge; recharging ones are grey
  function bandolier(P) {
    const { ctx, g, m, T, lift, bob, lw, lw2, t } = P, n = Math.max(1, g.S.bombs ?? 0);
    const a = T >= 4 ? [0.3, 1.36 + bob] : [0.2, 0.88 + lift + bob], b = T >= 4 ? [-0.32, 0.9 + bob] : [-0.2, 0.42 + lift + bob];
    limb(ctx, [a, b], T >= 4 ? 0.09 : 0.07, '#6e5a3a', lw * 0.8);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.7) / (n + 0.4), x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, ready = i < m.bombsN;
      disc(ctx, x, y, T >= 4 ? 0.075 : 0.06, ready ? '#ff5d5d' : '#8c84b3', lw2);
      if (ready && !P.tiny && Math.sin(t * 9 + i * 1.7) > 0.2) disc(ctx, x + 0.035, y + 0.045, 0.018, '#ffe066');
    }
  }

  // -------- head, face, helmet, antenna and the pip (mood light), translator gadgets --------

  function head(P, hy) {
    const { ctx, g, m, T, L, lw, lw2, t, small } = P, xl = translator(g);
    if (T < 4) { ctx.fillStyle = T >= 2 ? GUN[1] : SUIT[1]; ctx.beginPath(); ctx.ellipse(0.02, hy - 0.27, 0.24, 0.07, 0, 0, 2 * Math.PI); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke(); }
    const streams = P.sprint || (m.space && m.thrust > 0);
    const wob = streams ? -0.75 + Math.sin(t * 18) * 0.08 : Math.sin(t * 3.1) * 0.12 - (P.air ? 0.15 : 0) + (P.walking ? Math.cos(m.phase * 2) * 0.1 : 0);
    const ax = Math.sin(wob) * 0.17, ay = hy + 0.22 + Math.cos(wob) * 0.17;
    ctx.strokeStyle = INK; ctx.lineWidth = lw2 * 1.3; ctx.beginPath(); ctx.moveTo(0.02, hy + 0.2); ctx.quadraticCurveTo(0.0, hy + 0.32, ax, ay); ctx.stroke();
    const pc = pipCol(g, m);
    if (pc.glow) { ctx.globalAlpha = 0.35; disc(ctx, ax, ay, 0.11, pc.col); ctx.globalAlpha = 1; }
    disc(ctx, ax, ay, 0.055, pc.col, lw2);
    if (xl >= 2) ring(P, ax, ay);
    const headPath = () => { ctx.beginPath(); ctx.ellipse(0.05, hy - 0.01, 0.33, 0.28, 0, 0, 2 * Math.PI); };
    toon(ctx, headPath, SKIN, L, 0.06, small ? lw2 * 0.8 : lw2 * 1.2, [-0.06, hy + 0.12, 0.07, 0.04, 0.4]);
    drawFace(g, ctx, m, hy, P.aim, lw2, small);

    // glass: tint, ink rim, a fat highlight toward the sun; armour adds a brow, the mech a glowing visor ring
    if (T >= 4) { ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3); ctx.strokeStyle = GLOW; ctx.lineWidth = 0.09; circ(ctx, 0.03, hy + 0.02, 0.49); ctx.stroke(); ctx.globalAlpha = 1; }
    circ(ctx, 0.03, hy + 0.02, 0.44);
    ctx.fillStyle = T >= 4 ? 'rgba(170,255,236,0.28)' : 'rgba(205,242,255,0.3)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = small ? lw * 0.7 : lw; ctx.stroke();
    const la = Math.atan2(L[1], L[0]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.055; ctx.beginPath(); ctx.arc(0.03, hy + 0.02, 0.34, la - 0.55, la + 0.35); ctx.stroke();
    disc(ctx, 0.03 + Math.cos(la + 0.75) * 0.33, hy + 0.02 + Math.sin(la + 0.75) * 0.33, 0.03, '#ffffff');
    if (T === 2 || T === 3) { ctx.strokeStyle = INK; ctx.lineWidth = 0.11 + lw; ctx.beginPath(); ctx.arc(0.03, hy + 0.02, 0.44, 0.25 * Math.PI, 0.72 * Math.PI); ctx.stroke(); ctx.strokeStyle = T === 3 ? '#ff9f43' : GUN[0]; ctx.lineWidth = 0.11; ctx.stroke(); }
    if (xl === 1) trumpet(P, hy);
  }

  function pipCol(g, m) {
    const A = g.astro, blink = Math.sin(g.real * 10) > 0;
    if (A.hp < 0.3 * A.hpMax) return { col: blink ? '#ff5d5d' : '#8a3a4a', glow: blink };
    if (m.o2 < O2_WARN) return { col: blink ? '#7fd8ff' : '#3a6a8a', glow: blink };
    if (g.real - m.gemT < 2) return { col: '#ffd166', glow: true };
    if (m.firing) return { col: '#ff3d8b', glow: true };
    return { col: ANTENNA, glow: false };
  }
  const translator = (g) => (typeof Npcs !== 'undefined' && Npcs && Npcs.translator ? Npcs.translator(g) : g.S.translator ?? 0);

  // Mk I Pocket Phrasebook: a little brass ear-trumpet on the helmet
  function trumpet(P, hy) {
    const { ctx, lw2 } = P;
    ctx.beginPath(); ctx.moveTo(0.36, hy + 0.08); ctx.lineTo(0.5, hy + 0.14); ctx.lineTo(0.52, hy - 0.02); ctx.lineTo(0.38, hy + 0.01); ctx.closePath();
    ctx.fillStyle = BRASS; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0.515, hy + 0.06, 0.035, 0.085, 0, 0, 2 * Math.PI); ctx.fillStyle = '#b8862e'; ctx.fill(); ctx.stroke();
  }
  // Mk II Universal Translator: a gold ring round the pip with a moon on it (1 rev/s)
  function ring(P, x, y) {
    const { ctx, t, lw2 } = P, a = t * 2 * Math.PI;
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = Math.max(0.02, lw2 * 0.9); ctx.beginPath(); ctx.ellipse(x, y, 0.1, 0.035, -0.2, 0, 2 * Math.PI); ctx.stroke();
    disc(ctx, x + Math.cos(a) * 0.1, y + Math.sin(a) * 0.035 - Math.cos(a) * 0.02, 0.022, '#ffd166', lw2 * 0.6);
  }

  function drawFace(g, ctx, m, hy, aimL, lw, small) {
    const blink = (g.real + 0.7) % 3.4 < 0.12, A = g.astro, big = small ? 1.12 : 1;
    const look = [Math.cos(aimL) * 0.035, Math.sin(aimL) * 0.03];
    const worried = m.o2 < O2_WARN || A.hp < 0.3 * A.hpMax;
    for (const ex of [0.0, 0.17]) {
      const ey = hy + 0.04, r = (ex ? 0.085 : 0.078) * big;
      if (blink) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey); ctx.stroke(); continue; }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(ex, ey, r, r * 1.15, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + look[0], ey + look[1], r * (small ? 0.64 : 0.58), 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex + look[0] - r * 0.22, ey + look[1] + r * 0.25, r * 0.2, 0, 2 * Math.PI); ctx.fill();
      if (worried) { ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(ex - r, ey + r * 1.5 + (ex ? -0.02 : 0.02)); ctx.lineTo(ex + r, ey + r * 1.5 + (ex ? 0.02 : -0.02)); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255,120,160,0.55)';
    if (!small) for (const bx of [-0.08, 0.25]) { ctx.beginPath(); ctx.ellipse(bx, hy - 0.07, 0.045, 0.025, 0, 0, 2 * Math.PI); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.9; ctx.beginPath();
    if (m.firing) { ctx.fillStyle = INK; ctx.ellipse(0.1, hy - 0.11, 0.03, 0.035, 0, 0, 2 * Math.PI); ctx.fill(); }
    else if (worried) { ctx.arc(0.1, hy - 0.15, 0.045, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    else { ctx.arc(0.1, hy - 0.07, 0.05, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
  }

  // -------- the laser arm (Mecha-Pip: a forearm cannon on a piston) and the shoulder plate --------

  function gunArm(P) {
    const { ctx, m, T, bob, lw, lw2, t, aim } = P, mech = T >= 4;
    ctx.save(); ctx.translate(mech ? 0.04 : 0.02, RIG[T].arm + bob); ctx.rotate(aim);
    const arm = mech ? 0.3 : 0.26;
    limb(ctx, [[0, 0], [arm, 0]], mech ? 0.17 : T === 1 ? 0.15 : 0.13, mech ? MECH[0] : SUIT[0], lw);
    if (mech) {
      limb(ctx, [[-0.02, 0.1], [0.34, 0.1]], 0.035, '#9b97b8', lw2 * 0.8);                       // piston rod
      toon(ctx, () => rr(ctx, 0.2, -0.13, 0.5, 0.26, 0.08), MECH, [0, 1], 0.04, lw2 * 1.4, [0.32, 0.07, 0.08, 0.03]);
      ctx.fillStyle = '#ff9f43'; ctx.fillRect(0.3, -0.13, 0.07, 0.26); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.strokeRect(0.3, -0.13, 0.07, 0.26);
      toon(ctx, () => rr(ctx, 0.66, -0.09, 0.14, 0.18, 0.04), DARK, [0, 1], 0.02, lw2 * 1.2, null);
      if (!P.tiny) { ctx.strokeStyle = INK; ctx.lineWidth = lw2 * 0.7; for (const k of [0, 1, 2]) { ctx.beginPath(); ctx.moveTo(0.45 + k * 0.06, -0.08); ctx.lineTo(0.45 + k * 0.06, 0.08); ctx.stroke(); } }
      const glow = m.firing ? 0.1 + 0.025 * Math.sin(t * 40) : 0.055;
      ctx.globalAlpha = 0.5; disc(ctx, 0.84, 0, glow * 1.8, m.firing ? '#ffffff' : GLOW); ctx.globalAlpha = 1;
      disc(ctx, 0.84, 0, glow, m.firing ? '#ffffff' : GLOW, lw2);
      ctx.restore();
      return;
    }
    toon(ctx, () => rr(ctx, 0.2, -0.07, 0.36, 0.14, 0.05), GUN, [0, 1], 0.03, lw2 * 1.2, null);
    ctx.fillStyle = GUN[1]; rr(ctx, 0.24, -0.15, 0.08, 0.1, 0.02); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
    if (T === 3) { ctx.fillStyle = '#ff9f43'; ctx.fillRect(0.38, -0.07, 0.05, 0.14); }
    const glow = m.firing ? 0.07 + 0.02 * Math.sin(t * 40) : 0.04;
    disc(ctx, 0.57, 0, glow, m.firing ? '#ffffff' : BEAM, lw2);
    ctx.restore();
  }

  function pauldron(P) {
    const { ctx, L, lw, bob } = P, x = -0.04, y = 1.16 + bob;
    toon(ctx, () => { ctx.beginPath(); ctx.moveTo(x - 0.24, y - 0.04); ctx.quadraticCurveTo(x - 0.22, y + 0.24, x + 0.04, y + 0.25); ctx.quadraticCurveTo(x + 0.28, y + 0.22, x + 0.27, y - 0.06); ctx.quadraticCurveTo(x + 0.02, y - 0.14, x - 0.24, y - 0.04); ctx.closePath(); },
         MECH, L, 0.05, lw, [x - 0.06, y + 0.14, 0.07, 0.04, 0.3]);
    ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.moveTo(x - 0.23, y - 0.03); ctx.quadraticCurveTo(x + 0.02, y - 0.13, x + 0.27, y - 0.05); ctx.lineTo(x + 0.27, y + 0.03); ctx.quadraticCurveTo(x + 0.02, y - 0.05, x - 0.22, y + 0.05); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.7; ctx.stroke();
    if (!P.tiny) for (const k of [-0.12, 0.04, 0.19]) disc(ctx, x + k, y + 0.12, 0.02, MECH[1]);
  }

  // -------- dive roll: a tucked ball with the helmet at the front, two full turns --------

  function drawBall(P, k) {
    const { ctx, g, m, T, L, lw, lw2 } = P, big = T >= 4 ? 1.35 : T >= 3 ? 1.12 : 1, r = 0.45 * big, cy = 0.5 * big;
    const a = -k * 4 * Math.PI, col = T >= 4 ? MECH : SUIT;
    ctx.save(); ctx.translate(0, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.05;           // whoosh arcs behind
    for (const d of [0.12, 0.24]) { ctx.beginPath(); ctx.arc(0, 0, r + d, Math.PI * 0.55, Math.PI * 1.15); ctx.stroke(); }
    ctx.rotate(a);
    toon(ctx, () => circ(ctx, 0, 0, r), col, L, 0.07, lw, [-0.15, 0.2, 0.07, 0.12, 0.3]);
    ctx.fillStyle = T >= 3 ? DARK[0] : PACK[0]; rr(ctx, -r - 0.05, -0.18, 0.2, 0.36, 0.07); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw2; ctx.stroke();
    ctx.fillStyle = '#ff9f43'; ctx.save(); circ(ctx, 0, 0, r); ctx.clip(); ctx.fillRect(-r, -0.04, 2 * r, 0.08); ctx.restore();
    circ(ctx, 0, 0, r); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    const hx = r * 0.45, hy = 0.05;                                      // the helmet glass at the front, a green face inside
    toon(ctx, () => { ctx.beginPath(); ctx.ellipse(hx, hy, 0.2, 0.17, 0, 0, 2 * Math.PI); }, SKIN, L, 0.03, lw2, null);
    disc(ctx, hx + 0.05, hy + 0.03, 0.04, '#ffffff', lw2 * 0.6); disc(ctx, hx + 0.06, hy + 0.03, 0.022, INK);
    circ(ctx, hx, hy, 0.26); ctx.fillStyle = 'rgba(205,242,255,0.3)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    disc(ctx, hx - 0.08, hy + 0.12, 0.035, '#ffffff');
    disc(ctx, -0.1, r + 0.08, 0.05, pipCol(g, m).col, lw2);
    ctx.restore();
    if (P.inv) { ctx.globalAlpha = 0.55; disc(ctx, 0, cy, r + 0.06, '#ffffff'); ctx.globalAlpha = 1; }
  }

  function drawBeam(g, kit, B) {
    const ctx = kit.ctx, px = kit.px(), fl = 0.8 + 0.4 * Math.random();
    const line = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(B.x0, B.y0); ctx.lineTo(B.x1, B.y1); ctx.stroke(); };
    ctx.lineCap = 'round';
    line(Math.max(0.5, 14 * px) * fl, 'rgba(255,79,139,0.22)');
    line(Math.max(0.2, 6 * px), INK);
    line(Math.max(0.13, 3.8 * px), BEAM);
    line(Math.max(0.05, 1.5 * px), '#fff2f7');
    if (!B.hit) return;
    const R = Math.max(0.55, 14 * px) * fl, gr = ctx.createRadialGradient(B.x1, B.y1, 0, B.x1, B.y1, R);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,120,170,0.6)'); gr.addColorStop(1, 'rgba(255,79,139,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(B.x1, B.y1, R, 0, 2 * Math.PI); ctx.fill();
    const n = 7, r0 = R * 0.35, spin = g.real * 9;                       // comic impact star in the material colour
    ctx.beginPath();
    for (let i = 0; i <= 2 * n; i++) {
      const a = spin + i * Math.PI / n, r = i % 2 ? r0 * 0.45 : r0 * (0.9 + 0.3 * Math.random());
      i ? ctx.lineTo(B.x1 + r * Math.cos(a), B.y1 + r * Math.sin(a)) : ctx.moveTo(B.x1 + r * Math.cos(a), B.y1 + r * Math.sin(a));
    }
    ctx.closePath(); ctx.fillStyle = B.col || '#ffffff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * px; ctx.stroke();
  }

  // -------- bombs: Pop Rocks (pink candy), Boom Berries (three purple berries), Thunder Pucks (a dark puck, sticky) --------

  function drawBomb(g, kit, bm) {
    const ctx = kit.ctx, px = kit.px(), k = Math.max(1.8, 9 * px / 0.12), lw = 2 * px, f = bm.fuse / Math.max(0.01, bm.fuse0);
    const L = kit.LIGHT, flash = Math.sin(g.real * (10 + 40 * (1 - f))) > 0;
    ctx.save(); ctx.translate(bm.x, bm.y); ctx.scale(k, k); ctx.rotate(bm.spin);
    const w = lw / k;
    if (bm.tier === 1) {
      toon(ctx, () => circ(ctx, 0, 0, 0.12), ['#ff7eb6', '#c94f86', '#ffd6e8'], L, 0.03, w, [-0.04, 0.04, 0.03, 0.02]);
      fuse(ctx, 0, 0.12, w, flash);
    } else if (bm.tier === 2) {
      for (const [x, y] of [[-0.07, -0.04], [0.07, -0.04], [0, 0.07]]) toon(ctx, () => circ(ctx, x, y, 0.085), ['#8f6bff', '#5a3fb8', '#d6cbff'], L, 0.025, w, [x - 0.03, y + 0.03, 0.025, 0.015]);
      ctx.fillStyle = '#5fbf5a'; ctx.beginPath(); ctx.ellipse(0.04, 0.17, 0.05, 0.022, 0.5, 0, 2 * Math.PI); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = w * 0.7; ctx.stroke();
      fuse(ctx, -0.01, 0.15, w, flash);
    } else {
      if (bm.stuck && !bm.stuck.rest) { ctx.fillStyle = '#ff9fb2'; ctx.beginPath(); ctx.moveTo(-0.06, -0.06); ctx.lineTo(0.06, -0.06); ctx.lineTo(0.09, -0.11); ctx.lineTo(-0.09, -0.11); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = w * 0.7; ctx.stroke(); }
      toon(ctx, () => rr(ctx, -0.16, -0.06, 0.32, 0.13, 0.06), DARK, L, 0.02, w, null);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(-0.11, 0.0); ctx.lineTo(-0.03, 0.03); ctx.lineTo(0.0, -0.02); ctx.lineTo(0.1, 0.02); ctx.stroke();
      disc(ctx, 0.11, 0.035, 0.022, flash ? '#ff3b3b' : '#7a2030', w * 0.5);
    }
    ctx.restore();
  }
  function fuse(ctx, x, y, w, flash) {
    ctx.strokeStyle = INK; ctx.lineWidth = 0.022; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 0.04, y + 0.05, x + 0.02, y + 0.08); ctx.stroke();
    if (!flash) return;
    ctx.fillStyle = '#ffe066'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 0.02 : 0.05; i ? ctx.lineTo(x + 0.02 + r * Math.cos(a), y + 0.09 + r * Math.sin(a)) : ctx.moveTo(x + 0.02 + r * Math.cos(a), y + 0.09 + r * Math.sin(a)); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = w * 0.5; ctx.stroke();
  }

  // the arc preview: dots for the length of the fuse, a ring where it lands (or goes off)
  function drawArc(g, kit, m) {
    const ctx = kit.ctx, px = kit.px(), A = m.arc, P = A.pts, b = A.body && g.w.byId[A.body];
    if (P.length < 2) return;
    const [fx, fy] = b ? World.bodyState(g.w, b, g.t) : [g.astro.x, g.astro.y], ok = m.bombsN >= 1;
    const r = 2.6 * px, step = Math.max(1, Math.round(0.12 / ARC_DT));
    for (let i = step; i < P.length; i += step) {
      const x = fx + P[i][0], y = fy + P[i][1];
      circ(ctx, x, y, r * 1.6); ctx.fillStyle = INK; ctx.fill();
      circ(ctx, x, y, r); ctx.fillStyle = ok ? '#ffd6e8' : '#9a8fbd'; ctx.fill();
    }
    const [ex, ey] = P[P.length - 1], R = 9 * px * (1 + 0.12 * Math.sin(g.real * 8)), R2 = Math.max(R, g.S.bombR ?? 0);
    ctx.lineWidth = 4.5 * px; ctx.strokeStyle = INK; circ(ctx, fx + ex, fy + ey, R); ctx.stroke();
    ctx.lineWidth = 2.2 * px; ctx.strokeStyle = ok ? '#ff7eb6' : '#9a8fbd'; ctx.stroke();
    ctx.setLineDash([4 * px, 4 * px]); ctx.lineWidth = 1.6 * px; ctx.strokeStyle = 'rgba(255,126,182,0.7)'; circ(ctx, fx + ex, fy + ey, R2); ctx.stroke(); ctx.setLineDash([]);
  }

  // comic starburst behind the BOOM word
  function drawBooms(g, kit, m) {
    const ctx = kit.ctx, px = kit.px();
    m.booms = m.booms.filter((b) => g.real - b.t0 < BOOM_T);
    for (const bo of m.booms) {
      const age = (g.real - bo.t0) / BOOM_T, rb = bo.ride && g.w.byId[bo.ride.b];
      let x = bo.x, y = bo.y;
      if (rb) { const s = World.bodyState(g.w, rb, g.t); x = s[0] + bo.ride.lx; y = s[1] + bo.ride.ly; }
      const R = Math.max(bo.R * (0.55 + 0.9 * Math.sqrt(age)), 14 * px), n = 9 + 2 * bo.tier;
      ctx.globalAlpha = age < 0.6 ? 1 : Math.max(0, 1 - (age - 0.6) / 0.4);
      const star = (rad, k) => {
        ctx.beginPath();
        for (let i = 0; i <= 2 * n; i++) {
          const a = bo.seed + i * Math.PI / n, r = i % 2 ? rad * k : rad * (0.85 + 0.15 * Math.sin(i * 2.3 + bo.seed));
          i ? ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        ctx.closePath();
      };
      star(R, 0.62); ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3 * px; ctx.stroke();
      star(R * 0.62, 0.6); ctx.fillStyle = '#ff7a1c'; ctx.fill();
      circ(ctx, x, y, R * 0.24); ctx.fillStyle = '#fff4dc'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // -------- screen layer: reticle, material tag, ship arrow, warnings --------

  function drawScreen(g, kit) {
    const m = st(g);
    if (!isOut(g)) return;
    const ctx = kit.ctx;
    vignette(g, kit, m);
    if (m.aimS && !(kit.cam && kit.cam.map)) {
      const [sx, sy] = m.aimS, inR = m.hover ? m.hover.inRange : true, col = m.aiming ? '#ff7eb6' : m.firing ? '#ffffff' : inR ? '#ff8fab' : '#9a8fbd';
      ctx.lineWidth = 4.5; ctx.strokeStyle = INK; reticle(ctx, sx, sy); ctx.lineWidth = 2; ctx.strokeStyle = col; reticle(ctx, sx, sy);
      ctx.font = `700 12.5px ${kit.FONT}`; ctx.textAlign = 'center';
      if (m.aiming) kit.outlinedText(m.bombsN >= 1 ? `BOMB ${'●'.repeat(m.bombsN)}` : 'RECHARGING', sx, sy + 30, '#ff9fd0', 4);
      else if (m.hoverRock && m.hoverRock.rock) rockTag(g, kit, m.hoverRock.rock, sx, sy);
      else if (m.hover && m.hover.mat.item) {
        const h = m.hover, mc = matCol(h.mat, h.b)[0];
        kit.outlinedText(MAT_NAME[h.mat.id].toUpperCase(), sx, sy + 28, mc, 4);
        ctx.font = `500 11px ${kit.FONT}`;
        kit.outlinedText(h.inRange ? `hardness ${h.mat.hard}` : 'out of laser range', sx, sy + 42, '#fff4dc', 3.5);
      }
      ctx.textAlign = 'left';
    }
    shipArrow(g, kit);
    if (m.lost > 0) {
      ctx.save(); ctx.textAlign = 'center'; ctx.font = `700 26px ${kit.FONT}`;
      const pulse = 1 + 0.08 * Math.sin(g.real * 10);
      ctx.translate(kit.W / 2, kit.H * 0.36); ctx.scale(pulse, pulse);
      kit.outlinedText(`TETHER RECALL IN ${Math.max(0, Math.ceil(RECALL_T - m.lost))}`, 0, 0, '#ffd166', 7);
      ctx.restore();
    }
  }

  function rockTag(g, kit, rk, sx, sy) {
    const H = haul(), ctx = kit.ctx, info = H && H.info ? H.info(g, rk) : null, known = !H || !H.known || H.known(g, rk);
    const ri = rockInfo(g, rk), type = info && info.type ? info.type : ri.type;
    kit.outlinedText(known && type ? `${String(type).toUpperCase()} ROCK` : 'ROCK', sx, sy + 28, ri.col[0], 4);
    if (!info || !Number.isFinite(info.m)) return;
    ctx.font = `500 11px ${kit.FONT}`;
    const ore = Number.isFinite(info.oreKg) ? `${Math.round(info.oreKg)} kg ore · ` : '';
    kit.outlinedText(`${ore}${info.m >= 10 ? info.m.toFixed(0) : info.m.toFixed(1)} t`, sx, sy + 42, '#fff4dc', 3.5);
  }

  function reticle(ctx, x, y) {
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 13, y + dy * 13); ctx.lineTo(x + dx * 18, y + dy * 18); }
    ctx.stroke();
  }

  function shipArrow(g, kit) {
    if (g.status === 'dead') return;
    const ctx = kit.ctx, [sx, sy] = kit.toScreen(g.sh.x, g.sh.y), W = kit.W, H = kit.H;
    if (kit.onScreen(sx, sy, -40)) return;
    const label = `${g.S.name} ${kit.fmtDist(Math.max(0, hullDist(g)))}`;
    if (kit.edgeArrow) return kit.edgeArrow('ship', g.sh.x, g.sh.y, label, '#ffb347');   // core lays out edge arrows
    const a = Math.atan2(sy - H / 2, sx - W / 2), mx = 46;
    const k = Math.min((W / 2 - mx) / Math.max(1e-6, Math.abs(Math.cos(a))), (H / 2 - mx - 40) / Math.max(1e-6, Math.abs(Math.sin(a))));
    const ex = W / 2 + Math.cos(a) * k, ey = H / 2 + Math.sin(a) * k;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.fillStyle = '#ffb347'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    kit.tag(ex - Math.cos(a) * 34, ey - Math.sin(a) * 26 + 4, label, '#ffb347');
  }

  function vignette(g, kit, m) {
    const A = g.astro, bad = m.o2 < O2_WARN || A.hp < 0.3 * A.hpMax;
    if (!bad) return;
    const ctx = kit.ctx, W = kit.W, H = kit.H, a = (m.o2 <= 0 ? 0.5 : 0.34) * (0.65 + 0.35 * Math.sin(g.real * (m.o2 <= 0 ? 7 : 4)));
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.5);
    gr.addColorStop(0, 'rgba(230,57,70,0)'); gr.addColorStop(1, `rgba(230,57,70,${Math.max(0, a)})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }

  // -------- HUD: the SUIT panel (HP, air, jet, tether, bombs and roll, backpack) --------

  function drawHUD(g, kit) {
    if (!isOut(g)) return;
    const m = st(g), A = g.astro, S = g.S, ctx = kit.ctx, C = kit.COL, T = tier(g);
    const kg = Game.kgOf(g.pack), items = Object.entries(g.pack).filter(([, q]) => q > 0);
    const teth = m.teth && g.status !== 'dead', gear = (S.bombs ?? 0) > 0 || (S.roll ?? 0) >= 1;
    let y = kit.stackLeft(26 + (teth ? 5 : 4) * 30 + 18 + (gear ? 26 : 0), T ? `SUIT · ${SUIT_NAME[T].toUpperCase()}` : 'SUIT');
    const fr = (a, b) => (b > 0 ? a / b : 0);
    kit.bar('SUIT HP', fr(A.hp, A.hpMax), 24, y, A.hp < 0.3 * A.hpMax ? C.bad : C.good, `${Math.max(0, A.hp).toFixed(0)} / ${A.hpMax}`); y += 30;
    kit.bar('AIR', fr(m.o2, S.o2), 24, y, m.o2 < O2_WARN ? C.bad : '#4cc9f0', `${Math.ceil(m.o2)} s`); y += 30;
    kit.bar(m.gov ? 'JETPACK · GOVERNOR' : 'JETPACK', fr(m.jet, S.jetFuel), 24, y, m.gov ? C.tgt : m.jet < 1 ? C.warn : '#ff9f43', `${m.jet.toFixed(1)} s`); y += 30;
    if (teth) {
      const d = Math.max(0, Math.hypot(A.x - g.sh.x, A.y - g.sh.y)), len = S.tetherLen ?? 30, taut = d > m.tLen - 0.3;
      kit.bar(m.ctl.reel ? 'TETHER · WINCHING' : taut ? 'TETHER · TAUT' : 'TETHER', fr(d, len), 24, y, taut ? C.warn : '#7cf5d6', `${d.toFixed(0)} / ${len} m`); y += 30;
    }
    if (gear) { gearRow(g, kit, m, 24, y); y += 26; }
    kit.bar('BACKPACK', fr(kg, S.packCap), 24, y, kg >= S.packCap - 0.5 ? C.bad : '#b892ff', `${kg.toFixed(0)} / ${S.packCap} kg`); y += 22;
    ctx.font = `500 12.5px ${kit.FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = items.length ? kit.INK : C.dim;
    const txt = items.length ? items.map(([k, q]) => (ITEMS[k] && ITEMS[k].kind !== 'ore' ? `${q}× ${ITEMS[k].name.toLowerCase()}` : `${q * (ITEMS[k] ? ITEMS[k].kg : 1)} kg ${k}`)).join(' · ') : 'empty: go dig something';
    ctx.fillText(kit.fit(txt, 212), 24, y);
  }

  // BOMBS ●●○  ROLL ●   (a grey pip fills up like a clock while it recharges)
  function gearRow(g, kit, m, x, y) {
    const ctx = kit.ctx, S = g.S, C = kit.COL, yy = y - 2;
    const pip = (px, col, frac) => {
      ctx.beginPath(); ctx.arc(px, yy, 6.5, 0, 2 * Math.PI); ctx.fillStyle = col || '#e9dcc0'; ctx.fill();
      if (!col && frac > 0) { ctx.beginPath(); ctx.moveTo(px, yy); ctx.arc(px, yy, 6.5, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, frac)); ctx.closePath(); ctx.fillStyle = '#c9b8e8'; ctx.fill(); }
      ctx.beginPath(); ctx.arc(px, yy, 6.5, 0, 2 * Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    };
    ctx.font = `600 12.5px ${kit.FONT}`; ctx.textAlign = 'left';
    const n = S.bombs ?? 0;
    if (n > 0) {
      ctx.fillStyle = C.dim; ctx.fillText('BOMBS', x, y + 2.5); x += 52;
      for (let i = 0; i < n; i++, x += 17) pip(x, i < m.bombsN ? '#ff5d5d' : null, i === m.bombsN ? m.bombT / (S.bombCd ?? 8) : 0);
      x += 14;
    }
    if ((S.roll ?? 0) >= 1) {
      const left = m.rollReady - g.t, cd = S.rollCd ?? 1.2;
      ctx.fillStyle = C.dim; ctx.fillText('ROLL', x, y + 2.5); x += 40;
      pip(x, left <= 0 ? '#8ff0b0' : null, 1 - left / cd);
    }
  }


  // ======================================================================
  //  REGISTER + JOBS
  // ======================================================================

  const mod = Game.register({
    id: 'eva', init, load, save, ready, respawn, died, onKey, onMouse, frame, step, after, shipCtrl,
    warpLimit, interactions, camera, hint, controls, drawWorld, drawWorldTop, drawScreen, drawHUD,
  });
  if (Game.mods.includes(mod)) Game.addGoals([
    { id: 'mine', order: 30, reward: 75, text: `Laser ${MINE_KG} kg of ore on foot (E)`,
      test: (g) => !!(g.mod.eva && g.mod.eva.hauled >= MINE_KG) },
    { id: 'spacewalk', order: 57, reward: 100, text: 'Take a tethered spacewalk (E while flying)',
      test: (g) => !!(g.mod.eva && g.mod.eva.tethT >= SPACEWALK_T) },
    { id: 'gem', order: 65, reward: 150, text: 'Bag a gem on foot (buried ones sparkle up close)',
      test: (g) => !!(g.mod.eva && g.mod.eva.gems > 0) },
    { id: 'bomb', order: 68, reward: 150, text: 'Blow a crater with a suit bomb (suit tab, then B)',
      test: (g) => !!(g.mod.eva && g.mod.eva.bombCells > 0) },
  ]);

  return { isOut, isTethered, canStepOut, stepOut, board, recall, topUp, reach, canBoard, walkMax, kickRoom, astroMass, throwSpeed,
           MINE_KG, BOARD_R, FAR_MAX, ZOOM, BODY_KG, SUIT_NAME };
})();

if (typeof module !== 'undefined') module.exports = EVA;
