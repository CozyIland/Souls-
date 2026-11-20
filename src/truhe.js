// Truhe am Ende der Kartenstraße (Meshy-Modell models/truhe.glb, ein einziges Mesh ohne Animation).
// Beim Laden wird der Deckel abgetrennt: alle Dreiecke über der Fuge SEAM (dort läuft rundherum eine Rille) bilden den Deckel,
// der sich beim Öffnen um das hintere Scharnier nach hinten aufklappt. Innen dunkle Kästen (sonst sähe man durch die Hülle),
// Licht aus dem Inneren; die Kristallklinge steigt drehend heraus, schwebt und fliegt dann zum Magier (→ onGot).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ladeModell } from './modelle.js';
import { GRADIENT, hullOutline } from './toon.js';
import { block } from './kollision.js';
import { schwertLaden, buildSchwert } from './waffen.js';
import { sfx } from './ton.js';

const URL = 'models/truhe.glb';
const K = 0.55;                    // Maßstab: Modell 1,9 × 1,45 × 1,45 → gut 1 m breit
const SEAM = 0.22, HINGE_Z = -0.7; // Fuge (Modell-y) und Scharnier (hinten oben am Kasten, Modell-z)
const BOT = -0.73;                 // Unterkante (Modell-y)
const OPEN_A = -1.95;              // Deckel offen (rad, nach hinten)
const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const eBack = (u, s = 1.6) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
/** Teil einer (nicht indizierten) Geometrie: nur die Dreiecke tris */
function subGeo(g, tris) {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const n = a.itemSize, arr = new Float32Array(tris.length * 3 * n);
    tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(i * 3 + v) * n + c] = a.getComponent(t * 3 + v, c); });
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  return out;
}

export class Truhe {
  /** o = { x, z, yaw } – yaw: Richtung, in die das Schloss zeigt */
  constructor(scene, o) {
    this.o = o; this.t = -1; this.opened = false; this.ready = false; this.got = null;
    this.root = new THREE.Group(); this.root.position.set(o.x, 0, o.z); this.root.rotation.y = o.yaw; scene.add(this.root);
    this.model = new THREE.Group(); this.model.scale.setScalar(K); this.model.position.y = -BOT * K; this.root.add(this.model);
    block(o.x, o.z, Math.abs(Math.sin(o.yaw)) * 0.8 + Math.abs(Math.cos(o.yaw)) * 1.05 + 0.05, Math.abs(Math.cos(o.yaw)) * 0.8 + Math.abs(Math.sin(o.yaw)) * 1.05 + 0.05);
    // Licht aus dem Inneren (kühles Kristall-Leuchten) und ein Schein über der Öffnung
    this.light = new THREE.PointLight(0x9fc4ff, 0, 7, 1.6); this.light.position.set(0, 0.95, 0.1); this.root.add(this.light);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x9ab8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.glow.scale.setScalar(1.6); this.glow.position.set(0, 0.95, 0); this.glow.userData.noMerge = true; this.root.add(this.glow);
    this.sword = null; this.swGlow = null;
    ladeModell(new GLTFLoader(), URL, (g) => this.onModel(g), (e) => console.warn('Truhen-Modell fehlt.', e));
  }

  onModel(g) {
    let mesh = null; g.scene.traverse((m) => { if (m.isMesh && !mesh) mesh = m; });
    if (!mesh) return;
    g.scene.updateMatrixWorld(true);
    const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
    const pos = geo.attributes.position, lid = [], body = [];
    for (let t = 0; t < pos.count / 3; t++) ((pos.getY(t * 3) + pos.getY(t * 3 + 1) + pos.getY(t * 3 + 2)) / 3 > SEAM ? lid : body).push(t);
    const src = mesh.material;
    const mat = new THREE.MeshToonMaterial({ map: src.map, normalMap: src.normalMap, gradientMap: GRADIENT });
    if (mat.normalMap) mat.normalScale.set(0.8, 0.8);
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a2c26, side: THREE.BackSide }); // Innenwände: dunkles Metall, nimmt das Kristall-Licht an
    // Kasten
    const bodyM = new THREE.Mesh(subGeo(geo, body), mat); bodyM.castShadow = bodyM.receiveShadow = true; this.model.add(bodyM); hullOutline(bodyM, 0.014);
    const inB = new THREE.Mesh(new THREE.BoxGeometry(1.74, SEAM - BOT - 0.06, 1.32), dark); inB.position.y = (SEAM + BOT + 0.06) / 2; this.model.add(inB);
    // Deckel: am Scharnier drehbar
    const lg = subGeo(geo, lid); lg.translate(0, -SEAM, -HINGE_Z);
    this.lid = new THREE.Group(); this.lid.position.set(0, SEAM, HINGE_Z); this.model.add(this.lid);
    const lidM = new THREE.Mesh(lg, mat); lidM.castShadow = lidM.receiveShadow = true; this.lid.add(lidM); hullOutline(lidM, 0.014);
    const inL = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.42, 1.32), dark); inL.position.set(0, 0.22, -HINGE_Z); this.lid.add(inL);
    this.ready = true;
    if (this.opened) this.lid.rotation.x = OPEN_A;
    // Kristallklinge liegt schon bereit (unsichtbar, bis die Truhe aufgeht)
    schwertLaden().then((s) => {
      const w = buildSchwert(s, true); w.rotation.x = -Math.PI / 2; w.position.y = -0.31; // Klinge nach oben, um die Mitte drehen
      this.sword = new THREE.Group(); this.sword.add(w); this.sword.visible = false; this.root.add(this.sword);
      this.swGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow.material.map, color: 0xb7a0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      this.swGlow.scale.set(0.9, 1.9, 1); this.sword.add(this.swGlow);
    }).catch((e) => console.warn('Kristallklinge für die Truhe fehlt.', e));
  }

  /** Punkt vor dem Schloss (dort steht man zum Öffnen) */
  front(out = new THREE.Vector3()) { return out.set(this.o.x + Math.sin(this.o.yaw) * 1.2, 0, this.o.z + Math.cos(this.o.yaw) * 1.2); }
  canOpen(p) { if (this.opened || !this.ready || this.t >= 0) return false; const f = this.front(); return Math.hypot(p.x - f.x, p.z - f.z) < 1.25; }
  /** schon offen (Spielstand): Deckel auf, leer */
  setOpen() { this.opened = true; this.t = -1; if (this.lid) this.lid.rotation.x = OPEN_A; this.light.intensity = 0.35; this.glow.material.opacity = 0.12; }
  /** Testmodus: wieder zu und gefüllt */
  close() {
    this.opened = false; this.t = -1; this.done = false; this.creak = this.chimed = false;
    if (this.lid) this.lid.rotation.x = 0;
    this.light.intensity = 0; this.glow.material.opacity = 0;
    if (this.sword) this.sword.visible = false;
  }
  /** Öffnen: Deckel springt auf, Klinge steigt heraus und fliegt zum Magier; onGot() am Ende */
  open(player, onGot) { this.opened = true; this.t = 0; this.player = player; this.got = onGot; this.done = false; this.creak = this.chimed = false; sfx.thud(); }

  update(dt) {
    if (this.t < 0 || !this.lid) return;
    const t = (this.t += dt);
    // Schloss knackt (kurzes Zucken), dann klappt der Deckel federnd auf
    const jig = t < 0.28 ? Math.sin(t * 60) * 0.025 * (1 - t / 0.28) : 0;
    this.lid.rotation.x = jig + OPEN_A * (t < 0.3 ? 0 : eBack(sm((t - 0.3) / 0.75), 1.2));
    if (t >= 0.3 && !this.creak) { this.creak = true; sfx.huschen(1.4); }
    const L = sm((t - 0.35) / 0.6);
    this.light.intensity = 3.2 * L * (1 - 0.7 * sm((t - 3.2) / 1.2)) * (0.9 + 0.1 * Math.sin(t * 9));
    this.glow.material.opacity = 0.55 * L * (1 - 0.75 * sm((t - 3.2) / 1.2));
    // Kristallklinge: steigt drehend auf, schwebt, fliegt zum Magier und verschwindet in einem Funkenregen
    const S = this.sword;
    if (S && !this.done) {
      const rise = sm((t - 0.85) / 1.1), fly = sm((t - 2.75) / 0.45);
      S.visible = t > 0.8 && fly < 1;
      const y0 = 0.35 + 1.25 * rise + 0.05 * Math.sin(t * 2.2) * rise;
      S.position.set(0, y0, 0);
      S.rotation.y = (t - 0.85) * (5 - 3.5 * rise);
      S.scale.setScalar(0.6 + 0.4 * sm((t - 0.8) / 0.5));
      this.swGlow.material.opacity = 0.7 * sm((t - 0.9) / 0.6) * (0.85 + 0.15 * Math.sin(t * 6));
      if (t > 1.0 && !this.chimed) { this.chimed = true; sfx.karte(); }
      if (fly > 0 && this.player) { // in Richtung Magier (Brust), dabei kleiner
        const p = this.player.pos, w = this.root.worldToLocal(new THREE.Vector3(p.x, 1.2, p.z));
        S.position.lerp(w, fly); S.scale.multiplyScalar(1 - 0.85 * fly);
      }
      if (t > 3.2) { this.done = true; S.visible = false; if (this.got) this.got(); }
    }
    if (t > 5) this.t = -1;
  }
}
