// Die Spielfigur: Bewegung, Rennen, Ausweichrolle, Ausdauer.
// Aussehen: dein Meshy-Magier (models/magier.glb, Mixamo-Skelett). Aus der Datei kommen nur „Walking“ und „Running“ –
// Stehen, Rolle, Seitwärtsschritte und der Kartenfächer werden per Code über die Knochen gesteuert.
// Bis das Modell geladen ist (oder falls es fehlt), steht ein Platzhalter aus Grundformen da.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { part, toon, GRADIENT, skinOutline } from './toon.js';
import { clamp, lerp, damp, angDiff, TAU } from './util.js';
import { resolve } from './kollision.js';
import { ladeModell } from './modelle.js';
import { cardMesh, nextSuit } from './karten.js';
import { buildCane, ATTACKS, READY_POSE, attackPose, Trail, BLADE_L } from './degen.js';

const MODEL_URL = 'models/magier.glb';
const WALK = 3.4, RUN = 5.8;          // m/s (Joggen, Rennen)
const LOCK_WALK = 2.5;                // erfasst: ruhigere Schritte
const ROLL_T = 0.6, ROLL_V = 8.5;     // Dauer (s), Anfangstempo (m/s)
const ROLL_COST = 22, RUN_COST = 16;  // Ausdauer
const RADIUS = 0.38;
const CENTER = 0.9;                   // Drehpunkt für die Rolle (Körpermitte)
// Kartenwurf: in den Mantel greifen, Karte ziehen, aus dem Handgelenk nach vorn schleudern
const THROW_T = 0.62, RELEASE = 0.39, THROW_COST = 12;
// Schlüsselhaltungen des rechten Arms (Richtungen im Körper: x links, y oben, z vorn) + Schulterdrehung
const THROW_K = [
  [0.00, [-0.28, -1, 0.04], [-0.1, -1, 0.3], 0],
  [0.17, [0.3, -0.62, 0.72], [0.95, 0.3, -0.1], 0.15],   // Hand greift links in den Mantel
  [0.29, [0.38, -0.32, 0.86], [0.92, 0.32, 0.3], 0.38],  // Karte gezogen, ausholen
  [0.39, [-0.3, 0.05, 1], [-0.42, 0.06, 1], -0.22],      // Wurf: Arm schnellt nach vorn
  [0.50, [-0.72, -0.15, 0.66], [-0.84, -0.2, 0.5], -0.3], // Ausschwingen
  [0.62, [-0.28, -1, 0.04], [-0.1, -1, 0.3], 0],
];

const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

// ---------- Knochen-Werkzeuge ----------
// Richtungen „im Körper“: x = links, y = oben, z = vorn (Figur schaut nach +Z).
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion(), qBody = new THREE.Quaternion();
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

function bodyDir(x, y, z, out) { return out.set(x, y, z).normalize().applyQuaternion(qBody); }

/** Knochen so drehen, dass er zu seinem Kind-Knochen hin nach `dirW` (Welt) zeigt. k = Anteil 0..1 */
function aim(bone, child, dirW, k) {
  if (!bone || !child || k <= 0.001) return;
  const pq = bone.parent.getWorldQuaternion(qA);
  const wq = qB.copy(pq).multiply(bone.quaternion);
  const cur = vA.copy(child.position).normalize().applyQuaternion(wq);
  const target = qC.setFromUnitVectors(cur, dirW).multiply(wq);
  bone.quaternion.slerp(pq.invert().multiply(target), Math.min(1, k));
}

/**
 * Unterarm und Hand um die Unterarm-Achse drehen, bis die Handfläche (−Z der Hand) nach `wantW` zeigt.
 * 60 % der Drehung übernimmt der Unterarm, den Rest das Handgelenk (sonst verdreht sich die Haut am Gelenk).
 */
const vD = new THREE.Vector3(), vE = new THREE.Vector3(), qT = new THREE.Quaternion();
function palmTo(fore, hand, wantW, k) {
  if (k <= 0.001) return;
  for (const [bone, part] of [[fore, 0.6], [hand, 1]]) {
    fore.updateWorldMatrix(true, false); hand.updateWorldMatrix(false, false);
    fore.getWorldPosition(vD); hand.getWorldPosition(vE);
    const axis = vE.sub(vD).normalize();
    const palm = vD.set(0, 0, -1).applyQuaternion(hand.getWorldQuaternion(qT));
    const a = palm.addScaledVector(axis, -palm.dot(axis)).normalize();
    const b = vA.copy(wantW).addScaledVector(axis, -wantW.dot(axis)).normalize();
    let ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    if (vB.crossVectors(a, b).dot(axis) < 0) ang = -ang;
    const pq = bone.parent.getWorldQuaternion(qA);
    const wq = qB.copy(pq).multiply(bone.quaternion);
    qC.setFromAxisAngle(axis, ang * part * k).multiply(wq);
    bone.quaternion.copy(pq.invert().multiply(qC));
  }
}

/** Knochen um eine Achse im Körper drehen */
function bend(bone, axisBody, ang) {
  if (!bone || Math.abs(ang) < 1e-4) return;
  const pq = bone.parent.getWorldQuaternion(qA);
  const wq = qB.copy(pq).multiply(bone.quaternion);
  qC.setFromAxisAngle(vA.copy(axisBody).applyQuaternion(qBody), ang).multiply(wq);
  bone.quaternion.copy(pq.invert().multiply(qC));
}

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector2();
    this.yaw = Math.PI;               // Blickrichtung (Modell schaut nach +Z bei yaw 0)
    this.hp = 100; this.maxHp = 100;
    this.st = 100; this.maxSt = 100; this.stDelay = 0; this.exhausted = false;
    this.state = 'idle';              // idle | roll | throw | attack
    this.atk = null;                  // laufender Degen-Angriff {k, a, hit:Set, next}
    this.drawn = true; this.hitStop = 0; this.hurtFlash = 0; this.onDamage = null;
    this.targets = []; this.onHit = null; // (Ziel, Richtung, schwer)
    this.onThrow = null;              // (Startpunkt, Richtung) → Karte losschicken
    this.queued = false;
    this.t = 0; this.walk = 0; this.moveK = 0; this.time = 0;
    this.rollDir = new THREE.Vector2(0, 1);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pivot = new THREE.Group(); this.pivot.position.y = CENTER; this.root.add(this.pivot);
    this.legYaw = 0;                  // Unterkörper dreht sich in die Laufrichtung (Seitwärtsschritte)
    this.build();
    this.rig = null;
    ladeModell(new GLTFLoader(), MODEL_URL, (g) => this.onModel(g), (e) => console.warn('Magier-Modell fehlt – Platzhalter bleibt.', e));
  }

  get invulnerable() { return (this.state === 'roll' && this.t > 0.05 && this.t < 0.42) || this.state === 'dead' || this.iframe > 0; }

  /** Schaden nehmen (Biss usw.): wegstoßen, kurz taumeln; bei 0 Leben fallen */
  damage(n, dir) {
    if (this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - n);
    this.hurtFlash = 1; this.atk = null; this.handCard && (this.handCard.visible = false);
    this.vel.set(dir.x * 5, dir.z * 5);
    if (this.hp <= 0) { this.state = 'dead'; this.t = 0; }
    else { this.state = 'hurt'; this.t = 0; this.iframe = 0.5; }
    if (this.onDamage) this.onDamage(n, this.hp <= 0);
    return true;
  }
  /** am Rastpunkt wieder aufstehen */
  revive(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.vel.set(0, 0);
    this.hp = this.maxHp; this.st = this.maxSt; this.exhausted = false; this.state = 'idle'; this.t = 0; this.atk = null; this.iframe = 1;
  }

  // ---------- Platzhalter (Grundformen) ----------
  build() {
    const ROBE = 0x24232b, GOLD = 0xc99a3a, SKIN = 0xd9a77e, HAIR = 0x17141a;
    const b = new THREE.Group(); b.position.y = -CENTER; this.pivot.add(b); this.body = b;
    const robe = part(new THREE.CylinderGeometry(0.22, 0.42, 1.5, 18, 1, true), ROBE, 0.025, { side: THREE.DoubleSide });
    robe.position.y = 0.95; b.add(robe);
    const hem = part(new THREE.TorusGeometry(0.42, 0.022, 6, 24), GOLD, 0); hem.rotation.x = Math.PI / 2; hem.position.y = 0.21; b.add(hem);
    const head = part(new THREE.SphereGeometry(0.17, 18, 14), SKIN, 0.015); head.position.y = 1.83; b.add(head);
    const hair = part(new THREE.SphereGeometry(0.178, 16, 10, 0, TAU, 0, 1.45), HAIR, 0.015); hair.position.set(0, 1.86, -0.01); b.add(hair);
    this.placeholder = b;
  }

  // ---------- Meshy-Modell ----------
  onModel(gltf) {
    const model = gltf.scene;
    let skinned = null;
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh && !skinned) skinned = o;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      // Anime-Look: Farben aus Meshy, aber mit harten Lichtstufen
      const m = o.material;
      o.material = new THREE.MeshToonMaterial({
        map: m.map, normalMap: m.normalMap, gradientMap: GRADIENT, side: THREE.DoubleSide,
      });
      if (o.material.normalMap) o.material.normalScale.set(0.7, 0.7);
      this.mat = o.material;
    });
    if (!skinned) return;
    skinOutline(skinned, 0.012);

    const B = {};
    model.traverse((o) => { if (o.isBone) B[o.name.replace(/^mixamorig[:_]?/, '')] = o; });
    if (!(B.Hips && B.Spine && B.LeftArm && B.LeftForeArm && B.LeftHand && B.RightArm && B.RightForeArm && B.RightHand && B.LeftUpLeg)) {
      console.warn('Skelett unvollständig – Platzhalter bleibt.'); return;
    }
    this.pivot.remove(this.placeholder);
    // Halter: Unterkörper-Drehung (Seitwärtsschritte) und Absenkung für die Rolle
    this.legs = new THREE.Group(); this.legs.position.y = -CENTER; this.pivot.add(this.legs);
    this.legs.add(model);
    this.model = model;
    this.rig = B;
    this.bones = [];
    model.traverse((o) => { if (o.isBone) this.bones.push(o); });
    this.animQ = this.bones.map((b) => b.quaternion.clone());
    this.animP = this.bones.map((b) => b.position.clone());
    this.mixer = new THREE.AnimationMixer(model);
    const mk = (re) => {
      const c = gltf.animations.find((a) => re.test(a.name));
      if (!c) return null;
      // Hüfte nicht wandern lassen (wir bewegen die Figur selbst)
      const a = this.mixer.clipAction(c);
      a.play(); a.timeScale = 0; a.setEffectiveWeight(0);
      a.dist = this.strideOf(c, B);
      return a;
    };
    this.walkA = mk(/walk/i);
    this.runA = mk(/run/i);
    this.phase = 0; this.walkW = 0; this.revK = 1;

    // Stockdegen: Stock in der linken Hand, Klinge darin (wird beim Angriff gezogen)
    const cane = buildCane();
    this.sheath = cane.sheath; this.sword = cane.sword;
    this.root.parent.add(this.sheath);
    this.root.parent.add(this.sword);
    this.pose = { arm: [0, 0, 0], fore: [0, 0, 0], blade: [0, 0, 1], tw: 0, ln: 0, w: 0 };
    this.bladeD = new THREE.Vector3(0, 0, 1);
    this.trail = new Trail(this.root.parent);
    // Karte in der rechten Hand (nur während des Wurfs zu sehen)
    this.handCard = cardMesh('♠');
    this.handCard.visible = false;
    this.root.parent.add(this.handCard);
  }

  /** Wie weit kommt die Figur pro Durchlauf der Animation? (aus der Fußbewegung gemessen) */
  strideOf(clip, B) {
    const mixer = new THREE.AnimationMixer(this.model), a = mixer.clipAction(clip);
    a.play();
    const foot = B.LeftFoot || B.LeftLeg;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 24; i++) {
      a.time = (i / 24) * clip.duration; mixer.update(0);
      this.model.updateMatrixWorld(true);
      foot.getWorldPosition(vA); B.Hips.getWorldPosition(vB);
      this.model.worldToLocal(vA); this.model.worldToLocal(vB);
      const z = vA.z - vB.z;
      lo = Math.min(lo, z); hi = Math.max(hi, z);
    }
    a.stop(); mixer.uncacheClip(clip);
    for (let i = 0; i < this.bones.length; i++) { this.bones[i].quaternion.copy(this.animQ[i]); this.bones[i].position.copy(this.animP[i]); }
    return Math.max(0.6, (hi - lo) * 2); // zwei Schritte pro Durchlauf
  }

  /**
   * dt; mv = Bewegung in Weltrichtung (x, z, Länge 0..1);
   * c = Eingabe {run, roll, card, light, heavy}; lockTarget = erfasstes Ziel (Vector3) oder null;
   * aimDir = Kamerarichtung (x, z) für Würfe ohne Ziel
   */
  update(dt, mv, c, lockTarget, aimDir) {
    let { run, roll, card: thr, light, heavy } = c || {};
    this.t += dt; this.time += dt;
    const ml = Math.hypot(mv.x, mv.z);

    // Ausdauer
    if (this.stDelay > 0) this.stDelay -= dt;
    else if (this.state !== 'roll') this.st = Math.min(this.maxSt, this.st + 38 * dt);
    if (this.exhausted && this.st > 30) this.exhausted = false;

    if (this.state === 'hurt' || this.state === 'dead') { light = heavy = thr = roll = false; }
    // ---------- Degen-Angriffe ----------
    if (this.state === 'attack') {
      const A = this.atk.a;
      if ((light || heavy) && this.atk.t > A.act[0]) this.atk.queued = heavy ? 'h' : (A.next || 'l1');
      if (roll && this.atk.t > A.act[1] + 0.04) { this.state = 'idle'; this.atk = null; }
      else if (thr && this.atk.t > A.act[1]) { this.state = 'idle'; this.atk = null; }
      else if (this.atk.t >= A.T - (this.atk.queued ? 0.1 : 0)) {
        const q = this.atk.queued; this.state = 'idle'; this.atk = null;
        // Kombo: vorgemerkter Schlag folgt sofort; sonst kurzes Fenster für den nächsten Kombo-Schlag
        if (q && this.st > 0 && !this.exhausted) { this.startAttack(q, mv, lockTarget); light = heavy = false; }
        else { this.comboNext = A.next; this.comboT = 0.35; }
      }
    }
    this.comboT = Math.max(0, (this.comboT || 0) - dt);
    if (this.state === 'idle' && (light || heavy) && this.st > 0 && !this.exhausted) {
      const k = heavy ? 'h' : (this.comboNext && this.comboT > 0 ? this.comboNext : 'l1');
      this.startAttack(k, mv, lockTarget);
      roll = false; thr = false;
    }
    this.drawn = this.state !== 'throw'; // Degen ist immer gezogen – nur zum Kartenwurf kurz im Stock
    this.iframe = Math.max(0, (this.iframe || 0) - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);

    // Wurf: nach dem Loslassen darf man mit einer Rolle abbrechen oder gleich die nächste Karte vormerken
    if (this.state === 'throw') {
      if (thr && this.t > 0.3) this.queued = true;
      if (this.t > RELEASE && !this.released) {
        this.released = true;
        if (this.onThrow) this.onThrow(this.throwFrom(), this.throwDir(lockTarget), this.suit);
      }
      if (roll && this.t > RELEASE + 0.03) { this.state = 'idle'; this.t = 0; }
      else if (this.t >= THROW_T) { this.state = 'idle'; this.t = 0; if (this.queued) { this.queued = false; thr = true; } }
    }
    if (this.state === 'idle' && thr && this.st > 0 && !this.exhausted) {
      this.state = 'throw'; this.t = 0; this.released = false; this.queued = false; this.suit = nextSuit();
      this.drawn = false; // Klinge zurück in den Stock, die rechte Hand braucht er für die Karte
      this.st -= THROW_COST; this.stDelay = 0.7; if (this.st <= 0) { this.st = 0; this.exhausted = true; }
      roll = false;
    }
    if (this.state === 'idle') {
      if (roll && this.st > 0 && !this.exhausted) {
        this.state = 'roll'; this.t = 0;
        this.st -= ROLL_COST; this.stDelay = 0.6; if (this.st <= 0) { this.st = 0; this.exhausted = true; }
        if (ml > 0.2) this.rollDir.set(mv.x / ml, mv.z / ml);
        else this.rollDir.set(-Math.sin(this.yaw), -Math.cos(this.yaw)); // ohne Richtung: nach hinten
      }
    }

    this.locked = !!lockTarget;
    if (this.state === 'hurt' || this.state === 'dead') {
      this.vel.multiplyScalar(Math.exp(-7 * dt));
      if (this.state === 'hurt' && this.t > 0.42) { this.state = 'idle'; this.t = 0; }
      this.running = false;
    } else if (this.state === 'attack') {
      const at = this.atk, A = at.a;
      at.t += dt;
      // Ausfallschritt im Schlag, sonst stehen bleiben
      const lu = at.t > A.act[0] - 0.08 && at.t < A.act[1] ? A.lunge / (A.act[1] - A.act[0] + 0.08) : 0;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      this.vel.x = lerp(this.vel.x, fx * lu, damp(lu ? 30 : 14, dt));
      this.vel.y = lerp(this.vel.y, fz * lu, damp(lu ? 30 : 14, dt));
      // Ausrichten nur am Anfang (zum Ziel oder in Stick-Richtung)
      if (at.t < A.act[0] && at.face !== null) this.yaw += angDiff(this.yaw, at.face) * damp(25, dt);
      if (lockTarget && at.t < A.act[0]) at.face = Math.atan2(lockTarget.x - this.pos.x, lockTarget.z - this.pos.z);
      // Treffer prüfen
      if (at.t >= A.act[0] && at.t <= A.act[1]) for (const tg of this.targets) {
        if (at.hit.has(tg) || tg.dead) continue;
        const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > A.range + 0.3) continue;
        if (Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > A.arc && d > 0.6) continue;
        at.hit.add(tg);
        this.hitStop = A.heavy ? 0.12 : 0.06;
        if (this.onHit) this.onHit(tg, new THREE.Vector3(dx, 0, dz).normalize(), A.heavy, A.dmg);
      }
      this.running = false;
    } else if (this.state === 'roll') {
      const k = this.t / ROLL_T;
      const sp = ROLL_V * (k < 0.7 ? 1 - k * 0.5 : 0.65 * (1 - (k - 0.7) / 0.3));
      this.vel.set(this.rollDir.x * sp, this.rollDir.y * sp);
      this.yaw += angDiff(this.yaw, Math.atan2(this.rollDir.x, this.rollDir.y)) * damp(30, dt);
      if (this.t >= ROLL_T) { this.state = 'idle'; this.t = 0; }
      this.running = false;
    } else {
      const running = run && ml > 0.3 && !this.exhausted && this.st > 0;
      if (running) { this.st -= RUN_COST * dt; this.stDelay = 0.5; if (this.st <= 0) { this.st = 0; this.exhausted = true; } }
      const throwing = this.state === 'throw';
      const spd = (running && !throwing ? RUN : lockTarget || throwing ? LOCK_WALK : WALK) * Math.min(1, ml) * (throwing ? 0.5 : 1);
      this.vel.x = lerp(this.vel.x, mv.x * spd, damp(12, dt));
      this.vel.y = lerp(this.vel.y, mv.z * spd, damp(12, dt));
      let want = null;
      if (lockTarget && (!running || throwing)) want = Math.atan2(lockTarget.x - this.pos.x, lockTarget.z - this.pos.z);
      else if (throwing && aimDir && this.t < RELEASE) want = Math.atan2(aimDir.x, aimDir.z); // ohne Ziel: in Blickrichtung der Kamera
      else if (ml > 0.1) want = Math.atan2(mv.x, mv.z);
      if (want !== null) this.yaw += angDiff(this.yaw, want) * damp(throwing ? 22 : running ? 10 : 13, dt);
      this.running = running && !throwing;
    }

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    resolve(this.pos, RADIUS);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (this.rig) this.animateRig(dt); else this.animateSimple(dt);
  }

  startAttack(k, mv, lockTarget) {
    const A = ATTACKS[k];
    this.state = 'attack'; this.t = 0;
    let face = null;
    if (lockTarget) face = Math.atan2(lockTarget.x - this.pos.x, lockTarget.z - this.pos.z);
    else if (Math.hypot(mv.x, mv.z) > 0.3) face = Math.atan2(mv.x, mv.z);
    else { // ohne Ziel und ohne Stick: zum nächsten Gegner vor dir drehen (Hilfe beim Zielen)
      let best = 3.5;
      for (const tg of this.targets) {
        if (!tg.onHit || tg.dead) continue;
        const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < best && Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) < 1.7) { best = d; face = Math.atan2(dx, dz); }
      }
    }
    this.atk = { k, a: A, t: 0, hit: new Set(), queued: null, face };
    this.st -= A.cost; this.stDelay = 0.8; if (this.st <= 0) { this.st = 0; this.exhausted = true; }
    this.drawn = true;
    this.comboNext = null; this.comboT = 0;
  }

  /** Startpunkt der Karte: rechte Hand (ohne Skelett: vor der Brust) */
  throwFrom() {
    if (this.rig) { const p = new THREE.Vector3(); this.rig.RightHand.getWorldPosition(p); return p; }
    return new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.4, 1.3, this.pos.z + Math.cos(this.yaw) * 0.4);
  }
  throwDir(lockTarget) {
    const from = this.throwFrom();
    if (lockTarget) return new THREE.Vector3().subVectors(lockTarget, from);
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); // waagerecht geradeaus
  }

  // ---------- Platzhalter-Bewegung ----------
  animateSimple(dt) {
    const speed = Math.hypot(this.vel.x, this.vel.y);
    this.moveK = lerp(this.moveK, clamp(speed / RUN, 0, 1), damp(10, dt));
    let rx = 0.06 * this.moveK, y = CENTER + Math.sin(this.time * 1.7) * 0.008;
    if (this.state === 'roll') {
      const k = this.t / ROLL_T;
      rx = smooth(k / 0.85) * TAU; y = CENTER - Math.sin(clamp(k, 0, 1) * Math.PI) * 0.45;
    }
    this.pivot.rotation.x = rx; this.pivot.position.y = y;
  }

  // ---------- Skelett-Bewegung ----------
  animateRig(dt) {
    const R = this.rig, bones = this.bones;
    // 0) Code-Haltung vom letzten Bild entfernen (der Mixer schreibt Knochen nur bei Änderungen neu)
    for (let i = 0; i < bones.length; i++) { bones[i].quaternion.copy(this.animQ[i]); bones[i].position.copy(this.animP[i]); }

    const sp = Math.hypot(this.vel.x, this.vel.y);
    const rolling = this.state === 'roll';
    const moving = !rolling && this.state !== 'attack' && sp > 0.25;

    // Laufrichtung relativ zur Blickrichtung → Unterkörper dreht mit, rückwärts = Animation rückwärts
    let rel = 0, back = false;
    if (moving) {
      rel = angDiff(this.yaw, Math.atan2(this.vel.x, this.vel.y));
      if (Math.abs(rel) > 1.9) { back = true; rel = angDiff(this.yaw, Math.atan2(-this.vel.x, -this.vel.y)); }
    }
    const legT = moving ? clamp(rel, -1.15, 1.15) : 0;
    this.legYaw += angDiff(this.legYaw, legT) * damp(10, dt);
    this.revK = lerp(this.revK, back ? -1 : 1, damp(14, dt));

    // 1) Laufen/Rennen aus der Datei – Schritte passend zum Tempo, damit die Füße nicht rutschen
    this.walkW = lerp(this.walkW, moving ? clamp((sp - 0.25) / 0.8, 0, 1) : 0, damp(10, dt));
    const W = this.walkA, Rn = this.runA;
    const runK = Rn ? (W ? clamp((sp - 2.0) / 1.0, 0, 1) : 1) : 0;
    const dw = W ? W.getClip().duration : 1, dr = Rn ? Rn.getClip().duration : 1;
    // Meter pro Durchlauf – etwas weiter als in der Datei (Anime-Schritte), beim Rennen noch weiter
    const cyc = lerp(W ? W.dist : 1.6, Rn ? Rn.dist : 2.6, runK) * (1.2 + clamp((sp - 3.4) / 2.4, 0, 1) * 0.4);
    if (moving) this.phase = (this.phase + Math.sign(this.revK) * dt * sp / cyc + 1) % 1;
    if (W) { W.time = this.phase * dw; W.setEffectiveWeight(this.walkW * (1 - runK)); }
    if (Rn) { Rn.time = this.phase * dr; Rn.setEffectiveWeight(this.walkW * runK); }
    this.mixer.update(0);
    for (let i = 0; i < bones.length; i++) { this.animQ[i].copy(bones[i].quaternion); this.animP[i].copy(bones[i].position); }

    // 2) Ganzer Körper: Rolle
    let rx = 0, y = CENTER, tuck = 0;
    if (rolling) {
      const k = this.t / ROLL_T;
      rx = smooth(k / 0.82) * TAU;
      y = CENTER - Math.sin(clamp(k, 0, 1) * Math.PI) * 0.42;
      tuck = Math.sin(clamp(k / 0.88, 0, 1) * Math.PI);
    }
    let hurtK = 0;
    if (this.state === 'hurt') { hurtK = Math.sin(clamp(this.t / 0.42, 0, 1) * Math.PI); rx = -0.18 * hurtK; }
    if (this.state === 'dead') { const f = smooth(this.t / 0.9); rx = -f * 1.45; y = lerp(CENTER, 0.3, f); hurtK = 1 - f; }
    if (this.mat && this.mat.emissive) this.mat.emissive.setRGB(this.hurtFlash * 0.7, this.hurtFlash * 0.05, this.hurtFlash * 0.03);
    this.pivot.rotation.x = rx;
    this.pivot.position.y = y;
    this.legs.rotation.y = this.legYaw;
    this.model.updateMatrixWorld(true);

    // 3) Haltung per Code
    this.legs.getWorldQuaternion(qBody);
    const still = 1 - this.walkW, t = this.time;
    // Oberkörper schaut weiter nach vorn (gegen die Drehung des Unterkörpers)
    bend(R.Spine, AY, -this.legYaw * 0.3);
    bend(R.Spine1, AY, -this.legYaw * 0.35);
    bend(R.Spine2, AY, -this.legYaw * 0.35);
    // Atmen, beim Rennen vorbeugen, beim Rollen einrollen
    const lean = this.running ? 0.12 : 0;
    bend(R.Spine, AX, tuck * 0.4 + lean * 0.4);
    bend(R.Spine1, AX, Math.sin(t * 1.8) * 0.02 * still + tuck * 0.45 + lean * 0.3);
    bend(R.Spine2, AX, Math.sin(t * 1.8 + 0.4) * 0.015 * still + tuck * 0.35);
    bend(R.Neck, AX, tuck * 0.4 - lean * 0.3);
    if (hurtK > 0) { bend(R.Spine1, AX, -0.25 * hurtK); bend(R.Neck, AX, -0.3 * hurtK); }
    // Stehen: Arme aus der A-Haltung locker herunter
    const ak = still * (1 - tuck);
    aim(R.RightArm, R.RightForeArm, bodyDir(-0.28, -1, 0.04, vB), ak);
    aim(R.RightForeArm, R.RightHand, bodyDir(-0.1, -1, 0.3, vB), ak);
    aim(R.LeftArm, R.LeftForeArm, bodyDir(0.28, -1, 0.06, vB), ak);
    aim(R.LeftForeArm, R.LeftHand, bodyDir(0.08, -1, 0.32, vB), ak);
    // Kartenwurf (rechter Arm, Schultern drehen mit; linke Hand hält den Mantel auf)
    let tw = 0;
    if (this.state === 'throw') {
      const tt = this.t;
      const w = smooth(tt / 0.08) * (1 - smooth((tt - 0.5) / 0.12));
      let i = 0; while (i < THROW_K.length - 2 && tt > THROW_K[i + 1][0]) i++;
      const a0 = THROW_K[i], a1 = THROW_K[i + 1], u = smooth((tt - a0[0]) / (a1[0] - a0[0]));
      const ax = (j) => a0[1][j] + (a1[1][j] - a0[1][j]) * u;
      const fx = (j) => a0[2][j] + (a1[2][j] - a0[2][j]) * u;
      const armD = bodyDir(ax(0), ax(1), ax(2), new THREE.Vector3()), foreD = bodyDir(fx(0), fx(1), fx(2), new THREE.Vector3());
      tw = a0[3] + (a1[3] - a0[3]) * u;
      bend(R.Spine1, AY, tw * 0.5 * w); bend(R.Spine2, AY, tw * 0.5 * w);
      aim(R.RightArm, R.RightForeArm, armD, w);
      aim(R.RightForeArm, R.RightHand, foreD, w);
      const open = smooth(tt / 0.1) * (1 - smooth((tt - 0.3) / 0.1)); // linke Hand zieht den Mantel auf
      aim(R.LeftArm, R.LeftForeArm, bodyDir(0.4, -0.7, 0.45, vB), open * 0.8);
      aim(R.LeftForeArm, R.LeftHand, bodyDir(-0.6, 0.1, 0.8, vB), open * 0.8);
    }
    // Stockdegen: Angriff (Schlüsselhaltungen) oder gezogene Klinge in Bereitschaft
    let bladeOn = false;
    if (this.state === 'attack' || (this.drawn && this.state !== 'throw')) {
      const P = this.pose;
      let w;
      if (this.state === 'attack') { attackPose(this.atk.a, this.atk.t, P); w = smooth(this.atk.t / 0.06); }
      else { P.arm = READY_POSE.arm.slice(); P.fore = READY_POSE.fore.slice(); P.blade = READY_POSE.blade.slice(); P.tw = 0; P.ln = 0; w = (1 - tuck) * (0.6 + 0.4 * still); }
      bend(R.Spine1, AY, P.tw * 0.5 * w); bend(R.Spine2, AY, P.tw * 0.5 * w);
      bend(R.Spine1, AX, P.ln * 0.5 * w); bend(R.Spine2, AX, P.ln * 0.4 * w);
      aim(R.RightArm, R.RightForeArm, bodyDir(P.arm[0], P.arm[1], P.arm[2], vB), w);
      aim(R.RightForeArm, R.RightHand, bodyDir(P.fore[0], P.fore[1], P.fore[2], vB), w);
      // linke Hand mit dem leeren Stock etwas nach hinten
      aim(R.LeftArm, R.LeftForeArm, bodyDir(0.35, -1, -0.15, vB), w * 0.7 * still);
      bodyDir(P.blade[0], P.blade[1], P.blade[2], this.bladeD);
      bladeOn = true;
    }
    // Hüfte und Knie leicht gebeugt beim Stehen (wirkt kampfbereit)
    if (still > 0.01) {
      bend(R.Hips, AX, 0); // Hüfte bleibt
      bend(R.LeftUpLeg, AX, -0.08 * still); bend(R.RightUpLeg, AX, -0.08 * still);
      bend(R.LeftLeg, AX, 0.14 * still); bend(R.RightLeg, AX, 0.14 * still);
      bend(R.LeftUpLeg, AZ, -0.05 * still); bend(R.RightUpLeg, AZ, 0.05 * still);
    }
    // Rolle: Knie zur Brust, Arme an den Körper
    if (tuck > 0.001) {
      aim(R.LeftUpLeg, R.LeftLeg, bodyDir(0.15, 0.2, 1, vB), tuck);
      aim(R.RightUpLeg, R.RightLeg, bodyDir(-0.15, 0.2, 1, vB), tuck);
      aim(R.LeftLeg, R.LeftFoot, bodyDir(0.05, -0.75, -0.65, vB), tuck);
      aim(R.RightLeg, R.RightFoot, bodyDir(-0.05, -0.75, -0.65, vB), tuck);
      aim(R.LeftArm, R.LeftForeArm, bodyDir(0.35, -0.35, 1, vB), tuck);
      aim(R.LeftForeArm, R.LeftHand, bodyDir(-0.4, 0.1, 1, vB), tuck);
      aim(R.RightArm, R.RightForeArm, bodyDir(-0.35, -0.35, 1, vB), tuck);
      aim(R.RightForeArm, R.RightHand, bodyDir(0.4, 0.1, 1, vB), tuck);
    }

    // 4) Stock in der linken Hand, Klinge in der rechten (oder im Stock)
    R.LeftForeArm.getWorldPosition(vC); R.LeftHand.getWorldPosition(vB);
    vA.subVectors(vB, vC).normalize();
    const sd = vE.copy(this.drawn ? bodyDir(0.25, -0.9, -0.35, vD) : bodyDir(0.1, -0.85, 0.5, vD));
    if (tuck > 0) sd.lerp(vA, tuck).normalize();
    this.sheath.position.copy(vB).addScaledVector(vA, 0.06);
    this.sheath.quaternion.setFromUnitVectors(AZ, sd);
    if (bladeOn) {
      R.RightForeArm.getWorldPosition(vC); R.RightHand.getWorldPosition(vB);
      vA.subVectors(vB, vC).normalize();
      this.sword.position.copy(vB).addScaledVector(vA, 0.06);
      this.sword.quaternion.setFromUnitVectors(AZ, this.bladeD);
    } else {
      this.sword.position.copy(this.sheath.position).addScaledVector(sd, -0.07);
      this.sword.quaternion.copy(this.sheath.quaternion);
    }
    // Schwungspur
    const at = this.atk;
    const trailOn = this.state === 'attack' && at.t > at.a.act[0] - 0.05 && at.t < at.a.act[1] + 0.05;
    vC.copy(this.sword.position).addScaledVector(this.bladeD, 0.25);
    vB.copy(this.sword.position).addScaledVector(this.bladeD, BLADE_L + 0.015);
    this.trail.update(vC, vB, trailOn, at && at.a.heavy);

    // 4b) Karte in der rechten Hand: taucht beim Ziehen aus dem Mantel auf, verschwindet beim Loslassen
    const show = this.state === 'throw' && this.t > 0.2 && !this.released;
    this.handCard.visible = show;
    if (show) {
      R.RightForeArm.getWorldPosition(vC);
      R.RightHand.getWorldPosition(vB);
      vA.subVectors(vB, vC).normalize();
      this.handCard.position.copy(vB).addScaledVector(vA, 0.1);
      this.handCard.lookAt(vC.copy(this.handCard.position).add(vA));
      this.handCard.rotateZ(Math.PI / 2 - 0.3);
    }
  }
}
