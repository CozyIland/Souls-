// Boss-Körperteile als Kapseln an den Knochen – für Treffer in beide Richtungen:
// - HURT (wo der Magier den Boss trifft): Kopf, Hals, Rumpf, je Bein drei Abschnitte, Schwanz.
// - Angriffe (wo der Boss den Magier trifft): Schnauze beim Biss, Pfote beim Prankenhieb, beide Vorderpfoten beim Stampfen,
//   Kopf/Hals beim Ansturm, Schwanz und Hinterläufe bei der Drehung. (Sprung und Heulen bleiben Kreise am Boden.)
// Dicke jedes Teils wird beim Laden aus dem Modell gemessen: alle Punkte der Haut, die vor allem an diesem Knochen hängen,
// ihr Abstand zur Knochenlinie (70 %-Wert). Schnauzenspitze = Hautpunkt am Kopf, der am weitesten vom Hals weg ist.
// Der Magier ist eine stehende Kapsel (0,15 … 1,7 m hoch, Radius 0,4 m). Schnelle Angriffe werden von Bild zu Bild
// „durchgezogen“ (die Form vom letzten und vom jetzigen Bild verbunden), damit nichts durch den Magier hindurchspringt.
import * as THREE from 'three';

// [Name, Knochen A, Knochen B (oder '@schnauze'), Knochen für die Dicke]
const DEF = [
  ['kopf', 'head', '@schnauze', ['head', 'jaw_01', 'jaw', 'head_01', 'head_02', 'head_03', 'head_04']],
  ['hals', 'neck_01', 'head', ['neck_01', 'neck1']],
  ['rumpf', 'tail2', 'chest', ['root', 'spine_08', 'spine_09', 'hips', 'spine1', 'spine2', 'spine_04', 'spine_05', 'chest', 'spine_10', 'spine_11', 'spine_12', 'spine_13']],
  ...['L', 'R'].flatMap((x) => [
    ['v' + x.toLowerCase() + 'o', 'frontUpr' + x, 'frontLwr' + x, ['frontLeg' + x + '_01', 'frontUpr' + x]],
    ['v' + x.toLowerCase() + 'm', 'frontLwr' + x, 'frontHorselink' + x, ['frontLwr' + x]],
    ['v' + x.toLowerCase() + 'u', 'frontHorselink' + x, 'frontToe' + x, ['frontHorselink' + x, 'frontFoot' + x, 'frontToe' + x]],
    ['h' + x.toLowerCase() + 'o', 'rearLeg' + x + '_01', 'rearLwr' + x, ['rearLeg' + x + '_01']],
    ['h' + x.toLowerCase() + 'm', 'rearLwr' + x, 'rearHorselink' + x, ['rearLwr' + x]],
    ['h' + x.toLowerCase() + 'u', 'rearHorselink' + x, 'rearToe' + x, ['rearHorselink' + x, 'rearFoot' + x, 'rearToe' + x]],
  ]),
  ['schwanz', 'tail2', 'tail_05', ['tail3', 'tail_03', 'tail4', 'tail_05', 'tail_06']],
];
export const HURT_NAMES = DEF.map((d) => d[0]);

const V = () => new THREE.Vector3();
const t1 = V(), t2 = V(), t3 = V(), t4 = V(), d1 = V(), d2 = V(), rr = V();
/** kürzester Abstand² zweier Strecken p1–q1 und p2–q2; schreibt die nächsten Punkte nach c1/c2 */
export function segSeg(p1, q1, p2, q2, c1, c2) {
  d1.subVectors(q1, p1); d2.subVectors(q2, p2); rr.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(rr), E = 1e-9;
  let s = 0, t = 0;
  if (a <= E && e <= E) { s = 0; t = 0; }
  else if (a <= E) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(rr);
    if (e <= E) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s); c2.copy(p2).addScaledVector(d2, t);
  return c1.distanceToSquared(c2);
}

export class Teile {
  constructor(model, B) {
    this.B = B; this.ok = false;
    this.hurt = DEF.filter((d) => B[d[1]] && (d[2] === '@schnauze' || B[d[2]])).map((d) => ({ n: d[0], A: B[d[1]], Bn: d[2], set: d[3], r: 0.5, a: V(), b: V() }));
    this.tip = V();      // Schnauzenspitze im Raum des Kopf-Knochens
    try { this.fit(model); this.ok = true; } catch (e) { console.warn('Boss-Teile nicht vermessen:', e); }
    this.by = Object.fromEntries(this.hurt.map((h) => [h.n, h]));
  }

  /** Dicke und Schnauze aus der Haut messen (einmal beim Laden, in der Grundhaltung) */
  fit(model) {
    const B = this.B, meshes = []; model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    model.updateMatrixWorld(true);
    const groups = new Map(); // Knochenname → Hautpunkte (Welt)
    const v = V();
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, bones = m.skeleton.bones;
      const step = Math.max(1, Math.floor(pos.count / 12000));   // höchstens ~12.000 Punkte – reicht zum Messen
      for (let i = 0; i < pos.count; i += step) {
        let best = 0, bi = 0; for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > best) { best = w; bi = si.getComponent(i, c); } }
        const name = bones[bi] && bones[bi].name; if (!name) continue;
        v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld);
        if (!groups.has(name)) groups.set(name, []); groups.get(name).push(v.clone());
      }
    }
    // Schnauze: Kopf-Punkt am weitesten vom Hals
    const neck = B.neck1.getWorldPosition(V()); let far = 0, tipW = null;
    for (const n of ['head', 'head_01', 'head_02', 'head_03', 'head_04', 'jaw', 'jaw_01']) for (const p of groups.get(n) || []) { const d = p.distanceTo(neck); if (d > far) { far = d; tipW = p; } }
    if (tipW) this.tip.copy(B.head.worldToLocal(tipW.clone()));
    // Dicke je Teil
    this.update();
    for (const h of this.hurt) {
      const pts = h.set.flatMap((n) => groups.get(n) || []);
      if (pts.length < 8) continue;
      const ds = pts.map((p) => Math.sqrt(segSeg(h.a, h.b, p, p, t1, t2))).sort((x, y) => x - y);
      h.r = Math.min(2.5, Math.max(0.15, ds[Math.floor(ds.length * 0.7)]));
    }
  }

  /** Lage aller Kapseln aus den Knochen (jedes Bild nach der Haltung) */
  update(f = 1) {
    for (const h of this.hurt) {
      h.A.getWorldPosition(h.a);
      if (h.Bn === '@schnauze') this.snout(1, h.b); else this.B[h.Bn].getWorldPosition(h.b);
    }
    this.k = f;
  }
  /** Punkt auf der Linie Kopf → Schnauzenspitze (k = 1: Spitze) */
  snout(k, out) { return this.B.head.localToWorld(out.copy(this.tip).multiplyScalar(k)); }

  /** nächster Körperpunkt zu p und Abstand zur Haut (negativ = drin); dicke = Faktor aus dem Testmodus */
  nearest(p, dicke = 1) {
    let best = Infinity, bh = null;
    for (const h of this.hurt) { const d = Math.sqrt(segSeg(h.a, h.b, p, p, t1, t2)) - h.r * dicke; if (d < best) { best = d; bh = h; } }
    return { s: best, h: bh };
  }

  /** Formen eines Angriffs (Kapseln {a, b, r}); hb = Faktoren aus dem Testmodus, side = Pranke links (+1) / rechts (−1) */
  attack(k, hb, side = 1) {
    const by = this.by, cap = (h, r) => ({ a: h.a.clone(), b: h.b.clone(), r });
    const out = [];
    if (k === 'bite') { const c = this.snout(hb.bite.vor, V()); out.push({ a: c, b: c.clone(), r: by.kopf.r * 0.9 * hb.bite.r }); }
    if (k === 'swipe') { const x = side > 0 ? 'l' : 'r'; out.push(cap(by['v' + x + 'u'], by['v' + x + 'u'].r * 1.8 * hb.swipe.r), cap(by['v' + x + 'm'], by['v' + x + 'm'].r * 1.2 * hb.swipe.r)); }
    if (k === 'stomp') for (const x of ['l', 'r']) out.push(cap(by['v' + x + 'u'], by['v' + x + 'u'].r * 2 * hb.stomp.r));
    // Ansturm: gesenkter Kopf, Hals und die Vorderbeine (wer davor steht, wird überrannt)
    if (k === 'charge') {
      out.push(cap(by.kopf, by.kopf.r * 1.2 * hb.charge.r), cap(by.hals, by.hals.r * 1.1 * hb.charge.r));
      for (const x of ['l', 'r']) out.push(cap(by['v' + x + 'm'], by['v' + x + 'm'].r * 1.3 * hb.charge.r), cap(by['v' + x + 'u'], by['v' + x + 'u'].r * 1.3 * hb.charge.r));
    }
    // Schwanzfeger: Schwanz und das ganze herumgeworfene Hinterteil (Unter- und Mittelläufe)
    if (k === 'spin') out.push(cap(by.schwanz, by.schwanz.r * 1.8 * hb.spin.r), cap(by.hlu, by.hlu.r * 1.5 * hb.spin.r), cap(by.hru, by.hru.r * 1.5 * hb.spin.r),
      cap(by.hlm, by.hlm.r * 1.4 * hb.spin.r), cap(by.hrm, by.hrm.r * 1.4 * hb.spin.r));
    return out;
  }
}

/** Trifft eine Form (auch durchgezogen vom letzten Bild prev) den Magier (stehende Kapsel an pl)? Gibt den Trefferpunkt zurück. */
export function hitsPlayer(shape, prev, px, pz) {
  const pa = t3.set(px, 0.15, pz), pb = t4.set(px, 1.7, pz), R = shape.r + 0.4;
  const test = (a, b) => segSeg(a, b, pa, pb, t1, t2) < R * R;
  if (test(shape.a, shape.b)) return t1.clone();
  if (prev) {   // zwischen den Bildern: Anfang und Ende der Form jeweils vom alten zum neuen Punkt
    if (test(prev.a, shape.a) || test(prev.b, shape.b)) return t1.clone();
    const ma = prev.a.clone().lerp(shape.a, 0.5), mb = prev.b.clone().lerp(shape.b, 0.5);
    if (test(ma, mb)) return t1.clone();
  }
  return null;
}
