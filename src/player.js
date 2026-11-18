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

const MODEL_URL = 'models/magier.glb';
const WALK = 3.4, RUN = 5.8;          // m/s (Joggen, Rennen)
const LOCK_WALK = 2.5;                // erfasst: ruhigere Schritte
const ROLL_T = 0.6, ROLL_V = 8.5;     // Dauer (s), Anfangstempo (m/s)
const ROLL_COST = 22, RUN_COST = 16;  // Ausdauer
const RADIUS = 0.38;
const CENTER = 0.9;                   // Drehpunkt für die Rolle (Körpermitte)

// Spielkarten-Bilder (einmal gemalt)
function canvasCard(draw) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96;
  draw(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cardTex(suit, col) {
  return canvasCard((g) => {
    g.fillStyle = '#f1e6cc'; g.fillRect(0, 0, 64, 96);
    g.strokeStyle = '#b58a3a'; g.lineWidth = 2; g.strokeRect(4, 4, 56, 88);
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 40px serif'; g.fillText(suit, 32, 50);
    g.font = 'bold 16px serif'; g.fillText(suit, 13, 14); g.fillText(suit, 51, 82);
  });
}
const CARD_BACK = canvasCard((g) => {
  g.fillStyle = '#5a0f14'; g.fillRect(0, 0, 64, 96);
  g.strokeStyle = '#d4a548'; g.lineWidth = 3; g.strokeRect(5, 5, 54, 86);
  g.lineWidth = 1.2;
  for (let i = -96; i < 96; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 96, 96); g.moveTo(i + 96, 0); g.lineTo(i, 96); g.stroke(); }
  g.fillStyle = '#d4a548'; g.beginPath(); g.arc(32, 48, 9, 0, Math.PI * 2); g.fill();
});

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
    this.state = 'idle';              // idle | roll
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

  get invulnerable() { return this.state === 'roll' && this.t > 0.05 && this.t < 0.42; }

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

    // Kartenfächer in der linken Hand: Vorderseite hell mit Zeichen, Rückseite dunkelrot mit Goldrand
    this.fan = new THREE.Group();
    const cw = 0.095, ch = 0.14;
    const front = new THREE.PlaneGeometry(cw, ch); front.translate(0, ch * 0.42, 0.0012);
    const back = new THREE.PlaneGeometry(cw, ch); back.rotateY(Math.PI); back.translate(0, ch * 0.42, -0.0012);
    const edge = new THREE.BoxGeometry(cw + 0.006, ch + 0.006, 0.0016); edge.translate(0, ch * 0.42, 0);
    const SUIT = ['♠', '♥', '♦', '♣', '♠'];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      c.add(new THREE.Mesh(front, toon(0xffffff, { map: cardTex(SUIT[i], i % 3 === 1 || i === 2 ? '#a3161a' : '#15121a') })));
      c.add(new THREE.Mesh(back, toon(0xffffff, { map: CARD_BACK })));
      c.add(new THREE.Mesh(edge, toon(0x15100c)));
      c.rotation.set(0, 0, 0.6 - i * 0.3); c.position.set((i - 2) * 0.006, 0, (2 - i) * 0.003);
      c.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      this.fan.add(c);
    }
    this.root.parent.add(this.fan);
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
   * dt; mv = Bewegung in Weltrichtung (x, z, Länge 0..1); run/roll aus der Eingabe;
   * lockTarget = erfasstes Ziel (Vector3) oder null
   */
  update(dt, mv, run, roll, lockTarget) {
    this.t += dt; this.time += dt;
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

    this.locked = !!lockTarget;
    if (this.state === 'roll') {
      const k = this.t / ROLL_T;
      const sp = ROLL_V * (k < 0.7 ? 1 - k * 0.5 : 0.65 * (1 - (k - 0.7) / 0.3));
      this.vel.set(this.rollDir.x * sp, this.rollDir.y * sp);
      this.yaw += angDiff(this.yaw, Math.atan2(this.rollDir.x, this.rollDir.y)) * damp(30, dt);
      if (this.t >= ROLL_T) { this.state = 'idle'; this.t = 0; }
      this.running = false;
    } else {
      const running = run && ml > 0.3 && !this.exhausted && this.st > 0;
      if (running) { this.st -= RUN_COST * dt; this.stDelay = 0.5; if (this.st <= 0) { this.st = 0; this.exhausted = true; } }
      const spd = (running ? RUN : lockTarget ? LOCK_WALK : WALK) * Math.min(1, ml);
      this.vel.x = lerp(this.vel.x, mv.x * spd, damp(12, dt));
      this.vel.y = lerp(this.vel.y, mv.z * spd, damp(12, dt));
      let want = null;
      if (lockTarget && !running) want = Math.atan2(lockTarget.x - this.pos.x, lockTarget.z - this.pos.z);
      else if (ml > 0.1) want = Math.atan2(mv.x, mv.z);
      if (want !== null) this.yaw += angDiff(this.yaw, want) * damp(running ? 10 : 13, dt);
      this.running = running;
    }

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    resolve(this.pos, RADIUS);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (this.rig) this.animateRig(dt); else this.animateSimple(dt);
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
    const moving = !rolling && sp > 0.25;

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
    // Stehen: Arme aus der A-Haltung locker herunter, linke Hand hält die Karten vor dem Körper
    const ak = still * (1 - tuck);
    aim(R.RightArm, R.RightForeArm, bodyDir(-0.28, -1, 0.04, vB), ak);
    aim(R.RightForeArm, R.RightHand, bodyDir(-0.1, -1, 0.3, vB), ak);
    // Linke Hand hält die Karten vor dem Bauch – auch beim Laufen (dann etwas schwächer)
    const ck = (1 - tuck) * (0.75 + 0.25 * still);
    aim(R.LeftArm, R.LeftForeArm, bodyDir(0.32, -1, 0.18, vB), ck);
    aim(R.LeftForeArm, R.LeftHand, bodyDir(-0.55, 0.38, 0.85, vB), ck);
    // Handfläche zum Körper (wie beim Kartenspielen: Blatt vor der Brust, Handrücken zum Gegner)
    palmTo(R.LeftForeArm, R.LeftHand, bodyDir(-0.35, 0.1, -1, vC), ck);
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

    // 4) Kartenfächer: vor der linken Hand, aufgefächert nach oben
    R.LeftHand.updateWorldMatrix(true, false);
    R.LeftForeArm.getWorldPosition(vC);
    R.LeftHand.getWorldPosition(vB);
    vA.subVectors(vB, vC).normalize();         // Unterarm-Richtung
    // Fächer steht in der Hand nach oben, Bildseite zum Magier (die Kamera hinter ihm sieht die Zeichen),
    // Rückseite zum Gegner. Ausrichtung am Körper – so wackelt er nicht mit jeder Fingerstellung.
    const fb = 1 - tuck;
    this.fan.position.copy(vB).addScaledVector(vA, 0.06 + 0.06 * fb);
    bodyDir(0, 0, -1, vC); this.fan.position.addScaledVector(vC, 0.035 * fb);
    this.fan.quaternion.copy(qBody);
    this.fan.rotateY(Math.PI - 0.25);
    this.fan.rotateX(0.3 - tuck * 1.2);
    this.fan.rotateZ(0.15);
    this.fan.visible = true;
  }
}
