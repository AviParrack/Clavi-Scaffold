// ===== Sound: every blip is synthesised with WebAudio (no files) =====
// Silent until the first user gesture (initAudio, called on pointer or key). M mutes (setMuted).
// ui/overlays.js plays it: onFx(e) for each fresh sim fx, ring() / type() for the codec, setGen() for the ramp.
// Never reacts to fx 'silent': a landed INTERNAL attack makes no sound (hidden truth).

let ac = null, out = null, noiseBuf = null, muted = false, gen = 1;
const VOLUME = 0.32;
const last = {};

// =================== context ===================

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();          // many blips at once never clip
    comp.threshold.value = -18; comp.ratio.value = 6;
    out = ac.createGain();
    out.gain.value = muted ? 0 : VOLUME;
    out.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
  } catch { ac = null; }
}

export function setMuted(m) { muted = m; if (out) out.gain.value = m ? 0 : VOLUME; }
export const isMuted = () => muted;
export const ready = () => !!ac && !muted && ac.state === 'running';

// the volume ramp: later generations tick faster and a little higher
export function setGen(g) { gen = g || 1; }

// at most one `key` per `s` seconds (audio clock)
function every(key, s) {
  if (!ready()) return false;
  const t = ac.currentTime;
  if (last[key] != null && t - last[key] < s) return false;
  last[key] = t;
  return true;
}

// =================== primitives ===================
// tone: one oscillator, a fast attack, an exponential tail. to = pitch slide target. at = delay (s)

function tone(f, dur, { type = 'square', vol = 0.1, to = null, at = 0, attack = 0.004, lp = null } = {}) {
  if (!ready()) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; o.connect(f2); node = f2; }
  node.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.03);
}

// noise burst through a filter: 'lowpass' thuds, 'highpass' ticks, 'bandpass' whooshes (sweep to `to`)
function hiss(dur, { vol = 0.1, at = 0, kind = 'lowpass', f = 1200, to = null, q = 0.8 } = {}) {
  if (!ready()) return;
  const t = ac.currentTime + at, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf;
  fl.type = kind; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(out);
  src.start(t, (t * 7.31) % 0.5); src.stop(t + dur + 0.03);
}

// a slow, wavering pair of sines: the eerie INTERNAL tone
function drone(f, dur, { vol = 0.06, at = 0, detune = 1.06, wobble = 4 } = {}) {
  if (!ready()) return;
  const t = ac.currentTime + at, g = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain();
  lfo.frequency.value = wobble; depth.gain.value = f * 0.012;
  lfo.connect(depth);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  for (const m of [1, detune]) {
    const o = ac.createOscillator();
    o.type = 'sine'; o.frequency.value = f * m;
    depth.connect(o.frequency);
    o.connect(g); o.start(t); o.stop(t + dur + 0.05);
  }
  lfo.start(t); lfo.stop(t + dur + 0.05);
}

// =================== the sound set ===================

let combo = 0, comboT = 0;
const ramp = () => 1 + 0.12 * (gen - 1);           // G1 → 1, G7 → 1.72

export const sfx = {
  // ---------- UI ----------
  click:  () => every('click', 0.03) && tone(1250, 0.03, { vol: 0.05 }),
  hover:  () => every('hover', 0.05) && tone(2100, 0.012, { vol: 0.02 }),

  // ---------- money: the coin pop, then the odometer drums ----------
  coin() {
    if (!every('coin', 0.09 / Math.min(2, ramp()))) return;
    const t = ac.currentTime;
    combo = t - comboT < 0.6 ? Math.min(combo + 1, 10) : 0;
    comboT = t;
    const up = Math.pow(2, combo / 24);
    tone(988 * up, 0.05, { vol: 0.045 });
    tone(1319 * up, 0.1, { vol: 0.045, at: 0.05 });
    hiss(0.012, { vol: 0.03, at: 0.1, kind: 'highpass', f: 5000 });
    hiss(0.012, { vol: 0.025, at: 0.135, kind: 'highpass', f: 5000 });
  },

  // ---------- the track ----------
  scan:   () => every('scan', 0.07 / ramp()) && tone(2400 + 120 * gen, 0.01, { vol: 0.012 }),
  flag()  { if (!every('flag', 0.18)) return; tone(1568, 0.05, { vol: 0.06 }); tone(2093, 0.08, { vol: 0.06, at: 0.055 }); },
  pull:   () => every('pull', 0.12) && tone(700, 0.08, { type: 'triangle', vol: 0.07, to: 330 }),
  stamp(ok) {                                       // a rubber stamp on the bay desk
    if (!every('stamp', 0.12)) return;
    hiss(0.05, { vol: 0.16, f: 700 });
    tone(150, 0.07, { vol: 0.09, to: 80 });
    if (ok) tone(1760, 0.05, { type: 'triangle', vol: 0.04, at: 0.06 });
    else tone(110, 0.12, { type: 'sawtooth', vol: 0.04, at: 0.05, lp: 900 });
  },
  waved:  () => every('waved', 0.2) && hiss(0.18, { vol: 0.06, kind: 'bandpass', f: 600, to: 2400, q: 2 }),
  block:  () => every('block', 0.1) && hiss(0.05, { vol: 0.09, f: 1800 }),
  kill()  { if (!every('kill', 0.2)) return; hiss(0.08, { vol: 0.14, f: 1200 }); tone(220, 0.1, { type: 'sawtooth', vol: 0.06, to: 110, lp: 1500 }); },
  caught() {
    if (!every('caught', 0.25)) return;
    [660, 880, 1320].forEach((f, i) => tone(f, 0.07, { vol: 0.06, at: i * 0.06 }));
  },

  // ---------- incidents: EXTERNAL hits hard, INTERNAL just feels wrong ----------
  incident() {
    if (!every('incident', 0.8)) return;
    tone(120, 0.55, { type: 'sine', vol: 0.5, to: 36 });
    tone(60, 0.5, { type: 'sawtooth', vol: 0.12, lp: 400 });
    hiss(0.35, { vol: 0.3, f: 1400, to: 200 });
    for (let i = 0; i < 4; i++) tone(i % 2 ? 554 : 740, 0.14, { vol: 0.05, at: 0.2 + i * 0.15, lp: 2400 });
  },
  anomaly() {
    if (!every('anomaly', 2)) return;
    drone(196, 1.8, { vol: 0.07 });
    tone(1568, 1.2, { type: 'sine', vol: 0.012, at: 0.25, attack: 0.4 });
  },
  catastrophe() {
    if (!every('catastrophe', 3)) return;
    sfx.incident();
    tone(320, 2.2, { type: 'sawtooth', vol: 0.12, to: 30, lp: 1200 });
    drone(98, 2.6, { vol: 0.08, at: 0.4 });
  },

  // ---------- the codec ----------
  ring() {                                         // pi-pi-pi: an incoming call
    if (!every('ring', 0.5)) return;
    for (let i = 0; i < 6; i++) tone(i % 2 ? 1400 : 1870, 0.03, { vol: 0.045, at: i * 0.045 });
  },
  type:   n => every('type', 0.05) && tone(1250 + 40 * (n % 7), 0.012, { vol: 0.016 }),
  event() { if (!every('event', 1)) return; [1046, 1318, 1046].forEach((f, i) => tone(f, 0.05, { vol: 0.05, at: i * 0.07 })); },

  // ---------- building ----------
  place() { tone(330, 0.06, { vol: 0.07 }); tone(495, 0.08, { vol: 0.07, at: 0.06 }); hiss(0.03, { vol: 0.06, f: 900 }); },
  upgrade() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.06, { vol: 0.05, at: i * 0.045 })); },
  sell()  { tone(784, 0.06, { vol: 0.05 }); tone(392, 0.1, { vol: 0.05, at: 0.06 }); },
  toggle: on => tone(on ? 880 : 440, 0.05, { vol: 0.05 }),
  slot()  { hiss(0.06, { vol: 0.12, f: 500 }); tone(1200, 0.03, { vol: 0.04, at: 0.05 }); },
  card()  { tone(784, 0.08, { type: 'triangle', vol: 0.08 }); tone(1175, 0.16, { type: 'triangle', vol: 0.08, at: 0.08 }); },
  reveal() { [880, 1320, 990, 1480, 1175, 1760].forEach((f, i) => tone(f, 0.035, { vol: 0.035, at: i * 0.035 })); },

  // ---------- the run ----------
  training: () => tone(110, 1.2, { type: 'triangle', vol: 0.06, to: 440, attack: 0.3 }),
  model() { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.08, at: i * 0.09 })); },
  rival() { tone(98, 1.4, { type: 'sawtooth', vol: 0.08, to: 73, lp: 600 }); },
  rsp:    () => tone(880, 0.9, { type: 'triangle', vol: 0.07, to: 110 }),
  win()   { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.09, at: i * 0.12 })); },
  lose()  { tone(300, 1.4, { type: 'sawtooth', vol: 0.12, to: 40, lp: 1600 }); hiss(1, { vol: 0.12, f: 900, to: 120 }); },
};

// =================== sim fx → sound ===================

export function onFx(e) {
  switch (e.type) {
    case 'pay':         if (e.lane === 'ext') sfx.coin(); break;
    case 'scan':        sfx.scan(); break;
    case 'flag':        sfx.flag(); break;
    case 'pull':        sfx.pull(); break;
    case 'approve':     sfx.stamp(true); break;
    case 'toss':        sfx.stamp(false); break;
    case 'waved':       sfx.waved(); break;
    case 'block': case 'throttle': sfx.block(); break;
    case 'kill':        sfx.kill(); break;
    case 'caught':      sfx.caught(); break;
    case 'landed':      sfx.incident(); break;                                  // EXTERNAL INCIDENT
    case 'foiled': case 'contained': case 'shake': sfx.anomaly(); break;       // INTERNAL ANOMALY (never 'silent')
    case 'catastrophe': sfx.catastrophe(); break;
    case 'event':       sfx.event(); break;
    case 'place':       sfx.place(); break;
    case 'upgrade':     sfx.upgrade(); break;
    case 'sell':        sfx.sell(); break;
    case 'toggle':      sfx.toggle(e.on); break;
    case 'slot':        sfx.slot(); break;
    case 'card':        sfx.card(); break;
    case 'reveal':      sfx.reveal(); break;
    case 'training':    sfx.training(); break;
    case 'newModel':    if (e.g > 1) sfx.model(); break;
    case 'rivalShipped': sfx.rival(); break;
    case 'rsp':         sfx.rsp(); break;
    case 'win':         sfx.win(); break;
    case 'lose':        sfx.lose(); break;
  }
}
