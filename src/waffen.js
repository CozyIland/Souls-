// Waffen: Stockdegen (von Anfang an) und Kristallklinge (liegt in der Truhe in der Kartenstraße).
// Ihre Werte wirken über Werte.mods() (stufe.js) auf Schaden, Ausdauer, Haltung und Reichweite; die Modelle tauscht player.setWeapon().
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ladeModell } from './modelle.js';
import { GRADIENT, hullOutline } from './toon.js';

// light/heavy = Schaden leicht/schwer, poise = Haltungsschaden, cost = Ausdauer je Schlag (Faktoren), range = Reichweite (m dazu),
// bladeL = Klingenspitze im Klingen-Raum (m), fist = Größe der Faust (der Kristallgriff ist dicker)
export const WAFFEN = {
  degen: { id: 'degen', n: 'Stockdegen', light: 1, heavy: 1, poise: 1, cost: 1, range: 0, bladeL: 0.795, fist: 1,
    d: 'Verborgene Klinge im Spazierstock. Schnell und leicht.' },
  schwert: { id: 'schwert', n: 'Kristallklinge', glb: 'models/kristallschwert.glb', light: 1.2, heavy: 1.25, poise: 1.25, cost: 1.12, range: 0.18, bladeL: 0.937, fist: 1.18,
    d: 'Ein Schwert aus schillerndem Kristall, versteckt in einer verrosteten Truhe in der Kartenstraße. Länger und schwerer als der Stockdegen: trifft härter und weiter, kostet etwas mehr Ausdauer.' },
};
export const WAFFEN_IDS = Object.keys(WAFFEN);

// Kristallklinge: Modell steht senkrecht (Klinge nach +y, 1,9 Einheiten); Unterkante der Parierstange bei y −0,47.
// Maßstab 0,66 → 1,25 m lang, Griff 0,22 m (wie beim Stockdegen, zwei Hände passen), Klinge 0,83 m.
export const SCHWERT_K = 0.66, SCHWERT_GUARD = -0.47;

let laden = null;
/** Modell der Kristallklinge (einmal geladen, danach aus dem Zwischenspeicher) */
export function schwertLaden() {
  return (laden ||= new Promise((ok, err) => ladeModell(new GLTFLoader(), WAFFEN.schwert.glb, (g) => ok(g.scene), err)));
}

/**
 * Kristallklinge im Klingen-Raum wie der Degen: Griff entlang +Z, Ursprung = oberes Griffende direkt unter der Parierstange.
 * toon = Anime-Material mit Umriss (im Spiel), sonst das originale PBR-Material (Inventar, Truhe).
 */
export function buildSchwert(src, toon = true) {
  const m = src.clone(true), meshes = [];
  m.traverse((o) => { if (o.isMesh) meshes.push(o); }); // erst sammeln: der Umriss hängt neue Meshes an
  meshes.forEach((o) => {
    o.castShadow = true;
    if (toon) {
      const s = o.material;
      o.material = new THREE.MeshToonMaterial({ map: s.map, normalMap: s.normalMap, gradientMap: GRADIENT });
      hullOutline(o, 0.004);
    } else o.material = o.material.clone();
  });
  m.rotation.x = Math.PI / 2; m.scale.setScalar(SCHWERT_K); m.position.z = -SCHWERT_GUARD * SCHWERT_K;
  const g = new THREE.Group(); g.add(m);
  return g;
}
