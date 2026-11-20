// Third-Person-Kamera wie in Souls-Spielen:
// frei mit dem rechten Stick drehen; mit R3 ein Ziel erfassen – dann steht die Kamera hinter dir und hält das Ziel im Bild.
import * as THREE from 'three';
import { clamp, damp, angDiff } from './util.js';

const DIST = 4.6, HEIGHT = 1.55, LOCK_RANGE = 18;
const ray = new THREE.Raycaster();
const v = new THREE.Vector3(), dir = new THREE.Vector3();

export class OrbitCam {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;            // Kamera steht bei yaw 0 hinter der Figur in +Z-Richtung
    this.pitch = 0.32;
    this.dist = DIST;
    this.focus = new THREE.Vector3();
    this.lock = null;        // erfasstes Ziel {pos, name}
    this.blockers = [];      // Meshes, durch die die Kamera nicht hindurchsoll
    this.shakeA = 0; this.shakeT = 0; // Wackeln bei Treffern
  }

  /** Kurz wackeln (Stärke in Metern) */
  shake(a) { this.shakeA = Math.max(this.shakeA, a); }
  /** kurzer Ruck nach innen (Blickwinkel enger) – macht schwere Treffer wuchtiger */
  punch(deg) { this.kick = Math.max(this.kick || 0, deg); }

  /** Vorwärts auf dem Boden (von der Kamera weg) */
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  /** Ziel erfassen (das, auf das man am ehesten schaut) bzw. lösen */
  toggleLock(player, targets) {
    if (this.lock) { this.lock = null; return false; }
    this.lock = this.pick(player, targets, null, 0);
    return !!this.lock;
  }

  /** bestes Ziel: nah und möglichst in Blickrichtung; dirSign ≠ 0 = Nachbar links/rechts vom aktuellen */
  pick(player, targets, current, dirSign) {
    const f = this.forward();
    let best = null, bestS = Infinity;
    for (const t of targets) {
      if (t === current || t.dead) continue;
      const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > LOCK_RANGE) continue;
      const a = angDiff(Math.atan2(f.x, f.z), Math.atan2(dx, dz)); // + = rechts von der Blickrichtung
      if (dirSign && Math.sign(-a) !== dirSign) continue;
      if (!dirSign && Math.abs(a) > 1.4) continue;
      const s = Math.abs(a) * 6 + d;
      if (s < bestS) { bestS = s; best = t; }
    }
    return best;
  }

  switchTarget(player, targets, sign) {
    if (!this.lock) return;
    const n = this.pick(player, targets, this.lock, sign);
    if (n) this.lock = n;
  }

  update(dt, player, cx, cy) {
    // Ziel verloren (zu weit weg)?
    if (this.lock && (this.lock.dead || this.lock.pos.distanceTo(player.pos) > LOCK_RANGE + 4)) this.lock = null;

    if (this.lock) {
      // hinter der Figur, Blick aufs Ziel
      const dx = player.pos.x - this.lock.pos.x, dz = player.pos.z - this.lock.pos.z;
      const want = Math.atan2(dx, dz);
      this.yaw += angDiff(this.yaw, want) * damp(7, dt);
      this.pitch += (0.3 - this.pitch) * damp(5, dt);
    } else {
      this.yaw -= cx;
      this.pitch = clamp(this.pitch + cy, -0.35, 1.1);
    }

    this.focus.lerp(v.set(player.pos.x, player.pos.y + HEIGHT, player.pos.z), damp(14, dt));
    let look = this.focus;
    if (this.lock) look = v.copy(this.focus).lerp(this.lock.pos, 0.35).setY(this.focus.y - 0.2);

    // Kamera nicht durch Wände: Strahl von der Figur nach hinten
    dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let want = DIST;
    if (this.blockers.length) {
      ray.set(this.focus, dir); ray.far = DIST;
      const hit = ray.intersectObjects(this.blockers, false)[0];
      if (hit) want = Math.max(0.8, hit.distance - 0.3);
    }
    this.dist += (want - this.dist) * damp(want < this.dist ? 25 : 4, dt);
    this.cam.position.copy(this.focus).addScaledVector(dir, this.dist);
    if (this.cam.position.y < 0.3) this.cam.position.y = 0.3;
    this.cam.lookAt(look);
    if (this.baseFov == null) this.baseFov = this.cam.fov;
    this.kick = (this.kick || 0) * Math.exp(-9 * dt);
    const fov = this.baseFov - this.kick;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    if (this.shakeA > 0.001) {
      this.shakeT += dt * 60;
      const a = this.shakeA, t = this.shakeT;
      this.cam.position.x += Math.sin(t * 1.7) * a; this.cam.position.y += Math.sin(t * 2.3 + 1) * a * 0.7;
      this.cam.rotateZ(Math.sin(t * 1.3) * a * 0.15);
      this.shakeA *= Math.exp(-14 * dt);
    }
  }
}
