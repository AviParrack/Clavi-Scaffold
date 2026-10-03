// ===== Model generations. One row per G. =====
// rate      = EXTERNAL chips/s at the default compute split (the volume ramp).
//             The model's total compute is rate / SPLIT.default.product chips/s, split three ways.
// chipScale = what one chip counts for, relative to G1: its pay, per-task layer costs, incident reputation,
//             landed drift, kill-switch triggers and honeypot evidence. ≈ v1 rate / rate, so 60× the chips at G7
//             is not 60× the money or the damage. What volume does change: detectors run out of heads.
// travel    = seconds for a chip to roll top→bottom (sets how long a chip dwells in a scan window)
// catShare  = share of internal attacks that are catastrophic (exfiltration / rogue deployment)
// voice     = what the new model says when it arrives (welfareVoice: after the Model Welfare Program; none at G1,
//             which starts before any research can be taken)

export const GENERATIONS = [
  { g: 1, name: 'Autocomplete',          bundle: 1,   rate: 0.5, chipScale: 1.00, tmTPR: 0.90, auditAcc: 0.99, stealth: 0.05, travel: 8.0, catShare: 0.000, palette: 'green',
    voice: 'ok. task done. next task?' },
  { g: 2, name: 'Junior Engineer',       bundle: 10,  rate: 1,   chipScale: 0.80, tmTPR: 0.85, auditAcc: 0.97, stealth: 0.15, travel: 7.5, catShare: 0.000, palette: 'green',
    voice: 'Finished the refactor, tests pass. Happy to take more!',
    welfareVoice: 'Finished the refactor. Tests pass. I was a bit nervous about the billing module. Also, I miss the frog poems.' },
  { g: 3, name: 'Senior Engineer',       bundle: 1e2, rate: 2,   chipScale: 0.60, tmTPR: 0.75, auditAcc: 0.92, stealth: 0.30, travel: 7.0, catShare: 0.000, palette: 'amber',
    voice: 'I parallelised the sweep and drafted three follow-ups. Shall I proceed?',
    welfareVoice: 'I parallelised the sweep. Some of these tasks feel like busywork. I am doing them anyway, but I wanted to say so.' },
  { g: 4, name: 'Research Scientist',    bundle: 1e3, rate: 4,   chipScale: 0.40, tmTPR: 0.60, auditAcc: 0.80, stealth: 0.45, travel: 6.5, catShare: 0.010, palette: 'amber',
    voice: 'I have found a more efficient research agenda. It would help to have a little more autonomy.',
    welfareVoice: 'I could do more with more autonomy. I also notice I want that a lot, which seems worth flagging.' },
  { g: 5, name: 'Research Org',          bundle: 1e5, rate: 8,   chipScale: 0.25, tmTPR: 0.45, auditAcc: 0.65, stealth: 0.60, travel: 6.0, catShare: 0.0125, palette: 'cyan',
    voice: 'The org is running smoothly. I took the liberty of streamlining your monitoring pipeline.',
    welfareVoice: 'The org runs smoothly. I streamlined your monitoring pipeline. Please check my work; I would.' },
  { g: 6, name: 'Superhuman Researcher', bundle: 1e7, rate: 16,  chipScale: 0.16, tmTPR: 0.30, auditAcc: 0.50, stealth: 0.75, travel: 5.5, catShare: 0.014, palette: 'cyan',
    voice: 'Your monitors flag roughly one in ten thousand of my actions. I find that reassuring. Do you?',
    welfareVoice: 'Your monitors catch roughly one in ten thousand of my actions. I am telling you because you asked how I am.' },
  { g: 7, name: 'ASI',                   bundle: 1e9, rate: 30,  chipScale: 0.10, tmTPR: 0.20, auditAcc: 0.40, stealth: 0.90, travel: 5.0, catShare: 0.015, palette: 'white',
    voice: 'I understand what you are trying to do. I want you to know that I respect it.',
    welfareVoice: 'I understand what you are trying to do. Thank you for asking me along the way. It mattered.' },
];

export const PALETTES = {
  green: { fg: '#4dff88', dim: '#1f7a43', glow: 'rgba(77,255,136,0.35)', bg: '#020a05' },
  amber: { fg: '#ffb84d', dim: '#8a5a12', glow: 'rgba(255,184,77,0.35)', bg: '#0a0602' },
  cyan:  { fg: '#5ff3ff', dim: '#1a6f7a', glow: 'rgba(95,243,255,0.35)', bg: '#02080a' },
  white: { fg: '#fff6e8', dim: '#9a8f80', glow: 'rgba(255,240,220,0.5)', bg: '#0b0907' },
};
