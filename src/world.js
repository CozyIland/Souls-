// Erstes Gebiet: ein Schlauch durch die tote Stadt – vom Spieltisch im Süden die Aschenallee hinauf (Seitenstraßen verbarrikadiert),
// am Nordende ein Nebeltor zwischen zwei Häusern, dahinter der Ascheplatz (Boss-Arena).
// Häuser mit Läden und Feuerleitern, Gehwege mit Bordstein, Autowracks, Strommasten, Zeltlager, Unkraut, Pfützen,
// Skyline am Horizont, Rauchsäulen und Asche in der Luft. Kollision über Rechtecke (kollision.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';
import { seeded, TAU } from './util.js';
import { block, colliders, blockers, resolve } from './kollision.js';
import { canvasTex, asphaltTex, sidewalkTex, concreteTex, skyTex, skylineTex, weedTex, smokeTex, asphaltNormal, sidewalkNormal } from './texturen.js';
import { building, FLOOR } from './gebaeude.js';
import * as P from './requisiten.js';
import * as K from './kleinkram.js';
import { buildWracks } from './wracks.js';
import { buildHochhaeuser } from './hochhaeuser.js';

export { colliders, blockers, resolve };
export const targets = P.targets;
// Lage der wichtigen Orte (main.js, nebel.js, boss.js)
export const GATE = { x0: -3, x1: 4, z: -60.5, h: 5.6 };        // Nebeltor zwischen zwei Häusern
export const ARENA = { x0: -19.2, x1: 19.2, z0: -100.2, z1: -63.6 }; // freie Kampffläche des Bosses
export const REST = { x: 5.6, z: 48.2, yaw: Math.PI };          // Spieltisch: Start und Wiederaufstehen
export const STONE = { x: -2.6, z: 44.2 };                       // Seelenstein: aufsteigen und rasten
export const TRUHE = { x: 33.4, z: 0.8, yaw: -Math.PI / 2 };     // Truhe am Ende der Kartenstraße (Schloss zeigt nach Westen)

const R = seeded(7);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));

// ---------- Boden ----------
function ground(scene) {
  const an = asphaltNormal(); an.repeat.set(48, 48);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon(0xffffff, { map: asphaltTex(), normalMap: an }));
  g.material.map.repeat.set(24, 24); g.material.normalScale.set(0.4, 0.4);
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; g.userData.noMerge = true; scene.add(g);

  const walk = toon(0xffffff, { map: sidewalkTex(), normalMap: sidewalkNormal() });
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
  for (const [x, z, s] of [[-12, -15, 1.6], [-17, -26, 2.0], [-21, -18, 1.8], [-12.5, -28, 1.4], [-20, -36, 1.8]]) K.rubbleHeap(scene, x, z, s, true);
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
  // nur noch der ferne Horizont – davor stehen echte Hochhäuser (hochhaeuser.js)
  ring(170, 80, '#7c4438', 'rgba(150,80,56,A)', 5, 3, -8, 0.9).renderOrder = -3;
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

// ---------- Seelenstein: ein schiefer, alter Stein mit glimmenden Runen (hier steigt man auf und rastet) ----------
function soulStone(scene, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = 0.5; scene.add(g);
  const geo = new THREE.CylinderGeometry(0.42, 0.62, 2.1, 7, 4); // unregelmäßig gemacht: Ecken verschoben
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i), k = 1 + 0.12 * Math.sin(p.getX(i) * 7 + yy * 3) + 0.08 * Math.cos(p.getZ(i) * 9); p.setX(i, p.getX(i) * k * 1.15); p.setZ(i, p.getZ(i) * k * 0.7); if (yy > 1.0) p.setY(i, yy + 0.12 * Math.sin(p.getX(i) * 11)); }
  geo.computeVertexNormals();
  const st = new THREE.Mesh(geo, toon(0x3e3a37)); st.position.y = 1.0; st.rotation.z = 0.06; st.castShadow = true; st.receiveShadow = true; g.add(st);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.22, 9), toon(0x34302c)); base.position.y = 0.1; base.receiveShadow = true; g.add(base);
  // Runen: kleine leuchtende Zeichen auf der Vorderseite
  const rune = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.75, 0.3), toneMapped: false });
  const marks = [[0, 1.55, 0.12, 0.05], [-0.12, 1.32, 0.05, 0.16], [0.12, 1.3, 0.05, 0.14], [0, 1.08, 0.18, 0.05], [-0.06, 0.86, 0.05, 0.16], [0.08, 0.66, 0.14, 0.05]];
  for (const [rx, ry, w, h] of marks) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), rune); m.position.set(rx, ry, 0.43); g.add(m); }
  const light = new THREE.PointLight(0xff8a3a, 1.6, 4.5, 2); light.position.set(0, 1.2, 0.75); g.add(light);
  block(x, z, 1.4, 1.4);
}

// ---------- Schlauch: Seitenstraßen und Ruinenfeld dicht ----------
function barricades(scene) {
  // Querstraße West an der Kreuzung: Zaun, Autowracks, Schutt, Sandsäcke – man sieht noch dahinter.
  // Ost (Kartenstraße) ist eine Sackgasse: dieselbe Sperre steht erst bei x ≈ 36, davor die Truhe mit drei Hunden.
  for (const [s, x0] of [[-1, 0], [1, 24.2]]) {
    const X = (d) => s * d + x0;
    P.fence(scene, X(12.2), 0, 20, Math.PI / 2, true);
    P.car(scene, X(11), -4.2, s * 0.12, true); P.car(scene, X(11.3), 4.6, Math.PI - s * 0.2, s > 0);
    K.rubbleHeap(scene, X(11), -8.3, 1.3, true); K.rubbleHeap(scene, X(11.2), 7.9, 1.2, true);
    if (s < 0) { K.rubbleHeap(scene, X(10.8), -0.4, 0.9, true); P.sandbags(scene, X(10.3), 0.8, 2.6, Math.PI / 2 + s * 0.1); }
    block(X(11.6), 0, 1.6, 20.5);
  }
  // hinter der Truhe: Sandsäcke und Kisten, eine Feuertonne – jemand hat hier etwas versteckt
  P.sandbags(scene, 34.9, -2.4, 2.2, Math.PI / 2 + 0.15); P.crate(scene, 34.5, 2.2, 0.9);
  P.fireBarrel(scene, 33.6, -3.6);
  // Ruinenfeld im Westen: Bauzaun mit Schutt davor
  P.fence(scene, -10.7, -25, 30, Math.PI / 2, true);
  for (const [z, sz] of [[-13, 1.1], [-21, 0.9], [-29, 1.3], [-37, 1]]) K.rubbleHeap(scene, -10.2, z, sz, true);
  P.slab(scene, -10.4, -33, 3, 2.2, 1.4, 0.6);
  block(-10.9, -25, 1.2, 30.5);
}

// ---------- Nordende: Tor und Ascheplatz (Boss-Arena) ----------
function arena(scene) {
  // Südwand mit dem Tor in der Mitte (die Häuser schauen in die Arena)
  building(scene, -24.5, -60.5, 15, 5, 5, 'z-'); building(scene, -10, -60.5, 14, 5, 4, 'z-');
  building(scene, 10.5, -60.5, 13, 5, 4, 'z-'); building(scene, 24.5, -60.5, 15, 5, 6, 'z-');
  // West- und Ostwand, Nordwand
  for (const s of [-1, 1]) {
    building(scene, s * 26, -69.5, 12, 12, s < 0 ? 5 : 4, s < 0 ? 'x+' : 'x-');
    building(scene, s * 26, -82, 12, 13, s < 0 ? 7 : 5, s < 0 ? 'x+' : 'x-');
    building(scene, s * 26, -95, 12, 13, s < 0 ? 4 : 6, s < 0 ? 'x+' : 'x-');
  }
  building(scene, -22, -107, 20, 12, 6, 'z+'); building(scene, -2, -107, 20, 12, 9, 'z+'); building(scene, 20, -107, 24, 12, 5, 'z+');
  // Torbogen: rostiger Träger mit Ketten über dem Durchgang
  const m = P.propMats(), beam = new THREE.Mesh(new THREE.BoxGeometry(GATE.x1 - GATE.x0 + 1.2, 0.35, 0.35), m.rust || toon(0x6a3a24));
  beam.position.set((GATE.x0 + GATE.x1) / 2, GATE.h + 0.25, GATE.z); beam.rotation.z = 0.04; beam.castShadow = true; scene.add(beam);
  for (const x of [-1.6, 0.3, 2.4]) {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2 + Math.abs(x) * 0.3, 5), m.iron || toon(0x3a3632));
    ch.position.set(x, GATE.h - 0.45 - Math.abs(x) * 0.15, GATE.z); scene.add(ch);
  }
  // Boden: alter Platz aus Pflaster, in der Mitte Asche
  const walk = toon(0xffffff, { map: sidewalkTex(), normalMap: sidewalkNormal() });
  walk.map = walk.map.clone(); walk.map.repeat.set(20, 19); walk.map.needsUpdate = true;
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(40, 38), walk); plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.012, -82); plaza.receiveShadow = true; scene.add(plaza);
  const ashT = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, 'rgba(30,22,20,0.85)'); r.addColorStop(0.55, 'rgba(36,28,24,0.55)'); r.addColorStop(1, 'rgba(40,30,26,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }, { clamp: true });
  const ash = new THREE.Mesh(new THREE.CircleGeometry(11, 40), new THREE.MeshBasicMaterial({ map: ashT, transparent: true, depthWrite: false, color: 0x8a7a70 }));
  ash.rotation.x = -Math.PI / 2; ash.position.set(0, 0.025, -83); ash.userData.noMerge = true; scene.add(ash);
  // Durchgang zum Tor gepflastert
  // endet genau am Platzrand (z −63) – überlappend flackerten beide Pflaster ineinander
  const pass = new THREE.Mesh(new THREE.PlaneGeometry(GATE.x1 - GATE.x0, 5.5), walk); pass.rotation.x = -Math.PI / 2; pass.position.set((GATE.x0 + GATE.x1) / 2, 0.012, GATE.z + 0.25); scene.add(pass);
  // Rand: Feuertonnen in den Ecken, Schutt, Wracks, tote Bäume – die Mitte bleibt frei für den Kampf
  for (const [x, z] of [[-16.5, -66.5], [16.5, -66.5], [-16.5, -97], [16.5, -97]]) P.fireBarrel(scene, x, z);
  for (const [x, z, sz] of [[-18, -80, 1.6], [18, -74.5, 1.4], [17.6, -90, 1.8], [-17.6, -90.5, 1.2], [-6, -99, 1.3], [9, -99.2, 1.5]]) K.rubbleHeap(scene, x, z, sz, true);
  P.car(scene, -15.5, -99, 1.3, true); P.car(scene, 17.6, -82, 0.1, true);
  K.deadTree(scene, -18.4, -71); K.deadTree(scene, 18.4, -94);
  for (const [x, z] of [[-18.6, -76], [18.6, -70], [-12, -99.6], [13, -63.8], [-14, -63.9]]) K.trashBags(scene, x, z, ri(3, 6));
  for (let i = 0; i < 14; i++) K.bush(scene, (R() < 0.5 ? -1 : 1) * rr(18.4, 19.3), rr(-99, -64), rr(0.6, 1.2));
  P.papers(scene, -18, 18, -99, -64, 40);
  for (let i = 0; i < 4; i++) P.puddle(scene, rr(-14, 14), rr(-96, -68), rr(0.6, 1.3));
}

// ---------- Aufbau ----------
export function buildWorld(scene, renderer) {
  const sky = skyTex(); sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(sky).texture; pm.dispose();
  scene.fog = new THREE.Fog(0x6e4640, 24, 95);

  // Anime-Abendlicht: warme Sonne, kühles lila Himmelslicht in den Schatten (mehr Farbkontrast)
  scene.add(new THREE.HemisphereLight(0x9c92cc, 0x4a3426, 1.9));
  scene.add(new THREE.AmbientLight(0x5a4a64, 0.45));
  const sun = new THREE.DirectionalLight(0xffa86a, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  ground(scene);
  rows(scene);
  barricades(scene);
  arena(scene);

  // Nordende der Straße: Sandsäcke und ein ausgebrannter Bus an den Seiten vor dem Tor; Süden, Osten, Westen: Schutt und Wracks
  P.bus(scene, -6.4, -50, 0.05); P.sandbags(scene, 6.2, -55.2, 3.2, 0.25); P.sandbags(scene, -2.8, -55.6, 2.4, -0.3);
  for (const [x, z, r] of [[0, 57, -0.2], [-47, 0, 1.4], [47, 0, 1.7]]) {
    P.car(scene, x, z, r + Math.PI / 2, true);
    K.rubbleHeap(scene, x + (Math.abs(x) > 1 ? 0 : 3.5), z + (Math.abs(x) > 1 ? 3.5 : 1), 2.2, true);
    K.rubbleHeap(scene, x - (Math.abs(x) > 1 ? 0 : 3.5), z - (Math.abs(x) > 1 ? 3.5 : 1), 2.2, true);
  }
  block(0, 59, 26, 2); block(-49, 0, 2, 26); block(49, 0, 2, 26);
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
  P.fireBarrel(scene, 5.5, -8.5); P.fireBarrel(scene, -6, 30); P.fireBarrel(scene, -15, -28); P.fireBarrel(scene, -8.4, 7.6);
  P.cardTable(scene, 8.6, 50); P.fireBarrel(scene, 8.7, 46.4);   // Spieltisch am Südende: Start und Rastpunkt
  soulStone(scene, STONE.x, STONE.z);

  // Schutt, Pfützen, Papier, Gullydeckel
  for (let i = 0; i < 14; i++) K.rubbleHeap(scene, rr(-6, 6), rr(-50, 50), rr(0.35, 0.8), false);
  for (let i = 0; i < 8; i++) K.rubbleHeap(scene, rr(-40, 40), rr(-6, 6), rr(0.35, 0.8), false);
  for (let i = 0; i < 16; i++) P.puddle(scene, rr(-6, 6) * (i < 10 ? 1 : 6), i < 10 ? rr(-52, 52) : rr(-6, 6), rr(0.5, 1.4));
  P.papers(scene, -9, 9, -55, 55, 70); P.papers(scene, -45, 45, -9, 9, 40);
  for (const [x, z] of [[2, -26], [-2, 15], [20, -1.5], [-30, 2], [1.5, 46]]) P.manhole(scene, x, z);

  P.dummy(scene, 2.6, 41); P.dummy(scene, -2.8, 38.4);   // Übungspuppen am Start

  // Stufe 2: Kleinkram – Müllsäcke, kahle Bäume, Gestrüpp, verstreute Steinchen
  for (const [x, z] of [[9.2, -12.5], [-9.3, 13], [9.4, 25.5], [-9.4, -45], [9.3, 46], [-14, 9.3], [21, -9.2], [-38, 9.3], [36, 9.3], [-9.3, 38], [9.2, -38]]) K.trashBags(scene, x, z, ri(3, 7));
  for (const [x, z] of [[8.4, -42], [-8.4, -30], [8.4, 15.5], [-8.4, 27], [8.4, 36], [-8.4, 47], [-16, 8.4], [17, -8.4], [-34, -8.4], [32, 8.4]]) K.deadTree(scene, x, z);
  for (let i = 0; i < 46; i++) {
    const t = R();
    if (t < 0.35) K.bush(scene, rr(-24, -11), rr(-40, -11), rr(0.8, 1.5));            // Ruinenfeld
    else if (t < 0.7) K.bush(scene, (R() < 0.5 ? -1 : 1) * rr(9.4, 9.8), rr(-56, 56), rr(0.6, 1.1)); // an den Häusern
    else K.bush(scene, rr(-46, 46), (R() < 0.5 ? -1 : 1) * rr(9.4, 9.8), rr(0.6, 1.1));
  }
  const spots = [];
  for (let i = 0; i < 1400; i++) {
    const t = R();
    if (t < 0.4) spots.push([(R() < 0.5 ? -1 : 1) * rr(8.9, 9.9), rr(-58, 58), 1]);           // an den Hauswänden
    else if (t < 0.6) spots.push([rr(-46, 46), (R() < 0.5 ? -1 : 1) * rr(8.9, 9.9), 1]);
    else if (t < 0.8) spots.push([rr(-24, -10), rr(-40, -10), 1.6]);                           // Ruinenfeld
    else spots.push([rr(-7, 7), rr(-56, 56), 0.8]);                                            // auf der Straße
  }
  K.scatter(scene, spots);

  mergeStatic(scene);
  buildWracks(scene, (c) => P.carBox(scene, c)); // Autowracks: Meshy-Modell, jedes anders (wracks.js)
  buildHochhaeuser(scene);                         // Plattenbauten rund um die Stadt (hochhaeuser.js)
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
