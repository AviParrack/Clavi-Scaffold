// ======================================================================
//  ECONOMY  —  money rules, prices, the upgrade catalog (frames, engines,
//  fuels, ship / haul / suit / weapon lines, crack charges), frame-aware
//  ship stats, station services, tow fees, economy jobs, the Orion pulse
//  (N) and dev mode (∞ money, the Debug Duck shop anywhere, top-ups, builds).
//  Every part has an honest mass, so every purchase shows up in delta-v.
//  The DOM shop lives in shop.js and drives this through the Econ API.
// ======================================================================

const Econ = (() => {

  const ITEMS = CONFIG.items, SHIP0 = CONFIG.ship, G0 = 9.81, ISP_SCALE = CONFIG.ISP_SCALE;
  const dict = (o) => Object.assign(Object.create(null), o);       // lookup tables immune to 'toString' / '__proto__' ids
  const itemOf = (id) => (Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null);
  const isp = (ve) => ve * ISP_SCALE / G0;                         // real-equivalent specific impulse [s]
  const jetPower = (T, ve) => 0.5 * T * 1000 * ve * ISP_SCALE;     // real-equivalent jet power [W] (T in kN, game ve)
  const ALL_TABS = ['services', 'sell', 'ship', 'haul', 'suit', 'weapons'];
  const TNT = 4.184e6;                                             // J per kg of TNT (the definition)

  // ---------------- frames: the ship visibly grows (tank / hold / hull are bases the line tiers multiply) ----------------
  const FRAMES = dict({
    prospector: { name: 'Prospector', price: 0, dry: 1.0, k: 1, tank: 1.4, hold: 300, hull: 100, length: 9, radius: 4, mount: 1, turn: 1.00, towTierMax: 2,
                  desc: 'Your first ship. Nine metres of honest toast-scented courage.' },
    mule:       { name: 'Pack Mule', price: 2500, dry: 2.4, k: 2.5, tank: 3.5, hold: 600, hull: 160, length: 11.5, radius: 5, mount: 2, turn: 0.85, towTierMax: 2,
                  desc: 'Saddlebags, four legs and a bobble antenna. Stubborn in the good way.' },
    hauler:     { name: 'Hauler', price: 8000, dry: 6, k: 6, tank: 8.4, hold: 1200, hull: 240, length: 14.5, radius: 6.5, mount: 3, turn: 0.70, towTierMax: 3,
                  desc: 'A bumper nose with hazard stripes, for pushing boulders around like furniture.' },
    barge:      { name: 'Bulk Barge', price: 18000, dry: 15, k: 15, tank: 21, hold: 2400, hull: 320, length: 19, radius: 8.5, mount: 4, turn: 0.55, towTierMax: 3,
                  desc: 'A flying hopper with searchlights. Parks like a sofa, hauls like a quarry.' },
    leviathan:  { name: 'Leviathan', price: 40000, dry: 40, k: 40, tank: 56, hold: 4800, hull: 480, length: 26, radius: 11, mount: 5, turn: 0.45, towTierMax: 4,
                  desc: 'A space whale with radiator fins and a very tiny pilot. Exactly as wide as Seed.' },
  });
  const FRAME_ORDER = Object.keys(FRAMES);

  // ---------------- fuels: density [t/m^3], price [$/t]; hub: only Mochi Hub sells it ----------------
  const FUELS = dict({
    methalox:   { name: 'Methalox',          short: 'methalox',   dens: 1.0,  price: 30,  desc: 'Methane + oxygen. The sensible sandwich.' },
    kerolox:    { name: 'Kerolox',           short: 'kerolox',    dens: 1.2,  price: 22,  desc: 'Kerosene + oxygen. Dense, cheap, a bit sooty.' },
    hypergolic: { name: 'Hypergolic',        short: 'hypergolic', dens: 1.3,  price: 65,  desc: 'Lights itself on contact. Dense, storable, deeply rude.' },
    hydrolox:   { name: 'Hydrolox',          short: 'hydrolox',   dens: 0.45, price: 60,  desc: 'Hydrogen + oxygen. Best chemical Isp, fluffy as a cloud.' },
    lh2:        { name: 'Liquid hydrogen',   short: 'hydrogen',   dens: 0.22, price: 90,  desc: 'Hot hydrogen out of a reactor. Superb Isp, takes up a LOT of room.' },
    ammonia:    { name: 'Ammonia',           short: 'ammonia',    dens: 0.8,  price: 20,  desc: 'Denser than hydrogen, less Isp. Smells like a gym bag.' },
    dd:         { name: 'Deuterium',         short: 'deuterium',  dens: 0.17, price: 150, hub: true, desc: 'Heavy hydrogen. Fuses if you ask nicely and very hot.' },
    dhe3:       { name: 'D-He3',             short: 'D-He3',      dens: 0.12, price: 600, hub: true, desc: "Deuterium plus helium-3. Fusion's champagne. Barely any neutrons, barely any wallet left." },
    augment:    { name: 'Afterburner slush', short: 'slush',      dens: 0.8,  price: 30,  hub: true, desc: 'Ammonia with a pinch of D-He3. Fusion shoves it out the back ten times harder.' },
  });
  const ION_FUELS = dict({
    xenon:   { name: 'Xenon',   short: 'xenon',   dens: 1.6, price: 600, ve: 3900, desc: 'Heavy noble gas: packs dense, costs a fortune.' },
    krypton: { name: 'Krypton', short: 'krypton', dens: 0.9, price: 160, ve: 4500, desc: 'Cheaper and higher Isp, but the tank holds less.' },
  });
  const BASE_VOL = SHIP0.fuel / FUELS[SHIP0.fuelType].dens;      // stock tank volume [m^3] (1.4)

  // ---------------- engines: thrust [kN] (thrustBy: per fuel, for power-limited drives T = 2P / ve), mass [t], mount size ----------------
  const ENGINES = dict({
    sparrow:   { name: 'Sparrow', kind: 'chem', mount: 1, price: 0, thrust: 7, mass: 0, fuels: { methalox: 450, kerolox: 414 },
                 desc: 'Trusty stock engine. Smells faintly of toast.' },
    brick:     { name: 'Brick', kind: 'chem', mount: 1, price: 2200, thrust: 16, mass: 0.35, fuels: { kerolox: 375, hypergolic: 390 },
                 desc: 'Aerodynamics of a fridge, push of an angry fridge. Lifts anything off anything.' },
    kestrel:   { name: 'Kestrel', kind: 'chem', mount: 1, price: 4500, thrust: 8, mass: 0.12, fuels: { hydrolox: 570, methalox: 474 },
                 desc: 'Light, efficient hydrolox sipper. Shines with a bigger tank.' },
    nerva:     { name: 'NERVA-chan', kind: 'ntr', mount: 1, price: 9500, thrust: 6, mass: 0.55, fuels: { lh2: 1140, ammonia: 645 }, thrustBy: { ammonia: 10.6 },
                 desc: 'A tiny nuclear reactor that believes in you. Fixed power: fluffy hydrogen sips, dense ammonia shoves.' },
    bulldog:   { name: 'Bulldog', kind: 'chem', mount: 2, price: 5000, thrust: 36, mass: 0.9, fuels: { methalox: 465, kerolox: 426 },
                 desc: 'Twin bells, one braincell. Pulls like a dog that has just seen a squirrel.' },
    nervasama: { name: 'NERVA-sama', kind: 'ntr', mount: 3, price: 18000, thrust: 40, mass: 3.2, fuels: { lh2: 1150, ammonia: 650 }, thrustBy: { ammonia: 70.8 },
                 desc: 'NERVA-chan grew up: same believing heart, 184 MW of it, and two teal coolant pipes.' },
    pocketsun: { name: 'Pocket Sun', kind: 'fusion', mount: 4, price: 38000, thrust: 150, mass: 9, fuels: { dhe3: 20000, dd: 12000, augment: 2000 },
                 thrustBy: { dd: 125, augment: 1500 }, desc: 'A small star in a magnetic bottle. Do not shake the bottle.' },
    sunflower: { name: 'Sunflower torch', kind: 'fusion', mount: 5, price: 70000, thrust: 400, mass: 24, fuels: { dhe3: 25000, dd: 15000, augment: 2500 },
                 thrustBy: { dd: 333, augment: 4000 }, desc: 'The fusion beast. Forty gigawatts out the back. Point it away from anything you love.' },
  });
  const ION = { id: 'whisper', name: 'Whisper ion drive', price: 8000, thrust: 0.25, mass: 0.25, vol: 0.25,
                desc: 'Pushes like a sheet of paper. Forever. X toggles it; time warp up to 16x while it hums.' };

  // ---------------- upgrade lines (tiers replace each other; mass in t, ship-tab masses scale with the frame's k) ----------------
  const BOMB = (kg) => Math.round(kg * TNT);
  const LINES = [
    { id: 'tank', tab: 'ship', name: 'Fuel tank', stock: `Stock tank (${BASE_VOL} m³ on a Prospector)`, tiers: [
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
    { id: 'side', tab: 'ship', name: 'Side pods', stock: 'No side pods', how: '←/→ strafe · Shift+←/→ the old RCS nudge', tiers: [
      { id: 'side1', name: 'Sidekicks',   price: 350,  mass: 0.06, set: { sideThrust: 1.8, dashBoost: 0, dashCd: 0 },   desc: 'Little side pods. Strafe like you mean it, gently.' },
      { id: 'side2', name: 'Strafe pods', price: 1200, mass: 0.12, set: { sideThrust: 4.5, dashBoost: 4, dashCd: 1.5 }, desc: 'Double-tap ←/→ to dodge. Pirates hate this one trick.' },
      { id: 'side3', name: 'Dodge jets',  price: 3500, mass: 0.22, set: { sideThrust: 8.0, dashBoost: 5, dashCd: 1.0 }, desc: 'Sideways is a direction too. Double-tap for a ×5 dash.' } ] },
    { id: 'tractor', tab: 'ship', name: 'Tractor beam', stock: 'No tractor', tiers: [
      { id: 'tractor1', name: 'Ore magnet',   price: 500,  mass: 0.03, set: { tractor: 4 }, desc: 'Pulls loose ore and gems into the hold from further away.' },
      { id: 'tractor2', name: 'Tractor beam', price: 1500, mass: 0.06, set: { tractor: 9 }, desc: 'A fancier magnet with a light show.' } ] },
    { id: 'scanner', tab: 'ship', name: 'Gem scanner', stock: 'No scanner', tiers: [
      { id: 'scanner1', name: 'Gem pinger',   price: 600,  mass: 0.01, set: { scanner: 1 }, desc: 'Pings buried gems within 25 m while you walk, and rock types within 300 m.' },
      { id: 'scanner2', name: 'Deep scanner', price: 2000, mass: 0.02, set: { scanner: 2 }, desc: 'Every buried gem on the rock and every rock type on screen. Spoilers!' } ] },

    { id: 'tow', tab: 'haul', name: 'Tow gear', stock: 'No tow gear', how: 'G grapple · Q reel in · Z pay out · F sell at a buyer', tiers: [
      { id: 'tow1', name: 'Tow hook',      price: 450,   mass: 0.04, set: { towMax: 80,    cableLen: 25, reelV: 0.6 }, desc: 'A hook on a rope. The oldest towing technology in two star systems, now in space.' },
      { id: 'tow2', name: 'Harpoon winch', price: 2000,  mass: 0.15, set: { towMax: 800,   cableLen: 40, reelV: 1.0 }, desc: 'Fires a harpoon, reels a boulder. Whales not included.' },
      { id: 'tow3', name: 'Tug claw',      price: 7500,  mass: 0.8,  set: { towMax: 6000,  cableLen: 60, reelV: 1.5 }, desc: 'Three fingers, zero chill.' },
      { id: 'tow4', name: 'Big Hug',       price: 22000, mass: 3.0,  set: { towMax: 40000, cableLen: 90, reelV: 2.5 }, desc: 'Two enormous arms. It just wants to hold something.' } ] },

    { id: 'suit', tab: 'suit', name: 'Suit', stock: 'Stock suit', tiers: [
      { id: 'suit1', name: 'Padded suit',  price: 250,  carry: 0,  set: { suitTier: 1, suitHp: 150, suitArmor: 0,    suitMass: 5,   walkMult: 1,    jumpMult: 1,    fallSafe: 8 },  desc: 'Quilted. Bug-bite resistant. Very huggable.' },
      { id: 'suit2', name: 'Armored suit', price: 800,  carry: 0,  set: { suitTier: 2, suitHp: 220, suitArmor: 0.10, suitMass: 20,  walkMult: 1,    jumpMult: 1,    fallSafe: 9 },  desc: 'You clank when you walk. Worth it.' },
      { id: 'suit3', name: 'Strider exo',  price: 3500, carry: 40, set: { suitTier: 3, suitHp: 300, suitArmor: 0.15, suitMass: 60,  walkMult: 1.25, jumpMult: 1.2,  fallSafe: 11 }, desc: 'Struts, servos and a fresh sense of purpose.' },
      { id: 'suit4', name: 'Mecha-Pip',    price: 9000, carry: 90, set: { suitTier: 4, suitHp: 420, suitArmor: 0.25, suitMass: 140, walkMult: 1.4,  jumpMult: 1.35, fallSafe: 15 }, desc: 'A two-metre robot suit with a tiny green face in the window. Hard landings say CLANK.' } ] },
    { id: 'sprint', tab: 'suit', name: 'Sprint', stock: 'No sprint', how: 'hold Shift on foot (air ×1.5 while sprinting)', tiers: [
      { id: 'sprint1', name: 'Zoom sneakers', price: 250, set: { sprint: 1.6 }, desc: 'Velcro. Rocket-grade velcro.' },
      { id: 'sprint2', name: 'Rocket skates', price: 900, set: { sprint: 2.2 }, desc: "Technically illegal on Mochi's pavements. Mochi has no pavements." } ] },
    { id: 'roll', tab: 'suit', name: 'Dive roll', stock: 'No roll', how: 'C dives the way you walk; you cannot be hit mid-roll', tiers: [
      { id: 'roll1', name: 'Tumble pads', price: 400,  set: { roll: 1, rollDist: 3.0, rollT: 0.45, rollIframes: 0.30, rollCd: 1.2, rollAir: 0 }, desc: 'Knee pads, elbow pads, pad pads. Tuck and roll!' },
      { id: 'roll2', name: 'Gyro roll',   price: 1400, set: { roll: 2, rollDist: 4.5, rollT: 0.40, rollIframes: 0.35, rollCd: 0.8, rollAir: 3 }, desc: 'A gyroscope in your belly button. Rolls in mid-air too (a 3 m/s jet dash).' } ] },
    { id: 'bomb', tab: 'suit', name: 'Bombs', stock: 'No bombs', how: 'hold right mouse to aim, release to throw · B throws at the cursor', tiers: [
      { id: 'bomb1', name: 'Pop Rocks',     price: 600,  set: { bombs: 2, bombDmg: 30, bombR: 1.8, bombDig: 1.6, bombE: BOMB(0.12), bombKg: 0.5, bombCd: 8,   bombFuse: 1.8, bombV: 6,  bombSticky: 0 }, desc: 'Candy-pink and very rude. Pop goes the regolith.' },
      { id: 'bomb2', name: 'Boom Berries',  price: 1800, set: { bombs: 3, bombDmg: 50, bombR: 2.4, bombDig: 2.3, bombE: BOMB(0.36), bombKg: 1,   bombCd: 6,   bombFuse: 1.6, bombV: 8,  bombSticky: 0 }, desc: 'Three in a bunch. Not for eating. Legal says we have to say that.' },
      { id: 'bomb3', name: 'Thunder Pucks', price: 4500, set: { bombs: 4, bombDmg: 80, bombR: 3.2, bombDig: 3.4, bombE: BOMB(1.2),  bombKg: 2,   bombCd: 4.5, bombFuse: 1.4, bombV: 10, bombSticky: 1 }, desc: 'Sticks to whatever it hits, then thunders. Helmets count as earplugs.' } ] },
    { id: 'tether', tab: 'suit', name: 'Tether', stock: 'Stock tether (30 m)', how: 'E steps out while flying · Q winches you home', tiers: [
      { id: 'tether1', name: 'Long leash',  price: 300,  set: { tetherLen: 60,  reelA: 1.5 }, desc: 'Twice the rope, twice the confidence.' },
      { id: 'tether2', name: 'Bungee pro',  price: 900,  set: { tetherLen: 100, reelA: 2.5 }, desc: 'Not actually bouncy. We tested. Twice.' },
      { id: 'tether3', name: 'Space yo-yo', price: 2200, set: { tetherLen: 160, reelA: 4.0 }, desc: 'Walk the dog. The dog is you.' } ] },
    { id: 'pack', tab: 'suit', name: 'Backpack', stock: 'Stock backpack', tiers: [
      { id: 'pack1', name: 'Big backpack',    price: 250,  set: { packCap: 70 },  desc: 'Holds more rocks. Your spine has questions.' },
      { id: 'pack2', name: 'Huge backpack',   price: 800,  set: { packCap: 110 }, desc: 'Your spine has filed a formal complaint.' },
      { id: 'pack3', name: 'Kangaroo pouch',  price: 1800, set: { packCap: 160 }, desc: 'Front-mounted. Bounces when you walk. Dignity sold separately.' } ] },
    { id: 'o2', tab: 'suit', name: 'Oxygen', stock: 'Stock air', tiers: [
      { id: 'o2a', name: 'Spare air tank', price: 200,  set: { o2: 300 },  desc: 'More breathing. Highly recommended by doctors.' },
      { id: 'o2b', name: 'Rebreather',     price: 700,  set: { o2: 600 },  desc: 'Recycles your breath. Minty.' },
      { id: 'o2c', name: 'Algae lung',     price: 1800, set: { o2: 1200 }, desc: 'A little green friend who breathes for you. Name it.' } ] },
    { id: 'jet', tab: 'suit', name: 'Jetpack', stock: 'Stock jetpack', tiers: [
      { id: 'jet1', name: 'Hopper pack',  price: 300,  set: { jet: 4.0, jetFuel: 8 },  desc: 'More hop per hop.' },
      { id: 'jet2', name: 'Rocket boots', price: 900,  set: { jet: 5.5, jetFuel: 12 }, desc: 'Like a jetpack, but on your feet. Do not ask how.' },
      { id: 'jet3', name: 'Comet pack',   price: 2400, set: { jet: 7.0, jetFuel: 18 }, desc: '126 m/s of Δv on your back. Please be careful.' } ] },
    { id: 'laser', tab: 'suit', name: 'Mining laser', stock: 'Stock laser', tiers: [
      { id: 'laser1', name: 'Laser mk2',   price: 400,  set: { laserPower: 1.8, laserRange: 9,  laserDps: 28 }, desc: 'Digs faster. Also toasts sandwiches.' },
      { id: 'laser2', name: 'Laser mk3',   price: 1200, set: { laserPower: 3.0, laserRange: 11, laserDps: 42 }, desc: 'Cuts nickel like butter. Cold butter, but still.' },
      { id: 'laser3', name: 'Laser mk4',   price: 3000, set: { laserPower: 4.5, laserRange: 13, laserDps: 60 }, desc: 'Platinum? Never heard of her.' },
      { id: 'laser4', name: 'Mk5 Sunbeam', price: 7500, set: { laserPower: 6.5, laserRange: 16, laserDps: 85 }, desc: "It's a mining laser. It's also, technically, a death ray. Mostly mining." } ] },
    { id: 'xlate', tab: 'suit', name: 'Translator', stock: 'No translator', how: 'alien speech bubbles turn into words', tiers: [
      { id: 'xlate1', name: 'Pocket Phrasebook',    price: 400,  set: { translator: 1 }, desc: 'Clips to your helmet. Gets about half the words, every number and every name.' },
      { id: 'xlate2', name: 'Universal Translator', price: 1800, set: { translator: 2 }, desc: 'Every word, every race. Orbiloon-built, Bot-tested. Rust says it fell off a freighter.' } ] },

    { id: 'gun', tab: 'weapons', name: 'Ship guns', stock: 'No guns', how: 'Space fires', tiers: [
      { id: 'gun1', name: 'Pea shooter',  price: 700,  mass: 0.05, set: { gun: 1, gunDmg: 8,  gunRate: 4, gunSpeed: 60 },  desc: 'Fires peas. Metal peas. Fast. Space to shoot.' },
      { id: 'gun2', name: 'Rivet gun',    price: 1800, mass: 0.08, set: { gun: 2, gunDmg: 14, gunRate: 6, gunSpeed: 80 },  desc: 'Builds holes in pirates.' },
      { id: 'gun3', name: 'Mass driver',  price: 4000, mass: 0.14, set: { gun: 3, gunDmg: 26, gunRate: 7, gunSpeed: 110 }, desc: 'A railgun that does its own taxes.' } ] },
    { id: 'turret', tab: 'weapons', name: 'Turret', stock: 'Nose-mounted guns', tiers: [
      { id: 'turret', name: 'Swivel turret', price: 2000, mass: 0.06, set: { turret: 1 }, desc: 'Your guns aim at the mouse instead of your nose. Needs a gun.' } ] },
  ];
  const LINE = dict(Object.fromEntries(LINES.map((L) => [L.id, L])));
  const TIER = dict({});                                                 // tier id -> { line, tier (1-based), ...tier }
  for (const L of LINES) L.tiers.forEach((t, i) => { TIER[t.id] = { ...t, line: L, tier: i + 1 }; });
  const scaled = (L) => L.tab === 'ship';                                // these part masses grow with the frame (k)

  // every S field the v4 stats hook owns, at its stock value (contract §3.2); readers default with ?? to the same
  const STOCK = {
    frameId: 'prospector', frameName: 'Prospector', mount: 1, k: 1, turnMult: 1, towTierMax: 2,
    sideThrust: 0, sideVe: 0, dashBoost: 0, dashT: 0.4, dashCd: 0,
    towTier: 0, towMax: 0, cableLen: 0, reelV: 0,
    suitTier: 0, suitArmor: 0, suitMass: 0, walkMult: 1, jumpMult: 1, fallSafe: 8, sprint: 1,
    roll: 0, rollDist: 0, rollT: 0.45, rollIframes: 0, rollCd: 1.2, rollAir: 0,
    bombs: 0, bombDmg: 0, bombR: 0, bombDig: 0, bombE: 0, bombKg: 0.5, bombCd: 8, bombFuse: 1.8, bombV: 6, bombSticky: 0,
    tetherLen: 30, reelA: 1.0, translator: 0,
  };

  // ---------------- consumables: Orion pulse units, crack charges ----------------
  const ORION = { id: 'orion', name: 'Orion pulse unit', price: 450, hubMult: 1.8, mass: 0.05, max: 3, cooldown: 1.2,
                  bombDist: 12, craterAlt: 25,
                  desc: 'A small nuclear charge you kick out the back. Freeman Dyson approved. N fires one.' };
  const CHARGES = dict({
    crack1: { name: 'Cracker',    short: 'C', tnt: 5,   price: 60,   max: 6, mass: 0.008, desc: 'A small charge for small problems. Fist-sized rocks fear it.' },
    crack2: { name: 'Splitter',   short: 'S', tnt: 50,  price: 350,  max: 4, mass: 0.06,  desc: 'For when the rock is bigger than your feelings.' },
    crack3: { name: 'Rock Opera', short: 'O', tnt: 500, price: 2000, max: 2, mass: 0.6,   desc: 'Half a tonne of TNT and a dramatic pause. Encores happen.' },
  });
  for (const c of Object.values(CHARGES)) c.E = c.tnt * TNT;
  // rock types for the shop's haul guide when haul.js is off (haul's own Haul.TYPES wins when present)
  const ROCKS = dict({
    gravel:  { rho: 1.9, perT: 2,  Q: 20,  rMax: Infinity, col: ['#b9aac4', '#7d6e92', '#e4dcee'] },
    slush:   { rho: 1.2, perT: 4,  Q: 15,  rMax: Infinity, col: ['#cfeaff', '#7fb2d6', '#ffffff'] },
    clank:   { rho: 4.0, perT: 12, Q: 150, rMax: 6,        col: ['#a9b4c8', '#5f6a85', '#e8eef8'] },
    sparkle: { rho: 3.0, perT: 30, Q: 80,  rMax: 4,        col: ['#d9cdfa', '#8f7bc7', '#ffffff'] },
  });

  // ---------------- services & fees ----------------
  const RCS_PRICE = 1.5, REPAIR_PRICE = 1.2, TOW_FEE = { tow: 110, crash: 180 }, FEE_MIN = 100, FEE_MAX = 250;
  const BLUEPRINT_MAX = 10000;                                           // wrecks never hand out frames or anything dearer

  // ---------------- the catalog other modules see ----------------
  const CATALOG = [
    ...FRAME_ORDER.filter((id) => id !== 'prospector')
      .map((id) => ({ id, name: FRAMES[id].name, cat: 'ship', group: 'frame', price: FRAMES[id].price, desc: FRAMES[id].desc })),
    ...Object.entries(ENGINES).filter(([id]) => id !== 'sparrow')
      .map(([id, e]) => ({ id, name: e.name, cat: 'ship', group: 'engine', price: e.price, desc: e.desc })),
    { id: ION.id, name: ION.name, cat: 'ship', group: 'ion', price: ION.price, desc: ION.desc },
    ...LINES.flatMap((L) => L.tiers.map((t, i) => ({ id: t.id, name: t.name, cat: L.tab, group: L.id, tier: i + 1, price: t.price, desc: t.desc }))),
    { id: ORION.id, name: ORION.name, cat: 'weapons', group: 'orion', price: ORION.price, desc: ORION.desc, consumable: true },
    ...Object.entries(CHARGES).map(([id, c]) => ({ id, name: c.name, cat: 'haul', group: 'charge', price: c.price, desc: c.desc, consumable: true })),
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

  // ---------------- dev mode: ∞ money pin, the Debug Duck's shop anywhere (O), top-ups (U), builds ----------------
  const DEV_MONEY = 1e9;
  const DEV_SHOP = { id: 'dev', name: "Debug Duck's Everything Emporium", kind: 'dev', keeper: 'Debug Duck', buy: {},
                     tabs: ['dev', ...ALL_TABS], fuelMult: 0, repairMult: 0,
                     blurb: 'Explain your bug to me. Slowly. ...Quack.' };
  const BUILDS = dict({
    dinky:  { name: 'Dinky',        frame: 'prospector', engine: 'sparrow',   fuel: 'methalox', parts: [] },
    tow:    { name: 'First tow',    frame: 'prospector', engine: 'sparrow',   fuel: 'methalox', parts: ['tow1', 'side1'] },
    brick:  { name: 'Brick tug',    frame: 'prospector', engine: 'brick',     fuel: 'kerolox',  parts: ['tank2', 'cargo1', 'rcs1', 'tow2', 'side2'] },
    mule:   { name: 'Mule',         frame: 'mule',       engine: 'bulldog',   fuel: 'methalox', parts: ['tank1', 'cargo1', 'rcs1', 'tow2', 'side2'] },
    hauler: { name: 'Hauler',       frame: 'hauler',     engine: 'nervasama', fuel: 'ammonia',  parts: ['tank2', 'cargo2', 'rcs2', 'hull1', 'armor1', 'tow3', 'side2'] },
    barge:  { name: 'Barge',        frame: 'barge',      engine: 'pocketsun', fuel: 'dd',       parts: ['tank3', 'cargo2', 'rcs2', 'hull2', 'armor2', 'tractor1', 'tow3', 'side3'] },
    beast:  { name: 'Fusion Beast', frame: 'leviathan',  engine: 'sunflower', fuel: 'dhe3',     parts: ['tank2', 'cargo3', 'rcs2', 'hull3', 'armor2', 'tractor2', 'gun3', 'tow4', 'side3'] },
    suit:   { name: 'Suit max', suit: true },
  });


  // ======================================================================
  //  STATE
  // ======================================================================

  const noCharges = () => Object.fromEntries(Object.keys(CHARGES).map((id) => [id, 0]));
  const fresh = () => ({
    owned: {}, engine: 'sparrow', frame: 'prospector', fuelOf: { sparrow: 'methalox' }, ionFuel: 'xenon', orion: 0, charges: noCharges(),
    station: null, blast: null, lastPulse: -99, inf: false, wallet: 0, moon: false,
    stats: { sold: 0, spent: 0, bought: 0, fired: 0, fees: 0, blueprints: 0, strafed: 0 },
  });
  const st = (g) => g.mod.economy || (g.mod.economy = fresh());
  const owns = (g, id) => id === 'sparrow' || id === 'prospector' || !!st(g).owned[id];
  const has = (id) => Game.mods.some((m) => m.id === id);
  const on = (g, id) => !!(g.mod && g.mod[id]);
  const stationsOn = () => typeof Stations !== 'undefined' && has('stations');

  function tierOf(m, L) {                                          // highest owned tier of a line, or null (stock)
    for (let i = L.tiers.length - 1; i >= 0; i--) if (m.owned[L.tiers[i].id]) return L.tiers[i];
    return null;
  }
  const tierIndex = (m, L) => { const t = tierOf(m, L); return t ? TIER[t.id].tier : 0; };
  const engineOf = (m) => (ENGINES[m.engine] ? m.engine : 'sparrow');
  const frameOf = (m) => (FRAMES[m.frame] ? m.frame : 'prospector');
  function fuelOf(m, eid = engineOf(m)) {
    const f = m.fuelOf[eid];
    return ENGINES[eid].fuels[f] ? f : Object.keys(ENGINES[eid].fuels)[0];
  }
  const ionFuelOf = (m) => (ION_FUELS[m.ionFuel] ? m.ionFuel : 'xenon');
  const isInf = (g) => !!(g && g.dev && g.mod && g.mod.economy && g.mod.economy.inf);

  function init(g) { g.mod.economy = fresh(); st(g).inf = !!g.dev; }

  function save(g) {
    const m = st(g);
    return { v: 2, owned: Object.keys(m.owned).filter((id) => m.owned[id]), engine: m.engine, frame: m.frame, fuelOf: m.fuelOf,
             ionFuel: m.ionFuel, orion: m.orion, charges: { ...m.charges }, stats: m.stats };
  }

  function load(g, d) {
    if (!d || typeof d !== 'object') return;
    const m = st(g);
    for (const id of Array.isArray(d.owned) ? d.owned : []) if ((BY_ID[id] && !BY_ID[id].consumable)) m.owned[id] = true;
    if (FRAMES[d.frame] && owns(g, d.frame)) m.frame = d.frame;
    if (ENGINES[d.engine] && owns(g, d.engine)) m.engine = d.engine;
    if (ENGINES[m.engine].mount > FRAMES[frameOf(m)].mount) m.engine = bestEngineFor(m, FRAMES[frameOf(m)].mount);
    if (d.fuelOf && typeof d.fuelOf === 'object')
      for (const [e, f] of Object.entries(d.fuelOf)) if (ENGINES[e] && ENGINES[e].fuels[f]) m.fuelOf[e] = f;
    if (ION_FUELS[d.ionFuel]) m.ionFuel = d.ionFuel;
    m.orion = Math.max(0, Math.min(ORION.max, Math.floor(+d.orion || 0)));
    if (d.charges && typeof d.charges === 'object')
      for (const [id, c] of Object.entries(CHARGES)) m.charges[id] = Math.max(0, Math.min(c.max, Math.floor(+d.charges[id] || 0)));
    if (d.stats && typeof d.stats === 'object') for (const k in m.stats) if (isFinite(d.stats[k])) m.stats[k] = +d.stats[k];
  }


  // ======================================================================
  //  STATS HOOK: the frame + owned parts (every part's mass is counted)
  // ======================================================================

  function stats(g, S) {
    const m = st(g), fid = frameOf(m), F = FRAMES[fid], k = F.k;
    Object.assign(S, STOCK);
    S.frameId = fid; S.frameName = F.name; S.name = F.name; S.mount = F.mount; S.k = k; S.turnMult = F.turn; S.towTierMax = F.towTierMax;
    S.length = F.length; S.radius = F.radius; S.dry = F.dry;
    const parts = [[`${F.name} frame & cockpit`, F.dry]];
    const add = (name, t) => { if (t) { S.dry += t; parts.push([name, t]); } };
    let carry = 0;
    for (const L of LINES) {
      const t = tierOf(m, L);
      if (!t) continue;
      if (L.id === 'tow') { towStats(S, L, t, F); add(t.name, t.mass); continue; }
      Object.assign(S, t.set);
      carry += t.carry || 0;
      add(t.name, (t.mass || 0) * (scaled(L) ? k : 1));
    }
    S.tankVol = Math.round(F.tank * (S.tankVol || BASE_VOL) / BASE_VOL * 1e9) / 1e9;   // tank / hold / hull tiers multiply the frame's base
    S.cargoCap = Math.round(F.hold * S.cargoCap / SHIP0.cargoCap);
    S.hull = Math.round(F.hull * S.hull / SHIP0.hull);
    S.rotAccel *= F.turn;
    S.sideThrust *= k;
    S.packCap += carry;

    const eid = engineOf(m), E = ENGINES[eid], fu = fuelOf(m), FU = FUELS[fu];
    S.engine = eid; S.engineName = E.name; S.engineKind = E.kind; S.engineMount = E.mount;
    S.thrust = E.thrustBy && E.thrustBy[fu] != null ? E.thrustBy[fu] : E.thrust; S.ve = E.fuels[fu];
    add(`${E.name} engine`, E.mass);
    S.fuelId = fu; S.fuelType = FU.short; S.fuelDens = FU.dens;
    S.fuel = S.tankVol * FU.dens;
    S.sideVe = Math.min(0.85 * S.ve, 900);                              // pods burn main propellant; on fusion ships they are resistojets
    if (m.owned[ION.id]) {
      const X = ION_FUELS[ionFuelOf(m)];
      S.ionThrust = ION.thrust; S.ionVe = X.ve; S.ionTank = ION.vol * X.dens; S.ionFuelId = ionFuelOf(m); S.ionFuelType = X.short;
      add(ION.name, ION.mass);
    }
    add(`Orion pulse units ×${m.orion}`, ORION.mass * m.orion);
    S.orionCount = m.orion;
    const cm = Object.entries(CHARGES).reduce((s, [id, c]) => s + c.mass * (m.charges[id] || 0), 0);
    add(`Crack charges ×${Object.values(m.charges).reduce((a, b) => a + b, 0)}`, cm);
    S.massParts = parts;
  }

  // the active tow tier is the owned one, derated to what the frame can take; the gear aboard still weighs what it weighs
  function towStats(S, L, owned, F) {
    const tier = Math.min(TIER[owned.id].tier, F.towTierMax), t = L.tiers[tier - 1];
    Object.assign(S, t.set);
    S.towTier = tier;
  }

  // what the ship would be after `mutate(m)` (every module's stats hook runs; the state is restored)
  function previewS(g, mutate) {
    const m = st(g), owned = m.owned, fuelOf = m.fuelOf, charges = m.charges;
    const keep = JSON.parse(JSON.stringify({ owned, fuelOf, charges, engine: m.engine, frame: m.frame, ionFuel: m.ionFuel, orion: m.orion }));
    try {
      if (mutate) mutate(m);
      const S = { ...CONFIG.ship };
      Game.each(g, 'stats', S);
      return S;
    } finally {                                                    // restore in place: callers may hold m.owned / m.fuelOf
      m.owned = owned; m.fuelOf = fuelOf; m.charges = charges;
      for (const o of [owned, fuelOf, charges]) for (const k of Object.keys(o)) delete o[k];
      Object.assign(owned, keep.owned); Object.assign(fuelOf, keep.fuelOf); Object.assign(charges, keep.charges);
      m.engine = keep.engine; m.frame = keep.frame; m.ionFuel = keep.ionFuel; m.orion = keep.orion;
    }
  }

  // headline numbers for a stats object: full tank, empty hold (what you would fly out of the shop with)
  //  rockT: the rock for the "Δv with a rock" row (default: the tow rating, or 300 t without tow gear)
  function metrics(g, S, rockT) {
    const gC = (g.w.byId.mochi || { g: 2 }).g, mFull = S.dry + S.fuel + (S.ionTank || 0);
    const dvOf = (ve, prop, m0 = mFull) => (ve > 0 && prop > 0 && m0 > prop ? ve * Math.log(m0 / (m0 - prop)) : 0);
    const rock = rockT || S.towMax || 300, here = hereBody(g);
    return {
      dv: dvOf(S.ve, S.fuel), twr: S.thrust / (mFull * gC), isp: isp(S.ve), thrust: S.thrust, fuelT: S.fuel, tankVol: S.tankVol || BASE_VOL,
      dry: S.dry, full: mFull, iondv: dvOf(S.ionVe, S.ionTank || 0), ionIsp: S.ionVe ? isp(S.ionVe) : 0,
      hold: S.cargoCap, hull: S.hull, armor: S.armor || 0, rcs: S.rcs, spin: S.rotAccel, nudge: S.transAccel,
      tractor: S.tractor || 0, scanner: S.scanner || 0,
      pack: S.packCap, o2: S.o2, jet: S.jet, jetFuel: S.jetFuel, suitHp: S.suitHp,
      laser: S.laserPower, laserRange: S.laserRange, laserDps: S.laserDps,
      gunDps: (S.gunDmg || 0) * (S.gunRate || 0), gunSpeed: S.gunSpeed || 0, turret: S.turret || 0,
      orion: S.orionCount || 0, orionDv: S.orionJ / (mFull - (S.orionCount ? ORION.mass : 0)),   // the unit leaves before the kick
      // v4: frames, hauling, power, side pods, suit
      length: S.length, mount: S.mount ?? 1, tow: S.towMax || 0, cable: S.cableLen || 0, reel: S.reelV || 0,
      towImp: S.ve * S.fuel, rockT: rock, dvRock: dvOf(S.ve, S.fuel, mFull + rock),
      jetP: S.engineKind === 'ntr' || S.engineKind === 'fusion' ? jetPower(S.thrust, S.ve) : 0,
      ionP: S.ionThrust ? jetPower(S.ionThrust, S.ionVe) : 0,
      sideAcc: (S.sideThrust || 0) / mFull, dash: S.dashBoost || 0,
      here: here ? here.name : '', twrHere: here ? S.thrust / (mFull * here.g) : 0,
      suitArmor: S.suitArmor || 0, walk: S.walkMult ?? 1, jump: S.jumpMult ?? 1, fallSafe: S.fallSafe ?? 8, sprint: S.sprint ?? 1,
      rollDist: S.rollDist || 0, iframes: S.rollIframes || 0, rollAir: S.rollAir || 0,
      bombs: S.bombs || 0, bombDmg: S.bombDmg || 0, bombR: S.bombR || 0, bombDig: S.bombDig || 0, bombCd: S.bombs ? S.bombCd : 0, bombE: S.bombE || 0,
      tether: S.tetherLen ?? 30, reelA: S.reelA ?? 1, xlate: S.translator || 0,
    };
  }
  // the rock you are near, when it is not Mochi (whose lift row is always shown)
  function hereBody(g) {
    if (!g.sh || typeof Game.nearestBody !== 'function') return null;
    const nb = Game.nearestBody(g, g.sh.x, g.sh.y);
    return nb && nb.b && !nb.b.star && nb.b.id !== 'mochi' && nb.alt < 3000 && nb.b.g ? nb.b : null;
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

  const hubLike = (station) => !station || station.kind === 'hub' || station.kind === 'dev';
  const sellsFuel = (station, fid) => !!FUELS[fid] && (!FUELS[fid].hub || hubLike(station));   // fusion fuels: Mochi Hub only
  const fuelMult = (station) => (station && typeof station.fuelMult === 'number' && isFinite(station.fuelMult) ? Math.max(0, station.fuelMult) : 1);
  const fuelPrice = (g, station) => FUELS[g.S.fuelId || 'methalox'].price * fuelMult(station);
  const ionPrice = (g, station) => (ION_FUELS[g.S.ionFuelId] ? ION_FUELS[g.S.ionFuelId].price : 0) * fuelMult(station);
  const rcsPrice = (station) => RCS_PRICE * fuelMult(station);
  const repairPrice = (station) => REPAIR_PRICE * (station && isFinite(station.repairMult) ? Math.max(0, station.repairMult) : 1);

  function priceOf(g, id, station) {
    const c = BY_ID[id]; if (!c) return Infinity;
    const mult = station && isFinite(station.priceMult) && station.priceMult > 0 ? station.priceMult : 1;
    if (id === ORION.id) return Math.round(c.price * (station && (station.kind === 'black' || station.kind === 'dev') ? 1 : ORION.hubMult) * mult);
    return Math.round(c.price * mult);
  }
  const tabsOf = (station) => {                                     // haul gear rides along wherever ship parts are sold
    const t = station && Array.isArray(station.tabs) ? station.tabs : ALL_TABS;
    return t.includes('ship') && !t.includes('haul') ? [...t, 'haul'] : t;
  };
  const sellsTab = (station, tab) => !station || tabsOf(station).includes(tab);
  const sellsOrion = (station) => !station || station.kind === 'black' || station.kind === 'hub' || station.kind === 'dev';
  // which shop tab shows Orion units here: weapons, else (a hub with no weapons counter) next to the engines
  const orionTab = (station) => (!sellsOrion(station) ? null : sellsTab(station, 'weapons') ? 'weapons' : sellsTab(station, 'ship') ? 'ship' : null);
  const framesHere = (station) => !!station && (station.kind === 'hub' || station.kind === 'dev');


  // ======================================================================
  //  BUYING, INSTALLING, EQUIPPING
  // ======================================================================

  // the smallest frame that can use item id, or null when the frame you fly already can
  function frameNeed(m, id) {
    const F = FRAMES[frameOf(m)];
    let ok = null;
    if (ENGINES[id] && ENGINES[id].mount > F.mount) ok = (f) => f.mount >= ENGINES[id].mount;
    else if (TIER[id] && TIER[id].line.id === 'tow' && TIER[id].tier > F.towTierMax) ok = (f) => f.towTierMax >= TIER[id].tier;
    return ok ? FRAME_ORDER.find((f) => ok(FRAMES[f])) : null;
  }

  // -> { ok, why: 'unknown'|'notsold'|'owned'|'locked'|'max'|'frame'|'broke', price, need, frame }
  function canBuy(g, id, station) {
    const m = st(g), c = BY_ID[id], price = priceOf(g, id, station);
    if (!c) return { ok: false, why: 'unknown', price };
    if (id === ORION.id ? !orionTab(station) : !sellsTab(station, c.cat)) return { ok: false, why: 'notsold', price };
    if (id === ORION.id) { if (m.orion >= ORION.max) return { ok: false, why: 'max', price }; }
    else if (CHARGES[id]) { if ((m.charges[id] || 0) >= CHARGES[id].max) return { ok: false, why: 'max', price }; }
    else if (owns(g, id) || (TIER[id] && tierIndex(m, TIER[id].line) >= TIER[id].tier)) return { ok: false, why: 'owned', price };
    else if (TIER[id] && tierIndex(m, TIER[id].line) < TIER[id].tier - 1) return { ok: false, why: 'locked', price };
    const need = frameNeed(m, id);
    if (need) return { ok: false, why: 'frame', price, frame: need };
    if (g.money < price) return { ok: false, why: 'broke', price, need: price - g.money };
    return { ok: true, price };
  }

  function buy(g, id, station = st(g).station) {
    const c = canBuy(g, id, station);
    if (!c.ok) return { ...c, msg: { broke: `Need $${Math.ceil(c.need)} more`, owned: 'Already installed', locked: 'Buy the tier before first',
                                    max: `You can carry ${CHARGES[id] ? CHARGES[id].max : ORION.max}`, notsold: 'Not sold here', unknown: 'Unknown item',
                                    frame: `Needs a ${c.frame ? FRAMES[c.frame].name : 'bigger'} frame` }[c.why] };
    const m = st(g);
    g.money -= c.price; m.stats.spent += c.price; m.stats.bought++;
    const name = install(g, id);
    let msg = `${name} installed!`;
    if (ENGINES[id]) equip(g, id, station);                         // bought it to use it
    if (FRAMES[id]) msg = framesHere(station) && swapFrame(g, id, station).ok ? `${name} equipped! Mind the extra length.` : `${name} bought: equip it at Mochi Hub.`;
    if (CHARGES[id]) msg = `${name} stowed (${m.charges[id]} / ${CHARGES[id].max}).`;
    Game.log(g, `bought ${name} for $${c.price}  ($${Math.floor(g.money)} left)`);
    if (id === 'xlate1' || id === 'xlate2') Game.toast(g, id === 'xlate2' ? 'TRANSLATOR ONLINE: 6 LANGUAGES' : 'PHRASEBOOK CLIPPED ON: HALF THE WORDS, ALL THE NUMBERS', '#7cf5d6', 'xlate');
    Game.goal(g, 'upgrade');
    Game.save(g);
    return { ok: true, price: c.price, msg };
  }

  // install without paying -> the item's name, or null if owned / unknown / full
  function install(g, id) {
    const m = st(g), c = BY_ID[id];
    if (!c) return null;
    if (id === ORION.id) { if (m.orion >= ORION.max) return null; m.orion++; }
    else if (CHARGES[id]) { if ((m.charges[id] || 0) >= CHARGES[id].max) return null; m.charges[id] = (m.charges[id] || 0) + 1; }
    else {
      if (owns(g, id) || (TIER[id] && tierIndex(m, TIER[id].line) >= TIER[id].tier)) return null;
      m.owned[id] = true;
      if (ENGINES[id] && !m.fuelOf[id]) { const f = bestFuel(g, id); m.fuelOf[id] = f; }
    }
    refit(g);
    return c.name;
  }

  // recalc after a change of parts: new plating and new suits arrive intact (no paying to "repair" them)
  function refit(g) {
    const S0 = g.S;
    Game.recalc(g);
    if (S0 && g.sh) {
      g.sh.hull = Math.min(g.S.hull, g.sh.hull + Math.max(0, (g.S.hull - S0.hull) || 0));
      if (g.astro) g.astro.hp = Math.min(g.S.suitHp, (g.astro.hp || 0) + Math.max(0, (g.S.suitHp - S0.suitHp) || 0));
    }
  }

  // free install from a wreck blueprint (engines are not swapped mid-flight; equip them at Mochi Hub)
  function grant(g, id) {
    const name = install(g, id);
    if (name) { st(g).stats.blueprints++; Game.log(g, `blueprint installed: ${name}`); Game.save(g); }
    return name;
  }

  // an upgrade id the player does not own yet (next tier of each line, engines, ion drive), cheaper ones likelier
  //  frames and anything over $10k never come out of a wreck
  function randomBlueprint(g, rand = Math.random) {
    const m = st(g), pool = [];
    for (const L of LINES) { const t = L.tiers[tierIndex(m, L)]; if (t) pool.push(t.id); }
    for (const id of [...Object.keys(ENGINES), ION.id]) if (!owns(g, id)) pool.push(id);
    const ok = pool.filter((id) => BY_ID[id].price <= BLUEPRINT_MAX);
    if (!ok.length) return null;
    const w = ok.map((id) => 1 / Math.sqrt(BY_ID[id].price || 1)), tot = w.reduce((a, b) => a + b, 0);
    let r = Math.max(0, Math.min(0.999999, +rand() || 0)) * tot;
    for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r < 0) return ok[i]; }
    return ok[ok.length - 1];
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

  // the best owned engine that fits a mount (the Sparrow always fits)
  function bestEngineFor(m, mount) {
    return Object.keys(ENGINES).filter((e) => (e === 'sparrow' || m.owned[e]) && ENGINES[e].mount <= mount)
      .sort((a, b) => ENGINES[b].mount - ENGINES[a].mount || ENGINES[b].price - ENGINES[a].price)[0];
  }

  // swap to an owned engine (free at Mochi Hub). Keeps the fuel when the new engine burns it, else drains and refills.
  function equip(g, eid, station = st(g).station) {
    const m = st(g);
    if (!ENGINES[eid] || !owns(g, eid)) return { ok: false, msg: 'Not owned' };
    if (engineOf(m) === eid) return { ok: true, spent: 0, msg: 'Already equipped' };
    const need = frameNeed(m, eid);
    if (need) return { ok: false, msg: `Needs a ${FRAMES[need].name} frame (mount ${ENGINES[eid].mount})` };
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

  // ---------------- frames: equip only at Mochi Hub (or the dev shop) ----------------

  // -> { ok, msg, swapped: engine id the mount gate swapped out, or null }
  function swapFrame(g, fid, station = st(g).station || (stationsOn() ? Stations.dockedAt(g) : null)) {
    const m = st(g), F = FRAMES[fid];
    if (!F || !owns(g, fid)) return { ok: false, msg: 'Not owned' };
    if (frameOf(m) === fid) return { ok: true, msg: `Already flying the ${F.name}` };
    if (!framesHere(station)) return { ok: false, msg: 'Frames are fitted at Mochi Hub only' };
    const kg = g.sh ? g.sh.cargoKg || 0 : 0, cap = previewS(g, (mm) => { mm.frame = fid; }).cargoCap;
    if (kg > cap + 1e-6) {
      const msg = `SELL CARGO FIRST: ${fmt(kg)} kg > ${fmt(cap)} kg HOLD`;
      Game.toast(g, msg, '#ff9f1c', 'frame');
      return { ok: false, msg };
    }
    const was = frameOf(m), e0 = engineOf(m);
    m.frame = fid;
    let swapped = null;
    if (ENGINES[e0].mount > F.mount) {
      swapped = e0;
      const before = fuelOf(m);
      m.engine = bestEngineFor(m, F.mount);
      if (before !== fuelOf(m) && g.sh) g.sh.fuel = 0;
      Game.toast(g, `ENGINE SWAPPED: THE ${ENGINES[e0].name.toUpperCase()} NEEDS A MOUNT-${ENGINES[e0].mount} FRAME`, '#ffd166', 'frame');
    }
    refit(g);
    if (swapped && station && g.sh && g.sh.fuel <= 0) refuel(g, station, { ion: false, rcs: false });
    reseat(g);
    Game.log(g, `frame ${FRAMES[was].name} -> ${F.name}${swapped ? `, ${ENGINES[swapped].name} swapped for the ${ENGINES[engineOf(m)].name}` : ''}`);
    Game.save(g);
    return { ok: true, swapped, msg: swapped ? `${F.name} fitted. The ${ENGINES[swapped].name} did not fit: the ${ENGINES[engineOf(m)].name} goes in.` : `${F.name} fitted!` };
  }
  const equipFrame = (g, fid, station) => swapFrame(g, fid, station).ok;

  // a bigger (or smaller) ship on the ground: put it down again so it does not sit inside the rock
  function reseat(g) {
    if (g.status !== 'landed' || !g.landedOn || !g.land || typeof Game.landAt !== 'function') return;
    Game.landAt(g, g.landedOn, Math.atan2(g.land.ly, g.land.lx));
  }


  // ======================================================================
  //  CONSUMABLES: crack charges (haul plants them with B)
  // ======================================================================

  const charges = (g) => ({ ...noCharges(), ...st(g).charges });
  function fillCharges(g) {
    const m = st(g);
    for (const [id, c] of Object.entries(CHARGES)) m.charges[id] = c.max;
    Game.recalc(g);
  }
  function spendCharge(g, id) {
    const m = st(g);
    if (!CHARGES[id] || !(m.charges[id] > 0)) return false;
    m.charges[id]--;
    Game.recalc(g);
    Game.log(g, `charge used: ${CHARGES[id].name} (${m.charges[id]} left)`);
    return true;
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
    if (main && sellsFuel(station, g.S.fuelId)) spent += fill(g, 'fuel', g.S.fuel * frac, fuelPrice(g, station));
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

  // what each service would cost right now (for the shop and hints); fuel a station does not sell costs 0 here
  function quote(g, station, what, frac = 1) {
    const sh = g.sh, S = g.S;
    const c = { fuel: sellsFuel(station, S.fuelId) ? Math.max(0, S.fuel * frac - sh.fuel) * fuelPrice(g, station) : 0,
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
             blurb: typeof s.blurb === 'string' ? s.blurb : s.hello || '', buy: s.buy || {}, tabs: Array.isArray(s.tabs) && s.tabs.length ? tabsOf(s) : ALL_TABS,
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
  //  DEV MODE: ∞ money, top-ups, builds, max everything
  // ======================================================================

  function toggleInf(g, want = !st(g).inf) {
    const m = st(g);
    if (!g.dev || m.inf === !!want) return m.inf;
    m.inf = !!want;
    if (m.inf) { m.wallet = g.money; g.money = Math.max(g.money, DEV_MONEY); }
    else g.money = Math.min(g.money, m.wallet || 50000);           // back to what you had, so "broke" can be tested
    Game.log(g, `dev: ∞ money ${m.inf ? 'on' : `off ($${Math.floor(g.money)})`}`);
    return m.inf;
  }

  // fuel, xenon, RCS, hull, crack charges to the brim; suit too (EVA.topUp) when eva is on
  function topUp(g) {
    fillCharges(g);
    const sh = g.sh, S = g.S;
    if (sh) { sh.fuel = S.fuel; sh.xe = S.ionTank || 0; sh.rcs = S.rcs; sh.hull = S.hull; }
    if (g.astro) g.astro.hp = g.astro.hpMax;
    if (typeof EVA !== 'undefined' && EVA && on(g, 'eva') && EVA.topUp) EVA.topUp(g, true);
    if (g.dash) g.dash.readyAt = 0;
    Game.log(g, 'dev: topped up');
    return true;
  }

  // the econ state of a build (pure: shared by applyBuild and the shop's preview table)
  function buildState(m, id) {
    const B = BUILDS[id];
    if (!B) return false;
    const own = (tid) => { const T = TIER[tid]; if (T) T.line.tiers.slice(0, T.tier).forEach((t) => { m.owned[t.id] = true; }); else if (BY_ID[tid]) m.owned[tid] = true; };
    if (B.suit) {
      for (const L of LINES) if (L.tab === 'suit') own(L.tiers[L.tiers.length - 1].id);
      return true;
    }
    for (const k of Object.keys(m.owned)) if (FRAMES[k] || ENGINES[k] || k === ION.id || (TIER[k] && TIER[k].line.tab !== 'suit')) delete m.owned[k];
    B.parts.forEach(own);
    own(B.frame); own(B.engine);
    m.frame = B.frame; m.engine = B.engine; m.fuelOf[B.engine] = B.fuel;
    m.orion = 0; m.charges = noCharges();
    return true;
  }

  function applyBuild(g, id) {
    const m = st(g), B = BUILDS[id];
    if (!B || !buildState(m, id)) { Game.log(g, `dev: no build "${id}"`); return false; }
    fillUp(g);
    Game.log(g, `dev: build ${B.name}${B.suit ? '' : ` (${FRAMES[B.frame].name}, ${ENGINES[B.engine].name} on ${FUELS[B.fuel].name})`}`);
    return true;
  }

  function grantAll(g) {
    const m = st(g);
    for (const c of CATALOG) if (!c.consumable) m.owned[c.id] = true;
    m.frame = 'leviathan'; m.engine = 'sunflower'; m.fuelOf.sunflower = 'dhe3';
    m.orion = ORION.max;
    for (const [id, c] of Object.entries(CHARGES)) m.charges[id] = c.max;
    fillUp(g);
    Game.log(g, 'dev: max everything (Leviathan + Sunflower torch, every line maxed)');
    return true;
  }

  // what: 'ship' (frame, engines, ship / haul / weapon parts, consumables) or 'suit' or 'all'
  function resetStock(g, what = 'all') {
    const m = st(g);
    const suit = (k) => TIER[k] && TIER[k].line.tab === 'suit';
    for (const k of Object.keys(m.owned)) if (what === 'all' || (what === 'suit') === !!suit(k)) delete m.owned[k];
    if (what !== 'suit') { m.frame = 'prospector'; m.engine = 'sparrow'; m.fuelOf = { sparrow: 'methalox' }; m.orion = 0; m.charges = noCharges(); }
    fillUp(g);
    Game.log(g, `dev: stock ${what}`);
    return true;
  }

  function fillUp(g) {
    Game.recalc(g);
    const sh = g.sh, S = g.S;
    if (sh) { sh.fuel = S.fuel; sh.xe = S.ionTank || 0; sh.rcs = S.rcs; sh.hull = S.hull; }
    if (g.astro) g.astro.hp = g.astro.hpMax;
    reseat(g);
    Game.save(g);
  }

  // dev helpers for the shop's dev tab
  function fillHold(g) {
    const ores = ['ice', 'iron', 'nickel', 'platinum'], each = Math.floor((g.S.cargoCap - (g.sh.cargoKg || 0)) / ores.length);
    let n = 0;
    for (const o of ores) n += Game.addCargo(g, o, each);
    Game.log(g, `dev: hold filled with ${n} kg of ore`);
    return n;
  }
  function devRock(g, type, r) {
    if (typeof Haul === 'undefined' || !Haul || !on(g, 'haul') || typeof Haul.devRock !== 'function') return null;
    return Haul.devRock(g, type, r);
  }
  const rockTypes = () => (typeof Haul !== 'undefined' && Haul && Haul.TYPES ? Haul.TYPES : ROCKS);


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

  // ?build=beast / ?inf=0 arrive through g.opts (game.js), else straight from the URL
  function opt(g, key) {
    if (g.opts && g.opts[key] != null) return g.opts[key];
    try { return typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search).get(key) : null; } catch (e) { return null; }
  }

  function ready(g) {
    const m = st(g), inf = opt(g, 'inf'), build = opt(g, 'build');
    if (g.dev && inf != null && inf !== '') m.inf = !/^(0|false|off|no)$/i.test(String(inf));
    m.inf = !!(g.dev && m.inf);
    if (m.inf) m.wallet = g.money;
    if (build) { if (g.dev) applyBuild(g, String(build)); else Game.log(g, `?build=${build} ignored: dev mode only`); }
  }

  function onKey(g, code) {
    if (g.ui === 'shop') {                                          // the shop eats keys while open
      if (code === 'Escape' || code === 'KeyF' || (code === 'KeyO' && g.dev)) closeShop(g);
      return true;
    }
    if (code === 'KeyN' && g.mode === 'ship' && g.status !== 'dead' && !g.ui && !g.paused) { firePulse(g); return true; }
    if (!g.dev) return false;
    const m = st(g);
    if (code === 'KeyK') { g.money += 5000; m.wallet += 5000; Game.toast(g, 'DEV: +$5,000', '#8ff0b0', 'devk'); return true; }
    if (code === 'KeyO') {
      if (!g.ui && g.status !== 'dead') { m.devSeen = true; openShop(g, DEV_SHOP); }
      else Game.toast(g, g.status === 'dead' ? 'DEV: THE DUCK DOES NOT SERVE WRECKS (R FIRST)' : 'DEV: CLOSE THE OTHER PANEL FIRST', '#ffd166', 'devo');
      return true;
    }
    if (code === 'KeyU') { topUp(g); Game.toast(g, 'DEV: TOPPED UP', '#8ff0b0', 'devu'); return true; }
    if (code === 'KeyI') { const v = toggleInf(g); Game.toast(g, v ? 'DEV: ∞ MONEY ON' : `DEV: ∞ MONEY OFF ($${fmt(g.money)})`, '#8ff0b0', 'devi'); return true; }
    return false;
  }

  function shipCtrl(g, ctrl) {                                      // no flying while shopping (held W would undock)
    if (g.ui === 'shop') Object.assign(ctrl, { main: 0, ion: 0, rot: 0, kill: false, fwd: 0, left: 0, side: 0, dash: false });
  }

  function frame(g) {
    const m = st(g);
    if (isInf(g)) g.money = Math.max(g.money, DEV_MONEY);           // the ∞ pin: buys subtract, the pin refills
    if (g.ui === 'shop' && !m.station) g.ui = null;
    if (g.ui !== 'shop' && typeof Shop !== 'undefined' && Shop.isOpen && Shop.isOpen()) Shop.close();
    if (m.blast && g.real - m.blast.real > 1.2) m.blast = null;
    if (g.fired && g.fired.side) m.stats.strafed++;
    if (!m.moon && g.status === 'landed' && g.landedOn && g.landedOn.id === 'seed' && g.S.frameId === 'leviathan') {
      m.moon = true;                                                // the Leviathan is exactly as wide as Seed
      Game.toast(g, 'YOU ARE NOW THE MOON', '#ffe066', 'moon');
      Game.log(g, 'a Leviathan landed on Seed: Seed is now its moon, or the other way round');
    }
  }

  // old = the tanks before the tow: the fresh ship arrives full, and that fill is billed at hub prices
  //  bigger frames cost more to tow: the fee and its cap scale with sqrt(k)
  function respawn(g, why, old) {
    const m = st(g), rk = Math.sqrt(g.S.k ?? 1);
    m.blast = null;
    if (g.ui === 'shop') closeShop(g);
    const heavy = Math.max(0, Physics.fullMass(g.S) - 2.4) * 15;
    const base = Math.round(Math.min(FEE_MAX * rk, Math.max(FEE_MIN, ((TOW_FEE[why] || TOW_FEE.tow) + heavy) * rk)));
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

  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const money = (n) => `$${fmt(n)}`;

  function hudRows(g) {
    const m = st(g), rows = [{ label: 'HOLD VALUE', val: money(holdValue(g)), col: '#2f9e5b' }];
    if (m.orion > 0) rows.push({ label: 'ORION PULSES (N)', val: `${m.orion} / ${ORION.max}`, col: '#e63946' });
    const ch = Object.entries(CHARGES).filter(([id]) => m.charges[id] > 0);
    // haul's own CHARGES row takes over once you can tow
    if (ch.length && !(on(g, 'haul') && (g.S.towMax ?? 0) > 0)) rows.push({ label: 'CHARGES (B)', col: '#c4502e',
                               val: ch.length === 1 ? `${ch[0][1].name} ×${m.charges[ch[0][0]]}` : ch.map(([id, c]) => `${c.short}×${m.charges[id]}`).join(' ') });
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
      if (sh.fuel < 0.5 * S.fuel && sellsFuel(stationsOn() ? Stations.dockedAt(g) : null, S.fuelId))
        return { pri: 45, text: `Tank is ${Math.round(100 * sh.fuel / S.fuel)}% full: press F, then Services, to refuel before you go.` };
    }
    if (m.orion > 0 && !m.stats.fired && g.status === 'flying' && g.mode === 'ship')
      return { pri: 20, text: `N fires an Orion nuclear pulse: +${(S.orionJ / (Physics.mass(sh, S) - ORION.mass)).toFixed(0)} m/s along your nose (${m.orion} carried).` };
    if ((S.sideThrust ?? 0) > 0 && !m.stats.strafed && g.status === 'flying' && g.mode === 'ship')
      return { pri: 22, text: `Side pods fitted: ←/→ strafe (Shift+←/→ is the old RCS nudge)${S.dashBoost ? ', double-tap ←/→ to dash' : ''}.` };
    if (g.dev && !m.devSeen && g.real < 120)
      return { pri: 12, text: `DEV: O opens the Debug Duck's shop anywhere, U tops everything up, I toggles ∞ money (${isInf(g) ? 'on' : 'off'}), K adds $5,000.` };
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
    previewS, metrics, twrOn, owns, tierOf: (g, lineId) => tierOf(st(g), LINE[lineId]),
    tierIndex: (g, lineId) => tierIndex(st(g), LINE[lineId]), engineOf: (g) => engineOf(st(g)),
    fuelOf: (g, eid) => fuelOf(st(g), eid), ionFuelOf: (g) => ionFuelOf(st(g)), state: st, isp, jetPower,
    fuelPrice, ionPrice, rcsPrice, repairPrice, sellsTab, sellsOrion, orionTab, sellsFuel, tabsOf, framesHere,
    padDepotNear, padDepot, ENGINES, FUELS, ION_FUELS, ION, LINES, LINE, TIER, ORION, BY_ID, HUB, PAD_DEPOT, PAD_KIOSK, ALL_TABS, BASE_VOL,
    // v4
    frameOf: (g) => frameOf(st(g)), equipFrame, swapFrame, frameNeed: (g, id) => frameNeed(st(g), id), FRAMES, FRAME_ORDER, STOCK,
    bestEngineFor: (g, mount) => bestEngineFor(st(g), mount), charges, spendCharge, fillCharges, CHARGES, TNT, ROCKS, rockTypes,
    isInf, toggleInf, topUp, applyBuild, buildState, grantAll, resetStock, fillHold, devRock, BUILDS, DEV_SHOP, DEV_MONEY,
  };

  const mod = { id: 'economy', init, load, save, stats, ready, onKey, shipCtrl, frame, respawn, died,
                hudRows, hint, interactions, drawWorld, drawScreen };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;

  const FUSION = new Set(Object.keys(ENGINES).filter((e) => ENGINES[e].kind === 'fusion'));
  Game.addGoals([
    { id: 'sell',    order: 40, reward: 100,  text: 'Sell cargo at a shop',
      test: (g) => (g.mod.economy ? g.mod.economy.stats.sold : 0) > 0 },
    { id: 'upgrade', order: 50, reward: 100,  text: 'Buy your first upgrade',
      test: (g) => (g.mod.economy ? g.mod.economy.stats.bought : 0) > 0 },
    { id: 'orion',   order: 80, reward: 300,  text: 'Fire an Orion nuclear pulse (N)',
      test: (g) => (g.mod.economy ? g.mod.economy.stats.fired : 0) > 0 },
    { id: 'frame',   order: 92, reward: 500,  text: 'Upgrade to a bigger frame (buy one, fit it at Mochi Hub)',
      test: (g) => !!(g.S && g.S.frameId && g.S.frameId !== 'prospector') },
    { id: 'fusion',  order: 98, reward: 2000, text: 'Fly on fusion (a Pocket Sun or the Sunflower torch)',
      test: (g) => !!(g.fired && g.fired.main > 0 && g.S && FUSION.has(g.S.engine)) },
    { id: 'rich',    order: 99, reward: 1000, text: 'Bank $20,000',
      test: (g) => g.money >= 20000 },
    { id: 'tycoon',  order: 100, reward: 1,   text: 'Bank $250,000 (the dollar comes framed)',
      test: (g) => !g.dev && g.money >= 250000 },
  ]);
  return api;
})();

if (typeof module !== 'undefined') module.exports = Econ;
