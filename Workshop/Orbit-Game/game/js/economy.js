// ======================================================================
//  ECONOMY  —  money rules, prices, the upgrade catalog, ship stats from
//  owned upgrades (engines, fuels, tanks, suit, guns), station services,
//  tow fees, economy jobs, and the Orion nuclear pulse (N).
//  Every part has an honest mass, so every purchase shows up in delta-v.
//  The DOM shop lives in shop.js and drives this through the Econ API.
// ======================================================================

const Econ = (() => {

  const ITEMS = CONFIG.items, SHIP0 = CONFIG.ship, G0 = 9.81;
  const dict = (o) => Object.assign(Object.create(null), o);       // lookup tables immune to 'toString' / '__proto__' ids
  const itemOf = (id) => (Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null);
  const isp = (ve) => ve * CONFIG.ISP_SCALE / G0;                  // real-equivalent specific impulse [s]
  const ALL_TABS = ['services', 'sell', 'ship', 'suit', 'weapons'];

  // ---------------- fuels: density [t/m^3], price [$/t] ----------------
  const FUELS = dict({
    methalox:   { name: 'Methalox',        short: 'methalox',   dens: 1.0,  price: 30, desc: 'Methane + oxygen. The sensible sandwich.' },
    kerolox:    { name: 'Kerolox',         short: 'kerolox',    dens: 1.2,  price: 22, desc: 'Kerosene + oxygen. Dense, cheap, a bit sooty.' },
    hypergolic: { name: 'Hypergolic',      short: 'hypergolic', dens: 1.3,  price: 65, desc: 'Lights itself on contact. Dense, storable, deeply rude.' },
    hydrolox:   { name: 'Hydrolox',        short: 'hydrolox',   dens: 0.45, price: 60, desc: 'Hydrogen + oxygen. Best chemical Isp, fluffy as a cloud.' },
    lh2:        { name: 'Liquid hydrogen', short: 'hydrogen',   dens: 0.22, price: 90, desc: 'Hot hydrogen out of a reactor. Superb Isp, takes up a LOT of room.' },
    ammonia:    { name: 'Ammonia',         short: 'ammonia',    dens: 0.8,  price: 20, desc: 'Denser than hydrogen, less Isp. Smells like a gym bag.' },
  });
  const ION_FUELS = dict({
    xenon:   { name: 'Xenon',   short: 'xenon',   dens: 1.6, price: 600, ve: 3900, desc: 'Heavy noble gas: packs dense, costs a fortune.' },
    krypton: { name: 'Krypton', short: 'krypton', dens: 0.9, price: 160, ve: 4500, desc: 'Cheaper and higher Isp, but the tank holds less.' },
  });
  const BASE_VOL = SHIP0.fuel / FUELS[SHIP0.fuelType].dens;      // stock tank volume [m^3] (1.4)

  // ---------------- engines: thrust [kN], extra mass [t], ve per fuel [m/s] (game ve: x ISP_SCALE = the real thing) ----------------
  const ENGINES = dict({
    sparrow: { name: 'Sparrow', price: 0, thrust: 7, mass: 0, fuels: { methalox: 450, kerolox: 414 },
               desc: 'Trusty stock engine. Smells faintly of toast.' },
    brick:   { name: 'Brick', price: 2200, thrust: 16, mass: 0.35, fuels: { kerolox: 375, hypergolic: 390 },
               desc: 'Aerodynamics of a fridge, push of an angry fridge. Lifts anything off anything.' },
    kestrel: { name: 'Kestrel', price: 4500, thrust: 8, mass: 0.12, fuels: { hydrolox: 570, methalox: 474 },
               desc: 'Light, efficient hydrolox sipper. Shines with a bigger tank.' },
    nerva:   { name: 'NERVA-chan', price: 9500, thrust: 6, mass: 0.55, fuels: { lh2: 1140, ammonia: 645 },
               desc: 'A tiny nuclear reactor that believes in you. Huge Isp, gentle push: a deep-space cruiser.' },
  });
  const ION = { id: 'whisper', name: 'Whisper ion drive', price: 8000, thrust: 0.25, mass: 0.25, vol: 0.25,
                desc: 'Pushes like a sheet of paper. Forever. X toggles it; time warp up to 16x while it hums.' };

  // ---------------- upgrade lines (tiers replace each other; mass in t) ----------------
  const LINES = [
    { id: 'tank', tab: 'ship', name: 'Fuel tank', stock: `Stock tank (${BASE_VOL} m³)`, tiers: [
      { id: 'tank1', name: 'Stretch tank',  price: 450,  mass: 0.05, set: { tankVol: 2.4 }, desc: 'We cut the tank in half and added more tank.' },
      { id: 'tank2', name: 'Barrel tank',   price: 1200, mass: 0.12, set: { tankVol: 4.0 }, desc: 'Like the stretch tank, but it went to the gym.' },
      { id: 'tank3', name: 'Whale tank',    price: 2600, mass: 0.22, set: { tankVol: 6.5 }, desc: 'Big. Full of dense fuel it is too heavy to lift off Mochi with a small engine.' },
      { id: 'tank4', name: 'Zeppelin tank', price: 4800, mass: 0.32, set: { tankVol: 9.0 }, desc: 'For people who measure fuel in units of "yes". Fill it partway for surface work.' } ] },
    { id: 'hull', tab: 'ship', name: 'Hull plating', stock: 'Stock hull', tiers: [
      { id: 'hull1', name: 'Riveted plating', price: 350,  mass: 0.06, set: { hull: 150 }, desc: 'Extra rivets. Every rivet is a tiny hug.' },
      { id: 'hull2', name: 'Double hull',     price: 1000, mass: 0.14, set: { hull: 220 }, desc: 'Like one hull, but twice.' },
      { id: 'hull3', name: 'Bathtub hull',    price: 2400, mass: 0.25, set: { hull: 300 }, desc: 'Cast iron. Radiates confidence (and mass).' } ] },
    { id: 'armor', tab: 'ship', name: 'Armor', stock: 'No armor', tiers: [
      { id: 'armor1', name: 'Whipple shield',  price: 600,  mass: 0.08, set: { armor: 0.2 },  desc: 'Thin layers that pop pebbles before they pop you. A real thing!' },
      { id: 'armor2', name: 'Ceramic tiles',   price: 1800, mass: 0.18, set: { armor: 0.35 }, desc: 'Each tile has a tiny name. They are all named Kevin.' },
      { id: 'armor3', name: 'Reactive armor',  price: 4000, mass: 0.3,  set: { armor: 0.5 },  desc: 'Explodes outward, politely, when hit.' } ] },
    { id: 'cargo', tab: 'ship', name: 'Cargo hold', stock: 'Stock hold', tiers: [
      { id: 'cargo1', name: 'Cargo net',  price: 300,  mass: 0.04, set: { cargoCap: 500 },  desc: 'A net, bolted to the outside. Surprisingly legal.' },
      { id: 'cargo2', name: 'Cargo pod',  price: 1000, mass: 0.09, set: { cargoCap: 800 },  desc: 'A proper pod with a door and everything.' },
      { id: 'cargo3', name: 'Ore barge',  price: 2400, mass: 0.16, set: { cargoCap: 1200 }, desc: 'Your ship is now mostly cupboard.' } ] },
    { id: 'rcs', tab: 'ship', name: 'Thrusters (RCS)', stock: 'Stock RCS', tiers: [
      { id: 'rcs1', name: 'RCS plus',       price: 300, mass: 0.02, set: { rcs: 50, rotAccel: 3.0, transAccel: 0.6 }, desc: 'More puff, more spin, more nudge.' },
      { id: 'rcs2', name: 'RCS pro + gyro', price: 900, mass: 0.05, set: { rcs: 80, rotAccel: 3.8, transAccel: 0.85 }, desc: 'Includes a reaction wheel named Gary.' } ] },
    { id: 'tractor', tab: 'ship', name: 'Tractor beam', stock: 'No tractor', tiers: [
      { id: 'tractor1', name: 'Ore magnet',   price: 500,  mass: 0.03, set: { tractor: 4 }, desc: 'Pulls loose ore and gems into the hold from further away.' },
      { id: 'tractor2', name: 'Tractor beam', price: 1500, mass: 0.06, set: { tractor: 9 }, desc: 'A fancier magnet with a light show.' } ] },
    { id: 'scanner', tab: 'ship', name: 'Gem scanner', stock: 'No scanner', tiers: [
      { id: 'scanner1', name: 'Gem pinger',   price: 600,  mass: 0.01, set: { scanner: 1 }, desc: 'Pings buried gems within 25 m while you walk.' },
      { id: 'scanner2', name: 'Deep scanner', price: 2000, mass: 0.02, set: { scanner: 2 }, desc: 'Shows every buried gem on the rock. Spoilers!' } ] },

    { id: 'pack', tab: 'suit', name: 'Backpack', stock: 'Stock backpack', tiers: [
      { id: 'pack1', name: 'Big backpack',  price: 250, set: { packCap: 70 },  desc: 'Holds more rocks. Your spine has questions.' },
      { id: 'pack2', name: 'Huge backpack', price: 800, set: { packCap: 110 }, desc: 'Your spine has filed a formal complaint.' } ] },
    { id: 'o2', tab: 'suit', name: 'Oxygen', stock: 'Stock air', tiers: [
      { id: 'o2a', name: 'Spare air tank', price: 200, set: { o2: 300 }, desc: 'More breathing. Highly recommended by doctors.' },
      { id: 'o2b', name: 'Rebreather',     price: 700, set: { o2: 600 }, desc: 'Recycles your breath. Minty.' } ] },
    { id: 'jet', tab: 'suit', name: 'Jetpack', stock: 'Stock jetpack', tiers: [
      { id: 'jet1', name: 'Hopper pack',  price: 300, set: { jet: 4.0, jetFuel: 8 },  desc: 'More hop per hop.' },
      { id: 'jet2', name: 'Rocket boots', price: 900, set: { jet: 5.5, jetFuel: 12 }, desc: 'Like a jetpack, but on your feet. Do not ask how.' } ] },
    { id: 'suit', tab: 'suit', name: 'Suit armor', stock: 'Stock suit', tiers: [
      { id: 'suit1', name: 'Padded suit',  price: 250, set: { suitHp: 150 }, desc: 'Quilted. Bug-bite resistant. Very huggable.' },
      { id: 'suit2', name: 'Armored suit', price: 800, set: { suitHp: 220 }, desc: 'You clank when you walk. Worth it.' } ] },
    { id: 'laser', tab: 'suit', name: 'Mining laser', stock: 'Stock laser', tiers: [
      { id: 'laser1', name: 'Laser mk2',  price: 400,  set: { laserPower: 1.8, laserRange: 9,  laserDps: 28 }, desc: 'Digs faster. Also toasts sandwiches.' },
      { id: 'laser2', name: 'Laser mk3',  price: 1200, set: { laserPower: 3.0, laserRange: 11, laserDps: 42 }, desc: 'Cuts nickel like butter. Cold butter, but still.' },
      { id: 'laser3', name: 'Laser mk4',  price: 3000, set: { laserPower: 4.5, laserRange: 13, laserDps: 60 }, desc: 'Platinum? Never heard of her.' } ] },

    { id: 'gun', tab: 'weapons', name: 'Ship guns', stock: 'No guns', tiers: [
      { id: 'gun1', name: 'Pea shooter',  price: 700,  mass: 0.05, set: { gun: 1, gunDmg: 8,  gunRate: 4, gunSpeed: 60 },  desc: 'Fires peas. Metal peas. Fast. Space to shoot.' },
      { id: 'gun2', name: 'Rivet gun',    price: 1800, mass: 0.08, set: { gun: 2, gunDmg: 14, gunRate: 6, gunSpeed: 80 },  desc: 'Builds holes in pirates.' },
      { id: 'gun3', name: 'Mass driver',  price: 4000, mass: 0.14, set: { gun: 3, gunDmg: 26, gunRate: 7, gunSpeed: 110 }, desc: 'A railgun that does its own taxes.' } ] },
    { id: 'turret', tab: 'weapons', name: 'Turret', stock: 'Nose-mounted guns', tiers: [
      { id: 'turret', name: 'Swivel turret', price: 2000, mass: 0.06, set: { turret: 1 }, desc: 'Your guns aim at the mouse instead of your nose. Needs a gun.' } ] },
  ];
  const TIER = dict({});                                                 // tier id -> { line, tier (1-based), ...tier }
  for (const L of LINES) L.tiers.forEach((t, i) => { TIER[t.id] = { ...t, line: L, tier: i + 1 }; });

  // ---------------- Orion nuclear pulse units (consumable) ----------------
  const ORION = { id: 'orion', name: 'Orion pulse unit', price: 450, hubMult: 1.8, mass: 0.05, max: 3, cooldown: 1.2,
                  bombDist: 12, craterAlt: 25,
                  desc: 'A small nuclear charge you kick out the back. Freeman Dyson approved. N fires one.' };

  // ---------------- services & fees ----------------
  const RCS_PRICE = 1.5, REPAIR_PRICE = 1.2, TOW_FEE = { tow: 110, crash: 180 }, FEE_MIN = 100, FEE_MAX = 250;

  // ---------------- the catalog other modules see ----------------
  const CATALOG = [
    ...Object.entries(ENGINES).filter(([id]) => id !== 'sparrow')
      .map(([id, e]) => ({ id, name: e.name, cat: 'ship', group: 'engine', price: e.price, desc: e.desc })),
    { id: ION.id, name: ION.name, cat: 'ship', group: 'ion', price: ION.price, desc: ION.desc },
    ...LINES.flatMap((L) => L.tiers.map((t, i) => ({ id: t.id, name: t.name, cat: L.tab, group: L.id, tier: i + 1, price: t.price, desc: t.desc }))),
    { id: ORION.id, name: ORION.name, cat: 'weapons', group: 'orion', price: ORION.price, desc: ORION.desc, consumable: true },
  ];
  const BY_ID = dict(Object.fromEntries(CATALOG.map((c) => [c.id, c])));

  // default stations (used for HOLD VALUE prices, and as a pad depot when no stations module is running)
  const HUB = { id: 'hub', name: 'Mochi Hub', kind: 'hub', keeper: 'Mo', buy: {}, tabs: ALL_TABS, fuelMult: 1,
                blurb: 'Welcome to Mochi Hub! Fair prices, fresh air, and only a little bit of gravity.' };
  const PAD_DEPOT = { id: 'pad-depot', name: 'Mochi Pad Depot', kind: 'hub', keeper: 'Pip', buy: {}, tabs: ALL_TABS, fuelMult: 1.1,
                      blurb: 'No station in orbit today, so the shop came to the pad. Ice is cold, prices are hot.' };
  // with Mochi Hub in orbit the pad keeps a kiosk: fuel, RCS, repairs and a till, a bit dearer than the Hub (parts stay upstairs)
  const PAD_KIOSK = { id: 'pad-depot', name: 'Mochi Pad Depot', kind: 'outpost', keeper: 'Pip', buy: { '*': 0.8 }, tabs: ['services', 'sell'],
                      fuelMult: 1.2, repairMult: 1.2,
                      blurb: 'A fuel pump, a till and a kettle. The Hub upstairs pays more and sells parts; I am just closer.' };
  const padDepot = () => (stationsOn() ? PAD_KIOSK : PAD_DEPOT);


  // ======================================================================
  //  STATE
  // ======================================================================

  const fresh = () => ({
    owned: {}, engine: 'sparrow', fuelOf: { sparrow: 'methalox' }, ionFuel: 'xenon', orion: 0,
    station: null, blast: null, lastPulse: -99,
    stats: { sold: 0, spent: 0, bought: 0, fired: 0, fees: 0, blueprints: 0 },
  });
  const st = (g) => g.mod.economy || (g.mod.economy = fresh());
  const owns = (g, id) => id === 'sparrow' || !!st(g).owned[id];
  const has = (id) => Game.mods.some((m) => m.id === id);
  const stationsOn = () => typeof Stations !== 'undefined' && has('stations');

  function tierOf(m, L) {                                          // highest owned tier of a line, or null (stock)
    for (let i = L.tiers.length - 1; i >= 0; i--) if (m.owned[L.tiers[i].id]) return L.tiers[i];
    return null;
  }
  const tierIndex = (m, L) => { const t = tierOf(m, L); return t ? TIER[t.id].tier : 0; };
  const engineOf = (m) => (ENGINES[m.engine] ? m.engine : 'sparrow');
  function fuelOf(m, eid = engineOf(m)) {
    const f = m.fuelOf[eid];
    return ENGINES[eid].fuels[f] ? f : Object.keys(ENGINES[eid].fuels)[0];
  }
  const ionFuelOf = (m) => (ION_FUELS[m.ionFuel] ? m.ionFuel : 'xenon');

  function init(g) { g.mod.economy = fresh(); }

  function save(g) {
    const m = st(g);
    return { v: 1, owned: Object.keys(m.owned).filter((id) => m.owned[id]), engine: m.engine, fuelOf: m.fuelOf,
             ionFuel: m.ionFuel, orion: m.orion, stats: m.stats };
  }

  function load(g, d) {
    if (!d || typeof d !== 'object') return;
    const m = st(g);
    for (const id of Array.isArray(d.owned) ? d.owned : []) if (BY_ID[id] && !BY_ID[id].consumable) m.owned[id] = true;
    if (ENGINES[d.engine] && owns(g, d.engine)) m.engine = d.engine;
    if (d.fuelOf && typeof d.fuelOf === 'object')
      for (const [e, f] of Object.entries(d.fuelOf)) if (ENGINES[e] && ENGINES[e].fuels[f]) m.fuelOf[e] = f;
    if (ION_FUELS[d.ionFuel]) m.ionFuel = d.ionFuel;
    m.orion = Math.max(0, Math.min(ORION.max, Math.floor(+d.orion || 0)));
    if (d.stats && typeof d.stats === 'object') for (const k in m.stats) if (isFinite(d.stats[k])) m.stats[k] = +d.stats[k];
  }


  // ======================================================================
  //  STATS HOOK: CONFIG.ship + owned parts (every part's mass is counted)
  // ======================================================================

  function stats(g, S) {
    const m = st(g), parts = [[`${S.name} hull & cockpit`, S.dry]];
    const add = (name, t) => { if (t) { S.dry += t; parts.push([name, t]); } };
    for (const L of LINES) {
      const t = tierOf(m, L);
      if (!t) continue;
      Object.assign(S, t.set);
      add(t.name, t.mass || 0);
    }
    const eid = engineOf(m), E = ENGINES[eid], fid = fuelOf(m), F = FUELS[fid];
    S.engine = eid; S.engineName = E.name; S.thrust = E.thrust; S.ve = E.fuels[fid];
    add(`${E.name} engine`, E.mass);
    S.fuelId = fid; S.fuelType = F.short; S.fuelDens = F.dens;
    S.tankVol = S.tankVol || BASE_VOL;
    S.fuel = S.tankVol * F.dens;
    if (m.owned[ION.id]) {
      const X = ION_FUELS[ionFuelOf(m)];
      S.ionThrust = ION.thrust; S.ionVe = X.ve; S.ionTank = ION.vol * X.dens; S.ionFuelId = ionFuelOf(m); S.ionFuelType = X.short;
      add(ION.name, ION.mass);
    }
    add(`Orion pulse units ×${m.orion}`, ORION.mass * m.orion);
    S.orionCount = m.orion;
    S.massParts = parts;
  }

  // what the ship would be after `mutate(m)` (every module's stats hook runs; the state is restored)
  function previewS(g, mutate) {
    const m = st(g), owned = m.owned, fuelOf = m.fuelOf, keep = JSON.parse(JSON.stringify({ owned, fuelOf, engine: m.engine, ionFuel: m.ionFuel, orion: m.orion }));
    try {
      if (mutate) mutate(m);
      const S = { ...CONFIG.ship };
      Game.each(g, 'stats', S);
      return S;
    } finally {                                                    // restore in place: callers may hold m.owned / m.fuelOf
      m.owned = owned; m.fuelOf = fuelOf;
      for (const k of Object.keys(owned)) delete owned[k];
      for (const k of Object.keys(fuelOf)) delete fuelOf[k];
      Object.assign(owned, keep.owned); Object.assign(fuelOf, keep.fuelOf);
      m.engine = keep.engine; m.ionFuel = keep.ionFuel; m.orion = keep.orion;
    }
  }

  // headline numbers for a stats object: full tank, empty hold (what you would fly out of the shop with)
  function metrics(g, S) {
    const gC = (g.w.byId.mochi || { g: 2 }).g, mFull = S.dry + S.fuel + (S.ionTank || 0);
    const dvOf = (ve, prop) => (ve > 0 && prop > 0 && mFull > prop ? ve * Math.log(mFull / (mFull - prop)) : 0);
    return {
      dv: dvOf(S.ve, S.fuel), twr: S.thrust / (mFull * gC), isp: isp(S.ve), thrust: S.thrust, fuelT: S.fuel, tankVol: S.tankVol || BASE_VOL,
      dry: S.dry, full: mFull, iondv: dvOf(S.ionVe, S.ionTank || 0), ionIsp: S.ionVe ? isp(S.ionVe) : 0,
      hold: S.cargoCap, hull: S.hull, armor: S.armor || 0, rcs: S.rcs, spin: S.rotAccel, nudge: S.transAccel,
      tractor: S.tractor || 0, scanner: S.scanner || 0,
      pack: S.packCap, o2: S.o2, jet: S.jet, jetFuel: S.jetFuel, suitHp: S.suitHp,
      laser: S.laserPower, laserRange: S.laserRange, laserDps: S.laserDps,
      gunDps: (S.gunDmg || 0) * (S.gunRate || 0), gunSpeed: S.gunSpeed || 0, turret: S.turret || 0,
      orion: S.orionCount || 0, orionDv: S.orionJ / (mFull - (S.orionCount ? ORION.mass : 0)),   // the unit leaves before the kick
    };
  }

  // thrust-to-weight on body b right now (local gravity at the ship's distance)
  function twrOn(g, b, mass = Physics.mass(g.sh, g.S)) {
    const [bx, by] = World.bodyState(g.w, b, g.t), r = Math.max(b.Rc || b.R, Math.hypot(g.sh.x - bx, g.sh.y - by));   // valleys pull harder
    return g.S.thrust / (mass * (b.mu / (r * r)));
  }


  // ======================================================================
  //  PRICES
  // ======================================================================

  // station.buy: { item: mult }, falling back to buy[kind] (ore/gem/bio/salvage), then buy['*'], then 1.  0 = not buying.
  function buyMult(station, item) {
    const b = station && station.buy, it = itemOf(item);
    if (!b || !it) return it ? 1 : 0;
    const v = b[item] ?? b[it.kind] ?? b['*'];
    return typeof v === 'number' && isFinite(v) ? Math.max(0, v) : 1;
  }
  function hubStation(g) {
    if (stationsOn()) {
      try { const h = Stations.list(g).find((s) => s.kind === 'hub'); if (h && h.buy) return h; } catch (e) { /* fall back */ }
    }
    return HUB;
  }
  function sellPrice(g, item, station) {
    const it = itemOf(item);
    return it ? Math.round(it.price * buyMult(station || hubStation(g), item) * 100) / 100 : 0;
  }
  const valueOf = (g, bag, station) => Object.entries(bag).reduce((s, [k, q]) => s + q * sellPrice(g, k, station), 0);
  const holdValue = (g) => Math.round(valueOf(g, g.cargo, hubStation(g)));

  const fuelMult = (station) => (station && typeof station.fuelMult === 'number' && isFinite(station.fuelMult) ? Math.max(0, station.fuelMult) : 1);
  const fuelPrice = (g, station) => FUELS[g.S.fuelId || 'methalox'].price * fuelMult(station);
  const ionPrice = (g, station) => (ION_FUELS[g.S.ionFuelId] ? ION_FUELS[g.S.ionFuelId].price : 0) * fuelMult(station);
  const rcsPrice = (station) => RCS_PRICE * fuelMult(station);
  const repairPrice = (station) => REPAIR_PRICE * (station && isFinite(station.repairMult) ? Math.max(0, station.repairMult) : 1);

  function priceOf(g, id, station) {
    const c = BY_ID[id]; if (!c) return Infinity;
    const mult = station && isFinite(station.priceMult) && station.priceMult > 0 ? station.priceMult : 1;
    if (id === ORION.id) return Math.round(c.price * (station && station.kind === 'black' ? 1 : ORION.hubMult) * mult);
    return Math.round(c.price * mult);
  }
  const sellsTab = (station, tab) => !station || !station.tabs || station.tabs.includes(tab);
  const sellsOrion = (station) => !station || station.kind === 'black' || station.kind === 'hub';
  // which shop tab shows Orion units here: weapons, else (a hub with no weapons counter) next to the engines
  const orionTab = (station) => (!sellsOrion(station) ? null : sellsTab(station, 'weapons') ? 'weapons' : sellsTab(station, 'ship') ? 'ship' : null);


  // ======================================================================
  //  BUYING, INSTALLING, EQUIPPING
  // ======================================================================

  // -> { ok, why: 'unknown'|'notsold'|'owned'|'locked'|'max'|'broke', price, need }
  function canBuy(g, id, station) {
    const m = st(g), c = BY_ID[id], price = priceOf(g, id, station);
    if (!c) return { ok: false, why: 'unknown', price };
    if (id === ORION.id ? !orionTab(station) : !sellsTab(station, c.cat)) return { ok: false, why: 'notsold', price };
    if (id === ORION.id) { if (m.orion >= ORION.max) return { ok: false, why: 'max', price }; }
    else if (owns(g, id) || (TIER[id] && tierIndex(m, TIER[id].line) >= TIER[id].tier)) return { ok: false, why: 'owned', price };
    else if (TIER[id] && tierIndex(m, TIER[id].line) < TIER[id].tier - 1) return { ok: false, why: 'locked', price };
    if (g.money < price) return { ok: false, why: 'broke', price, need: price - g.money };
    return { ok: true, price };
  }

  function buy(g, id, station = st(g).station) {
    const c = canBuy(g, id, station);
    if (!c.ok) return { ...c, msg: { broke: `Need $${Math.ceil(c.need)} more`, owned: 'Already installed', locked: 'Buy the tier before first',
                                    max: `You can carry ${ORION.max}`, notsold: 'Not sold here', unknown: 'Unknown item' }[c.why] };
    const m = st(g);
    g.money -= c.price; m.stats.spent += c.price; m.stats.bought++;
    const name = install(g, id);
    if (ENGINES[id]) equip(g, id, station);                         // bought it to use it
    Game.log(g, `bought ${name} for $${c.price}  ($${g.money} left)`);
    Game.goal(g, 'upgrade');
    Game.save(g);
    return { ok: true, price: c.price, msg: `${name} installed!` };
  }

  // install without paying -> the item's name, or null if owned / unknown / full
  function install(g, id) {
    const m = st(g), c = BY_ID[id];
    if (!c) return null;
    if (id === ORION.id) { if (m.orion >= ORION.max) return null; m.orion++; }
    else {
      if (owns(g, id) || (TIER[id] && tierIndex(m, TIER[id].line) >= TIER[id].tier)) return null;
      m.owned[id] = true;
      if (ENGINES[id] && !m.fuelOf[id]) { const f = bestFuel(g, id); m.fuelOf[id] = f; }
    }
    const S0 = g.S;
    Game.recalc(g);
    if (S0 && g.sh) {                                               // new plating arrives intact (no paying to "repair" it)
      g.sh.hull += Math.max(0, (g.S.hull - S0.hull) || 0);
      if (g.astro) g.astro.hp = Math.min(g.S.suitHp, (g.astro.hp || 0) + Math.max(0, (g.S.suitHp - S0.suitHp) || 0));
    }
    return c.name;
  }

  // free install from a wreck blueprint (engines are not swapped mid-flight; equip them at Mochi Hub)
  function grant(g, id) {
    const name = install(g, id);
    if (name) { st(g).stats.blueprints++; Game.log(g, `blueprint installed: ${name}`); Game.save(g); }
    return name;
  }

  // an upgrade id the player does not own yet (next tier of each line, engines, ion drive), cheaper ones likelier
  function randomBlueprint(g, rand = Math.random) {
    const m = st(g), pool = [];
    for (const L of LINES) { const t = L.tiers[tierIndex(m, L)]; if (t) pool.push(t.id); }
    for (const id of [...Object.keys(ENGINES), ION.id]) if (!owns(g, id)) pool.push(id);
    if (!pool.length) return null;
    const w = pool.map((id) => 1 / Math.sqrt(BY_ID[id].price || 1)), tot = w.reduce((a, b) => a + b, 0);
    let r = Math.max(0, Math.min(0.999999, +rand() || 0)) * tot;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  // a new engine starts on the fuel that goes furthest with your tank while still lifting off Mochi (else the liftiest)
  function bestFuel(g, eid) {
    if (!ENGINES[eid]) return null;
    let far = null, lift = null;
    for (const f of Object.keys(ENGINES[eid].fuels)) {
      const M = metrics(g, previewS(g, (m) => { m.owned[eid] = true; m.engine = eid; m.fuelOf[eid] = f; }));
      if (M.twr >= 1 && (!far || M.dv > far.dv)) far = { f, dv: M.dv };
      if (!lift || M.twr > lift.twr) lift = { f, twr: M.twr };
    }
    return (far || lift).f;
  }

  // swap to an owned engine (free at Mochi Hub). Keeps the fuel when the new engine burns it, else drains and refills.
  function equip(g, eid, station = st(g).station) {
    const m = st(g);
    if (!ENGINES[eid] || !owns(g, eid)) return { ok: false, msg: 'Not owned' };
    if (engineOf(m) === eid) return { ok: true, spent: 0, msg: 'Already equipped' };
    const before = fuelOf(m);
    m.engine = eid;
    return changeFuel(g, before, fuelOf(m), station, `${ENGINES[eid].name} equipped`);
  }
  function setFuel(g, fid, station = st(g).station) {
    const m = st(g), eid = engineOf(m);
    if (!ENGINES[eid].fuels[fid]) return { ok: false, msg: `${ENGINES[eid].name} cannot burn that` };
    const before = fuelOf(m);
    m.fuelOf[eid] = fid;
    return changeFuel(g, before, fid, station, `Now burning ${FUELS[fid].name.toLowerCase()}`);
  }
  function changeFuel(g, before, after, station, msg) {
    let spent = 0;
    if (before !== after) g.sh.fuel = 0;                            // different stuff: the old fuel is vented
    Game.recalc(g);
    if (before !== after && station) spent = refuel(g, station, { ion: false, rcs: false });
    Game.log(g, `${msg}${before !== after ? ` (tank drained, refilled for $${spent})` : ''}`);
    Game.save(g);
    return { ok: true, spent, drained: before !== after, msg };
  }
  function setIonFuel(g, xid, station = st(g).station) {
    const m = st(g);
    if (!ION_FUELS[xid] || !m.owned[ION.id]) return { ok: false, msg: 'No ion drive' };
    if (ionFuelOf(m) === xid) return { ok: true, spent: 0, msg: 'Already loaded' };
    m.ionFuel = xid; g.sh.xe = 0; Game.recalc(g);
    const spent = station ? fill(g, 'xe', g.S.ionTank, ionPrice(g, station)) : 0;
    Game.log(g, `ion drive now on ${xid} (refilled for $${spent})`);
    Game.save(g);
    return { ok: true, spent, drained: true, msg: `Ion drive on ${ION_FUELS[xid].name.toLowerCase()}` };
  }


  // ======================================================================
  //  STATION SERVICES (partial when broke; money never goes negative)
  // ======================================================================

  // top g.sh[key] up to target at unit $/unit -> $ spent (whole dollars)
  function fill(g, key, target, unit) {
    const sh = g.sh, have = sh[key] || 0, need = target - have;
    if (!(need > 1e-9)) return 0;
    if (!(unit > 0)) { sh[key] = target; return 0; }
    const cash = Math.max(0, Math.floor(g.money)), q = Math.min(need, cash / unit);
    if (q <= 1e-9) return 0;
    const cost = Math.min(cash, Math.ceil(q * unit - 1e-6));
    sh[key] = q >= need ? target : have + q;
    g.money -= cost;
    return cost;
  }

  // opt: { main, ion, rcs, frac (main/ion fill level 0..1) }
  function refuel(g, station, opt = {}) {
    const { main = true, ion = true, rcs = true } = opt, frac = Math.max(0, Math.min(1, opt.frac ?? 1));
    let spent = 0;
    if (main) spent += fill(g, 'fuel', g.S.fuel * frac, fuelPrice(g, station));
    if (ion && g.S.ionTank > 0) spent += fill(g, 'xe', g.S.ionTank * frac, ionPrice(g, station));
    if (rcs) spent += fill(g, 'rcs', g.S.rcs, rcsPrice(station));
    if (spent) Game.log(g, `refuel $${spent}`);
    return spent;
  }
  const restockRcs = (g, station) => refuel(g, station, { main: false, ion: false, rcs: true });
  function repair(g, station) {
    const spent = fill(g, 'hull', g.S.hull, repairPrice(station));
    if (spent) Game.log(g, `repair $${spent}`);
    return spent;
  }

  // what each service would cost right now (for the shop and hints)
  function quote(g, station, what, frac = 1) {
    const sh = g.sh, S = g.S;
    const c = { fuel: Math.max(0, S.fuel * frac - sh.fuel) * fuelPrice(g, station),
                ion: Math.max(0, (S.ionTank || 0) * frac - (sh.xe || 0)) * ionPrice(g, station),
                rcs: Math.max(0, S.rcs - sh.rcs) * rcsPrice(station),
                hull: Math.max(0, S.hull - sh.hull) * repairPrice(station) }[what];
    return Math.ceil((c || 0) - 1e-6);
  }


  // ======================================================================
  //  SELLING (the ship's hold; a backpack aboard is unloaded first)
  // ======================================================================

  function sell(g, item, qty, station) {
    const price = sellPrice(g, item, station), have = g.cargo[item] || 0, n = Math.min(qty == null ? have : +qty || 0, have);
    if (!(price > 0) || !(n > 0)) return 0;
    Game.removeCargo(g, item, n);
    const earned = Math.round(price * n);
    paid(g, earned, `${n} ${item}`);
    return earned;
  }

  function sellAll(g, station) {
    let total = 0, sold = [];
    for (let pass = 0; pass < 3; pass++) {
      if (!g.astro.on && Object.keys(g.pack).length) Game.unloadPack(g);
      let got = 0;
      for (const [item, q] of Object.entries(g.cargo)) {
        const price = sellPrice(g, item, station);
        if (!(price > 0)) continue;
        Game.removeCargo(g, item, q);
        got += price * q; sold.push(`${q} ${item}`);
      }
      total += got;
      if (!got || g.astro.on || !Object.keys(g.pack).length) break;
    }
    total = Math.round(total);
    if (total) paid(g, total, sold.join(', '));
    return total;
  }

  function paid(g, earned, what) {
    const m = st(g);
    g.money += earned; m.stats.sold += earned;
    Game.log(g, `sold ${what} for $${earned}`);
    Game.goal(g, 'sell');
    Game.save(g);
  }


  // ======================================================================
  //  SHOP OPEN / CLOSE (the DOM panel is shop.js; in Node there is only g.ui)
  // ======================================================================

  function normStation(s) {
    s = s || HUB;
    return { ...s, id: s.id || 'station', name: s.name || 'Station', kind: s.kind || 'outpost', keeper: s.keeper || 'Keeper',
             blurb: typeof s.blurb === 'string' ? s.blurb : s.hello || '', buy: s.buy || {}, tabs: Array.isArray(s.tabs) && s.tabs.length ? s.tabs : ALL_TABS,
             fuelMult: fuelMult(s), src: s };
  }

  function openShop(g, station) {
    if ((g.ui && g.ui !== 'shop') || g.status === 'dead') return false;
    const m = st(g);
    m.station = normStation(station);
    g.ui = 'shop';
    if (typeof Shop !== 'undefined' && typeof document !== 'undefined') Shop.open(g, m.station);
    Game.log(g, `shop open: ${m.station.name}`);
    return true;
  }

  function closeShop(g) {
    const m = st(g), was = g.ui === 'shop';
    if (was) g.ui = null;
    m.station = null;
    if (typeof Shop !== 'undefined' && Shop.isOpen && Shop.isOpen()) Shop.close();
    if (was) { Game.log(g, 'shop closed'); Game.save(g); }
    return was;
  }


  // ======================================================================
  //  ORION NUCLEAR PULSE (N): dv = J / m along the nose
  // ======================================================================

  function firePulse(g) {
    const m = st(g), sh = g.sh;
    if (g.mode !== 'ship' || g.status === 'dead' || g.ui || g.paused) return false;
    if (m.orion <= 0) { Game.toast(g, `NO ORION UNITS (${stationsOn() ? "MOCHI HUB AND RUST'S SELL THEM" : 'THE PAD DEPOT SELLS THEM'})`, '#ff9f1c', 'orion'); return false; }
    if (g.status === 'docked') { Game.toast(g, 'NOT WHILE DOCKED! THE STATION LIKES ITS WINDOWS', '#ff9f1c', 'orion'); return false; }
    if (g.real - m.lastPulse < ORION.cooldown) return false;

    m.orion--; m.lastPulse = g.real; m.stats.fired++;
    Game.recalc(g);                                                 // the charge has left the ship: lighter now
    const mass = Physics.mass(sh, g.S), dv = g.S.orionJ / mass;
    const nx = Math.cos(sh.ang), ny = Math.sin(sh.ang);
    const bx = sh.x - nx * ORION.bombDist, by = sh.y - ny * ORION.bombDist;
    m.blast = { x: bx, y: by, vx: sh.vx, vy: sh.vy, t: g.t, real: g.real };
    Game.impulse(g, nx * dv, ny * dv);
    Game.setWarp(g, 1);
    Game.log(g, `ORION pulse: dv ${dv.toFixed(2)} m/s = ${g.S.orionJ} kN s / ${mass.toFixed(3)} t   (${m.orion} left)`);

    blastEffects(g, m.blast);
    g.shake = 1;
    Game.hurtShip(g, 4, 'BWOOOM!');                                 // the pusher plate takes it on the chin
    bigWord(g, 'BWOOOM!', sh.x - nx * 6, sh.y - ny * 6);
    Game.goal(g, 'orion');
    return dv;
  }

  // one big word between ship and bomb (re-uses hurtShip's popup so two words never pile up)
  function bigWord(g, text, x, y) {
    const p = g.popups && g.popups[g.popups.length - 1];
    if (p && p.text === text) Object.assign(p, { x, y, size: 48, col: '#ffe066' });
    else Game.popup(g, text, '#ffe066', x, y, 48);
  }

  // near a surface the pulse digs a crater where the blast meets the ground; in space it just hurts whoever is behind you
  function blastEffects(g, B) {                                    // B: bomb point + the ship's velocity before the kick
    const sh = g.sh, nb = Game.nearestBody(g, sh.x, sh.y), clear = nb.alt - g.S.radius, bx = B.x, by = B.y;
    Game.burst(g, 'flash', bx, by, 3, { vx: B.vx, vy: B.vy, size: 40, speed: 0.2, life: 0.7, col: '#fff3a0' });
    Game.burst(g, 'boom', bx, by, 60, { vx: B.vx, vy: B.vy, speed: 16 });
    Game.burst(g, 'spark', bx, by, 30, { vx: B.vx, vy: B.vy, speed: 22, col: '#ffe066' });
    if (clear < ORION.craterAlt) {
      const hit = Game.raycast(g, sh.x, sh.y, -Math.cos(sh.ang), -Math.sin(sh.ang), ORION.craterAlt + 10, { targets: false });
      const sr = World.surfaceR(nb.b, Math.atan2(nb.ly, nb.lx));
      const cx = hit ? hit.x : nb.bx + nb.ux * sr, cy = hit ? hit.y : nb.by + nb.uy * sr;
      const r = 3 + 5 * Math.max(0, Math.min(1, 1 - clear / ORION.craterAlt));
      Game.dealDamage(g, { x: cx, y: cy, r, dmg: 70, kind: 'blast', team: 'player', falloff: true, dig: 4 });
      Game.burst(g, 'dust', cx, cy, 45, { vx: nb.bvx, vy: nb.bvy, speed: 10, col: nb.b.color[1], size: 1.2 });
      Game.popup(g, 'KRA-KOOM!', '#ff9f1c', cx, cy, 34);
      Game.log(g, `Orion crater on ${nb.b.name}: r ${r.toFixed(1)} m`);
    } else {
      Game.dealDamage(g, { x: bx, y: by, r: 10, dmg: 60, kind: 'blast', team: 'player', falloff: true });
    }
  }


  // ======================================================================
  //  HOOKS
  // ======================================================================

  function onKey(g, code) {
    if (g.ui === 'shop') { if (code === 'Escape' || code === 'KeyF') closeShop(g); return true; }   // the shop eats keys while open
    if (code === 'KeyN' && g.mode === 'ship' && g.status !== 'dead' && !g.ui && !g.paused) { firePulse(g); return true; }
    if (code === 'KeyK' && g.dev) { g.money += 5000; Game.toast(g, 'DEV: +$5,000', '#8ff0b0', 'devk'); return true; }
    return false;
  }

  function shipCtrl(g, ctrl) {                                      // no flying while shopping (held W would undock)
    if (g.ui === 'shop') Object.assign(ctrl, { main: 0, ion: 0, rot: 0, kill: false, fwd: 0, left: 0 });
  }

  function frame(g) {
    const m = st(g);
    if (g.ui === 'shop' && !m.station) g.ui = null;
    if (g.ui !== 'shop' && typeof Shop !== 'undefined' && Shop.isOpen && Shop.isOpen()) Shop.close();
    if (m.blast && g.real - m.blast.real > 1.2) m.blast = null;
  }

  // old = the tanks before the tow: the fresh ship arrives full, and that fill is billed at hub prices
  function respawn(g, why, old) {
    const m = st(g);
    m.blast = null;
    if (g.ui === 'shop') closeShop(g);
    const heavy = Math.max(0, Physics.fullMass(g.S) - 2.4) * 15;  // heavier ships cost more to tow
    const base = Math.round(Math.min(FEE_MAX, Math.max(FEE_MIN, (TOW_FEE[why] || TOW_FEE.tow) + heavy)));
    const refill = old ? refillCost(g, why === 'crash' ? { ...old, hull: g.S.hull } : old, hubStation(g)) : 0;   // salvage covers the hull
    const fee = base + refill;
    const pay = Math.max(0, Math.min(fee, Math.floor(g.money)));
    g.money -= pay; m.stats.fees += pay;
    const what = `${why === 'crash' ? 'SALVAGE + TOW' : 'TOW'} FEE${refill ? ' + REFILL' : ''}`;
    Game.toast(g, pay < fee ? `${what} $${fee}: YOU PAID $${pay}, WE CRIED A LITTLE` : `${what}: -$${pay}`, '#ff9fb2', 'fee');
    Game.log(g, `${why} fee $${pay} of $${fee} (base $${base}, refill $${refill})`);
  }
  function refillCost(g, old, station) {
    const S = g.S, gap = (full, have) => Math.max(0, (full || 0) - (Number.isFinite(have) ? have : full || 0));
    return Math.ceil(gap(S.fuel, old.fuel) * fuelPrice(g, station) + gap(S.ionTank, old.xe) * ionPrice(g, station) +
                     gap(S.rcs, old.rcs) * rcsPrice(station) + gap(S.hull, old.hull) * repairPrice(station) - 1e-6);
  }

  function died(g) { st(g).blast = null; if (g.ui === 'shop') closeShop(g); }

  const money = (n) => `$${Math.floor(n).toLocaleString('en-US')}`;

  function hudRows(g) {
    const m = st(g), rows = [{ label: 'HOLD VALUE', val: money(holdValue(g)), col: '#2f9e5b' }];
    if (m.orion > 0) rows.push({ label: 'ORION PULSES (N)', val: `${m.orion} / ${ORION.max}`, col: '#e63946' });
    return rows;
  }

  function hint(g) {
    if (g.ui || g.status === 'dead') return null;
    const m = st(g), sh = g.sh, S = g.S, cargo = Object.keys(g.cargo).length > 0;
    if (g.status === 'landed' && g.mode === 'ship' && g.landedOn) {
      const b = g.landedOn;
      if (sh.fuel <= 1e-6) return { pri: 66, text: `Out of fuel on ${b.name}. Press R twice to get towed home (small fee).` };
      const twr = twrOn(g, b);
      if (twr < 1) return { pri: 66, text: `Too heavy to lift off ${b.name} (thrust-to-weight ${twr.toFixed(2)}). Holding W burns fuel until you are light enough.` };
      if (padDepotNear(g) && cargo && !stationsOn()) return { pri: 52, text: `Press F to open the pad depot and sell your cargo (${money(holdValue(g))}).` };   // else stations coaches
    }
    if (g.status === 'docked' && g.mode === 'ship') {
      if (cargo) return { pri: 55, text: `Docked with ${money(holdValue(g))} of cargo: press F to open the shop and sell it.` };
      if (sh.fuel < 0.5 * S.fuel) return { pri: 45, text: `Tank is ${Math.round(100 * sh.fuel / S.fuel)}% full: press F, then Services, to refuel before you go.` };
    }
    if (m.orion > 0 && !m.stats.fired && g.status === 'flying' && g.mode === 'ship')
      return { pri: 20, text: `N fires an Orion nuclear pulse: +${(S.orionJ / (Physics.mass(sh, S) - ORION.mass)).toFixed(0)} m/s along your nose (${m.orion} carried).` };
    return null;
  }

  // ---------------- pad depot: a shop on the Mochi pad (the whole shop without stations, a kiosk with them) ----------------

  function padDepotNear(g) {
    if (g.status !== 'landed' || !g.landedOn || g.landedOn.id !== 'mochi' || !g.land) return false;
    const a = Math.atan2(g.land.ly, g.land.lx);
    return Math.abs(((a - Math.PI / 2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * g.landedOn.R < 25;
  }
  function interactions(g) {
    if (g.mode !== 'ship' || g.ui || !padDepotNear(g)) return null;
    return [{ key: 'KeyF', text: 'Open the pad depot shop', dist: 5, col: '#ffd166', act: (g2) => openShop(g2, padDepot()) }];
  }


  // ======================================================================
  //  DRAWING: Orion blast, screen flash, the pusher plate
  // ======================================================================

  function drawWorld(g, kit) {
    const m = st(g), ctx = kit.ctx, px = kit.px();
    if (m.orion > 0 && g.status !== 'dead') drawPusherPlate(g, kit);
    const B = m.blast; if (!B) return;
    const age = g.real - B.real, k = Math.min(1, age / 0.9);
    if (k >= 1) return;
    const x = B.x + B.vx * (g.t - B.t), y = B.y + B.vy * (g.t - B.t);
    const R = Math.max(6 + 26 * Math.sqrt(k), (40 + 160 * Math.sqrt(k)) * px);
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    starPath(ctx, x, y, R * 1.25, R * 0.8, 14, age * 2);
    ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.strokeStyle = kit.INK; ctx.lineWidth = 3 * px; ctx.lineJoin = 'round'; ctx.stroke();
    starPath(ctx, x, y, R * 0.95, R * 0.6, 14, -age * 3);
    ctx.fillStyle = '#ffe066'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + kit.LIGHT[0] * R * 0.12, y + kit.LIGHT[1] * R * 0.12, R * 0.38, 0, 2 * Math.PI);
    ctx.fillStyle = '#fffbe8'; ctx.fill();
    ctx.globalAlpha = Math.max(0, 0.8 - k);
    ctx.beginPath(); ctx.arc(x, y, R * (1.3 + 0.8 * k), 0, 2 * Math.PI);
    ctx.strokeStyle = '#fff4dc'; ctx.lineWidth = Math.max(0.6, 6 * px); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function starPath(ctx, x, y, r1, r2, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < 2 * n; i++) {
      const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1 * (0.85 + 0.15 * Math.sin(i * 2.7));
      i ? ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
  }

  // a split pusher plate on shock absorbers behind the nozzle, sized like the core's ship sprite (springs squash when landed)
  function drawPusherPlate(g, kit) {
    const ctx = kit.ctx, sh = g.sh, px = kit.px(), u = Math.max(g.S.length, 34 * px) / 10;
    const x0 = g.status === 'landed' ? -5.0 * u : -6.0 * u, lw = Math.max(2 * px, 0.2 * u);
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.ang);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-3.6 * u, s * 1.5 * u); ctx.lineTo(x0 + 0.4 * u, s * 2.0 * u);       // shock absorber
      ctx.strokeStyle = kit.INK; ctx.lineWidth = Math.max(4 * px, 0.6 * u); ctx.stroke();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = Math.max(2 * px, 0.32 * u); ctx.stroke();
      ctx.beginPath();                                                                               // plate half: a shallow dish
      ctx.moveTo(x0 + 0.35 * u, s * 0.95 * u); ctx.lineTo(x0 + 0.35 * u, s * 3.5 * u);
      ctx.quadraticCurveTo(x0 - 0.2 * u, s * 3.6 * u, x0 - 0.45 * u, s * 3.2 * u);
      ctx.lineTo(x0 - 0.45 * u, s * 0.95 * u); ctx.closePath();
      ctx.fillStyle = '#9b97b8'; ctx.fill();
      ctx.fillStyle = '#c9c4e8'; ctx.fillRect(x0 + 0.05 * u, s > 0 ? 1.2 * u : -3.1 * u, 0.25 * u, 1.9 * u);
      ctx.strokeStyle = kit.INK; ctx.lineWidth = lw; ctx.stroke();
    }
    ctx.restore();
  }

  function drawScreen(g, kit) {
    const B = st(g).blast; if (!B) return;
    const age = g.real - B.real; if (age > 0.4) return;
    const ctx = kit.ctx;
    ctx.fillStyle = `rgba(255,250,225,${(0.85 * (1 - age / 0.4)).toFixed(3)})`;
    ctx.fillRect(0, 0, kit.W, kit.H);
  }


  // ======================================================================
  //  REGISTER (+ jobs). Filtered out by ?mods= -> Econ stays undefined, so other modules fall back.
  // ======================================================================

  const api = {
    openShop, closeShop, sellPrice, sellAll, sell, refuel, restockRcs, repair, quote, grant, randomBlueprint, CATALOG,
    buy, canBuy, priceOf, install, equip, setFuel, setIonFuel, bestFuel, firePulse, holdValue, valueOf, buyMult, hubStation,
    previewS, metrics, twrOn, owns, tierOf: (g, lineId) => tierOf(st(g), LINES.find((L) => L.id === lineId)),
    tierIndex: (g, lineId) => tierIndex(st(g), LINES.find((L) => L.id === lineId)), engineOf: (g) => engineOf(st(g)),
    fuelOf: (g, eid) => fuelOf(st(g), eid), ionFuelOf: (g) => ionFuelOf(st(g)), state: st, isp,
    fuelPrice, ionPrice, rcsPrice, repairPrice, sellsTab, sellsOrion, orionTab,
    padDepotNear, padDepot, ENGINES, FUELS, ION_FUELS, ION, LINES, TIER, ORION, BY_ID, HUB, PAD_DEPOT, PAD_KIOSK, ALL_TABS, BASE_VOL,
  };

  const mod = { id: 'economy', init, load, save, stats, onKey, shipCtrl, frame, respawn, died,
                hudRows, hint, interactions, drawWorld, drawScreen };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;

  Game.addGoals([
    { id: 'sell',    order: 40, reward: 100,  text: 'Sell cargo at a shop',
      test: (g) => (g.mod.economy ? g.mod.economy.stats.sold : 0) > 0 },
    { id: 'upgrade', order: 50, reward: 100,  text: 'Buy your first upgrade',
      test: (g) => (g.mod.economy ? g.mod.economy.stats.bought : 0) > 0 },
    { id: 'orion',   order: 80, reward: 300,  text: 'Fire an Orion nuclear pulse (N)',
      test: (g) => (g.mod.economy ? g.mod.economy.stats.fired : 0) > 0 },
    { id: 'rich',    order: 99, reward: 1000, text: 'Bank $20,000',
      test: (g) => g.money >= 20000 },
  ]);
  return api;
})();

if (typeof module !== 'undefined') module.exports = Econ;
