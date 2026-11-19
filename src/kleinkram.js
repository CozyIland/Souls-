// Stufe 2 – Kleinkram, der eine Straße glaubwürdig macht: Schutthaufen aus kantigen Brocken, verstreute Steinchen und Ziegel,
// Müllsäcke, kahle Bäume in Baumscheiben, Gestrüpp. Viele kleine Teile laufen als InstancedMesh (ein Zeichenaufruf je Sorte).
import * as THREE from 'three';
import { toon, outline } from './toon.js';
import { seeded, TAU } from './util.js';
import { block } from './kollision.js';
import { canvasTex, concreteTex } from './texturen.js';

const R = seeded(404);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));

// ---------- Brocken-Geometrie: Ikosaeder mit Rauschen, kantig schattiert ----------
function h3(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
export function rockGeo(rough = 0.35, flat = 0.7, seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (h3(x * 3 + seed, y * 3, z * 3) - 0.5) * 2 * rough;
    p.setXYZ(i, x * k, y * k * flat, z * k);
  }
  g.computeVertexNormals();
  return g;
}
/** Betonbrocken: Kasten mit abgeschlagenen Ecken */
function chunkGeo(seed) {
  const g = new THREE.BoxGeometry(1, 0.5, 0.8, 2, 1, 2).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = h3(x * 5 + seed, y * 5, z * 5);
    p.setXYZ(i, x * (0.8 + n * 0.35), y * (0.8 + h3(z, x, seed) * 0.4), z * (0.8 + h3(y, seed, x) * 0.35));
  }
  g.computeVertexNormals();
  return g;
}

let M = null;
function mats() {
  if (M) return M;
  const conc = concreteTex();
  M = {
    rock: [toon(0x6e6158), toon(0x7c7468), toon(0x5a504a), toon(0x8a8478)],
    conc: toon(0xffffff, { map: conc }),
    brick: toon(0x7a4636), brick2: toon(0x8e5440),
    rebar: toon(0x4a2e1e),
    gravel: toon(0x4a4038),
    bag: [toon(0x1c1c20), toon(0x23302a), toon(0x2a2a30)],
    bark: toon(0x3a2c22), soil: toon(0x2e241c), grate: toon(0x2a2826),
    leaf: toon(0xffffff, { map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide }),
    deco: toon(0xffffff, { vertexColors: false }),
  };
  return M;
}

function leafTex() {
  const r = seeded(9);
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 180; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.9 * Math.sqrt(r()), y = h * (0.15 + r() * 0.85);
      const c = r() < 0.3 ? [96 + r() * 30, 88 + r() * 20, 40] : [44 + r() * 30, 64 + r() * 40, 28 + r() * 16];
      g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      g.beginPath(); g.ellipse(x, y, 4 + r() * 7, 3 + r() * 4, r() * 3, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgb(54,40,28)'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 + (r() - 0.5) * 80, h * 0.6, w * (0.2 + r() * 0.6), h * (0.15 + r() * 0.3)); g.stroke(); }
  }, { clamp: true });
}

function addMesh(scene, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz, line = 0.02) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  if (line) outline(m, line);
  scene.add(m); return m;
}

// ---------- Schutthaufen ----------
const ROCKS = [rockGeo(0.35, 0.65, 1), rockGeo(0.45, 0.55, 2), rockGeo(0.3, 0.8, 3)];
const CHUNKS = [chunkGeo(1), chunkGeo(2), chunkGeo(3)];
/** Schutthaufen (Größe s ≈ Radius in m): Kieshügel, Brocken, Betonplatten-Stücke, Ziegel, Eisen */
export function rubbleHeap(scene, x, z, s, solid) {
  const m = mats();
  // flacher Kieshügel als Unterlage
  const mound = rockGeo(0.25, 1, 7);
  addMesh(scene, mound, m.gravel, x, -0.08, z, 0, R() * TAU, 0, s * 1.1, s * 0.3, s * 0.95, 0);
  for (let i = 0; i < 7 + s * 6; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * s * 1.1, r = rr(0.12, 0.35) * Math.min(1.5, s);
    const big = R() < 0.45;
    addMesh(scene, big ? CHUNKS[ri(0, 2)] : ROCKS[ri(0, 2)], big ? m.conc : m.rock[ri(0, 3)],
      x + Math.cos(a) * d, r * 0.4 + (1 - d / (s * 1.2)) * s * 0.25, z + Math.sin(a) * d, rr(-0.6, 0.6), R() * TAU, rr(-0.6, 0.6),
      r * (big ? 1.8 : 1), r, r * (big ? 1.6 : 1), big ? 0.025 : 0.018);
  }
  for (let i = 0; i < 4 + s * 4; i++) { // Ziegel
    const a = R() * TAU, d = rr(0.3, 1.5) * s;
    addMesh(scene, BRICK, R() < 0.5 ? m.brick : m.brick2, x + Math.cos(a) * d, 0.05, z + Math.sin(a) * d, rr(-0.3, 0.3), R() * TAU, rr(-0.3, 0.3), 1, 1, 1, 0);
  }
  for (let i = 0; i < 3; i++) { // Bewehrungseisen
    const b = addMesh(scene, REBAR, m.rebar, x + rr(-0.5, 0.5) * s, 0.3 * s, z + rr(-0.5, 0.5) * s, rr(-1, 1), R() * 3, rr(-1, 1), 1, rr(0.6, 1.4), 1, 0);
    void b;
  }
  if (solid) block(x, z, 1.7 * s, 1.7 * s);
}
const BRICK = new THREE.BoxGeometry(0.22, 0.07, 0.11);
const REBAR = new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4);

// ---------- verstreute Steinchen und Ziegel (InstancedMesh) ----------
export function scatter(scene, spots) {
  const m = mats();
  const geo = rockGeo(0.4, 0.6, 11);
  const n = spots.length;
  const im = new THREE.InstancedMesh(geo, toon(0xffffff), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const cols = [0x6e6158, 0x7c7468, 0x5a504a, 0x8a8478, 0x7a4636, 0x8a7a68];
  spots.forEach(([x, z, k], i) => {
    const sc = k * rr(0.04, 0.14);
    e.set(R() * 3, R() * 3, R() * 3); q.setFromEuler(e); s.set(sc * rr(1, 1.8), sc, sc * rr(1, 1.5)); p.set(x, sc * 0.35, z);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
    im.setColorAt(i, c.setHex(cols[ri(0, cols.length - 1)]));
  });
  im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
  scene.add(im);
  void m;
  return im;
}

// ---------- Müllsäcke ----------
const BAG = (() => { const g = rockGeo(0.18, 0.8, 21); g.translate(0, 0.8, 0); return g; })();
export function trashBags(scene, x, z, n) {
  const m = mats();
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = R() * 0.6, s = rr(0.28, 0.42);
    const b = addMesh(scene, BAG, m.bag[ri(0, 2)], x + Math.cos(a) * d, 0, z + Math.sin(a) * d, rr(-0.2, 0.2), R() * TAU, rr(-0.2, 0.2), s, s * rr(0.7, 1), s, 0.015);
    // Knoten oben
    addMesh(scene, KNOT, b.material, b.position.x, s * 1.5, b.position.z, 0, 0, rr(-0.4, 0.4), 1, 1, 1, 0);
  }
}
const KNOT = new THREE.ConeGeometry(0.05, 0.12, 5);

// ---------- kahle Bäume in Baumscheiben ----------
function branch(list, from, dir, len, r, depth) {
  const to = from.clone().addScaledVector(dir, len);
  list.push({ from, to, r });
  if (depth <= 0) return;
  const n = depth > 1 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const d = dir.clone().add(new THREE.Vector3(rr(-0.9, 0.9), rr(0.0, 0.6), rr(-0.9, 0.9))).normalize();
    branch(list, from.clone().lerp(to, rr(0.55, 1)), d, len * rr(0.5, 0.72), r * 0.6, depth - 1);
  }
}
export function deadTree(scene, x, z) {
  const m = mats();
  const parts = [];
  branch(parts, new THREE.Vector3(0, 0, 0), new THREE.Vector3(rr(-0.1, 0.1), 1, rr(-0.1, 0.1)).normalize(), rr(2.2, 3.0), 0.13, 3);
  const geos = [];
  for (const p of parts) {
    const len = p.from.distanceTo(p.to);
    const g = new THREE.CylinderGeometry(p.r * 0.65, p.r, len, 6, 1);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.to.clone().sub(p.from).normalize());
    g.applyQuaternion(q); g.translate(p.from.x, p.from.y, p.from.z);
    geos.push(g.toNonIndexed());
  }
  // einzelne Blätterbüschel (fast tot)
  const tree = new THREE.Group(); tree.position.set(x, 0, z); scene.add(tree);
  for (const g of geos) { const me = new THREE.Mesh(g, m.bark); me.castShadow = true; me.receiveShadow = true; tree.add(me); }
  for (const p of parts.slice(-5)) if (R() < 0.6) {
    const s = rr(0.6, 1.1), l = new THREE.Mesh(LEAFQ, m.leaf); l.position.copy(p.to); l.scale.setScalar(s); l.rotation.y = R() * TAU; tree.add(l);
  }
  // Baumscheibe mit Erde und Gitter
  addMesh(scene, new THREE.BoxGeometry(1.2, 0.06, 1.2), m.soil, x, 0.06, z, 0, 0, 0, 1, 1, 1, 0);
  for (const [a, b, w, d] of [[0, 0.6, 1.25, 0.06], [0, -0.6, 1.25, 0.06], [0.6, 0, 0.06, 1.25], [-0.6, 0, 0.06, 1.25]]) addMesh(scene, new THREE.BoxGeometry(w, 0.1, d), m.grate, x + a, 0.1, z + b, 0, 0, 0, 1, 1, 1, 0);
  block(x, z, 0.4, 0.4);
}
const LEAFQ = (() => { const a = new THREE.PlaneGeometry(1, 1); const b = a.clone(); b.rotateY(Math.PI / 2); const g = new THREE.BufferGeometry(); const pa = a.toNonIndexed(), pb = b.toNonIndexed(); g.setAttribute('position', new THREE.Float32BufferAttribute([...pa.attributes.position.array, ...pb.attributes.position.array], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([...pa.attributes.normal.array, ...pb.attributes.normal.array], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([...pa.attributes.uv.array, ...pb.attributes.uv.array], 2)); return g; })();

// ---------- Gestrüpp (Büsche aus Blätterkreuzen) ----------
export function bush(scene, x, z, s = 1) {
  const m = mats();
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(LEAFQ, m.leaf);
    l.position.set(x + rr(-0.3, 0.3) * s, 0.45 * s, z + rr(-0.3, 0.3) * s); l.scale.set(s * rr(0.9, 1.3), s * rr(0.8, 1.1), s * rr(0.9, 1.3)); l.rotation.y = R() * TAU;
    l.receiveShadow = true;
    scene.add(l);
  }
}
