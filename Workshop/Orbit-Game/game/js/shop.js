// ======================================================================
//  SHOP  —  the station shop: a comic DOM panel over the game (the sim is
//  paused while it is open). Tabs from station.tabs plus a Ship sheet.
//  Every buyable shows its price, a one-liner, and BEFORE -> AFTER numbers
//  so a newcomer sees the tradeoff. All money rules live in economy.js.
// ======================================================================

const Shop = (() => {

  const INK = '#1b1433';
  const KIND = { hub: { acc: '#ff9f1c', bg: '#ffd9a0', label: 'shopkeeper' },
                 outpost: { acc: '#33c27a', bg: '#c9efc0', label: 'outpost quartermaster' },
                 black: { acc: '#8f6bff', bg: '#d9cdfa', label: 'definitely legitimate merchant' } };
  const TAB_NAMES = { services: 'Services', sell: 'Sell', ship: 'Ship parts', suit: 'Suit', weapons: 'Weapons', sheet: 'Ship sheet' };
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
  };
  const MET = [            // id, label, format, better (+1 more is better, -1 less, 0 neutral), tooltip
    ['dv', 'Δv, full tank', (v) => `${v.toFixed(0)} m/s`, 1, 'Delta-v: how much speed change one tank buys you. More Δv = longer trips. (Full tank, empty hold.)'],
    ['twr', 'Lift on Mochi', (v) => `${v.toFixed(2)}×`, 1, 'Thrust-to-weight ratio on Mochi with a full tank. Below 1.00× the engine cannot lift you off the ground.'],
    ['isp', 'Engine Isp', (v) => `${v.toFixed(0)} s`, 1, `Specific impulse = fuel efficiency, in real-world seconds (exhaust speeds here are a 1:${CONFIG.ISP_SCALE} model, so ve × ${CONFIG.ISP_SCALE} ÷ 9.81).`],
    ['thrust', 'Thrust', (v) => `${v.toFixed(1)} kN`, 1, 'Engine push in kilonewtons. More thrust = faster burns and easier lift-off.'],
    ['tankVol', 'Tank size', (v) => `${v.toFixed(1)} m³`, 1, 'Tank volume. Tonnes of fuel = volume × fuel density.'],
    ['fuelT', 'Fuel when full', (v) => `${v.toFixed(2)} t`, 0, 'Mass of fuel in a full tank (volume × density).'],
    ['dry', 'Empty mass', (v) => `${v.toFixed(2)} t`, -1, 'The ship with empty tanks and an empty hold. Every part adds mass, and mass costs Δv.'],
    ['iondv', 'Ion Δv', (v) => `${v.toFixed(0)} m/s`, 1, 'Extra delta-v from the ion drive on a full ion tank.'],
    ['ionIsp', 'Ion Isp', (v) => `${v.toFixed(0)} s`, 1, 'Ion drive efficiency in real-world seconds.'],
    ['hold', 'Cargo hold', (v) => `${v.toFixed(0)} kg`, 1, 'How much ore your hold carries.'],
    ['hull', 'Hull', (v) => `${v.toFixed(0)} hp`, 1, 'Hit points before the ship goes KABOOM.'],
    ['armor', 'Armor', (v) => `${(v * 100).toFixed(0)}%`, 1, 'Share of every hit the armor soaks up.'],
    ['rcs', 'RCS fuel', (v) => `${v.toFixed(0)} units`, 1, 'Fuel for the little steering thrusters (A/D spin, arrows nudge).'],
    ['spin', 'Spin power', (v) => `${v.toFixed(1)} rad/s²`, 1, 'How fast the thrusters can spin you.'],
    ['nudge', 'Nudge power', (v) => `${v.toFixed(2)} m/s²`, 1, 'Sideways push from the arrow keys.'],
    ['tractor', 'Scoop reach', (v) => `+${v.toFixed(0)} m`, 1, 'Extra radius for sucking loose ore and gems into the hold.'],
    ['scanner', 'Gem scanner', (v) => ['none', 'nearby (25 m)', 'whole rock'][v] || `${v}`, 1, 'Shows buried gems.'],
    ['pack', 'Backpack', (v) => `${v.toFixed(0)} kg`, 1, 'How much you carry on foot.'],
    ['o2', 'Air', (v) => (v >= 120 ? `${(v / 60).toFixed(1)} min` : `${v.toFixed(0)} s`), 1, 'How long you can stay outside.'],
    ['jet', 'Jetpack push', (v) => `${v.toFixed(1)} m/s²`, 1, 'Jetpack acceleration.'],
    ['jetFuel', 'Jetpack burn', (v) => `${v.toFixed(0)} s`, 1, 'Seconds of jetpack per refill (refills in the ship).'],
    ['suitHp', 'Suit health', (v) => `${v.toFixed(0)} hp`, 1, 'How many bug bites you can take.'],
    ['laser', 'Dig speed', (v) => `${v.toFixed(1)}×`, 1, 'Mining laser power. Hard ores need more.'],
    ['laserRange', 'Laser reach', (v) => `${v.toFixed(0)} m`, 1, 'How far the laser reaches.'],
    ['laserDps', 'Laser zap', (v) => `${v.toFixed(0)} dmg/s`, 1, 'Damage to bugs and pirates.'],
    ['gunDps', 'Gun damage', (v) => (v ? `${v.toFixed(0)} dmg/s` : 'none'), 1, 'Damage per second while holding Space.'],
    ['gunSpeed', 'Bullet speed', (v) => (v ? `${v.toFixed(0)} m/s` : '—'), 1, 'Muzzle speed relative to your ship.'],
    ['turret', 'Aiming', (v) => (v ? 'at the mouse' : 'along the nose'), 1, 'Where your guns point.'],
    ['orion', 'Orion pulses', (v) => `${v} / 3`, 1, 'Nuclear pulse units carried (N fires one).'],
    ['orionDv', 'Kick per pulse', (v) => `${v.toFixed(0)} m/s`, 1, 'Speed change from one pulse = impulse ÷ ship mass (full tank).'],
  ];
  const CSS_ID = 'po-shop-css';

  let root = null, G = null, ST = null, tab = 'services', say = '', mood = 'happy', wallet0 = 0, doneSeen = new Set();
  const lastTab = {};
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
    say = ST.blurb || 'Welcome!'; mood = 'happy'; wallet0 = g.money; doneSeen = new Set(Object.keys(g.done));
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
  const tabList = () => [...ST.tabs.filter((t) => TAB_NAMES[t]), 'sheet'];


  // ======================================================================
  //  ACTIONS
  // ======================================================================

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !G) return;
    const ec = E(), g = G, act = b.dataset.act, id = b.dataset.id;
    if (act === 'close') { ec.closeShop(g); return; }
    if (act === 'tab') { tab = id; lastTab[ST.id] = id; render(false); return; }
    let r = null;
    if (act === 'buy') {
      r = ec.buy(g, id, ST);
      talk(r.ok ? (ST.kind === 'black' ? 'black' : 'buy') : r.why === 'broke' ? 'broke' : null, r.ok ? null : r.msg);
    } else if (act === 'equip') { r = ec.equip(g, id, ST); talk('swap', r.spent ? `${r.msg}. Refilled the tank for $${r.spent}.` : null); }
    else if (act === 'fuel') { r = ec.setFuel(g, id, ST); talk('swap', `${r.msg}. Old fuel vented, new fuel $${r.spent || 0}.`); }
    else if (act === 'ionfuel') { r = ec.setIonFuel(g, id, ST); talk('swap', `${r.msg}. Refilled for $${r.spent || 0}.`); }
    else if (act === 'refuel') { const n = ec.refuel(g, ST, { frac: +b.dataset.frac || 1, ion: false, rcs: false }); talk(n ? 'fuel' : 'broke'); }
    else if (act === 'ion') { const n = ec.refuel(g, ST, { main: false, ion: true, rcs: false }); talk(n ? 'fuel' : 'broke'); }
    else if (act === 'rcs') { const n = ec.restockRcs(g, ST); talk(n ? 'fuel' : 'broke'); }
    else if (act === 'repair') { const n = ec.repair(g, ST); talk(n ? 'repair' : 'broke'); }
    else if (act === 'all') { const n = ec.refuel(g, ST) + ec.repair(g, ST); talk(n ? 'repair' : 'broke', n ? `All done for $${n}. Fly safe!` : null); }
    else if (act === 'sell') { const n = ec.sell(g, id, Infinity, ST); talk('sell', `Ka-ching! +$${n}`); }
    else if (act === 'sellall') { const n = ec.sellAll(g, ST); talk(n >= 500 ? 'bigsell' : 'sell', n >= 500 ? null : `Ka-ching! +$${n}`); }
    if (G) { const jobs = jobLine(); if (jobs) say = jobs; render(true); }
  }

  function talk(kind, text) {
    const list = QUIPS[kind];
    if (kind) mood = kind === 'broke' ? 'sad' : kind === 'bigsell' ? 'wow' : 'happy';
    say = text || (list ? list[Math.floor(Math.random() * list.length)] : say);
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
    const old = root.querySelector('.po-body'), scroll = old ? old.scrollTop : 0, k = KIND[ST.kind] || KIND.outpost;
    root.innerHTML = `<div class="po-card" style="--acc:${k.acc};--accbg:${k.bg}" role="dialog" aria-label="${esc(ST.name)} shop">
      ${header(k)}${quickBar()}${tabsBar()}<div class="po-body">${content()}</div>
      <footer class="po-foot"><span>Esc, F or ✕ to leave</span><span>Time is paused while you shop</span><span>$ dollars · t tonnes · kg kilograms</span></footer></div>`;
    if (keepScroll) root.querySelector('.po-body').scrollTop = scroll;
    if (G.money !== wallet0) { const w = root.querySelector('.po-wallet'); w.classList.add(G.money > wallet0 ? 'po-gain' : 'po-spend'); wallet0 = G.money; }
  }

  function header(k) {
    return `<header class="po-head">
      <div class="po-keeper" title="${esc(keeperName())}">${portrait(ST, mood)}</div>
      <div class="po-talk"><div class="po-name">${esc(ST.name)}</div>
        <div class="po-bubble">${esc(say)}</div><div class="po-who">${esc(keeperName())}, ${k.label}</div></div>
      <div class="po-wallet"><small>YOUR MONEY</small><b>${money(G.money)}</b></div>
      <button class="po-x" data-act="close" title="Close the shop (Esc or F)" aria-label="Close">✕</button></header>`;
  }
  const keeperName = () => (typeof ST.keeper === 'string' ? ST.keeper : (ST.keeper && ST.keeper.name) || 'Keeper');

  // one-click essentials on every tab
  function quickBar() {
    const ec = E(), g = G, sh = g.sh, S = g.S;
    const fuelCost = ec.quote(g, ST, 'fuel'), hullCost = ec.quote(g, ST, 'hull'), hold = cargoValue();
    const svc = ST.tabs.includes('services'), sells = ST.tabs.includes('sell');
    const pill = (label, frac, col, text, btn) => `<div class="po-pill"><div class="po-pl"><span>${label}</span><b>${text}</b></div>
      <div class="po-meter"><i style="width:${(100 * clamp01(frac)).toFixed(1)}%;background:${col}"></i></div>${btn}</div>`;
    const qb = (act, cost, label) => (cost > 0 ? `<button class="po-btn po-sm" data-act="${act}" ${g.money < 1 ? 'disabled' : ''}>${label} ${money(cost)}</button>`
                                               : `<span class="po-ok">✓ full</span>`);
    return `<div class="po-quick">
      ${pill(`Fuel · ${esc(S.fuelType)}`, sh.fuel / S.fuel, '#ff9f1c', `Δv ${Physics.deltaV(sh, S).toFixed(0)} m/s`, svc ? qb('refuel', fuelCost, 'Fill up') : '')}
      ${pill('Hull', sh.hull / S.hull, sh.hull < 0.35 * S.hull ? '#e63946' : '#33c27a', `${Math.max(0, sh.hull).toFixed(0)} / ${S.hull}`, svc ? qb('repair', hullCost, 'Repair') : '')}
      ${pill('Hold', (sh.cargoKg || 0) / S.cargoCap, '#b892ff', `${(sh.cargoKg || 0).toFixed(0)} / ${S.cargoCap} kg`,
             sells && hold > 0 ? `<button class="po-btn po-sm po-go" data-act="sellall">Sell all ${money(hold)}</button>` : `<span class="po-ok">${hold > 0 ? '' : 'empty'}</span>`)}
    </div>`;
  }

  function tabsBar() {
    return `<nav class="po-tabs">${tabList().map((t) => `<button class="po-tab ${t === tab ? 'on' : ''}" data-act="tab" data-id="${t}">${TAB_NAMES[t]}${
      t === 'sell' && Object.keys(G.cargo).length ? ' <span class="po-badge">!</span>' : ''}</button>`).join('')}</nav>`;
  }

  function content() {
    return ({ services, sell, ship, suit, weapons, sheet }[tab] || services)();
  }


  // ======================================================================
  //  SERVICES
  // ======================================================================

  function services() {
    const ec = E(), g = G, sh = g.sh, S = g.S, F = ec.FUELS[S.fuelId] || { name: S.fuelType };
    const fp = ec.fuelPrice(g, ST), cash = Math.floor(g.money);
    const fillBtn = (frac) => {
      const cost = ec.quote(g, ST, 'fuel', frac), full = sh.fuel >= S.fuel * frac - 1e-6;
      const lift = liftAt(sh.fuel > S.fuel * frac ? sh.fuel : S.fuel * frac);
      const label = full ? `${frac < 1 ? `${frac * 100}%` : 'Full'} ✓` : cost <= cash ? `${frac < 1 ? `Fill to ${frac * 100}%` : 'Fill up'} · ${money(cost)}`
                         : cash > 0 ? `Fill what ${money(cash)} buys` : 'Broke';
      return `<button class="po-btn" data-act="refuel" data-frac="${frac}" ${full || cash < 1 ? 'disabled' : ''}>${label}
        <small class="${lift < 1 ? 'down' : ''}">lift on Mochi ${lift.toFixed(2)}×</small></button>`;
    };
    const svc = (title, frac, col, info, price, btns) => `<div class="po-svc"><div class="po-svc-l"><h4>${title}</h4>
      <div class="po-meter po-big"><i style="width:${(100 * clamp01(frac)).toFixed(1)}%;background:${col}"></i></div>
      <p>${info}</p><p class="po-dim">${price}</p></div><div class="po-svc-r">${btns}</div></div>`;
    const one = (act, what, cost, okText) => (cost > 0 ? `<button class="po-btn" data-act="${act}" ${cash < 1 ? 'disabled' : ''}>${
      cost <= cash ? `${what} · ${money(cost)}` : cash > 0 ? `${what}: what ${money(cash)} buys` : 'Broke'}</button>` : `<span class="po-ok">✓ ${okText}</span>`);

    let html = '<div class="po-svcs">';
    html += svc(`Fuel tank · ${esc(F.name)}`, sh.fuel / S.fuel, '#ff9f1c',
      `${sh.fuel.toFixed(2)} of ${S.fuel.toFixed(2)} t · Δv now <b>${Physics.deltaV(sh, S).toFixed(0)} m/s</b>`,
      `${money2(fp)} per tonne here${ST.fuelMult !== 1 ? ` (${pct(ST.fuelMult)} of Hub price)` : ''} · ${S.tankVol.toFixed(1)} m³ tank`,
      `${fillBtn(0.5)}${fillBtn(0.75)}${fillBtn(1)}`);
    if (S.ionTank > 0) {
      const X = ec.ION_FUELS[S.ionFuelId] || { name: 'ion fuel' };
      html += svc(`Ion tank · ${esc(X.name)}`, (sh.xe || 0) / S.ionTank, '#7cf5d6',
        `${(sh.xe || 0).toFixed(2)} of ${S.ionTank.toFixed(2)} t · ion Δv now <b>${Physics.ionDeltaV(sh, S).toFixed(0)} m/s</b>`,
        `${money2(ec.ionPrice(g, ST))} per tonne here`, one('ion', 'Fill ion tank', ec.quote(g, ST, 'ion'), 'full'));
    }
    html += svc('RCS thrusters', sh.rcs / S.rcs, '#4cc9f0', `${sh.rcs.toFixed(1)} of ${S.rcs} units (A/D spin, S stop, arrows nudge)`,
      `${money2(ec.rcsPrice(ST))} per unit`, one('rcs', 'Restock RCS', ec.quote(g, ST, 'rcs'), 'full'));
    html += svc('Hull', sh.hull / S.hull, sh.hull < 0.35 * S.hull ? '#e63946' : '#33c27a', `${Math.max(0, sh.hull).toFixed(0)} of ${S.hull} hp`,
      `${money2(ec.repairPrice(ST))} per hp`, one('repair', 'Repair hull', ec.quote(g, ST, 'hull'), 'shipshape'));
    html += '</div>';
    const total = ['fuel', 'ion', 'rcs', 'hull'].reduce((s, w) => s + ec.quote(g, ST, w), 0);
    html += `<div class="po-row-end">${total > 0 ? `<button class="po-btn po-go po-lg" data-act="all" ${cash < 1 ? 'disabled' : ''}>Do it all: fuel, RCS & repairs · ${money(total)}</button>`
                                                 : '<span class="po-ok po-lg">✓ Everything is topped up. Off you go!</span>'}</div>`;
    if (lowLift()) html += `<p class="po-warn">Heads up: with a full tank this ship is too heavy to lift off Mochi (${liftAt(S.fuel).toFixed(2)}×).
      Fill partway for surface trips, or fit a punchier engine. Holding W on the ground burns fuel until you are light enough.</p>`;
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
        nickel and platinum on Big Potato, void opals on Glimmer.</div>`;
    } else {
      html += `<table class="po-table"><thead><tr><th>Item</th><th>In hold</th><th>Price here</th><th>Worth</th><th></th></tr></thead><tbody>`;
      for (const [item, q] of rows) {
        const it = CONFIG.items[item] || { name: item, kg: 1, col: '#fff' }, p = ec.sellPrice(g, item, ST), worth = Math.round(p * q);
        html += `<tr><td><span class="po-dot" style="background:${it.col}"></span>${esc(it.name)}</td>
          <td>${it.kind === 'ore' ? `${q} kg` : `${q} (${q * it.kg} kg)`}</td>
          <td>${p > 0 ? `${money2(p)}${per(it)} ${vs(item)}` : '<span class="po-dim">not buying</span>'}</td>
          <td><b>${p > 0 ? money(worth) : '—'}</b></td>
          <td>${p > 0 ? `<button class="po-btn po-sm" data-act="sell" data-id="${item}">Sell</button>` : ''}</td></tr>`;
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
  //  SHIP / SUIT / WEAPONS
  // ======================================================================

  function ship() {
    const ec = E();
    return affordable() + section('Engines & drives', 'Owned engines swap for free here at the Hub. Thrust lifts you off rocks; Isp stretches your fuel.',
                   Object.keys(ec.ENGINES).map(engineCard).join('') + ionCard() + (ec.orionTab(ST) === 'ship' ? orionCard() : ''))
      + section('Tank, hull & hold', 'Bigger is better until it is heavier. Watch the Δv and lift numbers.', ['tank', 'cargo', 'hull', 'armor'].map(lineCard).join(''))
      + section('Handling & tools', '', ['rcs', 'tractor', 'scanner'].map(lineCard).join(''));
  }
  // the cheapest next tiers you can pay for right now, so the first upgrade is never below the fold
  function affordable() {
    const ec = E(), g = G, next = (id) => { const L = ec.LINES.find((l) => l.id === id); return L && L.tiers[ec.tierIndex(g, id)]; };
    const ids = ['rcs', 'tank', 'hull', 'armor', 'cargo', 'tractor', 'scanner']
      .filter((id) => next(id) && ec.priceOf(g, next(id).id, ST) <= g.money)
      .sort((a, b) => ec.priceOf(g, next(a).id, ST) - ec.priceOf(g, next(b).id, ST)).slice(0, 3);
    if (!ids.length) return '';
    return section('Affordable now', g.done.upgrade === undefined ? 'Your first upgrade also pays a job bonus. RCS plus is a fine pick: more turning before the tank runs dry.' : '',
                   ids.map(lineCard).join(''));
  }
  function suit() {
    return section('Spacesuit', 'Worn by you, not the ship, so these add no ship mass.', ['pack', 'o2', 'jet', 'suit', 'laser'].map(lineCard).join(''));
  }
  function weapons() {
    return section('Weapons', 'Space fires the ship guns. N fires an Orion pulse: one big shove, up to 3 carried.',
                   ['gun', 'turret'].map(lineCard).join('') + orionCard());
  }
  const section = (title, sub, cards) => `<section class="po-sec"><h3 class="po-h">${title}</h3>${sub ? `<p class="po-sub">${sub}</p>` : ''}<div class="po-grid">${cards}</div></section>`;

  // ---------------- cards ----------------

  function card({ title, tag = '', price = '', desc = '', specs = '', rows = '', extra = '', btn = '', on = false, cls = '' }) {
    return `<article class="po-item ${on ? 'po-on' : ''} ${cls}"><header><div class="po-ttl"><h4>${title}</h4>${tag ? `<span class="po-tag">${tag}</span>` : ''}</div>
      ${price ? `<span class="po-price">${price}</span>` : ''}</header>${desc ? `<p class="po-desc">${desc}</p>` : ''}
      ${specs ? `<p class="po-specs">${specs}</p>` : ''}${rows}${extra}<div class="po-act">${btn}</div></article>`;
  }

  function buyButton(id) {
    const ec = E(), c = ec.canBuy(G, id, ST);
    if (c.ok) return `<button class="po-btn po-go" data-act="buy" data-id="${id}">Buy · ${money(c.price)}</button>`;
    const why = { broke: `Need ${money(c.need)} more`, owned: 'Installed ✓', locked: 'Buy the tier before first', max: 'Carrying the max',
                  notsold: 'Not sold at this station', unknown: '?' }[c.why];
    return `<button class="po-btn" disabled>${why}</button>`;
  }

  function engineCard(eid) {
    const ec = E(), g = G, e = ec.ENGINES[eid], owned = ec.owns(g, eid), on = ec.engineOf(g) === eid;
    const fuels = Object.entries(e.fuels).map(([f, ve]) => `${ec.FUELS[f].name.toLowerCase()} (Isp ${ec.isp(ve).toFixed(0)} s)`).join(' or ');
    const specs = `${e.thrust} kN · ${e.mass ? `+${e.mass.toFixed(2)} t` : 'no extra mass'} · burns ${fuels}`;
    let rows = '', extra = '', btn;
    if (on) { extra = fuelChips(eid); btn = '<span class="po-ok">✓ Equipped</span>'; }
    else {
      const start = owned ? null : ec.bestFuel(g, eid);
      rows = compare((m) => { m.owned[eid] = true; m.engine = eid; if (start) m.fuelOf[eid] = start; }, ['dv', 'twr', 'isp', 'thrust', 'fuelT', 'dry'])
           + (start ? `<p class="po-dim">Starts on ${ec.FUELS[start].name.toLowerCase()}: goes furthest with your tank. Switch any time.</p>` : '');
      if (owned) {
        const drains = ec.fuelOf(g, eid) !== ec.fuelOf(g);
        btn = `<button class="po-btn po-go" data-act="equip" data-id="${eid}">Equip (free)${drains ? ' · refill tank' : ''}</button>`;
      } else btn = buyButton(eid);
    }
    return card({ title: e.name, tag: on ? 'EQUIPPED' : owned ? 'OWNED' : '', price: !owned ? money(ec.priceOf(g, eid, ST)) : '',
                  desc: e.desc, specs, rows, extra, btn, on, cls: 'po-engine' });
  }

  function fuelChips(eid) {
    const ec = E(), g = G, cur = ec.fuelOf(g), cash = Math.floor(g.money);
    const chips = Object.keys(ec.ENGINES[eid].fuels).map((f) => {
      const F = ec.FUELS[f], S2 = ec.previewS(g, (m) => { m.fuelOf[eid] = f; }), M = ec.metrics(g, S2);
      const info = `<small>Isp ${M.isp.toFixed(0)} s · ${F.dens} t/m³ · Δv ${M.dv.toFixed(0)} m/s · lift ${M.twr.toFixed(2)}×</small>`;
      if (f === cur) return `<div class="po-fuel on"><b>${F.name} ✓</b>${info}<em>${esc(F.desc)}</em></div>`;
      const cost = Math.ceil(S2.fuel * ec.FUELS[f].price * (ST.fuelMult ?? 1) - 1e-6);
      return `<button class="po-fuel" data-act="fuel" data-id="${f}" ${cash < 1 && cost > 0 ? 'disabled' : ''} title="Switching vents the current tank and fills it with ${F.name.toLowerCase()}">
        <b>Switch to ${F.name}</b>${info}<em>${esc(F.desc)} Vents the tank, refill ${money(cost)}.</em></button>`;
    });
    return `<div class="po-fuels">${chips.join('')}</div>`;
  }

  function ionCard() {
    const ec = E(), g = G, I = ec.ION, owned = ec.owns(g, I.id);
    const specs = `${(I.thrust * 1000).toFixed(0)} N · +${I.mass.toFixed(2)} t · own ${I.vol} m³ tank · xenon (Isp ${ec.isp(1300).toFixed(0)} s) or krypton (Isp ${ec.isp(1500).toFixed(0)} s)`;
    if (!owned) {
      return card({ title: I.name, price: money(ec.priceOf(g, I.id, ST)), desc: I.desc, specs,
                    rows: compare((m) => { m.owned[I.id] = true; }, ['iondv', 'ionIsp', 'dv', 'twr', 'dry']), btn: buyButton(I.id) });
    }
    const cur = ec.ionFuelOf(g), cash = Math.floor(g.money);
    const chips = Object.entries(ec.ION_FUELS).map(([x, X]) => {
      const S2 = ec.previewS(g, (m) => { m.ionFuel = x; }), M = ec.metrics(g, S2);
      const info = `<small>Isp ${M.ionIsp.toFixed(0)} s · ${S2.ionTank.toFixed(2)} t per tank · ion Δv ${M.iondv.toFixed(0)} m/s</small>`;
      if (x === cur) return `<div class="po-fuel on"><b>${X.name} ✓</b>${info}<em>${esc(X.desc)}</em></div>`;
      const cost = Math.ceil(S2.ionTank * X.price * (ST.fuelMult ?? 1) - 1e-6);
      return `<button class="po-fuel" data-act="ionfuel" data-id="${x}" ${cash < 1 ? 'disabled' : ''}><b>Switch to ${X.name}</b>${info}
        <em>${esc(X.desc)} Vents the ion tank, refill ${money(cost)}.</em></button>`;
    });
    return card({ title: I.name, tag: 'FITTED', desc: I.desc, specs, extra: `<div class="po-fuels">${chips.join('')}</div>`,
                  btn: '<span class="po-ok">✓ Fitted · X toggles it in flight</span>', on: true });
  }

  function lineCard(lineId) {
    const ec = E(), g = G, L = ec.LINES.find((l) => l.id === lineId), idx = ec.tierIndex(g, lineId), next = L.tiers[idx];
    const cur = idx ? L.tiers[idx - 1] : null, n = L.tiers.length;
    const pips = `<span class="po-pips" title="tier ${idx} of ${n}">${L.tiers.map((_, i) => (i < idx ? '●' : '○')).join('')}</span>`;
    const now = `<p class="po-now">${L.name}: <b>${esc(cur ? cur.name : L.stock)}</b> ${pips}</p>`;
    if (!next) return card({ title: cur.name, tag: 'MAXED ★', desc: cur.desc, extra: now, btn: '<span class="po-ok">✓ Best there is</span>', on: true });
    return card({ title: next.name, tag: `TIER ${idx + 1}/${n}`, price: money(ec.priceOf(g, next.id, ST)), desc: next.desc,
                  rows: compare((m) => { m.owned[next.id] = true; }), extra: now, btn: buyButton(next.id) });
  }

  function orionCard() {
    const ec = E(), g = G, O = ec.ORION, have = ec.state(g).orion;
    const sold = !!ec.orionTab(ST), black = ST.kind === 'black';
    const pips = `<span class="po-nukes">${Array.from({ length: O.max }, (_, i) => `<span class="${i < have ? 'on' : ''}">☢</span>`).join('')}</span>`;
    return card({ title: O.name, tag: black ? 'NO QUESTIONS' : sold ? '+80% HERE' : '', price: sold ? money(ec.priceOf(g, O.id, ST)) : '',
                  desc: O.desc, specs: `+${O.mass.toFixed(2)} t each · ${g.S.orionJ} kN·s per pulse · digs a crater within ${O.craterAlt} m of the ground · dents the pusher plate`,
                  rows: sold && have < O.max ? compare((m) => { m.orion = Math.min(O.max, m.orion + 1); }, ['orion', 'orionDv', 'dv', 'dry']) : '',
                  extra: `<p class="po-now">Carrying: ${pips}</p>${!sold ? '<p class="po-dim">Not sold here. Try the black market (or the Hub, at a markup).</p>' : ''}`,
                  btn: sold ? buyButton(O.id) : '', cls: 'po-orion' });
  }

  // BEFORE -> AFTER rows for every headline number that changes (or the listed ones, if they change)
  function compare(mutate, only) {
    const ec = E(), g = G, a = ec.metrics(g, ec.previewS(g, null)), b = ec.metrics(g, ec.previewS(g, mutate));
    const rows = MET.filter(([id, , f]) => (!only || only.includes(id) || id === 'dry') && (id !== 'orionDv' || (only && only.includes(id))) && f(a[id]) !== f(b[id]));
    if (!rows.length) return '';
    return `<table class="po-cmp">${rows.map(([id, label, f, better, tip]) => {
      const d = (b[id] - a[id]) * better, cls = better === 0 ? '' : d > 0 ? 'up' : 'down';
      const warn = id === 'twr' && b.twr < 1 ? ' <span class="po-flag" title="Too heavy to lift off Mochi with a full tank">can’t lift off!</span>' : '';
      return `<tr><td><abbr title="${esc(tip)}">${label}</abbr></td><td class="po-was">${f(a[id])}</td><td class="po-arrow">→</td>
        <td class="${cls}"><b>${f(b[id])}</b>${warn}</td></tr>`;
    }).join('')}</table>`;
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
      ${big('Δv now', `${dvNow.toFixed(0)} m/s`, 'Speed change left in the tank right now (with your cargo).')}
      ${big('Δv full', `${M.dv.toFixed(0)} m/s`, 'With a full tank and an empty hold.')}
      ${S.ionTank ? big('Ion Δv now', `${Physics.ionDeltaV(sh, S).toFixed(0)} m/s`, 'From the ion drive (X).') : ''}
      ${big('Engine', `${esc(S.engineName || S.engine)}`, `${S.thrust} kN thrust`)}
      ${big('Isp', `${M.isp.toFixed(0)} s`, 'Real-world equivalent specific impulse.')}
      ${big('Mass now', `${mNow.toFixed(2)} t`, 'Everything aboard right now.')}</div>`;

    html += `<div class="po-cols"><div><h3 class="po-h">Mass budget</h3><table class="po-table po-mass"><tbody>
      ${parts.map(([n, t]) => `<tr><td>${esc(n)}</td><td>${t.toFixed(2)} t</td></tr>`).join('')}
      <tr class="po-sum"><td>Empty ship</td><td>${S.dry.toFixed(2)} t</td></tr>
      <tr><td>${esc(S.fuelType)} (${S.tankVol.toFixed(1)} m³ × ${S.fuelDens} t/m³ = ${S.fuel.toFixed(2)} t max)</td><td>${sh.fuel.toFixed(2)} t</td></tr>
      ${S.ionTank ? `<tr><td>${esc(S.ionFuelType)} for the ion drive</td><td>${(sh.xe || 0).toFixed(2)} t</td></tr>` : ''}
      <tr><td>Cargo</td><td>${((sh.cargoKg || 0) / 1000).toFixed(2)} t</td></tr>
      <tr class="po-sum"><td>Total now</td><td>${mNow.toFixed(2)} t</td></tr>
      <tr><td class="po-dim">Total with full tanks</td><td class="po-dim">${mFull.toFixed(2)} t</td></tr></tbody></table></div>`;

    html += `<div><h3 class="po-h">Can I lift off?</h3><table class="po-table"><thead><tr><th>Rock</th><th>Gravity</th>
      <th><abbr title="Thrust-to-weight with what is aboard now, in the deepest valley">Now</abbr></th><th><abbr title="Thrust-to-weight with full tanks, in the deepest valley">Full</abbr></th></tr></thead><tbody>
      ${g.w.bodies.filter((b) => !b.star).map((b) => { const gv = b.mu / (b.Rc || b.R) ** 2, now = S.thrust / (mNow * gv), full = S.thrust / (mFull * gv);
        return `<tr><td>${esc(b.name)}</td><td>${b.g.toFixed(1)}–${gv.toFixed(1)} m/s²</td><td class="${liftCls(now)}">${now.toFixed(2)}×</td><td class="${liftCls(full)}">${full.toFixed(2)}×</td></tr>`; }).join('')}
      </tbody></table><p class="po-dim">Lumpy rocks pull hardest in their deepest valleys, so these are worst cases. Above 1.2× is comfy, 1.0-1.2× is sluggish, below 1.0× you cannot take off (hold W to burn fuel off until you can).</p></div></div>`;

    const m0 = sh.fuel > 0 ? mNow : mFull, m1 = m0 - (sh.fuel > 0 ? sh.fuel : S.fuel);
    html += `<div class="po-eq"><h3 class="po-h">The rocket equation (Tsiolkovsky says hi)</h3>
      <p><b>Δv = v<sub>e</sub> × ln(m<sub>full</sub> ÷ m<sub>empty</sub>)</b> = ${S.ve} m/s × ln(${m0.toFixed(2)} t ÷ ${m1.toFixed(2)} t)
      = <b>${(S.ve * Math.log(m0 / Math.max(1e-9, m1))).toFixed(0)} m/s</b></p>
      <p class="po-dim">v<sub>e</sub> is the exhaust speed in this 1:${CONFIG.ISP_SCALE} model belt; real Isp = v<sub>e</sub> × ${CONFIG.ISP_SCALE} ÷ 9.81 = ${M.isp.toFixed(0)} s.
      Dense fuel packs more tonnes into a tank, high Isp makes each tonne count. Hauling cargo raises m on both sides, so Δv drops.</p></div>`;
    return html;
  }
  const liftCls = (r) => (r >= 1.2 ? 'up' : r >= 1 ? 'meh' : 'down');


  // ======================================================================
  //  KEEPER PORTRAITS (inline SVG, toon: flat base + shadow band + highlight + ink)
  // ======================================================================

  function portrait(st, md) {
    const h = hash(st.id || st.name || 'x'), kind = st.kind;
    const pal = kind === 'black' ? [['#7b5cc4', '#4c3487', '#b49cf2'], ['#5f6fb8', '#3b4580', '#a7b4ec']][h % 2]
              : kind === 'outpost' ? [['#8fd36b', '#5a9440', '#cdf3a8'], ['#e3b04b', '#a3732a', '#ffe0a0']][h % 2]
              : [['#9ec7ff', '#5f86c8', '#e0eeff'], ['#ff9ec7', '#c4628d', '#ffd6e8']][h % 2];
    const [base, shade, hi] = pal, ink = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
    const head = (cx, cy, rx, ry) => `<clipPath id="po-hc"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${shade}"/>
      <g clip-path="url(#po-hc)"><ellipse cx="${cx - rx * 0.16}" cy="${cy - ry * 0.18}" rx="${rx}" ry="${ry}" fill="${base}"/>
      <ellipse cx="${cx - rx * 0.45}" cy="${cy - ry * 0.55}" rx="${rx * 0.26}" ry="${ry * 0.14}" fill="${hi}" transform="rotate(-30 ${cx - rx * 0.45} ${cy - ry * 0.55})"/></g>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" ${ink}/>`;
    const mouth = (x, y, w) => md === 'sad' ? `<path d="M${x - w} ${y + 4} Q${x} ${y - 4} ${x + w} ${y + 4}" fill="none" ${ink} stroke-linecap="round"/>`
                             : md === 'wow' ? `<ellipse cx="${x}" cy="${y + 1}" rx="${w * 0.45}" ry="${w * 0.55}" fill="#7a2a4a" ${ink}/>`
                             : `<path d="M${x - w} ${y - 2} Q${x} ${y + w * 0.9} ${x + w} ${y - 2} Z" fill="#7a2a4a" ${ink}/><path d="M${x - w * 0.45} ${y + w * 0.35} Q${x} ${y + w * 0.1} ${x + w * 0.45} ${y + w * 0.35}" fill="none" stroke="#ff8fab" stroke-width="2.5" stroke-linecap="round"/>`;
    const eye = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.15}" fill="#fff" ${ink}/><circle cx="${x + r * 0.15}" cy="${y + r * 0.2}" r="${r * 0.55}" fill="${INK}"/>
      <circle cx="${x - r * 0.1}" cy="${y - r * 0.1}" r="${r * 0.2}" fill="#fff"/>`;
    const cheeks = (y, dx, cx = 50) => `<ellipse cx="${cx - dx}" cy="${y}" rx="6" ry="3.6" fill="#ff7eb6" opacity=".5"/><ellipse cx="${cx + dx}" cy="${y}" rx="6" ry="3.6" fill="#ff7eb6" opacity=".5"/>`;
    let s;
    if (kind === 'black') {
      s = `<path d="M14 98 Q10 40 50 16 Q90 40 86 98 Z" fill="#2c1f4f" ${ink}/>${head(50, 60, 26, 26)}
        <path d="M24 52 Q50 28 76 52 Q72 34 50 26 Q28 34 24 52 Z" fill="#2c1f4f"/>
        <g class="po-eyes"><path d="M33 58 Q40 52 46 58 Q40 61 33 58 Z" fill="#ffe066" ${ink}/><path d="M54 58 Q60 52 67 58 Q60 61 54 58 Z" fill="#ffe066" ${ink}/></g>
        ${md === 'sad' ? mouth(50, 74, 9) : `<path d="M36 70 Q50 82 64 70" fill="#fff4dc" ${ink}/><rect x="52" y="71" width="5" height="5" fill="#ffd166" stroke="${INK}" stroke-width="1.5"/>`}
        <path d="M70 66 l6 -2 M71 70 l6 0" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    } else if (kind === 'outpost') {
      s = `${head(50, 62, 34, 28)}<g class="po-eyes">${eye(35, 54, 8)}${eye(65, 54, 8)}</g>${cheeks(68, 24)}${mouth(50, 72, 10)}
        <path d="M18 44 Q22 18 50 16 Q78 18 82 44 Z" fill="#ffd166" ${ink}/><rect x="12" y="40" width="76" height="7" rx="3.5" fill="#ffb347" ${ink}/>
        <circle cx="50" cy="29" r="6" fill="#fff8c0" ${ink}/><path d="M56 27 L74 20 M56 31 L74 34" stroke="#fff3a0" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>`;
    } else {
      s = `<path d="M50 30 Q52 14 62 10" fill="none" ${ink}/><circle cx="63" cy="10" r="5" fill="#ffd166" ${ink}/>
        ${head(50, 60, 33, 31)}<g class="po-eyes">${eye(37, 56, 9)}${eye(63, 56, 9)}</g>${cheeks(70, 25)}${mouth(50, 74, 10)}
        <path d="M22 40 Q26 22 50 21 Q74 22 78 40 Z" fill="${kind === 'hub' ? '#ff9f1c' : '#33c27a'}" ${ink}/>
        <path d="M74 38 Q88 38 92 44 L74 44 Z" fill="${kind === 'hub' ? '#ff9f1c' : '#33c27a'}" ${ink}/>
        <path d="M50 26 l2.4 5 5.4 .6 -4 3.7 1.1 5.3 -4.9 -2.7 -4.9 2.7 1.1 -5.3 -4 -3.7 5.4 -.6 Z" fill="#fff4dc" stroke="${INK}" stroke-width="1.5"/>`;
    }
    return `<svg viewBox="0 0 100 100" class="po-face po-${md}" aria-hidden="true">${s}</svg>`;
  }


  // ======================================================================
  //  HELPERS & STYLE
  // ======================================================================

  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `$${Math.floor(n).toLocaleString('en-US')}`;
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
.po-card { width: min(1020px, calc(100vw - 20px)); height: min(730px, calc(100vh - 20px)); display: flex; flex-direction: column; background: #fff4dc;
  border: 3px solid ${INK}; border-radius: 18px; box-shadow: 8px 8px 0 ${INK}; overflow: hidden; animation: po-pop .2s ease-out; }
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
  font-size: 15px; line-height: 1.25; max-width: 100%; animation: po-pop .2s ease-out; }
.po-bubble::before { content: ""; position: absolute; left: -11px; top: 9px; border: 6px solid transparent; border-right: 9px solid ${INK}; }
.po-bubble::after { content: ""; position: absolute; left: -6px; top: 10px; border: 5px solid transparent; border-right: 7px solid #fff; }
.po-who { font-size: 12.5px; color: #6d5f8a; margin-left: 10px; }
.po-wallet { flex: 0 0 auto; text-align: right; background: #fff4dc; border: 3px solid ${INK}; border-radius: 12px; padding: 5px 12px; box-shadow: 3px 3px 0 ${INK}; }
.po-wallet small { display: block; font-size: 11px; font-weight: 600; color: #6d5f8a; letter-spacing: .5px; }
.po-wallet b { font-size: 24px; color: #2f9e5b; }
.po-wallet.po-gain { animation: po-gain .5s ease-out; } .po-wallet.po-spend { animation: po-spend .45s ease-out; }
@keyframes po-gain { 30% { transform: scale(1.14) rotate(-3deg); background: #c9f7d6 } }
@keyframes po-spend { 30% { transform: scale(.94) rotate(2deg); background: #ffd3d8 } }
.po-x { flex: 0 0 auto; width: 42px; height: 42px; border: 3px solid ${INK}; border-radius: 12px; background: #ff8fab; font-size: 22px; font-weight: 700;
  box-shadow: 3px 3px 0 ${INK}; cursor: pointer; align-self: flex-start; }
.po-x:hover { background: #ff6b8f; } .po-x:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK}; }
.po-quick { display: flex; gap: 10px; padding: 8px 14px; border-bottom: 2px dashed #d8c39a; flex-wrap: wrap; }
.po-pill { flex: 1 1 240px; display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 10px; align-items: center; }
.po-pl { display: flex; justify-content: space-between; font-size: 13px; gap: 8px; } .po-pl span { color: #6d5f8a; font-weight: 600; }
.po-pill .po-meter { grid-row: 2; } .po-pill > .po-btn, .po-pill > .po-ok { grid-row: 1 / span 2; grid-column: 2; }
.po-meter { height: 11px; background: #e9dcc0; border: 2px solid ${INK}; border-radius: 6px; overflow: hidden; }
.po-meter i { display: block; height: 100%; border-right: 2px solid ${INK}; }
.po-meter.po-big { height: 16px; border-radius: 8px; margin: 6px 0; }
.po-tabs { display: flex; gap: 5px; padding: 8px 14px 0; background: var(--accbg); border-bottom: 3px solid ${INK}; flex-wrap: wrap; }
.po-tab { border: 2.5px solid ${INK}; border-bottom: none; border-radius: 10px 10px 0 0; padding: 6px 14px 7px; background: #f3dcae; font-size: 15px; font-weight: 600;
  cursor: pointer; margin-bottom: -3px; position: relative; }
.po-tab:hover { background: #ffe9c2; } .po-tab.on { background: #fff4dc; padding-bottom: 10px; border-bottom: 3px solid #fff4dc; }
.po-badge { display: inline-block; background: #e63946; color: #fff; border: 2px solid ${INK}; border-radius: 50%; width: 19px; height: 19px; font-size: 12px; line-height: 15px; text-align: center; }
.po-body { flex: 1; overflow-y: auto; padding: 12px 16px 18px; scrollbar-width: thin; }
.po-foot { display: flex; justify-content: space-between; gap: 10px; padding: 5px 14px; font-size: 12px; color: #6d5f8a; border-top: 2px dashed #d8c39a; flex-wrap: wrap; }
.po-h { font-size: 17px; margin: 8px 0 4px; } .po-sub { margin: 0 0 8px; font-size: 13.5px; color: #6d5f8a; }
.po-sec + .po-sec { margin-top: 14px; }
.po-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(285px, 1fr)); gap: 14px; }
.po-item { background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 13px; box-shadow: 4px 4px 0 ${INK}; padding: 9px 12px 11px; display: flex; flex-direction: column; gap: 5px; }
.po-item.po-on { background: #f0fbe8; } .po-item.po-orion { background: #fff1ea; }
.po-item header { display: flex; align-items: flex-start; gap: 8px; }
.po-ttl { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.po-item h4 { margin: 0; font-size: 18px; } .po-price { margin-left: auto; font-weight: 700; font-size: 17px; color: #2f9e5b; white-space: nowrap; }
.po-tag { font-size: 11px; font-weight: 700; letter-spacing: .5px; background: var(--acc); color: ${INK}; border: 2px solid ${INK}; border-radius: 6px; padding: 0 5px; }
.po-desc { margin: 0; font-size: 14px; line-height: 1.25; } .po-specs { margin: 0; font-size: 12.5px; color: #6d5f8a; }
.po-now { margin: 0; font-size: 13px; color: #6d5f8a; } .po-now b { color: ${INK}; }
.po-pips { letter-spacing: 2px; color: var(--acc); -webkit-text-stroke: .6px ${INK}; }
.po-act { margin-top: auto; padding-top: 4px; }
.po-btn { font-size: 15px; font-weight: 600; background: #ffe2b0; border: 2.5px solid ${INK}; border-radius: 10px; padding: 7px 12px; box-shadow: 3px 3px 0 ${INK}; cursor: pointer; }
.po-btn:hover:not(:disabled) { background: #ffd166; transform: translate(-1px,-1px); box-shadow: 4px 4px 0 ${INK}; }
.po-btn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 1px 1px 0 ${INK}; }
.po-btn:disabled { background: #eee2c8; color: #8a7fa6; border-color: #8a7fa6; box-shadow: none; cursor: not-allowed; }
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
.up { color: #23864a; } .down { color: #d62839; } .meh { color: #d97706; }
abbr[title] { text-decoration: underline dotted #8a7fa6; cursor: help; }
.po-flag { font-size: 11px; font-weight: 700; color: #fff; background: #e63946; border-radius: 5px; padding: 0 4px; margin-left: 3px; }
.po-fuels { display: grid; gap: 6px; margin-top: 2px; }
.po-fuel { text-align: left; background: #fff; border: 2px solid ${INK}; border-radius: 10px; padding: 5px 9px; font-size: 14px; }
button.po-fuel { cursor: pointer; box-shadow: 2px 2px 0 ${INK}; } button.po-fuel:hover:not(:disabled) { background: #fff3c4; }
.po-fuel.on { background: #dff7d0; } .po-fuel small, .po-fuel em { display: block; font-size: 12px; color: #6d5f8a; } .po-fuel em { font-style: normal; color: #8a6d3b; }
.po-svcs { display: grid; gap: 12px; }
.po-svc { display: flex; gap: 14px; align-items: center; background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 13px; box-shadow: 4px 4px 0 ${INK}; padding: 9px 14px; flex-wrap: wrap; }
.po-svc-l { flex: 1 1 300px; } .po-svc-l h4 { margin: 0; font-size: 17px; } .po-svc-l p { margin: 0; font-size: 13.5px; }
.po-svc-r { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.po-dim { color: #6d5f8a; font-size: 13px; }
.po-row-end { display: flex; justify-content: flex-end; margin: 12px 0 4px; }
.po-warn { background: #ffe1e1; border: 2.5px solid ${INK}; border-radius: 10px; padding: 7px 12px; font-size: 14px; }
.po-empty { background: #fffaf0; border: 2.5px dashed #b9a57e; border-radius: 12px; padding: 16px; font-size: 15px; }
.po-table { color: ${INK}; font-family: inherit; width: 100%; border-collapse: separate; border-spacing: 0; background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 12px; overflow: hidden; font-size: 14.5px; }
.po-table th { text-align: left; background: #ffe2b0; padding: 6px 10px; font-size: 13px; border-bottom: 2.5px solid ${INK}; }
.po-table td { padding: 5px 10px; border-bottom: 1.5px dashed #e3d2ad; } .po-table tr:last-child td { border-bottom: none; }
.po-table td:last-child { text-align: right; }
.po-dot { display: inline-block; width: 13px; height: 13px; border: 2px solid ${INK}; border-radius: 4px; margin-right: 7px; vertical-align: -1px; transform: rotate(45deg) scale(.85); }
.po-vs { font-size: 11.5px; font-weight: 600; margin-left: 4px; }
.po-prices { display: flex; flex-wrap: wrap; gap: 6px; }
.po-price-chip { background: #fffaf0; border: 2px solid ${INK}; border-radius: 9px; padding: 3px 9px; font-size: 13px; } .po-price-chip b { margin-left: 5px; }
.po-price-chip.po-off { opacity: .5; }
.po-nukes span { font-size: 18px; color: #d8c8a8; margin-right: 2px; } .po-nukes span.on { color: #e6a800; -webkit-text-stroke: .7px ${INK}; }
.po-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 8px; }
.po-stat { background: #fffaf0; border: 2.5px solid ${INK}; border-radius: 12px; box-shadow: 3px 3px 0 ${INK}; padding: 6px 10px; }
.po-stat small { display: block; font-size: 12px; color: #6d5f8a; } .po-stat b { font-size: 20px; }
.po-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; }
.po-mass td:first-child { font-size: 13.5px; } .po-sum td { font-weight: 700; background: #fff1d6; }
.po-eq { margin-top: 10px; background: #f3efff; border: 2.5px solid ${INK}; border-radius: 12px; padding: 4px 14px 8px; }
.po-eq p { margin: 4px 0; font-size: 14.5px; }
@media (max-width: 760px) { .po-keeper { width: 60px; height: 60px; } .po-name { font-size: 20px; } .po-wallet b { font-size: 19px; } .po-bubble { font-size: 13.5px; } }
`;
    document.head.appendChild(el);
  }


  // ---------------- register: nothing to hook (economy.js drives open/close); keeps ?mods= honest ----------------
  Game.register({ id: 'shop' });
  return { open, close, isOpen, render, portrait };
})();

if (typeof module !== 'undefined') module.exports = Shop;
