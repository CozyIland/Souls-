// Stockdegen: ein Spazierstock (linke Hand) mit verborgener Klinge. Beim Angriff zieht die rechte Hand die Klinge,
// nach ein paar Sekunden Ruhe steckt der Magier sie zurück. Hier: Modell, Angriffs-Schlüsselhaltungen, Schwungspur.
import * as THREE from 'three';
import { toon, outline } from './toon.js';

// ---------- Modell ----------
// Beide Teile zeigen entlang +Z (vom Griff weg). Ursprung = Stelle, an der die Hand greift.
export const BLADE_L = 0.78;
export function buildCane() {
  const wood = toon(0x2a1a14), gold = toon(0xc99a3a), steel = toon(0xd2d8e0), dark = toon(0x15100c);
  const cyl = (r0, r1, len, mat, z, line = 0.006) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 10); g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.z = z; m.castShadow = true; if (line) outline(m, line); return m;
  };
  // Scheide = Stock
  const sheath = new THREE.Group();
  sheath.add(cyl(0.017, 0.014, 0.86, wood, 0.43));
  sheath.add(cyl(0.02, 0.02, 0.045, gold, 0.0, 0.004));      // Zwinge oben
  sheath.add(cyl(0.016, 0.013, 0.05, gold, 0.85, 0.004));    // Spitze unten
  for (const z of [0.25, 0.55]) sheath.add(cyl(0.0175, 0.0175, 0.012, gold, z, 0));
  // Klinge mit Griff
  const sword = new THREE.Group();
  sword.add(cyl(0.019, 0.017, 0.12, dark, -0.06));           // Griff
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), gold); knob.position.z = -0.135; knob.castShadow = true; outline(knob, 0.004); sword.add(knob);
  sword.add(cyl(0.02, 0.02, 0.02, gold, 0.005, 0.003));      // Ring statt Parierstange (versteckte Klinge)
  const bladeGeo = new THREE.BoxGeometry(0.022, 0.006, BLADE_L);
  const p = bladeGeo.attributes.position; // Spitze zulaufen lassen
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > BLADE_L / 2 - 0.01) p.setX(i, 0);
  bladeGeo.translate(0, 0, BLADE_L / 2 + 0.015);
  const blade = new THREE.Mesh(bladeGeo, steel); blade.castShadow = true; outline(blade, 0.003); sword.add(blade);
  return { sheath, sword, blade };
}

// ---------- Angriffe ----------
// Richtungen im Körper (x links, y oben, z vorn): Oberarm, Unterarm, Klinge; tw = Schultern drehen, ln = vorbeugen.
// lunge = Ausfallschritt (m): das rechte Bein tritt so weit vor, das linke bleibt stehen und wird danach nachgezogen; drop = Hüfte tiefer.
const READY = { arm: [-0.35, -0.85, 0.3], fore: [-0.2, -0.15, 1], blade: [0.05, 0.4, 1], tw: 0, ln: 0 };
const K = (t, arm, fore, blade, tw = 0, ln = 0) => ({ t, arm, fore, blade, tw, ln });
const R0 = (t) => K(t, READY.arm, READY.fore, READY.blade, 0, 0);
export const ATTACKS = {
  // leichte Kombo: waagerecht rechts→links, schräg links→rechts, Stoß nach vorn
  l1: { T: 0.5, act: [0.12, 0.25], cost: 14, dmg: 12, range: 2.0, arc: 1.3, lunge: 0.45, drop: 0.06, next: 'l2', heavy: false, keys: [
    R0(0), K(0.12, [-0.85, 0.15, 0.1], [-0.75, 0.35, -0.4], [-0.6, 0.15, -0.8], 0.35),
    K(0.25, [0.45, 0, 0.9], [0.95, 0.05, 0.35], [0.9, -0.05, 0.45], -0.45, 0.15),
    K(0.36, [0.55, -0.2, 0.8], [0.95, -0.15, 0.2], [0.85, -0.3, -0.2], -0.5, 0.1), R0(0.5)] },
  l2: { T: 0.5, act: [0.1, 0.23], cost: 14, dmg: 12, range: 2.0, arc: 1.3, lunge: 0.45, drop: 0.06, next: 'l3', heavy: false, keys: [
    R0(0), K(0.1, [0.4, -0.15, 0.85], [0.95, -0.1, 0.3], [0.85, -0.35, 0.35], -0.45),
    K(0.23, [-0.75, 0.25, 0.6], [-0.9, 0.35, 0.3], [-0.8, 0.55, 0.25], 0.4, 0.1),
    K(0.34, [-0.85, 0.15, 0.2], [-0.8, 0.3, -0.3], [-0.6, 0.5, -0.6], 0.45), R0(0.5)] },
  l3: { T: 0.62, act: [0.2, 0.32], cost: 16, dmg: 18, range: 2.4, arc: 0.6, lunge: 0.8, drop: 0.13, next: null, heavy: false, keys: [
    R0(0), K(0.18, [-0.35, -0.7, -0.6], [-0.1, -0.05, 1], [0, 0.05, 1], 0.35, -0.05),
    K(0.29, [-0.12, 0.05, 1], [-0.05, 0.05, 1], [0, 0, 1], -0.3, 0.25),
    K(0.42, [-0.12, 0.05, 1], [-0.05, 0.05, 1], [0, 0, 1], -0.3, 0.2), R0(0.62)] },
  // schwer: über den Kopf ausholen, senkrecht herunter
  h: { T: 0.95, act: [0.44, 0.58], cost: 26, dmg: 32, range: 2.3, arc: 0.9, lunge: 0.65, drop: 0.16, next: null, heavy: true, keys: [
    R0(0), K(0.4, [-0.35, 0.9, -0.25], [0.1, 0.85, -0.5], [0.05, 0.5, -0.85], 0.15, -0.12),
    K(0.56, [-0.12, -0.1, 1], [-0.05, -0.35, 0.95], [0, -0.42, 0.9], -0.1, 0.35),
    K(0.72, [-0.12, -0.15, 1], [-0.05, -0.4, 0.92], [0, -0.5, 0.86], -0.1, 0.3), R0(0.95)] },
};
export const READY_POSE = READY;

const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const lerp3 = (a, b, u, out) => { out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; out[2] = a[2] + (b[2] - a[2]) * u; return out; };
/** Haltung eines Angriffs zur Zeit t (Richtungen + Drehung) */
export function attackPose(atk, t, out) {
  const k = atk.keys;
  let i = 0; while (i < k.length - 2 && t > k[i + 1].t) i++;
  const a = k[i], b = k[i + 1], u = sm((t - a.t) / (b.t - a.t));
  lerp3(a.arm, b.arm, u, out.arm); lerp3(a.fore, b.fore, u, out.fore); lerp3(a.blade, b.blade, u, out.blade);
  out.tw = a.tw + (b.tw - a.tw) * u; out.ln = a.ln + (b.ln - a.ln) * u;
  out.w = sm(t / 0.06) * (1 - sm((t - (atk.T - 0.1)) / 0.1));
  return out;
}

// ---------- Schwungspur ----------
const N = 16;
export class Trail {
  constructor(scene) {
    this.pts = []; // [{a, b}]
    const pos = new Float32Array(N * 2 * 3), alpha = new Float32Array(N * 2);
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(0xd8e6ff) }, uK: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vA; void main(){ gl_FragColor = vec4(uCol * 1.6, vA * uK); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  /** a = nahe am Griff, b = Spitze; on = gerade im Schlag */
  update(a, b, on, heavy) {
    if (on) { this.pts.unshift({ a: a.clone(), b: b.clone() }); if (this.pts.length > N) this.pts.pop(); }
    else if (this.pts.length) this.pts.pop();
    this.mat.uniforms.uCol.value.setHex(heavy ? 0xffd890 : 0xd8e6ff);
    const pos = this.mesh.geometry.attributes.position, al = this.mesh.geometry.attributes.alpha;
    for (let i = 0; i < N; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      const f = i < this.pts.length ? (1 - i / N) * 0.75 : 0;
      if (q) { pos.setXYZ(i * 2, q.a.x, q.a.y, q.a.z); pos.setXYZ(i * 2 + 1, q.b.x, q.b.y, q.b.z); }
      al.setX(i * 2, f * 0.15); al.setX(i * 2 + 1, f);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
    this.mesh.visible = this.pts.length > 1;
  }
}
