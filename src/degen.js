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
  sword.add(cyl(0.019, 0.017, 0.22, dark, -0.11));           // Griff (lang genug für zwei Hände)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), gold); knob.position.z = -0.235; knob.castShadow = true; outline(knob, 0.004); sword.add(knob);
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
export const GRIP_L = -0.105; // linke Faust (beidhändig) sitzt so weit unter der rechten am Griff
export function buildFist() {
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
// Achsen im Körper: x = links, y = oben, z = vorn. Jede Schlüsselhaltung sagt, WO DIE HAND IST (h, Meter ab der rechten Schulter)
// und wohin die Klinge zeigt (b); Schulter und Ellbogen richtet der Code selbst aus (Zwei-Knochen-Lösung, Ellbogen zeigt nach el).
// Prinzip guter Schwünge: die Hand wandert wenig, die Klinge viel (Hebel); Hüfte und Schultern drehen voraus, der Arm folgt.
// tw = Schultern drehen, hip = Hüfte drehen (+ = nach links, gegen den Uhrzeigersinn von oben), ln = vorbeugen, cr = in die Knie (m),
// sh = Gewicht vor/zurück (m), th = beidhändig (0..1), la/lf = linker Ober-/Unterarm (einhändig, schwingt gegen).
// Kurve bis zum Schlüssel: 'out' = abbremsen (Ausholen, Nachschwingen), 'in' = aus dem Stand beschleunigen, 'lin'/'io' = fließend.
// lunge = Ausfallschritt (m): das rechte Bein tritt so weit vor, das linke wird danach nachgezogen; drop = Hüfte tiefer.
const READY = { arm: [-0.35, -0.85, 0.3], fore: [-0.2, -0.15, 1], blade: [0.1, 0.28, 1], tw: 0, ln: 0 };
/** Lage der rechten Hand in der Grundhaltung (wird beim Laden aus den echten Armlängen berechnet) */
export const READY_HAND = [-0.15, -0.27, 0.33];
const EL0 = [-0.75, -0.65, 0.1];                     // Ellbogen locker nach außen unten
const LA0 = [0.28, -1, 0.06], LF0 = [0.08, -1, 0.32]; // linker Arm locker
const K = (t, o = {}) => ({ t, e: 'io', ...o });
const R0 = (t, e = 'io', o = {}) => K(t, { h: 'R', b: READY.blade, el: EL0, e, ...o });
// linker Arm in der leichten Kombo (der schwere Schlag ist beidhändig)
const LA_FWD = { la: [0.45, -0.62, 0.64], lf: [0.0, 0.12, 1] };   // linke Hand zeigt zum Gegner (misst den Abstand)
const LA_IN = { la: [0.45, -0.85, -0.25], lf: [-0.35, -0.35, 0.87] }; // zieht beim Schlag an die Hüfte zurück
const LA_MID = { la: [0.42, -0.8, 0.3], lf: [0.25, -0.5, 0.8] };
const LA_FENCE = { la: [0.55, -0.45, -0.7], lf: [0.3, -0.35, -0.88] }; // Ausfall: linker Arm nach hinten gestreckt
export const ATTACKS = {
  // Leichte Kombo wie ein echter Säbelfechter – jeder Schlag mit vollständiger Bewegung: Gewicht zurück und ausholen (Hüfte und
  // Schultern spannen sich), dann Hüfte → Schultern → Arm → Handgelenk, Schritt nach vorn (die Hand trifft vor dem Fuß), die Klinge
  // schwingt durch und bremst aus, der hintere Fuß wird nachgezogen, zurück in die Grundhaltung. Linke Hand: beim Ausholen zum Gegner,
  // beim Schlag an die Hüfte zurück (Gegenzug). Die Klinge läuft nie durch die Unterarm-Linie (sonst kippt die Faust).
  // l1: schräger Hieb von oben rechts nach unten links (über die rechte Schulter geladen, Klinge kommt über oben herein)
  // l2: Rückhand schräg von unten links nach oben rechts (beginnt dort, wo l1 endet)
  // l3: Ausfall mit Stoß (Abschluss): zurückziehen, tief nach vorn fallen, Arm gestreckt, linker Arm nach hinten wie beim Fechten
  l1: { T: 0.82, act: [0.31, 0.4], cost: 14, dmg: 12, poise: 11, range: 2.05, arc: 1.2, lunge: 0.34, drop: 0.07, next: 'l2', heavy: false, keys: [
    R0(0),
    K(0.09, { h: [-0.2, -0.12, 0.22], b: [-0.35, 0.55, 0.75], el: [-0.85, -0.45, 0.1], tw: -0.2, hip: -0.08, sh: -0.02, ...LA_FWD }),
    K(0.21, { h: [-0.24, 0.2, 0.02], b: [-0.25, 0.45, -0.86], el: [-0.85, 0.35, -0.3], tw: -0.6, hip: -0.24, ln: -0.06, sh: -0.05, cr: 0.04, ...LA_FWD, e: 'out' }),
    K(0.29, { h: [-0.2, 0.17, 0.25], b: [-0.45, 0.88, 0.15], el: [-0.9, 0.1, -0.1], tw: -0.25, hip: 0.05, ln: 0.06, cr: 0.05, ...LA_MID }),
    K(0.318, { h: [-0.12, 0.1, 0.38], b: [0.35, 0.72, 0.6], el: [-0.85, -0.3, -0.1], tw: 0.02, hip: 0.18, ln: 0.12, sh: 0.03, cr: 0.065, ...LA_IN }),
    K(0.345, { h: [-0.02, -0.02, 0.46], b: [0.62, -0.32, 0.72], el: [-0.75, -0.6, 0], tw: 0.25, hip: 0.28, ln: 0.2, sh: 0.06, cr: 0.08, ...LA_IN }),
    K(0.4, { h: [0.16, -0.25, 0.38], b: [0.62, -0.68, 0.1], el: [-0.5, -0.85, 0.15], tw: 0.5, hip: 0.36, ln: 0.27, sh: 0.07, cr: 0.09, ...LA_IN }),
    K(0.5, { h: [0.22, -0.36, 0.25], b: [0.5, -0.7, -0.45], el: [-0.3, -0.9, 0.25], tw: 0.62, hip: 0.4, ln: 0.26, sh: 0.06, cr: 0.08, ...LA_IN, e: 'out' }),
    K(0.65, { h: [-0.06, -0.22, 0.3], b: [0.2, 0.05, 1], el: [-0.7, -0.7, 0.1], tw: 0.2, hip: 0.12, ln: 0.08, sh: 0.02, cr: 0.03, ...LA_MID }),
    R0(0.82)] },
  l2: { T: 0.78, act: [0.27, 0.36], cost: 14, dmg: 12, poise: 11, range: 2.05, arc: 1.2, lunge: 0.3, drop: 0.06, next: 'l3', heavy: false, keys: [
    R0(0),
    K(0.17, { h: [0.16, -0.32, 0.2], b: [0.5, -0.5, -0.7], el: [-0.2, -0.95, 0.25], tw: 0.55, hip: 0.3, ln: 0.14, sh: -0.02, cr: 0.06, ...LA_FWD, e: 'out' }),
    K(0.25, { h: [0.06, -0.26, 0.36], b: [0.75, -0.62, 0.2], el: [-0.45, -0.85, 0.25], tw: 0.3, hip: 0.05, ln: 0.12, cr: 0.07, ...LA_MID }),
    K(0.305, { h: [-0.1, -0.02, 0.46], b: [-0.5, 0.42, 0.76], el: [-0.8, -0.55, 0], tw: -0.15, hip: -0.22, ln: 0.14, sh: 0.06, cr: 0.07, ...LA_IN }),
    K(0.37, { h: [-0.25, 0.16, 0.33], b: [-0.7, 0.68, -0.2], el: [-0.85, -0.2, -0.3], tw: -0.48, hip: -0.32, ln: 0.06, sh: 0.05, cr: 0.06, ...LA_IN }),
    K(0.46, { h: [-0.3, 0.24, 0.16], b: [-0.45, 0.6, -0.66], el: [-0.85, 0.1, -0.4], tw: -0.58, hip: -0.36, ln: 0.02, sh: 0.04, cr: 0.05, ...LA_IN, e: 'out' }),
    K(0.62, { h: [-0.18, -0.12, 0.3], b: [0, 0.3, 0.95], el: [-0.75, -0.6, 0.1], tw: -0.2, hip: -0.12, ln: 0.04, cr: 0.03, ...LA_MID }),
    R0(0.78)] },
  l3: { T: 1.0, act: [0.36, 0.46], cost: 16, dmg: 18, poise: 16, range: 2.5, arc: 0.6, lunge: 0.66, drop: 0.12, next: null, heavy: false, keys: [
    R0(0),
    K(0.16, { h: [-0.18, -0.2, 0.18], b: [0.05, 0.12, 1], el: [-0.7, -0.6, -0.3], tw: -0.3, hip: -0.15, sh: -0.04, cr: 0.04, ...LA_FWD }),
    K(0.285, { h: [-0.12, -0.14, -0.04], b: [0.06, 0.06, 1], el: [-0.55, -0.45, -0.7], tw: -0.6, hip: -0.38, ln: -0.06, sh: -0.08, cr: 0.08, la: [0.45, -0.5, 0.74], lf: [0.05, 0.22, 1], e: 'out' }),
    K(0.35, { h: [0.0, -0.07, 0.4], b: [0.04, 0.0, 1], el: [-0.85, -0.5, -0.1], tw: 0.15, hip: 0.05, ln: 0.18, sh: 0.05, cr: 0.1, ...LA_MID, e: 'lin' }),
    K(0.4, { h: [0.05, -0.06, 0.48], b: [0.03, -0.03, 1], el: [-0.9, -0.4, 0], tw: 0.5, hip: 0.3, ln: 0.3, sh: 0.1, cr: 0.13, ...LA_FENCE }),
    K(0.56, { h: [0.05, -0.08, 0.47], b: [0.03, -0.05, 1], el: [-0.9, -0.4, 0], tw: 0.48, hip: 0.3, ln: 0.28, sh: 0.1, cr: 0.13, ...LA_FENCE, e: 'lin' }),
    K(0.76, { h: [-0.1, -0.2, 0.32], b: [0.1, 0.2, 1], el: [-0.75, -0.6, 0.1], tw: 0.15, hip: 0.1, ln: 0.1, sh: 0.03, cr: 0.06, ...LA_MID }),
    R0(1.0)] },
  // schwer: beidhändig über die rechte Schulter laden (Körper spannt nach hinten, Gewicht zurück, kurzes Halten),
  // dann mit Ausfallschritt senkrecht hindurch bis zum Boden (slam = Aufschlag), schwer wieder aufrichten
  h: { T: 1.15, act: [0.53, 0.63], slam: 0.6, cost: 26, dmg: 32, poise: 30, range: 2.3, arc: 0.9, lunge: 0.5, drop: 0.05, next: null, heavy: true, keys: [
    R0(0),
    K(0.2, { h: [-0.04, 0.1, 0.26], b: [-0.25, 0.9, 0.2], el: [-0.9, -0.3, -0.1], tw: -0.15, hip: -0.05, ln: -0.05, th: 1 }),
    K(0.42, { h: [0.04, 0.3, -0.08], b: [-0.25, -0.18, -0.95], el: [-0.9, 0.25, -0.1], tw: -0.45, hip: -0.2, ln: -0.28, cr: 0.06, sh: -0.07, th: 1, e: 'out' }),
    K(0.48, { h: [0.05, 0.32, -0.1], b: [-0.18, -0.3, -0.94], el: [-0.9, 0.25, -0.1], tw: -0.5, hip: -0.22, ln: -0.32, cr: 0.07, sh: -0.08, th: 1 }),
    K(0.53, { h: [0.12, 0.3, 0.22], b: [0, 0.93, 0.37], el: [-0.9, 0, 0.2], tw: -0.12, hip: -0.05, ln: 0.05, cr: 0.08, th: 1, e: 'in' }),
    K(0.575, { h: [0.2, -0.36, 0.44], b: [0.04, -0.6, 0.8], el: [-0.85, -0.5, 0.2], tw: 0.22, hip: 0.18, ln: 0.55, cr: 0.22, sh: 0.08, th: 1, e: 'lin' }),
    K(0.64, { h: [0.21, -0.48, 0.36], b: [0.06, -0.86, 0.5], el: [-0.8, -0.6, 0.2], tw: 0.25, hip: 0.2, ln: 0.62, cr: 0.26, sh: 0.08, th: 1, e: 'out' }),
    K(0.85, { h: [0.19, -0.4, 0.4], b: [0.08, -0.7, 0.7], el: [-0.8, -0.6, 0.1], tw: 0.15, hip: 0.12, ln: 0.45, cr: 0.18, sh: 0.05, th: 0.9 }),
    R0(1.15, 'io', { th: 0 })] },
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
const val = (key, field, def) => { const v = key[field]; return v === 'R' ? READY_HAND : v ?? def; };
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
/** Lage (Punkt, keine Richtung) mit stetigem Tempo: Hermite-Kurve, Tempo am Schlüssel = Mittel der Nachbarn (0 bei Umkehr/'out'/'in') */
function velAt(k, j, field) {
  if (j <= 0 || j >= k.length - 1 || k[j].e === 'out' || k[j + 1].e === 'in') return null;
  const A = val(k[j - 1], field), B = val(k[j], field), C = val(k[j + 1], field), d0 = k[j].t - k[j - 1].t, d1 = k[j + 1].t - k[j].t;
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - B[0], C[1] - B[1], C[2] - B[2]];
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  if (lu < 1e-5 || lv < 1e-5) return null;
  const turn = Math.max(0, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)); // Umkehr → stehen bleiben
  return [0, 1, 2].map((i) => turn * 0.5 * (u[i] / d0 + v[i] / d1));
}
function samplePos(k, t, field, out) {
  let i = 0; while (i < k.length - 2 && t > k[i + 1].t) i++;
  const a = k[i], b = k[i + 1], d = b.t - a.t, u = Math.min(1, Math.max(0, (t - a.t) / d));
  const A = val(a, field), B = val(b, field), va = velAt(k, i, field), vb = velAt(k, i + 1, field);
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let c = 0; c < 3; c++) out[c] = h00 * A[c] + h01 * B[c] + h10 * (va ? va[c] * d : 0) + h11 * (vb ? vb[c] * d : 0);
  return out;
}
/**
 * Haltung eines Angriffs zur Zeit t: Handlage, Klinge, Ellbogen, linker Arm, Rumpf (tw, Hüfte, vorbeugen, Knie, Gewicht), beidhändig.
 * twLead/twMid = untere Wirbelsäule ist der Drehung voraus (Peitsche: Hüfte → Brust → Schulter → Arm).
 */
export function attackPose(atk, t, out) {
  const k = atk.keys, T = Math.min(atk.T, Math.max(0, t));
  out.hand = samplePos(k, T, 'h', out.hand || [0, 0, 0]);
  sample(k, T, 'b', out.blade); out.el = sample(k, T, 'el', out.el || [0, 0, 0], EL0);
  out.la = sample(k, T, 'la', out.la || [0, 0, 0], LA0); out.lf = sample(k, T, 'lf', out.lf || [0, 0, 0], LF0);
  out.tw = sample(k, T, 'tw'); out.ln = sample(k, T, 'ln'); out.hip = sample(k, T, 'hip');
  out.cr = sample(k, T, 'cr'); out.sh = sample(k, T, 'sh'); out.th = Math.min(1, Math.max(0, sample(k, T, 'th')));
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
