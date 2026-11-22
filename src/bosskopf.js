// Kopf, Maul, Ohren und Schwanz des Bosses – das, was ein großes Tier lebendig wirken lässt.
// Läuft jedes Bild nach der Körperhaltung (boss.js animate):
// 1. BLICK wie bei echten Tieren: Tiere folgen einem Ziel nicht stufenlos – der Kopf SPRINGT schnell zur neuen Blickrichtung
//    (leicht überschießend) und hält dann still („Blicksprünge“); der Hals zieht langsam nach, bei großen Winkeln dreht die Brust
//    mit. Er schaut zu dir hinunter, wenn du nah bist (echter Höhenwinkel vom Hals zu deiner Brust), und NEIGT den Kopf zu der
//    Seite, auf der du stehst (Ohr dieser Seite sinkt – je tiefer der Blick, desto mehr). Dazu glattes Rauschen und ein ruhiger Kopf.
// 2. MAUL beim Lauern (echter Unterkiefer, bosskiefer.js): hecheln (Pumpen ~1,3 Hz, nie ganz gleichmäßig), immer wieder das
//    Maul schließen (mit Schlucken: Kiefer zuckt, Kopf nickt kurz), Lefzen lecken (zweimal schnell auf und zu), beim Knurren einen
//    Spalt offen und bebend. Zustandswechsel laufen über Federn – nichts springt.
// 3. VERHALTEN beim Lauern: knurren (Kopf tief, Ohren flach, Kiefer bebt), Kopf schütteln, zur Seite schauen, Kopf schief legen.
// 4. OHREN: weiche, leicht nachschwingende Federn – wippen, wenn der Kopf sich bewegt, zucken ab und zu, liegen im Kampf flach an.
// 5. SCHWANZ als Kette aus vier Gliedern: jedes federt verzögert nach (Welle), schleppt bei Drehungen hinterher, pendelt in Ruhe,
//    ist im Kampf steif und erhoben.
import * as THREE from 'three';

const qP = new THREE.Quaternion(), qR = new THREE.Quaternion(), qW = new THREE.Quaternion();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), AX = new THREE.Vector3(), FH = new THREE.Vector3();
const XA = new THREE.Vector3(), XB = new THREE.Vector3(), LA = new THREE.Vector3();

/** Knochen um eine Weltachse drehen */
function rotW(bone, axisW, ang) {
  if (!bone || !Number.isFinite(ang) || Math.abs(ang) < 1e-5) return;
  bone.parent.getWorldQuaternion(qP);
  qW.copy(qP).multiply(bone.quaternion);
  qR.setFromAxisAngle(axisW, ang).multiply(qW);
  bone.quaternion.copy(qP.invert().multiply(qR)).normalize();   // Länge 1 halten (siehe bossbeine.js rotW)
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
const pulse = (t, a, b) => (t > a && t < b ? Math.sin(Math.PI * (t - a) / (b - a)) ** 2 : 0);   // weicher Buckel von a bis b
const rnd = (a, b) => a + Math.random() * (b - a);
// glattes Rauschen (zwei Lagen): kleine Bewegungen, die sich nie wiederholen
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1; }
const noise2 = (x, seed) => 0.65 * noise(x + seed) + 0.35 * noise(x * 2.3 + seed * 1.7);

// Verhalten beim Lauern: Dauer (s)
const EV = { knurren: 1.7, schuetteln: 0.95, umschauen: 1.9, neigen: 1.5 };
// Maul beim Lauern: Dauer (von–bis, s); Öffnung 0 = zu (bosskiefer.js ZU), 0,46 = wie das Modell
const MAUL = { hecheln: [2, 4.5], zu: [1.8, 4], lecken: [0.9, 0.9] };   // ≈ ein Drittel der Lauerzeit zu
// Kopf-Achsen im Raum des Kopf-Knochens (am Modell vermessen, bosskiefer.js): vorn = Richtung Nase (+z, leicht abwärts), quer = +x
const FWD_H = new THREE.Vector3(0, -0.3, 1).normalize(), LAT_H = new THREE.Vector3(1, 0, 0);
const YAW_MAX = 1.65;   // so weit (rad) dreht er Kopf + Hals + Brust zusammen (≈ 95°)

export class Kopf {
  /** B = Knochen; tipLocal = Schnauzenspitze im Raum des Kopf-Knochens (Hitbox; der Kopf selbst nutzt FWD_H) */
  constructor(B, tipLocal) {
    this.B = B; this.ok = !!(B.head && B.neck1 && B.neck_01);
    this.yN = S(); this.yH = S(); this.yC = S(); this.pN = S(); this.pH = S(); this.rH = S(); this.jawS = S(); this.lowS = S();
    this.ears = [['earL_01', 'earL', 1], ['earR_01', 'earR', -1]].map(([a, b, s]) => ({ base: B[a], tip: B[b], s, pin: S(), side: S(), next: 1 + Math.random() * 3 }))
      .filter((e) => e.base && e.tip);
    this.tailB = ['tail2', 'tail3', 'tail_03', 'tail4'].map((n) => B[n]).filter(Boolean);
    this.tailY = this.tailB.map(S); this.tailP = this.tailB.map(S);
    this.ev = null; this.evNext = 2.5 + Math.random() * 3; this.seed = Math.random() * 50;
    this.gz = { y: 0, p: 0 }; this.gzT = 0; this.gzHold = 1;                       // Blickziel (Blicksprünge)
    this.mz = { k: 'hecheln', t: 0, T: rnd(...MAUL.hecheln) };                     // Maul-Zustand
    this.mBase = S(); this.mAmp = S(); this.pph = 0; this.pump = 0;
    this.jaw = 0; this.lower = 0;
  }
  static get BONES() { return ['earL_01', 'earR_01', 'tail_03']; }

  /** Querachse des Kopfes in Weltrichtung (für den Unterkiefer: öffnet/schließt immer um die eigene Kopfachse) */
  lat(out) { this.B.head.getWorldQuaternion(qW); return out.copy(LAT_H).applyQuaternion(qW); }

  pick(c) {
    const r = Math.random() * (c.far ? 1.15 : 1);
    const k = r < 0.45 ? 'knurren' : r < 0.65 ? 'neigen' : r < 0.82 ? 'schuetteln' : 'umschauen';
    if (k === 'knurren' && c.onGrowl) c.onGrowl();
    return { k, t: 0, T: EV[k], dir: Math.random() < 0.5 ? -1 : 1 };
  }

  /** nächster Maul-Zustand: oft hecheln, immer wieder zu (mit Schlucken), ab und zu die Lefzen lecken */
  nextMaul(c) {
    const r = Math.random(), k0 = this.mz.k;
    let k = k0 === 'hecheln' ? (r < 0.62 ? 'zu' : r < 0.82 ? 'lecken' : 'hecheln')
      : k0 === 'zu' ? (r < 0.72 ? 'hecheln' : 'lecken') : (r < 0.5 ? 'zu' : 'hecheln');
    const T = rnd(...MAUL[k]) * (c.angry && k !== 'lecken' ? 0.75 : 1);   // nah am Magier: unruhiger
    this.mz = { k, t: 0, T, sw: rnd(0.45, 0.7) };
  }

  /**
   * c = { st, alive, calm, attack, angry, look (Blickwinkel zum Ziel, rad, relativ zum Körper, vom Hals aus), lookW (0…1),
   *       down (Kopf tiefer, rad – aus dem Höhenwinkel zum Ziel), far, bodyRoll, yawRate, X, Y (Körperachsen), clk, onGrowl }
   */
  update(dt, c) {
    if (!this.ok) return;
    const B = this.B;
    // ---------- Verhalten beim Lauern ----------
    if (c.st === 'stalk' && c.alive) { if (!this.ev && (this.evNext -= dt) <= 0) this.ev = this.pick(c); }
    else if (this.ev) this.ev = null;
    let eY = 0, eP = 0, eR = 0, eJ = 0, ePin = 0, eLow = 0, growl = 0;
    const E = this.ev;
    if (E) {
      E.t += dt;
      const fade = (a, b) => sm(E.t / a) * (1 - sm((E.t - (E.T - b)) / b));
      if (E.k === 'knurren') { const e = fade(0.35, 0.45); eP = 0.22 * e; ePin = 1 * e; eLow = e; growl = e; eJ = e * (0.03 * Math.sin(E.t * 41) + 0.02 * Math.sin(E.t * 67)); }
      if (E.k === 'schuetteln') { const e = fade(0.12, 0.3), w = 2 * Math.PI * 6.2 * E.t; eR = 0.34 * Math.sin(w) * e; eY = 0.12 * Math.sin(w + 1.3) * e; eP = -0.06 * e; eJ = 0.05 * e; }
      if (E.k === 'umschauen') { const e = fade(0.5, 0.55); eY = E.dir * 0.65 * e; eP = -0.12 * e; ePin = -0.25 * e; }
      if (E.k === 'neigen') { const e = fade(0.4, 0.45); eR = E.dir * 0.3 * e; eP = -0.06 * e; ePin = -0.2 * e; }
      if (E.t >= E.T) { this.ev = null; this.evNext = 2.2 + Math.random() * 4; }
    }
    // ---------- Maul (nur beim Lauern; in Angriffen bestimmt die Angriffshaltung das Maul) ----------
    const maulOn = c.st === 'stalk' && c.alive;
    let mB = 0, mA = 0, mX = 0;
    if (maulOn) {
      const Mz = this.mz; Mz.t += dt;
      if (Mz.t >= Mz.T) this.nextMaul(c);
      if (Mz.k === 'hecheln') { mB = 0.34 + 0.06 * noise2(c.clk * 0.45, this.seed + 51); mA = c.angry ? 0.06 : 0.09; }
      else if (Mz.k === 'zu') {
        mB = 0.012;
        // Schlucken: kurz nach dem Schließen zuckt der Kiefer, der Kopf nickt einmal (Stoß in die Kopf-Feder)
        mX = 0.07 * pulse(Mz.t, Mz.sw, Mz.sw + 0.28);
        if (Mz.t - dt < Mz.sw && Mz.t >= Mz.sw) this.pH.v += 0.55;
      } else if (Mz.k === 'lecken') { mB = 0.03; mX = 0.17 * (pulse(Mz.t, 0.08, 0.3) + pulse(Mz.t, 0.42, 0.64)); }
      if (growl) { mB = mB * (1 - growl) + 0.16 * growl; mA *= 1 - growl; mX *= 1 - growl; }   // Knurren: Spalt offen, bebt
    }
    spring(this.mBase, mB, 6.5, 0.9, dt);                     // auf/zu in ~0,4 s, ohne Ruck
    spring(this.mAmp, mA, 3.5, 1, dt);
    this.pph += dt * 2 * Math.PI * (1.3 + 0.25 * noise2(c.clk * 0.3, this.seed + 61));   // Hecheln: nie ganz gleichmäßig
    const pant = Math.max(0, this.mAmp.x) * (0.5 + 0.5 * Math.sin(this.pph));
    this.pump = this.mAmp.x / 0.09 * Math.sin(this.pph);       // Brust pumpt mit (boss.js)
    spring(this.jawS, eJ + mX, 26, 0.6, dt);
    spring(this.lowS, eLow, 5, 0.95, dt);
    this.jaw = Math.max(0, this.mBase.x + pant) + this.jawS.x; this.lower = this.lowS.x;

    // ---------- Blick: Blicksprünge, Kopf führt, Hals zieht nach, Brust dreht bei großen Winkeln mit ----------
    const nz = c.calm ? 1 : c.attack ? 0 : 0.35;   // im Angriff kein Zufall: der Kopf gehört dem Zielen
    const ny = noise2(c.clk * 0.35, this.seed) * 0.08 * nz, np = noise2(c.clk * 0.3, this.seed + 9) * 0.05 * nz, nr = noise2(c.clk * 0.22, this.seed + 21) * 0.05 * nz;
    const wantY = clamp(c.lookW * c.look, -YAW_MAX, YAW_MAX) + eY, wantP = c.down + eP;
    this.gzT += dt;
    const thrY = c.attack ? 0 : 0.13, thrP = c.attack ? 0 : 0.09;   // im Angriff stufenlos (Zielen), sonst in Sprüngen
    if (Math.abs(wantY - this.gz.y) > thrY || Math.abs(wantP - this.gz.p) > thrP || this.gzT > this.gzHold) {
      this.gz.y = wantY; this.gz.p = wantP; this.gzT = 0; this.gzHold = rnd(0.5, 1.8);
    }
    const yawT = this.gz.y + ny, pitT = this.gz.p + np;
    const chestT = Math.sign(yawT) * clamp((Math.abs(yawT) - 0.75) * 0.45, 0, 0.32);
    spring(this.yC, chestT, 2.6, 0.95, dt);                    // Brust: schwer und langsam
    spring(this.yN, (yawT - this.yC.x) * 0.6, 3.6, 0.92, dt); // Hals: langsam
    spring(this.yH, yawT - this.yC.x - this.yN.x, 10, 0.72, dt);   // Kopf: schnell, schießt leicht über, entspannt sich hinter dem Hals
    spring(this.pN, pitT * 0.6, 4.2, 0.9, dt);
    spring(this.pH, pitT - this.pN.x, 10, 0.78, dt);
    // Neigen zur Seite des Ziels: Ohr dieser Seite sinkt (links schauen → links neigen); je tiefer der Blick, desto mehr
    const yawNow = this.yC.x + this.yN.x + this.yH.x;
    const tilt = -0.3 * yawNow * (0.55 + 0.75 * clamp(this.pN.x + this.pH.x, 0, 0.5) / 0.5);
    const stab = c.calm ? 0.55 : 0.15;                         // Kopf ruhig halten (Kurvenlage/Wiegen des Körpers ausgleichen)
    spring(this.rH, clamp(eR + nr + tilt - stab * c.bodyRoll, -0.55, 0.55), 6.5, 0.7, dt);
    // anwenden: Drehen (um die Hochachse des Körpers), dann Nicken um die schon gedrehten Querachsen, zuletzt Neigen um „vorn“
    if (B.chest) rotW(B.chest, c.Y, this.yC.x);
    rotW(B.neck_01, c.Y, this.yN.x * 0.4); rotW(B.neck1, c.Y, this.yN.x * 0.6); rotW(B.head, c.Y, this.yH.x);
    XA.copy(c.X).applyAxisAngle(c.Y, this.yC.x + this.yN.x * 0.4); XB.copy(c.X).applyAxisAngle(c.Y, this.yC.x + this.yN.x);
    rotW(B.neck_01, XA, this.pN.x * 0.4); rotW(B.neck1, XB, this.pN.x * 0.6); rotW(B.head, this.lat(LA), this.pH.x);
    B.head.getWorldQuaternion(qW); FH.copy(FWD_H).applyQuaternion(qW);   // „vorn“ am Kopf (Richtung Nase)
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
      AX.crossVectors(v3, v2.copy(FH).negate()); if (AX.lengthSq() > 1e-10) rotW(e.base, AX.normalize(), e.pin.x * 0.6);
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
