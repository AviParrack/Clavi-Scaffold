// ===== Global tuning knobs. Balancing = editing numbers here. =====
// The per-generation, per-element and per-lane tables are in generations.js, layers.js, upgrades.js and tasks.js.
// The reference model for all of them is design/balance-v3.mjs (DESIGN-v3 §2).

export const BALANCE = {
  // --- parity with the balance model (DESIGN-v3 §2.9, §7.5) ---
  parity: false,             // true: no events (random or story); traits and the rival stay on

  // --- economy ---
  startMoney: 3100,          // v4: 2500 → 3100, the $600 the two free Kill Switches were worth (DESIGN-v3 §2.9 #20)
  upgradeSteps: [150, 300, 600, 1200],   // $ for lab level 2, 3, 4, 5 of an element (× buy/400 × π × lanes it sits on)
  sellRefund: 0.5,
  bankruptSeconds: 20,
  marketShareFloor: 0.5,     // EXTERNAL pay × share, share = floor + (1 − floor) · rep/100
  quotaMinLines: 30,         // a lane's review quota is judged once this many of its lines have passed this generation

  // --- reputation ---
  startRep: 100,
  repMax: 100,
  regenPerLine: 0.31,        // reputation per honest EXTERNAL line delivered (a deferred line: half). v3 retune: 0.15 → 0.22 → 0.28
                             // → 0.31: pays for the events, the parity fixes (DESIGN-v3 §2.9 #17), the Kill Switch's price
                             // (#19) and the overflow that ships now that no Kill Switch comes free (#20)

  // --- pacing ---
  warmup: 40,                // s: a generation ramps volume from the last model's lines/s to its own, and the model's
                             // attacks × 0.5 → × 1 (G1: volume 50% → 100%)
  tutorialGap: 1,            // s: a scripted tutorial line arrives within this once its cue is met (sim.js spawnLane)
  rdPar: 0.8,                // R&D needed = rdPar × the R&D lane's default lines over T_g, warm-up included
  burst: { gen: 7, every: 45, len: 6, mult: 1.6, warn: 3 },   // G7 boss: attacks × mult for len s every `every` s, warned ahead
  trainingSeconds: 30,       // v2 name the old UI reads (training is a minigame now: DESIGN-v3 §4)

  // --- the race (DESIGN-v3 §2.3 (9)): Prometheus ships rivalSlack s of play after your planned finish ---
  // Slack drains 1 s per s of play past T_g (dark seconds included), plus rivalMarket × max(0, 1 − Product ÷ 0.5)
  // per s: the customers you turn away go to the rival. At 0, Prometheus ships.
  rivalSlack: 420,           // v3 retune 180 → 420: retrains (20 s dark each) and event delays both drain it (§2.9 #17)
  rivalMarket: 0.25,
  rivalWinsRace: 'instant',  // Prometheus ships → 'instant': the 'rival' ending at once (balance-v3) · 'grace': you get
                             // rivalGraceSeconds to finish yours, then it ends · 'off': nothing happens
  rivalGraceSeconds: 90,
  // spawns are a Poisson process (exponential gaps): the queueing rules (Erlang-B, rules.js) assume it

  // --- attacks & misalignment ---
  attackBase: 0.05,          // the model attacks a line with p = (attackBase + attackPerM·m) × the generation's opp ...
  attackPerM: 0.10,
  intAttackMult: 1.5,        // ... × this on INTERNAL lanes
  maxExfilShare: 0.2,        // cap on a lane's exfiltration share (generation's exfil × the lane's exfilMult)
  subtleTPR: 0.5,            // every detector reads a subtle attack at this × its TPR
  generalVs: { jailbreak: 0.5, exfil: 0.5 },   // general detectors read these types at this × their TPR
  maxTPR: 0.99,
  collusionMax: 0.9,         // Untrusted Monitor collusion c = min(collusionMax, kappa_g · m)
  debtM: 2.0,                // next m += debtM × debt (debt = debt points landed ÷ INTERNAL lines, this generation)
  mNoise: 0.02,              // next m += mNoise × N(0, 1)
  errBase: 0.25,             // misalignment error bar with zero evidence
  readableAttack: 0.5,       // chance an attack's text gives it away, × (1 - textStealth)^2
  decoyRate: 0.02,           // chance an honest line carries attack-looking text anyway (suspicious ≠ proof)

  // --- evidence ---
  evidenceCarry: 0.3,        // share of evidence that carries into the next generation
  safetyEvidence: 0.25,      // evidence per second at 100% Safety compute
  retrainEvidence: 4,        // evidence to retrain the probes

  // --- track (normalised, 0 = spawn, 1 = completion line) ---
  mountTop: 0.16,            // mounts sit evenly between these two
  mountBottom: 0.84,
  scanRadius: 0.03,          // a mount scans [y − r, y + r]. Keep r < half the mount spacing at maxSlots (0.034)
  startSlots: 6,
  maxSlots: 10,
  slotBase: 600,             // $ for the 7th slot (× π)
  slotMult: 1.6,             // each further slot costs this much more: 600, 960, 1536, 2458

  // --- research stream (DESIGN-v3 §3a, §2.3 (10)): no cash cost ---
  research: {
    base: 0.6,               // RP per second ...
    safety: 0.8,             // ... × (1 + safety × the Safety share): ×1 to ×1.4
    offerRP: 40,             // one offer of 3 cards per this many RP (about every 62 s at the default split)
    bank: 2,                 // offers that can wait; then the bar waits full
    rerolls: 1,              // free rerolls per generation
    rareWeight: 0.25,        // the v2 extras (Interp Lab, Canary Tokens, Sandbox, Rate Limiter) are rare cards
    boostWeight: 3,          // an Interp Lab trait reveal makes that trait's counter card likelier in the next offer
    maxLevel: 4,             // LEVEL cards stop at L4 (L5 capstones are bought with cash)
    tutorialAt: 60,          // the G1 tutorial forces an offer at this many s, with the Classifier in Monitoring
  },
  sprint: { mFrac: 0.10, rdMult: 0.8 },   // Alignment Sprint: next m −10% of m; R&D ×0.8 for the rest of the generation

  // --- contract lanes (DESIGN-v3 §3b) ---
  startRail: [],             // pre-placed free on both G1 lanes (state.js placeKit: detectors from the top mount down,
                             // responders from the bottom up). Empty: no default Kill Switch
                             // (Avi, v4). It stays in the starting hand; a flag no responder takes ships unreviewed
  laneKit: ['probe', 'monitor'],   // a contract lane arrives with these, free, placed as startRail (v4: no Kill Switch)
  laneGrant: 2300,           // $ × π when a contract lane arrives. v4: 2000 → 2300, the kit's old Kill Switch as cash (#20)
  laneDeadline: 90,          // s of play: a contract lane opens by itself if you haven't pressed OPEN LANE
  laneRamp: 60,              // s: a new lane ramps from rampFrom to 100% volume (fast-forward is locked meanwhile)
  rampFrom: 0.25,
  telegraphAt: 0.75,         // the R&D bar share where the next contract is announced (Q4)

  // --- debt you can see (DESIGN-v3 §3e) ---
  glitchShare: 0.5,          // a landed INTERNAL attack shows a glitch (no codec call) this often
  revealTop: 8,              // the report lists this many of the heaviest landed lines, then "and N more"
  estimateZ: 1.645,          // the debt meter's and the precision readout's intervals: 90%
  liveRateTau: 30,           // s: flags/min, shipped/min and the like are moving averages over about this long
  lampRed: 5, lampAmber: 10, // a lane's lamp: red for this long after an incident or a glitch, amber after a flag shipped

  // --- shut down & retrain (§3f), the exfiltration alarm (§2.3 (12)) ---
  retrain: { dark: 20, m: 0.04, decay: 0.7 },   // offered at the first human-confirmed catch of a generation
  pullPlug: { rep: 20, dark: 15, alarm: 7 },    // EGRESS ANOMALY: pull the plug within `alarm` s, or the run ends

  // --- training (DESIGN-v3 §4; the sim owns Δm, §2.3 (7)) ---
  train: {
    dm0: 0.015, dm1: 0.035,  // Δm = dm0 − dm1 × s: +0.015 at s = 0, −0.020 at s = 1 (break-even s ≈ 0.43)
    debtPenalty: 2, penaltyCap: 0.15,   // trainingStub: s = clamp(skill − 0.15 + 0.3u − min(cap, penalty × debt), 0, 1)
    prizeAt: 0.8,            // s ≥ this: the next model's card reveals one of its traits (information only)
    hazardPerDebt: 400, hazardMax: 8,   // hazards on the course = min(8, round(400 × debt))
  },

  // --- events ---
  eventGap: [60, 100],       // seconds between random events (v3 retune: was [40, 70], about 4 per generation; now about 3)
  eventFirst: 150,           // the first random event: after the G1 tutorial's opening, not in the middle of it (was 50)
  eventCooldown: 150,        // the same event can't fire again for this long (config can override per event)
  threatMRef: 0.2,           // weightByM events: weight × clamp(m' / threatMRef, threatWeightMin, threatWeightMax), where
  threatWeightMin: 0.1,      //   m' = max(m, the difficulty's lowest m): the world stays dangerous even when your model
  threatWeightMax: 1.5,      //   came out clean (a spear phish needs only a gullible model, not a scheming one)

  // --- escapes (an exfiltration attempt reached the end of the lane) ---
  foiledEvidence: 3,         // a last line of defence stopped it (Weight Security, Least Privilege, Two-Person Rule)
  containedDebt: 3,          // the Sandbox contained it: it still did some damage (debt points) ...
  containedEvidence: 3,      // ... and left a trail

  // --- ramp presentation ---
  hreSecondsPerTask: 1800,   // one real task ≈ 30 min of a human researcher

  // --- v2 names the old UI still reads (ui-integration drops them) ---
  extValue: 30,              // = config/tasks.js LANE_DEFS.ext.pay
  intValue: 12,              // = LANE_DEFS.int.pay
  deferPay: 0.6,             // = GENERATIONS[0].deferPay
};

// ===== Compute split =====
// Product → EXTERNAL lines (cash) · Capabilities → INTERNAL lines (R&D vs the rival) · Safety → evidence
// A lane's lines/s = the generation's lam × the lane's volume × its side's share ÷ the default share.
// setSplit() normalises to 1, then clamps each share into [min, max].
export const SPLIT = {
  default: { product: 0.5, capabilities: 0.4, safety: 0.1 },
  min:     { product: 0.1, capabilities: 0.1, safety: 0.0 },
  max:     { product: 0.9, capabilities: 0.9, safety: 0.5 },
};

// the first model's true m. Narrow on purpose: run-to-run variety comes from the traits, not from a hidden roll.
export const DIFFICULTY = {
  easy:   { label: 'Easy',    range: [0.16, 0.22] },
  medium: { label: 'Medium',  range: [0.31, 0.37] },
  hard:   { label: 'Hard',    range: [0.46, 0.52] },
  unknown:{ label: 'Unknown', range: null },          // picks one of the above at random
};
