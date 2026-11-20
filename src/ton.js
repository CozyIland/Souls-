// Kampfgeräusche, komplett erzeugt (Web Audio, keine Tondateien): Schwung, Treffer, Kartenwurf, Hund (Knurren, Jaulen, Biss).
// Der Browser erlaubt Ton erst nach einer Eingabe (Klick/Taste) – vorher bleibt es still.
let ctx = null, master = null, noiseBuf = null;

function ac() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  const n = ctx.sampleRate * 1.0; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
// erste Eingabe schaltet den Ton frei
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => ac(), { passive: true });

function ok() { const c = ac(); return c && c.state === 'running' ? c : null; }

/** Rauschen durch einen Filter mit Lautstärke-Hüllkurve */
function noise(c, t0, dur, type, f0, f1, q, vol, attack = 0.01) {
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
}
/** Ton mit Tonhöhenverlauf */
function tone(c, t0, dur, type, f0, f1, vol, attack = 0.005) {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  /** Klinge schneidet durch die Luft (schwer = tiefer, länger) */
  swing(heavy) {
    const c = ok(); if (!c) return; const t = c.currentTime;
    noise(c, t, heavy ? 0.32 : 0.2, 'bandpass', heavy ? 300 : 600, heavy ? 1400 : 2600, 1.2, heavy ? 0.35 : 0.22, 0.04);
  },
  /** Klinge trifft Fleisch: dumpfer Schlag + kurzes Reißen */
  hit(heavy) {
    const c = ok(); if (!c) return; const t = c.currentTime;
    tone(c, t, heavy ? 0.22 : 0.14, 'sine', heavy ? 120 : 160, 45, heavy ? 0.9 : 0.6);
    noise(c, t, heavy ? 0.18 : 0.12, 'lowpass', 2400, 500, 0.7, heavy ? 0.5 : 0.35, 0.002);
    noise(c, t + 0.01, 0.08, 'highpass', 3000, 1500, 0.8, 0.12, 0.002);
  },
  /** Treffer auf Holz/Stroh (Übungspuppe) */
  thud() {
    const c = ok(); if (!c) return; const t = c.currentTime;
    tone(c, t, 0.12, 'triangle', 220, 90, 0.45); noise(c, t, 0.1, 'bandpass', 900, 400, 1.5, 0.3, 0.002);
  },
  /** Karte zischt los */
  card() {
    const c = ok(); if (!c) return; const t = c.currentTime;
    noise(c, t, 0.16, 'bandpass', 2500, 5000, 2, 0.16, 0.01);
  },
  /** Hund jault (getroffen) */
  yelp(hard) {
    const c = ok(); if (!c) return; const t = c.currentTime;
    tone(c, t, hard ? 0.35 : 0.2, 'sawtooth', hard ? 1100 : 950, hard ? 420 : 600, 0.12, 0.01);
    tone(c, t, hard ? 0.35 : 0.2, 'sine', hard ? 1100 : 950, hard ? 420 : 600, 0.18, 0.01);
  },
  /** Hund knurrt (entdeckt dich / duckt sich zum Sprung) */
  growl(short) {
    const c = ok(); if (!c) return; const t = c.currentTime, d = short ? 0.35 : 0.7;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 72;
    const lfo = c.createOscillator(); lfo.frequency.value = 24; const lg = c.createGain(); lg.gain.value = 0.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    lfo.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(master);
    o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
  },
  /** Biss: Schnappen */
  bite() {
    const c = ok(); if (!c) return; const t = c.currentTime;
    noise(c, t, 0.07, 'bandpass', 1800, 800, 2, 0.4, 0.002); tone(c, t, 0.1, 'square', 300, 120, 0.12);
  },
};
