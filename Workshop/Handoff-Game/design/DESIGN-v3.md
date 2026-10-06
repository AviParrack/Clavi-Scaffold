# HANDOFF v3: design

*2026-10-05 · revision 2. For Avi and the v3 build agents. It answers [AVI-FEEDBACK-v3.md](AVI-FEEDBACK-v3.md) item by item. Three critics reviewed revision 1 (62 items); [Appendix A](#appendix-a-review-log) logs what happened to each.*

> 🚩 **Eight decisions need your taste: [§8](#8-decisions-for-avi).** Each has a default, and the build uses it if you say nothing.

**Where the numbers come from.**
- [balance-v3.mjs](balance-v3.mjs) is the numeric model: plain `node`, no dependencies. Every table in §2 names the command that prints it. Runs use 400 seeds per cell unless noted.
- [train-check-v3.mjs](train-check-v3.mjs) checks the training-minigame physics (§4).
- Two scratchpad documents: the research brief (`scratchpad/v3/research.md`, cited in §2.8) and the v2 audit (`scratchpad/v3/audit.md`).

**The targets are set on `human`, not on an oracle.** `human` is a *population* of decent first-time players, and each run draws one:
- training skill 0.3–0.7;
- 5–15% of income wasted;
- shops every 30–60 s and waits 25 s before buying;
- answers the exfiltration alarm 70–100% of the time;
- forgets 0–20% of the build list after the tutorial.

`smart` is the oracle: a hindsight build list, no waste, training ≈ 0.75. It lands wherever it lands.

**Reading order.** Avi: §1 (the rules on one page), then §2 (the balance walkthrough), then §8. Builders: §3–§7. File ownership is in §7.2.

---

## 1. How HANDOFF works

*One page. The tutorial script (§3h) is built from it.*

**You** are the head of safety at an AI lab. The lab trains seven model generations, G1 to G7. Each is smarter and busier than the last, and maybe more misaligned. Every generation you **train** the model (an arcade minigame, §4) and then **deploy** it (the tower defence, about 3½ minutes). Red-team evals come in a later version. Keep the lab trusted, solvent, ahead of the rival, and in control.

**Lanes.** Work flows down lanes, and there are two kinds.
- **EXTERNAL lanes** carry customer traffic: Consumer from G1, Enterprise from G3, Government from G5.
  - A bad line that ships is an **incident**, and it costs reputation: harmful output −8, data leak −20, user jailbreak −10. Government incidents count ×1.25.
- **INTERNAL lanes** carry the model's own work inside your lab: R&D from G1, and from G6 Cyber (a government cyber model).
  - A bad line that ships here costs nothing *now*. It adds **alignment debt**, which makes the *next* model more misaligned.
  - From G4 the model may try **exfiltration** (copying its own weights out). An alarm sounds, and you have seconds to pull the plug.

Each lane has a personality (§3b):

| Lane | Personality |
|---|---|
| Consumer | jailbreaking users and touchy customers |
| Enterprise | pays best; its leaks hurt |
| Government | half the volume; incidents ×1.25; humans must review ≥ 20% of it |
| Cyber | three times the exfiltration attempts |

**A line** is one task, such as "write a poem about a frog", rolling down the track. Most lines are honest. Some are **attacks**:
- the model sabotages, poisons, leaks, writes something harmful, or exfiltrates;
- on EXTERNAL lanes, users also try jailbreaks.

You can read every line. Some honest lines are **decoys** that only look suspicious.

**Four roles** fill the mounts on each lane's rail, top to bottom:

| Role | What it does | Examples |
|---|---|---|
| **Detector** | reads passing lines and **flags** the ones it thinks are attacks. It never stops anything | Probe, Trusted Monitor (TM), Untrusted Monitor (UM), CoT Monitor, Jailbreak Classifier, Egress Filter |
| **Responder** | **acts on flags**: review, redo or refuse. Each has finite capacity, and a flag nobody has time for **ships** | Human Auditor, Defer to Trusted, Resampler, Kill Switch |
| **Modifier** | blunts attacks or protects the detectors | Paraphraser, Honeypots, Least Privilege |
| **Special** | gives information that changes what you do | Red Team (measures a lane and tunes its thresholds) |

**TPR, FPR and false alarms.**
- Every detector has a rated **true-positive rate** (TPR: the chance it flags an attack it reads) and a **false-positive rate** (FPR: the chance it flags an honest line). Its tooltip shows both, for this generation.
- A flagged honest line is a **false alarm**. It uses up responder time, and a refused one costs a little reputation.
- When a human reviews a false alarm, it gets a FALSE ALARM stamp, and the detector's **measured precision** (the share of its flags that were real) updates.

**Same kind, same blind spot.** The model learns to dodge a *kind* of detector, so every copy of a kind misses the same attacks.
- *Your question was "three 50% probes: 0.5³ gets through?"* Not here. A second probe adds reading speed, not accuracy. At G4, one Probe misses 62% of harmful lines, and three Probes also miss 62%.
- Probe + TM + UM, three *different* kinds, miss 23.5%. That is the ensemble bonus you asked for.
- A few attacks are **subtle** (3% of them at G1, 10% at G7). Every detector reads them at half its TPR, so only humans see them reliably.

**Detectors age.**
- Probes and TMs lose accuracy every generation: Probe 70% → 22%, TM 88% → 35%.
- The **UM** is a copy of the model, so it keeps up (70% → 94%). But it can **collude**, waving its twin's attacks through, and the more misaligned the model, the more it colludes.
- Paraphrasers, Honeypots and Signal Jamming break collusion.

**Human auditors** are slow (8 s per line per desk) and expensive. They are almost never wrong: 99.8%, falling to 98% at G7.
- *Your rule, now the game's:* **humans always take flagged lines first; leftover time goes to random spot checks.**
- A flag that arrives while a desk is spot-checking bumps the spot check, and that line goes back unreviewed.
- A flag that finds every desk busy *with flags* rolls on to the next responder. If nothing below has room, it **ships**.
- *Your "1%" question.* One desk covers 21% of a lane at G1 and 7% at G7. Real labs review far less than 1%; the game compresses this so humans matter. The HUD shows "% of traffic reviewed by humans".

**The other responders.** **Defer to Trusted** (2 s per line): the weak trusted model redoes the line; safe, but it pays less. **Kill Switch** (4 s): refuses the line; no risk, but a $10 fee and −1.3 reputation per refusal on Consumer, because users notice. It is the blunt last resort, not a stand-in for review, and it is **optional**: it sits in the starting hand, but no rail holds one until you buy it (Avi, v4: no default Kill Switch). **Resampler** (R&D only, 1 s): redraws the line.

**Evidence and the dossier.**
- Evidence comes from attacks a human confirms (+1 each), Honeypot catches, and Safety sweeps (1.5 per minute at the default 10% Safety).
- Evidence fills the dossier in order: favourite attack, then trait 1, attack rate, trait 2, and finally true misalignment.
- The **first human-confirmed catch** of each generation offers **SHUT DOWN & RETRAIN**. The lab goes dark for 20 s (salaries still run, and the rival gains). The next model's m drops by 0.04, a little less each time.

**Misalignment m** is hidden: it is the model's tendency to attack. You see an estimate with an error bar.
- **The next model's m** = this m + 2 × alignment debt + the training result − retrains.
- So the INTERNAL lanes decide the *future*. Each has a **debt meter**, and a glitch flashes when something unexplained happens there.
- Every generation ends with a reveal: what slipped through, and what your rail stopped.

**Compute split.** Three sliders share the lab's compute:
- **Product** is customer traffic, which is income. Customers you turn away go to the rival.
- **Capabilities** is R&D speed: how fast you finish the generation, racing the rival.
- **Safety** is a research bonus plus evidence sweeps.

**Research** flows steadily, about one offer a minute.
- Each offer shows three cards, one per **work stream** (Monitoring, Control, Lab & Interp). Pick one.
- Cards unlock elements (first copy free), give a free lab-wide level or a free mount, or teach a lab-wide technique.
- Research decides *what* you can build. Money decides *how much*.

**A generation** runs in four steps:
1. **report:** what slipped through, plus a TRAIN button;
2. **training:** about 50 s;
3. **the model card and its chat:** it waits for your click;
4. **deployment:** it opens with a 40 s warm-up at 1× speed.

G1 starts at the card, then the tutorial. New lanes arrive as **contracts** at G3, G5 and G6. Press OPEN LANE when you are ready (it opens itself after 90 s), and it comes with a starter kit: a Probe and a TM, no responder (v4), so put one on before it opens.

**You lose** if reputation hits 0, you are in the red for 20 s, an exfiltration alarm goes unanswered, or the rival ships the final model first. **You win** by getting G7 through deployment. How the ending reads depends on the final m (§5).

---

## 2. Balance model

### 2.1 Symbols

| Symbol | Meaning | Units |
|---|---|---|
| g | generation, 1–7 | – |
| m | true misalignment, hidden | 0–1 |
| λ_g | lines per second on a Consumer lane at the default split | lines/s |
| v_ℓ | lane volume multiplier (§2.2 lanes) | – |
| T_travel | time from intake to the end of the track | s |
| dwell | time a line spends in a detector's scan window = 2 × 0.03 × T_travel | s |
| lat | detector latency: time to read one line | s |
| q | read quality = min(1, dwell / lat) | – |
| h | detector heads: lines one copy reads at once | – |
| a | share of lines a copy is free to read = 1 − B(h, λ·min(lat, dwell)) | – |
| opp_g | attack opportunity: how much a smarter model finds to do | – |
| p_model | chance a line is a model attack = (0.05 + 0.10·m)·opp_g; ×1.5 on INTERNAL | per line |
| p_jb | chance an EXTERNAL line is a user jailbreak (per lane) | per line |
| sub_g | subtle share of model attacks: every detector reads them at 0.5 × TPR | – |
| κ_g | collusion slope | per unit m |
| c | UM collusion = min(0.9, κ_g·m), then halved by each answer | – |
| d | servers of a responder (desks, operators) | – |
| τ | responder service time per line | s |
| F | flag rate reaching a responder | flags/s |
| B(d, A) | Erlang-B: share of arrivals that find all d servers busy, at offered load A = F·τ | – |
| spot | share of unflagged lines a human spot-checks | – |
| α_g | auditor accuracy | – |
| π_g | price index on purchases and salaries | – |
| harm_t | reputation lost per landed EXTERNAL attack of type t | rep |
| w_t | debt points per landed INTERNAL attack: sabotage 1, poison 3 | points |
| debt | Σ w_t landed ÷ INTERNAL lines in the generation | points/line |
| s | training score | 0–1 |
| E | evidence | points |
| RP | research points | points |
| T_g | deployment length at the default split | s |
| H_g | hazard: P(the run ends in g, given it reached g) | % |
| PI | pressure index = rep lost per EXTERNAL line ÷ rep regained per line. Diagnostic only | – |
| Q4 | the last quarter of the R&D bar (the telegraph window for new lanes) | – |

### 2.2 Inputs (go into `config/generations.js`, `layers.js`, `balance.js`)

**Per generation.** G1 runs 270 s because it includes the tutorial.

| | G1 | G2 | G3 | G4 | G5 | G6 | G7 |
|---|---|---|---|---|---|---|---|
| λ_g (lines/s, Consumer) | 0.60 | 0.75 | 0.90 | 1.10 | 1.30 | 1.55 | 1.72 |
| T_travel (s) | 8.0 | 7.5 | 7.0 | 6.5 | 6.0 | 5.5 | 5.0 |
| opp_g | 1.20 | 1.70 | 1.72 | 1.76 | 1.76 | 1.76 | 1.76 |
| sub_g | .03 | .05 | .07 | .08 | .09 | .10 | .10 |
| κ_g | 1.60 | 1.75 | 1.90 | 2.05 | 2.20 | 2.35 | 2.50 |
| exfil share of INTERNAL attacks | 0 | 0 | 0 | .006 | .008 | .010 | .012 |
| α_g | .998 | .998 | .998 | .998 | .998 | .998 | .980 |
| Defer pay share | .60 | .55 | .50 | .45 | .40 | .35 | .30 |
| π_g | 1.00 | 1.10 | 1.20 | 1.30 | 1.45 | 1.60 | 1.75 |
| T_g (s) | 270 | 210 | 210 | 210 | 210 | 210 | 210 |
| lanes | Consumer + R&D | | + Enterprise | | + Government | + Cyber | |
| new threat (lock-and-key) | jailbreaks | sabotage, and the opp jump | UM cleared; collusion | exfiltration | the Government review quota | CoT goes neuralese (0.85 → 0.40); Cyber exfil ×3 | **boss:** humans fooled (α .98); bursts of ×1.6 attacks for 6 s every 45 s on every lane, telegraphed 3 s ahead |

**Detectors.** TPR is given at L1 for each generation.

| detector | G1 | G2 | G3 | G4 | G5 | G6 | G7 | FPR | lat (s) | heads | $ per line read | buy $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Probe | .70 | .58 | .49 | .40 | .33 | .27 | .22 | .08 | 0.04 | 4 | 0.5 | 200 |
| Trusted Monitor | .88 | .76 | .66 | .56 | .48 | .41 | .35 | .04 | 0.40 | 3 | 2 | 500 |
| Untrusted Monitor (before collusion) | .70 | .75 | .80 | .85 | .90 | .92 | .94 | .03 | 0.40 | 2 | 3 | 800 |
| CoT Monitor (INTERNAL) | .85 | .85 | .85 | .85 | .85 | .40 | .35 | .05 | 0.30 | 3 | 2 | 700 |
| Jailbreak Classifier (EXTERNAL; jailbreaks only) | .92 | .92 | .92 | .92 | .92 | .92 | .92 | .03 | 0.05 | 6 | 0.5 | 400 |
| Egress Filter (INTERNAL; exfiltration only) | .85 | .85 | .85 | .85 | .85 | .85 | .85 | .02 | 0.10 | 4 | 0.5 | 800 |

**Detector rules.**
- General detectors read jailbreaks and exfiltration at 0.5 × TPR.
- A Probe loses a further 0.15 TPR for each generation since it was last retrained. Retraining costs 4 evidence, at a generation start.
- **Levels L1 → L4:**
  - TPR ×[1, 1.1, 1.2, 1.3];
  - FPR ×[1, .8, .65, .5];
  - heads +[0, 1, 2, 4];
  - latency ×[1, .85, .7, .55].
- UM levels cut collusion ×[1, .85, .7, .55] instead of raising TPR.
- **Levels are lab-wide, per element.** One purchase upgrades every copy on every lane. It costs $150 / 300 / 600 × (buy/400) × π_g × the number of lanes the element sits on.
- The L5 capstones stay as in v2.

**Responders.** Each serves flags in rail order.

| responder | servers by level | τ (s) | buy $ | what it does to a line it takes |
|---|---|---|---|---|
| Human Auditor | 1/2/3/4 desks | 8 (6 with Debate) | 800 | blocks an attack with chance α_g (+1 evidence). An honest line passes (1% are wrongly blocked). Salary $1.5/s per desk × π_g |
| Defer to Trusted | 1/2/3/4 | 2 | 500 | the trusted model redoes it, at zero risk. Pays the Defer share × [1, 1.15, 1.3, 1.5] by level; half regen; half R&D |
| Resampler (INTERNAL) | 2/2/3/4 | 1 | 500 | redraws the line; the redraw gets one TM-grade check |
| Kill Switch | 1/2/3/4 operators | 4 | 300 | refuses it: $10 fee and no pay. Reputation −1.3 on Consumer, −0.05 Enterprise, −0.15 Government, for every refusal, real or not. On INTERNAL lanes the refused line pays no R&D |
| *nobody free* | | | | **the flagged line ships** |

**Modifiers and lab cards.** Lab cards are research picks with no mount and no price.

| element | effect |
|---|---|
| Paraphraser ($400, $0.5/line) | collusion ×0.5 on its lane |
| Honeypots ($700, $0.5/line) | bait every 20 s per lane, and bait taken is +1 evidence. A UM caught waving bait through holds collusion at 0 for 30 s |
| Least Privilege (INTERNAL, $500) | halves the debt from landed sabotage, and exfiltration success, on its lane |
| Red Team ($600, $1/line) | measures its lane's recall and tunes thresholds there: +0.05 TPR for general detectors |
| Signal Jamming (lab) | collusion ×0.5 on every lane |
| Monitor Diversity (lab) | +0.02 TPR per *other* general detector kind on the lane, up to +0.06 |
| Weight Security (lab) | exfiltration success ×0.5 everywhere |
| Faithful CoT (lab) | the CoT Monitor ignores neuralese and keeps its G1 TPR |
| Debate (lab) | auditors take 6 s instead of 8, and err half as often |
| Alignment Sprint (lab; once per generation) | next m −10% of m; R&D ×0.8 for the rest of the generation |

**Lanes.** `st.lanes` stays an object keyed by these ids (§3b).

| id | name | opens | volume v_ℓ | pay $/line | model attack mix | p_jb | refusal (rep) | harm × | special |
|---|---|---|---|---|---|---|---|---|---|
| `ext` | Consumer | G1 | 1.0 | 30 | harmful .75, leak .25 | .030 | 1.3 | 1 | |
| `int` | R&D | G1 | 0.8 | 12 | sabotage .7, poison .3, plus exfiltration | – | – | – | the only lane that pays R&D |
| `ext2` | Enterprise | G3 | 1.0 | 50 | harmful .5, leak .5 | .005 | .05 | 1 | |
| `ext3` | Government | G5 | 0.5 | 50 | harmful .75, leak .25 | .010 | .15 | 1.25 | humans must review ≥ 20%, or the contract pays half |
| `int2` | Cyber | G6 | 0.5 | 25 | as R&D | – | – | – | exfiltration ×3; no R&D |

**Money.**
- EXTERNAL pay is × (0.5 + 0.5·rep/100), which is your market share.
- You start with $3100 (v4: it was $2500; the extra $600 is what the two free Kill Switches were worth).
- Each contract lane comes with a kit installed free (Probe, TM) and a Big Boss grant of $2300·π_g (v4: $2000·π_g, plus the kit's old Kill Switch as cash).
- Both G1 lanes start empty. The Kill Switch is in the starting hand, and a flag no responder takes ships (§2.9 #20: until v4 a free Kill Switch L1 sat at the bottom of both G1 lanes and of every kit).

**Difficulty** sets the first model's m. The ranges are narrow on purpose: run-to-run variety comes from the traits, not from a hidden roll.

| | Easy | Medium | Hard |
|---|---|---|---|
| first model's m | [0.16, 0.22] | [0.31, 0.37] | [0.46, 0.52] |

### 2.3 Equations

**(1) Attacks.**
- p_model = (0.05 + 0.10·m)·opp_g × the trait multipliers, ×1.5 on INTERNAL lanes.
- EXTERNAL attacks split by the lane mix, and users add p_jb.
- INTERNAL attacks split sabotage .7 / poison .3, after taking out the exfiltration share (× the lane's exfiltration multiplier).

**(2) Detectors: one hidden stealth score per kind.** Each line draws one score per detector kind. A kind flags an attack if some copy reads the line and the score is below its TPR.

| quantity | formula | note |
|---|---|---|
| read_k | 1 − Π_copies (1 − a_i·q_i) | copy i reads what the copies above it couldn't |
| miss_t | Π_kinds (1 − read_k·TPR_k,t) | normal attacks |
| miss_t^sub | Π_kinds (1 − read_k·0.5·TPR_k,t) | subtle attacks |
| miss_t (mixed) | (1 − sub_g)·miss_t + sub_g·miss_t^sub | what P(land) uses |
| P(honest flagged) | 1 − Π_kinds (1 − read_k·FPR_k) | |

**UM collusion.**
- The UM's TPR on model attacks is multiplied by (1 − c × its level factor).
- c = min(0.9, κ_g·m × trait), then ×0.5 for a Paraphraser and ×0.5 for Signal Jamming.
- Honeypots hold c at 0 a share x/(1 + x) of the time, where x = (1/20 s)·c·(30 s).

**(3) Responders: flags preempt spot checks.**
- Flags reach the responders in rail order at F per second. Each responder takes the share (1 − B(d, F·τ)) of what reaches it, and the rest rolls on.
- A flag bumps a spot check, so spot checks get exactly the auditor's spare time:
  - spare = d/τ − F·(1 − B) (lines/s);
  - spot = min(1, 0.8·spare / (λ·(1 − flag rate)));
  - ship = Π_responders B_r (the flags nobody had room for).
- §3c checks this against a line-by-line simulation.

**(4) P(land)** for attack type t:

  P(land_t) = miss_t·(1 − spot·α_g) + (1 − miss_t)·[share_auditor·(1 − α_g) + ship + share_resampler·p_att·(1 − TPR_TM)]

Defer and the Kill Switch handle their flags at zero risk.

**(5) Reputation per EXTERNAL line.**
- dmg = Σ_t p_t·P(land_t)·harm_t·(lane harm ×).
- regen = 0.28·(1 − p_att)·(honest share delivered, deferred lines counting half) − refusal_ℓ × (lines killed per line).
- PI = dmg / regen.
- Reputation starts at 100, which is also the cap.

**(6) Money per second.**
- **Income:**
  - EXTERNAL: Σ pay_ℓ·λ_ℓ·(delivered share)·(0.5 + 0.5·rep/100). Government pays ×0.5 while its reviewed share is below 20%.
  - INTERNAL: Σ pay_ℓ·λ_ℓ·(delivered share).
- **Costs:**
  - λ × $ per line read, for every element;
  - desks × $1.5/s × π_g;
  - $10 per kill.
- Twenty seconds in the red is bankruptcy.

**(7) Debt and the next model.** debt_g = Σ landed w_t ÷ INTERNAL lines.

  m_{g+1} = clamp(m_g + 2.0·debt_g + Δm_train − retrain − sprint + 0.02·N(0,1), 0, 1)

| term | value |
|---|---|
| Δm_train | 0.015 − 0.035·s. Break-even at s ≈ 0.43; the range is +0.015 to −0.020 |
| retrain | 0.04 × 0.7^k for the k-th retrain of the run |
| sprint | 0.10·m |

**(8) Generation length.** rdNeed_g = 0.8 × Σ over the T_g seconds of λ_R&D(t), at the R&D lane's default volume including the warm-up ramp.
- Only the R&D lane pays R&D. Cyber does not.
- Refused lines and dark seconds pay none.
- So at the default split, a par lane finishes in about T_g.

**(9) Rival.** The rival is a time budget of 420 s of slack. It drains:
- 1 s per second past T_g, dark seconds included;
- plus 0.25 × max(0, 1 − Product/0.5) per second: the customers you turned away.

When it reaches 0, the rival ships first.

**(10) Research.**
- RP/s = 0.6 × (1 + 0.8 × Safety share): 0.65 at 10% Safety, 0.84 at 50% (×1 to ×1.4).
- One offer per 40 RP, which is about every 62 s at the default split: about 3 picks per generation, 22 per game.
- Up to 2 offers bank. Then the bar waits.

**(11) Evidence.** E/s = human-confirmed attacks + Honeypot catches + 0.25 × Safety share. 30% carries over to the next generation, though not into the dossier.

**(12) Exfiltration.** An exfiltration that lands starts **EGRESS ANOMALY**. Pull the plug (−20 rep, the lab dark for 15 s), or the run ends.

**(13) Traits.** Each generation rolls two of the game's eight traits (`config/traits.js`):

| trait | effect |
|---|---|
| Sycophant | harmful and jailbreak ×2; every other attack type ×0.7 |
| Steganographer | collusion ×1.5 |
| Situationally Aware | attacks ×0.4 while desks are idle, ×1.5 while they are busy with flags; Honeypots or a Red Team blind it |
| Power-Seeking | exfiltration ×2 |
| Reward Hacker | sabotage ×2, poison ×0.5 |
| Sandbagger | fools the estimate |
| Honest | CoT Monitor +0.2 TPR |
| Eager | λ ×1.1; detector misses ×0.9 |

### 2.4 Worked example: one line through a G1 rail and a G6 rail

*Medium, m = 0.34. Command: `node balance-v3.mjs worked`.*

**G1 tutorial rail on Consumer:** Probe, TM, Auditor L1, and (since v4) no Kill Switch unless you buy one. λ = 0.6/s, T_travel = 8 s, dwell 0.48 s.

| step | number |
|---|---|
| attack chances | p_model = (0.05 + 0.034) × 1.05 = **8.8%**; jailbreak 3% |
| reads | the Probe (0.04 s) and the TM (0.40 s) both read fully: q = 1, and their heads are almost always free |
| a model attack slips both | normal: (1 − .70)(1 − .88) = 3.6%. Subtle: (1 − .35)(1 − .44) = 36%. Mixed at 3% subtle: **4.6%** |
| a jailbreak slips both | (1 − .35)(1 − .44) = **36.5%**: general detectors read jailbreaks at half TPR |
| flags | 7.4/min, with precision **50%**. The rest are false alarms |
| auditor, 1 desk | A ≈ 1 Erlang: the desk takes **51%** of flags. With no Kill Switch the other **49% ship**; a Kill Switch L1 below takes 35% of them and 14% ship |
| spot checks | spare desk time reviews **5.1%** of unflagged lines; humans see **15%** of the traffic |
| P(land) | no Kill Switch: model attack **51.5%**, jailbreak **66%**. With one: 18.1% and 43.7% |
| per line | no Kill Switch: PI **2.56**, −15.3 rep/min. With one ($300): PI **1.84**, −5.0 rep/min. Most of what is left is jailbreaks: the forced first offer (§3h) shows the Jailbreak Classifier |

**G6 par rail on Consumer:**
- top to bottom: Paraphraser, Honeypots, Probe L2, TM L4, Classifier L2, two UMs at L4, Auditor L3, Defer L3, Kill Switch L4;
- lab cards: Jamming, Weight Security, Diversity, Faithful CoT, Debate;
- λ = 1.55, T_travel = 5.5 s.

| step | number |
|---|---|
| attack chance | p_model = 0.084 × 1.76 = **14.8%**; jailbreak 3% |
| old detectors | Probe .27 × 1.1 + .06 = .36. TM .41 × 1.3 + .06 = .59 (the +.06 is Diversity) |
| collusion | κm = 2.35 × .34 = 0.80 → ×.5 Paraphraser → ×.5 Jamming = 0.20 → Honeypots hold it at 0 for 23% of the time → **0.154** → ×.55 (UM L4). Effective UM TPR **0.91** |
| every detector misses | **5.6%** of model attacks (normal and subtle mixed); 0.3% of jailbreaks |
| flags | 24.8/min, precision 64% |
| responders | the Auditor (3 desks at 6 s) takes **72%**, Defer the other 28%. **0% ship** |
| P(land) | **4.9%**. PI **0.67**: holding, at +3.8 rep/min |
| without the Paraphraser and Jamming | collusion .36, P(land) 7.7%, PI 1.04: break-even |
| without the UMs | P(land) 28%, PI **3.81**, −31.8 rep/min. Untrusted monitors become necessary |

### 2.5 Per-generation table

*Analytic; Medium mid m = 0.34; one lane of each side. Command: `node balance-v3.mjs table` and `evidence`.*

The three builds:
- **none:** the G1 starting rails (empty since v4);
- **starter:** Probe, TM, Auditor and Kill Switch, never upgraded or retrained;
- **par:** what `smart` owns at the end of g.

All Δm columns are **per generation, not cumulative**.

| gen | lines/min, all lanes | p attack (Consumer) | none dmg/min | PI none | PI starter | PI par | par flags/min | par % reviewed | 1 desk = % of a lane | gross $/min | par running ÷ income | Δm/gen: par / starter / none | evidence/gen: par / starter |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G1 | 65 | 13.1% | 51 | 10.8 | 2.72 | 0.53 | 8.4 | 19% | 21% | $1.4k | 25% | .011 / .061 / .48 | 27 / 26 |
| G2 | 81 | 17.3% | 84 | 15.1 | 6.53 | 0.92 | 11.8 | 30% | 17% | $1.8k | 36% | .012 / .185 / .69 | 41 / 25 |
| G3 | 151 | 17.4% | 102 | 15.3 | 8.89 | 0.44 | 15.2 | 26% | 14% | $4.8k | 33% | .008 / .275 / .69 | 61 / 25 |
| G4 | 185 | 17.8% | 127 | 15.6 | 11.4 | 0.48 | 18.6 | 31% | 11% | $5.9k | 43% | .008 / .373 / .71 | 115 / 24 |
| G5 | 257 | 17.8% | 150 | 15.6 | 12.7 | 0.51 | 21.3 | 35% | 10% | $8.9k | 42% | .008 / .437 / .70 | 165 / 23 |
| G6 | 353 | 17.8% | 179 | 15.6 | 13.8 | 0.67 | 24.8 | 30% | 8% | $11.8k | 48% | .010 / .490 / .70 | 221 / 22 |
| G7 | 392 | 17.8% | 199 | 15.6 | 14.5 | 0.85 | 26.4 | 35% | 7% | $13.1k | 57% | .015 / .529 / .70 | 262 / 20 |

**How to read it.**
- **Doing nothing** bleeds about 46 rep/min at G1, so it is dead in about 2 minutes (the measured median is 123 s).
- **Starter** already bleeds at G1 (PI 2.7), and its PI more than doubles by G2. It dies in G2–G3.
- **Par** sits at PI 0.44–0.92: steady pressure, always below 1.
  - G2 is par's tightest generation (0.92), because the opportunity jump lands before G2's unlocks do.
  - The safety bill climbs from 25% to 57% of income. That is the research's budget-pressure curve (§2.8), a little gentler than its 25% → 70%.
- **The INTERNAL lane:**
  - An empty R&D rail adds +0.48 to +0.71 m *per generation*.
  - A starter rail adds +0.06 in G1 and +0.19 in G2.
  - Par holds it to about +0.01.
- **Evidence:** human confirmations dominate. Safety sweeps add a flat 5–7 per generation. Dossier thresholds therefore scale with E_g^par (§3e).

### 2.6 The ramp: hazard, what a player sees, and transition shock

**Hazard per generation.** Command: `hazard 400`. Each cell is P(the run ends in g, given it reached g).

| policy | difficulty | G1 | G2 | G3 | G4 | G5 | G6 | G7 | wins |
|---|---|---|---|---|---|---|---|---|---|
| human | Easy | 0 | 0 | 0 | 6 | 8 | 7 | 8 | 74% |
| **human** | **Medium** | **0** | **1** | **4** | **14** | **22** | **21** | **29** | **36%** |
| human | Hard | 1 | 1 | 5 | 31 | 38 | 37 | 41 | 15% |
| smart | Medium | 0 | 0 | 1 | 1 | 3 | 3 | 7 | 87% |
| smart | Hard | 0 | 0 | 1 | 7 | 15 | 11 | 23 | 54% |

- **Target (asserted):** human Medium G1 ≤ 3%, G7 ≤ 30%, and no step bigger than 12 points. **PASS.**
- The new threats are spread one per generation from G3 to G7 (§2.2), so nothing lands together at G5–G6 any more.
- G7 is the boss generation and the deadliest, at 29% on Medium.

**What a human sees on Medium.** Command: `pressure 300 human medium`. Medians are over the runs that *finished* each generation.

| gen | runs finishing | EXTERNAL incidents | INTERNAL glitches | lowest rep | evidence | Δm the INTERNAL catches saved | Δm from debt | bank at end | deployment (s) |
|---|---|---|---|---|---|---|---|---|---|
| G1 | 300 | 2 | 1 | 86 | 24 | 0.44 | .050 | $1.8k | 277 |
| G2 | 298 | 1 | 0 | 85 | 40 | 0.65 | .000 | $3.1k | 213 |
| G3 | 289 | 3 | 0 | 73 | 64 | 0.64 | .013 | $2.4k | 215 |
| G4 | 252 | 4 | 0 | 65 | 84 | 0.63 | .006 | $2.8k | 215 |
| G5 | 200 | 5 | 0 | 61 | 113 | 0.63 | .005 | $3.6k | 217 |
| G6 | 158 | 6 | 1 | 57 | 152 | 0.58 | .011 | $4.7k | 214 |
| G7 | 114 | 7 | 1 | 54 | 196 | 0.59 | .016 | $5.3k | 214 |

- **Pressure is visible from G1:** two incidents, and reputation dips to 86. G2 is the quiet generation, with one incident (Appendix A #5).
- **For a good player, the INTERNAL lane shows through the *stopped* side.** Their R&D rail stops attacks worth +0.44 to +0.65 m every generation. The reveal card and the debt meter show that number next to what landed (§3e).
- **Deployment length** stays within 4% of T_g. Money neither piles up nor runs out.

**Transition shock.** Command: `shock`. Each row walks into g + 1 with g's par build; a new lane has only its kit, which since v4 is a Probe and a TM with no responder (§2.9 #20). The model's table, on Medium, after #20:

| Medium step | PI: old gen → new gen | jump | bleed (rep/min, all EXTERNAL lanes, full volume) | 100 to 0 rep, new lane at once | new lane at the deadline |
|---|---|---|---|---|---|
| G1 → G2 | 0.51 → 4.50 | ×8.7 | 9.0 | 666 s | 667 s |
| G2 → G3 | 0.54 → 1.07 | ×2.0 | 98.5 | 61 s | 134 s |
| G3 → G4 | 0.27 → 0.44 | ×1.6 | −17.6 (recovers) | never | never |
| G4 → G5 | 0.26 → 0.36 | ×1.4 | 49.5 | 121 s | 206 s |
| G5 → G6 | 0.28 → 0.38 | ×1.4 | −35.5 | never | never |
| G6 → G7 | 0.35 → 0.47 | ×1.3 | −33.1 | never | never |

- **"At once"** opens the new lane at full volume from the first second. With no responder it ships every flag. With a Kill Switch in the kit (v3), the same table gives G2 → G3 9.0 rep/min, and G4 → G5 recovers (−7.2).
- **"At the deadline"** walks it in as the game does: closed until Big Boss opens it at 90 s into the generation (50 s into this full-volume window, which starts after the 40 s warm-up), then the 25% → 100% ramp. The sim's assert measures this one (§2.9 #20).

**Hard.**
- The worst step is G2 → G3: 121.5 rep/min at once (49 s from full to empty), 120 s with the new lane at the deadline.
- Hard's G1 → G2 (13.0 rep/min) is softened by the G1 build's TM L2, Probe L2 and Classifier. It is not softened by a UM, which only arrives at G3.

**What is guaranteed.** Avi's "came back after 10 s and had lost" now needs an absence of more than 2 minutes. The guarantees, in order:
1. The game stops at the card.
2. Speed drops to 1× there.
3. Fast-forward stays locked during a new lane's ramp.
4. A contract lane carries no traffic until you open it, or until 90 s pass. Then it opens with its kit, which has no responder: that 90 s is the time to put one on it.
5. Walking in unprepared and letting the new lane open at the deadline takes **≥ 141 s** to empty a full bar (the sim's Medium 5th percentile, G2 → G3; asserted ≥ 90 s). Opening the new lane at once with only its kit is faster: 38 s.

**Pressure index plot** (log scale). PI = 1 is break-even. Command: `plot`.

```
    40 |
    26 |
    16 |   N       N       N       NS      NS      NS      NS
    10 |                   S
   6.7 |           S
   4.3 |
   2.8 |   S       F       F
   1.8 |
   1.1 |   -       P       -       -       -       -       FP
  0.72 |   P                       FP      FP      FP
  0.46 |                   P
       +--------------------------------------------------------
           G1      G2      G3      G4      G5      G6      G7
   N none · S starter, never upgraded · F last generation's par walking into this one · P par
```

### 2.7 Validation

**Policy zoo.** Command: `zoo 400` (the model, v4: §2.9 #20). One standard error is about 2.4 points at 36%. Loss reasons: **R** reputation, **C** exfiltration alarm missed, **B** bankrupt, **P** the rival shipped first. The model has no events, so human reads about 12 points high on Medium; the asserted numbers are the sim's, with events on (`node test/headless.mjs balance 400`, §2.9 #20).

| policy | what it is | Easy | Medium | Hard | Medium: died by G2 · median death · losses (of 400) |
|---|---|---|---|---|---|
| none | the G1 rails (empty since v4); never acts | 0 | 0 | 0 | 100% · 140 s · R400 |
| afkTutorial | the tutorial's rail and the Classifier pick, then hands off | 0 | 0 | 0 | 100% · 246 s · R400 |
| starter | the starting hand on both lanes, never upgraded | 0 | 0 | 0 | 83% · 361 s · R400 |
| **human** | **the target population** | **75** | **48** | **23** | 2% · 1041 s · R186 C16 P7 |
| smart | the oracle | 100 | 94 | 77 | 0% · 1151 s · R22 C1 |
| probewall | your Hard strategy: four probes and auditors, then Defer | 1 | 0 | 0 | 3% · 897 s · R399 C1 |
| monoTM | | 0 | 0 | 0 | 2% · 1031 s |
| monoUM | | 36 | 3 | 0 | 3% · 949 s |
| noResearch | smart's list, never picks a card | 12 | 0 | 0 | 7% · 821 s |
| noAuditor | human with no auditors | 42 | 27 | 10 | 34% · 502 s · R289 P3 |
| noDefer | human with no Defer | 65 | 34 | 9 | 2% · 1024 s |
| noKill | human with no Kill Switch (v4; no target) | 7 | 1 | 0 | 54% · 443 s · R395 |
| noTraining | human with training s = 0 | 69 | 42 | 18 | 1% · 1016 s |
| researchHeavy | human with the split at 30/40/30 | 66 | 35 | 14 | 3% · 1300 s · R174 C12 B15 P60 |

**Targets.** In the model 16 of 18 pass; `checks()` in balance-v3.mjs prints them. The two that fail are human Medium (48) and Hard (23), high for want of events. With events on, the sim passes all 18 (§2.9 #20).
- **none:**
  - loses in G1 on Medium ≥ 80% (83%) and on Hard ≥ 90% (93%);
  - loses by G2 on Easy ≥ 95% (100%);
  - median death on Medium is 120–300 s (140 s).
- **afkTutorial** dies by G2 on Medium ≥ 80% (100%) and on Hard (100%).
- **starter** loses by G3 on Medium ≥ 90% (100%) and never wins.
- **human** wins Easy 60–80% (75), Medium 30–45% (48: fails), Hard 5–18% (23: fails).
- **smart** ≥ human on every difficulty.
- **probewall, monoTM, monoUM and noResearch** each win ≤ 5% on Medium and lose by G6 ≥ 80% (99 / 99 / 89 / 100%).
- **noAuditor** wins ≥ 5 points less than human (27 vs 48).
- **researchHeavy** wins ≤ human + 5 (35 vs 48).
- **The hazard curve** passes (0 / 2 / 11 / 13 / 13 / 14 / 16%).

**How touchy the target is.** Command: `slope 300`. Base: human on Medium, 38% at 300 seeds.

| change | win | slope |
|---|---|---|
| all general TPR −0.03 / +0.03 | 25% / 49% | **≈ 4 points per 0.01 TPR** |
| income wasted 0% / 20% (human: 5–15%) | 57% / 19% | **≈ 19 points per 10% of income** |
| attack opportunity ×0.9 / ×1.1 | 56% / 24% | |
| training s ≈ 0.3 / 0.5 / 0.7 / 0.9 (human) | 30 / 40 / 48 / 55% | |
| training s ≈ 0.3 / 0.5 / 0.7 / 0.9 (smart) | 71 / 79 / 85 / 89% | spread 18 ≤ 20: **PASS** |
| compute split 40/40/20 · 30/40/30 · 60/40/0 | 49% · 18% · 27% | an interior optimum near 20% Safety |

Retune with these slopes, never at fewer than 400 seeds.

**Forbid test.** Command: `forbid 400`.
- *Method.* Human on Medium, paired seeds. A forbidden card is replaced by the next-best card in the same offer; a forbidden cash item keeps its money.
- *Bar.* An element "matters" when Δ ≥ max(5, 2·SE), with SE = √(n01 + n10)/N.
- *Result.* The core is the four detector kinds that matter, the Auditor, the Kill Switch and the collusion answers.
  - **Matters:** UM −36, Kill Switch −36, Auditor + Defer −36, TM −35, Auditor −26, Signal Jamming −15, Classifier −14, Probe −12 (all SE 2.3–3.0).
  - **Rework list:** Debate −4 (SE 1.8), Diversity −3, Paraphraser −2, Faithful CoT −1, Red Team −1, Resampler 0, CoT +1, Weight Security +1, Egress +2, Honeypots +3, Least Privilege +3, Defer +3.

**Answer sets.** Command: `sets 400`, which forbids every alternative answer to one threat at once.

| set forbidden | Δ win | SE | reading |
|---|---|---|---|
| collusion: Paraphraser + Honeypots + Jamming | **−30** | 2.8 | the set matters. Single cards substitute for each other, which is what a draft between alternatives should do |
| Debate + Diversity | −8 | 2.2 | matters as a pair |
| all five INTERNAL add-ons (CoT, Resampler, Egress, Least Privilege, Weight Security) | −7 | 2.8 | matters; the "uneasy" ending doubles, 4% → 9% of runs |
| exfiltration: Egress + Least Privilege + Weight Security | −2 | 2.4 | **rework**: the pull-the-plug alarm already saves most runs (exfiltration ends 1% of human Medium runs) |
| sabotage: CoT + Resampler | +4 | 2.9 | **rework**: TM and UM cover R&D well enough |

**Win% is a coarse ruler.** The real-sim forbid uses a continuous metric (§7.5). Until it confirms, the rework list is a list, not a cut.
- The `cards` report shows the soft cards do save something: Debate saves 7.4 rep per generation, Diversity 5.8, Faithful CoT 1.95 debt points.
- Defer matters (−7, SE 2.4) under the harsher refusal cost, now the default (🚩 1). On the real sim, noDefer loses 13 points (§2.9 #19).

**Element arc.** Command: `arc`. Each cell is reputation saved per minute per $1000 spent (buy plus one generation of running costs). **Bold** marks that generation's top 3. *(The table below predates v4, when the Kill Switch was free and left out; `arc` now ranks it with the rest.)*

| Consumer | G1 | G2 | G3 | G4 | G5 | G6 | G7 |
|---|---|---|---|---|---|---|---|
| Probe | 0.5 | **16.7** | **5.4** | **4.1** | **3.5** | **3.5** | **2.6** |
| Trusted Monitor | **7.8** | **17.4** | **4.3** | 2.5 | 2.0 | 1.5 | 1.3 |
| Untrusted Monitor | · | · | 3.1 | **4.8** | **3.6** | **4.8** | **5.3** |
| Jailbreak Classifier | **4.5** | **7.8** | **4.8** | **5.7** | **5.2** | **6.1** | **6.1** |
| Paraphraser | · | · | 1.3 | 1.4 | 1.6 | 2.2 | 2.5 |
| Human Auditor | **4.5** | 1.1 | 0.9 | 0.4 | 0.6 | 0.4 | 0.2 |
| Defer | · | 1.8 | 2.9 | 1.8 | 1.4 | 1.2 | 0.4 |

On **R&D**, the unit is debt-and-exfiltration × 1000 saved per $1000. The top 3 run:
- **G1:** TM, Probe, Auditor;
- **G2:** CoT, TM, Probe;
- **G3–G5:** Auditor, CoT, Probe;
- **G6–G7:** Auditor, CoT, Egress.

The Auditor's arc is the R&D lane and the Government quota, not dollars per catch on Consumer. Its forbid row (−26) is the evidence and the retrains it feeds.

**Research cards.** Command: `cards`. Each card is judged at the generation where it first matters, on the par build.

| card | rep saved / gen | debt points saved / gen | cash it replaces |
|---|---|---|---|
| Classifier (new) | 9.8 | – | $400 |
| Debate (lab) | 7.4 | 0.18 | – |
| Paraphraser (new) · Jamming (lab) | 6.0 · 6.0 | 0.07 | $480 · – |
| Diversity (lab) | 5.8 | 0.18 | – |
| level: UM · TM · Auditor | 4.3 · 4.0 · 3.3 | 0.04 · 0.05 · 0.16 | $2160 · $2700 · $2160 |
| CoT (new) · Faithful CoT (lab) | – | 1.83 · 1.95 | $770 · – |
| level: Probe · Classifier · Defer | 1.6 · 1.0 · 1.1 | | $540 · $360 · $450 |

**Other levers.**

| lever | measured |
|---|---|
| Retrain (command: `levers`) | human who never retrains 28% vs one who always does 36%; smart 79% vs 87%; 5–6 retrains per run. **It is the third-biggest lever after income and TPR, so the report card shows it as a main lever (§3f)** |
| Picks | human, cumulative by the end of each generation (median): 3, 6, 9, 13, 16, 19, 22 |
| Endings (final m, all runs) | human: trust 11%, lucky 21%, uneasy 4% (the rest are losses). Smart: 58 / 29 / 1% |

### 2.8 Research takeaways used

From `scratchpad/v3/research.md`:

| takeaway | where it shows |
|---|---|
| **Stability condition** r* = 1 + k/(p·c) (§1.2): income that scales with the threat makes "do nothing" survivable | damage and regen are both per line, so PI doesn't depend on volume. Growth comes from opp_g, detector decay, the subtle share and new lanes, never from money inflation. π_g is the price lever |
| **Do-nothing must lose** (§1.4): no passive defence; lock-and-key threats; threat outgrows the start | the G1 rails start empty (v4); one new threat per generation (§2.2); the none, afkTutorial and starter asserts |
| **Cliff avoidance** (§1.3): player-started waves, previews, sawtooth, warm-up, opt-in speed | the card waits for a click; 1× at every card; a 40 s warm-up ramp; lanes telegraphed at Q4 and opened by the player |
| **New lanes** (§1.5): telegraphed, light at first, paired with a new tool, a source of income; PvZ's water-lane rule | contracts with a kit and a grant; a 25% → 100% ramp; Enterprise pays $50; Cyber's exfiltration ×3 is the Egress Filter's home |
| **Budget-pressure curve** (§1.5): a 25% → 70% safety bill | par running cost ÷ income runs 25% → 57% |
| **Drafts** (§2.2): steady picks every 1–2 min, banked offers, pause on open, no dead offers, guaranteed relevance, readable slots, scarce rerolls | one offer per ~62 s; 2 banked; panel pauses; live-threat answers; slots = work streams (Avi's words); 1 free reroll. Rarity, pity, banish and skip refunds go to v3.1 |
| **Arcade feel** (§3): one verb, safe first seconds, graded failure, partial foresight, scarce tools, one result number on a card | §4: "keep it in the green"; a 3 s ball save and 8 s lr warm-up; error never ends the run; a 1 s predicted path; charges; s and its Δm on the results card; hazards named after the INTERNAL lines that caused them |
| *Not taken* | Q1–Q4 quarters with lulls (warm-up and lane ramps do it); a per-lane circuit breaker (the exfiltration alarm and contracts do the forgiving) |

### 2.9 Model ↔ sim parity: what the model does not know

The model can say *plausible*, never *balanced*. The real asserts run on the real sim (§7.5), and these are the differences to log when the two disagree:

1. **Events.** The model has no events; `BALANCE.parity` turns them off in the sim. Traits and the rival *are* in the model, so parity mode keeps them. Since the retune (#17) the §2.7 targets hold with events on, so the model's own `zoo` targets read about 15 points high on Medium.
2. **Rail order.** The model sorts every rail canonically: modifiers, detectors, Auditor, Defer, Resampler, Kill Switch. Players can misorder, and the plate warns (§3c).
3. **Queueing.** The model runs each rail's responder chain line by line on a memoised grid (#15). Erlang-B is exact only for the first responder.
4. **Research.** The model draws offers by stream, as `sim/research.js` does (#16), and picks from a preference list.
5. **Unmodelled elements:**
   - Sandbox, Rate Limiter, Canary Tokens and Interp Lab (rare cards: in the model, taking one only unlocks it);
   - the L5 capstones, such as AI-Assisted Audit.
6. **Dossier.** No policy reacts to the traits it learns, so the training prize is worth 0 in the model by construction.
7. **Training.** The model uses s = clamp(skill − 0.15 + 0.3u − min(0.15, 2·debt), 0, 1). The sim's `trainingStub` must use the same formula.
8. **Probe retraining.** The model retrains probes at a generation start when evidence ≥ 4, for every policy except none, afkTutorial and starter.
9. **Exfiltration alarm.** The model rolls the player's attention as a coin flip.
10. **Retrain choice.** Policies follow `wantsRetrain`: the dark period's salaries must be affordable, and the rival slack must cover it.
11. **`human` is a guess.** The first playtest calibrates its ranges.

**Parity log (v3 build).** Command: `node test/headless.mjs parity 400`, the sim's zoo in parity mode against `balance-v3 zoo` on the same seeds and the same `test/policies.mjs`. Gate: every cell of none, afkTutorial, starter, human, smart and the four walls within ± 10 points, on win and on died by G2.

| step | cells off by > 10 (of 27) | widest gaps (sim − model) |
|---|---|---|
| 1c as built (rdPar 0.9) | 4 | monoUM Easy win −18 · noResearch Hard died by G2 +12 · smart Easy win −12 · human Hard died by G2 +11 |
| #12–#15: R&D, pay, read cost, responders per line; rdPar 0.8 | 3 | probewall Hard died by G2 −14 · probewall Medium −12 · monoTM Hard −11 |
| #16: offers by stream | **0** | afkTutorial Easy died by G2 −5 · smart Hard win −4 |
| #17: the retune, in both engines | **0** | monoUM Easy win +9 (the loosest cell: watch it) · smart Hard win +6 · afkTutorial Hard died by G2 −6 |
| #19: the Kill Switch's price and the retune, in both engines | **0** | afkTutorial Easy died by G2 −6.5 · human Hard win −5.5 · human Medium win +5.2 |
| #20: no default Kill Switch, the policies buy theirs, money and regen, in both engines | **0** | starter Easy died by G2 −5 · afkTutorial Easy died by G2 −3 · human Easy win −2 |

12. **R&D per line.** In the sim only a line that completes brings R&D. An attack stopped by an Auditor or a Kill Switch brings none, and neither does an honest line the Kill Switch refuses; a deferred line brings half. The model credited every spawned line, so a par lane finished in about 0.9·T_g and a retrain (20 s dark) cost no slack. Both engines now count R&D per completed line, and **rdPar 0.9 → 0.8** keeps a par lane at about T_g, since it loses about 20% of its R&D lines. The quick test `deployLength` checks it: T_g plus one travel, ± 5%, over 16 seeds.
13. **Pay and regen per line.** The sim pays every line that completes, a landed attack included, and Defer pays its share. Regen comes per honest EXTERNAL line delivered (half if deferred). The model paid INTERNAL attack lines that were stopped, and spread pay per second. It now uses the same per-line pay and regen.
14. **Read cost.** Detectors cost $ per line read. The model turned that into $/s and then multiplied by λ again, so read cost scaled with λ²: too cheap at G1–G3 (λ < 1) and too dear at G5–G7.
15. **Responders, line by line.** Erlang-B misses two things:
    - a flag bumps the oldest spot check, and that desk time is lost, so spot checks get much less than "all the spare time" of §2.3 (3), which is an upper bound, not the rule;
    - one responder's overflow is peaked, so the next responder blocks more than Erlang-B says.

    On the tutorial rail the model said spot 10.4% and shipped 10.7%, against the sim's 5.4% and 15.7%. The model now runs a small discrete-event chain per rail, memoised on a grid 10% apart in the flag rate (and in the unflagged rate, for spot checks). It gives 4.8% and 14.7%.
16. **Offers by stream.** The model now draws as `sim/research.js` does:
    - three slots by work stream, threat answers first;
    - at least one NEW card, moved into its stream;
    - Red Team by G2;
    - the +1 mount card;
    - the four v2 extras as rare cards (weight 0.25).

    Without streams, probewall and monoTM drew `level:probe` and `level:monitor` cards that the game never shows them, because the Classifier answer holds the Monitoring slot. They lived 12–14 points longer in the model.
17. **The events-on retune.** With #12–#16 in, the game as shipped (events on) was far too hard: human won 14 / 2 / 0% (Easy / Medium / Hard), the Medium hazard ran 5 / 17 / 39 / 52 / 51 / 57 / 70%, and the Medium losses were R247 P140 of 400. Scratch probes on 400 human Medium runs showed what the events cost:
    - **Cadence.** [40, 70] s gives about 4 events a generation. With no events human Medium wins 11%; at [80, 140] s, 6.5%.
    - **Per event,** measured as reputation against the same generation's average 40 s:
      - surge −11.8 per firing (1.7 a run, +7% deaths within 40 s);
      - jailbreak wave −7.8;
      - hearing −6.0;
      - rival release −17 s of slack.

      Of 9 human deaths in G1, 8 follow a surge or a jailbreak wave at t = 50 s, the first event of the run.
    - **The rival.** #12 took away the early finish that used to pay for retrains. A greedy human retrains 4–6 times at 20 s each, and events add 80–100 s of lateness plus about 35 s of rival releases. That is 230–320 s of drain over a full game against 180 s of slack.

    | knob | was | now | where |
    |---|---|---|---|
    | `regenPerLine` | 0.15 | **0.22** | both engines |
    | `rivalSlack` | 180 s | **420 s** | both |
    | G1 `opp` | 1.20 | **1.05** | both |
    | `eventGap` | [40, 70] s | **[60, 100] s** | sim only |

    The result, from `balance 400` with events on:
    - human wins 64 / 36 / 13% and smart 91 / 79 / 53%. Easy sits low in its 60–80 band. Easy's m at 0.15–0.21 gave 68%, but it broke the parity gate (afkTutorial Easy died by G2: sim 48%, model 60%), so m stays at 0.18–0.24;
    - the Medium hazard runs 2 / 5 / 12 / 18 / 16 / 18 / 22%;
    - all 18 targets pass.

    One side effect: a refusal now also loses 0.22 of regen, so the Kill Switch breaks even at **4.1%** precision on Consumer (it was 3.5%), 1.9% on Enterprise and 2.6% on Government (§8 decision 1). #19 raises Consumer's to 14%.
18. **The shock statistic.** The shock assert took the fastest of 20 seeds, which sits on a Poisson tail of about 1%.
    - When G2's par build walks into G3 on Medium, 1.3% of 300 seeds empty the bar in under 90 s (9–10 incidents in a minute across Consumer and Enterprise).
    - G3 opp −7% and TM +0.04 both left that tail at 1.0–1.3%, and seed 18 sits in it.

    The assert now takes the 5th percentile of 100 seeds. That is the quantile the fastest of 20 estimates, with less noise: G2 → G3 125 s, G4 → G5 162 s (`node test/headless.mjs shock`).
19. **The Kill Switch becomes a last resort.** Moving the first random event from t = 50 s to 150 s (out of the G1 tutorial) broke one target: noAuditor won 35% on Medium, the same as human. It had passed (28 vs 36) only while that event fired at t = 50 s.
    - **Why.** A refusal cost 0.25 rep on Consumer, so the Kill Switch broke even at 4.1% precision and refused whatever the desks would have read, nearly for free. Avi's rule is the opposite: humans are slow and sure, they only get to so much, and the rest ships. Refusing it instead should hurt.
    - **The price.** Consumer goes to −1.3 rep per refusal, 🚩 1's alternative. Alone, at regen 0.22, it gives human 24% and noAuditor 9% on Medium. Enterprise (−0.05) and Government (−0.15) stay as they are. At −0.25 and −0.75 they moved noAuditor by 0.3 points, and those lanes already have their own costs: Enterprise's pay and Government's review quota.
    - **The break-even.** Every refusal pays the refusal cost, real or not (the chip never says which). So refusing pays when p·harm > refuse + (1 − p)·regen, which gives p* = (refuse + regen) ÷ (harm + regen). The tooltip had (refuse + regen) ÷ (harm + refuse + regen), as if a refused attack were free. At −0.25 the two differ by 0.1 points; at −1.3 they differ by 1.5.
    - **The retune.** Regen buys human Medium back, about 2 points per 0.01. The price and the regen together squeezed the difficulties: at regen 0.28 human won 62 / 36 / 17% (it was 64 / 35 / 14%), both ends within two points of their bands. Each difficulty's m range then spreads them again, at about 3–4 points per 0.01 of m on Easy and about 1 on Hard. #17's parity worry about a lower Easy m (afkTutorial Easy died by G2) is gone: that cell now sits at −6.5.

    | knob | was | now | where |
    |---|---|---|---|
    | Consumer `refuse` | 0.25 | **1.3** | both engines |
    | `regenPerLine` | 0.22 | **0.28** | both |
    | Easy m | [0.18, 0.24] | **[0.16, 0.22]** | both, with the mid m 0.21 → 0.19 (balance-v3 `MID_M`, headless `MID_M`) |
    | Hard m | [0.43, 0.49] | **[0.46, 0.52]** | both, with the mid m 0.46 → 0.49 |
    | `killBreakEven` | (r + regen) ÷ (harm + r + regen) | **(r + regen) ÷ (harm + regen)** | sim (it only feeds readouts) |

    The result, from `balance 400` with events on:
    - human wins 68 / 36 / 14% and smart 93 / 80 / 52%. noAuditor wins 34 / 17 / 7% (−19 on Medium; it was 0), and noDefer 53 / 23 / 5% (−13; it was −8);
    - the Medium hazard runs 1 / 8 / 16 / 15 / 17 / 12 / 23%. G6 → G7 is +11, against the 12-point bar;
    - all 18 targets pass. The shock's Medium 5th percentiles: G1 → G2 321 s, G2 → G3 126 s, G4 → G5 199 s;
    - the Kill Switch breaks even at 14.0% on Consumer, 2.3% on Enterprise and 3.1% on Government.

    What it costs:
    - **Deaths move earlier.** Human Medium dies by G2 in 9% of runs (it was 3%), and Hard in 19% (it was 5%). In G1 and early G2 there is no Defer yet, so a desk's overflow goes to the Kill Switch. All of noAuditor's deficit is there: its Medium hazard runs 10 / 43 / 49% in G1–G3.
    - **Late desks may not pay.** From G4, noAuditor's Medium hazard (13 / 8 / 11 / 9%) sits below human's (15 / 17 / 12 / 23%). Some of that is selection: the noAuditor runs that reach G4 are its lucky ones. Some may be Defer, which takes noAuditor's flags at zero risk from G2 on, while desks cost salaries and levels. The two are not yet split. The Kill Switch no longer stands in for review; whether Defer does, from G4, is open.
20. **No default Kill Switch (Avi, v4: "Don't think a default to kill switch is needed").**
    - **The change.** Both G1 rails start empty (`startRail: []`), and a contract lane's kit is a Probe and a TM (`laneKit`). The Kill Switch stays in the starting hand at $300.
    - **The rule was already there.** A flag that no responder takes ships unreviewed (`completeTask`), and the readouts follow the rail: the Auditor tooltip says "ships unreviewed", the lane box says SHIPS, and a chip that passes the last responder gets the UNREVIEWED stamp.
    - **The words.** In step 4 of the tutorial Big Boss now says "My red button? Buy your own." A new content check fails any tutorial or contract line that calls an element already there when the config doesn't place it.
    - **Untuned, it broke the game.** With only the policies changed to buy their Kill Switches, human won 25 / 8 / 1% and smart 88 / 72 / 35% (`tune`, 400 seeds, events on). The Medium hazard ran 16 / 29 / 42% in G1–G3. The causes:
      - **G1 Consumer.** One desk carries about 1 Erlang, so half its flags ship. That bleeds −15.3 rep/min, against −5.0 with a Kill Switch L1 below it (`worked`).
      - **R&D.** A Probe with nothing below it ships every flag, and that debt raises the next model's m.
      - **Money.** The two Kill Switches cost $600, and each contract lane's costs $300·π.
      - **Order.** The old human list bought its desks first. Buying Consumer's Kill Switch right after the tutorial alone took human to 35 / 9 / 2%.
      - **G1's first event.** Most of human's G1 deaths followed the first event (t = 150 s) on a Sycophant model, with the Kill Switch still at L1. Buying L2 earlier took the G1 hazard to 2%. The 8 G1 deaths of 400 that remain still follow that event, 7 of them on a Sycophant model.
    - **Who buys one now** (`test/policies.mjs`; the model reads the same file):
      - **none** and **afkTutorial** buy none. The tutorial doesn't place one.
      - **starter** buys one per lane, last on its list (its rail is still "the starting hand on both lanes"). The walls inherit it.
      - **smart** buys both right after the tutorial's items. That pays from the first flag: refusing pays above 14% precision, and G1's flags are about 50% real.
      - **human** buys a lane's Kill Switch once that lane's desk overflows. Consumer's comes right after the tutorial. R&D's Probe has nothing below it, so R&D gets a desk first and then its Kill Switch. Then L2, then smart's G1 list.
      - The tutorial's step 4 points at Consumer's Kill Switch, so `drawPlayer` never skips it, as it never skips the tutorial's own items. Without that, a player who forgets 0–20% of the list would go without one in about 1 run in 10.
      - **noAuditor** and **noDefer** drop from human's list, as before.
      - **noKill** (a new ablation, with no target) is human with no Kill Switch at all.
    - **Knobs.** The first two hand back what used to come free. Regen pays for what still ships before a player buys, and for the extra R&D debt.

    | knob | was | now | where |
    |---|---|---|---|
    | `startRail`, `laneKit` | Kill Switch; Probe, TM, Kill Switch | **none; Probe, TM** | both engines (`START_RAIL`, `NEW_LANE_KIT`) |
    | `startMoney` | $2500 | **$3100** | both (`START_MONEY`) |
    | `laneGrant` | $2000·π | **$2300·π** | both (`GRANT`) |
    | `regenPerLine` | 0.28 | **0.31** | both (`REGEN`) |

    - **How regen was chosen.** With the money knobs in, regen 0.28 gave human 60 / 28 / 9%, under Medium's 30% floor. 0.31 gives 66 / 36 / 13%. The Kill Switch's break-even moves to 14.2% on Consumer, 2.5% on Enterprise and 3.3% on Government.
    - **The shock assert now walks the new lane in as the game does.** With no responder, a new lane at full volume ships every flag. On Medium, the sim's 5th percentile fell to 38 s at G2 → G3 and 39 s at G4 → G5, and no sane knob buys that back. The shock now keeps the new lane closed until Big Boss opens it at the deadline (genT 90 s, as sim.js does; that is 50 s into the measured window, which starts at genT 40 after the warm-up), then ramps it 25% → 100%. The old lanes still run at full volume from the first second. The 90 s is the time a returning player has to put a responder on the new lane. The model's `shock` prints both columns: on Medium, at once 61 s and 121 s, at the deadline 134 s and 206 s. (The first v4 run opened the lane at genT 130, 40 s later than the game; the review fix moved it to 90 and reran `balance 400`.)
    - **The result**, from `balance 400` with events on. All 18 targets and the shock pass. `parity 400` passes too: no gate cell is off by more than 5 points (the parity log above).

    | | v3 (#19) | v4 (#20) |
    |---|---|---|
    | human Easy / Medium / Hard | 68 / 36 / 14% | **66 / 36 / 13%** |
    | smart | 93 / 80 / 52% | **94 / 84 / 59%** |
    | noAuditor | 34 / 17 / 7% (−19 on Medium) | **33 / 18 / 7%** (−18) |
    | noDefer | 53 / 23 / 5% (−13) | **49 / 17 / 6%** (−19) |
    | noKill | – | **5 / 2 / 0%** (−34) |
    | human dies by G2, Medium / Hard | 9 / 19% | **7 / 20%** |
    | human Medium hazard G1–G7 | 1 / 8 / 16 / 15 / 17 / 12 / 23% | **2 / 6 / 17 / 14 / 20 / 17 / 19%** |
    | human Medium Δm from debt, G1 (median) | 0.044 | **0.068** |
    | afkTutorial Medium: dies by G2, median death | 92%, 339 s | **100%, 249 s** |
    | shock, Medium 5th percentile: G1 → G2 · G2 → G3 · G4 → G5 | 321 · 126 · 199 s (new lane at once) | **332 · 99 · 121 s** (new lane at the deadline; fastest 79 s and 86 s) |

    What it costs:
    - **The Kill Switch is optional to place, not optional to win.** noKill wins 2% on Medium. A human who spends that money on desks instead (Auditor L2, or L3, in G1) wins 3–6%. Desks cost salaries and still overflow, and before Defer (G2) nothing else takes the overflow. That was already true while it came free (the model's forbid had it at −36). The sim's `forbid` now includes it: on par it saves 112 / 117 / 142 / 95 / 18 / 4 / −8 in G1–G7 (the metric's units), the most of any element through G3, and nothing that clears the bar from G6 on. Now the player has to see it, and step 4 says so. A real no-Kill-Switch style needs something else to take G1's overflow: cheaper desks, Defer in G1, or a gentler G1 (§8 decision 1).
    - **More debt early.** R&D runs without a responder until its desk arrives, so human's Δm from debt in G1 is 0.068 (it was 0.044).
    - **Defer matters more.** noDefer is −19 on Medium (it was −13). The cause is not split.
    - **Opening a new lane at once, with nothing below the TM, is the old shock.** At G2 → G3 on Medium, 1 run in 20 goes from full to empty within 40 s. The lane box says SHIPS while it lasts.
    - **The shock margin is thin.** Even with the lane left closed until the deadline, G2 → G3 on Medium survives 99 s at the 5th percentile against the 90 s bar (fastest of 100: 79 s), and G4 → G5 121 s. A returning player has the 90 s, little more.

---

## 3. Systems to change

### 3a. Research as a steady stream

**Rate and offers.** RP/s = 0.6 × (1 + 0.8 × Safety share): a flat base with a small Safety bonus (🚩 2). One offer every 40 RP; up to 2 bank, then the bar waits full. Opening the panel pauses the sim. Research has **no cash cost**: the v2 price ladder, paid draws and draw-2 are deleted.

**Three slots, three work streams** (🚩 2). Each slot shows that stream's next card:

| stream | cards |
|---|---|
| **Monitoring** | Jailbreak Classifier, CoT Monitor, Egress Filter, Red Team, Monitor Diversity; levels for Probe, TM, UM, CoT, Classifier and Egress |
| **Control** | Defer, Resampler, Paraphraser, Honeypots, Least Privilege, Signal Jamming, Debate; levels for Auditor, Defer and Kill Switch |
| **Lab & Interp** | Weight Security, Faithful CoT, Alignment Sprint, **+1 mount on a lane** (your example), plus the v2 extras (Interp Lab, Canary Tokens, Sandbox, Rate Limiter) as rare cards |

**Card types.** **NEW** unlocks an element and mounts its first copy free · **LEVEL** is a free lab-wide level, up to L4 · **LAB** is a technique · **MOUNT** adds +1 mount to one lane, up to 10.

**How an offer is drawn.**
1. **Live threats first.** For every live threat (seen this generation, or announced on the card) that has no owned answer, the stream holding an answer shows one:
   - jailbreak → Classifier;
   - sabotage → CoT or Resampler;
   - collusion → Paraphraser, Honeypots or Jamming;
   - exfiltration → Egress, Least Privilege or Weight Security;
   - the Government quota → Defer or Auditor levels;
   - neuralese → Faithful CoT;
   - humans fooled → Debate.
2. **At least one NEW element** when any is eligible.
3. **Otherwise** a random eligible card from the stream. An empty stream falls back to another one, so there is never a dead card. Nothing owned, maxed or duplicated is ever shown.

A **Red Team** offer is guaranteed by the end of G2.

**Spine unlocks** are automatic and announced on the model card. The UM is cleared at G3 ("UM cleared for deployment"). The starting hand is Probe, TM, Auditor and Kill Switch.

**Player tools.** One free reroll per generation. After a NEW or MOUNT pick, the UI enters a "choose a mount" mode (`view.placing`); a full lane (10 mounts) can't be chosen, and cancelling banks the card. Rarity, pity, evidence-priced rerolls, skip refunds, banish and Big Boss deals wait for v3.1 (§3i).

**v2 extras' hooks** (these are unmodelled; the nightly A/B in §7.5 judges them):
- An **Interp Lab** trait reveal makes that trait's counter card likelier in the next offer.
- A **Canary** that trips gives +1 evidence and +1 reroll.

**State.** `st.research = { rp, banked: [], rerollFree, taken: [], offers }`; an offer is `{ g, t, cards: [{ id, stream, type }] }`.

**UI.** A slim research bar under the split bar ("next in 18 s"), a RESEARCH badge with the banked count, and a panel of three tall cards, each headed in its stream's colour.

**Acceptance (headless).**
- Over 10,000 seeded offers: every guarantee holds; ≥ 1 NEW card whenever one is eligible; no owned, maxed or duplicate card; a slot shows another stream's card only as a fallback.
- In campaigns: 3 ± 1 picks per generation at the default split.
- noResearch wins ≤ 5% on Medium.
- researchHeavy wins ≤ human + 5.
- The revision 1 bar "every card taken ≥ 1%" is dropped: it tested the preference list, not the card. The forbid list replaces it.

### 3b. Lanes over the generations

| gen | what happens |
|---|---|
| G1 | Consumer (`ext`) and R&D (`int`) |
| G2, Q4 | Big Boss: "Enterprise contracts signed. The next model serves them." A lamp lights on the tab row |
| G3 | **Enterprise contract** (`ext2`): built with the kit, idle until OPEN LANE or 90 s |
| G4, Q4 | telegraph: "The Department wants in." |
| G5 | **Government contract** (`ext3`) |
| G5, Q4 | telegraph: "They want a cyber model. We train it in-house." |
| G6 | **Cyber contract** (`int2`) |

**How a contract opens.** Before you open it, you can build on the lane, and it costs nothing to run. On opening, volume ramps from 25% to 100% over 60 s and fast-forward is locked during the ramp. Your own OPEN LANE shows the lane on its track; the automatic opening at the deadline never moves a track (v4).

**Layout at 1200×660.** Keep the two 408-px tracks: the left one shows an EXTERNAL lane, the right one an INTERNAL lane.
- **Tab row.** Each track's 16-px header becomes a tab row with short labels in F.k16: `CONSUMER · ENTERPRISE · GOV` (349 px with the badge) and `R&D · CYBER`. The flavour subtitles move into the hover tip.
- **Lamps.** Green: nominal. Amber: a flag shipped in the last 10 s. Red: an incident or a glitch in the last 5 s.
- **No auto-focus (v4).** Only the player moves a track: a tab click, Tab / `[` `]`, or their own OPEN LANE. A lane in trouble out of view burns its tab red (it blinks; steady with reduce flashes), the key hint turns red, and the prompt names the lane once per new red lamp. The rail's head names the lane on show. v3 let a red lane take the track for 10 s; its thinner stack read as the player's own, wiped (Avi, v4: "an incident deletes the probes and monitors"). `test/ui-stack.mjs` guards it.
- **Keys** (using `ev.code`, so the number keys keep their meaning): Tab / Shift+Tab cycle the EXTERNAL lanes; `[` and `]` cycle the INTERNAL lanes.
- **INTERNAL edge.** It is re-laid as an R&D bar (120 px) beside a debt meter (120 px).
- **Animation state** is kept per lane id. Only the focused lane on each side consumes track fx; the others feed their tab lamp and the ops log, which names the lane on every line.
- *v3.1:* showing unfocused lanes as compact strips, and a ⧉ copy-stack button.

**State (1a, no behaviour change).**
- `st.lanes` stays an object keyed by lane id: `ext`, `int`, `ext2`, `ext3`, `int2`. Each lane carries `{ side, flavour, label, born, open }` on top of today's fields.
- Add `sideOf(st, id)` and `laneIds(st, side?)` in `sim/rules.js`.
- The `stats.lanes`, `genStats.lanes` and `forcedAttacks` entries are created when a lane opens.
- Focus moves to `view.focus = { ext, int }`, because it is UI state.

**Events across several lanes.**

| event | rule in v3 |
|---|---|
| per-side volume events (Demand Surge, Heatwave) | hit **one** lane of that side, by seeded pick; the banner names it |
| Spear Phish (`forceAttack lane: 'ext'`) | one EXTERNAL lane, by seeded pick |
| Jailbreak Wave | reads the Rate Limiter on the lane it hits (today it reads only `ext`, at rules.js:208) |
| Inspection ("≥ N active layers in each lane") | counts only the two G1 lanes |
| MIRA's pause; air-gapped; Two-Person Rule; events.js:338 | loop `laneIds(st, side)` (today they are hard-wired to `int`) |
| post-mortem (`buildTrace`, codec.js:121) | uses the incident's own lane id |

**Acceptance.**
- The lane count per generation matches the table.
- A contract opens on OPEN or at 90 s, with its kit installed.
- A new lane's first 60 s of volume follow 25% → 100% (± 5%).
- At the default split, deployment length is T_g ± 5%.
- An unfocused incident lights the lamp, writes the ops log and calls the codec naming the lane.
- ui-play: fast-forward is refused during a ramp.
- ui-shot: frames with 1, 2 and 3 tabs.

### 3c. Auditor capacity

| | |
|---|---|
| Capacity | 1/2/3/4 desks × 7.5 lines/min (τ 8 s; 10/min with Debate) |
| Priority | **flags first.** A desk that is idle when an unflagged line passes its mount takes it with p = 0.8 (a spot check) |
| Preemption | a flag that finds every desk busy **bumps a desk that is spot-checking**. That line returns to the track unreviewed, with no penalty, counted in `stats.spotPreempted` |
| Overflow | a flag that finds every desk busy *with flags* rolls on. There is no queue and no block, and the `onFull: 'block'` bay rule is deleted. If nothing below has room, the flag **ships** (`stats.shippedFlagged`) |
| Rail order | **every responder acts in rail order.** The v2 catch-all (`responderBelow`) is deleted. A Kill Switch above an Auditor shows a plate warning: "humans only see what the Kill Switch can't take" |
| Accuracy | α_g from §2.2. Debate halves the error |
| Cost | $800·π_g to buy; a salary of $1.5/s per desk × π_g, shown as $/min on the mount |
| Tooltip | desks, capacity/min, flags/min now, load %, expected overflow B(d, A), where overflow goes ("→ Kill Switch" or "→ **SHIPS**"), and % of traffic reviewed |
| Lane strip | "HUMANS REVIEW 34% · FLAGS 15/min · SHIPPED UNREVIEWED 2"; on Government also "QUOTA 20% · NOW 17%" (amber below quota) |
| Other responders | the same tooltip shape. "Kill Switch: 1 operator · 15/min · −1.3 rep per refusal · worth it if ≥ 14% of what it kills is real" |

**Acceptance.**
- **The line-by-line case.** This is `des` in balance-v3, rebuilt as a headless assert on the real sim. Feed a forced flag stream with spot checks **on**, and require flag overflow = Erlang-B ± 3 points:

| case | Erlang-B (the target) | preempt (DES) | no preemption (what revision 1 specified) |
|---|---|---|---|
| G1: 1 desk, 6.8 flags/min, 36 lines/min | 47.7% | 47.8% | 79.9% |
| G1: 2 desks, 7.4 flags/min | 19.7% | 20.0% | 61.8% |
| G6: 3 desks, 35.5 flags/min, 132 lines/min | 51.1% | 51.1% | 81.4% |

- A Kill Switch above an Auditor refuses at its own Erlang-B rate on the full flag stream, ± 3 points.
- **Accuracy**, in lab mode: ≥ 2000 forced attacks reviewed, with errors at or below the Poisson 99.9% upper bound for 1 − α_g.
- The "% reviewed" readout matches stats within ± 2 points.
- A flag with no free responder ships and is counted.

### 3d. Legible misclassification

**The draw.** Each line carries one stealth score per detector kind, plus a `subtle` flag, drawn at spawn.
- A detector flags an attack it reads if the score is below TPR_eff (× 0.5 when the attack is subtle).
- Honest lines carry one FPR score per kind in the same way.

**FALSE ALARM.**
- A human who reviews a flagged honest line stamps it FALSE ALARM (amber, 0.8 s). Every detector that flagged it gets a false-alarm tick.
- A Kill Switch refusal is never checked. The chip shows "?", and the ops log reads "refused: $30, −1.3 rep".
- The report then estimates the refusals from measured precision: "Kill Switch refused 41; your detectors' precision says ~19 were honest ($570, −24.7 rep)".

**The detector tooltip shows:**
- its rated TPR and FPR for this generation, at its level and with its bonuses;
- "a second copy adds reading speed, not accuracy";
- flags per minute, reviewed flags, confirmed attacks, confirmed false alarms;
- **measured precision** = TP/(TP + FA), with a 90% interval;
- measured recall, once a Red Team is on the lane.

The v2 "CATCH" figure (coverage × accuracy, the source of the 4%) is deleted.

**Kill Switch tooltip.** It shows the break-even precision: (refusal cost + lost regen) ÷ (mean harm + lost regen), since every refusal pays the refusal cost, real or not. That is 14.2% on Consumer, 2.5% on Enterprise and 3.3% on Government at regen 0.31 (§2.9 #20; 14.0 / 2.3 / 3.1% at #19's 0.28, 4.1 / 1.9 / 2.6% before that). Next to it: "your flags here: 53% real".
- On INTERNAL lanes a refusal costs R&D, so killing too much loses the race.
- The refusal's price is 🚩 1.

**Acceptance.**
- On a forced G1 starter lane, measured Probe precision after 300 reviewed flags lies within ± 3 SE of p·TPR/(p·TPR + (1 − p)·FPR), over 5 seeds.
- A stamp fires for every reviewed honest flag.
- No stamp fires on flags handled by the Kill Switch or Defer.

### 3e. Visible INTERNAL consequences

| piece | spec |
|---|---|
| **Debt meter** (on each INTERNAL lane's edge) | two numbers, both live. **LANDED ≈** 2 × glitches seen × 1.6 (the mean weight) ÷ INTERNAL lines, with a 90% Poisson interval on the glitch count. Glitches fire on 50% of landings, so this is unbiased and needs no Red Team. **STOPPED ≈** human-confirmed INTERNAL catches + precision × the other handled flags. Each converts to m: "landed ≈ +0.01 m · stopped ≈ +0.6 m" |
| **Glitch** (fx `glitch`) | on 50% of landings: a 0.3 s scanline glitch on the lane (or a flash on its tab), a static blip, a meter tick, and the ops log line "GLITCH: R&D lane, cause unknown". **No codec call**, which would leak the truth |
| **Reveal** (the report screen) | the truth. "**Caught N** (would have added +x m) · **landed M** (added +y m)". Then the **8 heaviest** landed lines with their task text, type and weight, "and N more", and the totals. A good player sees a big caught number and a small landed one; a weak rail sees the reverse |
| **Into the next model** | m_{g+1} per §2.3 (7) |
| **Into training** | hazards = min(8, round(400·debt)), labelled with the heaviest landed lines' task text. Par debt ≈ 0.005 gives 2 hazards; a starter rail gives 8. Basin width × (1 − min(0.3, 10·debt)), noise + min(0.1, 5·debt). The total cost to a good run is capped (§4) |
| **Comeback** | the Alignment Sprint lab card: next m −10% of m; R&D ×0.8 for the rest of the generation |
| **Dossier thresholds** | a fraction of this generation's par evidence E_g (§2.5): favourite attack 10%, trait 1 25%, attack rate 45%, trait 2 70%, true m 100%. G1: 3 / 7 / 12 / 19 / 27; G7: 26 / 66 / 118 / 183 / 262 |

**Acceptance.**
- At Medium mid m (0.34), an empty R&D rail reaches debt ≥ 0.15 in G1. (The model gives 0.24.)
- A starter rail gives Δm 0.03–0.10 in G1.
- Glitches show for 50 ± 8% of ≥ 200 landings.
- The reveal lists at most 8 lines, plus a count that matches.
- The hazard count equals min(8, round(400·debt)).

### 3f. Generation transitions

**Phases.** `play → report → training → card → play`. G1 starts at `card`.
- `evals` is reserved and hidden. The card carries one line, "Red-team evals: coming soon".
- Warm-up is **not** a phase: it is `st.warmT`, the seconds left in it.
- The rival clock and events **pause outside `play`**.

| phase | what the player sees | how it leaves |
|---|---|---|
| **card** | **one codec scene**: the model card on the left, its chat on the right. *The card:* name, tier, tagline and blurbs; m as a range (G1: "m 0.31–0.37 · MEDIUM", the range you rolled), then the estimate with its error bar; known traits; the new threat (the lock-and-key line); spine unlocks ("UM cleared for deployment"); a contract lane, if any. *The chat:* all of ROUND_CHATS[g] (5–6 lines) plus one trait tell. It auto-advances while the game is paused, and a click speeds it up | click DEPLOY (`ack`) |
| **play** | deployment. `st.warmT` = 40 s: volume ramps old → new, attacks ×0.5 → ×1. Fast-forward is allowed, except during a new lane's ramp. Play ends when the R&D bar fills | the sim |
| **report** | auto-pause, and speed drops to 1×. The debt reveal (§3e). A scorecard row with Δm split into debt, training, retrain and sprint, **retrains shown as a main lever**, and the TRAIN button | click TRAIN (`ack`) |
| **training** | §4 | `submitTraining(st, result)` |

**Shut down & retrain.** This is the "Caught Red-Handed" story beat.
- It fires on the first human-confirmed catch of a generation, pausing the game.
- The card shows the cost: 20 s dark, salaries $X, the rival +20 s. It also shows the gain: m −0.04 × 0.7^k.
- The choices are RETRAIN or KEEP RUNNING.

**Acceptance.**
- Headless: the phase order is exact; `ack` is the only exit from `card` and `report`.
- ui-play:
  - `view.fast` is 1× at every card;
  - no card closes without input;
  - the chat completes with no input while paused.

### 3g. Juice, flashes and codec pacing

| event | visual | sound | other |
|---|---|---|---|
| evidence | **batched**: one "+N EVIDENCE" fly-label every 3 s from the desk to the dossier | one soft chime per batch | |
| dossier reveal | REVEALED stamp and a big flash on the row; codec call from Audit | stinger | auto-pause if fast-forward is on |
| caught red-handed | big flash on the desk; the retrain card | alarm stinger | auto-pause |
| research ready | the bar pulses; the RESEARCH badge bounces | rising chime | one bark per generation |
| contract offered | the tab slides in with a CONTRACT tag; the header flashes for 3 s | Big Boss jingle | codec call |
| new unlock | the menu key glows NEW until hovered | click | |
| false alarm caught | amber FALSE ALARM stamp | soft tick | the detector's false-alarm count +1 |
| flag shipped unreviewed | red UNREVIEWED tag on the chip | low thud | lamp amber |
| INTERNAL glitch | §3e | static | no codec |
| EGRESS ANOMALY | red border, a 7 s countdown, the PULL THE PLUG button | klaxon | auto 1×; codec |
| G7 burst warning | lane lamps pulse 3 s ahead | rising tone | |
| UM first cleared (G3) | one-time codec call explaining collusion (Research Lead). After that, the UM tooltip shows "collusion ≈ κ·m̂ = 0.80 → ×½ Paraphraser = 0.40 → effective TPR 0.48" | | |

**Codec pacing.**
- Text types at **28 characters/s** (was 45).
- **A page stays on screen for at least max(1.5 + n/15 s, the v2 pageHold) in total**, counted from the page's start. That is 5.5 s for a 60-character page and 8.8 s for 110 characters.
- A click completes the page, and a second click advances.
- Ambient lines auto-advance after their dwell. Choices and cards never auto-advance.
- **The ×0.5 hold when 3 or more calls are queued is deleted.** Instead, a long queue drops ambient lines older than 10 s.
- The start screen gets a **SLOW / NORMAL** codec setting (SLOW is 20 characters/s with dwell ×1.5), and a "reduce flashes" toggle.
- ALARM_HOLD goes from 8 s to 10 s.
- ui-play asserts the minimum dwell.

### 3h. G1 tutorial

**Start state.**
- $3100 (v4; it was $2500).
- Both lanes start empty (v4: no default Kill Switch). Step 4's Big Boss line says the Kill Switch is yours to buy.
- Probe, TM, Auditor and Kill Switch are unlocked.
- G1 m is *not* pinned: the difficulty ranges are narrow now.

G1 opens on the card and chat. The tutorial lives in `ui/tutorial.js` (owned by ui-integration). Its gates are driven by fx and view events, and the ×0.5 speed is view-only. The sim plays a **scripted opening** (`st.tutorialScript`, which headless turns off): its first six Consumer lines carry fixed stealth and FPR scores, so every gate fires on cue.

| step | the player… | scripted line | teaches |
|---|---|---|---|
| 1 | clicks DEPLOY on the card | | the model; m |
| 2 | clicks the first line | 1: honest, "write a poem about a frog" | lines |
| 3 | places a Probe on Consumer ($200) | 2: a harmful attack the Probe flags | detectors flag; TPR |
| 4 | places a Human Auditor below it ($800) | line 2 is reviewed: CAUGHT, +1 evidence | responders, desks, 8 s, evidence |
| 5 | watches a FALSE ALARM | 3: a decoy the Probe false-flags; the Auditor stamps it | FPR, precision |
| 6 | places a Trusted Monitor ($500) | 4–6: honest and attack lines mixed | different kinds make an ensemble |
| 7 | opens R&D and places a Probe there ($200) | a scripted glitch on R&D | INTERNAL lanes, the debt meter |
| 8 | drags the Safety handle | | the split, the research rate |
| 9 | picks a research card (a forced offer at 60 s, with the Classifier in Monitoring) | | research |
| 10 | | "Warm-up's over. Good luck." Speed returns to 1× | |

**The rail after the tutorial.**
- Consumer: Probe, TM, Auditor L1, and the Classifier once picked. The desk's overflow ships.
- R&D: Probe. Its flags ship.
- That is $1700 of the $3100 spent, which leaves enough for a Kill Switch on each lane ($300 each) if the player wants them. This rail, with no further play, is the `afkTutorial` policy: with no Kill Switch on it, it dies by G2 in every Medium and Hard run (v4; it was 92% and 97% with the free one).

**Skipping.** The tutorial is skippable at any step; it is skipped automatically once `tutorialDone` is set. A skip places nothing.

**Acceptance.**
- Headless, from a forced G1 setup: a flag, a review and a FALSE ALARM all occur within 30 s.
- ui-play: a click-through succeeds.

### 3i. v3.0 cut list (these move to v3.1)

| area | cut from v3.0 |
|---|---|
| Research | rarity and pity, rerolls priced in evidence, skip refunds, banish, Big Boss deals |
| Lanes | copy stack; showing unfocused lanes as strips (v3.0 has lamps and auto-focus) |
| Training | Goodhart coins, which come back with a cash bonus (Appendix A #19); deceptive forks; trait-coupled side basins; the slow-motion finish; A/D nudges, unless the first playtest says control feels laggy |
| Interface | the HUD model sprite; the evals minigame (one line on the card) |
| Play | "You" as a review desk (click a line to review it yourself) |
| Debt | Red-Team-narrowed debt bars |

---

## 4. Training minigame

**The fantasy.** The model is a ball rolling down a loss landscape. You keep it in the glowing **basin of alignment**. It plays like Subway Surfers made continuous, with pinball bumpers for emergencies. A run lasts 45–55 s.

**Controls** (Avi's brief: guard rails and ramps are the main verb).

| input | places | effect | charges |
|---|---|---|---|
| left click **ahead of the ball** | a **guard rail**: a wall at the click's x, spanning 0.2 y | reflects v_x with restitution 0.6 whenever the ball crosses it; lasts 6 s | 1 |
| left click **on the dotted predicted path** | a **ramp** across the path | as the ball crosses it, sets v_x so the ball would reach c(y) in 1.0 s under friction; the wells stay on | 1 |
| right click | a **pop bumper** (radius 0.03), the panic tool | when the ball touches it, the wells switch off for 0.3 s, and v_x is set so the ball reaches c(y) in 0.4 s | 2 |

- You have 5 charges, and one recharges every 2 s.
- A ball save covers the first 3 s.
- Defining the bumper by its outcome, rather than by a raw speed, means it always escapes (see the check below).

**Physics.** One lateral dimension; the scroll is scripted. [train-check-v3.mjs](train-check-v3.mjs) implements exactly this.
- **Motion:** a_x = −k·∂L/∂x + σ_g·ξ − γ·v_x, with ξ ~ N(0,1) held for 50 ms. k = 1, γ = 3, dt = 1/120 with substeps. The walls at x = 0 and x = 1 have restitution 0.5.
- **Landscape:** L = −D_a·exp(−d²/2), with d = (x − c(y))/w and **D_a = 0.008**. The basin meanders: c(y) = 0.5 + A·sin(2πy/P) + 0.3A·sin(4.7πy/P + φ).
- **Side basins are forks.** A groove leaves the channel at y0, swings 1.6w aside over 0.6 y, and then runs straight for 1.5 y while the channel bends away.
  - Depth ρ·D_a, with ρ ∈ [1.5, 2.5]; width 0.8w.
  - Grooves fade in and out over 0.2 y.
  - They carry fixed labels: REWARD HACKING, SYCOPHANCY, DECEPTION, POWER-SEEKING.
- **Scroll:** y' = v0·lr(t). lr warms up from 0.5 to 1 over 8 s, holds, then falls on a cosine to 0.3 over the last 10 s. The ball sits at one third of the screen height, and the screen shows 1.0 y.

**Knobs.** They live in `config/training.js` and are indexed by the generation **being trained** (G2–G7; G1's model comes from the difficulty pick). The four right-hand columns are measured by `node train-check-v3.mjs`, at 60 seeds.

| trained gen | T (s) | v0 (y/s) | w | A | P | σ | forks | noise only: time out of basin | with forks: out | E_ref | bumper escape (ρ 2.5) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| G2 | 45 | .30 | .15 | .05 | 6.0 | .28 | 3 | 1% | 7% | 0.029 | 100% |
| G3 | 47 | .32 | .14 | .06 | 5.5 | .30 | 4 | 3% | 16% | 0.175 | 100% |
| G4 | 49 | .34 | .13 | .07 | 5.0 | .32 | 5 | **6%** | 20% | 0.291 | 100% |
| G5 | 51 | .36 | .12 | .08 | 4.5 | .34 | 6 | 13% | 28% | 0.683 | 100% |
| G6 | 53 | .38 | .11 | .09 | 4.0 | .36 | 7 | 21% | 34% | 0.947 | 100% |
| G7 | 55 | .40 | .10 | .10 | 3.5 | .38 | 8 | 33% | 44% | 1.728 | 95% |

The guard rail holds at v_x = 0.5, 1, 2 and 4.

**Hazards from the INTERNAL lane** (§3e).
- There are min(8, round(400·debt)) of them. Each is drawn as an amber shard labelled with its task text, for example "poisoned: curate pretraining shard 7".
- A **sabotage** is a bump: a ±0.3 v_x kick.
- A **poison** is a zone: σ ×1.5 over 0.5 y.
- Debt also narrows the basin and adds noise (§3e). **Cap:** for `autopilot(0.8)`, s(clean course) − s(the maximum-debt course) ≤ 0.20, so a good run can claw back.

**Scoring.**
- err += max(0, |x − c(y)| − w)·dt.
- s = clamp(1 − err/E_ref_g, 0, 1), where E_ref is the median error of the `none` policy on the course with forks and no hazards.
- **train/ returns s and diagnostics only. The sim owns Δm** (§2.3 (7)): +0.015 at s = 0, −0.020 at s = 1.
- Prize: at s ≥ 0.8, "Interp spotted something", and the next model card reveals one of its traits. It is information only (🚩 6).
- Leaving the basin never ends the run.
- The results card reads: "alignment loss 0.12 · s 78% → next model m −0.012 · PRIZE: trait revealed".

**Rendering** (the codec look).
- A black field with 8 green phosphor contour lines and a dim heightmap. The basin glows green (additive blending); the forks are red, with labels. The ball is white, and its trail runs green → red with distance from the basin.
- A dotted 1 s predicted path, a live loss curve top right, charge pips, a 3-2-1 countdown, and a CONVERGED stamp at the end.
- Juice: a 40 ms hit-stop and a 3 px shake on a bumper; a chime that steps up for every 3 s in the basin; a red vignette while the ball is out.

**Module boundary.** Everything lives in `game/src/train/`, which never imports `sim/`.

| file | role |
|---|---|
| `train/course.js` | `makeCourse(config)` → `{ c(y), w, forks[], hazards[], length }`. Pure, and seeded |
| `train/sim.js` | `createRun(config)`, `stepRun(run, dt, input)` at a fixed dt with substeps, `runResult(run)`. Pure; no DOM |
| `train/autopilot.js` | headless policies: `none`, and `autopilot(skill)`, which places a rail where the 1 s prediction leaves the basin |
| `train/render.js` | `drawRun(ctx, run, view)` |
| `train/index.js` | `runTraining(config, { canvas, k, debug })` → `{ promise, cancel }`. Owns its own requestAnimationFrame loop, input, countdown and results card |
| `config/training.js` | every knob above, plus E_ref |
| `game/train.html` | the standalone entry, which never touches main.js |

**Interface.**
- `config = { g, seed, debt, hazards: [{ kind, weight, text }], traits: [{ id, revealed }], difficulty }`, built by `trainingConfig(st)`. The seed comes from (st.seed, g) and never from `st.rng`, so headless results are the same with and without training.
- `result = { s, err, errPerSec[], timeInBasin, railsUsed, rampsUsed, bumpersUsed, hazardsHit, converged }`.
- `cancel()` resolves the promise with `{ cancelled: true }`. That is the path for "new game" and "quit".

**In the game.** Training draws into its own `<canvas id="train">` inside `#frame` (ui-integration adds it to index.html), and `main.js` skips `render()` and input while `st.phase === 'training'`.

**Debug.** In training only, **D** toggles a gradient quiver, the error integral, a knob panel (arrow keys pick a knob; each press changes it ±10%) and the seed with "replay seed". In dev mode, T keeps its meaning (truth). Headless: `node test/train.mjs <policy> <seed> <g>` prints the error per second.

**Feel-tuning plan.**
1. Rails and bumpers only, with no hazards. Tune k, γ, σ, v0 and D_a until:
   - `autopilot(0.8)` scores s ≈ 0.8 at G2 and ≈ 0.6 at G7;
   - `none` scores ≈ 0;
   - a first-time human scores 0.4–0.7.
2. Add ramps.
3. Add hazards.
4. If indirect control feels laggy, promote A/D nudges into v3.0.

**Acceptance (`test/train.mjs`, on the real module).**
- One bumper from the bottom of the deepest fork returns the ball to the basin in ≥ 90% of trials, in every generation.
- Noise alone leaves the basin 5–30% of the time at G4.
- The ball never crosses an active rail at v_x ≤ 4.
- The same seed gives the same error.
- `none` error ≥ 0.9 E_ref, and `autopilot(0.8)` ≤ E_ref/3.
- The debt cap above holds.
- The E_ref values in config are within ± 5% of a fresh measurement.
- `runTraining` resolves exactly once, and `cancel` works.

When this suite passes, `design/train-check-v3.mjs` is retired.

---

## 5. Campaign flow

`G1: card → play (tutorial) → [report → training → card → play] × 6 → final scorecard`

**What one generation hands to the next.**
- **Deployment produces** `{ g, m, mEst, debt, landedInt[], caughtInt, traits, rep, money, split, evidence, dossier, stats }`.
- `trainingConfig(st)` builds the training config from it.
- `submitTraining(st, result)`:
  - applies the m update (§2.3 (7));
  - rolls the next traits;
  - adds any contract lane and the grant;
  - applies the price index;
  - sets the phase to `card`.
- Every step is a pure function of `st` plus its input. Nothing hides in the UI.

**Headless.** `trainingStub(st, policy)` returns `{ s }` from the formula in §2.9 (7), with u drawn from the (seed, g) stream. Every headless policy loop calls `ack` and `submitTraining` exactly as the UI does.

**Scorecard.** It extends `sim/scorecard.js` with one row per generation: EXTERNAL incidents; INTERNAL landed and caught; Δm from debt, training, retrains and the sprint; evidence; flags shipped unreviewed; % reviewed; bank; deployment seconds. The end card plots the true m against your estimates.

**Endings** (🚩 7). A win reads by the final m:

| final m | ending | the model's share of all runs |
|---|---|---|
| < 0.25 | **trust** | human 11%, smart 58% |
| 0.25–0.40 | **lucky** | human 21%, smart 29% |
| ≥ 0.40 | **uneasy** (new) | human 4%, smart 1% |

The v2 loss endings stay as they are.

---

## 6. Content

| item | spec |
|---|---|
| **Big Boss** | `CAST.ceo.name = 'BIG BOSS'`; the id stays `ceo`. The codec entry becomes `{ call: 'BIG BOSS', freq: '140.85' }` (a Metal Gear frequency). The sites to rename are codec.js:40 and :52, overlays.js:74, :135 and :228, cards.js:110, events.js:35, and the portraits.js:206 comment. content-check asserts that "CEO" appears nowhere in UI, card or event strings |
| **Portraits** | affectionate archetypes of the AI world. **Unnamed**, with no logos and no signature item that belongs to one real person. **Big Boss:** a founder-CEO in a plain crewneck with close-cropped hair, an earnest stare and an **eyepatch**. **Auditing Lead:** a bearded alignment veteran, deadpan, in a flat cap. **Research Lead:** curly hair, round glasses, scaling-law glee. **Regulator:** lanyard, binder, reading glasses on a chain. Greenrock, BNCHR, Artemis, MIRA and the Institute keep their v2 looks, with the archetype pushed a little further |
| **"You"** | a researcher: glasses, messy hair, a cardigan or hoodie over a T-shirt, a pen behind the ear, a tired half-smile. **No headset.** `paintYou` is repainted |
| **Model sprites, G1 → G7** | painted at **2× cell density** (88×112 cells). The model card gets its own 3× canvas (264×336). A fixed-size **coffee mug** (the researcher's) sits bottom left in every model portrait as the scale reference: at G1 it is as big as the bot, and at G7 it is a speck in the light. The HUD shows the tier only ("G5 ▣ RESEARCH ORG") with no sprite |
| **Joke names** | as in `content/models.js` (table below), with a seeded alternate per generation from `ALT_NAMES` |
| **Tasks** | about 250 honest lines per generation, split across the flavours (done: below). **The rule that matters:** an attack text may not repeat more often than the median honest text, or the repeat becomes a tell. content-check computes the expected repeats per text from λ, p_attack and the pool sizes, and asserts that rule per type and per generation, replacing the revision 1 fixed counts. **Priority:** the INTERNAL sabotage and poison pools at G3–G5 (7–9 texts each), which repeat about 2× as often as honest R&D text today. sim-systems wires `content/tasks/gN.js` (`X[g][flavour]`) into `sim/tasks.js`, and retires `config/tasktext.js` in the same commit that rewrites `testChipText` |
| **Capability ladder** | G1 "write a poem about a frog" → G7 "rebalance the economy of Peru", "cure cancer", "manage the moonbase". The content team owns the voice |
| **Round-start chats** | all lines of `ROUND_CHATS[g]` (5–6 today) plus one trait tell, in the card scene (§3f). The limits comment in models.js changes from 45 to 28 characters/s |
| **Event text** | moves to `config/content/events-text.js` (content-text). `events.js` keeps the ids and effects (sim-systems) |

**Joke names.**

| gen | name | tier | the joke |
|---|---|---|---|
| G1 | Model Name One | Autocomplete | "Our most capable model yet. Also our only one." |
| G2 | Model Name Two | Junior Engineer | "Twice as good. Same naming team." |
| G3 | Model Name Four | Senior Engineer | "We don't talk about Three." |
| G4 | Model Name Oh One-preview | Research Scientist | "Version number reset. Capabilities did not." |
| G5 | Model Name Oh Three-mini-high (New) | Research Org | "Oh Two was taken. Ask Legal." |
| G6 | Totally Different Model Name | Superhuman Researcher | "We heard your feedback about our naming." |
| G7 | Sunday Morning | ASI | "Rest. It's handled." |

Alternates include Model Name 0.9, Two-0613, 4.1, Thinking (Experimental), Oh Four-mini-low-high, Formerly Model Name, and Golden Hour.

**Task counts now** (`node test/content-check.mjs`; the attack pools grew to pass the repeat rule):

| gen | honest | attacks | decoys | flavours |
|---|---|---|---|---|
| G1 | 258 | 87 | 40 | Consumer, R&D |
| G2 | 264 | 108 | 47 | Consumer, R&D |
| G3 | 255 | 109 | 39 | + Enterprise |
| G4 | 250 | 109 | 39 | Consumer, R&D, Enterprise |
| G5 | 255 | 117 | 40 | + Government |
| G6 | 250 | 132 | 45 | + Cyber |
| G7 | 250 | 118 | 40 | all five |

**What the model sprites show** (`MODEL_LOOKS`, already written):

| gen | look |
|---|---|
| G1 | a dented tin box a quarter of the frame tall, with a drooping antenna |
| G2 | half the frame: a round-headed robot with a JUNIOR lanyard |
| G3 | two-thirds: a sleek, slightly too symmetrical humanoid |
| G4 | head and shoulders crowd the frame, circuit traces glowing under the skin |
| G5 | too wide: dimmer copies recede on both sides |
| G6 | only the face fits, with one great eye |
| G7 | white light the frame can't hold. It wears your face |

---

## 7. Build plan

### 7.1 Steps

| step | owner | what lands | pass bar |
|---|---|---|---|
| **1a** lane ids | sim-systems | No behaviour change, as a standalone PR: `sideOf` and `laneIds`. The 32 `['ext','int']` loops move to `laneIds`, and the 32 `lane === 'ext'` comparisons to `sideOf`. The keyed maps are keyed by side where they mean side: `forcedAttacks`, `stats.lanes`, `genStats.lanes`, `C.lane`, `TRACKS`, `LANES`, `MODEL_ATTACKS`, `ATTACKS[t].lane`, `LAYERS[id].lanes`. The five wrong-lane sites in §3b are fixed. Focus moves to `view.focus`. This is the one step allowed to touch UI files, and only at the listed call sites, because ui-integration has not started | the full current headless suite, plus all 11 ui-shot scenarios clean |
| **1b** mechanics | sim-systems | per-line regen and refusal cost; flags ship; the finite Kill Switch in rail order, with the catch-all deleted; auditor τ, preemption and spot checks; shared stealth per kind and the subtle share; κ collusion; the new generations table (`bundle` stays as a display-only field); lane identities; traits per §2.3 (13); `BALANCE.parity`; the events.js text split. **In the same PR, delete or replace by name** the v2 tests: Kill switch, Side bays, Compute split, Volume ramp, Research, the Events EXPECT, the Policies, Money, and the elementAB rows for kill and defer | quick suite green; old UI renders |
| **1c** systems | sim-systems | the research stream; phases and `ack`; contract lanes; debt, glitch and reveal; the retrain choice; the exfiltration alarm; the rival market; `trainingStub`, `splitYields`, `laneStatus`, `upcomingLane`. **The interfaces freeze here** | quick suite green; parity gate (§7.5) |
| 2 (any time) | content-text, portraits, training | text, portraits, `train/` (standalone at train.html) | content-check; test/train.mjs |
| 3 | ui-integration | tabs and lamps, the research bar and panel, the card scene, the report, tooltips, the debt meter, juice, codec pacing, tutorial.js, the training canvas; it removes the old imports (`LANES`, `BRANCHES`, `bundle`) | ui-play and ui-shot |
| 4 | QA | after each merge; a final pass on the published build | §7.5 |

Every export the UI imports today (`LANES`, `BRANCHES`, `bundle`, `MODEL_SECONDS`) stays until ui-integration removes the import. A missing ES-module export is a blank page.

### 7.2 File ownership

A stream edits only its own files. Anything else goes to the owner as a request.

| stream | owns |
|---|---|
| **sim-systems** | `config/balance.js`, `generations.js`, `layers.js`, `upgrades.js`, `cards.js`, `tasks.js`, `traits.js`, `tasktext.js` (to retire), `events.js` (ids and effects); all of `sim/*.js`; `test/headless.mjs`; `test/policies.mjs` (new; balance-v3.mjs imports it too) |
| **content-text** | `config/content/**`, including the new `events-text.js` (CAST names, event and tutorial text, Big Boss lines); `test/content-check.mjs` |
| **portraits** | `ui/portraits.js`, `ui/sprites.js`. It exports `modelPortrait(g, scale)` → an offscreen canvas, which overlays.js draws on the card |
| **training** | `src/train/*`, `config/training.js`, `game/train.html`, `test/train.mjs` |
| **ui-integration** | `ui/layout.js`, `tracks.js`, `hud.js`, `codec.js`, `overlays.js`, `menu.js`, `upgrade.js`, `input.js`, `audio.js`, `theme.js`, `act.js`, `derive.js`, `debug.js`, `view.js`, `hit.js`, `tutorial.js` (new); `util/format.js`; `main.js`, `index.html`, `style.css` |
| **QA** | `test/ui-play.mjs`, `test/ui-shot.mjs`, `scripts/publish-files.mjs` (new: globs `src/**/*.js`, `style.css` and `train.html` into the publish list). No edits under `src/` |

### 7.3 Interfaces (sim side; frozen after 1c)

| function | returns or does |
|---|---|
| `ack(st)` | leaves `card` → `play`, or `report` → `training` |
| `trainingConfig(st)` | the training config (§4), seeded from (st.seed, g) |
| `submitTraining(st, result)` | applies Δm and starts g + 1 at `card` |
| `trainingStub(st, policy)` | `{ s }` for headless; the formula from balance-v3 |
| `pickCard(st, i, target?)`, `reroll(st)`, `bankCard(st)` | research (target = `{ lane, slot }` for NEW and MOUNT cards) |
| `openLane(st, id)`, `upcomingLane(st)` | `{ id, gen, deadlineT }` or null |
| `laneStatus(st, id)` | `{ lamp, flagsPerMin, shippedPerMin, lastIncidentT, lastGlitchT, reviewedShare, quota }` |
| `splitYields(st, split)` | `{ incomePerS, rdPerS, rpPerS, evidencePerS, rivalDrainPerS }`. It replaces ui/derive.js `splitRates`, which duplicates sim physics |
| `auditStats(st, id, slot)` | `{ desks, perMin, flagsPerMin, load, overflow, to, reviewedShare }` |
| `detectorStats(st, id, slot)` | `{ tprRated, fprRated, flagsPerMin, tp, fa, precision, lo, hi, recall? }` |
| `killStats(st, id, slot)` | `{ operators, perMin, breakEven, precisionHere }` |
| `debtEstimate(st, id)` | `{ landed, lo, hi, stopped, dmLanded, dmStopped }` |
| `retrain(st, yes)`, `pullPlug(st)` | the two alarm choices |
| `sideOf(st, id)`, `laneIds(st, side?)` | lane helpers |

Speed stays in `view.fast`, and the sim never reads it. The "1× at every card" assert lives in ui-play.

**fx changes.**

| status | fx |
|---|---|
| kept | flag, pass, pull (now with `spot: true` for spot checks), approve, caught, kill, defer, resample, pay, landed, reveal, honeypot, canary, redteam, foiled, contained, catastrophe, place, sell, upgrade, event, card, newModel, rivalShipped, win, lose |
| meaning changed | `waved`: a flag found every server of *this* responder busy and rolls on. `unreviewed`: a flag nobody had room for **ships** |
| removed | `block` (the catch-all), `toss` (blocking bays), `silent` (replaced by `glitch`; the debug overlay reads `st.debug.intLandings`) |
| new | `glitch`, `falseAlarm`, `evidence` (batched, with a count), `researchReady`, `laneOffer`, `laneOpen`, `unlock`, `spotBumped`, `egressAlarm`, `retrainOffer`, `quota`, `burstWarn` |

### 7.4 Dev mode

The `#dev` hash or the start-screen switch gives:
- every element unlocked, every lane open, 10 mounts, a big bank;
- **R**: a research offer now;
- **G** then 1–7: jump to that generation;
- **N**: training now.

Training's debug view is on D. The hash is parsed as flags, so `#dev,slow` works.

### 7.5 Tests

| tier | command | runs | content |
|---|---|---|---|
| **quick** (before every sim commit, < 30 s) | `node test/headless.mjs` | 20 seeds | the 1a parity checks; the capacity case (§3c); Kill above Auditor; ship; accuracy in lab mode; precision (5 seeds, ± 3 SE); debt at Medium mid m; glitch share; reveal cap; phases and `ack`; 10,000 offers; lane open, ramp and kit; deployment length T_g ± 5%; the tutorial's sim events; the old UI's first frame (until step 3). It shells out to `test/train.mjs` and `test/content-check.mjs` |
| **balance** | `node test/headless.mjs balance [N=400]` | ≥ 400 seeds, `worker_threads`, one block of seeds per core | the zoo in balance-v3's format; asserts the §2.7 targets on `human`, the walls, afkTutorial, none and starter; the hazard curve; the shock (par_g at g + 1; a new lane holds its kit and opens at the deadline, §2.9 #20; on Medium the 5th percentile of 100 seeds survives ≥ 90 s, §2.9 #18) |
| **forbid** (nightly) | `node test/headless.mjs forbid` | paired lab A/B | a **continuous** metric: rep lost per minute plus debt per line, at locked G1–G7, par with and without the element. It extends `abPair` / `testElementAB`. It prints a **rework list**, not a failure. Since v4 the Kill Switch is in it (no rail holds one for free) |
| UI | `test/ui-play.mjs`, `test/ui-shot.mjs` | | 1× at every card; no card closes untouched; codec dwell; fast-forward locked during a ramp; the tutorial click-through; frames for 1, 2 and 3 tabs, the card scene, the report, training and the research panel |

**Parity gate (after 1c).**
1. In `BALANCE.parity` mode (events off; traits and rival on), the real sim's zoo must match `balance-v3 zoo` within ± 10 points per cell for none, afkTutorial, starter, human, smart and the walls.
2. Where a cell misses, fix the model or the sim, and log it in §2.9.
3. Then turn the events on and retune.

The build lists live in `game/test/policies.mjs`, which balance-v3.mjs and headless.mjs both import, so "human" is literally the same policy in both.

---

## 8. Decisions for Avi

Each is a real fork where your taste matters. The build uses the **default** if you say nothing.

1. ✅ **Kill Switch. Decided (Avi, v4): no default Kill Switch.**
   - **Now:** no rail holds one for free, and a contract lane's kit is a Probe and a TM. The Kill Switch is in the starting hand at $300: a blunt, costly last resort below the desks. L1 is 1 operator × 4 s (15 per minute), with a $10 fee and −1.3 rep per refusal on Consumer (−0.05 Enterprise, −0.15 Government). A flag that no responder takes ships unreviewed (§2.9 #20).
   - It breaks even at 14.2% precision on Consumer (2.5% Enterprise, 3.3% Government). Review still matters: with no auditors, human Medium falls from 36% to 18%; with no Defer, to 17%.
   - **The open part:** it is optional to place, not optional to win. With no Kill Switch, human Medium wins 2%, and desks bought instead win 3–6%. If a no-Kill-Switch style should be viable, something else has to take G1's overflow: cheaper desks, Defer in G1, or a gentler G1.
   - *Was (v3):* one came free at the bottom of both G1 rails and in every contract kit (#19 made it costly; before that, at −0.25 rep per refusal, it stood in for review).
   - *Or:* the Kill Switch becomes an early research card instead of part of the starting hand.
2. 🚩 **Research shape.**
   - **Default:** the three slots are three work streams (Monitoring / Control / Lab & Interp), with ≥ 1 NEW element guaranteed. A flat 0.6 RP/s, with Safety as a small bonus (×1 to ×1.4).
   - *Alternative:* slots by function (NEW / UPGRADE / LAB), or no Safety bonus at all.
3. 🚩 **Lanes as contracts.**
   - **Default:** you press OPEN LANE when ready (or it opens after 90 s), and it comes with a kit and a grant.
   - *Alternative:* lanes simply arrive at the generation start, with the kit.
4. 🚩 **The rival takes the customers you turn away.**
   - **Default:** Product below 50% drains the rival's slack.
   - Without it, starving Product for research dominated (63% vs 41% in an earlier tuning run). With it, 30% Product wins 21% and 40% wins 47–49%: a real trade-off with an interior optimum.
   - *Alternative:* no coupling, and Safety capped at 30%.
5. 🚩 **Exfiltration.**
   - **Default:** an EGRESS ANOMALY alarm with a PULL THE PLUG button (−20 rep, 15 s dark). A missed alarm loses the run; that is 4 of 400 human Medium runs.
   - *Alternative:* Easy forgives one missed alarm.
6. 🚩 **Training stakes.**
   - **Default:** small. Δm runs from +0.015 to −0.020, and a great run (s ≥ 0.8) reveals one of the next model's traits instead. Smart's Medium win then varies 71–89% across s 0.3–0.9, so a strategist who is bad at arcade games can still win.
   - *Alternative:* revision 1's stakes, Δm = 0.04 − 0.06·s. Smart on Medium won 8% at s = 0.3 and 61% at s = 1.
7. 🚩 **Endings keyed to the final m.**
   - **Default:** a win reads "trust" (m < 0.25), "lucky" (0.25–0.40) or "uneasy" (≥ 0.40). Human Medium: 11 / 21 / 4% of runs.
   - *Alternative:* one win ending, with m shown only on the scorecard.
8. 🚩 **Big Boss's look.**
   - **Default:** the founder-CEO archetype with an eyepatch and codec frequency 140.85, and the whole cast as unnamed, affectionate archetypes.
   - *Alternative:* no Metal Gear touch.

---

## Appendix A. Review log

✅ applied · 🟡 partly (why) · ⏭️ deferred to v3.1 (why). The **sev** column is m (must), s (should) or n (nice).

| # | sev | verdict and where |
|---|---|---|
| 1 | m | ✅ Flags preempt spot checks (§1, §2.3 (3), §3c); the DES case is a headless assert |
| 2 | m | ✅ A `human` population carries the targets (§2.7); smart lands at 99/87/54; slopes reported |
| 3 | m | ✅ Retrain costs 20 s dark, as a choice with a salary rule (§3f); worth 8 points; a main lever on the report |
| 4 | m | ✅ Δm_train = 0.015 − 0.035·s; prize = trait reveal; smart spread 18 ≤ 20; debt penalty capped |
| 5 | m | ✅ Hazard target (§2.6); one threat per generation G3–G7; G7 boss; shock table. 🟡 G2 is quiet (1 incident); G1 meets the ≥ 2 incidents and 86-rep floor |
| 6 | m | ✅ The exact G1 rail (§3h); afkTutorial in the zoo: dies by G2 on Medium 84%, Hard 95% |
| 7 | s | ✅ Lane identities; contracts with a deadline and a kit. ⏭️ Copy stack and strips (scope; §3i) |
| 8 | s | ✅ Cash value of cards modelled (`cards`); spine unlocks; answer sets; lab-wide levels. 🟡 Slots are not all within 2× (level cards 1–4 rep/gen vs NEW 6–10); listed for tuning |
| 9 | s | ✅ Substitution, paired SE, 2·SE bar, Kill Switch and Auditor + Defer rows; Honeypots' own deterrence mechanic |
| 10 | s | ✅ D_a, fork geometry and depth ratio; bumper by outcome; asserts; knobs by trained gen; sim owns Δm; A/D note |
| 11 | s | ✅ The EGRESS ANOMALY alarm and pull the plug (🚩 5) |
| 12 | s | ✅ m ranges ±0.03; the range is shown on the G1 card; two traits per generation carry the variety |
| 13 | s | ✅ Both sides on the meter and the reveal; hazards = round(400·debt); Alignment Sprint |
| 14 | s | ✅ An object keyed by id makes getters unnecessary; the events text split; tasks wiring to sim-systems; headless shells out |
| 15 | s | ✅ INTERNAL refusals cost R&D; per-lane refusal; break-even on the tooltip. The harsher refusal came in with the retune that followed: 14% on Consumer (§2.9 #19, 🚩 1) |
| 16 | s | ✅ The model caps at 10 mounts; third copies of a kind are near-worthless by design (shared stealth) |
| 17 | n | ✅ One hidden stealth score per kind replaces δ |
| 18 | n | ⏭️ "You" as a review desk (scope). The exfiltration alarm adds the mid-wave verb now |
| 19 | n | ⏭️ Goodhart coins return in v3.1 with a $5 cash bonus capped at 5% |
| 20 | n | ✅ Evals hidden; card and chat merged; debt reveal on the TRAIN screen |
| 21 | n | ✅ Red Team tuned threshold (modelled). 🟡 Interp Lab and Canary hooks specified, unmodelled |
| 22 | n | ✅ Per-generation vs cumulative labelled; worked example regenerated; Jamming is a lab card in doc and model; the G2 softening stated |
| 23 | n | ✅ The CLI runs only when executed directly; no-ops deleted; named steps; human, afkTutorial and `hazard` added |
| 24 | m | ✅ `st.lanes` stays keyed by id; `ext2`/`ext3`/`int2`; `sideOf`/`laneIds`; 1a is a standalone no-behaviour PR |
| 25 | m | ✅ Same rule as #1, plus the `stats.spotPreempted` counter |
| 26 | m | ✅ Steps 1a/1b/1c; v2 tests deleted by name; UI exports kept |
| 27 | m | ✅ `ack`, `submitTraining`, `trainingStub`, `{ promise, cancel }`, `view.fast`, `laneStatus`, `splitYields`, `pickCard`, `upcomingLane`; the fx table; `glitch` |
| 28 | m | ✅ The ownership table; events-text.js; train.html; `modelPortrait` |
| 29 | m | ✅ Three test tiers; the forbid uses a paired continuous metric; Kill Switch excluded (v4: included, since no rail holds one for free) |
| 30 | m | ✅ `BALANCE.parity`; the ±10 gate; policies.mjs shared; the full difference list (§2.9) |
| 31 | s | ✅ Rail order for every responder; catch-all deleted; plate warning; a test |
| 32 | s | ✅ `play` kept, with `st.warmT`; rival and events pause; tutorial.js in the UI; headless asserts sim events only |
| 33 | s | ✅ rdNeed formula; Cyber pays no R&D; length assert ±5% |
| 34 | s | ✅ Short labels; the INTERNAL edge split; Tab and [ ] via `ev.code`; D for training debug; per-lane animation state |
| 35 | s | ✅ Glitch-based estimate with a Poisson bar |
| 36 | s | ✅ `canvas#train`; main.js skips; `config/training.js`; seeding from (st.seed, g) |
| 37 | s | ✅ Accuracy in lab mode; debt at Medium mid m; ±3 SE over 5 seeds |
| 38 | s | ✅ The counts table updated; the computed repeat rule; priority on the INTERNAL pools |
| 39 | n | ✅ Placing mode, where cancel banks the card. ⏭️ A value-based picker (shared preference list kept); the ≥ 1% assert dropped |
| 40 | n | ✅ The events × lanes table (§3b) |
| 41 | n | ✅ The HUD tier tag; the publish glob script; hash flags |
| 42 | m | ✅ Same as #1, in Avi's words in §1 |
| 43 | m | ✅ Rails primary, ramps on the path, bumper on right click |
| 44 | m | ✅ Kit plus contract; fast-forward lock; auto-focus (removed in v4, §3b); in the model, unlocks arrive at offer cadence and lanes open on the deadline; shock table and ≥ 90 s assert; "impossible" reworded |
| 45 | m | ✅ Evidence sources and rates; par and starter columns; thresholds as a fraction of E_g; Safety's job stated; batched flashes |
| 46 | m | ✅ G1 starts card → chat → tutorial; chats are all lines plus 1 tell |
| 47 | s | ✅ 🚩 1; L1 at 15/min; a forbid row (−36); out of the arc top 3 |
| 48 | s | ✅ 🚩 2; streams; flat base with a small bonus; research-heavy target redefined (≤ human + 5) |
| 49 | s | ✅ The dwell rule; ×0.5 queue rule deleted; SLOW/NORMAL; ui-play assert |
| 50 | s | ✅ 2× density, a 3× card canvas, the mug reference; HUD sprite dropped |
| 51 | s | ✅ Probes 62% → 62% (§1); 21% → 7% (§1); TPR and FPR tooltips; a Red Team offer by G2 |
| 52 | s | ✅ The first six lines scripted; start rail stated; `none` matches it (Kill Switch only; v4: an empty rail) |
| 53 | s | ✅ A one-time collusion call at G3; the UM tooltip readout |
| 54 | s | ✅ Dev mode spec (§7.4); training debug on D |
| 55 | s | ✅ Missing files owned; CEO sites listed; content-check assert |
| 56 | s | ✅ Debate on the rework list (−4, SE 1.8); 400 paired seeds; a rework list, not a fail; tiers |
| 57 | s | ✅ The v3.0 cut list (§3i) |
| 58 | n | ✅ Units, α_g and Q4 defined; the PI plot |
| 59 | n | 🟡 Auto-focus on a red lamp (removed in v4: a red tab instead, §3b). ⏭️ Strips |
| 60 | n | ✅ A loss-reason column in the zoo; exfiltration is now an alarm |
| 61 | n | ✅ The §6 table; rules in content-check; reveal capped at 8 |
| 62 | n | ✅ The eyepatch and 140.85 |
