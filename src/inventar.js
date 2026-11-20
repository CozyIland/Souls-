// 3D-Inventar (Reiter „Inventar“ im Menü): ein Sechseck aus rostigem Metall mit schillerndem Kristall (Bild bilder/inventar.jpg).
// In der Mitte schwebt die ausgerüstete Karte in 3D (models/herzass.glb), in drei der sechs äußeren Fassungen liegen
// die Waffe in der Hand, Heiltrank und Seelen. Mitte antippen / A → Kartenwahl, obere Fassung → Waffenwahl (Stockdegen,
// Kristallklinge – beide in 3D in der Mitte). Wählen → alt versinkt im Kristall, neu steigt wirbelnd auf (Lichtwelle, Funken,
// Klang). Ruhe: schwebt, wiegt sich, glimmt und dreht sich ab und zu einmal ganz herum. Ziehen (Maus/Finger) oder rechter Stick
// drehen von Hand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ladeModell, bildUrl } from './modelle.js';
import { sfx } from './ton.js';
import { WAFFEN, WAFFEN_IDS, schwertLaden, buildSchwert } from './waffen.js';
import { buildCane } from './degen.js';

export const KARTEN = [
  { id: 'herzass', n: 'Herz-Ass', glb: 'models/herzass.glb', mini: ['A', '♥'],
    d: 'Die erste Karte. Angesengt, aber ungebrochen – in ihrem Herzen glimmt noch Glut. Jede Karte, die du wirfst, trägt ihr Zeichen.' },
];
const UNBEKANNT = 4; // so viele noch verborgene Plätze zeigt die Kartenwahl

// Fassungen im Bild (Pixel im 1024er-Bild): Mitte, dann im Uhrzeigersinn ab oben; a = halbe Breite des Metallrings
const SOCK = [
  { x: 512, y: 515, a: 88 }, { x: 512, y: 212, a: 68 }, { x: 756, y: 364, a: 68 }, { x: 760, y: 660, a: 68 },
  { x: 512, y: 805, a: 68 }, { x: 262, y: 660, a: 68 }, { x: 265, y: 364, a: 68 },
];
const SLOT_ITEM = { 1: 'waffe', 3: 'trank', 5: 'seelen' }; // Dreieck: Waffe oben, Trank rechts unten, Seelen links unten
const W_LEN = 1.0, W_TILT = 0.35;  // Waffen in der Mitte: so lang (Welt) und so schräg gestellt
const CARD_H = 0.62, CARD_W = CARD_H * 1.33 / 1.9, CARD_Z = 0.42; // Größe der Karte (Welt), Abstand vor dem Kristall
const wx = (s) => (s.x / 1024 - 0.5) * 2, wy = (s) => (0.5 - s.y / 1024) * 2;

const eOut3 = (u) => 1 - Math.pow(1 - u, 3), eIn3 = (u) => u * u * u, eIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const eBack = (u, s) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
const cl01 = (x) => Math.max(0, Math.min(1, x));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ---------- Bilder (Canvas): Kartenrücken, verborgene Karte, Glut-Schein, Gegenstände ----------
function heartPath(g, x, y, s) {
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    g[i ? 'lineTo' : 'moveTo'](x + hx * s, y - hy * s);
  }
  g.closePath();
}
/** verkohlte, glimmende, ausgefranste Ränder wie beim Herz-Ass */
function burn(g, w, h, R, glut) {
  g.save(); g.globalCompositeOperation = 'source-atop';
  for (const [x0, y0, x1, y1] of [[0, 0, 0, 30], [0, h, 0, h - 30], [0, 0, 30, 0], [w, 0, w - 30, 0]]) {
    const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, 'rgba(18,7,2,0.95)'); lg.addColorStop(1, 'rgba(18,7,2,0)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
  }
  const atEdge = () => { const t = R(), s = (R() * 4) | 0; return s === 0 ? [t * w, 0] : s === 1 ? [w, t * h] : s === 2 ? [t * w, h] : [0, t * h]; };
  for (let i = 0; i < 240; i++) {
    const [x, y] = atEdge(), r = 8 + R() * 40, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(16,6,2,0.9)'); gr.addColorStop(0.55, 'rgba(38,15,5,0.45)'); gr.addColorStop(1, 'rgba(38,15,5,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 160; i++) { // Flecken und Kratzer
    g.fillStyle = `rgba(20,8,4,${0.05 + R() * 0.12})`; g.beginPath(); g.arc(R() * w, R() * h, 1 + R() * 4, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 120, y + (R() - 0.5) * 60); g.stroke(); }
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (glut ? 150 : 40); i++) {
    const [x, y] = atEdge(), r = 4 + R() * 16, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,${120 + R() * 80 | 0},40,${glut ? 0.75 : 0.3})`); gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.restore();
  // Umriss ausfransen
  const N = 120, m = 5, P = 2 * (w + h) - 8 * m, raw = Array.from({ length: N }, () => R()), pts = [];
  for (let i = 0; i < N; i++) {
    const s = (i / N) * P, d = (0.5 * raw[i] + 0.25 * (raw[(i + N - 1) % N] + raw[(i + 1) % N])) * 13;
    const W = w - 2 * m, H = h - 2 * m;
    if (s < W) pts.push([m + s, m + d]);
    else if (s < W + H) pts.push([w - m - d, m + s - W]);
    else if (s < 2 * W + H) pts.push([w - m - (s - W - H), h - m - d]);
    else pts.push([m + d, h - m - (s - 2 * W - H)]);
  }
  g.save(); g.globalCompositeOperation = 'destination-in'; g.beginPath();
  pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); g.restore();
}
/** Kartenrücken: dunkelrot, Goldrauten, Rahmen, Sonnen-Siegel mit Herz – oder (zu) eine verborgene Karte mit „?“ */
function backTex(zu) {
  const w = 512, h = 732, cv = canvas(w, h), g = cv.getContext('2d'), R = rng(zu ? 11 : 5);
  const bg = g.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, h * 0.72);
  bg.addColorStop(0, zu ? '#2c1418' : '#86202a'); bg.addColorStop(1, zu ? '#0d0507' : '#33060b');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const gold = g.createLinearGradient(0, 0, w, h);
  gold.addColorStop(0, zu ? '#8d7a5c' : '#f7d98a'); gold.addColorStop(0.5, zu ? '#5a4a34' : '#c08a32'); gold.addColorStop(1, zu ? '#7a6a50' : '#f0c766');
  g.strokeStyle = zu ? 'rgba(150,120,80,0.16)' : 'rgba(225,175,80,0.32)'; g.lineWidth = 2;
  for (let i = -h; i < w + h; i += 34) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.moveTo(i, 0); g.lineTo(i - h, h); g.stroke(); }
  g.strokeStyle = gold; g.lineWidth = 6; g.strokeRect(28, 28, w - 56, h - 56);
  g.lineWidth = 2; g.strokeRect(42, 42, w - 84, h - 84);
  g.fillStyle = gold;
  for (const [x, y] of [[42, 42], [w - 42, 42], [42, h - 42], [w - 42, h - 42]]) { g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); }
  const cx = w / 2, cy = h / 2;
  if (!zu) {
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < 24; i++) { g.rotate(Math.PI / 12); g.beginPath(); g.moveTo(-7, -100); g.lineTo(0, i % 2 ? -150 : -128); g.lineTo(7, -100); g.closePath(); g.fill(); }
    g.restore();
    g.strokeStyle = gold; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, 98, 0, 7); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 82, 0, 7); g.stroke();
    const hg = g.createRadialGradient(cx - 14, cy - 20, 4, cx, cy, 70); hg.addColorStop(0, '#ff5a4c'); hg.addColorStop(1, '#8c0c14');
    heartPath(g, cx, cy + 4, 3.4); g.fillStyle = hg; g.fill(); g.strokeStyle = gold; g.lineWidth = 4; g.stroke();
  } else {
    g.strokeStyle = gold; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 120, 0, 7); g.stroke();
    g.font = 'bold 220px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText('?', cx + 5, cy + 17);
    g.fillStyle = gold; g.fillText('?', cx, cy + 10);
  }
  burn(g, w, h, R, !zu);
  return tex(cv);
}
/** Glutschein rund um die Karte (innen leer, damit er die Karte nicht überdeckt) */
function haloTex(r, gC) {
  const w = 256, h = 340, cv = canvas(w, h), g = cv.getContext('2d');
  g.shadowColor = `rgb(${r},${gC},40)`; g.shadowBlur = 34; g.strokeStyle = `rgba(${r},${gC + 50},110,0.9)`; g.lineWidth = 5;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect ? g.roundRect(40, 40, 176, 260, 14) : g.rect(40, 40, 176, 260); g.stroke(); }
  return tex(cv);
}
function iconTex(kind) {
  const s = 256, cv = canvas(s, s), g = cv.getContext('2d'), c = s / 2;
  const glow = (col, r) => { const gr = g.createRadialGradient(c, c, 0, c, c, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); };
  glow('rgba(6,4,10,0.55)', 112); // dunkler Grund, damit das Bild vor dem Kristall lesbar bleibt
  if (kind === 'degen') {
    glow('rgba(255,210,150,0.28)', 118);
    g.translate(c, c); g.rotate(-Math.PI / 4);
    const bl = g.createLinearGradient(-8, 0, 8, 0); bl.addColorStop(0, '#5d636c'); bl.addColorStop(0.5, '#f4f6f8'); bl.addColorStop(1, '#7c838c');
    g.shadowColor = 'rgba(255,220,160,0.8)'; g.shadowBlur = 10;
    g.fillStyle = bl; g.beginPath(); g.moveTo(0, -116); g.lineTo(11, -92); g.lineTo(10, 22); g.lineTo(-10, 22); g.lineTo(-11, -92); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(60,64,72,0.7)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -88); g.lineTo(0, 16); g.stroke();
    const au = g.createLinearGradient(-26, 0, 26, 0); au.addColorStop(0, '#8a5a1c'); au.addColorStop(0.5, '#ffe08a'); au.addColorStop(1, '#8a5a1c');
    g.fillStyle = au; g.fillRect(-27, 22, 54, 12);
    g.fillStyle = '#4a2c18'; g.fillRect(-10, 34, 20, 58);
    g.fillStyle = au; for (const y of [44, 62, 80]) g.fillRect(-11, y, 22, 5);
    g.beginPath(); g.arc(0, 102, 13, 0, 7); g.fill();
  } else if (kind === 'schwert') {
    glow('rgba(170,150,255,0.4)', 120);
    g.translate(c, c); g.rotate(-Math.PI / 4);
    const bl = g.createLinearGradient(-12, 0, 12, 0); bl.addColorStop(0, '#7f8fd8'); bl.addColorStop(0.5, '#eef4ff'); bl.addColorStop(1, '#9a7fe0');
    g.shadowColor = 'rgba(170,200,255,0.9)'; g.shadowBlur = 14;
    g.fillStyle = bl; g.beginPath(); g.moveTo(0, -118); g.lineTo(14, -96); g.lineTo(13, 6); g.lineTo(18, 14); g.lineTo(-18, 14); g.lineTo(-13, 6); g.lineTo(-14, -96); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(120,230,220,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -100); g.lineTo(0, 4); g.stroke();
    const au = g.createLinearGradient(-36, 0, 36, 0); au.addColorStop(0, '#8a5a1c'); au.addColorStop(0.5, '#ffe08a'); au.addColorStop(1, '#8a5a1c');
    g.fillStyle = au; g.beginPath(); g.moveTo(-38, 10); g.lineTo(38, 10); g.lineTo(30, 26); g.lineTo(-30, 26); g.closePath(); g.fill();
    g.fillStyle = '#b05cff'; g.beginPath(); g.arc(0, 18, 6, 0, 7); g.fill();
    g.fillStyle = '#2a2230'; g.fillRect(-9, 26, 18, 56);
    g.fillStyle = au; g.beginPath(); g.arc(0, 90, 11, 0, 7); g.fill();
  } else if (kind === 'trank') {
    glow('rgba(255,120,40,0.42)', 120);
    g.save(); g.beginPath(); g.arc(c, 150, 60, 0, 7); g.clip();
    g.fillStyle = 'rgba(40,24,20,0.55)'; g.fillRect(0, 0, s, s);
    const lq = g.createRadialGradient(c - 12, 170, 4, c, 160, 70); lq.addColorStop(0, '#fff1a8'); lq.addColorStop(0.35, '#ffb347'); lq.addColorStop(1, '#c1360e');
    g.fillStyle = lq; g.fillRect(0, 128, s, s);
    g.fillStyle = 'rgba(255,240,200,0.6)'; g.fillRect(0, 126, s, 3);
    g.restore();
    g.fillStyle = 'rgba(200,220,230,0.25)'; g.fillRect(c - 15, 64, 30, 40);
    g.strokeStyle = 'rgba(230,240,245,0.75)'; g.lineWidth = 4;
    g.beginPath(); g.arc(c, 150, 60, -Math.PI / 2 + 0.28, Math.PI * 1.5 - 0.28); g.stroke();
    g.beginPath(); g.moveTo(c - 15, 93); g.lineTo(c - 15, 62); g.moveTo(c + 15, 93); g.lineTo(c + 15, 62); g.stroke();
    g.fillStyle = '#7a4a26'; g.fillRect(c - 19, 44, 38, 22); g.fillStyle = '#a06a3a'; g.fillRect(c - 19, 44, 38, 6);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 5; g.beginPath(); g.arc(c, 150, 46, Math.PI * 1.1, Math.PI * 1.35); g.stroke();
  } else if (kind === 'seelen') {
    glow('rgba(140,200,255,0.4)', 120);
    const fl = g.createRadialGradient(c, 158, 6, c, 140, 78); fl.addColorStop(0, '#ffffff'); fl.addColorStop(0.35, '#bfe6ff'); fl.addColorStop(1, 'rgba(90,150,255,0)');
    g.fillStyle = fl; g.beginPath(); g.moveTo(c, 34);
    g.bezierCurveTo(c + 22, 80, c + 66, 110, c + 58, 160); g.bezierCurveTo(c + 52, 204, c - 52, 204, c - 58, 160);
    g.bezierCurveTo(c - 64, 120, c - 24, 96, c - 6, 70); g.bezierCurveTo(c - 4, 100, c + 10, 70, c, 34); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(c, 162, 18, 0, 7); g.fill();
  }
  return tex(cv);
}

// ---------- Funken (Glut von den Kartenrändern, Lichtsplitter beim Ausrüsten, Kristallstaub) ----------
const PVS = `attribute float aSize; attribute vec4 aCol; varying vec4 vCol; uniform float uScale;
void main() { vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PFS = `varying vec4 vCol;
void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vCol.rgb, vCol.a * a * a);
  #include <colorspace_fragment>
}`;
class Funken {
  constructor(n) {
    this.n = n; this.list = [];
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: PVS, fragmentShader: PFS, uniforms: { uScale: { value: 500 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 4;
  }
  add(o) { if (this.list.length < this.n) this.list.push(Object.assign({ t: 0, drag: 0.6, up: 0.1, wob: 0, ph: 0 }, o)); }
  update(dt) {
    let k = 0;
    for (const q of this.list) {
      q.t += dt; if (q.t >= q.life) continue;
      const f = Math.exp(-q.drag * dt);
      q.v[0] *= f; q.v[1] = q.v[1] * f + q.up * dt; q.v[2] *= f;
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
      q.p[0] += Math.sin(q.t * 3 + q.ph) * q.wob * dt;
      const u = q.t / q.life, a = Math.min(1, u * 7) * Math.min(1, (1 - u) * 2.2);
      this.pos.set(q.p, k * 3);
      const c0 = q.c0, c1 = q.c1 || q.c0;
      this.col[k * 4] = c0[0] + (c1[0] - c0[0]) * u; this.col[k * 4 + 1] = c0[1] + (c1[1] - c0[1]) * u; this.col[k * 4 + 2] = c0[2] + (c1[2] - c0[2]) * u;
      this.col[k * 4 + 3] = a * (q.a ?? 1);
      this.size[k] = q.s * (1 - 0.4 * u);
      this.list[k++] = q;
    }
    this.list.length = k;
    const g = this.pts.geometry; g.setDrawRange(0, k);
    for (const n of ['position', 'aCol', 'aSize']) g.attributes[n].needsUpdate = true;
  }
}

// ---------- Sechseck-Shader: Bild + schillernder Kristall, Lichtwelle, Leuchten um die gewählte Fassung ----------
const HVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HFS = `uniform sampler2D uMap; uniform float uT, uReady, uPulse, uPulseR, uDim; uniform vec4 uFoc; uniform vec2 uC; varying vec2 vUv;
float hx(vec2 p, float a) { p = abs(p); return max(p.x, 0.5 * p.x + 0.8660254 * p.y) - a; }
vec3 hueRot(vec3 c, float a) { const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  vec2 p = vUv - uC;
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = (mx - mn) / (mx + 1e-3);
  // Kristall = kräftige Blau-/Lila-/Grüntöne im Inneren (Rost ist rötlich, Metall grau)
  float cry = smoothstep(0.15, 0.35, sat) * smoothstep(0.03, 0.12, max(c.g, c.b) - c.r * 0.8) * smoothstep(0.0, -0.03, hx(p, 0.335));
  float n = vn(vUv * 6.0 + vec2(uT * 0.07, -uT * 0.05));
  vec3 col = mix(c, max(hueRot(c, 0.55 * sin(uT * 0.4 + p.x * 5.0 - p.y * 4.0 + n * 3.0)), 0.0), cry);
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  col += cry * smoothstep(0.35, 0.8, lum) * c * (0.3 + 0.3 * sin(uT * 2.3 + n * 9.0));
  float sw = fract(uT * 0.11) * 2.4 - 1.2;
  col += cry * exp(-pow((dot(p, vec2(0.83, 0.55)) - sw) / 0.045, 2.0)) * vec3(0.5, 0.6, 0.8);
  float dc = hx(p, 0.0);
  col += cry * vec3(0.3, 0.26, 0.55) * (0.55 + 0.45 * sin(uT * 1.3)) * exp(-dc * 9.0);
  // Lichtwelle beim Ausrüsten
  col += uPulse * exp(-pow((dc - uPulseR) / 0.028, 2.0)) * (0.3 + 1.0 * cry) * vec3(0.75, 0.82, 1.0);
  col += uPulse * uPulse * cry * exp(-dc * 6.0) * vec3(0.3, 0.3, 0.6);
  // Leuchten um die gewählte Fassung
  float df = hx(vUv - uFoc.xy, uFoc.z);
  col += uFoc.w * ((exp(-pow(df / 0.011, 2.0)) * 1.3 + step(0.0, df) * exp(-df / 0.028) * 0.45) * vec3(1.0, 0.66, 0.28)
    + smoothstep(0.0, -0.05, df) * vec3(0.22, 0.17, 0.1));
  col *= 1.0 - uDim * 0.3;
  float a = hx(p, 0.392) < -0.004 ? 1.0 : smoothstep(0.012, 0.04, mx);
  gl_FragColor = vec4(col, a * uReady);
  #include <colorspace_fragment>
}`;

const V = new THREE.Vector3();

// Kartenmodelle schon beim Spielstart im Hintergrund lesen (main.js) – das Inventar ist dann sofort bereit
const geladen = {};
export function karteLaden(id) {
  const k = KARTEN.find((c) => c.id === id);
  if (!k) return Promise.reject(new Error('unbekannte Karte ' + id));
  return (geladen[id] ||= new Promise((ok, err) => ladeModell(new GLTFLoader(), k.glb, (g) => ok(g.scene), err)));
}

export class Inventar {
  /** el = Seite #page-inv; o = { werte, player, focusEl(knopf), onEquip() } */
  constructor(el, o) {
    this.o = o; this.el = el; this.t = 0; this.inp = null;
    this.choosing = false; this.focusI = 0; this.kFocus = null; this.focW = 0; this.focPop = 0;
    this.models = {}; this.loading = {}; this.obj = null; this.shown = null; this.want = null; this.an = null;
    this.spinA = 0; this.dragA = 0; this.dragV = 0; this.drag = null; this.dragged = false; this.flT = 7; this.fl = null;
    this.ptr = { x: 0, y: 0 }; this.tilt = { x: 0, y: 0 }; this.chooseK = 0; this.ready = 0; this.pulse = 0; this.pulseR = 0;
    this.flash = 0; this.emitAcc = 0; this.moteAcc = 0; this.pokes = {}; this.w = 0;

    el.innerHTML = `
      <div class="mhead"><span class="lv">Inventar</span><span class="sl" id="invSouls"></span></div>
      <div class="inv3">
        <div class="invView">${SOCK.map((s, i) => `<button class="sbtn sock${i ? '' : ' mid'}" data-s="${i}"><span class="sq"></span></button>`).join('')}</div>
        <div class="invInfo"></div>
      </div>`;
    this.view = el.querySelector('.invView'); this.info = el.querySelector('.invInfo');
    this.socks = [...this.view.querySelectorAll('.sock')];
    const cv = document.createElement('canvas'); cv.className = 'invCv'; this.view.prepend(cv);

    const r = this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    const sc = this.sc = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    sc.environmentIntensity = 0.55;
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 30); this.cam.position.set(0, 0, 3.95);
    const key = new THREE.DirectionalLight(0xffe2c0, 2.3); key.position.set(-1.4, 2.0, 3); sc.add(key);
    const rim = new THREE.DirectionalLight(0x9fb2ff, 1.2); rim.position.set(1.6, -0.4, -1.2); sc.add(rim);
    this.crysL = new THREE.PointLight(0xa58cff, 1.6, 3.2, 1.4); this.crysL.position.set(0, -0.35, 1.05); sc.add(this.crysL); // Kristall strahlt zurück
    this.glowL = new THREE.PointLight(0xffa060, 0, 2.4, 1.5); this.glowL.position.set(0, 0, CARD_Z + 0.5); sc.add(this.glowL);

    this.hex = new THREE.Group(); sc.add(this.hex);
    const tx = new THREE.TextureLoader().load(bildUrl('bilder/inventar.jpg'), () => { this.loaded = true; });
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy());
    this.hexMat = new THREE.ShaderMaterial({
      vertexShader: HVS, fragmentShader: HFS, transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { uMap: { value: tx }, uT: { value: 0 }, uReady: { value: 0 }, uPulse: { value: 0 }, uPulseR: { value: 0 }, uDim: { value: 0 },
        uFoc: { value: new THREE.Vector4(0.5, 0.5, 0.08, 0) }, uC: { value: new THREE.Vector2(0.499, 0.5024) } },
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hexMat); plane.renderOrder = 0; this.hex.add(plane);

    // Gegenstände in den Fassungen
    this.icons = {};
    this.wIcon = { degen: iconTex('degen'), schwert: iconTex('schwert') };
    for (const [i, kind] of Object.entries(SLOT_ITEM)) {
      const map = kind === 'waffe' ? this.wIcon[this.o.werte.waffe] || this.wIcon.degen : iconTex(kind);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
      m.position.set(wx(SOCK[i]), wy(SOCK[i]), 0.04); m.renderOrder = 2; this.hex.add(m); this.icons[i] = m;
    }
    // Karte: root (Lage vor dem Kristall) → anim (Aufsteigen/Versinken/Umdrehen) → spin (Schweben, Drehen)
    this.root = new THREE.Group(); this.root.position.z = CARD_Z; this.hex.add(this.root);
    this.anim = new THREE.Group(); this.root.add(this.anim);
    this.spin = new THREE.Group(); this.anim.add(this.spin);
    this.backT = backTex(false);
    this.models['?'] = this.lockedCard();
    this.models.back = this.lockedCard(true); // solange das Modell noch lädt: Rückseite
    this.fx = new Funken(260); this.hex.add(this.fx.pts);

    // Eingaben: Fassungen antippen, Maus neigt das Sechseck, Ziehen dreht die Karte
    this.socks.forEach((b, i) => {
      b.onclick = () => { if (this.dragged) return; if (i === 0) this.openChoice('karte'); else if (i === 1) this.openChoice('waffe'); else this.poke(i); };
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.o.focusEl(b); });
    });
    this.view.addEventListener('pointermove', (e) => {
      const rc = this.view.getBoundingClientRect();
      if (e.pointerType === 'mouse') { this.ptr.x = ((e.clientX - rc.left) / rc.width) * 2 - 1; this.ptr.y = ((e.clientY - rc.top) / rc.height) * 2 - 1; }
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        if (Math.abs(dx) > 7) this.dragged = true;
        if (this.dragged) { const d = (e.clientX - this.drag.lx) * 0.012; this.dragA += d; this.dragV = d / Math.max(0.016, (e.timeStamp - this.drag.lt) / 1000); }
        this.drag.lx = e.clientX; this.drag.lt = e.timeStamp;
      }
    });
    this.view.addEventListener('pointerleave', () => { this.ptr.x = this.ptr.y = 0; });
    this.view.addEventListener('pointerdown', (e) => { this.dragged = false; this.dragV = 0; this.drag = { x: e.clientX, lx: e.clientX, lt: e.timeStamp }; });
    const up = () => { if (this.drag) { this.drag = null; setTimeout(() => { this.dragged = false; }, 0); } };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);

    this.loadCard(this.o.werte.karte);
  }

  // ---------- Karten und Waffen laden und bauen ----------
  loadCard(id) {
    if (id && id.startsWith('w:')) { this.loadWeapon(id); return; }
    if (!KARTEN.some((c) => c.id === id) || this.models[id] || this.loading[id]) return;
    this.loading[id] = true;
    karteLaden(id).then((sc) => { this.models[id] = this.prepCard(sc); }, (e) => console.warn('Karte nicht geladen:', id, e));
  }
  prepCard(scene) {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    scene.position.sub(c);
    const g = new THREE.Group(), inner = new THREE.Group(); inner.add(scene); g.add(inner); inner.scale.setScalar(CARD_H / size.y);
    scene.traverse((m) => { if (m.isMesh) m.material.envMapIntensity = 0.9; });
    // eigene Rückseite (das Modell zeigt hinten die Vorderseite gespiegelt)
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 0.955, size.y * 0.965),
      new THREE.MeshStandardMaterial({ map: this.backT, roughness: 0.6, metalness: 0.15, alphaTest: 0.5 }));
    bk.rotation.y = Math.PI; bk.position.z = box.min.z - c.z - size.z * 0.12; inner.add(bk);
    g.add(this.halo(0xff8a3a, haloTex(255, 120)));
    return g;
  }
  /** Waffe für die Mitte: senkrecht, leicht schräg, etwa W_LEN lang */
  loadWeapon(id) {
    if (this.models[id] || this.loading[id]) return;
    const k = id.slice(2);
    if (k === 'degen') { this.models[id] = this.prepWeapon(this.caneShow(), 0xffb060); return; }
    this.loading[id] = true;
    schwertLaden().then((s) => { this.models[id] = this.prepWeapon(buildSchwert(s, false), 0x9fb4ff); }, (e) => console.warn('Waffe nicht geladen:', id, e));
  }
  caneShow() { // nur die gezogene Klinge mit Griff (Stock und Klinge zusammen wären zu lang und dünn)
    const c = buildCane(), g = new THREE.Group();
    c.fist.visible = false; g.add(c.sword);
    return g;
  }
  /** Waffen-Raum (Griff entlang +Z) → Klinge nach oben, mittig, auf W_LEN skaliert, schräg; dahinter ein weicher Schein */
  prepWeapon(w, glowCol) {
    const box = new THREE.Box3().setFromObject(w), len = box.max.z - box.min.z, mid = (box.max.z + box.min.z) / 2;
    const inner = new THREE.Group(); inner.add(w); w.position.z -= mid;
    inner.rotation.x = -Math.PI / 2; inner.scale.setScalar(W_LEN / len);
    w.traverse((m) => { if (m.isMesh && m.material && 'envMapIntensity' in m.material) m.material.envMapIntensity = 1.1; });
    const g = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.z = W_TILT; tilt.add(inner); g.add(tilt);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 128, 0, 32, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 256);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(0.42, W_LEN * 1.25), new THREE.MeshBasicMaterial({ map: tex(cv), color: glowCol, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    h.position.z = -0.08; h.renderOrder = 3; h.userData.halo = true; tilt.add(h);
    g.userData.weapon = true;
    return g;
  }
  lockedCard(back) {
    const g = new THREE.Group(), mat = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.1, alphaTest: 0.5 });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), mat(back ? this.backT : backTex(true))); f.position.z = 0.004; g.add(f);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), mat(this.backT)); b.rotation.y = Math.PI; b.position.z = -0.004; g.add(b);
    g.add(back ? this.halo(0xff8a3a, haloTex(255, 120)) : this.halo(0x7d6cff, haloTex(150, 110)));
    return g;
  }
  halo(color, t) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 1.4545, CARD_H * 1.3077),
      new THREE.MeshBasicMaterial({ map: t, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    m.renderOrder = 3; m.userData.halo = true; return m;
  }
  setObj(id) {
    if (this.obj) this.spin.remove(this.obj);
    this.obj = this.models[id] || null; this.shown = this.obj ? id : null;
    if (this.obj) { this.spin.add(this.obj); this.haloM = null; this.obj.traverse((m) => { if (m.userData.halo && !this.haloM) this.haloM = m; }); }
  }

  // ---------- Abläufe ----------
  /** Reiter geöffnet: Sechseck blendet ein, die Karte steigt kurz aus dem Kristall */
  enter() {
    const id = this.choosing ? (this.kFocus || this.o.werte.karte) : this.o.werte.karte;
    this.want = id;
    if (!this.models[id]) this.loadCard(id); // bis es da ist: Rückseite, danach dreht sie sich um
    this.setObj(this.models[id] ? id : id === '?' ? '?' : 'back'); this.an = { k: 'rise', t: -0.12, T: 1.05, big: false };
    sfx.huschen();
  }
  /** Ausrüsten: alte Karte versinkt, neue steigt wirbelnd auf */
  equipAnim(id) {
    const rise = () => { this.setObj(this.models[id] ? id : 'back'); this.an = { k: 'rise', t: 0, T: 1.6, big: true }; this.pulse = 1; this.pulseR = 0; sfx.karte(); };
    if (!this.models[id]) this.loadCard(id);
    if (this.obj) this.an = { k: 'sink', t: 0, T: 0.42, then: rise }; else rise();
  }
  /** Auswahl öffnen: kind 'karte' (Mitte) oder 'waffe' (obere Fassung) – die Vorschau dreht sich in der Mitte mit */
  openChoice(kind = 'karte') {
    if (this.choosing) return;
    const w = this.o.werte;
    this.choosing = true; this.kind = kind;
    for (const b of this.socks) b.disabled = true;
    let btns;
    if (kind === 'waffe') {
      this.kFocus = 'w:' + w.waffe;
      btns = [...WAFFEN_IDS.map((id) => w.waffen.includes(id)
        ? `<button class="sbtn kmini waffe${id === w.waffe ? ' on' : ''}" data-k="w:${id}" style="background-image:url(${this.wIcon[id].image.toDataURL()})"></button>`
        : `<button class="sbtn kmini zu" data-k="?w${id}"><b>?</b></button>`), '<button class="sbtn kmini zu" data-k="?w"><b>?</b></button>'];
    } else {
      this.kFocus = w.karte;
      const ks = [...KARTEN.map((k) => k.id), ...Array.from({ length: UNBEKANNT }, (_, i) => '?' + i)], own = w.karten || ['herzass'];
      btns = ks.map((id) => {
        const k = KARTEN.find((c) => c.id === id), has = k && own.includes(id);
        return has ? `<button class="sbtn kmini ${id}${id === w.karte ? ' on' : ''}" data-k="${id}"><b>${k.mini[0]}</b><i>${k.mini[1]}</i></button>`
          : `<button class="sbtn kmini zu" data-k="${id.startsWith('?') ? id : '?x'}"><b>?</b></button>`;
      });
    }
    this.info.innerHTML = `<div class="nm">${kind === 'waffe' ? 'Waffe wählen' : 'Karte wählen'}</div>
      <div class="kwahl">${btns.join('')}</div>
      <div class="kinfo"></div>
      <button class="sbtn" data-zu="1">Zurück</button>`;
    for (const b of this.info.querySelectorAll('[data-k]')) {
      b.onclick = () => this.choose(b.dataset.k);
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.o.focusEl(b); });
    }
    this.info.querySelector('[data-zu]').onclick = () => this.closeChoice();
    sfx.ui(1);
    if (kind === 'waffe') this.want = this.kFocus; // die Karte macht der Waffe Platz
    this.o.focusEl(this.info.querySelector(`[data-k="${this.kFocus}"]`) || this.info.querySelector('[data-k]'));
  }
  closeChoice(quiet) {
    if (!this.choosing) return;
    const was = this.kind;
    this.choosing = false; this.kind = null; this.want = this.o.werte.karte;
    for (const b of this.socks) b.disabled = false;
    this.focusI = was === 'waffe' ? 1 : 0; this.renderInfo();
    if (!quiet) this.o.focusEl(this.socks[this.focusI]);
  }
  choose(id) {
    if (id.startsWith('?')) {
      sfx.nein(); this.an = this.an || { k: 'shake', t: 0, T: 0.4 };
      const ki = this.info.querySelector('.kinfo');
      if (ki) ki.innerHTML = `<p class="ds warn">${this.kind === 'waffe' ? 'Diese Waffe hast du noch nicht gefunden.' : 'Diese Karte hast du noch nicht gefunden.'}</p>`;
      return;
    }
    const w = this.o.werte;
    if (id.startsWith('w:')) { // Waffe: kurz in der Mitte zeigen, dann kehrt die Karte zurück
      w.waffe = id.slice(2); w.save(); if (this.o.onEquip) this.o.onEquip();
      this.icons[1].material.map = this.wIcon[w.waffe]; this.icons[1].material.needsUpdate = true;
      this.closeChoice(); this.equipAnim(id); this.holdT = 2.4;
      return;
    }
    w.karte = id; w.save(); if (this.o.onEquip) this.o.onEquip();
    this.closeChoice(); this.equipAnim(id);
  }
  /** Gegenstand antippen: hüpft kurz und dreht sich */
  poke(i) { if (this.icons[i]) { this.pokes[i] = 0; sfx.ui(); } }

  // ---------- Anzeige rechts ----------
  onFocus(b) {
    if (!b) return;
    let ch = false;
    if (b.dataset.s !== undefined) { const i = +b.dataset.s; ch = i !== this.focusI; this.focusI = i; this.renderInfo(); }
    else if (b.dataset.k !== undefined) {
      ch = b.dataset.k !== this.kFocus; this.kFocus = b.dataset.k;
      this.want = b.dataset.k.startsWith('?') ? '?' : b.dataset.k; this.holdT = 0; this.renderKinfo();
    } else if (!this.choosing) { ch = this.focusI !== -1; this.focusI = -1; }
    if (ch) { this.focPop = 1; sfx.ui(); }
  }
  hintA() { const p = this.inp || {}; return p.pad ? 'A' : p.touch || document.body.classList.contains('touch') ? 'Antippen' : 'Enter / Klick'; }
  itemData(kind) {
    const w = this.o.werte, m = w.mods(), p = this.o.player, f0 = Math.round;
    if (kind === 'waffe') { const W = WAFFEN[w.waffe] || WAFFEN.degen; return { n: W.n, tag: 'WAFFE · AUSGERÜSTET', d: `${W.d} Schaden leicht ${f0(12 * m.light)}, schwer ${f0(32 * m.heavy)}.`, hint: true }; }
    if (kind === 'trank') return { n: 'Heiltrank', q: `${p.potions} / ${p.maxPotions}`, d: 'Glut-Essenz im Fläschchen. Heilt 45 Leben. Am Seelenstein und nach dem Tod wieder voll.' };
    return { n: 'Seelen', q: w.souls, d: 'Von besiegten Gegnern (Hund 10, Boss 1500). Am Seelenstein gegen Stufen tauschen.' };
  }
  renderInfo() {
    if (this.choosing) return;
    const i = this.focusI, k = KARTEN.find((c) => c.id === this.o.werte.karte);
    let h;
    if (i === 0 && k) h = `<div class="nm">${k.n}</div><div class="tag">AUSGERÜSTETE KARTE</div><p class="ds">${k.d}</p><p class="hn">${this.hintA()}: Karte wählen</p>`;
    else if (SLOT_ITEM[i]) {
      const d = this.itemData(SLOT_ITEM[i]), more = d.hint && this.o.werte.waffen.length > 1;
      h = `<div class="nm">${d.n}${d.q !== undefined ? ` <span class="qt">${d.q}</span>` : ''}</div>${d.tag ? `<div class="tag">${d.tag}</div>` : ''}<p class="ds">${d.d}</p>`
        + (d.hint ? `<p class="hn">${this.hintA()}: ${more ? 'Waffe wechseln' : 'Waffen ansehen'}</p>` : '');
    }
    else if (i > 0) h = '<div class="nm dim">Leere Fassung</div><p class="ds">Hier ist noch Platz für Fundstücke.</p>';
    else h = `<div class="nm">${k ? k.n : 'Inventar'}</div><p class="ds">Wähle eine Fassung im Sechseck.</p>`;
    this.info.innerHTML = h;
  }
  renderKinfo() {
    const ki = this.info.querySelector('.kinfo'); if (!ki) return;
    if (this.kind === 'waffe') {
      const id = this.kFocus.startsWith('w:') ? this.kFocus.slice(2) : null, W = id && WAFFEN[id], cur = WAFFEN[this.o.werte.waffe] || WAFFEN.degen;
      const m = this.o.werte.mods(), f0 = Math.round;
      ki.innerHTML = W ? `<div class="nm sm">${W.n}${id === this.o.werte.waffe ? ' <span class="tag">AUSGERÜSTET</span>' : ''}</div><p class="ds">${W.d}</p>`
        + `<p class="ds">Schaden leicht ${f0(12 * m.light / cur.light * W.light)} · schwer ${f0(32 * m.heavy / cur.heavy * W.heavy)}</p>`
        : '<div class="nm sm dim">Unbekannte Waffe</div><p class="ds">Noch nicht gefunden. Vielleicht liegt sie irgendwo in der Stadt …</p>';
      return;
    }
    const k = KARTEN.find((c) => c.id === this.kFocus);
    ki.innerHTML = k ? `<div class="nm sm">${k.n}${k.id === this.o.werte.karte ? ' <span class="tag">AUSGERÜSTET</span>' : ''}</div><p class="ds">${k.d}</p>`
      : '<div class="nm sm dim">Unbekannte Karte</div><p class="ds">Noch nicht gefunden. Vielleicht trägt ein Feind sie bei sich …</p>';
  }
  /** Zahlen auffrischen (beim Öffnen des Reiters) */
  refresh() {
    const w = this.o.werte, p = this.o.player, fmt = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : String(n));
    this.el.querySelector('#invSouls').textContent = 'Seelen ' + w.souls;
    this.socks[3].querySelector('.sq').textContent = `${p.potions}/${p.maxPotions}`;
    this.socks[5].querySelector('.sq').textContent = fmt(w.souls);
    this.icons[1].material.map = this.wIcon[w.waffe] || this.wIcon.degen; this.icons[1].material.needsUpdate = true;
    if (this.choosing) this.closeChoice(true);
    this.ready = 0; this.renderInfo(); this.enter();
  }

  // ---------- jedes Bild, solange der Reiter offen ist ----------
  resize() {
    const w = this.view.clientWidth, h = this.view.clientHeight;
    if (!w || !h) return false;
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h;
      this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, document.body.classList.contains('touch') ? 1.5 : 2));
      this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }
    this.fx.mat.uniforms.uScale.value = (h * this.r.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)));
    return true;
  }
  update(dt, inp) {
    this.inp = inp;
    if (!this.resize()) return;
    this.t += dt; const t = this.t;
    if (this.loaded) this.ready = Math.min(1, this.ready + dt / 0.35);

    // Sechseck neigt sich leicht zum Mauszeiger, sonst langsames Atmen
    const tx = this.ptr.y * 0.09 + Math.sin(t * 0.31) * 0.025, ty = this.ptr.x * 0.12 + Math.sin(t * 0.23 + 1) * 0.035;
    this.tilt.x += (tx - this.tilt.x) * Math.min(1, dt * 4); this.tilt.y += (ty - this.tilt.y) * Math.min(1, dt * 4);
    this.hex.rotation.set(this.tilt.x, this.tilt.y, 0);
    const s0 = 0.94 + 0.06 * eOut3(this.ready); this.hex.scale.setScalar(s0);

    // Kartenwahl: Karte rückt vor und wird größer, das Sechseck dunkelt etwas ab
    this.chooseK += ((this.choosing ? 1 : 0) - this.chooseK) * Math.min(1, dt * 6);
    this.root.position.set(0, 0.02 * this.chooseK, CARD_Z + 0.32 * this.chooseK);
    this.root.scale.setScalar(1 + 0.12 * this.chooseK);

    // Vorschau beim Blättern: Karte dreht sich auf die Kante, wird getauscht, dreht zurück
    this.holdT = Math.max(0, (this.holdT || 0) - dt); // nach dem Ausrüsten einer Waffe bleibt sie kurz stehen
    if (!this.an && !this.holdT && this.want && this.want !== this.shown && this.models[this.want]) this.an = { k: 'flip', t: 0, T: 0.36, to: this.want };
    if (this.want && this.want !== '?' && !this.models[this.want]) this.loadCard(this.want);

    this.runAnim(dt);
    this.idle(dt, inp);
    this.sc.updateMatrixWorld();
    this.particles(dt);
    this.icons3(dt);

    // Shader und Licht
    this.pulse = Math.max(0, this.pulse - dt * 0.8); this.pulseR += dt * 0.55;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.focPop = Math.max(0, this.focPop - dt * 3);
    const fi = this.choosing ? -1 : this.focusI, fOn = fi >= 0 ? 1 : 0;
    this.focW += (fOn - this.focW) * Math.min(1, dt * 8);
    const U = this.hexMat.uniforms;
    if (fi >= 0) U.uFoc.value.set(SOCK[fi].x / 1024, 1 - SOCK[fi].y / 1024, SOCK[fi].a / 1024, 0);
    U.uFoc.value.w = this.focW * (0.75 + 0.25 * Math.sin(t * 4) + this.focPop * 0.6) * (fi === 0 ? 0.6 : 1);
    U.uT.value = t; U.uReady.value = this.ready; U.uPulse.value = this.pulse; U.uPulseR.value = this.pulseR; U.uDim.value = this.chooseK;
    this.crysL.intensity = 1.4 + 0.3 * Math.sin(t * 1.3) + this.pulse * 2;
    this.glowL.intensity = this.flash * 4;
    if (this.haloM) {
      const fl = 0.55 + 0.18 * Math.sin(t * 7.3) * Math.sin(t * 3.1) + 0.1 * Math.sin(t * 13);
      this.haloM.material.opacity = Math.min(1.6, fl + this.flash * 1.2 + (fi === 0 ? 0.25 : 0) + this.chooseK * 0.2);
    }
    this.placeSockets();
    this.r.render(this.sc, this.cam);
  }
  runAnim(dt) {
    const A = this.an, g = this.anim;
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
    if (!A) { if (!this.obj && this.want && this.models[this.want]) this.setObj(this.want); return; }
    A.t += dt; const u = cl01(A.t / A.T);
    if (A.k === 'rise') {
      // aus dem Kristall: klein und wirbelnd, schießt nach vorn, schwingt aus
      const sp = A.big ? 6 : 2;
      g.scale.setScalar(Math.max(0.001, 0.05 + 0.95 * eBack(u, A.big ? 2.0 : 1.4)));
      g.position.set(0, (A.big ? 0.07 : 0.03) * Math.sin(u * Math.PI), -CARD_Z + CARD_Z * eBack(u, A.big ? 2.6 : 1.6));
      g.rotation.set(0.55 * (1 - eOut3(u)), -sp * Math.PI * (1 - eOut3(cl01(u / 0.82))), (A.big ? 0.25 : 0.1) * (1 - eOut3(u)));
      if (A.t < 0) g.scale.setScalar(0.001);
      if (A.big && !A.mid && u > 0.5) { A.mid = true; this.burst(); this.flash = 1; }
    } else if (A.k === 'sink') {
      g.scale.setScalar(Math.max(0.001, 1 - 0.95 * eIn3(u)));
      g.position.z = -CARD_Z * eIn3(u); g.rotation.y = 2 * Math.PI * eIn3(u);
    } else if (A.k === 'flip') {
      if (u < 0.5) g.rotation.y = (Math.PI / 2) * eIn3(u * 2);
      else { if (!A.sw) { A.sw = true; this.setObj(A.to); sfx.huschen(0.5); } g.rotation.y = -(Math.PI / 2) * (1 - eOut3((u - 0.5) * 2)); }
      g.position.z = 0.08 * Math.sin(u * Math.PI);
    } else if (A.k === 'shake') {
      g.rotation.z = 0.12 * Math.sin(u * Math.PI * 6) * (1 - u); g.position.x = 0.03 * Math.sin(u * Math.PI * 6) * (1 - u);
    }
    if (u >= 1) { this.an = null; if (A.then) A.then(); }
  }
  idle(dt, inp) {
    const t = this.t, s = this.spin;
    // Ziehen / rechter Stick, danach rastet die Karte weich wieder vorn ein
    if (inp && inp.pad && inp.cx) { this.dragA += inp.cx * 1.4; this.dragV = 0; }
    if (!this.drag) {
      this.dragA += this.dragV * dt; this.dragV *= Math.exp(-dt * 3.5);
      if (Math.abs(this.dragV) < 0.6 && !(inp && inp.pad && inp.cx)) {
        const tgt = Math.round(this.dragA / (Math.PI * 2)) * Math.PI * 2;
        this.dragA += (tgt - this.dragA) * Math.min(1, dt * 3);
      }
    }
    // ab und zu ein Kunststück: einmal ganz herum
    if (!this.fl) {
      if (!this.an && !this.drag && !this.choosing && Math.abs(this.dragV) < 0.1) this.flT -= dt;
      if (this.flT <= 0) { this.fl = { t: 0 }; this.flT = 9 + Math.random() * 4; }
    }
    let fa = 0;
    if (this.fl) { this.fl.t += dt; const u = cl01(this.fl.t / 1.7); fa = Math.PI * 2 * eIO(u); if (u >= 1) this.fl = null; }
    s.rotation.set(0.07 * Math.sin(t * 0.8 + 1) - this.ptr.y * 0.12,
      0.3 * Math.sin(t * 0.5) * (1 - 0.6 * this.chooseK) + this.ptr.x * 0.25 + this.dragA + fa,
      0.035 * Math.sin(t * 0.6));
    s.position.set(0, 0.03 * Math.sin(t * 1.25), 0);
  }
  burst() {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.3, gold = Math.random() < 0.6;
      this.fx.add({ p: [Math.cos(a) * 0.08, Math.sin(a) * 0.08, CARD_Z], v: [Math.cos(a) * sp, Math.sin(a) * sp, 0.2 + Math.random() * 0.6],
        life: 0.5 + Math.random() * 0.7, s: 0.025 + Math.random() * 0.035, drag: 2.6, up: -0.2, wob: 0, ph: 0,
        c0: gold ? [1.6, 1.25, 0.7] : [0.8, 0.9, 1.6], c1: gold ? [1.2, 0.35, 0.08] : [0.45, 0.3, 1.1] });
    }
  }
  particles(dt) {
    // Glut von den Kartenrändern
    if (this.obj && this.an?.k !== 'sink') {
      this.emitAcc += dt * 26;
      while (this.emitAcc > 1) {
        this.emitAcc--;
        const e = (Math.random() * 4) | 0, q = Math.random() * 2 - 1, hw = CARD_W / 2, hh = CARD_H / 2;
        if (this.obj.userData.weapon) V.set(-Math.sin(W_TILT) * q * W_LEN * 0.45, Math.cos(W_TILT) * q * W_LEN * 0.45, 0); // entlang der Waffe
        else V.set(e < 2 ? q * hw : e === 2 ? hw : -hw, e < 2 ? (e ? hh : -hh) : q * hh, 0);
        this.spin.localToWorld(V); this.hex.worldToLocal(V);
        this.fx.add({ p: [V.x, V.y, V.z], v: [(Math.random() - 0.5) * 0.08, 0.05 + Math.random() * 0.12, (Math.random() - 0.3) * 0.08],
          life: 0.9 + Math.random() * 1.6, s: 0.014 + Math.random() * 0.02, drag: 0.8, up: 0.16, wob: 0.05, ph: Math.random() * 6,
          ...(this.shown === 'w:schwert' ? { c0: [0.75, 0.9, 1.6], c1: [0.55, 0.3, 1.2] } : { c0: [1.5, 0.95, 0.4], c1: [0.9, 0.18, 0.04] }) });
      }
    }
    // feiner Kristallstaub
    this.moteAcc += dt * 6;
    while (this.moteAcc > 1) {
      this.moteAcc--;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.6;
      this.fx.add({ p: [Math.cos(a) * r, Math.sin(a) * r, 0.03], v: [0, 0.02, 0.06 + Math.random() * 0.05], life: 2 + Math.random() * 2,
        s: 0.01 + Math.random() * 0.012, drag: 0.2, up: 0.02, wob: 0.03, ph: Math.random() * 6, a: 0.8,
        c0: Math.random() < 0.5 ? [0.6, 0.7, 1.4] : [1.0, 0.6, 1.4], c1: [0.4, 0.9, 1.0] });
    }
    this.fx.update(dt);
  }
  icons3(dt) {
    for (const [i, m] of Object.entries(this.icons)) {
      const ph = +i * 1.7, foc = !this.choosing && this.focusI === +i;
      let s = 1 + (foc ? 0.12 : 0) + 0.02 * Math.sin(this.t * 2 + ph), rz = 0;
      if (this.pokes[i] !== undefined) {
        const u = (this.pokes[i] += dt) / 0.55;
        if (u >= 1) delete this.pokes[i]; else { s += 0.35 * Math.sin(u * Math.PI) * (1 - u * 0.5); rz = Math.sin(u * Math.PI * 2) * 0.4 * (1 - u); }
      }
      m.scale.setScalar(m.scale.x + (s - m.scale.x) * Math.min(1, dt * 12));
      m.position.z = 0.04 + 0.015 * Math.sin(this.t * 1.6 + ph) + (foc ? 0.03 : 0);
      m.rotation.z = rz;
      m.material.opacity = this.ready * (1 - 0.45 * this.chooseK);
    }
  }
  /** Knöpfe über die Fassungen legen (folgen der Neigung) */
  placeSockets() {
    const W = this.w, H = this.h, pr = (x, y, z) => { V.set(x, y, z); this.hex.localToWorld(V).project(this.cam); return [(V.x + 1) / 2 * W, (1 - V.y) / 2 * H]; };
    SOCK.forEach((s, i) => {
      const b = this.socks[i], x = wx(s), y = wy(s);
      let w, h, c;
      if (i === 0) {
        const z = this.root.position.z, a = pr(-CARD_W / 2, -CARD_H / 2, z), d = pr(CARD_W / 2, CARD_H / 2, z);
        c = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2]; w = Math.abs(d[0] - a[0]); h = Math.abs(d[1] - a[1]);
      } else {
        c = pr(x, y, 0); const e = pr(x + (s.a / 1024) * 2.2, y, 0); w = h = 2 * Math.abs(e[0] - c[0]);
      }
      b.style.cssText = `left:${c[0].toFixed(1)}px;top:${c[1].toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
    });
  }
}
