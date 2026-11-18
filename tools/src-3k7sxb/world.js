// Testgelände: verfallene Kreuzung in der toten Stadt.
// Häuser mit Läden und Feuerleitern, Gehwege mit Bordstein, Autowracks, Strommasten, Zeltlager, Unkraut, Pfützen,
// Skyline am Horizont, Rauchsäulen und Asche in der Luft. Kollision über Rechtecke (kollision.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';
import { seeded, TAU } from './util.js';
import { block, colliders, blockers, resolve } from './kollision.js';
import { asphaltTex, sidewalkTex, concreteTex, skyTex, skylineTex, weedTex, smokeTex } from './texturen.js';
import { building, FLOOR } from './gebaeude.js';
import * as P from './requisiten.js';

export { colliders, blockers, resolve };
export const targets = P.targets;

const R = seeded(7);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));

// ---------- Boden ----------
function ground(scene) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon(0xffffff, { map: asphaltTex() }));
  g.material.map.repeat.set(24, 24);
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; g.userData.noMerge = true; scene.add(g);

  const walk = toon(0xffffff, { map: sidewalkTex() });
  const curb = toon(0xffffff, { map: concreteTex() });
  const slabStrip = (x, z, w, d) => {
    const geo = new THREE.BoxGeometry(w, 0.08, d);
    const uv = geo.attributes.uv; // Gehweg-Textur: 1 Kachel = 2 m
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w > d ? w : d) / 2, uv.getY(i) * (w > d ? d : w) / 2);
    const m = new THREE.Mesh(geo, walk); m.position.set(x, 0.04, z); m.receiveShadow = true; scene.add(m);
  };
  const curbStrip = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), curb); m.position.set(x, 0.07, z); m.receiveShadow = true; m.castShadow = true; scene.add(m); };
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[-62, -10], [10, 62]]) {
      slabStrip(s * 8.5, (z0 + z1) / 2, 3, z1 - z0); curbStrip(s * 7.08, (z0 + z1) / 2, 0.18, z1 - z0);
    }
    for (const [x0, x1] of [[-52, -10], [10, 52]]) {
      slabStrip((x0 + x1) / 2, s * 8.5, x1 - x0, 3); curbStrip((x0 + x1) / 2, s * 7.08, x1 - x0, 0.18);
    }
    for (const t of [-1, 1]) { // Ecken
      slabStrip(s * 8.5, t * 8.5, 3, 3);
      curbStrip(s * 7.08, t * 8.5, 0.18, 3); curbStrip(s * 8.5, t * 7.08, 3, 0.18);
    }
  }
  // Markierungen: gelbe Mittellinie (lückenhaft), weiße Randlinien, Zebrastreifen
  const yellow = toon(0x9a7c3c), white = toon(0x857f74);
  const dash = (x, z, w, d, m) => { const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), m); l.position.set(x, 0.006, z); l.receiveShadow = true; scene.add(l); };
  for (let p = 12; p < 60; p += 5) for (const s of [-1, 1]) {
    if (R() > 0.25) dash(0, s * p, 0.16, rr(1.6, 2.6), yellow);
    if (p < 50 && R() > 0.25) dash(s * p, 0, rr(1.6, 2.6), 0.16, yellow);
    if (R() > 0.3) { dash(-6.6, s * p, 0.12, 4.8, white); dash(6.6, s * p, 0.12, 4.8, white); }
  }
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    if (R() < 0.2) continue;
    dash(-5.4 + i * 1.8, s * 11.5, 0.9, 2.6, white);
    if (R() < 0.8) dash(s * 11.5, -5.4 + i * 1.8, 2.6, 0.9, white);
  }
}

// ---------- Häuserzeilen ----------
function rows(scene) {
  const make = (axis, side, from, to) => {
    let p = from;
    while (p < to - 3) {
      const w = Math.min(rr(8, 14), to - p);
      if (w < 4) break;
      const d = rr(10, 14);
      let floors = ri(3, 6); if (R() < 0.18) floors = ri(8, 11);
      if (axis === 'z') building(scene, side * (10 + d / 2), p + w / 2, d, w, floors, side > 0 ? 'x-' : 'x+');
      else building(scene, p + w / 2, side * (10 + d / 2), w, d, floors, side > 0 ? 'z-' : 'z+');
      p += w;
      if (R() < 0.3) { // Gasse mit Zaun und Mülltonne
        const gap = rr(2.2, 3.5);
        if (axis === 'z') { P.fence(scene, side * 13.5, p + gap / 2, gap, Math.PI / 2, true); P.dumpster(scene, side * 11.5, p + gap / 2, Math.PI / 2); }
        else { P.fence(scene, p + gap / 2, side * 13.5, gap, 0, true); P.dumpster(scene, p + gap / 2, side * 11.5, 0); }
        p += gap;
      }
    }
  };
  for (const s of [-1, 1]) {
    make('z', s, 10, 58); make('x', s, 24, 48);
  }
  // Westseite, Süden: eingestürztes Haus (Platten, Schutt) statt einer Häuserzeile – davor die Zeltstadt
  make('z', 1, -58, -10);
  make('z', -1, -58, -40);
  // Ruinenfeld x −24…−10, z −40…−10
  P.slab(scene, -15, -22, 6, 3.5, 0.4, 0.5); P.slab(scene, -19, -30, 5, 4, -0.2, -0.35); P.slab(scene, -13.5, -35, 4, 3, 1.2, 0.25);
  for (const [x, z, s] of [[-12, -15, 1.6], [-17, -26, 2.0], [-21, -18, 1.8], [-12.5, -28, 1.4], [-20, -36, 1.8]]) P.rubble(scene, x, z, s, true);
  // Rest der Fassade (eine stehende Wandscheibe)
  building(scene, -23, -25, 3, 16, 4, 'x+');
  for (const s of [-1, 1]) make('x', s, -48, -24);
}

// ---------- Unkraut (viele Büschel in einem Zeichenaufruf, wiegt sich im Wind) ----------
let weeds = null;
function weedField(scene) {
  const pos = [];
  const add = (x, z, k = 1) => pos.push([x, z, rr(0.5, 1.2) * k]);
  for (let i = 0; i < 900; i++) { // an Bordsteinen und Hauskanten
    const along = rr(-60, 60), s = R() < 0.5 ? -1 : 1, edge = R() < 0.5 ? 7.0 + rr(-0.15, 0.15) : 9.95 + rr(-0.1, 0.05);
    if (Math.abs(along) < 10.5) continue;
    if (R() < 0.5) add(s * edge, along); else if (Math.abs(along) < 50) add(along, s * edge);
  }
  for (let i = 0; i < 110; i++) add(rr(-7, 7), rr(-60, 60), 0.7);   // in Rissen der Straße
  for (let i = 0; i < 70; i++) add(rr(-50, 50), rr(-7, 7), 0.7);
  for (let i = 0; i < 220; i++) add(rr(-24, -10), rr(-40, -10), 1.3); // Ruinenfeld verwildert
  const quad = new THREE.PlaneGeometry(0.8, 0.6); quad.translate(0, 0.3, 0);
  const q2 = quad.clone(); q2.rotateY(Math.PI / 2);
  const geo = mergeGeometries([quad, q2]);
  const mat = toon(0xffffff, { map: weedTex(), alphaTest: 0.45, side: THREE.DoubleSide });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;
    transformed.x += sin(uTime * 1.6 + ph) * 0.08 * position.y;
    transformed.z += cos(uTime * 1.3 + ph) * 0.05 * position.y;
  #endif`);
  };
  const im = new THREE.InstancedMesh(geo, mat, pos.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  pos.forEach(([x, z, s], i) => { e.set(0, R() * TAU, 0); q.setFromEuler(e); sc.set(s, s * rr(0.8, 1.3), s); v.set(x, 0.04, z); m4.compose(v, q, sc); im.setMatrixAt(i, m4); });
  im.receiveShadow = true; im.frustumCulled = false;
  scene.add(im);
  weeds = uTime;
}

// ---------- Ferne: Skyline-Ringe, Rauchsäulen ----------
const smokes = [];
function horizon(scene) {
  const ring = (r, h, col, haze, seed, rep, y0, dense) => {
    const t = skylineTex(col, haze, seed, dense); t.repeat.set(rep, 1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72, 1, true), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.position.y = y0 + h / 2; m.userData.noMerge = true; scene.add(m);
    return m;
  };
  // fern = heller und dunstiger (Luftperspektive)
  ring(170, 80, '#7c4438', 'rgba(150,80,56,A)', 5, 3, -8, 0.9).renderOrder = -3;
  ring(140, 62, '#5c3230', 'rgba(130,70,52,A)', 9, 3, -6, 0.7).renderOrder = -2;
  ring(112, 40, '#3e2426', 'rgba(116,64,48,A)', 13, 4, -4, 0.5).renderOrder = -1;
  const tex = smokeTex();
  for (const [x, z, sc] of [[-60, -70, 1], [70, -50, 0.8], [40, 85, 1.2], [-85, 30, 0.9]]) {
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x3e2c28, transparent: true, depthWrite: false, opacity: 0.55, fog: false }));
      scene.add(s);
      smokes.push({ s, x, z, sc, ph: i / 9, far: true });
    }
  }
}
function barrelSmoke(scene) {
  const tex = smokeTex();
  for (const f of P.fires) {
    if (!f.smoke) continue;
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x3a3230, transparent: true, depthWrite: false, opacity: 0.4 }));
      scene.add(s);
      smokes.push({ s, x: f.pos.x, z: f.pos.z, sc: 0.12, ph: i / 5, y0: f.pos.y + 0.4 });
    }
  }
}

// ---------- Asche ----------
let ash = null;
function ashCloud(scene) {
  const N = 1800, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rr(-25, 25); pos[i * 3 + 1] = rr(0, 18); pos[i * 3 + 2] = rr(-25, 25); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ash = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8ccbe, map: P.GLOW, size: 0.08, transparent: true, opacity: 0.8, depthWrite: false }));
  ash.frustumCulled = false;
  scene.add(ash);
  // Glut: wenige orange Funken
  const M = 160, gp = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) { gp[i * 3] = rr(-25, 25); gp[i * 3 + 1] = rr(0, 12); gp[i * 3 + 2] = rr(-25, 25); }
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const embers = new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xff9040, map: P.GLOW, size: 0.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.frustumCulled = false;
  ash.add(embers);
  ash.userData.embers = embers;
}

// ---------- Aufbau ----------
export function buildWorld(scene, renderer) {
  const sky = skyTex(); sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(sky).texture; pm.dispose();
  scene.fog = new THREE.Fog(0x744434, 22, 92);

  scene.add(new THREE.HemisphereLight(0xb08aa0, 0x4a3426, 2.0));
  scene.add(new THREE.AmbientLight(0x6a4a3a, 0.5));
  const sun = new THREE.DirectionalLight(0xffb27a, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  ground(scene);
  rows(scene);

  // Nordende: Bus-Barrikade mit Sandsäcken; Süden, Osten, Westen: Schutt und Wracks
  P.bus(scene, -1, -57, Math.PI / 2 + 0.15); P.sandbags(scene, 4.5, -54.5, 4, 0.1); P.sandbags(scene, -5.5, -54, 3, -0.2);
  for (const [x, z, r] of [[0, 57, -0.2], [-47, 0, 1.4], [47, 0, 1.7]]) {
    P.car(scene, x, z, r + Math.PI / 2, true);
    P.rubble(scene, x + (Math.abs(x) > 1 ? 0 : 3.5), z + (Math.abs(x) > 1 ? 3.5 : 1), 2.2, true);
    P.rubble(scene, x - (Math.abs(x) > 1 ? 0 : 3.5), z - (Math.abs(x) > 1 ? 3.5 : 1), 2.2, true);
  }
  block(0, -59.5, 26, 2); block(0, 59, 26, 2); block(-49, 0, 2, 26); block(49, 0, 2, 26);
  P.fence(scene, -4, 59.5, 8, 0, true); P.fence(scene, 4, 59.5, 6, 0, true);

  // Autowracks
  P.car(scene, -4.5, -20, 0.15, false); P.car(scene, 3.8, -33, Math.PI + 0.4, true); P.car(scene, -3, 24, -0.3, false, true);
  P.car(scene, 18, 3.5, Math.PI / 2 + 0.2, false); P.car(scene, -24, -3, Math.PI / 2 - 0.5, true); P.car(scene, 4.5, 40, 2.7, false);
  P.car(scene, 5.4, 18, 0.02, false); P.car(scene, -5.3, 44, Math.PI, true); P.car(scene, 30, -4.8, Math.PI / 2, false); P.car(scene, -36, 5, -Math.PI / 2 + 0.1, false);
  P.car(scene, 5.6, -44, 0.05, false, true);

  // Laternen, Strommasten mit Leitungen, Ampeln, Schilder
  for (const z of [-48, -34, -20, 20, 34, 48]) P.lamp(scene, (z / 14) % 2 ? 7.6 : -7.6, z, (z / 14) % 2 ? -Math.PI / 2 : Math.PI / 2, R() < 0.35);
  for (const x of [-40, -26, 26, 40]) P.lamp(scene, x, x > 0 ? 7.6 : -7.6, x > 0 ? Math.PI : 0, R() < 0.35);
  let prev = null;
  for (const z of [-56, -40, -24, -12, 12, 24, 40, 56]) {
    const pts = P.pole(scene, -9.6, z, Math.PI / 2, rr(-0.06, 0.06));
    if (prev && Math.sign(z) === Math.sign(prev[0].z)) for (let i = 0; i < 4; i++) if (R() < 0.85) P.wire(scene, prev[i], pts[i], rr(0.5, 1.1));
    prev = pts;
  }
  const cross = P.pole(scene, 9.6, -12, Math.PI / 2, 0.04), c2 = P.pole(scene, 9.6, 12, Math.PI / 2, -0.03);
  const westN = P.pole(scene, -9.6, -12.5, Math.PI / 2, 0); // Leitungen quer über die Kreuzung
  P.wire(scene, cross[0], westN[3], 1.6); P.wire(scene, cross[1], westN[2], 1.9);
  P.wire(scene, c2[1], cross[2], 1.2);
  const hang = P.pole(scene, 9.6, 28, Math.PI / 2, 0.08); P.wire(scene, hang[0], new THREE.Vector3(6, 0.1, 30), 0.2); // gerissene Leitung hängt herab
  P.trafficLight(scene, 7.4, 7.4, Math.PI, 0); P.trafficLight(scene, -7.4, -7.4, 0, 0); P.trafficLight(scene, 7.4, -7.4, -Math.PI / 2, 0.25);
  P.streetSign(scene, -7.6, 9.6, 0, 'ASCHENALLEE'); P.streetSign(scene, 9.6, -7.6, Math.PI / 2, 'KARTENSTRASSE');
  P.streetSign(scene, 7.8, 30, -Math.PI / 2, 'UMLEITUNG');
  P.busStop(scene, 8.6, -28, -Math.PI / 2);

  // Kram an den Hauswänden
  for (let i = 0; i < 26; i++) {
    const s = R() < 0.5 ? -1 : 1, along = rr(12, 56) * (R() < 0.5 ? -1 : 1), onZ = R() < 0.65, k = R();
    const x = onZ ? s * rr(8.6, 9.4) : along * 0.85, z = onZ ? along : s * rr(8.6, 9.4);
    if (Math.abs(x) > 46 || Math.abs(z) > 56) continue;
    if (k < 0.3) P.barrel(scene, x, z, R() < 0.3); else if (k < 0.5) P.tires(scene, x, z, ri(1, 4)); else if (k < 0.75) P.crate(scene, x, z, rr(0.8, 1.1)); else P.dumpster(scene, x, z, onZ ? Math.PI / 2 * s : 0);
  }
  P.cart(scene, 8.8, -15, 0.6); P.cart(scene, -28.5, 8.6, 2);

  // Zeltstadt der Verwahrlosten (Querstraße West) um eine Feuertonne
  P.tent(scene, -31, 8.4, Math.PI); P.tent(scene, -24.5, 8.6, Math.PI + 0.2); P.tent(scene, -34, -8.6, 0.1);
  P.sandbags(scene, -20.5, 4, 2.5, 1.2);
  P.fireBarrel(scene, -28, 5);
  P.fireBarrel(scene, 5.5, -8.5); P.fireBarrel(scene, -6, 30); P.fireBarrel(scene, -15, -28);
  P.cardTable(scene, -8.2, 7.8);

  // Schutt, Pfützen, Papier, Gullydeckel
  for (let i = 0; i < 14; i++) P.rubble(scene, rr(-6, 6), rr(-50, 50), rr(0.35, 0.8), false);
  for (let i = 0; i < 8; i++) P.rubble(scene, rr(-40, 40), rr(-6, 6), rr(0.35, 0.8), false);
  for (let i = 0; i < 16; i++) P.puddle(scene, rr(-6, 6) * (i < 10 ? 1 : 6), i < 10 ? rr(-52, 52) : rr(-6, 6), rr(0.5, 1.4));
  P.papers(scene, -9, 9, -55, 55, 70); P.papers(scene, -45, 45, -9, 9, 40);
  for (const [x, z] of [[2, -26], [-2, 15], [20, -1.5], [-30, 2], [1.5, 46]]) P.manhole(scene, x, z);

  P.dummy(scene, 2.5, -14); P.dummy(scene, -3.5, -16); P.dummy(scene, 12, -2.5); P.dummy(scene, 0.5, 12);

  mergeStatic(scene);
  // Pfützen spiegeln den Himmel (nur sie bekommen die Umgebungskarte)
  P.propMats().puddle.envMap = env; P.propMats().puddle.needsUpdate = true;
  weedField(scene);
  horizon(scene);
  barrelSmoke(scene);
  ashCloud(scene);
  return { sun };
}

/**
 * Alle festen Teile nach Material zu wenigen großen Meshes zusammenfassen.
 * Sonst wäre jedes Trümmerstück ein eigener Zeichenaufruf (vorher Tausende, danach ~60).
 */
function mergeStatic(scene) {
  scene.updateMatrixWorld(true);
  const buckets = new Map(), old = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noMerge) return;
    if (Array.isArray(o.material)) return;
    const vc = !!o.material.vertexColors;
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.clearGroups();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', ...(vc ? ['color'] : [])].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (vc && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    g.morphAttributes = {};
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
    buckets.get(key).list.push(g);
    old.push(o);
  });
  for (const o of old) if (o.parent) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.list, false);
    if (!merged) { console.warn('Zusammenfassen fehlgeschlagen', b.mat); continue; }
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv;
    m.frustumCulled = false;
    scene.add(m);
  }
}

const sunOff = new THREE.Vector3(-22, 26, -12);
export function updateWorld(dt, t, w, focus) {
  w.sun.position.copy(focus).add(sunOff); w.sun.target.position.copy(focus);
  for (const f of P.fires) {
    const k = 0.8 + 0.2 * Math.sin(t * 13 + f.ph) * Math.sin(t * 7.7 + f.ph * 2);
    f.light.intensity = f.base * k;
    f.fl.forEach((s, i) => {
      if (f.candle) { s.scale.setScalar(0.3 + 0.05 * k); return; }
      const sc = (0.95 - i * 0.2) * (0.85 + 0.25 * Math.sin(t * (10 + i * 3) + f.ph + i));
      s.scale.set(sc * 0.9, sc * 1.35, 1); s.position.x = Math.sin(t * 8 + i + f.ph) * 0.05;
    });
  }
  // Rauch steigt auf und vergeht
  for (const s of smokes) {
    const k = (t * (s.far ? 0.025 : 0.22) + s.ph) % 1;
    if (s.far) {
      s.s.position.set(s.x + k * 14 * s.sc, k * 45 * s.sc, s.z + k * 6);
      s.s.scale.setScalar((8 + k * 26) * s.sc);
      s.s.material.opacity = 0.55 * Math.sin(k * Math.PI);
    } else {
      s.s.position.set(s.x + k * 0.6, s.y0 + k * 3.2, s.z + k * 0.3);
      s.s.scale.setScalar(0.5 + k * 2.2);
      s.s.material.opacity = 0.35 * Math.sin(k * Math.PI);
    }
  }
  if (weeds) weeds.value = t;
  // Asche treibt um die Kamera
  const a = ash.geometry.attributes.position, p = a.array;
  for (let i = 0; i < p.length; i += 3) {
    p[i + 1] -= dt * (0.35 + (i % 7) * 0.05); p[i] += Math.sin(t * 0.5 + i) * dt * 0.25;
    if (p[i + 1] < 0) p[i + 1] += 18;
  }
  a.needsUpdate = true;
  const e = ash.userData.embers.geometry.attributes.position, q = e.array;
  for (let i = 0; i < q.length; i += 3) {
    q[i + 1] += dt * (0.4 + (i % 5) * 0.1); q[i] += Math.sin(t * 1.3 + i) * dt * 0.4;
    if (q[i + 1] > 12) q[i + 1] -= 12;
  }
  e.needsUpdate = true;
  ash.position.set(Math.round(focus.x / 50) * 50, 0, Math.round(focus.z / 50) * 50);
}
