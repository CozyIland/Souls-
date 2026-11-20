// Nebeltor wie in Dark Souls: eine wabernde, leicht leuchtende Nebelwand im Durchgang zur Boss-Arena.
// Läuft der Magier hinein, geht er langsam hindurch (die Steuerung ruht kurz). Während des Bosskampfs ist der Nebel von innen
// eine Wand; nach dem Sieg löst er sich auf. Nach dem Tod ist er wieder offen.
import * as THREE from 'three';
import { colliders } from './kollision.js';

const VS = `varying vec2 vUv; varying vec3 vW;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `uniform float uT, uA, uRip, uSeed; varying vec2 vUv; varying vec3 vW;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main() {
  vec2 p = vec2(vUv.x * 3.2, vUv.y * 2.6);
  // zwei Lagen, die gegeneinander aufsteigen und sich verwirbeln
  float a = fbm(p + vec2(uT * 0.05, -uT * 0.22) + 1.5 * fbm(p * 0.7 + vec2(-uT * 0.08, uT * 0.05)));
  float b = fbm(p * 1.7 + vec2(-uT * 0.11, -uT * 0.35));
  float d = smoothstep(0.35, 0.95, a * 0.8 + b * 0.5);
  // weiche Ränder (seitlich, oben), am Boden dichter
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(1.0, 0.72, vUv.y);
  float ground = 0.35 + 0.65 * smoothstep(0.7, 0.0, vUv.y);
  float ring = uRip * (0.5 + 0.5 * sin(length(vUv - vec2(0.5, 0.3)) * 26.0 - uT * 9.0));
  vec3 col = mix(vec3(0.55, 0.58, 0.66), vec3(0.95, 0.94, 0.9), d) + ring * 0.2;
  float alpha = (0.05 + 0.5 * d * d) * edge * ground * uA * (1.0 + ring * 0.5);
  gl_FragColor = vec4(col, alpha);
}`;

export class FogGate {
  /** g = {x0, x1, z, h}: Durchgang entlang x bei z, Höhe h */
  constructor(scene, g) {
    this.g = g; this.t = 0; this.a = 1; this.rip = 0; this.sealed = false; this.gone = false;
    this.group = new THREE.Group(); scene.add(this.group);
    this.mats = [];
    const w = g.x1 - g.x0 + 0.4;
    for (let i = 0; i < 3; i++) { // drei Lagen hintereinander → Tiefe
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uA: { value: 1 }, uRip: { value: 0 }, uSeed: { value: i * 17.3 } },
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, g.h + 0.4), mat);
      m.position.set((g.x0 + g.x1) / 2, (g.h + 0.4) / 2, g.z + (i - 1) * 0.35);
      m.renderOrder = 5; m.userData.noMerge = true; this.group.add(m); this.mats.push(mat);
    }
    // weiches Licht aus dem Nebel
    this.light = new THREE.PointLight(0xc8d4ff, 6, 9, 1.6); this.light.position.set((g.x0 + g.x1) / 2, 2.2, g.z); this.group.add(this.light);
    this.col = { x0: g.x0, x1: g.x1, z0: g.z - 0.3, z1: g.z + 0.3 }; // Wand, solange der Kampf läuft
  }
  /** Steht p im Durchgang und berührt den Nebel von der Straßenseite? */
  touches(p) { const g = this.g; return !this.gone && !this.sealed && p.x > g.x0 + 0.3 && p.x < g.x1 - 0.3 && p.z < g.z + 0.9 && p.z > g.z - 0.5; }
  /** Kampf beginnt: Nebel wird von innen zur Wand */
  seal() { if (!this.sealed) { this.sealed = true; colliders.push(this.col); } }
  /** zurück auf Anfang (nach dem Tod): offen, sichtbar */
  reset() { this.unseal(); this.gone = false; this.a = 1; this.group.visible = true; }
  unseal() { const i = colliders.indexOf(this.col); if (i >= 0) colliders.splice(i, 1); this.sealed = false; }
  /** Boss besiegt: Nebel löst sich auf */
  vanish() { this.unseal(); this.gone = true; }
  update(dt) {
    this.t += dt;
    if (this.gone) this.a = Math.max(0, this.a - dt * 0.6);
    this.rip = Math.max(0, this.rip - dt * 0.8);
    for (const m of this.mats) { m.uniforms.uT.value = this.t; m.uniforms.uA.value = this.a; m.uniforms.uRip.value = this.rip; }
    this.light.intensity = 6 * this.a * (1 + this.rip);
    this.group.visible = this.a > 0.01;
  }
}
