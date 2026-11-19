// Selbst gemalte Texturen (Canvas): Asphalt, Gehweg, Fassaden-Atlas, Dach, Rost, Unkraut, Schilder, Himmel, Skyline.
import * as THREE from 'three';
import { seeded, TAU } from './util.js';

const R = seeded(31);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));

export function canvasTex(w, h, draw, opt = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opt.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (opt.rep) t.repeat.set(opt.rep[0], opt.rep[1]);
  t.anisotropy = 8;
  return t;
}

// ---------- kleine Malwerkzeuge ----------
function speckle(g, w, h, n, rgb, a0, a1, s0 = 1, s1 = 3) {
  for (let i = 0; i < n; i++) {
    const s = rr(s0, s1);
    g.fillStyle = `rgba(${rgb},${rr(a0, a1).toFixed(3)})`;
    g.fillRect(R() * w, R() * h, s, s);
  }
}
function blot(g, x, y, r, rgb, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function crack(g, x, y, len, wid, col) {
  let a = R() * TAU;
  g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  const pts = [[x, y]];
  for (let j = 0; j < len; j++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 10; y += Math.sin(a) * 10; pts.push([x, y]); }
  g.lineWidth = wid; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.stroke();
  if (R() < 0.6) { // Abzweig
    const k = pts[ri(1, pts.length - 1)];
    g.lineWidth = wid * 0.6; g.beginPath(); g.moveTo(k[0], k[1]);
    let bx = k[0], by = k[1], b = a + 1.5; for (let j = 0; j < len / 2; j++) { b += (R() - 0.5); bx += Math.cos(b) * 9; by += Math.sin(b) * 9; g.lineTo(bx, by); }
    g.stroke();
  }
}
/** Wiederholbar: alles, was über den Rand ragt, auf der anderen Seite noch einmal malen */
function wrap(w, h, fn) { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); }

// ---------- Boden ----------
export function asphaltTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#4b4541'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 60000, '120,112,104', 0.05, 0.35, 1, 2.5);
    speckle(g, w, h, 30000, '20,16,14', 0.05, 0.3, 1, 2.5);
    for (let i = 0; i < 7; i++) { // ausgebesserte Flicken
      const x = R() * w, y = R() * h, pw = rr(60, 220), ph = rr(40, 160);
      wrap(w, h, (ox, oy) => {
        g.fillStyle = `rgba(${R() < 0.5 ? '30,27,26' : '78,72,66'},0.28)`; g.fillRect(x + ox, y + oy, pw, ph);
        g.strokeStyle = 'rgba(15,12,10,0.35)'; g.lineWidth = 1.5; g.strokeRect(x + ox, y + oy, pw, ph);
      });
    }
    for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h, r = rr(30, 110); wrap(w, h, (ox, oy) => blot(g, x + ox, y + oy, r, '12,8,6', 0.4)); }
    for (let i = 0; i < 10; i++) { const x = R() * w, y = R() * h, r = rr(40, 140); wrap(w, h, (ox, oy) => blot(g, x + ox, y + oy, r, '140,120,96', 0.16)); }
    for (let i = 0; i < 6; i++) { // Reifenspuren
      const x = R() * w; g.strokeStyle = 'rgba(12,10,9,0.18)'; g.lineWidth = 14;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rr(-80, 80), h * 0.3, x + rr(-80, 80), h * 0.7, x, h); g.stroke();
    }
    for (let i = 0; i < 40; i++) { const x = rr(60, w - 60), y = rr(60, h - 60); crack(g, x, y, ri(6, 16), rr(1.2, 3.5), 'rgba(14,10,8,0.85)'); }
    for (let i = 0; i < 40; i++) { const x = rr(60, w - 60), y = rr(60, h - 60); crack(g, x, y, ri(3, 8), rr(0.8, 1.6), 'rgba(160,150,140,0.25)'); }
  }, { rep: [12, 12] });
}

export function sidewalkTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const n = 4, s = w / n; // 4×4 Platten pro Kachel
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const v = ri(118, 140);
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`; g.fillRect(x * s, y * s, s, s);
      if (R() < 0.35) { g.fillStyle = 'rgba(20,16,12,0.22)'; g.fillRect(x * s, y * s, s, s); }
    }
    speckle(g, w, h, 20000, '60,52,44', 0.05, 0.3, 1, 2);
    speckle(g, w, h, 8000, '200,190,170', 0.05, 0.2, 1, 2);
    g.strokeStyle = 'rgba(30,26,20,0.9)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    g.strokeStyle = 'rgba(72,92,40,0.7)'; g.lineWidth = 4; // Moos in den Fugen
    for (let i = 0; i < 30; i++) { const a = ri(0, n), b = rr(0, w), l = rr(10, 60); g.beginPath(); if (R() < 0.5) { g.moveTo(a * s, b); g.lineTo(a * s, b + l); } else { g.moveTo(b, a * s); g.lineTo(b + l, a * s); } g.stroke(); }
    for (let i = 0; i < 12; i++) crack(g, rr(20, w - 20), rr(20, h - 20), ri(3, 7), rr(1, 2.2), 'rgba(20,14,10,0.8)');
    for (let i = 0; i < 8; i++) blot(g, R() * w, R() * h, rr(20, 60), '20,14,10', 0.35);
  });
}

// ---------- Fassaden-Atlas ----------
// 4×4 Felder à 256 px = ein Fensterfeld (≈ 3 m breit, 3,3 m hoch). Reihen 0–2: Stockwerke, Reihe 3: Erdgeschoss.
export const ATLAS = { cols: 4, rows: 4 };
export const FACADES = [
  { name: 'putz', wall: [168, 150, 128], trim: '#d8cbb4', frame: '#3a2e26', brick: false },
  { name: 'ziegel', wall: [126, 64, 48], trim: '#bba78a', frame: '#2a2420', brick: true },
  { name: 'beton', wall: [122, 122, 118], trim: '#a29f96', frame: '#2c2e30', brick: false },
  { name: 'gelb', wall: [176, 146, 88], trim: '#e2d2a8', frame: '#3c2a1c', brick: false },
];

function wallFill(g, x, y, s, f) {
  const [r, gg, b] = f.wall;
  g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(x, y, s, s);
  if (f.brick) {
    for (let row = 0; row < s / 8; row++) for (let c = 0; c < s / 32 + 1; c++) {
      const v = rr(-18, 14), off = row % 2 ? 16 : 0;
      g.fillStyle = `rgb(${r + v},${gg + v * 0.6},${b + v * 0.5})`;
      g.fillRect(x + c * 32 - off, y + row * 8, 30, 6);
    }
    g.fillStyle = 'rgba(0,0,0,0)';
  } else {
    for (let i = 0; i < 900; i++) { const v = rr(-14, 14); g.fillStyle = `rgba(${r + v},${gg + v},${b + v},0.6)`; g.fillRect(x + R() * s, y + R() * s, rr(2, 6), rr(2, 6)); }
    for (let i = 0; i < 3; i++) { // abgeplatzter Putz: Ziegel schauen durch
      if (R() > 0.55) continue;
      const px = x + rr(10, s - 70), py = y + rr(10, s - 60), pw = rr(24, 60), ph = rr(18, 46);
      g.save(); g.beginPath(); g.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, rr(-0.5, 0.5), 0, TAU); g.clip();
      g.fillStyle = '#7a4636'; g.fillRect(px, py, pw, ph);
      g.fillStyle = '#5c3428'; for (let k = 0; k < ph / 7; k++) g.fillRect(px, py + k * 7, pw, 1.5);
      g.restore();
      g.strokeStyle = 'rgba(40,30,24,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, TAU); g.stroke();
    }
  }
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(20,14,10,${rr(0.04, 0.18)})`; g.fillRect(x + R() * s, y + R() * s, 2, 2); }
}

function windowCell(g, x, y, s, f, kind) {
  const ww = s * 0.42, wh = s * 0.52, wx = x + (s - ww) / 2, wy = y + s * 0.2;
  // Schmutzschlieren unter dem Fenster
  for (let i = 0; i < 4; i++) {
    const sx = wx + rr(0, ww), gr = g.createLinearGradient(0, wy + wh, 0, wy + wh + rr(40, 110));
    gr.addColorStop(0, 'rgba(25,18,12,0.35)'); gr.addColorStop(1, 'rgba(25,18,12,0)');
    g.fillStyle = gr; g.fillRect(sx, wy + wh, rr(3, 10), 110);
  }
  if (kind === 'zu') { // zugemauert
    g.fillStyle = '#6e6a62'; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#5a564e'; for (let k = 0; k < wh / 12; k++) for (let c = 0; c < 4; c++) g.fillRect(wx + c * ww / 4 + (k % 2 ? 6 : 0), wy + k * 12, ww / 4 - 3, 9);
  } else {
    // Laibung (Tiefe) + Rahmen
    g.fillStyle = '#16110e'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    const lit = kind === 'licht';
    const gr = g.createLinearGradient(0, wy, 0, wy + wh);
    if (lit) { gr.addColorStop(0, '#ffcf7a'); gr.addColorStop(1, '#c46a2a'); }
    else { gr.addColorStop(0, '#2a2e36'); gr.addColorStop(0.5, '#15171c'); gr.addColorStop(1, '#0c0b0c'); }
    g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
    if (kind === 'vorhang' || lit) { // zerrissener Vorhang
      g.fillStyle = lit ? 'rgba(120,40,20,0.7)' : '#4a3a44';
      g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + ww * 0.45, wy); g.lineTo(wx + ww * 0.3, wy + wh * 0.6); g.lineTo(wx + ww * 0.12, wy + wh * 0.9); g.lineTo(wx, wy + wh); g.fill();
    }
    if (kind === 'glas' || kind === 'vorhang') { // Spiegelung im Glas
      g.fillStyle = 'rgba(200,150,120,0.18)'; g.beginPath(); g.moveTo(wx, wy + wh * 0.6); g.lineTo(wx + ww * 0.6, wy); g.lineTo(wx + ww * 0.85, wy); g.lineTo(wx, wy + wh * 0.95); g.fill();
    }
    if (kind === 'kaputt') { // zerbrochene Scheibe: Splitter am Rand
      g.fillStyle = 'rgba(170,150,140,0.55)';
      for (let i = 0; i < 6; i++) { const ex = wx + (R() < 0.5 ? 0 : ww), ey = wy + rr(0, wh); g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + (ex === wx ? 1 : -1) * rr(8, 28), ey + rr(-10, 10)); g.lineTo(ex, ey + rr(8, 22)); g.fill(); }
    }
    // Fensterkreuz
    g.fillStyle = f.frame;
    g.fillRect(wx, wy, ww, 5); g.fillRect(wx, wy + wh - 5, ww, 5); g.fillRect(wx, wy, 5, wh); g.fillRect(wx + ww - 5, wy, 5, wh);
    if (kind !== 'kaputt') { g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.38, ww, 4); }
    if (kind === 'bretter') {
      for (let i = 0; i < 4; i++) {
        g.save(); g.translate(wx + ww / 2, wy + wh * (0.15 + i * 0.23)); g.rotate(rr(-0.18, 0.18));
        const v = ri(90, 125); g.fillStyle = `rgb(${v},${v * 0.72 | 0},${v * 0.48 | 0})`; g.fillRect(-ww * 0.62, -9, ww * 1.24, 18);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-ww * 0.62, 6, ww * 1.24, 3);
        g.fillStyle = '#222'; g.fillRect(-ww * 0.55, -2, 3, 3); g.fillRect(ww * 0.52, -2, 3, 3);
        g.restore();
      }
    }
  }
  // Sims und Sturz
  g.fillStyle = f.trim; g.fillRect(wx - 10, wy + wh + 4, ww + 20, 9); g.fillRect(wx - 6, wy - 14, ww + 12, 8);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wx - 10, wy + wh + 13, ww + 20, 4);
}

const GRAFFITI = ['ASCHE', 'KEIN GOTT', 'LAUF', 'XIII', 'NIE VERGESSEN', '♠♥♦♣', 'DIE BANK GEWINNT', 'HUNDE!', 'SPIELER?', '13'];
const GCOL = ['#c23a2a', '#e0b23a', '#3a8ac2', '#e6e0d0', '#7ac23a', '#c23aa0'];
function graffiti(g, x, y, s) {
  g.save(); g.translate(x, y); g.rotate(rr(-0.12, 0.08));
  const t = GRAFFITI[ri(0, GRAFFITI.length - 1)];
  g.font = `bold ${ri(26, 40)}px Impact, Arial Black, sans-serif`;
  g.lineWidth = 6; g.strokeStyle = 'rgba(15,10,10,0.85)'; g.strokeText(t, 0, 0);
  g.fillStyle = GCOL[ri(0, GCOL.length - 1)]; g.fillText(t, 0, 0);
  g.restore();
  if (s) for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(180,40,30,0.5)'; g.fillRect(x + rr(0, 100), y + 4, 2, rr(6, 30)); }
}

function groundCell(g, x, y, s, f, kind) {
  const ox = x + s * 0.1, ow = s * 0.8, oy = y + s * 0.18, oh = s * 0.82;
  g.fillStyle = '#18120f'; g.fillRect(ox - 6, oy - 6, ow + 12, oh + 6);
  if (kind === 'rollo' || kind === 'halb') {
    const top = kind === 'halb' ? oh * 0.55 : oh;
    if (kind === 'halb') { g.fillStyle = '#090807'; g.fillRect(ox, oy, ow, oh); }
    for (let k = 0; k < top / 7; k++) { const v = ri(92, 118); g.fillStyle = `rgb(${v},${v - 6},${v - 12})`; g.fillRect(ox, oy + k * 7, ow, 6); }
    for (let i = 0; i < 10; i++) blot(g, ox + R() * ow, oy + R() * top, rr(10, 30), '120,54,20', 0.5); // Rost
    if (R() < 0.8) graffiti(g, ox + rr(4, 40), oy + top * rr(0.4, 0.8), true);
    g.fillStyle = '#2a2622'; g.fillRect(ox - 4, oy - 12, ow + 8, 12);
  } else if (kind === 'tuer') {
    g.fillStyle = '#3a2618'; g.fillRect(ox + ow * 0.28, oy + oh * 0.05, ow * 0.44, oh * 0.95);
    g.fillStyle = '#2a1a10'; g.fillRect(ox + ow * 0.32, oy + oh * 0.12, ow * 0.36, oh * 0.3); g.fillRect(ox + ow * 0.32, oy + oh * 0.5, ow * 0.36, oh * 0.4);
    g.fillStyle = '#b08a40'; g.fillRect(ox + ow * 0.64, oy + oh * 0.55, 6, 6);
    for (const sx of [ox, ox + ow * 0.72]) { g.fillStyle = '#0d0b0a'; g.fillRect(sx, oy + 10, ow * 0.28, oh * 0.5); g.fillStyle = f.frame; g.fillRect(sx, oy + 10, ow * 0.28, 4); }
    if (R() < 0.6) graffiti(g, ox + rr(0, 30), oy + oh * 0.85, false);
  } else { // kaputtes Schaufenster
    const gr = g.createLinearGradient(0, oy, 0, oy + oh); gr.addColorStop(0, '#1f2226'); gr.addColorStop(1, '#070606');
    g.fillStyle = gr; g.fillRect(ox, oy, ow, oh);
    g.fillStyle = 'rgba(190,170,160,0.5)';
    for (let i = 0; i < 9; i++) { const ex = ox + rr(0, ow), ey = oy + (R() < 0.5 ? 0 : oh); g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + rr(-14, 14), ey + (ey === oy ? 1 : -1) * rr(20, 70)); g.lineTo(ex + rr(8, 26), ey); g.fill(); }
    g.fillStyle = '#3a3430'; for (let i = 0; i < 3; i++) g.fillRect(ox + 10 + i * ow * 0.3, oy + oh * 0.7, ow * 0.2, oh * 0.3); // Regalreste
    g.fillStyle = f.frame; g.fillRect(ox, oy, ow, 6); g.fillRect(ox + ow / 2 - 3, oy, 6, oh);
    if (kind === 'brett') {
      for (let i = 0; i < 3; i++) { g.save(); g.translate(ox + ow / 2, oy + oh * (0.25 + i * 0.25)); g.rotate(rr(-0.25, 0.25)); const v = ri(90, 120); g.fillStyle = `rgb(${v},${v * 0.7 | 0},${v * 0.45 | 0})`; g.fillRect(-ow * 0.58, -12, ow * 1.16, 24); g.restore(); }
      if (R() < 0.7) graffiti(g, ox + rr(0, 40), oy + oh * 0.45, false);
    }
  }
  // Sockel mit Ruß
  const gr = g.createLinearGradient(0, y + s * 0.7, 0, y + s); gr.addColorStop(0, 'rgba(10,6,4,0)'); gr.addColorStop(1, 'rgba(10,6,4,0.5)');
  g.fillStyle = gr; g.fillRect(x, y, s, s);
}

export function facadeAtlas(f) {
  return canvasTex(1024, 1024, (g) => {
    const s = 256;
    const up = ['glas', 'glas', 'kaputt', 'kaputt', 'bretter', 'vorhang', 'zu', 'licht', 'glas', 'kaputt', 'bretter', 'vorhang'];
    const dn = ['rollo', 'tuer', 'schaufenster', 'brett'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * s, y = r * s;
      wallFill(g, x, y, s, f);
      if (r < 3) windowCell(g, x, y, s, f, up[r * 4 + c]);
      else groundCell(g, x, y, s, f, dn[c]);
    }
  }, { clamp: true });
}
/** Welche Atlas-Felder leuchten (für Lichter in der Nacht) */
export const LIT_CELL = 7; // Index in Reihe 0–2 (r*4+c)

export function roofTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a3634'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, '90,84,78', 0.1, 0.5, 1, 2);
    for (let i = 0; i < 8; i++) blot(g, R() * w, R() * h, rr(20, 60), '20,30,14', 0.35);
    for (let i = 0; i < 5; i++) blot(g, R() * w, R() * h, rr(10, 40), '60,80,30', 0.3);
  });
}

export function concreteTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a857c'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 8000, '60,56,50', 0.1, 0.35, 1, 2);
    speckle(g, w, h, 4000, '170,165,155', 0.1, 0.3, 1, 2);
    for (let i = 0; i < 10; i++) blot(g, R() * w, R() * h, rr(14, 50), '30,24,18', 0.3);
    for (let i = 0; i < 5; i++) crack(g, rr(20, w - 20), rr(20, h - 20), ri(3, 6), 1.4, 'rgba(30,24,18,0.7)');
  });
}

/** Lack mit Rost und Dreck (für Autowracks, Container) */
export function rustTex(base) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, '0,0,0', 0.03, 0.12, 1, 3);
    for (let i = 0; i < 22; i++) blot(g, R() * w, R() * h, rr(8, 40), '118,52,20', rr(0.4, 0.8));
    for (let i = 0; i < 10; i++) blot(g, R() * w, R() * h, rr(6, 20), '70,30,12', 0.7);
    for (let i = 0; i < 6; i++) blot(g, R() * w, R() * h, rr(20, 60), '20,16,12', 0.35);
    speckle(g, w, h, 1500, '150,80,40', 0.2, 0.6, 1, 3);
  });
}

export function woodTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#6a4a30'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${R() < 0.5 ? '40,26,16' : '120,90,60'},${rr(0.05, 0.25)})`; g.fillRect(0, y, w, 1 + R() * 2); }
    for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(30,18,10,0.6)'; g.beginPath(); g.ellipse(R() * w, R() * h, rr(3, 8), rr(1.5, 3), 0, 0, TAU); g.stroke(); }
    for (let i = 0; i < 6; i++) blot(g, R() * w, R() * h, rr(8, 30), '20,24,20', 0.3);
  });
}

// ---------- Unkraut (Alpha) ----------
export function weedTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = rr(20, w - 20), hh = rr(h * 0.35, h * 0.95), bend = rr(-40, 40);
      const c = R() < 0.4 ? [rr(110, 140) | 0, rr(96, 120) | 0, 58] : [rr(58, 84) | 0, rr(76, 100) | 0, rr(34, 48) | 0];
      g.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.lineWidth = rr(3, 7); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + bend * 0.3, h - hh * 0.6, x + bend, h - hh); g.stroke();
    }
    for (let i = 0; i < 8; i++) { // ein paar trockene Rispen
      const x = rr(40, w - 40), y = rr(h * 0.1, h * 0.4);
      g.fillStyle = 'rgba(170,150,90,0.9)'; for (let k = 0; k < 9; k++) g.fillRect(x + rr(-8, 8), y + k * 4, 3, 3);
    }
  }, { clamp: true });
}

export function ivyTex() {
  return canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let v = 0; v < 7; v++) {
      let x = rr(20, w - 20), y = 0;
      const len = rr(h * 0.4, h);
      while (y < len) {
        x += rr(-6, 6); y += 6;
        g.fillStyle = 'rgb(48,38,26)'; g.fillRect(x, y, 3, 7);
        if (R() < 0.8) for (let k = 0; k < 2; k++) {
          const lx = x + rr(-22, 22), ly = y + rr(-10, 10), gcol = R() < 0.2 ? [110, 90, 40] : [rr(40, 75) | 0, rr(70, 110) | 0, rr(30, 50) | 0];
          g.fillStyle = `rgb(${gcol[0]},${gcol[1]},${gcol[2]})`; g.beginPath(); g.ellipse(lx, ly, rr(6, 11), rr(4, 8), R() * 3, 0, TAU); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(lx + 1, ly + 2, 4, 3, 0, 0, TAU); g.fill();
        }
      }
    }
  }, { clamp: true });
}

export function paperTex() {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#d8ccb0'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(40,30,20,0.6)'; for (let y = 8; y < 60; y += 6) g.fillRect(6, y, rr(30, 52), 2);
    blot(g, 40, 40, 30, '90,70,40', 0.4);
  });
}

// ---------- Schilder ----------
export function signTex(text, bg, fg, w = 512, h = 128, opt = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1800, '0,0,0', 0.05, 0.25, 1, 4);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    let fs = h * 0.56;
    g.font = `bold ${fs}px ${opt.serif ? 'Georgia, serif' : 'Arial Black, Impact, sans-serif'}`;
    while (g.measureText(text).width > w - 50 && fs > 10) { fs -= 2; g.font = `bold ${fs}px ${opt.serif ? 'Georgia, serif' : 'Arial Black, Impact, sans-serif'}`; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    // fehlende Buchstaben: ein paar Zeichen verblasst
    let x = w / 2 - g.measureText(text).width / 2;
    g.textAlign = 'left';
    for (const ch of text) { g.globalAlpha = R() < 0.12 ? 0.25 : 1; g.fillText(ch, x, h / 2 + 2); x += g.measureText(ch).width; }
    g.globalAlpha = 1;
    for (let i = 0; i < 8; i++) blot(g, R() * w, R() * h, rr(10, 40), '110,50,20', 0.5);
    for (let i = 0; i < 3; i++) blot(g, R() * w, R() * h, rr(20, 60), '10,8,6', 0.4);
  }, { clamp: true });
}

// ---------- Himmel & Ferne ----------
export function skyTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1c1424'); gr.addColorStop(0.32, '#4a2a38'); gr.addColorStop(0.5, '#a04e34'); gr.addColorStop(0.56, '#e08a48');
    gr.addColorStop(0.6, '#b2603a'); gr.addColorStop(0.75, '#4a2a24'); gr.addColorStop(1, '#1a1210');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // Sonne hinter Dunst
    blot(g, w * 0.3, h * 0.53, 160, '255,190,120', 0.55); blot(g, w * 0.3, h * 0.53, 40, '255,236,200', 0.95);
    // Wolkenbänder
    for (let i = 0; i < 60; i++) {
      const y = rr(h * 0.08, h * 0.5), x = R() * w, rw = rr(80, 280), rh = rr(6, 22);
      const lit = y > h * 0.35;
      g.fillStyle = lit ? `rgba(230,130,80,${rr(0.15, 0.4)})` : `rgba(20,12,20,${rr(0.2, 0.5)})`;
      wrap(w, 0, (ox) => { g.beginPath(); g.ellipse(x + ox, y, rw, rh, 0, 0, TAU); g.fill(); });
    }
    speckle(g, w, h * 0.3, 160, '255,240,220', 0.2, 0.7, 1, 2); // ein paar Sterne oben
  }, { clamp: false });
}

/** Silhouette der Ruinen-Skyline (Alpha), wird im Kreis um die Stadt gestellt; unten im Dunst verblassend */
export function skylineTex(col, haze, seed, dense) {
  const r = seeded(seed);
  return canvasTex(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 24 + r() * 70, tall = r() < 0.18, bh = h * (tall ? 0.55 + r() * 0.4 : 0.12 + r() * 0.35);
      if (r() < 0.25 * (1 - dense)) { x += bw * 0.6; continue; } // Lücke
      g.fillStyle = col;
      g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - bh);
      const steps = 2 + Math.floor(r() * 4);
      for (let i = 1; i <= steps; i++) g.lineTo(x + (bw * i) / steps, h - bh + (r() - 0.25) * bh * (tall ? 0.35 : 0.15));
      g.lineTo(x + bw, h); g.fill();
      if (tall && r() < 0.6) { // Stahlgerippe an der Abbruchkante
        g.strokeStyle = col; g.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const sx = x + r() * bw; g.beginPath(); g.moveTo(sx, h - bh + 6); g.lineTo(sx + (r() - 0.5) * 10, h - bh - 8 - r() * 22); g.stroke(); }
      }
      if (r() < 0.2) g.fillRect(x + bw * 0.4, h - bh - 24 - r() * 30, 2, 34); // Antenne/Kran
      g.fillStyle = 'rgba(255,150,70,0.55)';
      for (let i = 0; i < 6; i++) if (r() < 0.25) g.fillRect(x + 4 + r() * (bw - 8), h - r() * bh * 0.9, 2, 2);
      x += bw + r() * 4;
    }
    // Dunst: nach unten in die Nebelfarbe übergehen
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, haze.replace('A', '0.25')); gr.addColorStop(1, haze.replace('A', '0.95'));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }, { clamp: false });
}

export function glowTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, { clamp: true });
}

export function smokeTex() {
  return canvasTex(128, 128, (g) => {
    for (let i = 0; i < 14; i++) blot(g, 64 + rr(-26, 26), 64 + rr(-26, 26), rr(20, 40), '255,255,255', 0.22);
  }, { clamp: true });
}

/** Maschendraht (Alpha) */
export function fenceTex() {
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(150,150,140,1)'; g.lineWidth = 2;
    for (let i = -128; i < 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); }
    for (let i = 0; i < 8; i++) blot(g, R() * 128, R() * 128, 16, '120,60,20', 0.6);
  });
}

/** Planen (Zelte) */
export function tarpTex(col) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2000, '0,0,0', 0.05, 0.2, 1, 3);
    for (let i = 0; i < 6; i++) blot(g, R() * w, R() * h, rr(10, 30), '20,16,10', 0.4);
    g.fillStyle = 'rgba(0,0,0,0.15)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
  });
}

// =====================================================================================
// Stufe 2: Texturen mit Relief (Normal-Maps) für Mauern, Fenster und Boden
// =====================================================================================

/** Wertrauschen (kachelbar), Größe n×n, Zellen c, mehrere Oktaven → Float32Array 0..1 */
export function fbm(n, cells, oct = 4, seed = 1) {
  const r = seeded(seed), out = new Float32Array(n * n);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const c = cells << o, g = new Float32Array(c * c);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = (x / n) * c, fy = (y / n) * c, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % c) * c + (x0 % c)], b = g[(y0 % c) * c + ((x0 + 1) % c)], d = g[((y0 + 1) % c) * c + (x0 % c)], e = g[((y0 + 1) % c) * c + ((x0 + 1) % c)];
      out[y * n + x] += amp * (a + (b - a) * sx + (d - a) * sy + (a - b - d + e) * sx * sy);
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/** Höhenfeld (Float32, w×h, kachelbar) → Normal-Map-Textur */
export function normalTex(hf, w, h, strength = 2, rep) {
  return canvasTex(w, h, (g) => {
    const img = g.createImageData(w, h), d = img.data;
    const H = (x, y) => hf[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { linear: true, rep });
}

/** Höhenfeld aus einer Canvas-Zeichnung (Graustufen) holen */
function heightOf(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); draw(g, w, h);
  const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

/**
 * Mauer-Material je Stil (kachelbar, 1 Kachel = 2 × 2 m): Farbe + Relief.
 * Stile: 'ziegel' (Ziegel mit Fugen), 'putz' (Putz mit Abplatzern), 'beton' (Platten), 'gelb' (Putz gelb), 'klinker' (dunkle Ziegel)
 */
export const WALLS = {
  ziegel: { base: [128, 62, 46], brick: true },
  klinker: { base: [92, 52, 44], brick: true },
  putz: { base: [170, 152, 130], brick: false },
  gelb: { base: [178, 146, 92], brick: false },
  beton: { base: [128, 126, 120], panel: true },
  gruen: { base: [112, 128, 112], brick: false },
};
export function wallMaterialTex(kind, seed = 3) {
  const S = 512, st = WALLS[kind], r = seeded(seed);
  const noise = fbm(S, 4, 5, seed), fine = fbm(S, 32, 3, seed + 7);
  // Ziegelraster: 0,25 m × 0,0833 m → 64 × 21,3 px; wir nehmen 64 × 21 und 24 Reihen (= 504 px) + Rest Fuge
  const BW = 64, BH = 512 / 24;
  const hf = heightOf(S, S, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    if (st.brick) {
      g.fillStyle = '#303030'; g.fillRect(0, 0, S, S);
      for (let row = 0; row < 24; row++) for (let c = -1; c < S / BW + 1; c++) {
        const off = row % 2 ? BW / 2 : 0, v = 150 + Math.floor(r() * 70);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(c * BW + off + 2, row * BH + 2, BW - 4, BH - 3);
        if (r() < 0.15) { g.fillStyle = '#505050'; g.fillRect(c * BW + off + 2 + r() * 40, row * BH + 2, 10 + r() * 14, BH - 3); } // abgeplatzt
      }
    } else if (st.panel) {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = '#909090'; g.fillRect(x * 256 + 3, y * 256 + 3, 250, 250); }
      g.fillStyle = '#404040'; for (let i = 0; i < 2; i++) { g.fillRect(i * 256, 0, 4, S); g.fillRect(0, i * 256, S, 4); }
      for (let i = 0; i < 300; i++) { g.fillStyle = '#505050'; g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 2.5, 0, TAU); g.fill(); } // Lunker
    } else {
      // Putz: Kellenschläge, Risse, Abplatzer
      for (let i = 0; i < 9; i++) {
        if (r() > 0.6) continue;
        const x = r() * S, y = r() * S, rw = 30 + r() * 70, rh = 20 + r() * 50;
        g.fillStyle = '#4a4a4a'; g.beginPath(); g.ellipse(x, y, rw, rh, r() * 3, 0, TAU); g.fill();
        g.save(); g.beginPath(); g.ellipse(x, y, rw - 4, rh - 4, 0, 0, TAU); g.clip();
        for (let row = 0; row < 40; row++) for (let c = 0; c < 10; c++) { const v = 90 + r() * 40; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(c * BW + (row % 2) * 32 - 64 + x % 64, row * BH + 2, BW - 4, BH - 3); }
        g.restore();
      }
    }
    // Risse
    g.strokeStyle = '#202020'; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) { let x = r() * S, y = r() * S, a = r() * TAU; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 12; j++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); }
  });
  for (let i = 0; i < hf.length; i++) hf[i] = hf[i] * 0.85 + noise[i] * 0.08 + fine[i] * 0.07;
  const map = canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S), d = img.data, [br, bg, bb] = st.base;
    for (let i = 0; i < hf.length; i++) {
      const h = hf[i], n = noise[i], f = fine[i];
      let k = 0.72 + n * 0.45 + (f - 0.5) * 0.18;
      let R = br * k, G = bg * k, B = bb * k;
      if (st.brick && h < 0.33) { R = G = B = 150 * k; } // helle Fugen
      if (!st.brick && !st.panel && h < 0.55 && h > 0.25) { R = 120 * k; G = 64 * k; B = 50 * k; } // Ziegel unter dem Putz
      if (h < 0.2) { R *= 0.5; G *= 0.5; B *= 0.5; }
      const dirt = Math.max(0, n - 0.55) * 1.2; // Flecken
      R *= 1 - dirt * 0.5; G *= 1 - dirt * 0.45; B *= 1 - dirt * 0.4;
      const j = i * 4; d[j] = R; d[j + 1] = G; d[j + 2] = B; d[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Schlieren (nach unten laufender Dreck)
    for (let i = 0; i < 14; i++) {
      const x = r() * S, gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, 'rgba(30,20,14,0.0)'); gr.addColorStop(0.3 + r() * 0.4, 'rgba(30,20,14,0.22)'); gr.addColorStop(1, 'rgba(30,20,14,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 4 + r() * 14, S);
    }
  });
  return { map, normalMap: normalTex(hf, S, S, st.brick ? 6 : 3.5) };
}

/** Fenster-Atlas (was man in der Fensternische sieht): 4 × 2 Felder à 128 × 192 */
export const WIN_KINDS = ['glas', 'kaputt', 'bretter', 'vorhang', 'licht', 'leer', 'blech', 'glas2'];
export function windowAtlasTex() {
  const CW = 128, CH = 192;
  return canvasTex(CW * 4, CH * 2, (g) => {
    WIN_KINDS.forEach((k, i) => {
      const x = (i % 4) * CW, y = Math.floor(i / 4) * CH;
      g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip();
      // Innenraum dunkel mit Andeutung von Raum
      const gr = g.createLinearGradient(0, y, 0, y + CH);
      if (k === 'licht') { gr.addColorStop(0, '#ffd88a'); gr.addColorStop(1, '#c0602a'); }
      else { gr.addColorStop(0, '#20232a'); gr.addColorStop(0.6, '#121318'); gr.addColorStop(1, '#0a0909'); }
      g.fillStyle = gr; g.fillRect(x, y, CW, CH);
      if (k === 'leer' || k === 'kaputt') { g.fillStyle = 'rgba(60,50,44,0.6)'; g.fillRect(x + 10, y + CH * 0.62, CW * 0.5, CH * 0.38); g.fillRect(x + CW * 0.65, y + CH * 0.3, 18, CH * 0.7); } // Möbelreste
      if (k === 'glas' || k === 'glas2' || k === 'vorhang') { // Spiegelung
        g.fillStyle = 'rgba(220,160,120,0.20)'; g.beginPath(); g.moveTo(x, y + CH * 0.65); g.lineTo(x + CW * 0.75, y); g.lineTo(x + CW, y); g.lineTo(x + CW, y + CH * 0.08); g.lineTo(x, y + CH * 0.95); g.fill();
        if (k === 'glas2') { g.fillStyle = 'rgba(200,180,160,0.25)'; g.fillRect(x, y, CW, CH); }
      }
      if (k === 'vorhang' || k === 'licht') { // zerrissene Vorhänge
        g.fillStyle = k === 'licht' ? 'rgba(130,40,24,0.75)' : '#4a3a44';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + CW * 0.4, y); g.lineTo(x + CW * 0.28, y + CH * 0.55); g.lineTo(x + CW * 0.1, y + CH * 0.85); g.lineTo(x, y + CH); g.fill();
        g.beginPath(); g.moveTo(x + CW, y); g.lineTo(x + CW * 0.72, y); g.lineTo(x + CW * 0.85, y + CH * 0.4); g.lineTo(x + CW, y + CH * 0.5); g.fill();
      }
      if (k === 'kaputt') { // Scherben am Rand
        g.fillStyle = 'rgba(190,170,160,0.6)';
        for (let s = 0; s < 7; s++) { const ex = x + (R() < 0.5 ? 0 : CW), ey = y + rr(0, CH); g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + (ex === x ? 1 : -1) * rr(10, 36), ey + rr(-14, 14)); g.lineTo(ex, ey + rr(10, 30)); g.fill(); }
      }
      if (k === 'bretter') {
        for (let b = 0; b < 5; b++) {
          g.save(); g.translate(x + CW / 2, y + CH * (0.12 + b * 0.19)); g.rotate(rr(-0.2, 0.2));
          const v = ri(88, 128); g.fillStyle = `rgb(${v},${v * 0.7 | 0},${v * 0.46 | 0})`; g.fillRect(-CW * 0.7, -12, CW * 1.4, 24);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-CW * 0.7, 9, CW * 1.4, 3); g.fillStyle = 'rgba(255,230,190,0.15)'; g.fillRect(-CW * 0.7, -12, CW * 1.4, 3);
          g.fillStyle = '#1a1a1a'; g.fillRect(-CW * 0.6, -2, 4, 4); g.fillRect(CW * 0.55, -2, 4, 4);
          g.restore();
        }
      }
      if (k === 'blech') { // Wellblech, rostig
        for (let s = 0; s < CW; s += 8) { const v = 110 + (s % 16 ? 20 : 0); g.fillStyle = `rgb(${v},${v - 8},${v - 18})`; g.fillRect(x + s, y, 8, CH); }
        for (let s = 0; s < 8; s++) blot(g, x + rr(0, CW), y + rr(0, CH), rr(10, 30), '120,54,20', 0.6);
      }
      g.restore();
    });
  }, { clamp: true });
}

/** Ladenfront-Atlas: 4 Felder à 256 × 256 (Rollladen mit Graffiti, kaputtes Schaufenster, Tür mit Brettern, dunkle Öffnung) */
export const SHOP_KINDS = ['rollo', 'schaufenster', 'tuer', 'offen'];
export function shopAtlasTex() {
  const C = 256;
  return canvasTex(C * 4, C, (g) => {
    SHOP_KINDS.forEach((k, i) => {
      const x = i * C;
      g.save(); g.beginPath(); g.rect(x, 0, C, C); g.clip();
      g.fillStyle = '#0b0a0a'; g.fillRect(x, 0, C, C);
      if (k === 'rollo') {
        for (let s = 0; s < C; s += 9) { const v = ri(88, 118); g.fillStyle = `rgb(${v},${v - 6},${v - 12})`; g.fillRect(x, s, C, 8); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, s + 7, C, 2); }
        for (let s = 0; s < 12; s++) blot(g, x + R() * C, R() * C, rr(10, 34), '120,54,20', 0.5);
        graffiti(g, x + rr(10, 40), C * rr(0.4, 0.75), true);
      } else if (k === 'schaufenster') {
        const gr = g.createLinearGradient(0, 0, 0, C); gr.addColorStop(0, '#1f2328'); gr.addColorStop(1, '#060505'); g.fillStyle = gr; g.fillRect(x, 0, C, C);
        g.fillStyle = '#2e2824'; for (let s = 0; s < 3; s++) g.fillRect(x + 14 + s * 80, C * 0.62, 56, C * 0.38);
        g.fillStyle = 'rgba(200,180,170,0.5)';
        for (let s = 0; s < 10; s++) { const ex = x + rr(0, C), ey = R() < 0.5 ? 0 : C; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + rr(-16, 16), ey + (ey ? -1 : 1) * rr(20, 80)); g.lineTo(ex + rr(8, 28), ey); g.fill(); }
        g.fillStyle = 'rgba(220,160,120,0.15)'; g.beginPath(); g.moveTo(x, C * 0.7); g.lineTo(x + C * 0.6, 0); g.lineTo(x + C * 0.8, 0); g.lineTo(x, C); g.fill();
      } else if (k === 'tuer') {
        g.fillStyle = '#2a1a10'; g.fillRect(x, 0, C, C);
        g.fillStyle = '#3c2616'; g.fillRect(x + C * 0.3, C * 0.05, C * 0.4, C * 0.95);
        g.fillStyle = '#26170d'; g.fillRect(x + C * 0.34, C * 0.12, C * 0.32, C * 0.3); g.fillRect(x + C * 0.34, C * 0.5, C * 0.32, C * 0.42);
        g.fillStyle = '#b08a40'; g.fillRect(x + C * 0.62, C * 0.56, 6, 6);
        for (let b = 0; b < 2; b++) { g.save(); g.translate(x + C / 2, C * (0.35 + b * 0.3)); g.rotate(b ? 0.5 : -0.5); const v = ri(90, 120); g.fillStyle = `rgb(${v},${v * 0.7 | 0},${v * 0.45 | 0})`; g.fillRect(-C * 0.32, -10, C * 0.64, 20); g.restore(); }
        if (R() < 0.7) graffiti(g, x + 10, C * 0.88, false);
      } else {
        const gr = g.createRadialGradient(x + C / 2, C * 0.6, 10, x + C / 2, C * 0.6, C * 0.7); gr.addColorStop(0, '#1a1614'); gr.addColorStop(1, '#030303');
        g.fillStyle = gr; g.fillRect(x, 0, C, C);
        g.fillStyle = 'rgba(70,60,50,0.7)'; g.fillRect(x + 20, C * 0.8, C * 0.6, C * 0.2);
      }
      g.restore();
    });
  }, { clamp: true });
}

/** Relief für Asphalt und Gehweg (passend zu den Farb-Texturen nur ungefähr – Körnung, Risse, Fugen) */
export function asphaltNormal() {
  const S = 512, n = fbm(S, 64, 3, 11), c = fbm(S, 8, 3, 12);
  const hf = heightOf(S, S, (g) => {
    g.fillStyle = '#909090'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#202020'; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) { let x = R() * S, y = R() * S, a = R() * TAU; g.lineWidth = 1 + R() * 3; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 14; j++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 8; y += Math.sin(a) * 8; g.lineTo(x, y); } g.stroke(); }
  });
  for (let i = 0; i < hf.length; i++) hf[i] = hf[i] * 0.6 + n[i] * 0.3 + c[i] * 0.1;
  return normalTex(hf, S, S, 4);
}
export function sidewalkNormal() {
  const S = 512, n = fbm(S, 32, 3, 21);
  const hf = heightOf(S, S, (g) => {
    g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#303030'; for (let i = 0; i <= 4; i++) { g.fillRect(i * 128 - 2, 0, 5, S); g.fillRect(0, i * 128 - 2, S, 5); }
    for (let i = 0; i < 6; i++) { const x = Math.floor(R() * 4) * 128, y = Math.floor(R() * 4) * 128; g.fillStyle = `rgb(${R() < 0.5 ? 130 : 170},0,0)`; g.fillRect(x + 3, y + 3, 122, 122); } // gekippte Platten
  });
  for (let i = 0; i < hf.length; i++) hf[i] = hf[i] * 0.8 + n[i] * 0.2;
  return normalTex(hf, S, S, 4);
}
