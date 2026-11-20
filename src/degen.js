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
  // Faust um den Griff (das Meshy-Modell hat keine Fingerknochen – solange er den Degen hält, wird seine Hand
  // ausgeblendet und diese Faust gezeigt). Lage im Klingen-Raum: Griff entlang Z, Handgelenk bei FIST_WRIST (Unterarm = −X).
  const fist = buildFist(); fist.visible = false; sword.add(fist);
  return { sheath, sword, blade, fist };
}

// ---------- Faust ----------
export const FIST_WRIST = new THREE.Vector3(-0.085, 0.0, -0.068);
function buildFist() {
  const skin = toon(0xe9b59a), dark = toon(0xc98f78);
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, line = 0.004) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true;
    if (line) outline(m, line); g.add(m); return m;
  };
  // Handteller und Handrücken: liegt hinter dem Griff (Richtung Handgelenk)
  const palm = new THREE.SphereGeometry(1, 14, 10); palm.scale(0.034, 0.03, 0.05);
  add(palm, skin, -0.04, 0.004, -0.064);
  // Handgelenk-Ansatz (verbindet mit dem Unterarm)
  const wrist = new THREE.CylinderGeometry(0.024, 0.028, 0.05, 10); wrist.rotateZ(Math.PI / 2);
  add(wrist, skin, -0.075, 0.0, -0.07);
  // vier Finger umschließen den Griff (Halbringe um die Griff-Achse), oben Zeigefinger, unten kleiner Finger
  for (let i = 0; i < 4; i++) {
    const r = 0.03 - i * 0.0015, t = 0.0115 - i * 0.0008;
    const f = new THREE.TorusGeometry(r, t, 8, 14, Math.PI * 1.25);
    add(f, i % 2 ? dark : skin, -0.004, 0, -0.03 - i * 0.022, 0, 0, -Math.PI * 0.62);
    // Knöchel
    add(new THREE.SphereGeometry(t * 1.15, 8, 6), skin, -0.02, r * 0.95, -0.03 - i * 0.022, 0, 0, 0, 0);
  }
  // Daumen: liegt oben quer über dem Zeigefinger
  const th = new THREE.CapsuleGeometry(0.011, 0.035, 4, 8); th.rotateZ(Math.PI / 2);
  add(th, skin, 0.0, 0.03, -0.016, 0, 0.35, 0.25);
  return g;
}

// ---------- Angriffe ----------
// Richtungen im Körper (x links, y oben, z vorn): Oberarm, Unterarm, Klinge; tw = Schultern drehen, ln = vorbeugen.
// lunge = Ausfallschritt (m): das rechte Bein tritt so weit vor, das linke bleibt stehen und wird danach nachgezogen; drop = Hüfte tiefer.
const READY = { arm: [-0.35, -0.85, 0.3], fore: [-0.2, -0.15, 1], blade: [0.1, 0.28, 1], tw: 0, ln: 0 };
// K(Zeit, Oberarm, Unterarm, Klinge, Schultern drehen, vorbeugen, Kurve bis hierher, linker Oberarm, linker Unterarm)
// Kurven: 'out' = abbremsen (Ausholen, Nachschwingen), 'in' = beschleunigen (Schlag), 'lin' = gleichmäßig schnell, 'io' = weich
const K = (t, arm, fore, blade, tw = 0, ln = 0, e = 'io', la = null, lf = null) => ({ t, arm, fore, blade, tw, ln, e, la, lf });
const R0 = (t, e = 'io') => K(t, READY.arm, READY.fore, READY.blade, 0, 0, e);
const LA0 = [0.28, -1, 0.06], LF0 = [0.08, -1, 0.32]; // linker Arm locker
export const ATTACKS = {
  // leichte Kombo: waagerecht rechts→links, Rückhand schräg links→rechts nach oben, Stoß nach vorn
  l1: { T: 0.56, act: [0.18, 0.28], cost: 14, dmg: 12, poise: 11, range: 2.0, arc: 1.3, lunge: 0.3, drop: 0.07, next: 'l2', heavy: false, keys: [
    R0(0),
    K(0.15, [-0.9, 0.2, -0.15], [-0.6, 0.45, -0.65], [-0.55, 0.25, -0.8], 0.55, -0.05, 'out', [0.5, -0.6, 0.6], [0.2, -0.2, 1]),
    K(0.21, [-0.6, 0.05, 0.8], [-0.2, 0.05, 1], [-0.75, 0.05, 0.65], 0.2, 0.08, 'in', [0.45, -0.7, 0.4], [0.3, -0.5, 0.8]),
    K(0.255, [0.1, 0, 1], [0.7, 0, 0.7], [0.6, -0.05, 0.8], -0.35, 0.15, 'lin', [0.35, -0.85, -0.1], [0.2, -0.8, -0.3]),
    K(0.34, [0.5, -0.15, 0.8], [0.95, -0.1, 0.2], [0.85, -0.15, -0.4], -0.6, 0.15, 'out', [0.3, -0.9, -0.35], [0.15, -0.9, -0.4]),
    R0(0.56)] },
  l2: { T: 0.56, act: [0.16, 0.27], cost: 14, dmg: 12, poise: 11, range: 2.0, arc: 1.3, lunge: 0.3, drop: 0.07, next: 'l3', heavy: false, keys: [
    R0(0),
    K(0.14, [0.45, -0.1, 0.85], [0.95, 0.05, 0.25], [0.75, -0.45, -0.35], -0.5, 0.05, 'out', [0.45, -0.9, -0.2], [0.2, -0.9, -0.3]),
    K(0.2, [0.05, 0.05, 1], [0.2, 0.2, 1], [0.3, -0.2, 0.95], -0.15, 0.1, 'in', [0.4, -0.8, 0.3], [0.2, -0.6, 0.7]),
    K(0.25, [-0.55, 0.3, 0.75], [-0.75, 0.45, 0.5], [-0.8, 0.45, 0.35], 0.35, 0.1, 'lin', [0.5, -0.6, 0.6], [0.3, -0.2, 1]),
    K(0.34, [-0.85, 0.35, 0.1], [-0.7, 0.6, -0.3], [-0.55, 0.6, -0.6], 0.5, 0.05, 'out', [0.5, -0.6, 0.6], [0.3, -0.2, 1]),
    R0(0.56)] },
  l3: { T: 0.68, act: [0.25, 0.35], cost: 16, dmg: 18, poise: 16, range: 2.4, arc: 0.6, lunge: 0.5, drop: 0.17, next: null, heavy: false, keys: [
    R0(0),
    K(0.2, [-0.4, -0.75, -0.55], [-0.1, -0.05, 1], [0.05, 0.05, 1], 0.45, -0.1, 'out', [0.5, -0.3, 0.85], [0.3, 0.2, 1]),
    K(0.27, [-0.1, 0.1, 1], [-0.03, 0.05, 1], [0, 0.02, 1], -0.35, 0.3, 'in', [0.45, -0.7, -0.6], [0.3, -0.5, -0.8]),
    K(0.42, [-0.1, 0.08, 1], [-0.03, 0.04, 1], [0, 0, 1], -0.35, 0.28, 'lin', [0.45, -0.7, -0.6], [0.3, -0.5, -0.8]),
    R0(0.68)] },
  // schwer: langsam über den Kopf ausholen, dann mit ganzer Kraft senkrecht herunter, tief nachschwingen
  h: { T: 1.0, act: [0.5, 0.6], cost: 26, dmg: 32, poise: 30, range: 2.3, arc: 0.9, lunge: 0.42, drop: 0.22, next: null, heavy: true, keys: [
    R0(0),
    K(0.42, [-0.35, 0.9, -0.3], [0.15, 0.9, -0.45], [0.1, 0.35, -0.95], 0.3, -0.2, 'out', [0.6, -0.4, 0.7], [0.4, 0.2, 0.9]),
    K(0.5, [-0.25, 0.75, 0.6], [-0.05, 0.6, 0.8], [0, 0.95, 0.3], 0.1, 0.05, 'in', [0.55, -0.6, 0.5], [0.3, -0.3, 0.9]),
    K(0.56, [-0.12, -0.15, 1], [-0.05, -0.45, 0.9], [0, -0.55, 0.85], -0.1, 0.4, 'lin', [0.45, -0.8, -0.3], [0.25, -0.8, -0.5]),
    K(0.74, [-0.1, -0.35, 0.95], [0, -0.6, 0.8], [0.1, -0.85, 0.5], -0.1, 0.35, 'out', [0.45, -0.8, -0.3], [0.25, -0.8, -0.5]),
    R0(1.0)] },
};
export const READY_POSE = READY;

const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
/** Richtungen auf dem Kugelbogen überblenden (die Klinge fliegt im Bogen, nicht quer durch den Körper) */
function slerp3(a, b, u, out) {
  const la = Math.hypot(a[0], a[1], a[2]) || 1, lb = Math.hypot(b[0], b[1], b[2]) || 1;
  const ax = a[0] / la, ay = a[1] / la, az = a[2] / la, bx = b[0] / lb, by = b[1] / lb, bz = b[2] / lb;
  const d = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)), w = Math.acos(d);
  if (w < 1e-3) { out[0] = ax + (bx - ax) * u; out[1] = ay + (by - ay) * u; out[2] = az + (bz - az) * u; return out; }
  const s = Math.sin(w), k0 = Math.sin((1 - u) * w) / s, k1 = Math.sin(u * w) / s;
  out[0] = ax * k0 + bx * k1; out[1] = ay * k0 + by * k1; out[2] = az * k0 + bz * k1;
  return out;
}
/**
 * Haltung eines Angriffs zur Zeit t – fließend durch alle Schlüsselhaltungen:
 * Richtungen laufen auf dem Kugelbogen (gleichmäßiges Winkeltempo), das Tempo selbst ist über die Schlüssel hinweg stetig
 * (kein Ruck): Wo die Bewegung umkehrt (Ausholen → Schlag) oder ein Schlüssel 'out' hat, kommt sie kurz zum Stillstand;
 * dazwischen fließt sie mit dem mittleren Tempo der Nachbarabschnitte weiter. 'in' = vom vorigen Schlüssel aus dem Stand.
 */
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const angB = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
// Bewegungsrichtung von a nach b, gesehen am Punkt p (Tangente auf der Kugel)
const tang = (p, q) => { const d = q[0] * p[0] + q[1] * p[1] + q[2] * p[2]; return nrm([q[0] - d * p[0], q[1] - d * p[1], q[2] - d * p[2]]); };
const val = (key, field, def) => key[field] ?? def;
/** Tempo (Winkel bzw. Wert pro Sekunde) am Schlüssel j; 0 an den Enden, bei Umkehr und bei 'out'/'in' */
function speedAt(k, j, field, def, dir) {
  if (j <= 0 || j >= k.length - 1 || k[j].e === 'out' || k[j + 1].e === 'in') return 0;
  const A = val(k[j - 1], field, def), B = val(k[j], field, def), C = val(k[j + 1], field, def);
  const d0 = k[j].t - k[j - 1].t, d1 = k[j + 1].t - k[j].t;
  if (!dir) { const s0 = (B - A) / d0, s1 = (C - B) / d1; return s0 * s1 <= 0 ? 0 : (Math.abs(s0) < Math.abs(s1) ? s0 : s1) * 0.5 + (s0 + s1) * 0.25; }
  const a = nrm(A), b = nrm(B), c = nrm(C), w0 = angB(a, b), w1 = angB(b, c);
  if (w0 < 1e-3 || w1 < 1e-3) return 0;
  const tin = tang(b, a), tout = tang(b, c), turn = -(tin[0] * tout[0] + tin[1] * tout[1] + tin[2] * tout[2]); // 1 = geradeaus weiter
  return Math.max(0, turn) * 0.5 * (w0 / d0 + w1 / d1);
}
/** Fortschritt 0..1 im Abschnitt mit stetigem Tempo (kubisch, Start-/Endsteigung m0/m1) */
function prog(u, m0, m1) {
  const u2 = u * u, u3 = u2 * u;
  return Math.min(1, Math.max(0, (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) + (u3 - u2) * m1));
}
const H0 = [0, 0, 0];
function sample(k, t, field, out, def) {
  let i = 0; while (i < k.length - 2 && t > k[i + 1].t) i++;
  const a = k[i], b = k[i + 1], d = b.t - a.t, u = Math.min(1, Math.max(0, (t - a.t) / d));
  if (out) {
    const D = def || H0, A = nrm(val(a, field, D)), B = nrm(val(b, field, D)), w = angB(A, B);
    if (w < 1e-3) { out[0] = A[0]; out[1] = A[1]; out[2] = A[2]; return out; }
    const m0 = Math.min(2.5, speedAt(k, i, field, D, true) * d / w), m1 = Math.min(2.5, speedAt(k, i + 1, field, D, true) * d / w);
    return slerp3(A, B, prog(u, m0, m1), out);
  }
  const A = val(a, field, 0), B = val(b, field, 0), dv = B - A;
  if (Math.abs(dv) < 1e-5) return A;
  const m0 = Math.min(2.5, Math.max(0, speedAt(k, i, field, 0, false) * d / dv)), m1 = Math.min(2.5, Math.max(0, speedAt(k, i + 1, field, 0, false) * d / dv));
  return A + dv * prog(u, m0, m1);
}
/** Haltung eines Angriffs zur Zeit t (Richtungen, Drehung, linker Arm); twLead/twMid = Hüfte/Rumpf eilen voraus (Peitsche) */
export function attackPose(atk, t, out) {
  const k = atk.keys, T = Math.min(atk.T, Math.max(0, t));
  sample(k, T, 'arm', out.arm); sample(k, T, 'fore', out.fore); sample(k, T, 'blade', out.blade);
  out.la = out.la || [0, 0, 0]; out.lf = out.lf || [0, 0, 0];
  sample(k, T, 'la', out.la, LA0); sample(k, T, 'lf', out.lf, LF0);
  out.tw = sample(k, T, 'tw'); out.ln = sample(k, T, 'ln');
  // Rumpf führt: untere Wirbelsäule ist der Haltung ein Stück voraus
  out.twLead = sample(k, Math.min(atk.T, T + 0.045), 'tw'); out.twMid = sample(k, Math.min(atk.T, T + 0.022), 'tw');
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
      fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vA; void main(){ gl_FragColor = vec4(uCol * 0.9, vA * uK); }',
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
      const f = i < this.pts.length ? Math.pow(1 - i / N, 1.6) * 0.5 : 0;
      if (q) { pos.setXYZ(i * 2, q.a.x, q.a.y, q.a.z); pos.setXYZ(i * 2 + 1, q.b.x, q.b.y, q.b.z); }
      al.setX(i * 2, f * 0.15); al.setX(i * 2 + 1, f);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
    this.mesh.visible = this.pts.length > 1;
  }
}
