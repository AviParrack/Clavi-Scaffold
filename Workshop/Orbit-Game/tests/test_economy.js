// ======================================================================
//  ECONOMY TESTS  —  catalog, stats from upgrades (honest mass), the
//  engine x fuel x tank table, buying, selling per station, services,
//  Orion pulse, tow fees, blueprints, save/load, shop pause; v4: frames,
//  fusion engines, every item id -> its S fields, charges, dev mode.
//  run:  node tests/test_economy.js
// ======================================================================

const H = require('./harness');
H.load({ only: 'economy,shop' });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = 'pad') => Game.create(7, spawn, { fresh: true });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const finite = (o) => Object.values(o).every((v) => typeof v !== 'number' || isFinite(v));
const HUB = { id: 'hub', name: 'Mochi Hub', kind: 'hub', keeper: 'Mo', buy: {}, tabs: ['services', 'sell', 'ship', 'haul', 'suit', 'weapons'], fuelMult: 1 };
const OUTPOST = { id: 'outpost', name: 'Kiwi Outpost', kind: 'outpost', keeper: 'Fern', buy: {}, tabs: ['services', 'sell', 'haul', 'suit'], fuelMult: 1.25 };
const portAt = (g, r = 420) => {
  const c = g.w.byId.mochi;
  return (t) => { const n = Math.sqrt(c.mu / r ** 3), th = n * t, [mx, my, mvx, mvy] = World.bodyState(g.w, c, t);   // Mochi rides the belt
    return [mx + r * Math.cos(th), my + r * Math.sin(th), mvx - r * n * Math.sin(th), mvy + r * n * Math.cos(th)]; };
};
const dockAt = (g) => Game.dock(g, { name: 'Test Port', state: portAt(g), ang: Math.PI / 2 });


// ---------------- 0. registry & stock ship ----------------
{
  const g = fresh(), dv = Physics.deltaV(g.sh, g.S), twr = g.S.thrust / (Physics.mass(g.sh, g.S) * g.w.byId.mochi.g);
  check('economy + shop registered, Econ defined', typeof Econ !== 'undefined' && Game.mods.some((m) => m.id === 'economy') && Game.mods.some((m) => m.id === 'shop'));
  check('stock Prospector matches the spec (394 m/s = 3x v3, TWR 1.46)', near(dv, 3 * 131.3, 2e-3) && near(twr, 1.458, 3e-3) && g.S.cargoCap === 300 && g.money === 300,
        `dv ${dv.toFixed(1)} m/s, TWR ${twr.toFixed(2)}, hold ${g.S.cargoCap} kg, $${g.money}`);
  check('jobs added: sell 40, upgrade 50, orion 80, rich 99', ['sell', 'upgrade', 'orion', 'rich'].every((id) => Game.GOALS.some((x) => x.id === id)),
        Game.GOALS.map((x) => `${x.order}:${x.id}`).join(' '));
  const ids = Econ.CATALOG.map((c) => c.id);
  check('catalog: unique ids, names, prices, one-liners, tabs', new Set(ids).size === ids.length &&
        Econ.CATALOG.every((c) => c.name && c.price > 0 && c.desc && ['ship', 'haul', 'suit', 'weapons'].includes(c.cat)), `${ids.length} items`);
  check('mass parts add up to the dry mass', near(g.S.massParts.reduce((s, p) => s + p[1], 0), g.S.dry), JSON.stringify(g.S.massParts));
}


// ---------------- 1. the engine x fuel x tank table ----------------
{
  const g = fresh(), tanks = [null, 'tank1', 'tank2', 'tank3', 'tank4'], gC = g.w.byId.mochi.g;
  const cell = (eid, f, tank) => Econ.metrics(g, Econ.previewS(g, (m) => {
    m.owned[eid] = true; m.engine = eid; m.fuelOf[eid] = f;
    for (let i = 1; i < tanks.length; i++) if (tanks[i] && tanks.indexOf(tank) >= i) m.owned[tanks[i]] = true;
  }));
  console.log('\nINFO  delta-v [m/s] / TWR on Mochi, full tank, empty hold     tank volume ->');
  console.log(`INFO  ${'engine'.padEnd(11)} ${'fuel'.padEnd(16)} ${'Isp'.padStart(5)}   ` + [1.4, 2.4, 4.0, 6.5, 9.0].map((v) => `${v.toFixed(1)} m³`.padStart(12)).join(''));
  const T = {};
  for (const [eid, e] of Object.entries(Econ.ENGINES)) for (const f of Object.keys(e.fuels)) {
    if (e.mount > 1) continue;                                      // the Prospector's mount: bigger engines need bigger frames (section 13)
    const row = tanks.map((tk) => cell(eid, f, tk));
    T[`${eid}/${f}`] = row;
    console.log(`INFO  ${e.name.padEnd(11)} ${Econ.FUELS[f].name.padEnd(16)} ${row[0].isp.toFixed(0).padStart(4)}s   ` +
                row.map((M) => `${M.dv.toFixed(0).padStart(5)} / ${M.twr.toFixed(2)}`.padStart(12)).join(''));
  }
  for (const x of Object.keys(Econ.ION_FUELS)) {
    const S = Econ.previewS(g, (m) => { m.owned.whisper = true; m.ionFuel = x; }), M = Econ.metrics(g, S);
    console.log(`INFO  ${'Whisper ion'.padEnd(11)} ${Econ.ION_FUELS[x].name.padEnd(16)} ${M.ionIsp.toFixed(0).padStart(4)}s   ion dv ${M.iondv.toFixed(0)} m/s on a stock ship, ` +
                `ion TWR on Mochi ${(S.ionThrust / (M.full * gC)).toFixed(3)}`);
  }
  console.log('');
  const stock = T['sparrow/methalox'][0];
  check('Brick lifts off Mochi hard (TWR > 2.5, stock tank)', T['brick/kerolox'][0].twr > 2.5 && T['brick/hypergolic'][0].twr > 2.5,
        `kerolox ${T['brick/kerolox'][0].twr.toFixed(2)}, hypergolic ${T['brick/hypergolic'][0].twr.toFixed(2)}`);
  check('NERVA + big tank: delta-v > 2x stock', T['nerva/lh2'][4].dv > 2 * stock.dv && T['nerva/ammonia'][4].dv > 2 * stock.dv,
        `LH2 ${T['nerva/lh2'][4].dv.toFixed(0)}, ammonia ${T['nerva/ammonia'][4].dv.toFixed(0)} vs 2 x ${stock.dv.toFixed(0)} m/s`);
  const ionS = Econ.previewS(g, (m) => { m.owned.whisper = true; }), ionM = Econ.metrics(g, ionS);
  check('ion drive alone cannot lift off Mochi', ionS.ionThrust / (ionM.full * gC) < 1 && ionM.iondv > 100, `TWR ${(ionS.ionThrust / (ionM.full * gC)).toFixed(3)}, ion dv ${ionM.iondv.toFixed(0)} m/s`);
  check('bigger tanks always add delta-v (every engine & fuel)', Object.values(T).every((row) => row.every((M, i) => !i || M.dv > row[i - 1].dv)));
  check('bigger tanks always cost lift (honest mass)', Object.values(T).every((row) => row.every((M, i) => !i || M.twr < row[i - 1].twr)));
  check('Isp shown = ve x 24 / 9.81 (methalox 367 s, LH2 930 s)', Math.round(stock.isp) === 367 && Math.round(T['nerva/lh2'][0].isp) === 930);
  check('kerolox packs more tonnes than methalox (density 1.2)', near(T['sparrow/kerolox'][0].fuelT, 1.68) && near(T['nerva/lh2'][4].fuelT, 9 * 0.22),
        `${T['sparrow/kerolox'][0].fuelT.toFixed(2)} t vs ${stock.fuelT.toFixed(2)} t`);
}


// ---------------- 2. buying changes stats (and costs mass) ----------------
{
  const g = fresh(); g.money = 600;
  const d0 = g.S.dry, dv0 = Econ.metrics(g, g.S).dv;
  const r = Econ.buy(g, 'cargo1', HUB);
  check('buy cargo net: hold 500 kg, +0.04 t, -$300 (+$100 job)', r.ok && g.S.cargoCap === 500 && near(g.S.dry, d0 + 0.04) && g.money === 600 - 300 + 100,
        `${r.msg} hold ${g.S.cargoCap} kg, dry ${g.S.dry.toFixed(2)} t, $${g.money}`);
  check('...and the mass shows up as less delta-v', Econ.metrics(g, g.S).dv < dv0, `${dv0.toFixed(1)} -> ${Econ.metrics(g, g.S).dv.toFixed(1)} m/s`);
  check('upgrade job ticks on the first purchase', g.done.upgrade !== undefined && g.money === 400, `$${g.money}`);
  const before = g.money, r2 = Econ.buy(g, 'cargo3', HUB);
  check('cannot skip a tier', !r2.ok && r2.why === 'locked' && g.money === before, r2.msg);
  const r3 = Econ.buy(g, 'cargo2', HUB);
  check('cannot buy when broke (money untouched)', !r3.ok && r3.why === 'broke' && g.money === before && g.S.cargoCap === 500, r3.msg);
  check('cannot rebuy an owned tier', Econ.buy(g, 'cargo1', HUB).why === 'owned');
  g.money = 99999;
  Econ.buy(g, 'cargo2', HUB); Econ.buy(g, 'hull1', HUB); Econ.buy(g, 'armor1', HUB); Econ.buy(g, 'rcs1', HUB); Econ.buy(g, 'tractor1', HUB);
  Econ.buy(g, 'scanner1', HUB); Econ.buy(g, 'pack1', HUB); Econ.buy(g, 'o2a', HUB); Econ.buy(g, 'jet1', HUB); Econ.buy(g, 'suit1', HUB);
  Econ.buy(g, 'laser1', HUB); Econ.buy(g, 'gun1', HUB); Econ.buy(g, 'turret', HUB);
  const S = g.S;
  check('every stat hook lands in S', S.cargoCap === 800 && S.hull === 150 && S.armor === 0.2 && S.rcs === 50 && S.rotAccel === 3 && S.tractor === 4 &&
        S.scanner === 1 && S.packCap === 70 && S.o2 === 300 && S.jet === 4 && S.jetFuel === 8 && S.suitHp === 150 && S.laserPower === 1.8 &&
        S.laserRange === 9 && S.laserDps === 28 && S.gun === 1 && S.gunDmg === 8 && S.gunRate === 4 && S.gunSpeed === 60 && S.turret === 1,
        `hull ${S.hull} armor ${S.armor} rcs ${S.rcs} pack ${S.packCap} o2 ${S.o2} laser ${S.laserPower} gun ${S.gun}`);
  check('suit upgrades add no ship mass, ship parts do', near(S.dry, 1 + 0.09 + 0.06 + 0.08 + 0.02 + 0.03 + 0.01 + 0.05 + 0.06), `dry ${S.dry.toFixed(2)} t`);
  check('astronaut max hp follows the suit', g.astro.hpMax === 150);
  check('new hull plating arrives intact (100/100 -> 150/150)', g.sh.hull === 150 && S.hull === 150, `${g.sh.hull} / ${S.hull}`);
  g.sh.hull = 120; Econ.buy(g, 'hull2', HUB);
  check('...but old damage stays (120/150 -> 190/220, no free repair)', g.sh.hull === 190 && g.S.hull === 220, `${g.sh.hull} / ${g.S.hull}`);
  check('sell with a junk quantity sells nothing', Econ.sell(g, 'iron', NaN, HUB) === 0 && Econ.sell(g, 'nope', 5, HUB) === 0);
  const m = Econ.state(g), dry0 = g.S.dry;
  for (let i = 0; i < 4; i++) Econ.buy(g, 'orion', { ...HUB, kind: 'black' });
  check('Orion units cap at 3, cost black-market price, weigh 0.05 t each', m.orion === 3 && near(g.S.dry, dry0 + 0.15) &&
        Econ.priceOf(g, 'orion', { kind: 'black' }) === 450 && Econ.priceOf(g, 'orion', HUB) === 810, `carrying ${m.orion}`);
  check('a hub with no weapons counter still sells Orion units (+80%) next to the engines',
        Econ.orionTab({ ...HUB, tabs: ['services', 'sell', 'ship', 'suit'] }) === 'ship' && Econ.orionTab({ ...HUB, tabs: ['services', 'sell'] }) === null &&
        Econ.canBuy(fresh(), 'orion', { ...HUB, tabs: ['services', 'sell', 'ship'] }).price === 810);
  check('outposts do not sell Orion units', Econ.canBuy(g, 'orion', { ...HUB, kind: 'outpost' }).why !== 'ok' && !Econ.sellsOrion({ kind: 'outpost' }));
  check('a station without a tab does not sell its items', Econ.canBuy(g, 'hull2', { ...HUB, tabs: ['services', 'sell'] }).why === 'notsold');
}


// ---------------- 3. engines and fuels: swap free, switching fuel drains the tank ----------------
{
  const g = fresh(); g.money = 20000;
  Econ.openShop(g, HUB);
  const r = Econ.buy(g, 'brick', HUB);
  const S = g.S, cost = 2200 + Math.ceil(1.82 * Econ.FUELS.hypergolic.price) - 100;      // first purchase also pays the $100 job
  check('buying Brick equips it on its furthest fuel (hypergolic) and fills up', r.ok && S.engine === 'brick' && S.thrust === 16 && S.ve === 390 &&
        S.fuelId === 'hypergolic' && near(S.fuel, 1.4 * 1.3) && near(g.sh.fuel, S.fuel) && g.money === 20000 - cost,
        `${S.engineName} ${S.thrust} kN ve ${S.ve} on ${S.fuelType}, fuel ${g.sh.fuel.toFixed(2)} t, $${g.money}`);
  const m0 = g.money, f = Econ.setFuel(g, 'kerolox', HUB);
  check('switch to kerolox: vents, refills, ve 375', f.ok && f.drained && g.S.ve === 375 && near(g.sh.fuel, 1.4 * 1.2) && g.money === m0 - Math.ceil(1.68 * 22),
        `paid $${m0 - g.money}`);
  // v4: NERVA-chan's reactor power is fixed, so ammonia gets T = 2P / ve = 10.6 kN and now lifts a 4 m³ tank (it went to hydrogen at 6 kN);
  //  on a 9 m³ tank neither fuel lifts off Mochi, and the liftier hydrogen wins
  const nervaOn = (tanks) => { tanks.forEach((t) => Econ.install(g, t)); const f2 = Econ.bestFuel(g, 'nerva');
    tanks.forEach((t) => { Econ.state(g).owned[t] = false; }); Game.recalc(g); return f2; };
  const n4 = nervaOn(['tank1', 'tank2']), n9 = nervaOn(['tank1', 'tank2', 'tank3', 'tank4']);
  check('best fuel: Kestrel on a stock tank -> methalox, NERVA 4 m³ -> ammonia, 9 m³ -> hydrogen',
        Econ.bestFuel(g, 'kestrel') === 'methalox' && n4 === 'ammonia' && n9 === 'lh2', `kestrel ${Econ.bestFuel(g, 'kestrel')}, nerva 4 m³ ${n4}, 9 m³ ${n9}`);
  check('Brick cannot burn liquid hydrogen', !Econ.setFuel(g, 'lh2', HUB).ok);
  g.sh.fuel = 0.7;
  const m1 = g.money, e = Econ.equip(g, 'sparrow', HUB);
  check('re-equip the Sparrow: free swap, back on methalox', e.ok && g.S.engine === 'sparrow' && g.S.fuelId === 'methalox' && near(g.sh.fuel, 1.4) &&
        g.money === m1 - 42 && near(g.S.dry, 1), `refill $${m1 - g.money}, dry ${g.S.dry.toFixed(2)}`);
  Econ.buy(g, 'kestrel', HUB); Econ.setFuel(g, 'methalox', HUB);
  g.sh.fuel = 1.0;
  const m2 = g.money; Econ.equip(g, 'sparrow', HUB);
  check('same fuel on both engines: swap keeps the fuel', near(g.sh.fuel, 1.0) && g.money === m2, `${g.sh.fuel.toFixed(2)} t kept`);
  check('cannot equip an engine you do not own', !Econ.equip(g, 'nerva', HUB).ok && g.S.engine === 'sparrow');
  Econ.buy(g, 'whisper', HUB);
  check('ion drive fitted: S.ionThrust / ionVe / ionTank, X works', g.S.ionThrust === 0.25 && g.S.ionVe === 3900 && near(g.S.ionTank, 0.4), `tank ${g.S.ionTank} t`);
  Econ.refuel(g, HUB);
  const x0 = g.money, sx = Econ.setIonFuel(g, 'krypton', HUB);
  check('switching ion fuel to krypton vents & refills the ion tank', sx.ok && g.S.ionVe === 4500 && near(g.sh.xe, 0.25 * 0.9) && x0 - g.money === Math.ceil(0.225 * 160));
  Econ.closeShop(g);
  H.run(g, 1, { pressed: ['KeyX'] });
  check('X does nothing while docked', g.ionOn === false);
  Game.place(g, 'orbit');
  H.run(g, 1, { pressed: ['KeyX'] });
  check('X toggles the ion drive once fitted', g.ionOn === true);
}


// ---------------- 4. selling: per-station multipliers ----------------
{
  const g = fresh();
  const out = { id: 'o', name: 'Kiwi Outpost', kind: 'outpost', buy: { ice: 1.5, gem: 1.2, '*': 0.8 }, fuelMult: 1.4 };
  const black = { id: 'b', name: 'Shady Pete', kind: 'black', buy: { voidopal: 1.6, amber: 0, ore: 0 }, fuelMult: 1.2 };
  check('sellPrice: hub = base price', Econ.sellPrice(g, 'ice', HUB) === 0.8 && Econ.sellPrice(g, 'opal', HUB) === 220);
  check('sellPrice: item mult, then kind, then *', Econ.sellPrice(g, 'ice', out) === 1.2 && Econ.sellPrice(g, 'amber', out) === 108 && Econ.sellPrice(g, 'iron', out) === 1.28,
        `ice ${Econ.sellPrice(g, 'ice', out)}, amber ${Econ.sellPrice(g, 'amber', out)}, iron ${Econ.sellPrice(g, 'iron', out)}`);
  check('sellPrice: 0 = not buying', Econ.sellPrice(g, 'ice', black) === 0 && Econ.sellPrice(g, 'voidopal', black) === 1040);
  Game.addCargo(g, 'ice', 100); Game.addCargo(g, 'amber', 2); Game.addCargo(g, 'voidopal', 1);
  check('HOLD VALUE row = hub prices', Game.gather(g, 'hudRows')[0].val === `$${Math.round(80 + 180 + 650)}`, Game.gather(g, 'hudRows')[0].val);
  const m0 = g.money, earned = Econ.sellAll(g, black);
  check('black market only buys what it wants', earned === 1040 && g.money === m0 + 1040 + 100 && g.cargo.ice === 100 && g.cargo.amber === 2 && !g.cargo.voidopal, JSON.stringify(g.cargo));
  check('sell job ticks', g.done.sell !== undefined, `$${g.money}`);
  const m1 = g.money, e2 = Econ.sellAll(g, out);
  check('outpost pays its multipliers', e2 === 120 + 216 && g.money === m1 + e2 && !Object.keys(g.cargo).length && g.sh.cargoKg === 0, `+$${e2}`);
  Game.addCargo(g, 'iron', 33);
  check('sell one row', Econ.sell(g, 'iron', Infinity, HUB) === Math.round(33 * 1.6) && !g.cargo.iron);
  g.pack = { ice: 20 };
  check('a backpack aboard is unloaded and sold too', Econ.sellAll(g, HUB) === 16 && !Object.keys(g.pack).length);
  const g2 = fresh(); Game.addCargo(g2, 'ice', 50);
  check('selling nothing sellable pays $0', Econ.sellAll(g2, { kind: 'black', buy: { '*': 0 } }) === 0 && g2.cargo.ice === 50);
}


// ---------------- 5. services: costs, station multipliers, partial when broke ----------------
{
  const g = fresh(); g.sh.fuel = 0.4; g.sh.rcs = 10; g.sh.hull = 60; g.money = 1000;
  const q = Econ.quote(g, HUB, 'fuel');
  const spent = Econ.refuel(g, { ...HUB, fuelMult: 1.5 }, { rcs: false });
  check('refuel at 1.5x fuel price', spent === Math.ceil(1.0 * 30 * 1.5) && near(g.sh.fuel, 1.4) && q === 30, `$${spent}`);
  check('restock RCS', Econ.restockRcs(g, HUB) === 30 && g.sh.rcs === 30);
  check('repair hull', Econ.repair(g, HUB) === 48 && g.sh.hull === 100);
  g.sh.fuel = 0; g.money = 15;
  const s2 = Econ.refuel(g, HUB);
  check('broke: partial fill, money hits exactly $0', s2 === 15 && g.money === 0 && near(g.sh.fuel, 0.5), `fuel ${g.sh.fuel.toFixed(2)} t for $${s2}`);
  check('no money: nothing happens, never negative', Econ.refuel(g, HUB) === 0 && Econ.repair(g, HUB) === 0 && g.money === 0);
  g.money = 100; g.sh.fuel = 0;
  Econ.refuel(g, HUB, { frac: 0.5, ion: false, rcs: false });
  check('fill to 50%', near(g.sh.fuel, 0.7) && g.money === 79, `${g.sh.fuel.toFixed(2)} t, $${g.money}`);
  const free = Econ.refuel(g, { ...HUB, fuelMult: 0 });
  check('free station (fuelMult 0) fills at $0', free === 0 && near(g.sh.fuel, 1.4) && g.money === 79);
}


// ---------------- 6. Orion pulse: dv = J / m along the nose ----------------
{
  const g = fresh('orbit'); g.everFlew = true;
  H.run(g, 2, {});
  Econ.state(g).orion = 2; Game.recalc(g);
  const v0 = [g.sh.vx, g.sh.vy], h0 = g.sh.hull, ang = g.sh.ang;
  H.run(g, 1, { pressed: ['KeyN'] });
  const mAfter = Physics.mass(g.sh, g.S), dv = Math.hypot(g.sh.vx - v0[0], g.sh.vy - v0[1]);
  const along = ((g.sh.vx - v0[0]) * Math.cos(ang) + (g.sh.vy - v0[1]) * Math.sin(ang)) / dv;
  const grav = 1 / 60 * 2;                                         // one frame of gravity, at most
  check('N fires: dv = J / m along the nose', Math.abs(dv - g.S.orionJ / mAfter) < grav && along > 0.99,
        `dv ${dv.toFixed(3)} vs J/m ${(g.S.orionJ / mAfter).toFixed(3)} m/s (m ${mAfter.toFixed(3)} t)`);
  check('pusher plate takes 4 hull, a unit is used, the job ticks', h0 - g.sh.hull === 4 && Econ.state(g).orion === 1 && g.done.orion !== undefined && g.status === 'flying',
        `hull ${g.sh.hull}, ${Econ.state(g).orion} left`);
  check('BWOOOM popup, flash, shake', g.popups.some((p) => p.text === 'BWOOOM!') && g.particles.some((p) => p.kind === 'flash') && g.shake > 0.5);
  const v1 = [g.sh.vx, g.sh.vy];
  H.run(g, 1, { pressed: ['KeyN'] });
  check('cooldown: a second N right away does nothing', Econ.state(g).orion === 1 && Math.hypot(g.sh.vx - v1[0], g.sh.vy - v1[1]) < 0.1);
  Econ.state(g).orion = 0; Game.recalc(g);
  const v2 = [g.sh.vx, g.sh.vy]; g.real += 5;
  H.run(g, 1, { pressed: ['KeyN'] });
  check('no units: nothing happens', Math.hypot(g.sh.vx - v2[0], g.sh.vy - v2[1]) < 0.1);

  const gd = fresh('orbit'); dockAt(gd); Econ.state(gd).orion = 1; Game.recalc(gd);
  H.run(gd, 1, { pressed: ['KeyN'] });
  check('not while docked', gd.status === 'docked' && Econ.state(gd).orion === 1);

  const gw = fresh('orbit'), [mwx, mwy, mwvx, mwvy] = World.bodyState(gw.w, gw.w.byId.mochi, gw.t); gw.everFlew = true;
  Object.assign(gw.sh, { x: mwx, y: mwy + 1300, vx: mwvx, vy: mwvy });
  Econ.state(gw).orion = 1; Game.recalc(gw); gw.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(gw, 3, {});
  const warpBefore = gw.warp;
  H.run(gw, 3, { pressed: ['KeyN'] });
  check('fired at max warp: kick lands, warp drops to 1x, no NaN', warpBefore === CONFIG.sim.warps[CONFIG.sim.warps.length - 1] && gw.warp === 1 && Econ.state(gw).orion === 0 && finite(gw.sh), `warp ${warpBefore} -> ${gw.warp}`);
}
{
  const g = fresh('pad'), b = g.w.byId.mochi, T = Terrain.of(b);
  const solid0 = T.grid.reduce((s, c) => s + (c >= Terrain.REG ? 1 : 0), 0);
  Econ.state(g).orion = 1; Game.recalc(g);
  H.run(g, 1, { pressed: ['KeyN'] });
  const solid1 = T.grid.reduce((s, c) => s + (c >= Terrain.REG ? 1 : 0), 0);
  check('fired on the pad: lifts off and digs a crater', g.status === 'flying' && solid0 - solid1 > 100, `${solid0 - solid1} cells blasted, ${g.status}`);
  H.run(g, 60, {});
  check('...and the ship rises cleanly', g.status !== 'dead' && finite(g.sh) && g.orb.alt > 5, `alt ${g.orb.alt.toFixed(1)} m`);
}
{
  const g = fresh('orbit'), seed = g.w.byId.seed;
  Game.landAt(g, seed, 0.3); g.everFlew = true;
  Econ.state(g).orion = 1; Game.recalc(g);
  H.run(g, 1, { pressed: ['KeyN'] });
  H.run(g, 30, {});
  check('fired on tiny Seed: no NaN, escapes the moonlet', finite(g.sh) && g.status === 'flying', `status ${g.status}, v rel ${g.orb.speed.toFixed(1)} m/s`);
}


// ---------------- 7. tow fees ----------------
{
  const g = fresh(); g.money = 1000; H.run(g, 1, {});
  Game.respawn(g, 'tow');
  const tow = 1000 - g.money;
  const g2 = fresh(); g2.money = 1000; H.run(g2, 1, {});
  Game.respawn(g2, 'crash');
  const crash = 1000 - g2.money;
  check('tow from the pad: $40 call-out, a crash $80 (tanks full)', tow === 40 && crash === 80, `tow $${tow}, crash $${crash}`);
  const g3 = fresh(); g3.money = 37; Game.respawn(g3, 'crash');
  const g4 = fresh(); g4.money = 0; Game.respawn(g4, 'tow');
  check('a fee never takes more than a quarter of your cash (or below $0)', g3.money === 37 - 9 && g4.money === 0 && g3.toasts.some((t) => /ROOKIE RATE -\$9/.test(t.text)),
        `$37 -> $${g3.money}, $0 -> $${g4.money}: ${g3.toasts.map((t) => t.text).join(' | ')}`);
  const gr = fresh(); gr.money = 300; gr.sh.fuel = 0.2; gr.sh.rcs = 3; gr.sh.hull = 0; Game.respawn(gr, 'crash');
  check('a rookie crash with $300 costs $75, not $250', gr.money === 225, `$300 -> $${gr.money}`);
  const gk = fresh('orbit'), mo = gk.w.byId.mochi; gk.money = 99999;
  { const [bx, by] = World.bodyState(gk.w, mo, gk.t); gk.sh.x = bx + mo.R + 10000; gk.sh.y = by; }
  H.run(gk, 1, {});
  const k0 = gk.money, km = Econ.state(gk).towKm; Game.respawn(gk, 'tow');
  const wantK = Math.round(40 + 8 * km + Math.max(0, Physics.fullMass(gk.S) - 2.4) * 15);
  check('the tug charges $8 per km it flies from Mochi (10 km: $40 + $80)', Math.abs(km - 10) < 0.1 && k0 - gk.money === wantK && /TOW 10 KM/.test(gk.toasts.map((t) => t.text).join()),
        `${km.toFixed(2)} km, $${k0 - gk.money} (want $${wantK}): ${gk.toasts.map((t) => t.text).slice(-1)}`);
  const g5 = fresh(); g5.money = 99999;
  for (const id of ['tank4', 'cargo3', 'hull3', 'armor3']) Econ.install(g5, id);                 // 9 t of methalox: an 11 t ship
  Econ.refuel(g5, HUB); Econ.repair(g5, HUB);
  const m5 = g5.money; Game.respawn(g5, 'crash');
  const heavy = (Physics.fullMass(g5.S) - 2.4) * 15;
  check('a heavy ship costs more to tow: $15 per tonne over 2.4 t', m5 - g5.money === Math.round(80 + heavy), `$${m5 - g5.money} (${Physics.fullMass(g5.S).toFixed(1)} t)`);
  const gF = fresh(); gF.money = 99999;
  Econ.state(gF).towKm = 80; const mF = gF.money; Game.respawn(gF, 'crash');
  check('...and the call-out is capped at $250 (Prospector, 80 km out)', mF - gF.money === 250, `$${mF - gF.money}`);
  const gT = fresh(); gT.money = 1000; gT.sh.fuel = 0; gT.sh.rcs = 0; gT.sh.hull = 40;
  Game.respawn(gT, 'tow');
  const want = 40 + Math.ceil(gT.S.fuel * Econ.fuelPrice(gT, HUB) + gT.S.rcs * Econ.rcsPrice(HUB) + 60 * Econ.repairPrice(HUB) - 1e-6);
  check('a tow bills the refill: never cheaper than buying the fuel', 1000 - gT.money === want && 1000 - gT.money > tow, `$${1000 - gT.money} (want $${want})`);
  const g6 = fresh('pad'); g6.money = 500; Econ.state(g6).orion = 1; Game.recalc(g6);
  const g7 = fresh('pad'); Econ.firePulse(g7);
  check('no Orion units, no stations: the toast points at the pad depot', g7.toasts.some((t) => t.text === 'NO ORION UNITS (THE PAD DEPOT SELLS THEM)'), g7.toasts.map((t) => t.text).join(' | '));
  Econ.firePulse(g6); Econ.openShop(g6, HUB); Game.respawn(g6, 'tow');
  check('respawn clears the blast and closes the shop', !Econ.state(g6).blast && !g6.ui && !Econ.state(g6).station);
}


// ---------------- 8. blueprints (wrecks) ----------------
{
  const g = fresh(), seq = [0.1, 0.5, 0.9, 0.3];
  let k = 0; const rand = () => seq[k++ % seq.length];
  const id = Econ.randomBlueprint(g, rand);
  check('randomBlueprint returns an unowned upgrade', id && Econ.BY_ID[id] && !Econ.owns(g, id) && !Econ.BY_ID[id].consumable, id);
  const name = Econ.grant(g, id);
  check('grant installs it for free and names it', name === Econ.BY_ID[id].name && Econ.owns(g, id) && g.money === 300, name);
  check('grant again -> null; unknown -> null', Econ.grant(g, id) === null && Econ.grant(g, 'warp-drive') === null);
  check('grant an engine mid-flight does not swap engines', Econ.grant(g, 'nerva') === 'NERVA-chan' && g.S.engine === 'sparrow');
  Econ.grant(g, 'tank3');
  check('granting a higher tier works and lower tiers are then "owned"', g.S.tankVol === 6.5 && Econ.grant(g, 'tank1') === null, `${g.S.tankVol} m³`);
  let n = 0;
  for (let i = 0; i < 200; i++) { const b = Econ.randomBlueprint(g); if (!b) break; Econ.grant(g, b); n++; }
  check('blueprints run out once everything is owned', Econ.randomBlueprint(g) === null, `${n} more granted`);
  check('no grant ever skips the tank tier ladder backwards', g.S.tankVol === 9 && g.S.hull === 300 && g.S.cargoCap === 1200);
}


// ---------------- 9. save / load round trip ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = fresh(); g.money = 50000;
  Econ.openShop(g, HUB);
  for (const id of ['tank2', 'cargo1', 'hull1', 'laser1', 'gun2', 'kestrel', 'whisper']) Econ.buy(g, id, HUB);
  Econ.setFuel(g, 'methalox', HUB); Econ.setIonFuel(g, 'krypton', HUB);
  Econ.buy(g, 'orion', HUB); Econ.buy(g, 'orion', HUB);
  Game.addCargo(g, 'ice', 40);
  g.sh.fuel = 1.234;
  Econ.closeShop(g);
  Game.save(g);
  const g2 = Game.create(7, 'pad');
  const keys = ['dry', 'fuel', 've', 'thrust', 'cargoCap', 'hull', 'laserPower', 'gun', 'ionTank', 'ionVe', 'orionCount', 'tankVol'];
  const diff = keys.filter((k) => !near(g2.S[k], g.S[k]));
  check('save/load: same derived stats', !diff.length, diff.length ? `differs: ${diff.join(', ')}` : `dry ${g2.S.dry.toFixed(2)} t, ${g2.S.engineName} on ${g2.S.fuelType}, ion ${g2.S.ionFuelType}`);
  const m = Econ.state(g2);
  check('save/load: engine, fuels, Orion count, tank level, money', m.engine === 'kestrel' && Econ.fuelOf(g2) === 'methalox' && m.ionFuel === 'krypton' &&
        m.orion === 2 && near(g2.sh.fuel, 1.234) && g2.money === g.money && g2.cargo.ice === 40, `$${g2.money}, fuel ${g2.sh.fuel}`);
  store['pocket-orbit-v4'] = JSON.stringify({ v: 4, money: 5, mods: { economy: { owned: ['warp9', 'tank1', null], engine: 'nerva', fuelOf: { sparrow: 'plutonium' }, orion: 99, stats: 'x' } } });
  const g3 = Game.create(7, 'pad');
  check('garbage save: ignored safely', g3.S.engine === 'sparrow' && g3.S.fuelId === 'methalox' && Econ.state(g3).orion === 3 && g3.S.tankVol === 2.4 && finite(g3.S),
        `${g3.S.engine}, orion ${Econ.state(g3).orion}`);
  store['pocket-orbit-v4'] = '{"v":4,"money":5,"mods":{"economy":{"owned":["toString","__proto__","constructor"],"engine":"toString","fuelOf":{"toString":"x","__proto__":{"a":1}},"ionFuel":"constructor"}}}';
  const g4 = Game.create(7, 'pad');
  check('prototype-key save ("toString", "__proto__"): no crash, stock ship', g4.S.engine === 'sparrow' && g4.S.fuelId === 'methalox' && finite(g4.S) &&
        Econ.canBuy(g4, 'toString', HUB).why === 'unknown' && !Econ.equip(g4, 'constructor').ok && Econ.sellPrice(g4, 'toString') === 0);
  Game.wipeSave();
  delete global.localStorage;
}


// ---------------- 10. shop: opens, pauses the sim, eats keys, Esc closes ----------------
{
  const g = fresh('orbit'); dockAt(g);
  H.run(g, 5, {});
  check('open the shop -> g.ui = "shop"', Econ.openShop(g, HUB) && g.ui === 'shop');
  const t0 = g.t;
  H.run(g, 30, { keys: ['KeyW', 'ArrowUp'], pressed: ['KeyR', 'Tab', 'KeyN'] });
  check('sim paused, held W does not undock, keys eaten', g.t === t0 && g.status === 'docked' && !g.navId && g.towAsk < 0, `t ${t0.toFixed(2)} -> ${g.t.toFixed(2)}`);
  H.run(g, 1, { pressed: ['Escape'] });
  check('Esc closes the shop (and does not pause the game)', !g.ui && !g.paused && !Econ.state(g).station);
  H.run(g, 5, {});
  check('time flows again', g.t > t0);
  check('cannot open while dead', (() => { g.status = 'dead'; return !Econ.openShop(g, HUB) && !g.ui; })());
  const gp = fresh('pad');
  H.run(gp, 2, {});
  const p = gp.prompts.find((x) => x.key === 'KeyF');
  H.run(gp, 1, { pressed: ['KeyF'] });
  check('no stations module: F on the Mochi pad opens the pad depot', p && gp.ui === 'shop' && Econ.state(gp).station.name === 'Mochi Pad Depot');
  check('...the whole shop (no Hub upstairs), not the kiosk', Econ.padDepot().tabs.length > 2 && Econ.state(gp).station.tabs.join() === Econ.ALL_TABS.join(), Econ.state(gp).station.tabs.join());
  H.run(gp, 1, { pressed: ['Escape'] });
  check('...and Esc closes it', !gp.ui);
  H.run(gp, 1, { pressed: ['KeyF'] });
  H.run(gp, 1, { pressed: ['KeyF'] });
  check('F toggles the shop open and shut', !gp.ui && !gp.paused);
}


// ---------------- 11. hints, HUD, dev key, rich job, heavy lift-off ----------------
{
  const g = fresh('orbit'); dockAt(g); Game.addCargo(g, 'iron', 50);
  H.run(g, 2, {});
  check('docked with cargo -> hint to sell it', /sell/.test(Game.hint(g)), Game.hint(g));
  Econ.state(g).orion = 2; Game.recalc(g);
  check('HUD shows ORION count', Game.gather(g, 'hudRows').some((r) => /ORION/.test(r.label) && r.val === '2 / 3'));
  const m0 = g.money;
  H.run(g, 1, { pressed: ['KeyK'] });
  check('K adds nothing outside dev mode', g.money === m0);
  const gd = Game.create(7, 'pad', { fresh: true, dev: true });
  H.run(gd, 2, {});
  const md = gd.money;
  H.run(gd, 1, { pressed: ['KeyK'] });
  check('dev K adds $5000', gd.money === md + 5000, `$${md} -> $${gd.money}`);
  const gr = fresh(); gr.money = 20000; H.run(gr, 2, {});
  check('rich job: bank $20,000', gr.done.rich !== undefined && gr.money === 21000);

  const gh = fresh('pad');
  Econ.install(gh, 'tank4'); gh.sh.fuel = gh.S.fuel;
  H.run(gh, 2, {});
  const twr = Econ.twrOn(gh, gh.w.byId.mochi);
  check('too heavy on the pad -> lift-off hint', twr < 1 && /Too heavy/.test(Game.hint(gh)), `TWR ${twr.toFixed(2)}: ${Game.hint(gh)}`);
  const f0 = gh.sh.fuel;
  let i = 0; for (; i < 60 * 900 && gh.status === 'landed'; i++) H.run(gh, 1, { keys: ['KeyW'] });
  check('holding W burns fuel on the pad until it lifts off', gh.status === 'flying' && gh.sh.fuel < f0 && Econ.twrOn(gh, gh.w.byId.mochi) >= 0.99,
        `lifted after ${(i / 60).toFixed(1)} s, fuel ${f0.toFixed(2)} -> ${gh.sh.fuel.toFixed(2)} t`);
  const ge = fresh('pad'); ge.sh.fuel = 0; H.run(ge, 2, {});
  check('out of fuel on the ground -> tow hint', /Out of fuel/.test(Game.hint(ge)), Game.hint(ge));
}


// ---------------- 12. previews never touch the real state ----------------
{
  const g = fresh(), m = Econ.state(g), snap = JSON.stringify({ o: m.owned, e: m.engine, f: m.fuelOf, x: m.ionFuel, n: m.orion }), dry = g.S.dry;
  Econ.previewS(g, (mm) => { mm.owned.nerva = true; mm.engine = 'nerva'; mm.orion = 3; mm.owned.tank4 = true; });
  check('previewS restores the economy state', JSON.stringify({ o: m.owned, e: m.engine, f: m.fuelOf, x: m.ionFuel, n: m.orion }) === snap && g.S.dry === dry);
  check('metrics are finite for every catalog item', Econ.CATALOG.every((c) => finite(Econ.metrics(g, Econ.previewS(g, (mm) => { if (c.consumable) mm.orion = 3; else mm.owned[c.id] = true; })))));
}

// ======================================================================
//  v4: frames, fusion, item ids -> S fields, charges, dev mode
// ======================================================================

const DEV = Econ.DEV_SHOP;
const pv = (g, f) => Econ.previewS(g, f);
const owned = (m, ids) => ids.forEach((id) => { const T = Econ.TIER[id]; if (T) T.line.tiers.slice(0, T.tier).forEach((t) => { m.owned[t.id] = true; }); else m.owned[id] = true; });

// ---------------- 13. frames: the ship grows (progression §2.1) ----------------
{
  const g = fresh(), m = Econ.state(g);
  const base = pv(g, (mm) => { mm.owned.mule = true; mm.frame = 'mule'; });
  check('Pack Mule frame: dry 2.4, tank 3.5 m³, hold 600 kg, hull 160, 11.5 m, mount 2, turns 0.85×',
        near(base.dry, 2.4) && near(base.tankVol, 3.5) && base.cargoCap === 600 && base.hull === 160 && base.length === 11.5 && base.radius === 5 &&
        base.mount === 2 && near(base.rotAccel, 2.4 * 0.85) && base.name === 'Pack Mule' && base.frameId === 'mule',
        `dry ${base.dry} tank ${base.tankVol} hold ${base.cargoCap} hull ${base.hull} rot ${base.rotAccel.toFixed(2)}`);
  const parts = pv(g, (mm) => { mm.frame = 'mule'; owned(mm, ['mule', 'tank1', 'cargo1', 'hull1', 'rcs1', 'gun1']); });
  check('frame swap scales parts: tank1 -> 3.5 × 2.4/1.4 m³, cargo1 -> 600 × 500/300, hull1 -> 160 × 1.5, masses × k = 2.5 (guns not)',
        near(parts.tankVol, 6) && parts.cargoCap === 1000 && parts.hull === 240 && near(parts.dry, 2.4 + 2.5 * (0.05 + 0.04 + 0.06 + 0.02) + 0.05) &&
        near(parts.rotAccel, 3.0 * 0.85), `tank ${parts.tankVol.toFixed(2)} m³, hold ${parts.cargoCap}, hull ${parts.hull}, dry ${parts.dry.toFixed(3)} t`);
  const lev = pv(g, (mm) => { mm.frame = 'leviathan'; owned(mm, ['leviathan', 'tank4', 'cargo3', 'hull3']); });
  check('Leviathan with maxed tank/hold/hull: 360 m³, 19,200 kg, 1,440 hp, 26 m, radius 11 (= Seed)',
        near(lev.tankVol, 360) && lev.cargoCap === 19200 && lev.hull === 1440 && lev.length === 26 && lev.radius === 11 && lev.radius === g.w.byId.seed.R,
        `${lev.tankVol} m³, ${lev.cargoCap} kg, ${lev.hull} hp`);
  check('mass parts add up to the dry mass on a big frame', near(lev.massParts.reduce((s, p) => s + p[1], 0), lev.dry));

  console.log('\nINFO  builds (progression §2.5): full tank, empty hold, TWR on Mochi (2.0 m/s²)');
  const B = {};
  for (const id of Object.keys(Econ.BUILDS)) {
    if (Econ.BUILDS[id].suit) continue;
    const S = pv(g, (mm) => Econ.buildState(mm, id)), M = Econ.metrics(g, S);
    B[id] = { S, M };
    console.log(`INFO  ${Econ.BUILDS[id].name.padEnd(13)} ${S.frameName.padEnd(11)} ${(S.engineName + ' / ' + S.fuelType).padEnd(26)} dry ${S.dry.toFixed(2).padStart(6)} t  ` +
                `Δv ${M.dv.toFixed(0).padStart(5)} m/s  TWR ${M.twr.toFixed(2)}  hold ${String(S.cargoCap).padStart(5)} kg  hull ${String(S.hull).padStart(4)}  ` +
                `tow ${S.towMax} t / ${S.cableLen} m  impulse ${M.towImp.toFixed(0)} kN·s  side ${M.sideAcc.toFixed(2)} m/s²`);
  }
  console.log('');
  check('Mule build: Δv 424 ± 1, TWR 1.80 ± 0.01 (dry 4.02 t)', Math.abs(B.mule.M.dv - 424) <= 1 && Math.abs(B.mule.M.twr - 1.80) <= 0.01 && near(B.mule.S.dry, 4.025),
        `Δv ${B.mule.M.dv.toFixed(2)}, TWR ${B.mule.M.twr.toFixed(3)}`);
  check('Fusion Beast (D-He3): Δv 4,065 ± 5, TWR 1.56 ± 0.01 (dry 108.74 t)', Math.abs(B.beast.M.dv - 4065) <= 5 && Math.abs(B.beast.M.twr - 1.56) <= 0.01 && near(B.beast.S.dry, 108.74),
        `Δv ${B.beast.M.dv.toFixed(1)}, TWR ${B.beast.M.twr.toFixed(3)}`);
  check('Hauler 586 m/s / 1.10, Barge 4,273 / 1.13, Brick tug 487 / 1.21, First tow 369 / 1.40',
        Math.abs(B.hauler.M.dv - 586) < 1 && Math.abs(B.hauler.M.twr - 1.10) < 0.01 && Math.abs(B.barge.M.dv - 4273) < 1.5 && Math.abs(B.barge.M.twr - 1.13) < 0.01 &&
        Math.abs(B.brick.M.dv - 487) < 1 && Math.abs(B.tow.M.dv - 369) < 1 && Math.abs(B.tow.M.twr - 1.40) < 0.01,
        `${B.hauler.M.dv.toFixed(0)} ${B.barge.M.dv.toFixed(0)} ${B.brick.M.dv.toFixed(0)} ${B.tow.M.dv.toFixed(0)}`);
  check('tow impulse = ve × fuel: stock 630, Beast 480,000 kN·s', near(B.dinky.M.towImp, 630) && near(B.beast.M.towImp, 480000));
  check('Δv with a rock = ve ln((m + M) / (m + M − fuel)): Hauler + 2,000 t = 6.2 m/s',
        Math.abs(Econ.metrics(g, B.hauler.S, 2000).dvRock - 6.2) < 0.05, `${Econ.metrics(g, B.hauler.S, 2000).dvRock.toFixed(2)} m/s`);

  g.money = 1e6;
  const c1 = Econ.canBuy(g, 'sunflower', HUB), c2 = Econ.canBuy(g, 'tow3', { ...HUB }), c0 = Econ.canBuy(fresh(), 'sunflower', HUB);
  m.owned.tow2 = true; m.owned.tow1 = true;
  const c3 = Econ.canBuy(g, 'tow3', HUB);
  check('canBuy -> frame for a Sunflower on a Prospector (even when broke): needs a Leviathan', !c1.ok && c1.why === 'frame' && c1.frame === 'leviathan' && c0.why === 'frame',
        `${c1.why} ${c1.frame}; $300: ${c0.why}`);
  check('tow3 on a Prospector: locked without tow2, then needs a Hauler', c2.why === 'locked' && c3.why === 'frame' && c3.frame === 'hauler', `${c2.why}, ${c3.why} ${c3.frame}`);
  const r = Econ.buy(g, 'sunflower', HUB);
  check('...and buy refuses with "Needs a Leviathan frame"', !r.ok && /Leviathan/.test(r.msg) && !m.owned.sunflower, r.msg);
}
{
  const g = fresh('orbit'); dockAt(g); g.money = 200000; H.run(g, 1, {});           // the rich job pays first
  const m = Econ.state(g), m0 = g.money;
  const r0 = Econ.buy(g, 'mule', HUB);
  check('frame trap: a Mule on the Sparrow is refused (lift 0.59× on Mochi), msg names the fix', !r0.ok && r0.why === 'lift' && !m.owned.mule && g.money === m0 &&
        /0\.59× on Mochi/.test(r0.msg) && /Brick on kerolox it lifts 1\.15×/.test(r0.msg) && r0.trap.fix.engine === 'brick', r0.msg);
  const r = Econ.buy(g, 'mule', HUB, { confirm: true });
  H.run(g, 1, {});
  check('buy a frame at the Hub: it is fitted, frame job pays $500 (+$100 first upgrade)', r.ok && g.S.frameId === 'mule' && g.done.frame !== undefined &&
        g.money === m0 - 2500 + 100 + 500, `${r.msg} $${g.money - m0}`);
  const rO = Econ.buy(g, 'hauler', OUTPOST);
  check('frames are not sold at an outpost (no ship tab)', !rO.ok && rO.why === 'notsold');
  Econ.buy(g, 'leviathan', HUB, { confirm: true });
  const okE = Econ.buy(g, 'sunflower', HUB), okB = Econ.buy(g, 'bulldog', HUB, { confirm: true });
  Econ.equip(g, 'sunflower', HUB);
  check('on a Leviathan the Sunflower fits: bought and equipped on D-He3', okE.ok && okB.ok && g.S.engine === 'sunflower' && g.S.fuelId === 'dhe3' && g.S.thrust === 400,
        `${g.S.engineName} ${g.S.thrust} kN on ${g.S.fuelType}`);
  const sOut = Econ.swapFrame(g, 'mule', OUTPOST);
  check('frames swap only at Mochi Hub (or the dev shop)', !sOut.ok && g.S.frameId === 'leviathan', sOut.msg);
  Game.addCargo(g, 'iron', 1500);
  const sCargo = Econ.swapFrame(g, 'mule', HUB);
  check('refuses a frame whose hold is too small: SELL CARGO FIRST', !sCargo.ok && /SELL CARGO FIRST: 1,500 kg > 600 kg HOLD/.test(sCargo.msg) && g.S.frameId === 'leviathan', sCargo.msg);
  Game.removeCargo(g, 'iron', 1500);
  const s = Econ.swapFrame(g, 'mule', HUB);
  check('mount auto-swap on downgrade: Leviathan -> Mule puts the Bulldog in', s.ok && g.S.frameId === 'mule' && g.S.engine === 'bulldog' && s.swapped === 'sunflower' &&
        g.toasts.some((t) => t.text === 'ENGINE SWAPPED: THE SUNFLOWER TORCH NEEDS A MOUNT-5 FRAME') && near(g.sh.fuel, g.S.fuel),
        `${s.msg} | fuel ${g.sh.fuel.toFixed(2)} / ${g.S.fuel.toFixed(2)} t`);
  check('...and the Sunflower cannot be equipped on the Mule', !Econ.equip(g, 'sunflower', HUB).ok && g.S.engine === 'bulldog');
  Econ.buy(g, 'hauler', HUB, { confirm: true }); Econ.swapFrame(g, 'leviathan', HUB, { confirm: true }); Econ.equip(g, 'sunflower', HUB, { confirm: true });
  for (const id of ['tow1', 'tow2', 'tow3', 'tow4']) Econ.buy(g, id, HUB);
  const t4 = { ...g.S };
  Econ.swapFrame(g, 'hauler', HUB, { confirm: true });
  check('tow derate: Big Hug on a Hauler works as a Tug claw (6,000 t), still weighs 3 t', t4.towTier === 4 && t4.towMax === 40000 && g.S.towTier === 3 &&
        g.S.towMax === 6000 && g.S.cableLen === 60 && g.S.massParts.some((p) => p[0] === 'Big Hug' && near(p[1], 3)), `tier ${t4.towTier} -> ${g.S.towTier}`);
  check('tow fee scales with sqrt(k): a heavy Leviathan pays up to 250 × √40 = $1,581', (() => {
    Econ.swapFrame(g, 'leviathan', HUB, { confirm: true }); g.money = 99999; Econ.refuel(g, HUB); Econ.repair(g, HUB);
    const a = g.money; Game.respawn(g, 'tow'); return a - g.money === Math.round(250 * Math.sqrt(40)); })(), `${Math.round(250 * Math.sqrt(40))}`);
}
{
  const g = Game.create(7, 'pad', { fresh: true, dev: true });
  H.run(g, 2, {});
  Econ.openShop(g, DEV); Econ.buy(g, 'leviathan', DEV, { confirm: true }); Econ.closeShop(g);
  const T = Terrain.of(g.w.byId.mochi), up = g.sh, [bx, by] = World.bodyState(g.w, g.w.byId.mochi, g.t);
  check('a frame fitted on the ground re-seats the ship (radius 11 m clears the pad)', g.S.frameId === 'leviathan' && g.status === 'landed' &&
        !Terrain.collideCircle(T, up.x - bx, up.y - by, g.S.radius - 0.05), `${g.status}, r ${g.S.radius}`);
  H.run(g, 60, {});
  check('...and sits there quietly', g.status === 'landed' && g.sh.hull === g.S.hull, `${g.status} hull ${g.sh.hull}`);
}


// ---------------- 14. engines: NTR and fusion, honest power ----------------
{
  const g = fresh(), E = Econ.ENGINES;
  const on = (eid, f, frame = 'leviathan') => pv(g, (mm) => { mm.frame = frame; mm.owned[frame] = true; mm.owned[eid] = true; mm.engine = eid; mm.fuelOf[eid] = f; });
  const nA = on('nerva', 'ammonia', 'prospector'), nH = on('nerva', 'lh2', 'prospector');
  check('NERVA-chan on ammonia 10.6 kN (fixed reactor power, T = 2P / ve), 6 kN on hydrogen', nA.thrust === 10.6 && nH.thrust === 6 &&
        Math.abs(Econ.jetPower(nA.thrust, nA.ve) / Econ.jetPower(nH.thrust, nH.ve) - 1) < 0.002, `${nA.thrust} / ${nH.thrust} kN`);
  const S = { dhe3: on('sunflower', 'dhe3'), dd: on('sunflower', 'dd'), augment: on('sunflower', 'augment') };
  const MS = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, Econ.metrics(g, v)]));
  check('Sunflower: 400 / 333 / 4,000 kN on D-He3 / D-D / afterburner', S.dhe3.thrust === 400 && S.dd.thrust === 333 && S.augment.thrust === 4000);
  check('JET POWER row = ½·T·ve·8: Sunflower D-He3 40 GW, D-D 20 GW, afterburner 40 GW', Math.abs(MS.dhe3.jetP - 40e9) < 1e6 && Math.abs(MS.dd.jetP - 19.98e9) < 1e8 &&
        Math.abs(MS.augment.jetP - 40e9) < 1e6, `${(MS.dhe3.jetP / 1e9).toFixed(2)} / ${(MS.dd.jetP / 1e9).toFixed(2)} / ${(MS.augment.jetP / 1e9).toFixed(2)} GW`);
  const ns = Econ.metrics(g, on('nervasama', 'lh2')), nsA = on('nervasama', 'ammonia'), ps = Econ.metrics(g, on('pocketsun', 'dhe3'));
  check('NERVA-sama 184 MW (70.8 kN on ammonia), Pocket Sun 12 GW, chemical engines show no jet power',
        Math.abs(ns.jetP - 184e6) < 1e6 && nsA.thrust === 70.8 && Math.abs(ps.jetP - 12e9) < 1e6 && Econ.metrics(g, g.S).jetP === 0,
        `${(ns.jetP / 1e6).toFixed(0)} MW, ${(ps.jetP / 1e9).toFixed(1)} GW`);
  check('real-equivalent Isp = ve × 8 / 9.81: Sunflower D-He3 20,387 s, NERVA-sama LH2 938 s', Math.round(MS.dhe3.isp) === 20387 && Math.round(ns.isp) === 938);
  check('engines carry their mount: 1 / 2 / 3 / 4 / 5', E.sparrow.mount === 1 && E.nerva.mount === 1 && E.bulldog.mount === 2 && E.nervasama.mount === 3 && E.pocketsun.mount === 4 && E.sunflower.mount === 5);
  check('side pods vent at sideVe = min(0.85 ve, 900): 382.5 m/s stock, 900 on fusion', near(g.S.sideVe, 382.5) && S.dhe3.sideVe === 900);
  check('fusion fuels: densities 0.17 / 0.12 / 0.8, $150 / $600 / $30 per t', S.dd.fuelDens === 0.17 && S.dhe3.fuelDens === 0.12 && S.augment.fuelDens === 0.8 &&
        Econ.FUELS.dd.price === 150 && Econ.FUELS.dhe3.price === 600 && Econ.FUELS.augment.price === 30);

  const gb = Game.create(7, 'pad', { fresh: true, dev: true, build: 'beast' });
  const gm = Econ.state(gb);
  m0 = gb.money; gm.inf = false;
  gb.sh.fuel = 0; gb.money = 100000;
  const qOut = Econ.quote(gb, OUTPOST, 'fuel'), spentOut = Econ.refuel(gb, OUTPOST, { ion: false, rcs: false });
  check('D-He3 is Mochi Hub only: an outpost quotes $0 and fills nothing', !Econ.sellsFuel(OUTPOST, 'dhe3') && Econ.sellsFuel(HUB, 'dhe3') && Econ.sellsFuel(OUTPOST, 'ammonia') &&
        qOut === 0 && spentOut === 0 && gb.sh.fuel === 0);
  const spentHub = Econ.refuel(gb, HUB, { ion: false, rcs: false });
  check('...the Hub fills the Beast: 19.2 t of D-He3 for $11,520', spentHub === 11520 && near(gb.sh.fuel, 19.2), `$${spentHub}`);
  H.run(gb, 2, {});
  const done0 = gb.done.fusion;
  H.run(gb, 30, { keys: ['KeyW'] });
  check('fusion job: a main burn on the Sunflower pays $2,000', done0 === undefined && gb.done.fusion !== undefined && gb.status === 'flying', gb.status);
}


// ---------------- 15. every contract §3.1 id sets exactly its S fields ----------------
{
  const g = fresh();
  const T = {          // id: [frame to fly, { field: value }]
    mule: [null, { frameId: 'mule', frameName: 'Pack Mule', mount: 2, k: 2.5, turnMult: 0.85, towTierMax: 2, length: 11.5, radius: 5 }],
    hauler: [null, { frameId: 'hauler', frameName: 'Hauler', mount: 3, k: 6, turnMult: 0.7, towTierMax: 3, length: 14.5, radius: 6.5 }],
    barge: [null, { frameId: 'barge', frameName: 'Bulk Barge', mount: 4, k: 15, turnMult: 0.55, towTierMax: 3, length: 19, radius: 8.5 }],
    leviathan: [null, { frameId: 'leviathan', frameName: 'Leviathan', mount: 5, k: 40, turnMult: 0.45, towTierMax: 4, length: 26, radius: 11 }],
    bulldog: ['leviathan', { engine: 'bulldog', thrust: 36, engineMount: 2 }], nervasama: ['leviathan', { engine: 'nervasama', engineMount: 3 }],
    pocketsun: ['leviathan', { engine: 'pocketsun', engineMount: 4 }], sunflower: ['leviathan', { engine: 'sunflower', engineMount: 5 }],
    side1: [null, { sideThrust: 1.8, dashBoost: 0, dashCd: 0 }], side2: [null, { sideThrust: 4.5, dashBoost: 4, dashCd: 1.5 }], side3: [null, { sideThrust: 8, dashBoost: 5, dashCd: 1 }],
    tow1: ['leviathan', { towTier: 1, towMax: 80, cableLen: 25, reelV: 0.6 }], tow2: ['leviathan', { towTier: 2, towMax: 800, cableLen: 40, reelV: 1 }],
    tow3: ['leviathan', { towTier: 3, towMax: 6000, cableLen: 60, reelV: 1.5 }], tow4: ['leviathan', { towTier: 4, towMax: 40000, cableLen: 90, reelV: 2.5 }],
    suit1: [null, { suitTier: 1, suitHp: 150, suitArmor: 0, suitMass: 5, walkMult: 1, jumpMult: 1, packCap: 40, fallSafe: 8 }],
    suit2: [null, { suitTier: 2, suitHp: 220, suitArmor: 0.1, suitMass: 20, walkMult: 1, jumpMult: 1, packCap: 40, fallSafe: 9 }],
    suit3: [null, { suitTier: 3, suitHp: 300, suitArmor: 0.15, suitMass: 60, walkMult: 1.25, jumpMult: 1.2, packCap: 80, fallSafe: 11 }],
    suit4: [null, { suitTier: 4, suitHp: 420, suitArmor: 0.25, suitMass: 140, walkMult: 1.4, jumpMult: 1.35, packCap: 130, fallSafe: 15 }],
    sprint1: [null, { sprint: 1.6 }], sprint2: [null, { sprint: 2.2 }],
    roll1: [null, { roll: 1, rollDist: 3, rollT: 0.45, rollIframes: 0.3, rollCd: 1.2, rollAir: 0 }],
    roll2: [null, { roll: 2, rollDist: 4.5, rollT: 0.4, rollIframes: 0.35, rollCd: 0.8, rollAir: 3 }],
    bomb1: [null, { bombs: 2, bombDmg: 30, bombR: 1.8, bombDig: 1.6, bombKg: 0.5, bombCd: 8, bombFuse: 1.8, bombV: 6, bombSticky: 0 }],
    bomb2: [null, { bombs: 3, bombDmg: 50, bombR: 2.4, bombDig: 2.3, bombKg: 1, bombCd: 6, bombFuse: 1.6, bombV: 8, bombSticky: 0 }],
    bomb3: [null, { bombs: 4, bombDmg: 80, bombR: 3.2, bombDig: 3.4, bombKg: 2, bombCd: 4.5, bombFuse: 1.4, bombV: 10, bombSticky: 1 }],
    tether1: [null, { tetherLen: 60, reelA: 1.5 }], tether2: [null, { tetherLen: 100, reelA: 2.5 }], tether3: [null, { tetherLen: 160, reelA: 4 }],
    pack3: [null, { packCap: 160 }], o2c: [null, { o2: 1200 }], jet3: [null, { jet: 7, jetFuel: 18 }], laser4: [null, { laserPower: 6.5, laserRange: 16, laserDps: 85 }],
    xlate1: [null, { translator: 1 }], xlate2: [null, { translator: 2 }],
  };
  const bad = [];
  for (const [id, [frame, want]] of Object.entries(T)) {
    const S = pv(g, (mm) => { if (frame) { mm.owned[frame] = true; mm.frame = frame; } owned(mm, [id]); if (Econ.ENGINES[id]) mm.engine = id; if (Econ.FRAMES[id]) mm.frame = id; });
    for (const [k, v] of Object.entries(want)) if (!near(S[k], v) && S[k] !== v) bad.push(`${id}.${k} = ${S[k]} (want ${v})`);
  }
  check(`every §3.1 id sets its fields (${Object.keys(T).length} ids)`, !bad.length, bad.slice(0, 6).join(', '));
  const E = ['bomb1', 'bomb2', 'bomb3'].map((id) => pv(g, (mm) => owned(mm, [id])).bombE / 1e6);
  check('bomb energy in J: 0.50 / 1.51 / 5.02 MJ (TNT 0.12 / 0.36 / 1.2 kg)', Math.abs(E[0] - 0.50) < 0.005 && Math.abs(E[1] - 1.51) < 0.005 && Math.abs(E[2] - 5.02) < 0.005, E.map((e) => e.toFixed(3)).join(' / '));
  const fu = Object.fromEntries(['dd', 'dhe3', 'augment'].map((f) => [f, pv(g, (mm) => { mm.owned.barge = true; mm.frame = 'barge'; mm.owned.pocketsun = true; mm.engine = 'pocketsun'; mm.fuelOf.pocketsun = f; })]));
  check('fuels dd / dhe3 / augment set fuelId and density', ['dd', 'dhe3', 'augment'].every((f) => fu[f].fuelId === f && fu[f].fuelDens === Econ.FUELS[f].dens));
  const s2 = pv(g, (mm) => { mm.owned.mule = true; mm.frame = 'mule'; owned(mm, ['side2']); });
  check('side thrust and pod mass scale with k: Strafe pods on a Mule 11.25 kN, 0.30 t', near(s2.sideThrust, 11.25) && s2.massParts.some((p) => p[0] === 'Strafe pods' && near(p[1], 0.3)));
  check('suit items add no ship mass (Mecha-Pip, bombs, tether, translator)', near(pv(g, (mm) => owned(mm, ['suit4', 'bomb3', 'tether3', 'xlate2', 'sprint2', 'roll2', 'laser4'])).dry, 1));
}


// ---------------- 16. stock S: every §3.2 field at its default ----------------
{
  const g = fresh(), S = g.S;
  const D = { frameId: 'prospector', frameName: 'Prospector', mount: 1, k: 1, turnMult: 1, towTierMax: 2, sideThrust: 0, sideVe: Math.min(0.85 * S.ve, 900),
              dashBoost: 0, dashT: 0.4, dashCd: 0, towTier: 0, towMax: 0, cableLen: 0, reelV: 0, suitTier: 0, suitArmor: 0, suitMass: 0,
              walkMult: 1, jumpMult: 1, fallSafe: 8, sprint: 1, roll: 0, rollDist: 0, rollT: 0.45, rollIframes: 0, rollCd: 1.2, rollAir: 0,
              bombs: 0, bombDmg: 0, bombR: 0, bombDig: 0, bombE: 0, bombKg: 0.5, bombCd: 8, bombFuse: 1.8, bombV: 6, bombSticky: 0,
              tetherLen: 30, reelA: 1.0, translator: 0 };
  const bad = Object.entries(D).filter(([k, v]) => S[k] !== v).map(([k, v]) => `${k} ${S[k]} (want ${v})`);
  check(`stock S has every §3.2 field at its default (${Object.keys(D).length})`, !bad.length, bad.join(', '));
  check('v3 fields keep their stock values (dry 1, tank 1.4 m³, hold 300, hull 100, 9 m, radius 4, Sparrow)', S.dry === 1 && near(S.tankVol, 1.4) && S.cargoCap === 300 &&
        S.hull === 100 && S.length === 9 && S.radius === 4 && S.engine === 'sparrow' && S.name === 'Prospector' && S.rotAccel === 2.4);
}


// ---------------- 17. crack charges (consumables, haul tab) ----------------
{
  const g = fresh(); g.money = 100000;
  const dry0 = g.S.dry;
  for (let i = 0; i < 8; i++) Econ.buy(g, 'crack1', HUB);
  Econ.buy(g, 'crack2', HUB); Econ.buy(g, 'crack3', HUB);
  const ch = Econ.charges(g);
  check('charges cap at their max (6 Crackers) and add their mass to dry', ch.crack1 === 6 && ch.crack2 === 1 && ch.crack3 === 1 && near(g.S.dry, dry0 + 6 * 0.008 + 0.06 + 0.6) &&
        Econ.canBuy(g, 'crack1', HUB).why === 'max', JSON.stringify(ch));
  check('charges: TNT 5 / 50 / 500 kg = 20.9 / 209 / 2,092 MJ, max 6 / 4 / 2', Econ.CHARGES.crack1.tnt === 5 && Math.abs(Econ.CHARGES.crack2.E - 209.2e6) < 1 &&
        Math.abs(Econ.CHARGES.crack3.E / 1e6 - 2092) < 1 && Econ.CHARGES.crack2.max === 4 && Econ.CHARGES.crack3.max === 2);
  check('charges are sold in the haul tab, not at a suit-only stall', Econ.canBuy(g, 'crack2', { ...HUB, tabs: ['suit', 'sell'] }).why === 'notsold' &&
        Econ.canBuy(g, 'crack2', OUTPOST).ok && Econ.canBuy(g, 'crack2', { ...HUB, tabs: ['services', 'ship'] }).ok);
  const d1 = g.S.dry;
  check('spendCharge uses one and the ship gets lighter; false when out', Econ.spendCharge(g, 'crack3') && Econ.charges(g).crack3 === 0 && near(g.S.dry, d1 - 0.6) &&
        !Econ.spendCharge(g, 'crack3') && !Econ.spendCharge(g, 'nope'));
  check('HUD shows CHARGES (B)', Game.gather(g, 'hudRows').some((r) => r.label === 'CHARGES (B)' && /C×6 S×1/.test(r.val)), Game.gather(g, 'hudRows').map((r) => r.val).join(' | '));
}


// ---------------- 18. dev mode: ∞ money, the Debug Duck anywhere, top-ups, builds ----------------
{
  const g = Game.create(7, 'orbit', { fresh: true, dev: true });
  H.run(g, 2, {});
  check('dev: ∞ money is on by default, the pin holds ≥ $1e9', Econ.isInf(g) && g.money >= 1e9, `$${g.money}`);
  H.run(g, 1, { pressed: ['KeyO'] });
  const stOpen = Econ.state(g).station;
  check('O opens the Debug Duck shop in flight (every tab, kind dev)', g.ui === 'shop' && stOpen && stOpen.id === 'dev' && stOpen.kind === 'dev' &&
        ['dev', 'services', 'sell', 'ship', 'haul', 'suit', 'weapons'].every((t) => stOpen.tabs.includes(t)), stOpen && stOpen.tabs.join());
  const r = Econ.buy(g, 'leviathan', stOpen, { confirm: true }), r2 = Econ.buy(g, 'sunflower', stOpen);
  check('dev shop: frames fit anywhere, buys subtract normally', r.ok && r2.ok && g.S.frameId === 'leviathan' && g.S.engine === 'sunflower' && g.money < 1e9, `$${g.money}`);
  H.run(g, 1, {});
  check('...and one frame later the ∞ pin keeps money ≥ 1e9', g.money >= 1e9, `$${g.money}`);
  H.run(g, 1, { pressed: ['KeyO'] });
  check('O again closes it', !g.ui && !Econ.state(g).station);
  g.sh.fuel = 0.1; g.sh.rcs = 0; g.sh.hull = 5; Econ.state(g).charges.crack1 = 0;
  H.run(g, 1, { pressed: ['KeyU'] });
  check('U tops up fuel, RCS, hull and every charge (toast)', near(g.sh.fuel, g.S.fuel) && g.sh.rcs === g.S.rcs && g.sh.hull === g.S.hull &&
        Object.entries(Econ.CHARGES).every(([id, c]) => Econ.charges(g)[id] === c.max) && g.toasts.some((t) => t.text === 'DEV: TOPPED UP'));
  H.run(g, 1, { pressed: ['KeyI'] });
  check('I toggles ∞ off: back to the dev wallet ($50,000)', !Econ.isInf(g) && g.money === 50000, `$${g.money}`);
  const rb = Econ.buy(g, 'side1', DEV), rc = Econ.canBuy(g, 'barge', { ...DEV, priceMult: 10 });
  check('...real prices again: side1 costs $350, a $180,000 barge says broke', rb.ok && g.money === 49650 && rc.why === 'broke', `${rb.msg} $${g.money}, ${rc.why}`);
  H.run(g, 1, { pressed: ['KeyI'] });
  check('I again: ∞ back on', Econ.isInf(g) && g.money >= 1e9);

  const gi = Game.create(7, 'pad', { fresh: true, dev: true, inf: '0' });
  H.run(gi, 2, {});
  check('?inf=0 starts dev with ∞ off ($50k, the bank job never pays in dev), so broke can be tested', !Econ.isInf(gi) && gi.money === 50000 && gi.done.rich === undefined &&
        Econ.canBuy(gi, 'leviathan', { ...DEV, priceMult: 2 }).why === 'broke', `$${gi.money}`);
  H.run(gi, 1, { pressed: ['KeyK'] });
  check('dev K still adds $5,000 with ∞ off', gi.money === 55000, `$${gi.money}`);

  const gm = Game.create(7, 'pad', { fresh: true, dev: true });
  Econ.grantAll(gm);
  const allMax = Econ.LINES.every((L) => Econ.tierIndex(gm, L.id) === L.tiers.length);
  const M = Econ.metrics(gm, gm.S);
  check('Max everything: Leviathan + Sunflower, every line at max, charges and Orion full', gm.S.frameId === 'leviathan' && gm.S.engine === 'sunflower' && allMax &&
        Object.entries(Econ.CHARGES).every(([id, c]) => Econ.charges(gm)[id] === c.max) && Econ.state(gm).orion === 3 && near(gm.sh.fuel, gm.S.fuel) && gm.status === 'landed',
        `Δv ${M.dv.toFixed(0)} m/s, TWR ${M.twr.toFixed(2)}, dry ${gm.S.dry.toFixed(1)} t`);
  Econ.resetStock(gm, 'ship');
  check('Stock ship: back to a Prospector with a Sparrow (suit kept)', gm.S.frameId === 'prospector' && gm.S.engine === 'sparrow' && gm.S.suitTier === 4 && gm.S.towMax === 0 && near(gm.S.dry, 1));
  Econ.resetStock(gm, 'all');
  check('Stock everything: the suit too', gm.S.suitTier === 0 && gm.S.translator === 0);

  const gb = Game.create(7, 'hub' in Game.SPAWNS ? 'hub' : 'pad', { fresh: true, dev: true, build: 'beast' });
  const Mb = Econ.metrics(gb, gb.S);
  check('?build=beast via g.opts: the Fusion Beast, full tanks', gb.opts && gb.S.frameId === 'leviathan' && gb.S.engine === 'sunflower' && gb.S.fuelId === 'dhe3' &&
        Math.abs(Mb.dv - 4065) < 5 && near(gb.sh.fuel, gb.S.fuel), `Δv ${Mb.dv.toFixed(0)}`);
  const gh = Game.create(7, 'pad', { fresh: true, dev: true, build: 'hauler' });
  check('?build=hauler: Hauler + NERVA-sama on ammonia + Tug claw', gh.S.frameId === 'hauler' && gh.S.engine === 'nervasama' && gh.S.fuelId === 'ammonia' && gh.S.towMax === 6000);
  const gn = Game.create(7, 'pad', { fresh: true, build: 'beast' });
  check('builds are dev only (a normal game ignores ?build=)', gn.S.frameId === 'prospector' && gn.money === 300);
  check('unknown build -> false, nothing changes', !Econ.applyBuild(gh, 'deathstar') && gh.S.frameId === 'hauler');
  Econ.applyBuild(gh, 'suit');
  check('Suit max build: Mecha-Pip, Thunder Pucks, Space yo-yo, Universal Translator', gh.S.suitTier === 4 && gh.S.bombs === 4 && gh.S.tetherLen === 160 && gh.S.translator === 2 && gh.S.frameId === 'hauler');
  check('tycoon is never paid in dev (money 1e9)', (H.run(gh, 2, {}), gh.done.tycoon === undefined && gh.money >= 1e9));
}


// ---------------- 19. jobs, blueprints ----------------
{
  const g = fresh();
  const job = (id) => Game.GOALS.find((x) => x.id === id);
  check('jobs: frame 92 ($500), fusion 98 ($2,000), tycoon 100 ($1)', job('frame').order === 92 && job('frame').reward === 500 && job('fusion').order === 98 &&
        job('fusion').reward === 2000 && job('tycoon').order === 100 && job('tycoon').reward === 1);
  g.money = 250000; H.run(g, 2, {});
  check('tycoon: bank $250,000 outside dev pays exactly $1', g.done.tycoon !== undefined && g.money === 250000 + 1000 + 1, `$${g.money}`);
  let bad = null;
  for (let i = 0; i < 300; i++) { const id = Econ.randomBlueprint(g); if (!id) break; if (Econ.FRAMES[id] || Econ.BY_ID[id].price > 10000) { bad = id; break; } Econ.grant(g, id); }
  check('wreck blueprints never hand out frames or anything over $10,000', !bad && g.S.frameId === 'prospector', bad || `${Object.keys(Econ.state(g).owned).length} owned`);
}


// ---------------- 20. save / load: frame, engine on it, charges ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = fresh(); g.money = 500000;
  for (const id of ['leviathan', 'barge', 'tow1', 'tow2', 'tow3', 'tow4', 'side1', 'crack1', 'crack1', 'crack2', 'suit1', 'suit2', 'suit3', 'xlate1']) Econ.buy(g, id, HUB, { confirm: true });
  Econ.swapFrame(g, 'leviathan', HUB, { confirm: true }); Econ.buy(g, 'sunflower', HUB); Econ.setFuel(g, 'augment', HUB, { confirm: true });
  Game.save(g);
  const g2 = Game.create(7, 'pad');
  const keys = ['dry', 'fuel', 've', 'thrust', 'cargoCap', 'hull', 'towMax', 'sideThrust', 'suitTier', 'translator', 'length', 'radius', 'tankVol'];
  const diff = keys.filter((k) => !near(g2.S[k], g.S[k]));
  check('save/load round-trips the frame, engine, fuel and charges', !diff.length && g2.S.frameId === 'leviathan' && g2.S.engine === 'sunflower' && g2.S.fuelId === 'augment' &&
        Econ.charges(g2).crack1 === 2 && Econ.charges(g2).crack2 === 1 && Econ.state(g2).owned.barge, diff.length ? `differs: ${diff.join(', ')}` : `${g2.S.frameName}, ${g2.S.thrust} kN, charges ${JSON.stringify(Econ.charges(g2))}`);
  store['pocket-orbit-v4'] = JSON.stringify({ v: 4, money: 5, mods: { economy: { owned: ['sunflower'], engine: 'sunflower', frame: 'leviathan', charges: { crack1: 99, crack3: -4, toString: 3 } } } });
  const g3 = Game.create(7, 'pad');
  check('defensive load: an unowned frame is ignored, an engine that does not fit falls back, charges clamp', g3.S.frameId === 'prospector' && g3.S.engine === 'sparrow' &&
        Econ.charges(g3).crack1 === 6 && Econ.charges(g3).crack3 === 0 && finite(g3.S), `${g3.S.frameId} ${g3.S.engine} ${JSON.stringify(Econ.charges(g3))}`);
  store['pocket-orbit-v4'] = '{"v":4,"mods":{"economy":{"frame":"__proto__","charges":"x","owned":["constructor"]}}}';
  const g4 = Game.create(7, 'pad');
  check('prototype-key frame save: stock ship', g4.S.frameId === 'prospector' && finite(g4.S));
  Game.wipeSave();
  delete global.localStorage;
}

// ---------------- 21. the lift guard: no single click grounds you on Mochi ----------------
{
  const g = fresh('orbit'); dockAt(g); g.money = 20000; H.run(g, 1, {});
  const m = Econ.state(g), lift = () => Econ.metrics(g, g.S).twr;
  const T = Econ.frameTrap(g, 'mule', HUB);
  check('frameTrap: Mule on a Sparrow lifts 0.59×, cheapest fix Brick on kerolox ($2,200, 1.15×)', T && Math.abs(T.twr - 0.59) < 0.005 && T.fix.engine === 'brick' &&
        T.fix.fuel === 'kerolox' && T.fix.price === 2200 && T.fix.twr >= Econ.LIFT_OK, T && JSON.stringify(T.fix));
  check('hauler and leviathan traps name a fix too (Bulldog, Pocket Sun)', Econ.frameTrap(g, 'hauler', HUB).fix.engine === 'bulldog' && Econ.frameTrap(g, 'leviathan', HUB).fix.engine === 'pocketsun');
  check('no trap for the frame you fly, nor at an outpost (frames are not fitted there)', !Econ.frameTrap(g, 'prospector', HUB) && !Econ.buyTrap(g, 'mule', OUTPOST));
  const s0 = m.stats.spent, rB = Econ.buyBundle(g, 'mule', HUB);
  check('buyBundle: Mule + Brick in one click, lift ≥ 1.1 on Mochi, paid frame + engine + the kerolox', rB.ok && rB.price === 4700 && g.S.frameId === 'mule' && g.S.engine === 'brick' &&
        g.S.fuelId === 'kerolox' && lift() >= Econ.LIFT_OK && m.stats.spent - s0 === 4700 && near(g.sh.fuel, g.S.fuel), `${rB.msg} spent $${m.stats.spent - s0}`);
  const rE = Econ.equip(g, 'sparrow', HUB);
  check('engine downgrade that grounds you is refused (Sparrow on the Mule: 0.59×)', !rE.ok && rE.why === 'lift' && g.S.engine === 'brick' && /0\.59× with a full tank/.test(rE.msg), rE.msg);
  check('...unless confirmed', Econ.equip(g, 'sparrow', HUB, { confirm: true }).ok && g.S.engine === 'sparrow');
  Econ.equip(g, 'brick', HUB);
  check('...and the climb back up is never blocked', g.S.engine === 'brick');
  g.money = 1e6;
  Econ.buy(g, 'bulldog', HUB, { confirm: true }); Econ.setFuel(g, 'kerolox', HUB);
  const TH = Econ.frameTrap(g, 'hauler', HUB);
  check('Hauler on your Bulldog/kerolox: 1.06× flies but barely, the fix is your own Bulldog on methalox ($0)', TH && TH.twr >= 1 && TH.fix.engine === 'bulldog' &&
        TH.fix.fuel === 'methalox' && TH.fix.price === 0 && /barely leaves the pad/.test(TH.msg) && /With methalox in the Bulldog/.test(TH.msg), TH && TH.msg);
  const rH = Econ.buyBundle(g, 'hauler', HUB);
  check('...bundle = just the frame price; the tank is drained of kerolox and refilled with methalox', rH.ok && rH.price === Econ.priceOf(g, 'hauler', HUB) && g.S.frameId === 'hauler' &&
        g.S.fuelId === 'methalox' && lift() >= Econ.LIFT_OK && near(g.sh.fuel, g.S.fuel), rH.msg);
  const gF = fresh('orbit'); dockAt(gF); gF.money = 1e6; H.run(gF, 1, {});
  const mF = Econ.state(gF); Object.assign(mF.owned, { mule: true, hauler: true, barge: true, nervasama: true }); mF.frame = 'barge'; mF.engine = 'nervasama'; mF.fuelOf.nervasama = 'ammonia';
  Game.recalc(gF);
  const rF = Econ.setFuel(gF, 'lh2', HUB);
  check('fuel swap that grounds you is refused (Barge + NERVA-sama: ammonia 1.01× -> LH2 0.88×)', !rF.ok && rF.why === 'lift' && gF.S.fuelId === 'ammonia' && /0\.88×/.test(rF.msg), rF.msg);
  check('...unless confirmed', Econ.setFuel(gF, 'lh2', HUB, { confirm: true }).ok && gF.S.fuelId === 'lh2');

  const gC = fresh(); gC.money = 1e4;
  const c1 = Econ.buy(gC, 'crack3', HUB), c2 = Econ.buy(gC, 'crack3', HUB);
  check('charges count: one Rock Opera (0.6 t) on a Prospector flies, the second is refused (0.97×)', c1.ok && !c2.ok && c2.why === 'lift' && Econ.charges(gC).crack3 === 1 &&
        /lift on Mochi drops to 0\.9\d×/.test(c2.msg), c2.msg);
  check('...unless confirmed', Econ.buy(gC, 'crack3', HUB, { confirm: true }).ok && Econ.charges(gC).crack3 === 2);
  const gU = Game.create(7, 'pad', { fresh: true, dev: true }); H.run(gU, 2, {});
  H.run(gU, 1, { pressed: ['KeyU'] });
  check('dev U on a Prospector racks Crackers and Thumpers, leaves the Rock Operas (says so)', Econ.charges(gU).crack1 === 6 && Econ.charges(gU).crack2 === 4 && Econ.charges(gU).crack3 === 0 &&
        Econ.metrics(gU, gU.S).twr >= Econ.LIFT_OK && gU.toasts.some((t) => /NO ROCK OPERA: TOO HEAVY FOR MOCHI/.test(t.text)), JSON.stringify(Econ.charges(gU)));
  check('dev "fill every charge" still racks them all on purpose', (Econ.fillCharges(gU, true), Econ.charges(gU).crack3 === 2));

  const gS = fresh('orbit'); dockAt(gS); gS.money = 1e6; H.run(gS, 1, {});
  Econ.buy(gS, 'mule', HUB, { confirm: true }); gS.sh.fuel = 0; H.run(gS, 1, {});
  const safe = Econ.safeFill(gS), hS = Game.mods.find((x) => x.id === 'economy').hint(gS);
  check('a grounded Mule docked empty: the hint says how far to fill (lift ≥ 1.1 at that fill)', safe > 0 && safe < 1 && Econ.liftNow(gS, safe * gS.S.fuel) >= Econ.LIFT_OK &&
        hS && /too heavy to take off from Mochi/.test(hS.text) && hS.text.includes(`${Math.floor(100 * safe)}%`), `${(100 * safe).toFixed(0)}%: ${hS && hS.text}`);
}

// ---------------- 22. small honest fixes ----------------
{
  const g = fresh(); g.money = 1e4;
  const t0 = Econ.canBuy(g, 'turret', HUB), rt = Econ.buy(g, 'turret', HUB);
  Econ.buy(g, 'gun1', HUB);
  check('turret needs a Pea shooter first (locked, says so), then sells', t0.why === 'locked' && t0.after === 'gun1' && /first/.test(rt.msg) && Econ.canBuy(g, 'turret', HUB).ok, rt.msg);
  g.sh.rcs = 0.5 * g.S.rcs; const r0 = g.sh.rcs, cap0 = g.S.rcs;
  Econ.buy(g, 'rcs1', HUB);
  check('bigger RCS tanks arrive full (the new capacity, not a bill)', g.S.rcs > cap0 && near(g.sh.rcs, r0 + g.S.rcs - cap0), `${g.sh.rcs.toFixed(1)} / ${g.S.rcs}`);
  const gR = Game.create(7, 'pad', { fresh: true }); gR.money = 25000; H.run(gR, 2, {});
  check('the $20,000 bank job pays outside dev', gR.done.rich !== undefined);
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  store['pocket-orbit-v4'] = '{"v":4,"mods":{"economy":{"owned":["brick"],"engine":"brick","fuelOf":{"brick":"toString","sparrow":"__proto__","toString":"kerolox"}}}}';
  const g4 = Game.create(7, 'pad');
  check('prototype-key fuels in a save: ignored, engines keep a fuel they burn', g4.S.engine === 'brick' && Object.keys(Econ.ENGINES.brick.fuels).includes(g4.S.fuelId) && finite(g4.S),
        `${g4.S.engine} on ${g4.S.fuelId}`);
  Game.wipeSave();
  delete global.localStorage;
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
