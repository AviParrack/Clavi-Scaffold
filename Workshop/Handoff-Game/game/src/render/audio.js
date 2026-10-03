// ===== WebAudio blips. No audio files. Context starts on first user gesture. =====

let ac = null, master = null, muted = false;
const last = {};

export function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.25;
    master.connect(ac.destination);
  } catch { ac = null; }
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.25; }
export const isMuted = () => muted;

function throttle(key, s) {
  const t = performance.now() / 1000;
  if (last[key] && t - last[key] < s) return false;
  last[key] = t; return true;
}

function tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3) {
  if (!ac || muted) return;
  const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buf; g.gain.value = vol;
  src.connect(g); g.connect(master); src.start();
}

export const sfx = {
  click:  () => tone(880, 0.05, 'square', 0.15),
  place:  () => { tone(440, 0.08, 'square', 0.2); tone(660, 0.1, 'square', 0.2, null, 0.07); },
  toggle: on => tone(on ? 700 : 350, 0.06, 'square', 0.15),
  type:   () => throttle('type', 0.045) && tone(1400 + Math.random() * 300, 0.015, 'square', 0.04),
  pay:    () => throttle('pay', 0.25) && tone(1200, 0.04, 'triangle', 0.06),
  caught: () => { tone(900, 0.12, 'sawtooth', 0.2); tone(600, 0.12, 'sawtooth', 0.2, null, 0.13); },
  block:  () => throttle('block', 0.1) && noise(0.08, 0.15),
  landed: () => { noise(0.35, 0.35); tone(120, 0.4, 'sawtooth', 0.25, 40); },
  codec:  () => { tone(1800, 0.05, 'square', 0.12); tone(2400, 0.05, 'square', 0.12, null, 0.06); },
  model:  () => [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, null, i * 0.09)),
  lose:   () => { tone(300, 1.2, 'sawtooth', 0.3, 40); noise(1, 0.3); },
  win:    () => [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.4, 'triangle', 0.2, null, i * 0.12)),
};

export function onFx(e) {
  switch (e.type) {
    case 'place': sfx.place(); break;
    case 'toggle': sfx.toggle(e.on); break;
    case 'pay': sfx.pay(); break;
    case 'caught': sfx.caught(); break;
    case 'block': sfx.block(); break;
    case 'landed': case 'catastrophe': sfx.landed(); break;
    case 'newModel': if (e.g > 1) sfx.model(); break;
    case 'lose': sfx.lose(); break;
    case 'win': sfx.win(); break;
    case 'event': sfx.codec(); break;
  }
}
