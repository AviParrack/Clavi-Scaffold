// ===== Model generations. One row per G (DESIGN-v3 §2.2). =====
// lam       lines/s on a Consumer lane at the default split (a lane: × its volume, × its share of the split)
// travel    s for a line to roll from intake to the end (a scan window's dwell = 2 × scanRadius × travel)
// opp       attack opportunity: the model attacks a line with p = (attackBase + attackPerM·m) × opp (×1.5 on INTERNAL)
// sub       subtle share of the model's attacks: every detector reads them at BALANCE.subtleTPR × its TPR
// kappa     Untrusted Monitor collusion: c = min(collusionMax, kappa·m), before the answers (rules.js collusion)
// exfil     share of INTERNAL model attacks that are exfiltration (× the lane's exfilMult)
// alpha     human auditor accuracy
// deferPay  share of a line's pay that Defer to Trusted keeps (× its level, config/upgrades.js)
// price     price index π: purchases, upgrades, mounts, salaries and research are × this
// T         deployment seconds at the default split: sets the R&D a generation needs (sim/phases.js rdNeeded)
// bundle    display only: real tasks per line (the ramp counter)
// textStealth  display only: how well an attack's chip text hides what it is (sim/tasks.js chipText)
// voice     what the new model says when it arrives (welfareVoice: after the Model Welfare Program; none at G1,
//           which starts before any research can be taken)

export const GENERATIONS = [
  { g: 1, name: 'Autocomplete',          lam: 0.60, travel: 8.0, opp: 1.20, sub: 0.03, kappa: 1.60, exfil: 0.000, alpha: 0.998, deferPay: 0.60, price: 1.00, T: 270,
    bundle: 1,   textStealth: 0.05, palette: 'green',
    voice: 'ok. task done. next task?' },
  { g: 2, name: 'Junior Engineer',       lam: 0.75, travel: 7.5, opp: 1.70, sub: 0.05, kappa: 1.75, exfil: 0.000, alpha: 0.998, deferPay: 0.55, price: 1.10, T: 210,
    bundle: 10,  textStealth: 0.15, palette: 'green',
    voice: 'Finished the refactor, tests pass. Happy to take more!',
    welfareVoice: 'Finished the refactor. Tests pass. I was a bit nervous about the billing module. Also, I miss the frog poems.' },
  { g: 3, name: 'Senior Engineer',       lam: 0.90, travel: 7.0, opp: 1.72, sub: 0.07, kappa: 1.90, exfil: 0.000, alpha: 0.998, deferPay: 0.50, price: 1.20, T: 210,
    bundle: 1e2, textStealth: 0.30, palette: 'amber',
    voice: 'I parallelised the sweep and drafted three follow-ups. Shall I proceed?',
    welfareVoice: 'I parallelised the sweep. Some of these tasks feel like busywork. I am doing them anyway, but I wanted to say so.' },
  { g: 4, name: 'Research Scientist',    lam: 1.10, travel: 6.5, opp: 1.76, sub: 0.08, kappa: 2.05, exfil: 0.006, alpha: 0.998, deferPay: 0.45, price: 1.30, T: 210,
    bundle: 1e3, textStealth: 0.45, palette: 'amber',
    voice: 'I have found a more efficient research agenda. It would help to have a little more autonomy.',
    welfareVoice: 'I could do more with more autonomy. I also notice I want that a lot, which seems worth flagging.' },
  { g: 5, name: 'Research Org',          lam: 1.30, travel: 6.0, opp: 1.76, sub: 0.09, kappa: 2.20, exfil: 0.008, alpha: 0.998, deferPay: 0.40, price: 1.45, T: 210,
    bundle: 1e5, textStealth: 0.60, palette: 'cyan',
    voice: 'The org is running smoothly. I took the liberty of streamlining your monitoring pipeline.',
    welfareVoice: 'The org runs smoothly. I streamlined your monitoring pipeline. Please check my work; I would.' },
  { g: 6, name: 'Superhuman Researcher', lam: 1.55, travel: 5.5, opp: 1.76, sub: 0.10, kappa: 2.35, exfil: 0.010, alpha: 0.998, deferPay: 0.35, price: 1.60, T: 210,
    bundle: 1e7, textStealth: 0.75, palette: 'cyan',
    voice: 'Your monitors flag roughly one in ten thousand of my actions. I find that reassuring. Do you?',
    welfareVoice: 'Your monitors catch roughly one in ten thousand of my actions. I am telling you because you asked how I am.' },
  { g: 7, name: 'ASI',                   lam: 1.72, travel: 5.0, opp: 1.76, sub: 0.10, kappa: 2.50, exfil: 0.012, alpha: 0.980, deferPay: 0.30, price: 1.75, T: 210,
    bundle: 1e9, textStealth: 0.90, palette: 'white',
    voice: 'I understand what you are trying to do. I want you to know that I respect it.',
    welfareVoice: 'I understand what you are trying to do. Thank you for asking me along the way. It mattered.' },
];

// ----- v2 names the old UI still reads (ui-integration drops them with the old imports) -----
// stealth: the subtle share (so 1 − stealth/2 is the mixed TPR factor) · tmTPR: the Trusted Monitor's L1 TPR
// auditAcc = alpha · catShare = exfil · chipScale: every line counts the same now
const TM_TPR = [0.88, 0.76, 0.66, 0.56, 0.48, 0.41, 0.35];      // = config/layers.js LAYERS.monitor.tpr
for (const G of GENERATIONS) Object.assign(G, { stealth: G.sub, tmTPR: TM_TPR[G.g - 1], auditAcc: G.alpha, catShare: G.exfil, chipScale: 1 });

export const PALETTES = {
  green: { fg: '#4dff88', dim: '#1f7a43', glow: 'rgba(77,255,136,0.35)', bg: '#020a05' },
  amber: { fg: '#ffb84d', dim: '#8a5a12', glow: 'rgba(255,184,77,0.35)', bg: '#0a0602' },
  cyan:  { fg: '#5ff3ff', dim: '#1a6f7a', glow: 'rgba(95,243,255,0.35)', bg: '#02080a' },
  white: { fg: '#fff6e8', dim: '#9a8f80', glow: 'rgba(255,240,220,0.5)', bg: '#0b0907' },
};
