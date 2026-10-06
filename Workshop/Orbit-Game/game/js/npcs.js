// ======================================================================
//  NPCS  —  aliens: six races, named NPCs and crowds, speech bubbles in
//  procedural alien scripts, the translator reveal, favours.
//  API: Npcs.list(g), say(g, who, text, mood), drawSprite(ctx, race, look, st),
//       script(race, word, w, h), readable(g, race, word), translator(g), RACES, DEFS
//  (also: talking(g, id), keeperOf(stationId), FAVOURS, decodeBot)
// ======================================================================

const Npcs = (() => {

  // ---------------- tuning ----------------
  const TALK_R = 3;                          // F talks within this [m]
  const BARK_R = 12, BARK_GAP = 45;          // named NPCs bark within this [m], each at most once per this [s real]
  const CROWD_R = 6, CROWD_GAP = 25;         // extras bark within this [m], once per spot per this [s real]
  const VISIT_R = 60;                        // station visitors bark when the ship comes this close to their station [m]
  const BARK_ANY = 6;                        // [s real] between any two ambient barks
  const HAND_R = 40;                         // hand-ins come from the ship's hold within this [m]
  const NEAR_R = 200;                        // update and draw only NPCs this close to the camera [m]
  const MIN_PX = 22, VISIT_PX = 32;          // smallest on-screen NPC (station visitors) [px]
  const UP_MAX = 1.6, VISIT_UP = 2.2;        // ...but never more than this times life size (crowds; station visitors)
  const DOT_PX = 9, BMP_PX = 30;             // on screen: under DOT_PX a dot, under BMP_PX a cached bitmap, else the full painter [px]
  const DRAW_ZOOM = 1.5, CROWD_ZOOM = 3;     // sprites only above this zoom; crowd extras only above CROWD_ZOOM [px/m]
  const BUB_W = 236, GLYPH_H = 13, LINE_H = 20, MAX_WORLD = 3, FADE_R = 60, RADIO_MAX = 4, RADIO_Y = 84;
  const HEARD_MAX = 400, FIRST_HINT_T = 14;
  const SNAP_UP = 1.2, SNAP_DOWN = 4;        // feet snap: raycast from this far up, this far down [m]
  const INK = '#1b1433', PAPER = '#fff4dc', PAPER2 = '#ffe2b0', BONE = '#f6ecd6';
  const FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif';
  const on = (g, id) => !!(g && g.mod && g.mod[id]);


  // ======================================================================
  //  DATA
  // ======================================================================

  // ---------------- races ----------------
  //  h: sprite height [m] · cps: typewriter chars per second · breathes: wears a helmet where there is no air
  //  head: [x, y, r] of the head in the sprite frame (radio portraits) · glyphs: what the script looks like (hints)
  const RACES = {
    pipkin:    { name: 'Pipkin',     tag: 'PIPKIN',     col: '#8fe07a', tint: '#d4f7c4', h: 1.45, cps: 30, breathes: true,  head: [0, 1.06, 0.46], lang: 'Belt Common', glyphs: 'letters' },
    murk:      { name: 'Murk',       tag: 'MURK',       col: '#8a78c4', tint: '#ddd3ff', h: 2.0,  cps: 24, breathes: true,  head: [0, 1.4, 0.5],   lang: 'Murk',        glyphs: 'dots' },
    oggle:     { name: 'Oggle',      tag: 'OGGLE',      col: '#ff5d8f', tint: '#ffd0de', h: 1.6,  cps: 36, breathes: true,  head: [0, 0.9, 0.72],  lang: 'Oggle',       glyphs: 'notches' },
    crustling: { name: 'Crustling',  tag: 'CRUSTLING',  col: '#b8a99a', tint: '#ece2d6', h: 1.5,  cps: 10, breathes: false, head: [0, 0.8, 0.8],   lang: 'Crustling',   glyphs: 'rock stripes' },
    orbiloon:  { name: 'Orbiloon',   tag: 'ORBILOON',   col: '#7fd8ff', tint: '#cdeeff', h: 2.1,  cps: 22, breathes: false, head: [0, 1.5, 0.72],  lang: 'Orbiloon',    glyphs: 'little orbits' },
    bot:       { name: 'Survey Bot', tag: 'SURVEY BOT', col: '#ff9f43', tint: '#ffd9b0', h: 1.27, cps: 40, breathes: false, head: [0, 0.7, 0.5],   lang: 'Bot',         glyphs: 'blinking bits' },
  };

  // ---------------- palettes [base, shade, highlight] ----------------
  const PALS = {
    pipkin: { sprout: ['#8fe07a', '#4f9e45', '#d8ffbf'], lime: ['#c8e66a', '#86a33a', '#f1ffc0'], yellow: ['#f2e06b', '#b8a23a', '#fff8c8'],
              peach: ['#ffd8b8', '#d49a78', '#fff1e4'], pink: ['#ffb3c7', '#c96f8b', '#ffe3ea'], plum: ['#c9a0e8', '#8a5fb0', '#efe0ff'] },
    cloth:  { blue: ['#7fb8ff', '#4a74b8', '#d6e8ff'], orange: ['#ff9f43', '#c25f1c', '#ffd8a6'], teal: ['#6fd6c8', '#3a8f86', '#d4fff6'],
              red: ['#ff6b6b', '#b83a3a', '#ffd0d0'], lavender: ['#b9a6f2', '#7262b0', '#e8e0ff'] },
    murk:   { dusk: ['#4a3a72', '#2a1f45', '#7c6aaa'], soot: ['#3c3748', '#1f1b29', '#6a6480'], plum: ['#5c3158', '#331a32', '#8c5c88'] },
    oggle:  { grape: ['#7448c2', '#4b2a86', '#c3a6ff'], moss: ['#6cc26a', '#3d7c3b', '#c6f5b8'], tangerine: ['#ff9a4d', '#b85a1e', '#ffd4a8'],
              teal: ['#4fb3a6', '#2b6f67', '#b6f0e6'] },
    crustling: { granite: ['#b8a99a', '#76665f', '#e2d6c8'], slate: ['#a69bb8', '#675c7c', '#d6cde6'], sandstone: ['#d0ab84', '#86684c', '#f2d8b6'],
                 basalt: ['#78748a', '#45404f', '#aca7bd'] },
    orbiloon: { sky: ['#a8e6ff', '#5aa8d8', '#ffffff'], lilac: ['#d6b8ff', '#9a7ad0', '#ffffff'], mint: ['#a8f5d0', '#5fbf95', '#ffffff'],
                peach: ['#ffc8a8', '#d08a68', '#ffffff'] },
    bot: { survey: ['#e8e4f7', '#a9a2cc', '#ffffff'], rust: ['#f0c0a0', '#b07a62', '#fff0e6'], mint: ['#c9f3e6', '#86bfae', '#ffffff'] },
  };
  const ACCS = {                                   // what the crowd may wear (null = nothing)
    pipkin: [null, null, 'apron', 'cap', 'hardhat', 'goggles', 'sash'],
    murk: [null, null, 'scarf', 'monocle', 'lantern'],
    oggle: [null, 'bandana', 'cap', 'goggles', 'apron', 'vest'],
    crustling: [null, 'moss', 'salt', 'amethyst'],
    orbiloon: [null, 'specs', 'scroll', 'lamp'],
    bot: [null, 'clipboard', 'dish', 'spoon'],
  };
  const EYES = ['#ffe066', '#7cf5d6', '#ff9ec7'];

  // ---------------- the cast: 28 named NPCs (lore §6) ----------------
  //  at: { station, keeper } | { station, x, y } (visitor, station frame) | { spot, k, fallback: { body, th } } | { body, th }
  //  lines: [mood, text], each <= 90 chars. Keepers' lines live in stations.js (they talk without npcs too).
  const PI2 = Math.PI / 2;
  const DEFS = [
    // ---- Mochi Hub ----
    { id: 'dot', name: 'Dockmaster Dot', short: 'Dot', race: 'pipkin', look: { ripe: 'pink', cloth: 'blue', acc: 'headset' }, at: { station: 'hub', keeper: true } },
    { id: 'peri', name: 'Peri', race: 'orbiloon', look: { pal: 'sky', acc: 'wand' }, at: { station: 'hub', x: -9, y: 19 }, lines: [
      ['hint', "Inside 4 km, Mochi is the boss of you. Outside, Ember is. That's the Hill sphere."],
      ['hint', 'Leaving from the Hub costs 8.6 m/s. A lane change on top, burned down here: 0.05 more.'],
      ['hint', 'One 15 m/s burn low leaves Mochi at 19 m/s. Escape first, 5 later: you leave at 5. Oberth!'],
      ['joke', "I don't float. I fall very politely, and burp now and then."],
      ['chat', 'Traffic is light. Traffic is always light. I am still very busy.']] },
    { id: 'thud', name: 'Sergeant Thud', short: 'Thud', race: 'oggle', look: { pal: 'teal', iris: '#ffd166', acc: 'cap' }, at: { station: 'hub', x: 6, y: -27, float: true }, lines: [
      ['grumpy', 'Hub Patrol. Seven hundred metres round Mochi is my patch. Pirates know it.'],
      ['lore', 'We were all patrol once. Then the Hub bought a bigger fryer instead of paying us.'],
      ['lore', 'Half of us quit and went pirate. The Free Company. I call them Gary.'],
      ['hint', 'Pirates give up once you leave their patch. Running is a strategy. Ask Gary.'],
      ['joke', 'One eye is plenty. Two eyes is showing off.']] },
    // ---- Mochi surface ----
    { id: 'pip', name: 'Pip', race: 'pipkin', look: { ripe: 'yellow', cloth: 'orange', acc: 'apron' },
      at: { spot: 'pad', k: 0, fallback: { body: 'mochi', th: PI2 + 0.055 } }, lines: [
      ['hint', 'Hold left click to dig. Blue is ice, rusty is iron. Ice pays the bills.'],
      ['chat', "Pad prices are worse than upstairs. I'm closer. That's the whole pitch."],
      ['lore', "Your ship's the same make old Radish flew. Radish went to Glimmer. Never came back."],
      ['hint', "Touch down under 2.5 m/s, legs first. The pad forgives. Mochi doesn't."],
      ['joke', 'One kettle is for tea, one is for fuel. Do not mix up the kettles.']],
      favour: 'scoop',
      offer: ['want', 'Find Radish\'s ship on Glimmer? Finders Keepers. Tell me what the log says.'],
      wait: ['sad', 'Any word from Glimmer? Radish always said one more scoop.'],
      done: ['sad', '"Don\'t say one more scoop." That\'s Radish all right. Thanks, rookie.'] },
    { id: 'mumble', name: 'Mumble', race: 'murk', look: { pal: 'dusk', eye: '#ffe066', acc: 'scarf' },
      at: { spot: 'pad', k: 1, fallback: { body: 'mochi', th: PI2 + 0.047 } }, lines: [
      ['gossip', "Rust is my cousin. No, that doesn't get you a discount."],
      ['chat', 'Ember is very loud today. I am staying in the shade.'],
      ['gossip', 'Velvet in the Cellar knows things. Everything I know, plus more.'],
      ['lore', 'We dug the first tunnels. The Pipkins put up the signs. The signs are wrong.']],
      favour: 'salt',
      offer: ['want', 'Two salt crystals. For seasoning. Do not ask what I season.'],
      wait: ['want', 'Salt crystals glitter white in the dirt. Two, please.'],
      done: ['happy', 'Ahh. Crunchy. Here, take this before I change my mind.'] },
    { id: 'okra', name: 'Foreman Okra', short: 'Okra', race: 'pipkin', look: { ripe: 'lime', cloth: 'teal', acc: 'hardhat' },
      at: { spot: 'outpost-ice', k: 0, fallback: { body: 'mochi', th: PI2 + 0.9 } }, lines: [
      ['hint', "Ice digs easy. Iron's tough, nickel's tougher. Platinum? Bring a better laser."],
      ['hint', 'Pack full? Walk back and press E. It all tips into the hold.'],
      ['chat', 'Safety first. And second. Mining comes about fourth.'],
      ['joke', 'I asked for a drill. They sent a laser. I asked for a crew. They sent you.']],
      favour: 'rig',
      offer: ['want', 'The rig needs 40 kg of iron. Rusty orange blobs, a bit deeper. Pays fair.'],
      wait: ['want', 'Forty kilos of iron, rookie. Rusty orange blobs.'],
      done: ['happy', 'Good iron! The rig says thanks. Well, it creaks. Same thing.'] },
    // ---- Mochi's tunnels ----
    { id: 'grubb', name: 'Cookie Grubb', short: 'Grubb', race: 'oggle', look: { pal: 'tangerine', iris: '#ffd166', acc: 'apron' },
      at: { spot: 'canteen', k: 0, fallback: { body: 'mochi', th: PI2 + 0.38 } }, lines: [
      ['joke', 'Every fry on Mochi comes from my fryer. Up the Hub too. They send a drone.'],
      ['lore', 'I cooked for Captain Crunch. He was cereal-ously bad at tipping.'],
      ['gossip', "Pirates eat here on Tuesdays. Truce day. Don't start anything on a Tuesday."],
      ['hint', 'Low on fuel out in the outer lane? Rust sells it dear. Dear beats drifting.']],
      favour: 'noodles',
      offer: ['want', '25 kg of ice for the noodle water. Fresh ice, not hull ice.'],
      wait: ['want', 'Still need 25 ice. My noodles are sad and crunchy.'],
      done: ['happy', "NOODLES ARE GO! Have some fries. They fix suits. Don't ask how."] },
    { id: 'gneiss', name: 'Grandpa Gneiss', short: 'Gneiss', race: 'crustling', look: { pal: 'slate', R: 1.4, seed: 3, acc: 'amethyst' },
      at: { spot: 'gallery', k: 0, fallback: { body: 'mochi', th: PI2 + 0.46 } }, lines: [
      ['lore', 'Before the crumbs... there was the Loaf. A whole world. Then it... went stale.'],
      ['lore', 'Survey folk say the Loaf never rose. Too little dough. Young rocks. So sure.'],
      ['gossip', 'Cousin Lou napped on Big Potato. Set an alarm for six. Six... centuries.'],
      ['hint', 'Hurry is... expensive. Coast. Warp. The rocks... will wait.'],
      ['joke', 'I was here before the Hub. Before the tunnels. I am... the wall.']] },
    { id: 'velvet', name: 'Velvet', race: 'murk', look: { pal: 'plum', eye: '#7cf5d6', acc: 'monocle' },
      at: { spot: 'cellar', k: 0, fallback: { body: 'mochi', th: PI2 - 0.3 } }, lines: [
      ['gossip', "Void opals on Glimmer, guns included. Truffle's quiet. For now. Choose."],
      ['gossip', "Rust holds the pirates' pension fund. That's why Rust's is neutral."],
      ['gossip', 'Pirates radio in Belt Common so you understand the threats. Considerate.'],
      ['lore', 'We read with our fingers. Ink is shouting. Receipts are very rude.']],
      favour: 'fire',
      offer: ['want', 'One fire opal. Seed has a few, Big Potato too. I pay above market.'],
      wait: ['want', 'Fire opal: pink fire in the rock. Seed, or Big Potato.'],
      done: ['happy', 'Warm. Lovely. And a secret: Truffle has void opals, and no pirates. Yet.'] },
    { id: 'unit7', name: 'UNIT-7', race: 'bot', look: { pal: 'survey', acc: 'clipboard' },
      at: { spot: 'archive', k: 0, fallback: { body: 'mochi', th: PI2 - 0.38 } }, lines: [
      ['lore', 'EMBER SURVEY AGENCY ARCHIVE. ESA. NO RELATION. TO ANYTHING.'],
      ['lore', 'INTERN PROJECT 4 WORKED FOR ELEVEN GLORIOUS MINUTES. IT STILL ORBITS MOCHI.'],
      ['joke', 'EMBER MASS 3.8E17 KG. 400 BILLION TIMES TOO LIGHT TO BE A STAR. IT BURNS ANYWAY.'],
      ['hint', 'MOCHI DOES NOT SPIN. EMBER CROSSES ITS SKY ONCE PER LAP. 1 DAY = 108 MINUTES.']],
      favour: 'hiback',
      offer: ['want', 'MY LITTLE BROTHER PHIL LANDED ON SEED. HE SAID HI. PLEASE SAY HI BACK.'],
      wait: ['want', "PHIL IS ON SEED, KIWI'S MOON, IN THE SHADE. WALK UP CLOSE. SAY HI."],
      done: ['happy', 'PHIL SAYS HI. PHIL SAYS HI. LOGGING THIS FOREVER.'] },
    { id: 'sizzy', name: 'Sizzy', race: 'orbiloon', look: { pal: 'lilac', acc: 'specs' },
      at: { spot: 'skylight', k: 0, fallback: { body: 'mochi', th: PI2 - 0.46 } }, lines: [
      ['hint', 'Inner lane runs 32 m/s, ours 29, outer 26. Closer to Ember, faster you go.'],
      ['hint', 'Mochi lane to inner lane: 1.7 m/s to drop in, 1.8 to settle, 46 minutes between.'],
      ['hint', 'Heading inward? Leave when your target trails Mochi by about 35 degrees.'],
      ['hint', 'The inner lane laps us every four and a half hours. Missed it? Warp and wait.'],
      ['warn', 'Never go within 3.6 km of Ember. We call it the Sizzle. So will your hull.']],
      favour: 'exposure',
      offer: ['want', "Dr. Voss's ship still circles Glimmer, shutter open. Bring her last photo home?"],
      wait: ['want', 'Long Exposure circles Glimmer 70 m out. Match its orbit, then salvage.'],
      done: ['sad', "It developed. It's all dark... and full of stars. She was right."] },
    { id: 'chive', name: 'Chive', race: 'pipkin', look: { ripe: 'sprout', cloth: 'red', acc: 'cap' },
      at: { spot: 'market', k: 1, fallback: { body: 'mochi', th: PI2 + 0.3 } }, lines: [
      ['chat', 'Are you a real prospector? With a real ship? Can I sit in it? No? Okay.'],
      ['joke', 'When I ripen I want to go purple like Radish. Purple is the best colour.'],
      ['gossip', "There's a muncher on Kiwi called Mochi. Same as our rock! So funny."],
      ['hint', 'Hold W after a jump and the jetpack kicks in! It says so on the box.']],
      favour: 'shiny',
      offer: ['want', "Could you bring me some Kiwi amber? Just one? I'll be SO careful."],
      wait: ['want', 'Amber is orange and glowy. Kiwi has some. Dorito too!'],
      done: ['happy', "IT'S SO SHINY. I'm naming it Gerald. Here's all my pocket money."] },
    // ---- Mochi's moons ----
    { id: 'fern', name: 'Granny Fern', short: 'Fern', race: 'pipkin', look: { ripe: 'peach', cloth: 'lavender', acc: 'bun' }, at: { station: 'outpost', keeper: true },
      favour: 'drawer',
      offer: ['want', "Basil's pod, Lettuce Pray, still circles Kiwi. The good seeds are in the blue drawer."],
      wait: ['want', 'Lettuce Pray goes round Kiwi at 74 m, dear. Salvage it, then come and see me.'],
      done: ['happy', 'His good seeds! Oh, Basil. Take a radish, dear. Take two.'] },
    { id: 'queso', name: 'Queso', race: 'pipkin', look: { ripe: 'yellow', cloth: 'orange', acc: 'sash' }, at: { body: 'dorito', th: -1.0 }, lines: [
      ['chat', 'Dorito Day comes every time Dorito laps Mochi. Every 5 minutes 23 seconds!'],
      ['joke', "The festival needs 4,000 crates of chips. We have one. It's mostly crumbs."],
      ['gossip', 'Courier Tamsin crashed on our far side. Right on time. Very, very hard.'],
      ['grumpy', 'The Nacho Nibblers ate the bunting. And the backup bunting.']],
      favour: 'dorito',
      offer: ['want', 'Salvage the Cool Ranch Express? Whatever chips survived, the festival needs!'],
      wait: ['want', "The Cool Ranch Express is half-buried on Dorito's far side. Land close, rummage!"],
      done: ['happy', "CHIPS! Dorito Day is saved! It's today! It's always nearly today!"] },
    // ---- the Mochi lane ----
    { id: 'halite', name: 'Old Halite', short: 'Halite', race: 'crustling', look: { pal: 'granite', R: 0.8, seed: 11, acc: 'salt' }, at: { body: 'pretzel', th: 1.0 }, lines: [
      ['chat', 'Pretzel and Mochi... share one orbit. Same speed. We chase... never meet.'],
      ['hint', 'To reach me from Mochi... leave going backwards. Lower... is faster. You catch up.'],
      ['joke', 'Salt grows on me. Literally. Do not... laser the hermit.'],
      ['lore', 'The Crumbs swarm... breathes in and out... once a lap. I count. I like counting.'],
      ['warn', 'Swarm rocks... come big. Fifteen metres. Do not... hug them.']] },
    { id: 'annie', name: 'Anvil Annie', short: 'Annie', race: 'oggle', look: { pal: 'grape', iris: '#ffd166', acc: 'goggles' },
      at: { spot: 'forge', k: 0, fallback: { body: 'waffle', th: 0.6 } }, lines: [
      ['lore', 'Forty years a pirate. Then I learned hitting metal pays better than hitting ships.'],
      ['gossip', "Marge runs the Free Company from Pickle now. 'Retired.' Pirates never retire."],
      ['hint', 'Heavier ship, less Δv. Every bolt you add, you push forever. Weigh your toys.'],
      ['joke', 'Waffle has square holes. Nobody knows why. I blame the Murk.']],
      favour: 'forge',
      offer: ['want', 'Bring me 30 kg of nickel. Olive-green blobs, deep in. The forge is hungry.'],
      wait: ['want', 'Thirty nickel. Olive-green. Dig deep, dig hard.'],
      done: ['happy', 'GOOD NICKEL! Here, coin. Mind your fingers, the anvil bites.'] },
    { id: 'beeper', name: 'BEEPER', race: 'bot', look: { pal: 'mint', acc: 'dish' }, at: { body: 'nugget', th: PI2 }, lines: [
      ['chat', 'BELT NEWS. SWARMS: BREATHING NORMALLY. EMBER: HOT. PIRATES: RUDE. END.'],
      ['hint', 'SWARM ROCKS SHARE ONE ORBIT SIZE, SO ONE PERIOD. THEY NEVER SHEAR APART.'],
      ['hint', 'DOUBLE YOUR ORBIT SIZE AND A LAP TAKES 2.8 TIMES LONGER. KEPLER. EVERY TIME.'],
      ['joke', 'RELAY STATION 3. RELAYS 1 AND 2 DO NOT EXIST. DO NOT ASK ABOUT 1 AND 2.'],
      ['gossip', 'INTERN PROJECT 5 IS ON MACARON. STILL UNPAID. STILL WORKING.']] },
    { id: 'nodey', name: 'Nodey', race: 'orbiloon', look: { pal: 'mint', acc: 'scroll' }, at: { body: 'crouton', th: 2.0 }, lines: [
      ['hint', 'Press M for the map: every lane, every rock, and you. Mostly you.'],
      ['hint', 'Swarms live between the lanes: the Crumbs inside ours, the Gravel Gang outside.'],
      ['hint', "Swarms breathe in and out once a lap. A gap that's shut now opens later."],
      ['chat', 'I mapped every rock in the Crumbs. Then they moved. So I mapped them again.']] },
    // ---- the outer lane ----
    { id: 'rust', name: 'Rust', race: 'murk', look: { pal: 'soot', eye: '#ffe066' }, at: { station: 'rusts', keeper: true } },
    { id: 'blat', name: 'Bouncer Blat', short: 'Blat', race: 'oggle', look: { pal: 'moss', iris: '#ffd166', acc: 'vest' }, at: { station: 'rusts', x: 7.8, y: 6.0 }, lines: [
      ['grumpy', 'No fighting in the bubble. Two hundred sixty metres. I measured with my arms.'],
      ['chat', "Rust says I'm staff. I say I'm family. Rust says no receipts."],
      ['hint', 'Pirates lurk 200 to 300 m round Potato. Come in high, dock quick.'],
      ['joke', 'I bounced Captain Crunch once. He bounced three more times. Low gravity.']] },
    { id: 'shale', name: 'Aunt Shale', short: 'Shale', race: 'crustling', look: { pal: 'sandstone', R: 1.0, seed: 5, acc: 'moss' }, at: { body: 'potato', th: 0.95 }, lines: [
      ['gossip', "Lou's fine. He's the rock next to the pod. Please... don't laser Lou."],
      ['chat', "The Tater Tanks think I'm their mother. I've stopped... correcting them."],
      ['hint', 'Big Potato pulls 2.2. More than Mochi. Mind your landing.'],
      ['lore', "Pirates keep off my side. I'm very old. And very... heavy."]] },
    { id: 'lou', name: 'Captain Lou', short: 'Lou', race: 'crustling', look: { pal: 'granite', R: 1.3, seed: 9, asleep: true }, at: { body: 'potato', th: 0.63 }, lines: [
      ['chat', 'Zzzz...'],
      ['chat', '...six... six what...'],
      ['joke', '...five more... centuries...'],
      ['chat', 'Zzz... hm? ...no.']] },
    { id: 'marge', name: 'Mad Marge', short: 'Marge', race: 'oggle', look: { pal: 'grape', iris: '#ff3b5c', acc: 'tricorn' },
      at: { spot: 'brinepit', k: 0, fallback: { body: 'pickle', th: 1.2 } }, lines: [
      ['lore', 'The Free Company of the Crumb. I founded it. Gary just works here. Badly.'],
      ['gossip', 'Kessler Kate wants more debris. Nobody wants more debris. Except Kate.'],
      ['joke', 'One-Eyed Wally has two eyes. Wears a patch to fit in. We let him.'],
      ['hint', 'Out past Biscotti we hunt in pairs. Watch your back. Then your front.']],
      favour: 'union',
      offer: ['want', "Gary's been skimming. Knock down three pirates and I'll pay their bounty again."],
      wait: ['grumpy', 'Three pirates. Any three. Gary would be nice.'],
      done: ['happy', "Ha! That'll teach them to skim. Union business concluded."] },
    { id: 'basalt', name: 'Brother Basalt', short: 'Basalt', race: 'crustling', look: { pal: 'basalt', R: 1.0, seed: 13, acc: 'hood' }, at: { body: 'biscotti', th: PI2 }, lines: [
      ['chat', '...'],
      ['chat', '... ...'],
      ['lore', 'The rock does not hurry. The rock arrives.'],
      ['joke', 'I have taken a vow of silence.']] },
    // ---- the inner lane ----
    { id: 'lulu', name: 'Lulu', race: 'orbiloon', look: { pal: 'peach', acc: 'lamp' }, at: { station: 'lantern', keeper: true } },
    { id: 'glint', name: 'Glint', race: 'murk', look: { pal: 'dusk', eye: '#ff9ec7', acc: 'lantern' }, at: { body: 'glimmer', th: 2.45 }, lines: [
      ['gossip', 'Void opals glow purple in the dark. I see them. You need a scanner.'],
      ['warn', 'One more scoop, they say. Then the pirates come. Then no more scoops.'],
      ['chat', "Mine. Mine. That one's mine too. You may have... that pebble."],
      ['hint', 'Glimmer pulls just 1.2. Escape speed under 8 m/s. Jetpacks get ideas.']] },
    { id: 'intern5', name: 'INTERN-5', race: 'bot', look: { pal: 'rust', acc: 'spoon' }, at: { body: 'macaron', th: 0.4 }, lines: [
      ['joke', 'ESA INTERN PROJECT 5. PROJECT 4 RAN ELEVEN MINUTES. I HAVE RUN ELEVEN YEARS.'],
      ['sad', 'NOBODY HAS TOLD MY SUPERVISOR. I THINK MY SUPERVISOR IS PROJECT 3.'],
      ['hint', 'PLATINUM IS VERY HARD. BUY A BETTER LASER. I USE A SPOON.'],
      ['chat', 'STATUS: UNPAID. MORALE: HIGH. CONFUSING.']] },
    { id: 'radish', name: 'Radish', race: 'pipkin', look: { ripe: 'plum', cloth: 'orange', acc: 'goggles', helmet: true }, at: { body: 'truffle', th: 1.9 }, after: 'scoop', lines: [
      ['joke', 'I said one more scoop. The vein said no. The pirates said yes. I left.'],
      ['lore', 'Lulu of the Lantern, way out, fished me out of the dark off Glimmer. Purple and furious.'],
      ['hint', "Truffle has void opals and nobody shooting. Don't tell everyone. Tell Pip."],
      ['chat', 'Same make as my old ship! Be kind to her. She hates crumbs in the vents.']] },
  ];
  const DEF = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  const KEEPER_OF = { hub: 'dot', outpost: 'fern', rusts: 'rust', lantern: 'lulu' };

  // ---------------- named extras: mochi's shopkeepers and helpers (contract §5.2) ----------------
  const NAMED_EXTRAS = [
    { id: 'tansy', name: 'Tansy', race: 'pipkin', look: { ripe: 'lime', cloth: 'teal', acc: 'pennant' }, spot: 'guide', k: 0,
      line: ['hint', "Downtown's down the stair. Lift's by the pad. The signs are wrong."] },
    { id: 'clunk', name: 'Clunk', race: 'oggle', look: { pal: 'moss', iris: '#ffd166', acc: 'hose' }, spot: 'lift', k: 0,
      line: ['joke', 'LIFT NAMED AFTER ME. OR ME AFTER IT. NOBODY REMEMBERS.'] },
    { id: 'parsnip', name: 'Parsnip', race: 'pipkin', look: { ripe: 'peach', cloth: 'orange', acc: 'apron' }, spot: 'market', k: 0,
      line: ['chat', 'Gems at a dime over Hub price. Everything else a bit under.'] },
    { id: 'sorrel', name: 'Sorrel', race: 'pipkin', look: { ripe: 'yellow', cloth: 'blue', acc: 'hardhat' }, spot: 'guild', k: 0,
      line: ['chat', "Diggers' guild. Suits, lights, jetpacks. Guild rate for ore."] },
    { id: 'bonk', name: 'Bonk', race: 'oggle', look: { pal: 'tangerine', iris: '#ffd166', acc: 'goggles' }, spot: 'outpost-iron', k: 0,
      line: ['grumpy', 'IRON IN, BOLTS OUT. I HIT THINGS FOR MONEY NOW.'] },
    { id: 'nozzle', name: 'Nozzle', race: 'oggle', look: { pal: 'teal', iris: '#ffd166', acc: 'hose' }, spot: 'pump9', k: 0,
      line: ['joke', 'THERE WERE NEVER PUMPS 1 TO 8. I JUST LIKE THE NUMBER.'] },
    { id: 'twist', name: 'Twist', race: 'pipkin', look: { ripe: 'lime', cloth: 'red', acc: 'twist' }, spot: 'pitstop', k: 0,
      line: ['chat', 'First stop out of Mochi. Fuel, a kettle, no pirates.'] },
  ];

  // ---------------- crowds: unnamed extras per Mochi spot ----------------
  const CROWD = {
    market: { n: 8, races: ['pipkin', 'pipkin', 'pipkin', 'murk', 'oggle', 'orbiloon', 'bot', 'crustling'] },
    canteen: { n: 4, races: ['oggle', 'oggle', 'pipkin', 'murk'] },
    cellar: { n: 3, races: ['murk'] },
    gallery: { n: 2, races: ['crustling'] },
    shrine: { n: 3, races: ['crustling', 'crustling', 'murk'] },
    guild: { n: 2, races: ['pipkin', 'oggle', 'bot'] },
    archive: { n: 1, races: ['bot'] },
    skylight: { n: 1, races: ['orbiloon'] },
    workings: { n: 1, races: ['murk'] },
  };
  const RESERVED = ['Parsnip', 'Sorrel', 'Tansy', 'Clunk', 'Bonk', 'Nozzle', 'Twist', 'Gristle', 'Granny Granite'];
  const POOL = {
    pipkin: ['Dill', 'Kale', 'Fennel', 'Chard', 'Leek', 'Cress', 'Turnip', 'Yam', 'Sprig', 'Clem', 'Rocket', 'Endive'],
    murk: ['Hush', 'Shade', 'Soot', 'Ash', 'Smudge', 'Dusk', 'Lint', 'Purr', 'Nook', 'Wisp'],
    oggle: ['Gubbins', 'Thog', 'Thunk', 'Krag', 'Snag', 'Gronk', 'Mog', 'Gub', 'Brick', 'Yarp'],
    crustling: ['Feldspar', 'Pumice', 'Obsidian', 'Mica', 'Flint', 'Tuff', 'Agate', 'Jasper', 'Marble'],
    orbiloon: ['Loo', 'Oolu', 'Wena', 'Apo', 'Hoo', 'Eppie', 'Nimbus', 'Ziggy'],
    bot: ['UNIT-3', 'UNIT-9', 'MOP-2', 'PROBE 4B', 'TOASTR', 'SKID', 'RELAY 6', 'BLINK'],
  };
  const BARKS = {
    pipkin: ['Morning! Or evening. The sky goes round every 108 minutes.', "Have you tried Grubb's fries? You should.",
             'Dug a blue blob today. Ice! Rich at last. Well, forty dollars.', 'Watch your air out there, rookie.',
             'My cousin ripened last week. Very yellow. Very proud.', 'Welcome to Mochi! Mind the signs. The signs are wrong.'],
    murk: ['Shh.', 'Too bright.', 'Mind the drip.', 'I saw nothing.', "Nice hood. Oh. It's a helmet.", 'The tunnels remember.'],
    oggle: ['OI.', 'WHAT YOU LOOKING AT? OH, A ROOKIE. CARRY ON.', 'NICE SHIP. SHAME IF A ROCK HIT IT.', 'I AM NOT A PIRATE. ANYMORE.',
            'FRIES!', 'ONE EYE. ALL SEEING. MOSTLY.'],
    crustling: ['...hm.', 'Hello... in a while.', 'Young... pebble.', '...the dust settles.', 'Mind... my toes.', 'Zzz...'],
    orbiloon: ['Wheee.', 'Lovely orbit you have.', 'Prograde is the way up.', 'Hello, falling friend.', 'Mind the swarms.', 'Ember is pretty today.'],
    bot: ['BEEP.', 'HELLO. HELLO.', 'SCANNING. YOU ARE A PIPKIN.', 'BATTERY: VIBES.', 'SURVEY CONTINUES.', 'PLEASE STAND STILL. THANK YOU.'],
  };

  // ---------------- favours (lore §7): requests that pay 1.5-3x the market ----------------
  //  item + qty: a hand-in · check(g): an event (then tell the giver) · keeper: a station keeper (dock there; no F)
  //  needs: modules it relies on (never offered without them) · mvp: on in every build; the rest are stretch, also on
  const FAVOURS = {
    salt:    { giver: 'mumble', item: 'salt', qty: 2, reward: 150, ask: '2 salt crystals', where: 'dig Mochi, 2-10 m down', mvp: true },
    noodles: { giver: 'grubb', item: 'ice', qty: 25, reward: 80, ask: '25 kg of ice', where: 'Mochi is full of it', mvp: true },
    shiny:   { giver: 'chive', item: 'amber', qty: 1, reward: 140, ask: '1 Kiwi amber', where: 'dig Kiwi', mvp: true },
    forge:   { giver: 'annie', item: 'nickel', qty: 30, reward: 220, ask: '30 kg of nickel', where: 'Dorito has it', mvp: true },
    drawer:  { giver: 'fern', keeper: 'outpost', needs: ['wrecks'], wreck: 'lettuce', reward: 250, ask: 'salvage Lettuce Pray', tell: 'dock at Kiwi Outpost', mvp: true },
    rig:     { giver: 'okra', item: 'iron', qty: 40, reward: 110, ask: '40 kg of iron', where: 'Mochi or Dorito' },
    fire:    { giver: 'velvet', item: 'opal', qty: 1, reward: 380, ask: '1 fire opal', where: 'Seed, Pickle or Big Potato' },
    dorito:  { giver: 'queso', needs: ['wrecks'], wreck: 'coolranch', reward: 200, ask: 'salvage the Cool Ranch Express' },
    exposure: { giver: 'sizzy', needs: ['wrecks'], wreck: 'longexp', reward: 300, ask: 'salvage Long Exposure' },
    scoop:   { giver: 'pip', needs: ['wrecks'], wreck: 'finders', reward: 300, ask: 'salvage Finders Keepers on Glimmer' },
    union:   { giver: 'marge', needs: ['combat'], kills: 3, reward: 500, ask: 'down 3 pirates' },
    hiback:  { giver: 'unit7', needs: ['wrecks'], phil: true, reward: 200, ask: 'say hi to Little Phil on Seed' },
  };

  const MOODS = ['chat', 'hint', 'joke', 'gossip', 'lore', 'warn', 'grumpy', 'sad', 'want', 'happy'];
  const MOOD_TINT = { chat: '#fff4dc', hint: '#d4fff4', joke: '#ffe3ef', gossip: '#ece2ff', lore: '#f3e6c8', warn: '#ffd6d6',
                      grumpy: '#ffe0cc', sad: '#dcecff', want: '#fff0b8', happy: '#dff7d4' };
  const GLOSSARY = ['ember', 'mochi', 'hub', 'brake', 'oberth', 'hohmann', 'kepler', 'lagrange', 'hill', 'rookie', 'esa', 'survey'];
  const LVL_NAME = ['none', 'Pocket Phrasebook', 'Universal Translator', 'Bug Whisperer'];


  // ======================================================================
  //  SCRIPTS  —  pure, deterministic glyph generators (lore Appendix B)
  //  script(race, word, w, h) -> primitives in a w x h box (px, y DOWN, baseline at y = h)
  //  ['dot', x, y, r] ['ring', x, y, r] ['line', x0, y0, x1, y1, lw] ['ell', x, y, rx, ry, rot] ['sq', x, y, s, on] ['spiral', x, y, r]
  // ======================================================================

  function hash32(s) {                                             // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {                                             // mulberry32, as World.rng
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const key = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, '');

  // ---------------- murk: raised dots in 2 x 3 cells (read by touch, in the dark) ----------------
  function glyphMurk(word, w, h, R) {
    const out = [], cells = Math.max(1, Math.round(w / (0.62 * h))), cw = w / cells;
    for (let i = 0; i < cells; i++) {
      const bits = 1 + Math.floor(R() * 63);
      for (let k = 0; k < 6; k++) {
        const x = i * cw + cw * (0.3 + 0.4 * (k % 2)), y = h * (0.2 + 0.3 * Math.floor(k / 2));
        if (bits & (1 << k)) out.push(['dot', x, y, 0.14 * h]);
        else if (R() < 0.3) out.push(['ring', x, y, 0.08 * h]);
      }
    }
    return out;
  }

  // ---------------- oggle: notches on a stem line (carved, ogham-style) ----------------
  function glyphOggle(word, w, h, R) {
    const out = [], y = 0.5 * h, n = Math.max(1, Math.round(w / (0.5 * h))), gw = w / n, lw = Math.max(1.3, 0.11 * h);
    out.push(['line', 0, y, w, y, Math.max(1.5, 0.13 * h)]);
    out.push(['line', 0, y - 0.18 * h, 0.12 * h, y, lw]);                       // the arrowhead every word starts with
    for (let i = 0; i < n; i++) {
      const kind = Math.floor(R() * 4), k = 1 + Math.floor(R() * 3), x0 = i * gw + gw * 0.25, sp = Math.min(0.17 * h, gw * 0.5 / k);
      for (let j = 0; j < k; j++) {
        const x = x0 + j * sp;
        if (kind === 0) out.push(['line', x, y, x, y - 0.42 * h, lw]);
        else if (kind === 1) out.push(['line', x, y, x, y + 0.42 * h, lw]);
        else if (kind === 2) out.push(['line', x, y - 0.4 * h, x, y + 0.4 * h, lw]);
        else out.push(['line', x - 0.14 * h, y + 0.38 * h, x + 0.14 * h, y - 0.38 * h, lw]);
      }
    }
    return out;
  }

  // ---------------- crustling: rock strata (three layers of bars), sometimes a fossil ----------------
  function glyphCrust(word, w, h, R) {
    const out = [], ys = [0.18, 0.5, 0.82], th = [0.18, 0.12, 0.16];
    ys.forEach((yy, L) => {
      let x = R() * 0.15 * h;
      while (x < w - 0.15 * h) {
        const len = Math.min(w - x, (0.35 + R() * 1.1) * h), lw = th[L] * h * (0.7 + 0.6 * R());
        out.push(['line', x + lw / 2, yy * h, x + len - lw / 2, yy * h, lw]);
        x += len + 0.16 * h;
      }
    });
    if (R() < 0.22 && w > h) out.push(['spiral', w * (0.2 + 0.6 * R()), 0.5 * h, 0.32 * h]);
    return out;
  }

  // ---------------- orbiloon: little orbits, each with its planet ----------------
  function glyphOrbi(word, w, h, R) {
    const out = [], n = Math.max(1, Math.round(w / (0.8 * h))), gw = w / n;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * gw, y = 0.5 * h, rx = Math.min(gw * 0.45, 0.42 * h * (0.75 + 0.35 * R())), ry = rx * (0.35 + 0.55 * R()), rot = (R() - 0.5) * 1.3;
      out.push(['ell', x, y, rx, ry, rot]);
      const a = R() * 2 * Math.PI, c = Math.cos(rot), s = Math.sin(rot), px = rx * Math.cos(a), py = ry * Math.sin(a);
      out.push(['dot', x + px * c - py * s, y + px * s + py * c, 0.11 * h]);
      if (R() < 0.4) out.push(['dot', x, y, 0.06 * h]);
      if (R() < 0.2) out.push(['ell', x, y, rx * 0.5, ry * 0.5, rot]);
    }
    return out;
  }

  // ---------------- bot: honest bits. 2 x 4 LEDs per letter: even parity, then 7-bit ASCII ----------------
  function glyphBot(word, w, h) {
    const out = [], chars = [...word].map((ch) => ch.charCodeAt(0) & 127), cw = w / Math.max(1, chars.length);
    const s = Math.min(cw / 2.7, h / 4.3);
    chars.forEach((code, i) => {
      let ones = 0; for (let b = 0; b < 7; b++) ones += (code >> b) & 1;
      const bits = [ones & 1, ...[6, 5, 4, 3, 2, 1, 0].map((b) => (code >> b) & 1)];
      bits.forEach((lit, k) => out.push(['sq', i * cw + (cw - 2 * s) / 2 + (k % 2) * s, h / 2 - 2 * s + Math.floor(k / 2) * s, s * 0.82, lit]));
    });
    return out;
  }
  function decodeBot(prims, n) {                                   // the easter egg: LEDs back to letters ('?' on a parity error)
    let txt = '';
    for (let i = 0; i < n; i++) {
      const bits = prims.slice(i * 8, i * 8 + 8).map((p) => p[4]);
      const code = bits.slice(1).reduce((a, b) => a * 2 + b, 0), ones = bits.slice(1).reduce((a, b) => a + b, 0);
      txt += (ones & 1) === bits[0] ? String.fromCharCode(code) : '?';
    }
    return txt;
  }

  const GEN = { murk: glyphMurk, oggle: glyphOggle, crustling: glyphCrust, orbiloon: glyphOrbi, bot: glyphBot };
  function script(race, word, w, h) {
    const gen = GEN[race]; if (!gen) return [];
    if (race === 'bot') return gen(String(word).replace(/[.,!?:;…"]+$/, ''), w, h);
    return gen(word, w, h, rng(hash32(race + ':' + key(word))));
  }

  // ---------------- sounds: cosmetic syllables under the glyphs ----------------
  const SOUNDS = {
    oggle: { syl: ['GRAK', 'OI', 'BLAT', 'ZOG', 'HUP', 'KRANK', 'YARG', 'BONK', 'URK', 'DAK'], join: '-', sep: ' ' },
    crustling: { syl: ['hrm', 'grn', 'mmm', 'rrk', 'hmm', 'grr', 'unh'], join: '', sep: '... ' },
    orbiloon: { syl: ['loo', 'wee', 'oo', 'hoo', 'lu', 'wi', 'ooo', 'ee'], join: '', sep: ' ~ ' },
    bot: { syl: ['beep', 'boop', 'bip', 'bzzt', 'dee', 'doo'], join: '-', sep: ' ' },
  };
  function sound(race, text) {
    const S = SOUNDS[race]; if (!S) return race === 'murk' ? '~ whispers ~' : '';
    return text.split(/\s+/).filter((wd) => key(wd)).map((wd) => {
      const R = rng(hash32('snd:' + race + ':' + key(wd))), n = Math.max(1, Math.min(3, Math.ceil(key(wd).length / 3)));
      return Array.from({ length: n }, () => S.syl[Math.floor(R() * S.syl.length)]).join(S.join);
    }).join(S.sep);
  }

  // ---------------- translator: who can you read? ----------------
  //  0: Belt Common only · 1: numbers, names, ~55 % of words · 2+: everything
  function canRead(lvl, race, word, names) {
    if (race === 'pipkin' || lvl >= 2) return true;
    if (lvl < 1) return false;
    const k = key(word);
    if (!k || /\d/.test(k) || (names && names.has(k))) return true;
    return hash32('mk1:' + k) % 100 < 55;
  }

  let NAMES = null, NAMES_W = null;                                // every proper name in the belt, as Mk I knows them
  function namesOf(g) {
    if (NAMES && NAMES_W === (g && g.w)) return NAMES;
    const s = new Set(GLOSSARY), add = (str) => String(str).split(/[\s\-']+/).forEach((p) => { const k = key(p); if (k) s.add(k); });
    if (g && g.w) { for (const b of g.w.bodies) add(b.name); for (const sw of g.w.swarms || []) add(sw.name); }
    for (const d of DEFS) add(d.name);
    for (const d of NAMED_EXTRAS) add(d.name);
    for (const r in POOL) POOL[r].forEach(add);
    for (const r in RACES) { add(RACES[r].name); add(r); }
    if (typeof Stations !== 'undefined' && Stations && g) for (const st of Stations.list(g)) add(st.name);
    for (const w of ['murk', 'oggle', 'oggles', 'pipkin', 'pipkins', 'crustlings', 'orbiloons', 'bots', 'potato', 'rust\'s', 'gary', 'radish', 'basil', 'phil', 'voss', 'tamsin', 'lou', 'kate', 'wally', 'crunch'])
      s.add(key(w));
    NAMES = s; NAMES_W = g && g.w;
    return s;
  }

  // the level in force: ?xlate= (g.opts), then dev L, then the suit (econ's xlate1 / xlate2)
  const URL_XLATE = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search).get('xlate') : null;
  function translator(g) {
    const o = g && g.opts && g.opts.xlate != null && g.opts.xlate !== '' ? g.opts.xlate : URL_XLATE;
    if (o != null && Number.isFinite(Number(o))) return clampLvl(Number(o));
    const m = g && g.mod && g.mod.npcs;
    if (m && m.xlate != null) return m.xlate;
    return clampLvl((g && g.S && g.S.translator) ?? 0);
  }
  const clampLvl = (x) => Math.max(0, Math.min(3, Math.floor(x) || 0));
  const readable = (g, race, word) => canRead(translator(g), race, word, namesOf(g));


  // ======================================================================
  //  SPRITES  —  drawSprite(ctx, race, look, st) in a sprite frame: metres, y UP,
  //  origin at the feet (the hover anchor for Orbiloons). The caller translates,
  //  rotates and scales. st = { t, talk, mood, look: [x, y], L: light dir, lw, helmet }
  // ======================================================================

  function toon(c, path, [base, shade, hi], L, k, lw, hiAt) {
    path(); c.fillStyle = shade; c.fill();
    c.save(); path(); c.clip();
    c.translate(L[0] * k, L[1] * k); path(); c.fillStyle = base; c.fill();
    if (hiAt && hi) { c.beginPath(); c.ellipse(hiAt[0], hiAt[1], hiAt[2], hiAt[3], hiAt[4] || 0, 0, 2 * Math.PI); c.fillStyle = hi; c.fill(); }
    c.restore();
    path(); c.strokeStyle = INK; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke();
  }
  function stroke2(c, pts, w, col, lw) {                           // ink-outlined thick stroke (limbs, tentacles)
    const p = () => { c.beginPath(); c.moveTo(pts[0], pts[1]); if (pts.length === 6) c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); else c.lineTo(pts[2], pts[3]); };
    c.lineCap = 'round'; p(); c.strokeStyle = INK; c.lineWidth = w + 2 * lw; c.stroke(); p(); c.strokeStyle = col; c.lineWidth = w; c.stroke();
  }
  function blob(c, x, y, rx, ry, col, lw, rot = 0) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 2 * Math.PI); c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
  }
  function rrect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function eyes2(c, x, y, sp, r, look, blink, lw) {                // two cute eyes: white, pupil, sparkle
    for (const s of [-1, 1]) {
      const ex = x + s * sp;
      if (blink) { c.beginPath(); c.moveTo(ex - r, y); c.quadraticCurveTo(ex, y - r * 0.5, ex + r, y); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); continue; }
      c.beginPath(); c.ellipse(ex, y, r, r * 1.15, 0, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      c.beginPath(); c.arc(ex + look[0] * r * 0.35, y + look[1] * r * 0.3, r * 0.62, 0, 2 * Math.PI); c.fillStyle = INK; c.fill();
      c.beginPath(); c.arc(ex + look[0] * r * 0.35 - r * 0.22, y + look[1] * r * 0.3 + r * 0.25, r * 0.22, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill();
    }
  }
  const blinkAt = (t, off, per = 3.4) => (t + off) % per < 0.12;
  function glass(c, x, y, R, L, lw) {                              // bubble helmet: tint, ink rim, a fat highlight toward the light
    c.beginPath(); c.arc(x, y, R, 0, 2 * Math.PI); c.fillStyle = 'rgba(205,242,255,0.26)'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    const la = Math.atan2(L[1], L[0]);
    c.beginPath(); c.arc(x, y, R * 0.78, la - 0.55, la + 0.35); c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = R * 0.11; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.arc(x + Math.cos(la + 0.75) * R * 0.76, y + Math.sin(la + 0.75) * R * 0.76, R * 0.07, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill();
  }
  const palOf = (table, name, dflt) => (Array.isArray(name) ? name : table[name] || table[dflt]);

  // ---------------- pipkin (a simplified copy of eva.js's astronaut: the same species as you) ----------------
  function drawPipkin(c, lk, st) {
    const { t, L, lw } = st, skin = palOf(PALS.pipkin, lk.ripe, 'sprout'), cloth = palOf(PALS.cloth, lk.cloth, 'blue');
    const bob = Math.sin(t * 2.2 + (lk.off || 0)) * 0.012, talk = st.talk > 0 && (t * 8) % 1 < 0.5;
    const wave = st.talk > 0 ? Math.sin(t * 9) * 0.08 : 0, hand = st.talk > 0 ? 0.9 : 0.52;
    for (const s of [-1, 1]) stroke2(c, [s * 0.08, 0.42, s * 0.1, 0.12], 0.15, cloth[1], lw);
    for (const s of [-1, 1]) blob(c, s * 0.13, 0.07, 0.12, 0.07, '#6e6896', lw * 0.8);
    if (lk.acc === 'pennant') {                                    // Tansy, the guide: a little flag on a stick
      stroke2(c, [-0.36, 0.42 + bob, -0.4, 1.36 + bob], 0.035, '#a2834f', lw * 0.7);
      const fl = Math.sin(t * 3) * 0.03;
      c.beginPath(); c.moveTo(-0.4, 1.36 + bob); c.lineTo(-0.8, 1.27 + bob + fl); c.lineTo(-0.4, 1.16 + bob); c.closePath();
      c.fillStyle = '#ff9f43'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
    }
    stroke2(c, [-0.2, 0.74 + bob, -0.36, 0.52 + bob], 0.11, cloth[0], lw);
    stroke2(c, [0.2, 0.74 + bob, 0.38, hand + wave + bob], 0.11, cloth[0], lw);
    for (const [hx, hy] of [[-0.36, 0.52 + bob], [0.38, hand + wave + bob]]) blob(c, hx, hy, 0.065, 0.065, skin[0], lw * 0.8);
    toon(c, () => { c.beginPath(); c.ellipse(0, 0.6 + bob, 0.25, 0.3, 0, 0, 2 * Math.PI); }, cloth, L, 0.07, lw, [-0.08, 0.74 + bob, 0.05, 0.1, 0.3]);
    if (lk.acc === 'apron') {
      c.beginPath(); c.moveTo(-0.16, 0.7 + bob); c.lineTo(0.16, 0.7 + bob); c.lineTo(0.15, 0.36 + bob); c.quadraticCurveTo(0, 0.31 + bob, -0.15, 0.36 + bob); c.closePath();
      c.fillStyle = PAPER; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      c.beginPath(); c.arc(0.06, 0.52 + bob, 0.035, 0, 2 * Math.PI); c.fillStyle = '#ff9f43'; c.fill();
    }
    if (lk.acc === 'sash') {
      c.save(); c.beginPath(); c.ellipse(0, 0.6 + bob, 0.25, 0.3, 0, 0, 2 * Math.PI); c.clip();
      c.beginPath(); c.moveTo(-0.3, 0.84 + bob); c.lineTo(0.3, 0.42 + bob); c.strokeStyle = INK; c.lineWidth = 0.13; c.stroke(); c.strokeStyle = '#ff9f43'; c.lineWidth = 0.09; c.stroke();
      c.restore();
    }
    const hy = 1.05 + bob, wob = Math.sin(t * 3.1 + (lk.off || 0)) * 0.12, ax = Math.sin(wob) * 0.17, ay = hy + 0.27 + Math.cos(wob) * 0.17;
    const pipCol = lk.pip || (st.talk > 0 ? '#ffd166' : '#ff7eb6');
    if (lk.acc === 'twist') {                                      // Twist: a pretzel-knot antenna
      c.beginPath(); c.moveTo(0, hy + 0.25); c.bezierCurveTo(-0.22, hy + 0.55, 0.22, hy + 0.55, -0.02, hy + 0.36); c.bezierCurveTo(-0.2, hy + 0.3, 0.1, hy + 0.62, ax, ay);
      c.strokeStyle = INK; c.lineWidth = lw * 2.4; c.stroke(); c.strokeStyle = '#c98a4a'; c.lineWidth = lw * 1.2; c.stroke();
    } else { c.beginPath(); c.moveTo(0, hy + 0.25); c.quadraticCurveTo(0, hy + 0.36, ax, ay); c.strokeStyle = INK; c.lineWidth = lw * 1.2; c.stroke(); }
    blob(c, ax, ay, 0.058, 0.058, pipCol, lw * 0.8);
    toon(c, () => { c.beginPath(); c.ellipse(0, hy, 0.33, 0.28, 0, 0, 2 * Math.PI); }, skin, L, 0.06, lw, [-0.1, hy + 0.13, 0.07, 0.04, 0.4]);
    eyes2(c, 0, hy + 0.03, 0.12, 0.082, st.look || [0, 0], blinkAt(t, lk.off || 0), lw);
    c.fillStyle = 'rgba(255,120,160,0.55)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.22, hy - 0.07, 0.05, 0.028, 0, 0, 2 * Math.PI); c.fill(); }
    c.beginPath();
    if (talk) { c.ellipse(0, hy - 0.1, 0.035, 0.045, 0, 0, 2 * Math.PI); c.fillStyle = INK; c.fill(); }
    else { c.arc(0, hy - 0.06, 0.05, 0.2 * Math.PI, 0.8 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
    pipkinHat(c, lk, hy, L, lw);
    if (lk.helmet || st.helmet) glass(c, 0, hy + 0.04, 0.45, L, lw);
  }

  function pipkinHat(c, lk, hy, L, lw) {
    const a = lk.acc;
    if (a === 'hardhat') {
      toon(c, () => { c.beginPath(); c.ellipse(0, hy + 0.15, 0.3, 0.22, 0, Math.PI, 0, true); c.closePath(); }, ['#ffd166', '#c9962e', '#fff3c4'], L, 0.05, lw, null);
      rrect(c, -0.37, hy + 0.11, 0.74, 0.07, 0.03); c.fillStyle = '#ffb347'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      blob(c, 0, hy + 0.27, 0.055, 0.05, '#fff8c0', lw * 0.7);
    } else if (a === 'bun') {
      blob(c, 0, hy + 0.3, 0.11, 0.1, '#eeeaf6', lw * 0.8);
      c.strokeStyle = INK; c.lineWidth = lw * 0.7;
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.12, hy + 0.03, 0.1, 0, 2 * Math.PI); c.stroke(); }
      c.beginPath(); c.moveTo(-0.02, hy + 0.05); c.lineTo(0.02, hy + 0.05); c.stroke();
    } else if (a === 'cap') {                                      // backwards: the brim sticks out the back
      toon(c, () => { c.beginPath(); c.ellipse(0, hy + 0.12, 0.31, 0.2, 0, Math.PI, 0, true); c.closePath(); }, ['#5fbf4a', '#3a8030', '#c6f5b8'], L, 0.04, lw, null);
      c.beginPath(); c.ellipse(-0.34, hy + 0.13, 0.14, 0.045, -0.15, 0, 2 * Math.PI); c.fillStyle = '#3a8030'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
    } else if (a === 'headset') {
      c.beginPath(); c.arc(0, hy + 0.02, 0.36, 0.12 * Math.PI, 0.88 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw * 2.2; c.stroke(); c.strokeStyle = '#a59fbd'; c.lineWidth = lw; c.stroke();
      blob(c, 0.33, hy - 0.04, 0.07, 0.09, '#a59fbd', lw * 0.7);
      c.beginPath(); c.moveTo(0.33, hy - 0.08); c.quadraticCurveTo(0.3, hy - 0.2, 0.16, hy - 0.16); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      blob(c, 0.15, hy - 0.16, 0.035, 0.035, '#ff9f1c', lw * 0.6);
    } else if (a === 'goggles') {
      c.beginPath(); c.moveTo(-0.32, hy + 0.12); c.lineTo(0.32, hy + 0.12); c.strokeStyle = INK; c.lineWidth = lw * 2.4; c.stroke(); c.strokeStyle = '#7a4f2e'; c.lineWidth = lw * 1.2; c.stroke();
      for (const s of [-1, 1]) { blob(c, s * 0.11, hy + 0.15, 0.075, 0.07, '#e3b04b', lw * 0.8); blob(c, s * 0.11, hy + 0.15, 0.045, 0.042, '#7fd8ff', lw * 0.5); }
    }
  }

  // ---------------- murk: a teardrop hood, two glowing eyes, never a mouth ----------------
  function drawMurk(c, lk, st) {
    const { t, L, lw } = st, pal = palOf(PALS.murk, lk.pal, 'dusk'), sway = Math.sin(t * 0.9 + (lk.off || 0)) * 0.08, eye = lk.eye || '#ffe066';
    const cloak = () => {
      c.beginPath(); c.moveTo(-0.55, 0.06);
      c.quadraticCurveTo(-0.62, 1.25, sway, 2.0); c.quadraticCurveTo(0.62, 1.25, 0.55, 0.06);
      for (let i = 0; i < 5; i++) { const x1 = 0.55 - (i + 1) * 0.22; c.quadraticCurveTo(0.55 - (i + 0.5) * 0.22, -0.08, x1, 0.06); }
      c.closePath();
    };
    if (lk.acc === 'lantern') {                                    // Glint carries a little violet lantern
      const lx = 0.5, ly = 0.6 + Math.sin(t * 1.3) * 0.03;
      const gr = c.createRadialGradient(lx, ly, 0, lx, ly, 0.6); gr.addColorStop(0, 'rgba(143,107,255,0.55)'); gr.addColorStop(1, 'rgba(143,107,255,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(lx, ly, 0.6, 0, 2 * Math.PI); c.fill();
    }
    toon(c, cloak, pal, L, 0.12, lw, [-0.2, 1.2, 0.07, 0.3, 0.2]);
    c.save(); cloak(); c.clip();                                   // a soft rim of lilac on the lit edge, so dark hoods read on dark rock
    c.translate(-L[0] * 0.05, -L[1] * 0.05); cloak(); c.strokeStyle = `rgba(200,180,255,0.55)`; c.lineWidth = lw * 1.6; c.stroke();
    c.restore();
    if (lk.acc === 'scarf') {
      c.save(); cloak(); c.clip(); c.fillStyle = '#ff9f43'; c.fillRect(-0.7, 1.0, 1.4, 0.13);
      c.fillStyle = PAPER; for (let x = -0.6; x < 0.6; x += 0.2) c.fillRect(x, 1.0, 0.07, 0.13); c.restore();
      c.beginPath(); c.moveTo(0.3, 1.04); c.quadraticCurveTo(0.44, 0.85, 0.36, 0.7); c.strokeStyle = INK; c.lineWidth = 0.13; c.stroke(); c.strokeStyle = '#ff9f43'; c.lineWidth = 0.08; c.stroke();
      cloak(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    }
    const fx = sway * 0.3;
    c.beginPath(); c.ellipse(fx, 1.38, 0.3, 0.23, 0, 0, 2 * Math.PI); c.fillStyle = '#120d1e'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
    const blink = blinkAt(t, lk.off || 1.1, 3.7), sq = st.talk > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 8)) : 1, ex = (st.look ? st.look[0] : 0) * 0.04;
    c.save();
    for (const s of [-1, 1]) {                                     // the glow: a soft halo, not shadowBlur (systems M2)
      const x = fx + s * 0.12 + ex, y = 1.38, h = blink ? 0.012 : 0.075 * sq;
      c.globalAlpha = 0.28; c.beginPath(); c.ellipse(x, y, 0.16, h * 1.6 + 0.05, 0, 0, 2 * Math.PI); c.fillStyle = eye; c.fill(); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(x - 0.1, y); c.quadraticCurveTo(x, y + h * 1.4, x + 0.1, y); c.quadraticCurveTo(x, y - h * 0.8, x - 0.1, y); c.closePath(); c.fillStyle = eye; c.fill();
    }
    c.restore();
    if (lk.acc === 'monocle') {
      c.beginPath(); c.arc(fx + 0.12 + ex, 1.38, 0.11, 0, 2 * Math.PI); c.strokeStyle = '#ffd166'; c.lineWidth = 0.03; c.stroke();
      c.beginPath(); c.moveTo(fx + 0.2 + ex, 1.31); c.quadraticCurveTo(fx + 0.32, 1.1, fx + 0.26, 0.95); c.lineWidth = 0.012; c.stroke();
    }
    const paw = (x, y) => { c.beginPath(); c.arc(x, y, 0.075, 0, 2 * Math.PI); c.fillStyle = pal[1]; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); };
    if (st.talk > 0) {
      for (let i = 0; i < 3; i++) { const f = (t * 0.9 + i / 3) % 1; c.beginPath(); c.arc(fx + 0.2 + f * 0.3, 1.3 + f * 0.5, 0.04 * (1 - f) + 0.01, 0, 2 * Math.PI); c.fillStyle = `rgba(200,180,255,${0.8 * (1 - f)})`; c.fill(); }
      paw(-0.36, 0.85); paw(0.36, 0.85);
    }
    if (lk.acc === 'lantern') {
      const lx = 0.5, ly = 0.6 + Math.sin(t * 1.3) * 0.03;
      c.beginPath(); c.moveTo(lx, ly + 0.14); c.lineTo(lx, ly + 0.22); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      rrect(c, lx - 0.07, ly - 0.1, 0.14, 0.2, 0.03); c.fillStyle = '#c9b6ff'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      c.beginPath(); c.arc(lx, ly, 0.035, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill();
      if (!(st.talk > 0)) paw(0.4, 0.84);
    }
    if (st.helmet) glass(c, fx, 1.45, 0.6, L, lw);
  }

  // ---------------- oggle: a wide egg with ONE huge eye, a crest and an underbite ----------------
  function drawOggle(c, lk, st) {
    const { t, L, lw } = st, pal = palOf(PALS.oggle, lk.pal, 'grape'), b = Math.sin(t * 3 + (lk.off || 0)) * 0.04;
    const grumpy = st.mood === 'grumpy' || st.mood === 'warn';
    c.save(); c.scale(1 - b * 0.5, 1 + b);
    for (const s of [-1, 1]) { stroke2(c, [s * 0.25, 0.2, s * 0.28, 0.06], 0.16, pal[1], lw); blob(c, s * 0.3, 0.05, 0.16, 0.07, pal[1], lw * 0.8); }
    if (lk.acc !== 'tricorn' && lk.acc !== 'apron') {
      [[-0.22, 1.47], [0, 1.6], [0.22, 1.47]].forEach(([x, y], i) => {
        const wig = Math.sin(t * 4 + i) * 0.03;
        c.beginPath(); c.moveTo(x - 0.12, y - 0.3); c.lineTo(x + wig, y); c.lineTo(x + 0.12, y - 0.3); c.closePath(); c.fillStyle = lk.crest || '#ff5d8f'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
      });
    }
    toon(c, () => { c.beginPath(); c.ellipse(0, 0.7, 0.62, 0.58, 0, 0, 2 * Math.PI); }, pal, L, 0.1, lw, [-0.25, 1.02, 0.1, 0.06, 0.5]);
    if (lk.acc === 'vest') oggleVest(c, lw);
    const swing = st.talk > 0 ? Math.sin(t * 9) * 0.1 : 0;
    for (const s of [-1, 1]) { const dy = s > 0 ? swing : 0; stroke2(c, [s * 0.55, 0.62, s * 0.78, 0.45 + dy], 0.15, pal[0], lw); blob(c, s * 0.8, 0.43 + dy, 0.1, 0.1, pal[0], lw * 0.8); }
    oggleEye(c, lk, st, pal, grumpy);
    const mo = st.talk > 0 ? 0.06 + 0.08 * Math.abs(Math.sin(t * 6)) : 0.04;
    c.beginPath(); c.moveTo(-0.2, 0.42); c.quadraticCurveTo(0, 0.42 - mo * 2, 0.2, 0.42); c.closePath(); c.fillStyle = '#2a1a4a'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.16, 0.41); c.lineTo(s * 0.12, 0.53); c.lineTo(s * 0.08, 0.41); c.closePath(); c.fillStyle = BONE; c.fill(); c.lineWidth = lw * 0.6; c.stroke(); }
    oggleHat(c, lk, t, L, lw);
    if (st.talk > 0 && grumpy) {                                   // two little "!" marks over the crest
      c.fillStyle = '#ff5d5d'; c.strokeStyle = INK; c.lineWidth = lw * 0.7;
      for (const s of [-1, 1]) { const x = s * 0.42, y = 1.78 + Math.abs(Math.sin(t * 7 + s)) * 0.05;
        rrect(c, x - 0.035, y, 0.07, 0.2, 0.03); c.fill(); c.stroke(); c.beginPath(); c.arc(x, y - 0.07, 0.038, 0, 2 * Math.PI); c.fill(); c.stroke(); }
    }
    if (st.helmet) glass(c, 0, 0.95, 0.82, L, lw);
    c.restore();
  }

  function oggleEye(c, lk, st, pal, grumpy) {                      // as combat.js drawEye: sclera, iris, pupil, sparkle, a lid that slants when grumpy
    const { t, lw } = st, ex = 0, ey = 0.84, rx = 0.3, ry = 0.26, blink = blinkAt(t, lk.off || 0.4, 4.1), lk2 = st.look || [0, 0];
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 2 * Math.PI); c.fillStyle = BONE; c.fill();
    c.save(); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 2 * Math.PI); c.clip();
    const ix = ex + lk2[0] * 0.08, iy = ey + lk2[1] * 0.06;
    c.beginPath(); c.arc(ix, iy, 0.14, 0, 2 * Math.PI); c.fillStyle = lk.iris || '#ff3b5c'; c.fill();
    c.beginPath(); c.arc(ix, iy, 0.07, 0, 2 * Math.PI); c.fillStyle = INK; c.fill();
    c.beginPath(); c.arc(ix - 0.045, iy + 0.045, 0.032, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill();
    const yl = blink ? ey - ry - 0.02 : ey + ry * (grumpy ? 0.35 : 0.75), yr = blink ? ey - ry - 0.02 : ey + ry * (grumpy ? 0.05 : 0.75);
    if (blink) { c.fillStyle = pal[1]; c.fillRect(ex - rx, ey - ry, 2 * rx, 2 * ry); }
    else { c.beginPath(); c.moveTo(ex - rx, ey + ry); c.lineTo(ex + rx, ey + ry); c.lineTo(ex + rx, yr); c.lineTo(ex - rx, yl); c.closePath(); c.fillStyle = pal[1]; c.fill(); }
    c.restore();
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 2 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    if (!blink) { c.beginPath(); c.moveTo(ex - rx * 0.95, yl); c.lineTo(ex + rx * 0.95, yr); c.lineWidth = lw * 1.4; c.stroke(); }
    else {                                                         // shut: a lid with a lash line and a highlight
      c.beginPath(); c.moveTo(ex - rx * 0.8, ey - 0.02); c.quadraticCurveTo(ex, ey - ry * 0.75, ex + rx * 0.8, ey - 0.02); c.lineWidth = lw * 1.3; c.stroke();
      c.beginPath(); c.ellipse(ex - rx * 0.35, ey + ry * 0.45, rx * 0.22, ry * 0.12, -0.3, 0, 2 * Math.PI); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    }
  }

  function oggleVest(c, lw) {                                      // Blat: a black bouncer vest, STAFF on the belt
    c.save(); c.beginPath(); c.ellipse(0, 0.7, 0.62, 0.58, 0, 0, 2 * Math.PI); c.clip();
    c.fillStyle = '#231a30';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.7, 1.3); c.lineTo(s * 0.36, 1.3); c.quadraticCurveTo(s * 0.3, 0.6, s * 0.12, 0.1); c.lineTo(s * 0.7, 0.1); c.closePath(); c.fill(); }
    c.fillRect(-0.7, 0.1, 1.4, 0.14);
    c.save(); c.translate(0, 0.17); c.scale(0.0045, -0.0045); c.font = `700 20px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd166'; c.fillText('STAFF', 0, 0); c.restore();
    c.restore();
    c.beginPath(); c.ellipse(0, 0.7, 0.62, 0.58, 0, 0, 2 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
  }

  function oggleHat(c, lk, t, L, lw) {
    const a = lk.acc;
    if (a === 'bandana') {
      c.beginPath(); c.ellipse(0, 1.18, 0.5, 0.13, 0, Math.PI * 1.05, Math.PI * 1.95, true); c.strokeStyle = INK; c.lineWidth = 0.14 + 2 * lw; c.stroke(); c.strokeStyle = '#ff5d8f'; c.lineWidth = 0.14; c.stroke();
      c.beginPath(); c.moveTo(0.42, 1.12); c.lineTo(0.62, 1.0); c.lineTo(0.56, 1.18); c.closePath(); c.fillStyle = '#ff5d8f'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
    } else if (a === 'cap') {                                      // Hub Patrol: navy cap, gold star
      toon(c, () => { c.beginPath(); c.ellipse(0, 1.2, 0.38, 0.22, 0, Math.PI, 0, true); c.closePath(); }, ['#3a5cc4', '#22357a', '#9fb8ff'], L, 0.04, lw, null);
      c.beginPath(); c.ellipse(0.28, 1.2, 0.2, 0.05, 0, 0, 2 * Math.PI); c.fillStyle = '#22357a'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      star(c, 0, 1.3, 0.06, '#ffd166', lw * 0.5);
    } else if (a === 'tricorn') {                                  // Marge: a black tricorn with a tiny skull
      c.beginPath(); c.moveTo(-0.62, 1.2); c.quadraticCurveTo(-0.5, 1.5, -0.2, 1.52); c.quadraticCurveTo(0, 1.68, 0.2, 1.52); c.quadraticCurveTo(0.5, 1.5, 0.62, 1.2);
      c.quadraticCurveTo(0, 1.32, -0.62, 1.2); c.closePath(); c.fillStyle = '#231a30'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
      c.beginPath(); c.moveTo(-0.58, 1.22); c.quadraticCurveTo(0, 1.34, 0.58, 1.22); c.strokeStyle = '#ffd166'; c.lineWidth = 0.035; c.stroke();
      c.fillStyle = BONE; c.beginPath(); c.arc(0, 1.45, 0.065, 0, 2 * Math.PI); c.fill(); c.fillRect(-0.035, 1.37, 0.07, 0.04);
      c.fillStyle = INK; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.025, 1.455, 0.017, 0, 2 * Math.PI); c.fill(); }
    } else if (a === 'apron') {                                    // Grubb the cook: a chef's toque and a stained apron
      toon(c, () => { c.beginPath(); c.moveTo(-0.24, 1.2); c.lineTo(-0.27, 1.42); c.arc(-0.16, 1.5, 0.15, Math.PI, 1.6 * Math.PI); c.arc(0, 1.58, 0.17, 1.15 * Math.PI, 1.85 * Math.PI);
        c.arc(0.16, 1.5, 0.15, 1.4 * Math.PI, 0); c.lineTo(0.24, 1.2); c.closePath(); }, ['#ffffff', '#cfc9ec', '#ffffff'], L, 0.04, lw, null);
      c.beginPath(); c.moveTo(-0.25, 1.26); c.lineTo(0.25, 1.26); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
      c.save(); c.beginPath(); c.ellipse(0, 0.7, 0.62, 0.58, 0, 0, 2 * Math.PI); c.clip();
      c.fillStyle = PAPER; c.fillRect(-0.4, 0.08, 0.8, 0.22); c.fillStyle = '#e0a050'; c.beginPath(); c.ellipse(0.14, 0.18, 0.06, 0.04, 0.4, 0, 2 * Math.PI); c.fill();
      c.restore();
      c.beginPath(); c.moveTo(-0.4, 0.3); c.lineTo(0.4, 0.3); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
    } else if (a === 'goggles') {                                  // welding goggles pushed up on the crest
      c.beginPath(); c.ellipse(0, 1.2, 0.5, 0.1, 0, Math.PI * 1.05, Math.PI * 1.95, true); c.strokeStyle = INK; c.lineWidth = 0.1 + 2 * lw; c.stroke(); c.strokeStyle = '#5a4030'; c.lineWidth = 0.1; c.stroke();
      for (const s of [-1, 1]) { blob(c, s * 0.16, 1.26, 0.12, 0.1, '#3b3448', lw * 0.8); blob(c, s * 0.16, 1.26, 0.08, 0.065, '#ff9f43', lw * 0.4);
        c.beginPath(); c.arc(s * 0.16 - 0.03, 1.29, 0.022, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); }
    } else if (a === 'hose') {                                     // a ribbed fuel hose worn like a headband, nozzle dangling
      c.beginPath(); c.ellipse(0, 1.18, 0.52, 0.12, 0, Math.PI * 1.02, Math.PI * 1.98, true); c.strokeStyle = INK; c.lineWidth = 0.1 + 2 * lw; c.stroke(); c.strokeStyle = '#4caf50'; c.lineWidth = 0.1; c.stroke();
      c.setLineDash([0.03, 0.05]); c.strokeStyle = '#2e7d32'; c.lineWidth = 0.1; c.stroke(); c.setLineDash([]);
      const sw = Math.sin(t * 2) * 0.04;
      stroke2(c, [0.5, 1.15, 0.7, 0.95, 0.62 + sw, 0.78], 0.07, '#4caf50', lw);
      rrect(c, 0.56 + sw, 0.66, 0.12, 0.12, 0.02); c.fillStyle = '#a59fbd'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
    }
  }
  function star(c, x, y, r, col, lw) {
    c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y - Math.sin(a) * q); }
    c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
  }

  // ---------------- crustling: a sleepy boulder on pebble feet ----------------
  const outCache = {};
  function outline(seed) {
    if (outCache[seed]) return outCache[seed];
    let s = seed; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const harm = [2, 3, 5].map((k) => [k, R() * 6.28, (R() * 0.6 + 0.4) / k ** 0.6]), norm = harm.reduce((a, h) => a + h[2], 0);
    return (outCache[seed] = Array.from({ length: 28 }, (_, i) => { const th = i / 28 * 2 * Math.PI; return 1 + 0.12 * harm.reduce((a, [k, ph, w]) => a + w * Math.sin(k * th + ph), 0) / norm; }));
  }
  function drawCrust(c, lk, st) {
    const { t, L, lw } = st, R = lk.R || 0.8, pal = palOf(PALS.crustling, lk.pal, 'granite'), br = 1 + 0.015 * Math.sin(t * 2 * Math.PI / 6);
    const out = outline(lk.seed || 7), cy = R * 0.92, tilt = st.talk > 0 ? Math.sin(t * 1.3) * 0.04 : 0;
    c.save(); c.rotate(tilt);
    for (const s of [-1, 1]) blob(c, s * R * 0.45, R * 0.12, R * 0.17, R * 0.15, pal[1], lw * 0.8);
    const path = () => { c.beginPath(); out.forEach((f, i) => { const a = i / out.length * 2 * Math.PI, x = Math.cos(a) * R * f * br, y = cy + Math.sin(a) * R * f * 0.9 * br; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    toon(c, path, pal, L, R * 0.18, lw, [-R * 0.35, cy + R * 0.45, R * 0.18, R * 0.09, 0.5]);
    c.save(); path(); c.clip();                                    // speckles and a crack: it is a rock, after all
    c.fillStyle = pal[1]; for (const [x, y, r] of [[0.42, 0.35, 0.05], [-0.5, -0.2, 0.04], [0.15, -0.5, 0.035], [0.55, -0.3, 0.03]]) { c.beginPath(); c.arc(x * R, cy + y * R, r * R, 0, 2 * Math.PI); c.fill(); }
    c.beginPath(); c.moveTo(R * 0.55, cy + R * 0.5); c.lineTo(R * 0.4, cy + R * 0.3); c.lineTo(R * 0.48, cy + R * 0.12); c.strokeStyle = INK; c.lineWidth = lw * 0.6; c.stroke();
    c.restore();
    crustHat(c, lk, R, cy, L, lw);
    const asleep = lk.asleep, glance = !asleep && (t + (lk.off || 0)) % 9 < 1, ey = cy + R * 0.18;
    for (const s of [-1, 1]) {
      const x = s * R * 0.27, r = R * 0.15;
      if (glance) { blob(c, x, ey, r * 0.9, r, '#fff', lw * 0.7); c.beginPath(); c.arc(x, ey - r * 0.1, r * 0.55, 0, 2 * Math.PI); c.fillStyle = INK; c.fill();
        c.beginPath(); c.arc(x - r * 0.2, ey + r * 0.15, r * 0.2, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); }
      else if (asleep) { c.beginPath(); c.arc(x, ey + r * 0.2, r * 0.8, 1.1 * Math.PI, 1.9 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
      else {
        c.beginPath(); c.arc(x, ey, r, Math.PI, 0, true); c.fillStyle = INK; c.fill();
        c.save(); c.beginPath(); c.rect(x - r * 1.2, ey, r * 2.4, r * 1.2); c.clip(); c.beginPath(); c.arc(x, ey, r * 1.05, 0, Math.PI); c.fillStyle = pal[0]; c.fill(); c.restore();
        c.beginPath(); c.moveTo(x - r * 1.3, ey + r * 0.12); c.lineTo(x + r * 1.3, ey + r * 0.12); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
      }
      c.fillStyle = 'rgba(255,140,150,0.42)'; c.beginPath(); c.ellipse(x + s * r * 0.5, ey - r * 1.5, r * 0.75, r * 0.38, 0, 0, 2 * Math.PI); c.fill();
    }
    const k = st.talk > 0 ? Math.floor(t * 4) % 2 : 0, my = cy - R * 0.12;
    c.beginPath(); c.moveTo(-R * 0.16, my); c.lineTo(-R * 0.05, my - R * (k ? 0.08 : 0.03)); c.lineTo(R * 0.05, my); c.lineTo(R * 0.16, my - R * (k ? 0.05 : 0.02));
    c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    if (st.talk > 0) {                                             // a pebble hops off the top
      const f = (t * 0.7) % 1;
      blob(c, R * (0.2 + f * 0.5), cy + R * 0.85 + Math.sin(f * Math.PI) * R * 0.35, R * 0.06, R * 0.05, pal[1], lw * 0.6);
    }
    if (asleep) {                                                  // Zzz
      const f = (t * 0.4) % 1;
      for (const [k, sz] of [[0, 1], [0.5, 0.7]]) {
        const ff = (f + k) % 1;
        c.save(); c.globalAlpha *= Math.min(1, 4 * (1 - ff)); c.translate(R * 0.55 + ff * R * 0.4, cy + R * 0.85 + ff * R * 0.7); c.scale(0.022 * R * sz, -0.022 * R * sz);
        c.font = `700 20px ${FONT}`; c.lineJoin = 'round'; c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 6; c.strokeText('Z', 0, 0); c.fillText('Z', 0, 0); c.restore();
      }
    }
    c.restore();
  }
  function crustHat(c, lk, R, cy, L, lw) {
    const a = lk.acc, top = cy + R * 0.78;
    if (a === 'salt' || a === 'amethyst') {
      const col = a === 'salt' ? ['#f4f0ff', '#c8c0e8'] : ['#c792ff', '#8a5fd0'];
      for (const [x, h, ang] of [[-0.25, 0.32, -0.3], [0.02, 0.42, 0.05], [0.26, 0.28, 0.35]]) {
        c.save(); c.translate(x * R, top); c.rotate(ang);
        c.beginPath(); c.moveTo(-0.07 * R, 0); c.lineTo(-0.07 * R, h * R); c.lineTo(0, (h + 0.08) * R); c.lineTo(0.07 * R, h * R); c.lineTo(0.07 * R, 0); c.closePath();
        c.fillStyle = col[0]; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
        c.beginPath(); c.moveTo(0.02 * R, 0.02 * R); c.lineTo(0.02 * R, h * R); c.strokeStyle = col[1]; c.lineWidth = 0.03 * R; c.stroke();
        c.restore();
      }
    } else if (a === 'moss') {
      c.beginPath(); c.ellipse(-0.1 * R, top + R * 0.04, R * 0.48, R * 0.14, 0.1, Math.PI, 0, true);
      for (let i = 0; i < 5; i++) { const x = R * (0.38 - i * 0.2); c.quadraticCurveTo(x + R * 0.04, top - R * 0.1, x - R * 0.1, top + R * 0.02); }
      c.closePath(); c.fillStyle = '#7fd35a'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
      blob(c, R * 0.12, top + R * 0.16, R * 0.06, R * 0.06, '#ff7eb6', lw * 0.5);
    } else if (a === 'hood') {                                     // Brother Basalt, the monk
      c.beginPath(); c.moveTo(-R * 0.95, cy + R * 0.1); c.quadraticCurveTo(-R * 0.9, cy + R * 1.0, 0, cy + R * 0.98); c.quadraticCurveTo(R * 0.9, cy + R * 1.0, R * 0.95, cy + R * 0.1);
      c.quadraticCurveTo(R * 0.6, cy + R * 0.55, 0, cy + R * 0.55); c.quadraticCurveTo(-R * 0.6, cy + R * 0.55, -R * 0.95, cy + R * 0.1); c.closePath();
      c.fillStyle = '#8a5a3a'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    }
  }

  // ---------------- orbiloon: a jelly bell that wears its own little orbit ----------------
  function drawOrbi(c, lk, st) {
    const { t, L, lw } = st, pal = palOf(PALS.orbiloon, lk.pal, 'sky'), yc = 1.45 + 0.08 * Math.sin(t * Math.PI + (lk.off || 0)), R = 0.62;
    const pf = (((t % 1.2) + 1.2) % 1.2) / 1.2;                                    // hover puff: honest cold-gas burps
    c.beginPath(); c.ellipse(0, yc - R * 0.35 - 0.2 - pf * 0.7, 0.08 + pf * 0.25, 0.04 + pf * 0.08, 0, 0, 2 * Math.PI); c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - pf)})`; c.lineWidth = 0.03; c.stroke();
    for (let i = 0; i < 5; i++) {
      const x0 = -0.4 + i * 0.2, sw = Math.sin(t * 1.6 + i * 1.3) * 0.15, len = 0.95 + (i % 2) * 0.25;
      stroke2(c, [x0, yc - 0.2, x0 + sw, yc - 0.2 - len * 0.55, x0 - sw * 0.6, yc - 0.2 - len], 0.07, pal[1], lw);
    }
    if (lk.acc === 'wand' || lk.acc === 'scroll') orbiProp(c, lk, t, yc, lw);
    // its own little orbit: seen from just above, so the far half (y > 0) goes behind the bell, the near half in front
    const tilt = 0.22 + Math.sin(t * 0.4) * 0.07, ringA = (t * Math.PI * 0.8 + (lk.off || 0)) % (2 * Math.PI), ry0 = yc - 0.2;
    const ring = (from, to) => { c.beginPath(); c.ellipse(0, ry0, R * 1.45, R * 0.3, tilt, from, to); c.strokeStyle = INK; c.lineWidth = 0.06 + 2 * lw; c.stroke(); c.strokeStyle = '#ffd166'; c.lineWidth = 0.06; c.stroke(); };
    const bead = () => { const px = Math.cos(ringA) * R * 1.45, py = Math.sin(ringA) * R * 0.3, ct = Math.cos(tilt), sn = Math.sin(tilt);
      blob(c, px * ct - py * sn, ry0 + px * sn + py * ct, 0.075, 0.075, '#ff7eb6', lw * 0.7); };
    const near = Math.sin(ringA) < 0;
    ring(0, Math.PI);
    if (!near) bead();
    const pulse = st.talk > 0 ? 1 + 0.05 * Math.abs(Math.sin(t * 10)) : 1, Rp = R * pulse;
    const bell = () => { c.beginPath(); c.ellipse(0, yc, Rp, R * 0.92 * pulse, 0, Math.PI, 0, true);
      for (let i = 0; i < 4; i++) { const x1 = Rp - (i + 1) * Rp / 2; c.quadraticCurveTo(Rp - (i + 0.5) * Rp / 2, yc - 0.22, x1, yc); } c.closePath(); };
    c.save(); c.globalAlpha *= 0.95; toon(c, bell, pal, L, 0.1, lw, [-0.25, yc + 0.38, 0.12, 0.06, 0.6]); c.restore();
    const lamp = lk.acc === 'lamp', gr = c.createRadialGradient(0, yc + 0.22, 0, 0, yc + 0.22, lamp ? 0.42 : 0.3), ga = st.talk > 0 || lamp ? 0.95 : 0.6;
    gr.addColorStop(0, lamp ? `rgba(255,224,102,${ga})` : `rgba(255,246,168,${ga})`); gr.addColorStop(1, 'rgba(255,246,168,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(0, yc + 0.22, lamp ? 0.42 : 0.3, 0, 2 * Math.PI); c.fill();
    eyes2(c, 0, yc + 0.02, 0.2, 0.1, st.look || [0, 0], blinkAt(t, lk.off || 2), lw);
    c.fillStyle = 'rgba(255,120,160,0.45)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.36, yc - 0.1, 0.06, 0.032, 0, 0, 2 * Math.PI); c.fill(); }
    c.beginPath(); if (st.talk > 0) { c.arc(0, yc - 0.13, 0.035 + 0.015 * Math.abs(Math.sin(t * 10)), 0, 2 * Math.PI); c.fillStyle = INK; c.fill(); }
    else { c.arc(0, yc - 0.08, 0.045, 0.2 * Math.PI, 0.8 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
    if (lk.acc === 'specs') for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.2, yc + 0.02, 0.14, 0, 2 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw * 0.9; c.stroke(); }
    ring(Math.PI, 2 * Math.PI);
    if (near) bead();
    if (st.helmet) glass(c, 0, yc, 0.8, L, lw);
  }
  function orbiProp(c, lk, t, yc, lw) {
    const tx = 0.4 + Math.sin(t * 1.6 + 5.2) * 0.15 * 0.4, ty = yc - 0.75;
    if (lk.acc === 'wand') {                                       // Peri: a traffic wand with a teal glowing tip
      stroke2(c, [tx, ty, tx + 0.35, ty + 0.3], 0.07, '#3b3448', lw);
      const on = Math.sin(t * 6) > 0;
      if (on) { const gr = c.createRadialGradient(tx + 0.42, ty + 0.36, 0, tx + 0.42, ty + 0.36, 0.25); gr.addColorStop(0, 'rgba(124,245,214,0.7)'); gr.addColorStop(1, 'rgba(124,245,214,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(tx + 0.42, ty + 0.36, 0.25, 0, 2 * Math.PI); c.fill(); }
      stroke2(c, [tx + 0.32, ty + 0.27, tx + 0.48, ty + 0.41], 0.09, on ? '#7cf5d6' : '#3a8f86', lw);
    } else {                                                       // Nodey: a rolled map
      c.save(); c.translate(tx + 0.1, ty + 0.1); c.rotate(0.5);
      rrect(c, -0.22, -0.07, 0.44, 0.14, 0.05); c.fillStyle = '#ffe9b8'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      for (const s of [-1, 1]) blob(c, s * 0.22, 0, 0.04, 0.085, '#c98a4a', lw * 0.6);
      c.restore();
    }
  }

  // ---------------- survey bot: a box on one wheel, CRT face, a prop in its clamp ----------------
  function drawBot(c, lk, st) {
    const { t, L, lw } = st, pal = palOf(PALS.bot, lk.pal, 'survey'), rock = Math.sin(t * 4.4 + (lk.off || 0)) * 0.03;
    blob(c, 0, 0.18, 0.18, 0.18, '#3b3448', lw);
    c.save(); c.translate(0, 0.18); c.rotate(t * 0.8); c.beginPath(); c.moveTo(-0.07, 0); c.lineTo(0.07, 0); c.moveTo(0, -0.07); c.lineTo(0, 0.07); c.strokeStyle = '#a59fbd'; c.lineWidth = 0.035; c.stroke(); c.restore();
    c.save(); c.translate(0, 0.18); c.rotate(rock); c.translate(0, -0.18);
    c.beginPath(); c.moveTo(0.25, 0.95); c.lineTo(0.32, 1.2); c.strokeStyle = INK; c.lineWidth = lw * 1.2; c.stroke();
    blob(c, 0.32, 1.22, 0.045, 0.045, st.talk > 0 || t % 1 < 0.5 ? '#ff5d5d' : '#5a4f74', lw * 0.7);
    stroke2(c, [-0.4, 0.62, -0.6, 0.5], 0.08, pal[1], lw);
    botProp(c, lk, t, lw);
    c.beginPath(); c.moveTo(-0.6, 0.5); c.lineTo(-0.68, 0.42); c.moveTo(-0.6, 0.5); c.lineTo(-0.66, 0.58); c.strokeStyle = INK; c.lineWidth = lw * 1.4; c.stroke();
    toon(c, () => rrect(c, -0.4, 0.3, 0.8, 0.65, 0.12), pal, L, 0.06, lw, [-0.25, 0.86, 0.08, 0.04, 0]);
    c.save(); rrect(c, -0.4, 0.3, 0.8, 0.65, 0.12); c.clip(); c.fillStyle = '#ff9f43'; c.fillRect(-0.45, 0.4, 0.9, 0.07); c.restore();
    rrect(c, -0.4, 0.3, 0.8, 0.65, 0.12); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    rrect(c, -0.28, 0.53, 0.56, 0.34, 0.07); c.fillStyle = '#16283a'; c.fill(); c.lineWidth = lw * 0.8; c.stroke();
    c.fillStyle = '#7cf5d6'; c.strokeStyle = '#7cf5d6'; c.lineWidth = 0.035; c.lineCap = 'round';
    const lx = (st.look ? st.look[0] : 0) * 0.04;
    if (st.talk > 0) {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.1 - 0.05 + lx, 0.74); c.lineTo(s * 0.1 + lx, 0.79); c.lineTo(s * 0.1 + 0.05 + lx, 0.74); c.stroke(); }
      for (let i = 0; i < 5; i++) { const h = 0.02 + 0.05 * Math.abs(Math.sin(t * 13 + i * 1.7)); c.fillRect(-0.12 + i * 0.055, 0.6, 0.035, h); }
    } else if ((t + (lk.off || 0)) % 3 > 0.1) for (const s of [-1, 1]) c.fillRect(s * 0.1 - 0.035 + lx, 0.7, 0.07, 0.07);
    c.restore();
  }
  function botProp(c, lk, t, lw) {
    if (lk.acc === 'clipboard') {
      c.save(); c.translate(-0.72, 0.48); c.rotate(0.15);
      rrect(c, -0.11, -0.15, 0.22, 0.3, 0.03); c.fillStyle = '#c98a4a'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      c.fillStyle = PAPER; c.fillRect(-0.08, -0.12, 0.16, 0.22);
      c.strokeStyle = '#6d5f8a'; c.lineWidth = 0.015; c.beginPath(); for (let y = -0.08; y < 0.08; y += 0.045) { c.moveTo(-0.06, y); c.lineTo(0.06, y); } c.stroke();
      c.restore();
    } else if (lk.acc === 'dish') {
      c.save(); c.translate(-0.66, 0.55); c.rotate(0.6 + Math.sin(t * 0.7) * 0.15);
      c.beginPath(); c.ellipse(0, 0.12, 0.2, 0.08, 0, 0, Math.PI, true); c.closePath(); c.fillStyle = '#e8e4f7'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      c.beginPath(); c.moveTo(0, 0.08); c.lineTo(0, 0.22); c.stroke(); blob(c, 0, 0.24, 0.025, 0.025, '#ff5d5d', lw * 0.5);
      c.restore();
    } else if (lk.acc === 'spoon') {
      c.save(); c.translate(-0.68, 0.5); c.rotate(-0.5);
      c.beginPath(); c.moveTo(0, -0.02); c.lineTo(0, 0.2); c.strokeStyle = INK; c.lineWidth = 0.06; c.stroke(); c.strokeStyle = '#d9d6f2'; c.lineWidth = 0.03; c.stroke();
      blob(c, 0, 0.27, 0.06, 0.08, '#d9d6f2', lw * 0.7);
      c.restore();
    }
  }

  const DRAW = { pipkin: drawPipkin, murk: drawMurk, oggle: drawOggle, crustling: drawCrust, orbiloon: drawOrbi, bot: drawBot };
  function drawSprite(ctx, race, look, st) {
    const fn = DRAW[race]; if (!fn) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const S = { t: 0, talk: 0, mood: 'chat', look: [0, 0], L: [-0.55, 0.83], lw: 0.03, ...st };
    if (!(S.t >= 0)) S.t = Number.isFinite(S.t) ? 3600 - (-S.t % 3600) : 0;          // the animations use t % period: keep t >= 0
    fn(ctx, look || {}, S);
    ctx.restore();
  }
  const heightOf = (race, look) => (race === 'crustling' ? 1.82 * ((look && look.R) || 0.8) : RACES[race] ? RACES[race].h : 1.5);


  // ======================================================================
  //  PLACEMENT  —  Mochi spots (when mochi is on), surfaces, stations
  // ======================================================================

  // the spots and their fill order: named NPCs and named extras by k, then the crowd
  function spotsOf(g) {
    if (typeof Mochi === 'undefined' || !Mochi || typeof Mochi.spots !== 'function' || !on(g, 'mochi')) return null;
    try { return Mochi.spots(g) || null; } catch (e) { if (Game.strict) throw e; return null; }
  }

  function place(g) {
    const m = g.mod.npcs;
    if (m.placed) return m.placed;
    const spots = spotsOf(g), byRole = {};
    if (spots) for (const s of spots) byRole[s.id] = s;
    const out = [], atSpot = {};
    const queue = (role, n) => { (atSpot[role] = atSpot[role] || []).push(n); };
    for (const d of DEFS) {
      const n = { id: d.id, name: d.name, short: d.short || d.name, race: d.race, look: { off: (hash32(d.id) % 997) / 97, ...d.look }, def: d, kind: 'named' };
      const at = d.at;
      if (at.station) { n.kind = at.keeper ? 'keeper' : 'visitor'; n.station = at.station; n.sx = at.x || 0; n.sy = at.y || 0; out.push(n); continue; }
      if (at.spot && byRole[at.spot]) { n.k = at.k || 0; queue(at.spot, n); continue; }
      const f = at.spot ? at.fallback : at;
      if (f && onSurface(g, n, f.body, f.th)) out.push(n);
    }
    if (spots) {
      for (const d of NAMED_EXTRAS) if (byRole[d.spot]) queue(d.spot, { id: d.id, name: d.name, short: d.name, race: d.race, look: { off: (hash32(d.id) % 997) / 97, ...d.look }, def: d, kind: 'extra', k: d.k, own: d.line });
      const taken = new Set(RESERVED.concat(DEFS.map((d) => d.name)));
      for (const role in CROWD) if (byRole[role]) for (let k = 0; k < CROWD[role].n; k++) queue(role, crowdOne(role, k, taken));
      for (const role in atSpot) {
        const s = byRole[role], list = atSpot[role].sort((a, b) => (a.k ?? 99) - (b.k ?? 99)), sp = Math.min(2.2, s.w / list.length);
        list.forEach((n, i) => { onSpot(g, n, s, (i - (list.length - 1) / 2) * sp); out.push(n); });
      }
    }
    m.placed = out;
    const named = out.filter((n) => n.kind === 'named').length, extras = out.filter((n) => n.kind === 'extra').length;
    Game.log(g, `npc placed ${named} named, ${extras} extras, ${out.length - named - extras} at stations (mochi spots: ${spots ? Object.keys(atSpot).length + '/' + spots.length : 'off'})`);
    return out;
  }

  function crowdOne(role, k, taken) {
    const R = rng(hash32(role) + k), C = CROWD[role], race = C.races[Math.floor(R() * C.races.length)], pool = POOL[race];
    let name = pool[Math.floor(R() * pool.length)];
    for (let i = 0; taken.has(name) && i < pool.length; i++) name = pool[(pool.indexOf(name) + 1) % pool.length];
    taken.add(name);
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const look = { off: R() * 9, acc: pick(ACCS[race]) };
    if (race === 'pipkin') { look.ripe = pick(['sprout', 'lime', 'yellow', 'peach', 'pink', 'plum']); look.cloth = pick(Object.keys(PALS.cloth)); }
    else if (race === 'murk') { look.pal = pick(Object.keys(PALS.murk)); look.eye = pick(EYES); }
    else if (race === 'oggle') { look.pal = pick(Object.keys(PALS.oggle)); look.iris = R() < 0.25 ? '#ff3b5c' : '#ffd166'; }
    else if (race === 'crustling') { look.pal = pick(Object.keys(PALS.crustling)); look.R = 0.6 + R() * 0.35; look.seed = 20 + Math.floor(R() * 900); }
    else look.pal = pick(Object.keys(PALS[race]));
    return { id: `x:${role}:${k}`, name, short: name, race, look, kind: 'extra', crowd: role };
  }

  // on a body's surface at polar angle th (bodies never rotate: body-local = world - centre)
  function onSurface(g, n, bodyId, th) {
    const b = g.w.byId[bodyId]; if (!b || b.star) return false;
    const r = World.surfaceR(b, th);
    Object.assign(n, { body: b, lx: r * Math.cos(th), ly: r * Math.sin(th), ux: Math.cos(th), uy: Math.sin(th), air: false, snapped: false, surface: true });
    return true;
  }
  function onSpot(g, n, s, off) {
    const b = g.w.byId[s.body || 'mochi']; if (!b) return;
    const tx = s.uy, ty = -s.ux;                                    // along the floor, east (clockwise)
    Object.assign(n, { body: b, lx: s.lx + tx * off, ly: s.ly + ty * off, ux: s.ux, uy: s.uy, air: !!s.air, spot: s.id, snapped: false });
  }

  // feet onto the floor: a short terrain raycast along -up (lazily, the first time someone is near)
  function snap(g, n) {
    n.snapped = true;
    if (!n.body || typeof Terrain === 'undefined') return;
    const T = Terrain.of(n.body), up = n.surface ? 3 : SNAP_UP;
    let s = up;
    while (s < up + 3 && Terrain.solid(T, n.lx + n.ux * s, n.ly + n.uy * s)) s += 0.5;
    const hit = Terrain.raycast(T, n.lx + n.ux * s, n.ly + n.uy * s, -n.ux, -n.uy, s + SNAP_DOWN);
    if (hit) { n.lx = hit.lx + n.ux * 0.06; n.ly = hit.ly + n.uy * 0.06; }
  }
  // if the ground under someone is dug away, they settle onto the new floor
  function resnap(g, n) {
    if (!n.body || typeof Terrain === 'undefined') return;
    const T = Terrain.of(n.body);
    if (!Terrain.solid(T, n.lx - n.ux * 0.3, n.ly - n.uy * 0.3)) snap(g, n);
  }

  // world position, local up and height of everyone, at the current time
  function where(g, n, bs) {
    n.h = heightOf(n.race, n.look);
    if (n.body) {
      const st = bs ? bs[n.body.idx] : World.bodyState(g.w, n.body, g.t);
      n.x = st[0] + n.lx; n.y = st[1] + n.ly; n.up = [n.ux, n.uy]; n.vx = st[2]; n.vy = st[3];
      return n;
    }
    const S = stationOf(g, n.station);
    if (!S) { n.x = NaN; return n; }
    const th = S.facing(g.t), up = [Math.cos(th), Math.sin(th)];
    let p;
    if (n.kind === 'keeper') { const ka = S.keeperAt || [0, 0, 1.2]; p = S.local(g.t, ka[0], ka[1]); n.h = ka[2] ?? 1.2; }
    else p = S.local(g.t, n.sx, n.sy);
    n.x = p[0]; n.y = p[1]; n.vx = p[2]; n.vy = p[3]; n.up = up;
    return n;
  }
  function stationOf(g, id) {
    if (typeof Stations === 'undefined' || !Stations || !on(g, 'stations')) return null;
    return Stations.byId(g, id);
  }
  const live = (g, n) => !(n.def && n.def.after && !(g.mod.npcs.fav[n.def.after] === 'done'));   // Radish turns up after `scoop`

  function list(g) {
    if (!on(g, 'npcs')) return [];
    const bs = World.states(g.w, g.t);
    return place(g).filter((n) => live(g, n) && (n.kind !== 'keeper' && n.kind !== 'visitor' || stationOf(g, n.station))).map((n) => where(g, n, bs));
  }
  const findNpc = (g, id) => place(g).find((n) => n.id === id) || null;


  // ======================================================================
  //  TALKING  —  F to talk (cycling lines), ambient barks, station visitors
  // ======================================================================

  const astroOut = (g) => g.mode === 'eva' && g.astro && g.astro.on;
  const me = (g) => (astroOut(g) ? g.astro : g.sh);
  const headOf = (n) => [n.x + n.up[0] * (n.h * 0.55), n.y + n.up[1] * (n.h * 0.55)];
  const distTo = (g, n) => { if (!n.up) return Infinity; const [hx, hy] = headOf(n), p = me(g); return Math.hypot(p.x - hx, p.y - hy); };

  // the next thing someone says when you press F (and the state it leaves behind)
  function talk(g, n) {
    const m = g.mod.npcs, d = n.def || {}, f = d.favour && FAVOURS[d.favour] ? d.favour : null;
    if (f && m.fav[f] === 'offered') return accept(g, f);
    if (f && m.fav[f] === 'active' && ready(g, f) && !FAVOURS[f].keeper) return finish(g, f);
    if (n.kind === 'extra') {                                       // named extras open with their own line, then race barks
      const i = m.line[n.id] || 0; m.line[n.id] = i + 1; m.met[n.id] = true;
      if (n.own && i === 0) return speak(g, n, n.own[1], n.own[0]);
      return speak(g, n, barkOf(g, n), barkMood(g, n));
    }
    if (!m.met[n.id]) {
      m.met[n.id] = true;
      if (n.race !== 'pipkin') m.metAlien = true;
      if (!d.hello) m.line[n.id] = 1;
      const [mood, text] = d.hello || d.lines[0];
      return speak(g, n, text, mood);
    }
    if (f && !m.fav[f] && offerable(g, f)) { m.fav[f] = 'offered'; Game.log(g, `npc favour ${f} offered by ${n.name}`); return speak(g, n, d.offer[1], d.offer[0]); }
    if (f && m.fav[f] === 'active' && (m.line[n.id] || 0) % 2 === 1) { m.line[n.id]++; return speak(g, n, d.wait[1], d.wait[0]); }
    const i = (m.line[n.id] || 0) % d.lines.length; m.line[n.id] = (m.line[n.id] || 0) + 1;
    return speak(g, n, d.lines[i][1], d.lines[i][0]);
  }

  function prompt(g, n) {
    const m = g.mod.npcs, d = n.def || {}, f = d.favour && FAVOURS[d.favour] ? d.favour : null;
    if (f && m.fav[f] === 'offered') return `Accept: ${FAVOURS[f].ask} for ${n.short} ($${FAVOURS[f].reward})`;
    if (f && m.fav[f] === 'active' && ready(g, f) && !FAVOURS[f].keeper) return FAVOURS[f].item ? `Give ${n.short} ${FAVOURS[f].ask}` : `Tell ${n.short}`;
    if (f && m.met[n.id] && !m.fav[f] && offerable(g, f)) return `Talk to ${n.short} (a favour?)`;
    return `Talk to ${n.short}`;
  }

  function speak(g, n, text, mood) { return say(g, n, text, mood); }
  const barkOf = (g, n) => { const L = BARKS[n.race], m = g.mod.npcs; return L[Math.floor(m.rand() * L.length)]; };
  const barkMood = (g, n) => (n.race === 'oggle' && g.mod.npcs.rand() < 0.34 ? 'grumpy' : 'chat');

  function interactions(g) {
    const m = g.mod.npcs; if (!m || g.ui || !astroOut(g) || g.status === 'dead') return null;
    let best = null, bd = TALK_R;
    for (const n of near(g)) {
      if (n.kind === 'keeper') continue;
      const d = distTo(g, n); if (d < bd) { bd = d; best = n; }
    }
    if (!best) return null;
    const n = best;
    return [{ key: 'KeyF', text: prompt(g, n), dist: bd, col: RACES[n.race].tint, act: (g2) => talk(g2, n) }];
  }

  // everyone within NEAR_R of the camera (or of you), placed and up to date
  function near(g) {
    const p = me(g), out = [], bs = World.states(g.w, g.t);
    for (const n of place(g)) {
      if (!live(g, n)) continue;
      if (n.body) { const st = bs[n.body.idx]; if (Math.hypot(st[0] + n.lx - p.x, st[1] + n.ly - p.y) > NEAR_R) continue; }
      else if (!stationOf(g, n.station)) continue;
      where(g, n, bs);
      if (!(Number.isFinite(n.x) && Math.hypot(n.x - p.x, n.y - p.y) < NEAR_R)) continue;
      if (n.body && !n.snapped) { snap(g, n); where(g, n, bs); }
      out.push(n);
    }
    return out;
  }

  // ambient barks: named NPCs within 12 m (once per 45 s each), extras within 6 m (once per spot per 25 s),
  //  station visitors when your ship comes within 60 m of their station
  function barks(g) {
    const m = g.mod.npcs; if (g.real - m.barkAll < BARK_ANY || g.status === 'dead' || g.ui) return;
    if (m.bubbles.some((b) => b.talked && g.real - b.t0 < b.life)) return;    // you are in a conversation
    for (const n of near(g)) {
      if (n.kind === 'keeper' || m.bubbles.some((b) => b.npc === n)) continue;
      const d = distTo(g, n);
      if (n.kind === 'visitor') {
        const S = stationOf(g, n.station), [sx, sy] = S.state(g.t), shipD = Math.hypot(g.sh.x - sx, g.sh.y - sy);
        if (!(shipD < VISIT_R || (astroOut(g) && d < BARK_R))) continue;
      } else if (d > (n.kind === 'extra' ? CROWD_R : BARK_R)) continue;
      const k = n.crowd ? 'spot:' + n.crowd : n.id, gap = n.crowd ? CROWD_GAP : BARK_GAP;
      if (g.real - (m.barkT[k] ?? -1e9) < gap) continue;
      m.barkT[k] = g.real; m.barkAll = g.real;
      if (n.kind === 'extra') say(g, n, barkOf(g, n), barkMood(g, n));
      else { const L = n.def.lines, [mood, text] = L[Math.floor(m.rand() * L.length)]; say(g, n, text, mood); }
      return;
    }
  }


  // ======================================================================
  //  FAVOURS  —  small requests that become jobs (FAVOURS panel, not JOBS)
  // ======================================================================

  function offerable(g, f) {
    const F = FAVOURS[f];
    if (F.needs && !F.needs.every((id) => on(g, id))) return false;
    if (F.wreck && (typeof Wrecks === 'undefined' || !Wrecks || !Wrecks.byId || !Wrecks.byId(g, F.wreck))) return false;
    if (F.phil && (typeof Wrecks === 'undefined' || !Wrecks || !Wrecks.byId || !Wrecks.byId(g, 'phil'))) return false;
    return true;
  }

  const shipNear = (g) => (g.status === 'landed' || g.status === 'docked') && Math.hypot(me(g).x - g.sh.x, me(g).y - g.sh.y) < HAND_R;
  const have = (g, item) => (g.pack[item] || 0) + (shipNear(g) ? g.cargo[item] || 0 : 0);

  function ready(g, f) {
    const F = FAVOURS[f], m = g.mod.npcs;
    if (F.item) return have(g, F.item) >= F.qty;
    if (F.wreck) return typeof Wrecks !== 'undefined' && !!Wrecks && Wrecks.isSalvaged(g, F.wreck);
    if (F.kills) return on(g, 'combat') && (g.mod.combat.kills || 0) - ((m.favData[f] && m.favData[f].kills0) || 0) >= F.kills;
    if (F.phil) return !!(m.favData[f] && m.favData[f].saidHi);
    return false;
  }

  function accept(g, f) {
    const m = g.mod.npcs, F = FAVOURS[f], n = findNpc(g, F.giver), who = n ? n.short : DEF[F.giver].short || DEF[F.giver].name;
    m.fav[f] = 'active';
    m.favData[f] = { t: g.t, ...(F.kills && on(g, 'combat') ? { kills0: g.mod.combat.kills || 0 } : {}) };
    Game.toast(g, (F.item ? `FAVOUR: BRING ${who} ${F.ask} ($${F.reward})${F.where ? `: ${F.where}` : ''}` : `FAVOUR: ${F.ask} FOR ${who} ($${F.reward})`).toUpperCase(), '#ffd166', 'favour');
    Game.log(g, `npc favour ${f} accepted`);
    if (n) say(g, n, ...thanks(n));
    return true;
  }
  const thanks = (n) => ({ pipkin: ['Thank you, rookie!', 'happy'], murk: ['Good. Quietly good.', 'happy'], oggle: ['DEAL!', 'happy'], crustling: ['...good.', 'happy'],
                           orbiloon: ['Wheee! Thank you.', 'happy'], bot: ['TASK LOGGED. THANK YOU.', 'happy'] }[n.race]);

  function take(g, item, qty) {
    const fromPack = Math.min(qty, g.pack[item] || 0);
    if (fromPack) { g.pack[item] -= fromPack; if (!g.pack[item]) delete g.pack[item]; }
    if (qty > fromPack) Game.removeCargo(g, item, qty - fromPack);
  }

  function finish(g, f) {
    const m = g.mod.npcs, F = FAVOURS[f], d = DEF[F.giver], n = findNpc(g, F.giver);
    if (F.item) take(g, F.item, F.qty);
    m.fav[f] = 'done';
    g.money += F.reward;
    if (n || F.keeper) say(g, n || F.giver, d.done[1], d.done[0]);
    Game.toast(g, `FAVOUR DONE: ${(d.short || d.name).toUpperCase()} +$${F.reward}`, '#8ff0b0', 'favour');
    Game.log(g, `npc favour ${f} done +$${F.reward}`);
    Game.save(g);
    return true;
  }

  // keeper favours need no F: docked at the keeper's station (shop closed, keeper done talking, a few seconds in),
  //  a met keeper offers and you accept; dock with the job done and they pay. One line per dock.
  const KEEP_T = 4;
  function keeperFavours(g) {
    const m = g.mod.npcs, S = typeof Stations !== 'undefined' && Stations && on(g, 'stations') ? Stations.dockedAt(g) : null, at = S ? S.id : null;
    if (at !== m.dockedAt) { m.dockedAt = at; m.dockT = g.real; m.dockSaid = false; }
    if (!at || m.dockSaid || g.ui || g.real - m.dockT < KEEP_T) return;
    for (const f in FAVOURS) {
      const F = FAVOURS[f]; if (F.keeper !== at || !offerable(g, f) || talking(g, F.giver)) continue;
      const d = DEF[F.giver];
      if (!m.fav[f] && m.met[F.giver]) {
        m.dockSaid = true; m.fav[f] = 'active'; m.favData[f] = { t: g.t };
        say(g, F.giver, d.offer[1], d.offer[0]);
        Game.toast(g, `FAVOUR: ${F.ask} FOR ${d.short || d.name} ($${F.reward})`.toUpperCase(), '#ffd166', 'favour');
        Game.log(g, `npc favour ${f} accepted`);
      } else if (m.fav[f] === 'active' && ready(g, f)) { m.dockSaid = true; finish(g, f); }
      else if (m.fav[f] === 'active') { m.dockSaid = true; say(g, F.giver, d.wait[1], d.wait[0]); }
    }
  }

  // UNIT-7's brother: walk up to Little Phil on Seed (within 6 m of his hull) and he says hi back
  function philCheck(g) {
    const m = g.mod.npcs;
    if (m.fav.hiback !== 'active' || !astroOut(g) || (m.favData.hiback && m.favData.hiback.saidHi)) return;
    if (typeof Wrecks === 'undefined' || !Wrecks) return;
    const wr = Wrecks.byId(g, 'phil'); if (!wr) return;
    if (Wrecks.hullDist(wr, g.t, g.astro.x, g.astro.y) < 6 || Wrecks.isSalvaged(g, 'phil')) {
      m.favData.hiback = { ...(m.favData.hiback || {}), saidHi: true };
      const [x, y] = wr.state(g.t);
      Game.popup(g, 'HI!', '#7cf5d6', x, y + 2, 26);
      Game.toast(g, 'LITTLE PHIL SAYS HI! TELL UNIT-7', '#7cf5d6', 'favour');
      Game.log(g, 'npc favour hiback: Phil said hi');
    }
  }

  // laser pokes: sweep the mining laser across someone and they complain (never any damage: NPCs are not targets)
  const POKE = { oggle: 'OI!', murk: 'Rude.', crustling: '...ow.', bot: 'HEY.', orbiloon: 'Eep!', pipkin: 'Eep!' }, POKE_GAP = 5;
  function pokes(g) {
    const B = astroOut(g) && on(g, 'eva') && g.mod.eva && g.mod.eva.beam; if (!B) return;
    const m = g.mod.npcs, dx = B.x1 - B.x0, dy = B.y1 - B.y0, L2 = dx * dx + dy * dy || 1;
    for (const n of near(g)) {
      if (n.kind === 'keeper' || g.real - (m.pokeT[n.id] ?? -1e9) < POKE_GAP) continue;
      const cx = n.x + n.up[0] * n.h / 2, cy = n.y + n.up[1] * n.h / 2, u = Math.max(0, Math.min(1, ((cx - B.x0) * dx + (cy - B.y0) * dy) / L2));
      if (Math.hypot(B.x0 + u * dx - cx, B.y0 + u * dy - cy) > 0.6 + n.h * 0.25) continue;
      m.pokeT[n.id] = g.real;
      say(g, n, POKE[n.race], 'grumpy');
      return;
    }
  }

  const activeFavours = (g) => Object.keys(FAVOURS).filter((f) => g.mod.npcs.fav[f] === 'active');


  // ======================================================================
  //  BUBBLES  —  say(), the typewriter, the glyph-to-English reveal, radio bubbles
  // ======================================================================

  // who: an NPC id ('mumble', 'dot', 'x:market:2') or a placed NPC. Returns the bubble (or null).
  function say(g, who, text, mood = 'chat') {
    const m = g && g.mod && g.mod.npcs; if (!m || !text) return null;
    const n = typeof who === 'string' ? findNpc(g, who) : who;
    const d = n ? null : DEF[who];
    if (!n && !d) return null;
    if (n) where(g, n);
    const race = n ? n.race : d.race, name = n ? n.name : d.name;
    if (!MOOD_TINT[mood]) mood = 'chat';
    const lvl = translator(g), words = String(text).split(' ').filter((w) => w.length);
    const read = words.map((w) => canRead(lvl, race, w, namesOf(g))), all = read.every(Boolean), none = !read.some(Boolean);
    const hk = hash32(lvl + '|' + text), quick = race !== 'pipkin' && m.heard.includes(hk);
    if (race !== 'pipkin' && !none && !quick) { m.heard.push(hk); if (m.heard.length > HEARD_MAX) m.heard.splice(0, m.heard.length - HEARD_MAX); }
    const typeT = text.length / RACES[race].cps;
    const b = { npc: n, id: n ? n.id : who, name, race, text: String(text), mood, t0: g.real, revT: g.real, quick, lvl, typeT,
                life: typeT + 2.5 + 0.03 * text.length, talked: !!(n && astroOut(g) && distTo(g, n) < TALK_R + 1), nudge: null };
    if (n) n.talkUntil = g.real + typeT + 0.3;
    if (n && n.kind === 'keeper') m.met[n.id] = true;
    if (!n && d) m.met[d.id] = true;
    if (race !== 'pipkin' && !all && !m.firstDone && !(m.firstFrom && m.firstAt)) { m.firstAt = m.firstAt || g.real; m.firstWho = name; m.firstRace = race; }   // the latest, until the hint shows
    if (radioWanted(g, n)) { b.t0 = null; m.radio.push(b); if (m.radio.length > RADIO_MAX) m.radio.splice(1, 1); }
    else {
      m.bubbles = m.bubbles.filter((o) => o.id !== b.id);
      m.bubbles.push(b);
      while (m.bubbles.length > MAX_WORLD) m.bubbles.shift();
    }
    Game.log(g, `npc ${name} (${race}${race === 'pipkin' ? '' : all ? ', read' : none ? ', glyphs' : ', half read'}): "${text}"`);
    return b;
  }

  // off-screen speakers, and keepers / visitors of a station drawn without detail, talk over the radio
  function radioWanted(g, n) {
    if (!n) return true;
    const m = g.mod.npcs; where(g, n);
    if (!Number.isFinite(n.x)) return true;
    const v = m.view;
    if (!v) return (n.kind === 'keeper' || n.kind === 'visitor') && Math.hypot(n.x - g.sh.x, n.y - g.sh.y) > 150;
    if (n.x < v.rect[0] || n.x > v.rect[2] || n.y < v.rect[1] || n.y > v.rect[3]) return true;
    if (n.kind === 'keeper' || n.kind === 'visitor') { const S = stationOf(g, n.station); return !S || S.r * v.zoom <= 45; }
    return v.zoom < DRAW_ZOOM;
  }

  function talking(g, id) {
    const m = g && g.mod && g.mod.npcs; if (!m) return false;
    const n = findNpc(g, id);
    if (n && n.talkUntil > g.real) return true;
    return m.radio.length > 0 && m.radio[0].id === id && m.radio[0].t0 != null && g.real - m.radio[0].t0 < m.radio[0].typeT + 0.3;
  }

  function tickBubbles(g) {
    const m = g.mod.npcs;
    m.bubbles = m.bubbles.filter((b) => g.real - b.t0 < b.life + 0.4);
    const r = m.radio[0];
    if (r && r.t0 == null) { r.t0 = g.real; r.revT = g.real; if (r.npc) r.npc.talkUntil = g.real + r.typeT + 0.3; }
    if (r && g.real - r.t0 > r.life + 0.4) m.radio.shift();
    const lvl = translator(g);
    if (lvl !== m.lvl) {                                           // a new translator re-reveals every bubble in view
      if (lvl > m.lvl) for (const b of [...m.bubbles, ...m.radio]) { b.lvl = lvl; b.revT = g.real; b.quick = false; b.lay = null; }
      const via = m.xlate != null ? 'dev L' : g.opts && g.opts.xlate != null ? '?xlate' : 'suit';
      Game.log(g, `translator level ${lvl} (${lvl >= 2 ? '6 languages' : lvl === 1 ? 'half the words' : 'Belt Common only'}, ${via})`);
      if (lvl > m.lvl && m.ready) Game.toast(g, lvl >= 2 ? 'TRANSLATOR ONLINE: 6 LANGUAGES' : 'PHRASEBOOK CLIPPED ON: HALF THE WORDS, ALL THE NUMBERS', '#7cf5d6', 'xlate');
      m.lvl = lvl;
    }
  }

  // ---------------- layout: words, slots, glyphs (once per bubble, in the bubble font) ----------------
  function layout(c, b) {
    if (b.lay && b.lay.lvl === b.lvl) return b.lay;
    c.font = `600 14px ${FONT}`;
    const sp = c.measureText(' ').width, names = namesOf(g0), lines = [];
    let cur = [], cw = 0, ci = 0;
    for (const raw of b.text.split(' ')) {
      if (!raw) { ci++; continue; }
      const mt = raw.match(/^(["'(]*)(.*?)([.,!?:;…"')]*)$/), lead = mt[1], core = mt[2], trail = mt[3];
      const lw = lead ? c.measureText(lead).width : 0, ww = core ? c.measureText(core).width : 0, tw = trail ? c.measureText(trail).width : 0, all = lw + ww + tw;
      if (cur.length && cw + sp + all > BUB_W) { lines.push(cur); cur = []; cw = 0; }
      const read = canRead(b.lvl, b.race, core, names);
      cur.push({ lead, core, trail, lw, ww, tw, all, read, c0: ci, c1: ci + raw.length,
                 prims: b.race !== 'pipkin' && core && !(read && b.quick) ? script(b.race, core, ww, GLYPH_H) : null });
      cw += (cur.length > 1 ? sp : 0) + all; ci += raw.length + 1;
    }
    if (cur.length) lines.push(cur);
    const words = lines.flat(), alien = b.race !== 'pipkin';
    const snd = alien && !words.every((o) => o.read) ? sound(b.race, b.text) : '';
    const bw = Math.max(90, ...lines.map((L) => L.reduce((a, o) => a + o.all, 0) + (L.length - 1) * sp)) + 30;
    const bh = lines.length * LINE_H + 14 + (snd ? 16 : 0);
    words.forEach((o, i) => { o.i = i; });
    return (b.lay = { lines, words, sp, snd, bw, bh, lvl: b.lvl });
  }
  let g0 = null;                                                   // the game being drawn (names for layout)

  const scramble = (wd, i) => { const R = rng(hash32(wd) + i); return [...wd].map((ch) => (/[a-z]/i.test(ch) ? String.fromCharCode(97 + Math.floor(R() * 26)) : ch)).join(''); };

  // 0 = glyphs, 1 = English; words appear when "typed", and readable alien words morph one after another
  function morphU(g, b, o) {
    if (b.race === 'pipkin' || !o.core) return 1;
    if (!o.read) return 0;
    if (b.quick) return 1;
    const age = g.real - b.t0, typed = o.c1 / RACES[b.race].cps;
    const start = Math.max(typed + 0.12, b.revT - b.t0 + 0.25 + 0.06 * o.i);
    return Math.max(0, Math.min(1, (age - start) / 0.3));
  }

  function drawBubble(g, kit, b, tx, ty, alpha, radio) {
    const c = kit.ctx, L = layout(c, b), age = g.real - b.t0, cps = RACES[b.race].cps, typed = age * cps;
    const tint = MOOD_TINT[b.mood], col = RACES[b.race].col, port = radio ? 30 : 0;
    const bw = L.bw + port, bh = Math.max(L.bh, radio ? 44 : 0);
    let bx, by;
    if (radio) { bx = kit.W / 2 - bw / 2; by = RADIO_Y; }
    else {
      bx = Math.max(10, Math.min(kit.W - bw - 14, tx - 30)); by = ty - 16 - bh - (b.nudge || 0);
      by = Math.max(40, by);
    }
    b.rect = [bx, by, bx + bw, by + bh];
    c.save(); c.globalAlpha = alpha;
    c.fillStyle = INK; kit.roundRect(bx + 4, by + 4, bw, bh, 12); c.fill();
    c.fillStyle = tint; kit.roundRect(bx, by, bw, bh, 12); c.fill();
    const tailX = Math.max(bx + 16, Math.min(bx + bw - 16, tx));
    if (!radio) { c.beginPath(); c.moveTo(tailX - 8, by + bh - 1); c.lineTo(tx, Math.max(ty, by + bh + 6)); c.lineTo(tailX + 6, by + bh - 1); c.closePath(); c.fill(); }
    c.strokeStyle = INK; c.lineWidth = 3; kit.roundRect(bx, by, bw, bh, 12); c.stroke();
    if (!radio) {
      c.beginPath(); c.moveTo(tailX - 8, by + bh); c.lineTo(tx, Math.max(ty, by + bh + 6)); c.lineTo(tailX + 6, by + bh); c.stroke();
      c.fillStyle = tint; c.fillRect(tailX - 6.5, by + bh - 2.5, 11, 4);
    }
    c.fillStyle = col; kit.roundRect(bx + 3, by + 6, 5, bh - 12, 2.5); c.fill();
    if (radio) portrait(c, b, bx + 24, by + bh / 2, 13, g.real);
    c.font = `700 11px ${FONT}`; c.textAlign = 'left';
    const tag = `${b.name.toUpperCase()} · ${RACES[b.race].tag}${radio ? ' · RADIO' : ''}`, tw = c.measureText(tag).width + 14;
    c.fillStyle = INK; kit.roundRect(bx + 12, by - 10, tw, 17, 5); c.fill();
    c.fillStyle = PAPER2; c.fillText(tag, bx + 19, by + 3);
    moodIcon(c, bx + bw - 6, by + 2, b.mood);
    c.font = `600 14px ${FONT}`; c.fillStyle = INK;
    L.lines.forEach((line, li) => {
      let x = bx + 16 + port;
      const base = by + 10 + (li + 1) * LINE_H - 4, mid = base - GLYPH_H / 2;
      for (const o of line) {
        if (typed < o.c0) break;
        const u = morphU(g, b, o), done = typed >= o.c1;
        if (o.lead) { c.fillStyle = INK; c.fillText(o.lead, x, base); }
        x += o.lw;
        if (o.core) {
          if (u >= 1 || b.race === 'pipkin') { c.fillStyle = INK; c.fillText(done ? o.core : o.core.slice(0, Math.max(0, Math.floor(typed - o.c0 - o.lead.length))), x, base); }
          else if (done) {
            c.save(); c.translate(x, mid); c.scale(1, u < 0.5 ? Math.max(0.02, 1 - 2 * u) : 2 * u - 1); c.translate(-x, -mid);
            if (u < 0.5) drawGlyphs(c, o.prims || script(b.race, o.core, o.ww, GLYPH_H), x, base);
            else { c.fillStyle = INK; c.fillText(u < 0.75 ? scramble(o.core, o.i) : o.core, x, base); }
            c.restore();
            if (u > 0 && u < 0.85) { c.fillStyle = `rgba(255,255,255,${0.9 * (1 - u)})`; c.beginPath(); c.arc(x + o.ww / 2, mid, 10 * (1 - u) + 2, 0, 2 * Math.PI); c.fill(); }
          }
        }
        x += o.ww;
        if (o.trail && done) { c.fillStyle = INK; c.fillText(o.trail, x, base); }
        x += o.tw + L.sp;
      }
    });
    if (L.snd) {
      c.font = `italic 500 11px ${FONT}`; c.fillStyle = '#6d5f8a';
      let s = L.snd; const room = bw - 30 - port;
      while (c.measureText(s + '…').width > room && s.length > 4) s = s.slice(0, -2);
      c.globalAlpha = alpha * Math.min(1, age * 2);
      c.fillText(s === L.snd ? s : s.trimEnd() + '…', bx + 16 + port, by + bh - 8);
    }
    c.restore();
  }

  function drawGlyphs(c, prims, x, y) {                            // (x, y) = baseline-left of the word slot
    c.save(); c.translate(x, y - GLYPH_H); c.fillStyle = INK; c.strokeStyle = INK; c.lineCap = 'round';
    for (const p of prims) {
      if (p[0] === 'dot') { c.beginPath(); c.arc(p[1], p[2], p[3], 0, 2 * Math.PI); c.fill(); }
      else if (p[0] === 'ring') { c.beginPath(); c.arc(p[1], p[2], p[3], 0, 2 * Math.PI); c.lineWidth = 1; c.stroke(); }
      else if (p[0] === 'line') { c.beginPath(); c.moveTo(p[1], p[2]); c.lineTo(p[3], p[4]); c.lineWidth = p[5]; c.stroke(); }
      else if (p[0] === 'ell') { c.beginPath(); c.ellipse(p[1], p[2], p[3], p[4], p[5], 0, 2 * Math.PI); c.lineWidth = 1.3; c.stroke(); }
      else if (p[0] === 'sq') {
        if (p[4]) { c.fillStyle = '#2f9e96'; c.fillRect(p[1], p[2], p[3], p[3]); c.fillStyle = INK; }
        else { c.lineWidth = 0.6; c.strokeRect(p[1] + 0.3, p[2] + 0.3, p[3] - 0.6, p[3] - 0.6); }
      } else if (p[0] === 'spiral') {
        c.beginPath();
        for (let k = 0; k <= 30; k++) { const a = k / 30 * 4.7, r = p[3] * (0.15 + 0.85 * k / 30); c.lineTo(p[1] + Math.cos(a) * r, p[2] + Math.sin(a) * r); }
        c.lineWidth = 1.4; c.stroke();
      }
    }
    c.restore();
  }

  function moodIcon(c, x, y, mood) {                               // 20 px: a bulb, a warning, a star, or a little face
    const r = 10;
    c.save(); c.lineWidth = 2; c.strokeStyle = INK; c.lineCap = 'round'; c.lineJoin = 'round';
    const face = (col) => { c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fillStyle = col; c.fill(); c.stroke(); };
    const eyes = () => { c.fillStyle = INK; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * 3.5, y - 2, 1.6, 0, 2 * Math.PI); c.fill(); } };
    const starP = (r1, r2) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r2 : r1; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); };
    if (mood === 'hint') {
      c.beginPath(); c.arc(x, y - 2, 7.5, 0, 2 * Math.PI); c.fillStyle = '#fff3a0'; c.fill(); c.stroke();
      c.fillStyle = '#a59fbd'; c.fillRect(x - 4, y + 5, 8, 5); c.strokeRect(x - 4, y + 5, 8, 5);
      c.beginPath(); c.moveTo(x - 2, y + 1); c.lineTo(x, y - 3); c.lineTo(x + 2, y + 1); c.stroke();
    } else if (mood === 'warn') {
      c.beginPath(); c.moveTo(x, y - 10); c.lineTo(x + 10, y + 8); c.lineTo(x - 10, y + 8); c.closePath(); c.fillStyle = '#ff5d5d'; c.fill(); c.stroke();
      c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y + 2); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y + 5, 1.3, 0, 2 * Math.PI); c.fill();
    } else if (mood === 'want') {
      starP(11, 5); c.fillStyle = '#ffd166'; c.fill(); c.stroke();
      c.fillStyle = INK; c.font = `700 11px ${FONT}`; c.textAlign = 'center'; c.fillText('!', x, y + 4);
    } else if (mood === 'lore') {
      starP(10, 4.5); c.fillStyle = '#c792ff'; c.fill(); c.stroke();
    } else {
      face({ chat: '#ffe066', joke: '#ff9ec7', gossip: '#c9b6ff', grumpy: '#ff9f6b', sad: '#9fd0ff', happy: '#8ff0b0' }[mood] || '#ffe066');
      c.fillStyle = INK;
      if (mood === 'joke') { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 3.5 - 2, y - 1); c.lineTo(x + s * 3.5, y - 4); c.lineTo(x + s * 3.5 + 2, y - 1); c.stroke(); }
        c.beginPath(); c.arc(x, y + 2, 4, 0, Math.PI); c.closePath(); c.fill(); }
      else if (mood === 'gossip') { c.beginPath(); c.arc(x - 3.5, y - 2, 1.6, 0, 2 * Math.PI); c.fill(); c.beginPath(); c.moveTo(x + 1.5, y - 2); c.lineTo(x + 5.5, y - 2); c.stroke();
        c.beginPath(); c.moveTo(x - 3, y + 4); c.quadraticCurveTo(x + 1, y + 6, x + 4, y + 3); c.stroke(); }
      else if (mood === 'grumpy') { eyes(); for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 6, y - 6); c.lineTo(x + s * 1.5, y - 4); c.stroke(); } c.beginPath(); c.moveTo(x - 3.5, y + 4.5); c.lineTo(x + 3.5, y + 4.5); c.stroke(); }
      else if (mood === 'sad') { eyes(); c.beginPath(); c.arc(x, y + 6, 3.5, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); c.fillStyle = '#3fa4ff'; c.beginPath(); c.arc(x + 6, y + 2, 2, 0, 2 * Math.PI); c.fill(); }
      else if (mood === 'happy') { eyes(); c.beginPath(); c.arc(x, y + 1, 5, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fillStyle = INK; c.fill(); }
      else { eyes(); c.beginPath(); c.arc(x, y + 1, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    }
    c.restore();
  }

  // a round race portrait (the sprite's head, cropped) for radio bubbles
  function portrait(c, b, x, y, r, t) {
    const R = RACES[b.race], look = b.npc ? b.npc.look : (DEF[b.id] && DEF[b.id].look) || {}, head = R.head, k = r / (head[2] * (b.race === 'crustling' ? (look.R || 0.8) / 0.8 : 1));
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fillStyle = '#2a2350'; c.fill(); c.clip();
    c.translate(x, y); c.scale(k, -k); c.translate(-head[0], -head[1] * (b.race === 'crustling' ? (look.R || 0.8) / 0.8 : 1));
    drawSprite(c, b.race, look, { t, talk: 1, mood: b.mood, look: [0.3, -0.1], L: [-0.55, 0.83], lw: 2 / k });
    c.restore();
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = 'rgba(124,245,214,0.8)'; c.lineWidth = 1.5;                       // radio waves
    for (const k2 of [1, 2]) { c.beginPath(); c.arc(x + r * 0.7, y - r * 0.7, 3 + k2 * 3.5 + (t * 6 % 3), -Math.PI / 2, 0); c.stroke(); }
  }


  // ======================================================================
  //  DRAW HOOKS
  // ======================================================================

  // sprites, in world space (y up), over mochi's props; only near the camera and zoomed in enough
  function drawWorld(g, kit) {
    const m = g.mod.npcs; if (!m) return;
    m.view = { rect: kit.viewRect(4), zoom: kit.cam.zoom };
    if (kit.cam.zoom < DRAW_ZOOM) return;
    const c = kit.ctx, px = kit.px(), view = kit.viewRect(4), A = astroOut(g) ? g.astro : null, crowd = kit.cam.zoom >= CROWD_ZOOM;
    for (const n of near(g)) {
      if (n.kind === 'keeper' || n.kind === 'visitor' || !n.body || (n.kind === 'extra' && !crowd)) continue;
      const h = n.h, cx = n.x + n.up[0] * h / 2, cy = n.y + n.up[1] * h / 2;
      if (cx + h < view[0] || cx - h > view[2] || cy + h < view[1] || cy - h > view[3]) continue;
      drawNpc(g, kit, c, n, px, A);
    }
  }

  function drawNpc(g, kit, c, n, px, A) {
    const s = upScale(n.h, px), tall = n.h * s / px, rot = Math.atan2(n.up[1], n.up[0]) - Math.PI / 2;
    if (tall < DOT_PX) { dot(c, n, s, px); return; }
    const cr = Math.cos(-rot), sr = Math.sin(-rot), toL = (x, y) => [x * cr - y * sr, x * sr + y * cr];
    const [hx, hy] = headOf(n), target = A || g.sh, [dx, dy] = toL(target.x - hx, target.y - hy), d = Math.hypot(dx, dy) || 1;
    if (d < 8) n.face = dx < 0 ? -1 : 1;
    const f = n.face || (hash32(n.id) % 2 ? 1 : -1);
    const [Lx, Ly] = toL(kit.LIGHT[0], kit.LIGHT[1]);
    if (tall < BMP_PX && !(n.talkUntil > g.real) && typeof document !== 'undefined') { blit(c, n, f, [Lx * f, Ly], s, tall, rot); return; }
    c.save(); c.translate(n.x, n.y); c.rotate(rot); c.scale(s * f, s);
    drawSprite(c, n.race, n.look, { t: g.real, talk: n.talkUntil > g.real ? 1 : 0, mood: talkMood(g, n), look: [dx / d * f, dy / d],
                                    L: [Lx * f, Ly], lw: 2.4 * px / s, helmet: RACES[n.race].breathes && !n.air });
    c.restore();
  }
  const talkMood = (g, n) => { const b = g.mod.npcs.bubbles.find((o) => o.npc === n); return b ? b.mood : 'chat'; };

  // ---------------- level of detail (systems M2): people are never giants, small ones are dots or cached bitmaps ----------------

  const upScale = (h, px, min = MIN_PX, max = UP_MAX) => Math.min(max, Math.max(1, min * px / h));   // sprite scale over life size
  function dot(c, n, s, px) {
    const h = n.h * s, r = Math.max(1.6 * px, h * 0.32);
    c.beginPath(); c.arc(n.x + n.up[0] * h * 0.45, n.y + n.up[1] * h * 0.45, r, 0, 2 * Math.PI);
    c.fillStyle = RACES[n.race].col; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2 * px; c.stroke();
  }
  //  a still pose, painted once per (npc, facing, size step, light octant, helmet) and stamped with one drawImage
  const BMP = new Map();
  function blit(c, n, f, L, s, tall, rot) {
    const step = Math.ceil(tall / 6) * 6, oct = Math.round(Math.atan2(L[1], L[0]) / (Math.PI / 4)), helmet = RACES[n.race].breathes && !n.air;
    const key = `${n.id}|${f}|${step}|${oct}|${helmet}`;
    let b = BMP.get(key);
    if (!b) {
      if (BMP.size > 600) BMP.clear();
      const k = step / n.h, cv = document.createElement('canvas'), w = Math.ceil(1.9 * step) + 4, h = Math.ceil(1.6 * step) + 4;
      cv.width = w; cv.height = h;
      const cc = cv.getContext('2d'), ox = w / 2, oy = h - Math.ceil(0.2 * step) - 2, a = oct * Math.PI / 4;
      cc.setTransform(k, 0, 0, -k, ox, oy);
      drawSprite(cc, n.race, n.look, { t: 1.3 + (hash32(n.id) % 97) / 10, look: [0.6, 0], L: [Math.cos(a), Math.sin(a)], lw: 2.2 / k, helmet });
      b = { cv, ox, oy, step }; BMP.set(key, b);
    }
    const m = s * n.h / b.step;                                    // world metres per bitmap pixel
    c.save(); c.translate(n.x, n.y); c.rotate(rot); c.scale(f * m, -m);
    c.drawImage(b.cv, -b.ox, -b.oy);
    c.restore();
  }

  // speech bubbles (screen px, crisp at any zoom), newest on top; older ones slide up out of the way
  function drawScreen(g, kit) {
    const m = g.mod.npcs; if (!m || g.ui) return;
    g0 = g;
    const me = meRect(g, kit), placed = [me], todo = [];               // bubbles keep off you (newplayer M9)
    let byMe = 0;
    for (let i = m.bubbles.length - 1; i >= 0; i--) {
      const b = m.bubbles[i], n = b.npc; if (!n) continue;
      where(g, n);
      if (!Number.isFinite(n.x)) continue;
      const sc = n.kind === 'keeper' ? 1 : n.kind === 'visitor' ? upScale(n.h, kit.px(), VISIT_PX, VISIT_UP) : upScale(n.h, kit.px()), top = n.h * sc + 0.25;
      const tip = [n.x + n.up[0] * top, n.y + n.up[1] * top], [tx, ty] = kit.toScreen(tip[0], tip[1]);
      const dc = Math.hypot(n.x - kit.cam.x, n.y - kit.cam.y), age = g.real - b.t0;
      const alpha = Math.min(1, (b.life + 0.4 - age) / 0.4, age * 6) * Math.max(0, Math.min(1, 1 - (dc - FADE_R) / 20));
      if (alpha <= 0.01 || !kit.onScreen(tx, ty, 60)) continue;
      if (g.mode === 'ship' && Math.hypot(tx - (me[0] + me[2]) / 2, ty - (me[1] + me[3]) / 2) < 240 && byMe++) continue;   // one at a time by your ship
      const L = layout(kit.ctx, b), bw = L.bw, bh = L.bh;
      const bx = Math.max(10, Math.min(kit.W - bw - 14, tx - 30));
      let want = 0;
      for (let k = 0; k < 6; k++) {
        const top = ty - 16 - bh - want, hit = placed.find((r) => bx < r[2] + 6 && bx + bw > r[0] - 6 && top < r[3] + 8 && top + bh > r[1] - 8);
        if (!hit) break;
        want = ty - 16 - bh - (hit[1] - bh - 14);
      }
      b.nudge = b.nudge == null ? want : b.nudge + (want - b.nudge) * 0.25;
      const by = Math.max(40, ty - 16 - bh - b.nudge);
      placed.push([bx, by, bx + bw, by + bh]);
      todo.push([b, tx, ty, alpha]);
    }
    for (let i = todo.length - 1; i >= 0; i--) drawBubble(g, kit, ...todo[i].slice(0, 4), false);   // oldest first: the newest sits on top
    const r = m.radio[0];
    if (r && r.t0 != null) drawBubble(g, kit, r, 0, 0, Math.min(1, (r.life + 0.4 - (g.real - r.t0)) / 0.4, (g.real - r.t0) * 5), true);
  }

  function meRect(g, kit) {                                        // you on screen, with a margin [px]
    const out = astroOut(g), [x, y] = kit.toScreen(out ? g.astro.x : g.sh.x, out ? g.astro.y : g.sh.y);
    const r = out ? 30 : Math.max((g.S.length || 9) * kit.cam.zoom, 34) / 2 + 10;
    return [x - r, y - r, x + r, y + r];
  }

  // the FAVOURS panel: only while one is active (max 3 rows), always in English
  function drawHUD(g, kit) {
    const m = g.mod.npcs; if (!m || g.ui) return;
    const act = activeFavours(g).slice(0, 3);
    if (!act.length) return;
    const c = kit.ctx, w = 236;
    let y = kit.stackRight(w, 26 + 20 * act.length, 'FAVOURS');
    const x = kit.W - w;
    for (const f of act) {
      const F = FAVOURS[f], d = DEF[F.giver], who = d.short || d.name, ok = ready(g, f);
      const tell = F.keeper ? F.tell : F.item ? 'hand it over' : `tell ${who}`;
      c.font = `500 13.5px ${kit.FONT}`; c.textAlign = 'left'; c.fillStyle = ok ? kit.COL.good : INK;
      c.fillText(kit.fit(ok ? `✓ ${who}: ${tell}` : `☆ ${who}: ${F.ask}`, w - 70), x, y);
      c.textAlign = 'right'; c.fillStyle = kit.COL.money; c.font = `600 14px ${kit.FONT}`; c.fillText(`$${F.reward}`, x + 212, y); c.textAlign = 'left';
      y += 20;
    }
  }


  // ======================================================================
  //  HINTS, KEYS, LIFECYCLE
  // ======================================================================

  function hint(g) {
    const m = g.mod.npcs; if (!m || g.ui || g.status === 'dead') return null;
    if (m.firstAt && !m.firstDone && g.mode === 'eva' && translator(g) < 2) {      // on foot only: never over flight coaching (newplayer M5)
      m.firstFrom = m.firstFrom || g.real;
      const R = RACES[m.firstRace];
      if (g.real - m.firstFrom < FIRST_HINT_T) return { pri: 26, text: `${m.firstWho} speaks ${R.lang}. A translator (Suit tab at Mochi Hub) turns the ${R.glyphs} into words.` };
      m.firstDone = true;
    }
    for (const f of activeFavours(g)) {
      const F = FAVOURS[f]; if (!ready(g, f)) continue;
      const d = DEF[F.giver], who = d.short || d.name;
      if (F.keeper) return { pri: 27, text: `Lettuce Pray is salvaged! Dock at Kiwi Outpost to tell ${who}.` };
      return { pri: 27, text: F.item ? `You have ${F.ask} for ${who}: go and find ${who}, then press F.` : `Done! Go and tell ${who} (press F next to them).` };
    }
    if (astroOut(g) && !Object.keys(m.met).length) {
      const n = near(g).find((o) => o.kind !== 'keeper' && distTo(g, o) < 8);
      if (n) return { pri: 26, text: `That's ${n.name}, ${RACES[n.race].name === 'Murk' ? 'a Murk' : `a${/^[AEIOU]/.test(RACES[n.race].name) ? 'n' : ''} ${RACES[n.race].name}`}. Walk up close and press F to say hi.` };
    }
    return null;
  }

  // dev: L cycles the translator 0 -> 1 -> 2 -> 3 -> 0
  function onKey(g, code) {
    const m = g.mod.npcs;
    if (code !== 'KeyL' || !g.dev || g.ui || !m) return false;
    m.xlate = (translator(g) + 1) % 4;
    Game.toast(g, `DEV TRANSLATOR: LEVEL ${m.xlate} (${LVL_NAME[m.xlate].toUpperCase()})`, '#7cf5d6', 'xlate');
    return true;
  }

  function frame(g) {
    const m = g.mod.npcs; if (!m) return;
    tickBubbles(g);
    keeperFavours(g);
    philCheck(g);
    if (g.real - m.snapT > 0.5) { m.snapT = g.real; for (const n of m.bubbles) if (n.npc && n.npc.body && n.npc.snapped) resnap(g, n.npc);
      if (astroOut(g)) for (const n of near(g)) if (n.body && distTo(g, n) < 20) resnap(g, n); }
    pokes(g);
    barks(g);
  }

  function init(g) {
    g.mod.npcs = { met: {}, line: {}, fav: {}, favData: {}, heard: [], metAlien: false, barkT: {}, bubbles: [], radio: [],
                   xlate: null, lvl: 0, placed: null, barkAll: -1e9, snapT: 0, dockedAt: null, dockT: 0, dockSaid: false, firstAt: 0, firstDone: false, ready: false,
                   rand: rng((g.seed || 7) * 7919 + 13), pokeT: {} };
  }
  function onReady(g) {
    const m = g.mod.npcs; if (!m) return;
    m.lvl = translator(g); m.ready = true;
    m.dockedAt = typeof Stations !== 'undefined' && Stations && on(g, 'stations') && Stations.dockedAt(g) ? Stations.dockedAt(g).id : null;
  }
  function save(g) {
    const m = g.mod.npcs; if (!m) return undefined;
    return { met: m.met, line: m.line, fav: m.fav, favData: m.favData, heard: m.heard.slice(-HEARD_MAX) };
  }
  function load(g, d) {
    const m = g.mod.npcs; if (!m || !d || typeof d !== 'object') return;
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k), num = (v) => (Number.isFinite(v) ? v : undefined);   // "constructor" is no NPC
    const ok = (id) => own(DEF, id) || NAMED_EXTRAS.some((x) => x.id === id) || /^x:[a-z-]+:\d+$/.test(id);
    if (d.met && typeof d.met === 'object') for (const id of Object.keys(d.met)) if (ok(id) && d.met[id]) m.met[id] = true;
    if (d.line && typeof d.line === 'object') for (const id of Object.keys(d.line)) if (ok(id) && Number.isFinite(d.line[id])) m.line[id] = Math.max(0, Math.floor(d.line[id]));
    if (d.fav && typeof d.fav === 'object') for (const f of Object.keys(d.fav)) if (own(FAVOURS, f) && ['offered', 'active', 'done'].includes(d.fav[f])) m.fav[f] = d.fav[f];
    if (d.favData && typeof d.favData === 'object') for (const f of Object.keys(d.favData)) {
      const x = d.favData[f]; if (!own(FAVOURS, f) || !x || typeof x !== 'object') continue;
      m.favData[f] = JSON.parse(JSON.stringify({ t: num(x.t) ?? 0, kills0: num(x.kills0), saidHi: x.saidHi === true || undefined }));
    }
    if (Array.isArray(d.heard)) m.heard = d.heard.filter(Number.isFinite).slice(-HEARD_MAX);
    m.metAlien = Object.keys(m.met).some((id) => DEF[id] && DEF[id].race !== 'pipkin');
    if (m.metAlien) m.firstDone = true;
  }


  // ======================================================================
  //  REGISTER
  // ======================================================================

  const mod = { id: 'npcs', init, load, save, ready: onReady, frame, interactions, hint, onKey, drawWorld, drawScreen, drawHUD };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;
  Game.addGoals([{ id: 'meet', order: 33, reward: 50, text: 'Say hi to Mumble by the pad (on foot, F)',
                   test: (g) => !!(g.mod.npcs && g.mod.npcs.met.mumble) }]);

  return { list, say, drawSprite, script, readable, translator, talking, keeperOf: (id) => KEEPER_OF[id] || null,
           RACES, DEFS, FAVOURS, NAMED_EXTRAS, CROWD, MOODS, PALS, decodeBot, sound, canRead, hash32, heightOf,
           visitScale: (h, px) => upScale(h, px, VISIT_PX, VISIT_UP) };
})();

if (typeof module !== 'undefined') module.exports = Npcs;
