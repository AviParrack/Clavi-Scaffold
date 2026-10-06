// ======================================================================
//  NPCS TESTS  —  data, scripts (determinism, the Bot round trip), the
//  translator, talking to Mumble, favours (hand-in and keeper), save/load,
//  placement at Mochi's spots, keepers in bubbles, the reveal, sprites and
//  hooks on a NaN-sniffing fake canvas; child runs without mochi and alone.
//    node tests/test_npcs.js
// ======================================================================

const H = require('./harness');
const MODE = process.argv.includes('--solo') ? 'solo' : process.argv.includes('--nomochi') ? 'nomochi' : 'full';
H.load({ only: MODE === 'solo' ? 'npcs' : MODE === 'nomochi' ? 'economy,shop,stations,eva,wrecks,npcs' : null });

let nPass = 0, nFail = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${(MODE === 'full' ? '' : `[${MODE}] `) + name.padEnd(58)} ${info}`);
  ok ? nPass++ : nFail++;
}
const fresh = (spawn = 'pad', opts = {}) => Game.create(7, spawn, { fresh: true, ...opts });
const M = (g) => g.mod.npcs;
const hook = (id, h) => { const m = Game.mods.find((x) => x.id === id); return m && m[h]; };
const npcF = (g) => { const f = hook('npcs', 'interactions')(g); return f && f[0]; };
const on = (id) => Game.mods.some((x) => x.id === id);
const byId = (g, id) => Npcs.list(g).find((n) => n.id === id);
const lastBubble = (g) => M(g).bubbles[M(g).bubbles.length - 1] || null;
const logHas = (g, re) => g.events.some((e) => re.test(e.msg));

// out of the ship on Mochi's pad, standing `side` m east of an NPC (by its feet)
function standBy(g, id, side = 1.6) {
  if (g.mode !== 'eva') EVA.stepOut(g);
  H.run(g, 2);
  const n = byId(g, id), tx = n.up[1], ty = -n.up[0];
  Object.assign(g.astro, { x: n.x + tx * side + n.up[0] * 0.7, y: n.y + ty * side + n.up[1] * 0.7, vx: n.vx, vy: n.vy });
  H.run(g, 2);                                                    // prompts refresh at the end of a frame
  return n;
}
const pressF = (g) => H.run(g, 1, { pressed: ['KeyF'] });

if (MODE === 'full') {
  // ---------------- 1. data ----------------
  {
    const ids = Npcs.DEFS.map((d) => d.id), MOODS = Npcs.MOODS, bad = [];
    check(`${ids.length} named NPCs, ids unique`, ids.length === 28 && new Set(ids).size === ids.length, ids.join(','));
    const lineSets = (d) => [d.lines, d.hello && [d.hello], d.offer && [d.offer], d.wait && [d.wait], d.done && [d.done]].filter(Boolean).flat();
    for (const d of Npcs.DEFS) {
      const keeper = d.at.keeper;
      if (!keeper && !(d.lines && d.lines.length >= 3 && d.lines.length <= 6)) bad.push(`${d.id}: ${d.lines ? d.lines.length : 0} lines`);
      for (const L of lineSets(d)) if (!Array.isArray(L) || !MOODS.includes(L[0]) || typeof L[1] !== 'string' || L[1].length > 90 || !L[1]) bad.push(`${d.id}: ${JSON.stringify(L)}`);
      if (!Npcs.RACES[d.race]) bad.push(`${d.id}: race ${d.race}`);
      if (d.favour && !(Npcs.FAVOURS[d.favour] && Npcs.FAVOURS[d.favour].giver === d.id && d.offer && d.wait && d.done)) bad.push(`${d.id}: favour ${d.favour}`);
    }
    for (const x of Npcs.NAMED_EXTRAS) if (!(x.line && MOODS.includes(x.line[0]) && x.line[1].length <= 90)) bad.push(`extra ${x.id}`);
    check('every line [mood, text], <= 90 chars; 3-6 lines each; favours wired', !bad.length, bad.slice(0, 4).join(' | '));
    const giverless = Object.entries(Npcs.FAVOURS).filter(([f, F]) => !Npcs.DEFS.some((d) => d.id === F.giver && d.favour === f)).map(([f]) => f);
    check('every favour has a giver who offers it', !giverless.length, giverless.join(','));
    const mvp = Object.keys(Npcs.FAVOURS).filter((f) => Npcs.FAVOURS[f].mvp);
    check('the 5 MVP favours: salt, noodles, shiny, forge, drawer', mvp.join() === 'salt,noodles,shiny,forge,drawer', mvp.join());
    const races = Object.keys(Npcs.RACES), noScript = races.filter((r) => r !== 'pipkin' && !Npcs.script(r, 'hello', 40, 13).length);
    check('six races, each with a script (or Belt Common)', races.length === 6 && !noScript.length, races.join(','));
    const meet = Game.GOALS.find((x) => x.id === 'meet');
    check('job "meet" at order 33 pays $50', meet && meet.order === 33 && meet.reward === 50, meet ? meet.text : 'missing');
  }

  {
    const all = Npcs.DEFS.flatMap((d) => (d.lines || []).map((L) => `${d.id}: ${L[1]}`)), say = (id, re) => all.some((l) => l.startsWith(id + ':') && re.test(l));
    check('lore matches the world (critic L10-L14): Truffle quiet, Marge at Biscotti, Lulu of the Lantern, Grubb on Mochi',
      !say('velvet', /Pirates on both/) && say('velvet', /Truffle's quiet/) && say('marge', /past Biscotti/) && !all.some((l) => /outer ring/.test(l)) &&
      say('radish', /Lulu of the Lantern/) && say('grubb', /Every fry on Mochi comes/) && say('peri', /Escape first, 5 later/), '');
    const vs = [0.01, 0.05, 0.2, 1, 10].map((px) => Npcs.visitScale(1.5, px));
    check('station visitors: life size up close, at most 2.2x when zoomed out (critic L5)', vs[0] === 1 && vs.every((v, i) => v >= 1 && v <= 2.2 && (!i || v >= vs[i - 1])) && vs[4] === 2.2, vs.map((v) => v.toFixed(2)).join(' '));
  }

  // ---------------- 2. scripts ----------------
  {
    const J = (r, w) => JSON.stringify(Npcs.script(r, w, 44, 13));
    let same = true, caseFree = true, differ = 0, total = 0;
    for (const r of ['murk', 'oggle', 'crustling', 'orbiloon']) {
      same = same && J(r, 'salt') === J(r, 'salt');
      caseFree = caseFree && J(r, 'Salt!') === J(r, 'salt') && J(r, '"SALT,"') === J(r, 'salt');
      for (const [a, b] of [['salt', 'ice'], ['ice', 'iron'], ['rookie', 'pirate'], ['fries', 'noodles']]) { total++; if (J(r, a) !== J(r, b)) differ++; }
    }
    check('same word, same glyphs (deterministic)', same);
    check('case and punctuation do not change the glyphs', caseFree);
    check('different words, different glyphs', differ === total, `${differ}/${total}`);
    const words = ['HELLO', 'PHIL', 'SAYS', 'HI', 'UNIT-7', '3.8E17', 'ESA'];
    const round = words.every((w) => Npcs.decodeBot(Npcs.script('bot', w, w.length * 9, 13), w.length) === w);
    check('Bot round trip: the LEDs decode back to the word (parity checked)', round, words.map((w) => Npcs.decodeBot(Npcs.script('bot', w, 60, 13), w.length)).join(' '));
    const flip = Npcs.script('bot', 'HI', 20, 13); flip[3][4] = 1 - flip[3][4];
    check('...and a flipped LED shows as a parity error', Npcs.decodeBot(flip, 2) === '?I');
    const prims = ['murk', 'oggle', 'crustling', 'orbiloon', 'bot'].flatMap((r) => Npcs.script(r, 'crunchy', 50, 13));
    check('glyphs stay inside their slot (w x h, a little ink spill)', prims.every((p) => p.slice(1, 3).every(Number.isFinite) && p[1] > -4 && p[1] < 54 && p[2] > -4 && p[2] < 17));
  }

  // ---------------- 3. translator ----------------
  {
    const g = fresh();
    const lvl = (x) => { g.opts.xlate = x; return Npcs.translator(g); };
    g.S.translator = 0;
    check('level 0: Pipkins only', Npcs.readable(g, 'pipkin', 'ice') && !Npcs.readable(g, 'murk', 'ice') && !Npcs.readable(g, 'bot', '42'));
    const R = (() => { let s = 99; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const synth = Array.from({ length: 2000 }, () => Array.from({ length: 3 + Math.floor(R() * 6) }, () => String.fromCharCode(97 + Math.floor(R() * 26))).join(''));
    lvl(1);
    const share = synth.filter((w) => Npcs.readable(g, 'murk', w)).length / synth.length;
    check('level 1: 45-65 % of 2,000 made-up words', share > 0.45 && share < 0.65, `${(share * 100).toFixed(1)} %`);
    check('level 1: numbers and names always', ['42', '3.8E17', 'Mochi', 'Ember', 'Rust', 'Gary', 'Glimmer'].every((w) => Npcs.readable(g, 'oggle', w)));
    lvl(2);
    check('level 2: every race, every word', synth.slice(0, 200).every((w) => ['murk', 'oggle', 'crustling', 'orbiloon', 'bot'].every((r) => Npcs.readable(g, r, w))));
    g.opts.xlate = null; g.S.translator = 2;
    check('translator(g) follows the suit (S.translator) when nothing overrides', Npcs.translator(g) === 2);
    H.run(g, 1); H.run(g, 1, {});
    g.dev = true; hook('npcs', 'onKey')(g, 'KeyL');
    check('dev L cycles the level (2 -> 3) over the suit', Npcs.translator(g) === 3 && M(g).xlate === 3);
    g.opts.xlate = '0';
    check('?xlate= (g.opts.xlate) wins over everything', Npcs.translator(g) === 0);
  }

  // ---------------- 4. talking to Mumble ----------------
  {
    const g = fresh(); H.run(g, 3);
    const m0 = g.money;
    standBy(g, 'mumble', 1.4);
    const p = npcF(g);
    check('2 m from Mumble: F "Talk to Mumble"', p && p.text === 'Talk to Mumble', p ? p.text : 'none');
    pressF(g);
    const b = M(g).bubbles.find((x) => x.id === 'mumble'), mum = Npcs.DEFS.find((d) => d.id === 'mumble');
    check('F: a bubble with Mumble\'s first line', b && b.name === 'Mumble' && b.text === mum.lines[0][1] && b.mood === mum.lines[0][0], b ? b.text : 'none');
    check('...met, metAlien, a log line', M(g).met.mumble && M(g).metAlien && logHas(g, /^npc Mumble \(murk, glyphs\): "/));
    H.run(g, 2);
    check('job "meet" done: +$50', g.done.meet !== undefined && g.money - m0 === 50, `money +${g.money - m0}`);
    const h = hook('npcs', 'hint')(g);
    check('first contact hint names the language and where translators are', h && /Mumble speaks Murk\. A translator \(Suit tab at Mochi Hub\) turns the dots into words\./.test(h.text), h ? h.text : 'none');
    check('the hint is one line (<= 100 chars)', h && h.text.length <= 100, h ? `${h.text.length}` : '');
    {
      const gs = fresh(); H.run(gs, 3);                                   // newplayer M5: a radio line while flying waits for your feet
      Npcs.say(gs, 'velvet', 'Void opals on Glimmer, guns included.');
      const fly = hook('npcs', 'hint')(gs);
      check('translator ad never shows while flying (newplayer M5)', gs.mode === 'ship' && !(fly && /translator/i.test(fly.text)) && !M(gs).firstFrom, fly ? fly.text : 'none');
      H.run(gs, 4, { pressed: ['KeyE'] }); H.run(gs, 20);
      const foot = hook('npcs', 'hint')(gs);
      check('...and shows once you step out, naming the speaker', gs.mode === 'eva' && foot && /^Velvet speaks .*translator/.test(foot.text), foot ? foot.text : gs.mode);
    }

    // ---------------- 5. favour: salt (hand-in) ----------------
    pressF(g);
    check('next F: Mumble asks a favour', M(g).fav.salt === 'offered' && lastBubble(g).mood === 'want', JSON.stringify(M(g).fav));
    check('...the prompt offers it: "Accept: 2 salt crystals for Mumble ($150)"', npcF(g).text === 'Accept: 2 salt crystals for Mumble ($150)', npcF(g).text);
    pressF(g);
    check('F accepts: favour active, toast', M(g).fav.salt === 'active' && g.toasts.some((t) => /FAVOUR: BRING MUMBLE 2 SALT CRYSTALS \(\$150\)/.test(t.text)), g.toasts.map((t) => t.text).slice(-1).join());
    g.pack.salt = 3;
    const m1 = g.money;
    check('with 2 salt: "Give Mumble 2 salt crystals"', npcF(g).text === 'Give Mumble 2 salt crystals', npcF(g).text);
    const jobs0 = Object.keys(g.done).length;
    pressF(g);
    const jobPay = Object.keys(g.done).slice(jobs0).reduce((a, id) => a + ((Game.GOALS.find((x) => x.id === id) || {}).reward || 0), 0);   // a gem job may tick too
    check('F hands it over: +$150, pack salt -2, done', g.money - m1 - jobPay === 150 && g.pack.salt === 1 && M(g).fav.salt === 'done', `+${g.money - m1}, salt ${g.pack.salt}`);
    check('...logs it', logHas(g, /npc favour salt accepted/) && logHas(g, /npc favour salt done \+\$150/));

    // ---------------- 7. save / load ----------------
    const store = {};
    global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    M(g).fav.noodles = 'active'; M(g).favData.noodles = { t: 1 };
    Game.save(g);
    const g2 = Game.create(7, null, {});
    check('save / load keeps met, lines, favours, heard', M(g2).met.mumble && M(g2).line.mumble === M(g).line.mumble && M(g2).fav.salt === 'done' &&
          M(g2).fav.noodles === 'active' && M(g2).heard.length === M(g).heard.length && M(g2).metAlien, JSON.stringify(M(g2).fav));
    const junk = JSON.parse(store[Object.keys(store)[0]]);
    junk.mods.npcs = { met: { nobody: true, mumble: 1 }, line: { mumble: 'x', pip: 2.7 }, fav: { salt: 'eaten', fake: 'done' }, heard: [1, 'two', 3], favData: 7 };
    store[Object.keys(store)[0]] = JSON.stringify(junk);
    const g3 = Game.create(7, null, {});
    check('...and ignores junk and unknown ids', M(g3).met.mumble && !M(g3).met.nobody && !('fake' in M(g3).fav) && !M(g3).fav.salt && M(g3).line.pip === 2 && M(g3).heard.join() === '1,3',
          JSON.stringify({ met: M(g3).met, fav: M(g3).fav, line: M(g3).line }));
    const proto = JSON.parse(store[Object.keys(store)[0]]);           // keys every object inherits are not NPCs or favours (systems)
    proto.mods.npcs = JSON.parse('{"met":{"constructor":1,"toString":1},"line":{"hasOwnProperty":3},"fav":{"constructor":"active","__proto__":"done"},' +
      '"favData":{"constructor":{"t":1},"salt":{"t":"x","kills0":-1e999,"evil":{"a":1},"saidHi":"yes"}}}');
    store[Object.keys(store)[0]] = JSON.stringify(proto);
    const g4 = Game.create(7, null, {}), own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    H.run(g4, 3);
    check('...and prototype keys ("constructor", "__proto__") and junk favour data', !own(M(g4).met, 'constructor') && !own(M(g4).met, 'toString') && !own(M(g4).line, 'hasOwnProperty') &&
          !own(M(g4).fav, 'constructor') && Object.getPrototypeOf(M(g4).fav) === Object.prototype && !own(M(g4).favData, 'constructor') &&
          JSON.stringify(M(g4).favData.salt) === '{"t":0}' && !g4.err, JSON.stringify({ fav: M(g4).fav, favData: M(g4).favData }));
    Game.wipeSave(); delete global.localStorage;
  }

  // ---------------- 6. favour: Fern's blue drawer (a keeper favour) ----------------
  {
    const g = fresh('outpost'), out = Stations.byId(g, 'outpost');
    H.run(g, 4);
    check('docked at Kiwi Outpost: Fern says hello in a bubble (no toast)', M(g).met.fern && !g.toasts.some((t) => /Fern:/.test(t.text)) &&
          [...M(g).bubbles, ...M(g).radio].some((b) => b.id === 'fern'), [...M(g).bubbles, ...M(g).radio].map((b) => b.name + ': ' + b.text).join(' | '));
    g.ui = null; H.run(g, 60 * 6);
    check('...a few seconds in, she asks: drawer active', M(g).fav.drawer === 'active', JSON.stringify(M(g).fav));
    const m0 = g.money;
    Wrecks.complete(g, 'lettuce', 'ship');
    H.run(g, 30, { keys: ['KeyW'] }); H.run(g, 120);
    check('undocked', !Stations.dockedAt(g), g.status);
    Stations.dock(g, out); H.run(g, 60 * 6); g.ui = null; H.run(g, 60 * 6);
    check('salvaged Lettuce Pray, dock again: done, +$250', M(g).fav.drawer === 'done' && g.money - m0 >= 250, `${M(g).fav.drawer}, +${g.money - m0}`);
  }

  // ---------------- 8. placement at Mochi's spots (§5.2) ----------------
  if (on('mochi') && typeof Mochi !== 'undefined' && Mochi && Mochi.spots) {
    const g = fresh(); H.run(g, 2);
    const spots = Object.fromEntries(Mochi.spots(g).map((s) => [s.id, s])), L = Npcs.list(g);
    const where = { pip: 'pad', mumble: 'pad', chive: 'market', grubb: 'canteen', gneiss: 'gallery', unit7: 'archive', velvet: 'cellar', sizzy: 'skylight',
                    okra: 'outpost-ice', annie: 'forge', marge: 'brinepit', tansy: 'guide', clunk: 'lift', parsnip: 'market', sorrel: 'guild',
                    bonk: 'outpost-iron', nozzle: 'pump9', twist: 'pitstop' };
    const off = [];
    for (const [id, sp] of Object.entries(where)) {
      const n = L.find((x) => x.id === id), s = spots[sp];
      if (!n || !s) { off.push(`${id}: ${n ? 'no spot ' + sp : 'missing'}`); continue; }
      const along = (n.lx - s.lx) * s.uy - (n.ly - s.ly) * s.ux, up = (n.lx - s.lx) * s.ux + (n.ly - s.ly) * s.uy;
      if (n.spot !== sp || n.body.id !== s.body || Math.abs(along) > s.w / 2 + 0.6 || Math.abs(up) > 4) off.push(`${id} @${n.spot} along ${along.toFixed(1)} up ${up.toFixed(1)}`);
    }
    check('named NPCs and named extras stand at their §5.2 spots', !off.length, off.slice(0, 4).join(' | ') || `${Object.keys(where).length} placed`);
    const pip = L.find((x) => x.id === 'pip'), mum = L.find((x) => x.id === 'mumble'), s = spots.pad;
    const ea = (n) => (n.lx - s.lx) * s.uy - (n.ly - s.ly) * s.ux;
    check('the pad: Pip (k 0) west of Mumble (k 1)', ea(pip) < ea(mum), `${ea(pip).toFixed(1)} < ${ea(mum).toFixed(1)}`);
    const crowd = (sp) => L.filter((n) => n.crowd === sp).length;
    check('crowds: market >= 6, canteen >= 3, cellar >= 3', crowd('market') >= 6 && crowd('canteen') >= 3 && crowd('cellar') >= 3,
          ['market', 'canteen', 'cellar', 'gallery', 'shrine', 'guild', 'archive', 'skylight', 'workings'].map((sp) => `${sp} ${crowd(sp)}`).join(', '));
    const names = L.map((n) => n.name), RES = ['Parsnip', 'Sorrel', 'Tansy', 'Clunk', 'Bonk', 'Nozzle', 'Twist', 'Gristle', 'Granny Granite'];
    check('every name unique; reserved names never in a crowd', new Set(names).size === names.length && !L.some((n) => n.crowd && RES.includes(n.name)));
    check('the market crowd mixes races', new Set(L.filter((n) => n.crowd === 'market').map((n) => n.race)).size >= 3);
    const g2 = fresh(); H.run(g2, 2);
    check('placement is the same every game', JSON.stringify(Npcs.list(g2).map((n) => [n.id, n.name, n.race])) === JSON.stringify(L.map((n) => [n.id, n.name, n.race])));
    // feet on the floor once someone is near
    standBy(g, 'chive', 0.3);
    const T = Terrain.of(g.w.byId.mochi), near = Npcs.list(g).filter((n) => n.body && n.body.id === 'mochi' && n.snapped && Math.hypot(n.x - g.astro.x, n.y - g.astro.y) < 30);
    const floating = near.filter((n) => !Terrain.solid(T, n.lx - n.ux * 0.4, n.ly - n.uy * 0.4) || Terrain.solid(T, n.lx + n.ux * 0.5, n.ly + n.uy * 0.5));
    check('NPCs near you stand on the floor (snapped)', near.length >= 5 && !floating.length, `${near.length} near, floating: ${floating.map((n) => n.id).join(',')}`);
    const air = near.filter((n) => n.spot === 'market').every((n) => n.air) && L.find((x) => x.id === 'pip').air === false;
    check('market has air (no helmets), the pad does not', air);
    pressF(g);
    const b = M(g).bubbles.find((x) => x.id === 'chive');
    check('Chive is a Pipkin: Belt Common, plain English', b && b.race === 'pipkin' && logHas(g, /^npc Chive \(pipkin\): /), b ? b.text : 'none');
  } else check('mochi.js not loaded: spot placement checked in the --nomochi child only', true);

  // ---------------- 9. keepers and visitors ----------------
  {
    const g = fresh('hub'); H.run(g, 2);
    const dot = [...M(g).bubbles, ...M(g).radio].find((b) => b.id === 'dot');
    check('Dot says hello through Npcs.say (a bubble, no toast)', dot && dot.text === Stations.byId(g, 'hub').hello[1] && !g.toasts.some((t) => /^Dot:/.test(t.text)), dot ? dot.text : g.toasts.map((t) => t.text).join(' | '));
    const kids = Npcs.list(g).filter((n) => n.station === 'hub').map((n) => `${n.id}:${n.kind}`).join(',');
    check('the Hub has Dot (keeper), Peri and Thud (visitors)', kids === 'dot:keeper,peri:visitor,thud:visitor', kids);
    const thud = Npcs.list(g).find((n) => n.id === 'thud'), hub = Stations.byId(g, 'hub'), p = hub.local(g.t, 6, -27);
    check('visitors ride the station frame', Math.hypot(thud.x - p[0], thud.y - p[1]) < 1e-6);
    const far = Game.create(7, 'belt', { fresh: true }); H.run(far, 2);
    Npcs.say(far, 'rust', 'Pirates owe me money.', 'gossip');
    check('a keeper far away talks over the radio', M(far).radio.length >= 1 && M(far).radio[M(far).radio.length - 1].id === 'rust');
    H.run(far, 1);
    check('...and Npcs.talking says so while the line types', Npcs.talking(far, M(far).radio[0].id));
  }

  // ---------------- 10. the reveal ----------------
  {
    const g = fresh(); H.run(g, 2);
    const b = Npcs.say(g, 'grubb', 'Every fry on Mochi Hub comes from my fryer.', 'joke');
    check('level 0: the bubble is in glyphs (a sound line, no readable word)', b && b.lvl === 0 && !b.quick && Npcs.sound('oggle', b.text).length > 10, Npcs.sound('oggle', b.text));
    H.run(g, 30);
    M(g).xlate = 2; H.run(g, 1);
    check('a new translator re-reveals bubbles on screen (lvl 2, revT now)', b.lvl === 2 && Math.abs(b.revT - g.real) < 0.05, `lvl ${b.lvl}`);
    check('...logs the level and toasts it', logHas(g, /translator level 2 \(6 languages, dev L\)/) && g.toasts.some((t) => t.text === 'TRANSLATOR ONLINE: 6 LANGUAGES'));
    const b2 = Npcs.say(g, 'grubb', 'Every fry on Mochi Hub comes from my fryer.', 'joke'), b3 = Npcs.say(g, 'grubb', 'Every fry on Mochi Hub comes from my fryer.', 'joke');
    check('a line heard in English before shows in English at once', !b2.quick && b3.quick);
    check('one bubble per speaker, at most 3 in the world', M(g).bubbles.filter((x) => x.id === 'grubb').length === 1 && M(g).bubbles.length <= 3);
  }

  // ---------------- 11. favours that need other modules ----------------
  {
    const g = fresh(); H.run(g, 2);
    const offerOK = (id, f) => { const n = byId(g, id); M(g).met[id] = true; delete M(g).fav[f]; return n && (npcF(standBy(g, id, 1.2) && g) || {}).text; };
    check('Queso offers the Cool Ranch favour (wrecks on)', /a favour\?/.test(offerOK('queso', 'dorito') || ''), offerOK('queso', 'dorito'));
    g.pack.amber = 1; M(g).fav.shiny = 'active';
    check('a hand-in counts the pack', /^Give Chive 1 Kiwi amber$/.test((npcF(standBy(g, 'chive', 0.3) && g) || {}).text || ''), (npcF(g) || {}).text);
    const rows = hook('npcs', 'hint')(g);
    check('a ready favour hints where to go', rows && /Chive/.test(rows.text), rows ? rows.text : 'none');
  }

  // ---------------- 11b. laser pokes ----------------
  {
    const g = fresh(); H.run(g, 2);
    const n = standBy(g, 'mumble', 2.5), cx = n.x + n.up[0] * 1, cy = n.y + n.up[1] * 1;
    g.mod.eva.beam = { x0: g.astro.x, y0: g.astro.y, x1: cx + (cx - g.astro.x), y1: cy + (cy - g.astro.y), hit: 'terrain' };
    M(g).bubbles = []; M(g).barkAll = g.real;
    hook('npcs', 'frame')(g);
    const b = M(g).bubbles.find((x) => x.id === 'mumble');
    check('sweep the laser across Mumble: "Rude." (and no damage, ever)', b && b.text === 'Rude.' && b.mood === 'grumpy', b ? b.text : 'none');
    hook('npcs', 'frame')(g);
    check('...once per 5 s', M(g).bubbles.filter((x) => x.id === 'mumble').length === 1 && M(g).bubbles.find((x) => x.id === 'mumble') === b);
  }

  // ---------------- 12. sprites and hooks on a NaN-sniffing fake canvas ----------------
  {
    const bad = []; let calls = 0;
    const ctx = new Proxy({ globalAlpha: 1, lineWidth: 1, shadowBlur: 0 }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { calls++; if (a.some((v) => !Number.isFinite(v))) bad.push(k); return { addColorStop() {} }; };
        if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
        return (...a) => {
          calls++;
          if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad.push(`${String(k)}(${a.join(',')})`);
          if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0)) || (k === 'arcTo' && a[4] < 0)) bad.push(`${String(k)} negative radius (${a.join(',')})`);   // the browser throws on these
        };
      },
      set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${String(k)}=${v}`); t[k] = v; return true; },
    });
    let n = 0;
    const ACC = { pipkin: [null, 'headset', 'bun', 'hardhat', 'apron', 'cap', 'goggles', 'sash', 'pennant', 'twist'], murk: [null, 'scarf', 'monocle', 'lantern'],
                  oggle: [null, 'bandana', 'cap', 'tricorn', 'apron', 'goggles', 'hose', 'vest'], crustling: [null, 'salt', 'amethyst', 'moss', 'hood'],
                  orbiloon: [null, 'wand', 'scroll', 'specs', 'lamp'], bot: [null, 'clipboard', 'dish', 'spoon'] };
    for (const race in ACC) for (const acc of ACC[race]) for (const talk of [0, 1]) for (const t of [0, 0.7, 3.39, 1234.5, -9.3, -0.4]) {
      Npcs.drawSprite(ctx, race, { acc, asleep: t > 1000, R: 0.9, seed: 4 }, { t, talk, helmet: talk === 1, mood: t > 3 ? 'grumpy' : 'chat', look: [0.3, -0.2], L: [-0.5, 0.8], lw: 0.03 });
      n++;
    }
    check('every race and accessory draws, talking or not, no NaN', !bad.length && calls > 5000, `${n} sprites, ${calls} calls${bad.length ? ', bad: ' + bad.slice(0, 3).join(' ') : ''}`);
    const cam = { x: 0, y: 0, zoom: 32, rot: 0 }, W = 1280, Hh = 760;
    let right = 0;
    const kit = {
      ctx, W, H: Hh, cam, px: () => 1 / cam.zoom, toScreen: (x, y) => [W / 2 + (x - cam.x) * cam.zoom, Hh / 2 - (y - cam.y) * cam.zoom],
      viewRect: (pad = 0) => [cam.x - W / 2 / cam.zoom - pad, cam.y - Hh / 2 / cam.zoom - pad, cam.x + W / 2 / cam.zoom + pad, cam.y + Hh / 2 / cam.zoom + pad],
      onScreen: (sx, sy, m = 30) => sx > -m && sx < W + m && sy > -m && sy < Hh + m, roundRect: (...a) => { if (a.some((v) => !Number.isFinite(v))) bad.push('roundRect'); },
      stackRight: (w, h) => { const y0 = right; right += h + 22; return y0 + 32; }, fit: (s) => s, row() {}, comicPanel: (x, y) => y + 32,
      toonBlob() {}, tag() {}, outlinedText() {}, bar() {}, stackLeft: () => 40, screenAng: (a) => -a,
      INK: '#1b1433', PAPER: '#fff4dc', PAPER2: '#ffe2b0', COL: { good: '#33c27a', warn: '#ff9f1c', bad: '#e63946', tgt: '#7cf5d6', pro: '#ffd166', retro: '#ff8fab', dim: '#6d5f8a', money: '#2f9e5b' },
      LIGHT: [-0.55, 0.83], FONT: 'sans-serif',
    };
    const draw = (g) => { right = 0; for (const id of ['stations', 'npcs']) for (const h of ['drawWorld', 'drawScreen', 'drawHUD']) { const f = hook(id, h); if (f) f(g, kit); } };
    const g = fresh(); H.run(g, 2); standBy(g, 'mumble', 1.3);
    M(g).fav.noodles = 'active'; M(g).fav.forge = 'active'; g.pack.ice = 30;
    let frames = 0; const c0 = calls;
    for (const lv of [0, 1, 2]) {
      M(g).xlate = lv;
      for (const id of ['mumble', 'pip', 'x:market:0', 'grubb', 'unit7', 'gneiss', 'sizzy', 'dot', 'thud']) Npcs.say(g, id, 'Salt crystals glitter white in the dirt. Two, please, 42!', 'want');
      for (const zoom of [0.5, 2, 9, 32, 90]) for (let k = 0; k < 6; k++) { cam.zoom = zoom; [cam.x, cam.y] = [g.astro.x, g.astro.y]; H.run(g, 7); draw(g); frames++; }
    }
    for (const sp of ['hub', 'outpost', 'rusts']) {                    // stations with their keepers and visitors talking
      const g2 = fresh(sp); H.run(g2, 2);
      for (const id of ['dot', 'peri', 'thud', 'fern', 'rust', 'blat']) Npcs.say(g2, id, 'Pirates lurk 200 to 300 m round Potato.', 'hint');
      const st = Stations.byId(g2, sp);
      for (const zoom of [0.3, 3, 12, 40]) { cam.zoom = zoom; [cam.x, cam.y] = st.state(g2.t); H.run(g2, 5); draw(g2); frames++; }
    }
    check('hooks draw bubbles, radio, FAVOURS, stations with visitors: no NaN', !bad.length && calls - c0 > 3000, `${frames} frames, ${calls - c0} calls${bad.length ? ', bad: ' + bad.slice(0, 3).join(' ') : ''}`);
  }

  // ---------------- 13. a long walk on Mochi with everyone talking ----------------
  {
    const g = fresh(); H.run(g, 2); standBy(g, 'mumble', 1.3);
    let err = null;
    try { for (let i = 0; i < 600; i++) H.run(g, 1, { keys: i % 200 < 100 ? ['KeyD'] : ['KeyA'], pressed: i % 50 === 0 ? ['KeyF'] : [] }); } catch (e) { err = e; }
    check('600 frames walking about the pad, pressing F: no throw', !err && Number.isFinite(g.astro.x), err ? err.message : `${M(g).bubbles.length} bubbles, ${g.events.filter((e) => /^npc /.test(e.msg)).length} npc log lines`);
  }

  // ---------------- 14. child runs ----------------
  {
    const { spawnSync } = require('child_process');
    for (const flag of ['--nomochi', '--solo']) {
      const r = spawnSync(process.execPath, [__filename, flag], { encoding: 'utf8' });
      process.stdout.write(r.stdout.split('\n').filter((l) => /PASS|FAIL/.test(l)).map((l) => l + '\n').join(''));
      check(`child run ${flag} passes`, r.status === 0, r.status ? (r.stderr || r.stdout).slice(-300) : '');
    }
  }
}

if (MODE === 'nomochi') {
  // ---------------- fallbacks: no Mochi spots ----------------
  const g = fresh(); H.run(g, 2);
  const L = Npcs.list(g), pip = L.find((n) => n.id === 'pip'), mum = L.find((n) => n.id === 'mumble'), annie = L.find((n) => n.id === 'annie');
  const thOf = (n) => Math.atan2(n.ly, n.lx);
  check('Pip and Mumble at their fallbacks by the pad', pip && mum && Math.abs(thOf(pip) - (Math.PI / 2 + 0.055)) < 0.01 && Math.abs(thOf(mum) - (Math.PI / 2 + 0.047)) < 0.01 && !pip.spot);
  check('Annie falls back to Waffle', annie && annie.body.id === 'waffle');
  check('no named extras, no crowds without spots', !L.some((n) => n.kind === 'extra'), L.filter((n) => n.kind === 'extra').map((n) => n.id).join(','));
  standBy(g, 'mumble', 1.3); pressF(g); H.run(g, 2);
  check('talk to Mumble at the fallback: met, meet job', M(g).met.mumble && g.done.meet !== undefined);
  check('Mumble stands on the ground', (() => { const T = Terrain.of(mum.body), n = byId(g, 'mumble'); return Terrain.solid(T, n.lx - n.ux * 0.4, n.ly - n.uy * 0.4) && !Terrain.solid(T, n.lx + n.ux * 0.5, n.ly + n.uy * 0.5); })());
}

if (MODE === 'solo') {
  // ---------------- npcs alone: no stations, wrecks, mochi, combat ----------------
  const g = fresh(); H.run(g, 2);
  const L = Npcs.list(g);
  check('surface NPCs still place', L.some((n) => n.id === 'pip') && L.some((n) => n.id === 'mumble') && L.some((n) => n.id === 'halite'), `${L.length} placed`);
  check('no keepers or visitors without stations', !L.some((n) => n.station));
  let err = null;
  try { standBy(g, 'mumble', 1.3); for (let i = 0; i < 600; i++) H.run(g, 1, { pressed: i % 40 === 0 ? ['KeyF'] : [] }); } catch (e) { err = e; }
  check('600 frames with only npcs: no throw', !err && Number.isFinite(g.astro.x), err ? err.stack.split('\n').slice(0, 3).join(' ') : '');
  // (eva is filtered out too, so nobody walks: read the prompts straight from the hook)
  M(g).met.mumble = true; M(g).met.queso = true;
  standBy(g, 'mumble', 1.3); const pm = npcF(g);
  standBy(g, 'queso', 1.3); const pq = npcF(g);
  check('Mumble still has a favour (salt needs nothing)', pm && pm.text === 'Talk to Mumble (a favour?)', pm ? pm.text : 'none');
  check('favours that need missing modules are never offered (Queso, no wrecks)', pq && pq.text === 'Talk to Queso', pq ? pq.text : 'none');
  check('Npcs.say on a keeper without stations: a radio bubble, no throw', !!Npcs.say(g, 'dot', 'Hello?', 'chat') && M(g).radio.some((b) => b.id === 'dot'));
}

console.log(`\n${nPass} passed, ${nFail} failed`);
process.exit(nFail ? 1 : 0);
