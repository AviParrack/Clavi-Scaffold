// ======================================================================
//  STATIONS  —  Ceres Hub, Kiwi Outpost and Rust's on analytic circular
//  Kepler rails; docking (F), the 'hub' spawn, nav targets (the docking
//  ports), rendezvous coaching, keeper chatter and toon art.
//  API: Stations.list(g), dockedAt(g), byId(g, id), dock(g, id, instant),
//       pirateFree(g, x, y)
// ======================================================================

const Stations = (() => {

  const DOCK_R = 14;                     // dock zone around the port [m]
  const DOCK_V = 1.5;                    // max speed relative to the port [m/s]
  const WARN_R = 32;                     // "slow down" prompt inside this [m]
  const SIT = 4.6;                       // docked ship centre above the collar [m] (its legs rest on the collar)
  const CHAT_IN = 300, CHAT_OUT = 450;   // keeper chatter: say hi inside, reset the visit outside [m]
  const CHAT_GAP = 60;                   // real seconds between two lines from the same keeper
  const SAFE_R = 260;                    // pirates leave this bubble around Rust's alone [m]
  const BRAKE_R = 30;                    // final approach: brake to under DOCK_V inside this [m]
  const FAST_PASS = 8;                   // a closest approach faster than this [m/s] is too fast to stop at
  const SOFT_T = 1.5;                    // just undocked: the main engine runs at the fine throttle this long [s]
  const WARP_TTC = 30;                   // warp capped at 4x within 2 station radii, or when you pass that close this soon [s]
  const ICON_PX = 10;                    // smaller than this on screen [px radius] -> drawn as an icon
  const RING_G = 2.0, RING_R = 8.9;      // hub habitat ring: spin gravity [m/s^2] at its floor radius [m]
  const RING_W = Math.sqrt(RING_G / RING_R);                          // 0.47 rad/s = 4.5 rpm
  const INK = '#1b1433', PAPER = '#fff4dc';
  const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif';
  let on = false;                        // registered (not filtered out by ?mods=)


  // ---------------- catalogue ----------------
  //  host: body it circles · orbit(w): radius [m] · phase(w): rail angle at t = 0 · rate(w): angular rate
  //  (default Kepler, sqrt(mu / a^3)) · r: size [m]
  //  port: docking collar centre in the station frame (+y = away from the host, +x = retrograde)
  //  pdir: the way the collar faces, and so the docked nose and the undock push (default [0, 1], away from the host)
  //  push: undock push as a share of the core's (Kiwi's whole orbit is only 7.5 m/s, so the outpost pushes gently)

  const ORE = (m) => ({ ice: m, iron: m, nickel: m, platinum: m });
  const GEMS = (m) => ({ salt: m, amber: m, opal: m, voidopal: m });
  const SALV = (m) => ({ scrap: m, parts: m, core: m });

  const DEFS = [
    {
      id: 'hub', name: 'Ceres Hub', kind: 'hub', keeper: 'Dockmaster Dot', short: 'Dot',
      host: 'ceres', orbit: () => 420, phase: () => 2.75, r: 16, ext: 27, port: [13, 0], pdir: [1, 0],   // nose retrograde: W drops you
      col: '#9fd8ff', icon: ['#9fd8ff', '#4f86b8', '#e6f6ff'],
      tabs: ['services', 'sell', 'ship', 'suit'], fuelMult: 1, repairMult: 1,
      buy: { ...ORE(1), ...GEMS(1), ...SALV(1), jelly: 0.8 },
      blurb: (st) => `Fuel, fixes and fries. Circular orbit ${st.orbitR} m from Ceres' centre (${st.orbitR - st.hostBody.R} m up), ` +
        `one lap every ${lap(st.period)}. The habitat ring spins at ${(RING_W * 60 / (2 * Math.PI)).toFixed(1)} rpm, so the crew ` +
        `feels ${RING_G} m/s², Ceres-normal.`,
      hello: 'Welcome to Ceres Hub, rookie! Tap W to fly.', hi: 'Ceres Hub here. Dock any time, rookie!',
      lines: ['Easy on my paint. Under 1.5 m/s, please.', 'Prograde goes up, retrograde goes down. Really.',
              'Fuel, fixes and fries. Mostly fuel.', 'Lower orbit = faster orbit. Blame Kepler.',
              'Bring me ice, I bring you money.', 'The ring spins so the coffee stays put.'],
      bye: ['FLY SAFE!', 'BRING ICE!', 'BYE, ROOKIE!', 'MIND THE PAINT!'],
      tow: ['Towed again? I put the kettle on.', 'New ship, same pilot. Gently now.', 'The tow truck has your name on it.'],
    },
    {
      id: 'outpost', name: 'Kiwi Outpost', kind: 'outpost', keeper: 'Granny Fern', short: 'Fern',
      host: 'kiwi', orbit: () => 95, phase: () => 0.6, r: 13, ext: 16, port: [10.5, 2.3], pdir: [1, 0], push: 0.65,
      col: '#b6f07a', icon: ['#a6e06a', '#5f9a3c', '#e4ffc8'],
      tabs: ['services', 'sell', 'suit'], fuelMult: 1.25, repairMult: 1.3,
      buy: { ...ORE(0.85), ice: 1.6, ...GEMS(0.9), salt: 1.2, amber: 1.1, ...SALV(0.7), jelly: 1.4 },
      blurb: (st) => `Granny Fern's greenhouse, ${st.orbitR} m from Kiwi's centre, lapping it every ${lap(st.period)}. ` +
        'The crops drink ice and love bug-jelly compost, so both sell high here. The radiator is not a windmill.',
      hello: 'A visitor! Got any ice? My lettuce is parched.',
      lines: ['Ice in, salad out. That is farming, dear.', 'Bug jelly makes lovely compost. I pay well.',
              'That radiator is NOT a windmill.', 'Mind the rubble ring, dear. It bites.',
              'Space tomatoes! Grown in real Kiwi dirt.'],
      bye: ['TAKE A RADISH!', 'BRING ICE!', 'WRAP UP WARM!', 'MIND SEED!'],
    },
    {
      id: 'rusts', name: "Rust's", kind: 'black', keeper: 'Rust', short: 'Rust',
      host: 'ceres', needs: ['ceres', 'potato'], r: 15, ext: 18, port: [1.5, 9],
      orbit: (w) => w.byId.potato.a, phase: (w) => w.byId.potato.phase - Math.PI / 3, rate: (w) => w.byId.potato.n,   // Potato's own rail, 60° back
      col: '#ff7eb6', icon: ['#ff7eb6', '#b0306e', '#ffd6ea'], noPirates: true,
      tabs: ['services', 'sell', 'weapons'], fuelMult: 1.5, repairMult: 0.85,
      buy: { ...ORE(0.75), platinum: 0.95, ...GEMS(1.25), opal: 1.3, voidopal: 1.3, ...SALV(1.5), core: 1.4, jelly: 1.6 },
      blurb: (st, w) => `No names, no receipts. Parked at Big Potato's trailing L5 point, 60° behind it on the same ${st.orbitR} m orbit. ` +
        'Around Jupiter, L5 is stable (hello, Trojans), but Big Potato has ' +
        `${(100 * w.byId.potato.mu / (w.byId.potato.mu + st.hostBody.mu)).toFixed(1)}% of the pair's mass, past Routh's 3.85% limit, ` +
        'and Kiwi keeps tugging, so Rust station-keeps with a leaf blower. Pirates leave Rust\'s alone.',
      hello: 'No names, no receipts. Pirates stay out.',
      lines: ['Scrap, gems, jelly. I buy what others won\'t.', 'Pirates owe me money. They keep away.',
              'Guns? Orion pulse units? Cash only.', 'L5, kid. Big Potato does half the parking.',
              'It all fell off a freighter. Honest.'],
      bye: ['NO REFUNDS!', 'DON\'T GET SHOT!', 'COME BACK RICH!', 'YOU SAW NOTHING!'],
    },
  ];

  function lap(T) { return T >= 60 ? `${Math.floor(T / 60)} min ${Math.round(T % 60)} s` : `${Math.round(T)} s`; }


  // ---------------- rails (analytic circular Kepler orbits, consistent with World) ----------------

  const cache = new WeakMap();
  function list(g) {
    if (!on || !g || !g.w) return [];
    let L = cache.get(g.w);
    if (!L) cache.set(g.w, (L = DEFS.filter((d) => (d.needs || [d.host]).every((id) => g.w.byId && g.w.byId[id])).map((d) => build(g.w, d))));
    return L;
  }
  const byId = (g, id) => list(g).find((s) => s.id === id) || null;

  function build(w, d) {
    const host = w.byId[d.host], a = d.orbit(w), ph = d.phase(w), n = (d.rate && d.rate(w)) || Math.sqrt(host.mu / a ** 3);
    const st = { ...d, hostBody: host, orbitR: a, n, ph, period: 2 * Math.PI / n, blurb: '' };
    st.blurb = d.blurb(st, w);
    st.facing = (t) => n * t + ph;                              // angle host -> station; the station keeps one face to its host
    st.state = (t) => {
      const h = World.bodyState(w, host, t), th = n * t + ph, c = Math.cos(th), s = Math.sin(th);
      return [h[0] + a * c, h[1] + a * s, h[2] - a * n * s, h[3] + a * n * c];
    };
    st.local = (t, lx, ly) => {                                  // a point fixed in the station frame -> world [x, y, vx, vy]
      const [x, y, vx, vy] = st.state(t), th = n * t + ph, s = Math.sin(th), c = Math.cos(th);
      const ox = lx * s + ly * c, oy = -lx * c + ly * s;        // frame axes: x = (sin, -cos), y = (cos, sin)
      return [x + ox, y + oy, vx - n * oy, vy + n * ox];
    };
    const pd = d.pdir || [0, 1], pa = Math.atan2(pd[1], pd[0]) - Math.PI / 2;
    st.pd = pd;
    st.portAng = (t) => n * t + ph + pa;                         // where a docked nose points (and the undock push goes)
    st.portState = (t) => st.local(t, d.port[0] + pd[0] * SIT, d.port[1] + pd[1] * SIT);
    st.collar = (t) => st.local(t, d.port[0], d.port[1]);
    return st;
  }

  function toLocal(st, t, x, y) {
    const [cx, cy] = st.state(t), th = st.facing(t), s = Math.sin(th), c = Math.cos(th), dx = x - cx, dy = y - cy;
    return [dx * s - dy * c, dx * c + dy * s];
  }


  // ---------------- docking ----------------

  function econ() {
    if (typeof Econ === 'undefined' || !Econ || typeof Econ.openShop !== 'function') return null;
    return Game.mods.some((x) => x.id === 'economy' || x.id === 'shop') ? Econ : null;
  }

  function dockedAt(g) {
    return g && g.status === 'docked' && g.attach && g.attach.station ? byId(g, g.attach.station) : null;
  }

  // ship vs port: { p: port state, d: distance to port, dc: distance to centre, v: speed relative to the port }
  function portInfo(g, st) {
    const p = st.portState(g.t), [cx, cy] = st.state(g.t), sh = g.sh;
    return { p, d: Math.hypot(sh.x - p[0], sh.y - p[1]), dc: Math.hypot(sh.x - cx, sh.y - cy), v: Math.hypot(sh.vx - p[2], sh.vy - p[3]) };
  }
  const inZone = (st, q) => q.d < DOCK_R || q.dc < st.r;

  // final approach, a hint-sized version of a good pilot: close at `want` (~d / 12 at the hub: arrive in about
  //  1 / (1.7 n), before the orbit curves you off), braking down that profile into the port.
  //  'ready' to dock · 'fast' (off the profile: brake at ⊗ BRAKE) · 'drift' (too slow: burn toward the dock) · 'closing' (coast).
  //  Hysteresis (m.apk) so a pilot who stops when the hint changes does not flap between two hints.
  function approach(g, st, q) {
    const ux = g.sh.vx - q.p[2], uy = g.sh.vy - q.p[3];
    const closing = -(ux * (g.sh.x - q.p[0]) + uy * (g.sh.y - q.p[1])) / Math.max(1e-6, q.d), side = Math.sqrt(Math.max(0, q.v * q.v - closing * closing));
    const want = Math.max(0.8, Math.min(4, 1.7 * st.n * q.d)), m = g.mod.stations, was = m && m.apk && m.apk.id === st.id ? m.apk.k : null;
    let k = 'closing';
    if (inZone(st, q) && q.v < DOCK_V) k = 'ready';
    else if (was === 'fast' ? q.v > (q.d < BRAKE_R ? 1 : 0.6 * want) : q.v >= DOCK_V && (inZone(st, q) || side > Math.max(1, 0.6 * want) || closing > 1.6 * want || closing < -0.3)) k = 'fast';
    else if (was === 'drift' ? closing < 0.9 * want : closing < 0.5 * want) k = 'drift';
    return { k, closing, want, side };
  }

  function nearestPort(g) {
    let best = null;
    for (const st of list(g)) { const q = portInfo(g, st); if (!best || q.d < best.q.d) best = { st, q }; }
    return best;
  }

  function tryDock(g, st) {
    if (g.status !== 'flying' || g.mode !== 'ship') return;
    const q = portInfo(g, st);
    if (!inZone(st, q)) { Game.toast(g, `GET WITHIN ${DOCK_R} M OF THE DOCK`, '#ffb36b', 'dock'); return; }
    if (q.v >= DOCK_V) {
      Game.toast(g, `TOO FAST TO DOCK (${q.v.toFixed(1)} M/S)`, '#ff9f1c', 'dock');
      Game.popup(g, 'WHOA THERE!', '#ff9f1c');
      return;
    }
    dock(g, st);
  }

  // clamps reel the ship in along a smooth (Hermite) path, so position and velocity never jump
  function dock(g, st, instant = false) {
    if (typeof st === 'string') st = byId(g, st);
    if (!st || !g.sh) return false;
    const sh = g.sh, t0 = g.t, p0 = st.portState(t0), m = g.mod.stations;
    const dx = sh.x - p0[0], dy = sh.y - p0[1], dvx = sh.vx - p0[2], dvy = sh.vy - p0[3];
    const T = instant ? 0 : Math.min(5, Math.max(1, 0.35 * Math.hypot(dx, dy)));          // reel-in time [s]: peaks near 4 m/s
    const a0 = wrap(sh.ang - st.portAng(t0));
    const u = (t) => Math.max(0, Math.min(1, (t - t0) / T));
    Game.dock(g, {
      name: st.name, station: st.id, t0, t1: t0 + T,
      state: (t) => {
        const p = st.portState(t);
        if (!(T > 0 && t < t0 + T)) return p;
        const k = u(t), h00 = 2 * k ** 3 - 3 * k * k + 1, h10 = k ** 3 - 2 * k * k + k, d00 = (6 * k * k - 6 * k) / T, d10 = 3 * k * k - 4 * k + 1;
        return [p[0] + h00 * dx + T * h10 * dvx, p[1] + h00 * dy + T * h10 * dvy,
                p[2] + d00 * dx + d10 * dvx, p[3] + d00 * dy + d10 * dvy];
      },
      ang: (t) => { const k = T > 0 ? u(t) : 1; return st.portAng(t) + a0 * (1 - k * k * (3 - 2 * k)); },
      pushDir: (g2) => { const th = st.portAng(g2.t), k = st.push || 1; return [k * Math.cos(th), k * Math.sin(th)]; },
      onRelease: (g2) => undocked(g2, st),
    });
    if (!m) return true;
    m.pending = instant ? null : st.id; m.apk = null;
    m.visited[st.id] = true;
    if (g.navId === 'station:' + st.id) { g.navId = null; g.approach = null; }
    if (!instant) {
      m.docks++;
      const [cx, cy] = st.collar(g.t);
      Game.popup(g, 'CLUNK!', '#8ff0b0', cx, cy, 24);
      Game.log(g, `docking clamps on at ${st.name}: closed ${Math.hypot(dx, dy).toFixed(1)} m at ${Math.hypot(dvx, dvy).toFixed(2)} m/s`);
    }
    return true;
  }

  function undocked(g, st) {
    const m = g.mod.stations; if (!m) return;
    m.pending = null;
    if (st.id === 'hub') m.leftHub = true;
    m.left = { id: st.id, t: g.t };
    const [x, y] = st.collar(g.t);
    Game.popup(g, pick(st.bye, m.docks + Math.floor(g.t)), st.col, x, y, 20);
  }

  // a soft start: for SOFT_T s after the clamps let go a held W runs at the fine throttle, so "undock" is never "launch"
  function shipCtrl(g, ctrl) {
    const m = g.mod.stations; if (!m || g.mode !== 'ship' || !(ctrl.main > g.S.fine)) return;
    if (dockedAt(g) || (g.status === 'flying' && m.left && g.t - m.left.t < SOFT_T)) ctrl.main = g.S.fine;
  }

  // shop (economy), or a free top-up when no economy is loaded
  function service(g, st) {
    if (g.ui || dockedAt(g) !== st) return;
    if (g.mod.stations) g.mod.stations.pending = null;
    const E = econ();
    if (E) { if (E.openShop(g, st) !== false) Game.log(g, `shop open at ${st.name}`); return; }
    const sh = g.sh, S = g.S;
    sh.fuel = S.fuel; sh.rcs = S.rcs; sh.xe = S.ionTank || 0; sh.hull = S.hull;
    if (g.astro) g.astro.hp = g.astro.hpMax;
    Game.toast(g, `FREE REFUEL + REPAIR AT ${st.name.toUpperCase()}`, '#8ff0b0', 'svc');
    Game.log(g, `free refuel + repair at ${st.name} (no economy loaded)`);
  }

  function interactions(g) {
    if (!g.mod.stations || g.ui || g.mode !== 'ship' || g.status === 'dead') return null;
    const at = dockedAt(g);
    if (at) return [{ key: 'KeyF', dist: 0, col: '#8ff0b0', act: (g2) => service(g2, at),
                      text: econ() ? `Open ${at.name} shop` : `Refuel & repair at ${at.name} (free)` }];
    if (g.status !== 'flying') return null;
    const out = [];
    for (const st of list(g)) {
      const q = portInfo(g, st);
      if (q.d > WARN_R && q.dc > st.r + 4) continue;
      if (inZone(st, q) && q.v < DOCK_V) out.push({ key: 'KeyF', dist: q.d, col: '#8ff0b0', text: `Dock at ${st.name}`, act: (g2) => tryDock(g2, st) });
      else if (q.v >= DOCK_V && approach(g, st, q).closing > -0.3) out.push({ key: 'KeyF', dist: q.d, col: '#ffb36b', text: `Slow to under ${DOCK_V} m/s to dock (now ${q.v.toFixed(1)})`, act: (g2) => tryDock(g2, st) });
    }
    return out;
  }


  // ---------------- targeting: nav targets are the docking ports ----------------

  function navTargets(g) {
    return list(g).map((st) => ({ id: 'station:' + st.id, name: st.name, col: st.col, r: 0, kind: 'station', station: st.id, state: st.portState }));
  }
  const targeted = (g) => (g.navId && g.navId.startsWith('station:') ? byId(g, g.navId.slice(8)) : null);

  function target(g, st) {
    g.navId = 'station:' + st.id;
    Game.refresh(g);
    Game.toast(g, `TARGET: ${st.name.toUpperCase()} DOCK`, '#7cf5d6', 'nav');
  }

  // H: nearest station first, then the next one
  function onKey(g, code) {
    if (code !== 'KeyH' || g.mode !== 'ship' || g.ui || !g.mod.stations) return false;
    const L = list(g), cur = L.indexOf(targeted(g));
    if (!L.length) return false;
    let st = L[(cur + 1) % L.length];
    if (cur < 0) st = L.reduce((b, s) => (portInfo(g, s).d < portInfo(g, b).d ? s : b));
    target(g, st);
    return true;
  }

  // a click on a station picks its dock (unless a working turret wants the mouse)
  function onMouse(g, ms) {
    if (!ms.pressed || ms.button !== 0 || g.mode !== 'ship' || g.ui || (g.S && g.S.turret && typeof Combat !== 'undefined' && Combat.armed(g)) || !g.mod.stations) return false;
    const pxm = ms.px || 1;
    for (const st of list(g)) {
      const [x, y] = st.state(g.t);
      if (Math.hypot(ms.x - x, ms.y - y) > st.r * 1.3 + 12 * pxm) continue;
      if (g.navId === 'station:' + st.id) { g.navId = null; Game.refresh(g); } else target(g, st);
      return true;
    }
    return false;
  }

  // 4x only right by a station (2 radii) or when you will pass that close within WARP_TTC s: the targeted port by the
  //  predicted closest approach, any port by a straight line where one holds (nearR). Phasing orbits keep full warp.
  function warpLimit(g) {
    if (g.status !== 'flying' || g.mode !== 'ship') return null;
    const ap = g.approach, sh = g.sh;
    for (const st of list(g)) {
      const q = portInfo(g, st), R = 2 * st.r, rx = sh.x - q.p[0], ry = sh.y - q.p[1], ux = sh.vx - q.p[2], uy = sh.vy - q.p[3];
      const tca = -(rx * ux + ry * uy) / Math.max(1e-9, ux * ux + uy * uy), miss = Math.hypot(rx + ux * tca, ry + uy * tca);
      const line = q.d < nearR(st) && tca > 0 && tca < WARP_TTC && miss < R;
      const pred = ap && ap.tg && ap.tg.id === 'station:' + st.id && ap.i >= 0 && ap.d < R && ap.t - g.t < WARP_TTC;
      if (q.d < R || q.dc < R || line || pred) return { max: 4, why: `near ${st.name}` };
    }
    return null;
  }

  function pirateFree(g, x, y) {
    for (const st of list(g)) {
      if (!st.noPirates) continue;
      const [sx, sy] = st.state(g.t);
      if (Math.hypot(x - sx, y - sy) < SAFE_R) return true;
    }
    return false;
  }


  // ---------------- hints: rendezvous coaching in plain words ----------------

  function hint(g) {
    if (!g.mod.stations || g.ui || g.status === 'dead' || g.mode !== 'ship') return null;
    const at = dockedAt(g);
    if (at) return { pri: 30, text: dockedHint(g, at) };
    const st = targeted(g), ap = g.approach;
    if (!st || !ap || ap.tg.id !== 'station:' + st.id) return idleHint(g);
    if (g.status === 'landed') return { pri: 20, text: takeOffHint(g, st) };
    if (g.status !== 'flying') return null;
    const later = g.pred && g.pred.impact && g.pred.impact.t - g.t > 30;              // docking beats a far-off impact warning (80)
    if (ap.dNow < nearR(st)) return { pri: later ? 81 : 45, text: nearHint(g, st) };
    g.mod.stations.apk = null;
    return { pri: 40, text: farHint(g, st, ap) };
  }
  // straight-line coaching only where a 4 m/s approach beats the orbit's own turning (~0.7 / n): 57 m at the hub.
  // Further out the orbit curves a straight burn away, so phasing and the predicted closest approach lead instead.
  const nearR = (st) => Math.max(40, Math.min(300, 2.8 / st.n));

  function dockedHint(g, st) {
    const nose = st.pd[0] > 0.5 ? `the nose points retrograde, so W drops you toward ${st.hostBody.name}` : `the nose points away from ${st.hostBody.name}`;
    if (!g.everFlew) return `Docked at ${st.name}. Tap W to undock: ${nose}.`;
    return `Docked at ${st.name}. F: ${econ() ? 'shop' : 'free refuel'}. W: undock. Warp ( . ) while docked to wait for a good moment.`;
  }

  // on the ground: which way to tip the nose (A spins counter-clockwise) to start the right way round
  function takeOffHint(g, st) {
    const b = g.landedOn, host = st.hostBody, who = b === host ? st.name : b && b === host.par ? host.name : null;
    if (!who || !g.land) return `Take off first (hold W), then head for ${st.name}.`;
    const th = Math.atan2(g.land.ly, g.land.lx), tx = -Math.sin(th), ty = Math.cos(th);
    const dir = Math.abs(tx) > Math.abs(ty) ? (tx < 0 ? 'left' : 'right') : (ty > 0 ? 'up' : 'down');
    return `Take off (hold W), tip the nose ${dir} with A and burn sideways: ${who} goes counter-clockwise.`;
  }

  function nearHint(g, st) {
    const q = portInfo(g, st), a = approach(g, st, q), m = g.mod.stations, brake = q.d < BRAKE_R;
    m.apk = { id: st.id, k: a.k };
    if (a.k === 'ready') return `Dock zone, nice and slow: press F to dock at ${st.name}!`;
    if (a.k === 'fast') return `${a.closing > 1.6 * a.want ? 'Too fast' : 'Drifting off'}: point the nose at the ⊗ BRAKE marker and burn until relative speed < ${brake ? 1 : Math.max(1, Math.round(0.6 * a.want))} m/s.`;
    if (a.k === 'drift') return brake ? `Point at the ${st.name} dock and tap W (Shift = gentle) until closing at about ${a.want.toFixed(1)} m/s.`
                                      : `Burn toward the dock to close at about ${a.want.toFixed(0)} m/s, coast, then brake at the ⊗ BRAKE marker inside ${BRAKE_R} m.`;
    const go = `Closing at ${a.closing.toFixed(1)} m/s, ${fmt(q.d)} to go.`;
    return brake || q.v < DOCK_V ? `${go} Coast in, then press F inside ${DOCK_R} m under ${DOCK_V} m/s.` : `${go} Coast, then brake at the ⊗ BRAKE marker inside ${BRAKE_R} m.`;
  }

  function farHint(g, st, ap) {
    const o = g.orb, host = st.hostBody, shrink = 'watch the closest-approach diamond shrink.';
    const wrong = [host, host.par].find((b) => b && b === g.ref && o && o.h < -0.25 * Math.sqrt(b.mu * o.r));   // everything here orbits counter-clockwise
    if (wrong) return `Wrong way round! ${wrong === host ? st.name : host.name} goes counter-clockwise: burn at the pink marker until your orbit flips.`;
    if (ap.i >= 0 && ap.d < 60) {
      const dt = Math.max(0, ap.t - g.t).toFixed(0);
      if (!(ap.v > FAST_PASS)) return `Closest approach ${fmt(ap.d)} in ${dt} s. Coast there (warp is fine), then brake at the ⊗ BRAKE marker.`;
      const vc = Math.sqrt(g.ref.mu / o.r), fix = o.speed > 1.05 * vc ? 'Burn retrograde (pink) to round out your orbit first.'
        : o.speed < 0.95 * vc ? 'Burn prograde (yellow) to round out your orbit first.' : `Match ${st.name}'s orbit first.`;
      return `Pass in ${dt} s at ${ap.v.toFixed(0)} m/s: too fast to stop. ${fix}`;
    }
    const circle = (b) => b === g.ref && o && o.E < 0 && o.h > 0;
    if (circle(host)) {
      const R = st.orbitR, rp = o.a * (1 - o.e), ra = o.a * (1 + o.e);
      if (ra < R - 10) return `Burn prograde at the yellow marker to raise your orbit; ${shrink}`;
      if (rp > R + 10) return `Burn retrograde at the pink marker to lower your orbit; ${shrink}`;
      if (Math.abs(o.a - R) > 0.15 * R || o.e > 0.12) return `Your orbit crosses ${st.name}'s. Small prograde or retrograde taps change when you meet.`;
      const [sx, sy] = st.state(g.t), [hx, hy] = World.bodyState(g.w, host, g.t);
      const ahead = wrap(Math.atan2(sy - hy, sx - hx) - Math.atan2(g.sh.y - hy, g.sh.x - hx)), deg = Math.abs(ahead * 180 / Math.PI).toFixed(0);
      return ahead > 0 ? `${st.name} is ${deg}° ahead. Lower orbits are faster: a short retrograde burn lets you catch up.`
                       : `${st.name} is ${deg}° behind. Higher orbits are slower: a short prograde burn lets it catch up.`;
    }
    if (host.par && circle(host.par)) {
      const rp = o.a * (1 - o.e), ra = o.a * (1 + o.e);
      if (ra < host.a - 30) return `Burn prograde (yellow marker) out to ${host.name}'s orbit; ${shrink}`;
      if (rp > host.a + 30) return `Burn retrograde (pink marker) down to ${host.name}'s orbit; ${shrink}`;
      return `Your orbit reaches ${host.name}'s. Small prograde or retrograde taps change when you meet it.`;
    }
    return `Prograde (yellow) climbs, retrograde (pink) drops; ${shrink}`;
  }

  function idleHint(g) {
    if (g.navId) return null;
    if (g.status === 'landed') return cargoHint(g);
    if (g.status !== 'flying') return null;
    const np = nearestPort(g), m = g.mod.stations, landed = g.done.land_ceres !== undefined;
    if (np && m.left && m.left.id === np.st.id && np.q.d < 300 && (g.t - m.left.t < 25 || (!landed && np.st.id === 'hub')))
      return { pri: 14, text: `Free flying! Retrograde (pink marker) drops you toward ${np.st.hostBody.name}; prograde (yellow) climbs.` };
    if (np && np.q.d < 150 && landed) return { pri: 14, text: `${np.st.name} is right here: press H to target its dock, match speed, then F.` };
    if (g.S && g.sh.cargoKg >= 0.9 * g.S.cargoCap) return { pri: 12, text: 'Hold is full! Press H to target a station, fly over and dock (F) to sell.' };
    return null;
  }

  // landed with something to sell (after the mining job, or right at the pad depot): where to take it
  function cargoHint(g) {
    const E = econ(), b = g.landedOn, hub = byId(g, 'hub'), cargo = Object.keys(g.cargo);
    if (!E || !b || !cargo.length) return null;
    const pad = typeof E.padDepotNear === 'function' && E.padDepotNear(g);
    if (!pad && g.done.mine === undefined) return null;
    const got = `Got ${cargo.some((k) => CONFIG.items[k] && CONFIG.items[k].kind === 'ore') ? 'ore' : 'loot'}!`, up = hub ? `${hub.name} (H targets it)` : 'a station (H)';
    if (pad) return { pri: 36, text: `${got} Press F here at the pad to sell, or fly up to ${up} for better prices.` };
    if (hub && b === hub.hostBody) return { pri: 36, text: `${got} Fly up to ${up} and dock to sell. The launch pad depot buys it too.` };
    return { pri: 36, text: `${got} Press H to target a station, fly over and dock (F) to sell.` };
  }

  function controls(g) {
    if (!dockedAt(g) || g.mode !== 'ship') return null;
    return `tap W: undock · F ${econ() ? 'shop' : 'refuel'} · H / Tab target · , . warp · M map · wheel zoom · P pause`;
  }


  // ---------------- chatter: each keeper says hi once per visit ----------------

  function chatter(g, m) {
    if (g.ui || g.status === 'dead') return;
    const me = g.astro && g.astro.on ? g.astro : g.sh;
    for (const st of list(g)) {
      const [x, y] = st.state(g.t), d = Math.hypot(me.x - x, me.y - y);
      if (d > CHAT_OUT) { m.near[st.id] = false; continue; }
      if (d > CHAT_IN || m.near[st.id]) continue;
      m.near[st.id] = true;
      if (g.real - (m.chatAt[st.id] ?? -1e9) < CHAT_GAP) continue;
      say(g, st, m.met[st.id] ? nextLine(m, st) : st.hi && dockedAt(g) !== st ? st.hi : st.hello);   // "tap W to fly" only to a docked rookie
      m.met[st.id] = true;
    }
  }
  function nextLine(m, st) { const i = (m.line[st.id] || 0) % st.lines.length; m.line[st.id] = i + 1; return st.lines[i]; }
  function say(g, st, line) {
    g.mod.stations.chatAt[st.id] = g.real;
    Game.toast(g, `${st.short}: "${line}"`, st.col, 'chat');
    Game.log(g, `${st.keeper}: ${line}`);
  }
  const pick = (arr, k) => arr[Math.abs(Math.floor(k)) % arr.length];


  // ---------------- lifecycle ----------------

  function init(g) {
    g.mod.stations = { met: {}, visited: {}, line: {}, docks: 0, leftHub: false, pending: null, near: {}, chatAt: {}, left: null };
  }

  function after(g) {
    const m = g.mod.stations; if (!m) return;
    if (m.pending) {
      const at = dockedAt(g);
      if (!at || at.id !== m.pending) m.pending = null;
      else if (!g.ui && g.t >= g.attach.t1) { m.pending = null; service(g, at); }
    }
    chatter(g, m);
  }

  function respawn(g, why) {
    const m = g.mod.stations; if (!m) return;
    m.pending = null; m.near = {}; m.left = null;
    const at = dockedAt(g);
    if (!at) return;
    m.near[at.id] = true;
    if (at.tow) say(g, at, pick(at.tow, m.docks + g.real * 7 + (why === 'crash' ? 1 : 0)));
  }
  function died(g) { if (g.mod.stations) g.mod.stations.pending = null; }

  function save(g) {
    const m = g.mod.stations; if (!m) return undefined;
    return { met: m.met, visited: m.visited, line: m.line, docks: m.docks, leftHub: m.leftHub };
  }
  function load(g, d) {
    const m = g.mod.stations; if (!m || !d || typeof d !== 'object') return;
    const ids = DEFS.map((x) => x.id);
    for (const k of ['met', 'visited']) if (d[k] && typeof d[k] === 'object') for (const id of ids) if (d[k][id]) m[k][id] = true;
    if (d.line && typeof d.line === 'object') for (const id of ids) if (Number.isFinite(d.line[id])) m.line[id] = Math.max(0, Math.floor(d.line[id]));
    if (Number.isFinite(d.docks)) m.docks = Math.max(0, Math.floor(d.docks));
    m.leftHub = !!d.leftHub;
  }


  // ======================================================================
  //  ART  —  world space, y up.  Each station is drawn in its own frame:
  //  +y = away from its host, so the docking collar is always on top.
  // ======================================================================

  function drawWorld(g, kit) {
    if (!g.mod.stations) return;
    const view = kit.viewRect(40), at = dockedAt(g), zoom = kit.cam.zoom;
    for (const st of list(g)) {
      const [x, y] = st.state(g.t), ext = st.ext + 12;
      if (x + ext < view[0] || x - ext > view[2] || y + ext < view[1] || y - ext > view[3]) continue;
      const rs = st.r * zoom, fade = Math.max(0, Math.min(1, (rs - ICON_PX) / (0.6 * ICON_PX)));
      if (fade < 1) drawIcon(g, kit, st, x, y, 1 - fade);
      if (fade > 0) drawStation(g, kit, st, x, y, at === st, rs, fade);
    }
    if (at && g.attach && g.t < g.attach.t1) drawTractor(g, kit, at);
  }

  function drawStation(g, kit, st, x, y, docked, rs, alpha) {
    const c = kit.ctx, th = st.facing(g.t);
    c.save(); c.globalAlpha = alpha;
    c.translate(x, y); c.rotate(th - Math.PI / 2);
    const P = pen(g, kit, st, th, rs, docked);
    ART[st.id](P);
    c.restore();
  }

  function pen(g, kit, st, th, rs, docked) {
    const Lw = kit.LIGHT, s = Math.sin(th), c = Math.cos(th), px = kit.px();
    const ship = g.status !== 'dead' ? toLocal(st, g.t, g.sh.x, g.sh.y) : [0, 40];
    const flying = g.status === 'flying' && g.mode === 'ship';
    return { c: kit.ctx, px, lw: 2.5 * px, thin: Math.max(0.1, 1.2 * px), L: [Lw[0] * s - Lw[1] * c, Lw[0] * c + Lw[1] * s],
             t: g.real, T: g.t, detail: rs > 45, docked, ship, st,
             beckon: flying && Math.hypot(ship[0] - st.port[0], ship[1] - st.port[1]) < 160 };
  }

  // ---------------- toon helpers (flat base, shadow band away from the light, highlight, ink) ----------------

  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function ink(P, w = P.lw) { const c = P.c; c.strokeStyle = INK; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }

  function toon(P, path, cols, k, hi) {
    const c = P.c;
    path(); c.fillStyle = cols[1]; c.fill();
    c.save(); path(); c.clip();
    c.save(); c.translate(P.L[0] * k, P.L[1] * k); path(); c.fillStyle = cols[0]; c.fill(); c.restore();
    if (hi && cols[2]) { c.fillStyle = cols[2]; hi(); }
    c.restore();
    path(); ink(P);
  }
  function box(P, x, y, w, h, r, cols, k = Math.min(w, h) * 0.22) {
    toon(P, () => rr(P.c, x, y, w, h, r), cols, k, () => {
      const m = Math.min(w, h), hx = x + w / 2 + P.L[0] * (w / 2 - m * 0.28), hy = y + h / 2 + P.L[1] * (h / 2 - m * 0.28);
      P.c.beginPath(); P.c.ellipse(hx, hy, m * 0.16, m * 0.09, Math.atan2(P.L[1], P.L[0]) + Math.PI / 2, 0, 2 * Math.PI); P.c.fill();
    });
  }
  function disc(P, x, y, R, cols) {
    toon(P, () => { P.c.beginPath(); P.c.arc(x, y, R, 0, 2 * Math.PI); }, cols, R * 0.3, () => {
      P.c.beginPath(); P.c.ellipse(x + P.L[0] * R * 0.48, y + P.L[1] * R * 0.48, R * 0.26, R * 0.15, Math.atan2(P.L[1], P.L[0]) + Math.PI / 2, 0, 2 * Math.PI); P.c.fill();
    });
  }
  // draw fn(Q) in a frame rotated by a about (x, y); Q's light (and the ship the faces watch) are turned to match
  function turned(P, x, y, a, fn) {
    const c = P.c, s = Math.sin(a), co = Math.cos(a), sx = P.ship[0] - x, sy = P.ship[1] - y;
    c.save(); c.translate(x, y); c.rotate(a);
    fn({ ...P, L: [P.L[0] * co + P.L[1] * s, -P.L[0] * s + P.L[1] * co], ship: [sx * co + sy * s, -sx * s + sy * co] });
    c.restore();
  }
  function text(P, str, x, y, size, col, weight = 700, outline = 0) {
    const c = P.c, k = size / 20;
    c.save(); c.translate(x, y); c.scale(k, -k);
    c.font = `${weight} 20px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (outline) { c.lineWidth = outline / k; c.strokeStyle = INK; c.lineJoin = 'round'; c.strokeText(str, 0, 0); }
    c.fillStyle = col; c.fillText(str, 0, 0);
    c.restore();
  }
  function glow(P, x, y, R, rgb, a) {
    const c = P.c, gr = c.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, R, 0, 2 * Math.PI); c.fill();
  }
  function light(P, x, y, rgb, onNow, R = 0.75) {
    if (onNow) glow(P, x, y, R * 5, rgb, 0.7);
    const c = P.c; c.beginPath(); c.arc(x, y, Math.max(R, 2.2 * P.px), 0, 2 * Math.PI);
    c.fillStyle = onNow ? `rgb(${rgb})` : '#5a4f74'; c.fill(); ink(P, P.lw * 0.7);
  }
  function cable(P, x0, y0, x1, y1) { const c = P.c; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); ink(P, Math.max(0.18, 1.6 * P.px)); }
  function pipe(P, pts, w, col) {
    const c = P.c, path = () => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 4) c.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); };
    path(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = w + 2 * P.lw; c.stroke();
    path(); c.strokeStyle = col; c.lineWidth = w; c.stroke();
  }

  // a cute face: eyes look toward (lx, ly) in the current frame, blink now and then
  function face(P, x, y, s, look, blinkOff = 0, mouth = 'smile') {
    const c = P.c, d = Math.hypot(look[0] - x, look[1] - y) || 1, ex = (look[0] - x) / d * s * 0.09, ey = (look[1] - y) / d * s * 0.07;
    const blink = (P.t + blinkOff) % 4.3 < 0.14;
    c.fillStyle = 'rgba(255,120,150,0.45)';
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(x + sx * s * 0.5, y - s * 0.12, s * 0.17, s * 0.1, 0, 0, 2 * Math.PI); c.fill(); }
    for (const sx of [-1, 1]) {
      const cx = x + sx * s * 0.27 + ex, cy = y + s * 0.12 + ey;
      if (blink) { c.beginPath(); c.moveTo(cx - s * 0.12, cy); c.lineTo(cx + s * 0.12, cy); ink(P, s * 0.07); continue; }
      c.fillStyle = INK; c.beginPath(); c.ellipse(cx, cy, s * 0.11, s * 0.14, 0, 0, 2 * Math.PI); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx - s * 0.04, cy + s * 0.05, s * 0.04, 0, 2 * Math.PI); c.fill();
    }
    c.beginPath();
    if (mouth === 'smile') c.arc(x, y - s * 0.12, s * 0.15, Math.PI * 1.15, Math.PI * 1.85);
    else { c.moveTo(x - s * 0.12, y - s * 0.2); c.lineTo(x + s * 0.12, y - s * 0.16); }
    ink(P, s * 0.06);
  }

  // glowing docking collar with hazard stripes; chevrons beckon an approaching ship
  function collar(P, x, top, w) {
    const c = P.c, h = 1.6, y = top - h, pulse = 0.55 + 0.45 * Math.sin(P.t * 3.2);
    glow(P, x, top, 7, P.docked ? '143,240,176' : '124,245,214', 0.25 + 0.35 * pulse);
    toon(P, () => rr(c, x - w / 2, y, w, h, 0.5), ['#ffd166', '#c9961f', '#fff3c4'], 0.45, null);
    c.save(); rr(c, x - w / 2, y, w, h, 0.5); c.clip(); c.fillStyle = INK;
    for (let sx = x - w / 2 - h; sx < x + w / 2 + h; sx += 1.3) { c.beginPath(); c.moveTo(sx, y); c.lineTo(sx + 0.55, y); c.lineTo(sx + 0.55 + h, top); c.lineTo(sx + h, top); c.closePath(); c.fill(); }
    c.restore(); rr(c, x - w / 2, y, w, h, 0.5); ink(P);
    for (const s of [-1, 1]) light(P, x + s * (w / 2 + 0.3), top - 0.2, P.docked ? '143,240,176' : '124,245,214', (P.t * 2 + (s > 0 ? 0.5 : 0)) % 1 < 0.5, 0.45);
    if (!P.beckon || P.docked) return;
    for (let i = 0; i < 3; i++) {                                // "dock here" chevrons drifting outward
      const f = ((P.t * 0.8 + i / 3) % 1), cy = top + 2 + f * 7;
      c.strokeStyle = `rgba(124,245,214,${(1 - f) * 0.85})`; c.lineWidth = 0.55; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x - 1.6, cy - 0.9); c.lineTo(x, cy); c.lineTo(x + 1.6, cy - 0.9); c.stroke();
    }
  }

  // round window with the keeper peeking out
  function porthole(P, x, y, R, skin, extra) {
    const c = P.c;
    disc(P, x, y, R * 1.25, ['#d9d4f2', '#8f88b8', '#ffffff']);
    c.beginPath(); c.arc(x, y, R, 0, 2 * Math.PI); c.fillStyle = '#2a2350'; c.fill();
    c.save(); c.beginPath(); c.arc(x, y, R, 0, 2 * Math.PI); c.clip();
    const bob = Math.sin(P.t * 1.7 + x) * R * 0.05;
    c.beginPath(); c.arc(x, y - R * 0.35 + bob, R * 0.82, 0, 2 * Math.PI); c.fillStyle = skin; c.fill(); ink(P, P.lw * 0.8);
    if (extra) extra(x, y - R * 0.35 + bob, R * 0.82);
    face(P, x, y - R * 0.25 + bob, R * 0.95, P.ship, x);
    c.fillStyle = 'rgba(190,240,255,0.25)'; c.beginPath(); c.arc(x, y, R, 0, 2 * Math.PI); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(x + P.L[0] * R * 0.45, y + P.L[1] * R * 0.45, R * 0.28, R * 0.13, Math.atan2(P.L[1], P.L[0]) + Math.PI / 2, 0, 2 * Math.PI); c.fill();
    c.restore();
    c.beginPath(); c.arc(x, y, R, 0, 2 * Math.PI); ink(P);
  }


  // ---------------- Ceres Hub: spinning habitat ring, solar wings, nav lights, a sign ----------------
  //  The long truss hangs radially (a long body in orbit settles that way: the gravity gradient), and the
  //  dock faces retrograde (+x), so a docked nose points retrograde and W gently drops you toward Ceres.

  const GREY = ['#bdb7da', '#7d77a3', '#efedff'], CREAM = ['#ffe0a3', '#d29a52', '#fff6dc'];
  const PANEL = ['#4f78e0', '#2c4699', '#bcd2ff'], RINGC = ['#eeeaff', '#a99fd4', '#ffffff'];

  function artHub(P) {
    const c = P.c;
    box(P, -19.6, -0.5, 14, 1, 0.4, GREY);                           // sign boom, on the prograde side
    pipe(P, [-4.6, 2.8, -7.6, 4.4, -10.4, 7.4], 0.45, '#cfc9ec');      // antenna with a strobe
    turned(P, -10.7, 7.8, 0.75, (Q) => toon(Q, () => { c.beginPath(); c.ellipse(0, 0, 1.6, 0.7, 0, Math.PI, 2 * Math.PI); c.closePath(); }, GREY, 0.3, null));
    light(P, -11.3, 9.0, '255,255,255', P.t % 2 < 0.12, 0.45);
    turned(P, 0, 0, -Math.PI / 2, hubBody);                          // drawn with the truss along x and the collar up, turned a quarter
    if (P.detail) porthole(P, 1.6, 0, 2.0, '#ffb3c7', (x, y, R) => {      // Dot wears a headset (upright: her up is away from Ceres)
      c.beginPath(); c.arc(x, y + R * 0.15, R * 0.95, Math.PI * 0.15, Math.PI * 0.85); ink(P, R * 0.12);
      c.beginPath(); c.arc(x + R * 0.9, y - R * 0.05, R * 0.18, 0, 2 * Math.PI); c.fillStyle = '#ff9f1c'; c.fill();
    });
    else disc(P, 1.6, 0, 2.0, ['#7fe0ff', '#3d8fb8', '#ffffff']);
    if (P.detail) hubSign(P, -16.5, -0.5);
  }

  function hubBody(P) {
    const c = P.c, spin = RING_W * P.T;
    box(P, -24, -0.7, 48, 1.4, 0.5, GREY);                           // truss
    if (P.detail) { c.beginPath(); for (let x = -23; x < 23; x += 2) { c.moveTo(x, -0.7); c.lineTo(x + 1, 0.7); c.lineTo(x + 2, -0.7); } ink(P, P.thin); }
    for (const s of [-1, 1]) for (const v of [-1, 1]) wing(P, s, v);
    for (let k = 0; k < 4; k++) {                                    // spokes, turning with the ring
      const a = spin + k * Math.PI / 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
      pipe(P, [3.8 * ca, 3.8 * sa, 6 * ca, 6 * sa, 8 * ca, 8 * sa], 1.1, '#cfc9ec');
    }
    toon(P, () => { c.beginPath(); c.arc(0, 0, 10.4, 0, 2 * Math.PI); c.moveTo(7.6, 0); c.arc(0, 0, 7.6, 0, 2 * Math.PI, true); }, RINGC, 1.1, null);
    for (let k = 0; k < 12; k++) {                                   // ring windows and seams
      const a = spin + k * Math.PI / 6, ca = Math.cos(a), sa = Math.sin(a);
      if (P.detail) turned(P, RING_R * ca, RING_R * sa, a, () => { rr(c, -0.55, -0.7, 1.1, 1.4, 0.3); c.fillStyle = k % 3 ? '#ffe066' : '#7fe0ff'; c.fill(); ink(P, P.thin); });
      if (k % 3 === 0) { c.beginPath(); c.moveTo(7.6 * ca, 7.6 * sa); c.lineTo(10.4 * ca, 10.4 * sa); ink(P, P.lw * 0.8); }
    }
    box(P, -4.3, -6.6, 8.6, 13.2, 3.4, CREAM);                       // core
    c.beginPath(); c.moveTo(-4.3, -2.6); c.lineTo(4.3, -2.6); ink(P, P.lw * 0.8);
    for (const s of [-1, 1]) { rr(c, s * 2.1 - 0.7, -5, 1.4, 1.5, 0.4); c.fillStyle = '#ffe066'; c.fill(); ink(P, P.lw * 0.7); }
    box(P, -1.5, 6.4, 3, 5.2, 0.6, GREY);                            // neck
    collar(P, 0, 13, 7);
    const blink = P.t % 1.4;                                         // nav lights: red one tip, green the other
    light(P, -24.6, 0, '255,93,93', blink < 0.6);
    light(P, 24.6, 0, '120,240,140', blink > 0.7 && blink < 1.3);
  }

  function wing(P, s, v) {
    const c = P.c, x0 = s > 0 ? 12.5 : -23.5, y0 = v > 0 ? 1.0 : -5.6, w = 11, h = 4.6;
    box(P, x0, y0, w, h, 0.5, PANEL, 0.9);
    if (!P.detail) return;
    c.beginPath();
    for (let i = 1; i < 5; i++) { c.moveTo(x0 + i * w / 5, y0); c.lineTo(x0 + i * w / 5, y0 + h); }
    c.moveTo(x0, y0 + h / 2); c.lineTo(x0 + w, y0 + h / 2);
    c.strokeStyle = 'rgba(27,20,51,0.5)'; c.lineWidth = P.thin; c.stroke();
    c.save(); rr(c, x0, y0, w, h, 0.5); c.clip();                    // sheen sweeping across the cells
    const sx = x0 - 4 + ((P.t * 2.2 + s * 3 + v) % 22);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.moveTo(sx, y0); c.lineTo(sx + 1.6, y0); c.lineTo(sx + 3.2, y0 + h); c.lineTo(sx + 1.6, y0 + h); c.fill();
    c.restore();
  }

  // hangs from the boom toward Ceres (the gravity gradient points down there)
  function hubSign(P, x, y) {
    const c = P.c, sway = Math.sin(P.t * 0.7) * 0.04;
    turned(P, x, y, sway, (Q) => {
      cable(Q, -2.6, 0, -5.2, -6.4); cable(Q, 2.6, 0, 5.2, -6.4);
      rr(c, -7.8, -11.4, 15.6, 5, 1); c.fillStyle = PAPER; c.fill(); ink(Q);
      rr(c, -7.8, -11.4, 15.6, 1.2, 0.6); c.fillStyle = '#ffe2b0'; c.fill();
      text(Q, 'CERES HUB', 0, -8.1, 2.5, INK);
      text(Q, 'fuel · fixes · fries', 0, -10.4, 1.05, '#6d5f8a', 600);
    });
  }


  // ---------------- Kiwi Outpost: greenhouse dome, water tank, a radiator that is NOT a windmill ----------------

  const DECK = ['#e2c78f', '#a2834f', '#fff2cc'], WATER = ['#9fdcff', '#4e93c9', '#eefaff'];
  const RADI = ['#f6f2ff', '#b9b2d9', '#ffffff'];

  function artOutpost(P) {
    const c = P.c;
    radiator(P, 5.4, -7.2, 5.8);
    box(P, -10.4, -7.6, 11.6, 4.2, 2.1, WATER);                      // water tank
    for (const sx of [-8, -1.6]) { rr(c, sx, -7.9, 1, 4.8, 0.3); c.fillStyle = '#8e88b0'; c.fill(); ink(P, P.lw * 0.8); }
    if (P.detail) {
      waterDrop(P, -4.8, -5.5, 1.1);
      text(P, 'H₂O', -6.5 + 3.4, -5.4, 1.3, '#1f4f7a');
    }
    box(P, -12, -3.4, 22.5, 3.4, 1.1, DECK);                         // deck
    if (P.detail) {
      c.beginPath(); for (let x = -9; x < 10; x += 3) { c.moveTo(x, -3.4); c.lineTo(x, -2.5); } ink(P, P.thin);
      text(P, 'KIWI OUTPOST', -1.2, -1.75, 1.35, '#5c4320');
    }
    dome(P, -3, 0, 7.4);
    box(P, 6.3, 0, 2.6, 4.6, 0.6, GREY);                             // dock tower, its collar facing retrograde (+x)
    if (P.detail) porthole(P, 7.6, 2.3, 1.05, '#ffd8b8', (x, y, R) => {   // Granny Fern: silver bun, round glasses
      c.beginPath(); c.arc(x, y + R * 0.95, R * 0.45, 0, 2 * Math.PI); c.fillStyle = '#eeeaf6'; c.fill(); ink(P, R * 0.1);
      for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * R * 0.27, y + R * 0.08, R * 0.22, 0, 2 * Math.PI); ink(P, R * 0.07); }
    });
    turned(P, 0, 2.3, -Math.PI / 2, (Q) => collar(Q, 0, 10.5, 4.6));
    pipe(P, [7.6, 4.6, 7.6, 5.6, 7.6, 6.6], 0.3, '#cfc9ec');           // tower-top beacon
    light(P, 7.6, 6.9, '182,240,122', P.t % 1.8 > 0.9, 0.45);
    pipe(P, [-12, -1.6, -13.6, -1.6, -14.2, 1.4], 0.35, '#cfc9ec');     // little mast with a light
    light(P, -14.2, 1.9, '182,240,122', P.t % 1.8 < 0.9, 0.5);
  }

  function dome(P, cx, cy, R) {
    const c = P.c, path = () => { c.beginPath(); c.arc(cx, cy, R, 0, Math.PI); c.closePath(); };
    c.save(); path(); c.clip();
    c.fillStyle = '#284c4a'; c.fillRect(cx - R, cy, 2 * R, R);
    const gr = c.createRadialGradient(cx, cy + R, 0, cx, cy + R, R * 1.2);    // pink grow lights
    gr.addColorStop(0, 'rgba(255,120,220,0.55)'); gr.addColorStop(1, 'rgba(255,120,220,0)');
    c.fillStyle = gr; c.fillRect(cx - R, cy, 2 * R, R);
    c.fillStyle = '#7a4f2e'; c.fillRect(cx - R, cy, 2 * R, 1.3);
    if (P.detail) plants(P, cx, cy + 1.2, R);
    c.restore();
    path(); c.fillStyle = 'rgba(205,245,255,0.16)'; c.fill();
    c.beginPath();                                                   // glass ribs
    for (const k of [0.38, 0.78]) c.ellipse(cx, cy, R * k, R, 0, 0, Math.PI);
    c.moveTo(cx - R * 0.93, cy + R * 0.38); c.quadraticCurveTo(cx, cy + R * 0.52, cx + R * 0.93, cy + R * 0.38);
    c.strokeStyle = 'rgba(27,20,51,0.55)'; c.lineWidth = Math.max(0.14, 1.4 * P.px); c.stroke();
    const la = Math.max(0.35, Math.min(Math.PI - 0.35, Math.atan2(P.L[1], P.L[0])));   // shine on the lit side
    c.beginPath(); c.arc(cx, cy, R * 0.84, la - 0.32, la + 0.32); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = R * 0.07; c.lineCap = 'round'; c.stroke();
    path(); ink(P);
  }

  function plants(P, x0, y0, R) {
    const c = P.c, H = [2.4, 3.6, 5.2, 3.4, 2.2], X = [-5.2, -2.7, 0, 2.6, 4.9];
    X.forEach((dx, i) => {
      const a = 0.07 * Math.sin(P.t * 1.1 + i * 1.7), h = H[i], tx = x0 + dx - Math.sin(a) * h, ty = y0 + Math.cos(a) * h;
      c.beginPath(); c.moveTo(x0 + dx, y0); c.quadraticCurveTo(x0 + dx, y0 + h * 0.6, tx, ty); ink(P, 0.5); c.strokeStyle = '#5fbf4a'; c.lineWidth = 0.28; c.stroke();
      for (const s of [-1, 1]) {
        const lx = x0 + dx + s * 0.75 - Math.sin(a) * h * 0.5, ly = y0 + h * 0.45 + (s > 0 ? 0.3 : 0);
        c.beginPath(); c.ellipse(lx, ly, 0.8, 0.38, s * 0.5, 0, 2 * Math.PI); c.fillStyle = '#7fd35a'; c.fill(); ink(P, P.lw * 0.6);
      }
      if (i === 2) {                                                 // the sunflower watches you
        c.fillStyle = '#ffd34d';
        for (let k = 0; k < 10; k++) { const b = k / 10 * 2 * Math.PI; c.beginPath(); c.ellipse(tx + Math.cos(b) * 1.0, ty + Math.sin(b) * 1.0, 0.55, 0.3, b, 0, 2 * Math.PI); c.fill(); }
        c.beginPath(); c.arc(tx, ty, 0.95, 0, 2 * Math.PI); c.fillStyle = '#9a5a2a'; c.fill(); ink(P, P.lw * 0.6);
        face(P, tx, ty, 1.5, P.ship, 1.3);
      } else if (i % 2) {
        for (const s of [-1, 1]) { c.beginPath(); c.arc(tx + s * 0.5, ty - 0.2, 0.42, 0, 2 * Math.PI); c.fillStyle = '#ff5d5d'; c.fill(); ink(P, P.lw * 0.5); }
      } else { c.beginPath(); c.arc(tx, ty, 0.55, 0, 2 * Math.PI); c.fillStyle = '#9be36b'; c.fill(); ink(P, P.lw * 0.5); }
    });
  }

  function radiator(P, x, y, L) {
    const c = P.c;
    box(P, x - 0.45, y, 0.9, -3.4 - y, 0.3, GREY);                     // post
    if (P.detail && P.px < 0.12) { rr(c, x - 2.7, y + 1.05, 5.4, 1.1, 0.3); c.fillStyle = PAPER; c.fill(); ink(P, P.thin); text(P, 'NOT A WINDMILL', x, y + 1.6, 0.6, INK); }
    for (let k = 0; k < 4; k++) {
      turned(P, x, y, P.T * 0.22 + k * Math.PI / 2, (Q) => {
        box(Q, 0.7, -0.75, L, 1.5, 0.45, RADI, 0.35);
        if (!P.detail) return;
        c.beginPath(); for (let f = 1.6; f < L; f += 0.9) { c.moveTo(f, -0.55); c.lineTo(f, 0.55); }
        c.strokeStyle = '#ff8a5c'; c.lineWidth = 0.22; c.stroke();
      });
    }
    disc(P, x, y, 1, GREY);
  }

  function waterDrop(P, x, y, s) {
    const c = P.c;
    c.beginPath(); c.moveTo(x, y + s * 1.4); c.bezierCurveTo(x + s * 0.2, y + s * 0.8, x + s, y + s * 0.2, x + s * 0.8, y - s * 0.4);
    c.arc(x, y - s * 0.3, s * 0.82, -0.12, Math.PI + 0.12, true); c.bezierCurveTo(x - s, y + s * 0.2, x - s * 0.2, y + s * 0.8, x, y + s * 1.4);
    c.fillStyle = '#3fa4ff'; c.fill(); ink(P, P.lw * 0.8);
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - s * 0.35, y - s * 0.1, s * 0.15, s * 0.28, 0.3, 0, 2 * Math.PI); c.fill();
  }


  // ---------------- Rust's: a junk pile with a skull flag, neon sign and hanging scrap ----------------

  const RUST = ['#d2733f', '#8a3f22', '#ffb27a'], TEAL = ['#6fb5ab', '#3b7169', '#c4efe8'];
  const PURP = ['#9a84c4', '#5c4a87', '#e2d8ff'], TIRE = ['#3b3448', '#1f1a2a', '#6e6584'];

  function artRust(P) {
    const c = P.c;
    hangingScrap(P);
    pipe(P, [-9.2, 0.8, -13.8, 3.6, -10.2, 7.6], 1.3, '#a59fbd');      // bent pipe
    turned(P, -11.4, -4.8, 0.55, (Q) => {                             // dish, askew
      cable(Q, 0, 0, 2.2, 1.6);
      toon(Q, () => { c.beginPath(); c.ellipse(0, 0, 2.4, 1.1, 0, Math.PI, 2 * Math.PI); c.closePath(); }, GREY, 0.4, null);
    });
    turned(P, -1.5, -1.6, -0.07, (Q) => {                             // main container
      box(Q, -7.5, -3.5, 15, 7, 0.8, RUST, 1.4);
      if (!P.detail) return;
      c.beginPath(); for (let x = -6.3; x < 7; x += 1.2) { c.moveTo(x, -3.1); c.lineTo(x, 3.1); } c.strokeStyle = 'rgba(27,20,51,0.35)'; c.lineWidth = P.thin; c.stroke();
      rr(c, -4.6, -2.4, 3.2, 2.4, 0.2); c.fillStyle = '#9c5a3c'; c.fill(); ink(Q, P.lw * 0.7);         // patch
      c.fillStyle = INK; for (const [rx, ry] of [[-4.2, -2], [-1.8, -2], [-4.2, -0.4], [-1.8, -0.4]]) { c.beginPath(); c.arc(rx, ry, 0.16, 0, 2 * Math.PI); c.fill(); }
      c.beginPath(); c.moveTo(4.6, -3.5); c.lineTo(4.6, 3.5); c.moveTo(5.4, -0.6); c.lineTo(5.4, 0.6); ink(Q, P.lw * 0.8);
    });
    turned(P, 8.5, -1.4, 0.18, (Q) => {                                // a barrel of pulse units
      box(Q, -1.9, -3.2, 3.8, 6.4, 1, PURP);
      if (!P.detail) return;
      c.beginPath(); c.arc(0, 0.2, 1.15, 0, 2 * Math.PI); c.fillStyle = '#ffd166'; c.fill(); ink(Q, P.lw * 0.6);
      c.fillStyle = INK;
      for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + k * 2 * Math.PI / 3; c.beginPath(); c.moveTo(0, 0.2); c.arc(0, 0.2, 0.95, a - 0.5, a + 0.5); c.closePath(); c.fill(); }
      c.fillStyle = '#ffd166'; c.beginPath(); c.arc(0, 0.2, 0.25, 0, 2 * Math.PI); c.fill();
    });
    turned(P, -1.2, 4.1, 0.11, (Q) => {                                // teal container + Rust in the doorway
      box(Q, -5.25, -2.2, 10.5, 4.4, 0.6, TEAL, 0.9);
      rr(c, -4.3, -1.8, 2.6, 3.3, 0.4); c.fillStyle = '#120d1e'; c.fill(); ink(Q, P.lw * 0.8);
      const blink = (P.t + 1.1) % 3.7 < 0.15, look = Math.sign(P.ship[0] + 1.2) * 0.2;
      for (const s of [-1, 1]) {
        c.beginPath();
        if (blink) c.ellipse(-3 + s * 0.5 + look, 0.3, 0.35, 0.06, 0, 0, 2 * Math.PI);
        else c.ellipse(-3 + s * 0.5 + look, 0.3, 0.28, 0.4, 0, 0, 2 * Math.PI);
        c.fillStyle = '#ffe066'; c.fill();
      }
      if (P.detail) { c.beginPath(); for (let x = 0; x < 5; x += 1.1) { c.moveTo(x, -1.9); c.lineTo(x, 1.9); } c.strokeStyle = 'rgba(27,20,51,0.3)'; c.lineWidth = P.thin; c.stroke(); }
    });
    cone(P, -3.2, 7.1);
    skullFlag(P, -5.4, 5.6, 12.6);
    box(P, 0.6, 6.2, 1.8, 1.4, 0.3, GREY);                             // stub under the tire
    tireCollar(P, 1.5, 9, 5.8);
    neon(P, 9.3, 4.3);
  }

  // the docking collar is an old tyre
  function tireCollar(P, x, top, w) {
    const c = P.c, h = 1.6, y = top - h, pulse = 0.55 + 0.45 * Math.sin(P.t * 3.2);
    glow(P, x, top, 7, P.docked ? '143,240,176' : '255,126,182', 0.2 + 0.3 * pulse);
    box(P, x - w / 2, y, w, h, 0.8, TIRE, 0.45);
    c.beginPath(); for (let tx = x - w / 2 + 0.7; tx < x + w / 2 - 0.4; tx += 0.75) { c.moveTo(tx, y + 0.25); c.lineTo(tx + 0.3, top - 0.25); }
    c.strokeStyle = '#6e6584'; c.lineWidth = 0.18; c.stroke();
    c.beginPath(); c.moveTo(x - w / 2 + 0.5, y + h / 2); c.lineTo(x + w / 2 - 0.5, y + h / 2); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.22; c.stroke();
    if (!P.beckon || P.docked) return;
    for (let i = 0; i < 3; i++) {
      const f = (P.t * 0.8 + i / 3) % 1, cy = top + 2 + f * 7;
      c.strokeStyle = `rgba(255,126,182,${(1 - f) * 0.85})`; c.lineWidth = 0.55; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - 1.6, cy - 0.9); c.lineTo(x, cy); c.lineTo(x + 1.6, cy - 0.9); c.stroke();
    }
  }

  // Apollo-style: a rod along the top holds the flag out (no wind up here)
  function skullFlag(P, x, y0, top) {
    const c = P.c, w = -5.2, h = 3.6, rip = (u) => 0.22 * Math.sin(u * 5 + P.t * 2.4) * u;
    box(P, x - 0.25, y0, 0.5, top - y0 + 0.4, 0.2, GREY);
    c.beginPath(); c.moveTo(x, top); for (let i = 0; i <= 8; i++) c.lineTo(x + w * i / 8, top + rip(i / 8) * 0.3);
    for (let i = 8; i >= 0; i--) c.lineTo(x + w * i / 8, top - h + rip(i / 8));
    c.closePath(); c.fillStyle = '#231a30'; c.fill(); ink(P);
    c.beginPath(); c.moveTo(x, top); c.lineTo(x + w - 0.2, top); ink(P, 0.35);
    const sx = x + w * 0.5, sy = top - h * 0.45 + rip(0.5) * 0.6;
    c.strokeStyle = '#fff4dc'; c.lineWidth = 0.32; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx - 1.5, sy - 1.3); c.lineTo(sx + 1.5, sy + 0.4); c.moveTo(sx + 1.5, sy - 1.3); c.lineTo(sx - 1.5, sy + 0.4); c.stroke();
    c.fillStyle = '#fff4dc'; c.beginPath(); c.arc(sx, sy + 0.15, 0.95, 0, 2 * Math.PI); c.fill(); rr(c, sx - 0.5, sy - 0.95, 1, 0.6, 0.15); c.fill();
    c.fillStyle = '#231a30'; for (const s of [-1, 1]) { c.beginPath(); c.arc(sx + s * 0.38, sy + 0.2, 0.25, 0, 2 * Math.PI); c.fill(); }
  }

  function neon(P, x, y) {
    const c = P.c, w = 8.6, h = 3.4;
    cable(P, x - w / 2, y - h / 2 + 0.4, x - w / 2 - 1.6, y - h / 2 - 0.4);
    rr(c, x - w / 2, y - h / 2, w, h, 0.6); c.fillStyle = '#21152f'; c.fill(); ink(P);
    const flick = Math.sin(P.t * 37) > 0.93 || (P.t % 6.1) < 0.18;        // a dodgy letter
    c.save(); c.shadowColor = '#ff5fa2'; c.shadowBlur = 14;
    rr(c, x - w / 2 + 0.45, y - h / 2 + 0.45, w - 0.9, h - 0.9, 0.4); c.strokeStyle = 'rgba(124,245,230,0.9)'; c.lineWidth = 0.22; c.stroke();
    text(P, flick ? 'RUST S' : "RUST'S", x, y - 0.05, 2.3, '#ff7eb6', 700);
    c.restore();
    if (flick) text(P, "'", x + 1.25, y + 0.2, 2.3, '#5c3150', 700);
  }

  function cone(P, x, y) {
    const c = P.c;
    c.beginPath(); c.moveTo(x - 1.1, y - 1); c.lineTo(x, y + 1.6); c.lineTo(x + 1.1, y - 1); c.closePath();
    c.fillStyle = '#ff8a3d'; c.fill(); ink(P);
    c.beginPath(); c.moveTo(x - 0.62, y + 0.1); c.lineTo(x + 0.62, y + 0.1); c.strokeStyle = '#fff4dc'; c.lineWidth = 0.35; c.stroke();
  }

  // tethered junk hangs toward Ceres: in orbit the tidal gradient really does pull it "down"
  function hangingScrap(P) {
    const c = P.c, items = [[-6.5, -5.0, 5.0, 'gear'], [-0.8, -5.3, 6.4, 'duck'], [4.8, -5.2, 4.0, 'wrench']];
    items.forEach(([x, y, L, kind], k) => {
      const a = 0.14 * Math.sin(P.t * 0.8 + k * 2.1), ex = x + L * Math.sin(a), ey = y - L * Math.cos(a);
      cable(P, x, y, ex, ey);
      turned(P, ex, ey, a, (Q) => SCRAP[kind](Q));
    });
  }
  const SCRAP = {
    gear(Q) {
      const c = Q.c; c.beginPath();
      for (let i = 0; i < 16; i++) { const a = i / 16 * 2 * Math.PI, r = i % 2 ? 1.25 : 1.65; c.lineTo(r * Math.cos(a), -1.5 + r * Math.sin(a)); }
      c.closePath(); c.fillStyle = '#a59fbd'; c.fill(); ink(Q);
      c.beginPath(); c.arc(0, -1.5, 0.45, 0, 2 * Math.PI); c.fillStyle = '#21152f'; c.fill(); ink(Q, Q.lw * 0.7);
    },
    duck(Q) {
      const c = Q.c;
      c.beginPath(); c.ellipse(0, -1.4, 1.3, 0.85, 0, 0, 2 * Math.PI); c.fillStyle = '#ffd84d'; c.fill(); ink(Q);
      c.beginPath(); c.arc(0.7, -0.35, 0.65, 0, 2 * Math.PI); c.fill(); ink(Q);
      c.beginPath(); c.moveTo(1.25, -0.3); c.lineTo(1.9, -0.5); c.lineTo(1.25, -0.65); c.closePath(); c.fillStyle = '#ff8a3d'; c.fill(); ink(Q, Q.lw * 0.6);
      c.fillStyle = INK; c.beginPath(); c.arc(0.85, -0.2, 0.13, 0, 2 * Math.PI); c.fill();
    },
    wrench(Q) {
      const c = Q.c;
      rr(c, -0.3, -3.2, 0.6, 2.8, 0.25); c.fillStyle = '#bdb7da'; c.fill(); ink(Q);
      c.beginPath(); c.arc(0, -3.5, 0.75, 0.6 * Math.PI, 2.4 * Math.PI); c.lineTo(0.25, -3.4); c.lineTo(-0.25, -3.4); c.closePath(); c.fill(); ink(Q);
    },
  };

  const ART = { hub: artHub, outpost: artOutpost, rusts: artRust };


  // ---------------- far away: icon badges, labels, off-screen arrow ----------------

  const ROUND = Array(24).fill(1);

  function drawIcon(g, kit, st, x, y, alpha) {
    const c = kit.ctx, p = kit.px(), R = ICON_PX * p;
    c.save(); c.globalAlpha *= alpha;
    kit.toonBlob(ROUND, x, y, R, 0, st.icon, 2.5 * p);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const stroke = (w, col) => { c.strokeStyle = INK; c.lineWidth = w + 2 * p; c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
    if (st.id === 'hub') {                                           // a little wheel, turning
      const a = RING_W * g.t;
      c.beginPath(); c.arc(x, y, R * 0.52, 0, 2 * Math.PI);
      for (let k = 0; k < 4; k++) { c.moveTo(x, y); c.lineTo(x + R * 0.52 * Math.cos(a + k * Math.PI / 2), y + R * 0.52 * Math.sin(a + k * Math.PI / 2)); }
      stroke(R * 0.16, '#ffffff');
    } else if (st.id === 'outpost') {                                // dome with a sprout
      c.beginPath(); c.arc(x, y - R * 0.3, R * 0.5, 0, Math.PI); c.closePath(); c.fillStyle = '#eaffff'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5 * p; c.stroke();
      c.beginPath(); c.moveTo(x, y - R * 0.3); c.lineTo(x, y + R * 0.05); stroke(R * 0.1, '#3f9a3a');
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * R * 0.14, y + R * 0.06, R * 0.16, R * 0.08, s * 0.5, 0, 2 * Math.PI); c.fillStyle = '#3f9a3a'; c.fill(); }
    } else {                                                         // skull
      c.beginPath(); c.arc(x, y + R * 0.08, R * 0.42, 0, 2 * Math.PI); c.fillStyle = '#fff4dc'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5 * p; c.stroke();
      c.fillRect(x - R * 0.22, y - R * 0.48, R * 0.44, R * 0.26); c.strokeRect(x - R * 0.22, y - R * 0.48, R * 0.44, R * 0.26);
      c.fillStyle = INK; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * R * 0.16, y + R * 0.08, R * 0.11, 0, 2 * Math.PI); c.fill(); }
    }
    c.restore();
  }

  function drawTractor(g, kit, st) {
    const c = kit.ctx, [cx, cy] = st.collar(g.t), sh = g.sh, p = kit.px(), f = (g.attach.t1 - g.t) / Math.max(1e-6, g.attach.t1 - g.attach.t0);
    const dx = sh.x - cx, dy = sh.y - cy, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    c.save(); c.globalAlpha = Math.min(1, f * 3);
    c.strokeStyle = 'rgba(124,245,214,0.8)'; c.lineWidth = 2 * p; c.setLineDash([4 * p, 4 * p]); c.lineDashOffset = -g.real * 30 * p;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + nx * s * 2.2, cy + ny * s * 2.2); c.lineTo(sh.x + nx * s * 1.4, sh.y + ny * s * 1.4); c.stroke(); }
    c.setLineDash([]);
    for (let i = 0; i < 3; i++) {
      const u = (g.real * 1.5 + i / 3) % 1, rx = sh.x - dx * u, ry = sh.y - dy * u;
      c.strokeStyle = `rgba(124,245,214,${0.8 * (1 - u)})`; c.beginPath(); c.ellipse(rx, ry, 2.6 * (1 - 0.4 * u), 0.9, Math.atan2(ny, nx), 0, 2 * Math.PI); c.stroke();
    }
    c.restore();
  }

  function drawScreen(g, kit) {
    if (!g.mod.stations) return;
    const at = dockedAt(g), tg = targeted(g);
    for (const st of list(g)) {
      const [x, y] = st.state(g.t), [sx, sy] = kit.toScreen(x, y), rs = st.r * kit.cam.zoom;
      if (!kit.onScreen(sx, sy, 0)) { if (st === tg && !kit.edgeArrow) edgeArrow(g, kit, st, sx, sy); continue; }   // the core lays out its own
      if (rs > 110 || st === tg) continue;                          // big: the art speaks; targeted: the core labels it
      let oy = Math.max(st.ext * kit.cam.zoom, ICON_PX) + 14;
      if (st === at) { const [, qy] = kit.toScreen(g.sh.x, g.sh.y); if (qy > sy) oy = -oy - 2; }    // keep the label off the docked ship
      const m = g.mod.stations, known = m.visited[st.id] || m.met[st.id];
      kit.tag(sx, sy + oy, known ? st.name : `${st.name} ?`, st.col);
    }
  }

  function edgeArrow(g, kit, st, sx, sy) {
    const c = kit.ctx, W = kit.W, H = kit.H, a = Math.atan2(sy - H / 2, sx - W / 2), m = 40;
    const ex = Math.max(m, Math.min(W - m, W / 2 + Math.cos(a) * W)), ey = Math.max(m + 40, Math.min(H - m - 110, H / 2 + Math.sin(a) * H));
    c.save(); c.translate(ex, ey); c.rotate(a);
    c.fillStyle = st.col; c.strokeStyle = INK; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(14, 0); c.lineTo(-6, -9); c.lineTo(-2, 0); c.lineTo(-6, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
    const [px, py] = st.portState(g.t);
    kit.tag(ex - Math.cos(a) * 34, ey - Math.sin(a) * 24, `${st.name} ${kit.fmtDist(Math.hypot(g.sh.x - px, g.sh.y - py))}`, st.col);
  }

  // live docking gauge: the two numbers that matter, with the thresholds
  function drawHUD(g, kit) {
    if (!g.mod.stations || g.status !== 'flying' || g.mode !== 'ship' || g.ui) return;
    const np = nearestPort(g); if (!np) return;
    const { st, q } = np, tg = targeted(g) === st;
    if (q.d > 90 && !(tg && q.d < 260)) return;
    const okR = inZone(st, q), okV = q.v < DOCK_V, a = approach(g, st, q), c = kit.ctx, w = 236, ap = g.approach;
    if (!tg && a.closing < -0.3 && !(okR && okV)) return;                          // just leaving: no nagging
    let y = kit.stackRight(w, 92, `DOCKING · ${st.name.toUpperCase()}`);
    const x = kit.W - w;                                                            // thresholds in the labels: values stay short
    kit.row(`RANGE (dock < ${DOCK_R} m)`, fmt(q.d), x, y, okR ? kit.COL.good : kit.COL.bad); y += 20;
    kit.row(`REL SPEED (< ${DOCK_V})`, `${q.v.toFixed(1)} m/s`, x, y, okV ? kit.COL.good : kit.COL.bad); y += 22;
    const far = q.d >= nearR(st) && !(okR && okV), course = tg && ap && ap.i >= 0 && ap.d < 60;
    const phase = far ? (course ? 'ON COURSE: COAST, THEN BRAKE' : 'MATCH ORBITS FIRST (SEE HINT)') : { ready: 'READY: PRESS F TO DOCK', fast: tg ? 'TOO FAST: BURN AT ⊗ BRAKE' : 'TOO FAST: H, THEN BRAKE',
                  drift: q.d < BRAKE_R ? 'CLOSE IN: TAP W AT THE PORT' : `CLOSE IN: BURN TO ~${a.want.toFixed(0)} M/S`,
                  closing: okV ? 'CLOSING: COAST IN, F AT THE PORT' : `CLOSING: BRAKE BY ${BRAKE_R} M` }[a.k];
    c.font = `700 13.5px ${kit.FONT}`; c.textAlign = 'left';
    const fit = Math.min(1, 212 / Math.max(1, c.measureText(phase).width));
    if (fit < 1) c.font = `700 ${(13.5 * fit).toFixed(1)}px ${kit.FONT}`;
    c.fillStyle = far ? (course ? kit.COL.good : kit.COL.warn) : a.k === 'ready' ? kit.COL.good : a.k === 'fast' ? kit.COL.bad : kit.COL.warn;
    c.fillText(phase, x, y);
  }


  // ---------------- helpers ----------------

  function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  const fmt = (m) => (Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`);


  // ---------------- register, spawns, job ----------------

  const mod = Game.register({
    id: 'stations', init, load, save, after, respawn, died, interactions, navTargets, onKey, onMouse, shipCtrl,
    warpLimit, hint, controls, drawWorld, drawScreen, drawHUD,
  });
  on = Game.mods.includes(mod);
  if (on) {
    const dockSpawn = (id) => (g) => { if (!dock(g, id, true)) Game.landAt(g, g.w.byId.ceres, Math.PI / 2); };
    Game.addSpawn('hub', 'docked at Ceres Hub', dockSpawn('hub'));
    Game.addSpawn('outpost', 'docked at Kiwi Outpost', dockSpawn('outpost'));
    Game.addSpawn('rusts', "docked at Rust's", dockSpawn('rusts'));
    Game.addGoals([{ id: 'undock', order: 10, reward: 25, text: 'Undock from Ceres Hub (tap W)',
                     test: (g) => !!(g.mod.stations && g.mod.stations.leftHub) }]);
  }

  return { list, byId, dockedAt, dock, pirateFree, portInfo, DOCK_R, DOCK_V, SAFE_R, BRAKE_R, SOFT_T };
})();

if (typeof module !== 'undefined') module.exports = Stations;
