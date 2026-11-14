// Third-Person-Kamera mit fester Zielerfassung: steht hinter der Heldin und hält Vargoth im Bild.
import * as THREE from 'three';
import { PX, damp, lerp } from '../util.js';
import { G, P, B } from '../game.js';

const DIST = 5.2;     // Abstand hinter der Spielerin (Meter)
const HEIGHT = 2.5;   // Kamerahöhe

export class LockOnCamera {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 4, 10);
    this.look = new THREE.Vector3(0, 1.5, 0);
    this.dir = { x: 0, y: 1 };  // Richtung Boss -> Spielerin (auf dem Boden)
    this.fx = 0; this.fy = -1;  // Blickrichtung der Kamera auf dem Boden (für die Steuerung)
    this.snap = true;
    this.wasMenu = true;
  }

  update(dt) {
    if (G.state === 'menu') {
      // Langsame Kamerafahrt um Vargoth
      const a = G.time * 0.1;
      this.pos.set(Math.sin(a) * 9.5, 3.4 + Math.sin(G.time * 0.13) * 0.6, Math.cos(a) * 9.5);
      this.look.set(0, 1.9, 0);
      this.wasMenu = true;
    } else {
      if (this.wasMenu) { this.snap = true; this.wasMenu = false; }
      const px = P.x / PX, pz = P.y / PX, bx = B.x / PX, bz = B.y / PX;
      const dx = px - bx, dz = pz - bz, d = Math.hypot(dx, dz);
      if (d > 0.4 && B.state !== 'dead') {
        const k = this.snap ? 1 : damp(d < 2.5 ? 2.5 : 5, dt);
        this.dir.x = lerp(this.dir.x, dx / d, k);
        this.dir.y = lerp(this.dir.y, dz / d, k);
        const l = Math.hypot(this.dir.x, this.dir.y) || 1;
        this.dir.x /= l; this.dir.y /= l;
      }
      const bossH = (B.z || 0) / PX;
      const want = new THREE.Vector3(px + this.dir.x * DIST, HEIGHT + bossH * 0.4, pz + this.dir.y * DIST);
      const lookW = new THREE.Vector3(lerp(px, bx, 0.38), lerp(1.1, 1.9 + bossH, 0.45), lerp(pz, bz, 0.38));
      if (this.snap) { this.pos.copy(want); this.look.copy(lookW); this.snap = false; }
      else {
        this.pos.lerp(want, damp(6, dt));
        this.look.lerp(lookW, damp(8, dt));
      }
    }

    this.cam.position.copy(this.pos);
    if (G.shake > 0 && !G.paused) {
      const s = G.shake * 0.012;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s;
      this.cam.position.z += (Math.random() - 0.5) * s;
    }
    this.cam.lookAt(this.look);

    const fx = this.look.x - this.pos.x, fz = this.look.z - this.pos.z, fl = Math.hypot(fx, fz) || 1;
    this.fx = fx / fl; this.fy = fz / fl;
  }
}
