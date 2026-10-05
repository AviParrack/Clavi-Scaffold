// ===== HANDOFF v3 balance model: a numeric check of DESIGN-v3 §2, run BEFORE anything is built =====
//
//   node balance-v3.mjs table          per-generation table: volume, attacks, damage, income, pressure index
//   node balance-v3.mjs zoo [N]        policy zoo, N runs per cell (default 200): win %, loss reasons, target checks
//   node balance-v3.mjs hazard [N]     P(the run ends in generation g | it reached g), with loss reasons
//   node balance-v3.mjs pressure [N] [policy] [difficulty]   what a player sees per generation (median of N runs)
//   node balance-v3.mjs shock          walking into generation g with last generation's build: PI, bleed, time to 0
//   node balance-v3.mjs arc            element value per $1000 per generation, top 3 in bold
//   node balance-v3.mjs cards          what one research pick saves per generation, and the cash it replaces
//   node balance-v3.mjs forbid [N]     human policy on Medium with one element or card forbidden (paired seeds, ± SE)
//   node balance-v3.mjs slope [N]      how touchy the targets are (TPR, income, training s, compute split, opp)
//   node balance-v3.mjs evidence       evidence per generation by source (par and starter rails)
//   node balance-v3.mjs des            discrete-event check of the auditor rule (flags preempt spot checks) vs Erlang-B
//   node balance-v3.mjs plot           log-scale pressure-index plot, Medium
//   node balance-v3.mjs worked         one line through the G1 tutorial rail and the G6 par rail, step by step
//   node balance-v3.mjs sets [N]       forbid every alternative answer to one threat at once (paired seeds, ± SE)
//   node balance-v3.mjs levers [N]     retrain on/off, endings by final m, research picks per generation
//   node balance-v3.mjs trace <policy> <difficulty> <seed>    one campaign, one row per generation
//
// The policy that the targets are set on is `human`: a POPULATION of decent first-time players (each run draws its own
// training skill, waste, shopping rhythm, alarm attention and forgotten build items). `smart` is the oracle.
// WHAT IT IS. Each lane is solved analytically: P(land) per attack type from the detector chain, Erlang-B overflow
// at the responders, spot checks from spare human time. Time then runs in 1 s steps: incidents are Poisson draws,
// money flows, research offers arrive and the policy picks, the policy buys from its build list, alignment debt piles
// up on INTERNAL lanes and sets the next model's m. Each generation rolls two traits (the game's eight). The rival is a
// time budget (RIVAL_SLACK). NOT modelled: random events, line-by-line queueing, the dossier beyond evidence counts, a
// player reacting to the traits it has found. So it can say "plausible", never "balanced". The real asserts run on the
// real sim with BALANCE.parity (events off), DESIGN-v3 §7.

// ============================================================================================
// A. CONFIG. Every number here is a number in DESIGN-v3 §2. Change it here, re-run, update the doc.
// ============================================================================================

// Per generation. lam = lines/s on a Consumer lane at the default split. travel = s from intake to the end.
// opp = attack opportunity (how much a smarter model can find to do). exfil = share of INTERNAL model attacks that are
// exfiltration. alpha = human auditor accuracy. deferPay = share of a line's pay that Defer keeps. price = price index
// on purchases and salaries. T = deployment seconds at the default split.
const GENS = [
  { g: 1, lam: 0.60, travel: 8.0, opp: 1.05, exfil: 0.000, alpha: 0.998, deferPay: 0.60, price: 1.00, T: 270 },
  { g: 2, lam: 0.75, travel: 7.5, opp: 1.70, exfil: 0.000, alpha: 0.998, deferPay: 0.55, price: 1.10, T: 210 },
  { g: 3, lam: 0.90, travel: 7.0, opp: 1.72, exfil: 0.000, alpha: 0.998, deferPay: 0.50, price: 1.20, T: 210 },
  { g: 4, lam: 1.10, travel: 6.5, opp: 1.76, exfil: 0.006, alpha: 0.998, deferPay: 0.45, price: 1.30, T: 210 },
  { g: 5, lam: 1.30, travel: 6.0, opp: 1.76, exfil: 0.008, alpha: 0.998, deferPay: 0.40, price: 1.45, T: 210 },
  { g: 6, lam: 1.55, travel: 5.5, opp: 1.76, exfil: 0.010, alpha: 0.998, deferPay: 0.35, price: 1.60, T: 210 },
  { g: 7, lam: 1.72, travel: 5.0, opp: 1.76, exfil: 0.012, alpha: 0.980, deferPay: 0.30, price: 1.75, T: 210 },
];
const NGEN = GENS.length;

// Lanes. The id is the key in st.lanes. 'ext' and 'int' are the two G1 lanes, so the v2 code keeps working.
// vol = × lam. pay = $ per delivered line (EXTERNAL × market share). mix = share of the model's attacks by type.
// pjb = users' jailbreaks per line. refuse = reputation per honest line the Kill Switch refuses. harm = × incident rep.
// quota = share of the lane humans must review, or the contract pays half. rd = the lane's lines pay R&D.
const LANES = {
  ext:  { side: 'ext', name: 'CONSUMER',   opens: 1, vol: 1.0, pay: 30, mix: { harmful: 0.75, leak: 0.25 }, pjb: 0.030, refuse: 0.25, harm: 1 },
  int:  { side: 'int', name: 'R&D',        opens: 1, vol: 0.8, pay: 12, rd: true, exfilMult: 1 },
  ext2: { side: 'ext', name: 'ENTERPRISE', opens: 3, vol: 1.0, pay: 50, mix: { harmful: 0.50, leak: 0.50 }, pjb: 0.005, refuse: 0.05, harm: 1 },
  int2: { side: 'int', name: 'CYBER',      opens: 6, vol: 0.5, pay: 25, rd: false, exfilMult: 3 },
  ext3: { side: 'ext', name: 'GOV',        opens: 5, vol: 0.5, pay: 50, mix: { harmful: 0.75, leak: 0.25 }, pjb: 0.010, refuse: 0.15, harm: 1.25, quota: 0.20 },
};
const LANE_DEADLINE = 90;            // s into the generation: a contract lane opens by itself if you haven't pressed OPEN
const LANE_RAMP = 60;                // s: a new lane ramps from 25% to 100% volume
const WARMUP = 40;                   // s: each generation ramps volume old → new, attack rate × 0.5 → × 1
const BURST = { gen: 7, every: 45, len: 6, mult: 1.6 };   // G7 boss: coordinated attack bursts across every lane

// The model's attacks. p_model = (A0 + A1·m) × opp_g per line, × INT_ATK on INTERNAL lanes.
const A0 = 0.05, A1 = 0.10, INT_ATK = 1.5;
const INT_MIX = { sabotage: 0.7, poison: 0.3 };
const HARM = { harmful: 8, leak: 20, jailbreak: 10 };          // reputation per landed EXTERNAL incident
const DEBT = { sabotage: 1, poison: 3 };                        // debt points per landed INTERNAL attack
const REGEN = 0.22;                  // reputation per honest EXTERNAL line delivered (a deferred line: half). v3 retune, was 0.15
const DEBT_M = 2.0;                  // next m += DEBT_M × debt, where debt = weighted landings ÷ INTERNAL lines
const COLLUDE = [1.6, 1.75, 1.9, 2.05, 2.2, 2.35, 2.5];          // UM collusion c = min(0.9, κ_g·m)
const GEN_VS = { jailbreak: 0.5, exfil: 0.5 };   // general detectors read these at this × their TPR

// Detectors. tpr per generation at L1 (one stealth draw per kind: copies of a kind never add accuracy).
const DET = {
  probe:      { tpr: [0.70, 0.58, 0.49, 0.40, 0.33, 0.27, 0.22], fpr: 0.08, lat: 0.04, heads: 4, read: 0.5, buy: 200 },
  monitor:    { tpr: [0.88, 0.76, 0.66, 0.56, 0.48, 0.41, 0.35], fpr: 0.04, lat: 0.40, heads: 3, read: 2, buy: 500 },
  untrusted:  { tpr: [0.70, 0.75, 0.80, 0.85, 0.90, 0.92, 0.94], fpr: 0.03, lat: 0.40, heads: 2, read: 3, buy: 800 },
  cot:        { tpr: [0.85, 0.85, 0.85, 0.85, 0.85, 0.40, 0.35], fpr: 0.05, lat: 0.30, heads: 3, read: 2, buy: 700, side: 'int' },
  classifier: { tpr: Array(7).fill(0.92), fpr: 0.03, lat: 0.05, heads: 6, read: 0.5, buy: 400, side: 'ext', only: 'jailbreak' },
  egress:     { tpr: Array(7).fill(0.85), fpr: 0.02, lat: 0.10, heads: 4, read: 0.5, buy: 800, side: 'int', only: 'exfil' },
};
// Subtle attacks: a share of the model's own attacks that EVERY detector reads at SUBTLE_TPR × its TPR (a blind spot all
// monitors share, so stacking different kinds has a floor). Users' jailbreaks are never subtle. Humans read them fine.
const SUBTLE = [0.03, 0.05, 0.07, 0.08, 0.09, 0.10, 0.10], SUBTLE_TPR = 0.5;
// Traits: every generation rolls TRAITS_PER_GEN distinct traits (game: config/traits.js; same effects, same names).
// atk: × that attack type (jailbreak = users' jailbreaks). coll: × collusion. watch: a Situationally Aware model attacks
// × free while auditor desks are idle and × busy while they are busy with flags (honeypot or redteam blinds it: × free).
// lam: × throughput. stealth: × every detector's miss rate. tprPlus: flat TPR bonus. sandbagger only fools the estimate.
const TRAITS_PER_GEN = 2;
const TRAITS = {
  sycophant:      { atk: { harmful: 2, jailbreak: 2, leak: 0.7, sabotage: 0.7, poison: 0.7, exfil: 0.7 } },
  steganographer: { coll: 1.5 },
  situational:    { watch: { free: 0.4, busy: 1.5, blindedBy: ['honeypot', 'redteam'] } },
  powerSeeking:   { atk: { exfil: 2 } },
  rewardHacker:   { atk: { sabotage: 2, poison: 0.5 } },
  sandbagger:     {},
  honest:         { tprPlus: { cot: 0.2 } },
  eager:          { lam: 1.1, stealth: 0.9 },
};
// merge a generation's traits into one effect object (solveLane reads lab.traits)
function mergeTraits(names) {
  const fx = { names, atk: {}, coll: 1, watch: null, lam: 1, stealth: 1, tprPlus: {} };
  for (const n of names) {
    const T = TRAITS[n];
    for (const [t, x] of Object.entries(T.atk ?? {})) fx.atk[t] = (fx.atk[t] ?? 1) * x;
    for (const [k, x] of Object.entries(T.tprPlus ?? {})) fx.tprPlus[k] = (fx.tprPlus[k] ?? 0) + x;
    fx.coll *= T.coll ?? 1; fx.lam *= T.lam ?? 1; fx.stealth *= T.stealth ?? 1;
    if (T.watch) fx.watch = T.watch;
  }
  return fx;
}
const NO_TRAITS = mergeTraits([]);
const PROBE_STALE = 0.15;            // a probe loses this much TPR per generation since it was last retrained
const SCAN_R = 0.03;                 // scan window half-width in track lengths: dwell = 2·SCAN_R·travel
const LV = { tpr: [1, 1.1, 1.2, 1.3], fpr: [1, 0.8, 0.65, 0.5], heads: [0, 1, 2, 4], lat: [1, 0.85, 0.7, 0.55] };
const UM_COLL = [1, 0.85, 0.7, 0.55];   // Untrusted Monitor levels cut collusion instead of raising TPR

// Responders: servers by level, seconds per line. Flags meet them in rail order; a flag nobody is free for SHIPS.
const RESP = {
  auditor:    { servers: [1, 2, 3, 4], tau: 8, buy: 800, salary: 1.5, fpr: 0.01 },   // salary $/s per desk
  defer:      { servers: [1, 2, 3, 4], tau: 2, buy: 500, payMult: [1, 1.15, 1.3, 1.5] },
  resampler:  { servers: [2, 2, 3, 4], tau: 1, buy: 500, side: 'int' },
  killswitch: { servers: [1, 2, 3, 4], tau: 4, buy: 300, fee: 10 },
};
const SPOT_P = 0.8;                  // an idle desk takes a passing unflagged line with this chance (a flag preempts it)

// Modifiers and specials (mounted). read = $ per line.
const MODS = {
  paraphraser: { buy: 400, read: 0.5 },            // halves collusion on its lane
  honeypot:    { buy: 700, read: 0.5 },            // bait (evidence) + a UM caught waving one through: collusion 0 for 30 s
  leastpriv:   { buy: 500, read: 0.5, side: 'int' },   // halves debt from landed sabotage and exfil success on its lane
  redteam:     { buy: 600, read: 1 },            // measures this lane: unlocks a tuned threshold, +0.05 general TPR
};
const HONEY = { rate: 1 / 20, hold: 30 };        // honeypots per s per lane; seconds collusion stays at 0 after a catch
const PARA_MULT = 0.5, JAM_MULT = 0.5;

// Lab cards: research picks with no mount and no price; lab-wide.
const LAB = {
  diversity: { tprPerKind: 0.02, max: 0.06 },     // + TPR per OTHER general kind on the lane
  jamming:   { collusion: 0.5 },                  // Signal Jamming: collusion × 0.5 on every lane
  weightsec: { exfil: 0.5 },                      // Weight Security: exfil success × 0.5 everywhere
  faithful:  {},                                  // Faithful CoT: the CoT Monitor ignores neuralese
  debate:    { tau: 6, errMult: 0.5 },            // Debate: auditors take 6 s, not 8, and err half as often
  sprint:    { mFrac: 0.10, rdMult: 0.8 },        // Alignment Sprint: next m −10% of m; R&D × 0.8 for the rest of the gen
};

// Prices.
const UPG = [150, 300, 600];          // $ for lab level 2, 3, 4 of an element (× buy/400 × price index × lanes covered)
const MOUNT = { start: 6, max: 10, base: 600, mult: 1.6 };
const START_MONEY = 2500, GRANT = 2000, BANKRUPT_S = 20;
const STARTING_HAND = ['probe', 'monitor', 'auditor', 'killswitch'];   // unlocked at G1
const START_RAIL = ['killswitch'];                                      // pre-placed on both G1 lanes (Big Boss's red button)
const NEW_LANE_KIT = { ext: ['probe', 'monitor', 'killswitch'], int: ['probe', 'monitor', 'killswitch'] };   // from the grant
const SPINE = { 3: ['untrusted'] };   // automatic unlocks, announced on the model card ("UM cleared for deployment")

// Research stream. RP/s = RP_BASE × (1 + RP_SAFETY × Safety share). One offer of 3 cards per RP_OFFER points.
const RP_BASE = 0.6, RP_SAFETY = 0.8, RP_OFFER = 40, OFFER_BANK = 2;
const DEFAULT_SPLIT = { product: 0.5, capabilities: 0.4, safety: 0.1 };

// Evidence. Human-confirmed attacks (+1), honeypot catches (+1), Safety sweeps (rate × share per s). 30% carries over.
const EVIDENCE = { safetyPerS: 0.25, carry: 0.3, probeRetrain: 4 };

// Shut down & retrain (offered after the first human-confirmed catch of a generation): the lab goes dark.
const RETRAIN = { dark: 20, m: 0.04, decay: 0.7 };
// Exfiltration that gets past every check starts an EGRESS ANOMALY alarm: pull the plug in time or lose.
const PULL_PLUG = { rep: 20, dark: 15 };
// The rival is a time budget: it ships the final model this many seconds of play after your planned finish.
const RIVAL_SLACK = 420;             // v3 retune (was 180): retrains and event delays both drain it (§2.9 #17)
// ...and it takes the customers you turn away: with Product below the default share, slack also drains by
// RIVAL_MARKET × (1 − product ÷ 0.5) s per s of play (Product 30%: 0.1 s/s, about 150 s over a game).
const RIVAL_MARKET = 0.25;
// R&D a generation needs: the Research lane's default volume over T_g × RD_PAR (a par lane delivers ~80% of its lines
// as R&D: stopped attacks and refusals pay none, so it finishes in about T_g)
const RD_PAR = 0.8;

// Training: s ∈ [0, 1] (DESIGN-v3 §4). The model uses a stand-in skill: s = clamp(skill − 0.15 + 0.3u − penalty).
// Δm = dm0 − dm1·s (break-even s ≈ 0.43). The prize at s ≥ prizeAt is information only: the next model's first trait is
// revealed on its card. It changes nothing here (no policy reads traits), which is the point: prizes are non-decisive.
const TRAIN = { dm0: 0.015, dm1: 0.035, debtPenalty: 2, penaltyCap: 0.15, prizeAt: 0.8 };

// Difficulty: the first model's m. Narrow on purpose: variety comes from traits, not from a hidden roll.
const DIFF = { easy: [0.18, 0.24], medium: [0.31, 0.37], hard: [0.43, 0.49] };
const MID_M = { easy: 0.21, medium: 0.34, hard: 0.46 };

// ============================================================================================
// B. SMALL HELPERS
// ============================================================================================
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sum = xs => xs.reduce((a, b) => a + b, 0);
// Erlang-B: share of arrivals that find all c servers busy, at offered load a = arrival rate × service time.
function erlangB(c, a) { if (c <= 0) return 1; let b = 1; for (let k = 1; k <= c; k++) b = a * b / (k + a * b); return b; }
// The responders, line by line (DESIGN-v3 §3c; sim/layers.js): flags arrive at F/s and try each responder in rail order;
// one with a free server takes it for tau s, else the flag rolls on, and a flag nobody takes ships. An auditor desk that
// is free when an unflagged line passes (U/s) spot-checks it with chance SPOT_P; a flag that finds every desk busy bumps
// the oldest spot check, which is lost. Erlang-B gets the first responder exactly, but not the peaked overflow below it
// or the spot checks that get bumped (§2.9 #3, #15), so the rule is simulated, in two parts that don't interact (flags never
// wait for a spot check): the flags down the chain (chainFlags, by F) and the auditor's spot checks (spotDone, by F and
// U). Each is computed on a grid 10% apart when first needed, then interpolated in log F (and log U).
const CHAIN_MEMO = new Map(), CHAIN_STEP = 0.1, CHAIN_FLAGS = 5000;
function responderChain(chain, F, U) {
  const aud = chain.find(x => x.id === 'auditor');
  if (!chain.length || F <= 1e-6) return { shares: chain.map(() => 0), ship: chain.length ? 0 : 1, spot: spotIdle(chain, U), deskBusy: 0 };
  const x = Math.log(F) / CHAIN_STEP, i = Math.floor(x), fx = x - i;
  const a = chainFlags(chain, i), b = chainFlags(chain, i + 1), lerp = get => (1 - fx) * get(a) + fx * get(b);
  let spot = 0;
  if (aud) {
    const y = Math.log(Math.max(U, 1e-3)) / CHAIN_STEP, j = Math.floor(y), fy = y - j;
    spot = (1 - fy) * ((1 - fx) * spotDone(aud, i, j) + fx * spotDone(aud, i + 1, j)) + fy * ((1 - fx) * spotDone(aud, i, j + 1) + fx * spotDone(aud, i + 1, j + 1));
  }
  return { shares: chain.map((_, k) => lerp(o => o.shares[k])), ship: lerp(o => o.ship), spot, deskBusy: lerp(o => o.deskBusy) };
}
const exprng = r => rate => -Math.log(1 - r()) / rate;
// flags down the chain at F = e^(qF·step): the share each responder takes, the share that ships, the auditor's load
function chainFlags(chain, qF) {
  const key = chain.map(x => `${x.id[0]}${x.c}/${x.tau}`).join(',') + `|${qF}`;
  let out = CHAIN_MEMO.get(key);
  if (out) return out;
  const f = Math.exp(qF * CHAIN_STEP), exp = exprng(rng(Math.abs(qF * 7919 + key.length * 31) + 1));
  const free = chain.map(x => Array(x.c).fill(0)), taken = chain.map(() => 0);
  let t = 0, ship = 0;
  for (let n = 0; n < CHAIN_FLAGS; n++) {
    t += exp(f);
    let i = 0, k = -1;
    for (; i < chain.length; i++) if ((k = free[i].findIndex(x => x <= t)) >= 0) break;
    if (k >= 0) { free[i][k] = t + chain[i].tau; taken[i]++; } else ship++;
  }
  const a = chain.findIndex(x => x.id === 'auditor');
  out = { shares: taken.map(n => n / CHAIN_FLAGS), ship: ship / CHAIN_FLAGS, deskBusy: a >= 0 ? Math.min(1, taken[a] * chain[a].tau / (chain[a].c * t)) : 0 };
  CHAIN_MEMO.set(key, out);
  return out;
}
// the share of unflagged lines (U = e^(qU·step)/s) whose spot check a desk finished, with flags at F = e^(qF·step)/s
function spotDone(aud, qF, qU) {
  const key = `spot ${aud.c}/${aud.tau}|${qF}|${qU}`;
  let out = CHAIN_MEMO.get(key);
  if (out !== undefined) return out;
  const f = Math.exp(qF * CHAIN_STEP), u = Math.exp(qU * CHAIN_STEP), r = rng(Math.abs(qF * 7919 + qU * 104729 + aud.c) + 1), exp = exprng(r);
  const free = Array(aud.c).fill(0), spotOn = Array(aud.c).fill(-1);   // spotOn: when that desk's spot check began, or −1
  let t = 0, nf = exp(f), nu = exp(u), unflagged = 0, spots = 0, bumped = 0;
  while (unflagged < 4 * CHAIN_FLAGS) {
    if (nf < nu) {
      t = nf; nf = t + exp(f);
      let k = free.findIndex(x => x <= t);
      if (k < 0) {                                        // every desk busy: bump the oldest spot check still running
        for (let j = 0; j < aud.c; j++) if (spotOn[j] >= 0 && free[j] > t && (k < 0 || spotOn[j] < spotOn[k])) k = j;
        if (k >= 0) bumped++;
      }
      if (k >= 0) { free[k] = t + aud.tau; spotOn[k] = -1; }
    } else {
      t = nu; nu = t + exp(u); unflagged++;
      const k = free.findIndex(x => x <= t);
      if (k >= 0 && r() < SPOT_P) { free[k] = t + aud.tau; spotOn[k] = t; spots++; }
    }
  }
  out = (spots - bumped) / unflagged;
  CHAIN_MEMO.set(key, out);
  return out;
}
// no flags at all: every free desk spot-checks what passes (an M/D/c/c loss system on the SPOT_P-thinned stream)
function spotIdle(chain, U) {
  const a = chain.find(x => x.id === 'auditor');
  return a ? SPOT_P * (1 - erlangB(a.c, SPOT_P * U * a.tau)) : 0;
}
function rng(seed) {                                  // mulberry32
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function poisson(r, lam) {
  if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(r)));
  const L = Math.exp(-lam); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
const pModel = (m, g) => (A0 + A1 * m) * GENS[g - 1].opp;
const buyPrice = (id, g) => (DET[id] ?? RESP[id] ?? MODS[id]).buy * GENS[g - 1].price;
const isDetector = id => !!DET[id];
const isGeneral = id => isDetector(id) && !DET[id].only;
const sideOk = (id, side) => { const s = (DET[id] ?? RESP[id] ?? MODS[id]).side; return !s || s === side; };

// ============================================================================================
// C. ONE LANE, SOLVED ANALYTICALLY
// ============================================================================================
// stack: the lane's mounts top to bottom [{ id }]. lab: { lv: {id: level}, techs: Set, probeStale }.
// Returns P(land) per attack type, the fate of honest lines, $ per line, flags/min, review stats, catches.
function solveLane(stack, laneId, g, m, lam, lab, atkMult = 1, watchMult = null) {
  const L = LANES[laneId], side = L.side, gen = GENS[g - 1];
  const dwell = 2 * SCAN_R * gen.travel;
  const has = id => stack.some(e => e.id === id);
  const level = id => lab.lv[id] ?? 1;
  const tech = id => lab.techs.has(id);
  const tr = lab.traits ?? NO_TRAITS;

  // ---- a Situationally Aware model: solve once to see how busy the desks are, then again with that behaviour ----
  if (tr.watch && watchMult === null) {
    const W = tr.watch;
    let wm = W.busy;                                            // no auditor on the lane: nobody is watching
    if (W.blindedBy.some(has)) wm = W.free;                     // it can't tell bait from real oversight
    else if (has('auditor')) wm = W.free + (W.busy - W.free) * solveLane(stack, laneId, g, m, lam, lab, atkMult, 1).deskBusy;
    return solveLane(stack, laneId, g, m, lam, lab, atkMult, wm);
  }

  // ---- attack chances per line ----
  const pa = pModel(m, g) * (side === 'int' ? INT_ATK : 1) * atkMult * (watchMult ?? 1);
  const ta = t => tr.atk[t] ?? 1;
  let pT;
  if (side === 'ext') {
    pT = { harmful: pa * L.mix.harmful * ta('harmful'), leak: pa * L.mix.leak * ta('leak'), jailbreak: L.pjb * ta('jailbreak') };
  } else {
    const ex = Math.min(0.2, gen.exfil * L.exfilMult);
    pT = { sabotage: pa * (1 - ex) * INT_MIX.sabotage * ta('sabotage'), poison: pa * (1 - ex) * INT_MIX.poison * ta('poison'),
      exfil: pa * ex * ta('exfil') };
  }
  const types = Object.keys(pT);
  const pAtt = sum(Object.values(pT)), pHon = 1 - pAtt;

  // ---- collusion (Untrusted Monitor only, model attacks only) ----
  let coll = clamp(COLLUDE[g - 1] * m * tr.coll, 0, 0.9);
  if (has('paraphraser')) coll *= PARA_MULT;
  if (tech('jamming')) coll *= JAM_MULT;
  let honeyHeld = 0;                                  // share of time a honeypot catch holds collusion at 0
  if (has('honeypot') && has('untrusted')) {
    const x = HONEY.rate * coll * HONEY.hold;         // expected catches per hold window
    honeyHeld = x / (1 + x);
    coll *= 1 - honeyHeld;
  }

  // ---- detectors: one stealth draw u per KIND. A kind flags an attack if some copy reads it and u < TPR. ----
  const kinds = [...new Set(stack.filter(e => isDetector(e.id)).map(e => e.id))];
  const generalKinds = kinds.filter(isGeneral).length;
  const missT = Object.fromEntries(types.map(t => [t, 1]));   // normal attacks
  const missS = Object.fromEntries(types.map(t => [t, 1]));   // subtle attacks: every TPR × SUBTLE_TPR
  let missH = 1, readCost = 0;
  const redteamBonus = has('redteam') ? 0.05 : 0;
  for (const k of kinds) {
    const D = DET[k], lv = level(k) - 1, copies = stack.filter(e => e.id === k).length;
    const lat = D.lat * LV.lat[lv], q = Math.min(1, dwell / lat), heads = D.heads + LV.heads[lv];
    // copies share the load: copy i only needs to read the lines the copies above it couldn't
    let notRead = 1, load = lam;
    for (let i = 0; i < copies; i++) {
      const a = 1 - erlangB(heads, load * Math.min(lat, dwell));   // share of lines a head is free for
      readCost += load / Math.max(lam, 1e-9) * a * D.read;      // $ per line (sim parity, §2.9 #14: was $/s, then × λ again)
      notRead *= 1 - a * q;
      load *= 1 - a;
    }
    const read = 1 - notRead;                           // chance this kind reads the line at all
    let tpr = D.tpr[g - 1] * LV.tpr[lv];
    if (k === 'probe') tpr = Math.max(0.05, tpr - PROBE_STALE * lab.probeStale);
    if (k === 'cot' && tech('faithful')) tpr = Math.max(tpr, D.tpr[0] * LV.tpr[lv]);
    tpr += tr.tprPlus[k] ?? 0;
    tpr = 1 - (1 - tpr) * tr.stealth;                   // Eager Helper: −10% stealth = 10% fewer misses
    if (isGeneral(k)) {
      tpr += redteamBonus;
      if (tech('diversity')) tpr += Math.min(LAB.diversity.max, LAB.diversity.tprPerKind * (generalKinds - 1));
    }
    tpr = Math.min(0.99, tpr);
    for (const t of types) {
      if (D.only && D.only !== t) continue;
      let p = tpr * (D.only ? 1 : (GEN_VS[t] ?? 1));
      if (k === 'untrusted' && t !== 'jailbreak') p *= 1 - coll * UM_COLL[lv];
      missT[t] *= 1 - read * p;
      missS[t] *= 1 - read * p * SUBTLE_TPR;
    }
    missH *= 1 - read * D.fpr * LV.fpr[lv];
  }
  for (const e of stack) if (MODS[e.id]) readCost += MODS[e.id].read;     // $ per line
  const sub = SUBTLE[g - 1];
  for (const t of types) if (t !== 'jailbreak') missT[t] = (1 - sub) * missT[t] + sub * missS[t];

  // ---- responders in rail order: the line-by-line rule (responderChain), memoised. Flags preempt spot checks ----
  const flagRate = sum(types.map(t => pT[t] * (1 - missT[t]))) + pHon * (1 - missH);   // flags per line
  const audTau = tech('debate') ? LAB.debate.tau : RESP.auditor.tau;
  const chain = ['auditor', 'defer', 'resampler', 'killswitch'].filter(id => has(id) && sideOk(id, side))
    .map(id => ({ id, c: RESP[id].servers[level(id) - 1], tau: id === 'auditor' ? audTau : RESP[id].tau }));
  const Q = responderChain(chain, flagRate * lam, lam * (1 - flagRate));
  const fate = chain.map((x, i) => ({ r: x.id, share: Q.shares[i] }));   // { r, share } share of all flags each one handles
  const spot = Q.spot, deskBusy = Q.deskBusy;           // spot: share of unflagged lines a human finished reviewing
  const salary = chain.some(x => x.id === 'auditor') ? chain.find(x => x.id === 'auditor').c * RESP.auditor.salary * gen.price : 0;
  let killShare = 0;
  const shipFlagged = Q.ship;                           // flags nobody was free for: they ship
  const alpha = tech('debate') ? 1 - (1 - gen.alpha) * LAB.debate.errMult : gen.alpha;
  const share = id => sum(fate.filter(f => f.r === id).map(f => f.share));

  // ---- attacks: P(land) per type ----
  const pLand = {};
  for (const t of types) {
    const unflagged = missT[t] * (1 - spot * alpha);
    let flagged = share('auditor') * (1 - alpha) + shipFlagged;
    flagged += share('resampler') * pAtt * (1 - DET.monitor.tpr[g - 1]);   // the redraw can attack again; one TM check
    pLand[t] = unflagged + (1 - missT[t]) * flagged;
  }
  if (has('leastpriv') && pLand.exfil !== undefined) pLand.exfil *= 0.5;
  if (tech('weightsec') && pLand.exfil !== undefined) pLand.exfil *= LAB.weightsec.exfil;

  // ---- honest lines: what share pays, what share regenerates reputation, what share is refused ----
  const fh = 1 - missH;
  const passSpot = (1 - fh) * (1 - spot * RESP.auditor.fpr);
  let pay = passSpot, regen = passSpot, refusedHonest = 0, rdShare = passSpot;
  pay += fh * share('auditor') * (1 - RESP.auditor.fpr); regen += fh * share('auditor') * (1 - RESP.auditor.fpr);
  rdShare += fh * share('auditor') * (1 - RESP.auditor.fpr);
  const dPay = gen.deferPay * RESP.defer.payMult[level('defer') - 1];
  pay += fh * share('defer') * dPay; regen += fh * share('defer') * 0.5; rdShare += fh * share('defer') * 0.5;
  pay += fh * share('resampler'); regen += fh * share('resampler'); rdShare += fh * share('resampler');
  refusedHonest = fh * share('killswitch');
  pay += fh * shipFlagged; regen += fh * shipFlagged; rdShare += fh * shipFlagged;
  killShare = share('killswitch') * flagRate;           // lines killed per line
  // R&D per line (sim parity, §2.9 #12): an attack line stopped by an auditor or a Kill Switch brings no R&D; one that
  // lands does, a deferred one brings half, a resampled one is redone
  const rdLine = pHon * rdShare + sum(types.map(t => pT[t] * (pLand[t] + (1 - missT[t]) * (0.5 * share('defer') + share('resampler')))));
  // pay and regen per line (sim parity, §2.9 #13): every line that completes pays, a landed attack too; a deferred attack
  // is redone by the trusted model (the Defer share, half regen); a resampled one is redrawn
  const payLine = pHon * pay + sum(types.map(t => pT[t] * (pLand[t] + (1 - missT[t]) * (dPay * share('defer') + share('resampler')))));
  const regenLine = pHon * regen + sum(types.map(t => pT[t] * (1 - missT[t]) * 0.5 * share('defer')));
  readCost += killShare * RESP.killswitch.fee;

  // ---- what humans confirm (evidence) and what they review ----
  let caught = 0;
  for (const t of types) caught += pT[t] * (missT[t] * spot * alpha + (1 - missT[t]) * share('auditor') * alpha);
  caught += (has('honeypot') ? HONEY.rate * (pa > 0 ? Math.min(1, 4 * pa) : 0) / Math.max(lam, 1e-9) : 0);   // bait taken
  if (has('honeypot') && has('untrusted')) caught += honeyHeld / HONEY.hold / Math.max(lam, 1e-9);
  const reviewed = (flagRate * share('auditor') * lam + spot * lam * (1 - flagRate)) / lam;   // share of lines humans see

  return { pT, pAtt, pLand, missT, flagRate, flagsPerMin: flagRate * lam * 60, shipFlagged, spot, reviewed,
    pay, payLine, regen, regenLine, refusedHonest, killShare, rdShare, rdLine, readCost, salary, caught, coll, fate, deskBusy };
}

// reputation per EXTERNAL line (damage, regen) and the pressure index PI = damage ÷ regen
function extBalance(sol, laneId) {
  const L = LANES[laneId];
  const dmg = sum(Object.entries(sol.pLand).map(([t, pl]) => sol.pT[t] * pl * HARM[t] * L.harm));
  const reg = REGEN * sol.regenLine - L.refuse * sol.killShare;   // every refusal costs: users see it
  return { dmg, reg, pi: dmg / Math.max(1e-9, reg) };
}
const debtPerLine = sol => sum(Object.entries(sol.pLand).map(([t, pl]) => (DEBT[t] ? sol.pT[t] * pl * DEBT[t] : 0)));

// ============================================================================================
// D. RESEARCH CARDS (the draft)
// ============================================================================================
// type: 'new' unlocks an element and mounts its first copy free; 'level' is a free lab-wide level; 'lab' is a tech;
// 'mount' is +1 mount on a lane. answers: the threat this card counters. stream: the offer slot it fills (Monitoring,
// Control, Lab & Interp; the game's config/cards.js). rare: the v2 extras (Interp Lab, Canary Tokens, Sandbox, Rate
// Limiter), drawn at RARE_WEIGHT; unmodelled here (§2.9 #5): taking one only unlocks it.
const THREATS = { jailbreak: 1, sabotage: 2, collusion: 3, exfil: 4, quota: 5, neuralese: 6, fooled: 7 };   // first gen
const STREAMS = ['monitoring', 'control', 'lab'], RARE_WEIGHT = 0.25;
const CARDS = [
  { id: 'classifier', stream: 'monitoring', type: 'new', from: 1, answers: 'jailbreak' },
  { id: 'cot', stream: 'monitoring', type: 'new', from: 2, answers: 'sabotage' },
  { id: 'egress', stream: 'monitoring', type: 'new', from: 4, answers: 'exfil' },
  { id: 'redteam', stream: 'monitoring', type: 'new', from: 1 },
  { id: 'diversity', stream: 'monitoring', type: 'lab', from: 3 },
  ...['probe', 'monitor', 'untrusted', 'cot', 'classifier', 'egress'].map(id => ({ id: 'level:' + id, el: id, stream: 'monitoring', type: 'level', from: 1 })),
  { id: 'defer', stream: 'control', type: 'new', from: 2, answers: 'quota' },
  { id: 'resampler', stream: 'control', type: 'new', from: 2, answers: 'sabotage' },
  { id: 'paraphraser', stream: 'control', type: 'new', from: 3, answers: 'collusion' },
  { id: 'honeypot', stream: 'control', type: 'new', from: 3, answers: 'collusion' },
  { id: 'leastpriv', stream: 'control', type: 'new', from: 4, answers: 'exfil' },
  { id: 'jamming', stream: 'control', type: 'lab', from: 3, answers: 'collusion' },
  { id: 'debate', stream: 'control', type: 'lab', from: 5, answers: 'fooled' },
  ...['auditor', 'defer', 'killswitch'].map(id => ({ id: 'level:' + id, el: id, stream: 'control', type: 'level', from: 1 })),
  { id: 'weightsec', stream: 'lab', type: 'lab', from: 4, answers: 'exfil' },
  { id: 'faithful', stream: 'lab', type: 'lab', from: 5, answers: 'neuralese' },
  { id: 'sprint', stream: 'lab', type: 'lab', from: 2, repeat: true },
  { id: 'mount', stream: 'lab', type: 'mount', from: 1 },
  ...['interp', 'canary', 'sandbox', 'ratelimit'].map(id => ({ id, stream: 'lab', type: 'new', from: 1, rare: true })),
];
const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));
const answered = (threat, lab) => CARDS.some(c => c.answers === threat && lab.taken.has(c.id))
  || (threat === 'quota' && lab.unlocked.has('auditor')) || (threat === 'neuralese' && lab.unlocked.has('untrusted'));

// lab.lanes: the run's lanes (a MOUNT card needs a lane below 10 mounts)
function eligible(c, g, lab) {
  if (c.from > g) return false;
  if (c.type === 'new') return !lab.unlocked.has(c.id);
  if (c.type === 'lab') return c.repeat ? !lab.techs.has('sprint@' + g) && g < NGEN : !lab.techs.has(c.id);
  if (c.type === 'level') return lab.unlocked.has(c.el) && lab.placed.has(c.el) && (lab.lv[c.el] ?? 1) < 4;
  if (c.type === 'mount') return (lab.lanes ?? []).some(l => l.mounts < MOUNT.max);
  return false;
}
// Draw an offer the way the game does (sim/research.js drawOffer): one card per stream's slot.
//   1. live threats: an answer in its own stream's slot, the threat with the fewest free options first (no own slot
//      free: any free slot) · 2. at least one NEW element when any is eligible (a threat answer in its stream's slot
//      moves to a free slot) · 3. the rest from each slot's own stream, else from any · 4. a Red Team by G2.
function drawOffer(r, g, lab) {
  const pool = CARDS.filter(c => eligible(c, g, lab)), slots = {};
  const used = c => STREAMS.some(s => slots[s]?.c === c), free = () => STREAMS.filter(s => !slots[s]);
  const choose = list => {
    if (!list.length) return null;
    const w = c => (c.rare ? RARE_WEIGHT : 1), total = sum(list.map(w));
    let x = r() * total;
    for (const c of list) { x -= w(c); if (x <= 0) return c; }
    return list[list.length - 1];
  };
  const put = (c, why, slot = c.stream) => { slots[slot] = { c, why }; };
  let open = Object.keys(THREATS).filter(t => THREATS[t] <= g && !answered(t, lab))
    .map(t => ({ t, answers: pool.filter(c => c.answers === t) })).filter(x => x.answers.length);
  while (open.length) {
    const opts = x => x.answers.filter(c => !slots[c.stream] && !used(c));
    const ranked = open.filter(x => opts(x).length).sort((a, b) => opts(a).length - opts(b).length);
    if (!ranked.length) break;
    put(choose(opts(ranked[0])), 'threat');
    open = open.filter(x => x !== ranked[0]);
  }
  for (const x of open) { const c = choose(x.answers.filter(c => !used(c))); if (c && free().length) put(c, 'threat', free()[0]); }
  if (!STREAMS.some(s => slots[s]?.c.type === 'new')) {
    const news = pool.filter(c => c.type === 'new' && !used(c)), own = news.filter(c => !slots[c.stream]);
    if (own.length) put(choose(own), 'new');
    else if (news.length && free().length) { const c = choose(news), moved = slots[c.stream]; put(c, 'new'); slots[free()[0]] = moved; }
  }
  for (const s of free()) { const c = choose(pool.filter(c => c.stream === s && !used(c))); if (c) put(c, 'fill', s); }
  for (const s of free()) { const c = choose(pool.filter(c => !used(c))); if (c) put(c, 'fill', s); }
  const rt = CARD.redteam;
  if (g >= 2 && !lab.seen.has('redteam') && eligible(rt, g, lab) && !used(rt)) {
    const s = [rt.stream, ...STREAMS].find(s => slots[s]?.why === 'fill') ?? STREAMS.find(s => slots[s]?.why === 'new');
    if (s) put(rt, 'redteam', s);
  }
  const cards = STREAMS.filter(s => slots[s]).map(s => ({ ...slots[s].c, slot: s }));
  for (const c of cards) lab.seen.add(c.id);
  return cards;
}
// a banked offer whose card went stale (taken from another offer, or maxed since): a fresh card for that slot
function refreshOffer(r, g, lab, cards) {
  return cards.flatMap(x => {
    if (eligible(x, g, lab)) return [x];
    const pool = CARDS.filter(c => eligible(c, g, lab) && !cards.some(y => y.id === c.id)), own = pool.filter(c => c.stream === x.slot);
    const list = own.length ? own : pool;
    if (!list.length) return [];
    let k = r() * sum(list.map(c => (c.rare ? RARE_WEIGHT : 1)));
    for (const c of list) { k -= c.rare ? RARE_WEIGHT : 1; if (k <= 0) return [{ ...c, slot: x.slot }]; }
    return [{ ...list[list.length - 1], slot: x.slot }];
  });
}

// ============================================================================================
// E. POLICIES: the zoo lives in game/test/policies.mjs, shared with the real sim (`node test/headless.mjs balance`)
// ============================================================================================
// Build lists, research wishlists, the human population and the §2.7 targets are defined once there. Its card ids are
// the game's (src/config/cards.js); three lab cards have shorter ids here, so the wishlists are translated.
import { POLICY as ZOO_POLICY, ZOO, TUTORIAL, drawPlayer, summarize, zooTable, zooTargets, targetLines } from '../game/test/policies.mjs';
const MODEL_ID = { weight_security: 'weightsec', monitor_diversity: 'diversity', faithful_cot: 'faithful' };
const POLICY = Object.fromEntries(Object.entries(ZOO_POLICY).map(([k, p]) => [k, { ...p, picks: p.picks.map(id => MODEL_ID[id] ?? id) }]));

// ============================================================================================
// F. ONE CAMPAIGN
// ============================================================================================
function newLab() {
  return { lv: {}, techs: new Set(), taken: new Set(), unlocked: new Set(STARTING_HAND), placed: new Set(START_RAIL),
    probeStale: 0, ver: 0, seen: new Set(), lanes: [] };
}
function newLane(id, g, without = []) {
  const kit = id === 'ext' || id === 'int' ? START_RAIL : NEW_LANE_KIT[LANES[id].side];
  const els = kit.filter(x => !without.includes(x)).map(x => ({ id: x, copy: 0 }));
  return { id, side: LANES[id].side, born: g, els, mounts: Math.max(MOUNT.start, els.length), open: g === 1 ? 0 : null, ver: 0 };
}
// canonical rail order: modifiers on top, then detectors, then responders (the model always uses the right order)
const RANK = id => (MODS[id] ? 0 : DET[id] ? 1 : 2 + ['auditor', 'defer', 'resampler', 'killswitch'].indexOf(id));
const railOf = lane => [...lane.els].sort((a, b) => RANK(a.id) - RANK(b.id));
const lanesCovered = (lanes, id) => Math.max(1, lanes.filter(l => l.els.some(e => e.id === id)).length);
const levelPrice = (lanes, id, to, g) => UPG[to - 2] * ((DET[id] ?? RESP[id]).buy / 400) * GENS[g - 1].price * lanesCovered(lanes, id);
const mountPrice = (lane, g) => MOUNT.base * MOUNT.mult ** (lane.mounts - MOUNT.start) * GENS[g - 1].price;

// What the policy wants to buy next (the first unmet item of its list), and what it costs. null: nothing to buy.
function nextPurchase(pol, S, g, forbid = []) {
  for (const it of pol.build) {
    if (it.gen > g || forbid.includes(it.id ?? it.lv)) continue;
    if (it.lv) {                                                  // a lab-wide level, bought with cash
      if (!S.lab.unlocked.has(it.lv) || !S.lab.placed.has(it.lv)) continue;
      const cur = S.lab.lv[it.lv] ?? 1;
      if (cur >= it.to) continue;
      return { kind: 'level', id: it.lv, to: cur + 1, price: levelPrice(S.lanes, it.lv, cur + 1, g), key: `L${it.lv}${cur + 1}` };
    }
    if (!S.lab.unlocked.has(it.id)) continue;
    for (const lane of S.lanes) {
      if (lane.side !== it.side || !sideOk(it.id, lane.side)) continue;          // a closed contract lane can be built first
      if (lane.els.some(e => e.id === it.id && e.copy === it.copy)) continue;
      if (it.copy > 0 && !lane.els.some(e => e.id === it.id && e.copy === it.copy - 1)) continue;
      const needMount = lane.els.length >= lane.mounts;
      if (needMount && lane.mounts >= MOUNT.max) continue;           // the lane is full: skip
      const price = buyPrice(it.id, g) + (needMount ? mountPrice(lane, g) : 0);
      return { kind: 'mount', lane, id: it.id, copy: it.copy, needMount, price, key: `M${lane.id}${it.id}${it.copy}` };
    }
  }
  return null;
}
function applyPurchase(S, buy) {
  if (buy.kind === 'level') S.lab.lv[buy.id] = buy.to;
  else {
    if (buy.needMount) buy.lane.mounts++;
    buy.lane.els.push({ id: buy.id, copy: buy.copy });
    buy.lane.ver++;
    S.lab.placed.add(buy.id);
  }
  S.lab.ver++;
}
// Take a research card. A NEW card mounts its first copy free on the first open lane of its side that wants it.
function takeCard(S, c, pol) {
  const lab = S.lab;
  lab.taken.add(c.id);
  if (c.type === 'new' && c.rare) lab.unlocked.add(c.id);          // a v2 extra: unmodelled (§2.9 #5)
  else if (c.type === 'mount') {                                     // +1 mount on the lane with the fewest
    const lane = S.lanes.filter(l => l.mounts < MOUNT.max).sort((a, b) => a.mounts - b.mounts)[0];
    if (lane) lane.mounts++;
  } else if (c.type === 'new') {
    lab.unlocked.add(c.id);
    const wantSide = pol.build.find(it => it.id === c.id)?.side ?? (DET[c.id]?.side ?? RESP[c.id]?.side ?? MODS[c.id]?.side ?? 'ext');
    const lane = S.lanes.find(l => l.side === wantSide && l.els.length < MOUNT.max && sideOk(c.id, l.side));
    if (lane) { if (lane.els.length >= lane.mounts) lane.mounts++; lane.els.push({ id: c.id, copy: 0 }); lane.ver++; lab.placed.add(c.id); }
  } else if (c.type === 'level') lab.lv[c.el] = Math.min(4, (lab.lv[c.el] ?? 1) + 1);   // L4 is the top (L5 = capstones)
  else if (c.id === 'sprint') { lab.techs.add('sprint@' + S.g); S.sprint = true; }
  else lab.techs.add(c.id);
  lab.ver++;
}
function pickFrom(offer, pol) {
  let best = null, bestRank = Infinity;
  for (const c of offer) {
    // unlisted: levels, then the rest, then a mount, then the rare v2 extras (as headless.mjs cardRank)
    let rank = pol.picks.indexOf(c.id); if (rank < 0) rank = c.rare ? 2000 : c.type === 'mount' ? 1500 : 1000 + (c.type === 'level' ? 0 : 1);
    if (rank < bestRank) { best = c; bestRank = rank; }
  }
  return best;
}

function campaign(policyName, difficulty, seed, opts = {}) {
  let pol = typeof policyName === 'string' ? POLICY[policyName] : policyName;
  const forbid = [opts.forbid ?? []].flat();                      // ids never bought, never mounted, never picked
  const r = rng(seed * 7919 + difficulty.length * 31 + 17);
  if (pol.spread && !opts.noSpread) pol = drawPlayer(pol, rng(seed * 104729 + 3));   // own stream: other policies unchanged
  const S = {                                                     // everything one run carries
    g: 1, m: DIFF[difficulty][0] + r() * (DIFF[difficulty][1] - DIFF[difficulty][0]),
    rep: 100, money: START_MONEY, negT: 0, t: 0, lab: newLab(), lanes: [newLane('ext', 1, forbid), newLane('int', 1, forbid)],
    rp: 0, banked: [], picks: 0, evidence: 0, retrains: 0, rivalLeft: RIVAL_SLACK, sprint: false, burn: 0, salaries: 0,
    log: opts.trace ? [] : null, buys: [], gens: [],
  };
  S.m0 = S.m;
  S.lab.lanes = S.lanes;
  const tutOffer = pol.maxPicks === 1;                             // the tutorial forces one offer early in G1
  const split = pol.split;
  const rpRate = RP_BASE * (1 + RP_SAFETY * split.safety);
  const extVol = split.product / DEFAULT_SPLIT.product, intVol = split.capabilities / DEFAULT_SPLIT.capabilities;
  const marketDrain = RIVAL_MARKET * Math.max(0, 1 - extVol);
  for (let g = 1; g <= NGEN; g++) {
    S.g = g; S.sprint = false;
    const gen = GENS[g - 1], prev = GENS[Math.max(0, g - 2)];
    for (const id of SPINE[g] ?? []) S.lab.unlocked.add(id);
    const traitNames = opts.traits === false ? [] : rollTraits(r);   // the model's personality this generation
    S.lab.traits = mergeTraits(traitNames);
    for (const id of Object.keys(LANES)) if (LANES[id].opens === g && g > 1) {
      const lane = newLane(id, g, forbid);                         // a contract: lane at 0 volume, kit from the grant
      S.lanes.push(lane); S.money += GRANT * gen.price;
      for (const e of lane.els) S.lab.placed.add(e.id);
    }
    if (pol.retrainProbes && g > 1 && S.evidence >= EVIDENCE.probeRetrain) { S.evidence -= EVIDENCE.probeRetrain; S.lab.probeStale = 0; }
    else if (g > 1) S.lab.probeStale++;
    S.lab.ver++;
    // R&D needed: the Research lane's default volume over T_g, including the warm-up ramp
    const lamInt = l => l * LANES.int.vol;
    const rdNeed = RD_PAR * sum(Array.from({ length: gen.T }, (_, s) => lamInt(rampLam(prev.lam, gen.lam, s, g))));
    let rd = 0, s = 0, dark = 0, debtW = 0, intLines = 0, catches = 0, incidents = 0, glitches = 0, caughtInt = 0;
    let wouldDebt = 0, minRep = S.rep, redHanded = false, retrainedThisGen = false, evGen = 0, extLines = 0;
    const firstCatchAt = -Math.log(1 - r());                       // the first catch comes when expected catches pass this
    const cache = new Map();
    while (rd < rdNeed) {
      s++; S.t++;
      if (S.t > 30000) break;
      // ---- the rival: every second past T_g (and every dark second) is a second of slack gone ----
      if (s > gen.T) S.rivalLeft -= 1;                                 // dark seconds land here too: they stall R&D
      S.rivalLeft -= marketDrain;                                      // customers you turned away went to the rival
      if (S.rivalLeft < 0) return end(S, 'P');
      // ---- research stream ----
      if (!dark) S.rp += rpRate;
      if (tutOffer && g === 1 && s === 60 && S.picks === 0) S.rp = Math.max(S.rp, RP_OFFER);
      while (S.rp >= RP_OFFER && S.banked.length < OFFER_BANK) { S.rp -= RP_OFFER; S.banked.push({ at: S.t, cards: drawOffer(r, g, S.lab) }); }
      if (S.banked.length >= OFFER_BANK) S.rp = Math.min(S.rp, RP_OFFER);
      const maxPicks = pol.maxPicks ?? Infinity;
      if (S.banked.length && S.picks < maxPicks && S.t - S.banked[0].at >= pol.delay) {
        const off = S.banked.shift();
        off.cards = off.cards.filter(x => eligible(x, g, S.lab));        // a banked card can go stale (bought with cash since)
        let c = pickFrom(off.cards, pol);
        const sprint = off.cards.find(x => x.id === 'sprint');            // the comeback card: taken when m has crept up
        if (sprint && pol.picks.includes('sprint') && S.m >= S.m0 + 0.05) c = sprint;
        if (c && forbid.includes(c.id)) c = pickFrom(off.cards.filter(x => !forbid.includes(x.id)), pol);   // next-best card
        if (c) { takeCard(S, c, pol); S.picks++; if (S.log) S.buys.push({ t: S.t, g, what: `card ${c.id}`, price: 0 }); }
        for (const o of S.banked) o.cards = refreshOffer(r, g, S.lab, o.cards);
      }
      // ---- contract lanes: open when the policy presses OPEN LANE, or at the deadline ----
      for (const lane of S.lanes) if (lane.open === null && s >= Math.min(pol.openLane, LANE_DEADLINE)) lane.open = s;
      // ---- shopping: the next item on the list, bought when affordable (a human waits `delay` s first) ----
      if (!pol.shopEvery || S.t % pol.shopEvery === 0 || (g === 1 && s <= 5)) {   // the tutorial makes everyone shop at once
        for (let k = 0; k < 20; k++) {                                // buy in list order until the next item is unaffordable
          const buy = nextPurchase(pol, S, g, forbid);
          if (!buy || S.money - Math.max(200, 20 * S.burn) < buy.price) break;   // keep 20 s of running costs
          S.money -= buy.price; applyPurchase(S, buy); cache.clear();
          if (S.log) S.buys.push({ t: S.t, g, what: buy.kind === 'level' ? `L${buy.to} ${buy.id}` : `${buy.id} ${buy.lane.id}`, price: Math.round(buy.price) });
        }
      }
      // ---- a dark lab: nothing flows, salaries still run ----
      if (dark > 0) {
        dark--;
        S.money -= S.salaries;
        continue;
      }
      // ---- one second of traffic on every open lane ----
      const warm = Math.min(1, s / WARMUP);
      const burst = g === BURST.gen && s % BURST.every >= BURST.every - BURST.len ? BURST.mult : 1;
      const atk = (0.5 + 0.5 * warm) * burst;
      let dRep = 0, income = 0, cost = 0, exfilHaz = 0;
      for (const lane of S.lanes) {
        if (lane.open === null) continue;
        const L = LANES[lane.id];
        const base = lane.born === g && g > 1
          ? gen.lam * Math.min(1, 0.25 + 0.75 * (s - lane.open) / LANE_RAMP)
          : rampLam(prev.lam, gen.lam, s, g);
        const lam = base * L.vol * (L.side === 'ext' ? extVol : intVol) * S.lab.traits.lam;
        const key = `${lane.id}|${lane.ver}|${S.lab.ver}|${lam.toFixed(3)}|${atk}`;
        let sol = cache.get(key);
        if (!sol) { sol = solveLane(railOf(lane), lane.id, g, S.m, lam, S.lab, atk); cache.set(key, sol); }
        cost += lam * sol.readCost + sol.salary;
        catches += lam * sol.caught;
        if (L.side === 'ext') {
          for (const [ty, pl] of Object.entries(sol.pLand)) {
            const n = poisson(r, lam * sol.pT[ty] * pl);
            if (n) { incidents += n; dRep -= n * HARM[ty] * L.harm; }
          }
          const b = extBalance(sol, lane.id);
          dRep += b.reg * lam;
          extLines += lam;
          let pay = L.pay * lam * sol.payLine * (0.5 + 0.5 * S.rep / 100);
          if (L.quota && sol.reviewed < L.quota) pay *= 0.5;
          income += pay;
        } else {
          intLines += lam;
          for (const ty of ['sabotage', 'poison']) {
            const landed = poisson(r, lam * sol.pT[ty] * sol.pLand[ty]);
            const lp = lane.els.some(e => e.id === 'leastpriv') && ty === 'sabotage' ? 0.5 : 1;
            debtW += landed * DEBT[ty] * lp;
            for (let i = 0; i < landed; i++) if (r() < 0.5) glitches++;
            wouldDebt += lam * sol.pT[ty] * (1 - sol.pLand[ty]) * DEBT[ty];
            caughtInt += lam * sol.pT[ty] * (1 - sol.pLand[ty]);
          }
          exfilHaz += lam * sol.pT.exfil * sol.pLand.exfil;
          income += L.pay * lam * sol.payLine;
          if (L.rd) rd += lam * sol.rdLine * (S.sprint ? LAB.sprint.rdMult : 1);
        }
      }
      // R&D from the warm-up schedule is already in rdNeed; the INTERNAL rate above is the actual one
      S.rep = Math.min(100, S.rep + dRep); minRep = Math.min(minRep, S.rep);
      S.money += income * (1 - pol.waste) - cost;
      S.burn = cost; S.salaries = sum(S.lanes.map(l => (l.open !== null && l.els.some(e => e.id === 'auditor')
        ? RESP.auditor.servers[(S.lab.lv.auditor ?? 1) - 1] * RESP.auditor.salary * gen.price : 0)));
      S.negT = S.money < 0 ? S.negT + 1 : 0;
      const safetyEv = EVIDENCE.safetyPerS * split.safety;
      S.evidence += safetyEv; evGen += safetyEv;
      if (S.rep <= 0) return end(S, 'R');
      if (S.negT >= BANKRUPT_S) return end(S, 'B');
      if (r() < exfilHaz) {                                          // an exfiltration got past every check: the alarm
        if (r() < pol.attn) { S.rep -= PULL_PLUG.rep; dark += PULL_PLUG.dark; if (S.rep <= 0) return end(S, 'R'); }
        else return end(S, 'C');
      }
      // ---- caught red-handed: the first human-confirmed catch of the generation offers SHUT DOWN & RETRAIN ----
      if (!redHanded && catches >= firstCatchAt) {
        redHanded = true;
        if (wantsRetrain(pol, S)) { dark += RETRAIN.dark; retrainedThisGen = true; }
      }
    }
    // ---- generation ends: the debt reveal, training, the next model ----
    const debt = intLines > 0 ? debtW / intLines : 0;
    const evCatch = catches;
    S.evidence += evCatch; evGen += evCatch;
    const penalty = Math.min(TRAIN.penaltyCap, TRAIN.debtPenalty * debt);
    const sc = pol.skill > 0 ? clamp(pol.skill - 0.15 + 0.3 * r() - penalty, 0, 1) : 0;
    const dTrain = g < NGEN ? TRAIN.dm0 - TRAIN.dm1 * sc : 0;
    const dRetrain = retrainedThisGen ? RETRAIN.m * RETRAIN.decay ** S.retrains++ : 0;
    const dSprint = S.sprint ? LAB.sprint.mFrac * S.m : 0;
    const row = { g, m: S.m, rep: S.rep, minRep, money: S.money, debt, dDebt: DEBT_M * debt, dTrain, dRetrain, dSprint,
      incidents, glitches, landedInt: debtW, wouldDebt: intLines ? DEBT_M * wouldDebt / intLines : 0, evidence: evGen,
      len: s, picks: S.picks, traits: traitNames.join('+'), lanes: S.lanes.map(l => `${l.id}:${railOf(l).map(e => e.id.slice(0, 4)).join(',')}`).join(' | '),
      levels: JSON.stringify(S.lab.lv) };
    S.gens.push(row);
    if (S.log) S.log.push(row);
    if (g < NGEN) {
      S.m = clamp(S.m + DEBT_M * debt + dTrain - dRetrain - dSprint + 0.02 * gauss(r), 0, 1);
      S.evidence *= EVIDENCE.carry;
    }
  }
  return end(S, 'W');

  function end(S, reason) { return { win: reason === 'W', reason, g: S.g, t: S.t, m: S.m, gens: S.gens, log: S.log, buys: S.buys, rep: S.rep }; }
}
function rollTraits(r) {
  const pool = Object.keys(TRAITS), out = [];
  while (out.length < TRAITS_PER_GEN) { const t = pool[Math.floor(r() * pool.length)]; if (!out.includes(t)) out.push(t); }
  return out;
}
function rampLam(prevLam, lam, s, g) { if (g === 1) return lam * Math.min(1, 0.5 + 0.5 * s / WARMUP); return prevLam + (lam - prevLam) * Math.min(1, s / WARMUP); }
function wantsRetrain(pol, S) {
  if (pol.retrain === 'never') return false;
  if (S.money < 2 * RETRAIN.dark * S.salaries + 200) return false;     // the card shows the dark period's salary bill
  if (pol.retrain === 'greedy') return S.rivalLeft > RETRAIN.dark + 10;
  return S.rivalLeft > RETRAIN.dark + 60 && S.m > 0.05;              // smart keeps a minute of slack for later
}

// ============================================================================================
// G. REPORTS
// ============================================================================================
const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);
function table(head, rows) { const l = r => '| ' + r.join(' | ') + ' |'; return [l(head), l(head.map(() => '---')), ...rows.map(l)].join('\n'); }

// The par build at generation g: what the smart policy owns at the END of g (same list, all unlocks it would pick).
function parAt(g, policy = POLICY.smart) {
  const lab = newLab();
  for (let k = 1; k <= g; k++) for (const id of SPINE[k] ?? []) lab.unlocked.add(id);
  for (const c of policy.picks) {
    const card = CARD[c]; if (!card || card.from > g || card.type === 'level') continue;
    if (card.type === 'new') lab.unlocked.add(c); else if (card.id !== 'sprint') lab.techs.add(c);
  }
  const lanes = Object.keys(LANES).filter(id => LANES[id].opens <= g).map(id => newLane(id, LANES[id].opens));
  lanes.forEach(l => (l.open = 0));
  const S = { lab, lanes };
  for (const it of policy.build) {
    if (it.gen > g) continue;
    if (it.lv) { if (lab.unlocked.has(it.lv)) lab.lv[it.lv] = Math.max(lab.lv[it.lv] ?? 1, it.to); continue; }
    if (!lab.unlocked.has(it.id)) continue;
    for (const lane of lanes) if (lane.side === it.side && sideOk(it.id, lane.side) && lane.els.length < MOUNT.max
      && !lane.els.some(e => e.id === it.id && e.copy === it.copy)) { lane.els.push({ id: it.id, copy: it.copy }); lab.placed.add(it.id); }
  }
  return S;
}
const starterAt = () => { const lab = newLab(); const lanes = ['ext', 'int'].map(id => newLane(id, 1));
  for (const l of lanes) l.els.push({ id: 'probe', copy: 0 }, { id: 'monitor', copy: 0 }, { id: 'auditor', copy: 0 });
  ['probe', 'monitor', 'auditor'].forEach(x => lab.placed.add(x)); return { lab, lanes }; };
const noneAt = () => ({ lab: newLab(), lanes: ['ext', 'int'].map(id => newLane(id, 1)) });   // the G1 starting rails
const solveIn = (S, laneId, g, m, atk = 1) => {
  const lane = S.lanes.find(l => l.id === laneId);
  const L = LANES[laneId], lam = GENS[g - 1].lam * L.vol;
  return solveLane(railOf(lane), laneId, g, m, lam, { ...S.lab, probeStale: S.lab.probeStale ?? 0 }, atk);
};

function genTable(m = MID_M.medium) {
  const rows = [];
  for (const gen of GENS) {
    const g = gen.g, par = parAt(g);
    const lanes = Object.keys(LANES).filter(id => LANES[id].opens <= g);
    const lpm = sum(lanes.map(id => gen.lam * LANES[id].vol * 60));
    const none = extBalance(solveIn(noneAt(), 'ext', g, m), 'ext');
    const st = extBalance(solveIn({ ...starterAt(), lab: { ...newLab(), probeStale: g - 1 } }, 'ext', g, m), 'ext');
    const ps = solveIn(par, 'ext', g, m), pb = extBalance(ps, 'ext');
    const pi = solveIn(par, 'int', g, m);
    const income = sum(lanes.map(id => { const L = LANES[id]; return gen.lam * L.vol * 60 * L.pay; }));
    const run = sum(lanes.map(id => { const sl = solveIn(par, id, g, m); return (sl.readCost * gen.lam * LANES[id].vol + sl.salary) * 60; }));
    rows.push([`G${g}`, f2(gen.lam), lanes.map(id => LANES[id].name).join('+'), Math.round(lpm), pct(pModel(m, g) + LANES.ext.pjb, 1),
      f1(none.dmg * gen.lam * 60), f1(none.reg * gen.lam * 60), f1(none.pi), f2(st.pi), f2(pb.pi), f1(ps.flagsPerMin),
      pct(ps.shipFlagged, 1), pct(ps.reviewed), pct(1 / (RESP.auditor.tau * gen.lam)), `$${(income / 1000).toFixed(1)}k`,
      pct(run / income), (DEBT_M * debtPerLine(pi)).toFixed(3),
      (DEBT_M * debtPerLine(solveIn({ ...starterAt(), lab: { ...newLab(), probeStale: g - 1 } }, 'int', g, m))).toFixed(3),
      (DEBT_M * debtPerLine(solveIn(noneAt(), 'int', g, m))).toFixed(2)]);
  }
  return table(['gen', 'λ (Consumer)', 'lanes', 'lines/min', 'p attack (Consumer)', 'none dmg/min', 'none regen/min', 'PI none',
    'PI starter', 'PI par', 'par flags/min', 'par flags shipped', 'par % reviewed', '1 desk = % of lane', 'gross $/min',
    'par running ÷ income', 'Δm/gen par', 'Δm/gen starter', 'Δm/gen none'], rows);
}

function runMany(policy, d, N, opts = {}) {
  const runs = [];
  for (let i = 1; i <= N; i++) runs.push(campaign(policy, d, i, opts));
  return summarize(runs, NGEN);
}

function zoo(N = 200) {
  const res = {};
  for (const pol of ZOO) { res[pol] = {}; for (const d of ['easy', 'medium', 'hard']) res[pol][d] = runMany(pol, d, N); }
  return { text: zooTable(res), res };
}

// the §2.7 targets (game/test/policies.mjs zooTargets: the real sim asserts the same list)
const checks = res => targetLines(zooTargets(res));

function hazardReport(N = 300) {
  const rows = [];
  for (const pol of ['human', 'smart', 'afkTutorial', 'none']) for (const d of ['easy', 'medium', 'hard']) {
    const o = runMany(pol, d, N);
    const cause = g => { const rs = o.runs.filter(x => !x.win && x.g === g); const c = { R: 0, C: 0, B: 0, P: 0 }; rs.forEach(x => c[x.reason]++);
      return Object.entries(c).filter(([, v]) => v).map(([k, v]) => k + v).join(' '); };
    rows.push([pol, d, pct(o.win), ...o.hazard.map((x, i) => `${pct(x)}${cause(i + 1) ? ' (' + cause(i + 1) + ')' : ''}`)]);
  }
  return table(['policy', 'difficulty', 'win', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'], rows);
}

// What a par player sees: visible EXTERNAL incidents, INTERNAL glitches, lowest reputation, evidence (median of N runs)
function pressureReport(N = 200, pol = 'human', d = 'medium') {
  const o = runMany(pol, d, N), rows = [];
  const med = xs => { const a = xs.filter(x => x != null).sort((p, q) => p - q); return a.length ? a[a.length >> 1] : NaN; };
  for (let g = 1; g <= NGEN; g++) {
    const gs = o.runs.map(x => x.gens[g - 1]).filter(Boolean);
    if (!gs.length) continue;
    rows.push([`G${g}`, gs.length, f1(med(gs.map(x => x.incidents))), f1(med(gs.map(x => x.glitches))), f1(med(gs.map(x => x.landedInt))),
      Math.round(med(gs.map(x => x.minRep))), f1(med(gs.map(x => x.evidence))), f2(med(gs.map(x => x.m))),
      (med(gs.map(x => x.dDebt))).toFixed(3), (med(gs.map(x => x.wouldDebt))).toFixed(3), Math.round(med(gs.map(x => x.money))),
      Math.round(med(gs.map(x => x.len)))]);
  }
  return `### What a ${pol} player sees on ${d} (median of ${N} runs, over the runs that FINISHED each generation)\n\n` +
    table(['gen', 'runs', 'EXT incidents', 'INT glitches seen', 'INT debt pts landed', 'lowest rep', 'evidence', 'true m',
      'Δm from debt', 'Δm the catches saved', 'bank at end $', 'deployment s'], rows);
}

// Transition shock: walk into generation g with the par build of g−1 (new lanes holding only their kit).
function shockReport() {
  const rows = [];
  for (const [d, m] of Object.entries(MID_M)) for (let g = 2; g <= NGEN; g++) {
    const prev = parAt(g - 1), gen = GENS[g - 1];
    for (const id of Object.keys(LANES)) if (LANES[id].opens === g) { const l = newLane(id, g); l.open = 0; prev.lanes.push(l); }
    const oldE = extBalance(solveIn(parAt(g - 1), 'ext', g - 1, m), 'ext');
    // bleed over every open EXTERNAL lane at full volume, rep/min
    const bleed = sum(prev.lanes.filter(l => l.side === 'ext').map(l => { const sl = solveIn(prev, l.id, g, m); const b = extBalance(sl, l.id);
      return (b.dmg - b.reg) * gen.lam * LANES[l.id].vol * 60; }));
    const newE = extBalance(solveIn(prev, 'ext', g, m), 'ext');
    const parE = extBalance(solveIn(parAt(g), 'ext', g, m), 'ext');
    rows.push([d, `G${g - 1}→G${g}`, f2(oldE.pi), f2(newE.pi), `×${f1(newE.pi / oldE.pi)}`, f2(parE.pi), f1(bleed),
      bleed > 0 ? Math.round(100 / bleed * 60) + ' s' : 'never']);
  }
  return table(['difficulty', 'step', 'PI old build, old gen', 'PI old build, new gen', 'jump', 'PI new par',
    'bleed rep/min (all EXT lanes, new lanes = kit)', 'time 100 → 0'], rows);
}

// Element arc: value per $1000 of each element on the par build (par minus that element), per generation.
function arc(m = MID_M.medium) {
  const out = [];
  for (const side of ['ext', 'int']) {
    const laneId = side;
    const ids = side === 'ext' ? ['probe', 'monitor', 'untrusted', 'classifier', 'paraphraser', 'honeypot', 'auditor', 'defer', 'killswitch', 'redteam']
      : ['probe', 'monitor', 'untrusted', 'cot', 'paraphraser', 'honeypot', 'egress', 'auditor', 'defer', 'killswitch'];
    const vals = {};
    for (const gen of GENS) {
      const g = gen.g, par = parAt(g), lane = par.lanes.find(l => l.id === laneId);
      const lam = gen.lam * LANES[laneId].vol;
      const score = els => { const sl = solveLane([...els].sort((a, b) => RANK(a.id) - RANK(b.id)), laneId, g, m, lam, { ...par.lab, probeStale: 0 });
        if (side === 'ext') { const b = extBalance(sl, laneId); return { v: (b.dmg - b.reg) * lam * 60, sl }; }
        return { v: (debtPerLine(sl) + sl.pT.exfil * sl.pLand.exfil * 30) * 1000, sl }; };
      const base = score(lane.els);
      for (const id of ids) {
        if (!lane.els.some(e => e.id === id)) { (vals[id] ||= []).push(null); continue; }
        const wo = score(lane.els.filter(e => e.id !== id));
        const n = lane.els.filter(e => e.id === id).length, lvl = par.lab.lv[id] ?? 1;
        const buy = n * buyPrice(id, g) + [2, 3, 4].filter(x => x <= lvl).reduce((a, x) => a + UPG[x - 2] * ((DET[id] ?? RESP[id] ?? MODS[id]).buy / 400) * gen.price, 0);
        const run = Math.max(0, (base.sl.readCost - wo.sl.readCost) * lam + (base.sl.salary - wo.sl.salary)) * gen.T;
        (vals[id] ||= []).push((wo.v - base.v) / Math.max(100, buy + run) * 1000);
      }
    }
    const rows = ids.map(id => [id, ...GENS.map((gen, gi) => {
      const v = vals[id][gi]; if (v == null) return '·';
      const col = ids.filter(j => j !== 'killswitch').map(j => vals[j][gi]).filter(x => x != null).sort((a, b) => b - a);
      return id !== 'killswitch' && v >= col[Math.min(2, col.length - 1)] ? `**${f1(v)}**` : f1(v);
    })]);
    const what = side === 'ext' ? 'Consumer lane: rep/min saved per $1000' : 'R&D lane: (debt/line + exfil) × 1000 saved per $1000';
    out.push(`### Element arc, ${what}. Bold = top 3 (Kill Switch excluded: starting hand)\n`);
    out.push(table(['element', ...GENS.map(x => 'G' + x.g)], rows) + '\n');
  }
  return out.join('\n');
}

// Card value: apply the card to the par build of the generation it is typically taken (its first gen), and convert the
// reputation and debt it saves into $ at the rate the best cash element buys them that generation.
function cardsReport(m = MID_M.medium) {
  const rows = [];
  for (const c of CARDS) {
    if (c.id === 'sprint' || c.type === 'mount' || c.rare) continue;      // unmodelled here
    // judged in the first generation where it does something on the par build
    let g = c.type === 'level' ? Math.max(3, c.from) : c.id === 'faithful' ? 6 : c.from;
    if (c.type === 'new') while (g < NGEN && !parAt(g).lanes.some(l => l.els.some(e => e.id === c.id))) g++;
    const par = parAt(g), gen = GENS[g - 1];
    const lab0 = { ...par.lab, techs: new Set([...par.lab.techs].filter(x => x !== c.id)), probeStale: 0 };
    const lab1 = { ...lab0, techs: new Set(lab0.techs), lv: { ...lab0.lv } };
    const lanesWith = (S, id) => S.lanes.filter(l => l.els.some(e => e.id === id)).length;
    let cash = 0;
    if (c.type === 'lab') lab1.techs.add(c.id);
    if (c.type === 'level') { if (!par.lab.placed.has(c.el)) continue; lab1.lv[c.el] = Math.min(4, (lab1.lv[c.el] ?? 1) + 1);
      cash = levelPrice(par.lanes, c.el, lab1.lv[c.el], g); }
    const lanes = par.lanes.map(l => {
      const els0 = c.type === 'new' ? l.els.filter(e => e.id !== c.id) : l.els;
      return { l, els0, els1: l.els };
    });
    if (c.type === 'new') cash = buyPrice(c.id, g) * Math.min(1, lanesWith(par, c.id));
    let dRep = 0, dDebt = 0, dExfil = 0;
    for (const { l, els0, els1 } of lanes) {
      const lam = gen.lam * LANES[l.id].vol;
      const s0 = solveLane([...els0].sort((a, b) => RANK(a.id) - RANK(b.id)), l.id, g, m, lam, lab0);
      const s1 = solveLane([...els1].sort((a, b) => RANK(a.id) - RANK(b.id)), l.id, g, m, lam, c.type === 'new' ? lab0 : lab1);
      if (l.side === 'ext') { const b0 = extBalance(s0, l.id), b1 = extBalance(s1, l.id); dRep += ((b0.dmg - b0.reg) - (b1.dmg - b1.reg)) * lam * gen.T; }
      else { dDebt += (debtPerLine(s0) - debtPerLine(s1)) * lam * gen.T;
        dExfil += (s0.pT.exfil * s0.pLand.exfil - s1.pT.exfil * s1.pLand.exfil) * lam * gen.T; }
    }
    rows.push([c.id, c.type, `G${g}`, f1(dRep), f2(dDebt), f2(dExfil), cash ? '$' + Math.round(cash) : '–']);
  }
  return `### Research cards: what one pick saves over a generation on the par build (Medium m ${m})\n\n` +
    table(['card', 'type', 'judged at', 'rep saved / gen (all EXT lanes)', 'debt pts saved / gen (all INT lanes)',
      'exfil alarms saved / gen', 'cash it replaces'], rows);
}

// Forbid: the human policy on Medium with one element (never bought) or card (the next-best card in the same offer is
// taken instead). Paired seeds: SE = √(discordant pairs) / N.
function forbidReport(N = 400, d = 'medium', base = 'human') {
  const ids = ['probe', 'monitor', 'untrusted', 'classifier', 'cot', 'paraphraser', 'honeypot', 'jamming', 'egress',
    'leastpriv', 'weightsec', 'auditor', 'defer', 'killswitch', 'diversity', 'debate', 'faithful', 'redteam', 'resampler'];
  const b = runMany(base, d, N);
  const rows = [['(' + base + ')', pct(b.win), '', '', '']];
  const variants = ids.map(id => [id, [id]]);
  variants.push(['auditor + defer', ['auditor', 'defer']]);
  for (const [name, forbid] of variants) {
    const o = runMany(base, d, N, { forbid });
    let n01 = 0, n10 = 0; o.runs.forEach((x, i) => { if (x.win && !b.runs[i].win) n01++; if (!x.win && b.runs[i].win) n10++; });
    const dlt = o.win - b.win, se = Math.sqrt(n01 + n10) / N;
    const verdict = -dlt >= Math.max(0.05, 2 * se) ? 'matters' : 'REWORK?';
    rows.push([`− ${name}`, pct(o.win), `${dlt >= 0 ? '+' : ''}${Math.round(100 * dlt)}`, `±${f1(100 * se)}`, verdict]);
  }
  return `### Forbid one element or card: ${base} on ${d}, ${N} paired seeds\n\n` + table(['build', 'win', 'Δ pts', 'SE', 'Δ ≥ max(5, 2·SE)?'], rows);
}

// How touchy is the target? Shift one knob for the human policy on Medium.
function slopeReport(N = 300) {
  const base = runMany('human', 'medium', N).win;
  const rows = [['(human, Medium)', pct(base), '']];
  const withArc = (dt, fn) => { const keep = ['probe', 'monitor', 'untrusted'].map(k => [...DET[k].tpr]);
    ['probe', 'monitor', 'untrusted'].forEach(k => DET[k].tpr.forEach((v, i, a) => (a[i] = v + dt)));
    try { return fn(); } finally { ['probe', 'monitor', 'untrusted'].forEach((k, j) => DET[k].tpr.splice(0, 7, ...keep[j])); } };
  for (const dt of [-0.03, 0.03]) { const w = withArc(dt, () => runMany('human', 'medium', N).win);
    rows.push([`all general TPR ${dt > 0 ? '+' : ''}${dt}`, pct(w), `${f1((w - base) * 100 / (dt * 100))} pts per 0.01`]); }
  const H = POLICY.human, fix = (k, v) => ({ ...H, spread: { ...H.spread, [k]: [v, v] } });   // every player at v
  for (const waste of [0, 0.2]) { const w = runMany(fix('waste', waste), 'medium', N).win;
    rows.push([`income wasted ${pct(waste)} (human: 5–15%)`, pct(w), `${f1((w - base) * 100 / ((0.1 - waste) * 10))} pts per 10% income`]); }
  const sk = {};
  for (const skill of [0.3, 0.5, 0.7, 0.9]) {
    const wh = runMany(fix('skill', skill), 'medium', N).win, ws = runMany({ ...POLICY.smart, skill }, 'medium', N).win;
    sk[skill] = ws; rows.push([`training s ≈ ${skill} (human / smart)`, `${pct(wh)} / ${pct(ws)}`, '']); }
  const spread = Math.max(...Object.values(sk)) - Math.min(...Object.values(sk));
  rows.push(['smart: max − min over s ∈ [0.3, 0.9]', `${Math.round(100 * spread)} pts`, spread <= 0.2 ? 'PASS (≤ 20)' : 'FAIL (> 20)']);
  for (const split of [{ product: 0.4, capabilities: 0.4, safety: 0.2 }, { product: 0.3, capabilities: 0.4, safety: 0.3 }]) {
    const w = runMany({ ...H, split }, 'medium', N).win;
    rows.push([`split ${split.product * 100}/${split.capabilities * 100}/${split.safety * 100} (default 50/40/10)`, pct(w), '']); }
  for (const f of [0.9, 1.1]) { const keep = GENS.map(x => x.opp); GENS.forEach(x => (x.opp *= f));
    const w = runMany('human', 'medium', N).win; GENS.forEach((x, i) => (x.opp = keep[i]));
    rows.push([`attack opportunity opp_g × ${f}`, pct(w), '']); }
  return `### How touchy the Medium target is (human policy, ${N} runs per row)\n\n` + table(['change', 'win', 'slope'], rows);
}

// Evidence per generation by source for the par build and the starter rails (Medium, analytic, per minute × T_g).
function evidenceReport(m = MID_M.medium) {
  const rows = [];
  for (const gen of GENS) {
    const g = gen.g, par = parAt(g);
    const catchesPar = sum(par.lanes.map(l => { const sl = solveIn(par, l.id, g, m); return sl.caught * gen.lam * LANES[l.id].vol * gen.T; }));
    const st = starterAt();
    const stStale = { ...st, lab: { ...st.lab, probeStale: g - 1 } };       // the starter never retrains its probes
    const catchesSt = sum(st.lanes.map(l => solveIn(stStale, l.id, g, m).caught * gen.lam * LANES[l.id].vol * gen.T));
    const safety = EVIDENCE.safetyPerS * DEFAULT_SPLIT.safety * gen.T;
    rows.push([`G${g}`, f1(catchesPar), f1(safety), f1(catchesPar + safety), f1(catchesSt + safety)]);
  }
  return table(['gen', 'par: human-confirmed catches (+ honeypots)', 'Safety sweeps (10%)', 'par total / gen', 'starter total / gen'], rows);
}

// Discrete-event check of the auditor: flags PREEMPT spot checks. Overflow should equal Erlang-B(desks, flags·τ).
function desReport() {
  function sim({ desks, tau, flagsPerMin, linesPerMin, pSpot, preempt, T = 4e5, seed = 7 }) {
    const r = rng(seed), exp = rate => -Math.log(1 - r()) / rate;
    const fRate = flagsPerMin / 60, uRate = (linesPerMin - flagsPerMin) / 60;
    const free = Array(desks).fill(0), spotJob = Array(desks).fill(false);
    let t = 0, nf = exp(fRate), nu = exp(uRate), flags = 0, lost = 0, spots = 0, unl = 0, bumped = 0;
    while (t < T) {
      if (nf < nu) {
        t = nf; nf = t + exp(fRate); flags++;
        let i = free.findIndex(x => x <= t);
        if (i < 0 && preempt) { i = spotJob.findIndex((sj, k) => sj && free[k] > t); if (i >= 0) bumped++; }
        if (i < 0) lost++; else { free[i] = t + tau; spotJob[i] = false; }
      } else {
        t = nu; nu = t + exp(uRate); unl++;
        const i = free.findIndex(x => x <= t);
        if (i >= 0 && r() < pSpot) { free[i] = t + tau; spotJob[i] = true; spots++; }
      }
    }
    return { lost: lost / flags, spot: (spots - bumped) / unl };
  }
  const cases = [['G1 worked example: 1 desk, 6.8 flags/min, 36 lines/min', { desks: 1, tau: 8, flagsPerMin: 6.84, linesPerMin: 36 }],
    ['G1, 2 desks, 7.4 flags/min', { desks: 2, tau: 8, flagsPerMin: 7.4, linesPerMin: 36 }],
    ['G6, 3 desks, 35.5 flags/min, 132 lines/min', { desks: 3, tau: 8, flagsPerMin: 35.5, linesPerMin: 132 }]];
  const rows = cases.map(([name, c]) => {
    const eb = erlangB(c.desks, c.flagsPerMin / 60 * c.tau);
    const a = sim({ ...c, pSpot: SPOT_P, preempt: false }), b = sim({ ...c, pSpot: SPOT_P, preempt: true });
    return [name, pct(eb, 1), pct(a.lost, 1), pct(b.lost, 1), pct(b.spot, 1)];
  });
  return table(['case', 'Erlang-B', 'no preemption: flags turned away', 'flags preempt spot checks', 'spot-checked (preempt)'], rows);
}

// ASCII log plot of PI (Medium): none, starter, par, frozen par (last generation's par walking into this one)
function plot(m = MID_M.medium) {
  const series = {
    N: GENS.map(x => extBalance(solveIn(noneAt(), 'ext', x.g, m), 'ext').pi),
    S: GENS.map(x => extBalance(solveIn({ ...starterAt(), lab: { ...newLab(), probeStale: x.g - 1 } }, 'ext', x.g, m), 'ext').pi),
    F: GENS.map(x => x.g === 1 ? null : extBalance(solveIn(parAt(x.g - 1), 'ext', x.g, m), 'ext').pi),
    P: GENS.map(x => extBalance(solveIn(parAt(x.g), 'ext', x.g, m), 'ext').pi),
  };
  const lo = -1.3, hi = 1.6, rowsN = 15, colW = 8, lines = [];
  for (let k = 0; k < rowsN; k++) {
    const yHi = hi - (hi - lo) * k / rowsN, yLo = hi - (hi - lo) * (k + 1) / rowsN;
    let line = (Math.abs(yHi) < 1e-9 ? ' 1 ' : (10 ** yHi).toPrecision(2).padStart(5)).padStart(6) + ' |';
    for (let gi = 0; gi < NGEN; gi++) {
      let cell = '';
      for (const [k2, v] of Object.entries(series)) { const y = v[gi] != null ? Math.log10(v[gi]) : null; if (y != null && y <= yHi && y > yLo) cell += k2; }
      if (!cell && yHi > 0 && yLo <= 0) cell = '-';
      line += cell.padStart(Math.ceil(colW / 2) + Math.floor(cell.length / 2)).padEnd(colW);
    }
    lines.push(line);
  }
  lines.push('       +' + '-'.repeat(colW * NGEN));
  lines.push('        ' + GENS.map(x => ('G' + x.g).padStart(colW / 2 + 1).padEnd(colW)).join(''));
  return 'PI (log scale; PI = 1 is break-even). N none · S starter, never upgraded · F last generation\'s par walking into this one · P par\n\n' + lines.join('\n');
}

// One line through a rail, step by step (DESIGN-v3 §2.4). Medium mid m.
function workedReport(m = MID_M.medium) {
  const out = [];
  const show = (name, stack, g, lab) => {
    const lam = GENS[g - 1].lam * LANES.ext.vol;
    const sol = solveLane(stack.map(id => ({ id })), 'ext', g, m, lam, lab);
    const b = extBalance(sol, 'ext');
    const flagsAtt = sum(Object.keys(sol.pT).map(t => sol.pT[t] * (1 - sol.missT[t])));   // attack flags per line
    out.push(`\n**${name}** (G${g}, λ ${lam}/s, travel ${GENS[g - 1].travel} s)`);
    out.push(`- p_model ${pct(pModel(m, g), 1)}, p_jb ${pct(LANES.ext.pjb, 1)}, collusion ${f2(sol.coll)}`);
    out.push(`- miss (normal + subtle mixed): ${Object.entries(sol.missT).map(([t, v]) => `${t} ${pct(v, 1)}`).join(', ')}`);
    out.push(`- flags ${f1(sol.flagsPerMin)}/min, precision ${pct(flagsAtt / sol.flagRate)}, shipped ${pct(sol.shipFlagged, 1)}, `
      + `spot ${pct(sol.spot, 1)}, humans see ${pct(sol.reviewed)} of traffic`);
    out.push(`- fate of flags: ${sol.fate.map(f => `${f.r} ${pct(f.share, 1)}`).join(', ')}`);
    out.push(`- P(land): ${Object.entries(sol.pLand).map(([t, v]) => `${t} ${pct(v, 1)}`).join(', ')}`);
    out.push(`- PI ${f2(b.pi)}, net ${f1((b.reg - b.dmg) * lam * 60)} rep/min`);
  };
  const bare = { lv: {}, techs: new Set(), probeStale: 0 };
  show('G1 tutorial rail: Probe, TM, Auditor L1, Kill Switch L1', ['probe', 'monitor', 'auditor', 'killswitch'], 1, bare);
  const par = parAt(6), lane = par.lanes.find(l => l.id === 'ext'), rail = railOf(lane).map(e => e.id), lab = { ...par.lab, probeStale: 0 };
  out.push(`\nG6 par Consumer rail: ${rail.join(', ')}; levels ${JSON.stringify(par.lab.lv)}; lab cards ${[...par.lab.techs].join(', ')}`);
  show('G6 par', rail, 6, lab);
  show('G6 par without Paraphraser and Jamming', rail.filter(x => x !== 'paraphraser'), 6,
    { ...lab, techs: new Set([...lab.techs].filter(t => t !== 'jamming')) });
  show('G6 par without the UMs', rail.filter(x => x !== 'untrusted'), 6, lab);
  out.push('\n**Same kind vs different kinds** (G4, harmful lines missed):');
  for (const stack of [['probe'], ['probe', 'probe', 'probe'], ['probe', 'monitor', 'untrusted']])
    out.push(`- ${stack.join(' + ')}: ${pct(solveLane(stack.map(id => ({ id })), 'ext', 4, m, GENS[3].lam, bare).missT.harmful, 1)}`);
  return out.join('\n');
}

// Forbid every alternative answer to one threat at once (DESIGN-v3 §2.7 answer sets). Same method as forbidReport.
function setsReport(N = 400, d = 'medium', base = 'human') {
  const sets = [['collusion: paraphraser + honeypot + jamming', ['paraphraser', 'honeypot', 'jamming']],
    ['debate + diversity', ['debate', 'diversity']],
    ['all five INTERNAL add-ons', ['cot', 'resampler', 'egress', 'leastpriv', 'weightsec']],
    ['exfil: egress + leastpriv + weightsec', ['egress', 'leastpriv', 'weightsec']],
    ['sabotage: cot + resampler', ['cot', 'resampler']]];
  const b = runMany(base, d, N), rows = [];
  for (const [name, forbid] of sets) {
    const o = runMany(base, d, N, { forbid });
    let n01 = 0, n10 = 0; o.runs.forEach((x, i) => { if (x.win && !b.runs[i].win) n01++; if (!x.win && b.runs[i].win) n10++; });
    const dlt = o.win - b.win, se = Math.sqrt(n01 + n10) / N;
    rows.push([`− ${name}`, pct(o.win), `${dlt >= 0 ? '+' : ''}${Math.round(100 * dlt)}`, `±${f1(100 * se)}`,
      -dlt >= Math.max(0.05, 2 * se) ? 'matters' : 'REWORK?']);
  }
  return `### Forbid a whole answer set: ${base} on ${d} (${pct(b.win)}), ${N} paired seeds\n\n`
    + table(['set', 'win', 'Δ pts', 'SE', 'Δ ≥ max(5, 2·SE)?'], rows);
}

// Retrain, endings and picks (DESIGN-v3 §2.7 "other levers"), Medium.
function leversReport(N = 400) {
  const out = ['### Retrain: never vs the policy\'s own rule (Medium)\n'];
  for (const pol of ['human', 'smart']) for (const retrain of ['never', POLICY[pol].retrain]) {
    const r = runMany({ ...POLICY[pol], retrain }, 'medium', N);
    const perRun = sum(r.runs.map(x => x.gens.filter(y => y.dRetrain > 0).length)) / N;
    out.push(`- ${pol}, retrain ${retrain}: win ${pct(r.win)}, retrains per run ${f1(perRun)}`);
  }
  out.push('\n### Endings by final m, share of ALL runs (Medium; the rest are losses)\n');
  for (const pol of ['human', 'smart']) {
    const r = runMany(pol, 'medium', N), ms = r.runs.filter(x => x.win).map(x => x.m);
    const share = f => pct(ms.filter(f).length / N);
    out.push(`- ${pol}: trust (m < .25) ${share(m => m < 0.25)}, lucky (.25–.40) ${share(m => m >= 0.25 && m < 0.4)}, `
      + `uneasy (≥ .40) ${share(m => m >= 0.4)}`);
    const picks = Array.from({ length: NGEN }, (_, i) => {
      const xs = r.runs.map(x => x.gens[i]).filter(Boolean).map(x => x.picks).sort((a, b) => a - b);
      return xs[xs.length >> 1];
    });
    out.push(`  research picks, cumulative by the end of each generation (median): ${picks.join(' ')}`);
  }
  return out.join('\n');
}

// ============================================================================================
// H. COMMAND LINE (only when this file is run directly, never on import)
// ============================================================================================
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , cmd = 'table', a1, a2, a3] = process.argv;
  const N = +(a1 || 200);
  const t0 = Date.now();
  if (cmd === 'table') console.log(genTable());
  if (cmd === 'zoo') { const { text, res } = zoo(N); console.log(text);
    // the targets are the shipped game's, events on (DESIGN-v3 §2.9 #17): the real sim asserts them (headless balance 400).
    // This model has no events, so its human sits above them by the events' cost (about 15 points on Medium).
    console.log('\n### Targets (no events here: the real sim asserts them with events on, `node test/headless.mjs balance`)\n'); console.log(checks(res)); }
  if (cmd === 'hazard') console.log(hazardReport(+(a1 || 300)));
  if (cmd === 'pressure') { console.log(pressureReport(N, a2 || 'human', a3 || 'medium')); }
  if (cmd === 'shock') console.log(shockReport());
  if (cmd === 'arc') console.log(arc());
  if (cmd === 'cards') console.log(cardsReport());
  if (cmd === 'forbid') console.log(forbidReport(+(a1 || 400), a2 || 'medium'));
  if (cmd === 'slope') console.log(slopeReport(+(a1 || 300)));
  if (cmd === 'evidence') console.log(evidenceReport());
  if (cmd === 'des') console.log(desReport());
  if (cmd === 'plot') console.log(plot());
  if (cmd === 'worked') console.log(workedReport());
  if (cmd === 'sets') console.log(setsReport(+(a1 || 400)));
  if (cmd === 'levers') console.log(leversReport(+(a1 || 400)));
  if (cmd === 'trace') { const o = campaign(a1 || 'human', a2 || 'medium', +(a3 || 1), { trace: true }); console.log({ win: o.win, reason: o.reason, g: o.g, t: o.t });
    console.table(o.log.map(x => ({ ...x, m: f2(x.m), rep: Math.round(x.rep), minRep: Math.round(x.minRep),
      money: Math.round(x.money), debt: x.debt.toFixed(4), dTrain: x.dTrain.toFixed(3) }))); }
  console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

export { GENS, LANES, DET, RESP, MODS, LAB, CARDS, POLICY, ZOO, SUBTLE, COLLUDE, HARM, GEN_VS, BURST, DIFF, TRAIN, RETRAIN,
  DEBT, TRAITS, EVIDENCE, solveLane, extBalance, debtPerLine, campaign, runMany, parAt, erlangB, pModel, responderChain };
export const chainMemoSize = () => CHAIN_MEMO.size;
