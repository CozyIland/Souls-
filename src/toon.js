// Anime-Look: Toon-Material mit harten Lichtstufen und dunkle Umrisslinien.
import * as THREE from 'three';

// 3 Lichtstufen (Schatten, Mitte, Licht) – harte Kanten wie im Anime
const steps = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
export const GRADIENT = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
GRADIENT.generateMipmaps = false;
GRADIENT.needsUpdate = true;

const cache = new Map();
/** Toon-Material (wird pro Farbe wiederverwendet, außer mit eigenen Optionen) */
export function toon(color, opts) {
  if (!opts) {
    const k = String(color);
    if (!cache.has(k)) cache.set(k, new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT }));
    return cache.get(k);
  }
  return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: GRADIENT }, opts));
}

const lineMat = new THREE.MeshBasicMaterial({ color: 0x120a08, side: THREE.BackSide });
/**
 * Umrisslinie: dunkle Rückseiten-Kopie, etwas größer („Inverted Hull“).
 * w = Linienbreite in Metern. Gibt das Mesh zurück (zum Verketten).
 */
export function outline(mesh, w = 0.02) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const s = new THREE.Vector3();
  g.boundingBox.getSize(s);
  const o = new THREE.Mesh(g, lineMat);
  o.scale.set(1 + (2 * w) / Math.max(s.x, 0.02), 1 + (2 * w) / Math.max(s.y, 0.02), 1 + (2 * w) / Math.max(s.z, 0.02));
  o.castShadow = false; o.receiveShadow = false;
  o.userData.isOutline = true;
  mesh.add(o);
  return mesh;
}

/** Mesh bauen: Geometrie + Toon-Farbe, wirft Schatten, optional mit Umriss */
export function part(geo, color, line = 0.02, opts) {
  const m = new THREE.Mesh(geo, toon(color, opts));
  m.castShadow = true; m.receiveShadow = true;
  if (line) outline(m, line);
  return m;
}

/**
 * Umriss für Figuren mit Skelett: zweites Mesh mit demselben Skelett, Rückseite,
 * Ecken im Shader entlang der Normale nach außen geschoben (w in Metern).
 */
export function skinOutline(mesh, w = 0.012) {
  const m = new THREE.MeshBasicMaterial({ color: 0x120a08, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLine = { value: w };
    sh.vertexShader = 'uniform float uLine;\n' + sh.vertexShader.replace(
      '#include <skinning_vertex>',
      '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * uLine / max(length(modelMatrix[0].xyz), 1e-4);',
    );
  };
  const o = new THREE.SkinnedMesh(mesh.geometry, m);
  o.bind(mesh.skeleton, mesh.bindMatrix);
  o.bindMode = mesh.bindMode;
  o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
  o.userData.isOutline = true;
  mesh.parent.add(o);
  o.position.copy(mesh.position); o.quaternion.copy(mesh.quaternion); o.scale.copy(mesh.scale);
  return o;
}
