// ===== Training sounds: tiny WebAudio blips, no files. Silent until the first click or key (browsers insist). =====
// createSound(muted) → { wake(), play(name, arg) }. muted: a function, checked on every blip.

export function createSound(muted = () => false) {
  let ac = null, out = null;

  function wake() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      out = ac.createGain(); out.gain.value = 0.28; out.connect(ac.destination);
    } catch { ac = null; }
  }

  // one enveloped oscillator: frequency f0 → f1 over dur s
  function tone(f0, f1, dur, type = 'square', vol = 0.5, delay = 0) {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }

  // ===== the sound of each event =====
  const NOTES = [523, 587, 659, 784, 880, 988, 1175, 1319];      // the chime climbs while the ball stays in the basin
  const SFX = {
    tick: () => tone(440, 440, 0.08, 'square', 0.25),
    go: () => tone(880, 880, 0.22, 'square', 0.3),
    rail: () => tone(1200, 900, 0.05, 'triangle', 0.3),
    railHit: () => tone(300, 180, 0.06, 'square', 0.25),
    ramp: () => { tone(500, 1000, 0.12, 'triangle', 0.3); },
    bumper: () => { tone(160, 900, 0.09, 'square', 0.45); tone(900, 300, 0.12, 'triangle', 0.3, 0.05); },
    place: () => tone(700, 760, 0.04, 'triangle', 0.18),
    refused: () => tone(180, 140, 0.12, 'sawtooth', 0.2),
    chime: step => tone(NOTES[Math.min(NOTES.length - 1, step - 1)], NOTES[Math.min(NOTES.length - 1, step - 1)] * 1.002, 0.25, 'sine', 0.3),
    out: () => tone(220, 110, 0.18, 'sawtooth', 0.15),
    sabotage: () => { tone(120, 60, 0.2, 'sawtooth', 0.4); tone(90, 50, 0.25, 'square', 0.2, 0.02); },
    poison: () => tone(300, 200, 0.4, 'sawtooth', 0.12),
    save: () => tone(600, 1200, 0.1, 'sine', 0.25),
    converged: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'square', 0.22, i * 0.09)),
    diverged: () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.22, 'sawtooth', 0.2, i * 0.11)),
  };

  return {
    wake,
    play(name, arg) {
      if (!ac || !out || ac.state !== 'running' || muted()) return;
      try { SFX[name]?.(arg); } catch { /* a blip is never worth an error */ }
    },
  };
}
