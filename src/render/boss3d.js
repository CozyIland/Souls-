// Vargoth in 3D: gehörnter Ritter mit Großschwert und Umhang, aus Grundformen gebaut.
// Modell schaut nach +Z, seine rechte Hand ist auf der -X-Seite.
import * as THREE from 'three';
import { PX, lerp, damp, clamp } from '../util.js';
import { G, B } from '../game.js';
import { glowTexture } from './textures.js';

const HAND = new THREE.Vector3(-0.75, 1.75, 0.2); // rechte Hand (Drehpunkt des Schwerts)

function metal(color, rough = 0.55, met = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: met });
}

export class BossView {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();   // kippt bei Taumeln, Brüllen, Tod
    this.root.add(this.body);
    scene.add(this.root);

    this.mats = [];
    const armor = metal(0x2c2732), armorLight = metal(0x3d3644), cloth = metal(0x1a1114, 0.95, 0);
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.7 });
    this.mats.push(armor, armorLight, cloth, bone);
    this.cloth = cloth;

    const add = (geo, mat, x, y, z, parent = this.body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // Beine
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.33, 1.25, 0);
      this.body.add(hip);
      add(new THREE.BoxGeometry(0.42, 0.7, 0.48), armor, 0, -0.35, 0, hip);
      add(new THREE.BoxGeometry(0.38, 0.6, 0.44), armorLight, 0, -0.95, 0.02, hip);
      add(new THREE.BoxGeometry(0.42, 0.18, 0.66), armor, 0, -1.18, 0.1, hip);
      this.legs.push(hip);
    }
    // Lendenschurz
    add(new THREE.CylinderGeometry(0.55, 0.8, 0.75, 10, 1, true), cloth, 0, 1.05, 0).material.side = THREE.DoubleSide;
    // Rumpf
    add(new THREE.CylinderGeometry(0.78, 0.55, 1.15, 8), armor, 0, 1.95, 0);
    add(new THREE.BoxGeometry(0.9, 0.7, 0.25), armorLight, 0, 2.05, 0.42);
    // Glühende Gravur auf der Brust (V-Form)
    this.runeMat = new THREE.MeshBasicMaterial({ color: 0xc8a064, transparent: true, opacity: 0.35 });
    for (const s of [-1, 1]) {
      const r = add(new THREE.BoxGeometry(0.05, 0.55, 0.02), this.runeMat, s * 0.16, 2.05, 0.56);
      r.rotation.z = s * 0.5;
      r.castShadow = false;
    }
    // Schulterpanzer mit Dornen
    for (const s of [-1, 1]) {
      const pad = add(new THREE.SphereGeometry(0.42, 12, 8), armorLight, s * 0.82, 2.48, 0);
      pad.scale.set(1.1, 0.8, 1.2);
      for (let i = 0; i < 3; i++) {
        const sp = add(new THREE.ConeGeometry(0.08, 0.45, 6), armor, s * (0.95 + i * 0.02), 2.75, -0.25 + i * 0.25);
        sp.rotation.z = -s * 0.5;
      }
    }
    // Linker Arm hängt
    const armL = add(new THREE.CylinderGeometry(0.16, 0.13, 1.0, 8), armor, 0.88, 1.85, 0.05);
    armL.rotation.z = 0.12;
    add(new THREE.SphereGeometry(0.17, 8, 6), armorLight, 0.95, 1.33, 0.08);
    // Rechter Arm: Schulter -> Hand
    const sh = new THREE.Vector3(-0.85, 2.35, 0);
    const mid = sh.clone().add(HAND).multiplyScalar(0.5);
    const armR = add(new THREE.CylinderGeometry(0.16, 0.14, sh.distanceTo(HAND), 8), armor, mid.x, mid.y, mid.z);
    armR.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sh.clone().sub(HAND).normalize());
    add(new THREE.SphereGeometry(0.18, 8, 6), armorLight, HAND.x, HAND.y, HAND.z);

    // Kopf, Helm, Hörner
    this.head = new THREE.Group();
    this.head.position.set(0, 2.78, 0.05);
    this.body.add(this.head);
    add(new THREE.SphereGeometry(0.33, 14, 10), armor, 0, 0, 0, this.head);
    add(new THREE.BoxGeometry(0.42, 0.34, 0.12), armorLight, 0, -0.02, 0.27, this.head);
    add(new THREE.BoxGeometry(0.34, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.03, 0.34, this.head);
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.22, 0.12, 0.05),
        new THREE.Vector3(s * 0.55, 0.3, -0.05),
        new THREE.Vector3(s * 0.75, 0.6, -0.3),
        new THREE.Vector3(s * 0.7, 0.85, -0.6),
      ]);
      add(new THREE.TubeGeometry(curve, 16, 0.06, 6), bone, 0, 0, 0, this.head);
    }
    // Augen
    const glow = glowTexture();
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff8c3c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      eye.position.set(s * 0.1, 0.04, 0.36);
      eye.scale.setScalar(0.28);
      this.head.add(eye);
      this.eyes.push(eye);
    }

    // Umhang (Wellenbewegung per Vertex)
    const capeGeo = new THREE.PlaneGeometry(1.7, 2.5, 6, 10);
    capeGeo.translate(0, -1.25, 0);
    this.capeBase = capeGeo.attributes.position.array.slice();
    this.cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: 0x24131a, roughness: 1, side: THREE.DoubleSide }));
    this.cape.position.set(0, 2.55, -0.5);
    this.cape.castShadow = true;
    this.body.add(this.cape);
    this.mats.push(this.cape.material);

    // Großschwert
    this.sword = new THREE.Group();
    this.sword.rotation.order = 'YXZ';
    this.sword.position.copy(HAND);
    this.body.add(this.sword);
    const grip = add(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), metal(0x3a2a18, 0.9, 0.1), 0, 0, 0, this.sword);
    grip.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.62, 0.08, 0.1), metal(0x8a6d3b, 0.4, 0.9), 0, 0, 0.25, this.sword);
    this.bladeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.25, metalness: 0.95, emissive: 0x000000 });
    this.mats.push(this.bladeMat);
    add(new THREE.BoxGeometry(0.2, 0.045, 2.3), this.bladeMat, 0, 0, 0.3 + 1.15, this.sword);
    this.tilt = 0.5;

    // Schwungspur (flacher Fächer in Schwerthöhe)
    this.trail = new THREE.Mesh(new THREE.CircleGeometry(1, 40, 0, 1), new THREE.MeshBasicMaterial({
      color: 0xffd296, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.trail.rotation.x = -Math.PI / 2;
    scene.add(this.trail);
    this.trailKey = '';

    this.armorMats = [armor, armorLight, cloth, bone];
    this.transparent = false;
  }

  setTransparent(on) {
    if (this.transparent === on) return;
    this.transparent = on;
    for (const m of [...this.mats, this.runeMat]) { m.transparent = on; m.needsUpdate = true; if (!on) m.opacity = m === this.runeMat ? 0.35 : 1; }
  }

  update(dt) {
    const b = B;
    if (!b) return;
    const menu = G.state === 'menu';
    this.root.visible = b.alpha > 0.01;
    this.root.position.set(b.x / PX, (b.z || 0) / PX, b.y / PX);
    this.root.rotation.y = Math.PI / 2 - b.face;

    // Farben je nach Phase
    const eye = b.phase2 ? 0xff3c1e : 0xff8c3c;
    for (const e of this.eyes) {
      e.material.color.setHex(eye);
      e.scale.setScalar(0.28 + (b.state === 'attack' ? b.glow * 0.25 : 0));
    }
    this.cloth.color.setHex(b.phase2 ? 0x2a0c0c : 0x1a1114);
    this.cape.material.color.setHex(b.phase2 ? 0x3a0d0d : 0x24131a);
    this.runeMat.color.setHex(b.phase2 ? 0xff5a32 : 0xc8a064);

    // Treffer-Aufblitzen
    const fl = clamp(b.flash * 6, 0, 1);
    for (const m of this.armorMats) m.emissive.setRGB(fl, fl, fl);

    // Klinge glüht beim Ausholen (flackert bei Finten)
    const ph = b.atk && b.atk.phases[b.atk.i];
    let gl = b.state === 'attack' ? b.glow : 0;
    if (ph && ph.feint && ph.k === 'wind') gl *= 0.6 + 0.4 * Math.sin(G.time * 18);
    const ec = new THREE.Color(eye).multiplyScalar(gl * 1.6);
    this.bladeMat.emissive.copy(ec);
    if (b.phase2) this.bladeMat.color.setHex(0xa0605a); else this.bladeMat.color.setHex(0x9aa0aa);

    // Schwertwinkel: horizontal um die Hand, Neigung je nach Bewegung
    let tiltT = 0.55;
    if (b.state === 'attack' && ph) {
      if (ph.k === 'wind') tiltT = ph.from < 0 ? -1.0 : -0.15;
      else if (ph.k === 'swing' || ph.k === 'spin') tiltT = 0.08;
      else if (ph.k === 'dash') tiltT = 0.25;
      else if (ph.k === 'leap') tiltT = -1.1;
      else if (ph.k === 'land') tiltT = 0.9;
      else if (ph.k === 'rec') tiltT = 0.75;
    } else if (b.state === 'stagger') tiltT = 0.95;
    this.tilt = lerp(this.tilt, tiltT, damp(ph && (ph.k === 'land' || ph.k === 'swing') ? 30 : 10, dt));
    this.sword.rotation.set(this.tilt, -b.swordA, 0);

    // Körperhaltung
    const speed = Math.hypot(b.vx, b.vy) / PX;
    const walkAmp = clamp(speed / 3, 0, 1) * (b.airborne ? 0 : 1);
    this.legs[0].rotation.x = Math.sin(b.walk * 6) * 0.5 * walkAmp;
    this.legs[1].rotation.x = -Math.sin(b.walk * 6) * 0.5 * walkAmp;
    let lean = 0, bodyY = Math.abs(Math.cos(b.walk * 6)) * 0.06 * walkAmp, scale = 1;
    if (b.airborne) { this.legs[0].rotation.x = -0.9; this.legs[1].rotation.x = -0.6; }
    if (b.state === 'stagger') lean = -0.3 + Math.sin(b.t * 8) * 0.05;
    if (b.state === 'roar') { lean = -0.35 * Math.min(1, b.t * 4); scale = 1 + 0.05 * Math.sin(Math.min(1, b.t) * Math.PI); this.head.rotation.x = -0.4; }
    else this.head.rotation.x = 0;
    if (b.state === 'attack' && ph) {
      if (ph.k === 'wind') lean = -0.12;
      else if (ph.k === 'swing' || ph.k === 'land') lean = 0.18;
      else if (ph.k === 'dash') lean = 0.3;
    }
    if (b.state === 'dead') { lean = -Math.min(1, b.t / 1.2) * 0.6; bodyY = -Math.min(1, b.t / 1.2) * 0.6; }
    this.body.rotation.x = lerp(this.body.rotation.x, lean, damp(10, dt));
    this.body.rotation.y = lerp(this.body.rotation.y, b.state === 'attack' ? -b.swordA * 0.12 : 0, damp(8, dt));
    this.body.position.y = bodyY;
    this.body.scale.setScalar(scale);

    // Umhang weht
    const pos = this.cape.geometry.attributes.position;
    const base = this.capeBase;
    for (let i = 0; i < pos.count; i++) {
      const y = base[i * 3 + 1], x = base[i * 3];
      const k = -y / 2.5; // 0 oben, 1 unten
      pos.array[i * 3 + 2] = base[i * 3 + 2] - k * k * (0.35 + 0.25 * walkAmp + (b.airborne ? 0.4 : 0)) + Math.sin(b.cape * 2.2 + x * 2 + k * 3) * 0.12 * k;
    }
    pos.needsUpdate = true;

    // Tod: langsam verblassen
    this.setTransparent(b.alpha < 1);
    if (this.transparent) for (const m of [...this.mats, this.runeMat]) m.opacity = b.alpha * (m === this.runeMat ? 0.35 : 1);

    // Schwungspur
    this.updateTrail(b, ph, menu);
  }

  updateTrail(b, ph, menu) {
    if (menu || !ph || (ph.k !== 'swing' && ph.k !== 'spin')) { this.trail.material.opacity = 0; return; }
    const k = Math.min(1, ph.t / ph.d);
    // Spur liegt in der Welt-Ebene: Winkel = Blick + Schwertwinkel
    let a0 = b.face + b.swingFrom, a1 = b.face + b.swordA;
    if (ph.k === 'spin') { a0 = a1; a1 = a1 + Math.min(Math.PI * 2, 2.4); }
    const lo = Math.min(a0, a1), span = Math.max(0.05, Math.abs(a1 - a0));
    const key = span.toFixed(2);
    if (key !== this.trailKey) {
      this.trail.geometry.dispose();
      this.trail.geometry = new THREE.RingGeometry(0.35, 1, 40, 1, 0, span);
      this.trailKey = key;
    }
    // Ebene liegt flach: Geometrie-Winkel θ entspricht Spielwinkel -θ
    this.trail.rotation.set(-Math.PI / 2, 0, -(lo + span));
    const hx = Math.cos(b.face) * 8 - Math.sin(b.face) * 30, hy = Math.sin(b.face) * 8 + Math.cos(b.face) * 30;
    this.trail.position.set((b.x + hx) / PX, HAND.y + (b.z || 0) / PX, (b.y + hy) / PX);
    this.trail.scale.setScalar(125 / PX);
    this.trail.material.color.setHex(b.phase2 ? 0xff5a3c : 0xffd296);
    this.trail.material.opacity = (1 - k) * 0.55 * b.alpha;
  }
}
