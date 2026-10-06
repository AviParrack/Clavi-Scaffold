// ======================================================================
//  SHOP  —  the station shop: a comic DOM panel over the game (the sim is
//  paused while it is open). Tabs from station.tabs plus a Ship sheet; the
//  Debug Duck's dev shop adds a Dev bench. Every buyable shows its price, a
//  stat line, a one-liner and BEFORE -> AFTER numbers, so a newcomer sees
//  the tradeoff. All money rules live in economy.js.
// ======================================================================

const Shop = (() => {

  const INK = '#1b1433';
  const KIND = { hub: { acc: '#ff9f1c', bg: '#ffd9a0', label: 'shopkeeper' },
                 outpost: { acc: '#33c27a', bg: '#c9efc0', label: 'outpost quartermaster' },
                 black: { acc: '#8f6bff', bg: '#d9cdfa', label: 'definitely legitimate merchant' },
                 dev: { acc: '#ffd23f', bg: '#fff1a0', label: 'patron saint of rubber-duck debugging' } };
  const TAB_ORDER = ['dev', 'services', 'sell', 'ship', 'haul', 'suit', 'weapons', 'sheet'];
  const TAB_NAMES = { dev: 'Dev bench', services: 'Services', sell: 'Sell', ship: 'Ship parts', haul: 'Haul', suit: 'Suit', weapons: 'Weapons', sheet: 'Ship sheet' };
  const QUIPS = {
    buy: ['Pleasure doing business!', 'Bolted on with love.', 'That will fly. Probably.', 'No refunds. Kidding! Also no refunds.',
          'Ooh, fancy. The other prospectors will be so jealous.', 'Installed. I only dropped it twice.'],
    sell: ['Ka-ching!', 'Fresh rocks, my favourite.', 'Pleasure! Come back with more.', 'Ooh, this one is still warm.'],
    bigsell: ['WOW. Now we are talking!', 'Look at all that sparkle!', 'I need a bigger cash drawer.'],
    broke: ['Come back with more space money.', 'Credit? In this economy?', 'Dig a little deeper, friend.'],
    fuel: ['Topped up. Please do not drink it.', 'Fuelled and ready.', 'Full of fizz!'],
    repair: ['Good as new. Newer, even.', 'I hammered the dents out. Lovingly.'],
    swap: ['Swapped! The old stuff went out the airlock.', 'New engine, new you.'],
    black: ['You did not buy that from me.', 'What Orion units? I see no Orion units.', 'Cash only. Obviously.'],
    duck: ['Quack. Installed.', 'On the house. The house is imaginary.', 'Have you tried turning the frame off and on again?',
           'Rubber-stamped. Rubber-ducked.', 'It works on my machine. Quack.'],
  };
  const fmtN = (v, d = 0) => (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtW = (w) => (w >= 1e9 ? `${fmtN(w / 1e9, w >= 1e10 ? 0 : 1)} GW` : w >= 1e6 ? `${fmtN(w / 1e6, w >= 1e7 ? 0 : 1)} MW` : w > 0 ? `${fmtN(w / 1e3)} kW` : '—');
  const none = (f) => (v) => (v ? f(v) : 'none');
  //  id, label (text or fn(a)), format, better (+1 more is better, -1 less, 0 neutral), tooltip, opt (shown only when a card asks for it)
  const MET = [
    ['dv', 'Δv, full tank', (v) => `${fmtN(v)} m/s`, 1, 'Delta-v: how much speed change one tank buys you. More Δv = longer trips. (Full tank, empty hold.)'],
    ['twr', 'Lift on Mochi', (v) => `${v.toFixed(2)}×`, 1, 'Thrust-to-weight ratio on Mochi with a full tank. Below 1.00× the engine cannot lift you off the ground.'],
    ['twrHere', (a) => `Lift on ${a.here}`, (v) => (v ? `${v.toFixed(2)}×` : '—'), 1, 'Thrust-to-weight on the rock you are next to, with a full tank.', true],
    ['isp', 'Engine Isp', (v) => `${fmtN(v)} s`, 1, `Specific impulse = fuel efficiency, in real-world seconds (exhaust speeds here are a 1:${CONFIG.ISP_SCALE} model, so ve × ${CONFIG.ISP_SCALE} ÷ 9.81).`],
    ['thrust', 'Thrust', (v) => `${fmtN(v, v < 100 ? 1 : 0)} kN`, 1, 'Engine push in kilonewtons. More thrust = faster burns and easier lift-off.'],
    ['jetP', 'Jet power', fmtW, 1, `Real-equivalent jet power ½ · T · ve × ${CONFIG.ISP_SCALE}. Power-limited drives (nuclear, fusion) keep it fixed, so a fuel with lower ve gets more thrust: T = 2P ÷ ve.`, true],
    ['tankVol', 'Tank size', (v) => `${fmtN(v, v < 10 ? 1 : 0)} m³`, 1, 'Tank volume. Tonnes of fuel = volume × fuel density.'],
    ['fuelT', 'Fuel when full', (v) => `${fmtN(v, 2)} t`, 0, 'Mass of fuel in a full tank (volume × density).'],
    ['towImp', 'Tow impulse', (v) => `${fmtN(v)} kN·s`, 1, 'Total impulse in a full tank = ve × fuel mass. With a rock of mass M on the rope, Δv ≈ impulse ÷ M: dense fuel beats fluffy fuel when the payload is a mountain.', true],
    ['dvRock', (a) => `Δv with ${fmtN(a.rockT)} t rock`, (v) => `${fmtN(v, v < 10 ? 2 : 1)} m/s`, 1, 'Δv = ve ln((m + M) ÷ (m + M − fuel)) with a rock of M tonnes on the rope (full tank).', true],
    ['dry', 'Empty mass', (v) => `${fmtN(v, 2)} t`, -1, 'The ship with empty tanks and an empty hold. Every part adds mass, and mass costs Δv.'],
    ['iondv', 'Ion Δv', (v) => `${fmtN(v)} m/s`, 1, 'Extra delta-v from the ion drive on a full ion tank.'],
    ['ionIsp', 'Ion Isp', (v) => `${fmtN(v)} s`, 1, 'Ion drive efficiency in real-world seconds.'],
    ['ionP', 'Ion power', fmtW, 1, 'Real-equivalent jet power of the ion drive.', true],
    ['hold', 'Cargo hold', (v) => `${fmtN(v)} kg`, 1, 'How much ore your hold carries.'],
    ['hull', 'Hull', (v) => `${fmtN(v)} hp`, 1, 'Hit points before the ship goes KABOOM.'],
    ['armor', 'Armor', (v) => `${(v * 100).toFixed(0)}%`, 1, 'Share of every hit the armor soaks up.'],
    ['length', 'Length', (v) => `${v} m`, 0, 'Bow to nozzle. Big ships need bigger dock zones and wider pads.', true],
    ['mount', 'Engine mount', (v) => `size ${v}`, 1, 'The biggest engine this frame can carry (1 to 5).', true],
    ['rcs', 'RCS fuel', (v) => `${fmtN(v)} units`, 1, 'Fuel for the little steering thrusters (A/D spin, arrows nudge).'],
    ['spin', 'Spin power', (v) => `${v.toFixed(2)} rad/s²`, 1, 'How fast the thrusters can spin you. Big frames turn like big ships.'],
    ['nudge', 'Nudge power', (v) => `${v.toFixed(2)} m/s²`, 1, 'Sideways push from Shift + arrow keys (the RCS).'],
    ['sideAcc', 'Side push', none((v) => `${v.toFixed(2)} m/s²`), 1, 'Side pods: ←/→ strafe at this acceleration (full tank). They burn main propellant.'],
    ['dash', 'Dash', none((v) => `×${v} for 0.4 s`), 1, 'Double-tap ←/→: the side pods overboost for a dodge.'],
    ['tow', 'Tow rating', none((v) => `${fmtN(v)} t`), 1, 'The heaviest rock your tow gear can latch on to.'],
    ['cable', 'Cable', none((v) => `${v} m`), 1, 'How far the rock can trail behind you.'],
    ['reel', 'Reel speed', none((v) => `${v} m/s`), 1, 'Q reels in, Z pays out at this speed.'],
    ['tractor', 'Scoop reach', (v) => `+${v.toFixed(0)} m`, 1, 'Extra radius for sucking loose ore and gems into the hold.'],
    ['scanner', 'Scanner', (v) => ['none', 'gems 25 m · rocks 300 m', 'everything on screen'][v] || `${v}`, 1, 'Shows buried gems and the type of every rock.'],
    ['suitHp', 'Suit health', (v) => `${fmtN(v)} hp`, 1, 'How many bug bites you can take.'],
    ['suitArmor', 'Suit armor', (v) => `${(v * 100).toFixed(0)}%`, 1, 'Share of every hit on you the suit soaks up.'],
    ['walk', 'Walk speed', (v) => `${v.toFixed(2)}×`, 1, 'Walking speed (still capped on tiny moons, where you could walk into orbit).'],
    ['jump', 'Jump', (v) => `${v.toFixed(2)}×`, 1, 'Jump power.'],
    ['fallSafe', 'Safe landing', (v) => `${v} m/s`, 1, 'Land slower than this and the suit takes no damage.'],
    ['pack', 'Backpack', (v) => `${fmtN(v)} kg`, 1, 'How much you carry on foot.'],
    ['sprint', 'Sprint', (v) => (v > 1 ? `${v}×` : 'none'), 1, 'Hold Shift on foot. Uses air ×1.5. Tiny moons cap every pace at 0.6× orbital speed: any faster and your feet leave the ground.'],
    ['rollDist', 'Dive roll', none((v) => `${v} m`), 1, 'C dives this far (slower on tiny moons, where speed is capped). The dodge window is the start of it.'],
    ['iframes', 'Dodge window', none((v) => `${v.toFixed(2)} s`), 1, 'How long the start of a roll makes you untouchable.'],
    ['rollAir', 'Air dash', none((v) => `${v} m/s`), 1, 'A roll in mid-air or in space is a jetpack dash (paid from jet fuel).'],
    ['bombs', 'Bombs', none((v) => `${v} charges`), 1, 'Right mouse aims and throws, B throws at the cursor. Each charge refills on its own.'],
    ['bombDmg', 'Bomb damage', none((v) => `${v}`), 1, 'Damage at the centre, half at the edge.'],
    ['bombR', 'Blast radius', none((v) => `${v} m`), 1, 'How far the bang reaches.'],
    ['bombDig', 'Crater', none((v) => `${v} m`), 1, 'Crater radius (∝ energy^⅓: 3× the boom, 1.44× the hole).'],
    ['bombCd', 'Bomb refill', none((v) => `${v} s`), -1, 'Seconds for one charge to come back.'],
    ['o2', 'Air', (v) => (v >= 120 ? `${(v / 60).toFixed(1)} min` : `${v.toFixed(0)} s`), 1, 'How long you can stay outside.'],
    ['jet', 'Jetpack push', (v) => `${v.toFixed(1)} m/s²`, 1, 'Jetpack acceleration.'],
    ['jetFuel', 'Jetpack burn', (v) => `${v.toFixed(0)} s`, 1, 'Seconds of jetpack per refill (refills in the ship).'],
    ['tether', 'Tether', (v) => `${v} m`, 1, 'How far a spacewalk can take you from the ship.'],
    ['reelA', 'Winch', (v) => `${v} m/s`, 1, 'Q winches you home this fast.'],
    ['xlate', 'Translator', (v) => ['none', 'half the words', 'every word'][v] || `${v}`, 1, 'Alien speech bubbles in English.'],
    ['laser', 'Dig speed', (v) => `${v.toFixed(1)}×`, 1, 'Mining laser power. Hard ores need more.'],
    ['laserRange', 'Laser reach', (v) => `${v.toFixed(0)} m`, 1, 'How far the laser reaches.'],
    ['laserDps', 'Laser zap', (v) => `${v.toFixed(0)} dmg/s`, 1, 'Damage to bugs and pirates.'],
    ['gunDps', 'Gun damage', (v) => (v ? `${v.toFixed(0)} dmg/s` : 'none'), 1, 'Damage per second while holding Space.'],
    ['gunSpeed', 'Bullet speed', (v) => (v ? `${v.toFixed(0)} m/s` : '—'), 1, 'Muzzle speed relative to your ship.'],
    ['turret', 'Aiming', (v) => (v ? 'at the mouse' : 'along the nose'), 1, 'Where your guns point.'],
    ['orion', 'Orion pulses', (v) => `${v} / 3`, 1, 'Nuclear pulse units carried (N fires one).'],
    ['orionDv', 'Kick per pulse', (v) => `${v.toFixed(0)} m/s`, 1, 'Speed change from one pulse = impulse ÷ ship mass (full tank).', true],
  ];
  const KIND_TAG = { chem: ['CHEMICAL', 'k-chem'], ntr: ['NUCLEAR', 'k-ntr'], fusion: ['FUSION', 'k-fus'] };
  const CSS_ID = 'po-shop-css';

  let root = null, G = null, ST = null, tab = 'services', say = '', mood = 'happy', wallet0 = 0, doneSeen = new Set(), cache = null;
  let popped = false, said = null;                                     // the card pops once per visit; the bubble pops when the keeper says something new
  let arm = null;                                                       // { act, id }: a click that would ground you, waiting for a second click
  const lastTab = {}, pick = { type: 'gravel', r: 4 };
  const E = () => (typeof Econ !== 'undefined' ? Econ : null);


  // ======================================================================
  //  OPEN / CLOSE
  // ======================================================================

  function open(g, station) {
    if (typeof document === 'undefined' || !E()) return false;
    close();
    css();
    G = g; ST = station;
    const tabs = tabList();
    tab = tabs.includes(lastTab[ST.id]) ? lastTab[ST.id] : Object.keys(G.cargo).length && tabs.includes('sell') ? 'sell' : tabs[0];
    say = greeting(); mood = 'happy'; wallet0 = g.money; doneSeen = new Set(Object.keys(g.done)); popped = false; said = null; arm = null;
    root = document.createElement('div');
    root.id = 'po-shop';
    root.addEventListener('click', onClick);
    (document.getElementById('ui') || document.body).appendChild(root);
    render(false);
    return true;
  }

  function close() {
    if (root) root.remove();
    root = null; G = null; ST = null;
  }
  const isOpen = () => !!root;
  const tabList = () => TAB_ORDER.filter((t) => t === 'sheet' || (ST.tabs.includes(t) && TAB_NAMES[t]));
  const isDev = () => ST.kind === 'dev';
  function greeting() {
    if (isDev() && E().state(G).stats.bought >= 50) return "You know you can't take any of this home, right?";
    return ST.blurb || 'Welcome!';
  }


  // ======================================================================
  //  ACTIONS
  // ======================================================================

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !G) return;
    const ec = E(), g = G, act = b.dataset.act, id = b.dataset.id;
    if (act === 'close') { ec.closeShop(g); return; }
    if (act === 'tab') { tab = id; lastTab[ST.id] = id; arm = null; render(false); return; }
    if (act === 'jump') { const body = root.querySelector('.po-body'), sec = root.querySelector(`#${id}`); if (body && sec) body.scrollTop = sec.offsetTop - 52; return; }
    let r = null;
    const opt = { confirm: !!arm && arm.act === act && arm.id === id };
    arm = null;
    if (act === 'buy') {
      r = ec.buy(g, id, ST, opt);
      talk(r.ok ? (isDev() ? 'duck' : ST.kind === 'black' ? 'black' : 'buy') : r.why === 'broke' ? 'broke' : null, r.ok ? howLine(id, r.msg) || r.msg : r.msg, r.ok);
    } else if (act === 'bundle') { r = ec.buyBundle(g, id, ST); talk(r.ok ? (isDev() ? 'duck' : 'buy') : r.why === 'broke' ? 'broke' : null, r.msg, r.ok); }
    else if (act === 'equip') { r = ec.equip(g, id, ST, opt); talk('swap', r.ok ? (r.spent ? `${r.msg}. Refilled the tank for $${fmtN(r.spent)}.` : null) : r.msg); }
    else if (act === 'frame') { r = ec.swapFrame(g, id, ST, opt); talk(r.ok ? 'swap' : null, r.msg); }
    else if (act === 'fuel') { r = ec.setFuel(g, id, ST, opt); talk('swap', r.ok ? `${r.msg}. Old fuel vented, new fuel ${r.spent ? `$${fmtN(r.spent)}` : 'free'}.` : r.msg); }
    else if (act === 'ionfuel') { r = ec.setIonFuel(g, id, ST); talk('swap', `${r.msg}. Refilled for $${fmtN(r.spent || 0)}.`); }
    else if (act === 'refuel') { const n = ec.refuel(g, ST, { frac: +b.dataset.frac || 1, ion: false, rcs: false }); talk(n || !ST.fuelMult ? 'fuel' : 'broke'); }
    else if (act === 'safefill') { const f = ec.safeFill(g), n = ec.refuel(g, ST, { frac: f, ion: false, rcs: false }); talk(n || !ST.fuelMult ? 'fuel' : 'broke', `Filled to ${Math.round(100 * f)}%: light enough to lift off Mochi (${ec.liftNow(g, g.sh.fuel).toFixed(2)}×).`); }
    else if (act === 'ion') { const n = ec.refuel(g, ST, { main: false, ion: true, rcs: false }); talk(n || !ST.fuelMult ? 'fuel' : 'broke'); }
    else if (act === 'rcs') { const n = ec.restockRcs(g, ST); talk(n || !ST.fuelMult ? 'fuel' : 'broke'); }
    else if (act === 'repair') { const n = ec.repair(g, ST); talk(n || !ST.repairMult ? 'repair' : 'broke'); }
    else if (act === 'all') {
      const f = ec.safeFill(g), n = (f < 1 ? ec.refuel(g, ST, { frac: f, ion: false }) + ec.refuel(g, ST, { main: false }) : ec.refuel(g, ST)) + ec.repair(g, ST);
      talk(n || isDev() ? 'repair' : 'broke', n ? `All done for $${fmtN(n)}.${f < 1 ? ` Fuel to ${Math.round(100 * f)}%: a full tank could not lift off Mochi.` : ''} Fly safe!` : null);
    }
    else if (act === 'sell') { const n = ec.sell(g, id, Infinity, ST); talk('sell', `Ka-ching! +$${fmtN(n)}`); }
    else if (act === 'sellall') { const n = ec.sellAll(g, ST); talk(n >= 500 ? 'bigsell' : 'sell', n >= 500 ? null : `Ka-ching! +$${fmtN(n)}`); }
    else if (act === 'build') { ec.applyBuild(g, id); talk('duck', `${ec.BUILDS[id].name}: done. ${ec.BUILDS[id].suit ? 'Every suit toy, fitted.' : `Tanks full, Δv ${fmtN(Physics.deltaV(g.sh, g.S))} m/s.`}`); }
    else if (act === 'rtype') pick.type = id;
    else if (act === 'rsize') pick.r = +id;
    else if (act === 'dev') { if (devAction(id) === 'closed') return; }
    if (r && r.why === 'lift') { arm = { act, id }; mood = 'sad'; say = `${r.msg} Click again if you mean it.`; }
    if (G) { const jobs = jobLine(); if (jobs) say = r && r.ok && r.msg ? `${say} ${jobs}` : jobs; render(true); }
  }

  function devAction(id) {
    const ec = E(), g = G;
    if (id === 'inf') talk('duck', ec.toggleInf(g) ? '∞ money on. Spend like nobody is debugging.' : `∞ money off: back to $${fmtN(g.money)}. Now you can test being broke.`);
    else if (id === 'topup') { const left = ec.topUp(g) || []; talk('duck', `Fuel, RCS, hull, charges and suit: topped up.${left.length ? ` I kept the ${left.map((c) => ec.CHARGES[c].name).join(' and ')} on the shelf: too heavy to lift off Mochi.` : ''} Quack.`); }
    else if (id === 'cash') { g.money += 5000; talk('duck', '+$5,000. Found it in the couch.'); }
    else if (id === 'max') { ec.grantAll(g); talk('duck', 'MAX EVERYTHING. Leviathan, Sunflower torch, every line maxed. You monster.'); }
    else if (id === 'stockall') { ec.resetStock(g, 'all'); talk('duck', 'Back to a stock Prospector and a stock suit. Humble beginnings.'); }
    else if (id === 'stockship') { ec.resetStock(g, 'ship'); talk('duck', 'Stock ship. The suit stays on.'); }
    else if (id === 'stocksuit') { ec.resetStock(g, 'suit'); talk('duck', 'Stock suit. Mind the bugs.'); }
    else if (id === 'charges') { ec.fillCharges(g, true); talk('duck', `Every charge rack full, lift on Mochi ${ec.metrics(g, g.S).twr.toFixed(2)}×. Please aim away from the duck.`); }
    else if (id === 'ore') { const n = ec.fillHold(g); talk('duck', n ? `Stuffed ${fmtN(n)} kg of ore in the hold. Sell it anywhere.` : 'The hold is already full.'); }
    else if (id === 'rock') {
      const rk = ec.devRock(g, pick.type, pick.r);
      if (!rk) { talk('duck', 'The haul module is off, so there are no free rocks to spawn.'); return; }
      Game.toast(g, `DEV: ${pick.type.toUpperCase()} ROCK, r ${pick.r} m, AHEAD · G GRAPPLES, B CRACKS`, '#8ff0b0', 'devrock');
      ec.closeShop(g);
      return 'closed';
    }
  }

  // the keeper's bubble: text, or a quip of this kind; withQuip adds the quip after the real message
  function talk(kind, text, withQuip = false) {
    const list = QUIPS[kind], quip = list ? list[Math.floor(Math.random() * list.length)] : '';
    if (kind) mood = kind === 'broke' ? 'sad' : kind === 'bigsell' ? 'wow' : 'happy';
    say = text ? (withQuip && quip ? `${text} ${quip}` : text) : quip || say;
  }
  // after a buy: the keeper says how to use it, when it needs a key
  function howLine(id, msg) {
    const ec = E(), T = ec.TIER[id], how = T && T.line.how;
    if (ec.CHARGES[id]) return `${msg} B plants one on the rock you tow (or one within 10 m).`;
    if (id === 'orion') return `${msg} N fires one.`;
    return how ? `${msg} ${how[0].toUpperCase()}${how.slice(1)}.` : null;
  }

  // a job finished during this click? (its reward lands in the wallet too)
  function jobLine() {
    const fresh = Game.GOALS.filter((gl) => G.done[gl.id] !== undefined && !doneSeen.has(gl.id));
    fresh.forEach((gl) => doneSeen.add(gl.id));
    return fresh.length ? `Job done: ${fresh.map((gl) => `${gl.text}${gl.reward ? ` (+$${gl.reward})` : ''}`).join(', ')}!` : null;
  }


  // ======================================================================
  //  RENDER
  // ======================================================================

  function render(keepScroll) {
    if (!root || !G) return;
    cache = null;
    const old = root.querySelector('.po-body'), scroll = old ? old.scrollTop : 0, k = KIND[ST.kind] || KIND.outpost;
    const anim = popped ? '' : ' po-in', fresh = say !== said ? ' po-in' : '';
    popped = true; said = say;
    root.innerHTML = `<div class="po-card po-k-${esc(ST.kind)}${anim}" style="--acc:${k.acc};--accbg:${k.bg}" role="dialog" aria-label="${esc(ST.name)} shop">
      ${header(k, fresh)}${quickBar()}${tabsBar()}<div class="po-body">${content()}</div>
      <footer class="po-foot"><span>${isDev() ? 'Esc, F, O or ✕ to leave' : 'Esc, F or ✕ to leave'}</span><span>Time is paused while you shop</span><span>$ dollars · t tonnes · kg kilograms</span></footer></div>`;
    if (keepScroll) root.querySelector('.po-body').scrollTop = scroll;
    armButton();
    drawKeeper();
    if (G.money !== wallet0) { const w = root.querySelector('.po-wallet'); w.classList.add(G.money > wallet0 ? 'po-gain' : 'po-spend'); wallet0 = G.money; }
  }

  // the armed button turns red and says what a second click does
  function armButton() {
    const b = arm && root.querySelector(`[data-act="${arm.act}"][data-id="${arm.id}"]`);
    if (!b) { arm = null; return; }
    b.classList.add('po-arm'); b.classList.remove('po-go');
    b.innerHTML = '⚠ Click again: you could not take off from Mochi';
  }

  function header(k, pop = '') {
    const inf = E().isInf(G);
    return `<header class="po-head">
      <div class="po-keeper" title="${esc(keeperName())}">${keeperNpc(ST) ? '<canvas class="po-face po-npc" width="168" height="168" aria-hidden="true"></canvas>' : portrait(ST, mood)}</div>
      <div class="po-talk"><div class="po-name">${esc(ST.name)}</div>
        <div class="po-bubble${pop}">${esc(say)}</div><div class="po-who">${esc(keeperName())}, ${k.label}</div></div>
      <div class="po-wallet ${inf ? 'po-inf' : ''}"><small>YOUR MONEY</small><b>${inf ? '∞' : money(G.money)}</b></div>
      <button class="po-x" data-act="close" title="Close the shop (Esc or F)" aria-label="Close">✕</button></header>`;
  }
  const keeperName = () => (typeof ST.keeper === 'string' ? ST.keeper : (ST.keeper && ST.keeper.name) || 'Keeper');

  // one-click essentials on every tab
  function quickBar() {
    const ec = E(), g = G, sh = g.sh, S = g.S;
    const fuelCost = ec.quote(g, ST, 'fuel'), hullCost = ec.quote(g, ST, 'hull'), hold = cargoValue();
    const svc = ST.tabs.includes('services'), sells = ST.tabs.includes('sell'), fuelHere = ec.sellsFuel(ST, S.fuelId);
    const pill = (label, frac, col, text, btn) => `<div class="po-pill"><div class="po-pl"><span>${label}</span><b>${text}</b></div>
      <div class="po-meter"><i style="width:${(100 * clamp01(frac)).toFixed(1)}%;background:${col}"></i></div>${btn}</div>`;
    const qb = (act, cost, label, full) => (cost > 0 ? `<button class="po-btn po-sm" data-act="${act}" ${g.money < 1 ? 'disabled' : ''}>${label} ${money(cost)}</button>`
                                                     : full ? `<span class="po-ok">✓ full</span>` : `<button class="po-btn po-sm" data-act="${act}">${label} free</button>`);
    const safe = ec.safeFill(g), safeCost = safe < 1 ? ec.quote(g, ST, 'fuel', safe) : 0;
    const fuelBtn = !svc ? '' : !fuelHere ? `<span class="po-dim po-sm-note">${esc(S.fuelType)}: Mochi Hub only</span>`
                  : safe < 1 && sh.fuel < safe * S.fuel - 1e-6
                    ? `<button class="po-btn po-sm" data-act="safefill" ${g.money < 1 && safeCost > 0 ? 'disabled' : ''}>Fill to ${Math.round(100 * safe)}% ${safeCost > 0 ? money(safeCost) : 'free'}</button>`
                  : qb('refuel', fuelCost, 'Fill up', sh.fuel >= S.fuel - 1e-6);
    return `<div class="po-quick">
      ${pill(`Fuel · ${esc(S.fuelType)}`, sh.fuel / S.fuel, '#ff9f1c', `Δv ${fmtN(Physics.deltaV(sh, S))} m/s`, fuelBtn)}
      ${pill('Hull', sh.hull / S.hull, sh.hull < 0.35 * S.hull ? '#e63946' : '#33c27a', `${fmtN(Math.max(0, sh.hull))} / ${fmtN(S.hull)}`, svc ? qb('repair', hullCost, 'Repair', sh.hull >= S.hull) : '')}
      ${pill('Hold', (sh.cargoKg || 0) / S.cargoCap, '#b892ff', `${fmtN(sh.cargoKg || 0)} / ${fmtN(S.cargoCap)} kg`,
             sells && hold > 0 ? `<button class="po-btn po-sm po-go" data-act="sellall">Sell all ${money(hold)}</button>` : `<span class="po-ok">${hold > 0 ? '' : 'empty'}</span>`)}
    </div>`;
  }

  function tabsBar() {
    return `<nav class="po-tabs">${tabList().map((t) => `<button class="po-tab ${t === tab ? 'on' : ''} ${t === 'dev' ? 'po-tab-dev' : ''}" data-act="tab" data-id="${t}">${TAB_NAMES[t]}${
      t === 'sell' && Object.keys(G.cargo).length ? ' <span class="po-badge">!</span>' : ''}</button>`).join('')}</nav>`;
  }

  function content() {
    return ({ dev, services, sell, ship, haul, suit, weapons, sheet }[tab] || services)();
  }


  // ======================================================================
  //  SERVICES
  // ======================================================================

  function services() {
    const ec = E(), g = G, sh = g.sh, S = g.S, F = ec.FUELS[S.fuelId] || { name: S.fuelType };
    const fp = ec.fuelPrice(g, ST), cash = Math.floor(g.money), fuelHere = ec.sellsFuel(ST, S.fuelId);
    const fillBtn = (frac) => {
      const cost = ec.quote(g, ST, 'fuel', frac), full = sh.fuel >= S.fuel * frac - 1e-6;
      const lift = liftAt(sh.fuel > S.fuel * frac ? sh.fuel : S.fuel * frac);
      const label = full ? `${frac < 1 ? `${frac * 100}%` : 'Full'} ✓` : cost <= cash ? `${frac < 1 ? `Fill to ${frac * 100}%` : 'Fill up'} · ${money(cost)}`
                         : cash > 0 ? `Fill what ${money(cash)} buys` : 'Broke';
      return `<button class="po-btn" data-act="refuel" data-frac="${frac}" ${full || (cash < 1 && cost > 0) ? 'disabled' : ''}>${label}
        <small class="${lift < 1 ? 'down' : ''}">lift on Mochi ${lift.toFixed(2)}×</small></button>`;
    };
    const safe = ec.safeFill(g);
    const safeBtn = () => (safe >= 1 || sh.fuel >= safe * S.fuel - 1e-6 ? '' : `<button class="po-btn po-go" data-act="safefill">Fill to ${Math.round(100 * safe)}% · ${money(ec.quote(g, ST, 'fuel', safe))}
        <small>lift on Mochi ${liftAt(safe * S.fuel).toFixed(2)}×: the most that still takes off</small></button>`);
    const svc = (title, frac, col, info, price, btns) => `<div class="po-svc"><div class="po-svc-l"><h4>${title}</h4>
      <div class="po-meter po-big"><i style="width:${(100 * clamp01(frac)).toFixed(1)}%;background:${col}"></i></div>
      <p>${info}</p><p class="po-dim">${price}</p></div><div class="po-svc-r">${btns}</div></div>`;
    const one = (act, what, cost, okText, full) => (cost > 0 ? `<button class="po-btn" data-act="${act}" ${cash < 1 ? 'disabled' : ''}>${
      cost <= cash ? `${what} · ${money(cost)}` : cash > 0 ? `${what}: what ${money(cash)} buys` : 'Broke'}</button>`
      : full ? `<span class="po-ok">✓ ${okText}</span>` : `<button class="po-btn" data-act="${act}">${what} · free</button>`);

    let html = '<div class="po-svcs">';
    html += svc(`Fuel tank · ${esc(F.name)}`, sh.fuel / S.fuel, '#ff9f1c',
      `${fmtN(sh.fuel, 2)} of ${fmtN(S.fuel, 2)} t · Δv now <b>${fmtN(Physics.deltaV(sh, S))} m/s</b>`,
      fuelHere ? `${money2(fp)} per tonne here${ST.fuelMult !== 1 ? ` (${pct(ST.fuelMult)} of Hub price)` : ''} · ${fmtN(S.tankVol, 1)} m³ tank`
               : `<b>${esc(F.name)} is sold at Mochi Hub only</b> (fusion fuel needs a proper cryo plant) · ${fmtN(S.tankVol, 1)} m³ tank`,
      fuelHere ? `${safeBtn()}${fillBtn(0.5)}${fillBtn(0.75)}${fillBtn(1)}` : '<span class="po-dim">Fill up at Mochi Hub</span>');
    if (S.ionTank > 0) {
      const X = ec.ION_FUELS[S.ionFuelId] || { name: 'ion fuel' };
      html += svc(`Ion tank · ${esc(X.name)}`, (sh.xe || 0) / S.ionTank, '#7cf5d6',
        `${fmtN(sh.xe || 0, 2)} of ${fmtN(S.ionTank, 2)} t · ion Δv now <b>${fmtN(Physics.ionDeltaV(sh, S))} m/s</b>`,
        `${money2(ec.ionPrice(g, ST))} per tonne here`, one('ion', 'Fill ion tank', ec.quote(g, ST, 'ion'), 'full', (sh.xe || 0) >= S.ionTank - 1e-6));
    }
    html += svc('RCS thrusters', sh.rcs / S.rcs, '#4cc9f0', `${fmtN(sh.rcs, 1)} of ${S.rcs} units (A/D spin, S stop, arrows nudge)`,
      `${money2(ec.rcsPrice(ST))} per unit`, one('rcs', 'Restock RCS', ec.quote(g, ST, 'rcs'), 'full', sh.rcs >= S.rcs - 1e-6));
    html += svc('Hull', sh.hull / S.hull, sh.hull < 0.35 * S.hull ? '#e63946' : '#33c27a', `${fmtN(Math.max(0, sh.hull))} of ${fmtN(S.hull)} hp`,
      `${money2(ec.repairPrice(ST))} per hp`, one('repair', 'Repair hull', ec.quote(g, ST, 'hull'), 'shipshape', sh.hull >= S.hull - 1e-6));
    html += '</div>';
    const fFill = Math.min(1, safe), total = ec.quote(g, ST, 'fuel', fFill) + ['ion', 'rcs', 'hull'].reduce((s, w) => s + ec.quote(g, ST, w), 0);
    const topped = (!fuelHere || sh.fuel >= fFill * S.fuel - 1e-6) && sh.rcs >= S.rcs - 1e-6 && sh.hull >= S.hull - 1e-6 && (sh.xe || 0) >= (S.ionTank || 0) - 1e-6;
    html += `<div class="po-row-end">${!topped ? `<button class="po-btn po-go po-lg" data-act="all" ${cash < 1 && total > 0 ? 'disabled' : ''}>Do it all: ${fFill < 1 ? `fuel to ${Math.round(100 * fFill)}%` : 'fuel'}, RCS & repairs · ${total > 0 ? money(total) : 'free'}</button>`
                                               : '<span class="po-ok po-lg">✓ Everything is topped up. Off you go!</span>'}</div>`;
    if (lowLift()) html += `<p class="po-warn">Heads up: with a full tank this ship is too heavy to lift off Mochi (${liftAt(S.fuel).toFixed(2)}×).
      Fill to ${Math.round(100 * safe)}% for trips that land on Mochi, or fit a punchier engine. Holding W on the ground burns fuel until you are light enough.</p>`;
    return html;
  }

  const liftAt = (fuelT) => { const S = G.S, m = S.dry + fuelT + (G.sh.xe || 0) + (G.sh.cargoKg || 0) / 1000; return S.thrust / (m * G.w.byId.mochi.g); };
  const lowLift = () => liftAt(G.S.fuel) < 1;


  // ======================================================================
  //  SELL
  // ======================================================================

  function cargoValue() { return Math.round(E().valueOf(G, G.cargo, ST)); }

  function sell() {
    const ec = E(), g = G, hub = ec.hubStation(g), isHub = ST.kind === 'hub';
    const rows = Object.entries(g.cargo).filter(([, q]) => q > 0);
    const per = (it) => (it.kind === 'ore' ? '/kg' : ' each');
    const vs = (item) => {
      if (isHub) return '';
      const a = ec.buyMult(ST, item), b = ec.buyMult(hub, item);
      if (!(b > 0) || Math.abs(a / b - 1) < 0.01) return '';
      return `<span class="po-vs ${a > b ? 'up' : 'down'}">${a > b ? '▲' : '▼'} ${Math.abs(Math.round(100 * (a / b - 1)))}% vs Hub</span>`;
    };
    let html = '';
    if (!rows.length) {
      html += `<div class="po-empty"><b>Your hold is empty.</b> Go dig something up! Ice on Mochi, iron and amber on Kiwi and Dorito,
        nickel and platinum on Big Potato, void opals on Glimmer. Or tow a whole rock home (Haul tab).</div>`;
    } else {
      html += `<table class="po-table"><thead><tr><th>Item</th><th>In hold</th><th>Price here</th><th>Worth</th><th></th></tr></thead><tbody>`;
      for (const [item, q] of rows) {
        const it = CONFIG.items[item] || { name: item, kg: 1, col: '#fff' }, p = ec.sellPrice(g, item, ST), worth = Math.round(p * q);
        html += `<tr><td><span class="po-dot" style="background:${it.col}"></span>${esc(it.name)}</td>
          <td>${it.kind === 'ore' ? `${fmtN(q)} kg` : `${q} (${q * it.kg} kg)`}</td>
          <td>${p > 0 ? `${money2(p)}${per(it)} ${vs(item)}` : '<span class="po-dim">not buying</span>'}</td>
          <td><b>${p > 0 ? money(worth) : '—'}</b></td>
          <td>${p > 0 ? `<button class="po-btn po-sm" data-act="sell" data-id="${esc(item)}">Sell</button>` : ''}</td></tr>`;
      }
      html += '</tbody></table>';
      const total = cargoValue();
      html += `<div class="po-row-end">${total > 0 ? `<button class="po-btn po-go po-lg" data-act="sellall">Sell everything · ${money(total)}</button>` : ''}</div>`;
    }
    html += `<h3 class="po-h">What ${esc(ST.name)} pays</h3><div class="po-prices">`;
    for (const [item, it] of Object.entries(CONFIG.items)) {
      const p = ec.sellPrice(g, item, ST);
      html += `<span class="po-price-chip ${p > 0 ? '' : 'po-off'}"><span class="po-dot" style="background:${it.col}"></span>${esc(it.name)}
        <b>${p > 0 ? `${money2(p)}${per(it)}` : 'no'}</b>${p > 0 ? vs(item) : ''}</span>`;
    }
    return html + '</div>';
  }


  // ======================================================================
  //  SHIP: frames, engines, side pods, tank/hull/hold, handling
  // ======================================================================

  function ship() {
    const ec = E(), g = G, eng = Object.keys(ec.ENGINES).sort((a, b) => ec.ENGINES[a].mount - ec.ENGINES[b].mount || ec.ENGINES[a].price - ec.ENGINES[b].price);
    const frameNote = ec.framesHere(ST) ? 'Buy a frame and it is fitted on the spot. Owned frames swap for free here. Parts you own move over and scale with the frame.'
                                        : 'Frames are fitted at Mochi Hub only. Parts you own move over and scale with the frame.';
    return jumpNav([['sec-frames', 'Frames'], ['sec-engines', 'Engines'], ['sec-side', 'Side pods'], ['sec-tank', 'Tank, hull & hold'], ['sec-handling', 'Handling']])
      + affordable()
      + section('Frames: the ship grows', frameNote, ladder() + ec.FRAME_ORDER.map(frameCard).join(''), 'sec-frames')
      + section('Engines & drives', `Owned engines swap for free here. Thrust lifts you off rocks; Isp stretches your fuel. A big engine needs a big enough mount (your ${esc(g.S.frameName)} takes size ${g.S.mount ?? 1}).`,
                eng.map(engineCard).join('') + ionCard() + (ec.orionTab(ST) === 'ship' ? orionCard() : ''), 'sec-engines')
      + section('Side pods', 'Strafe sideways with ←/→ and dodge with a double-tap. They burn main fuel; pod thrust grows with the frame.', lineCard('side'), 'sec-side')
      + section('Tank, hull & hold', 'Bigger is better until it is heavier. Tiers multiply your frame\'s base tank, hold and hull. Watch Δv and lift.',
                ['tank', 'cargo', 'hull', 'armor'].map(lineCard).join(''), 'sec-tank')
      + section('Handling & tools', '', ['rcs', 'tractor', 'scanner'].map(lineCard).join(''), 'sec-handling');
  }
  // the cheapest next tiers you can pay for right now, so the first upgrade is never below the fold
  function affordable() {
    const ec = E(), g = G, next = (id) => { const L = ec.LINE[id]; return L && L.tiers[ec.tierIndex(g, id)]; };
    if (ec.isInf(g)) return '';
    const ids = ['rcs', 'tank', 'hull', 'armor', 'cargo', 'tractor', 'scanner', 'side']
      .filter((id) => next(id) && ec.canBuy(g, next(id).id, ST).ok)
      .sort((a, b) => ec.priceOf(g, next(a).id, ST) - ec.priceOf(g, next(b).id, ST)).slice(0, 4);
    if (!ids.length) return '';
    return section('Affordable now', g.done.upgrade === undefined ? 'Your first upgrade also pays a job bonus. RCS plus is a fine pick: more turning before the tank runs dry.' : '',
                   ids.map(lineCard).join(''));
  }
  function jumpNav(items) {
    return `<nav class="po-jump">${items.map(([id, name]) => `<button class="po-chip" data-act="jump" data-id="${id}">${name}</button>`).join('')}</nav>`;
  }
  const section = (title, sub, cards, id = '') => `<section class="po-sec"${id ? ` id="${id}"` : ''}><h3 class="po-h">${title}</h3>${sub ? `<p class="po-sub">${sub}</p>` : ''}<div class="po-grid">${cards}</div></section>`;

  // ---------------- frames ----------------

  // five steps from dinky to the beast; the bar is the ship's length
  function ladder() {
    const ec = E(), g = G, cur = ec.frameOf(g), max = ec.FRAMES.leviathan.length;
    return `<div class="po-ladder" aria-label="frame ladder">${ec.FRAME_ORDER.map((id, i) => {
      const F = ec.FRAMES[id], own = ec.owns(g, id);
      return `${i ? '<span class="po-step">›</span>' : ''}<div class="po-rung ${id === cur ? 'on' : own ? 'own' : ''}">
        <b>${esc(F.name)}</b><i style="width:${(100 * F.length / max).toFixed(0)}%"></i><small>${F.length} m · mount ${F.mount}${id === cur ? ' · flying' : own ? ' · owned' : F.price ? ` · ${money(F.price)}` : ''}</small></div>`;
    }).join('')}</div>`;
  }

  function frameCard(fid) {
    const ec = E(), g = G, F = ec.FRAMES[fid], cur = ec.frameOf(g) === fid, own = ec.owns(g, fid);
    const eNow = ec.engineOf(g), fits = ec.ENGINES[eNow].mount <= F.mount, eNew = fits ? eNow : ec.bestEngineFor(g, F.mount);
    const specs = `${F.length} m · empty ${F.dry} t · base tank ${F.tank} m³ · hold ${fmtN(F.hold)} kg · hull ${F.hull} · engine mount ${F.mount} · tow up to ${ec.LINE.tow.tiers[F.towTierMax - 1].name} · turns ${F.turn.toFixed(2)}×`;
    const rows = cur ? '' : compare((m) => { m.owned[fid] = true; m.frame = fid; m.engine = eNew; },
                                    ['dv', 'twr', 'hold', 'hull', 'tankVol', 'fuelT', 'dry', 'length', 'mount', 'spin', 'tow'], { keep: ['dv', 'twr'] });
    const swapNote = !cur && !fits ? `<p class="po-note">Your ${esc(ec.ENGINES[eNow].name)} needs mount ${ec.ENGINES[eNow].mount}: the ${esc(ec.ENGINES[eNew].name)} goes in.</p>` : '';
    return frameCardOut(fid, F, cur, own, specs, rows, swapNote + pairsWith(fid));
  }
  // the build this frame was designed around (progression §2.5), priced and computed with stock parts
  function pairsWith(fid) {
    const ec = E(), g = G, id = Object.keys(ec.BUILDS).find((b) => ec.BUILDS[b].frame === fid && !ec.BUILDS[b].suit);
    if (!id || fid === 'prospector') return '';
    const B = ec.BUILDS[id], e = ec.ENGINES[B.engine], S = ec.previewS(g, (m) => { m.owned[fid] = true; m.frame = fid; m.owned[B.engine] = true; m.engine = B.engine; m.fuelOf[B.engine] = B.fuel; });
    const M = ec.metrics(g, S), have = ec.owns(g, B.engine) || ec.engineOf(g) === B.engine;
    return `<p class="po-pair">Built for the <b>${esc(e.name)}</b>${have ? ' (yours)' : ` (${money(ec.priceOf(g, B.engine, ST))})`} on ${esc(ec.FUELS[B.fuel].name)}:
      Δv ${fmtN(M.dv)} m/s, lift ${M.twr.toFixed(2)}× with your other parts.</p>`;
  }
  function frameCardOut(fid, F, cur, own, specs, rows, extra) {
    const ec = E(), g = G, here = ec.framesHere(ST), c = own ? null : ec.canBuy(g, fid, ST);
    const trap = !cur && here && (own || (c && (c.ok || c.why === 'broke'))) ? ec.frameTrap(g, fid, ST) : null;
    let btn, state = '';
    if (cur) { btn = '<span class="po-ok">✓ Flying it</span>'; state = 'on'; }
    else if (trap) { btn = bundleButton(fid, own, trap); extra += `<p class="po-warn">⚠ ${esc(trap.msg)}</p>`; state = c ? cardState(c) : ''; }
    else if (own) btn = here ? `<button class="po-btn po-go" data-act="frame" data-id="${fid}">Fit it (free)</button>` : '<button class="po-btn" disabled>Fit it at Mochi Hub</button>';
    else { btn = buyButton(fid, c); state = cardState(c); }
    return card({ title: F.name, tag: cur ? 'FLYING' : own ? 'OWNED' : fid === 'leviathan' ? 'THE BEAST' : '', price: !own && F.price ? money(ec.priceOf(g, fid, ST)) : '',
                  desc: F.desc, specs, rows, extra, btn, state, cls: 'po-frame' });
  }
  // a frame that would ground you: the frame + the engine (or fuel) that lifts it, one click; the frame alone needs a second
  function bundleButton(fid, own, trap) {
    const ec = E(), g = G, fix = trap.fix, fp = own ? 0 : ec.priceOf(g, fid, ST);
    const alone = own ? `<button class="po-btn po-sm" data-act="frame" data-id="${fid}">Fit the frame alone</button>`
                      : `<button class="po-btn po-sm" data-act="buy" data-id="${fid}" ${g.money < fp ? 'disabled' : ''}>Frame alone · ${money(fp)}</button>`;
    if (!fix) return alone;
    const E2 = ec.ENGINES[fix.engine], fuel = ec.FUELS[fix.fuel].name.toLowerCase(), total = fp + fix.price;
    const what = fix.engine === trap.engine ? `with ${esc(fuel)} in your ${esc(E2.name)}` : `+ ${esc(E2.name)} on ${esc(fuel)}${fix.price ? '' : ' (yours)'}`;
    const label = g.money < total ? `Need ${money(total - g.money)} more` : `${own ? 'Fit it' : 'Buy it'} ${what} · ${total ? money(total) : 'free'}`;
    return `<button class="po-btn po-go" data-act="bundle" data-id="${fid}" ${g.money < total ? 'disabled' : ''}>${label}
      <small>lift ${fix.twr.toFixed(2)}× · Δv ${fmtN(fix.dv)} m/s · plus the new fuel</small></button>${alone}`;
  }

  // ---------------- engines ----------------

  function engineCard(eid) {
    const ec = E(), g = G, e = ec.ENGINES[eid], owned = ec.owns(g, eid), on = ec.engineOf(g) === eid;
    const [kname, kcls] = KIND_TAG[e.kind] || KIND_TAG.chem;
    const thr = (f) => (e.thrustBy && e.thrustBy[f] != null ? e.thrustBy[f] : e.thrust);
    const fuels = `<ul class="po-flist">${Object.entries(e.fuels).map(([f, ve]) => `<li><b>${esc(ec.FUELS[f].name)}</b> Isp ${fmtN(ec.isp(ve))} s · ${fmtN(thr(f), thr(f) < 100 ? 1 : 0)} kN${
      e.kind !== 'chem' ? ` · ${fmtW(ec.jetPower(thr(f), ve))}` : ''}${ec.FUELS[f].hub ? ' · <i>Hub only</i>' : ''}</li>`).join('')}</ul>`;
    const specs = `mount ${e.mount} · ${e.mass ? `+${fmtN(e.mass, 2)} t` : 'no extra mass'}${e.kind !== 'chem' ? ' · power-limited: T = 2P ÷ ve' : ''}`;
    const need = ec.frameNeed(g, eid);
    let rows = '', extra = fuels, btn, state = '';
    if (on) { extra += fuelChips(eid); btn = '<span class="po-ok">✓ Equipped</span>'; state = 'on'; }
    else if (need) {
      const NF = ec.FRAMES[need], S2 = bestOn(eid, need), M = S2 && ec.metrics(g, S2.S);
      extra += `<p class="po-lock">🔒 Needs a <b>${esc(NF.name)}</b> frame (mount ${e.mount}).${M ? ` On a ${esc(NF.name)} with your parts: Δv ${fmtN(M.dv)} m/s, lift ${M.twr.toFixed(2)}× on ${esc(ec.FUELS[S2.f].name)}.` : ''}</p>`;
      btn = owned ? `<button class="po-btn" disabled>🔒 Fit a ${esc(NF.name)} first</button>` : buyButton(eid);
      state = owned ? 'gated' : cardState({ why: 'frame' }, eid);
    } else {
      const start = owned ? null : ec.bestFuel(g, eid);
      const fit = (m) => { m.owned[eid] = true; m.engine = eid; if (start) m.fuelOf[eid] = start; }, lifts = start && ec.metrics(g, ec.previewS(g, fit)).twr >= 1;
      rows = compare(fit, ['dv', 'twr', 'twrHere', 'isp', 'thrust', 'jetP', 'fuelT', 'dry', 'sideAcc'], { add: haulRows() })
           + (start ? `<p class="po-dim">Starts on ${ec.FUELS[start].name.toLowerCase()}: ${lifts ? 'goes furthest with your tank and still lifts off Mochi' : 'goes furthest with your tank (no fuel lifts this ship off Mochi on this engine)'}. Switch any time.</p>` : '');
      const trap = ec.engineTrap(g, eid);
      if (trap) rows += `<p class="po-warn">⚠ ${esc(trap.msg)}</p>`;
      if (owned) {
        const drains = ec.fuelOf(g, eid) !== ec.fuelOf(g);
        btn = `<button class="po-btn ${trap ? '' : 'po-go'}" data-act="equip" data-id="${eid}">Equip (free)${drains ? ' · refill tank' : ''}</button>`;
      } else { const c = ec.canBuy(g, eid, ST); btn = buyButton(eid, c); state = cardState(c); }
    }
    return card({ title: e.name, tag: on ? 'EQUIPPED' : owned ? 'OWNED' : '', kind: [kname, kcls], price: !owned && e.price ? money(ec.priceOf(g, eid, ST)) : '',
                  desc: e.desc, specs, rows, extra, btn, state, cls: 'po-engine' });
  }
  // the furthest-going fuel that lifts off Mochi for engine eid on frame fid (your other parts kept)
  function bestOn(eid, fid) {
    const ec = E(), g = G;
    let best = null;
    for (const f of Object.keys(ec.ENGINES[eid].fuels)) {
      const S = ec.previewS(g, (m) => { m.owned[fid] = true; m.frame = fid; m.owned[eid] = true; m.engine = eid; m.fuelOf[eid] = f; }), M = ec.metrics(g, S);
      if (!best || (M.twr >= 1 && (best.twr < 1 || M.dv > best.dv))) best = { f, S, dv: M.dv, twr: M.twr };
    }
    return best;
  }

  function fuelChips(eid) {
    const ec = E(), g = G, cur = ec.fuelOf(g), cash = Math.floor(g.money);
    const chips = Object.keys(ec.ENGINES[eid].fuels).map((f) => {
      const F = ec.FUELS[f], S2 = ec.previewS(g, (m) => { m.fuelOf[eid] = f; }), M = ec.metrics(g, S2);
      const info = `<small>Isp ${fmtN(M.isp)} s · ${fmtN(S2.thrust, S2.thrust < 100 ? 1 : 0)} kN · ${F.dens} t/m³ · Δv ${fmtN(M.dv)} m/s · lift ${M.twr.toFixed(2)}× · impulse ${fmtN(M.towImp)} kN·s</small>`;
      if (f === cur) return `<div class="po-fuel on"><b>${esc(F.name)} ✓</b>${info}<em>${esc(F.desc)}</em></div>`;
      if (!ec.sellsFuel(ST, f)) return `<div class="po-fuel po-off"><b>${esc(F.name)}</b>${info}<em>Sold at Mochi Hub only.</em></div>`;
      const cost = Math.max(0, Math.ceil(S2.fuel * F.price * (ST.fuelMult ?? 1) - 1e-6)), trap = ec.fuelTrap(g, f);
      return `<button class="po-fuel ${trap ? 'po-heavy' : ''}" data-act="fuel" data-id="${f}" ${cash < 1 && cost > 0 ? 'disabled' : ''} title="Switching vents the current tank and fills it with ${esc(F.name.toLowerCase())}">
        <b>Switch to ${esc(F.name)}</b>${info}<em>${esc(F.desc)} Vents the tank, refill ${cost ? money(cost) : 'free'}.${trap ? ` <span class="po-flag">can’t lift off Mochi!</span>` : ''}</em></button>`;
    });
    return `<div class="po-fuels">${chips.join('')}</div>`;
  }

  function ionCard() {
    const ec = E(), g = G, I = ec.ION, owned = ec.owns(g, I.id);
    const specs = `${(I.thrust * 1000).toFixed(0)} N · +${I.mass.toFixed(2)} t · own ${I.vol} m³ tank · ${fmtW(ec.jetPower(I.thrust, 3900))} · xenon (Isp ${fmtN(ec.isp(3900))} s) or krypton (Isp ${fmtN(ec.isp(4500))} s)`;
    if (!owned) {
      const c = ec.canBuy(g, I.id, ST);
      return card({ title: I.name, kind: ['ION', 'k-ion'], price: money(ec.priceOf(g, I.id, ST)), desc: I.desc, specs, how: 'X toggles it in flight',
                    rows: compare((m) => { m.owned[I.id] = true; }, ['iondv', 'ionIsp', 'dv', 'twr', 'dry']), btn: buyButton(I.id, c), state: cardState(c) });
    }
    const cur = ec.ionFuelOf(g), cash = Math.floor(g.money);
    const chips = Object.entries(ec.ION_FUELS).map(([x, X]) => {
      const S2 = ec.previewS(g, (m) => { m.ionFuel = x; }), M = ec.metrics(g, S2);
      const info = `<small>Isp ${fmtN(M.ionIsp)} s · ${S2.ionTank.toFixed(2)} t per tank · ion Δv ${fmtN(M.iondv)} m/s</small>`;
      if (x === cur) return `<div class="po-fuel on"><b>${X.name} ✓</b>${info}<em>${esc(X.desc)}</em></div>`;
      const cost = Math.ceil(S2.ionTank * X.price * (ST.fuelMult ?? 1) - 1e-6);
      return `<button class="po-fuel" data-act="ionfuel" data-id="${x}" ${cash < 1 && cost > 0 ? 'disabled' : ''}><b>Switch to ${X.name}</b>${info}
        <em>${esc(X.desc)} Vents the ion tank, refill ${money(cost)}.</em></button>`;
    });
    return card({ title: I.name, tag: 'FITTED', kind: ['ION', 'k-ion'], desc: I.desc, specs, extra: `<div class="po-fuels">${chips.join('')}</div>`,
                  btn: '<span class="po-ok">✓ Fitted · X toggles it in flight</span>', state: 'on' });
  }


  // ======================================================================
  //  HAUL: tow gear, crack charges, the rock guide
  // ======================================================================

  function haul() {
    const ec = E(), g = G;
    return section('Tow gear', 'G grapples the rock in front of your nose, Q reels it in, Z pays out. Sell it whole at a buyer with F. Rocks have real masses: a 4 m gravel rock is 509 t.',
                   lineCard('tow') + towNow(), 'sec-tow')
      + section('Crack charges', `B plants the smallest charge that will crack the rock you tow (or one within 10 m). A rock cracks when the blast energy beats its toughness × mass. Charges ride in a rack: they weigh what they weigh.`,
                Object.keys(ec.CHARGES).map(chargeCard).join(''), 'sec-charges')
      + rockGuide();
  }

  function towNow() {
    const ec = E(), g = G, S = g.S, M = ec.metrics(g, S), m = ec.state(g), owned = ec.tierIndex(g, 'tow');
    const derate = owned > (S.towTier ?? 0) ? `<p class="po-note">Your ${esc(ec.LINE.tow.tiers[owned - 1].name)} is derated to a ${esc(ec.LINE.tow.tiers[S.towTier - 1].name)} on this frame (${esc(S.frameName)} takes tow tier ${S.towTierMax}).</p>` : '';
    const rows = [[100, 'a boulder'], [500, 'a hill'], [2000, 'a big one'], [27000, 'a whale']].map(([t, what]) => {
      const dv = ec.metrics(g, S, t).dvRock;
      const over = S.towMax > 0 && t > S.towMax;
      return `<tr><td>${fmtN(t)} t <span class="po-dim">(${what})</span></td><td class="${over ? 'po-dim' : ''}">${fmtN(dv, dv < 10 ? 2 : 1)} m/s${over ? ' · over rating' : ''}</td></tr>`;
    }).join('');
    return card({ title: 'Your tug, right now', tag: S.towMax ? `${fmtN(S.towMax)} t` : 'NO TOW GEAR',
                  desc: `Tow impulse ${fmtN(M.towImp)} kN·s (ve × fuel). With a rock of mass M on the rope, Δv ≈ impulse ÷ M.`,
                  specs: S.towMax ? `cable ${S.cableLen} m · reel ${S.reelV} m/s · ${esc(S.engineName)} on ${esc(S.fuelType)}` : 'Buy a Tow hook to start hauling.',
                  extra: `<table class="po-cmp po-mini"><tbody>${rows}</tbody></table>${derate}`, state: m && S.towMax ? 'on' : '' });
  }

  function chargeCard(id) {
    const ec = E(), g = G, C = ec.CHARGES[id], have = ec.charges(g)[id] || 0, c = ec.canBuy(g, id, ST), types = ec.rockTypes();
    const pips = `<span class="po-rack">${Array.from({ length: C.max }, (_, i) => `<span class="${i < have ? 'on' : ''}"></span>`).join('')}</span>`;
    const cracks = Object.entries(types).map(([t, T]) => {
      const M = C.E / T.Q / 1000, r = Math.min(T.rMax ?? Infinity, Math.cbrt(3 * M / (4 * Math.PI * T.rho)));
      return `<span class="po-rk"><span class="po-dot" style="background:${(T.col || ['#ccc'])[0]}"></span>${t} ${fmtN(M)} t${isFinite(T.rMax) && r >= T.rMax ? ' (any)' : ` (r ${r.toFixed(1)} m)`}</span>`;
    }).join('');
    const trap = have < C.max ? ec.chargeTrap(g, id) : null;
    const rows = have < C.max ? compare((m) => { m.charges[id] = (m.charges[id] || 0) + 1; }, ['twr', 'dv', 'dry'], { keep: ['twr'] }) : '';
    return card({ title: C.name, tag: `${C.tnt} kg TNT`, price: money(ec.priceOf(g, id, ST)), desc: C.desc,
                  specs: `${fmtN(C.E / 1e6, C.E < 1e8 ? 1 : 0)} MJ · ${C.mass >= 0.1 ? `${C.mass} t` : `${fmtN(C.mass * 1000)} kg`} each · carry up to ${C.max} · fuse 5 s`,
                  rows: rows + (trap ? `<p class="po-warn">⚠ ${esc(trap.msg)}</p>` : ''),
                  extra: `<p class="po-now">Rack: ${pips} ${have} / ${C.max}</p><p class="po-cracks">Cracks up to: ${cracks}</p>`,
                  how: 'B plants it', btn: buyButton(id, c), state: cardState(c), cls: 'po-charge' });
  }

  function rockGuide() {
    const ec = E(), g = G, S = g.S, types = ec.rockTypes();
    const cell = (M, T) => { const r = Math.cbrt(3 * M / (4 * Math.PI * T.rho)); return isFinite(T.rMax) && r > T.rMax ? 'any' : `r ≤ ${r.toFixed(1)} m`; };
    return `<section class="po-sec" id="sec-rocks"><h3 class="po-h">Rock guide</h3><p class="po-sub">Mass = density × 4/3 π r³. Value = the ore inside (lasering, cracking and selling whole all draw on the same ore, so nothing mints money).</p>
      <table class="po-table po-rocks"><thead><tr><th>Type</th><th>Density</th><th>Pays at Hub</th><th>r 4 m rock</th><th>Your winch takes</th><th>Toughness</th></tr></thead><tbody>
      ${Object.entries(types).map(([t, T]) => { const m4 = T.rho * 4 / 3 * Math.PI * 64; return `<tr><td><span class="po-dot" style="background:${(T.col || ['#ccc'])[0]}"></span>${t}</td>
        <td>${T.rho} t/m³</td><td>$${T.perT}/t</td><td>${fmtN(m4)} t · ${money(Math.round(m4 * T.perT))}</td><td>${S.towMax ? cell(S.towMax, T) : '<span class="po-dim">no tow gear</span>'}</td><td>${T.Q} J/kg</td></tr>`; }).join('')}
      </tbody></table></section>`;
  }


  // ======================================================================
  //  SUIT / WEAPONS
  // ======================================================================

  function suit() {
    return jumpNav([['sec-suit', 'Suit'], ['sec-moves', 'Moves'], ['sec-boom', 'Bombs'], ['sec-tether', 'Tether & jetpack'], ['sec-gear', 'Gear'], ['sec-xlate', 'Translator']])
      + section('Suit: from padded to exoskeleton', 'Worn by you, not the ship, so suit gear adds no ship mass. Exo frames walk faster, jump higher and carry more.', lineCard('suit'), 'sec-suit')
      + section('Moves', 'Sprint with Shift, dive roll with C (the first moments of a roll dodge everything: time it on a bug\'s wind-up). On tiny moons every pace is capped at 0.6× orbital speed, or your feet would leave the ground.', ['sprint', 'roll'].map(lineCard).join(''), 'sec-moves')
      + section('Bombs', 'Free to throw: each charge refills on its own timer. Right mouse aims (hold) and throws (release); B throws at the cursor. Bombs crack small rocks too.', lineCard('bomb'), 'sec-boom')
      + section('Tether & jetpack', 'E steps out on a tether whenever you are flying or docked; Q winches you home.', ['tether', 'jet'].map(lineCard).join(''), 'sec-tether')
      + section('Gear', '', ['pack', 'o2', 'laser'].map(lineCard).join(''), 'sec-gear')
      + section('Translator', 'The aliens of the Crumb Belt talk in their own scripts. A translator turns the dots into words. (Hints, jobs and prices are always in English.)', lineCard('xlate'), 'sec-xlate');
  }
  function weapons() {
    return section('Weapons', 'Space fires the ship guns. N fires an Orion pulse: one big shove, up to 3 carried.',
                   ['gun', 'turret'].map(lineCard).join('') + orionCard());
  }

  // ---------------- cards ----------------

  //  state: '' | 'on' (equipped / maxed) | 'locked' (buy the tier before) | 'gated' (needs a bigger frame) | 'broke'
  function card({ title, tag = '', kind = null, price = '', desc = '', specs = '', how = '', rows = '', extra = '', btn = '', state = '', cls = '' }) {
    return `<article class="po-item ${state.split(' ').filter(Boolean).map((x) => `po-${x}`).join(' ')} ${cls}"><header><div class="po-ttl"><h4>${title}</h4>${kind ? `<span class="po-tag po-kind ${kind[1]}">${kind[0]}</span>` : ''}${
      tag ? `<span class="po-tag">${tag}</span>` : ''}</div>${price ? `<span class="po-price">${price}</span>` : ''}</header>
      ${desc ? `<p class="po-desc">${desc}</p>` : ''}${specs ? `<p class="po-specs">${specs}</p>` : ''}${how ? `<p class="po-how">⌨ ${esc(how)}</p>` : ''}
      ${rows}${extra}<div class="po-act">${btn}</div></article>`;
  }
  const cardState = (c, id) => (!c || c.ok ? '' : c.why === 'locked' ? 'locked' : c.why === 'broke' ? 'broke'
    : c.why === 'frame' ? `gated${id && G.money < E().priceOf(G, id, ST) ? ' broke' : ''}` : '');

  function buyButton(id, c = E().canBuy(G, id, ST)) {
    const ec = E();
    if (c.ok) return `<button class="po-btn po-go" data-act="buy" data-id="${id}">Buy · ${money(c.price)}</button>`;
    const T = ec.TIER[id];
    const why = { broke: `Need ${money(c.need)} more`, owned: 'Installed ✓', max: 'Rack full',
                  locked: c.after ? `🔒 Needs a ${esc(ec.CATALOG.find((x) => x.id === c.after).name)} first` : `🔒 Buy the ${T && T.tier > 1 ? esc(T.line.tiers[T.tier - 2].name) : 'tier before'} first`,
                  frame: `🔒 Needs a ${c.frame ? esc(ec.FRAMES[c.frame].name) : 'bigger'} frame`,
                  notsold: 'Not sold at this station', unknown: '?' }[c.why];
    return `<button class="po-btn" disabled>${why}</button>`;
  }

  function lineCard(lineId) {
    const ec = E(), g = G, L = ec.LINE[lineId], idx = ec.tierIndex(g, lineId), next = L.tiers[idx];
    const cur = idx ? L.tiers[idx - 1] : null, n = L.tiers.length;
    const pips = `<span class="po-pips" title="tier ${idx} of ${n}">${L.tiers.map((_, i) => (i < idx ? '●' : '○')).join('')}</span>`;
    const now = `<p class="po-now">${L.name}: <b>${esc(cur ? cur.name : L.stock)}</b> ${pips}</p>`;
    const lad = n > 1 ? `<p class="po-tiers">${L.tiers.map((t, i) => `<span class="${i < idx ? 'own' : i === idx ? 'next' : ''}">${esc(t.name)}${
      i < idx ? ' ✓' : ` ${money(ec.priceOf(g, t.id, ST))}${frameTag(t.id)}`}</span>`).join('<span class="po-step">›</span>')}</p>` : '';
    if (!next) return card({ title: cur.name, tag: 'MAXED ★', desc: cur.desc, how: L.how, extra: now + lad, btn: '<span class="po-ok">✓ Best there is</span>', state: 'on' });
    const c = ec.canBuy(g, next.id, ST), need = c.why === 'frame' ? ec.FRAMES[c.frame] : null;
    const rows = need ? `<p class="po-lock">🔒 Fly a <b>${esc(need.name)}</b> or bigger to use it${lineId === 'tow' ? ` (it carries tow tier ${need.towTierMax})` : ''}.</p>`
                      : compare((m) => { m.owned[next.id] = true; }, null, { add: lineId === 'tow' ? ['dvRock'] : lineId === 'tank' ? haulRows() : [] });
    return card({ title: next.name, tag: `TIER ${idx + 1}/${n}`, price: money(ec.priceOf(g, next.id, ST)), desc: next.desc, specs: tierSpecs(lineId, next),
                  how: L.how, rows, extra: now + lad, btn: buyButton(next.id, c), state: cardState(c, next.id) });
  }
  // tiny moons cap foot speed at 0.6 × circular speed (EVA.surfaceCap): which ones would cap v, and what you really get there
  function capNote(v, verb, say) {
    if (typeof EVA === 'undefined' || !EVA || !EVA.surfaceCap) return '';
    const capped = G.w.bodies.filter((b) => !b.star && b.id !== 'mochi' && EVA.surfaceCap(b) < v - 1e-6).sort((a, b) => EVA.surfaceCap(b) - EVA.surfaceCap(a));
    if (!capped.length) return '';
    const b = capped[0];
    return ` · ${verb} on ${capped.length} tiny moon${capped.length > 1 ? 's' : ''} (${esc(b.name)}: ${say(EVA.surfaceCap(b))}; any faster and you'd leave the ground)`;
  }
  const frameTag = (id) => { const f = E().frameNeed(G, id); return f ? ` <i>(${esc(E().FRAMES[f].name)}+)</i>` : ''; };
  // a stat line for the lines whose numbers the compare rows do not spell out
  function tierSpecs(lineId, t) {
    const s = t.set, k = G.S.k ?? 1;
    if (lineId === 'tow') {
      const M = E().metrics(G, E().previewS(G, (m) => { m.owned[t.id] = true; }), s.towMax);
      return `rating ${fmtN(s.towMax)} t · cable ${s.cableLen} m · reel ${s.reelV} m/s · ${t.mass} t · Δv with a ${fmtN(s.towMax)} t rock: <b>${fmtN(M.dvRock, M.dvRock < 10 ? 2 : 1)} m/s</b>`;
    }
    if (lineId === 'side') return `${fmtN(s.sideThrust * k, 1)} kN on your frame (${s.sideThrust} kN × ${k})${s.dashBoost ? ` · dash ×${s.dashBoost}, cooldown ${s.dashCd} s` : ' · no dash'}`;
    if (lineId === 'bomb') return `${s.bombs} charges · ${s.bombDmg} dmg · blast ${s.bombR} m · crater ${s.bombDig} m · ${fmtN(s.bombE / 1e6, 2)} MJ · refill ${s.bombCd} s${s.bombSticky ? ' · sticky' : ''}`;
    if (lineId === 'roll') return `${s.rollDist} m in ${s.rollT} s on Mochi${capNote(s.rollDist / s.rollT, 'slower', (c) => `${(s.rollDist / c).toFixed(2)} s`)} · untouchable for the first ${s.rollIframes} s · cooldown ${s.rollCd} s${s.rollAir ? ` · air dash ${s.rollAir} m/s` : ''}`;
    if (lineId === 'sprint') { const v = (G.S.walk ?? 3) * (G.S.walkMult ?? 1) * s.sprint; return `${fmtN(v, 1)} m/s on Mochi${capNote(v, 'capped', (c) => `${fmtN(c, 1)} m/s`)}`; }
    if (lineId === 'suit') return `${s.suitHp} hp · armor ${Math.round(s.suitArmor * 100)}% · ${s.suitMass ? `+${s.suitMass} kg suit` : ''}${t.carry ? ` · carries +${t.carry} kg` : ''} · safe landing ${s.fallSafe} m/s`;
    return '';
  }

  function orionCard() {
    const ec = E(), g = G, O = ec.ORION, have = ec.state(g).orion;
    const sold = !!ec.orionTab(ST), black = ST.kind === 'black', c = ec.canBuy(g, O.id, ST);
    const pips = `<span class="po-nukes">${Array.from({ length: O.max }, (_, i) => `<span class="${i < have ? 'on' : ''}">☢</span>`).join('')}</span>`;
    return card({ title: O.name, tag: black ? 'NO QUESTIONS' : sold && ST.kind !== 'dev' ? '+80% HERE' : '', price: sold ? money(ec.priceOf(g, O.id, ST)) : '',
                  desc: O.desc, specs: `+${O.mass.toFixed(2)} t each · ${g.S.orionJ} kN·s per pulse · digs a crater within ${O.craterAlt} m of the ground · dents the pusher plate`,
                  how: 'N fires one', rows: sold && have < O.max ? compare((m) => { m.orion = Math.min(O.max, m.orion + 1); }, ['orion', 'orionDv', 'dv', 'dry']) : '',
                  extra: `<p class="po-now">Carrying: ${pips}</p>${!sold ? '<p class="po-dim">Not sold here. Try the black market (or the Hub, at a markup).</p>' : ''}`,
                  btn: sold ? buyButton(O.id, c) : '', state: sold ? cardState(c) : '', cls: 'po-orion' });
  }

  // BEFORE -> AFTER rows for every headline number that changes (or the `only` ones); opt rows only when in `only` or `add`;
  // `keep` rows show even when unchanged (a frame keeps your Δv: that is news too)
  function compare(mutate, only, { add = [], keep = [] } = {}) {
    const ec = E(), g = G, S0 = baseS(), S1 = ec.previewS(g, mutate);
    const rk = Math.max(S0.towMax || 0, S1.towMax || 0) || 300;
    const a = ec.metrics(g, S0, rk), b = ec.metrics(g, S1, rk), want = only ? [...only, ...add] : add;
    const rows = MET.filter(([id, , f, , , opt]) => (opt ? want.includes(id) : !only || want.includes(id) || id === 'dry' || !MET_CORE.has(id))
                                                  && (id !== 'twrHere' || a.here) && (keep.includes(id) || f(a[id]) !== f(b[id])));
    if (!rows.length) return '';
    return `<table class="po-cmp">${rows.map(([id, label, f, better, tip]) => {
      const d = (b[id] - a[id]) * better, fa = f(a[id]), cls = better === 0 || fa === f(b[id]) ? '' : fa === 'none' ? 'up' : d > 0 ? 'up' : 'down';
      const warn = id === 'twr' && b.twr < 1 ? ' <span class="po-flag" title="Too heavy to lift off Mochi with a full tank">can’t lift off!</span>' : '';
      return `<tr><td><abbr title="${esc(tip)}">${typeof label === 'function' ? label(a) : label}</abbr></td><td class="po-was">${f(a[id])}</td><td class="po-arrow">→</td>
        <td class="${cls}"><b>${f(b[id])}</b>${warn}</td></tr>`;
    }).join('')}</table>`;
  }
  // with an `only` list, these headline rows obey it; every other changed row (suit, side pods...) always shows
  const MET_CORE = new Set(['dv', 'twr', 'isp', 'thrust', 'tankVol', 'fuelT', 'iondv', 'ionIsp', 'hold', 'hull', 'armor', 'rcs', 'spin', 'nudge', 'tractor', 'scanner',
                            'sideAcc', 'dash', 'tow', 'cable', 'reel', 'orion']);
  const baseS = () => (cache || (cache = E().previewS(G, null)));
  const haulRows = () => ((G.S.towMax || 0) > 0 ? ['towImp', 'dvRock'] : []);      // tow numbers only once you can tow


  // ======================================================================
  //  DEV BENCH (the Debug Duck's shop only)
  // ======================================================================

  function dev() {
    const ec = E(), g = G, inf = ec.isInf(g), haulOn = typeof Haul !== 'undefined' && Haul && g.mod && g.mod.haul;
    const btn = (id, label, cls = '', dis = false) => `<button class="po-btn ${cls}" data-act="dev" data-id="${id}" ${dis ? 'disabled' : ''}>${label}</button>`;
    let html = `<div class="po-devtop">
      <div class="po-devbox"><h4>Money</h4><p class="po-dim">∞ money pins your wallet at $1,000,000,000; buys still subtract, so prices stay honest.</p>
        <div class="po-btns">${btn('inf', inf ? '∞ money: ON (I)' : '∞ money: OFF (I)', inf ? 'po-go' : '')}${btn('cash', '+$5,000 (K)')}</div></div>
      <div class="po-devbox"><h4>Big buttons</h4><p class="po-dim">Max everything: Leviathan, Sunflower torch on D-He3, every line maxed, charges and Orion full.</p>
        <div class="po-btns">${btn('max', '★ Max everything', 'po-go po-lg')}${btn('stockall', 'Stock everything')}</div></div>
      <div class="po-devbox"><h4>Top up</h4><p class="po-dim">Fuel, xenon, RCS, hull, crack charges, suit HP, air, jet fuel, bombs and cooldowns.</p>
        <div class="po-btns">${btn('topup', 'Top up (U)', 'po-go')}${btn('charges', 'Free charges')}${btn('ore', 'Fill hold with ore')}</div></div></div>`;

    html += `<section class="po-sec"><h3 class="po-h">Builds (computed live)</h3><p class="po-sub">A build replaces the ship (frame, engine, parts) and fills the tanks; your suit stays. Also as a URL: <code>?dev=1&amp;build=beast</code>.</p>
      <table class="po-table po-builds"><thead><tr><th>Build</th><th>Frame</th><th>Engine · fuel</th><th>Empty</th><th>Δv</th><th>Lift</th><th>Hold</th><th>Tow</th><th></th></tr></thead><tbody>`;
    for (const [id, B] of Object.entries(ec.BUILDS)) {
      if (B.suit) continue;
      const S = ec.previewS(g, (m) => ec.buildState(m, id)), M = ec.metrics(g, S), now = S.frameId === g.S.frameId && S.engine === g.S.engine && Math.abs(S.dry - g.S.dry) < 1e-6;
      html += `<tr class="${now ? 'po-now-row' : ''}"><td><b>${esc(B.name)}</b> <span class="po-dim">${id}</span></td><td>${esc(S.frameName)}</td><td>${esc(S.engineName)} · ${esc(S.fuelType)}</td>
        <td>${fmtN(S.dry, 2)} t</td><td><b>${fmtN(M.dv)}</b> m/s</td><td class="${M.twr < 1 ? 'down' : ''}">${M.twr.toFixed(2)}×</td><td>${fmtN(S.cargoCap)} kg</td>
        <td>${S.towMax ? `${fmtN(S.towMax)} t` : '—'}</td><td><button class="po-btn po-sm ${now ? '' : 'po-go'}" data-act="build" data-id="${id}">${now ? 'Again' : 'Fly it'}</button></td></tr>`;
    }
    html += `</tbody></table><div class="po-btns po-row-end">${btn('stockship', 'Stock ship')}<button class="po-btn po-go" data-act="build" data-id="suit">Suit max</button>${btn('stocksuit', 'Stock suit')}</div></section>`;

    const types = ec.rockTypes(), T = types[pick.type] || types.gravel, M = T.rho * 4 / 3 * Math.PI * pick.r ** 3, tooBig = isFinite(T.rMax) && pick.r > T.rMax;
    html += `<section class="po-sec"><h3 class="po-h">Rock spawner</h3><p class="po-sub">Drops a free rock 3 r + your radius ahead of the nose, moving with you, and closes the shop. Then G grapples it, B cracks it.</p>
      <div class="po-devrock"><div class="po-chips">${Object.keys(types).map((t) => `<button class="po-chip ${t === pick.type ? 'on' : ''}" data-act="rtype" data-id="${t}"><span class="po-dot" style="background:${(types[t].col || ['#ccc'])[0]}"></span>${t}</button>`).join('')}</div>
      <div class="po-chips">${[2, 4, 6, 10, 15].map((r) => `<button class="po-chip ${r === pick.r ? 'on' : ''}" data-act="rsize" data-id="${r}">r ${r} m</button>`).join('')}</div>
      <p class="po-dim">${pick.type} r ${pick.r} m: <b>${fmtN(M)} t</b>, worth ${money(Math.round(M * T.perT))} at the Hub${tooBig ? ` (wild ${pick.type} tops out at r ${T.rMax} m: this one is a dev special)` : ''}${
        g.S.towMax ? ` · your tow rating ${fmtN(g.S.towMax)} t${M > g.S.towMax ? ': too big, crack it first' : ''}` : ''}</p>
      ${btn('rock', haulOn ? 'Spawn rock ahead' : 'Spawn rock ahead (needs the haul module)', 'po-go', !haulOn)}</div></section>`;

    html += `<section class="po-sec"><h3 class="po-h">Dev keys</h3><div class="po-keys">${[['O', 'this shop, anywhere'], ['U', 'top up'], ['I', '∞ money'], ['K', '+$5,000'],
      ['T', 'next spawn point'], ['J', 'pirate'], ['L', 'cycle translator']].map(([k, t]) => `<span><kbd>${k}</kbd> ${t}</span>`).join('')}</div></section>`;
    return html;
  }


  // ======================================================================
  //  SHIP SHEET
  // ======================================================================

  function sheet() {
    const ec = E(), g = G, S = g.S, sh = g.sh, mNow = Physics.mass(sh, S), mFull = S.dry + S.fuel + (S.ionTank || 0) + (sh.cargoKg || 0) / 1000;
    const dvNow = Physics.deltaV(sh, S), M = ec.metrics(g, S);
    const parts = (S.massParts || [[`${S.name} hull`, S.dry]]).slice(), sum = parts.reduce((s, p) => s + p[1], 0);
    if (S.dry - sum > 1e-6) parts.push(['Other gear', S.dry - sum]);
    const big = (label, val, tip) => `<div class="po-stat"><small><abbr title="${esc(tip)}">${label}</abbr></small><b>${val}</b></div>`;
    let html = `<div class="po-stats">
      ${big('Frame', `${esc(S.frameName || S.name)}`, `${S.length} m long, engine mount ${S.mount ?? 1}`)}
      ${big('Δv now', `${fmtN(dvNow)} m/s`, 'Speed change left in the tank right now (with your cargo).')}
      ${big('Δv full', `${fmtN(M.dv)} m/s`, 'With a full tank and an empty hold.')}
      ${S.ionTank ? big('Ion Δv now', `${fmtN(Physics.ionDeltaV(sh, S))} m/s`, 'From the ion drive (X).') : ''}
      ${big('Engine', `${esc(S.engineName || S.engine)}`, `${S.thrust} kN thrust`)}
      ${big('Isp', `${fmtN(M.isp)} s`, 'Real-world equivalent specific impulse.')}
      ${M.jetP ? big('Jet power', fmtW(M.jetP), 'Real-equivalent ½ · T · ve × 8.') : ''}
      ${big('Mass now', `${fmtN(mNow, 2)} t`, 'Everything aboard right now.')}
      ${S.towMax ? big('Tow rating', `${fmtN(S.towMax)} t`, `${S.cableLen} m cable`) : ''}</div>`;

    html += `<div class="po-cols"><div><h3 class="po-h">Mass budget</h3><table class="po-table po-mass"><tbody>
      ${parts.map(([n, t]) => `<tr><td>${esc(n)}</td><td>${fmtN(t, 2)} t</td></tr>`).join('')}
      <tr class="po-sum"><td>Empty ship</td><td>${fmtN(S.dry, 2)} t</td></tr>
      <tr><td>${esc(S.fuelType)} (${fmtN(S.tankVol, 1)} m³ × ${S.fuelDens} t/m³ = ${fmtN(S.fuel, 2)} t max)</td><td>${fmtN(sh.fuel, 2)} t</td></tr>
      ${S.ionTank ? `<tr><td>${esc(S.ionFuelType)} for the ion drive</td><td>${fmtN(sh.xe || 0, 2)} t</td></tr>` : ''}
      <tr><td>Cargo</td><td>${fmtN((sh.cargoKg || 0) / 1000, 2)} t</td></tr>
      <tr class="po-sum"><td>Total now</td><td>${fmtN(mNow, 2)} t</td></tr>
      <tr><td class="po-dim">Total with full tanks</td><td class="po-dim">${fmtN(mFull, 2)} t</td></tr></tbody></table></div>`;

    html += `<div><h3 class="po-h">Can I lift off?</h3><table class="po-table"><thead><tr><th>Rock</th><th>Gravity</th>
      <th><abbr title="Thrust-to-weight with what is aboard now, in the deepest valley">Now</abbr></th><th><abbr title="Thrust-to-weight with full tanks, in the deepest valley">Full</abbr></th></tr></thead><tbody>
      ${g.w.bodies.filter((b) => !b.star).map((b) => { const gv = b.mu / (b.Rc || b.R) ** 2, now = S.thrust / (mNow * gv), full = S.thrust / (mFull * gv);
        return `<tr><td>${esc(b.name)}</td><td>${b.g.toFixed(1)}–${gv.toFixed(1)} m/s²</td><td class="${liftCls(now)}">${now.toFixed(2)}×</td><td class="${liftCls(full)}">${full.toFixed(2)}×</td></tr>`; }).join('')}
      </tbody></table><p class="po-dim">Lumpy rocks pull hardest in their deepest valleys, so these are worst cases. Above 1.2× is comfy, 1.0-1.2× is sluggish, below 1.0× you cannot take off (hold W to burn fuel off until you can).</p></div></div>`;

    const m0 = sh.fuel > 0 ? mNow : mFull, m1 = m0 - (sh.fuel > 0 ? sh.fuel : S.fuel);
    html += `<div class="po-eq"><h3 class="po-h">The rocket equation (Tsiolkovsky says hi)</h3>
      <p><b>Δv = v<sub>e</sub> × ln(m<sub>full</sub> ÷ m<sub>empty</sub>)</b> = ${fmtN(S.ve)} m/s × ln(${fmtN(m0, 2)} t ÷ ${fmtN(m1, 2)} t)
      = <b>${fmtN(S.ve * Math.log(m0 / Math.max(1e-9, m1)))} m/s</b></p>
      <p class="po-dim">v<sub>e</sub> is the exhaust speed in this 1:${CONFIG.ISP_SCALE} model belt; real Isp = v<sub>e</sub> × ${CONFIG.ISP_SCALE} ÷ 9.81 = ${fmtN(M.isp)} s.
      Dense fuel packs more tonnes into a tank, high Isp makes each tonne count. Hauling cargo raises m on both sides, so Δv drops.
      With a rock of M tonnes on the rope, add M to both masses: Δv ≈ v<sub>e</sub> × fuel ÷ M = ${fmtN(M.towImp)} kN·s ÷ M.</p></div>`;
    return html;
  }
  const liftCls = (r) => (r >= 1.2 ? 'up' : r >= 1 ? 'meh' : 'down');


  // ======================================================================
  //  KEEPER PORTRAITS (inline SVG, toon: flat base + shadow band + highlight + ink)
  // ======================================================================

  // the keeper as their own NPC sprite (npcs.js) when we know who they are: Rust is a mouthless Murk, Marge a one-eyed Oggle
  function keeperNpc(st) {
    if (typeof Npcs === 'undefined' || !Npcs || !Npcs.drawSprite || !Npcs.RACES || !st || st.kind === 'dev') return null;
    const all = [...(Npcs.DEFS || []), ...(Npcs.NAMED_EXTRAS || [])], name = typeof st.keeper === 'string' ? st.keeper : st.keeper && st.keeper.name;
    const id = st.npc || (Npcs.keeperOf && Npcs.keeperOf(st.id));
    const d = all.find((x) => x.id === id) || (name ? all.find((x) => x.name === name || x.short === name) : null);
    return d && Npcs.RACES[d.race] ? d : null;
  }
  const NPC_MOOD = { happy: 'happy', sad: 'sad', wow: 'joke' };
  function drawKeeper() {
    const cv = root && root.querySelector('canvas.po-npc'), d = cv && keeperNpc(ST);
    if (!d || !cv.getContext) return;
    const ctx = cv.getContext('2d'), [hx, hy, hr] = Npcs.RACES[d.race].head, k = cv.width / (2.9 * hr);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save(); ctx.translate(cv.width / 2 - hx * k, cv.height * 0.56 + hy * k); ctx.scale(k, -k);
    Npcs.drawSprite(ctx, d.race, { off: (hash(d.id) % 997) / 97, ...d.look }, { t: G ? G.real : 0, mood: NPC_MOOD[mood] || 'chat', lw: 0.035 });
    ctx.restore();
  }

  function portrait(st, md) {
    const h = hash(st.id || st.name || 'x'), kind = st.kind;
    if (kind === 'dev') return duck(md);
    const pal = kind === 'black' ? [['#7b5cc4', '#4c3487', '#b49cf2'], ['#5f6fb8', '#3b4580', '#a7b4ec']][h % 2]
              : kind === 'outpost' ? [['#8fd36b', '#5a9440', '#cdf3a8'], ['#e3b04b', '#a3732a', '#ffe0a0']][h % 2]
              : [['#9ec7ff', '#5f86c8', '#e0eeff'], ['#ff9ec7', '#c4628d', '#ffd6e8']][h % 2];
    const [base, shade, hi] = pal, ink = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
    const head = (cx, cy, rx, ry) => `<clipPath id="po-hc"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${shade}"/>
      <g clip-path="url(#po-hc)"><ellipse cx="${cx - rx * 0.16}" cy="${cy - ry * 0.18}" rx="${rx}" ry="${ry}" fill="${base}"/>
      <ellipse cx="${cx - rx * 0.45}" cy="${cy - ry * 0.55}" rx="${rx * 0.26}" ry="${ry * 0.14}" fill="${hi}" transform="rotate(-30 ${cx - rx * 0.45} ${cy - ry * 0.55})"/></g>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" ${ink}/>`;
    let s;
    if (kind === 'black') {
      s = `<path d="M14 98 Q10 40 50 16 Q90 40 86 98 Z" fill="#2c1f4f" ${ink}/>${head(50, 60, 26, 26)}
        <path d="M24 52 Q50 28 76 52 Q72 34 50 26 Q28 34 24 52 Z" fill="#2c1f4f"/>
        <g class="po-eyes"><path d="M33 58 Q40 52 46 58 Q40 61 33 58 Z" fill="#ffe066" ${ink}/><path d="M54 58 Q60 52 67 58 Q60 61 54 58 Z" fill="#ffe066" ${ink}/></g>
        ${md === 'sad' ? mouth(md, 50, 74, 9) : `<path d="M36 70 Q50 82 64 70" fill="#fff4dc" ${ink}/><rect x="52" y="71" width="5" height="5" fill="#ffd166" stroke="${INK}" stroke-width="1.5"/>`}
        <path d="M70 66 l6 -2 M71 70 l6 0" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    } else if (kind === 'outpost') {
      s = `${head(50, 62, 34, 28)}<g class="po-eyes">${eye(35, 54, 8)}${eye(65, 54, 8)}</g>${cheeks(68, 24)}${mouth(md, 50, 72, 10)}
        <path d="M18 44 Q22 18 50 16 Q78 18 82 44 Z" fill="#ffd166" ${ink}/><rect x="12" y="40" width="76" height="7" rx="3.5" fill="#ffb347" ${ink}/>
        <circle cx="50" cy="29" r="6" fill="#fff8c0" ${ink}/><path d="M56 27 L74 20 M56 31 L74 34" stroke="#fff3a0" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>`;
    } else {
      s = `<path d="M50 30 Q52 14 62 10" fill="none" ${ink}/><circle cx="63" cy="10" r="5" fill="#ffd166" ${ink}/>
        ${head(50, 60, 33, 31)}<g class="po-eyes">${eye(37, 56, 9)}${eye(63, 56, 9)}</g>${cheeks(70, 25)}${mouth(md, 50, 74, 10)}
        <path d="M22 40 Q26 22 50 21 Q74 22 78 40 Z" fill="${kind === 'hub' ? '#ff9f1c' : '#33c27a'}" ${ink}/>
        <path d="M74 38 Q88 38 92 44 L74 44 Z" fill="${kind === 'hub' ? '#ff9f1c' : '#33c27a'}" ${ink}/>
        <path d="M50 26 l2.4 5 5.4 .6 -4 3.7 1.1 5.3 -4.9 -2.7 -4.9 2.7 1.1 -5.3 -4 -3.7 5.4 -.6 Z" fill="#fff4dc" stroke="${INK}" stroke-width="1.5"/>`;
    }
    return `<svg viewBox="0 0 100 100" class="po-face po-${md}" aria-hidden="true">${s}</svg>`;
  }
  const inkA = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  const mouth = (md, x, y, w) => md === 'sad' ? `<path d="M${x - w} ${y + 4} Q${x} ${y - 4} ${x + w} ${y + 4}" fill="none" ${inkA} stroke-linecap="round"/>`
    : md === 'wow' ? `<ellipse cx="${x}" cy="${y + 1}" rx="${w * 0.45}" ry="${w * 0.55}" fill="#7a2a4a" ${inkA}/>`
    : `<path d="M${x - w} ${y - 2} Q${x} ${y + w * 0.9} ${x + w} ${y - 2} Z" fill="#7a2a4a" ${inkA}/><path d="M${x - w * 0.45} ${y + w * 0.35} Q${x} ${y + w * 0.1} ${x + w * 0.45} ${y + w * 0.35}" fill="none" stroke="#ff8fab" stroke-width="2.5" stroke-linecap="round"/>`;
  const eye = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.15}" fill="#fff" ${inkA}/><circle cx="${x + r * 0.15}" cy="${y + r * 0.2}" r="${r * 0.55}" fill="${INK}"/>
    <circle cx="${x - r * 0.1}" cy="${y - r * 0.1}" r="${r * 0.2}" fill="#fff"/>`;
  const cheeks = (y, dx, cx = 50) => `<ellipse cx="${cx - dx}" cy="${y}" rx="6" ry="3.6" fill="#ff7eb6" opacity=".5"/><ellipse cx="${cx + dx}" cy="${y}" rx="6" ry="3.6" fill="#ff7eb6" opacity=".5"/>`;

  // the Debug Duck: a yellow rubber duck bobbing in a bath, one white highlight, a ladybug riding on its head (the bug it is debugging)
  function duck(md) {
    const beak = md === 'wow' ? `<path d="M76 47 Q92 40 97 46 Q90 49 80 49 Z" fill="#ff9f1c" ${inkA}/><path d="M78 51 Q90 52 95 57 Q86 60 77 55 Z" fill="#e8730f" ${inkA}/>`
               : md === 'sad' ? `<path d="M76 50 Q92 52 95 58 Q86 60 76 56 Z" fill="#ff9f1c" ${inkA}/>`
               : `<path d="M76 46 Q93 41 97 49 Q92 56 76 54 Z" fill="#ff9f1c" ${inkA}/><path d="M80 51 Q88 52 95 50" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 100 100" class="po-face po-${md}" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" fill="#dff4ff"/>
      <circle cx="18" cy="22" r="5" fill="#fff" stroke="#9fdcff" stroke-width="2"/><circle cx="28" cy="12" r="3" fill="#fff" stroke="#9fdcff" stroke-width="2"/>
      <clipPath id="po-dk"><path d="M10 74 Q8 56 26 54 Q40 52 46 60 Q50 44 62 30 Q76 18 84 34 Q90 48 76 56 Q92 60 88 76 Q84 90 50 90 Q14 90 10 74 Z"/></clipPath>
      <path d="M10 74 Q8 56 26 54 Q40 52 46 60 Q50 44 62 30 Q76 18 84 34 Q90 48 76 56 Q92 60 88 76 Q84 90 50 90 Q14 90 10 74 Z" fill="#e0a91e"/>
      <g clip-path="url(#po-dk)"><path d="M6 70 Q6 50 26 50 Q40 49 44 56 Q48 40 60 26 Q74 14 82 30 Q86 44 72 52 Q86 58 82 72 Q76 84 46 84 Q8 84 6 70 Z" fill="#ffd84d"/>
        <ellipse cx="60" cy="31" rx="7" ry="4" fill="#fff6c2" transform="rotate(-35 60 31)"/></g>
      <path d="M10 74 Q8 56 26 54 Q40 52 46 60 Q50 44 62 30 Q76 18 84 34 Q90 48 76 56 Q92 60 88 76 Q84 90 50 90 Q14 90 10 74 Z" fill="none" ${inkA}/>
      <path d="M8 60 Q2 54 6 48 Q14 54 16 56" fill="#ffd84d" ${inkA}/>
      <path d="M34 66 Q46 62 56 70 Q46 80 32 74 Z" fill="#f2bd2c" ${inkA}/>
      ${beak}
      <g class="po-eyes">${md === 'sad' ? `<path d="M64 38 Q69 42 74 38" fill="none" ${inkA} stroke-linecap="round"/>` : eye(69, 38, 5.5)}</g>
      <ellipse cx="74" cy="46" rx="4" ry="2.4" fill="#ff7eb6" opacity=".55"/>
      <g transform="translate(66 21)"><ellipse cx="0" cy="0" rx="6" ry="4.6" fill="#e63946" stroke="${INK}" stroke-width="2"/><path d="M0 -4.6 V4.6" stroke="${INK}" stroke-width="1.5"/>
        <circle cx="-3" cy="-1" r="1.1" fill="${INK}"/><circle cx="3" cy="1.2" r="1.1" fill="${INK}"/><circle cx="6.5" cy="-2.5" r="2.2" fill="${INK}"/></g>
      <path d="M0 86 Q10 80 20 86 T40 86 T60 86 T80 86 T100 86 V100 H0 Z" fill="#9fdcff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    </svg>`;
  }


  // ======================================================================
  //  HELPERS & STYLE
  // ======================================================================

  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (isFinite(n) ? `$${Math.floor(n).toLocaleString('en-US')}` : '∞');
  const money2 = (n) => (n >= 10 ? money(n) : `$${n.toFixed(2)}`);
  const pct = (f) => `${Math.round(f * 100)}%`;
  const clamp01 = (f) => (isFinite(f) ? Math.max(0, Math.min(1, f)) : 0);

  function css() {
    if (document.getElementById(CSS_ID)) return;
    const el = document.createElement('style');
    el.id = CSS_ID;
    el.textContent = `
#po-shop { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; background: rgba(23,18,56,.6);
  font-family: "Fredoka", "Baloo 2", "Trebuchet MS", sans-serif; color: ${INK}; pointer-events: auto; }
#po-shop * { box-sizing: border-box; }
#po-shop button { font-family: inherit; color: ${INK}; }
.po-card { width: min(1060px, calc(100vw - 20px)); height: min(740px, calc(100vh - 20px)); display: flex; flex-direction: column; background: #fff4dc;
  border: 3px solid ${INK}; border-radius: 18px; box-shadow: 8px 8px 0 ${INK}; overflow: hidden; }
.po-card.po-in, .po-bubble.po-in { animation: po-pop .2s ease-out; }
@keyframes po-pop { from { transform: scale(.93) rotate(-1deg); opacity: 0 } to { transform: none; opacity: 1 } }
.po-head { display: flex; align-items: center; gap: 14px; padding: 10px 14px; background: var(--accbg); border-bottom: 3px solid ${INK}; }
.po-keeper { flex: 0 0 auto; width: 84px; height: 84px; border: 3px solid ${INK}; border-radius: 50%; background: #fff4dc; box-shadow: 3px 3px 0 ${INK}; overflow: hidden; }
.po-face { width: 100%; height: 100%; display: block; animation: po-bob 2.6s ease-in-out infinite; }
.po-eyes { transform-box: fill-box; transform-origin: center; animation: po-blink 4.2s infinite; }
@keyframes po-bob { 50% { transform: translateY(2px) } }
@keyframes po-blink { 0%, 93%, 100% { transform: scaleY(1) } 96% { transform: scaleY(.1) } }
.po-talk { flex: 1; min-width: 0; }
.po-name { font-weight: 700; font-size: 25px; line-height: 1.05; letter-spacing: .3px; }
.po-bubble { position: relative; display: inline-block; margin: 6px 0 2px 8px; padding: 6px 12px; background: #fff; border: 2.5px solid ${INK}; border-radius: 12px;
  font-size: 15px; line-height: 1.25; max-width: 100%; }
.po-bubble::before { content: ""; position: absolute; left: -11px; top: 9px; border: 6px solid transparent; border-right: 9px solid ${INK}; }
.po-bubble::after { content: ""; position: absolute; left: -6px; top: 10px; border: 5px solid transparent; border-right: 7px solid #fff; }
.po-who { font-size: 12.5px; color: #6d5f8a; margin-left: 10px; }
.po-wallet { flex: 0 0 auto; text-align: right; background: #fff4dc; border: 3px solid ${INK}; border-radius: 12px; padding: 5px 12px; box-shadow: 3px 3px 0 ${INK}; }
.po-wallet small { display: block; font-size: 11px; font-weight: 600; color: #6d5f8a; letter-spacing: .5px; }
.po-wallet b { font-size: 24px; color: #2f9e5b; }
.po-wallet.po-inf b { font-size: 30px; line-height: 1; }
.po-wallet.po-gain { animation: po-gain .5s ease-out; } .po-wallet.po-spend { animation: po-spend .45s ease-out; }
@keyframes po-gain { 30% { transform: scale(1.14) rotate(-3deg); background: #c9f7d6 } }
@keyframes po-spend { 30% { transform: scale(.94) rotate(2deg); background: #ffd3d8 } }
.po-x { flex: 0 0 auto; width: 42px; height: 42px; border: 3px solid ${INK}; border-radius: 12px; background: #ff8fab; font-size: 22px; font-weight: 700;
  box-shadow: 3px 3px 0 ${INK}; cursor: pointer; align-self: flex-start; }
.po-x:hover { background: #ff6b8f; } .po-x:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK}; }
.po-quick { display: flex; gap: 10px; padding: 8px 14px; border-bottom: 2px dashed #d8c39a; flex-wrap: wrap; }
.po-pill { flex: 1 1 240px; display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 10px; align-items: center; }
.po-pl { display: flex; justify-content: space-between; font-size: 13px; gap: 8px; } .po-pl span { color: #6d5f8a; font-weight: 600; }
.po-pill .po-meter { grid-row: 2; } .po-pill > .po-btn, .po-pill > .po-ok, .po-pill > .po-dim { grid-row: 1 / span 2; grid-column: 2; }
.po-sm-note { font-size: 12px; max-width: 120px; line-height: 1.15; }
.po-meter { height: 11px; background: #e9dcc0; border: 2px solid ${INK}; border-radius: 6px; overflow: hidden; }
.po-meter i { display: block; height: 100%; border-right: 2px solid ${INK}; }
.po-meter.po-big { height: 16px; border-radius: 8px; margin: 6px 0; }
.po-tabs { display: flex; gap: 5px; padding: 8px 14px 0; background: var(--accbg); border-bottom: 3px solid ${INK}; flex-wrap: wrap; }
.po-tab { border: 2.5px solid ${INK}; border-bottom: none; border-radius: 10px 10px 0 0; padding: 6px 14px 7px; background: #f3dcae; font-size: 15px; font-weight: 600;
  cursor: pointer; margin-bottom: -3px; position: relative; }
.po-tab:hover { background: #ffe9c2; } .po-tab.on { background: #fff4dc; padding-bottom: 10px; border-bottom: 3px solid #fff4dc; }
.po-tab-dev { background: #ffe76a; } .po-tab-dev::before { content: "🦆 "; }
.po-badge { display: inline-block; background: #e63946; color: #fff; border: 2px solid ${INK}; border-radius: 50%; width: 19px; height: 19px; font-size: 12px; line-height: 15px; text-align: center; }
.po-body { flex: 1; overflow-y: auto; padding: 0 16px 18px; scrollbar-width: thin; position: relative; }
.po-body > :first-child:not(.po-jump) { margin-top: 12px; }
.po-foot { display: flex; justify-content: space-between; gap: 10px; padding: 5px 14px; font-size: 12px; color: #6d5f8a; border-top: 2px dashed #d8c39a; flex-wrap: wrap; }
.po-jump { position: sticky; top: 0; z-index: 2; display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 0 8px; margin-bottom: 2px; background: #fff4dc; border-bottom: 2px dashed #e3d2ad; }
.po-chip { border: 2px solid ${INK}; border-radius: 999px; padding: 3px 11px; background: #fffaf0; font-size: 13.5px; font-weight: 600; cursor: pointer; box-shadow: 2px 2px 0 ${INK}; }
.po-chip:hover { background: #ffe9c2; } .po-chip.on { background: var(--acc); }
.po-chip .po-dot { margin-right: 5px; }
.po-h { font-size: 18px; margin: 10px 0 4px; } .po-sub { margin: 0 0 9px; font-size: 13.5px; color: #6d5f8a; max-width: 900px; }
.po-sec + .po-sec { margin-top: 18px; }
.po-sec { scroll-margin-top: 50px; }
.po-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; align-items: start; }
.po-item { background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 13px; box-shadow: 4px 4px 0 ${INK}; padding: 9px 12px 11px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.po-item.po-on { background: #f0fbe8; } .po-item.po-orion { background: #fff1ea; } .po-item.po-charge { background: #fff4ee; }
.po-item.po-locked { background: #f6efe0; border-style: dashed; box-shadow: 3px 3px 0 #b9a57e; } .po-item.po-locked .po-desc, .po-item.po-locked h4 { opacity: .7; }
.po-item.po-gated { background: #f1edff; border-color: #6d5fa8; box-shadow: 4px 4px 0 #6d5fa8; }
.po-item.po-broke .po-price { color: #d62839; }
.po-item header { display: flex; align-items: flex-start; gap: 8px; }
.po-ttl { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 7px; }
.po-item h4 { margin: 0; font-size: 18px; } .po-price { margin-left: auto; font-weight: 700; font-size: 17px; color: #2f9e5b; white-space: nowrap; }
.po-tag { font-size: 11px; font-weight: 700; letter-spacing: .5px; background: var(--acc); color: ${INK}; border: 2px solid ${INK}; border-radius: 6px; padding: 0 5px; white-space: nowrap; }
.po-kind { background: #fff; } .po-kind.k-ntr { background: #ffd1f2; } .po-kind.k-fus { background: #d9cdff; } .po-kind.k-ion { background: #c8f7ec; } .po-kind.k-chem { background: #ffe2b0; }
.po-desc { margin: 0; font-size: 14px; line-height: 1.25; } .po-specs { margin: 0; font-size: 12.5px; color: #6d5f8a; line-height: 1.3; }
.po-how { margin: 0; font-size: 12.5px; font-weight: 600; color: #2b6f8f; }
.po-note { margin: 0; font-size: 12.5px; color: #8a5a00; background: #fff3c4; border-radius: 8px; padding: 3px 7px; }
.po-lock { margin: 0; font-size: 13px; color: #4b3f8a; background: #e4ddff; border: 2px dashed #6d5fa8; border-radius: 9px; padding: 4px 8px; line-height: 1.3; }
.po-now { margin: 0; font-size: 13px; color: #6d5f8a; } .po-now b { color: ${INK}; }
.po-tiers { margin: 0; font-size: 12px; color: #8a7fa6; line-height: 1.5; } .po-tiers span.own { color: #23864a; } .po-tiers span.next { color: ${INK}; font-weight: 700; }
.po-tiers i { font-style: normal; color: #6d5fa8; } .po-step { color: #c8b48a; margin: 0 4px; font-weight: 700; }
.po-pips { letter-spacing: 2px; color: var(--acc); -webkit-text-stroke: .6px ${INK}; }
.po-flist { margin: 0; padding: 0; list-style: none; font-size: 13px; } .po-flist li { padding: 1px 0; } .po-flist li::before { content: "▸ "; color: var(--acc); }
.po-flist i { color: #6d5fa8; font-style: normal; font-size: 12px; white-space: nowrap; }
.po-pair { margin: 0; font-size: 12.5px; color: #2b5d3f; background: #e3f6dc; border-radius: 8px; padding: 3px 7px; line-height: 1.3; }
.po-act { margin-top: auto; padding-top: 4px; }
.po-btn { font-size: 15px; font-weight: 600; background: #ffe2b0; border: 2.5px solid ${INK}; border-radius: 10px; padding: 7px 12px; box-shadow: 3px 3px 0 ${INK}; cursor: pointer; }
.po-btn:hover:not(:disabled) { background: #ffd166; transform: translate(-1px,-1px); box-shadow: 4px 4px 0 ${INK}; }
.po-btn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK}; }
.po-btn:disabled { background: #eee2c8; color: #8a7fa6; border-color: #8a7fa6; box-shadow: none; cursor: not-allowed; }
.po-gated .po-btn:disabled { background: #e4ddff; color: #4b3f8a; border-color: #6d5fa8; }
.po-btn.po-go:not(:disabled) { background: #8ff0b0; } .po-btn.po-go:hover:not(:disabled) { background: #5fe08f; }
.po-btn.po-sm { font-size: 13.5px; padding: 4px 9px; box-shadow: 2px 2px 0 ${INK}; }
.po-btn.po-lg, .po-ok.po-lg { font-size: 17px; padding: 9px 18px; }
.po-btn small { display: block; font-size: 11.5px; font-weight: 500; color: #6d5f8a; }
.po-item .po-act .po-btn { width: 100%; }
.po-ok { font-weight: 600; color: #2f9e5b; font-size: 14px; white-space: nowrap; }
#po-shop table { color: ${INK}; font-family: inherit; }   /* tables skip inheritance in quirks mode (the bundle has no doctype) */
.po-cmp { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 2px 0; }
.po-cmp td { padding: 1.5px 0; vertical-align: baseline; } .po-cmp td:first-child { color: #6d5f8a; padding-right: 6px; }
.po-cmp .po-was { text-align: right; color: #8a7fa6; white-space: nowrap; } .po-cmp .po-arrow { text-align: center; width: 20px; color: #8a7fa6; }
.po-cmp td:last-child { white-space: nowrap; }
.po-cmp.po-mini td:last-child { text-align: right; }
.up { color: #23864a; } .down { color: #d62839; } .meh { color: #d97706; }
abbr[title] { text-decoration: underline dotted #8a7fa6; cursor: help; }
.po-btn.po-arm:not(:disabled) { background: #ff9fa8; animation: po-shake .35s 2; } .po-fuel.po-heavy { border-color: #e63946; }
.po-act .po-btn + .po-btn { margin-top: 6px; }
@keyframes po-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
.po-flag { font-size: 11px; font-weight: 700; color: #fff; background: #e63946; border-radius: 5px; padding: 0 4px; margin-left: 3px; }
.po-fuels { display: grid; gap: 6px; margin-top: 2px; }
.po-fuel { text-align: left; background: #fff; border: 2px solid ${INK}; border-radius: 10px; padding: 5px 9px; font-size: 14px; }
button.po-fuel { cursor: pointer; box-shadow: 2px 2px 0 ${INK}; } button.po-fuel:hover:not(:disabled) { background: #fff3c4; }
.po-fuel.on { background: #dff7d0; } .po-fuel.po-off { opacity: .6; } .po-fuel small, .po-fuel em { display: block; font-size: 12px; color: #6d5f8a; } .po-fuel em { font-style: normal; color: #8a6d3b; }
.po-ladder { grid-column: 1 / -1; display: flex; align-items: stretch; gap: 4px; background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 13px; box-shadow: 4px 4px 0 ${INK}; padding: 8px 10px; overflow-x: auto; }
.po-rung { flex: 1 1 0; min-width: 96px; display: flex; flex-direction: column; gap: 3px; padding: 4px 7px; border-radius: 9px; border: 2px dashed transparent; }
.po-rung b { font-size: 14px; white-space: nowrap; } .po-rung small { font-size: 11.5px; color: #6d5f8a; white-space: nowrap; }
.po-rung i { display: block; height: 9px; background: #e9dcc0; border: 2px solid ${INK}; border-radius: 5px; }
.po-rung.own i { background: #ffd166; } .po-rung.on { background: #dff7d0; border-color: ${INK}; } .po-rung.on i { background: #ff9f1c; }
.po-ladder > .po-step { align-self: center; font-size: 20px; }
.po-rack span { display: inline-block; width: 13px; height: 13px; margin-right: 3px; border: 2px solid ${INK}; border-radius: 50%; background: #e9dcc0; vertical-align: -2px; }
.po-rack span.on { background: #e63946; }
.po-cracks { margin: 0; font-size: 12.5px; color: #6d5f8a; line-height: 1.5; } .po-rk { white-space: nowrap; margin-right: 8px; }
.po-svcs { display: grid; gap: 12px; }
.po-svc { display: flex; gap: 14px; align-items: center; background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 13px; box-shadow: 4px 4px 0 ${INK}; padding: 9px 14px; flex-wrap: wrap; }
.po-svc-l { flex: 1 1 300px; } .po-svc-l h4 { margin: 0; font-size: 17px; } .po-svc-l p { margin: 0; font-size: 13.5px; }
.po-svc-r { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.po-dim { color: #6d5f8a; font-size: 13px; }
.po-row-end { display: flex; justify-content: flex-end; margin: 12px 0 4px; gap: 8px; flex-wrap: wrap; }
.po-warn { background: #ffe1e1; border: 2.5px solid ${INK}; border-radius: 10px; padding: 7px 12px; font-size: 14px; }
.po-empty { background: #fffaf0; border: 2.5px dashed #b9a57e; border-radius: 12px; padding: 16px; font-size: 15px; }
.po-table { color: ${INK}; font-family: inherit; width: 100%; border-collapse: separate; border-spacing: 0; background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 12px; overflow: hidden; font-size: 14.5px; }
.po-table th { text-align: left; background: #ffe2b0; padding: 6px 10px; font-size: 13px; border-bottom: 2.5px solid ${INK}; }
.po-table td { padding: 5px 10px; border-bottom: 1.5px dashed #e3d2ad; } .po-table tr:last-child td { border-bottom: none; }
.po-table td:last-child { text-align: right; }
.po-rocks td:last-child, .po-builds td:last-child { white-space: nowrap; }
.po-builds td, .po-rocks td { font-size: 13.5px; padding: 4px 8px; } .po-builds tr.po-now-row td { background: #f0fbe8; }
.po-dot { display: inline-block; width: 13px; height: 13px; border: 2px solid ${INK}; border-radius: 4px; margin-right: 7px; vertical-align: -1px; transform: rotate(45deg) scale(.85); }
.po-vs { font-size: 11.5px; font-weight: 600; margin-left: 4px; }
.po-prices { display: flex; flex-wrap: wrap; gap: 6px; }
.po-price-chip { background: #fffaf0; border: 2px solid ${INK}; border-radius: 9px; padding: 3px 9px; font-size: 13px; } .po-price-chip b { margin-left: 5px; }
.po-price-chip.po-off { opacity: .5; }
.po-nukes span { font-size: 18px; color: #d8c8a8; margin-right: 2px; } .po-nukes span.on { color: #e6a800; -webkit-text-stroke: .7px ${INK}; }
.po-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 8px; }
.po-stat { background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 12px; box-shadow: 3px 3px 0 ${INK}; padding: 6px 10px; min-width: 0; }
.po-stat small { display: block; font-size: 12px; color: #6d5f8a; } .po-stat b { font-size: 20px; overflow-wrap: anywhere; }
.po-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; }
.po-mass td:first-child { font-size: 13.5px; } .po-sum td { font-weight: 700; background: #fff1d6; }
.po-eq { margin-top: 10px; background: #f3efff; border: 2.5px solid ${INK}; border-radius: 12px; padding: 4px 14px 8px; }
.po-eq p { margin: 4px 0; font-size: 14.5px; }
.po-devtop { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 12px; }
.po-devbox { background: #fffbe0; border: 2.5px solid ${INK}; border-radius: 13px; box-shadow: 4px 4px 0 ${INK}; padding: 8px 12px 11px; display: flex; flex-direction: column; gap: 4px; }
.po-devbox h4 { margin: 0; font-size: 17px; } .po-devbox p { margin: 0; }
.po-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; padding-top: 4px; }
.po-devrock { background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 13px; box-shadow: 4px 4px 0 ${INK}; padding: 10px 12px; display: grid; gap: 8px; }
.po-chips { display: flex; gap: 6px; flex-wrap: wrap; } .po-devrock > .po-btn { justify-self: start; } .po-devrock p { margin: 0; }
.po-keys { display: flex; gap: 8px 16px; flex-wrap: wrap; font-size: 14px; }
kbd { display: inline-block; min-width: 22px; text-align: center; font-family: inherit; font-weight: 700; background: #fff; border: 2px solid ${INK}; border-radius: 6px; box-shadow: 0 2px 0 ${INK}; padding: 0 5px; }
code { background: #fff; border: 1.5px solid #d8c39a; border-radius: 5px; padding: 0 4px; font-size: 12.5px; }
@media (max-width: 760px) { .po-keeper { width: 60px; height: 60px; } .po-name { font-size: 20px; } .po-wallet b { font-size: 19px; } .po-bubble { font-size: 13.5px; } }
@media (max-height: 680px) { .po-head { padding: 6px 12px; gap: 10px; } .po-keeper { width: 58px; height: 58px; } .po-name { font-size: 20px; }
  .po-bubble { font-size: 13.5px; margin-top: 3px; padding: 4px 10px; } .po-who { display: none; } .po-quick { padding: 5px 14px; }
  .po-tab { padding: 4px 11px 5px; font-size: 14px; } .po-tab.on { padding-bottom: 8px; } .po-foot { display: none; } .po-x { width: 36px; height: 36px; font-size: 19px; } }
`;
    document.head.appendChild(el);
  }


  // ---------------- register: nothing to hook (economy.js drives open/close); keeps ?mods= honest ----------------
  Game.register({ id: 'shop' });
  return { open, close, isOpen, render, portrait };
})();

if (typeof module !== 'undefined') module.exports = Shop;
