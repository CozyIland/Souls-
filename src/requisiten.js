// Gegenstände in den Straßen: Autowracks, Bus, Laternen, Strommasten mit Leitungen, Ampeln, Schilder, Container,
// Fässer, Reifen, Kisten, Sandsäcke, Zäune, Zeltlager, Feuertonnen, Spieltisch (Rastpunkt), Übungspuppen, Schutt.
import * as THREE from 'three';
import { part, toon, outline } from './toon.js';
import { seeded, TAU } from './util.js';
import { block, blockRot } from './kollision.js';
import { carSpot, CAR_L, CAR_W } from './wracks.js';
import { rustTex, woodTex, fenceTex, tarpTex, signTex, glowTex, concreteTex, paperTex } from './texturen.js';

const R = seeded(19);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (a) => a[Math.floor(R() * a.length)];

export const GLOW = glowTex();
let M = null;
function mats() {
  if (M) return M;
  M = {
    cars: ['#5e7a78', '#8a4a38', '#6a6a4a', '#4a5466', '#7a6450', '#9a9488', '#3a3a40'].map((c) => toon(0xffffff, { map: rustTex(c) })),
    burnt: toon(0xffffff, { map: rustTex('#2e2622') }),
    glass: toon(0x161b20),
    glass2: toon(0x161b20, { side: THREE.DoubleSide }),
    tire: toon(0x181514),
    rim: toon(0x6a6660),
    iron: toon(0x2c2826),
    rust: toon(0xffffff, { map: rustTex('#5a4a40') }),
    wood: toon(0xffffff, { map: woodTex() }),
    concrete: toon(0xffffff, { map: concreteTex() }),
    fence: toon(0xffffff, { map: fenceTex(), alphaTest: 0.4, side: THREE.DoubleSide }),
    tarps: ['#3a4a5a', '#5a4a2a', '#4a2a2a', '#3a4a30'].map((c) => toon(0xffffff, { map: tarpTex(c), side: THREE.DoubleSide })),
    sand: toon(0x8a7a5a),
    cloth: toon(0x5a5048),
    mattress: toon(0x9a8a70),
    paper: toon(0xffffff, { map: paperTex(), side: THREE.DoubleSide }),
    dumpster: toon(0xffffff, { map: rustTex('#2a4a3a') }),
    barrel: [toon(0xffffff, { map: rustTex('#2a3a5a') }), toon(0xffffff, { map: rustTex('#7a2a1a') }), toon(0xffffff, { map: rustTex('#6a6a30') })],
    red: toon(0x8a1a14), yellow: toon(0xb08a2a), white: toon(0xd8d0c0),
    lampOff: toon(0x3a3a34),
    puddle: new THREE.MeshStandardMaterial({ color: 0x0a0808, roughness: 0.1, metalness: 0.0, envMapIntensity: 0.55, transparent: true, opacity: 0.85 }),
  };
  return M;
}
export function propMats() { return mats(); }

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, line = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (line) outline(m, line);
  parent.add(m); return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, line = 0) {
  const m = new THREE.Mesh(line ? new THREE.BoxGeometry(w, h, d) : BOX, mat);
  if (!line) m.scale.set(w, h, d);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true;
  if (line) outline(m, line);
  parent.add(m); return m;
}

// ---------- Autos ----------
// Seitenprofil (z = Länge, y = Höhe) als ausgestanzte Form
function carProfile(L) {
  const s = new THREE.Shape(), h = L / 2;
  s.moveTo(-h, 0.32); s.lineTo(-h, 0.78); s.quadraticCurveTo(-h + 0.05, 0.92, -h + 0.45, 0.94);
  s.lineTo(-h + 1.0, 0.98); s.lineTo(-h + 1.55, 1.42); s.lineTo(h - 1.45, 1.44); s.lineTo(h - 0.95, 1.0);
  s.lineTo(h - 0.15, 0.92); s.quadraticCurveTo(h, 0.88, h, 0.72); s.lineTo(h, 0.32); s.lineTo(-h, 0.32);
  return s;
}
function wheel(g, m, x, z, flat) {
  const t = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), m.tire, g, x, flat ? 0.24 : 0.34, z, 0.015); t.rotation.z = Math.PI / 2;
  const r = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.26, 8), m.rim, g, x, t.position.y, z); r.rotation.z = Math.PI / 2;
}
/** Autowrack: Stelle merken (gezeichnet wird das Meshy-Modell in wracks.js, mit eigener Farbe/Lage je Auto) + Kollision */
export function car(scene, x, z, rot, burnt, roof) {
  carSpot(x, z, rot, burnt, roof);
  blockRot(x, z, CAR_W + 0.1, CAR_L, rot);
}
/** Ersatz, falls das Modell fehlt: Auto aus Grundformen */
export function carBox(scene, { x, z, rot, burnt, roof }) {
  const m = mats(), g = new THREE.Group();
  const L = 4.3, W = 1.8;
  const paint = burnt ? m.burnt : pick(m.cars);
  const body = new THREE.ExtrudeGeometry(carProfile(L), { depth: W, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, steps: 1 });
  body.translate(0, 0, -W / 2); body.rotateY(Math.PI / 2); // Länge entlang z, vorn = +z
  mesh(body, paint, g, 0, 0, 0, 0.025);
  // Seitenfenster (beidseitig sichtbar)
  const win = new THREE.Shape(), hl = L / 2;
  win.moveTo(-hl + 1.12, 1.0); win.lineTo(-hl + 1.58, 1.36); win.lineTo(hl - 1.5, 1.37); win.lineTo(hl - 1.05, 1.02); win.lineTo(-hl + 1.12, 1.0);
  const wg = new THREE.ShapeGeometry(win); wg.rotateY(Math.PI / 2);
  for (const s of [-1, 1]) mesh(wg, m.glass2, g, s * (W / 2 + 0.055), 0, 0);
  // Windschutzscheiben
  box(g, m.glass, W * 0.86, 0.5, 0.04, 0, 1.2, L / 2 - 1.22, -0.68);
  box(g, m.glass, W * 0.86, 0.48, 0.04, 0, 1.2, -L / 2 + 1.28, 0.62);
  // Stoßstangen, Lichter
  box(g, m.iron, W + 0.05, 0.16, 0.14, 0, 0.42, L / 2 + 0.05); box(g, m.iron, W + 0.05, 0.16, 0.14, 0, 0.42, -L / 2 - 0.05);
  if (!burnt) for (const s of [-1, 1]) { box(g, m.white, 0.3, 0.14, 0.04, s * 0.6, 0.72, L / 2 + 0.07); box(g, m.red, 0.3, 0.12, 0.04, s * 0.6, 0.74, -L / 2 - 0.07); }
  for (const [wx, wz] of [[-0.86, 1.35], [0.86, 1.35], [-0.86, -1.3], [0.86, -1.3]]) { if (R() < 0.2) continue; wheel(g, m, wx, wz, R() < 0.3); }
  if (roof) { // Dachgepäck / Matratze
    box(g, m.mattress, 1.3, 0.18, 1.9, 0, 1.6, -0.2, 0, rr(-0.2, 0.2), rr(-0.08, 0.08), 0.015);
  }
  if (burnt) for (let i = 0; i < 3; i++) box(g, m.burnt, rr(0.3, 0.6), 0.04, rr(0.3, 0.6), rr(-0.6, 0.6), 1.46, rr(-0.8, 0.8), R(), R(), R());
  g.position.set(x, burnt ? -0.08 : 0, z); g.rotation.set(0, rot, rr(-0.04, 0.04));
  scene.add(g);
  return g;
}

export function bus(scene, x, z, rot) {
  const m = mats(), g = new THREE.Group();
  const L = 11, W = 2.5, H = 2.9;
  box(g, m.burnt, W, H - 0.4, L, 0, 0.4 + (H - 0.4) / 2, 0, 0, 0, 0, 0.04);
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) box(g, m.glass, 0.04, 0.9, 1.2, s * (W / 2 + 0.02), 2.1, -L / 2 + 1.3 + i * 1.45);
  box(g, m.glass, W * 0.9, 1.1, 0.04, 0, 2.0, L / 2 + 0.02);
  for (const [wx, wz] of [[-1.15, 3.6], [1.15, 3.6], [-1.15, -3.4], [1.15, -3.4]]) { const t = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 14), m.tire, g, wx, 0.3, wz, 0.02); t.rotation.z = Math.PI / 2; }
  const sign = box(g, toon(0xffffff, { map: signTex('13 FRIEDHOF', '#111', '#d8902a', 512, 96) }), 1.8, 0.32, 0.05, 0, 2.7, L / 2 + 0.04);
  g.position.set(x, 0, z); g.rotation.set(0, rot, 0.08);
  scene.add(g);
  blockRot(x, z, W + 0.2, L, rot);
}

// ---------- Straßenmöbel ----------
export function lamp(scene, x, z, face, bent) {
  const m = mats(), g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.06, 0.11, 5.2, 8), m.iron, g, 0, 2.6, 0, 0.02);
  mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), m.iron, g, 0, 0.25, 0);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 5.1, 0), new THREE.Vector3(0, 5.7, 0.4), new THREE.Vector3(0, 5.5, 1.4)), 10, 0.045, 6), m.iron);
  arm.castShadow = true; g.add(arm);
  box(g, m.iron, 0.3, 0.14, 0.55, 0, 5.42, 1.45, 0.1, 0, 0, 0.015);
  box(g, m.lampOff, 0.22, 0.03, 0.42, 0, 5.34, 1.45, 0.1);
  g.position.set(x, 0, z); g.rotation.set(bent ? 0.3 : 0, face, bent ? 0.12 : 0);
  scene.add(g); block(x, z, 0.35, 0.35);
}

/** Strommast; gibt die Aufhängepunkte zurück (für Leitungen) */
export function pole(scene, x, z, rot, lean) {
  const m = mats(), g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.1, 0.14, 8, 8), m.wood, g, 0, 4, 0, 0.02);
  box(g, m.wood, 2.0, 0.14, 0.14, 0, 7.4, 0, 0, 0, 0, 0.015);
  box(g, m.wood, 1.4, 0.12, 0.12, 0, 6.8, 0, 0, 0, 0, 0.012);
  for (const s of [-0.9, -0.3, 0.3, 0.9]) mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), m.white, g, s, 7.53, 0);
  mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10), m.rust, g, 0.25, 6.2, 0, 0.015); // Trafo
  g.position.set(x, 0, z); g.rotation.set(lean || 0, rot, 0);
  scene.add(g); g.updateMatrixWorld(true);
  block(x, z, 0.35, 0.35);
  return [-0.9, -0.3, 0.3, 0.9].map((s) => new THREE.Vector3(s, 7.6, 0).applyMatrix4(g.matrixWorld));
}
/** Durchhängende Leitung zwischen zwei Punkten */
export function wire(scene, a, b, sag) {
  const m = mats(), pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0))); }
  const w = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.018, 4), m.iron);
  scene.add(w);
}

export function trafficLight(scene, x, z, rot, tilt) {
  const m = mats(), g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 8), m.iron, g, 0, 2.1, 0, 0.015);
  box(g, m.iron, 0.12, 0.12, 3.0, 0, 4.1, 1.45, 0, 0, 0, 0.012);
  const head = box(g, m.yellow, 0.36, 1.0, 0.3, 0, 3.55, 2.8, 0, 0, 0, 0.015);
  for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CircleGeometry(0.1, 10), i === 0 ? toon(0x3a1210) : m.lampOff, g, 0, 3.86 - i * 0.3, 2.96); }
  g.position.set(x, 0, z); g.rotation.set(0, rot, tilt || 0);
  scene.add(g); block(x, z, 0.3, 0.3);
}

export function streetSign(scene, x, z, rot, text) {
  const m = mats(), g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), m.iron, g, 0, 1.5, 0, 0.01);
  box(g, toon(0xffffff, { map: signTex(text, '#e8e2d0', '#151515', 512, 112) }), 1.5, 0.32, 0.03, 0.6, 2.85, 0, 0, 0, rr(-0.15, 0.1), 0.01);
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
}

export function dumpster(scene, x, z, rot) {
  const m = mats(), g = new THREE.Group();
  box(g, m.dumpster, 1.9, 1.15, 1.2, 0, 0.7, 0, 0, 0, 0, 0.025);
  box(g, m.iron, 2.0, 0.07, 0.7, 0, 1.36, -0.32, -0.5);
  for (const s of [-1, 1]) for (const t of [-1, 1]) mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), m.tire, g, s * 0.8, 0.07, t * 0.45);
  for (let i = 0; i < 5; i++) box(g, pick([m.cloth, m.paper, m.wood]), rr(0.2, 0.5), rr(0.1, 0.3), rr(0.2, 0.5), rr(-0.7, 0.7), 1.3, rr(-0.3, 0.3), R(), R(), R());
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  blockRot(x, z, 1.25, 1.9, rot + Math.PI / 2);
}

export function barrel(scene, x, z, fallen) {
  const m = mats(), g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 14), pick(m.barrel), g, 0, 0, 0, 0.015);
  for (const y of [-0.22, 0.22]) { const r = mesh(new THREE.TorusGeometry(0.305, 0.02, 4, 16), m.iron, g, 0, y, 0); r.rotation.x = Math.PI / 2; }
  if (fallen) { g.rotation.set(Math.PI / 2, R() * TAU, 0); g.position.set(x, 0.3, z); } else g.position.set(x, 0.44, z);
  scene.add(g); block(x, z, 0.6, 0.6);
}

export function tires(scene, x, z, n) {
  const m = mats();
  for (let i = 0; i < n; i++) {
    const t = mesh(new THREE.TorusGeometry(0.32, 0.13, 8, 16), m.tire, scene, x + rr(-0.06, 0.06), 0.13 + i * 0.25, z + rr(-0.06, 0.06), 0.012);
    t.rotation.x = Math.PI / 2 + rr(-0.1, 0.1);
  }
  block(x, z, 0.8, 0.8);
}

export function crate(scene, x, z, s = 1) {
  const m = mats();
  const c = box(scene, m.wood, 0.8 * s, 0.7 * s, 0.8 * s, x, 0.35 * s, z, 0, R() * TAU, 0, 0.015);
  if (R() < 0.5) box(scene, m.wood, 0.6 * s, 0.5 * s, 0.6 * s, x + rr(-0.1, 0.1), 0.7 * s + 0.25 * s, z + rr(-0.1, 0.1), 0, R() * TAU, 0, 0.012);
  block(x, z, 0.85 * s, 0.85 * s);
}

/** Sandsack-Mauer (Barrikade) */
export function sandbags(scene, x, z, len, rot) {
  const m = mats(), g = new THREE.Group(), geo = new THREE.SphereGeometry(0.5, 10, 6);
  geo.scale(0.55, 0.22, 0.32);
  const n = Math.round(len / 0.55);
  for (let row = 0; row < 3; row++) for (let i = 0; i < n - row; i++) {
    const s = mesh(geo, m.sand, g, -len / 2 + (i + 0.5 + row * 0.5) * 0.55, 0.11 + row * 0.2, rr(-0.03, 0.03), 0.012);
    s.rotation.y = rr(-0.15, 0.15);
  }
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  blockRot(x, z, 0.5, len, rot + Math.PI / 2);
}

export function fence(scene, x, z, len, rot, torn) {
  const m = mats(), g = new THREE.Group();
  const n = Math.max(1, Math.round(len / 2.5)), seg = len / n;
  for (let i = 0; i <= n; i++) mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), m.iron, g, -len / 2 + i * seg, 1.1, 0, 0.01);
  for (let i = 0; i < n; i++) {
    if (torn && R() < 0.3) continue;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(seg, 2.0), m.fence);
    p.material.map.repeat.set(seg * 2, 4);
    p.position.set(-len / 2 + (i + 0.5) * seg, 1.05, 0); p.rotation.set(rr(-0.08, 0.08), 0, 0); p.castShadow = true; g.add(p);
  }
  box(g, m.iron, len, 0.04, 0.04, 0, 2.15, 0);
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  blockRot(x, z, 0.3, len, rot + Math.PI / 2);
}

/** Zelt aus Plane und Stangen, dazu Matratze und Kram – hier hausen die Verwahrlosten */
export function tent(scene, x, z, rot) {
  const m = mats(), g = new THREE.Group();
  const tarp = pick(m.tarps);
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([-1.2, 0, -1, 0, 1.4, -1, 1.2, 0, -1, -1.2, 0, 1, 0, 1.4, 1, 1.2, 0, 1]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1, 1, 0].map((a, i) => (i % 2 ? a : a * 2))), 2));
  geo.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 1, 2, 3, 5, 4]);
  geo.computeVertexNormals();
  const t = mesh(geo, tarp, g, 0, 0, 0); t.material = tarp;
  const ol = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x120a08, side: THREE.BackSide })); ol.scale.set(1.03, 1.03, 1.02); g.add(ol);
  box(g, m.wood, 0.06, 0.06, 2.4, 0, 1.42, 0);
  box(g, m.mattress, 1.0, 0.16, 1.9, 0.2, 0.08, 1.9, 0, rr(-0.2, 0.2), 0, 0.012);
  box(g, m.cloth, 0.9, 0.08, 1.2, 0.3, 0.2, 2.0, 0, 0.3, 0.05);
  crate(g, -1.5, 1.5, 0.7);
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  blockRot(x, z, 2.4, 2.2, rot);
}

export function cart(scene, x, z, rot) {
  const m = mats(), g = new THREE.Group();
  for (const s of [-1, 1]) { box(g, m.iron, 0.02, 0.5, 0.9, s * 0.28, 0.75, 0); }
  box(g, m.iron, 0.56, 0.02, 0.9, 0, 0.5, 0); box(g, m.iron, 0.56, 0.5, 0.02, 0, 0.75, 0.45); box(g, m.iron, 0.56, 0.5, 0.02, 0, 0.75, -0.45);
  box(g, m.iron, 0.56, 0.04, 0.04, 0, 1.05, -0.55);
  for (let i = 0; i < 4; i++) box(g, pick([m.cloth, m.paper, m.tarps[0]]), rr(0.2, 0.4), rr(0.15, 0.3), rr(0.2, 0.4), rr(-0.15, 0.15), 0.75, rr(-0.3, 0.3), R(), R(), R());
  g.position.set(x, 0, z); g.rotation.set(0, rot, R() < 0.4 ? 1.4 : 0); if (g.rotation.z) g.position.y = 0.3;
  scene.add(g);
}

export function busStop(scene, x, z, rot) {
  const m = mats(), g = new THREE.Group();
  for (const s of [-1.4, 1.4]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), m.iron, g, s, 1.25, -0.6, 0.01);
  box(g, m.iron, 3.2, 0.08, 1.4, 0, 2.5, -0.1, 0.06, 0, 0.04, 0.015);
  box(g, m.glass, 2.8, 1.8, 0.03, 0, 1.3, -0.65);
  box(g, m.wood, 2.2, 0.06, 0.4, 0, 0.5, -0.4);
  box(g, toon(0xffffff, { map: signTex('H', '#d8b030', '#204020', 128, 128) }), 0.4, 0.4, 0.03, 1.6, 2.2, 0.2, 0, 0, 0, 0.01);
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  blockRot(x, z, 0.4, 3.0, rot + Math.PI / 2);
}

export function manhole(scene, x, z) {
  const m = mats();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), m.iron); c.position.set(x, 0.015, z); c.receiveShadow = true; scene.add(c);
}

/** Pfütze: spiegelt den Himmel (eigenes Material mit Glanz) */
export function puddle(scene, x, z, s) {
  const m = mats(), sh = new THREE.Shape();
  const n = 12;
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, r = s * rr(0.7, 1.1); const px = Math.cos(a) * r * 1.4, pz = Math.sin(a) * r; if (i === 0) sh.moveTo(px, pz); else sh.lineTo(px, pz); }
  const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2);
  const p = new THREE.Mesh(geo, m.puddle); p.position.set(x, 0.012, z); p.rotation.y = R() * TAU; p.receiveShadow = true;
  p.userData.noMerge = true;
  scene.add(p);
}

export function papers(scene, x0, x1, z0, z1, n) {
  const m = mats(), geo = new THREE.PlaneGeometry(0.28, 0.36);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(geo, m.paper); p.position.set(rr(x0, x1), 0.02, rr(z0, z1)); p.rotation.set(-Math.PI / 2 + rr(-0.15, 0.15), 0, R() * TAU); p.receiveShadow = true;
    scene.add(p);
  }
}

// ---------- Schutt ----------
const RUB = [0x6e6158, 0x5a4e46, 0x7c6a58, 0x4a403a, 0x7a4636];
export function rubble(scene, x, z, s, solid) {
  const m = mats(), g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const r = rr(0.2, 0.55) * s;
    const geo = R() < 0.5 ? new THREE.DodecahedronGeometry(r, 0) : new THREE.BoxGeometry(r * 2, r * rr(0.5, 1), r * rr(1, 2));
    const q = mesh(geo, R() < 0.3 ? m.concrete : toon(RUB[i % RUB.length]), g, rr(-0.8, 0.8) * s, r * 0.45, rr(-0.8, 0.8) * s, 0.02);
    q.rotation.set(R() * 3, R() * 3, R() * 3);
  }
  for (let i = 0; i < 10; i++) box(g, toon(0x7a4636), 0.22, 0.07, 0.11, rr(-1.2, 1.2) * s, 0.04, rr(-1.2, 1.2) * s, 0, R() * 3, 0); // Ziegel
  for (let i = 0; i < 2; i++) box(g, i ? m.wood : m.rust, rr(1.2, 2.4) * s, 0.12, 0.22, rr(-0.5, 0.5) * s, 0.3 * s, rr(-0.5, 0.5) * s, rr(-0.4, 0.4), R() * 3, rr(-0.4, 0.4), 0.015);
  for (let i = 0; i < 3; i++) { const b = mesh(new THREE.CylinderGeometry(0.015, 0.015, rr(0.8, 1.6), 4), m.rust, g, rr(-0.6, 0.6) * s, 0.5 * s, rr(-0.6, 0.6) * s); b.rotation.set(rr(-1, 1), 0, rr(-1, 1)); }
  g.position.set(x, 0, z);
  scene.add(g);
  if (solid) block(x, z, 1.6 * s, 1.6 * s);
}

/** Betonplatte (eingestürzt, schräg) */
export function slab(scene, x, z, w, d, rot, tilt) {
  const m = mats();
  const s = box(scene, m.concrete, w, 0.3, d, x, Math.sin(Math.abs(tilt)) * d / 2, z, tilt, rot, 0, 0.03);
  for (let i = 0; i < 4; i++) { const b = mesh(new THREE.CylinderGeometry(0.015, 0.015, rr(0.5, 1.2), 4), m.rust, scene, x + rr(-w / 2, w / 2), s.position.y + 0.3, z + rr(-0.3, 0.3)); b.rotation.set(rr(-1, 1), 0, rr(-1, 1)); }
  blockRot(x, z, Math.min(w, d), Math.max(w, d), rot + (w > d ? Math.PI / 2 : 0));
}

// ---------- Feuer, Rastpunkt, Übungspuppen ----------
export const fires = [];
export function fireBarrel(scene, x, z) {
  const m = mats(), g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.38, 0.35, 0.95, 14), m.rust, g, 0, 0.48, 0, 0.025);
  for (const y of [0.2, 0.75]) { const r = mesh(new THREE.TorusGeometry(0.385, 0.03, 6, 18), m.iron, g, 0, y, 0); r.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 5; i++) { const h = mesh(new THREE.CircleGeometry(0.05, 6), new THREE.MeshBasicMaterial({ color: 0xff8a30 }), g, Math.sin(i * 1.3) * 0.38, 0.35 + (i % 2) * 0.2, Math.cos(i * 1.3) * 0.38); h.lookAt(Math.sin(i * 1.3) * 2, 0.35, Math.cos(i * 1.3) * 2); }
  const fl = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: i ? 0xff7a2a : 0xffe0a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.y = 1.05 + i * 0.16; g.add(s); fl.push(s);
  }
  const light = new THREE.PointLight(0xff8a3a, 14, 12, 1.6); light.position.y = 1.4; light.castShadow = false; g.add(light);
  g.position.set(x, 0, z); scene.add(g);
  block(x, z, 0.8, 0.8);
  fires.push({ fl, light, ph: R() * 10, base: 14, pos: new THREE.Vector3(x, 1.1, z), smoke: true });
}

export function cardTable(scene, x, z) {
  const m = mats(), g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.62, 0.6, 0.06, 20), toon(0x245a38), g, 0, 0.78, 0, 0.02);
  mesh(new THREE.TorusGeometry(0.62, 0.03, 6, 24), m.wood, g, 0, 0.8, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.75, 8), m.wood, g, 0, 0.38, 0, 0.015);
  mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.05, 12), m.wood, g, 0, 0.03, 0, 0.012);
  for (let i = 0; i < 7; i++) {
    const c = box(g, toon(i % 2 ? 0xf2e6cc : 0xe8d4b0), 0.12, 0.005, 0.17, -0.25 + i * 0.07, 0.815 + i * 0.001, 0.1 + Math.sin(i) * 0.06, 0, -0.5 + i * 0.18, 0);
  }
  for (let i = 0; i < 6; i++) mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 10), toon(i % 3 ? 0x8a1a14 : 0xd8b04a), g, 0.3, 0.82 + i * 0.013, 0.25);
  mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), toon(0xefe4cc), g, 0.25, 0.91, -0.15, 0.01);
  for (const a of [0, 2.1, 4.2]) { // Stühle
    const c = new THREE.Group(); c.position.set(Math.sin(a) * 1.0, 0, Math.cos(a) * 1.0); c.rotation.y = a + Math.PI; g.add(c);
    box(c, m.wood, 0.45, 0.05, 0.45, 0, 0.46, 0, 0, 0, 0, 0.01);
    for (const [sx, sz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(c, m.wood, 0.04, 0.46, 0.04, sx, 0.23, sz);
    box(c, m.wood, 0.45, 0.5, 0.04, 0, 0.72, 0.21, 0, 0, 0, 0.01);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffd28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(0.35); s.position.set(0.25, 1.06, -0.15); g.add(s);
  const light = new THREE.PointLight(0xffc070, 4, 6, 1.8); light.position.set(0.25, 1.15, -0.15); g.add(light);
  g.position.set(x, 0, z); scene.add(g);
  block(x, z, 1.3, 1.3);
  fires.push({ fl: [s], light, ph: 3, base: 4, candle: true });
}

export const targets = [];
export function dummy(scene, x, z) {
  const g = new THREE.Group();
  const m = mats();
  mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8), m.wood, g, 0, 0.95, 0, 0.02);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), m.wood, g, 0, 1.45, 0, 0.02).rotation.z = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.75, 12), toon(0x8a7650), g, 0, 1.2, 0, 0.025);
  for (const y of [1.0, 1.4]) { const r = mesh(new THREE.TorusGeometry(0.29, 0.02, 4, 14), toon(0x4a3a24), g, 0, y, 0); r.rotation.x = Math.PI / 2; }
  mesh(new THREE.SphereGeometry(0.22, 12, 10), toon(0x9a8460), g, 0, 1.8, 0, 0.02);
  mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.18, 12), m.rust, g, 0, 2.0, 0, 0.015);
  const x1 = box(g, toon(0x1a0e0a), 0.16, 0.03, 0.02, -0.08, 1.82, 0.21, 0, 0, 0.7); const x2 = x1.clone(); x2.rotation.z = -0.7; g.add(x2);
  mesh(new THREE.SphereGeometry(0.03, 6, 6), toon(0x1a0e0a), g, 0.08, 1.83, 0.2);
  g.traverse((o) => { o.userData.noMerge = true; }); // eigene Meshes, damit sie bei Treffern wackeln können
  g.position.set(x, 0, z); g.rotation.y = R() * TAU;
  scene.add(g);
  block(x, z, 0.5, 0.5);
  targets.push({ node: g, pos: new THREE.Vector3(x, 1.3, z), name: 'Schrottpuppe' });
}
