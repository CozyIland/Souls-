// Selbst gezeichnete Texturen (keine Bilddateien nötig).
import * as THREE from 'three';
import { ARENA_R, TAU, rand } from '../util.js';

/** Weicher, runder Lichtpunkt – für Feuer, Augen, Kugeln */
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Verlauf von links (voll) nach rechts (durchsichtig) – für die Ansturm-Warnung */
export function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 8;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const FLOOR_R = ARENA_R + 70; // Plattform inkl. Rand mit den Säulen

/** Steinboden mit Runenkreis – derselbe Look wie in der 2D-Version, jetzt als Bodentextur */
export function floorTexture() {
  const FS = FLOOR_R * 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = FS;
  const f = cv.getContext('2d'), c = FS / 2;

  // äußerer Sims (dort stehen die Feuersäulen)
  f.fillStyle = '#16120f'; f.fillRect(0, 0, FS, FS);
  for (let i = 0; i < 64; i++) {
    const a0 = (i / 64) * TAU, a1 = ((i + 1) / 64) * TAU, s = rand(-6, 6);
    f.fillStyle = `rgb(${34 + s},${30 + s},${26 + s})`;
    f.beginPath(); f.arc(c, c, FLOOR_R - 2, a0 + 0.004, a1 - 0.004); f.arc(c, c, ARENA_R + 24, a1 - 0.004, a0 + 0.004, true); f.closePath(); f.fill();
  }

  f.save(); f.beginPath(); f.arc(c, c, ARENA_R, 0, TAU); f.clip();
  f.fillStyle = '#1b1713'; f.fillRect(0, 0, FS, FS);
  // Steinplatten in Ringen
  const ringW = 64;
  for (let r = 70; r < ARENA_R + ringW; r += ringW) {
    const n = Math.max(6, Math.floor((TAU * r) / 95)), off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i * TAU) / n, a1 = off + ((i + 1) * TAU) / n, s = rand(-10, 10);
      f.fillStyle = `rgb(${50 + s},${44 + s},${37 + s})`;
      f.beginPath(); f.arc(c, c, r + ringW - 3, a0 + 0.008, a1 - 0.008); f.arc(c, c, r + 2, a1 - 0.012, a0 + 0.012, true); f.closePath(); f.fill();
      f.strokeStyle = 'rgba(255,240,210,0.04)'; f.lineWidth = 2;
      f.beginPath(); f.arc(c, c, r + ringW - 5, a0 + 0.02, a1 - 0.02); f.stroke();
    }
  }
  // Mitte
  const cg = f.createRadialGradient(c, c, 0, c, c, 70);
  cg.addColorStop(0, '#3c342b'); cg.addColorStop(1, '#2c261f');
  f.fillStyle = cg; f.beginPath(); f.arc(c, c, 66, 0, TAU); f.fill();
  // Körnung
  for (let i = 0; i < 9000; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * ARENA_R;
    f.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rand(0.05, 0.25)})` : `rgba(255,235,200,${rand(0.02, 0.06)})`;
    f.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, rand(1, 3), rand(1, 3));
  }
  // Risse
  f.strokeStyle = 'rgba(0,0,0,0.45)'; f.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU, r = rand(40, ARENA_R);
    let x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, dir = Math.random() * TAU;
    f.lineWidth = rand(1, 2.5); f.beginPath(); f.moveTo(x, y);
    for (let j = 0; j < 8; j++) { dir += rand(-0.7, 0.7); x += Math.cos(dir) * rand(8, 22); y += Math.sin(dir) * rand(8, 22); f.lineTo(x, y); }
    f.stroke();
  }
  // Blutflecken / Moos
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, r = rand(80, ARENA_R - 40), x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, s = rand(20, 55);
    const g = f.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, i % 3 ? 'rgba(40,50,25,0.35)' : 'rgba(70,15,12,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g; f.fillRect(x - s, y - s, s * 2, s * 2);
  }
  // Runenkreis
  f.strokeStyle = 'rgba(160,120,70,0.22)'; f.lineWidth = 3;
  f.beginPath(); f.arc(c, c, 230, 0, TAU); f.stroke();
  f.beginPath(); f.arc(c, c, 252, 0, TAU); f.stroke();
  f.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const a = (i * TAU) / 24, x = c + Math.cos(a) * 241, y = c + Math.sin(a) * 241;
    f.save(); f.translate(x, y); f.rotate(a + Math.PI / 2); f.beginPath();
    const t = i % 4;
    if (t === 0) { f.moveTo(-5, -6); f.lineTo(0, 6); f.lineTo(5, -6); }
    else if (t === 1) { f.moveTo(0, -7); f.lineTo(0, 7); f.moveTo(-5, -2); f.lineTo(5, 2); }
    else if (t === 2) { f.moveTo(-5, 6); f.lineTo(0, -6); f.lineTo(5, 6); f.moveTo(-3, 1); f.lineTo(3, 1); }
    else { f.arc(0, 0, 4, 0, TAU); f.moveTo(0, -7); f.lineTo(0, 7); }
    f.stroke(); f.restore();
  }
  // Randverdunkelung
  const ed = f.createRadialGradient(c, c, ARENA_R * 0.55, c, c, ARENA_R);
  ed.addColorStop(0, 'rgba(0,0,0,0)'); ed.addColorStop(1, 'rgba(0,0,0,0.55)');
  f.fillStyle = ed; f.fillRect(0, 0, FS, FS);
  f.restore();
  // Randmauer-Fuge
  f.strokeStyle = '#0d0a08'; f.lineWidth = 22; f.beginPath(); f.arc(c, c, ARENA_R + 11, 0, TAU); f.stroke();
  f.strokeStyle = '#4a4034'; f.lineWidth = 3; f.beginPath(); f.arc(c, c, ARENA_R + 1, 0, TAU); f.stroke();

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
