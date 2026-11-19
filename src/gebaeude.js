// Häuser der toten Stadt (Stufe 2): Mauern mit Relief (Ziegel, Putz, Beton), Fenster als echte Nischen mit Laibung,
// Rahmen, Sprossen, Fensterbank und Sturz; Ladenfronten mit Pfeilern und Schildband; Sockel, Gesimse, Ecklisenen,
// Dachaufbauten oder abgebrochene Kanten, Feuerleitern, Balkone, Efeu, Kabel. Alles wird später nach Material zusammengefasst.
import * as THREE from 'three';
import { toon, outline } from './toon.js';
import { seeded, TAU } from './util.js';
import { block, blockers } from './kollision.js';
import { roofTex, signTex, ivyTex, rustTex, wallMaterialTex, windowAtlasTex, shopAtlasTex, WIN_KINDS, SHOP_KINDS } from './texturen.js';

const R = seeded(77);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (a) => a[Math.floor(R() * a.length)];

export const FLOOR = 3.3;
let bIdx = 0;
// Hausstile: Mauer, Zierteile (Gesimse, Fensterbänke), Fensterrahmen; surround = Putzfaschen um die Fenster
const STYLES = [
  { wall: 'ziegel', trim: 0xb8a68a, frame: 0x2a2420, surround: false, quoin: false },
  { wall: 'klinker', trim: 0x9a9284, frame: 0x1e2226, surround: false, quoin: true },
  { wall: 'putz', trim: 0xd8cbb4, frame: 0x3a2e26, surround: true, quoin: true },
  { wall: 'gelb', trim: 0xe2d4ac, frame: 0x3c2a1c, surround: true, quoin: true },
  { wall: 'beton', trim: 0x8a8880, frame: 0x26282a, surround: false, quoin: false },
  { wall: 'gruen', trim: 0xd0d0c0, frame: 0x2a2a24, surround: true, quoin: false },
];
let M = null; // Materialien (beim ersten Haus erzeugt)
function mats() {
  if (M) return M;
  M = {
    wall: STYLES.map((st, i) => { const t = wallMaterialTex(st.wall, 3 + i * 17); const m = toon(0xffffff, { map: t.map, normalMap: t.normalMap, vertexColors: true }); m.normalScale.set(0.9, 0.9); return m; }),
    trim: STYLES.map((st) => toon(st.trim, { vertexColors: true })),
    frame: STYLES.map((st) => toon(st.frame, { vertexColors: true })),
    win: toon(0xffffff, { map: windowAtlasTex(), vertexColors: true }),
    shop: toon(0xffffff, { map: shopAtlasTex(), vertexColors: true }),
    band: toon(0x2c2622, { vertexColors: true }),
    roof: toon(0xffffff, { map: roofTex() }),
    iron: toon(0x2a2624),
    rust: toon(0xffffff, { map: rustTex('#4a4440') }),
    tank: toon(0xffffff, { map: rustTex('#6a5a48') }),
    brickRaw: toon(0x7a4636),
    concrete: toon(0x7c7870),
    rebar: toon(0x4a2e1e),
    ivy: toon(0xffffff, { map: ivyTex(), alphaTest: 0.5, side: THREE.DoubleSide }),
    line: new THREE.MeshBasicMaterial({ color: 0x120a08, side: THREE.BackSide }),
    awn: [0x6a2a24, 0x2a4a3a, 0x5a4a2a, 0x2a3450].map((c) => toon(0xffffff, { map: rustTex('#' + new THREE.Color(c).getHexString()), side: THREE.DoubleSide })),
    sign: [],
  };
  const SHOPS = [['APOTHEKE', '#2a5a3a', '#e8e0c8'], ['KIOSK', '#7a2a20', '#f0d890'], ['BÄCKEREI', '#5a3a20', '#f0e0c0'], ['PFANDHAUS', '#1e2a3a', '#d8b04a'],
    ['HOTEL ASTORIA', '#3a1a28', '#e6c070'], ['FRISEUR', '#2a3a4a', '#e8e8e0'], ['SPIELHALLE', '#4a1a3a', '#f0c040'], ['WÄSCHEREI', '#2a4a4a', '#f0f0e0'],
    ['METZGEREI', '#6a1a1a', '#f0e8d8'], ['CAFÉ KÖNIG', '#1a1a1a', '#d8b04a'], ['BUCHHANDLUNG', '#3a2a1a', '#e0d0b0'], ['GEMÜSE', '#3a5a2a', '#f0e8c0']];
  M.sign = SHOPS.map(([t, b, f]) => toon(0xffffff, { map: signTex(t, b, f) }));
  return M;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, mat, r, h, x, y, z, seg = 8, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

// ---------- Geometrie-Sammler (eine Geometrie pro Material und Haus) ----------
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tN = new THREE.Vector3();
class Acc {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }
  /** Viereck a-b-c-d (Arrays [x,y,z]), Normale nrm (wird automatisch richtig herum gelegt), uv [[u,v]×4], Helligkeit k */
  quad(a, b, c, d, nrm, uv, k) {
    tA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); tB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); tN.crossVectors(tA, tB);
    let P = [a, b, c, d], U = uv;
    if (tN.dot(nrm) < 0) { P = [a, d, c, b]; U = [uv[0], uv[3], uv[2], uv[1]]; }
    const kk = Array.isArray(k) ? k : [k, k, k, k];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.p.push(P[i][0], P[i][1], P[i][2]); this.n.push(nrm.x, nrm.y, nrm.z); this.u.push(U[i][0], U[i][1]);
      const q = kk[i]; this.c.push(q, q * 0.97, q * 0.94);
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/** Ein Wandabschnitt im Wand-Raum: Punkt(s, y, tiefe) = O + U·s + Y·y + N·tiefe */
class Face {
  constructor(O, U, N, L, acc) { this.O = O; this.U = U; this.N = N; this.L = L; this.A = acc; this.uo = rr(0, 2); }
  P(s, y, dz) { return [this.O.x + this.U.x * s + this.N.x * dz, y, this.O.z + this.U.z * s + this.N.z * dz]; }
  /** Mauerstück an der Oberfläche */
  wall(s0, s1, y0, y1, kf) {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
    const u0 = (s0 + this.uo) / 2, u1 = (s1 + this.uo) / 2, v0 = y0 / 2, v1 = y1 / 2;
    this.A.wall.quad(this.P(s0, y0, 0), this.P(s1, y0, 0), this.P(s1, y1, 0), this.P(s0, y1, 0), this.N, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [kf(y0), kf(y0), kf(y1), kf(y1)]);
  }
  /** Nische (Laibung) mit Tiefe D, innen dunkler; dahinter das Bild aus dem Atlas */
  hole(s0, s1, y0, y1, D, paneAcc, cell, k) {
    const a = this.A.wall, U = this.U, N = this.N, ny = new THREE.Vector3(0, 1, 0);
    const kd = k * 0.45; // tief in der Nische dunkel (Umgebungsverdeckung)
    const uv = (p, q) => [[p, 0], [p + D / 2, 0], [p + D / 2, q], [p, q]];
    a.quad(this.P(s0, y0, 0), this.P(s0, y0, -D), this.P(s0, y1, -D), this.P(s0, y1, 0), U, [[0, y0 / 2], [D / 2, y0 / 2], [D / 2, y1 / 2], [0, y1 / 2]], [k * 0.8, kd, kd, k * 0.8]);
    a.quad(this.P(s1, y0, 0), this.P(s1, y0, -D), this.P(s1, y1, -D), this.P(s1, y1, 0), U.clone().negate(), [[0, y0 / 2], [D / 2, y0 / 2], [D / 2, y1 / 2], [0, y1 / 2]], [k * 0.8, kd, kd, k * 0.8]);
    a.quad(this.P(s0, y1, 0), this.P(s1, y1, 0), this.P(s1, y1, -D), this.P(s0, y1, -D), ny.clone().negate(), [[s0 / 2, 0], [s1 / 2, 0], [s1 / 2, D / 2], [s0 / 2, D / 2]], [k * 0.6, k * 0.6, kd * 0.8, kd * 0.8]);
    a.quad(this.P(s0, y0, 0), this.P(s1, y0, 0), this.P(s1, y0, -D), this.P(s0, y0, -D), ny, [[s0 / 2, 0], [s1 / 2, 0], [s1 / 2, D / 2], [s0 / 2, D / 2]], [k, k, kd, kd]);
    if (paneAcc) paneAcc.quad(this.P(s0, y0, -D), this.P(s1, y0, -D), this.P(s1, y1, -D), this.P(s0, y1, -D), N, cell, [0.9, 0.9, 1, 1]);
    void uv;
  }
  /** Kasten an der Wand: Mitte (s, y), Breite w, Höhe h, steht t vor (dz von 0 bis t), Helligkeit k */
  box(acc, s, y, w, h, t, k, dz0 = 0) {
    const U = this.U, N = this.N, Y = new THREE.Vector3(0, 1, 0);
    const s0 = s - w / 2, s1 = s + w / 2, y0 = y - h / 2, y1 = y + h / 2, z0 = dz0, z1 = dz0 + t;
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    acc.quad(this.P(s0, y0, z1), this.P(s1, y0, z1), this.P(s1, y1, z1), this.P(s0, y1, z1), N, uv, k);
    acc.quad(this.P(s0, y1, z0), this.P(s1, y1, z0), this.P(s1, y1, z1), this.P(s0, y1, z1), Y, uv, k * 1.05);
    acc.quad(this.P(s0, y0, z0), this.P(s1, y0, z0), this.P(s1, y0, z1), this.P(s0, y0, z1), Y.clone().negate(), uv, k * 0.6);
    acc.quad(this.P(s0, y0, z0), this.P(s0, y1, z0), this.P(s0, y1, z1), this.P(s0, y0, z1), U.clone().negate(), uv, k * 0.8);
    acc.quad(this.P(s1, y0, z0), this.P(s1, y1, z0), this.P(s1, y1, z1), this.P(s1, y0, z1), U, uv, k * 0.8);
  }
}

const WIN_W = [0.22, 0.2, 0.15, 0.12, 0.05, 0.13, 0.05, 0.08]; // Häufigkeit der Fensterarten (WIN_KINDS)
function winCell() {
  let x = R(), i = 0; while (i < WIN_W.length - 1 && x > WIN_W[i]) { x -= WIN_W[i]; i++; }
  const c = i % 4, r = Math.floor(i / 4), e = 0.004;
  const u0 = c / 4 + e, u1 = (c + 1) / 4 - e, v1 = 1 - r / 2 - e, v0 = 1 - (r + 1) / 2 + e;
  return { kind: WIN_KINDS[i], uv: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] };
}
function shopCell(kind) {
  const i = kind != null ? kind : ri(0, 3), e = 0.004, u0 = i / 4 + e, u1 = (i + 1) / 4 - e;
  return { kind: SHOP_KINDS[i], uv: [[u0, e], [u1, e], [u1, 1 - e], [u0, 1 - e]] };
}

/**
 * Eine Hausseite mit allen Fenstern, Ladenfront, Gesimsen. shop = Erdgeschoss mit Ladenfront (Straßenseite).
 * Gibt Lage der Fensterbänke zurück (für Feuerleitern/Balkone nicht nötig, aber praktisch).
 */
function facade(F, floors, st, shop) {
  const A = F.A, L = F.L, h = floors * FLOOR;
  const bays = Math.max(1, Math.round(L / 3)), bw = L / bays;
  // Helligkeit nach Höhe: unten Ruß, oben Regenschlieren; je Seite leicht anders
  const kb = rr(0.85, 1.02);
  const kf = (y) => kb * (0.72 + 0.28 * Math.min(1, y / 4)) * (y > h - 1 ? 0.9 : 1);
  for (let f = 0; f < floors; f++) {
    const fy0 = f * FLOOR, fy1 = fy0 + FLOOR;
    const holes = [];
    for (let b = 0; b < bays; b++) {
      const c = (b + 0.5) * bw;
      if (f === 0 && shop) {
        const s0 = b * bw + 0.32, s1 = (b + 1) * bw - 0.32;
        holes.push({ s0, s1, y0: 0.32, y1: 2.6, D: 0.32, shop: true });
      } else if (f === 0) {
        if (R() < 0.35) continue; // geschlossene Wand
        const ww = Math.min(1.1, bw * 0.4);
        holes.push({ s0: c - ww / 2, s1: c + ww / 2, y0: 1.15, y1: 2.55, D: 0.22 });
      } else {
        if (!shop && R() < 0.08) continue; // zugemauert
        const ww = Math.min(1.25, bw * 0.44), wh = 1.6;
        holes.push({ s0: c - ww / 2, s1: c + ww / 2, y0: fy0 + 0.85, y1: fy0 + 0.85 + wh, D: 0.22 });
      }
    }
    // Mauer um die Öffnungen
    let s = 0;
    for (const o of holes) {
      F.wall(s, o.s0, fy0, fy1, kf);
      F.wall(o.s0, o.s1, fy0, o.y0, kf);
      F.wall(o.s0, o.s1, o.y1, fy1, kf);
      s = o.s1;
    }
    F.wall(s, L, fy0, fy1, kf);
    // Öffnungen
    for (const o of holes) {
      const k = kf((o.y0 + o.y1) / 2);
      if (o.shop) {
        const cell = shopCell();
        F.hole(o.s0, o.s1, o.y0, o.y1, o.D, A.shop, cell.uv, k);
        if (cell.kind === 'schaufenster') { // Schaufensterrahmen
          F.box(A.frame, (o.s0 + o.s1) / 2, o.y1 - 0.05, o.s1 - o.s0, 0.1, 0.06, 0.8, -o.D + 0.02);
          F.box(A.frame, (o.s0 + o.s1) / 2, (o.y0 + o.y1) / 2, 0.08, o.y1 - o.y0, 0.06, 0.8, -o.D + 0.02);
        }
      } else {
        const cell = winCell();
        F.hole(o.s0, o.s1, o.y0, o.y1, o.D, A.win, cell.uv, k);
        const ww = o.s1 - o.s0, wh = o.y1 - o.y0, cx = (o.s0 + o.s1) / 2, cy = (o.y0 + o.y1) / 2, dz = -o.D + 0.02;
        // Fensterrahmen in der Nische (bei kaputten/leeren Fenstern nur teilweise)
        if (cell.kind !== 'leer') {
          const fr = 0.06;
          F.box(A.frame, cx, o.y1 - fr / 2, ww, fr, 0.05, 0.9, dz); F.box(A.frame, cx, o.y0 + fr / 2, ww, fr, 0.05, 0.9, dz);
          F.box(A.frame, o.s0 + fr / 2, cy, fr, wh, 0.05, 0.9, dz); F.box(A.frame, o.s1 - fr / 2, cy, fr, wh, 0.05, 0.9, dz);
          if (cell.kind !== 'kaputt' || R() < 0.5) F.box(A.frame, cx, cy, 0.045, wh, 0.04, 0.9, dz);
          F.box(A.frame, cx, o.y0 + wh * 0.66, ww, 0.045, 0.04, 0.9, dz);
        }
        // Fensterbank und Sturz bzw. Putzfaschen
        F.box(A.trim, cx, o.y0 - 0.04, ww + 0.22, 0.09, 0.14, 0.95);
        if (st.surround) {
          F.box(A.trim, cx, o.y1 + 0.08, ww + 0.28, 0.16, 0.05, 1);
          F.box(A.trim, o.s0 - 0.07, cy, 0.12, wh, 0.04, 0.95); F.box(A.trim, o.s1 + 0.07, cy, 0.12, wh, 0.04, 0.95);
          F.box(A.trim, cx, o.y1 + 0.22, 0.16, 0.14, 0.07, 1); // Schlussstein
        } else F.box(A.trim, cx, o.y1 + 0.09, ww + 0.16, 0.18, 0.04, 0.9);
      }
    }
    // Ladenpfeiler und Schildband
    if (f === 0 && shop) {
      for (let b = 0; b <= bays; b++) F.box(A.trim, b * bw, 1.4, 0.4, 2.8, 0.1, 0.8);
      F.box(A.band, L / 2, 2.98, L + 0.1, 0.56, 0.16, 1);
    }
    // Gesims zwischen den Stockwerken
    if (f > 0 && (st.surround || f === 1)) F.box(A.trim, L / 2, fy0 + 0.02, L + 0.06, 0.2, 0.12, 0.9);
  }
  // Sockel und Ecklisenen
  F.box(A.trim, L / 2, 0.17, L + 0.06, 0.34, 0.05, 0.65);
  if (st.quoin) for (const s of [0.18, L - 0.18]) for (let y = 0.6; y < h - 0.4; y += 0.6) F.box(A.trim, s, y, y / 0.6 % 2 < 1 ? 0.36 : 0.26, 0.26, 0.04, 0.85);
  return { bays, bw };
}

/** Feuerleiter an einer Wand (lokal: Wand liegt bei z=0, außen = +z) */
function fireEscape(g, mat, width, floors) {
  for (let f = 1; f < floors; f++) {
    const y = f * FLOOR + 0.05;
    box(g, mat, width, 0.06, 1.0, 0, y, 0.5);                       // Plattform
    box(g, mat, width, 0.04, 0.04, 0, y + 0.95, 1.0);                // Geländer oben
    for (let i = 0; i <= 6; i++) box(g, mat, 0.03, 0.95, 0.03, -width / 2 + (i / 6) * width, y + 0.48, 1.0);
    for (const s of [-1, 1]) box(g, mat, 0.04, 0.04, 1.0, s * width / 2, y + 0.95, 0.5);
    // Treppe zum nächsten Stock (schräg)
    if (f < floors - 1) {
      const st = new THREE.Group(); st.position.set(width * 0.15, y + FLOOR / 2, 0.55); st.rotation.z = Math.atan2(FLOOR, width * 0.7); g.add(st);
      const L = Math.hypot(FLOOR, width * 0.7);
      for (const s of [-0.3, 0.3]) box(st, mat, L, 0.05, 0.04, 0, 0, s);
      for (let i = 0; i < 9; i++) box(st, mat, 0.04, 0.03, 0.6, -L / 2 + (i + 0.5) * L / 9, 0, 0);
    }
  }
  // Leiter nach unten (hochgezogen)
  for (const s of [-0.2, 0.2]) box(g, mat, 0.035, 2.2, 0.035, -width / 2 + 0.4 + s, FLOOR - 1.0, 0.95);
  for (let i = 0; i < 7; i++) box(g, mat, 0.4, 0.03, 0.03, -width / 2 + 0.4, FLOOR - 2.0 + i * 0.3, 0.95);
}

function balcony(g, mat, trim, w) {
  box(g, trim, w, 0.14, 0.9, 0, 0, 0.45);
  for (let i = 0; i <= 8; i++) box(g, mat, 0.025, 0.85, 0.025, -w / 2 + (i / 8) * w, 0.5, 0.88);
  box(g, mat, w, 0.04, 0.05, 0, 0.92, 0.88);
  for (const s of [-1, 1]) box(g, mat, 0.04, 0.04, 0.9, s * w / 2, 0.92, 0.45);
}

function roofStuff(g, w, d, h, m) {
  const top = h;
  // Wassertank auf Stelzen
  if (R() < 0.4) {
    const tx = rr(-w / 2 + 1.5, w / 2 - 1.5), tz = rr(-d / 2 + 1.5, d / 2 - 1.5);
    for (const [a, b] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) cyl(g, m.iron, 0.06, 1.6, tx + a, top + 0.8, tz + b, 6);
    const t = cyl(g, m.tank, 1.0, 1.8, tx, top + 2.5, tz, 14);
    outline(t, 0.03);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.08, 0.6, 14), m.tank); cap.position.set(tx, top + 3.7, tz); cap.castShadow = true; g.add(cap);
  }
  // Lüftungskästen, Rohre, Antennen
  for (let i = 0; i < ri(1, 4); i++) {
    const b = box(g, m.rust, rr(0.6, 1.4), rr(0.5, 0.9), rr(0.6, 1.2), rr(-w / 2 + 1, w / 2 - 1), 0, rr(-d / 2 + 1, d / 2 - 1));
    b.position.y = top + b.scale.y / 2;
  }
  for (let i = 0; i < ri(0, 3); i++) cyl(g, m.iron, 0.08, rr(0.6, 1.4), rr(-w / 2 + 0.8, w / 2 - 0.8), top + 0.5, rr(-d / 2 + 0.8, d / 2 - 0.8), 6);
  if (R() < 0.45) {
    const ax = rr(-w / 2 + 1, w / 2 - 1), az = rr(-d / 2 + 1, d / 2 - 1), ah = rr(2.5, 5);
    cyl(g, m.iron, 0.04, ah, ax, top + ah / 2, az, 5, rr(-0.2, 0.2), rr(-0.2, 0.2));
    for (let i = 0; i < 3; i++) box(g, m.iron, rr(0.6, 1.2), 0.03, 0.03, ax, top + ah * (0.6 + i * 0.12), az, 0, R() * 3, 0);
  }
}

/** Abgebrochene Mauerkante oben (statt Brüstung) mit Ziegeln und Bewehrungseisen */
function brokenTop(g, w, d, h, m, f) {
  for (let i = 0; i < ri(3, 6); i++) {
    const side = ri(0, 3), along = rr(-0.5, 0.5);
    const bw = rr(1, 3.5), bh = rr(0.6, 3);
    const px = side < 2 ? along * w : (side === 2 ? -1 : 1) * (w / 2 - 0.2), pz = side < 2 ? (side === 0 ? -1 : 1) * (d / 2 - 0.2) : along * d;
    const b = box(g, R() < 0.5 ? m.brickRaw : m.concrete, side < 2 ? bw : 0.35, bh, side < 2 ? 0.35 : bw, px, h + bh / 2 - 0.1, pz, rr(-0.06, 0.06), 0, rr(-0.06, 0.06));
    outline(b, 0.03);
    for (let k = 0; k < 3; k++) cyl(g, m.rebar, 0.02, rr(0.4, 1.2), px + rr(-0.4, 0.4), h + bh + 0.2, pz + rr(-0.1, 0.1), 4, rr(-0.5, 0.5), rr(-0.5, 0.5));
  }
  // Schutt auf dem Dach
  for (let i = 0; i < 6; i++) box(g, m.concrete, rr(0.3, 1), rr(0.15, 0.4), rr(0.3, 1), rr(-w / 2 + 1, w / 2 - 1), h + 0.15, rr(-d / 2 + 1, d / 2 - 1), R(), R(), R());
}

/**
 * Haus bauen. (x, z) Mitte, w Breite (x), d Tiefe (z), floors Stockwerke.
 * front = Richtung zur Straße: 'x+', 'x-', 'z+', 'z-' (Läden, Schilder, Balkone dort).
 */
export function building(scene, x, z, w, d, floors, front) {
  const m = mats();
  const si = (bIdx++ * 5 + (R() < 0.3 ? 1 : 0)) % STYLES.length, st = STYLES[si]; // Stile reihum gemischt, damit nicht alles gleich aussieht
  const h = floors * FLOOR;
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const hw = w / 2, hd = d / 2;
  const A = { wall: new Acc(), win: new Acc(), shop: new Acc(), trim: new Acc(), frame: new Acc(), band: new Acc() };
  // Seiten: Ecke O, Richtung U entlang der Wand, Normale N nach außen
  const sides = {
    'z+': [new THREE.Vector3(-hw, 0, hd), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), w],
    'x+': [new THREE.Vector3(hw, 0, hd), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), d],
    'z-': [new THREE.Vector3(hw, 0, -hd), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), w],
    'x-': [new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), d],
  };
  let frontInfo = null;
  for (const k in sides) {
    const [O, U, N, L] = sides[k];
    const info = facade(new Face(O, U, N, L, A), floors, st, k === front);
    if (k === front) frontInfo = info;
  }
  const add = (acc, mat) => { if (!acc.p.length) return; const me = new THREE.Mesh(acc.geo(), mat); me.castShadow = true; me.receiveShadow = true; g.add(me); };
  add(A.wall, m.wall[si]); add(A.win, m.win); add(A.shop, m.shop); add(A.trim, m.trim[si]); add(A.frame, m.frame[si]); add(A.band, m.band);
  // Umriss als Kasten (Anime-Linie)
  const ol = new THREE.Mesh(BOX, m.line); ol.scale.set(w + 0.1, h + 0.05, d + 0.1); ol.position.y = h / 2; g.add(ol);
  // Dach
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.roof); roof.rotation.x = -Math.PI / 2; roof.position.y = h - 0.02; roof.receiveShadow = true; g.add(roof);
  const trimM = toon(st.trim);
  const ruined = R() < 0.3;
  if (ruined) brokenTop(g, w, d, h, m, st);
  else {
    box(g, trimM, w + 0.4, 0.32, d + 0.4, 0, h + 0.75, 0); // Abschlussgesims
    box(g, trimM, w + 0.26, 0.14, d + 0.26, 0, h + 0.55, 0);
    for (const [bx, bz, bw2, bd] of [[0, hd - 0.15, w, 0.3], [0, -hd + 0.15, w, 0.3], [hw - 0.15, 0, 0.3, d], [-hw + 0.15, 0, 0.3, d]]) box(g, m.concrete, bw2, 0.75, bd, bx, h + 0.37, bz);
    roofStuff(g, w, d, h, m);
  }

  // Straßenseite: lokales Koordinatensystem der Frontwand (z = 0 an der Wand, +z = Straße)
  const fr = new THREE.Group();
  const fw = front[0] === 'x' ? d : w;
  if (front === 'z+') { fr.position.set(0, 0, hd); }
  else if (front === 'z-') { fr.position.set(0, 0, -hd); fr.rotation.y = Math.PI; }
  else if (front === 'x+') { fr.position.set(hw, 0, 0); fr.rotation.y = Math.PI / 2; }
  else { fr.position.set(-hw, 0, 0); fr.rotation.y = -Math.PI / 2; }
  g.add(fr);
  const { bays, bw } = frontInfo;
  // Ladenschild auf dem Schildband
  if (R() < 0.85) {
    const sw = Math.min(fw * 0.7, rr(4, 7.5));
    const s = box(fr, m.sign[ri(0, m.sign.length - 1)], sw, 0.5, 0.08, rr(-fw / 2 + sw / 2 + 0.3, fw / 2 - sw / 2 - 0.3), 2.98, 0.2, 0, 0, rr(-0.03, 0.03));
    outline(s, 0.015);
    if (R() < 0.3) s.rotation.z = rr(-0.22, 0.22); // hängt schief
  }
  // Markise (zerrissen)
  if (R() < 0.5) {
    const aw = Math.min(fw * 0.6, rr(3, 6)), ax = rr(-fw / 2 + aw / 2, fw / 2 - aw / 2);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(aw, 1.4, 6, 2), pick(m.awn));
    const p = a.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.2 && R() < 0.5) p.setY(i, p.getY(i) + rr(0, 0.4));
    a.position.set(ax, 2.55, 0.75); a.rotation.x = -1.0; a.castShadow = true; fr.add(a);
    for (const sd of [-1, 1]) box(fr, m.iron, 0.03, 0.03, 1.2, ax + sd * aw / 2, 2.35, 0.65, -0.55);
  }
  // Balkone (vor einzelnen Fenstern)
  if (floors > 2 && R() < 0.4) for (let fl = 2; fl < floors; fl++) for (let b = 0; b < bays; b++) {
    if (R() < 0.55) continue;
    const bg = new THREE.Group(); bg.position.set(-fw / 2 + (b + 0.5) * bw, fl * FLOOR + 0.05, 0); fr.add(bg);
    balcony(bg, m.iron, trimM, bw * 0.75);
  }
  // Feuerleiter
  if (floors > 2 && R() < 0.45) {
    const fe = new THREE.Group(); fe.position.set(rr(-fw / 4, fw / 4), 0, 0.02); fr.add(fe);
    fireEscape(fe, m.rust, Math.min(4, fw * 0.4), floors);
  }
  // Efeu von oben
  for (let i = 0; i < ri(0, 3); i++) {
    const ih = rr(4, Math.min(h, 12)), iw = rr(1.5, 3.5);
    const iv = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), m.ivy);
    iv.position.set(rr(-fw / 2 + iw / 2, fw / 2 - iw / 2), h - ih / 2 + 0.3, 0.16); fr.add(iv);
  }
  // Kabel quer über die Fassade
  if (R() < 0.6) {
    const y = rr(FLOOR * 1.2, h - 1), pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(-fw / 2 + t * fw, y - Math.sin(t * Math.PI) * rr(0.2, 0.6), 0.18)); }
    fr.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.015, 4), m.iron));
  }

  // Kollision und Kamera-Blocker
  block(x, z, w, d);
  const bl = new THREE.Mesh(BOX); bl.scale.set(w, h, d); bl.position.set(x, h / 2, z); bl.updateMatrixWorld(true);
  blockers.push(bl);
  return { h, ruined };
}
