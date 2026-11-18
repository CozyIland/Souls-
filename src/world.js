// Testgelände: verfallene Kreuzung in der toten Stadt. Ruinen, Autowracks, Feuertonnen, Asche in der Luft.
// Alles aus Grundformen + selbst gemalten Texturen. Kollision über einfache Rechtecke (AABB).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, toon, outline } from './toon.js';
import { seeded, TAU } from './util.js';

const R = seeded(7);
const rr = (a, b) => a + R() * (b - a);

// ---------- Kollision ----------
export const colliders = []; // {x0, x1, z0, z1}
export const blockers = [];  // Hauswände: die Kamera fährt nicht hindurch
function block(x, z, w, d) { colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); }

/** Kreis (x, z, r) aus allen Hindernissen herausschieben */
export function resolve(p, r) {
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else { // Mitte steckt drin: zur nächsten Kante
      const m = [p.x - c.x0, c.x1 - p.x, p.z - c.z0, c.z1 - p.z], i = m.indexOf(Math.min(...m));
      if (i === 0) p.x = c.x0 - r; else if (i === 1) p.x = c.x1 + r; else if (i === 2) p.z = c.z0 - r; else p.z = c.z1 + r;
    }
  }
}

// ---------- Texturen ----------
function canvasTex(w, h, draw, rep) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 4;
  return t;
}

function asphalt() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4440'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 50 + R() * 40; g.fillStyle = `rgba(${v},${v - 4},${v - 8},0.5)`; g.fillRect(R() * w, R() * h, 2, 2); }
    g.strokeStyle = 'rgba(20,14,12,0.75)'; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) { // Risse
      let x = R() * w, y = R() * h, a = R() * TAU; g.lineWidth = 1 + R() * 2.5; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 10; j++) { a += (R() - 0.5) * 1.2; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 10; i++) { // Ölflecken / Brandspuren
      const x = R() * w, y = R() * h, s = 20 + R() * 50, gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, 'rgba(15,10,8,0.45)'); gr.addColorStop(1, 'rgba(15,10,8,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  }, [16, 16]);
}

function facade(base, win) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.12})`; g.fillRect(R() * w, R() * h, 3, 3); }
    for (let y = 24; y < h - 20; y += 64) for (let x = 20; x < w - 30; x += 58) {
      const t = R();
      g.fillStyle = t < 0.18 ? '#6b5236' : t < 0.25 ? '#c98a3a' : win; // Bretter / selten Licht / dunkel
      g.fillRect(x, y, 34, 40);
      if (t < 0.18) { g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x + 34, y + 14); g.moveTo(x, y + 28); g.lineTo(x + 34, y + 24); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + 40, 34, 4);
    }
    const gr = g.createLinearGradient(0, h * 0.6, 0, h); gr.addColorStop(0, 'rgba(10,6,4,0)'); gr.addColorStop(1, 'rgba(10,6,4,0.55)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); // Ruß unten
    g.strokeStyle = 'rgba(15,10,8,0.6)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (R() - 0.5) * 30; y += 18; g.lineTo(x, y); } g.stroke(); }
  });
}

function skyTex() {
  return canvasTex(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a1d2e'); gr.addColorStop(0.45, '#6d3d36'); gr.addColorStop(0.62, '#c46a3a'); gr.addColorStop(0.72, '#7a4434'); gr.addColorStop(1, '#2a1a16');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// ---------- Bausteine ----------
const FAC = [['#7a6a5c', '#1d1714'], ['#6c5f63', '#17131a'], ['#8a6e52', '#21170f'], ['#5e6660', '#121614'], ['#87705e', '#1b1410']];
const facMats = FAC.map(([b, w]) => { const t = facade(b, w); return { t }; });

function building(scene, x, z, w, d, h) {
  const f = facMats[Math.floor(R() * facMats.length)];
  const tex = f.t.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 8)));
  const m = part(new THREE.BoxGeometry(w, h, d), 0xffffff, 0.06, { map: tex });
  m.position.set(x, h / 2, z);
  scene.add(m);
  blockers.push(m);
  block(x, z, w, d);
  // Zerbrochene Oberkante: Mauerreste und eingestürzte Ecken
  const n = 2 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const bw = rr(1, w * 0.45), bh = rr(0.6, 2.8), bd = rr(1, d * 0.45);
    const b = part(new THREE.BoxGeometry(bw, bh, bd), 0x5a4c42, 0.04);
    b.position.set(x + rr(-w / 2 + bw / 2, w / 2 - bw / 2), h + bh / 2 - 0.2, z + rr(-d / 2 + bd / 2, d / 2 - bd / 2));
    b.rotation.set(rr(-0.15, 0.15), rr(-0.3, 0.3), rr(-0.15, 0.15));
    scene.add(b);
  }
  // Schuttberg am Fuß
  if (R() < 0.6) rubble(scene, x + rr(-w / 3, w / 3), z + (z > 0 ? -d / 2 : d / 2) * (Math.abs(x) < 12 ? 0 : 1), 1.4, false);
}

const RUB = [0x6e6158, 0x5a4e46, 0x7c6a58, 0x4a403a];
function rubble(scene, x, z, s, solid) {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const r = rr(0.25, 0.6) * s;
    const m = part(new THREE.DodecahedronGeometry(r, 0), RUB[i % RUB.length], 0.025);
    m.position.set(rr(-0.8, 0.8) * s, r * 0.5, rr(-0.8, 0.8) * s);
    m.rotation.set(R() * 3, R() * 3, R() * 3);
    g.add(m);
  }
  for (let i = 0; i < 2; i++) { // Bretter/Stahlträger
    const m = part(new THREE.BoxGeometry(rr(1.2, 2.2) * s, 0.12, 0.25), i ? 0x3d2c22 : 0x4c4f55, 0.02);
    m.position.set(rr(-0.5, 0.5) * s, 0.3 * s, rr(-0.5, 0.5) * s); m.rotation.set(rr(-0.4, 0.4), R() * 3, rr(-0.4, 0.4));
    g.add(m);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  if (solid) block(x, z, 1.6 * s, 1.6 * s);
}

const CARC = [0x5e7a78, 0x8a4a38, 0x6a6a4a, 0x4a5466, 0x7a6450];
function car(scene, x, z, rot, burnt) {
  const g = new THREE.Group();
  const col = burnt ? 0x3a302c : CARC[Math.floor(R() * CARC.length)];
  const body = part(new THREE.BoxGeometry(1.9, 0.75, 4.2), col, 0.03); body.position.y = 0.65; g.add(body);
  const cab = part(new THREE.BoxGeometry(1.7, 0.6, 2.1), col, 0.03); cab.position.set(0, 1.3, -0.2); g.add(cab);
  const glass = part(new THREE.BoxGeometry(1.72, 0.42, 1.6), 0x1a2226, 0); glass.position.set(0, 1.32, -0.2); g.add(glass);
  for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
    if (R() < 0.25) continue; // Rad fehlt
    const w = part(new THREE.CylinderGeometry(0.34, 0.34, 0.28, 12), 0x1a1614, 0.02); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.34, wz); g.add(w);
  }
  if (R() < 0.5) { const rust = part(new THREE.BoxGeometry(1.92, 0.3, 1.4), 0x7a3e1e, 0); rust.position.set(0, 0.5, rr(-1.2, 1.2)); g.add(rust); }
  g.position.set(x, 0, z); g.rotation.set(0, rot, burnt ? 0.06 : rr(-0.04, 0.04));
  scene.add(g);
  // Kollision: gedrehtes Auto grob als Quadrat-Kette
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const k of [-1.3, 0, 1.3]) block(x + s * k, z + c * k, 1.9, 1.9);
}

function lamp(scene, x, z, bent) {
  const g = new THREE.Group();
  const pole = part(new THREE.CylinderGeometry(0.07, 0.1, 5, 8), 0x2e2a28, 0.02); pole.position.y = 2.5; g.add(pole);
  const arm = part(new THREE.BoxGeometry(1.2, 0.08, 0.08), 0x2e2a28, 0.015); arm.position.set(0.55, 4.95, 0); g.add(arm);
  const head = part(new THREE.BoxGeometry(0.45, 0.15, 0.25), 0x1e1a18, 0.015); head.position.set(1.1, 4.88, 0); g.add(head);
  g.position.set(x, 0, z); g.rotation.set(0, x > 0 ? Math.PI : 0, bent ? (x > 0 ? 0.35 : -0.35) : 0);
  scene.add(g);
  block(x, z, 0.3, 0.3);
}

// ---------- Feuer ----------
function glowTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}
const GLOW = glowTex();
const fires = [];
function fireBarrel(scene, x, z) {
  const g = new THREE.Group();
  const b = part(new THREE.CylinderGeometry(0.38, 0.35, 0.95, 14), 0x5a3a26, 0.025); b.position.y = 0.48; g.add(b);
  for (const y of [0.2, 0.75]) { const r = part(new THREE.TorusGeometry(0.385, 0.03, 6, 18), 0x2e2420, 0); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  const fl = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: i ? 0xff7a2a : 0xffe0a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.y = 1.05 + i * 0.18; g.add(s); fl.push(s);
  }
  const light = new THREE.PointLight(0xff8a3a, 14, 11, 1.6); light.position.y = 1.4; g.add(light);
  g.position.set(x, 0, z); scene.add(g);
  block(x, z, 0.8, 0.8);
  fires.push({ fl, light, ph: R() * 10 });
}

// Spieltisch (späterer Rastpunkt): Tisch, Karten, Kerze
function cardTable(scene, x, z) {
  const g = new THREE.Group();
  const top = part(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 18), 0x2c5a3c, 0.02); top.position.y = 0.78; g.add(top);
  const leg = part(new THREE.CylinderGeometry(0.06, 0.1, 0.75, 8), 0x3a2618, 0.015); leg.position.y = 0.38; g.add(leg);
  for (let i = 0; i < 5; i++) {
    const c = part(new THREE.BoxGeometry(0.12, 0.005, 0.17), i % 2 ? 0xf2e6cc : 0xe8d4b0, 0);
    c.position.set(-0.2 + i * 0.08, 0.815, 0.1 + Math.sin(i) * 0.05); c.rotation.y = -0.4 + i * 0.2; g.add(c);
  }
  const candle = part(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), 0xefe4cc, 0.01); candle.position.set(0.25, 0.91, -0.15); g.add(candle);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffd28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(0.35); s.position.set(0.25, 1.06, -0.15); g.add(s);
  const light = new THREE.PointLight(0xffc070, 4, 6, 1.8); light.position.set(0.25, 1.15, -0.15); g.add(light);
  g.position.set(x, 0, z); scene.add(g);
  block(x, z, 1.2, 1.2);
  fires.push({ fl: [s], light, ph: 3, candle: true });
}

// ---------- Übungsziele (Schrottpuppen) ----------
export const targets = [];
function dummy(scene, x, z) {
  const g = new THREE.Group();
  const post = part(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8), 0x4a3424, 0.02); post.position.y = 0.95; g.add(post);
  const bar = part(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), 0x4a3424, 0.02); bar.rotation.z = Math.PI / 2; bar.position.y = 1.45; g.add(bar);
  const sack = part(new THREE.CylinderGeometry(0.3, 0.26, 0.75, 12), 0x8a7650, 0.025); sack.position.y = 1.2; g.add(sack);
  const head = part(new THREE.SphereGeometry(0.22, 12, 10), 0x9a8460, 0.02); head.position.y = 1.8; g.add(head);
  const pot = part(new THREE.CylinderGeometry(0.2, 0.24, 0.18, 12), 0x5a5e62, 0.015); pot.position.y = 2.0; g.add(pot);
  const x1 = part(new THREE.BoxGeometry(0.16, 0.03, 0.02), 0x1a0e0a, 0); x1.position.set(-0.08, 1.82, 0.21); x1.rotation.z = 0.7; g.add(x1);
  const x2 = x1.clone(); x2.rotation.z = -0.7; g.add(x2);
  const ey = part(new THREE.SphereGeometry(0.03, 6, 6), 0x1a0e0a, 0); ey.position.set(0.08, 1.83, 0.2); g.add(ey);
  g.position.set(x, 0, z); g.rotation.y = R() * TAU;
  scene.add(g);
  block(x, z, 0.5, 0.5);
  targets.push({ node: g, pos: new THREE.Vector3(x, 1.3, z), name: 'Schrottpuppe' });
}

// ---------- Asche in der Luft ----------
let ash = null;
function ashCloud(scene) {
  const N = 1400, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rr(-25, 25); pos[i * 3 + 1] = rr(0, 18); pos[i * 3 + 2] = rr(-25, 25); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ash = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8ccbe, map: GLOW, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
  ash.frustumCulled = false;
  scene.add(ash);
}

// ---------- Aufbau ----------
export function buildWorld(scene, renderer) {
  scene.background = skyTex();
  scene.fog = new THREE.Fog(0x6a4436, 18, 70);

  scene.add(new THREE.HemisphereLight(0x9a7a9a, 0x3a2a20, 1.1));
  const sun = new THREE.DirectionalLight(0xffb27a, 2.4);
  sun.position.set(-18, 22, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Boden: Asphalt + Gehwege + Fahrbahnmarkierung
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toon(0xffffff, { map: asphalt() }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const walk = toon(0x7a6e66);
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 110), walk); a.position.set(s * 8.5, 0.06, 0); a.receiveShadow = true; scene.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(90, 0.12, 3), walk); b.position.set(0, 0.06, s * 8.5); b.receiveShadow = true; scene.add(b);
  }
  const lineM = toon(0xc9a24a);
  for (let z = -52; z < 52; z += 6) { if (Math.abs(z) < 10) continue; const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 2.6), lineM); l.position.set(0, 0.011, z); scene.add(l); }

  // Häuserblöcke links/rechts der Hauptstraße und an der Querstraße
  const row = (fixed, from, to, side, axis) => {
    let p = from;
    while (p < to) {
      const w = rr(7, 13), d = rr(9, 14), h = rr(7, 20);
      const c = Math.min(p + w, to) - p;
      if (c > 3) {
        if (axis === 'z') building(scene, side * (fixed + d / 2), p + c / 2, d, c, h);
        else building(scene, p + c / 2, side * (fixed + d / 2), c, d, h);
      }
      p += w + rr(0, 1.5);
    }
  };
  for (const s of [-1, 1]) {
    row(10, -60, -10, s, 'z'); row(10, 10, 60, s, 'z');
    row(10, -50, -10, s, 'x'); row(10, 10, 50, s, 'x');
  }
  // Ränder: Barrikaden aus Bus, Schutt und Zäunen
  for (const [x, z, r] of [[0, -56, 0.3], [0, 56, -0.2], [-46, 0, 1.4], [46, 0, 1.7]]) {
    car(scene, x, z, r + Math.PI / 2, true);
    rubble(scene, x + 3, z + 1, 2.2, true); rubble(scene, x - 3, z - 1, 2.2, true);
  }
  block(0, -58, 24, 2); block(0, 58, 24, 2); block(-48, 0, 2, 24); block(48, 0, 2, 24);

  // Autowracks, Laternen, Schutt, Feuer
  car(scene, -4.5, -20, 0.15, false); car(scene, 3.8, -33, Math.PI + 0.4, true); car(scene, -3, 24, -0.3, false);
  car(scene, 18, 3.5, Math.PI / 2 + 0.2, false); car(scene, -24, -3, Math.PI / 2 - 0.5, true); car(scene, 4.5, 40, 2.7, false);
  for (const z of [-44, -26, 18, 34]) lamp(scene, z % 2 ? 7.4 : -7.4, z, R() < 0.5);
  lamp(scene, -7.4, -12, true); lamp(scene, 7.4, 12, false);
  for (let i = 0; i < 12; i++) rubble(scene, rr(-6, 6), rr(-50, 50) * (R() < 0.5 ? 1 : 1), rr(0.4, 0.9), false);
  for (let i = 0; i < 6; i++) rubble(scene, rr(-40, 40), rr(-6, 6), rr(0.4, 0.9), false);
  fireBarrel(scene, 5.5, -8.5); fireBarrel(scene, -28, 5); fireBarrel(scene, -6, 30);
  cardTable(scene, -8.2, 7.8);

  dummy(scene, 2.5, -14); dummy(scene, -3.5, -16); dummy(scene, 12, -2.5); dummy(scene, 0.5, 12);

  mergeStatic(scene);
  ashCloud(scene);
  return { sun };
}

/**
 * Alle festen Teile nach Material zu wenigen großen Meshes zusammenfassen.
 * Sonst wäre jedes Trümmerstück ein eigener Zeichenaufruf (vorher ~640, danach ~30).
 */
function mergeStatic(scene) {
  scene.updateMatrixWorld(true);
  const buckets = new Map(), old = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
    buckets.get(key).list.push(g);
    old.push(o);
  });
  for (const o of old) if (o.parent) o.parent.remove(o); // Kamera-Strahlen nutzen weiter die alten Hauswände (matrixWorld bleibt)
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.list, false), b.mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv;
    m.frustumCulled = false;
    scene.add(m);
  }
}

const sunOff = new THREE.Vector3(-18, 22, -10);
export function updateWorld(dt, t, w, focus) {
  // Schatten folgen der Spielfigur
  w.sun.position.copy(focus).add(sunOff); w.sun.target.position.copy(focus);
  for (const f of fires) {
    const k = 0.8 + 0.2 * Math.sin(t * 13 + f.ph) * Math.sin(t * 7.7 + f.ph * 2);
    f.light.intensity = (f.candle ? 4 : 14) * k;
    f.fl.forEach((s, i) => {
      if (f.candle) { s.scale.setScalar(0.3 + 0.05 * k); return; }
      const sc = (0.9 - i * 0.22) * (0.85 + 0.25 * Math.sin(t * (10 + i * 3) + f.ph + i));
      s.scale.set(sc * 0.9, sc * 1.3, 1); s.position.x = Math.sin(t * 8 + i + f.ph) * 0.05;
    });
  }
  // Asche treibt um die Kamera
  const a = ash.geometry.attributes.position, p = a.array;
  for (let i = 0; i < p.length; i += 3) {
    p[i + 1] -= dt * (0.35 + (i % 7) * 0.05); p[i] += Math.sin(t * 0.5 + i) * dt * 0.25;
    if (p[i + 1] < 0) p[i + 1] += 18;
  }
  a.needsUpdate = true;
  ash.position.set(Math.round(focus.x / 50) * 50, 0, Math.round(focus.z / 50) * 50);
}
