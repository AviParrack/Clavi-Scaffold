// ======================================================================
//  HAUL TESTS  —  node tests/test_haul.js
//  rock types and values, the rope, grapple and tow, burnWarp, cracking,
//  selling, chipping, free rocks (save / load, craters, long steps)
// ======================================================================

const H = require('./harness');
H.load({ only: 'stations,haul,gear' });

// 'gear' stands in for econ's stats hook (contract §3), so these tests do not depend on the shop
const TOW2 = { towTier: 2, towMax: 800, cableLen: 40, reelV: 1.0 };
let GEAR = { ...TOW2 };
Game.register({ id: 'gear', stats(g, S) { Object.assign(S, GEAR); } });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = 'swarm') => Game.create(7, spawn, { fresh: true });
const TNT = 4.184e6, ITEMS = CONFIG.items;
const mOf = (g, rk) => Physics.mass(g.sh, g.S);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// a rock r m of the given type, cable m ahead of the nose, matched: G, and the harpoon flies
function hooked(g, type, r, cable = 8) {
  const rk = Haul.devRock(g, type, r), sh = g.sh, D = r + g.S.radius + cable;
  Object.assign(rk, { x: sh.x + Math.cos(sh.ang) * D, y: sh.y + Math.sin(sh.ang) * D, vx: sh.vx, vy: sh.vy, gem: null });
  H.run(g, 1, { pressed: ['KeyG'] }); H.run(g, 25, {});
  return rk;
}
// shift the ship and every free rock so the ship sits at p = [x, y, vx, vy], all co-moving with it
function moveTo(g, p) {
  const dx = p[0] - g.sh.x, dy = p[1] - g.sh.y;
  for (const o of [g.sh, ...Haul.free(g)]) { o.x += dx; o.y += dy; o.vx = p[2]; o.vy = p[3]; }
  Game.refresh(g);
}


// ---------------- 1. rock types, mass and value (progression §3.2) ----------------
{
  const g = fresh(), at = (type, r) => { const rk = Haul.devRock(g, type, r); rk.gem = null; return Haul.info(g, rk); };
  const a = at('gravel', 4);
  check('gravel r 4 m: 509 t, $1,019 at the Hub', Math.round(a.m) === 509 && a.value === 1019, `${a.m.toFixed(2)} t, ${a.oreKg.toFixed(1)} kg iron, $${a.value}`);
  const b = at('slush', 2), c = at('clank', 3), d = at('sparkle', 1.5);
  check('table spots: slush r 2, clank r 3, sparkle r 1.5', Math.round(b.m) === 40 && b.value === 161 && Math.round(c.m) === 452 && c.value === 5429 && Math.round(d.m) === 42 && d.value === 1272,
        `${b.m.toFixed(0)} t $${b.value} · ${c.m.toFixed(0)} t $${c.value} · ${d.m.toFixed(0)} t $${d.value}`);
  const types = g.w.rocks.map((rk) => Haul.typeOf(g, rk)), again = g.w.rocks.map((rk) => Haul.typeOf(fresh(), rk));
  const big = g.w.rocks.filter((rk, i) => (types[i] === 'clank' && rk.r > 6) || (types[i] === 'sparkle' && rk.r > 4)).length;
  const kiwi = g.w.rocks.filter((rk) => rk.host.id === 'kiwi'), slushy = kiwi.filter((rk) => Haul.typeOf(g, rk) === 'slush').length;
  const count = (t) => types.filter((x) => x === t).length;
  check('types are deterministic, size caps hold, Kiwi ring is slushy', types.every((t, i) => t === again[i]) && big === 0 && slushy > kiwi.length / 2,
        `gravel ${count('gravel')}, slush ${count('slush')}, clank ${count('clank')}, sparkle ${count('sparkle')}; Kiwi ${slushy}/${kiwi.length} slush`);
  const value = g.w.rocks.reduce((s, rk) => s + Haul.info(g, rk).value, 0);
  check('the belt holds millions in rock (supply check, §3.9)', value > 3e6, `$${(value / 1e6).toFixed(1)}M in ${g.w.rocks.length} rocks`);
}


// ---------------- 2. the rope: exact momentum and centre of mass ----------------
{
  const a = { x: 0, y: 0, vx: 0.3, vy: -0.1 }, b = { x: 30, y: 4, vx: 1.6, vy: 1.7 }, mA = 2.4, mB = 509.36, M = mA + mB, h = 1 / 240;
  const P = () => [mA * a.vx + mB * b.vx, mA * a.vy + mB * b.vy], C = () => [(mA * a.x + mB * b.x) / M, (mA * a.y + mB * b.y) / M];
  const P0 = P(), C0 = C();
  let L = 25, J = 0, dP = 0, dC = 0, over = 0;
  for (let i = 1; i <= 1000; i++) {
    for (const o of [a, b]) { o.x += o.vx * h; o.y += o.vy * h; }
    J += Haul.rope(a, mA, b, mB, L);
    const p = P(), c = C();
    dP = Math.max(dP, Math.hypot(p[0] - P0[0], p[1] - P0[1]));
    dC = Math.max(dC, Math.hypot(c[0] - C0[0] - P0[0] / M * i * h, c[1] - C0[1] - P0[1] / M * i * h));
    over = Math.max(over, Math.hypot(b.x - a.x, b.y - a.y) - L);
    L = Math.max(5, L - 0.6 * h);                                                 // reeling in, too
  }
  check('rope: momentum conserved to 1e-9 over 1,000 steps', dP < 1e-9 && J > 1, `max |ΔP| ${dP.toExponential(1)} t·m/s, Σ impulse ${J.toFixed(1)} t·m/s`);
  check('rope: centre of mass coasts straight to 1e-9', dC < 1e-9, `max CoM drift ${dC.toExponential(1)} m`);
  check('rope: inextensible (never longer than the cable)', over < 1e-9, `max stretch ${over.toExponential(1)} m`);
  const pin = { x: 0, y: 0, vx: 0, vy: 0 }, r = { x: 10, y: 0, vx: 1, vy: 0 };
  Haul.rope(pin, Infinity, r, 50, 8);
  check('rope: a landed or docked ship is never yanked', pin.x === 0 && pin.vx === 0 && near(r.x, 8, 1e-12) && r.vx < 0, `rock now ${r.vx.toFixed(2)} m/s`);
}


// ---------------- 3. grapple a rail rock: it leaves its rail, same id, same place ----------------
{
  const g = fresh(), sh = g.sh, S = g.S, sw = g.w.swarms.find((s) => s.rocks.length);
  const rk = g.w.rocks.filter((r) => r.swarm >= 0 && !r.gone && Haul.info(g, r).m < 700 && Haul.info(g, r).m > 50)[0];
  const [rx, ry, rvx, rvy] = World.rockState(g.w, rk, g.t), th = 1.1, D = rk.r + S.radius + 12;
  Object.assign(sh, { x: rx - Math.cos(th) * D, y: ry - Math.sin(th) * D, vx: rvx, vy: rvy, ang: th, omega: 0 });
  Game.refresh(g);
  const inf = Haul.info(g, rk);
  H.run(g, 2, {});
  const aimHint = Game.hint(g);
  H.run(g, 1, { pressed: ['KeyG'] }); H.run(g, 25, {});
  const fr = Haul.free(g).find((r) => r.id === rk.id), [x1, y1] = World.rockState(g.w, rk, g.t), ti = Haul.towInfo(g);
  check('G harpoons a rail rock: rail rock gone, free copy towed', rk.gone && fr && fr.towed && ti && ti.id === rk.id && g.mod.haul.gone.includes(rk.id),
        `rock ${rk.id} (${sw ? 'swarm' : ''}) ${inf.type} ${inf.m.toFixed(0)} t, cable ${ti ? ti.len.toFixed(1) : '-'} m`);
  check('...the copy starts on the rail, keeps type, mass and ore', fr && Math.hypot(fr.x - x1, fr.y - y1) < 0.01 && fr.type === inf.type && fr.m === inf.m && fr.oreKg === inf.oreKg,
        fr ? `${Math.hypot(fr.x - x1, fr.y - y1).toExponential(1)} m off the rail after 0.4 s` : 'none');
  check('...and the hint taught G first', /Press G/.test(aimHint), aimHint);
  H.run(g, 1, { pressed: ['KeyG'] });
  check('G again lets go', !Haul.towInfo(g) && !fr.towed, '');

  const g2 = fresh(), big = Haul.devRock(g2, 'gravel', 10);
  H.run(g2, 1, {}); H.run(g2, 1, { pressed: ['KeyG'] }); H.run(g2, 25, {});
  const toast = g2.toasts.map((t) => t.text).join(' | ');
  check('a rock over the rating is refused (TOO BIG ... CRACK IT)', !Haul.towInfo(g2) && /TOO BIG: 7,959 t GRAVEL > 800 t/.test(toast), toast);
}


// ---------------- 4. towing: the rock really is on the other end of the rope ----------------
{
  const mk = () => { const g = fresh(); const rk = hooked(g, 'gravel', 4); g.sh.ang += Math.PI; Game.setWarp(g, 16); return [g, rk]; };
  const [g, rk] = mk(), [c, ck] = mk();                                        // c coasts: the gravity reference
  const f0 = g.sh.fuel, m0 = mOf(g);
  let tension = 0, warp = 0;
  for (let i = 0; i < 240; i++) { H.run(g, 1, { keys: ['KeyW'] }); H.run(c, 1, {}); if (i === 120) { tension = g.mod.haul.tension; warp = g.warp; } }
  const m1 = mOf(g), dvS = Math.hypot(g.sh.vx - c.sh.vx, g.sh.vy - c.sh.vy), dvR = Math.hypot(rk.vx - ck.vx, rk.vy - ck.vy);
  const cc = Math.cos(Haul.CANT), want = cc * g.S.ve * Math.log((m0 + rk.m) / (m1 + rk.m)), F = cc * g.S.thrust * rk.m / (m1 + rk.m);
  check('towing burn: ship and rock gain the rocket-equation Δv of both', near(dvS, want, 0.01 * want) && near(dvR, want, 0.01 * want) && near(g.fired.cant, Haul.CANT, 1e-12),
        `ship ${dvS.toFixed(3)}, rock ${dvR.toFixed(3)}, cos(${(Haul.CANT * 180 / Math.PI).toFixed(0)}°) ve ln((m0+M)/(m1+M)) ${want.toFixed(3)} m/s on ${(f0 - g.sh.fuel).toFixed(2)} t`);
  check('...rope tension = cos(cant) thrust × M / (m + M)', near(tension, F, 0.02 * F), `${tension.toFixed(2)} kN vs ${F.toFixed(2)} kN`);
  const dvRow = Game.gather(g, 'hudRows').find((r) => r.label === 'Δv W/ ROCK'), dvHere = cc * g.S.ve * Math.log((m1 + rk.m) / (m1 + rk.m - g.sh.fuel));
  check('...the Δv W/ ROCK row carries the same cos loss', dvRow && dvRow.val.startsWith(dvHere.toFixed(1)), dvRow ? `${dvRow.val} vs ${dvHere.toFixed(1)}` : 'no row');
  check('burnWarp: a towing burn (0.014 m/s²) runs at 16x', warp === 16 && g.stepDt === CONFIG.sim.dt, `warp ${warp}x, steps ${(g.stepDt * 1000).toFixed(2)} ms`);
  const n = fresh(); Game.setWarp(n, 16); H.run(n, 3, { keys: ['KeyW'] });
  const l = fresh(); hooked(l, 'gravel', 1); l.sh.ang += Math.PI; Game.setWarp(l, 16); H.run(l, 3, { keys: ['KeyW'] });
  check('...and still caps a normal burn (and a light rock) at 1x', n.warp === 1 && l.warp === 1, `no rock ${n.warp}x (${n.warpWhy}), 8 t rock ${l.warp}x`);
  const s = fresh(); hooked(s, 'gravel', 4); Game.setWarp(s, 1024); H.run(s, 3, {});
  check('coasting with a rock in tow caps at 64x', s.warp === 64 && /rock in tow/.test(s.warpWhy), `${s.warp}x: ${s.warpWhy}`);
  const rows = Game.gather(g, 'hudRows').map((r) => r.label).join(',');
  check('TOW rows on the ship panel', /TOW/.test(rows) && /CABLE/.test(rows) && /Δv W\/ ROCK/.test(rows), rows);
  Game.setWarp(s, 1); H.run(s, 1, {}); const len0 = s.mod.haul.tow.len; H.run(s, 120, { keys: ['KeyQ'] });
  check('Q reels in at reelV', near(len0 - s.mod.haul.tow.len, 2.0, 0.05), `${len0.toFixed(2)} -> ${s.mod.haul.tow.len.toFixed(2)} m in 2 s`);
}


// ---------------- 5. cracking (progression §3.5) ----------------
{
  const g = fresh(), r = Math.cbrt(500 / (1.9 * 4 / 3 * Math.PI)), rk = Haul.devRock(g, 'gravel', r), E = 5 * TNT, M = rk.m;
  rk.gem = 'salt';
  const v0 = [rk.vx, rk.vy], ore0 = rk.oreKg, n0 = g.pickups.length;
  const res = Haul.blast(g, rk.x + rk.r, rk.y, E);
  const kids = Haul.free(g).filter((k) => k.id > rk.id);
  const sm = kids.reduce((s, k) => s + k.m, 0), px = kids.reduce((s, k) => s + k.m * (k.vx - v0[0]), 0), py = kids.reduce((s, k) => s + k.m * (k.vy - v0[1]), 0);
  const KE = kids.reduce((s, k) => s + 0.5 * k.m * 1000 * ((k.vx - v0[0]) ** 2 + (k.vy - v0[1]) ** 2), 0);
  const cx = kids.reduce((s, k) => s + k.m * k.x, 0) / sm, cy = kids.reduce((s, k) => s + k.m * k.y, 0) / sm;
  check('Cracker on 500 t gravel: 2-5 fragments, Σm = M', res.cracked === 1 && kids.length >= 2 && kids.length <= 5 && near(sm, M, 1e-9 * M), `${kids.length}: ${kids.map((k) => k.m.toFixed(1)).join(' + ')} = ${sm.toFixed(6)} of ${M.toFixed(6)} t`);
  check('...net momentum ≈ 0, KE = 3 % of E ± 1 %, CoM kept', Math.hypot(px, py) < 1e-9 * M && near(KE, 0.03 * E, 0.01 * 0.03 * E) && Math.hypot(cx - rk.x, cy - rk.y) < 1e-9,
        `|p| ${Math.hypot(px, py).toExponential(1)} t·m/s, KE ${(KE / 1e3).toFixed(1)} kJ vs ${(0.03 * E / 1e3).toFixed(1)}`);
  const pk = g.pickups.slice(n0), ore = pk.filter((p) => p.item === 'iron').reduce((s, p) => s + p.qty, 0);
  const oreKids = kids.reduce((s, k) => s + k.oreKg, 0);
  check('...ore is conserved: seam pickups + fragments, and the gem pops out', near(ore + oreKids, ore0, 1e-6) && ore === 30 && pk.some((p) => p.item === 'salt'),
        `${ore} kg seam + ${oreKids.toFixed(2)} kg in pieces = ${ore0.toFixed(2)} kg`);
  check('...and pays the crack job', g.done.crack !== undefined, '');

  const g2 = fresh(), hard = Haul.devRock(g2, 'clank', 4), m2 = hard.m;
  const r2 = Haul.blast(g2, hard.x + hard.r, hard.y, 5 * TNT);
  check('E < Q·M does not crack (TINK.)', r2.cracked === 0 && Haul.free(g2).includes(hard) && hard.m === m2 && g2.popups.some((p) => p.text === 'TINK.'), `1,072 t clank needs ${(150 * m2 * 1000 / 1e6).toFixed(0)} MJ, got 21`);

  const g3 = fresh(); g3.mod.haul.stock = { crack1: 2, crack2: 0, crack3: 0 };
  const t3 = hooked(g3, 'gravel', r);
  H.run(g3, 1, { pressed: ['KeyB'] });
  const planted = g3.mod.haul.charges.length === 1 && !Haul.towInfo(g3) && g3.mod.haul.stock.crack1 === 1;
  g3.sh.vx += 3 * Math.cos(g3.sh.ang + Math.PI); g3.sh.vy += 3 * Math.sin(g3.sh.ang + Math.PI);   // back off
  H.run(g3, 60 * 5 + 10, {});
  check('B plants the smallest charge that cracks, cuts the rope, 5 s fuse', planted && !Haul.free(g3).includes(t3) && Haul.free(g3).length >= 2, `${Haul.free(g3).length} pieces after the fuse`);
  const big = Haul.devRock(g3, 'clank', 4); g3.mod.haul.stock.crack1 = 3;
  big.x = g3.sh.x + Math.cos(g3.sh.ang) * 9; big.y = g3.sh.y + Math.sin(g3.sh.ang) * 9; big.vx = g3.sh.vx; big.vy = g3.sh.vy;
  H.run(g3, 1, { pressed: ['KeyB'] });
  const msg = g3.toasts.map((t) => t.text).join(' | ');
  check('...and says which charge a bigger rock needs', /NEED A SPLITTER: 1,072 t CLANK NEEDS 161 MJ/.test(msg) && g3.mod.haul.stock.crack1 === 3, msg);
}


// ---------------- 6. selling: the Crusher and the stations ----------------
{
  const sellAt = (id, type) => {
    const g = fresh(), rk = hooked(g, type, 3), sp = () => Haul.sellPoints(g).find((p) => p.id === id);
    const p = sp(); moveTo(g, [p.x + p.r + 25, p.y, p.vx, p.vy]);
    H.run(g, 1, {});
    const prompt = g.prompts.find((q) => q.key === 'KeyF'), want = Math.round(rk.oreKg * ITEMS[Haul.TYPES[type].ore].price * Haul.BUY[id][type]);
    const m0 = g.money, s0 = g.mod.haul.stats.sold;
    H.run(g, 1, { pressed: ['KeyF'] });
    return { g, rk, prompt, want, paid: g.mod.haul.stats.sold - s0, money: g.money - m0 };
  };
  const a = sellAt('crusher', 'gravel');
  check('sale at the Crusher pays oreKg × price × 0.8', a.paid === a.want && a.money === a.want + 250 && !Haul.free(a.g).includes(a.rk),
        `${a.rk.oreKg.toFixed(1)} kg iron × $1.6 × 0.8 = $${a.want}; paid $${a.paid} (+ $250 haul job)`);
  check('...the F prompt shows the value first', a.prompt && /Sell .* to The Crusher for \$/.test(a.prompt.text) && a.prompt.text.includes(`$${a.want}`), a.prompt ? a.prompt.text : 'no prompt');
  const b = sellAt('outpost', 'slush'), c = sellAt('rusts', 'clank');
  check('Kiwi Outpost pays 1.1x for slush, Rust\'s 1.15x for clank', b.paid === b.want && c.paid === c.want && b.want > 0 && c.want > 0, `slush $${b.paid}, clank $${c.paid}`);

  const g = fresh(), x = Haul.devRock(g, 'gravel', 3), y = Haul.devRock(g, 'gravel', 3);
  x.gem = y.gem = null;
  const hard = Haul.TYPES.gravel.hard, kg = Haul.chip(g, x, 1, 10 / (4 / hard), [g.sh.x, g.sh.y]);
  const chunks = g.pickups.filter((p) => p.item === 'iron').length;
  check('10 kg chipped, then sold, pays exactly 10 kg less', near(kg, 10, 1e-9) && Haul.payout(g, y) - Haul.payout(g, x) === 16, `$${Haul.payout(g, y)} vs $${Haul.payout(g, x)}, ${chunks} chunks of 5 kg flew out`);
  const rail = g.w.rocks.find((r) => !r.gone && r.host.id === 'mochi'), before = Haul.info(g, rail).oreKg;
  Haul.chip(g, rail, 1, 1, [0, 0]);
  check('chipping a rail rock keeps it on its rail and remembers the ore', !rail.gone && near(before - Haul.info(g, rail).oreKg, 4 / Haul.TYPES[Haul.typeOf(g, rail)].hard, 1e-9), '');
  const [rx, ry] = World.rockState(g.w, rail, g.t), hit = Haul.rayRocks(g, rx - 20, ry, rx + 20, ry);
  check('rayRocks finds the rail rock on the segment', hit && hit.rock === rail && near(hit.d, 20 - rail.r * 0.9, 1e-6), hit ? `d ${hit.d.toFixed(2)} m` : 'miss');
}


// ---------------- 7. free rocks: save / load, craters, long steps ----------------
{
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const g = fresh(), rk = hooked(g, 'slush', 2.5), loose = Haul.devRock(g, 'sparkle', 1.5);
  const rail = g.w.rocks.find((r) => !r.gone && r.host.id === 'kiwi');
  Haul.chip(g, rail, 1, 2, [0, 0]);
  H.run(g, 30, {});
  Game.save(g);
  const g2 = Game.create(7, null), f2 = Haul.free(g2), a = f2.find((r) => r.id === rk.id), b = f2.find((r) => r.id === loose.id);
  check('free rocks save and load (same place, mass, ore, tow)', a && b && Math.hypot(a.x - rk.x, a.y - rk.y) < 1e-6 && a.m === rk.m && b.oreKg === loose.oreKg && Haul.towInfo(g2) && Haul.towInfo(g2).id === rk.id,
        `${f2.length} free rocks, tow ${Haul.towInfo(g2) ? Haul.towInfo(g2).id : '-'}`);
  check('...chipped rail rocks keep their ore', near(Haul.info(g2, g2.w.rocks[rail.id]).oreKg, Haul.info(g, rail).oreKg, 1e-9), '');
  Game.wipeSave();
  delete global.localStorage;

  const h = fresh('pad'), mochi = h.w.byId.mochi, th = -1.2, T = Terrain.of(mochi), dug0 = T.grid.reduce((n, v) => n + (v === Terrain.DUG), 0);
  const fall = Haul.devRock(h, 'gravel', 3), [bx, by, bvx, bvy] = World.bodyState(h.w, mochi, h.t), R = World.surfaceR(mochi, th) + 20;
  Object.assign(fall, { x: bx + R * Math.cos(th), y: by + R * Math.sin(th), vx: bvx - 4 * Math.cos(th), vy: bvy - 4 * Math.sin(th) });
  const p0 = h.pickups.length;
  H.run(h, 60 * 8, {});
  const dug = T.grid.reduce((n, v) => n + (v === Terrain.DUG), 0) - dug0, crumbs = h.pickups.slice(p0).filter((p) => p.item === 'iron').length;
  check('a rock hitting Mochi digs a crater and drops pickups', !Haul.free(h).includes(fall) && dug >= 10 && crumbs > 0 && h.events.some((e) => /crater/.test(e.msg)),
        `${dug} cells dug, ${crumbs} iron pickups at the rim`);

  const o = fresh(), b0 = o.w.byId.mochi, orb = Haul.devRock(o, 'gravel', 2), r0 = 380, [mx, my, mvx, mvy] = World.bodyState(o.w, b0, o.t), vc = Math.sqrt(b0.mu / r0);
  Object.assign(orb, { x: mx + r0, y: my, vx: mvx, vy: mvy + vc });
  Game.setWarp(o, 1024);
  let rMin = Infinity, rMax = 0, maxDt = 0;
  for (let i = 0; i < 60 * 40 && o.t < 2400; i++) {
    H.run(o, 1, {}, 1 / 20); maxDt = Math.max(maxDt, o.stepDt);
    const [x, y] = World.bodyState(o.w, b0, o.t), r = Math.hypot(orb.x - x, orb.y - y);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  check('a free rock orbiting Mochi stays put under long core steps', Haul.free(o).includes(orb) && rMin > 0.97 * r0 && rMax < 1.03 * r0 && maxDt > 0.1,
        `r in [${rMin.toFixed(1)}, ${rMax.toFixed(1)}] m over ${o.t.toFixed(0)} s, core steps up to ${maxDt.toFixed(2)} s`);
}


// ---------------- 8. holds, docks and modules ----------------
{
  const g = fresh('pad'), rk = Haul.devRock(g, 'gravel', 2), mochi = g.w.byId.mochi;
  const [bx, by, bvx, bvy] = World.bodyState(g.w, mochi, g.t), ux = (g.sh.x - bx) / Math.hypot(g.sh.x - bx, g.sh.y - by), uy = (g.sh.y - by) / Math.hypot(g.sh.x - bx, g.sh.y - by);
  Object.assign(rk, { x: g.sh.x + ux * 20, y: g.sh.y + uy * 20, vx: bvx + ux * 1.5, vy: bvy + uy * 1.5, towed: true });
  g.mod.haul.tow = { id: rk.id, len: 8 };
  H.run(g, 120, {});
  check('the rope never yanks a ship off the pad', g.status === 'landed' && Math.hypot(rk.x - g.sh.x, rk.y - g.sh.y) <= 8 + rk.r + g.S.radius + 1e-6, `${g.status}, rock ${Math.hypot(rk.x - g.sh.x, rk.y - g.sh.y).toFixed(2)} m out`);

  const d = fresh('hub');
  check('the Crusher is a nav target 9 km ahead of Mochi on its lane', (() => {
    const nt = Game.navTargets(d).find((n) => n.id === 'crusher'), [x, y] = nt.state(d.t), [mx, my] = World.bodyState(d.w, d.w.byId.mochi, d.t);
    return Math.abs(Math.hypot(x, y) - 30000) < 1e-6 && Math.abs(Math.hypot(x - mx, y - my) - 2 * 30000 * Math.sin(0.15)) < 1e-6;
  })(), '');

  const { execFileSync } = require('child_process');
  const solo = `const H = require(${JSON.stringify(__dirname + '/harness')}); H.load({ only: 'haul' });
    const g = Game.create(7, 'swarm', { fresh: true, dev: true }); const rk = Haul.devRock(g, 'slush', 2);
    H.run(g, 2, {}); H.run(g, 1, { pressed: ['KeyG'] }); H.run(g, 30, {}); g.sh.ang += Math.PI;
    H.run(g, 300, { keys: ['KeyW'] }); H.run(g, 1, { pressed: ['KeyB'] }); H.run(g, 300, {});
    console.log(JSON.stringify({ free: Haul.free(g).length, cracked: g.mod.haul.stats.cracked, err: g.err }));`;
  let out = null;
  try { out = JSON.parse(execFileSync(process.execPath, ['-e', solo], { encoding: 'utf8' }).trim().split('\n').pop()); } catch (e) { out = { err: e.message.slice(0, 120) }; }
  check('only: haul (dev, no econ): hook, tow, crack, 600 frames clean', out && !out.err && out.cracked === 1 && out.free >= 2, JSON.stringify(out));
}

// ---------------- 9. the tow against the ring rubble, the nose governor, dev T, hostile saves ----------------
{
  // the ship coasts at v into a Mochi ring rock with a 64 t rock trailing on the rope: the rock rams it into the wall (a rattle)
  const ram = (v, tow = true) => {
    const g = fresh('belt'), rk = tow ? hooked(g, 'gravel', 2) : null, q = g.w.rocks.find((k) => !k.gone && k.host.id === 'mochi' && k.r > 4);
    const [qx, qy, qvx, qvy] = World.rockState(g.w, q, g.t), ux = Math.cos(0.7), uy = Math.sin(0.7), hitR = q.r * 0.9 + g.S.radius * 0.8;
    const L = rk ? Math.hypot(rk.x - g.sh.x, rk.y - g.sh.y) : 0, sx = qx + ux * (hitR + 2), sy = qy + uy * (hitR + 2);
    Object.assign(g.sh, { x: sx, y: sy, vx: qvx - ux * v, vy: qvy - uy * v, ang: 0.7, omega: 0 });
    if (rk) Object.assign(rk, { x: sx + ux * L, y: sy + uy * L, vx: g.sh.vx, vy: g.sh.vy });
    Game.refresh(g);
    const h0 = g.sh.hull, e0 = g.events.length; let vMax = 0, gap = 9, on = false;
    for (let i = 0; i < 600; i++) {
      H.run(g, 1, {});
      const [x, y, vx, vy] = World.rockState(g.w, q, g.t), d = Math.hypot(g.sh.x - x, g.sh.y - y) - hitR;
      on = on || d < 0.2; gap = Math.min(gap, d);
      if (on) vMax = Math.max(vMax, Math.hypot(g.sh.vx - vx, g.sh.vy - vy));
    }
    return { dmg: h0 - g.sh.hull, vMax, gap, knocks: g.events.slice(e0).filter((e) => /hull/.test(e.msg)).map((e) => e.msg.split(' ')[0]), g };
  };
  const a = ram(3), b = ram(3, false);
  check('coasting tow into a ring rock: no speed gained off the contact', a.vMax <= 3 * 1.1 && a.gap > -0.05 && a.g.status === 'flying', `max ${a.vMax.toFixed(2)} m/s vs 3 in, deepest ${a.gap.toFixed(2)} m`);
  check('...the ram-and-rattle costs ≤ 2.2x the same bump without a tow', a.dmg <= 2.2 * b.dmg && b.dmg > 10, `${a.dmg.toFixed(1)} hull (${a.knocks.join(' ')}) vs ${b.dmg.toFixed(1)} alone`);
  const r = ram(1);
  check('...and a gentle 1 m/s brush costs one dent', r.knocks.length <= 2 && r.dmg <= 8, `${r.dmg.toFixed(1)} hull: ${r.knocks.join(' ') || 'none'}`);

  // a free rock against a rail rock: a bounce at ROCK_REST 0.3, and 7 m/s gravel (½v² > Q 20 J/kg) shatters, no job paid
  const bounce = (v) => {
    const g = fresh('belt'), q = g.w.rocks.find((k) => !k.gone && k.host.id === 'mochi' && k.r > 4), rk = Haul.devRock(g, 'gravel', 1.5);
    const [qx, qy, qvx, qvy] = World.rockState(g.w, q, g.t), D = 0.9 * (q.r + rk.r) + 0.5;
    Object.assign(rk, { x: qx + D, y: qy, vx: qvx - v, vy: qvy });
    H.run(g, Math.ceil(60 * 2 / v), {});
    const [x1, y1, vx1, vy1] = World.rockState(g.w, q, g.t), nx = (rk.x - x1) / Math.hypot(rk.x - x1, rk.y - y1), ny = (rk.y - y1) / Math.hypot(rk.x - x1, rk.y - y1);
    return { g, rk, out: (rk.vx - vx1) * nx + (rk.vy - vy1) * ny, alive: Haul.free(g).includes(rk) };
  };
  const s1 = bounce(1), s7 = bounce(7);
  check('a free rock bounces off a rail rock at 0.3', s1.alive && near(s1.out, 0.3, 0.06), `${s1.out.toFixed(2)} m/s out after 1 in`);
  check('...a 7 m/s one cracks (no crack job for a crash)', !s7.alive && Haul.free(s7.g).length >= 2 && s7.g.done.crack === undefined, `${Haul.free(s7.g).length} pieces`);

  // W with the nose on the rock: the governor holds the closing speed to NOSE_V, so a tow start never CLONKs
  const n = fresh(), nk = hooked(n, 'gravel', 3);
  let close = 0;
  for (let i = 0; i < 300; i++) { H.run(n, 1, { keys: ['KeyW'] }); close = Math.max(close, ((n.sh.vx - nk.vx) * (nk.x - n.sh.x) + (n.sh.vy - nk.vy) * (nk.y - n.sh.y)) / Math.hypot(nk.x - n.sh.x, nk.y - n.sh.y)); }
  const nt = n.toasts.map((t) => t.text).join(' | ');
  check('W nose-on: engine held at NOSE_V closing, no CLONK, says why', close <= Haul.NOSE_V + 0.1 && !n.events.some((e) => /CLONK/.test(e.msg)) && /NOSE ON THE ROCK/.test(nt), `closing ≤ ${close.toFixed(2)} m/s; ${nt.slice(0, 60)}`);
  check('...tail to the rock: the exhaust cants off it', (() => { const c = fresh(); hooked(c, 'gravel', 3); c.sh.ang += Math.PI; H.run(c, 10, { keys: ['KeyW'] }); return c.fired.cant === Haul.CANT; })(), '');

  const by = fresh(); hooked(by, 'gravel', 3); by.navId = null; H.run(by, 1, { pressed: ['Tab'] });
  const sp = Haul.sellPoints(by).sort((u, v) => Math.hypot(u.x - by.sh.x, u.y - by.sh.y) - Math.hypot(v.x - by.sh.x, v.y - by.sh.y))[0];
  const tow = Game.gather(by, 'hudRows').find((r) => r.label === 'TOW');
  check('towing, Tab picks the nearest buyer first; the TOW row shows its price', [sp.id, 'station:' + sp.id].includes(by.navId) && tow && /\$[\d,]+ at /.test(tow.val), `${by.navId}; TOW ${tow ? tow.val : '-'}`);

  const t = Game.create(7, 'swarm', { fresh: true, dev: true }); hooked(t, 'gravel', 3);
  H.run(t, 1, { pressed: ['KeyT'] });
  check('dev T while towing lets the rock go', !Haul.towInfo(t) && !Haul.free(t).some((k) => k.towed), t.spawn);

  const l = fresh(), bad = { v: 1, t: l.t, gone: ['__proto__', 3.5], chipped: { __proto__: 5, constructor: 2, toString: 1 }, nextId: 'x', stats: {}, tow: null,
    free: [{ id: 1e6, type: '__proto__', r: 2, m: 60, oreKg: 1, x: 0, y: 0, vx: 0, vy: 0 }, { id: 1e6 + 1, type: 'toString', r: 2, m: 60, oreKg: 1, x: 0, y: 0, vx: 0, vy: 0 },
           { id: 1e6 + 2, type: 'gravel', r: -2, m: 60, oreKg: 1, x: 0, y: 0, vx: 0, vy: 0 }, { id: 1e6 + 3, type: 'gravel', r: 2, m: 60, oreKg: 1, x: 0, y: 0, vx: 0, vy: 0, gem: 'constructor', ang: 'x' }] };
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  Game.save(l);
  const key = Object.keys(store).find((k) => /mods/.test(store[k])), d = JSON.parse(store[key]);
  d.mods.haul = bad; store[key] = JSON.stringify(d).replace('"chipped":{', '"chipped":{"__proto__":5,');
  let err = null, l2 = null; try { l2 = Game.create(7, null); } catch (e) { err = e.message; }
  Game.wipeSave(); delete global.localStorage;
  const got = l2 ? Haul.free(l2) : [];
  check('a hostile save: prototype keys and bad numbers are skipped', !err && got.length === 1 && got[0].gem === null && got[0].ang === 0 && !Object.keys(l2.mod.haul.chipped).length && Object.getPrototypeOf(l2.mod.haul.chipped) === Object.prototype,
        err || `${got.length} rock kept, gem ${got[0] && got[0].gem}`);
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
