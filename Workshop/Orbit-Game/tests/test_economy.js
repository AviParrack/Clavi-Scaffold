// ======================================================================
//  ECONOMY TESTS  —  catalog, stats from upgrades (honest mass), the
//  engine x fuel x tank table, buying, selling per station, services,
//  Orion pulse, tow fees, blueprints, save/load, shop pause.
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
const HUB = { id: 'hub', name: 'Ceres Hub', kind: 'hub', keeper: 'Mo', buy: {}, tabs: ['services', 'sell', 'ship', 'suit', 'weapons'], fuelMult: 1 };
const portAt = (g, r = 420) => {
  const c = g.w.byId.ceres;
  return (t) => { const n = Math.sqrt(c.mu / r ** 3), th = n * t; return [r * Math.cos(th), r * Math.sin(th), -r * n * Math.sin(th), r * n * Math.cos(th)]; };
};
const dockAt = (g) => Game.dock(g, { name: 'Test Port', state: portAt(g), ang: Math.PI / 2 });


// ---------------- 0. registry & stock ship ----------------
{
  const g = fresh(), dv = Physics.deltaV(g.sh, g.S), twr = g.S.thrust / (Physics.mass(g.sh, g.S) * g.w.byId.ceres.g);
  check('economy + shop registered, Econ defined', typeof Econ !== 'undefined' && Game.mods.some((m) => m.id === 'economy') && Game.mods.some((m) => m.id === 'shop'));
  check('stock Prospector matches the spec (131 m/s, TWR 1.46)', near(dv, 131.3, 2e-3) && near(twr, 1.458, 3e-3) && g.S.cargoCap === 300 && g.money === 300,
        `dv ${dv.toFixed(1)} m/s, TWR ${twr.toFixed(2)}, hold ${g.S.cargoCap} kg, $${g.money}`);
  check('jobs added: sell 40, upgrade 50, orion 80, rich 99', ['sell', 'upgrade', 'orion', 'rich'].every((id) => Game.GOALS.some((x) => x.id === id)),
        Game.GOALS.map((x) => `${x.order}:${x.id}`).join(' '));
  const ids = Econ.CATALOG.map((c) => c.id);
  check('catalog: unique ids, names, prices, one-liners, tabs', new Set(ids).size === ids.length &&
        Econ.CATALOG.every((c) => c.name && c.price > 0 && c.desc && ['ship', 'suit', 'weapons'].includes(c.cat)), `${ids.length} items`);
  check('mass parts add up to the dry mass', near(g.S.massParts.reduce((s, p) => s + p[1], 0), g.S.dry), JSON.stringify(g.S.massParts));
}


// ---------------- 1. the engine x fuel x tank table ----------------
{
  const g = fresh(), tanks = [null, 'tank1', 'tank2', 'tank3', 'tank4'], gC = g.w.byId.ceres.g;
  const cell = (eid, f, tank) => Econ.metrics(g, Econ.previewS(g, (m) => {
    m.owned[eid] = true; m.engine = eid; m.fuelOf[eid] = f;
    for (let i = 1; i < tanks.length; i++) if (tanks[i] && tanks.indexOf(tank) >= i) m.owned[tanks[i]] = true;
  }));
  console.log('\nINFO  delta-v [m/s] / TWR on Ceres, full tank, empty hold     tank volume ->');
  console.log(`INFO  ${'engine'.padEnd(11)} ${'fuel'.padEnd(16)} ${'Isp'.padStart(5)}   ` + [1.4, 2.4, 4.0, 6.5, 9.0].map((v) => `${v.toFixed(1)} m³`.padStart(12)).join(''));
  const T = {};
  for (const [eid, e] of Object.entries(Econ.ENGINES)) for (const f of Object.keys(e.fuels)) {
    const row = tanks.map((tk) => cell(eid, f, tk));
    T[`${eid}/${f}`] = row;
    console.log(`INFO  ${e.name.padEnd(11)} ${Econ.FUELS[f].name.padEnd(16)} ${row[0].isp.toFixed(0).padStart(4)}s   ` +
                row.map((M) => `${M.dv.toFixed(0).padStart(5)} / ${M.twr.toFixed(2)}`.padStart(12)).join(''));
  }
  for (const x of Object.keys(Econ.ION_FUELS)) {
    const S = Econ.previewS(g, (m) => { m.owned.whisper = true; m.ionFuel = x; }), M = Econ.metrics(g, S);
    console.log(`INFO  ${'Whisper ion'.padEnd(11)} ${Econ.ION_FUELS[x].name.padEnd(16)} ${M.ionIsp.toFixed(0).padStart(4)}s   ion dv ${M.iondv.toFixed(0)} m/s on a stock ship, ` +
                `ion TWR on Ceres ${(S.ionThrust / (M.full * gC)).toFixed(3)}`);
  }
  console.log('');
  const stock = T['sparrow/methalox'][0];
  check('Brick lifts off Ceres hard (TWR > 2.5, stock tank)', T['brick/kerolox'][0].twr > 2.5 && T['brick/hypergolic'][0].twr > 2.5,
        `kerolox ${T['brick/kerolox'][0].twr.toFixed(2)}, hypergolic ${T['brick/hypergolic'][0].twr.toFixed(2)}`);
  check('NERVA + big tank: delta-v > 2x stock', T['nerva/lh2'][4].dv > 2 * stock.dv && T['nerva/ammonia'][4].dv > 2 * stock.dv,
        `LH2 ${T['nerva/lh2'][4].dv.toFixed(0)}, ammonia ${T['nerva/ammonia'][4].dv.toFixed(0)} vs 2 x ${stock.dv.toFixed(0)} m/s`);
  const ionS = Econ.previewS(g, (m) => { m.owned.whisper = true; }), ionM = Econ.metrics(g, ionS);
  check('ion drive alone cannot lift off Ceres', ionS.ionThrust / (ionM.full * gC) < 1 && ionM.iondv > 100, `TWR ${(ionS.ionThrust / (ionM.full * gC)).toFixed(3)}, ion dv ${ionM.iondv.toFixed(0)} m/s`);
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
  check('buying Brick equips it on its furthest fuel (hypergolic) and fills up', r.ok && S.engine === 'brick' && S.thrust === 16 && S.ve === 130 &&
        S.fuelId === 'hypergolic' && near(S.fuel, 1.4 * 1.3) && near(g.sh.fuel, S.fuel) && g.money === 20000 - cost,
        `${S.engineName} ${S.thrust} kN ve ${S.ve} on ${S.fuelType}, fuel ${g.sh.fuel.toFixed(2)} t, $${g.money}`);
  const m0 = g.money, f = Econ.setFuel(g, 'kerolox', HUB);
  check('switch to kerolox: vents, refills, ve 125', f.ok && f.drained && g.S.ve === 125 && near(g.sh.fuel, 1.4 * 1.2) && g.money === m0 - Math.ceil(1.68 * 22),
        `paid $${m0 - g.money}`);
  check('best fuel: Kestrel on a stock tank starts on methalox, NERVA on a 4 m³ tank on hydrogen',
        Econ.bestFuel(g, 'kestrel') === 'methalox' && Econ.metrics(g, Econ.previewS(g, (m) => { m.owned.tank2 = true; })) &&
        Econ.previewS(g, (m) => { m.owned.tank1 = m.owned.tank2 = true; }) && (() => { Econ.install(g, 'tank1'); Econ.install(g, 'tank2'); const f2 = Econ.bestFuel(g, 'nerva');
          Econ.state(g).owned.tank1 = Econ.state(g).owned.tank2 = false; Game.recalc(g); return f2 === 'lh2'; })());
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
  check('ion drive fitted: S.ionThrust / ionVe / ionTank, X works', g.S.ionThrust === 0.25 && g.S.ionVe === 1300 && near(g.S.ionTank, 0.4), `tank ${g.S.ionTank} t`);
  Econ.refuel(g, HUB);
  const x0 = g.money, sx = Econ.setIonFuel(g, 'krypton', HUB);
  check('switching ion fuel to krypton vents & refills the ion tank', sx.ok && g.S.ionVe === 1500 && near(g.sh.xe, 0.25 * 0.9) && x0 - g.money === Math.ceil(0.225 * 160));
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

  const gw = fresh('orbit'); gw.everFlew = true; Object.assign(gw.sh, { x: 0, y: 1300, vx: 0, vy: 0 });
  Econ.state(gw).orion = 1; Game.recalc(gw); gw.warpIdx = CONFIG.sim.warps.length - 1;
  H.run(gw, 3, {});
  const warpBefore = gw.warp;
  H.run(gw, 3, { pressed: ['KeyN'] });
  check('fired at 64x warp: kick lands, warp drops to 1x, no NaN', warpBefore === 64 && gw.warp === 1 && Econ.state(gw).orion === 0 && finite(gw.sh), `warp ${warpBefore} -> ${gw.warp}`);
}
{
  const g = fresh('pad'), b = g.w.byId.ceres, T = Terrain.of(b);
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
  const g = fresh(); g.money = 1000;
  Game.respawn(g, 'tow');
  const tow = 1000 - g.money;
  const g2 = fresh(); g2.money = 1000;
  Game.respawn(g2, 'crash');
  const crash = 1000 - g2.money;
  check('tow fee $100-250, crash costs more', tow >= 100 && tow <= 250 && crash > tow && crash <= 250, `tow $${tow}, crash $${crash}`);
  const g3 = fresh(); g3.money = 37; Game.respawn(g3, 'crash');
  const g4 = fresh(); g4.money = 0; Game.respawn(g4, 'tow');
  check('tow fee never takes you below $0', g3.money === 0 && g4.money === 0, `$37 -> $${g3.money}, $0 -> $${g4.money}`);
  const g5 = fresh(); g5.money = 99999;
  for (const id of ['tank4', 'cargo3', 'hull3', 'armor3']) Econ.install(g5, id);                 // 9 t of methalox: an 11 t ship
  Econ.refuel(g5, HUB); Econ.repair(g5, HUB);
  const m5 = g5.money; Game.respawn(g5, 'crash');
  check('fee capped at $250 for a heavy ship (tanks full)', m5 - g5.money === 250, `$${m5 - g5.money}`);
  const gT = fresh(); gT.money = 1000; gT.sh.fuel = 0; gT.sh.rcs = 0; gT.sh.hull = 40;
  Game.respawn(gT, 'tow');
  const want = 110 + Math.ceil(gT.S.fuel * Econ.fuelPrice(gT, HUB) + gT.S.rcs * Econ.rcsPrice(HUB) + 60 * Econ.repairPrice(HUB) - 1e-6);
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
  store['pocket-orbit-v3'] = JSON.stringify({ v: 3, money: 5, mods: { economy: { owned: ['warp9', 'tank1', null], engine: 'nerva', fuelOf: { sparrow: 'plutonium' }, orion: 99, stats: 'x' } } });
  const g3 = Game.create(7, 'pad');
  check('garbage save: ignored safely', g3.S.engine === 'sparrow' && g3.S.fuelId === 'methalox' && Econ.state(g3).orion === 3 && g3.S.tankVol === 2.4 && finite(g3.S),
        `${g3.S.engine}, orion ${Econ.state(g3).orion}`);
  store['pocket-orbit-v3'] = '{"v":3,"money":5,"mods":{"economy":{"owned":["toString","__proto__","constructor"],"engine":"toString","fuelOf":{"toString":"x","__proto__":{"a":1}},"ionFuel":"constructor"}}}';
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
  check('no stations module: F on the Ceres pad opens the pad depot', p && gp.ui === 'shop' && Econ.state(gp).station.name === 'Ceres Pad Depot');
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
  const twr = Econ.twrOn(gh, gh.w.byId.ceres);
  check('too heavy on the pad -> lift-off hint', twr < 1 && /Too heavy/.test(Game.hint(gh)), `TWR ${twr.toFixed(2)}: ${Game.hint(gh)}`);
  const f0 = gh.sh.fuel;
  let i = 0; for (; i < 60 * 300 && gh.status === 'landed'; i++) H.run(gh, 1, { keys: ['KeyW'] });
  check('holding W burns fuel on the pad until it lifts off', gh.status === 'flying' && gh.sh.fuel < f0 && Econ.twrOn(gh, gh.w.byId.ceres) >= 0.99,
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

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
