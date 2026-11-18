// Die Spielfigur: Bewegung, Rennen, Ausweichrolle, Ausdauer.
// Bis das Meshy-Modell mit Skelett da ist, steht hier ein Platzhalter-Kartenmagier aus Grundformen
// (schwarze Robe mit Goldsaum, Schal, Bart, Kartenfächer in der linken Hand).
import * as THREE from 'three';
import { part } from './toon.js';
import { clamp, lerp, damp, angDiff, TAU } from './util.js';
import { resolve } from './world.js';

const WALK = 3.4, RUN = 6.4;          // m/s
const ROLL_T = 0.6, ROLL_V = 8.5;     // Dauer (s), Anfangstempo (m/s)
const ROLL_COST = 22, RUN_COST = 16;  // Ausdauer
const RADIUS = 0.38;

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector2();
    this.yaw = Math.PI;               // Blickrichtung (Modell schaut nach +Z bei yaw 0)
    this.hp = 100; this.maxHp = 100;
    this.st = 100; this.maxSt = 100; this.stDelay = 0; this.exhausted = false;
    this.state = 'idle';              // idle | roll
    this.t = 0; this.walk = 0; this.moveK = 0;
    this.rollDir = new THREE.Vector2(0, 1);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.build();
  }

  get invulnerable() { return this.state === 'roll' && this.t > 0.05 && this.t < 0.42; }

  build() {
    const ROBE = 0x24232b, GOLD = 0xc99a3a, SKIN = 0xd9a77e, HAIR = 0x17141a, PANTS = 0x1c1b22;
    this.pivot = new THREE.Group(); this.pivot.position.y = 0.9; this.root.add(this.pivot);
    const b = new THREE.Group(); b.position.y = -0.9; this.pivot.add(b); this.body = b;

    // Beine (Drehpunkt an der Hüfte)
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.13, 0.92, 0); b.add(hip);
      const leg = part(new THREE.CylinderGeometry(0.085, 0.07, 0.85, 10), PANTS); leg.position.y = -0.43; hip.add(leg);
      const foot = part(new THREE.BoxGeometry(0.13, 0.08, 0.26), 0x111014, 0.015); foot.position.set(0, -0.86, 0.05); hip.add(foot);
      this.legs.push(hip);
    }
    // Robe: weiter Mantel, unten offen mit Goldsaum
    const robe = part(new THREE.CylinderGeometry(0.22, 0.42, 1.05, 18, 1, true), ROBE, 0.025, { side: THREE.DoubleSide });
    robe.position.y = 0.9; b.add(robe); this.robe = robe;
    const hem = part(new THREE.TorusGeometry(0.42, 0.022, 6, 24), GOLD, 0); hem.rotation.x = Math.PI / 2; hem.position.y = 0.38; b.add(hem); this.hem = hem;
    const torso = part(new THREE.CylinderGeometry(0.23, 0.2, 0.55, 14), ROBE); torso.position.y = 1.3; b.add(torso);
    const chest = part(new THREE.BoxGeometry(0.12, 0.3, 0.02), SKIN, 0); chest.position.set(0, 1.4, 0.215); chest.rotation.x = -0.08; b.add(chest);
    for (const s of [-1, 1]) { // Goldkante am V-Ausschnitt
      const tr = part(new THREE.BoxGeometry(0.025, 0.42, 0.02), GOLD, 0); tr.position.set(s * 0.075, 1.36, 0.222); tr.rotation.z = s * 0.28; b.add(tr);
    }
    const sash = part(new THREE.CylinderGeometry(0.225, 0.23, 0.11, 14), 0x1a1920, 0.015); sash.position.y = 1.07; b.add(sash);
    const scarf = part(new THREE.TorusGeometry(0.19, 0.075, 8, 18), 0x2a2932, 0.02); scarf.rotation.x = Math.PI / 2 - 0.15; scarf.position.y = 1.6; b.add(scarf);
    const scarfT = part(new THREE.TorusGeometry(0.195, 0.012, 6, 18), GOLD, 0); scarfT.rotation.x = Math.PI / 2 - 0.15; scarfT.position.y = 1.66; b.add(scarfT);

    // Arme mit weiten Ärmeln (Drehpunkt Schulter)
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.29, 1.52, 0); b.add(sh);
      const sleeve = part(new THREE.CylinderGeometry(0.08, 0.17, 0.55, 12, 1, true), ROBE, 0.02, { side: THREE.DoubleSide });
      sleeve.position.y = -0.27; sh.add(sleeve);
      const cuff = part(new THREE.TorusGeometry(0.17, 0.014, 6, 16), GOLD, 0); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.54; sh.add(cuff);
      const hand = part(new THREE.SphereGeometry(0.065, 10, 8), SKIN, 0.012); hand.position.y = -0.6; sh.add(hand);
      sh.rotation.z = s * 0.12;
      this.arms.push(sh);
    }
    // Kartenfächer in der linken Hand
    const fan = new THREE.Group(); fan.position.set(0, -0.66, 0.06); this.arms[1].add(fan);
    for (let i = 0; i < 5; i++) {
      const c = part(new THREE.BoxGeometry(0.075, 0.11, 0.004), i % 2 ? 0xefe2c4 : 0xe4cfa2, 0.004);
      c.geometry.translate(0, 0.05, 0);
      c.rotation.set(0.1, 0, -0.5 + i * 0.25); c.position.z = i * 0.003; fan.add(c);
    }

    // Kopf: Haut, kurze schwarze Haare, Bart
    const head = new THREE.Group(); head.position.y = 1.83; b.add(head); this.head = head;
    head.add(part(new THREE.SphereGeometry(0.17, 18, 14), SKIN, 0.015));
    const hair = part(new THREE.SphereGeometry(0.178, 16, 10, 0, TAU, 0, 1.45), HAIR, 0.015); hair.position.set(0, 0.025, -0.012); hair.rotation.x = -0.35; head.add(hair);
    for (let i = 0; i < 6; i++) { // Strähnen
      const sp = part(new THREE.ConeGeometry(0.04, 0.14, 5), HAIR, 0.008);
      sp.position.set(-0.11 + i * 0.045, 0.15, 0.05 - Math.abs(i - 2.5) * 0.02); sp.rotation.set(0.9, 0, -0.5 + i * 0.2); head.add(sp);
    }
    const beard = part(new THREE.SphereGeometry(0.13, 12, 8, 0, TAU, Math.PI * 0.55, Math.PI * 0.45), HAIR, 0.01); beard.position.set(0, 0.0, 0.03); head.add(beard);
    const must = part(new THREE.BoxGeometry(0.1, 0.018, 0.02), HAIR, 0); must.position.set(0, -0.045, 0.16); head.add(must);
    for (const s of [-1, 1]) { // Augen und Brauen (Anime: dunkle Striche)
      const e = part(new THREE.BoxGeometry(0.035, 0.022, 0.01), 0x2a1a12, 0); e.position.set(s * 0.06, 0.02, 0.158); head.add(e);
      const br = part(new THREE.BoxGeometry(0.055, 0.013, 0.01), HAIR, 0); br.position.set(s * 0.06, 0.06, 0.158); br.rotation.z = s * -0.18; head.add(br);
    }
  }

  /**
   * dt; mv = Bewegung in Weltrichtung (x, z, Länge 0..1); run/roll aus der Eingabe;
   * lockTarget = erfasstes Ziel (Vector3) oder null
   */
  update(dt, mv, run, roll, lockTarget) {
    this.t += dt;
    const ml = Math.hypot(mv.x, mv.z);

    // Ausdauer
    if (this.stDelay > 0) this.stDelay -= dt;
    else if (this.state !== 'roll') this.st = Math.min(this.maxSt, this.st + 38 * dt);
    if (this.exhausted && this.st > 30) this.exhausted = false;

    if (this.state === 'idle') {
      if (roll && this.st > 0 && !this.exhausted) {
        this.state = 'roll'; this.t = 0;
        this.st -= ROLL_COST; this.stDelay = 0.6; if (this.st <= 0) { this.st = 0; this.exhausted = true; }
        if (ml > 0.2) this.rollDir.set(mv.x / ml, mv.z / ml);
        else this.rollDir.set(-Math.sin(this.yaw), -Math.cos(this.yaw)); // ohne Richtung: nach hinten
      }
    }

    if (this.state === 'roll') {
      const k = this.t / ROLL_T;
      const sp = ROLL_V * (k < 0.7 ? 1 - k * 0.5 : 0.65 * (1 - (k - 0.7) / 0.3));
      this.vel.set(this.rollDir.x * sp, this.rollDir.y * sp);
      this.yaw += angDiff(this.yaw, Math.atan2(this.rollDir.x, this.rollDir.y)) * damp(30, dt);
      if (this.t >= ROLL_T) { this.state = 'idle'; this.t = 0; }
    } else {
      const running = run && ml > 0.3 && !this.exhausted && this.st > 0;
      if (running) { this.st -= RUN_COST * dt; this.stDelay = 0.5; if (this.st <= 0) { this.st = 0; this.exhausted = true; } }
      const spd = (running ? RUN : WALK) * Math.min(1, ml);
      this.vel.x = lerp(this.vel.x, mv.x * spd, damp(12, dt));
      this.vel.y = lerp(this.vel.y, mv.z * spd, damp(12, dt));
      // Blick: erfasst → zum Ziel (außer beim Rennen), sonst in Laufrichtung
      let want = null;
      if (lockTarget && !running) want = Math.atan2(lockTarget.x - this.pos.x, lockTarget.z - this.pos.z);
      else if (ml > 0.1) want = Math.atan2(mv.x, mv.z);
      if (want !== null) this.yaw += angDiff(this.yaw, want) * damp(running ? 10 : 13, dt);
      this.running = running;
    }

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    resolve(this.pos, RADIUS);
    this.animate(dt);
  }

  animate(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    // Laufen relativ zur Blickrichtung (Seitwärts-/Rückwärtsschritte im erfassten Zustand)
    const s = this.yaw, fwd = this.vel.x * Math.sin(s) + this.vel.y * Math.cos(s), side = this.vel.x * Math.cos(s) - this.vel.y * Math.sin(s);
    const speed = Math.hypot(this.vel.x, this.vel.y);
    this.moveK = lerp(this.moveK, clamp(speed / RUN, 0, 1), damp(10, dt));
    this.walk += dt * (2 + speed * 2.3) * (fwd < -0.3 ? -1 : 1);
    const sw = Math.sin(this.walk) * clamp(speed / 3, 0, 1);
    let rx = 0, y = 0.9;

    if (this.state === 'roll') {
      const k = this.t / ROLL_T, e = clamp(k / 0.85, 0, 1);
      rx = (e * e * (3 - 2 * e)) * TAU;
      y = 0.9 - Math.sin(clamp(k, 0, 1) * Math.PI) * 0.45;
      const tuck = Math.sin(clamp(k, 0, 1) * Math.PI);
      this.legs[0].rotation.x = this.legs[1].rotation.x = -1.6 * tuck;
      this.arms[0].rotation.x = this.arms[1].rotation.x = -1.2 * tuck;
      this.body.rotation.z = 0;
    } else {
      const lean = this.running ? 0.22 : 0.06 * this.moveK;
      rx = lean;
      y = 0.9 + Math.abs(Math.cos(this.walk)) * 0.05 * this.moveK + Math.sin(performance.now() / 600) * 0.008;
      const sideK = clamp(Math.abs(side) / (Math.abs(fwd) + 0.5), 0, 1);
      this.legs[0].rotation.x = sw * 0.7 * (1 - sideK);
      this.legs[1].rotation.x = -sw * 0.7 * (1 - sideK);
      this.legs[0].rotation.z = -sw * 0.35 * sideK;
      this.legs[1].rotation.z = sw * 0.35 * sideK;
      this.arms[0].rotation.x = -sw * 0.6;
      this.arms[1].rotation.x = sw * 0.35 - 0.35; // Kartenhand leicht vorne
      this.body.rotation.z = Math.sin(this.walk) * 0.04 * this.moveK;
    }
    this.pivot.rotation.x = rx;
    this.pivot.position.y = y;
    // Robe flattert beim Laufen
    this.robe.scale.set(1 + this.moveK * 0.08, 1, 1 + this.moveK * 0.15);
    this.robe.rotation.x = -this.moveK * 0.12;
    this.hem.scale.set(1 + this.moveK * 0.08, 1 + this.moveK * 0.15, 1);
    this.hem.position.z = -this.moveK * 0.06;
  }
}
