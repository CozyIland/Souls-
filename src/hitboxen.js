// Hitboxen des Bosses sichtbar machen (Testmodus → „Boss-Hitboxen“):
// - Körper: türkise Gitter-Kapseln an den Knochen (Kopf, Hals, Rumpf, je Bein drei Teile, Schwanz) – dort treffen Degen und Karten;
//   blinken weiß bei jedem Treffer.
// - Angriffe: Kugeln/Kapseln in der Farbe des Angriffs an Schnauze, Pfote(n), Kopf/Hals, Schwanz – bewegen sich mit;
//   schwach beim Ausholen, kräftig, solange der Angriff trifft. Sprung und Heulen: Kreise am Boden.
// - Gelbe Kapsel = der Magier (getroffen wird, wenn sie eine Angriffsform berührt).
// Ansicht: 0 = aus, 1 = Körper + laufender Angriff, 2 = alles (jeder Angriff in seiner Farbe, wie im Testmenü).
// Alles wird durch Wände und den Boss hindurch gezeichnet (depthTest aus).
import * as THREE from 'three';
import { HB, hitPhase } from './boss.js';

export const ZCOL = { body: '#3fe0ff', bite: '#ff4a4a', swipe: '#ffb02e', leap: '#c86bff', charge: '#4f8cff', spin: '#36d39a', stomp: '#ff7ad9', howl: '#f0f0f0' };
export const ZONES = ['bite', 'swipe', 'leap', 'charge', 'spin', 'stomp', 'howl'];
const PARTS = ['bite', 'swipe', 'stomp', 'charge', 'spin'];   // Angriffe mit Körperteilen
const RINGS = ['leap', 'howl'];                                // Angriffe als Kreis am Boden
const KEY = 'aschenblatt-hitbox-ansicht';
export const hbState = { view: 0 };
try { hbState.view = Math.max(0, Math.min(2, Number(localStorage.getItem(KEY)) || 0)); } catch (e) { /* egal */ }
export function setView(v) { hbState.view = v; try { localStorage.setItem(KEY, String(v)); } catch (e) { /* egal */ } }

const wire = (c, o = 0.5) => new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
const fill = (c, o = 0.15) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
const line = (c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthTest: false, fog: false, toneMapped: false });
const noAO = (o) => { o.renderOrder = 999; o.frustumCulled = false; o.userData.noMerge = true; return o; };
const UP = new THREE.Vector3(0, 1, 0), vD = new THREE.Vector3(), WHITE = new THREE.Color(0xffffff);

/** Kreis am Boden um (0,0) */
function fan(r, n = 64) {
  const pos = [0, 0, 0], idx = [];
  for (let i = 0; i <= n; i++) { const a = TAUi(i, n); pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); }
  for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
function rim(r, n = 64) { const p = []; for (let i = 0; i <= n; i++) { const a = TAUi(i, n); p.push(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r)); } return new THREE.BufferGeometry().setFromPoints(p); }
function TAUi(i, n) { return i / n * Math.PI * 2; }

/** Gitter-Kapsel, die man jedes Bild auf zwei Punkte a–b mit Radius r legt (Form wird nur bei anderer Größe neu gebaut) */
class Cap {
  constructor(parent, color, op, seg = 12) { this.m = noAO(new THREE.Mesh(new THREE.BufferGeometry(), wire(color, op))); this.key = ''; this.seg = seg; parent.add(this.m); }
  set(a, b, r) {
    const len = a.distanceTo(b), key = (Math.round(r * 50) + ':' + Math.round(len * 50));
    if (key !== this.key) { this.key = key; this.m.geometry.dispose(); this.m.geometry = new THREE.CapsuleGeometry(Math.max(0.05, r), Math.max(0.001, len), 3, this.seg); }
    this.m.position.copy(a).add(b).multiplyScalar(0.5);
    if (len > 1e-4) this.m.quaternion.setFromUnitVectors(UP, vD.subVectors(b, a).divideScalar(len)); else this.m.quaternion.identity();
    this.m.visible = true;
  }
}

export class HitboxView {
  constructor(scene, boss, player) {
    this.boss = boss; this.player = player;
    this.g = new THREE.Group(); scene.add(this.g); this.g.visible = false;
    this.hurt = [];                                  // Körper-Kapseln (werden angelegt, sobald das Modell vermessen ist)
    this.atk = Object.fromEntries(PARTS.map((k) => [k, []]));
    // Kreise am Boden (hängen am Boss und drehen mit)
    this.rings = {};
    for (const k of RINGS) {
      const grp = new THREE.Group(); grp.position.y = 0.06; grp.visible = false;
      grp.f = noAO(new THREE.Mesh(new THREE.BufferGeometry(), fill(ZCOL[k]))); grp.l = noAO(new THREE.Line(new THREE.BufferGeometry(), line(ZCOL[k])));
      grp.add(grp.f, grp.l);
      if (k === 'leap') { grp.f2 = noAO(new THREE.Mesh(new THREE.BufferGeometry(), fill(ZCOL[k]))); grp.l2 = noAO(new THREE.Line(new THREE.BufferGeometry(), line(ZCOL[k]))); grp.add(grp.f2, grp.l2); }
      boss.root.add(grp); this.rings[k] = grp; grp.key = '';
    }
    // der Magier als stehende Kapsel
    this.me = new Cap(this.g, 0xffe14a, 0.3, 8);
  }

  update(dt) {
    const view = hbState.view, B = this.boss, T = B.teile, on = view > 0 && !!B.mm && !!T && T.ok;
    this.g.visible = on; for (const k of RINGS) this.rings[k].visible = false;
    if (!on) return;
    // Körper-Kapseln (dicke = Faktor aus dem Testmodus); blinken bei Treffern
    while (this.hurt.length < T.hurt.length) this.hurt.push(new Cap(this.g, ZCOL.body, 0.35));
    B.hbFlash = Math.max(0, (B.hbFlash || 0) - dt * 3.5);
    T.hurt.forEach((h, i) => {
      const c = this.hurt[i]; c.set(h.a, h.b, h.r * HB.body.dicke);
      c.m.material.color.set(ZCOL.body).lerp(WHITE, B.hbFlash); c.m.material.opacity = 0.3 + 0.5 * B.hbFlash;
    });
    // Angriffsformen an den Körperteilen
    for (const k of PARTS) {
      const cur = B.st === k || (k === 'bite' && (B.st === 'biteQ' || B.st === 'bite2')), ph = cur ? hitPhase(B.st, B.t) : 0, show = view === 2 || (cur && ph > 0);
      const list = this.atk[k];
      const shapes = show ? T.attack(k, HB, B.swSide || 1) : [];
      while (list.length < shapes.length) list.push(new Cap(this.g, ZCOL[k], 0.5));
      list.forEach((c, i) => {
        if (i >= shapes.length) { c.m.visible = false; return; }
        c.set(shapes[i].a, shapes[i].b, shapes[i].r);
        c.m.material.opacity = ph === 2 ? 0.95 : ph === 1 ? 0.45 : 0.25;
      });
    }
    // Sprung/Heulen: Kreise am Boden
    for (const k of RINGS) {
      const grp = this.rings[k], v = HB[k], key = JSON.stringify(v), cur = B.st === k, ph = cur ? hitPhase(k, B.t) : 0;
      if (key !== grp.key) {
        grp.key = key; grp.position.z = v.fwd || 0;
        grp.f.geometry.dispose(); grp.f.geometry = fan(v.r); grp.l.geometry.dispose(); grp.l.geometry = rim(v.r);
        if (grp.f2) { grp.f2.geometry.dispose(); grp.f2.geometry = fan(v.r2); grp.l2.geometry.dispose(); grp.l2.geometry = rim(v.r2); }
      }
      grp.visible = view === 2 || cur;
      const fo = ph === 2 ? 0.45 : ph === 1 ? 0.14 : 0.05;
      grp.f.material.opacity = fo; grp.l.material.opacity = ph ? 1 : 0.5;
      if (grp.f2) { grp.f2.material.opacity = fo * 0.4; grp.l2.material.opacity = ph ? 0.8 : 0.35; }
    }
    // Magier
    const p = this.player.pos;
    this.me.set(vD.set(p.x, 0.15 + 0.4, p.z).clone(), new THREE.Vector3(p.x, 1.7 - 0.4, p.z), 0.4);
  }
}
