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
import { buildCane, buildFist, ATTACKS, READY_POSE, READY_HAND, attackPose, Trail, BLADE_L, FIST_WRIST, GRIP_L } from './degen.js';

const MODEL_URL = 'models/magier.glb';
const WALK = 3.4, RUN = 5.8;          // m/s (Joggen, Rennen)
const LOCK_WALK = 2.5;                // erfasst: ruhigere Schritte
const ROLL_T = 0.66, ROLL_V = 8.2;    // Dauer (s), Anfangstempo (m/s)
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

// Ausfallschritt: s1 = rechter Fuß tritt vor (bis Ende Trefferfenster), s2 = linker Fuß wird nachgezogen.
// Der rechte Fuß tritt (1 + STEP_X) × lunge vor, der Körper folgt lunge im Schlag und STEP_X × lunge beim Nachziehen.
const STEP_X = 0.45;
// Fechtstellung beim Angriff (Meter, Körper: x links, z vorn): linker Fuß [x, z], rechter Fuß [x, z] – rechts etwas vorn
const STANCE = [0.12, -0.07, -0.11, 0.09];
const FLOURISH_T = 0.9; // Dauer des Degen-Kunststücks im Stehen
// Heiltrank (Y): in den Mantel greifen, Fläschchen zum Mund, trinken – langsam gehen geht, angreifen/rollen nicht
const HEAL_T = 1.35, HEAL_AT = 0.78, HEAL_HP = 45, POTIONS = 3, EMPTY_T = 0.75;
const WRIST_WALK = 0.95, WRIST_RUN = 2.0; // Winkel Klinge ↔ Unterarm beim Tragen (Gehen: nach vorn, Rennen: nach hinten)
function stepK(A, t) {
  const a0 = A.act[0] - 0.1, a1 = A.act[1], b0 = A.act[1] + 0.04, b1 = A.T - 0.04;
  return { s1: smooth((t - a0) / (a1 - a0)), s2: smooth((t - b0) / (b1 - b0)) };
}

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
const vD = new THREE.Vector3(), vE = new THREE.Vector3(), qT = new THREE.Quaternion(), mT = new THREE.Matrix4();
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

/**
 * Bein auf einen Fußpunkt (Welt) ausrichten: Zwei-Knochen-Lösung, Knie zeigt nach vorn.
 * Ist der Punkt zu weit weg, rutscht er waagerecht zur Hüfte (Bein ganz gestreckt).
 */
const vH = new THREE.Vector3(), vK = new THREE.Vector3(), vF = new THREE.Vector3(), vT = new THREE.Vector3(), vP = new THREE.Vector3();
const qInv = new THREE.Quaternion(), vS = new THREE.Vector3();
/** Richtung a → b mischen (b = 0..1), Ergebnis in a */
function mixDir(a, from, b) { for (let i = 0; i < 3; i++) a[i] = from[i] + (a[i] - from[i]) * b; const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; }
function legIK(up, low, foot, target, w) {
  if (w <= 0.001) return;
  up.updateWorldMatrix(true, true);
  up.getWorldPosition(vH); low.getWorldPosition(vK); foot.getWorldPosition(vF);
  const a = vH.distanceTo(vK), b = vK.distanceTo(vF);
  vT.copy(target);
  if (vT.y < vF.y - 0.05) vT.y = vF.y - 0.05;
  let d = vT.distanceTo(vH);
  const max = (a + b) * 0.995;
  if (d > max) { // waagerecht zur Hüfte ziehen
    const dy = vT.y - vH.y, hx = vT.x - vH.x, hz = vT.z - vH.z, hl = Math.hypot(hx, hz);
    const nh = Math.sqrt(Math.max(0, max * max - dy * dy));
    if (hl > 1e-4) { vT.x = vH.x + hx / hl * nh; vT.z = vH.z + hz / hl * nh; }
    d = vT.distanceTo(vH);
  }
  const u = vP.subVectors(vT, vH).normalize();
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const pole = bodyDir(0, 0.15, 1, vA); pole.addScaledVector(u, -pole.dot(u)).normalize();
  const knee = vK.copy(vH).addScaledVector(u, a * cosA).addScaledVector(pole, a * Math.sqrt(1 - cosA * cosA));
  aim(up, low, vB.subVectors(knee, vH).normalize(), w);
  up.updateWorldMatrix(false, true);
  low.getWorldPosition(vK);
  aim(low, foot, vB.subVectors(vT, vK).normalize(), w);
}

/**
 * Arm als Zwei-Knochen-Kette: Schulter S → Ziel T (Welt), Ellbogen zeigt Richtung pole (Welt).
 * Liefert die Richtungen von Ober- und Unterarm (Welt) in outA/outB. Zu weit weg → Arm gestreckt in Richtung Ziel.
 */
const vI1 = new THREE.Vector3(), vI2 = new THREE.Vector3(), vI3 = new THREE.Vector3(), vI4 = new THREE.Vector3();
function armIK(S, T, a, b, pole, outA, outB) {
  const dir = vI1.subVectors(T, S); let d = dir.length(); dir.multiplyScalar(1 / (d || 1));
  d = Math.min(Math.max(d, Math.abs(a - b) + 0.01), (a + b) * 0.995);
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  const pl = vI2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (pl.lengthSq() < 1e-6) pl.set(0, -1, 0).addScaledVector(dir, dir.y);
  pl.normalize();
  const E = vI3.copy(S).addScaledVector(dir, x).addScaledVector(pl, h);
  outA.subVectors(E, S).normalize();
  outB.copy(S).addScaledVector(dir, d).sub(E).normalize();
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
    this.potions = POTIONS; this.maxPotions = POTIONS; this.onHeal = null;
    // Werte aus dem Stufen-System (stufe.js): Schaden, Ausdauerkosten – setzt main.js über applyStats
    this.mods = { light: 1, heavy: 1, poise: 1, roll: 1, atkCost: 1, cardCost: 1 };
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
  /** Werte aus dem Stufen-System übernehmen (mehr Leben/Ausdauer kommen sofort dazu) */
  applyStats(m) {
    const dh = m.maxHp - this.maxHp, ds = m.maxSt - this.maxSt;
    this.maxHp = m.maxHp; this.maxSt = m.maxSt;
    this.hp = Math.max(1, Math.min(this.maxHp, this.hp + Math.max(0, dh))); this.st = Math.min(this.maxSt, this.st + Math.max(0, ds));
    this.mods = m;
  }
  /** am Rastpunkt wieder aufstehen */
  revive(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.vel.set(0, 0);
    this.hp = this.maxHp; this.st = this.maxSt; this.exhausted = false; this.state = 'idle'; this.t = 0; this.atk = null; this.iframe = 1;
    this.potions = this.maxPotions;
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
    this.sheath = cane.sheath; this.sword = cane.sword; this.fist = cane.fist;
    this.root.parent.add(this.sheath);
    this.root.parent.add(this.sword);
    this.pose = { arm: [0, 0, 0], fore: [0, 0, 0], blade: [0, 0, 1], tw: 0, ln: 0, w: 0 };
    // Armlängen (für die Arm-Lösung) und Handlage der Grundhaltung
    model.updateMatrixWorld(true);
    const len = (a, b) => a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
    this.arm = { aR: len(B.RightArm, B.RightForeArm), bR: len(B.RightForeArm, B.RightHand), aL: len(B.LeftArm, B.LeftForeArm), bL: len(B.LeftForeArm, B.LeftHand) };
    { const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); }, I = READY_POSE, ar = n(I.arm), bl = n(I.blade);
      let fo = n(I.fore); const d = fo[0] * bl[0] + fo[1] * bl[1] + fo[2] * bl[2]; fo = n(fo.map((x, i) => x - 0.8 * d * bl[i]));
      for (let i = 0; i < 3; i++) READY_HAND[i] = ar[i] * this.arm.aR + fo[i] * this.arm.bR; }
    // Heiltrank: kleines bauchiges Fläschchen mit warm glühender Glut-Essenz
    this.flask = new THREE.Group();
    const glass = new THREE.MeshToonMaterial({ color: 0x9fb4c0, transparent: true, opacity: 0.45, gradientMap: GRADIENT });
    const ess = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 0.25), toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), glass); this.flask.add(bulb);
    const liq = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), ess); liq.position.y = -0.006; this.flask.add(liq);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.05, 10), glass); neck.position.y = 0.06; this.flask.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.02, 10), toon(0x6a4628)); cork.position.y = 0.092; this.flask.add(cork);
    this.flask.visible = false; this.root.parent.add(this.flask);
    // linke Faust (beidhändiger Griff beim schweren Schlag): gespiegelte Faust am Griff unter der rechten
    this.fistL = buildFist(); this.fistL.scale.set(1, -1, 1); this.fistL.visible = false; this.root.parent.add(this.fistL);
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
    let { run, roll, card: thr, light, heavy, heal } = c || {};
    this.t += dt; this.time += dt;
    const ml = Math.hypot(mv.x, mv.z);

    // Ausdauer
    if (this.stDelay > 0) this.stDelay -= dt;
    else if (this.state !== 'roll') this.st = Math.min(this.maxSt, this.st + 38 * dt);
    if (this.exhausted && this.st > 30) this.exhausted = false;

    if (this.state === 'hurt' || this.state === 'dead') { light = heavy = thr = roll = heal = false; }
    // ---------- Heiltrank ----------
    if (this.state === 'heal') {
      light = heavy = thr = roll = false;
      if (!this.healEmpty && !this.healed && this.t >= HEAL_AT) {
        this.healed = true; this.potions--; this.hp = Math.min(this.maxHp, this.hp + HEAL_HP);
        if (this.onHeal) this.onHeal(this.pos);
      }
      if (this.t >= (this.healEmpty ? EMPTY_T : HEAL_T)) { this.state = 'idle'; this.t = 0; }
    }
    if (heal && this.state === 'idle') { this.state = 'heal'; this.t = 0; this.healed = false; this.healEmpty = this.potions <= 0; if (this.onDrink) this.onDrink(this.healEmpty); }
    // ---------- Degen-Angriffe ----------
    if (this.state === 'attack') {
      const A = this.atk.a;
      if ((light || heavy) && this.atk.t > A.act[0]) this.atk.queued = heavy ? 'h' : (A.next || 'l1');
      if (roll && this.atk.t > A.act[1] + 0.04) { this.state = 'idle'; this.atk = null; }
      else if (thr && this.atk.t > A.act[1]) { this.state = 'idle'; this.atk = null; }
      // Kombo fließend: der nächste Schlag beginnt schon aus dem Nachschwingen heraus (nicht erst zurück in die Grundhaltung)
      // Laufen bricht das späte Nachschwingen ab
      else if ((this.atk.queued && this.atk.t >= A.act[1] + (A.heavy ? 0.2 : 0.11))
        || this.atk.t >= A.T
        || (!this.atk.queued && this.atk.t > A.act[1] + 0.2 && Math.hypot(mv.x, mv.z) > 0.5)) {
        const q = this.atk.queued, prevAtk = this.atk; this.state = 'idle'; this.atk = null;
        // Kombo: vorgemerkter Schlag folgt sofort; sonst kurzes Fenster für den nächsten Kombo-Schlag
        if (q && this.st > 0 && !this.exhausted) { this.startAttack(q, mv, lockTarget, prevAtk); light = heavy = false; }
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
      this.st -= THROW_COST * this.mods.cardCost; this.stDelay = 0.7; if (this.st <= 0) { this.st = 0; this.exhausted = true; }
      roll = false;
    }
    if (this.state === 'idle') {
      if (roll && this.st > 0 && !this.exhausted) {
        this.state = 'roll'; this.t = 0; this.rollDust = 0; this.rollSide = Math.random() < 0.5 ? 1 : -1;
        this.st -= ROLL_COST * this.mods.roll; this.stDelay = 0.6; if (this.st <= 0) { this.st = 0; this.exhausted = true; }
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
      // genau so weit wie der Fuß vortritt (gleiche Kurve wie in animateRig), sonst rutschen die Füße
      const k = stepK(A, at.t);
      if (at.t >= A.act[0] - 0.1 && !at.p0) at.p0 = { x: this.pos.x, z: this.pos.z, fx: Math.sin(this.yaw), fz: Math.cos(this.yaw) };
      if (at.p0 && dt > 0) {
        const s = (k.s1 + STEP_X * k.s2) * A.lunge; // Ausfallschritt, beim Nachziehen noch ein Stück
        this.vel.set((at.p0.x + at.p0.fx * s - this.pos.x) / dt, (at.p0.z + at.p0.fz * s - this.pos.z) / dt);
      } else this.vel.multiplyScalar(Math.exp(-14 * dt));
      // Ausrichten nur am Anfang (zum Ziel oder in Stick-Richtung)
      if (at.t < A.act[0] && at.face !== null) this.yaw += angDiff(this.yaw, at.face) * damp(25, dt);
      if (lockTarget && at.t < A.act[0]) at.face = Math.atan2(lockTarget.x - this.pos.x, lockTarget.z - this.pos.z);
      // Schwung-Geräusch kurz vor dem Treffer-Moment
      if (!at.swung && at.t >= A.act[0] - 0.06) { at.swung = true; if (this.onSwing) this.onSwing(A.heavy); }
      // schwerer Schlag: Klinge schlägt auf den Boden – Staub an der Spitze, Rütteln
      if (A.slam && !at.slammed && at.t >= A.slam && this.sword) {
        at.slammed = true;
        const tip = this.sword.localToWorld(new THREE.Vector3(0, 0, BLADE_L)); tip.y = 0.05;
        if (this.onDust) this.onDust(tip, 16);
        if (this.onSlam) this.onSlam(tip);
      }
      // Treffer prüfen
      if (at.t >= A.act[0] && at.t <= A.act[1]) for (const tg of this.targets) {
        if (at.hit.has(tg) || tg.dead) continue;
        const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d - (tg.radius || 0) > A.range + 0.3) continue; // große Gegner: Reichweite bis zur Körperoberfläche
        if (Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > A.arc && d > 0.6) continue;
        at.hit.add(tg);
        this.hitStop = A.heavy ? 0.1 : 0.05;
        if (this.onHit) this.onHit(tg, new THREE.Vector3(dx, 0, dz).normalize(), A.heavy, Math.round(A.dmg * (A.heavy ? this.mods.heavy : this.mods.light)), A.poise * this.mods.poise);
      }
      this.running = false;
    } else if (this.state === 'roll') {
      const k = this.t / ROLL_T;
      // Abstoßen (schnell), Rolle (hält Tempo), Aufstehen (bremst ab)
      const sp = ROLL_V * (k < 0.12 ? 0.7 + k * 2.5 : k < 0.62 ? 1 - (k - 0.12) * 0.5 : 0.75 * Math.max(0, 1 - (k - 0.62) / 0.38));
      if (!this.rollDust && k > 0.16) { this.rollDust = 1; if (this.onDust) this.onDust(this.pos, 6); }
      if (this.rollDust === 1 && k > 0.62) { this.rollDust = 2; if (this.onDust) this.onDust(this.pos, 9); }
      this.vel.set(this.rollDir.x * sp, this.rollDir.y * sp);
      this.yaw += angDiff(this.yaw, Math.atan2(this.rollDir.x, this.rollDir.y)) * damp(30, dt);
      if (this.t >= ROLL_T) { this.state = 'idle'; this.t = 0; }
      this.running = false;
    } else {
      const running = run && ml > 0.3 && !this.exhausted && this.st > 0;
      if (running) { this.st -= RUN_COST * dt; this.stDelay = 0.5; if (this.st <= 0) { this.st = 0; this.exhausted = true; } }
      const throwing = this.state === 'throw', healing = this.state === 'heal';
      const spd = (running && !throwing && !healing ? RUN : lockTarget || throwing || healing ? LOCK_WALK : WALK) * Math.min(1, ml) * (throwing ? 0.5 : healing ? 0.4 : 1);
      this.vel.x = lerp(this.vel.x, mv.x * spd, damp(12, dt));
      this.vel.y = lerp(this.vel.y, mv.z * spd, damp(12, dt));
      let want = null;
      if (lockTarget && (!running || throwing)) want = Math.atan2(lockTarget.x - this.pos.x, lockTarget.z - this.pos.z);
      else if (throwing && aimDir && this.t < RELEASE) want = Math.atan2(aimDir.x, aimDir.z); // ohne Ziel: in Blickrichtung der Kamera
      else if (ml > 0.1) want = Math.atan2(mv.x, mv.z);
      if (want !== null) this.yaw += angDiff(this.yaw, want) * damp(throwing ? 22 : running ? 10 : 13, dt);
      this.running = running && !throwing;
    }

    this.yawRate = dt > 0 ? angDiff(this.prevYaw ?? this.yaw, this.yaw) / dt : 0; this.prevYaw = this.yaw;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    resolve(this.pos, RADIUS);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (this.rig) this.animateRig(dt); else this.animateSimple(dt);
  }

  startAttack(k, mv, lockTarget, prevAtk) {
    const A = ATTACKS[k];
    // Kombo aus einem laufenden Ausfallschritt: wo die Füße gerade stehen, merken (sonst springen sie)
    // Füße: wo sie gerade stehen (davon aus treten sie in die Fechtstellung, auch aus dem Gehen oder aus der Kombo)
    let pre = null;
    if (this.rig) {
      pre = { L: new THREE.Vector3(), R: new THREE.Vector3() };
      this.model.updateMatrixWorld(true);
      this.rig.LeftFoot.getWorldPosition(pre.L); this.rig.RightFoot.getWorldPosition(pre.R);
    }
    // Haltung im Moment des Starts merken: der neue Schlag fließt aus ihr heraus (Kombo: direkt aus dem Nachschwingen ins Ausholen)
    const P0 = this.pose, wasAtk = this.state === 'attack';
    const from = { arm: P0.arm.slice(), fore: P0.fore.slice(), blade: this.bladeB ? this.bladeB.toArray() : P0.blade.slice(),
      la: wasAtk && P0.la ? P0.la.slice() : null, lf: wasAtk && P0.lf ? P0.lf.slice() : null,
      tw: P0.tw || 0, ln: P0.ln || 0, twLead: P0.twLead || 0, twMid: P0.twMid || 0, w: this.lastW || 0, wl: wasAtk ? this.lastW || 0 : 0,
      hip: wasAtk ? P0.hip || 0 : 0, cr: wasAtk ? P0.cr || 0 : 0, sh: wasAtk ? P0.sh || 0 : 0, th: wasAtk ? P0.th || 0 : 0,
      T: wasAtk ? Math.min(0.16, A.keys[1].t * 0.9) : 0.1 };
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
    this.atk = { k, a: A, t: 0, hit: new Set(), queued: null, face, pre, from };
    this.st -= A.cost * this.mods.atkCost; this.stDelay = 0.8; if (this.st <= 0) { this.st = 0; this.exhausted = true; }
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

    // Angriff: Haltung schon hier bestimmen – in die Knie gehen und Gewicht verlagern wirken auf den ganzen Körper.
    // Beim Start blendet sie aus der Haltung des vorigen Schlags heraus (Kombo ohne Umweg über die Grundhaltung).
    const atP = this.state === 'attack' ? this.atk : null;
    let aW = 0, aWl = 1, aB = 1;
    if (atP) {
      const P = this.pose;
      attackPose(atP.a, atP.t, P); aW = smooth(atP.t / 0.06);
      const F = atP.from;
      if (F && atP.t < F.T) {
        aB = smooth(atP.t / F.T);
        for (const k of ['tw', 'ln', 'twLead', 'twMid', 'hip', 'cr', 'sh', 'th']) P[k] = lerp(F[k] || 0, P[k], aB);
        aW = lerp(F.w, 1, aB); aWl = lerp(F.wl, 1, aB);
      }
    }
    // 2) Ganzer Körper: Rolle
    let rx = 0, y = CENTER, tuck = 0, rz = 0, dive = 0, rec = 0;
    if (rolling) {
      // Rolle wie in Souls-Spielen: abtauchen (Hände voraus), über die Schulter abrollen, aus der Hocke aufstehen
      const k = this.t / ROLL_T;
      const kr = clamp((k - 0.12) / 0.5, 0, 1), er = kr * kr * (3 - 2 * kr);
      rx = k < 0.12 ? 0.55 * smooth(k / 0.12) : 0.55 + (TAU - 0.55) * er;
      dive = smooth(k / 0.1) * (1 - smooth((k - 0.14) / 0.1));
      tuck = smooth((k - 0.08) / 0.12) * (1 - smooth((k - 0.56) / 0.12));
      rec = smooth((k - 0.56) / 0.1) * (1 - smooth((k - 0.76) / 0.24));
      rz = 0.38 * Math.sin(kr * Math.PI) * (this.rollSide || 1);          // schräge Rollachse (Schulterrolle)
      y = CENTER - 0.26 * dive - 0.47 * tuck - 0.32 * rec;
    }
    // Kurvenlage und Gewichtsverlagerung beim Anlaufen/Bremsen (nicht beim Rollen/Angreifen)
    const free = !rolling && this.state !== 'attack' && this.state !== 'dead';
    const fwdV = this.vel.x * Math.sin(this.yaw) + this.vel.y * Math.cos(this.yaw);
    const acc = dt > 0 ? (fwdV - (this.prevFwd || 0)) / dt : 0; this.prevFwd = fwdV;
    this.accLean = lerp(this.accLean || 0, free ? clamp(acc * 0.03, -0.2, 0.22) : 0, damp(6, dt));
    this.bank = lerp(this.bank || 0, free ? clamp(-(this.yawRate || 0) * sp * 0.035, -0.2, 0.2) : 0, damp(7, dt));
    if (!rolling) rz = this.bank;
    // Ausfallschritt: Fortschritt Vortreten (s1) und Nachziehen (s2), Hüfte geht dabei runter
    let s1 = 0, s2 = 0;
    const at = this.state === 'attack' ? this.atk : null;
    if (at) {
      const A = at.a; ({ s1, s2 } = stepK(A, at.t));
      y -= (A.drop || 0) * Math.sin(Math.min(1, s1) * Math.PI / 2) * (1 - s2) + this.pose.cr * aW;
    }
    let hurtK = 0;
    if (this.state === 'hurt') { hurtK = Math.sin(clamp(this.t / 0.42, 0, 1) * Math.PI); rx = -0.18 * hurtK; }
    if (this.state === 'dead') { const f = smooth(this.t / 0.9); rx = -f * 1.45; y = lerp(CENTER, 0.3, f); hurtK = 1 - f; }
    this.pivot.rotation.order = 'ZXY'; // Rollachse wird erst geneigt, dann gedreht
    this.pivot.rotation.x = rx; this.pivot.rotation.z = rz;
    this.pivot.position.y = y;
    this.pivot.position.z = at ? this.pose.sh * aW : 0;                 // Gewicht vor/zurück (Füße bleiben stehen)
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
    // Ruhe: tiefer atmen, Gewicht langsam verlagern, ab und zu umschauen und den Degen wirbeln
    const idle = still > 0.9 && this.state === 'idle' && !this.locked;
    this.idleT = idle ? (this.idleT || 0) + dt : 0;
    if (idle && this.idleT > (this.lookNext || 3)) { this.lookNext = this.idleT + 2.5 + Math.random() * 3; this.lookTo = Math.random() < 0.3 ? 0 : (Math.random() - 0.5) * 1.3; }
    if (!idle) this.lookTo = 0;
    this.lookA = lerp(this.lookA || 0, this.lookTo || 0, damp(2.5, dt));
    bend(R.Neck, AY, this.lookA * 0.6); bend(R.Head, AY, this.lookA * 0.4);
    if (idle && this.idleT > (this.flourishNext || 7) && !(this.flourish > 0)) { this.flourish = FLOURISH_T; this.flourishNext = this.idleT + 7 + Math.random() * 6; }
    this.flourish = Math.max(0, (this.flourish || 0) - dt);
    if (this.state !== 'idle') this.flourish = 0;
    bend(R.Spine, AZ, Math.sin(t * 0.55) * 0.035 * still); bend(R.Spine2, AZ, -Math.sin(t * 0.55) * 0.025 * still);
    bend(R.Spine2, AX, Math.sin(t * 1.8 + 0.4) * 0.02 * still);
    // Gewicht nach vorn beim Anlaufen, nach hinten beim Bremsen
    bend(R.Spine, AX, this.accLean * 0.5); bend(R.Spine1, AX, this.accLean * 0.5);
    // Rolle: abtauchen (Kopf runter) und aus der Hocke aufrichten (Oberkörper vor)
    if (dive > 0.001) { bend(R.Spine1, AX, 0.4 * dive); bend(R.Neck, AX, 0.3 * dive); }
    if (rec > 0.001) { bend(R.Spine, AX, 0.25 * rec); bend(R.Spine1, AX, 0.3 * rec); bend(R.Neck, AX, -0.25 * rec); }
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
    // Heiltrank: linke Hand holt das Fläschchen aus dem Mantel (Gürtel), führt es zum Mund, Kopf in den Nacken – leer: Kopfschütteln
    this.flask.visible = false;
    if (this.state === 'heal') {
      const tt = this.t, T = this.healEmpty ? EMPTY_T : HEAL_T;
      const w = smooth(tt / 0.16) * (1 - smooth((tt - (T - 0.22)) / 0.22));
      const up = this.healEmpty ? 0 : smooth((tt - 0.24) / 0.3) * (1 - smooth((tt - 1.0) / 0.25));
      const drink = this.healEmpty ? 0 : smooth((tt - 0.5) / 0.16) * (1 - smooth((tt - 0.92) / 0.14));
      R.Head.updateWorldMatrix(true, false); R.Head.getWorldPosition(vC);
      const mouth = vC.add(vD.set(0, 0.05, 0.13).applyQuaternion(qBody));
      const belt = vE.set(0.2, 0.98, 0.16).applyQuaternion(qBody).add(this.root.position); belt.y += this.pivot.position.y - CENTER;
      const tgt = vF.copy(belt).lerp(vT.copy(mouth).add(vP.set(-0.01, -0.1, 0.04).applyQuaternion(qBody)), up);
      R.LeftArm.updateWorldMatrix(true, false); R.LeftArm.getWorldPosition(vB);
      armIK(vB, tgt, this.arm.aL, this.arm.bL, bodyDir(0.6, -0.8, 0.05, vP), vH, vK);   // Ellbogen unten, vor der Brust
      aim(R.LeftArm, R.LeftForeArm, vH, w); aim(R.LeftForeArm, R.LeftHand, vK, w);
      bend(R.Neck, AX, -0.3 * drink); bend(R.Head, AX, -0.25 * drink);
      if (this.healEmpty) bend(R.Head, AY, Math.sin(tt * 18) * 0.18 * smooth((tt - 0.25) / 0.1) * (1 - smooth((tt - 0.6) / 0.12)));
      this.flaskOn = !this.healEmpty && tt > 0.16 && tt < T - 0.12;
    } else this.flaskOn = false;
    // Stockdegen: Angriff (Schlüsselhaltungen) oder gezogene Klinge in Bereitschaft
    let bladeOn = false;
    if (this.state === 'attack' || (this.drawn && this.state !== 'throw')) {
      const P = this.pose;
      let w, wl = 1;
      if (this.state === 'attack') { w = aW; wl = aWl; }
      else {
        // Stehen: Bereitschaftshaltung. Gehen/Rennen: der Arm schwingt natürlich aus der Lauf-Animation (gegengleich zum
        // rechten Bein), die Klinge liegt fest in der Hand und folgt dem Unterarm (wird nach dem Glätten gesetzt, Abschnitt 4).
        const mw = this.walkW;
        this.runPose = lerp(this.runPose || 0, this.running ? 1 : 0, damp(6, dt));
        this.carry = { ik: 1 - mw, wk: mw, rk: 0 }; // Rennen hält die Waffe wie beim Gehen (der Arm schwingt nur schneller)
        const br = Math.sin(t * 1.8) * 0.03, I = READY_POSE;
        P.arm = I.arm.slice(); P.fore = I.fore.slice(); P.blade = [I.blade[0], I.blade[1] + br, I.blade[2]];
        if (this.flourish > 0) P.arm[1] += 0.3 * Math.sin(Math.PI * (1 - this.flourish / FLOURISH_T));
        P.tw = 0; P.ln = 0; P.twLead = 0; P.twMid = 0; w = (1 - tuck) * this.carry.ik;
        // beim Gehen den Ellbogen leicht beugen (wer etwas trägt, lässt den Arm nicht ganz hängen)
        aim(R.RightForeArm, R.RightHand, bodyDir(-0.1, -0.8, 0.5, vB), (1 - tuck) * this.carry.wk * 0.45 * (1 - this.runPose));
        // beim Rennen etwas vom Körper weg halten, damit Klinge und Arm frei schwingen
        aim(R.RightArm, R.RightForeArm, bodyDir(-0.38, -0.9, 0.12 + 0.3 * Math.sin(this.phase * TAU), vB), (1 - tuck) * mw * this.runPose * 0.5);
      }
      // Peitsche: Hüfte/untere Wirbelsäule drehen zuerst, Schultern folgen
      const twL = P.twLead ?? P.tw, twM = P.twMid ?? P.tw;
      if (this.state === 'attack') bend(R.Hips, AY, (P.hip || 0) * w);   // Hüfte dreht mit (Füße bleiben per IK stehen)
      bend(R.Spine, AY, twL * 0.25 * w); bend(R.Spine1, AY, twM * 0.4 * w); bend(R.Spine2, AY, P.tw * 0.4 * w);
      bend(R.Spine1, AX, P.ln * 0.5 * w); bend(R.Spine2, AX, P.ln * 0.4 * w);
      if (this.state === 'attack') {
        // Schulterblatt hebt sich, wenn die Hand hoch geht (sonst knickt die Schulter beim Ausholen über den Kopf)
        const up = clamp((P.hand[1] + 0.02) / 0.32, 0, 1);
        bend(R.RightShoulder, AZ, -0.32 * up * w);
        if (P.th > 0.01) bend(R.LeftShoulder, AZ, 0.28 * up * P.th * w);
        // rechter Arm: Hand an die Schlüssel-Lage, Ellbogen nach el (Zwei-Knochen-Lösung)
        R.RightArm.updateWorldMatrix(true, false); R.RightArm.getWorldPosition(vC);
        vD.set(P.hand[0], P.hand[1], P.hand[2]).applyQuaternion(qBody).add(vC);
        armIK(vC, vD, this.arm.aR, this.arm.bR, bodyDir(P.el[0], P.el[1], P.el[2], vE), vH, vK);
        qInv.copy(qBody).invert();
        vH.applyQuaternion(qInv); vK.applyQuaternion(qInv);
        P.arm = [vH.x, vH.y, vH.z]; P.fore = [vK.x, vK.y, vK.z];
        const F = this.atk.from;
        if (F && aB < 1) { mixDir(P.arm, F.arm, aB); mixDir(P.fore, F.fore, aB); mixDir(P.blade, F.blade, aB); if (F.la) { mixDir(P.la, F.la, aB); mixDir(P.lf, F.lf, aB); } }
        aim(R.RightArm, R.RightForeArm, bodyDir(P.arm[0], P.arm[1], P.arm[2], vB), w);
        aim(R.RightForeArm, R.RightHand, bodyDir(P.fore[0], P.fore[1], P.fore[2], vB), w);
        bodyDir(P.blade[0], P.blade[1], P.blade[2], this.bladeD);
        // linker Arm hält das Gleichgewicht (schwingt gegen die Klinge) – beidhändig greift er stattdessen den Griff (Abschnitt 4)
        const wL = wl * (1 - P.th);
        aim(R.LeftArm, R.LeftForeArm, bodyDir(P.la[0], P.la[1], P.la[2], vB), wL);
        aim(R.LeftForeArm, R.LeftHand, bodyDir(P.lf[0], P.lf[1], P.lf[2], vB), wL);
        // Kopf bleibt beim Gegner
        bend(R.Neck, AY, -P.tw * 0.55 * w); bend(R.Head, AY, -(P.tw * 0.25 + (P.hip || 0) * 0.5) * w);
        bend(R.Neck, AX, -P.ln * 0.4 * w);
      } else {
        aim(R.RightArm, R.RightForeArm, bodyDir(P.arm[0], P.arm[1], P.arm[2], vB), w);
        // Faustgriff: der Griff liegt quer in der Hand → Unterarm etwa senkrecht zur Klinge
        bodyDir(P.blade[0], P.blade[1], P.blade[2], this.bladeD);
        const fo = bodyDir(P.fore[0], P.fore[1], P.fore[2], vB);
        fo.addScaledVector(this.bladeD, -0.8 * fo.dot(this.bladeD)).normalize();
        aim(R.RightForeArm, R.RightHand, fo, w);
      }
      bladeOn = true; this.lastW = w;
    }
    if (!bladeOn) this.lastW = 0;
    // Hüfte und Knie leicht gebeugt beim Stehen (wirkt kampfbereit)
    if (still > 0.01) {
      bend(R.Hips, AX, 0); // Hüfte bleibt
      bend(R.LeftUpLeg, AX, -0.08 * still); bend(R.RightUpLeg, AX, -0.08 * still);
      bend(R.LeftLeg, AX, 0.14 * still); bend(R.RightLeg, AX, 0.14 * still);
      bend(R.LeftUpLeg, AZ, -0.05 * still); bend(R.RightUpLeg, AZ, 0.05 * still);
    }
    // 3b) Weich nachführen: jede Knochendrehung läuft der berechneten Haltung ganz leicht hinterher.
    //     Das glättet alle Übergänge (Laufen ↔ Schlag ↔ Kombo ↔ Treffer), ohne die Bewegung träge zu machen.
    //     Vor der Bein-IK, damit die Füße beim Ausfallschritt trotzdem genau stehen.
    if (!this.smQ || this.smQ.length !== bones.length) this.smQ = bones.map((b) => b.quaternion.clone());
    const kq = dt > 0 ? damp(rolling ? 45 : this.state === 'attack' ? 34 : 18, dt) : 1;
    for (let i = 0; i < bones.length; i++) { this.smQ[i].slerp(bones[i].quaternion, kq); bones[i].quaternion.copy(this.smQ[i]); }
    this.model.updateMatrixWorld(true);

    // Füße beim Angriff fest auf dem Boden: erst in die Fechtstellung treten (rechts vorn), dann tritt der rechte Fuß
    // zum Ausfallschritt vor, der linke bleibt stehen und wird nachgezogen. Hüfte, Knie und Gewicht dürfen sich dabei frei bewegen.
    if (at && at.pre) {
      const A = at.a, a0 = A.act[0] - 0.1;
      R.LeftFoot.getWorldPosition(vC); R.RightFoot.getWorldPosition(vD); // natürliche Lage (für das Ende des Angriffs)
      if (!at.N || at.t < a0) { // Fechtstellung relativ zur Figur (folgt dem Ausrichten, bis der Schritt beginnt)
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw), fy = Math.min(at.pre.L.y, at.pre.R.y);
        if (!at.N) at.N = { L: new THREE.Vector3(), R: new THREE.Vector3() };
        at.N.L.set(this.pos.x + lx * STANCE[0] + fx * STANCE[1], fy, this.pos.z + lz * STANCE[0] + fz * STANCE[1]);
        at.N.R.set(this.pos.x + lx * STANCE[2] + fx * STANCE[3], fy, this.pos.z + lz * STANCE[2] + fz * STANCE[3]);
        at.fwd = new THREE.Vector3(fx, 0, fz);
      }
      const g = smooth(at.t / Math.max(0.08, Math.min(0.2, a0)));
      const lift = (p, q) => (p.distanceTo(q) > 0.04 ? Math.sin(g * Math.PI) * 0.07 : 0);
      const bL = vT.copy(at.pre.L).lerp(at.N.L, g); bL.y += lift(at.pre.L, at.N.L);
      const bR = vP.copy(at.pre.R).lerp(at.N.R, g); bR.y += lift(at.pre.R, at.N.R);
      const tR = vE.copy(bR).addScaledVector(at.fwd, A.lunge * (1 + STEP_X) * s1); tR.y += Math.sin(s1 * Math.PI) * 0.13;
      tR.lerp(vD, s2);
      const tL = vF.copy(bL).lerp(vC, s2); tL.y += Math.sin(s2 * Math.PI) * 0.1;
      const w = 1 - smooth((at.t - (A.T - 0.06)) / 0.06);
      const tR2 = tR.clone(), tL2 = tL.clone();
      legIK(R.RightUpLeg, R.RightLeg, R.RightFoot, tR2, w);
      legIK(R.LeftUpLeg, R.LeftLeg, R.LeftFoot, tL2, w);
    }
    // Rolle: Hände voraus beim Abtauchen, Hocke mit ausgebreiteten Armen beim Aufstehen
    if (dive > 0.001) {
      aim(R.LeftArm, R.LeftForeArm, bodyDir(0.3, -0.75, 0.6, vB), dive); aim(R.LeftForeArm, R.LeftHand, bodyDir(0.1, -0.8, 0.6, vB), dive);
      aim(R.RightArm, R.RightForeArm, bodyDir(-0.3, -0.75, 0.6, vB), dive); aim(R.RightForeArm, R.RightHand, bodyDir(-0.1, -0.8, 0.6, vB), dive);
    }
    if (rec > 0.001) {
      for (const [U, L, F, sx] of [[R.LeftUpLeg, R.LeftLeg, R.LeftFoot, 1], [R.RightUpLeg, R.RightLeg, R.RightFoot, -1]]) {
        aim(U, L, bodyDir(sx * 0.15, -0.55, 0.8, vB), rec); aim(L, F, bodyDir(0, -1, -0.25, vB), rec);
      }
      aim(R.LeftArm, R.LeftForeArm, bodyDir(0.8, -0.5, 0.25, vB), rec * 0.8);
      aim(R.RightArm, R.RightForeArm, bodyDir(-0.8, -0.5, 0.25, vB), rec * 0.8);
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

    // 4) Stock (Scheide) hängt links am Mantel-Gürtel, Klinge in der rechten Faust (oder im Stock)
    R.Hips.getWorldPosition(vB);
    vC.set(0.19, 0.1, 0.1).applyQuaternion(qBody);                  // linke Hüfte, vorn am Gürtel
    this.sheath.position.copy(vB).add(vC);
    const ssw = Math.sin(this.phase * TAU) * this.walkW;               // pendelt beim Gehen
    const sd = bodyDir(0.14 + 0.07 * ssw, -0.74, -0.66 + 0.12 * ssw, vE); // schräg nach hinten unten
    this.sheath.quaternion.setFromUnitVectors(AZ, sd);
    // Faust: die Meshy-Hand (ohne Fingerknochen) wird ausgeblendet, eine eigene Faust umschließt den Griff.
    // Klingen-Raum: Z = Klinge, X = Richtung Unterarm → Finger; das Handgelenk der Faust sitzt am Hand-Knochen.
    R.RightHand.scale.setScalar(bladeOn ? 0.02 : 1);
    this.fist.visible = bladeOn;
    if (bladeOn) {
      R.RightForeArm.getWorldPosition(vC); R.RightHand.getWorldPosition(vB);
      vA.subVectors(vB, vC).normalize();                                     // Unterarm-Richtung
      if (this.state !== 'attack' && this.carry) {
        // Tragen: Klinge sitzt fest in der Faust – beim Gehen schräg nach vorn unten, beim Rennen nach hinten unten
        // fester Handgelenk-Winkel: die Klinge ist gegenüber dem Unterarm um WRIST_* nach vorn (Gehen) bzw. nach hinten (Rennen) gekippt
        const { ik, wk, rk } = this.carry, F = bodyDir(0, 0, 1, vF);
        const tilt = (out, toward, ang) => {
          const n = vP.copy(toward).addScaledVector(vA, -toward.dot(vA));
          if (n.lengthSq() < 1e-6) n.set(0, 1, 0).addScaledVector(vA, -vA.y);
          n.normalize();
          return out.copy(vA).multiplyScalar(Math.cos(ang)).addScaledVector(n, Math.sin(ang)).normalize();
        };
        const bw = tilt(vH, F, WRIST_WALK);
        const br2 = tilt(vK, vT.copy(F).negate().addScaledVector(bodyDir(-1, 0, 0, vE), 0.45), WRIST_RUN); // nach hinten und etwas nach außen
        this.bladeD.multiplyScalar(ik).addScaledVector(bw, wk).addScaledVector(br2, rk).normalize();
        if (this.flourish > 0) { // Kunststück: Klinge einmal um die Hand wirbeln
          const u = 1 - this.flourish / FLOURISH_T, e = u * u * (3 - 2 * u);
          this.bladeD.applyAxisAngle(vA, -TAU * e);
        }
      }
      // Klinge läuft wie die Knochen weich nach (im Körper-Raum) – keine Sprünge bei Übergängen
      qInv.copy(qBody).invert(); vS.copy(this.bladeD).applyQuaternion(qInv);
      if (!this.bladeB || dt <= 0 || !this.bladeWas) this.bladeB = vS.clone(); else this.bladeB.lerp(vS, kq).normalize();
      this.bladeD.copy(this.bladeB).applyQuaternion(qBody);
      if (this.state === 'attack') { // Handgelenk: die Klinge kann nicht zum Ellbogen zurück zeigen (höchstens 160°)
        const c = clamp(vA.dot(this.bladeD), -1, 1), ang = Math.acos(c), lim = Math.min(ang, 2.8);
        if (Math.abs(lim - ang) > 1e-3) {
          const n = vT.copy(this.bladeD).addScaledVector(vA, -c); if (n.lengthSq() < 1e-6) n.set(0, 1, 0).addScaledVector(vA, -vA.y);
          n.normalize(); this.bladeD.copy(vA).multiplyScalar(Math.cos(lim)).addScaledVector(n, Math.sin(lim));
        }
      }
      // Faust-Lage um den Griff: Unterarm-Richtung quer zur Klinge. Liegt die Klinge fast in Verlängerung des Arms (Stoß,
      // Treffer mit gestrecktem Arm), ist diese Richtung unbestimmt – dann gleitend die Lage vom letzten Bild nehmen.
      const X = vD.copy(vA).addScaledVector(this.bladeD, -vA.dot(this.bladeD));
      const xl = X.length();
      if (!this.fistX) this.fistX = new THREE.Vector3(1, 0, 0);
      const fx = vP.copy(this.fistX).addScaledVector(this.bladeD, -this.fistX.dot(this.bladeD)).normalize();
      X.normalize().lerp(fx, 1 - smooth(xl / 0.45)).normalize();
      this.fistX.copy(X);
      const Y = vE.crossVectors(this.bladeD, X);
      mT.makeBasis(X, Y, this.bladeD);
      this.sword.quaternion.setFromRotationMatrix(mT);
      this.sword.position.copy(vB).sub(vF.copy(FIST_WRIST).applyQuaternion(this.sword.quaternion));
    } else {
      this.sword.position.copy(this.sheath.position).addScaledVector(sd, -0.07);
      this.sword.quaternion.copy(this.sheath.quaternion);
    }
    this.bladeWas = bladeOn;
    // Beidhändig (schwerer Schlag): die linke Hand greift den Griff unter der rechten – linker Arm per Zwei-Knochen-Lösung,
    // die Meshy-Hand wird durch eine (gespiegelte) Faust ersetzt
    const th = this.state === 'attack' && bladeOn ? (this.pose.th || 0) * aW : 0;
    this.fistL.visible = th > 0.55;
    R.LeftHand.scale.setScalar(th > 0.55 ? 0.02 : 1);
    if (th > 0.01) {
      this.sword.updateMatrixWorld(true);
      const G = vC.set(0, 0, GRIP_L).applyMatrix4(this.sword.matrixWorld);           // Griffstelle der linken Faust
      R.LeftArm.updateWorldMatrix(true, false); R.LeftArm.getWorldPosition(vD);
      const X = vE.subVectors(G, vD); X.addScaledVector(this.bladeD, -X.dot(this.bladeD)).normalize(); // Unterarm-Richtung ⟂ Klinge
      const Y = vF.crossVectors(this.bladeD, X);
      mT.makeBasis(X, Y, this.bladeD); this.fistL.quaternion.setFromRotationMatrix(mT); this.fistL.position.copy(G);
      // Handgelenk der linken Faust: gespiegelt wie die Faust selbst
      const W = vT.copy(FIST_WRIST); W.y = -W.y; W.applyQuaternion(this.fistL.quaternion).add(G);
      // Ellbogen: unten außen; sind die Hände hoch (Ausholen über den Kopf), außen oben – die Arme rahmen den Kopf ein
      const hu = clamp((this.pose.hand[1] + 0.02) / 0.3, 0, 1);
      armIK(vD, W, this.arm.aL, this.arm.bL, bodyDir(0.8, lerp(-0.55, 0.3, hu), lerp(0.15, -0.15, hu), vP), vH, vK);
      aim(R.LeftArm, R.LeftForeArm, vH, th);
      aim(R.LeftForeArm, R.LeftHand, vK, th);
    }
    // Schwungspur
    // (at = laufender Angriff, oben gesetzt)
    const trailOn = this.state === 'attack' && at.t > at.a.act[0] - 0.05 && at.t < at.a.act[1] + 0.05;
    vC.copy(this.sword.position).addScaledVector(this.bladeD, 0.25);
    vB.copy(this.sword.position).addScaledVector(this.bladeD, BLADE_L + 0.015);
    this.trail.update(vC, vB, trailOn, at && at.a.heavy);

    // 4a) Heiltrank in der linken Hand: Hals zeigt zum Mund, beim Trinken kippt er
    if (this.flaskOn) {
      R.LeftHand.getWorldPosition(vB); R.Head.getWorldPosition(vC);
      const mouth = vC.add(vD.set(0, 0.05, 0.13).applyQuaternion(qBody));
      this.flask.position.copy(vB).add(vE.set(-0.015, 0.05, 0.06).applyQuaternion(qBody));
      const dir = vF.subVectors(mouth, this.flask.position).normalize();
      this.flask.quaternion.setFromUnitVectors(AY, dir);
      this.flask.visible = true;
    }
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
