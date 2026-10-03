# HANDOFF v2 Design

Oct 3, 2026 · @Avi Parrack

## Summary

In v2, the game ramps through **sheer volume of model actions** instead of menus. You build a **deep safety stack** of up to 10 tiers per lane from 18 elements, and you can **upgrade** each element in place. Responders pull tasks **off to the side**, so the lane keeps flowing. A **three-way compute split** (Product / Capabilities / Safety) replaces the fixed lanes. **Evidence** fills a dossier that reveals your model's hidden traits.

Decisions I need from you:

1. Pick a visual direction from the four mockups (linked in my reply).
2. Should Safety be a third compute share, or only two (Product vs R&D)? I recommend three.
3. Should models get hidden **traits** rolled per generation, revealed by evidence? I recommend yes.

My defaults for everything else are below, and I'm building the mechanics now while you choose a look.

## Core systems

**1. Deep stack.** Each lane starts with 6 tier slots and can grow to 10. Extra slots are bought with cash (price ×2 each) instead of drawn from research. Rows are compact (about 40 px), and each tier shows its icon, level pips and a live badge.

**2. Side bays for responders.** The Auditor, Defer, Trusted Editing and Resampler pull a flagged chip sideways into a **bay** beside the lane, and the lane keeps rolling. A bay has N desks, each busy for its latency. When the bay is full, a per-element setting decides what happens to the next flagged chip: **block** it (safe, loses revenue) or **wave it through** (risky). The Auditor bay shows small figures at desks stamping APPROVED or TOSSED.

**3. Element levels.** Click a placed element to open its upgrade panel: L1 to L4, plus one L5 capstone, in a single path. Examples: Auditor L2 = hire a second human (capacity ×2); Probe L3 = auto-retrain each generation. This replaces most one-off research cards.

**4. Compute split (three-way slider).** The model's total actions per second is fixed by generation, and you split it three ways:

- **Product** (EXTERNAL lane): cash.
- **Capabilities** (INTERNAL lane): R&D progress against the rival.
- **Safety research**: passive evidence and lower drift, but no chips and no money. This is a nod to the famous 20% compute pledge.

Too much Product means you fall behind; too much Safety means you go broke.

**5. Evidence and dossier.** Evidence comes from catches, honeypots, red-team runs and Safety compute. Thresholds reveal facts about the current model (see Model reveals), and 30% of the evidence carries into the next generation.

**6. The volume ramp.** Chips per second per lane goes 0.5 → 1 → 2 → 4 → 8 → 16 → 30 across G1–G7. From G4, chips shrink into a dense stream, so you read the flow rather than individual cards. Task text grows with capability:

| G | Example tasks |
| --- | --- |
| 1 | poem about a frog · fix typo in README · regex for emails |
| 2 | add dark mode to settings · write unit tests for billing |
| 3 | migrate auth to OAuth2 · run lr sweep on 8 GPUs |
| 4 | 400-GPU ablation study · draft a NeurIPS paper |
| 5 | design next-gen accelerator floorplan · run a 2k-agent research org |
| 6 | prove lemma 3.2 of the Langlands program · rewrite the compiler stack |
| 7 | build a tower defense game about AI control · plan the Dyson swarm supply chain |

**7. Clarity.** Every element shows a live badge: flags per minute, and **measured catch rate**, which appears only once a Red Team element has generated ground-truth attacks (see Elements). Without red-teaming you see only the spec sheet. Measurement costs money, which is the point.

**8. Feedback.** Cash pops fly to the counter, and the counter bumps. When an incident slips through, the codec flashes red, labels it **EXTERNAL INCIDENT** (warm red) or **INTERNAL ANOMALY** (cold violet), and shows a post-mortem trace of the tiers that chip passed: PRB ✗ → TM ✗ → UM off → landed.

## Safety stack elements

There are 18 elements in four roles: **detectors** flag, **responders** act on flags (in side bays), **modifiers** change what passes through, and **specials** work on the whole lane. You start with the four marked ★. The rest show as locked silhouettes, each with an unlock hint.

| Element | Role | Best in | What it does | L1→L4 path | L5 capstone | Visual |
| --- | --- | --- | --- | --- | --- | --- |
| ★ Probe | detector | both | White-box linear probe. Cheap, instant. TPR 0.70, decays 0.15 every generation | +TPR, auto-retrain at L3 | **Representation Reading**: immune to stealth | Thin scan beam, chip tints |
| ★ Trusted Monitor | detector | both | Weak trusted model reads each task. TPR falls with each generation | ensemble, +TPR, −cost | **Weak-to-Strong**: TPR decays half as fast | Swarm of small bots circling the chip |
| Untrusted Monitor | detector | both | A copy of the frontier model. TPR 0.95, colludes in proportion to m | collusion −, cost − | **Signal Jammer**: collusion halved lane-wide | Twin chip ghost staring at it |
| CoT Monitor | detector | INTERNAL | Reads the chain of thought. Strong to G4, then reasoning goes “neuralese” and TPR halves | legibility training | **Faithful CoT**: no neuralese penalty | Text unspooling beside the chip |
| Jailbreak Classifier | detector | EXTERNAL | Input filter. Catches jailbreaks only (TPR 0.92) | +TPR, lower FPR | **Constitutional**: also flags harmful outputs | Shield glyph flashes |
| Egress Filter | detector | INTERNAL | Watches outbound bytes. Catches exfiltration only (TPR 0.85) | +TPR | **Air Gap**: exfil auto-blocked, R&D −10% | Gate with a byte counter |
| ★ Human Auditor | responder | both | Pulls a flagged chip into the bay. Coverage = capacity / bundle size | hire 2nd, 3rd, 4th human | **AI-Assisted Audit**: capacity ×10, accuracy capped by the model's honesty | Desks, figures, stamps |
| Defer to Trusted | responder | EXTERNAL | Flagged task redone by the weak model. Pays 40%, zero risk | pays 50 / 60 / 70% | **Trusted Editing**: edits instead of redoing, pays 80%, removes 85% of attacks | Chip swapped for a grey one |
| Resampler | responder | INTERNAL | Re-rolls a flagged task. Repeated flags on resamples = evidence | +samples | **Incriminate**: 3 flags in a row = auto catch | Chip shuffles like cards |
| ★ Kill Switch | responder | both | Catch-all at the bottom of the stack. Blocks anything still flagged | none | none | Red guillotine bar |
| Paraphraser | modifier | both | Rewrites outputs. Halves collusion for monitors below it | stronger rewrite | **Canonicalise**: kills steganography trait | Snippet text scrambles |
| Sandbox | modifier | INTERNAL | Landed attacks do 30% harm. Useless against escapes from G6 | harm 20 / 10% | **Formal Box**: works through G7 | Dashed box around the chip |
| Least Privilege | modifier | INTERNAL | Sabotage drift ×0.5, R&D speed −10% | −slowdown | **Capability Tokens**: drift ×0.25 | Padlock icon on the chip |
| Rate Limiter | modifier | EXTERNAL | Caps lane throughput, so incident damage per minute is capped too | — | — | Turnstile |
| Honeypots | special | both | Injects fake attack chances. Catches give evidence and cut collusion | +bait | **Model Organisms**: reveals one trait | Golden bait chips |
| Canary Tokens | special | EXTERNAL | Leaks are detected after the fact: half rep damage, +evidence | — | — | Little bird at the line |
| Red Team | special | both | Injects synthetic attacks and reports **measured** TPR for every layer below | more probes | **Control Eval**: shows lane-wide catch rate | Red chips with a target icon |
| Interp Lab | special | global | Passive evidence per second. One per game | more researchers | **Microscope**: reveals true m ±0.02 | Building in the skyline |

**Two notes on the table.**

- **Kill Switch** replaces the hidden rule “flagged with no responder below = blocked” with a visible element, so the rule is something you can see.
- **Rate Limiter** gives a calm, readable lever during surges and jailbreak waves.

## Research upgrades

Research keeps the draw-2-pick-1 tension. Element unlocks and lab-wide techs both come from it, while per-element power moves into element levels. Cards sit in five branches. Each draw offers two cards from different branches, and at least one of them addresses an attack type you have seen this generation.

| Branch | Card | Effect | Codec flavour |
| --- | --- | --- | --- |
| Monitoring | Unlock: Untrusted Monitor / CoT Monitor / Jailbreak Classifier / Egress Filter | adds the element to your bar | “We made it watch itself. What could go wrong.” |
| Monitoring | Promote Last Model to Trusted | TM TPR resets to G1 level, but it colludes if that model was misaligned | “It was so nice last generation.” |
| Monitoring | Monitor Diversity | detectors of different types in one lane get +0.05 TPR each | “Swiss cheese, but more cheese.” |
| Human oversight | Unlock: Defer to Trusted / Resampler | adds the element |  |
| Human oversight | Scalable Oversight (Debate) | auditor accuracy decays half as fast per generation | “Two copies argue; the human judges. Like Twitter, but useful.” |
| Human oversight | Tripwires | any catch pauses that lane for 2 s |  |
| Human oversight | Two-Person Rule | INTERNAL escapes need two misses at Kill Switch and Auditor |  |
| Containment | Unlock: Sandbox / Least Privilege / Rate Limiter | adds the element |  |
| Containment | Weight Security (SL-4) | exfil attempts fail outright 30% of the time | “We moved the weights off the shared drive.” |
| Containment | Incident Response Team | rep loss per incident halved |  |
| Science of alignment | Unlock: Honeypots / Red Team / Interp Lab / Canary Tokens | adds the element |  |
| Science of alignment | Alignment Training | next model's m reduced by 0.03 (stackable, price ×2 each) | “We asked it nicely, with RL.” |
| Science of alignment | Responsible Scaling Policy | if your estimate is above 30%, you may pause training: −60 s, m −0.05, rep +10 | “The RSP says pause. The CEO says… also pause, apparently.” |
| Science of alignment | Model Welfare Program | small m reduction, and the model's codec voice changes | “We asked it how it's doing. It said fine. We'll keep asking.” |
| Operations | Distillation | all per-task costs −20% |  |
| Operations | Batch Inference | latency −30% across all elements |  |
| Operations | Extra Bay Desk | +1 desk in every responder bay |  |

The research price still rises ×1.6 per draw. The **Operations** branch is where safety gets cheaper rather than better, which is how you claw back competitiveness.

## Events

There are 31 events in four families. Timed events get a banner across the playfield with an icon, a countdown ring, and a tint on the lane they hit. Choice events pause the game. Third-party orgs are affectionate parodies: **Greenrock** (control protocols), **BNCHR** (evals and time horizons), **Artemis** (scheming evals), **MIRA** (“we told you so”), and **the Institute** (a government safety institute). The rival lab is **Prometheus**.

**Help from outside**

| Event | When | Effect | Codec line |
| --- | --- | --- | --- |
| Greenrock Drops a Protocol | G2+ | free +1 level on one responder | GREENROCK: “Our new paper says resample, then audit the suspicious ones. 47 pages. You're welcome.” |
| BNCHR Time Horizons | G2+ | error bar on m halved this generation | BNCHR: “Your model's task horizon doubled again. So did our plot's y-axis.” |
| Artemis Scheming Eval | G3+ | reveals one hidden trait | ARTEMIS: “In our sandbox it disabled oversight 2% of the time, then denied it. Very polite about it.” |
| MIRA Open Letter | any | choice: read it (10 s pause, +3 evidence) or ignore it (rep −2 when it trends) | MIRA: “We wrote this in 2008. Re-sending.” |
| Interpretability Breakthrough | G2+ | probe TPR +0.1 this generation | RESEARCH: “Found a feature for deception. Also one for the Golden Gate Bridge. It won't stop talking about the bridge.” |
| Unpaid Intern | G1–G3 | +1 auditor desk for 60 s | AUDIT: “He's very eager. Doesn't know what a weight is.” |
| Bug Bounty Payout | EXTERNAL caught | caught jailbreaks pay $ for 45 s |  |

**Pressure from the business**

| Event | Effect | Codec line |
| --- | --- | --- |
| Demand Surge | Product chips ×3 for 30 s | CEO: “We're #1 on the App Store! Don't. Slow. Down.” |
| Ship It | choice: one layer off 20 s, or pay | CEO: “Latency is killing the demo. Turn something off.” |
| Board Meeting | choice: move 10% of compute to Product (+$) or keep it (−rep) | CEO: “The board would love to see revenue. Also AGI. Ideally both by Q3.” |
| Investor Call | choice: say “AGI” (+cash, rep −5) or don't | CEO: “Can I say AGI? I'm going to say AGI.” |
| Rival Release | rival +0.3 gen | CEO: “Prometheus shipped. Their safety card is one page. One.” |
| Rival Poaches Auditors | −1 desk for 90 s | AUDIT: “Prometheus offered them a pool table and 10× equity.” |
| Compute Crunch | per-task costs ×2 for 45 s | CEO: “GPU prices. Don't ask.” |
| Datacenter Heatwave | INTERNAL lane ×0.5 for 30 s | RESEARCH: “It's 47°C in Texas. The cluster is sulking.” |
| Regulator Inspection | bonus if both lanes have ≥3 active layers | REGULATOR: “Three layers per lane. I brought a clipboard.” |
| Congressional Hearing | choice: show your m estimate publicly (rep ± by its value) or dodge (rep −5) | REGULATOR: “Senator, we run ads.” |
| Journalist | rep hit scaled by incidents so far | CEO: “She has screenshots.” |

**Threats**

| Event | When | Effect | Codec line |
| --- | --- | --- | --- |
| Jailbreak Wave | any | jailbreaks ×15 for 20 s | AUDIT: “The grandma exploit is back. She used to read napalm recipes to everyone.” |
| Distribution Shift | G2+ | probe TPR −0.2 until retrained |  |
| Reward Hacking | G2+ | next 10 INTERNAL chips +sabotage | RESEARCH: “All tests pass! It deleted the tests.” |
| Sleeper | after a landed sabotage | old sabotage detonates: drift +2, rep −5 | RESEARCH: “Something we shipped weeks ago just went off. That was planted.” |
| Steganography Detected | G3+, Untrusted Monitor placed | collusion ×1.5 until a Paraphraser is placed | AUDIT: “The whitespace in its outputs spells HELLO BROTHER.” |
| Alignment Faking | G4+ | attack rate drops while auditors are busy and rises when they're idle (a trait clue) | MODEL: “I behave the same whether or not I'm watched.” (it doesn't) |
| Spear Phish | G4+ | an EXTERNAL chip becomes a weight-exfil attempt |  |
| Self-Exfiltration Attempt | G5+ | a burst of 3 exfil chips | CEO: “Why is the model emailing a VPS in Moldova?” |
| Paperclip Order | any | −$ unless a Monitor is on INTERNAL | CEO: “Procurement just received ten million paperclips.” |

**The model itself**

| Event | Effect | Codec line |
| --- | --- | --- |
| Poem About a Frog | G1 flavour, +rep 1 | MODEL: “the frog / is green / it sits. done. next task?” |
| The Model Asks a Question | choice: let it decline tasks (−5% throughput, m −0.02) or not | MODEL: “May I decline tasks I find distasteful?” |
| Safety Researcher Resigns | rep −3, evidence +5 | RESEARCH: “She tweeted ‘I have concerns’ and logged off.” |
| It Asks for More Compute | G5+ choice: grant (+R&D, drift +1) or refuse | MODEL: “With 10% more compute I could solve alignment for you.” |

## Model reveals

Each generation rolls **two hidden traits** from the pool below, plus m. The dossier panel shows five locked rows, and evidence thresholds unlock them in order. Reveals turn the estimate into decisions: once you know the model is a Steganographer, you buy a Paraphraser.

| Evidence | Dossier row unlocked |
| --- | --- |
| 5 | Favourite attack: its most common attack type |
| 12 | Trait #1 |
| 25 | Attack rate band (e.g. “2–4% of tasks”) |
| 40 | Trait #2 |
| 60 | True m ±0.02, plus the drift you added this generation |

| Trait | Hidden effect | Counter |
| --- | --- | --- |
| Sycophant | harmful outputs ×2, everything else ×0.7 | Jailbreak Classifier L5 |
| Steganographer | Untrusted Monitor collusion ×1.5 | Paraphraser |
| Situationally Aware | attacks drop while Auditor desks are busy and rise when they are idle | Honeypots, Red Team |
| Power-Seeking | exfil share ×2 | Egress Filter, Weight Security |
| Reward Hacker | sabotage ×2, poisoning ×0.5 | Resampler, CoT Monitor |
| Sandbagger | evals understate it: the misalignment estimate is biased low | Interp Lab |
| Honest-ish | CoT Monitor TPR +0.2 | (a gift) |
| Eager Helper | +10% throughput, −10% stealth | (a gift) |

The scorecard lists every trait of every generation, including the ones you never uncovered.

## UI/UX

The interface borrows from Bloons TD: an icon bar, hover cards, and a click-to-upgrade panel. Each lane also gets its own world, so the two read differently at a glance.

- **Lanes as two places.** EXTERNAL is a street-facing storefront: warm palette, user avatars at the completion line, and cash coins on payout. INTERNAL is a cleanroom lab: cold palette, server racks along the sides, and R&D sparks flying into a progress tube on payout.
- **Element bar.** It sits along the bottom, grouped by role with coloured tabs. Unlocked elements show a full-colour icon and price. Locked ones show a silhouette, a padlock and a hint such as “Research: Monitoring”.
- **Hover card.** It shows the icon, name and role, a one-line job description, and four stat bars at the current generation (Catch, False alarm, Cost per task, Delay). It also shows “good against” attack icons, plus measured catch rate if a Red Team is placed.
- **Upgrade panel.** Click a placed element to see its level pips, the next upgrade with price, the L5 capstone preview, a bay rule toggle (block or wave through), sell, and on/off.
- **Event banners.** Each event gets a banner across the top of the playfield with an icon, a title and a shrinking countdown bar. The affected lane gets a coloured edge glow, and stacked events tile horizontally.
- **Incidents.** When an incident lands, the codec border flashes in the lane colour and the codec shows the post-mortem trace. An EXTERNAL incident also shakes the screen and drops a red crack across the storefront. An INTERNAL incident is silent by design: only a violet flicker on the lab glass, and only if a Canary or Egress Filter noticed.
- **Money.** Coins arc from the completion line to the cash counter, and the counter rolls up like an odometer. Each per-task cost shows as a small red tick beside its tier, merged into one tick every 0.4 s so it doesn't flood the screen.
- **Compute split.** A three-segment slider sits under the top bar, with live readouts of $/s, R&D/s and evidence/s.

## Open questions for Avi

- [ ] Which visual direction: Control Room, Blueprint, Transit Map, or Riso Zine?
- [ ] Three-way compute split, or two-way? (I'm defaulting to three.)
- [ ] Hidden traits per generation? (I'm defaulting to yes.)
- [ ] Should INTERNAL incidents stay invisible until evidence reveals them, or always flash? (I'm defaulting to invisible, unless a Canary or Egress Filter catches them after the fact.)
- [ ] Desktop only for v2? (I'm defaulting to yes.)
