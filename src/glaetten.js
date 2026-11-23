// Glätten von groben Meshy-Figuren (einmal beim Laden).
// Das Boss-Modell hat nur ~3000 Dreiecke und harte Kanten zwischen fast allen Flächen (Normalen im Mittel 86° auseinander) – er wirkte
// eckig und facettiert. glaetten():
//  1. UNTERTEILEN (Loop-artig): jedes Dreieck → vier; neue Kantenpunkte und alte Punkte rücken zur glatten Form (Loop-Regeln,
//     berechnet über die an der Lage verschweißte Oberfläche, damit Bildnähte nicht aufreißen). `kraft` mischt zwischen nur
//     Unterteilen (0) und vollem Loop (1) – voll würde Zähne und Stacheln zu sehr abrunden.
//     Bildkoordinaten, Knochen-Gewichte (bis 4 je Punkt) und alle übrigen Werte werden mitgeteilt.
//  2. WEICHE NORMALEN: je Lage gemittelt (über Bildnähte hinweg) – keine Facetten mehr im Licht; schärfer als `knick` (rad) bleibt hart.
import * as THREE from 'three';

const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;

/** Eine Stufe Loop-artig unterteilen. g = indizierte BufferGeometry (position, uv, skinIndex, skinWeight …) */
function stufe(g, kraft) {
  const pos = g.attributes.position, idx = g.index.array, n = pos.count;
  // an der Lage verschweißen: w[i] = Nummer der Lage
  const wmap = new Map(), w = new Int32Array(n), wp = [];
  for (let i = 0; i < n; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    let id = wmap.get(k); if (id === undefined) { id = wp.length; wmap.set(k, id); wp.push(new THREE.Vector3().fromBufferAttribute(pos, i)); }
    w[i] = id;
  }
  // Kanten (verschweißt) → gegenüberliegende Punkte, Nachbarn je Lage
  const edges = new Map(), nb = wp.map(() => new Set());
  const ek = (a, b) => (a < b ? a * 1e7 + b : b * 1e7 + a);
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = w[idx[t + e]], b = w[idx[t + (e + 1) % 3]], c = w[idx[t + (e + 2) % 3]];
      const k = ek(a, b); let E = edges.get(k); if (!E) { E = []; edges.set(k, E); } E.push(c);
      nb[a].add(b); nb[b].add(a);
    }
  }
  // neue Lage der alten Punkte (Loop-Regel; Rand: unverändert)
  const vNew = wp.map((p, i) => {
    const N = nb[i].size; if (N < 3) return p.clone();
    let border = false; for (const j of nb[i]) if (edges.get(ek(i, j)).length < 2) { border = true; break; }
    if (border) return p.clone();
    const beta = N === 3 ? 3 / 16 : 3 / (8 * N), s = new THREE.Vector3();
    for (const j of nb[i]) s.add(wp[j]);
    return p.clone().multiplyScalar(1 - N * beta).addScaledVector(s, beta).lerp(p, 1 - kraft);
  });
  // Kantenpunkt (verschweißt): 3/8 (a + b) + 1/8 (c + d); am Rand Mitte
  const ePos = new Map();
  const edgePos = (a, b) => {
    const k = ek(a, b); let p = ePos.get(k); if (p) return p;
    const E = edges.get(k), mid = wp[a].clone().add(wp[b]).multiplyScalar(0.5);
    if (E.length === 2) p = wp[a].clone().add(wp[b]).multiplyScalar(3 / 8).addScaledVector(wp[E[0]].clone().add(wp[E[1]]), 1 / 8).lerp(mid, 1 - kraft);
    else p = mid;
    ePos.set(k, p); return p;
  };
  // neue Geometrie: alte Punkte (mit Bildkoordinate) + je Kante (nach Original-Punkten, damit Bildnähte getrennt bleiben) ein Punkt
  const names = Object.keys(g.attributes).filter((a) => a !== 'normal');
  const out = {}; for (const a of names) out[a] = { size: g.attributes[a].itemSize, arr: [], src: g.attributes[a] };
  const push = (a, vals) => { for (const v of vals) out[a].arr.push(v); };
  const get = (attr, i) => { const r = []; for (let c = 0; c < attr.itemSize; c++) r.push(attr.getComponent(i, c)); return r; };
  for (let i = 0; i < n; i++) for (const a of names) push(a, a === 'position' ? vNew[w[i]].toArray() : get(g.attributes[a], i));
  const mids = new Map(); let next = n;
  const skinI = g.attributes.skinIndex, skinW = g.attributes.skinWeight;
  const mid = (i, j) => {
    const k = i < j ? i * 1e7 + j : j * 1e7 + i; let m = mids.get(k); if (m !== undefined) return m;
    m = next++; mids.set(k, m);
    for (const a of names) {
      if (a === 'position') { push(a, edgePos(w[i], w[j]).toArray()); continue; }
      if (a === 'skinIndex' || a === 'skinWeight') continue;
      const A = get(g.attributes[a], i), B = get(g.attributes[a], j); push(a, A.map((x, c) => (x + B[c]) / 2));
    }
    if (skinI && skinW) {   // Knochen-Gewichte beider Punkte zusammenlegen, die 4 stärksten behalten
      const acc = new Map();
      for (const p of [i, j]) for (let c = 0; c < 4; c++) { const b = skinI.getComponent(p, c), wt = skinW.getComponent(p, c) / 2; if (wt > 0) acc.set(b, (acc.get(b) || 0) + wt); }
      const top = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4); while (top.length < 4) top.push([0, 0]);
      const sum = top.reduce((s, x) => s + x[1], 0) || 1;
      push('skinIndex', top.map((x) => x[0])); push('skinWeight', top.map((x) => x[1] / sum));
    }
    return m;
  };
  const tri = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const ng = new THREE.BufferGeometry();
  for (const a of names) {   // Knochen-Nummern ganzzahlig, alles andere als Kommazahl (auch vorher „normalisierte“ Ganzzahlen)
    const Arr = a === 'skinIndex' ? Uint16Array : Float32Array;
    ng.setAttribute(a, new THREE.BufferAttribute(new Arr(out[a].arr), out[a].size, false));
  }
  ng.setIndex(next > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
  return ng;
}

/** Weiche Normalen: Flächen-Normalen (nach Fläche gewichtet) je Lage mitteln; Flächen, die mehr als `knick` abweichen, bleiben getrennt */
function weicheNormalen(g, knick) {
  const pos = g.attributes.position, idx = g.index.array, n = pos.count;
  const fN = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(pos, idx[t]); b.fromBufferAttribute(pos, idx[t + 1]); c.fromBufferAttribute(pos, idx[t + 2]);
    fN.push(new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)));   // Länge = 2 × Fläche → Gewicht
  }
  const byPos = new Map();   // Lage → Liste [Fläche]
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const i = idx[t + e], k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    let L = byPos.get(k); if (!L) { L = []; byPos.set(k, L); } L.push(t / 3);
  }
  const nor = new Float32Array(n * 3), cosK = Math.cos(knick), own = new THREE.Vector3(), s = new THREE.Vector3(), u = new THREE.Vector3();
  const vf = Array.from({ length: n }, () => []);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) vf[idx[t + e]].push(t / 3);
  for (let i = 0; i < n; i++) {
    own.set(0, 0, 0); for (const f of vf[i]) own.add(fN[f]); own.normalize();
    s.set(0, 0, 0);
    for (const f of byPos.get(key(pos.getX(i), pos.getY(i), pos.getZ(i)))) if (u.copy(fN[f]).normalize().dot(own) > cosK) s.add(fN[f]);
    if (s.lengthSq() < 1e-20) s.copy(own);
    s.normalize(); nor[i * 3] = s.x; nor[i * 3 + 1] = s.y; nor[i * 3 + 2] = s.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
}

/**
 * Figur glätten: `stufen` × unterteilen (je ×4 Dreiecke), `kraft` 0 … 1 wie stark gerundet wird, `knick` (rad) – schärfere
 * Kanten bleiben hart. Gibt eine neue Geometrie zurück (die alte bleibt unberührt).
 */
export function glaetten(geo, { stufen = 1, kraft = 0.7, knick = 1.1 } = {}) {
  let g = geo.index ? geo : geo.toNonIndexed();
  if (!g.index) { const a = []; for (let i = 0; i < g.attributes.position.count; i++) a.push(i); g = g.clone(); g.setIndex(a); }
  for (let s = 0; s < stufen; s++) g = stufe(g, kraft);
  weicheNormalen(g, knick);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
