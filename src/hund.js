// Streunende Hunde: abgemagert, struppig, gelbe Augen. Aus Grundformen gebaut, Bewegung per Code (Trab, Sprung, Sterben).
// Verhalten: herumstreunen → Magier entdecken (knurren) → hinrennen → umkreisen → ducken und anspringen (Biss) → kurz Pause.
import * as THREE from 'three';
import { toon, outline } from './toon.js';
import { resolve } from './kollision.js';
import { clamp, lerp, damp, angDiff, TAU } from './util.js';

const HP = 60;
const SEE = 13, LOSE = 22;            // Entdecken / Aufgeben (m)
const RUN_V = 5.0, WALK_V = 1.2, CIRCLE_V = 2.4;
const LEAP_RANGE = 2.8, LEAP_V = 9.5;
const T_WIND = 0.38, T_LEAP = 0.34, T_REC = 0.7;
const BITE = 15;                      // Schaden pro Biss
const RADIUS = 0.36;

export const dogs = [];

// ---------- Modell ----------
function mk(geo, mat, parent, x, y, z, line = 0.012) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (line) outline(m, line);
  parent.add(m); return m;
}
function buildDog(fur, dark, belly) {
  const M = { fur: toon(fur, {}), dark: toon(dark, {}), belly: toon(belly, {}), nose: toon(0x120c0a, {}), eye: new THREE.MeshBasicMaterial({ color: 0xffd040 }), tooth: toon(0xe8e0c8, {}) };
  const root = new THREE.Group(); root.scale.setScalar(1.15);
  const body = new THREE.Group(); body.position.y = 0.56; root.add(body);       // Rumpf (wippt, kippt)
  // Brustkorb vorn kräftig, Bauch eingefallen, Rücken dunkler
  const chest = mk(new THREE.SphereGeometry(0.2, 12, 10), M.fur, body, 0, 0.02, 0.2); chest.scale.set(0.9, 1.05, 1.05);
  const waist = mk(new THREE.CylinderGeometry(0.12, 0.17, 0.42, 10), M.fur, body, 0, 0.03, -0.05); waist.rotation.x = Math.PI / 2;
  const hips = mk(new THREE.SphereGeometry(0.15, 10, 8), M.fur, body, 0, 0.04, -0.28); hips.scale.set(1, 1, 1.1);
  const back = mk(new THREE.BoxGeometry(0.16, 0.06, 0.6), M.dark, body, 0, 0.17, -0.02, 0.008); back.rotation.x = 0.05;
  for (let i = 0; i < 4; i++) { const r = mk(new THREE.TorusGeometry(0.17, 0.008, 4, 10, Math.PI), M.dark, body, 0, 0.02, 0.12 - i * 0.07, 0); r.rotation.set(0, Math.PI / 2, Math.PI); } // Rippen
  const belly2 = mk(new THREE.SphereGeometry(0.12, 8, 6), M.belly, body, 0, -0.1, 0.18, 0.006); belly2.scale.set(0.9, 0.6, 1.2);
  // Hals + Kopf
  const neck = new THREE.Group(); neck.position.set(0, 0.1, 0.33); body.add(neck);
  mk(new THREE.CylinderGeometry(0.08, 0.11, 0.24, 8), M.fur, neck, 0, 0.06, 0.06).rotation.x = 0.9;
  const head = new THREE.Group(); head.position.set(0, 0.16, 0.16); neck.add(head);
  const skull = mk(new THREE.SphereGeometry(0.12, 12, 10), M.fur, head, 0, 0, 0); skull.scale.set(0.95, 0.9, 1.05);
  const snout = mk(new THREE.CylinderGeometry(0.045, 0.07, 0.17, 8), M.dark, head, 0, -0.03, 0.15); snout.rotation.x = Math.PI / 2;
  mk(new THREE.SphereGeometry(0.03, 8, 6), M.nose, head, 0, -0.01, 0.24, 0);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.06, 0.06); head.add(jaw);
  mk(new THREE.BoxGeometry(0.07, 0.025, 0.15), M.dark, jaw, 0, -0.01, 0.07, 0.006);
  for (const s of [-1, 1]) {
    mk(new THREE.ConeGeometry(0.008, 0.035, 4), M.tooth, jaw, s * 0.025, 0.015, 0.13, 0);
    mk(new THREE.ConeGeometry(0.008, 0.035, 4), M.tooth, head, s * 0.03, -0.075, 0.2, 0).rotation.x = Math.PI;
    const eye = mk(new THREE.SphereGeometry(0.018, 8, 6), M.eye, head, s * 0.06, 0.03, 0.09, 0); eye.scale.set(1, 0.6, 0.6);
    const ear = mk(new THREE.ConeGeometry(0.045, 0.13, 4), M.dark, head, s * 0.07, 0.11, -0.03, 0.008);
    ear.rotation.set(-0.2, 0, s * -0.35);
    if (s > 0) ear.rotation.z += 0.5; // ein Ohr abgeknickt
  }
  // Schwanz (zwei Glieder)
  const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.4); body.add(tail);
  mk(new THREE.CylinderGeometry(0.025, 0.04, 0.22, 6), M.fur, tail, 0, 0, -0.1).rotation.x = Math.PI / 2 + 0.4;
  const tail2 = new THREE.Group(); tail2.position.set(0, -0.08, -0.2); tail.add(tail2);
  mk(new THREE.CylinderGeometry(0.012, 0.025, 0.2, 6), M.dark, tail2, 0, 0, -0.09).rotation.x = Math.PI / 2 + 0.3;
  // Beine: Hüft-/Schulterdrehpunkt, Knie
  const legs = [];
  for (const [x, z, front] of [[0.1, 0.22, 1], [-0.1, 0.22, 1], [0.09, -0.3, 0], [-0.09, -0.3, 0]]) {
    const hip = new THREE.Group(); hip.position.set(x, -0.02, z); body.add(hip);
    mk(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 6), M.fur, hip, 0, -0.14, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.28, 0); hip.add(knee);
    mk(new THREE.CylinderGeometry(0.028, 0.022, 0.26, 6), front ? M.fur : M.dark, knee, 0, -0.13, 0);
    mk(new THREE.SphereGeometry(0.035, 6, 5), M.dark, knee, 0, -0.26, 0.02, 0.006).scale.set(1, 0.6, 1.4);
    legs.push({ hip, knee, front, side: x > 0 ? 1 : -1 });
  }
  // Fellbüschel (struppig)
  for (let i = 0; i < 9; i++) {
    const t = mk(new THREE.ConeGeometry(0.03, 0.09, 4), i % 2 ? M.fur : M.dark, body, (Math.random() - 0.5) * 0.24, 0.12 + Math.random() * 0.06, -0.3 + i * 0.07, 0);
    t.rotation.set(-1 + Math.random() * 0.5, 0, (Math.random() - 0.5) * 0.8);
  }
  return { root, body, neck, head, jaw, tail, tail2, legs, mats: Object.values(M).filter((m) => m.emissive) };
}

// ---------- Hund ----------
const COLORS = [[0x6b5a48, 0x3e3228, 0xa89074], [0x5a5550, 0x2e2c2a, 0x9a9488], [0x8a6a44, 0x4a3420, 0xc8a878]];
let nextId = 0;
class Dog {
  constructor(scene, x, z, yaw) {
    const c = COLORS[nextId++ % COLORS.length];
    this.m = buildDog(...c);
    scene.add(this.m.root);
    this.home = new THREE.Vector3(x, 0, z); this.homeYaw = yaw;
    this.p = new THREE.Vector3();
    this.pos = new THREE.Vector3();      // Ziel-Punkt für Kamera/Karten (Körpermitte)
    this.node = this.m.root;
    this.name = 'Streunender Hund';
    this.reset();
  }
  reset() {
    this.p.copy(this.home); this.yaw = this.homeYaw;
    this.hp = HP; this.dead = false; this.st = 'idle'; this.t = 0; this.v = new THREE.Vector2();
    this.cool = 1 + Math.random(); this.phase = Math.random() * TAU; this.flash = 0; this.circ = Math.random() < 0.5 ? 1 : -1;
    this.wander = null; this.bit = false; this.deadT = 0; this.alert = 0;
    this.m.root.visible = true; this.m.root.rotation.set(0, this.yaw, 0);
    this.m.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.isOutline) o.visible = true; else if (o.material.transparent) { o.material.transparent = false; o.material.opacity = 1; } });
    this.pos.set(this.p.x, 0.55, this.p.z);
  }
  /** Treffer vom Magier (Degen oder Karte) */
  onHit(dmg, dir, heavy) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 0.18; this.alert = 1;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.st = 'dead'; this.t = 0; this.v.set(dir.x * 4, dir.z * 4); return; }
    // Taumeln: schwere Treffer und Treffer im Anlauf unterbrechen
    if (heavy || this.st !== 'leap') { this.st = 'hurt'; this.t = 0; this.hurtT = heavy ? 0.65 : 0.32; this.v.set(dir.x * (heavy ? 5 : 3), dir.z * (heavy ? 5 : 3)); }
  }

  update(dt, pl) {
    this.t += dt;
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z, d = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const plOk = pl.state !== 'dead';
    let want = null, spd = 0, turn = 8;
    switch (this.st) {
      case 'idle': // streunen
        if (!this.wander || this.t > this.wander.t) this.wander = { a: Math.random() * TAU, t: this.t + 1.5 + Math.random() * 2.5, go: Math.random() < 0.6 };
        if (this.wander.go) { want = this.wander.a; spd = WALK_V; if (this.p.distanceTo(this.home) > 5) want = Math.atan2(this.home.x - this.p.x, this.home.z - this.p.z); }
        if (plOk && (d < SEE || this.alert)) { this.st = 'growl'; this.t = 0; }
        break;
      case 'growl': // knurren: Kopf runter, Blick zum Magier
        want = toP; turn = 10;
        if (this.t > 0.6) { this.st = 'chase'; this.t = 0; }
        break;
      case 'chase':
        want = toP; spd = RUN_V; turn = 9;
        if (!plOk || d > LOSE) { this.st = 'idle'; this.t = 0; this.alert = 0; break; }
        this.cool -= dt;
        if (d < LEAP_RANGE && this.cool <= 0) { this.st = 'wind'; this.t = 0; }
        else if (d < 3.6 && this.cool > 0) { this.st = 'circle'; this.t = 0; }
        break;
      case 'circle': // im Abstand umkreisen, bis der Sprung wieder geht
        this.cool -= dt;
        want = toP + this.circ * (Math.PI / 2 - (d - 3.2) * 0.5); spd = CIRCLE_V; turn = 7;
        if (this.t > 2.2 && Math.random() < dt) this.circ *= -1;
        if (!plOk) { this.st = 'idle'; this.t = 0; break; }
        if (this.cool <= 0 || d > 5) { this.st = 'chase'; this.t = 0; }
        break;
      case 'wind': // ducken und Anlauf nehmen
        want = toP; turn = 14;
        if (this.t > T_WIND) { this.st = 'leap'; this.t = 0; this.bit = false; this.leapA = this.yaw; }
        break;
      case 'leap': { // Sprung mit Biss
        spd = LEAP_V * (1 - this.t / T_LEAP * 0.5);
        this.yaw = this.leapA;
        const hx = this.p.x + Math.sin(this.yaw) * 0.45, hz = this.p.z + Math.cos(this.yaw) * 0.45;
        if (!this.bit && plOk && Math.hypot(pl.pos.x - hx, pl.pos.z - hz) < 0.75) {
          this.bit = true;
          pl.damage(BITE, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
        }
        if (this.t > T_LEAP) { this.st = 'rec'; this.t = 0; }
        break;
      }
      case 'rec': // landen, kurz verwundbar
        if (this.t > T_REC) { this.st = 'chase'; this.t = 0; this.cool = 1.2 + Math.random() * 1.6; }
        break;
      case 'hurt':
        if (this.t > this.hurtT) { this.st = 'chase'; this.t = 0; this.cool = Math.max(this.cool, 0.6); }
        break;
      case 'dead':
        this.deadT += dt;
        if (this.deadT > 25 && d > 18) this.reset(); // kommt irgendwann wieder (zum Üben)
        break;
    }
    // Bewegen
    if (want !== null && this.st !== 'leap') this.yaw += angDiff(this.yaw, want) * damp(turn, dt);
    if (this.st === 'hurt' || this.st === 'dead') this.v.multiplyScalar(Math.exp(-6 * dt));
    else { const tv = spd; this.v.x = lerp(this.v.x, Math.sin(this.yaw) * tv, damp(this.st === 'leap' ? 30 : 8, dt)); this.v.y = lerp(this.v.y, Math.cos(this.yaw) * tv, damp(this.st === 'leap' ? 30 : 8, dt)); }
    this.p.x += this.v.x * dt; this.p.z += this.v.y * dt;
    resolve(this.p, RADIUS);
    this.pos.set(this.p.x, 0.55, this.p.z);
    this.animate(dt);
  }

  animate(dt) {
    const m = this.m, sp = Math.hypot(this.v.x, this.v.y);
    m.root.position.set(this.p.x, 0, this.p.z);
    m.root.rotation.y = this.yaw;
    this.phase += dt * (3 + sp * 2.6);
    const gait = clamp(sp / 2, 0, 1), ph = this.phase;
    let pitch = 0, by = 0.56 + Math.abs(Math.sin(ph)) * 0.035 * gait, headX = 0, jaw = 0.05, tailX = -0.3, tailW = Math.sin(this.t * 3) * 0.2, roll = 0;
    let legAmp = 0.55 * gait, legBase = 0, frontBase = 0;
    switch (this.st) {
      case 'growl': headX = 0.35; jaw = 0.25 + Math.sin(this.t * 40) * 0.05; tailX = -0.8; by = 0.5; break;
      case 'chase': headX = 0.15; jaw = 0.18; tailX = -0.6; pitch = 0.05; break;
      case 'circle': headX = 0.3; jaw = 0.22; tailX = -0.8; break;
      case 'wind': { const k = clamp(this.t / T_WIND, 0, 1); by = 0.56 - 0.16 * k; pitch = 0.18 * k; headX = 0.45 * k; jaw = 0.3; tailX = -0.9; legBase = -0.5 * k; frontBase = 0.5 * k; legAmp = 0; break; }
      case 'leap': { const k = clamp(this.t / T_LEAP, 0, 1); by = 0.56 + Math.sin(k * Math.PI) * 0.45; pitch = -0.35 + k * 0.6; headX = -0.2; jaw = k < 0.7 ? 0.7 : 0.1; frontBase = -1.0; legBase = 0.9; legAmp = 0; tailX = 0.2; break; }
      case 'rec': { const k = clamp(this.t / T_REC, 0, 1); by = 0.5 + 0.06 * k; pitch = 0.1 * (1 - k); headX = 0.1; jaw = 0.1; tailX = -0.5; break; }
      case 'hurt': { const k = clamp(this.t / this.hurtT, 0, 1); pitch = -0.25 * (1 - k); headX = -0.4 * (1 - k); jaw = 0.5; roll = Math.sin(this.t * 30) * 0.12 * (1 - k); tailX = -1.1; break; }
      case 'dead': { const k = clamp(this.deadT / 0.5, 0, 1); roll = k * Math.PI / 2; by = lerp(0.56, 0.22, k); headX = 0.3 * k; jaw = 0.4; legAmp = 0; legBase = 0.3 * k; frontBase = -0.3 * k; tailX = -0.2; break; }
    }
    m.body.position.y = by;
    m.body.rotation.set(pitch, 0, roll);
    m.neck.rotation.x = headX;
    m.jaw.rotation.x = jaw;
    m.tail.rotation.set(tailX, tailW, 0);
    m.tail2.rotation.x = -0.3;
    for (const L of m.legs) {
      // Trab: diagonale Beinpaare gleichzeitig
      const off = (L.front ? 0 : Math.PI) + (L.side > 0 ? 0 : Math.PI);
      const s = Math.sin(ph + off);
      L.hip.rotation.x = s * legAmp + (L.front ? frontBase : legBase);
      L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(ph + off)) * 0.7 * gait + (L.front ? 0 : 0.2);
    }
    // Treffer: rot aufblitzen
    this.flash = Math.max(0, this.flash - dt);
    const f = this.flash > 0 ? 0.9 : 0;
    for (const mt of m.mats) mt.emissive.setRGB(f, f * 0.15, f * 0.1);
    // tot: nach einer Weile ausblenden
    if (this.dead && this.deadT > 3) {
      const a = clamp(1 - (this.deadT - 3) / 1.2, 0, 1);
      m.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.isOutline) o.visible = false; else { o.material.transparent = true; o.material.opacity = a; } });
      if (a <= 0) m.root.visible = false;
    }
  }
}

/** Hunde aufstellen: ein Rudel im Norden, einer an der Querstraße */
export function spawnDogs(scene) {
  for (const [x, z, y] of [[-2, -30, 0.4], [2.5, -33, -0.6], [-1, -36, 2.8], [24, 2, -1.5]]) dogs.push(new Dog(scene, x, z, y));
  return dogs;
}

/** Hunde bewegen; Hunde und Magier schieben sich gegenseitig weg */
export function updateDogs(dt, pl) {
  for (const d of dogs) d.update(dt, pl);
  for (const d of dogs) {
    if (d.dead) continue;
    const dx = pl.pos.x - d.p.x, dz = pl.pos.z - d.p.z, l = Math.hypot(dx, dz), min = RADIUS + 0.4;
    if (l < min && l > 1e-4 && pl.state !== 'roll') { const k = (min - l) / l; pl.pos.x += dx * k * 0.5; pl.pos.z += dz * k * 0.5; d.p.x -= dx * k * 0.5; d.p.z -= dz * k * 0.5; }
    for (const e of dogs) {
      if (e === d || e.dead) continue;
      const ex = e.p.x - d.p.x, ez = e.p.z - d.p.z, el = Math.hypot(ex, ez);
      if (el < 0.7 && el > 1e-4) { const k = (0.7 - el) / el * 0.5; e.p.x += ex * k; e.p.z += ez * k; }
    }
  }
}

export function resetDogs() { for (const d of dogs) d.reset(); }
export const DOG_HP = HP;
