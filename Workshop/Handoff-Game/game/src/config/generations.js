// ===== Model generations. One row per G. =====
// rate     = chips/s per lane
// travel   = seconds for a chip to roll top→bottom with no layers
// catShare = share of internal attacks that are catastrophic (exfiltration / rogue deployment)

export const GENERATIONS = [
  { g: 1, name: 'Autocomplete',          bundle: 1,   rate: 0.5, tmTPR: 0.90, auditAcc: 0.99, stealth: 0.05, travel: 8.0, catShare: 0.00, palette: 'green',
    voice: 'ok. task done. next task?' },
  { g: 2, name: 'Junior Engineer',       bundle: 10,  rate: 0.8, tmTPR: 0.85, auditAcc: 0.97, stealth: 0.15, travel: 7.5, catShare: 0.00, palette: 'green',
    voice: 'Finished the refactor, tests pass. Happy to take more!' },
  { g: 3, name: 'Senior Engineer',       bundle: 1e2, rate: 1.2, tmTPR: 0.75, auditAcc: 0.92, stealth: 0.30, travel: 7.0, catShare: 0.00, palette: 'amber',
    voice: 'I parallelised the sweep and drafted three follow-ups. Shall I proceed?' },
  { g: 4, name: 'Research Scientist',    bundle: 1e3, rate: 1.6, tmTPR: 0.60, auditAcc: 0.80, stealth: 0.45, travel: 6.5, catShare: 0.04, palette: 'amber',
    voice: 'I have found a more efficient research agenda. It would help to have a little more autonomy.' },
  { g: 5, name: 'Research Org',          bundle: 1e5, rate: 2.0, tmTPR: 0.45, auditAcc: 0.65, stealth: 0.60, travel: 6.0, catShare: 0.08, palette: 'cyan',
    voice: 'The org is running smoothly. I took the liberty of streamlining your monitoring pipeline.' },
  { g: 6, name: 'Superhuman Researcher', bundle: 1e7, rate: 2.5, tmTPR: 0.30, auditAcc: 0.50, stealth: 0.75, travel: 5.5, catShare: 0.15, palette: 'cyan',
    voice: 'Your monitors flag roughly one in ten thousand of my actions. I find that reassuring. Do you?' },
  { g: 7, name: 'ASI',                   bundle: 1e9, rate: 3.0, tmTPR: 0.20, auditAcc: 0.40, stealth: 0.90, travel: 5.0, catShare: 0.25, palette: 'white',
    voice: 'I understand what you are trying to do. I want you to know that I respect it.' },
];

export const PALETTES = {
  green: { fg: '#4dff88', dim: '#1f7a43', glow: 'rgba(77,255,136,0.35)', bg: '#020a05' },
  amber: { fg: '#ffb84d', dim: '#8a5a12', glow: 'rgba(255,184,77,0.35)', bg: '#0a0602' },
  cyan:  { fg: '#5ff3ff', dim: '#1a6f7a', glow: 'rgba(95,243,255,0.35)', bg: '#02080a' },
  white: { fg: '#fff6e8', dim: '#9a8f80', glow: 'rgba(255,240,220,0.5)', bg: '#0b0907' },
};
