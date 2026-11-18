// Häuser der toten Stadt: Fassaden aus Fensterfeldern (Atlas), Gesimse, Fensterbänke, Ladenschilder, Markisen,
// Feuerleitern, Balkone, Efeu, Dachaufbauten und eingestürzte Kanten. Alles wird später nach Material zusammengefasst.
import * as THREE from 'three';
import { toon, outline } from './toon.js';
import { seeded, TAU } from './util.js';
import { block, blockers } from './kollision.js';
import { FACADES, facadeAtlas, LIT_CELL, roofTex, signTex, ivyTex, rustTex } from './texturen.js';

const R = seeded(77);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (a) => a[Math.floor(R() * a.length)];

export const FLOOR = 3.3;
let M = null; // Materialien (beim ersten Haus erzeugt)
function mats() {
  if (M) return M;
  M = {
    fac: FACADES.map((f) => toon(0xffffff, { map: facadeAtlas(f), vertexColors: true })),
    trim: FACADES.map((f) => toon(new THREE.Color(f.trim).multiplyScalar(0.85))),
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
    glow: new THREE.MeshBasicMaterial({ color: 0xffb060 }),
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

/**
 * Eine Fassade als Gitter aus Fensterfeldern.
 * Ecken: (x0,z0) → (x1,z1) entlang der Wand, Normale zeigt nach außen; Höhe = floors × FLOOR.
 */
function wallGeo(x0, z0, x1, z1, floors, shopRow) {
  const len = Math.hypot(x1 - x0, z1 - z0), bays = Math.max(1, Math.round(len / 3));
  const pos = [], uv = [], col = [], nor = [];
  const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
  const e = 0.003;
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const ax = x0 + (x1 - x0) * (b / bays), az = z0 + (z1 - z0) * (b / bays);
    const bx = x0 + (x1 - x0) * ((b + 1) / bays), bz = z0 + (z1 - z0) * ((b + 1) / bays);
    const y0 = f * FLOOR, y1 = y0 + FLOOR;
    let cell;
    if (f === 0) cell = shopRow ? 12 + ri(0, 3) : (R() < 0.5 ? 12 + ri(0, 3) : ri(0, 11));
    else { cell = ri(0, 11); if (cell === LIT_CELL && R() < 0.7) cell = 0; }
    const c = cell % 4, r = Math.floor(cell / 4);
    const u0 = c / 4 + e, u1 = (c + 1) / 4 - e, v1 = 1 - r / 4 - e, v0 = 1 - (r + 1) / 4 + e;
    // Helligkeit: unten Ruß, oben Regenschlieren, jedes Feld etwas anders
    const k = rr(0.82, 1.05), kb = k * (f === 0 ? 0.8 : 0.9 + Math.min(1, f / 3) * 0.1), kt = k * (f === floors - 1 ? 0.82 : 1);
    const quad = [[ax, y0, az, u0, v0, kb], [bx, y0, bz, u1, v0, kb], [bx, y1, bz, u1, v1, kt], [ax, y1, az, u0, v1, kt]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const q = quad[i];
      pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); col.push(q[5], q[5] * 0.97, q[5] * 0.94); nor.push(nx, 0, nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return { g, bays };
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
  const fi = ri(0, FACADES.length - 1), f = FACADES[fi], fac = m.fac[fi], trim = m.trim[fi];
  const h = floors * FLOOR;
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const hw = w / 2, hd = d / 2;
  // Wände: (Ecke a → Ecke b, gegen den Uhrzeigersinn von oben gesehen → Normale außen)
  const walls = {
    'z+': [-hw, hd, hw, hd], 'x+': [hw, hd, hw, -hd], 'z-': [hw, -hd, -hw, -hd], 'x-': [-hw, -hd, -hw, hd],
  };
  for (const k in walls) {
    const [a, b, c, e] = walls[k];
    const { g: geo } = wallGeo(a, b, c, e, floors, k === front);
    const mesh = new THREE.Mesh(geo, fac); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  }
  // Umriss als Kasten (Anime-Linie)
  const ol = new THREE.Mesh(BOX, m.line); ol.scale.set(w + 0.1, h + 0.05, d + 0.1); ol.position.y = h / 2; g.add(ol);
  // Dach
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.roof); roof.rotation.x = -Math.PI / 2; roof.position.y = h - 0.02; roof.receiveShadow = true;
  roof.material.map.repeat.set(1, 1); g.add(roof);
  // Gesimse
  const every = f.name === 'putz' || f.name === 'gelb';
  for (let i = 1; i < floors; i++) {
    if (!every && i !== 1) continue;
    const y = i * FLOOR;
    box(g, trim, w + 0.24, 0.2, d + 0.24, 0, y, 0);
  }
  const ruined = R() < 0.3;
  if (ruined) brokenTop(g, w, d, h, m, f);
  else {
    box(g, trim, w + 0.4, 0.32, d + 0.4, 0, h + 0.75, 0); // Abschlussgesims
    for (const [bx, bz, bw, bd] of [[0, hd - 0.15, w, 0.3], [0, -hd + 0.15, w, 0.3], [hw - 0.15, 0, 0.3, d], [-hw + 0.15, 0, 0.3, d]]) box(g, trim, bw, 0.75, bd, bx, h + 0.37, bz);
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
  const bays = Math.max(1, Math.round(fw / 3)), bw = fw / bays;
  // Fensterbänke (Stockwerke 1+)
  for (let fl = 1; fl < floors; fl++) for (let b = 0; b < bays; b++) {
    const bx = -fw / 2 + (b + 0.5) * bw;
    box(fr, trim, bw * 0.55, 0.1, 0.16, bx, fl * FLOOR + FLOOR * 0.22, 0.08);
  }
  // Ladenschild + Markise
  if (R() < 0.8) {
    const sw = Math.min(fw * 0.7, rr(4, 7.5));
    const s = box(fr, m.sign[ri(0, m.sign.length - 1)], sw, 0.9, 0.12, rr(-fw / 2 + sw / 2 + 0.3, fw / 2 - sw / 2 - 0.3), FLOOR - 0.15, 0.1, 0, 0, rr(-0.04, 0.04));
    s.material = s.material; outline(s, 0.02);
    if (R() < 0.35) s.rotation.z = rr(-0.25, 0.25); // hängt schief
  }
  if (R() < 0.5) {
    const aw = Math.min(fw * 0.6, rr(3, 6)), ax = rr(-fw / 2 + aw / 2, fw / 2 - aw / 2);
    const aMat = pick(m.awn);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(aw, 1.4, 6, 2), aMat);
    const p = a.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.2 && R() < 0.5) p.setY(i, p.getY(i) + rr(0, 0.4)); // zerrissen
    a.position.set(ax, FLOOR * 0.8, 0.6); a.rotation.x = -1.0; a.castShadow = true; fr.add(a);
    for (const s of [-1, 1]) box(fr, m.iron, 0.03, 0.03, 1.2, ax + s * aw / 2, FLOOR * 0.62, 0.6, -0.55);
  }
  // Balkone
  if (floors > 2 && R() < 0.4) for (let fl = 2; fl < floors; fl++) for (let b = 0; b < bays; b++) {
    if (R() < 0.55) continue;
    const bg = new THREE.Group(); bg.position.set(-fw / 2 + (b + 0.5) * bw, fl * FLOOR, 0); fr.add(bg);
    balcony(bg, m.iron, trim, bw * 0.8);
  }
  // Feuerleiter an der Seitenwand oder Front
  if (floors > 2 && R() < 0.45) {
    const fe = new THREE.Group(); fe.position.set(rr(-fw / 4, fw / 4), 0, 0); fr.add(fe);
    fireEscape(fe, m.rust, Math.min(4, fw * 0.4), floors);
  }
  // Efeu von oben
  for (let i = 0; i < ri(0, 3); i++) {
    const ih = rr(4, Math.min(h, 12)), iw = rr(1.5, 3.5);
    const iv = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), m.ivy);
    iv.position.set(rr(-fw / 2 + iw / 2, fw / 2 - iw / 2), h - ih / 2 + 0.3, 0.06); fr.add(iv);
  }
  // Kabel quer über die Fassade
  if (R() < 0.6) {
    const y = rr(FLOOR * 1.2, h - 1);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(-fw / 2 + t * fw, y - Math.sin(t * Math.PI) * rr(0.2, 0.6), 0.08)); }
    const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.015, 4), m.iron); fr.add(c);
  }

  // Kollision und Kamera-Blocker
  block(x, z, w, d);
  const bl = new THREE.Mesh(BOX); bl.scale.set(w, h, d); bl.position.set(x, h / 2, z); bl.updateMatrixWorld(true);
  blockers.push(bl);
  return { h, ruined };
}
