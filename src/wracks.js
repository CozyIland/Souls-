// Autowracks: alle Autos der Stadt sind dasselbe Meshy-Modell (models/autowrack.glb, rostiges, bemoostes Muscle-Car,
// mit tools/glb_lod.py auf 16.000 Dreiecke verkleinert) – als EIN InstancedMesh gezeichnet (ein Zeichenaufruf für alle).
// Damit es nicht nach Kopien aussieht, bekommt jedes Auto eigene Werte (aus seiner Lage gewürfelt, also immer gleich):
// Lackfarbe (nur der Lack wird im Farbton gedreht – Moos, Rost und Glas bleiben), Sättigung/Helligkeit, ausgebrannt (dunkel, fast
// grau), leichte Schieflage (platter Reifen), etwas eingesunken, Größe ±5 %, manche liegen auf dem Dach, manche tragen eine Matratze.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ladeModell } from './modelle.js';
import { GRADIENT, toon } from './toon.js';

const URL = 'models/autowrack.glb';
// Modell: Länge entlang x (1,9 Einheiten, vorn bei −x), Höhe 0,51 (Unterkante −0,255), Breite 0,84
export const CAR_L = 4.6, CAR_W = 2.0;            // Größe im Spiel (m) – Kollision in requisiten.js
const K = CAR_L / 1.9, LIFT = 0.255, HEIGHT = 0.51 * K;
// Lackfarben als Drehung des Farbtons (rad) + Sättigung: rot (Original), orange, ocker, petrol, blau, lila, grau, weißlich
const PAINT = [[0, 1], [0.45, 0.95], [0.85, 0.7], [2.6, 0.85], [3.7, 0.9], [4.6, 0.75], [0, 0.12], [3.4, 0.25]];
export const carSpots = [];
const Y_AX = new THREE.Vector3(0, 1, 0);

/** Stelle für ein Wrack merken (aus requisiten.js car()) */
export function carSpot(x, z, rot, burnt, roof) { carSpots.push({ x, z, rot, burnt: !!burnt, roof: !!roof }); }

function hash(x, z, k) { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); }

/** Wracks bauen, sobald das Modell da ist; fehlt es, baut fallback(spot) die alten Kasten-Autos */
export function buildWracks(scene, fallback) {
  ladeModell(new GLTFLoader(), URL, (g) => {
    let src = null; g.scene.traverse((m) => { if (m.isMesh && !src) src = m; });
    if (!src) { carSpots.forEach(fallback); return; }
    const geo = src.geometry, n = carSpots.length;
    const mat = new THREE.MeshToonMaterial({ map: src.material.map, normalMap: src.material.normalMap, gradientMap: GRADIENT });
    if (mat.normalMap) mat.normalScale.set(0.8, 0.8);
    // Farbe je Wrack: x = Farbton-Drehung (rad), y = Sättigung, z = Helligkeit, w = Ruß (0..1)
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 aVar;\nvarying vec4 vVar;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vVar = aVar;');
      sh.fragmentShader = 'varying vec4 vVar;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 c = diffuseColor.rgb;
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = (mx - mn) / (mx + 1e-4);
    // Lack = kräftiges Rot/Rosa (Moos ist grün-gelb, Rost dunkel und bräunlich, Glas dunkel) → nur dort den Farbton drehen
    float paint = smoothstep(0.25, 0.5, sat) * smoothstep(0.12, 0.3, mx) * smoothstep(1.05, 1.5, c.r / max(c.g, 1e-3));
    const vec3 k = vec3(0.57735);
    float ca = cos(vVar.x), sa = sin(vVar.x);
    vec3 h = c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
    c = mix(c, max(h, 0.0), paint);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, mix(1.0, vVar.y, paint * 0.8 + 0.2)) * vVar.z;
    c = mix(c, vec3(0.05, 0.04, 0.035) + c * 0.25, vVar.w);   // ausgebrannt: Ruß
    diffuseColor.rgb = c;
  }`);
    };
    const cars = new THREE.InstancedMesh(geo, mat, n);
    cars.castShadow = true; cars.receiveShadow = true; cars.userData.noMerge = true;
    const vars = new Float32Array(n * 4), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
    const base = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(K, K, K)).multiply(new THREE.Matrix4().makeTranslation(0, LIFT, 0));
    const mattress = toon(0x7a6a58);
    carSpots.forEach((c, i) => {
      const r = (k) => hash(c.x, c.z, k);
      const p = PAINT[Math.floor(r(1) * PAINT.length)];
      const burnt = c.burnt;
      vars.set([p[0], burnt ? 0.2 : p[1], burnt ? 0.55 : 0.62 + 0.38 * r(2), burnt ? 0.55 + 0.3 * r(3) : 0.12 * r(3)], i * 4);
      const s = 0.95 + 0.1 * r(4);
      const flip = burnt && r(5) < 0.3;                  // ausgebrannt und umgekippt: liegt auf dem Dach
      const sink = burnt ? 0.06 + 0.06 * r(6) : 0.03 * r(6);
      E.set((r(7) - 0.5) * 0.05, 0, (r(8) - 0.5) * (burnt ? 0.12 : 0.07)); // Schieflage (platter Reifen, eingesackt)
      Q.setFromEuler(E);
      const T = new THREE.Matrix4().makeRotationY(c.rot).multiply(new THREE.Matrix4().makeRotationFromQuaternion(Q));
      if (flip) T.multiply(new THREE.Matrix4().makeRotationZ(Math.PI));
      T.multiply(new THREE.Matrix4().makeScale(s, s, s * (0.97 + 0.06 * r(9)))).multiply(base);
      M.makeTranslation(c.x, (flip ? HEIGHT * s * 0.93 : 0) - sink, c.z).multiply(T);
      cars.setMatrixAt(i, M);
      if (c.roof && !flip) { // Matratze auf dem Dach
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.13, 1.6), mattress);
        m.position.set(0, HEIGHT * 0.9, 0.1); m.rotation.set((r(10) - 0.5) * 0.15, (r(11) - 0.5) * 0.4, (r(12) - 0.5) * 0.1);
        const h = new THREE.Group(); h.add(m); h.position.set(c.x, -sink, c.z);
        h.quaternion.setFromAxisAngle(Y_AX, c.rot).multiply(Q); h.scale.setScalar(s);
        m.castShadow = true; h.userData.noMerge = true; scene.add(h);
      }
    });
    geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(vars, 4));
    cars.instanceMatrix.needsUpdate = true; cars.computeBoundingSphere();
    scene.add(cars);
    // Umriss (dunkle, aufgeblähte Rückseite) – teilt sich die Lagen mit den Autos
    const line = new THREE.MeshBasicMaterial({ color: 0x120a08, side: THREE.BackSide });
    line.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${(0.022 / K).toFixed(5)};`); };
    const out = new THREE.InstancedMesh(geo, line, n); out.instanceMatrix = cars.instanceMatrix; out.userData.isOutline = true; out.userData.noMerge = true;
    out.computeBoundingSphere(); scene.add(out);
  }, (e) => { console.warn('Autowrack-Modell fehlt – einfache Autos.', e); carSpots.forEach(fallback); });
}
