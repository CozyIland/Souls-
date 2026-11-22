// Anime-Look: Toon-Material mit harten Lichtstufen und dunkle Umrisslinien.
import * as THREE from 'three';

// 3 Lichtstufen (Schatten, Mitte, Licht) – harte Kanten wie im Anime
const steps = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
export const GRADIENT = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
GRADIENT.generateMipmaps = false;
GRADIENT.needsUpdate = true;

// Figuren (Boss, später Hunde): 4 Stufen, die Schattenseite bleibt lesbar statt schwarz
const stepsF = new Uint8Array([92, 92, 92, 255, 150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]);
export const GRADIENT_FIGUR = new THREE.DataTexture(stepsF, 4, 1, THREE.RGBAFormat);
GRADIENT_FIGUR.minFilter = GRADIENT_FIGUR.magFilter = THREE.NearestFilter;
GRADIENT_FIGUR.generateMipmaps = false;
GRADIENT_FIGUR.needsUpdate = true;

/**
 * Anime-Material für Figuren mit Meshy-Textur – sauberer und klarer als das einfache Toon-Material:
 *  · Randlicht (rim): dünne, warme Lichtkante an der Silhouette (aus der glatten Form, nicht der Fell-Normal-Map) →
 *    die Figur hebt sich auch im Gegenlicht sauber vom Hintergrund ab
 *  · Glut aus der Textur (glow): kräftig orange Stellen (Augen, Glutrisse) leuchten selbst → Bloom lässt sie glühen
 *  · Farbe etwas angehoben (lift/gamma), damit dunkles Fell nicht zu einer schwarzen Fläche wird
 *  · Aufhelllicht von der Kamera (fill): die Seite im Gegenlicht bleibt lesbar
 *  · Texturen mit anisotroper Filterung (scharf auch schräg von der Seite)
 * Werte zum Nachstellen liegen in material.userData.u (Uniforms).
 */
export function toonFigur(src, opt = {}) {
  const m = new THREE.MeshToonMaterial({ map: src.map || null, normalMap: src.normalMap || null, gradientMap: GRADIENT_FIGUR, side: opt.side ?? THREE.DoubleSide });
  for (const t of [m.map, m.normalMap]) if (t) { t.anisotropy = opt.aniso || 8; t.needsUpdate = true; }
  if (m.normalMap) m.normalScale.set(opt.normal ?? 0.55, opt.normal ?? 0.55);
  const u = {
    uRimCol: { value: new THREE.Color(opt.rimCol ?? 0xff8a4a) }, uRim: { value: opt.rim ?? 0.55 },
    uRimA: { value: opt.rimA ?? 0.8 }, uRimB: { value: opt.rimB ?? 0.97 },
    uGlowCol: { value: new THREE.Color(opt.glowCol ?? 0xff6a1e) }, uGlow: { value: opt.glow ?? 0 },
    uLift: { value: opt.lift ?? 1.1 }, uGamma: { value: opt.gamma ?? 0.72 },
    uFill: { value: opt.fill ?? 0.5 }, uFillCol: { value: new THREE.Color(opt.fillCol ?? 0xc8b4d8) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = `uniform vec3 uRimCol; uniform float uRim, uRimA, uRimB; uniform vec3 uGlowCol; uniform float uGlow, uLift, uGamma; uniform float uFill; uniform vec3 uFillCol;\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 texC = diffuseColor.rgb;
        // Glut-Maske: kräftig orange/gelb (rot hoch, blau tief, nicht nur rosa Fleisch)
        float glowM = smoothstep(0.30, 0.55, texC.r - texC.b) * smoothstep(0.18, 0.40, texC.g) * smoothstep(0.45, 0.8, texC.r);
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(uGamma)) * uLift;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGlowCol * glowM * uGlow;`)
      .replace('#include <opaque_fragment>', `
        vec3 nRim = normalize(vNormal) * faceDirection;
        float fres = 1.0 - clamp(dot(nRim, normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += uRimCol * smoothstep(uRimA, uRimB, fres) * uRim * (0.55 + 0.45 * clamp(nRim.y + 0.5, 0.0, 1.0));
        // Aufhelllicht von der Kamera (wie beim Film): die Seite im Gegenlicht wird kein schwarzer Klotz; in 2 Stufen (Anime)
        float fillN = dot(normal, normalize(vViewPosition));
        outgoingLight += diffuseColor.rgb * uFillCol * uFill * mix(0.45, 1.0, smoothstep(0.25, 0.35, fillN));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toonFigur';
  return m;
}

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

/** Umriss für beliebige (auch nicht zentrierte) Meshes: Rückseite entlang der Normalen aufgebläht, Breite w in Metern (Welt) */
const hullMats = new Map();
export function hullOutline(mesh, w = 0.012) {
  let m = hullMats.get(w);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: 0x120a08, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uLine = { value: w };
      sh.vertexShader = 'uniform float uLine;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed += normalize(normal) * uLine / max(length(modelMatrix[0].xyz), 1e-4);',
      );
    };
    hullMats.set(w, m);
  }
  const o = new THREE.Mesh(mesh.geometry, m);
  o.castShadow = false; o.receiveShadow = false; o.userData.isOutline = true; o.userData.noMerge = true;
  mesh.add(o);
  return o;
}
