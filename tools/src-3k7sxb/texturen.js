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
