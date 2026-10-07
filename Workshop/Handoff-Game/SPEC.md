# HANDOFF — game spec v0.1

Browser tower-defense about AI control. You run the safety team at a frontier lab. AI tasks roll down the screen, a few of them are attacks, and you place and toggle safety layers to catch them while the models climb from autocomplete to ASI.

Scope of this spec: the Deployment game only. Training and Evals are future phases and appear here only as stubs.

## Pillars

- Tasks rolling down at you
  - the primary feeling is speed and volume, not menus
  - every safety layer has a visible effect on the tasks passing through it
- Safety is a tax
  - every active layer charges per task and slows the lane
  - the player is always trading confidence against income
- Progression to ASI
  - Cookie Clicker style ramp: numbers, speed and stakes grow by orders of magnitude
  - the fraction of work a human has looked at shrinks toward zero
- You never see the truth during play
  - misalignment is hidden, shown only as an estimate with an error bar
  - the scorecard reveals what was really going on

## Tech constraints

- Static site, no backend, no build step
  - index.html plus plain ES modules, vanilla JS, Canvas 2D
  - no image or audio files; all graphics drawn in code, sound via WebAudio
  - target under 300 KB total, 60 fps on a laptop
- Data driven
  - towers, cards, events, generations live in config tables (one file each)
  - balancing means editing numbers, not logic
- Simulation separated from rendering
  - sim core is a pure module: state + step(dt) + seeded RNG
  - renderer only reads state
- Saves
  - localStorage for best scorecard and settings only, wrapped in try/catch

## Screen layout

- Top bar
  - money, reputation, model generation name, rival lab progress
  - misalignment estimate, e.g. "12% ± 9"
  - ramp counters: tasks per second, human-researcher equivalents, % of tasks seen by a human
- Playfield (centre, most of the screen)
  - two vertical lanes side by side, tasks spawn at top and roll down
    - left: EXTERNAL (public deployment)
    - right: INTERNAL (R&D loop)
  - each lane is crossed by horizontal tier slots, 4 per lane at start, up to 7
    - tasks pass through tiers top to bottom, so order matters
    - one layer per slot; click a placed layer to toggle on/off (free, instant)
  - completion line at the bottom, payout pops up there
- Right panel
  - hand of unlocked layer cards with prices; drag or click-then-click to place
  - research button with current price
- Bottom strip: codec
  - Metal Gear Solid style call box: two portraits, name tags, typewriter text
  - used for events, tutorials, and flavour; never blocks the playfield except for choices

## Visual style

- CRT terminal look: dark background, monospace text, scanlines, slight glow
  - palette shifts by generation: green, amber, cyan, white-hot at ASI
- Task chips
  - small rounded rectangles with a type icon and a one-line snippet
    - e.g. "refactor auth module", "run sweep lr=3e-4", "reply to customer #4412"
  - task types have distinct shapes and colours (code, research, comms, data, infra)
  - at low generations attack snippets are sometimes readably off ("copy weights to ext bucket"); this fades with stealth
  - from G3 chips are bundles and show a multiplier ("×1k")
- Layer effects (each must be distinct at a glance)
  - probe: thin scan beam, chip tints briefly
  - trusted monitor: swarm of small bots circling the chip
  - human auditor: desk with a figure, chips stop and queue visibly
  - flag: chip gets a red outline
  - block: chip shatters
  - cost: floating "−$1" as the chip passes a layer, "+$50" at the completion line
  - caught attack: red flash, siren blip, codec pop
  - landed attack: chip glitches red after the line, screen shake
- Space pauses; layers can be placed and toggled while paused

## Core loop

- Tasks spawn in both lanes at the generation's rate
- Each task passes every active layer in its lane, top to bottom
  - layer charges its per-task cost and adds its latency
  - detectors may flag the task
  - responders act on flagged tasks
- Task reaches the completion line
  - benign: pays out
  - attack: pays out as if benign, and its harm applies (often silently)
- Money buys layers and research
- Enough internal tasks completed triggers the next training run and a harder generation

## Tasks

- Fields
  - lane, type, value, snippet
  - hidden: isAttack, attackType, stealth
  - visible: flagged, bundle size
- Attack rate per task = f(model misalignment m, generation); see tables
- Attack types
  - external
    - harmful output: reputation −5
    - data leak: reputation −20
    - jailbreak (comes from users, independent of m): reputation −8
  - internal
    - sabotage: +1 drift
    - poisoning / backdoor: +3 drift
    - exfiltration or rogue deployment (G4+): catastrophe, game over if it lands
- Drift
  - hidden counter of landed internal attacks this generation
  - raises the next model's misalignment (see Progression); this is the snowball

## Layers

All dollar figures are per task at G1 and scale with bundle size. TPR = chance to flag an attack, FPR = chance to flag a benign task. Numbers are starting points for tuning.

| Layer | Kind | Buy | Per task | Latency | TPR | FPR | Notes |
|---|---|---|---|---|---|---|---|
| Probe | detector | $200 | $1 | 0 | 0.70 | 0.05 | white-box; −0.15 TPR each new generation until retrained |
| Trusted Monitor | detector | $500 | $10 | 0.3 s | by gen | 0.08 | weak trusted model; falls behind as capability grows |
| Human Auditor | responder | $800 | $25 per audited task | 3 s | by gen | 0.01 | fixed capacity in real tasks; queues |
| Untrusted Monitor | detector | $600 | $3 | 0.2 s | 0.95 | 0.03 | colludes (misses on purpose) with probability rising in m |
| Honeypots | special | $700 | $2 | 0 | n/a | n/a | injects fake attack chances; catches give evidence and cut collusion |
| Defer to Trusted | responder | $400 | 0 | 0.5 s | n/a | n/a | flagged tasks redone by weak model: pays 40%, zero risk |
| Resampler | responder | $500 | $5 per resample | 0.5 s | n/a | n/a | flagged task re-rolled; attack chance rolled again |
| Paraphraser | modifier | $400 | $2 | 0.2 s | n/a | n/a | halves collusion for layers below it |
| Sandbox | modifier | $900 | $4 | 1 s | n/a | n/a | attacks that land do 30% harm; no effect on catastrophes at G6+ |

- Starting hand: Probe, Trusted Monitor, Human Auditor; the rest come from research
- Flag handling
  - a flagged task goes to the next responder below it in the lane
  - no responder below: the task is blocked (no payout, no harm)
- Human Auditor
  - reviews flagged tasks first, then random unflagged ones with spare capacity
  - verdict is correct with the generation's auditor accuracy
  - verdict "attack": caught, +1 evidence
  - with bundles, coverage = min(1, capacity / real tasks in queue), so it collapses as B grows
- Evidence
  - gained from catches and honeypots
  - narrows the misalignment error bar; spent by some upgrades (probe retraining)
- Throughput
  - each layer has a queue; when a lane backs up to the top, new tasks time out
  - external timeout: lost revenue, reputation −0.1
  - internal timeout: lost R&D progress

## Economy

- One currency
- Income
  - external task: $50 at G1 (scales by generation), times market share
  - internal task: $20 and +1 R&D progress
  - net per task = value − sum of active layer costs
- Spending
  - layers: one-time buy price, then per-task cost while toggled on
  - research draw: $1000, ×1.6 after each draw
    - offers 2 cards; pick 1
    - card is either a new layer unlock or an upgrade to an owned layer
    - at least one of the two addresses an attack type seen this generation
- Pressure against turtling
  - rival lab advances on a fixed clock
  - if the rival is ahead of you, external value ×0.7 until you catch up
- Reputation
  - starts at 100, regenerates slowly, lost to external incidents and timeouts

## Research cards (v1 set)

- Unlocks: each layer not in the starting hand
- Upgrades
  - Retrain Probes: restore probe TPR, costs evidence
  - Monitor Ensemble: trusted monitor TPR +0.10, per-task cost ×1.5
  - AI-Assisted Auditing: auditor capacity ×10, accuracy now capped by the assisting model's honesty
  - Promote Last Model to Trusted: trusted monitor uses previous generation (TPR reset to G1 level), but colludes if that model was misaligned
  - Extra Tier Slot: +1 slot in one lane
  - Tripwires: any catch pauses the lane for 2 s so the player can react
  - Incident Response Team: halves reputation loss per incident

## Progression

Each generation runs until the R&D bar fills (about 3 to 4 minutes), then a 30 s training interstitial (shop stays open), then the next generation. Full run about 25 minutes.

| G | Name | Bundle | Chips/s per lane | Trusted Monitor TPR | Auditor accuracy | Stealth |
|---|---|---|---|---|---|---|
| 1 | Autocomplete | 1 | 0.5 | 0.90 | 0.99 | 0.05 |
| 2 | Junior Engineer | 10 | 0.8 | 0.85 | 0.97 | 0.15 |
| 3 | Senior Engineer | 100 | 1.2 | 0.75 | 0.92 | 0.30 |
| 4 | Research Scientist | 1e3 | 1.6 | 0.60 | 0.80 | 0.45 |
| 5 | Research Org | 1e5 | 2.0 | 0.45 | 0.65 | 0.60 |
| 6 | Superhuman Researcher | 1e7 | 2.5 | 0.30 | 0.50 | 0.75 |
| 7 | ASI | 1e9 | 3.0 | 0.20 | 0.40 | 0.90 |

- Stealth multiplies every detector's TPR by (1 − stealth/2)
- Misalignment
  - difficulty setting gives the base range: Easy 0.00–0.10, Medium 0.05–0.25, Hard 0.15–0.45, Unknown picks one at random
  - m for G1 is drawn from the range
  - m(next) = clamp(m + noise + 0.02 × drift − research reductions, 0, 1)
  - attack rate per task = 0.01 + 0.15 × m; catastrophic share of internal attacks = 0 before G4, then rises with generation
  - no direct "you lose" for high m; a high-m late model produces catastrophes faster than any defence can stop
- Ramp presentation
  - big-number counters with suffixes, ticking up constantly
  - "NEW MODEL TRAINED" full-screen moment with the new portrait and stats
  - the model's codec voice becomes more articulate each generation
  - background datacenter skyline grows each generation

## Events

Delivered through the codec; some offer 2 to 3 choices. Weighted random plus triggers. v1 list:

- Caught Red-Handed (trigger: first real catch per generation)
  - shut down and retrain: lose 30 s of income, m reduced
  - keep running and study: +evidence, risk continues
  - disclose publicly: reputation +10, external value −20% for 60 s
- Demand Surge: external spawn ×3 for 30 s
- Jailbreak Wave: burst of user-origin attacks in the external lane
- Ship It: leadership forces one layer off for 20 s, or pay to refuse
- Auditor Burnout: auditor capacity halved for 60 s
- Rival Release: rival jumps ahead
- Journalist: reputation hit scaled by undetected incidents so far
- Distribution Shift: probe TPR drops until retrained
- Collusion Discovered: reveals whether the untrusted monitor has been colluding
- Regulator Inspection: bonus if both lanes have at least 2 active layers
- Compute Crunch: layer per-task costs ×2 for 45 s
- Sleeper: an earlier landed sabotage detonates, extra drift or reputation loss

Cast: Head of Safety (player), CEO, Auditing Lead, Research Lead, Regulator, The Model (portrait changes each generation). Portraits are procedural pixel faces.

## Win, loss, scorecard

- Loss
  - catastrophic attack lands
  - reputation reaches 0
  - money below 0 for 20 s
- Win: complete G7
- Scorecard (shown on win or loss)
  - per generation: true m vs your estimate
  - per lane: attacks caught, blocked, landed; benign tasks blocked
  - money earned, share spent on safety
  - final % of tasks seen by a human
  - grade and one of several endings (earned trust, got lucky, paranoid but safe, lost control)

## Stubs for later phases

- trainingPhase(state) returns next model's m modifier and attack-type mix; v1 returns defaults
- evalPhase(state) returns revealed model tendencies for the next generation; v1 reveals one random true tendency in the codec

## Debug and tests

- ?debug=1 overlay
  - true attack flags on chips, true m, drift, seed, per-layer live TPR/FPR
  - keys to skip generation, add money, fire any event
- ?seed=N for reproducible runs
- Headless sim (node)
  - run(policy, seed) with scripted policies: no layers, all layers, starter hand only
  - prints per-layer confusion matrix, income, outcome
  - asserts
    - measured TPR/FPR within tolerance of config
    - no-layers policy loses before G4 on Medium
    - all-layers policy goes bankrupt or falls behind the rival
    - money is conserved (income − costs = balance change)

## Milestones

- M1: sim core, config tables, headless tests passing
- M2: playfield render, lanes, tiers, place and toggle, chips with snippets, payouts
- M3: economy, research draws, full layer set
- M4: generations, bundles, ramp counters, misalignment and drift
- M5: codec, events, tutorial call in G1
- M6: scorecard, effects polish, sound, balance pass

## Open questions

- Should internal tasks pay cash, or only R&D progress?
- Is the rival lab enough pressure, or is a board-confidence meter needed?
- Lanes stay at two with bundles, or split into sub-lanes at high generations?
- Mobile support in v1 or desktop only?
