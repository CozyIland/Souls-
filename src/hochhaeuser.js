// Hochhäuser im Hintergrund: verlassene, überwucherte Plattenbauten (Meshy-Modell, mit tools/glb_lod.py verkleinert) rund um die
// spielbare Stadt – statt der gemalten nahen Skyline-Ringe (der ganz ferne Ring bleibt als Horizont). Zwei Detailstufen:
// nahe Reihe models/plattenbau.glb (30.000 Dreiecke mit Bild), ferne (ohnehin im Dunst) models/plattenbau_fern.glb (nur die Form,
// 8.000 Dreiecke, schlichter Beton) – je ein InstancedMesh.
// Gegen das Kopien-Gefühl bekommt jedes Haus eigene Werte (fest gewürfelt): Höhe (gestreckt 0,85…1,5), Breite/Tiefe, Drehung
// (vier Seiten + etwas schief zur Straße), Farbton (grau, beige, kühl, dunkel, rußig), manche geneigt oder eingesunken.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ladeModell } from './modelle.js';
import { GRADIENT } from './toon.js';
import { seeded } from './util.js';

// Modell: 1,56 × 1,9 × 1,56 Einheiten, Unterkante y −0,95 (Schuttsockel)
const BOT = 0.95;
// Flächen, auf denen schon Straßen, Häuserzeilen und die Arena stehen (x0, x1, z0, z1) – dort kein Hochhaus
const KEEP = [[-27, 27, -66, 66], [-52, 52, -27, 27], [-34, 34, -116, -54]];
const TINT = [[0.95, 0.93, 0.9], [1.0, 0.92, 0.82], [0.82, 0.86, 0.92], [0.7, 0.68, 0.66], [0.88, 0.8, 0.74], [0.55, 0.52, 0.5], [0.92, 0.95, 0.88]];

/** Lagen der Hochhäuser: Raster um die Stadt, leicht verschoben, mit Lücken; near = nahe Reihe */
function plan() {
  const R = seeded(31), out = [];
  for (let gx = -148.5; gx <= 150; gx += 33) for (let gz = -190; gz <= 160; gz += 33) { // Spalten bei ±16,5/±49,5/… → eine Reihe direkt hinter den Häuserzeilen
    const x = gx + (R() - 0.5) * 14, z = gz + (R() - 0.5) * 14;
    const s = 13 + R() * 7, hy = 0.85 + R() * 0.65, w = s * 1.56 * 0.6;   // halbe Breite (etwas Luft)
    const blocked = KEEP.some(([x0, x1, z0, z1]) => x > x0 - w && x < x1 + w && z > z0 - w && z < z1 + w);
    // Abstand zur spielbaren Mitte (Straßen): nicht zu weit weg, sonst sieht sie niemand
    const dx = Math.max(0, Math.abs(x) - 26), dz = Math.max(0, z - 62, -114 - z), dist = Math.hypot(dx, dz);
    const skip = R() < 0.22;
    if (blocked || skip || dist > 112) continue;
    out.push({ x, z, s, hy, near: dist < 62, R: [R(), R(), R(), R(), R(), R(), R()] });
  }
  return out;
}

/** Das verkleinerte ferne Modell hat Punkte ohne Flächenrichtung (Länge 0). Im Shader wird daraus „keine Zahl“ (NaN),
 *  und der Leuchtfilter (Bloom) verschmiert diese Punkte zu großen schwarzen Flächen über das ganze Bild.
 *  Darum: Richtungen neu berechnen und was dann noch fehlt nach oben zeigen lassen. */
function fixNormals(geo) {
  const ok = (n, i) => Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > 0.5;
  let n = geo.attributes.normal, bad = 0;
  if (n) for (let i = 0; i < n.count; i++) if (!ok(n, i)) bad++;
  if (n && !bad) return;
  geo.computeVertexNormals();
  n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) if (!ok(n, i)) n.setXYZ(i, 0, 1, 0);
  n.needsUpdate = true;
}

export function buildHochhaeuser(scene) {
  const spots = plan();
  const make = (url, list, next) => ladeModell(new GLTFLoader(), url, (g) => {
    let src = null; g.scene.traverse((m) => { if (m.isMesh && !src) src = m; });
    if (next) next();
    if (!src || !list.length) return;
    fixNormals(src.geometry);
    // fernes Modell = nur Form (keine Bildkoordinaten): schlichter Beton, der Dunst macht den Rest
    const mat = src.geometry.attributes.uv
      ? new THREE.MeshToonMaterial({ map: src.material.map, normalMap: src.material.normalMap, gradientMap: GRADIENT })
      : new THREE.MeshToonMaterial({ color: 0x8c877e, gradientMap: GRADIENT });
    if (mat.normalMap) mat.normalScale.set(0.7, 0.7);
    // Dunst nur zum Teil (sonst sind es von der Straße aus nur graue Flächen): nahe Reihe 55 %, ferne 75 %
    const fk = src.geometry.attributes.uv ? '0.55' : '0.75';
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * ${fk};
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`);
    };
    const im = new THREE.InstancedMesh(src.geometry, mat, list.length);
    im.userData.noMerge = true; im.castShadow = false; im.receiveShadow = false;
    const M = new THREE.Matrix4(), T = new THREE.Matrix4(), C = new THREE.Color();
    list.forEach((h, i) => {
      const [a, b, c, , e, f, k] = h.R;
      const yaw = Math.floor(a * 4) * Math.PI / 2 + (b - 0.5) * 0.35;           // vier Seiten, etwas schief
      const sx = h.s * (0.88 + 0.28 * c), sz = h.s * (0.88 + 0.28 * e), sy = h.s * h.hy;   // (nicht spiegeln: sonst stimmt das Licht nicht)
      const lean = f < 0.18 ? (f - 0.09) * 0.5 : 0;                               // wenige neigen sich
      const sink = k < 0.2 ? sy * 1.9 * (0.06 + 0.12 * k / 0.2) : 0;             // manche sind eingesunken
      M.makeTranslation(h.x, BOT * sy - sink, h.z);
      M.multiply(T.makeRotationY(yaw)).multiply(T.makeRotationZ(lean)).multiply(T.makeScale(sx, sy, sz));
      im.setMatrixAt(i, M);
      const t = TINT[Math.floor(((a * 7.3 + c * 3.1) % 1) * TINT.length)];
      im.setColorAt(i, C.setRGB(t[0], t[1], t[2]));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    scene.add(im);
  }, (e) => console.warn('Hochhaus-Modell fehlt.', url, e));
  make('models/plattenbau.glb', spots.filter((h) => h.near), () => make('models/plattenbau_fern.glb', spots.filter((h) => !h.near)));
  return spots.length;
}
