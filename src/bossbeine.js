// Boss-Beine: Pfoten stehen fest auf dem Boden (Fuß-IK) und machen echte Schritte – gegen das Rutschen über den Boden.
// Ablauf je Bein und Bild (nach Clip und allen Haltungen aus dem Code):
//  1. A = wo die Animation die Pfote hinstellen will.
//  2. Zustand: 'frei' (folgt A, z. B. Schwungphase des Clips) → setzt auf, sobald A den Boden berührt → 'steht' (Punkt P bleibt fest in der Welt)
//     → hebt ab, wenn der Clip den Fuß hebt, oder macht einen eigenen SCHRITT, wenn sich der Körper zu weit von P entfernt
//     (beim Drehen auf der Stelle, Vorstoß im Angriff, Ausrutschen nach dem Ansturm) → Schritt im Bogen zu A, dann wieder 'steht'.
//  3. IK: Schulter/Hüfte, Ellbogen/Knie und Handgelenk/Sprunggelenk drehen sich in der Beinebene (CCD), bis die Pfote am Ziel ist;
//     ein Rest (seitlich) wird an der Schulter/Hüfte ausgeglichen. Die Pfote selbst behält ihre Lage aus der Animation.
// Diagonale Schritte: ein Bein startet einen eigenen Schritt nur, wenn weder sein Nachbar vorn/hinten noch der auf der anderen Seite schreitet.
// Beim Aufsetzen: onStep(x, z, Stärke) → Staub, dumpfer Tritt, leichtes Beben.
import * as THREE from 'three';

const LEGS = [
  { k: 'VL', j: ['frontUprL', 'frontLwrL', 'frontHorselinkL'], foot: 'frontFootL', front: true },
  { k: 'VR', j: ['frontUprR', 'frontLwrR', 'frontHorselinkR'], foot: 'frontFootR', front: true },
  { k: 'HL', j: ['rearLegL_01', 'rearLwrL', 'rearHorselinkL'], foot: 'rearFootL', front: false },
  { k: 'HR', j: ['rearLegR_01', 'rearLwrR', 'rearHorselinkR'], foot: 'rearFootR', front: false },
];
export const LEG_BONES = LEGS.flatMap((l) => [...l.j, l.foot]);
// Nachbarn: 0↔1 (vorn quer), 2↔3 (hinten quer), 0↔2, 1↔3 (gleiche Seite)
const NB = [[1, 2], [0, 3], [3, 0], [2, 1]];

const vA = new THREE.Vector3(), vE = new THREE.Vector3(), vJ = new THREE.Vector3(), vT = new THREE.Vector3();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), vC = new THREE.Vector3(), vL = new THREE.Vector3();
const qP = new THREE.Quaternion(), qR = new THREE.Quaternion(), qF = new THREE.Quaternion(), qW = new THREE.Quaternion();
const Y_UP = new THREE.Vector3(0, 1, 0), QI = new THREE.Quaternion(), RATE = 12;   // RATE: Ausblenden der Bein-IK, wenn die Animation übernimmt (1/s)
const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const smoother = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * c * (c * (6 * c - 15) + 10); };

/** Knochen um eine Weltachse drehen (Eltern-Weltmatrix muss aktuell sein) */
function rotW(bone, axisW, ang) {
  if (!bone || !Number.isFinite(ang) || Math.abs(ang) < 1e-6) return;
  bone.parent.getWorldQuaternion(qP);
  qW.copy(qP).multiply(bone.quaternion);
  qR.setFromAxisAngle(axisW, ang).multiply(qW);
  bone.quaternion.copy(qP.invert().multiply(qR));
  bone.updateMatrixWorld(true);
}

export class Beine {
  constructor(B) {
    this.legs = LEGS.map((d) => ({
      ...d, bones: d.j.map((n) => B[n]), footB: B[d.foot], st: 'frei', w: 0,
      P: new THREE.Vector3(), S: new THREE.Vector3(), E: new THREE.Vector3(), u: 0, T: 0.3, arc: 0, forced: false, prevY: 0,
      h0: 0, thr: 0.3, len: 1,
    }));
    this.ok = this.legs.every((l) => l.bones.every(Boolean) && l.footB);
    this.onStep = null;
  }

  /** Bodenhöhe der Pfoten im Stand und Hubhöhe aus dem Geh-Clip messen (Halter steht dabei auf 0) */
  measure(M, walk) {
    if (!this.ok || !walk) return;
    for (const x of [M.idle, M.walk, M.run, M.run2]) if (x) x.setEffectiveWeight(0);
    walk.setEffectiveWeight(1);
    const N = 40, ys = this.legs.map(() => []);
    for (let i = 0; i < N; i++) {
      walk.time = i / N * walk.getClip().duration; M.mixer.update(0); M.holder.updateMatrixWorld(true);
      this.legs.forEach((l, j) => ys[j].push(l.footB.getWorldPosition(vA).y));
    }
    walk.setEffectiveWeight(0);
    this.legs.forEach((l, j) => {
      const mn = Math.min(...ys[j]), mx = Math.max(...ys[j]);
      l.h0 = mn; l.thr = Math.max(0.12, 0.3 * (mx - mn));
      // Beinlänge (Schulter → Pfote) für die seitliche Korrektur
      l.bones[0].getWorldPosition(vJ); l.len = vJ.distanceTo(l.footB.getWorldPosition(vE)) || 1;
    });
  }

  reset() { for (const l of this.legs) { l.st = 'frei'; l.w = 0; l.slam = null; l.mem = null; l.acc = [0, 0, 0]; l.lat = 0; } }

  /** Stampfen: Pfote i soll beim nächsten Aufsetzen genau bei (x, z) landen (solange das Bein in der Luft ist) */
  slamAt(i, x, z) { if (this.legs[i]) this.legs[i].slam = { x, z }; }

  /**
   * Jedes Bild nach der Haltung: w = Gewicht je Bein (0 = Animation/Code bestimmt das Bein ganz, z. B. Prankenhieb, Sprung),
   * mot = Bewegung des Körpers { vx, vz (m/s), wy (Drehtempo rad/s), cx, cz (Drehpunkt) }, Lax = Querachse des Körpers (Welt)
   */
  solve(dt, w, mot, Lax) {
    if (!this.ok) return;
    // Schrittgrenze wächst mit dem Tempo: im Galopp hält die Pfote, bis der Clip sie hebt (sonst nur noch Notschritte).
    // Beim Drehen auf der Stelle ist sie kleiner → kurze Trippelschritte statt Schleifen.
    // mot.pivot: Schwanzfeger – die Vorderpfoten sind der Drehpunkt und trippeln schnell auf der Stelle mit
    const spd = Math.hypot(mot.vx, mot.vz), turning = mot.pivot || (Math.abs(mot.wy) > 0.25 && spd < 2.5);
    const maxDev = mot.pivot ? 0.45 : (turning ? 0.55 : 0.85) + 0.15 * Math.min(spd, 14), stepT = mot.pivot ? 0.18 : turning ? 0.26 : 0.3;
    this.legs.forEach((l, i) => {
      l.w += (w[i] - l.w) * (1 - Math.exp(-(w[i] > l.w ? 22 : 10) * dt));   // schnell zupacken (Landung), weich loslassen
      const A = l.footB.getWorldPosition(vA);
      const contact = A.y < l.h0 + l.thr;
      if (l.w < 0.02) {   // Bein gehört der Animation: gemerkte IK-Korrektur weich ausblenden (kein Sprung beim Übergeben)
        l.st = 'frei'; l.prevY = A.y;
        if (l.mem) {
          const k = 1 - Math.exp(-RATE * dt);
          l.bones.forEach((b, j) => { l.mem[j].slerp(QI, k); b.quaternion.multiply(l.mem[j]); }); l.bones[0].updateMatrixWorld(true);
          l.acc = l.acc.map((a) => a * (1 - k)); l.lat = (l.lat || 0) * (1 - k);
        }
        return;
      }
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
        const busy = NB[i].some((n) => this.legs[n].st === 'schritt' && this.legs[n].forced);
        if (l.hold > 0) { /* gestampft: liegen lassen */ }
        else if (!contact) this.startStep(l, false, 0.2);                     // der Clip hebt den Fuß: weich hinterher
        else if (dev > maxDev && !busy) this.startStep(l, true, stepT);       // Körper hat sich entfernt: eigener Schritt
      }
      if (l.st === 'schritt') {
        l.u += dt / l.T;
        const e = smoother(l.u);   // weicher Verlauf: beginnt und endet ohne Ruck (auch die Beschleunigung ist an den Enden null)
        // eigener Schritt: dorthin, wo die Pfote in einem Moment sein wird (auch durch die Drehung) – so reicht ein Schritt länger
        if (l.forced) { const k = l.T * (turning ? 1.1 : 0.55); l.E.set(A.x + fvx * k, l.h0, A.z + fvz * k); } else l.E.copy(A);
        const sa = Math.sin(Math.PI * Math.min(1, l.u));
        T = vT.copy(l.S).lerp(l.E, e); T.y += l.arc * sa * sa * 1.3;   // Pfote hebt sich sanft an und setzt sanft auf
        if (l.u >= 1) {
          if (l.forced || contact) { this.plant(l, l.E.x, l.E.z, l.forced ? 1 : 0.5); T.copy(l.P); }
          else { l.st = 'frei'; T.copy(A); }
        }
      }
      l.prevY = A.y;
      // Ziel mit dem Gewicht zwischen Animation und festem Punkt mischen; nie unter den Boden (beim Ducken sank die Pfote sonst ein)
      T.lerp(A, 1 - l.w);
      if (T.y < l.h0) T.y = l.h0;
      this.ik(l, T, Lax, dt);
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

  /** Bein in seiner Ebene beugen (CCD um die Querachse), bis die Pfote am Ziel T ist; Pfote behält ihre Weltlage */
  ik(l, T, Lax, dt = 0) {
    const foot = l.footB; foot.getWorldQuaternion(qF);
    const q0 = l.bones.map((b) => b.quaternion.clone());             // Haltung aus der Animation
    const lim = [1.0, 1.3, 1.3];   // höchstens so weit pro Gelenk gegenüber der Animation (kein Umknicken)
    // Warmstart: mit der Lösung vom letzten Bild beginnen (statt jedes Mal bei der Animation). CCD bleibt so in derselben Stellung
    // und kann nicht von einem Bild zum nächsten in eine andere Lösung umspringen (das Bein ruckte bis ~11.000 rad/s²) –
    // und erreicht das Ziel trotzdem in jedem Bild ganz (kein Nachziehen, die Pfote bleibt stehen).
    const acc = l.mem ? l.acc.slice() : [0, 0, 0];
    if (l.mem) { l.bones.forEach((b, j) => b.quaternion.multiply(l.mem[j])); l.bones[0].updateMatrixWorld(true); }
    for (let it = 0; it < 5; it++) {
      for (let j = 2; j >= 0; j--) {
        const b = l.bones[j];
        b.getWorldPosition(vJ); foot.getWorldPosition(vE);
        v1.subVectors(vE, vJ); v2.subVectors(T, vJ);
        v1.addScaledVector(Lax, -Lax.dot(v1)); v2.addScaledVector(Lax, -Lax.dot(v2));
        if (v1.lengthSq() < 1e-6 || v2.lengthSq() < 1e-6) continue;
        let a = Math.atan2(vC.crossVectors(v1, v2).dot(Lax), v1.dot(v2));
        a = Math.max(-0.35, Math.min(0.35, a));
        a = Math.max(-lim[j] - acc[j], Math.min(lim[j] - acc[j], a)); acc[j] += a;   // nicht überbiegen (kein Knick nach hinten)
        rotW(b, Lax, a);
      }
    }
    // seitlicher Rest an Schulter/Hüfte: NUR um die Längsachse des Körpers (früher drehte sich das ganze Bein zum Ziel –
    // war das Bein länger als der Abstand, schoss die Pfote übers Ziel hinaus in den Boden)
    const up = l.bones[0]; up.getWorldPosition(vJ); foot.getWorldPosition(vE);
    vL.crossVectors(Lax, Y_UP).normalize();                     // Längsachse (vorn)
    v1.subVectors(vE, vJ); v2.subVectors(T, vJ);
    v1.addScaledVector(vL, -vL.dot(v1)); v2.addScaledVector(vL, -vL.dot(v2));
    if (v1.lengthSq() > 1e-6 && v2.lengthSq() > 1e-6) {
      const a = Math.max(-0.45, Math.min(0.45, Math.atan2(vC.crossVectors(v1, v2).dot(vL), v1.dot(v2))));
      const lat = l.lat || 0, aa = Math.max(-0.6, Math.min(0.6, lat + a)) - lat;   // insgesamt höchstens ±0,6 rad seitlich
      rotW(up, vL, aa); l.lat = lat + aa;
    }
    // Lösung (Korrektur je Gelenk gegenüber der Animation) für den Warmstart im nächsten Bild merken
    if (!l.mem) l.mem = l.bones.map(() => new THREE.Quaternion());
    l.bones.forEach((b, j) => l.mem[j].copy(q0[j]).invert().multiply(b.quaternion));
    l.acc = acc;
    // Pfote flach lassen: Weltlage wie vor der IK
    foot.parent.getWorldQuaternion(qP); foot.quaternion.copy(qP.invert().multiply(qF)); foot.updateMatrixWorld(true);
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
      for (let j = chain.length - 1; j >= 0; j--) { const b = chain[j]; if (!b || !mem[j]) continue; mem[j].slerp(qI, k); b.quaternion.multiply(mem[j]); }
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
      qD.copy(q0[j]).invert().multiply(b.quaternion);
      if (!mem[j]) mem[j] = qD.clone(); else mem[j].slerp(qD, k);
      b.quaternion.copy(q0[j]).multiply(mem[j]);
    }
    const root = chain[chain.length - 1]; if (root) root.updateMatrixWorld(true);
  }
  return eff(vE).distanceTo(vG);
}
