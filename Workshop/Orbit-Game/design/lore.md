# Pocket Orbit v4: aliens, lore and NPCs

*Design doc for the **aliens** implementer (new `npcs.js`, `stations.js`). Also read by **econ** (translator items),
**eva** (your astronaut's look), **mochi** (where NPCs stand) and **look** (nothing required, a few nice-to-haves).*
*Every physical number here was computed, not guessed: the script and its output are in [Appendix A](#appendix-a-the-numbers).
The glyph scripts and the six race sprites were prototyped on a canvas and screenshotted before this was written:
reference code in [Appendix B](#appendix-b-reference-code-scripts-tested) and [Appendix C](#appendix-c-reference-code-sprites-and-bubble-prototype).*

> **Integrated by [V4-CONTRACT.md](V4-CONTRACT.md)** (binding for stage 2). Changed here: Mad Marge is MVP (she keeps mochi's Brine Pit shop; her `union` favour stays stretch), so **20 MVP NPCs**; `hiback` is stretch, so **5 MVP favours**; Annie and Marge stand at mochi spots `forge` / `brinepit` with their old angles as fallbacks; mochi's keepers and helpers (Tansy, Clunk, Parsnip, Sorrel, Bonk, Nozzle, Twist) are **named extras**, and those names left the random pools; the Noodle Hole's fries are mochi's counter, not the `noodles` favour; script order is `… combat, haul, mochi, npcs, render`; stations.js also gains the `haul` tab and a bigger dock zone for big frames.

---

## 0. TL;DR: what to build

- **Six races**, each with a toon sprite, an idle and a talk animation, a temperament, homes in the belt and a
  **procedural writing system** generated from the English line (same line, same glyphs, every time).
- **You are a Pipkin**: the little green prospector eva.js already draws. Pipkins speak *Belt Common*, which the
  game shows as plain English. Everyone else speaks their own tongue until you buy a **translator**.
- **Speech bubbles** in alien scripts that still read as fun before translation: a mood tint, a mood icon,
  the speaker's name and race, and a line of cosmetic "sound" syllables.
- **Universal Translator**, two tiers in the Suit tab: **Mk I Pocket Phrasebook** ($400, about half the words plus
  every number and name) and **Mk II Universal Translator** ($1,800, everything). Glyphs morph into letters.
- **28 named NPCs** (20 MVP) with 4-6 lines each, plus 7 named extras (mochi's keepers) and crowds of unnamed extras in Mochi's tunnels.
  Lines teach real mechanics (phasing, Hohmann, Oberth, Hill spheres, the ⊗ BRAKE marker), tell the history, and joke.
- **12 favours** (5 MVP): small requests ("bring Mumble 2 salt crystals") that pay 1.5-3x the market value.
- **Stations**: keepers talk in bubbles and get their races (Dot and Fern are Pipkins, Rust is a Murk), visitors hang
  around outside (an Orbiloon traffic controller at Mochi Hub, an Oggle bouncer at Rust's), and stretch: a new lighthouse, **The Lantern**.

---

## 1. The setting

### 1.1 Ember and the Crumb Belt

**Ember** is a small orange star at the centre of everything. It is also, honestly, far too light to be a star:
μ = 2.53e7 m³/s² means 3.8e17 kg, about **400 billion times** below the lightest real hydrogen-burning star.
It burns anyway. The Survey Bots log this fact every morning and then recalibrate. (A physicist owner gets an
in-world wink instead of a hand-wave: the system is a pocket universe where gravity is honest and sizes are toys.)

The **Crumb Belt** is one great ring of rubble round Ember, named by the Pipkins "because it looks like somebody
ate a planet over a plate". It runs in three **lanes** with **streams** of rubble swarms between them.

| place | what it is | lives there | numbers that NPCs quote |
|---|---|---|---|
| **Ember** | the star (root body, no landing) | nobody, sensibly | the **Sizzle**: inside 3.6 km (3 R) you die |
| **Inner lane**, a 24 km | Glimmer, Gumdrop, Macaron, Truffle | prospectors, hermits, pirates on Glimmer | 32.5 m/s, lap 77 min |
| **Mochi lane**, a 30 km | Mochi + moons; Pretzel, Waffle, Nugget, Crouton co-orbiting | almost everyone | 29.0 m/s, lap 108 min |
| **Outer lane**, a 36.5 km | Big Potato, Tater Tot, Pickle, Biscotti | pirates, Rust, Crustlings | 26.3 m/s, lap 145 min |
| **Inner streams**, 25-27.3 km | The Crumbs, The Sprinkles, Popcorn Drift, Croutonium Cloud | rocks | The Crumbs breathe once per 90 min |
| **Outer streams**, 32.7-34.3 km | The Gravel Gang, Jellybean Stream, Rubble Trouble | rocks | |
| **Mochi** (ex-Ceres) | the big one: R 300 m, g 2, Hill sphere 4.0 km | the Hub, the tunnels, the pad | escape 34.6 m/s from the ground, 8.6 m/s from the Hub |
| Dorito, Kiwi (+Seed) | Mochi's moons, inside its Hill sphere | Fern's greenhouse, bugs, Queso | Dorito laps Mochi every 5 min 23 s |

Swarm names are the world implementer's (config.js); if they change, update the four lines that mention them.

**Why "Mochi"?** Round, pinkish-white (config colour `#e9cfe0`), looks squishy. It is not squishy. Pilot Gus
can confirm, or rather his crater can.

### 1.2 A short history (five eras, told by whoever was there)

1. **The Loaf that never rose.** The *Crustlings* (living rocks) say the belt was once a whole world, "the Loaf",
   that went stale and crumbled. The Survey says the belt never made a planet at all: too little mass. Both camps
   are polite about it. Crustlings are as old as the crumbs and have been napping on them ever since.
2. **The Murk dig in.** The *Murk*, hooded tunnel folk with big glowing eyes, hate the Glare (Ember) and love the
   dark inside Mochi. They dug the first tunnels. They read with their fingers, so their script is raised dots,
   and they consider ink on paper a kind of shouting. (That is why Rust gives **no receipts**.)
3. **The Survey.** The *Orbiloons* (hovering jelly-bells who think in orbits) founded the **Ember Survey Agency**,
   ESA ("no relation"), and built the *Survey Bots* to do the walking. The Survey mapped the belt, found ice on
   Mochi, and launched cheap probes run by interns: **ESA Intern Project #4** (eleven glorious minutes) and the
   lander **Little Phil** (bounced twice, napped in the shade of Seed, woke once to say hi).
4. **The Big Hop.** The *Pipkins* arrived on colony haulers from a soggy green world called **Puddle**, following
   the Survey's ice reports. They built **Mochi Hub** ("fuel, fixes and fries"), the launch pad and the kiosk;
   Granny Fern and Basil planted the belt's first lettuce at Kiwi Outpost.
5. **The Opal Rush.** Void opals turned up on Glimmer and everyone came: every race, every rust-bucket. Most of the
   wrecks are from the Rush. The Hub hired *Oggle* crews as belt patrol, then cut the patrol's pay to buy a
   bigger fryer. Half the patrol quit and went freelance as **the Free Company of the Crumb** (the pirate union,
   founded by Mad Marge). The other half stayed as **Hub Patrol** and keep a 700 m bubble round Mochi.
   **Rust** (a Murk) brokered the one truce that holds: Rust's is neutral, because Rust holds the union's
   pension fund ("Pirates owe me money").

**Now:** the Rush has cooled. The belt is full of half-salvaged dreams, and you have just arrived.

### 1.3 The wrecks, retold (wrecks.js is unchanged; this is who they were)

| wreck | crew log by | race | where the story goes |
|---|---|---|---|
| ESA Intern Project #4 | Intern (unpaid) | Pipkin | UNIT-7 archives it; INTERN-5 on Macaron is its successor |
| The Plucky Tuesday | Capt. Mira Osei | Pipkin | Grubb's "Tuesday is truce day" is a nod to "somebody always comes by on a Tuesday" |
| Definitely Not Pirates | "not a pirate" | Oggle | Marge sniffs at them: "amateurs, flew backwards" (stretch line) |
| Lettuce Pray | Basil, gardener | Pipkin | Fern's favour **The Blue Drawer** |
| Long Exposure | Dr. Ada Voss | Orbiloon | Sizzy (her student) asks for it: favour **Long Exposure** |
| The Lithobraker | Pilot Gus | Oggle | "Mochi has no air", now with the rename |
| Cool Ranch Express | Courier Tamsin | Pipkin | Queso's favour **Dorito Day** |
| Lunchbox | Mechanic Bo | Murk | (soft-hearted, "good for them") |
| Couch Potato | Capt. Lou | **Crustling** | Lou is *fine*: he is the rock next to the pod, still napping. Aunt Shale begs you not to laser him |
| Finders Keepers | R. (Radish), prospector | Pipkin | same make as your ship; Pip's favour **One More Scoop**; Radish is alive (stretch) |
| Little Phil | lander | Survey Bot | UNIT-7's little brother: favour **Say Hi Back** |

The world implementer renames "Ceres" in the logs and facts; nothing else in wrecks.js needs to change.

### 1.4 Who you are

**A Pipkin sprout.** Pipkins *ripen*: they are born green, turn lime, then yellow, then peach and pink, and the
very old go plum-purple. You are as green as they come, which is why everyone calls you **rookie**
("You're green, rookie. Literally." says Dot). You have a second-hand Prospector (the same make old Radish flew),
$300, and a licence with ROOKIE stamped on it. Your antenna's bobble (the *pip*) shows your mood.

### 1.5 What everyone calls things (cheap flavour for lines and the map)

| | Ember | Mochi | the belt | you |
|---|---|---|---|---|
| Pipkin | Ember | Mochi | the Crumb Belt | rookie |
| Murk | the Glare | Home-Under | the Dark Between | little lamp |
| Oggle | BIG HOT | THE BIG ONE | THE PATCH | SQUISHY |
| Crustling | the Oven | the Elder Crumb | the Loaf | young pebble |
| Orbiloon | the Centre | the Dancer | the Ring | falling friend |
| Survey Bot | PRIMARY | BODY 1 | SURVEY AREA | UNIT PIPKIN |

---

## 2. The races

All sprites follow the house toon recipe (eva.js `toon()`): shade fill, base fill shifted toward `kit.LIGHT`,
a small highlight ellipse, thick `INK #1b1433` outline at `lw = 2.4 * px / s`. **Sprite frame:** metres, **y up**,
origin at the feet (the hover anchor for Orbiloons), drawn at true size with a minimum on-screen height of
22 px (`s = Math.max(1, 22 * px / height)`), exactly as eva.js does for the player. Eyes look at the astronaut
(`look` = unit vector toward it in the sprite frame); the sprite flips horizontally to face the astronaut within 8 m.
Read `kit.LIGHT` every frame (never cache it): if the look implementer makes Ember the light source, NPC shading follows for free.

| race id | name (plural) | height | silhouette | script | sound line | type speed |
|---|---|---|---|---|---|---|
| `pipkin` | Pipkin (Pipkins) | 1.25 m (1.6 in a suit) | round head, one antenna, little body | Belt Common = English | none | 30 cps |
| `murk` | Murk (Murk) | 2.0 m | tall teardrop hood, two glowing eyes | raised dot cells | `~ whispers ~` | 24 cps |
| `oggle` | Oggle (Oggles) | 1.6 m | wide egg, ONE huge eye, spiky crest, fangs | notches on a stem line | `GRAK-OI BLAT` | 36 cps |
| `crustling` | Crustling (Crustlings) | 1.2-2.4 m | a boulder with sleepy eyes and pebble feet | rock strata (+ fossils) | `hrm... grn...` | 10 cps |
| `orbiloon` | Orbiloon (Orbiloons) | 2.0 m incl. tentacles | jelly bell, 5 tentacles, a ring with a little planet | little orbits | `loo ~ wee ~` | 22 cps |
| `bot` | Survey Bot (Bots) | 1.25 m incl. antenna | boxy body on one wheel, CRT face | LED bits (real ASCII!) | `beep-boop` | 40 cps |

### 2.1 Pipkins (you, Dot, Fern, Pip...)

- **Temperament:** cheerful, nosy, practical, chronically unable to say no to "one more scoop".
- **In the belt:** prospectors, shopkeepers, dockmasters, farmers. Most of the Hub. Every surface outpost.
- **Look:** a simplified copy of eva.js `drawAstro` so NPCs and the player read as the same species.
  Legs: strokes (±0.08, 0.42)→(±0.10, 0.12), width 0.15, ink-outlined; feet ellipses 0.12×0.07 at y 0.07 (`#6e6896`).
  Body: ellipse (0, 0.60) r 0.25×0.30 in the clothes palette. Arms: strokes from (±0.20, 0.74) to (±0.36, 0.52),
  width 0.11, hands r 0.065 in skin colour. Head: ellipse (0, 1.05) r 0.33×0.28 in skin colour.
  Eyes: white ellipses r 0.08 at (±0.12, 1.08), pupils r 0.048, sparkle r 0.016. Blush 0.045×0.025 at (±0.22, 0.98),
  `rgba(255,120,160,0.55)`. Mouth: arc r 0.05 at (0, 0.99). Antenna: quadratic from (0, 1.30) to a bobble r 0.055
  swinging `±0.17 · sin(0.12 sin 3.1t)`. Helmet (outdoors or on any airless spot): glass circle r 0.44 at (0, 1.09),
  `rgba(205,242,255,0.28)`, ink rim, white highlight arc toward the light.
- **Ripeness palettes** (skin `[base, shade, hi]`): sprout `#8fe07a #4f9e45 #d8ffbf` (you) · lime `#c8e66a #86a33a #f1ffc0` ·
  yellow `#f2e06b #b8a23a #fff8c8` · peach `#ffd8b8 #d49a78 #fff1e4` (Fern) · pink `#ffb3c7 #c96f8b #ffe3ea` (Dot) ·
  plum `#c9a0e8 #8a5fb0 #efe0ff` (Radish).
- **Clothes palettes:** blue `#7fb8ff #4a74b8 #d6e8ff` · orange `#ff9f43 #c25f1c #ffd8a6` · teal `#6fd6c8 #3a8f86 #d4fff6` ·
  red `#ff6b6b #b83a3a #ffd0d0` · lavender `#b9a6f2 #7262b0 #e8e0ff`.
- **Accessories:** `headset` (Dot: arc over the head + orange mic ball, as in stations.js), `bun` (Fern: silver bun +
  round glasses), `hardhat` (Okra: yellow dome, orange brim, lamp), `apron` (Pip: cream apron), `cap` (Chive:
  backwards green cap), `goggles` (Radish: brass goggles on the forehead `#e3b04b`), `sash` (Queso: orange festival sash).
- **Idle:** body bob 0.01 m at 2.2 rad/s, antenna wobble, blink every 3.4 s for 0.12 s.
- **Talk:** mouth alternates open ellipse / smile at 8 Hz, the right hand rises to (0.38, 0.88) and waves,
  the pip turns gold `#ffd166` while talking.

### 2.2 Murk (Rust, Mumble, Velvet, Glint)

- **Temperament:** discreet, dry, kind underneath. Hate glare, love gossip. Never write anything down.
- **In the belt:** Mochi's deep tunnels (the Cellar), fences, info brokers, the black market. A few opal hunters.
- **Look:** one teardrop **cloak**: from (−0.55, 0.06) quadratic via (−0.62, 1.25) to the hood tip (sway, 2.0), down
  via (0.62, 1.25) to (0.55, 0.06); the bottom edge is five fur scallops (quadratics dipping to y −0.08).
  Palettes: dusk `#3a2d5c #231a3a #6a5a96` · soot `#2e2a38 #17141f #5a5470` · plum `#4a2848 #2a1328 #7a4f78`; toon offset 0.12.
  **Face opening:** ellipse (sway·0.3, 1.38) r 0.30×0.22 filled `#120d1e` (a void). **Eyes:** two almonds at x ±0.12
  inside the opening, half-width 0.10, half-height 0.07, filled with the eye colour (`#ffe066` gold default,
  `#7cf5d6` teal, `#ff9ec7` pink) with `shadowBlur 8` in the same colour. **No mouth, ever.**
- **Accessories:** `scarf` (Mumble: orange band at y 1.0-1.12 with cream stripes, clipped to the cloak),
  `monocle` (Velvet: gold ring round one eye), `lantern` (Glint: a little lantern on a paw, violet glow `#8f6bff`).
- **Idle:** hood tip sways `±0.08 · sin 0.9t`; blink every 3.7 s (matches Rust's doorway).
- **Talk:** eyes squint in rhythm (height × 0.5-1 at 8 rad/s), two three-fingered paws (r 0.075, shade colour)
  appear at (±0.36, 0.85), and three **whisper motes** (lavender dots, r ≤ 0.05) drift up from the opening.

### 2.3 Oggles (pirates, mostly; also cooks, smiths, bouncers, Hub Patrol)

- **Temperament:** loud, loyal, allergic to subtlety. Paint their ships to look like themselves (that is why pirate
  ships have one angry eye and fangs: combat.js already draws Oggle ships).
- **In the belt:** the outer lane, Pickle (Marge's hideout), Waffle's forge, Rust's door, the Noodle Hole, Hub Patrol.
- **Look:** body ellipse (0, 0.70) r 0.62×0.58. Palettes: grape `#7448c2 #4b2a86 #c3a6ff` (the pirate purple) ·
  moss `#6cc26a #3d7c3b #c6f5b8` · tangerine `#ff9a4d #b85a1e #ffd4a8` · teal `#4fb3a6 #2b6f67 #b6f0e6`.
  **Crest:** three triangles on top, tips at (−0.22, 1.47), (0, 1.60), (0.22, 1.47), half-base 0.12, colour `#ff5d8f`,
  tips wiggle ±0.03. **The eye:** sclera ellipse (0, 0.84) r 0.30×0.26 in `BONE #f6ecd6`; iris r 0.14 (`#ff3b5c` red for
  pirates, `#ffd166` gold for honest Oggles), pupil r 0.07, sparkle r 0.03; an **eyelid** in the shade colour, flat
  when calm, slanted when grumpy (exactly combat.js `drawEye`'s trick). **Mouth:** underbite crescent from (−0.2, 0.42)
  to (0.2, 0.42), dark `#2a1a4a`, two bone fangs pointing up. Stubby arms (width 0.15) with fists r 0.1, stubby legs, flat feet.
- **Accessories:** `bandana` (pink band across the crest base), `tricorn` (Marge: black `#231a30` hat with a tiny skull),
  `apron` (Grubb: white with a fry stain), `cap` (Hub Patrol: navy `#3a5cc4` cap with a gold star), `goggles` (Annie:
  welding goggles pushed up on the crest), `vest` (Blat: black vest, "STAFF" in tiny letters when zoomed).
- **Idle:** squash-and-stretch bounce (scaleY 1 + 0.04 sin 3t, scaleX 1 − 0.02 sin 3t); crest wiggles; blink every 4.1 s.
- **Talk:** the mouth opens (crescent depth 0.06-0.14 at 6 rad/s), the right fist swings, and on `grumpy`/`warn`
  lines the lid slants and two little "!" marks pop above the crest.

### 2.4 Crustlings (Gneiss, Halite, Shale, Lou, Basalt)

- **Temperament:** ancient, slow, patient, gently smug. Speak... with... pauses. Nap for centuries.
- **In the belt:** everywhere and nowhere: the Echo Gallery wall inside Mochi, hermits on small rocks
  (Pretzel, Biscotti), next to crashed pods. Some rubble rocks might be sleeping Crustlings (stretch easter egg).
- **Look:** a lumpy boulder: a 28-point outline with radius factors `1 + 0.12 · Σ harmonics(2, 3, 5)` (seeded per NPC),
  centre (0, 0.92 R), squashed 0.9 vertically. R = 0.8 m typical, 1.3 Lou, 1.0 Basalt, 1.4 Gneiss (he is mostly wall).
  Palettes match the rubble so they *blend in*: granite `#b8a99a #76665f #e2d6c8` (= render.js ROCK_COLS[0]) ·
  slate `#a69bb8 #675c7c #d6cde6` · sandstone `#c4a37f #7e6248 #ecd2b0` · basalt `#6e6a7a #3f3b4a #a8a3b8`.
  Two pebble feet (r 0.17 R) at (±0.45 R, 0.12 R). **Face** at y 0.92 R + 0.18 R: two sleepy eyes (half-closed lids:
  a lid line over a half-disc pupil, r 0.14 R, spaced ±0.27 R), faint dust-pink blush, a zigzag mouth (4 points).
- **Accessories:** `salt` (Halite: three white crystal prisms `#f4f0ff` on top), `amethyst` (Gneiss: purple prisms `#c792ff`),
  `moss` (a green cap of moss `#7fd35a`), `hood` (Basalt the monk: brown cloth `#8a5a3a` draped over the top).
- **Idle:** breathing scale `1 + 0.015 sin(2πt/6)`; every ~9 s the eyes open fully for 1 s (a "glance", with sparkles);
  a dust mote now and then.
- **Talk:** the zigzag mouth grinds between two shapes at 4 Hz, the body tilts ±0.04 rad slowly, a pebble hops off the top.
  Typewriter at 10 chars/s: their bubbles fill slowly, which is the joke.

### 2.5 Orbiloons (Peri, Sizzy, Nodey, Lulu)

- **Temperament:** serene, mathematical, a bit dreamy. Wear a little orbit as jewellery. Love Kepler.
- **In the belt:** traffic control at the Hub, the Skylight (astronomy), cartography on Crouton, the lighthouse.
- **Look:** a jelly **bell** of radius R 0.62 centred at y_c = 1.45 + 0.08 sin(πt) (hover bob): top half-ellipse
  R × 0.92R, bottom edge four scallops. 95 % opaque. Palettes: sky `#a8e6ff #5aa8d8 #ffffff` · lilac `#d6b8ff #9a7ad0 #ffffff` ·
  mint `#a8f5d0 #5fbf95 #ffffff` · peach `#ffc8a8 #d08a68 #ffffff`. A glowing **core**: radial gradient r 0.3 at (0, y_c + 0.22),
  `#fff6a8`, brighter while talking. **Five tentacles** hanging from y_c − 0.2, lengths 0.95/1.2 alternating, quadratic
  curves swaying `0.15 sin(1.6t + 1.3i)`, drawn as ink-outlined strokes 0.07 wide. **Big round eyes** r 0.1 at (±0.2, y_c + 0.02).
  **The ring:** an ellipse 1.5R × 0.34R tilted 0.25 ± 0.08 rad, centred at y_c − 0.16, gold `#ffd166` with an ink outline;
  draw its back half before the bell and its front half after; a pink planet dot (r 0.06) travels round it at 0.5 rev/s.
- **Honest hovering:** Orbiloons do not float (nothing floats in vacuum); near the ground they hover on tiny cold-gas
  puffs: every 1.2 s a white puff ring grows and fades under the bell. In orbit they just fall, politely. Lines say so.
- **Accessories:** `specs` (Sizzy: round glasses), `wand` (Peri: a traffic wand with a teal glowing tip, held in a tentacle),
  `lamp` (Lulu: core glows gold `#ffe066`, brighter), `scroll` (Nodey: a map scroll in a tentacle).
- **Talk:** the bell pulses (scale 1 + 0.05 |sin 10t|), the core brightens, the mouth becomes a little "o".

### 2.6 Survey Bots (UNIT-7, BEEPER, INTERN-5)

- **Temperament:** literal, earnest, unpaid. Speak in CAPITALS. Proud of Little Phil.
- **In the belt:** the Survey archive inside Mochi, relays on small rocks, the iron rig, Macaron.
- **Look:** one wheel r 0.18 at (0, 0.18) (`#3b3448`, hubcap `#a59fbd`). Body rounded rect x −0.4..0.4, y 0.3..0.95,
  corner 0.12, palette survey `#e8e4f7 #a9a2cc #ffffff` with an **Agency orange stripe** `#ff9f43` at y 0.40-0.47.
  **CRT face** rounded rect x −0.28..0.28, y 0.53..0.87, `#16283a`, two teal `#7cf5d6` square eyes 0.07.
  Antenna from (0.25, 0.95) to (0.32, 1.2) with a light r 0.045 blinking red `#ff5d5d` at 1 Hz. A side arm (width 0.08)
  with a two-finger clamp that holds a prop: UNIT-7 a clipboard, BEEPER a dish, INTERN-5 a **spoon**.
- **Idle:** rocks ±0.03 rad on its wheel; the eye squares vanish for 0.1 s every 3 s; antenna blinks.
- **Talk:** eyes become `^ ^` carets and a five-bar voice waveform plays under them (the same look as the
  crew-log CRT portrait in wrecks.js, so Bots and crew logs feel related); antenna light stays on.

---

## 3. Speech bubbles

**Where:** drawn in `drawScreen` (screen px, so text stays crisp at any zoom), anchored to the speaker's head
(converted with `kit.toScreen`), tail pointing at it. Bubbles fade out beyond 60 m from the camera centre.
At most 3 world bubbles on screen; newer ones push older ones out. Overlapping bubbles slide up (same easing trick as
render.js `drawPopups`). When the speaker is off-screen, or is a keeper or visitor whose station is drawn without detail
(stations.js `P.detail` false: under 45 px on screen), the line becomes a **radio bubble**: same bubble, docked top-centre under the warp label, with a 24 px round race
portrait (the sprite's head, cropped) on its left. One radio bubble at a time, queued.

**Shape** (prototype screenshot looked right, see Appendix C):
- Rounded rect, radius 12 px, 3 px INK outline, 4 px INK drop shadow (like `comicPanel`), tail 14 px wide.
- Fill = **mood tint** (table below). A 5 px **race stripe** on the inner left edge in the race colour:
  Pipkin `#8fe07a`, Murk `#8a78c4`, Oggle `#ff5d8f`, Crustling `#b8a99a`, Orbiloon `#7fd8ff`, Bot `#ff9f43`.
- **Name tab** above the top-left corner, INK pill with `PAPER2` text: `MUMBLE · MURK`.
- **Mood icon** (20 px) overlapping the top-right corner.
- Body: `600 14px Fredoka`, max text width 236 px, line height 20 px, wrapped on the **English** words.
  Glyph words occupy exactly the width of their English word (see 4.1), so the bubble never changes size when it is
  translated. Dialogue lines are ≤ 90 chars, so ≤ 3 lines.
- **Sound line** (only while any word is untranslated): `italic 500 11px`, `#6d5f8a`, under the text, trimmed with "…" to fit.
- **Typewriter:** words appear at the race's chars-per-second; a glyph word appears when its last letter is "typed".
- **Life:** typing time + 2.5 s + 0.03 s per char, then fade 0.4 s. `Game.log` gets the English line immediately.

**Moods** (every line carries one; before the translator, this is how you read the room):

| mood | tint | icon (20 px) | used for |
|---|---|---|---|
| `chat` | `#fff4dc` | yellow face, smile | small talk |
| `hint` | `#d4fff4` | light bulb | a real mechanics tip (makes you *want* the translator) |
| `joke` | `#ffe3ef` | pink face, ^ ^ eyes, open grin | jokes |
| `gossip` | `#ece2ff` | lavender face, wink, smirk | rumours, secrets |
| `lore` | `#f3e6c8` | purple star | history |
| `warn` | `#ffd6d6` | red triangle with "!" | danger |
| `grumpy` | `#ffe0cc` | orange face, angry brows, flat mouth | complaints |
| `sad` | `#dcecff` | blue face, frown, tear | sad bits |
| `want` | `#fff0b8` | gold star with "!" | a favour offer or reminder |
| `happy` | `#dff7d4` | mint face, big smile | thanks, favour done |

**Race-shaped outlines (stretch):** Oggle = zigzag shout edge, Murk = dashed whisper outline, Crustling = lumpy edge,
Orbiloon = cloud of arcs, Bot = square corners with a terminal header bar. MVP draws them all as the rounded rect.

---

## 4. Alien scripts

### 4.1 Shared machinery (deterministic, pure, testable in Node)

- Tokenise the English line on spaces. Split each token into **core** + **trailing punctuation** (`.,!?:;…"`).
  Punctuation is universal (all races use "!", space is exciting) and is drawn as itself after the glyph block.
- Each core word gets a **slot**: x position and width from `ctx.measureText` in the bubble font, wrapped as English.
- `script(race, word, w, h)` returns an array of **primitives** in the slot's box (px, y down, baseline at y = h,
  h = 13 px glyph height): `['dot', x, y, r]`, `['ring', x, y, r]`, `['line', x0, y0, x1, y1, width]`,
  `['ell', x, y, rx, ry, rot]`, `['sq', x, y, side, on]`, `['spiral', x, y, r]`. A tiny drawer renders them in INK.
  Keeping generation separate from drawing is what makes it testable without a canvas.
- **Seed:** `rng(hash32(race + ':' + key(word)))` where `hash32` is FNV-1a, `rng` is World.rng (mulberry32) and
  `key` lower-cases and strips punctuation. Consequences, all intended:
  the same line always shows the same glyphs; **the same word looks the same in every line** (it feels like a real
  language, and sharp-eyed players learn words: "that loop-squiggle means *ice*"); the translator reveals exactly the
  English line that generated the glyphs.

### 4.2 The five scripts (full code in Appendix B; all screenshot-checked at 13 px)

| race | name of script | how it looks | rule |
|---|---|---|---|
| Murk | **Touch-dots** | Braille-like 2×3 cells of raised dots, some faint rings | cells = round(w / 0.62h); each cell a random 6-bit pattern (never empty), dot r 0.14h; empty spots get a ring r 0.08h 30 % of the time. "We read with our fingers." |
| Oggle | **Carvings** | a stem line with groups of notches, like ogham (Oggle ≈ ogham) | stem at mid-height, an arrowhead tick at the start of every word; groups = round(w / 0.5h), each 1-3 notches: above, below, through, or slanted; stroke ≥ 1.3 px |
| Crustling | **Strata** | three layers of rock bars of varying thickness; sometimes a fossil spiral | rows at 0.18/0.50/0.82 h, bars 0.35-1.45 h long with 0.16 h gaps, thickness jittered; 22 % of words carry an ammonite spiral (r 0.32 h) |
| Orbiloon | **Orbits** | a chain of little tilted ellipses, each with its planet | per 0.8 h of width: ellipse rx ≤ 0.46 h, ry 0.35-0.9 rx, tilt ±0.65 rad, a planet dot r 0.11 h at a random phase; 40 % get a central star dot, 20 % a second inner orbit |
| Bot | **Bits** (no randomness) | 2×4 LED cells, teal when on | per letter: [even parity, b6..b0 of 7-bit ASCII]; LED side = min(cw/2.7, h/4.3). **It is literally decodable.** The test decodes it back; the nerd easter egg is that a patient player needs no translator for Bots |

Pipkins have no glyph script: Belt Common is shown as English.

**Sounds** (cosmetic syllables under the glyphs, picked per word by its own hash, 1-3 syllables by length):
Oggle `GRAK OI BLAT ZOG HUP KRANK YARG BONK URK DAK` joined `-`; Crustling `hrm grn mmm rrk hmm grr unh` separated by `... `;
Orbiloon `loo wee oo hoo lu wi ooo ee` separated by ` ~ `; Bot `beep boop bip bzzt dee doo` joined `-`; Murk: just `~ whispers ~`.

---

## 5. The Universal Translator

**Lore:** built by the Survey: Orbiloon brains, Bot patience. Mk I is a brass phrasebook clip; Mk II is a gold ring
that orbits your antenna's pip and listens.

**Catalog entries (econ owns final prices; keep Mk I under the first engine upgrade so it is an early fun buy):**

```js
{ id: 'xlate', tab: 'suit', name: 'Translator', stock: 'No translator', tiers: [
  { id: 'xlate1', name: 'Pocket Phrasebook', price: 400, set: { translator: 1 },
    desc: 'Clips to your helmet. Gets about half the words, every number and every name.' },
  { id: 'xlate2', name: 'Universal Translator', price: 1800, set: { translator: 2 },
    desc: 'Every word, every race. Orbiloon-built, Bot-tested. Rust says it fell off a freighter.' } ] },
// stretch, Rust's only if econ supports per-station stock:
//   { id: 'xlate3', name: 'Bug Whisperer', price: 3000, set: { translator: 3 }, desc: 'Also subtitles bugs. You may not want to know.' }
```

Sold in the **Suit** tab: Mochi Hub, Kiwi Outpost and mochi's Dig Hall (all three have a suit tab). Suit items are massless, as now.
npcs.js reads `g.S.translator || 0` (no config change needed).

**Who can you read?**

| level | Pipkin | others |
|---|---|---|
| 0 (none) | everything | nothing: glyphs, mood tint, mood icon, sound line |
| 1 Phrasebook | everything | every word containing a digit, every **name** (body, station, NPC, race and swarm names, plus a glossary: `ember mochi hub brake oberth hohmann kepler lagrange hill rookie`) and the ~55 % of words with `hash32('mk1:' + key) % 100 < 55`. The same word is always known or always unknown, so lines come out like a fill-in-the-blanks puzzle. |
| 2 Universal | everything | everything |
| 3 Bug Whisperer (stretch) | everything | everything, plus mobs.js bugs get tiny bubbles: `NOM.` `MINE.` `SHINY?` `TASTY HULL.` `HELLO?` |

**Reveal animation** (the moment the money was for):
- A bubble that contains readable alien words starts in glyphs. After 0.25 s, word *i* morphs at
  `t_i = 0.25 + 0.06 i` over 0.3 s: for u < 0.5 the glyph block squashes vertically to a line (scaleY 1 − 2u);
  for u ≥ 0.5 the English word grows back (scaleY 2u − 1), showing **scrambled letters** (random a-z seeded by the
  word, same length) until u = 0.75, then the real word; a white sparkle dot (r 10 → 2 px) fades at the word centre.
  Whole bubble ≤ 1.2 s. Prototype frames looked right (Appendix C).
- Each line hash is remembered in `g.mod.npcs.heard` (cap 400); a line you have already seen revealed shows English
  at once (or a 0.3 s quick morph). Buying the translator re-reveals every bubble on screen.
- On purchase: toast `TRANSLATOR ONLINE: 6 LANGUAGES` (Mk II) or `PHRASEBOOK CLIPPED ON: HALF THE WORDS, ALL THE NUMBERS` (Mk I).

**Never lock gameplay behind it.** Hints, jobs, the shop, prices and warnings stay English. The shop speaks
"the one universal language: money". NPC lines are flavour and *bonus* tips; favour offers always show the item and
reward in the FAVOURS panel and the accept prompt, in English, even before translation.

**First contact hint** (pri 26, once): after your first untranslated bubble:
`Mumble speaks Murk. A translator (Suit tab at Mochi Hub) turns the dots into words.`

**Dev:** `?xlate=0|1|2|3` sets the level for the session; dev mode **L** cycles it (claim L in SPEC's key table;
if another module takes it, keep only the URL param). Econ's dev "shop anywhere" covers buying.

---

## 6. The cast: 28 named NPCs

**Placement kinds** (`at`): `{ station: id, x, y }` station frame (+y away from the host); `{ spot: roleId, k }` a Mochi spot
from mochi.js, k-th standing place, with a surface fallback; `{ body: id, th }` on a body's surface at polar angle th
(bodies never rotate), feet at `World.surfaceR(b, th)`. Anything whose body or wreck is missing is skipped silently
(`?mods=` and the world implementer's tuning must not crash us).

| id | name | race | where | MVP | favour |
|---|---|---|---|---|---|
| `dot` | Dockmaster Dot | pipkin (pink) | Mochi Hub porthole (keeper) | MVP | |
| `peri` | Peri | orbiloon | floats by Mochi Hub's truss | MVP | |
| `thud` | Sergeant Thud | oggle (Hub Patrol) | Mochi Hub, end of the truss | MVP | |
| `pip` | Pip | pipkin (yellow) | Mochi pad, by the kiosk | MVP | `scoop` (stretch) |
| `mumble` | Mumble | murk | Mochi pad, in the fuel tank's shade | MVP | `salt` |
| `okra` | Foreman Okra | pipkin | surface ice outpost | MVP | `rig` (stretch) |
| `grubb` | Cookie Grubb | oggle | tunnels: the Noodle Hole | MVP | `noodles` |
| `gneiss` | Grandpa Gneiss | crustling | tunnels: the Echo Gallery wall | MVP | |
| `velvet` | Velvet | murk | tunnels: the Cellar | MVP | `fire` (stretch) |
| `unit7` | UNIT-7 | bot | tunnels: the Quiet Nook (Survey archive) | MVP | `hiback` |
| `sizzy` | Sizzy | orbiloon | tunnels: the Skylight | MVP | `exposure` (stretch) |
| `chive` | Chive | pipkin (sprout kid) | tunnels: the Pantry market | MVP | `shiny` |
| `fern` | Granny Fern | pipkin (peach) | Kiwi Outpost porthole (keeper) | MVP | `drawer` |
| `halite` | Old Halite | crustling | Pretzel | MVP | |
| `annie` | Anvil Annie | oggle (retired pirate) | Waffle, at her forge (mochi spot `forge`) | MVP | `forge` |
| `rust` | Rust | murk | Rust's doorway (keeper) | MVP | |
| `blat` | Bouncer Blat | oggle | Rust's, standing on the neon sign by the tyre | MVP | |
| `shale` | Aunt Shale | crustling | Big Potato, by Couch Potato | MVP | |
| `lou` | Captain Lou | crustling | Big Potato, *the rock next to the pod* | MVP | |
| `queso` | Queso | pipkin | Dorito, far side from the Cool Ranch crash | stretch | `dorito` |
| `beeper` | BEEPER | bot | Nugget, relay dish | stretch | |
| `nodey` | Nodey | orbiloon | Crouton | stretch | |
| `marge` | Mad Marge | oggle (pirate queen) | Pickle: The Brine Pit (mochi spot `brinepit`) | **MVP** (contract) | `union` (stretch) |
| `basalt` | Brother Basalt | crustling (monk) | Biscotti | stretch | |
| `lulu` | Lulu | orbiloon | The Lantern (stretch station) | stretch | |
| `glint` | Glint | murk | Glimmer, near Finders Keepers | stretch | |
| `intern5` | INTERN-5 | bot | Macaron | stretch | |
| `radish` | Radish | pipkin (plum) | Truffle, appears after `scoop` is done | stretch | |

Positions below are starting guesses: **eyeball each in a screenshot** and nudge (keep surface NPCs ≥ 12 m from
where ships touch down, and off the pad's ±25 m depot zone except Pip and Mumble at its edges).

### 6.1 Line format

`[mood, text]`, text ≤ 90 chars (a test checks it). Keepers keep their stations.js extras (`hello`, `hi`, `bye`, `tow`).
`hello` is the first-meeting line (else line 0). Favour lines are `offer`, `wait`, `done`.
Δ and ⊗ are fine in Fredoka (the HUD already uses ⊗).

### 6.2 Mochi Hub (station; Hub frame: +y away from Mochi, +x retrograde, collar at [13, 0], ring r 10.4, truss y ±24)

```js
{ id: 'dot', name: 'Dockmaster Dot', race: 'pipkin', look: { ripe: 'pink', cloth: 'blue', acc: 'headset' },
  at: { station: 'hub', keeper: true },
  hello: ['chat', "Welcome to Mochi Hub, rookie! Tap W to fly."],
  hi:    ['chat', "Mochi Hub here. Dock any time, rookie!"],
  lines: [
    ['hint',   "Easy on my paint. Under 1.5 m/s, please."],
    ['hint',   "Prograde goes up, retrograde goes down. Really."],
    ['chat',   "Fuel, fixes and fries. Mostly fuel."],
    ['hint',   "Lower orbit = faster orbit. Blame Kepler."],
    ['gossip', "You're green, rookie. Literally. Give it a few years, you'll ripen."],
    ['hint',   "Lifting off Mochi costs more Δv than crossing the whole belt. Budget for it."],
  ] },   // replaces stations.js lines 'Bring me ice, I bring you money.' and 'The ring spins so the coffee stays put.'
         // (both move to Dot's `hi` rotation if you can't bear to lose them); keep the bye/tow lists

{ id: 'peri', name: 'Peri', race: 'orbiloon', look: { pal: 'sky', acc: 'wand' },
  at: { station: 'hub', x: -9, y: 19 },
  lines: [
    ['hint', "Inside 4 km, Mochi is the boss of you. Outside, Ember is. That's the Hill sphere."],
    ['hint', "Leaving Mochi from the Hub costs 8.6 m/s. Add a lane change down here: 0.05 more."],
    ['hint', "From low Mochi orbit, 15 m/s at once leaves at 19 m/s. Split up, at 5. Oberth!"],
    ['joke', "I don't float. I fall very politely, and burp now and then."],
    ['chat', "Traffic is light. Traffic is always light. I am still very busy."],
  ] },

{ id: 'thud', name: 'Sergeant Thud', race: 'oggle', look: { pal: 'teal', iris: '#ffd166', acc: 'cap' },
  at: { station: 'hub', x: 6, y: -27 },
  lines: [
    ['grumpy', "Hub Patrol. Seven hundred metres round Mochi is my patch. Pirates know it."],
    ['lore',   "We were all patrol once. Then the Hub bought a bigger fryer instead of paying us."],
    ['lore',   "Half of us quit and went pirate. The Free Company. I call them Gary."],
    ['hint',   "Pirates give up once you leave their patch. Running is a strategy. Ask Gary."],
    ['joke',   "One eye is plenty. Two eyes is showing off."],
  ] },
```

### 6.3 Mochi surface (pad at th = π/2; outposts from mochi.js)

```js
{ id: 'pip', name: 'Pip', race: 'pipkin', look: { ripe: 'yellow', cloth: 'orange', acc: 'apron' },
  at: { spot: 'pad', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 + 0.055 } },
  lines: [
    ['hint',  "Hold left click to dig. Blue is ice, rusty is iron. Ice pays the bills."],
    ['chat',  "Pad prices are worse than upstairs. I'm closer. That's the whole pitch."],
    ['lore',  "Your ship's the same make old Radish flew. Radish went to Glimmer. Never came back."],
    ['hint',  "Touch down under 2.5 m/s, legs first. The pad forgives. Mochi doesn't."],
    ['joke',  "One kettle is for tea, one is for fuel. Do not mix up the kettles."],
  ],
  favour: 'scoop',
  offer: ['want',  "Find Radish's ship on Glimmer? Finders Keepers. Tell me what the log says."],
  wait:  ['sad',   "Any word from Glimmer? Radish always said one more scoop."],
  done:  ['sad',   "\"Don't say one more scoop.\" That's Radish all right. Thanks, rookie."] },

{ id: 'mumble', name: 'Mumble', race: 'murk', look: { pal: 'dusk', eye: '#ffe066', acc: 'scarf' },
  at: { spot: 'pad', k: 1, fallback: { body: 'mochi', th: Math.PI / 2 - 0.06 } },
  lines: [
    ['gossip', "Rust is my cousin. No, that doesn't get you a discount."],
    ['chat',   "Ember is very loud today. I am staying in the shade."],
    ['gossip', "Velvet in the Cellar knows things. Everything I know, plus more."],
    ['lore',   "We dug the first tunnels. The Pipkins put up the signs. The signs are wrong."],
  ],
  favour: 'salt',
  offer: ['want',  "Two salt crystals. For seasoning. Do not ask what I season."],
  wait:  ['want',  "Salt crystals glitter white in the dirt. Two, please."],
  done:  ['happy', "Ahh. Crunchy. Here, take this before I change my mind."] },

{ id: 'okra', name: 'Foreman Okra', race: 'pipkin', look: { ripe: 'lime', cloth: 'teal', acc: 'hardhat' },
  at: { spot: 'outpost-ice', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 + 0.9 } },
  lines: [
    ['hint',  "Ice digs easy. Iron's tough, nickel's tougher. Platinum? Bring a better laser."],
    ['hint',  "Pack full? Walk back and press E. It all tips into the hold."],
    ['chat',  "Safety first. And second. Mining comes about fourth."],
    ['joke',  "I asked for a drill. They sent a laser. I asked for a crew. They sent you."],
  ],
  favour: 'rig',
  offer: ['want',  "The rig needs 40 kg of iron. Rusty orange blobs, a bit deeper. Pays fair."],
  wait:  ['want',  "Forty kilos of iron, rookie. Rusty orange blobs."],
  done:  ['happy', "Good iron! The rig says thanks. Well, it creaks. Same thing."] },
```

### 6.4 Mochi's tunnels (spot role ids, see section 10)

```js
{ id: 'grubb', name: 'Cookie Grubb', race: 'oggle', look: { pal: 'tangerine', iris: '#ffd166', acc: 'apron' },
  at: { spot: 'canteen', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 + 0.38 } },
  lines: [
    ['joke',   "Every fry on Mochi Hub comes from my fryer. Fuel and fixes came later."],
    ['lore',   "I cooked for Captain Crunch. He was cereal-ously bad at tipping."],
    ['gossip', "Pirates eat here on Tuesdays. Truce day. Don't start anything on a Tuesday."],
    ['hint',   "Low on fuel out in the outer lane? Rust sells it dear. Dear beats drifting."],
  ],
  favour: 'noodles',
  offer: ['want',  "25 kg of ice for the noodle water. Fresh ice, not hull ice."],
  wait:  ['want',  "Still need 25 ice. My noodles are sad and crunchy."],
  done:  ['happy', "NOODLES ARE GO! Have some fries. They fix suits. Don't ask how."] },

{ id: 'gneiss', name: 'Grandpa Gneiss', race: 'crustling', look: { pal: 'slate', R: 1.4, seed: 3, acc: 'amethyst' },
  at: { spot: 'gallery', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 + 0.46 } },
  lines: [
    ['lore',   "Before the crumbs... there was the Loaf. A whole world. Then it... went stale."],
    ['lore',   "Survey folk say the Loaf never rose. Too little dough. Young rocks. So sure."],
    ['gossip', "Cousin Lou napped on Big Potato. Set an alarm for six. Six... centuries."],
    ['hint',   "Hurry is... expensive. Coast. Warp. The rocks... will wait."],
    ['joke',   "I was here before the Hub. Before the tunnels. I am... the wall."],
  ] },

{ id: 'velvet', name: 'Velvet', race: 'murk', look: { pal: 'plum', eye: '#7cf5d6', acc: 'monocle' },
  at: { spot: 'cellar', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 - 0.3 } },
  lines: [
    ['gossip', "Void opals on Glimmer. Platinum on Truffle. Pirates on both. Choose."],
    ['gossip', "Rust holds the pirates' pension fund. That's why Rust's is neutral."],
    ['gossip', "Pirates radio in Belt Common so you understand the threats. Considerate."],
    ['lore',   "We read with our fingers. Ink is shouting. Receipts are very rude."],
  ],
  favour: 'fire',
  offer: ['want',  "One fire opal. Seed has a few, Big Potato too. I pay above market."],
  wait:  ['want',  "Fire opal: pink fire in the rock. Seed, or Big Potato."],
  done:  ['happy', "Warm. Lovely. And a secret: Truffle has void opals, and no pirates. Yet."] },

{ id: 'unit7', name: 'UNIT-7', race: 'bot', look: { pal: 'survey', acc: 'clipboard' },
  at: { spot: 'archive', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 - 0.38 } },
  lines: [
    ['lore', "EMBER SURVEY AGENCY ARCHIVE. ESA. NO RELATION. TO ANYTHING."],
    ['lore', "INTERN PROJECT 4 WORKED FOR ELEVEN GLORIOUS MINUTES. IT STILL ORBITS MOCHI."],
    ['joke', "EMBER MASS 3.8E17 KG. 400 BILLION TIMES TOO LIGHT TO BE A STAR. IT BURNS ANYWAY."],
    ['hint', "MOCHI DOES NOT SPIN. EMBER CROSSES ITS SKY ONCE PER LAP. 1 DAY = 108 MINUTES."],
  ],
  favour: 'hiback',
  offer: ['want',  "MY LITTLE BROTHER PHIL LANDED ON SEED. HE SAID HI. PLEASE SAY HI BACK."],
  wait:  ['want',  "PHIL IS ON SEED, KIWI'S MOON, IN THE SHADE. WALK UP CLOSE. SAY HI."],
  done:  ['happy', "PHIL SAYS HI. PHIL SAYS HI. LOGGING THIS FOREVER."] },

{ id: 'sizzy', name: 'Sizzy', race: 'orbiloon', look: { pal: 'lilac', acc: 'specs' },
  at: { spot: 'skylight', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 - 0.46 } },
  lines: [
    ['hint', "Inner lane runs 32 m/s, ours 29, outer 26. Closer to Ember, faster you go."],
    ['hint', "Mochi lane to inner lane: 1.7 m/s to drop in, 1.8 to settle, 46 minutes between."],
    ['hint', "Heading inward? Leave when your target trails Mochi by about 35 degrees."],
    ['hint', "The inner lane laps us every four and a half hours. Missed it? Warp and wait."],
    ['warn', "Never go within 3.6 km of Ember. We call it the Sizzle. So will your hull."],
  ],
  favour: 'exposure',
  offer: ['want',  "Dr. Voss's ship still circles Glimmer, shutter open. Bring her last photo home?"],
  wait:  ['want',  "Long Exposure circles Glimmer 70 m out. Match its orbit, then salvage."],
  done:  ['sad',   "It developed. It's all dark... and full of stars. She was right."] },

{ id: 'chive', name: 'Chive', race: 'pipkin', look: { ripe: 'sprout', cloth: 'red', acc: 'cap' },
  at: { spot: 'market', k: 0, fallback: { body: 'mochi', th: Math.PI / 2 + 0.3 } },
  lines: [
    ['chat',   "Are you a real prospector? With a real ship? Can I sit in it? No? Okay."],
    ['joke',   "When I ripen I want to go purple like Radish. Purple is the best colour."],
    ['gossip', "There's a muncher on Kiwi called Mochi. Same as our rock! So funny."],
    ['hint',   "Hold W after a jump and the jetpack kicks in! It says so on the box."],
  ],
  favour: 'shiny',
  offer: ['want',  "Could you bring me some Kiwi amber? Just one? I'll be SO careful."],
  wait:  ['want',  "Amber is orange and glowy. Kiwi has some. Dorito too!"],
  done:  ['happy', "IT'S SO SHINY. I'm naming it Gerald. Here's all my pocket money."] },
```

(mobs.js really does have a muncher named Mochi on Kiwi, and a Tater Tank named Gerald. Keep both.)

### 6.5 Mochi's moons

```js
{ id: 'fern', name: 'Granny Fern', race: 'pipkin', look: { ripe: 'peach', cloth: 'lavender', acc: 'bun' },
  at: { station: 'outpost', keeper: true },
  // keep stations.js hello / lines / bye; add:
  lines_add: [
    ['lore', "Basil and I planted the belt's first lettuce. Then he went off in that pod."],
  ],
  favour: 'drawer',
  offer: ['want',  "Basil's pod, Lettuce Pray, still circles Kiwi. The good seeds are in the blue drawer."],
  wait:  ['want',  "Lettuce Pray goes round Kiwi at 74 m, dear. Salvage it, then come and see me."],
  done:  ['happy', "His good seeds! Oh, Basil. Take a radish, dear. Take two."] },

{ id: 'queso', name: 'Queso', race: 'pipkin', look: { ripe: 'yellow', cloth: 'orange', acc: 'sash' },
  at: { body: 'dorito', th: -1.0 },                 // opposite the Cool Ranch Express (wreck th 2.15)
  lines: [
    ['chat',   "Dorito Day comes every time Dorito laps Mochi. Every 5 minutes 23 seconds!"],
    ['joke',   "The festival needs 4,000 crates of chips. We have one. It's mostly crumbs."],
    ['gossip', "Courier Tamsin crashed on our far side. Right on time. Very, very hard."],
    ['grumpy', "The Nacho Nibblers ate the bunting. And the backup bunting."],
  ],
  favour: 'dorito',
  offer: ['want',  "Salvage the Cool Ranch Express? Whatever chips survived, the festival needs!"],
  wait:  ['want',  "The Cool Ranch Express is half-buried on Dorito's far side. Land close, rummage!"],
  done:  ['happy', "CHIPS! Dorito Day is saved! It's today! It's always nearly today!"] },
```

### 6.6 The Mochi lane (co-orbital neighbours, heliocentric, no moons)

```js
{ id: 'halite', name: 'Old Halite', race: 'crustling', look: { pal: 'granite', R: 0.8, seed: 11, acc: 'salt' },
  at: { body: 'pretzel', th: 1.0 },
  lines: [
    ['chat', "Pretzel and Mochi... share one orbit. Same speed. We chase... never meet."],
    ['hint', "To reach me from Mochi... leave going backwards. Lower... is faster. You catch up."],
    ['joke', "Salt grows on me. Literally. Do not... laser the hermit."],
    ['lore', "The Crumbs swarm... breathes in and out... once a lap. I count. I like counting."],
    ['warn', "Swarm rocks... come big. Fifteen metres. Do not... hug them."],
  ] },

{ id: 'annie', name: 'Anvil Annie', race: 'oggle', look: { pal: 'grape', iris: '#ffd166', acc: 'goggles' },
  at: { spot: 'forge', k: 0, fallback: { body: 'waffle', th: 0.6 } },   // mochi.js builds Annie's Forge (slab, anvil, glow)
  lines: [
    ['lore',   "Forty years a pirate. Then I learned hitting metal pays better than hitting ships."],
    ['gossip', "Marge runs the Free Company from Pickle now. 'Retired.' Pirates never retire."],
    ['hint',   "Heavier ship, less Δv. Every bolt you add, you push forever. Weigh your toys."],
    ['joke',   "Waffle has square holes. Nobody knows why. I blame the Murk."],
  ],
  favour: 'forge',
  offer: ['want',  "Bring me 30 kg of nickel. Olive-green blobs, deep in. The forge is hungry."],
  wait:  ['want',  "Thirty nickel. Olive-green. Dig deep, dig hard."],
  done:  ['happy', "GOOD NICKEL! Here, coin. Mind your fingers, the anvil bites."] },

{ id: 'beeper', name: 'BEEPER', race: 'bot', look: { pal: 'survey', acc: 'dish' },
  at: { body: 'nugget', th: Math.PI / 2 },
  lines: [
    ['chat',   "BELT NEWS. SWARMS: BREATHING NORMALLY. EMBER: HOT. PIRATES: RUDE. END."],
    ['hint',   "SWARM ROCKS SHARE ONE ORBIT SIZE, SO ONE PERIOD. THEY NEVER SHEAR APART."],
    ['hint',   "DOUBLE YOUR ORBIT SIZE AND A LAP TAKES 2.8 TIMES LONGER. KEPLER. EVERY TIME."],
    ['joke',   "RELAY STATION 3. RELAYS 1 AND 2 DO NOT EXIST. DO NOT ASK ABOUT 1 AND 2."],
    ['gossip', "INTERN PROJECT 5 IS ON MACARON. STILL UNPAID. STILL WORKING."],
  ] },

{ id: 'nodey', name: 'Nodey', race: 'orbiloon', look: { pal: 'mint', acc: 'scroll' },
  at: { body: 'crouton', th: 2.0 },
  lines: [
    ['hint', "Press M for the map: every lane, every rock, and you. Mostly you."],
    ['hint', "Swarms live between the lanes: the Crumbs inside ours, the Gravel Gang outside."],
    ['hint', "Swarms breathe in and out once a lap. A gap that's shut now opens later."],
    ['chat', "I mapped every rock in the Crumbs. Then they moved. So I mapped them again."],
  ] },
```

### 6.7 The outer lane

```js
{ id: 'rust', name: 'Rust', race: 'murk', look: { pal: 'soot', eye: '#ffe066' },
  at: { station: 'rusts', keeper: true },          // the yellow eyes in the doorway are now explicitly a Murk
  hello: ['gossip', "No names, no receipts. Pirates stay out."],
  lines: [
    ['chat',   "Scrap, gems, jelly. I buy what others won't."],
    ['gossip', "Pirates owe me money. They keep away."],
    ['chat',   "Guns? Orion pulse units? Cash only."],
    ['hint',   "Big Potato does the parking. I do the pricing."],                       // already in stations.js
    ['joke',   "It all fell off a freighter. Honest."],
  ] },   // keep the bye list

{ id: 'blat', name: 'Bouncer Blat', race: 'oggle', look: { pal: 'moss', iris: '#ffd166', acc: 'vest' },
  at: { station: 'rusts', x: 7.8, y: 6.0 },        // feet on the RUST'S neon sign (x 5-13.6, top y 6.0), clear of the flag
  lines: [
    ['grumpy', "No fighting in the bubble. Two hundred sixty metres. I measured with my arms."],
    ['chat',   "Rust says I'm staff. I say I'm family. Rust says no receipts."],
    ['hint',   "Pirates lurk 200 to 300 m round Potato. Come in high, dock quick."],
    ['joke',   "I bounced Captain Crunch once. He bounced three more times. Low gravity."],
  ] },

{ id: 'shale', name: 'Aunt Shale', race: 'crustling', look: { pal: 'sandstone', R: 1.0, seed: 5, acc: 'moss' },
  at: { body: 'potato', th: 0.95 },                 // Couch Potato crashed at th 0.75
  lines: [
    ['gossip', "Lou's fine. He's the rock next to the pod. Please... don't laser Lou."],
    ['chat',   "The Tater Tanks think I'm their mother. I've stopped... correcting them."],
    ['hint',   "Big Potato pulls 2.2. More than Mochi. Mind your landing."],
    ['lore',   "Pirates keep off my side. I'm very old. And very... heavy."],
  ] },

{ id: 'lou', name: 'Captain Lou', race: 'crustling', look: { pal: 'granite', R: 1.3, seed: 9 },
  at: { body: 'potato', th: 0.63 },                 // looks exactly like a rock; eyes never open
  lines: [
    ['chat', "Zzzz..."],
    ['chat', "...six... six what..."],
    ['joke', "...five more... centuries..."],
    ['chat', "Zzz... hm? ...no."],
  ] },

{ id: 'marge', name: 'Mad Marge', race: 'oggle', look: { pal: 'grape', iris: '#ff3b5c', acc: 'tricorn' },
  at: { spot: 'brinepit', k: 0, fallback: { body: 'pickle', th: 1.2 } },   // mochi.js builds The Brine Pit
  lines: [
    ['lore',   "The Free Company of the Crumb. I founded it. Gary just works here. Badly."],
    ['gossip', "Kessler Kate wants more debris. Nobody wants more debris. Except Kate."],
    ['joke',   "One-Eyed Wally has two eyes. Wears a patch to fit in. We let him."],
    ['hint',   "Out by Mochi's outer ring we hunt in pairs. Watch your back. Then your front."],
  ],
  favour: 'union',
  offer: ['want',   "Gary's been skimming. Knock down three pirates and I'll pay their bounty again."],
  wait:  ['grumpy', "Three pirates. Any three. Gary would be nice."],
  done:  ['happy',  "Ha! That'll teach them to skim. Union business concluded."] },

{ id: 'basalt', name: 'Brother Basalt', race: 'crustling', look: { pal: 'basalt', R: 1.0, seed: 13, acc: 'hood' },
  at: { body: 'biscotti', th: Math.PI / 2 },
  lines: [
    ['chat', "..."],
    ['chat', "... ..."],
    ['lore', "The rock does not hurry. The rock arrives."],
    ['joke', "I have taken a vow of silence."],
  ] },   // yes, the translator reveals "...". You paid for that. Worth it.
```

### 6.8 The inner lane

```js
{ id: 'lulu', name: 'Lulu', race: 'orbiloon', look: { pal: 'peach', acc: 'lamp' },
  at: { station: 'lantern', keeper: true },          // only with The Lantern (stretch); otherwise not placed
  lines: [
    ['hint',   "The Lantern keeps pirates off: 260 metres of peace. Refuel, sell, breathe."],
    ['hint',   "Glimmer is two kilometres ahead on our orbit. Same speed: it never gets closer."],
    ['warn',   "Glimmer is rich and rude. Come back here before the pirates notice you."],
    ['gossip', "I fished a purple Pipkin out of the dark once. Muttering about scoops."],
  ] },

{ id: 'glint', name: 'Glint', race: 'murk', look: { pal: 'dusk', eye: '#ff9ec7', acc: 'lantern' },
  at: { body: 'glimmer', th: 2.45 },                 // Finders Keepers crashed at th 2.9
  lines: [
    ['gossip', "Void opals glow purple in the dark. I see them. You need a scanner."],
    ['warn',   "One more scoop, they say. Then the pirates come. Then no more scoops."],
    ['chat',   "Mine. Mine. That one's mine too. You may have... that pebble."],
    ['hint',   "Glimmer pulls just 1.2. Escape speed under 8 m/s. Jetpacks get ideas."],
  ] },

{ id: 'intern5', name: 'INTERN-5', race: 'bot', look: { pal: 'survey', acc: 'spoon' },
  at: { body: 'macaron', th: 0.4 },
  lines: [
    ['joke', "ESA INTERN PROJECT 5. PROJECT 4 RAN ELEVEN MINUTES. I HAVE RUN ELEVEN YEARS."],
    ['sad',  "NOBODY HAS TOLD MY SUPERVISOR. I THINK MY SUPERVISOR IS PROJECT 3."],
    ['hint', "PLATINUM IS VERY HARD. BUY A BETTER LASER. I USE A SPOON."],
    ['chat', "STATUS: UNPAID. MORALE: HIGH. CONFUSING."],
  ] },

{ id: 'radish', name: 'Radish', race: 'pipkin', look: { ripe: 'plum', cloth: 'orange', acc: 'goggles', helmet: true },
  at: { body: 'truffle', th: 1.9 }, after: 'scoop', // hidden until Pip's favour is done
  lines: [
    ['joke',  "I said one more scoop. The vein said no. The pirates said yes. I left."],
    ['lore',  "Lulu fished me out of the dark off Glimmer. Purple and furious. Mostly purple."],
    ['hint',  "Truffle has void opals and nobody shooting. Don't tell everyone. Tell Pip."],
    ['chat',  "Same make as my old ship! Be kind to her. She hates crumbs in the vents."],
  ] },
```

### 6.9 Talking

- **On foot** (`g.mode === 'eva'`), within **3 m** of an NPC: interaction `F Talk to Mumble` (nearest per key wins, as now).
  Each press says the next line (cycle saved in `line[id]`). The first press says `hello` (or line 0) and marks `met`.
- **Ambient barks:** within 12 m, an NPC says a random line of theirs at most once per 45 s (no prompt needed).
  Crowds use their race's bark list.
- **Station visitors** (Peri, Thud, Blat) are reachable on a tethered EVA (v4 allows EVA anywhere); they also bark
  when your ship comes within 60 m of their station.
- **Keepers** (Dot, Fern, Rust, Lulu): stations.js `chatter()` and `respawn()` call `Npcs.say(g, keeperId, line)`
  instead of `Game.toast` when npcs.js is loaded (fallback: today's toast). The bubble is anchored at the keeper's
  porthole/doorway, or shown as a radio bubble when the station is small on screen.
- **Laser pokes** (stretch, cheap): if eva's beam segment passes within 0.6 m of an NPC, it says
  `OI!` (Oggle) / `Rude.` (Murk) / `...ow.` (Crustling) / `HEY.` (Bot) / `Eep!` (Orbiloon, Pipkin), once per 5 s.
  NPCs are **never** `targets()`: no damage, ever, from lasers, bombs, bullets or bugs.

---

## 7. Favours (requests that become jobs)

Favours are **not** core goals (the JOBS panel shows only the first 5 undone goals; a dozen favours would bury the
tutorial). npcs.js tracks them, pays them (`g.money += reward`, toast, log, save) and draws its own small
**FAVOURS** panel with `kit.stackRight(236, 26 + 20 n, 'FAVOURS')` (max 3 rows, only while one is active).

**Flow:** first talk with the giver says `offer` (gold `want` bubble, star icon) and the prompt becomes
`F Accept: 2 salt crystals for Mumble ($150)`. Accepting toasts `FAVOUR: BRING MUMBLE 2 SALT CRYSTALS ($150)`.
While active, every other press says `wait`. When the condition is met the panel row turns green
(`✓ Mumble: hand it over`) and the prompt becomes `F Give Mumble 2 salt crystals` (items) or `F Tell UNIT-7`
(events). Done: `done` line, reward, toast `FAVOUR DONE: ... +$150`, `Game.log`.
**Keeper favours** (Fern) need no F: docking at her station after meeting her offers and auto-accepts; docking
again with the condition met completes it.

**Hand-ins** take from the backpack first, then the ship's hold if the ship is within 40 m (landed or docked).

| id | giver | ask | done when | reward | item value | MVP |
|---|---|---|---|---|---|---|
| `salt` | Mumble | 2 salt crystals | hand-in | $150 | $90 | MVP |
| `noodles` | Cookie Grubb | 25 kg ice | hand-in (the $5 fries counter that heals is mochi's, via `EVA.topUp(g, false)`) | $80 | $20 | MVP |
| `shiny` | Chive | 1 Kiwi amber | hand-in | $140 | $90 | MVP |
| `forge` | Anvil Annie | 30 kg nickel | hand-in | $220 | $96 | MVP |
| `drawer` | Granny Fern | salvage Lettuce Pray | `Wrecks.isSalvaged(g, 'lettuce')`, then dock at Kiwi Outpost | $250 | | MVP |
| `hiback` | UNIT-7 | visit Little Phil | astronaut within 6 m of Phil's hull (`Wrecks.byId(g, 'phil')` + `Wrecks.hullDist`), or Phil salvaged; then tell UNIT-7 | $200 | | stretch (contract §10) |
| `rig` | Foreman Okra | 40 kg iron | hand-in | $110 | $64 | stretch |
| `fire` | Velvet | 1 fire opal | hand-in | $380 | $220 | stretch |
| `dorito` | Queso | salvage Cool Ranch Express | `isSalvaged('coolranch')`, then tell Queso | $200 | | stretch |
| `exposure` | Sizzy | salvage Long Exposure | `isSalvaged('longexp')`, then tell Sizzy | $300 | | stretch |
| `union` | Mad Marge | down 3 pirates after accepting | `g.mod.combat.kills − kills0 ≥ 3`, then tell Marge | $500 | | stretch |
| `scoop` | Pip | salvage Finders Keepers | `isSalvaged('finders')`, then tell Pip; unlocks Radish on Truffle | $300 | | stretch |

Every Wrecks / Combat check is feature-detected; with that module off, the favour is simply never offered.
Item values use CONFIG.items base prices; econ may retune prices, rewards stay flat dollars.

**One core job** (the only addition to the JOBS panel), so new players meet an alien early:
`{ id: 'meet', order: 33, reward: 50, text: 'Say hi to Mumble by the pad (on foot, F)', test: (g) => !!g.mod.npcs?.met.mumble }`.

---

## 8. Crowds: lots of NPCs for Mochi

Avi asked for "lots of NPCs" on Mochi. Named NPCs carry the content; **extras** carry the bustle. Each Mochi spot
gets a count of extras placed along its floor, each with a seeded race, palette, accessory and name
(`rng(hash32(spotId) + k)`), and the race's bark list. Extras say a bark when you pass within 6 m (one per spot per 25 s)
and answer F with another bark. **MVP: 12 extras** (market 6, canteen 3, cellar 3). Stretch: ~25 across all spots.

| race | names | barks |
|---|---|---|
| Pipkin | Dill, Kale, Fennel, Chard, Leek, Cress, Turnip, Yam, Basil, Clem, Rocket, Endive | "Morning! Or evening. The sky goes round every 108 minutes." · "Have you tried Grubb's fries? You should." · "Dug a blue blob today. Ice! Rich at last. Well, forty dollars." · "Watch your air out there, rookie." · "My cousin ripened last week. Very yellow. Very proud." · "Welcome to Mochi! Mind the signs. The signs are wrong." |
| Murk | Hush, Shade, Soot, Ash, Smudge, Dusk, Lint, Purr, Nook, Wisp | "Shh." · "Too bright." · "Mind the drip." · "I saw nothing." · "Nice hood. Oh. It's a helmet." · "The tunnels remember." |
| Oggle | Grub, Thog, Thunk, Krag, Snag, Gronk, Mog, Gub, Brick, Yarp | "OI." · "WHAT YOU LOOKING AT? OH, A ROOKIE. CARRY ON." · "NICE SHIP. SHAME IF A ROCK HIT IT." · "I AM NOT A PIRATE. ANYMORE." · "FRIES!" · "ONE EYE. ALL SEEING. MOSTLY." |
| Crustling | Feldspar, Pumice, Obsidian, Mica, Flint, Tuff, Agate, Jasper, Marble | "...hm." · "Hello... in a while." · "Young... pebble." · "...the dust settles." · "Mind... my toes." · "Zzz..." |
| Orbiloon | Loo, Oolu, Wena, Apo, Hoo, Eppie, Nimbus, Ziggy | "Wheee." · "Lovely orbit you have." · "Prograde is the way up." · "Hello, falling friend." · "Mind the swarms." · "Ember is pretty today." |
| Bot | UNIT-3, UNIT-9, MOP-2, PROBE 4B, TOASTR, SKID, RELAY 6, BLINK | "BEEP." · "HELLO. HELLO." · "SCANNING. YOU ARE A PIPKIN." · "BATTERY: VIBES." · "SURVEY CONTINUES." · "PLEASE STAND STILL. THANK YOU." |

Extras speak their own script too (barks are lines like any other), with mood `chat` (Oggle barks `grumpy` 1 in 3).

**Named extras (MVP, contract §5.2).** Mochi's shops and landmarks need someone standing there. Each is an extra with a fixed name and race, one line of their own (from mochi.md) and their race's barks. Their names are reserved and never drawn from the pools above (also reserved: Gristle, Granny Granite).

| name | race | spot | own line |
|---|---|---|---|
| Tansy | Pipkin | `guide` | "Downtown's down the stair. Lift's by the pad. The signs are wrong." |
| Clunk | Oggle | `lift` | "LIFT NAMED AFTER ME. OR ME AFTER IT. NOBODY REMEMBERS." |
| Parsnip | Pipkin | `market` (the GEMS stall) | "Gems at a dime over Hub price. Everything else a bit under." |
| Sorrel | Pipkin | `guild` | "Diggers' guild. Suits, lights, jetpacks. Guild rate for ore." |
| Bonk | Oggle | `outpost-iron` | "IRON IN, BOLTS OUT. I HIT THINGS FOR MONEY NOW." |
| Nozzle | Oggle | `pump9` | "THERE WERE NEVER PUMPS 1 TO 8. I JUST LIKE THE NUMBER." |
| Twist | Pipkin | `pitstop` | "First stop out of Mochi. Fuel, a kettle, no pirates." |

---

## 9. Stations and keepers (stations.js changes)

1. **Rename**: already done in stations.js (Mochi Hub, the `MOCHI HUB` sign). Grep `ceres` in tests once more.
2. **Rust's round Big Potato: already done** by the world agent (`host: 'potato', orbit: () => 600, phase: () => 2.0`,
   Hill-sphere blurb, the "Big Potato does the parking" line). Keep it; the numbers check out
   (Kepler rate from Potato's μ = 10,780: **4.24 m/s, one lap per 889 s = 14 min 49 s**). Potato's Hill sphere is
   **1,904 m**, so 600 m is 0.32 of it (comfortably inside the prograde-stable zone), clear of its rubble (115-190 m)
   and above the pirate haunt (215-320 m round Potato), so Rust's 260 m bubble does not swallow the whole pirate patch.
3. **Keepers get races:** Dot and Fern are Pipkins: add a tiny antenna with a bobble above the head inside their
   portholes (stroke + r 0.1 m circle, mood colour). Rust: add a dusk-purple hood silhouette above the yellow eyes
   in the doorway, so the eyes read as a Murk.
4. **Visitors drawn in the station frame** with `Npcs.drawSprite(...)` (feature-detected at draw time): Peri
   floating off the Hub's prograde side at (−9, 19), clear of the wings (|x| 1-5.6) and the antenna; Thud floating past
   the Mochi-side end of the truss (the green nav light is at (0, −24.6)); Blat standing on Rust's neon sign. Only when
   `P.detail` (station > 45 px on screen).
5. **Chatter through bubbles** (section 6.9), toast fallback without npcs.js.
6. **Contract additions (MVP):** add `'haul'` to the `tabs` of `hub`, `outpost` and `rusts`; make the dock zone `DOCK_R + max(0, (g.S.radius ?? 4) − 4)` (14 m for the Prospector, 21 m for the Leviathan). Haul reads station positions through `Stations.list(g)` / `st.state(t)`, so nothing else changes.
7. **Stretch: The Lantern**, an Orbiloon lighthouse and the inner lane's only safe harbour, **co-orbital 2 km behind
   Glimmer**: `host: 'ember', orbit: (w) => w.byId.glimmer.a, phase: (w) => w.byId.glimmer.phase - 2000 / w.byId.glimmer.a,
   rate: (w) => w.byId.glimmer.n`, `noPirates: true` (combat's `pirateFree` then gives it a 260 m bubble for free),
   `kind: 'outpost'`, keeper Lulu, `tabs: ['services', 'sell', 'suit']`, `fuelMult 1.4`, buys gems at 1.1x and void opals
   at 1.15x. Glimmer's pirate zone is r ≤ 330 m round Glimmer, so the bubble never overlaps it. Art: a disc base,
   a tapered white tower (3 m wide, 12 m tall, red stripes), a lamp room with a rotating beam (a soft yellow cone),
   the collar on top, Lulu floating beside the lamp.

---

## 10. Contract with mochi.js (where NPCs stand)

npcs.js asks `Mochi.spots(g)` (feature-detected) for an array of
`{ id, name, body: 'mochi', lx, ly, ux, uy, w, air }`: body-local floor point, local up, usable floor width (m),
and whether the chamber is pressurised (no helmets for Pipkins, Murk and Oggles). NPCs stand along the floor
tangent at spacing `min(2.2, w / n)`, each snapped to the floor with a short terrain raycast along −up.
**The role ids match mochi.md §8 exactly**, so no ROLE map is needed. Mochi adds `guide`, `lift`, `guild`, `shrine`,
`workings`, `pump9`, `pitstop`, `forge` and `brinepit` (18 spots in all; named extras and Annie/Marge use them).
If a spot is missing, the NPC uses its surface `fallback` (helmet on).

| role id | suggested name | what it is | named NPCs | extras (MVP / stretch) |
|---|---|---|---|---|
| `pad` | Mochi launch pad | surface, the kiosk | Pip, Mumble | 0 / 2 |
| `outpost-ice` | Frostbite Flats | surface ice outpost | Foreman Okra | 0 / 3 |
| `outpost-iron` | Clank Rig | surface iron rig | | 0 / 3 (bots, oggles) |
| `market` | The Pantry | the big central cavern | Chive | 6 / 8 |
| `canteen` | The Noodle Hole | diner (the fries!) | Cookie Grubb | 3 / 4 |
| `gallery` | Echo Gallery | long tunnel, Crustlings in the walls | Grandpa Gneiss | 0 / 2 |
| `cellar` | The Cellar | deepest, darkest chamber; Murk quarter | Velvet | 3 / 3 |
| `archive` | The Quiet Nook | Survey archive | UNIT-7 | 0 / 1 |
| `skylight` | The Skylight | chamber with a shaft open to the sky | Sizzy | 0 / 1 |

Nice-to-have from mochi.js: a spawn `?spawn=tunnels` (in the Pantry) for playtests and screenshots.

---

## 11. Your astronaut's look (eva.js hooks; the progression doc owns tiers and numbers)

You are a Pipkin sprout; keep today's proportions (they are the species standard the NPC Pipkins copy).

- **The pip** (antenna bobble) shows your state: pink `#ff7eb6` normal; gold `#ffd166` for 2 s after a gem;
  cyan `#7fd8ff` blinking when air < 30 s; red `#ff5d5d` blinking when suit HP < 30 %; hot pink glow while lasering.
- **Translator on the helmet:** Mk I = a small brass ear-trumpet `#e3b04b` on the helmet's side at (0.40, hy + 0.05),
  pointing out. Mk II = a thin gold ring (rx 0.1, ry 0.035) round the pip with a dot orbiting it at 1 rev/s; it spins
  faster and glows while any bubble is being revealed. (The same "wear an orbit" motif as the Orbiloons who built it.)
- **Suit tiers:** eva.js maps whatever tier stat the progression doc defines (called `S.suitTier` here) to a look.
  Read it, never hard-code prices:
  - **0 stock:** as today.
  - **1 padded:** body ellipse 0.27×0.32 with three quilt seams (arcs).
  - **2 armoured:** a chest plate (rounded rect in GUN `#8a86b3`) with 4 rivets, thicker shin strokes, a brow ridge on the helmet rim.
  - **3 exo frame:** visible struts hip → knee → ankle (ink-outlined bars 0.07 wide, accent `#ff9f43`) with joint discs
    r 0.08, chunkier boots, legs 0.12 m longer, the backpack becomes a power pack with two vents.
  - **4 power exo:** shoulder pauldrons (half-discs r 0.16) with piston rods to the forearm, the laser arm gets a
    forearm-cannon housing, a chest cage, knee joints that pulse cyan `#7cf5d6` while sprinting, height ~2.0 m, the
    bubble helmet sits in a raised collar. Hard landings pop a `CLANK!`. The tiny green Pipkin face in the bubble on
    top of a mech is the whole charm: never hide it.
- **Sprint** (`S.sprint` or the progression doc's name): pink racing stripes on the boots, three speed lines behind,
  the antenna streams back.
- **Dive roll** (`S.roll`): during the roll draw a tucked ball (r 0.45 at y 0.5) with the helmet glass at the front,
  rotating two full turns over the roll; a dust ring on landing; a white flicker for the invulnerable frames.
- **Bombs** (`S.bombs`): a diagonal bandolier `#6e5a3a` across the chest with one red puck (r 0.06, fuse spark) per
  charge; pucks grey out while on cooldown and refill one by one, so the cooldown is readable on the sprite itself.
- **Stretch, ripening:** finishing every job (or banking $20k) ripens you one shade (sprout → lime). Dot's `hi`
  becomes `Mochi Hub here. Dock any time, Captain!` and a toast says `YOU'RE RIPENING, ROOKIE!`.
- **Stretch, paint:** suit palettes Rookie White (today), Hub Orange, Murk Midnight, Oggle Purple (with a tiny skull).

---

## 12. npcs.js: module shape

```
// ======================================================================
//  NPCS  —  aliens: six races, named NPCs and crowds, speech bubbles in
//  procedural alien scripts, the translator reveal, favours.
//  API: Npcs.list(g), say(g, who, text, mood), drawSprite(ctx, race, look, st),
//       script(race, word, w, h), readable(g, race, word), translator(g), RACES, DEFS
// ======================================================================
```

Suggested blocks, each behind a `// ---------------- name ----------------` divider: races (data), cast (data),
crowds (data), scripts (pure), sprites (canvas), placement (spots, surfaces, stations), talking (lines, barks,
interactions), favours, bubbles (layout, typewriter, reveal), HUD, lifecycle, register.

- **Hooks:** `init`, `load`, `save`, `ready` (resolve placements lazily on first use), `frame` (bubble clocks in real
  seconds, ambient barks, favour conditions such as the Phil proximity flag), `interactions` (F talk / accept / give),
  `hint` (first contact; favour ready), `onKey` (dev L), `drawWorld` (sprites: only NPCs whose spot is within the view
  and only when `kit.cam.zoom > 1.5` px/m), `drawScreen` (bubbles, radio bubble), `drawHUD` (FAVOURS).
- **State** `g.mod.npcs = { met: {}, line: {}, fav: {id: 'offered'|'active'|'done'}, favData: {}, heard: [], metAlien, barkT: {}, bubbles: [], radio: [] }`;
  save `met, line, fav, favData, heard`; load defensively (unknown ids ignored).
- **Load order:** the lead adds `<script src="js/npcs.js"></script>`; the order is `… combat, haul, mochi, npcs, render`, so NPC sprites draw over mochi's props. Register with econ's pattern (`if (!Game.mods.includes(mod)) return undefined;`).
  The bundler and the test harness both read index.html, so nothing else to wire. Everything cross-module
  (`Stations`, `Wrecks`, `Combat`, `Mochi`, `EVA`, `Econ`) is feature-detected at call time.
- **Performance:** ~28 named NPCs + ≤ 25 extras; update and draw only those within ~200 m of the camera.
- **Logs** (`Game.log`): `npc Mumble (murk, glyphs): "Two salt crystals..."` (always the English),
  `npc favour salt accepted`, `npc favour salt done +$150`, `npc placed 19 named, 12 extras (mochi spots: 7/9)`,
  `translator level 2 (6 languages)`.

**Tests** (`tests/test_npcs.js`, `H.load({ only: 'economy,stations,eva,wrecks,npcs' })`):
1. Data: ids unique; every NPC has 3-6 lines; **every line ≤ 90 chars**; every mood known; every race has a sprite,
   a script (or is `pipkin`) and a bark list; every favour id in a giver exists in the favour table.
2. Scripts: same word → identical primitives (JSON equal); case and punctuation do not change glyphs;
   different words → different glyphs; **Bot round trip**: decoding the LEDs gives the word back (parity checked).
3. Translator: level 0 reads only Pipkin; level 2 reads all; level 1 reads digits and names always, and 45-65 %
   of a list of 2,000 synthetic letter-only words (the prototype measured 55.8 % on 5,000 random words).
4. Talking: spawn `pad`, step out, put the astronaut 2 m from Mumble, press F → a bubble with Mumble's line,
   `metAlien`, job `meet` done (+$50), a log line.
5. Favour (hand-in): accept `salt`, add 2 salt to the pack, F → +$150, pack salt −2, `fav.salt === 'done'`.
6. Favour (event): accept `drawer`, `Wrecks.complete(g, 'lettuce', 'ship')`, dock at the outpost → done, +$250.
7. Save / load round trip keeps met, lines, favours.
8. No crash with `only: 'npcs'` (no stations, wrecks, mochi): NPCs on surfaces still place; favours needing
   missing modules are not offered.
9. Playtest screenshots (scratch dir): the pad with Pip and Mumble talking at `?xlate=0`, then `?xlate=2`
   mid-reveal; the Pantry if mochi.js is in; Rust's with Blat and the Murk doorway.

---

## 13. MVP / stretch

**MVP (one session):**
- npcs.js: six race sprites, six scripts (five glyph + English), bubbles with mood tint, icon, name tab and sound
  line, typewriter, the reveal animation, radio bubbles, translator levels 0-2, `?xlate=`.
- 20 MVP NPCs (table in 6, Marge included), talking with F, ambient barks, 12 crowd extras + 7 named extras (§8).
- 5 MVP favours (salt, noodles, shiny, forge, drawer) + FAVOURS panel, job `meet`.
- stations.js: keepers in bubbles, keeper race
  touches (antennae, Murk hood), visitors Peri, Thud, Blat, the `haul` tab and the big-frame dock zone (§9.6).
- Tests 1-8, screenshots.
- Econ (their file): the two translator tiers in the Suit tab.

**Stretch (in rough priority):**
1. The other 8 NPCs and 7 favours, `hiback` included (Radish's little arc is the best of them).
2. The Lantern station.
3. Race-shaped bubble outlines.
4. Laser-poke reactions; more crowd extras for every spot.
5. Mk III Bug Whisperer (bug subtitles).
6. **Rosetta:** without a translator, a word heard fully revealed... no: a word *seen* 6 times in glyphs becomes
   readable anyway (per race, saved). Real language learning, deterministic, and it makes Mk I feel like a head start.
7. Shop keeper portraits by race (shop.js could call `Npcs.portraitSVG(race, look, mood)` if it exists).
8. Sleeping Crustlings among swarm rocks: 1 rock in ~150 gets a face; lasering it makes it say `...rude.` and drift off.
9. Player ripening and suit paint.
10. Belt weekday: `day = floor(t / 6491) % 7`; on a Tuesday the Noodle Hole is full of off-duty pirates (Oggle extras
    with red irises) and salvaging the Plucky Tuesday adds a line: "Somebody came by on a Tuesday."

---

## 14. Asks to other implementers (all optional, all feature-detected)

| who | ask |
|---|---|
| **econ** | Add the translator line (section 5) to the Suit tab; `S.translator` from its stats hook. Dev "shop anywhere" covers testing. Stretch: per-station stock so Rust's can sell Mk III. |
| **eva** | Section 11 looks (pip mood colours, translator gadget, tier looks, sprint, roll, bombs). Keep `g.mod.eva.beam` (`{x0, y0, x1, y1}`) readable for laser pokes. Never make NPCs laser targets (they are not in `targets()`). |
| **mochi** | `Mochi.spots(g)` (section 10) with an `air` flag; a `tunnels` spawn if cheap. |
| **look** | Nothing required. If LIGHT follows Ember, NPCs follow automatically. Map labels: NPC homes could get a tiny race icon next to the body name (stretch). |
| **world** | Keep body ids `pretzel waffle nugget crouton potato pickle biscotti glimmer gumdrop macaron truffle` (NPCs place by id and skip missing ones). If swarm names change, tell aliens (four lines name them). |
| **SPEC** | Keys: dev **L** = cycle translator. Jobs: `meet` at order 33. Cross-module: `Npcs` API (section 12). |

---

## Appendix A: the numbers

Every number an NPC or this doc quotes, from this script (run with `node`; v4 values: μ_Ember 2.53e7, lanes at
24 / 30 / 36.5 km, Mochi R 300 g 2, Hub at r 420, stock ship ve 450 m/s, dry 1.0 t, fuel 1.4 t, 7 kN, ISP_SCALE 8):

```js
const G = 6.674e-11, MU = 2.53e7, mochi = 2 * 300 * 300;
const circ = (mu, r) => Math.sqrt(mu / r), T = (mu, a) => 2 * Math.PI * Math.sqrt(a ** 3 / mu);
const hill = (a, mu, M) => a * Math.cbrt(mu / (3 * M)), syn = (a, b) => 1 / Math.abs(1 / T(MU, a) - 1 / T(MU, b));
function hohmann(r1, r2) {
  const at = (r1 + r2) / 2, vp = Math.sqrt(MU * (2 / r1 - 1 / at)), va = Math.sqrt(MU * (2 / r2 - 1 / at));
  const lead = Math.PI - 2 * Math.PI / T(MU, r2) * T(MU, at) / 2;
  return { dv1: Math.abs(vp - circ(MU, r1)), dv2: Math.abs(circ(MU, r2) - va), tof: T(MU, at) / 2, leadDeg: lead * 180 / Math.PI };
}
const hubV = circ(mochi, 420), hubEsc = Math.sqrt(2 * mochi / 420), fromHub = (vinf) => Math.sqrt(vinf ** 2 + hubEsc ** 2) - hubV;
function flyby(vinf, rp) { const e = 1 + rp * vinf * vinf / mochi, d = 2 * Math.asin(1 / e); return [d * 180 / Math.PI, 2 * vinf * Math.sin(d / 2)]; }
// ... print everything below
```

| quantity | value | used by |
|---|---|---|
| Ember mass, μ/G | 3.79e17 kg; 0.08 M☉ / that = 4.2e11 ("400 billion times too light") | UNIT-7 |
| Sizzle radius (3 R) | 3,600 m | Sizzy |
| lane speeds (24 / 30 / 36.5 km) | 32.47 / 29.04 / 26.33 m/s | Sizzy |
| lane periods | 77.4 / 108.2 / 145.2 min | Sizzy, UNIT-7 (Mochi day 108 min) |
| synodic periods | Mochi-inner 272 min (4.5 h), Mochi-outer 424 min (7.1 h), inner-outer 166 min | Sizzy |
| swarm period at 26.6 km (The Crumbs) | 90 min ("breathes once a lap") | Halite, Nodey, BEEPER |
| Mochi Hill sphere | 4,001 m | Peri |
| Mochi escape: surface / from the Hub | 34.6 m/s / Hub circular 20.70, escape 29.28, **Δv 8.58 m/s** | Peri, Dot |
| Hohmann Mochi → inner (24 km) | 1.66 + 1.76 m/s, 46.2 min, target must **trail by 34.8°** | Sizzy |
| Hohmann Mochi → outer (36.5 km) | 1.39 + 1.32 m/s, 63.1 min, target must **lead by 23.5°** | |
| escape + inner transfer from the Hub | 8.63 m/s (only **+0.05** over a bare escape: Oberth) | Peri |
| Oberth, from a 320 m orbit (v 23.72, v_esc 33.54) | 15 m/s at once → v∞ 19.3 m/s; escape first (9.82) then the rest → 5.2 m/s | Peri |
| Mochi slingshot, v∞ 10 m/s at r_p 350 m (50 m up) | turns the path 114°, Δv 16.7 m/s, free | (stretch line for Peri) |
| phasing to Pretzel (+0.18 rad, 5.4 km ahead), 1 lap | phasing orbit a 29,424 m, 0.29 m/s each end, 105 min | Halite ("leave going backwards") |
| Kepler: double a | period × 2^1.5 = 2.83 | BEEPER |
| Dorito round Mochi (a 780) | 323 s = 5 min 23 s | Queso |
| Big Potato: μ, escape, Hill | 10,780 m³/s², 17.6 m/s, 1,904 m | Shale, Rust's blurb |
| Rust's at 600 m round Potato | 4.24 m/s, 889 s = 14.8 min, 0.32 Hill | Rust, blurb |
| Glimmer: escape, Hill | 7.9 m/s, 529 m | Glint |
| Seed escape | 2.57 m/s | (UNIT-7 favour wait line mentions Seed) |
| Lettuce Pray round Kiwi (a 74) | lap 54 s | Fern |
| Long Exposure round Glimmer (a 70) | 3.40 m/s, lap 129 s | Sizzy |
| stock ship v4 | Δv 394 m/s (v3: 131), TWR on Mochi 1.46, Isp 367 s | Dot ("lifting off costs more than crossing the belt": ≥ 2 × 24.5 m/s up and down vs ~3.4 m/s lane to lane) |

---

## Appendix B: reference code, scripts (tested)

Pure, deterministic, Node-loadable. Checked: determinism, case/punctuation invariance, Bot decode round trip
(`HELLO`, `PHIL SAYS HI.`, `KEPLER`), Mk I readable fraction 0.558 on 5,000 random letter-only words (seeded). Restyle freely;
keep the hash salt strings (`race + ':'`, `'mk1:'`, `'snd:'`) identical or every glyph changes.

```js
// ---------------- alien scripts: pure glyph generators (prototype for design/lore.md) ----------------
//  script(race, word, w, h) -> primitives in a w x h box (px, y DOWN, baseline at y = h)
//  prims: ['dot', x, y, r] · ['ring', x, y, r] · ['line', x0, y0, x1, y1, lw] · ['ell', x, y, rx, ry, rot] · ['sq', x, y, s, on]
//         ['spiral', x, y, r]

const Scripts = (() => {

  function hash32(s) {                         // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {                         // same as World.rng (mulberry32)
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const key = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '');

  // ---------------- murk: raised dots, 2 x 3 cells (read by touch, in the dark) ----------------
  function murk(word, w, h, R) {
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

  // ---------------- oggle: notches on a stem line (they carve it, ogham-style) ----------------
  function oggle(word, w, h, R) {
    const out = [], y = 0.5 * h, n = Math.max(1, Math.round(w / (0.5 * h))), gw = w / n;
    out.push(['line', 0, y, w, y, Math.max(1.5, 0.13 * h)]);
    out.push(['line', 0, y - 0.18 * h, 0.12 * h, y, Math.max(1.3, 0.11 * h)]);                     // the arrowhead every word starts with
    for (let i = 0; i < n; i++) {
      const kind = Math.floor(R() * 4), k = 1 + Math.floor(R() * 3), x0 = i * gw + gw * 0.25, sp = Math.min(0.17 * h, gw * 0.5 / k);
      for (let j = 0; j < k; j++) {
        const x = x0 + j * sp;
        if (kind === 0) out.push(['line', x, y, x, y - 0.42 * h, Math.max(1.3, 0.11 * h)]);
        else if (kind === 1) out.push(['line', x, y, x, y + 0.42 * h, Math.max(1.3, 0.11 * h)]);
        else if (kind === 2) out.push(['line', x, y - 0.4 * h, x, y + 0.4 * h, Math.max(1.3, 0.11 * h)]);
        else out.push(['line', x - 0.14 * h, y + 0.38 * h, x + 0.14 * h, y - 0.38 * h, Math.max(1.3, 0.11 * h)]);
      }
    }
    return out;
  }

  // ---------------- crustling: rock strata (three layers of bars), sometimes a fossil ----------------
  function crust(word, w, h, R) {
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
  function orbi(word, w, h, R) {
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
  function bot(word, w, h) {
    const out = [], chars = [...word].map((ch) => ch.charCodeAt(0) & 127), cw = w / Math.max(1, chars.length);
    const s = Math.min(cw / 2.7, h / 4.3);
    chars.forEach((code, i) => {
      let ones = 0; for (let b = 0; b < 7; b++) ones += (code >> b) & 1;
      const bits = [ones & 1, ...[6, 5, 4, 3, 2, 1, 0].map((b) => (code >> b) & 1)];   // [parity, b6..b0]
      bits.forEach((on, k) => out.push(['sq', i * cw + (cw - 2 * s) / 2 + (k % 2) * s, h / 2 - 2 * s + Math.floor(k / 2) * s, s * 0.82, on]));
    });
    return out;
  }
  function decodeBot(prims, n) {            // the easter egg, as a test helper: LEDs back to letters
    let txt = '';
    for (let i = 0; i < n; i++) {
      const bits = prims.slice(i * 8, i * 8 + 8).map((p) => p[4]);
      const code = bits.slice(1).reduce((a, b) => a * 2 + b, 0), ones = bits.slice(1).reduce((a, b) => a + b, 0);
      txt += (ones & 1) === bits[0] ? String.fromCharCode(code) : '?';
    }
    return txt;
  }

  const GEN = { murk, oggle, crustling: crust, orbiloon: orbi, bot };
  function script(race, word, w, h) {
    const g = GEN[race]; if (!g) return [];
    return g(word, w, h, rng(hash32(race + ':' + key(word))));
  }

  // ---------------- sounds: cosmetic syllables under the glyphs ----------------
  const SOUNDS = {
    oggle: { syl: ['GRAK', 'OI', 'BLAT', 'ZOG', 'HUP', 'KRANK', 'YARG', 'BONK', 'URK', 'DAK'], join: '-', sep: ' ' },
    crustling: { syl: ['hrm', 'grn', 'mmm', 'rrk', 'hmm', 'grr', 'unh'], join: '', sep: '... ' },
    orbiloon:  { syl: ['loo', 'wee', 'oo', 'hoo', 'lu', 'wi', 'ooo', 'ee'], join: '', sep: ' ~ ' },
    bot:   { syl: ['beep', 'boop', 'bip', 'bzzt', 'dee', 'doo'], join: '-', sep: ' ' },
    murk:  null,                                                     // they whisper: "~ whispers ~"
  };
  function sound(race, text) {
    const S = SOUNDS[race]; if (!S) return race === 'murk' ? '~ whispers ~' : '';
    return text.split(/\s+/).filter(Boolean).map((wd) => {
      const R = rng(hash32('snd:' + race + ':' + key(wd))), n = Math.max(1, Math.min(3, Math.ceil(key(wd).length / 3)));
      return Array.from({ length: n }, () => S.syl[Math.floor(R() * S.syl.length)]).join(S.join);
    }).join(S.sep);
  }

  // ---------------- translator: can the player read this word? ----------------
  //  lvl 0: only Belt Common (pipkin) · lvl 1: numbers, names, and ~half the vocabulary · lvl 2: everything
  function readable(lvl, race, word, names) {
    if (race === 'pipkin' || lvl >= 2) return true;
    if (lvl < 1) return false;
    const k = key(word);
    if (!k || /\d/.test(k) || (names && names.has(k))) return true;
    return hash32('mk1:' + k) % 100 < 55;
  }

  return { hash32, rng, script, sound, readable, decodeBot, key };
})();

if (typeof module !== 'undefined') module.exports = Scripts;
```

---

## Appendix C: reference code, sprites and bubble (prototype)

Screenshot-checked at 105 px/m and at EVA zoom (32 px/m) on a mock Mochi floor, with bubbles at translator levels
0, 1 and mid-reveal (scratch: `/tmp/claude-0/v4-lore/proto.png`, `proto2.png`). Notes for the port:
- The prototype takes palette **arrays** in `look`; the cast data (section 6) uses palette **names** (`pal: 'dusk'`,
  `ripe: 'pink'`, `cloth: 'blue'`). Put one `PAL` table per race in npcs.js and resolve names there.
- Accessories present in the prototype: Pipkin `apron hardhat bun helmet`, Murk `scarf monocle`, Oggle `bandana cap`,
  Crustling `salt moss`, Orbiloon `specs`. The rest in section 2 (headset, cap, goggles, sash, lantern, tricorn,
  vest, amethyst, hood, wand, lamp, scroll, clipboard, dish, spoon) are new: each is 2-6 canvas calls in the same style.
- The prototype used Trebuchet MS; the game uses `kit.FONT` (Fredoka). Re-measure, do not hard-code widths.
- `lw` is the ink width in sprite units: `2.4 * kit.px() / scale` like eva.js.

### C.1 Sprites

```js
// ---------------- race sprites (prototype for design/lore.md) ----------------
//  draw(ctx, race, look, st) in a sprite frame: metres, y UP, origin at the feet (hover anchor for orbiloons).
//  The caller translates/rotates/scales. st = { t, talk, mood, look: [x, y], L: light dir, lw }
const Sprites = (() => {
  const INK = '#1b1433', BONE = '#f6ecd6';

  function toon(c, path, [base, shade, hi], L, k, lw, hiAt) {
    path(); c.fillStyle = shade; c.fill();
    c.save(); path(); c.clip();
    c.translate(L[0] * k, L[1] * k); path(); c.fillStyle = base; c.fill();
    if (hiAt && hi) { c.beginPath(); c.ellipse(hiAt[0], hiAt[1], hiAt[2], hiAt[3], hiAt[4] || 0, 0, 2 * Math.PI); c.fillStyle = hi; c.fill(); }
    c.restore();
    path(); c.strokeStyle = INK; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke();
  }
  function stroke2(c, pts, w, col, lw) {        // ink-outlined thick stroke (limbs, tentacles)
    const p = () => { c.beginPath(); c.moveTo(pts[0], pts[1]); if (pts.length === 6) c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); else c.lineTo(pts[2], pts[3]); };
    c.lineCap = 'round'; p(); c.strokeStyle = INK; c.lineWidth = w + 2 * lw; c.stroke(); p(); c.strokeStyle = col; c.lineWidth = w; c.stroke();
  }
  function eyes2(c, x, y, sp, r, look, blink, lw) {   // two cute eyes: white, pupil, sparkle
    for (const s of [-1, 1]) {
      const ex = x + s * sp;
      if (blink) { c.beginPath(); c.moveTo(ex - r, y); c.lineTo(ex + r, y); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); continue; }
      c.beginPath(); c.ellipse(ex, y, r, r * 1.15, 0, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      c.beginPath(); c.arc(ex + look[0] * r * 0.35, y + look[1] * r * 0.3, r * 0.6, 0, 2 * Math.PI); c.fillStyle = INK; c.fill();
      c.beginPath(); c.arc(ex + look[0] * r * 0.35 - r * 0.22, y + look[1] * r * 0.3 + r * 0.25, r * 0.2, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill();
    }
  }
  const blinkAt = (t, off, per = 3.4) => (t + off) % per < 0.12;

  // ---------------- pipkin ----------------
  const RIPE = { sprout: ['#8fe07a', '#4f9e45', '#d8ffbf'], lime: ['#c8e66a', '#86a33a', '#f1ffc0'], yellow: ['#f2e06b', '#b8a23a', '#fff8c8'],
                 peach: ['#ffd8b8', '#d49a78', '#fff1e4'], pink: ['#ffb3c7', '#c96f8b', '#ffe3ea'], plum: ['#c9a0e8', '#8a5fb0', '#efe0ff'] };
  function pipkin(c, lk, st) {
    const { t, L, lw } = st, skin = RIPE[lk.ripe || 'sprout'], cloth = lk.cloth || ['#7fb8ff', '#4a74b8', '#d6e8ff'];
    const bob = Math.sin(t * 2.2) * 0.01, talk = st.talk > 0 && (t * 8) % 1 < 0.5;
    for (const s of [-1, 1]) stroke2(c, [s * 0.08, 0.42, s * 0.1, 0.12], 0.15, cloth[1], lw);
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.1 + s * 0.03, 0.07, 0.12, 0.07, 0, 0, 2 * Math.PI); c.fillStyle = '#6e6896'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    const wave = st.talk > 0 ? Math.sin(t * 5) * 0.08 : 0;
    stroke2(c, [-0.2, 0.74 + bob, -0.36, 0.52 + bob], 0.11, cloth[0], lw);
    stroke2(c, [0.2, 0.74 + bob, 0.38, (st.talk > 0 ? 0.88 : 0.52) + wave + bob], 0.11, cloth[0], lw);
    for (const [hx, hy] of [[-0.36, 0.52 + bob], [0.38, (st.talk > 0 ? 0.88 : 0.52) + wave + bob]]) { c.beginPath(); c.arc(hx, hy, 0.065, 0, 2 * Math.PI); c.fillStyle = skin[0]; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    toon(c, () => { c.beginPath(); c.ellipse(0, 0.6 + bob, 0.25, 0.3, 0, 0, 2 * Math.PI); }, cloth, L, 0.07, lw, [-0.08, 0.74 + bob, 0.05, 0.1, 0.3]);
    if (lk.acc === 'apron') { c.beginPath(); c.moveTo(-0.17, 0.66 + bob); c.lineTo(0.17, 0.66 + bob); c.lineTo(0.14, 0.36 + bob); c.lineTo(-0.14, 0.36 + bob); c.closePath(); c.fillStyle = '#fff4dc'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    const hy = 1.05 + bob, wob = Math.sin(t * 3.1) * 0.12, ax = Math.sin(wob) * 0.17, ay = hy + 0.27 + Math.cos(wob) * 0.17;
    c.beginPath(); c.moveTo(0, hy + 0.25); c.quadraticCurveTo(0, hy + 0.36, ax, ay); c.strokeStyle = INK; c.lineWidth = lw * 1.2; c.stroke();
    c.beginPath(); c.arc(ax, ay, 0.055, 0, 2 * Math.PI); c.fillStyle = lk.pip || (st.talk > 0 ? '#ffd166' : '#ff7eb6'); c.fill(); c.lineWidth = lw * 0.8; c.stroke();
    toon(c, () => { c.beginPath(); c.ellipse(0, hy, 0.33, 0.28, 0, 0, 2 * Math.PI); }, skin, L, 0.06, lw, [-0.1, hy + 0.13, 0.07, 0.04, 0.4]);
    eyes2(c, 0, hy + 0.03, 0.12, 0.08, st.look || [0, 0], blinkAt(t, lk.off || 0), lw);
    c.fillStyle = 'rgba(255,120,160,0.55)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.22, hy - 0.07, 0.045, 0.025, 0, 0, 2 * Math.PI); c.fill(); }
    c.beginPath(); if (talk) { c.ellipse(0, hy - 0.1, 0.035, 0.04, 0, 0, 2 * Math.PI); c.fillStyle = INK; c.fill(); } else { c.arc(0, hy - 0.06, 0.05, 1.15 * Math.PI, 1.85 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
    if (lk.acc === 'hardhat') {
      toon(c, () => { c.beginPath(); c.ellipse(0, hy + 0.17, 0.3, 0.2, 0, Math.PI, 0, true); c.closePath(); }, ['#ffd166', '#c9962e', '#fff3c4'], L, 0.05, lw, null);
      c.beginPath(); c.roundRect ? c.roundRect(-0.36, hy + 0.13, 0.72, 0.07, 0.03) : c.rect(-0.36, hy + 0.13, 0.72, 0.07); c.fillStyle = '#ffb347'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      c.beginPath(); c.arc(0, hy + 0.26, 0.05, 0, 2 * Math.PI); c.fillStyle = '#fff8c0'; c.fill(); c.stroke();
    }
    if (lk.acc === 'bun') { c.beginPath(); c.arc(0, hy + 0.3, 0.11, 0, 2 * Math.PI); c.fillStyle = '#eeeaf6'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.12, hy + 0.03, 0.1, 0, 2 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke(); } }
    if (lk.helmet) {
      c.beginPath(); c.arc(0, hy + 0.04, 0.44, 0, 2 * Math.PI); c.fillStyle = 'rgba(205,242,255,0.28)'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
      const la = Math.atan2(L[1], L[0]); c.beginPath(); c.arc(0, hy + 0.04, 0.34, la - 0.55, la + 0.35); c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.05; c.stroke();
    }
  }

  // ---------------- murk ----------------
  function murk(c, lk, st) {
    const { t, L, lw } = st, pal = lk.pal || ['#3a2d5c', '#231a3a', '#6a5a96'], sway = Math.sin(t * 0.9) * 0.08;
    const cloak = () => {
      c.beginPath(); c.moveTo(-0.55, 0.06);
      c.quadraticCurveTo(-0.62, 1.25, sway, 2.0); c.quadraticCurveTo(0.62, 1.25, 0.55, 0.06);
      for (let i = 0; i < 5; i++) { const x1 = 0.55 - (i + 1) * 0.22; c.quadraticCurveTo(0.55 - (i + 0.5) * 0.22, -0.08, x1, 0.06); }
      c.closePath();
    };
    toon(c, cloak, pal, L, 0.12, lw, [-0.18, 1.3, 0.08, 0.25, 0.25]);
    if (lk.acc === 'scarf') { c.save(); cloak(); c.clip(); c.fillStyle = '#ff9f43'; c.fillRect(-0.7, 1.0, 1.4, 0.12); c.fillStyle = '#fff4dc'; for (let x = -0.6; x < 0.6; x += 0.2) c.fillRect(x, 1.0, 0.07, 0.12); c.restore(); cloak(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
    c.beginPath(); c.ellipse(sway * 0.3, 1.38, 0.3, 0.22, 0, 0, 2 * Math.PI); c.fillStyle = '#120d1e'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
    const blink = blinkAt(t, lk.off || 1.1, 3.7), sq = st.talk > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 8)) : 1, lx = (st.look ? st.look[0] : 0) * 0.04;
    c.save(); c.shadowColor = lk.eye || '#ffe066'; c.shadowBlur = 8;
    for (const s of [-1, 1]) {
      const x = sway * 0.3 + s * 0.12 + lx, y = 1.38, h = blink ? 0.01 : 0.07 * sq;
      c.beginPath(); c.moveTo(x - 0.1, y); c.quadraticCurveTo(x, y + h * 1.4, x + 0.1, y); c.quadraticCurveTo(x, y - h * 0.8, x - 0.1, y); c.closePath(); c.fillStyle = lk.eye || '#ffe066'; c.fill();
    }
    c.restore();
    if (lk.acc === 'monocle') { c.beginPath(); c.arc(sway * 0.3 + 0.12 + lx, 1.38, 0.1, 0, 2 * Math.PI); c.strokeStyle = '#ffd166'; c.lineWidth = 0.025; c.stroke(); }
    if (st.talk > 0) {
      for (let i = 0; i < 3; i++) { const f = (t * 0.9 + i / 3) % 1; c.beginPath(); c.arc(0.2 + f * 0.3, 1.3 + f * 0.5, 0.04 * (1 - f) + 0.01, 0, 2 * Math.PI); c.fillStyle = `rgba(200,180,255,${0.8 * (1 - f)})`; c.fill(); }
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.36, 0.85, 0.075, 0, 2 * Math.PI); c.fillStyle = pal[1]; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    }
  }

  // ---------------- oggle ----------------
  function oggle(c, lk, st) {
    const { t, L, lw } = st, pal = lk.pal || ['#7448c2', '#4b2a86', '#c3a6ff'], b = Math.sin(t * 3) * 0.04;
    c.save(); c.scale(1 - b * 0.5, 1 + b);
    for (const s of [-1, 1]) { stroke2(c, [s * 0.25, 0.2, s * 0.28, 0.06], 0.16, pal[1], lw); c.beginPath(); c.ellipse(s * 0.3, 0.05, 0.16, 0.07, 0, 0, 2 * Math.PI); c.fillStyle = pal[1]; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    const crest = lk.crest || '#ff5d8f';
    [[-0.22, 1.47], [0, 1.6], [0.22, 1.47]].forEach(([x, y], i) => {
      const wig = Math.sin(t * 4 + i) * 0.03;
      c.beginPath(); c.moveTo(x - 0.12, y - 0.3); c.lineTo(x + wig, y); c.lineTo(x + 0.12, y - 0.3); c.closePath(); c.fillStyle = crest; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    });
    toon(c, () => { c.beginPath(); c.ellipse(0, 0.7, 0.62, 0.58, 0, 0, 2 * Math.PI); }, pal, L, 0.1, lw, [-0.25, 1.0, 0.1, 0.06, 0.5]);
    const swing = st.talk > 0 ? Math.sin(t * 9) * 0.1 : 0;
    for (const s of [-1, 1]) { stroke2(c, [s * 0.55, 0.62, s * 0.78, 0.45 + (s > 0 ? swing : 0)], 0.15, pal[0], lw); c.beginPath(); c.arc(s * 0.8, 0.43 + (s > 0 ? swing : 0), 0.1, 0, 2 * Math.PI); c.fillStyle = pal[0]; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    // the eye (as combat.js drawEye: sclera, iris, pupil, sparkle, slanted lid when grumpy)
    const ex = 0, ey = 0.84, rx = 0.3, ry = 0.26, blink = blinkAt(t, lk.off || 0.4, 4.1), lk2 = st.look || [0, 0];
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 2 * Math.PI); c.fillStyle = BONE; c.fill();
    c.save(); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 2 * Math.PI); c.clip();
    const ix = ex + lk2[0] * 0.08, iy = ey + lk2[1] * 0.06;
    c.beginPath(); c.arc(ix, iy, 0.14, 0, 2 * Math.PI); c.fillStyle = lk.iris || '#ff3b5c'; c.fill();
    c.beginPath(); c.arc(ix, iy, 0.07, 0, 2 * Math.PI); c.fillStyle = INK; c.fill();
    c.beginPath(); c.arc(ix - 0.04, iy + 0.04, 0.03, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill();
    const grumpy = st.mood === 'grumpy' || st.mood === 'warn', yl = blink ? ey - ry - 0.02 : ey + ry * (grumpy ? 0.35 : 0.75), yr = blink ? ey - ry - 0.02 : ey + ry * (grumpy ? 0.05 : 0.75);
    if (blink) { c.fillStyle = pal[1]; c.fillRect(ex - rx, ey - ry, 2 * rx, 2 * ry); }
    else { c.beginPath(); c.moveTo(ex - rx, ey + ry); c.lineTo(ex + rx, ey + ry); c.lineTo(ex + rx, yr); c.lineTo(ex - rx, yl); c.closePath(); c.fillStyle = pal[1]; c.fill(); }
    c.restore();
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 2 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    if (!blink) { c.beginPath(); c.moveTo(ex - rx * 0.95, yl); c.lineTo(ex + rx * 0.95, yr); c.lineWidth = lw * 1.4; c.stroke(); }
    const mo = st.talk > 0 ? 0.06 + 0.08 * Math.abs(Math.sin(t * 6)) : 0.04;
    c.beginPath(); c.moveTo(-0.2, 0.42); c.quadraticCurveTo(0, 0.42 - mo * 2, 0.2, 0.42); c.closePath(); c.fillStyle = '#2a1a4a'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.16, 0.41); c.lineTo(s * 0.12, 0.53); c.lineTo(s * 0.08, 0.41); c.closePath(); c.fillStyle = BONE; c.fill(); c.lineWidth = lw * 0.6; c.stroke(); }
    if (lk.acc === 'bandana') { c.beginPath(); c.ellipse(0, 1.2, 0.5, 0.12, 0, Math.PI * 1.05, Math.PI * 1.95, true); c.lineTo(0.42, 1.12); c.strokeStyle = INK; c.lineWidth = 0.14 + 2 * lw; c.stroke(); c.strokeStyle = '#ff5d8f'; c.lineWidth = 0.14; c.stroke(); }
    if (lk.acc === 'cap') { toon(c, () => { c.beginPath(); c.ellipse(0, 1.22, 0.36, 0.2, 0, Math.PI, 0, true); c.closePath(); }, ['#3a5cc4', '#22357a', '#9fb8ff'], L, 0.04, lw, null);
      c.beginPath(); c.arc(0, 1.3, 0.05, 0, 2 * Math.PI); c.fillStyle = '#ffd166'; c.fill(); }
    c.restore();
  }

  // ---------------- crustling ----------------
  const outCache = {};
  function outline(seed) {
    if (outCache[seed]) return outCache[seed];
    let s = seed; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const harm = [2, 3, 5].map((k) => [k, R() * 6.28, (R() * 0.6 + 0.4) / k ** 0.6]), norm = harm.reduce((a, h) => a + h[2], 0);
    return (outCache[seed] = Array.from({ length: 28 }, (_, i) => { const th = i / 28 * 2 * Math.PI; return 1 + 0.12 * harm.reduce((a, [k, ph, w]) => a + w * Math.sin(k * th + ph), 0) / norm; }));
  }
  function crust(c, lk, st) {
    const { t, L, lw } = st, R = lk.R || 0.8, pal = lk.pal || ['#b8a99a', '#76665f', '#e2d6c8'], br = 1 + 0.015 * Math.sin(t * 2 * Math.PI / 6);
    const out = outline(lk.seed || 7), cy = R * 0.92, tilt = st.talk > 0 ? Math.sin(t * 1.3) * 0.04 : 0;
    c.save(); c.rotate(tilt);
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * R * 0.45, R * 0.12, R * 0.17, 0, 2 * Math.PI); c.fillStyle = pal[1]; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    const path = () => { c.beginPath(); out.forEach((f, i) => { const a = i / out.length * 2 * Math.PI, x = Math.cos(a) * R * f * br, y = cy + Math.sin(a) * R * f * 0.9 * br; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    toon(c, path, pal, L, R * 0.18, lw, [-R * 0.35, cy + R * 0.45, R * 0.18, R * 0.09, 0.5]);
    if (lk.acc === 'salt') for (const [x, h, a] of [[-0.25, 0.32, -0.3], [0.02, 0.42, 0.05], [0.26, 0.28, 0.35]]) {
      c.save(); c.translate(x * R, cy + R * 0.82); c.rotate(a);
      c.beginPath(); c.moveTo(-0.07 * R, 0); c.lineTo(-0.07 * R, h * R); c.lineTo(0, (h + 0.08) * R); c.lineTo(0.07 * R, h * R); c.lineTo(0.07 * R, 0); c.closePath();
      c.fillStyle = '#f4f0ff'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); c.restore();
    }
    if (lk.acc === 'moss') { c.beginPath(); c.ellipse(-0.1 * R, cy + R * 0.8, R * 0.45, R * 0.12, 0.1, Math.PI, 0, true); c.fillStyle = '#7fd35a'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke(); }
    const glance = (t + (lk.off || 0)) % 9 < 1, ey = cy + R * 0.18;
    for (const s of [-1, 1]) {
      const x = s * R * 0.27, r = R * 0.14;
      c.beginPath(); c.arc(x, ey, r, Math.PI, 0, true); c.fillStyle = INK; c.fill();
      if (!glance) { c.beginPath(); c.moveTo(x - r * 1.3, ey + r * 0.15); c.lineTo(x + r * 1.3, ey + r * 0.15); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
        c.save(); c.beginPath(); c.rect(x - r * 1.2, ey, r * 2.4, r * 1.2); c.clip(); c.beginPath(); c.arc(x, ey, r * 1.05, 0, Math.PI); c.fillStyle = pal[0]; c.fill(); c.restore(); }
      else { c.beginPath(); c.arc(x - r * 0.3, ey - r * 0.4, r * 0.25, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); }
      c.fillStyle = 'rgba(255,140,150,0.35)'; c.beginPath(); c.ellipse(x + s * r * 0.4, ey - r * 1.5, r * 0.7, r * 0.35, 0, 0, 2 * Math.PI); c.fill();
    }
    const k = st.talk > 0 ? Math.floor(t * 4) % 2 : 0, my = cy - R * 0.12;
    c.beginPath(); c.moveTo(-R * 0.16, my); c.lineTo(-R * 0.05, my - R * (k ? 0.08 : 0.03)); c.lineTo(R * 0.05, my); c.lineTo(R * 0.16, my - R * (k ? 0.05 : 0.02));
    c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    c.restore();
  }

  // ---------------- orbiloon ----------------
  function orbi(c, lk, st) {
    const { t, L, lw } = st, pal = lk.pal || ['#a8e6ff', '#5aa8d8', '#ffffff'], yc = 1.45 + 0.08 * Math.sin(t * Math.PI), R = 0.62;
    const pf = (t % 1.2) / 1.2;                                            // hover puff: honest cold-gas burps
    c.beginPath(); c.ellipse(0, yc - R * 0.35 - pf * 0.7, 0.08 + pf * 0.25, 0.04 + pf * 0.08, 0, 0, 2 * Math.PI); c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - pf)})`; c.lineWidth = 0.03; c.stroke();
    for (let i = 0; i < 5; i++) {
      const x0 = -0.4 + i * 0.2, sw = Math.sin(t * 1.6 + i * 1.3) * 0.15, len = 0.95 + (i % 2) * 0.25;
      stroke2(c, [x0, yc - 0.2, x0 + sw, yc - 0.2 - len * 0.55, x0 - sw * 0.6, yc - 0.2 - len], 0.07, pal[1], lw);
    }
    const tilt = 0.25 + Math.sin(t * 0.4) * 0.08, ringA = (t * Math.PI) % (2 * Math.PI);
    const ring = (from, to) => { c.beginPath(); c.ellipse(0, yc - 0.16, R * 1.5, R * 0.34, tilt, from, to); c.strokeStyle = INK; c.lineWidth = 0.06 + 2 * lw; c.stroke(); c.strokeStyle = '#ffd166'; c.lineWidth = 0.06; c.stroke(); };
    ring(Math.PI, 2 * Math.PI);
    const pulse = st.talk > 0 ? 1 + 0.05 * Math.abs(Math.sin(t * 10)) : 1;
    const bell = () => { c.beginPath(); c.ellipse(0, yc, R * pulse, R * 0.92 * pulse, 0, Math.PI, 0, true);
      for (let i = 0; i < 4; i++) { const x1 = R * pulse - (i + 1) * R * pulse / 2; c.quadraticCurveTo(R * pulse - (i + 0.5) * R * pulse / 2, yc - 0.22, x1, yc); } c.closePath(); };
    c.save(); c.globalAlpha = 0.95; toon(c, bell, pal, L, 0.1, lw, [-0.25, yc + 0.38, 0.12, 0.06, 0.6]); c.restore();
    const g = c.createRadialGradient(0, yc + 0.22, 0, 0, yc + 0.22, 0.3); const ga = st.talk > 0 ? 0.95 : 0.6;
    g.addColorStop(0, `rgba(255,246,168,${ga})`); g.addColorStop(1, 'rgba(255,246,168,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, yc + 0.22, 0.3, 0, 2 * Math.PI); c.fill();
    eyes2(c, 0, yc + 0.02, 0.2, 0.1, st.look || [0, 0], blinkAt(t, lk.off || 2), lw);
    c.beginPath(); if (st.talk > 0) { c.arc(0, yc - 0.13, 0.035 + 0.015 * Math.abs(Math.sin(t * 10)), 0, 2 * Math.PI); c.fillStyle = INK; c.fill(); }
    else { c.arc(0, yc - 0.1, 0.04, 1.15 * Math.PI, 1.85 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
    ring(0, Math.PI);
    const px = Math.cos(ringA) * R * 1.5, py = Math.sin(ringA) * R * 0.34, ct = Math.cos(tilt), sn = Math.sin(tilt);
    c.beginPath(); c.arc(px * ct - py * sn, yc - 0.16 + px * sn + py * ct, 0.06, 0, 2 * Math.PI); c.fillStyle = '#ff7eb6'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
    if (lk.acc === 'specs') for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.2, yc + 0.02, 0.13, 0, 2 * Math.PI); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
  }

  // ---------------- survey bot ----------------
  function bot(c, lk, st) {
    const { t, L, lw } = st, pal = lk.pal || ['#e8e4f7', '#a9a2cc', '#ffffff'], rock = Math.sin(t * 4.4) * 0.03;
    c.beginPath(); c.arc(0, 0.18, 0.18, 0, 2 * Math.PI); c.fillStyle = '#3b3448'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    c.beginPath(); c.arc(0, 0.18, 0.07, 0, 2 * Math.PI); c.fillStyle = '#a59fbd'; c.fill();
    c.save(); c.translate(0, 0.18); c.rotate(rock); c.translate(0, -0.18);
    const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    c.beginPath(); c.moveTo(0.25, 0.95); c.lineTo(0.32, 1.2); c.strokeStyle = INK; c.lineWidth = lw * 1.2; c.stroke();
    c.beginPath(); c.arc(0.32, 1.22, 0.045, 0, 2 * Math.PI); c.fillStyle = st.talk > 0 || t % 1 < 0.5 ? '#ff5d5d' : '#5a4f74'; c.fill(); c.lineWidth = lw * 0.7; c.stroke();
    stroke2(c, [-0.4, 0.62, -0.6, 0.5], 0.08, pal[1], lw);
    c.beginPath(); c.moveTo(-0.6, 0.5); c.lineTo(-0.68, 0.42); c.moveTo(-0.6, 0.5); c.lineTo(-0.66, 0.58); c.strokeStyle = INK; c.lineWidth = lw * 1.4; c.stroke();
    toon(c, () => rr(-0.4, 0.3, 0.8, 0.65, 0.12), pal, L, 0.06, lw, [-0.25, 0.86, 0.08, 0.04, 0]);
    c.save(); rr(-0.4, 0.3, 0.8, 0.65, 0.12); c.clip(); c.fillStyle = '#ff9f43'; c.fillRect(-0.45, 0.4, 0.9, 0.07); c.restore(); rr(-0.4, 0.3, 0.8, 0.65, 0.12); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    rr(-0.28, 0.53, 0.56, 0.34, 0.07); c.fillStyle = '#16283a'; c.fill(); c.lineWidth = lw * 0.8; c.stroke();
    c.fillStyle = '#7cf5d6'; c.strokeStyle = '#7cf5d6'; c.lineWidth = 0.035;
    if (st.talk > 0) {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.1 - 0.05, 0.74); c.lineTo(s * 0.1, 0.79); c.lineTo(s * 0.1 + 0.05, 0.74); c.stroke(); }
      for (let i = 0; i < 5; i++) { const h = 0.02 + 0.05 * Math.abs(Math.sin(t * 13 + i * 1.7)); c.fillRect(-0.12 + i * 0.055, 0.6, 0.035, h); }
    } else if ((t + (lk.off || 0)) % 3 > 0.1) for (const s of [-1, 1]) c.fillRect(s * 0.1 - 0.035, 0.7, 0.07, 0.07);
    c.restore();
  }

  const DRAW = { pipkin, murk, oggle, crustling: crust, orbiloon: orbi, bot };
  return { draw: (c, race, lk, st) => DRAW[race](c, lk, st), RIPE };
})();
```

### C.2 Bubble (cleaned from the prototype; `c` is the 2D context in screen px)

```js
const MOOD_TINT = { chat: '#fff4dc', hint: '#d4fff4', joke: '#ffe3ef', gossip: '#ece2ff', lore: '#f3e6c8', warn: '#ffd6d6',
                    grumpy: '#ffe0cc', sad: '#dcecff', want: '#fff0b8', happy: '#dff7d4' };
const RACE_UI = { pipkin: ['PIPKIN', '#8fe07a'], murk: ['MURK', '#8a78c4'], oggle: ['OGGLE', '#ff5d8f'],
                  crustling: ['CRUSTLING', '#b8a99a'], orbiloon: ['ORBILOON', '#7fd8ff'], bot: ['SURVEY BOT', '#ff9f43'] };

function drawGlyphs(c, prims, x, y, h) {                 // (x, y) = baseline-left of the word slot
  c.save(); c.translate(x, y - h); c.fillStyle = INK; c.strokeStyle = INK; c.lineCap = 'round';
  for (const p of prims) {
    if (p[0] === 'dot') { c.beginPath(); c.arc(p[1], p[2], p[3], 0, 2 * Math.PI); c.fill(); }
    else if (p[0] === 'ring') { c.beginPath(); c.arc(p[1], p[2], p[3], 0, 2 * Math.PI); c.lineWidth = 1; c.stroke(); }
    else if (p[0] === 'line') { c.beginPath(); c.moveTo(p[1], p[2]); c.lineTo(p[3], p[4]); c.lineWidth = p[5]; c.stroke(); }
    else if (p[0] === 'ell') { c.beginPath(); c.ellipse(p[1], p[2], p[3], p[4], p[5], 0, 2 * Math.PI); c.lineWidth = 1.3; c.stroke(); }
    else if (p[0] === 'sq') {
      if (p[4]) { c.fillStyle = '#2f9e96'; c.fillRect(p[1], p[2], p[3], p[3]); c.fillStyle = INK; }
      else { c.lineWidth = 0.6; c.strokeRect(p[1] + 0.3, p[2] + 0.3, p[3] - 0.6, p[3] - 0.6); }
    }
    else if (p[0] === 'spiral') {
      c.beginPath();
      for (let k = 0; k <= 30; k++) { const a = k / 30 * 4.7, r = p[3] * (0.15 + 0.85 * k / 30); c.lineTo(p[1] + Math.cos(a) * r, p[2] + Math.sin(a) * r); }
      c.lineWidth = 1.4; c.stroke();
    }
  }
  c.restore();
}

const scramble = (wd, i) => { const R = Scripts.rng(Scripts.hash32(wd) + i);
  return [...wd].map((ch) => /[a-z]/i.test(ch) ? String.fromCharCode(97 + Math.floor(R() * 26)) : ch).join(''); };

// tail tip at (tx, ty). lvl = translator level. rev = seconds since the reveal started, or null (no animation).
function bubble(c, tx, ty, race, who, mood, text, lvl, rev) {
  const W = 236, H = 13, LH = 20;
  c.font = `600 14px ${FONT}`;
  const sp = c.measureText(' ').width, lines = [];
  let cur = [], cw = 0;
  for (const wd of text.split(' ')) {
    const ww = c.measureText(wd).width;
    if (cur.length && cw + sp + ww > W) { lines.push(cur); cur = []; cw = 0; }
    cw += (cur.length ? sp : 0) + ww; cur.push({ wd, ww });
  }
  if (cur.length) lines.push(cur);
  const words = lines.flat(), allRead = words.every((o) => Scripts.readable(lvl, race, o.wd));
  const snd = allRead ? '' : Scripts.sound(race, text);
  const bw = Math.max(...lines.map((L) => L.reduce((a, o) => a + o.ww, 0) + (L.length - 1) * sp)) + 28;
  const bh = lines.length * LH + 16 + (snd ? 16 : 0), bx = tx - 30, by = ty - 16 - bh;

  // ---------------- frame: shadow, fill, tail, outline, race stripe, name tab, mood icon ----------------
  c.fillStyle = INK; rr(c, bx + 4, by + 4, bw, bh, 12); c.fill();
  c.fillStyle = MOOD_TINT[mood]; rr(c, bx, by, bw, bh, 12); c.fill();
  c.beginPath(); c.moveTo(tx - 8, by + bh - 1); c.lineTo(tx, ty); c.lineTo(tx + 6, by + bh - 1); c.closePath(); c.fill();
  c.strokeStyle = INK; c.lineWidth = 3; rr(c, bx, by, bw, bh, 12); c.stroke();
  c.beginPath(); c.moveTo(tx - 8, by + bh); c.lineTo(tx, ty); c.lineTo(tx + 6, by + bh); c.stroke();
  c.fillStyle = MOOD_TINT[mood]; c.fillRect(tx - 6.5, by + bh - 2.5, 11, 4);
  c.fillStyle = RACE_UI[race][1]; rr(c, bx + 3, by + 6, 5, bh - 12, 2.5); c.fill();
  c.font = `700 11px ${FONT}`;
  const tag = `${who.toUpperCase()} · ${RACE_UI[race][0]}`, tw = c.measureText(tag).width + 14;
  c.fillStyle = INK; rr(c, bx + 12, by - 10, tw, 17, 5); c.fill();
  c.fillStyle = PAPER2; c.textAlign = 'left'; c.fillText(tag, bx + 19, by + 3);
  moodIcon(c, bx + bw - 6, by + 2, mood);

  // ---------------- words: glyphs, morph, English ----------------
  c.font = `600 14px ${FONT}`;
  let i = 0;
  lines.forEach((L, li) => {
    let x = bx + 16; const base = by + 12 + (li + 1) * LH - 4, mid = base - H / 2;
    for (const { wd, ww } of L) {
      const read = Scripts.readable(lvl, race, wd);
      let u = read ? 1 : 0;                                                           // 0 = glyphs, 1 = English
      if (read && race !== 'pipkin' && rev != null) u = Math.max(0, Math.min(1, (rev - 0.25 - 0.06 * i) / 0.3));
      c.save(); c.translate(x, mid); c.scale(1, u < 0.5 ? 1 - 2 * u : 2 * u - 1); c.translate(-x, -mid);
      if (u < 0.5) drawGlyphs(c, Scripts.script(race, wd, ww, H), x, base, H);         // (strip trailing punctuation first, see 4.1)
      else { c.fillStyle = INK; c.textAlign = 'left'; c.fillText(u < 0.75 ? scramble(wd, i) : wd, x, base); }
      c.restore();
      if (u >= 0.5 && u < 0.8) { c.fillStyle = `rgba(255,255,255,${1 - u})`; c.beginPath(); c.arc(x + ww / 2, mid, 8 * (1 - u) + 2, 0, 2 * Math.PI); c.fill(); }
      x += ww + sp; i++;
    }
  });
  if (snd) {
    c.font = `italic 500 11px ${FONT}`; c.fillStyle = '#6d5f8a';
    let s = snd; while (c.measureText(s).width > bw - 30 && s.length > 4) s = s.slice(0, -2);
    c.fillText(s === snd ? s : s.trimEnd() + '…', bx + 16, by + bh - 8);
  }
}
```

The mood icons (`moodIcon(c, x, y, mood)`, r 10 px, INK outline 2 px) follow the table in section 3: bulb, warning
triangle, gold star with "!", purple star, and six little faces that differ only in eyes and mouth (smile, ^ ^ grin,
wink + smirk, angry brows + flat mouth, frown + blue tear, big smile). `rr` is `kit.roundRect`.
