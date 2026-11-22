// Boss-Beine: Pfoten stehen fest auf dem Boden (Fuß-IK) und machen echte Schritte – gegen das Rutschen über den Boden.
// Ablauf je Bein und Bild (nach Clip und allen Haltungen aus dem Code):
//  1. A = wo die Animation die Pfote hinstellen will.
//  2. Zustand: 'frei' (folgt A, z. B. Schwungphase des Clips) → setzt auf, sobald A den Boden berührt → 'steht' (Punkt P bleibt fest in der Welt)
//     → hebt ab, wenn der Clip den Fuß hebt, oder macht einen eigenen SCHRITT, wenn sich der Körper zu weit von P entfernt – nach vorn/
//     hinten, SEITLICH (sonst X-Beine) oder verdreht (beim Drehen auf der Stelle, Vorstoß im Angriff, nach dem Ansturm) → Schritt im
//     Bogen zu A (Vorderpfote klappt dabei am Handgelenk um, hinten hängen die Zehen), dann wieder 'steht'.
//  3. Bein-Löser (ik): Mittelfuß-Neigung aus der Animation (in der Beinebene) → Knöchel-Ziel; Schulter/Hüfte–Ellbogen/Knie–Knöchel
//     als Zwei-Knochen-Dreieck in einer Ebene, die das Bein als gerade Säule hält (keine X-Beine), Knick-Richtung aus der Animation
//     (Ellbogen hinten, Knie vorn). Reicht das Bein nicht, kippt der Mittelfuß (Ballen hebt sich). Pfote: im Stand flach in der
//     Stand-Lage des Geh-Clips, Zehen in Laufrichtung; hinter der Schulter/Hüfte rollt sie über die Zehen ab.
// Diagonale Schritte: ein Bein startet einen eigenen Schritt nur, wenn weder sein Nachbar vorn/hinten noch der auf der anderen Seite schreitet.
// Beim Aufsetzen: onStep(x, z, Stärke) → Staub, dumpfer Tritt, leichtes Beben.
import * as THREE from 'three';

// Hund – so bewegt sich ein Bein (Grundlage für den Bein-Löser unten):
//  · Zehengänger: Hinterer Mittelfuß steht im Stand fast senkrecht, vorderer leicht schräg; die Pfote liegt flach, Zehen nach vorn.
//  · Von vorn/hinten gesehen ist jedes Bein eine GERADE SÄULE (Schulter/Hüfte – Ellbogen/Knie – Pfote untereinander). X-Beine
//    („kuhhessig“) gelten beim Hund als Fehler; beim schnellen Laufen neigt sich höchstens die ganze Säule leicht zur Mitte.
//  · Gelenke knicken nur in ihre Richtung: Ellbogen nach hinten, Knie nach vorn, Sprunggelenk nach hinten.
//  · Stand: die Pfote bleibt liegen; ist der Körper über sie hinweg, hebt sich der Ballen und sie rollt über die Zehen ab.
//  · Schwung: Vorderpfote klappt am Handgelenk nach hinten (Ballen zeigt nach oben), hinten hängen die Zehen; vor dem Aufsetzen
//    streckt sich das Bein und die Pfote setzt flach auf.
//  · Beim Drehen auf der Stelle treten Hunde um (Schritte), statt die Beine zu verdrehen.
// Knochen je Bein: Schulter/Hüfte (j[0]) → Ellbogen/Knie (j[1]) → Handgelenk/Sprunggelenk = Mittelfuß (j[2]) → Pfote (foot) → Zehen (toe)
const LEGS = [
  { k: 'VL', j: ['frontUprL', 'frontLwrL', 'frontHorselinkL'], foot: 'frontFootL', toe: 'frontToeL', front: true },
  { k: 'VR', j: ['frontUprR', 'frontLwrR', 'frontHorselinkR'], foot: 'frontFootR', toe: 'frontToeR', front: true },
  { k: 'HL', j: ['rearLegL_01', 'rearLwrL', 'rearHorselinkL'], foot: 'rearFootL', toe: 'rearToeL', front: false },
  { k: 'HR', j: ['rearLegR_01', 'rearLwrR', 'rearHorselinkR'], foot: 'rearFootR', toe: 'rearToeR', front: false },
];
export const LEG_BONES = LEGS.flatMap((l) => [...l.j, l.foot]);
// Nachbarn: 0↔1 (vorn quer), 2↔3 (hinten quer), 0↔2, 1↔3 (gleiche Seite)
const NB = [[1, 2], [0, 3], [3, 0], [2, 1]];

const vA = new THREE.Vector3(), vE = new THREE.Vector3(), vJ = new THREE.Vector3(), vT = new THREE.Vector3();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), vC = new THREE.Vector3(), vL = new THREE.Vector3();
const qP = new THREE.Quaternion(), qR = new THREE.Quaternion(), qW = new THREE.Quaternion();
const Y_UP = new THREE.Vector3(0, 1, 0);
const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const smoother = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * c * (c * (6 * c - 15) + 10); };
const clampN = (x, a, b) => Math.min(b, Math.max(a, x));
const angD = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/**
 * Knochen um eine Weltachse drehen (Eltern-Weltmatrix muss aktuell sein).
 * Immer auf Länge 1 bringen: weicht eine Drehung nur minimal davon ab, wird die Knochen-Matrix schief, die nächste
 * Welt-Drehung daraus ist es noch mehr – über das Gedächtnis (mem) schaukelte sich das von Bild zu Bild auf, bis ein
 * Bein „explodierte“ (Knochen Millionen Meter weit weg → riesige schwarze Dreiecke über dem Boden der Arena).
 */
function rotW(bone, axisW, ang) {
  if (!bone || !Number.isFinite(ang) || Math.abs(ang) < 1e-6) return;
  bone.parent.getWorldQuaternion(qP);
  qW.copy(qP).multiply(bone.quaternion);
  qR.setFromAxisAngle(axisW, ang).multiply(qW);
  bone.quaternion.copy(qP.invert().multiply(qR)).normalize();
  bone.updateMatrixWorld(true);
}
/** Gemerkte Korrektur prüfen: Länge 1, sonst (NaN/kaputt) zurück auf „keine Korrektur“ */
function clean(q) {
  const n = q.length();
  if (!Number.isFinite(n) || n < 1e-6) return q.identity();
  return q.normalize();
}
/** Knochen so drehen, dass sein Kind-Gelenk am Ziel liegt (kürzester Bogen – die Verdrehung aus der Animation bleibt) */
const aO = new THREE.Vector3(), aC = new THREE.Vector3(), aX = new THREE.Vector3();
function aim(bone, child, target) {
  bone.getWorldPosition(aO); child.getWorldPosition(aC);
  v1.subVectors(aC, aO); v2.subVectors(target, aO);
  if (v1.lengthSq() < 1e-12 || v2.lengthSq() < 1e-12) return;
  v1.normalize(); v2.normalize();
  const ang = Math.acos(clampN(v1.dot(v2), -1, 1));
  if (ang < 1e-6) return;
  aX.crossVectors(v1, v2); if (aX.lengthSq() < 1e-14) return;
  rotW(bone, aX.normalize(), ang);
}

const J0 = new THREE.Vector3(), J1 = new THREE.Vector3(), J2 = new THREE.Vector3(), J3 = new THREE.Vector3();
const N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), N3 = new THREE.Vector3(), A2 = new THREE.Vector3();
const dP = new THREE.Vector3(), uD = new THREE.Vector3(), nP = new THREE.Vector3(), pole = new THREE.Vector3(), wD = new THREE.Vector3();
const toeV = new THREE.Vector3(), toeP = new THREE.Vector3(), sc = new THREE.Vector3();
const qPl = new THREE.Quaternion(), qSw = new THREE.Quaternion(), qY = new THREE.Quaternion(), qL = new THREE.Quaternion();
const Xh = new THREE.Vector3(), Zh = new THREE.Vector3();
// Grenzen (aus der Hunde-Anatomie, in m bzw. rad)
const LAT_STEP = 0.2, LAT_MAX = 0.28;    // seitlich: ab hier tritt das Bein um / weiter hält es die Pfote nicht (statt X-Beinen)
const LAT_E = 0.15;                       // Ziel eines eigenen Schritts: höchstens so weit neben der Spur der Animation
const MIN_SEP = [0.4, 0.45];              // Mindestabstand linke/rechte Pfote quer (vorn, hinten) – nie überkreuzt
const TWIST_STEP = 0.55;                  // so weit darf sich der Körper über einer stehenden Pfote drehen, dann tritt sie um
const PSI_RATE = 0.25;                    // stehende Pfote dreht sich auf dem Ballen nur wenig mit (rad/s)
const ROLL = 0.45;                        // Abrollen: so weit hebt sich der Ballen hinter Schulter/Hüfte (rad)
const FLEX_P = [1.05, 0.35], FLEX_F = [0.95, 0.45];   // eigener Schritt: Mittelfuß / Pfote klappen (vorn, hinten)

export class Beine {
  constructor(B) {
    this.legs = LEGS.map((d) => ({
      ...d, bones: d.j.map((n) => B[n]), footB: B[d.foot], toeB: B[d.toe], st: 'frei', w: 0, pw: 0, psi: 0,
      P: new THREE.Vector3(), S: new THREE.Vector3(), E: new THREE.Vector3(), u: 0, T: 0.3, arc: 0, forced: false, prevY: 0,
      h0: 0, thr: 0.3, len: 1, qFB: new THREE.Quaternion(), toeL: new THREE.Vector3(0, 0.1, 0),
    }));
    this.ok = this.legs.every((l) => l.bones.every(Boolean) && l.footB);
    this.onStep = null;
  }

  /**
   * Aus dem Geh-Clip messen (Halter steht dabei auf 0): Bodenhöhe der Pfoten im Stand, Hubhöhe, Beinlänge und die STAND-LAGE der
   * Pfote (im Bild, in dem sie am tiefsten ist) relativ zum Körper – so liegt sie im Stand später flach wie im Clip.
   */
  measure(M, walk) {
    if (!this.ok || !walk) return;
    for (const x of [M.idle, M.walk, M.run, M.run2]) if (x) x.setEffectiveWeight(0);
    walk.setEffectiveWeight(1);
    const N = 40, ys = this.legs.map(() => []), dur = walk.getClip().duration;
    for (let i = 0; i < N; i++) {
      walk.time = i / N * dur; M.mixer.update(0); M.holder.updateMatrixWorld(true);
      this.legs.forEach((l, j) => ys[j].push(l.footB.getWorldPosition(vA).y));
    }
    this.legs.forEach((l, j) => {
      const mn = Math.min(...ys[j]), mx = Math.max(...ys[j]);
      l.h0 = mn; l.thr = Math.max(0.12, 0.3 * (mx - mn));
      walk.time = ys[j].indexOf(mn) / N * dur; M.mixer.update(0); M.holder.updateMatrixWorld(true);
      M.holder.getWorldQuaternion(qP); l.footB.getWorldQuaternion(qW);
      l.qFB.copy(qP).invert().multiply(qW);                                   // Pfote im Stand, relativ zum Körper
      if (l.toeB) l.toeL.copy(l.toeB.position);                                 // Pfote → Zehen (im Raum der Pfote)
      l.bones[0].getWorldPosition(vJ); l.len = vJ.distanceTo(l.footB.getWorldPosition(vE)) || 1;
    });
    walk.setEffectiveWeight(0);
  }

  reset() { for (const l of this.legs) { l.st = 'frei'; l.w = 0; l.pw = 0; l.slam = null; } }

  /** Stampfen: Pfote i soll beim nächsten Aufsetzen genau bei (x, z) landen (solange das Bein in der Luft ist) */
  slamAt(i, x, z) { if (this.legs[i]) this.legs[i].slam = { x, z }; }

  /**
   * Jedes Bild nach der Haltung: w = Gewicht je Bein (0 = Animation/Code bestimmt das Bein ganz, z. B. Prankenhieb, Sprung),
   * mot = Bewegung des Körpers { vx, vz (m/s), wy (Drehtempo rad/s), cx, cz (Drehpunkt) }, Lax = Querachse des Körpers (Welt)
   */
  solve(dt, w, mot, Lax) {
    if (!this.ok) return;
    // waagerechte Körperachsen: quer (links) und vorn; Blickrichtung des Körpers
    Xh.set(Lax.x, 0, Lax.z); if (Xh.lengthSq() < 1e-8) Xh.set(1, 0, 0); Xh.normalize();
    Zh.crossVectors(Xh, Y_UP).normalize();
    const psiB = Math.atan2(Zh.x, Zh.z);
    // Schrittgrenze wächst mit dem Tempo: im Galopp hält die Pfote, bis der Clip sie hebt (sonst nur noch Notschritte).
    // Beim Drehen auf der Stelle ist sie kleiner → kurze Trippelschritte statt Schleifen.
    // mot.pivot: Schwanzfeger – die Vorderpfoten sind der Drehpunkt und trippeln schnell auf der Stelle mit
    const spd = Math.hypot(mot.vx, mot.vz), turning = mot.pivot || (Math.abs(mot.wy) > 0.25 && spd < 2.5);
    const maxDev = mot.pivot ? 0.45 : (turning ? 0.55 : 0.85) + 0.15 * Math.min(spd, 14), stepT = mot.pivot ? 0.18 : turning ? 0.26 : 0.3;
    this.legs.forEach((l, i) => {
      l.w += (w[i] - l.w) * (1 - Math.exp(-(w[i] > l.w ? 22 : 10) * dt));   // schnell zupacken (Landung), weich loslassen
      const A = l.footB.getWorldPosition(vA);
      const contact = A.y < l.h0 + l.thr;
      if (l.w < 0.02) { l.st = 'frei'; l.pw = 0; l.psi = psiB; l.prevY = A.y; return; }   // Bein gehört der Animation
      // Tempo dieser Pfote, wenn sie am Körper hinge: Vorwärtstempo + Drehung um den Körpermittelpunkt
      const fvx = mot.vx + mot.wy * (A.z - mot.cz), fvz = mot.vz - mot.wy * (A.x - mot.cx);
      let T;
      // Stampfen: erst wenn das Bein wirklich herunterkommt (Gewicht steigt), kracht die Pfote genau dort hin
      if (l.slam && w[i] > 0.5) { this.plant(l, l.slam.x, l.slam.z, 1); l.slam = null; l.w = Math.max(l.w, 0.35); l.hold = 0.45; }
      l.hold = Math.max(0, (l.hold || 0) - dt);   // gestampfte Pfote bleibt kurz liegen (der Clip würde sie sonst gleich wieder anheben)
      if (l.st === 'frei') {
        T = vT.copy(A);
        if (contact) { this.plant(l, A.x, A.z, l.prevY - A.y); T.copy(l.P); }
      } else if (l.st === 'steht') {
        T = vT.copy(l.P);
        const dev = Math.hypot(A.x - l.P.x, A.z - l.P.z);
        const lat = Math.abs((l.P.x - A.x) * Xh.x + (l.P.z - A.z) * Xh.z);   // seitlich neben ihrer Spur (→ X-Beine)
        const twist = Math.abs(angD(l.psi, psiB));                           // Körper hat sich über der Pfote gedreht
        const busy = NB[i].some((n) => this.legs[n].st === 'schritt' && this.legs[n].forced);
        // viel zu weit weg (schnelles Drehen): tritt auch, wenn der Nachbar gerade tritt – sonst würde die Pfote mitgeschleift
        const must = lat > LAT_MAX * 0.85 || dev > maxDev * 1.6;
        if (l.hold > 0) { /* gestampft: liegen lassen */ }
        else if (!contact) this.startStep(l, false, 0.2);                     // der Clip hebt den Fuß: weich hinterher
        else if ((dev > maxDev || lat > LAT_STEP || twist > TWIST_STEP) && (!busy || must)) this.startStep(l, true, stepT);   // eigener Schritt
      }
      if (l.st === 'schritt') {
        l.u += dt / l.T;
        const e = smoother(l.u);   // weicher Verlauf: beginnt und endet ohne Ruck (auch die Beschleunigung ist an den Enden null)
        // eigener Schritt: dorthin, wo die Pfote in einem Moment sein wird (auch durch die Drehung) – so reicht ein Schritt länger
        if (l.forced) {
          const k = l.T * (turning ? 1.1 : 0.55); l.E.set(A.x + fvx * k, l.h0, A.z + fvz * k);
          // in der eigenen Spur bleiben: beim Drehen lag das vorausberechnete Ziel sonst quer unter dem Körper (Beine überkreuzt)
          const ex = (l.E.x - A.x) * Xh.x + (l.E.z - A.z) * Xh.z, ec = clampN(ex, -LAT_E, LAT_E);
          l.E.x -= Xh.x * (ex - ec); l.E.z -= Xh.z * (ex - ec);
        } else l.E.copy(A);
        const sa = Math.sin(Math.PI * Math.min(1, l.u));
        T = vT.copy(l.S).lerp(l.E, e); T.y += l.arc * sa * sa * 1.3;   // Pfote hebt sich sanft an und setzt sanft auf
        if (l.u >= 1) {
          if (l.forced || contact) { this.plant(l, l.E.x, l.E.z, l.forced ? 1 : 0.5); T.copy(l.P); }
          else { l.st = 'frei'; T.copy(A); }
        }
      }
      l.prevY = A.y;
      // Pfote flach (pw): steht sie, liegt sie flach auf; sonst folgt sie dem Bein. Kurz VOR dem Aufsetzen richtet sie sich schon
      // flach aus (wie beim echten Hund – sonst drehte sie sich erst am Boden und die Zehen wischten). Auf dem Ballen dreht sie
      // sich nur langsam mit.
      const pwT = l.st === 'steht' ? 1 : l.st === 'schritt' ? 0.85 * sm((l.u - 0.55) / 0.4)
        : 0.8 * sm((l.h0 + 1.6 * l.thr - A.y) / (0.6 * l.thr));
      l.pw += (pwT - l.pw) * (1 - Math.exp(-(pwT > l.pw ? 25 : 14) * dt));
      if (l.st === 'steht') l.psi += clampN(angD(l.psi, psiB), -PSI_RATE * dt, PSI_RATE * dt); else l.psi = psiB;
      // nie weiter als LAT_MAX neben ihre Spur (bis dahin hat sie längst umgetreten) → das Bein bleibt eine gerade Säule
      const dx = (T.x - A.x) * Xh.x + (T.z - A.z) * Xh.z, cx = clampN(dx, -LAT_MAX, LAT_MAX);
      if (dx !== cx) { T.x -= Xh.x * (dx - cx); T.z -= Xh.z * (dx - cx); }
      // linke und rechte Pfote nie übereinander: Mindestabstand quer zur anderen Pfote desselben Paars (gilt auch fürs Schrittziel)
      const o = this.legs[i ^ 1], side = i % 2 === 0 ? 1 : -1;   // 0/2 = links (+X), 1/3 = rechts
      if (o.w > 0.02) {
        o.footB.getWorldPosition(vE);
        const sep = side * ((T.x - vE.x) * Xh.x + (T.z - vE.z) * Xh.z), need = l.front ? MIN_SEP[0] : MIN_SEP[1];
        if (sep < need) { const k = side * (need - sep); T.x += Xh.x * k; T.z += Xh.z * k; if (l.st === 'schritt') { l.E.x += Xh.x * k; l.E.z += Xh.z * k; } }
      }
      // Ziel mit dem Gewicht zwischen Animation und festem Punkt mischen; nie unter den Boden (beim Ducken sank die Pfote sonst ein)
      T.lerp(A, 1 - l.w);
      if (T.y < l.h0) T.y = l.h0;
      this.ik(l, T, Lax);
      l.err = l.footB.getWorldPosition(vE).distanceTo(T);   // wie weit die IK das Ziel verfehlt (zum Prüfen)
    });
  }

  plant(l, x, z, hard) {
    const was = l.st;
    l.st = 'steht'; l.P.set(x, l.h0, z);
    // Tritt: nur wenn der Fuß wirklich heruntergekommen ist (aus der Luft oder aus einem Schritt)
    if (this.onStep && (was === 'schritt' || hard > 0.02)) this.onStep(x, z, l.front ? 1 : 0.8);
  }
  startStep(l, forced, T) {
    l.st = 'schritt'; l.forced = forced; l.u = 0; l.T = T; l.S.copy(l.P); l.arc = forced ? 0.55 : 0;
  }

  /**
   * Bein-Löser nach Hunde-Anatomie: Pfote (Gelenk) ans Ziel T, Bein als gerade Säule, Gelenke knicken nur in ihre Richtung.
   * Lax = Querachse des Körpers (Welt, mit Neigung).
   */
  ik(l, T, Lax) {
    const [b0, b1, b2] = l.bones, foot = l.footB, f = l.front ? 0 : 1;
    const q0 = [b0.quaternion.clone(), b1.quaternion.clone(), b2.quaternion.clone(), foot.quaternion.clone()];   // Animation
    b0.getWorldPosition(J0); b1.getWorldPosition(J1); b2.getWorldPosition(J2); foot.getWorldPosition(J3);
    const L0 = J0.distanceTo(J1), L1 = J1.distanceTo(J2), L2 = J2.distanceTo(J3);
    if (L0 < 1e-5 || L1 < 1e-5 || L2 < 1e-5) return;
    // eigener Schritt (Trippeln, Umtreten): Mittelfuß und Pfote klappen im Schwung wie beim echten Hund
    const s = l.st === 'schritt' && l.forced ? Math.sin(Math.PI * Math.min(1, l.u)) : 0;
    // ---- Pfote im Stand: flach wie im Geh-Clip, Zehen in Laufrichtung (psi); hinter Schulter/Hüfte rollt sie über die Zehen ab ----
    qY.setFromAxisAngle(Y_UP, l.psi); qPl.copy(qY).multiply(l.qFB);
    if (l.pw > 1e-3) {
      const off = ((T.x - J0.x) * Zh.x + (T.z - J0.z) * Zh.z) / l.len;   // < 0: Pfote hinter Schulter/Hüfte
      const lam = ROLL * sm((-off - 0.12) / 0.3) * l.pw;
      if (lam > 1e-3) {
        foot.getWorldScale(sc);
        toeV.copy(l.toeL).multiply(sc).applyQuaternion(qPl); toeP.copy(T).add(toeV);   // Zehen bleiben liegen …
        qL.setFromAxisAngle(Xh, lam);
        T.copy(toeP).add(toeV.negate().applyQuaternion(qL));                             // … der Ballen hebt sich
        qPl.premultiply(qL);
      }
    }
    // ---- Mittelfuß: Neigung aus der Animation, aber in der Beinebene (nicht seitlich verdreht) ----
    dP.subVectors(J3, J2); dP.addScaledVector(Xh, -dP.dot(Xh)).normalize();
    if (s) dP.applyAxisAngle(Xh, FLEX_P[f] * s);                     // vorn: Handgelenk klappt nach hinten, hinten: Sprunggelenk beugt
    A2.copy(T).addScaledVector(dP, -L2);                             // wo das Hand-/Sprunggelenk sein muss
    // reicht das Bein nicht: Mittelfuß um die Pfote Richtung Schulter/Hüfte kippen (Ballen hebt sich), höchstens ~0,6 rad
    const maxR = (L0 + L1) * 0.995;
    if (A2.distanceTo(J0) > maxR) {
      wD.subVectors(T, J0).normalize();
      for (let k = 1; k <= 6 && A2.distanceTo(J0) > maxR; k++) {
        vC.copy(dP).lerp(wD, k / 6 * 0.55).normalize(); A2.copy(T).addScaledVector(vC, -L2);
        if (k === 6 || A2.distanceTo(J0) <= maxR) dP.copy(vC);
      }
    }
    // ---- Zwei-Knochen-Dreieck in der Beinebene: Ebene enthält Schulter/Hüfte und Knöchel und steht möglichst quer zum Körper ----
    let d = A2.distanceTo(J0);
    uD.subVectors(A2, J0).divideScalar(Math.max(d, 1e-6));
    nP.copy(Lax).addScaledVector(uD, -Lax.dot(uD)); if (nP.lengthSq() < 1e-8) nP.copy(Xh); nP.normalize();
    // Mittelfuß in dieselbe Ebene legen: neigt sich die Säule leicht, neigt er sich mit (sonst knickte das Sprunggelenk seitlich)
    dP.addScaledVector(nP, -dP.dot(nP)).normalize();
    A2.copy(T).addScaledVector(dP, -L2); d = A2.distanceTo(J0);
    uD.subVectors(A2, J0).divideScalar(Math.max(d, 1e-6));
    nP.copy(Lax).addScaledVector(uD, -Lax.dot(uD)); if (nP.lengthSq() < 1e-8) nP.copy(Xh); nP.normalize();
    // Knick-Richtung aus der Animation (Ellbogen nach hinten, Knie nach vorn), in die Ebene gelegt
    pole.subVectors(J1, J0); pole.addScaledVector(uD, -pole.dot(uD)); pole.addScaledVector(nP, -pole.dot(nP));
    if (pole.lengthSq() < 1e-10) { pole.copy(Zh).multiplyScalar(l.front ? -1 : 1); pole.addScaledVector(uD, -pole.dot(uD)); pole.addScaledVector(nP, -pole.dot(nP)); }
    pole.normalize();
    const dd = clampN(d, Math.abs(L0 - L1) + 1e-4, L0 + L1 - 1e-4);
    const cosA = clampN((L0 * L0 + dd * dd - L1 * L1) / (2 * L0 * dd), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    N1.copy(J0).addScaledVector(uD, cosA * L0).addScaledVector(pole, sinA * L0);
    N2.copy(J0).addScaledVector(uD, dd);
    N3.copy(N2).addScaledVector(dP, L2);
    aim(b0, b1, N1); aim(b1, b2, N2); aim(b2, foot, N3);
    // ---- Pfote: im Schwung wie in der Animation (vorn klappt sie beim eigenen Schritt nach hinten, hinten hängen die Zehen),
    //      im Stand flach (qPl); dazwischen weich ----
    foot.getWorldQuaternion(qSw);
    if (s) { qL.setFromAxisAngle(Xh, FLEX_F[f] * s); qSw.premultiply(qL); }
    qSw.slerp(qPl, l.pw);
    foot.parent.getWorldQuaternion(qP); foot.quaternion.copy(qP.invert().multiply(qSw)).normalize();
    // Gewicht: zwischen Animation und Lösung (w < 1 beim Übergeben an die Animation, z. B. Pranke/Sprung)
    if (l.w < 0.999) [b0, b1, b2, foot].forEach((b, j) => { qR.copy(b.quaternion); b.quaternion.slerpQuaternions(q0[j], qR, l.w); });
    b0.updateMatrixWorld(true);
  }
}

/**
 * Zielen (Angriffe): dreht eine Knochenkette so, dass ein Punkt an ihrem Ende (eff) zum Ziel T wandert – z. B. die Schnauze zum Magier
 * (Kopf, Hals) oder die Pfote durch den Magier hindurch (Schulter, Ellbogen, Handgelenk). chain = vom Ende zur Wurzel, lim = höchster
 * Winkel je Gelenk (rad, gegenüber der Animation), w = Gewicht 0 … 1 (0 = reine Animation). Gibt den Restabstand zurück.
 */
const vS = new THREE.Vector3(), vG = new THREE.Vector3(), qD = new THREE.Quaternion(), qI = new THREE.Quaternion();
/**
 * mem (optional) = Gedächtnis je Gelenk: das Ergebnis wird über die Zeit weich nachgeführt (Zeitkonstante 1/rate). CCD rechnet jedes Bild
 * neu von der Animation aus – stößt ein Gelenk an seine Grenze, kann die Lösung von einem Bild zum nächsten umspringen (Hals ruckt).
 * Mit Gedächtnis gleitet sie hinüber; ist das Zielen vorbei (w = 0), blendet die Korrektur sauber aus.
 */
export function ccdAim(chain, eff, T, w, lim, iters = 4, mem = null, dt = 0, rate = 25) {
  const k = mem && dt > 0 ? 1 - Math.exp(-rate * dt) : 1;
  if (w <= 0.001) {                                             // nichts zu zielen: gemerkte Korrektur weich zurück auf null
    if (mem && mem.length) {
      for (let j = chain.length - 1; j >= 0; j--) { const b = chain[j]; if (!b || !mem[j]) continue; clean(mem[j].slerp(qI, k)); b.quaternion.multiply(mem[j]).normalize(); }
      const root = chain[chain.length - 1]; if (root) root.updateMatrixWorld(true);
    }
    return Infinity;
  }
  const q0 = mem ? chain.map((b) => (b ? b.quaternion.clone() : null)) : null;
  eff(vS); vG.copy(vS).lerp(T, Math.min(1, w));                 // Ziel mit Gewicht: ein Stück vom Ist-Punkt Richtung T
  const acc = chain.map(() => 0);
  for (let it = 0; it < iters; it++) {
    for (let j = 0; j < chain.length; j++) {
      const b = chain[j]; if (!b) continue;
      b.getWorldPosition(vJ); eff(vE);
      v1.subVectors(vE, vJ); v2.subVectors(vG, vJ);
      if (v1.lengthSq() < 1e-6 || v2.lengthSq() < 1e-6) continue;
      v1.normalize(); v2.normalize(); vL.crossVectors(v1, v2); const s = vL.length();
      if (s < 1e-5) continue;
      let a = Math.atan2(s, v1.dot(v2)); a = Math.min(a, 0.35, lim[j] - acc[j]);
      if (a <= 0) continue;
      acc[j] += a; rotW(b, vL.divideScalar(s), a);
    }
  }
  if (mem) {   // Korrektur je Gelenk (im eigenen Raum) weich nachführen statt hart übernehmen
    for (let j = chain.length - 1; j >= 0; j--) {
      const b = chain[j]; if (!b) continue;
      clean(qD.copy(q0[j]).invert().multiply(b.quaternion));
      if (!mem[j]) mem[j] = qD.clone(); else clean(mem[j].slerp(qD, k));
      b.quaternion.copy(q0[j]).multiply(mem[j]).normalize();
    }
    const root = chain[chain.length - 1]; if (root) root.updateMatrixWorld(true);
  }
  return eff(vE).distanceTo(vG);
}
