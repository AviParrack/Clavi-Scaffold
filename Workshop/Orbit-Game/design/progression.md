# UPGRADES FROM DINKY TO FUSION BEAST, HAULING, SUIT AND EVA MECHANICS, DEV MODE

*Pocket Orbit v4 · progression design doc · 2026-10-06*
*For: **econ** (economy.js, shop.js) · **ship** (physics.js, game.js, new haul.js) · **eva** (eva.js) · **look** (render.js, main.js) · **aliens** (npcs.js, stations.js) · **mochi** (terrain.js, mochi.js).*
*Races, NPC voices and the translator reveal live in [lore.md](lore.md). This doc owns numbers, ids, mechanics and the ladder.*

> **Integrated by [V4-CONTRACT.md](V4-CONTRACT.md)** (binding for stage 2). Changed here: `spacewalk` job 55 → 57; `EVA.topUp(g, all)` and `S.engine` (not `Eva` / `engineId`); JET POWER shown real-equivalent (½·T·ve·8); suit bomb craters ∝ E^⅓; tether-yank numbers; the main pad is **not** hardened (an ice seam instead, mochi.md §4.3); dev ∞ is a money pin; the Crusher has no shop or keeper in MVP; haul reads station positions itself. Scope cuts are marked *(stretch, contract §10)*.

Every number below was computed with scratch scripts against the v4 config (ve ×3, Ember, Mochi, the three lanes) or measured in the running game. Where a number is a design choice rather than a consequence, it says so.

---

## 0. TL;DR

- **One equation runs the whole ladder.** With a rock of mass M on the rope, Δv ≈ I / M, where **I = ve × fuel mass** is the tank's total impulse. The stock tank holds **630 kN·s**; the Fusion Beast's holds **480,000 kN·s**. After the ×3 the stock ship flies solo on 394 m/s against 2-10 m/s transfers, so solo Δv stops being the wall. What you buy is **impulse, thrust and tow rating**.
- **Five frames** make the ship visibly grow: Prospector 9 m → Pack Mule → Hauler → Bulk Barge → **Leviathan 26 m**. A frame sets dry mass, base tank, hold, hull, size, turn rate and engine mount. Parts you already own carry over and scale with the frame.
- **Eight engines** climb chemical → NTR → fusion. The new four are Bulldog (36 kN), NERVA-sama (NTR, 23 MW), Pocket Sun (fusion, 6-12 GW) and the **Sunflower torch** (fusion, 20-40 GW, 4,000 kN in afterburner). Power-limited drives obey **T = 2P / ve**, and the shop shows the real-equivalent jet power ½·T·ve·ISP_SCALE, consistent with the Isp it prints.
- **Hauling whole asteroids.** **G** grapples, **Q/Z** reel, **B** plants a charge, **F** sells. Rocks get real rubble-pile densities, mass ρ·4/3·π·r³, and a value equal to their recoverable ore, so lasering, cracking and selling whole can never mint money. The rope is inextensible with honest impulses. A new buyer, **the Crusher**, sits 9 km ahead of Mochi on its rail and pays 80% without the 7 m/s capture into Mochi.
- **Suit.** Sprint (Shift), dive roll with i-frames (C), bombs with refilling charges (RMB or B), tethers of 30-160 m, two exo tiers (Strider, Mecha-Pip), plus pack3, o2c, jet3 and laser4.
- **Tethered EVA anytime.** Press **E** while flying or docked. The ship holds attitude and coasts while you jet around on an inextensible tether. **Q** winches you home. You can laser and bomb rocks in open space.
- **Dev mode.** **∞ money** (I toggles), **O** opens the Debug Duck shop anywhere, **U** tops everything up, a Dev tab has build presets and a rock spawner, and `?dev=1&build=beast` jumps straight to the end.
- **The curve.** Start at $300 → tow hook at ~15 min → Mule at ~1.25 h ($12.5k) → Hauler at ~2 h ($50k cumulative) → Barge at ~3 h ($116k) → **Fusion Beast at ~4 h** ($260k cumulative; the Beast set alone is $145k). The full catalog totals $364k. The system holds ~$8M of rock, so it never runs dry.

> 🚩 **Avi's call (defaults chosen, all cheap to flip):** (1) once side thrusters are bought, ←/→ fire them and **Shift+←/→** keeps the old RCS nudge; (2) tethered EVA runs at **1x** warp (4x is a stretch goal); (3) rocks are **finite**, with no respawn; (4) **suit bombs are free and refill on a cooldown**, while **ship crack charges are bought** consumables (like Orion pulses).

---

## 1. Ground truth: the world this ladder climbs

### 1.1 Orbit numbers (v4 config, computed from μ and a)

| quantity | value |
|---|---|
| Circular speed: inner lane 24 km / Mochi lane 30 km / outer lane 36.5 km | 32.47 / 29.04 / 26.33 m/s |
| Hohmann Mochi lane → inner lane | 3.42 m/s (transfer 2,771 s) |
| Hohmann Mochi lane → outer lane | 2.71 m/s (3,787 s) |
| The Crumbs (26.6 km) → Mochi lane | 1.80 m/s |
| The Gravel Gang (33.4 km) → Mochi lane | 1.52 m/s |
| Phase 0.18 rad along a lane in one orbit | 0.57 m/s total |
| Mochi orbital period | 6,491 s |
| Mochi Hill sphere | ~4,001 m |
| Mochi Hub orbit (r 420) | v_circ 20.70, v_esc 29.28, escape from Hub orbit 8.58 m/s |
| Capture into Hub orbit from the Hill edge | ~7.0 m/s (7.00-7.16 for v∞ 0.5-3 m/s) |
| Mochi inner ring (470-630 m) → Hub | 2.60 m/s (79 s) |
| Mochi outer ring (1,950-2,150 m) → Hub | 9.88 m/s (321 s) |
| Dorito → Hub | 5.38 m/s |
| Kiwi ring → Kiwi Outpost | 1.09 m/s |
| Mochi surface | v_circ 24.5, v_esc 34.6 m/s |

**What this means for design:** every hop worth making costs **1-10 m/s**, and the stock ship carries 394. Solo, you are rich in Δv. With 300 t on the rope, the stock tank's 630 kN·s buys **2.1 m/s**, which is just short of inner ring → Hub. The ladder is about that gap.

### 1.2 Honesty notes (the things a sharp player could check)

- **Rocks use real rubble-pile bulk densities.** Gravel uses 1.9 t/m³, roughly Itokawa's 1.9 g/cm³ ([Fujiwara et al., Science](https://www.science.org/doi/10.1126/science.1126329), 2006). Slush uses 1.2, close to Bennu's 1.19 ([Lauretta et al., Nature](https://www.nature.com/articles/s41586-019-1033-6), 2019). Clank's 4.0 is a metal-rich rubble guess near Psyche's ~4 g/cm³ [unverified, training data]. Mass is ρ × 4/3 π r³ with the drawn radius treated as a sphere.
- **Rocks have no gravity.** A 15 m gravel rock pulls ~8×10⁻⁶ m/s², so leaving it out is honest. The **bodies** are toy-dense (Mochi ≈ 2.4×10⁷ kg/m³). That is the pocket-universe wink, and the game already owns it.
- **Charges use TNT at 4.184 MJ/kg** (the definition). A rock cracks when E ≥ Q·M, with Q in J/kg per type. Fragments get 3% of E as kinetic energy with exactly zero net momentum.
- **Power-limited drives** (NTR, ion, fusion) have a fixed jet power P = ½ T ve. A fuel with lower ve gets proportionally more thrust: T = 2P / ve. The shop prints the **real-equivalent** P = ½ · T · ve · ISP_SCALE, so it agrees with the real-equivalent Isp beside it (printing ½ T ve with the game's ve would be 8× too low next to that Isp). The ratio law T = 2P / ve holds in either scaling, so no thrust changes.
- **Real-equivalent Isp** stays ve × ISP_SCALE (8) / 9.81, as today, so the Sunflower's game ve of 25,000 m/s reads as Isp 20,387 s.
- **The rope never torques the ship** because it is attached at the centre of mass. It is drawn from the nose claw because that looks right, and this doc admits it.

---

## 2. The ship ladder

### 2.1 Frames (hull classes): the ship visibly grows

A **frame** is owned and equipped like an engine. You buy it at any shop with the `ship` tab, but you can only **equip** it while docked at Mochi Hub (or anywhere in the dev shop). Equipping is free, and you may skip tiers.

| id | name | dry t | k (part scale) | base tank m³ | base hold kg | base hull | length m | radius m | engine mount | turn × | tow tier max | price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `prospector` | Prospector | 1.0 | 1 | 1.4 | 300 | 100 | 9 | 4 | 1 | 1.00 | 2 | stock |
| `mule` | Pack Mule | 2.4 | 2.5 | 3.5 | 600 | 160 | 11.5 | 5 | 2 | 0.85 | 2 | $2,500 |
| `hauler` | Hauler | 6 | 6 | 8.4 | 1,200 | 240 | 14.5 | 6.5 | 3 | 0.70 | 3 | $8,000 |
| `barge` | Bulk Barge | 15 | 15 | 21 | 2,400 | 320 | 19 | 8.5 | 4 | 0.55 | 3 | $18,000 |
| `leviathan` | Leviathan | 40 | 40 | 56 | 4,800 | 480 | 26 | 11 | 5 | 0.45 | 4 | $40,000 |

**Rules (econ `stats()`):**

- `S.dry = frame.dry + Σ(line part mass × k) + engine.mass + ion.mass + tow mass + gun mass + Orion and charge mass`. Tank, cargo, hull, armor, RCS, tractor, scanner and side parts scale by **k**. Engines, tow gear and guns keep their own masses.
- The tank, hold and hull tiers become **multipliers on the frame base**, so the existing line tables are untouched:
  - `S.tankVol = frame.tank × tierVol / 1.4`, where tierVol is 1.4 for stock, then 2.4, 4.0, 6.5 or 9.0.
  - `S.cargoCap = frame.hold × tierCap / 300`, where tierCap is 300, 500, 800 or 1,200.
  - `S.hull = frame.hull × tierHull / 100`, where tierHull is 100, 150, 220 or 300.
  - Armor fraction is unchanged.
- `S.rotAccel ×= frame.turn`. Big ships turn like big ships. RCS capacity and transAccel are unchanged, because the RCS gets bigger with the frame.
- `S.sideThrust = side tier kN × k`.
- The frame sets `S.length`, `S.radius` and `S.name`, so "Board Pack Mule" reads naturally.
- **Mount gate:** an engine's mount must be ≤ the frame's mount. Equipping a smaller frame auto-equips the best owned engine that fits (the Sparrow always fits) and toasts `ENGINE SWAPPED: THE SUNFLOWER NEEDS A MOUNT-5 FRAME`.
- **Tow derate:** the active tow tier is `min(owned tier, frame.towTierMax)`. The shop shows "Big Hug (derated to Tug claw on this frame)".
- Equipping clamps `sh.fuel` to the new capacity. It refuses if the cargo would not fit: `SELL CARGO FIRST: 1,240 kg > 1,000 kg HOLD`.
- `canBuy` gets one new reason, **`frame`**, for an engine or tow tier the current frame cannot use. The shop text is `NEEDS A BIGGER FRAME (HAULER)`.

### 2.2 Engines: chemical → NTR → fusion

The existing four keep their numbers, which world/econ already moved to ×3 ve. Four new ones are added. Every engine gets `mount` (default 1). Any engine may also carry **`thrustBy: { fuelId: kN }`** to override thrust per fuel, which power-limited drives need.

| id | name | mount | mass t | price | fuel | game ve m/s | real Isp s | thrust kN | mass flow kg/s | jet power (real-equivalent, ½·T·ve·8) |
|---|---|---|---|---|---|---|---|---|---|---|
| `sparrow` | Sparrow | 1 | 0 | stock | methalox / kerolox | 450 / 414 | 367 / 338 | 7 | 15.6 / 16.9 | 12.6 / 11.6 MW |
| `brick` | Brick | 1 | 0.35 | $2,200 | kerolox / hypergolic | 375 / 390 | 306 / 318 | 16 | 42.7 / 41.0 | 24 / 25 MW |
| `kestrel` | Kestrel | 1 | 0.12 | $4,500 | hydrolox / methalox | 570 / 474 | 465 / 387 | 8 | 14.0 / 16.9 | 18 / 15 MW |
| `nerva` | NERVA-chan | 1 | 0.55 | $9,500 | lh2 / ammonia | 1,140 / 645 | 930 / 526 | 6 / **10.6** | 5.3 / 16.4 | 27 MW both |
| **`bulldog`** | **Bulldog** (twin bell) | 2 | 0.9 | $5,000 | methalox / kerolox | 465 / 426 | 379 / 347 | 36 | 77 / 85 | 67 / 61 MW |
| **`nervasama`** | **NERVA-sama** | 3 | 3.2 | $18,000 | lh2 / ammonia | 1,150 / 650 | 938 / 530 | 40 / 70.8 | 35 / 109 | 184 MW both |
| **`pocketsun`** | **Pocket Sun** (fusion) | 4 | 9 | $38,000 | dhe3 / dd / augment | 20,000 / 12,000 / 2,000 | 16,310 / 9,786 / 1,631 | 150 / 125 / 1,500 | 7.5 / 10.4 / 750 | 12 / 6 / 12 GW |
| **`sunflower`** | **Sunflower torch** (the fusion beast) | 5 | 24 | $70,000 | dhe3 / dd / augment | 25,000 / 15,000 / 2,500 | 20,387 / 12,232 / 2,039 | 400 / 333 / 4,000 | 16 / 22 / 1,600 | 40 / 20 / 40 GW |

- **NERVA-chan on ammonia gets 10.6 kN** (`thrustBy: { ammonia: 10.6 }`) because the reactor's power is fixed: 2 × 27.4 MW / (645 × 8) = 10.6 kN (the same as 2 × 3.42 MW / 645 in game units). This is the honest fix. It may break one NERVA test that asserts 6 kN on ammonia; update that test, because the new number is the physics.
- **Fusion fuel choice is a real trade.** Per m³ of tank, D-He3 carries the most impulse; D-D is cheapest per kN·s; afterburner carries ten times the thrust.

  | fusion fuel | impulse per m³ | impulse per $ | Sunflower thrust |
  |---|---|---|---|
  | D-He3 | 3,000 kN·s | 42 kN·s | 400 kN |
  | D-D | 2,550 kN·s | 100 kN·s | 333 kN |
  | afterburner | 2,000 kN·s | 83 kN·s | 4,000 kN |

- **Afterburner** is ammonia reaction mass dumped into the fusion exhaust at the same jet power, so T = 2P / ve gives 4,000 kN. The spark of D-He3 it burns is a negligible mass and is priced into the slush.

**New fuels** (add to `FUELS`; the Hub sells them, outposts do not):

| id | name | short | density t/m³ | $/t | desc |
|---|---|---|---|---|---|
| `dd` | Deuterium | deuterium | 0.17 | 150 | "Heavy hydrogen. Fuses if you ask nicely and very hot." |
| `dhe3` | D-He3 | D-He3 | 0.12 | 600 | "Deuterium plus helium-3. Fusion's champagne. Barely any neutrons, barely any wallet left." |
| `augment` | Afterburner slush | slush | 0.8 | 30 | "Ammonia with a pinch of D-He3. Fusion shoves it out the back ten times harder." |

There is deliberately **no water fuel**, because it would clash with ice selling at $800/t.

**Ion line (stretch):** turn `ION` into a list, keeping `whisper` and adding **`chorus` "Chorus array"**: mount 3, 1.5 t, tank 2.0 m³, $16,000, 2.0 kN on xenon or 1.73 kN on krypton (power-limited, 31 MW real-equivalent). On a Hauler it adds 353 m/s on xenon, or 6.1 m/s with a 2,000 t rock at about 1 mm/s². That makes it the patient tug. The Whisper on krypton should honestly be 0.217 kN at its fixed 3.9 MW (real-equivalent); this is optional, so leave it if a test pins it.

**Why small engines are solo engines.** Towing rewards **density × ve**, not ve. The table uses the stock frame and stock tank:

| engine / fuel | ve | thrust kN | fuel t | solo Δv | TWR on Mochi | tank impulse kN·s | Δv with 300 t rock |
|---|---|---|---|---|---|---|---|
| sparrow / methalox | 450 | 7 | 1.40 | 394 | 1.46 | 630 | 2.09 |
| sparrow / kerolox | 414 | 7 | 1.68 | 408 | 1.31 | 696 | 2.30 |
| brick / kerolox | 375 | 16 | 1.68 | 303 | 2.64 | 630 | 2.08 |
| brick / hypergolic | 390 | 16 | 1.82 | 333 | 2.52 | 710 | 2.35 |
| kestrel / hydrolox | 570 | 8 | 0.63 | 254 | 2.29 | 359 | 1.19 |
| kestrel / methalox | 474 | 8 | 1.40 | 384 | 1.59 | 664 | 2.20 |
| nerva / lh2 | 1,140 | 6 | 0.31 | 207 | 1.61 | 351 | 1.16 |
| nerva / ammonia | 645 | 10.6 | 1.12 | 351 | 1.99 | 722 | 2.39 |

This is a real lesson that comes free with the game (fluffy hydrogen loses to dense fuel when the payload is a mountain). The shop should show **TOW IMPULSE** as a compare row (§2.6).

### 2.3 Side thrusters and the dash

The new line **`side`** goes in the ship tab. Pods burn **main propellant** at `S.sideVe = min(0.85 × ve, 900)` m/s, so the cap honestly makes them resistojets on fusion ships. Thrust and mass scale with k.

| id | name | thrust kN (×k) | mass t (×k) | dash | price | desc |
|---|---|---|---|---|---|---|
| `side1` | Sidekicks | 1.8 | 0.06 | no | $350 | "Little side pods. Strafe like you mean it, gently." |
| `side2` | Strafe pods | 4.5 | 0.12 | ×4 for 0.4 s, cooldown 1.5 s | $1,200 | "Double-tap to dodge. Pirates hate this one trick." |
| `side3` | Dodge jets | 8.0 | 0.22 | ×5 for 0.4 s, cooldown 1.0 s | $3,500 | "Sideways is a direction too." |

- **Controls.** With `S.sideThrust > 0`, **←/→ fire the side pods** (`ctrl.side = −1..1`). **Shift+←/→** is the old RCS nudge. **↑/↓** stay RCS forward/back. With no side tier, ←/→ behave exactly as today, so a new player never notices.
- **Dash.** Double-tapping ←/→ within 0.25 s gives `S.dashBoost ×` side thrust for 0.4 s, then a cooldown of `S.dashCd`. The overboost is a game allowance; the propellant is paid at the honest rate (mdot = F / sideVe). Dash Δv = boost × side accel × 0.4 s, so **it depends on mass**, and towing a rock kills the dash. That is honest and readable.
- **Warp:** firing side pods or dashing caps warp at 1x, like the main engine.

| build (see §2.5) | side thrust kN | side accel m/s² | dash Δv m/s (propellant used) |
|---|---|---|---|
| First tow (side1) | 1.8 | 0.72 | no dash |
| Brick tug (side2) | 4.5 | 0.68 | 1.09 (23 kg) |
| Mule (side2) | 11.2 | 1.12 | 1.80 (45 kg) |
| Hauler on ammonia (side2) | 27 | 0.84 | 1.34 (78 kg) |
| Barge (side3) | 120 | 2.17 | 4.34 (266 kg) |
| Fusion Beast on D-He3 (side3) | 320 | 2.50 | 5.00 (709 kg) |

Pirate bullets fly at 70-95 m/s from 85-130 m, so a shot takes about 1-1.8 s to arrive. A 1.8 m/s dash at 1.12 m/s² moves the Mule 0.36 m in the 0.4 s burst and ~2 m one second later. That is enough to slip a 3.4 m hit circle you saw coming, which is the point.

### 2.4 Existing lines on bigger frames

- Line **prices are frame-agnostic**: you buy tank2 once and it is a tank2 on any frame. Line **masses scale with k**. On a Leviathan, tank2 weighs 0.12 × 40 = 4.8 t.
- The tiers stay in order (`locked` stays as today). Fuel $/t is unchanged.
- **Tow fee** (rescue): `fee = clamp(base × √k, FEE_MIN, FEE_MAX × √k)`. The maximum is then $250 for the Prospector, $395 for the Mule, $612 for the Hauler, $968 for the Barge and $1,581 for the Leviathan.
- **Repair** stays at $1.2 per hull point. A full Leviathan patch-up is $1,728.

### 2.5 The builds (full tank, empty hold), computed

| build | frame | engine / fuel | parts | dry t | tank m³ | fuel t | wet t | **Δv m/s** | **TWR on Mochi** | hold kg | hull | tow t / cable m | impulse kN·s | fill $ | cost from stock |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Dinky** | Prospector | sparrow / methalox | none | 1.00 | 1.4 | 1.40 | 2.4 | **394** | **1.46** | 300 | 100 | none | 630 | 42 | $0 |
| First tow | Prospector | sparrow / methalox | tow1, side1 | 1.10 | 1.4 | 1.40 | 2.5 | 369 | 1.40 | 300 | 100 | 80 / 25 | 630 | 42 | $800 |
| Brick tug | Prospector | brick / kerolox | tank2, cargo1, rcs1, tow2, side2 | 1.80 | 4.0 | 4.80 | 6.6 | 487 | 1.21 | 500 | 100 | 800 / 40 | 1,800 | 106 | $8,450 |
| **Mule** | Pack Mule | bulldog / methalox | tank1, cargo1, rcs1, tow2, side2 | 4.02 | 6.0 | 6.00 | 10.0 | **424** | **1.80** | 1,000 | 160 | 800 / 40 | 2,790 | 180 | $12,550 |
| **Hauler** | Hauler | nervasama / ammonia | tank2, cargo2, rcs2, hull1, armor1, tow3, side2 | 13.12 | 24.0 | 19.20 | 32.3 | **586** | **1.10** | 3,200 | 360 | 6,000 / 60 | 12,480 | 384 | $42,600 |
| Hauler (LH2) | Hauler | nervasama / lh2 | same | 13.12 | 24.0 | 5.28 | 18.4 | 389 | 1.09 | 3,200 | 360 | 6,000 / 60 | 6,072 | 475 | $42,600 |
| **Barge** | Bulk Barge | pocketsun / dd | tank3, cargo2, rcs2, hull2, armor2, tractor1, tow3, side3 | 38.75 | 97.5 | 16.58 | 55.3 | **4,273** | **1.13** | 6,400 | 704 | 6,000 / 60 | 198,900 | 2,486 | $82,000 |
| **Fusion Beast** | Leviathan | sunflower / dhe3 | tank2, cargo3, rcs2, hull3, armor2, tractor2, gun3, tow4, side3 | 108.74 | 160 | 19.20 | 127.9 | **4,065** | **1.56** | 19,200 | 1,440 | 40,000 / 90 | 480,000 | 11,520 | $168,200 |
| Fusion Beast (D-D) | Leviathan | sunflower / dd | same | 108.74 | 160 | 27.20 | 135.9 | 3,349 | 1.22 | 19,200 | 1,440 | 40,000 / 90 | 408,000 | 4,080 | $168,200 |
| Fusion Beast (afterburner) | Leviathan | sunflower / augment | same | 108.74 | 160 | 128.0 | 236.7 | 1,945 | **8.45** | 19,200 | 1,440 | 40,000 / 90 | 320,000 | 3,840 | $168,200 |

The "cost from stock" column buys every tier in order. Engines bought along the way are not counted here; §9 counts them. Every build lifts off Mochi with a full tank. Stock Sparrow plus tank1 does **not** (TWR 0.97), and the tank3 desc already warns about that.

**With a rock on the rope** (full tank). Each cell is Δv m/s / acceleration m/s² / TWR on Mochi:

| build | 30 t | 100 t | 500 t | 2,000 t | 8,000 t | 27,000 t |
|---|---|---|---|---|---|---|
| First tow | 19.8 / 0.215 / 0.11 | over rating | | | | |
| Brick tug | 52.7 / 0.437 / 0.22 | 17.3 / 0.150 / 0.08 | 3.6 / 0.032 / 0.02 | over rating | | |
| Mule | 75.5 / 0.899 / 0.45 | 26.1 / 0.327 / 0.16 | 5.5 / 0.071 / 0.04 | over rating | | |
| Hauler (ammonia) | 239 / 1.14 / 0.57 | 102 / 0.535 / 0.27 | 23.9 / 0.133 / 0.07 | **6.2** / 0.035 / 0.02 | over rating | |
| Hauler (LH2) | 133 / 0.826 / 0.41 | 52.5 / 0.338 / 0.17 | 11.8 / 0.077 / 0.04 | 3.0 / 0.020 / 0.01 | over rating | |
| Barge (D-D) | 2,592 / 1.47 / 0.73 | 1,354 / 0.805 / 0.40 | 364 / 0.225 / 0.11 | **97** / 0.061 / 0.03 | over rating | |
| Beast (D-He3) | 3,240 / 2.53 / 1.27 | 2,200 / 1.76 / 0.88 | 776 / 0.637 / 0.32 | 227 / 0.188 / 0.09 | **59** / 0.049 / 0.02 | **17.7** / 0.015 / 0.01 |
| Beast (D-D) | 2,685 / 2.01 / 1.00 | 1,837 / 1.41 / 0.71 | 656 / 0.524 / 0.26 | 192 / 0.156 / 0.08 | 50 / 0.041 / 0.02 | 15.0 / 0.012 / 0.01 |
| Beast (afterburner) | 1,634 / 15.0 / 7.50 | 1,196 / 11.9 / 5.94 | 477 / 5.43 / 2.71 | 147 / 1.79 / 0.89 | 39 / 0.486 / 0.24 | **11.8 / 0.147** / 0.07 |

How to read it:

- A **Hauler with 2,000 t** has 6.2 m/s. That gets it from the Crumbs to the Mochi lane (1.80) and on to the Crusher, but not through the 7 m/s capture into the Hub. The Crusher exists for exactly this rock.
- The **Beast with a 27,000 t whale** has 17.7 m/s on D-He3. That is a lane change plus a Hub capture, at 0.015 m/s², so the burn lasts 20 minutes of game time. **Afterburner** gives 11.8 m/s at 0.147 m/s², which is 10× faster. Pick your poison.
- A **stock Sparrow with tank1 and tow2** has 3.6 m/s with a 300 t rock, at 0.023 m/s². The Dinky can drag a mountain from the inner ring to the Hub (2.60 m/s) in a 113 s burn. That moment should be in a trailer.

### 2.6 Shop compare rows (econ `MET`)

Add these rows to the before → after table on every ship card:

| row | value |
|---|---|
| TOW IMPULSE | ve × fuel t, in kN·s |
| Δv WITH ROCK | Δv with a rock of the current tow rating, or with 300 t if there is no tow gear |
| TOW RATING | tonnes |
| SIDE ACCEL | m/s² |
| JET POWER | ½ · T · ve · ISP_SCALE (real-equivalent, matches the Isp row), in MW or GW, for nuclear, fusion and ion engines |
| LENGTH | metres, on frame cards |

---

## 3. Hauling whole asteroids (new `haul.js`, owner: ship)

### 3.1 The loop

1. Fly up to a rock and press **G**. A harpoon (or hook, claw or the Big Hug) latches on.
2. Burn. The rope tugs the rock along with honest impulses.
3. Optionally press **B** to crack it into pieces you can actually move.
4. Coast to a buyer and press **F** within 40 m below 1.5 m/s. The rock is crunched and you are paid its ore value.

Early on, that means a Kiwi-ring slushball worth $160. Late, it means a 27,000 t whale worth $54k.

### 3.2 Rock types

Types are deterministic from `hash(seed, rk.id, region)`, so a rock is always the same rock. Haul owns them.

| type | look | density t/m³ | $/t at the Hub | ore it holds | ore kg per tonne | crack Q J/kg | laser hardness | gem chance | max radius |
|---|---|---|---|---|---|---|---|---|---|
| `gravel` | lilac grey | 1.9 | 2 | iron | 1.25 | 20 | 2.2 | 6% salt | none |
| `slush` | pale blue, white specks | 1.2 | 4 | ice | 5.0 | 15 | 1.4 | 10% amber | none |
| `clank` | steel, rust dots, glint | 4.0 | 12 | nickel | 3.75 | 150 | 2.8 | 12% opal | 6 m |
| `sparkle` | lavender with twinkles | 3.0 | 30 | platinum | 1.67 | 80 | 3.6 | 25% voidopal | 4 m |

- **Ore kg per tonne** is `$/t ÷ ore item price` (iron $1.6/kg, ice $0.8, nickel $3.2, platinum $18). Each rock stores **`oreKg = M × orePerT`**. That budget **is** its value. Lasering it, cracking it and selling it whole all draw on the same budget, so nothing mints money.
- Rocks bigger than the type's max radius roll gravel instead.

**Region mixes** (percent gravel / slush / clank / sparkle):

| region | mix |
|---|---|
| Mochi inner ring | 62 / 28 / 8 / 2 |
| Mochi outer ring | 55 / 30 / 12 / 3 |
| Kiwi ring | 30 / 60 / 8 / 2 |
| Potato ring | 60 / 10 / 25 / 5 |
| Inner swarms and the inner stream | 50 / 15 / 25 / 10 |
| Outer swarms and the outer stream | 55 / 35 / 8 / 2 |

**Mass and value at the Hub, by drawn radius:**

| r m | gravel t | gravel $ | slush t | slush $ | clank t | clank $ | sparkle t | sparkle $ |
|---|---|---|---|---|---|---|---|---|
| 1.5 | 27 | 54 | 17 | 68 | 57 | 679 | 42 | 1,272 |
| 2 | 64 | 127 | 40 | 161 | 134 | 1,608 | 101 | 3,016 |
| 3 | 215 | 430 | 136 | 543 | 452 | 5,429 | 339 | 10,179 |
| 4 | 509 | 1,019 | 322 | 1,287 | 1,072 | 12,868 | 804 | 24,127 |
| 6 | 1,719 | 3,438 | 1,086 | 4,343 | 3,619 | 43,429 | | |
| 10 | 7,959 | 15,917 | 5,027 | 20,106 | | | | |
| 15 | 26,861 | 53,721 | 16,965 | 67,858 | | | | |

**The biggest rock each tow tier can take:**

| tow tier | rating | gravel | slush | clank | sparkle |
|---|---|---|---|---|---|
| tow1 | 80 t | r ≤ 2.2 | r ≤ 2.5 | r ≤ 1.7 | r ≤ 1.9 |
| tow2 | 800 t | r ≤ 4.6 | r ≤ 5.4 | r ≤ 3.6 | r ≤ 4.0 |
| tow3 | 6,000 t | r ≤ 9.1 | r ≤ 10.6 | r ≤ 7.1 | r ≤ 7.8 |
| tow4 | 40,000 t | r ≤ 17.1 | r ≤ 20.0 | r ≤ 13.4 | r ≤ 14.7 |

**Seeing the type:**

- Your eyes show a rock's type within 60 m.
- `scanner1` shows it within 300 m.
- `scanner2` shows it for everything on screen and marks rocks that hold a gem with a 💎?.
- Grappling a rock always reveals its type, mass and value. The value is shown in the tow HUD.

### 3.3 Tow gear (new `haul` shop tab)

| id | name | rating t | cable m | reel m/s | mass t | needs frame | price | desc |
|---|---|---|---|---|---|---|---|---|
| `tow1` | Tow hook | 80 | 25 | 0.6 | 0.04 | any | $450 | "A hook on a rope. Humanity's oldest towing technology, now in space." |
| `tow2` | Harpoon winch | 800 | 40 | 1.0 | 0.15 | any | $2,000 | "Fires a harpoon, reels a boulder. Whales not included." |
| `tow3` | Tug claw | 6,000 | 60 | 1.5 | 0.8 | Hauler+ (mount 3) | $7,500 | "Three fingers, zero chill." |
| `tow4` | Big Hug | 40,000 | 90 | 2.5 | 3.0 | Leviathan (mount 5) | $22,000 | "Two enormous arms. It just wants to hold something." |

### 3.4 Grapple and rope physics

**Controls** (ship mode only, `g.mode === 'ship'`):

- **G** grapples or releases. It auto-aims at the nearest rock (rail or free) inside a **±40° cone off the nose**, within `cableLen + rk.r + S.radius`.
  - If the rock is over the rating, it toasts `TOO BIG: 1,719 t > 800 t. CRACK IT (B) OR UPGRADE THE WINCH`.
  - If the relative speed is over **4 m/s**, it toasts `TOO FAST TO LATCH: 5.2 m/s (< 4)`.
  - A latch is a 0.3 s harpoon flight, then `CLUNK!` popup, `HOOKED: GRAVEL 509 t ($1,019)` toast and a log line.
- **Q** reels in at `S.reelV` m/s, down to a minimum length of `rk.r + S.radius + 0.5`.
- **Z** pays out at `S.reelV` m/s, up to `S.cableLen`.
- On a latch, the rail rock becomes a **free rock**: `rk.gone = true`, and a free copy is made at its exact `World.rockState` position and velocity, keeping `rk.id`.

**The rope** runs in `haul.step(h)` after Physics.step and the ship contacts. The core already calls module `step` hooks inside the physics loop. Rope state is `tow = { id, len, J }`.

```js
// ---------------- rope: inextensible, pull only, ship CoM <-> rock centre ----------------
const sh = g.sh, rk = freeById(g, tow.id), mS = shipMass(g), mR = rk.m;
const dx = rk.x - sh.x, dy = rk.y - sh.y, d = Math.hypot(dx, dy), nx = dx / d, ny = dy / d;
tow.J = 0;
if (d > tow.len) {
  const mu = mS * mR / (mS + mR), vSep = (rk.vx - sh.vx) * nx + (rk.vy - sh.vy) * ny;   // > 0: separating
  if (vSep > 0) {
    tow.J = (1 + ROPE_REST) * mu * vSep;                                               // ROPE_REST = 0.1
    sh.vx += tow.J / mS * nx; sh.vy += tow.J / mS * ny;
    rk.vx -= tow.J / mR * nx; rk.vy -= tow.J / mR * ny;
  }
  const over = d - tow.len;                                                             // position projection, CoM kept
  sh.x += over * mR / (mS + mR) * nx; sh.y += over * mR / (mS + mR) * ny;
  rk.x -= over * mS / (mS + mR) * nx; rk.y -= over * mS / (mS + mR) * ny;
}
// Game.log only on state changes (latch, snap taut > 20 kN, release), never per step
```

- `shipMass(g)` is `Physics.mass(g.sh, g.S)` in tonnes; rock mass is also in tonnes. If the ship is **landed or docked**, treat it as infinitely heavy: the rock takes the whole impulse and the ship does not move. The rope never yanks a ship off a pad or a dock.
- Momentum and the centre of mass are conserved exactly. The test checks this (§13).
- **Nose contact pushes.** If `d < rk.r + S.radius`, push apart mass-weighted and remove the approaching velocity with restitution 0.1. That is how you shove a rock, and why the Hauler has a bumper. A towed rock never hurts the ship below 2 m/s relative. Above 2 m/s, `hurtShip(min(45, S.bumpDamage × (v − 2)))`.
- **Tension readout:** `tension kN = tow.J / h`, smoothed over 0.25 s. The HUD shows it. *(stretch, contract §10: the cable flashes white above 20 kN.)*
- Releasing (G again, death, docking anywhere that does not buy rocks, or a planted charge) leaves the rock as a free rock with its current velocity.

**Flying with a rock:**

- **Δv HUD row:** `Δv W/ ROCK 23.9 m/s` = `ve ln((m + M) / (m + M − fuel))`. The normal Δv row stays.
- **Warp:**
  - Coasting while towing caps at **64x** (`haul.warpLimit`).
  - A main-engine burn may warp up to `S.warpBurnMax` (16x) **when the whole system's acceleration is under 0.3 m/s²**. This needs one core change, a new **`burnWarp`** hook (§12, ship). Without it, a 20-minute whale burn would play at 1x.
  - Side pods and dashes still cap at 1x.
- **Prediction:** the ship's predicted path stays ballistic and is right, because ship and rock coast together. *(stretch: haul draws the released rock's own 60 s ghost trail.)*
- **Turning** uses the ship's RCS alone. The rope is at the CoM, so the rock does not change how you turn. It only changes how you translate. This is honest.

### 3.5 Cracking: charges

Charges are **consumables** that econ sells like Orion pulses (a count, a max, a mass each). They go in the **haul** tab. **B** in ship mode plants the **smallest charge you own that cracks** the towed rock, or the nearest rock within 10 m of the hull. If none of yours will do, it toasts `NEED A SPLITTER: 1,072 t CLANK NEEDS 161 MJ`.

| id | name | TNT kg | energy MJ | price | max carried | mass t | cracks up to (gravel / slush / clank / sparkle) |
|---|---|---|---|---|---|---|---|
| `crack1` | Cracker | 5 | 20.9 | $60 | 6 | 0.008 | 1,046 t (r 5.1) / 1,395 t / 139 t / 262 t |
| `crack2` | Splitter | 50 | 209 | $350 | 4 | 0.06 | 10,460 t (r 11.0) / 13,947 t / 1,395 t / 2,615 t |
| `crack3` | Rock Opera | 500 | 2,092 | $2,000 | 2 | 0.6 | 104,600 t / 139,467 t / 13,947 t / 26,150 t |

**Sequence:**

1. B plants the charge: a puck sticks on the rock's surface facing you.
2. The rope auto-releases (`ROPE CUT: GET CLEAR`).
3. A 5 s fuse runs with a `5…4…3` popup.
4. Boom.

**Blast:**

- Radius `R_b = rk.r + 4 × kg^(1/3)` m (Cracker on an r 4 rock: 10.8 m; Rock Opera on r 15: 46.7 m).
- The ship takes `hurtShip(min(60, 12 × kg^(1/3) × (1 − d / R_b)))` and is pushed by `impulse` at 0.3 × the same number in m/s (honest-ish, and small).
- `Haul.blast(g, x, y, E)` is the shared entry point, which suit bombs use too.

**Crack model:** the rock cracks when **E ≥ Q·M**. If E < Q·M, nothing breaks: popup `TINK.`, and the charge is spent.

**Fragments:**

- **Count** = `clamp(2 + floor(log2(E / (Q·M))), 2, 5)`.
- **Masses** are split by weights `0.5 + rand()`, each at least 15% of the total.
- **Radius** of each piece = `r × (m_i / M)^(1/3)`.
- **Directions** are evenly spaced (2πi/n plus one shared random rotation), so Σd̂ = 0.
- **Velocity:** each piece gets `u_i = s × d̂_i / m_i`, with **s = √(2 × 0.03 E / Σ(1 / m_i))`**. Kinetic energy is then exactly 3% of E and net momentum exactly zero. Add the parent's velocity. Remove any float residue by subtracting the mass-weighted mean.

Fragment speed for two equal halves:

| charge | 50 t | 500 t | 5,000 t | 27,000 t |
|---|---|---|---|---|
| Cracker | 5.0 m/s | 1.58 m/s | 0.50 m/s | 0.22 m/s |
| Splitter | **15.8 m/s** (overkill: duck) | 5.0 m/s | 1.58 m/s | 0.68 m/s |
| Rock Opera | 50 m/s | 15.8 m/s | 5.0 m/s | 2.16 m/s |

**Value bookkeeping:**

- **5%** of the parent's oreKg pops out as **seam ore** pickups (5 kg chunks of its ore, at most 6 pickups), plus **the gem**, if it had one, at full price. The gem is the bonus for cracking.
- The fragments share the remaining 95% of oreKg in proportion to mass.
- Any fragment under **r 1 m** becomes ore pickups instead of a rock, again capped at 6 pickups. Value over that cap is folded into the largest fragment.

### 3.6 Free rocks (haul simulates them)

- A free rock is `{ id, type, r, m, oreKg, gem, x, y, vx, vy, ang, spin, out, tone }`. It reuses World's `outline` shape (`out`) and `tone`, so a grappled rock keeps its look. Fragments get ids from **100000** up (`nextId`).
- **Integration:** leapfrog under `World.gravity(w, x, y, t)` every haul step. At most **32** free rocks; past that, the smallest crumbles into pickups.
- **Body hit:**
  - The rock crumbles. Make a crater of radius `min(6, 0.6 × r)` with `Game.dig(g, b, x, y, R, 99)` (no collect).
  - 10% of its value drops as pickups at the rim. The rest is in the ground.
  - Popup `KA-THUMP!`.
  - Inside Ember's kill radius: gone, `SIZZLE!`. Past 60 km from Ember: gone, with log `rock 4123 left the pocket universe`.
- **Ship contact** (rocks other than the towed one): the same response as rail rocks, with restitution `S.bounce` and damage `S.bumpDamage × v` capped at 45.
- **Astronaut contact** over 3 m/s: `hurtAstro(min(40, 6 × v))`.
- Free-free and free-rail collisions are **ignored in MVP**; rocks pass through each other. Bouncing them is a stretch goal.
- **Step size:** the core's `stepSize` and rock TTC must see free rocks. `Haul.free(g)` returns the live list, and ship adds it to `gapT` next to the rail rocks (§12).

### 3.7 Selling, and the Crusher

**Sell points:** `Haul.sellPoints(g)` → `[{ id, name, x, y, vx, vy, r, mult(type) }]`, built from `Stations.list(g)` when present (positions from `st.state(g.t)` → `[x, y, vx, vy]`; the multipliers below live in haul's own `BUY` table keyed by station id, so stations.js needs no change), plus the Crusher.

| buyer | gravel | slush | clank | sparkle | notes |
|---|---|---|---|---|---|
| Mochi Hub (`hub`) | 1.0 | 1.0 | 1.0 | 1.0 | inside Mochi's Hill sphere: about 7 m/s of capture from the lanes |
| Kiwi Outpost (`outpost`) | 0.7 | **1.1** | 0.7 | 0.7 | Granny Fern loves ice |
| Rust's (`rusts`) | 0.5 | 0.5 | **1.15** | **1.15** | no questions asked about where the platinum came from |
| **The Crusher** (`crusher`) | 0.8 | 0.8 | 0.8 | 0.8 | on the Mochi lane; no capture burn |

- **Payout** = `oreKg × ITEMS[ore].price × mult + gemValue / 2`. A gem left inside is worth half, because the buyer has to dig it out.
- **F** interaction: `Sell 509 t gravel to Mochi Hub for $1,019`, shown within `40 + rk.r` m of the buyer and under 1.5 m/s relative. While towing it gets `dist: 0`, so it beats `Dock`. After the sale, F docks.
- **Docking while towing** sells automatically at a buyer. Anywhere else, the rope is released. Haul detects the dock in its own `frame` (status turns `docked` while `tow` is set); stations.js is untouched.
- The sale triggers: `CRUNCH!` popup, a dust `burst`, the rock is removed, `stats.sold += $`, and a log line.

**The Crusher** (haul owns its position and drawing; aliens own its keeper):

- **Position:** a heliocentric rail with a = 30,000 m and phase **+0.30** rad. That puts it 9 km ahead of Mochi and ~3.6 km from both Pretzel (+0.18) and Nugget (+0.42). Its radius is 25 m.
- **Why it exists:** a Hauler with 2,000 t has 6.2 m/s. It can make the Crumbs → Mochi lane (1.80) plus phasing, but never the 7 m/s capture into the Hub.
- **MVP:** F `Sell rock` only. No docking, no shop.
- **Nav target:** id `crusher`, with a Tab-cycle entry.
- *(stretch, contract §10)* **Shop:** `Econ.openShop(g, CRUSHER)` with tabs `['services', 'sell', 'haul']`, fuelMult 1.2, no fusion fuel. **Keeper:** an Oggle, **Gristle** (name reserved), who chews thoughtfully; aliens would own the lines.

### 3.8 Lasering rocks (ship laser and suit laser)

`Haul.rayRocks(g, x0, y0, x1, y1)` → `{ rock, x, y, d } | null` finds the nearest rail or free rock hit along a segment.

`Haul.chip(g, rock, power, dt, toward)`:

- Removes `power × 4 / hardness × dt` kg of ore from `oreKg`.
- Spawns 5 kg chunks of the ore that fly `toward` the astronaut, the same way surface digging does.
- When `oreKg` hits 0, the rock shows `TAILINGS` and is worth $0, but you can still tow and crush it.
- A rail rock that you chip becomes free only if you grapple it. Chipping alone leaves it on its rail; its oreKg is stored in haul's state under its id.

Chip rates in kg/s, with the dollars per second in brackets. This is the honest reason to haul, since the hold is small and the rock is not:

| laser power | gravel | slush | clank | sparkle |
|---|---|---|---|---|
| 1.0 (stock) | 1.8 ($2.9) | 2.9 ($2.3) | 1.4 ($4.6) | 1.1 ($20) |
| 1.8 (laser1) | 3.3 ($5.2) | 5.1 ($4.1) | 2.6 ($8.2) | 2.0 ($36) |
| 3.0 (laser2) | 5.5 ($8.7) | 8.6 ($6.9) | 4.3 ($13.7) | 3.3 ($60) |
| 4.5 (laser3) | 8.2 ($13.1) | 12.9 ($10.3) | 6.4 ($20.6) | 5.0 ($90) |
| 6.5 (laser4) | 11.8 ($18.9) | 18.6 ($14.9) | 9.3 ($29.7) | 7.2 ($130) |

These rates line up with what I measured in the running game. The stock laser mined ~7 kg/s in a Mochi ice vein and 2.7-5 kg/s in iron; that is surface digging with collection, so it is generous next to these rock chip rates, which is fine.

### 3.9 Supply check: will the rocks run out?

I estimated the expected value of every rock in the system from the world's size law (`size = min + (max − min) × rand²`) and the region mixes above:

| region | rocks | mean $ per rock | total $ | rocks ≤ 80 t (mean $) | rocks ≤ 800 t (mean $) |
|---|---|---|---|---|---|
| Mochi inner ring | 170 | 4,460 | 758k | ~2 ($316) | ~100 ($1,145) |
| Kiwi ring | 18 | 696 | 13k | ~10 ($166) | ~18 ($624) |
| Potato ring | 40 | 4,957 | 198k | ~6 ($154) | ~28 ($1,502) |
| Mochi outer ring | 60 | 8,000 | 480k | none | ~28 ($1,667) |
| The Crumbs | 90 | 14,424 | 1.30M | ~8 ($162) | ~39 ($1,840) |
| all 13 regions | 1,058 | | **~$8.1M** | | |

- The whole catalog is $364k. Rocks are plentiful, and **finite is fine**.
- **The tow hook is a Kiwi-ring tool** (about 10 slushballs worth ~$166 each), plus Crackers on Mochi-ring gravel.
- The **harpoon** opens about 100 inner-ring rocks worth ~$1.1k each. That is the Mule's bread and butter.
- **Clank and sparkle are the jackpots**: 7-30% of the towable rocks per region, worth $3k-43k each.

---

## 4. The suit line

Suit items have **no ship mass**; they ride on the astronaut. Astronaut mass is `85 + S.suitMass + pack load` kg, and it matters only for tether yanks, recoil and boarding momentum. Jetpack accelerations are quoted per astronaut, since the exo frames carry their own lift.

### 4.1 Suit tiers: from padded to exoskeleton

These extend the existing `suit` line, where `suit1` and `suit2` already exist at $250 and $800. **`S.suitTier`** is 0-4. Lore.md §11 draws each tier; this doc only gives the numbers.

| id | name | hp | armor | suit mass kg | walk × | jump × | carry + kg | fallSafe m/s | price |
|---|---|---|---|---|---|---|---|---|---|
| none | stock | 100 | 0 | 0 | 1 | 1 | 0 | 8 | none |
| `suit1` | Padded suit | 150 | 0 | +5 | 1 | 1 | 0 | 8 | $250 |
| `suit2` | Armored suit | 220 | 0.10 | +20 | 1 | 1 | 0 | 9 | $800 |
| **`suit3`** | **Strider** exo frame | 300 | 0.15 | +60 | 1.25 | 1.2 | +40 | 11 | $3,500 |
| **`suit4`** | **Mecha-Pip** power exo | 420 | 0.25 | +140 | 1.4 | 1.35 | +90 | 15 | $9,000 |

- **Armor:** `hurtAstro` multiplies damage by `(1 − S.suitArmor)`. This is a two-line core change (§12, ship).
- **walk×** multiplies the walk speed but stays under the existing `walkMax` physics cap (0.6 × local circular speed): 14.7 m/s on Mochi, 3.35 on Glimmer, 1.09 on Seed. **jump×** stays under `JUMP_ESC × escape`.
- **Carry** adds to `S.packCap`.
- **fallSafe** replaces `FALL_HURT` (8 m/s).
- Strider desc: "Struts, servos and a fresh sense of purpose." Mecha-Pip desc: "A two-metre robot suit with a tiny green face in the window. Hard landings say CLANK."
- Stretch: Mecha-Pip **ground-pound**. Press C in mid-air above 4 m/s downward to slam, which digs r 1.5 and does 40 damage in r 2.5.

### 4.2 Sprint (Shift on foot)

| id | name | speed × | price | desc |
|---|---|---|---|---|
| `sprint1` | Zoom sneakers | 1.6 | $250 | "Velcro. Rocket-grade velcro." |
| `sprint2` | Rocket skates | 2.2 | $900 | "Technically illegal on Mochi's pavements. Mochi has no pavements." |

- `S.sprint` is the multiplier: 1 = none, 1.6 or 2.2. Sprint stacks with walk× and is still capped by `walkMax`, so on Seed sprinting is a brisk 1.09 m/s. That cap is the honest joke.
- Sprinting uses **O2 at ×1.5**, which is honest exertion. There is no stamina bar.
- Looks are in lore.md §11: stripes, speed lines, and the antenna streams back.

### 4.3 Dive roll (C)

| id | name | distance m | duration s | i-frames s | cooldown s | in the air | price |
|---|---|---|---|---|---|---|---|
| `roll1` | Tumble pads | 3.0 | 0.45 | 0.30 | 1.2 | spin only | $400 |
| `roll2` | Gyro roll | 4.5 | 0.40 | 0.35 | 0.8 | **air dash 3 m/s** | $1,400 |

- **Direction:** the current walk input, or facing when there is none. Roll speed is `rollDist / rollT` (6.7 or 11.25 m/s), clamped by `walkMax` like walking.
- **i-frames:** set `g.astro.invUntil = g.t + S.rollIframes`. `hurtAstro` ignores damage while `g.t < invUntil` and pops `MISS!`. This is the core change in §12.
- **In the air or in space:** roll1 is a cosmetic tumble. Roll2 adds a 3 m/s impulse along the input, **paid from jet fuel** (3 m/s ÷ S.jet seconds), so it is honest and capped by the jetpack.
- **Bugs:** bites do 7-10 damage with a 1.5-1.8 s cooldown, so a 0.3 s i-frame window dodges one bite if timed on its wind-up. That is the combat skill being taught.

### 4.4 Bombs (right mouse, or B on foot)

The new line is `bomb`, in the suit tab. **Bombs are free**: you own N charges, and **each refills on its own cooldown**. The pucks on the bandolier grey out and come back one by one (lore.md §11).

| id | name | charges | damage | blast r m | dig r m | TNT kg (E) | cooldown s | fuse s | throw m/s | sticky | price |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `bomb1` | Pop Rocks | 2 | 30 | 1.8 | 1.6 | 0.12 (0.50 MJ) | 8 | 1.8 | 6 | no | $600 |
| `bomb2` | Boom Berries | 3 | 50 | 2.4 | **2.3** | 0.36 (1.51 MJ) | 6 | 1.6 | 8 | no | $1,800 |
| `bomb3` | Thunder Pucks | 4 | 80 | 3.2 | **3.4** | 1.2 (5.02 MJ) | 4.5 | 1.4 | 10 | **yes** | $4,500 |

**Crater size is honest:** dig radius ∝ E^⅓ (crater volume ∝ energy), so 1.6 m at 0.50 MJ gives 2.3 m at 1.51 MJ and 3.4 m at 5.02 MJ. *(Integrator fix: the first draft had 2.9 / 3.8 m, which dug 6× the volume for 3× the energy.)*

**Throwing:**

- Hold RMB to show a dotted ballistic arc for the length of the fuse, with a landing ring. Release to throw. **B** throws instantly at the cursor.
- **Velocity** = astronaut velocity + `min(S.bombV, 0.9 × local escape)` along the aim. On Seed that cap is 2.3 m/s and on Glimmer 7.1 m/s, so nobody puts a bomb into orbit by accident.
- **Recoil is honest.** The astronaut gets `−m_bomb × v / m_astro`, with bomb masses of 0.5, 1 and 2 kg. In space a Thunder Puck pushes a stock astronaut back 0.24 m/s.

**Flight:**

- Leapfrog under gravity, bouncing off terrain with restitution 0.3 and friction 0.5.
- Bomb3 **sticks** to the first terrain or rock it touches, and rides along. *(stretch: sticking to bugs and pirates.)*
- The fuse starts on the throw.

**Explosion:**

- `Game.dealDamage` to non-player targets in `bombR`, with linear falloff to half at the edge.
- **Self-damage 0.5×**, the ship **0.25×**. NPCs are never targets (lore.md).
- `Game.dig(g, b, x, y, S.bombDig, 6, { collect: true, toward: [A.x, A.y] })`: craters drop ore that flies to you.
- `Haul.blast(g, x, y, S.bombE)`, so bombs crack rocks too. Pop Rocks crack gravel up to 25 t (r 1.5), Thunder Pucks up to 251 t (r 3.2).
- Popups: `POP!`, `BOOM!` and `KRA-KOOM!`.

### 4.5 More pack, air, jet and laser (tier 3 or 4 on existing lines)

| id | line | name | sets | price | desc |
|---|---|---|---|---|---|
| `pack3` | pack | Kangaroo pouch | packCap 160 | $1,800 | "Front-mounted. Bounces when you walk. Dignity sold separately." |
| `o2c` | o2 | Algae lung | o2 1,200 | $1,800 | "A little green friend who breathes for you. Name it." |
| `jet3` | jet | Comet pack | jet 7.0, jetFuel 18 | $2,400 | "126 m/s of Δv on your back. Please be careful." |
| `laser4` | laser | Mk5 Sunbeam | laserPower 6.5, laserRange 16, laserDps 85 | $7,500 | "It's a mining laser. It's also, technically, a death ray. Mostly mining." |

**Jetpack Δv** (accel × burn seconds): stock 15, jet1 32, jet2 66, jet3 **126 m/s**. That is enough to leave Seed, Glimmer or Pretzel on foot. It is fine, because the tether or the ship catches you (§5).

### 4.6 Tethers (Q winches)

| id | name | length m | winch m/s | price | desc |
|---|---|---|---|---|---|
| none | stock tether | 30 | 1.0 | none | |
| `tether1` | Long leash | 60 | 1.5 | $300 | "Twice the rope, twice the confidence." |
| `tether2` | Bungee pro | 100 | 2.5 | $900 | "Not actually bouncy. We tested. Twice." |
| `tether3` | Space yo-yo | 160 | 4.0 | $2,200 | "Walk the dog. The dog is you." |

### 4.7 Universal Translator

The ids and prices come exactly from [lore.md §5](lore.md):

- `xlate1` **Pocket Phrasebook**, $400, `{ translator: 1 }`.
- `xlate2` **Universal Translator**, $1,800, `{ translator: 2 }`.
- Both are in the suit tab at Mochi Hub and Kiwi Outpost. `xlate3` Bug Whisperer ($3,000) is a stretch tier there.

Everything about what you see when you put it on belongs to lore.md: the reveal, glyph morphing, toasts and the dev **L** key. This doc only reserves the ids, the line id `xlate` and the S field `translator`.

---

## 5. Tethered EVA, anytime

> Avi: "Allow EVAs at any time, where you exit the vehicle on a tether if you are not landed."

### 5.1 Rules

- **E** steps out whenever `g.mode === 'ship'`, the ship is **flying or docked**, the main engine is not firing, |ω| < 0.5 rad/s, there is no UI open and the ship is not dead. **Landed** works as today, untethered on foot.
  - Refusals are toasts: `STOP SPINNING FIRST (S)` and `CUT THE ENGINE FIRST`.
- **Exit:**
  - The astronaut appears at `ship + (S.radius + 0.8) × n̂`, where n̂ points away from the nearest body. You exit on the outboard side, so you never pop out into a planet.
  - Their velocity is the ship's plus **0.4 m/s** along n̂.
  - Popup `WHEEE!`, and the log line `EVA: tethered spacewalk from Pack Mule (60 m line)`.
- **The ship while you're out:**
  - `eva.shipCtrl` zeroes thrust and sets `kill = true`, which holds attitude.
  - The ship coasts on real physics, and the rope keeps towing any rock. A docked ship stays docked.
  - If the ship's predicted surface impact is under 20 s, warn `SHIP ON COLLISION COURSE: 14 s`.
- **The tether:**
  - The line free-spools from the reel up to `S.tetherLen` with no tension.
  - Past `tetherLen` it is **inextensible**, and solved with the same code as the tow rope (§3.4) but with restitution 0.15. The masses are the astronaut (85 kg + `suitMass` + pack load: 0.085-0.475 t) and the ship.
  - Yanks are honest. A 3 m/s yank moves the stock ship 0.10 m/s (0.50 m/s for a Mecha-Pip carrying a full 250 kg pouch: 0.475 × 3 / 2.875), the Mule 0.025-0.14 m/s, and the Beast 0.002-0.011 m/s.
- **Q held** winches in at `S.reelA` m/s by shortening the line. Ship and astronaut pull together, so momentum is conserved. **Within `BOARD_R` of the hull, E boards.**
  - On boarding, the astronaut's momentum transfers to the ship: Δv = m_A (v_A − v_S) / (m_S + m_A).
- **No governor, FAR_WARN, FAR_MAX or adrift recall while tethered**: the tether is the leash.
- **The tether never breaks.** That makes it dummy-proof. Snagging on terrain is ignored, and the line is drawn straight through scenery.
- **O2 runs out:** the winch reels you in automatically at `S.reelA` (`O2 OUT: AUTO-REEL`), and the HP drain is unchanged from today.
- **Ship dies while you're out:** the tether is cut, and the existing untethered adrift → recall → tow-fee flow takes over.

### 5.2 Moving

- **In space** (no surface within 1 m), **WASD jets in screen directions**: up, left, down, right. The camera uses rot 0 in space, so screen equals world. Jet fuel comes from `S.jetFuel` seconds.
- **Touching a body:** you land, and the existing walking takes over (governor caps, jumping, falls). The tether stays attached, and a tight tether drags you honestly along the ground.
- **Touching a rock:** in MVP it is an obstacle. You bounce with restitution 0.3 and take `hurtAstro(min(40, 6 × v))` above 3 m/s. Magnetic boots for walking on rocks are a stretch goal.
- **Ember:** `SIZZLE` kills the astronaut. Do not jet at the star.

### 5.3 Tools in space

- **Laser:** the mouse aims as today. The beam hits terrain (existing code), then `Haul.rayRocks` (chips via `Haul.chip`), then combat targets (existing `dealDamage`). Chunks fly to you, into the pack.
- **Bombs:** throwing, recoil and sticky pucks work as in §4.4. A sticky puck on a rail rock cracks it via `Haul.blast`, and the fragments become free rocks.
- **Dive roll in space:** roll1 is a tumble, roll2 the 3 m/s air dash, paid from jet fuel.

### 5.4 Warp, camera, HUD

- **Warp:** 1x while out (`eva.warpLimit`, as today). 4x is a stretch goal once someone has played it.
- **Camera:** the centre is the midpoint of astronaut and ship, with `zoom = clamp(0.38 × min(W, H) / max(20, d + 2 × S.radius), 3, 32)` px/m. At 160 m that frames both.
- **HUD (SUIT panel):** `TETHER 23 / 60 m`, `JET`, `O2` and `SUIT HP` bars, `BOMBS ●●○` and `ROLL` ready pip.

---

## 6. Keys: every binding, no collisions

| key | in the ship (flying or docked) | on foot or tethered | dev only | owner |
|---|---|---|---|---|
| W / A / S / D | throttle / rotate / kill rotation | jump-walk / walk; tethered in space: jet up/left/down/right | | core / eva |
| Shift | fine throttle (with W) | **sprint** | | core / **eva** |
| ← / → | **side pods** if `side1+`, else RCS translate (as today) | walk | | **ship** |
| double-tap ← / → | **dash** (side2+) | | | **ship** |
| Shift + ← / → | RCS translate (the old nudge) | | | **ship** |
| ↑ / ↓ | RCS forward / back | jump / crouch (as today) | | core |
| E | **step out** (tethered unless landed) | board | | eva |
| F | interact: dock, shop, salvage, **sell rock**, Crusher | interact, talk | | core and modules |
| **G** | **grapple / release** | | | haul |
| **Q** | **reel tow in** | **winch tether in** | | haul / eva |
| **Z** | **pay tow out** | | | haul |
| **B** | **plant crack charge** | **throw bomb** | | haul / eva |
| RMB | | **hold to aim the bomb arc, release to throw** (eva polls `inp.mouse.right` in `frame`: main.js never sends button 2 to `onMouse`) | | eva |
| 1-4 | | Clunk Lift stops, only while standing on the lift deck (mochi.md §5) | | mochi |
| **C** | | **dive roll** (Mecha-Pip in mid-air: ground-pound, stretch) | | eva |
| Space | guns | jump | | combat / eva |
| N | Orion pulse | | | econ |
| X | ion drive on/off | | | core |
| H | hail station | | | stations |
| Tab | cycle nav target | | | core |
| , / . | warp down / up | | | core |
| M | map | map | | look |
| + / − | zoom | zoom | | look |
| P / Esc | pause | pause | | core |
| R | (as today) | | | core |
| K | | | +$5,000 | econ |
| T | | | cycle spawn point | core |
| J | | | combat dev | combat |
| L | | | cycle translator (lore.md) | aliens |
| **O** | | | **open the Debug Duck shop anywhere** | econ |
| **U** | | | **instant top-up** | econ |
| **I** | | | **toggle ∞ money** | econ |

- The same letter does the same verb in both modes: **B is boom** and **Q is reel**. The module checks `g.mode`.
- **Still free:** V, Y and digits 5-9. The mouse wheel is zoom (main.js) and 1-4 belong to the Clunk Lift. Keep V for a stretch photo mode. The full mode-aware table is [V4-CONTRACT.md §4](V4-CONTRACT.md).

---

## 7. Dev mode

Dev mode is enabled with `?dev=1` or `#dev`, as today. It still starts with $50k and never saves.

| feature | how | owner |
|---|---|---|
| **∞ money** | **On by default in dev.** `m.inf = true`, and econ's `frame` sets `g.money = Math.max(g.money, DEV_MONEY)` with `DEV_MONEY = 1e9`. Buys subtract normally; the pin refills, so `canBuy` never says `broke` by construction (the whole catalog is $364k). The HUD MONEY row (look, via `Econ.isInf(g)`) and the shop header show **∞**. **I** toggles it, and `?inf=0` starts with it off, for testing `broke`. | econ (look draws ∞) |
| **Shop anywhere** | **O** opens `DEV_SHOP` in any mode (flying, landed, on foot or tethered). It is `{ id: 'dev', name: "Debug Duck's Everything Emporium", kind: 'dev', keeper: 'Debug Duck', tabs: [...ALL_TABS, 'haul', 'dev'], fuelMult: 0, repairMult: 0 }`. Frames and engines may be equipped here, since the Hub-only rule passes for `id === 'dev'`. | econ, shop |
| **Instant top-up** | **U** fills fuel, xenon, RCS, hull, O2, jet fuel and suit HP, refills bombs and charges, and resets the dash and roll cooldowns. Toast `DEV: TOPPED UP`. | econ (calls `EVA.topUp(g, true)` when eva is on) |
| **Dev tab** | Buttons: **Max everything** (`grantAll`: best frame, best engine, every line maxed, charges full), **Stock ship** (`resetStock`), presets **Dinky / First tow / Brick tug / Mule / Hauler / Barge / Beast / Suit max**, **Spawn rock ahead** (choose type gravel, slush, clank or sparkle and r 2, 4, 6, 10 or 15; calls `Haul.devRock(g, type, r)` 3·r + S.radius ahead of the nose, matching velocity), **Free charges** (max all), **Fill hold with ore**. | econ, shop; haul for `devRock` |
| **URL presets** | `?dev=1&build=dinky\|tow\|brick\|mule\|hauler\|barge\|beast&inf=0\|1`. main.js passes `{ build, inf }` in `Game.create` opts; game.js stores them on `g.opts`; econ's `ready` calls `applyBuild(g, g.opts.build)`. | look (main.js), ship (game.js), econ |
| Existing | K +$5,000, T cycle spawn, J combat, L translator | unchanged |

**Debug Duck** is the keeper: a yellow rubber duck with an ink outline and one white highlight. Its SVG portrait is drawn in shop.js for `kind === 'dev'`. Blurb: `"Explain your bug to me. Slowly. ...Quack."` This is rubber-duck debugging's patron saint, in space.

The existing test **`dev K adds $5000`** still passes, because K adds 5,000 on top of the ∞ pin and `Math.max` never lowers money.

---

## 8. Jobs (JOBS panel additions)

| id | owner | order | reward | text | done when |
|---|---|---|---|---|---|
| `spacewalk` | eva | **57** | $100 | Take a tethered spacewalk (E while flying) | a tethered EVA lasts 10 s |
| `bomb` | eva | 68 | $150 | Blow a crater with a suit bomb | a bomb digs at least 1 cell |
| `haul` | haul | 77 | $250 | Tow a whole rock to a buyer and sell it | first rock sale |
| `crack` | haul | 78 | $200 | Crack a rock with a charge | first successful crack |
| `frame` | econ | 92 | $500 | Upgrade to a bigger frame | equip any frame other than the Prospector |
| `whale` | haul | 97 | $5,000 | Sell a rock over 20,000 t | a sale with M ≥ 20,000 t |
| `fusion` | econ | 98 | $2,000 | Fly on fusion | a main burn with pocketsun or sunflower |
| `tycoon` | econ | 100 | $1, framed | Bank $250,000 | money ≥ 250,000 (outside dev) |

The orders do not collide with today's jobs (10-99, including core `pretzel` at 55, which is why spacewalk moved to 57), lore's `meet` (33) or mochi's `downtown` (34). The tycoon reward is literally one dollar, plus a tiny golden rubber duck on the Leviathan's dashboard (look, stretch).

---

## 9. Prices and the progression curve

### 9.1 The canonical path (everything bought, nothing refunded)

| stage | buys | spend | cumulative | target play time | income while in this stage |
|---|---|---|---|---|---|
| Dinky | none | $0 | $0 (start with $300) | 0 | surface mining runs, ~$150-300 each, ~$2-3k/h |
| **First tow** | tow1, side1 | $800 | $800 | ~15 min | Kiwi slushballs, ~$166 each ($180 at Fern's), plus Crackers on Mochi-ring gravel: ~$4k/h |
| Harpoon Sparrow | tank1, tow2 | $2,450 | $3,250 | ~35 min | Sparrow drags 100-300 t from the inner ring to the Hub: ~$7k/h |
| **Mule** | mule, bulldog, cargo1, side2, rcs1 | $9,300 | **$12,550** | ~1.25 h | Mochi inner ring ≤ 800 t: median $554, mean $1.1k: ~$10-15k/h |
| **Hauler** | hauler, nervasama, tank2, cargo2, tow3, rcs2, hull1, armor1 | $37,550 | **$50,100** | ~2 h | outer ring and the Crumbs up to 6,000 t: mean $4.5-11k: ~$30-40k/h |
| **Barge** | barge, pocketsun, tank3, side3, hull2, armor2, tractor1 | $65,400 | **$115,500** | ~3 h | the whole belt at 4 km/s Δv; sparkle hunting: ~$60k/h |
| **Fusion Beast** | leviathan, sunflower, tow4, cargo3, hull3, tractor2, gun1-3 | $144,800 | **$260,300** | ~4 h | whales: 27 kt gravel $54k, 17 kt slush $68k |

- The **Beast set itself costs $145k** (frame plus engine $110k), which meets the "~$100k+ endgame" target. Everything along the way rolls the player's earnings back into a bigger ship.
- **Catalog totals:**
  - Ship: $313,900. That covers every frame, engine, ion drive and line tier, plus the turret and scanners.
  - Suit: $50,250.
  - **All: $364,150**, with consumables extra.
- **Knobs, if pacing is off:** rock `$/t` per type (§3.2) is the master income dial. Frame prices are the master spending dial. The tow-tier gates are the hard steps. Do **not** touch fuel $/t: a full Beast fill costs $11.5k on D-He3 and $4.1k on D-D, and that sting is part of the choice.

### 9.2 Full price list (new and changed only)

| tab | id | price |
|---|---|---|
| ship (frames) | mule / hauler / barge / leviathan | $2,500 / $8,000 / $18,000 / $40,000 |
| ship (engines) | bulldog / nervasama / pocketsun / sunflower | $5,000 / $18,000 / $38,000 / $70,000 |
| ship (ion, stretch) | chorus | $16,000 |
| ship | side1 / side2 / side3 | $350 / $1,200 / $3,500 |
| haul | tow1 / tow2 / tow3 / tow4 | $450 / $2,000 / $7,500 / $22,000 |
| haul (consumable) | crack1 / crack2 / crack3 | $60 / $350 / $2,000 each (Rust's ×0.8) |
| suit | suit3 / suit4 | $3,500 / $9,000 |
| suit | sprint1 / sprint2 | $250 / $900 |
| suit | roll1 / roll2 | $400 / $1,400 |
| suit | bomb1 / bomb2 / bomb3 | $600 / $1,800 / $4,500 |
| suit | tether1 / tether2 / tether3 | $300 / $900 / $2,200 |
| suit | pack3 / o2c / jet3 / laser4 | $1,800 / $1,800 / $2,400 / $7,500 |
| suit | xlate1 / xlate2 | $400 / $1,800 (lore.md) |
| fuel | dd / dhe3 / augment | $150 / $600 / $30 per t |

**Where each item is sold** (proposed; aliens owns the stations' `tabs`):

| shop | tabs |
|---|---|
| Mochi Hub | add `haul` to today's tabs |
| Kiwi Outpost | add `haul` |
| Rust's | add `haul` (charges at ×0.8) |
| The Crusher | none in MVP (F sells rocks); services, sell, haul as stretch |
| Pad depot | unchanged |

---

## 10. Ids, S-fields and save fields

### 10.1 Catalog groups (econ `CATALOG`)

- `group: 'frame'`: mule, hauler, barge, leviathan. Owned and equipped like engines; the Prospector is the stock frame.
- `group: 'engine'`: adds bulldog, nervasama, pocketsun, sunflower. Each has `mount` and an optional `thrustBy`.
- `group: 'ion'`: chorus (stretch).
- Lines:
  - `side` (ship tab)
  - `tow` (haul tab)
  - `sprint`, `roll`, `bomb`, `tether`, `xlate` (suit tab)
  - Extended lines: `suit` (+suit3, suit4), `pack` (+pack3), `o2` (+o2c), `jet` (+jet3), `laser` (+laser4)
- `group: 'charge'` (consumable, haul tab): crack1, crack2, crack3. State lives in `m.charges = { crack1: n, ... }`.
- `canBuy` reasons: `unknown | notsold | owned | locked | max | broke | **frame**`.

### 10.2 S fields (set in econ `stats()`, read by everyone)

| field | meaning | default |
|---|---|---|
| `frameId`, `frameName` | 'prospector', 'Prospector' | |
| `mount` | engine mount of the frame, 1-5 | 1 |
| `k` | part-mass and side-thrust scale | 1 |
| `turnMult` | multiplier already applied to rotAccel | 1 |
| `towTierMax` | highest tow tier the frame takes | 2 |
| `sideThrust` | kN, 0 = none | 0 |
| `sideVe` | m/s, `min(0.85 × ve, 900)` | |
| `dashBoost`, `dashT`, `dashCd` | ×, s, s | 0, 0.4, 0 |
| `towTier` | active tow tier after the frame derate, 0-4 | 0 |
| `towMax` | tonnes, 0 = no tow gear | 0 |
| `cableLen`, `reelV` | m, m/s | 0, 0 |
| `suitTier` | 0-4 | 0 |
| `suitArmor`, `suitMass` | fraction, kg | 0, 0 |
| `walkMult`, `jumpMult`, `fallSafe` | ×, ×, m/s | 1, 1, 8 |
| `sprint` | speed multiplier | 1 |
| `roll`, `rollDist`, `rollT`, `rollIframes`, `rollCd`, `rollAir` | tier, m, s, s, s, m/s | 0, 0, 0.45, 0, 1.2, 0 |
| `bombs` | max charges, 0 = none | 0 |
| `bombDmg`, `bombR`, `bombDig`, `bombCd`, `bombFuse`, `bombV`, `bombE`, `bombKg`, `bombSticky` | as §4.4 (E in J, bomb mass in kg for recoil) | 0, 0, 0, 8, 1.8, 6, 0, 0.5, 0 |
| `tetherLen`, `reelA` | m, m/s | 30, 1.0 |
| `translator` | 0-2 (lore.md) | 0 |

Every reader writes `g.S.x ?? default` with these defaults, so a `?mods=` run without econ behaves like stock (contract §3). The engine id stays `S.engine` and the fuel id `S.fuelId`. Existing fields keep their meaning: `thrust` now comes from `thrustBy` when the fuel has an override, and `dry`, `fuel`, `cargoCap`, `hull`, `rotAccel`, `length`, `radius` and `name` are now frame-aware.

### 10.3 Module state and save

| module | `save()` fields (save key stays `pocket-orbit-v4`) | not saved |
|---|---|---|
| econ | `owned`, `engine`, **`frame`**, `fuelOf`, `ionFuel`, `orion`, **`charges`**, `stats` | `inf`, `station` |
| haul | `{ v: 1, gone: [rail rock ids], chipped: { id: oreKg }, free: [free rocks], tow: { id, len } \| null, nextId, stats: { towed, tonnes, cracked, sold, whale } }` | rope impulse, fuses (a planted charge is lost; *stretch:* it goes off on load, `BOOM (you weren't there)`) |
| eva | `stats: { spacewalks, maxTether, bombs, rolls }` | tether and bomb state; a save taken mid-EVA loads with you aboard |

Haul's `load` marks `rk.gone = true` on the listed rail rocks. That is the only place rail rocks are retired, and combat already skips gone rocks.

---

## 11. Art specs (canvas, toon shading)

**Verified drawable.** I prototyped every frame, nozzle, plume, rock type, claw, the cable and the Crusher in a throwaway canvas page (`/tmp/claude-0/v4-progression/proto/`, outside the repo) and screenshotted it at 7 px/m. All five frames read clearly side by side, and the Leviathan is 104 px long at the 4 px/m flight zoom.

**House style** (matches render.js today):

- Ink `#1b1433`, line width `max(2, 0.28u)`, `lineJoin: 'round'`.
- u is `max(S.length × zoom, 34 px) / 10`, nose toward −y, as in `drawShip`.
- **Toon fill:** the base colour, then a shade strip on the side away from `LIGHT` (render.js `lightSide`) and a highlight strip on the lit side, then the ink outline.

**Palette:**

| name | base | shade | highlight |
|---|---|---|---|
| HULL | `#ffb347` | `#e07b2a` | `#ffe0a8` |
| GREY | `#c9c4e8` | `#8c84b3` | `#f0eeff` |
| DARK | `#6e6896` | `#4b4670` | `#9b97b8` |
| TEAL | `#4fc3b0` | `#2f8f80` | `#a8f0e0` |

Plus the stripe `#ffd166`, the window `#7fe0ff`, and the pilot's eyes and blink as today.

### 11.1 Frames (all coordinates in u; draw back to front: legs, nozzle, pods, side pods, hull, details, window)

- **Prospector:** exactly today's `drawShip`. It becomes `frame 0`, so nothing changes for v3 players.
- **Pack Mule:**
  - Today's hull, stretched to `roundRect(−2.2, −3.2, 4.4, 7.6, 1.6)`.
  - Two **teal saddlebag pods**, `roundRect(±1.6…±3.8, −1.8, 2.2, 4.6, 0.8)`, each with two strap lines at y −0.6 and 1.6.
  - A teal stripe instead of the gold one, at y 1.9.
  - **Four legs**: pairs at (1.6, 2.9) → (3.4, 5.4) and (3.0, 2.6) → (4.4, 4.8).
  - A bent antenna from (1.2, −2.6) to (2.4, −5.0) with a pink `#ff7eb6` bobble, r 0.35.
  - The same drill nose and window, with the window at y −0.9.
- **Hauler:**
  - A taller ribbed hull, `roundRect(−2.6, −3.6, 5.2, 8.6, 1.2)`.
  - A rust-orange cargo section, `roundRect(−1.9, 0.3, 3.8, 3.6, 0.4)`, base `#d9773a`, with three rib lines.
  - The drill is replaced by a **bumper nose**: a trapezoid from (±1.8, −3.6) to (±1.0, −5.3), GREY, clipped with **hazard stripes** `#ffd166`. This is the plate that pushes rocks.
  - Four RCS pods.
  - A crane arm on the left: (−2.6, 0.8) → (−3.8, −0.6) → (−3.4, −1.8), ending in a hook arc.
  - Window at y −1.7, r 1.15.
- **Bulk Barge:**
  - A wide hull, `roundRect(−3.4, −2.6, 6.8, 7.4, 1.0)`, with a gold stripe at y 3.8.
  - A **hexagonal hopper**, r 2.0 × 1.8, centred at (0, 1.0), filled DARK. It shows up to seven **cargo dots** (r 0.45, ink-outlined), coloured by `ITEMS[item].col` for what is in the hold. The dot count is `ceil(7 × cargoKg / cargoCap)`.
  - A small **neck cockpit**, `roundRect(−1.1, −4.5, 2.2, 2.2, 0.9)`, with the window at y −3.5, r 0.8.
  - Two outrigger pod pairs on struts at x ±4.4…5.4.
  - Two **searchlight cones** from (±1.0, −4.3) out to y −9.5, drawn with `globalCompositeOperation = 'lighter'` and `#fff3a0` at alpha 0.18. The prototype showed that plain alpha reads as grey on the navy sky, so use `'lighter'`.
- **Leviathan:**
  - A **whale hull**: a bezier body from the nose (0, −5.2) out to (±2.7, 0.4) and in to (±1.0, 4.2). It has a cream belly `#fff4dc` ellipse at (0.9, 0.6), rx 1.0, ry 3.6, clipped to the body, and a gold band at y 1.5-2.1.
  - **Radiator wings**: quads (±2.2, 0) → (±5.8, 1.0) → (±5.8, 3.4) → (±2.2, 3.0), with four fin lines each.
    - Cold they are coral `#ff8a5b` (shade `#c4502e`).
    - They glow toward `#ffb36b` / `#ffe066`, with shade `#ff5d5d`, by `g.fired.main`, so the radiators show the gigawatts.
  - A tiny cockpit window at y −3.6, r 0.75, with the same Pipkin eyes. A big ship with a tiny pilot is the joke.
  - Stretch: a dorsal fin and a slow blinking beacon.

### 11.2 Nozzles and plumes (drawn before the hull, below y 3.4u)

| engine | nozzle | plume (when firing) |
|---|---|---|
| sparrow | today's box, `roundRect(−1.4, 3.6, 2.8, 1.3, 0.3)` | today's orange `#ff7a1c` and gold `#ffe066` flame |
| brick | wider box `(−1.9, 3.5, 3.8, 1.6)` `#5b5680` with two rivets | the same flame, 1.2× wider |
| kestrel | GREY bell from (±0.8, 3.6) to (±1.3, 5.0) | slim blue `#9fdcff` / white |
| nerva (-chan) | DARK bell (±1.0 → ±1.6) plus a **trefoil badge** at y 2.7, r 0.55: gold `#ffd166`, three ink sectors | translucent pink `#ffb3f0` / white, alpha 0.75 |
| bulldog | **twin bells** at x ±1.0 | two orange flames |
| nervasama | big bell (±1.4 → ±2.2, to y 5.6) plus trefoil plus **two teal coolant pipes** `#7cf5d6` arcing down the sides | big pink plume |
| pocketsun / sunflower | a dark throat block plus **two copper magnetic-nozzle rings** (ellipses at y 4.6 and 5.5, rx 1.5 and 1.95, ink then `#e3893b`); sunflower ×1.35 | **D-He3:** long thin violet `#b8a6ff` / white, 15u, with three white **Mach diamonds** at 28/50/72% of its length. **D-D:** ice blue `#8fd3ff`. **Afterburner:** fat short orange `#ff9f43` / `#ffe066`, 9u long and 2.2u wide, with no diamonds |

The rings glow (stroke `#ffd166` at alpha 0.6) while burning.

**Side pods:** on frames with `side1+`, add small DARK blocks `0.6 × 0.7u` at the hull's widest point. When fired, a short orange triangle 2.2u long points outward with a gold core. A **dash** adds a white puff ring (`burst('flash', size 6)`) and three speed lines on the opposite side.

### 11.3 Hauling

- **Cable:** a quadratic from the nose claw to the rock surface. The control point is offset by a sag of `min(0.4 × slack, 0.3 × d)` along the normal, where slack = `tow.len − d` (clamped at ≥ 0). Draw ink at width `max(3, 0.5 m × zoom)`, then a `#ffd166` core at half that width. It flashes white for 0.15 s when tension passes 20 kN.
- **Claws**, at the nose tip *(MVP: the tow2 harpoon for every tier; the per-tier claws and the Big Hug arms are stretch, contract §10)*:
  - tow1: a J hook (two strokes, steel `#c9c4e8` over ink).
  - tow2: a harpoon arrowhead plus a winch drum disc (r 0.7u, `#8c84b3`).
  - tow3: a three-finger claw at ±0.55 rad, closing when latched.
  - tow4 **Big Hug**: two orange HULL toon arms that curve around the rock. Their reach scales with `rk.r`, and when closed they hug it.
- **Rocks by type** (look paints every rock, rail and free, in one function `Render.drawRockAt(g, rk, x, y, ang)` with colours from `Haul.TYPES`; haul calls it for free rocks):
  - Draw the World outline with a toon fill (shade fill, then base offset toward the light, then a highlight ellipse at 0.48 r) and an ink outline 3 px. Types use these base / shade / highlight colours:

    | type | base | shade | highlight |
    |---|---|---|---|
    | gravel | `#b9aac4` | `#7d6e92` | `#e4dcee` |
    | slush | `#cfeaff` | `#7fb2d6` | `#ffffff` |
    | clank | `#a9b4c8` | `#5f6a85` | `#e8eef8` |
    | sparkle | `#d9cdfa` | `#8f7bc7` | `#ffffff` |

  - Each type adds details: slush gets three white specks; clank gets three rust dots `#c4703a` and a white glint stroke; sparkle gets three 4-point twinkles that pulse at 3 rad/s.
  - **Unknown-type** rocks stay today's colour. `TAILINGS` rocks are desaturated to 40%.
- **Charges:** a dark puck (r 0.5 m) with a red LED blinking at 2 Hz, speeding to 8 Hz in the last second, plus a `5…4…3` countdown popup.
- **The Crusher** (25 m radius, drawn in units of `s = 25 / 22` m; MVP is the box, jaw, googly eyes, smile and sign; the chute, smokestack and chomp are stretch):
  - A DARK toon box with a **jaw** on the left: a dark mouth with four teeth top and bottom, cream `#fff4dc`.
  - **Googly eyes**: white ellipses with ink pupils glancing toward the player's ship.
  - A smile arc, and a gold sign plate reading `THE CRUSHER`.
  - A gold conveyor chute on the right, dribbling ore dots coloured by type.
  - A smokestack with a red beacon.
  - When a rock is fed in: the jaw chomps three times over 1.2 s, then a `CRUNCH!` popup and dust.

### 11.4 Suit and EVA

- **Suit tiers, sprint, roll and bombs:** see lore.md §11. Those looks were written against this doc's fields (`S.suitTier`, `S.sprint`, `S.roll`, `S.bombs`).
- **Bomb projectiles:**
  - Pop Rocks: a pink candy ball `#ff7eb6`, r 0.12 m, with a spark.
  - Boom Berries: a cluster of three purple `#8f6bff` balls.
  - Thunder Pucks: a dark puck with a yellow lightning stripe, a red LED and a tiny suction cup when stuck.
- **Explosions:** existing `flash` and `boom` bursts scaled by bombR, a dust ring and the word popups.
- **Tether line:** the same quadratic sag as the tow cable. Ink 3 px with a teal core `#7cf5d6` 1.5 px, from the ship's side hatch to the backpack.
- **Ship while you're out:** the cockpit is empty (render.js already hides the eyes when `g.mode !== 'ship'`). *(stretch: a small amber `HOLD` light blinking on the hull.)*

---

## 12. Who builds what (MVP vs stretch)

### econ: economy.js, shop.js

**MVP**

- `FRAMES` with `frameOf`, `equipFrame`, the Hub-only rule, the mount gate, auto engine swap and tow derate, plus the `frame` canBuy reason.
- Frame-aware `stats()` (§2.1).
- Engines `bulldog`, `nervasama`, `pocketsun` and `sunflower` with `mount` and `thrustBy`. NERVA-chan's ammonia `thrustBy` (and update its test).
- Fuels `dd`, `dhe3` and `augment`.
- Lines `side` and `tow`, plus `sprint`, `roll`, `bomb`, `tether` and `xlate`. Extended tiers suit3, suit4, pack3, o2c, jet3 and laser4.
- Consumables `CHARGES`, with `charges(g)` and `spendCharge(g, id)`.
- S fields (§10.2), save fields (§10.3).
- Shop tab **`haul`**, frame cards at the top of the ship tab, and the new MET rows (§2.6; JET POWER real-equivalent).
- Dev: `isInf`, `DEV_MONEY` (a pin in `frame`), `DEV_SHOP` (shop.js portrait for `kind: 'dev'`, the Debug Duck), the O, U and I keys, the dev tab, `BUILDS`, `applyBuild`, `grantAll`, `resetStock` and `topUp`.
- Jobs `frame`, `fusion` and `tycoon`. Tow fee × √k.

**Stretch**

- The Chorus ion list.
- Per-station stock (Rust's sells crack charges at ×0.8).
- A "your ship next to the next frame" silhouette on frame cards, drawn with `Render.drawShipAt`.

### ship: physics.js, game.js, new haul.js

**MVP**

- **haul.js**, all of §3: types, rocks, rope, grapple, reel, charges and blast, fragments, free rocks, selling (sell points from `Stations.list` + haul's `BUY` table), the Crusher position, nav target, F sale and minimal drawing, `Haul.chip` and `rayRocks`, `towInfo`, `devRock`, jobs `haul`, `crack` and `whale`, save. One claw style. Free rocks are painted with look's `Render.drawRockAt` (fallback `kit.toonBlob`).
- **physics.js:** add `ctrl.side` (−1..1) and `ctrl.dash` (boost) to `step`. The side force is `side × S.sideThrust × (dash ? S.dashBoost : 1)` along the ship's lateral axis, burning `sh.fuel` at `F / S.sideVe`.
- **game.js:**
  - `readShipCtrl`: ←/→ go to `side` when `S.sideThrust > 0`, otherwise RCS. Shift+←/→ is RCS. Double-tap detection with a 0.25 s window and a `g.dashUntil` / `g.dashReadyAt` cooldown.
  - `applyWarpCaps`: side or dash caps at 1x, plus the new **`burnWarp` hook**. When the main engine fires and `max(module burnWarp(g)) > 1`, allow `min(that, S.warpBurnMax)` instead of resetting to 1x, at `SIM.dt` steps.
  - `stepSize` and rock TTC include `Haul.free(g)` rocks, guarded with `typeof Haul !== 'undefined'`.
  - `hurtAstro`: return early while `g.t < g.astro.invUntil` (popup `MISS!`), and multiply by `(1 − S.suitArmor)`.
  - `Game.create` keeps `opts` as `g.opts`.

**Stretch**

- Free rocks bounce off each other and off rail rocks.
- Per-tier claws and the Big Hug arms; the 60 s ghost trail; the white tension flash; the Crusher's chute, smokestack, chomp, shop and keeper.
- Flinging rocks: a released rock above 3 m/s that hits a pirate calls `dealDamage(½ m v² / 20 kJ)`.
- The Chorus ion drive.

### eva: eva.js

**MVP**

- **Tethered EVA**, all of §5: step-out while flying or docked, rope solve, Q winch, auto-reel on O2-out, attitude hold via `shipCtrl`, jets in space, boarding momentum, camera fit, HUD rows, job `spacewalk`.
- Sprint, with O2 ×1.5.
- Dive roll with i-frames, cooldown and the roll2 air dash.
- **Bombs:** RMB arc, B throw, recoil, bounce, sticky, fuse, damage and dig, `Haul.blast`, refilling charges, job `bomb`.
- Suit tier stats: walk, jump, carry, fallSafe, armor.
- Laser on rocks via `Haul.rayRocks` and `Haul.chip`.
- Lore.md §11 looks for tiers, sprint, roll and bombs (pip mood colours are stretch). `EVA.topUp(g, all = true)`: all for dev U, `false` = HP + O2 only for mochi's fries. `EVA.isTethered(g)`. `CLINK!` when a laser or bomb `dig` reports `fixed > 0` (Murk-stone).

**Stretch**

- Magnetic boots for walking on rocks and the ship hull.
- Thunder Pucks sticking to bugs and pirates.
- Mecha-Pip ground-pound.
- 4x warp while tethered.
- A tether-swing slingshot easter egg: let go at the bottom of the arc.

### look: render.js, main.js

**MVP**

- `drawShip` dispatches on `S.frameId` to five frame painters (§11.1), engine nozzles by `S.engine` and plumes by fuel family from `S.fuelId` (chemical, NTR, fusion, afterburner) (§11.2), side puffs from `g.fired.side` and the dash from `g.dash`.
- `Render.drawRockAt(g, rk, x, y, ang)`, one painter for rail and free rocks, coloured by `Haul.typeOf` / `Haul.known` / `Haul.TYPES` (§11.3).
- The MONEY row shows `∞` when `Econ.isInf(g)`.
- main.js passes `?build=`, `?inf=` and `?xlate=` in `Game.create` opts (game.js keeps them as `g.opts`).
- Flight camera: while towing (`Haul.towInfo(g)`), auto-zoom so the ship and rock both fit, within 1.5-4 px/m. The `+/−` override still wins.
- playtest.js: keep the v3 checks green with Downtown carved (verified in a scratch copy: the pad-mining check still passes thanks to mochi's ice seam) and add the automatable items of contract §7.3.

**Stretch**

- A ship-select silhouette in the shop.
- The Leviathan's radiator glow; per-fuel plume variants; the amber HOLD light while you are out.
- Searchlights that brighten near rocks.
- The tycoon's golden duck on the Leviathan's dashboard.
- Touch buttons for G, B and E on mobile.

### aliens: npcs.js, stations.js

**MVP**

- Rock buyers: nothing to add. Haul reads `Stations.list(g)` and `st.state(t)` and keeps its own multipliers.
- Add `haul` to the `hub`, `outpost` and `rusts` `tabs`.
- **Big ships dock:** make the dock zone `DOCK_R + max(0, (S.radius ?? 4) − 4)`, which is 14 m for the Prospector and 21 m for the Leviathan, so a 26 m whale is not asked to put its nose 14 m from the port.

**Stretch**

- The Crusher's keeper **Gristle** (an Oggle), with lines and an SVG portrait kind `crusher`.
- NPC lines reacting to your frame ("Is that a WHALE? Granny, come look, it's a WHALE").
- Napping Crustling rocks (1 in 150 rocks) that refuse the grapple: `zzz... no.`

### mochi: terrain.js, new mochi.js

**MVP**

- `Terrain.dig` must stay fast up to r 6 m, which means about 450 cells for a crashing rock and r 3.4 for Thunder Pucks (measured: 0.049 ms per r 6 call).
- ~~Make the landing-pad cells indestructible~~ **Dropped by the contract (§9 #4):** Downtown's Pantry is 3.2 m under the pad, so a hardened pad left no ore to mine there. The Murk-stone lining already caps any crater at 3.2 m, and the ship settles in a pit safely (core test). Mochi lays an ice seam under the pad instead.
- Craters must read clearly, with darker exposed rims.

**Stretch**

- A **rock garden** next to the pad. A free rock set down below 2 m/s on Mochi becomes a parked boulder you can laser later, and haul hands its oreKg to a terrain blob.

---

## 13. Test notes (what each implementer should assert)

- **econ**
  - Frame swap scales dry, tank, hold and hull exactly per §2.1.
  - The Mule build (§2.5) gives Δv 424 ± 1 and TWR 1.80 ± 0.01; the Beast on D-He3 gives Δv 4,065 ± 5 and TWR 1.56.
  - `thrustBy` applies, and `canBuy` returns `frame` for a sunflower on a Prospector.
  - The mount auto-swap happens on a frame downgrade.
  - Dev ∞: after a buy and one frame, money is back at ≥ 1e9; `Econ.isInf(g)` is true; `dev K adds $5000` still passes (verified: the pin is a `Math.max`).
  - JET POWER for the Sunflower on D-He3 reads 40 GW (½ · 400 kN · 25,000 m/s · 8).
  - Save round-trips frame and charges.
- **haul**
  - Mass and value of a gravel r 4 rock: 509 t and $1,019.
  - The rope conserves momentum and CoM over 1,000 steps to 1e-9.
  - A Cracker on 500 t gravel makes 2-5 fragments with Σm = M, net momentum ≈ 0 and KE = 0.03 E ± 1%.
  - E < QM does not crack.
  - Selling pays oreKg × price × mult.
  - Lasering 10 kg out then selling pays exactly 10 kg less.
  - Free rocks are saved and loaded. A rock hitting Mochi digs a crater and drops pickups.
- **ship**
  - Side pods burn main fuel at `F / sideVe`. The dash Δv for the Mule is 1.80 ± 0.05.
  - `burnWarp` lets a towing burn run at 16x and still caps a normal burn at 1x.
  - `hurtAstro` respects `invUntil` and armor.
- **eva**
  - E while flying steps out with the tether.
  - Distance never exceeds `tetherLen` + 0.05 m.
  - Q brings you within `BOARD_R`, and boarding transfers momentum.
  - Roll i-frames block a bite.
  - A bomb's cooldown refills charges one at a time.
  - A bomb throw caps at 0.9 × escape on Seed (2.3 m/s).
  - Full lists per implementer, plus the end-to-end checklist: [V4-CONTRACT.md §7](V4-CONTRACT.md).

---

## 14. Easter eggs

- **The Leviathan's collision radius is 11 m, exactly Seed's radius.** Landing it on Seed is legal (Seed's g is 0.3). If you do it, the toast reads `YOU ARE NOW THE MOON`.
- The Debug Duck's blurb changes the more you buy in dev: after 50 purchases it says `"You know you can't take any of this home, right?"`.
- Selling a sparkle rock to Rust's: `"Platinum? Never heard of her."` (a callback to laser3's desc).
- A Rock Opera on a tiny rock gives fragments at 50 m/s with a popup `ENCORE!`. Overkill is the joke.
- Towing a rock past Ember's 3R kill line: the rock goes `SIZZLE!`, and the log adds `rock 4123 would like a word with you`.
- The tycoon job pays exactly $1. The JOBS panel shows it as `$1 (framed)`.
