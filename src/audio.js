// Synthetische Soundeffekte – keine Audiodateien nötig.

let AC = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.45;
    master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}

export function noise(dur, f0, f1, type, vol, q) {
  if (!AC) return;
  try {
    const t = AC.currentTime, src = AC.createBufferSource();
    src.buffer = noiseBuf;
    const fl = AC.createBiquadFilter();
    fl.type = type || 'bandpass';
    fl.Q.value = q || 1;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  } catch (e) { /* ignorieren */ }
}

function tone(f0, f1, dur, type, vol, delay) {
  if (!AC) return;
  try {
    const t = AC.currentTime + (delay || 0), o = AC.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* ignorieren */ }
}

export const sfx = {
  swing: (h) => noise(h ? 0.3 : 0.17, h ? 500 : 1100, h ? 2600 : 4200, 'bandpass', h ? 0.4 : 0.28, 1.3),
  hit: (h) => { tone(h ? 120 : 160, 45, 0.2, 'triangle', 0.55); noise(0.14, 3200, 700, 'lowpass', 0.45); },
  hurt: () => { tone(200, 70, 0.32, 'sawtooth', 0.22); noise(0.25, 1600, 250, 'lowpass', 0.6); },
  roll: () => noise(0.3, 450, 140, 'lowpass', 0.32),
  bossSwing: () => noise(0.4, 260, 1900, 'bandpass', 0.5, 0.8),
  slam: () => { tone(85, 28, 0.7, 'sine', 0.9); noise(0.7, 900, 90, 'lowpass', 0.8); },
  roar: () => { tone(72, 44, 1.3, 'sawtooth', 0.33); tone(108, 58, 1.3, 'sawtooth', 0.22); noise(1.1, 700, 180, 'bandpass', 0.35, 0.7); },
  heal: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, f * 1.01, 0.5, 'sine', 0.1, i * 0.08)); },
  orb: () => tone(700, 180, 0.35, 'square', 0.05),
  death: () => { tone(110, 38, 2.8, 'sawtooth', 0.22); tone(165, 55, 2.8, 'triangle', 0.18); },
  win: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, f, 1.6, 'triangle', 0.1, i * 0.15)); },
  learn: () => { tone(880, 660, 0.25, 'triangle', 0.06); },
  stagger: () => { tone(300, 120, 0.4, 'square', 0.12); noise(0.3, 2500, 600, 'bandpass', 0.3); },
};
