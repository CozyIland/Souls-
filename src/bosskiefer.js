// Unterkiefer für den Boss (Meshy-Modell boss.glb).
// Das Modell hat keinen eigenen Unterkiefer: der Knochen „jaw“ trug nur 7 Punkte am Kinn, der Gelenk-Knochen „jaw_01“ den
// ganzen Kopf samt Oberkiefer – das Maul stand darum immer gleich weit offen, egal was der Code am Kiefer drehte.
// Einmal beim Laden (nach dem Vermessen der Hitboxen – die bleiben so, wie sie abgestimmt sind):
//  1. Punkte unterhalb der Maullinie und vor dem Kiefergelenk hängen ab jetzt am Knochen „jaw“ – weich: an der Maullinie und zum
//     Gelenk hin wird übergeblendet (die Haut dehnt sich wie bei einem echten Maul), Kehle und Hals hinter dem Gelenk bleiben.
//  2. „jaw“ wird ins Kiefergelenk verlegt (Lage + Bind-Matrix), damit er sich um das Gelenk dreht und nicht um das Kinn.
//  3. Die Clip-Spur „jaw.position“ fliegt raus (kieferSpurWeg, vor dem Binden der Clips; sie würde ihn sonst zurück ans Kinn
//     setzen – war ohnehin konstant).
// Danach öffnet/schließt rotW(jaw, Kopf-Querachse, a) den ganzen Unterkiefer: a < 0 schließt, a > 0 öffnet.
//
// Maße im Raum des Kopf-Knochens (Bind-Haltung, Modell-Einheiten), am Modell Punkt für Punkt vermessen:
//   vorn = +z (Nase z 0,15), oben = +y, quer = x · Mundwinkel (z −0,017 | y −0,134) · Oberzähne vorn (0,061 | −0,157)
//   Unterlippe (0,043 | −0,202) · Kinn unten (0,028 | −0,234) · Kehle (−0,054 | −0,209) · Kieferast hinten (−0,039 | −0,208)
import * as THREE from 'three';

export const KIEFER = {
  z0: -0.017, y0: -0.134, slope: -0.6,   // Maullinie durch den Mundwinkel, fällt nach vorn ab (zwischen Ober- und Unterzähnen)
  band: 0.008,                           // Übergang an der Maullinie (Lippen dehnen sich)
  hz: -0.062, hy: -0.124,                // Kiefergelenk (hinter und etwas über dem Mundwinkel, unter dem Ohr)
  back0: -0.095, back1: -0.035,          // hinter back0 bewegt sich nichts, ab back1 ganz (Kieferast → Kehle weich)
  side0: 0.17, side1: 0.12,              // seitlich (Abstand zur Kopfmitte): Wangen/Halskrause außen bleiben
  xc: 0.0,                               // Kopfmitte quer
};
// So weit (rad) muss der Unterkiefer gegenüber dem Modell zurück, damit das Maul zu ist (Zähne treffen sich, Lefzen liegen an –
// im Spiel von der Seite und schräg vorn geprüft). Im Code ist „jaw“ darum eine ÖFFNUNG: 0 = zu, 0,46 = wie das Modell, 0,95 = Biss.
export const ZU = -0.46;
const HEAD = ['head', 'jaw_01', 'jaw', 'head_01', 'head_02', 'head_03', 'head_04'];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Clip-Spur „jaw.position“ entfernen – VOR mixer.clipAction aufrufen (eine schon gebundene Spur würde weiterlaufen) */
export function kieferSpurWeg(clips) {
  for (const c of clips || []) c.tracks = c.tracks.filter((t) => t.name !== 'jaw.position');
}

/**
 * sk = SkinnedMesh des Bosses (Geometrie wird verändert – der Umriss teilt sie).
 * Gibt { ok, n (Punkte ganz am Unterkiefer), w (Gewicht je Punkt, zum Prüfen) } zurück.
 */
export function bauUnterkiefer(sk) {
  const g = sk.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = sk.skeleton.bones, inv = sk.skeleton.boneInverses, idx = (n) => bones.findIndex((b) => b.name === n);
  const iHead = idx('head'), iJ1 = idx('jaw_01'), iJaw = idx('jaw');
  if (iHead < 0 || iJ1 < 0 || iJaw < 0 || bones[iJaw].children.some((c) => c.isBone)) return { ok: false };
  const head = HEAD.map(idx).filter((i) => i >= 0);
  const K = KIEFER, v = new THREE.Vector3(), wOut = new Float32Array(pos.count);
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    let hw = 0; for (let k = 0; k < 4; k++) if (head.includes(si.getComponent(i, k))) hw += sw.getComponent(i, k);
    if (hw < 0.05) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(inv[iHead]);            // in den Raum des Kopf-Knochens (Bind-Haltung)
    const below = -(v.y - (K.y0 + K.slope * (v.z - K.z0)));           // > 0 = unter der Maullinie
    const w = ss(-K.band, K.band, below) * ss(K.back0, K.back1, v.z) * ss(K.side0, K.side1, Math.abs(v.x - K.xc));
    if (w < 0.01) continue;
    // Gewichte umverteilen: der Kopf-Anteil wandert zu w nach „jaw“, Hals-Anteile bleiben unberührt
    const ws = [0, 1, 2, 3].map((k) => sw.getComponent(i, k)), is = [0, 1, 2, 3].map((k) => si.getComponent(i, k));
    let add = 0;
    for (let k = 0; k < 4; k++) if (head.includes(is[k]) && is[k] !== iJaw) { add += ws[k] * w; ws[k] *= 1 - w; }
    let s = is.indexOf(iJaw);
    if (s < 0) {   // freien Platz nehmen: leer oder ein Kopf-Knochen mit dem kleinsten (schon verschobenen) Rest, sonst den kleinsten
      let best = -1, bw = Infinity;
      for (let k = 0; k < 4; k++) if ((ws[k] === 0 || head.includes(is[k])) && ws[k] < bw) { bw = ws[k]; best = k; }
      s = best >= 0 ? best : ws.indexOf(Math.min(...ws));
      // Rest des verdrängten Kopf-Knochens an einen anderen Kopf-Knochen dieses Punkts geben (sonst geht er verloren)
      const o = [0, 1, 2, 3].find((k) => k !== s && head.includes(is[k]) && ws[k] > 0);
      if (o !== undefined && head.includes(is[s])) ws[o] += ws[s];
      ws[s] = 0; is[s] = iJaw;
    }
    ws[s] += add;
    const sum = ws.reduce((a, b) => a + b, 0) || 1;
    for (let k = 0; k < 4; k++) { si.setComponent(i, k, is[k]); sw.setComponent(i, k, ws[k] / sum); }
    wOut[i] = w; if (w > 0.5) n++;
  }
  si.needsUpdate = true; sw.needsUpdate = true;
  // „jaw“ ins Kiefergelenk: neue Bind-Matrix (gleiche Drehung, neue Lage) und neue Lage im Eltern-Knochen
  const hingeM = new THREE.Vector3(K.xc, K.hy, K.hz).applyMatrix4(inv[iHead].clone().invert());   // Gelenk im Modell-Raum
  const bindJaw = inv[iJaw].clone().invert(); bindJaw.setPosition(hingeM); inv[iJaw].copy(bindJaw).invert();
  bones[iJaw].position.copy(hingeM.clone().applyMatrix4(inv[iJ1]));
  return { ok: true, n, w: wOut };
}
