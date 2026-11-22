// Kopf, Ohren und Schwanz des Bosses – das, was ein großes Tier lebendig wirken lässt.
// Läuft jedes Bild nach der Körperhaltung (boss.js animate):
// 1. BLICK wie bei echten Tieren: der Kopf dreht sich schnell zum Ziel, der Hals zieht langsamer nach, danach entspannt sich der
//    Kopf wieder (Kopf führt, Hals folgt – „überlappende Bewegung“). Dazu kleine Zufallsbewegungen (glattes Rauschen, nie gleich)
//    und ein ruhiger Kopf: Wiegen und Kurvenlage des Körpers werden beim Lauern zum Teil ausgeglichen.
// 2. VERHALTEN beim Lauern: knurren (Kopf tief, Ohren flach, Kiefer bebt), Kopf schütteln, zur Seite schauen, Kopf schief legen.
// 3. OHREN: weiche, leicht nachschwingende Federn – wippen, wenn der Kopf sich bewegt, zucken ab und zu, liegen im Kampf flach an.
// 4. SCHWANZ als Kette aus vier Gliedern: jedes federt verzögert nach (Welle), schleppt bei Drehungen hinterher, pendelt in Ruhe,
//    ist im Kampf steif und erhoben.
import * as THREE from 'three';

const qP = new THREE.Quaternion(), qR = new THREE.Quaternion(), qW = new THREE.Quaternion();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), AX = new THREE.Vector3(), FH = new THREE.Vector3();

/** Knochen um eine Weltachse drehen */
function rotW(bone, axisW, ang) {
  if (!bone || !Number.isFinite(ang) || Math.abs(ang) < 1e-5) return;
  bone.parent.getWorldQuaternion(qP);
  qW.copy(qP).multiply(bone.quaternion);
  qR.setFromAxisAngle(axisW, ang).multiply(qW);
  bone.quaternion.copy(qP.invert().multiply(qR));
}
/** gedämpfte Feder (Lage x, Tempo v); zeta < 1 schwingt leicht nach – wirkt weich und lebendig */
function spring(s, target, om, zeta, dt) {
  if (!Number.isFinite(target)) target = 0;
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) { s.v += (om * om * (target - s.x) - 2 * zeta * om * s.v) * h; s.x += s.v * h; }
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) { s.x = 0; s.v = 0; }
  return s.x;
}
const S = () => ({ x: 0, v: 0 });
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };
// glattes Rauschen (zwei Lagen): kleine Bewegungen, die sich nie wiederholen
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1; }
const noise2 = (x, seed) => 0.65 * noise(x + seed) + 0.35 * noise(x * 2.3 + seed * 1.7);

// Verhalten beim Lauern: Dauer (s) und Gewicht bei der Auswahl
const EV = { knurren: 1.7, schuetteln: 0.95, umschauen: 1.9, neigen: 1.5 };

export class Kopf {
  /** B = Knochen; tipLocal = Schnauzenspitze im Raum des Kopf-Knochens (für „vorn“ am Kopf) */
  constructor(B, tipLocal) {
    this.B = B; this.ok = !!(B.head && B.neck1 && B.neck_01);
    this.fwdL = (tipLocal && tipLocal.lengthSq() > 1e-8 ? tipLocal.clone() : new THREE.Vector3(0, 0, 1)).normalize();
    this.yN = S(); this.yH = S(); this.pN = S(); this.pH = S(); this.rH = S(); this.jawS = S(); this.lowS = S();
    this.ears = [['earL_01', 'earL', 1], ['earR_01', 'earR', -1]].map(([a, b, s]) => ({ base: B[a], tip: B[b], s, pin: S(), side: S(), next: 1 + Math.random() * 3 }))
      .filter((e) => e.base && e.tip);
    this.tailB = ['tail2', 'tail3', 'tail_03', 'tail4'].map((n) => B[n]).filter(Boolean);
    this.tailY = this.tailB.map(S); this.tailP = this.tailB.map(S);
    this.ev = null; this.evNext = 2.5 + Math.random() * 3; this.seed = Math.random() * 50;
    this.jaw = 0; this.lower = 0;
  }
  static get BONES() { return ['earL_01', 'earR_01', 'tail_03']; }

  pick(c) {
    const r = Math.random() * (c.far ? 1.15 : 1);
    const k = r < 0.45 ? 'knurren' : r < 0.65 ? 'neigen' : r < 0.82 ? 'schuetteln' : 'umschauen';
    if (k === 'knurren' && c.onGrowl) c.onGrowl();
    return { k, t: 0, T: EV[k], dir: Math.random() < 0.5 ? -1 : 1 };
  }

  /**
   * c = { st, alive, calm, attack, angry, look (Blickwinkel zum Ziel, rad, relativ zum Körper), lookW (0…1), down (Kopf tiefer, rad),
   *       far, bodyRoll, yawRate, X, Y (Körperachsen), clk, onGrowl }
   */
  update(dt, c) {
    if (!this.ok) return;
    const B = this.B;
    // ---------- Verhalten beim Lauern ----------
    if (c.st === 'stalk' && c.alive) { if (!this.ev && (this.evNext -= dt) <= 0) this.ev = this.pick(c); }
    else if (this.ev) this.ev = null;
    let eY = 0, eP = 0, eR = 0, eJ = 0, ePin = 0, eLow = 0;
    const E = this.ev;
    if (E) {
      E.t += dt;
      const fade = (a, b) => sm(E.t / a) * (1 - sm((E.t - (E.T - b)) / b));
      if (E.k === 'knurren') { const e = fade(0.35, 0.45); eP = 0.22 * e; ePin = 1 * e; eLow = e; eJ = e * (0.08 + 0.05 * Math.sin(E.t * 41) + 0.03 * Math.sin(E.t * 67)); }
      if (E.k === 'schuetteln') { const e = fade(0.12, 0.3), w = 2 * Math.PI * 6.2 * E.t; eR = 0.34 * Math.sin(w) * e; eY = 0.12 * Math.sin(w + 1.3) * e; eP = -0.06 * e; eJ = 0.05 * e; }
      if (E.k === 'umschauen') { const e = fade(0.5, 0.55); eY = E.dir * 0.65 * e; eP = -0.12 * e; ePin = -0.25 * e; }
      if (E.k === 'neigen') { const e = fade(0.4, 0.45); eR = E.dir * 0.3 * e; eP = -0.06 * e; ePin = -0.2 * e; }
      if (E.t >= E.T) { this.ev = null; this.evNext = 2.2 + Math.random() * 4; }
    }
    // ---------- Blick: Kopf führt, Hals zieht nach ----------
    const nz = c.calm ? 1 : c.attack ? 0 : 0.35;   // im Angriff kein Zufall: der Kopf gehört dem Zielen
    const ny = noise2(c.clk * 0.35, this.seed) * 0.1 * nz, np = noise2(c.clk * 0.3, this.seed + 9) * 0.06 * nz, nr = noise2(c.clk * 0.22, this.seed + 21) * 0.05 * nz;
    const yawT = clamp(c.lookW * c.look + eY + ny, -1.4, 1.4), pitT = c.down + eP + np;
    spring(this.yN, yawT * 0.62, 3.6, 0.92, dt);              // Hals: langsam, schwer
    spring(this.yH, yawT - this.yN.x, 9.5, 0.82, dt);         // Kopf: schnell, deckt den Rest ab und entspannt sich, sobald der Hals da ist
    spring(this.pN, pitT * 0.6, 4.2, 0.9, dt);
    spring(this.pH, pitT - this.pN.x, 10, 0.82, dt);
    const stab = c.calm ? 0.55 : 0.15;                          // Kopf ruhig halten (Kurvenlage/Wiegen des Körpers ausgleichen)
    spring(this.rH, eR + nr - stab * c.bodyRoll, 7.5, 0.72, dt);
    spring(this.jawS, eJ, 26, 0.6, dt);
    spring(this.lowS, eLow, 5, 0.95, dt);
    this.jaw = this.jawS.x; this.lower = this.lowS.x;
    rotW(B.neck_01, c.Y, this.yN.x * 0.4); rotW(B.neck1, c.Y, this.yN.x * 0.6); rotW(B.head, c.Y, this.yH.x);
    rotW(B.neck_01, c.X, this.pN.x * 0.4); rotW(B.neck1, c.X, this.pN.x * 0.6); rotW(B.head, c.X, this.pH.x);
    B.head.getWorldQuaternion(qW); FH.copy(this.fwdL).applyQuaternion(qW);   // „vorn“ am Kopf (Richtung Schnauze)
    rotW(B.head, FH, this.rH.x);
    // ---------- Ohren ----------
    const pinT = clamp(c.attack ? 1 : c.angry ? 0.75 : 0.12 + ePin, -0.35, 1);
    const headV = this.yH.v + this.yN.v;                          // Drehtempo des Kopfes → Ohren schwingen nach
    for (const e of this.ears) {
      if ((e.next -= dt) <= 0) {                                  // Zucken (in Ruhe öfter)
        e.side.v += (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 5) * (c.calm ? 1 : 0.4);
        e.pin.v += (Math.random() - 0.35) * 5 * (c.calm ? 1 : 0.4);
        e.next = (c.calm ? 1.2 : 2.5) + Math.random() * 4;
      }
      spring(e.pin, pinT + 0.05 * noise2(c.clk * 0.8, this.seed + e.s * 7), 11, 0.42, dt);
      spring(e.side, -headV * 0.06 * e.s + 0.05 * noise2(c.clk * 0.6, this.seed + e.s * 13), 9, 0.38, dt);
      e.base.getWorldPosition(v1); e.tip.getWorldPosition(v2); v3.subVectors(v2, v1);
      if (v3.lengthSq() < 1e-8) continue;
      // nach hinten anlegen: Spitze dreht Richtung „hinten am Kopf“; zur Seite: Richtung außen (links +X, rechts −X)
      AX.crossVectors(v3, v2.copy(FH).negate()); if (AX.lengthSq() > 1e-10) rotW(e.base, AX.normalize(), e.pin.x * 0.8);
      AX.crossVectors(v3, v2.copy(c.X).multiplyScalar(e.s)); if (AX.lengthSq() > 1e-10) rotW(e.base, AX.normalize(), e.side.x);
    }
  }

  /**
   * Schwanz als Federkette. baseYaw = Haltung aus dem Körper (Schwanzfeger usw.), raise = zusätzlich anheben (rad, + = hoch).
   * Jedes Glied ist etwas weicher als das vorige → Bewegungen laufen als Welle zur Spitze und schwingen nach.
   */
  tail(dt, c, baseYaw = 0, raise = 0) {
    const n = this.tailB.length; if (!n) return;
    const share = [0.45, 0.35, 0.25, 0.15], om = [10, 8, 6.5, 5.5];
    const angry = c.attack || c.angry, spinA = c.st === 'spin';  // Schwanzfeger: Schleifen/Peitschen kommt aus dessen eigener Haltung
    const lag = spinA ? 0 : clamp(-c.yawRate * 0.09, -0.5, 0.5);  // bei Drehungen schleppt der Schwanz hinterher
    const wagA = c.calm ? 0.1 : 0.03, wagF = c.calm ? 1.2 : 2.4;
    const pitBase = spinA ? 0 : (angry ? 0.22 : -0.08) + raise;   // im Kampf steif erhoben, in Ruhe leicht hängend (Schwanzfeger: tief)
    for (let i = 0; i < n; i++) {
      const yT = baseYaw * share[i] + lag * (0.5 + 0.25 * i) + wagA * Math.sin(c.clk * wagF * Math.PI * 2 * 0.5 - i * 0.75)
        + 0.04 * noise2(c.clk * 0.4 + i, this.seed + 31);
      const pT = pitBase * (i === 0 ? 0.6 : 0.2) + 0.03 * noise2(c.clk * 0.5 + i, this.seed + 41);
      spring(this.tailY[i], yT, om[i] * (spinA ? 3 : 1), 0.55, dt); spring(this.tailP[i], pT, om[i] * (spinA ? 3 : 1), 0.6, dt);
      rotW(this.tailB[i], c.Y, this.tailY[i].x); rotW(this.tailB[i], c.X, this.tailP[i].x);
    }
  }
}
